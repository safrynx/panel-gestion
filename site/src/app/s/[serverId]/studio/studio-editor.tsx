"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FilePlus2, History, Info, Pencil, Rocket, Save, Sparkles, Trash2, Wand2, X } from "lucide-react";
import type { Creation, CreationData } from "@/lib/studio";
import { checkFiles, cleanMap, FRAMEWORKS, isFilePath, KIND_META, mapFiles, type MapData, type StudioFile } from "@/lib/studio-shared";
import { formatDateTime } from "@/lib/format";
import { describeApiError, useServerPaths, useUI } from "@/app/ui";
import { useCommand } from "../use-command";
import CodeEditor from "./code-editor";
import DeployTag from "./deploy-tag";
import MapEditor from "./map-editor";
import UIPreview from "./ui-preview";

type Props = {
  initial: Creation;
  canDeploy: boolean;
  online: boolean;
  aiReady: boolean;
  players: { id: number; name: string; pos: [number, number, number] }[];
};

const SUGGESTIONS = {
  ui: ["Ajoute une animation d'ouverture", "Rends-la plus compacte", "Passe les couleurs en bleu nuit", "Ajoute un son au clic"],
  script: ["Mets tous les réglages dans config.lua", "Renforce les vérifications côté serveur", "Ajoute des notifications", "Ajoute une commande admin"],
  map: ["Ajoute de l'éclairage", "Ajoute des barrières tout autour", "Aligne la scène sur un axe est-ouest", "Rends la scène deux fois plus grande"]
} as const;

const SOURCE_LABEL = { ai: "IA", manual: "Modification", restore: "Restauration", create: "Création" } as const;

