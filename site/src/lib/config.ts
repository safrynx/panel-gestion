import { db } from "./db";
import { parseGradeMapping, type GradeConfig } from "./grades";
import { ALL_PERMISSIONS, parsePermissions, type Permission } from "./permissions";
import { LEGACY_SERVER_ID } from "./servers";

/**
 * Configuration of one server, shared by pages, routes and the bot API.
 * Most settings live in the database (managed from the server's access page); env vars are fallbacks
 * for the legacy server only (they described the single server of the first version).
 *
 * They are read often (every request checks access and permissions), so one snapshot of the
 * small config tables is cached for a few seconds per server and per instance. A change made on another
 * instance is therefore visible after at most CONFIG_CACHE_MS (default 5 s).
 */

export type WarnRole = { level: number; roleId: string };

export type ConfigSnapshot = {
  serverId: string;
  access: { kind: string; discord_id: string; permissions: string | null }[];
  gradeRows: { role_id: string; name: string; position: number }[];
  warnRows: { level: number; role_id: string }[];
  roles: { id: string; name: string }[];
  owners: string[];
  at: number;
};

const cache = new Map<string, ConfigSnapshot>();

/** Drop the cached snapshot of one server (or of all servers). */
export function invalidateConfig(serverId?: string): void {
  if (serverId) cache.delete(serverId);
  else cache.clear();
}

export async function loadConfig(serverId: string): Promise<ConfigSnapshot> {
  const ttl = Number(process.env.CONFIG_CACHE_MS ?? 5000);
  const hit = cache.get(serverId);
  if (hit && Date.now() - hit.at < ttl) return hit;
  const [access, grades, warn, roles, owners] = await db.batch(
    [
      { sql: "SELECT kind, discord_id, permissions FROM panel_access WHERE server_id = ?", args: [serverId] },
      {
        sql: `SELECT g.role_id AS role_id, COALESCE(r.name, g.role_id) AS name, COALESCE(r.position, 0) AS position
              FROM grade_roles g LEFT JOIN discord_roles r ON r.id = g.role_id AND r.server_id = g.server_id
              WHERE g.server_id = ?`,
        args: [serverId]
      },
      { sql: "SELECT level, role_id FROM warn_roles WHERE server_id = ? ORDER BY level", args: [serverId] },
      { sql: "SELECT id, name FROM discord_roles WHERE server_id = ?", args: [serverId] },
      { sql: "SELECT discord_id FROM server_owners WHERE server_id = ?", args: [serverId] }
    ],
    "read"
  );
  const snapshot: ConfigSnapshot = {
    serverId,
    access: access.rows as ConfigSnapshot["access"],
    gradeRows: grades.rows as ConfigSnapshot["gradeRows"],
    warnRows: warn.rows as ConfigSnapshot["warnRows"],
    roles: roles.rows as ConfigSnapshot["roles"],
    owners: owners.rows.map((r) => String(r.discord_id)),
    at: Date.now()
  };
  cache.set(serverId, snapshot);
  return snapshot;
}

