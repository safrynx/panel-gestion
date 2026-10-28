import { requireOwnerPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOwnerIds, ladderIn, loadConfig, roleNameIn, warnRolesIn } from "@/lib/config";
import { parsePermissions } from "@/lib/permissions";
import { listGuildRoles } from "@/lib/roles";
import Shell, { PageHead } from "../shell";
import AdminPanel from "./panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireOwnerPage();

  const [cfg, access, roles, warnCount] = await Promise.all([
    loadConfig(),
    db.all<{ id: number; kind: "user" | "role"; discord_id: string; label: string | null; permissions: string | null; username: string | null }>(
      `SELECT a.id, a.kind, a.discord_id, a.label, a.permissions, s.username
       FROM panel_access a LEFT JOIN staff_members s ON s.discord_id = a.discord_id AND a.kind = 'user'
       ORDER BY a.kind DESC, a.created_at`
    ),
    listGuildRoles(),
    db.get<{ n: number }>("SELECT COUNT(*) AS n FROM warn_roles")
  ]);

  const rows = access.map((a) => ({
    id: a.id,
    kind: a.kind,
    discordId: a.discord_id,
    display: a.kind === "role" ? roleNameIn(cfg, a.discord_id) : a.username ?? a.label ?? "Utilisateur",
    permissions: parsePermissions(a.permissions) as string[]
  }));

  const gradeFromEnv = Boolean(process.env.GRADE_ROLE_MAPPING_JSON && process.env.GRADE_ROLE_MAPPING_JSON.trim() !== "{}");

  return (
    <Shell user={user} active="admin">
      <PageHead kicker="Administration" title="Accès & rôles">Qui entre dans le panel, ce que chacun peut faire, et quels rôles Discord pilotent les grades et les avertissements.</PageHead>
      <AdminPanel
        owners={getOwnerIds()}
        access={rows}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        grades={ladderIn(cfg).map((g) => ({ roleId: g.discordRoleId, name: g.name, level: g.level }))}
        gradeFromEnv={gradeFromEnv}
        warnRoles={warnRolesIn(cfg)}
        warnConfigured={(warnCount?.n ?? 0) > 0}
      />
    </Shell>
  );
}
