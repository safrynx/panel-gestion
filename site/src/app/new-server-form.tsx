"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ManagedGuild } from "@/lib/servers";
import { describeApiError, useUI } from "./ui";

type Props = {
  /** Guilds the user manages on Discord (read at login), with the server already using each one. */
  guilds: ManagedGuild[];
  /** Servers of this list the user can open (an already registered guild links to its server when they have access). */
  accessible: string[];
  /** Platform owners can also register any guild by its ID. */
  manual: boolean;
  remaining: number;
};

/** Register a server from one of the user's Discord guilds, then open its configuration to finish the setup. */
export default function AddServer({ guilds, accessible, manual, remaining }: Props) {
  const router = useRouter();
  const { toast } = useUI();
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [guildId, setGuildId] = useState("");

  async function create(payload: { name: string; guildId: string | null }, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/servers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(describeApiError(data, res.status), "error");
      toast(`Serveur « ${data.server.name} » créé`, "ok");
      router.push(`/s/${data.server.id}/settings`);
    } catch {
      toast("Impossible de joindre le serveur.", "error");
    } finally {
      setBusy(null);
    }
  }

  const free = guilds.filter((g) => !g.serverId);
  const taken = guilds.filter((g) => g.serverId);

  return (
    <div style={{ marginTop: 18 }}>
      {guilds.length === 0 && (
        <p className="muted">
          Aucun serveur Discord où tu as la permission « Gérer le serveur ». Il faut être propriétaire, administrateur ou avoir cette permission
          sur le serveur Discord à ajouter. Si tu viens de l&apos;obtenir, <a href="/api/auth/discord" className="linkish">reconnecte-toi</a>.
        </p>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {[...free, ...taken].map((g) => (
          <div key={g.guildId} className="guild-row">
            <GuildIcon url={g.iconUrl} name={g.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{g.serverId ? "Déjà enregistré" : g.guildId}</div>
            </div>
            {g.serverId ? (
              accessible.includes(g.serverId) ? <Link href={`/s/${g.serverId}`} className="btn sm">Ouvrir</Link> : <span className="muted" style={{ fontSize: 12 }}>géré par quelqu&apos;un d&apos;autre</span>
            ) : (
              <button className="btn primary sm" disabled={busy !== null || remaining <= 0} onClick={() => create({ name: g.name.slice(0, 60), guildId: g.guildId }, g.guildId)}>
                {busy === g.guildId ? "Création…" : "Ajouter"}
              </button>
            )}
          </div>
        ))}
      </div>
      {free.length > 0 && remaining <= 0 && <p className="banner" style={{ marginTop: 12 }}>Limite atteinte : tu as déjà créé le nombre maximum de serveurs.</p>}
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Liste lue à ta connexion. Un serveur Discord manque ? <a href="/api/auth/discord" className="linkish">Reconnecte-toi</a> pour l&apos;actualiser.
      </p>

      {manual && (
        <form
          onSubmit={(e) => { e.preventDefault(); void create({ name: name.trim(), guildId: guildId.trim() || null }, "manual"); }}
          style={{ display: "grid", gap: 12, marginTop: 26, paddingTop: 18, borderTop: "1px solid var(--line)" }}
        >
          <div className="eyebrow">Admin plateforme · ajout manuel</div>
          <input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du serveur (ex. Mon serveur RP)" className="field" />
          <input value={guildId} onChange={(e) => setGuildId(e.target.value)} pattern="\d{17,20}" placeholder="ID du serveur Discord (facultatif)" className="field" />
          <div><button className="btn" disabled={busy !== null}>{busy === "manual" ? "Création…" : "Créer le serveur"}</button></div>
        </form>
      )}
    </div>
  );
}

export function GuildIcon({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  const style = { width: size, height: size, borderRadius: 12, flex: "none" as const };
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" style={style} />;
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <span style={{ ...style, display: "grid", placeItems: "center", background: "rgba(var(--accent-rgb),.16)", color: "var(--accent-soft)", fontWeight: 700, fontSize: size * 0.36 }}>{initials}</span>;
}
