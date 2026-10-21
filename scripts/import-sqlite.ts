/**
 * Copy an existing SQLite file (the old data/gtasun.sqlite) into the configured database (Turso).
 *
 *   npm run import-sqlite                      # reads ./data/gtasun.sqlite
 *   npm run import-sqlite -- path/to/file.sqlite
 *   npm run import-sqlite -- --force           # target already contains staff: overwrite rows with the same keys
 *
 * The source file is never modified: a temporary copy (with its -wal / -shm files) is read instead.
 * Rows are upserted (INSERT OR REPLACE), nothing is deleted from the target.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type InValue } from "@libsql/client";
import { db, rawClient } from "../src/lib/db";

const args = process.argv.slice(2);
const force = args.includes("--force");
const sourcePath = path.resolve(args.find((a) => !a.startsWith("--")) ?? "./data/gtasun.sqlite");
const SKIP = new Set(["schema_migrations"]);
const PAGE = 200;

if (!fs.existsSync(sourcePath)) {
  console.error(`Source not found: ${sourcePath}`);
  process.exit(1);
}

// Work on a copy so the original (and its write-ahead log) stays untouched.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gtasun-import-"));
const copy = path.join(temp, "source.sqlite");
for (const suffix of ["", "-wal", "-shm"]) {
  if (fs.existsSync(sourcePath + suffix)) fs.copyFileSync(sourcePath + suffix, copy + suffix);
}
const source = createClient({ url: pathToFileURL(copy).href });

await db.get("SELECT 1 AS ok"); // creates the schema on the target first
const target = await rawClient();
console.log(`Source : ${sourcePath}`);
console.log(`Target : ${process.env.TURSO_DATABASE_URL || "local file " + (process.env.DATABASE_PATH || "./data/gtasun.sqlite")}`);

const existing = await target.execute("SELECT COUNT(*) AS n FROM staff_members");
if (Number(existing.rows[0].n) > 0 && !force) {
  console.error(`The target already holds ${existing.rows[0].n} staff members. Re-run with --force to overwrite matching rows.`);
  process.exit(1);
}

const tables = (await source.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
  .rows.map((r) => String(r.name)).filter((name) => !SKIP.has(name));

let failed = false;
for (const table of tables) {
  const columns = (await source.execute(`PRAGMA table_info(${table})`)).rows.map((r) => String(r.name));
  const targetColumns = new Set((await target.execute(`PRAGMA table_info(${table})`)).rows.map((r) => String(r.name)));
  const shared = columns.filter((c) => targetColumns.has(c));
  if (!shared.length) {
    console.log(`  ${table.padEnd(22)} skipped (not in the target schema)`);
    continue;
  }
  const insert = `INSERT OR REPLACE INTO ${table} (${shared.join(", ")}) VALUES (${shared.map(() => "?").join(", ")})`;

  let copied = 0;
  for (let offset = 0; ; offset += PAGE) {
    const page = await source.execute({ sql: `SELECT ${shared.join(", ")} FROM ${table} ORDER BY rowid LIMIT ${PAGE} OFFSET ${offset}`, args: [] });
    if (!page.rows.length) break;
    await target.batch(page.rows.map((row) => ({ sql: insert, args: shared.map((_, i) => row[i] as InValue) })), "write");
    copied += page.rows.length;
  }

  const [src, dst] = await Promise.all([
    source.execute(`SELECT COUNT(*) AS n FROM ${table}`),
    target.execute(`SELECT COUNT(*) AS n FROM ${table}`)
  ]);
  const ok = Number(dst.rows[0].n) >= Number(src.rows[0].n);
  if (!ok) failed = true;
  console.log(`  ${table.padEnd(22)} ${String(copied).padStart(6)} rows copied  (source ${src.rows[0].n}, target ${dst.rows[0].n}) ${ok ? "OK" : "MISMATCH"}`);
}

source.close();
try { fs.rmSync(temp, { recursive: true, force: true }); } catch { /* Windows may keep the file locked briefly */ }
console.log(failed ? "\nImport finished with mismatches: check the lines above." : "\nImport complete. The source file was not modified.");
process.exit(failed ? 1 : 0);
