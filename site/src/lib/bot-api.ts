import { z } from "zod";
import { clearBotHeartbeat, setServerStatus } from "./bot-status";
import { storePlaytimeTotals } from "./playtime";
import { storeGuildRoles } from "./roles";
import { getServerByGuild, listServers, type Server } from "./servers";
import { syncStaffMembers, upsertStaffMember } from "./sync";
import { closeAllVoiceSessions, closeVoiceSession, moveVoiceSession, openVoiceSession, reconcileVoiceSessions } from "./voice";

/**
 * Operations the Discord bot (a separate project, hosted elsewhere) asks the site to perform.
 * One bot serves every server: each message names the Discord guild it is about, and the site maps it to the
 * registered server. Messages about a guild no server uses are ignored.
 * The bot never touches the database: it reports what it sees on Discord (and in the game databases),
 * the site stores it.
 */

const snowflake = z.string().regex(/^\d{17,20}$/);
const roleIds = z.array(snowflake).max(250);

export const memberSchema = z.object({
  guildId: snowflake,
  discordId: snowflake,
  username: z.string().max(200),
  avatarUrl: z.string().max(500).nullable(),
  roleIds,
  joinedAt: z.string().max(40).nullable(),
  /** false when the member left the guild */
  present: z.boolean().default(true)
});

const memberOfSync = memberSchema.omit({ guildId: true });

export const syncSchema = z.object({
  guildId: snowflake,
  roles: z.array(z.object({ id: snowflake, name: z.string().max(200), position: z.number().int(), color: z.number().int() })).max(1000),
  members: z.array(memberOfSync).max(100_000),
  /** Everyone currently in a voice channel */
  voice: z.array(z.object({ discordId: snowflake, channelId: snowflake, roleIds })).max(10_000),
  topRolePosition: z.number().int().nullable().optional()
});

export const voiceEventSchema = z.object({
  guildId: snowflake,
  action: z.enum(["join", "leave", "move"]),
  discordId: snowflake,
  channelId: snowflake.optional(),
  roleIds: roleIds.default([]),
  at: z.string().datetime().optional()
});

/** The guilds the bot is connected to, with its highest role position in each. */
export const heartbeatSchema = z.object({
  guilds: z.array(z.object({ guildId: snowflake, topRolePosition: z.number().int().nullable().optional() })).max(1000)
});

/** Lifetime playtime per Discord id, read by the bot from one server's game database. */
export const playtimeSchema = z.object({
  guildId: snowflake,
  totals: z.array(z.object({ discordId: snowflake, seconds: z.number().int().min(0).max(10_000_000_000) })).max(100_000)
});

type Sync = z.infer<typeof syncSchema>;
type Member = z.infer<typeof memberOfSync>;
type MemberEvent = z.infer<typeof memberSchema>;
type VoiceEvent = z.infer<typeof voiceEventSchema>;
type Heartbeat = z.infer<typeof heartbeatSchema>;
type Playtime = z.infer<typeof playtimeSchema>;

const IGNORED = { ignored: "unknown_guild" } as const;

const toSynced = (m: Member) => ({
  discordId: m.discordId,
  username: m.username,
  avatarUrl: m.avatarUrl,
  roleIds: m.roleIds,
  joinedAt: m.joinedAt,
  presentInGuild: m.present
});

async function markAlive(server: Server, topRolePosition?: number | null): Promise<void> {
  await setServerStatus(server.id, "heartbeat", new Date().toISOString()); // site clock: the bot's clock does not matter
  if (typeof topRolePosition === "number") await setServerStatus(server.id, "top_role_position", String(topRolePosition));
}

/** Guilds the bot should watch: those of the registered servers. */
export async function registeredGuilds() {
  const servers = await listServers();
  return { guilds: servers.filter((s) => s.guildId).map((s) => ({ guildId: s.guildId as string, serverId: s.id, name: s.name })) };
}

export async function recordHeartbeat(data: Heartbeat) {
  let known = 0;
  for (const guild of data.guilds) {
    const server = await getServerByGuild(guild.guildId);
    if (!server) continue;
    await markAlive(server, guild.topRolePosition);
    known++;
  }
  return { servers: known };
}

/** Full snapshot of one guild: roles, all members, and who is in voice right now. */
export async function applySync(data: Sync) {
  const server = await getServerByGuild(data.guildId);
  if (!server) return IGNORED;
  await storeGuildRoles(server.id, data.roles.filter((r) => r.name !== "@everyone"));
  const members = await syncStaffMembers(server.id, data.members.map(toSynced), "bot");
  const voice = await reconcileVoiceSessions(server.id, data.voice, new Date());
  await markAlive(server, data.topRolePosition);
  return { serverId: server.id, members, voice };
}

export async function applyMember(data: MemberEvent) {
  const server = await getServerByGuild(data.guildId);
  if (!server) return IGNORED;
  return { result: await upsertStaffMember(server.id, toSynced(data)) };
}

export async function applyVoice(data: VoiceEvent) {
  const server = await getServerByGuild(data.guildId);
  if (!server) return IGNORED;
  const at = data.at ? new Date(data.at) : new Date();
  if (data.action === "leave") await closeVoiceSession(server.id, data.discordId, at);
  else if (!data.channelId) throw new Error("channelId required");
  else if (data.action === "join") await openVoiceSession(server.id, data.discordId, data.roleIds, data.channelId, at);
  else await moveVoiceSession(server.id, data.discordId, data.roleIds, data.channelId, at);
  return { ok: true };
}

export async function applyPlaytime(data: Playtime) {
  const server = await getServerByGuild(data.guildId);
  if (!server) return IGNORED;
  return storePlaytimeTotals(server.id, data.totals);
}

/** The bot is going down cleanly: close every open voice session (all servers) and drop the heartbeats. */
export async function applyShutdown() {
  const closed = await closeAllVoiceSessions(new Date());
  await clearBotHeartbeat();
  return { closed };
}
