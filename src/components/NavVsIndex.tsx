import { useNavigationValue, nullableStringNavigation, nullableStringsNavigation } from "@/lib/useNavigationState";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Card } from "@/components/Card";
import { AbsentSection, AbsentCell } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { wholeFamilyOnly } from "@/lib/memberScope";
import { WHOLE_BOOK_NAV, WHOLE_BOOK_STARTS, BOOK_NAV_UNITS } from "@/lib/bookNavBook";
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { shareCandidates } from "@/lib/depositoryShares";
import { useMarketHistories } from "@/lib/useMarketReturns";
import { assumedHoldingBook } from "@/lib/assumedHoldingBook";
import { assumedBookNav, dematHoldings, ASSUMED_KEY, type DematHolding } from "@/lib/assumedBookNav";
import { holdingAssumptionText } from "@/lib/assumedHoldingReturns";
import { bookNavStats, type BookNavCoverage, type BookNavStats, type BookNavUnitCoverage } from "@/lib/bookNav";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { navIndexSeries, isMeasuredNilAccount } from "@/lib/navSeries";
import { changeSince, lineReturn } from "@/lib/benchCompare";
import { fetchPriceHistory, toPoints } from "@/lib/prices";
import type { Point } from "@/lib/series";
import { BENCHMARKS, benchmarkIdentity, benchmarkMismatchReason, type BenchmarkKey } from "@/lib/benchmarks";
import { fmtPct, fmtDate, changeColor } from "@/lib/format";
import { chartTooltipStyle, chartTooltipLabelStyle } from "@/lib/chartTheme";

// ── OUR BOOK AGAINST EVERY BENCHMARK, ON ONE CHART (Stage 10iv) ─────────────
//
// *"make it more simple to compare on the same graph across all benchmarks no
// verbose"* — the family, 28 Oct 2026, over a 1Y chart whose book line was the
// pale "still joining" stretch end to end.
//
// WHAT THE AUDIT FOUND, AND WHAT CHANGED:
//
//  · THE BOOK'S SOLID LINE HAD SHRUNK TO ONE POINT. It was drawn only from the
//    day every valued investment is in the return (`returnCompleteFrom`). Bandhan
//    8652064 (₹41.5 Cr, no 31 Mar value) is first valued on 26 Oct, the series'
//    last day, so the whole line became the lighter stretch, the dashed NAV line
//    was a single point listed in the legend, and no book return was stated at
//    all. The book is now ONE line: the time-weighted return over the investments
//    valued at both ends of each step, labelled "available data" with what it
//    covers on its chip's hover — the family's rule for Morning CIO's return
//    cards (Stages 10gh, 10gm).
//  · NEITHER LINE STARTED AT ZERO on 3M or 6M: the index was rebased at the
//    book's first point whatever period was picked. Every line is now its change
//    since the period's first day (`changeSince`), to the book's latest
//    valuation — the index no longer runs past it.
//  · THE ROLLING PERIODS COMPARED OLD VALUES WITH NEW PRICES. Nothing in the
//    31 Mar panel was revalued in April, so "6M" from 26 Apr started the book on
//    its 31 Mar value and the index on 26 Apr's, after a ~10% rally — the book
//    read +5.3% against the Nifty 500's −4.3%. 1Y–Max drew months of index
//    before the book has any value. A period now starts only on a date the book
//    was valued on (`comparableStarts`): today, 31 Mar 2026 alone.
//  · Every benchmark has a chip, in its fixed colour, with its return over the
//    same dates; a chip adds or removes its line. *"show only the book and Nifty
//    500 by default; other indices added by clicking"* — the family, 30 Oct 2026
//    (Stage 10jg), over a chart of eight lines.

/** The benchmarks drawn until the reader changes them. */
const DEFAULT_SHOWN: readonly BenchmarkKey[] = ["nifty-500"];

const BOOK_COLOR = "var(--chart-book, #d9c48f)";
const GRID_COLOR = "var(--chart-grid, #2b2668)";
const AXIS_COLOR = "var(--chart-axis, #6b6880)";

const DAY = 86400000;
/** A valuation older than this at the line's end is named as carried, not measured. */
const STALE_DAYS = 90;
const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * ONE TICK PER PERIOD, TAKEN FROM THE DATES THAT EXIST — several ticks inside
 * one year shortened to the year print "2023 2023 2024".
 */
function axisTicks(dates: string[], spanDays: number): { ticks: number[]; fmt: (t: number) => string } {
  const period = spanDays > 365 * 2.5 ? "year" : spanDays > 200 ? "quarter" : spanDays > 75 ? "month" : "day";
  const fmt = period === "year"
    ? (t: number) => iso(t).slice(0, 4)
    : period === "day"
      ? (t: number) => iso(t).slice(5)
      : (t: number) => iso(t).slice(0, 7);
  const keyOf = (d: string) =>
    period === "year" ? d.slice(0, 4)
      : period === "quarter" ? `${d.slice(0, 4)}Q${Math.floor(Number(d.slice(5, 7)) / 3.01) + 1}`
        : period === "month" ? d.slice(0, 7)
          : `${d.slice(0, 7)}W${Math.floor((Number(d.slice(8, 10)) - 1) / 7)}`;
  const firsts: string[] = [];
  let last = "";
  for (const d of dates) {
    const k = keyOf(d);
    if (k !== last) { firsts.push(d); last = k; }
  }
  const stride = Math.max(1, Math.ceil(firsts.length / 10));
  return { ticks: firsts.filter((_, i) => i % stride === 0).map(ts), fmt };
}

