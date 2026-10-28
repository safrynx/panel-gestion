import { db, stmt, type Stmt } from "./db";
import { hasStaffRoleIn, loadConfig } from "./config";

/**
 * Voice session tracking.
 *
 * IMPORTANT: activity before the bot's first activation cannot be back-filled —
 * Discord does not expose historical voice-state data. Only sessions recorded
 * from the moment the bot is running are counted.
 */

type OpenRow = { id: number; started_at: string };

const INSERT_SESSION =
  "INSERT INTO voice_sessions (discord_id, channel_id, started_at, ended_at, seconds, reconciled) VALUES (?, ?, ?, NULL, 0, ?)";

/** Statements closing the given open sessions at `endedAt` (never a negative duration). */
function closeStatements(open: OpenRow[], endedAt: Date): Stmt[] {
  const endedIso = endedAt.toISOString();
  return open.map((session) => {
    const start = new Date(session.started_at).getTime();
    const seconds = Math.floor((Math.max(endedAt.getTime(), start) - start) / 1000);
    return stmt("UPDATE voice_sessions SET ended_at = ?, seconds = ? WHERE id = ?", [endedIso, seconds, session.id]);
  });
}

const openSessionsOf = (discordId: string) =>
  db.all<OpenRow>("SELECT id, started_at FROM voice_sessions WHERE discord_id = ? AND ended_at IS NULL", [discordId]);

/** Open a voice session when a staff member joins a voice channel. */
export async function openVoiceSession(discordId: string, roleIds: string[], channelId: string, startedAt: Date): Promise<void> {
  if (!hasStaffRoleIn(await loadConfig(), roleIds)) return;
  // Safety: never leave overlapping open sessions (e.g. missed leave event).
  const open = await openSessionsOf(discordId);
  await db.batch([...closeStatements(open, startedAt), stmt(INSERT_SESSION, [discordId, channelId, startedAt.toISOString(), 0])]);
}

/** Close the current open session when the member leaves voice. */
export async function closeVoiceSession(discordId: string, endedAt: Date): Promise<void> {
  await db.batch(closeStatements(await openSessionsOf(discordId), endedAt));
}

/** Called on channel move: close previous and open the new session. */
export async function moveVoiceSession(discordId: string, roleIds: string[], newChannelId: string, at: Date): Promise<void> {
  const open = await openSessionsOf(discordId);
  if (!hasStaffRoleIn(await loadConfig(), roleIds)) {
    // Member lost staff status mid-session — close their session.
    await db.batch(closeStatements(open, at));
    return;
  }
  await db.batch([...closeStatements(open, at), stmt(INSERT_SESSION, [discordId, newChannelId, at.toISOString(), 0])]);
}

/**
 * Reconcile open sessions against the current guild voice state (bot restart, periodic full sync).
 * - Sessions still open whose member is NOT currently in voice: close them with no counted time
 *   (avoid phantom time); a member who moved channel gets a new session.
 * - Staff currently in voice WITHOUT an open session: open one (avoid missing time),
 *   marked reconciled = 1 so we know it was back-filled from an approximate timestamp.
 * Everything is computed in memory and written as one atomic batch.
 */
export async function reconcileVoiceSessions(
  currentVoiceMembers: { discordId: string; channelId: string; roleIds: string[] }[],
  now: Date
): Promise<{ closed: number; opened: number }> {
  const cfg = await loadConfig();
  const nowIso = now.toISOString();
  const open = await db.all<{ id: number; discord_id: string; channel_id: string }>(
    "SELECT id, discord_id, channel_id FROM voice_sessions WHERE ended_at IS NULL"
  );
  const current = new Map(currentVoiceMembers.map((m) => [m.discordId, m]));
  const covered = new Set<string>(); // members that end up with an open session
  const statements: Stmt[] = [];
  let closed = 0;
  let opened = 0;

  for (const session of open) {
    const member = current.get(session.discord_id);
    if (member && member.channelId === session.channel_id) {
      covered.add(session.discord_id); // still in the same channel: keep as-is (no double counting)
      continue;
    }
    statements.push(stmt("UPDATE voice_sessions SET ended_at = ?, seconds = 0, reconciled = 1 WHERE id = ?", [nowIso, session.id]));
    closed++;
    if (member && !covered.has(member.discordId)) {
      statements.push(stmt(INSERT_SESSION, [member.discordId, member.channelId, nowIso, 1])); // moved: reopen for the new channel
      covered.add(member.discordId);
      opened++;
    }
  }

  for (const member of currentVoiceMembers) {
    if (covered.has(member.discordId) || !hasStaffRoleIn(cfg, member.roleIds)) continue;
    statements.push(stmt(INSERT_SESSION, [member.discordId, member.channelId, nowIso, 1]));
    covered.add(member.discordId);
    opened++;
  }

  await db.batch(statements);
  return { closed, opened };
}

/** Total voice seconds for a member, optionally since a date. */
export async function voiceSecondsFor(discordId: string, since?: Date): Promise<number> {
  const row = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(seconds), 0) AS total FROM voice_sessions
     WHERE discord_id = ? AND (? IS NULL OR started_at >= ?)`,
    [discordId, since?.toISOString() ?? null, since?.toISOString() ?? null]
  );
  return row?.total ?? 0;
}

/** True if the member currently has an open voice session. */
export async function isInVoiceNow(discordId: string): Promise<boolean> {
  return Boolean(await db.get("SELECT 1 AS x FROM voice_sessions WHERE discord_id = ? AND ended_at IS NULL", [discordId]));
}

/** Close every open voice session (used when the bot shuts down cleanly). Returns how many members were in voice. */
export async function closeAllVoiceSessions(endedAt: Date): Promise<number> {
  const open = await db.all<OpenRow & { discord_id: string }>("SELECT id, discord_id, started_at FROM voice_sessions WHERE ended_at IS NULL");
  await db.batch(closeStatements(open, endedAt));
  return new Set(open.map((s) => s.discord_id)).size;
}
