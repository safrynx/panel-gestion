import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Each run gets its own throw-away SQLite file (libSQL local mode, same engine and SQL as Turso).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gtasun-test-"));
delete process.env.TURSO_DATABASE_URL;
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.CONFIG_CACHE_MS = "0"; // tests change config tables directly
process.env.APP_TIMEZONE = "Europe/Paris";
process.env.SESSION_SECRET = "x".repeat(40);
process.env.DISCORD_STAFF_ROLE_IDS = "r-mod,r-admin";
process.env.GRADE_ROLE_MAPPING_JSON = JSON.stringify({
  Moderator: { roleId: "r-mod", level: 2 },
  Admin: { roleId: "r-admin", level: 4 }
});
process.env.FIVEM_AGENT_TOKEN = "secret-token";
process.env.PANEL_OWNER_IDS = "900000000000000001";
// The legacy server ("default") is attached to this guild at startup, like an upgraded single-server install.
process.env.DISCORD_GUILD_ID = "500000000000000001";

type Mods = {
  sync: typeof import("../src/lib/sync");
  voice: typeof import("../src/lib/voice");
  fivem: typeof import("../src/lib/fivem");
  session: typeof import("../src/lib/session");
  grades: typeof import("../src/lib/grades");
  config: typeof import("../src/lib/config");
  db: typeof import("../src/lib/db");
  roles: typeof import("../src/lib/roles");
  report: typeof import("../src/lib/report");
  week: typeof import("../src/lib/week");
  status: typeof import("../src/lib/bot-status");
  playtime: typeof import("../src/lib/playtime");
  servers: typeof import("../src/lib/servers");
};
let m: Mods;
let db: Mods["db"]["db"];
/** The legacy server: existing data and env fallbacks (grade mapping, staff roles) belong to it. */
const S = "default";
const G = "500000000000000001";
const A = "100000000000000001";
const B = "100000000000000002";

before(async () => {
  m = {
    sync: await import("../src/lib/sync"),
    voice: await import("../src/lib/voice"),
    fivem: await import("../src/lib/fivem"),
    session: await import("../src/lib/session"),
    grades: await import("../src/lib/grades"),
    config: await import("../src/lib/config"),
    db: await import("../src/lib/db"),
    roles: await import("../src/lib/roles"),
    report: await import("../src/lib/report"),
    week: await import("../src/lib/week"),
    status: await import("../src/lib/bot-status"),
    playtime: await import("../src/lib/playtime"),
    servers: await import("../src/lib/servers")
  };
  db = m.db.db;
});

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows may keep the file locked */ }
});

const member = (discordId: string, roleIds: string[]) => ({
  discordId, username: `u${discordId.slice(-1)}`, avatarUrl: null, roleIds, joinedAt: null, presentInGuild: true
});
const stat = async (id: string) => (await m.sync.listStaffWithStats(S)).find((s) => s.discordId === id);

test("grade resolution: highest level wins, non-staff gets none", async () => {
  assert.deepEqual(await m.config.resolveGradeFromRoles(S, ["r-mod", "r-admin"]), { grade: "Admin", gradeLevel: 4, roleId: "r-admin" });
  assert.equal(await m.config.resolveGradeFromRoles(S, ["other"]), null);
});

test("hierarchy: cannot manage equal/higher or assign >= own level", () => {
  assert.equal(m.grades.canManageGrade(4, 2, 3), true);
  assert.equal(m.grades.canManageGrade(4, 4, 1), false);
  assert.equal(m.grades.canManageGrade(4, 2, 4), false);
});

test("sync inserts staff, ignores non-staff, marks left, keeps history", async () => {
  const r1 = await m.sync.syncStaffMembers(S, [member(A, ["r-admin"]), member(B, ["r-mod"]), member("100000000000000003", ["x"])]);
  assert.deepEqual([r1.inserted, r1.updated], [2, 0]);
  await db.run("INSERT INTO staff_notes (discord_id, body, author_discord_id) VALUES (?, 'n', ?)", [B, A]);
  const r2 = await m.sync.syncStaffMembers(S, [member(A, ["r-admin"])]);
  assert.equal(r2.markedLeft, 1);
  assert.equal((await m.sync.listStaffWithStats(S)).length, 1);
  // B returns: same row reactivated, note preserved.
  await m.sync.syncStaffMembers(S, [member(A, ["r-admin"]), member(B, ["r-mod"])]);
  const b = (await stat(B))!;
  assert.equal(b.notesCount, 1);
  assert.equal(b.grade, "Moderator");
});

test("voice sessions: open, move, close accumulate seconds; non-staff ignored", async () => {
  const t0 = new Date("2026-01-01T10:00:00Z");
  await m.voice.openVoiceSession(S, A, ["r-admin"], "c1", t0);
  assert.equal(await m.voice.isInVoiceNow(S, A), true);
  await m.voice.moveVoiceSession(S, A, ["r-admin"], "c2", new Date(t0.getTime() + 60_000));
  await m.voice.closeVoiceSession(S, A, new Date(t0.getTime() + 180_000));
  assert.equal(await m.voice.isInVoiceNow(S, A), false);
  assert.equal(await m.voice.voiceSecondsFor(S, A), 180);
  await m.voice.openVoiceSession(S, "999", ["nope"], "c1", t0);
  assert.equal(await m.voice.isInVoiceNow(S, "999"), false);
  assert.equal((await stat(A))!.voiceSeconds, 180);
});

