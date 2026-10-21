import { db } from "./db";
import { randomUUID } from "node:crypto";
import { hasStaffRole, resolveGradeFromRoles } from "./config";
import { getBotStatus } from "./bot-status";

export type SyncedMember = {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  roleIds: string[];
  joinedAt: string | null;
  presentInGuild: boolean;
};

export type SyncResult = {
  inserted: number;
  updated: number;
  markedLeft: number;
  total: number;
};

const DEFAULT_GRADE = { grade: "Staff", gradeLevel: 0 };

const upsertSql = `
  INSERT INTO staff_members (id, discord_id, username, avatar_url, grade, grade_level, created_at, updated_at, guild_joined_at, left_guild_at, roles_json, last_synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  ON CONFLICT(discord_id) DO UPDATE SET
    username = excluded.username,
    avatar_url = excluded.avatar_url,
    grade = excluded.grade,
    grade_level = excluded.grade_level,
    updated_at = excluded.updated_at,
    guild_joined_at = COALESCE(staff_members.guild_joined_at, excluded.guild_joined_at),
    left_guild_at = NULL,
    roles_json = excluded.roles_json,
    last_synced_at = excluded.last_synced_at
`;

const markLeftSql = `
  UPDATE staff_members SET left_guild_at = ?, updated_at = ?, roles_json = ?, last_synced_at = ?
  WHERE discord_id = ? AND left_guild_at IS NULL
`;

/**
 * Upsert or mark-left a single member. Returns what happened.
 * Members without a staff role (or no longer in the guild) are marked left, never deleted,
 * so notes/badges/history (separate tables keyed by discord_id) are preserved.
 */
function applyMember(member: SyncedMember, now: string): "inserted" | "updated" | "left" | "skipped" {
  if (!member.presentInGuild || !hasStaffRole(member.roleIds)) {
    const info = db.prepare(markLeftSql).run(now, now, JSON.stringify(member.roleIds), now, member.discordId);
    return info.changes > 0 ? "left" : "skipped";
  }
  const { grade, gradeLevel } = resolveGradeFromRoles(member.roleIds) ?? DEFAULT_GRADE;
  const existing = db.prepare("SELECT id FROM staff_members WHERE discord_id = ?").get(member.discordId) as
    | { id: string }
    | undefined;
  db.prepare(upsertSql).run(
    existing?.id ?? randomUUID(),
    member.discordId,
    member.username,
    member.avatarUrl,
    grade,
    gradeLevel,
    now,
    now,
    member.joinedAt,
    JSON.stringify(member.roleIds),
    now
  );
  return existing ? "updated" : "inserted";
}

/**
 * Sync staff members from a full Discord guild snapshot.
 * - No duplicates (UNIQUE discord_id, INSERT ... ON CONFLICT).
 * - Members absent from the snapshot or without staff roles are marked left_guild_at.
 */
export function syncStaffMembers(members: SyncedMember[], actorDiscordId = "system"): SyncResult {
  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let markedLeft = 0;

  db.transaction(() => {
    const seen = new Set<string>();
    for (const member of members) {
      seen.add(member.discordId);
      const result = applyMember(member, now);
      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else if (result === "left") markedLeft++;
    }
    const known = db.prepare("SELECT discord_id FROM staff_members WHERE left_guild_at IS NULL").all() as { discord_id: string }[];
    for (const { discord_id } of known) {
      if (seen.has(discord_id)) continue;
      const info = db.prepare(markLeftSql).run(now, now, "[]", now, discord_id);
      if (info.changes > 0) markedLeft++;
    }
  })();

  db.prepare(
    "INSERT INTO audit_log (actor_discord_id, action, target_discord_id, details) VALUES (?, 'staff_sync', NULL, ?)"
  ).run(actorDiscordId, JSON.stringify({ inserted, updated, markedLeft, total: members.length }));

  return { inserted, updated, markedLeft, total: members.length };
}

