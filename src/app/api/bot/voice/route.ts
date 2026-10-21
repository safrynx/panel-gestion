import { NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { applyVoice, voiceEventSchema } from "@/lib/bot-api";

export const runtime = "nodejs";

/** POST /api/bot/voice — a voice join / leave / move. Authenticated with BOT_API_TOKEN. */
export function POST(req: NextRequest) {
  return handleBotRequest(req, voiceEventSchema, applyVoice);
}
