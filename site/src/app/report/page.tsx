import Link from "next/link";
import { can, requirePermissionPage } from "@/lib/auth";
import { aiConfigured } from "@/lib/review";
import { RATINGS } from "@/lib/ratings";
import { buildWeeklyReport, reportToText } from "@/lib/report";
import { fivemSource } from "@/lib/stats";
import { formatDuration } from "@/lib/format";
import Shell, { PageHead } from "../shell";
import Avatar from "../avatar";
import CopyButton from "../copy-button";
import ReviewButton from "./review-button";

export const dynamic = "force-dynamic";

const weeks = [[0, "Cette semaine"], [1, "Semaine dernière"], [2, "Il y a 2 semaines"], [3, "Il y a 3 semaines"]] as const;

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requirePermissionPage("view_report");
  const { week: weekParam } = await searchParams;
  const week = Math.min(52, Math.max(0, Number.parseInt(weekParam ?? "0", 10) || 0));
  const [report, source] = await Promise.all([buildWeeklyReport(week), fivemSource()]);

  return (
    <Shell user={user} active="report">
      <PageHead
        kicker={`Semaine ${report.range.label}${report.range.partial ? " · en cours" : ""}`}
        title="Bilan hebdo"
        actions={<>{can(user, "run_review") && <ReviewButton week={week} />}<CopyButton text={reportToText(report)} label="Copier pour Discord" /><a href={`/api/report?week=${week}&format=csv`} className="btn primary">Télécharger CSV</a></>}
      >
        Staff classés par grade · temps de jeu issu de {source === "database" ? "la base du serveur FiveM" : "l'agent FiveM"}.
      </PageHead>

      {can(user, "run_review") && !aiConfigured() && <div className="banner"><b>Bilan IA non configuré.</b> Ajoute une clé gratuite (Groq ou Gemini) dans <code>AI_API_KEY</code> du .env, voir .env.example. Sans clé, aucune appréciation n&apos;est générée.</div>}
      <div className="pill-tabs rise rise-1" style={{ marginBottom: 10 }}>
        {weeks.map(([n, label]) => <Link key={n} href={`/report?week=${n}`} data-on={n === week}>{label}</Link>)}
      </div>

      {report.groups.length === 0 && <p className="muted" style={{ padding: "40px 0" }}>Aucun membre staff en base.</p>}
      {report.groups.map((group, gi) => (
        <section key={group.grade} className="sect rise" style={{ animationDelay: `${gi * 70}ms` }}>
          <header><span className="plate"><span>{group.grade}</span></span><span className="muted">{group.rows.length} membre(s)</span></header>
          <div className="tbl-wrap">
            <table className="tbl" style={{ minWidth: 900 }}>
              <thead><tr><th>Membre</th><th>Vocal</th><th>Jeu</th><th>Avert</th><th>Cette semaine</th><th>Appréciation</th></tr></thead>
              <tbody>
                {group.rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/staff/${r.discordId}`} style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar url={r.avatarUrl} name={r.username} size={28} />{r.username}</Link></td>
                    <td className="num-cell">{formatDuration(r.voiceSeconds)}</td>
                    <td className="num-cell">{formatDuration(r.fivemSeconds)}</td>
                    <td><span className="pips" data-level={r.warnLevel}><i /><i /><i /></span></td>
                    <td className="muted">{r.warningsAdded || r.warningsRemoved ? `+${r.warningsAdded} / −${r.warningsRemoved} avert` : "—"}</td>
                    <td style={{ maxWidth: 380 }}>
                      {r.review ? (
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <span style={{ marginTop: 6, width: 9, height: 9, borderRadius: "50%", background: RATINGS[r.review.rating].color, flex: "none" }} />
                          <div style={{ fontSize: 13 }}><b>{RATINGS[r.review.rating].label}</b> <span className="muted">{r.review.summary}</span></div>
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </Shell>
  );
}
