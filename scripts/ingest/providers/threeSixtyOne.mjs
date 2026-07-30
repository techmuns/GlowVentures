// 360 ONE PRIVATE WEALTH — "PORTFOLIO ANALYSIS REPORT - CLIENT LEVEL", ~11pp.
//
// One PDF, several reports. The sections are located by their headings rather
// than by page number, because a bundle grows a page whenever a client holds one
// more scheme and a fixed "p6" would then read the wrong table:
//
//   p2  Executive Summary            -> account totals, engagement model
//   p4  Corpus, Income & Expense     -> corpus / income / expense
//   p6  Detailed Holding Statement   -> the holdings
//   p7  Transaction Statement        -> dated cash flows
//   p7  Corporate Action Statement   -> corporate actions
//
// Holdings are AIF / PMS units: no ISIN, no ticker, name only. The `manager`
// column is the scheme sleeve, not the owner.
//
// ─────────────────────────────────────────────────────────────────────────────
// CALIBRATION STATUS: written from the documented report structure; not verified
// against the real PDFs (none were in source/ when this was written). Sections
// are found by heading text and columns by header text, so an unrecognised
// layout is reported as not-found rather than read from the wrong place.
// ─────────────────────────────────────────────────────────────────────────────
import { findTable, readRows, findLabelledNumber, rowsMatching, toAuditSheet } from "../lib/table.mjs";
import { parseNum, parseNumInfo } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, makeFlows, makeCashFlow } from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";

export const PROVIDER = "360 ONE Private Wealth";

const SECTION_HEADINGS = {
  "executive-summary": /executive\s+summary/i,
  "corpus-income-expense": /corpus\s*,?\s*income\s*(&|and)?\s*expense/i,
  "detailed-holding-statement": /detailed\s+holding\s+statement/i,
  "transaction-statement": /transaction\s+statement/i,
  "corporate-action": /corporate\s+action/i,
};

const HOLDING_COLUMNS = {
  security:     [/^(scheme|instrument|investment|product|security|particulars|name|description)/],
  manager:      [/^(manager|amc|fund house|sponsor|scheme manager)/],
  quantity:     [/^(units?|quantity|qty|balance units)/],
  totalCost:    [/^(holding cost|cost|invested|purchase cost|amount invested|book cost)/],
  marketPrice:  [/^(nav|price|rate|unit price)/],
  marketValue:  [/^(current value|market value|value|valuation|present value)/],
  unrealized:   [/^(unrealis|unrealiz|notional gain|mtm)/],
  pctUnrealized:[/^(% unrealis|% unrealiz|unrealised %|% gain)/],
  realized:     [/^(realis|realiz|booked)/],
  distributedIncome: [/^(distributed income|income distributed|dividend|payout|income)/],
  positionIrr:  [/^(irr|xirr|irr %)/],
  benchmarkIrr: [/^(benchmark irr|bm irr|benchmark|index irr)/],
  priceAsOn:    [/^(price as on|nav as on|as on|valuation date)/],
};

const TXN_COLUMNS = {
  date:        [/^(date|transaction date|txn date|trade date)/],
  description: [/^(description|particulars|narration|transaction type|type|nature)/],
  security:    [/^(scheme|instrument|investment|security|product)/],
  units:       [/^(units?|quantity|qty)/],
  amount:      [/^(amount|value|gross amount|net amount)/],
};

const TERMINATOR = /\b(total|grand total|sub ?total)\b/i;
const warn = (warnings, code, detail) => warnings.push({ code, detail });

/** Pages that contain a given section heading, in document order. */
function pagesForSection(pages, re) {
  return pages.filter((p) => rowsMatching(p, re).length > 0);
}

function readHoldings(pages, warnings, source) {
  const target = pagesForSection(pages, SECTION_HEADINGS["detailed-holding-statement"]);
  const search = target.length ? target : pages;
  if (!target.length) warn(warnings, "section-heading-not-found", "Detailed Holding Statement; scanned all pages");

  for (const page of search) {
    const table = findTable(page, HOLDING_COLUMNS, { minFields: 4, stopRe: TERMINATOR });
    if (!table || !("security" in table.columns)) continue;
    const { rows } = readRows(page, table, { stopRe: TERMINATOR, requireField: "security" });
    if (!rows.length) continue;

    const holdings = rows.map((r) => {
      const f = r.fields;
      const name = String(f.security ?? "").trim();
      return makeHolding({
        security: name,
        // The bundle's holdings are fund units. Anything naming itself an AIF or
        // a Category fund is AIF; the rest of this book's 360 ONE lines are
        // managed scheme units, which are Mutual Fund unless stated otherwise.
        assetClass: /\bAIF\b|category\s+(i|ii|iii)\b|alternative/i.test(name) ? "AIF" : "Mutual Fund",
        manager: f.manager ?? null,
        quantity: parseNum(f.quantity),
        totalCost: parseNum(f.totalCost),
        marketPrice: parseNum(f.marketPrice),
        marketValue: parseNum(f.marketValue),
        unrealized: parseNum(f.unrealized),
        pctGainLoss: parseNum(f.pctUnrealized),
        realized: parseNum(f.realized),
        distributedIncome: parseNum(f.distributedIncome),
        positionIrrPct: parseNum(f.positionIrr),
        benchmarkIrrPct: parseNum(f.benchmarkIrr),
        priceAsOn: f.priceAsOn ? toIso(f.priceAsOn) ?? f.priceAsOn : null,
        source,
      });
    });

    for (const r of rows) {
      for (const [field, raw] of Object.entries(r.fields)) {
        if (["security", "manager", "priceAsOn"].includes(field)) continue;
        if (parseNumInfo(raw).status === "unparseable") {
          warn(warnings, "unparseable-cell", `${r.fields.security} · ${field} = ${JSON.stringify(raw)}`);
        }
      }
    }
    if (table.missing.length) warn(warnings, "columns-not-matched", table.missing.join(", "));
    return { holdings, sheet: toAuditSheet("detailed-holding-statement", Object.keys(table.columns), rows) };
  }
  warn(warnings, "holdings-table-not-found", "Detailed Holding Statement");
  return null;
}

