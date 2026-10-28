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
};
let m: Mods;
let db: Mods["db"]["db"];
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
    playtime: await import("../src/lib/playtime")
  };
  db = m.db.db;
});

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows may keep the file locked */ }
});

const member = (discordId: string, roleIds: string[]) => ({
  discordId, username: `u${discordId.slice(-1)}`, avatarUrl: null, roleIds, joinedAt: null, presentInGuild: true
});
const stat = async (id: string) => (await m.sync.listStaffWithStats()).find((s) => s.discordId === id);

test("grade resolution: highest level wins, non-staff gets none", async () => {
  assert.deepEqual(await m.config.resolveGradeFromRoles(["r-mod", "r-admin"]), { grade: "Admin", gradeLevel: 4, roleId: "r-admin" });
  assert.equal(await m.config.resolveGradeFromRoles(["other"]), null);
});

test("hierarchy: cannot manage equal/higher or assign >= own level", () => {
  assert.equal(m.grades.canManageGrade(4, 2, 3), true);
  assert.equal(m.grades.canManageGrade(4, 4, 1), false);
  assert.equal(m.grades.canManageGrade(4, 2, 4), false);
});

test("sync inserts staff, ignores non-staff, marks left, keeps history", async () => {
  const r1 = await m.sync.syncStaffMembers([member(A, ["r-admin"]), member(B, ["r-mod"]), member("100000000000000003", ["x"])]);
  assert.deepEqual([r1.inserted, r1.updated], [2, 0]);
  await db.run("INSERT INTO staff_notes (discord_id, body, author_discord_id) VALUES (?, 'n', ?)", [B, A]);
  const r2 = await m.sync.syncStaffMembers([member(A, ["r-admin"])]);
  assert.equal(r2.markedLeft, 1);
  assert.equal((await m.sync.listStaffWithStats()).length, 1);
  // B returns: same row reactivated, note preserved.
  await m.sync.syncStaffMembers([member(A, ["r-admin"]), member(B, ["r-mod"])]);
  const b = (await stat(B))!;
  assert.equal(b.notesCount, 1);
  assert.equal(b.grade, "Moderator");
});

test("voice sessions: open, move, close accumulate seconds; non-staff ignored", async () => {
  const t0 = new Date("2026-01-01T10:00:00Z");
  await m.voice.openVoiceSession(A, ["r-admin"], "c1", t0);
  assert.equal(await m.voice.isInVoiceNow(A), true);
  await m.voice.moveVoiceSession(A, ["r-admin"], "c2", new Date(t0.getTime() + 60_000));
  await m.voice.closeVoiceSession(A, new Date(t0.getTime() + 180_000));
  assert.equal(await m.voice.isInVoiceNow(A), false);
  assert.equal(await m.voice.voiceSecondsFor(A), 180);
  await m.voice.openVoiceSession("999", ["nope"], "c1", t0);
  assert.equal(await m.voice.isInVoiceNow("999"), false);
  assert.equal((await stat(A))!.voiceSeconds, 180);
});

test("fivem: token check, idempotent start, end computes seconds", async () => {
  assert.equal(m.fivem.verifyAgentToken("secret-token"), true);
  assert.equal(m.fivem.verifyAgentToken("wrong-token!"), false);
  const ts = Math.floor(Date.now() / 1000) - 600;
  const start = { event: "session_start" as const, discordId: A, sessionId: "s1", timestamp: ts };
  assert.deepEqual(await m.fivem.ingestFivemEvent(start), { ok: true, action: "opened" });
  assert.deepEqual(await m.fivem.ingestFivemEvent(start), { ok: true, action: "ignored" });
  assert.equal(await m.fivem.isInFivemNow(A), true);
  assert.deepEqual(await m.fivem.ingestFivemEvent({ ...start, event: "session_end", timestamp: ts + 300 }), { ok: true, action: "closed" });
  assert.equal((await stat(A))!.fivemSeconds, 300);
  assert.deepEqual(await m.fivem.ingestFivemEvent({ ...start, discordId: "555555555555555555", sessionId: "s2" }), { ok: true, action: "ignored" });
});

