import Link from "next/link";
import { can, requireStaffPage } from "@/lib/auth";
import { getStaffOverview } from "@/lib/stats";
import { listLogs } from "@/lib/logs";
import { getCountersResetAt } from "@/lib/counters";
import { getLiveState } from "@/lib/agent";
import { formatDateTime } from "@/lib/format";
import Shell, { PageHead } from "@/app/shell";
import Avatar from "@/app/avatar";
import BotBanner from "@/app/bot-banner";
import SetupChecklist from "@/app/setup-checklist";
import CountUp from "@/app/count-up";
import SyncButton from "@/app/sync-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { user, server } = await requireStaffPage((await params).serverId);
  const base = `/s/${server.id}`;
  const staff = await getStaffOverview(server.id, new Date(Date.now() - 7 * 86400_000));
  const voice = staff.reduce((sum, m) => sum + m.voiceSeconds, 0);
  const fivem = staff.reduce((sum, m) => sum + m.fivemSeconds, 0);
  const inVoice = staff.filter((m) => m.inVoice).length;
  const warned = staff.filter((m) => m.warnLevel > 0).length;
  const resetAt = await getCountersResetAt(server.id);
  const logs = can(user, "view_logs") ? (await listLogs(server.id, { limit: 7 })).rows : null;
  const live = can(user, "view_live") ? await getLiveState(server.id) : null;

  const stats = [
    { label: "Staff actif", value: staff.length, kind: "int" as const, hint: `${inVoice} en vocal maintenant` },
    { label: "Vocal · 7 jours", value: voice, kind: "duration" as const, hint: "cumulé" },
    { label: "Jeu · 7 jours", value: fivem, kind: "duration" as const, hint: "cumulé" },
    { label: "Avertis", value: warned, kind: "int" as const, hint: "au moins un avert" }
  ];

  return (
    <Shell user={user} server={server} active="dashboard">
      <BotBanner server={server} />
      {user.owner && <SetupChecklist server={server} />}
      <PageHead kicker={server.name} title={`Salut ${user.username}`} actions={<>{can(user, "sync") && <SyncButton />}<Link href={`${base}/staff`} className="btn primary">Ouvrir le staff</Link></>}>
        L&apos;état de l&apos;équipe sur les 7 derniers jours.{resetAt && resetAt.getTime() > Date.now() - 7 * 86400_000 && <> Compteurs remis à zéro le {formatDateTime(resetAt.toISOString())}.</>}
      </PageHead>

      {live?.linked && (
        <Link href={`${base}/live`} className="guild-row rise" style={{ marginBottom: 18, flexWrap: "wrap" }}>
          <span className={`dot ${live.online ? "on" : ""}`} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>{live.online ? "Serveur FiveM en ligne" : "Serveur FiveM hors ligne"}</div>
            <div className="muted" style={{ fontSize: 12 }}>{live.hostname ?? server.name}</div>
          </div>
          {live.online && (
            <span className="muted" style={{ fontSize: 13 }}>
              <b style={{ color: "var(--text)" }}>{live.players.length}</b> / {live.maxClients} joueurs · <b style={{ color: "var(--text)" }}>{live.players.filter((p) => p.staff).length}</b> staff en jeu
            </span>
          )}
          <span className="linkish">Ouvrir le direct</span>
        </Link>
      )}

      <div className="strip">
        {stats.map((s, i) => (
          <div key={s.label} className={`rise rise-${i + 1}`}>
            <div className="eyebrow">{s.label}</div>
            <div className="num"><CountUp value={s.value} kind={s.kind} /></div>
            <small>{s.hint}</small>
          </div>
        ))}
      </div>

      <div className={`cols ${logs ? "two" : ""}`}>
        <section className="rise rise-2">
          <header className="sect" style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
            <h2 className="h2">Équipe</h2><Link href={`${base}/staff`} className="linkish">Tout voir</Link>
          </header>
          {staff.length === 0 && <p className="muted" style={{ marginTop: 18 }}>Aucun membre staff en base. Clique sur « Synchroniser Discord » ou lance le bot.</p>}
          {staff.slice(0, 8).map((m, i) => (
            <Link key={m.id} href={`${base}/staff/${m.discordId}`} className="row-in" style={{ ["--i" as string]: i, display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <Avatar url={m.avatarUrl} name={m.username} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.username}</div>
                <div className="muted" style={{ fontSize: 12 }}>{m.grade}</div>
              </div>
              <span className="pips" data-level={m.warnLevel}><i /><i /><i /></span>
              <span className={`dot ${m.inVoice ? "on" : ""}`} title={m.inVoice ? "En vocal" : "Hors vocal"} />
            </Link>
          ))}
        </section>

        {logs && (
          <section className="rise rise-3">
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
              <h2 className="h2">Dernières actions</h2><Link href={`${base}/logs`} className="linkish">Tous les logs</Link>
            </header>
            {logs.length === 0 && <p className="muted" style={{ marginTop: 18 }}>Rien pour l&apos;instant.</p>}
            {logs.map((l, i) => (
              <div key={l.id} className="row-in" style={{ ["--i" as string]: i, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="tag" data-tone={l.tone}>{l.label}</span>
                  <span style={{ fontWeight: 600 }}>{l.actorName}</span>
                  {l.targetName && <span className="muted">→ {l.targetName}</span>}
                </div>
                {l.details && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{l.details}</div>}
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{formatDateTime(l.createdAt)}</div>
              </div>
            ))}
          </section>
        )}
      </div>
    </Shell>
  );
}
