// THE SHARED CAPITAL-CALL STORE, BOTH ENDS.  npm run test:family
//
// *"it simply needs to be a editable coloumn in this table itself which people
//  can add and edit capital call and save and it stays same for all."*
//
// ── WHY A TEST AND NOT A PROBE ──────────────────────────────────────────────
//
// `/api/capital-calls` is a Cloudflare Pages Function over a KV namespace, and
// the deployment gates every `/api/*` path behind the edge password — so the
// live store cannot be exercised from here, and until the `GLOW_STORE` binding
// is connected it would answer 503 anyway. Every branch AROUND the store is
// reachable against an in-memory KV, and they are the branches that decide
// whether a call the family typed is kept, refused, or silently lost:
//
//   • a save must be visible to whoever made it AT ONCE, even though KV's list
//     is eventually consistent — and a delete must never come back;
//   • a draft the store cannot keep is refused with ONE sentence the editor
//     prints as it is, never half-written;
//   • a write from any other site is refused, because the session cookie is
//     `SameSite=None` and a browser WILL send it cross-site;
//   • an unconnected store says so, and the page words that as "saving is not
//     switched on" — never an empty column, which reads as "no calls coming".
//
// The client half is tested against the SERVER'S OWN Responses where it can be,
// so the two cannot drift: `readReply` reading a 503 the function really built
// is a stronger check than reading one this file typed.
import { onRequest, isIsoDate, isCall, validateDraft, type KvLike } from "../../../functions/api/capital-calls.js";
import { readReply, parseRupees, headlineCall, callsOf, todayIso, REASONS, CAUSE_WORD, SWITCH_ON_STEPS, type EnteredCall } from "../enteredCalls";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const SITE = "https://glow.example";
const PREFIX = "capital-call:";

/**
 * An in-memory KV with the three behaviours that matter here: metadata rides on
 * `list`, `list` PAGES (two keys a page, so the cursor loop is exercised), and
 * `list` can be made STALE — frozen at a snapshot — which is what KV's eventual
 * consistency looks like to the function right after a write.
 */
