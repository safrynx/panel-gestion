import { db, stmt, type Stmt } from "./db";
import { audit } from "./audit";
import { getServerStatus } from "./bot-status";
import { snapshotPlaytimeNow } from "./playtime";

/**
 * "Reset all counters" does not delete anything: it stores a reset point, and the staff list, dashboard and
 * profiles count voice/game time only from that point on. Session history and the weekly reports stay intact.
 */
const KEY = "counters_reset_at";

export async function getCountersResetAt(serverId: string): Promise<Date | null> {
  const raw = await getServerStatus(serverId, KEY);
  return raw ? new Date(raw) : null;
}

export type ResetResult = { resetAt: string; fivemSnapshot: boolean; restartedVoice: number };

export async function resetCounters(serverId: string, actor: { discordId: string; username?: string }): Promise<ResetResult> {
  const now = new Date();
  const at = now.toISOString();

  // Members currently in voice keep counting: close their session at the reset point and reopen it right after.
  const open = await db.all<{ id: number; discord_id: string; channel_id: string; started_at: string }>(
    "SELECT id, discord_id, channel_id, started_at FROM voice_sessions WHERE server_id = ? AND ended_at IS NULL",
    [serverId]
  );
  const statements: Stmt[] = [];
  for (const session of open) {
    const seconds = Math.max(0, Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1000));
    statements.push(stmt("UPDATE voice_sessions SET ended_at = ?, seconds = ? WHERE id = ?", [at, seconds, session.id]));
    statements.push(
      stmt("INSERT INTO voice_sessions (server_id, discord_id, channel_id, started_at, ended_at, seconds, reconciled) VALUES (?, ?, ?, ?, NULL, 0, 0)", [
        serverId, session.discord_id, session.channel_id, at
      ])
    );
  }
  statements.push(
    stmt(
      `INSERT INTO bot_status (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [`${serverId}:${KEY}`, at, at]
    )
  );
  await db.batch(statements);

  // FiveM playtime is a lifetime total pushed by the bot: its latest values become the new zero.
  const fivemSnapshot = await snapshotPlaytimeNow(serverId, at);
  await audit(serverId, actor, "counters_reset", null, { at, fivemSnapshot, restartedVoice: open.length });
  return { resetAt: at, fivemSnapshot, restartedVoice: open.length };
}
