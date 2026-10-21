import { db } from "./db";
import { parseGradeMapping, type GradeConfig } from "./grades";
import { ALL_PERMISSIONS, parsePermissions, type Permission } from "./permissions";

/**
 * Configuration shared by the web app, the bot and the tests.
 * Must not import anything Next.js-specific so the bot can use it.
 * Most settings live in SQLite (managed from the /admin panel); env vars are fallbacks.
 */

export type WarnRole = { level: number; roleId: string };

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

/** Who may open the panel: owners, users listed in panel_access, members holding a listed role. */
export function hasPanelAccess(discordId: string, roleIds: string[]): boolean {
  if (isOwnerId(discordId)) return true;
  const rows = db.prepare("SELECT kind, discord_id FROM panel_access").all() as { kind: string; discord_id: string }[];
  return rows.some((r) => (r.kind === "user" ? r.discord_id === discordId : roleIds.includes(r.discord_id)));
}

/**
 * The grade ladder. GRADE_ROLE_MAPPING_JSON wins when set (explicit levels); otherwise the roles
 * chosen in the admin panel are ordered by their Discord hierarchy position (higher position = higher grade).
 */
export function getGradeLadder(): GradeConfig[] {
  const fromEnv = parseGradeMapping(process.env.GRADE_ROLE_MAPPING_JSON);
  if (fromEnv.length) return fromEnv;
  const rows = db
    .prepare(
      `SELECT g.role_id AS role_id, COALESCE(r.name, g.role_id) AS name, COALESCE(r.position, 0) AS position
       FROM grade_roles g LEFT JOIN discord_roles r ON r.id = g.role_id
       ORDER BY position ASC, g.role_id ASC`
    )
    .all() as { role_id: string; name: string }[];
  return rows.map((row, index) => ({ name: row.name, level: index + 1, discordRoleId: row.role_id }));
}

/** Kept for existing callers: the grade ladder, lowest level first. */
export function getGradeMapping(): GradeConfig[] {
  return getGradeLadder();
}

export function getStaffRoleIds(): string[] {
  return [...new Set([...csv(process.env.DISCORD_STAFF_ROLE_IDS), ...getGradeLadder().map((g) => g.discordRoleId)])];
}

/** True when the member holds a staff role (explicit staff role or any grade role). */
export function hasStaffRole(roleIds: string[]): boolean {
  const staffRoleIds = getStaffRoleIds();
  return roleIds.some((r) => staffRoleIds.includes(r));
}

/** Given a guild member's roles, resolve their grade. Highest level wins. */
export function resolveGradeFromRoles(roleIds: string[]): { grade: string; gradeLevel: number; roleId: string } | null {
  const matches = getGradeLadder()
    .filter((g) => roleIds.includes(g.discordRoleId))
    .sort((a, b) => b.level - a.level);
  if (!matches.length) return null;
  return { grade: matches[0].name, gradeLevel: matches[0].level, roleId: matches[0].discordRoleId };
}

/**
 * Avert 1/2/3 roles: the ones configured in the admin panel, otherwise detected by role name
 * ("Avert 1", "Avertissement 2", …).
 */
export function getWarnRoles(): WarnRole[] {
  const configured = db.prepare("SELECT level, role_id FROM warn_roles ORDER BY level").all() as { level: number; role_id: string }[];
  if (configured.length) return configured.map((r) => ({ level: r.level, roleId: r.role_id }));
  const roles = db.prepare("SELECT id, name FROM discord_roles").all() as { id: string; name: string }[];
  const found = new Map<number, string>();
  for (const role of roles) {
    const match = /avert\w*\W*(?:n[°o]?\W*)?([1-3])\b/i.exec(role.name);
    if (match && !found.has(Number(match[1]))) found.set(Number(match[1]), role.id);
  }
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([level, roleId]) => ({ level, roleId }));
}

/** Highest avert level held according to Discord roles, or null when avert roles are not available. */
export function warnLevelFromRoles(roleIds: string[]): number | null {
  const warnRoles = getWarnRoles();
  if (!warnRoles.length) return null;
  return warnRoles.filter((w) => roleIds.includes(w.roleId)).reduce((max, w) => Math.max(max, w.level), 0);
}

/** Union of the permissions of the user's own entry and of every listed role they hold. Owners have all. */
export function getPermissions(discordId: string, roleIds: string[]): Permission[] {
  if (isOwnerId(discordId)) return [...ALL_PERMISSIONS];
  const rows = db.prepare("SELECT kind, discord_id, permissions FROM panel_access").all() as {
    kind: string; discord_id: string; permissions: string | null;
  }[];
  const granted = new Set<Permission>();
  for (const row of rows) {
    const matches = row.kind === "user" ? row.discord_id === discordId : roleIds.includes(row.discord_id);
    if (matches) parsePermissions(row.permissions).forEach((p) => granted.add(p));
  }
  return [...granted];
}
