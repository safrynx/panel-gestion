import { db, stmt, type Stmt } from "./db";

type Actor = { discordId: string; username?: string | null };

const SQL = "INSERT INTO audit_log (server_id, actor_discord_id, actor_name, action, target_discord_id, details) VALUES (?, ?, ?, ?, ?, ?)";

/** The statement that records an action; add it to a batch so the log entry is atomic with the change. */
export function auditStmt(serverId: string, actor: Actor | string, action: string, target: string | null, details: unknown): Stmt {
  const id = typeof actor === "string" ? actor : actor.discordId;
  const name = typeof actor === "string" ? null : actor.username ?? null;
  return stmt(SQL, [serverId, id, name, action, target, JSON.stringify(details ?? {})]);
}

/** Append an entry to a server's action log (shown on its Logs page). */
export async function audit(serverId: string, actor: Actor | string, action: string, target: string | null, details: unknown): Promise<void> {
  const s = auditStmt(serverId, actor, action, target, details);
  await db.run(s.sql, s.args);
}
