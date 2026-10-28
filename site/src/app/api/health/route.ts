import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Variables the site cannot work without (names only: values are never exposed). */
const REQUIRED = [
  "SESSION_SECRET", "APP_URL", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI",
  "DISCORD_BOT_TOKEN", "BOT_API_TOKEN"
];

/**
 * GET /api/health — is the site configured and is the database reachable?
 * Open it right after a deployment: a 503 lists what is missing instead of a blank "500".
 */
export async function GET() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if ((process.env.SESSION_SECRET ?? "").length > 0 && (process.env.SESSION_SECRET ?? "").length < 32) missing.push("SESSION_SECRET (min. 32 caractères)");
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    for (const name of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) if (!process.env[name]) missing.push(name);
  }

  let database: "ok" | string = "ok";
  try {
    await db.get("SELECT 1 AS ok");
  } catch (error) {
    database = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 200);
  }

  const ok = missing.length === 0 && database === "ok";
  return NextResponse.json({ ok, app: "fiverax", missingEnv: missing, database }, { status: ok ? 200 : 503 });
}
