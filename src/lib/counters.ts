import { db } from "./db";
import { audit } from "./audit";
import { getStatusValue, setBotStatus } from "./bot-status";
import { snapshotPlaytimeNow } from "./fivem-db";

/**
 * "Reset all counters" does not delete anything: it stores a reset point, and the staff list, dashboard and
 * profiles count voice/game time only from that point on. Session history and the weekly reports stay intact.
 */
const KEY = "counters_reset_at";

export function getCountersResetAt(): Date | null {
  const raw = getStatusValue(KEY);
  return raw ? new Date(raw) : null;
}

export type ResetResult = { resetAt: string; fivemSnapshot: boolean; restartedVoice: number };

export async function resetCounters(actor: { discordId: string; username?: string }): Promise<ResetResult> {
  const now = new Date();
  const at = now.toISOString();
  let restartedVoice = 0;

  db.transaction(() => {
    // Members currently in voice keep counting: close their session at the reset point and reopen it right after.
    const open = db.prepare("SELECT id, discord_id, channel_id, started_at FROM voice_sessions WHERE ended_at IS NULL").all() as {
      id: number; discord_id: string; channel_id: string; started_at: string;
    }[];
    for (const session of open) {
      const seconds = Math.max(0, Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1000));
      db.prepare("UPDATE voice_sessions SET ended_at = ?, seconds = ? WHERE id = ?").run(at, seconds, session.id);
      db.prepare("INSERT INTO voice_sessions (discord_id, channel_id, started_at, ended_at, seconds, reconciled) VALUES (?, ?, ?, NULL, 0, 0)")
        .run(session.discord_id, session.channel_id, at);
      restartedVoice++;
    }
    setBotStatus(KEY, at);
  })();

  // FiveM playtime is a lifetime total in the game database: take a fresh snapshot as the new zero.
  const fivemSnapshot = await snapshotPlaytimeNow(at);
  audit(actor, "counters_reset", null, { at, fivemSnapshot, restartedVoice });
  return { resetAt: at, fivemSnapshot, restartedVoice };
}
