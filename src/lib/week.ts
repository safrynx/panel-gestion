export type WeekRange = { start: Date; end: Date; partial: boolean; label: string };

const fmtDay = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

/** Monday 00:00 (server local time) of the week `offset` weeks ago; 0 = current week so far. */
export function weekRange(offset: number, now = new Date()): WeekRange {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - offset * 7);
  const fullEnd = new Date(start);
  fullEnd.setDate(fullEnd.getDate() + 7);
  const partial = fullEnd.getTime() > now.getTime();
  const end = partial ? now : fullEnd;
  const lastDay = new Date(fullEnd.getTime() - 1);
  return { start, end, partial, label: `du ${fmtDay(start)} au ${fmtDay(lastDay)}` };
}

/** Stable key for a week: its Monday as local YYYY-MM-DD. */
export function weekKey(range: WeekRange): string {
  const d = range.start;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** SQLite CURRENT_TIMESTAMP format ("YYYY-MM-DD HH:MM:SS", UTC). */
export function toSqlUtc(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}
