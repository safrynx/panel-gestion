import { NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { applyPlaytime, playtimeSchema } from "@/lib/bot-api";

export const runtime = "nodejs";

/** POST /api/bot/playtime — lifetime FiveM playtime per player, read by the bot from the game database. */
export function POST(req: NextRequest) {
  return handleBotRequest(req, playtimeSchema, applyPlaytime);
}
