// THE BOOK AGAINST EVERY BENCHMARK, ON ONE START AND ONE END (Stage 10iv).
//   npm run test:family
//
// Three claims the chart rests on, struck on constructed lines and on the real
// book:
//
//   1. EVERY LINE STARTS AT ZERO ON THE PERIOD'S FIRST DAY and ends on the
//      book's latest valuation, so its last point is its return over the window
//      and the book's and an index's figures cover the same dates.
//   2. A COMPARISON STARTS ONLY ON A DAY THE BOOK WAS VALUED — a start between
//      an investment's two valuations carries its earlier gain into the period
//      (`comparableStarts`).
//   3. THE BOOK'S RETURN OVER A WINDOW IS ITS CHAINED INDEX'S, nearest-earlier at
//      both ends — the time-weighted figure, net of capital, never the NAV level.
import { changeSince, lineReturn } from "@/lib/benchCompare";
import { bookNavSeries, comparableStarts, type NavUnit } from "@/lib/bookNav";
import { navIndexSeries } from "@/lib/navSeries";
import { WHOLE_BOOK_NAV, WHOLE_BOOK_STARTS, BOOK_NAV_UNITS } from "@/lib/bookNavBook";
import { BENCHMARKS } from "@/lib/benchmarks";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number | null, b: number | null, eps = 1e-9) => a != null && b != null && Math.abs(a - b) <= eps;

// ── 1. One start, one end ────────────────────────────────────────────────────
{
  const idx = [
    { t: "2026-03-30", v: 200 }, { t: "2026-04-01", v: 210 }, { t: "2026-04-15", v: 220 },
    { t: "2026-05-04", v: 190 }, { t: "2026-05-06", v: 230 },
  ];
  // A Sunday start resolves to the close before it, and is the line's zero.
  const line = changeSince(idx, "2026-04-05", "2026-05-05");
  ok("the line opens at 0% on the period's first day", line[0]?.t === "2026-04-05" && line[0]?.v === 0);
  ok("…based on the last close on or before it, never a later one",
    near(line[1]?.v ?? null, (220 / 210 - 1) * 100));
  ok("…and stops on the window's last day — a close after it is not drawn",
    line.at(-1)?.t === "2026-05-04" && near(lineReturn(line), (190 / 210 - 1) * 100));
  ok("a line with no level by the first day is empty, not based on a later point",
    changeSince(idx, "2026-03-01", "2026-05-05").length === 0);
  ok("an empty line has no return", lineReturn([]) === null);
}

// ── 2. The days a comparison may start on ───────────────────────────────────
{
  const unit = (key: string, marks: [string, number][]): NavUnit => ({
    key, accountId: key, securityKey: null, marks: marks.map(([date, value]) => ({ date, value, source: "statement" })),
    flows: [], origin: null, originDated: false, atCost: false, recordTo: null, steps: [], bookValue: marks.at(-1)![1],
  });
  // A is valued every month; B only at the start and in July, so its April–June
  // move lands on 10 Jul. A start on 31 May would carry that move into the period.
  const units = [
    unit("a", [["2026-03-31", 100], ["2026-04-30", 102], ["2026-05-31", 104], ["2026-06-30", 106], ["2026-07-31", 108], ["2026-08-31", 110]]),
    unit("b", [["2026-03-31", 100], ["2026-07-10", 125], ["2026-07-31", 124], ["2026-08-31", 126]]),
  ];
  const series = bookNavSeries(units);
  const starts = comparableStarts(units, series);
  ok("the series' first day is always offered", starts[0] === "2026-03-31");
  ok("a day when B is carried from an older valuation and valued again later is not",
    !starts.includes("2026-05-31") && !starts.includes("2026-06-30"));
  ok("a day both are valued on, with a month still to run, is",
    starts.includes("2026-07-31"), starts.join(", "));
  ok("a day too close to the end is not", !starts.includes("2026-08-31"));
  ok("…and a lenient bound admits the stale days it refused",
    comparableStarts(units, series, { maxLeak: 0.6 }).includes("2026-05-31"));
}

// ── 3. The real book ─────────────────────────────────────────────────────────
{
  const book = navIndexSeries(WHOLE_BOOK_NAV.points);
  const from = book[0]?.date, to = book.at(-1)?.date;
  ok("the book has a dated series to compare", book.length >= 2 && !!from && !!to, `${book.length} points`);
  if (from && to) {
    const pts = book.map((p) => ({ t: p.date, v: p.index }));
    const since = changeSince(pts, from, to);
    ok("since start, the book's return is its chained index end to end",
      near(lineReturn(since), book.at(-1)!.index - 100, 1e-9), `${lineReturn(since)?.toFixed(2)}%`);
    // The same figure must not be the NAV level's move, which carries every
    // rupee that joined; on this book the two differ by far more than rounding.
    const levelMove = (book.at(-1)!.nav / book[0].nav - 1) * 100;
    ok("…and is not the NAV level's move, which counts money arriving as gain",
      Math.abs((lineReturn(since) ?? 0) - levelMove) > 1, `level ${levelMove.toFixed(2)}%`);
    ok("the real book can be compared from its first day, and only from days it was valued on",
      WHOLE_BOOK_STARTS[0] === from && WHOLE_BOOK_STARTS.every((d) => WHOLE_BOOK_NAV.points.some((p) => p.date === d)),
      WHOLE_BOOK_STARTS.join(", "));
    ok("…and 26 Apr, 27 Jul and 30 Sep are not among them — each carries older gains in",
      !["2026-04-26", "2026-07-27", "2026-09-30"].some((d) => WHOLE_BOOK_STARTS.includes(d)));
    for (const start of WHOLE_BOOK_STARTS) {
      const line = changeSince(pts, start, to);
      const base = [...book].reverse().find((p) => p.date <= start)!;
      ok(`since ${start}: the book's line opens at 0% and ends on its chained return`,
        line[0]?.v === 0 && near(lineReturn(line), (book.at(-1)!.index / base.index - 1) * 100, 1e-9));
    }
  }
  ok("every benchmark has its own colour, fixed to it",
    new Set(BENCHMARKS.map((b) => b.color)).size === BENCHMARKS.length
      && BENCHMARKS.every((b, i) => b.color === `var(--chart-bench-${i + 1})`));
}

if (fails) { console.log(`\n${fails} failing`); process.exit(1); }
console.log("\nall passing");
