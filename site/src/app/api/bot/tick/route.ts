import { after, NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { runMaintenance, runReviewBatch } from "@/lib/maintenance";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/bot/tick — periodic housekeeping: close stale FiveM sessions and, on Sunday evening,
 * start the AI summary of the week. Called by the bot every 10 minutes; any cron can call it too.
 * The summary runs after the response is sent (`after`), in bounded batches continued by the next tick.
 */
export function POST(req: NextRequest) {
  return handleBotRequest(req, null, async () => {
    const result = await runMaintenance();
    if (result.reviewDue) after(() => runReviewBatch().catch((e) => console.error("[review] failed:", e instanceof Error ? e.message : e)));
    return result;
  });
}