function readExecutiveSummary(pages, warnings, source) {
  const target = pagesForSection(pages, SECTION_HEADINGS["executive-summary"]);
  const search = target.length ? target : pages;
  const find = (re) => {
    for (const page of search) {
      const hit = findLabelledNumber(page, re);
      if (hit) return hit.value;
    }
    return null;
  };
  const totals = makeTotals({
    totalMarketValue: find(/^(total portfolio|portfolio value|total value|current value|net worth)/),
    totalCost: find(/^(total cost|holding cost|invested|total investment)/),
    gainLoss: find(/^(total gain|net gain|unrealis|unrealiz|profit)/),
    source,
  });
  // The engagement model is stated in words on p2 ("Advisory", "Distribution").
  let providerEngagement = null;
  for (const page of search) {
    for (const row of page.rows) {
      const joined = row.cells.map((c) => c.text).join(" ");
      const m = /(engagement\s*model|relationship\s*type|service\s*model)\s*[:\-]?\s*([A-Za-z /&-]{3,40})/i.exec(joined);
      if (m) { providerEngagement = m[2].trim(); break; }
    }
    if (providerEngagement) break;
  }
  const any = Object.entries(totals).some(([k, v]) => k !== "source" && v !== null);
  if (!any) warn(warnings, "executive-summary-not-read", "no labelled totals matched");
  return { totals: any ? totals : null, providerEngagement };
}

function readCorpus(pages, warnings, source) {
  const target = pagesForSection(pages, SECTION_HEADINGS["corpus-income-expense"]);
  const search = target.length ? target : [];
  if (!search.length) { warn(warnings, "section-heading-not-found", "Corpus, Income & Expense"); return null; }
  const find = (re) => {
    for (const page of search) {
      const hit = findLabelledNumber(page, re);
      if (hit) return hit.value;
    }
    return null;
  };
  const f = makeFlows({
    corpus: find(/^(corpus|opening corpus|net corpus)/),
    income: find(/^(income|total income|other income)/),
    expenses: find(/^(expense|total expense|charges)/),
    fees: find(/^(fee|management fee|advisory fee)/),
    source,
  });
  return Object.entries(f).some(([k, v]) => k !== "source" && v !== null) ? f : null;
}

function readDatedRows(pages, warnings, headingRe, kind, source) {
  const target = pagesForSection(pages, headingRe);
  if (!target.length) return null;
  for (const page of target) {
    const headingIdx = rowsMatching(page, headingRe)[0]?.i ?? 0;
    const table = findTable(page, TXN_COLUMNS, { minFields: 3, from: headingIdx, stopRe: TERMINATOR });
    if (!table) continue;
    const { rows } = readRows(page, table, { stopRe: TERMINATOR });
    const flows = rows
      .map((r) => makeCashFlow({
        date: r.fields.date ? toIso(r.fields.date) : null,
        description: r.fields.description ?? "",
        security: r.fields.security ?? null,
        kind,
        units: parseNum(r.fields.units),
        amount: parseNum(r.fields.amount),
        source,
      }))
      .filter((f) => f.date || f.amount !== null || f.description);
    if (flows.length) {
      return { flows, sheet: toAuditSheet(kind, Object.keys(table.columns), rows) };
    }
  }
  warn(warnings, "dated-table-not-found", kind);
  return null;
}

/**
 * Extract one 360 ONE bundle.
 * @returns {object} partial normalized document
 */
export function extract({ grid, meta }) {
  const warnings = [];
  const pages = grid.pages ?? [];
  const source = meta.docKey;
  const sections = {};

  const h = readHoldings(pages, warnings, source);
  const holdings = h?.holdings ?? [];
  if (h) sections["detailed-holding-statement"] = h.sheet;

  const exec = readExecutiveSummary(pages, warnings, source);
  const corpus = readCorpus(pages, warnings, source);

  const txns = readDatedRows(pages, warnings, SECTION_HEADINGS["transaction-statement"], "transaction", source);
  const corpActions = readDatedRows(pages, warnings, SECTION_HEADINGS["corporate-action"], "corporate-action", source);
  if (txns) sections["transaction-statement"] = txns.sheet;
  if (corpActions) sections["corporate-action"] = corpActions.sheet;
  const cashFlows = [...(txns?.flows ?? []), ...(corpActions?.flows ?? [])];

  // 360 ONE's own wording decides the engagement; AIF holdings alone do not make
  // the RELATIONSHIP an AIF mandate, so this defaults to Advisory only when the
  // report says nothing, and records the provider's wording either way.
  const pe = exec.providerEngagement;
  const engagement = pe && /distribut/i.test(pe) ? "Distribution"
    : pe && /execution/i.test(pe) ? "Execution"
    : pe && /pms|portfolio manage/i.test(pe) ? "PMS"
    : "Advisory";
  if (!pe) warn(warnings, "engagement-model-not-found", "defaulted to Advisory; provider wording not located");

  const gotSomething = holdings.length || exec.totals || corpus || cashFlows.length;
  return {
    provider: PROVIDER,
    engagement,
    providerEngagement: pe,
    familyGroup: meta.familyGroup ?? null,
    holdings,
    totals: exec.totals,
    flows: corpus,
    cashFlows,
    returns: [],
    sections,
    warnings,
    status: !gotSomething ? "failed" : warnings.length ? "partial" : "ok",
  };
}
