import { NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { heartbeatSchema, recordHeartbeat } from "@/lib/bot-api";

export const runtime = "nodejs";

/** POST /api/bot/heartbeat — the bot is alive, with the guilds it is in (sent every 60 s). Authenticated with BOT_API_TOKEN. */
export function POST(req: NextRequest) {
  return handleBotRequest(req, heartbeatSchema, recordHeartbeat);
}
