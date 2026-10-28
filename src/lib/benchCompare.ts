// ── THE BOOK AGAINST EVERY BENCHMARK, ON ONE CHART (Stage 10iv) ─────────────
//
// *"make it more simple to compare on the same graph across all benchmarks no
// verbose"* — the family, 28 Oct 2026.
//
// ONE START, ONE END, FOR EVERY LINE. Each line is its % change since the
// window's first day, and every line stops on the book's latest valuation, so
// the last point of each line IS its return over the window and the book's
// figure and every index's are struck over the same dates. The old card rebased
// the index at the book's first point whatever period was picked, so on 3M and
// 6M neither line started at zero and the two could not be read off the chart.
//
// A PERIOD STARTS ONLY ON A DATE THE BOOK WAS VALUED ON. Each investment is
// held at its latest valuation until the next, so a start between two of its
// valuations carries gains from before the start into the period. The dates a
// comparison may start on are `comparableStarts` in `bookNav.ts`; on this book
// that is 31 Mar 2026 alone, which is why 1M, 3M, 6M and 1Y are no longer
// offered — each set months-old values against an index's latest move.
import type { Point } from "./series";
import { levelOnOrBefore, sortPoints } from "./navSeries";

/**
 * A line as its % change since `from`: 0 at `from`, then every point after it
 * up to and including `to`. The base is the line's level ON OR BEFORE `from` —
 * the book carried at its latest valuation, an index at its last close — and
 * a line with no level by then is empty rather than based on a later point.
 */
export function changeSince(points: readonly Point[], from: string, to: string): Point[] {
  const sorted = sortPoints([...points]);
  const base = levelOnOrBefore(sorted, from);
  if (base == null || !(base > 0)) return [];
  const out: Point[] = [{ t: from, v: 0 }];
  for (const p of sorted) if (p.t > from && p.t <= to) out.push({ t: p.t, v: (p.v / base - 1) * 100 });
  return out;
}

/** The return a `changeSince` line ends on — null for an empty line. */
export function lineReturn(line: readonly Point[]): number | null {
  return line.length ? line[line.length - 1].v : null;
}
