import { NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { applyMember, memberSchema } from "@/lib/bot-api";

export const runtime = "nodejs";

/** POST /api/bot/member — one member joined / changed roles / left. Authenticated with BOT_API_TOKEN. */
export function POST(req: NextRequest) {
  return handleBotRequest(req, memberSchema, applyMember);
}
