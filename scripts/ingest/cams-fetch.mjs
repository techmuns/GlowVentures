// ── CAMS AUTO-INTAKE — a scheduled pull into the statement inbox ─────────────
//
//   *"once coding is done … github needs to be connected and direct push to
//    cloudflare pages deployment. Never ask the user to do it just ask them to
//    configure it once so forever its automated."* — the family's standing rule.
//
// CAMS (and KFintech) deliver a family's consolidated mutual-fund and AIF
// statements to a feed the family subscribes to — an SFTP drop, or an emailed
// Consolidated Account Statement (CAS). This job, run on a schedule by
// `.github/workflows/cams-intake.yml`, pulls whatever is NEW on that feed and
// drops it into the SAME statement inbox a dashboard upload uses
// (`shared/statementInbox.mjs`, the `statement-inbox` branch). From there the
// existing intake (`scripts/ingest/intake-uploads.mjs`) reads it into the book,
// through every gate CI runs, and the site redeploys. Nothing new in the
// reading path: CAMS files land exactly as an uploaded folder would.
//
// ── IT DOES NOTHING UNTIL IT IS CONFIGURED ──────────────────────────────────
//
// With no CAMS feed configured (no `CAMS_SFTP_HOST`, no `CAMS_LOCAL_DIR`) it
// logs that it is not configured and exits 0 — safe to schedule before the
// family has wired their feed. The one-time setup (the GitHub Secrets to add,
// and the sample the family sends so a reader is confirmed) is in
// `docs/CAMS-INTAKE.md`. The live SFTP transport is standard but can only be
// validated against the family's own endpoint and a real file; until then this
// job is inert and the local transport (a directory) is what the tests drive.
//
// ── IT NEVER RE-FETCHES THE SAME FILE ───────────────────────────────────────
//
// CAMS reissues the same filenames every month (the same note the ingest keeps
// for `source/`), so a name is not an identity. Each file is keyed by the
// SHA-256 of its bytes; the set of fetched hashes is a small cursor in the
// dashboard store (`cams:cursor`). A file whose hash is already in the cursor is
// skipped; the intake's own byte-identical duplicate check is the backstop, so a
// lost cursor costs a wasted read, never a wrong figure.
//
// ── IT NEVER GUESSES, AND NEVER FABRICATES ──────────────────────────────────
//
// It only MOVES bytes — it reads nothing out of a statement and writes no figure.
// A file that is not a statement format the pipeline reads (`checkUpload`) is
// skipped with its reason; the intake, not this job, decides what a statement
// says, and a file it cannot read in full stays `held`, never guessed at.

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkUpload, inboxFor, inboxPath, makeBatch, newBatchId, uniqueNames, withBatch,
} from "../../shared/statementInbox.mjs";
import { storeFor } from "../../shared/dashboardStore.mjs";

/** The dashboard-store key holding the hashes of every CAMS file fetched so far. */
export const CURSOR_KEY = "cams:cursor";
/** Keep the newest hashes only — a family's whole CAMS history is well under this. */
const CURSOR_CAP = 2000;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// ── TRANSPORTS ──────────────────────────────────────────────────────────────
// Each returns { list(): [{ path, size, mtime }], read(path): Uint8Array, close() }.
// `path` is opaque to the caller and is only ever handed back to `read`.

/** A local directory — the test fixture, and a mounted drop folder if a runner has one. */
export async function localTransport({ dir }) {
  const walk = async (d) => {
    const out = [];
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else if (entry.isFile()) { const st = await stat(full); out.push({ path: full, name: entry.name, size: st.size, mtime: st.mtimeMs }); }
    }
    return out;
  };
  return {
    list: () => walk(dir),
    read: async (p) => new Uint8Array(await readFile(p)),
    close: async () => {},
  };
}

/**
 * The family's CAMS SFTP drop. The client is installed by the workflow, not a
 * project dependency, so the main build and CI never carry it — it is imported
 * only when an SFTP host is configured.
 */
export async function sftpTransport({ host, port, username, password, privateKey, passphrase, remotePath }) {
  const { default: SftpClient } = await import("ssh2-sftp-client");
  const sftp = new SftpClient();
  await sftp.connect({ host, port: Number(port) || 22, username,
    ...(password ? { password } : {}), ...(privateKey ? { privateKey } : {}), ...(passphrase ? { passphrase } : {}) });
  const base = remotePath || ".";
  const walk = async (dir) => {
    const out = [];
    for (const e of await sftp.list(dir)) {
      const full = `${dir.replace(/\/+$/, "")}/${e.name}`;
      if (e.type === "d") out.push(...(await walk(full)));
      else if (e.type === "-") out.push({ path: full, name: e.name, size: e.size, mtime: e.modifyTime });
    }
    return out;
  };
  return {
    list: () => walk(base),
    read: async (p) => { const buf = await sftp.get(p); return buf instanceof Uint8Array ? buf : new Uint8Array(buf); },
    close: async () => { try { await sftp.end(); } catch { /* already closed */ } },
  };
}

