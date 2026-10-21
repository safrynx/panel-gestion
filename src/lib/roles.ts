import { db, stmt } from "./db";
import { invalidateConfig, loadConfig, roleNameIn } from "./config";

export type GuildRole = { id: string; name: string; position: number; color: number };

/** Replace the cached list of guild roles (names + hierarchy positions). */
export async function storeGuildRoles(roles: GuildRole[]): Promise<void> {
  const now = new Date().toISOString();
  const statements = roles.map((role) =>
    stmt(
      `INSERT INTO discord_roles (id, name, position, color, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, position = excluded.position, color = excluded.color, updated_at = excluded.updated_at`,
      [role.id, role.name, role.position, role.color, now]
    )
  );
  // Roles deleted on Discord disappear from the cache.
  if (roles.length) {
    statements.push(stmt(`DELETE FROM discord_roles WHERE id NOT IN (${roles.map(() => "?").join(",")})`, roles.map((r) => r.id)));
  }
  await db.batch(statements);
  invalidateConfig();
}

export async function listGuildRoles(): Promise<GuildRole[]> {
  return db.all<GuildRole>("SELECT id, name, position, color FROM discord_roles ORDER BY position DESC");
}

export async function roleName(roleId: string): Promise<string> {
  return roleNameIn(await loadConfig(), roleId);
}
