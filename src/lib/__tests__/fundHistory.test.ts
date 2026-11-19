import assert from 'node:assert/strict';
import { fundFlowTimeline, fundValuations, fundHistoryModel, periodFundXirr, fullWindow } from '../fundHistory';
import type { FundDated, FundFlow, FundPart } from '../fundReturns';

const call = (date: string, amount: number, accountId = 'A'): FundFlow => ({ date, amount, kind: 'call', accountId, label: null });
const dist = (date: string, amount: number, kind: FundFlow['kind'] = 'capital', accountId = 'A'): FundFlow => ({ date, amount, kind, accountId, label: null });
const part = (valuedAt: string, value: number, cost: number | null = null, accountId = 'A'): FundPart => ({ accountId, valuedAt, value, cost });

// A FundDated with every field defaulted, so a fixture states only what it tests.
const fd = (o: Partial<FundDated>): FundDated => ({
  securityKey: 'fund', source: 'statement', parts: [], calls: [], paidBack: [], afterValuation: [],
  payouts: 'unknown', paidOut: 0, paidOutByKind: { income: 0, capital: 0, equalisation: 0 },
  firstCall: null, lastCall: null, valuedAt: null, tranches: 0, redeemedAtCost: 0, saleProceeds: 0,
  incomeInHpr: 0, incomeFrom: null, reviewFifo: false, unitNote: null, gap: null, ...o,
});

// ── The capital-flow timeline: oldest first, with running paid-in / distributed ──
const t = fundFlowTimeline(fd({
  calls: [call('2024-06-01', 1_00_00_000), call('2025-01-10', 50_00_000)],
  paidBack: [dist('2024-12-01', 10_00_000, 'income')],
  valuedAt: '2026-06-30', parts: [part('2026-06-30', 1_80_00_000, 1_50_00_000)],
}));
assert.deepEqual(t.map((e) => e.date), ['2024-06-01', '2024-12-01', '2025-01-10'], 'events oldest first');
assert.equal(t[0].paidIn, 1_00_00_000); assert.equal(t[0].distributed, 0);
assert.equal(t[1].distributed, 10_00_000, 'a distribution advances the distributed running total');
assert.equal(t[2].paidIn, 1_50_00_000, 'running paid-in sums both calls');
assert.equal(t[2].direction, 'in');

// A call and a distribution on the SAME day: the call reads first, so the totals follow the money.
assert.deepEqual(fundFlowTimeline(fd({ calls: [call('2025-01-01', 100)], paidBack: [dist('2025-01-01', 10)] })).map((e) => e.direction), ['in', 'out']);
// No record at all is an empty timeline, not a fabricated zero row.
assert.deepEqual(fundFlowTimeline(null), []);

// ── The model: ILPA multiples where paid-in is positive, one valuation is NOT a trajectory ──
const vModel = fundHistoryModel(fd({
  calls: [call('2024-06-01', 1_00_00_000)], paidBack: [dist('2025-01-01', 20_00_000)], payouts: 'measured',
  valuedAt: '2026-06-30', parts: [part('2026-06-30', 1_30_00_000)],
}), 'fund');
assert.equal(vModel.valuations.length, 1);
assert.equal(vModel.hasTrajectory, false, 'one dated valuation cannot be a trajectory');
assert.equal(vModel.paidIn, 1_00_00_000); assert.equal(vModel.distributed, 20_00_000);
assert.equal(vModel.distributionsKnown, true);
assert.ok(vModel.dpi != null && Math.abs(vModel.dpi - 0.2) < 1e-9, 'DPI = distributions ÷ paid-in');
assert.ok(vModel.rvpi != null && Math.abs(vModel.rvpi - 1.3) < 1e-9, 'RVPI = value ÷ paid-in');
assert.ok(vModel.tvpi != null && Math.abs(vModel.tvpi - 1.5) < 1e-9, 'TVPI = DPI + RVPI');
assert.match(vModel.trajectoryNeeds, /2026-06-30/, 'the absent-state names the one valuation on record');
// A fund with no paid-in has no multiples — null, never a divide-by-zero zero.
assert.equal(fundHistoryModel(fd({}), 'x').dpi, null);

