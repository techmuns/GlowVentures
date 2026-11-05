/**
 * ── THE RETURN LINE: THE CARD'S OWN MEASURE, ENDED ON EACH DAY (Stage 10la) ──
 *
 *   *"how can our book be 6.1% when all the above things are showing 12% …
 *    everything should match … as i change time filters it would change"*
 *   — the family, 4 Nov 2026, on Our book vs benchmarks under the return cards.
 *
 * The chart drew a second engine — a time-weighted index over the investments
 * valued at both ends of each step — so it left out every record the cards
 * start from its first value (Sanshi from 30 Jun, ESDS from its listing, Yash
 * on the broker's trades) and compounded differently. It now draws the card's
 * selection (`periodSelection`): on each day, the card's figure had the
 * period ended that day. Its last point IS the card.
 *
 * ONE RECORD ON A DAY is its latest dated value on or before it — the open, a
 * statement mark, a published close (`AccountWindow.marks`) — plus the money it
 * moved since. Nothing is interpolated: a record with no mark between its open
 * and close is held at its last value until its next.
 *
 * THE INDEX ON THE SAME MONEY: every rupee of each record put into the index on
 * the day it moved, struck with the same measure on the same days
 * (`pmeWindowRows`) — the card's own "vs" figure, drawn.
 */
import { measureWindow, pmeWindowRows, type AccountWindow, type IndexLevel, type ReturnType } from './periodReturns';

export type LinePoint = { date: string; pct: number | null; gain: number };

/** A record's value on `d`: its latest dated value on or before it, plus the money moved since. */
export function valueOn(w: AccountWindow, d: string): number {
  if (d >= w.closeDate) return w.closeValue;
  let at = w.openDate, v = w.openValue;
  for (const m of w.marks ?? []) { if (m.date > d) break; if (m.date >= at) { at = m.date; v = m.value; } }
  // A flow's amount is negative into the record, positive out of it.
  for (const f of w.flows) if (f.date > at && f.date <= d) v -= f.amount;
  return v;
}

/** The record as the card would measure it had the period ended on `d`; null before it opens. */
export function windowOn(w: AccountWindow, d: string): AccountWindow | null {
  if (w.openDate > d) return null;
  if (d >= w.closeDate) return { ...w, marks: undefined, carriedTo: d > w.closeDate ? d : undefined };
  const flows = w.flows.filter((f) => f.date <= d);
  const capitalIn = flows.filter((f) => f.amount < 0).reduce((s, f) => s - f.amount, 0);
  const capitalOut = flows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const closeValue = valueOn(w, d);
  return { ...w, closeDate: d, closeValue, flows, capitalIn, capitalOut, carriedTo: undefined, marks: undefined,
    gain: closeValue - w.openValue - capitalIn + capitalOut };
}

/** The days the line is drawn on: every day a record opens, is valued or moves money, within the period. */
export function lineDates(windows: readonly AccountWindow[], from: string, to: string): string[] {
  const out = new Set<string>([from, to]);
  for (const w of windows) {
    out.add(w.openDate); out.add(w.closeDate);
    for (const m of w.marks ?? []) out.add(m.date);
    for (const f of w.flows) out.add(f.date);
  }
  return [...out].filter((d) => d >= from && d <= to).sort();
}

/**
 * The card's measure, ended on each day. The period return — over a year, the
 * money-weighted rate's growth over the days (`periodPct`) — so the line is
 * cumulative whatever the card's own basis; its last point is the card's.
 */
export function periodLine(windows: readonly AccountWindow[], type: ReturnType, from: string, to: string,
  opts: { debt?: boolean; level?: IndexLevel } = {}): LinePoint[] {
  const out: LinePoint[] = [];
  for (const d of lineDates(windows, from, to)) {
    let rows = windows.map((w) => windowOn(w, d)).filter((w): w is AccountWindow => !!w);
    if (opts.level) {
      const p = rows.length ? pmeWindowRows(rows, opts.level) : null;
      if (!p?.rows) { out.push({ date: d, pct: null, gain: 0 }); continue; }
      rows = p.rows;
    }
    const gain = rows.reduce((s, w) => s + w.gain, 0);
    if (!rows.length || rows.every((w) => w.closeDate <= w.openDate && !w.carriedTo)) { out.push({ date: d, pct: rows.length ? 0 : null, gain }); continue; }
    const m = measureWindow(rows, type, String, { debt: opts.debt });
    const pct = m.working?.periodPct ?? (m.shown && m.basis === 'window' ? m.pct ?? null : null);
    out.push({ date: d, pct: pct != null && Number.isFinite(pct) ? pct : null, gain });
  }
  return out;
}
