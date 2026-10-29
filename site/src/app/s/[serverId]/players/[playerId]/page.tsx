import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePermissionPage } from "@/lib/auth";
import { getLiveState } from "@/lib/agent";
import { getPlayer } from "@/lib/players";
import { formatDateTime, formatDuration } from "@/lib/format";
import Shell from "@/app/shell";
import CopyButton from "@/app/copy-button";
import PlayerActions from "./player-actions";

export const dynamic = "force-dynamic";

/** Readable name of each kind of identifier ("steam:…" -> Steam). */
const IDENTIFIER_LABELS: Record<string, string> = {
  license: "Rockstar", license2: "Rockstar (2)", discord: "Discord", steam: "Steam", fivem: "Cfx.re", xbl: "Xbox", live: "Microsoft", live2: "Microsoft (2)"
};

export default async function PlayerPage({ params }: { params: Promise<{ serverId: string; playerId: string }> }) {
  const { serverId, playerId } = await params;
  const { user, server } = await requirePermissionPage(serverId, "view_live");
  const id = Number(playerId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [player, live] = await Promise.all([getPlayer(server.id, id), getLiveState(server.id)]);
  if (!player) notFound();
  const inGame = live.players.find((p) => p.playerId === player.id) ?? null;

  const summary: [string, string][] = [
    ["Temps de jeu", formatDuration(player.playSeconds)],
    ["Connexions", String(player.connections)],
    ["Première venue", formatDateTime(player.firstSeenAt)],
    ["Dernière venue", inGame ? "En jeu" : formatDateTime(player.lastSeenAt)]
  ];

  return (
    <Shell user={user} server={server} active="players">
      <Link href={`/s/${server.id}/players`} className="linkish rise" style={{ display: "inline-block", marginBottom: 22 }}>← Retour aux joueurs</Link>

      <div className="head rise" style={{ alignItems: "center" }}>
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`dot ${inGame ? "on" : ""}`} />{inGame ? `En jeu · ID #${inGame.id} · ${inGame.ping} ms` : "Hors ligne"}
          </div>
          <h1 className="h1" style={{ fontSize: "clamp(22px,3vw,34px)" }}>{player.name}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            {player.staff && <Link href={`/s/${server.id}/staff/${player.discordId}`} className="plate"><span>Staff · {player.staff.grade || player.staff.username}</span></Link>}
            <span className="muted" style={{ fontSize: 12 }}>{player.license}</span>
          </div>
        </div>
        {inGame && (
          <PlayerActions target={inGame.id} name={player.name} canMessage={can(user, "player_message")} canKick={can(user, "player_kick")} />
        )}
      </div>

      <div className="strip">
        {summary.map(([label, value], i) => <div key={label} className={`rise rise-${i + 1}`}><div className="eyebrow">{label}</div><div className="num" style={{ fontSize: 22 }}>{value}</div></div>)}
      </div>

      <div className="cols even">
        <section className="rise rise-1">
          <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}><h2 className="h2">Identifiants</h2></header>
          <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
            {player.identifiers.map((raw) => {
              const [kind, ...rest] = raw.split(":");
              return (
                <li key={raw} style={{ display: "flex", gap: 14, alignItems: "center", padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
                  <span className="muted" style={{ width: 110, fontSize: 12, flex: "none" }}>{IDENTIFIER_LABELS[kind] ?? kind}</span>
                  <code style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontSize: 12 }}>{rest.join(":")}</code>
                  <CopyButton text={raw} label="Copier" />
                </li>
              );
            })}
          </ul>
          <p className="muted" style={{ fontSize: 12 }}>Les adresses IP ne sont jamais enregistrées.</p>
        </section>

        <section className="rise rise-2">
          <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}><h2 className="h2">Dernières sessions</h2></header>
          <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
            {player.sessions.length === 0 && <li className="muted" style={{ padding: "16px 0" }}>Aucune session.</li>}
            {player.sessions.map((s) => (
              <li key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <div className="num-cell">{formatDateTime(s.startedAt)}{s.endedAt ? ` → ${formatDateTime(s.endedAt)}` : ""}</div>
                  {s.leaveReason && <div className="muted" style={{ fontSize: 12 }}>{s.leaveReason}</div>}
                </div>
                {s.endedAt ? <span className="num-cell">{formatDuration(s.seconds)}</span> : <span className="tag" data-tone="up">En cours</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
