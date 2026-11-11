import type { Portfolio, Position } from './types';
import type { AvailableCardReturn, GainCardReturn } from './availableCardReturns';
import type { BookFolio } from './privateBook';
import { figuresOf } from './privateBook';
import { accountIndex, engagementOf } from './accounts';
import { bucketLabel, holdingBucket } from './analytics';
import { fmtCurrency, fmtDate } from './format';
import type { ReportPeriod } from './cioReportPeriod';
import type { cioReportReturns } from './cioReportReturns';

/** The client wordmark already used in Sidebar; Munshot is the report provider. */
export const REPORT_BRAND = { name: 'Glow Ventures', mark: 'G', provider: 'Munshot AI' } as const;
export const REPORT_COLORS = ['#003f43', '#7e9f9e', '#34558e', '#c0d1ec', '#b35406', '#f5a56b', '#b8cdca'];

export type ReportBucket = { key: string; current: number; invested: number | null; retPct: number | null;
  count: number; withoutCost: number };
export type CioReportSummary = { totalValue: number; totalInvested: number | null; noCostCount: number;
  noCostMV: number; buckets: ReportBucket[]; available: { gain: GainCardReturn; history: AvailableCardReturn;
    fytd: AvailableCardReturn; ytd: AvailableCardReturn }; privateFolios: BookFolio[];
  deploy: { committed: number; drawn: number | null; unfunded: number | null; distributed: number | null } };
export type ReportHolding = { name: string; category: string; sector: string; value: number;
  cost: number | null; unrealised: number | null; pct: number | null; weight: number;
  accounts: number; atCost: boolean; dates: string; assetClasses: string[]; private: boolean };
export type CioReportSnapshot = ReturnType<typeof cioReportSnapshot>;

/** All inputs come from the selected Morning CIO model. No sample figures or DOM scraping. */
export function cioReportSnapshot({ portfolio, positions, summary, scope, currency, convert, period, selected, now = new Date() }: {
  portfolio: Portfolio; positions: readonly Position[]; summary: CioReportSummary; scope: string;
  currency: string; convert: (n: number) => number; now?: Date;
  period: ReportPeriod; selected: ReturnType<typeof cioReportReturns>;
}) {
  const accounts = accountIndex(portfolio.accounts);
  const money = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? ''
    : fmtCurrency(convert(n), currency, { compact: true });
  const percent = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? ''
    : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const markDates = [...new Set(positions.map(p => p.priceEvidence?.effectiveAt?.slice(0, 10)
    ?? p.navDate ?? accounts.get(p.accountId)?.asOf).filter((d): d is string => !!d))].sort();
  const datesOf = (ps: readonly Position[]) => {
    const ds = [...new Set(ps.map(p => p.priceEvidence?.effectiveAt?.slice(0, 10)
      ?? p.navDate ?? accounts.get(p.accountId)?.asOf).filter((d): d is string => !!d))].sort();
    return ds.length ? ds[0] === ds.at(-1) ? fmtDate(ds[0]) : `${fmtDate(ds[0])} - ${fmtDate(ds.at(-1)!)}` : '';
  };
  const grouped = new Map<string, Position[]>();
  for (const p of positions) {
    const category = bucketLabel(holdingBucket(p, engagementOf(accounts, p)));
    const key = `${category}|${p.marketSide ?? 'unplaced'}|${p.securityKey}`;
    grouped.set(key, [...(grouped.get(key) ?? []), p]);
  }
  const holdings: ReportHolding[] = [...grouped.values()].map(ps => {
    const value = ps.reduce((t, p) => t + p.marketValue, 0);
    // A missing cost must never turn into a zero or a return on a narrower set.
    const completeCost = ps.every(p => p.costBasis != null && !p.costUnavailable);
    const cost = completeCost ? ps.reduce((t, p) => t + p.costBasis!, 0) : null;
    const atCost = ps.some(p => p.valuedAtCost);
    const unrealised = completeCost && !atCost && ps.every(p => p.unrealizedPnL != null)
      ? ps.reduce((t, p) => t + p.unrealizedPnL!, 0) : null;
    return { name: ps[0].security, category: bucketLabel(holdingBucket(ps[0], engagementOf(accounts, ps[0]))),
      sector: ps[0].sector, value, cost, unrealised,
      pct: cost != null && cost > 0 && unrealised != null ? unrealised / cost * 100 : null,
      weight: summary.totalValue > 0 ? value / summary.totalValue * 100 : 0,
      accounts: new Set(ps.map(p => p.accountId)).size, atCost, dates: datesOf(ps),
      assetClasses: [...new Set(ps.map(p => p.assetClass))], private: ps[0].marketSide === 'private' };
  }).sort((a, b) => b.value - a.value);
  const privateRows = summary.privateFolios.filter(f => f.counted || f.capitalCounted).map(f => ({
    name: f.fundName, owner: f.owner, date: f.asOf, figures: figuresOf([f], true),
  }));
  const periods = [{ label: period.label, card: selected }];
  const allocated = summary.buckets.filter(b => b.count > 0 || b.current !== 0);
  return { brand: REPORT_BRAND, date: period.to, exportedOn: date, period, selected, historical: selected.historical,
    generatedAt: now.toISOString(), scope, currency, money, percent, holdings, positions: [...positions],
    summary, buckets: allocated, privateRows, periods, markDates,
    markSpan: markDates.length ? `${fmtDate(markDates[0])} - ${fmtDate(markDates.at(-1)!)}` : '',
    accountCount: new Set(positions.map(p => p.accountId)).size,
    equity: holdings.filter(h => h.assetClasses.includes('Equity') && !h.private),
    // The report's sections are selected by actual holdings, using the same bucket rule as CIO.
    categories: [...new Set(holdings.map(h => h.category))],
  };
}
