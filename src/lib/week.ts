/**
 * Weeks run Monday 00:00 to Sunday 24:00 in the community's time zone (APP_TIMEZONE, default Europe/Paris),
 * whatever the server's own zone is: serverless hosts run in UTC.
 */

export type WeekRange = {
  start: Date;
  end: Date;
  partial: boolean;
  label: string;
  /** The week's Monday as YYYY-MM-DD in the community's time zone. */
  key: string;
};

export const timeZone = () => process.env.APP_TIMEZONE || "Europe/Paris";

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

/** Calendar fields of `date` in the community's zone (weekday: Monday = 0). */
export function zonedParts(date: Date, tz = timeZone()): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short"
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour: Number(get("hour")), minute: Number(get("minute")), weekday: WEEKDAYS[get("weekday")] ?? 0
  };
}

function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** The instant at which the zone's clock shows 00:00 on the given calendar day (handles daylight saving). */
export function zonedMidnight(year: number, month: number, day: number, tz = timeZone()): Date {
  const guess = Date.UTC(year, month - 1, day);
  let instant = guess - offsetMs(new Date(guess), tz);
  instant = guess - offsetMs(new Date(instant), tz); // second pass near a daylight-saving change
  return new Date(instant);
}

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dayLabel = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;

/** The week `offset` weeks ago (0 = the current week, up to "now"). */
export function weekRange(offset: number, now = new Date()): WeekRange {
  const tz = timeZone();
  const p = zonedParts(now, tz);
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - p.weekday - offset * 7)); // pure calendar arithmetic
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);

  const start = zonedMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), tz);
  const fullEnd = zonedMidnight(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate(), tz);
  const partial = fullEnd.getTime() > now.getTime();
  return { start, end: partial ? now : fullEnd, partial, label: `du ${dayLabel(monday)} au ${dayLabel(sunday)}`, key: keyOf(monday) };
}

/** Stable key for a week: its Monday. */
export function weekKey(range: WeekRange): string {
  return range.key;
}

/** True on Sunday, from `hour` o'clock, in the community's zone. */
export function isSundayFrom(hour: number, now = new Date()): boolean {
  const p = zonedParts(now);
  return p.weekday === 6 && p.hour >= hour;
}

/** SQLite CURRENT_TIMESTAMP format ("YYYY-MM-DD HH:MM:SS", UTC). */
export function toSqlUtc(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}
