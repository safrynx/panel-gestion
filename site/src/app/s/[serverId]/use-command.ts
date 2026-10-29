"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeApiError, useServerPaths, useUI } from "@/app/ui";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send an action to the FiveM agent and report what became of it: the agent picks it up on its next call
 * (a few seconds), so the toast comes once it answered, or says it never did.
 */
export function useCommand() {
  const { toast } = useUI();
  const paths = useServerPaths();
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (kind: string, payload: Record<string, unknown>, success: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch(paths.api(`command?kind=${kind}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(describeApiError(data, res.status), "error");
          return false;
        }
        for (let i = 0; i < 25; i++) {
          await wait(i < 5 ? 800 : 1500);
          const status = await fetch(paths.api(`command?id=${data.id}`)).then((r) => r.json()).catch(() => null);
          if (!status) continue;
          if (status.status === "done") {
            toast(status.result && kind === "resource" ? status.result : success, "ok");
            return true;
          }
          if (status.status === "failed") {
            toast(`Refusé par le serveur : ${status.result ?? "erreur inconnue"}`, "error");
            return false;
          }
          if (status.status === "expired" || status.status === "lost") {
            toast("Le serveur FiveM n'a pas répondu : l'action n'a peut-être pas été exécutée.", "error");
            return false;
          }
        }
        toast("Action envoyée, toujours en attente du serveur FiveM.", "info");
        return true;
      } catch {
        toast("Impossible de joindre le panel.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [paths, toast]
  );

  return { send, busy };
}

/** Poll a JSON endpoint while the page is visible (an empty url never polls). */
export function usePolling<T>(url: string, initial: T, everyMs: number): { data: T; refresh: () => void } {
  const [data, setData] = useState<T>(initial);
  const tick = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      clearTimeout(timer);
      if (url && document.visibilityState === "visible") {
        const next = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!stopped && next) setData(next as T);
      }
      if (!stopped) timer = setTimeout(load, everyMs);
    };
    tick.current = load;
    timer = setTimeout(load, everyMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [url, everyMs]);

  return { data, refresh: useCallback(() => tick.current(), []) };
}
