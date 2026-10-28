import { listStaffWithStats, type StaffWithStats } from "./sync";
import { getFivemPlaytimes, playtimeAvailable } from "./playtime";
import { loadConfig, warnLevelIn } from "./config";
import { getCountersResetAt } from "./counters";

export type StaffOverview = StaffWithStats & {
  /** Current avert level (0-3): from Discord avert roles when available, else active warnings in the panel. */
  warnLevel: number;
};

/** Where FiveM time comes from: the game database (pushed by the bot) once available, else the FiveM agent. */
export async function fivemSource(): Promise<"database" | "agent"> {
  return (await playtimeAvailable()) ? "database" : "agent";
}

/** Merge FiveM playtime from the game database (when available) into the staff stats. */
export async function withFivemPlaytime(staff: StaffWithStats[], since?: Date, until?: Date): Promise<StaffOverview[]> {
  const [playtimes, cfg] = await Promise.all([getFivemPlaytimes(since, until), loadConfig()]);
  return staff.map((member) => ({
    ...member,
    fivemSeconds: playtimes?.get(member.discordId) ?? member.fivemSeconds,
    warnLevel: Math.min(3, warnLevelIn(cfg, member.roleIds) ?? member.activeWarnings)
  }));
}

/** Counters start at the last "reset all counters" point when there is one (never earlier than `since`). */
export async function countersSince(since?: Date): Promise<Date | undefined> {
  const resetAt = await getCountersResetAt();
  if (!resetAt) return since;
  return !since || resetAt > since ? resetAt : since;
}

/** `applyReset: false` ignores the reset point (weekly reports always cover their full week). */
export async function getStaffOverview(since?: Date, until?: Date, applyReset = true): Promise<StaffOverview[]> {
  const effective = applyReset ? await countersSince(since) : since;
  return withFivemPlaytime(await listStaffWithStats(effective, until), effective, until);
}
