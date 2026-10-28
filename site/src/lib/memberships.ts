import { db, stmt } from "./db";
import { fetchGuildMemberByBot, type GuildMemberFull, type UserGuild } from "./discord";
import { listServers } from "./servers";
import { upsertStaffMember } from "./sync";
import type { Identity } from "./types";

type LookupMember = (guildId: string, discordId: string) => Promise<GuildMemberFull | null>;

/** At login: replace the cached list of the user's guilds (which ones they may register as a server). */
export async function storeUserGuilds(discordId: string, guilds: UserGuild[]): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    stmt("DELETE FROM user_guilds WHERE discord_id = ?", [discordId]),
    ...guilds.map((g) =>
      stmt("INSERT INTO user_guilds (discord_id, guild_id, name, icon_url, can_manage, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [
        discordId, g.id, g.name.slice(0, 100), g.iconUrl, g.canManage ? 1 : 0, now
      ])
    )
  ]);
}

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
