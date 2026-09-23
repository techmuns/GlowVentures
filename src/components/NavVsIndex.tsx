import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  ReferenceDot, ReferenceArea,
} from "recharts";
import { Card } from "@/components/Card";
import { AbsentSection } from "@/components/Absent";
import { useViewParam } from "@/components/ViewToggle";
import { usePortfolio } from "@/context/PortfolioContext";
import { BOOK_NAV_COVERAGE } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import {
  navIndexSeries, rebasedIndex, navCoverageStats, windowReturnPct,
  indexCurve, indexReturnBetween, rangeStart, rangeEnd, NAV_RANGES, type NavRangeKey,
} from "@/lib/navSeries";
import { fetchPriceHistory, toPoints, type PriceHistory } from "@/lib/prices";
import { BENCHMARKS, benchmarkByKey, benchmarkIdentity, benchmarkMismatchReason } from "@/lib/benchmarks";
import { fmtPct, fmtNum, changeColor, DASH } from "@/lib/format";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle } from "@/lib/chartTheme";

// ── THE DATED NAV SERIES, CHARTED AGAINST A BENCHMARK THE READER PICKS ──────
//
// This card replaces one that rendered an `AbsentSection` reading "No valuation
// series in this book · each account's statements carry exactly two points".
// That was true of the nine-account corpus it was written against and has been
// false since the first drop REISSUED a statement. Thirteen accounts now publish
// two or more dated valuations. Leaving the absence up would have been the FIFTH
// time this repo told a reader to stop looking for something already in the
// archive — after FRED, the RBI, the release calendar and the ISIN tier.
//
// THE LINE THAT IS DRAWN IS FLOW-ADJUSTED, AND THAT IS THE WHOLE CARD. The raw
// NAV runs +9.29% over this window against the Nifty 500's +1.33%; ₹11.24 Cr of
// that is a deposit into V.E.C 128005 on 28–29 July, and net of it the book
// earned +0.54%. Both curves are drawn, because a reader whose NAV went up ₹12 Cr
// is entitled to see that too — but the one labelled as the book's RETURN is the
// one the money did not walk into.
//
// EVERY ACCOUNT THE SERIES CANNOT COVER IS NAMED, which is the half of the
// family's request that the chart cannot answer on its own.

// EVERY SERIES COLOUR IS A THEME VARIABLE — see the block in `index.css`.
// A hardcoded hex in a recharts prop is not a Tailwind utility, so the
// light-mode remap sweep cannot resolve it, and `#d9c48f` on ivory is a line a
// reader cannot see. `stroke` accepts `var()` and `SeriesChart` already does it
// for the grid.
const BOOK_COLOR = "var(--chart-book, #d9c48f)";
const INDEX_COLOR = "var(--chart-index, #6366f1)";
const NAV_COLOR = "var(--chart-nav, #64748b)";
const GRID_COLOR = "var(--chart-grid, #2b2668)";
const AXIS_COLOR = "var(--chart-axis, #6b6880)";
const BAND_COLOR = "var(--chart-band, rgba(217,196,143,0.07))";

const DAY = 86400000;
const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * ONE TICK PER PERIOD, TAKEN FROM THE DATES THAT EXIST.
 *
 * Letting recharts place ticks on a five-year time axis and then shortening each
 * to its year prints "2023 2023 2024 2024" — several land inside one year and
 * format identically. `SeriesChart` solved this once; the same reasoning applies
 * here, on timestamps rather than strings.
 */
function axisTicks(dates: string[], spanDays: number): { ticks: number[]; fmt: (t: number) => string } {
  const period = spanDays > 365 * 2.5 ? "year" : spanDays > 200 ? "quarter" : spanDays > 75 ? "month" : "day";
  const fmt = period === "year"
    ? (t: number) => iso(t).slice(0, 4)
    : period === "day"
      ? (t: number) => iso(t).slice(5)
      : (t: number) => iso(t).slice(0, 7);
  if (period === "day") {
    // Under about ten weeks every book date is worth its own tick, and there are
    // only ever a handful of them.
    return { ticks: dates.map(ts), fmt };
  }
  const keyOf = (d: string) =>
    period === "year" ? d.slice(0, 4)
      : period === "quarter" ? `${d.slice(0, 4)}Q${Math.floor(Number(d.slice(5, 7)) / 3.01) + 1}`
        : d.slice(0, 7);
  const firsts: string[] = [];
  let last = "";
  for (const d of dates) {
    const k = keyOf(d);
    if (k !== last) { firsts.push(d); last = k; }
  }
  const stride = Math.max(1, Math.ceil(firsts.length / 10));
  return { ticks: firsts.filter((_, i) => i % stride === 0).map(ts), fmt };
}

