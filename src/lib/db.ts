import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "./migrations";

export function resolveDbPath(raw?: string): string {
  const dbPath = raw || "./data/gtasun.sqlite";
  if (dbPath === ":memory:") return dbPath;
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}

const globalForDb = globalThis as unknown as { gtasunDb?: Database.Database };

export const db: Database.Database = (() => {
  if (globalForDb.gtasunDb) return globalForDb.gtasunDb;
  const absolutePath = resolveDbPath(process.env.DATABASE_PATH);
  if (absolutePath !== ":memory:") fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const instance = new Database(absolutePath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");
  runMigrations(instance);
  if (process.env.NODE_ENV !== "production") globalForDb.gtasunDb = instance;
  return instance;
})();
