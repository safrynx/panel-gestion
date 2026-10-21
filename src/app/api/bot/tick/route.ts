import { NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { runMaintenance } from "@/lib/maintenance";

export const runtime = "nodejs";

/**
 * POST /api/bot/tick — periodic housekeeping: close stale FiveM sessions, snapshot FiveM playtime,
 * start the Sunday AI review. Called by the bot every 10 minutes; any cron can call it too.
 */
export function POST(req: NextRequest) {
  return handleBotRequest(req, null, () => runMaintenance());
}
