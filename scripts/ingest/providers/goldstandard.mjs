// GOLDSTANDARD WEALTH PRIVATE LIMITED — PMS, "Aristos Equity Portfolio".
//
// Five report types describe the same account on the same date and disagree.
// scripts/ingest/precedence.mjs decides which is authoritative for what; this
// module only EXTRACTS, and it extracts every report faithfully — including the
// figures precedence will not use — because the reconciler needs both sides of
// a disagreement to report it.
//
// Header: `Account : <no>  <owner name>`, `Report Date` or `As of <dd/mm/yyyy>`.
// Filenames `G<acct>_<acct>_<ReportType><n>OT_<n>.pdf`.
// Listed Indian equity, reported by NAME — no ISIN, no ticker.
//
// ─────────────────────────────────────────────────────────────────────────────
// CALIBRATION STATUS: the column ALIASES below are written from the documented
// report structure, not verified against the real PDFs (none were present in
// source/ when this was written). Tables are located by matching header text
// rather than by column index, so an unrecognised layout fails loudly as
// "table not found" / "column not matched" and is reported — it does not
// silently read the wrong column. Widen the alias lists as real headers appear.
// ─────────────────────────────────────────────────────────────────────────────
import { findTable, readRows, findLabelledNumber, toAuditSheet } from "../lib/table.mjs";
import { parseNum, parseNumInfo } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, makeReturnSeries, makeFlows } from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";

export const PROVIDER = "GoldStandard Wealth Private Limited";

/** Header patterns per logical field. Matched case- and punctuation-insensitively. */
const HOLDING_COLUMNS = {
  security:    [/^(security|scrip|stock|instrument|company|name|particulars|description)/],
  quantity:    [/^(quantity|qty|units?|shares|holding)/],
  unitCost:    [/^(unit cost|avg cost|average cost|cost price|cost rate|purchase price)/],
  totalCost:   [/^(total cost|cost|book cost|amount invested|invested)/],
  marketPrice: [/^(market price|price|cmp|closing price|rate|nav)/],
  marketValue: [/^(market value|value|current value|mkt value|closing value)/],
  gainLoss:    [/^(gain|g l|gain loss|unrealis|unrealiz|profit|p l|total g l)/],
  pctGainLoss: [/^(%\s*g|% gain|gain %|% profit|return %|% return)/],
  pctAssets:   [/^(% assets|%assets|% of assets|weight|% holding|allocation)/],
  accruedIncome: [/^(accrued|accrued income|income accrued|dividend receivable)/],
  positionIrr: [/^(irr|irr %|% irr|xirr)/],
  sector:      [/^(sector|industry|classification|asset class)/],
};

/** A totals line ends the holdings table. */
const HOLDINGS_TERMINATOR = /\b(total|grand total|portfolio total|sub ?total)\b/i;

/** Rows that are cash rather than a security. */
const CASH_ROW = /\b(cash|cash *& *equivalents?|bank balance|liquid|idle funds)\b/i;

/**
 * Labels that head a printed SUBTOTAL line rather than a holding.
 *
 * These sit inside the table region, above the grand total, and look like data
 * rows to a purely geometric reader. Counting them as holdings double-counts the
 * book — the row sum then equals roughly twice the printed total, which is
 * exactly the kind of plausible-but-wrong figure this pipeline exists to avoid.
 */
const AGGREGATE_LABEL = /^\s*(equity|equities|cash|total|grand\s+total|sub\s*-?\s*total|portfolio|net|others?)\b/i;

/** How many numeric fields a row populated — a subtotal fills far fewer than a holding. */
function numericFieldCount(fields) {
  let n = 0;
  for (const [k, v] of Object.entries(fields)) {
    if (k === "security" || k === "sector") continue;
    if (parseNumInfo(v).status === "ok") n++;
  }
  return n;
}

/**
 * A subtotal line, not a holding.
 *
 * Judged on BOTH the label and the shape: "Cash & Equivalents" is a real
 * position carrying a cost, a value and a weight, while the "Cash" summary line
 * beneath the table carries only a value. Requiring both tests means a genuine
 * cash holding is never dropped and a subtotal is never summed.
 */
function isAggregateRow(fields) {
  return AGGREGATE_LABEL.test(String(fields.security ?? "")) && numericFieldCount(fields) <= 2;
}

const warn = (warnings, code, detail) => warnings.push({ code, detail });

/**
 * Read the holdings table from whichever page carries it.
 * Returns { holdings, sheet, printedTotalRow, page } or null.
 */
