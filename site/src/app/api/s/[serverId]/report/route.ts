import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { buildWeeklyReport, reportToCsv, reportToText } from "@/lib/report";
import type { ServerRouteContext } from "@/lib/route";

export const runtime = "nodejs";

/** GET /api/s/:serverId/report?week=0&format=json|text|csv — weekly staff report (week 0 = current, 1 = previous, …). */
export async function GET(req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requirePermissionApi((await params).serverId, "view_report");
  if ("error" in guard) return guard.error;

  const week = Number(req.nextUrl.searchParams.get("week") ?? 0);
  if (!Number.isInteger(week) || week < 0 || week > 52) return NextResponse.json({ error: "validation" }, { status: 400 });
  const report = await buildWeeklyReport(guard.server.id, week);

  const format = req.nextUrl.searchParams.get("format") ?? "json";
  if (format === "text") return new NextResponse(reportToText(report), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (format === "csv") {
    const name = `bilan-staff-${guard.server.id}-${report.range.start.toISOString().slice(0, 10)}.csv`;
    return new NextResponse(reportToCsv(report), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` }
    });
  }
  return NextResponse.json({ range: report.range, groups: report.groups });
}