test("fivem: legacy token, idempotent start, end computes seconds", async () => {
  assert.equal((await m.servers.serverForFivemToken("secret-token"))?.id, S); // legacy shared token -> legacy server
  assert.equal(await m.servers.serverForFivemToken("wrong-token!"), null);
  assert.equal(await m.servers.serverForFivemToken(null), null);
  const ts = Math.floor(Date.now() / 1000) - 600;
  const start = { event: "session_start" as const, discordId: A, sessionId: "s1", timestamp: ts };
  assert.deepEqual(await m.fivem.ingestFivemEvent(S, start), { ok: true, action: "opened" });
  assert.deepEqual(await m.fivem.ingestFivemEvent(S, start), { ok: true, action: "ignored" });
  assert.equal(await m.fivem.isInFivemNow(S, A), true);
  assert.deepEqual(await m.fivem.ingestFivemEvent(S, { ...start, event: "session_end", timestamp: ts + 300 }), { ok: true, action: "closed" });
  assert.equal((await stat(A))!.fivemSeconds, 300);
  assert.deepEqual(await m.fivem.ingestFivemEvent(S, { ...start, discordId: "555555555555555555", sessionId: "s2" }), { ok: true, action: "ignored" });
});

test("stale FiveM sessions are closed after the timeout", async () => {
  const old = new Date(Date.now() - 20 * 3600_000).toISOString();
  await db.run("INSERT INTO activity_sessions (discord_id, source, started_at, external_session_id, origin) VALUES (?, 'fivem', ?, 'stale-1', 'test')", [B, old]);
  assert.equal(await m.fivem.isInFivemNow(S, B), true);
  assert.equal(await m.fivem.closeStaleFivemSessions(12 * 3600), 1);
  assert.equal(await m.fivem.isInFivemNow(S, B), false);
  const row = await db.get<{ seconds: number }>("SELECT seconds FROM activity_sessions WHERE external_session_id = 'stale-1'");
  assert.equal(row!.seconds, 12 * 3600);
});

test("session cookie: roundtrip, tamper and expiry rejected; oauth state single-use", async () => {
  const tok = m.session.encodeSession({ discordId: A, username: "a", avatarUrl: null, roles: ["r-admin"] });
  assert.equal(m.session.decodeSession(tok)?.discordId, A);
  assert.equal(m.session.decodeSession(tok.slice(0, -2) + "xx"), null);
  await m.session.storeState("st1");
  assert.equal(await m.session.verifyAndConsumeState("st1"), true);
  assert.equal(await m.session.verifyAndConsumeState("st1"), false);
  assert.equal(await m.session.verifyAndConsumeState(null), false);
  // an expired state is refused
  await db.run("INSERT INTO oauth_states (state, created_at) VALUES ('old', datetime('now', '-20 minutes'))");
  assert.equal(await m.session.verifyAndConsumeState("old"), false);
});

test("panel access: seeded roles/users, owner, add/remove", async () => {
  const { hasPanelAccess } = m.config;
  assert.equal(await hasPanelAccess(S, "1243884102407422024", []), true); // seeded user
  assert.equal(await hasPanelAccess(S, "1130169424905785354", []), true);
  assert.equal(await hasPanelAccess(S, "5", ["1557788967414407229"]), true); // seeded role
  assert.equal(await hasPanelAccess(S, "5", ["1557788898497659012"]), true);
  assert.equal(await hasPanelAccess(S, "5", ["something-else"]), false);
  assert.equal(await hasPanelAccess(S, "900000000000000001", []), true); // owner from env
  await db.run("INSERT INTO panel_access (kind, discord_id) VALUES ('user', '777')");
  assert.equal(await hasPanelAccess(S, "777", []), true);
  await db.run("DELETE FROM panel_access WHERE discord_id = '777'");
  assert.equal(await hasPanelAccess(S, "777", []), false);
});

test("avert roles are detected by name and levels read from roles", async () => {
  await m.roles.storeGuildRoles(S, [
    { id: "w1", name: "Avert 1", position: 3, color: 0 },
    { id: "w2", name: "Avertissement 2", position: 4, color: 0 },
    { id: "w3", name: "avert 3", position: 5, color: 0 },
    { id: "other", name: "Autre", position: 6, color: 0 }
  ]);
  assert.deepEqual((await m.config.getWarnRoles(S)).map((w) => [w.level, w.roleId]), [[1, "w1"], [2, "w2"], [3, "w3"]]);
  assert.equal(await m.config.warnLevelFromRoles(S, ["w2", "x"]), 2);
  assert.equal(await m.config.warnLevelFromRoles(S, ["x"]), 0);
});

test("grade ladder from Discord positions when no env mapping", async () => {
  const saved = process.env.GRADE_ROLE_MAPPING_JSON;
  process.env.GRADE_ROLE_MAPPING_JSON = "{}";
  await m.roles.storeGuildRoles(S, [
    { id: "g-low", name: "Helper", position: 10, color: 0 },
    { id: "g-high", name: "Admin", position: 30, color: 0 },
    { id: "g-mid", name: "Mod", position: 20, color: 0 }
  ]);
  for (const id of ["g-high", "g-low", "g-mid"]) await db.run("INSERT OR IGNORE INTO grade_roles (role_id) VALUES (?)", [id]);
  assert.deepEqual((await m.config.getGradeLadder(S)).map((g) => [g.name, g.level]), [["Helper", 1], ["Mod", 2], ["Admin", 3]]);
  assert.equal((await m.config.resolveGradeFromRoles(S, ["g-mid", "g-low"]))?.grade, "Mod");
  assert.equal(await m.config.hasStaffRole(S, ["g-low"]), true);
  await db.run("DELETE FROM grade_roles");
  process.env.GRADE_ROLE_MAPPING_JSON = saved;
});