test("stale FiveM sessions are closed after the timeout", async () => {
  const old = new Date(Date.now() - 20 * 3600_000).toISOString();
  await db.run("INSERT INTO activity_sessions (discord_id, source, started_at, external_session_id, origin) VALUES (?, 'fivem', ?, 'stale-1', 'test')", [B, old]);
  assert.equal(await m.fivem.isInFivemNow(B), true);
  assert.equal(await m.fivem.closeStaleFivemSessions(12 * 3600), 1);
  assert.equal(await m.fivem.isInFivemNow(B), false);
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
  assert.equal(await hasPanelAccess("1243884102407422024", []), true); // seeded user
  assert.equal(await hasPanelAccess("1130169424905785354", []), true);
  assert.equal(await hasPanelAccess("5", ["1557788967414407229"]), true); // seeded role
  assert.equal(await hasPanelAccess("5", ["1557788898497659012"]), true);
  assert.equal(await hasPanelAccess("5", ["something-else"]), false);
  assert.equal(await hasPanelAccess("900000000000000001", []), true); // owner from env
  await db.run("INSERT INTO panel_access (kind, discord_id) VALUES ('user', '777')");
  assert.equal(await hasPanelAccess("777", []), true);
  await db.run("DELETE FROM panel_access WHERE discord_id = '777'");
  assert.equal(await hasPanelAccess("777", []), false);
});

test("avert roles are detected by name and levels read from roles", async () => {
  await m.roles.storeGuildRoles([
    { id: "w1", name: "Avert 1", position: 3, color: 0 },
    { id: "w2", name: "Avertissement 2", position: 4, color: 0 },
    { id: "w3", name: "avert 3", position: 5, color: 0 },
    { id: "other", name: "Autre", position: 6, color: 0 }
  ]);
  assert.deepEqual((await m.config.getWarnRoles()).map((w) => [w.level, w.roleId]), [[1, "w1"], [2, "w2"], [3, "w3"]]);
  assert.equal(await m.config.warnLevelFromRoles(["w2", "x"]), 2);
  assert.equal(await m.config.warnLevelFromRoles(["x"]), 0);
});

test("grade ladder from Discord positions when no env mapping", async () => {
  const saved = process.env.GRADE_ROLE_MAPPING_JSON;
  process.env.GRADE_ROLE_MAPPING_JSON = "{}";
  await m.roles.storeGuildRoles([
    { id: "g-low", name: "Helper", position: 10, color: 0 },
    { id: "g-high", name: "Admin", position: 30, color: 0 },
    { id: "g-mid", name: "Mod", position: 20, color: 0 }
  ]);
  for (const id of ["g-high", "g-low", "g-mid"]) await db.run("INSERT OR IGNORE INTO grade_roles (role_id) VALUES (?)", [id]);
  assert.deepEqual((await m.config.getGradeLadder()).map((g) => [g.name, g.level]), [["Helper", 1], ["Mod", 2], ["Admin", 3]]);
  assert.equal((await m.config.resolveGradeFromRoles(["g-mid", "g-low"]))?.grade, "Mod");
  assert.equal(await m.config.hasStaffRole(["g-low"]), true);
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
  await m.voice.openVoiceSession(B, ["r-mod"], "c9", t0);
  assert.equal((await stat(B))!.inVoice, false); // no heartbeat yet
  await m.status.setBotStatus("heartbeat", new Date().toISOString());
  assert.equal((await stat(B))!.inVoice, true);
  await m.status.clearBotHeartbeat();
  assert.equal((await stat(B))!.inVoice, false);
  await m.voice.closeVoiceSession(B, new Date(t0.getTime() + 1000));
});

test("latest comment shows its author", async () => {
  await db.run("INSERT INTO staff_notes (discord_id, body, author_discord_id, author_name) VALUES (?, 'ok', ?, 'Chef')", [B, A]);
  const row = (await stat(B))!;
  assert.deepEqual([row.lastNote?.body, row.lastNote?.author], ["ok", "Chef"]);
});

