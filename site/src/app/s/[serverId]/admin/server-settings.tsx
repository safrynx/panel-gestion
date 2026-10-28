"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "@/app/copy-button";
import { describeApiError, useServerPaths, useUI } from "@/app/ui";

type Props = {
  name: string;
  guildId: string | null;
  timezone: string | null;
  reviewHour: number | null;
  defaultTimezone: string;
  defaultReviewHour: number;
  /** Only platform owners may move a server to another Discord guild. */
  canChangeGuild: boolean;
  hasFivemToken: boolean;
  fivemUrl: string;
  inviteUrl: string | null;
};

/** The server's identity (name, Discord guild, time zone) and the token of its FiveM agent. */
export default function ServerSettings(props: Props) {
  const router = useRouter();
  const { ask, toast } = useUI();
  const paths = useServerPaths();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(props.name);
  const [guildId, setGuildId] = useState(props.guildId ?? "");
  const [timezone, setTimezone] = useState(props.timezone ?? "");
  const [reviewHour, setReviewHour] = useState(props.reviewHour === null ? "" : String(props.reviewHour));
  const [token, setToken] = useState<string | null>(null);

  async function post(kind: string, payload: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true);
    try {
      const res = await fetch(paths.api(`access?kind=${kind}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(describeApiError(data, res.status), "error");
        return null;
      }
      return data;
    } catch {
      toast("Impossible de joindre le serveur.", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: name.trim(),
      timezone: timezone.trim(),
      reviewHour: reviewHour === "" ? null : Number(reviewHour)
    };
    if (props.canChangeGuild) payload.guildId = guildId.trim() || null;
    if (await post("server_update", payload)) {
      toast("Serveur enregistré", "ok");
      router.refresh();
    }
  }

  async function rotate() {
    if (props.hasFivemToken) {
      const answer = await ask({ title: "Nouveau token FiveM", message: "L'ancien token cessera de fonctionner : il faudra mettre le nouveau dans le server.cfg.", confirmLabel: "Générer", danger: true });
      if (!answer) return;
    }
    const data = await post("fivem_token_rotate", {});
    if (data?.token) {
      setToken(String(data.token));
      router.refresh();
    }
  }

  const cfg = token ? `set gtasun_staff_api_url "${props.fivemUrl}"\nset gtasun_staff_api_token "${token}"\nensure gtasun_staff_agent` : "";

  return (
    <div className="cols" style={{ gap: 56, marginBottom: 56 }}>
      <section className="rise rise-1">
        <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
          <h2 className="h2">Serveur</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>Nom affiché, serveur Discord suivi par le bot, et fuseau horaire de la communauté (semaines et bilan du dimanche).</p>
        </header>
        <form onSubmit={save} style={{ display: "grid", gap: 12, marginTop: 18, maxWidth: 520 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Nom</span>
            <input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="field" />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>ID du serveur Discord{props.canChangeGuild ? "" : " (modifiable par un administrateur de la plateforme)"}</span>
            <input value={guildId} onChange={(e) => setGuildId(e.target.value)} disabled={!props.canChangeGuild} placeholder="ex. 123456789012345678" pattern="\d{17,20}" className="field" />
          </label>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>Fuseau horaire</span>
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder={`${props.defaultTimezone} (par défaut)`} className="field" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>Heure du bilan IA</span>
              <input type="number" min={0} max={23} value={reviewHour} onChange={(e) => setReviewHour(e.target.value)} placeholder={`${props.defaultReviewHour} h`} className="field" />
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn primary" disabled={busy}>Enregistrer</button>
            {props.inviteUrl && <a href={props.inviteUrl} target="_blank" rel="noreferrer" className="linkish">Inviter le bot sur ce serveur Discord</a>}
          </div>
        </form>
      </section>

      <section className="rise rise-2">
        <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
          <h2 className="h2">Agent FiveM</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>Chaque serveur a son propre token : la ressource <code>gtasun_staff_agent</code> l&apos;envoie avec chaque session de jeu, et le panel sait ainsi à quel serveur elle appartient.</p>
        </header>
        <p style={{ marginTop: 18 }}>
          <span className="tag" data-tone={props.hasFivemToken ? "up" : "warn"}>{props.hasFivemToken ? "Token configuré" : "Aucun token"}</span>
        </p>
        <button className="btn" disabled={busy} onClick={rotate}>{props.hasFivemToken ? "Générer un nouveau token" : "Générer le token"}</button>
        {token && (
          <div className="banner" style={{ marginTop: 16 }}>
            <b>À copier maintenant : ce token ne sera plus jamais affiché.</b> Ajoute ces lignes au <code>server.cfg</code> du serveur FiveM :
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "10px 0" }}>{cfg}</pre>
            <CopyButton text={cfg} label="Copier" />
          </div>
        )}
      </section>
    </div>
  );
}