/** Incremental update for one member (bot member events, OAuth login). Does not touch other members. */
export function upsertStaffMember(member: SyncedMember): "inserted" | "updated" | "left" | "skipped" {
  return applyMember(member, new Date().toISOString());
}

export type StaffWithStats = {
  id: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  grade: string;
  gradeLevel: number;
  guildJoinedAt: string | null;
  leftGuildAt: string | null;
  voiceSeconds: number;
  fivemSeconds: number;
  activeBadgeColor: string | null;
  notesCount: number;
  lastActivity: string | null;
  inVoice: boolean;
  inFivem: boolean;
  roleIds: string[];
  activeWarnings: number;
  lastNote: { body: string; author: string; createdAt: string } | null;
};

function parseRoles(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

// Open sessions count up to "now" so live time is visible before the session ends.
const sessionSeconds = (live: string) => `CASE WHEN ended_at IS NULL
  THEN MAX(0, CAST((julianday(@${live}) - julianday(started_at)) * 86400 AS INTEGER))
  ELSE seconds END`;

/**
 * Aggregate voice/fivem seconds + latest active badge + note count per active member.
 * Voice time comes from `voice_sessions` (written by the bot), FiveM time from
 * `activity_sessions` (written by the FiveM agent). `since` restricts sessions by start date.
 */
export function listStaffWithStats(since?: Date, until?: Date): StaffWithStats[] {
  const sinceIso = since ? since.toISOString() : null;
  const untilIso = until ? until.toISOString() : null;
  // Voice sessions are only live while the bot runs; otherwise they count up to its last heartbeat.
  const bot = getBotStatus();
  const liveVoice = bot.alive ? new Date().toISOString() : bot.heartbeatAt ?? "1970-01-01T00:00:00.000Z";
  const rows = db
    .prepare(
      `
      SELECT
        s.id, s.discord_id, s.username, s.avatar_url, s.grade, s.grade_level,
        s.guild_joined_at, s.left_guild_at,
        COALESCE(v.seconds, 0) AS voice_seconds,
        COALESCE(f.seconds, 0) AS fivem_seconds,
        (
          SELECT color FROM staff_badges b
          WHERE b.discord_id = s.discord_id AND b.status = 'active'
          ORDER BY b.created_at DESC, b.id DESC LIMIT 1
        ) AS badge_color,
        COALESCE(n.notes_count, 0) AS notes_count,
        MAX(COALESCE(v.last_start, ''), COALESCE(f.last_start, '')) AS last_activity,
        COALESCE(v.open_count, 0) AS voice_open,
        s.roles_json AS roles_json,
        ln.body AS note_body, ln.created_at AS note_at,
        COALESCE(ln.author_name, (SELECT username FROM staff_members x WHERE x.discord_id = ln.author_discord_id), ln.author_discord_id) AS note_author,
        (SELECT COUNT(*) FROM warnings w WHERE w.discord_id = s.discord_id AND w.removed_at IS NULL) AS active_warnings,
        COALESCE(f.open_count, 0) AS fivem_open
      FROM staff_members s
      LEFT JOIN (
        SELECT discord_id, SUM(${sessionSeconds("liveVoice")}) AS seconds, MAX(started_at) AS last_start,
               SUM(ended_at IS NULL) AS open_count
        FROM voice_sessions WHERE (@since IS NULL OR started_at >= @since) AND (@until IS NULL OR started_at < @until)
        GROUP BY discord_id
      ) v ON v.discord_id = s.discord_id
      LEFT JOIN (
        SELECT discord_id, SUM(${sessionSeconds("liveFivem")}) AS seconds, MAX(started_at) AS last_start,
               SUM(ended_at IS NULL) AS open_count
        FROM activity_sessions WHERE source = 'fivem' AND (@since IS NULL OR started_at >= @since) AND (@until IS NULL OR started_at < @until)
        GROUP BY discord_id
      ) f ON f.discord_id = s.discord_id
      LEFT JOIN staff_notes ln ON ln.id = (
        SELECT id FROM staff_notes WHERE discord_id = s.discord_id ORDER BY created_at DESC, id DESC LIMIT 1
      )
      LEFT JOIN (
        SELECT discord_id, COUNT(*) AS notes_count FROM staff_notes GROUP BY discord_id
      ) n ON n.discord_id = s.discord_id
      WHERE s.left_guild_at IS NULL
      ORDER BY s.grade_level DESC, s.username COLLATE NOCASE
      `
    )
    .all({ since: sinceIso, until: untilIso, liveVoice, liveFivem: new Date().toISOString() }) as {
    id: string;
    discord_id: string;
    username: string;
    avatar_url: string | null;
    grade: string;
    grade_level: number;
    guild_joined_at: string | null;
    left_guild_at: string | null;
    voice_seconds: number;
    fivem_seconds: number;
    badge_color: string | null;
    notes_count: number;
    last_activity: string;
    voice_open: number;
    fivem_open: number;
    roles_json: string;
    active_warnings: number;
    note_body: string | null;
    note_at: string | null;
    note_author: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    avatarUrl: row.avatar_url,
    grade: row.grade,
    gradeLevel: row.grade_level,
    guildJoinedAt: row.guild_joined_at,
    leftGuildAt: row.left_guild_at,
    voiceSeconds: row.voice_seconds,
    fivemSeconds: row.fivem_seconds,
    activeBadgeColor: row.badge_color,
    notesCount: row.notes_count,
    lastActivity: row.last_activity || null,
    inVoice: row.voice_open > 0 && bot.alive,
    inFivem: row.fivem_open > 0,
    roleIds: parseRoles(row.roles_json),
    activeWarnings: row.active_warnings,
    lastNote: row.note_body ? { body: row.note_body, author: row.note_author ?? "?", createdAt: row.note_at ?? "" } : null
  }));
}

