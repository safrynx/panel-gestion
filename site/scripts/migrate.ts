/**
 * Create / upgrade the database schema (Turso in production, local file otherwise).
 *   npm run migrate
 * The site also does this on its first request, but running it at deploy time keeps the first visitor fast.
 */
import { db, rawClient } from "../src/lib/db";

const target = process.env.TURSO_DATABASE_URL || `local file (${process.env.DATABASE_PATH || "./data/gtasun.sqlite"})`;
console.log(`Database: ${target}`);
await db.get("SELECT 1 AS ok"); // opens the connection and runs the migrations
const applied = await (await rawClient()).execute("SELECT name FROM schema_migrations ORDER BY id");
console.log(`Schema up to date, ${applied.rows.length} migrations applied:`);
for (const row of applied.rows) console.log(`  - ${row.name}`);
process.exit(0);
