// THE FAMILY'S OWN SAVINGS-ACCOUNT STATEMENTS — HDFC Bank and ICICI Bank.
// Run: node scripts/ingest/__tests__/bankStatement.test.mjs
//
// ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
//
// A bank tape is the one document in this corpus whose WHOLE content is dated
// rows: there is no holding to cross-check, no mark, no second report of the
// same facts. So the statement's own arithmetic is the only witness it has, and
// `tieOut` is the licence to publish anything at all — the standing
// `hdfcNsdl.mjs` already needs for a figure read off a rendered page, and
// `threePFlows` for a table nothing else restates.
//
// Most cases below therefore BREAK one thing about a statement and assert the
// reader publishes NOTHING and says which thing broke. A partial tape is the
// failure that matters here: 240 of 243 withdrawals reads exactly like 243, and
// the three that went missing are three payments the family made.
//
// ── AND THE FIXTURES CARRY NO FAMILY DATA ───────────────────────────────────
//
// Every narration, account number, holder and amount below is INVENTED. What is
// taken from the real statements is their GEOMETRY — which x each column's label
// and data sit at, where a continuation line falls, how a narration wraps —
// because the geometry is what the reader meets and a fixture that invented it
// would prove only that the reader agrees with the fixture.
//
// The real statements are not in this repository (the family asked for
// `source/october-2026/` to stay out of it), so unlike `hdfcNative.test.mjs`
// there is no end-to-end section to run here at all. What that costs is stated
// rather than glossed: nothing in this suite checks that the fixtures below are
// those statements. What binds the reader to them instead is `tieOut` itself —
// it is struck on the figures the banks PRINT, so a misread column cannot
// reconcile, and the archived tape was measured against each statement's own
// printed opening, debits, credits, closing and Dr/Cr counts when it landed.
import {
  extract, tieOut, paise, toIso, joinNarration, layoutOf,
  PROVIDER, HDFC, ICICI, REPORT_TYPE, CASH_FLOW_KIND, HDFC_COLUMNS, ICICI_COLUMNS,
} from "../providers/bankStatement.mjs";
import fs from "node:fs";
import { bankGuardCounts, classify, isBankStatement, resetBankGuardCounts, REPORT_TYPES }
  from "../lib/classify.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("bankStatement");

// ── THE FIXTURES ────────────────────────────────────────────────────────────
const it = (x, width, text) => ({ x, width, height: 7, text });
const row = (y, ...items) => ({ y, items: items.map((i) => ({ ...i, y })) });
/** Cells are what the header regexes read; rebuilt from the items after any edit. */
function withCells(grid) {
  for (const p of grid.pages) for (const r of p.rows) r.cells = r.items.map((i) => ({ text: i.text }));
  return grid;
}
const run = (grid, meta = { docKey: "test-doc" }) => extract({ grid: withCells(grid), meta });
const codes = (d) => (d.warnings ?? []).map((w) => w.code);
const detail = (d, code) => (d.warnings ?? []).filter((w) => w.code === code).map((w) => w.detail).join(" | ");
const failed = (d) => detail(d, "tie-out-failed");

/** The row on page `p` holding an item with this exact text. */
function rowWith(grid, text, p = 0) {
  for (const r of grid.pages[p].rows) if (r.items.some((i) => i.text === text)) return r;
  throw new Error(`fixture has no item "${text}" on page ${p}`);
}
const itemOf = (grid, text, p = 0) => rowWith(grid, text, p).items.find((i) => i.text === text);
/**
 * An item of the SUMMARY block's value row, by its text.
 *
 * `85,500.50` is printed three times on this statement — row 2's balance, row
 * 4's balance and the summary's own closing — so `itemOf` finds whichever comes
 * first and a case meaning to break the printed closing breaks a row balance
 * instead. The summary's value row is the one carrying the opening.
 */
function summaryItem(grid, text, p = 0) {
  const r = rowWith(grid, "100,000.00", p);
  const found = r.items.find((i) => i.text === text);
  if (!found) throw new Error(`the summary row has no "${text}"`);
  return found;
}

/**
 * HDFC's money columns are RIGHT-ALIGNED, so a figure belongs to the column
 * whose right edge it shares. The fixture places each by its right edge, which
 * is how the statements place them and what `splitByAlignedEdges` measures.
 */
const RIGHT = { withdrawal: 470.2, deposit: 548.2, balance: 626.7 };
/** `01/04/26` — six digits and two slashes at the size the tape is printed at. */
const DATE_W = 28.0;
const atRight = (edge, text, perChar = 5.0) => {
  const width = text.length * perChar;
  return it(edge - width, width, text);
};

/**
 * One HDFC data row, at the measured x's: date 33.7, narration from 68.0,
 * reference 283.5, value date 361.5, and the three money columns right-aligned.
 */
function hdfcRow(y, { date, narration, reference, valueDate, withdrawal, deposit, balance }) {
  // DATE_W is eight glyphs at the size these statements print, so the date item
  // ends short of the narration's own left edge at 68.0 — which is what a real
  // `dd/mm/yy` at x 33.7 under a Narration column starting at 68.0 must do.
  const items = [it(33.7, DATE_W, date), it(68.0, narration.length * 4.2, narration)];
  if (reference) items.push(it(283.5, reference.length * 4.2, reference));
  if (valueDate) items.push(it(361.5, 38.0, valueDate));
  if (withdrawal) items.push(atRight(RIGHT.withdrawal, withdrawal));
  if (deposit) items.push(atRight(RIGHT.deposit, deposit));
  items.push(atRight(RIGHT.balance, balance));
  return row(y, ...items);
}

/**
 * AN HDFC STATEMENT. Four rows, invented: two withdrawals and two deposits,
 * running 1,00,000.00 → 85,500.50, with the summary block the bank prints.
 *
 *   opening   100,000.00
 *   row 1  −   25,000.00  →  75,000.00
 *   row 2  +   10,500.50  →  85,500.50
 *   row 3  −    8,000.00  →  77,500.50
 *   row 4  +    8,000.00  →  85,500.50
 *   debits  33,000.00 over 2 · credits 18,500.50 over 2 · closing 85,500.50
 */
/** The column header HDFC reprints at the top of every page. */
function hdfcHeader(y) {
  return row(y,
    it(39.9, 24.0, "Date"), it(144.2, 44.0, "Narration"), it(283.5, 62.0, "Chq./Ref.No."),
    it(361.5, 40.0, "Value Dt"), it(405.3, 56.0, "Withdrawal Amt."), it(491.1, 46.0, "Deposit Amt."),
    it(564.3, 62.0, "Closing Balance"));
}

function hdfc() {
  const page0 = [
    row(720.4, it(36.0, 120.0, "HDFC BANK LIMITED")),
    row(696.2, it(36.0, 90.0, "Account Branch : TEST"), it(396.8, 160.0, "Account No : 50100000000001")),
    row(660.0, it(36.0, 120.0, "ACCOUNT HOLDER : TEST HOLDER ONE")),
    row(620.2, it(36.0, 230.0, "Statement From : 01/04/2026 To : 30/06/2026")),
    hdfcHeader(596.0),
    hdfcRow(576.0, { date: "01/04/26", narration: "NEFT DR-TESTBANK0001-PAY", reference: "N001000001",
      valueDate: "01/04/26", withdrawal: "25,000.00", balance: "75,000.00" }),
    hdfcRow(560.0, { date: "15/04/26", narration: "NEFT CR-TESTBANK0002-RECEIPT", reference: "N002000002",
      valueDate: "15/04/26", deposit: "10,500.50", balance: "85,500.50" }),
    hdfcRow(544.0, { date: "02/05/26", narration: "UPI-TEST PAYEE-TESTUPI", reference: "0000000003",
      valueDate: "02/05/26", withdrawal: "8,000.00", balance: "77,500.50" }),
    hdfcRow(528.0, { date: "20/05/26", narration: "IMPS CR-TESTBANK0003-REFUND", reference: "0000000004",
      valueDate: "20/05/26", deposit: "8,000.00", balance: "85,500.50" }),
    // THE SUMMARY BLOCK: labels on one row, values on the next, matched by the
    // nearest CENTRE. The labels are nowhere near their values' columns, so a
    // positional read binds the wrong figure to every one of them.
    row(300.0,
      it(40.0, 86.0, "Opening Balance"), it(170.0, 54.0, "Dr Count"), it(250.0, 54.0, "Cr Count"),
      it(340.0, 40.0, "Debits"), it(430.0, 44.0, "Credits"), it(520.0, 62.0, "Closing Bal")),
    row(286.0,
      it(48.0, 70.0, "100,000.00"), it(182.0, 14.0, "2"), it(262.0, 14.0, "2"),
      it(336.0, 60.0, "33,000.00"), it(426.0, 60.0, "18,500.50"), it(524.0, 60.0, "85,500.50")),
  ];
  return { pages: [{ rows: page0 }] };
}

