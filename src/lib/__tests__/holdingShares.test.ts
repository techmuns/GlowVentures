// THE SHARED SHARE-COUNT STORE, BOTH ENDS (#434).  npm run test:family
//
//   *"Enter private share counts from CAS / MGT-7, or by hand, where the
//    statement carries none."*
//
// `/api/holding-shares` lets the family type the share count a private holding's
// statement omits, so the stake can be struck (`stakeTrail`). Every branch
// around the shared store is reachable against an in-memory one: whether a count
// is kept, refused, or lost — and, because a count with no document behind it is
// exactly the figure this dashboard refuses to show, that a SOURCE is required.
import { onRequest, isShares, validateShares } from "../../../functions/api/holding-shares.js";
import { readReply, parseShares, sharesFor, sharesText, REASONS, type HoldingShares } from "../holdingShares";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const SITE = "https://glow.example";
const PREFIX = "holding-shares:";

function memoryKv() {
  const data = new Map<string, { value: string; metadata?: unknown }>();
  let frozen: [string, { value: string; metadata?: unknown }][] | null = null;
  let failList = false, failPut = false;
  const kv = {
    data,
    freeze() { frozen = [...data.entries()]; },
    thaw() { frozen = null; },
    breakList(on: boolean) { failList = on; },
    breakPut(on: boolean) { failPut = on; },
    async list({ prefix, cursor }: { prefix: string; cursor?: string }) {
      if (failList) throw new Error("list failed");
      const all = (frozen ?? [...data.entries()]).filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + 2);
      const next = start + 2;
      return { keys: page.map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: next >= all.length, cursor: next >= all.length ? undefined : String(next) };
    },
    async get(key: string) { const v = data.get(key); return v ? JSON.parse(v.value) : null; },
    async put(key: string, value: string, opts?: { metadata?: unknown }) { if (failPut) throw new Error("put failed"); data.set(key, { value, metadata: opts?.metadata }); },
    async delete(key: string) { data.delete(key); },
  };
  return kv;
}

type Body = { ok: boolean; shares?: HoldingShares[]; key?: string; code?: string; message?: string };

