import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, stmt } from "@/lib/db";
import { audit, auditStmt } from "@/lib/audit";
import { getActorLevel, isOwner, requirePermissionApi } from "@/lib/auth";
import { hasStaffRoleIn, ladderIn, loadConfig, resolveGradeIn, staffRoleIdsIn } from "@/lib/config";
import { avatarUrl, changeMemberRoles, fetchGuildMemberByBot, searchGuildMembers } from "@/lib/discord";
import type { ServerRouteContext } from "@/lib/route";
import { memberStatements } from "@/lib/sync";

export const runtime = "nodejs";

const recruitSchema = z.object({
  discordId: z.string().regex(/^\d{17,20}$/),
  gradeName: z.string().min(1).max(100).optional(),
  reason: z.string().trim().max(500).optional()
});

/** GET /api/s/:serverId/recruit?q=… — search the server's guild members to recruit (by name, or by exact Discord ID). */
export async function GET(req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requirePermissionApi((await params).serverId, "recruit");
  if ("error" in guard) return guard.error;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const found = /^\d{17,20}$/.test(q) ? [await fetchGuildMemberByBot(guard.server.guildId, q)].filter((m) => m !== null) : await searchGuildMembers(guard.server.guildId, q);
  if (found === null) return NextResponse.json({ error: "bot_unavailable" }, { status: 503 });

  const cfg = await loadConfig(guard.server.id);
  const results = found
    .filter((m) => !m.user.bot)
    .map((m) => ({
      discordId: m.user.id,
      username: m.user.global_name || m.user.username,
      avatarUrl: avatarUrl(m.user),
      isStaff: hasStaffRoleIn(cfg, m.roles),
      currentGrade: resolveGradeIn(cfg, m.roles)?.grade ?? null
    }));
  return NextResponse.json({ results });
}

/** POST /api/s/:serverId/recruit — give a guild member the staff roles and register them in the server's panel. */
export async function POST(req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requirePermissionApi((await params).serverId, "recruit");
  if ("error" in guard) return guard.error;
  const { user, server } = guard;
  const serverId = server.id;
  const actor = { discordId: user.discordId, username: user.username };
  const owner = isOwner(user);

  const parsed = recruitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  const { discordId, gradeName } = parsed.data;
  const reason = parsed.data.reason || "Recrutement";

  const cfg = await loadConfig(serverId);
  const ladder = ladderIn(cfg);
  if (!ladder.length) return NextResponse.json({ error: "no_grade_roles_configured" }, { status: 409 });
  // Grades the actor may hand out: strictly below their own level (owners: any).
  const actorLevel = await getActorLevel(user);
  const allowed = ladder.filter((g) => owner || g.level < actorLevel);
  const grade = gradeName ? ladder.find((g) => g.name === gradeName) : ladder[0]; // default: lowest grade
  if (!grade) return NextResponse.json({ error: "unknown_grade" }, { status: 400 });
  if (!allowed.some((g) => g.discordRoleId === grade.discordRoleId)) {
    return NextResponse.json({ error: "forbidden_grade" }, { status: 403 });
  }

  const member = await fetchGuildMemberByBot(server.guildId, discordId);
  if (!member || member.user.bot) return NextResponse.json({ error: "unknown_member" }, { status: 404 });
  if (hasStaffRoleIn(cfg, member.roles)) return NextResponse.json({ error: "already_staff" }, { status: 409 });

  const add = [grade.discordRoleId, ...staffRoleIdsIn(cfg)].filter((r, i, all) => !member.roles.includes(r) && all.indexOf(r) === i);
  const result = await changeMemberRoles(server.guildId, discordId, add, [], `${user.username}: ${reason}`);
  if (!result.ok) {
    await audit(serverId, actor, "recruit_failed", discordId, { discordStatus: result.status, to: grade.name });
    return NextResponse.json({ error: "discord_role_update_failed", discordStatus: result.status }, { status: 502 });
  }

  const username = member.user.global_name || member.user.username;
  const { statements } = await memberStatements(serverId, {
    discordId,
    username,
    avatarUrl: avatarUrl(member.user),
    roleIds: [...member.roles, ...add],
    joinedAt: member.joined_at,
    presentInGuild: true
  });
  await db.batch([
    ...statements,
    stmt("INSERT INTO grade_history (server_id, discord_id, old_grade, new_grade, actor_discord_id, reason, sync_status) VALUES (?, ?, '—', ?, ?, ?, 'synced')", [serverId, discordId, grade.name, user.discordId, reason]),
    auditStmt(serverId, actor, "recruit", discordId, { to: grade.name, reason })
  ]);
  return NextResponse.json({ ok: true, username, grade: grade.name });
}
