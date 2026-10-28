import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, stmt } from "@/lib/db";
import { audit, auditStmt } from "@/lib/audit";
import { can, getActorLevel, isOwner, requireStaffApi } from "@/lib/auth";
import { changeMemberRoles } from "@/lib/discord";
import { ladderIn, loadConfig, resolveGradeIn, staffRoleIdsIn, warnLevelIn, warnRolesIn } from "@/lib/config";
import { canManageGrade } from "@/lib/grades";
import type { Permission } from "@/lib/permissions";
import type { ServerRouteContext } from "@/lib/route";
import { memberStatements } from "@/lib/sync";

export const runtime = "nodejs";

const discordId = z.string().regex(/^\d{17,20}$/);
const reason = z.string().trim().min(1).max(500);

const badgeSchema = z.object({ discordId, color: z.enum(["red", "yellow", "green", "blue"]), reason });
const resolveBadgeSchema = z.object({ badgeId: z.number().int().positive() });
const noteSchema = z.object({ discordId, body: z.string().trim().min(1).max(2000) });
const gradeSchema = z.object({ discordId, gradeName: z.string().min(1).max(100), reason });
const rankSchema = z.object({ discordId, action: z.enum(["up", "down", "demote"]), reason });
const warnAddSchema = z.object({ discordId, reason });
const warnRemoveSchema = z.object({ discordId, warningId: z.number().int().positive().optional(), reason });

function invalid(issues: z.ZodIssue[]) {
  return NextResponse.json({ error: "validation", issues }, { status: 400 });
}

function denied(permission: Permission) {
  return NextResponse.json({ error: "forbidden_permission", permission }, { status: 403 });
}

type MemberRow = { grade: string; grade_level: number; roles: string[] };
async function findMember(serverId: string, id: string): Promise<MemberRow | undefined> {
  const row = await db.get<{ grade: string; grade_level: number; roles_json: string }>(
    "SELECT grade, grade_level, roles_json FROM staff_members WHERE server_id = ? AND discord_id = ? AND left_guild_at IS NULL",
    [serverId, id]
  );
  if (!row) return undefined;
  let roles: string[] = [];
  try { roles = JSON.parse(row.roles_json) as string[]; } catch { /* keep empty */ }
  return { grade: row.grade, grade_level: row.grade_level, roles };
}

const saveRolesStmt = (serverId: string, id: string, roles: string[]) =>
  stmt("UPDATE staff_members SET roles_json = ?, updated_at = ? WHERE server_id = ? AND discord_id = ?", [JSON.stringify(roles), new Date().toISOString(), serverId, id]);

