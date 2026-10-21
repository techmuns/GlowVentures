// Cloudflare Pages Function — STAGE A NEW STATEMENT into its provider's folder.
//
// The Statement Library (`/statements`) is a folder per wealth platform. This is
// the drop box behind each folder: a file chosen there is uploaded here and held
// until the book is rebuilt from it, so the family stops re-attaching statements
// in a chat every month.
//
//   GET    /api/statement-uploads            → { ok: true, uploads: Upload[] }
//   GET    /api/statement-uploads?key=<key>  → the raw file (for the rebuild)
//   POST   /api/statement-uploads            multipart: provider, file
//                                            → { ok: true, upload, uploads }
//   DELETE /api/statement-uploads?key=<key>  → { ok: true, uploads }
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
//
// A STAGING INBOX, never the book. `src/data/glowData.ts` is assembled offline
// by the ingest pipeline under the standing rule that no figure is ever
// fabricated — which is exactly why a browser upload cannot write it. A file
// landed here is raw, unread, and feeds NOTHING on any page until a rebuild
// reads it (`npm run inventory → extract → build-book`, after it is pulled into
// `source/` — see `scripts/ingest/pull-uploads.mjs`). The Library says this
// plainly beside the drop box; a staged file is never counted, priced or shown
// as a holding.
//
// ── WHERE IT LIVES ──────────────────────────────────────────────────────────
//
// R2, not KV: these are PDFs, workbooks and ZIPs up to tens of megabytes, and
// KV values cap at 25 MiB. The bucket is bound to the Pages project as
// `STATEMENT_UPLOADS`, behind the same edge password gate as every `/api/*`
// route (`_middleware.js` answers any request without the session cookie with
// the login page, uploads included, before this file ever runs). Until the
// binding exists every request answers 503 NOT_CONFIGURED and the Library's drop
// box shows the one-time set-up steps (`SWITCH_ON_STEPS` in
// `src/lib/statementUploads.ts`) rather than a box that silently drops files.
//
// ── SET-UP, ONCE ────────────────────────────────────────────────────────────
//
// Cloudflare dashboard → R2 → Create bucket (any name, e.g. glow-statement-
// uploads) → Workers & Pages → the Pages project → Settings → Bindings → Add →
// R2 bucket, variable name `STATEMENT_UPLOADS` (Production, and Preview if
// preview links are used) → redeploy.

const PREFIX = "uploads/";
/** Statements arrive as these; anything else is refused rather than stored unread. */
const ALLOWED_EXT = new Set(["pdf", "xlsx", "xlsm", "xls", "csv", "zip"]);
const EXT_TYPE = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  zip: "application/zip",
};
/** A monthly ZIP of a manager's whole report set is the large end; 50 MB covers it. */
const MAX_SIZE = 50 * 1024 * 1024;
const MAX_PROVIDER = 160;
const MAX_FILENAME = 200;
/** A guard against a runaway inbox — the archive is pulled and cleared, not hoarded. */
const MAX_STAGED = 1000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // A list of what people uploaded, read by everyone: never from a cache.
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const fail = (status, code, message) => json(status, { ok: false, code, message });

/** The file's extension, lower-cased and without the dot — or "" when there is none. */
export function extOf(name) {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** The provider name reduced to a path-safe slug for the R2 key. */
export function slugProvider(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unidentified";
}

/** The original filename, stripped of any path and reduced to safe characters. */
export function safeFileName(name) {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^A-Za-z0-9._ ()+-]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, MAX_FILENAME) || "statement";
}

/** The provider name as it is stored and shown — control chars stripped, capped. */
const cleanProvider = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_PROVIDER);

/**
 * Validate one upload. Returns the record to store (and its R2 key), or the one
 * sentence that says what is wrong — the drop box prints that sentence as it is.
 */
export function validateUpload({ provider, fileName, size }, now = new Date(), rand = () => crypto.randomUUID()) {
  const prov = cleanProvider(provider);
  if (!prov) return { error: "Choose the provider this statement is from." };
  const ext = extOf(fileName);
  if (!ALLOWED_EXT.has(ext)) {
    return { error: "Only statement files are accepted here — PDF, Excel (xlsx/xls), CSV or a ZIP of them." };
  }
  if (!(typeof size === "number" && Number.isFinite(size) && size > 0)) {
    return { error: "That file is empty." };
  }
  if (size > MAX_SIZE) {
    return { error: `That file is larger than ${Math.round(MAX_SIZE / (1024 * 1024))} MB. Upload the statements individually, or ask for the limit to be raised.` };
  }
  const safe = safeFileName(fileName);
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const key = `${PREFIX}${slugProvider(prov)}/${stamp}_${String(rand()).slice(0, 8)}_${safe}`;
  return {
    key,
    record: {
      provider: prov,
      fileName: safe,
      uploadedAt: now.toISOString(),
      contentType: EXT_TYPE[ext] ?? "application/octet-stream",
    },
  };
}

