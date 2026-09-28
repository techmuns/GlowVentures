import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  ReferenceDot, ReferenceArea,
} from "recharts";
import { Card } from "@/components/Card";
import { AbsentSection, AbsentCell } from "@/components/Absent";
import { useViewParam } from "@/components/ViewToggle";
import { usePortfolio } from "@/context/PortfolioContext";
import { BOOK_NAV_COVERAGE } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import {
  navIndexSeries, rebasedIndex, navCoverageStats, windowReturnPct,
  indexCurve, indexReturnBetween, rangeStart, rangeEnd, NAV_RANGES, type NavRangeKey,
  isMeasuredNilAccount,
} from "@/lib/navSeries";
import { fetchPriceHistory, toPoints, type PriceHistory } from "@/lib/prices";
import { BENCHMARKS, benchmarkByKey, benchmarkIdentity, benchmarkMismatchReason } from "@/lib/benchmarks";
import { fmtPct, fmtNum, changeColor } from "@/lib/format";
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

/** The dashed line's name, in the legend and as the tooltip's series key. */
const NAV_LINE = "NAV incl. capital added";

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
  const { portfolio, statementPortfolio, fmtFromBase, livePriced } = usePortfolio();
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
    // THE STATEMENT BOOK, because the series is struck on statement marks — a
    // live or NAV-overlaid total beside a series level divides one basis by
    // another (MNT-25). See `navCoverageStats`.
    const stats = navCoverageStats(BOOK_NAV_COVERAGE, statementPortfolio ?? portfolio);
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
      // WHERE THE DASHED LINE STARTS, and its level there — the base its own
      // tooltip figure is struck from (MNT-12). It sits ON the book's line.
      navAnchor: (() => {
        const r = rows.find((x) => x.nav != null && x.book != null);
        return r ? { date: r.date, level: r.nav as number } : null;
      })(),
    };
  }, [portfolio, statementPortfolio, index, range]);

  if (!model || !portfolio) return null;
  const {
    rows, stats, bookRet, indexRet, rangeRet, flowMarks, unproven,
    bookFrom, bookTo, rangeFrom, rangeTo, ticks, tickFmt, spanDays, indexRuns,
    panelFirst, panelLast, completeFrom, segRaw, segAdj, segFromDate, navAnchor,
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
  /**
   * WHY AN ACCOUNT CARRIES NO VALUATION IS ITS OWN SENTENCE, ROUTED — never one
   * sentence for all of them (MNT-14). The statement copy of the account carries
   * the generated reason; the LIVE copy of one whose depository units are valued
   * carries `partialValuation` instead, and that is what the reader is shown.
   */
  const stmtBook = statementPortfolio ?? portfolio;
  const stmtAccts = accountIndex(stmtBook.accounts);
  const whyOf = (id: string): Why => {
    const live = accts.get(id);
    const stmt = stmtAccts.get(id) ?? live;
    return {
      nil: isMeasuredNilAccount(stmt),
      reason: live?.partialValuation ?? stmt?.noPositionsReason ?? null,
    };
  };
  const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const depositoryRows = portfolio.positions.filter((p) => p.depositoryUnits);
  const depositoryValue = sumOf(depositoryRows.map((p) => p.marketValue));
  const recon: Recon = {
    perAccount: sumOf(cov.covered.map((c) => c.bookValue)) + sumOf(cov.single.map((s) => s.bookValue))
      + sumOf(cov.unvalued.map((u) => u.bookValue)),
    statementBook: stmtBook.totalValue,
    doubleCounted: sumOf(stmtBook.positions.map((p) => p.marketValue)) - stmtBook.totalValue,
    ...reportedTwiceOf(stmtBook.positions),
    current: portfolio.totalValue,
    depositoryValue,
    depositoryCount: depositoryRows.length,
    priceDelta: portfolio.totalValue - stmtBook.totalValue - depositoryValue,
    quotesLive: livePriced > 0,
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
        <ExcludedAccounts cov={cov} nameOf={nameOf} fmt={fmtFromBase} recon={recon} whyOf={whyOf} />
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
  /**
   * THE SERIES IS A STATEMENT LEVEL, SO ITS DENOMINATOR IS THE STATEMENT BOOK
   * (MNT-25). The current value of holdings is on today's prices — AMFI's
   * published NAVs, live quotes where the feed answers, and funds valued from a
   * depository's own units that no statement marks — so it is named beside the
   * statement figure where the two differ, rather than standing in for it.
   */
  const statementBook = stats.consolidatedValue;
  const liveDiffers = Math.abs(portfolio.totalValue - statementBook) > 1;
  const basisHover = [
    bookRet == null
      // Unreachable while the card needs two dated points to render, and it
      // still names its cause rather than printing a bare absence (MNT-23).
      ? `The book's own series over ${bookFrom} → ${bookTo} carries no return: a return needs two dated points of one panel, and the series has ${model.book.length}.`
      : indexRet != null
        ? `Over the book's own window, ${bookFrom} → ${bookTo}: the book ${fmtPct(bookRet, { sign: true })} net of capital flows, ${bench.label} ${fmtPct(indexRet, { sign: true })} over the same dates. Hover the chart for both lines at any date.`
        : `Over the book's own window, ${bookFrom} → ${bookTo}: the book ${fmtPct(bookRet, { sign: true })} net of capital flows. ${indexState === "loading" ? `The ${bench.label} history is still loading.` : `No ${bench.label} line is drawn, so there is no comparison figure.`}`,
    `${model.dates.length} dated points, ${cov.from} → ${cov.to} · ${stats.coveredCount} of ${stats.accountsTotal} accounts, ${fmtFromBase(lastNav, { compact: true })} of the ${fmtFromBase(statementBook, { compact: true })} the statements value${liveDiffers ? ` (the current value of holdings, ${fmtFromBase(portfolio.totalValue, { compact: true })}, is on today's prices)` : ""} · the book and ${bench.label} lines rebased to 100 at ${cov.from}${navAnchor && navAnchor.date !== cov.from ? `; the line with capital left in starts on the book's at ${navAnchor.date}, where the panel is complete` : ""}.`,
    "Each point holds every account at its most recent mark on or before that date, and counts a holding two accounts both report once.",
    panelLast > panelFirst && completeFrom
      // "VALUED AT BOTH OF ITS ENDS" COUNTED A CARRIED MARK AS A VALUATION
      // (MNT-24): the 31 May → 25 Jun step is flat because its four accounts
      // are carried at their 31 May marks, which no statement restated.
      ? `The panel grows from ${panelFirst} to ${panelLast} accounts over the window and is complete from ${completeFrom}. Each step is measured over the accounts in the panel at both of its ends — each held at its most recent mark on or before that date, so a step in which none of them published a new statement is flat — and an account arriving contributes nothing. The dashed NAV line starts where the panel is complete, on the book's own line.`
      : "",
    unproven.length > 0
      // A MOVE, SUMMED OVER THE STEPS — never an account's standing value, and
      // never the largest single step: this printed ₹28.3 Cr, the VALUE of four
      // accounts, beside the ₹2.78 Cr they moved (A-10).
      ? `Not proven to be performance: ${fmtFromBase(unproven.reduce((a, u) => a + u.unreportedFlowValue, 0), { compact: true })} of the move. ${stats.unreportedFlowAccounts.length} covered account(s) — ${stats.unreportedFlowAccounts.map(nameOf).join(", ")} — have a step between two of their marks that no statement settles: no printed capital total at both of its ends, no identical unit counts, no dated record. A subscription or redemption inside such a step would appear in the book's return. Every other step is settled by the statements themselves.`
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
              title={(() => {
                /* WHAT THE CONTROL DRAWS, NOT WHAT ITS LABEL SUGGESTS (MNT-13).
                   A range starts its length BEFORE the book's last statement date
                   and the index then runs to its own latest close — so "1Y" is a
                   year before 13 Aug plus the weeks since, and the hover says so
                   rather than claiming the closes end at the statement. */
                if (r.key === "book") return "The window the book's line covers — its own first to last statement date — with the index drawn over exactly the same dates.";
                const start = bookFrom && bookTo ? rangeStart(r.key, bookFrom, bookTo) : null;
                return start
                  ? `${bench.label} closes from ${start} — ${r.label} before the book's last statement date, ${bookTo} — to the index's own latest close. The book's own line covers only its measured window.`
                  : `Every ${bench.label} close the price service carries, to its latest. The book's own line covers only its measured window.`;
              })()}
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
              /* EACH LINE'S FIGURE NAMES ITS OWN BASE (MNT-12). The book and the
                 index are 100 at the book's first point; the line with capital
                 left in starts on the book's where the panel is complete, so its
                 change is struck from THAT date. Printed bare, a +9.29% from
                 10 Jul sat beside a +5.09% from 31 May as if the two were a pair. */
              formatter={(v: number, name: string) => {
                const isNav = name === NAV_LINE;
                const pct = isNav
                  ? (navAnchor && navAnchor.level > 0 ? (v / navAnchor.level - 1) * 100 : null)
                  : v - 100;
                const since = isNav ? navAnchor?.date : bookFrom;
                return [`${fmtNum(v, 2)}${pct == null || !since ? "" : ` (${fmtPct(pct, { sign: true })} since ${since})`}`, name];
              }} />
            {/* THE LEGEND'S ORDER IS THE READING ORDER, NOT THE PAINT ORDER.
                The book's line is drawn LAST so it sits above the index curve
                (seven points against up to thirteen hundred closes), and a
                legend that followed the children would then lead with the index
                on a card whose subject is the book. The payload is stated so the
                two orders can differ on purpose. */}
            <Legend wrapperStyle={{ fontSize: 11 }} payload={[
              { value: "Book · ex capital flows", type: "line", id: "book", color: BOOK_COLOR },
              ...(showRaw ? [{ value: navAnchor ? `${NAV_LINE} · from ${navAnchor.date}` : NAV_LINE, type: "line" as const, id: "nav", color: NAV_COLOR }] : []),
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
                name={NAV_LINE} connectNulls isAnimationActive={false} />
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

      <ExcludedAccounts cov={cov} nameOf={nameOf} fmt={fmtFromBase} recon={recon} whyOf={whyOf} />
    </Card>
  );
}

/** The three lists set against the current value, one step at a time (MNT-4). */
type Recon = {
  /** Σ of the three lists — each statement's own value, as printed, not deduped. */
  perAccount: number;
  /** The consolidated statement book: each holding two accounts both report counted once. */
  statementBook: number;
  /** Σ of the statement positions as printed less that book — the double count. */
  doubleCounted: number;
  /**
   * THE SAME GAP FROM ITS CAUSE: every row of a `dedupeGroup` after its first,
   * and the holdings they are. The subtraction above says how much; this says
   * which holdings, so the hover can name them rather than infer them — and
   * where the two disagree by more than a rupee, both are printed.
   */
  reportedTwice: number;
  reportedTwiceKeys: string[];
  /** The current value of holdings the top bar shows. */
  current: number;
  /** Cash-equivalent funds valued from a depository's own units — no statement marks them. */
  depositoryValue: number;
  depositoryCount: number;
  /** What published NAVs and live quotes add to the statement marks. */
  priceDelta: number;
  quotesLive: boolean;
};

/** Every row of a `dedupeGroup` after its first: what a per-account sum counts twice. */
function reportedTwiceOf(positions: { dedupeGroup?: string | null; securityKey: string; marketValue: number }[]) {
  const seen = new Set<string>();
  const keys = new Set<string>();
  let reportedTwice = 0;
  for (const p of positions) {
    if (!p.dedupeGroup) continue;
    if (seen.has(p.dedupeGroup)) { reportedTwice += p.marketValue; keys.add(p.securityKey); }
    else seen.add(p.dedupeGroup);
  }
  return { reportedTwice, reportedTwiceKeys: [...keys].sort() };
}

/** An unvalued account's own reason, and whether its statement struck a nil balance. */
type Why = { nil: boolean; reason: string | null };

/**
 * THE OTHER HALF OF THE ASK — "or state the accounts that cannot supply one".
 *
 * Two lists, kept apart because they send a reader to two different places: an
 * account publishing ONE dated valuation needs its next monthly statement, and
 * an account publishing NONE needs a fund that values it at all. Folding them
 * into one "not covered" count would hide which is which.
 */
function ExcludedAccounts({ cov, nameOf, fmt, recon, whyOf }: {
  cov: typeof BOOK_NAV_COVERAGE;
  nameOf: (id: string) => string;
  fmt: (n: number | null | undefined, o?: { compact?: boolean; sign?: boolean }) => string;
  recon: Recon;
  whyOf: (id: string) => Why;
}) {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  if (!cov.single.length && !cov.unvalued.length) return null;
  const c = (n: number, sign = false) => fmt(n, { compact: true, sign });
  const nils = cov.unvalued.filter((u) => whyOf(u.accountId).nil).length;
  /**
   * THE FOOTER RECONCILES, STEP BY STEP, AND THE STEPS ARE COMPUTED (MNT-4).
   *
   * It used to say the lists' sum is ABOVE the current value "by the value two
   * members both report". That was one step of four, and on this drop the sum
   * is ₹63 Cr BELOW it: the current value is the statement book on the live
   * layer — AMFI's published NAVs, any live quote, and cash-equivalent funds
   * valued from a depository's own units, which no statement marks. Naming one
   * cause for a gap made of several is the wrong-diagnosis failure, so each
   * step is printed with its own figure and the sign is the arithmetic's.
   */
  const dedupeTies = Math.abs(recon.perAccount - (recon.statementBook + recon.doubleCounted)) <= 1;
  // …AND THE GAP IS NAMED FROM ITS CAUSE, the holdings two accounts both
  // report, not only inferred by subtraction; where the two disagree by more
  // than a rupee both are printed rather than one assumed.
  const nTwice = recon.reportedTwiceKeys.length;
  const holdingsTwice = `${nTwice} holding${nTwice === 1 ? "" : "s"}, each on two accounts' statements`;
  const causeTies = Math.abs(recon.doubleCounted - recon.reportedTwice) <= 1;
  const liveSteps = [
    Math.abs(recon.priceDelta) > 1
      ? `${c(recon.priceDelta, true)} from ${recon.quotesLive ? "AMFI's published NAVs and live quotes" : "AMFI's published NAVs"} over the statement marks`
      : null,
    recon.depositoryValue > 1
      ? `${c(recon.depositoryValue)} of ${recon.depositoryCount} cash-equivalent fund${recon.depositoryCount === 1 ? "" : "s"} valued from a depository's own closing units at AMFI's NAV — holdings no statement marks`
      : null,
  ].filter(Boolean);
  const addsShort = [
    Math.abs(recon.priceDelta) > 1 ? (recon.quotesLive ? "published NAVs and live quotes" : "the published NAVs") : null,
    recon.depositoryValue > 1 ? "funds no statement marks" : null,
  ].filter((x): x is string => !!x);
  const footHover = [
    `As each statement prints them, the three lists sum to ${fmt(recon.perAccount)} — a per-account sum, which does not dedupe.`,
    dedupeTies && causeTies
      ? nTwice === 0
        ? `No holding is reported by two accounts, so the lists and the consolidated statement book agree, ${fmt(recon.statementBook)}.`
        : `Counting once the ${fmt(recon.doubleCounted)} that two accounts both report gives the consolidated statement book, ${fmt(recon.statementBook)}; that is ${holdingsTwice}.`
      : `The consolidated statement book is ${fmt(recon.statementBook)}; the lists differ from it by ${fmt(recon.perAccount - recon.statementBook, { sign: true })}, and ${fmt(recon.reportedTwice)} of that is ${holdingsTwice}.`,
    liveSteps.length
      ? `The current value of holdings, ${fmt(recon.current)}, is that book plus ${liveSteps.join(", and ")}.`
      : `The current value of holdings is that book, ${fmt(recon.current)}.`,
  ].join(" ");
  return (
    <details className="mt-3 rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2" data-testid="nav-excluded">
      {/* THE SPLIT IS THE SUMMARY'S HOVER (Stage 10cp). "36 accounts cannot
          supply a series" is one fact; "23 publish one valuation and 13 publish
          none" is two, and they send a reader to two different places — a next
          monthly statement, or a fund that values the folio at all — so a reader
          who never opens the details can still read both off the summary. */}
      <summary className="cursor-pointer text-[11.5px] text-slate-400"
        title={`The ${cov.single.length + cov.unvalued.length} accounts that cannot supply a series: ${cov.single.length} publish exactly one dated valuation, ${cov.unvalued.length} carry no valued holding. The figure is their value as their statements print them — a per-account sum. Open to see each one named.`}>
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
          {/* ONE SENTENCE THAT IS TRUE OF ALL OF THEM (MNT-14), in the label's
              hover since Stage 10cp moved the lines that explain a card there.
              The kinds-list it replaced named five kinds of account, left out
              the custody accounts a face value prices and called the redeemed
              ones an absence. Each row carries its own account's reason. The
              face said "publish no valuation at all" over two rows whose own
              statement struck a nil; "carry no valued holding" is true of every
              row, the redeemed ones included. */}
          <div className="label-xs" data-nav-unvalued-why
            title={`None of these carries a valued holding, so none can start a series — each row names its own account's reason${nils > 0 ? `, and ${nils === 1 ? "a redeemed account shows" : `the ${nils} redeemed accounts show`} the nil balance ${nils === 1 ? "its" : "their"} statement struck` : ""}.`}>
            {cov.unvalued.length} carry no valued holding
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-400" data-testid="nav-unvalued-list">
            {/* A DASH WHERE NOTHING VALUES THE ACCOUNT, AND ₹0 WHERE ITS OWN
                STATEMENT STRUCK A NIL BALANCE. §2: a measured zero and an absent
                measurement must never look the same — and two of these accounts
                are the first kind, redeemed to nil on their own holdings
                statement, which the dash and its "absent valuation" hover used
                to deny. The reason is the account's own, routed, never written
                here (`whyOf`). */}
            {cov.unvalued.map((u) => {
              const why = whyOf(u.accountId);
              return (
                <li key={u.accountId} className="flex justify-between gap-3"
                  data-nav-unvalued={u.accountId} data-nav-nil={why.nil ? "1" : "0"}>
                  <span className="truncate" title={u.accountId}>{nameOf(u.accountId)} · {u.accountNo}</span>
                  {why.nil ? (
                    <span className="shrink-0 tabular text-slate-400" title={why.reason ?? undefined}>
                      {fmt(0)} · redeemed
                    </span>
                  ) : (
                    <span className="shrink-0 tabular">
                      <AbsentCell reason={why.reason ?? "no statement in this drop values this account, so it cannot start a series"} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {/* THE FIGURE ON ITS FACE, THE RECONCILIATION IN ITS HOVER (Stage 10cp).
          The hover is MNT-4's reconciliation, and it is not "the lists sum to
          more than the current value": on the live book the current value is
          ABOVE the per-account sum, by the published NAV and the depository's
          cash funds, and BELOW it only by the double count. */}
      <p className="mt-3 border-t border-ink-700 pt-2 text-[11px] text-slate-500" data-testid="nav-excluded-recon"
        data-per-account={recon.perAccount} data-statement-book={recon.statementBook} data-current={recon.current}
        data-reported-twice={recon.reportedTwice} data-reported-twice-keys={recon.reportedTwiceKeys.join(" ")}
        title={footHover}>
        All three lists · {c(recon.perAccount)}
      </p>
    </details>
  );
}
