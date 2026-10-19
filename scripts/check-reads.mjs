#!/usr/bin/env node
/**
 * ── EVERY STATEMENT READ IN FULL, AND EVERY READ STATEMENT IN THE BOOK ────────
 *
 *   npm run check:reads
 *
 * *"in future, whatever files we upload, they are read completely and all the
 * data is integrated into the dashboard"* — the family, 19 Oct 2026.
 *
 * Stage 10ep found 96 documents that were not "read" on the Statement Library
 * and nothing anywhere had failed: a reader's warnings, a missing reader, a
 * misfiled workbook all landed quietly in the archive. This is the check that
 * makes the next one loud. It runs in CI after the archive is regenerated from
 * `source/`, and it EXITS NON-ZERO on any of:
 *
 *   1. A document that is `partial` — a read gap (lib/readStatus.mjs) is on it.
 *   2. A document that is `failed`, unless it is held out by decision or its
 *      file is in `scripts/ingest/acceptedUnread.mjs` with a reason and the
 *      action that would make it readable. An entry there whose file now reads
 *      fails too, so the list cannot outlive its reason.
 *   3. An account a read statement holds that the book neither carries nor
 *      excludes by name with a reason (build-book's "is NOT in the book" line) —
 *      a statement read and then dropped.
 *   4. An account whose date in the book is older than the newest holdings
 *      statement read for it — a new month's statement read and never used.
 *
 * Each finding names the file, what is wrong and what fixes it. Reads only the
 * committed archive and the generated book; it writes nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGaps } from "./ingest/lib/readStatus.mjs";
import { sourceFor } from "./ingest/precedence.mjs";
import { ACCEPTED_UNREAD } from "./ingest/acceptedUnread.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");
const BOOK = process.env.GLOW_BOOK_TS ?? path.join(ROOT, "src", "data", "glowData.ts");
const REPORT = process.env.GLOW_BOOK_REPORT ?? path.join(ROOT, "docs", "BOOK-REPORT.md");

const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
const docOf = (e) => JSON.parse(fs.readFileSync(path.join(AUDIT, e.docKey, "document.json"), "utf8"));
const docs = manifest.map((e) => ({ e, d: docOf(e) }));

/** `BOOK_ACCOUNTS` — a JSON array literal in the generated book. */
function bookAccounts() {
  const ts = fs.readFileSync(BOOK, "utf8");
  const at = ts.indexOf("export const BOOK_ACCOUNTS");
  if (at < 0) throw new Error(`no BOOK_ACCOUNTS in ${BOOK}`);
  // Bracket-matched over the literal (strings skipped), so an empty `[]` and a
  // multi-line array both parse — the generator writes both.
  const open = ts.indexOf("= [", at) + 2;
  let depth = 0, inStr = false, close = -1;
  for (let i = open; i < ts.length && close < 0; i++) {
    const c = ts[i];
    if (inStr) { if (c === "\\") i++; else if (c === "\"") inStr = false; continue; }
    if (c === "\"") inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if ((c === "]" || c === "}") && --depth === 0) close = i + 1;
  }
  return JSON.parse(ts.slice(open, close));
}

const problems = [];
const problem = (kind, file, what, fix) => problems.push({ kind, file, what, fix });
const brief = (w) => `${w.code}: ${String(w.detail ?? "").replace(/\s+/g, " ").slice(0, 220)}`;

// ── 1 & 2. Every document read in full ────────────────────────────────────────
const failedPaths = new Set();
for (const { e, d } of docs) {
  if (e.status === "partial") {
    problem("read gap", e.sourcePath, `${e.docKey} is PARTIAL — ${readGaps(d).map(brief).join(" · ") || "no warning names the gap"}`,
      "Teach its reader the part it misses (scripts/ingest/providers/), or — only if the warning describes the statement "
      + "itself — argue the code into STATEMENT_NOTES in scripts/ingest/lib/readStatus.mjs. Then `npm run extract`.");
  } else if (e.status === "failed") {
    failedPaths.add(e.sourcePath);
    const heldOut = d.warnings.some((w) => w.code === "held-out-by-decision");
    if (heldOut || ACCEPTED_UNREAD[e.sourcePath]) continue;
    problem("not read", e.sourcePath, `${e.docKey} FAILED — ${d.warnings.map(brief).join(" · ")}`,
      "Write or extend the reader for this layout and `npm run extract`. Only if the FILE carries nothing to read "
      + "(a scan, a removal notice), record it in scripts/ingest/acceptedUnread.mjs with the action that would fix it.");
  }
}
for (const [file, entry] of Object.entries(ACCEPTED_UNREAD)) {
  if (!failedPaths.has(file)) {
    problem("stale exception", file, `listed in acceptedUnread.mjs (${entry.reason.slice(0, 80)}…) but no failed document comes from it`,
      "It reads now, or it is gone: delete the entry.");
  }
}

// ── 3 & 4. Every read statement reaches the book ──────────────────────────────
const accounts = bookAccounts();
const report = fs.readFileSync(REPORT, "utf8");
const held = new Map();
for (const { e, d } of docs) {
  if (e.status !== "ok" || !d.accountNo || d.twinOf || d.excludedFromBook || !(d.holdings?.length)) continue;
  const k = `${d.provider}::${d.accountNo}`;
  (held.get(k) ?? held.set(k, []).get(k)).push(d);
}
for (const [k, ds] of [...held.entries()].sort()) {
  const [provider, accountNo] = k.split("::");
  const acc = accounts.find((a) => a.provider === provider && String(a.accountNo) === accountNo);
  if (!acc) {
    if (report.includes(`account ${accountNo} (${provider}) is NOT in the book`)) continue;
    problem("not in the book", ds[0].sourcePath,
      `${provider} account ${accountNo} is read (${ds.length} statement(s)) and is neither in the book nor excluded with a reason`,
      `Give ${provider} its block in scripts/ingest/precedence.mjs (a provider without one contributes nothing) and `
      + "resolve the holder in shared/owners.mjs, then `npm run build-book`.");
    continue;
  }
  const rule = sourceFor(provider, "holdings");
  const snaps = ds.filter((d) => !rule || rule.reportTypes.includes(d.reportType));
  const newest = snaps.map((d) => d.asOf).filter(Boolean).sort().at(-1);
  if (newest && acc.asOf && newest > acc.asOf) {
    const n = snaps.find((d) => d.asOf === newest);
    problem("stale in the book", n.sourcePath,
      `${acc.accountId} is dated ${acc.asOf} in the book but its ${n.reportType} of ${newest} is read`,
      "`npm run build-book` — and if it still lags, the newer statement is missing a fact precedence.mjs asks for; "
      + "the book report names which.");
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const counts = manifest.reduce((c, e) => ({ ...c, [e.status]: (c[e.status] ?? 0) + 1 }), {});
const accepted = Object.keys(ACCEPTED_UNREAD).length;
console.log(`check:reads — ${manifest.length} document(s): ${counts.ok ?? 0} read, ${counts.partial ?? 0} partial, `
  + `${counts.failed ?? 0} failed (${accepted} accepted as unreadable, the rest held out by decision); `
  + `${held.size} account(s) with read holdings against ${accounts.length} in the book.`);
if (!problems.length) {
  console.log("✓ every statement is read in full and every account it holds is in the book at its newest date.");
  process.exit(0);
}
console.log(`\n✗ ${problems.length} problem(s):\n`);
for (const p of problems) {
  console.log(`  [${p.kind}] ${p.file}`);
  console.log(`      ${p.what}`);
  console.log(`      fix: ${p.fix}\n`);
}
process.exit(1);