/** A key this function issued — under the prefix, no traversal, bounded length. */
export function isStagedKey(key) {
  return typeof key === "string" && key.startsWith(PREFIX) && !key.includes("..") && key.length <= 400;
}

const uploadsOf = (objects) =>
  objects
    .map((o) => ({
      key: o.key,
      provider: o.customMetadata?.provider ?? "",
      fileName: o.customMetadata?.fileName ?? o.key.split("/").pop() ?? o.key,
      size: typeof o.size === "number" ? o.size : 0,
      uploadedAt: o.customMetadata?.uploadedAt ?? (o.uploaded ? new Date(o.uploaded).toISOString() : ""),
      contentType: o.httpMetadata?.contentType ?? o.customMetadata?.contentType ?? "application/octet-stream",
    }))
    // Newest first, so the file a reader just uploaded is at the top.
    .sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));

async function listUploads(bucket) {
  const out = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix: PREFIX, cursor, include: ["customMetadata", "httpMetadata"] });
    out.push(...(page.objects ?? []));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && out.length < MAX_STAGED + 1);
  return uploadsOf(out);
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const bucket = env?.STATEMENT_UPLOADS;
  if (!bucket || typeof bucket.list !== "function") {
    return fail(503, "NOT_CONFIGURED",
      "Uploading is not switched on yet: the statement store (a Cloudflare R2 bucket bound as STATEMENT_UPLOADS) has not been connected.");
  }

  // ── READ ──────────────────────────────────────────────────────────────────
  if (request.method === "GET") {
    const key = url.searchParams.get("key");
    if (key) {
      if (!isStagedKey(key)) return fail(400, "INVALID", "That is not a staged file.");
      try {
        const obj = await bucket.get(key);
        if (!obj) return fail(404, "NOT_FOUND", "That staged file is no longer here.");
        const name = obj.customMetadata?.fileName ?? key.split("/").pop() ?? "statement";
        return new Response(obj.body, {
          status: 200,
          headers: {
            "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
            "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
            "cache-control": "no-store",
          },
        });
      } catch {
        return fail(502, "STORE_ERROR", "The statement store did not answer. Try again in a moment.");
      }
    }
    try {
      return json(200, { ok: true, uploads: await listUploads(bucket) });
    } catch {
      return fail(502, "STORE_ERROR", "The statement store did not answer. Try again in a moment.");
    }
  }

  // ── A WRITE MUST COME FROM THIS SITE'S OWN PAGE ─────────────────────────────
  // The session cookie is SameSite=None so the dashboard works inside an iframe
  // on muns.io, which means a browser WILL send it cross-site. An Origin that is
  // not this site's own, or a cross-site fetch, is refused — the same guard the
  // capital-call store applies.
  if (request.method === "POST" || request.method === "DELETE") {
    const origin = request.headers.get("origin");
    if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return fail(403, "CROSS_ORIGIN", "Statements can only be uploaded from the dashboard itself.");
    }
  }

  // ── DELETE — remove one staged file (after it is pulled, or a mistaken one) ──
  if (request.method === "DELETE") {
    const key = url.searchParams.get("key");
    if (!isStagedKey(key)) return fail(400, "INVALID", "That is not a staged file.");
    try {
      await bucket.delete(key);
      return json(200, { ok: true, uploads: await listUploads(bucket) });
    } catch {
      return fail(502, "STORE_ERROR", "The statement store did not answer. The file was not removed; try again.");
    }
  }

  // ── POST — stage a file under its provider's folder ─────────────────────────
  if (request.method === "POST") {
    let form;
    try { form = await request.formData(); } catch { return fail(400, "INVALID", "The upload could not be read."); }
    const provider = form.get("provider");
    const file = form.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      return fail(400, "INVALID", "No file was attached to the upload.");
    }
    const v = validateUpload({ provider, fileName: file.name, size: file.size });
    if (v.error) return fail(400, "INVALID", v.error);

    try {
      const current = await listUploads(bucket);
      if (current.length >= MAX_STAGED) {
        return fail(409, "FULL", `The inbox holds ${MAX_STAGED} staged files, its limit. Pull and clear them before adding more.`);
      }
      await bucket.put(v.key, await file.arrayBuffer(), {
        httpMetadata: { contentType: v.record.contentType },
        customMetadata: { provider: v.record.provider, fileName: v.record.fileName, uploadedAt: v.record.uploadedAt },
      });
      const upload = { key: v.key, size: file.size, ...v.record };
      return json(200, { ok: true, upload, uploads: [upload, ...current] });
    } catch {
      return fail(502, "STORE_ERROR", "The statement store did not answer. Your file was not saved; try again in a moment.");
    }
  }

  return fail(405, "METHOD", "Only reading, uploading and removing are supported here.");
}
