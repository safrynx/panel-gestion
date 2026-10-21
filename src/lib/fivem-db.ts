import mysql from "mysql2/promise";
import { db } from "./db";

/**
 * FiveM playtime read from the game server's own MySQL database (table of players, e.g. `users`).
 *
 * Env:
 *   FIVEM_DB_URL                mysql://user:password@host:3306/database   (read-only user recommended)
 *   FIVEM_DB_TABLE              default "users"
 *   FIVEM_DB_DISCORD_COLUMN     column holding the Discord id (plain id or "discord:123…"), default "discord"
 *   FIVEM_DB_PLAYTIME_COLUMN    cumulative playtime column, default "playtime"
 *   FIVEM_DB_PLAYTIME_UNIT      seconds | minutes | hours, default "minutes"
 *
 * The column holds a lifetime total, so weekly/monthly figures are computed as the difference between
 * snapshots of that total taken by the panel/bot (see `recordSnapshots`).
 */

const IDENT = /^[A-Za-z0-9_]+$/;
const UNIT_SECONDS: Record<string, number> = { seconds: 1, minutes: 60, hours: 3600 };
const CACHE_MS = 60_000;
const SNAPSHOT_EVERY_MS = 30 * 60_000;

export function fivemDbConfigured(): boolean {
  return Boolean(process.env.FIVEM_DB_URL);
}

function settings() {
  const table = process.env.FIVEM_DB_TABLE || "users";
  const discordColumn = process.env.FIVEM_DB_DISCORD_COLUMN || "discord";
  const playtimeColumn = process.env.FIVEM_DB_PLAYTIME_COLUMN || "playtime";
  const unit = (process.env.FIVEM_DB_PLAYTIME_UNIT || "minutes").toLowerCase();
  for (const value of [table, discordColumn, playtimeColumn]) {
    if (!IDENT.test(value)) throw new Error(`Invalid FIVEM_DB identifier: ${value}`);
  }
  if (!UNIT_SECONDS[unit]) throw new Error("FIVEM_DB_PLAYTIME_UNIT must be seconds, minutes or hours");
  return { table, discordColumn, playtimeColumn, factor: UNIT_SECONDS[unit] };
}

/** Pure: turn raw rows into a discordId -> seconds map (sums several characters of one player). */
export function parsePlaytimeRows(rows: { did: unknown; pt: unknown }[], factor: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.did ?? "").replace(/^discord:/i, "").trim();
    if (!/^\d{17,20}$/.test(id)) continue;
    const value = Number(row.pt);
    if (!Number.isFinite(value) || value < 0) continue;
    totals.set(id, (totals.get(id) ?? 0) + Math.floor(value * factor));
  }
  return totals;
}

const globalForPool = globalThis as unknown as { gtasunFivemPool?: mysql.Pool };
let cache: { at: number; totals: Map<string, number> } | null = null;
let lastError = "";

function getPool(): mysql.Pool {
  if (!globalForPool.gtasunFivemPool) {
    globalForPool.gtasunFivemPool = mysql.createPool({
      uri: process.env.FIVEM_DB_URL as string,
      connectionLimit: 2,
      connectTimeout: 5000
    });
  }
  return globalForPool.gtasunFivemPool;
}

export function fivemDbLastError(): string {
  return lastError;
}

/** Lifetime playtime (seconds) per Discord id, or null when the database is not configured / unreachable. */
export async function fetchPlaytimeTotals(force = false): Promise<Map<string, number> | null> {
  if (!fivemDbConfigured()) return null;
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.totals;
  try {
    const { table, discordColumn, playtimeColumn, factor } = settings();
    const [rows] = await getPool().query(`SELECT \`${discordColumn}\` AS did, \`${playtimeColumn}\` AS pt FROM \`${table}\``);
    const totals = parsePlaytimeRows(rows as { did: unknown; pt: unknown }[], factor);
    cache = { at: Date.now(), totals };
    lastError = "";
    recordSnapshots(totals);
    return totals;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.error("[fivem-db] query failed:", lastError);
    return cache?.totals ?? null;
  }
}

/** Store a snapshot of every staff member's total, at most every 30 minutes. */
function recordSnapshots(totals: Map<string, number>): void {
  const last = db.prepare("SELECT MAX(taken_at) AS at FROM playtime_snapshots").get() as { at: string | null };
  if (last.at && Date.now() - new Date(last.at).getTime() < SNAPSHOT_EVERY_MS) return;
  insertSnapshots(totals, new Date().toISOString());
}

function insertSnapshots(totals: Map<string, number>, takenAt: string): void {
  const members = db.prepare("SELECT discord_id FROM staff_members").all() as { discord_id: string }[];
  const insert = db.prepare("INSERT INTO playtime_snapshots (discord_id, seconds, taken_at) VALUES (?, ?, ?)");
  db.transaction(() => {
    for (const { discord_id } of members) {
      const seconds = totals.get(discord_id);
      if (seconds !== undefined) insert.run(discord_id, seconds, takenAt);
    }
  })();
}

/**
 * Playtime in seconds per Discord id over [since, until). Without `since`, the lifetime total.
 * Members without a usable snapshot baseline are left out so callers can fall back to agent data.
 */
export async function getFivemPlaytimes(since?: Date, until?: Date): Promise<Map<string, number> | null> {
  const totals = await fetchPlaytimeTotals();
  if (!totals) return null;
  if (!since) return totals;

  const atOrBefore = db.prepare(
    "SELECT seconds FROM playtime_snapshots WHERE discord_id = ? AND taken_at <= ? ORDER BY taken_at DESC LIMIT 1"
  );
  const earliest = db.prepare("SELECT seconds FROM playtime_snapshots WHERE discord_id = ? ORDER BY taken_at ASC LIMIT 1");
  const out = new Map<string, number>();
  for (const [discordId, total] of totals) {
    const base = (atOrBefore.get(discordId, since.toISOString()) ?? earliest.get(discordId)) as { seconds: number } | undefined;
    if (!base) continue;
    const endRow = until ? (atOrBefore.get(discordId, until.toISOString()) as { seconds: number } | undefined) : undefined;
    const end = until ? endRow?.seconds : total;
    if (end === undefined) continue;
    out.set(discordId, Math.max(0, end - base.seconds));
  }
  return out;
}

/** Force a fresh read and store a snapshot labelled `takenAt` (used as the zero point of a counter reset). */
export async function snapshotPlaytimeNow(takenAt: string): Promise<boolean> {
  const totals = await fetchPlaytimeTotals(true);
  if (!totals) return false;
  insertSnapshots(totals, takenAt);
  return true;
}