test("week range: Monday-based in Europe/Paris, whatever the server time zone", () => {
  // Wednesday 21 Oct 2026, 15:00 in Paris (CEST, UTC+2) = 13:00Z
  const now = new Date("2026-10-21T13:00:00Z");
  const cur = m.week.weekRange(0, now);
  assert.equal(cur.start.toISOString(), "2026-10-18T22:00:00.000Z"); // Monday 19 Oct 00:00 Paris
  assert.equal(cur.key, "2026-10-19");
  assert.equal(cur.label, "du 19/10 au 25/10");
  assert.equal(cur.partial, true);
  assert.equal(cur.end.getTime(), now.getTime());

  const prev = m.week.weekRange(1, now);
  assert.equal(prev.start.toISOString(), "2026-10-11T22:00:00.000Z");
  assert.equal(prev.partial, false);
  // The week of 19 Oct contains the autumn clock change (25 Oct): it ends Monday 26 Oct 00:00 CET = 23:00Z
  assert.equal(prev.end.toISOString(), "2026-10-18T22:00:00.000Z");
  assert.equal(m.week.weekRange(0, new Date("2026-10-26T10:00:00Z")).start.toISOString(), "2026-10-25T23:00:00.000Z");

  // Winter time (CET, UTC+1)
  const winter = m.week.weekRange(0, new Date("2026-11-04T12:00:00Z"));
  assert.equal(winter.start.toISOString(), "2026-11-01T23:00:00.000Z");
  // Sunday-evening window: 20:00 Paris = 18:00Z in summer
  assert.equal(m.week.isSundayFrom(20, new Date("2026-10-18T17:59:00Z")), false);
  assert.equal(m.week.isSundayFrom(20, new Date("2026-10-18T18:00:00Z")), true);
  assert.equal(m.week.isSundayFrom(20, new Date("2026-10-19T18:00:00Z")), false); // Monday
});

test("voice presence is only shown while the bot heartbeat is fresh", async () => {
  const t0 = new Date();
  await m.voice.openVoiceSession(S, B, ["r-mod"], "c9", t0);
  assert.equal((await stat(B))!.inVoice, false); // no heartbeat yet
  await m.status.setServerStatus(S, "heartbeat", new Date().toISOString());
  assert.equal((await stat(B))!.inVoice, true);
  await m.status.clearBotHeartbeat();
  assert.equal((await stat(B))!.inVoice, false);
  await m.voice.closeVoiceSession(S, B, new Date(t0.getTime() + 1000));
});

test("latest comment shows its author", async () => {
  await db.run("INSERT INTO staff_notes (discord_id, body, author_discord_id, author_name) VALUES (?, 'ok', ?, 'Chef')", [B, A]);
  const row = (await stat(B))!;
  assert.deepEqual([row.lastNote?.body, row.lastNote?.author], ["ok", "Chef"]);
});

test("permissions: migrated entries keep their rights, new ones get the basics, roles and users cumulate, owner has all", async () => {
  const perms = await import("../src/lib/permissions");
  const seeded = await m.config.getPermissions(S, "1243884102407422024", []);
  assert.ok(seeded.includes("rank_up") && seeded.includes("warn_add") && !seeded.includes("view_logs"));
  await db.run("INSERT INTO panel_access (kind, discord_id) VALUES ('user', '888')"); // no permissions value
  assert.deepEqual(await m.config.getPermissions(S, "888", []), perms.DEFAULT_NEW_PERMISSIONS);
  await db.run("INSERT INTO panel_access (kind, discord_id, permissions) VALUES ('role', 'r-logs', '[\"view_logs\"]')");
  const merged = await m.config.getPermissions(S, "888", ["r-logs"]);
  assert.ok(merged.includes("view_logs") && merged.includes("comment"));
  assert.equal((await m.config.getPermissions(S, "900000000000000001", [])).length, perms.ALL_PERMISSIONS.length);
  assert.deepEqual(await m.config.getPermissions(S, "nobody", []), []);
  await db.run("DELETE FROM panel_access WHERE discord_id IN ('888','r-logs')");
});

test("config snapshot is cached briefly and refreshed on invalidate", async () => {
  process.env.CONFIG_CACHE_MS = "60000";
  try {
    m.config.invalidateConfig();
    assert.equal(await m.config.hasPanelAccess(S, "4242", []), false);
    await db.run("INSERT INTO panel_access (kind, discord_id) VALUES ('user', '4242')");
    assert.equal(await m.config.hasPanelAccess(S, "4242", []), false); // still the cached view
    m.config.invalidateConfig();
    assert.equal(await m.config.hasPanelAccess(S, "4242", []), true);
  } finally {
    process.env.CONFIG_CACHE_MS = "0";
    await db.run("DELETE FROM panel_access WHERE discord_id = '4242'");
  }
});

