import { NextRequest, NextResponse } from "next/server";
import { avatarUrl, exchangeCode, fetchDiscordUser, fetchGuildMember, getDiscordConfig } from "@/lib/discord";
import { hasPanelAccess } from "@/lib/config";
import { encodeSession, sessionCookieName, SESSION_MAX_AGE, verifyAndConsumeState } from "@/lib/session";
import { upsertStaffMember } from "@/lib/sync";
import { db } from "@/lib/db";

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
  if (!code || !verifyAndConsumeState(db, state)) return fail("invalid_state");

  const token = await exchangeCode(code);
  if (!token?.access_token) return fail("oauth_exchange");

  const user = await fetchDiscordUser(token.access_token);
  if (!user) return fail("oauth_identity");

  const member = await fetchGuildMember(token.access_token, config.guildId);
  if (!member) return fail("not_in_guild");

  if (!hasPanelAccess(user.id, member.roles)) return fail("forbidden");

  const username = user.global_name || user.username;
  const avatar = avatarUrl(user);
  // Make sure the member exists in the DB right away with fresh roles/grade.
  upsertStaffMember({
    discordId: user.id,
    username,
    avatarUrl: avatar,
    roleIds: member.roles,
    joinedAt: member.joined_at ?? null,
    presentInGuild: true
  });

  const res = NextResponse.redirect(`${appUrl()}/`);
  res.cookies.set(sessionCookieName, encodeSession({ discordId: user.id, username, avatarUrl: avatar, roles: member.roles }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/"
  });
  return res;
}
