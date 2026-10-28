import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { refreshGuildRoles } from "@/lib/discord";
import { syncStaffMembers, type SyncedMember } from "@/lib/sync";

export const runtime = "nodejs";

const DISCORD_API = "https://discord.com/api/v10";

type PartialGuildMember = {
  user?: { id: string; username: string; global_name?: string | null; avatar: string | null; bot?: boolean };
  roles: string[];
  joined_at?: string;
  nick?: string | null;
};

/** Fetch all guild members from Discord (bot token used server-side only). */
async function fetchAllGuildMembers(): Promise<SyncedMember[] | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return null;

  const members: SyncedMember[] = [];
  let after = "0";
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`, {
      headers: { Authorization: `Bot ${token}` }
    });
    if (!res.ok) return null;
    const batch = (await res.json()) as PartialGuildMember[];
    if (!batch.length) break;
    for (const m of batch) {
      if (!m.user || m.user.bot) continue;
      members.push({
        discordId: m.user.id,
        username: m.user.global_name || m.user.username,
        avatarUrl: m.user.avatar
          ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}${m.user.avatar.startsWith("a_") ? ".gif" : ".png"}`
          : null,
        roleIds: m.roles ?? [],
        joinedAt: m.joined_at ?? null,
        presentInGuild: true
      });
    }
    after = batch[batch.length - 1].user!.id;
    if (batch.length < 1000) break;
  }
  return members;
}

/**
 * Controlled re-sync endpoint.
 * POST /api/sync?full=1 : full guild sync via bot token (requires authenticated staff session).
 * The bot token is NEVER sent to the client and never logged.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermissionApi("sync");
  if ("error" in guard) return guard.error;
  const { user } = guard;

  const full = req.nextUrl.searchParams.get("full") === "1";
  if (full) {
    await refreshGuildRoles(); // role names/positions drive the grade ladder
    const members = await fetchAllGuildMembers();
    if (!members) {
      return NextResponse.json({ error: "bot_unavailable", hint: "Check DISCORD_BOT_TOKEN and DISCORD_GUILD_ID" }, { status: 503 });
    }
    const result = await syncStaffMembers(members, user.discordId);
    return NextResponse.json({ ok: true, mode: "full", ...result });
  }
  return NextResponse.json({ error: "unknown_mode", hint: "Use ?full=1" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
