import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { generateWeeklyReviews } from "@/lib/review";
import type { ServerRouteContext } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/s/:serverId/review?week=0&force=1 — generate the AI appreciation of a week now (normally the bot's tick does it on Sunday).
 * Works in batches: if `remaining` > 0 in the response, call it again to continue.
 */
export async function POST(req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requirePermissionApi((await params).serverId, "run_review");
  if ("error" in guard) return guard.error;

  const week = Number(req.nextUrl.searchParams.get("week") ?? 0);
  if (!Number.isInteger(week) || week < 0 || week > 52) return NextResponse.json({ error: "validation" }, { status: 400 });

  const result = await generateWeeklyReviews(guard.server.id, week, {
    force: req.nextUrl.searchParams.get("force") === "1",
    actor: { discordId: guard.user.discordId, username: guard.user.username }
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "already_running" ? 409 : 503 });
  return NextResponse.json(result);
}
