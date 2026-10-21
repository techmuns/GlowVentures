// THE READ GATE FAILS ON EVERY WAY A STATEMENT CAN GO MISSING.
// Run: node scripts/ingest/__tests__/checkReads.test.mjs
//
// `npm run check:reads` is what stops the next delivery landing half-read. A
// gate that passes is only evidence if it also FAILS — so each case below plants
// one way a statement goes missing in a tiny synthetic archive and book, runs
// the real script against it, and expects a non-zero exit naming the problem.
// The clean control must pass, or every failure below proves nothing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "check-reads.mjs");

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("checkReads");

const PROVIDER = "Carnelian Asset Management and Advisors Pvt Ltd";   // has a precedence block
const holdingsDoc = (docKey, asOf, extra = {}) => ({
  docKey, provider: PROVIDER, accountNo: "1", asOf, reportType: "appraisal", sourcePath: `source/${docKey}.pdf`,
  status: "ok", warnings: [], holdings: [{ securityKey: "x", marketValue: 100 }], ...extra,
});

/** Write a synthetic archive + book + report, run the gate, return { code, out }. */
function run({ docs, accounts, report = "", moves = [] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glow-check-reads-"));
  try {
    const audit = path.join(dir, "audit");
    fs.mkdirSync(audit);
    for (const { pageText, ...d } of docs) {
      fs.mkdirSync(path.join(audit, d.docKey));
      fs.writeFileSync(path.join(audit, d.docKey, "document.json"), JSON.stringify(d));
      if (pageText) fs.writeFileSync(path.join(audit, d.docKey, "pages.json"), JSON.stringify({ pages: [{ page: 1, text: pageText }] }));
    }
    fs.writeFileSync(path.join(audit, "manifest.json"), JSON.stringify(docs.map((d) => ({
      docKey: d.docKey, provider: d.provider, status: d.status, sourcePath: d.sourcePath,
    }))));
    const book = path.join(dir, "glowData.ts");
    fs.writeFileSync(book, `export const BOOK_ACCOUNTS: Account[] = ${JSON.stringify(accounts, null, 1)};\n`
      + `export const BOOK_CAPITAL_MOVES: CapitalMove[] = ${JSON.stringify(moves)};\n`);
    const rep = path.join(dir, "BOOK-REPORT.md");
    fs.writeFileSync(rep, report);
    const r = spawnSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, GLOW_AUDIT_DIR: audit, GLOW_BOOK_TS: book, GLOW_BOOK_REPORT: rep },
    });
    return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const account = (asOf) => [{ accountId: "carnelian-1", provider: PROVIDER, accountNo: "1", asOf }];
// The two files acceptedUnread.mjs names must be present AS FAILED, or the gate
// (rightly) calls those entries stale; every case carries them.
const accepted = [
  { docKey: "lkp-notice", provider: "(unidentified)", sourcePath: "source/_extracted/october-2026-c/LKP EQUITY/519_06102026124925.xls",
    status: "failed", warnings: [{ code: "pdf-read-failed", detail: "removal notice" }] },
  { docKey: "hdfc-scan", provider: "(unidentified)", sourcePath: "source/august-2026-e/HOLDING STATEMENT AS ON 31 MARCH 2026.pdf",
    status: "failed", warnings: [{ code: "no-text-layer", detail: "scan" }] },
];

// ── control ───────────────────────────────────────────────────────────────────
{
  const r = run({ docs: [...accepted, holdingsDoc("a", "2026-09-30")], accounts: account("2026-09-30") });
  ok("a clean archive passes", r.code === 0, r.out);
}
{
  const heldOut = { docKey: "review", provider: "Consolidated family review (not a statement)", sourcePath: "source/review.xlsx",
    status: "failed", warnings: [{ code: "held-out-by-decision", detail: "" }] };
  const r = run({ docs: [...accepted, heldOut, holdingsDoc("a", "2026-09-30")], accounts: account("2026-09-30") });
  ok("a document held out by decision passes", r.code === 0, r.out);
}
{
  const notesOnly = holdingsDoc("a", "2026-09-30", { warnings: [{ code: "section-reported-empty", detail: "" }] });
  const r = run({ docs: [...accepted, notesOnly], accounts: account("2026-09-30") });
  ok("a read document carrying only statement notes passes", r.code === 0, r.out);
}

