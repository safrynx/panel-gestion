import Link from "next/link";
import { can, requirePermissionPage } from "@/lib/auth";
import { getServerStatus } from "@/lib/bot-status";
import { db } from "@/lib/db";
import { getSecuritySettings, listIncidents } from "@/lib/security";
import { INCIDENT_LABELS, PUNISHMENT_LABELS } from "@/lib/security-config";
import { formatDateTime } from "@/lib/format";
import Shell, { PageHead } from "@/app/shell";
import { AutoRefresh } from "../security-actions";
import AntiraidSettingsForm from "./settings-form";
import RestoreButton from "./restore-button";

export const dynamic = "force-dynamic";

export default async function AntiraidPage({ params, searchParams }: { params: Promise<{ serverId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { user, server } = await requirePermissionPage((await params).serverId, "view_security");
  const canConfig = can(user, "security_config");
  const tab = (await searchParams).tab === "settings" && canConfig ? "settings" : "incidents";
  const base = `/s/${server.id}/antiraid`;
  const [settings, incidents, heartbeat, roles] = await Promise.all([
    getSecuritySettings(server.id),
    tab === "incidents" ? listIncidents(server.id, 150) : Promise.resolve([]),
    getServerStatus(server.id, "heartbeat"),
    db.all<{ id: string; name: string }>("SELECT id, name FROM discord_roles WHERE server_id = ? ORDER BY position DESC", [server.id])
  ]);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const botOnline = Boolean(heartbeat && Date.now() - new Date(heartbeat).getTime() < 3 * 60_000);
  const ar = settings.antiraid;

  return (
    <Shell user={user} server={server} active="antiraid">
      <PageHead kicker={server.name} title="Anti-raid Discord">
        Le bot surveille le journal d&apos;audit du Discord en temps réel : il annule les actions destructrices (rôles et salons supprimés, retraits de rôles en masse, bans en masse…) et sanctionne leur auteur.
      </PageHead>
      {tab === "incidents" && <AutoRefresh everyMs={15_000} />}

      {!server.guildId && <div className="banner"><b>Aucun serveur Discord lié.</b> Renseigne-le dans Configuration.</div>}
      {server.guildId && !botOnline && <div className="banner"><b>Le bot Discord ne répond pas.</b> L&apos;anti-raid ne fonctionne que si le bot tourne.</div>}
      {!ar.enabled && <div className="banner"><b>L&apos;anti-raid est désactivé.</b> {canConfig ? <Link href={`${base}?tab=settings`} className="linkish">L&apos;activer dans les réglages</Link> : "Un propriétaire doit l'activer."}</div>}

      <div className="strip">
        <div className="rise rise-1"><div className="eyebrow">Statut</div><div className="num" style={{ fontSize: 22, display: "flex", alignItems: "center", gap: 10 }}><span className={`dot ${ar.enabled && botOnline ? "on" : ""}`} />{ar.enabled ? (botOnline ? "Protégé" : "Bot absent") : "Désactivé"}</div><small>bot {botOnline ? "en ligne" : "hors ligne"}</small></div>
        <div className="rise rise-2"><div className="eyebrow">Sanction</div><div className="num" style={{ fontSize: 18 }}>{PUNISHMENT_LABELS[ar.punishment].split(" (")[0]}</div><small>{ar.trusted.length} personne(s) de confiance</small></div>
        <div className="rise rise-3"><div className="eyebrow">Raid de comptes</div><div className="num" style={{ fontSize: 18 }}>{ar.joinRaid.enabled ? `${ar.joinRaid.joins} en ${ar.joinRaid.windowSec} s` : "Off"}</div><small>verrouillage {ar.joinRaid.lockdownMinutes} min</small></div>
        <div className="rise rise-4"><div className="eyebrow">Incidents</div><div className="num" style={{ fontSize: 22 }}>{incidents.length}</div><small>récents</small></div>
      </div>

      <div className="pill-tabs rise rise-1" style={{ marginBottom: 22 }}>
        <Link href={base} data-on={tab === "incidents"}>Incidents</Link>
        {canConfig && <Link href={`${base}?tab=settings`} data-on={tab === "settings"}>Réglages</Link>}
      </div>

      {tab === "incidents" && incidents.length === 0 && <p className="muted" style={{ padding: "30px 0" }}>Aucun incident. Tout ce que l&apos;anti-raid bloque ou annule apparaîtra ici.</p>}
      {tab === "incidents" && incidents.length > 0 && (
        <div className="tbl-wrap rise rise-2">
          <table className="tbl" style={{ minWidth: 900 }}>
            <thead><tr><th>Quand</th><th>Incident</th><th>Auteur</th><th>Ce que le bot a fait</th><th /></tr></thead>
            <tbody>
              {incidents.map((inc, i) => (
                <tr key={inc.id} className="row-in" style={{ ["--i" as string]: Math.min(i, 14), verticalAlign: "top" }}>
                  <td className="num-cell muted" style={{ whiteSpace: "nowrap" }}>{formatDateTime(inc.at)}</td>
                  <td style={{ maxWidth: 300 }}>
                    <b>{INCIDENT_LABELS[inc.kind] ?? inc.kind}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{inc.summary}</div>
                  </td>
                  <td>
                    {inc.actorName ?? "—"}{inc.actorBot && <> <span className="tag" data-tone="warn">bot</span></>}
                    {inc.actorId && <div className="muted" style={{ fontSize: 11 }}>{inc.actorId}</div>}
                  </td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                      {inc.actions.slice(0, 8).map((a, j) => (
                        <li key={j} style={{ color: a.ok ? undefined : "var(--bad)" }}>{a.type}{a.detail ? ` — ${a.detail}` : ""}{a.ok ? "" : " (échec)"}</li>
                      ))}
                      {inc.actions.length > 8 && <li className="muted">+ {inc.actions.length - 8} autre(s)</li>}
                    </ul>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {inc.removedRoles.length > 0 && (inc.restoredAt
                      ? <span className="tag" data-tone="up">Rôles rendus</span>
                      : canConfig && <RestoreButton id={inc.id} name={inc.actorName ?? "ce membre"} roles={inc.removedRoles.map((r) => roleName.get(r) ?? r)} />)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settings" && canConfig && <AntiraidSettingsForm initial={ar} />}
    </Shell>
  );
}