test("permissions: migrated entries keep their rights, new ones get the basics, roles and users cumulate, owner has all", async () => {
  const perms = await import("../src/lib/permissions");
  const seeded = await m.config.getPermissions("1243884102407422024", []);
  assert.ok(seeded.includes("rank_up") && seeded.includes("warn_add") && !seeded.includes("view_logs"));
  await db.run("INSERT INTO panel_access (kind, discord_id) VALUES ('user', '888')"); // no permissions value
  assert.deepEqual(await m.config.getPermissions("888", []), perms.DEFAULT_NEW_PERMISSIONS);
  await db.run("INSERT INTO panel_access (kind, discord_id, permissions) VALUES ('role', 'r-logs', '[\"view_logs\"]')");
  const merged = await m.config.getPermissions("888", ["r-logs"]);
  assert.ok(merged.includes("view_logs") && merged.includes("comment"));
  assert.equal((await m.config.getPermissions("900000000000000001", [])).length, perms.ALL_PERMISSIONS.length);
  assert.deepEqual(await m.config.getPermissions("nobody", []), []);
  await db.run("DELETE FROM panel_access WHERE discord_id IN ('888','r-logs')");
});

test("config snapshot is cached briefly and refreshed on invalidate", async () => {
  process.env.CONFIG_CACHE_MS = "60000";
  try {
    m.config.invalidateConfig();
    assert.equal(await m.config.hasPanelAccess("4242", []), false);
    await db.run("INSERT INTO panel_access (kind, discord_id) VALUES ('user', '4242')");
    assert.equal(await m.config.hasPanelAccess("4242", []), false); // still the cached view
    m.config.invalidateConfig();
    assert.equal(await m.config.hasPanelAccess("4242", []), true);
  } finally {
    process.env.CONFIG_CACHE_MS = "0";
    await db.run("DELETE FROM panel_access WHERE discord_id = '4242'");
  }
});

