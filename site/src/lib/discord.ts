export { getStaffRoleIds, getGradeMapping, resolveGradeFromRoles } from "./config";
import { storeGuildRoles } from "./roles";

const DISCORD_API = "https://discord.com/api/v10";

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
};

export type GuildMemberInfo = {
  nick: string | null;
  roles: string[];
  joined_at: string;
};

export type OAuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

export function getDiscordConfig(): { clientId: string; clientSecret: string; redirectUri: string; guildId: string } | { missing: string[] } {
  const missing: string[] = [];
  if (!process.env.DISCORD_CLIENT_ID) missing.push("DISCORD_CLIENT_ID");
  if (!process.env.DISCORD_CLIENT_SECRET) missing.push("DISCORD_CLIENT_SECRET");
  if (!process.env.DISCORD_REDIRECT_URI) missing.push("DISCORD_REDIRECT_URI");
  if (!process.env.DISCORD_GUILD_ID) missing.push("DISCORD_GUILD_ID");
  if (missing.length) return { missing };
  return {
    clientId: process.env.DISCORD_CLIENT_ID as string,
    clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
    redirectUri: process.env.DISCORD_REDIRECT_URI as string,
    guildId: process.env.DISCORD_GUILD_ID as string
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
    // guilds.members.read is required for /users/@me/guilds/{guild}/member (roles).
    scope: "identify guilds.members.read",
    state
  });
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

export async function fetchGuildMember(accessToken: string, guildId: string): Promise<GuildMemberInfo | null> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (res.status === 404) return null; // not in guild
  if (!res.ok) return null;
  return (await res.json()) as GuildMemberInfo;
}

export function avatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
}

/**
 * Add and remove roles on a guild member with the bot token (server-side only).
 * The bot role must sit above every role it touches in the guild hierarchy.
 */
export async function changeMemberRoles(
  discordId: string,
  add: string[],
  remove: string[],
  reason: string
): Promise<{ ok: true } | { ok: false; status: number }> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
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

/** Refresh the cached list of guild roles (names + positions) from Discord. Returns the count, or null on failure. */
export async function refreshGuildRoles(): Promise<number | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return null;
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${token}` } });
  if (!res.ok) return null;
  const roles = (await res.json()) as { id: string; name: string; position: number; color: number }[];
  await storeGuildRoles(roles.filter((r) => r.id !== guildId)); // @everyone has the guild id
  return roles.length;
}

export type GuildMemberFull = {
  user: DiscordUser & { bot?: boolean };
  roles: string[];
  joined_at: string | null;
  nick: string | null;
};

/** Search guild members by name prefix (bot token, server-side). Null when the bot is not usable. */
export async function searchGuildMembers(query: string): Promise<GuildMemberFull[] | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return null;
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/search?query=${encodeURIComponent(query)}&limit=10`, {
    headers: { Authorization: `Bot ${token}` }
  });
  if (!res.ok) return null;
  return (await res.json()) as GuildMemberFull[];
}

/** One guild member by ID through the bot, or null when absent / bot unusable. */
export async function fetchGuildMemberByBot(discordId: string): Promise<GuildMemberFull | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return null;
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}`, { headers: { Authorization: `Bot ${token}` } });
  if (!res.ok) return null;
  return (await res.json()) as GuildMemberFull;
}
