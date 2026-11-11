import type { Account, Position } from './types';
import type { NavUnit } from './bookNav';
import { unitValueAt } from './bookNav';
import { accountIndex } from './accounts';
import { dedupedPositions } from './analytics';
import { groupKeyFor, groupLabelFor } from './groupAxis';
import { UNCLASSIFIED } from './familyTaxonomy';

export const HOME_COLORS: Record<string, string> = {
  Equity: '#378574', Debt: '#b29558', Alternate: '#8a78b5', 'Real Estate': '#759aba', Cash: '#97ab77',
  'Mixed mandates': '#a2a8b5', [UNCLASSIFIED]: '#bac0c6',
};
export const homeColor = (key: string) => HOME_COLORS[key] ?? '#a2a8b5';
export const homeClassLabel = (key: string) => key === UNCLASSIFIED ? 'Unclassified' : groupLabelFor('assetClass')(key);
export type HomeValue = { key: string; label: string; value: number; date: string | null; accountId: string; securityKey: string | null };
export type HomeAsset = { key: string; label: string; value: number; weight: number | null; rows: HomeValue[] };

export function validHomeDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** A whole account's history is never split using today's allocation weights. */
export function homeUnitClass(unit: NavUnit, positions: readonly Position[], accounts: Account[]): string {
  const own = positions.filter(p => p.accountId === unit.accountId && (!unit.securityKey || p.securityKey === unit.securityKey));
  const idx = accountIndex(accounts);
  const classes = new Set(own.filter(p => p.marketValue !== 0).map(p => groupKeyFor('assetClass', idx, p)));
  return classes.size === 1 ? [...classes][0] : classes.size > 1 ? 'Mixed mandates' : UNCLASSIFIED;
}

export function homeAssets(values: HomeValue[]) {
  const total = values.length ? values.reduce((s, p) => s + p.value, 0) : null;
  const groups = new Map<string, HomeValue[]>();
  for (const row of values) groups.set(row.key, [...(groups.get(row.key) ?? []), row]);
  const assets: HomeAsset[] = [...groups].map(([key, rows]) => {
    const value = rows.reduce((s, row) => s + row.value, 0);
    return { key, label: homeClassLabel(key), value, weight: total != null && total > 0 ? value / total * 100 : null, rows };
  }).filter(row => row.value !== 0).sort((a, b) => b.value - a.value);
  return { total, assets, chartable: total != null && total > 0 && assets.every(row => row.value >= 0),
    positiveAssets: values.length ? values.reduce((s, row) => s + Math.max(0, row.value), 0) : null };
}

export function currentHomeValues(positions: Position[], accounts: Account[]): HomeValue[] {
  const idx = accountIndex(accounts);
  return dedupedPositions(positions).filter(p => p.marketValue !== 0).map(p => ({
    key: groupKeyFor('assetClass', idx, p), label: p.security, value: p.marketValue,
    date: p.navDate ?? idx.get(p.accountId)?.asOf ?? null, accountId: p.accountId, securityKey: p.securityKey,
  }));
}

export function historicalHomeValues(units: readonly NavUnit[], positions: readonly Position[], accounts: Account[], date: string) {
  const idx = accountIndex(accounts);
  return units.flatMap(unit => {
    const value = unitValueAt(unit, date);
    if (value == null) return [];
    const a = idx.get(unit.accountId);
    const p = unit.securityKey ? positions.find(p => p.accountId === unit.accountId && p.securityKey === unit.securityKey) : null;
    return [{ key: homeUnitClass(unit, positions, accounts), value, accountId: unit.accountId, securityKey: unit.securityKey,
      label: p?.security ?? `${a?.provider ?? unit.accountId} · ${a?.accountNo ?? ''}`,
      date: unit.marks.filter(m => m.date <= date).at(-1)?.date ?? unit.origin }];
  });
}

/** Outward cash is positive; manager-internal stock trades are absent from NavUnit flows. */
export function homeRecordedFlows(units: readonly NavUnit[], positions: readonly Position[], accounts: Account[], from: string, to: string) {
  const groups = new Map<string, { key: string; value: number; count: number }>();
  for (const unit of units) {
    const flows = unit.flows.filter(f => f.date > from && f.date <= to);
    if (!flows.length) continue;
    const key = homeUnitClass(unit, positions, accounts), previous = groups.get(key) ?? { key, value: 0, count: 0 };
    groups.set(key, { key, value: previous.value - flows.reduce((s, f) => s + f.amount, 0), count: previous.count + flows.length });
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function homeHistoryDates(units: readonly NavUnit[], from: string, to: string): string[] {
  const dates = new Set([from, to]);
  // Monthly closes plus boundaries; a step chart carries the last recorded mark, never interpolates it.
  const start = new Date(`${from}T00:00:00Z`);
  for (let month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); month.toISOString().slice(0, 10) <= to; month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))) {
    const date = new Date(month.getTime() - 86400000).toISOString().slice(0, 10);
    if (date > from && date < to) dates.add(date);
  }
  return [...dates].sort();
}

/** Daily sample volatility; sparse histories never masquerade as daily observations. */
export function homeVolatility(history: { t: string[]; v: number[] }, from: string, to: string) {
  const points = history.t.map((date, i) => ({ date, value: history.v[i] })).filter(p => p.date >= from && p.date <= to && Number.isFinite(p.value) && p.value > 0);
  if (points.length < 21 || Date.parse(points[0].date) - Date.parse(from) > 7 * 86400000 || Date.parse(to) - Date.parse(points.at(-1)!.date) > 7 * 86400000) return null;
  if (points.some((p, i) => i > 0 && Date.parse(p.date) - Date.parse(points[i - 1].date) > 7 * 86400000)) return null;
  const returns = points.slice(1).map((p, i) => (p.value / points[i].value - 1) * 100);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const pct = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1));
  return { pct, observations: returns.length, from: points[0].date, to: points.at(-1)!.date };
}
