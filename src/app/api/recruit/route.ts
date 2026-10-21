import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getActorLevel, isOwner, requirePermissionApi } from "@/lib/auth";
import { getGradeLadder, getStaffRoleIds, hasStaffRole, resolveGradeFromRoles } from "@/lib/config";
import { avatarUrl, changeMemberRoles, fetchGuildMemberByBot, searchGuildMembers } from "@/lib/discord";
import { upsertStaffMember } from "@/lib/sync";

export const runtime = "nodejs";

const recruitSchema = z.object({
  discordId: z.string().regex(/^\d{17,20}$/),
  gradeName: z.string().min(1).max(100).optional(),
  reason: z.string().trim().max(500).optional()
});

/** Grades the actor may hand out: strictly below their own level (owners: any). */
function assignableGrades(actorLevel: number, owner: boolean) {
  return getGradeLadder().filter((g) => owner || g.level < actorLevel);
}

/** GET /api/recruit?q=… — search guild members to recruit (by name, or by exact Discord ID). */
export async function GET(req: NextRequest) {
  const guard = await requirePermissionApi("recruit");
  if ("error" in guard) return guard.error;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const found = /^\d{17,20}$/.test(q) ? [await fetchGuildMemberByBot(q)].filter((m) => m !== null) : await searchGuildMembers(q);
  if (found === null) return NextResponse.json({ error: "bot_unavailable" }, { status: 503 });

  const results = found
    .filter((m) => !m.user.bot)
    .map((m) => ({
      discordId: m.user.id,
      username: m.user.global_name || m.user.username,
      avatarUrl: avatarUrl(m.user),
      isStaff: hasStaffRole(m.roles),
      currentGrade: resolveGradeFromRoles(m.roles)?.grade ?? null
    }));
  return NextResponse.json({ results });
}

/** POST /api/recruit — give a guild member the staff roles and register them in the panel. */
export async function POST(req: NextRequest) {
  const guard = await requirePermissionApi("recruit");
  if ("error" in guard) return guard.error;
  const { user } = guard;
  const actor = { discordId: user.discordId, username: user.username };
  const owner = isOwner(user);

  const parsed = recruitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  const { discordId, gradeName } = parsed.data;
  const reason = parsed.data.reason || "Recrutement";

  const ladder = getGradeLadder();
  if (!ladder.length) return NextResponse.json({ error: "no_grade_roles_configured" }, { status: 409 });
  const allowed = assignableGrades(getActorLevel(user), owner);
  const grade = gradeName ? ladder.find((g) => g.name === gradeName) : ladder[0]; // default: lowest grade
  if (!grade) return NextResponse.json({ error: "unknown_grade" }, { status: 400 });
  if (!allowed.some((g) => g.discordRoleId === grade.discordRoleId)) {
    return NextResponse.json({ error: "forbidden_grade" }, { status: 403 });
  }

  const member = await fetchGuildMemberByBot(discordId);
  if (!member || member.user.bot) return NextResponse.json({ error: "unknown_member" }, { status: 404 });
  if (hasStaffRole(member.roles)) return NextResponse.json({ error: "already_staff" }, { status: 409 });

  const add = [grade.discordRoleId, ...getStaffRoleIds()].filter((r, i, all) => !member.roles.includes(r) && all.indexOf(r) === i);
  const result = await changeMemberRoles(discordId, add, [], `${user.username}: ${reason}`);
  if (!result.ok) {
    audit(actor, "recruit_failed", discordId, { discordStatus: result.status, to: grade.name });
    return NextResponse.json({ error: "discord_role_update_failed", discordStatus: result.status }, { status: 502 });
  }

  const username = member.user.global_name || member.user.username;
  db.transaction(() => {
    upsertStaffMember({
      discordId,
      username,
      avatarUrl: avatarUrl(member.user),
      roleIds: [...member.roles, ...add],
      joinedAt: member.joined_at,
      presentInGuild: true
    });
    db.prepare("INSERT INTO grade_history (discord_id, old_grade, new_grade, actor_discord_id, reason, sync_status) VALUES (?, '—', ?, ?, ?, 'synced')")
      .run(discordId, grade.name, user.discordId, reason);
  })();
  audit(actor, "recruit", discordId, { to: grade.name, reason });
  return NextResponse.json({ ok: true, username, grade: grade.name });
}
