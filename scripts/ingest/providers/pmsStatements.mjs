// The PMS statement engine shared by every manager in this book.
//
// Goldstandard Wealth (Aristos), Green Lantern Capital and Carnelian Asset
// Management all issue statements from the SAME reporting system: identical
// filenames (`<code>_<acct>_<ReportType><n>OT (n).pdf`), identical report set,
// identical table layout. So this is one extractor parameterised by provider,
// not three near-copies that would drift apart.
//
// CALIBRATED against the real statements in source/. What that calibration had
// to cope with, all of it verified against the PDFs rather than assumed:
//
//   • The header labels are emitted as ONE text span on some reports —
//     Carnelian prints all nine as a single item, Green Lantern glues
//     "Market ValueGain / Loss (+/-)" together with no space. table.mjs splits
//     them by character offset within the span.
//   • Column corridors are as narrow as 3pt, and on Green Lantern the
//     Gain/Loss-to-%G/L corridor closes completely on the widest row. Columns
//     are therefore refined by RIGHT EDGE (layout.mjs), which is exact for
//     right-aligned money columns.
//   • `Accrued Income` is a sub-header over the Market Value column, and its
//     values print on a SECOND LINE beneath the row they belong to, at the same
//     row spacing as a real row. It cannot be found geometrically; it is
//     recovered as a continuation (see readHoldings).
//   • A long security name WRAPS onto a second line ("Canara Robeco Asset
//     Management" / "Co. Ltd.").
//   • Subtotal rows carry NO label at all — just figures from the Cost column
//     rightwards. The section they close is the last section heading seen.
import { findTable, readRows, findLabelledNumber, toAuditSheet } from "../lib/table.mjs";
import { parseNum, parseNumInfo } from "../lib/parseNum.mjs";
import {
  makeHolding, makeTotals, makeReturnSeries, makeFlows,
  makeTransaction, makeCapitalGain, makeIncomeEvent, makeExpense, makeCashFlow,
} from "../lib/document.mjs";
import { toIso, trimPersonName } from "../lib/classify.mjs";
import { PRECEDENCE } from "../precedence.mjs";

/** Every manager issuing through this reporting system. */
export const PROVIDERS = {
  goldstandard: {
    name: "Goldstandard Wealth Private Limited",
    // The appraisal carries no letterhead; the fact sheet does. The account-code
    // prefix in the filename is the reliable signal across the whole report set.
    filePrefix: /^G\d/,
    letterhead: /goldstandard\s+wealth/i,
    engagement: "PMS",
  },
  greenLantern: {
    name: "Green Lantern Capital LLP",
    filePrefix: /^GLC/,
    letterhead: /green\s+lantern\s+capital/i,
    engagement: "PMS",
  },
  carnelian: {
    name: "Carnelian Asset Management and Advisors Pvt Ltd",
    filePrefix: /^CBP/,
    letterhead: /carnelian\s+asset\s+management/i,
    engagement: "PMS",
  },
  // Delivers the whole report set as ONE eight-page PDF rather than one file per
  // report — fact sheet, CURRENT PORTFOLIO, transaction statement, capital gain,
  // expense statement, back to back. `lib/bundle.mjs` splits it on the title each
  // page reprints, so each report reaches the reader written for it. Read as a
  // single fact sheet it yielded holdings with a market value and no quantity,
  // no unit cost and no price, while pages 2–3 printed all three.
  molecule: {
    name: "Molecule Ventures LLP",
    filePrefix: /^Molecule/i,
    letterhead: /Molecule\s+Ventures/i,
    engagement: "PMS",
  },
  // Prints its own name with the dots (`V.E.C ASSAGO CAPITAL MANAGEMENT LLP`)
  // and files under a SIX-letter client code, `VECBES0004_145052_…`, which is
  // why the shared filename gate in classify.mjs takes 1–8 letters rather than
  // the 1–4 that covered G / GLC / CBP.
  /**
   * Buoyant issues from this system too, under an `I83_` account code — and it
   * is the first manager in the book whose documents come from TWO families.
   * Its own Category III ACCOUNT STATEMENT is a single-scheme AIF statement and
   * belongs to `altFundStatements.mjs`; this set is the house appraisal, fact
   * sheet, capital register, transaction statement and performance history for
   * the same folios. `extract.mjs` routes on the report type — see the note
   * there — so the two do not fight over the provider name.
   *
   * The appraisal reports the AIF UNIT, not a look-through: one row,
   * `BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A4`, filed under
   * "Alternative Assets". Nothing here turns a fund into equities.
   */
  buoyant: {
    name: "Buoyant Capital",
    filePrefix: /^I83/,
    letterhead: /Buoyant\s+Opportunities\s+Strategy/i,
    engagement: "AIF",
  },
  vecAssago: {
    name: "V.E.C Assago Capital Management LLP",
    filePrefix: /^VEC/,
    letterhead: /V\.?\s*E\.?\s*C\s+ASSAGO/i,
    engagement: "PMS",
  },
  /**
   * ASK Investment Managers — the `september-2026` delivery, and the first
   * manager in this book whose mandates are CLOSED. Both of the family's ASK
   * Indian Entrepreneur Portfolio accounts were withdrawn in full: the fact
   * sheet as of 08/09/2026 prints a portfolio value of 0 and a single
   * `BANK · Cash and Equivalent · 0 · 100.00%` line, and the P&L account's
   * balance sheet balances to the paisa on a nil corpus. So these statements
   * are a since-inception HISTORY (Sep 2019 → Sep 2026) and a measured nil,
   * not a live holding.
   *
   * Same reporting system as the six above, with two printed differences the
   * reader has to accept: the files carry no client-code prefix
   * (`askimpms_10034025_…`), and the account line carries a SECOND number, the
   * client code, before the name — `Account : 10034025 0034926 - Ajay T
   * Jaisinghani` (see readIdentity).
   */
  ask: {
    name: "ASK Investment Managers Limited",
    filePrefix: /^askimpms/i,
    letterhead: /ASK\s+Investment\s+Managers|ASK\s+Indian\s+Entrepreneur\s+Portfolio|INP000008066/i,
    engagement: "PMS",
  },
  /**
   * Marathon Trends Advisory — the same delivery, the same reporting system,
   * and the same position as ASK: every share the mandate bought it had sold
   * by July 2025. Unlike ASK it sends NO fact sheet, appraisal or bank book —
   * only the capital gain, dividend, transaction and income-and-expense
   * statements — so nothing in the drop states what the account is worth today,
   * and the book says so rather than reading the empty trade tape as a nil.
   * Its client code (`02AS23`) leads with digits, unlike every code above.
   */
  marathon: {
    name: "Marathon Trends Advisory Pvt Ltd",
    filePrefix: /^Z1211/,
    letterhead: /Marathon\s+Trends\s+Advisory/i,
    engagement: "PMS",
  },
};

/**
 * Identify the manager: LETTERHEAD, then the classifier's own answer, and only
 * then the filename prefix.
 *
 * THE ORDER IS THE WHOLE POINT, and it was wrong. A FILENAME is the weakest
 * evidence here and it used to outrank the classifier: these six managers issue
 * from one reporting system and the prefix is an account code, not a house.
 * V.E.C Assago filed as `VECBES0004_145052_…` for every drop until August, when
 * the same account arrived as `G128005_145052_…` — and `^G\d` is Goldstandard's
 * pattern. Twenty-three documents, two accounts and ₹15.8 Cr of Ajay's and
 * Ankita's money changed manager on a filename, while the letterhead on page one
 * of every one of them said V.E.C ASSAGO CAPITAL MANAGEMENT LLP.
 *
 * The prefix stays as the LAST resort because it earns its place — the appraisal
 * used to carry no letterhead at all. It just cannot outrank two better signals.
 */
export function detectProvider({ fileName, text, name }) {
  for (const p of Object.values(PROVIDERS)) if (p.letterhead.test(text ?? "")) return p;
  // The classifier has usually already resolved the provider NAME off the
  // letterhead. Accepting it here means the engagement is read from the same
  // registry rather than defaulting to unknown when neither the file name nor
  // the text handed to this function carries the signature.
  for (const p of Object.values(PROVIDERS)) if (p.name === name) return p;
  for (const p of Object.values(PROVIDERS)) if (p.filePrefix.test(fileName ?? "")) return p;
  return null;
}

// ── Column aliases, written against the REAL headers ────────────────────────
// Order matters: `unitCost` binds before the looser `cost` alias can take its
// column. Accrued income is deliberately absent — it shares the Market Value
// column and is recovered as a continuation line instead.
const HOLDING_COLUMNS = {
  security:    [/^(security|scrip|stock|instrument|particulars)/],
  // `units?` must not swallow "Unit Cost" — that column is a price, not a count,
  // and the two sit side by side in every one of these statements.
  quantity:    [/^(quantity|qty|units?(?!\s*cost)|shares)/],
  unitCost:    [/^(unit\s*cost|avg\s*cost|average\s*cost)/],
  totalCost:   [/^(total\s*cost|cost)/],
  marketPrice: [/^(market\s*price|price|rate)/],
  marketValue: [/^(market\s*value|value)/],
  gainLoss:    [/^(gain\s*\/?\s*loss|gain)/],
  pctGainLoss: [/^(%\s*g\s*\/?\s*l|%\s*gain)/],
  pctAssets:   [/^(%\s*assets)/],
};

// ── The dated statements ────────────────────────────────────────────────────
// All seven print landscape on a `/Rotate 90` page; layout.mjs puts them the
// right way up. Their headers wrap over two lines, so every alias below has to
// match the label as the reader sees it after the wrap is joined per column.

/** TRANSACTION STATEMENT — the dated trades, and the XIRR input. */
const TRANSACTION_COLUMNS = {
  description: [/^(transaction\s*description|description)/],
  tranDate:    [/^(tran\s*date|trade\s*date|date)/],
  settleDate:  [/^(settlement\s*date|sett?\s*date)/],
  security:    [/^(security|scrip|stock)/],
  exchange:    [/^(exchg|exchange)/],
  // `units?` must not swallow "Unit Price": that is the PRICE column, and a
  // quantity alias matching its first word binds the count to the per-unit
  // figure whenever the real Quantity column has been taken by something else —
  // which is what happened on Buoyant's statement once the blank Exchange
  // column's label had taken it (see `overlapOnly` below). Refused here, a
  // quantity that cannot be placed goes unmatched, `require` drops the table,
  // and the document says so, rather than publishing a NAV as a unit count.
  quantity:    [/^(quantity|qty|units?(?!\s*(cost|price)))/],
  unitPrice:   [/^(unit\s*price|rate|price)/],
  brokerage:   [/^(brkg|brokerage)/],
  stt:         [/^stt/],
  settlement:  [/^(settlement\s*amount|net\s*amount|amount)/],
};

/**
 * The transaction statement's EXCHANGE column is blank wherever the row is not
 * an exchange trade — a fund's own unit allotment has no venue. A label over a
 * column the body leaves empty must bind to NOTHING, never to its nearest
 * neighbour. `lib/table.mjs` explains the mechanism; this is the one field on
 * this table that needs it.
 */
const TRANSACTION_OVERLAP_ONLY = ["exchange"];

/** STATEMENT OF CAPITAL GAIN/LOSS — realised lots, split ST/LT by the manager. */
const CAPITAL_GAIN_COLUMNS = {
  security:     [/^(security|scrip|stock)/],
  saleDate:     [/^sale\s*date/],
  quantity:     [/^(sale\s*quantity|quantity|qty)/],
  saleRate:     [/^sale\s*rate/],
  saleAmount:   [/^sale\s*amount/],
  purchaseDate: [/^purchase\s*date/],
  purchaseRate: [/^purchase\s*rate/],
  price31Jan:   [/^price\s*on/],
  purchaseAmt:  [/^purchase\s*amount/],
  effectiveCost:[/^effective\s*cost/],
  daysHeld:     [/^days\s*held/],
  shortTerm:    [/^st$/],
  longTerm:     [/^lt$/],
  effectiveLT:  [/^effective\s*gain\s*lt/],
};

/** STATEMENT OF DIVIDEND — dated income per security. */
const DIVIDEND_COLUMNS = {
  exDate:       [/^ex\s*date/],
  receivedDate: [/^received\s*date/],
  security:     [/^(security|scrip|stock)/],
  quantity:     [/^(quantity|qty)/],
  rate:         [/^rate/],
  receivable:   [/^receivable/],
  received:     [/^received\s*amount/],
  netAmount:    [/^net\s*amount/],
  balance:      [/^balance/],
  tds:          [/^tds/],
};

/** CORPORATE BENEFITS — bonuses and dividends by corporate-action type. */
const CORPORATE_BENEFIT_COLUMNS = {
  type:        [/^type/],
  security:    [/^(security|scrip|stock)/],
  exDate:      [/^ex\s*date/],
  entitlement: [/^entitlement/],
  quantity:    [/^(quantity|qty)/],
  amount:      [/^amount/],
};

/** BANK BOOK — every cash movement, with a running balance. */
const BANK_BOOK_COLUMNS = {
  description: [/^(transaction\s*description|description)/],
  tranDate:    [/^tran\s*date/],
  setDate:     [/^set\s*date/],
  tranAccount: [/^tran\s*account/],
  security:    [/^(security|scrip)/],
  buySell:     [/^buy\s*sell/],
  income:      [/^income/],
  expenses:    [/^expenses/],
  depWith:     [/^dep\s*with/],
  balance:     [/^balance/],
};

