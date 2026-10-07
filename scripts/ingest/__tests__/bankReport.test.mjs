// THE BOOK REPORT'S BANK SECTION, RENDERED. Run: node scripts/ingest/__tests__/bankReport.test.mjs
//
// ── WHY THIS SUITE EXISTS ───────────────────────────────────────────────────
//
// That section is a BRANCH NO ARCHIVED DOCUMENT REACHES. The family asked for
// `source/october-2026/` to stay out of this repository, so `public/audit/`
// carries no bank tape and the section renders "_None_" on every ordinary run.
// It was written anyway, and when it was finally rendered against a synthetic
// archive FOUR of its claims were wrong:
//
//   - a bank balance printed to the RUPEE (`85,500.5`) in a section whose own
//     sentence says every figure in it is one the statement PRINTS, and whose
//     gate is struck in paise;
//   - the closing-balance total added the SAME account once per statement, and
//     said "across 3 account(s)" about one;
//   - the `Checks` cell read "8 tied, 1 n/a" on a statement that published
//     NOTHING — silent about the only reason that row exists;
//   - and the not-applicable list printed `drCount` in a sentence, beside
//     "debits total" written out.
//
// Not one was found by reading it. A fifth was a measure rather than a claim:
// the section counted statements off `newestPerReportType`, which SUPERSEDES —
// right for a holding, wrong for a tape, which is nothing but dated rows.
//
// So the section is rendered here on every run. Reading a branch is not
// checking it, and this is the only thing in the repository that renders this
// one at all.
//
// ── IT NEVER WRITES OVER THE COMMITTED BOOK ─────────────────────────────────
//
// `build-book` takes `GLOW_AUDIT_DIR`, `GLOW_BOOK_OUT` and `GLOW_BOOK_REPORT`,
// and all three are pointed into a temporary directory. The last of those
// exists for this suite; the first two predate it. Both committed artefacts are
// hashed before and after, and a run that moved either FAILS — a test that
// rewrote `docs/BOOK-REPORT.md` as a side effect would land a synthetic bank
// section in the repository.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BANK_FIXTURE, installBankFixture } from "./bankReportFixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
const sha = (p) => (fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null);

console.log("bankReport");

const COMMITTED_BOOK = path.join(ROOT, "src", "data", "glowData.ts");
const COMMITTED_REPORT = path.join(ROOT, "docs", "BOOK-REPORT.md");
const bookBefore = sha(COMMITTED_BOOK);
const reportBefore = sha(COMMITTED_REPORT);

// ── THE COMMITTED REPORT CARRIES NO BANK ROW ────────────────────────────────
//
// The whole safety argument for landing the readers without the delivery. If
// this ever fails, a bank statement HAS reached `public/audit/` and every
// figure in that section is a family figure in a tracked file.
{
  const committed = reportBefore === null ? "" : fs.readFileSync(COMMITTED_REPORT, "utf8");
  const sec = section(committed);
  ok("the committed report's bank section is empty — no bank tape is archived",
    sec !== null && /_None — no savings-account statement is in this drop\._/.test(sec),
    sec === null ? "the section heading is not in docs/BOOK-REPORT.md" : sec.split("\n").slice(0, 4).join(" / "));
}

/** The bank section of a rendered report, heading to the next `## `. */
function section(md, heading = "## The family's own bank accounts") {
  const lines = md.split("\n");
  const from = lines.findIndex((l) => l.startsWith(heading));
  if (from < 0) return null;
  const rest = lines.slice(from + 1);
  const to = rest.findIndex((l) => l.startsWith("## "));
  return [lines[from], ...(to < 0 ? rest : rest.slice(0, to))].join("\n");
}

// ── RENDER ──────────────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "glow-bank-report-"));
let rendered = null, built = null, installed = null;
try {
  const archive = path.join(TMP, "audit");
  fs.cpSync(path.join(ROOT, "public", "audit"), archive, { recursive: true });
  installed = await installBankFixture({ root: ROOT, archive });

  const out = path.join(TMP, "glowData.ts");
  const report = path.join(TMP, "BOOK-REPORT.md");
  built = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-book.mjs")], {
    encoding: "utf8",
    env: { ...process.env, GLOW_AUDIT_DIR: archive, GLOW_BOOK_OUT: out, GLOW_BOOK_REPORT: report },
  });
  if (built.status === 0 && fs.existsSync(report)) rendered = fs.readFileSync(report, "utf8");
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

