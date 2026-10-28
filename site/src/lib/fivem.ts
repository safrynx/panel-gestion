import { z } from "zod";
import { db, stmt } from "./db";

/**
 * FiveM agent session ingestion.
 *
 * SECURITY MODEL:
 * Each server's agent authenticates with that server's own token (see servers.ts: only a hash is stored,
 * the old shared FIVEM_AGENT_TOKEN still maps to the legacy server). The token decides which server the
 * session belongs to: an agent can never write into another server. The agent reports the player's
 * `discord:xxxxx` identifier captured SERVER-SIDE by FiveM (linked via the player's connected accounts).
 *
 * A `discord_id` sent directly by a *browser* client is NEVER accepted — only
 * a FiveM server agent (holding a token) can report sessions. The
 * discord_id therefore comes from the game server's own identifier list, not
 * from anything user-controllable.
 */

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

/** Session ids are only unique per agent: prefix them with the server so two servers never collide. */
const externalId = (serverId: string, sessionId: string) => `${serverId}:${sessionId}`;

/**
 * Record a FiveM session start/end for a server, idempotent on external_session_id.
 * A session_start creates a row in activity_sessions (source='fivem') with 0 seconds;
 * the matching session_end computes real elapsed seconds. Replays are ignored.
 */
export async function ingestFivemEvent(serverId: string, event: FivemEvent): Promise<IngestResult> {
  // The member must be staff of this server to be counted.
  const member = await db.get("SELECT id FROM staff_members WHERE server_id = ? AND discord_id = ? AND left_guild_at IS NULL", [serverId, event.discordId]);
  if (!member) return { ok: true, action: "ignored" };

  const startedAt = new Date(event.timestamp * 1000).toISOString();
  const sessionKey = externalId(serverId, event.sessionId);

  if (event.event === "session_start") {
    // UNIQUE(external_session_id): a replay inserts nothing.
    const { changes } = await db.run(
      `INSERT OR IGNORE INTO activity_sessions (server_id, discord_id, source, started_at, ended_at, seconds, external_session_id, origin)
       VALUES (?, ?, 'fivem', ?, NULL, 0, ?, 'fivem_agent')`,
      [serverId, event.discordId, startedAt, sessionKey]
    );
    return { ok: true, action: changes > 0 ? "opened" : "ignored" };
  }

  // session_end: find the matching open session (none = replay of a closed session, or an end without a start).
  const open = await db.get<{ id: number; started_at: string }>(
    "SELECT id, started_at FROM activity_sessions WHERE external_session_id = ? AND source = 'fivem' AND ended_at IS NULL",
    [sessionKey]
  );
  if (!open) return { ok: true, action: "ignored" };

  const end = new Date(event.timestamp * 1000).getTime();
  const seconds = Math.max(0, Math.floor((end - new Date(open.started_at).getTime()) / 1000));
  await db.run("UPDATE activity_sessions SET ended_at = ?, seconds = ? WHERE id = ?", [new Date(end).toISOString(), seconds, open.id]);
  return { ok: true, action: "closed" };
}

/**
 * Close any FiveM sessions (all servers) still open after a stale timeout.
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

/** True if the member currently has an open FiveM session on the server. */
export async function isInFivemNow(serverId: string, discordId: string): Promise<boolean> {
  return Boolean(
    await db.get("SELECT 1 AS x FROM activity_sessions WHERE server_id = ? AND discord_id = ? AND source = 'fivem' AND ended_at IS NULL", [serverId, discordId])
  );
}
