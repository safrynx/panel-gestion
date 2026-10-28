"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { describeApiError, useServerPaths, useUI } from "@/app/ui";

export default function ReviewButton({ week }: { week: number }) {
  const router = useRouter();
  const { ask, toast } = useUI();
  const paths = useServerPaths();
  const [busy, setBusy] = useState(false);

  async function run() {
    const answer = await ask({
      title: "Générer l'appréciation IA",
      message: "L'IA résume les commentaires de la semaine et pose une pastille à chaque membre commenté. Les commentaires sont envoyés au service d'IA configuré.",
      confirmLabel: "Générer"
    });
    if (!answer) return;
    setBusy(true);
    try {
      const res = await fetch(paths.api(`review?week=${week}`), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error === "ai_not_configured" ? "Clé IA absente : renseigne AI_API_KEY dans le .env." : describeApiError(data, res.status), "error");
      toast(`${data.generated} résumé(s) généré(s)${data.skipped ? `, ${data.skipped} déjà fait(s)` : ""}${data.failed ? `, ${data.failed} échec(s) : ${data.errors[0]}` : ""}`, data.failed ? "error" : "ok");
      router.refresh();
    } catch {
      toast("Impossible de joindre le serveur.", "error");
    } finally {
      setBusy(false);
    }
  }

  return <button className="btn" disabled={busy} onClick={run}>{busy ? "L'IA résume…" : "Générer le bilan IA"}</button>;
}
