// Cloudflare Pages Function — a DOCUMENTS-FOLDER LINK per private holding (#420).
//
//   *"Open OneDrive folder link per investment."* — the family's feedback.
//
//   GET  /api/holding-links  → { ok: true, links: HoldingLink[] }
//   POST /api/holding-links  { op: "save",   link: { key, label, url, note } }
//                            { op: "delete", key }
//                            → { ok: true, links: HoldingLink[], key }
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────────
//
// The family keeps a private holding's paperwork — term sheets, SHAs, the CA's
// workings — in a cloud folder of their own (OneDrive, a shared drive, a Drive
// link). This is the ONE external URL per holding that opens that folder, saved
// once and seen by everyone who opens the dashboard: the same editable-column
// idea as the capital calls, one row per company. It is NOT the uploaded
// documents the Portfolio Library already holds (`holdingDocuments`); it is a
// pointer to a folder that lives elsewhere.
//
// ── IT IS A LINK, AND NOTHING IS DERIVED FROM IT ────────────────────────────
//
// Nothing here reaches `glowData.ts` or any figure. A folder link values
// nothing, counts toward nothing, and is read only as what it is — a URL the
// family typed. It must be an http(s) address; anything else (a `javascript:`
// or `data:` URL, a bare word) is refused rather than stored, because this URL
// is put into an anchor every reader can click.
//
// ── THE SAME SHARED STORE, THE SAME SET-UP ──────────────────────────────────
//
// One JSON file in this repository, on its `dashboard-store` branch, written
// with `GLOW_GITHUB_TOKEN` (`shared/dashboardStore.mjs`). Until that secret is
// set every request answers 503 NOT_CONFIGURED and the control says so with the
// same one-time steps the capital calls use (`SWITCH_ON_STEPS`). Behind the
// edge password gate, and writable only from this site's own page.

import { storeFor } from "../../shared/dashboardStore.mjs";

const PREFIX = "holding-link:";
/** A private company's own slug id (`privateRounds.ts` ids: `zepto`, `waterwala-labs`). */
const KEY = /^[a-z0-9][a-z0-9-]{0,159}$/;
const MAX_URL = 2048;
const MAX_LABEL = 160;
const MAX_NOTE = 240;
const MAX_LINKS = 2000;
const MAX_BODY = 8192;
/** KV metadata is capped at 1,024 bytes; a record that will not fit is refused whole. */
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

/**
 * An http(s) URL, trimmed, or null. A link is put into an anchor every reader
 * can click, so only http and https are kept — never `javascript:`, `data:`,
 * `file:` or a bare word, which would be a live trap under the family's own
 * folder label.
 */
export function cleanUrl(s) {
  const t = String(s ?? "").trim();
  if (!t || t.length > MAX_URL || /[\u0000-\u001f\u007f\s]/.test(t)) return null;
  let u;
  try { u = new URL(t); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return u.toString();
}

/** The shape every stored link must have to be served — anything else is skipped. */
export function isLink(l) {
  return !!l && typeof l === "object"
    && typeof l.key === "string" && KEY.test(l.key)
    && typeof l.url === "string" && cleanUrl(l.url) === l.url
    && typeof l.label === "string" && typeof l.note === "string" && typeof l.updatedAt === "string";
}

const byLabel = (a, b) => (a.label || a.key).localeCompare(b.label || b.key) || a.key.localeCompare(b.key);

async function listLinks(kv) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: PREFIX, cursor });
    for (const k of page.keys ?? []) {
      let l = k.metadata;
      // A key written without metadata (by hand, or by an older build) is read
      // in full rather than silently dropped from the list.
      if (!l) { try { l = await kv.get(k.name, "json"); } catch { l = null; } }
      if (isLink(l)) out.push(l);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort(byLabel);
}

/**
 * Validate a draft. Returns the link to store, or the one sentence that says
 * what is wrong with it — the editor prints that sentence as it is.
 */
export function validateLink(d, now = new Date()) {
  if (!d || typeof d !== "object") return { error: "Nothing to save." };
  const key = String(d.key ?? "");
  if (!KEY.test(key)) return { error: "This link is not attached to a holding on the page." };
  const url = cleanUrl(d.url);
  if (!url) return { error: "Give the folder's web address — an https link, for example to your OneDrive or shared-drive folder." };
  const link = {
    key,
    label: clean(d.label, MAX_LABEL),
    url,
    note: clean(d.note, MAX_NOTE),
    updatedAt: now.toISOString(),
  };
  if (new TextEncoder().encode(JSON.stringify(link)).length > MAX_META) {
    return { error: "The label or note is too long to save. Shorten it and try again." };
  }
  return { link };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const kv = storeFor(env);
  if (!kv) {
    return fail(503, "NOT_CONFIGURED",
      "Saving documents-folder links is not switched on yet: the site has no GitHub token (GLOW_GITHUB_TOKEN) to save them to the repository with.");
  }

  if (request.method === "GET") {
    try {
      return json(200, { ok: true, links: await listLinks(kv) });
    } catch {
      return fail(502, "STORE_ERROR", "The shared store did not answer. Nothing was lost; try again in a moment.");
    }
  }

  if (request.method !== "POST") return fail(405, "METHOD", "Only reading and saving are supported here.");

  // ── A WRITE MUST COME FROM THIS SITE'S OWN PAGE ───────────────────────────
  // The session cookie is `SameSite=None` so the dashboard works inside an
  // iframe on muns.io; a JSON body cannot be sent cross-site without a CORS
  // preflight this function never approves, and an `Origin` that is not this
  // site's own is refused outright.
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "CROSS_ORIGIN", "Documents-folder links can only be saved from the dashboard itself.");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "NOT_JSON", "Links are saved as JSON.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, "TOO_LARGE", "That is more than one link.");
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, "INVALID", "The request could not be read."); }

  try {
    if (body?.op === "delete") {
      const key = String(body.key ?? "");
      if (!KEY.test(key)) return fail(400, "INVALID", "This link is not attached to a holding on the page.");
      await kv.delete(PREFIX + key);
      await kv.flush?.();
      // The list is eventually consistent, so the answer applies the delete
      // itself: whoever deleted it must never see it come back.
      const links = (await listLinks(kv)).filter((l) => l.key !== key);
      return json(200, { ok: true, links, key });
    }

    if (body?.op === "save") {
      const v = validateLink(body.link);
      if (v.error) return fail(400, "INVALID", v.error);
      const current = await listLinks(kv);
      const isNew = !current.some((l) => l.key === v.link.key);
      if (isNew && current.length >= MAX_LINKS) {
        return fail(409, "FULL", `The store holds ${MAX_LINKS} links, which is its limit. Delete old ones first.`);
      }
      await kv.put(PREFIX + v.link.key, JSON.stringify(v.link), { metadata: v.link });
      await kv.flush?.();
      const links = [...current.filter((l) => l.key !== v.link.key), v.link].sort(byLabel);
      return json(200, { ok: true, links, key: v.link.key });
    }
  } catch {
    return fail(502, "STORE_ERROR", "The shared store did not answer. Your change was not saved; try again in a moment.");
  }

  return fail(400, "INVALID", "Unknown request.");
}
