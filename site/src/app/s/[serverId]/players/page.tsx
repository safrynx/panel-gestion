import Link from "next/link";
import { requirePermissionPage } from "@/lib/auth";
import { countPlayersSince, listPlayers } from "@/lib/players";
import { formatDateTime, formatDuration } from "@/lib/format";
import Shell, { PageHead } from "@/app/shell";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function PlayersPage({ params, searchParams }: { params: Promise<{ serverId: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { user, server } = await requirePermissionPage((await params).serverId, "view_live");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const base = `/s/${server.id}/players`;
  const [{ rows, total }, week] = await Promise.all([
    listPlayers(server.id, { q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countPlayersSince(server.id, new Date(Date.now() - 7 * 86400_000))
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  const stats: [string, string, string][] = [
    ["Joueurs connus", String(total), q ? "pour cette recherche" : "depuis l'installation de l'agent"],
    ["Joueurs · 7 jours", String(week.unique), "joueurs différents"],
    ["Connexions · 7 jours", String(week.sessions), "sessions de jeu"],
    ["Temps de jeu · 7 jours", formatDuration(week.seconds), "cumulé"]
  ];

  return (
    <Shell user={user} server={server} active="players">
      <PageHead kicker={server.name} title="Joueurs">Tous les joueurs passés sur le serveur FiveM, avec leurs identifiants et leur historique de connexions.</PageHead>

      <div className="strip">
        {stats.map(([label, value, hint], i) => (
          <div key={label} className={`rise rise-${i + 1}`}><div className="eyebrow">{label}</div><div className="num" style={{ fontSize: 24 }}>{value}</div><small>{hint}</small></div>
        ))}
      </div>

      <form className="filters rise rise-1" action={base}>
        <input name="q" defaultValue={q} placeholder="Nom, license, Discord, steam…" className="field" style={{ minWidth: 300 }} />
        <button className="btn primary">Rechercher</button>
        {q && <Link href={base} className="linkish">Réinitialiser</Link>}
      </form>

      {rows.length === 0 && <p className="muted" style={{ padding: "30px 0" }}>{q ? "Aucun joueur trouvé." : "Aucun joueur pour l'instant : ils apparaissent dès que l'agent FiveM est relié."}</p>}
      {rows.length > 0 && (
        <div className="tbl-wrap rise rise-2">
          <table className="tbl" style={{ minWidth: 820 }}>
            <thead>
              <tr><th>Joueur</th><th>Staff</th><th>Dernière venue</th><th>Connexions</th><th>Temps de jeu</th><th>Première venue</th></tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id} className="row-in" style={{ ["--i" as string]: Math.min(i, 14) }}>
                  <td>
                    <Link href={`${base}/${p.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
                      <span className={`dot ${p.online ? "on" : ""}`} title={p.online ? "En jeu" : "Hors ligne"} />{p.name}
                    </Link>
                  </td>
                  <td>{p.staff ? <span className="plate"><span>{p.staff.grade || "Staff"}</span></span> : <span className="muted">—</span>}</td>
                  <td className="num-cell">{p.online ? <span className="tag" data-tone="up">En jeu</span> : formatDateTime(p.lastSeenAt)}</td>
                  <td className="num-cell">{p.connections}</td>
                  <td className="num-cell">{formatDuration(p.playSeconds)}</td>
                  <td className="num-cell muted">{formatDateTime(p.firstSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pill-tabs" style={{ marginTop: 26 }}>
          {page > 1 && <Link href={link(page - 1)}>← Précédent</Link>}
          <span className="muted" style={{ padding: "6px 10px" }}>Page {page} / {pages}</span>
          {page < pages && <Link href={link(page + 1)}>Suivant →</Link>}
        </div>
      )}
    </Shell>
  );
}
