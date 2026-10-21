"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { describeApiError, useUI } from "../ui";

export default function ResetButton() {
  const router = useRouter();
  const { ask, toast } = useUI();
  const [busy, setBusy] = useState(false);

  async function run() {
    const answer = await ask({
      title: "Remettre tous les compteurs à zéro ?",
      message: "Le temps vocal et le temps de jeu de tout le staff repartent de zéro à cet instant. L'historique, les avertissements, les commentaires et les bilans des semaines passées sont conservés.",
      confirmLabel: "Tout remettre à zéro",
      danger: true,
      input: { label: "Tape RESET pour confirmer", placeholder: "RESET", required: true }
    });
    if (!answer) return;
    if (answer.value.toUpperCase() !== "RESET") return toast("Confirmation incorrecte : rien n'a été modifié.", "error");

    setBusy(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(describeApiError(data, res.status), "error");
      toast("Compteurs remis à zéro", "ok");
      router.refresh();
    } catch {
      toast("Impossible de joindre le serveur.", "error");
    } finally {
      setBusy(false);
    }
  }

  return <button className="btn danger" disabled={busy} onClick={run}><RotateCcw size={14} /> Reset compteurs</button>;
}
