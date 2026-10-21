// THE DASHBOARD'S SHARED STORE, KEPT IN THE GITHUB REPOSITORY.
//
//   *"We will not store in Cloudflare. Instead, we should try to store it in
//    GitHub."* — the family, 21 Oct 2026 (Stage 10ex).
//
// What the family types on the dashboard — a capital call, a fund's strategy, a
// company's description, a tile layout — has to be saved once and seen by
// everyone who opens the site. It is kept as ONE JSON file in this repository,
// on a branch of its own:
//
//   branch  dashboard-store            (GLOW_GITHUB_BRANCH)
//   file    store/dashboard-store.json (GLOW_GITHUB_PATH)
//   repo    techmuns/GlowVentures      (GLOW_GITHUB_REPO)
//
// Every save is a commit, so the repository's history is the record of who
// changed what and when. The branch holds nothing but the file — it is created
// with no parent the first time a save lands — so a save never touches `main`,
// never races the bots that push there, and its commit message carries
// `[skip ci]`, so neither CI nor the site's build runs for it. The server reads
// the file back through GitHub's API on every request, so a save is visible to
// everyone at once, with no rebuild.
//
// The Pages Functions write with `GLOW_GITHUB_TOKEN` — a fine-grained GitHub
// token with Contents read and write on this one repository, set as a secret in
// the site's environment. The token is the only thing the site holds; the data
// is GitHub's.
//
// ── THE SHAPE: THE KEY–VALUE CALLS THE FUNCTIONS ALREADY MAKE ─────────────────
//
// `list` / `get` / `put` / `delete` keep the meaning the functions were written
// against (a key, a JSON value, optional metadata that rides on `list`), plus
// `flush()`: the request's changes are held in memory and committed TOGETHER,
// once, so a legal-name row saving to four fund lines is one commit, not four.
//
// ── TWO PEOPLE SAVING AT ONCE ───────────────────────────────────────────────
//
// GitHub refuses a write whose file `sha` is no longer the newest (409 / 422).
// The store then re-reads the file, re-applies ITS OWN changes on top of what the
// other person saved, and tries again — so neither save is lost. Two edits to
// the SAME key end last-write-wins, which is the honest outcome for one cell two
// people changed.

export const STORE_DEFAULTS = Object.freeze({
  repo: "techmuns/GlowVentures",
  branch: "dashboard-store",
  path: "store/dashboard-store.json",
});
const API = "https://api.github.com";
const ATTEMPTS = 4;

