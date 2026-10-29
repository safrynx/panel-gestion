"use client";
import { useState } from "react";
import { AC_ACTION_LABELS, AC_ACTIONS, DETECTIONS, type AcAction, type AnticheatSettings } from "@/lib/security-config";
import { useSecurityAction } from "../security-actions";

const lines = (text: string) => text.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);

const LIMITS: [keyof AnticheatSettings["limits"], string, string][] = [
  ["eventsPer10s", "Événements protégés", "appels / 10 s par joueur"],
  ["entitiesPer10s", "Entités créées", "par joueur / 10 s"],
  ["explosionsPer10s", "Explosions", "par joueur / 10 s"],
  ["ptfxPer10s", "Particules", "par joueur / 10 s"],
  ["projectilesPer10s", "Projectiles", "par joueur / 10 s"],
  ["footSpeed", "Vitesse max à pied", "m/s"],
  ["teleportDistance", "Saut de téléportation", "mètres en 2 s"],
  ["damageDistance", "Distance de tir max", "mètres"]
];

const LISTS: [keyof Pick<AnticheatSettings, "honeypotEvents" | "protectedEvents" | "blacklistedWeapons" | "blacklistedModels" | "blacklistedPeds">, string, string][] = [
  ["honeypotEvents", "Événements pièges", "Déclencher l'un d'eux = détection « Événement piège ». Ignoré si une ressource du même nom tourne (esx_truckerjob:pay quand esx_truckerjob est démarrée)."],
  ["protectedEvents", "Événements protégés (anti-spam)", "Tes événements sensibles (paie, inventaire…) : au-delà de la limite par 10 s, détection « Spam d'événements »."],
  ["blacklistedWeapons", "Armes interdites", "Noms GTA (WEAPON_RAILGUN…)."],
  ["blacklistedModels", "Véhicules et objets interdits", "Noms de modèles (hydra, prop_windmill_01…). Leur création est bloquée."],
  ["blacklistedPeds", "Skins interdits", "Modèles de ped (a_c_chimp…)."]
];

const groups = [...new Set(DETECTIONS.map((d) => d.group))];

