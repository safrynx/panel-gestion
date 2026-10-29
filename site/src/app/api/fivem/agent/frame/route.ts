import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decodeImage } from "@/lib/security";
import { storeFrame } from "@/lib/security-live";
import { serverForFivemToken } from "@/lib/servers";

export const runtime = "nodejs";

const schema = z.object({ target: z.number().int().nonnegative(), name: z.string().max(100), image: z.string().min(30).max(3_000_000) });

/**
 * POST /api/fivem/agent/frame — one frame of a player's live screen. Only the latest frame is kept. The answer says
 * whether someone still watches: the agent stops streaming when nobody does.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const server = await serverForFivemToken(auth.startsWith("Bearer ") ? auth.slice(7) : null);
  if (!server) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });
  const image = decodeImage(parsed.data.image);
  if (!image) return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  const watched = await storeFrame(server.id, parsed.data.target, parsed.data.name, image.bytes, image.mime);
  return NextResponse.json({ ok: true, continue: watched });
}
