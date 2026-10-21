import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_PATH = ":memory:";
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
  fivemDb: typeof import("../src/lib/fivem-db");
  report: typeof import("../src/lib/report");
};
let m: Mods;
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
    fivemDb: await import("../src/lib/fivem-db"),
    report: await import("../src/lib/report")
  };
});

const member = (discordId: string, roleIds: string[]) => ({
  discordId, username: `u${discordId.slice(-1)}`, avatarUrl: null, roleIds, joinedAt: null, presentInGuild: true
});

test("grade resolution: highest level wins, non-staff gets none", () => {
  assert.deepEqual(m.config.resolveGradeFromRoles(["r-mod", "r-admin"]), { grade: "Admin", gradeLevel: 4, roleId: "r-admin" });
  assert.equal(m.config.resolveGradeFromRoles(["other"]), null);
});

test("hierarchy: cannot manage equal/higher or assign >= own level", () => {
  assert.equal(m.grades.canManageGrade(4, 2, 3), true);
  assert.equal(m.grades.canManageGrade(4, 4, 1), false);
  assert.equal(m.grades.canManageGrade(4, 2, 4), false);
});

test("sync inserts staff, ignores non-staff, marks left, keeps history", () => {
  const r1 = m.sync.syncStaffMembers([member(A, ["r-admin"]), member(B, ["r-mod"]), member("100000000000000003", ["x"])]);
  assert.deepEqual([r1.inserted, r1.updated], [2, 0]);
  m.db.db.prepare("INSERT INTO staff_notes (discord_id, body, author_discord_id) VALUES (?, 'n', ?)").run(B, A);
  const r2 = m.sync.syncStaffMembers([member(A, ["r-admin"])]);
  assert.equal(r2.markedLeft, 1);
  assert.equal(m.sync.listStaffWithStats().length, 1);
  // B returns: same row reactivated, note preserved.
  m.sync.syncStaffMembers([member(A, ["r-admin"]), member(B, ["r-mod"])]);
  const b = m.sync.listStaffWithStats().find((s) => s.discordId === B)!;
  assert.equal(b.notesCount, 1);
  assert.equal(b.grade, "Moderator");
});

test("voice sessions: open, move, close accumulate seconds; non-staff ignored", () => {
  const t0 = new Date("2026-01-01T10:00:00Z");
  m.voice.openVoiceSession(A, ["r-admin"], "c1", t0);
  assert.equal(m.voice.isInVoiceNow(A), true);
  m.voice.moveVoiceSession(A, ["r-admin"], "c2", new Date(t0.getTime() + 60_000));
  m.voice.closeVoiceSession(A, new Date(t0.getTime() + 180_000));
  assert.equal(m.voice.isInVoiceNow(A), false);
  assert.equal(m.voice.voiceSecondsFor(A), 180);
  m.voice.openVoiceSession("999", ["nope"], "c1", t0);
  assert.equal(m.voice.isInVoiceNow("999"), false);
  assert.equal(m.sync.listStaffWithStats().find((s) => s.discordId === A)!.voiceSeconds, 180);
});

test("fivem: token check, idempotent start, end computes seconds", () => {
  assert.equal(m.fivem.verifyAgentToken("secret-token"), true);
  assert.equal(m.fivem.verifyAgentToken("wrong-token!"), false);
  const ts = Math.floor(Date.now() / 1000) - 600;
  const start = { event: "session_start" as const, discordId: A, sessionId: "s1", timestamp: ts };
  assert.deepEqual(m.fivem.ingestFivemEvent(start), { ok: true, action: "opened" });
  assert.deepEqual(m.fivem.ingestFivemEvent(start), { ok: true, action: "ignored" });
  assert.equal(m.fivem.isInFivemNow(A), true);
  assert.deepEqual(m.fivem.ingestFivemEvent({ ...start, event: "session_end", timestamp: ts + 300 }), { ok: true, action: "closed" });
  assert.equal(m.sync.listStaffWithStats().find((s) => s.discordId === A)!.fivemSeconds, 300);
  assert.deepEqual(m.fivem.ingestFivemEvent({ ...start, discordId: "555555555555555555", sessionId: "s2" }), { ok: true, action: "ignored" });
});

test("session cookie: roundtrip, tamper and expiry rejected; oauth state single-use", () => {
  const tok = m.session.encodeSession({ discordId: A, username: "a", avatarUrl: null, roles: ["r-admin"] });
  assert.equal(m.session.decodeSession(tok)?.discordId, A);
  assert.equal(m.session.decodeSession(tok.slice(0, -2) + "xx"), null);
  m.session.storeState(m.db.db, "st1");
  assert.equal(m.session.verifyAndConsumeState(m.db.db, "st1"), true);
  assert.equal(m.session.verifyAndConsumeState(m.db.db, "st1"), false);
});

