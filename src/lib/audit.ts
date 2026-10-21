import { db, stmt, type Stmt } from "./db";

type Actor = { discordId: string; username?: string | null };

const SQL = "INSERT INTO audit_log (actor_discord_id, actor_name, action, target_discord_id, details) VALUES (?, ?, ?, ?, ?)";

/** The statement that records an action; add it to a batch so the log entry is atomic with the change. */
export function auditStmt(actor: Actor | string, action: string, target: string | null, details: unknown): Stmt {
  const id = typeof actor === "string" ? actor : actor.discordId;
  const name = typeof actor === "string" ? null : actor.username ?? null;
  return stmt(SQL, [id, name, action, target, JSON.stringify(details ?? {})]);
}

/** Append an entry to the action log (shown on the Logs page). */
export async function audit(actor: Actor | string, action: string, target: string | null, details: unknown): Promise<void> {
  const s = auditStmt(actor, action, target, details);
  await db.run(s.sql, s.args);
}
