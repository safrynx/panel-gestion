import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireOwnerApi } from "@/lib/auth";
import { invalidateConfig } from "@/lib/config";
import { refreshGuildRoles } from "@/lib/discord";
import { ALL_PERMISSIONS, DEFAULT_NEW_PERMISSIONS } from "@/lib/permissions";
import { roleName } from "@/lib/roles";

export const runtime = "nodejs";

const id = z.string().regex(/^\d{17,20}$/);
const permissionList = z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]]));

const schemas = {
  access_add: z.object({ type: z.enum(["user", "role"]), discordId: id, label: z.string().trim().max(100).optional(), permissions: permissionList.optional() }),
  access_remove: z.object({ id: z.number().int().positive() }),
  access_permissions: z.object({ id: z.number().int().positive(), permissions: permissionList }),
  grade_role_add: z.object({ roleId: id }),
  grade_role_remove: z.object({ roleId: id }),
  warn_role_set: z.object({ level: z.number().int().min(1).max(3), roleId: id.nullable() }),
  roles_refresh: z.object({})
} as const;

type AccessRow = { kind: "user" | "role"; discord_id: string; label: string | null };

/** Human label for a log entry: role name, known username, or the saved note. */
async function labelFor(row: AccessRow): Promise<string> {
  if (row.kind === "role") return roleName(row.discord_id);
  const member = await db.get<{ username: string }>("SELECT username FROM staff_members WHERE discord_id = ?", [row.discord_id]);
  return member?.username ?? row.label ?? row.discord_id;
}

/** POST /api/access?kind=… — manage who can open the panel, what each can do, and which roles drive grades / warnings. Owners only. */
export async function POST(req: NextRequest) {
  const guard = await requireOwnerApi();
  if ("error" in guard) return guard.error;
  const actor = { discordId: guard.user.discordId, username: guard.user.username };

  const kind = req.nextUrl.searchParams.get("kind") as keyof typeof schemas | null;
  if (!kind || !(kind in schemas)) return NextResponse.json({ error: "unknown_kind" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const parsed = schemas[kind].safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  const data = parsed.data as Record<string, unknown>;

  switch (kind) {
    case "access_add": {
      const permissions = (data.permissions as string[] | undefined) ?? DEFAULT_NEW_PERMISSIONS;
      const info = await db.run(
        "INSERT OR IGNORE INTO panel_access (kind, discord_id, label, added_by, permissions) VALUES (?, ?, ?, ?, ?)",
        [data.type as string, data.discordId as string, (data.label as string) ?? null, actor.discordId, JSON.stringify(permissions)]
      );
      if (info.changes === 0) return NextResponse.json({ error: "already_exists" }, { status: 409 });
      invalidateConfig();
      await audit(actor, "access_add", null, {
        type: data.type, discordId: data.discordId,
        label: await labelFor({ kind: data.type as "user" | "role", discord_id: data.discordId as string, label: (data.label as string) ?? null })
      });
      break;
    }
    case "access_remove": {
      const row = await db.get<AccessRow>("SELECT kind, discord_id, label FROM panel_access WHERE id = ?", [data.id as number]);
      if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
      await db.run("DELETE FROM panel_access WHERE id = ?", [data.id as number]);
      invalidateConfig();
      await audit(actor, "access_remove", null, { type: row.kind, discordId: row.discord_id, label: await labelFor(row) });
      break;
    }
    case "access_permissions": {
      const row = await db.get<AccessRow>("SELECT kind, discord_id, label FROM panel_access WHERE id = ?", [data.id as number]);
      if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
      await db.run("UPDATE panel_access SET permissions = ? WHERE id = ?", [JSON.stringify(data.permissions), data.id as number]);
      invalidateConfig();
      await audit(actor, "access_permissions", null, { discordId: row.discord_id, label: await labelFor(row), permissions: data.permissions });
      break;
    }
    case "grade_role_add":
      await db.run("INSERT OR IGNORE INTO grade_roles (role_id) VALUES (?)", [data.roleId as string]);
      invalidateConfig();
      await audit(actor, "grade_role_add", null, { roleId: data.roleId, label: await roleName(data.roleId as string) });
      break;
    case "grade_role_remove":
      await db.run("DELETE FROM grade_roles WHERE role_id = ?", [data.roleId as string]);
      invalidateConfig();
      await audit(actor, "grade_role_remove", null, { roleId: data.roleId, label: await roleName(data.roleId as string) });
      break;
    case "warn_role_set":
      if (data.roleId) {
        await db.run("INSERT INTO warn_roles (level, role_id) VALUES (?, ?) ON CONFLICT(level) DO UPDATE SET role_id = excluded.role_id", [data.level as number, data.roleId as string]);
      } else {
        await db.run("DELETE FROM warn_roles WHERE level = ?", [data.level as number]);
      }
      invalidateConfig();
      await audit(actor, "warn_role_set", null, { level: data.level, roleId: data.roleId });
      break;
    case "roles_refresh": {
      const count = await refreshGuildRoles();
      if (count === null) return NextResponse.json({ error: "bot_unavailable", hint: "Check DISCORD_BOT_TOKEN and DISCORD_GUILD_ID" }, { status: 503 });
      return NextResponse.json({ ok: true, roles: count });
    }
  }
  return NextResponse.json({ ok: true });
}
