"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { describeApiError, useUI } from "./ui";

/** Register a server (platform owners), then open its access page to finish the setup. */
export default function NewServerForm() {
  const router = useRouter();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [guildId, setGuildId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), guildId: guildId.trim() || null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(describeApiError(data, res.status), "error");
      toast(`Serveur « ${data.server.name} » créé`, "ok");
      router.push(`/s/${data.server.id}/admin`);
    } catch {
      toast("Impossible de joindre le serveur.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 18 }}>
      <input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du serveur (ex. GTA Sun RP)" className="field" />
      <input value={guildId} onChange={(e) => setGuildId(e.target.value)} pattern="\d{17,20}" placeholder="ID du serveur Discord (facultatif, modifiable ensuite)" className="field" />
      <div><button className="btn primary" disabled={busy}>{busy ? "Création…" : "Créer le serveur"}</button></div>
    </form>
  );
}