/**
 * CAPITAL REGISTER — the capital account, at cost and at market value.
 *
 * NOT a lot register. It records CONTRIBUTIONS AND WITHDRAWALS against the
 * capital account, so it cannot supply the per-lot purchase dates an unrealised
 * short/long-term split needs. See the note in build-book.mjs.
 */
const CAPITAL_REGISTER_COLUMNS = {
  description: [/^(transaction\s*description|description)/],
  tranDate:    [/^tran\s*date/],
  setDate:     [/^set\s*date/],
  notes:       [/^desc\s*notes/],
  credit:      [/^credit/],
  debit:       [/^debit/],
  balance:     [/^balance/],
};

/** STATEMENT OF EXPENSES — fees and charges, dated. */
const EXPENSE_COLUMNS = {
  date:       [/^date/],
  settleDate: [/^settlement\s*date/],
  tranRef:    [/^tran\s*ref/],
  detail:     [/^detail/],
  notes:      [/^desc\s*notes/],
  amount:     [/^amount/],
};

/**
 * EXPENSE STATEMENT **SUMMARY** — a different table under the same title.
 *
 * The dated statement above itemises each charge on the day it was raised. This
 * one totals them BY TYPE over the window and carries no dates at all:
 *
 *   Transaction Description   Total Paid Amount   Total Payable Amount   Total Amount
 *   Management Fees                       0.00             234,014.65      234,014.65
 *
 * Both managers who deliver their report set as a single bundle print this form,
 * and the dated reader finds nothing in it — which is a `failed` document and a
 * silently missing ₹3.05 L of fees, not a parse error worth chasing. The middle
 * column is labelled `Total Payable Amount` by one and `Unsettled for the
 * period` by the other; both mean the same thing and both are matched, because
 * matching on column INDEX is how a layout change becomes a wrong figure.
 *
 * PAID and PAYABLE are kept apart. A management fee accrued and not yet
 * collected is a liability, not a payment, and summing the two columns would
 * double every charge that has been settled.
 */
const EXPENSE_SUMMARY_COLUMNS = {
  detail:     [/^(transaction\s*description|description|particulars)/],
  paid:       [/^total\s*paid/],
  payable:    [/^(total\s*payable|unsettled)/],
  amount:     [/^total\s*amount/],
};

/**
 * CURRENT PORTFOLIO — read for TWO FIELDS ONLY.
 *
 * Precedence names the appraisal authoritative for every figure this report
 * also carries, and for good reason: it folds accrued income into market value
 * on some rows but not others. What it alone carries is per-position accrued
 * income and IRR%, so those are what is taken.
 */
const CURRENT_PORTFOLIO_COLUMNS = {
  security:    [/^(security|scrip|stock)/],
  priceAsOn:   [/^price\s*as\s*on/],
  quantity:    [/^(quantity|qty)/],
  avgDays:     [/^avg\s*days/],
  unitCost:    [/^unit\s*cost/],
  totalCost:   [/^total\s*cost/],
  marketPrice: [/^market\s*price/],
  marketValue: [/^market\s*value/],
  income:      [/^income/],
  unrealized:  [/^unrealized\s*gain/],
  totalGl:     [/^total\s*g(\s*\/?\s*l|ain)/],
  pctGl:       [/^%\s*g\s*l/],
  // Goldstandard prints IRR%; Green Lantern and Carnelian print an Absolute and
  // an Annualized Yield % instead. They are DIFFERENT measures over different
  // bases, so they get different fields and neither is read into the other.
  irrPct:      [/^irr/],
  absYieldPct: [/^absolute\s*yield/],
  annYieldPct: [/^annualized\s*yield/],
  pctAssets:   [/^%\s*assets/],
};

/** Fact-sheet holdings table: security, sector, value, weight. */
const FACTSHEET_COLUMNS = {
  rank:        [/^(sr|s\s*no|rank)/],
  security:    [/^(security|scrip|stock|name)/],
  sector:      [/^(sector|industry)/],
  marketValue: [/^(mkt\s*value|market\s*value|value)/],
  pctAssets:   [/^(%\s*assets|weight)/],
};

/**
 * Section headings inside the appraisal body.
 *
 * Matched on the LEADING word, not the whole cell: Carnelian heads its cash
 * block "Cash and Equivalent" and Green Lantern "Cash". Requiring an exact match
 * made the longer label look like a wrapped security name, which silently
 * appended it to the holding above and left two cash rows classified as equity.
 * Only ever consulted for a row that carries no figures, so a real "Cash" data
 * row is never mistaken for a heading.
 */
const SECTION_ROW = /^(equity|equities|cash|mutual\s*fund|debt|bond|liquid|alternative|others?)\b/i;

/**
 * A section heading names WHAT THE ROWS UNDER IT ARE, and `Alternative Assets`
 * is why this is a map rather than a cash test.
 *
 * It read `/^cash/i.test(section) ? "Cash" : "Equity"`, which was right while
 * every appraisal in the book held shares and cash and nothing else. Buoyant's
 * appraisal prints `Alternative Assets` over its Category III units — and
 * because that heading was not in `SECTION_ROW` either, it was not recognised
 * as a heading at all: it glued itself onto the Cash row above, the section
 * never changed, and **₹76.99 Cr of AIF units came out classified as Cash**.
 * That is the client's own bifurcation complaint, arriving through the ingest
 * instead of the UI.
 */
function classOfSection(section, security) {
  if (CASH_LINE.test(security ?? "")) return "Cash";
  const t = String(section ?? "");
  if (/^cash/i.test(t)) return "Cash";
  if (/^alternative/i.test(t)) return "AIF";
  if (/^mutual\s*fund/i.test(t)) return "Mutual Fund";
  if (/^(debt|bond)/i.test(t)) return "Bond";
  return "Equity";
}

/**
 * A row labelled with nothing but a section word, or "Total", and carrying no
 * quantity, is that section's SUBTOTAL — not a holding.
 *
 * The real statements print their subtotals unlabelled and are handled by
 * position, but a labelled one must not be summed as a position on top of the
 * rows it already totals. The quantity test is what keeps it apart from a
 * genuine holding of the same name: Green Lantern's appraisal really does hold a
 * line called "Cash", with 3,563,656.859 units at 1.00.
 */
const SUBTOTAL_LABEL = /^(equity|equities|cash|debt|bonds?|liquid|others?|total|grand\s*total)$/i;

/**
 * A holding line that IS a cash-equivalent, by its own name rather than by its
 * section.
 *
 * `Cash Rec/Payable` matched from the start; `Tax Deducted at Source` did not,
 * and fell to the `: "Equity"` default. Molecule's CURRENT PORTFOLIO prints it
 * under OTHER ASSETS —
 *
 *     Tax Deducted at Source  -0  1.00  -0  1.00  -0  0  0  0.00  0.00  -0.00
 *
 * — beside Cash, at a unit price of 1.00, which is how these statements write a
 * rupee-denominated claim rather than a security. Extracting it was right: it is
 * a printed row and a future drop can carry a real balance on it. Calling it
 * EQUITY was not. Asset class is what a thing IS, and a withholding receivable
 * from the tax authority is not a share; it was landing in the Equity class and
 * the Unclassified sector, and rendering on the holdings table as a company
 * priced at ₹1.
 *
 * Its value here is nil, so no total moves — which is exactly why it would have
 * gone on being wrong unnoticed.
 */
const CASH_LINE = /^(cash\b|tax\s+deducted\s+at\s+source\b)/i;

/** The page footer, which lands in whichever column sits above it. */
const PAGE_FOOTER = /^page\s*\d+(\s*of\s*\d+)?$/i;

/**
 * The OTHER page footer — a bare print date, and on V.E.C's appraisal a page
 * number beside it: `07/07/2026  1`. It sits below the grand total, inside the
 * table's band, so nothing about its position marks it as trailing matter. Read
 * as a row it became a holding named "07/07/2026" with no quantity, no cost and
 * no value, which then went to `build-symbols` as an unresolvable security.
 *
 * A security name is never a date. That is the whole rule, and it is narrow on
 * purpose: it tests the NAME, not the row, so a genuine holding printed beside a
 * date is untouched.
 */
const DATE_ONLY = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;

/** Sub-header text that prints inside a data column, not a value. */
const HEADER_LABEL = /^(accrued\s*income|market\s*value|unit\s*cost|total\s*cost|%\s*(g\s*\/?\s*l|assets)|price|quantity|cost)$/i;

/**
 * Report types this engine knows how to read. Anything else is declared, not
 * half-read.
 *
 * `holdings` — Goldstandard's CURRENT PORTFOLIO and its Green Lantern /
 * Carnelian equivalent — is deliberately NOT here. It is a genuinely different
 * layout (IRR%, Income and Total G/L columns, values interleaved across the
 * page), and precedence already names the appraisal as the authoritative source
 * for every figure it carries. It would be read for its accrued income and
 * per-position IRR, which nothing yet consumes; until then it is left unread
 * rather than half-read, and the golden test lists what that costs.
 */
const READABLE = new Set([
  "appraisal", "fact-sheet",
  "performance-summary", "performance-history", "performance-benchmark",
  "transaction-statement", "capital-gain", "dividend-statement", "corporate-benefits",
  "bank-book", "capital-register", "expense-statement", "holdings",
  // ASK's whole-life P&L account and balance sheet; Marathon's whole-life
  // income-and-expense row. See readProfitAndLoss and readIncomeExpense.
  "profit-and-loss", "income-expense",
]);
/** These reports place the geometry at 3pt corridors; measured, not guessed. */
const LAYOUT = { minColumnGap: 3 };

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const clean = (s) => String(s ?? "").trim();
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Header identity: account number, owner, as-of, strategy.
 *
 * The printed `Account : <no> <name>` is authoritative — the FILENAME's account
 * number disagrees with it (Ajay's Aristos file is `G100023_100024` while the
 * statement says `Account : 100023`), and the statement is the record.
 */
