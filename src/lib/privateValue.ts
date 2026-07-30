// Private-markets value-creation model: segment rollups, a startup bucket
// classification and per-startup value created — all derived from the private
// book (marks in portfolio.privateMarkets). No external data.
import type { Portfolio, StartupInvestment, FundInvestment } from "./types";
import { startupTotals, fundTotals } from "./analytics";
import type { PrivateSheet } from "./auditFormulas";

export type TaggedFund = FundInvestment & { sheet: PrivateSheet };

// Every fund tagged with the workbook sheet it came from, so any row on any
// segment can deep-link to its exact source row in Data Audit.
export function taggedFunds(portfolio: Portfolio) {
  const pm = portfolio.privateMarkets;
  const pe: TaggedFund[] = pm.peFunds.map((f) => ({ ...f, sheet: "private-equity-funds" }));
  const preIpo: TaggedFund[] = pm.preIpoFunds.map((f) => ({ ...f, sheet: "pre-ipo" }));
  const unlisted: TaggedFund[] = pm.unlistedCompanies.map((f) => ({ ...f, sheet: "pre-ipo" }));
  const debt: TaggedFund[] = pm.debtFunds.map((f) => ({ ...f, sheet: "debt-fund" }));
  const closed: TaggedFund[] = pm.closedFunds.map((f) => ({ ...f, sheet: "private-equity-funds" }));
  return { pe, preIpo, unlisted, debt, closed, all: [...pe, ...preIpo, ...unlisted, ...debt] };
}

// ── The classification ────────────────────────────────────────────────────────
// One list of what the private book is made of. The composition pie, the
// value-creation bars and the page's tabs are all built from it, so they can't
// disagree on how many classes there are, what they're called, what colour they
// are or what order they come in — and every holding belongs to exactly one.

export type PrivateClassKey = "startups" | "unlisted" | "pe" | "pre-ipo" | "debt";

export type PrivateClass = {
  key: PrivateClassKey;
  /** Full name, used for tabs and the pie legend. */
  label: string;
  /** Short name for the narrow bar-chart gutter. */
  short: string;
  color: string;
  sheet: PrivateSheet;
  /** Pooled funds; empty for startups, which carry their own richer shape. */
  funds: TaggedFund[];
  count: number;
  invested: number;
  current: number;
  markup: number;
  /** MOIC — current mark ÷ invested. The mark-only reading. */
  multiple: number;
  distributed: number;
  /** Current mark + cash already returned — everything the capital has produced. */
  totalValue: number;
  /** Net total return per ₹1 invested. See netMultiple(). */
  netMultiple: number;
  /** Total value − invested. The gain including cash already taken off the table. */
  totalGain: number;
  /** Committed but not yet called. Zero for anything bought outright. */
  unfunded: number;
};

// ── The one return metric ─────────────────────────────────────────────────────
// Net total return per ₹1 invested: the current mark PLUS cash already returned.
//
// This is TVPI where a holding has paid cash back, and arithmetically identical
// to MOIC where it hasn't — so a single column answers "what has this actually
// made?" for every segment, and the data decides which standard name applies
// rather than a hand-maintained per-segment switch.
//
// The distinction is not cosmetic. A self-liquidating holding (venture debt,
// and any fund far enough into harvest) repays capital as it succeeds, so its
// mark FALLS the better it does: Alteria II returned 98% of a ₹2 Cr commitment
// and still holds ₹66 L, which is 1.31× — but reads as 0.33× on the mark alone.
// Segments that only ever mark up (startups, which distribute nothing) are
// unaffected, because for them the two formulas coincide.
export function netMultiple(invested: number, current: number, distributed: number): number | null {
  return invested > 0 ? (current + distributed) / invested : null;
}

/** The standard name for the net multiple, given whether cash has come back yet. */
export const netMultipleKind = (distributed: number): "TVPI" | "MOIC" => (distributed > 0 ? "TVPI" : "MOIC");

function fundClass(
  key: PrivateClassKey, label: string, short: string, color: string, sheet: PrivateSheet, funds: TaggedFund[],
): PrivateClass {
  const t = fundTotals(funds);
  const totalValue = t.currentValue + t.distributed;
  return {
    key, label, short, color, sheet, funds, count: funds.length,
    invested: t.drawn, current: t.currentValue, markup: t.currentValue - t.drawn,
    multiple: t.drawn > 0 ? t.currentValue / t.drawn : 0,
    distributed: t.distributed, totalValue,
    netMultiple: netMultiple(t.drawn, t.currentValue, t.distributed) ?? 0,
    totalGain: totalValue - t.drawn,
    unfunded: t.unfunded,
  };
}

export function privateClasses(portfolio: Portfolio): PrivateClass[] {
  const f = taggedFunds(portfolio);
  const st = startupTotals(portfolio.privateMarkets.startups);
  // The startup book records no distributions, so its net multiple is its MOIC.
  const startups: PrivateClass = {
    key: "startups", label: "Startups", short: "Startups", color: "#d9c48f", sheet: "startup",
    funds: [], count: portfolio.privateMarkets.startups.length,
    invested: st.invested, current: st.fairValue, markup: st.fairValue - st.invested,
    multiple: st.moic ?? 0, distributed: 0, totalValue: st.fairValue,
    netMultiple: st.moic ?? 0, totalGain: st.fairValue - st.invested, unfunded: 0,
  };
  return [
    startups,
    fundClass("unlisted", "Unlisted Companies", "Unlisted Cos", "#10b981", "pre-ipo", f.unlisted),
    fundClass("pe", "PE / VC Funds", "PE / VC Funds", "#e0709b", "private-equity-funds", f.pe),
    fundClass("pre-ipo", "Pre-IPO Funds", "Pre-IPO Funds", "#38bdf8", "pre-ipo", f.preIpo),
    fundClass("debt", "Debt Funds", "Debt Funds", "#818cf8", "debt-fund", f.debt),
  ]
    .filter((c) => c.count > 0)
    .sort((a, b) => b.current - a.current);
}

