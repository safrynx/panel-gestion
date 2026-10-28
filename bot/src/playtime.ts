import mysql from "mysql2/promise";

/**
 * FiveM playtime read from each game server's own MySQL database (table of players, e.g. `users`).
 * The bot reads it and pushes the totals to the site, so the site never has to reach the game databases.
 *
 * One database per Discord guild (= per server of the panel):
 *   FIVEM_DATABASES_JSON   {"<guildId>": {"url": "mysql://…", "table": "users", "discordColumn": "discord",
 *                                         "playtimeColumn": "playtime", "unit": "minutes"}, …}
 *                          (every key but `url` is optional; a read-only MySQL user is recommended)
 * Single-server setup (still supported, applies to DISCORD_GUILD_ID):
 *   FIVEM_DB_URL, FIVEM_DB_TABLE, FIVEM_DB_DISCORD_COLUMN, FIVEM_DB_PLAYTIME_COLUMN, FIVEM_DB_PLAYTIME_UNIT
 */

const IDENT = /^[A-Za-z0-9_]+$/;
const UNIT_SECONDS: Record<string, number> = { seconds: 1, minutes: 60, hours: 3600 };

export type PlaytimeSource = { guildId: string; url: string; table: string; discordColumn: string; playtimeColumn: string; factor: number };

type RawSource = { url?: string; table?: string; discordColumn?: string; playtimeColumn?: string; unit?: string };

function toSource(guildId: string, raw: RawSource): PlaytimeSource {
  if (!raw.url) throw new Error(`FiveM database of guild ${guildId}: url is missing`);
  const table = raw.table || "users";
  const discordColumn = raw.discordColumn || "discord";
  const playtimeColumn = raw.playtimeColumn || "playtime";
  const unit = (raw.unit || "minutes").toLowerCase();
  for (const value of [table, discordColumn, playtimeColumn]) {
    if (!IDENT.test(value)) throw new Error(`Invalid FiveM database identifier: ${value}`);
  }
  if (!UNIT_SECONDS[unit]) throw new Error("FiveM playtime unit must be seconds, minutes or hours");
  return { guildId, url: raw.url, table, discordColumn, playtimeColumn, factor: UNIT_SECONDS[unit] };
}

/** Every configured game database, keyed by the guild it belongs to. Throws on an invalid configuration. */
export function playtimeSources(env: NodeJS.ProcessEnv = process.env): PlaytimeSource[] {
  const sources = new Map<string, PlaytimeSource>();
  if (env.FIVEM_DB_URL && env.DISCORD_GUILD_ID) {
    sources.set(env.DISCORD_GUILD_ID, toSource(env.DISCORD_GUILD_ID, {
      url: env.FIVEM_DB_URL,
      table: env.FIVEM_DB_TABLE,
      discordColumn: env.FIVEM_DB_DISCORD_COLUMN,
      playtimeColumn: env.FIVEM_DB_PLAYTIME_COLUMN,
      unit: env.FIVEM_DB_PLAYTIME_UNIT
    }));
  }
  if (env.FIVEM_DATABASES_JSON) {
    const parsed = JSON.parse(env.FIVEM_DATABASES_JSON) as Record<string, RawSource>;
    for (const [guildId, raw] of Object.entries(parsed)) {
      if (!/^\d{17,20}$/.test(guildId)) throw new Error(`FIVEM_DATABASES_JSON: "${guildId}" is not a Discord guild id`);
      sources.set(guildId, toSource(guildId, raw));
    }
  }
  return [...sources.values()];
}

/** Pure: turn raw rows into a list of { discordId, seconds } (sums several characters of one player). */
export function parsePlaytimeRows(rows: { did: unknown; pt: unknown }[], factor: number): { discordId: string; seconds: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.did ?? "").replace(/^discord:/i, "").trim();
    if (!/^\d{17,20}$/.test(id)) continue;
    const value = Number(row.pt);
    if (!Number.isFinite(value) || value < 0) continue;
    totals.set(id, (totals.get(id) ?? 0) + Math.floor(value * factor));
  }
  return [...totals].map(([discordId, seconds]) => ({ discordId, seconds }));
}

const pools = new Map<string, mysql.Pool>();

/** Lifetime playtime per Discord id, read from one game database. */
export async function readPlaytimeTotals(source: PlaytimeSource): Promise<{ discordId: string; seconds: number }[]> {
  let pool = pools.get(source.url);
  if (!pool) {
    pool = mysql.createPool({ uri: source.url, connectionLimit: 2, connectTimeout: 8000 });
    pools.set(source.url, pool);
  }
  const [rows] = await pool.query(`SELECT \`${source.discordColumn}\` AS did, \`${source.playtimeColumn}\` AS pt FROM \`${source.table}\``);
  return parsePlaytimeRows(rows as { did: unknown; pt: unknown }[], source.factor);
}
