import assert from 'node:assert/strict';
import { BOOK_POSITIONS } from '../../data/glowData';
import { closeLegsOn, indexCompound, indexMove, indexOnSameMoney, indexOverPeriod, onePaymentLeg, pooledLegs, positionBenchmark, printedBenchmark, rowBenchmark } from '../holdingBenchmark';
import type { Position } from '../types';
import { returnGapLabel } from '../returnColumns';
import { holdingPeriodStart } from '../investedOn';

const near = (a: number | null | undefined, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-6, `${a} != ${b}`);
// An index at 100 until 30 Jun, 110 after, 121 from 30 Sep.
const level = (d: string) => (d < '2025-01-01' ? null : d < '2026-06-30' ? 100 : d < '2026-09-30' ? 110 : 121);
const pos = (o: Partial<Position>) => ({ accountId: 'x', securityKey: 'k', security: 'k', marketValue: 1, ...o }) as Position;

// ── WHICH INDEX ─────────────────────────────────────────────────────────────
// A share by AMFI's rank: Reliance (1st) large, Biocon (173rd) mid, Cyient small.
assert.equal(positionBenchmark(pos({ assetClass: 'Equity', marketSide: 'listed', isin: 'INE002A01018' })).bench?.key, 'nifty-50');
assert.equal(positionBenchmark(pos({ assetClass: 'Equity', marketSide: 'listed', symbol: 'BIOCON' })).bench?.key, 'nifty-midcap-150');
assert.equal(positionBenchmark(pos({ assetClass: 'Equity', marketSide: 'listed', isin: 'INE136B01020' })).bench?.key, 'nifty-smallcap-250');
assert.match(positionBenchmark(pos({ assetClass: 'Equity', marketSide: 'listed', isin: 'INE002A01018' })).why, /ranked 1st/);
// A main-board listing after the list (NSE's own shares) is not guessed small:
// the broad market until a market value ranks it against the list's floors.
assert.equal(positionBenchmark(pos({ assetClass: 'Equity', marketSide: 'listed', isin: 'INE721I01024' })).bench?.key, 'nifty-500');
assert.equal(positionBenchmark(pos({ assetClass: 'Equity', marketSide: 'listed', isin: 'INE721I01024', marketCap: 4.4e12 })).bench?.key, 'nifty-50');
// An SME-platform share is small by the platform's rule.
assert.equal(positionBenchmark(pos({ assetClass: 'Equity', marketSide: 'listed', isin: 'INE0ZOL01023' })).bench?.key, 'nifty-smallcap-250');
// A fund by its category; cash, arbitrage, hybrid and debt have no index here, and say why.
const fund = (security: string, marketSide: Position['marketSide'] = 'listed') => positionBenchmark(pos({ assetClass: 'Mutual Fund', marketSide, security }));
assert.equal(fund('HDFC Small Cap Fund - Direct Growth Plan').bench?.key, 'nifty-smallcap-250');
assert.equal(fund('Kotak Mid Cap Fund Direct Growth').bench?.key, 'nifty-midcap-150');
assert.equal(fund('Bandhan Large & Mid Cap Fund-Direct Plan-Growth').bench?.key, 'nifty-500');
assert.equal(fund('ICICI Prudential Nifty Next 50 Index Fund').bench?.key, 'nifty-next-50');
assert.equal(fund('Helios Flexi Cap Fund - Direct Growth').bench?.key, 'nifty-500');
for (const none of ['HDFC Liquid Fund-Direct Plan-Growth Option', 'NIP ETNF1D RTLIQBEES', 'ICICI Prudential Arbitrage Fund', 'HDFC Balanced Advantage Fund', 'Franklin India Credit AIF']) {
  const b = fund(none);
  assert.equal(b.bench, null, none);
  assert.ok(b.why.length > 20, none);
}
assert.equal(positionBenchmark(pos({ assetClass: 'AIF', marketSide: 'private', security: 'India SME Investments Fund II' })).bench?.key, 'nifty-smallcap-250');
assert.equal(positionBenchmark(pos({ assetClass: 'AIF', marketSide: 'private', security: 'Baring Private Equity India Fund 6' })).bench?.key, 'nifty-500');
assert.equal(positionBenchmark(pos({ assetClass: 'Unlisted', marketSide: 'private', security: 'National Stock Exchange of India' })).bench?.key, 'nifty-500');
assert.equal(positionBenchmark(pos({ assetClass: 'Cash', security: 'Cash' })).bench, null);
// A mandate by its manager's own report, in the report's order.
assert.equal(printedBenchmark('svan-investment-managers-llp-8710067')?.key, 'bse-500');
assert.equal(printedBenchmark('goldstandard-wealth-private-limited-100023')?.key, 'nifty-50');
assert.equal(rowBenchmark([], ['svan-investment-managers-llp-8710067']).bench?.key, 'bse-500');
assert.equal(rowBenchmark([], ['no-such-account']).bench?.key, 'nifty-500');
// The SOURCE of each benchmark choice (task 370): a mandate's printed benchmark
// is "from the document"; every rule-assigned one (size class, category,
// fallback) is a best guess to confirm with Yamini.
{
  const share = positionBenchmark(pos({ assetClass: 'Equity', marketSide: 'listed', isin: 'INE002A01018' }));
  assert.equal(share.bench && share.source, 'rule');
  const idx = fund('ICICI Prudential Nifty Next 50 Index Fund');
  assert.equal(idx.bench && idx.source, 'rule');
  const mandate = rowBenchmark([], ['svan-investment-managers-llp-8710067']);
  assert.equal(mandate.bench && mandate.source, 'document');
  const fallback = rowBenchmark([], ['no-such-account']);
  assert.equal(fallback.bench && fallback.source, 'rule');
}
// Every line in the book is classified — an index, or a stated reason for none.
for (const p of BOOK_POSITIONS) {
  const b = positionBenchmark(p as Position);
  assert.ok(b.why.length > 10, `${p.security}: no reason`);
}