/**
 * EACH BENCHMARK'S HISTORY, IN ONE OF FOUR STATES. `mismatch` is the service
 * answering for a DIFFERENT instrument than the benchmark declares — a real
 * figure about the wrong market — so it draws no line and names what answered.
 */
type BenchLoad =
  | { state: "loading" }
  | { state: "ok"; points: Point[] }
  | { state: "down" }
  | { state: "mismatch"; reportedName: string | null };

const pctText = (v: number | null | undefined) => fmtPct(v, { sign: true, decimals: 1 });
/** The reason most demat holdings give for not being valued at published closes — the one that names what to fix. */
const topReason = (holdings: readonly DematHolding[]): string | null => {
  const count = new Map<string, number>();
  for (const h of holdings) if (h.reason && !h.pending) count.set(h.reason, (count.get(h.reason) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
/** `holdingAssumptionText`, for the several owners one line carries. */
const assumptionText = (owners: readonly string[]) => owners.length <= 1
  ? holdingAssumptionText(owners[0])
  : `No sale appears in the records we have. We assume ${owners.slice(0, -1).join(", ")} and ${owners.at(-1)} still hold these shares.`;
const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function NavVsIndex() {
  const { portfolio, statementPortfolio, fmtFromBase, livePriced, scope, corporateActions, corporateActionsStatus } = usePortfolio();
  /**
   * ── THE DEMATS' LISTED SHARES AT EACH DAY'S PUBLISHED CLOSE (Stage 10iz) ──
   * *"mark listed demat holdings at historical prices in the book line."* Their
   * public histories come through the loader the Returns tab shares, and the
   * family's assumed-continued-ownership rule decides each holding
   * (`assumedBookNav`). The line switches to that series only once every demat
   * history has answered and the split and dividend records are in: a line that
   * moved as each price landed would move under the reader.
   */
  const dematRows = useMemo(() => dematHoldings(BOOK_ACCOUNTS, BOOK_POSITIONS, shareCandidates()), []);
  const dematFeed = useMarketHistories(dematRows);
  const assumed = useMemo(() => corporateActionsStatus === "loading" ? null : assumedBookNav({
    units: BOOK_NAV_UNITS, series: WHOLE_BOOK_NAV, accounts: BOOK_ACCOUNTS, holdings: dematRows,
    book: assumedHoldingBook({ actions: corporateActions, instruments: dematFeed.instruments, histories: dematFeed.histories }),
  }), [dematRows, corporateActions, corporateActionsStatus, dematFeed.instruments, dematFeed.histories]);
  const useAssumed = !!assumed && assumed.pending === 0 && assumed.assumedCount > 0;
  const series = useAssumed && assumed ? assumed.series : WHOLE_BOOK_NAV;
  const seriesStarts = useAssumed && assumed ? assumed.starts : WHOLE_BOOK_STARTS;
  /** The comparison's first day — one of the dates the book can be compared from; the first by default. */
  const [startPick, setStart] = useNavigationValue<string | null>("nav-start", null, nullableStringNavigation);
  /** The benchmarks on the chart: `DEFAULT_SHOWN` until a chip changes them; an empty list is the book alone. */
  const [shownList, setShown] = useNavigationValue<string[] | null>("nav-shown", null, nullableStringsNavigation);
  const shownKeys = useMemo(() => new Set<string>(shownList ?? DEFAULT_SHOWN), [shownList]);
  const [loads, setLoads] = useState<Record<BenchmarkKey, BenchLoad>>(
    () => Object.fromEntries(BENCHMARKS.map((b) => [b.key, { state: "loading" }])) as Record<BenchmarkKey, BenchLoad>);

  useEffect(() => {
    let alive = true;
    // EVERY BENCHMARK THROUGH `/api/prices`, each checked by the name the
    // service reports before a close is drawn (`benchmarkIdentity`).
    for (const b of BENCHMARKS) {
      void fetchPriceHistory(b.symbol).then((r) => {
        if (!alive) return;
        let next: BenchLoad;
        if (!r.ok) next = { state: "down" };
        else {
          const id = benchmarkIdentity(r, b);
          next = id.ok ? { state: "ok", points: toPoints(r) } : { state: "mismatch", reportedName: id.reportedName };
        }
        setLoads((cur) => ({ ...cur, [b.key]: next }));
      });
    }
    return () => { alive = false; };
  }, []);

  const model = useMemo(() => {
    if (!portfolio) return null;
    // A MEMBER SCOPE EMPTIES `navHistory`; the card says whole family only below.
    const book = navIndexSeries(portfolio.navHistory.length ? series.points : []);
    const cov = series.coverage;
    const stats = bookNavStats(cov);
    const dates = book.map((p) => p.date);
    const bookFrom = dates[0] ?? null;
    const bookTo = dates[dates.length - 1] ?? null;
    if (!bookFrom || !bookTo || book.length < 2) return { book, cov, stats, dates, bookFrom, bookTo, ready: false as const, stale: [] as BookNavUnitCoverage[] };

    // A STORED START THE BOOK NO LONGER OFFERS OPENS ON ITS FIRST DAY.
    const starts = seriesStarts.filter((d) => d >= bookFrom && d < bookTo);
    const from = startPick && starts.includes(startPick) ? startPick : starts[0] ?? bookFrom;
    const to = bookTo;

    const bookLine = changeSince(book.map((p) => ({ t: p.date, v: p.index })), from, to);
    const bookRet = bookLine.length > 1 ? lineReturn(bookLine) : null;
    // A dot only where a STATEMENT valued something — the series also has a
    // point on every date capital moved, and on every close a demat is valued
    // at, and a dot on each would read as statements.
    const valuedOn = new Set(portfolio.navHistory.filter((p) => (p.accountsOnDate ?? 0) > 0).map((p) => p.date));

    const benches = BENCHMARKS.map((b) => {
      const load = loads[b.key];
      const line = load.state === "ok" ? changeSince(load.points, from, to) : [];
      return { b, load, line, ret: line.length > 1 ? lineReturn(line) : null, lastClose: line.at(-1)?.t ?? null };
    });

    // ONE ROW PER DATE ANY LINE HAS, each line's own value where it has one
    // (the line is drawn through its own points) and its latest value on or
    // before the date for the tooltip, so a hover on a weekend still reads
    // every line.
    const drawn = [
      { key: "book", line: bookLine },
      ...benches.filter((x) => shownKeys.has(x.b.key)).map((x) => ({ key: x.b.key as string, line: x.line })),
    ];
    const allDates = [...new Set(drawn.flatMap((d) => d.line.map((p) => p.t)))].sort();
    const at = drawn.map((d) => ({ key: d.key, by: new Map(d.line.map((p) => [p.t, p.v])), sorted: d.line }));
    const cursor = new Map<string, number>(drawn.map((d) => [d.key, 0]));
    const rows = allDates.map((d) => {
      const row: Record<string, number | string | boolean | null> = { t: ts(d), date: d, valued: valuedOn.has(d) };
      for (const a of at) {
        row[a.key] = a.by.has(d) ? Number((a.by.get(d) as number).toFixed(3)) : null;
        let i = cursor.get(a.key) as number;
        while (i < a.sorted.length - 1 && a.sorted[i + 1].t <= d) i++;
        cursor.set(a.key, i);
        row[`carry:${a.key}`] = a.sorted[i] && a.sorted[i].t <= d ? a.sorted[i].v : null;
      }
      return row;
    });
    // HOW FRESH THE BOOK'S LINE IS: every investment is held at its latest
    // valuation until the next, so value last valued long before the line's end
    // is carried, not measured, over that stretch.
    const staleCut = iso(ts(to) - STALE_DAYS * DAY);
    const stale = stats.inReturn
      .filter((u) => u.lastValued != null && u.lastValued < staleCut && (u.endValue ?? 0) > 0)
      .sort((a, b) => (b.endValue ?? 0) - (a.endValue ?? 0));
    const spanDays = (ts(to) - ts(from)) / DAY;
    const { ticks, fmt: tickFmt } = axisTicks(allDates, spanDays);
    return { book, cov, stats, dates, bookFrom, bookTo, ready: true as const, from, to, bookLine, bookRet, benches, rows, ticks, tickFmt, stale, starts };
  }, [portfolio, loads, startPick, shownKeys, series, seriesStarts]);

  if (!model || !portfolio) return null;
  const { stats, cov } = model;
  // NAMED FROM THE REGISTRY, NOT FROM THE ID (§2).
  const accts = accountIndex(portfolio.accounts);
  const nameOf = (id: string) => {
    const a = accts.get(id);
    if (!a) return id;
    const owner = a.ownerId ? ownerDisplayName(a.ownerId) : a.owner;
    return `${a.provider}${owner ? ` · ${owner}` : ""}`;
  };
  /**
   * AN INVESTMENT IS AN ACCOUNT, OR ONE LINE OF THE REVIEW'S HOLDER BUCKETS —
   * named by its line there, because "Consolidated review · Ajay" is six
   * separate companies (Stage 10dh).
   */
  const stmtBook = statementPortfolio ?? portfolio;
  const lineName = new Map(stmtBook.positions.map((p) => [`${p.accountId}|${p.securityKey}`, p.security]));
  const unitName = (u: { accountId: string; securityKey: string | null; key: string }) => {
    const a = accts.get(u.accountId);
    const line = u.securityKey ? lineName.get(`${u.accountId}|${u.securityKey}`) ?? u.securityKey : null;
    if (a?.reviewHolder && line) return `${line} · ${a.ownerId ? ownerDisplayName(a.ownerId) : a.owner}`;
    // Two folios of one fund under one member read alike without their number,
    // and a demat's shares at published closes read apart from its other holdings.
    return `${nameOf(u.accountId)}${a?.accountNo ? ` · ${a.accountNo}` : ""}${u.key.endsWith(ASSUMED_KEY) ? " · listed shares at published closes" : ""}`;
  };
  /** Why an account carries no valuation is its own sentence, routed (MNT-14). */
  const stmtAccts = accountIndex(stmtBook.accounts);
  const whyOf = (id: string): Why => {
    const live = accts.get(id);
    const stmt = stmtAccts.get(id) ?? live;
    return {
      nil: isMeasuredNilAccount(stmt),
      reason: live?.partialValuation ?? stmt?.noPositionsReason ?? null,
    };
  };
  // The accounts no investment in the series stands for, off the registry.
  const inSeries = new Set(stats.holding.map((u) => u.accountId));
  const unvalued = stmtBook.accounts
    .filter((a) => !inSeries.has(a.accountId))
    .filter((a) => !stmtBook.positions.some((p) => p.accountId === a.accountId && Math.abs(p.marketValue) >= 1000))
    .map((a) => ({ accountId: a.accountId, accountNo: a.accountNo }));
  const depositoryRows = portfolio.positions.filter((p) => p.depositoryUnits);
  const depositoryValue = sumOf(depositoryRows.map((p) => p.marketValue));
  const recon: Recon = {
    perAccount: sumOf(stmtBook.positions.map((p) => p.marketValue)),
    statementBook: stmtBook.totalValue,
    doubleCounted: sumOf(stmtBook.positions.map((p) => p.marketValue)) - stmtBook.totalValue,
    ...reportedTwiceOf(stmtBook.positions),
    current: portfolio.totalValue,
    depositoryValue,
    depositoryCount: depositoryRows.length,
    priceDelta: portfolio.totalValue - stmtBook.totalValue - depositoryValue,
    quotesLive: livePriced > 0,
    levelEnd: cov.levelEnd,
    // The statement series' own steps; the demats' published closes are a step of their own.
    newerMarks: WHOLE_BOOK_NAV.coverage.newerMarks,
    capitalAfter: WHOLE_BOOK_NAV.coverage.capitalAfterLastValuation,
    assumedDelta: useAssumed ? cov.levelEnd - WHOLE_BOOK_NAV.coverage.levelEnd : 0,
    seriesTo: cov.to,
  };
  const stale = model.stale;
  const staleValue = sumOf(stale.map((u) => u.endValue ?? 0));
  const coverage = <SeriesCoverage stats={stats} cov={cov} unitName={unitName} nameOf={nameOf} fmt={fmtFromBase} recon={recon} whyOf={whyOf} unvalued={unvalued} staleValue={staleValue}
    demat={useAssumed && assumed ? assumed.holdings : null} />;

  // THE SERIES IS THE WHOLE FAMILY'S, AND A MEMBER SCOPE SAYS SO (Stage 10di).
  if (scope.selected) {
    return (
      <Card className="flex flex-col" title="Our book vs benchmarks">
        <div data-nav-scope-absent>
          <AbsentSection what={`Whole family only · not shown for ${scope.label}`}
            needs={wholeFamilyOnly("The dated NAV series", scope.label)} />
        </div>
      </Card>
    );
  }
  if (!model.ready) {
    return (
      <Card className="flex flex-col" title="Our book vs benchmarks">
        <AbsentSection
          what="Nothing in this book is valued on two dates"
          needs={`A NAV series needs the book valued at two or more dates. ${stats.holding.length} investment(s) hold value and none of them carries a second dated valuation or a dated payment inside the window, so there is nothing to chain. The next monthly reissue of any statement already in the archive starts one.`} />
        {coverage}
      </Card>
    );
  }

  const { from, to, bookRet, benches, rows, ticks, tickFmt, starts } = model;
  const c = (n: number | null | undefined) => fmtFromBase(n, { compact: true });
  const lastNav = model.book[model.book.length - 1].nav;
  const statementBook = stmtBook.totalValue;
  const liveDiffers = Math.abs(portfolio.totalValue - statementBook) > 1;

  /**
   * ── WHAT THE BOOK'S LINE COVERS, ON ITS CHIP ─────────────────────────────
   * Available data, as on Morning CIO's return cards: what is in it, what joined
   * late, what is left out and why, and how old the oldest valuations it carries
   * are — each counted off the series' own units, never typed.
   */
  const joinedDates = [...new Set(stats.joinedLater.map((u) => u.returnFrom as string))].sort();
  // Over the window's own points, so the hover neither widens nor narrows the line it describes.
  const inWindow = series.points.filter((p) => p.date > from && p.date <= to);
  const unprovenMove = sumOf(inWindow.map((p) => p.unreportedFlowValue ?? 0));
  const moneyIn = sumOf(inWindow.map((p) => Math.max(p.levelFlowIn ?? 0, 0)));
  const moneyOut = sumOf(inWindow.map((p) => Math.min(p.levelFlowIn ?? 0, 0)));
  /**
   * THE ASSUMPTION, NAMED BY OWNER (the family's rule, 22 Oct 2026): what was
   * valued at published closes, from when, whose shares they are, and what
   * stays at its statement value — or, before the series switches, why not yet.
   */
  const dematStatus = dematRows.length === 0 ? "" : useAssumed && assumed
    ? (() => {
      const kept = assumed.holdings.filter((h) => h.status === "statement");
      const out = assumed.holdings.filter((h) => h.status === "left-out");
      const others = [
        kept.length ? `${kept.length} stay at their statement values (${c(sumOf(kept.map((h) => h.value)))})` : "",
        out.length ? `${out.length} no statement values ${out.length === 1 ? "is" : "are"} in neither line` : "",
      ].filter(Boolean).join(" and ");
      return `Listed demat shares: ${assumed.assumedCount} holdings, ${c(assumed.assumedValue)} on ${fmtDate(to)}, are valued at each day's published close from their statement dates, with splits applied and gross dividends counted on their ex-dates. ${assumptionText(assumed.owners)}${others ? ` Of the other demat holdings, ${others}, each for its reason in the list below.` : ""}`;
    })()
    : `Listed demat shares are at their statement values: ${
      corporateActionsStatus === "loading" ? "the split and dividend records are still loading."
        : assumed && assumed.pending > 0 ? `${assumed.pending} published price histories are still loading.`
          : `no holding could be valued at published closes. ${topReason(assumed?.holdings ?? []) ?? "No published price history could be checked for them."}`}`;
  const dematSentence = dematStatus;
  const bookHover = [
    "Our book: the change in value net of money added or taken out (time-weighted), from the statements — a deposit is never counted as a gain.",
    moneyIn > 0 || moneyOut < 0
      ? `Over the period ${c(moneyIn)} went in and ${c(-moneyOut)} came out; neither is counted as gain or loss.`
      : "",
    `Available data: ${stats.inReturn.length} of the ${stats.holding.length} investments holding value, ${c(stats.inReturnValue)} of the ${c(lastNav)} NAV on ${fmtDate(cov.to ?? to)}${liveDiffers ? ` (today's prices value the holdings at ${c(portfolio.totalValue)})` : ""}.`,
    stats.atCost.length
      ? `Left out: ${stats.atCost.length} private lines held at cost, ${c(stats.atCostValue)} — cost is not a valuation.`
      : "",
    stats.joinedLater.length
      ? `${stats.joinedLater.length} joined on their first valuation (${joinedDates.map(fmtDate).join(", ")}) and count only from then.`
      : "",
    "Each investment is held at its latest valuation until the next, and a holding two accounts both report is counted once.",
    staleValue > 0
      ? `${c(staleValue)} of it was last valued more than three months before ${fmtDate(to)} (${stale.slice(0, 3).map((u) => `${unitName(u)}, ${u.lastValued ? fmtDate(u.lastValued) : "—"}`).join("; ")}${stale.length > 3 ? `; ${stale.length - 3} more` : ""}).`
      : "",
    unprovenMove > 0
      ? `Not proven to be performance: ${c(unprovenMove)} of the move, where no record settles the capital between two valuations (${stats.unproven.map(unitName).join(", ")}).`
      : "",
    dematSentence,
    bookRet != null ? `${fmtDate(from)} → ${fmtDate(to)}: ${pctText(bookRet)}, not annualised.` : "",
  ].filter(Boolean).join("\n\n");

  const basisHover = [
    `Every line is its change since ${fmtDate(from)}, to ${fmtDate(to)} — the book's latest valuation — so every figure covers the same dates. Not annualised.`,
    `A comparison starts only on a day the book was valued: a later start would carry gains from before it into the period${starts.length > 1 ? "" : `, and today ${fmtDate(from)} is the one such day`}.`,
    `${stats.inReturn.length} of the ${stats.holding.length} investments holding value in the return; ${model.dates.length} dated points, ${model.bookFrom} → ${model.bookTo}.`,
    "Benchmarks are price indices (dividends are not in them), from the live price service, each checked by the name the service reports. Click one to add it to the chart or take it off.",
  ].join("\n\n");

  const toggle = (key: string) => setShown((cur) => {
    const set = new Set<string>(cur ?? DEFAULT_SHOWN);
    if (set.has(key)) set.delete(key); else set.add(key);
    return [...set];
  });
  const chipBase = "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors";
  const Swatch = ({ color, thick }: { color: string; thick?: boolean }) => (
    <span aria-hidden className={`inline-block w-3 rounded-full ${thick ? "h-[3px]" : "h-[2px]"}`} style={{ background: color }} />
  );

  return (
    <Card className="flex flex-col"
      title={
        <span data-testid="nav-basis" title={basisHover} className="cursor-help">
          Our book vs benchmarks
        </span>
      }
      right={
        <div className="flex flex-wrap items-center justify-end gap-2" data-testid="nav-range" data-nav-starts={starts.join(" ")}>
          {starts.length > 1 && (
            <div role="tablist" aria-label="Compare from"
              className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
              {[...starts].reverse().map((d) => (
                <button key={d} type="button" role="tab" aria-selected={from === d} data-start={d}
                  onClick={() => setStart(d)} title={`${fmtDate(d)} → ${fmtDate(to)}`}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    from === d ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
                  }`}>
                  Since {fmtDate(d)}
                </button>
              ))}
            </div>
          )}
          <span className="text-[11px] text-slate-500 tabular" data-testid="nav-window">
            {fmtDate(from)} → {fmtDate(to)}
          </span>
        </div>
      }>

      {/* ── ONE CHIP PER LINE: its colour, its name, its return over the window ──
          The book's chip leads and cannot be hidden; a benchmark's chip adds or
          removes its line. Keyed `data-nav-line` / `data-bench`, so a claim about
          what the card offers is struck on keys, never on labels. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="nav-legend"
        data-nav-from={from} data-nav-to={to}>
        <span className={`${chipBase} cursor-help border-ink-600 bg-ink-800/60 text-slate-300`}
          data-nav-line="book" data-nav-ret={bookRet ?? ""} data-testid="nav-book-chip" title={bookHover}
          data-nav-basis={useAssumed ? "assumed" : "statement"}
          data-nav-assumed-count={useAssumed && assumed ? assumed.assumedCount : 0}
          data-nav-assumed-value={useAssumed && assumed ? assumed.assumedValue : 0}>
          <Swatch color={BOOK_COLOR} thick />
          <span className="font-medium">Our book</span>
          <span className={`tabular font-semibold ${changeColor(bookRet)}`}>{pctText(bookRet)}</span>
          <span className="text-slate-500">available data{useAssumed && " · assumed holdings"}</span>
        </span>
        {/* A PRICE HISTORY THAT FAILED TO LOAD IS RETRIED HERE, never left
            pinning its shares to the statement for the rest of the visit. */}
        {assumed && assumed.holdings.some((h) => h.retry) && (
          <button type="button" data-testid="nav-demat-retry" onClick={() => dematFeed.retry()}
            title={`${assumed.holdings.filter((h) => h.retry).length} demat price histories could not load; their shares stay at their statement values until they do.`}
            className={`${chipBase} border-ink-700 bg-ink-800/60 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200`}>
            Retry demat prices
          </button>
        )}
        {benches.map(({ b, load, ret, lastClose }) => {
          const shown = shownKeys.has(b.key);
          const why = load.state === "down"
            ? `The ${b.name} history could not be fetched — the price service did not answer. It runs on the deployed site, not in local preview.`
            : load.state === "mismatch" ? benchmarkMismatchReason(b, load.reportedName)
              : load.state === "loading" ? `Loading the ${b.name} history.` : null;
          const vsBook = ret != null && bookRet != null ? bookRet - ret : null;
          return (
            <button key={b.key} type="button" aria-pressed={shown} onClick={() => toggle(b.key)}
              data-nav-line={b.key} data-bench={b.key} data-bench-symbol={b.symbol} data-bench-state={load.state}
              data-nav-ret={ret ?? ""}
              title={why ? `${why}\n\n${b.title}` : `${b.title}\n\n${fmtDate(from)} → ${fmtDate(lastClose ?? to)}: ${pctText(ret)}${vsBook != null ? `; our book ${vsBook >= 0 ? "+" : "−"}${Math.abs(vsBook).toFixed(1)} points against it` : ""}.`}
              className={`${chipBase} border-ink-700 bg-ink-800/60 hover:bg-ink-700/60 ${shown ? "text-slate-300" : "text-slate-400 opacity-50"}`}>
              <Swatch color={b.color} />
              <span>{b.label}</span>
              <span className={`tabular font-semibold ${changeColor(ret)}`}>
                {load.state === "loading" ? "…" : pctText(ret)}
              </span>
            </button>
          );
        })}
      </div>

      {/* A DEFINITE HEIGHT: `ResponsiveContainer height="100%"` inside a flex
          item measured 0 and drew no SVG at all (see the `nav-chart` probe). */}
      <div className="h-[22rem]" data-testid="nav-chart" data-nav-from={from} data-nav-to={to}
        data-bench-ok={benches.filter((x) => x.load.state === "ok").length}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
              ticks={ticks} tickFormatter={tickFmt} minTickGap={16}
              stroke={AXIS_COLOR} fontSize={11} />
            {/* PER CENT SINCE THE PERIOD'S FIRST DAY — a change, never an amount. */}
            <YAxis stroke={AXIS_COLOR} fontSize={11} width={48} domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
            <ReferenceLine y={0} stroke={AXIS_COLOR} strokeDasharray="3 3" strokeOpacity={0.6} />
            <Tooltip content={({ active: on, payload }) => {
              const row = on ? (payload?.[0]?.payload as Record<string, number | string | null> | undefined) : undefined;
              if (!row) return null;
              const items = [
                { key: "book", label: "Our book", color: BOOK_COLOR },
                ...benches.filter((x) => shownKeys.has(x.b.key) && x.line.length).map((x) => ({ key: x.b.key as string, label: x.b.label, color: x.b.color })),
              ].map((x) => ({ ...x, v: row[`carry:${x.key}`] as number | null }))
                .filter((x) => x.v != null)
                .sort((a, b) => (b.v as number) - (a.v as number));
              return (
                <div style={{ ...chartTooltipStyle, padding: "8px 10px" }}>
                  <div style={chartTooltipLabelStyle}>{fmtDate(String(row.date))}</div>
                  {items.map((x) => (
                    <div key={x.key} className="mt-1 flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5"><Swatch color={x.color} thick={x.key === "book"} />{x.label}</span>
                      <span className="tabular font-semibold">{pctText(x.v)}</span>
                    </div>
                  ))}
                </div>
              );
            }} />
            {benches.filter((x) => shownKeys.has(x.b.key) && x.line.length).map(({ b }) => (
              <Line key={b.key} type="linear" dataKey={b.key} stroke={b.color} strokeWidth={1.5} dot={false}
                name={b.label} connectNulls isAnimationActive={false} />
            ))}
            {/* DRAWN LAST SO IT SITS ON TOP — the card's subject. A dot only where
                something was valued. */}
            <Line type="linear" dataKey="book" stroke={BOOK_COLOR} strokeWidth={2.6}
              dot={(p: { cx?: number; cy?: number; payload?: Record<string, unknown>; index?: number }) =>
                p.payload?.valued && p.payload?.book != null && p.cx != null && p.cy != null
                  ? <circle key={`d${p.index}`} cx={p.cx} cy={p.cy} r={2.5} fill={BOOK_COLOR} stroke={BOOK_COLOR} />
                  : <g key={`d${p.index}`} />}
              name="Our book" connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {coverage}
    </Card>
  );
}

/** The statement book set against the series' NAV and the current value, one step at a time (MNT-4). */
type Recon = {
  /** Σ of the statement positions as printed, not deduped. */
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
  /** The series' NAV at its last point, and the two named steps from the statement book to it. */
  levelEnd: number;
  newerMarks: number;
  capitalAfter: number;
  /** The series' end level less the statement series': the demats' shares at published closes (Stage 10iz). */
  assumedDelta: number;
  seriesTo: string | null;
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
 * ── WHAT THE SERIES HOLDS, WHAT IT CANNOT, AND HOW IT TIES (Stage 10ge) ──────
 *
 * The family's own ask ("or state the accounts that cannot supply one") is
 * answered by name, now over the whole book's investments rather than over the
 * accounts a statement values twice. Four lists, each sending a reader to a
 * different place:
 *
 *   · JOIN THE RETURN LATER — bought before the window opened and first valued
 *     inside it; what fills the gap is that investment's 31 March valuation.
 *   · HELD AT COST — in the NAV at what was paid, never in the return; what
 *     fills it is a valuation of the line.
 *   · NOT REVALUED IN THE WINDOW — in the return at a valuation from its first
 *     day, carried flat because no later statement restates it.
 *   · NO VALUED HOLDING — accounts the series does not stand for at all, each
 *     with its own account's reason.
 */
function SeriesCoverage({ stats, cov, unitName, nameOf, fmt, recon, whyOf, unvalued, staleValue = 0, demat = null }: {
  stats: BookNavStats;
  cov: BookNavCoverage;
  unitName: (u: BookNavUnitCoverage) => string;
  nameOf: (id: string) => string;
  fmt: (n: number | null | undefined, o?: { compact?: boolean; sign?: boolean }) => string;
  recon: Recon;
  whyOf: (id: string) => Why;
  unvalued: { accountId: string; accountNo: string }[];
  /** In the return and last valued more than `STALE_DAYS` before the series' end. */
  staleValue?: number;
  /** The demats' holdings when the line values their listed shares at published closes (Stage 10iz). */
  demat?: readonly DematHolding[] | null;
}) {
  const c = (n: number, sign = false) => fmt(n, { compact: true, sign });
  const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const nils = unvalued.filter((u) => whyOf(u.accountId).nil).length;
  const byValue = (xs: BookNavUnitCoverage[]) => [...xs].sort((a, b) => (b.endValue ?? 0) - (a.endValue ?? 0));
  /**
   * THE FOOTER RECONCILES, STEP BY STEP, AND THE STEPS ARE COMPUTED (MNT-4).
   *
   * From the statements as printed, to the consolidated statement book, to the
   * series' own NAV at its last point — which may carry a valuation newer than
   * the holdings statement the book reads, and capital dated after a valuation —
   * and separately to the current value on today's prices. Each step is printed
   * with its own figure, and the sign is the arithmetic's.
   */
  const dedupeTies = Math.abs(recon.perAccount - (recon.statementBook + recon.doubleCounted)) <= 1;
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
  const seriesSteps = [
    Math.abs(recon.newerMarks) > 1 ? `${c(recon.newerMarks, true)} from valuations newer than the holdings statement the book carries` : null,
    Math.abs(recon.capitalAfter) > 1 ? `${c(recon.capitalAfter, true)} of capital dated after an investment's last valuation` : null,
    Math.abs(recon.assumedDelta) > 1 ? `${c(recon.assumedDelta, true)} from listed demat shares valued at published closes and assumed still held, in place of their statement values` : null,
  ].filter(Boolean);
  const footHover = [
    `As each statement prints them, the investments sum to ${fmt(recon.perAccount)} — a per-account sum, which does not dedupe.`,
    dedupeTies && causeTies
      ? nTwice === 0
        ? `No holding is reported by two accounts, so that sum and the consolidated statement book agree, ${fmt(recon.statementBook)}.`
        : `Counting once the ${fmt(recon.doubleCounted)} that two accounts both report gives the consolidated statement book, ${fmt(recon.statementBook)}; that is ${holdingsTwice}.`
      : `The consolidated statement book is ${fmt(recon.statementBook)}; the per-account sum differs from it by ${fmt(recon.perAccount - recon.statementBook, { sign: true })}, and ${fmt(recon.reportedTwice)} of that is ${holdingsTwice}.`,
    seriesSteps.length
      ? `The series' NAV at ${recon.seriesTo}, ${fmt(recon.levelEnd)}, is that book plus ${seriesSteps.join(", and ")}.`
      : `The series' NAV at ${recon.seriesTo} is that book, ${fmt(recon.levelEnd)}.`,
    liveSteps.length
      ? `The current value of holdings, ${fmt(recon.current)}, is that book plus ${liveSteps.join(", and ")}.`
      : `The current value of holdings is that book, ${fmt(recon.current)}.`,
  ].join(" ");
  const outOfReturn = stats.joinedLater.length + stats.atCost.length;
  const dematAssumed = (demat ?? []).filter((h) => h.status === "assumed");
  const dematOther = (demat ?? []).filter((h) => h.status !== "assumed");
  const List = ({ id, items, right }: { id: string; items: BookNavUnitCoverage[]; right: (u: BookNavUnitCoverage) => string }) => (
    <ul className="mt-2 space-y-1 text-[11px] text-slate-400" data-testid={id}>
      {byValue(items).map((u) => (
        <li key={u.key} className="flex justify-between gap-3" data-nav-unit={u.key}>
          <span className="truncate" title={u.key}>{unitName(u)}</span>
          <span className="shrink-0 tabular text-slate-500">{right(u)}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <details className="mt-3 rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2" data-testid="nav-excluded"
      data-in-return={stats.inReturn.length} data-holding={stats.holding.length}
      data-joined={stats.joinedLater.length} data-at-cost={stats.atCost.length} data-unvalued={unvalued.length} data-navigation-details="navvsindex-1">
      {/* THE SPLIT IS THE SUMMARY'S HOVER (Stage 10cp): what joins later, what
          is held at cost, and what carries no valued holding send a reader to
          three different places, so a reader who never opens the details can
          still read all three off the summary. */}
      <summary className="cursor-pointer text-[11.5px] text-slate-400"
        data-prose-ok="the book line's coverage as figures: what is in it, what joined late, what is at cost and what is carried at an old valuation"
        title={`${stats.inReturn.length} of the ${stats.holding.length} investments holding value are in the return at ${cov.to}, ${c(stats.inReturnValue)}. ${stats.joinedLater.length} of those joined it on a first valuation inside the window; ${stats.atCost.length} private lines, ${c(stats.atCostValue)}, are held at cost and are in the NAV only; ${unvalued.length} accounts carry no valued holding. Open to see each one named.`}>
        In the return: <strong className="text-slate-300">{stats.inReturn.length} of {stats.holding.length} investments</strong>
        {" "}· {c(stats.inReturnValue)}
        {outOfReturn > 0 && <> · {stats.joinedLater.length} joined later · {stats.atCost.length} at cost</>}
        {staleValue > 0 && <> · <span data-nav-stale={staleValue}>{c(staleValue)} not revalued in 3 months</span></>}
        {dematAssumed.length > 0 && <> · <span data-nav-demat-count={dematAssumed.length}>{dematAssumed.length} assumed held</span></>}
      </summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="label-xs" title={`Each was bought before ${cov.from} and is first valued inside the window, so its value on ${cov.from} is nowhere in the archive: it joins the return on that valuation and contributes nothing before it. Its ${cov.from} valuation is what would bring it in from the first day.`}>
            {stats.joinedLater.length} join the return on a first valuation
          </div>
          <List id="nav-joined-list" items={stats.joinedLater} right={(u) => `${u.returnFrom} · ${fmt(u.endValue, { compact: true })}`} />
          {stats.notRevalued.length > 0 && (
            <>
              <div className="label-xs mt-3" title={`In the return from ${cov.from} at a valuation on or before that day, and valued by no later statement — so each is carried flat at it, as every investment is between two valuations. A newer statement for any of them moves the line.`}>
                {stats.notRevalued.length} not revalued since {cov.from}
              </div>
              <List id="nav-stale-list" items={stats.notRevalued} right={(u) => `${u.lastValued} · ${fmt(u.endValue, { compact: true })}`} />
            </>
          )}
        </div>
        <div>
          <div className="label-xs" title="The family's consolidated review holds these at what was paid and values none of them, so each is in the NAV at its cost and never in the return — a return over a cost would count a line nobody valued as 0%.">
            {stats.atCost.length} held at cost · {c(stats.atCostValue)}
          </div>
          <List id="nav-atcost-list" items={stats.atCost} right={(u) => fmt(u.endValue, { compact: true })} />
          {/* ONE SENTENCE THAT IS TRUE OF ALL OF THEM (MNT-14), in the label's
              hover. Each row carries its own account's reason, and a redeemed
              account shows the nil its own statement struck — a measured zero
              and an absent measurement must never look the same (§2). */}
          <div className="label-xs mt-3" data-nav-unvalued-why
            title={`None of these carries a valued holding, so the series stands for none of them — each row names its own account's reason${nils > 0 ? `, and ${nils === 1 ? "a redeemed account shows" : `the ${nils} redeemed accounts show`} the nil balance ${nils === 1 ? "its" : "their"} statement struck` : ""}.`}>
            {unvalued.length} carry no valued holding
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-400" data-testid="nav-unvalued-list">
            {unvalued.map((u) => {
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
                      <AbsentCell reason={why.reason ?? "no statement in this drop values this account, so the series cannot stand for it"} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {/* ── THE DEMATS' SHARES, EACH NAMED (Stage 10iz) ──────────────────────
          What the line values at published closes and assumes still held, and
          what stays at its statement value or out of both series — each with
          its own reason from the one rule (`assumedHolding`). */}
      {demat && (
        <div className="mt-3 grid gap-4 md:grid-cols-2" data-testid="nav-demat">
          <div>
            <div className="label-xs" title="No sale appears in the records we have, so each is assumed still held: its statement's share count, carried from the statement date at every published close, with checked splits applied and gross dividends counted on their ex-dates. The value shown is the last close in the window.">
              {dematAssumed.length} demat holdings at published closes · {c(sumOf(dematAssumed.map((h) => h.value)))}
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-slate-400" data-testid="nav-demat-assumed">
              {[...dematAssumed].sort((x, y) => y.value - x.value).map((h) => (
                <li key={`${h.accountId}|${h.securityKey}`} className="flex justify-between gap-3"
                  data-nav-demat={`${h.accountId}|${h.securityKey}`} data-nav-demat-status={h.status} data-nav-demat-value={h.value}>
                  <span className="truncate" title={h.accountId}>{h.security} · {h.owner}</span>
                  <span className="shrink-0 tabular text-slate-500">from {h.from} · {fmt(h.value, { compact: true })}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label-xs" title="Each of these stays at its statement value, or — where its statement prints no value — out of the line, for the reason on its row.">
              {dematOther.length} demat holdings not valued this way
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-slate-400" data-testid="nav-demat-other">
              {[...dematOther].sort((x, y) => y.value - x.value).map((h) => (
                <li key={`${h.accountId}|${h.securityKey}`} className="flex justify-between gap-3"
                  data-nav-demat={`${h.accountId}|${h.securityKey}`} data-nav-demat-status={h.status} data-nav-demat-value={h.value}>
                  <span className="truncate" title={h.accountId}>{h.security} · {h.owner}</span>
                  {h.status === "statement" ? (
                    <span className="shrink-0 tabular text-slate-500" title={h.reason ?? undefined}>statement · {fmt(h.value, { compact: true })}</span>
                  ) : (
                    <span className="shrink-0 tabular"><AbsentCell reason={h.reason ?? "no published price could value it"} /></span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* THE FIGURE ON ITS FACE, THE RECONCILIATION IN ITS HOVER (Stage 10cp). */}
      <p className="mt-3 border-t border-ink-700 pt-2 text-[11px] text-slate-500" data-testid="nav-excluded-recon"
        data-per-account={recon.perAccount} data-statement-book={recon.statementBook} data-current={recon.current}
        data-assumed-delta={recon.assumedDelta}
        data-level-end={recon.levelEnd} data-newer-marks={recon.newerMarks} data-capital-after={recon.capitalAfter}
        data-reported-twice={recon.reportedTwice} data-reported-twice-keys={recon.reportedTwiceKeys.join(" ")}
        title={footHover}>
        NAV at {recon.seriesTo} · {c(recon.levelEnd)} · statements · {c(sumOf([recon.statementBook]))}
      </p>
    </details>
  );
}
