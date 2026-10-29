"use client";
import { useUI } from "@/app/ui";
import { useSecurityAction } from "../security-actions";

export default function UnbanButton({ banId, name }: { banId: number; name: string }) {
  const { ask } = useUI();
  const { run, busy } = useSecurityAction();
  async function unban() {
    if (await ask({ title: `Débannir ${name}`, message: "Le joueur pourra se reconnecter immédiatement.", confirmLabel: "Débannir" })) {
      await run("unban", { banId }, `${name} débanni`);
    }
  }
  return <button className="btn" disabled={busy} onClick={unban}>Débannir</button>;
}
