import { db, stmt } from "./db";
import { invalidateConfig, loadConfig, roleNameIn } from "./config";

export type GuildRole = { id: string; name: string; position: number; color: number };

/** Replace the cached list of a server's guild roles (names + hierarchy positions). */
export async function storeGuildRoles(serverId: string, roles: GuildRole[]): Promise<void> {
  const now = new Date().toISOString();
  const statements = roles.map((role) =>
    stmt(
      `INSERT INTO discord_roles (id, server_id, name, position, color, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET server_id = excluded.server_id, name = excluded.name, position = excluded.position,
         color = excluded.color, updated_at = excluded.updated_at`,
      [role.id, serverId, role.name, role.position, role.color, now]
    )
  );
  // Roles deleted on Discord disappear from the cache.
  if (roles.length) {
    statements.push(stmt(`DELETE FROM discord_roles WHERE server_id = ? AND id NOT IN (${roles.map(() => "?").join(",")})`, [serverId, ...roles.map((r) => r.id)]));
  }
  await db.batch(statements);
  invalidateConfig(serverId);
}

export async function listGuildRoles(serverId: string): Promise<GuildRole[]> {
  return db.all<GuildRole>("SELECT id, name, position, color FROM discord_roles WHERE server_id = ? ORDER BY position DESC", [serverId]);
}

export async function roleName(serverId: string, roleId: string): Promise<string> {
  return roleNameIn(await loadConfig(serverId), roleId);
}