test("logs: names, readable details, group filter and search", async () => {
  const { audit } = await import("../src/lib/audit");
  const { listLogs } = await import("../src/lib/logs");
  await audit(S, { discordId: A, username: "Chef" }, "rank_up", B, { from: "Helper", to: "Mod", reason: "bon boulot" });
  await audit(S, { discordId: A, username: "Chef" }, "rank_demote_failed", B, { discordStatus: 403 });
  await audit(S, { discordId: A, username: "Chef" }, "warn_add", B, { level: 2, reason: "retard" });
  const all = await listLogs(S, {});
  const up = all.rows.find((r) => r.action === "rank_up")!;
  assert.equal(up.actorName, "Chef");
  assert.equal(up.details, "Helper → Mod — « bon boulot »");
  assert.equal(up.tone, "up");
  const failed = await listLogs(S, { group: "failed" });
  assert.ok(failed.rows.every((r) => r.action.endsWith("_failed")) && failed.total >= 1);
  assert.match(failed.rows[0].details, /rôle du bot trop bas/);
  assert.ok((await listLogs(S, { group: "warnings" })).rows.every((r) => r.action.startsWith("warn")));
  assert.ok((await listLogs(S, { q: "chef" })).total >= 3);
  assert.equal((await listLogs(S, { q: "zzz-nobody" })).total, 0);
  assert.equal((await listLogs(S, { limit: 1, offset: 1 })).rows.length, 1);
});

test("AI review parsing tolerates fences and rejects bad ratings", async () => {
  const { parseReview } = await import("../src/lib/review");
  assert.deepEqual(parseReview('```json\n{"rating":"Green","summary":"Très présent."}\n```'), { rating: "green", summary: "Très présent." });
  assert.equal(parseReview('{"rating":"purple","summary":"x"}'), null);
  assert.equal(parseReview('{"rating":"red","summary":""}'), null);
  assert.equal(parseReview("pas de json"), null);
});

test("weekly review: AI summary + pastille per commented member, idempotent, batched, force replaces badge", async () => {
  const review = await import("../src/lib/review");
  process.env.AI_API_KEY = "test-key";
  let calls = 0;
  let verdict = "green";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    calls++;
    assert.match(String(init?.body), /Commentaires de la semaine/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ rating: verdict, summary: "Bonne semaine." }) } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await db.run("INSERT INTO staff_notes (discord_id, body, author_discord_id, author_name) VALUES (?, 'Très actif', ?, 'Chef')", [A, B]);
    // two commented members (A and B): a budget of 1 leaves one for the next run
    const first = await review.generateWeeklyReviews(S, 0, { delayMs: 0, maxMembers: 1 });
    assert.ok(first.ok && first.generated === 1 && first.remaining === 1 && first.failed === 0);
    const second = await review.generateWeeklyReviews(S, 0, { delayMs: 0 });
    assert.ok(second.ok && second.generated === 1 && second.skipped === 1 && second.remaining === 0);
    const callsAfter = calls;
    const again = await review.generateWeeklyReviews(S, 0, { delayMs: 0 });
    assert.ok(again.ok && again.generated === 0 && again.skipped === 2);
    assert.equal(calls, callsAfter); // no AI call for already-reviewed members

    const key = m.week.weekKey(m.week.weekRange(0));
    assert.equal((await review.getReviews(S, key)).get(A)?.rating, "green");
    const active = async () => (await db.all<{ color: string }>("SELECT color FROM staff_badges WHERE discord_id = ? AND author_discord_id = 'ia' AND status = 'active'", [A])).map((b) => b.color);
    assert.deepEqual(await active(), ["green"]);

    verdict = "blue";
    await review.generateWeeklyReviews(S, 0, { delayMs: 0, force: true });
    assert.deepEqual(await active(), ["blue"]); // old AI badge resolved, only the new one is active

    // a held lock (another instance running) refuses a second run
    assert.equal(await m.status.tryAcquireLock("review:default", 60_000), true);
    assert.deepEqual(await review.generateWeeklyReviews(S, 0, { delayMs: 0 }), { ok: false, error: "already_running" });
    await m.status.releaseLock("review:default");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.AI_API_KEY;
  }
  assert.deepEqual(await review.generateWeeklyReviews(S, 0), { ok: false, error: "ai_not_configured" });
});

test("locks: exclusive, released, and a stale lock can be taken over", async () => {
  assert.equal(await m.status.tryAcquireLock("job", 60_000), true);
  assert.equal(await m.status.tryAcquireLock("job", 60_000), false);
  await m.status.releaseLock("job");
  assert.equal(await m.status.tryAcquireLock("job", 60_000), true);
  await db.run("UPDATE bot_status SET value = ? WHERE key = 'lock:job'", [new Date(Date.now() - 10 * 60_000).toISOString()]);
  assert.equal(await m.status.tryAcquireLock("job", 60_000), true); // expired: taken over
  await m.status.releaseLock("job");
});

test("FiveM playtime pushed by the bot: staff only, throttled snapshots, period = difference of snapshots", async () => {
  const pt = m.playtime;
  assert.equal(await pt.playtimeAvailable(S), false);
  assert.equal(await pt.getFivemPlaytimes(S), null);

  const t0 = new Date("2026-03-01T10:00:00Z");
  const first = await pt.storePlaytimeTotals(S, [{ discordId: A, seconds: 1000 }, { discordId: "999999999999999999", seconds: 5 }], t0);
  assert.deepEqual(first, { stored: 1, snapshot: true }); // non-staff ignored
  const soon = await pt.storePlaytimeTotals(S, [{ discordId: A, seconds: 1100 }], new Date(t0.getTime() + 10 * 60_000));
  assert.equal(soon.snapshot, false); // < 30 min since the last snapshot
  const later = await pt.storePlaytimeTotals(S, [{ discordId: A, seconds: 4600 }], new Date("2026-03-08T10:00:00Z"));
  assert.equal(later.snapshot, true);

  assert.equal((await pt.getFivemPlaytimes(S))!.get(A), 4600); // lifetime
  const week = await pt.getFivemPlaytimes(S, new Date("2026-03-01T10:00:00Z"), new Date("2026-03-08T10:00:00Z"));
  assert.equal(week!.get(A), 3600);
  // before any snapshot existed: the earliest one is the baseline
  assert.equal((await pt.getFivemPlaytimes(S, new Date("2026-01-01T00:00:00Z")))!.get(A), 3600);
  // the staff overview shows the database figure instead of agent sessions
  const stats = await import("../src/lib/stats");
  assert.equal((await stats.fivemSource(S)), "database");
  assert.equal((await stats.getStaffOverview(S, undefined, undefined, false)).find((s) => s.discordId === A)!.fivemSeconds, 4600);

  await db.run("DELETE FROM playtime_totals");
  await db.run("DELETE FROM playtime_snapshots");
});

