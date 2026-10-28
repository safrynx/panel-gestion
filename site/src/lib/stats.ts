import { listStaffWithStats, type StaffWithStats } from "./sync";
import { getFivemPlaytimes, playtimeAvailable } from "./playtime";
import { loadConfig, warnLevelIn } from "./config";
import { getCountersResetAt } from "./counters";

export type StaffOverview = StaffWithStats & {
  /** Current avert level (0-3): from Discord avert roles when available, else active warnings in the panel. */
  warnLevel: number;
};

/** Where a server's FiveM time comes from: its game database (pushed by the bot) once available, else its FiveM agent. */
export async function fivemSource(serverId: string): Promise<"database" | "agent"> {
  return (await playtimeAvailable(serverId)) ? "database" : "agent";
}

/** Merge FiveM playtime from the game database (when available) into the staff stats. */
export async function withFivemPlaytime(serverId: string, staff: StaffWithStats[], since?: Date, until?: Date): Promise<StaffOverview[]> {
  const [playtimes, cfg] = await Promise.all([getFivemPlaytimes(serverId, since, until), loadConfig(serverId)]);
  return staff.map((member) => ({
    ...member,
    fivemSeconds: playtimes?.get(member.discordId) ?? member.fivemSeconds,
    warnLevel: Math.min(3, warnLevelIn(cfg, member.roleIds) ?? member.activeWarnings)
  }));
}

/** Counters start at the server's last "reset all counters" point when there is one (never earlier than `since`). */
export async function countersSince(serverId: string, since?: Date): Promise<Date | undefined> {
  const resetAt = await getCountersResetAt(serverId);
  if (!resetAt) return since;
  return !since || resetAt > since ? resetAt : since;
}

/** `applyReset: false` ignores the reset point (weekly reports always cover their full week). */
export async function getStaffOverview(serverId: string, since?: Date, until?: Date, applyReset = true): Promise<StaffOverview[]> {
  const effective = applyReset ? await countersSince(serverId, since) : since;
  return withFivemPlaytime(serverId, await listStaffWithStats(serverId, effective, until), effective, until);
}
