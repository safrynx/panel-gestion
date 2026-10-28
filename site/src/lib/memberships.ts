import { db } from "./db";
import { fetchGuildMemberByBot, type GuildMemberFull } from "./discord";
import { listServers } from "./servers";
import { upsertStaffMember } from "./sync";
import type { Identity } from "./types";

type LookupMember = (guildId: string, discordId: string) => Promise<GuildMemberFull | null>;

/**
 * At login: for every registered server whose guild the user is in, read their roles there through the bot,
 * cache them (member_roles) and refresh their staff row. Returns how many servers were looked up.
 * `lookup` is injectable for tests.
 */
export async function refreshMemberships(identity: Identity, userGuildIds: string[], lookup: LookupMember = fetchGuildMemberByBot): Promise<number> {
  const inGuild = new Set(userGuildIds);
  const servers = (await listServers()).filter((s) => s.guildId && inGuild.has(s.guildId));
  const now = new Date().toISOString();
  await Promise.all(
    servers.map(async (server) => {
      const member = await lookup(server.guildId as string, identity.discordId);
      const roles = member?.roles ?? [];
      await db.run(
        `INSERT INTO member_roles (server_id, discord_id, roles_json, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(server_id, discord_id) DO UPDATE SET roles_json = excluded.roles_json, updated_at = excluded.updated_at`,
        [server.id, identity.discordId, JSON.stringify(roles), now]
      );
      if (member) {
        await upsertStaffMember(server.id, {
          discordId: identity.discordId,
          username: identity.username,
          avatarUrl: identity.avatarUrl,
          roleIds: roles,
          joinedAt: member.joined_at ?? null,
          presentInGuild: true
        });
      }
    })
  );
  return servers.length;
}
