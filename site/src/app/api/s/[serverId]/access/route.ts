import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireOwnerApi } from "@/lib/auth";
import { invalidateConfig, isPlatformOwner } from "@/lib/config";
import { refreshGuildRoles } from "@/lib/discord";
import { ALL_PERMISSIONS, DEFAULT_NEW_PERMISSIONS } from "@/lib/permissions";
import { roleName } from "@/lib/roles";
import type { ServerRouteContext } from "@/lib/route";
import { addServerOwner, deleteServer, isValidTimeZone, LEGACY_SERVER_ID, listServerOwners, managesGuild, removeServerOwner, rotateFivemToken, updateServer } from "@/lib/servers";

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
  roles_refresh: z.object({}),
  server_update: z.object({
    name: z.string().trim().min(2).max(60).optional(),
    guildId: id.nullable().optional(),
    timezone: z.string().trim().max(60).nullable().optional(),
    reviewHour: z.number().int().min(0).max(23).nullable().optional()
  }),
  owner_add: z.object({ discordId: id }),
  owner_remove: z.object({ discordId: id }),
  fivem_token_rotate: z.object({}),
  server_delete: z.object({ confirm: z.string() })
} as const;

type AccessRow = { kind: "user" | "role"; discord_id: string; label: string | null };

/** POST /api/s/:serverId/access?kind=… — who can open the server's panel, what each can do, which roles drive grades / warnings, and the server's settings. Owners only. */
export async function POST(req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requireOwnerApi((await params).serverId);
  if ("error" in guard) return guard.error;
  const { server } = guard;
  const serverId = server.id;
  const actor = { discordId: guard.user.discordId, username: guard.user.username };

  /** Human label for a log entry: role name, known username, or the saved note. */
  const labelFor = async (row: AccessRow): Promise<string> => {
    if (row.kind === "role") return roleName(serverId, row.discord_id);
    const member = await db.get<{ username: string }>("SELECT username FROM staff_members WHERE server_id = ? AND discord_id = ?", [serverId, row.discord_id]);
    return member?.username ?? row.label ?? row.discord_id;
  };

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
        "INSERT OR IGNORE INTO panel_access (server_id, kind, discord_id, label, added_by, permissions) VALUES (?, ?, ?, ?, ?, ?)",
        [serverId, data.type as string, data.discordId as string, (data.label as string) ?? null, actor.discordId, JSON.stringify(permissions)]
      );
      if (info.changes === 0) return NextResponse.json({ error: "already_exists" }, { status: 409 });
      invalidateConfig(serverId);
      await audit(serverId, actor, "access_add", null, {
        type: data.type, discordId: data.discordId,
        label: await labelFor({ kind: data.type as "user" | "role", discord_id: data.discordId as string, label: (data.label as string) ?? null })
      });
      break;
    }
    case "access_remove": {
      const row = await db.get<AccessRow>("SELECT kind, discord_id, label FROM panel_access WHERE id = ? AND server_id = ?", [data.id as number, serverId]);
      if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
      await db.run("DELETE FROM panel_access WHERE id = ? AND server_id = ?", [data.id as number, serverId]);
      invalidateConfig(serverId);
      await audit(serverId, actor, "access_remove", null, { type: row.kind, discordId: row.discord_id, label: await labelFor(row) });
      break;
    }
    case "access_permissions": {
      const row = await db.get<AccessRow>("SELECT kind, discord_id, label FROM panel_access WHERE id = ? AND server_id = ?", [data.id as number, serverId]);
      if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
      await db.run("UPDATE panel_access SET permissions = ? WHERE id = ? AND server_id = ?", [JSON.stringify(data.permissions), data.id as number, serverId]);
      invalidateConfig(serverId);
      await audit(serverId, actor, "access_permissions", null, { discordId: row.discord_id, label: await labelFor(row), permissions: data.permissions });
      break;
    }
    case "grade_role_add":
      await db.run("INSERT OR IGNORE INTO grade_roles (role_id, server_id) VALUES (?, ?)", [data.roleId as string, serverId]);
      invalidateConfig(serverId);
      await audit(serverId, actor, "grade_role_add", null, { roleId: data.roleId, label: await roleName(serverId, data.roleId as string) });
      break;
    case "grade_role_remove":
      await db.run("DELETE FROM grade_roles WHERE role_id = ? AND server_id = ?", [data.roleId as string, serverId]);
      invalidateConfig(serverId);
      await audit(serverId, actor, "grade_role_remove", null, { roleId: data.roleId, label: await roleName(serverId, data.roleId as string) });
      break;
    case "warn_role_set":
      if (data.roleId) {
        await db.run(
          "INSERT INTO warn_roles (server_id, level, role_id) VALUES (?, ?, ?) ON CONFLICT(server_id, level) DO UPDATE SET role_id = excluded.role_id",
          [serverId, data.level as number, data.roleId as string]
        );
      } else {
        await db.run("DELETE FROM warn_roles WHERE server_id = ? AND level = ?", [serverId, data.level as number]);
      }
      invalidateConfig(serverId);
      await audit(serverId, actor, "warn_role_set", null, { level: data.level, roleId: data.roleId });
      break;
    case "roles_refresh": {
      const count = await refreshGuildRoles(serverId, server.guildId);
      if (count === null) return NextResponse.json({ error: "bot_unavailable", hint: "Check DISCORD_BOT_TOKEN and that the bot is in this guild" }, { status: 503 });
      return NextResponse.json({ ok: true, roles: count });
    }
    case "server_update": {
      const settings = data as { name?: string; guildId?: string | null; timezone?: string | null; reviewHour?: number | null };
      if (settings.timezone && !isValidTimeZone(settings.timezone)) return NextResponse.json({ error: "invalid_timezone" }, { status: 400 });
      // Moving a server to another guild changes whose data it receives: only to a guild the owner manages on Discord.
      if (settings.guildId !== undefined && settings.guildId !== server.guildId && !isPlatformOwner(actor.discordId)) {
        if (!settings.guildId) return NextResponse.json({ error: "guild_required" }, { status: 400 });
        if (!(await managesGuild(actor.discordId, settings.guildId))) return NextResponse.json({ error: "guild_not_managed" }, { status: 403 });
      }
      // An empty time zone means "back to the default".
      const result = await updateServer(serverId, { ...settings, timezone: settings.timezone === "" ? null : settings.timezone });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      await audit(serverId, actor, "server_update", null, settings);
      break;
    }
    case "owner_add":
      if (!(await addServerOwner(serverId, data.discordId as string, actor.discordId))) return NextResponse.json({ error: "already_exists" }, { status: 409 });
      invalidateConfig(serverId);
      await audit(serverId, actor, "owner_add", data.discordId as string, { discordId: data.discordId });
      break;
    case "owner_remove": {
      const owners = await listServerOwners(serverId);
      // A server must keep at least one owner of its own (platform owners are not listed).
      if (owners.length <= 1 && owners.includes(data.discordId as string)) return NextResponse.json({ error: "last_owner" }, { status: 409 });
      if (!(await removeServerOwner(serverId, data.discordId as string))) return NextResponse.json({ error: "not_found" }, { status: 404 });
      invalidateConfig(serverId);
      await audit(serverId, actor, "owner_remove", data.discordId as string, { discordId: data.discordId });
      break;
    }
    case "fivem_token_rotate": {
      const token = await rotateFivemToken(serverId);
      await audit(serverId, actor, "fivem_token_rotate", null, {});
      // Shown once: only its hash is kept.
      return NextResponse.json({ ok: true, token });
    }
    case "server_delete": {
      // Typing the exact name guards against a misclick; the legacy server holds the original data: platform owners only.
      if ((data.confirm as string).trim() !== server.name) return NextResponse.json({ error: "confirm_mismatch" }, { status: 400 });
      if (serverId === LEGACY_SERVER_ID && !isPlatformOwner(actor.discordId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      await deleteServer(serverId);
      invalidateConfig(serverId);
      console.log(`[servers] ${serverId} (${server.name}) deleted by ${actor.discordId}`);
      return NextResponse.json({ ok: true, deleted: serverId });
    }
  }
  return NextResponse.json({ ok: true });
}