/** UTF-8 text ↔ base64, in a runtime that has `btoa`/`atob` and no Buffer. */
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromBase64(b64) {
  const bin = atob(String(b64 ?? "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** The file's text for a set of records — keys sorted, so a commit's diff is the change and nothing else. */
export function serialize(records) {
  const sorted = Object.fromEntries(Object.keys(records).sort().map((k) => [k, records[k]]));
  return JSON.stringify({ version: 1, records: sorted }, null, 1) + "\n";
}
function parse(text) {
  const j = JSON.parse(text);
  if (!j || typeof j !== "object" || typeof j.records !== "object" || j.records == null) throw new Error("The store file is not a dashboard store.");
  return { ...j.records };
}

/** A store failure with the cause GitHub gave, so a function can say what went wrong. */
export class StoreError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/**
 * The store for a request, or null where the site has no token to write with —
 * which every function answers as 503 NOT_CONFIGURED. `env.DASHBOARD_STORE` is
 * an already-built store a TEST hands in (an in-memory one); the site sets none.
 */
export function storeFor(env, fetchImpl) {
  if (env?.DASHBOARD_STORE) return env.DASHBOARD_STORE;
  const token = String(env?.GLOW_GITHUB_TOKEN ?? "").trim();
  if (!token) return null;
  return githubStore({
    token,
    repo: env.GLOW_GITHUB_REPO || STORE_DEFAULTS.repo,
    branch: env.GLOW_GITHUB_BRANCH || STORE_DEFAULTS.branch,
    path: env.GLOW_GITHUB_PATH || STORE_DEFAULTS.path,
  }, fetchImpl);
}

export function githubStore({ token, repo, branch, path }, fetchImpl = (...a) => fetch(...a)) {
  const call = async (method, url, body) => {
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
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: r.status, json };
  };
  const enc = (s) => s.split("/").map(encodeURIComponent).join("/");

  /** The file as it stands on the branch: its records and its sha, or none at all. */
  async function read() {
    const r = await call("GET", `/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`);
    if (r.status === 404) return { records: {}, sha: null, branchMissing: !(await branchExists()) };
    if (r.status !== 200 || !r.json) throw new StoreError(`GitHub answered HTTP ${r.status} reading the store.`, r.status);
    let content = r.json.content;
    // Past 1 MB the contents API leaves `content` empty; the blob has it.
    if (!content && r.json.sha) {
      const b = await call("GET", `/git/blobs/${r.json.sha}`);
      if (b.status !== 200) throw new StoreError(`GitHub answered HTTP ${b.status} reading the store.`, b.status);
      content = b.json?.content;
    }
    return { records: parse(fromBase64(content ?? "")), sha: r.json.sha, branchMissing: false };
  }
  async function branchExists() {
    const r = await call("GET", `/git/ref/heads/${enc(branch)}`);
    return r.status === 200;
  }

  /**
   * THE FIRST SAVE MAKES THE BRANCH: one commit with no parent holding only the
   * store file, so the branch never carries a copy of the site.
   */
  async function createBranch(text, message) {
    const blob = await call("POST", "/git/blobs", { content: toBase64(text), encoding: "base64" });
    if (blob.status !== 201) throw new StoreError(`GitHub answered HTTP ${blob.status} creating the store.`, blob.status);
    const tree = await call("POST", "/git/trees", { tree: [{ path, mode: "100644", type: "blob", sha: blob.json.sha }] });
    if (tree.status !== 201) throw new StoreError(`GitHub answered HTTP ${tree.status} creating the store.`, tree.status);
    const commit = await call("POST", "/git/commits", { message, tree: tree.json.sha, parents: [] });
    if (commit.status !== 201) throw new StoreError(`GitHub answered HTTP ${commit.status} creating the store.`, commit.status);
    const ref = await call("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: commit.json.sha });
    // 422: somebody else created it a moment ago — the caller re-reads and retries.
    if (ref.status === 422) return false;
    if (ref.status !== 201) throw new StoreError(`GitHub answered HTTP ${ref.status} creating the store.`, ref.status);
    return true;
  }

  let state = null;
  const ops = [];
  const load = async () => (state ??= await read());
  const apply = (records, op) => {
    if (op.kind === "put") records[op.key] = { value: op.value, metadata: op.metadata ?? null };
    else delete records[op.key];
  };

  return {
    async list({ prefix }) {
      const { records } = await load();
      const keys = Object.keys(records).filter((k) => k.startsWith(prefix)).sort()
        .map((name) => ({ name, metadata: records[name].metadata ?? undefined }));
      return { keys, list_complete: true };
    },
    async get(key) {
      const { records } = await load();
      const v = records[key];
      if (!v) return null;
      try { return JSON.parse(v.value); } catch { return null; }
    },
    async put(key, value, opts) {
      const s = await load();
      const op = { kind: "put", key, value: String(value), metadata: opts?.metadata };
      ops.push(op); apply(s.records, op);
    },
    async delete(key) {
      const s = await load();
      const op = { kind: "delete", key };
      ops.push(op); apply(s.records, op);
    },
    /** Commit this request's changes as one commit. A no-op when nothing changed. */
    async flush() {
      if (!ops.length) return;
      const keys = [...new Set(ops.map((o) => o.key))];
      const message = `Dashboard: ${keys.length === 1 ? keys[0] : `${keys.length} entries (${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""})`} [skip ci]`;
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const s = await load();
        const text = serialize(s.records);
        if (s.branchMissing) {
          if (await createBranch(text, message)) { ops.length = 0; state = null; return; }
        } else {
          const r = await call("PUT", `/contents/${enc(path)}`, {
            message, content: toBase64(text), branch, ...(s.sha ? { sha: s.sha } : {}),
          });
          if (r.status === 200 || r.status === 201) { s.sha = r.json?.content?.sha ?? null; ops.length = 0; return; }
          if (r.status !== 409 && r.status !== 422) throw new StoreError(`GitHub answered HTTP ${r.status} saving to the store.`, r.status);
        }
        // SOMEBODY ELSE SAVED FIRST: read theirs, lay ours over it, try again.
        state = await read();
        for (const op of ops) apply(state.records, op);
      }
      throw new StoreError("The store changed under every attempt to save; nothing was lost, try again.", 409);
    },
  };
}
