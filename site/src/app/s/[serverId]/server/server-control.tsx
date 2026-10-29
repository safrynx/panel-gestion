"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, RefreshCw, RotateCw, Square } from "lucide-react";
import type { ConsoleLine, LiveState } from "@/lib/agent";
import { useServerPaths } from "@/app/ui";
import { useCommand, usePolling } from "../use-command";
import { AgentBanner, ServerStatus, useNow } from "../live/live-view";

type Props = { initial: LiveState; initialLines: ConsoleLine[]; canResources: boolean; canConsole: boolean; settingsHref: string | null };

const STATE_LABEL: Record<string, [string, string]> = {
  started: ["Démarrée", "up"],
  starting: ["Démarrage…", "warn"],
  stopping: ["Arrêt…", "warn"],
  stopped: ["Arrêtée", "neutral"],
  uninitialized: ["Arrêtée", "neutral"]
};
const FILTERS = [["all", "Toutes"], ["started", "Démarrées"], ["stopped", "Arrêtées"]] as const;

export default function ServerControl({ initial, initialLines, canResources, canConsole, settingsHref }: Props) {
  const paths = useServerPaths();
  const { data: live, refresh } = usePolling<LiveState>(paths.api("live"), initial, 5000);
  const now = useNow(live);

  return (
    <>
      <AgentBanner live={live} settingsHref={settingsHref} />
      <ServerStatus live={live} now={now} />
      <div className={`cols ${canResources && canConsole ? "even" : ""}`}>
        {canResources && <Resources live={live} onChange={refresh} />}
        {canConsole && <Console initialLines={initialLines} online={live.online} />}
      </div>
    </>
  );
}

function Resources({ live, onChange }: { live: LiveState; onChange: () => void }) {
  const { send, busy } = useCommand();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return live.resources.filter(
      (r) => (!needle || r.name.toLowerCase().includes(needle)) && (filter === "all" || (filter === "started" ? r.state === "started" : r.state !== "started"))
    );
  }, [live.resources, query, filter]);
  const started = live.resources.filter((r) => r.state === "started").length;

  async function act(action: "start" | "stop" | "restart", name: string) {
    if (await send("resource", { action, name }, name)) onChange();
  }

  return (
    <section className="rise rise-2">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
        <h2 className="h2">Ressources <span className="muted" style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>· {started} / {live.resources.length} démarrées</span></h2>
        <button className="btn sm" disabled={busy || !live.online} onClick={async () => (await send("refresh", {}, "Liste des ressources rechargée")) && onChange()}>
          <RefreshCw size={13} />Recharger la liste
        </button>
      </header>
      <div className="filters" style={{ marginTop: 14 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une ressource" className="field" style={{ flex: 1 }} />
        <div className="pill-tabs">
          {FILTERS.map(([key, label]) => <a key={key} href="#" data-on={filter === key} onClick={(e) => { e.preventDefault(); setFilter(key); }}>{label}</a>)}
        </div>
      </div>
      {live.resources.length === 0 && <p className="muted">Aucune ressource reçue de l&apos;agent.</p>}
      <div style={{ maxHeight: 560, overflowY: "auto" }}>
        {visible.map((r) => {
          const [label, tone] = STATE_LABEL[r.state] ?? [r.state, "neutral"];
          const self = r.name === "fiverax_agent";
          return (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: "1px solid var(--line)" }}>
              <code style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</code>
              <span className="tag" data-tone={tone}>{label}</span>
              <span style={{ display: "inline-flex", gap: 6 }}>
                {r.state === "started" ? (
                  <>
                    <button className="ibtn" title="Redémarrer" disabled={busy || self || !live.online} onClick={() => act("restart", r.name)}><RotateCw size={13} /></button>
                    <button className="ibtn bad" title="Arrêter" disabled={busy || self || !live.online} onClick={() => act("stop", r.name)}><Square size={12} /></button>
                  </>
                ) : (
                  <button className="ibtn" title="Démarrer" disabled={busy || !live.online} onClick={() => act("start", r.name)}><Play size={13} /></button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Console({ initialLines, online }: { initialLines: ConsoleLine[]; online: boolean }) {
  const paths = useServerPaths();
  const { send, busy } = useCommand();
  const [lines, setLines] = useState(initialLines);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const lastId = useRef(initialLines.at(-1)?.id ?? 0);
  const url = paths.api("console");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (document.visibilityState === "visible") {
        const data = await fetch(`${url}?after=${lastId.current}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const fresh = (data?.lines ?? []) as ConsoleLine[];
        if (!stopped && fresh.length) {
          lastId.current = fresh[fresh.length - 1].id;
          setLines((old) => [...old, ...fresh].slice(-1000));
        }
      }
      if (!stopped) timer = setTimeout(load, 2000);
    };
    timer = setTimeout(load, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [url]);

  // Follow the output, unless the user scrolled up to read.
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [lines]);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = command.trim();
    if (!value) return;
    setHistory((h) => [value, ...h.filter((x) => x !== value)].slice(0, 50));
    setCursor(-1);
    setCommand("");
    await send("console", { command: value }, `Commande exécutée : ${value}`);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const next = e.key === "ArrowUp" ? Math.min(history.length - 1, cursor + 1) : Math.max(-1, cursor - 1);
    setCursor(next);
    setCommand(next === -1 ? "" : history[next]);
  }

  return (
    <section className="rise rise-3">
      <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
        <h2 className="h2">Console</h2>
        <p className="muted" style={{ margin: "6px 0 0" }}>Sortie du serveur en direct. Chaque commande est enregistrée dans les logs.</p>
      </header>
      <div ref={box} className="console" aria-live="polite">
        {lines.length === 0 && <div className="muted">Rien pour l&apos;instant : les lignes arrivent dès que l&apos;agent tourne.</div>}
        {lines.map((l) => (
          <div key={l.id}>
            {l.channel && <span className="console-ch">[{l.channel}]</span>} {l.message}
          </div>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <span className="console-prompt">&gt;</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKey}
          placeholder={online ? "Ex. : status, say Bonjour, restart ma_ressource" : "Serveur hors ligne"}
          disabled={!online}
          className="field"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn primary" disabled={busy || !online || !command.trim()}>Envoyer</button>
      </form>
    </section>
  );
}
