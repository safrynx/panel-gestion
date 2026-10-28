import { db, stmt } from "./db";

/**
 * FiveM playtime, as pushed by the bot (per server).
 *
 * The game server's MySQL database holds a lifetime total per player. The bot (which has a fixed address
 * and can be allowed through the database firewall) reads it and posts the totals to /api/bot/playtime,
 * so the site never needs to reach the game database. Weekly / monthly figures are the difference between
 * snapshots of that total, taken at most every 30 minutes.
 */

const SNAPSHOT_EVERY_MS = 30 * 60_000;

export type PlaytimeTotal = { discordId: string; seconds: number };

/** Store the latest lifetime totals of a server's staff members (others are ignored) and a throttled snapshot. */
export async function storePlaytimeTotals(serverId: string, totals: PlaytimeTotal[], now = new Date()): Promise<{ stored: number; snapshot: boolean }> {
  const staff = new Set(
    (await db.all<{ discord_id: string }>("SELECT discord_id FROM staff_members WHERE server_id = ?", [serverId])).map((r) => r.discord_id)
  );
  const mine = totals.filter((t) => staff.has(t.discordId));
  const at = now.toISOString();

  const last = await db.get<{ at: string | null }>("SELECT MAX(taken_at) AS at FROM playtime_snapshots WHERE server_id = ?", [serverId]);
  const snapshot = !last?.at || now.getTime() - new Date(last.at).getTime() >= SNAPSHOT_EVERY_MS;

  const statements = mine.map((t) =>
    stmt(
      `INSERT INTO playtime_totals (server_id, discord_id, seconds, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(server_id, discord_id) DO UPDATE SET seconds = excluded.seconds, updated_at = excluded.updated_at`,
      [serverId, t.discordId, t.seconds, at]
    )
  );
  if (snapshot) {
    for (const t of mine) {
      statements.push(stmt("INSERT INTO playtime_snapshots (server_id, discord_id, seconds, taken_at) VALUES (?, ?, ?, ?)", [serverId, t.discordId, t.seconds, at]));
    }
  }
  await db.batch(statements);
  return { stored: mine.length, snapshot };
}

/** True once the bot has pushed playtime for this server at least once (its game database is connected). */
export async function playtimeAvailable(serverId: string): Promise<boolean> {
  return Boolean(await db.get("SELECT 1 AS x FROM playtime_totals WHERE server_id = ? LIMIT 1", [serverId]));
}

/** Store a snapshot labelled `takenAt` from the latest totals (zero point of a counter reset). */
export async function snapshotPlaytimeNow(serverId: string, takenAt: string): Promise<boolean> {
  const rows = await db.all<{ discord_id: string; seconds: number }>("SELECT discord_id, seconds FROM playtime_totals WHERE server_id = ?", [serverId]);
  if (!rows.length) return false;
  await db.batch(
    rows.map((r) => stmt("INSERT INTO playtime_snapshots (server_id, discord_id, seconds, taken_at) VALUES (?, ?, ?, ?)", [serverId, r.discord_id, r.seconds, takenAt]))
  );
  return true;
}

/**
 * Playtime in seconds per Discord id over [since, until). Without `since`, the lifetime total.
 * Members without a usable snapshot baseline are left out so callers can fall back to agent data.
 * Returns null when no playtime was ever pushed for this server.
 */
export async function getFivemPlaytimes(serverId: string, since?: Date, until?: Date): Promise<Map<string, number> | null> {
  if (!since) {
    const rows = await db.all<{ discord_id: string; seconds: number }>("SELECT discord_id, seconds FROM playtime_totals WHERE server_id = ?", [serverId]);
    return rows.length ? new Map(rows.map((r) => [r.discord_id, r.seconds])) : null;
  }

  const rows = await db.all<{ discord_id: string; total: number; base: number | null; end_snap: number | null }>(
    `SELECT t.discord_id, t.seconds AS total,
       COALESCE(
         (SELECT s.seconds FROM playtime_snapshots s WHERE s.server_id = t.server_id AND s.discord_id = t.discord_id AND s.taken_at <= @since ORDER BY s.taken_at DESC LIMIT 1),
         (SELECT s.seconds FROM playtime_snapshots s WHERE s.server_id = t.server_id AND s.discord_id = t.discord_id ORDER BY s.taken_at ASC LIMIT 1)
       ) AS base,
       (SELECT s.seconds FROM playtime_snapshots s WHERE s.server_id = t.server_id AND s.discord_id = t.discord_id AND s.taken_at <= @until ORDER BY s.taken_at DESC LIMIT 1) AS end_snap
     FROM playtime_totals t WHERE t.server_id = @server`,
    { server: serverId, since: since.toISOString(), until: (until ?? new Date()).toISOString() }
  );
  if (!rows.length) return null;

  const out = new Map<string, number>();
  for (const row of rows) {
    const end = until ? row.end_snap : row.total;
    if (row.base === null || end === null) continue;
    out.set(row.discord_id, Math.max(0, end - row.base));
  }
  return out;
}