function readHoldings(pages, warnings, { withSector = false } = {}) {
  for (const page of pages) {
    const table = findTable(page, HOLDING_COLUMNS, { minFields: 4, stopRe: HOLDINGS_TERMINATOR });
    if (!table) continue;
    if (!("security" in table.columns)) {
      warn(warnings, "no-security-column", `page ${page.page}: ${table.headerText}`);
      continue;
    }
    const { rows: allRows, terminator } = readRows(page, table, {
      stopRe: HOLDINGS_TERMINATOR,
      requireField: "security",
    });
    if (!allRows.length) continue;

    // Split the printed subtotal lines out of the body before anything is summed.
    const rows = allRows.filter((r) => !isAggregateRow(r.fields));
    const aggregates = allRows.filter((r) => isAggregateRow(r.fields));
    if (!rows.length) continue;

    const holdings = rows.map((r) => {
      const f = r.fields;
      const name = String(f.security ?? "").trim();
      const isCash = CASH_ROW.test(name);
      return makeHolding({
        security: name,
        // PMS holdings are ordinary listed equity — PMS is the engagement, not
        // the asset class. A cash sweep line is Cash.
        assetClass: isCash ? "Cash" : "Equity",
        providerSector: withSector ? (f.sector ?? null) : null,
        quantity: parseNum(f.quantity),
        unitCost: parseNum(f.unitCost),
        totalCost: parseNum(f.totalCost),
        marketPrice: parseNum(f.marketPrice),
        marketValue: parseNum(f.marketValue),
        gainLoss: parseNum(f.gainLoss),
        pctGainLoss: parseNum(f.pctGainLoss),
        pctAssets: parseNum(f.pctAssets),
        accruedIncome: parseNum(f.accruedIncome),
        positionIrrPct: parseNum(f.positionIrr),
      });
    });

    // Anything the number parser refused is reported, not dropped silently.
    for (const r of rows) {
      for (const [field, raw] of Object.entries(r.fields)) {
        if (field === "security" || field === "sector") continue;
        if (parseNumInfo(raw).status === "unparseable") {
          warn(warnings, "unparseable-cell", `${r.fields.security} · ${field} = ${JSON.stringify(raw)}`);
        }
      }
    }
    if (table.missing.length) warn(warnings, "columns-not-matched", table.missing.join(", "));

    return {
      holdings,
      aggregates,
      page: page.page,
      terminator,
      // The audit sheet keeps EVERY row, subtotals included — it is the record
      // of what the statement said, not of what we chose to sum.
      sheet: toAuditSheet("holdings", Object.keys(table.columns), allRows),
    };
  }
  return null;
}

/**
 * Printed totals taken from the table's own subtotal lines.
 *
 * Preferred over scanning the page for labelled numbers, because these rows sit
 * in the same columns as the data and so cannot be mis-attributed to a
 * neighbouring figure.
 */
function totalsFromAggregates(aggregates, source) {
  if (!aggregates.length) return null;
  const pick = (re) => {
    const row = aggregates.find((r) => re.test(String(r.fields.security ?? "")));
    if (!row) return { value: null, cost: null };
    return {
      value: parseNum(row.fields.marketValue),
      cost: parseNum(row.fields.totalCost),
      gainLoss: parseNum(row.fields.gainLoss),
      pctGainLoss: parseNum(row.fields.pctGainLoss),
    };
  };
  const equity = pick(/^\s*(equity|equities)\b/i);
  const cash = pick(/^\s*cash\b/i);
  const total = pick(/^\s*(total|grand\s+total|portfolio)\b/i);
  const t = makeTotals({
    equityMarketValue: equity.value,
    equityCost: equity.cost,
    cashValue: cash.value,
    totalMarketValue: total.value,
    totalCost: total.cost,
    gainLoss: total.gainLoss ?? equity.gainLoss,
    pctGainLoss: total.pctGainLoss ?? equity.pctGainLoss,
    source,
  });
  return Object.entries(t).some(([k, v]) => k !== "source" && v !== null) ? t : null;
}

/** Printed account totals — taken as printed, never recomputed. */
function readTotals(pages, source) {
  const find = (re, occurrence = 1) => {
    for (const page of pages) {
      const hit = findLabelledNumber(page, re, { occurrence });
      if (hit) return hit.value;
    }
    return null;
  };
  const t = makeTotals({
    equityMarketValue: find(/^(equity|equities|equity total|total equity)/),
    cashValue: find(/^(cash|cash equivalents?|cash balance)/),
    totalMarketValue: find(/^(total|portfolio total|grand total|total portfolio value)/),
    equityCost: find(/^(equity cost|cost of equity|total equity cost)/),
    totalCost: find(/^(total cost|cost basis|total invested)/),
    gainLoss: find(/^(total g l|total gain|net gain|total profit|unrealis|unrealiz)/),
    pctGainLoss: find(/^(% g l|total return %|% gain)/),
    source,
  });
  return Object.values(t).some((v) => v !== null && v !== source) ? t : null;
}

/** TWRR table: one row per series (Portfolio, benchmark), columns MTD/QTD/YTD/SI. */
const RETURN_COLUMNS = {
  series: [/^(series|portfolio|scheme|index|benchmark|particulars|description|name)/],
  mtd:    [/^(mtd|month to date|1 month|1m)/],
  qtd:    [/^(qtd|quarter to date|3 month|3m)/],
  ytd:    [/^(ytd|year to date|1 year|1y)/],
  si:     [/^(si|since inception|inception|itd)/],
};

