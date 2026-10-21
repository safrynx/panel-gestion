export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, "0")}`;
}

/** "YYYY-MM-DD HH:MM:SS" (SQLite, UTC) or ISO string -> "21/10 14:05" in Paris time. */
export function formatDateTime(raw: string): string {
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  return new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
