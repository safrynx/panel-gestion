import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "./db";
import { decodeSession, sessionCookieName } from "./session";
import { getPermissions, hasPanelAccess, isOwnerId, resolveGradeFromRoles } from "./config";
import type { Permission } from "./permissions";
import type { SessionUser } from "./types";

/**
 * Read the session cookie and return the authenticated user, or null.
 * Roles come from the database when the member has been synced (bot / login), so a
 * role removed on Discord revokes access without waiting for the cookie to expire.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const payload = decodeSession(store.get(sessionCookieName)?.value);
  if (!payload) return null;
  const row = await db.get<{ grade: string; grade_level: number; roles_json: string; left_guild_at: string | null; last_synced_at: string | null }>(
    "SELECT grade, grade_level, roles_json, left_guild_at, last_synced_at FROM staff_members WHERE discord_id = ?",
    [payload.discordId]
  );

  let roles = payload.roles;
  if (row?.left_guild_at) roles = [];
  else if (row?.last_synced_at) {
    try {
      roles = JSON.parse(row.roles_json) as string[];
    } catch {
      roles = [];
    }
  }

  return {
    discordId: payload.discordId,
    username: payload.username,
    avatarUrl: payload.avatarUrl,
    roles,
    permissions: await getPermissions(payload.discordId, roles),
    grade: row?.grade ?? "Membre",
    gradeLevel: row?.grade_level ?? 0
  };
}

/** True when the user may open the panel (owner, listed user, or holder of a listed role). */
export async function isStaffUser(user: SessionUser): Promise<boolean> {
  return hasPanelAccess(user.discordId, user.roles);
}

export function isOwner(user: SessionUser): boolean {
  return isOwnerId(user.discordId);
}

/** Management level in the grade ladder (0 = no managed grade). */
export async function getActorLevel(user: SessionUser): Promise<number> {
  return (await resolveGradeFromRoles(user.roles))?.gradeLevel ?? 0;
}

/** API guard: returns the staff user or a ready-made 401/403 response. */
export async function requireStaffApi(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (!(await isStaffUser(user))) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { user };
}

export function can(user: SessionUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

/** API guard: staff session that also holds `permission`. */
export async function requirePermissionApi(permission: Permission): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const guard = await requireStaffApi();
  if ("error" in guard) return guard;
  if (!can(guard.user, permission)) {
    return { error: NextResponse.json({ error: "forbidden_permission", permission }, { status: 403 }) };
  }
  return guard;
}

/** Page guard: sends users without `permission` back to the dashboard. */
export async function requirePermissionPage(permission: Permission): Promise<SessionUser> {
  const user = await requireStaffPage();
  if (!can(user, permission)) redirect("/");
  return user;
}

/** API guard for the access panel: panel owners only. */
export async function requireOwnerApi(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const guard = await requireStaffApi();
  if ("error" in guard) return guard;
  if (!isOwner(guard.user)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return guard;
}

export async function requireOwnerPage(): Promise<SessionUser> {
  const user = await requireStaffPage();
  if (!isOwner(user)) redirect("/");
  return user;
}

/** Page guard: redirects to /login when not authenticated or not staff. */
export async function requireStaffPage(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await isStaffUser(user))) redirect("/login?error=forbidden");
  return user;
}
