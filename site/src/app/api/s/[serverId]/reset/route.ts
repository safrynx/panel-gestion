import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { resetCounters } from "@/lib/counters";
import type { ServerRouteContext } from "@/lib/route";

export const runtime = "nodejs";

/** POST /api/s/:serverId/reset — restart the server's voice and game time counters from now. History is kept. */
export async function POST(_req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requirePermissionApi((await params).serverId, "reset_counters");
  if ("error" in guard) return guard.error;
  const result = await resetCounters(guard.server.id, { discordId: guard.user.discordId, username: guard.user.username });
  return NextResponse.json({ ok: true, ...result });
}
