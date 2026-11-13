// ── PRIVATE MARKET → GENERATE REPORT (client #418) ──────────────────────────
//
// *"can I simply create a separate report … where I select either all or a
//  subset of all the investments … and generate a summary of progression or
//  performance of investments over time, valuation, etc. … PDF, Excel,
//  management-ready."* — Gaurav, 5 Nov 2026.
//
// A management-ready report of the private book: a summary across the selection
// and one row per investment with its invested cost, current value, unrealised
// gain, capital paid in and distributed, TVPI multiple and money-weighted IRR.
//
// EVERY FIGURE IS A DATED RECORD THE BOOK ALREADY CARRIES — the same model the
// Private Market page draws (`m.funds`), and the same dated capital/valuation
// records the History tab reads (`fundHistoryModel`, `periodFundXirr`). NOTHING
// is fabricated: a figure the records do not carry is left blank, an investment
// held at cost shows no return, and a fund with one dated valuation shows its
// inception→latest IRR only (its period-specific IRR fills when quarterly NAVs
// arrive, exactly as on the History tab).
import type { FundDated } from "./fundReturns";
import { fundHistoryModel, periodFundXirr } from "./fundHistory";
import { sumOrNull } from "./analytics";
import type { ReportPeriod } from "./cioReportPeriod";
import { fmtCurrency, fmtDate } from "./format";

/** The client wordmark used across the dashboard; Munshot is the report provider. */
export const PRIVATE_REPORT_BRAND = { name: "Glow Ventures", mark: "G", provider: "Munshot AI" } as const;

/** One investment the report draws — the fields the page's fund rows already carry. */
export type PrivateReportInput = {
  securityKey: string;
  security: string;
  cost: number | null;
  mv: number;
  pnl: number | null;
  /** The whole row's at-cost flag, exactly as the page computes it (Stage 10dh). */
  atCost: boolean;
};

export type PrivateReportTotals = {
  committed: number | null;
  called: number | null;
  undrawn: number | null;
};

export type PrivateReportRow = {
  name: string;
  invested: number | null;
  value: number;
  unrealised: number | null;
  paidIn: number | null;
  distributed: number | null;
  tvpi: number | null;
  irrPct: number | null;
  irrAnnualised: boolean;
  /** Why no IRR, where one is absent — shown as the blank cell's note, never a guess. */
  irrReason: string | null;
  valuedAt: string | null;
  atCost: boolean;
};

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Build the report's data from the page's own fund rows and dated records. The
 * capital-commitment totals (committed / called / undrawn) come straight from
 * the page's consolidated tiles, so the report cannot count them a second way.
 */
export function privateReportSnapshot({ funds, fundDated, totals, scope, currency, convert, period, now = new Date() }: {
  funds: readonly PrivateReportInput[];
  fundDated: Map<string, FundDated>;
  totals: PrivateReportTotals;
  scope: string;
  currency: string;
  convert: (n: number) => number;
  period: ReportPeriod;
  now?: Date;
}) {
  const money = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "" : fmtCurrency(convert(n), currency, { compact: true });
  const percent = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  const multiple = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "" : `${n.toFixed(2)}x`;

  const rows: PrivateReportRow[] = funds.map((f) => {
    const fd = fundDated.get(f.securityKey);
    const h = fundHistoryModel(fd, f.securityKey);
    // The only money-weighted window a private fund can measure today is its own
    // inception → latest valuation (Stage 10nz); a narrower one needs NAVs it has not filed.
    const w = h.fullWindow;
    const irr = w ? periodFundXirr(fd, w.from, w.to) : null;
    return {
      name: f.security,
      invested: f.cost,
      value: f.mv,
      unrealised: f.pnl,
      paidIn: h.paidIn > 0 ? h.paidIn : null,
      distributed: h.distributionsKnown ? h.distributed : null,
      tvpi: h.tvpi,
      irrPct: irr?.ok ? irr.pct : null,
      irrAnnualised: irr?.ok ? irr.annualised : false,
      irrReason: irr?.ok ? null : (irr?.reason ?? "no dated capital record for this investment"),
      valuedAt: h.latestValuedAt,
      atCost: f.atCost,
    };
  }).sort((a, b) => b.value - a.value);

  const value = rows.reduce((t, r) => t + r.value, 0);
  // The COVERED SUBSET, struck exactly as the page's Capital invested and
  // Unrealised P&L tiles strike them (`sumOrNull`): the investments that report
  // the figure, counted and named, never widened to the whole book and never
  // blended with a zero for the ones that do not. `—` only if none report it.
  const investedOf = rows.filter((r) => r.invested != null).length;
  const invested = sumOrNull(rows.map((r) => r.invested));
  const unrealisedOf = rows.filter((r) => r.unrealised != null).length;
  const unrealised = sumOrNull(rows.map((r) => r.unrealised));
  // Multiples pool only the investments whose paid-in is on record, named by count.
  const withPaid = rows.filter((r) => r.paidIn != null && r.paidIn > 0);
  const paidIn = withPaid.length ? withPaid.reduce((t, r) => t + (r.paidIn ?? 0), 0) : null;
  const distKnown = withPaid.filter((r) => r.distributed != null);
  const distributed = distKnown.length === withPaid.length && withPaid.length ? withPaid.reduce((t, r) => t + (r.distributed ?? 0), 0) : null;
  const pooledValue = withPaid.reduce((t, r) => t + r.value, 0);
  const dpi = paidIn && distributed != null ? distributed / paidIn : null;
  const rvpi = paidIn ? pooledValue / paidIn : null;
  const tvpi = dpi != null && rvpi != null ? dpi + rvpi : null;
  const atCost = rows.filter((r) => r.atCost);

  return {
    brand: PRIVATE_REPORT_BRAND, scope, currency, period, generatedAt: now.toISOString(), exportedOn: isoDate(now),
    date: period.to, money, percent, multiple,
    // The display-currency converter, so the Excel export can carry real numbers
    // (which Excel can sum and sort) rather than the formatted strings the PDF uses.
    convert,
    rows, count: rows.length, investedOf, unrealisedOf,
    atCostCount: atCost.length, atCostValue: atCost.reduce((t, r) => t + r.value, 0),
    multiplesOf: withPaid.length,
    totals: {
      value, invested, unrealised,
      committed: totals.committed, called: totals.called, undrawn: totals.undrawn,
      paidIn, distributed, dpi, rvpi, tvpi,
    },
    // The valuation dates the row values carry, so the report can state them.
    valuedSpan: (() => {
      const ds = [...new Set(rows.map((r) => r.valuedAt).filter((d): d is string => !!d))].sort();
      return ds.length ? ds[0] === ds.at(-1) ? fmtDate(ds[0]) : `${fmtDate(ds[0])} - ${fmtDate(ds.at(-1)!)}` : "";
    })(),
  };
}

export type PrivateReportSnapshot = ReturnType<typeof privateReportSnapshot>;