test("counter reset: lists restart from zero, history and weekly reports are untouched, live sessions keep counting", async () => {
  const stats = await import("../src/lib/stats");
  const counters = await import("../src/lib/counters");
  const overview = async (apply = true) => (await stats.getStaffOverview(S, undefined, undefined, apply)).find((s) => s.discordId === A)!;

  // A already has 180s of voice history from an earlier test (started in 2026-01).
  const before = await overview();
  assert.ok(before.voiceSeconds >= 180);

  // a member currently in voice at the moment of the reset
  await m.status.setServerStatus(S, "heartbeat", new Date().toISOString());
  await m.voice.openVoiceSession(S, A, ["r-admin"], "c5", new Date(Date.now() - 5 * 60_000));
  const result = await counters.resetCounters(S, { discordId: A, username: "Chef" });
  assert.equal(result.restartedVoice, 1);
  assert.equal(result.fivemSnapshot, false); // no playtime pushed in this test

  const afterReset = await overview();
  assert.ok(afterReset.voiceSeconds < 5, `expected a fresh counter, got ${afterReset.voiceSeconds}`);
  assert.equal(afterReset.inVoice, true); // still in voice, now counting from the reset
  assert.ok((await overview(false)).voiceSeconds >= before.voiceSeconds); // history kept (weekly reports ignore the reset)
  assert.ok((await stats.getStaffOverview(S, new Date(Date.now() - 86400_000))).find((s) => s.discordId === A)!.voiceSeconds < 5);
  assert.ok(((await stats.countersSince(S, new Date(Date.now() + 1000))) as Date).getTime() > Date.now()); // never earlier than asked

  await m.voice.closeVoiceSession(S, A, new Date());
  await m.status.clearBotHeartbeat();
  await db.run("DELETE FROM bot_status WHERE key = 'default:counters_reset_at'");
});

test("voice reconcile: keeps live sessions, closes phantoms, reopens moved members, counts only real openings", async () => {
  const STAFF = "600000000000000001";
  const prev = process.env.DISCORD_STAFF_ROLE_IDS;
  process.env.DISCORD_STAFF_ROLE_IDS = `${prev},${STAFF}`;
  const [U1, U2, U3, U4, U5] = ["710000000000000001", "710000000000000002", "710000000000000003", "710000000000000004", "710000000000000005"];
  const C1 = "920000000000000001";
  const C2 = "920000000000000002";
  try {
    const t = new Date(Date.now() - 600_000);
    for (const u of [U1, U2, U3]) await m.voice.openVoiceSession(S, u, [STAFF], C1, t);
    const result = await m.voice.reconcileVoiceSessions(S, 
      [
        { discordId: U1, channelId: C1, roleIds: [STAFF] }, // unchanged
        { discordId: U2, channelId: C2, roleIds: [STAFF] }, // moved while the bot was away
        { discordId: U4, channelId: C1, roleIds: [STAFF] }, // joined unseen
        { discordId: U5, channelId: C1, roleIds: [] } // not staff: ignored
      ],
      new Date()
    );
    // U3 left (closed), U2 moved (closed + reopened), U4 opened
    assert.deepEqual(result, { closed: 2, opened: 2 });
    assert.equal(await m.voice.isInVoiceNow(S, U1), true);
    assert.equal(await m.voice.isInVoiceNow(S, U3), false);
    assert.equal(await m.voice.isInVoiceNow(S, U4), true);
    assert.equal(await m.voice.isInVoiceNow(S, U5), false);
    const u2 = await db.all<{ channel_id: string }>("SELECT channel_id FROM voice_sessions WHERE discord_id = ? AND ended_at IS NULL", [U2]);
    assert.deepEqual(u2.map((r) => r.channel_id), [C2]);
    await m.voice.closeAllVoiceSessions(new Date());
    assert.equal(await m.voice.isInVoiceNow(S, U1), false);
  } finally {
    process.env.DISCORD_STAFF_ROLE_IDS = prev;
  }
});