function csv(raw: string | undefined): string[] {
  return (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Platform owners (env PANEL_OWNER_IDS): every server, every permission, and they create servers. */
export function getPlatformOwnerIds(): string[] {
  return csv(process.env.PANEL_OWNER_IDS);
}

export function isPlatformOwner(discordId: string): boolean {
  return getPlatformOwnerIds().includes(discordId);
}

const isLegacy = (cfg: ConfigSnapshot) => cfg.serverId === LEGACY_SERVER_ID;

// ---- pure helpers on a snapshot (use these inside loops: no database access) ----

/** Owner of this server: listed in server_owners, or platform owner. */
export function isServerOwnerIn(cfg: ConfigSnapshot, discordId: string): boolean {
  return isPlatformOwner(discordId) || cfg.owners.includes(discordId);
}

/**
 * The grade ladder. On the legacy server GRADE_ROLE_MAPPING_JSON wins when set (explicit levels); otherwise the
 * roles chosen in the access page are ordered by their Discord hierarchy position (higher position = higher grade).
 */
export function ladderIn(cfg: ConfigSnapshot): GradeConfig[] {
  const fromEnv = isLegacy(cfg) ? parseGradeMapping(process.env.GRADE_ROLE_MAPPING_JSON) : [];
  if (fromEnv.length) return fromEnv;
  return [...cfg.gradeRows]
    .sort((a, b) => a.position - b.position || a.role_id.localeCompare(b.role_id))
    .map((row, index) => ({ name: row.name, level: index + 1, discordRoleId: row.role_id }));
}

export function staffRoleIdsIn(cfg: ConfigSnapshot): string[] {
  const fromEnv = isLegacy(cfg) ? csv(process.env.DISCORD_STAFF_ROLE_IDS) : [];
  return [...new Set([...fromEnv, ...ladderIn(cfg).map((g) => g.discordRoleId)])];
}

export function hasStaffRoleIn(cfg: ConfigSnapshot, roleIds: string[]): boolean {
  const staff = staffRoleIdsIn(cfg);
  return roleIds.some((r) => staff.includes(r));
}

export function resolveGradeIn(cfg: ConfigSnapshot, roleIds: string[]): { grade: string; gradeLevel: number; roleId: string } | null {
  const matches = ladderIn(cfg)
    .filter((g) => roleIds.includes(g.discordRoleId))
    .sort((a, b) => b.level - a.level);
  if (!matches.length) return null;
  return { grade: matches[0].name, gradeLevel: matches[0].level, roleId: matches[0].discordRoleId };
}

/** Avert 1/2/3 roles: the ones configured in the access page, otherwise detected by role name ("Avert 1", "Avertissement 2"…). */
export function warnRolesIn(cfg: ConfigSnapshot): WarnRole[] {
  if (cfg.warnRows.length) return cfg.warnRows.map((r) => ({ level: r.level, roleId: r.role_id }));
  const found = new Map<number, string>();
  for (const role of cfg.roles) {
    const match = /avert\w*\W*(?:n[°o]?\W*)?([1-3])\b/i.exec(role.name);
    if (match && !found.has(Number(match[1]))) found.set(Number(match[1]), role.id);
  }
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([level, roleId]) => ({ level, roleId }));
}

/** Highest avert level held according to Discord roles, or null when avert roles are not available. */
export function warnLevelIn(cfg: ConfigSnapshot, roleIds: string[]): number | null {
  const warnRoles = warnRolesIn(cfg);
  if (!warnRoles.length) return null;
  return warnRoles.filter((w) => roleIds.includes(w.roleId)).reduce((max, w) => Math.max(max, w.level), 0);
}

export function hasPanelAccessIn(cfg: ConfigSnapshot, discordId: string, roleIds: string[]): boolean {
  if (isServerOwnerIn(cfg, discordId)) return true;
  return cfg.access.some((r) => (r.kind === "user" ? r.discord_id === discordId : roleIds.includes(r.discord_id)));
}

/** Union of the permissions of the user's own entry and of every listed role they hold. Owners have all. */
export function permissionsIn(cfg: ConfigSnapshot, discordId: string, roleIds: string[]): Permission[] {
  if (isServerOwnerIn(cfg, discordId)) return [...ALL_PERMISSIONS];
  const granted = new Set<Permission>();
  for (const row of cfg.access) {
    const matches = row.kind === "user" ? row.discord_id === discordId : roleIds.includes(row.discord_id);
    if (matches) parsePermissions(row.permissions).forEach((p) => granted.add(p));
  }
  return [...granted];
}

export function roleNameIn(cfg: ConfigSnapshot, roleId: string): string {
  return cfg.roles.find((r) => r.id === roleId)?.name ?? roleId;
}

// ---- async conveniences ----

export async function getGradeLadder(serverId: string): Promise<GradeConfig[]> {
  return ladderIn(await loadConfig(serverId));
}

export async function getStaffRoleIds(serverId: string): Promise<string[]> {
  return staffRoleIdsIn(await loadConfig(serverId));
}

export async function hasStaffRole(serverId: string, roleIds: string[]): Promise<boolean> {
  return hasStaffRoleIn(await loadConfig(serverId), roleIds);
}

export async function resolveGradeFromRoles(serverId: string, roleIds: string[]) {
  return resolveGradeIn(await loadConfig(serverId), roleIds);
}

export async function getWarnRoles(serverId: string): Promise<WarnRole[]> {
  return warnRolesIn(await loadConfig(serverId));
}

export async function warnLevelFromRoles(serverId: string, roleIds: string[]): Promise<number | null> {
  return warnLevelIn(await loadConfig(serverId), roleIds);
}

export async function hasPanelAccess(serverId: string, discordId: string, roleIds: string[]): Promise<boolean> {
  return hasPanelAccessIn(await loadConfig(serverId), discordId, roleIds);
}

export async function getPermissions(serverId: string, discordId: string, roleIds: string[]): Promise<Permission[]> {
  return permissionsIn(await loadConfig(serverId), discordId, roleIds);
}

export async function isServerOwner(serverId: string, discordId: string): Promise<boolean> {
  return isServerOwnerIn(await loadConfig(serverId), discordId);
}
