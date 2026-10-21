// THE SHARED KPI-TILE LAYOUT, BOTH ENDS.  npm run test:family
//
// *"When we are selecting a particular KPI tile, after changing the metric that
//  we want to see on it, make sure that it is being saved and next time when we
//  come on the dashboard it should be in the same format as it was after we
//  changed it."*
//
// ── WHY A TEST AND NOT A PROBE ──────────────────────────────────────────────
//
// `/api/tile-sets` is a Cloudflare Pages Function over the same KV namespace as
// the capital-call column, behind the same edge password, so the live store
// cannot be exercised from here. Every branch AROUND it is reachable against an
// in-memory KV, and they are the branches that decide whether a layout the
// family chose is kept or silently lost:
//
//   • a save must come back in the SAME answer, because KV's list is eventually
//     consistent and a reader who just picked a tile must never see it revert;
//   • only METRIC IDS are stored — a list that carries anything else is refused,
//     so nothing saved here can ever put a figure on screen;
//   • a write from another site is refused, because the session cookie is
//     `SameSite=None` and a browser WILL send it cross-site;
//   • an unconnected store says so, and the picker words that as "saved in this
//     browser only" rather than claiming a save that did not happen.
//
// And the client's PRECEDENCE rule, which is the part a reader actually feels:
// a change made in this browser that the store never confirmed is the newest
// thing anybody did to the strip, and must win over an older shared layout
// rather than being quietly overwritten on the next load.
import { onRequest, isTileSet, validateTileSet } from "../../../functions/api/tile-sets.js";
import type { KvLike } from "../../../functions/api/capital-calls.js";
import { readTileReply, chooseTileSet, TILE_REASONS, type LocalTileSet } from "../tileSets";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const SITE = "https://glow.example";

/** In-memory KV: metadata rides on `list`, `list` pages two keys at a time, and
 *  `list` can be frozen — which is what eventual consistency looks like to the
 *  function right after a write. */
function memoryKv() {
  const data = new Map<string, { value: string; metadata?: unknown }>();
  let frozen: [string, { value: string; metadata?: unknown }][] | null = null;
  let failList = false;
  let failPut = false;
  const kv: KvLike & { data: typeof data; freeze(): void; thaw(): void; breakList(on: boolean): void; breakPut(on: boolean): void } = {
    data,
    freeze() { frozen = [...data.entries()]; },
    thaw() { frozen = null; },
    breakList(on) { failList = on; },
    breakPut(on) { failPut = on; },
    async list({ prefix, cursor }) {
      if (failList) throw new Error("KV list failed");
      const all = (frozen ?? [...data.entries()]).filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + 2);
      const next = start + 2;
      return {
        keys: page.map(([name, v]) => ({ name, metadata: v.metadata })),
        list_complete: next >= all.length,
        cursor: next >= all.length ? undefined : String(next),
      };
    },
    async get(key) {
      const v = data.get(key);
      return v ? JSON.parse(v.value) : null;
    },
    async put(key, value, opts) {
      if (failPut) throw new Error("KV put failed");
      data.set(key, { value, metadata: opts?.metadata });
    },
    async delete(key) { data.delete(key); },
  };
  return kv;
}

type Body = { ok: boolean; sets?: Record<string, { ids: string[]; updatedAt: string }>; code?: string; message?: string };

