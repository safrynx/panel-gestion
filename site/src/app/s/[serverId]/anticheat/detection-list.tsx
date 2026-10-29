"use client";
import Link from "next/link";
import { Ban, Check, Image as ImageIcon, RotateCcw, X } from "lucide-react";
import type { Detection } from "@/lib/security";
import { detectionLabel } from "@/lib/security-config";
import { formatDateTime } from "@/lib/format";
import { useServerPaths } from "@/app/ui";
import { useBanDialog, useSecurityAction } from "../security-actions";

const ACTION_TONE: Record<string, [string, string]> = {
  log: ["Signalé", "info"],
  kick: ["Kick", "warn"],
  ban: ["Ban", "danger"]
};
const STATUS: Record<Detection["status"], [string, string]> = {
  open: ["À examiner", "neutral"],
  confirmed: ["Confirmée", "danger"],
  dismissed: ["Faux positif", "up"]
};

/** Readable details of a detection ("speed: 42.3 · limit: 25"). */
function detailsText(details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k} : ${typeof v === "number" ? Math.round(v * 10) / 10 : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 220);
}

export default function DetectionList({ detections, canBan }: { detections: Detection[]; canBan: boolean }) {
  const paths = useServerPaths();
  const { run, busy } = useSecurityAction();
  const { ban, busy: banning } = useBanDialog();

  if (detections.length === 0) return <p className="muted" style={{ padding: "30px 0" }}>Aucune détection. Elles apparaissent ici en direct dès que l&apos;agent remonte quelque chose.</p>;

  return (
    <div className="tbl-wrap rise rise-2">
      <table className="tbl" style={{ minWidth: 900 }}>
        <thead>
          <tr><th>Quand</th><th>Joueur</th><th>Détection</th><th>Sanction</th><th>Détails</th><th>Statut</th><th style={{ textAlign: "right" }}>Actions</th></tr>
        </thead>
        <tbody>
          {detections.map((d, i) => {
            const [actionLabel, actionTone] = ACTION_TONE[d.action] ?? [d.action, "neutral"];
            const [statusLabel, statusTone] = STATUS[d.status];
            return (
              <tr key={d.id} className="row-in" style={{ ["--i" as string]: Math.min(i, 14) }}>
                <td className="num-cell muted" style={{ whiteSpace: "nowrap" }}>{formatDateTime(d.at)}</td>
                <td style={{ fontWeight: 600 }}>{d.playerId ? <Link href={paths.page(`/players/${d.playerId}`)}>{d.playerName}</Link> : d.playerName}</td>
                <td>{detectionLabel(d.kind)}</td>
                <td><span className="tag" data-tone={actionTone}>{actionLabel}</span></td>
                <td className="muted" style={{ fontSize: 12, maxWidth: 280 }}>{detailsText(d.details) || "—"}</td>
                <td><span className="tag" data-tone={statusTone}>{statusLabel}</span></td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    {d.screenshotId && (
                      <a className="ibtn" title="Voir la capture" href={paths.api(`screenshots/${d.screenshotId}`)} target="_blank" rel="noreferrer"><ImageIcon size={14} /></a>
                    )}
                    {d.status === "open" ? (
                      <>
                        <button className="ibtn" title="Confirmer (triche)" disabled={busy} onClick={() => run("detection_review", { id: d.id, status: "confirmed" }, "Détection confirmée")}><Check size={14} /></button>
                        <button className="ibtn" title="Faux positif" disabled={busy} onClick={() => run("detection_review", { id: d.id, status: "dismissed" }, "Marquée comme faux positif")}><X size={14} /></button>
                      </>
                    ) : (
                      <button className="ibtn" title="Remettre à examiner" disabled={busy} onClick={() => run("detection_review", { id: d.id, status: "open" })}><RotateCcw size={14} /></button>
                    )}
                    {canBan && d.playerId && d.action !== "ban" && (
                      <button className="ibtn bad" title="Bannir" disabled={banning} onClick={() => ban(d.playerId as number, d.playerName)}><Ban size={14} /></button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
