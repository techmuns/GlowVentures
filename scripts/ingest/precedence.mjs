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
// ── Rationale for the Goldstandard choices ──────────────────────────────────
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
  // dated tables
  "transactions", "capitalGains",
  /**
   * The OPENING portfolio value, as its own fact rather than part of `corpus`.
   * A money-weighted return needs the stake the period started with, and an
   * account whose flows carry no opening value cannot be measured — pooling one
   * anyway put ₹5.92 Cr of terminal market value against no opening stake and
   * returned 174.3% p.a. against 109.7% for the accounts that could be measured.
   */
  "openingCorpus",
  /** The manager's own stated XIRR — a cross-check on ours, never a substitute. */
  "clientXirr",
];

/**
 * provider → fact → { reportType | reportTypes[], note }
 *
 * `reportTypes` (plural) means the fact is assembled from more than one report;
 * the extractor must take it from the first that carries it and record which.
 */
/**
 * The four PMS managers on one reporting system — Goldstandard, Green Lantern,
 * Carnelian and V.E.C Assago — publish the same report set, the same column
 * layout and the same internal inconsistencies. So they share one precedence
 * block rather than four copies that would drift apart.
 *
 * The keys below must match `PROVIDERS[*].name` in providers/pmsStatements.mjs
 * exactly. A key that does not match resolves to no precedence at all, and the
 * reconciler then reports a cross-report disagreement with nothing to say about
 * which side to believe — which is how "Goldstandard" spelled "GoldStandard"
 * quietly disabled this whole table.
 */
const PMS_REPORTING_SYSTEM = {
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
};

