"use client";
import { useState } from "react";
import { PUNISHMENT_LABELS, PUNISHMENTS, RAID_RULES, type AntiraidSettings } from "@/lib/security-config";
import { useSecurityAction } from "../security-actions";

const ids = (text: string) => [...new Set(text.split(/[\s,]+/).map((t) => t.trim()).filter((t) => /^\d{17,20}$/.test(t)))];

export default function AntiraidSettingsForm({ initial }: { initial: AntiraidSettings }) {
  const { run, busy } = useSecurityAction();
  const [s, setS] = useState(initial);
  const [trusted, setTrusted] = useState(initial.trusted.join("\n"));

  const setRule = (key: string, patch: Partial<AntiraidSettings["rules"][keyof AntiraidSettings["rules"]]>) =>
    setS((prev) => ({ ...prev, rules: { ...prev.rules, [key]: { ...prev.rules[key as keyof typeof prev.rules], ...patch } } }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run("antiraid_config", { ...s, trusted: ids(trusted) }, "Réglages enregistrés : le bot les applique d'ici une minute");
  }

  return (
    <form onSubmit={save} className="rise rise-2" style={{ display: "grid", gap: 34 }}>
      <div className="banner" style={{ margin: 0 }}>
        <b>Prérequis :</b> le bot doit être <b>Administrateur</b> et son rôle placé <b>tout en haut</b> de la liste des rôles (au-dessus des admins) : il ne peut ni recréer, ni derank au-dessus de lui.
        Le propriétaire du Discord ne peut jamais être sanctionné (règle de Discord), mais ses actions peuvent quand même être annulées s&apos;il n&apos;est pas « de confiance ».
      </div>

      <section>
        <header className="panel-head"><h2 className="h2">Général</h2></header>
        <div style={{ display: "grid", gap: 16, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <label className="check" style={{ width: "fit-content" }}>
              <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />Anti-raid actif
            </label>
            <label className="check" style={{ width: "fit-content" }}>
              <input type="checkbox" checked={s.trustOwner} onChange={(e) => setS({ ...s, trustOwner: e.target.checked })} />Ignorer les actions du propriétaire du Discord
            </label>
          </div>
          <label style={{ display: "grid", gap: 6, alignContent: "start" }}>
            <span className="muted" style={{ fontSize: 12 }}>Sanction de l&apos;auteur</span>
            <select className="field" value={s.punishment} onChange={(e) => setS({ ...s, punishment: e.target.value as AntiraidSettings["punishment"] })}>
              {PUNISHMENTS.map((p) => <option key={p} value={p}>{PUNISHMENT_LABELS[p]}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>Un bot ajouté qui casse le serveur est toujours expulsé.</span>
          </label>
          <label style={{ display: "grid", gap: 6, alignContent: "start" }}>
            <span className="muted" style={{ fontSize: 12 }}>Salon d&apos;alerte (ID, facultatif)</span>
            <input className="field" pattern="\d{17,20}" value={s.alertChannelId ?? ""} onChange={(e) => setS({ ...s, alertChannelId: e.target.value.trim() || null })} placeholder="ex. 123456789012345678" />
            <span className="muted" style={{ fontSize: 12 }}>Le bot y poste chaque incident.</span>
          </label>
          <label style={{ display: "grid", gap: 6, alignContent: "start" }}>
            <span className="muted" style={{ fontSize: 12 }}>Personnes de confiance (IDs Discord, un par ligne)</span>
            <textarea className="field" rows={4} value={trusted} onChange={(e) => setTrusted(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} />
            <span className="muted" style={{ fontSize: 12 }}>{ids(trusted).length} ID valide(s). Leurs actions ne sont jamais surveillées.</span>
          </label>
        </div>
      </section>

      <section>
        <header className="panel-head">
          <h2 className="h2">Règles</h2>
          <p className="muted">« Toléré » = nombre d&apos;actions qu&apos;une même personne peut faire dans la fenêtre. Au-delà, le bot annule <b>toutes</b> ses actions de la fenêtre et la sanctionne. 0 = dès la première.</p>
        </header>
        <div className="tbl-wrap" style={{ marginTop: 10 }}>
          <table className="tbl" style={{ minWidth: 820 }}>
            <thead><tr><th>Action surveillée</th><th>Ce que le bot annule</th><th>Toléré</th><th>Fenêtre (s)</th></tr></thead>
            <tbody>
              {RAID_RULES.map((r) => {
                const cur = s.rules[r.key];
                return (
                  <tr key={r.key} style={{ opacity: cur.enabled ? 1 : 0.55 }}>
                    <td>
                      <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                        <input type="checkbox" checked={cur.enabled} onChange={(e) => setRule(r.key, { enabled: e.target.checked })} style={{ accentColor: "var(--accent)" }} />{r.label}
                      </label>
                    </td>
                    <td className="muted" style={{ fontSize: 12, maxWidth: 300 }}>{r.undo}</td>
                    <td><input type="number" min={0} max={100} className="field" style={{ width: 80 }} value={cur.max} onChange={(e) => setRule(r.key, { max: Number(e.target.value) })} /></td>
                    <td><input type="number" min={5} max={3600} className="field" style={{ width: 90 }} value={cur.windowSec} onChange={(e) => setRule(r.key, { windowSec: Number(e.target.value) })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <header className="panel-head"><h2 className="h2">Raid de comptes</h2><p className="muted">Arrivées en masse de comptes (bots, raids organisés).</p></header>
        <div style={{ display: "grid", gap: 14, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label className="check" style={{ alignSelf: "end", width: "fit-content" }}>
            <input type="checkbox" checked={s.joinRaid.enabled} onChange={(e) => setS({ ...s, joinRaid: { ...s.joinRaid, enabled: e.target.checked } })} />Détecter les raids
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Arrivées</span>
            <input type="number" min={3} max={500} className="field" value={s.joinRaid.joins} onChange={(e) => setS({ ...s, joinRaid: { ...s.joinRaid, joins: Number(e.target.value) } })} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>En (secondes)</span>
            <input type="number" min={3} max={600} className="field" value={s.joinRaid.windowSec} onChange={(e) => setS({ ...s, joinRaid: { ...s.joinRaid, windowSec: Number(e.target.value) } })} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Verrouillage (minutes)</span>
            <input type="number" min={1} max={1440} className="field" value={s.joinRaid.lockdownMinutes} onChange={(e) => setS({ ...s, joinRaid: { ...s.joinRaid, lockdownMinutes: Number(e.target.value) } })} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Âge minimum du compte (jours, 0 = off)</span>
            <input type="number" min={0} max={365} className="field" value={s.minAccountAgeDays} onChange={(e) => setS({ ...s, minAccountAgeDays: Number(e.target.value) })} />
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Pendant le verrouillage, le niveau de vérification du Discord passe au maximum et chaque nouvel arrivant est expulsé ; tout revient à la normale ensuite.</p>
      </section>

      <div className="save-bar">
        <button className="btn primary" disabled={busy}>Enregistrer les réglages</button>
      </div>
    </form>
  );
}
