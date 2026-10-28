import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://site.test/";
process.env.BOT_API_TOKEN = "secret";

const { sitePost } = await import("../src/api");
const realFetch = globalThis.fetch;
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

test("posts JSON to /api/bot/<path> with the bearer token (trailing slash in SITE_URL ignored)", async () => {
  let seen: { url: string; auth: string | null; body: string } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, auth: new Headers(init.headers).get("authorization"), body: String(init.body) };
    return reply(200, { ok: true, closed: 2 });
  }) as typeof fetch;
  const result = await sitePost<{ closed: number }>("shutdown", { a: 1 });
  globalThis.fetch = realFetch;
  assert.deepEqual(result, { ok: true, closed: 2 } as never);
  assert.deepEqual(seen, { url: "http://site.test/api/bot/shutdown", auth: "Bearer secret", body: '{"a":1}' });
});

test("a 5xx is retried and can recover", async () => {
  let calls = 0;
  globalThis.fetch = (async () => (++calls < 2 ? reply(503) : reply(200, { ok: true }))) as typeof fetch;
  const result = await sitePost("tick", {}, 3);
  globalThis.fetch = realFetch;
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: true });
});

test("a 4xx (bad token / invalid body) is not retried", async () => {
  let calls = 0;
  globalThis.fetch = (async () => (++calls, reply(401, { error: "unauthorized" }))) as typeof fetch;
  const result = await sitePost("sync", {}, 3);
  globalThis.fetch = realFetch;
  assert.equal(calls, 1);
  assert.equal(result, null);
});
