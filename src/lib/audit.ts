import { db } from "./db";

type Actor = { discordId: string; username?: string | null };

/** Append an entry to the action log (shown on the Logs page). */
export function audit(actor: Actor | string, action: string, target: string | null, details: unknown): void {
  const id = typeof actor === "string" ? actor : actor.discordId;
  const name = typeof actor === "string" ? null : actor.username ?? null;
  db.prepare("INSERT INTO audit_log (actor_discord_id, actor_name, action, target_discord_id, details) VALUES (?, ?, ?, ?, ?)")
    .run(id, name, action, target, JSON.stringify(details ?? {}));
}
