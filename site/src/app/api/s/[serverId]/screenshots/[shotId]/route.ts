import { NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { getScreenshotImage } from "@/lib/security";

export const runtime = "nodejs";

/** GET /api/s/:serverId/screenshots/:shotId — the image of an anticheat screenshot. */
export async function GET(_req: Request, { params }: { params: Promise<{ serverId: string; shotId: string }> }) {
  const { serverId, shotId } = await params;
  const guard = await requirePermissionApi(serverId, "view_security");
  if ("error" in guard) return guard.error;
  const shot = await getScreenshotImage(guard.server.id, Number(shotId));
  if (!shot) return NextResponse.json({ error: "unknown_screenshot" }, { status: 404 });
  return new NextResponse(Buffer.from(shot.image), {
    headers: { "Content-Type": shot.mime, "Cache-Control": "private, max-age=86400, immutable" }
  });
}
