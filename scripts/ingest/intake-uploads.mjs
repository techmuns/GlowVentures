#!/usr/bin/env node
// THE STATEMENT INTAKE — statements uploaded on the dashboard, read into the book.
//
//   node scripts/ingest/intake-uploads.mjs              the workflow's run (CI only)
//   node scripts/ingest/intake-uploads.mjs --check      how many files are waiting; touches nothing
//   node scripts/ingest/intake-uploads.mjs --dry-run --allow-reset
//                                                       a local rehearsal: everything but the pushes
//
// *"After uploading the file/folder it will automatically be saved in github
//  and all the data will be processed to be wired into the dashboard end to end
//  without any errors, and also the file will automatically be arranged in its
//  correct respective folder in statement library."* — the family, 21 Oct 2026.
//
// The Statement Library's upload (`functions/api/statement-uploads.js`) leaves
// every file on the repository's `statement-inbox` branch with status `queued`
// (`shared/statementInbox.mjs`) and starts `.github/workflows/statement-intake.yml`,
// which runs this. For the files waiting there it:
//
//   1. CLAIMS them (`processing`), so the page shows they are being read.
//   2. Drops any that are BYTE-IDENTICAL to a statement already in `source/` —
//      a ZIP whose every statement is already here included (`duplicate`). The
//      pipeline would read each md5 once anyway; a copy is only noise.
//   3. FILES each new one under `source/uploads-<date IST>/<provider>/`, the
//      provider being what the classifier reads off the statement itself
//      (letterhead first — never a name it merely mentions). That is the
//      Statement Library's folder for it.
//   4. Runs the pipeline exactly as a hand-dropped delivery takes it:
//      inventory → extract → build-symbols → build-book, then
//      coverage:source and check:reads.
//   5. HOLDS BACK, with the gate's own words, any file the pipeline did not read
//      in full or did not carry into the book — a layout no reader knows, a
//      sealed PDF with no password, an account with no precedence block — and
//      reads the rest again without it. Nothing is landed on a guess and no
//      exception list is widened: a held file waits in the inbox for its
//      reader, and the page's Retry sends it round again.
//   6. Runs the required publication, identity/source-row and financial gates.
//      A failing baseline never grants a new upload permission to bypass CI.
//   7. Publishes the complete data tree on codex and opens a PR. Later runs
//      verify its data-only diff and exact head's checks, merge automatically,
//      and confirm the existing Pages deployment contains the document versions.
//      A moved base requires a fresh candidate, never a forced stale publish.
//   8. Writes each file's outcome back to the inbox log (`landed` with its
//      folders and documents, `duplicate`, or `held` with the reason) and
//      clears bytes only after verifying their deployment, or proving a duplicate.
//
// The workflow's concurrency group runs one intake at a time, so a file still
// `processing` when a run starts belongs to a run that died, and is read again.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listEntries, readEntry, isMacMetadata } from "./lib/unzip.mjs";
import { checkStatementBytes } from "../../shared/statementBytes.mjs";
import { verify as verifyPublication, readArchive, readBaseline } from "./verify-publication.mjs";
import { digest, documentRevision, archiveRevision } from "./lib/publication.mjs";
import { monitorPublication, neverArrivedNote, withNotice } from "./lib/intakePublication.mjs";
import {
  INBOX_DEFAULTS, STATEMENT_EXT, extOf, emptyLog, parseLog, serializeLog, applyUpdates, inboxPath,
} from "../../shared/statementInbox.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const abs = (r) => path.join(ROOT, ...r.split("/"));

const BRANCH = process.env.GLOW_INBOX_BRANCH || INBOX_DEFAULTS.branch;
const REMOTE = process.env.GLOW_INTAKE_REMOTE || "origin";
const MAIN = process.env.GLOW_INTAKE_MAIN || "main";
const CHECK = process.argv.includes("--check");
const DRY = process.argv.includes("--dry-run");
const RUN = process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;

const CACHE = path.join(ROOT, ".cache");
const INBOX_DIR = path.join(CACHE, "statement-inbox");
const WORK = path.join(CACHE, "intake");
/** Everything a landing may change — and nothing else. Regenerated, never text-merged. */
const GENERATED = ["source", "docs", "public/audit", "src/data", "CLAUDE.md"];
const BOT = ["-c", "user.name=glow-intake[bot]", "-c", "user.email=glow-intake[bot]@users.noreply.github.com"];
/** Tries at landing on a `main` that keeps moving; each starts from the new tip. */
const ATTEMPTS = 3;
/** Read → hold back what failed → read again; one round per kind of failure is plenty. */
const ROUNDS = 4;

