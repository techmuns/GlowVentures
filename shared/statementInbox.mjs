// THE STATEMENT INBOX — every statement uploaded from the dashboard, kept in the
// GitHub repository until the intake run reads it into the book.
//
//   *"give a universal file/folder upload option on the main statement library
//    page. After uploading the file/folder it will automatically be saved in
//    github and all the data will be processed to be wired into the dashboard
//    end to end … and also the file will automatically be arranged in its
//    correct respective folder in statement library."* — the family, 21 Oct 2026.
//
// ── WHERE AN UPLOAD LIVES ───────────────────────────────────────────────────
//
//   branch  statement-inbox            (GLOW_INBOX_BRANCH)
//   files   files/<batch>/<path>       the bytes, exactly as uploaded
//   log     inbox.json                 every batch, every file, and its status
//
// A branch of its own with no parent, like the dashboard store's
// (`shared/dashboardStore.mjs`): an upload never touches `main`, never races the
// bots that push there, and its commit message carries `[skip ci]`, so neither
// CI nor the site's build runs for it.
//
// ── HOW IT REACHES THE BOOK ─────────────────────────────────────────────────
//
// The Pages Function (`functions/api/statement-uploads.js`) stores each file as
// a git blob and commits a batch in one commit, then asks GitHub to start the
// intake workflow (`.github/workflows/statement-intake.yml`). That run
// (`scripts/ingest/intake-uploads.mjs`) puts each new file under
// `source/uploads-<date>/<provider>/`, runs the whole ingest — inventory,
// extract, build-book — and every gate CI runs, and lands the statement on
// `main` only when all of them pass. The site then redeploys and the statement
// is in its provider's folder in the Statement Library.
//
// A file the pipeline cannot read in full is NOT landed and NOT guessed at: it
// stays in the inbox, `held`, with the reason the gate gave (a layout no reader
// knows, a sealed PDF with no password) — the standing rule that no figure is
// ever fabricated. `Retry` re-queues it once the reader exists.
//
// ── STATUSES ────────────────────────────────────────────────────────────────
//
//   queued      saved in the inbox, waiting for the intake run
//   processing  an intake run is reading it now
//   landed      on `main`, in the book — `landedAs`, `providers`, `docKeys`
//   duplicate   byte-identical to a statement already in `source/`; nothing to add
//   held        not landed — `hold` names the kind and `reason` the cause
//
// The repository is public, so everything uploaded here is public — the same
// terms every statement already in `source/` is kept on.

export const INBOX_DEFAULTS = Object.freeze({
  repo: "techmuns/GlowVentures",
  branch: "statement-inbox",
  log: "inbox.json",
  files: "files",
  event: "statement-intake",
});

/** The file types the ingest pipeline reads (`READABLE_EXT` in inventory.mjs), and the ZIPs it expands. */
export const STATEMENT_EXT = Object.freeze(["pdf", "xlsx", "xls", "zip"]);
/** The largest statement in `source/` is a 4.7 MB ZIP; 25 MB is ample and keeps a Function's memory bounded. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** One upload — a folder of a month's statements is tens of files. */
export const MAX_BATCH_FILES = 200;
/** The log keeps every batch with a file still open, and this many settled ones. */
export const MAX_SETTLED_BATCHES = 100;
const MAX_PATH = 240;
const MAX_DEPTH = 8;

export const STATUSES = Object.freeze(["queued", "processing", "landed", "duplicate", "held"]);
export const HOLDS = Object.freeze(["needs-reader", "needs-password", "unreadable", "not-a-statement", "check-failed", "intake-error"]);
const OPEN = new Set(["queued", "processing", "held"]);

