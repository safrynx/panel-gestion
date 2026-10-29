import { test } from "node:test";
import assert from "node:assert/strict";
import { PermissionFlagsBits } from "discord.js";

process.env.SITE_URL = "http://site.test";
process.env.BOT_API_TOKEN = "secret";

const { Tracker, addedDangerous, isDangerous } = await import("../src/antiraid");

const item = (label: string) => ({ at: 0, undo: null, label });

test("tracker: tolerated actions pass, the one past the limit undoes the whole window, then each new one at once", () => {
  const t = new Tracker();
  const rule = { enabled: true, max: 2, windowSec: 60 };
  const now = 1_000_000;
  assert.equal(t.push("g:a:ban", rule, item("1"), now).triggered, false);
  assert.equal(t.push("g:a:ban", rule, item("2"), now + 1000).triggered, false);
  const third = t.push("g:a:ban", rule, item("3"), now + 2000);
  assert.deepEqual([third.triggered, third.firstTrigger, third.toUndo.map((i) => i.label)], [true, true, ["1", "2", "3"]]);
  const fourth = t.push("g:a:ban", rule, item("4"), now + 3000);
  assert.deepEqual([fourth.triggered, fourth.firstTrigger, fourth.toUndo.map((i) => i.label)], [true, false, ["4"]]);
  // Another author, another rule: counted apart.
  assert.equal(t.push("g:b:ban", rule, item("x"), now).triggered, false);
});

test("tracker: max 0 triggers on the first action; old actions leave the window", () => {
  const t = new Tracker();
  assert.equal(t.push("g:a:role_delete", { enabled: true, max: 0, windowSec: 60 }, item("r"), 0).firstTrigger, true);
  const rule = { enabled: true, max: 1, windowSec: 10 };
  t.push("g:c:kick", rule, item("1"), 0);
  assert.equal(t.push("g:c:kick", rule, item("2"), 11_000).triggered, false); // the first one is 11 s old
  assert.equal(t.push("g:c:kick", rule, item("3"), 12_000).triggered, true);
});

test("dangerous permissions", () => {
  assert.equal(isDangerous(PermissionFlagsBits.Administrator), true);
  assert.equal(isDangerous(PermissionFlagsBits.SendMessages | PermissionFlagsBits.Connect), false);
  const base = PermissionFlagsBits.SendMessages;
  assert.equal(addedDangerous(base, base | PermissionFlagsBits.BanMembers), true);
  assert.equal(addedDangerous(String(base | PermissionFlagsBits.ManageRoles), String(base | PermissionFlagsBits.ManageRoles)), false); // already had it
  assert.equal(addedDangerous(base | PermissionFlagsBits.Administrator, base), false); // removing is fine
});

test("message protection: @everyone, mass mentions, invites and links, each only when enabled", async () => {
  const { messageViolation } = await import("../src/messages");
  const rules = { blockEveryone: true, maxMentions: 5, blockInvites: true, blockLinks: false };
  const msg = (content: string, mentionCount = 0, everyone = false) => ({ content, mentionCount, everyone });
  assert.equal(messageViolation(msg("salut @everyone"), rules), "everyone_mention");
  assert.equal(messageViolation(msg("", 0, true), rules), "everyone_mention");
  assert.equal(messageViolation(msg("hey", 6), rules), "mass_mention");
  assert.equal(messageViolation(msg("hey", 5), rules), null);
  assert.equal(messageViolation(msg("rejoins discord.gg/abc123"), rules), "invite_link");
  assert.equal(messageViolation(msg("https://youtube.com/x"), rules), null);
  assert.equal(messageViolation(msg("https://youtube.com/x"), { ...rules, blockLinks: true }), "link");
  assert.equal(messageViolation(msg("@here"), { ...rules, blockEveryone: false }), null);
});

test("restore order: categories before their channels, then by position", async () => {
  const { channelOrder } = await import("../src/backup");
  const ch = (id: string, type: number, position: number) => ({ id, name: id, type, parentId: null, position, overwrites: [] });
  assert.deepEqual(channelOrder([ch("text2", 0, 2), ch("cat", 4, 5), ch("text1", 0, 1), ch("cat0", 4, 0)]).map((c) => c.id), ["cat0", "cat", "text1", "text2"]);
});