export default function AnticheatSettingsForm({ initial }: { initial: AnticheatSettings }) {
  const { run, busy } = useSecurityAction();
  const [s, setS] = useState(initial);
  const [texts, setTexts] = useState(() => Object.fromEntries(LISTS.map(([k]) => [k, initial[k].join("\n")])) as Record<(typeof LISTS)[number][0], string>);
  const [explosions, setExplosions] = useState(initial.blockedExplosions.join(", "));

  const setDetection = (key: string, patch: Partial<{ action: AcAction; screenshot: boolean }>) =>
    setS((prev) => ({ ...prev, detections: { ...prev.detections, [key]: { ...prev.detections[key as keyof typeof prev.detections], ...patch } } }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value: AnticheatSettings = {
      ...s,
      ...Object.fromEntries(LISTS.map(([k]) => [k, lines(texts[k])])),
      blockedExplosions: lines(explosions).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 100)
    };
    await run("anticheat_config", value, "Réglages enregistrés : l'agent les applique à son prochain appel");
  }

  return (
    <form onSubmit={save} className="rise rise-2" style={{ display: "grid", gap: 34 }}>
      <section>
        <header className="panel-head"><h2 className="h2">Général</h2></header>
        <div style={{ display: "grid", gap: 14, marginTop: 16, maxWidth: 720 }}>
          <label className="check" style={{ width: "fit-content" }}>
            <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />Anticheat actif
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Message affiché au joueur banni</span>
            <input className="field" maxLength={300} required value={s.banMessage} onChange={(e) => setS({ ...s, banMessage: e.target.value })} />
          </label>
        </div>
      </section>

      <section>
        <header className="panel-head">
          <h2 className="h2">Détections</h2>
          <p className="muted">Sanction de chaque détection. « Signaler » enregistre sans sanctionner : idéal pour vérifier les faux positifs avant de passer en kick ou ban. La capture est analysée par l&apos;IA.</p>
        </header>
        {groups.map((group) => (
          <div key={group} style={{ marginTop: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{group}</div>
            <div className="tbl-wrap">
              <table className="tbl" style={{ minWidth: 720 }}>
                <tbody>
                  {DETECTIONS.filter((d) => d.group === group).map((d) => {
                    const cur = s.detections[d.key];
                    return (
                      <tr key={d.key}>
                        <td style={{ width: "48%" }}><b>{d.label}</b><div className="muted" style={{ fontSize: 12 }}>{d.hint}</div></td>
                        <td>
                          <select className="field" value={cur.action} onChange={(e) => setDetection(d.key, { action: e.target.value as AcAction })} style={{ width: 150 }}>
                            {AC_ACTIONS.map((a) => <option key={a} value={a}>{AC_ACTION_LABELS[a]}</option>)}
                          </select>
                        </td>
                        <td>
                          {d.key !== "ai_screenshot" && (
                            <label className="check" style={{ padding: "6px 10px" }}>
                              <input type="checkbox" checked={cur.screenshot} disabled={cur.action === "off"} onChange={(e) => setDetection(d.key, { screenshot: e.target.checked })} />Capture
                            </label>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      <section>
        <header className="panel-head"><h2 className="h2">Analyse IA des captures</h2><p className="muted">Nécessite <code>screenshot-basic</code> sur le serveur FiveM et une clé IA sur le site.</p></header>
        <div style={{ display: "grid", gap: 14, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", maxWidth: 900 }}>
          <label className="check" style={{ alignSelf: "end", width: "fit-content" }}>
            <input type="checkbox" checked={s.ai.enabled} onChange={(e) => setS({ ...s, ai: { ...s.ai, enabled: e.target.checked } })} />Analyser chaque capture
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Capture d&apos;un joueur au hasard toutes les… (min, 0 = jamais)</span>
            <input type="number" min={0} max={1440} className="field" value={s.ai.randomEveryMinutes} onChange={(e) => setS({ ...s, ai: { ...s.ai, randomEveryMinutes: Number(e.target.value) } })} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Ban auto si l&apos;IA est sûre à… % (0 = jamais)</span>
            <input type="number" min={0} max={100} className="field" value={s.ai.autoBanScore} onChange={(e) => setS({ ...s, ai: { ...s.ai, autoBanScore: Number(e.target.value) } })} />
          </label>
        </div>
        {s.ai.autoBanScore > 0 && s.ai.autoBanScore < 90 && <div className="banner" style={{ marginTop: 14 }}>Un seuil sous 90 % risque de bannir des joueurs innocents : l&apos;IA peut se tromper sur un HUD ou un menu de ton serveur.</div>}
      </section>

      <section>
        <header className="panel-head"><h2 className="h2">Limites</h2></header>
        <div style={{ display: "grid", gap: 14, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {LIMITS.map(([key, label, unit]) => (
            <label key={key} style={{ display: "grid", gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>{label} <span style={{ opacity: 0.7 }}>({unit})</span></span>
              <input type="number" className="field" value={s.limits[key]} onChange={(e) => setS({ ...s, limits: { ...s.limits, [key]: Number(e.target.value) } })} />
            </label>
          ))}
        </div>
      </section>

      <section>
        <header className="panel-head"><h2 className="h2">Listes</h2><p className="muted">Un élément par ligne.</p></header>
        <div style={{ display: "grid", gap: 18, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          {LISTS.map(([key, label, hint]) => (
            <label key={key} style={{ display: "grid", gap: 6, alignContent: "start" }}>
              <span><b>{label}</b> <span className="muted" style={{ fontSize: 12 }}>· {lines(texts[key]).length}</span></span>
              <span className="muted" style={{ fontSize: 12 }}>{hint}</span>
              <textarea className="field" rows={7} value={texts[key]} onChange={(e) => setTexts({ ...texts, [key]: e.target.value })} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} />
            </label>
          ))}
          <label style={{ display: "grid", gap: 6, alignContent: "start" }}>
            <b>Types d&apos;explosion bloqués</b>
            <span className="muted" style={{ fontSize: 12 }}>Numéros GTA séparés par des virgules (vide : seules les explosions invisibles sont bloquées).</span>
            <input className="field" value={explosions} onChange={(e) => setExplosions(e.target.value)} placeholder="ex. 7, 29, 37" />
          </label>
        </div>
      </section>

      <div className="save-bar">
        <button className="btn primary" disabled={busy}>Enregistrer les réglages</button>
        <button type="button" className="btn" disabled={busy} onClick={() => { setS(initial); setTexts(Object.fromEntries(LISTS.map(([k]) => [k, initial[k].join("\n")])) as typeof texts); setExplosions(initial.blockedExplosions.join(", ")); }}>Annuler les modifications</button>
      </div>
    </form>
  );
}