async function call(
  kv: KvLike | undefined,
  init: { method?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {},
) {
  const method = init.method ?? (init.body !== undefined || init.raw !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = method === "POST"
    ? { "content-type": "application/json", origin: SITE, ...(init.headers ?? {}) }
    : { ...(init.headers ?? {}) };
  const request = new Request(`${SITE}/api/tile-sets`, {
    method,
    headers,
    body: method === "POST" ? (init.raw ?? JSON.stringify(init.body)) : undefined,
  });
  const res = await onRequest({ request, env: kv ? { GLOW_STORE: kv } : {} });
  const text = await res.text();
  let body: Body | null = null;
  try { body = JSON.parse(text); } catch { body = null; }
  // A fresh Response carrying the same bytes, for the client reader to parse.
  const again = () => new Response(text, { status: res.status, headers: res.headers });
  return { status: res.status, body, res, again };
}

// ────────────────────────────────────────────────────────────────────────────
console.log("── an unconnected store says so, and nothing is claimed saved ──");
{
  const g = await call(undefined);
  ok("GET with no GLOW_STORE binding answers 503 NOT_CONFIGURED", g.status === 503 && g.body?.code === "NOT_CONFIGURED", `${g.status} ${g.body?.code}`);
  const p = await call(undefined, { body: { page: "cio", ids: ["value"] } });
  ok("…and so does a save", p.status === 503 && p.body?.ok === false && p.body?.code === "NOT_CONFIGURED");
  const reply = await readTileReply(g.again());
  ok("the page reads that 503 as 'saved in this browser only', naming the store", !reply.ok && reply.reason === TILE_REASONS.notConfigured, JSON.stringify(reply));
}

console.log("── a save round-trips, and is in the SAME answer ──");
{
  const kv = memoryKv();
  const e = await call(kv);
  ok("an empty store answers ok with no sets", e.status === 200 && e.body?.ok === true && Object.keys(e.body?.sets ?? {}).length === 0);

  const s = await call(kv, { body: { page: "cio", ids: ["value", "mwr", "uncalled"] } });
  ok("a save answers 200 with the set in it", s.status === 200 && JSON.stringify(s.body?.sets?.cio?.ids) === JSON.stringify(["value", "mwr", "uncalled"]), JSON.stringify(s.body));
  ok("…stored under one key per page, carrying itself as metadata", kv.data.has("tile-set:cio") && isTileSet(kv.data.get("tile-set:cio")?.metadata));

  const g = await call(kv);
  ok("a later read returns it", JSON.stringify(g.body?.sets?.cio?.ids) === JSON.stringify(["value", "mwr", "uncalled"]));

  // Two pages are two keys and cannot collide.
  await call(kv, { body: { page: "private-market", ids: ["value", "cost"] } });
  const both = await call(kv);
  ok("two pages keep two sets", both.body?.sets?.cio?.ids.length === 3 && both.body?.sets?.["private-market"]?.ids.length === 2);

  // Last write wins on one page.
  await call(kv, { body: { page: "cio", ids: ["return"] } });
  const last = await call(kv);
  ok("a second save to the same page replaces the first", JSON.stringify(last.body?.sets?.cio?.ids) === JSON.stringify(["return"]));

  // Eventual consistency: freeze list at a snapshot BEFORE the write.
  kv.freeze();
  const stale = await call(kv, { body: { page: "cio", ids: ["value", "gain"] } });
  ok("with KV's list still stale, the saver still sees their own layout in the answer",
    JSON.stringify(stale.body?.sets?.cio?.ids) === JSON.stringify(["value", "gain"]), JSON.stringify(stale.body?.sets?.cio));
  kv.thaw();

  const reply = await readTileReply(stale.again());
  ok("the page reads the server's own answer into { page: ids }",
    reply.ok && JSON.stringify(reply.sets.cio) === JSON.stringify(["value", "gain"]) && reply.sets["private-market"]?.length === 2, JSON.stringify(reply));

  // Many pages, so the cursor loop pages more than once.
  for (const p of ["a1", "a2", "a3", "a4", "a5"]) await call(kv, { body: { page: p, ids: ["x"] } });
  const paged = await call(kv);
  ok("the read follows the list cursor across pages", Object.keys(paged.body?.sets ?? {}).length === 7, Object.keys(paged.body?.sets ?? {}).join(","));
}

console.log("── only a list of metric ids is ever stored ──");
{
  const now = new Date("2026-09-23T10:00:00Z");
  const v = validateTileSet({ page: "cio", ids: ["value", "mwr", "value"] }, now);
  ok("a repeated id is dropped, not refused", JSON.stringify(v.set?.ids) === JSON.stringify(["value", "mwr"]));
  ok("…and the set is stamped", v.set?.updatedAt === now.toISOString());
  ok("an empty list is refused — a page keeps at least one tile", !!validateTileSet({ page: "cio", ids: [] }).error);
  ok("a page name that is not an id is refused", !!validateTileSet({ page: "../cio", ids: ["value"] }).error);
  ok("a number where an id belongs is refused", !!validateTileSet({ page: "cio", ids: ["value", 42] }).error);
  ok("an id carrying anything but a slug is refused", !!validateTileSet({ page: "cio", ids: ["₹12 Cr"] }).error);
  ok("a figure dressed as an object is refused", !!validateTileSet({ page: "cio", ids: [{ id: "value", figure: 1 }] }).error);
  ok("more tiles than any page offers is refused", !!validateTileSet({ page: "cio", ids: Array.from({ length: 41 }, (_, i) => `m${i}`) }).error);

  const kv = memoryKv();
  const bad = await call(kv, { body: { page: "cio", ids: ["₹12 Cr"] } });
  ok("the function answers 400 with ONE sentence and writes nothing", bad.status === 400 && typeof bad.body?.message === "string" && kv.data.size === 0, bad.body?.message);

  // A record some other writer left that is not a tile set is ignored, never drawn.
  kv.data.set("tile-set:odd", { value: "{}", metadata: { page: "odd", ids: "value" } });
  const g = await call(kv);
  ok("a malformed stored record is skipped on read", !("odd" in (g.body?.sets ?? {})));
}

console.log("── only this site's own page may write ──");
{
  const kv = memoryKv();
  const foreign = await call(kv, { body: { page: "cio", ids: ["value"] }, headers: { origin: "https://evil.example" } });
  ok("a foreign Origin is refused 403", foreign.status === 403 && foreign.body?.code === "CROSS_ORIGIN");
  const xsite = await call(kv, { body: { page: "cio", ids: ["value"] }, headers: { origin: "", "sec-fetch-site": "cross-site" } });
  ok("sec-fetch-site: cross-site is refused 403", xsite.status === 403);
  const form = await call(kv, { raw: "page=cio&ids=value", headers: { "content-type": "application/x-www-form-urlencoded" } });
  ok("a form post (which needs no preflight) is refused 415", form.status === 415 && form.body?.code === "NOT_JSON");
  const big = await call(kv, { raw: JSON.stringify({ page: "cio", ids: ["value"], pad: "x".repeat(5000) }) });
  ok("a body larger than one layout is refused 413", big.status === 413);
  const del = await call(kv, { method: "DELETE" });
  ok("any other method is refused 405", del.status === 405);
  ok("…and none of those wrote anything", kv.data.size === 0);
}

console.log("── a store that fails says so, and a failed save claims nothing ──");
{
  const kv = memoryKv();
  kv.breakList(true);
  const g = await call(kv);
  ok("a failing list answers 502 STORE_ERROR", g.status === 502 && g.body?.code === "STORE_ERROR");
  const reply = await readTileReply(g.again());
  ok("…which the page words as 'the shared store did not answer'", !reply.ok && reply.reason === TILE_REASONS.noAnswer);
  kv.breakList(false);
  kv.breakPut(true);
  const p = await call(kv, { body: { page: "cio", ids: ["value"] } });
  ok("a failing write answers 502 and is not reported saved", p.status === 502 && p.body?.ok === false);
}

console.log("── the page names the cause of a non-answer ──");
{
  const login = new Response('<form action="/__auth/login">', { status: 200, headers: { "content-type": "text/html" } });
  const r1 = await readTileReply(login);
  ok("the edge gate's login page → signed out", !r1.ok && r1.reason === TILE_REASONS.signedOut);
  const spa = new Response("<!doctype html><div id=root>", { status: 200, headers: { "content-type": "text/html" } });
  const r2 = await readTileReply(spa);
  ok("the SPA's own index.html (no function running) → store not running here", !r2.ok && r2.reason === TILE_REASONS.noFunction);
  const junk = new Response("{not json", { status: 200, headers: { "content-type": "application/json" } });
  const r3 = await readTileReply(junk);
  ok("an unreadable JSON answer → did not answer, never an empty layout", !r3.ok && r3.reason === TILE_REASONS.noAnswer);
  const partial = new Response(JSON.stringify({ ok: true, sets: { cio: { ids: ["value"] }, bad: { ids: [] }, worse: { ids: [1, 2] } } }), { headers: { "content-type": "application/json" } });
  const r4 = await readTileReply(partial);
  ok("a set with no ids, or non-string ids, is dropped rather than drawn blank",
    r4.ok && Object.keys(r4.sets).join(",") === "cio", r4.ok ? Object.keys(r4.sets).join(",") : "");
}

console.log("── which set a page opens on ──");
{
  const shared = ["value", "mwr", "return"];
  const local = (ids: string[], synced: boolean, legacy = false): LocalTileSet => ({ ids, synced, ...(legacy ? { legacy } : {}) });

  const a = chooseTileSet({ fromParam: ["gain"], local: local(["cash"], false), shared, sharedLoaded: true });
  ok("a ?tiles= address wins over everything, and is never pushed", JSON.stringify(a.ids) === '["gain"]' && !a.push);

  const b = chooseTileSet({ fromParam: null, local: local(["cash", "gain"], false), shared, sharedLoaded: true });
  ok("an UNSYNCED change in this browser wins over an older shared layout", JSON.stringify(b.ids) === '["cash","gain"]');
  ok("…and is pushed once the store has answered", b.push);

  const b2 = chooseTileSet({ fromParam: null, local: local(["cash"], false), shared: null, sharedLoaded: false });
  ok("…but not before the store has answered — no save races the first read", JSON.stringify(b2.ids) === '["cash"]' && !b2.push);

  const c = chooseTileSet({ fromParam: null, local: local(["cash"], true), shared, sharedLoaded: true });
  ok("a CONFIRMED local copy yields to the shared layout (someone changed it since)", JSON.stringify(c.ids) === JSON.stringify(shared) && !c.push);

  const d = chooseTileSet({ fromParam: null, local: local(["cash"], false, true), shared, sharedLoaded: true });
  ok("an older build's bare array is of unknown age and yields to the shared layout", JSON.stringify(d.ids) === JSON.stringify(shared) && !d.push);

  const e = chooseTileSet({ fromParam: null, local: local(["cash"], false, true), shared: null, sharedLoaded: true });
  ok("…but where the store holds nothing for the page, it is the layout and is pushed", JSON.stringify(e.ids) === '["cash"]' && e.push);

  const f = chooseTileSet({ fromParam: null, local: null, shared, sharedLoaded: true });
  ok("a new device opens on the shared layout", JSON.stringify(f.ids) === JSON.stringify(shared) && !f.push);

  const g = chooseTileSet({ fromParam: null, local: null, shared: null, sharedLoaded: true });
  ok("nothing chosen anywhere → null, and the strip draws its defaults", g.ids === null && !g.push);

  const h = chooseTileSet({ fromParam: null, local: local(["cash"], true), shared: null, sharedLoaded: false });
  ok("with the store unreachable, this browser's copy is the layout", JSON.stringify(h.ids) === '["cash"]' && !h.push);
}

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall tile-set checks passed");
