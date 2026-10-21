import { closeStaleFivemSessions } from "./fivem";
import { getStatusValue, setBotStatus } from "./bot-status";
import { aiConfigured, generateWeeklyReviews } from "./review";
import { isSundayFrom, weekKey, weekRange } from "./week";

const FIVEM_STALE_SECONDS = 12 * 3600;
/** AI calls per run: keeps one run well inside a serverless time limit; the next tick continues. */
const REVIEWS_PER_RUN = 15;

/** Sunday evening (community time zone), once per week: is the AI summary of the week still to be done? */
export async function reviewDue(now = new Date()): Promise<boolean> {
  if (!aiConfigured() || !isSundayFrom(Number(process.env.REVIEW_HOUR ?? 20), now)) return false;
  return (await getStatusValue("review_done")) !== weekKey(weekRange(0, now));
}

/**
 * Generate (part of) the week's AI summaries. Safe to call repeatedly: a database lock prevents overlapping runs,
 * members already reviewed are skipped, and the week is marked done only when nobody is left and nothing failed.
 */
export async function runReviewBatch(): Promise<void> {
  const key = weekKey(weekRange(0));
  const result = await generateWeeklyReviews(0, { maxMembers: REVIEWS_PER_RUN });
  if (!result.ok) return;
  console.log(`[review] week ${key}: generated=${result.generated} skipped=${result.skipped} failed=${result.failed} remaining=${result.remaining}`);
  if (result.failed === 0 && result.remaining === 0) await setBotStatus("review_done", key);
  else if (result.errors.length) console.error("[review] errors:", result.errors.join(" | "));
}

/** Periodic housekeeping, triggered by the bot's tick (or any cron hitting POST /api/bot/tick). */
export async function runMaintenance() {
  const staleFivemClosed = await closeStaleFivemSessions(FIVEM_STALE_SECONDS);
  return { staleFivemClosed, reviewDue: await reviewDue() };
}
