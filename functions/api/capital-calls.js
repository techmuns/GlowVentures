// Cloudflare Pages Function — the family's own CAPITAL CALLS, one list for everyone.
//
// *"it simply needs to be a editable coloumn in this table itself which people
//  can add and edit capital call and save and it stays same for all."*
//
//   GET  /api/capital-calls   → { ok: true, calls: EnteredCall[] }
//   POST /api/capital-calls   { op: "save", call: { id?, fund, fundName, date, amount, note } }
//                             { op: "delete", id }
//                             → { ok: true, calls: EnteredCall[], id }
//
// ── WHY A SERVER STORE, AND NOT localStorage ────────────────────────────────
//
// Everything else a reader types on this site — a target price, a tile set, a
// thesis — is a per-browser convenience kept in `localStorage`. "It stays same
// for all" rules that out in five words: a call entered on one laptop has to be
// on every screen that opens the dashboard. So it lives in Cloudflare KV, behind
// the same edge password gate as every other `/api/*` route — `_middleware.js`
// answers any request without the session cookie with the login page, POSTs
// included, before this file ever runs.
//
// ── ONE KEY PER CALL, SO TWO PEOPLE SAVING AT ONCE CANNOT LOSE EACH OTHER'S ──
//
// One JSON document would be read-modify-write, and KV has no transactions: two
// saves landing together would each write back a copy missing the other's call,
// and nothing would say so. Each call is its own key (`capital-call:<id>`) and
// carries itself as KV METADATA, so one `list` returns every call without a
// read per key. Two edits to the SAME call still resolve last-write-wins, which
// is the honest outcome for one row two people changed.
//
// KV is eventually consistent. A save is visible AT ONCE to whoever made it —
// the response carries the list with the change applied — and to everyone else
// within about a minute. That is stated rather than hidden.
//
// ── NOT A STATEMENT FIGURE, AND IT MUST NEVER BECOME ONE ────────────────────
//
// These are what the family has been TOLD is coming — a drawdown notice, an
// email, a manager's call — which no statement in `source/` prints: not one of
// the archive's documents publishes a forward drawdown schedule. Nothing here
// reaches `glowData.ts`, and the page never adds an entered call into Called,
// Paid in or Still to call, which are what the funds' own statements print.
//
// ── SET-UP, ONCE ────────────────────────────────────────────────────────────
//
// Cloudflare dashboard → Storage & Databases → KV → create a namespace (any
// name) → the Pages project → Settings → Bindings → add a KV namespace binding
// with the variable name `GLOW_STORE` (for Production and Preview) → redeploy.
// Until that is done every request answers 503 `NOT_CONFIGURED`, and the page
// says saving is not switched on — never an empty column that would read as
// "no calls are coming".

const PREFIX = "capital-call:";
/** A fund row's own `securityKey` — the join to the table on the page. */
const FUND = /^[a-z0-9][a-z0-9-]{0,159}$/;
const ID = /^[a-z0-9][a-z0-9-]{7,63}$/;
/** ₹1,00,000 Cr. A typo that adds three zeros should be refused, not stored. */
const MAX_AMOUNT = 1e12;
const MAX_NOTE = 240;
const MAX_NAME = 160;
const MAX_CALLS = 1000;
const MAX_BODY = 8192;
/** KV metadata is capped at 1,024 bytes; a call that will not fit is refused whole. */
const MAX_META = 1000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // A list of what people typed, read by everyone: never served from a cache.
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const fail = (status, code, message) => json(status, { ok: false, code, message });

/** A real calendar date, YYYY-MM-DD, round-tripping through `Date` unchanged. */
export function isIsoDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t)) return false;
  const back = new Date(t).toISOString().slice(0, 10);
  const year = Number(s.slice(0, 4));
  return back === s && year >= 2000 && year <= 2100;
}

/** Control characters are stripped: this text is shown to every reader. */
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** The shape every stored call must have to be served — anything else is skipped. */
export function isCall(c) {
  return !!c && typeof c === "object"
    && typeof c.id === "string" && ID.test(c.id)
    && typeof c.fund === "string" && FUND.test(c.fund)
    && isIsoDate(c.date)
    && typeof c.amount === "number" && Number.isFinite(c.amount) && c.amount > 0 && c.amount <= MAX_AMOUNT
    && typeof c.fundName === "string" && typeof c.note === "string" && typeof c.updatedAt === "string";
}

