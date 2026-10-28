import Link from "next/link";
import { listAccessibleServers, requireIdentityPage } from "@/lib/auth";
import { getBotStatus } from "@/lib/bot-status";
import { isPlatformOwner } from "@/lib/config";
import { db } from "@/lib/db";
import { countServersCreatedBy, listManageableGuilds, maxServersPerUser } from "@/lib/servers";
import { Frame, PageHead } from "../shell";
import AddServer, { GuildIcon } from "../new-server-form";

export const dynamic = "force-dynamic";

/** Home: the servers the user can open, and their Discord servers they can add (self-service). */
export default async function ServersPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  const identity = await requireIdentityPage();
  const { error, deleted } = await searchParams;
  const platformOwner = isPlatformOwner(identity.discordId);
  const [servers, guilds, created] = await Promise.all([
    listAccessibleServers(identity),
    listManageableGuilds(identity.discordId),
    countServersCreatedBy(identity.discordId)
  ]);

  const [counts, bots] = await Promise.all([
    db.all<{ server_id: string; n: number }>("SELECT server_id, COUNT(*) AS n FROM staff_members WHERE left_guild_at IS NULL GROUP BY server_id"),
    Promise.all(servers.map((s) => getBotStatus(s.id)))
  ]);
  const staffCount = new Map(counts.map((c) => [c.server_id, c.n]));

  return (
    <Frame
      identity={identity}
      brandHref="/servers"
      title="Mes serveurs"
      nav={<Link href="/servers" data-active><i>01</i>Serveurs</Link>}
      topLinks={<Link href="/servers" data-active>Serveurs</Link>}
    >
      <PageHead kicker="Dashboard FiveM" title="Serveurs">
        {servers.length ? "Choisis le serveur à gérer, ou ajoute le tien." : "Ajoute ton serveur pour commencer : tu en deviens le propriétaire."}
      </PageHead>
      {error === "forbidden" && <div className="banner">Tu n&apos;as pas accès à ce serveur.</div>}
      {deleted && <div className="banner">Le serveur a été supprimé, avec toutes ses données.</div>}

      {servers.length > 0 && (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", marginBottom: 48 }}>
          {servers.map((s, i) => (
            <Link key={s.id} href={`/s/${s.id}`} className={`rise rise-${Math.min(i + 1, 4)}`} style={{ display: "flex", gap: 14, padding: 20, border: "1px solid var(--line-2)", borderRadius: 14 }}>
              <GuildIcon url={s.iconUrl} name={s.name} size={46} />
              <div style={{ minWidth: 0 }}>
                <div className="h2" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                <div className="muted" style={{ marginTop: 8, fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span>{staffCount.get(s.id) ?? 0} staff</span>
                  <span className={`dot ${bots[i].alive ? "on" : ""}`} />
                  <span>{!s.guildId ? "Discord non lié" : bots[i].alive ? "Bot connecté" : "Bot absent"}</span>
                  {s.hasFivemToken && <span>· FiveM lié</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <section className="rise rise-2" style={{ maxWidth: 640 }}>
        <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
          <h2 className="h2">Ajouter un serveur</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Choisis un de tes serveurs Discord. Tu en deviens propriétaire, puis la page Configuration te guide : inviter le bot, choisir les rôles, relier FiveM.
            {!platformOwner && <> {Math.max(0, maxServersPerUser() - created)} création(s) restante(s).</>}
          </p>
        </header>
        <AddServer guilds={guilds} accessible={servers.map((s) => s.id)} manual={platformOwner} remaining={platformOwner ? 999 : maxServersPerUser() - created} />
      </section>
    </Frame>
  );
}