/**
 * One ICICI data row, at the measured x's: serial, date at 61.4, cheque at
 * 142.9, remarks from 192, and the money columns right-aligned near 453 / 519,
 * with the balance left-set at 525.9.
 */
function iciciRow(y, { serial, date, cheque, remarks, withdrawal, deposit, balance }) {
  const items = [it(30.0, 18.0, String(serial)), it(61.4, 50.0, date)];
  if (cheque) items.push(it(142.9, cheque.length * 4.2, cheque));
  items.push(it(192.0, remarks.length * 4.0, remarks));
  if (withdrawal) items.push(atRight(453.0, withdrawal));
  if (deposit) items.push(atRight(519.0, deposit));
  items.push(it(525.9, balance.length * 5.0, balance));
  return row(y, ...items);
}

/**
 * AN ICICI STATEMENT. It prints no opening balance, no totals and no counts, so
 * the opening is DERIVED from the first row and `tieOut` reports four of its
 * checks NOT APPLICABLE — which is the case the suite exists to pin: four
 * not-applicable checks must never be reported as four that passed.
 *
 *   derived opening  200,000.00  (row 1's printed balance + what row 1 moved)
 *   row 1  −  50,000.00  →  150,000.00
 *   row 2  +  75,000.25  →  225,000.25
 *   row 3  −  25,000.25  →  200,000.00
 */
function icici() {
  const page0 = [
    row(740.0, it(36.0, 120.0, "ICICI Bank Limited")),
    row(716.0, it(36.0, 180.0, "Account Number : 032001510000")),
    row(700.0, it(36.0, 200.0, "Statement From 01.04.2026 To 30.06.2026")),
    row(676.0,
      it(30.0, 30.0, "S No"), it(61.4, 70.0, "Transaction Date"), it(142.9, 46.0, "Cheque"),
      it(192.0, 110.0, "Transaction Remarks"), it(410.0, 60.0, "Withdrawal"),
      it(480.0, 46.0, "Deposit"), it(525.9, 46.0, "Balance")),
    iciciRow(656.0, { serial: 1, date: "01.04.2026", remarks: "NEFT-TESTREF0001-TEST PAYEE ONE",
      withdrawal: "50,000.00", balance: "150,000.00" }),
    iciciRow(640.0, { serial: 2, date: "15.05.2026", cheque: "000123",
      remarks: "RTGS-TESTREF0002-TEST PAYER TWO", deposit: "75,000.25", balance: "225,000.25" }),
    iciciRow(624.0, { serial: 3, date: "20.06.2026", remarks: "UPI/TESTREF0003/TEST PAYEE THREE",
      withdrawal: "25,000.25", balance: "200,000.00" }),
  ];
  return { pages: [{ rows: page0 }] };
}

// ── 1. THE PRIMITIVES ───────────────────────────────────────────────────────
{
  // PAISE INTEGERS, so a misread paisa is distinguishable from float drift. The
  // running balance on the largest of these statements adds 361 rows; in floats
  // 3,583,688,673.57 does not survive that, and a tolerance wide enough to let
  // it through is wide enough to let a wrong paisa through too.
  ok("a rupee figure reads as paise", paise("1,00,000.00") === 10000000, String(paise("1,00,000.00")));
  ok("Indian grouping reads", paise("3,58,36,88,673.57") === 358368867357, String(paise("3,58,36,88,673.57")));
  ok("a paisa is not lost", paise("0.01") === 1, String(paise("0.01")));
  ok("a blank column is not a zero", paise("") === null && paise(null) === null);
  ok("a printed zero is a zero", paise("0.00") === 0, String(paise("0.00")));
  ok("text in a money column is refused", paise("25,000.00 Dr") === null, String(paise("25,000.00 Dr")));

  // A FIGURE THAT DRIFTS IN FLOATS READS AS ITS EXACT INTEGER. Measured over
  // 400,000 random two-decimal figures up to ₹400 Cr, about one in ten is not
  // an integer after `× 100` — this is one of them, and it drifts DOWN
  // (2012588707.9999998), so a truncation loses a paisa rather than gaining
  // one. Every figure THIS delivery prints happens to be exact, so without
  // this case the round in `paise` has nothing in the suite to fire on.
  ok("a figure that drifts when multiplied reads as its exact paise",
    paise("2,01,25,887.08") === 2012588708, String(paise("2,01,25,887.08")));
  // AND A FIGURE PRINTED WITH MORE THAN TWO DECIMALS IS REFUSED RATHER THAN
  // ROUNDED INTO SHAPE. Three decimals in a money column is a column something
  // else has leaked into, and rounding publishes a figure no bank printed.
  ok("three printed decimals are refused, not rounded",
    paise("1,234.567") === null, String(paise("1,234.567")));
  ok("…and a sub-paise figure is never a measured zero",
    paise("0.001") === null, String(paise("0.001")));
  ok("a whole-rupee figure printed with no decimals still reads",
    paise("1234") === 123400, String(paise("1234")));

  ok("HDFC's dd/mm/yy reads", toIso("01/04/26") === "2026-04-01", String(toIso("01/04/26")));
  ok("ICICI's dd.mm.yyyy reads", toIso("20.06.2026") === "2026-06-20", String(toIso("20.06.2026")));
  ok("a 13th month is refused", toIso("01/13/26") === null, String(toIso("01/13/26")));
  ok("a narration is not a date", toIso("NEFT DR-TEST") === null);
}

// ── 2. NARRATION, REBUILT FROM ITS OWN WRAPPED CHUNKS ───────────────────────
{
  // HDFC hard-wraps at a fixed width and splits MID-WORD, so the chunks join
  // with nothing. A chunk whose own leading space the grid trimmed away starts
  // a couple of points right of the column's left edge, and that is the only
  // evidence the space was there.
  const flush = [{ x: 68.0, text: "NEFT DR-TESTBANK" }, { x: 68.0, text: "0001-TEST PAYEE" }];
  ok("HDFC's mid-word wrap joins with nothing",
    joinNarration(flush, { wrap: "fixed-width", left: 68.0 }) === "NEFT DR-TESTBANK0001-TEST PAYEE",
    joinNarration(flush, { wrap: "fixed-width", left: 68.0 }));
  const indented = [{ x: 68.0, text: "NEFT DR-TESTBANK" }, { x: 70.0, text: "TEST PAYEE" }];
  ok("…and an indented chunk joins with the space the grid trimmed",
    joinNarration(indented, { wrap: "fixed-width", left: 68.0 }) === "NEFT DR-TESTBANK TEST PAYEE",
    joinNarration(indented, { wrap: "fixed-width", left: 68.0 }));
  // ICICI wraps on PIXEL WIDTH, which breaks at word boundaries and leaves a
  // trailing hyphen where it breaks mid-token.
  const words = [{ x: 192.0, text: "RTGS-TESTREF0002-TEST" }, { x: 192.0, text: "PAYER TWO" }];
  ok("ICICI's word wrap joins with a space",
    joinNarration(words, { wrap: "pixel" }) === "RTGS-TESTREF0002-TEST PAYER TWO",
    joinNarration(words, { wrap: "pixel" }));
  const hyphen = [{ x: 192.0, text: "RTGS-TESTREF-" }, { x: 192.0, text: "0002" }];
  ok("…and joins with nothing after the hyphen it broke on",
    joinNarration(hyphen, { wrap: "pixel" }) === "RTGS-TESTREF-0002",
    joinNarration(hyphen, { wrap: "pixel" }));
  ok("no chunks is an empty narration, never undefined", joinNarration([]) === "");
}

