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

/** A `BOOK_*` array export of the generated book — a JSON array literal. */
const bookTs = fs.readFileSync(BOOK, "utf8");
function bookArray(name) {
  const ts = bookTs;
  const at = ts.indexOf(`export const ${name}:`);
  if (at < 0) throw new Error(`no ${name} in ${BOOK}`);
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
const accounts = bookArray("BOOK_ACCOUNTS");
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
  /**
   * A SNAPSHOT IS ANY STATEMENT THAT VALUES THE HOLDINGS, WHATEVER ITS REPORT
   * TYPE (Stage 10eu). This used to count only the report types the account's
   * precedence rule names, so a newer statement of a type the rule left out
   * could never be flagged: Buoyant's account statements and SVAN 8710067's
   * appraisal were both read in full and neither reached the book. A fact
   * sheet carries weights and no values, and a report
   * whose section prints no rows is not whole, so neither counts. Nor does one
   * whose own value bridge misses its holdings total: it disagrees with its
   * manager's other reports for that day, so the book keeps the last verified
   * record and its report names the newer one (build-book's `wholeSnapshot`).
   */
  const rule = sourceFor(provider, "holdings");
  const valued = (d) => d.holdings.some((h) => h.marketValue != null) && !(d.sectionsWithoutRows?.length)
    && !d.warnings.some((w) => w.code === "value-bridge-mismatch");
  const snaps = ds.filter(valued);
  const newest = snaps.map((d) => d.asOf).filter(Boolean).sort().at(-1);
  if (newest && acc.asOf && newest > acc.asOf) {
    const n = snaps.find((d) => d.asOf === newest);
    const named = !rule || rule.reportTypes.includes(n.reportType);
    problem("stale in the book", n.sourcePath,
      `${acc.accountId} is dated ${acc.asOf} in the book but its ${n.reportType} of ${newest} values its holdings`,
      named
        ? "`npm run build-book` — and if it still lags, the newer statement is missing a fact precedence.mjs asks for; "
          + "the book report names which."
        : `${provider}'s holdings rule in scripts/ingest/precedence.mjs does not name \`${n.reportType}\`. If it is a `
          + "snapshot of the same holdings, name it (with `newestWins`); then `npm run build-book`.");
  }
}

// ── 5. A statement that prints dated transactions carries them ────────────────
//
// *"a few statements were not being read because they were showing all the
// redeemed units … they are also meant to be read and fed into the dashboard
// because they provide historical returns values and give transactions
// context"* — the family, 21 Oct 2026 (Stage 10fb). Motilal Oswal's Hedged
// Equity statement printed ₹13 Cr in and ₹11.19 Cr out and its document carried
// neither; it read "status ok" because a summary row of dashes is a fine
// summary. A line that prints a date, a transaction word and a rupee amount is
// a dated row; a document whose page prints one and whose reading carries no
// dated fact at all has dropped its history.
const DATED_LINE = /(^|\s)\d{1,2}[-/.](\d{1,2}|[A-Za-z]{3})[-/.]\d{2,4}(\s|$)/;
const TXN_WORD = /\b(redemption|redeem|purchase|contribution|allot|switch|payout|dividend|idcw|distribution|withdraw|subscription|drawdown|capital call|sip)\b/i;
const AMOUNT = /\d[\d,]*\.\d{2}\b/;
const DATED_FACTS = ["cashFlows", "transactions", "income", "capitalGains", "expenses", "openLots", "dematBalances", "capitalAccount"];
for (const { e, d } of docs) {
  if (e.status === "failed" || d.twinOf) continue;
  // An `opening-units` marker is a balance, not a movement: HDFC's folios carried
  // only those while printing six years of purchases and redemptions.
  const rowsOf = (k) => (d[k] ?? []).filter((r) => k !== "cashFlows" || r.kind !== "opening-units");
  if (DATED_FACTS.some((k) => rowsOf(k).length > 0)) continue;
  let pages;
  try { pages = JSON.parse(fs.readFileSync(path.join(AUDIT, e.docKey, "pages.json"), "utf8")).pages ?? []; } catch { continue; }
  const lines = pages.flatMap((p) => String(p.text ?? "").split("\n"))
    .filter((l) => DATED_LINE.test(l) && TXN_WORD.test(l) && AMOUNT.test(l));
  if (!lines.length) continue;
  problem("history not read", e.sourcePath,
    `${e.docKey} prints ${lines.length} dated transaction line(s) — e.g. "${lines[0].trim().slice(0, 90)}" — and its reading carries no dated row`,
    "Teach its reader the statement's transaction table (contributions, allotments, switches, redemptions, payouts), "
    + "in the kinds the book already consumes; then `npm run extract` and `npm run build-book`.");
}

// ── 6. Every dated external flow a statement prints is in the capital record ──
//
// Matched by account and DATE, not amount: the book sums same-day legs (Invesco's
// Direct and Regular "Lateral shift in") and Sanshi prints a running balance on
// its allotment rows, so amounts legitimately differ row by row — but a date on
// which a statement says money went in or out, with no capital move in the book
// that day, is history the dashboard does not show.
const moves = bookArray("BOOK_CAPITAL_MOVES");
const moveDays = new Set(moves.map((m) => `${m.accountId}|${m.date}`));
const idOf = (provider, accountNo) =>
  `${provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${accountNo}`;
const missing = new Map();
for (const { e, d } of docs) {
  if (e.status !== "ok" || d.twinOf || d.excludedFromBook || !d.accountNo) continue;
  const acc = accounts.find((a) => a.provider === d.provider && String(a.accountNo) === String(d.accountNo));
  if (!acc) continue;                                    // check 3 owns an account missing from the book
  for (const f of d.cashFlows ?? []) {
    if ((f.kind !== "contribution" && f.kind !== "withdrawal") || !f.date) continue;
    if (moveDays.has(`${acc.accountId}|${f.date}`)) continue;
    const k = `${acc.accountId}|${e.sourcePath}`;
    (missing.get(k) ?? missing.set(k, { acc, e, rows: [] }).get(k)).rows.push(`${f.date} ${f.kind} ${f.amount ?? "—"}`);
  }
}
void idOf;
for (const { acc, e, rows } of missing.values()) {
  problem("history not in the book", e.sourcePath,
    `${acc.accountId}: ${rows.length} dated ${rows.length === 1 ? "flow" : "flows"} the statement prints have no capital move in the book — ${rows.slice(0, 4).join("; ")}`,
    "Name this report type for `cashFlows` in the provider's block in scripts/ingest/precedence.mjs (or teach build-book "
    + "its kind), then `npm run build-book`.");
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