test("logs: names, readable details, group filter and search", async () => {
  const { audit } = await import("../src/lib/audit");
  const { listLogs } = await import("../src/lib/logs");
  await audit({ discordId: A, username: "Chef" }, "rank_up", B, { from: "Helper", to: "Mod", reason: "bon boulot" });
  await audit({ discordId: A, username: "Chef" }, "rank_demote_failed", B, { discordStatus: 403 });
  await audit({ discordId: A, username: "Chef" }, "warn_add", B, { level: 2, reason: "retard" });
  const all = await listLogs({});
  const up = all.rows.find((r) => r.action === "rank_up")!;
  assert.equal(up.actorName, "Chef");
  assert.equal(up.details, "Helper → Mod — « bon boulot »");
  assert.equal(up.tone, "up");
  const failed = await listLogs({ group: "failed" });
  assert.ok(failed.rows.every((r) => r.action.endsWith("_failed")) && failed.total >= 1);
  assert.match(failed.rows[0].details, /rôle du bot trop bas/);
  assert.ok((await listLogs({ group: "warnings" })).rows.every((r) => r.action.startsWith("warn")));
  assert.ok((await listLogs({ q: "chef" })).total >= 3);
  assert.equal((await listLogs({ q: "zzz-nobody" })).total, 0);
  assert.equal((await listLogs({ limit: 1, offset: 1 })).rows.length, 1);
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
    const first = await review.generateWeeklyReviews(0, { delayMs: 0, maxMembers: 1 });
    assert.ok(first.ok && first.generated === 1 && first.remaining === 1 && first.failed === 0);
    const second = await review.generateWeeklyReviews(0, { delayMs: 0 });
    assert.ok(second.ok && second.generated === 1 && second.skipped === 1 && second.remaining === 0);
    const callsAfter = calls;
    const again = await review.generateWeeklyReviews(0, { delayMs: 0 });
    assert.ok(again.ok && again.generated === 0 && again.skipped === 2);
    assert.equal(calls, callsAfter); // no AI call for already-reviewed members

    const key = m.week.weekKey(m.week.weekRange(0));
    assert.equal((await review.getReviews(key)).get(A)?.rating, "green");
    const active = async () => (await db.all<{ color: string }>("SELECT color FROM staff_badges WHERE discord_id = ? AND author_discord_id = 'ia' AND status = 'active'", [A])).map((b) => b.color);
    assert.deepEqual(await active(), ["green"]);

    verdict = "blue";
    await review.generateWeeklyReviews(0, { delayMs: 0, force: true });
    assert.deepEqual(await active(), ["blue"]); // old AI badge resolved, only the new one is active

    // a held lock (another instance running) refuses a second run
    assert.equal(await m.status.tryAcquireLock("review", 60_000), true);
    assert.deepEqual(await review.generateWeeklyReviews(0, { delayMs: 0 }), { ok: false, error: "already_running" });
    await m.status.releaseLock("review");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.AI_API_KEY;
  }
  assert.deepEqual(await review.generateWeeklyReviews(0), { ok: false, error: "ai_not_configured" });
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
  assert.equal(await pt.playtimeAvailable(), false);
  assert.equal(await pt.getFivemPlaytimes(), null);

  const t0 = new Date("2026-03-01T10:00:00Z");
  const first = await pt.storePlaytimeTotals([{ discordId: A, seconds: 1000 }, { discordId: "999999999999999999", seconds: 5 }], t0);
  assert.deepEqual(first, { stored: 1, snapshot: true }); // non-staff ignored
  const soon = await pt.storePlaytimeTotals([{ discordId: A, seconds: 1100 }], new Date(t0.getTime() + 10 * 60_000));
  assert.equal(soon.snapshot, false); // < 30 min since the last snapshot
  const later = await pt.storePlaytimeTotals([{ discordId: A, seconds: 4600 }], new Date("2026-03-08T10:00:00Z"));
  assert.equal(later.snapshot, true);

  assert.equal((await pt.getFivemPlaytimes())!.get(A), 4600); // lifetime
  const week = await pt.getFivemPlaytimes(new Date("2026-03-01T10:00:00Z"), new Date("2026-03-08T10:00:00Z"));
  assert.equal(week!.get(A), 3600);
  // before any snapshot existed: the earliest one is the baseline
  assert.equal((await pt.getFivemPlaytimes(new Date("2026-01-01T00:00:00Z")))!.get(A), 3600);
  // the staff overview shows the database figure instead of agent sessions
  const stats = await import("../src/lib/stats");
  assert.equal((await stats.fivemSource()), "database");
  assert.equal((await stats.getStaffOverview(undefined, undefined, false)).find((s) => s.discordId === A)!.fivemSeconds, 4600);

  await db.run("DELETE FROM playtime_totals");
  await db.run("DELETE FROM playtime_snapshots");
});