export function NavVsIndex() {
  const { portfolio, fmtFromBase } = usePortfolio();
  /**
   * WHICH BENCHMARK THE BOOK IS SET AGAINST. In the URL (`?bench=`) like every
   * other view in this app, so "send me the book against the Sensex" is a link
   * rather than an instruction — and Morning CIO's tab label reads the same
   * param, so the tab always names the index the panel behind it draws. The
   * Nifty 500 is first and therefore param-free: every existing link keeps
   * landing on the chart the family has been reading. See `benchmarks.ts`.
   */
  const [benchKey, setBenchKey] = useViewParam(BENCHMARKS, {}, "bench");
  const bench = benchmarkByKey(benchKey);
  const [index, setIndex] = useState<PriceHistory | null>(null);
  /**
   * FOUR STATES, and `mismatch` is the one this control added. The service
   * answered, and answered for a DIFFERENT instrument than the benchmark
   * declares — trap 2 in `indices.js`, which is a real figure about the wrong
   * market. It draws no line and says what answered, which is a different
   * sentence from "the service is down" and sends a reader somewhere different.
   */
  const [indexState, setIndexState] = useState<"loading" | "ok" | "down" | "mismatch">("loading");
  const [reportedName, setReportedName] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(true);
  /**
   * HOW FAR BACK THE CHART LOOKS. Defaults to 1Y rather than the book's own five
   * weeks: the family asked for a larger period, and a year of the index around
   * the measured window is real market history rather than a wider frame around
   * the same seven points. The measured stretch is SHADED at every range, so a
   * reader can always see which part of the axis carries a comparison.
   */
  const [range, setRange] = useState<NavRangeKey>("1Y");

  useEffect(() => {
    let alive = true;
    // THE PREVIOUS BENCHMARK'S CURVE MUST NOT OUTLIVE ITS LABEL. Switching
    // clears it first, so for the length of a fetch the chart draws the book
    // alone rather than the last index under the new one's name.
    setIndex(null);
    setIndexState("loading");
    setReportedName(null);
    fetchPriceHistory(bench.symbol).then((r) => {
      if (!alive) return;
      if (!r.ok) { setIndexState("down"); return; }
      const id = benchmarkIdentity(r, bench);
      if (!id.ok) { setReportedName(id.reportedName); setIndexState("mismatch"); return; }
      setIndex(r);
      setIndexState("ok");
    });
    return () => { alive = false; };
  }, [bench]);

  const model = useMemo(() => {
    if (!portfolio) return null;
    const book = navIndexSeries(portfolio.navHistory);
    const stats = navCoverageStats(BOOK_NAV_COVERAGE, portfolio);
    const dates = book.map((p) => p.date);
    const bookFrom = dates[0] ?? null;
    const bookTo = dates[dates.length - 1] ?? null;
    const pts = index ? toPoints(index) : [];

    // The book's own seven points, sampled from the index at the same dates —
    // what the like-for-like pair in the title's hover and the tooltip need.
    const idx = pts.length ? rebasedIndex(pts, dates) : new Map<string, number>();

    /**
     * THE INDEX'S OWN DAILY CURVE OVER THE SELECTED WINDOW, rebased at the
     * book's first point so both lines pass through 100 on the one date they
     * share. Without this the "index" was seven straight segments between the
     * book's statement dates — a plausible-looking line that is not the index's
     * path, and over a year of context it would have been four.
     */
    const from = bookFrom && bookTo ? rangeStart(range, bookFrom, bookTo) : null;
    const until = bookTo ? rangeEnd(range, bookTo) : null;
    const curve = bookFrom && pts.length ? indexCurve(pts, bookFrom, from) : [];

    const bookByDate = new Map(book.map((p) => [p.date, p]));
    const allDates = [...new Set([...curve.map((c) => c.t), ...dates])]
      .filter((d) => (!from || d >= from) && (!until || d <= until))
      .sort();
    const curveByDate = new Map(curve.map((c) => [c.t, c.v]));

    const rows = allDates.map((d) => {
      const p = bookByDate.get(d);
      const level = curveByDate.get(d) ?? (idx.has(d) ? (idx.get(d) as number) : undefined);
      return {
        t: ts(d),
        date: d,
        book: p ? Number(p.index.toFixed(3)) : null,
        // NULL, NEVER NaN — the raw line is undefined before the panel is
        // complete (`navIndexSeries`), and recharts draws a gap for null while
        // NaN reaches the axis domain and drags it.
        nav: p && Number.isFinite(p.navIndex) ? Number(p.navIndex.toFixed(3)) : null,
        flowIn: p?.flowIn ?? 0,
        unreportedFlowValue: p?.unreportedFlowValue ?? 0,
        index: level === undefined ? null : Number(level.toFixed(3)),
      };
    });

    /**
     * THE PANEL, MEASURED OFF THE POINTS THE CHART DRAWS.
     *
     * The series now begins before every covered account has published, because
     * each link is struck over the accounts valued at BOTH its ends (see
     * `navHistoryFrom`). That is what took the window from 34 days to 74 — and
     * it means the early links cover fewer accounts than the late ones, which
     * is a fact about the measurement and therefore belongs on the card rather
     * than in this comment. Counted from the emitted points, never typed.
     */
    const panelAt = (p: (typeof book)[number]) => p.accountsOnDate + p.accountsCarried;
    const panelFirst = book.length ? panelAt(book[0]) : 0;
    const panelLast = book.length ? panelAt(book[book.length - 1]) : 0;
    const completeFrom = book.find((p) => p.panelComplete)?.date ?? null;

    /**
     * THE RAW-vs-ADJUSTED PAIR, STRUCK OVER ONE WINDOW.
     *
     * The raw NAV line is only defined where the panel is complete, and the
     * adjusted line now runs 40 days further back — so setting the whole
     * series' adjusted return against the raw line's last value would compare
     * 74 days with 34 and call the difference "the deposit". Both would be
     * right on their own terms, which is exactly the shape of contradiction
     * this card's own footer rule exists to stop. Both are taken over the
     * COMPLETE-PANEL segment, which is the only window the raw line has.
     */
    const segFrom = book.findIndex((p) => p.panelComplete);
    const segRaw = segFrom >= 0 && book.length - segFrom >= 2
      ? (book[book.length - 1].nav / book[segFrom].nav - 1) * 100 : null;
    let segAdj: number | null = null;
    if (segFrom >= 0 && book.length - segFrom >= 2) {
      let idxSeg = 100;
      for (let i = segFrom + 1; i < book.length; i++) {
        const p = portfolio.navHistory[i];
        const open = p.linkOpen ?? portfolio.navHistory[i - 1].nav;
        const close = p.linkClose ?? p.nav;
        if (open > 0) idxSeg *= (close - (p.flowIn ?? 0)) / open;
      }
      segAdj = idxSeg - 100;
    }
    const segFromDate = segFrom >= 0 ? book[segFrom].date : null;

    const bookRet = windowReturnPct(book);
    /**
     * THE LIKE-FOR-LIKE FIGURE, AND THE RANGE'S OWN, KEPT APART.
     *
     * `indexRet` is the index over the BOOK'S window — the only window in which
     * a comparison exists, and the one the headline pills state. `rangeRet` is
     * the index over whatever period the reader selected and is INDEX-ONLY: the
     * book has no measurement over it, so it is labelled as market history
     * rather than set beside a book figure it does not correspond to.
     */
    const indexRet = bookFrom && bookTo && pts.length ? indexReturnBetween(pts, bookFrom, bookTo) : null;
    const rangeFrom = rows.length ? rows[0].date : null;
    const rangeTo = rows.length ? rows[rows.length - 1].date : null;
    const rangeRet = rangeFrom && rangeTo && pts.length ? indexReturnBetween(pts, rangeFrom, rangeTo) : null;

    // The steps a reader would otherwise read as performance: an interval that
    // took external capital. Marked ON the chart, not explained underneath it.
    const flowMarks = rows.filter((r) => Math.abs(r.flowIn) > 1e5);
    const unproven = rows.filter((r) => r.unreportedFlowValue > 0);
    const spanDays = rows.length > 1 ? (rows[rows.length - 1].t - rows[0].t) / DAY : 0;
    const { ticks, fmt: tickFmt } = axisTicks(
      spanDays > 75 ? allDates : dates, spanDays);
    return {
      book, rows, stats, bookRet, indexRet, rangeRet, flowMarks, unproven, dates,
      bookFrom, bookTo, rangeFrom, rangeTo, ticks, tickFmt, spanDays,
      panelFirst, panelLast, completeFrom, segRaw, segAdj, segFromDate,
      // COUNTED OFF THE ROWS THAT ARE DRAWN, not off the curve before it is
      // clipped — the book range caps at the last statement date, and a count
      // taken upstream of that would report closes the chart does not contain.
      indexRuns: rows.filter((r) => r.index != null).length,
    };
  }, [portfolio, index, range]);

  if (!model || !portfolio) return null;
  const {
    rows, stats, bookRet, indexRet, rangeRet, flowMarks, unproven,
    bookFrom, bookTo, rangeFrom, rangeTo, ticks, tickFmt, spanDays, indexRuns,
    panelFirst, panelLast, completeFrom, segRaw, segAdj, segFromDate,
  } = model;
  const cov = BOOK_NAV_COVERAGE;
  // NAMED FROM THE REGISTRY, NOT FROM THE ID. `accountId` is a slug and reads
  // as one; the registry is where "who runs this and whose money it is" lives,
  // and `custodianOf()` was deleted for guessing it out of text (§2).
  const accts = accountIndex(portfolio.accounts);
  const nameOf = (id: string) => {
    const a = accts.get(id);
    if (!a) return id;
    const owner = a.ownerId ? ownerDisplayName(a.ownerId) : a.owner;
    return `${a.provider}${owner ? ` · ${owner}` : ""}`;
  };

  // A series needs at least two points and a set to hold constant over. Both
  // halves of the family's ask are answered here: the series when it exists, and
  // the accounts that cannot supply one either way.
  //
  // STRUCK ON THE BOOK'S OWN DATES, NOT ON `rows`. `rows` is now the union of the
  // book's dates and the index's daily closes, so it is in the hundreds the
  // moment the feed answers — a book with no series of its own would sail past a
  // `rows.length` test and draw an index alone under a heading promising a
  // comparison. `dates` is the book's, and is the only thing this branch is
  // about.
  if (model.dates.length < 2) {
    return (
      <Card className="flex flex-col" title={`Portfolio NAV vs ${bench.label}`}
        subtitle="Dated portfolio values from the statements, against the index">
        <AbsentSection
          what="No account in this book publishes more than one dated valuation"
          needs={`A NAV series needs the same account valued at two or more dates. ${stats.singleCount} account(s) publish exactly one and ${stats.unvaluedCount} publish none, so there is no set over which a series could hold its composition constant. The next monthly reissue of any statement already in the archive starts one.`} />
        <ExcludedAccounts cov={cov} nameOf={nameOf} fmt={fmtFromBase} />
      </Card>
    );
  }

  /**
   * ── THE BASIS, THE COMPARISON AND THE DISCLOSURE ARE THE TITLE'S HOVER ──────
   *
   * *"remove the highlighted texts from the dashboard UI"* — pointed at this
   * card's basis line AND at the four headline pills (Book, the index, the
   * not-proven disclosure and the window under them). Every claim was audited
   * before anything went, the method CLAUDE.md records for each removal:
   *
   *   · THE LIKE-FOR-LIKE PAIR — the book and the benchmark over the book's own
   *     window. The chart's tooltip at the book's last point prints exactly
   *     that pair (both lines are rebased at the book's first point), so it has
   *     a second home ON THE FIGURE; it is also stated here in words.
   *   · THE WINDOW, THE POINT COUNT, THE COVERAGE AND THE REBASE — the collapsed
   *     list below names the accounts that CANNOT supply a series, which is the
   *     complement; the figures themselves had no second home.
   *   · THE NOT-PROVEN DISCLOSURE — no second home, and it qualifies the book's
   *     return, which is the first sentence here.
   *
   * So all of it is this hover, on the heading that names the comparison. A
   * hover is weaker than a caption, and that is recorded rather than glossed —
   * what is unchanged is that every one of these is still derived, still on the
   * card, and still read by `check:pages` at its new address.
   */
  const lastNav = model.book[model.book.length - 1].nav;
  const basisHover = [
    bookRet == null
      ? `The book's own series over ${bookFrom} → ${bookTo} carries no return.`
      : indexRet != null
        ? `Over the book's own window, ${bookFrom} → ${bookTo}: the book ${fmtPct(bookRet, { sign: true })} net of capital flows, ${bench.label} ${fmtPct(indexRet, { sign: true })} over the same dates. Hover the chart for both lines at any date.`
        : `Over the book's own window, ${bookFrom} → ${bookTo}: the book ${fmtPct(bookRet, { sign: true })} net of capital flows. ${indexState === "loading" ? `The ${bench.label} history is still loading.` : `No ${bench.label} line is drawn, so there is no comparison figure.`}`,
    `${model.dates.length} dated points, ${cov.from} → ${cov.to} · ${stats.coveredCount} of ${stats.accountsTotal} accounts, ${fmtFromBase(lastNav, { compact: true })} of the ${fmtFromBase(stats.consolidatedValue, { compact: true })} book · both lines rebased to 100 at ${cov.from}.`,
    "Each point holds every account at its most recent mark on or before that date, and counts a holding two accounts both report once.",
    panelLast > panelFirst && completeFrom
      ? `The panel grows from ${panelFirst} to ${panelLast} accounts over the window and is complete from ${completeFrom}. Each step is measured over the accounts valued at both of its ends, so an account arriving contributes nothing — and the dashed NAV line starts where the panel does.`
      : "",
    unproven.length > 0
      ? `Not proven to be performance: ${fmtFromBase(Math.max(...unproven.map((u) => u.unreportedFlowValue)), { compact: true })} of the move. ${stats.unreportedFlowAccounts.length} covered account(s) publish no dated capital record and hold more than one security — ${stats.unreportedFlowAccounts.map(nameOf).join(", ")} — so a subscription or redemption inside one of them would appear in the book's return. The other covered accounts either publish a capital register or hold a single security whose unit count is identical at every snapshot, which rules a movement out from the statement itself.`
      : "",
  ].filter(Boolean).join("\n\n");

  return (
    <Card className="flex flex-col"
      title={
        <span data-testid="nav-basis" title={basisHover} className="cursor-help">
          Portfolio NAV vs {bench.label}
        </span>
      }
      right={
        /* ── THE BENCHMARK CONTROL, WHERE THE PILLS WERE ──────────────────────
           *"Allow us to select different benchmarks to compare the portfolio
           returns with and make sure that the benchmark returns are live just
           like the Nifty 500 benchmark."*

           Every option comes through `/api/prices`, the call the Nifty 500 line
           has always used, and is checked by the NAME the service reports
           before a close is drawn — see `benchmarks.ts`. Tabs rather than a
           dropdown, which is what the family asked for on the Portfolio
           Monitor: one click to reach, and every option visible.

           KEYED `data-bench`, because a claim about which benchmarks this card
           offers must not be struck on labels a redesign is free to reword. */
        <div className="flex flex-wrap items-center justify-end gap-2" data-testid="nav-bench">
          <span className="label-xs">Benchmark</span>
          <div role="tablist" aria-label="Benchmark to compare the book against"
            className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
            {BENCHMARKS.map((b) => (
              <button key={b.key} type="button" role="tab" aria-selected={bench.key === b.key}
                data-bench={b.key} data-bench-symbol={b.symbol} onClick={() => setBenchKey(b.key)}
                title={b.title}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  bench.key === b.key
                    ? "bg-champagne-500 text-ink-950"
                    : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
                }`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      }>

      {/* ── HOW FAR BACK TO LOOK ────────────────────────────────────────────
          The book's own dated series is ELEVEN WEEKS and cannot be longer — the
          archive's earliest dated valuation of any kind is 2026-03-31, and the
          earliest belonging to an account that publishes twice is 2026-05-31.
          (It was five weeks until the chain-link above; the sentence that said
          so outlived the constraint, which is the failure this book records
          against six other premises nobody rechecked.) What CAN still be
          lengthened is the
          index's context around it, and the shaded band below keeps the measured
          stretch identifiable at every range, so a five-year view reads as
          market history with a measured window in it rather than as a comparison
          over five years. */}
      <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="nav-range">
        <span className="label-xs">Period</span>
        <div role="tablist" aria-label="Chart period"
          className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
          {NAV_RANGES.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={range === r.key}
              data-range={r.key} onClick={() => setRange(r.key)}
              title={r.key === "book"
                ? "The window both lines cover — the book's own first to last statement date."
                : `${r.label} of ${bench.label} closes ending at the book's last statement date. The book's own line still covers only its measured window.`}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r.key
                  ? "bg-champagne-500 text-ink-950"
                  : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
              }`}>
              {r.label}
            </button>
          ))}
        </div>
        {/* ── THE UNADJUSTED NAV IS A CONTROL, AND THE CONTROL NAMES THE
               ADJUSTMENT ────────────────────────────────────────────────────
            This toggle used to sit inside the paragraph that explained it, and
            the family asked for the paragraphs to go — so it moves to the row
            that already holds this chart's controls, and it carries the one
            fact the paragraph had that nothing else does: HOW MUCH capital the
            book line nets out. That figure is load-bearing. Over the segment the
            raw line covers, the covered set's raw NAV runs +9.29% against
            +0.54% net of flows,
            and the whole of the difference is a deposit into V.E.C 128005 —
            money added is not money earned, and a chart of the raw NAV would
            show eight points of outperformance, none of it earned. The two
            returns are in the hover; the SIZE is on the control, where a
            reader deciding whether to draw the line can see it. */}
        {flowMarks.length > 0 && (
          <button type="button" data-testid="nav-raw-toggle" aria-pressed={showRaw}
            onClick={() => setShowRaw((v) => !v)}
            title={segRaw == null || segAdj == null
              ? "The raw NAV line needs a complete panel — before it, the level is a growing set of accounts rather than a book."
              : `Over ${segFromDate} → ${bookTo}, the window the raw line covers, the covered set reads ${fmtPct(segRaw, { sign: true })} with the capital left in against ${fmtPct(segAdj, { sign: true })} net of it. The difference is the deposit rather than performance. BOTH FIGURES ARE OVER THAT SEGMENT and not over the whole series, which starts ${cov.from} — the raw level is undefined before the panel completes, and comparing a 74-day return with a 34-day one would call the extra weeks a deposit. The intervals that took capital are circled on the chart.`}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              showRaw
                ? "border-ink-600 bg-champagne-500 text-ink-950"
                : "border-ink-700 bg-ink-800/60 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
            }`}>
            NAV incl. {fmtFromBase(flowMarks.reduce((a, f) => a + Math.max(f.flowIn, 0), 0), { compact: true })} added
          </button>
        )}
        {indexState === "ok" && indexRuns > 0 && (
          /* THE RANGE'S OWN INDEX RETURN SITS WITH THE RANGE CONTROL, which is
             the only place it describes. It is the INDEX ALONE over a period
             the book has no measurement across — market history rather than a
             comparison — so it must never sit beside the book's figure in the
             headline, where a reader would read the two as a pair struck over
             one window. Here it is unmistakably about the selected period. */
          <span className="text-[11px] text-slate-500" data-testid="nav-range-note">
            {rangeFrom} → {rangeTo} · {indexRuns} index closes
            {rangeRet != null && (
              <> · {bench.label} alone over this period{" "}
                <span className={changeColor(rangeRet)}>{fmtPct(rangeRet, { sign: true })}</span></>
            )}
          </span>
        )}
      </div>

      {/* ── A DEFINITE HEIGHT, WHICH IS WHY THIS CARD WENT BLANK ─────────────
          This was `min-h-[15rem] flex-1`, and `ResponsiveContainer height="100%"`
          resolved against it as ZERO: the holder is a `flex-basis: 0` item in an
          auto-height column, so its used height comes from `min-height` and
          Chrome does not treat that as a definite height for a percentage child.
          The container measured 1225 × 0 and recharts rendered no SVG at all —
          no axes, no legend, no lines, an empty box under a full and correct
          caption. Every other chart in this app (`h-72`, `h-44`,
          `SeriesChart`'s `style={{height}}`) already sizes definitely; this one
          was the single exception and the single blank.

          AND NOTHING COULD SEE IT. Every invariant on this card reads rendered
          TEXT — the coverage line, the two returns, the named accounts — and all
          of them passed against an empty frame, because the words were right. A
          chart is checked on its geometry or it is not checked; see the
          `nav-chart` probe in `check-pages.mjs`. */}
      <div className="h-[22rem]" data-testid="nav-chart" data-bench-state={indexState} data-bench-key={bench.key}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
            {/* ── A REAL TIME AXIS, NOT SEVEN EQUALLY-SPACED LABELS ──────────
                This was a CATEGORY axis over the book's dates, so 10 → 11 August
                (one day) took the same width as 10 → 27 July (seventeen), and
                the slope of every segment was a fact about the row order rather
                than about time. A chart whose x-axis is not time cannot show
                what happened between two marks. */}
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
              ticks={ticks} tickFormatter={tickFmt} minTickGap={16}
              stroke={AXIS_COLOR} fontSize={11} />
            {/* INDEX POINTS, NOT RUPEES. Both curves are rebased to 100 at the
                first dated point, so the axis is a ratio and must not be run
                through the money formatter — `fmtFromBase` would put a ₹ on a
                number that is not an amount of anything. */}
            <YAxis stroke={AXIS_COLOR} fontSize={11} width={52} domain={["auto", "auto"]}
              tickFormatter={(v: number) => fmtNum(v, 1)} />
            <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
              labelFormatter={(t: number) => iso(Number(t))}
              formatter={(v: number, name: string) => [`${fmtNum(v, 2)} (${fmtPct(v - 100, { sign: true })})`, name]} />
            {/* THE LEGEND'S ORDER IS THE READING ORDER, NOT THE PAINT ORDER.
                The book's line is drawn LAST so it sits above the index curve
                (seven points against up to thirteen hundred closes), and a
                legend that followed the children would then lead with the index
                on a card whose subject is the book. The payload is stated so the
                two orders can differ on purpose. */}
            <Legend wrapperStyle={{ fontSize: 11 }} payload={[
              { value: "Book · ex capital flows", type: "line", id: "book", color: BOOK_COLOR },
              ...(showRaw ? [{ value: "NAV incl. capital added", type: "line" as const, id: "nav", color: NAV_COLOR }] : []),
              { value: bench.label, type: "line", id: "index", color: INDEX_COLOR },
            ]} />
            {/* THE STRETCH THE COMPARISON COVERS, SHADED.
                On the 1Y and longer views most of the axis is index history the
                book has no measurement over, and an unshaded chart invites the
                reader to read the whole width as a comparison. The band is the
                book's own first-to-last statement date, so it says exactly where
                the two lines are both real. */}
            {bookFrom && bookTo && spanDays > 75 && (
              <ReferenceArea x1={ts(bookFrom)} x2={ts(bookTo)} fill={BAND_COLOR} stroke={GRID_COLOR}
                strokeOpacity={0.5} ifOverflow="hidden" />
            )}
            <Line type="monotone" dataKey="index" stroke={INDEX_COLOR} strokeWidth={1.8} dot={false}
              name={bench.label} connectNulls isAnimationActive={false} />
            {showRaw && (
              <Line type="monotone" dataKey="nav" stroke={NAV_COLOR} strokeWidth={1.5} strokeDasharray="4 3" dot={false}
                name="NAV incl. capital added" connectNulls isAnimationActive={false} />
            )}
            {/* DRAWN LAST SO IT SITS ON TOP. The book's line is the subject of
                the card and there are seven points of it against up to twelve
                hundred index closes; under the index curve it disappears. */}
            <Line type="monotone" dataKey="book" stroke={BOOK_COLOR} strokeWidth={2.4} dot={{ r: 2.5 }}
              name="Book · ex capital flows" connectNulls isAnimationActive={false} />
            {/* THE STEP THAT IS MONEY, MARKED WHERE IT HAPPENS. A reader looking
                at the dashed line jumping 8% in one interval must be able to see
                on the chart that a deposit landed there, not read it in a
                paragraph below the fold. */}
            {flowMarks.map((f) => (
              <ReferenceDot key={f.date} x={f.t} y={f.nav ?? undefined} r={5} fill="none" stroke="#f59e0b" strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── THE FOUR EXPLANATORY PARAGRAPHS ARE GONE, AND THREE FACTS MOVED ──
          *"remove the highlighted text from the dashboard ui."*

          Every claim was checked against the rest of the card before anything
          was deleted, which is the whole of this change:

          · "Both lines are rebased to 100 at …" — a BASIS, and nowhere else on
            the card. Moved into the subtitle, which is this card's basis line.
          · "…nets out ₹11.2 Cr of external capital …" plus the Show/Hide
            control — the size is load-bearing and the control had to survive.
            Both are now the toggle in the period row above, which names the
            figure it reveals; the legend already says which line is which.
          · "₹28.3 Cr of the move is not proven to be performance …" — a
            DISCLOSURE about the Book pill. Moved to an amber pill beside it.
          · "The book's own dated series is N statement dates over A → B …" —
            already in the subtitle, word for word. The range's own index
            return, which was NOT elsewhere, moved to the range note.
          · "The index is taken at its last close on or before each statement
            date …" — methodology with no figure in it, and the only one of the
            five that went without a home. It is `alignIndexToDates` in
            `navSeries.ts` and is recorded in CLAUDE.md.

          The `<details>` below is deliberately NOT part of this removal: it is
          the other half of the family's own ask ("or state the accounts that
          cannot supply one"), it is a collapsed one-liner rather than prose,
          and §"a figure that exists for SOME accounts is shown for those and
          the rest are NAMED" is a standing rule of this book. */}

      {/* THE WRONG INSTRUMENT IS NOT AN OUTAGE, AND THE SENTENCE SAYS WHICH.
          Told "could not be fetched", a reader waits for a service that is up;
          told what answered, they know the symbol is what needs changing. */}
      {indexState === "mismatch" && (
        /* ONE LINE — WHAT IS MISSING AND WHAT ANSWERED; the reasoning is its
           hover (Stage 10cp). What answered stays on the face, because it is
           the fact that says the symbol, not the service, needs changing. */
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-400"
          data-testid="nav-bench-mismatch"
          title={`${benchmarkMismatchReason(bench, reportedName)} The book’s own series is unaffected and is shown alone.`}>
          No {bench.label} line — {reportedName ? <>the price service answered for &ldquo;{reportedName}&rdquo;</> : "the price service did not say which instrument it answered for"}
        </p>
      )}
      {indexState === "down" && (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-400"
          data-testid="nav-bench-down"
          title="No comparison line is drawn — the book’s own series is unaffected and is shown alone. The price service runs as a server-side function on the deployed site and is not available in local preview.">
          The {bench.label} history could not be fetched
        </p>
      )}

      <ExcludedAccounts cov={cov} nameOf={nameOf} fmt={fmtFromBase} />
    </Card>
  );
}

/**
 * THE OTHER HALF OF THE ASK — "or state the accounts that cannot supply one".
 *
 * Two lists, kept apart because they send a reader to two different places: an
 * account publishing ONE dated valuation needs its next monthly statement, and
 * an account publishing NONE needs a fund that values it at all. Folding them
 * into one "not covered" count would hide which is which.
 */
function ExcludedAccounts({ cov, nameOf, fmt }: {
  cov: typeof BOOK_NAV_COVERAGE;
  nameOf: (id: string) => string;
  fmt: (n: number | null | undefined, o?: { compact?: boolean }) => string;
}) {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  if (!cov.single.length && !cov.unvalued.length) return null;
  return (
    <details className="mt-3 rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2" data-testid="nav-excluded">
      {/* THE SPLIT IS IN THE SUMMARY, NOT ONLY INSIDE THE FOLD. "36 accounts
          cannot supply a series" is one fact; "23 publish one valuation and 13
          publish none" is two, and they send a reader to two different places —
          a next monthly statement, or a fund that values the folio at all. A
          reader who never opens the details still gets both. */}
      <summary className="cursor-pointer text-[11.5px] text-slate-400"
        title={`The ${cov.single.length + cov.unvalued.length} accounts that cannot supply a series: ${cov.single.length} publish exactly one dated valuation, ${cov.unvalued.length} publish no valuation at all. Open to see each one named.`}>
        Not in the series: <strong className="text-slate-300">{cov.single.length + cov.unvalued.length} accounts</strong>
        {" "}· {fmt(sum(cov.single.map((s) => s.bookValue)) + sum(cov.unvalued.map((u) => u.bookValue)), { compact: true })}
      </summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="label-xs" title="A level, never a change. Carrying them into the series as a flat line would drag its return towards a figure nothing measured. The next reissue of any of these statements gives each a second point.">
            {cov.single.length} publish exactly one dated valuation
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-400" data-testid="nav-single-list">
            {[...cov.single].sort((a, b) => b.bookValue - a.bookValue).map((s) => (
              <li key={s.accountId} className="flex justify-between gap-3">
                <span className="truncate" title={s.accountId}>{nameOf(s.accountId)} · {s.accountNo}</span>
                <span className="shrink-0 tabular text-slate-500">{s.date} · {fmt(s.bookValue, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label-xs" title="Sky Capital’s angel folios, India SME’s Fund II, 360 ONE’s income-only folios, the redeemed and transaction-only demats. They carry units, drawdowns or nothing, and no statement puts a NAV on them — which is why they contribute nothing to the book’s own total either.">
            {cov.unvalued.length} publish no valuation at all
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-400" data-testid="nav-unvalued-list">
            {/* A DASH, NOT `₹0`. These accounts contribute nothing to the book
                because NO STATEMENT VALUES THEM — an absent measurement, not a
                measured zero, and §2 forbids the two looking alike. The `single`
                list above keeps its ₹0 where one appears, because there the fund
                did strike a valuation and it was zero (3P Investment Managers),
                which is the computed zero the same rule preserves. */}
            {cov.unvalued.map((u) => (
              <li key={u.accountId} className="flex justify-between gap-3">
                <span className="truncate" title={u.accountId}>{nameOf(u.accountId)} · {u.accountNo}</span>
                <span className="shrink-0 tabular text-slate-500"
                  title="No statement in this drop puts a NAV on this folio, so it contributes nothing to the book's total either. That is an absent valuation, not a measured zero.">
                  {DASH}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* THE FIGURE ON ITS FACE, THE RECONCILIATION IN ITS HOVER (Stage 10cp). */}
      <p className="mt-3 border-t border-ink-700 pt-2 text-[11px] text-slate-500"
        title="The three lists account for every account in the book. Their sum is ABOVE the current value of holdings by the value two members both report — a per-account sum does not dedupe and a consolidated one does.">
        All three lists · {fmt(sum(cov.covered.map((c) => c.bookValue)) + sum(cov.single.map((s) => s.bookValue)) + sum(cov.unvalued.map((u) => u.bookValue)), { compact: true })}
      </p>
    </details>
  );
}