export type MemberDetail = {
  member: StaffWithStats | null;
  badges: { id: number; color: string; reason: string; author_discord_id: string; status: string; created_at: string; resolved_at: string | null }[];
  notes: { id: number; body: string; author_discord_id: string; author_name: string | null; created_at: string }[];
  warnings: { id: number; level: number; reason: string; author_discord_id: string; created_at: string; removed_at: string | null; removed_by: string | null; removed_reason: string | null }[];
  gradeHistory: { id: number; old_grade: string; new_grade: string; actor_discord_id: string; reason: string; sync_status: string; created_at: string }[];
};

/** Full record for one member: stats, badges, notes, grade history (newest first). */
export function getMemberDetail(discordId: string, since?: Date): MemberDetail {
  const member = listStaffWithStats(since).find((m) => m.discordId === discordId) ?? null;
  return {
    member,
    badges: db
      .prepare("SELECT id, color, reason, author_discord_id, status, created_at, resolved_at FROM staff_badges WHERE discord_id = ? ORDER BY created_at DESC, id DESC")
      .all(discordId) as MemberDetail["badges"],
    notes: db
      .prepare("SELECT id, body, author_discord_id, author_name, created_at FROM staff_notes WHERE discord_id = ? ORDER BY created_at DESC, id DESC")
      .all(discordId) as MemberDetail["notes"],
    warnings: db
      .prepare("SELECT id, level, reason, author_discord_id, created_at, removed_at, removed_by, removed_reason FROM warnings WHERE discord_id = ? ORDER BY created_at DESC, id DESC")
      .all(discordId) as MemberDetail["warnings"],
    gradeHistory: db
      .prepare("SELECT id, old_grade, new_grade, actor_discord_id, reason, sync_status, created_at FROM grade_history WHERE discord_id = ? ORDER BY created_at DESC, id DESC")
      .all(discordId) as MemberDetail["gradeHistory"]
  };
}