// ── every way a statement goes missing ──────────────────────────────────────
{
  const partial = holdingsDoc("a", "2026-09-30", { status: "partial", warnings: [{ code: "columns-not-matched", detail: "marketPrice" }] });
  const r = run({ docs: [...accepted, partial], accounts: account("2026-09-30") });
  ok("a PARTIAL document fails, naming its read gap", r.code === 1 && /\[read gap\]/.test(r.out) && /columns-not-matched/.test(r.out), r.out);
}
{
  const unread = { docKey: "new-layout", provider: PROVIDER, sourcePath: "source/new-delivery/NewLayout.pdf",
    status: "failed", warnings: [{ code: "no-reader-for-report-type", detail: "unknown" }] };
  const r = run({ docs: [...accepted, unread, holdingsDoc("a", "2026-09-30")], accounts: account("2026-09-30") });
  ok("a FAILED document with no recorded reason fails, naming the file",
    r.code === 1 && /\[not read\] source\/new-delivery\/NewLayout\.pdf/.test(r.out), r.out);
}
{
  const r = run({ docs: [accepted[1], holdingsDoc("a", "2026-09-30")], accounts: account("2026-09-30") });
  ok("an accepted-unreadable entry whose file no longer fails is stale and fails", r.code === 1 && /\[stale exception\]/.test(r.out), r.out);
}
{
  const r = run({ docs: [...accepted, holdingsDoc("a", "2026-09-30")], accounts: [] });
  ok("a read account the book neither carries nor excludes fails", r.code === 1 && /\[not in the book\]/.test(r.out), r.out);
}
{
  const r = run({ docs: [...accepted, holdingsDoc("a", "2026-09-30")], accounts: [],
    report: `- account 1 (${PROVIDER}) is NOT in the book: a separate taxpayer.` });
  ok("…unless the book excludes it by name with a reason", r.code === 0, r.out);
}
{
  const r = run({ docs: [...accepted, holdingsDoc("a", "2026-08-31"), holdingsDoc("b", "2026-09-30")], accounts: account("2026-08-31") });
  ok("a newer statement read and not used fails — the book is stale", r.code === 1 && /\[stale in the book\]/.test(r.out) && /2026-09-30/.test(r.out), r.out);
}
// Stage 10eu: the staleness test used to count only the report types the
// holdings rule names, so these three accounts' newer statements were invisible.
{
  const snap = holdingsDoc("b", "2026-10-07", { reportType: "portfolio-snap" });
  const r = run({ docs: [...accepted, holdingsDoc("a", "2026-09-30"), snap], accounts: account("2026-09-30") });
  ok("a newer VALUED statement of a type the holdings rule does not name fails, naming the rule",
    r.code === 1 && /\[stale in the book\]/.test(r.out) && /does not name `portfolio-snap`/.test(r.out), r.out);
}
{
  const factSheet = holdingsDoc("b", "2026-10-07", { reportType: "fact-sheet", holdings: [{ securityKey: "x", marketValue: null }] });
  const r = run({ docs: [...accepted, holdingsDoc("a", "2026-09-30"), factSheet], accounts: account("2026-09-30") });
  ok("…but a newer fact sheet that values nothing passes — it is not a snapshot", r.code === 0, r.out);
}
{
  const noRows = holdingsDoc("b", "2026-10-07", { reportType: "investor-report", sectionsWithoutRows: [{ section: "Shares", printedValue: 1 }] });
  const r = run({ docs: [...accepted, holdingsDoc("a", "2026-09-30"), noRows], accounts: account("2026-09-30") });
  ok("…nor a newer report whose section prints a subtotal and no rows — it is not whole", r.code === 0, r.out);
}
{
  const unreconciled = holdingsDoc("b", "2026-10-07", { reportType: "investor-report",
    warnings: [{ code: "value-bridge-mismatch", detail: "lines reach 1, not the stated closing 2" }] });
  const r = run({ docs: [...accepted, holdingsDoc("a", "2026-09-30"), unreconciled], accounts: account("2026-09-30") });
  ok("…nor a newer report whose own value bridge misses its total — the last verified record stands", r.code === 0, r.out);
}

// ── Stage 10fc: a redeemed investment's history is read and reaches the book ──
const PRINTED = "Transaction Details : Class B2\n29-07-2024 Contribution - - 13,00,00,000.00\n31-07-2025 Unit Redemption-Payout 8.5353 (1,31,09,904.680) (11,18,96,969.42)";
{
  const redeemed = holdingsDoc("hedged", "2026-09-30", { pageText: PRINTED, holdings: [{ securityKey: "x", marketValue: 0 }] });
  const r = run({ docs: [...accepted, redeemed], accounts: account("2026-09-30") });
  ok("a statement that prints dated transactions and carries none fails, quoting the line",
    r.code === 1 && /\[history not read\]/.test(r.out) && /13,00,00,000\.00/.test(r.out), r.out);
}
{
  const markersOnly = holdingsDoc("hdfc", "2026-09-30", { pageText: PRINTED,
    cashFlows: [{ date: "2024-07-29", kind: "opening-units", amount: null, units: 0 }] });
  const r = run({ docs: [...accepted, markersOnly], accounts: account("2026-09-30") });
  ok("…and opening-unit markers alone do not count as its history", r.code === 1 && /\[history not read\]/.test(r.out), r.out);
}
const flows = [{ date: "2024-07-29", kind: "contribution", amount: 130000000 }, { date: "2025-07-31", kind: "withdrawal", amount: -111896969.42 }];
{
  const read = holdingsDoc("hedged", "2026-09-30", { pageText: PRINTED, cashFlows: flows });
  const r = run({ docs: [...accepted, read], accounts: account("2026-09-30") });
  ok("a read history with no capital move in the book fails, naming the dates",
    r.code === 1 && /\[history not in the book\]/.test(r.out) && /2024-07-29/.test(r.out), r.out);
}
{
  const read = holdingsDoc("hedged", "2026-09-30", { pageText: PRINTED, cashFlows: flows });
  const moves = [{ accountId: "carnelian-1", date: "2024-07-29" }, { accountId: "carnelian-1", date: "2025-07-31" }];
  const r = run({ docs: [...accepted, read], accounts: account("2026-09-30"), moves });
  ok("…and passes once every printed date is a capital move in the book", r.code === 0, r.out);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