// A measured NIL — distributions on record and none paid — is DPI 0.00×, not absent.
const nilModel = fundHistoryModel(fd({ calls: [call('2024-06-01', 1_00_00_000)], payouts: 'nil', valuedAt: '2026-06-30', parts: [part('2026-06-30', 1_50_00_000)] }), 'nil');
assert.equal(nilModel.distributionsKnown, true);
assert.equal(nilModel.distributed, 0);
assert.ok(nilModel.dpi === 0, 'a measured nil distribution is DPI 0, a real zero');
// UNKNOWN distributions — no payout record — makes the distributed total and DPI absent, never a zero.
const unkModel = fundHistoryModel(fd({ calls: [call('2024-06-01', 1_00_00_000)], payouts: 'unknown', valuedAt: '2026-06-30', parts: [part('2026-06-30', 1_50_00_000)] }), 'unk');
assert.equal(unkModel.distributionsKnown, false);
assert.equal(unkModel.dpi, null, 'DPI is absent, not zero, when distributions are not on record');
assert.equal(unkModel.tvpi, null, 'TVPI is absent when DPI is');
assert.ok(unkModel.rvpi != null, 'RVPI (value ÷ paid-in) is still known');

// ── Period IRR: computed only where the window's ends both have a valuation ──
const f1 = fd({ calls: [call('2024-06-01', 1_00_00_000), call('2025-01-01', 50_00_000)], valuedAt: '2026-06-30', parts: [part('2026-06-30', 2_00_00_000)], firstCall: '2024-06-01' });
const full = fullWindow(f1);
assert.ok(full && full.from === '2024-06-01' && full.to === '2026-06-30');
const okr = periodFundXirr(f1, full!.from, full!.to);
assert.ok(okr.ok === true && typeof okr.pct === 'number', 'the full inception→latest window computes (inception call not dropped at the boundary)');
assert.ok(okr.ok && okr.annualised === true, 'a multi-year window is annualised');

// A start after money was already in needs an opening NAV the book does not have → honest absent.
const narrowed = periodFundXirr(f1, '2025-06-01', '2026-06-30');
assert.ok(narrowed.ok === false && /value on its start date 2025-06-01/.test(narrowed.reason), narrowed.ok ? 'should be absent' : narrowed.reason);

// An end on a date the fund was never valued needs a closing NAV → honest absent, naming the one date on record.
const noClose = periodFundXirr(f1, '2024-06-01', '2025-12-31');
assert.ok(noClose.ok === false && /value on 2025-12-31/.test(noClose.reason) && /2026-06-30/.test(noClose.reason));

// from ≥ to is refused.
assert.equal(periodFundXirr(f1, '2026-06-30', '2026-06-30').ok, false);
assert.equal(periodFundXirr(null, '2024-01-01', '2025-01-01').ok, false);

// ── It FILLS on its own when a second dated valuation lands ──
const f2 = fd({ calls: [call('2024-06-01', 1_00_00_000)], valuedAt: '2026-06-30',
  parts: [part('2025-06-30', 1_20_00_000), part('2026-06-30', 1_60_00_000)], firstCall: '2024-06-01' });
assert.equal(fundValuations(f2).length, 2);
assert.equal(fundHistoryModel(f2, 'f2').hasTrajectory, true, 'two dated valuations draw a trajectory');
const sub = periodFundXirr(f2, '2025-06-30', '2026-06-30');
assert.ok(sub.ok === true, 'a window between two recorded NAV dates computes once the NAVs exist');
assert.ok(sub.ok && sub.pct > 25 && sub.pct < 40, 'value 1.20 Cr → 1.60 Cr over a year is ~33%');

console.log('fund history: timeline order & running totals, ILPA multiples, honest period-IRR absents (opening/closing NAV), inception boundary, trajectory fills on a second NAV — OK');
