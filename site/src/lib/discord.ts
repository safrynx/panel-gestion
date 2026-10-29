import { storeGuildRoles } from "./roles";

const DISCORD_API = "https://discord.com/api/v10";

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
};

export type OAuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

export function getDiscordConfig(): { clientId: string; clientSecret: string; redirectUri: string } | { missing: string[] } {
  const missing: string[] = [];
  if (!process.env.DISCORD_CLIENT_ID) missing.push("DISCORD_CLIENT_ID");
  if (!process.env.DISCORD_CLIENT_SECRET) missing.push("DISCORD_CLIENT_SECRET");
  if (!process.env.DISCORD_REDIRECT_URI) missing.push("DISCORD_REDIRECT_URI");
  if (missing.length) return { missing };
  return {
    clientId: process.env.DISCORD_CLIENT_ID as string,
    clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
    redirectUri: process.env.DISCORD_REDIRECT_URI as string
  };
}

/** Build the OAuth2 authorize URL with the given state. */
export function buildAuthorizeUrl(state: string): string {
  const config = getDiscordConfig();
  if ("missing" in config) throw new Error("Discord config missing");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    // guilds: one call lists the user's guilds, so login only looks up the registered servers they are actually in.
    scope: "identify guilds",
    state
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Link that adds the shared bot to a guild as Administrator (grades, averts, and the anti-raid which restores roles, channels, bans…). */
export function botInviteUrl(guildId?: string | null): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({ client_id: clientId, scope: "bot", permissions: "8" });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<OAuthTokenResponse | null> {
  const config = getDiscordConfig();
  if ("missing" in config) return null;
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri
    })
  });
  if (!res.ok) return null;
  return (await res.json()) as OAuthTokenResponse;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser | null> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return (await res.json()) as DiscordUser;
}

export type UserGuild = { id: string; name: string; iconUrl: string | null; canManage: boolean };

type RawUserGuild = { id: string; name: string; icon: string | null; owner?: boolean; permissions?: string };

// Permission bits (the bitfield is a decimal string that can exceed 2^53, hence BigInt).
const ADMINISTRATOR = BigInt(0x8);
const MANAGE_GUILD = BigInt(0x20);
const NONE = BigInt(0);

/** Pure: may this user register the guild? Owner, Administrator or Manage Server (the usual rule of Discord dashboards). */
export function canManageGuild(guild: { owner?: boolean; permissions?: string }): boolean {
  if (guild.owner) return true;
  try {
    const bits = BigInt(guild.permissions ?? "0");
    return (bits & ADMINISTRATOR) !== NONE || (bits & MANAGE_GUILD) !== NONE;
  } catch {
    return false;
  }
}

export function guildIconUrl(id: string, icon: string | null): string | null {
  return icon ? `https://cdn.discordapp.com/icons/${id}/${icon}.${icon.startsWith("a_") ? "gif" : "png"}?size=128` : null;
}

/** The guilds the user is in, with whether they can manage each (OAuth `guilds` scope), or null on failure. */
export async function fetchUserGuilds(accessToken: string): Promise<UserGuild[] | null> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds?limit=200`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return ((await res.json()) as RawUserGuild[]).map((g) => ({ id: g.id, name: g.name, iconUrl: guildIconUrl(g.id, g.icon), canManage: canManageGuild(g) }));
}

export function avatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
}

const botToken = () => process.env.DISCORD_BOT_TOKEN;

/**
 * Add and remove roles on a guild member with the bot token (server-side only).
 * The bot role must sit above every role it touches in the guild hierarchy.
 */
export async function changeMemberRoles(
  guildId: string | null,
  discordId: string,
  add: string[],
  remove: string[],
  reason: string
): Promise<{ ok: true } | { ok: false; status: number }> {
  const token = botToken();
  if (!token || !guildId) return { ok: false, status: 0 };
  const headers = {
    Authorization: `Bot ${token}`,
    // Shown in the Discord audit log; header values must be URI-encoded.
    "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 400))
  };
  const base = `${DISCORD_API}/guilds/${guildId}/members/${discordId}/roles`;
  for (const roleId of add) {
    const res = await fetch(`${base}/${roleId}`, { method: "PUT", headers });
    if (!res.ok) return { ok: false, status: res.status };
  }
  for (const roleId of remove) {
    const res = await fetch(`${base}/${roleId}`, { method: "DELETE", headers });
    if (!res.ok) return { ok: false, status: res.status };
  }
  return { ok: true };
}

/** Refresh a server's cached list of guild roles (names + positions) from Discord. Returns the count, or null on failure. */
export async function refreshGuildRoles(serverId: string, guildId: string | null): Promise<number | null> {
  const token = botToken();
  if (!token || !guildId) return null;
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${token}` } });
  if (!res.ok) return null;
  const roles = (await res.json()) as { id: string; name: string; position: number; color: number }[];
  await storeGuildRoles(serverId, roles.filter((r) => r.id !== guildId)); // @everyone has the guild id
  return roles.length;
}

export type GuildMemberFull = {
  user: DiscordUser & { bot?: boolean };
  roles: string[];
  joined_at: string | null;
  nick: string | null;
};

/** Search guild members by name prefix (bot token, server-side). Null when the bot is not usable. */
export async function searchGuildMembers(guildId: string | null, query: string): Promise<GuildMemberFull[] | null> {
  const token = botToken();
  if (!token || !guildId) return null;
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/search?query=${encodeURIComponent(query)}&limit=10`, {
    headers: { Authorization: `Bot ${token}` }
  });
  if (!res.ok) return null;
  return (await res.json()) as GuildMemberFull[];
}

/** One guild member by ID through the bot, or null when absent / bot unusable. */
export async function fetchGuildMemberByBot(guildId: string | null, discordId: string): Promise<GuildMemberFull | null> {
  const token = botToken();
  if (!token || !guildId) return null;
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}`, { headers: { Authorization: `Bot ${token}` } });
  if (!res.ok) return null;
  return (await res.json()) as GuildMemberFull;
}

type PartialGuildMember = {
  user?: { id: string; username: string; global_name?: string | null; avatar: string | null; bot?: boolean };
  roles: string[];
  joined_at?: string;
};

/** Every (non-bot) member of a guild, paged 1000 at a time. Null when the bot cannot read the guild. */
export async function fetchAllGuildMembers(guildId: string | null) {
  const token = botToken();
  if (!token || !guildId) return null;
  const members: { discordId: string; username: string; avatarUrl: string | null; roleIds: string[]; joinedAt: string | null; presentInGuild: boolean }[] = [];
  let after = "0";
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`, { headers: { Authorization: `Bot ${token}` } });
    if (!res.ok) return null;
    const batch = (await res.json()) as PartialGuildMember[];
    if (!batch.length) break;
    for (const m of batch) {
      if (!m.user || m.user.bot) continue;
      members.push({
        discordId: m.user.id,
        username: m.user.global_name || m.user.username,
        avatarUrl: avatarUrl(m.user),
        roleIds: m.roles ?? [],
        joinedAt: m.joined_at ?? null,
        presentInGuild: true
      });
    }
    after = batch[batch.length - 1].user!.id;
    if (batch.length < 1000) break;
  }
  return members;
}
