// Cloudflare Pages Function — UPLOAD STATEMENTS from the Statement Library.
//
// *"give a universal file/folder upload option on the main statement library
//  page. After uploading the file/folder it will automatically be saved in
//  github and all the data will be processed to be wired into the dashboard end
//  to end"* — the family, 21 Oct 2026.
//
//   GET  /api/statement-uploads              → { ok: true, batches }
//   POST /api/statement-uploads              multipart: file, name (its path in the folder)
//                                            → { ok: true, staged: { name, size, blob } }
//   POST /api/statement-uploads              { op: "commit", files: [{ name, size, blob }] }
//                                            → { ok: true, batch, batches, started }
//   POST /api/statement-uploads              { op: "retry", batch }
//                                            → { ok: true, batches, started }
//   POST /api/statement-uploads              { op: "remove", batch, name }
//                                            → { ok: true, batches }
//
// ── WHERE A FILE GOES ───────────────────────────────────────────────────────
//
// Into the GitHub repository, on its `statement-inbox` branch
// (`shared/statementInbox.mjs` has the layout). Each file is stored as a git
// blob as it arrives; `commit` then files the whole upload — a folder of a
// month's statements — as ONE commit and starts the intake workflow
// (`.github/workflows/statement-intake.yml`), which reads every file into the
// book and lands it on `main` only when every gate passes. The page follows
// each file's status in the inbox log.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
//
// It never writes the book. `src/data/glowData.ts` is built by the ingest
// pipeline under the rule that no figure is fabricated; a file here is raw
// until the intake run has read it in full. One the run cannot read is held,
// with the gate's reason, never landed on a guess.
//
// ── SET-UP, ONCE ────────────────────────────────────────────────────────────
//
// The same `GLOW_GITHUB_TOKEN` the dashboard store writes with (Contents read
// and write on this repository — which is also what starting the workflow
// takes). Until it is set every request answers 503 NOT_CONFIGURED and the
// page gives the steps (`SWITCH_ON_STEPS` in `src/lib/statementUploads.ts`).
// Every `/api/*` route sits behind the edge password gate (`_middleware.js`).

import {
  inboxFor, checkUpload, newBatchId, makeBatch, withBatch, uniqueNames, inboxPath,
  requeue, withoutFile, isBatchId, isBlobSha, InboxError, InboxRefusal, MAX_BATCH_FILES, MAX_FILE_BYTES, applyUpdates,
} from "../../shared/statementInbox.mjs";
import { checkStatementBytes } from "../../shared/statementBytes.mjs";
import { publishedStatementDuplicates, recognisePublishedDuplicates } from "../../shared/publishedStatementDuplicates.mjs";
import { rapidStatementsEnabled, rapidStatementRequest, rapidReceiptLog } from '../../shared/rapidStatementBackend.mjs';

const MAX_JSON = 256 * 1024;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // What people uploaded, read by everyone: never from a cache.
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const fail = (status, code, message) => json(status, { ok: false, code, message });

const storeFailed = (e, what) => e instanceof InboxError
  ? fail(502, "STORE_ERROR", `${e.message} ${what}`)
  : fail(502, "STORE_ERROR", `GitHub did not answer. ${what}`);

/** Start the intake run; a refusal only delays the upload to the next scheduled run. */
async function start(inbox, payload) {
  try { return await inbox.dispatch(payload); } catch { return false; }
}

function startRapid(context, inbox, batch) {
  const work = (async () => {
    try {
      const response = await rapidStatementRequest(context.env, '/process', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch }) });
      if (!response?.ok) throw Error();
    } catch {
      // An uncertain response never starts a second processor. A confirmed
      // publication receipt overrides this recoverable error on the next read.
      await inbox.commit({ message: `Statement processing ${batch}: interrupted`, mutate: log => applyUpdates(log,
        (log.batches.find(b => b.id === batch)?.files ?? []).filter(f => f.processor === 'rapid' && ['queued', 'processing'].includes(f.status))
          .map(f => ({ batch, name: f.name, status: 'held', hold: 'intake-error', reason: 'Processing was interrupted. Retry this statement.' }))) });
    }
  })();
  if (context.waitUntil) context.waitUntil(work);
  return work;
}

