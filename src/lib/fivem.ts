import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db, stmt } from "./db";

/**
 * FiveM agent session ingestion.
 *
 * SECURITY MODEL:
 * The agent authenticates with a shared secret (FIVEM_AGENT_TOKEN) using a
 * constant-time comparison. The agent reports the FiveM player's identifiers,
 * including their `discord:xxxxx` identifier captured SERVER-SIDE by FiveM
 * (linked via the player's Discord Rich Presence / connected accounts).
 *
 * A `discord_id` sent directly by a *browser* client is NEVER accepted — only
 * the FiveM server agent (holding the token) can report sessions. The
 * discord_id therefore comes from the game server's own identifier list, not
 * from anything user-controllable.
 */

export function verifyAgentToken(presented: string | null): boolean {
  const expected = process.env.FIVEM_AGENT_TOKEN;
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const fivemEventSchema = z.object({
  event: z.enum(["session_start", "session_end"]),
  discordId: z.string().regex(/^\d{17,20}$/),
  playerName: z.string().max(100).optional().nullable(),
  sessionId: z.string().min(1).max(128),
  timestamp: z.number().int().positive()
});

export type FivemEvent = z.infer<typeof fivemEventSchema>;

export type IngestResult =
  | { ok: true; action: "opened" | "closed" | "ignored" }
  | { ok: false; reason: string };

/**
 * Record a FiveM session start/end, idempotent on external_session_id.
 * A session_start creates a row in activity_sessions (source='fivem') with 0 seconds;
 * the matching session_end computes real elapsed seconds. Replays are ignored.
 */
export async function ingestFivemEvent(event: FivemEvent): Promise<IngestResult> {
  // The member must exist in staff_members to be counted.
  const member = await db.get("SELECT id FROM staff_members WHERE discord_id = ? AND left_guild_at IS NULL", [event.discordId]);
  if (!member) return { ok: true, action: "ignored" };

  const startedAt = new Date(event.timestamp * 1000).toISOString();

  if (event.event === "session_start") {
    // UNIQUE(external_session_id): a replay inserts nothing.
    const { changes } = await db.run(
      `INSERT OR IGNORE INTO activity_sessions (discord_id, source, started_at, ended_at, seconds, external_session_id, origin)
       VALUES (?, 'fivem', ?, NULL, 0, ?, 'fivem_agent')`,
      [event.discordId, startedAt, event.sessionId]
    );
    return { ok: true, action: changes > 0 ? "opened" : "ignored" };
  }

  // session_end: find the matching open session (none = replay of a closed session, or an end without a start).
  const open = await db.get<{ id: number; started_at: string }>(
    "SELECT id, started_at FROM activity_sessions WHERE external_session_id = ? AND source = 'fivem' AND ended_at IS NULL",
    [event.sessionId]
  );
  if (!open) return { ok: true, action: "ignored" };

  const end = new Date(event.timestamp * 1000).getTime();
  const seconds = Math.max(0, Math.floor((end - new Date(open.started_at).getTime()) / 1000));
  await db.run("UPDATE activity_sessions SET ended_at = ?, seconds = ? WHERE id = ?", [new Date(end).toISOString(), seconds, open.id]);
  return { ok: true, action: "closed" };
}

/**
 * Close any FiveM sessions still open after a stale timeout.
 * Called by the periodic maintenance, protects against missed playerDropped events (server crash, etc.).
 */
export async function closeStaleFivemSessions(maxSeconds: number): Promise<number> {
  const cutoff = new Date(Date.now() - Math.floor(maxSeconds) * 1000).toISOString();
  const rows = await db.all<{ id: number; started_at: string }>(
    "SELECT id, started_at FROM activity_sessions WHERE source = 'fivem' AND ended_at IS NULL AND started_at <= ?",
    [cutoff]
  );
  const seconds = Math.floor(maxSeconds);
  await db.batch(
    rows.map((row) =>
      stmt("UPDATE activity_sessions SET ended_at = ?, seconds = ? WHERE id = ?", [
        new Date(new Date(row.started_at).getTime() + seconds * 1000).toISOString(),
        seconds,
        row.id
      ])
    )
  );
  return rows.length;
}

/** True if the member currently has an open FiveM session. */
export async function isInFivemNow(discordId: string): Promise<boolean> {
  return Boolean(await db.get("SELECT 1 AS x FROM activity_sessions WHERE discord_id = ? AND source = 'fivem' AND ended_at IS NULL", [discordId]));
}