/** POST /api/s/:serverId/admin?kind=… — staff actions; permissions and hierarchy are both enforced server-side. */
export async function POST(req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requireStaffApi((await params).serverId);
  if ("error" in guard) return guard.error;
  const { user, server } = guard;
  const serverId = server.id;
  const owner = isOwner(user);
  const actorLevel = await getActorLevel(user);
  const actor = { discordId: user.discordId, username: user.username };

  const kind = req.nextUrl.searchParams.get("kind");
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  /** Owners can act on anyone but themselves; others only on members of strictly lower grade. */
  const canActOn = (target: string, targetLevel: number) =>
    target !== user.discordId && (owner || actorLevel > targetLevel);

  const discordFailure = async (action: string, target: string, status: number, extra: object = {}) => {
    await audit(serverId, actor, `${action}_failed`, target, { discordStatus: status, ...extra });
    return NextResponse.json({ error: "discord_role_update_failed", discordStatus: status }, { status: 502 });
  };

  if (kind === "badge") {
    if (!can(user, "badges")) return denied("badges");
    const parsed = badgeSchema.safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues);
    const { discordId: target, color, reason: why } = parsed.data;
    if (!(await findMember(serverId, target))) return NextResponse.json({ error: "unknown_member" }, { status: 404 });
    await db.batch([
      stmt("INSERT INTO staff_badges (server_id, discord_id, color, reason, author_discord_id) VALUES (?, ?, ?, ?, ?)", [serverId, target, color, why, user.discordId]),
      auditStmt(serverId, actor, "badge_create", target, { color, reason: why })
    ]);
    return NextResponse.json({ ok: true });
  }

  if (kind === "badge_resolve") {
    if (!can(user, "badges")) return denied("badges");
    const parsed = resolveBadgeSchema.safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues);
    const row = await db.get<{ discord_id: string }>("SELECT discord_id FROM staff_badges WHERE id = ? AND server_id = ? AND status = 'active'", [parsed.data.badgeId, serverId]);
    if (!row) return NextResponse.json({ error: "unknown_badge" }, { status: 404 });
    await db.batch([
      stmt("UPDATE staff_badges SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [parsed.data.badgeId]),
      auditStmt(serverId, actor, "badge_resolve", row.discord_id, { badgeId: parsed.data.badgeId })
    ]);
    return NextResponse.json({ ok: true });
  }

  if (kind === "note") {
    if (!can(user, "comment")) return denied("comment");
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues);
    const { discordId: target, body: noteBody } = parsed.data;
    if (!(await findMember(serverId, target))) return NextResponse.json({ error: "unknown_member" }, { status: 404 });
    await db.batch([
      stmt("INSERT INTO staff_notes (server_id, discord_id, body, author_discord_id, author_name) VALUES (?, ?, ?, ?, ?)", [serverId, target, noteBody, user.discordId, user.username]),
      auditStmt(serverId, actor, "note_create", target, { body: noteBody })
    ]);
    return NextResponse.json({ ok: true });
  }

  // ---- Grades: set a specific grade, or up / down / demote along the Discord role hierarchy ----
  if (kind === "grade" || kind === "rank") {
    const parsed = (kind === "grade" ? gradeSchema : rankSchema).safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues);
    const data = parsed.data as { discordId: string; reason: string; gradeName?: string; action?: "up" | "down" | "demote" };

    const needed: Permission = kind === "grade" ? "set_grade" : data.action === "up" ? "rank_up" : data.action === "down" ? "rank_down" : "rank_demote";
    if (!can(user, needed)) return denied(needed);

    const cfg = await loadConfig(serverId);
    const ladder = ladderIn(cfg);
    if (!ladder.length) return NextResponse.json({ error: "no_grade_roles_configured" }, { status: 409 });
    const target = data.discordId;
    const member = await findMember(serverId, target);
    if (!member) return NextResponse.json({ error: "unknown_member" }, { status: 404 });

    const current = resolveGradeIn(cfg, member.roles);
    const currentLevel = current?.gradeLevel ?? 0;

    // Decide the destination: a ladder entry, or null for "removed from staff".
    let destination: (typeof ladder)[number] | null;
    if (kind === "grade") {
      const found = ladder.find((g) => g.name === data.gradeName);
      if (!found) return NextResponse.json({ error: "unknown_grade" }, { status: 400 });
      destination = found;
    } else if (data.action === "up") {
      const next = ladder.find((g) => g.level > currentLevel);
      if (!next) return NextResponse.json({ error: "already_highest" }, { status: 400 });
      destination = next;
    } else if (data.action === "down") {
      const lower = [...ladder].reverse().find((g) => g.level < currentLevel);
      if (!lower) return NextResponse.json({ error: "already_lowest", hint: "Use demote to remove the member from staff" }, { status: 400 });
      destination = lower;
    } else {
      destination = null;
    }

    const newLevel = destination?.level ?? 0;
    if (!canActOn(target, currentLevel) || (!owner && newLevel >= actorLevel)) {
      return NextResponse.json({ error: "forbidden_grade" }, { status: 403 });
    }
    if (!canManageGrade(actorLevel, currentLevel, newLevel, owner)) {
      return NextResponse.json({ error: "forbidden_grade" }, { status: 403 });
    }

    const ladderRoleIds = ladder.map((g) => g.discordRoleId);
    const staffRoleIds = staffRoleIdsIn(cfg);
    const remove = member.roles.filter((r) => (ladderRoleIds.includes(r) && r !== destination?.discordRoleId) || (!destination && staffRoleIds.includes(r)));
    const add = destination && !member.roles.includes(destination.discordRoleId) ? [destination.discordRoleId] : [];
    const label = destination ? destination.name : "Retiré du staff";
    const actionName = kind === "rank" ? `rank_${data.action}` : "grade_change";

    // Discord first: if the role change fails, the panel stays consistent with Discord.
    const result = await changeMemberRoles(server.guildId, target, add, remove, `${user.username}: ${data.reason}`);
    if (!result.ok) return discordFailure(actionName, target, result.status, { from: member.grade, to: label });

    const newRoles = [...member.roles.filter((r) => !remove.includes(r)), ...add];
    let update: ReturnType<typeof stmt>[];
    if (destination) {
      update = [stmt("UPDATE staff_members SET grade = ?, grade_level = ?, roles_json = ?, updated_at = ? WHERE server_id = ? AND discord_id = ?",
        [destination.name, destination.level, JSON.stringify(newRoles), new Date().toISOString(), serverId, target])];
    } else {
      // No staff role left: the member leaves the staff list but keeps notes, badges and history.
      update = (await memberStatements(serverId, { discordId: target, username: "", avatarUrl: null, roleIds: newRoles, joinedAt: null, presentInGuild: true })).statements;
    }
    await db.batch([
      ...update,
      stmt("INSERT INTO grade_history (server_id, discord_id, old_grade, new_grade, actor_discord_id, reason, sync_status) VALUES (?, ?, ?, ?, ?, ?, 'synced')",
        [serverId, target, member.grade, label, user.discordId, data.reason]),
      auditStmt(serverId, actor, actionName, target, { from: member.grade, to: label, reason: data.reason })
    ]);
    return NextResponse.json({ ok: true, grade: label });
  }

  // ---- Avertissements (avert 1 / 2 / 3) ----
  if (kind === "warn_add" || kind === "warn_remove") {
    const needed: Permission = kind;
    if (!can(user, needed)) return denied(needed);
    const parsed = (kind === "warn_add" ? warnAddSchema : warnRemoveSchema).safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues);
    const data = parsed.data as { discordId: string; reason: string; warningId?: number };
    const target = data.discordId;
    const member = await findMember(serverId, target);
    if (!member) return NextResponse.json({ error: "unknown_member" }, { status: 404 });
    if (!canActOn(target, member.grade_level)) return NextResponse.json({ error: "forbidden_warning" }, { status: 403 });

    const cfg = await loadConfig(serverId);
    const warnRoles = warnRolesIn(cfg);
    const activeRows = await db.all<{ id: number }>("SELECT id FROM warnings WHERE server_id = ? AND discord_id = ? AND removed_at IS NULL ORDER BY id DESC", [serverId, target]);
    const currentLevel = Math.min(3, warnLevelIn(cfg, member.roles) ?? activeRows.length);
    const roleFor = (level: number) => warnRoles.find((w) => w.level === level)?.roleId;

    let newLevel: number;
    let warningId = data.warningId;
    if (kind === "warn_add") {
      if (currentLevel >= 3) return NextResponse.json({ error: "max_warnings_reached" }, { status: 400 });
      newLevel = currentLevel + 1;
    } else {
      const row = warningId
        ? await db.get<{ id: number }>("SELECT id FROM warnings WHERE id = ? AND server_id = ? AND discord_id = ? AND removed_at IS NULL", [warningId, serverId, target])
        : activeRows[0];
      if (!row) return NextResponse.json({ error: "unknown_warning" }, { status: 404 });
      warningId = row.id;
      newLevel = Math.max(0, currentLevel - 1);
    }

    // Replace the avert role: drop the current level's role, add the new level's role.
    let discord: "updated" | "skipped" = "skipped";
    const statements = [] as ReturnType<typeof stmt>[];
    if (warnRoles.length) {
      const add = newLevel > 0 && roleFor(newLevel) && !member.roles.includes(roleFor(newLevel) as string) ? [roleFor(newLevel) as string] : [];
      const remove = warnRoles.map((w) => w.roleId).filter((r) => member.roles.includes(r) && r !== roleFor(newLevel));
      if (add.length || remove.length) {
        const result = await changeMemberRoles(server.guildId, target, add, remove, `${user.username}: ${data.reason}`);
        if (!result.ok) return discordFailure(kind, target, result.status, { level: newLevel });
        statements.push(saveRolesStmt(serverId, target, [...member.roles.filter((r) => !remove.includes(r)), ...add]));
        discord = "updated";
      }
    }

    if (kind === "warn_add") {
      statements.push(stmt("INSERT INTO warnings (server_id, discord_id, level, reason, author_discord_id) VALUES (?, ?, ?, ?, ?)", [serverId, target, newLevel, data.reason, user.discordId]));
    } else {
      statements.push(stmt("UPDATE warnings SET removed_at = CURRENT_TIMESTAMP, removed_by = ?, removed_reason = ? WHERE id = ? AND server_id = ?", [user.discordId, data.reason, warningId as number, serverId]));
    }
    statements.push(auditStmt(serverId, actor, kind, target, { level: newLevel, reason: data.reason, warningId, discord }));
    await db.batch(statements);
    return NextResponse.json({ ok: true, level: newLevel, discord });
  }

  return NextResponse.json({ error: "unknown_kind" }, { status: 400 });
}
