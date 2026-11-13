// Cloudflare Pages Function — the family's PRIVATE-MARKET WATCHLIST, one list for everyone.
//
// *"The private market. So, is there a tab for watch list over here? … Can you
//  add it? … Manually [added companies]."* — Pratik, 22 Oct 2026 (client #310).
//
//   GET  /api/private-watchlist  → { ok: true, items: WatchItem[] }
//   POST /api/private-watchlist  { op: "save", item: { id?, name, kind, legalEntity, sector, notes, addedBy } }
//                                { op: "delete", id }
//                                → { ok: true, items: WatchItem[], id }
//
// ── WHY A SERVER STORE, AND NOT localStorage ────────────────────────────────
//
// The public Research-Central watchlist is a per-browser convenience. This one
// is not: a private company Glow adds on one laptop has to be on every screen
// that opens the dashboard ("everything is saved across for everyone"). So it
// lives in the dashboard's shared store — one JSON file in the GitHub repository
// (`shared/dashboardStore.mjs`, Stage 10ex) — written through this function,
// behind the same edge password gate as every other `/api/*` route.
//
// ── ONE KEY PER COMPANY, SO TWO PEOPLE SAVING AT ONCE CANNOT LOSE EACH OTHER'S ──
//
// Each entry is its own key (`pwatch:<id>`) carrying itself as METADATA, so one
// `list` returns every entry. Two saves landing together cannot lose each
// other's company: the store commits against the file's sha and, refused,
// re-reads the other save and lays its own over it. Two edits to the SAME entry
// resolve last-write-wins — the honest outcome for one row two people changed.
//
// ── A JUDGEMENT, NEVER A BOOK FIGURE ────────────────────────────────────────
//
// These are companies the family is WATCHING, not holding — their own
// judgement, kept deliberately apart from the book. Nothing here reaches
// `glowData.ts`, no entry is ever counted in Market value, Capital invested or
// any holding total, and no entry carries a valuation of the family's money.
//
// ── SET-UP, ONCE ────────────────────────────────────────────────────────────
//
// The same `GLOW_GITHUB_TOKEN` secret as every other shared-store route. Until
// it is set every request answers 503 `NOT_CONFIGURED`, and the tab shows the
// one-time steps (`SWITCH_ON_STEPS` in `src/lib/privateWatchlist.ts`) rather
// than an empty list that would read as "nothing is being watched".

import { storeFor } from "../../shared/dashboardStore.mjs";

const PREFIX = "pwatch:";
const ID = /^[a-z0-9][a-z0-9-]{7,63}$/;
const KINDS = new Set(["company", "fund"]);
const MAX_NAME = 160;
const MAX_ENTITY = 160;
const MAX_SECTOR = 80;
const MAX_NOTE = 240;
const MAX_ADDEDBY = 80;
const MAX_ITEMS = 2000;
const MAX_BODY = 8192;
/** KV metadata is capped at ~1,024 bytes; an entry that will not fit is refused whole. */
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

/** Control characters are stripped: this text is shown to every reader. */
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** The shape every stored entry must have to be served — anything else is skipped. */
export function isItem(c) {
  return !!c && typeof c === "object"
    && typeof c.id === "string" && ID.test(c.id)
    && typeof c.name === "string" && c.name.length > 0
    && typeof c.kind === "string" && KINDS.has(c.kind)
    && typeof c.legalEntity === "string" && typeof c.sector === "string"
    && typeof c.notes === "string" && typeof c.addedBy === "string"
    && typeof c.updatedAt === "string";
}

/** Newest first, so the latest company added is at the top of the list. */
const byRecent = (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

async function listItems(kv) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: PREFIX, cursor });
    for (const k of page.keys ?? []) {
      let c = k.metadata;
      // A key written without metadata (by hand, or by an older build) is read
      // in full rather than silently dropped from the list.
      if (!c) { try { c = await kv.get(k.name, "json"); } catch { c = null; } }
      if (isItem(c)) out.push(c);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort(byRecent);
}

/**
 * Validate a draft. Returns the entry to store, or the one sentence that says
 * what is wrong with it — the editor prints that sentence as it is.
 */
export function validateDraft(d, now = new Date()) {
  if (!d || typeof d !== "object") return { error: "Nothing to save." };
  const name = clean(d.name, MAX_NAME);
  if (!name) return { error: "Give the company or fund a name." };
  const kind = KINDS.has(d.kind) ? d.kind : "company";
  if (d.id != null && !(typeof d.id === "string" && ID.test(d.id))) return { error: "This entry's id is not one the store issued." };
  const item = {
    id: d.id ?? crypto.randomUUID(),
    name,
    kind,
    legalEntity: clean(d.legalEntity, MAX_ENTITY),
    sector: clean(d.sector, MAX_SECTOR),
    notes: clean(d.notes, MAX_NOTE),
    addedBy: clean(d.addedBy, MAX_ADDEDBY),
    updatedAt: now.toISOString(),
  };
  if (new TextEncoder().encode(JSON.stringify(item)).length > MAX_META) {
    return { error: "The notes are too long to save. Shorten them and try again." };
  }
  return { item };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const kv = storeFor(env);
  if (!kv) {
    return fail(503, "NOT_CONFIGURED",
      "The watchlist is not switched on yet: the site has no GitHub token (GLOW_GITHUB_TOKEN) to save it to the repository with.");
  }

  if (request.method === "GET") {
    try {
      return json(200, { ok: true, items: await listItems(kv) });
    } catch {
      return fail(502, "STORE_ERROR", "The watchlist store did not answer. Nothing was lost; try again in a moment.");
    }
  }

  if (request.method !== "POST") return fail(405, "METHOD", "Only reading and saving are supported here.");

  // A WRITE MUST COME FROM THIS SITE'S OWN PAGE — the same two guards as every
  // other shared-store route (a JSON body needs a CORS preflight this function
  // never approves, and a cross-site Origin is refused outright).
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "CROSS_ORIGIN", "The watchlist can only be saved from the dashboard itself.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "NOT_JSON", "The watchlist is saved as JSON.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, "TOO_LARGE", "That is more than one watchlist entry.");
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, "INVALID", "The request could not be read."); }

  try {
    if (body?.op === "delete") {
      const id = String(body.id ?? "");
      if (!ID.test(id)) return fail(400, "INVALID", "This entry's id is not one the store issued.");
      await kv.delete(PREFIX + id);
      await kv.flush?.();
      // The list is eventually consistent, so the answer applies the delete
      // itself: whoever deleted it must never see it come back.
      const items = (await listItems(kv)).filter((c) => c.id !== id);
      return json(200, { ok: true, items, id });
    }

    if (body?.op === "save") {
      const v = validateDraft(body.item);
      if (v.error) return fail(400, "INVALID", v.error);
      const current = await listItems(kv);
      const isNew = !current.some((c) => c.id === v.item.id);
      if (isNew && current.length >= MAX_ITEMS) {
        return fail(409, "FULL", `The watchlist holds ${MAX_ITEMS} companies, which is its limit. Remove some first.`);
      }
      await kv.put(PREFIX + v.item.id, JSON.stringify(v.item), { metadata: v.item });
      await kv.flush?.();
      const items = [...current.filter((c) => c.id !== v.item.id), v.item].sort(byRecent);
      return json(200, { ok: true, items, id: v.item.id });
    }
  } catch {
    return fail(502, "STORE_ERROR", "The watchlist store did not answer. Your change was not saved; try again in a moment.");
  }

  return fail(400, "INVALID", "Unknown request.");
}
