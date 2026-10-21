/**
 * ── THE BOOK'S DRAWDOWN, ON THE SERIES IT ACTUALLY HAS ──────────────────────
 *
 * Return & Drawdown marked the figure absent because "this corpus carries two
 * dated values per account" — the premise Stage 10p measured and overturned for
 * the NAV chart, and Stage 10ar for /performance's card. `BOOK_NAV_HISTORY` is
 * a dated series, and `navIndexSeries` chains it on the LINK: each interval is
 * struck over the accounts valued at both its ends, net of the external capital
 * that entered it, so an account arriving and a deposit landing are not falls.
 * A peak-to-trough on that index is a measurement, and this is it.
 *
 * WHAT IT CANNOT SEE, stated wherever it is printed: between two statement
 * dates each account is carried at its latest mark, so a fall and a recovery
 * inside one interval are invisible; and it is a drawdown of the covered
 * accounts that publish a series, not of the whole book.
 */
import { navIndexSeries, type NavIndexPoint } from "./navSeries";
import type { NavPoint } from "./types";

export type DrawdownPoint = { date: string; index: number };

export type Drawdown = {
  /** Largest fall from a running peak, in percent (≤ 0). 0 is a MEASURED nil: the index never fell. */
  pct: number;
  peakDate: string | null;
  troughDate: string | null;
  /** The first later date the index regained the peak's level; null if it has not. */
  recoveredOn: string | null;
  points: number;
  from: string;
  to: string;
};

/** Null where the series has fewer than two points — one level is not a path. */
export function maxDrawdown(points: readonly DrawdownPoint[]): Drawdown | null {
  const pts = points.filter((p) => Number.isFinite(p.index) && p.index > 0);
  if (pts.length < 2) return null;
  let peak = pts[0];
  let best = { pct: 0, peak: null as DrawdownPoint | null, trough: null as DrawdownPoint | null };
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    // A PEAK IS DATED WHERE ITS LEVEL WAS FIRST REACHED. An interval that
    // measured nothing repeats the level exactly (31 Jul → 6 Aug here), and a
    // later date at the same level is not a new high.
    if (p.index > peak.index) { peak = p; continue; }
    if (p.index === peak.index) continue;
    const dd = (p.index / peak.index - 1) * 100;
    if (dd < best.pct) best = { pct: dd, peak, trough: p };
  }
  let recoveredOn: string | null = null;
  if (best.peak && best.trough) {
    const after = pts.slice(pts.indexOf(best.trough) + 1);
    recoveredOn = after.find((p) => p.index >= best.peak!.index)?.date ?? null;
  }
  return {
    pct: best.pct,
    peakDate: best.peak?.date ?? null,
    troughDate: best.trough?.date ?? null,
    recoveredOn,
    points: pts.length,
    from: pts[0].date,
    to: pts[pts.length - 1].date,
  };
}

/**
 * THE BOOK'S DRAWDOWN, STRUCK ON THE CHAINED INDEX — NEVER ON THE LEVEL.
 *
 * `nav` is the marked panel's LEVEL, and it moves every time an account
 * arrives or a deposit lands; only `index` is a return. On this book the
 * deepest fall sits inside the complete-panel window with no external capital
 * in it, so a drawdown struck on the level happens to AGREE with this one —
 * which is exactly why the page could never tell the two apart, and why the
 * composition lives here, where `extrasFigures.test.ts` holds it on a
 * constructed series whose level and link part company.
 */
export function bookDrawdown(history: readonly NavPoint[]): { index: NavIndexPoint[]; drawdown: Drawdown | null } {
  const index = navIndexSeries([...history]);
  return { index, drawdown: maxDrawdown(index.map((x) => ({ date: x.date, index: x.index }))) };
}
