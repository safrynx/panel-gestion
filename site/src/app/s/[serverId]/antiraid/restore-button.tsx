"use client";
import { useUI } from "@/app/ui";
import { useSecurityAction } from "../security-actions";

/** Give back the roles the anti-raid took from someone (false alarm). */
export default function RestoreButton({ id, name, roles }: { id: number; name: string; roles: string[] }) {
  const { ask } = useUI();
  const { run, busy } = useSecurityAction();
  async function restore() {
    const ok = await ask({ title: `Rendre ses rôles à ${name}`, message: `Rôles retirés par l'anti-raid : ${roles.join(", ")}.`, confirmLabel: "Rendre les rôles" });
    if (ok) await run("incident_restore", { id }, `Rôles rendus à ${name}`);
  }
  return <button className="btn" disabled={busy} onClick={restore}>Rendre les rôles</button>;
}
