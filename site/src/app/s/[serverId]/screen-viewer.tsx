"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Maximize2, X } from "lucide-react";
import { describeApiError, useServerPaths, useUI } from "@/app/ui";
import { useCommand } from "./use-command";

type Props = { target: number; name: string; onClose: () => void };

/**
 * A player's screen, live: the agent streams screenshots while this window is open (about one per second, through
 * screenshot-basic). The agent stops by itself once nobody has read a frame for 15 s.
 */
export default function ScreenViewer({ target, name, onClose }: Props) {
  const { serverId } = useServerPaths();
  const { toast } = useUI();
  const { send, busy } = useCommand();
  const [src, setSrc] = useState<string | null>(null);
  const [frameAt, setFrameAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    let url: string | null = null;
    const api = `/api/s/${serverId}/screen/${target}`;
    // Ask the agent to stream; asked again whenever the image stops moving (agent restarted, frame lost…).
    let requestedAt = 0;
    let lastFrame = 0;
    const request = async (): Promise<boolean> => {
      requestedAt = Date.now();
      const res = await fetch(api, { method: "POST" });
      if (res.ok) return true;
      const data = await res.json().catch(() => ({}));
      if (!stopped) setError(describeApiError(data, res.status));
      return false;
    };
    (async () => {
      if (!(await request())) return;
      while (!stopped) {
        const frame = await fetch(`${api}?t=${Date.now()}`, { cache: "no-store" }).catch(() => null);
        if (frame?.status === 200) {
          const at = new Date(frame.headers.get("X-Frame-At") ?? Date.now()).getTime();
          const blob = await frame.blob();
          if (at !== lastFrame) {
            lastFrame = at;
            const next = URL.createObjectURL(blob);
            if (url) URL.revokeObjectURL(url);
            url = next;
            if (!stopped) {
              setSrc(next);
              setFrameAt(at);
            }
          }
        } else {
          await frame?.body?.cancel().catch(() => undefined);
        }
        if (Date.now() - Math.max(lastFrame, requestedAt) > 6000 && Date.now() - requestedAt > 8000 && !stopped) {
          if (!(await request())) return;
          setError(null);
        }
        setNow(Date.now());
        await new Promise((r) => setTimeout(r, document.visibilityState === "visible" ? 700 : 3000));
      }
    })();
    return () => {
      stopped = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [serverId, target]);

  const age = frameAt ? Math.max(0, Math.round((now - frameAt) / 1000)) : null;
  const status = error ?? (src ? (age !== null && age > 8 ? `Image figée depuis ${age} s (joueur parti ou screenshot-basic bloqué ?)` : `En direct · il y a ${age ?? 0} s`) : "Connexion à l'écran du joueur…");

  return createPortal(
    <div className="veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog shot-dialog" ref={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Écran de {name} <span className="muted">#{target}</span></h3>
            <small className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className={`dot ${src && !error && (age ?? 99) <= 8 ? "on" : ""}`} />{status}
            </small>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="ibtn" title="Plein écran" onClick={() => box.current?.requestFullscreen?.().catch(() => toast("Plein écran refusé par le navigateur", "error"))}><Maximize2 size={14} /></button>
            <button className="ibtn" title="Fermer" onClick={onClose}><X size={14} /></button>
          </div>
        </div>
        <div className="screen-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt={`Écran de ${name}`} /> : <div className="screen-wait">{error ?? "En attente de la première image…"}</div>}
        </div>
        <div className="actions">
          <span className="muted" style={{ fontSize: 12, marginRight: "auto" }}>Le flux s&apos;arrête quelques secondes après la fermeture de cette fenêtre. Rien n&apos;est enregistré.</span>
          <button className="btn" disabled={busy || Boolean(error)} onClick={() => send("screenshot", { target }, "Capture gardée et envoyée à l'analyse IA")}><Camera size={15} />Garder une capture</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
