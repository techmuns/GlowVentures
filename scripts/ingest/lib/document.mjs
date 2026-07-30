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

/** Normalized engagements. `unknown` is explicit: it is never a silent default. */
export const ENGAGEMENTS = ["PMS", "AIF", "Advisory", "Distribution", "Execution", "Direct", "unknown"];

/**
 * One member sub-account within a provider account.
 *
 * A single 360 ONE CRN spans several members on DIFFERENT engagements —
 * CRN60117 carries both an Advisory member (LE53288) and a Distribution one
 * (LE51867); CRN37702 carries Distribution (LE53856) and Executionary (E29000),
 * and Ajay's May corporate actions are tagged Executionary while his holding
 * sits in Distribution. Engagement therefore cannot live on the account: a
 * single value would be wrong for half the rows beneath it.
 */
export function makeMember(input) {
  return {
    memberId: String(input.memberId ?? "").trim(),
    label: String(input.label ?? "").trim(),
    engagement: input.engagement ?? "unknown",
    /** The provider's own wording, verbatim — "Executionary", not "Execution". */
    providerEngagement: input.providerEngagement ?? null,
  };
}

/** Map a provider's engagement wording to the normalized value. Never guesses. */
export function normalizeEngagement(raw) {
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return "unknown";
  if (/execution/.test(t)) return "Execution";        // "Executionary"
  if (/distribut/.test(t)) return "Distribution";
  if (/advisor/.test(t)) return "Advisory";
  if (/\bpms\b|portfolio manage/.test(t)) return "PMS";
  if (/\baif\b|alternative/.test(t)) return "AIF";
  if (/direct/.test(t)) return "Direct";
  return "unknown";
}

/**
 * The account-level engagement, DERIVED from its members rather than asserted:
 * the engagement holding the most market value. Returns "unknown" when there
 * are no members or none could be classified — an account is never labelled
 * Advisory (or anything else) just because nothing was found.
 */
export function dominantEngagement(members, holdings = []) {
  if (!members?.length) return "unknown";
  if (members.length === 1) return members[0].engagement;
  const weight = new Map();
  for (const h of holdings) {
    const m = members.find((x) => x.memberId === h.memberId);
    if (!m) continue;
    weight.set(m.engagement, (weight.get(m.engagement) ?? 0) + (h.marketValue ?? 0));
  }
  if (!weight.size) {
    const known = members.filter((m) => m.engagement !== "unknown");
    return known.length === 1 ? known[0].engagement : "unknown";
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * One holding row, provider-neutral.
 *
 * PRIMITIVES vs DERIVED — the central rule of this layer.
 *
 * A statement's own arithmetic is not internally consistent. The GoldStandard
 * Appraisal prints Sundaram Finance at MV 7,740,510 with %Assets 4.29%, but
 * 7,740,510 / 181,533,677 = 4.26% — its percentage is computed on an
 * income-inclusive basis that its own MV column excludes. Ingesting both as
 * facts imports that contradiction into the book, where it surfaces later as
 * weights that do not sum to 100 and no way to tell which side is wrong.
 *
 * So only PRIMITIVES are ingested: quantity, unit cost, total cost, market
 * price, accrued income — plus market value where the provider reports no price
 * (360 ONE AIF units are marked at a NAV per unit, but some rows carry only a
 * value). Everything derivable is DERIVED from those, by `deriveHolding` below.
 *
 * The printed figures are still read, into `printed.*`. They are not a source —
 * they are a CHECK. Every derived value is compared against its printed
 * counterpart and the delta goes to the reconciliation report.
 */
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
    /**
     * Which member sub-account holds this, when the statement identifies one.
     * A single 360 ONE CRN spans members on different engagements.
     */
    memberId: input.memberId ?? null,

    // ── PRIMITIVES — read from the statement, never computed ────────────────
    quantity: num(input.quantity),
    unitCost: num(input.unitCost),
    totalCost: num(input.totalCost),
    marketPrice: num(input.marketPrice),
    /** Carried separately, never folded into marketValue. */
    accruedIncome: num(input.accruedIncome),
    distributedIncome: num(input.distributedIncome),
    realized: num(input.realized),
    positionIrrPct: num(input.positionIrrPct),
    benchmarkIrrPct: num(input.benchmarkIrrPct),
    priceAsOn: input.priceAsOn ?? null,

    // ── DERIVED — filled by deriveHolding(); null until then ────────────────
    marketValue: null,
    gainLoss: null,
    pctGainLoss: null,
    pctAssets: null,
    unrealized: null,

    /**
     * What the statement PRINTED for each derivable field. A cross-check, not a
     * source. `null` means the report did not print it.
     */
    printed: {
      marketValue: num(input.marketValue),
      gainLoss: num(input.gainLoss),
      pctGainLoss: num(input.pctGainLoss),
      pctAssets: num(input.pctAssets),
      unrealized: num(input.unrealized),
    },
    /**
     * Set when market value could not be computed from price x quantity and the
     * printed value was adopted instead — true for holdings reported by value
     * only. Named so the report can say which figures are second-hand.
     */
    marketValueFromPrinted: false,

    /** Assigned by the reconciler when this row also appears under another owner. */
    dedupeGroup: input.dedupeGroup ?? null,
    alsoReportedUnder: input.alsoReportedUnder ?? [],

    /** Which docKey + section this row came from. */
    source: input.source ?? null,
  };
}