ok("the four fixtures read through the real reader, each to the status it declares",
  installed !== null && installed.length === BANK_FIXTURE.length,
  installed === null ? "installBankFixture threw" : `${installed.length} of ${BANK_FIXTURE.length}`);
ok("…and exactly one of them is refused by its own tie-out",
  installed !== null && installed.filter((w) => w.status === "partial").length === 1
    && installed.filter((w) => w.status === "partial")[0].failed === 1,
  installed === null ? "" : installed.map((w) => `${w.docKey}: ${w.status}/${w.failed} failed`).join(" | "));
ok("build-book renders the book over the scratch archive",
  built !== null && built.status === 0 && rendered !== null,
  built === null ? "" : `status ${built.status}\n       ${(built.stderr ?? "").trim().split("\n").slice(-4).join("\n       ")}`);

ok("…and it wrote neither committed artefact",
  sha(COMMITTED_BOOK) === bookBefore && sha(COMMITTED_REPORT) === reportBefore,
  `glowData ${sha(COMMITTED_BOOK) === bookBefore ? "unchanged" : "CHANGED"}, `
  + `report ${sha(COMMITTED_REPORT) === reportBefore ? "unchanged" : "CHANGED"}`);

const sec = rendered === null ? null : section(rendered);
ok("the rendered report has a bank section with the four statements in it",
  sec !== null && /^\| 50100000000001 \|/m.test(sec) && /^\| 032001510000 \|/m.test(sec),
  sec === null ? "no section" : `${sec.split("\n").length} lines`);