// Colour a multiple by the value actually printed, not the raw one: 0.9967×
// renders as "1.00×", and a 1.00× shown in loss-red reads as a bug.
export function multipleTone(multiple: number | null | undefined): string {
  if (multiple == null) return "text-slate-400";
  return Number(multiple.toFixed(2)) >= 1 ? "text-gain" : "text-loss";
}

export type BucketKey = "value-driver" | "on-track" | "at-cost" | "watch";
export type BucketTone = "gain" | "info" | "default" | "warn";
export const BUCKET_META: Record<BucketKey, { label: string; color: string; tone: BucketTone; hint: string }> = {
  "value-driver": { label: "Value Driver", color: "#10b981", tone: "gain", hint: "≥ 2.0×" },
  "on-track": { label: "On Track", color: "#818cf8", tone: "info", hint: "1.05–2.0×" },
  "at-cost": { label: "At Cost", color: "#64748b", tone: "default", hint: "≈ 1.0×" },
  "watch": { label: "Watch", color: "#f59e0b", tone: "warn", hint: "< 0.95×" },
};
export const BUCKET_ORDER: BucketKey[] = ["value-driver", "on-track", "at-cost", "watch"];

// Effective money-multiple for a startup: the stored MOIC, or fair value ÷
// invested when the source doesn't carry one.
export function startupMoic(s: { moic: number | null; invested: number; fairValue: number }): number {
  return s.moic ?? (s.invested > 0 ? s.fairValue / s.invested : 1);
}
// Bucket a startup by its current mark. A starting heuristic — analyst-editable
// once the data-bank backend exists.
export function bucketOf(moic: number): BucketKey {
  if (moic >= 2.0) return "value-driver";
  if (moic >= 1.05) return "on-track";
  if (moic >= 0.95) return "at-cost";
  return "watch";
}

export type RankedStartup = StartupInvestment & { markup: number; moicEff: number; bucket: BucketKey };
export type BucketAgg = { key: BucketKey; count: number; invested: number; fairValue: number; moic: number };

export type PrivateValueModel = {
  invested: number; current: number; markup: number; moic: number;
  distributed: number; dpi: number; dryPowder: number;
  totalDrawn: number; tvpi: number;
  classes: PrivateClass[]; startups: RankedStartup[]; buckets: BucketAgg[];
  /** Fully-exited funds: no residual mark, so they sit outside the classes. */
  closed: TaggedFund[];
};

// One definition, used by every private-markets segment.
//
// The page previously carried two: an "analytics" view that ignored the two
// fully-exited funds (distributions ₹25.8 Cr, TVPI 1.54×) and a "value creation"
// view that counted them (₹30.7 Cr, MOIC 1.47×). Same book, two answers. The
// merged page states each figure once:
//
//   • Headline multiple is MOIC — current marks ÷ capital still deployed. It
//     answers "what is the money I'm holding worth now?", so exited funds sit
//     outside both sides of the ratio.
//   • TVPI is kept as a labelled secondary — it adds realised cash back in and
//     divides by everything ever drawn, so it answers the lifecycle question.
//   • Distributions & DPI are lifecycle figures throughout: cash returned is
//     cash returned, whether or not the fund that paid it has since closed.

export function privateValueModel(portfolio: Portfolio): PrivateValueModel {
  const pm = portfolio.privateMarkets;
  const closedF = fundTotals(pm.closedFunds);
  // Roll the book up from the same classification the page navigates by, so the
  // tabs, the bars and these headline figures can only ever add up.
  const classes = privateClasses(portfolio);
  const total = (pick: (c: PrivateClass) => number) => classes.reduce((s, c) => s + pick(c), 0);

  // Value creation = still-held capital → current marks (fully-exited funds excluded).
  const invested = total((c) => c.invested);
  const current = total((c) => c.current);
  const markup = current - invested;
  const moic = invested > 0 ? current / invested : 0;
  // Distributions & dry powder are lifecycle figures — include closed funds.
  const distributed = total((c) => c.distributed) + closedF.distributed;
  const totalDrawn = invested + closedF.drawn;
  const dpi = totalDrawn > 0 ? distributed / totalDrawn : 0;
  const dryPowder = total((c) => c.unfunded) + closedF.unfunded;
  // Lifecycle multiple: what's held now plus all cash returned, over everything
  // ever drawn. Shown beside MOIC, never as the headline.
  const tvpi = totalDrawn > 0 ? (current + distributed) / totalDrawn : 0;

  const startups: RankedStartup[] = pm.startups
    .map((s) => { const m = startupMoic(s); return { ...s, markup: s.fairValue - s.invested, moicEff: m, bucket: bucketOf(m) }; })
    .sort((a, b) => b.markup - a.markup);

  const buckets: BucketAgg[] = BUCKET_ORDER.map((key) => {
    const rows = startups.filter((s) => s.bucket === key);
    const inv = rows.reduce((s, x) => s + x.invested, 0), fv = rows.reduce((s, x) => s + x.fairValue, 0);
    return { key, count: rows.length, invested: inv, fairValue: fv, moic: inv > 0 ? fv / inv : 0 };
  });

  return {
    invested, current, markup, moic, distributed, dpi, dryPowder, totalDrawn, tvpi,
    classes, startups, buckets, closed: taggedFunds(portfolio).closed,
  };
}
