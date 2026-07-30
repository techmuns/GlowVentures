// Shared aggregation math over positions & funds. Values are INR.
//
// The rollups that used to key off a free-text account label now take the
// account registry, because "which entity owns this" and "which platform holds
// this" are two different questions the account string cannot answer on its own.
import type { Account, FundInvestment, Position, StartupInvestment } from "./types";
import { accountIndex, custodyLabelOf, ownerOf } from "./accounts";

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * DUPLICATE POLICY — carry both, count once.
 *
 * PENDING CONFIRMATION FROM THE PROVIDER. Reversible policy, not a fact, and it
 * lives here alone on the app side (its twin is in scripts/ingest/reconcile.mjs)
 * so it can be changed in one place.
 *
 * The same position can be reported on two family members' statements — the
 * 360 ONE Special Opportunities Fund Series 8 Class A3 appears with identical
 * figures under both CRNs. Neither row is suppressed: an ACCOUNT or per-owner
 * view shows each statement exactly as printed. But a CONSOLIDATED family total
 * must count the holding once, or the book overstates itself.
 *
 * Use this — not a raw `sum(positions.map(p => p.marketValue))` — anywhere a
 * figure spans more than one owner.
 */
export function dedupedPositions(positions: Position[]): Position[] {
  const seen = new Set<string>();
  const out: Position[] = [];
  for (const p of positions) {
    if (p.dedupeGroup) {
      if (seen.has(p.dedupeGroup)) continue;
      seen.add(p.dedupeGroup);
    }
    out.push(p);
  }
  return out;
}

/** Consolidated market value, each dedupeGroup counted once. */
export const consolidatedMarketValue = (positions: Position[]) =>
  sum(dedupedPositions(positions).map((p) => p.marketValue));

/**
 * What the naive sum would have overstated by. Surfaced in the UI rather than
 * quietly absorbed, so the reader can see a duplicate was collapsed.
 */
export const doubleCountedValue = (positions: Position[]) =>
  sum(positions.map((p) => p.marketValue)) - consolidatedMarketValue(positions);

export type Bucket = { key: string; mv: number; cost: number; pnl: number; count: number; returnPct: number; weight: number };

export function bucketBy(positions: Position[], keyFn: (p: Position) => string): Bucket[] {
  const m = new Map<string, { mv: number; cost: number; pnl: number; count: number }>();
  for (const p of positions) {
    const k = keyFn(p);
    const c = m.get(k) ?? { mv: 0, cost: 0, pnl: 0, count: 0 };
    c.mv += p.marketValue; c.cost += p.costBasis; c.pnl += p.unrealizedPnL; c.count += 1;
    m.set(k, c);
  }
  const total = [...m.values()].reduce((s, v) => s + v.mv, 0);
  return [...m.entries()]
    .map(([key, v]) => ({ key, ...v, returnPct: v.cost > 0 ? (v.pnl / v.cost) * 100 : 0, weight: total > 0 ? v.mv / total : 0 }))
    .sort((a, b) => b.mv - a.mv);
}

/** By owning entity — resolved through the account registry, never from the account string. */
export const byEntity = (p: Position[], accounts: Account[]) => {
  const idx = accountIndex(accounts);
  return bucketBy(p, (x) => ownerOf(idx, x));
};

/** By custodian / manager — the provider on the account, or "Direct / In-house". */
export const byCustodian = (p: Position[], accounts: Account[]) => {
  const idx = accountIndex(accounts);
  return bucketBy(p, (x) => custodyLabelOf(idx, x));
};

export const bySector = (p: Position[]) => bucketBy(p, (x) => x.sector);
export const byAssetClass = (p: Position[]) => bucketBy(p, (x) => x.assetClass);

/** By security — the book's join key, so names with no ISIN consolidate correctly. */
export const bySecurity = (p: Position[]) => bucketBy(p, (x) => x.securityKey);

// Concentration: top-N positions by weight.
export function topByValue(p: Position[], n: number): Position[] {
  return [...p].sort((a, b) => b.marketValue - a.marketValue).slice(0, n);
}

// Indian financial year (1 Apr – 31 Mar).
export function fyStartYear(d: Date): number {
  const y = d.getFullYear();
  return d.getMonth() >= 3 ? y : y - 1;
}
export function fyLabel(startYear: number): string {
  return `FY${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// Fund rollups (Pre-IPO / PE / Debt).
export function fundTotals(funds: FundInvestment[]) {
  const committed = sum(funds.map((f) => f.committed));
  const drawn = sum(funds.map((f) => f.drawn));
  const distributed = sum(funds.map((f) => f.distributed));
  const currentValue = sum(funds.map((f) => f.currentValue));
  return {
    committed, drawn, distributed, currentValue,
    unfunded: Math.max(committed - drawn, 0),
    tvpi: drawn > 0 ? (distributed + currentValue) / drawn : null,
    dpi: drawn > 0 ? distributed / drawn : null,
  };
}

export function startupTotals(s: StartupInvestment[]) {
  const invested = sum(s.map((x) => x.invested));
  const fairValue = sum(s.map((x) => x.fairValue));
  return { invested, fairValue, moic: invested > 0 ? fairValue / invested : null, count: s.length };
}