/** The file's extension, lower-cased and without the dot — or "" when there is none. */
export function extOf(name) {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * Operating-system furniture a folder upload sweeps up — never a statement, so
 * it is skipped by name rather than reported as a file nobody can read.
 */
export function isJunkPath(p) {
  const parts = String(p ?? "").split(/[\\/]/).filter(Boolean);
  const base = (parts.at(-1) ?? "").toLowerCase();
  return parts.some((s) => s === "__MACOSX" || s.startsWith("._"))
    || base === ".ds_store" || base === "thumbs.db" || base === "desktop.ini" || base.startsWith("~$");
}

/**
 * The path a file was uploaded under (a folder upload keeps its folders),
 * reduced to segments that are safe in a git tree and a file system: no
 * traversal, no control characters, nothing a shell or Windows refuses. Null
 * when nothing usable is left.
 */
export function cleanUploadPath(raw) {
  const segs = String(raw ?? "").replace(/\\/g, "/").split("/")
    .map((s) => s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[<>:"|?*]/g, "_").replace(/\s+/g, " ").trim())
    .filter((s) => s && s !== "." && s !== "..")
    .map((s) => s.replace(/^\.+/, "_").replace(/[. ]+$/, "").slice(0, 120))
    .filter(Boolean);
  if (!segs.length) return null;
  const kept = segs.slice(-MAX_DEPTH);
  const out = kept.join("/");
  return out.length > MAX_PATH ? kept.at(-1).slice(-MAX_PATH) : out;
}

/**
 * Validate one file before it is stored. Returns its clean path, or the one
 * sentence that says what is wrong — the page prints that sentence as it is.
 */
export function checkUpload({ name, size }) {
  const clean = cleanUploadPath(name);
  if (!clean) return { error: "That file has no usable name." };
  if (isJunkPath(clean)) return { error: "That is a system file, not a statement." };
  if (!STATEMENT_EXT.includes(extOf(clean))) {
    return { error: "Only statement files are read — PDF, Excel (xlsx/xls) or a ZIP of them." };
  }
  if (!(typeof size === "number" && Number.isFinite(size) && size > 0)) return { error: "That file is empty." };
  if (size > MAX_FILE_BYTES) {
    return { error: `That file is larger than ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB. Upload its statements individually.` };
  }
  return { name: clean };
}

/** A batch's id: when it arrived, then a random tail — sortable, and safe as a folder name. */
export function newBatchId(now = new Date(), rand = () => crypto.randomUUID()) {
  const t = now.toISOString().replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "");
  return `${t}-${String(rand()).replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`;
}
export const isBatchId = (s) => typeof s === "string" && /^\d{8}T\d{6}Z-[a-z0-9]{1,8}$/.test(s);
export const isBlobSha = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);

/** Where a file's bytes sit on the inbox branch. */
export const inboxPath = (batch, name, files = INBOX_DEFAULTS.files) => `${files}/${batch}/${name}`;

export const emptyLog = () => ({ version: 1, batches: [] });

export function parseLog(text) {
  const j = JSON.parse(text);
  if (!j || typeof j !== "object" || !Array.isArray(j.batches)) throw new Error("The inbox log is not an inbox log.");
  return { version: 1, batches: j.batches.filter((b) => b && isBatchId(b.id) && Array.isArray(b.files)) };
}

/** Newest batch first, one file per line of the diff a reader will look at. */
export function serializeLog(log) {
  const batches = [...log.batches].sort((a, b) => b.id.localeCompare(a.id));
  return JSON.stringify({ version: 1, batches }, null, 1) + "\n";
}

const settled = (b) => b.files.every((f) => !OPEN.has(f.status));

/** The log with a new batch added — and the oldest SETTLED batches dropped past the cap. */
export function withBatch(log, batch) {
  const rest = log.batches.filter((b) => b.id !== batch.id);
  const all = [batch, ...rest].sort((a, b) => b.id.localeCompare(a.id));
  let kept = 0;
  return {
    version: 1,
    batches: all.filter((b) => !settled(b) || ++kept <= MAX_SETTLED_BATCHES),
  };
}

/** A new batch's record: every file queued. */
export function makeBatch(id, files, now = new Date()) {
  const at = now.toISOString();
  return {
    id,
    uploadedAt: at,
    files: files.map((f) => ({
      name: f.name, size: f.size, blob: f.blob,
      status: "queued", hold: null, reason: null,
      landedAs: null, providers: null, docKeys: null, commit: null, run: null, updatedAt: at,
    })),
  };
}

/**
 * Two files of one batch cannot share a path; the second becomes `name (2).ext`.
 * A folder upload that carries the same statement twice keeps both until the
 * intake run finds they are byte-identical.
 */
export function uniqueNames(files) {
  const seen = new Set();
  return files.map((f) => {
    let name = f.name;
    for (let n = 2; seen.has(name.toLowerCase()); n++) {
      name = f.name.replace(/(\.[^./]+)?$/, (ext) => ` (${n})${ext || ""}`);
    }
    seen.add(name.toLowerCase());
    return { ...f, name };
  });
}

/** Every file still waiting for an intake run, oldest batch first. */
export function queuedFiles(log) {
  return [...log.batches].sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((b) => b.files.filter((f) => f.status === "queued" && f.processor !== 'rapid').map((f) => ({ batch: b.id, file: f })));
}

/**
 * Lay updates over the log — `{ batch, name, ...fields }` each, matched on the
 * batch and the file's path. An update for a file somebody removed meanwhile is
 * dropped rather than resurrecting it.
 */
export function applyUpdates(log, updates, now = new Date()) {
  const at = now.toISOString();
  const by = new Map(updates.map((u) => [`${u.batch}\u0000${u.name}`, u]));
  return {
    version: 1,
    batches: log.batches.map((b) => ({
      ...b,
      files: b.files.map((f) => {
        const u = by.get(`${b.id}\u0000${f.name}`);
        if (!u) return f;
        const { batch: _b, name: _n, ...fields } = u;
        return { ...f, ...fields, updatedAt: at };
      }),
    })),
  };
}

/** Put a batch's held files back in the queue — after a reader is written, or a password set. */
export function requeue(log, batchId, now = new Date()) {
  const b = log.batches.find((x) => x.id === batchId);
  const held = b ? b.files.filter((f) => f.status === "held") : [];
  if (!held.length) return { log, count: 0 };
  return {
    count: held.length,
    log: applyUpdates(log, held.map((f) => ({
      batch: batchId, name: f.name, status: "queued", hold: null, reason: null, run: null,
    })), now),
  };
}

/**
 * Take one file out of the inbox. Only a file that has not reached the book and
 * is not being read: a queued or a held one. Returns the reason when refused.
 */
export function withoutFile(log, batchId, name) {
  const b = log.batches.find((x) => x.id === batchId);
  const f = b?.files.find((x) => x.name === name);
  if (!f) return { error: "That upload is no longer in the inbox." };
  if (f.status === "processing") return { error: "That file is being read into the book right now; wait for the run to finish." };
  if (f.status !== "queued" && f.status !== "held") return { error: "That file has already been read; it is part of the library now." };
  const files = b.files.filter((x) => x !== f);
  return {
    removed: f,
    log: { version: 1, batches: files.length ? log.batches.map((x) => (x === b ? { ...b, files } : x)) : log.batches.filter((x) => x !== b) },
  };
}

// ── THE GITHUB SIDE ─────────────────────────────────────────────────────────

const API = "https://api.github.com";
const ATTEMPTS = 4;

/** A failure with the status GitHub gave, so the Function can say what went wrong. */
export class InboxError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
/** A change the log itself refuses (removing a file being read) — not GitHub's doing. */
export class InboxRefusal extends Error {}

const bytesToBase64Parts = (bytes) => {
  // 3-byte aligned chunks, so each chunk's base64 joins the next with no padding.
  const parts = [];
  const STEP = 3 * 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    const chunk = bytes.subarray(i, i + STEP);
    let bin = "";
    for (let j = 0; j < chunk.length; j += 0x8000) bin += String.fromCharCode(...chunk.subarray(j, j + 0x8000));
    parts.push(btoa(bin));
  }
  return parts;
};
const textToBase64 = (text) => bytesToBase64Parts(new TextEncoder().encode(text)).join("");
const base64ToText = (b64) => {
  const bin = atob(String(b64 ?? "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

/**
 * The inbox for a request, or null where the site has no token to write with —
 * which the Function answers as 503 NOT_CONFIGURED. It is the SAME token the
 * dashboard store writes with (`GLOW_GITHUB_TOKEN`, Contents read and write on
 * this repository), which is also what starting the intake run needs.
 */
export function inboxFor(env, fetchImpl) {
  const token = String(env?.GLOW_GITHUB_TOKEN ?? "").trim();
  if (!token) return null;
  return githubInbox({
    token,
    repo: env.GLOW_GITHUB_REPO || INBOX_DEFAULTS.repo,
    branch: env.GLOW_INBOX_BRANCH || INBOX_DEFAULTS.branch,
  }, fetchImpl);
}

export function githubInbox({ token, repo, branch }, fetchImpl = (...a) => fetch(...a)) {
  const LOG = INBOX_DEFAULTS.log;
  const call = async (method, url, body) => {
    const raw = body instanceof Blob;
    const r = await fetchImpl(`${API}/repos/${repo}${url}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "glow-ventures-dashboard",
        "cache-control": "no-cache",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? (raw ? body : JSON.stringify(body)) : undefined,
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: r.status, json };
  };
  const enc = (s) => s.split("/").map(encodeURIComponent).join("/");
  const expect = (r, ok, what) => {
    if (!ok.includes(r.status)) throw new InboxError(`GitHub answered HTTP ${r.status} ${what}.`, r.status);
    return r.json;
  };

  /** The branch as it stands: its head, its tree and the log — or no branch yet. */
  async function read() {
    const ref = await call("GET", `/git/ref/heads/${enc(branch)}`);
    if (ref.status === 404) return { head: null, tree: null, log: emptyLog() };
    const head = expect(ref, [200], "reading the inbox")?.object?.sha;
    const commit = expect(await call("GET", `/git/commits/${head}`), [200], "reading the inbox");
    const file = await call("GET", `/contents/${enc(LOG)}?ref=${head}`);
    if (file.status === 404) return { head, tree: commit.tree.sha, log: emptyLog() };
    const meta = expect(file, [200], "reading the inbox log");
    let content = meta.content;
    // Past 1 MB the contents API leaves `content` empty; the blob has it.
    if (!content && meta.sha) content = expect(await call("GET", `/git/blobs/${meta.sha}`), [200], "reading the inbox log").content;
    return { head, tree: commit.tree.sha, log: parseLog(base64ToText(content)) };
  }

  return {
    read,

    /** Store one file's bytes as a git blob. Nothing points at it until `commit`. */
    async putBlob(bytes) {
      const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const body = new Blob(['{"encoding":"base64","content":"', ...bytesToBase64Parts(view), '"}']);
      const r = expect(await call("POST", "/git/blobs", body), [201], "storing the file");
      if (!isBlobSha(r?.sha)) throw new InboxError("GitHub stored the file but returned no address for it.", 502);
      return r.sha;
    },

    /**
     * One commit on the inbox branch: `mutate` receives the log AS IT STANDS and
     * returns the next one (or throws `InboxRefusal`); `add` and `remove` are the
     * tree changes that go with it. Refused because somebody else committed
     * first, it re-reads and re-applies — so two uploads at once both land.
     */
    async commit({ message, mutate, add = [], remove = [] }) {
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const s = await read();
        const next = mutate(s.log);
        const entries = [
          ...add.map((a) => ({ path: a.path, mode: "100644", type: "blob", sha: a.sha })),
          ...(s.tree ? remove.map((p) => ({ path: p, mode: "100644", type: "blob", sha: null })) : []),
          { path: LOG, mode: "100644", type: "blob", content: serializeLog(next) },
        ];
        const tree = expect(await call("POST", "/git/trees", { ...(s.tree ? { base_tree: s.tree } : {}), tree: entries }), [201], "saving the upload");
        const commit = expect(await call("POST", "/git/commits", {
          message: `${message} [skip ci]`, tree: tree.sha, parents: s.head ? [s.head] : [],
        }), [201], "saving the upload");
        const ref = s.head
          ? await call("PATCH", `/git/refs/heads/${enc(branch)}`, { sha: commit.sha, force: false })
          : await call("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: commit.sha });
        if (ref.status === 200 || ref.status === 201) return { log: next, commit: commit.sha };
        // 422: the branch moved (or was created) under us — read theirs and lay ours over it.
        if (ref.status !== 422 && ref.status !== 409) throw new InboxError(`GitHub answered HTTP ${ref.status} saving the upload.`, ref.status);
      }
      throw new InboxError("The inbox changed under every attempt to save; nothing was lost, try again.", 409);
    },

    /**
     * Start the intake run now. The workflow also runs on a schedule, so a
     * dispatch GitHub refuses delays an upload — it never loses one.
     */
    async dispatch(payload = {}) {
      const r = await call("POST", "/dispatches", { event_type: INBOX_DEFAULTS.event, client_payload: payload });
      return r.status === 204 || r.status === 200;
    },
  };
}
