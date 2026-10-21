import { NextRequest, NextResponse } from "next/server";
import { fivemEventSchema, verifyAgentToken, ingestFivemEvent, type FivemEvent } from "@/lib/fivem";

export const runtime = "nodejs";

/**
 * POST /api/fivem — FiveM agent session ingestion.
 * Authenticated with `Authorization: Bearer <FIVEM_AGENT_TOKEN>` (constant-time compare).
 * Never logs the token or full request bodies that could contain identifiers.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!verifyAgentToken(presented)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = fivemEventSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  }

  const result = await ingestFivemEvent(parsed.data as FivemEvent);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, action: result.action });
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