if (sec) {
  const rows = sec.split("\n").filter((l) => /^\| \d/.test(l));
  const cell = (acct, period, i) => {
    const r = rows.find((l) => l.startsWith(`| ${acct} |`) && l.includes(period));
    return r ? r.split("|").map((s) => s.trim())[i] : null;
  };

  // ── THE LEAD IS DERIVED, NOT ASSERTED ─────────────────────────────────────
  //
  // It read "**N statement(s) read completely**" of every row at once, four
  // paragraphs above its own counterexample: a refused statement is PARSED
  // completely and publishes nothing, which is a different claim.
  ok("the lead counts the statements and how many published a tape",
    /\*\*4 statement\(s\), 3 of which published a tape\*\*/.test(sec),
    sec.split("\n").slice(1, 4).join(" / "));
  ok("…and never claims every one of them was read completely",
    !/read completely/.test(sec));

  // ── THE GATE'S CLAIM IS WHAT THE GATE GUARANTEES ──────────────────────────
  //
  // It listed four reconciliations by name — the running balance, both printed
  // totals, the Dr/Cr counts and the closing balance — four of which an ICICI
  // statement structurally cannot strike, because it prints none of them.
  ok("the gate's claim is every check the statement itself supplies a figure for",
    /\*\*every check the statement itself supplies a figure for reconciles to the paisa\*\*/.test(sec));
  ok("…and a check with no printed figure is NOT APPLICABLE, never a pass",
    /NOT APPLICABLE and never a\s*\n?pass/.test(sec));

  // ── EVERY FIGURE TO THE PAISE ─────────────────────────────────────────────
  //
  // `toLocaleString` drops a trailing zero, so a closing balance the bank
  // prints as 85,500.50 rendered 85,500.5 and an opening of 1,00,000.00
  // rendered 1,00,000 — in a section whose own sentence says every figure in it
  // is one the statement PRINTS.
  ok("an opening balance keeps the paise the statement printed",
    cell("50100000000001", "2026-06-30", 5) === "1,00,000.00",
    String(cell("50100000000001", "2026-06-30", 5)));
  ok("…and so does a closing balance",
    cell("50100000000001", "2026-06-30", 8) === "85,500.50",
    String(cell("50100000000001", "2026-06-30", 8)));
  ok("…and a credit total whose paise are zero",
    cell("50100000000001", "2026-09-30", 7) === "5,000.00",
    String(cell("50100000000001", "2026-09-30", 7)));
  const bad = (sec.match(/\| [\d,]+\.\d \|/g) ?? []).concat(sec.match(/\| [\d,]+ \|/g) ?? [])
    .filter((m) => !/\| \d+ \|/.test(m));
  ok("…and no money cell in the table is printed to fewer than two decimals",
    bad.length === 0, bad.join(" "));

  // ── THE CHECKS COLUMN, AND A FAILURE LEADS IT ─────────────────────────────
  // TWO OF HDFC'S TEN ARE NOT-APPLICABLE: the serial one, because its layout
  // prints no serial column, and the page scan, because it is ICICI's — HDFC
  // prints its own opening, closing, totals and counts, so a page lost from one
  // fails those. Named, never counted among the ties.
  ok("a published statement's Checks cell counts what tied and what was n/a",
    cell("50100000000001", "2026-06-30", 10) === "8 tied, 2 n/a",
    String(cell("50100000000001", "2026-06-30", 10)));
  ok("…and the ICICI statement's says six and five, because it prints less and is scanned",
    cell("032001510000", "2026-06-30", 10) === "6 tied, 5 n/a",
    String(cell("032001510000", "2026-06-30", 10)));
  ok("a REFUSED statement's Checks cell leads with the failure",
    cell("50100000000002", "2026-06-30", 10) === "**1 FAILED**, 7 tied, 2 n/a",
    String(cell("50100000000002", "2026-06-30", 10)));
  ok("…and its Rows cell says nothing was published",
    cell("50100000000002", "2026-06-30", 9) === "none published",
    String(cell("50100000000002", "2026-06-30", 9)));
  ok("…and it carries no closing balance, since the figure it would print is the one that failed",
    cell("50100000000002", "2026-06-30", 8) === "—",
    String(cell("50100000000002", "2026-06-30", 8)));

  // ── ONE CLOSING BALANCE PER ACCOUNT, THE LATEST ───────────────────────────
  //
  // `bankAccounts` is one entry per DOCUMENT, so summing its closing column
  // adds the same account once per statement: two HDFC quarters of one account
  // read as two accounts holding both balances.
  ok("the closing-balance total takes each account's newest statement",
    /come to \*\*2,65,500\.50\*\* across 2 account\(s\), each taken from the newest of its 3 statement\(s\)/.test(sec),
    (sec.match(/^Their closing balances.*$/m) ?? ["(no total line)"])[0]);
  ok("…and says that figure is in nothing above",
    /that figure is in nothing above/.test(sec));

  // ── WHAT THE STATEMENT COULD NOT SUPPLY ───────────────────────────────────
  const naLine = (acct) => (sec.match(new RegExp(`^- \\*\\*[^*]*${acct}\\*\\*[^\\n]*$`, "m")) ?? [""])[0];
  ok("each account's not-applicable checks are named, in the reader's own words",
    /serial numbers: the statement's layout prints no serial column/.test(naLine("50100000000001")),
    naLine("50100000000001"));
  ok("…and a count's label is written out, never its field name",
    /debit count: the statement prints none/.test(naLine("032001510000"))
      && /credit count: the statement prints none/.test(naLine("032001510000")),
    naLine("032001510000"));
  ok("…so no camelCase field name reaches the section's prose",
    !/\b(drCount|crCount|closingBalance|openingBalance)\b/.test(sec),
    (sec.match(/\b(drCount|crCount|closingBalance|openingBalance)\b/) ?? [])[0] ?? "");

  // A DERIVED OPENING LEAVES ROW 1 UNWITNESSED, and the n/a entry names the
  // row's own amount — because `opening = b₁ + d₁ − c₁` makes row 1 pass
  // whatever its amount is, so the evidence begins at row 2.
  ok("a derived opening names the first row it cannot witness, with that row's own amount",
    /the first row's own amount: the opening balance is derived from it, so the running balance witnesses rows 2\.\.3 and not row 1 \(2026-04-01, 50000\.00 out\)/
      .test(naLine("032001510000")),
    naLine("032001510000"));

  // ── AND A REFUSED STATEMENT NAMES THE CHECK THAT FAILED ───────────────────
  //
  // The figure is in hand — the reader returns `checks.failed` on the refusal
  // path too — so a pointer to another document is the weaker answer.
  ok("the refused statement is listed, and names the check that failed",
    /^- \*\*HDFC Bank \(savings account\) 50100000000002\*\* \(2026-06-30\): closing balance: last row 85500\.50 against a printed 90000\.00$/m
      .test(sec),
    (sec.match(/^- \*\*HDFC Bank \(savings account\) 50100000000002\*\*.*$/m) ?? ["(not listed)"])[0]);
  ok("…and is identified by its period rather than by a dash",
    !/^- \*\*HDFC Bank \(savings account\) 50100000000002\*\* \(—\)/m.test(sec));
  ok("…and the refusal is explained as publishing nothing rather than a partial tape",
    /published nothing rather than a partial tape, which would read as a complete one/.test(sec));

  // ── THE SECTION COUNTS EVERY ISSUE, BECAUSE A TAPE IS NOTHING BUT DATED ROWS ─
  //
  // It read `newestPerReportType(group, …)`, which SUPERSEDES: two quarters of
  // one account reached the report as one, and the earlier quarter's rows — real
  // payments, which do not restate — were dropped from the section silently.
  ok("both issues of the one account are rows, not just the newest",
    rows.filter((l) => l.startsWith("| 50100000000001 |")).length === 2,
    rows.filter((l) => l.startsWith("| 50100000000001 |")).map((l) => l.slice(0, 80)).join("\n       "));
}

