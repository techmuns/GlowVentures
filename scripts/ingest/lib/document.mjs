// The normalized document — the contract every provider extractor must return.
//
// This is the seam. Above it, code knows about 360 ONE's "Detailed Holding
// Statement" and GoldStandard's "PortFolioFactSheet". Below it, nothing does:
// the archive writer, the reconciler and the eventual book builder see only the
// shapes defined here. `assertNormalized` enforces that at runtime, so a
// provider quirk cannot quietly leak downstream and become everyone's problem.
//
// Every numeric field is `number | null`, and null means NOT REPORTED. No field
// is ever defaulted to 0 — see parseNum.mjs for why that distinction is load
// bearing.
import { securityKeyOf } from "../../../shared/securityKey.mjs";

/** Normalized asset classes. PMS is deliberately absent — it is an engagement. */
export const ASSET_CLASSES = [
  "Equity", "ETF", "Mutual Fund", "AIF", "Bond", "Structured Product", "Unlisted", "Cash",
];

/** Normalized engagements. */
export const ENGAGEMENTS = ["PMS", "AIF", "Advisory", "Distribution", "Execution", "Direct"];

/** One holding row, provider-neutral. */
export function makeHolding(input) {
  const security = String(input.security ?? "").trim();
  return {
    security,
    securityKey: input.securityKey ?? securityKeyOf(security),
    isin: input.isin ?? null,
    symbol: input.symbol ?? null,
    assetClass: input.assetClass ?? null,
    providerSector: input.providerSector ?? null,
    /** Manager / scheme sleeve, where the provider reports one (360 ONE). */
    manager: input.manager ?? null,
    quantity: num(input.quantity),
    unitCost: num(input.unitCost),
    totalCost: num(input.totalCost),
    marketPrice: num(input.marketPrice),
    marketValue: num(input.marketValue),
    gainLoss: num(input.gainLoss),
    pctGainLoss: num(input.pctGainLoss),
    pctAssets: num(input.pctAssets),
    /** Carried separately, never folded into marketValue. */
    accruedIncome: num(input.accruedIncome),
    distributedIncome: num(input.distributedIncome),
    realized: num(input.realized),
    unrealized: num(input.unrealized),
    positionIrrPct: num(input.positionIrrPct),
    benchmarkIrrPct: num(input.benchmarkIrrPct),
    priceAsOn: input.priceAsOn ?? null,
    /** Which docKey + section this row came from. */
    source: input.source ?? null,
  };
}

const num = (v) => (v === undefined || v === null || Number.isNaN(v) ? null : Number(v));

/** A totals block as PRINTED by the report — never recomputed here. */
export function makeTotals(input = {}) {
  return {
    equityMarketValue: num(input.equityMarketValue),
    cashValue: num(input.cashValue),
    totalMarketValue: num(input.totalMarketValue),
    equityCost: num(input.equityCost),
    totalCost: num(input.totalCost),
    gainLoss: num(input.gainLoss),
    pctGainLoss: num(input.pctGainLoss),
    positionCount: num(input.positionCount),
    source: input.source ?? null,
  };
}

/** A period-return series (TWRR / IRR) as printed. */
export function makeReturnSeries(input) {
  return {
    series: String(input.series ?? "").trim(),   // "Portfolio" | "N50TRI" | …
    isBenchmark: !!input.isBenchmark,
    mtd: num(input.mtd), qtd: num(input.qtd), ytd: num(input.ytd), si: num(input.si),
    source: input.source ?? null,
  };
}

/** Account-level capital and P&L flows for the period. */
export function makeFlows(input = {}) {
  return {
    contribution: num(input.contribution),
    withdrawal: num(input.withdrawal),
    netCapitalInOut: num(input.netCapitalInOut),
    realized: num(input.realized),
    unrealized: num(input.unrealized),
    income: num(input.income),
    expenses: num(input.expenses),
    fees: num(input.fees),
    profit: num(input.profit),
    corpus: num(input.corpus),
    source: input.source ?? null,
  };
}

/** A dated cash flow or corporate action. */
export function makeCashFlow(input) {
  return {
    date: input.date ?? null,             // ISO
    description: String(input.description ?? "").trim(),
    security: input.security ?? null,
    securityKey: input.security ? securityKeyOf(input.security) : null,
    kind: input.kind ?? null,             // "transaction" | "corporate-action"
    amount: num(input.amount),
    units: num(input.units),
    source: input.source ?? null,
  };
}

/**
 * The document envelope.
 *
 * `status`:
 *   ok       — every table the extractor set out to read was located and read
 *   partial  — the document was understood but something was missing; see warnings
 *   failed   — the document could not be read at all
 */
export function makeDocument(input) {
  return {
    docKey: input.docKey,
    provider: input.provider,
    accountNo: input.accountNo ?? null,
    owner: input.owner ?? null,
    ownerId: input.ownerId ?? null,
    familyGroup: input.familyGroup ?? null,
    strategy: input.strategy ?? null,
    engagement: input.engagement ?? null,
    providerEngagement: input.providerEngagement ?? null,
    asOf: input.asOf ?? null,
    inceptionDate: input.inceptionDate ?? null,
    reportType: input.reportType ?? "unknown",
    sourcePath: input.sourcePath,
    pages: input.pages ?? null,
    status: input.status ?? "partial",
    warnings: input.warnings ?? [],
    /** Provider-neutral facts. */
    holdings: input.holdings ?? [],
    totals: input.totals ?? null,
    returns: input.returns ?? [],
    flows: input.flows ?? null,
    cashFlows: input.cashFlows ?? [],
    /** Raw tables, for the audit archive: { sectionName: { name, rows } }. */
    sections: input.sections ?? {},
    /** Every stitch the layout engine applied, for provenance. */
    stitches: input.stitches ?? [],
  };
}

/** Throw if a document breaks the contract — called on every extractor result. */
export function assertNormalized(doc) {
  const bad = (m) => { throw new Error(`normalized-document violation in ${doc?.docKey ?? "(no docKey)"}: ${m}`); };
  if (!doc || typeof doc !== "object") bad("not an object");
  if (!doc.docKey) bad("missing docKey");
  if (!doc.provider) bad("missing provider");
  if (!["ok", "partial", "failed"].includes(doc.status)) bad(`bad status ${doc.status}`);
  if (doc.engagement && !ENGAGEMENTS.includes(doc.engagement)) bad(`unknown engagement ${doc.engagement}`);
  for (const h of doc.holdings) {
    if (!h.securityKey) bad("holding without securityKey");
    if (h.assetClass && !ASSET_CLASSES.includes(h.assetClass)) bad(`unknown assetClass ${h.assetClass}`);
    for (const k of ["quantity", "totalCost", "marketValue", "gainLoss"]) {
      if (h[k] !== null && typeof h[k] !== "number") bad(`holding.${k} must be number|null, got ${typeof h[k]}`);
    }
  }
  return doc;
}

/** docKey = provider-accountNo-asOf-reportType, filesystem- and URL-safe. */
export function makeDocKey({ provider, accountNo, asOf, reportType }) {
  const slug = (s) => String(s ?? "unknown")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
  return [slug(provider), slug(accountNo), slug(asOf), slug(reportType)].join("-");
}