/** Read only this deployment's static source index, never a client assertion or
 * an unverified main commit. An absent/malformed index takes the usual intake path. */
async function publishedDuplicates(context) {
  if (!context.env.ASSETS?.fetch) return new Map();
  try {
    const read = async path => {
      const response = await context.env.ASSETS.fetch(new URL(path, context.request.url));
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw Error();
      return response.json();
    };
    const [manifest, index] = await Promise.all([read("/audit/manifest.json"), read("/statement-files/index.json")]);
    return publishedStatementDuplicates(manifest, index);
  } catch { return new Map(); }
}

export async function onRequest(context, fetchImpl) {
  const { request, env } = context;
  const inbox = inboxFor(env, fetchImpl);
  if (!inbox) {
    return fail(503, "NOT_CONFIGURED",
      "Uploading is not switched on yet: the site has no GitHub token (GLOW_GITHUB_TOKEN) to save statements with.");
  }

  // ── READ ──────────────────────────────────────────────────────────────────
  if (request.method === "GET") {
    try {
      const [{ log }, matches] = await Promise.all([inbox.read(), publishedDuplicates(context)]);
      // Read-only reconciliation also releases an older receipt from its wait
      // when these exact bytes are already fully available in this deployment.
      const projected = await rapidReceiptLog(env, recognisePublishedDuplicates(log, matches));
      return json(200, { ok: true, batches: projected.batches });
    } catch (e) {
      return storeFailed(e, "Try again in a moment.");
    }
  }

  if (request.method !== "POST") return fail(405, "METHOD", "Only reading and uploading are supported here.");

  // ── A WRITE MUST COME FROM THIS SITE'S OWN PAGE ─────────────────────────────
  // The session cookie is SameSite=None so the dashboard works inside an iframe
  // on muns.io, which means a browser WILL send it cross-site. An Origin that is
  // not this site's own, or a cross-site fetch, is refused — the same guard the
  // capital-call store applies.
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail(403, "CROSS_ORIGIN", "Statements can only be uploaded from the dashboard itself.");
  }

  const type = (request.headers.get("content-type") ?? "").toLowerCase();

  // ── ONE FILE: store its bytes as a blob ─────────────────────────────────────
  if (type.startsWith("multipart/form-data")) {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_FILE_BYTES + 64 * 1024) {
      return fail(413, "TOO_LARGE", `That file is larger than ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB. Upload its statements individually.`);
    }
    let form;
    try { form = await request.formData(); } catch { return fail(400, "INVALID", "The upload could not be read."); }
    const file = form.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      return fail(400, "INVALID", "No file was attached to the upload.");
    }
    const v = checkUpload({ name: form.get("name") || file.name, size: file.size });
    if (v.error) return fail(400, "INVALID", v.error);
    const bytes = new Uint8Array(await file.arrayBuffer());
    // THE BYTES, NOT THE NAME. A mail server's removal notice under a statement's
    // name, or a sign-in page saved as `.pdf`, is refused here with what it is —
    // the moment the person who has the real file can still go and get it.
    const what = checkStatementBytes(bytes, v.name);
    if (!what.ok) return fail(400, what.removalNotice ? "NOT_A_STATEMENT" : "INVALID", what.why);
    try {
      const blob = await inbox.putBlob(bytes);
      return json(200, { ok: true, staged: { name: v.name, size: file.size, blob } });
    } catch (e) {
      return storeFailed(e, "The file was not saved; try again.");
    }
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_JSON) return fail(413, "TOO_LARGE", "That upload lists too many files at once.");
    body = JSON.parse(text);
  } catch {
    return fail(400, "INVALID", "The request could not be read.");
  }

  // ── COMMIT: file the upload as one batch, then start the intake run ─────────
  if (body?.op === "commit") {
    const raw = Array.isArray(body.files) ? body.files : [];
    if (!raw.length) return fail(400, "INVALID", "No files were uploaded.");
    if (raw.length > MAX_BATCH_FILES) return fail(400, "INVALID", `One upload takes at most ${MAX_BATCH_FILES} files; upload the rest separately.`);
    const files = [];
    for (const f of raw) {
      const v = checkUpload({ name: f?.name, size: f?.size });
      if (v.error) return fail(400, "INVALID", `${String(f?.name ?? "A file")}: ${v.error}`);
      if (!isBlobSha(f?.blob)) return fail(400, "INVALID", `${v.name}: the file was not stored first.`);
      files.push({ name: v.name, size: f.size, blob: f.blob });
    }
    const id = newBatchId();
    const matches = await publishedDuplicates(context);
    const batch = recognisePublishedDuplicates({ batches: [makeBatch(id, uniqueNames(files))] }, matches).batches[0];
    if (rapidStatementsEnabled(env)) for (const file of batch.files) if (file.status === 'queued') file.processor = 'rapid';
    try {
      const { log } = await inbox.commit({
        message: `Statement upload ${id}: ${batch.files.length} file${batch.files.length === 1 ? "" : "s"}`,
        add: batch.files.filter(f => f.status === "queued").map((f) => ({ path: inboxPath(id, f.name), sha: f.blob })),
        mutate: (current) => withBatch(current, batch),
      });
      // Exact published copies need neither an analysis runner nor a new build.
      const queued = batch.files.some(f => f.status === 'queued');
      let started = false;
      if (queued && rapidStatementsEnabled(env)) { void startRapid(context, inbox, id); started = true; }
      else if (queued) started = await start(inbox, { batch: id });
      return json(200, { ok: true, batch: id, batches: log.batches, started });
    } catch (e) {
      return storeFailed(e, "Nothing was filed; upload again.");
    }
  }

  // ── RETRY: put a batch's held files back in the queue ───────────────────────
  if (body?.op === "retry") {
    if (!isBatchId(body.batch)) return fail(400, "INVALID", "That is not an upload in the inbox.");
    try {
      let count = 0;
      const { log } = await inbox.commit({
        message: `Statement upload ${body.batch}: retry`,
        mutate: (current) => {
          const r = requeue(current, body.batch);
          count = r.count;
          if (!count) throw new InboxRefusal("Nothing in that upload is waiting to be retried.");
          return r.log;
        },
      });
      let started;
      const rapid = log.batches.find(b => b.id === body.batch)?.files.some(f => f.processor === 'rapid' && f.status === 'queued');
      if (rapid && rapidStatementsEnabled(env)) { void startRapid(context, inbox, body.batch); started = true; }
      else if (rapid) started = false;
      else started = await start(inbox, { batch: body.batch, retry: count });
      return json(200, { ok: true, batches: log.batches, started });
    } catch (e) {
      if (e instanceof InboxRefusal) return fail(409, "REFUSED", e.message);
      return storeFailed(e, "Nothing was changed; try again.");
    }
  }

  // ── REMOVE: take a queued or held file out of the inbox ─────────────────────
  if (body?.op === "remove") {
    const name = typeof body.name === "string" ? body.name : "";
    if (!isBatchId(body.batch) || !name) return fail(400, "INVALID", "That is not an upload in the inbox.");
    try {
      const { log } = await inbox.commit({
        message: `Statement upload ${body.batch}: remove ${name}`,
        remove: [inboxPath(body.batch, name)],
        mutate: (current) => {
          const r = withoutFile(current, body.batch, name);
          if (r.error) throw new InboxRefusal(r.error);
          return r.log;
        },
      });
      return json(200, { ok: true, batches: log.batches });
    } catch (e) {
      if (e instanceof InboxRefusal) return fail(409, "REFUSED", e.message);
      return storeFailed(e, "Nothing was removed; try again.");
    }
  }

  return fail(400, "INVALID", "Unknown request.");
}