export const PRECEDENCE = {
  "Goldstandard Wealth Private Limited": PMS_REPORTING_SYSTEM,

  /**
   * GREEN LANTERN also issues the SEBI PMS INVESTOR REPORT, quarterly, as pages
   * 1–8 of a bundle its file name calls a contract note. Everything in the block
   * above still holds — the appraisal remains authoritative for holdings, and it
   * has to be, because the investor report subtotals its Shares section without
   * printing a single security in it.
   *
   * What the investor report adds is what no other Green Lantern document
   * carries: an OPENING portfolio value beside the closing one, and the account's
   * capital contributions from inception. Those are the two inputs a
   * money-weighted return needs, and their absence is why one of this manager's
   * accounts is excluded from the consolidated XIRR on `/performance`.
   *
   * It is NOT named for the flows block. Its window is the quarter (01/04–30/06);
   * the performance summary's is the financial year to date. Both print a
   * realised gain, both are right, and folding them together would compare two
   * different measurements — the mistake `periodFrom`/`periodTo` exist to stop.
   */
  "Green Lantern Capital LLP": {
    ...PMS_REPORTING_SYSTEM,
    openingCorpus:   { reportType: "investor-report", note: "Portfolio Value at the beginning — the XIRR's opening stake, printed nowhere else for this manager." },
    cashFlows:       { reportType: "investor-report", note: "Capital Contribution, SINCE INCEPTION, dated." },
    clientXirr:      { reportType: "investor-report", note: "the manager's own XIRR%, as a cross-check on ours — never as a substitute." },
  },
  "Carnelian Asset Management and Advisors Pvt Ltd": PMS_REPORTING_SYSTEM,
  // Fourth manager on the same reporting system: identical report set, identical
  // filenames, identical column layout. Verified on VECBES0003/0004 before this
  // key was added — a key added on the strength of the filename alone would
  // claim precedence over tables nobody checked.
  "V.E.C Assago Capital Management LLP": PMS_REPORTING_SYSTEM,

  /**
   * BUOYANT issues from this system too, and its PMS APPRAISAL is authoritative
   * for holdings — not its own Category III account statement.
   *
   * Both report the same position for folio 103473 and agree, so for that folio
   * the choice is cosmetic. It is not cosmetic for 103472: Ankita's ₹27.69 Cr
   * folio sends the PMS set and NO account statement, so naming the account
   * statement authoritative would leave her holding out of the book entirely.
   * The appraisal also carries the primitives this book wants — quantity, unit
   * cost, price — where the account statement carries a summary row.
   *
   * The appraisal reports the AIF UNIT, one row under "Alternative Assets". It
   * is not a look-through, so nothing here turns a fund into equities.
   */
  "Buoyant Capital": PMS_REPORTING_SYSTEM,

  /**
   * MOLECULE VENTURES delivers the whole report set as ONE PDF.
   *
   * It publishes no portfolio APPRAISAL, so the block above cannot be reused
   * wholesale — naming the appraisal would resolve to a document that does not
   * exist and drop the account. What it does publish, on pages 2–3 of the same
   * file, is a CURRENT PORTFOLIO carrying quantity, unit cost, total cost and
   * market price: the primitives, complete, cash row included.
   *
   * The fact sheet on page 1 prints a market value and a weight and neither a
   * quantity nor a cost, so it stays what it is everywhere else in this table —
   * the sector join. Reading it as the holdings source (which this book did for
   * one run, when the bundle was filed as a single fact-sheet document) derives
   * every weight over an equity-only denominator and disagrees with the
   * statement's own column on all nine rows.
   */
  "Molecule Ventures LLP": {
    holdings:        { reportType: "holdings", note: "CURRENT PORTFOLIO, pp2–3 of the bundle — the only complete holdings table this manager publishes." },
    quantity:        { reportType: "holdings" },
    unitCost:        { reportType: "holdings" },
    totalCost:       { reportType: "holdings" },
    marketPrice:     { reportType: "holdings" },
    marketValue:     { reportType: "holdings", note: "derived as price x quantity; the printed column is the check." },
    accruedIncome:   { reportType: "holdings", note: "the Income column; carried as its own field, never folded into MV." },
    positionIrrPct:  { reportType: "holdings" },
    pctAssets:       { reportType: "holdings" },

    providerSector:  { reportType: "fact-sheet", note: "the sector join, and nothing else — this table has no quantity and no cost." },
    periodReturns:   { reportType: "fact-sheet", note: "TWRR MTD/QTD/YTD/since inception." },
    benchmark:       { reportType: "fact-sheet" },
    capitalInOut:    { reportType: "fact-sheet", note: "Portfolio Summary, since inception." },
    corpus:          { reportType: "fact-sheet" },

    transactions:    { reportType: "transaction-statement", note: "pp4–5 of the bundle." },
    capitalGains:    { reportType: "capital-gain", note: "pp6–7 of the bundle." },
    expenses:        { reportType: "expense-statement", note: "p8 of the bundle." },
  },

  /**
   * SANSHI FUND-I — a Category-III AIF. One monthly account statement carries
   * everything: units, NAV, contribution, valuation and the transaction ledger.
   * There is no second report to disagree with, so precedence here is a record
   * of where each fact comes from rather than a choice between sources.
   */
  "Sanshi Fund": {
    holdings:        { reportType: "unknown", note: "one line — units of one class of the scheme." },
    quantity:        { reportType: "unknown", note: "units balance." },
    marketPrice:     { reportType: "unknown", note: "NAV per unit, PRE-TAX; the post-tax NAV is carried separately." },
    marketValue:     { reportType: "unknown", note: "printed valuation; derived as units x NAV and checked against it." },
    totalCost:       { reportType: "unknown", note: "contribution amount, net of the stamp duty deducted at allotment." },
    accountTotals:   { reportType: "unknown" },
    capitalInOut:    { reportType: "unknown", note: "the transaction ledger, dated." },
    cashFlows:       { reportType: "unknown" },
  },

  /**
   * SVAN INVESTMENT MANAGERS — the SEBI PMS INVESTOR REPORT, monthly. One
   * document containing the holdings, the value bridge, the returns and both
   * dated tables, and it is the ONLY report this manager issues, so there is
   * nothing to choose between.
   *
   * The holdings come from the DETAILED Holding Report, not the three-line
   * Portfolio Allocation summary on page 1: both are on the same basis and agree,
   * and only one of them carries positions.
   */
  "SVAN Investment Managers LLP": {
    holdings:        { reportType: "investor-report", note: "the Holding Report; the page-1 allocation table is the cross-check." },
    quantity:        { reportType: "investor-report" },
    unitCost:        { reportType: "investor-report", note: "average cost." },
    totalCost:       { reportType: "investor-report" },
    marketPrice:     { reportType: "investor-report", note: "market rate." },
    marketValue:     { reportType: "investor-report", note: "derived as rate x quantity; the printed column is income-inclusive and is the check." },
    accruedIncome:   { reportType: "investor-report", note: "the excess of printed market value over rate x quantity, tied to the report's own `Change in accruals`." },
    pctAssets:       { reportType: "investor-report", note: "% to portfolio." },
    accountTotals:   { reportType: "investor-report" },
    periodReturns:   { reportType: "investor-report", note: "TWRR 1Y/3Y/5Y/10Y/since inception, three series kept apart." },
    benchmark:       { reportType: "investor-report" },
    capitalInOut:    { reportType: "investor-report", note: "Capital Contribution, SINCE INCEPTION — not the reporting month." },
    realized:        { reportType: "investor-report" },
    unrealized:      { reportType: "investor-report" },
    income:          { reportType: "investor-report" },
    expenses:        { reportType: "investor-report" },
    fees:            { reportType: "investor-report" },
    cashFlows:       { reportType: "investor-report" },
    transactions:    { reportType: "investor-report", note: "Investments during the reporting period." },
    inceptionDate:   { reportType: "investor-report", note: "account activation date." },
  },

  /**
   * TRANSITION VENTURE CAPITAL FUND I — a DRAWDOWN AIF capital-account
   * statement. The commitment block is the fact no other document in this book
   * carries: half the committed capital is still undrawn and will be called.
   */
  "Transition Venture Capital": {
    holdings:        { reportType: "unknown", note: "one line — units of one class." },
    quantity:        { reportType: "unknown", note: "outstanding units." },
    marketPrice:     { reportType: "unknown", note: "current NAV per unit." },
    marketValue:     { reportType: "unknown", note: "closing value; derived as units x NAV and checked against it." },
    totalCost:       { reportType: "unknown", note: "capital contributed net of initial expenses." },
    accountTotals:   { reportType: "unknown" },
    capitalInOut:    { reportType: "unknown", note: "Transaction Details, dated." },
    income:          { reportType: "unknown", note: "the capital account's income lines." },
    expenses:        { reportType: "unknown" },
    fees:            { reportType: "unknown", note: "management fees, from the capital account." },
    cashFlows:       { reportType: "unknown" },
  },

  /**
   * LKP SECURITIES — a self-directed demat account, four documents, three
   * formats, and the only place in this book where a fact has to be taken from a
   * DIFFERENT date than the valuation.
   *
   * The depository holding statement values the account as on 31/03/2026. The
   * broker's trade ledger runs to 01/07/2026 and disagrees with it on quantity
   * for five securities — Belrise down 6,000, Capri out entirely, two new
   * positions opened on 1 July. Both are correct on their own date, and neither
   * is corrected by the other here: the valuation is what it says it is, and the
   * later positions ride alongside as their own fact.
   *
   * The lot register is the reason this account matters out of proportion to its
   * ₹0.99 Cr. It is the ONE source in the drop with dated acquisition lots.
   */
  "LKP Securities": {
    holdings:        { reportType: "holdings", note: "DEPOSITORY HOLDING STATEMENT — the only holdings table in this book that prints an ISIN. As on 31/03/2026." },
    quantity:        { reportType: "holdings", note: "as on 31/03/2026; the trade ledger's later net positions are carried separately, never merged." },
    marketPrice:     { reportType: "holdings", note: "the depository's own rate on the statement date." },
    marketValue:     { reportType: "holdings", note: "derived as rate x quantity; the printed value is the check." },
    capitalGains:    { reportType: "capital-gain", note: "519: Annual P&L II — one row per LOT, with BOTH the buy date and the sale date." },
    transactions:    { reportType: "transaction-statement", note: "Global Details Report — trades WITH rates. The CDSL statement records demat movements, which are not trades and carry no price." },
    expenses:        { reportType: "capital-gain", note: "the P&L's EXPENSES rows: CGST, SGST, STT, stamp duty, exchange TOC." },
  },

  /**
   * MUTUAL-FUND FOLIOS. One statement a month per folio, carrying units, NAV and
   * both values — there is no second report to disagree with, so this block
   * records where each fact comes from rather than choosing between sources.
   *
   * The same block serves four AMCs because the FACTS are the same three columns
   * whatever the layout; `providers/mutualFundFolio.mjs` absorbs the three
   * different table shapes and hands back one document.
   */
  ...Object.fromEntries([
    "Aditya Birla Sun Life Mutual Fund", "Kotak Mahindra Mutual Fund",
    "Mirae Asset Mutual Fund", "HDFC Mutual Fund", "Mutual fund folio",
  ].map((name) => [name, {
    holdings:      { reportType: "holdings", note: "the folio statement's own scheme blocks." },
    quantity:      { reportType: "holdings", note: "closing unit balance." },
    marketPrice:   { reportType: "holdings", note: "NAV on the statement date." },
    marketValue:   { reportType: "holdings", note: "derived as NAV x units; the printed value is the check." },
    totalCost:     { reportType: "holdings", note: "cost of investment, where the AMC prints one — ABSL and Mirae do, HDFC and Kotak do not." },
    accountTotals: { reportType: "holdings" },
  }])),

  /**
   * 360 ONE ALTERNATES — per-folio AIF correspondence. It carries NO holdings:
   * the units are stated but not valued, and the wealth arm's holding statement
   * is what marks them. What it alone carries is the income, and the income's
   * TAX CHARACTER.
   */
  "360 ONE Alternates Asset Management": {
    income:       { reportType: "statement-of-earnings", note: "pro-rata share of fund income, split by tax head — long-term, short-term, debt." },
    expenses:     { reportType: "statement-of-earnings" },
    cashFlows:    { reportType: "distribution-notice", note: "the dated distribution actually remitted." },
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
 * THE SINGLE-SCHEME FUND STATEMENTS — Buoyant, Helios, Motilal Oswal's Founders
 * and Active Momentum funds, 3P, India SME and Sky Capital.
 *
 * ONE DOCUMENT EACH, so there is nothing to choose between — and that is
 * exactly why the entry has to exist. `authoritative()` returns null for a
 * provider with no precedence block, so these eight documents were read
 * correctly, landed in the archive with the right owner and the right figures,
 * and contributed NOTHING to the book: eight accounts at 0 positions and ₹0,
 * holding ₹123.55 Cr between them. Nothing failed and nothing said so.
 *
 * A provider whose statements this pipeline can read must appear here.
 */
for (const provider of [
  // Buoyant is NOT here any more: it issues the shared PMS report set as well as
  // its own account statement, and takes PMS_REPORTING_SYSTEM above. This loop
  // runs after that assignment and would overwrite it.
  "Helios Mutual Fund",
  "Motilal Oswal Founders Fund",
  "Motilal Oswal Active Momentum Fund",
  "3P Investment Managers",
  "India SME Investments",
  "Sky Capital Rising Titans Fund",
  "Neo Infra Income Opportunities Fund",
  "Baring Private Equity India Fund",
  "Carnelian Bharat Amritkaal Fund",
  "Motilal Oswal Delphi Equity Fund",
  // Redeemed to nil and carrying no holding — the entry is here anyway, because
  // a provider with no precedence block contributes nothing SILENTLY, and an
  // account that holds nothing and an account nobody wired look identical from
  // the book. This one is a decision; that one is a defect.
  "Motilal Oswal Hedged Equity Multi Factor Strategy",
]) {
  PRECEDENCE[provider] = {
    holdings: { reportType: "holdings", note: "the fund's own account statement — the only document this issuer sends." },
    // No transaction tape, no capital gain statement, no dividend statement:
    // these issuers send one document and it carries a position, not a ledger.
    // Left ABSENT rather than pointed at the holdings document, so the book
    // reports no realised gain for them instead of a wrong one.
  };
}

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
