import assert from "node:assert/strict";
import fs from "node:fs";
import { onRequestGet, readBoundedJson } from "../../../functions/api/corporate-actions.js";

const raw = JSON.parse(fs.readFileSync("src/lib/__tests__/fixtures/corporate-actions-source.json", "utf8"));
const cache = new Map<string, Response>();
Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
  match: async (request: Request) => cache.get(request.url)?.clone(),
  put: async (request: Request, response: Response) => { cache.set(request.url, response.clone()); },
} } });
const pending: Promise<unknown>[] = [];
const context = (query = "symbols=CUB,JAMNAAUTO") => ({
  request: new Request(`https://local.test/api/corporate-actions?${query}`, { headers: { cookie: "private-session", authorization: "never-forward" } }),
  waitUntil: (p: Promise<unknown>) => { pending.push(p); },
});
let calls = 0;
globalThis.fetch = async (input, options) => {
  calls++;
  assert.equal(String(input), "https://glow-central-research.tech-441.workers.dev/data/corporate-actions.json");
  assert.equal(options?.headers, undefined, "private cookies and holdings must not be forwarded");
  return Response.json(raw);
};
assert.equal((await onRequestGet(context("symbols=bad%20symbol"))).status, 400);
assert.equal((await onRequestGet(context("symbols=CUB&isins=bad"))).status, 400);
assert.equal(calls, 0, "invalid requests never fetch upstream");
const first = await (await onRequestGet(context())).json();
await Promise.all(pending);
assert.equal(first.ok, true);
assert.equal(first.retained, false);
assert.equal(first.feed.rows.length, 2);
assert.ok(first.feed.rows.every((r: { ticker: string }) => ["CUB", "JAMNAAUTO"].includes(r.ticker)));
await onRequestGet(context("symbols=V2RETAIL"));
assert.equal(calls, 1, "one cached market-wide capture serves every holding filter");

// Age the edge entry; a failed/older/shrunken response must retain the good data.
async function expire() {
  for (const [key, response] of cache) {
    const headers = new Headers(response.headers); headers.set("x-fetched-at", "0");
    cache.set(key, new Response(await response.clone().text(), { headers }));
  }
}
await expire();
globalThis.fetch = async () => { throw new Error("offline"); };
const offline = await (await onRequestGet(context())).json();
assert.equal(offline.retained, true);
assert.deepEqual(offline.feed.rows, first.feed.rows);
globalThis.fetch = async () => Response.json({ ...raw, capturedAt: "2020-01-01T00:00:00Z" });
assert.equal((await (await onRequestGet(context())).json()).retained, true);
globalThis.fetch = async () => Response.json({ ...raw, rows: [raw.rows[0]], rowCount: 1 });
assert.equal((await (await onRequestGet(context())).json()).retained, true);
globalThis.fetch = async () => Response.json({ version: 1, rows: [] });
assert.equal((await (await onRequestGet(context())).json()).retained, true);
cache.clear();
assert.equal((await onRequestGet(context())).status, 503, "no capture is not an empty success");
await assert.rejects(() => readBoundedJson(new Response("x", { headers: { "Content-Length": String(17 * 1024 * 1024) } })), /too large/);
await assert.rejects(() => readBoundedJson(new Response(new ReadableStream({ start(controller) {
  controller.enqueue(new Uint8Array(17 * 1024 * 1024)); controller.close();
} }))), /too large/, "chunked responses are bounded too");
assert.deepEqual(await readBoundedJson(Response.json({ ok: true })), { ok: true });
console.log("PASS Research proxy isolation, input validation, bounded reads, cache reuse and last-good retention");
