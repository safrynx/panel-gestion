import { NextRequest, NextResponse } from "next/server";
import { agentRequestSchema, handleAgentCall } from "@/lib/agent";
import { serverForFivemToken } from "@/lib/servers";

export const runtime = "nodejs";

/**
 * POST /api/fivem/agent — the two-way FiveM agent (resource `fiverax_agent`), see lib/agent.ts.
 * Authenticated with `Authorization: Bearer <token of the server>`: the token decides which server is reporting.
 * Never logs the token or request bodies (they hold player identifiers).
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const server = await serverForFivemToken(auth.startsWith("Bearer ") ? auth.slice(7) : null);
  if (!server) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = agentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues.slice(0, 10).map((i) => i.path.join(".")) }, { status: 400 });
  }
  return NextResponse.json(await handleAgentCall(server.id, parsed.data));
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
