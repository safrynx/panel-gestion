import { db } from "./db";
import { hasStaffRole } from "./config";

/**
 * Voice session tracking.
 *
 * IMPORTANT: activity before the bot's first activation cannot be back-filled —
 * Discord does not expose historical voice-state data. Only sessions recorded
 * from the moment the bot is running are counted.
 */

function isStaffMember(_discordId: string, roleIds: string[]): boolean {
  return hasStaffRole(roleIds);
}

/** Open a voice session when a staff member joins a voice channel. */
export function openVoiceSession(discordId: string, roleIds: string[], channelId: string, startedAt: Date): void {
  if (!isStaffMember(discordId, roleIds)) return;
  // Safety: never leave overlapping open sessions (e.g. missed leave event).
  closeAllOpenSessions(discordId, startedAt);
  db.prepare(
    "INSERT INTO voice_sessions (discord_id, channel_id, started_at, ended_at, seconds, reconciled) VALUES (?, ?, ?, NULL, 0, 0)"
  ).run(discordId, channelId, startedAt.toISOString());
}

/** Close the current open session when the member leaves voice. */
export function closeVoiceSession(discordId: string, endedAt: Date): void {
  closeAllOpenSessions(discordId, endedAt);
}

/** Called on channel move: close previous and open the new session. */
export function moveVoiceSession(discordId: string, roleIds: string[], newChannelId: string, at: Date): void {
  if (!isStaffMember(discordId, roleIds)) {
    // Member lost staff status mid-session — close their session.
    closeAllOpenSessions(discordId, at);
    return;
  }
  closeAllOpenSessions(discordId, at);
  db.prepare(
    "INSERT INTO voice_sessions (discord_id, channel_id, started_at, ended_at, seconds, reconciled) VALUES (?, ?, ?, NULL, 0, 0)"
  ).run(discordId, newChannelId, at.toISOString());
}

function closeAllOpenSessions(discordId: string, endedAt: Date): void {
  const endedIso = endedAt.toISOString();
  db.transaction(() => {
    const open = db
      .prepare("SELECT id, started_at FROM voice_sessions WHERE discord_id = ? AND ended_at IS NULL")
      .all(discordId) as { id: number; started_at: string }[];
    for (const session of open) {
      const start = new Date(session.started_at).getTime();
      const end = Math.max(endedAt.getTime(), start); // never negative
      const seconds = Math.floor((end - start) / 1000);
      db.prepare("UPDATE voice_sessions SET ended_at = ?, seconds = ? WHERE id = ?")
        .run(endedIso, seconds, session.id);
    }
  })();
}

/**
 * Reconcile open sessions against the current guild voice state after a bot restart.
 * - Sessions still open whose member is NOT currently in voice: close them with a
 *   grace period (avoid counting phantom time); use `now` as best-effort end.
 * - Members currently in voice WITHOUT an open session: open one (avoid missing time),
 *   marked reconciled = 1 so we know it was back-filled from an approximate timestamp.
 */
export function reconcileVoiceSessions(
  currentVoiceMembers: { discordId: string; channelId: string; roleIds: string[] }[],
  now: Date
): { closed: number; opened: number } {
  let closed = 0;
  let opened = 0;

  const tx = db.transaction(() => {
    const openSessions = db
      .prepare("SELECT id, discord_id, channel_id FROM voice_sessions WHERE ended_at IS NULL")
      .all() as { id: number; discord_id: string; channel_id: string }[];

    const currentlyInVoice = new Map(currentVoiceMembers.map((m) => [m.discordId, m]));

    for (const session of openSessions) {
      const member = currentlyInVoice.get(session.discord_id);
      if (!member || member.channelId !== session.channel_id) {
        // Phantom session: member left or moved while bot was down.
        db.prepare("UPDATE voice_sessions SET ended_at = ?, seconds = 0, reconciled = 1 WHERE id = ?")
          .run(now.toISOString(), session.id);
        if (member && member.channelId !== session.channel_id) {
          // Moved: reopen for the new channel.
          db.prepare(
            "INSERT INTO voice_sessions (discord_id, channel_id, started_at, ended_at, seconds, reconciled) VALUES (?, ?, ?, NULL, 0, 1)"
          ).run(member.discordId, member.channelId, now.toISOString());
          opened++;
        }
        closed++;
      }
      // If the member is still in the same channel, keep the session as-is (no double counting).
    }

    // Members in voice without any open session.
    for (const member of currentVoiceMembers) {
      const hasOpen = db
        .prepare("SELECT 1 FROM voice_sessions WHERE discord_id = ? AND ended_at IS NULL")
        .get(member.discordId);
      if (!hasOpen) {
        openVoiceSession(member.discordId, member.roleIds, member.channelId, now);
        opened++;
      }
    }
  });
  tx();

  return { closed, opened };
}

/** Total voice seconds for a member, optionally since a date. */
export function voiceSecondsFor(discordId: string, since?: Date): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(seconds), 0) AS total FROM voice_sessions
       WHERE discord_id = ? AND (? IS NULL OR started_at >= ?)`
    )
    .get(discordId, since?.toISOString() ?? null, since?.toISOString() ?? null) as { total: number };
  return row.total;
}

/** True if the member currently has an open voice session. */
export function isInVoiceNow(discordId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM voice_sessions WHERE discord_id = ? AND ended_at IS NULL").get(discordId));
}

/** Close every open voice session (used when the bot shuts down cleanly). */
export function closeAllVoiceSessions(endedAt: Date): number {
  const ids = db.prepare("SELECT DISTINCT discord_id FROM voice_sessions WHERE ended_at IS NULL").all() as { discord_id: string }[];
  for (const { discord_id } of ids) closeAllOpenSessions(discord_id, endedAt);
  return ids.length;
}
