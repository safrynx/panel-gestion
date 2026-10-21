import { NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { applySync, syncSchema } from "@/lib/bot-api";

export const runtime = "nodejs";

/** POST /api/bot/sync — full snapshot from the bot (roles, members, who is in voice). Authenticated with BOT_API_TOKEN. */
export function POST(req: NextRequest) {
  return handleBotRequest(req, syncSchema, applySync);
}