async function call(kv: ReturnType<typeof memoryKv> | undefined, init: { method?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const method = init.method ?? (init.body !== undefined || init.raw !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = method === "POST" ? { "content-type": "application/json", origin: SITE, ...(init.headers ?? {}) } : { ...(init.headers ?? {}) };
  const request = new Request(`${SITE}/api/holding-shares`, { method, headers, body: method === "POST" ? (init.raw ?? JSON.stringify(init.body)) : undefined });
  const res = await onRequest({ request, env: kv ? { DASHBOARD_STORE: kv } : {} });
  const text = await res.text();
  let body: Body | null = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body, res };
}

const draft = (over: Record<string, unknown> = {}) => ({ key: "zepto", label: "Zepto", shares: 120000, source: "CAS 31 Mar 2026", ...over });

console.log("── a share count is read, or refused, from what a person types ──");
{
  const cases: [string, number | null][] = [
    ["120000", 120000], ["1,20,000", 120000], ["1.2 L", 120000], ["33 lakh", 3300000], ["1.2 Cr", 12000000],
    ["5000 shares", 5000], ["", null], ["abc", null], ["0", null], ["-500", null], ["1,20,000 shares held here", null],
  ];
  for (const [text, want] of cases) ok(`"${text}" → ${want == null ? "refused" : want}`, parseShares(text) === want, String(parseShares(text)));
  ok("a count writes back the way it reads", sharesText(120000) === "1,20,000");
}

console.log("── an unconnected store says so ──");
{
  const g = await call(undefined);
  ok("GET with no token answers 503 NOT_CONFIGURED", g.status === 503 && g.body?.code === "NOT_CONFIGURED");
  const r = await readReply(await onRequest({ request: new Request(`${SITE}/api/holding-shares`), env: {} }));
  ok("the page reads that 503 as 'saving is not switched on'", r.ok === false && r.reason === REASONS.notConfigured && r.cause === "not-configured");
}

console.log("── a count is kept with its source, one key per holding ──");
{
  const kv = memoryKv();
  const s = await call(kv, { body: { op: "save", rec: draft() } });
  ok("a count is saved under the holding's own key", s.status === 200 && s.body?.ok === true && s.body.key === "zepto");
  const stored = kv.data.get(PREFIX + "zepto");
  ok("it is ONE key carrying itself as metadata", !!stored && JSON.stringify(stored.metadata) === stored.value);
  ok("the answer carries the count and its source", s.body?.shares?.length === 1 && s.body.shares[0].shares === 120000 && s.body.shares[0].source === "CAS 31 Mar 2026");

  const e = await call(kv, { body: { op: "save", rec: draft({ shares: 125000, source: "MGT-7 FY25" }) } });
  ok("saving the same holding replaces its count in place", e.status === 200 && kv.data.size === 1 && e.body?.shares?.[0].shares === 125000 && e.body.shares[0].source === "MGT-7 FY25");

  const two = await call(kv, { body: { op: "save", rec: draft({ key: "perplexity-ai", label: "Perplexity" }) } });
  ok("a second holding is a second key", kv.data.size === 2 && two.body?.shares?.length === 2);

  kv.freeze();
  const d = await call(kv, { body: { op: "delete", key: "zepto" } });
  ok("a delete is gone from its own answer even while the list lags", d.status === 200 && !(d.body?.shares ?? []).some((r) => r.key === "zepto") && d.body?.shares?.length === 1);
  kv.thaw();
}

console.log("── a count the store cannot keep is refused whole ──");
{
  const kv = memoryKv();
  const refused = async (label: string, d: Record<string, unknown>, want: RegExp) => {
    const r = await call(kv, { body: { op: "save", rec: d } });
    ok(label, r.status === 400 && r.body?.code === "INVALID" && want.test(r.body?.message ?? "") && kv.data.size === 0, `${r.status} · ${r.body?.message}`);
  };
  await refused("a count of zero is refused, never a measured nil", draft({ shares: 0 }), /greater than zero/);
  await refused("a negative count is refused", draft({ shares: -500 }), /greater than zero/);
  await refused("a count typed as text is refused rather than coerced", draft({ shares: "1 lakh" }), /greater than zero/);
  await refused("an impossible count is refused — check the figure", draft({ shares: 1e14 }), /more shares than any holding/);
  await refused("a count with NO SOURCE is refused — the figure this dashboard will not show", draft({ source: "" }), /where this count is from/);
  await refused("a count attached to no holding is refused", draft({ key: "Zepto <x>" }), /not attached to a holding/);
  const v = validateShares(draft({ shares: 120000.98765, source: "CAS\u00002026   read" }));
  ok("a count is kept to four places", v.rec?.shares === 120000.9877, String(v.rec?.shares));
  ok("control characters are stripped from the source", v.rec?.source === "CAS 2026 read");
  ok("the store's own shape check refuses a sourceless count", !isShares({ key: "zepto", shares: 1, source: "", label: "", updatedAt: "" }) && isShares({ key: "zepto", shares: 1, source: "CAS", label: "", updatedAt: "" }));
}

console.log("── only this site's own page may write ──");
{
  const kv = memoryKv();
  const foreign = await call(kv, { body: { op: "save", rec: draft() }, headers: { origin: "https://evil.example" } });
  ok("a write from another origin is refused 403", foreign.status === 403 && foreign.body?.code === "CROSS_ORIGIN" && kv.data.size === 0);
  const form = await call(kv, { raw: "op=save", headers: { "content-type": "application/x-www-form-urlencoded" } });
  ok("a form post is refused 415", form.status === 415 && kv.data.size === 0);
  const put = await call(kv, { method: "PUT" });
  ok("any method but read and save is refused 405", put.status === 405);
}

console.log("── the store's failures say what happened, and the helpers hold ──");
{
  const kv = memoryKv(); kv.breakList(true);
  const down = await call(kv);
  ok("a store that fails to list answers 502, never an empty list", down.status === 502 && down.body?.code === "STORE_ERROR");

  const good = new Response(JSON.stringify({ ok: true, shares: [
    { key: "zepto", shares: 120000, source: "CAS", label: "Zepto", updatedAt: "" },
    { key: "bad", shares: 0, source: "x", label: "", updatedAt: "" },
  ] }), { headers: { "content-type": "application/json" } });
  const c = await readReply(good);
  ok("an ok answer is read and a non-positive count is dropped", c.ok && c.records.length === 1 && c.records[0].key === "zepto");
  const recs: HoldingShares[] = c.ok ? c.records : [];
  ok("sharesFor finds a holding's count", sharesFor(recs, "zepto")?.shares === 120000 && sharesFor(recs, "nope") === null);
}

if (fails) { console.log(`\n${fails} holding-shares store check(s) FAILED`); process.exit(1); }
console.log("\nall holding-shares store checks passed");
