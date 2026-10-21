import { NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { applyShutdown } from "@/lib/bot-api";

export const runtime = "nodejs";

/** POST /api/bot/shutdown — the bot stops cleanly: close open voice sessions. Authenticated with BOT_API_TOKEN. */
export function POST(req: NextRequest) {
  return handleBotRequest(req, null, () => applyShutdown());
}
