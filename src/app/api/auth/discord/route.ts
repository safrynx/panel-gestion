import { NextResponse } from "next/server";
import { buildAuthorizeUrl, getDiscordConfig } from "@/lib/discord";
import { generateState, storeState } from "@/lib/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const config = getDiscordConfig();
  if ("missing" in config) {
    return NextResponse.redirect(
      new URL(`/login?error=missing_config&missing=${encodeURIComponent(config.missing.join(","))}`, process.env.APP_URL || "http://localhost:3000")
    );
  }
  const state = generateState();
  storeState(db, state);
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
