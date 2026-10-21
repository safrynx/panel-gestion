import { db } from "./db";

export type GuildRole = { id: string; name: string; position: number; color: number };

/** Replace the cached list of guild roles (names + hierarchy positions). */
export function storeGuildRoles(roles: GuildRole[]): void {
  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO discord_roles (id, name, position, color, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, position = excluded.position, color = excluded.color, updated_at = excluded.updated_at`
  );
  db.transaction(() => {
    for (const role of roles) upsert.run(role.id, role.name, role.position, role.color, now);
    // Roles deleted on Discord disappear from the cache.
    const keep = new Set(roles.map((r) => r.id));
    const existing = db.prepare("SELECT id FROM discord_roles").all() as { id: string }[];
    for (const { id } of existing) if (!keep.has(id)) db.prepare("DELETE FROM discord_roles WHERE id = ?").run(id);
  })();
}

export function listGuildRoles(): GuildRole[] {
  return db.prepare("SELECT id, name, position, color FROM discord_roles ORDER BY position DESC").all() as GuildRole[];
}

export function roleName(roleId: string): string {
  const row = db.prepare("SELECT name FROM discord_roles WHERE id = ?").get(roleId) as { name: string } | undefined;
  return row?.name ?? roleId;
}
