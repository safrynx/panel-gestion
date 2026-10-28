import { NextRequest, NextResponse } from "next/server";
import { avatarUrl, exchangeCode, fetchDiscordUser, fetchUserGuildIds, getDiscordConfig } from "@/lib/discord";
import { listAccessibleServers } from "@/lib/auth";
import { isPlatformOwner } from "@/lib/config";
import { refreshMemberships } from "@/lib/memberships";
import { encodeSession, sessionCookieName, SESSION_MAX_AGE, verifyAndConsumeState } from "@/lib/session";

export const runtime = "nodejs";

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

function fail(error: string, extra = "") {
  return NextResponse.redirect(`${appUrl()}/login?error=${error}${extra}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const config = getDiscordConfig();

  if ("missing" in config) return fail("missing_config", `&missing=${encodeURIComponent(config.missing.join(","))}`);
  if (url.searchParams.get("error")) return fail("access_denied");

  // CSRF: state must exist, be single-use, and not be expired.
  if (!code || !(await verifyAndConsumeState(state))) return fail("invalid_state");

  const token = await exchangeCode(code);
  if (!token?.access_token) return fail("oauth_exchange");

  const user = await fetchDiscordUser(token.access_token);
  if (!user) return fail("oauth_identity");
  const guildIds = await fetchUserGuildIds(token.access_token);
  if (!guildIds) return fail("oauth_identity");

  const identity = { discordId: user.id, username: user.global_name || user.username, avatarUrl: avatarUrl(user) };
  // Fresh roles on every registered server the user is in, before deciding where they may go.
  await refreshMemberships(identity, guildIds);
  const servers = await listAccessibleServers(identity);
  if (!servers.length && !isPlatformOwner(identity.discordId)) return fail("forbidden");

  // One server: straight to it. Several (or a platform owner): the server list.
  const res = NextResponse.redirect(`${appUrl()}${servers.length === 1 ? `/s/${servers[0].id}` : "/"}`);
  res.cookies.set(sessionCookieName, encodeSession(identity), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/"
  });
  return res;
}
