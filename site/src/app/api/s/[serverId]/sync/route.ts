import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { fetchAllGuildMembers, refreshGuildRoles } from "@/lib/discord";
import type { ServerRouteContext } from "@/lib/route";
import { syncStaffMembers } from "@/lib/sync";

export const runtime = "nodejs";

/**
 * Controlled re-sync endpoint.
 * POST /api/s/:serverId/sync?full=1 : full sync of the server's guild via the bot token.
 * The bot token is NEVER sent to the client and never logged.
 */
export async function POST(req: NextRequest, { params }: ServerRouteContext) {
  const guard = await requirePermissionApi((await params).serverId, "sync");
  if ("error" in guard) return guard.error;
  const { user, server } = guard;

  if (req.nextUrl.searchParams.get("full") !== "1") {
    return NextResponse.json({ error: "unknown_mode", hint: "Use ?full=1" }, { status: 400 });
  }
  if (!server.guildId) return NextResponse.json({ error: "no_guild" }, { status: 409 });
  await refreshGuildRoles(server.id, server.guildId); // role names/positions drive the grade ladder
  const members = await fetchAllGuildMembers(server.guildId);
  if (!members) {
    return NextResponse.json({ error: "bot_unavailable", hint: "Check DISCORD_BOT_TOKEN and that the bot is in this guild" }, { status: 503 });
  }
  const result = await syncStaffMembers(server.id, members, user.discordId);
  return NextResponse.json({ ok: true, mode: "full", ...result });
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
