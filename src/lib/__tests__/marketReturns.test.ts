import assert from 'node:assert/strict';
import { marketReturns, marketReturnSummary, type MarketHistory, type MarketInstrument } from '../marketReturns';
import type { Position } from '../types';
const p = (key: string, value: number) => ({ accountId: key, securityKey: key, security: key, marketValue: value } as Position);
const history = (symbol: string, v: number[], t = ['2024-10-21', '2025-10-21', '2026-10-21']): MarketHistory => ({ ok: true, symbol, isin: null, source: 'Yahoo Finance', name: symbol, basis: 'adjusted-close', first: t[0], last: t.at(-1)!, t, v });
const ps = [p('big', 900), p('small', 100), p('private', 500)];
const instruments = new Map<string, MarketInstrument>(['big', 'small'].map(key => [key, { key, query: key }]));
const histories = { big: history('BIG.NS', [100, 110, 120]), small: history('SMALL.NS', [100, 95, 90]) };
const run = (start = '2024-10-21', end = '2026-10-21', type: 'absolute' | 'xirr' | 'cagr' = 'absolute') => marketReturns(ps, instruments, histories, start, end, type);
const near = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a-b) < 1e-8, `${a} != ${b}`);
const full = run(); near(full.pct, 17); assert.equal(full.value, 1000); assert.equal(full.totalValue, 1500); assert.equal(full.count, 2); assert.equal(full.gaps[0].position.securityKey, 'private');
assert.equal(full.pending, 0); assert.equal(full.annual, false);
for (const type of ['xirr', 'cagr'] as const) { const m = run(undefined, undefined, type); near(m.pct, (Math.sqrt(1.17)-1)*100); assert.equal(m.annual, true); }
// Smaller periods use their actual endpoints; a missing nearby price is never substituted.
const one = run('2025-10-21'); assert.notEqual(one.pct, full.pct);
for (const type of ['xirr', 'cagr'] as const) { const m = run('2026-10-01', '2026-10-21', type); assert.equal(m.pct, null); assert.equal(m.annual, false); }
const weekend = run('2024-10-22', '2026-10-22'); near(weekend.pct, 17); assert.equal(weekend.from, '2024-10-21'); assert.equal(weekend.to, '2026-10-21');
assert.equal(run('2024-10-30').pct, null, 'stale prices are not silently reused');
assert.equal(run('2024-10-20').pct, null, 'future price cannot be used as opening');
assert.equal(run('2026-10-22', '2024-10-21').pct, null);
const partial = marketReturns(ps, instruments, { ...histories, small: { ok: false, reason: 'No history' } }, '2024-10-21', '2026-10-21', 'absolute');
near(partial.pct, 20); assert.equal(partial.count, 1); assert.equal(partial.gaps.length, 2); assert.equal(partial.gaps[0].position.accountId, 'small');
const loading = marketReturns(ps, instruments, {}, '2024-10-21', '2026-10-21', 'absolute'); assert.equal(loading.pending, 2); assert.equal(loading.pct, null);
const inception = marketReturns(ps, instruments, histories, null, '2026-10-21', 'absolute', true); near(inception.pct, 17); assert.equal(inception.from, '2024-10-21');
// A NAV published later than the stock close forces one honest shared closing date.
const mixed = marketReturns(ps, instruments, { ...histories, small: history('NAV', [100, 95], ['2024-10-21', '2026-10-20']), big: history('BIG', [100, 110, 120], ['2024-10-21', '2026-10-20', '2026-10-21']) }, '2024-10-21', '2026-10-22', 'absolute');
assert.equal(mixed.to, '2026-10-20'); near(mixed.pct, 8.5);
const disjoint = marketReturns(ps, instruments, { big: history('BIG', [100,120], ['2024-10-21','2026-10-21']), small: history('SMALL', [100,90], ['2024-10-20','2026-10-20']) }, '2024-10-21','2026-10-22','absolute');
near(disjoint.pct, 20); assert.equal(disjoint.count,1); assert.equal(disjoint.gaps.length,2, 'an illiquid holding cannot erase covered returns');
// Regrouping changes neither the shared dates nor the combined capital weight.
const big = marketReturnSummary(full.units.slice(0, 1), 'absolute', full.from, full.to);
const small = marketReturnSummary(full.units.slice(1), 'absolute', full.from, full.to);
near((big.pct! * big.value + small.pct! * small.value) / full.value, full.pct!);
assert.equal(marketReturnSummary([], 'absolute', null, null).pct, null);
// Stage 10hk: under a year every measure is the period's own return — XIRR and
// CAGR from a year only; debt alone is annualised under a year.
const halfT = ['2026-03-31', '2026-09-30'], half = { big: history('BIG', [100, 110], halfT), small: history('SMALL', [100, 110], halfT) };
for (const type of ['absolute', 'xirr', 'cagr'] as const) {
  const m = marketReturns(ps, instruments, half, '2026-03-31', '2026-09-30', type);
  near(m.pct, 10); assert.equal(m.annual, false, `${type} under a year`); near(m.periodPct, 10);
}
const halfDebt = marketReturnSummary(marketReturns(ps, instruments, half, '2026-03-31', '2026-09-30', 'xirr').units
  .map((u) => ({ ...u, position: { ...u.position, assetClass: 'Bond' as const } })), 'xirr', '2026-03-31', '2026-09-30');
near(halfDebt.pct, (1.1 ** (365 / 183) - 1) * 100); assert.equal(halfDebt.annual, true);
console.log('Market returns: current value weights, period changes, annualisation, shared dates, gaps and no future-price substitution passed.');
