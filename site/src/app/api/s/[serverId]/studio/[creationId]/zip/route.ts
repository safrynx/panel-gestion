import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { getCreation } from "@/lib/studio";
import { zip } from "@/lib/zip";

export const runtime = "nodejs";

/** GET — the creation as a ready-to-install resource: <resource>/fxmanifest.lua, … */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ serverId: string; creationId: string }> }) {
  const { serverId, creationId } = await params;
  const guard = await requirePermissionApi(serverId, "studio");
  if ("error" in guard) return guard.error;
  const creation = await getCreation(guard.server.id, Number(creationId));
  if (!creation) return NextResponse.json({ error: "unknown_creation" }, { status: 404 });
  const archive = zip(creation.files.map((f) => ({ path: `${creation.resource}/${f.path}`, content: f.content })));
  return new NextResponse(Buffer.from(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${creation.resource}.zip"`,
      "Cache-Control": "no-store"
    }
  });
}
