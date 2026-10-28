import Link from "next/link";
import { listAccessibleServers, requireIdentityPage } from "@/lib/auth";
import { getBotStatus } from "@/lib/bot-status";
import { isPlatformOwner } from "@/lib/config";
import { db } from "@/lib/db";
import { Frame, PageHead } from "./shell";
import NewServerForm from "./new-server-form";

export const dynamic = "force-dynamic";

/** Home: the servers the user can open. Platform owners also register new ones here. */
export default async function ServersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const identity = await requireIdentityPage();
  const { error } = await searchParams;
  const servers = await listAccessibleServers(identity);
  const platformOwner = isPlatformOwner(identity.discordId);

  const [counts, bots] = await Promise.all([
    db.all<{ server_id: string; n: number }>("SELECT server_id, COUNT(*) AS n FROM staff_members WHERE left_guild_at IS NULL GROUP BY server_id"),
    Promise.all(servers.map((s) => getBotStatus(s.id)))
  ]);
  const staffCount = new Map(counts.map((c) => [c.server_id, c.n]));

  return (
    <Frame
      identity={identity}
      brandHref="/"
      title="Mes serveurs"
      nav={<Link href="/" data-active><i>01</i>Serveurs</Link>}
      topLinks={<Link href="/" data-active>Serveurs</Link>}
    >
      <PageHead kicker="Dashboard FiveM" title="Serveurs">
        {servers.length ? "Choisis le serveur à gérer." : platformOwner ? "Aucun serveur pour l'instant : ajoute le premier ci-dessous." : "Tu n'as accès à aucun serveur."}
      </PageHead>
      {error === "forbidden" && <div className="banner">Tu n&apos;as pas accès à ce serveur.</div>}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {servers.map((s, i) => (
          <Link key={s.id} href={`/s/${s.id}`} className={`rise rise-${Math.min(i + 1, 4)}`} style={{ display: "block", padding: 20, border: "1px solid var(--line-2)", borderRadius: 14 }}>
            <div className="eyebrow">{s.id}</div>
            <div className="h2" style={{ marginTop: 6 }}>{s.name}</div>
            <div className="muted" style={{ marginTop: 10, fontSize: 13, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span>{staffCount.get(s.id) ?? 0} staff</span>
              <span className={`dot ${bots[i].alive ? "on" : ""}`} />
              <span>{!s.guildId ? "Discord non lié" : bots[i].alive ? "Bot connecté" : "Bot absent"}</span>
              {s.hasFivemToken && <span>· FiveM lié</span>}
            </div>
          </Link>
        ))}
      </div>

      {platformOwner && (
        <section className="rise rise-2" style={{ marginTop: 48, maxWidth: 560 }}>
          <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
            <h2 className="h2">Ajouter un serveur</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>Tu en deviens propriétaire. Ensuite : invite le bot sur le serveur Discord, puis génère le token de l&apos;agent FiveM dans « Accès &amp; rôles ».</p>
          </header>
          <NewServerForm />
        </section>
      )}
    </Frame>
  );
}
