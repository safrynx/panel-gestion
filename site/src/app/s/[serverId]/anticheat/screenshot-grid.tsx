"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Ban, Sparkles, X } from "lucide-react";
import type { Screenshot } from "@/lib/security";
import { detectionLabel } from "@/lib/security-config";
import { formatDateTime } from "@/lib/format";
import { useServerPaths } from "@/app/ui";
import { useBanDialog, useSecurityAction } from "../security-actions";

export const VERDICTS: Record<Screenshot["verdict"], [string, string]> = {
  cheat: ["Cheat", "danger"],
  suspicious: ["Suspect", "warn"],
  clean: ["Propre", "up"],
  pending: ["Analyse…", "neutral"],
  error: ["Erreur IA", "neutral"],
  skipped: ["Non analysée", "neutral"]
};

const reasonLabel = (reason: string) => (reason === "manual" ? "Demandée par le staff" : reason === "random" ? "Contrôle aléatoire" : detectionLabel(reason));

/** Screenshots with the AI verdict; click one to see it full size. */
export default function ScreenshotGrid({ shots, canBan, canAnalyze }: { shots: Screenshot[]; canBan: boolean; canAnalyze: boolean }) {
  const paths = useServerPaths();
  const [open, setOpen] = useState<Screenshot | null>(null);
  const { run, busy } = useSecurityAction();
  const { ban, busy: banning } = useBanDialog();

  if (shots.length === 0) {
    return <p className="muted" style={{ padding: "30px 0" }}>Aucune capture. Elles sont prises sur détection, à la demande (page du joueur ou « En direct »), ou au hasard si tu l&apos;actives dans les réglages.</p>;
  }

  return (
    <>
      <div className="shots rise rise-2">
        {shots.map((s) => {
          const [label, tone] = VERDICTS[s.verdict];
          return (
            <button key={s.id} className="shot" onClick={() => setOpen(s)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={paths.api(`screenshots/${s.id}`)} alt={`Capture de ${s.playerName}`} loading="lazy" />
              <div className="shot-meta">
                <span className="tag" data-tone={tone}>{label}{s.score !== null && s.verdict !== "clean" ? ` · ${s.score} %` : ""}</span>
                <b>{s.playerName}</b>
                <small className="muted">{reasonLabel(s.reason)} · {formatDateTime(s.createdAt)}</small>
              </div>
            </button>
          );
        })}
      </div>

      {open && createPortal(
        <div className="veil" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="dialog shot-dialog">
            <button className="ibtn" style={{ position: "absolute", top: 14, right: 14 }} title="Fermer" onClick={() => setOpen(null)}><X size={14} /></button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={paths.api(`screenshots/${open.id}`)} alt={`Capture de ${open.playerName}`} />
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
              <span className="tag" data-tone={VERDICTS[open.verdict][1]}>{VERDICTS[open.verdict][0]}{open.score !== null ? ` · confiance ${open.score} %` : ""}</span>
              <b>{open.playerId ? <Link href={paths.page(`/players/${open.playerId}`)}>{open.playerName}</Link> : open.playerName}</b>
              <span className="muted" style={{ fontSize: 12 }}>{reasonLabel(open.reason)} · {formatDateTime(open.createdAt)}</span>
            </div>
            {open.summary && <p style={{ margin: "10px 0 0" }}>{open.summary}</p>}
            <div className="actions">
              {canAnalyze && (
                <button className="btn" disabled={busy} onClick={async () => {
                  const res = await run("screenshot_analyze", { id: open.id }, "Capture analysée à nouveau");
                  if (res) setOpen({ ...open, verdict: res.verdict as Screenshot["verdict"], score: (res.score as number | null) ?? null, summary: (res.summary as string | null) ?? null });
                }}><Sparkles size={15} />Réanalyser</button>
              )}
              {canBan && open.playerId && <button className="btn danger" disabled={banning} onClick={() => ban(open.playerId as number, open.playerName)}><Ban size={15} />Bannir</button>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
