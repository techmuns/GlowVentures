// SOURCE PRECEDENCE — which report is authoritative for which fact.
//
// This file is a DECISION, not a default. One account on one date produces
// several reports that describe the same holdings and disagree, so "whichever
// file we parsed last wins" is not a policy — it is a bug that produces a
// different book on every run. Every fact the cockpit shows is therefore
// attributed here to exactly one reportType per provider, and the extractor
// records which document each figure came from.
//
// Disagreements are NOT resolved by averaging, preferring the larger figure, or
// silently taking the first one seen. They are reported (see reconcile.mjs) and
// the precedence below decides what is used.
//
// SCOPE NOTE — precedence governs PRIMITIVES.
//
// Since the primitives/derived split in lib/document.mjs, market value, gain,
// %gain and %assets are COMPUTED from the primitives, not ingested. Precedence
// still decides which report supplies each PRIMITIVE (quantity, unit cost, total
// cost, market price, accrued income). The derived entries below therefore say
// which report's PRINTED figure is the one worth cross-checking against — they
// no longer select a value the book uses. See reconcile.mjs section (a2).
//
// ── Rationale for the GoldStandard choices ──────────────────────────────────
// PortfolioAppraisal is the clean basis: its market value equals price ×
// quantity exactly. CurrentPortfolio folds accrued income into market value on
// SOME rows but not others (Sundaram Finance yes, Sonata Software no) while
// adding it to Total G/L on every row — so its market value is not a consistent
// quantity, and its G/L is on a different basis. FactSheet agrees with
// Appraisal. Accrued income is therefore carried as its OWN field, taken from
// CurrentPortfolio, rather than being left embedded in a market value that only
// sometimes includes it.

/** Every fact the extraction layer knows how to source. */
export const FACTS = [
  // holdings-level
  "holdings", "quantity", "unitCost", "totalCost", "marketPrice", "marketValue",
  "gainLoss", "pctAssets", "providerSector", "accruedIncome", "positionIrrPct",
  // account-level
  "accountTotals", "engagementModel", "periodReturns", "benchmark",
  "capitalInOut", "realized", "unrealized", "income", "expenses", "fees",
  "inceptionDate", "netCapitalInOut", "corpus", "corpusIncome", "cashFlows", "corporateActions",
];

/**
 * provider → fact → { reportType | reportTypes[], note }
 *
 * `reportTypes` (plural) means the fact is assembled from more than one report;
 * the extractor must take it from the first that carries it and record which.
 */
export const PRECEDENCE = {
  "GoldStandard Wealth Private Limited": {
    holdings:        { reportType: "appraisal", note: "MV = price x quantity exactly; the clean basis." },
    quantity:        { reportType: "appraisal" },
    unitCost:        { reportType: "appraisal" },
    totalCost:       { reportType: "appraisal" },
    marketPrice:     { reportType: "appraisal" },
    marketValue:     { reportType: "appraisal", note: "CurrentPortfolio folds accrued income in on some rows only." },
    gainLoss:        { reportType: "appraisal", note: "CurrentPortfolio adds accrued income to G/L on every row; different basis." },
    pctAssets:       { reportType: "appraisal" },

    providerSector:  { reportType: "fact-sheet", note: "FactSheet agrees with Appraisal on values and carries the sector." },

    accruedIncome:   { reportType: "holdings", note: "CurrentPortfolio; carried as its own field, never folded into MV." },
    positionIrrPct:  { reportType: "holdings", note: "CurrentPortfolio per-position IRR%." },

    periodReturns:   { reportTypes: ["fact-sheet", "performance-history"], note: "TWRR MTD/QTD/YTD/SI." },
    benchmark:       { reportTypes: ["fact-sheet", "performance-history"] },

    capitalInOut:    { reportType: "performance-summary" },
    realized:        { reportType: "performance-summary" },
    unrealized:      { reportType: "performance-summary" },
    income:          { reportType: "performance-summary" },
    expenses:        { reportType: "performance-summary" },
    fees:            { reportType: "performance-summary" },

    inceptionDate:   { reportType: "performance-history" },
    netCapitalInOut: { reportType: "performance-history" },
  },

  "360 ONE Private Wealth": {
    // The 11-page bundle is ONE file; these name the SECTION within it.
    holdings:        { reportType: "holdings", section: "detailed-holding-statement", note: "p6." },
    quantity:        { reportType: "holdings", section: "detailed-holding-statement" },
    totalCost:       { reportType: "holdings", section: "detailed-holding-statement", note: "holding cost" },
    marketPrice:     { reportType: "holdings", section: "detailed-holding-statement", note: "NAV" },
    marketValue:     { reportType: "holdings", section: "detailed-holding-statement", note: "NAV x units" },
    unrealized:      { reportType: "holdings", section: "detailed-holding-statement" },
    realized:        { reportType: "holdings", section: "detailed-holding-statement" },
    income:          { reportType: "holdings", section: "detailed-holding-statement", note: "distributed income" },
    positionIrrPct:  { reportType: "holdings", section: "detailed-holding-statement", note: "IRR + benchmark IRR" },

    accountTotals:   { reportType: "holdings", section: "executive-summary", note: "p2." },
    engagementModel: { reportType: "holdings", section: "executive-summary", note: "p2." },

    corpus:          { reportType: "holdings", section: "corpus-income-expense", note: "p4." },
    // Distinct from `income` above: that is distributed income per holding (p6),
    // this is the account-level income line on the Corpus report (p4).
    corpusIncome:    { reportType: "holdings", section: "corpus-income-expense", note: "p4." },
    expenses:        { reportType: "holdings", section: "corpus-income-expense", note: "p4." },

    cashFlows:       { reportType: "holdings", section: "transaction-statement", note: "p7." },
    corporateActions:{ reportType: "holdings", section: "corporate-action", note: "p7." },
  },
};

/**
 * Which document should supply `fact` for `provider`?
 * @returns {{ reportTypes: string[], section: string|null, note: string|null } | null}
 */
export function sourceFor(provider, fact) {
  const p = PRECEDENCE[provider];
  if (!p) return null;
  const rule = p[fact];
  if (!rule) return null;
  return {
    reportTypes: rule.reportTypes ?? [rule.reportType],
    section: rule.section ?? null,
    note: rule.note ?? null,
  };
}

/** True when `reportType` is authoritative for `fact`. */
export function isAuthoritative(provider, fact, reportType) {
  return sourceFor(provider, fact)?.reportTypes.includes(reportType) ?? false;
}

/** Every provider the precedence table covers. */
export const PROVIDERS_WITH_PRECEDENCE = Object.keys(PRECEDENCE);