test("panel access: seeded roles/users, owner, add/remove", () => {
  const { hasPanelAccess } = m.config;
  assert.equal(hasPanelAccess("1243884102407422024", []), true); // seeded user
  assert.equal(hasPanelAccess("1130169424905785354", []), true);
  assert.equal(hasPanelAccess("5", ["1557788967414407229"]), true); // seeded role
  assert.equal(hasPanelAccess("5", ["1557788898497659012"]), true);
  assert.equal(hasPanelAccess("5", ["something-else"]), false);
  assert.equal(hasPanelAccess("900000000000000001", []), true); // owner from env
  m.db.db.prepare("INSERT INTO panel_access (kind, discord_id) VALUES ('user', '777')").run();
  assert.equal(hasPanelAccess("777", []), true);
  m.db.db.prepare("DELETE FROM panel_access WHERE discord_id = '777'").run();
  assert.equal(hasPanelAccess("777", []), false);
});

test("avert roles are detected by name and levels read from roles", () => {
  m.roles.storeGuildRoles([
    { id: "w1", name: "Avert 1", position: 3, color: 0 },
    { id: "w2", name: "Avertissement 2", position: 4, color: 0 },
    { id: "w3", name: "avert 3", position: 5, color: 0 },
    { id: "other", name: "Autre", position: 6, color: 0 }
  ]);
  assert.deepEqual(m.config.getWarnRoles().map((w) => [w.level, w.roleId]), [[1, "w1"], [2, "w2"], [3, "w3"]]);
  assert.equal(m.config.warnLevelFromRoles(["w2", "x"]), 2);
  assert.equal(m.config.warnLevelFromRoles(["x"]), 0);
});

test("grade ladder from Discord positions when no env mapping", () => {
  const saved = process.env.GRADE_ROLE_MAPPING_JSON;
  process.env.GRADE_ROLE_MAPPING_JSON = "{}";
  m.roles.storeGuildRoles([
    { id: "g-low", name: "Helper", position: 10, color: 0 },
    { id: "g-high", name: "Admin", position: 30, color: 0 },
    { id: "g-mid", name: "Mod", position: 20, color: 0 }
  ]);
  const ins = m.db.db.prepare("INSERT OR IGNORE INTO grade_roles (role_id) VALUES (?)");
  for (const id of ["g-high", "g-low", "g-mid"]) ins.run(id);
  assert.deepEqual(m.config.getGradeLadder().map((g) => [g.name, g.level]), [["Helper", 1], ["Mod", 2], ["Admin", 3]]);
  assert.equal(m.config.resolveGradeFromRoles(["g-mid", "g-low"])?.grade, "Mod");
  assert.equal(m.config.hasStaffRole(["g-low"]), true);
  m.db.db.prepare("DELETE FROM grade_roles").run();
  process.env.GRADE_ROLE_MAPPING_JSON = saved;
});

test("fivem db rows: discord: prefix, units, several characters summed, junk ignored", () => {
  const rows = [
    { did: "discord:123456789012345678", pt: 10 },
    { did: "123456789012345678", pt: 5 },
    { did: "not-an-id", pt: 99 },
    { did: "223456789012345678", pt: "-3" },
    { did: "323456789012345678", pt: "7" }
  ];
  const totals = m.fivemDb.parsePlaytimeRows(rows, 60);
  assert.equal(totals.get("123456789012345678"), 900);
  assert.equal(totals.get("323456789012345678"), 420);
  assert.equal(totals.size, 2);
});

test("week range: Monday-based, current week partial, past week complete", () => {
  const now = new Date(2026, 9, 21, 15, 0, 0); // Wednesday 21 Oct 2026
  const cur = m.report.weekRange(0, now);
  assert.equal(cur.start.getDay(), 1);
  assert.equal(cur.start.getDate(), 19);
  assert.equal(cur.partial, true);
  const prev = m.report.weekRange(1, now);
  assert.equal(prev.start.getDate(), 12);
  assert.equal(prev.partial, false);
  assert.equal(prev.end.getDate(), 19);
});

test("voice presence is only shown while the bot heartbeat is fresh", async () => {
  const status = await import("../src/lib/bot-status");
  const t0 = new Date();
  m.voice.openVoiceSession(B, ["r-mod"], "c9", t0);
  assert.equal(m.sync.listStaffWithStats().find((s) => s.discordId === B)!.inVoice, false); // no heartbeat yet
  status.setBotStatus("heartbeat", new Date().toISOString());
  assert.equal(m.sync.listStaffWithStats().find((s) => s.discordId === B)!.inVoice, true);
  status.clearBotHeartbeat();
  assert.equal(m.sync.listStaffWithStats().find((s) => s.discordId === B)!.inVoice, false);
  m.voice.closeVoiceSession(B, new Date(t0.getTime() + 1000));
});

