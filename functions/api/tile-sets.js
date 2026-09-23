// Cloudflare Pages Function — WHICH KPI TILES EACH PAGE SHOWS, saved for everyone.
//
// *"When we are selecting a particular KPI tile, after changing the metric that
//  we want to see on it, make sure that it is being saved and next time when we
//  come on the dashboard it should be in the same format as it was after we
//  changed it."*
//
//   GET  /api/tile-sets   → { ok: true, sets: { [page]: { ids, updatedAt } } }
//   POST /api/tile-sets   { page, ids }  → { ok: true, sets }
//
// ── WHY A SERVER STORE AND NOT ONLY `localStorage` ──────────────────────────
//
// The strip already remembered a choice in `localStorage`, and that is a
// memory of ONE BROWSER. Measured locally it survives a reload and a new tab;
// it does not survive a second laptop, a phone, a cleared browser, or the
// partitioned storage a browser gives a page embedded in another site's frame —
// and the dashboard is served inside one (the session cookie is `SameSite=None`
// for exactly that reason). Each of those reads to the family as "it did not
// save". So the choice lives here, in the same KV namespace the capital-call
// column uses (`GLOW_STORE`), and `localStorage` stays as the instant copy the
// page paints from before this answers — and as the whole of the memory where
// this store is not connected.
//
// ── ONE LAYOUT PER PAGE, THE SAME FOR EVERYONE ──────────────────────────────
//
// The site has one password and no user accounts, so there is no "whose"
// layout to key on: the choice is the dashboard's, as the capital calls are.
// One key per PAGE (`tile-set:<page>`), last write wins — two people changing
// the same strip at once is one strip two people changed, and the later choice
// is the honest outcome. Different pages are different keys and cannot collide.
//
// ── A SET IS A LIST OF METRIC IDS, AND NOTHING ELSE ─────────────────────────
//
// Never a figure. The page decides what an id MEANS from the book at render
// time, so nothing stored here can put a number on screen, and an id the
// current build does not know is dropped by the page rather than drawn blank.
// Nothing here reaches `glowData.ts`.
//
// Set-up is the capital-call column's, once: a KV namespace binding named
// `GLOW_STORE`. Until then every request answers 503 `NOT_CONFIGURED` and the
// page keeps the choice in the browser, saying so inside the tile picker.

const PREFIX = "tile-set:";
const PAGE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const METRIC = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** More tiles than any strip offers; a longer list is not a layout, it is a mistake. */
const MAX_IDS = 40;
const MAX_BODY = 4096;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Read by every reader and changed by any of them: never from a cache.
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const fail = (status, code, message) => json(status, { ok: false, code, message });

/** A saved set: the page it is for, its ids, and when it was saved. */
export function isTileSet(s) {
  return !!s && typeof s === "object"
    && typeof s.page === "string" && PAGE.test(s.page)
    && Array.isArray(s.ids) && s.ids.length > 0 && s.ids.length <= MAX_IDS
    && s.ids.every((id) => typeof id === "string" && METRIC.test(id))
    && typeof s.updatedAt === "string";
}

/**
 * Validate what a page sent. Returns the set to store, or the one sentence
 * that says what is wrong with it.
 */
export function validateTileSet(body, now = new Date()) {
  if (!body || typeof body !== "object") return { error: "Nothing to save." };
  const page = String(body.page ?? "");
  if (!PAGE.test(page)) return { error: "This layout is not attached to a page." };
  if (!Array.isArray(body.ids) || body.ids.length === 0) return { error: "A page keeps at least one tile." };
  if (body.ids.length > MAX_IDS) return { error: "That is more tiles than any page offers." };
  const ids = [];
  for (const id of body.ids) {
    if (typeof id !== "string" || !METRIC.test(id)) return { error: "One of the tiles is not a metric this dashboard knows." };
    // A repeat is dropped rather than refused: the strip never shows one metric
    // twice, so the second copy carries no information.
    if (!ids.includes(id)) ids.push(id);
  }
  return { set: { page, ids, updatedAt: now.toISOString() } };
}

async function listSets(kv) {
  const out = {};
  let cursor;
  do {
    const page = await kv.list({ prefix: PREFIX, cursor });
    for (const k of page.keys ?? []) {
      let s = k.metadata;
      if (!s) { try { s = await kv.get(k.name, "json"); } catch { s = null; } }
      if (isTileSet(s)) out[s.page] = { ids: s.ids, updatedAt: s.updatedAt };
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const kv = env?.GLOW_STORE;
  if (!kv || typeof kv.list !== "function") {
    return fail(503, "NOT_CONFIGURED",
      "Saving tile layouts for everyone is not switched on yet: the site's shared store (a Cloudflare KV binding named GLOW_STORE) has not been connected.");
  }

  if (request.method === "GET") {
    try {
      return json(200, { ok: true, sets: await listSets(kv) });
    } catch {
      return fail(502, "STORE_ERROR", "The layout store did not answer.");
    }
  }

  if (request.method !== "POST") return fail(405, "METHOD", "Only reading and saving are supported here.");

  // The same two guards as the capital-call store, for the same reason: the
  // session cookie is sent cross-site, so a write must prove it came from this
  // site's own page.
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "CROSS_ORIGIN", "Layouts can only be saved from the dashboard itself.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "NOT_JSON", "Layouts are saved as JSON.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, "TOO_LARGE", "That is more than one layout.");
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, "INVALID", "The request could not be read."); }

  const v = validateTileSet(body);
  if (v.error) return fail(400, "INVALID", v.error);
  try {
    await kv.put(PREFIX + v.set.page, JSON.stringify(v.set), { metadata: v.set });
    // KV's list is eventually consistent, so the answer applies the save itself:
    // whoever saved must never see the old layout come back.
    const sets = await listSets(kv);
    sets[v.set.page] = { ids: v.set.ids, updatedAt: v.set.updatedAt };
    return json(200, { ok: true, sets });
  } catch {
    return fail(502, "STORE_ERROR", "The layout store did not answer. Your layout is kept in this browser; try again in a moment.");
  }
}
