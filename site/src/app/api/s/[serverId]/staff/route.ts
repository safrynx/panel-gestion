import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth";
import type { ServerRouteContext } from "@/lib/route";
import { getMemberDetail, listStaffWithStats } from "@/lib/sync";

export const runtime = "nodejs";

/** GET /api/s/:serverId/staff?q=&days=&id= — the server's staff list (or one member's detail with ?id=). */
export async function GET(req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requireStaffApi((await params).serverId);
  if ("error" in guard) return guard.error;
  const serverId = guard.server.id;

  const query = req.nextUrl.searchParams;
  const days = Number(query.get("days"));
  const since = Number.isFinite(days) && days > 0 ? new Date(Date.now() - days * 86400_000) : undefined;

  const id = query.get("id");
  if (id) {
    if (!/^\d{17,20}$/.test(id)) return NextResponse.json({ error: "validation" }, { status: 400 });
    const detail = await getMemberDetail(serverId, id, since);
    if (!detail.member) return NextResponse.json({ error: "unknown_member" }, { status: 404 });
    return NextResponse.json(detail);
  }

  const search = query.get("q")?.trim().toLowerCase() ?? "";
  let staff = await listStaffWithStats(serverId, since);
  if (search) {
    staff = staff.filter((m) => m.username.toLowerCase().includes(search) || m.discordId.includes(search));
  }
  return NextResponse.json({ staff });
}
