// Cloudflare Pages Function — an ENTERED SHARE COUNT per private holding (#434).
//
//   *"Enter private share counts from CAS / MGT-7, or by hand, where the
//    statement carries none."* — the family's feedback.
//
//   GET  /api/holding-shares  → { ok: true, shares: HoldingShares[] }
//   POST /api/holding-shares  { op: "save",   rec: { key, label, shares, source } }
//                             { op: "delete", key }
//                             → { ok: true, shares: HoldingShares[], key }
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// A private holding's statement records what the family PAID, not how many
// shares it holds (`PrivateCompany.tsx`: "the statement carries the amount paid
// and no share count"). Without a share count the stake cannot be struck — its
// fraction of the company is shares × the round's price ÷ its post-money
// (`stakeTrail`). The family can read the real count off a depository CAS, an
// MGT-7 the company files, or an allotment letter, and type it in here — saved
// once for everyone, exactly like the capital calls.
//
// ── IT CARRIES ITS SOURCE, AND IT IS NEVER A STATEMENT FIGURE ───────────────
//
// `source` is required and is kept beside the count — "CAS 31 Mar 2026",
// "MGT-7 FY24", "Allotment letter", "Gaurav, by hand" — because a share count
// with no document behind it is the sort of figure this dashboard renders "—"
// rather than guess. Nothing here reaches `glowData.ts`: it is read only where
// the statement carries no count, feeds the stake calc on the company's own
// page, and every figure it unlocks is labelled there as struck on an entered
// count, not a statement.
//
// ── THE SAME SHARED STORE, THE SAME SET-UP ──────────────────────────────────
//
// One JSON file on the repository's `dashboard-store` branch, written with
// `GLOW_GITHUB_TOKEN` (`shared/dashboardStore.mjs`); 503 NOT_CONFIGURED with the
// one-time steps until that secret is set; behind the edge gate; writable only
// from this site's own page.

import { storeFor } from "../../shared/dashboardStore.mjs";

const PREFIX = "holding-shares:";
/** A private company's own slug id (`privateRounds.ts`). */
const KEY = /^[a-z0-9][a-z0-9-]{0,159}$/;
const MAX_LABEL = 160;
const MAX_SOURCE = 160;
/** A share count beyond this is a typo, not a holding — refuse it rather than store it. */
const MAX_SHARES = 1e13;
const MAX_RECS = 2000;
const MAX_BODY = 8192;
/** KV metadata is capped at 1,024 bytes; a record that will not fit is refused whole. */
const MAX_META = 1000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const fail = (status, code, message) => json(status, { ok: false, code, message });

/** Control characters are stripped: this text is shown to every reader. */
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** The shape every stored record must have to be served — anything else is skipped. */
export function isShares(r) {
  return !!r && typeof r === "object"
    && typeof r.key === "string" && KEY.test(r.key)
    && typeof r.shares === "number" && Number.isFinite(r.shares) && r.shares > 0 && r.shares <= MAX_SHARES
    && typeof r.source === "string" && r.source.length > 0
    && typeof r.label === "string" && typeof r.updatedAt === "string";
}

const byLabel = (a, b) => (a.label || a.key).localeCompare(b.label || b.key) || a.key.localeCompare(b.key);

async function listShares(kv) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: PREFIX, cursor });
    for (const k of page.keys ?? []) {
      let r = k.metadata;
      if (!r) { try { r = await kv.get(k.name, "json"); } catch { r = null; } }
      if (isShares(r)) out.push(r);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort(byLabel);
}

/**
 * Validate a draft. Returns the record to store, or the one sentence that says
 * what is wrong with it. A share count and the DOCUMENT it is read from are
 * both required — a count with no source is exactly the figure this dashboard
 * refuses to show.
 */
export function validateShares(d, now = new Date()) {
  if (!d || typeof d !== "object") return { error: "Nothing to save." };
  const key = String(d.key ?? "");
  if (!KEY.test(key)) return { error: "This share count is not attached to a holding on the page." };
  const shares = typeof d.shares === "number" ? Math.round(d.shares * 1e4) / 1e4 : NaN;
  if (!Number.isFinite(shares) || shares <= 0) return { error: "Give the number of shares the family holds — a number greater than zero." };
  if (shares > MAX_SHARES) return { error: "That is more shares than any holding could be — check the figure." };
  const source = clean(d.source, MAX_SOURCE);
  if (!source) return { error: "Say where this count is from — a CAS, an MGT-7 filing, an allotment letter, or that it was entered by hand." };
  const rec = {
    key,
    label: clean(d.label, MAX_LABEL),
    shares,
    source,
    updatedAt: now.toISOString(),
  };
  if (new TextEncoder().encode(JSON.stringify(rec)).length > MAX_META) {
    return { error: "The source note is too long to save. Shorten it and try again." };
  }
  return { rec };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const kv = storeFor(env);
  if (!kv) {
    return fail(503, "NOT_CONFIGURED",
      "Saving share counts is not switched on yet: the site has no GitHub token (GLOW_GITHUB_TOKEN) to save them to the repository with.");
  }

  if (request.method === "GET") {
    try {
      return json(200, { ok: true, shares: await listShares(kv) });
    } catch {
      return fail(502, "STORE_ERROR", "The shared store did not answer. Nothing was lost; try again in a moment.");
    }
  }

  if (request.method !== "POST") return fail(405, "METHOD", "Only reading and saving are supported here.");

  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "CROSS_ORIGIN", "Share counts can only be saved from the dashboard itself.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "NOT_JSON", "Share counts are saved as JSON.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, "TOO_LARGE", "That is more than one share count.");
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, "INVALID", "The request could not be read."); }

  try {
    if (body?.op === "delete") {
      const key = String(body.key ?? "");
      if (!KEY.test(key)) return fail(400, "INVALID", "This share count is not attached to a holding on the page.");
      await kv.delete(PREFIX + key);
      await kv.flush?.();
      const shares = (await listShares(kv)).filter((r) => r.key !== key);
      return json(200, { ok: true, shares, key });
    }

    if (body?.op === "save") {
      const v = validateShares(body.rec);
      if (v.error) return fail(400, "INVALID", v.error);
      const current = await listShares(kv);
      const isNew = !current.some((r) => r.key === v.rec.key);
      if (isNew && current.length >= MAX_RECS) {
        return fail(409, "FULL", `The store holds ${MAX_RECS} share counts, which is its limit. Delete old ones first.`);
      }
      await kv.put(PREFIX + v.rec.key, JSON.stringify(v.rec), { metadata: v.rec });
      await kv.flush?.();
      const shares = [...current.filter((r) => r.key !== v.rec.key), v.rec].sort(byLabel);
      return json(200, { ok: true, shares, key: v.rec.key });
    }
  } catch {
    return fail(502, "STORE_ERROR", "The shared store did not answer. Your change was not saved; try again in a moment.");
  }

  return fail(400, "INVALID", "Unknown request.");
}
