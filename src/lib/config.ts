import { db } from "./db";
import { parseGradeMapping, type GradeConfig } from "./grades";
import { ALL_PERMISSIONS, parsePermissions, type Permission } from "./permissions";

/**
 * Configuration shared by pages, routes and the bot API.
 * Most settings live in the database (managed from the /admin panel); env vars are fallbacks.
 *
 * They are read often (every request checks access and permissions), so one snapshot of the
 * small config tables is cached for a few seconds per server instance. A change made on another
 * instance is therefore visible after at most CONFIG_CACHE_MS (default 5 s).
 */

export type WarnRole = { level: number; roleId: string };

export type ConfigSnapshot = {
  access: { kind: string; discord_id: string; permissions: string | null }[];
  gradeRows: { role_id: string; name: string; position: number }[];
  warnRows: { level: number; role_id: string }[];
  roles: { id: string; name: string }[];
  at: number;
};

let cache: ConfigSnapshot | null = null;

export function invalidateConfig(): void {
  cache = null;
}

export async function loadConfig(): Promise<ConfigSnapshot> {
  const ttl = Number(process.env.CONFIG_CACHE_MS ?? 5000);
  if (cache && Date.now() - cache.at < ttl) return cache;
  const [access, grades, warn, roles] = await db.batch(
    [
      { sql: "SELECT kind, discord_id, permissions FROM panel_access" },
      {
        sql: `SELECT g.role_id AS role_id, COALESCE(r.name, g.role_id) AS name, COALESCE(r.position, 0) AS position
              FROM grade_roles g LEFT JOIN discord_roles r ON r.id = g.role_id`
      },
      { sql: "SELECT level, role_id FROM warn_roles ORDER BY level" },
      { sql: "SELECT id, name FROM discord_roles" }
    ],
    "read"
  );
  cache = {
    access: access.rows as ConfigSnapshot["access"],
    gradeRows: grades.rows as ConfigSnapshot["gradeRows"],
    warnRows: warn.rows as ConfigSnapshot["warnRows"],
    roles: roles.rows as ConfigSnapshot["roles"],
    at: Date.now()
  };
  return cache;
}

function csv(raw: string | undefined): string[] {
  return (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Panel owners (env PANEL_OWNER_IDS): always have access and manage the access panel. */
export function getOwnerIds(): string[] {
  return csv(process.env.PANEL_OWNER_IDS);
}

export function isOwnerId(discordId: string): boolean {
  return getOwnerIds().includes(discordId);
}

// ---- pure helpers on a snapshot (use these inside loops: no database access) ----

/**
 * The grade ladder. GRADE_ROLE_MAPPING_JSON wins when set (explicit levels); otherwise the roles
 * chosen in the admin panel are ordered by their Discord hierarchy position (higher position = higher grade).
 */
export function ladderIn(cfg: ConfigSnapshot): GradeConfig[] {
  const fromEnv = parseGradeMapping(process.env.GRADE_ROLE_MAPPING_JSON);
  if (fromEnv.length) return fromEnv;
  return [...cfg.gradeRows]
    .sort((a, b) => a.position - b.position || a.role_id.localeCompare(b.role_id))
    .map((row, index) => ({ name: row.name, level: index + 1, discordRoleId: row.role_id }));
}

export function staffRoleIdsIn(cfg: ConfigSnapshot): string[] {
  return [...new Set([...csv(process.env.DISCORD_STAFF_ROLE_IDS), ...ladderIn(cfg).map((g) => g.discordRoleId)])];
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

/** Avert 1/2/3 roles: the ones configured in the admin panel, otherwise detected by role name ("Avert 1", "Avertissement 2"…). */
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
  if (isOwnerId(discordId)) return true;
  return cfg.access.some((r) => (r.kind === "user" ? r.discord_id === discordId : roleIds.includes(r.discord_id)));
}

/** Union of the permissions of the user's own entry and of every listed role they hold. Owners have all. */
export function permissionsIn(cfg: ConfigSnapshot, discordId: string, roleIds: string[]): Permission[] {
  if (isOwnerId(discordId)) return [...ALL_PERMISSIONS];
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

export async function getGradeLadder(): Promise<GradeConfig[]> {
  return ladderIn(await loadConfig());
}

/** Kept for existing callers: the grade ladder, lowest level first. */
export const getGradeMapping = getGradeLadder;

export async function getStaffRoleIds(): Promise<string[]> {
  return staffRoleIdsIn(await loadConfig());
}

export async function hasStaffRole(roleIds: string[]): Promise<boolean> {
  return hasStaffRoleIn(await loadConfig(), roleIds);
}

export async function resolveGradeFromRoles(roleIds: string[]) {
  return resolveGradeIn(await loadConfig(), roleIds);
}

export async function getWarnRoles(): Promise<WarnRole[]> {
  return warnRolesIn(await loadConfig());
}

export async function warnLevelFromRoles(roleIds: string[]): Promise<number | null> {
  return warnLevelIn(await loadConfig(), roleIds);
}

export async function hasPanelAccess(discordId: string, roleIds: string[]): Promise<boolean> {
  return hasPanelAccessIn(await loadConfig(), discordId, roleIds);
}

export async function getPermissions(discordId: string, roleIds: string[]): Promise<Permission[]> {
  return permissionsIn(await loadConfig(), discordId, roleIds);
}
