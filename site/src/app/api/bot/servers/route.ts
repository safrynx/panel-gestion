import { NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { registeredGuilds } from "@/lib/bot-api";

export const runtime = "nodejs";

/** POST /api/bot/servers — the Discord guilds of the registered servers, i.e. the ones the bot must watch. */
export function POST(req: NextRequest) {
  return handleBotRequest(req, null, () => registeredGuilds());
}
