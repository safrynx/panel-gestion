"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import { describeApiError, useServerPaths, useUI } from "@/app/ui";

type Role = { id: string; name: string };
type AccessRow = { id: number; kind: "user" | "role"; discordId: string; display: string; permissions: string[] };
type Props = {
  /** Owners listed for this server (platform owners come from the .env and are not listed). */
  owners: { discordId: string; display: string }[];
  platformOwners: string[];
  access: AccessRow[];
  roles: Role[];
  grades: { roleId: string; name: string; level: number }[];
  gradeFromEnv: boolean;
  warnRoles: { level: number; roleId: string }[];
  warnConfigured: boolean;
};

const groups = [...new Set(PERMISSIONS.map((p) => p.group))];

export default function AdminPanel(props: Props) {
  const router = useRouter();
  const { ask, toast } = useUI();
  const paths = useServerPaths();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"user" | "role">("user");
  const [discordId, setDiscordId] = useState("");
  const [label, setLabel] = useState("");
  const [gradeRole, setGradeRole] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [perms, setPerms] = useState<Record<number, string[]>>(() => Object.fromEntries(props.access.map((a) => [a.id, a.permissions])));

  const roleLabel = (id: string) => props.roles.find((r) => r.id === id)?.name ?? id;

  async function call(kind: string, payload: unknown, success?: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(paths.api(`access?kind=${kind}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(describeApiError(data, res.status), "error");
        return false;
      }
      if (success) toast(success, "ok");
      router.refresh();
      return true;
    } catch {
      toast("Impossible de joindre le serveur.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function togglePermission(row: AccessRow, key: string) {
    const before = perms[row.id] ?? [];
    const next = before.includes(key) ? before.filter((k) => k !== key) : [...before, key];
    setPerms((p) => ({ ...p, [row.id]: next }));
    const ok = await call("access_permissions", { id: row.id, permissions: next });
    if (ok) toast(`Permissions de ${row.display} enregistrées`, "ok");
    else setPerms((p) => ({ ...p, [row.id]: before }));
  }

  async function remove(row: AccessRow) {
    const answer = await ask({ title: "Retirer l'accès", message: `${row.display} ne pourra plus ouvrir le panel.`, confirmLabel: "Retirer", danger: true });
    if (answer) await call("access_remove", { id: row.id }, "Accès retiré");
  }

  return (
    <div className="cols" style={{ gap: 56 }}>
      <section className="rise rise-1">
        <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
          <h2 className="h2">Accès & permissions</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>Allume ou éteins chaque droit. Une personne cumule ses droits et ceux de ses rôles. La hiérarchie des grades s&apos;applique toujours en plus.</p>
        </header>

        {props.owners.map((o) => (
          <div key={o.discordId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
            <div>
              <span className="tag" data-tone="info">Propriétaire</span>
              <b style={{ marginLeft: 10 }}>{o.display}</b>
              <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{o.discordId} · tous les droits</span>
            </div>
            <button className="linkish" disabled={busy} onClick={async () => {
              const answer = await ask({ title: "Retirer le propriétaire", message: `${o.display} perdra tous ses droits de propriétaire sur ce serveur.`, confirmLabel: "Retirer", danger: true });
              if (answer) await call("owner_remove", { discordId: o.discordId }, "Propriétaire retiré");
            }}>Retirer</button>
          </div>
        ))}
        <form style={{ padding: "14px 0", borderBottom: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }} onSubmit={(e) => { e.preventDefault(); void call("owner_add", { discordId: ownerId.trim() }, "Propriétaire ajouté").then((ok) => ok && setOwnerId("")); }}>
          <input required value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="ID Discord du nouveau propriétaire" className="field" style={{ width: "auto", minWidth: 260 }} />
          <button className="btn" disabled={busy}>Ajouter un propriétaire</button>
          {props.platformOwners.length > 0 && <span className="muted" style={{ fontSize: 12 }}>+ {props.platformOwners.length} administrateur(s) de la plateforme (.env)</span>}
        </form>

        {props.access.length === 0 && <p className="muted" style={{ padding: "18px 0" }}>Personne en dehors des propriétaires.</p>}
        {props.access.map((row, i) => (
          <div key={row.id} className="row-in" style={{ ["--i" as string]: i, padding: "18px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div>
                <span className="tag" data-tone={row.kind === "role" ? "warn" : "info"}>{row.kind === "role" ? "Rôle" : "Personne"}</span>
                <b style={{ marginLeft: 10 }}>{row.display}</b>
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{row.discordId}</span>
              </div>
              <button className="linkish" disabled={busy} onClick={() => remove(row)}>Retirer l&apos;accès</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {groups.map((group) => (
                <div key={group} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span className="muted" style={{ width: 118, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>{group}</span>
                  {PERMISSIONS.filter((p) => p.group === group).map((p) => (
                    <button key={p.key} className="perm" data-on={(perms[row.id] ?? []).includes(p.key)} disabled={busy} onClick={() => togglePermission(row, p.key)}>{p.label}</button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}

        <form style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 10 }} onSubmit={(e) => { e.preventDefault(); void call("access_add", { type, discordId: discordId.trim(), label: label.trim() || undefined }, "Accès ajouté (droits de base : bilan + commentaires)").then((ok) => ok && (setDiscordId(""), setLabel(""))); }}>
          <select value={type} onChange={(e) => { setType(e.target.value as "user" | "role"); setDiscordId(""); }} className="field" style={{ width: "auto" }}>
            <option value="user">Personne</option><option value="role">Rôle</option>
          </select>
          {type === "role" && props.roles.length > 0 ? (
            <select required value={discordId} onChange={(e) => setDiscordId(e.target.value)} className="field" style={{ width: "auto", minWidth: 220 }}>
              <option value="">Choisir un rôle…</option>
              {props.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ) : (
            <input required value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="ID Discord" className="field" style={{ width: "auto", minWidth: 220 }} />
          )}
          {type === "user" && <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Note (facultatif)" className="field" style={{ width: "auto" }} />}
          <button className="btn primary" disabled={busy}>Ajouter</button>
        </form>
      </section>

      <section className="rise rise-2">
        <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
          <div>
            <h2 className="h2">Rôles Discord</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>{props.roles.length} rôle(s) en cache. Le grade vient de la position du rôle dans Discord : plus haut dans la liste = grade plus élevé.</p>
          </div>
          <button className="btn" disabled={busy} onClick={() => call("roles_refresh", {}, "Rôles actualisés depuis Discord")}>Actualiser depuis Discord</button>
        </header>

        <h3 className="eyebrow" style={{ margin: "24px 0 6px" }}>Rôles de grade · du plus haut au plus bas</h3>
        {props.gradeFromEnv && <div className="banner">GRADE_ROLE_MAPPING_JSON est défini dans le .env : il remplace cette liste.</div>}
        {props.grades.length === 0 && <p className="muted" style={{ padding: "10px 0" }}>Aucun rôle de grade. Ajoute-les ci-dessous.</p>}
        {[...props.grades].reverse().map((g) => (
          <div key={g.roleId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
            <div><span className="plate"><span>{g.name}</span></span> <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>niveau {g.level}</span></div>
            {!props.gradeFromEnv && <button className="linkish" disabled={busy} onClick={() => call("grade_role_remove", { roleId: g.roleId }, "Rôle retiré de la hiérarchie")}>Retirer</button>}
          </div>
        ))}
        {!props.gradeFromEnv && (
          <form style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10 }} onSubmit={(e) => { e.preventDefault(); void call("grade_role_add", { roleId: gradeRole }, "Rôle ajouté à la hiérarchie").then((ok) => ok && setGradeRole("")); }}>
            <select required value={gradeRole} onChange={(e) => setGradeRole(e.target.value)} className="field" style={{ width: "auto", minWidth: 240 }}>
              <option value="">Ajouter un rôle de grade…</option>
              {props.roles.filter((r) => !props.grades.some((g) => g.roleId === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button className="btn primary" disabled={busy || !gradeRole}>Ajouter</button>
          </form>
        )}

        <h3 className="eyebrow" style={{ margin: "34px 0 6px" }}>Rôles d&apos;avertissement</h3>
        <p className="muted" style={{ margin: "0 0 12px" }}>{props.warnConfigured ? "Rôles choisis manuellement." : "Détectés d'après leur nom (« Avert 1 », « Avertissement 2 »…). Tu peux les fixer ici."}</p>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          {[1, 2, 3].map((level) => {
            const current = props.warnRoles.find((w) => w.level === level)?.roleId ?? "";
            return (
              <label key={level} style={{ display: "grid", gap: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>Avert {level} · {current ? roleLabel(current) : "non trouvé"}</span>
                <select disabled={busy} value={current} onChange={(e) => call("warn_role_set", { level, roleId: e.target.value || null }, `Rôle Avert ${level} enregistré`)} className="field">
                  <option value="">—</option>
                  {props.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
