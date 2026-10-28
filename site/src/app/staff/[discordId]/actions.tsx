"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, UserMinus } from "lucide-react";
import { describeApiError, useUI } from "../../ui";

type Props =
  | { mode: "badge"; discordId: string; username: string }
  | { mode: "note"; discordId: string; username: string }
  | { mode: "rank"; discordId: string; username: string; grades: string[]; current: string; canUp: boolean; canDown: boolean; canDemote: boolean }
  | { mode: "warn_add"; discordId: string; username: string }
  | { mode: "warn_remove"; discordId: string; username: string; warningId: number }
  | { mode: "resolve"; badgeId: number };

export default function MemberActions(props: Props) {
  const router = useRouter();
  const { ask, toast } = useUI();
  const [text, setText] = useState("");
  const [choice, setChoice] = useState(props.mode === "badge" ? "blue" : props.mode === "rank" ? props.grades[0] ?? "" : "");
  const [busy, setBusy] = useState(false);

  async function send(kind: string, payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin?kind=${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(describeApiError(data, res.status), "error");
      toast(success, "ok");
      setText("");
      router.refresh();
    } catch {
      toast("Impossible de joindre le serveur.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (props.mode === "resolve") {
    return <button disabled={busy} className="linkish" onClick={() => send("badge_resolve", { badgeId: props.badgeId }, "Pastille résolue")}>Marquer comme résolue</button>;
  }

  if (props.mode === "warn_remove") {
    return (
      <button
        disabled={busy}
        className="linkish"
        onClick={async () => {
          const answer = await ask({ title: "Retirer cet avertissement", message: props.username, confirmLabel: "Retirer", input: { label: "Raison du retrait", required: true } });
          if (answer) await send("warn_remove", { discordId: props.discordId, warningId: props.warningId, reason: answer.value }, "Avertissement retiré");
        }}
      >
        Retirer
      </button>
    );
  }

  const reasonField = (label: string, rows = 2) => (
    <textarea className="field" rows={rows} value={text} onChange={(e) => setText(e.target.value)} placeholder={label} aria-label={label} />
  );

  if (props.mode === "rank") {
    const run = async (action: "up" | "down" | "demote") => {
      if (action === "demote") {
        const ok = await ask({ title: "Retirer du staff ?", message: `${props.username} perdra tous ses rôles de grade et de staff.`, confirmLabel: "Demote", danger: true });
        if (!ok) return;
      }
      await send("rank", { discordId: props.discordId, action, reason: text.trim() || "Sans raison précisée" }, action === "up" ? "Grade monté" : action === "down" ? "Grade descendu" : "Retiré du staff");
    };
    return (
      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {reasonField("Raison (facultative)")}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {props.canUp && <button className="btn primary" disabled={busy} onClick={() => run("up")}><ArrowUp size={15} /> Up</button>}
          {props.canDown && <button className="btn" disabled={busy} onClick={() => run("down")}><ArrowDown size={15} /> Down</button>}
          {props.canDemote && <button className="btn danger" disabled={busy} onClick={() => run("demote")}><UserMinus size={15} /> Demote</button>}
        </div>
        {props.grades.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 12 }}>Ou choisir un grade :</span>
            <select className="field" style={{ width: "auto", minWidth: 200 }} value={choice} onChange={(e) => setChoice(e.target.value)}>
              {props.grades.map((g) => <option key={g} value={g}>{g}{g === props.current ? " (actuel)" : ""}</option>)}
            </select>
            <button className="btn" disabled={busy || !choice} onClick={() => send("grade", { discordId: props.discordId, gradeName: choice, reason: text.trim() || "Sans raison précisée" }, `Grade : ${choice}`)}>Appliquer</button>
          </div>
        )}
      </div>
    );
  }

  const label = props.mode === "note" ? "Nouveau commentaire…" : props.mode === "badge" ? "Raison de la pastille…" : "Raison de l'avertissement…";
  const submit = () => {
    if (props.mode === "badge") return send("badge", { discordId: props.discordId, color: choice, reason: text }, "Pastille ajoutée");
    if (props.mode === "note") return send("note", { discordId: props.discordId, body: text }, "Commentaire ajouté");
    return send("warn_add", { discordId: props.discordId, reason: text }, "Avertissement ajouté");
  };

  return (
    <form style={{ marginTop: 18, display: "grid", gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) void submit(); }}>
      {props.mode === "badge" && (
        <select className="field" value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="red">Rouge — Alerte</option>
          <option value="yellow">Jaune — Vigilance</option>
          <option value="green">Verte — Positif</option>
          <option value="blue">Bleue — Information</option>
        </select>
      )}
      {reasonField(label)}
      <div><button className={`btn ${props.mode === "warn_add" ? "danger" : "primary"}`} disabled={busy || !text.trim()}>
        {props.mode === "badge" ? "Ajouter la pastille" : props.mode === "note" ? "Ajouter le commentaire" : "Ajouter un avertissement"}
      </button></div>
    </form>
  );
}
