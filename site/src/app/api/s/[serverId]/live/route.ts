import { NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { getLiveState } from "@/lib/agent";
import type { ServerRouteContext } from "@/lib/route";

export const runtime = "nodejs";

/** GET /api/s/:serverId/live — the FiveM server as last reported by its agent (polled by the live pages). */
export async function GET(_req: Request, { params }: ServerRouteContext) {
  const guard = await requirePermissionApi((await params).serverId, "view_live");
  if ("error" in guard) return guard.error;
  return NextResponse.json(await getLiveState(guard.server.id, { watch: true }));
}
