"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { describeApiError, useUI } from "./ui";

export default function SyncButton() {
  const [busy, setBusy] = useState(false);
  const { toast } = useUI();
  const router = useRouter();
  return (
    <button
      className="btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/sync?full=1", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) return toast(describeApiError(data, res.status), "error");
        toast(`Synchronisé : ${data.inserted} ajoutés, ${data.updated} mis à jour, ${data.markedLeft} retirés`, "ok");
        router.refresh();
      }}
    >
      {busy ? "Synchronisation…" : "Synchroniser Discord"}
    </button>
  );
}