function readIdentity(pages) {
  const text = pages.map((p) => p.rows.map((r) => r.cells.map((c) => c.text).join(" ")).join("\n")).join("\n");
  const out = { accountNo: null, owner: null, clientCode: null, asOf: null, strategy: null, inceptionDate: null };

  // Identity is read off INDIVIDUAL TEXT SPANS, anchored at both ends — not out
  // of the joined line. The report engine emits the header line as one span
  // ("Account : 100023 Ajay Thakurdas Jaisinghani"), but the joined line runs on
  // into whatever else sits at that y: a column heading from the table below
  // ("Type Bonus", "Sale Amount", "Ex Date") reads as part of the owner's name
  // when the capture is unanchored, and the name then matches no canonical
  // owner. Anchoring makes the bleed structurally impossible.
  // Kept as rows so "the same printed line" is available: the owner's name is
  // beside the account number on that line, not at some fixed offset from it.
  const lines = pages.flatMap((p) => p.rows.map((r) => (r.items ?? []).map((i) => clean(i.text))));
  const spans = lines.flat();
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    // Three printed forms, one anchored pattern:
    //   Account : 100023 Ajay Thakurdas Jaisinghani          (Goldstandard appraisal)
    //   Account: 100022 - Ankita Bharat Jaisinghani          (Goldstandard fact sheet)
    //   Account: 3517383 - AJAY T JAISINGHANI - CBP0142      (Carnelian / Green Lantern)
    //   Account: 128005 - AJAY JAISINGHANI - VECBES0004      (V.E.C Assago)
    // The name is optional, the separating dash is optional, and a trailing
    // client code is consumed rather than read as part of the name.
    //
    // CLIENT_CODE is a letter prefix followed by DIGITS, not a fixed list of
    // three prefixes. It was `(?:GLC|CBP)`, and because the whole pattern is
    // anchored at both ends, V.E.C's `- VECBES0004` made the entire line fail to
    // match — so its fact sheet carried no account number, was filed under no
    // account, and thirty-one V.E.C holdings rendered as Unclassified while the
    // sector sat in a document the join could not reach. The digits are what
    // keep this safe: the same dash form also carries the fund name
    // ("GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND"), which has none.
    //
    // ASK prints a SECOND NUMBER before the name — its own client code — in two
    // spellings, and the general pattern refuses both because a name may not
    // start with a digit:
    //   Account : 10034025 0034926 - Ajay T Jaisinghani      (dated statements)
    //   Account: 10034025 - 0034926 - Ajay T Jaisinghani     (fact sheet)
    // The first number is the account (the file name agrees); the second is the
    // client code and is never read as the account.
    const ask = /^Account\s*:?\s*(\d{6,})\s*-?\s*(\d{5,})\s*-\s*([A-Za-z][A-Za-z.'\- ]{2,60}?)$/.exec(s);
    if (ask) {
      out.accountNo ??= ask[1];
      out.clientCode ??= ask[2];
      out.owner ??= trimPersonName(ask[3].replace(/\s+/g, " "));
      continue;
    }
    const acct = /^Account\s*:?\s*(\d[\d-]*)(?:\s*-?\s+([A-Za-z][A-Za-z.'\- ]{2,60}?))?(?:\s*-\s*([A-Z]{2,8}\d{3,}))?$/.exec(s);
    if (acct) {
      out.accountNo ??= acct[1];
      if (acct[3]) out.clientCode ??= acct[3];
      // The name is either inside the account span (appraisal, fact sheet) or
      // the span directly beneath it (performance summary / history), and it
      // must be name-shaped — two to five all-alphabetic words — so the fact
      // sheet, whose account line is followed by the "Sr." column heading,
      // contributes nothing rather than an owner called "Sr.".
      //
      // Deliberately NOT "anything else on the same printed line". On CURRENT
      // PORTFOLIO the name really does sit on that line, but so does a security
      // name on every data page, and the rule that reaches the one reaches the
      // other: it produced an owner called "BLS International Services Ltd".
      // That report has no reader here anyway; its owner is recovered from the
      // account number instead (see backfillOwners in extract.mjs).
      const nameShaped = (t) => /^[A-Za-z][A-Za-z.']*(?:\s+[A-Za-z][A-Za-z.']*){1,4}$/.test(t);
      const next = spans[i + 1] ?? "";
      // The two delivery-specific spellings of the span BENEATH a bare account
      // number. Each is accepted only in this position — never as a free-floating
      // span — because a digit-led code is too weak a signal to read anywhere else.
      //   0034926 - Ajay T Jaisinghani     (ASK's P&L account: code, then name)
      //   Ajay Jaisinghani - 02AS23        (Marathon: name, then a digit-led code)
      const askNext = /^(\d{5,})\s*-\s*([A-Za-z][A-Za-z.'\- ]{2,60}?)$/.exec(next);
      const marathonNext = /^([A-Za-z][A-Za-z.'\- ]{2,60}?)\s*-\s*(\d{2}[A-Z]{2,4}\d{2,4})$/.exec(next);
      if (acct[2]) out.owner ??= trimPersonName(acct[2].replace(/\s+/g, " "));
      else if (nameShaped(next)) out.owner ??= trimPersonName(next);
      else if (askNext) {
        out.clientCode ??= askNext[1];
        out.owner ??= trimPersonName(askNext[2].replace(/\s+/g, " "));
      } else if (marathonNext) {
        out.clientCode ??= marathonNext[2];
        out.owner ??= trimPersonName(marathonNext[1].replace(/\s+/g, " "));
      }
    }
    // Green Lantern / Carnelian: `AJAY T JAISINGHANI - GLC0780`. The DIGITS in
    // the client code are what makes this safe — the same dash form also carries
    // the fund ("GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND"), and requiring a
    // numeric code stops the manager's own name being read as the client's.
    const coded = /^([A-Za-z][A-Za-z.'\- ]{2,60}?)\s*-\s*([A-Z]{2,8}\d{3,})$/.exec(s);
    if (coded) {
      out.clientCode ??= coded[2];
      out.owner ??= trimPersonName(coded[1].replace(/\s+/g, " "));
    }
  }
  const asOf = /As\s*[Oo]f\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text)
    ?? /From\s+\d{1,2}\/\d{1,2}\/\d{4}\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
  if (asOf) out.asOf = toIso(asOf[1]);

  const inception = /Inception\s*Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(text);
  if (inception) out.inceptionDate = toIso(inception[1]);

  // Strategy: the scheme line under the account, or the fact sheet's label.
  //
  // The joined line is the established read, and its OWN SPAN corrects it in
  // one case only: where the joined read RAN PAST the span. On ASK's fact sheet
  // the holdings table's "%Assets" heading wraps, and its last letter sits on
  // the strategy's printed line — joined, the strategy read "ASK Indian
  // Entrepreneur Portfolio s", while the span is the label alone.
  //
  // The span never FILLS a blank, because a span can carry more than the
  // strategy too: V.E.C's fact sheet prints "Strategy: V.E.C ASSAGO Small and
  // Mid-Cap Growth Bespoke" as ONE text item, where "Bespoke" is the first word
  // of the engagement ("Bespoke Discretionary PMS", which every other V.E.C
  // report prints beside the strategy). The joined read finds nothing on that
  // line, so the fact sheet carries no strategy and extract.mjs fills it from
  // the same account's other reports, which print it without "Bespoke". Filled
  // from the span, one account would stand under two strategy names.
  const fmt = (m) => (m ? clean(m[1]).replace(/\s+/g, " ") : null);
  const stratSpan = fmt(spans.map((s) => /^Strategy\s*:\s*([A-Za-z][A-Za-z0-9 .&'\-]{3,60})$/.exec(s)).find(Boolean));
  const stratJoined = fmt(/Strategy\s*:\s*([A-Za-z][A-Za-z0-9 .&'\-]{3,60}?)(?=\s{2,}|\s+Portfolio\s+Holdings|$)/m.exec(text));
  const ranPast = stratSpan && stratJoined && stratJoined.length > stratSpan.length && stratJoined.startsWith(stratSpan);
  const strat = (ranPast ? stratSpan : stratJoined)
    ?? fmt(/^\s*([A-Z][A-Za-z ]*(?:CAPITAL LLP - [A-Z ]+|BESPOKE PORTFOLIO|Equity Portfolio))\s*$/m.exec(text));
  if (strat) out.strategy = strat;
  return out;
}

/**
 * The appraisal holdings table, with its three kinds of continuation line.
 * Returns { holdings, subtotals, sheet } or null.
 */
function readHoldings(pages, warnings) {
  // The table CONTINUES ACROSS PAGES, header repeated on each. Green Lantern's
  // appraisal carries all 32 equity rows on page 1 and the entire Cash section —
  // two rows and the grand total — on page 2, so stopping at the first page with
  // a table drops the cash and leaves the account looking 3% smaller than it is.
  const holdings = [];
  const subtotals = [];
  const allRows = [];
  let columns = null;
  let section = null;
  let found = false;

  for (const page of pages) {
    const table = findTable(page, HOLDING_COLUMNS, { minFields: 6, ...LAYOUT });
    if (!table || !("security" in table.columns)) continue;
    const { rows } = readRows(page, table, {});
    if (!rows.length) continue;
    found = true;
    columns ??= Object.keys(table.columns);
    allRows.push(...rows);

    const numericFields = Object.keys(table.columns).filter((f) => f !== "security");

    for (const r of rows) {
      const name = clean(r.fields.security);
      const populated = numericFields.filter((f) => parseNumInfo(r.fields[f]).status === "ok");

      // Page furniture that landed inside the table's band — see DATE_ONLY.
      if (name && (DATE_ONLY.test(name) || PAGE_FOOTER.test(name))) continue;

      // A section heading: a bare label with no figures.
      if (name && !populated.length && SECTION_ROW.test(name)) { section = name; continue; }

      // A subtotal: figures but NO label — or a label that is only the section's
      // own name with no quantity against it. Either way it closes the section
      // and must not be summed as a position on top of the rows it totals.
      const labelledSubtotal = name && SUBTOTAL_LABEL.test(name)
        && parseNumInfo(r.fields.quantity).status !== "ok";
      if ((!name && populated.length >= 2) || labelledSubtotal) {
        subtotals.push({ section: name && !/^(grand\s*)?total$/i.test(name) ? name : section, fields: r.fields });
        continue;
      }
      if (!name && !populated.length) continue;

      // A continuation of the row above — one cell only, and no name.
      if (!name && populated.length === 1) {
        const prev = holdings[holdings.length - 1];
        // A lone figure in the Market Value column is the ACCRUED INCOME that
        // the sub-header promises; it is printed on its own line beneath the row.
        if (prev && populated[0] === "marketValue") {
          prev.accruedIncome = parseNum(r.fields.marketValue);
        }
        continue;
      }
      // A wrapped security NAME: text in the name column, nothing numeric.
      if (name && !populated.length) {
        const prev = holdings[holdings.length - 1];
        if (prev) prev.security = `${prev.security} ${name}`.replace(/\s+/g, " ").trim();
        continue;
      }

      holdings.push({
        security: name,
        section,
        quantity: parseNum(r.fields.quantity),
        unitCost: parseNum(r.fields.unitCost),
        totalCost: parseNum(r.fields.totalCost),
        marketPrice: parseNum(r.fields.marketPrice),
        printedMarketValue: parseNum(r.fields.marketValue),
        printedGainLoss: parseNum(r.fields.gainLoss),
        printedPctGainLoss: parseNum(r.fields.pctGainLoss),
        printedPctAssets: parseNum(r.fields.pctAssets),
        accruedIncome: null,
      });
    }

    for (const r of rows) {
      for (const f of numericFields) {
        // A HEADER LABEL or a page footer is not an unparseable figure.
        // "Accrued Income" is a sub-header printed inside the Market Value
        // column on a line of its own below the header block, and "Page 1" is
        // the footer; flagging either as a cell that would not parse put the
        // same false warning on every appraisal in the drop.
        const cell = clean(r.fields[f]);
        if (HEADER_LABEL.test(cell) || PAGE_FOOTER.test(cell)) continue;
        if (parseNumInfo(r.fields[f]).status === "unparseable") {
          warn(warnings, "unparseable-cell", `${clean(r.fields.security) || "(continuation)"} · ${f} = ${JSON.stringify(r.fields[f])}`);
        }
      }
    }
    if (table.missing.length) warn(warnings, "columns-not-matched", table.missing.join(", "));
  }

  if (!found) return null;
  return {
    holdings,
    subtotals,
    // The audit sheet keeps EVERY row, continuations and subtotals included —
    // it is the record of what the statement said, not of what we summed.
    sheet: toAuditSheet("holdings", columns, allRows),
  };
}

/**
 * Printed totals, from the unlabelled subtotal rows.
 *
 * Ordering is the only thing that identifies them: the first subtotal closes the
 * Equity section, the next closes Cash, and the last is the grand total.
 */
function totalsFrom(subtotals, source, warnings) {
  if (!subtotals.length) return null;
  const val = (r, f) => parseNum(r.fields[f]);
  const bySection = (name) => subtotals.find((s) => s.section && new RegExp(`^${name}`, "i").test(s.section));

  const equity = bySection("equit");
  const cash = bySection("cash");
  const grand = subtotals[subtotals.length - 1];
  if (!equity) warn(warnings, "equity-subtotal-not-found", "no unlabelled subtotal closed the Equity section");

  const t = makeTotals({
    equityMarketValue: equity ? val(equity, "marketValue") : null,
    equityCost: equity ? val(equity, "totalCost") : null,
    cashValue: cash ? val(cash, "marketValue") : null,
    totalMarketValue: grand ? val(grand, "marketValue") : null,
    totalCost: grand ? val(grand, "totalCost") : null,
    // Gain/loss on the EQUITY basis: the grand-total line divides the same gain
    // by a larger denominator (3.40% vs 3.47%), so the two percentages are not
    // interchangeable and the equity one is what the holdings reconcile against.
    gainLoss: equity ? val(equity, "gainLoss") : null,
    pctGainLoss: equity ? val(equity, "pctGainLoss") : null,
    source,
  });
  return Object.entries(t).some(([k, v]) => k !== "source" && v !== null) ? t : null;
}

/** Fact sheet: the provider's own sector per holding. */
function readSectors(pages, warnings) {
  for (const page of pages) {
    // The fact sheet is a two-column magazine layout — Investment Objective and
    // Sector Allocation down the left, the holdings table down the right — and
    // both halves share every y row. Confine the table to the band its own
    // header occupies, or the left column's text is read into its cells.
    const table = findTable(page, FACTSHEET_COLUMNS, { minFields: 3, bandToHeader: true, ...LAYOUT });
    if (!table || !("security" in table.columns) || !("sector" in table.columns)) continue;
    // NOT requireField: "security" — one holding occupies SEVERAL rows here and
    // the security name is on only one of them.
    const { rows } = readRows(page, table, {});

    /**
     * One holding spans a GROUP of consecutive rows, because the Sector column
     * wraps and the security name sits on the second line of it:
     *
     *     |          | Non Banking       | 7,740,510 | 4.26% |   ← value row
     *     | 1 | Sundaram Finance Ltd. | Financial Company |    |
     *     |          | (NBFC)            |           |       |
     *
     * The row carrying the market value opens a new holding; every row after it
     * contributes to the same one until the next value row. Taking the sector
     * from the security's own row alone truncated "Non Banking Financial Company
     * (NBFC)" to "Financial Company" — and did the same to more than half the
     * taxonomy, which then mapped to nothing.
     */
    const groups = [];
    for (const r of rows) {
      const opensRecord = parseNumInfo(r.fields.marketValue).status === "ok";
      if (opensRecord || !groups.length) groups.push({ security: "", sectorParts: [], rows: [] });
      const g = groups[groups.length - 1];
      g.rows.push(r);
      const name = clean(r.fields.security);
      if (name) g.security = g.security ? `${g.security} ${name}` : name;
      const part = clean(r.fields.sector);
      if (part) g.sectorParts.push(part);
    }

    const map = new Map();
    // The same groups, with the FIGURES the table prints beside each name.
    //
    // Every manager on this reporting system publishes a fact sheet, but only
    // some also publish an appraisal. Where an appraisal exists it is
    // authoritative for holdings and this is only the sector join. Where it does
    // NOT — Molecule Ventures issues a fact sheet and nothing else — these are
    // the only holdings that manager reports, and the account would otherwise be
    // absent from the book entirely.
    //
    // Market value is the ONLY primitive here: this table carries no quantity
    // and no cost. Both stay null and render "—", because a cost of zero would
    // book the whole position as profit.
    const rowsOut = [];
    for (const g of groups) {
      if (!g.security || SUBTOTAL_LABEL.test(g.security.trim())) continue;
      const mv = parseNum(g.rows.map((r) => r.fields.marketValue).find((v) => parseNumInfo(v).status === "ok"));
      const pct = parseNum(g.rows.map((r) => r.fields.pctAssets).find((v) => parseNumInfo(v).status === "ok"));
      if (mv === null) continue;
      rowsOut.push({
        security: g.security.replace(/\s+/g, " ").trim(),
        sector: g.sectorParts.join(" ").replace(/\s+/g, " ").trim() || null,
        marketValue: mv,
        pctAssets: pct,
      });
    }
    for (const g of groups) {
      if (!g.security || !g.sectorParts.length) continue;
      // The table's own TOTAL opens a record like any other — it carries a market
      // value and a percentage. On V.E.C's fact sheet it prints on the same
      // physical line as the Sector Allocation table's last row, so the
      // terminator never sees it alone, and it arrived in the book as a holding
      // called "Total" with the footer's contact line for a sector. A subtotal
      // label is the table closing, not a security.
      if (SUBTOTAL_LABEL.test(g.security.trim())) continue;
      map.set(g.security.replace(/\s+/g, " ").trim(), g.sectorParts.join(" ").replace(/\s+/g, " ").trim());
    }
    if (map.size || rowsOut.length) {
      return { sectors: map, rows: rowsOut, sheet: toAuditSheet("sectors", Object.keys(table.columns), rows) };
    }
  }
  warn(warnings, "sector-table-not-found", "fact sheet carried no security/sector table");
  return null;
}

/**
 * A labelled figure read from a row's ITEMS rather than its page-wide cells.
 *
 * Both the fact sheet and the performance appraisal are two-column layouts whose
 * halves share every y. The page-wide grid therefore merges "Contribution" with
 * whatever the other column prints beside it — the label stops matching, and the
 * first figure to its right belongs to the other column entirely (a 2.82% weight
 * rather than a 41,000 withdrawal). The items keep the two apart.
 */
function findByItemLabel(pages, re) {
  for (const page of pages) {
    for (const row of page.rows) {
      const items = (row.items ?? []).map((i) => clean(i.text));
      // The label can be at ANY position in the row, not only the first: the
      // performance appraisal's two columns interleave, so "Net Capital In (+) /
      // Out (-)" is the FOURTH item on a row that opens with the allocation
      // table's "Equity 178,050,895.00 98.08 %".
      for (let i = 0; i < items.length; i++) {
        if (!re.test(items[i].toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim())) continue;
        for (const t of items.slice(i + 1)) {
          const info = parseNumInfo(t);
          if (info.status === "ok") return info.value;
        }
      }
    }
  }
  return null;
}

/**
 * The window a report's figures cover: `From 01/04/2026 to 10/07/2026`.
 *
 * Load-bearing. These reports print similarly-named flow lines over DIFFERENT
 * windows — the performance summary runs the financial year to date, the
 * performance history and the fact sheet run since inception — so "Realized Gain
 * 415,051.23" and "Realized Gain 882,423.12" are both correct and comparing them
 * is meaningless. Carrying the window is what lets the reconciler tell a genuine
 * disagreement from two different questions.
 */
function readPeriod(pages, fallback) {
  for (const page of pages) {
    for (const row of page.rows) {
      const m = /From\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4})/i
        .exec(row.cells.map((c) => c.text).join(" "));
      if (m) return { periodFrom: toIso(m[1]), periodTo: toIso(m[2]) };
    }
  }
  return { periodFrom: fallback.inceptionDate ?? null, periodTo: fallback.asOf ?? null };
}

// ── Dated-table readers ─────────────────────────────────────────────────────

/** `dd/mm/yyyy` or `dd/mm/yy` — the capital gain statement uses the short form. */
const DATE_CELL = /^\s*(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))\s*$/;

/**
 * Read one header-located table across EVERY page of the report.
 *
 * These statements run to five pages and repeat the header on each. Reading only
 * the first page loses the tail silently — the same failure that dropped Green
 * Lantern's cash section during calibration.
 *
 * Returns rows in document order plus the column map from the first page the
 * table was found on, or null when no page carried it.
 */
function readAcrossPages(pages, columns, opts = {}) {
  const rows = [];
  let map = null, missing = null;
  for (const page of pages) {
    const table = findTable(page, columns, { minFields: opts.minFields ?? 4, ...LAYOUT, ...opts });
    if (!table) continue;
    if (opts.require && !opts.require.every((f) => f in table.columns)) continue;
    const r = readRows(page, table, {});
    if (!r.rows.length) continue;
    map ??= table.columns;
    missing ??= table.missing;
    rows.push(...r.rows);
  }
  return rows.length ? { rows, columns: map, missing } : null;
}

/** `dd/mm/yyyy` in a cell → ISO, else null. Never a partial or a guess. */
const cellDate = (v) => {
  const m = DATE_CELL.exec(clean(v));
  return m ? toIso(m[1]) : null;
};

/**
 * TRANSACTION STATEMENT → dated trades.
 *
 * The Transaction Description column carries three different things: the side
 * ("Buy"/"Sell") on a data row, a section heading ("Shares - Listed") on a
 * grouping row, and nothing at all on a subtotal. A row is a TRADE only when it
 * carries a trade date — the one field a heading or a subtotal never has.
 */
/**
 * A section heading naming a FUND'S OWN UNITS — "Mutual Funds - AIF Category
 * III", which is how this reporting system heads Buoyant's allotments in its own
 * folio. The statement names the class; it is read rather than left to a guess.
 */
const fundUnitsSection = (section) => /\baif\b|alternative\s+investment/i.test(section ?? "");
/** Decimal places a figure is PRINTED to, read off its own cell — never assumed. */
const printedDecimals = (v) => {
  const m = /\.(\d+)\s*$/.exec(clean(v));
  return m ? m[1].length : null;
};

/**
 * A BUYBACK IS A DISPOSAL, AND IT MUST BE TESTED BEFORE "BUY".
 *
 * ASK's tape prints a company buying back its own shares as `Buyback Shares`:
 * TCS took 35 of this family's shares at ₹4,500 on 30 March 2022 and 41 at
 * ₹4,150 on 11 December 2023. A `^buy` test reads that as a PURCHASE — and the
 * reconciler said so on all four rows, the derived settlement landing exactly
 * twice the brokerage and STT away from the printed one, because the charges
 * were added to a sale instead of taken off it. Read as a sale, every one of
 * the four reproduces its printed settlement to the paisa. The capital gain
 * statement agrees: it opens with a "Buyback Shares" section.
 */
const BUYBACK = /^buy\s*-?\s*back/i;

/**
 * ROWS THAT ARE NOT TRADES, AND SAY SO IN THEIR OWN DESCRIPTION.
 *
 * Each was reported one row at a time as `transaction-side-unknown` — which is
 * true and says nothing: ASK's two tapes carried 427 such rows, every one of
 * them understood. They are not trades, so none is emitted as one, and each
 * kind is reported ONCE per document with its count, so a row this reader
 * genuinely cannot place still stands out instead of drowning in them.
 *
 *   • TDS transfers — `Trf to TDS A/c` moves the tax deducted at source on a
 *     dividend into the account's TDS ledger and `TDS Trf to Capital A/c` moves
 *     it on to capital (the "security" is `Tax Deducted at Source`, a quantity
 *     of rupees at 1.0000). Cash, not shares: the bank book carries every one.
 *   • Unit movements — `Security in` / `Security out` move units with no
 *     counterparty and no consideration: Marathon's ITC demerger (ITC out and
 *     back in at a lower cost, ITC Hotels in), and Buoyant 103473's class
 *     switch from A1 to A4. A demerger reallocates cost; it sells nothing.
 */
const NON_TRADE_ROWS = [
  {
    test: /^(?:trf\s+to\s+tds\b|tds\s+trf\s+to\s+capital\b)/i,
    code: "tds-transfers-are-not-trades",
    say: (n, labels) => `${n} TDS transfer row(s) (${labels}) — the tax deducted at source on a dividend moving `
      + "into the account's TDS ledger and on to capital. Cash, not shares: none is a trade, and the bank book "
      + "carries each one.",
  },
  {
    test: /^security\s+(?:in|out)\b/i,
    code: "unit-movements-are-not-trades",
    say: (n, labels) => `${n} unit movement row(s) (${labels}) — units moved in or out with no counterparty and no `
      + "consideration (a demerger, a class switch or a transfer). None is a trade, so none is emitted as one.",
  },
];

function readTransactions(pages, source, warnings) {
  const t = readAcrossPages(pages, TRANSACTION_COLUMNS, {
    minFields: 6, require: ["security", "quantity"], overlapOnly: TRANSACTION_OVERLAP_ONLY,
  });
  if (!t) return null;
  if (t.missing?.length) warn(warnings, "columns-not-matched", t.missing.join(", "));

  const out = [];
  const nonTrade = new Map();              // code → { kind, labels: Map<desc, count> }
  let section = null;
  for (const r of t.rows) {
    const date = cellDate(r.fields.tranDate);
    const desc = clean(r.fields.description);
    if (!date) {
      // A label with no figures is the section it opens; anything else is a
      // subtotal or a page artefact and is skipped rather than guessed at.
      if (desc && !Object.entries(r.fields).some(([k, v]) => k !== "description" && parseNumInfo(v).status === "ok")) {
        section = desc;
      }
      continue;
    }
    const kind = NON_TRADE_ROWS.find((k) => k.test.test(desc));
    if (kind) {
      const e = nonTrade.get(kind.code) ?? { kind, labels: new Map() };
      e.labels.set(desc, (e.labels.get(desc) ?? 0) + 1);
      nonTrade.set(kind.code, e);
      continue;
    }
    const buyback = BUYBACK.test(desc);
    const side = buyback || /^sell/i.test(desc) ? "sell" : /^buy/i.test(desc) ? "buy" : null;
    if (!side) { warn(warnings, "transaction-side-unknown", `${date} · ${JSON.stringify(desc)}`); continue; }
    out.push(makeTransaction({
      date,
      settlementDate: cellDate(r.fields.settleDate),
      side,
      // The statement's own word, where `side` alone hides what happened: a
      // buyback is a sale to the company itself, and a reader of the tape must
      // be able to tell it from a sale on the market.
      description: buyback ? desc : null,
      security: clean(r.fields.security),
      exchange: clean(r.fields.exchange) || null,
      // The section names the instrument type ("Shares - Listed"); a PMS holds
      // ordinary listed equity, so anything else is left unclassified rather
      // than forced into a class this reader cannot verify. The one other
      // section this reporting system prints is "Mutual Funds - AIF Category
      // III" — a fund's own units in its own folio — and there the statement
      // NAMES the class.
      assetClass: /shares|equit/i.test(section ?? "") ? "Equity"
        : fundUnitsSection(section) ? "AIF" : null,
      quantity: parseNum(r.fields.quantity),
      unitPrice: parseNum(r.fields.unitPrice),
      brokerageRate: parseNum(r.fields.brokerage),
      stt: parseNum(r.fields.stt),
      settlementAmount: parseNum(r.fields.settlement),
      // A FUND ALLOTS UNITS AGAINST CASH AT ITS UNROUNDED NAV, so units x the
      // PRINTED NAV reproduces the cash only to that NAV's printed precision:
      // Buoyant's 17,96,901.615 Class A4 units x a printed 139.1284 is
      // 25,00,00,046.65 against the 25,00,00,000.00 paid, and the exact NAV
      // (139.128374…) rounds to the printed one. The precision is read off the
      // cell. A house trade on this same statement settles on its printed rate
      // and stays held to the rupee — only a fund's own allotment carries one.
      ratePrecision: fundUnitsSection(section) ? printedDecimals(r.fields.unitPrice) : null,
      source,
    }));
  }
  for (const { kind, labels } of nonTrade.values()) {
    const n = [...labels.values()].reduce((a, b) => a + b, 0);
    const named = [...labels].map(([d, c]) => `${c} × ${JSON.stringify(d)}`).join(", ");
    warn(warnings, kind.code, kind.say(n, named));
  }
  // A tape whose every dated row is a known non-trade row was still READ, and
  // its table was found — it is not "table not found".
  return out.length || nonTrade.size
    ? { transactions: out, sheet: toAuditSheet("transactions", Object.keys(t.columns), t.rows) }
    : null;
}

/** STATEMENT OF CAPITAL GAIN/LOSS → realised lots, ST/LT as the manager split them. */
function readCapitalGains(pages, source, warnings) {
  const t = readAcrossPages(pages, CAPITAL_GAIN_COLUMNS, { minFields: 6, require: ["security", "saleDate"] });
  if (!t) return null;
  if (t.missing?.length) warn(warnings, "columns-not-matched", t.missing.join(", "));

  const out = [];
  for (const r of t.rows) {
    const saleDate = cellDate(r.fields.saleDate);
    if (!saleDate) continue;                 // heading or subtotal
    out.push(makeCapitalGain({
      security: clean(r.fields.security),
      saleDate,
      purchaseDate: cellDate(r.fields.purchaseDate),
      quantity: parseNum(r.fields.quantity),
      saleRate: parseNum(r.fields.saleRate),
      saleAmount: parseNum(r.fields.saleAmount),
      purchaseRate: parseNum(r.fields.purchaseRate),
      purchaseAmount: parseNum(r.fields.purchaseAmt),
      priceOn31Jan2018: parseNum(r.fields.price31Jan),
      effectiveCost: parseNum(r.fields.effectiveCost),
      daysHeld: parseNum(r.fields.daysHeld),
      shortTerm: parseNum(r.fields.shortTerm),
      longTerm: parseNum(r.fields.longTerm),
      effectiveLongTerm: parseNum(r.fields.effectiveLT),
      source,
    }));
  }
  return out.length ? { capitalGains: out, sheet: toAuditSheet("capital-gains", Object.keys(t.columns), t.rows) } : null;
}

/**
 * STATEMENT OF DIVIDEND → dated income per security.
 *
 * The statement carries REVERSALS: a dividend booked and then backed out prints
 * as a negative row against the same security and date. Both are kept — netting
 * them here would hide a correction the account actually experienced — and they
 * cancel when summed, which is the point.
 */
function readDividends(pages, source, warnings) {
  const t = readAcrossPages(pages, DIVIDEND_COLUMNS, { minFields: 5, require: ["security", "exDate"] });
  if (!t) return null;
  if (t.missing?.length) warn(warnings, "columns-not-matched", t.missing.join(", "));

  const out = [];
  for (const r of t.rows) {
    const exDate = cellDate(r.fields.exDate);
    const security = clean(r.fields.security);
    if (!exDate || !security) continue;
    out.push(makeIncomeEvent({
      kind: "dividend",
      security,
      exDate,
      receivedDate: cellDate(r.fields.receivedDate),
      quantity: parseNum(r.fields.quantity),
      ratePerUnit: parseNum(r.fields.rate),
      receivable: parseNum(r.fields.receivable),
      received: parseNum(r.fields.received),
      netAmount: parseNum(r.fields.netAmount),
      tds: parseNum(r.fields.tds),
      source,
    }));
  }
  return out.length ? { income: out, sheet: toAuditSheet("dividends", Object.keys(t.columns), t.rows) } : null;
}

/**
 * CORPORATE BENEFITS → the same events seen from the corporate-action side.
 *
 * A bonus issue has an entitlement and a quantity but no cash (`Amount 0.00`),
 * and that zero is REAL — the statement measured it — so it is kept as 0 rather
 * than dropped. The dividends here overlap the dividend statement; precedence
 * names which one the book uses.
 */
function readCorporateBenefits(pages, source, warnings) {
  const t = readAcrossPages(pages, CORPORATE_BENEFIT_COLUMNS, { minFields: 4, require: ["security", "type"] });
  if (!t) return null;
  if (t.missing?.length) warn(warnings, "columns-not-matched", t.missing.join(", "));

  const out = [];
  for (const r of t.rows) {
    const exDate = cellDate(r.fields.exDate);
    const security = clean(r.fields.security);
    const type = clean(r.fields.type);
    if (!exDate || !security || !type) continue;
    out.push(makeIncomeEvent({
      kind: /bonus/i.test(type) ? "bonus" : /dividend/i.test(type) ? "dividend" : type.toLowerCase(),
      security,
      exDate,
      quantity: parseNum(r.fields.quantity),
      netAmount: parseNum(r.fields.amount),
      entitlement: clean(r.fields.entitlement) || null,
      source,
    }));
  }
  return out.length ? { income: out, sheet: toAuditSheet("corporate-benefits", Object.keys(t.columns), t.rows) } : null;
}

/**
 * BANK BOOK → every cash movement, as dated cash flows.
 *
 * Four money columns and a running balance. Each row is emitted as a cash flow
 * with the SIGN the balance implies: a deposit and income increase it, a
 * withdrawal and an expense reduce it. The running balance is kept so the
 * reconciler can check the flows against it rather than trusting the sum.
 */
function readBankBook(pages, source, warnings) {
  const t = readAcrossPages(pages, BANK_BOOK_COLUMNS, { minFields: 5, require: ["description", "balance"] });
  if (!t) return null;
  if (t.missing?.length) warn(warnings, "columns-not-matched", t.missing.join(", "));

  const out = [];
  for (const r of t.rows) {
    const date = cellDate(r.fields.tranDate);
    const description = clean(r.fields.description);
    if (!date || !description) continue;
    const income = parseNum(r.fields.income);
    const expenses = parseNum(r.fields.expenses);
    const depWith = parseNum(r.fields.depWith);
    const buySell = parseNum(r.fields.buySell);
    out.push(makeCashFlow({
      date,
      description,
      security: clean(r.fields.security) || null,
      kind: "bank-book",
      amount: null,          // the components below are the primitives
      source,
      settlementDate: cellDate(r.fields.setDate),
      tranAccount: clean(r.fields.tranAccount) || null,
      buySellAmount: buySell,
      income,
      expenses,
      depositWithdrawal: depWith,
      balance: parseNum(r.fields.balance),
    }));
  }
  return out.length ? { cashFlows: out, sheet: toAuditSheet("bank-book", Object.keys(t.columns), t.rows) } : null;
}

/**
 * CAPITAL REGISTER → contributions and withdrawals against the capital account.
 *
 * Note what this is NOT: it holds no per-lot purchase dates, so it cannot supply
 * an unrealised short/long-term split. It records capital movements — an opening
 * balance, TDS transfers, contributions — at cost and again at market value.
 */
function readCapitalRegister(pages, source, warnings) {
  const t = readAcrossPages(pages, CAPITAL_REGISTER_COLUMNS, { minFields: 4, require: ["description", "credit", "debit"] });
  if (!t) return null;
  if (t.missing?.length) warn(warnings, "columns-not-matched", t.missing.join(", "));

  const out = [];
  for (const r of t.rows) {
    const date = cellDate(r.fields.tranDate);
    const description = clean(r.fields.description);
    if (!date || !description) continue;
    const credit = parseNum(r.fields.credit);
    const debit = parseNum(r.fields.debit);
    out.push(makeCashFlow({
      date,
      description,
      kind: "capital-register",
      // Credit adds capital, debit removes it. Null when neither was printed.
      amount: credit === null && debit === null ? null : round2((credit ?? 0) - (debit ?? 0)),
      source,
      settlementDate: cellDate(r.fields.setDate),
      credit, debit,
      balance: parseNum(r.fields.balance),
      notes: clean(r.fields.notes) || null,
    }));
  }
  return out.length ? { cashFlows: out, sheet: toAuditSheet("capital-register", Object.keys(t.columns), t.rows) } : null;
}

/** STATEMENT OF EXPENSES → dated charges. */
function readExpenses(pages, source, warnings) {
  const t = readAcrossPages(pages, EXPENSE_COLUMNS, { minFields: 3, require: ["detail", "amount"] });
  if (!t) return null;
  if (t.missing?.length) warn(warnings, "columns-not-matched", t.missing.join(", "));

  const out = [];
  for (const r of t.rows) {
    const date = cellDate(r.fields.date);
    const detail = clean(r.fields.detail);
    const amount = parseNum(r.fields.amount);
    if (!date || !detail || amount === null) continue;
    out.push(makeExpense({
      date,
      settlementDate: cellDate(r.fields.settleDate),
      detail,
      notes: clean(r.fields.notes) || null,
      amount,
      source,
    }));
  }
  return out.length ? { expenses: out, sheet: toAuditSheet("expenses", Object.keys(t.columns), t.rows) } : null;
}

/**
 * EXPENSE STATEMENT SUMMARY → charges by type, undated. See the column block.
 *
 * `date` stays NULL rather than being filled with the period end. These charges
 * happened somewhere inside the window and the statement does not say when; a
 * date invented here would put every fee on one day and make a dated cash-flow
 * series that no statement supports.
 */
function readExpenseSummary(pages, source, warnings, window) {
  const t = readAcrossPages(pages, EXPENSE_SUMMARY_COLUMNS, { minFields: 2, require: ["detail", "amount"] });
  if (!t) return null;
  if (t.missing?.length) warn(warnings, "columns-not-matched", t.missing.join(", "));

  const out = [];
  let printedTotal = null;
  for (const r of t.rows) {
    const detail = clean(r.fields.detail);
    const amount = parseNum(r.fields.amount);
    if (!detail || amount === null) continue;
    // The statement's own Total row is the CHECK on the sum of the rest — it is
    // not one of the charges. Section (a) compares them.
    if (/^total$/i.test(detail)) { printedTotal = amount; continue; }
    out.push(makeExpense({
      date: null,
      detail,
      notes: window?.periodFrom && window?.periodTo ? `${window.periodFrom} to ${window.periodTo}` : null,
      amount,
      paid: parseNum(r.fields.paid),
      payable: parseNum(r.fields.payable),
      source,
    }));
  }
  return out.length
    ? { expenses: out, printedTotal, sheet: toAuditSheet("expense-summary", Object.keys(t.columns), t.rows) }
    : null;
}

/**
 * CURRENT PORTFOLIO → per-position accrued income and IRR%, and nothing else.
 *
 * Everything else on this report is deliberately discarded. Its market value
 * folds accrued income in on some rows but not others (Sundaram Finance yes,
 * Sonata Software no) while its Total G/L adds it on every row, so its figures
 * are on a basis that does not reconcile with anything. Precedence names the
 * appraisal authoritative; this reader takes only the two fields the appraisal
 * does not carry.
 */
function readCurrentPortfolio(pages, source, warnings, { primitives = false } = {}) {
  const t = readAcrossPages(pages, CURRENT_PORTFOLIO_COLUMNS, { minFields: 6, require: ["security", "income"] });
  if (!t) {
    warn(warnings, "current-portfolio-table-not-found", "no security/accrued-income table matched");
    return null;
  }
  const out = [];
  /**
   * The report's own subtotal rows, kept because %Assets cannot be checked
   * without them.
   *
   * This report's printed %Assets is on the income-inclusive basis its market
   * value column only partly shares, which is the inconsistency §4b of CLAUDE.md
   * documents. Reproducing it — `(market value + accrued income) / printed
   * total` — turns 119 unexplained deltas into a named cause, and it needs the
   * printed total. Without it every row on every CURRENT PORTFOLIO reports as an
   * unexplained disagreement and the check stops distinguishing this known basis
   * difference from a real break.
   */
  const subtotals = [];
  for (const r of t.rows) {
    const security = clean(r.fields.security);
    const isSubtotal = parseNumInfo(r.fields.quantity).status !== "ok"
      && parseNumInfo(r.fields.marketValue).status === "ok";
    if (isSubtotal) { subtotals.push({ section: security || null, fields: r.fields }); continue; }
    if (!security) continue;
    const income = parseNum(r.fields.income);
    const irr = parseNum(r.fields.irrPct);
    const annYield = parseNum(r.fields.annYieldPct);
    if (income === null && irr === null && annYield === null) continue;   // heading or subtotal
    if (parseNumInfo(r.fields.quantity).status !== "ok") continue;
    out.push(makeHolding({
      security,
      assetClass: CASH_LINE.test(security) ? "Cash" : "Equity",
      /**
       * THE PRIMITIVES ARE READ ONLY WHERE PRECEDENCE ASKS FOR THEM.
       *
       * `primitives` is true for exactly one manager — Molecule, which publishes
       * no portfolio appraisal, so this report is the only complete holdings
       * table it has. Reading it for two fields left its nine holdings with a
       * market value and no quantity, no cost and no price.
       *
       * For Goldstandard, Green Lantern, Carnelian and V.E.C Assago it stays
       * false and this report keeps the narrow role §4b of CLAUDE.md gives it.
       * That is not shyness about a duplicate: those four appraisals ARE the
       * authoritative source, this report's market value folds accrued income in
       * on some rows and not others, and reading its columns as checks against a
       * document nothing uses put 48 material deltas and 8 row-sum breaks into
       * the reconciliation report about an inconsistency already documented and
       * already measured on the appraisal itself. A check that fires on a
       * conflict nobody has to resolve trains a reader to skip the section.
       */
      quantity: primitives ? parseNum(r.fields.quantity) : null,
      unitCost: primitives ? parseNum(r.fields.unitCost) : null,
      totalCost: primitives ? parseNum(r.fields.totalCost) : null,
      marketPrice: primitives ? parseNum(r.fields.marketPrice) : null,
      // The printed market value is kept as a CHECK, exactly as everywhere else:
      // section (a2) is where a row that folds income in becomes visible.
      marketValue: primitives ? parseNum(r.fields.marketValue) : null,
      pctAssets: primitives ? parseNum(r.fields.pctAssets) : null,
      accruedIncome: income,
      positionIrrPct: irr,
      annualizedYieldPct: annYield,
      absoluteYieldPct: parseNum(r.fields.absYieldPct),
      source,
    }));
  }
  return out.length
    ? {
      holdings: out,
      // Its own subtotals: `Total` is the LAST of them, and the section rows
      // (Shares / Equity / Cash and Equivalent / Other Assets) come before it.
      totals: primitives ? totalsFrom(subtotals, source, warnings) : null,
      sheet: toAuditSheet("current-portfolio", Object.keys(t.columns), t.rows),
    }
    : null;
}

/** Performance summary / history: labelled capital and P&L lines. */
function readFlows(pages, source, window) {
  const find = (re, last = false) => {
    let seen = null;
    for (const page of pages) {
      for (let n = 1; ; n++) {
        const hit = findLabelledNumber(page, re, { occurrence: n });
        if (!hit) break;
        seen = hit.value;
        if (!last) return seen;
      }
    }
    // The performance APPRAISAL is a two-column layout, so its Portfolio Summary
    // labels merge into the allocation table's cells and the page-wide search
    // above finds nothing. Fall back to the items.
    return seen ?? findByItemLabel(pages, re);
  };
  /**
   * EVERY printed portfolio value, in document order, each with its own label.
   *
   * The performance SUMMARY prints two — "Market Value as of 01/04/2026" above
   * and "as of 10/08/2026" below — and they are the window's two endpoints. The
   * performance APPRAISAL prints ONE, "Portfolio Value On 10/08/2026", because
   * its window runs since inception and a since-inception window has no opening
   * value to print: nothing was invested before inception, and its own lines
   * add to the closing from nil (Carnelian: net capital 32,96,46,665 − realised
   * 69,83,811.82 + unrealised 7,90,22,713.85 + income 35,33,336.10 − fees
   * 98,81,286.28 + accrued 62,750 = 39,54,00,366.85, the printed closing).
   *
   * Taking "the first occurrence" as the opening read that ONE line as both
   * ends — ₹188 Cr of openings across nine since-inception bridges, each equal
   * to its own closing, which made every one of them sum to twice its value.
   * So the opening is the first of TWO DIFFERENTLY-LABELLED values, and null
   * where the statement printed only the closing. The item-label fallback for
   * the appraisal's two-column layout finds one value at most, so it can only
   * ever supply a closing.
   */
  const portfolioValues = () => {
    const re = /^(portfolio value on|market value as of)/;
    const hits = [];
    for (const page of pages) {
      for (let n = 1; ; n++) {
        const hit = findLabelledNumber(page, re, { occurrence: n });
        if (!hit) break;
        hits.push(hit);
      }
    }
    if (hits.length) return hits;
    const v = findByItemLabel(pages, re);
    return v === null ? [] : [{ value: v, label: null }];
  };
  const pv = portfolioValues();
  const labelOf = (h) => String(h?.label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const twoEnds = pv.length >= 2 && labelOf(pv[0]) && labelOf(pv[0]) !== labelOf(pv.at(-1));
  const f = makeFlows({
    netCapitalInOut: find(/^(capital in out|net capital in out|net capital)/),
    realized: find(/^(realized gain|realised gain)/),
    unrealized: find(/^(unrealized gain|unrealised gain)/),
    income: find(/^(income received|income)/),
    // "Fees and Expenses" is ONE line on the performance appraisal and two on
    // the performance summary. Matching the combined line under both labels
    // would report the same rupees twice; it lands in `fees` and `expenses`
    // stays null, because the report does not split it.
    expenses: find(/^expenses/),
    fees: find(/^fees/),
    // Both reports print these two, and the closing Portfolio Value includes the
    // accrual: a bridge struck without it misses by exactly that amount.
    accruedIncome: find(/^accrued income/),
    gainPriorToTakeover: find(/^gain prior to take ?over/),
    // The LAST occurrence: the performance summary opens with "Market Value as of
    // 01/04/2026" and closes with "Market Value as of 10/07/2026". Corpus is the
    // closing figure, and taking the first made it the opening one — which then
    // "disagreed" with every other report by a whole period's return.
    corpus: pv.length ? pv.at(-1).value : null,
    // …and the FIRST of two, which is the opening value — only where the report
    // prints both endpoints. See `portfolioValues`: a since-inception appraisal
    // prints one, and its opening is null, never its own closing copied back.
    openingCorpus: twoEnds ? pv[0].value : null,
    ...window,
    source,
  });
  return Object.entries(f).some(([k, v]) => k !== "source" && !k.startsWith("period") && v !== null) ? f : null;
}

/**
 * Fact sheet: the "Portfolio Summary" block in the left column.
 *
 *     Since 26/12/2025            Amount(INR)
 *     Contribution                175,000,000
 *     Withdrawal                       41,000
 *     Profit/Loss                   6,574,677
 *     Portfolio Value(10/07/2026) 181,533,677
 *
 * A different set of lines from the performance summary's, on a different window
 * (since inception rather than since 1 April), so both are kept. Precedence names
 * which report supplies which fact.
 */
function readFactSheetSummary(pages, source, window) {
  const find = (re) => findByItemLabel(pages, re);
  const f = makeFlows({
    contribution: find(/^contribution/),
    withdrawal: find(/^withdrawal/),
    profit: find(/^(profit loss|profit)/),
    corpus: find(/^portfolio value/),
    ...window,
    source,
  });
  return Object.entries(f).some(([k, v]) => k !== "source" && !k.startsWith("period") && v !== null) ? f : null;
}

/**
 * Fact sheet: the "Performance(TWRR)" table in the left column.
 *
 *     MTD    QTD    YTD     Since 26/12/25
 *     Portfolio  2.35%  2.35%  16.69%  3.76%
 *     N50TRI     0.46%  0.46%   7.89% -7.73%
 *
 * "YTD" here is the INDIAN FINANCIAL year to date — the performance summary
 * covering 01/04/2026 to 10/07/2026 prints the same 16.69% — so it is stored as
 * `fytd`, never as a calendar-year figure.
 *
 * The table is located by its own header row and read positionally from there,
 * which is safe because the four period columns are the header: a layout that
 * moves them moves the anchor with them, and a layout that renames them fails to
 * match at all rather than reading four numbers from the wrong place.
 */
function readTwrr(pages, source, { inceptionDate, asOf }) {
  // Two vocabularies, and they are NOT the same measurements:
  //   Goldstandard   MTD  QTD  YTD  Since   → to-date periods
  //   GL / Carnelian 1m   3m   1y   Since   → trailing periods
  // Each maps to its own fields; the other set stays null. Reading "1m" into
  // `mtd` would file a trailing one-month return under a month-to-date label.
  const VOCABULARIES = [
    { header: ["mtd", "qtd"], fields: ["mtd", "qtd", "fytd", "si"] },
    { header: ["1m", "3m"], fields: ["m1", "m3", "y1", "si"] },
  ];
  for (const page of pages) {
    const flat = page.rows.map((r) => (r.items ?? []).map((i) => clean(i.text).toLowerCase()));
    let hdr = -1, vocab = null;
    for (let i = 0; i < flat.length && hdr < 0; i++) {
      for (const v of VOCABULARIES) if (v.header.every((h) => flat[i].includes(h))) { hdr = i; vocab = v; }
    }
    if (hdr < 0) continue;

    // "Return over 1 year period are annualised" — the report's own rule, so SI
    // is annualised only when inception is more than a year back.
    const years = inceptionDate && asOf
      ? (Date.parse(asOf) - Date.parse(inceptionDate)) / (365.25 * 864e5) : null;
    // …and whether those returns are net of fees, which differs by manager.
    const disclosure = page.rows.map((r) => r.cells.map((c) => c.text).join(" ")).join(" ");
    const feeBasis = /returns are (after|before) management fees/i.exec(disclosure)?.[1]?.toLowerCase() ?? null;

    const series = [];
    for (const row of page.rows.slice(hdr + 1, hdr + 8)) {
      const items = (row.items ?? []).map((i) => clean(i.text));
      const label = items[0];
      if (!label || !/^[A-Za-z]/.test(label)) continue;
      const pcts = items.slice(1).filter((t) => /^-?[\d.,]+%$/.test(t)).map(parseNum);
      if (pcts.length < vocab.fields.length) continue;
      series.push(makeReturnSeries({
        series: label,
        // The portfolio's own line is the only one that is not a benchmark.
        isBenchmark: !/^portfolio$/i.test(label),
        ...Object.fromEntries(vocab.fields.map((k, n) => [k, pcts[n]])),
        siAnnualised: years === null ? null : years >= 1,
        feeBasis,
        source,
      }));
    }
    if (series.length) return series;
  }
  return null;
}

/**
 * PERFORMANCE APPRAISAL: the "Portfolio Performance" block.
 *
 *     Period                            Portfolio   N50TRI
 *     1 Month                              6.87 %    3.55 %
 *     3 Months                             6.29 %    0.18 %
 *     6 Months                             4.94 %   -6.08 %
 *     Since inception date 26/12/2025      3.76 %   -7.73 %
 *
 * TRANSPOSED against the fact sheet's table: periods run down the rows and the
 * series across the columns, so the series names come from the header and each
 * row contributes one figure to each of them.
 *
 * A third period vocabulary again, and again mapped to its own fields. The SI
 * figure is the cross-check that the mapping is right: 3.76% here is the same
 * 3.76% the fact sheet prints under "Since 26/12/25".
 */
function readPerformanceAppraisal(pages, source, { inceptionDate, asOf }) {
  const ROW_PERIODS = [
    [/^1\s*month/i, "m1"], [/^3\s*months?/i, "m3"], [/^6\s*months?/i, "m6"],
    [/^1\s*year/i, "y1"], [/^since\s*inception/i, "si"],
  ];
  for (const page of pages) {
    // Read the header from its ITEMS: the series names contain spaces
    // ("S&P BSE 500"), so splitting a joined line would shred them into three.
    const itemRows = page.rows.map((r) => (r.items ?? []).map((i) => clean(i.text)));
    const hdr = itemRows.findIndex((it) => /^period$/i.test(it[0] ?? "") && it.length >= 2);
    if (hdr < 0) continue;
    const names = itemRows[hdr].slice(1).filter(Boolean);
    if (!names.length) continue;

    const lines = page.rows.map((r) => r.cells.map((c) => c.text).join(" "));
    const values = new Map(names.map((n) => [n, {}]));
    for (const line of lines.slice(hdr + 1, hdr + 10)) {
      const field = ROW_PERIODS.find(([re]) => re.test(line.trim()))?.[1];
      if (!field) continue;
      const pcts = [...line.matchAll(/(-?[\d.,]+)\s*%/g)].map((m) => parseNum(m[1]));
      if (pcts.length < names.length) continue;
      names.forEach((n, i) => { values.get(n)[field] = pcts[i]; });
    }
    const filled = names.filter((n) => Object.keys(values.get(n)).length);
    if (!filled.length) continue;

    const years = inceptionDate && asOf
      ? (Date.parse(asOf) - Date.parse(inceptionDate)) / (365.25 * 864e5) : null;
    const disclosure = lines.join(" ");
    const feeBasis = /returns are (after|before) management fees/i.exec(disclosure)?.[1]?.toLowerCase() ?? null;
    return {
      series: filled.map((n) => makeReturnSeries({
        series: n,
        isBenchmark: !/^portfolio$/i.test(n),
        ...values.get(n),
        siAnnualised: years === null ? null : years >= 1,
        feeBasis,
        source,
      })),
      sheet: {
        name: "returns",
        rows: [["period", ...filled], ...ROW_PERIODS.map(([, f]) => f)
          .filter((f) => filled.some((n) => values.get(n)[f] !== undefined))
          .map((f) => [f, ...filled.map((n) => values.get(n)[f] ?? "")])],
      },
    };
  }
  return null;
}

/**
 * Time-weighted returns from the benchmark report.
 *
 * The last two rows carry what we need: the final period row (month to date)
 * and the full-window row, whose cumulative figures are the FINANCIAL
 * year-to-date — the window is literally 01/04/2026 to 10/07/2026.
 */
function readReturns(pages, source, { inceptionDate, asOf }) {
  // The period and its figures arrive as ONE cell on this report — the page has
  // no blank corridor wide enough to split, so "01/04/2026 to 30/04/2026 9.42
  // 7.49 9.42 7.49" is a single string. Match the period as a PREFIX and read
  // the figures out of what follows, rather than requiring the period to fill
  // its own cell (which found nothing at all).
  const PERIOD = /^\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4})\b/;
  for (const page of pages) {
    const periodRows = [];
    for (const row of page.rows) {
      const cells = row.cells.map((c) => c.text);
      const joined = cells.join(" ");
      const m = PERIOD.exec(joined);
      if (!m) continue;
      const nums = joined.slice(m[0].length).trim().split(/\s+/).map(parseNum).filter((v) => v !== null);
      periodRows.push({ from: toIso(m[1]), to: toIso(m[2]), nums });
    }
    if (periodRows.length < 2) continue;

    const window = periodRows[periodRows.length - 1];   // 01/04 → as-of: the FY window
    const lastMonth = periodRows[periodRows.length - 2];
    // Period rows print [portfolio %, benchmark %, cumulative portfolio %, cumulative benchmark %];
    // the closing window row prints only the two cumulative figures.
    const mtdP = lastMonth.nums[0] ?? null, mtdB = lastMonth.nums[1] ?? null;
    const fytdP = window.nums[0] ?? null, fytdB = window.nums[1] ?? null;

    // Since inception is not annualised under a year — the provider's own
    // disclosure, and inception here is ~6.5 months before the report.
    const years = inceptionDate && asOf
      ? (Date.parse(asOf) - Date.parse(inceptionDate)) / (365.25 * 864e5) : null;
    const annualised = years === null ? null : years >= 1;

    return {
      series: [
        makeReturnSeries({ series: "Portfolio", mtd: mtdP, qtd: mtdP, fytd: fytdP, siAnnualised: annualised, source }),
        makeReturnSeries({ series: "N50TRI", isBenchmark: true, mtd: mtdB, qtd: mtdB, fytd: fytdB, siAnnualised: annualised, source }),
      ],
      // QTD equals MTD here because the Indian Q2 begins 1 July and the report
      // closes on 10 July — stated rather than left as a coincidence.
      note: "QTD equals MTD: the quarter began 1 July and the report closes 10 July.",
      sheet: { name: "returns", rows: [["from", "to", "values"], ...periodRows.map((p) => [p.from, p.to, p.nums.join(" ")])] },
    };
  }
  return null;
}

// ── Label-and-figure statements: ASK's P&L account, Marathon's income and expenses ──

/**
 * A printed label, normalised for matching: lower case, the statements' own
 * American spelling of "realized" for either spelling, and every run of
 * punctuation one space — so `Less : Withdrawals` and `Realized Gain/Loss` are
 * matched on their words, never on how the report engine spaced the colon.
 */
const plNorm = (s) => clean(s).toLowerCase().replace(/realis/g, "realiz").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Every printed line, as its words and its figures.
 *
 * Read off the row's ITEMS, as the fact sheet's summary is, because the label
 * and its figure are separate spans: `Capital Contribution | 85,000,000.00`. A
 * figure is an item `parseNum` reads whole; everything else on the line is its
 * label, joined. The balance sheet's reserves block splits its label over two
 * spans (`Add : Reserves and Surplus | - Beginning | 0.00`), which joining keeps
 * together.
 */
function labelledLines(pages) {
  const out = [];
  pages.forEach((page, p) => {
    for (const row of page.rows ?? []) {
      const items = (row.items ?? []).map((i) => clean(i.text)).filter(Boolean);
      if (!items.length) continue;
      const words = [], figures = [];
      for (const t of items) {
        const info = parseNumInfo(t);
        if (info.status === "ok") figures.push(info.value); else words.push(t);
      }
      const label = words.join(" ");
      out.push({ page: p + 1, label, key: plNorm(label), figures });
    }
  });
  return out;
}

/** The P&L account's headings: a section, and the two sub-sections a subtotal closes. */
const PL_TOP = new Map([
  ["income", "income"],
  ["expenses", "expenses"],
  ["unrealized gain loss in the value of investments", "unrealized"],
  ["liabilities", "liabilities"],
  ["assets", "assets"],
]);
const PL_SUB = new Map([
  ["current liabilities and provisions", { parent: "liabilities", key: "currentLiabilities" }],
  ["current assets", { parent: "assets", key: "currentAssets" }],
]);
/** Every line the account prints under a section, by its label. Nothing else is accepted. */
const PL_LINES = {
  income: { "dividend": "dividend", "other income": "otherIncome", "realized gain loss": "realized" },
  expenses: {
    "custodian fees": "custodian", "management fees": "management",
    "securities transaction tax stt": "stt", "other expenses": "otherExpenses",
  },
  unrealized: {
    "at the end of the period": "unrealizedEnd",
    "at the beginning of the period": "unrealizedBeginning",
    "net unrealized gain loss during the period": "unrealizedNet",
  },
  liabilities: {
    "capital contribution": "contribution", "less withdrawals": "withdrawals",
    "add reserves and surplus beginning": "reservesBeginning",
    "for the period": "reservesPeriod", "ending": "reservesEnding",
  },
  assets: { "investments at cost": "investments" },
};
const PL_REQUIRED = [
  "dividend", "otherIncome", "realized", "income.total",
  "custodian", "management", "stt", "otherExpenses", "expenses.total", "surplus",
  "unrealizedEnd", "unrealizedBeginning", "unrealizedNet",
  "contribution", "withdrawals", "reservesBeginning", "reservesPeriod", "reservesEnding",
  "currentLiabilities.subtotal", "liabilities.total",
  "investments", "currentAssets.subtotal", "bank", "assets.total",
];

/**
 * ASK's PROFIT AND LOSS ACCOUNT: the P&L since 1 April 2019 on page one, the
 * balance sheet at the as-of date on page two.
 *
 * It is the only document ASK sends that states the WHOLE LIFE of the mandate —
 * every rupee contributed and withdrawn, every gain, every charge — and the
 * balance sheet closes it to the paisa. So it is read by LABEL, line by line, and
 * published only if the account's own arithmetic holds on every line:
 *
 *   income lines = income TOTAL          expense lines = expenses TOTAL
 *   income − expenses = SURPLUS          end − beginning = net unrealised
 *   reserves: beginning + period = ending, and period = SURPLUS
 *   each sub-section's lines = its (unlabelled) subtotal
 *   contribution − withdrawals + reserves + current liabilities = liabilities TOTAL
 *   investments + current assets = assets TOTAL = liabilities TOTAL
 *
 * each within half a paisa per figure it sums, which is the statement's own
 * printing precision. A line this reader does not know, a line printed twice, a
 * line missing, or one identity that does not hold, and NOTHING is published:
 * a whole-life figure is exactly the kind a reader cannot check without opening
 * the PDF, so a partial one is worse than none.
 *
 * The holding is the bank balance and only that, and only where the balance
 * sheet says it is all there is — investments at cost nil, no unrealised gain,
 * no current liabilities, no other current asset. Both of the family's ASK
 * mandates are closed: Ajay's balance sheet carries ₹0.34 at the bank, Ankita's
 * ₹0.01. A measured nil, not an absence.
 */
function readProfitAndLoss(pages, source, warnings, window) {
  const got = {};
  const subLines = { currentLiabilities: [], currentAssets: [] };
  const problems = [];
  const sheetRows = [];
  let top = null, sub = null;
  let bankLabel = null;
  const put = (key, value, label) => {
    if (key in got) problems.push(`"${label || "(unlabelled)"}" printed twice`);
    got[key] = value;
  };
  for (const line of labelledLines(pages)) {
    if (!line.figures.length) {
      if (PL_TOP.has(line.key)) { top = PL_TOP.get(line.key); sub = null; continue; }
      const s = PL_SUB.get(line.key);
      if (s && s.parent === top) sub = s.key;
      // Anything else without a figure is the letterhead, the period, the
      // account line or the signature — not part of the account.
      continue;
    }
    if (line.figures.length > 1) {
      problems.push(`"${line.label || "(unlabelled)"}" carries ${line.figures.length} figures on one line`);
      continue;
    }
    const value = line.figures[0];
    sheetRows.push({ cells: [line.page, sub ?? top ?? "", line.label || "(unlabelled)", value] });
    if (!line.key) {
      // An unlabelled figure CLOSES the sub-section it sits under: its subtotal.
      if (sub) { put(`${sub}.subtotal`, value, ""); sub = null; continue; }
      // Under the unrealised block the account prints one more unlabelled
      // figure beside the net. Nothing printed says what it is, so it is kept on
      // the audit sheet and asserted by nothing.
      if (top === "unrealized") continue;
      problems.push(`an unlabelled figure (${value}) outside any sub-section`);
      continue;
    }
    if (line.key === "surplus for the period") { put("surplus", value, line.label); continue; }
    if (line.key === "total") {
      if (!top) { problems.push("a TOTAL before any section"); continue; }
      put(`${top}.total`, value, line.label);
      sub = null;
      continue;
    }
    if (sub) {
      // Inside a sub-section every line is summed against the printed subtotal,
      // so a line is accepted by that identity rather than by its name — except
      // the bank balance, which is the holding and must be found by name.
      subLines[sub].push({ key: line.key, label: line.label, value });
      if (line.key === "balance with banks") { put("bank", value, line.label); bankLabel = line.label; }
      continue;
    }
    const field = PL_LINES[top]?.[line.key];
    if (!field) { problems.push(`"${line.label}" under ${top ?? "no heading"}`); continue; }
    put(field, value, line.label);
  }

  if (problems.length) {
    warn(warnings, "profit-and-loss-line-not-recognised", `${problems.join("; ")}. Nothing is published from a P&L account this reader cannot account for line by line.`);
    return null;
  }
  const missing = PL_REQUIRED.filter((k) => !(k in got));
  if (missing.length) {
    warn(warnings, "profit-and-loss-line-missing", `${missing.join(", ")} not printed. Nothing is published from a P&L account that cannot be closed.`);
    return null;
  }

  const g = got;
  const checks = [
    ["income lines = income TOTAL", [g.dividend, g.otherIncome, g.realized], g["income.total"]],
    ["expense lines = expenses TOTAL", [g.custodian, g.management, g.stt, g.otherExpenses], g["expenses.total"]],
    ["income TOTAL − expenses TOTAL = SURPLUS FOR THE PERIOD", [g["income.total"], -g["expenses.total"]], g.surplus],
    ["unrealised: end − beginning = net", [g.unrealizedEnd, -g.unrealizedBeginning], g.unrealizedNet],
    ["reserves: beginning + for the period = ending", [g.reservesBeginning, g.reservesPeriod], g.reservesEnding],
    ["reserves for the period = SURPLUS FOR THE PERIOD", [g.reservesPeriod], g.surplus],
    ["current liabilities = their subtotal", subLines.currentLiabilities.map((l) => l.value), g["currentLiabilities.subtotal"]],
    ["contribution − withdrawals + reserves + current liabilities = liabilities TOTAL",
      [g.contribution, -g.withdrawals, g.reservesEnding, g["currentLiabilities.subtotal"]], g["liabilities.total"]],
    ["current assets = their subtotal", subLines.currentAssets.map((l) => l.value), g["currentAssets.subtotal"]],
    ["investments + current assets = assets TOTAL", [g.investments, g["currentAssets.subtotal"]], g["assets.total"]],
    ["liabilities TOTAL = assets TOTAL", [g["liabilities.total"]], g["assets.total"]],
  ];
  const failed = [];
  for (const [name, parts, printed] of checks) {
    const sum = parts.reduce((s, x) => s + x, 0);
    // Half a paisa for each printed figure the identity touches — the parts and
    // the total — which is the precision every figure is printed to.
    const bound = (parts.length + 1) * 0.005 + 1e-9;
    if (!(Math.abs(sum - printed) <= bound)) failed.push(`${name}: ${round2(sum)} against ${printed} printed`);
  }
  if (failed.length) {
    warn(warnings, "profit-and-loss-does-not-tie", `${failed.join("; ")}. Nothing is published from an account whose own arithmetic does not hold.`);
    return null;
  }

  const flows = makeFlows({
    contribution: g.contribution,
    withdrawal: g.withdrawals,
    realized: g.realized,
    unrealized: g.unrealizedNet,
    income: round2(g.dividend + g.otherIncome),
    fees: g.management,
    expenses: round2(g.custodian + g.stt),
    otherExpenses: g.otherExpenses,
    // What the account is worth at the as-of: its assets at cost, less what it
    // owes, plus the unrealised gain on what it still holds at cost.
    corpus: round2(g["assets.total"] - g["currentLiabilities.subtotal"] + g.unrealizedEnd),
    ...window,
    source,
  });

  const nil = (v) => Math.abs(v) < 0.005;
  const otherAssets = subLines.currentAssets.filter((l) => l.key !== "balance with banks");
  const onlyCash = nil(g.investments) && nil(g.unrealizedEnd) && nil(g["currentLiabilities.subtotal"])
    && otherAssets.every((l) => nil(l.value));
  /**
   * NAMED AS THE BALANCE SHEET PRINTS IT, NEVER "Cash". Nothing here supplies a
   * name the statement did not print (`stripDepositoryTail`'s rule), and the
   * difference is not cosmetic: keyed `cash`, this ₹0.34 would join the book's
   * ₹9.5 Cr of mandate cash sleeves under one securityKey, survive the family's
   * ₹1,000 floor on THEIR total, and stand on every holdings table as a whole
   * closed mandate — whose capital since inception would then count in Capital
   * invested although every rupee of it has been withdrawn. Under its own label
   * it is the speck it is: measured here, carried into the account's value, and
   * dropped from the holdings tables by the floor the family asked for.
   */
  const holdings = onlyCash
    ? [makeHolding({
      security: bankLabel ?? "Balance with Banks", assetClass: "Cash",
      quantity: g.bank, unitCost: 1, totalCost: g.bank, marketPrice: 1, marketValue: g.bank, source,
    })]
    : [];
  if (!onlyCash) {
    warn(warnings, "profit-and-loss-not-only-cash",
      "the balance sheet carries investments, an unrealised gain, a current liability or a current asset other than the bank balance — "
      + "it states no holding line by line, so no holding is read from it; the flows stand.");
  }
  return {
    flows, holdings,
    sheet: toAuditSheet("profitAndLoss", ["page", "section", "label", "figure"], sheetRows),
  };
}

/** Marathon's INCOME AND EXPENSES columns, by their printed headings. */
const IE_COLUMNS = new Map([
  ["client code", "clientCode"], ["client name", "clientName"], ["date until", "dateUntil"],
  ["st gain loss", "st"], ["lt gain loss", "lt"], ["dividend", "dividend"], ["interest", "interest"],
  ["management fees", "management"], ["custodian fees", "custodian"], ["other expenses", "other"], ["stt", "stt"],
]);
const IE_FIGURES = ["st", "lt", "dividend", "interest", "management", "custodian", "other", "stt"];

/**
 * Marathon's DETAILS OF INCOME AND EXPENSES — one row, since 1 April 2018: the
 * short- and long-term gains, dividends, interest and every charge, for the
 * whole life of a mandate that is now entirely in cash and sends nothing else
 * that says so.
 *
 * Located by its eleven printed headings and read ITEM FOR ITEM beneath them —
 * the cells merge on this report, the items do not. Exactly one data row, for
 * THIS account, dated the window's own end; anything else and nothing is read.
 *
 * It states no capital and no closing value, so the flows carry neither: a
 * contribution of nil and a corpus of nil would both be claims this document
 * never makes.
 */
function readIncomeExpense(pages, source, warnings, window, accountNo) {
  const rowItems = (row) => (row.items ?? []).map((i) => clean(i.text)).filter(Boolean);
  for (const page of pages) {
    const rows = page.rows ?? [];
    for (let r = 0; r < rows.length; r++) {
      const header = rowItems(rows[r]);
      const keys = header.map((t) => IE_COLUMNS.get(plNorm(t)));
      if (keys.length !== IE_COLUMNS.size || keys.some((k) => !k) || new Set(keys).size !== keys.length) continue;

      const problems = [];
      const data = [];
      for (const row of rows.slice(r + 1)) {
        const items = rowItems(row);
        if (!items.length) continue;
        if (items.length === header.length) data.push(items);
        else if (items.some((t) => parseNumInfo(t).status === "ok")) problems.push(`a line of ${items.length} item(s) carrying a figure`);
      }
      if (data.length !== 1) problems.push(`${data.length} data row(s) under the headings, not one`);
      const row = data.length === 1 ? Object.fromEntries(keys.map((k, i) => [k, data[0][i]])) : null;
      if (row) {
        if (!accountNo || clean(row.clientCode) !== String(accountNo)) problems.push("the row is for another client code");
        if (toIso(row.dateUntil) !== window.periodTo) problems.push(`dated ${toIso(row.dateUntil) ?? "?"}, not the window's end ${window.periodTo ?? "?"}`);
        for (const k of IE_FIGURES) if (parseNumInfo(row[k]).status !== "ok") problems.push(`${k} did not read as a figure`);
      }
      if (problems.length) {
        warn(warnings, "income-expense-row-not-read", `${problems.join("; ")}. Nothing is read from it.`);
        return null;
      }
      const v = Object.fromEntries(IE_FIGURES.map((k) => [k, parseNum(row[k])]));
      return {
        flows: makeFlows({
          realized: round2(v.st + v.lt),
          income: round2(v.dividend + v.interest),
          fees: v.management,
          expenses: round2(v.custodian + v.stt),
          otherExpenses: v.other,
          ...window,
          source,
        }),
        sheet: toAuditSheet("incomeExpense", header, data.map((cells) => ({ cells }))),
      };
    }
  }
  warn(warnings, "income-expense-row-not-read", "no row printed the eleven Income and Expenses headings");
  return null;
}

/**
 * Extract one statement.
 * @returns {object} partial normalized document
 */
export function extract({ grid, meta }) {
  const warnings = [];
  const pages = grid.pages ?? [];
  const source = meta.docKey;
  const sections = {};
  // AND IT MUST BE GIVEN THE TEXT. This passed `text: ""`, so the letterhead
  // branch above could never fire from here and the decision fell through to
  // the filename every time. The pages are already in hand.
  const provider = meta.providerConfig
    ?? detectProvider({
      fileName: meta.fileName ?? "",
      text: pages.map((p) => p.text ?? "").join("\n"),
      name: meta.provider,
    });

  const id = readIdentity(pages);
  const reportType = meta.reportType;

  let holdings = [], totals = null, returns = [], flows = null;
  let transactions = [], capitalGains = [], income = [], expenses = [], cashFlows = [];
  const window = readPeriod(pages, id);

  if (reportType === "appraisal") {
    const h = readHoldings(pages, warnings);
    if (h) {
      sections.holdings = h.sheet;
      totals = totalsFrom(h.subtotals, source, warnings);
      holdings = h.holdings.map((x) => makeHolding({
        security: x.security,
        // A PMS holds ordinary listed equity — PMS is the engagement, not the
        // asset class. Cash is cash whether the statement puts it under a Cash
        // section (Carnelian, Green Lantern) or prints it as a single line with
        // no section above it.
        assetClass: classOfSection(x.section, x.security),
        quantity: x.quantity,
        unitCost: x.unitCost,
        totalCost: x.totalCost,
        marketPrice: x.marketPrice,
        accruedIncome: x.accruedIncome,
        // Printed figures — cross-checks only; the derived values are computed.
        marketValue: x.printedMarketValue,
        gainLoss: x.printedGainLoss,
        pctGainLoss: x.printedPctGainLoss,
        pctAssets: x.printedPctAssets,
        source,
      }));
    } else warn(warnings, "holdings-table-not-found", reportType);
  }

  if (reportType === "fact-sheet") {
    // Collected apart and added after the summary is read: see the note there.
    const sectorWarnings = [];
    const s = readSectors(pages, sectorWarnings);
    if (s) {
      sections.sectors = s.sheet;
      /**
       * THE FACT SHEET IS THE SECTOR JOIN AND NOTHING ELSE.
       *
       * Its Portfolio Holdings table prints a market value and a weight, and
       * emitting those as holdings is tempting for a manager who publishes no
       * appraisal. It is wrong, and the reconciler said so on 177 rows the one
       * run it was tried:
       *
       *   • The table lists EQUITY ONLY — no cash line. Deriving %assets over
       *     that set divides by a denominator missing the cash, so every weight
       *     comes out high and the printed column, struck on the full portfolio,
       *     disagrees with all of them. Molecule's own weights sum to 98.09%
       *     precisely because the missing 1.91% is the cash the table omits.
       *   • There is no quantity and no unit cost, so the holdings would carry a
       *     market value with no basis under it and report their whole value as
       *     profit if a cost were ever assumed.
       *
       * The manager that prompted this — Molecule — publishes a full CURRENT
       * PORTFOLIO two pages later in the same PDF, with quantity, unit cost and
       * market price. Splitting the bundle gets the primitives properly; reading
       * a summary table as if it were a holdings statement never would.
       */
      holdings = [...s.sectors.entries()].map(([security, providerSector]) =>
        makeHolding({ security, assetClass: "Equity", providerSector, source }));
    }
    // Since inception, not since 1 April — the block is headed "Since 26/12/2025".
    flows = readFactSheetSummary(pages, source, { periodFrom: id.inceptionDate, periodTo: id.asOf });
    if (!flows) warn(warnings, "portfolio-summary-not-found", reportType);
    // A fact sheet whose own summary prints a portfolio value of NIL has no
    // holdings table to find — a closed mandate (Ankita's ASK account) holds
    // nothing to list. "No sector table" there is the statement being right,
    // not the reader failing, and a warning would send the next reader looking
    // for a table that was never printed. Anywhere else the warning stands.
    warnings.push(...sectorWarnings.filter((w) => !(w.code === "sector-table-not-found" && flows?.corpus === 0)));
    const t = readTwrr(pages, source, { inceptionDate: id.inceptionDate, asOf: id.asOf });
    if (t) returns = t;
    else warn(warnings, "twrr-table-not-found", reportType);
  }

  if (reportType === "performance-summary" || reportType === "performance-history") {
    flows = readFlows(pages, source, readPeriod(pages, id));
    if (!flows) warn(warnings, "flows-not-found", reportType);
  }

  if (reportType === "performance-benchmark" || reportType === "performance-history") {
    // Two different tables under one report type. The benchmark report prints
    // dated period rows; the performance appraisal prints a transposed
    // period-by-series block. Try each, and warn only when neither is there.
    const r = readReturns(pages, source, { inceptionDate: id.inceptionDate, asOf: id.asOf })
      ?? readPerformanceAppraisal(pages, source, { inceptionDate: id.inceptionDate, asOf: id.asOf });
    if (r) { returns = r.series; sections.returns = r.sheet; }
    else warn(warnings, "returns-table-not-found", "neither a dated period table nor a Portfolio Performance block matched");
  }

  // ── The dated statements. Each is one table, read across every page. ──
  if (reportType === "transaction-statement") {
    const r = readTransactions(pages, source, warnings);
    if (r) { transactions = r.transactions; sections.transactions = r.sheet; }
    else warn(warnings, "transactions-table-not-found", reportType);
  }

  if (reportType === "capital-gain") {
    const r = readCapitalGains(pages, source, warnings);
    if (r) { capitalGains = r.capitalGains; sections.capitalGains = r.sheet; }
    else warn(warnings, "capital-gain-table-not-found", reportType);
  }

  if (reportType === "dividend-statement") {
    const r = readDividends(pages, source, warnings);
    if (r) { income = r.income; sections.dividends = r.sheet; }
    else warn(warnings, "dividend-table-not-found", reportType);
  }

  if (reportType === "corporate-benefits") {
    const r = readCorporateBenefits(pages, source, warnings);
    if (r) { income = r.income; sections.corporateBenefits = r.sheet; }
    else warn(warnings, "corporate-benefits-table-not-found", reportType);
  }

  if (reportType === "bank-book") {
    const r = readBankBook(pages, source, warnings);
    if (r) { cashFlows = r.cashFlows; sections.bankBook = r.sheet; }
    else warn(warnings, "bank-book-table-not-found", reportType);
  }

  if (reportType === "capital-register") {
    const r = readCapitalRegister(pages, source, warnings);
    if (r) { cashFlows = r.cashFlows; sections.capitalRegister = r.sheet; }
    else warn(warnings, "capital-register-table-not-found", reportType);
  }

  if (reportType === "expense-statement") {
    // Dated first, then the by-type summary. Two real tables under one title;
    // trying the itemised one first means a manager who prints both is read at
    // the finer grain.
    const r = readExpenses(pages, source, warnings)
      ?? readExpenseSummary(pages, source, warnings, window);
    if (r) { expenses = r.expenses; sections.expenses = r.sheet; }
    else warn(warnings, "expense-table-not-found", reportType);
  }

  if (reportType === "holdings") {
    // Precedence decides whether this report is the holdings source or the
    // accrued-income-and-IRR source. It is a committed decision, read here
    // rather than guessed from what the document happens to contain.
    const r = readCurrentPortfolio(pages, source, warnings, {
      primitives: PRECEDENCE[provider?.name]?.holdings?.reportType === "holdings",
    });
    if (r) { holdings = r.holdings; totals = r.totals ?? totals; sections.currentPortfolio = r.sheet; }
  }

  if (reportType === "profit-and-loss") {
    // Every refusal names its own cause in a warning from the reader.
    const r = readProfitAndLoss(pages, source, warnings, window);
    if (r) { flows = r.flows; holdings = r.holdings; sections.profitAndLoss = r.sheet; }
  }

  if (reportType === "income-expense") {
    const r = readIncomeExpense(pages, source, warnings, window, id.accountNo ?? meta.accountNo);
    if (r) { flows = r.flows; sections.incomeExpense = r.sheet; }
  }

  if (!READABLE.has(reportType)) {
    warn(warnings, "no-reader-for-report-type",
      `${reportType}: this engine reads ${[...READABLE].join(", ")}. Left unread rather than half-read.`);
  }

  const gotSomething = holdings.length || totals || returns.length || flows
    || transactions.length || capitalGains.length || income.length || expenses.length || cashFlows.length;
  return {
    provider: provider?.name ?? meta.provider ?? "(unidentified)",
    // A PMS mandate is how the account is RUN. Every manager here is a PMS.
    engagement: provider?.engagement ?? "unknown",
    providerEngagement: "Portfolio Management Service",
    accountNo: id.accountNo ?? meta.accountNo,
    clientCode: id.clientCode,
    owner: id.owner ?? meta.ownerName,
    strategy: id.strategy ?? meta.strategy,
    // A dated statement prints no "As of" — it prints "From X to Y", and its
    // as-of IS that window's end. Without this the transaction statement, bank
    // book, dividend and capital gain all key as `…-unknown-…`, which files them
    // apart from the appraisal they belong beside.
    asOf: id.asOf ?? meta.asOfDate ?? window.periodTo,
    inceptionDate: id.inceptionDate,
    holdings, totals, returns, flows,
    transactions, capitalGains, income, expenses, cashFlows,
    // Every dated statement states its own window in its header. Carried so the
    // reconciler never compares a financial-year figure against a since-inception
    // one — that mismatch produced 14 phantom deltas during calibration.
    ...window,
    sections,
    warnings,
    status: !gotSomething ? "failed" : warnings.length ? "partial" : "ok",
  };
}