/** Oldest first, so a reader scanning a fund's calls reads them in the order they fall. */
const byDate = (a, b) => a.date.localeCompare(b.date) || a.fund.localeCompare(b.fund) || a.id.localeCompare(b.id);

async function listCalls(kv) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: PREFIX, cursor });
    for (const k of page.keys ?? []) {
      let c = k.metadata;
      // A key written without metadata (by hand, or by an older build) is read
      // in full rather than silently dropped from the list.
      if (!c) { try { c = await kv.get(k.name, "json"); } catch { c = null; } }
      if (isCall(c)) out.push(c);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort(byDate);
}

/**
 * Validate a draft. Returns the call to store, or the one sentence that says
 * what is wrong with it — the editor prints that sentence as it is.
 */
export function validateDraft(d, now = new Date()) {
  if (!d || typeof d !== "object") return { error: "Nothing to save." };
  const fund = String(d.fund ?? "");
  if (!FUND.test(fund)) return { error: "This call is not attached to a fund on the page." };
  if (!isIsoDate(d.date)) return { error: "Give the date the call is due." };
  const amount = typeof d.amount === "number" ? Math.round(d.amount * 100) / 100 : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Give an amount greater than zero." };
  if (amount > MAX_AMOUNT) return { error: "That amount is larger than any capital call could be — check the zeros." };
  if (d.id != null && !(typeof d.id === "string" && ID.test(d.id))) return { error: "This call's id is not one the store issued." };
  const call = {
    id: d.id ?? crypto.randomUUID(),
    fund,
    fundName: clean(d.fundName, MAX_NAME),
    date: d.date,
    amount,
    note: clean(d.note, MAX_NOTE),
    updatedAt: now.toISOString(),
  };
  if (new TextEncoder().encode(JSON.stringify(call)).length > MAX_META) {
    return { error: "The note is too long to save. Shorten it and try again." };
  }
  return { call };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const kv = env?.GLOW_STORE;
  if (!kv || typeof kv.list !== "function") {
    return fail(503, "NOT_CONFIGURED",
      "Saving capital calls is not switched on yet: the site's shared store (a Cloudflare KV binding named GLOW_STORE) has not been connected.");
  }

  if (request.method === "GET") {
    try {
      return json(200, { ok: true, calls: await listCalls(kv) });
    } catch {
      return fail(502, "STORE_ERROR", "The capital-call store did not answer. Nothing was lost; try again in a moment.");
    }
  }

  if (request.method !== "POST") return fail(405, "METHOD", "Only reading and saving are supported here.");

  // ── A WRITE MUST COME FROM THIS SITE'S OWN PAGE ───────────────────────────
  // The session cookie is `SameSite=None` so the dashboard works inside an
  // iframe on muns.io, which means a browser WILL send it on a cross-site
  // request. Two guards close that door: a JSON body cannot be sent cross-site
  // without a CORS preflight this function never approves, and an `Origin`
  // that is not this site's own is refused outright.
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "CROSS_ORIGIN", "Capital calls can only be saved from the dashboard itself.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "NOT_JSON", "Capital calls are saved as JSON.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, "TOO_LARGE", "That is more than one capital call.");
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, "INVALID", "The request could not be read."); }

  try {
    if (body?.op === "delete") {
      const id = String(body.id ?? "");
      if (!ID.test(id)) return fail(400, "INVALID", "This call's id is not one the store issued.");
      await kv.delete(PREFIX + id);
      // The list is eventually consistent, so the answer applies the delete
      // itself: whoever deleted it must never see it come back.
      const calls = (await listCalls(kv)).filter((c) => c.id !== id);
      return json(200, { ok: true, calls, id });
    }

    if (body?.op === "save") {
      const v = validateDraft(body.call);
      if (v.error) return fail(400, "INVALID", v.error);
      const current = await listCalls(kv);
      const isNew = !current.some((c) => c.id === v.call.id);
      if (isNew && current.length >= MAX_CALLS) {
        return fail(409, "FULL", `The store holds ${MAX_CALLS} calls, which is its limit. Delete old ones first.`);
      }
      await kv.put(PREFIX + v.call.id, JSON.stringify(v.call), { metadata: v.call });
      const calls = [...current.filter((c) => c.id !== v.call.id), v.call].sort(byDate);
      return json(200, { ok: true, calls, id: v.call.id });
    }
  } catch {
    return fail(502, "STORE_ERROR", "The capital-call store did not answer. Your change was not saved; try again in a moment.");
  }

  return fail(400, "INVALID", "Unknown request.");
}
