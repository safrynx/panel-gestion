import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Client, InArgs, ResultSet } from "@libsql/client";
import { runMigrations } from "./migrations";

/**
 * Database access through libSQL (SQLite-compatible): Turso in production (serverless friendly),
 * a local SQLite file in development and tests.
 *
 *   TURSO_DATABASE_URL   libsql://<db>-<org>.turso.io          (production)
 *   TURSO_AUTH_TOKEN     token of that database
 *   (unset)              local file ./data/gtasun.sqlite, or DATABASE_PATH if set (never on Vercel)
 *
 * Every call is asynchronous. Use `batch` for several writes that must succeed or fail together,
 * and to save network round trips: each call to a remote database costs one.
 */

export type Stmt = { sql: string; args?: InArgs };
export type Row = Record<string, unknown>;
export type BatchResult = { rows: Row[]; changes: number };

const globalForDb = globalThis as unknown as { gtasunClient?: Promise<Client>; gtasunReady?: Promise<void> };

function localUrl(): string {
  const raw = process.env.DATABASE_PATH || "./data/gtasun.sqlite";
  if (raw === ":memory:") return ":memory:";
  const absolute = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return pathToFileURL(absolute).href;
}

async function createDbClient(): Promise<Client> {
  const remote = process.env.TURSO_DATABASE_URL;
  if (remote) {
    // The "web" build talks to Turso over HTTPS and contains no native code, so it runs on any serverless host.
    const { createClient } = await import("@libsql/client/web");
    return createClient({ url: remote, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  if (process.env.VERCEL) {
    // Vercel's file system is read-only / ephemeral: a local SQLite file can never work there.
    throw new Error("TURSO_DATABASE_URL is not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project's environment variables, then redeploy.");
  }
  const { createClient } = await import("@libsql/client");
  return createClient({ url: localUrl() });
}

function client(): Promise<Client> {
  if (!globalForDb.gtasunClient) {
    globalForDb.gtasunClient = createDbClient().catch((error) => {
      globalForDb.gtasunClient = undefined; // retry on the next call
      throw error;
    });
  }
  return globalForDb.gtasunClient;
}

/** Create / upgrade the schema once per server instance, before the first query. */
function ready(): Promise<Client> {
  if (!globalForDb.gtasunReady) {
    globalForDb.gtasunReady = client()
      .then((c) => runMigrations(c))
      .catch((error) => {
        globalForDb.gtasunReady = undefined; // retry on the next call
        throw error;
      });
  }
  return globalForDb.gtasunReady.then(client);
}

const toRows = (rs: ResultSet): Row[] => rs.rows.map((row) => Object.fromEntries(rs.columns.map((column, i) => [column, row[i]])));

export function stmt(sql: string, args?: InArgs): Stmt {
  return { sql, args };
}

export const db = {
  async all<T = Row>(sql: string, args?: InArgs): Promise<T[]> {
    const c = await ready();
    return toRows(await c.execute({ sql, args: args ?? [] })) as T[];
  },

  async get<T = Row>(sql: string, args?: InArgs): Promise<T | undefined> {
    return (await db.all<T>(sql, args))[0];
  },

  async run(sql: string, args?: InArgs): Promise<{ changes: number; lastId: number | null }> {
    const c = await ready();
    const rs = await c.execute({ sql, args: args ?? [] });
    return { changes: rs.rowsAffected, lastId: rs.lastInsertRowid === undefined ? null : Number(rs.lastInsertRowid) };
  },

  /** Run statements in one round trip; writes are atomic (all applied, or none). */
  async batch(statements: Stmt[], mode: "write" | "read" = "write"): Promise<BatchResult[]> {
    if (statements.length === 0) return [];
    const c = await ready();
    const results = await c.batch(statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })), mode);
    return results.map((rs) => ({ rows: toRows(rs), changes: rs.rowsAffected }));
  }
};

/** Underlying client, for scripts and tests (the schema is guaranteed to exist). */
export async function rawClient(): Promise<Client> {
  return ready();
}
