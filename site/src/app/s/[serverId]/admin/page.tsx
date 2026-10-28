import { requireOwnerPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlatformOwnerIds, ladderIn, loadConfig, roleNameIn, warnRolesIn } from "@/lib/config";
import { parsePermissions } from "@/lib/permissions";
import { listGuildRoles } from "@/lib/roles";
import { LEGACY_SERVER_ID } from "@/lib/servers";
import Shell, { PageHead } from "@/app/shell";
import AdminPanel from "./panel";

export const dynamic = "force-dynamic";

export default async function AdminPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { user, server } = await requireOwnerPage((await params).serverId);

  const [cfg, access, roles, warnCount, owners] = await Promise.all([
    loadConfig(server.id),
    db.all<{ id: number; kind: "user" | "role"; discord_id: string; label: string | null; permissions: string | null; username: string | null }>(
      `SELECT a.id, a.kind, a.discord_id, a.label, a.permissions, s.username
       FROM panel_access a LEFT JOIN staff_members s ON s.server_id = a.server_id AND s.discord_id = a.discord_id AND a.kind = 'user'
       WHERE a.server_id = ?
       ORDER BY a.kind DESC, a.created_at`,
      [server.id]
    ),
    listGuildRoles(server.id),
    db.get<{ n: number }>("SELECT COUNT(*) AS n FROM warn_roles WHERE server_id = ?", [server.id]),
    db.all<{ discord_id: string; username: string | null }>(
      `SELECT o.discord_id, s.username FROM server_owners o
       LEFT JOIN staff_members s ON s.server_id = o.server_id AND s.discord_id = o.discord_id
       WHERE o.server_id = ? ORDER BY o.created_at`,
      [server.id]
    )
  ]);

  const rows = access.map((a) => ({
    id: a.id,
    kind: a.kind,
    discordId: a.discord_id,
    display: a.kind === "role" ? roleNameIn(cfg, a.discord_id) : a.username ?? a.label ?? "Utilisateur",
    permissions: parsePermissions(a.permissions) as string[]
  }));

  const gradeFromEnv = server.id === LEGACY_SERVER_ID && Boolean(process.env.GRADE_ROLE_MAPPING_JSON && process.env.GRADE_ROLE_MAPPING_JSON.trim() !== "{}");

  return (
    <Shell user={user} server={server} active="admin">
      <PageHead kicker={server.name} title="Accès & rôles">Qui entre dans le panel, ce que chacun peut faire, et quels rôles Discord pilotent les grades et les avertissements.</PageHead>
      <AdminPanel
        owners={owners.map((o) => ({ discordId: o.discord_id, display: o.username ?? o.discord_id }))}
        platformOwners={getPlatformOwnerIds()}
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
