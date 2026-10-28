"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { describeApiError, useServerPaths, useUI } from "@/app/ui";

/** Danger zone: delete the server and all its data, after typing its exact name. */
export default function DeleteServer({ name }: { name: string }) {
  const router = useRouter();
  const { ask, toast } = useUI();
  const paths = useServerPaths();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const confirm = await ask({
      title: "Supprimer le serveur",
      message: "Tout sera supprimé définitivement : staff, historique, avertissements, commentaires, bilans, logs, accès. Le serveur Discord et le bot ne sont pas touchés.",
      confirmLabel: "Supprimer définitivement",
      danger: true,
      input: { label: `Tape « ${name} » pour confirmer`, required: true }
    });
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await fetch(paths.api("access?kind=server_delete"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: confirm.value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(describeApiError(data, res.status), "error");
      router.push("/?deleted=1");
    } catch {
      toast("Impossible de joindre le serveur.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rise rise-3" style={{ marginTop: 56, maxWidth: 640 }}>
      <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
        <h2 className="h2" style={{ color: "var(--bad)" }}>Zone dangereuse</h2>
        <p className="muted" style={{ margin: "6px 0 0" }}>Supprimer ce serveur du panel et toutes ses données. Irréversible.</p>
      </header>
      <button className="btn danger" style={{ marginTop: 16 }} disabled={busy} onClick={remove}>{busy ? "Suppression…" : "Supprimer le serveur"}</button>
    </section>
  );
}
