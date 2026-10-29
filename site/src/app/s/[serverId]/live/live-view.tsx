"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Camera, Megaphone, MessageSquare, UserX } from "lucide-react";
import type { LivePlayer, LiveState } from "@/lib/agent";
import { formatDuration } from "@/lib/format";
import { useServerPaths, useUI } from "@/app/ui";
import { useCommand, usePolling } from "../use-command";
import { useBanDialog } from "../security-actions";

type Props = {
  initial: LiveState;
  settingsHref: string | null;
  can: { message: boolean; kick: boolean; announce: boolean; screenshot: boolean; ban: boolean };
};

/** "il y a 12 s", computed on the client only (the server's clock would not match at hydration). */
export function useNow(dep: unknown): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [dep]);
  return now;
}

const since = (iso: string | null, now: number | null) => (iso && now ? formatDuration((now - new Date(iso).getTime()) / 1000) : "—");

export function ServerStatus({ live, now }: { live: LiveState; now: number | null }) {
  const staffIn = live.players.filter((p) => p.staff).length;
  const ping = live.players.length ? Math.round(live.players.reduce((s, p) => s + p.ping, 0) / live.players.length) : 0;
  const cells: [string, React.ReactNode, string][] = [
    [
      "Statut",
      <span key="s" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><span className={`dot ${live.online ? "on" : ""}`} />{live.online ? "En ligne" : "Hors ligne"}</span>,
      live.seenAt ? `dernier contact il y a ${since(live.seenAt, now)}` : "jamais contacté"
    ],
    ["Joueurs", `${live.players.length} / ${live.maxClients || "?"}`, `${staffIn} staff en jeu`],
    ["Uptime", live.online ? formatDuration(live.uptime) : "—", live.hostname ?? ""],
    ["Ping moyen", live.players.length ? `${ping} ms` : "—", live.agentVersion ? `agent ${live.agentVersion}` : ""]
  ];
  return (
    <div className="strip">
      {cells.map(([label, value, hint], i) => (
        <div key={label} className={`rise rise-${i + 1}`}>
          <div className="eyebrow">{label}</div>
          <div className="num" style={{ fontSize: 24 }}>{value}</div>
          <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</small>
        </div>
      ))}
    </div>
  );
}

export function AgentBanner({ live, settingsHref }: { live: LiveState; settingsHref: string | null }) {
  if (!live.linked) {
    return (
      <div className="banner">
        <b>Aucun agent FiveM relié.</b> Installe la ressource <code>fiverax_agent</code> sur le serveur et colle son token dans le <code>server.cfg</code>.
        {settingsHref && <> <Link href={settingsHref} className="linkish">Ouvrir la configuration</Link></>}
      </div>
    );
  }
  if (!live.online) return <div className="banner"><b>Le serveur FiveM ne répond plus.</b> Serveur éteint, agent arrêté, ou panel injoignable depuis le serveur.</div>;
  return null;
}

export default function LiveView({ initial, settingsHref, can }: Props) {
  const paths = useServerPaths();
  const { ask } = useUI();
  const { send, busy } = useCommand();
  const { ban } = useBanDialog();
  const { data: live, refresh } = usePolling<LiveState>(paths.api("live"), initial, 4000);
  const now = useNow(live);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return live.players.filter((p) => !needle || p.name.toLowerCase().includes(needle) || String(p.id) === needle || p.discordId?.includes(needle) || p.staff?.username.toLowerCase().includes(needle));
  }, [live.players, query]);

  async function message(p: LivePlayer) {
    const answer = await ask({ title: "Message privé", message: `${p.name} (#${p.id}) le verra dans son chat.`, confirmLabel: "Envoyer", input: { label: "Message", required: true, multiline: true } });
    if (answer) await send("dm", { target: p.id, message: answer.value }, `Message envoyé à ${p.name}`);
  }

  async function kick(p: LivePlayer) {
    const answer = await ask({ title: `Kick ${p.name}`, message: "Le joueur est déconnecté avec ce message.", confirmLabel: "Kick", danger: true, input: { label: "Raison", required: true, placeholder: "Ex. : comportement, AFK…" } });
    if (answer && (await send("kick", { target: p.id, reason: answer.value }, `${p.name} a été expulsé`))) refresh();
  }

  async function announce() {
    const answer = await ask({ title: "Annonce", message: "Tous les joueurs connectés la verront dans leur chat.", confirmLabel: "Annoncer", input: { label: "Message", required: true, multiline: true } });
    if (answer) await send("announce", { message: answer.value }, "Annonce envoyée");
  }

  return (
    <>
      <AgentBanner live={live} settingsHref={settingsHref} />
      <ServerStatus live={live} now={now} />

      <section className="sect rise rise-2">
        <header>
          <h2 className="h2">Joueurs connectés <span className="muted" style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>· {live.players.length}</span></h2>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, ID, Discord…" className="field" style={{ width: 220 }} />
            {can.announce && <button className="btn" disabled={busy || !live.online} onClick={announce}><Megaphone size={15} />Annonce</button>}
          </div>
        </header>

        {live.online && live.players.length === 0 && <p className="muted" style={{ padding: "26px 0" }}>Personne en jeu pour l&apos;instant.</p>}
        {visible.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl" style={{ minWidth: 760 }}>
              <thead>
                <tr><th>ID</th><th>Joueur</th><th>Staff</th><th>Connecté depuis</th><th>Ping</th><th style={{ textAlign: "right" }}>Actions</th></tr>
              </thead>
              <tbody>
                {visible.map((p, i) => (
                  <tr key={p.id} className="row-in" style={{ ["--i" as string]: Math.min(i, 14) }}>
                    <td className="num-cell muted">#{p.id}</td>
                    <td style={{ fontWeight: 600 }}>
                      {p.playerId ? <Link href={paths.page(`/players/${p.playerId}`)}>{p.name}</Link> : p.name}
                    </td>
                    <td>
                      {p.staff
                        ? <Link href={paths.page(`/staff/${p.discordId}`)} className="plate"><span>{p.staff.grade || "Staff"}</span></Link>
                        : <span className="muted">—</span>}
                    </td>
                    <td className="num-cell">{since(p.connectedAt, now)}</td>
                    <td className="num-cell" style={{ color: p.ping > 200 ? "var(--warn)" : undefined }}>{p.ping} ms</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        {can.message && <button className="ibtn" title="Message privé" disabled={busy} onClick={() => message(p)}><MessageSquare size={14} /></button>}
                        {can.screenshot && <button className="ibtn" title="Capture d'écran (analysée par l'IA)" disabled={busy} onClick={() => send("screenshot", { target: p.id }, `Capture de ${p.name} envoyée à l'analyse`)}><Camera size={14} /></button>}
                        {can.kick && <button className="ibtn bad" title="Kick" disabled={busy} onClick={() => kick(p)}><UserX size={14} /></button>}
                        {can.ban && p.playerId && <button className="ibtn bad" title="Bannir" onClick={() => ban(p.playerId as number, p.name)}><Ban size={14} /></button>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
