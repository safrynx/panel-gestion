import { NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { resetCounters } from "@/lib/counters";

export const runtime = "nodejs";

/** POST /api/reset — restart the voice and game time counters from now. History is kept. */
export async function POST() {
  const guard = await requirePermissionApi("reset_counters");
  if ("error" in guard) return guard.error;
  const result = await resetCounters({ discordId: guard.user.discordId, username: guard.user.username });
  return NextResponse.json({ ok: true, ...result });
}
