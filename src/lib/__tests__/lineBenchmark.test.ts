import assert from 'node:assert/strict';
import { lineBenchmark, unitBenchmark, type UnitLevels } from '../lineBenchmark';
import type { AccountWindow, ReturnType } from '../periodReturns';
import type { ReturnSelection, ReturnUnit, SelectedLine } from '../selectedSegmentReturns';
import type { Position } from '../types';

const near = (a: number | null | undefined, b: number, tol = 1e-6) => assert.ok(a != null && Math.abs(a - b) < tol, `${a} != ${b}`);
const pos = (o: Partial<Position>) => ({ accountId: 'x', securityKey: 'k', security: 'k', marketValue: 1, ...o }) as Position;

// Nifty 50 up 10% over the window, Smallcap 250 down 10%.
const levels: UnitLevels = (key) => key === 'nifty-50' ? { level: (d) => (d < '2026-03-31' ? null : d < '2026-11-01' ? 100 : 110) }
  : key === 'nifty-smallcap-250' ? { level: (d) => (d < '2026-03-31' ? null : d < '2026-11-01' ? 100 : 90) }
  : { reason: 'not used', pending: true };
const ctx = { isMandate: () => false, moves: [], tranches: {}, accounts: [] };

const win = (id: string, open: number, close: number): AccountWindow => ({ accountId: id, label: id, owner: 'O', openDate: '2026-03-31', openValue: open,
  openedInWindow: false, closeDate: '2026-11-10', closeValue: close, flows: [], capitalIn: 0, capitalOut: 0, gain: close - open });
const unit = (id: string, p: Position, open: number, close: number): ReturnUnit => ({ key: `${id}|${p.securityKey}`, accountId: id, label: id, positions: [p],
  gain: close - open, invested: open, close, from: '2026-03-31', to: '2026-11-10', window: win(id, open, close) });
const line = (units: ReturnUnit[], ret: number | null = 5): SelectedLine => ({ key: 'r', label: 'Row', positions: units.flatMap(u => u.positions), value: 0,
  units, missing: [], measured: null, gain: 0, invested: 0, returnPct: ret, periodPct: null, contribution: null, children: [] });
const sel = (type: ReturnType): ReturnSelection => ({ inception: false, type, start: '2026-03-31', end: '2026-11-10', windows: [], inceptionRows: [], excluded: [] });

// Reliance (AMFI rank 1) → Nifty 50; Cyient → Smallcap 250; a liquid fund has no index.
const large = pos({ assetClass: 'Equity', marketSide: 'listed', isin: 'INE002A01018', securityKey: 'reliance' });
const small = pos({ assetClass: 'Equity', marketSide: 'listed', isin: 'INE136B01020', securityKey: 'cyient' });
const liquid = pos({ assetClass: 'Mutual Fund', security: 'HDFC Liquid Fund', securityKey: 'hdfc-liquid' });
assert.equal(unitBenchmark(unit('a', large, 100, 120), () => false).bench?.key, 'nifty-50');

// ONE HOLDING: its own index on its own money — not its own move restated.
const one = lineBenchmark(line([unit('a', large, 100, 120)]), sel('absolute'), levels, ctx);
near(one.pct, 10); near(one.book, 20);
assert.deepEqual(one.uses.map(u => u.bench.key), ['nifty-50']);

// A MIXED ROW blends each holding's own index on its own money: 300 at +10%, 100 at −10% → +5%.
const mixed = lineBenchmark(line([unit('a', large, 300, 330), unit('b', small, 100, 95), unit('c', liquid, 50, 52)]), sel('absolute'), levels, ctx);
near(mixed.pct, 5);
assert.deepEqual(mixed.uses.map(u => u.bench.key), ['nifty-50', 'nifty-smallcap-250']);
// The cash fund is left out of BOTH sides and named: the book over the same 400 is (30 − 5) ÷ 400.
assert.equal(mixed.left.length, 1); assert.match(mixed.left[0].why, /cash fund/i);
near(mixed.book, 6.25); assert.equal(mixed.coveredInvested, 400); assert.equal(mixed.totalInvested, 450);

// Under a year an XIRR is shown as the absolute return, as the Return column does.
const x = lineBenchmark(line([unit('a', large, 100, 120)]), sel('xirr'), levels, ctx);
assert.equal(x.shownAs, 'absolute'); near(x.pct, 10);

// Closes still loading hold the whole cell rather than strike a partial blend.
const loading = lineBenchmark(line([unit('a', large, 100, 120)]), sel('absolute'), () => ({ reason: 'Fetching', pending: true }), ctx);
assert.equal(loading.pct, null); assert.equal(loading.pending, true);

// No measured return: nothing to buy the index with.
assert.equal(lineBenchmark(line([unit('a', large, 100, 120)], null), sel('absolute'), levels, ctx).pct, null);
// A row of cash alone says why, with no figure.
const cash = lineBenchmark(line([unit('c', liquid, 50, 52)]), sel('absolute'), levels, ctx);
assert.equal(cash.pct, null); assert.match(cash.reason ?? '', /cash fund/i);

console.log('lineBenchmark: ok');
