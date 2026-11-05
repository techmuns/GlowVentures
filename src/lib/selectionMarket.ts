/**
 * ── MARKET PERFORMANCE, OVER EVERY HOLDING (Stage 10lg) ─────────────────────
 *
 * It was a price-only figure on one shared pair of dates: holdings with no
 * public price (AIFs, PMS mandates, unpriced fund units) were left out, and
 * "since investment" opened on the youngest listing's first close (NSE, 24 Sep).
 * It now reads the period's own selection (`useReturnSelection`): each holding's
 * return over its own part of the period — a published close, a printed NAV or a
 * statement value, from its first value on record; held at its last value, 0% —
 * weighted by what it is worth today. A whole mandate's return is each of its
 * holdings'. It covers every holding the investment figure does, and names the
 * rest (private investments are reported apart).
 */
import type { Position } from './types';
import type { ReturnGap, ReturnUnit } from './selectedSegmentReturns';
import { marketHoldingKey, type MarketGap, type MarketUnit } from './marketReturns';
import { measureWindow } from './periodReturns';

/** A unit's own return over its own window, in per cent; null where nothing was invested. */
export function unitOwnReturn(u: ReturnUnit): number | null {
  if (u.held) return 0;
  if (u.window) {
    const m = measureWindow([{ ...u.window, carriedTo: undefined }], 'absolute', String);
    const p = m.working?.periodPct ?? (m.shown ? m.pct ?? null : null);
    if (p != null && Number.isFinite(p)) return p;
  }
  return u.invested > 0 ? (u.gain / u.invested) * 100 : null;
}

export function selectionMarket(current: readonly Position[], units: readonly ReturnUnit[], missing: readonly ReturnGap[], start: string | null, end: string | null,
  { inception = false }: { inception?: boolean } = {}) {
  const byKey = new Map<string, ReturnUnit>();
  for (const u of units) for (const p of u.positions) byKey.set(marketHoldingKey(p), u);
  const out: MarketUnit[] = [], gaps: MarketGap[] = [];
  let pending = 0;
  for (const p of current) {
    if (!(p.marketValue > 0)) { gaps.push({ position: p, reason: 'A positive current holding value is needed for its portfolio weight.', code: 'value' }); continue; }
    // A period reports private investments apart, as the cards do; Since investment covers them.
    if (!inception && p.marketSide === 'private') { gaps.push({ position: p, reason: 'A private investment: reported apart, at Private Market’s value.', code: 'unmatched' }); continue; }
    const u = byKey.get(marketHoldingKey(p));
    // An account's return that also carries private investments is not the public holdings' own.
    if (u && !inception && u.positions.some((x) => x.marketSide === 'private' && x.marketValue > 0)) {
      gaps.push({ position: p, reason: 'Its account’s return includes private investments, which a period reports apart; this holding’s own return is not on record.', code: 'unmatched' });
      continue;
    }
    const r = u ? unitOwnReturn(u) : null;
    if (u && r != null) {
      out.push({ position: p, periodPct: r, from: u.from ?? start ?? '', to: u.to ?? end ?? '', ...(u.held ? { held: true as const } : {}),
        source: u.held ? `held at its last value since ${u.held.date}` : u.assumption ? u.assumption.source : u.sinceFirst ? 'its first value on record' : 'the statement records' });
      continue;
    }
    // The holding's own gap first; its account's only where it has none.
    const g = missing.find((x) => x.accountId === p.accountId && x.securityKey === p.securityKey)
      ?? missing.find((x) => x.accountId === p.accountId && !x.securityKey);
    // Still loading: waiting for prices. A price history that did not load is
    // named with the source's own answer, so the reader can retry it.
    if (g && /still loading/i.test(g.reason)) { pending++; continue; }
    if (g && /could not load/i.test(g.reason)) { gaps.push({ position: p, reason: g.detail ?? g.reason, code: 'source' }); continue; }
    gaps.push({ position: p, reason: g?.reason ?? (p.marketSide === 'private' ? 'A private investment: reported apart, at Private Market’s value.' : 'No value on record for this period.'), code: 'unmatched' });
  }
  const value = out.reduce((s, u) => s + u.position.marketValue, 0);
  const periodPct = value > 0 ? out.reduce((s, u) => s + u.position.marketValue * u.periodPct, 0) / value : null;
  // The dates measured, as on the cards: a holding held at its last value sets neither.
  const dated = out.filter((u) => u.from && u.to && !u.held);
  const from = dated.map((u) => u.from).sort()[0] ?? null, to = dated.map((u) => u.to).sort().at(-1) ?? null;
  return { units: out, gaps, pending, pct: periodPct, periodPct, value, count: out.length, annual: false, days: 0, from, to,
    totalValue: current.reduce((s, p) => s + p.marketValue, 0) };
}

/** The same figure over some of the holdings (one attribution row). */
export function selectionMarketOf(all: ReturnType<typeof selectionMarket>, ps: readonly Position[]) {
  const keys = new Set(ps.map(marketHoldingKey));
  const units = all.units.filter((u) => keys.has(marketHoldingKey(u.position)));
  const gaps = all.gaps.filter((g) => keys.has(marketHoldingKey(g.position)));
  const value = units.reduce((s, u) => s + u.position.marketValue, 0);
  const pct = value > 0 ? units.reduce((s, u) => s + u.position.marketValue * u.periodPct, 0) / value : null;
  const dated = units.filter((u) => u.from && u.to && !u.held);
  return { units, gaps, pct, periodPct: pct, value, count: units.length, annual: false, days: 0,
    // A row of holdings held at their last value measured no dates: none are claimed for it.
    from: dated.map((u) => u.from).sort()[0] ?? null, to: dated.map((u) => u.to).sort().at(-1) ?? null };
}