test("latest comment shows its author", () => {
  m.db.db.prepare("INSERT INTO staff_notes (discord_id, body, author_discord_id, author_name) VALUES (?, 'ok', ?, 'Chef')").run(B, A);
  const row = m.sync.listStaffWithStats().find((s) => s.discordId === B)!;
  assert.deepEqual([row.lastNote?.body, row.lastNote?.author], ["ok", "Chef"]);
});

test("permissions: migrated entries keep their rights, new ones get the basics, roles and users cumulate, owner has all", async () => {
  const perms = await import("../src/lib/permissions");
  const seeded = m.config.getPermissions("1243884102407422024", []);
  assert.ok(seeded.includes("rank_up") && seeded.includes("warn_add") && !seeded.includes("view_logs"));
  m.db.db.prepare("INSERT INTO panel_access (kind, discord_id) VALUES ('user', '888')").run(); // no permissions column value
  assert.deepEqual(m.config.getPermissions("888", []), perms.DEFAULT_NEW_PERMISSIONS);
  m.db.db.prepare("INSERT INTO panel_access (kind, discord_id, permissions) VALUES ('role', 'r-logs', '[\"view_logs\"]')").run();
  const merged = m.config.getPermissions("888", ["r-logs"]);
  assert.ok(merged.includes("view_logs") && merged.includes("comment"));
  assert.equal(m.config.getPermissions("900000000000000001", []).length, perms.ALL_PERMISSIONS.length);
  assert.deepEqual(m.config.getPermissions("nobody", []), []);
  m.db.db.prepare("DELETE FROM panel_access WHERE discord_id IN ('888','r-logs')").run();
});

test("logs: names, readable details, group filter and search", async () => {
  const { audit } = await import("../src/lib/audit");
  const { listLogs } = await import("../src/lib/logs");
  audit({ discordId: A, username: "Chef" }, "rank_up", B, { from: "Helper", to: "Mod", reason: "bon boulot" });
  audit({ discordId: A, username: "Chef" }, "rank_demote_failed", B, { discordStatus: 403 });
  audit({ discordId: A, username: "Chef" }, "warn_add", B, { level: 2, reason: "retard" });
  const all = listLogs({});
  const up = all.rows.find((r) => r.action === "rank_up")!;
  assert.equal(up.actorName, "Chef");
  assert.equal(up.details, "Helper → Mod — « bon boulot »");
  assert.equal(up.tone, "up");
  const failed = listLogs({ group: "failed" });
  assert.ok(failed.rows.every((r) => r.action.endsWith("_failed")) && failed.total >= 1);
  assert.match(failed.rows[0].details, /rôle du bot trop bas/);
  assert.ok(listLogs({ group: "warnings" }).rows.every((r) => r.action.startsWith("warn")));
  assert.ok(listLogs({ q: "chef" }).total >= 3);
  assert.equal(listLogs({ q: "zzz-nobody" }).total, 0);
});

test("AI review parsing tolerates fences and rejects bad ratings", async () => {
  const { parseReview } = await import("../src/lib/review");
  assert.deepEqual(parseReview('```json\n{"rating":"Green","summary":"Très présent."}\n```'), { rating: "green", summary: "Très présent." });
  assert.equal(parseReview('{"rating":"purple","summary":"x"}'), null);
  assert.equal(parseReview('{"rating":"red","summary":""}'), null);
  assert.equal(parseReview("pas de json"), null);
});

test("weekly review: AI summary + pastille per commented member, idempotent, force replaces badge", async () => {
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
    m.db.db.prepare("INSERT INTO staff_notes (discord_id, body, author_discord_id, author_name) VALUES (?, 'Très actif', ?, 'Chef')").run(A, B);
    const first = await review.generateWeeklyReviews(0, { delayMs: 0 });
    assert.ok(first.ok && first.generated >= 1 && first.failed === 0);
    const callsAfterFirst = calls;
    const again = await review.generateWeeklyReviews(0, { delayMs: 0 });
    assert.ok(again.ok && again.generated === 0 && again.skipped >= 1);
    assert.equal(calls, callsAfterFirst); // no second AI call for already-reviewed members

    const key = (await import("../src/lib/week")).weekKey((await import("../src/lib/week")).weekRange(0));
    assert.equal(review.getReviews(key).get(A)?.rating, "green");
    const active = () => m.db.db.prepare("SELECT color FROM staff_badges WHERE discord_id = ? AND author_discord_id = 'ia' AND status = 'active'").all(A) as { color: string }[];
    assert.deepEqual(active().map((b) => b.color), ["green"]);

    verdict = "blue";
    await review.generateWeeklyReviews(0, { delayMs: 0, force: true });
    assert.deepEqual(active().map((b) => b.color), ["blue"]); // old AI badge resolved, only the new one is active
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.AI_API_KEY;
  }
  assert.deepEqual(await review.generateWeeklyReviews(0), { ok: false, error: "ai_not_configured" });
});