// ── ON THE SAME MONEY ───────────────────────────────────────────────────────
// Two tranches: 100 in on 31 Mar at 100 and 100 in on 31 Jul at 110; 55 out on
// 31 Aug at 110; the rest valued on 30 Sep at 121.
const legs = [{ flows: [{ date: '2026-03-31', amount: -100 }, { date: '2026-07-31', amount: -100 }, { date: '2026-08-31', amount: 55 }], close: { date: '2026-09-30', value: 999 } }];
// Index units 1 + 100/110 − 55/110 = 1.40909…, worth ×121 = 170.5; gain 170.5 + 55 − 200 = 25.5 over 200 paid in.
const hpr = indexOnSameMoney(legs, level, false);
assert.ok(hpr.shown);
near(hpr.shown ? hpr.pct : null, 25.5 / 200 * 100);
assert.equal(hpr.shown && hpr.from, '2026-03-31');
assert.equal(hpr.shown && hpr.to, '2026-09-30');
// The money-weighted rate solves the same flows with the index's terminal.
const xirr = indexOnSameMoney(legs, level, true);
assert.ok(xirr.shown && xirr.annual && xirr.pct > 0);
// One payment: the money-weighted rate is the compound rate over the same days.
const one = indexOnSameMoney([{ flows: [{ date: '2025-09-30', amount: -100 }], close: { date: '2026-09-30', value: 1 } }], level, true);
const cagr = indexCompound('2025-09-30', '2026-09-30', level);
assert.ok(one.shown && cagr.shown);
assert.ok(Math.abs((one.shown ? one.pct : 0) - (cagr.shown ? cagr.pct : 1)) < 1e-4);
near(cagr.shown ? cagr.pct : null, 21);
// A window's move; and no close before the first payment is absent, with its date.
near((indexMove('2026-01-01', '2026-09-30', level) as { pct: number }).pct, 21);
const early = indexOnSameMoney([{ flows: [{ date: '2024-05-01', amount: -100 }], close: { date: '2026-09-30', value: 1 } }], level, false);
assert.ok(!early.shown && /1 May 2024/.test(early.reason));
assert.ok(!indexOnSameMoney([], level, false).shown);

// ── STAGE 10lc: NEVER A BARE DASH, AND TOTALS ON THE SAME MONEY ─────────────
// One payment never sold buys the index on its day: its HPR is the index's move.
const single = indexOnSameMoney([onePaymentLeg('2026-03-31', 100, '2026-09-30', 130)], level, false);
near(single.shown ? single.pct : null, 21);
near(single.shown ? single.pct : null, (indexMove('2026-03-31', '2026-09-30', level) as { pct: number }).pct);
// A held line closes on the later of its record's close and its value date — never earlier.
assert.equal(closeLegsOn([{ flows: [], close: { date: '2026-06-30', value: 1 } }], '2026-09-30')[0].close?.date, '2026-09-30');
assert.equal(closeLegsOn([{ flows: [], close: { date: '2026-09-30', value: 1 } }], '2026-06-30')[0].close?.date, '2026-09-30');
// A total pools every row's legs, each on its own close; one undated row refuses it and is counted.
const a = onePaymentLeg('2026-03-31', 100, '2026-06-30', 1), b = onePaymentLeg('2026-03-31', 100, '2026-09-30', 1);
const pooled = pooledLegs([[a], [b]]);
assert.ok('legs' in pooled);
// 100 at 100 → 110 on 30 Jun, and 100 at 100 → 121 on 30 Sep: 31 over 200.
const total = indexOnSameMoney('legs' in pooled ? pooled.legs : [], level, false);
near(total.shown ? total.pct : null, 31 / 200 * 100);
assert.deepEqual(pooledLegs([[a], null, []]), { undated: 2, of: 3 });
// PURCHASES NOT EACH DATED (Stage 10nt): the index over the holding period, point to point.
const per = indexOverPeriod('2025-12-26', '2026-09-30', level, false, 'the inception of the account that holds it');
assert.ok(per.shown && per.period);
near(per.shown ? per.pct : null, 21);
assert.match(per.shown ? per.how : '', /holding period, 26 Dec 2025 \(the inception of the account that holds it\) to 30 Sept? 2026/);
const perAnnual = indexOverPeriod('2025-09-30', '2026-09-30', level, true, 'x');
near(perAnnual.shown ? perAnnual.pct : null, (cagr as { pct: number }).pct);
assert.equal(indexOverPeriod('2024-05-01', '2026-09-30', level, false, 'x').shown, false);
// The start: a line's first investment, else its account's inception.
const pmsLine = (BOOK_POSITIONS as unknown as Position[]).find((p) => (p.tradeRecord?.unaccounted ?? 0) > 0 && p.accountId.startsWith('goldstandard-wealth-private-limited-100022'));
assert.ok(pmsLine, 'a Goldstandard 100022 line with units before its dated trades');
assert.deepEqual(holdingPeriodStart([pmsLine!])?.date, '2025-12-26');
assert.equal(holdingPeriodStart([]), null);
assert.equal(returnGapLabel("2 of the 2 investments behind this row carry no dated record a money-weighted return can be solved over — x: the family's review dates this investment only as a span — Dec 2022 – Aug 2023 — with one cost for the whole of it, not the amount paid on each day, so there are no dated payments to solve a money-weighted return over"), 'Date range only');

console.log('holding benchmark: ok');