const num = (v) => (v === undefined || v === null || Number.isNaN(v) ? null : Number(v));
const r2 = (n) => (n === null ? null : Math.round(n * 100) / 100);

/**
 * Compute the derived fields for one holding.
 *
 * `portfolioTotal` is the denominator for %assets: the TOTAL portfolio value
 * including cash (181,533,677 for GoldStandard 100023 at 10/07/2026, giving
 * equity 98.08% + cash 1.92% = 100.00%). Passing an equity-only denominator
 * would make the weights sum to more than 100.
 *
 * Anything that cannot be computed stays null. A missing input never becomes a
 * zero, so a holding with no cost reports no gain rather than reporting its
 * whole value as profit.
 */
export function deriveHolding(h, portfolioTotal = null) {
  // Market value: price x quantity is the definition. Where the provider reports
  // no price, the printed value is the only measurement available and is adopted
  // — flagged, so the report can distinguish computed from copied.
  let marketValue = null;
  let fromPrinted = false;
  if (h.marketPrice !== null && h.quantity !== null) {
    marketValue = r2(h.marketPrice * h.quantity);
  } else if (h.printed?.marketValue !== null && h.printed?.marketValue !== undefined) {
    marketValue = h.printed.marketValue;
    fromPrinted = true;
  }

  const gainLoss = marketValue !== null && h.totalCost !== null ? r2(marketValue - h.totalCost) : null;
  const pctGainLoss = gainLoss !== null && h.totalCost ? r2((gainLoss / h.totalCost) * 100) : null;
  const pctAssets = marketValue !== null && portfolioTotal ? r2((marketValue / portfolioTotal) * 100) : null;

  return {
    ...h,
    marketValue,
    marketValueFromPrinted: fromPrinted,
    gainLoss,
    pctGainLoss,
    pctAssets,
    // Unrealised gain on a still-held position IS the gain/loss. Kept as its own
    // field because 360 ONE prints unrealised and realised separately.
    unrealized: gainLoss,
  };
}

/**
 * Derive every holding in a document, using the document's own printed total
 * portfolio value as the %assets denominator where one was read.
 */
export function deriveDocument(doc) {
  const portfolioTotal = doc.totals?.totalMarketValue ?? null;
  return { ...doc, holdings: doc.holdings.map((h) => deriveHolding(h, portfolioTotal)) };
}

/**
 * A totals block as PRINTED by the report.
 *
 * Kept verbatim and never recomputed — it is one side of the row-sum check in
 * reconcile.mjs, and rewriting it would delete the evidence of a disagreement.
 */
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

/**
 * A period-return series (TWRR / IRR) as printed.
 *
 * `fytd`, not `ytd`: GoldStandard's "YTD" is the INDIAN FINANCIAL year to date,
 * from 1 April — the Perf Summary window is literally 01/04/2026 to 10/07/2026.
 * Calling it YTD in the model would have the cockpit compare it against calendar
 * year-to-date figures from every other source.
 *
 * `siAnnualised` records whether the since-inception figure is annualised. The
 * provider annualises only beyond one year; inception 26/12/2025 to 10/07/2026
 * is ~6.5 months, so the Perf Summary prints Absolute 16.69% = Annualized
 * 16.69%. Presenting a 6.5-month figure as a p.a. rate overstates it.
 */
export function makeReturnSeries(input) {
  return {
    series: String(input.series ?? "").trim(),   // "Portfolio" | "N50TRI" | …
    isBenchmark: !!input.isBenchmark,
    mtd: num(input.mtd),
    qtd: num(input.qtd),
    fytd: num(input.fytd ?? input.ytd),
    si: num(input.si),
    siAnnualised: input.siAnnualised ?? null,
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
    /** Member sub-account the row is tagged to, when the statement says. */
    memberId: input.memberId ?? null,
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
    /** Member sub-accounts, each with its own engagement. See makeMember. */
    members: input.members ?? [],
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
  for (const m of doc.members ?? []) {
    if (!m.memberId) bad("member without memberId");
    if (!ENGAGEMENTS.includes(m.engagement)) bad(`unknown member engagement ${m.engagement}`);
  }
  for (const h of doc.holdings) {
    if (!h.securityKey) bad("holding without securityKey");
    if (h.assetClass && !ASSET_CLASSES.includes(h.assetClass)) bad(`unknown assetClass ${h.assetClass}`);
    for (const k of ["quantity", "totalCost", "marketValue", "gainLoss"]) {
      if (h[k] !== null && typeof h[k] !== "number") bad(`holding.${k} must be number|null, got ${typeof h[k]}`);
    }
    // A derivable field must never be ingested as truth — that is the whole
    // point of the primitives/derived split, and it is cheap to enforce.
    if (!("printed" in h)) bad(`holding ${h.security} has no printed{} block — built outside makeHolding?`);
  }
  return doc;
}

/** docKey = provider-accountNo-asOf-reportType, filesystem- and URL-safe. */
export function makeDocKey({ provider, accountNo, asOf, reportType }) {
  const slug = (s) => String(s ?? "unknown")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
  return [slug(provider), slug(accountNo), slug(asOf), slug(reportType)].join("-");
}
