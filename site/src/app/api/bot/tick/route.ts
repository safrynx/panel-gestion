import { after, NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { runMaintenance, runReviewBatch } from "@/lib/maintenance";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/bot/tick — periodic housekeeping: close stale FiveM sessions and, on Sunday evening (each server's own
 * time zone), start that server's AI summary of the week. Called by the bot every 10 minutes; any cron can call it too.
 * The summaries run after the response is sent (`after`), in bounded batches continued by the next tick.
 */
export function POST(req: NextRequest) {
  return handleBotRequest(req, null, async () => {
    const { staleFivemClosed, stalePlayersClosed, screenshotsPruned, reviewDue } = await runMaintenance();
    if (reviewDue.length) {
      after(async () => {
        for (const server of reviewDue) {
          await runReviewBatch(server).catch((e) => console.error(`[review] ${server.id} failed:`, e instanceof Error ? e.message : e));
        }
      });
    }
    return { staleFivemClosed, stalePlayersClosed, screenshotsPruned, reviewDue: reviewDue.map((s) => s.id) };
  });
}
