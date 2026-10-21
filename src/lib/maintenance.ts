import { closeStaleFivemSessions } from "./fivem";
import { getFivemPlaytimes } from "./fivem-db";
import { getStatusValue, setBotStatus } from "./bot-status";
import { aiConfigured, generateWeeklyReviews } from "./review";
import { weekKey, weekRange } from "./week";

const FIVEM_STALE_SECONDS = 12 * 3600;

let reviewRunning = false;

/**
 * Sunday evening: have the AI summarise the week's comments, once per week (failed members are retried
 * on the next tick). Runs in the background: it can take minutes on a free AI tier.
 */
export function maybeStartSundayReview(now = new Date()): boolean {
  const hour = Number(process.env.REVIEW_HOUR ?? 20);
  if (reviewRunning || now.getDay() !== 0 || now.getHours() < hour || !aiConfigured()) return false;
  const key = weekKey(weekRange(0, now));
  if (getStatusValue("review_done") === key) return false;

  reviewRunning = true;
  void generateWeeklyReviews(0)
    .then((result) => {
      if (!result.ok) return;
      console.log(`[review] week ${key}: generated=${result.generated} skipped=${result.skipped} failed=${result.failed}`);
      if (result.failed === 0) setBotStatus("review_done", key);
      else console.error("[review] errors:", result.errors.join(" | "));
    })
    .catch((error) => console.error("[review] failed:", error instanceof Error ? error.message : error))
    .finally(() => { reviewRunning = false; });
  return true;
}

/** Periodic housekeeping, triggered by the bot's tick (or any cron hitting POST /api/bot/tick). */
export async function runMaintenance() {
  const staleFivemClosed = closeStaleFivemSessions(FIVEM_STALE_SECONDS);
  const totals = await getFivemPlaytimes(); // also records playtime snapshots
  const reviewStarted = maybeStartSundayReview();
  return { staleFivemClosed, fivemPlayersRead: totals?.size ?? null, reviewStarted };
}
