"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import Avatar from "@/app/avatar";
import { describeApiError, useServerPaths, useUI } from "@/app/ui";

type Candidate = { discordId: string; username: string; avatarUrl: string | null; isStaff: boolean; currentGrade: string | null };

/** `grades` are the grades this user may hand out, lowest first. */
export default function RecruitButton({ grades }: { grades: string[] }) {
  const router = useRouter();
  const { toast } = useUI();
  const paths = useServerPaths();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [grade, setGrade] = useState(grades[0] ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || picked || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(paths.api(`recruit?q=${encodeURIComponent(query.trim())}`));
        const data = await res.json().catch(() => ({}));
        if (!res.ok) toast(describeApiError(data, res.status), "error");
        setResults(res.ok ? data.results : []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open, picked, toast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close() {
    setOpen(false);
    setQuery("");
    setPicked(null);
    setReason("");
    setResults([]);
  }

  async function recruit() {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await fetch(paths.api("recruit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId: picked.discordId, gradeName: grade, reason: reason.trim() || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error === "already_staff" ? "Cette personne est déjà dans le staff." : describeApiError(data, res.status), "error");
      toast(`${data.username} recruté(e) : ${data.grade}`, "ok");
      close();
      router.refresh();
    } catch {
      toast("Impossible de joindre le serveur.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)} disabled={grades.length === 0} title={grades.length === 0 ? "Aucun grade que tu puisses attribuer" : undefined}>
        <UserPlus size={15} /> Recruter
      </button>
      {open && mounted && createPortal(
        <div className="veil" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <form className="dialog" style={{ width: "min(520px, 100%)" }} onSubmit={(e) => { e.preventDefault(); void recruit(); }}>
            <h3>Recruter dans le staff</h3>
            <p>Le bot donne le grade choisi et le rôle staff à la personne sur Discord.</p>

            {!picked ? (
              <>
                <label htmlFor="recruit-q">Pseudo ou ID Discord</label>
                <input id="recruit-q" className="field" autoFocus placeholder="Au moins 2 caractères…" value={query} onChange={(e) => setQuery(e.target.value)} />
                <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
                  {searching && <div className="muted" style={{ padding: 10 }}>Recherche…</div>}
                  {!searching && query.trim().length >= 2 && results.length === 0 && <div className="muted" style={{ padding: 10 }}>Aucun membre trouvé sur le serveur.</div>}
                  {results.map((c) => (
                    <button
                      type="button"
                      key={c.discordId}
                      disabled={c.isStaff}
                      onClick={() => setPicked(c)}
                      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 10, border: 0, background: "transparent", opacity: c.isStaff ? 0.45 : 1, cursor: c.isStaff ? "not-allowed" : "pointer" }}
                      className="pick"
                    >
                      <Avatar url={c.avatarUrl} name={c.username} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{c.username}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{c.discordId}</div>
                      </div>
                      {c.isStaff && <span className="tag">Déjà staff{c.currentGrade ? ` · ${c.currentGrade}` : ""}</span>}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
                  <Avatar url={picked.avatarUrl} name={picked.username} size={42} />
                  <div style={{ flex: 1 }}><b>{picked.username}</b><div className="muted" style={{ fontSize: 12 }}>{picked.discordId}</div></div>
                  <button type="button" className="linkish" onClick={() => setPicked(null)}>Changer</button>
                </div>
                <label htmlFor="recruit-grade">Grade de départ</label>
                <select id="recruit-grade" className="field" value={grade} onChange={(e) => setGrade(e.target.value)}>
                  {grades.map((g, i) => <option key={g} value={g}>{g}{i === 0 ? " (le plus bas)" : ""}</option>)}
                </select>
                <label htmlFor="recruit-reason">Note (facultative)</label>
                <input id="recruit-reason" className="field" placeholder="Ex. : candidature acceptée" value={reason} onChange={(e) => setReason(e.target.value)} />
              </>
            )}

            <div className="actions">
              <button type="button" className="btn" onClick={close}>Annuler</button>
              <button className="btn primary" disabled={!picked || busy}>{busy ? "Recrutement…" : "Recruter"}</button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </>
  );
}
