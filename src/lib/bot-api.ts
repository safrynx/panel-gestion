import { z } from "zod";
import { clearBotHeartbeat, setBotStatus } from "./bot-status";
import { storePlaytimeTotals } from "./playtime";
import { storeGuildRoles } from "./roles";
import { syncStaffMembers, upsertStaffMember } from "./sync";
import { closeAllVoiceSessions, closeVoiceSession, moveVoiceSession, openVoiceSession, reconcileVoiceSessions } from "./voice";

/**
 * Operations the Discord bot (a separate project, hosted elsewhere) asks the site to perform.
 * The bot never touches the database: it reports what it sees on Discord (and in the game database),
 * the site stores it.
 */

const snowflake = z.string().regex(/^\d{17,20}$/);
const roleIds = z.array(snowflake).max(250);

export const memberSchema = z.object({
  discordId: snowflake,
  username: z.string().max(200),
  avatarUrl: z.string().max(500).nullable(),
  roleIds,
  joinedAt: z.string().max(40).nullable(),
  /** false when the member left the guild */
  present: z.boolean().default(true)
});

export const syncSchema = z.object({
  roles: z.array(z.object({ id: snowflake, name: z.string().max(200), position: z.number().int(), color: z.number().int() })).max(1000),
  members: z.array(memberSchema).max(100_000),
  /** Everyone currently in a voice channel */
  voice: z.array(z.object({ discordId: snowflake, channelId: snowflake, roleIds })).max(10_000),
  topRolePosition: z.number().int().nullable().optional()
});

export const voiceEventSchema = z.object({
  action: z.enum(["join", "leave", "move"]),
  discordId: snowflake,
  channelId: snowflake.optional(),
  roleIds: roleIds.default([]),
  at: z.string().datetime().optional()
});

export const heartbeatSchema = z.object({ topRolePosition: z.number().int().nullable().optional() });

/** Lifetime playtime per Discord id, read by the bot from the game server's database. */
export const playtimeSchema = z.object({
  totals: z.array(z.object({ discordId: snowflake, seconds: z.number().int().min(0).max(10_000_000_000) })).max(100_000)
});

type Sync = z.infer<typeof syncSchema>;
type Member = z.infer<typeof memberSchema>;
type VoiceEvent = z.infer<typeof voiceEventSchema>;
type Playtime = z.infer<typeof playtimeSchema>;

const toSynced = (m: Member) => ({
  discordId: m.discordId,
  username: m.username,
  avatarUrl: m.avatarUrl,
  roleIds: m.roleIds,
  joinedAt: m.joinedAt,
  presentInGuild: m.present
});

export async function recordHeartbeat(topRolePosition?: number | null): Promise<void> {
  await setBotStatus("heartbeat", new Date().toISOString()); // site clock: the bot's clock does not matter
  if (typeof topRolePosition === "number") await setBotStatus("top_role_position", String(topRolePosition));
}

/** Full snapshot: guild roles, all members, and who is in voice right now. */
export async function applySync(data: Sync) {
  await storeGuildRoles(data.roles.filter((r) => r.name !== "@everyone"));
  const members = await syncStaffMembers(data.members.map(toSynced), "bot");
  const voice = await reconcileVoiceSessions(data.voice, new Date());
  await recordHeartbeat(data.topRolePosition);
  return { members, voice };
}

export async function applyMember(data: Member) {
  return { result: await upsertStaffMember(toSynced(data)) };
}

export async function applyVoice(data: VoiceEvent) {
  const at = data.at ? new Date(data.at) : new Date();
  if (data.action === "leave") await closeVoiceSession(data.discordId, at);
  else if (!data.channelId) throw new Error("channelId required");
  else if (data.action === "join") await openVoiceSession(data.discordId, data.roleIds, data.channelId, at);
  else await moveVoiceSession(data.discordId, data.roleIds, data.channelId, at);
  return { ok: true };
}

export async function applyPlaytime(data: Playtime) {
  return storePlaytimeTotals(data.totals);
}

/** The bot is going down cleanly: close every open voice session and drop the heartbeat. */
export async function applyShutdown() {
  const closed = await closeAllVoiceSessions(new Date());
  await clearBotHeartbeat();
  return { closed };
}