const say = (...a) => console.log(...a);
const clip = (s, n = 600) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const md5 = (buf) => crypto.createHash("md5").update(buf).digest("hex");
const keyOf = (i) => `${i.batch}\u0000${i.name}`;

// ── processes ─────────────────────────────────────────────────────────────────

function git(args, { cwd = ROOT, allowFail = false } = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.join(" ")} failed: ${clip(r.stderr || r.stdout, 400)}`);
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
}

/** `npm run <script>`, its output echoed into the run's log and returned. */
function npm(script, args = [], env = {}) {
  say(`\n▶ npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`);
  const win = process.platform === "win32";
  const r = spawnSync(win ? "npm.cmd" : "npm", ["run", script, ...(args.length ? ["--", ...args] : [])], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 512 << 20, env: { ...process.env, ...env }, shell: win,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stdout.write(r.stderr);
  return { ok: r.status === 0, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

function gh(args) {
  const r = spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 << 20 });
  if (r.status !== 0) throw new Error(`GitHub publication failed: ${clip(r.stderr, 400)}`);
  return (r.stdout ?? '').trim();
}

// ── the inbox branch ──────────────────────────────────────────────────────────

// Every fetch is the branch's tip alone: the inbox's history carries the bytes
// of every statement ever uploaded, and none of it is needed to read the next.
function fetchInbox() {
  return git(["fetch", "--no-tags", "--quiet", "--depth=1", REMOTE, `+refs/heads/${BRANCH}:refs/remotes/${REMOTE}/${BRANCH}`], { allowFail: true }).ok;
}

/** A detached worktree of the inbox's tip at `.cache/statement-inbox`. */
function checkoutInbox() {
  // A directory there that is NOT a worktree would let `git -C` fall through to
  // the main checkout — so it is removed and made again, never reused.
  if (fs.existsSync(INBOX_DIR) && !fs.existsSync(path.join(INBOX_DIR, ".git"))) fs.rmSync(INBOX_DIR, { recursive: true, force: true });
  if (!fs.existsSync(INBOX_DIR)) {
    fs.mkdirSync(CACHE, { recursive: true });
    git(["worktree", "prune"]);
    git(["worktree", "add", "--detach", "--force", INBOX_DIR, `${REMOTE}/${BRANCH}`]);
  } else {
    git(["checkout", "--detach", "--force", "--quiet", `${REMOTE}/${BRANCH}`], { cwd: INBOX_DIR });
    git(["clean", "-fdq"], { cwd: INBOX_DIR });
  }
}

function readLog() {
  const f = path.join(INBOX_DIR, INBOX_DEFAULTS.log);
  return fs.existsSync(f) ? parseLog(fs.readFileSync(f, "utf8")) : emptyLog();
}

/**
 * One commit on the inbox, laid over the inbox AS IT STANDS — the dashboard may
 * have filed a new upload since this run read it. `change(log)` returns the
 * updates and the paths to clear; refused because the branch moved, it reads
 * the new tip and lays them over again.
 */
function commitInbox(message, change) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!fetchInbox()) throw new Error(`the ${BRANCH} branch is gone`);
    checkoutInbox();
    const log = readLog();
    const { updates, remove = [] } = change(log);
    fs.writeFileSync(path.join(INBOX_DIR, INBOX_DEFAULTS.log), serializeLog(applyUpdates(log, updates)));
    for (const p of remove) fs.rmSync(path.join(INBOX_DIR, ...p.split("/")), { force: true });
    git(["add", "-A"], { cwd: INBOX_DIR });
    if (git(["diff", "--cached", "--quiet"], { cwd: INBOX_DIR, allowFail: true }).ok) return;
    git([...BOT, "commit", "-q", "-m", `${message} [skip ci]`], { cwd: INBOX_DIR });
    if (DRY) { say(`(dry run) inbox not pushed: ${message}`); return; }
    if (git(["push", "--quiet", REMOTE, `HEAD:refs/heads/${BRANCH}`], { cwd: INBOX_DIR, allowFail: true }).ok) return;
    say("The inbox moved while saving; reading it again.");
  }
  throw new Error("the inbox changed under every attempt to save this run's results");
}

/** Files to read this run: queued ones, and any a dead run left `processing`. */
const waitingFiles = (log) => [...log.batches].sort((a, b) => a.id.localeCompare(b.id))
  .flatMap((b) => b.files.filter((f) => f.status === "queued" || f.status === "processing" || (f.status === "held" && f.pullRequest)).map((f) => ({ batch: b.id, file: f })));

// ── main, and what is already in source/ ─────────────────────────────────────

function resetToMain() {
  git(["fetch", "--no-tags", "--quiet", "--depth=1", REMOTE, `+refs/heads/${MAIN}:refs/remotes/${REMOTE}/${MAIN}`]);
  // The worker checkout is isolated. Never commit, push or reset the main ref.
  git(["switch", "--create", `codex/statement-intake-${process.env.GITHUB_RUN_ID ?? Date.now()}-${crypto.randomBytes(4).toString('hex')}`, `${REMOTE}/${MAIN}`]);
  git(["clean", "-fdq", "--", ...GENERATED]);
  // Every archive is expanded afresh by `inventory`; an expansion of a file a
  // previous round held back must not linger to be read.
  fs.rmSync(path.join(ROOT, "source", "_extracted"), { recursive: true, force: true });
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "_extracted") yield* walk(full); }
    else if (e.isFile() && e.name.toLowerCase() !== "readme.md") yield full;
  }
}

/** A ZIP's statements, each with its md5 — macOS furniture and folders skipped, nested ZIPs opened. */
function zipMembers(buf, depth = 0) {
  const out = [];
  for (const e of listEntries(buf)) {
    if (e.name.endsWith("/") || isMacMetadata(e.name)) continue;
    const data = readEntry(buf, e);
    out.push({ name: e.name, data, hash: md5(data) });
    if (/\.zip$/i.test(e.name) && depth < 3) {
      try { out.push(...zipMembers(data, depth + 1).map((m) => ({ ...m, name: `${e.name}/${m.name}` }))); } catch { /* judged by extract */ }
    }
  }
  return out;
}

/** md5 → where it already is, for every statement in `source/`, inside ZIPs too. */
function knownHashes() {
  const known = new Map();
  for (const full of walk(path.join(ROOT, "source"))) {
    const buf = fs.readFileSync(full);
    const at = rel(full);
    if (!known.has(md5(buf))) known.set(md5(buf), at);
    if (/\.zip$/i.test(full)) {
      try { for (const m of zipMembers(buf)) if (!known.has(m.hash)) known.set(m.hash, `${at} → ${m.name}`); } catch { /* an unreadable archive is extract's to report */ }
    }
  }
  return known;
}

// ── one upload: duplicate, or where it goes ───────────────────────────────────

const held = (hold, reason) => ({
  status: "held", hold, reason: clip(reason), landedAs: null, providers: null, docKeys: null, commit: null,
});

function dedupe(item, known) {
  const ext = extOf(item.name);
  if (!STATEMENT_EXT.includes(ext)) return { result: held("unreadable", "Not a statement file — only PDF, Excel (xlsx/xls) or a ZIP of them is read.") };
  const buf = fs.readFileSync(item.file);
  // The bytes, not the name — the upload refuses these too; this is the second door.
  const what = checkStatementBytes(buf, item.name);
  if (!what.ok) return { result: held("not-a-statement", what.why) };
  const h = md5(buf);
  if (known.has(h)) return { duplicate: known.get(h) };
  if (ext !== "zip") return { hashes: [h] };
  let members;
  try { members = zipMembers(buf); } catch (e) { return { result: held("unreadable", `The ZIP could not be opened: ${e.message}.`) }; }
  if (!members.length) return { result: held("unreadable", "The ZIP holds no files.") };
  if (members.every((m) => known.has(m.hash))) {
    return { duplicate: `${known.get(members[0].hash)}${members.length > 1 ? `, and every other statement in it` : ""}` };
  }
  return { hashes: [h, ...members.map((m) => m.hash)] };
}

const READABLE = /\.(pdf|xls|xlsx)$/i;
const looksLikeProse = (text) => (String(text ?? "").match(/[A-Za-z]{4,}/g) ?? []).length >= 20;

/**
 * The readers, loaded when there is something to read: `--check` runs before
 * `npm ci`, and the workbook reader needs a dependency.
 */
let readers = null;
async function loadReaders() {
  readers ??= {
    ...(await import("./lib/pdf.mjs")), ...(await import("./lib/layout.mjs")),
    ...(await import("./lib/sheet.mjs")), ...(await import("./lib/classify.mjs")),
  };
  return readers;
}

/** The words on one statement, read the way `inventory` reads them for the classifier. */
async function leafText(name, data) {
  const { readSpreadsheet, readPdf, classify, extractLayout, passwordsFromEnv } = await loadReaders();
  if (/\.(xls|xlsx)$/i.test(name)) {
    const wb = readSpreadsheet(data);
    return wb.sheets.map((sh) => sh.rows.map((r) => r.join(" ")).join("\n")).join("\n");
  }
  const fileName = path.basename(name);
  let { text, encrypted } = readPdf(Buffer.from(data));
  if (encrypted || !looksLikeProse(text) || !classify({ fileName, text }).provider) {
    const grid = await extractLayout(new Uint8Array(data), { passwords: passwordsFromEnv() });
    if (!grid.error) text = grid.pages.map((p) => p.text).join(" ").replace(/\s+/g, " ");
  }
  return text ?? "";
}

/** The provider the statements in an upload are FROM — the most of them agree, or none. */
async function providerOf(item) {
  const { classify } = await loadReaders();
  const buf = fs.readFileSync(item.file);
  const leaves = /\.zip$/i.test(item.name)
    ? zipMembers(buf).filter((m) => READABLE.test(m.name))
    : [{ name: item.name, data: buf }];
  const votes = new Map();
  for (const leaf of leaves) {
    let provider = null;
    try { provider = classify({ fileName: path.basename(leaf.name), text: await leafText(leaf.name, leaf.data) }).provider; } catch { /* unread here; extract will say why */ }
    if (provider) votes.set(provider, (votes.get(provider) ?? 0) + 1);
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** A provider's name as a folder: nothing a file system refuses. */
const folderName = (provider) => String(provider ?? "")
  .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 100) || null;

/** Today in India — the family's calendar, and the day the delivery folder is named for. */
const deliveryDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Write an upload into source/ and say which paths are its own. */
async function place(item, delivery) {
  const provider = await providerOf(item);
  const folder = folderName(provider);
  const dir = folder ? `${delivery}/${folder}` : delivery;
  const base = path.basename(item.name);
  let landing = `${dir}/${base}`;
  for (let n = 2; fs.existsSync(abs(landing)); n++) landing = `${dir}/${base.replace(/(\.[^.]+)?$/, (ext) => ` (${n})${ext || ""}`)}`;
  fs.mkdirSync(path.dirname(abs(landing)), { recursive: true });
  fs.copyFileSync(item.file, abs(landing));
  // `inventory` expands a ZIP to source/_extracted/<its own path, less .zip>/.
  const prefix = /\.zip$/i.test(landing)
    ? `source/_extracted/${landing.replace(/^source\//, "").replace(/\.[^./]+$/, "")}/`
    : null;
  say(`  ${item.name} → ${landing}${provider ? "" : "  (no issuer read off it — filed at the delivery's top)"}`);
  return { item, landing, prefix, mine: (f) => f === landing || (!!prefix && String(f).startsWith(prefix)) };
}

function unplace(p) {
  fs.rmSync(abs(p.landing), { force: true });
  if (p.prefix) fs.rmSync(abs(p.prefix), { recursive: true, force: true });
  for (let d = path.dirname(abs(p.landing)); d.startsWith(path.join(ROOT, "source", "uploads-")); d = path.dirname(d)) {
    try { fs.rmdirSync(d); } catch { break; }
  }
}

// ── reading, and judging what was read ────────────────────────────────────────

/** check:reads' findings as data — or null when it could not run at all. */
function readsProblems() {
  fs.mkdirSync(WORK, { recursive: true });
  const out = path.join(WORK, `check-reads-${Date.now()}.json`);
  npm("check:reads", [], { GLOW_CHECK_READS_JSON: out });
  return fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")).problems : null;
}

/**
 * NSE symbols are reference data fetched from the exchange, which may refuse a
 * cloud runner. A run that reached it can only ADD this book's new securities;
 * one that would drop or change a symbol the book already prices is put back.
 */
function refreshSymbols() {
  const file = abs("src/data/nseSymbols.json");
  const before = JSON.parse(fs.readFileSync(file, "utf8"));
  const r = npm("build-symbols");
  let after = null;
  try { after = JSON.parse(fs.readFileSync(file, "utf8")); } catch { after = null; }
  const kept = r.ok && after && Object.entries(before).every(([k, v]) => JSON.stringify(after[k]) === JSON.stringify(v));
  if (!kept) {
    say("  NSE symbols: kept as committed (the exchange's master did not come back whole).");
    git(["checkout", "--", "src/data/nseSymbols.json", "docs/SECURITY-IDENTIFIERS.md"], { allowFail: true });
  }
}

/** inventory → extract → build-symbols → build-book. A step that crashes names itself. */
function readEverything() {
  if (!npm("inventory").ok) return "`npm run inventory` failed";
  // `new`: a scan nobody has read yet is read by OCR (`lib/scan.mjs`), every
  // figure checked by the page; every statement already archived — a scan
  // included — reads back byte for byte, so the only change is what was uploaded.
  if (!npm("extract", [], { GLOW_OCR: "new" }).ok) return "`npm run extract` failed";
  refreshSymbols();
  if (!npm("build-book").ok) return "`npm run build-book` failed";
  return null;
}

const SEALED = /password|encrypt|sealed/i;

/** Each placed upload's verdict, from the archive, coverage:source and check:reads. */
function judge(live, baseline) {
  const manifest = JSON.parse(fs.readFileSync(abs("public/audit/manifest.json"), "utf8"));
  const publication = verifyPublication({ baseRef: `${REMOTE}/${MAIN}` });
  if (!['verified', 'unchanged'].includes(publication.decision)) return {
    all: `Publication held (${publication.decision}): ${publication.issues.map(i => `${i.code}: ${i.reason}`).slice(0, 3).join(' · ') || 'Repeated normalized documents must not add rows.'}`,
  };
  const cov = npm("coverage:source");
  const lines = cov.out.split(/\r?\n/);
  const at = lines.findIndex((l) => /FILE\(S\) UNREAD:/.test(l));
  const unread = at < 0 ? [] : lines.slice(at + 1).map((l) => l.trim()).filter((l) => l.startsWith("source/"));
  const problems = readsProblems();
  if (!problems) return { all: "`npm run check:reads` could not run on the new archive" };
  const fresh = problems.filter((p) => !baseline.has(`${p.kind}|${p.file}`));

  const verdicts = new Map();
  for (const p of live) {
    const entries = manifest.filter((e) => p.mine(e.sourcePath));
    const probs = fresh.filter((x) => p.mine(x.file));
    const gaps = unread.filter((f) => p.mine(f));
    const sealed = entries.filter((e) => e.status === "encrypted").length || probs.some((x) => SEALED.test(x.what));
    let v;
    if (sealed) {
      v = held("needs-password", "Sealed with a password the intake run does not hold. Add the statement passwords to the repository's "
        + "Actions secrets as GLOW_PDF_PASSWORDS (Settings → Secrets and variables → Actions), then Retry.");
    } else if (probs.length) {
      v = held("needs-reader", `${probs[0].what} — ${probs[0].fix}${probs.length > 1 ? ` (and ${probs.length - 1} more finding(s) in the run log)` : ""}`);
    } else if (gaps.length) {
      v = held("needs-reader", `${gaps.length} file(s) in it could not be read: ${gaps.map((f) => path.basename(f)).slice(0, 4).join(", ")}. `
        + "A reader for this layout is needed in scripts/ingest/providers/.");
    } else if (!entries.length) {
      v = held("unreadable", "Nothing in it could be read into the archive.");
    } else if (entries.every((e) => e.failedBecause === "attachment-removed")) {
      v = held("not-a-statement", `Every file in it is a mail server's removal notice, not a statement (${entries.map((e) => path.basename(e.sourcePath)).join(", ")}): `
        + "the statements never arrived. Ask the sender to re-send them another way (a download link, or zipped).");
    } else {
      // A ZIP of good statements lands even if a mail server stripped one of
      // them — and says which never arrived, so somebody asks for it.
      const read = entries.filter((e) => e.status !== "failed");
      const missing = entries.filter((e) => e.failedBecause === "attachment-removed").map((e) => path.basename(e.sourcePath));
      v = {
        status: "landed", hold: null,
        neverArrived: missing.length ? missing : null,
        reason: neverArrivedNote(missing),
        providers: [...new Set(read.map((e) => e.provider || "(unidentified)"))].sort(),
        docKeys: [...new Set(read.map((e) => e.docKey))].sort(),
      };
    }
    verdicts.set(p, v);
  }
  const strays = fresh.filter((x) => !live.some((p) => p.mine(x.file)));
  return {
    verdicts,
    all: strays.length ? `check:reads found a problem these statements caused elsewhere — ${strays[0].what}` : null,
  };
}

/** Put back every generated file, keeping the uploads still placed in source/. */
function restoreGenerated() {
  git(["checkout", "--", "docs", "public/audit", "src/data", "CLAUDE.md"]);
  git(["clean", "-fdq", "--", "docs", "public/audit", "src/data"]);
}

/** Run `fn` on main as it stands without this run's changes, and put them back. */
function atBaseline(fn) {
  const top = () => git(["rev-parse", "-q", "--verify", "refs/stash"], { allowFail: true }).out;
  const before = top();
  git(["stash", "push", "--include-untracked", "--quiet", "--", ...GENERATED]);
  const stashed = top() !== before;
  try { return fn(); } finally {
    git(["checkout", "--", ...GENERATED]);
    git(["clean", "-fdq", "--", ...GENERATED]);
    if (stashed) git(["stash", "pop", "--quiet"]);
  }
}

/**
 * The gates CI runs on every PR. `blocked` names the one that fails because of
 * these statements; `already` the ones that fail on main without them too.
 */
function gates() {
  const steps = [["accounts-table", ["--write"]], ["statements:verify-book", []], ["test:statements", []], ["build", []], ["test:ingest", []], ["test:family", []]];
  const already = [];
  for (const [script, args] of steps) {
    if (npm(script, args).ok) continue;
    if (!atBaseline(() => npm(script, args).ok)) {
      say(`  \`npm run ${script}\` fails on ${MAIN} without these statements too — not theirs to answer for.`);
      already.push(script);
      return { blocked: `Required gate \`npm run ${script}\` is failing on ${MAIN}; publication waits for a green verified base.`, already };
    }
    return { blocked: `\`npm run ${script}\` fails with these statements and passes without them. The run log names the failing check${RUN ? `: ${RUN}` : "."}`, already };
  }
  return { blocked: null, already };
}

/** One atomic data commit on codex, followed by a PR. Never push data to main. */
function land(live, verdicts, already) {
  const assessment = verifyPublication({ baseRef: `${REMOTE}/${MAIN}` });
  if (assessment.decision !== 'verified') throw new Error('Publication changed after validation.');
  const documents = readArchive(abs('public/audit'));
  const versions = assessment.changed.map(key => {
    const d = documents.find(d => d.docKey === key);
    return { document: key, revision: documentRevision(d), sourcePath: d.sourcePath, sha256: digest(fs.readFileSync(abs(d.sourcePath))) };
  });
  const receipt = { schemaVersion: 1, baseCommit: assessment.baseCommit, archiveRevision: assessment.candidateRevision,
    files: live.map(p => ({ path: p.landing, sha256: digest(fs.readFileSync(abs(p.landing))) })), documents: versions };
  const id = digest(receipt);
  fs.mkdirSync(abs('public/audit/deliveries'), { recursive: true });
  fs.writeFileSync(abs(`public/audit/deliveries/${id}.json`), JSON.stringify({ ...receipt, id }) + '\n');
  git(["add", "-A", "--", ...GENERATED]);
  const list = live.map((p) => `- ${p.landing}${verdicts.get(p)?.providers?.length ? ` → ${verdicts.get(p).providers.join(", ")}` : ""}`);
  const passed = ["accounts-table", "build", "test:ingest", "test:family"].filter((s) => !already.includes(s));
  const message = [
    `Statement intake: ${live.length} statement file${live.length === 1 ? "" : "s"} uploaded on the dashboard`,
    "",
    ...list,
    "",
    "Read in full by the statement intake: inventory, extract, build-book, coverage:source",
    `and check:reads pass with them${passed.length ? `, and so do ${passed.join(", ")}` : ""}.`,
    ...(already.length ? [`${already.join(", ")} already fail${already.length === 1 ? "s" : ""} on ${MAIN} without them.`] : []),
    ...(RUN ? ["", `Run: ${RUN}`] : []),
  ].join("\n");
  git([...BOT, "commit", "-q", "-m", message]);
  let sha = git(["rev-parse", "HEAD"]).out;
  if (DRY) { say(`(dry run) verified codex commit not pushed: ${sha}`); return { status: 'processing', commit: sha, reason: 'Local rehearsal; no PR or production change.' }; }
  const branch = `codex/statement-delivery-${id.slice(0, 16)}`;
  const existingRef = git(['ls-remote', '--heads', REMOTE, `refs/heads/${branch}`]).out.split(/\s/)[0];
  if (existingRef) {
    git(['fetch', '--no-tags', '--quiet', REMOTE, existingRef]);
    const prior = readBaseline(existingRef);
    if (archiveRevision(prior.documents) !== assessment.candidateRevision
      || git(['show', `${existingRef}:src/data/glowData.ts`]).out !== fs.readFileSync(abs('src/data/glowData.ts'), 'utf8').trim()) throw new Error('An existing delivery branch contains different canonical data; review it before retrying.');
    sha = existingRef;
  } else if (!git(['push', '--quiet', REMOTE, `HEAD:refs/heads/${branch}`], { allowFail: true }).ok) return null;
  const body = path.join(WORK, 'publication-pr.md');
  fs.writeFileSync(body, `${message}\n\nOwner/account/security, changed-format field coverage and reconciliation publication checks passed. Exact source records and upload checksums are retained. A verified data-only diff with passing CI publishes automatically; missing, unclear or conflicting records stay held. Repository protections and unresolved review findings still apply.\n\nArchive revision: ${assessment.candidateRevision}\n`);
  const metadata = { status: 'processing', hold: null, reason: 'Your statement is verified and waiting to appear on the dashboard.', commit: sha, branch,
    pullRequest: null, baseCommit: assessment.baseCommit, archiveRevision: assessment.candidateRevision, ciDispatched: false,
    documentVersions: versions.map(({ document, revision }) => ({ document, revision })) };
  // Persist the handoff before PR creation/dispatch: a worker dying between
  // network calls resumes this branch rather than creating another delivery.
  commitInbox('Intake: verified publication branch prepared', () => ({ updates: live.map(p => ({ batch: p.item.batch, name: p.item.name,
    ...verdicts.get(p), landedAs: [p.landing], ...metadata, reason: withNotice(metadata.reason, verdicts.get(p)) })) }));
  const existingPR = JSON.parse(gh(['pr', 'list', '--head', branch, '--state', 'all', '--json', 'url']));
  let url;
  try { url = existingPR[0]?.url ?? gh(['pr', 'create', '--base', MAIN, '--head', branch, '--title', `Publish ${live.length} verified statement upload(s)`, '--body-file', body]); }
  catch (error) { return { ...metadata, publicationDetail: `PR creation will resume from the saved branch: ${clip(error.message)}` }; }
  // GITHUB_TOKEN may leave PR-triggered CI waiting for approval. Explicit CI
  // dispatch is a documented GitHub exception and runs against this codex ref.
  let ciDispatched = false;
  try { gh(['workflow', 'run', 'ci.yml', '--ref', branch, '-f', `baseline=${assessment.baseCommit}`]); ciDispatched = true; }
  catch { /* preserve PR metadata; the next monitor retries dispatch */ }
  return { ...metadata, ciDispatched, publicationDetail: `Awaiting required checks for automatic publication: ${url}`, pullRequest: url };
}

// ── the run ───────────────────────────────────────────────────────────────────

async function intake(items) {
  const results = new Map();
  for (const i of items) if (!i.file) results.set(keyOf(i), held("intake-error", "The uploaded bytes are not on the inbox branch; upload the file again."));
  let pending = items.filter((i) => i.file);

  for (let attempt = 1; attempt <= ATTEMPTS && pending.length; attempt++) {
    say(`\n══ attempt ${attempt}: ${pending.length} file(s) against ${MAIN} ══`);
    resetToMain();
    const base = readsProblems();
    if (!base) throw new Error(`check:reads could not run on ${MAIN}`);
    const baseline = new Set(base.map((p) => `${p.kind}|${p.file}`));

    const known = knownHashes();
    const toPlace = [];
    for (const i of pending) {
      const d = dedupe(i, known);
      if (d.duplicate) {
        results.set(keyOf(i), { status: "duplicate", hold: null, reason: clip(`Already in the library — byte-identical to ${d.duplicate}.`), landedAs: null, providers: null, docKeys: null, commit: null });
      } else if (d.result) {
        results.set(keyOf(i), d.result);
      } else {
        for (const h of d.hashes) if (!known.has(h)) known.set(h, `${i.name}, uploaded alongside it`);
        toPlace.push(i);
      }
    }
    if (!toPlace.length) { pending = []; break; }

    const delivery = `source/uploads-${deliveryDay()}`;
    say(`\nFiling ${toPlace.length} new statement file(s) under ${delivery}/:`);
    let live = [];
    for (const i of toPlace) live.push(await place(i, delivery));

    let verdicts = new Map();
    for (let round = 1; round <= ROUNDS && live.length; round++) {
      if (round > 1) restoreGenerated();
      const crashed = readEverything();
      const j = crashed ? { all: crashed } : judge(live, baseline);
      if (j.all) {
        for (const p of live) { results.set(keyOf(p.item), held("check-failed", j.all)); unplace(p); }
        live = [];
        break;
      }
      verdicts = j.verdicts;
      const failing = live.filter((p) => verdicts.get(p).status !== "landed");
      for (const p of failing) { results.set(keyOf(p.item), verdicts.get(p)); unplace(p); }
      live = live.filter((p) => !failing.includes(p));
      if (!failing.length) break;
      if (round === ROUNDS) {
        for (const p of live) { results.set(keyOf(p.item), held("check-failed", "The pipeline did not settle with these statements; see the run log.")); unplace(p); }
        live = [];
      }
    }
    if (!live.length) { pending = []; break; }

    const gate = gates();
    if (gate.blocked) {
      for (const p of live) results.set(keyOf(p.item), held("check-failed", gate.blocked));
      pending = [];
      break;
    }

    const publication = land(live, verdicts, gate.already);
    if (publication) {
      for (const p of live) results.set(keyOf(p.item), { ...verdicts.get(p), landedAs: [p.landing], ...publication, reason: withNotice(publication.reason, verdicts.get(p)) });
      pending = [];
      break;
    }
    say(`\n${MAIN} moved while landing; starting again from its new tip.`);
    pending = live.map((p) => p.item);
  }
  for (const i of pending) results.set(keyOf(i), held("intake-error", `${MAIN} kept moving while this run tried to land it; Retry.`));
  return results;
}

function summarize(updates) {
  const count = (s) => updates.filter((u) => u.status === s).length;
  const parts = [["landed", "landed"], ["duplicate", "already in the library"], ["held", "held"], ["processing", "awaiting publication"]]
    .filter(([s]) => count(s)).map(([s, w]) => `${count(s)} ${w}`);
  const line = parts.join(", ") || "nothing to do";
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = updates.map((u) => `| ${u.name.replace(/\|/g, "\\|")} | ${u.status}${u.hold ? ` (${u.hold})` : ""} | ${(u.providers ?? []).join(", ") || "—"} | ${clip(u.reason ?? (u.landedAs ?? []).join(", "), 300).replace(/\|/g, "\\|") || "—"} |`);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Statement intake — ${line}\n\n| File | Outcome | Library folder | Detail |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`);
  }
  return line;
}

async function main() {
  if (!CHECK && !process.env.CI && !process.argv.includes("--allow-reset")) {
    console.error("Run intake in an isolated CI checkout, or pass --allow-reset in a scratch clone. It prepares codex branches from remote main.");
    process.exit(2);
  }
  if (!fetchInbox()) {
    say("No statement-inbox branch yet — nothing has been uploaded.");
    if (CHECK && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "waiting=0\n");
    return;
  }
  checkoutInbox();
  const waiting = waitingFiles(readLog());
  if (CHECK) {
    say(`${waiting.length} file(s) waiting in the inbox.`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `waiting=${waiting.length}\n`);
    return;
  }
  if (!waiting.length) { say("Nothing is waiting in the inbox."); return; }

  // 1. Claim them, so the page shows they are being read.
  let claimed = [];
  commitInbox(`Intake: reading ${waiting.length} file(s)`, (log) => {
    claimed = waitingFiles(log);
    return { updates: claimed.map(({ batch, file }) => ({ batch, name: file.name, status: "processing", hold: null, reason: null, run: RUN })) };
  });
  if (!claimed.length) return;

  // The bytes leave the inbox before main is touched.
  fs.rmSync(WORK, { recursive: true, force: true });
  const items = claimed.map(({ batch, file }) => {
    const from = path.join(INBOX_DIR, ...inboxPath(batch, file.name).split("/"));
    if (!fs.existsSync(from)) return { batch, name: file.name, file: null };
    const to = path.join(WORK, "files", batch, ...file.name.split("/"));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    return { batch, name: file.name, file: to, publication: file.pullRequest || file.branch ? file : null };
  });

  let results;
  try {
    results = new Map();
    const pending = items.filter(i => i.publication);
    if (pending.length) git(['fetch', '--no-tags', '--quiet', REMOTE, `refs/heads/${MAIN}:refs/remotes/${REMOTE}/${MAIN}`]);
    for (const item of pending) {
      if (DRY) { results.set(keyOf(item), { ...item.publication, status: 'processing', reason: 'Local rehearsal; publication monitoring skipped.' }); continue; }
      try {
        results.set(keyOf(item), await monitorPublication(item.publication, { gh,
          currentBase: git(['rev-parse', `${REMOTE}/${MAIN}`]).out, credential: process.env.GLOW_DASHBOARD_PASSWORD,
          baseURL: process.env.GLOW_BASE_URL }));
      } catch (error) { results.set(keyOf(item), { ...item.publication, status: 'processing', hold: null,
        reason: 'Your statement is saved. Processing will continue automatically.', publicationDetail: `Publication check will retry: ${clip(error.message)}` }); }
    }
    for (const [key, result] of await intake(items.filter(i => !i.publication))) results.set(key, result);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
    results = new Map(items.map((i) => [keyOf(i), held("intake-error", `The intake run stopped before this file could land: ${e.message}`)]));
  }

  const updates = items.map((i) => ({ batch: i.batch, name: i.name, run: RUN, ...results.get(keyOf(i)) }));
  if (updates.some((u) => u.hold === "intake-error")) process.exitCode = 1;
  const line = summarize(updates);
  // 8. The outcome on the inbox; the bytes of every file now in source/ cleared.
  commitInbox(`Intake: ${line}`, () => ({
    updates,
    remove: updates.filter((u) => u.status === "landed" || u.status === "duplicate").map((u) => inboxPath(u.batch, u.name)),
  }));
  say(`\nStatement intake: ${line}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
