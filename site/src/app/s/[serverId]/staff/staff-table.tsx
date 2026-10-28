"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Minus, PencilLine, Plus, UserMinus } from "lucide-react";
import { formatDuration } from "@/lib/format";
import Avatar from "@/app/avatar";
import { describeApiError, useServerPaths, useUI } from "@/app/ui";

export type StaffRow = {
  id: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  grade: string;
  gradeLevel: number;
  voiceSeconds: number;
  fivemSeconds: number;
  inVoice: boolean;
  inFivem: boolean;
  warnLevel: number;
  badge: string | null;
  lastNote: { body: string; author: string; createdAt: string } | null;
  canUp: boolean;
  canDown: boolean;
  canDemote: boolean;
  canWarnAdd: boolean;
  canWarnRemove: boolean;
  canComment: boolean;
};

type SortKey = "username" | "gradeLevel" | "voiceSeconds" | "fivemSeconds" | "warnLevel" | "note";
const badgeColor: Record<string, string> = { red: "#fb7185", yellow: "#fbbf24", green: "#4ade80", blue: "#60a5fa" };

export default function StaffTable({ rows, grades }: { rows: StaffRow[]; grades: string[] }) {
  const router = useRouter();
  const { ask, toast } = useUI();
  const paths = useServerPaths();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "gradeLevel", dir: -1 });
  const [grade, setGrade] = useState("");
  const [query, setQuery] = useState("");
  const [voiceOnly, setVoiceOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (!grade || r.grade === grade) &&
        (!voiceOnly || r.inVoice) &&
        (!needle || r.username.toLowerCase().includes(needle) || r.discordId.includes(needle))
    );
    const value = (r: StaffRow): number | string => (sort.key === "note" ? r.lastNote?.createdAt ?? "" : r[sort.key]);
    return filtered.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const cmp = typeof x === "string" ? x.localeCompare(y as string, "fr", { sensitivity: "base" }) : x - (y as number);
      return cmp * sort.dir || a.username.localeCompare(b.username, "fr", { sensitivity: "base" });
    });
  }, [rows, grade, query, voiceOnly, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "username" ? 1 : -1 }));
  }

  async function post(kind: string, payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fetch(paths.api(`admin?kind=${kind}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(describeApiError(data, res.status), "error");
      toast(success, "ok");
      router.refresh();
    } catch {
      toast("Impossible de joindre le serveur.", "error");
    } finally {
      setBusy(false);
    }
  }

  /** Ask for an optional reason in an in-page dialog, then send the action. */
  async function act(row: StaffRow, kind: string, extra: Record<string, unknown>, title: string, success: string, danger = false) {
    const answer = await ask({
      title,
      message: row.username,
      confirmLabel: "Confirmer",
      danger,
      input: { label: "Raison (facultative)", placeholder: "Ex. : inactivité, bon travail…" }
    });
    if (!answer) return;
    await post(kind, { discordId: row.discordId, reason: answer.value || "Sans raison précisée", ...extra }, success);
  }

  async function comment(row: StaffRow) {
    const answer = await ask({
      title: "Nouveau commentaire",
      message: row.username,
      confirmLabel: "Enregistrer",
      input: { label: "Commentaire", multiline: true, required: true }
    });
    if (!answer) return;
    await post("note", { discordId: row.discordId, body: answer.value }, "Commentaire ajouté");
  }

  const th = (key: SortKey, label: string) => (
    <th>
      <button data-on={sort.key === key} onClick={() => toggleSort(key)}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </button>
    </th>
  );

  return (
    <>
      <div className="filters">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un pseudo ou un ID" className="field" style={{ minWidth: 240 }} />
        <select value={grade} onChange={(e) => setGrade(e.target.value)} className="field">
          <option value="">Tous les grades</option>
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={voiceOnly} onChange={(e) => setVoiceOnly(e.target.checked)} /> En vocal</label>
        <span className="muted" style={{ fontSize: 12 }}>{visible.length} / {rows.length}</span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {th("username", "Membre")}
              {th("gradeLevel", "Grade")}
              <th>Gestion</th>
              {th("voiceSeconds", "Vocal")}
              {th("fivemSeconds", "Jeu")}
              <th>État</th>
              {th("warnLevel", "Avert")}
              {th("note", "Commentaire")}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 40 }}>Aucun membre trouvé.</td></tr>}
            {visible.map((m, i) => (
              <tr key={m.id} className="row-in" style={{ ["--i" as string]: Math.min(i, 14) }}>
                <td>
                  <Link href={paths.page(`/staff/${m.discordId}`)} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Avatar url={m.avatarUrl} name={m.username} size={38} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                        {m.username}
                        {m.badge && <span title="Pastille" style={{ width: 8, height: 8, borderRadius: "50%", background: badgeColor[m.badge] }} />}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>{m.discordId}</div>
                    </div>
                  </Link>
                </td>
                <td><span className={`plate ${m.gradeLevel === 0 ? "dim" : ""}`}><span>{m.grade}</span></span></td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="ibtn" title="Up : monter d'un grade" aria-label="Up" disabled={busy || !m.canUp} onClick={() => act(m, "rank", { action: "up" }, "Monter d'un grade", `${m.username} monte d'un grade`)}><ArrowUp size={15} /></button>
                    <button className="ibtn" title="Down : descendre d'un grade" aria-label="Down" disabled={busy || !m.canDown} onClick={() => act(m, "rank", { action: "down" }, "Descendre d'un grade", `${m.username} descend d'un grade`)}><ArrowDown size={15} /></button>
                    <button className="ibtn bad" title="Demote : retirer du staff" aria-label="Demote" disabled={busy || !m.canDemote} onClick={() => act(m, "rank", { action: "demote" }, "Retirer du staff ?", `${m.username} retiré du staff`, true)}><UserMinus size={15} /></button>
                  </div>
                </td>
                <td className="num-cell">{formatDuration(m.voiceSeconds)}</td>
                <td className="num-cell">{formatDuration(m.fivemSeconds)}</td>
                <td className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className={`dot ${m.inVoice ? "on" : ""}`} />{m.inVoice ? "En vocal" : "Hors vocal"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}><span className={`dot ${m.inFivem ? "on" : ""}`} />{m.inFivem ? "En jeu" : "Hors jeu"}</div>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button className="ibtn" title="Retirer un avert" aria-label="Retirer un avert" disabled={busy || !m.canWarnRemove} onClick={() => act(m, "warn_remove", {}, "Retirer un avert", `Avert retiré à ${m.username}`)}><Minus size={15} /></button>
                    <span className="pips" data-level={m.warnLevel} title={`Avert ${m.warnLevel}/3`}><i /><i /><i /></span>
                    <button className="ibtn" title="Ajouter un avert" aria-label="Ajouter un avert" disabled={busy || !m.canWarnAdd} onClick={() => act(m, "warn_add", {}, "Ajouter un avert", `Avert ajouté à ${m.username}`, true)}><Plus size={15} /></button>
                  </div>
                </td>
                <td style={{ maxWidth: 280 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button className="ibtn" title="Ajouter un commentaire" aria-label="Commentaire" disabled={busy || !m.canComment} onClick={() => comment(m)}><PencilLine size={14} /></button>
                    {m.lastNote ? (
                      <div style={{ minWidth: 0, fontSize: 12 }}>
                        <div title={m.lastNote.body} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.lastNote.body}</div>
                        <div className="muted">par {m.lastNote.author}</div>
                      </div>
                    ) : <span className="muted">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