test("database: batches are atomic, migrations are idempotent and safe to run concurrently", async () => {
  await db.run("CREATE TABLE IF NOT EXISTS t_atomic (k TEXT PRIMARY KEY)");
  await assert.rejects(db.batch([
    m.db.stmt("INSERT INTO t_atomic (k) VALUES ('a')"),
    m.db.stmt("INSERT INTO t_atomic (k) VALUES ('a')") // duplicate: the whole batch must roll back
  ]));
  assert.equal((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM t_atomic"))!.n, 0);
  const results = await db.batch([m.db.stmt("INSERT INTO t_atomic (k) VALUES ('b')"), m.db.stmt("SELECT COUNT(*) AS n FROM t_atomic")]);
  assert.equal(results[0].changes, 1);
  assert.equal(results[1].rows[0].n, 1);
  await db.run("DROP TABLE t_atomic");

  const { runMigrations } = await import("../src/lib/migrations");
  const client = await m.db.rawClient();
  const before = (await client.execute("SELECT COUNT(*) AS n FROM schema_migrations")).rows[0].n;
  await Promise.all([runMigrations(client), runMigrations(client)]);
  assert.equal((await client.execute("SELECT COUNT(*) AS n FROM schema_migrations")).rows[0].n, before);
  assert.equal(Number(before), 13);
});

test("bot API: sync snapshot, member event, voice events, heartbeat, playtime, shutdown", async () => {
  const api = await import("../src/lib/bot-api");
  const guard = await import("../src/lib/bot-guard");

  // token check
  process.env.BOT_API_TOKEN = "bot-secret";
  assert.equal(guard.verifyBotToken("Bearer bot-secret"), true);
  assert.equal(guard.verifyBotToken("Bearer wrong-secret"), false);
  assert.equal(guard.verifyBotToken(null), false);
  delete process.env.BOT_API_TOKEN;
  assert.equal(guard.verifyBotToken("Bearer bot-secret"), false); // no token configured => nobody gets in

  const STAFF = "600000000000000001";
  const prevStaff = process.env.DISCORD_STAFF_ROLE_IDS;
  process.env.DISCORD_STAFF_ROLE_IDS = `${prevStaff},${STAFF}`;
  const NEW = "700000000000000001";
  const snapshot = api.syncSchema.parse({
    guildId: G,
    roles: [{ id: "800000000000000001", name: "Support", position: 5, color: 0 }],
    members: [
      { discordId: NEW, username: "Recrue", avatarUrl: null, roleIds: [STAFF], joinedAt: null },
      { discordId: "700000000000000002", username: "Visiteur", avatarUrl: null, roleIds: [], joinedAt: null }
    ],
    voice: [{ discordId: NEW, channelId: "900000000000000001", roleIds: [STAFF] }],
    topRolePosition: 12
  });
  const synced = await api.applySync(snapshot);
  assert.ok("members" in synced, "the legacy guild maps to the default server");
  assert.equal(synced.members.inserted >= 1, true);
  assert.equal(synced.voice.opened, 1);
  assert.equal(await m.voice.isInVoiceNow(S, NEW), true);
  assert.equal((await m.status.getBotStatus(S)).alive, true);
  assert.equal((await m.status.getBotStatus(S)).topRolePosition, 12);
  assert.ok((await m.roles.listGuildRoles(S)).some((r) => r.name === "Support"));

  // a visitor without staff role never becomes staff
  assert.equal(await stat("700000000000000002"), undefined);

  // voice events
  const CH2 = "900000000000000002";
  await api.applyVoice(api.voiceEventSchema.parse({ guildId: G, action: "move", discordId: NEW, channelId: CH2, roleIds: [STAFF] }));
  assert.equal(await m.voice.isInVoiceNow(S, NEW), true);
  await api.applyVoice(api.voiceEventSchema.parse({ guildId: G, action: "leave", discordId: NEW }));
  assert.equal(await m.voice.isInVoiceNow(S, NEW), false);
  await assert.rejects(api.applyVoice(api.voiceEventSchema.parse({ guildId: G, action: "join", discordId: NEW })));

  // playtime pushed by the bot: only staff are stored
  const played = await api.applyPlaytime(api.playtimeSchema.parse({ guildId: G, totals: [{ discordId: NEW, seconds: 60 }, { discordId: "700000000000000002", seconds: 9 }] }));
  assert.ok("stored" in played && played.stored === 1);
  await db.run("DELETE FROM playtime_totals");
  await db.run("DELETE FROM playtime_snapshots");

  // member left the guild
  await api.applyMember(api.memberSchema.parse({ guildId: G, discordId: NEW, username: "Recrue", avatarUrl: null, roleIds: [], joinedAt: null, present: false }));
  assert.equal(await stat(NEW), undefined);

  // shutdown closes sessions and drops the heartbeat
  await api.applyVoice(api.voiceEventSchema.parse({ guildId: G, action: "join", discordId: A, channelId: CH2, roleIds: [STAFF] }));
  assert.equal((await api.applyShutdown()).closed >= 1, true);
  assert.equal((await m.status.getBotStatus(S)).alive, false);

  // invalid payloads are rejected
  assert.equal(api.voiceEventSchema.safeParse({ action: "dance", discordId: NEW }).success, false);
  assert.equal(api.memberSchema.safeParse({ guildId: G, discordId: "abc", username: "x", avatarUrl: null, roleIds: [], joinedAt: null }).success, false);
  assert.equal(api.playtimeSchema.safeParse({ totals: [{ discordId: NEW, seconds: -1 }] }).success, false);
  process.env.DISCORD_STAFF_ROLE_IDS = prevStaff;
});

// ---------------------------------------------------------------- multi-server

const G2 = "500000000000000002";
const T_ROLE = "610000000000000001";

/** A second server ("Tango"), with its own guild, grade role and owner. A and B are (again) staff of the legacy server. */
async function tango() {
  await m.sync.syncStaffMembers(S, [member(A, ["r-admin"]), member(B, ["r-mod"])]);
  const existing = await m.servers.getServerByGuild(G2);
  if (existing) return existing;
  const created = await m.servers.createServer({ name: "Tango RP", guildId: G2, createdBy: "910000000000000001" });
  assert.ok(created.ok);
  await m.roles.storeGuildRoles(created.server.id, [{ id: T_ROLE, name: "Modo Tango", position: 3, color: 0 }]);
  await db.run("INSERT INTO grade_roles (role_id, server_id) VALUES (?, ?)", [T_ROLE, created.server.id]);
  return created.server;
}

test("servers: readable ids, creator is owner, one guild per server, legacy guild attached from env", async () => {
  assert.equal(m.servers.slugify("Gta Sun RP — Été"), "gta-sun-rp-ete");
  assert.match(m.servers.slugify("!!"), /^srv-[0-9a-f]{6}$/);
  const legacy = await m.servers.getServer(S);
  assert.equal(legacy?.guildId, G); // DISCORD_GUILD_ID of the single-server version
  const t = await tango();
  assert.equal(t.id, "tango-rp");
  assert.deepEqual(await m.servers.listServerOwners(t.id), ["910000000000000001"]);
  assert.deepEqual(await m.servers.createServer({ name: "Copie", guildId: G2, createdBy: A }), { ok: false, error: "guild_taken" });
  const twin = await m.servers.createServer({ name: "Tango RP", guildId: null, createdBy: A });
  assert.ok(twin.ok && twin.server.id.startsWith("tango-rp-") && twin.server.id !== t.id); // same name, distinct id
  assert.equal(await m.servers.getServer("../etc"), null); // ids are validated before any query
  assert.deepEqual(await m.servers.updateServer(twin.ok ? twin.server.id : "", { guildId: G2 }), { ok: false, error: "guild_taken" });
  assert.equal(m.servers.isValidTimeZone("America/Montreal"), true);
  assert.equal(m.servers.isValidTimeZone("Mars/Olympus"), false);
});

test("isolation: staff, grades, notes, voice and logs of one server never show on another", async () => {
  const t = await tango();
  // A is staff on both servers, with a different grade on each.
  await m.sync.syncStaffMembers(t.id, [member(A, [T_ROLE]), member(B, ["r-mod"])]);
  const onT = await m.sync.listStaffWithStats(t.id);
  assert.deepEqual(onT.map((x) => [x.discordId, x.grade]), [[A, "Modo Tango"]]); // r-mod (legacy env mapping) means nothing here
  assert.equal((await stat(A))!.grade, "Admin"); // unchanged on the legacy server

  const notesOnS = (await stat(A))!.notesCount;
  await db.run("INSERT INTO staff_notes (server_id, discord_id, body, author_discord_id) VALUES (?, ?, 'tango only', ?)", [t.id, A, B]);
  assert.equal((await m.sync.listStaffWithStats(t.id))[0].notesCount, 1);
  assert.equal((await stat(A))!.notesCount, notesOnS);

  const t0 = new Date(Date.now() - 120_000);
  await m.voice.openVoiceSession(t.id, A, [T_ROLE], "930000000000000001", t0);
  assert.equal(await m.voice.isInVoiceNow(t.id, A), true);
  assert.equal(await m.voice.isInVoiceNow(S, A), false);
  // a full voice reconcile of the legacy guild does not close Tango's session
  await m.voice.reconcileVoiceSessions(S, [], new Date());
  assert.equal(await m.voice.isInVoiceNow(t.id, A), true);
  await m.voice.closeVoiceSession(t.id, A, new Date());
  assert.ok((await m.voice.voiceSecondsFor(t.id, A)) >= 119);

  const { audit } = await import("../src/lib/audit");
  const { listLogs } = await import("../src/lib/logs");
  await audit(t.id, { discordId: A, username: "ChefTango" }, "warn_add", A, { level: 1, reason: "test" });
  assert.ok((await listLogs(t.id, {})).rows.every((r) => r.actorName !== "Chef"));
  assert.equal((await listLogs(S, { q: "cheftango" })).total, 0);

  // a reset only restarts the counters of its own server
  const counters = await import("../src/lib/counters");
  await counters.resetCounters(t.id, { discordId: A });
  assert.ok(await counters.getCountersResetAt(t.id));
  assert.equal(await counters.getCountersResetAt(S), null);
});

test("access is per server: owners, listed users and roles only open their own server", async () => {
  const t = await tango();
  const TOWNER = "910000000000000001";
  assert.equal(await m.config.hasPanelAccess(t.id, TOWNER, []), true);
  assert.equal((await m.config.getPermissions(t.id, TOWNER, [])).length > 5, true);
  assert.equal(await m.config.hasPanelAccess(S, TOWNER, []), false); // owner of Tango, nobody on the legacy server
  assert.equal(await m.config.hasPanelAccess(t.id, "1243884102407422024", []), false); // seeded on the legacy server only
  assert.equal(await m.config.hasPanelAccess(t.id, "900000000000000001", []), true); // platform owner: everywhere

  // role-based access needs the user's roles on that guild: looked up at login and cached
  const ROLE = "620000000000000001";
  const USER = "920000000000000009";
  await db.run("INSERT INTO panel_access (server_id, kind, discord_id, permissions) VALUES (?, 'role', ?, '[\"view_logs\"]')", [t.id, ROLE]);
  m.config.invalidateConfig(t.id);
  const { refreshMemberships } = await import("../src/lib/memberships");
  const { listAccessibleServers } = await import("../src/lib/auth");
  const identity = { discordId: USER, username: "Visiteur", avatarUrl: null };
  assert.deepEqual(await listAccessibleServers(identity), []);
  const looked: string[] = [];
  const count = await refreshMemberships(identity, [G2, "999999999999999999"], async (guildId) => {
    looked.push(guildId);
    return { user: { id: USER, username: "Visiteur", avatar: null }, roles: [ROLE], joined_at: null, nick: null };
  });
  assert.equal(count, 1);
  assert.deepEqual(looked, [G2]); // only registered guilds the user is in
  assert.deepEqual((await listAccessibleServers(identity)).map((s) => s.id), [t.id]);
  assert.equal((await m.sync.listStaffWithStats(t.id)).some((x) => x.discordId === USER), false); // access is not staff
});

test("FiveM: each server's own token routes its sessions; session ids never collide across servers", async () => {
  const t = await tango();
  const token = await m.servers.rotateFivemToken(t.id);
  assert.match(token, /^fvm_/);
  assert.equal((await m.servers.serverForFivemToken(token))?.id, t.id);
  assert.equal((await db.get<{ h: string }>("SELECT fivem_token_hash AS h FROM servers WHERE id = ?", [t.id]))!.h.includes(token), false); // only a hash is stored
  const again = await m.servers.rotateFivemToken(t.id);
  assert.equal(await m.servers.serverForFivemToken(token), null); // rotated: the old token is dead
  assert.equal((await m.servers.serverForFivemToken(again))?.id, t.id);

  const ts = Math.floor(Date.now() / 1000) - 100;
  const ev = { event: "session_start" as const, discordId: A, sessionId: "same-id", timestamp: ts };
  assert.deepEqual(await m.fivem.ingestFivemEvent(t.id, ev), { ok: true, action: "opened" });
  assert.deepEqual(await m.fivem.ingestFivemEvent(S, ev), { ok: true, action: "opened" }); // same agent session id, other server
  assert.equal(await m.fivem.isInFivemNow(t.id, A), true);
  await m.fivem.ingestFivemEvent(t.id, { ...ev, event: "session_end", timestamp: ts + 60 });
  assert.equal(await m.fivem.isInFivemNow(t.id, A), false);
  assert.equal(await m.fivem.isInFivemNow(S, A), true); // the legacy session is still open
  await m.fivem.ingestFivemEvent(S, { ...ev, event: "session_end", timestamp: ts + 30 });
  // B is staff on the legacy server only: Tango's agent cannot record them
  assert.deepEqual(await m.fivem.ingestFivemEvent(t.id, { ...ev, discordId: B, sessionId: "b" }), { ok: true, action: "ignored" });
});

test("bot API: routes each guild to its server, ignores unknown guilds, heartbeat per guild", async () => {
  const api = await import("../src/lib/bot-api");
  const t = await tango();
  assert.ok((await api.registeredGuilds()).guilds.some((g) => g.guildId === G2 && g.serverId === t.id));
  assert.deepEqual(
    await api.applyMember(api.memberSchema.parse({ guildId: "599999999999999999", discordId: A, username: "x", avatarUrl: null, roleIds: [], joinedAt: null })),
    { ignored: "unknown_guild" }
  );

  await m.status.clearBotHeartbeat();
  assert.deepEqual(await api.recordHeartbeat({ guilds: [{ guildId: G2, topRolePosition: 7 }, { guildId: "599999999999999999" }] }), { servers: 1 });
  assert.equal((await m.status.getBotStatus(t.id)).alive, true);
  assert.equal((await m.status.getBotStatus(t.id)).topRolePosition, 7);
  assert.equal((await m.status.getBotStatus(S)).alive, false); // the bot did not report the legacy guild

  const NEWT = "700000000000000009";
  await api.applyMember(api.memberSchema.parse({ guildId: G2, discordId: NEWT, username: "Recrue Tango", avatarUrl: null, roleIds: [T_ROLE], joinedAt: null }));
  assert.ok((await m.sync.listStaffWithStats(t.id)).some((x) => x.discordId === NEWT));
  assert.equal(await stat(NEWT), undefined);

  await api.applyVoice(api.voiceEventSchema.parse({ guildId: G2, action: "join", discordId: NEWT, channelId: "930000000000000002", roleIds: [T_ROLE] }));
  assert.equal(await m.voice.isInVoiceNow(t.id, NEWT), true);
  assert.ok((await api.applyShutdown()).closed >= 1); // shutdown closes every server's sessions
  assert.equal(await m.voice.isInVoiceNow(t.id, NEWT), false);
  assert.equal((await m.status.getBotStatus(t.id)).alive, false);
});

test("weekly review and maintenance run per server, in each server's own time zone", async () => {
  const maintenance = await import("../src/lib/maintenance");
  const review = await import("../src/lib/review");
  const t = await tango();
  await m.servers.updateServer(t.id, { timezone: "America/Montreal", reviewHour: 20 });
  const server = (await m.servers.getServer(t.id))!;
  const realFetch = globalThis.fetch;
  process.env.AI_API_KEY = "k";
  try {
    // Sunday 18 Oct 2026 21:00 in Paris (19:00Z) = 15:00 in Montreal: due in Paris, not yet in Montreal.
    const at = new Date("2026-10-18T19:00:00Z");
    assert.equal(await maintenance.reviewDue((await m.servers.getServer(S))!, at), true);
    assert.equal(await maintenance.reviewDue(server, at), false);
    assert.equal(await maintenance.reviewDue(server, new Date("2026-10-19T00:30:00Z")), true); // 20:30 in Montreal

    // the review lock of one server does not block another
    globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"rating":"green","summary":"ok"}' } }] }))) as typeof fetch;
    assert.equal(await m.status.tryAcquireLock(`review:${t.id}`, 60_000), true);
    assert.deepEqual(await review.generateWeeklyReviews(t.id, 0, { delayMs: 0 }), { ok: false, error: "already_running" });
    assert.equal((await review.generateWeeklyReviews(S, 0, { delayMs: 0 })).ok, true);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.AI_API_KEY;
    await m.status.releaseLock(`review:${t.id}`);
  }
});