test("counter reset: lists restart from zero, history and weekly reports are untouched, live sessions keep counting", async () => {
  const stats = await import("../src/lib/stats");
  const counters = await import("../src/lib/counters");
  const overview = async (apply = true) => (await stats.getStaffOverview(undefined, undefined, apply)).find((s) => s.discordId === A)!;

  // A already has 180s of voice history from an earlier test (started in 2026-01).
  const before = await overview();
  assert.ok(before.voiceSeconds >= 180);

  // a member currently in voice at the moment of the reset
  await m.status.setBotStatus("heartbeat", new Date().toISOString());
  await m.voice.openVoiceSession(A, ["r-admin"], "c5", new Date(Date.now() - 5 * 60_000));
  const result = await counters.resetCounters({ discordId: A, username: "Chef" });
  assert.equal(result.restartedVoice, 1);
  assert.equal(result.fivemSnapshot, false); // no playtime pushed in this test

  const afterReset = await overview();
  assert.ok(afterReset.voiceSeconds < 5, `expected a fresh counter, got ${afterReset.voiceSeconds}`);
  assert.equal(afterReset.inVoice, true); // still in voice, now counting from the reset
  assert.ok((await overview(false)).voiceSeconds >= before.voiceSeconds); // history kept (weekly reports ignore the reset)
  assert.ok((await stats.getStaffOverview(new Date(Date.now() - 86400_000))).find((s) => s.discordId === A)!.voiceSeconds < 5);
  assert.ok(((await stats.countersSince(new Date(Date.now() + 1000))) as Date).getTime() > Date.now()); // never earlier than asked

  await m.voice.closeVoiceSession(A, new Date());
  await m.status.clearBotHeartbeat();
  await db.run("DELETE FROM bot_status WHERE key = 'counters_reset_at'");
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
    for (const u of [U1, U2, U3]) await m.voice.openVoiceSession(u, [STAFF], C1, t);
    const result = await m.voice.reconcileVoiceSessions(
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
    assert.equal(await m.voice.isInVoiceNow(U1), true);
    assert.equal(await m.voice.isInVoiceNow(U3), false);
    assert.equal(await m.voice.isInVoiceNow(U4), true);
    assert.equal(await m.voice.isInVoiceNow(U5), false);
    const u2 = await db.all<{ channel_id: string }>("SELECT channel_id FROM voice_sessions WHERE discord_id = ? AND ended_at IS NULL", [U2]);
    assert.deepEqual(u2.map((r) => r.channel_id), [C2]);
    await m.voice.closeAllVoiceSessions(new Date());
    assert.equal(await m.voice.isInVoiceNow(U1), false);
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
  assert.equal(Number(before), 12);
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
    roles: [{ id: "800000000000000001", name: "Support", position: 5, color: 0 }],
    members: [
      { discordId: NEW, username: "Recrue", avatarUrl: null, roleIds: [STAFF], joinedAt: null },
      { discordId: "700000000000000002", username: "Visiteur", avatarUrl: null, roleIds: [], joinedAt: null }
    ],
    voice: [{ discordId: NEW, channelId: "900000000000000001", roleIds: [STAFF] }],
    topRolePosition: 12
  });
  const synced = await api.applySync(snapshot);
  assert.equal(synced.members.inserted >= 1, true);
  assert.equal(synced.voice.opened, 1);
  assert.equal(await m.voice.isInVoiceNow(NEW), true);
  assert.equal((await m.status.getBotStatus()).alive, true);
  assert.equal((await m.status.getBotStatus()).topRolePosition, 12);
  assert.ok((await m.roles.listGuildRoles()).some((r) => r.name === "Support"));

  // a visitor without staff role never becomes staff
  assert.equal(await stat("700000000000000002"), undefined);

  // voice events
  const CH2 = "900000000000000002";
  await api.applyVoice(api.voiceEventSchema.parse({ action: "move", discordId: NEW, channelId: CH2, roleIds: [STAFF] }));
  assert.equal(await m.voice.isInVoiceNow(NEW), true);
  await api.applyVoice(api.voiceEventSchema.parse({ action: "leave", discordId: NEW }));
  assert.equal(await m.voice.isInVoiceNow(NEW), false);
  await assert.rejects(api.applyVoice(api.voiceEventSchema.parse({ action: "join", discordId: NEW })));

  // playtime pushed by the bot: only staff are stored
  const played = await api.applyPlaytime(api.playtimeSchema.parse({ totals: [{ discordId: NEW, seconds: 60 }, { discordId: "700000000000000002", seconds: 9 }] }));
  assert.equal(played.stored, 1);
  await db.run("DELETE FROM playtime_totals");
  await db.run("DELETE FROM playtime_snapshots");

  // member left the guild
  await api.applyMember(api.memberSchema.parse({ discordId: NEW, username: "Recrue", avatarUrl: null, roleIds: [], joinedAt: null, present: false }));
  assert.equal(await stat(NEW), undefined);

  // shutdown closes sessions and drops the heartbeat
  await api.applyVoice(api.voiceEventSchema.parse({ action: "join", discordId: A, channelId: CH2, roleIds: [STAFF] }));
  assert.equal((await api.applyShutdown()).closed >= 1, true);
  assert.equal((await m.status.getBotStatus()).alive, false);

  // invalid payloads are rejected
  assert.equal(api.voiceEventSchema.safeParse({ action: "dance", discordId: NEW }).success, false);
  assert.equal(api.memberSchema.safeParse({ discordId: "abc", username: "x", avatarUrl: null, roleIds: [], joinedAt: null }).success, false);
  assert.equal(api.playtimeSchema.safeParse({ totals: [{ discordId: NEW, seconds: -1 }] }).success, false);
  process.env.DISCORD_STAFF_ROLE_IDS = prevStaff;
});
