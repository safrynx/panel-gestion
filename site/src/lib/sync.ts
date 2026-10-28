import { randomUUID } from "node:crypto";
import { db, stmt, type Stmt } from "./db";
import { hasStaffRoleIn, loadConfig, resolveGradeIn, type ConfigSnapshot } from "./config";
import { getBotStatus } from "./bot-status";
import { auditStmt } from "./audit";

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

type MemberKind = "inserted" | "updated" | "left" | "skipped";
type Known = Map<string, { id: string; active: boolean }>;

const DEFAULT_GRADE = { grade: "Staff", gradeLevel: 0 };

const UPSERT_SQL = `
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

const MARK_LEFT_SQL = `
  UPDATE staff_members SET left_guild_at = ?, updated_at = ?, roles_json = ?, last_synced_at = ?
  WHERE discord_id = ? AND left_guild_at IS NULL
`;

/**
 * Decide what to write for one member, without touching the database.
 * Members without a staff role (or no longer in the guild) are marked left, never deleted,
 * so notes/badges/history (separate tables keyed by discord_id) are preserved.
 */
function plan(cfg: ConfigSnapshot, known: Known, member: SyncedMember, now: string): { kind: MemberKind; statement: Stmt | null } {
  const existing = known.get(member.discordId);
  if (!member.presentInGuild || !hasStaffRoleIn(cfg, member.roleIds)) {
    if (!existing?.active) return { kind: "skipped", statement: null };
    return { kind: "left", statement: stmt(MARK_LEFT_SQL, [now, now, JSON.stringify(member.roleIds), now, member.discordId]) };
  }
  const { grade, gradeLevel } = resolveGradeIn(cfg, member.roleIds) ?? DEFAULT_GRADE;
  return {
    kind: existing ? "updated" : "inserted",
    statement: stmt(UPSERT_SQL, [
      existing?.id ?? randomUUID(), member.discordId, member.username, member.avatarUrl, grade, gradeLevel,
      now, now, member.joinedAt, JSON.stringify(member.roleIds), now
    ])
  };
}

async function loadKnown(): Promise<Known> {
  const rows = await db.all<{ id: string; discord_id: string; left_guild_at: string | null }>(
    "SELECT id, discord_id, left_guild_at FROM staff_members"
  );
  return new Map(rows.map((r) => [r.discord_id, { id: r.id, active: r.left_guild_at === null }]));
}

/**
 * Sync staff members from a full Discord guild snapshot, in one atomic batch.
 * - No duplicates (UNIQUE discord_id, INSERT ... ON CONFLICT).
 * - Members absent from the snapshot or without staff roles are marked left_guild_at.
 */
export async function syncStaffMembers(members: SyncedMember[], actorDiscordId = "system"): Promise<SyncResult> {
  const cfg = await loadConfig();
  const known = await loadKnown();
  const now = new Date().toISOString();
  const statements: Stmt[] = [];
  const counts = { inserted: 0, updated: 0, markedLeft: 0 };

  const seen = new Set<string>();
  for (const member of members) {
    seen.add(member.discordId);
    const { kind, statement } = plan(cfg, known, member, now);
    if (statement) statements.push(statement);
    if (kind === "inserted") counts.inserted++;
    else if (kind === "updated") counts.updated++;
    else if (kind === "left") counts.markedLeft++;
  }
  for (const [discordId, row] of known) {
    if (seen.has(discordId) || !row.active) continue;
    statements.push(stmt(MARK_LEFT_SQL, [now, now, "[]", now, discordId]));
    counts.markedLeft++;
  }

  const result = { ...counts, total: members.length };
  statements.push(auditStmt(actorDiscordId, "staff_sync", null, result));
  await db.batch(statements);
  return result;
}

/** Statements to register / refresh / retire one member; compose them into a larger atomic batch if needed. */
export async function memberStatements(member: SyncedMember): Promise<{ kind: MemberKind; statements: Stmt[] }> {
  const cfg = await loadConfig();
  const rows = await db.all<{ id: string; left_guild_at: string | null }>(
    "SELECT id, left_guild_at FROM staff_members WHERE discord_id = ?",
    [member.discordId]
  );
  const known: Known = new Map(rows.map((r) => [member.discordId, { id: r.id, active: r.left_guild_at === null }]));
  const { kind, statement } = plan(cfg, known, member, new Date().toISOString());
  return { kind, statements: statement ? [statement] : [] };
}

/** Incremental update for one member (bot member events, OAuth login). Does not touch other members. */
export async function upsertStaffMember(member: SyncedMember): Promise<MemberKind> {
  const { kind, statements } = await memberStatements(member);
  await db.batch(statements);
  return kind;
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
 * Aggregate voice/fivem seconds + latest active badge + note count per active member, in one query.
 * Voice time comes from `voice_sessions` (written by the bot), FiveM time from
 * `activity_sessions` (written by the FiveM agent). `since`/`until` restrict sessions by start date;
 * `onlyDiscordId` restricts the result to a single member.
 */
export async function listStaffWithStats(since?: Date, until?: Date, onlyDiscordId?: string): Promise<StaffWithStats[]> {
  // Voice sessions are only live while the bot runs; otherwise they count up to its last heartbeat.
  const bot = await getBotStatus();
  const liveVoice = bot.alive ? new Date().toISOString() : bot.heartbeatAt ?? "1970-01-01T00:00:00.000Z";
  const rows = await db.all<{
    id: string; discord_id: string; username: string; avatar_url: string | null; grade: string; grade_level: number;
    guild_joined_at: string | null; left_guild_at: string | null; voice_seconds: number; fivem_seconds: number;
    badge_color: string | null; notes_count: number; last_activity: string; voice_open: number; fivem_open: number;
    roles_json: string; active_warnings: number; note_body: string | null; note_at: string | null; note_author: string | null;
  }>(
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
    WHERE s.left_guild_at IS NULL AND (@only IS NULL OR s.discord_id = @only)
    ORDER BY s.grade_level DESC, s.username COLLATE NOCASE
    `,
    {
      since: since ? since.toISOString() : null,
      until: until ? until.toISOString() : null,
      only: onlyDiscordId ?? null,
      liveVoice,
      liveFivem: new Date().toISOString()
    }
  );

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

/** Full record for one member: stats, badges, notes, warnings, grade history (newest first). */
export async function getMemberDetail(discordId: string, since?: Date): Promise<MemberDetail> {
  const [list, badges, notes, warnings, gradeHistory] = await Promise.all([
    listStaffWithStats(since, undefined, discordId),
    db.all<MemberDetail["badges"][number]>("SELECT id, color, reason, author_discord_id, status, created_at, resolved_at FROM staff_badges WHERE discord_id = ? ORDER BY created_at DESC, id DESC", [discordId]),
    db.all<MemberDetail["notes"][number]>("SELECT id, body, author_discord_id, author_name, created_at FROM staff_notes WHERE discord_id = ? ORDER BY created_at DESC, id DESC", [discordId]),
    db.all<MemberDetail["warnings"][number]>("SELECT id, level, reason, author_discord_id, created_at, removed_at, removed_by, removed_reason FROM warnings WHERE discord_id = ? ORDER BY created_at DESC, id DESC", [discordId]),
    db.all<MemberDetail["gradeHistory"][number]>("SELECT id, old_grade, new_grade, actor_discord_id, reason, sync_status, created_at FROM grade_history WHERE discord_id = ? ORDER BY created_at DESC, id DESC", [discordId])
  ]);
  return { member: list[0] ?? null, badges, notes, warnings, gradeHistory };
}
