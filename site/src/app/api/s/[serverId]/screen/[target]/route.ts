import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/auth";
import { enqueueCommand, getLiveState } from "@/lib/agent";
import { readFrame, watchScreen } from "@/lib/security-live";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ serverId: string; target: string }> };

/** POST — start watching a player's screen (the agent streams frames while the panel reads them). */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { serverId, target: raw } = await params;
  const guard = await requirePermissionApi(serverId, "screenshot");
  if ("error" in guard) return guard.error;
  const target = Number(raw);
  const live = await getLiveState(guard.server.id);
  if (!live.online) return NextResponse.json({ error: "agent_offline" }, { status: 409 });
  const player = live.players.find((p) => p.id === target);
  if (!player) return NextResponse.json({ error: "player_offline" }, { status: 409 });
  await watchScreen(guard.server.id, target, player.name);
  const id = await enqueueCommand(guard.server.id, guard.user, "screen", { target }, { playerName: player.name, targetDiscordId: player.discordId });
  return NextResponse.json({ ok: true, id });
}

/** GET — latest frame (204 while the first one is on its way). Reading keeps the stream alive. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { serverId, target } = await params;
  const guard = await requirePermissionApi(serverId, "screenshot");
  if ("error" in guard) return guard.error;
  const frame = await readFrame(guard.server.id, Number(target));
  if (!frame) return new NextResponse(null, { status: 204 });
  return new NextResponse(Buffer.from(frame.image), { headers: { "Content-Type": frame.mime, "Cache-Control": "no-store", "X-Frame-At": frame.at } });
}
