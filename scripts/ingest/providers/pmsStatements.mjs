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
};

/** Identify the manager from the letterhead, else from the filename prefix. */
export function detectProvider({ fileName, text, name }) {
  for (const p of Object.values(PROVIDERS)) if (p.letterhead.test(text)) return p;
  for (const p of Object.values(PROVIDERS)) if (p.filePrefix.test(fileName ?? "")) return p;
  // The classifier has usually already resolved the provider NAME off the
  // letterhead. Accepting it here means the engagement is read from the same
  // registry rather than defaulting to unknown when neither the file name nor
  // the text handed to this function carries the signature.
  for (const p of Object.values(PROVIDERS)) if (p.name === name) return p;
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
  quantity:    [/^(quantity|qty|units?(?!\s*cost))/],
  unitPrice:   [/^(unit\s*price|rate|price)/],
  brokerage:   [/^(brkg|brokerage)/],
  stt:         [/^stt/],
  settlement:  [/^(settlement\s*amount|net\s*amount|amount)/],
};

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
const SECTION_ROW = /^(equity|equities|cash|mutual\s*fund|debt|bond|liquid|others?)\b/i;

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

/** A holding line that IS cash, by its own name rather than by its section. */
const CASH_LINE = /^cash\b/i;

/** The page footer, which lands in whichever column sits above it. */
const PAGE_FOOTER = /^page\s*\d+(\s*of\s*\d+)?$/i;

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
    // The name is optional, the separating dash is optional, and a trailing
    // client code is consumed rather than read as part of the name.
    const acct = /^Account\s*:?\s*(\d[\d-]*)(?:\s*-?\s+([A-Za-z][A-Za-z.'\- ]{2,60}?))?(?:\s*-\s*((?:GLC|CBP)\d{3,}))?$/.exec(s);
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
      if (acct[2]) out.owner ??= trimPersonName(acct[2].replace(/\s+/g, " "));
      else if (nameShaped(spans[i + 1] ?? "")) out.owner ??= trimPersonName(spans[i + 1]);
    }
    // Green Lantern / Carnelian: `AJAY T JAISINGHANI - GLC0780`. The DIGITS in
    // the client code are what makes this safe — the same dash form also carries
    // the fund ("GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND"), and requiring a
    // numeric code stops the manager's own name being read as the client's.
    const coded = /^([A-Za-z][A-Za-z.'\- ]{2,60}?)\s*-\s*((?:GLC|CBP)\d{3,})$/.exec(s);
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
  const strat = /Strategy\s*:\s*([A-Za-z][A-Za-z0-9 .&'\-]{3,60}?)(?=\s{2,}|\s+Portfolio\s+Holdings|$)/m.exec(text)
    ?? /^\s*([A-Z][A-Za-z ]*(?:CAPITAL LLP - [A-Z ]+|BESPOKE PORTFOLIO|Equity Portfolio))\s*$/m.exec(text);
  if (strat) out.strategy = clean(strat[1]).replace(/\s+/g, " ");
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
    for (const g of groups) {
      if (!g.security || !g.sectorParts.length) continue;
      map.set(g.security.replace(/\s+/g, " ").trim(), g.sectorParts.join(" ").replace(/\s+/g, " ").trim());
    }
    if (map.size) return { sectors: map, sheet: toAuditSheet("sectors", Object.keys(table.columns), rows) };
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
function readTransactions(pages, source, warnings) {
  const t = readAcrossPages(pages, TRANSACTION_COLUMNS, { minFields: 6, require: ["security", "quantity"] });
  if (!t) return null;
  if (t.missing?.length) warn(warnings, "columns-not-matched", t.missing.join(", "));

  const out = [];
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
    const side = /^sell/i.test(desc) ? "sell" : /^buy/i.test(desc) ? "buy" : null;
    if (!side) { warn(warnings, "transaction-side-unknown", `${date} · ${JSON.stringify(desc)}`); continue; }
    out.push(makeTransaction({
      date,
      settlementDate: cellDate(r.fields.settleDate),
      side,
      security: clean(r.fields.security),
      exchange: clean(r.fields.exchange) || null,
      // The section names the instrument type ("Shares - Listed"); a PMS holds
      // ordinary listed equity, so anything else is left unclassified rather
      // than forced into a class this reader cannot verify.
      assetClass: /shares|equit/i.test(section ?? "") ? "Equity" : null,
      quantity: parseNum(r.fields.quantity),
      unitPrice: parseNum(r.fields.unitPrice),
      brokerageRate: parseNum(r.fields.brokerage),
      stt: parseNum(r.fields.stt),
      settlementAmount: parseNum(r.fields.settlement),
      source,
    }));
  }
  return out.length ? { transactions: out, sheet: toAuditSheet("transactions", Object.keys(t.columns), t.rows) } : null;
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
 * CURRENT PORTFOLIO → per-position accrued income and IRR%, and nothing else.
 *
 * Everything else on this report is deliberately discarded. Its market value
 * folds accrued income in on some rows but not others (Sundaram Finance yes,
 * Sonata Software no) while its Total G/L adds it on every row, so its figures
 * are on a basis that does not reconcile with anything. Precedence names the
 * appraisal authoritative; this reader takes only the two fields the appraisal
 * does not carry.
 */
function readCurrentPortfolio(pages, source, warnings) {
  const t = readAcrossPages(pages, CURRENT_PORTFOLIO_COLUMNS, { minFields: 6, require: ["security", "income"] });
  if (!t) {
    warn(warnings, "current-portfolio-table-not-found", "no security/accrued-income table matched");
    return null;
  }
  const out = [];
  for (const r of t.rows) {
    const security = clean(r.fields.security);
    if (!security) continue;
    const income = parseNum(r.fields.income);
    const irr = parseNum(r.fields.irrPct);
    const annYield = parseNum(r.fields.annYieldPct);
    if (income === null && irr === null && annYield === null) continue;   // heading or subtotal
    if (parseNumInfo(r.fields.quantity).status !== "ok") continue;
    out.push(makeHolding({
      security,
      assetClass: CASH_LINE.test(security) ? "Cash" : "Equity",
      accruedIncome: income,
      positionIrrPct: irr,
      annualizedYieldPct: annYield,
      absoluteYieldPct: parseNum(r.fields.absYieldPct),
      source,
    }));
  }
  return out.length ? { holdings: out, sheet: toAuditSheet("current-portfolio", Object.keys(t.columns), t.rows) } : null;
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
    // The LAST occurrence: the performance summary opens with "Market Value as of
    // 01/04/2026" and closes with "Market Value as of 10/07/2026". Corpus is the
    // closing figure, and taking the first made it the opening one — which then
    // "disagreed" with every other report by a whole period's return.
    corpus: find(/^(portfolio value on|market value as of)/, true),
    // …and the FIRST occurrence, which is the opening value. The performance
    // summary prints "Market Value as of 01/04/2026" above and "as of
    // 10/07/2026" below; both endpoints are needed to compute a return over the
    // window, and neither can be inferred from the other.
    openingCorpus: find(/^(portfolio value on|market value as of)/),
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

/**
 * Extract one statement.
 * @returns {object} partial normalized document
 */
export function extract({ grid, meta }) {
  const warnings = [];
  const pages = grid.pages ?? [];
  const source = meta.docKey;
  const sections = {};
  const provider = meta.providerConfig
    ?? detectProvider({ fileName: meta.fileName ?? "", text: "", name: meta.provider });

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
        assetClass: /^cash/i.test(x.section ?? "") || CASH_LINE.test(x.security) ? "Cash" : "Equity",
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
    const s = readSectors(pages, warnings);
    if (s) {
      sections.sectors = s.sheet;
      holdings = [...s.sectors.entries()].map(([security, providerSector]) =>
        makeHolding({ security, assetClass: "Equity", providerSector, source }));
    }
    // Since inception, not since 1 April — the block is headed "Since 26/12/2025".
    flows = readFactSheetSummary(pages, source, { periodFrom: id.inceptionDate, periodTo: id.asOf });
    if (!flows) warn(warnings, "portfolio-summary-not-found", reportType);
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
    const r = readExpenses(pages, source, warnings);
    if (r) { expenses = r.expenses; sections.expenses = r.sheet; }
    else warn(warnings, "expense-table-not-found", reportType);
  }

  if (reportType === "holdings") {
    const r = readCurrentPortfolio(pages, source, warnings);
    if (r) { holdings = r.holdings; sections.currentPortfolio = r.sheet; }
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
