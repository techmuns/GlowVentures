import type { Account, Position } from './types';
import { accountIndex } from './accounts';
import { currentHoldings, dedupedPositions, sum } from './analytics';
import { groupKeyFor, groupLabelFor } from './groupAxis';
import { UNCLASSIFIED } from './familyTaxonomy';

/** The same consolidated value and family asset classes as Morning CIO. */
export function homeOverview(positions: Position[], accounts: Account[]) {
  const counted = dedupedPositions(positions), idx = accountIndex(accounts);
  const current = currentHoldings(counted);
  const openable = new Set(current.map(p => groupKeyFor('assetClass', idx, p)));
  const total = sum(counted.map(p => p.marketValue));
  const groups = new Map<string, number>();
  for (const p of counted) {
    const key = groupKeyFor('assetClass', idx, p);
    groups.set(key, (groups.get(key) ?? 0) + p.marketValue);
  }
  const allocation = [...groups].filter(([, value]) => value !== 0).map(([key, value]) => ({
    key, label: key === UNCLASSIFIED ? 'Unclassified' : groupLabelFor('assetClass')(key),
    value, weight: total > 0 ? value / total * 100 : null, canOpen: openable.has(key),
  })).sort((a, b) => b.value - a.value);
  return {
    total, allocation, chartable: total > 0 && allocation.every(row => row.value >= 0),
    holdings: current.length,
    accounts: new Set(counted.filter(p => p.marketValue !== 0).map(p => p.accountId)).size,
  };
}