function memoryKv() {
  const data = new Map<string, { value: string; metadata?: unknown }>();
  let frozen: [string, { value: string; metadata?: unknown }][] | null = null;
  let failList = false;
  let failPut = false;
  const kv: KvLike & {
    data: typeof data; freeze(): void; thaw(): void; breakList(on: boolean): void; breakPut(on: boolean): void;
  } = {
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

type Body = { ok: boolean; calls?: EnteredCall[]; id?: string; code?: string; message?: string };

async function call(
  kv: KvLike | undefined,
  init: { method?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {},
) {
  const method = init.method ?? (init.body !== undefined || init.raw !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = method === "POST"
    ? { "content-type": "application/json", origin: SITE, ...(init.headers ?? {}) }
    : { ...(init.headers ?? {}) };
  const request = new Request(`${SITE}/api/capital-calls`, {
    method,
    headers,
    body: method === "POST" ? (init.raw ?? JSON.stringify(init.body)) : undefined,
  });
  const res = await onRequest({ request, env: kv ? { GLOW_STORE: kv } : {} });
  const text = await res.text();
  let body: Body | null = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body, res, text };
}

const draft = (over: Record<string, unknown> = {}) => ({
  fund: "sanshi-fund-i-open-ended-aif-cat-iii-class-e",
  fundName: "Sanshi Fund-I (Open Ended AIF CAT-III) — Class E",
  date: "2026-11-15",
  amount: 20000000,
  note: "Drawdown notice #7",
  ...over,
});

// ────────────────────────────────────────────────────────────────────────────
console.log("── an unconnected store says so, on every method ──");
{
  const g = await call(undefined);
  ok("GET with no GLOW_STORE binding answers 503 NOT_CONFIGURED", g.status === 503 && g.body?.code === "NOT_CONFIGURED", `${g.status} ${g.body?.code}`);
  const p = await call(undefined, { body: { op: "save", call: draft() } });
  ok("…and so does a save — nothing is claimed saved", p.status === 503 && p.body?.ok === false && p.body?.code === "NOT_CONFIGURED");
  // THE TWO HALVES AGREE: the page's reading of the function's OWN 503.
  const again = await onRequest({ request: new Request(`${SITE}/api/capital-calls`), env: {} });
  const r = await readReply(again);
  ok("the page reads that 503 as 'saving is not switched on', never as an empty list",
    r.ok === false && r.reason === REASONS.notConfigured);
  // …AND NAMES IT BY CAUSE, which is what picks the word every cell shows and
  // whether the editor shows the set-up steps.
  ok("…with the cause the cells name it by", r.ok === false && r.cause === "not-configured" && CAUSE_WORD[r.cause] === "Not set up");
}

console.log("── the set-up steps name the binding the function actually reads ──");
{
  /**
   * TWO COPIES OF ONE FACT. The editor tells whoever manages the site which
   * binding to add, and the function reads one — so the name in the STEPS is
   * taken out of their own words and handed to the function as the binding,
   * and the function must then answer. A rename on either side alone fails
   * here, rather than on the day somebody follows the steps and the column
   * stays "Not set up".
   */
  const text = SWITCH_ON_STEPS.join(" ");
  const named = /Variable name:\s*([A-Z0-9_]+)/.exec(text)?.[1] ?? null;
  ok("the steps name one variable", named !== null, String(named));
  if (named) {
    const kv = memoryKv();
    const res = await onRequest({ request: new Request(`${SITE}/api/capital-calls`), env: { [named]: kv } });
    const body = await res.json() as Body;
    ok("…and a binding under that name switches the store on", res.status === 200 && body.ok === true && Array.isArray(body.calls),
      `${res.status} ${body.code ?? ""}`);
  }
  ok("the steps say to redeploy — a binding takes effect only on a new deployment", /redeploy/i.test(text));
  ok("…and say where the namespace is created and where it is bound",
    /Workers KV/.test(text) && /Settings → Bindings/.test(text) && /KV namespace/.test(text));
}

console.log("── a save is kept, visible at once, and one key per call ──");
{
  const kv = memoryKv();
  const empty = await call(kv);
  ok("an empty store lists nothing, and says ok", empty.status === 200 && empty.body?.ok === true && empty.body.calls?.length === 0);
  ok("…and is never served from a cache", empty.res.headers.get("cache-control") === "no-store");

  const s = await call(kv, { body: { op: "save", call: draft() } });
  const id = s.body?.id ?? "";
  ok("a new call is saved and given an id the store issued", s.status === 200 && s.body?.ok === true && /^[a-z0-9][a-z0-9-]{7,63}$/.test(id), id);
  const stored = kv.data.get(PREFIX + id);
  ok("it is ONE key, carrying itself as metadata so one list reads every call",
    !!stored && JSON.stringify(stored.metadata) === stored.value);
  ok("the answer carries the list with the change already applied",
    s.body?.calls?.length === 1 && s.body.calls[0].id === id && s.body.calls[0].amount === 20000000);

  const second = await call(kv, { body: { op: "save", call: draft({ date: "2026-10-01", amount: 7500000, note: "" }) } });
  ok("a second call is a second key, so two people saving at once cannot overwrite each other",
    kv.data.size === 2 && second.body?.calls?.length === 2);
  ok("…and the list reads oldest first", second.body?.calls?.[0].date === "2026-10-01");

  // EDIT: same id, new figures.
  const before = kv.data.get(PREFIX + id)!;
  const e = await call(kv, { body: { op: "save", call: draft({ id, amount: 25000000, note: "revised notice" }) } });
  const after = JSON.parse(kv.data.get(PREFIX + id)!.value);
  ok("an edit keeps the id and replaces the figures in place",
    e.status === 200 && kv.data.size === 2 && after.amount === 25000000 && after.note === "revised notice");
  ok("…and restamps when it was changed", after.updatedAt >= JSON.parse(before.value).updatedAt);
  ok("…and the answer lists it once, not twice", (e.body?.calls ?? []).filter((c) => c.id === id).length === 1);

  // A LIST STILL CATCHING UP must not hide the writer's own save.
  kv.freeze();
  const lag = await call(kv, { body: { op: "save", call: draft({ date: "2027-01-10", amount: 1e7 }) } });
  ok("a save is in its own answer even while the store's list is still catching up",
    (lag.body?.calls ?? []).some((c) => c.id === lag.body?.id) && lag.body?.calls?.length === 3);
  kv.thaw();

  // DELETE, while the list still lags — it must never come back.
  kv.freeze();
  const d = await call(kv, { body: { op: "delete", id } });
  ok("a delete removes the key", !kv.data.has(PREFIX + id));
  ok("…and is gone from its own answer even though the list has not caught up",
    d.status === 200 && !(d.body?.calls ?? []).some((c) => c.id === id) && d.body?.calls?.length === 2);
  kv.thaw();
  const g = await call(kv);
  ok("…and from the next read by anyone", !(g.body?.calls ?? []).some((c) => c.id === id) && g.body?.calls?.length === 2);
}

console.log("── a draft the store cannot keep is refused whole, with one sentence ──");
{
  const kv = memoryKv();
  const refused = async (label: string, d: Record<string, unknown>, want: RegExp) => {
    const r = await call(kv, { body: { op: "save", call: d } });
    ok(label, r.status === 400 && r.body?.code === "INVALID" && want.test(r.body?.message ?? "") && kv.data.size === 0,
      `${r.status} · ${r.body?.message}`);
  };
  await refused("a date that is not a real day (30 Feb) is refused", draft({ date: "2026-02-30" }), /date the call is due/);
  await refused("…and so is a date written any other way", draft({ date: "15/11/2026" }), /date the call is due/);
  await refused("an amount of zero is refused, never stored as a measured nil", draft({ amount: 0 }), /greater than zero/);
  await refused("a negative amount is refused", draft({ amount: -5e6 }), /greater than zero/);
  await refused("an amount typed as text is refused rather than coerced", draft({ amount: "2 Cr" }), /greater than zero/);
  await refused("three extra zeros are refused, not stored", draft({ amount: 2e13 }), /check the zeros/);
  await refused("a call attached to no fund on the page is refused", draft({ fund: "Sanshi Fund <script>" }), /not attached to a fund/);
  await refused("an id the store never issued is refused", draft({ id: "../../etc" }), /id is not one the store issued/);
  const unknown = await call(kv, { body: { op: "rename" } });
  ok("an unknown operation is refused", unknown.status === 400 && unknown.body?.code === "INVALID");
  const badJson = await call(kv, { raw: "{not json" });
  ok("a body that is not JSON is refused", badJson.status === 400 && badJson.body?.code === "INVALID");
  const badDel = await call(kv, { body: { op: "delete", id: "x" } });
  ok("a delete naming no real id is refused", badDel.status === 400 && badDel.body?.code === "INVALID");

  const v = validateDraft(draft({ amount: 12345678.919, note: "line one\nline\u0000two   spaced", fundName: "A\u0007B" }), new Date("2026-09-23T10:00:00Z"));
  ok("an amount is kept to the paisa", v.call?.amount === 12345678.92, String(v.call?.amount));
  ok("control characters are stripped from what every reader will see", v.call?.note === "line one line two spaced" && v.call?.fundName === "A B",
    JSON.stringify([v.call?.note, v.call?.fundName]));
  ok("…and the stamp is the time given, not the client's", v.call?.updatedAt === "2026-09-23T10:00:00.000Z");
  // THE 1 KB METADATA LIMIT IS BYTES, NOT CHARACTERS. Every field at its own
  // length cap in plain ASCII still fits — measured, not assumed: the first
  // draft of this case expected a refusal there and the store rightly kept it —
  // so the guard only bites on text that is several bytes a character, which a
  // note written in Hindi, or full of ₹ signs, is.
  const ascii = validateDraft(draft({ note: "x".repeat(240), fundName: "y".repeat(160), fund: "f".repeat(160) }));
  ok("every field at its own cap in plain text still saves", !!ascii.call && !ascii.error, ascii.error ?? "stored");
  const wide = validateDraft(draft({ note: "₹".repeat(240), fundName: "न".repeat(160) }));
  ok("a call that would not fit KV's 1 KB of metadata is refused rather than cut",
    !!wide.error && /too long/i.test(wide.error), wide.error ?? "stored");
}

console.log("── only this site's own page may write ──");
{
  const kv = memoryKv();
  const foreign = await call(kv, { body: { op: "save", call: draft() }, headers: { origin: "https://evil.example" } });
  ok("a write from another origin is refused 403 and stores nothing",
    foreign.status === 403 && foreign.body?.code === "CROSS_ORIGIN" && kv.data.size === 0);
  const site = await call(kv, { body: { op: "save", call: draft() }, headers: { origin: SITE, "sec-fetch-site": "cross-site" } });
  ok("…and so is one the browser marks cross-site, whatever it claims as origin",
    site.status === 403 && kv.data.size === 0);
  const form = await call(kv, { raw: "op=save", headers: { "content-type": "application/x-www-form-urlencoded" } });
  ok("a form post — which needs no CORS preflight — is refused 415", form.status === 415 && kv.data.size === 0);
  const big = await call(kv, { raw: JSON.stringify({ op: "save", call: draft({ note: "z".repeat(9000) }) }) });
  ok("a body larger than one call is refused 413", big.status === 413 && kv.data.size === 0);
  const put = await call(kv, { method: "PUT" });
  ok("any method but read and save is refused 405", put.status === 405);
  const deleteVerb = await call(kv, { method: "DELETE" });
  ok("…including a bare DELETE, which goes through the save endpoint's own op instead", deleteVerb.status === 405);
}

console.log("── the store's limits and its failures say what happened ──");
{
  const kv = memoryKv();
  for (let i = 0; i < 1000; i++) {
    const c = { id: `seed-${String(i).padStart(4, "0")}-x`, fund: "f", fundName: "F", date: "2026-12-01", amount: 1, note: "", updatedAt: "2026-09-01T00:00:00.000Z" };
    kv.data.set(PREFIX + c.id, { value: JSON.stringify(c), metadata: c });
  }
  const full = await call(kv, { body: { op: "save", call: draft() } });
  ok("a full store refuses a NEW call with a sentence saying why", full.status === 409 && full.body?.code === "FULL" && kv.data.size === 1000);
  const edit = await call(kv, { body: { op: "save", call: draft({ id: "seed-0007-x", fund: "f" }) } });
  ok("…but still lets an existing one be edited", edit.status === 200 && JSON.parse(kv.data.get(PREFIX + "seed-0007-x")!.value).amount === 20000000);

  const kv2 = memoryKv();
  const bare = { id: "handwritten-01", fund: "f", fundName: "F", date: "2026-12-01", amount: 5, note: "", updatedAt: "x" };
  kv2.data.set(PREFIX + bare.id, { value: JSON.stringify(bare) });          // no metadata
  kv2.data.set(PREFIX + "broken-000001", { value: JSON.stringify({ id: "broken-000001", amount: "lots" }), metadata: { id: "broken-000001", amount: "lots" } });
  kv2.data.set("something-else:1", { value: "{}", metadata: {} });
  const read = await call(kv2);
  ok("a key written without metadata is read in full rather than dropped", (read.body?.calls ?? []).some((c) => c.id === "handwritten-01"));
  ok("…a malformed one is skipped rather than served", !(read.body?.calls ?? []).some((c) => c.id === "broken-000001"));
  ok("…and keys that are not capital calls are never listed", read.body?.calls?.length === 1);

  const kv3 = memoryKv();
  kv3.breakList(true);
  const down = await call(kv3);
  ok("a store that fails to list answers 502, never an empty list", down.status === 502 && down.body?.code === "STORE_ERROR");
  kv3.breakList(false);
  kv3.breakPut(true);
  const notSaved = await call(kv3, { body: { op: "save", call: draft() } });
  ok("a write that fails says the change was NOT saved",
    notSaved.status === 502 && /not saved/i.test(notSaved.body?.message ?? "") && kv3.data.size === 0);
}

console.log("── the page reads each failure by its CAUSE ──");
{
  const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  const a = await readReply(html(`<form action="/__auth/login" method="post">`));
  ok("the edge gate's login page reads as signed out", !a.ok && a.reason === REASONS.signedOut && a.cause === "signed-out");
  const b = await readReply(html(`<!doctype html><div id="root"></div>`));
  ok("the app's own shell (no function running) reads as the store not running here",
    !b.ok && b.reason === REASONS.noFunction && b.cause === "no-function");
  const good = new Response(JSON.stringify({ ok: true, calls: [
    { id: "a1234567", fund: "f", fundName: "F", date: "2026-10-01", amount: 5, note: "", updatedAt: "" },
    { id: "b1234567", fund: "f", fundName: "F", date: "2026-10-01", amount: 0, note: "", updatedAt: "" },
  ] }), { headers: { "content-type": "application/json" } });
  const c = await readReply(good);
  ok("an ok answer is read, and a call with no positive amount is dropped", c.ok && c.calls.length === 1 && c.calls[0].id === "a1234567");
  const said = await readReply(new Response(JSON.stringify({ ok: false, code: "INVALID", message: "Give the date the call is due." }),
    { status: 400, headers: { "content-type": "application/json" } }));
  ok("a refusal carries the store's own sentence", !said.ok && said.reason === "Give the date the call is due." && said.cause === "error");
  const bare = await readReply(new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "content-type": "application/json" } }));
  ok("…and one with no sentence names its status rather than inventing a cause", !bare.ok && /HTTP 500/.test(bare.reason));
  // EVERY CAUSE HAS ITS WORD, and none of them is the word for a working store.
  // A cell reading "Add" while nothing can be saved is the control that looks
  // live and does nothing.
  const words = Object.values(CAUSE_WORD);
  ok("every cause names itself in a word, and none of them offers to add",
    words.length === 5 && words.every((w) => w.length > 0 && !/\badd\b/i.test(w)), words.join(" · "));
}