// ── THE SECTION ABOVE IT, WHOSE INTRO HAD THE SAME DEFECT ───────────────────
//
// "Read, and deliberately NOT in the book" is the one OTHER branch this
// delivery changes, and on this tree it had no counterexample either: every row
// in that table is another taxpayer's folio, so a blanket "they belong to
// somebody else — each becomes part of the book with a single entry in
// `shared/owners.mjs`" was true of all of them. A savings account is in that
// table for what it IS rather than for whose it is, and no owner entry would
// ever bring one in, so BOTH sentences go false the moment the delivery lands.
//
// The fixture is what gives that branch a subject, so the claims are asserted
// here rather than reasoned about — which is also what caught a plural verb
// against a count of one when the branch was first rendered.
const exc = rendered === null ? null : section(rendered, "## Read, and deliberately NOT in the book");
ok("the excluded-accounts section carries both kinds of row",
  exc !== null && /belongs? to somebody else/.test(exc) && /the family's OWN bank account/.test(exc),
  exc === null ? "no section" : `${exc.split("\n").length} lines`);

if (exc) {
  // Four accounts, two of them one account's two quarters, so the own-bank
  // paragraph counts ACCOUNTS and not statements.
  const bankAccts = new Set((sec ?? "").split("\n").filter((l) => /^\| \d/.test(l))
    .map((l) => l.split("|").map((t) => t.trim()).slice(1, 3).join("|")));
  const m = exc.match(/\*\*(\d+) of them (is|are) the family's OWN bank accounts?\*\*/);
  ok("…and the own-bank paragraph counts the accounts the bank section carries",
    m !== null && Number(m[1]) === bankAccts.size,
    m === null ? "the own-bank paragraph is not there" : `says ${m[1]} against ${bankAccts.size} in the bank section`);
  ok("…with the verb agreeing with that count",
    m !== null && m[2] === (Number(m[1]) === 1 ? "is" : "are"),
    m === null ? "" : `"${m[1]} ... ${m[2]}"`);
  ok("…and says it is out for what it IS, not for whose it is",
    /excluded for what (it is|they are)\s*\n?\s*rather than for whose/.test(exc));
  ok("…and that no owner entry would bring one in",
    /no owner entry would ever bring one in/.test(exc));

  // AND THE OTHER-HOLDER SENTENCE IS SCOPED TO ITS OWN COUNT. Read of every row
  // at once it claimed a savings account becomes part of the book with one
  // `shared/owners.mjs` entry, which it never does.
  const o = exc.match(/\*\*(\d+) of them (belongs|belong) to somebody else\*\*/);
  const total = exc.split("\n").filter((l) => /^\| \d/.test(l)).length;
  ok("the other-holder sentence is scoped to a count, and that count is not every row",
    o !== null && Number(o[1]) > 0 && Number(o[1]) < total,
    o === null ? "it is not scoped at all" : `says ${o[1]} of ${total} rows`);
  ok("…and the single-owners-entry remedy is inside that paragraph, never the intro",
    o !== null && exc.indexOf("shared/owners.mjs") > exc.indexOf(o[0]),
    `remedy at ${exc.indexOf("shared/owners.mjs")}, paragraph at ${o === null ? -1 : exc.indexOf(o[0])}`);
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
