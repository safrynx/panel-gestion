import { NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import type { ServerRouteContext } from "@/lib/route";
import { recentDetectionsWithPosition } from "@/lib/security-live";

export const runtime = "nodejs";

/** GET /api/s/:serverId/detections — detections of the last 30 min with a position (markers on the map). */
export async function GET(_req: Request, { params }: ServerRouteContext) {
  const guard = await requirePermissionApi((await params).serverId, "view_security");
  if ("error" in guard) return guard.error;
  return NextResponse.json(await recentDetectionsWithPosition(guard.server.id));
}
