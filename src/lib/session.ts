import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { Database } from "better-sqlite3";

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export type SessionPayload = {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  roles: string[];
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Encode a session as `<payload-b64url>.<hmac>` */
export function encodeSession(payload: Omit<SessionPayload, "issuedAt" | "expiresAt" | "nonce">): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = {
    ...payload,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url")
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const mac = sign(body);
  return `${body}.${mac}`;
}

export function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!safeEqual(sign(body), mac)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.discordId || typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Generate a random state for OAuth CSRF protection. */
export function generateState(): string {
  return randomBytes(24).toString("base64url");
}

export const sessionCookieName = "gtasun_session";
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

/**
 * Persist OAuth state so the callback can verify it (defense against CSRF).
 * Stored in SQLite keyed by the state value, single-use.
 */
export function storeState(db: Database, state: string): void {
  db.prepare("INSERT INTO oauth_states (state) VALUES (?)").run(state);
  // Prune entries older than 15 minutes
  db.prepare("DELETE FROM oauth_states WHERE created_at < datetime('now', '-15 minutes')").run();
}

export function verifyAndConsumeState(db: Database, state: string | null): boolean {
  if (!state) return false;
  const result = db
    .prepare("DELETE FROM oauth_states WHERE state = ? AND created_at >= datetime('now', '-15 minutes')")
    .run(state);
  return result.changes === 1;
}
