import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { getConsole } from "@/lib/agent";
import type { ServerRouteContext } from "@/lib/route";

export const runtime = "nodejs";

/** GET /api/s/:serverId/console?after=<id> — console lines of the FiveM server newer than `after`. */
export async function GET(req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requirePermissionApi((await params).serverId, "console");
  if ("error" in guard) return guard.error;
  const after = Number(req.nextUrl.searchParams.get("after")) || 0;
  return NextResponse.json({ lines: await getConsole(guard.server.id, Math.max(0, after)) });
}