// ── 3. WHICH BANK'S LAYOUT, FROM THE PAGE'S OWN HEADER LABELS ───────────────
{
  ok("HDFC's own labels name HDFC's layout", layoutOf(withCells(hdfc()).pages) === HDFC);
  ok("ICICI's own labels name ICICI's layout", layoutOf(withCells(icici()).pages) === ICICI);
  ok("a page with neither bank's labels names neither",
    layoutOf([{ rows: [row(700, it(36, 60, "SOME OTHER BANK"))] }].map((p) => {
      for (const r of p.rows) r.cells = r.items.map((i) => ({ text: i.text }));
      return p;
    })) === null);
  // THE LETTERHEAD AND THE COLUMNS ARE INDEPENDENT EVIDENCE. A letterhead rule
  // that starts claiming the wrong bank's statements is the failure this book
  // has paid for four times, and a reader that trusts it cannot notice.
  const crossed = run(hdfc(), { docKey: "test-doc", provider: ICICI });
  ok("a letterhead disagreeing with the columns refuses the document",
    crossed.status === "partial" && !crossed.cashFlows?.length, `${crossed.status}`);
  ok("…and says which two readings disagreed",
    /classified .*ICICI.* and the table's own header labels are .*HDFC/.test(detail(crossed, "refused")),
    detail(crossed, "refused"));
  ok("…while a letterhead that agrees reads",
    run(hdfc(), { docKey: "test-doc", provider: HDFC }).status === "ok");

  // A LETTERHEAD NAMING A BANK THIS READER DOES NOT READ IS THE SAME
  // DISAGREEMENT, and the first draft of that condition skipped it: it compared
  // only where the classifier's answer was one of this reader's two, so a
  // document the `byText` backstop typed `bank-statement` and `genericProvider`
  // then named for a third bank was archived under whichever layout its columns
  // resembled — a statement filed under a bank that did not issue it.
  const third = run(hdfc(), { docKey: "test-doc", provider: "Kotak Mahindra Bank" });
  ok("a letterhead naming a third bank refuses the document",
    third.status === "partial" && !third.cashFlows?.length, `${third.status}`);
  ok("…and says that bank is neither this reader reads",
    /classified Kotak Mahindra Bank, which is neither bank this reader reads/
      .test(detail(third, "refused")), detail(third, "refused"));
}