test("counter reset: lists restart from zero, history and weekly reports are untouched, live sessions keep counting", async () => {
  const stats = await import("../src/lib/stats");
  const counters = await import("../src/lib/counters");
  const status = await import("../src/lib/bot-status");
  const week = await import("../src/lib/week");
  const secondsOf = async (apply = true) => (await stats.getStaffOverview(undefined, undefined, apply)).find((s) => s.discordId === A)!;

  // A already has 180s of voice history from an earlier test (started in 2026-01).
  const before = await secondsOf();
  assert.ok(before.voiceSeconds >= 180);

  // a member currently in voice at the moment of the reset
  status.setBotStatus("heartbeat", new Date().toISOString());
  m.voice.openVoiceSession(A, ["r-admin"], "c5", new Date(Date.now() - 5 * 60_000));
  const result = await counters.resetCounters({ discordId: A, username: "Chef" });
  assert.equal(result.restartedVoice, 1);
  assert.equal(result.fivemSnapshot, false); // no FIVEM_DB_URL in tests

  const after = await secondsOf();
  assert.ok(after.voiceSeconds < 5, `expected a fresh counter, got ${after.voiceSeconds}`);
  assert.equal(after.inVoice, true); // still in voice, now counting from the reset
  assert.ok((await secondsOf(false)).voiceSeconds >= before.voiceSeconds); // history kept (weekly reports ignore the reset)
  assert.equal((await stats.getStaffOverview(new Date(Date.now() - 86400_000))).find((s) => s.discordId === A)!.voiceSeconds < 5, true);

  // the reset point never moves a window earlier than requested
  assert.equal(stats.countersSince(new Date(Date.now() + 1000))!.getTime() > Date.now(), true);
  assert.ok(week.weekRange(0).start.getTime() <= Date.now());

  m.voice.closeVoiceSession(A, new Date());
  status.clearBotHeartbeat();
  m.db.db.prepare("DELETE FROM bot_status WHERE key = 'counters_reset_at'").run();
});

test("bot API: sync snapshot, member event, voice events, heartbeat, shutdown", async () => {
  const api = await import("../src/lib/bot-api");
  const guard = await import("../src/lib/bot-guard");
  const status = await import("../src/lib/bot-status");

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
  const synced = api.applySync(snapshot);
  assert.equal(synced.members.inserted >= 1, true);
  assert.equal(synced.voice.opened, 1);
  assert.equal(m.voice.isInVoiceNow(NEW), true);
  assert.equal(status.getBotStatus().alive, true);
  assert.equal(status.getBotStatus().topRolePosition, 12);
  assert.ok(m.roles.listGuildRoles().some((r) => r.name === "Support"));

  // a visitor without staff role never becomes staff
  assert.equal(m.sync.listStaffWithStats().some((s) => s.discordId === "700000000000000002"), false);

  // voice events
  const CH2 = "900000000000000002";
  api.applyVoice(api.voiceEventSchema.parse({ action: "move", discordId: NEW, channelId: CH2, roleIds: [STAFF] }));
  assert.equal(m.voice.isInVoiceNow(NEW), true);
  api.applyVoice(api.voiceEventSchema.parse({ action: "leave", discordId: NEW }));
  assert.equal(m.voice.isInVoiceNow(NEW), false);
  assert.throws(() => api.applyVoice(api.voiceEventSchema.parse({ action: "join", discordId: NEW })));

  // member left the guild
  api.applyMember(api.memberSchema.parse({ discordId: NEW, username: "Recrue", avatarUrl: null, roleIds: [], joinedAt: null, present: false }));
  assert.equal(m.sync.listStaffWithStats().some((s) => s.discordId === NEW), false);

  // shutdown closes sessions and drops the heartbeat
  api.applyVoice(api.voiceEventSchema.parse({ action: "join", discordId: A, channelId: CH2, roleIds: [STAFF] }));
  assert.equal(api.applyShutdown().closed >= 1, true);
  assert.equal(status.getBotStatus().alive, false);

  // invalid payloads are rejected
  assert.equal(api.voiceEventSchema.safeParse({ action: "dance", discordId: NEW }).success, false);
  assert.equal(api.memberSchema.safeParse({ discordId: "abc", username: "x", avatarUrl: null, roleIds: [], joinedAt: null }).success, false);
  process.env.DISCORD_STAFF_ROLE_IDS = prevStaff;
});