/** Pick the transport from the environment, or null when no CAMS feed is configured. */
export async function transportFor(env) {
  if (env.CAMS_SFTP_HOST) {
    return sftpTransport({
      host: env.CAMS_SFTP_HOST, port: env.CAMS_SFTP_PORT, username: env.CAMS_SFTP_USER,
      password: env.CAMS_SFTP_PASSWORD, privateKey: env.CAMS_SFTP_KEY, passphrase: env.CAMS_SFTP_PASSPHRASE,
      remotePath: env.CAMS_SFTP_PATH,
    });
  }
  if (env.CAMS_LOCAL_DIR) return localTransport({ dir: env.CAMS_LOCAL_DIR });
  return null;
}

// ── THE FETCH ───────────────────────────────────────────────────────────────

const logger = { info: (...a) => console.log(...a), warn: (...a) => console.warn(...a) };

/**
 * Pull everything new off `transport` into the inbox. `inbox` is a
 * `githubInbox`, `store` a `dashboardStore` (for the cursor); either may be null
 * in a dry run, which reads and reports but writes nothing.
 */
export async function camsFetch({ transport, inbox, store, now = () => new Date(), dryRun = false, log = logger }) {
  const remote = await transport.list();
  const cursor = (store && (await store.get(CURSOR_KEY))) || { seen: [] };
  const seen = new Set(Array.isArray(cursor.seen) ? cursor.seen : []);

  const fresh = [];
  const freshHashes = [];
  for (const item of remote) {
    const name = item.name ?? path.basename(item.path);
    const check = checkUpload({ name, size: item.size });
    if (check.error) { log.warn(`CAMS: skip ${name} — ${check.error}`); continue; }
    const bytes = await transport.read(item.path);
    const hash = sha256(bytes);
    if (seen.has(hash)) continue; // fetched on an earlier run
    fresh.push({ name: check.name, size: bytes.length, bytes, hash });
    freshHashes.push(hash);
  }

  if (!fresh.length) { log.info("CAMS: nothing new on the feed."); return { fetched: remote.length, added: 0, names: [] }; }

  const named = uniqueNames(fresh);
  if (dryRun) {
    log.info(`CAMS dry run: ${named.length} new file(s) would be queued: ${named.map((f) => f.name).join(", ")}`);
    return { fetched: remote.length, added: 0, names: named.map((f) => f.name), dryRun: true };
  }
  if (!inbox) { log.warn("CAMS: no GitHub token, so the inbox cannot be written — nothing queued."); return { fetched: remote.length, added: 0, names: [] }; }

  const batch = newBatchId(now());
  const add = [];
  const records = [];
  for (const f of named) {
    const blob = await inbox.putBlob(f.bytes);
    add.push({ path: inboxPath(batch, f.name), sha: blob });
    records.push({ name: f.name, size: f.size, blob });
  }
  await inbox.commit({
    message: `CAMS: ${records.length} statement${records.length === 1 ? "" : "s"} from the feed`,
    mutate: (lg) => withBatch(lg, markSource(makeBatch(batch, records, now()))),
    add,
  });
  // Kick the intake now; it also runs on a schedule, so a refused dispatch only delays.
  await inbox.dispatch({ source: "cams" });

  if (store) {
    const nextSeen = [...seen, ...freshHashes].slice(-CURSOR_CAP);
    await store.put(CURSOR_KEY, JSON.stringify({ seen: nextSeen, updatedAt: now().toISOString() }));
    await store.flush();
  }

  log.info(`CAMS: queued ${records.length} file(s) in batch ${batch}: ${records.map((f) => f.name).join(", ")}`);
  return { fetched: remote.length, added: records.length, names: records.map((f) => f.name), batch };
}

/** Mark every file of a CAMS batch with its origin, for the inbox log and the library. */
function markSource(batch) {
  return { ...batch, source: "cams", files: batch.files.map((f) => ({ ...f, source: "cams" })) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export async function main(env = process.env, argv = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run");
  const transport = await transportFor(env);
  if (!transport) {
    logger.info("CAMS intake is not configured (set CAMS_SFTP_HOST or CAMS_LOCAL_DIR). Nothing to do. See docs/CAMS-INTAKE.md.");
    return { added: 0, configured: false };
  }
  try {
    const inbox = dryRun ? null : inboxFor(env);
    const store = dryRun ? null : storeFor(env);
    if (!dryRun && !inbox) logger.warn("CAMS: GLOW_GITHUB_TOKEN is not set; running read-only.");
    return await camsFetch({ transport, inbox, store, dryRun });
  } finally {
    await transport.close?.();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((r) => { if (r?.added) logger.info(`CAMS: done, ${r.added} queued.`); })
    .catch((e) => { console.error("CAMS intake failed:", e?.message ?? e); process.exitCode = 1; });
}
