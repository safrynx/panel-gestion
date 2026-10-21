import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth";
import { getMemberDetail, listStaffWithStats } from "@/lib/sync";

export const runtime = "nodejs";

/** GET /api/staff?q=&days=&id= — staff list (or one member's detail with ?id=). */
export async function GET(req: NextRequest) {
  const guard = await requireStaffApi();
  if ("error" in guard) return guard.error;

  const params = req.nextUrl.searchParams;
  const days = Number(params.get("days"));
  const since = Number.isFinite(days) && days > 0 ? new Date(Date.now() - days * 86400_000) : undefined;

  const id = params.get("id");
  if (id) {
    if (!/^\d{17,20}$/.test(id)) return NextResponse.json({ error: "validation" }, { status: 400 });
    const detail = await getMemberDetail(id, since);
    if (!detail.member) return NextResponse.json({ error: "unknown_member" }, { status: 404 });
    return NextResponse.json(detail);
  }

  const search = params.get("q")?.trim().toLowerCase() ?? "";
  let staff = await listStaffWithStats(since);
  if (search) {
    staff = staff.filter((m) => m.username.toLowerCase().includes(search) || m.discordId.includes(search));
  }
  return NextResponse.json({ staff });
}
