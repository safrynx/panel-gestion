import { db } from "./db";
import { getStaffOverview, type StaffOverview } from "./stats";
import { formatDuration } from "./format";
import { getReviews, type Review } from "./review";
import { RATINGS } from "./ratings";
import { weekKey, weekRange, type WeekRange } from "./week";

export { weekRange, type WeekRange } from "./week";

export type ReportRow = StaffOverview & { warningsAdded: number; warningsRemoved: number; review: Review | null };

export type WeeklyReport = {
  range: WeekRange;
  rows: ReportRow[];
  /** Rows grouped by grade, highest grade first. */
  groups: { grade: string; gradeLevel: number; rows: ReportRow[] }[];
};

export async function buildWeeklyReport(offset: number): Promise<WeeklyReport> {
  const range = weekRange(offset);
  const overview = await getStaffOverview(range.start, range.end, false);
  const startIso = range.start.toISOString().replace("T", " ").slice(0, 19);
  const endIso = range.end.toISOString().replace("T", " ").slice(0, 19);
  // warnings.created_at uses SQLite CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS", UTC).
  const added = db
    .prepare("SELECT discord_id, COUNT(*) AS n FROM warnings WHERE created_at >= ? AND created_at < ? GROUP BY discord_id")
    .all(startIso, endIso) as { discord_id: string; n: number }[];
  const removed = db
    .prepare("SELECT discord_id, COUNT(*) AS n FROM warnings WHERE removed_at >= ? AND removed_at < ? GROUP BY discord_id")
    .all(startIso, endIso) as { discord_id: string; n: number }[];
  const addedMap = new Map(added.map((r) => [r.discord_id, r.n]));
  const removedMap = new Map(removed.map((r) => [r.discord_id, r.n]));

  const reviews = getReviews(weekKey(range));
  const rows = overview
    .map((m) => ({ ...m, warningsAdded: addedMap.get(m.discordId) ?? 0, warningsRemoved: removedMap.get(m.discordId) ?? 0, review: reviews.get(m.discordId) ?? null }))
    .sort((a, b) => b.gradeLevel - a.gradeLevel || a.username.localeCompare(b.username, "fr", { sensitivity: "base" }));

  const groups: WeeklyReport["groups"] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.grade === row.grade) last.rows.push(row);
    else groups.push({ grade: row.grade, gradeLevel: row.gradeLevel, rows: [row] });
  }
  return { range, rows, groups };
}

export function reportToText(report: WeeklyReport): string {
  const lines = [`**Bilan staff — semaine ${report.range.label}**${report.range.partial ? " (en cours)" : ""}`, ""];
  for (const group of report.groups) {
    lines.push(`__${group.grade}__`);
    for (const r of group.rows) {
      const warn = r.warnLevel > 0 ? ` · Avert ${r.warnLevel}` : "";
      const changes = r.warningsAdded || r.warningsRemoved ? ` (+${r.warningsAdded}/-${r.warningsRemoved} cette semaine)` : "";
      const review = r.review ? `\n   ↳ ${RATINGS[r.review.rating].label} : ${r.review.summary}` : "";
      lines.push(`• ${r.username} — Vocal ${formatDuration(r.voiceSeconds)} · Jeu ${formatDuration(r.fivemSeconds)}${warn}${changes}${review}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function reportToCsv(report: WeeklyReport): string {
  const header = ["Grade", "Pseudo", "ID Discord", "Vocal (s)", "Vocal", "Jeu (s)", "Jeu", "Avert actuel", "Avert ajoutés", "Avert retirés", "Appréciation", "Résumé"];
  const lines = [header.join(";")];
  for (const r of report.rows) {
    lines.push(
      [r.grade, r.username, r.discordId, r.voiceSeconds, formatDuration(r.voiceSeconds), r.fivemSeconds, formatDuration(r.fivemSeconds), r.warnLevel, r.warningsAdded, r.warningsRemoved, r.review ? RATINGS[r.review.rating].label : "", r.review?.summary ?? ""]
        .map(csvCell)
        .join(";")
    );
  }
  return "﻿" + lines.join("\r\n");
}
