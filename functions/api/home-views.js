// Cloudflare Pages Function — THE NAMED HOME VIEWS, saved for everyone.
//
// *"Look at all the widgets they have and the view function they have for the
//  home page where people can see many views."* — the family, 17 Nov 2026.
//
//   GET  /api/home-views   → { ok: true, views: HomeView[] | null }
//   POST /api/home-views   { views }  → { ok: true, views }
//
// ── WHY A SERVER STORE AND NOT ONLY `localStorage` ──────────────────────────
//
// Home already kept its named views in `localStorage` — a memory of ONE
// BROWSER. It survives a reload and a new tab; it does not survive a second
// laptop, a phone, a cleared browser, or the partitioned storage a browser
// gives a page embedded in another site's frame (the dashboard is served inside
// one). Each of those reads to the family as "my views are gone". So the view
// DEFINITIONS live here, in the same shared store the tile layouts and
// capital calls use (`shared/dashboardStore.mjs`), and `localStorage` stays as
// the instant copy the page paints from before this answers — and as the whole
// of the memory where this store is not connected.
//
// ── ONE SET OF VIEWS, THE SAME FOR EVERYONE ─────────────────────────────────
//
// The site has one password and no user accounts, so there is no "whose" views
// to key on: the views are the dashboard's, as the tile layouts are. One key
// (`home-views:default`), last write wins. WHICH view a reader is looking at is
// their own browser's business and is NOT stored here, so moving between views
// on one device never changes what another device shows.
//
// ── A VIEW IS A NAME AND A LIST OF WIDGET IDS AND SIZES, NOTHING ELSE ────────
//
// Never a figure. The page decides what a widget MEANS from the book at render
// time, so nothing stored here can put a number on screen, and a widget id the
// current build does not know is dropped by the page (`sanitizeViews`) rather
// than drawn blank. Nothing here reaches `glowData.ts`.
//
// Set-up is the tile store's, once: the site's `GLOW_GITHUB_TOKEN` secret.
// Until then every request answers 503 `NOT_CONFIGURED` and Home keeps the
// views in the browser, saying so on the view bar.

import { storeFor } from "../../shared/dashboardStore.mjs";

const KEY = "home-views:default";
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SIZES = new Set(["quarter", "half", "wide", "full"]);
const MAX_VIEWS = 24;
const MAX_NAME = 48;
const MAX_WIDGETS = 60;
const MAX_BODY = 65536;

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

/** One layout entry: a known widget id and a known size. Unknowns are dropped, not refused. */
function cleanLayout(layout) {
  if (!Array.isArray(layout)) return [];
  const seen = new Set();
  const out = [];
  for (const row of layout) {
    const id = row && typeof row === "object" ? row.id : null;
    if (typeof id !== "string" || !ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, size: SIZES.has(row.size) ? row.size : "full" });
    if (out.length >= MAX_WIDGETS) break;
  }
  return out;
}

/**
 * Validate what Home sent. SHAPE only — this store never decides what a widget
 * means, so an id the current build does not know is kept here and dropped by
 * the page. Returns the views to store, or the one sentence that says what is
 * wrong. An empty views list is legitimate: a reader may remove every view down
 * to one, and the page always keeps at least one itself.
 */
export function validateViews(body) {
  if (!body || typeof body !== "object") return { error: "Nothing to save." };
  if (!Array.isArray(body.views)) return { error: "These are not home views." };
  if (body.views.length > MAX_VIEWS) return { error: "That is more views than the dashboard keeps." };
  const takenIds = new Set();
  const views = [];
  for (const v of body.views) {
    if (!v || typeof v !== "object") continue;
    const name = typeof v.name === "string" ? v.name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME) : "";
    const base = typeof v.id === "string" && ID.test(v.id) ? v.id : "";
    if (!base || takenIds.has(base)) continue;
    takenIds.add(base);
    views.push({ id: base, name: name || "Untitled view", layout: cleanLayout(v.layout) });
  }
  return { views };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const kv = storeFor(env);
  if (!kv) {
    return fail(503, "NOT_CONFIGURED",
      "Saving home views for everyone is not switched on yet: the site has no GitHub token (GLOW_GITHUB_TOKEN) to save them to the repository with.");
  }

  if (request.method === "GET") {
    try {
      const rec = await kv.get(KEY);
      const views = rec && Array.isArray(rec.views) ? rec.views : null;
      return json(200, { ok: true, views });
    } catch {
      return fail(502, "STORE_ERROR", "The views store did not answer.");
    }
  }

  if (request.method !== "POST") return fail(405, "METHOD", "Only reading and saving are supported here.");

  // The same two guards as the tile store, for the same reason: the session
  // cookie is sent cross-site, so a write must prove it came from this site.
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "CROSS_ORIGIN", "Views can only be saved from the dashboard itself.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "NOT_JSON", "Views are saved as JSON.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, "TOO_LARGE", "That is more than one set of views.");
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, "INVALID", "The request could not be read."); }

  const v = validateViews(body);
  if (v.error) return fail(400, "INVALID", v.error);
  const payload = { views: v.views, updatedAt: new Date().toISOString() };
  try {
    await kv.put(KEY, JSON.stringify(payload), { metadata: { updatedAt: payload.updatedAt } });
    await kv.flush?.();
    return json(200, { ok: true, views: v.views });
  } catch {
    return fail(502, "STORE_ERROR", "The views store did not answer. Your views are kept in this browser; try again in a moment.");
  }
}
