import Link from "next/link";
import { requirePermissionPage } from "@/lib/auth";
import { LOG_GROUPS, listLogs } from "@/lib/logs";
import { formatDateTime } from "@/lib/format";
import Shell, { PageHead } from "@/app/shell";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 40;

export default async function LogsPage({ params, searchParams }: { params: Promise<{ serverId: string }>; searchParams: Promise<{ g?: string; q?: string; page?: string }> }) {
  const { user, server } = await requirePermissionPage((await params).serverId, "view_logs");
  const base = `/s/${server.id}/logs`;
  const { g = "", q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const { rows, total } = await listLogs(server.id, { group: g, q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `${base}?${new URLSearchParams({ ...(g ? { g } : {}), ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <Shell user={user} server={server} active="logs">
      <PageHead kicker="Traçabilité" title="Logs">Qui a fait quoi : grades, avertissements, commentaires, accès. {total} entrée(s).</PageHead>

      <form className="filters rise rise-1" action={base}>
        <select name="g" defaultValue={g} className="field">
          <option value="">Toutes les actions</option>
          {Object.entries(LOG_GROUPS).map(([key, group]) => <option key={key} value={key}>{group.label}</option>)}
          <option value="failed">Échecs</option>
        </select>
        <input name="q" defaultValue={q} placeholder="Rechercher un pseudo ou un ID" className="field" style={{ minWidth: 260 }} />
        <button className="btn primary">Filtrer</button>
        {(g || q) && <Link href={base} className="linkish">Réinitialiser</Link>}
      </form>

      <div>
        {rows.length === 0 && <p className="muted" style={{ padding: "30px 0" }}>Aucune entrée.</p>}
        {rows.map((l, i) => (
          <div key={l.id} className="log wide row-in" style={{ ["--i" as string]: Math.min(i, 14) }}>
            <time>{formatDateTime(l.createdAt)}</time>
            <div><span className="tag" data-tone={l.tone}>{l.label}</span></div>
            <div>
              <span style={{ fontWeight: 600 }}>{l.actorName}</span>
              {l.targetName ? <span className="muted"> → {l.targetName}</span> : l.targetId ? <span className="muted"> → {l.targetId}</span> : null}
              {l.details && <div className="muted" style={{ fontSize: 13, marginTop: 3, wordBreak: "break-word" }}>{l.details}</div>}
            </div>
          </div>
        ))}
      </div>

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
