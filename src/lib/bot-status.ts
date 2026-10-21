import { db } from "./db";

/** The bot reports every 60 s; three missed beats and it is considered offline. */
const HEARTBEAT_MAX_AGE_MS = 180_000;

export async function setBotStatus(key: string, value: string): Promise<void> {
  await db.run(
    `INSERT INTO bot_status (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, new Date().toISOString()]
  );
}

export async function clearBotHeartbeat(): Promise<void> {
  await db.run("DELETE FROM bot_status WHERE key = 'heartbeat'");
}

export async function getStatusValue(key: string): Promise<string | null> {
  const row = await db.get<{ value: string }>("SELECT value FROM bot_status WHERE key = ?", [key]);
  return row?.value ?? null;
}

export type BotStatus = {
  /** True when the bot sent a heartbeat recently. */
  alive: boolean;
  heartbeatAt: string | null;
  /** Position of the bot's highest role: it can only manage roles below this position. */
  topRolePosition: number | null;
};

export async function getBotStatus(): Promise<BotStatus> {
  const rows = await db.all<{ key: string; value: string }>("SELECT key, value FROM bot_status WHERE key IN ('heartbeat', 'top_role_position')");
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const heartbeatAt = map.get("heartbeat") ?? null;
  const top = map.get("top_role_position");
  return {
    alive: heartbeatAt !== null && Date.now() - new Date(heartbeatAt).getTime() < HEARTBEAT_MAX_AGE_MS,
    heartbeatAt,
    topRolePosition: top === undefined ? null : Number(top)
  };
}

/**
 * Take a named lock that expires by itself (serverless instances share no memory, so the database is
 * the only place to coordinate). Returns true when the lock was obtained.
 */
export async function tryAcquireLock(name: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  const expired = new Date(now.getTime() - ttlMs).toISOString();
  const { changes } = await db.run(
    `INSERT INTO bot_status (key, value, updated_at) VALUES (@key, @now, @now)
     ON CONFLICT(key) DO UPDATE SET value = @now, updated_at = @now WHERE bot_status.value < @expired`,
    { key: `lock:${name}`, now: now.toISOString(), expired }
  );
  return changes > 0;
}

export async function releaseLock(name: string): Promise<void> {
  await db.run("DELETE FROM bot_status WHERE key = ?", [`lock:${name}`]);
}