function readReturns(pages, warnings, source) {
  for (const page of pages) {
    const table = findTable(page, RETURN_COLUMNS, { minFields: 3, stopRe: /^\s*$/ });
    if (!table) continue;
    const { rows } = readRows(page, table, { requireField: "series", maxRows: 20 });
    const series = rows
      .map((r) => makeReturnSeries({
        series: String(r.fields.series ?? "").trim(),
        // Anything that is not the portfolio line is a benchmark series.
        isBenchmark: !/^(portfolio|scheme|your portfolio|aristos)/i.test(String(r.fields.series ?? "").trim()),
        mtd: parseNum(r.fields.mtd),
        qtd: parseNum(r.fields.qtd),
        ytd: parseNum(r.fields.ytd),
        si: parseNum(r.fields.si),
        source,
      }))
      .filter((s) => s.series && [s.mtd, s.qtd, s.ytd, s.si].some((v) => v !== null));
    if (series.length) {
      if (table.missing.length) warn(warnings, "return-columns-not-matched", table.missing.join(", "));
      return { series, sheet: toAuditSheet("returns", Object.keys(table.columns), rows) };
    }
  }
  return null;
}

/** PerfSummary: labelled capital and P&L lines. */
function readFlows(pages, source) {
  const find = (re) => {
    for (const page of pages) {
      const hit = findLabelledNumber(page, re);
      if (hit) return hit.value;
    }
    return null;
  };
  const f = makeFlows({
    contribution: find(/^(contribution|capital in|capital introduced|inflow|additions?|deposits?)/),
    withdrawal: find(/^(withdrawal|capital out|outflow|redemptions?|payouts?)/),
    netCapitalInOut: find(/^(net capital|net flow|net contribution|net in out)/),
    realized: find(/^(realis|realiz)/),
    unrealized: find(/^(unrealis|unrealiz)/),
    income: find(/^(income|dividend|other income)/),
    expenses: find(/^(expense|charges|costs?)/),
    fees: find(/^(fee|management fee|performance fee|advisory fee)/),
    profit: find(/^(profit|net profit|total profit|gain)/),
    source,
  });
  return Object.entries(f).some(([k, v]) => k !== "source" && v !== null) ? f : null;
}

/** Inception date, from PerfHistory. */
function readInception(pages) {
  for (const page of pages) {
    for (const row of page.rows) {
      const joined = row.cells.map((c) => c.text).join(" ");
      const m = /inception\D{0,20}(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}[\s-][A-Za-z]{3,}[\s-]\d{4})/i.exec(joined);
      if (m) { const iso = toIso(m[1]); if (iso) return iso; }
    }
  }
  return null;
}

/**
 * Extract one GoldStandard document.
 * @param {{ grid: object, meta: object }} input
 * @returns {object} partial normalized document (envelope added by the caller)
 */
export function extract({ grid, meta }) {
  const warnings = [];
  const pages = grid.pages ?? [];
  const source = meta.docKey;
  const sections = {};
  const reportType = meta.reportType;

  let holdings = [], totals = null, returns = [], flows = null, inceptionDate = null;

  if (reportType === "appraisal" || reportType === "holdings" || reportType === "fact-sheet") {
    const h = readHoldings(pages, warnings, { withSector: reportType === "fact-sheet" });
    if (h) { holdings = h.holdings; sections.holdings = h.sheet; }
    else warn(warnings, "holdings-table-not-found", `${reportType}: no header matched the holdings column set`);
    // Subtotal lines inside the table are the most reliable printed totals —
    // they sit in known columns. The labelled-text scan is the fallback.
    totals = totalsFromAggregates(h?.aggregates ?? [], source) ?? readTotals(pages, source);
    if (!totals) warn(warnings, "totals-not-found", reportType);
  }

  if (reportType === "fact-sheet" || reportType === "performance-history") {
    const r = readReturns(pages, warnings, source);
    if (r) { returns = r.series; sections.returns = r.sheet; }
    else warn(warnings, "returns-table-not-found", reportType);
  }

  if (reportType === "performance-summary") {
    flows = readFlows(pages, source);
    if (!flows) warn(warnings, "flows-not-found", reportType);
  }

  if (reportType === "performance-history") {
    inceptionDate = readInception(pages);
    if (!inceptionDate) warn(warnings, "inception-date-not-found", reportType);
  }

  const gotSomething = holdings.length || totals || returns.length || flows || inceptionDate;
  return {
    provider: PROVIDER,
    engagement: "PMS",
    providerEngagement: meta.providerEngagement ?? "Portfolio Management Service",
    strategy: meta.strategy ?? null,
    holdings, totals, returns, flows, inceptionDate,
    sections,
    warnings,
    status: !gotSomething ? "failed" : warnings.length ? "partial" : "ok",
  };
}
