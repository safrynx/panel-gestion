import { listStaffWithStats, type StaffWithStats } from "./sync";
import { fivemDbConfigured, getFivemPlaytimes } from "./fivem-db";
import { warnLevelFromRoles } from "./config";
import { getCountersResetAt } from "./counters";

export type StaffOverview = StaffWithStats & {
  /** Current avert level (0-3): from Discord avert roles when available, else active warnings in the panel. */
  warnLevel: number;
};

export function fivemSource(): "database" | "agent" {
  return fivemDbConfigured() ? "database" : "agent";
}

/** Merge FiveM playtime from the game database (when configured) into the staff stats. */
export async function withFivemPlaytime(staff: StaffWithStats[], since?: Date, until?: Date): Promise<StaffOverview[]> {
  const playtimes = await getFivemPlaytimes(since, until);
  return staff.map((member) => ({
    ...member,
    fivemSeconds: playtimes?.get(member.discordId) ?? member.fivemSeconds,
    warnLevel: Math.min(3, warnLevelFromRoles(member.roleIds) ?? member.activeWarnings)
  }));
}

/** Counters start at the last "reset all counters" point when there is one (never earlier than `since`). */
export function countersSince(since?: Date): Date | undefined {
  const resetAt = getCountersResetAt();
  if (!resetAt) return since;
  return !since || resetAt > since ? resetAt : since;
}

/** `applyReset: false` ignores the reset point (weekly reports always cover their full week). */
export async function getStaffOverview(since?: Date, until?: Date, applyReset = true): Promise<StaffOverview[]> {
  const effective = applyReset ? countersSince(since) : since;
  return withFivemPlaytime(listStaffWithStats(effective, until), effective, until);
}
