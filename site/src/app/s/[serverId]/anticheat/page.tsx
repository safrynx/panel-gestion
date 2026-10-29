import Link from "next/link";
import { can, requirePermissionPage } from "@/lib/auth";
import { getSecuritySettings, listDetections, listScreenshots, securityOverview } from "@/lib/security";
import { DETECTIONS } from "@/lib/security-config";
import { visionConfigured } from "@/lib/vision";
import Shell, { PageHead } from "@/app/shell";
import { AutoRefresh } from "../security-actions";
import AnticheatSettingsForm from "./settings-form";
import DetectionList from "./detection-list";
import ScreenshotGrid from "./screenshot-grid";

export const dynamic = "force-dynamic";

const TABS = [["detections", "Détections"], ["screenshots", "Captures IA"], ["settings", "Réglages"]] as const;
type Tab = (typeof TABS)[number][0];

export default async function AnticheatPage({ params, searchParams }: { params: Promise<{ serverId: string }>; searchParams: Promise<{ tab?: string; kind?: string; status?: string; verdict?: string }> }) {
  const { user, server } = await requirePermissionPage((await params).serverId, "view_security");
  const sp = await searchParams;
  const canConfig = can(user, "security_config");
  const tab: Tab = TABS.some(([k]) => k === sp.tab) && (sp.tab !== "settings" || canConfig) ? (sp.tab as Tab) : "detections";
  const base = `/s/${server.id}/anticheat`;
  const kind = DETECTIONS.some((d) => d.key === sp.kind) ? sp.kind : undefined;
  const status = ["open", "confirmed", "dismissed"].includes(sp.status ?? "") ? sp.status : undefined;
  const verdict = ["cheat", "suspicious", "clean", "error", "skipped", "pending"].includes(sp.verdict ?? "") ? sp.verdict : undefined;

  const [overview, settings, detections, shots] = await Promise.all([
    securityOverview(server.id),
    getSecuritySettings(server.id),
    tab === "detections" ? listDetections(server.id, { kind, status, limit: 150 }) : Promise.resolve([]),
    tab === "screenshots" ? listScreenshots(server.id, { verdict, limit: 60 }) : Promise.resolve([])
  ]);

  const stats: [string, string, string][] = [
    ["Détections · 24 h", String(overview.detections24h), settings.anticheat.enabled ? "anticheat actif" : "anticheat désactivé"],
    ["Bans actifs", String(overview.activeBans), "appliqués à la connexion"],
    ["Captures suspectes · 24 h", String(overview.flaggedShots24h), visionConfigured() ? "analysées par l'IA" : "IA non configurée"],
    ["Incidents Discord · 24 h", String(overview.incidents24h), settings.antiraid.enabled ? "anti-raid actif" : "anti-raid désactivé"]
  ];
  const tabLink = (t: Tab) => `${base}${t === "detections" ? "" : `?tab=${t}`}`;

  return (
    <Shell user={user} server={server} active="anticheat">
      <PageHead kicker={server.name} title="Anticheat">
        Détections côté serveur, protection des événements et captures d&apos;écran analysées par l&apos;IA. Le staff avec l&apos;ACE <code>fiverax.bypass</code> n&apos;est jamais sanctionné.
      </PageHead>
      {tab !== "settings" && <AutoRefresh everyMs={10_000} />}
      {!settings.anticheat.enabled && <div className="banner"><b>L&apos;anticheat est désactivé.</b> L&apos;agent ne fait plus aucune détection (les bans restent appliqués).</div>}

      <div className="strip">
        {stats.map(([label, value, hint], i) => (
          <div key={label} className={`rise rise-${i + 1}`}><div className="eyebrow">{label}</div><div className="num" style={{ fontSize: 24 }}>{value}</div><small>{hint}</small></div>
        ))}
      </div>

      <div className="pill-tabs rise rise-1" style={{ marginBottom: 22 }}>
        {TABS.filter(([k]) => k !== "settings" || canConfig).map(([k, label]) => <Link key={k} href={tabLink(k)} data-on={tab === k}>{label}</Link>)}
      </div>

      {tab === "detections" && (
        <>
          <form className="filters" action={base}>
            <select name="kind" defaultValue={kind ?? ""} className="field">
              <option value="">Toutes les détections</option>
              {DETECTIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <select name="status" defaultValue={status ?? ""} className="field">
              <option value="">Tous les statuts</option>
              <option value="open">À examiner</option>
              <option value="confirmed">Confirmées</option>
              <option value="dismissed">Faux positifs</option>
            </select>
            <button className="btn primary">Filtrer</button>
            {(kind || status) && <Link href={base} className="linkish">Réinitialiser</Link>}
          </form>
          <DetectionList detections={detections} canBan={can(user, "ban")} />
        </>
      )}

      {tab === "screenshots" && (
        <>
          <div className="pill-tabs" style={{ marginBottom: 18 }}>
            {[["", "Toutes"], ["cheat", "Cheat"], ["suspicious", "Suspectes"], ["clean", "Propres"]].map(([v, label]) => (
              <Link key={v} href={`${base}?tab=screenshots${v ? `&verdict=${v}` : ""}`} data-on={(verdict ?? "") === v}>{label}</Link>
            ))}
          </div>
          {!visionConfigured() && <div className="banner"><b>Analyse IA non configurée.</b> Ajoute <code>AI_API_KEY</code> (et éventuellement <code>AI_VISION_MODEL</code>) aux variables d&apos;environnement du site : les captures sont gardées mais pas analysées.</div>}
          <ScreenshotGrid shots={shots} canBan={can(user, "ban")} canAnalyze={can(user, "screenshot")} />
        </>
      )}

      {tab === "settings" && canConfig && <AnticheatSettingsForm initial={settings.anticheat} />}
    </Shell>
  );
}
