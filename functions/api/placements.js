// Cloudflare Pages Function — WHERE THE FAMILY HAS MOVED A HOLDING, saved for everyone.
//
// *"Allow the ability for any security or row to move any sub tab by doing
//  right click — for example if i want to move DSP gold from alternate to any
//  other i should be able to do so"* — the family, 4 Nov 2026 (Stage 10lm).
//
//   GET  /api/placements   → { ok: true, placements: [{ axis, product, section, updatedAt }] }
//   POST /api/placements   { axis, products, section }  → { ok: true, placements }
//
// A placement says which section ONE PRODUCT sits in on ONE axis — the
// Portfolio Monitor's Category, Asset class or Basket tabs. A product is what
// the family's own review lists (`productKeyOf` in `src/lib/familyTaxonomy.ts`):
// a security, `sec:<securityKey>`, or a whole PMS mandate, `mandate:<accountId>`.
// `section: null` removes the placement, which puts the holding back where the
// review, the family's rules or the book itself place it.
//
// ── A SECTION NAME, AND NOTHING ELSE ────────────────────────────────────────
//
// Never a figure: what is stored decides which heading a row is drawn under and
// nothing it adds up to. The page reads a name only if it is one of that axis's
// own sections, so a name a later build does not know is ignored rather than
// drawn as a heading of its own. Nothing here reaches `glowData.ts`.
//
// One key per axis and product (`placement:<axis>:<product>`), last write wins:
// the site has one password and no user accounts, as with the tile layouts.
// Set-up is the capital-call column's, once: the site's `GLOW_GITHUB_TOKEN`.

import { storeFor } from "../../shared/dashboardStore.mjs";

const PREFIX = "placement:";
const PLACEMENT_AXES = ["category", "assetClass", "basket"];
/** `sec:<securityKey>` or `mandate:<accountId>` — the book's own slugs (account ids keep a statement's capitals). */
const PRODUCT = /^(sec|mandate):[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
/** A heading the page draws: words, `&`, `/` and `'` — never markup. */
const SECTION = /^[A-Za-z0-9][A-Za-z0-9 &/'’(),.—-]{0,59}$/;
/** One row stands for a handful of products (three classes of one fund, two accounts of one mandate). */
const MAX_PRODUCTS = 40;
const MAX_BODY = 8192;

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

/** A stored placement, as `GET` returns it. */
export function isPlacement(p) {
  return !!p && typeof p === "object"
    && PLACEMENT_AXES.includes(p.axis)
    && typeof p.product === "string" && PRODUCT.test(p.product)
    && typeof p.section === "string" && SECTION.test(p.section)
    && typeof p.updatedAt === "string";
}

/**
 * Validate one move. Returns the placements to store (or the products to
 * clear), or the one sentence that says what is wrong with it.
 */
export function validatePlacementChange(body, now = new Date()) {
  if (!body || typeof body !== "object") return { error: "Nothing to save." };
  const axis = String(body.axis ?? "");
  if (!PLACEMENT_AXES.includes(axis)) return { error: "Holdings move between the Category, Asset class and Basket tabs only." };
  if (!Array.isArray(body.products) || body.products.length === 0) return { error: "No holding was named to move." };
  if (body.products.length > MAX_PRODUCTS) return { error: "That is more holdings than one row stands for." };
  const products = [];
  for (const p of body.products) {
    if (typeof p !== "string" || !PRODUCT.test(p)) return { error: "One of the holdings is not one this dashboard knows." };
    if (!products.includes(p)) products.push(p);
  }
  const section = body.section;
  if (section !== null && (typeof section !== "string" || !SECTION.test(section))) {
    return { error: "That is not a tab this dashboard draws." };
  }
  return { change: { axis, products, section, updatedAt: now.toISOString() } };
}

async function listPlacements(kv) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: PREFIX, cursor });
    for (const k of page.keys ?? []) {
      let p = k.metadata;
      if (!p) { try { p = await kv.get(k.name, "json"); } catch { p = null; } }
      if (isPlacement(p)) out.push({ axis: p.axis, product: p.product, section: p.section, updatedAt: p.updatedAt });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const kv = storeFor(env);
  if (!kv) {
    return fail(503, "NOT_CONFIGURED",
      "Saving moved holdings for everyone is not switched on yet: the site has no GitHub token (GLOW_GITHUB_TOKEN) to save them to the repository with.");
  }

  if (request.method === "GET") {
    try {
      return json(200, { ok: true, placements: await listPlacements(kv) });
    } catch {
      return fail(502, "STORE_ERROR", "The store of moved holdings did not answer.");
    }
  }

  if (request.method !== "POST") return fail(405, "METHOD", "Only reading and saving are supported here.");

  // The capital-call store's two guards, for its reason: the session cookie is
  // sent cross-site, so a write must prove it came from this site's own page.
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "CROSS_ORIGIN", "Holdings can only be moved from the dashboard itself.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "NOT_JSON", "Moves are saved as JSON.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, "TOO_LARGE", "That is more than one move.");
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, "INVALID", "The request could not be read."); }

  const v = validatePlacementChange(body);
  if (v.error) return fail(400, "INVALID", v.error);
  const { axis, products, section, updatedAt } = v.change;
  try {
    for (const product of products) {
      const key = `${PREFIX}${axis}:${product}`;
      if (section === null) await kv.delete(key);
      else {
        const p = { axis, product, section, updatedAt };
        await kv.put(key, JSON.stringify(p), { metadata: p });
      }
    }
    // One flush, one commit: a row's three fund classes move together or not at all.
    await kv.flush?.();
    // KV's list is eventually consistent, so the answer applies the move itself:
    // whoever moved a holding must never see it jump back.
    const moved = new Set(products);
    const placements = (await listPlacements(kv)).filter((p) => !(p.axis === axis && moved.has(p.product)));
    if (section !== null) for (const product of products) placements.push({ axis, product, section, updatedAt });
    return json(200, { ok: true, placements });
  } catch {
    return fail(502, "STORE_ERROR", "The store did not answer. The move is kept in this browser; try again in a moment.");
  }
}