console.log("── what a person types is read as rupees, or refused ──");
{
  const cases: [string, number | null][] = [
    ["2 Cr", 2e7], ["2.5 crore", 2.5e7], ["50 L", 5e6], ["50 lakh", 5e6], ["12.5 lakhs", 1.25e6], ["5 K", 5e3],
    ["₹2,50,00,000", 2.5e7], ["25000000", 2.5e7], ["Rs. 1,00,000", 1e5], ["INR 75 L", 7.5e6],
    ["", null], ["abc", null], ["0", null], ["-5 Cr", null], ["2 Cr 50 L", null], ["1e7", null], ["2 million", null],
  ];
  for (const [text, want] of cases) {
    const got = parseRupees(text);
    ok(`"${text}" → ${want == null ? "refused" : want}`, got === want, String(got));
  }
}

console.log("── the cell shows the next call, or the latest one marked past ──");
{
  const mk = (id: string, fund: string, date: string): EnteredCall =>
    ({ id, fund, fundName: fund, date, amount: 1e6, note: "", updatedAt: "" });
  const calls = [mk("a1111111", "x", "2026-08-01"), mk("a2222222", "x", "2026-12-01"), mk("a3333333", "x", "2026-10-01"), mk("b1111111", "y", "2026-01-01")];
  const h = headlineCall(calls, "x", "2026-09-23");
  ok("the soonest call still to come is the one shown", h?.call.id === "a3333333" && h.past === false);
  ok("…with how many more there are", h?.more === 2);
  const today = headlineCall(calls, "x", "2026-10-01");
  ok("a call due TODAY is still to come, not past", today?.call.id === "a3333333" && today.past === false);
  const past = headlineCall(calls, "y", "2026-09-23");
  ok("where every call is past, the latest is shown and marked past", past?.call.id === "b1111111" && past.past === true && past.more === 0);
  ok("a fund with nothing entered shows nothing", headlineCall(calls, "z", "2026-09-23") === null);
  ok("another fund's calls never leak into a row", callsOf(calls, "x").every((c) => c.fund === "x") && callsOf(calls, "x").length === 3);
  ok("a fund's calls read oldest first", callsOf(calls, "x").map((c) => c.date).join() === "2026-08-01,2026-10-01,2026-12-01");
  ok("today is written the way the store writes a date", todayIso(new Date(2026, 8, 3)) === "2026-09-03" && isIsoDate(todayIso()));
  ok("the store's own shape check refuses what the page would drop", !isCall({ id: "short", fund: "x", date: "2026-10-01", amount: 1 }));
}

if (fails) { console.log(`\n${fails} capital-call store check(s) FAILED`); process.exit(1); }
console.log("\nall capital-call store checks passed");
