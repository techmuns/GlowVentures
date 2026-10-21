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
import { securityKeyOf, splitSecurityName } from "../../../shared/securityKey.mjs";

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
    letterhead: /carnelian\s+(?:asset\s+management|bespoke\s+portfolio)/i,
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
  svan: {
    name: "SVAN Investment Managers LLP",
    filePrefix: /^Z128[12]_87100/,
    letterhead: /SVAN\s+INVESTMENT\s+MANAGERS/i,
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
  /**
   * `Effective Gain-` over `LT`, wrapped. The joined label is the first alias;
   * the top line alone is the second, because Carnelian's and SVAN's capital
   * gain statements print a `#` marker column hard against the right of this
   * one (x≈800, beside figures ending at 796) and the wrapped `LT` (788–796)
   * sits nearer that marker's centre than its own column's — so the per-column
   * join never forms and a printed, populated column read as unmatched. The top
   * line sits squarely over its own figures. `After Index -LT` (the unlisted
   * block's indexed gain) is a different measure and matches neither.
   */
  effectiveLT:  [/^effective\s*gain\s*lt/, /^effective\s*gain/],
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

/**
 * …AND THE TDS COLUMN BY ITS WHOLE LABEL, where the first word alone did not
 * place it.
 *
 * V.E.C's July statement (128005, to 06/07/2026) prints `TDS Amount` as one
 * span (763–809) over figures right-aligned at 795–809. Matched on `tds` alone,
 * the claim covers only those three letters (763–777), which overlap no
 * measured column; it falls to the nearest centre — the Balance column, already
 * taken — and a column printing `0.00` on every row read as unmatched. Matched
 * whole, the span overlaps its own figures. Used only as a second reading where
 * the first left `tds` unmatched, so every statement the first reading already
 * places is read exactly as before.
 */
const DIVIDEND_COLUMNS_TDS_LABEL = { ...DIVIDEND_COLUMNS, tds: [/^tds\s*amount/, /^tds/] };

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

/**
 * STATEMENT OF EXPENSES — fees and charges, dated.
 *
 * `Tran Ref.` is PRINTED AND MAY BE BLANK: SVAN's statements (Z1282_8710067 /
 * 8710090, to 30/09/2026) print the label at x≈207–240 and not one row carries
 * a reference beneath it, on any of their four pages. So it binds only where its
 * own label sits over a measured column (`EXPENSE_OVERLAP_ONLY`), and a label
 * over an empty column is not reported as a column this reader failed to find.
 */
const EXPENSE_OVERLAP_ONLY = ["tranRef"];
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

/**
 * Sub-header text that prints inside a data column, not a value.
 *
 * `(Cost)` is Buoyant's: its appraisal heads the weight column `% Assets` and
 * prints `(Cost)` on the line beneath — the basis the weight is struck on, a
 * label like `Accrued Income` beside it, not a figure that failed to parse.
 */
const HEADER_LABEL = /^(accrued\s*income|market\s*value|unit\s*cost|total\s*cost|%\s*(g\s*\/?\s*l|assets)|price|quantity|cost|\(cost\))$/i;

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
  // Read whole into the audit archive and checked; supply nothing to the book
  // but the lot register. See readPerformanceBySecurity, readTrialBalance and
  // readOpenLots.
  "performance-by-security", "trial-balance", "open-lots",
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
  /** Every section heading the appraisal printed, in order — see totalsFrom. */
  const headings = [];
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
      if (name && !populated.length && SECTION_ROW.test(name)) { section = name; headings.push(name); continue; }

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
      // THE PRINT DATE IN THE FOOTER, under a figure column. SVAN's appraisal
      // prints `07/10/2026` alone at the foot of every page, right-aligned under
      // `% Assets` — a row with no security, no figure and nothing but that date.
      // It is the day the report was run (the statement is as of 30/09/2026), so
      // it is page furniture exactly as `DATE_ONLY` already treats it in the
      // name column, and nothing was lost by not reading it as a weight.
      const footerDate = !clean(r.fields.security)
        && numericFields.every((f) => !clean(r.fields[f]) || DATE_ONLY.test(clean(r.fields[f])))
        && numericFields.some((f) => DATE_ONLY.test(clean(r.fields[f])));
      if (footerDate) continue;
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
    headings,
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
function totalsFrom(subtotals, source, warnings, headings = null) {
  if (!subtotals.length) return null;
  const val = (r, f) => parseNum(r.fields[f]);
  const bySection = (name) => subtotals.find((s) => s.section && new RegExp(`^${name}`, "i").test(s.section));

  const equity = bySection("equit");
  const cash = bySection("cash");
  const grand = subtotals[subtotals.length - 1];
  /**
   * AN APPRAISAL WITH NO EQUITY SECTION HAS NO EQUITY SUBTOTAL TO FIND.
   *
   * Buoyant's appraisal prints two sections — `Cash and Equivalent` and
   * `Alternative Assets` (its Category III units) — and a subtotal under each;
   * there is no Equity heading anywhere on it, so "no subtotal closed the
   * Equity section" described a section the statement never had. The equity
   * figures stay null, which is the truth. Where the appraisal prints no
   * section headings at all, or does print an Equity heading, a missing equity
   * subtotal is still reported exactly as before.
   */
  const noEquitySection = Array.isArray(headings) && headings.length > 0
    && !headings.some((h) => /^equit/i.test(h));
  if (!equity && !noEquitySection) warn(warnings, "equity-subtotal-not-found", "no unlabelled subtotal closed the Equity section");

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
  const tables = [];
  let map = null, missing = null;
  pages.forEach((page, pageIndex) => {
    const table = findTable(page, columns, { minFields: opts.minFields ?? 4, ...LAYOUT, ...opts });
    if (!table) return;
    if (opts.require && !opts.require.every((f) => f in table.columns)) return;
    const r = readRows(page, table, {});
    if (!r.rows.length) return;
    map ??= table.columns;
    // A field bound only where its label sits over a measured column, whose
    // label IS printed and has nothing under it on this page, is a printed
    // column the statement left blank — read, and empty. It is not missing.
    missing ??= table.missing.filter((f) => !printedOverBlank(table, columns, opts.overlapOnly, f));
    tables.push({ pageIndex, page, table });
    rows.push(...r.rows.map((x) => ({ ...x, pageIndex })));
  });
  return rows.length ? { rows, columns: map, missing, tables } : null;
}

/** Header text normalised the way `lib/table.mjs` matches it. */
const normLabel = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

/** The header items of a located table — every line of its header block. */
const headerItems = (table) => (table.grid?.rows ?? []).slice(0, table.headerRows ?? 1).flatMap((r) => r.items ?? []);

/**
 * IS THIS UNMATCHED FIELD A PRINTED LABEL OVER AN EMPTY COLUMN?
 *
 * True only for a field the caller binds by overlap alone (`overlapOnly`), when
 * one of its header spans matches its alias AND that span overlaps no column the
 * body measured — the statement printed the heading and nothing beneath it.
 * Buoyant's `Exchg` over its fund's own allotments and SVAN's `Tran Ref.` over
 * every expense are the two in this corpus. A label that does sit over a
 * measured column and still went unbound is a real miss and stays reported.
 */
function printedOverBlank(table, aliases, overlapOnly, field) {
  if (!(overlapOnly ?? []).includes(field)) return false;
  const cols = table.grid?.columns ?? [];
  return headerItems(table).some((it) => (aliases[field] ?? []).some((re) => re.test(normLabel(it.text)))
    && !cols.some((c) => Math.min(it.x + it.width, c.x1) - Math.max(it.x, c.x0) > 0));
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
    // The since-inception issue prints "Settlement" ABOVE the main header line
    // and "Date" below it; see `labelLineAbove` in lib/table.mjs.
    labelLineAbove: true,
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
  // A page can leave Balance entirely blank, including its subtotals. Its
  // header must not fall back to the neighbouring TDS column: that discarded
  // 124 explicitly printed zero-TDS values in the September ASK statements.
  const opts = { minFields: 5, require: ["security", "exDate"], overlapOnly: ["balance"] };
  let t = readAcrossPages(pages, DIVIDEND_COLUMNS, opts);
  if (!t) return null;
  if (t.missing?.includes("tds")) {
    const whole = readAcrossPages(pages, DIVIDEND_COLUMNS_TDS_LABEL, opts);
    // Taken only where it places the TDS column and loses nothing the first
    // reading placed.
    if (whole && !whole.missing.includes("tds") && Object.keys(t.columns).every((f) => f in whole.columns)) t = whole;
  }
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
  const recovered = t.missing?.includes("notes") ? recoverRegisterNotes(t) : null;
  const missing = (t.missing ?? []).filter((f) => !(f === "notes" && recovered));
  if (missing.length) warn(warnings, "columns-not-matched", missing.join(", "));
  if (recovered) {
    for (const r of t.rows) {
      const n = recovered.get(r);
      if (n === undefined) continue;
      r.fields = { ...r.fields, notes: n.notes, ...(n.setDate !== undefined ? { setDate: n.setDate } : {}) };
      if (n.cells) r.cells = n.cells;
    }
  }

  const out = [];
  for (const r of t.rows) {
    const date = cellDate(r.fields.tranDate);
    const description = clean(r.fields.description);
    if (!date || !description) {
      // A notes line with nothing else on it CONTINUES the entry above it:
      // `BUOYANT OPPORTUNITIES STRATEGY -` / `CATEGORY III - CLASS A4 -
      // 1619755.801214` is one note printed over two lines.
      const prev = out[out.length - 1];
      const n = clean(r.fields.notes);
      if (recovered && prev && n && !description && !date
        && Object.entries(r.fields).every(([k, v]) => k === "notes" || k === "setDate" || !clean(v))) {
        prev.notes = `${prev.notes ?? ""} ${n}`.replace(/\s+/g, " ").trim();
      }
      continue;
    }
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
  const header = Object.keys(t.columns);
  if (recovered && !header.includes("notes")) header.splice(header.includes("setDate") ? header.indexOf("setDate") + 1 : header.length, 0, "notes");
  return out.length ? { cashFlows: out, sheet: toAuditSheet("capital-register", header, t.rows) } : null;
}

/**
 * THE CAPITAL REGISTER'S `Desc/Notes`, READ UNDER ITS OWN LABEL WHERE THE BODY
 * DID NOT SEPARATE IT.
 *
 * Buoyant 103473's register (to 31/07/2026) prints the label at x≈229 and two
 * notes beneath it — `BUOYANT OPPORTUNITIES STRATEGY - / CATEGORY III - CLASS A4
 * - 1619755.801214` against the class switch's Security in, and the A1 units
 * against its Security out. The Set Date figures end at 227 and the notes start
 * at 235, but the Total row's `Closing Balance` (229–287) closes that corridor,
 * so the body measures Set Date and Desc/Notes as ONE column: the notes were
 * glued onto the settlement date (which then read as no date at all) and the
 * label bound to nothing. 103472's register, which prints no notes, separates
 * cleanly — the same layout, one row different.
 *
 * So where `notes` went unmatched and its label IS printed, each body row's
 * notes are the spans that start at or right of the label's left edge and end
 * before the next header label to its right (the money columns are
 * right-aligned to theirs, so none of their figures qualifies). A Set Date cell
 * that ended in exactly those words gives them back. Returns a Map row → {notes,
 * setDate, cells}, or null where no page prints the label.
 */
function recoverRegisterNotes(t) {
  const out = new Map();
  let found = false;
  for (const { pageIndex, table } of t.tables ?? []) {
    const head = headerItems(table);
    const label = head.find((it) => CAPITAL_REGISTER_COLUMNS.notes.some((re) => re.test(normLabel(it.text))));
    if (!label) continue;
    const right = head.filter((it) => it.x > label.x + label.width).map((it) => it.x).sort((a, b) => a - b)[0] ?? Infinity;
    found = true;
    const body = (table.grid?.rows ?? []).slice(table.bodyFrom ?? table.headerRows ?? 1);
    for (const r of t.rows.filter((x) => x.pageIndex === pageIndex)) {
      const g = body.find((b) => b.y === r.y);
      if (!g) continue;
      const spans = (g.items ?? []).filter((it) => it.x >= label.x - 1 && it.x + it.width <= right)
        .sort((a, b) => a.x - b.x);
      const notes = spans.map((it) => clean(it.text)).join(" ").replace(/\s+/g, " ").trim();
      if (!notes) continue;
      const entry = { notes };
      const sd = clean(r.fields.setDate);
      if (sd.endsWith(notes)) entry.setDate = sd.slice(0, sd.length - notes.length).trim();
      // The audit sheet's cells: the glued cell split back into its two columns.
      const at = r.cells.findIndex((c) => clean(c) === sd);
      if (entry.setDate !== undefined && at >= 0) {
        entry.cells = [...r.cells.slice(0, at), ...(entry.setDate ? [entry.setDate] : []), notes, ...r.cells.slice(at + 1)];
      }
      out.set(r, entry);
    }
  }
  return found ? out : null;
}

/** STATEMENT OF EXPENSES → dated charges. */
function readExpenses(pages, source, warnings) {
  const t = readAcrossPages(pages, EXPENSE_COLUMNS, { minFields: 3, require: ["detail", "amount"], overlapOnly: EXPENSE_OVERLAP_ONLY });
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
/**
 * `Other Income` is NOT required. ASK's account prints it; Carnelian's
 * (3517383, 01/04/2026 to 07/10/2026) prints its INCOME block as `Dividend`,
 * `Realized Gain/Loss` and `TOTAL` and nothing else — 17,74,297.60 − 17,63,423.42
 * = 17,874.18, the printed TOTAL — and its trial balance for the same window
 * carries no other-income account at all (the liquid fund's 3,453.96 is inside
 * the realised line, beside the shares' −17,66,877.38). A line the layout does
 * not print is not a line the reader missed: the income identity is struck over
 * the lines that ARE printed, and still has to reproduce the printed TOTAL.
 */
const PL_OPTIONAL = new Set(["otherIncome"]);
const PL_REQUIRED = [
  "dividend", "otherIncome", "realized", "income.total",
  "custodian", "management", "stt", "otherExpenses", "expenses.total", "surplus",
  "unrealizedEnd", "unrealizedBeginning", "unrealizedNet",
  "contribution", "withdrawals", "reservesBeginning", "reservesPeriod", "reservesEnding",
  "currentLiabilities.subtotal", "liabilities.total",
  "investments", "currentAssets.subtotal", "bank", "assets.total",
];

/**
 * WHICH FLOW EACH PRINTED LINE IS ADDED INTO, for the two whole-life reports
 * that print more lines than `makeFlows` has fields: ASK's profit and loss
 * account and Marathon's income and expenses.
 *
 * `income` is dividend plus other income (or interest), `expenses` is custodian
 * fees plus STT, `realized` is short- plus long-term. Folded into one figure the
 * report's own lines stop being visible — a reader looking for the dividend sees
 * only "income" — so each line is carried as printed beside the flow it is part
 * of, under the label the statement printed. `printedLines` emits them in the
 * order this map lists, which is the report's own order of lines.
 */
const PL_FLOW = {
  dividend: "income", otherIncome: "income", realized: "realized",
  custodian: "expenses", management: "fees", stt: "expenses", otherExpenses: "otherExpenses",
  unrealizedNet: "unrealized",
  contribution: "contribution", withdrawals: "withdrawal",
};
const IE_FLOW = {
  st: "realized", lt: "realized", dividend: "income", interest: "income",
  management: "fees", custodian: "expenses", other: "otherExpenses", stt: "expenses",
};
/**
 * THE BRIDGE LINES THESE TWO REPORTS DO NOT PRINT, STATED AS SUCH. `makeFlows`
 * reads an absent key as "no reader looked" and a null as "the reader looked and
 * the report prints none" — and the book words the first as a line "not read
 * from this report". Both readers here know every line their report prints: the
 * profit and loss account refuses any line it cannot place, and the income and
 * expense statement must print exactly its eleven headings. So an accrued
 * income, a change in accruals or a gain prior to takeover is not a line they
 * missed; it is a line neither statement has, and saying it was "not read"
 * would send the family looking for a figure their statement never printed.
 */
const NOT_PRINTED_BRIDGE_LINES = { accruedIncome: null, changeInAccruals: null, gainPriorToTakeover: null };

/**
 * The printed lines behind each flow, as `{ label, flow, value }`. A line whose
 * label or value was not read is not invented: the label is the statement's own
 * and the value its own primitive, and a map entry with neither is skipped.
 */
function printedLines(flowOf, labels, values) {
  const out = [];
  for (const [key, flow] of Object.entries(flowOf)) {
    if (!(key in values) || !labels[key]) continue;
    out.push({ label: labels[key], flow, value: values[key] });
  }
  return out;
}

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
  const labels = {};
  const put = (key, value, label) => {
    if (key in got) problems.push(`"${label || "(unlabelled)"}" printed twice`);
    got[key] = value;
    labels[key] = label;
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
  const missing = PL_REQUIRED.filter((k) => !(k in got) && !PL_OPTIONAL.has(k));
  if (missing.length) {
    warn(warnings, "profit-and-loss-line-missing", `${missing.join(", ")} not printed. Nothing is published from a P&L account that cannot be closed.`);
    return null;
  }

  const g = got;
  const otherIncomePrinted = "otherIncome" in g;
  const checks = [
    ["income lines = income TOTAL", [g.dividend, ...(otherIncomePrinted ? [g.otherIncome] : []), g.realized], g["income.total"]],
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

  /**
   * THE BALANCE SHEET'S CAPITAL IS A BALANCE, AND A FLOW ONLY OVER A WINDOW
   * THAT OPENS AT INCEPTION.
   *
   * `Capital Contribution` and `Less : Withdrawals` are what the account holds
   * AT THE CLOSE, from its first day. ASK's account runs from inception (its
   * reserves begin at 0.00), so there the balance and the window's capital
   * movement are the same figure. Carnelian's runs from 01/04/2026 and its
   * reserves BEGIN at −80,46,939.72: the account was years old when the window
   * opened, and its 33,00,00,000.00 of contribution is a balance carried in —
   * its trial balance moves the capital account by 1,77,851.00 in the window.
   * Published as the window's contribution it would tell the bridge, the
   * capital anchors and the bank-book witness that ₹33 Cr went in since
   * April. So where beginning reserves are not nil, the window's contribution
   * and withdrawal are NOT PRINTED here: null, and the balance-sheet lines stay
   * on the audit sheet, where they tie the balance sheet as before.
   */
  const fromInception = Math.abs(g.reservesBeginning) < 0.005;
  if (!fromInception) {
    warn(warnings, "profit-and-loss-capital-is-a-balance",
      `reserves begin the window at ${g.reservesBeginning}, so the account predates ${window?.periodFrom ?? "the window"}: `
      + `Capital Contribution (${g.contribution}) and Withdrawals (${g.withdrawals}) are balances at the close, not the window's `
      + "capital movement, and are not published as its contribution or withdrawal.");
  }
  const flowOf = fromInception ? PL_FLOW
    : Object.fromEntries(Object.entries(PL_FLOW).filter(([k]) => k !== "contribution" && k !== "withdrawals"));
  const flows = makeFlows({
    contribution: fromInception ? g.contribution : null,
    withdrawal: fromInception ? g.withdrawals : null,
    realized: g.realized,
    unrealized: g.unrealizedNet,
    income: round2(g.dividend + (otherIncomePrinted ? g.otherIncome : 0)),
    fees: g.management,
    expenses: round2(g.custodian + g.stt),
    otherExpenses: g.otherExpenses,
    // What the account is worth at the as-of: its assets at cost, less what it
    // owes, plus the unrealised gain on what it still holds at cost.
    corpus: round2(g["assets.total"] - g["currentLiabilities.subtotal"] + g.unrealizedEnd),
    ...NOT_PRINTED_BRIDGE_LINES,
    ...window,
    source,
    lines: printedLines(flowOf, labels, g),
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
      // In the order the report prints its columns, under the headings it prints.
      const printedOrder = Object.fromEntries(keys.filter((k) => IE_FLOW[k]).map((k) => [k, IE_FLOW[k]]));
      const labelOf = Object.fromEntries(keys.map((k, i) => [k, header[i]]));
      return {
        flows: makeFlows({
          realized: round2(v.st + v.lt),
          income: round2(v.dividend + v.interest),
          fees: v.management,
          expenses: round2(v.custodian + v.stt),
          otherExpenses: v.other,
          ...NOT_PRINTED_BRIDGE_LINES,
          ...window,
          source,
          lines: printedLines(printedOrder, labelOf, v),
        }),
        sheet: toAuditSheet("incomeExpense", header, data.map((cells) => ({ cells }))),
      };
    }
  }
  warn(warnings, "income-expense-row-not-read", "no row printed the eleven Income and Expenses headings");
  return null;
}

// ── Three more reports from the same system: read IN FULL, supplying nothing ──
//
// PERFORMANCE BY SECURITY SINCE INCEPTION, TRIAL BALANCE and OPEN LOTS (the
// October 2026 delivery, Carnelian 3517383 and V.E.C 128004). None of the three
// is named in `precedence.mjs`, deliberately: each restates, at another grain,
// facts the appraisal, the P&L account and the dated statements already supply
// to the book, and a second holdings snapshot or a second flow block from them
// would be counted beside the first. So each table is captured whole as an
// audit section, every identity the report prints is checked against its own
// rows (`checks`), and the one fact the document model carries that only one of
// them states — the dated purchase lots behind the holdings still held — is
// emitted as `openLots`, the lot register, and never as a holding.
//
// All three print their figures RIGHT-ALIGNED TO THEIR OWN HEADER LABELS (a
// figure ends where its label ends, measured to the point on every page), and
// all three carry pages that print ONLY totals — the body-measured grid of
// `findTable` has two rows to measure there and misplaced the Open Lots
// totals by a column. So these readers place each figure under the label whose
// RIGHT EDGE it shares: the header text still decides which column is which,
// and the geometry is the label's own rather than whatever a page happens to
// carry beneath it.

/** Is this span a figure — a number, a date or the dash a column prints for none? */
const isCellText = (t) => parseNumInfo(t).status === "ok" || DATE_CELL.test(t) || /^-$/.test(clean(t));

/** Label spans on one header line, by alias: `{ field: item }`. First match per field. */
function labelSpans(items, aliases) {
  const out = {};
  for (const it of items ?? []) {
    const t = normLabel(it.text);
    for (const [f, res] of Object.entries(aliases)) {
      if (f in out) continue;
      if (res.some((re) => re.test(t))) { out[f] = it; break; }
    }
  }
  return out;
}

/** The field whose label's RIGHT EDGE this span shares (within `tol` points), or null. */
function underLabel(it, labels, tol = 4) {
  let best = null, dist = Infinity;
  const r = it.x + it.width;
  for (const [f, l] of Object.entries(labels)) {
    const d = Math.abs(r - (l.x + l.width));
    if (d < dist) { dist = d; best = f; }
  }
  return dist <= tol ? best : null;
}

/** A pass/fail ledger in the shape `makeDocument`'s `checks` carries. */
function checkLedger() {
  const passed = [], failed = [], notApplicable = [];
  return {
    passed, failed, notApplicable,
    note(name, ok, detail = "") { (ok ? passed : failed).push(ok || !detail ? name : `${name}: ${detail}`); },
    result: () => ({ passed, notApplicable, failed }),
  };
}

const sumBy = (rows, key) => rows.reduce((s, r) => s + (r[key] ?? 0), 0);

/** PERFORMANCE BY SECURITY — the first printed line of each record. */
const PBS_LINE1 = {
  security:      [/^security\s*name$/, /^security$/],
  quantity:      [/^(qty|quantity)$/],
  marketValue:   [/^market\s*value$/],
  pctAssets:     [/^%\s*assets$/],
  totalCost:     [/^total\s*cost$/],
  unrealized:    [/^unreali[sz]ed\s*gain$/],
  realized:      [/^reali[sz]ed\s*gain$/],
  accruedIncome: [/^accrued\s*income$/],
  absIrrPct:     [/^abs\s*irr\s*%?$/],
  irrPct:        [/^irr\s*%?$/],
  priceDate:     [/^price\s*as\s*on$/],
};
/** …and the second, printed under the first in the SAME columns. */
const PBS_LINE2 = {
  unitPrice:      [/^unit\s*price$/],
  unitCost:       [/^unit\s*cost$/],
  pctGainLoss:    [/^%\s*gain\s*loss$/],
  priorGain:      [/^prior\s*transfer\s*gain$/],
  incomeReceived: [/^income\s*received$/],
  absBmIrrPct:    [/^abs\s*bm\s*irr\s*%?$/],
  bmIrrPct:       [/^bm\s*irr\s*%?$/],
  benchmark:      [/^bench\s*mark$/],
};

/**
 * PERFORMANCE BY SECURITY SINCE INCEPTION — one record per holding, PRINTED
 * OVER TWO LINES, and the subtotals likewise:
 *
 *   Security Name   Qty      Market Value  %Assets  Total Cost  Unrealised Gain  Realized Gain  Accrued Income  Abs IRR%  IRR%  Price as on
 *                            Unit Price             Unit Cost   % Gain/Loss      Prior/Transfer Income Received Abs BM IRR BM IRR% Bench mark
 *   Biocon Ltd      125,500  46,322,050   12.03 %  47,954,139  -1,632,089       0              0               -3.74 %   -2.19 % 06/10/2026
 *                            369.10                382.10      -3.40 %          0              95,958          -3.74 %   -2.19 %
 *
 * Every column carries two labels, one per line; a figure on a record's first
 * line is read under the first, one on its second line under the second. A
 * long name wraps onto the second line ("Star Health and Allied Insurance
 * Company" / "Limited").
 *
 * The figures are a since-inception restatement of the appraisal's holdings
 * (same quantity, same cost) with the realised gain and income of every
 * security ever held, so they are captured and checked, and none is a source:
 * no holding, no return series and no flow is emitted from this report.
 */
function readPerformanceBySecurity(pages, warnings) {
  const records = [];
  const gate = checkLedger();
  let found = false;
  // The section headings still open — they run on across a page break (page 2
  // of Carnelian's opens with `Total : Cash and Equivalent`).
  let open = [];
  for (const [pageIndex, page] of pages.entries()) {
    const rows = page.rows ?? [];
    const h1 = rows.findIndex((r) => Object.keys(labelSpans(r.items, PBS_LINE1)).length >= 6);
    if (h1 < 0) continue;
    const h2 = [h1 + 1, h1 + 2].find((i) => rows[i] && Object.keys(labelSpans(rows[i].items, PBS_LINE2)).length >= 4);
    if (h2 === undefined) continue;
    const l1 = labelSpans(rows[h1].items, PBS_LINE1);
    const l2 = labelSpans(rows[h2].items, PBS_LINE2);
    const cols1 = Object.fromEntries(Object.entries(l1).filter(([f]) => f !== "security"));
    found = true;
    let pending = null;
    for (const row of rows.slice(h2 + 1)) {
      const items = row.items ?? [];
      const cells = items.filter((it) => isCellText(clean(it.text)) && underLabel(it, cols1));
      const texts = items.filter((it) => !cells.includes(it)).map((it) => clean(it.text)).filter(Boolean);
      if (!cells.length) {
        if (!texts.length || texts.every((t) => PAGE_FOOTER.test(t))) continue;
        // After the grand total the page carries only its footnote.
        if (records.length && records[records.length - 1].grand) break;
        open = [...open, texts.join(" ")];
        continue;
      }
      const label = texts.join(" ");
      const byCol = {};
      for (const it of cells) byCol[underLabel(it, cols1)] = clean(it.text);
      const isLine2 = pending && !pending.line2 && !byCol.quantity && !byCol.priceDate && !/^total\b/i.test(label);
      if (isLine2) {
        // The second line: each column's figure under that column's second label.
        pending.line2 = {};
        for (const [f, l] of Object.entries(l2)) {
          const col = underLabel(l, cols1);
          if (col && byCol[col] !== undefined) pending.line2[f] = byCol[col];
        }
        if (label) pending.label = `${pending.label} ${label}`.replace(/\s+/g, " ").trim();
        continue;
      }
      const total = /^total\b/i.exec(label);
      const closes = total ? clean(label.replace(/^total\s*:?/i, "")) : null;
      pending = {
        pageIndex, label, section: [...open], line1: byCol, line2: null,
        total: !!total, closes: closes || null, grand: !!total && !closes,
      };
      records.push(pending);
      if (total && closes) {
        const at = open.findIndex((h) => normLabel(h) === normLabel(closes));
        if (at >= 0) open = open.slice(0, at);
      }
    }
  }
  if (!found) {
    warn(warnings, "performance-by-security-table-not-found", "no page printed the Security Name / Qty / Market Value header over a Unit Price line");
    return null;
  }

  // The figures, parsed once, for the checks.
  const v = (r, f) => parseNum((r.line1 ?? {})[f] ?? (r.line2 ?? {})[f]);
  const holdings = records.filter((r) => !r.total);
  const totals = records.filter((r) => r.total);
  if (records.some((r) => !r.line2)) {
    gate.note("every record prints its second line", false, records.filter((r) => !r.line2).map((r) => r.label).join(", "));
  } else gate.note(`every record prints its second line (${records.length})`, true);
  const rowFail = { value: [], cost: [], gain: [] };
  for (const r of holdings) {
    const q = v(r, "quantity"), p = v(r, "unitPrice"), uc = v(r, "unitCost"), mv = v(r, "marketValue"), c = v(r, "totalCost"), g = v(r, "unrealized");
    // Value and cost are printed in whole rupees, prices to the paisa.
    if ([q, p, mv].every((x) => x !== null) && !(Math.abs(q * p - mv) <= 0.5 + Math.abs(q) * 0.005)) rowFail.value.push(`${r.label} ${round2(q * p)} vs ${mv}`);
    if ([q, uc, c].every((x) => x !== null) && !(Math.abs(q * uc - c) <= 0.5 + Math.abs(q) * 0.005)) rowFail.cost.push(`${r.label} ${round2(q * uc)} vs ${c}`);
    if ([mv, c, g].every((x) => x !== null) && !(Math.abs(mv - c - g) <= 1.5)) rowFail.gain.push(`${r.label} ${mv - c} vs ${g}`);
  }
  gate.note(`every holding: quantity × unit price = market value (${holdings.length})`, !rowFail.value.length, rowFail.value.join("; "));
  gate.note(`every holding: quantity × unit cost = total cost (${holdings.length})`, !rowFail.cost.length, rowFail.cost.join("; "));
  gate.note(`every holding: market value − total cost = unrealised gain (${holdings.length})`, !rowFail.gain.length, rowFail.gain.join("; "));
  for (const t of totals) {
    const members = t.grand ? holdings : holdings.filter((h) => h.section.some((s) => normLabel(s) === normLabel(t.closes)));
    for (const [f, label, tol] of [["marketValue", "market value", 0.5], ["totalCost", "total cost", 0.5], ["unrealized", "unrealised gain", 0.5], ["pctAssets", "%assets", 0.005]]) {
      const printed = v(t, f);
      if (printed === null) continue;
      const got = members.reduce((s, h) => s + (v(h, f) ?? 0), 0);
      gate.note(`${t.label}: ${label} = its ${members.length} holding(s)`, Math.abs(got - printed) <= tol * (members.length + 1) + 1e-9,
        `Σ ${round2(got)} against ${printed} printed`);
    }
  }
  gate.notApplicable.push("realised gain, income received and accrued income are not tied to the rows: each subtotal includes "
    + "securities sold out before the as-of date, which print no row of their own");
  if (gate.failed.length) {
    warn(warnings, "performance-by-security-does-not-tie", gate.failed.join("; "));
  }

  const header = ["section", "security", ...Object.keys(PBS_LINE1).filter((f) => f !== "security"), ...Object.keys(PBS_LINE2)];
  const sheetRows = records.map((r) => ({
    cells: [r.section.join(" / "), r.label,
      ...Object.keys(PBS_LINE1).filter((f) => f !== "security").map((f) => r.line1?.[f] ?? ""),
      ...Object.keys(PBS_LINE2).map((f) => r.line2?.[f] ?? "")],
  }));
  return { checks: gate.result(), sheet: toAuditSheet("performance-by-security", header, sheetRows) };
}

/** TRIAL BALANCE — the three column groups, each split Debit / Credit. */
const TB_GROUPS = {
  account: [/^account$/],
  opening: [/^opening\s*balance$/],
  period:  [/^transaction\s*during\s*period$/],
  closing: [/^closing\s*balance$/],
};

/**
 * TRIAL BALANCE — every ledger account of the mandate over the window, opening,
 * movement and closing, each as a debit and a credit:
 *
 *   Account                 Opening Balance       Transaction During Period    Closing Balance
 *                           Debit      Credit     Debit        Credit          Debit        Credit
 *   Assets / Current Assets
 *     Bank balance-…        803,390.81  0.00      644,287.00   0.00            1,447,677.81 0.00
 *
 * The six sub-columns are identified by their two printed labels together — the
 * group label above, `Debit`/`Credit` beneath it — and a figure is read under
 * the sub-label whose right edge it shares. Headings (`Assets`, `Current
 * Assets`, `Investment`, `Expense`, `Income`, `Liabilities`, page 2's
 * `Unrealized Gain\Loss`) nest by their own indent.
 *
 * Read for the audit archive and checked, never a source: the P&L account and
 * the dated statements already supply its figures to the book over the same
 * window, and a ledger re-read as flows would put them there twice.
 */
function readTrialBalance(pages, warnings) {
  const lines = [];
  const gate = checkLedger();
  let found = false;
  for (const [pageIndex, page] of pages.entries()) {
    const rows = page.rows ?? [];
    const h = rows.findIndex((r) => Object.keys(labelSpans(r.items, TB_GROUPS)).length === 4);
    if (h < 0) continue;
    const groups = labelSpans(rows[h].items, TB_GROUPS);
    const sub = rows[h + 1]?.items ?? [];
    const sides = sub.filter((it) => /^(debit|credit)$/.test(normLabel(it.text)));
    // Each Debit/Credit label belongs to the group label whose centre is nearest its own.
    const centre = (it) => it.x + it.width / 2;
    const cols = {};
    for (const it of sides) {
      let g = null, d = Infinity;
      for (const k of ["opening", "period", "closing"]) {
        const dd = Math.abs(centre(it) - centre(groups[k]));
        if (dd < d) { d = dd; g = k; }
      }
      cols[`${g}${normLabel(it.text) === "debit" ? "Debit" : "Credit"}`] = it;
    }
    if (Object.keys(cols).length !== 6) continue;
    found = true;
    const stack = [];
    for (const row of rows.slice(h + 2)) {
      const items = row.items ?? [];
      const figs = items.filter((it) => parseNumInfo(clean(it.text)).status === "ok" && underLabel(it, cols));
      const texts = items.filter((it) => !figs.includes(it) && clean(it.text));
      // A ledger line always names its account; a figure with no label beside it
      // is the page number in the footer.
      if (!texts.length) continue;
      const label = texts.map((it) => clean(it.text)).join(" ");
      if (!figs.length) {
        const x = Math.min(...texts.map((it) => it.x));
        while (stack.length && stack[stack.length - 1].x >= x - 1) stack.pop();
        stack.push({ x, label });
        continue;
      }
      const line = { pageIndex, group: stack.map((s) => s.label).join(" / "), label };
      for (const it of figs) line[underLabel(it, cols)] = parseNum(clean(it.text));
      line.kind = /^net\s*total$/i.test(label) ? "net" : /^total$/i.test(label) ? "total" : "account";
      if (line.kind !== "account") line.group = "";                        // a Total closes a block, not a heading
      line.raw = Object.fromEntries(figs.map((it) => [underLabel(it, cols), clean(it.text)]));
      lines.push(line);
    }
  }
  if (!found) {
    warn(warnings, "trial-balance-table-not-found", "no page printed Account / Opening Balance / Transaction During Period / Closing Balance over Debit and Credit");
    return null;
  }

  const SIDES = ["openingDebit", "openingCredit", "periodDebit", "periodCredit", "closingDebit", "closingCredit"];
  const net = (l, g) => (l[`${g}Debit`] ?? 0) - (l[`${g}Credit`] ?? 0);
  const accounts = lines.filter((l) => l.kind === "account");
  const broken = accounts.filter((l) => !(Math.abs(net(l, "opening") + net(l, "period") - net(l, "closing")) <= 0.015 + 1e-9));
  gate.note(`every account: opening + movement = closing (${accounts.length})`, !broken.length,
    broken.map((l) => `${l.label} ${round2(net(l, "opening") + net(l, "period"))} vs ${round2(net(l, "closing"))}`).join("; "));
  // Each Total closes the accounts printed since the previous one.
  let from = 0, firstTotal = null, lastTotal = null;
  lines.forEach((l, i) => {
    if (l.kind === "total") {
      const block = lines.slice(from, i).filter((x) => x.kind === "account");
      const off = SIDES.filter((s) => !(Math.abs(sumBy(block, s) - (l[s] ?? 0)) <= 0.005 * (block.length + 1) + 1e-9));
      gate.note(`Total on page ${l.pageIndex + 1} = its ${block.length} account(s), in all six columns`, !off.length,
        off.map((s) => `${s} Σ ${round2(sumBy(block, s))} vs ${l[s] ?? 0}`).join("; "));
      firstTotal ??= l;
      lastTotal = l;
      from = i + 1;
    }
    if (l.kind === "net" && lastTotal) {
      // Net Total prints each pair's difference on the side that is larger.
      const off = ["opening", "period", "closing"].filter((g) => {
        const want = net(lastTotal, g);
        const got = net(l, g);
        return !(Math.abs(got - want) <= 0.01);
      });
      gate.note(`Net Total on page ${l.pageIndex + 1} = debit − credit of the Total above it`, !off.length, off.join(", "));
    }
  });
  if (firstTotal) {
    const off = ["opening", "period", "closing"].filter((g) => !(Math.abs(net(firstTotal, g)) <= 0.01));
    gate.note("the ledger balances: debits = credits, opening, movement and closing", !off.length, off.join(", "));
  } else gate.notApplicable.push("the ledger's balance: the statement prints no Total");
  if (gate.failed.length) warn(warnings, "trial-balance-does-not-tie", gate.failed.join("; "));

  const header = ["page", "group", "account", ...SIDES];
  const sheetRows = lines.map((l) => ({ cells: [l.pageIndex + 1, l.group, l.label, ...SIDES.map((s) => l.raw[s] ?? "")] }));
  return { checks: gate.result(), sheet: toAuditSheet("trial-balance", header, sheetRows) };
}

/** OPEN LOTS — the columns, by their printed labels. The security column has none. */
const OPEN_LOT_COLUMNS = {
  account:     [/^account$/],
  buyDate:     [/^buy\s*date$/],
  quantity:    [/^(quantity|qty)$/],
  unitCost:    [/^unit\s*cost$/],
  totalCost:   [/^total\s*cost$/],
  price:       [/^price$/],
  marketValue: [/^market\s*value$/],
  unrealized:  [/^unreali[sz]ed$/],
  daysHeld:    [/^no\s*of\s*days$/],
};

/**
 * OPEN LOTS — the purchase lots behind every holding still held:
 *
 *   Equity
 *                        Account                   Buy Date    Quantity   Unit Cost  Total Cost    Price     Market Value  Unrealized  No.of Days
 *   Equity-Listed                                                                                                          Gain/Loss   Held
 *   Ather Energy Ltd     ANKITA BHARAT JAISINGHANI - 31/07/2025  3,000.000  347.5162   10,42,548.60  1,455.0000 43,65,000.00 33,22,451.40  433
 *                        VECBES0003
 *
 * THE LOT REGISTER, and the one fact here the document model already carries:
 * `openLots`, `{ security, purchaseDate, quantity, unitCost, totalCost }` per
 * lot — what makes an unrealised short/long-term split measurable (build-book
 * applies it only where the lots reconcile to the appraisal's held quantity
 * exactly). Never a holding: the appraisal is the holding, and the lots are the
 * same shares at a finer grain. The lot's price, market value and unrealised
 * gain are valuation the appraisal already carries; they are checked and kept
 * in the audit sheet only.
 *
 * The security column prints no header; it is the text left of `Account`. The
 * holder's name and client code under `Account` wrap over two lines. The report
 * prints its date in the title block (`OPEN LOTS / By Asset Class / 07/10/2026`)
 * with no "As of", and the date in the footer is the day it was printed.
 */
function readOpenLots(pages, source, warnings) {
  const lots = [];
  const totals = [];
  const gate = checkLedger();
  let asOf = null, found = false;
  // `Equity-Listed` is printed once, on page 1; its lots run on over page 2.
  let section = null;
  for (const [pageIndex, page] of pages.entries()) {
    const rows = page.rows ?? [];
    const h = rows.findIndex((r) => Object.keys(labelSpans(r.items, OPEN_LOT_COLUMNS)).length >= 7);
    if (h < 0) continue;
    found = true;
    // The as-of: the date-only line of the title block, above the account line.
    const acct = rows.findIndex((r) => (r.items ?? []).some((it) => /^Account\s*:/i.test(clean(it.text))));
    for (const r of rows.slice(0, acct < 0 ? h : acct)) {
      const d = (r.items ?? []).map((it) => clean(it.text)).find((t) => DATE_CELL.test(t));
      if (d) { asOf ??= cellDate(d); break; }
    }
    const labels = labelSpans(rows[h].items, OPEN_LOT_COLUMNS);
    const money = Object.fromEntries(Object.entries(labels).filter(([f]) => f !== "account"));
    const left = labels.account.x;
    // The asset class this page lists: the lone heading printed above the header.
    const above = rows[h - 1]?.items ?? [];
    const assetClass = above.length === 1 && !isCellText(clean(above[0].text)) ? clean(above[0].text) : null;
    let last = null;
    for (const row of rows.slice(h + 1)) {
      const items = row.items ?? [];
      const texts = items.map((it) => clean(it.text));
      if (texts.some((t) => /^note\s*:/i.test(t))) break;               // the footnote
      const cells = items.filter((it) => isCellText(clean(it.text)) && underLabel(it, money));
      const byCol = Object.fromEntries(cells.map((it) => [underLabel(it, money), clean(it.text)]));
      const rest = items.filter((it) => !cells.includes(it));
      const name = rest.filter((it) => it.x + it.width <= left + 1).map((it) => clean(it.text)).join(" ").trim();
      const holder = rest.filter((it) => it.x >= left - 1 && it.x < (labels.buyDate?.x ?? Infinity) && it.x + it.width <= (labels.buyDate?.x ?? Infinity))
        .map((it) => clean(it.text)).join(" ").trim();
      const other = rest.filter((it) => !(it.x + it.width <= left + 1) && !(it.x >= left - 1 && it.x + it.width <= (labels.buyDate?.x ?? Infinity)))
        .map((it) => clean(it.text)).join(" ").trim();
      if (byCol.buyDate && byCol.quantity) {
        last = { pageIndex, assetClass, section, security: name, holder, ...byCol };
        lots.push(last);
        continue;
      }
      if (!cells.length) {
        // The second line of the holder's name and client code, or a heading.
        if (holder && !name && last) { last.holder = `${last.holder} ${holder}`.trim(); continue; }
        // The footer's print date and page number (`08/10/2026 … 1`) sit in the
        // security column's band; a security name is never a date.
        if (name && !holder && !other && !DATE_ONLY.test(name)) { section = name; last = null; continue; }
        continue;
      }
      // A total: figures and no buy date, labelled `<section> Total` or not at all.
      totals.push({ pageIndex, label: [name, holder, other].filter(Boolean).join(" ") || "(unlabelled total)", ...byCol });
      last = null;
    }
  }
  if (!found) {
    warn(warnings, "open-lots-table-not-found", "no page printed the Buy Date / Quantity / Unit Cost / Total Cost header");
    return null;
  }

  const n = (r, f) => parseNum(r[f]);
  const fail = { cost: [], value: [], gain: [], days: [] };
  for (const l of lots) {
    const q = n(l, "quantity"), uc = n(l, "unitCost"), c = n(l, "totalCost"), p = n(l, "price"), mv = n(l, "marketValue"), g = n(l, "unrealized");
    // Unit cost and price are printed to four places, values to the paisa.
    if ([q, uc, c].every((x) => x !== null) && !(Math.abs(q * uc - c) <= Math.abs(q) * 0.00005 + 0.01)) fail.cost.push(`${l.security} ${l.buyDate} ${round2(q * uc)} vs ${c}`);
    if ([q, p, mv].every((x) => x !== null) && !(Math.abs(q * p - mv) <= Math.abs(q) * 0.00005 + 0.01)) fail.value.push(`${l.security} ${l.buyDate} ${round2(q * p)} vs ${mv}`);
    if ([c, mv, g].every((x) => x !== null) && !(Math.abs(mv - c - g) <= 0.015)) fail.gain.push(`${l.security} ${l.buyDate}`);
    const days = n(l, "daysHeld"), bought = cellDate(l.buyDate);
    if (asOf && bought && days !== null && Math.round((Date.parse(asOf) - Date.parse(bought)) / 864e5) !== days) fail.days.push(`${l.security} ${l.buyDate} ${days}`);
  }
  gate.note(`every lot: quantity × unit cost = total cost (${lots.length})`, !fail.cost.length, fail.cost.join("; "));
  gate.note(`every lot: quantity × price = market value (${lots.length})`, !fail.value.length, fail.value.join("; "));
  gate.note(`every lot: market value − total cost = unrealised gain/loss (${lots.length})`, !fail.gain.length, fail.gain.join("; "));
  if (asOf) gate.note(`every lot: days held = ${asOf} − buy date (${lots.length})`, !fail.days.length, fail.days.join("; "));
  else gate.notApplicable.push("days held: the report prints no as-of date to count from");
  for (const t of totals) {
    // `Equity-Listed Total` closes its section; `Equity Total` its asset class;
    // `Detailed Total` and the unlabelled line beneath it close the report.
    const name = clean(t.label.replace(/\s*total$/i, ""));
    const members = lots.filter((l) => normLabel(l.section) === normLabel(name)).length ? lots.filter((l) => normLabel(l.section) === normLabel(name))
      : lots.filter((l) => normLabel(l.assetClass) === normLabel(name)).length ? lots.filter((l) => normLabel(l.assetClass) === normLabel(name))
      : lots;
    const off = ["quantity", "totalCost", "marketValue", "unrealized"].filter((f) => n(t, f) !== null
      && !(Math.abs(members.reduce((s, l) => s + (n(l, f) ?? 0), 0) - n(t, f)) <= 0.005 * (members.length + 1) + 1e-6));
    gate.note(`${t.label} = its ${members.length} lot(s)`, !off.length, off.join(", "));
  }
  if (gate.failed.length) warn(warnings, "open-lots-do-not-tie", gate.failed.join("; "));

  const openLots = lots.map((l) => {
    const { security, isin } = splitSecurityName(l.security);
    return {
      security,
      securityKey: security ? securityKeyOf(security) : null,
      isin: isin ?? null,
      purchaseDate: cellDate(l.buyDate),
      quantity: n(l, "quantity"),
      unitCost: n(l, "unitCost"),
      totalCost: n(l, "totalCost"),
      source,
    };
  });
  const COLS = ["buyDate", "quantity", "unitCost", "totalCost", "price", "marketValue", "unrealized", "daysHeld"];
  const header = ["assetClass", "section", "security", "account", ...COLS];
  const sheetRows = [
    ...lots.map((l) => ({ cells: [l.assetClass ?? "", l.section ?? "", l.security, l.holder, ...COLS.map((f) => l[f] ?? "")] })),
    ...totals.map((t) => ({ cells: ["", "", t.label, "", ...COLS.map((f) => t[f] ?? "")] })),
  ];
  return { openLots, asOf, checks: gate.result(), sheet: toAuditSheet("open-lots", header, sheetRows) };
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
      totals = totalsFrom(h.subtotals, source, warnings, h.headings);
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

  /**
   * THE THREE REPORTS READ FOR THE ARCHIVE. A document whose every table was
   * found and captured was READ, though it publishes no holding and no flow —
   * by decision, not by failure — so it is not `failed`. `checks` says which of
   * its own identities held; a broken one is also a warning, so the status
   * falls to `partial` and says why.
   */
  let checks = null, openLots = [], readWhole = false;
  const extraAsOf = {};
  if (reportType === "performance-by-security") {
    const r = readPerformanceBySecurity(pages, warnings);
    if (r) { sections.performanceBySecurity = r.sheet; checks = r.checks; readWhole = true; }
  }
  if (reportType === "trial-balance") {
    const r = readTrialBalance(pages, warnings);
    if (r) { sections.trialBalance = r.sheet; checks = r.checks; readWhole = true; }
  }
  if (reportType === "open-lots") {
    const r = readOpenLots(pages, source, warnings);
    if (r) {
      sections.openLots = r.sheet; checks = r.checks; openLots = r.openLots; readWhole = true;
      // The title block's date — the report prints no "As of" — and only where
      // nothing else on the page dated it.
      if (r.asOf && !window.periodTo && !id.asOf) extraAsOf.asOf = r.asOf;
    }
  }

  if (!READABLE.has(reportType)) {
    warn(warnings, "no-reader-for-report-type",
      `${reportType}: this engine reads ${[...READABLE].join(", ")}. Left unread rather than half-read.`);
  }

  const gotSomething = holdings.length || totals || returns.length || flows
    || transactions.length || capitalGains.length || income.length || expenses.length || cashFlows.length
    || openLots.length || readWhole;
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
    asOf: extraAsOf.asOf ?? window.periodTo ?? id.asOf ?? meta.asOfDate,
    inceptionDate: id.inceptionDate,
    holdings, totals, returns, flows,
    transactions, capitalGains, income, expenses, cashFlows,
    // Set only by the three readers above, so every other document is
    // byte-identical to what it was.
    ...(openLots.length ? { openLots } : {}),
    ...(checks ? { checks } : {}),
    // Every dated statement states its own window in its header. Carried so the
    // reconciler never compares a financial-year figure against a since-inception
    // one — that mismatch produced 14 phantom deltas during calibration.
    ...window,
    sections,
    warnings,
    status: !gotSomething ? "failed" : warnings.length ? "partial" : "ok",
  };
}
