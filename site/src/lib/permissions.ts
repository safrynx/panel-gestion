/** Permissions an owner can grant to each person / role from the "Accès & rôles" page. Client-safe (no DB). */
export const PERMISSIONS = [
  { key: "view_report", label: "Voir le bilan hebdo", group: "Consultation" },
  { key: "view_logs", label: "Voir les logs", group: "Consultation" },
  { key: "rank_up", label: "Up (monter d'un grade)", group: "Grades" },
  { key: "rank_down", label: "Down / Derank", group: "Grades" },
  { key: "rank_demote", label: "Demote (retirer du staff)", group: "Grades" },
  { key: "set_grade", label: "Choisir un grade précis", group: "Grades" },
  { key: "recruit", label: "Recruter du staff", group: "Grades" },
  { key: "warn_add", label: "Ajouter un avert", group: "Avertissements" },
  { key: "warn_remove", label: "Retirer un avert", group: "Avertissements" },
  { key: "comment", label: "Écrire des commentaires", group: "Suivi" },
  { key: "badges", label: "Gérer les pastilles", group: "Suivi" },
  { key: "sync", label: "Synchroniser Discord", group: "Suivi" },
  { key: "run_review", label: "Lancer le bilan IA", group: "Suivi" },
  { key: "reset_counters", label: "Reset des compteurs", group: "Suivi" }
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

/** Granted to a newly added person/role until an owner changes it. */
export const DEFAULT_NEW_PERMISSIONS: Permission[] = ["view_report", "comment"];

export function parsePermissions(raw: string | null | undefined): Permission[] {
  if (!raw) return DEFAULT_NEW_PERMISSIONS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_NEW_PERMISSIONS;
    return parsed.filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission));
  } catch {
    return DEFAULT_NEW_PERMISSIONS;
  }
}
