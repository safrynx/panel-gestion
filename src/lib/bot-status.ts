import { db } from "./db";

const HEARTBEAT_MAX_AGE_MS = 90_000;

export function setBotStatus(key: string, value: string): void {
  db.prepare(
    `INSERT INTO bot_status (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, new Date().toISOString());
}

export function clearBotHeartbeat(): void {
  db.prepare("DELETE FROM bot_status WHERE key = 'heartbeat'").run();
}

export type BotStatus = {
  /** True when the bot sent a heartbeat in the last 90 seconds. */
  alive: boolean;
  heartbeatAt: string | null;
  /** Position of the bot's highest role: it can only manage roles below this position. */
  topRolePosition: number | null;
};

export function getBotStatus(): BotStatus {
  const rows = db.prepare("SELECT key, value FROM bot_status").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const heartbeatAt = map.get("heartbeat") ?? null;
  const top = map.get("top_role_position");
  return {
    alive: heartbeatAt !== null && Date.now() - new Date(heartbeatAt).getTime() < HEARTBEAT_MAX_AGE_MS,
    heartbeatAt,
    topRolePosition: top === undefined ? null : Number(top)
  };
}

export function getStatusValue(key: string): string | null {
  const row = db.prepare("SELECT value FROM bot_status WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