export default function StudioEditor({ initial, canDeploy, online, aiReady, players }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const paths = useServerPaths();
  const { ask, toast } = useUI();
  const { follow } = useCommand();
  const [creation, setCreation] = useState(initial);
  const [files, setFiles] = useState<StudioFile[]>(initial.files);
  const [data, setData] = useState<CreationData>(initial.data);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<string>(initial.kind === "ui" ? "preview" : initial.kind === "map" ? "map" : initial.files[0] ? `file:${initial.files[0].path}` : "checks");
  const [instruction, setInstruction] = useState("");
  const [generating, setGenerating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const chatEnd = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const kind = creation.kind;
  const meta = KIND_META[kind];
  const api = paths.api(`studio/${creation.id}`);
  const map: MapData = useMemo(() => cleanMap(data.map), [data.map]);
  const shown = useMemo(() => (kind === "map" ? mapFiles(creation.name, map) : files), [kind, creation.name, map, files]);
  const checks = useMemo(() => checkFiles(shown), [shown]);
  const errors = checks.filter((c) => c.level === "error").length;
  const html = shown.find((f) => f.path.endsWith("index.html"))?.content ?? shown.find((f) => f.path.endsWith(".html"))?.content ?? null;

  const load = useCallback((next: Creation) => {
    setCreation(next);
    setFiles(next.files);
    setData(next.data);
    setDirty(false);
  }, []);

  // Unsaved work: warn before leaving the page.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  useEffect(() => {
    if (generating === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [generating]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [creation.versions.length, generating]);

  async function call(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
    if (!res) {
      toast("Impossible de joindre le panel.", "error");
      return null;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(describeApiError(body, res.status), "error");
      return null;
    }
    return body;
  }

  async function save(summary?: string): Promise<boolean> {
    setBusy(true);
    try {
      const body = await call(api, {
        method: "PUT",
        body: JSON.stringify({ ...(kind === "map" ? {} : { files }), data: kind === "map" ? { map } : data, summary })
      });
      if (!body) return false;
      load(body as unknown as Creation);
      return true;
    } finally {
      setBusy(false);
    }
  }

  const generate = useCallback(async (text: string) => {
    const value = text.trim();
    if (value.length < 3) return;
    if (dirty && !(await save("Avant la demande à l'IA"))) return;
    setGenerating(Date.now());
    setNow(Date.now());
    setInstruction("");
    try {
      const body = await call(`${api}?action=generate`, { method: "POST", body: JSON.stringify({ instruction: value }) });
      if (!body) {
        setInstruction(value);
        return;
      }
      const next = body.creation as Creation;
      load(next);
      if (kind !== "map" && !tab.startsWith("file:") && tab !== "preview" && tab !== "checks") setTab(kind === "ui" ? "preview" : `file:${next.files[0]?.path}`);
      toast(String(body.summary ?? "C'est fait."), "ok");
    } finally {
      setGenerating(null);
    }
  }, [api, dirty, files, data, map, kind, tab]);

  // Coming from "Créer avec l'IA": the description is sent right away, once.
  useEffect(() => {
    const first = search.get("ask");
    if (!first || started.current) return;
    started.current = true;
    router.replace(pathname);
    if (aiReady) void generate(first);
    else setInstruction(first);
  }, [search, router, pathname, aiReady, generate]);

  async function restore(versionId: number) {
    const ok = await ask({ title: "Revenir à cette version ?", message: "L'état actuel reste dans l'historique : tu pourras y revenir.", confirmLabel: "Restaurer" });
    if (!ok) return;
    const body = await call(`${api}?action=restore`, { method: "POST", body: JSON.stringify({ versionId }) });
    if (body) {
      load(body as unknown as Creation);
      toast("Version restaurée.", "ok");
    }
  }

  async function deploy() {
    if (errors > 0) {
      const ok = await ask({ title: "Déployer malgré les erreurs ?", message: `${errors} erreur(s) détectée(s) : la ressource risque de ne pas démarrer.`, confirmLabel: "Déployer quand même", danger: true });
      if (!ok) return;
    }
    if (dirty && !(await save())) return;
    setBusy(true);
    try {
      const body = await call(`${api}?action=deploy`, { method: "POST", body: "{}" });
      if (!body) return;
      await follow(Number(body.id), `${creation.resource} déployée`, true);
      const fresh = await fetch(api).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (fresh) load(fresh as Creation);
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    const answer = await ask({ title: "Renommer", input: { label: "Nom", initial: creation.name, required: true } });
    if (!answer || answer.value.length < 2) return;
    const body = await call(api, { method: "PUT", body: JSON.stringify({ name: answer.value.slice(0, 60), summary: `Renommée en « ${answer.value.slice(0, 60)} »` }) });
    if (body) load(body as unknown as Creation);
  }

  async function changeFramework(framework: string) {
    const body = await call(api, { method: "PUT", body: JSON.stringify({ framework, summary: `Framework : ${FRAMEWORKS.find((f) => f.key === framework)?.label}` }) });
    if (body) load(body as unknown as Creation);
  }

  async function remove() {
    const ok = await ask({ title: `Supprimer « ${creation.name} » ?`, message: "La création et tout son historique sont effacés du panel. Une ressource déjà déployée reste sur le serveur FiveM (arrête-la dans Ressources & console).", confirmLabel: "Supprimer", danger: true });
    if (!ok) return;
    if (await call(api, { method: "DELETE" })) router.push(paths.page(`/studio/${kind}`));
  }

  async function addFile() {
    const answer = await ask({ title: "Nouveau fichier", message: "Chemin dans la ressource (ex. shared/utils.lua, html/style.css).", input: { label: "Chemin", required: true } });
    if (!answer) return;
    const path = answer.value.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!isFilePath(path)) return toast("Chemin invalide (lettres, chiffres, _ - . / ; extension .lua .html .css .js .json .md…).", "error");
    if (files.some((f) => f.path === path)) return setTab(`file:${path}`);
    setFiles([...files, { path, content: "" }]);
    setDirty(true);
    setTab(`file:${path}`);
  }

  async function deleteFile(path: string) {
    const ok = await ask({ title: `Supprimer ${path} ?`, confirmLabel: "Supprimer", danger: true });
    if (!ok) return;
    setFiles(files.filter((f) => f.path !== path));
    setDirty(true);
    setTab(kind === "ui" ? "preview" : "checks");
  }

  const setFile = (path: string, content: string) => {
    setFiles((list) => list.map((f) => (f.path === path ? { ...f, content } : f)));
    setDirty(true);
  };
  const setMap = (next: MapData) => {
    setData({ ...data, map: next });
    setDirty(true);
  };

  const openFile = tab.startsWith("file:") ? shown.find((f) => f.path === tab.slice(5)) ?? null : null;
  const history = [...creation.versions].reverse();
  const elapsed = generating ? Math.max(0, Math.round((now - generating) / 1000)) : 0;

  return (
    <>
      <div className="studio-head rise">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{meta.title}</div>
          <h1 className="h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {creation.name}
            <button type="button" className="ibtn" title="Renommer" onClick={rename}><Pencil size={13} /></button>
          </h1>
          <div className="studio-meta">
            <code>{creation.resource}</code>
            <DeployTag deploy={creation.deploy} />
            {kind !== "map" && (
              <select className="field" style={{ width: "auto", padding: "3px 30px 3px 10px", fontSize: 12 }} value={creation.framework} onChange={(e) => changeFramework(e.target.value)} title="Framework visé par l'IA">
                {FRAMEWORKS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            )}
            {creation.deploy.status === "failed" && creation.deploy.message && <span className="muted" style={{ fontSize: 12 }}>{creation.deploy.message}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" disabled={!dirty || busy} onClick={() => save()}><Save size={14} />{dirty ? "Enregistrer" : "Enregistré"}</button>
          {dirty ? (
            <button className="btn" disabled title="Enregistre d'abord"><Download size={14} />.zip</button>
          ) : (
            <a className="btn" href={`${api}/zip`} download><Download size={14} />.zip</a>
          )}
          {canDeploy && (
            <button className="btn primary" disabled={busy || !online || shown.length === 0} title={online ? "Écrit la ressource sur le serveur FiveM et la (re)démarre" : "Serveur FiveM hors ligne"} onClick={deploy}>
              <Rocket size={14} />Déployer
            </button>
          )}
          <button className="ibtn bad" title="Supprimer la création" onClick={remove}><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="studio rise rise-1">
        <aside className="studio-chat">
          <div className="studio-thread">
            {history.map((v, i) => (
              <div key={v.id} className="studio-turn">
                {v.prompt && <div className="bubble me">{v.prompt}</div>}
                <div className="bubble" data-source={v.source}>
                  <div className="bubble-meta">
                    <span>{SOURCE_LABEL[v.source]} · {v.author ?? "?"} · {formatDateTime(v.createdAt)}</span>
                    {i < history.length - 1 && <button type="button" className="linkish" onClick={() => restore(v.id)}><History size={11} /> Restaurer</button>}
                  </div>
                  {v.summary ?? "—"}
                </div>
              </div>
            ))}
            {generating !== null && (
              <div className="bubble thinking"><Sparkles size={13} /> L&apos;IA {kind === "map" ? "compose la scène" : "écrit le code"}… {elapsed} s</div>
            )}
            <div ref={chatEnd} />
          </div>
          <form className="studio-ask" onSubmit={(e) => { e.preventDefault(); void generate(instruction); }}>
            <div className="studio-examples">
              {SUGGESTIONS[kind].map((s) => <button key={s} type="button" className="perm" onClick={() => setInstruction(s)}>{s}</button>)}
            </div>
            <textarea
              className="field"
              rows={3}
              maxLength={2000}
              disabled={!aiReady || generating !== null}
              placeholder={aiReady ? (creation.versions.length > 1 || shown.length ? "Que faut-il changer ?" : `Décris ${kind === "map" ? "la scène" : "ce que tu veux"}…`) : "IA non configurée (AI_API_KEY)"}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void generate(instruction); } }}
            />
            <button className="btn primary" disabled={!aiReady || generating !== null || instruction.trim().length < 3}><Wand2 size={14} />Envoyer à l&apos;IA</button>
          </form>
        </aside>

        <div className="studio-main">
          <div className="studio-tabs">
            {kind === "ui" && <button type="button" data-on={tab === "preview"} onClick={() => setTab("preview")}>Aperçu</button>}
            {kind === "map" && <button type="button" data-on={tab === "map"} onClick={() => setTab("map")}>Éditeur</button>}
            {shown.map((f) => (
              <button key={f.path} type="button" data-on={tab === `file:${f.path}`} onClick={() => setTab(`file:${f.path}`)}>{f.path}</button>
            ))}
            {kind !== "map" && <button type="button" title="Nouveau fichier" onClick={addFile}><FilePlus2 size={13} /></button>}
            <button type="button" data-on={tab === "checks"} onClick={() => setTab("checks")} data-tone={errors ? "bad" : checks.length ? "warn" : "ok"}>
              Vérifications{checks.length ? ` · ${checks.length}` : ""}
            </button>
          </div>

          {tab === "preview" && kind === "ui" && <UIPreview html={html} resource={creation.resource} tests={data.tests ?? []} />}
          {tab === "map" && kind === "map" && <MapEditor data={map} onChange={setMap} players={players} fitKey={creation.versions.find((v) => v.source !== "manual")?.id ?? 0} />}
          {openFile && (
            <>
              {kind === "map" && <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>Fichier généré à partir de l&apos;éditeur (lecture seule).</p>}
              {kind !== "map" && openFile.path !== "fxmanifest.lua" && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                  <button type="button" className="linkish" onClick={() => deleteFile(openFile.path)}><X size={11} /> Supprimer ce fichier</button>
                </div>
              )}
              <CodeEditor value={openFile.content} readOnly={kind === "map"} onChange={(v) => setFile(openFile.path, v)} />
            </>
          )}
          {tab === "checks" && (
            <div className="studio-checks">
              {checks.length === 0 && <p><CheckCircle2 size={15} style={{ color: "var(--ok)", verticalAlign: "-3px" }} /> Aucun problème détecté.</p>}
              {checks.map((c, i) => (
                <div key={i} className="studio-check" data-level={c.level}>
                  {c.level === "info" ? <Info size={14} /> : <AlertTriangle size={14} />}
                  <div>{c.file && <code>{c.file}</code>} {c.message}</div>
                </div>
              ))}
              {checks.some((c) => c.level !== "info") && aiReady && kind !== "map" && (
                <button className="btn" disabled={generating !== null} onClick={() => generate(`Corrige ces problèmes :\n${checks.filter((c) => c.level !== "info").map((c) => `- ${c.file ?? "ressource"} : ${c.message}`).join("\n")}`)}>
                  <Wand2 size={14} />Corriger avec l&apos;IA
                </button>
              )}
              <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
                Vérifications rapides (fichiers manquants, blocs Lua non fermés, appels risqués) : elles ne remplacent pas un test en jeu.
                {kind === "ui" && " L'onglet Aperçu affiche aussi les erreurs JavaScript de la page."}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
