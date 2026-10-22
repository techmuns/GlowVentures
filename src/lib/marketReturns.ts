import type { Position } from './types';
import type { ReturnType } from './periodReturns';
import { fmtDate } from './format';
export type MarketHistory = { ok: true; symbol: string; isin: string | null; name: string; source: string; basis: 'adjusted-close' | 'nav'; first: string; last: string; t: string[]; v: number[] };
export type MarketResult = MarketHistory | { ok: false; reason: string };
export type MarketInstrument = { key: string; query: string };
export type MarketUnit = { position: Position; periodPct: number; from: string; to: string; history: MarketHistory };
export type MarketGap = { position: Position; reason: string; needed: string; detail?: string };
export const marketHoldingKey = (p: Pick<Position, 'accountId' | 'securityKey'>) => `${p.accountId}|${p.securityKey}`;
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
/** Never substitute a price after the selected date or a stale previous month. */
function closeBefore(h: MarketHistory, date: string) {
  for (let i = h.t.length - 1; i >= 0; i--) if (h.t[i] <= date && Number.isFinite(h.v[i]) && h.v[i] > 0) {
    return day(date) - day(h.t[i]) <= 7 * 864e5 ? { date: h.t[i], value: h.v[i] } : null;
  }
  return null;
}
export function marketReturnSummary(units: readonly MarketUnit[], type: ReturnType, start: string | null, end: string | null) {
  const value = units.reduce((s, u) => s + u.position.marketValue, 0);
  const days = start && end ? (day(end) - day(start)) / 864e5 : 0;
  const periodPct = value > 0 ? units.reduce((s, u) => s + u.position.marketValue * u.periodPct, 0) / value : null;
  // Weight the period growth first, then annualise the portfolio's growth.
  const annual = type !== 'absolute' && days >= 365;
  const pct = periodPct == null ? null : annual ? (Math.pow(1 + periodPct / 100, 365 / days) - 1) * 100 : periodPct;
  return { pct, periodPct, value, count: units.length, annual, days, from: start, to: end };
}
/** Market performance of today's holdings; never a reconstruction of past ownership. */
export function marketReturns(positions: readonly Position[], instruments: ReadonlyMap<string, MarketInstrument>, histories: Readonly<Record<string, MarketResult | undefined>>,
  start: string | null, end: string | null, type: ReturnType, inception = false) {
  const historiesInUse = positions.flatMap(p => { const i = instruments.get(p.securityKey), h = i && histories[i.key]; return h?.ok ? [h] : []; });
  const from = inception ? historiesInUse.map(h => h.first).sort().at(-1) ?? null : start;
  const units: MarketUnit[] = [], gaps: MarketGap[] = []; let pending = 0;
  const candidates: { position: Position; history: MarketHistory; prices: Map<string, number> }[] = [];
  const priceMaps = new Map<MarketHistory, Map<string, number>>();
  const gap = (position: Position, reason: string, needed: string, detail?: string) => gaps.push({ position, reason, needed, detail });
  for (const p of positions) {
    if (!(p.marketValue > 0)) continue;
    const instrument = instruments.get(p.securityKey);
    if (!instrument) { gap(p, 'Public price history is missing.', 'Public prices for the selected dates. For returns from your statements, check Recorded return.'); continue; }
    const h = histories[instrument.key];
    if (!h) { pending++; continue; }
    if (!h.ok) {
      const mismatch = /match|symbol|code|ISIN|listing/i.test(h.reason);
      const adjusted = /dividend|split.adjusted/i.test(h.reason);
      gap(p, adjusted ? 'Prices adjusted for dividends and share splits are missing.' : mismatch ? 'The price history could not be matched to this investment.' : 'Price history could not be loaded.',
        adjusted ? 'We need a price history that includes dividends and share splits.' : mismatch ? 'Confirm the stock symbol, or the fund code and ISIN (investment ID).' : 'Click “Retry missing histories” to try again.', h.reason);
      continue;
    }
    if (!from || !end || !(day(end) > day(from))) { gap(p, 'The selected dates are invalid.', 'Choose a start date before the end date.'); continue; }
    if (!closeBefore(h, from)) { gap(p, `A price near ${fmtDate(from)} is missing.`, `Choose a later start date. Available history starts ${fmtDate(h.first)}.`); continue; }
    if (!closeBefore(h, end)) { gap(p, `A price near ${fmtDate(end)} is missing.`, `Choose an earlier end date, or retry later. The latest price is from ${fmtDate(h.last)}.`); continue; }
    let prices = priceMaps.get(h);
    if (!prices) { prices = new Map(h.t.map((date, i) => [date, h.v[i]])); priceMaps.set(h, prices); }
    candidates.push({ position: p, history: h, prices });
  }
  // One pair of actual trading dates for the whole basket, including funds
  // whose daily NAV is published later than an exchange's closing price.
  const dates = (date: string | null, forward = false) => {
    if (!date) return [];
    const result: string[] = [];
    for (let i = 0; i <= 7; i++) {
      const d = new Date(day(date) + (forward ? i : -i) * 864e5).toISOString().slice(0, 10);
      result.push(d);
    }
    return result;
  };
  // Maximise covered value on a shared pair of dates. One illiquid listing
  // must not erase every other return when its trading dates do not overlap.
  let measuredFrom: string | null = null, measuredTo: string | null = null, bestValue = 0;
  for (const to of dates(end)) for (const opening of dates(from, inception)) {
    if (opening >= to) continue;
    const value = candidates.reduce((sum, c) => sum + ((c.prices.get(opening) ?? 0) > 0 && (c.prices.get(to) ?? 0) > 0 ? c.position.marketValue : 0), 0);
    if (value > bestValue) { bestValue = value; measuredFrom = opening; measuredTo = to; }
  }
  for (const c of candidates) {
    if (!measuredFrom || !measuredTo || !(c.prices.get(measuredFrom)! > 0) || !(c.prices.get(measuredTo)! > 0)) { gap(c.position, 'A price is missing on the dates used for this calculation.', 'We need prices on the same dates as the other holdings. Retry later or change the period.'); continue; }
    units.push({ position: c.position, periodPct: (c.prices.get(measuredTo)! / c.prices.get(measuredFrom)! - 1) * 100,
      from: measuredFrom, to: measuredTo, history: c.history });
  }
  return { units, gaps, pending, ...marketReturnSummary(units, type, measuredFrom, measuredTo), totalValue: positions.reduce((s, p) => s + p.marketValue, 0) };
}
