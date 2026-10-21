import { db } from "./db";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

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
export function ingestFivemEvent(event: FivemEvent): IngestResult {
  // The member must exist in staff_members to be counted.
  const member = db.prepare("SELECT id FROM staff_members WHERE discord_id = ? AND left_guild_at IS NULL").get(event.discordId);
  if (!member) return { ok: true, action: "ignored" };

  const startedAt = new Date(event.timestamp * 1000).toISOString();

  if (event.event === "session_start") {
    const existing = db
      .prepare("SELECT id FROM activity_sessions WHERE external_session_id = ?")
      .get(event.sessionId);
    if (existing) return { ok: true, action: "ignored" }; // idempotent replay
    db.prepare(
      `INSERT INTO activity_sessions (discord_id, source, started_at, ended_at, seconds, external_session_id, origin)
       VALUES (?, 'fivem', ?, NULL, 0, ?, 'fivem_agent')`
    ).run(event.discordId, startedAt, event.sessionId);
    return { ok: true, action: "opened" };
  }

  // session_end: find the matching open session.
  const open = db
    .prepare(
      "SELECT id, started_at FROM activity_sessions WHERE external_session_id = ? AND source = 'fivem' AND ended_at IS NULL"
    )
    .get(event.sessionId) as { id: number; started_at: string } | undefined;

  if (!open) {
    // Replay of an already-closed session, or an end without a start.
    return { ok: true, action: "ignored" };
  }

  const end = new Date(event.timestamp * 1000).getTime();
  const start = new Date(open.started_at).getTime();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  db.prepare("UPDATE activity_sessions SET ended_at = ?, seconds = ? WHERE id = ?").run(
    new Date(end).toISOString(),
    seconds,
    open.id
  );
  return { ok: true, action: "closed" };
}

/**
 * Close any FiveM sessions still open after a configurable stale timeout.
 * Called on bot/web startup or by a scheduled job, protects against missed
 * playerDropped events (server crash, etc.).
 */
export function closeStaleFivemSessions(maxSeconds: number): number {
  const rows = db
    .prepare(
      `SELECT id, started_at FROM activity_sessions
       WHERE source = 'fivem' AND ended_at IS NULL
         AND started_at <= datetime('now', ?)`
    )
    .all(`-${Math.floor(maxSeconds)} seconds`) as { id: number; started_at: string }[];
  let closed = 0;
  for (const row of rows) {
    const start = new Date(row.started_at).getTime();
    const seconds = Math.floor(maxSeconds);
    db.prepare("UPDATE activity_sessions SET ended_at = ?, seconds = ? WHERE id = ?").run(
      new Date(start + seconds * 1000).toISOString(),
      seconds,
      row.id
    );
    closed++;
  }
  return closed;
}

/** True if the member currently has an open FiveM session. */
export function isInFivemNow(discordId: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM activity_sessions WHERE discord_id = ? AND source = 'fivem' AND ended_at IS NULL").get(discordId)
  );
}