// ── 4. THE HDFC STATEMENT READS, AND EVERY FIGURE IS THE ONE IT PRINTS ──────
const h = run(hdfc());
{
  ok("the HDFC statement reads", h.status === "ok", `${h.status} · ${codes(h).join(", ")} · ${failed(h)}`);
  ok("its provider is the layout's, not the letterhead's", h.provider === HDFC, String(h.provider));
  ok("its account is the one the page prints", h.accountNo === "50100000000001", String(h.accountNo));
  ok("its report type is this reader's", h.reportType === REPORT_TYPE, String(h.reportType));
  ok("its as-of is the window's end", h.asOf === "2026-06-30", String(h.asOf));
  ok("it carries no holding", Array.isArray(h.holdings) && h.holdings.length === 0);
  ok("…and no totals, because a bank statement strikes none", h.totals === null);
  ok("all four rows are read", h.cashFlows?.length === 4, String(h.cashFlows?.length));

  const f = h.cashFlows ?? [];
  ok("a withdrawal is money out", f[0]?.amount === -25000 && f[0]?.debit === 25000 && f[0]?.credit === null,
    JSON.stringify([f[0]?.amount, f[0]?.debit, f[0]?.credit]));
  ok("a deposit is money in", f[1]?.amount === 10500.5 && f[1]?.credit === 10500.5 && f[1]?.debit === null,
    JSON.stringify([f[1]?.amount, f[1]?.credit, f[1]?.debit]));
  ok("every row carries its own printed balance",
    f.map((r) => r.balance).join(",") === "75000,85500.5,77500.5,85500.5",
    f.map((r) => r.balance).join(",") || "(no rows)");
  ok("every row carries the statement's own value date",
    f.length === 4 && f.every((r) => r.valueDate) && f[0]?.valueDate === "2026-04-01",
    JSON.stringify(f.map((r) => r.valueDate)));
  ok("every row carries its reference", f[0]?.reference === "N001000001", String(f[0]?.reference));
  ok("the kind is this reader's and is not a PMS bank book",
    f.every((r) => r.kind === CASH_FLOW_KIND) && CASH_FLOW_KIND !== "bank-book");
  // A NARRATION IS NOT A DATE COLUMN'S OVERFLOW. The Narration LABEL sits at
  // x≈144 and its DATA at x≈68, so boundaries drawn midway between the LABELS
  // would put the first forty characters of every narration in the Date column.
  ok("a narration is the whole narration", f[0]?.description === "NEFT DR-TESTBANK0001-PAY",
    JSON.stringify(f[0]?.description));

  ok("the flows carry the printed opening", h.flows?.openingBalance === 100000, String(h.flows?.openingBalance));
  ok("…the printed debits and credits", h.flows?.debits === 33000 && h.flows?.credits === 18500.5,
    JSON.stringify([h.flows?.debits, h.flows?.credits]));
  ok("…the printed closing", h.flows?.closingBalance === 85500.5, String(h.flows?.closingBalance));
  ok("…and the window it covers", h.flows?.periodFrom === "2026-04-01" && h.flows?.periodTo === "2026-06-30",
    JSON.stringify([h.flows?.periodFrom, h.flows?.periodTo]));
  // A BANK STATEMENT IS NOT CAPITAL AND ITS BALANCE IS NOT CASH. Neither field
  // is set, so no figure here can reach a contribution total or a Cash row by a
  // field name alone.
  ok("it is not read as capital", h.flows?.contribution == null && h.flows?.withdrawal == null,
    JSON.stringify([h.flows?.contribution, h.flows?.withdrawal]));
  ok("it is excluded from the book, with a reason naming Cash",
    /Cash/.test(h.excludedFromBook ?? "") && /in no total/.test(h.excludedFromBook ?? ""),
    String(h.excludedFromBook).slice(0, 80));
  ok("…and says whose question the balance is",
    /the family's\s+to answer/.test(h.excludedFromBook ?? ""), String(h.excludedFromBook).slice(-60));

  ok("the tape sheet is named for the report type", !!h.sections?.[REPORT_TYPE]);
  ok("…with one row per movement plus its header", h.sections?.[REPORT_TYPE]?.rows?.length === 5,
    String(h.sections?.[REPORT_TYPE]?.rows?.length));
  ok("the summary sheet names the source of every figure",
    (h.sections?.summary?.rows ?? []).filter((r) => r[2] === "printed").length === 6,
    JSON.stringify((h.sections?.summary?.rows ?? []).map((r) => r[2])));
  ok("…and names the checks that passed",
    /running balance/.test(String((h.sections?.summary?.rows ?? []).find((r) => r[0] === "Checks passed")?.[1])),
    String((h.sections?.summary?.rows ?? []).find((r) => r[0] === "Checks passed")?.[1]));
}

// ── 5. A CONTINUATION LINE IS THE ROW ABOVE IT, ACROSS A PAGE BREAK ─────────
{
  // HDFC wraps a long narration onto a line with NO DATE and no figures, and it
  // can fall on the next page. Read as a row of its own it is a movement the
  // bank never made; dropped, it is half a narration.
  const g = hdfc();
  const rows = g.pages[0].rows;
  const i = rows.indexOf(rowWith(g, "NEFT DR-TESTBANK0001-PAY"));
  rows.splice(i + 1, 0, row(568.0, it(68.0, 60.0, "MENT TO TEST VENDOR")));
  const d = run(g);
  ok("a continuation line joins the row above it", d.cashFlows?.length === 4, String(d.cashFlows?.length));
  ok("…with no space where the wrap split mid-word",
    d.cashFlows?.[0]?.description === "NEFT DR-TESTBANK0001-PAYMENT TO TEST VENDOR",
    JSON.stringify(d.cashFlows?.[0]?.description));
  ok("…and the tape still reconciles", d.status === "ok", failed(d));

  // ACROSS A PAGE BREAK: the break falls between a movement's dated line and the
  // line continuing its narration, so page two reprints the column header, opens
  // with that continuation, and then carries the rest of the tape.
  //
  // THE REST OF THE TAPE IS WHAT MAKES IT A PAGE. `findTable` measures a table's
  // columns from the data rows of its own body, so a page whose entire body is
  // one narration fragment has nothing to measure: which column that fragment
  // sits in is unknown, and the reader refuses the page rather than guessing.
  // That is the right answer and not the case under test — a bank breaks a page
  // because there is more tape to print, so a page two carrying a wrap and
  // nothing else is not a page any of these statements prints.
  const g2 = hdfc();
  const r2 = g2.pages[0].rows;
  const cut = r2.indexOf(rowWith(g2, "NEFT CR-TESTBANK0002-RECEIPT"));
  g2.pages = [
    { rows: r2.slice(0, cut + 1) },
    { rows: [hdfcHeader(596.0), row(576.0, it(68.0, 60.0, "S FROM TEST PAYER TWO")), ...r2.slice(cut + 1)] },
  ];
  const d2 = run(g2);
  ok("a continuation crossing a page break joins the row above it",
    d2.cashFlows?.length === 4 &&
      d2.cashFlows?.[1]?.description === "NEFT CR-TESTBANK0002-RECEIPTS FROM TEST PAYER TWO",
    `${d2.cashFlows?.length} · ${JSON.stringify(d2.cashFlows?.[1]?.description)}`);
  ok("…and that tape reconciles too", d2.status === "ok", failed(d2));

  // AN INDENTED CONTINUATION BEGAN WITH A SPACE THE GRID TRIMMED AWAY, and the
  // row above it must get that space back. Flush with the narration column's own
  // left edge the chunk continues the word above (the case two assertions up);
  // indented from it, the statement printed two words and `… THIRD PARTY …` came
  // back as `… THIRDPARTY …`. `joinNarration` makes no decision about its own
  // first chunk, there being nothing before it to join to, so the row above has
  // to ask the same question of it — which is `startsWord` and `leadX`.
  const g3 = hdfc();
  const r3 = g3.pages[0].rows;
  const j = r3.indexOf(rowWith(g3, "UPI-TEST PAYEE-TESTUPI"));
  r3.splice(j + 1, 0, row(536.0, it(72.0, 60.0, "THIRD PARTY TRANSFER")));
  const d3 = run(g3);
  ok("an indented continuation keeps the space the grid trimmed",
    d3.cashFlows?.[2]?.description === "UPI-TEST PAYEE-TESTUPI THIRD PARTY TRANSFER",
    JSON.stringify(d3.cashFlows?.[2]?.description));
  ok("…and that tape reconciles too", d3.status === "ok", failed(d3));

  // A DATELESS ROW CARRYING MONEY IS NOT A CONTINUATION — it is a movement whose
  // date the reader failed to read, and appending it to the row above would lose
  // its amount while the running balance went on tying. It refuses the document.
  const g4 = hdfc();
  const r4 = g4.pages[0].rows;
  const k = r4.indexOf(rowWith(g4, "IMPS CR-TESTBANK0003-REFUND"));
  r4.splice(k + 1, 0, row(520.0,
    it(68.0, 80.0, "NEFT CR-TESTBANK0004-LATE"), atRight(RIGHT.deposit, "5,000.00")));
  const d4 = run(g4);
  ok("a dateless row carrying money refuses the document",
    d4.status !== "ok" && /every row with an amount carries a date/.test(failed(d4)), failed(d4));
  ok("…and the refusal prints the row's own cells and the amount it carried",
    /deposit 5,000\.00/.test(failed(d4)) && /NEFT CR-TESTBANK0004-LATE/.test(failed(d4)), failed(d4));
  ok("…and it is never appended to the narration above it",
    !/LATE/.test(JSON.stringify(d4.cashFlows ?? [])), JSON.stringify(d4.cashFlows?.[3]?.description));

  // A CONTINUATION CARRYING A FIGURE INSIDE ITS NARRATION IS STILL A
  // CONTINUATION. The test is on the three MONEY columns and not on every
  // parseable cell, because a wrap legitimately carries a cheque number, an
  // IFSC or a UTR — refusing on any parseable cell would refuse a tape over a
  // reference number.
  const g5 = hdfc();
  const r5 = g5.pages[0].rows;
  const m = r5.indexOf(rowWith(g5, "NEFT DR-TESTBANK0001-PAY"));
  r5.splice(m + 1, 0, row(568.0, it(72.0, 60.0, "REF 0000123456")));
  const d5 = run(g5);
  ok("a continuation carrying a reference number is still a continuation",
    d5.status === "ok" && d5.cashFlows?.length === 4
      && d5.cashFlows?.[0]?.description === "NEFT DR-TESTBANK0001-PAY REF 0000123456",
    `${d5.status} · ${JSON.stringify(d5.cashFlows?.[0]?.description)}`);
}

// ── 6. THE ICICI STATEMENT, AND A DERIVED OPENING LABELLED AS DERIVED ───────
const i = run(icici());
{
  ok("the ICICI statement reads", i.status === "ok", `${i.status} · ${codes(i).join(", ")} · ${failed(i)}`);
  ok("its provider is ICICI's", i.provider === ICICI, String(i.provider));
  ok("all three rows are read", i.cashFlows?.length === 3, String(i.cashFlows?.length));
  ok("its serials are read", i.cashFlows?.length === 3 && i.sections?.[REPORT_TYPE]?.rows?.length === 4);
  ok("a large balance is the balance the row prints",
    (i.cashFlows ?? []).map((r) => r.balance).join(",") === "150000,225000.25,200000",
    (i.cashFlows ?? []).map((r) => r.balance).join(",") || "(no rows)");
  // ICICI'S PDF PRINTS NO VALUE DATE. Null is "the statement printed none",
  // which is what the archive records rather than repeating the transaction
  // date into a column the bank left empty.
  ok("no value date is repeated from the transaction date",
    (i.cashFlows ?? []).every((r) => r.valueDate === undefined || r.valueDate === null),
    JSON.stringify((i.cashFlows ?? []).map((r) => r.valueDate)));
  ok("its remarks are whole", i.cashFlows?.[1]?.description === "RTGS-TESTREF0002-TEST PAYER TWO",
    JSON.stringify(i.cashFlows?.[1]?.description));
  ok("a cheque number is its reference", i.cashFlows?.[1]?.reference === "000123",
    String(i.cashFlows?.[1]?.reference));

  // THE OPENING IS DERIVED, AND IS LABELLED DERIVED EVERYWHERE IT APPEARS. A
  // figure the statement did not print must never read as one it did.
  ok("the derived opening is warned about", codes(i).includes("opening-balance-derived"), codes(i).join(", "));
  ok("…naming what it was derived from",
    /first row's own printed balance/.test(detail(i, "opening-balance-derived")),
    detail(i, "opening-balance-derived"));
  ok("…and is NOT carried into the flows as a printed opening",
    i.flows?.openingBalance === null, String(i.flows?.openingBalance));
  ok("…while the summary sheet carries it, labelled derived",
    (i.sections?.summary?.rows ?? []).some((r) => r[0] === "Opening balance" && r[2] === "derived from the first row"),
    JSON.stringify((i.sections?.summary?.rows ?? []).find((r) => r[0] === "Opening balance")));
  ok("the closing balance is the last row's own", i.flows?.closingBalance === 200000,
    String(i.flows?.closingBalance));
  ok("no debit or credit total is invented", i.flows?.debits === null && i.flows?.credits === null,
    JSON.stringify([i.flows?.debits, i.flows?.credits]));
  // FOUR CHECKS ARE NOT APPLICABLE AND NONE IS REPORTED AS A PASS. A run saying
  // "6 of 6 checks passed" over a statement that printed two of them has told
  // the reader nothing.
  const notApplicable = String((i.sections?.summary?.rows ?? []).find((r) => r[0] === "Checks not applicable")?.[1]);
  ok("the checks the statement cannot support are named, not passed",
    /debits total/.test(notApplicable) && /credits total/.test(notApplicable)
    && /debit count/.test(notApplicable) && /credit count/.test(notApplicable), notApplicable);
  ok("…and the running balance is still checked, on the derived opening",
    /running balance \(opening derived\)/.test(
      String((i.sections?.summary?.rows ?? []).find((r) => r[0] === "Checks passed")?.[1])),
    String((i.sections?.summary?.rows ?? []).find((r) => r[0] === "Checks passed")?.[1]));

  // THE SERIAL CHECK IS ON WHETHER THE LAYOUT MATCHED THE COLUMN, never on
  // whether every cell in it parsed. Gated on the cells, ONE unreadable serial
  // turned the check off — on exactly the document that needed it, since a
  // serial that does not parse is a column the reader lost its grip on, and the
  // tape then published with the one check that can see a dropped row silently
  // not applicable.
  ok("ICICI's serials ARE checked", /serial numbers run 1\.\.N/.test(
    String((i.sections?.summary?.rows ?? []).find((r) => r[0] === "Checks passed")?.[1])),
    String((i.sections?.summary?.rows ?? []).find((r) => r[0] === "Checks passed")?.[1]));
  const gs = icici();
  itemOf(gs, "2").text = "-";
  const ds = run(gs);
  ok("an unreadable serial cell refuses the document rather than turning the check off",
    ds.status !== "ok" && /serial numbers run 1\.\.N/.test(failed(ds)), `${ds.status} · ${failed(ds)}`);
  ok("…naming the row it could not number", /row 2 is numbered nothing/.test(failed(ds)), failed(ds));

  // A DATELESS ROW CARRYING MONEY, ON ICICI'S LAYOUT TOO. The gate's own case
  // further down calls `tieOut` directly, and the HDFC case in section 5 drives
  // one reader; this is the other reader's branch, which is byte-identical and
  // therefore the one a copy-and-paste edit breaks without the suite noticing.
  // Nothing else may fire on it: the orphan is skipped before it becomes a row,
  // so rows 1..3 still reconcile and still run 1..N.
  const io_ = icici();
  io_.pages[0].rows.push(row(608.0,
    it(192.0, 120.0, "RTGS-TESTREF0004-LATE PAYER"), atRight(519.0, "9,000.00")));
  const dl = run(io_);
  ok("a dateless row carrying a deposit refuses ICICI's tape as well",
    dl.status !== "ok" && /every row with an amount carries a date/.test(failed(dl)),
    `${dl.status} · ${failed(dl)}`);
  ok("…and the failure prints what it carried", /deposit 9,000\.00/.test(failed(dl)), failed(dl));
  ok("…and it is the only check that fires on it",
    !/running balance|serial numbers/.test(failed(dl)), failed(dl));
  ok("…and the row never reaches the narration above it",
    !/LATE PAYER/.test(JSON.stringify(dl.cashFlows ?? [])),
    JSON.stringify((dl.cashFlows ?? []).map((f) => f.description)));

  // A PAGE WHOSE TABLE DID NOT RESOLVE, AT THE READER'S END. The gate's own
  // case in section 7 hands `tieOut` a constructed `skipped`; this drives the
  // half that FINDS one — `movementsOn` and the push in `readIcici` — which is
  // what a statement running to more than one page actually meets. The second
  // page below reprints its header in a spelling `ICICI_COLUMNS` does not know,
  // so the table does not resolve, and it carries two real movements under it.
  //
  // Nothing else can see it, which is the whole reason §0b exists: ICICI prints
  // no opening, no closing and no totals, so the opening is DERIVED from the
  // first row the reader kept and the closing COPIED from the last, both of
  // which move with the truncation — and with the lost page LAST, the retained
  // serials still run 1..3. Every enabled check passes over a tape missing a
  // page.
  const lost2 = icici();
  lost2.pages.push({ rows: [
    row(676.0,
      it(30.0, 30.0, "Sr"), it(61.4, 70.0, "Txn Dt"), it(142.9, 46.0, "Chq"),
      it(192.0, 110.0, "Particulars"), it(410.0, 60.0, "Debit"),
      it(480.0, 46.0, "Credit"), it(525.9, 46.0, "Bal")),
    iciciRow(656.0, { serial: 4, date: "25.06.2026", remarks: "NEFT-TESTREF0004-TEST PAYEE FOUR",
      withdrawal: "30,000.00", balance: "170,000.00" }),
    iciciRow(640.0, { serial: 5, date: "28.06.2026", remarks: "UPI/TESTREF0005/TEST PAYER FIVE",
      deposit: "10,000.00", balance: "180,000.00" }),
  ] });
  const dp = run(lost2);
  ok("a page whose table did not resolve, carrying movements, refuses ICICI's tape",
    dp.status !== "ok" && /every page carrying a movement was read/.test(failed(dp)),
    `${dp.status} · ${failed(dp)}`);
  ok("…naming the page and both rows it could not read",
    /2 row\(s\) on 1 page\(s\)/.test(failed(dp))
      && /TEST PAYEE FOUR/.test(failed(dp)) && /TEST PAYER FIVE/.test(failed(dp)), failed(dp));
  ok("…and it is LOAD-BEARING: the tape it refuses reconciles with itself",
    !/running balance|serial numbers|closing balance/.test(failed(dp)), failed(dp));
  ok("…and nothing of that page is published",
    !(dp.cashFlows ?? []).length, String((dp.cashFlows ?? []).length));

  // AND A PAGE THAT CARRIES NO MOVEMENT IS NOT A TRUNCATION. A notes page, a
  // page of prose, a closing sentence at the foot — the reader skips its table
  // and the document publishes, because there was nothing on it to lose.
  // Refusing on that would refuse a statement over its own boilerplate.
  //
  // THE TEST IS TWO FIGURES AND NOT ONE, AND THIS IS WHAT MAKES THE DIFFERENCE
  // VISIBLE. The page below carries a DATE AND ONE AMOUNT — which is the shape
  // of every closing sentence and charges line a bank prints — where a movement
  // prints its balance beside its withdrawal or its deposit. A first draft of
  // this case carried prose and a page number, so it had no amount on it at all
  // and the threshold had nothing in the suite to fire on: loosening it to one
  // figure left the whole suite green.
  const notes = icici();
  notes.pages.push({ rows: [
    row(700.0, it(36.0, 300.0, "Closing balance as on 30.06.2026 : 200,000.00")),
    row(680.0, it(36.0, 260.0, "Please examine the entries and report any discrepancy.")),
  ] });
  const dn = run(notes);
  ok("a page carrying a date and one amount is not read as a truncation",
    dn.status === "ok" && dn.cashFlows?.length === 3, `${dn.status} · ${failed(dn)}`);
}

// ── 7. THE GATE, BROKEN ONE FIGURE AT A TIME ────────────────────────────────
//
// Each case changes ONE printed figure and asserts the reader publishes NOTHING
// and names that figure. A partial tape is the failure that matters: 240 of 243
// withdrawals reads exactly like 243.
const GATE = [
  ["a withdrawal misread by one paisa", (g) => { itemOf(g, "25,000.00").text = "25,000.01"; }, /running balance/],
  ["a balance misread", (g) => { itemOf(g, "77,500.50").text = "77,500.00"; }, /running balance/],
  ["the printed opening disagreeing with the rows", (g) => { summaryItem(g, "100,000.00").text = "100,000.01"; }, /running balance/],
  ["the printed debit total disagreeing", (g) => { summaryItem(g, "33,000.00").text = "33,000.01"; }, /debits total/],
  ["the printed credit total disagreeing", (g) => { summaryItem(g, "18,500.50").text = "18,500.51"; }, /credits total/],
  ["the printed closing disagreeing", (g) => { summaryItem(g, "85,500.50").text = "85,500.51"; }, /closing balance/],
  ["a withdrawal read into the deposit column", (g) => {
    const r = rowWith(g, "NEFT DR-TESTBANK0001-PAY");
    const amt = r.items.find((x) => x.text === "25,000.00");
    const w = amt.width; amt.x = RIGHT.deposit - w;
  }, /running balance|credits total|debit count|credit count/],
  ["a row carrying both a withdrawal and a deposit", (g) => {
    const r = rowWith(g, "NEFT DR-TESTBANK0001-PAY");
    r.items.push({ ...atRight(RIGHT.deposit, "25,000.00"), y: r.y });
  }, /one amount side per row/],
];
for (const [label, break_, expect] of GATE) {
  const g = hdfc();
  break_(g);
  const d = run(g);
  ok(`${label} publishes no tape`, d.status === "partial" && (d.cashFlows ?? []).length === 0,
    `${d.status} · ${(d.cashFlows ?? []).length} rows`);
  ok(`…and says so: ${label}`, expect.test(failed(d)), failed(d) || "(no tie-out-failed warning)");
  ok(`…and publishes no flows either: ${label}`, d.flows === undefined || d.flows === null,
    JSON.stringify(d.flows));
  ok(`…while still carrying its summary, so the failure is readable: ${label}`,
    !!d.sections?.summary && !d.sections?.[REPORT_TYPE]);
}

// ── 8. A DR/CR COUNT IS COUNTED OVER THE ROWS THAT MOVED MONEY ──────────────
{
  const g = hdfc();
  summaryItem(g, "2").text = "3";   // the Dr count — the first "2" on the summary row
  const d = run(g);
  ok("a Dr count disagreeing with the rows publishes no tape", d.status === "partial", d.status);
  ok("…and names the count", /debit count/.test(failed(d)), failed(d));
}

// ── 9. A LABEL WITH NO VALUE IS NOT PRINTED, NEVER A NEIGHBOUR'S FIGURE ──
{
  // The summary block prints six labels over six values, and the labels are
  // nowhere near their own columns. Drop ONE value and nearest-centre per
  // label, decided independently, hands `Debits` (centre 360) the Cr count's
  // "2" at 269 — 91pt away against the credit total's 96 — so a figure the bank
  // printed once reaches the archive as two printed primitives, and the debits
  // check then fails against a COUNT OF TRANSACTIONS. Assigned greedily and
  // consuming each value, `Debits` is left with nothing: its figure reads as
  // not printed, which is what it is, and its check is NOT APPLICABLE.
  const g = hdfc();
  const vrow = rowWith(g, "100,000.00");
  const i = vrow.items.findIndex((x) => x.text === "33,000.00");
  vrow.items.splice(i, 1);
  const d = run(g);
  const srows = d.sections?.summary?.rows ?? [];
  const src = (figure) => srows.find((r) => r[0] === figure)?.[2];
  const val = (figure) => srows.find((r) => r[0] === figure)?.[1];
  const na = String(srows.find((r) => r[0] === "Checks not applicable")?.[1] ?? "");

  ok("a summary value the statement did not print still publishes the tape",
    d.status === "ok" && (d.cashFlows ?? []).length === 4,
    `${d.status} · ${(d.cashFlows ?? []).length} rows · ${failed(d)}`);
  ok("…and the unmatched label carries no figure", d.flows?.debits == null, String(d.flows?.debits));
  ok("…which the summary sheet names as not printed", src("Debits") === "not printed",
    JSON.stringify(srows.map((r) => [r[0], r[2]])));
  ok("…and its check is not applicable rather than failed",
    /debits total/.test(na) && !/debits total/.test(failed(d)), `${na} — ${failed(d)}`);
  // THE HALF THAT CATCHES THE DEFECT, and it has to name the empty cell as well
  // as the full ones: every other label still reads correctly under the
  // independent assignment, so an assertion over those alone cannot fail. What
  // moves is `Debits`, which prints 2.00 — the Cr COUNT, read as a rupee total.
  ok("…and no label takes a neighbour's figure",
    val("Debits") === "—" && val("Dr count") === 2 && val("Cr count") === 2
      && val("Credits") === "18500.50" && val("Opening balance") === "100000.00"
      && val("Closing balance") === "85500.50",
    JSON.stringify([val("Opening balance"), val("Dr count"), val("Cr count"),
      val("Debits"), val("Credits"), val("Closing balance")]));
  ok("…so the sheet names five printed figures where the statement printed five",
    srows.filter((r) => r[2] === "printed").length === 5,
    JSON.stringify(srows.map((r) => r[2])));
}

// ── 10. THE GATE ITSELF, ON CONSTRUCTED ROWS ─────────────────────────────────
//
// `tieOut` is called by the reader on what it read; these cases call it
// directly, so a check can be shown LOAD-BEARING rather than merely present.
{
  const rows = [
    { serial: 1, date: "2026-04-01", debit: 2500000, credit: null, balance: 7500000 },
    { serial: 2, date: "2026-04-15", debit: null, credit: 1050050, balance: 8550050 },
  ];
  const printed = { opening: 10000000, debits: 2500000, credits: 1050050, closing: 8550050, drCount: 1, crCount: 1 };
  const g = tieOut(rows, printed);
  ok("a reconciling tape passes every check", g.ok && g.failures.length === 0, g.failures.join(" | "));
  // TWO CHECKS ARE NOT-APPLICABLE ON A TAPE THAT RECONCILES, and neither is
  // counted as a pass — this gate's whole third outcome, see check 6. The
  // serial one, because a layout printing no serial column prints nothing to
  // run 1..N; and the page scan, because a caller that passes no `skipped`
  // examined no page, and naming it as passed is what that check did on its
  // first draft.
  ok("…and the two checks it cannot make are the serial one and the page scan",
    g.notApplicable.length === 2 && g.notApplicable.some((n) => /serial/.test(n))
      && g.notApplicable.some((n) => /^every page carrying a movement was read/.test(n)),
    g.notApplicable.join(" | "));
  ok("…and it names the eight it passed", g.passed.length === 8, g.passed.join(" · "));
  ok("…which are the eight the statement's own figures support",
    g.passed.join(" · ") === "every row with an amount carries a date · one amount side per row"
      + " · running balance · debits total · credits total"
      + " · debit count · credit count · closing balance", g.passed.join(" · "));

  // NO ROWS IS A FAILURE, NEVER A PASS. A gate that passed over an empty table
  // would publish an empty tape as a complete one — `golden.mjs`'s rule.
  const empty = tieOut([], printed);
  ok("no rows is a failure", !empty.ok && /located no dated row/.test(empty.failures.join(" ")),
    empty.failures.join(" | "));

  // A STATEMENT THAT PRINTS NOTHING TO COMPARE AGAINST CANNOT PASS A CHECK IT
  // DID NOT MAKE.
  const bare = tieOut(rows, { opening: null, debits: null, credits: null, closing: null, drCount: null, crCount: null });
  ok("a statement printing no figures passes only the two checks its rows support",
    bare.ok && bare.passed.join(" · ") === "every row with an amount carries a date · one amount side per row",
    bare.passed.join(" · "));
  ok("…and names the eight it could not make", bare.notApplicable.length === 8, bare.notApplicable.join(" | "));

  // THE SERIAL CHECK: a dropped row is a hole in a sequence rather than a silent
  // absence, which is the only thing that makes ICICI's layout checkable in a
  // way HDFC's is not.
  const gapped = [rows[0], { ...rows[1], serial: 3 }];
  const s = tieOut(gapped, printed, { serials: true });
  ok("a gap in the serials is a failure", !s.ok && /serial numbers run 1\.\.N/.test(s.failures.join(" ")),
    s.failures.join(" | "));
  const withSerials = tieOut(rows, printed, { serials: true });
  ok("…and a complete sequence passes", withSerials.ok, withSerials.failures.join(" | "));
  ok("…as a ninth check, named", withSerials.passed.length === 9
    && withSerials.passed.includes("serial numbers run 1..N"), withSerials.passed.join(" · "));
  ok("…while a layout with no serial column is named not-applicable, never passed",
    tieOut(rows, printed).notApplicable.some((n) => /serial/.test(n))
      && !tieOut(rows, printed).passed.some((n) => /serial/.test(n)));

  // A MATCHED SERIAL COLUMN WITH AN UNREADABLE CELL IS A FAILURE, NOT A SILENT
  // ABSENCE. `serials` is whether the LAYOUT matched the column; gated on the
  // cells instead, one unparseable serial turned the check off on exactly the
  // document that needed it — a serial that does not parse is a column the
  // reader lost its grip on.
  const nullSerial = tieOut([rows[0], { ...rows[1], serial: null }], printed, { serials: true });
  ok("a matched serial column with an unreadable cell fails",
    !nullSerial.ok && /row 2 is numbered nothing/.test(nullSerial.failures.join(" ")),
    nullSerial.failures.join(" | "));

  // CHECK 0: A ROW CARRYING AN AMOUNT AND NO DATE REFUSES THE WHOLE DOCUMENT,
  // and the failure carries the row's own cells. None of the checks below it can
  // see one: a row lost from the end of an ICICI tape leaves an opening derived
  // from the first row the reader kept, a closing copied from the last and
  // serials that still run 1..N — a tape that reconciles with itself and is
  // short.
  const orphaned = tieOut(rows, printed, {
    orphans: [{ cells: ["", "NEFT CR HDFC", "", "1,00,000.00", "1,85,500.50"], carried: ["deposit 1,00,000.00"] }],
  });
  ok("a row with an amount and no date refuses the document",
    !orphaned.ok && /every row with an amount carries a date/.test(orphaned.failures.join(" ")),
    orphaned.failures.join(" | "));
  ok("…and the failure prints the row's own cells and what it carried",
    /deposit 1,00,000\.00/.test(orphaned.failures.join(" "))
      && /NEFT CR HDFC/.test(orphaned.failures.join(" ")), orphaned.failures.join(" | "));
  ok("…and it is load-bearing: every other check passes on the same tape",
    orphaned.failures.length === 1, orphaned.failures.join(" | "));

  // CHECK 0b: A PAGE WHOSE TABLE DID NOT RESOLVE, CARRYING A MOVEMENT, REFUSES
  // THE WHOLE DOCUMENT — §0 one level up, and for the same reason: on ICICI
  // every row on that page is lost while the derived opening, the copied
  // closing and the retained serials all move with the loss, so no check below
  // can see it. `[]` is "every page was examined and none carried one", which
  // is this check being MADE; `null` is a caller that examined none, named
  // not-applicable above.
  const lost = tieOut(rows, printed, {
    skipped: [{ page: 3, cells: ["12", "05/05/2026", "NEFT DR ICICI", "2,50,000.00", "", "60,50,050.00"] }],
  });
  ok("a page the table did not resolve, carrying a movement, refuses the document",
    !lost.ok && /every page carrying a movement was read/.test(lost.failures.join(" ")),
    lost.failures.join(" | "));
  ok("…and the failure prints the page and the row's own cells",
    /page 3/.test(lost.failures.join(" ")) && /NEFT DR ICICI/.test(lost.failures.join(" ")),
    lost.failures.join(" | "));
  ok("…and it is load-bearing: every other check passes on the same tape",
    lost.failures.length === 1, lost.failures.join(" | "));
  const scanned = tieOut(rows, printed, { skipped: [] });
  ok("…while a run that examined every page and found none passes it",
    scanned.ok && scanned.passed.includes("every page carrying a movement was read"),
    scanned.passed.join(" · "));

  // A ROW THAT MOVED NOTHING is carried and counted as neither a debit nor a
  // credit — the running balance is what proves it.
  const nil = [
    { serial: 1, date: "2026-04-01", debit: 0, credit: 0, balance: 10000000 },
    ...rows,
  ];
  const n = tieOut(nil, printed, { serials: false });
  ok("a row printing 0.00 on both sides is carried, not refused", n.ok, n.failures.join(" | "));

  // A ROW WITH NO BALANCE BREAKS THE CHAIN rather than carrying forward: a
  // balance the reader could not read must not be filled in from its own
  // arithmetic, which would make the check agree with itself.
  const noBal = [rows[0], { ...rows[1], balance: null }];
  const nb = tieOut(noBal, { ...printed, closing: 7500000 });
  ok("a row with no balance is named rather than filled in",
    /prints no balance/.test(nb.failures.concat(nb.passed).join(" ")) || !nb.ok,
    `${nb.ok} · ${nb.failures.join(" | ")}`);
}

// ── 11. REFUSALS THAT ARE NOT TIE-OUTS ──────────────────────────────────────
{
  const none = extract({ grid: { pages: [] }, meta: { docKey: "test-doc" } });
  ok("a document with no pages is refused", none.status === "failed" && codes(none).includes("no-pages"),
    `${none.status} · ${codes(none).join(", ")}`);

  const generic = withCells({ pages: [{ rows: [
    row(700, it(36, 120, "SOME OTHER INSTITUTION")),
    row(660, it(36, 40, "Date"), it(200, 60, "Something"), it(400, 40, "Amount")),
  ] }] });
  const d = extract({ grid: generic, meta: { docKey: "test-doc" } });
  ok("a page naming neither bank's layout is refused", d.status === "partial", d.status);
  ok("…and says the header labels named neither", /names? neither bank's layout/.test(detail(d, "refused")),
    detail(d, "refused"));
  ok("…and publishes nothing", (d.cashFlows ?? []).length === 0 && !Object.keys(d.sections ?? {}).length);
  // EVEN A REFUSED DOCUMENT IS EXCLUDED FROM THE BOOK WITH ITS REASON, so a
  // reader of the report is told what it is as well as that it did not read.
  ok("…while still naming what it is", /savings-account statement/.test(d.excludedFromBook ?? ""));
}

// ── 12. THE SHAPES THE PIPELINE READS ───────────────────────────────────────
{
  // `reconcile.mjs` renders every warning as `${w.code}: ${w.detail}` and
  // `extract.mjs` matches `w.code`. A string reads `undefined: undefined` there.
  const all = [h, i, run(hdfc(), { docKey: "test-doc", provider: ICICI }),
    extract({ grid: { pages: [] }, meta: {} })];
  ok("every warning carries a code and a detail",
    all.every((d) => (d.warnings ?? []).every((w) => typeof w?.code === "string" && typeof w?.detail === "string")),
    JSON.stringify(all.flatMap((d) => (d.warnings ?? []).map((w) => typeof w))));
  ok("both providers are registered under their own names",
    PROVIDER.length === 2 && PROVIDER.includes(HDFC) && PROVIDER.includes(ICICI));
  ok("the report type and the cash-flow kind are the same word",
    REPORT_TYPE === CASH_FLOW_KIND && REPORT_TYPE === "bank-statement");
  ok("every column is matched by a label pattern, never an index",
    Object.values(HDFC_COLUMNS).concat(Object.values(ICICI_COLUMNS))
      .every((pats) => Array.isArray(pats) && pats.length && pats.every((p) => p instanceof RegExp)));
}

// ── 13. WHICH DOCUMENT THE CLASSIFIER SAYS THIS IS ──────────────────────────
//
// THE READER IS NEVER REACHED UNLESS THE CLASSIFIER NAMES THE BANK, and the one
// thing that stops it is a NARRATION. Both seeded house matchers and
// `ISSUER_PROVIDER_RULES` read a manager's name out of the WHOLE text, and a
// savings statement's narrations are nothing but the names of whoever the
// family paid: measured on the real HDFC 0394 text, `genericProvider` returned
// "V.E.C Assago Capital Management LLP" for a bank statement. Filed under a PMS
// house, those rows reach the PMS reader, whose transaction statement reads a
// security name out of the column a narration sits in.
//
// So this section is struck on `classify()` rather than on the reader, and its
// fixtures are a statement's own COLUMN LABELS plus an invented narration that
// names a manager this book carries. Nothing below reads a customer id, an
// email or a holder, because neither predicate does.
{
  const hdfcText = [
    "Statement From : 01/04/26 To : 30/06/26",
    "Account No : 50100000000001",
    "Date Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance",
    "01/04/26 NEFT DR-TESTBANK0001-V.E.C ASSAGO CAPITAL MANAGEMENT LLP 01/04/26 25,000.00 75,000.00",
    "Opening Balance Dr Count Cr Count Debits Credits Closing Bal",
  ].join("\n");
  // FROM A KNOWN COUNT, because the guards' counters are module state and the
  // claim below is that neither matcher was REACHED.
  resetBankGuardCounts();
  const h = classify({ fileName: "statement.pdf", text: hdfcText });
  ok("an HDFC savings statement is named by its bank", h.provider === HDFC, String(h.provider));
  ok("…and not by the manager its narration names",
    !/V\.E\.C|Assago/i.test(String(h.provider)), String(h.provider));
  ok("…its report type is this reader's", h.reportType === REPORT_TYPE, String(h.reportType));
  ok("…its account is the labelled one", h.accountNo === "50100000000001", String(h.accountNo));
  ok("…its as-of is the period's To", h.asOfDate === "2026-06-30", String(h.asOfDate));
  ok("…and it attributes the statement to no holder",
    h.ownerName === null, String(h.ownerName));

  const iciciText = [
    "Statement From : 01.04.2026 To : 30.06.2026",
    "Account Number : 032001510380",
    "S No Tran Date Cheque Transaction Remarks Withdrawal Amt Deposit Amt Balance",
    "1 20.06.2026 - RTGS-TESTREF0001-GOLDSTANDARD WEALTH PRIVATE LIMITED 25,000.00 75,000.00",
  ].join("\n");
  const i = classify({ fileName: "statement.pdf", text: iciciText });
  ok("an ICICI savings statement is named by its bank", i.provider === ICICI, String(i.provider));
  ok("…and not by the house its remark names",
    !/Goldstandard/i.test(String(i.provider)), String(i.provider));
  ok("…its report type is this reader's too", i.reportType === REPORT_TYPE, String(i.reportType));

  // NEITHER HOUSE MATCHER WAS EVEN ASKED, which is the stronger claim: the bank
  // branch in `classify()` resolves both of these before `match360One` and
  // `matchGoldstandard` run, so their bank guards are what would hold if that
  // order ever changed rather than what holds today. `extract.mjs` prints these
  // counts on every run, and a non-zero one is that ordering having moved.
  const guards = bankGuardCounts();
  ok("360 ONE's bank guard was never reached — the bank branch resolved first",
    guards.match360One === 0, String(guards.match360One));
  ok("…nor was the PMS house matcher's", guards.matchGoldstandard === 0,
    String(guards.matchGoldstandard));
  ok("…and both would refuse if they were, because both texts read as savings statements",
    isBankStatement(hdfcText) && isBankStatement(iciciText));

  // A PMS BANK BOOK IS A DIFFERENT DOCUMENT AND MUST NOT COLLIDE. It prints one
  // `Dep With` column against the savings pair, and `bank-book` is a live report
  // type with a reader and a precedence entry of its own.
  const bookText = [
    "GOLDSTANDARD WEALTH PRIVATE LIMITED",
    "BANK BOOK",
    "Date Particulars Buy Sell Dep With Income Expenses Balance",
    "01/04/2026 Fund Deposit 25,000.00 75,000.00",
  ].join("\n");
  ok("a PMS bank book is not a savings statement", isBankStatement(bookText) === false);
  ok("…and still resolves to its own house",
    /Goldstandard/i.test(String(classify({ fileName: "bankbook.pdf", text: bookText }).provider)),
    String(classify({ fileName: "bankbook.pdf", text: bookText }).provider));

  // A DEPOSITORY STATEMENT FROM THE SAME BANK IS NOT ONE EITHER. "HDFC Bank" is
  // on the letterhead of a savings statement, an NSDL holding statement and a
  // mutual-fund folio statement in this corpus.
  const nsdlText = [
    "HDFC BANK LIMITED",
    "STATEMENT OF HOLDING",
    "DP Account No : 10000000",
    "ISIN Scrip Name Free Balance Market Rate Market Valuation",
  ].join("\n");
  ok("an NSDL holding statement from the same bank is not a savings statement",
    isBankStatement(nsdlText) === false);

  ok("the report type is one the pipeline knows", REPORT_TYPES.includes(REPORT_TYPE),
    REPORT_TYPES.join(", "));

  // THE READER IS REGISTERED UNDER BOTH NAMES AND UNDER THE TYPE. `extract.mjs`
  // runs its own `main()` at import, so this is struck on its source: the claim
  // is about the wiring rather than about a value, and a reader registered
  // nowhere is a document that reaches no reader at all.
  const wiring = fs.readFileSync(new URL("../extract.mjs", import.meta.url), "utf8");
  ok("the reader is registered for both banks' names",
    /\.\.\.bankStatement\.PROVIDER\.map\(/.test(wiring));
  ok("…and for the report type, so a third bank's layout reaches it",
    /\[bankStatement\.REPORT_TYPE\]:\s*bankStatement/.test(wiring));

  // AND THE GUARD COUNTS ARE PRINTED UNCONDITIONALLY. A count reported only
  // when it is non-zero says nothing on the clean run, which is every run while
  // the order in `classify()` holds — so the line must not sit behind an `if`.
  const printed = wiring.match(/^.*bankGuardCounts\(\).*$/m);
  ok("the run reads the bank-statement guard counts", printed !== null);
  ok("…and prints them unconditionally, so a zero is on screen too",
    printed !== null && /bank-statement guards reached/.test(wiring)
      && !/if\s*\([^)]*guards\./.test(wiring));
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
