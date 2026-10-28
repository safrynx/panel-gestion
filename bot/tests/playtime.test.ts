import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlaytimeRows, playtimeSources } from "../src/playtime";

const G1 = "500000000000000001";
const G2 = "500000000000000002";

test("game databases: one per guild from FIVEM_DATABASES_JSON, legacy FIVEM_DB_URL maps to DISCORD_GUILD_ID", () => {
  const sources = playtimeSources({
    DISCORD_GUILD_ID: G1,
    FIVEM_DB_URL: "mysql://a",
    FIVEM_DB_PLAYTIME_UNIT: "hours",
    FIVEM_DATABASES_JSON: JSON.stringify({ [G2]: { url: "mysql://b", table: "players", unit: "seconds" } })
  });
  assert.deepEqual(sources.map((s) => [s.guildId, s.url, s.table, s.factor]), [[G1, "mysql://a", "users", 3600], [G2, "mysql://b", "players", 1]]);
  assert.deepEqual(playtimeSources({ FIVEM_DB_URL: "mysql://a" }), []); // no guild to attach it to
  assert.deepEqual(playtimeSources({}), []);
});

test("game databases: invalid configuration is refused", () => {
  assert.throws(() => playtimeSources({ FIVEM_DATABASES_JSON: JSON.stringify({ "not-a-guild": { url: "mysql://x" } }) }), /not a Discord guild id/);
  assert.throws(() => playtimeSources({ FIVEM_DATABASES_JSON: JSON.stringify({ [G2]: {} }) }), /url is missing/);
  assert.throws(() => playtimeSources({ FIVEM_DATABASES_JSON: JSON.stringify({ [G2]: { url: "mysql://x", table: "users; DROP" } }) }), /identifier/);
  assert.throws(() => playtimeSources({ FIVEM_DATABASES_JSON: JSON.stringify({ [G2]: { url: "mysql://x", unit: "days" } }) }), /unit/);
});

test("playtime rows: discord: prefix stripped, characters summed, bad rows skipped", () => {
  const rows = [
    { did: "discord:100000000000000001", pt: 10 },
    { did: "100000000000000001", pt: 5 },
    { did: "steam:abc", pt: 99 },
    { did: "100000000000000002", pt: -1 }
  ];
  assert.deepEqual(parsePlaytimeRows(rows, 60), [{ discordId: "100000000000000001", seconds: 900 }]);
});
