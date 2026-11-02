import { useNavigationValue, nullableStringNavigation, nullableStringsNavigation } from "@/lib/useNavigationState";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LineChart as LineChartIcon, X } from "lucide-react";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Card } from "@/components/Card";
import { AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { wholeFamilyOnly } from "@/lib/memberScope";
import { WHOLE_BOOK_NAV, WHOLE_BOOK_STARTS, BOOK_NAV_UNITS } from "@/lib/bookNavBook";
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { shareCandidates } from "@/lib/depositoryShares";
import { useMarketHistories } from "@/lib/useMarketReturns";
import { assumedHoldingBook } from "@/lib/assumedHoldingBook";
import { assumedBookNav, dematHoldings, ASSUMED_KEY, type DematHolding } from "@/lib/assumedBookNav";
import { holdingAssumptionText } from "@/lib/assumedHoldingReturns";
import { bookNavStats, type BookNavUnitCoverage } from "@/lib/bookNav";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { navIndexSeries } from "@/lib/navSeries";
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
//  · *"show only the book and Nifty 500 by default; other indices added by
//    clicking"* — the family, 30 Oct 2026 (Stage 10jg), over a chart of eight
//    lines. *"just give me a simple benchmark dropdown list selector, to select
//    multiple benchmarks"* — the same day (Stage 10jj): one Benchmarks list, each
//    index in its fixed colour with its return over the same dates; the row beside
//    it names only the lines on the chart.
//  · *"make the UI of our book vs benchmark similar to the google finance UI ...
//    Keep the benchmark selector on the top left area of the graph chart and a
//    visible dot of the color of lines on the graph"* — the family, 2 Nov 2026
//    (Stage 10jw). The selector leads the row above the plot, each line is a pill
//    with its colour's dot and a ✕, and each line ends in a dot of its colour.
//    The dots that marked statement dates moved to the tooltip, so the only dots
//    on the plot are the line ends.
//  · The "In the return: …" fold under the chart is gone, at the family's ask of
//    2 Nov 2026 (Stage 10jz). What the line covers stays on the book pill's hover.

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
  const period = spanDays > 365 * 2.5 ? "year" : spanDays > 400 ? "quarter" : spanDays > 75 ? "month" : "day";
  const fmt = period === "year"
    ? (t: number) => iso(t).slice(0, 4)
    : (t: number) => new Date(t).toLocaleDateString("en-US", period === "day"
      ? { month: "short", day: "numeric", timeZone: "UTC" }
      : { month: "short", year: "numeric", timeZone: "UTC" });
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
  const all = firsts.filter((_, i) => i % stride === 0).map(ts);
  // A window opening on a period's last day would print two labels side by side.
  const minGap = spanDays * DAY * 0.04;
  return { ticks: all.filter((t, i) => i === all.length - 1 || all[i + 1] - t > minGap), fmt };
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
  const { portfolio, statementPortfolio, fmtFromBase, scope, corporateActions, corporateActionsStatus } = usePortfolio();
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const down = (e: MouseEvent) => { if (picker.current && !picker.current.contains(e.target as Node)) setPickerOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPickerOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [pickerOpen]);
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
    // THE ROW EACH LINE ENDS ON, for the dot of its colour there.
    const ends: Record<string, number> = Object.fromEntries(drawn.map((d) =>
      [d.key, rows.reduce((last, r, i) => (r[d.key] != null ? i : last), -1)]));
    const staleCut = iso(ts(to) - STALE_DAYS * DAY);
    const stale = stats.inReturn
      .filter((u) => u.lastValued != null && u.lastValued < staleCut && (u.endValue ?? 0) > 0)
      .sort((a, b) => (b.endValue ?? 0) - (a.endValue ?? 0));
    const spanDays = (ts(to) - ts(from)) / DAY;
    const { ticks, fmt: tickFmt } = axisTicks(allDates, spanDays);
    return { book, cov, stats, dates, bookFrom, bookTo, ready: true as const, from, to, bookLine, bookRet, benches, rows, ends, ticks, tickFmt, stale, starts };
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
  const stale = model.stale;
  const staleValue = sumOf(stale.map((u) => u.endValue ?? 0));

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
      </Card>
    );
  }

  const { from, to, bookRet, benches, rows, ends, ticks, tickFmt, starts } = model;
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
      return `Listed demat shares: ${assumed.assumedCount} holdings, ${c(assumed.assumedValue)} on ${fmtDate(to)}, are valued at each day's published close from their statement dates, with splits applied and gross dividends counted on their ex-dates. ${assumptionText(assumed.owners)}${others ? ` Of the other demat holdings, ${others}.` : ""}`;
    })()
    : `Listed demat shares are at their statement values: ${
      corporateActionsStatus === "loading" ? "the split and dividend records are still loading."
        : assumed && assumed.pending > 0 ? `${assumed.pending} published price histories are still loading.`
          : `no holding could be valued at published closes. ${topReason(assumed?.holdings ?? []) ?? "No published price history could be checked for them."}`}`;
  // A HISTORY THAT FAILED IS NAMED ON THE LINE IT LEAVES AT ITS STATEMENT VALUE; opening the page again asks again.
  const failedHistories = assumed?.holdings.filter((h) => h.retry).length ?? 0;
  const dematSentence = [dematStatus, failedHistories > 0
    ? `${failedHistories} demat price histories could not load; their shares stay at their statement values until a reload fetches them.` : ""].filter(Boolean).join(" ");
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
    "Benchmarks are price indices (dividends are not in them), from the live price service, each checked by the name the service reports. Pick any of them from the Benchmarks list.",
  ].join("\n\n");

  const toggle = (key: string) => setShown((cur) => {
    const set = new Set<string>(cur ?? DEFAULT_SHOWN);
    if (set.has(key)) set.delete(key); else set.add(key);
    return [...set];
  });
  const benchHover = (b: (typeof BENCHMARKS)[number], load: BenchLoad, ret: number | null, lastClose: string | null) => {
    const why = load.state === "down"
      ? `The ${b.name} history could not be fetched — the price service did not answer. It runs on the deployed site, not in local preview.`
      : load.state === "mismatch" ? benchmarkMismatchReason(b, load.reportedName)
        : load.state === "loading" ? `Loading the ${b.name} history.` : null;
    const vsBook = ret != null && bookRet != null ? bookRet - ret : null;
    return why ? `${why}\n\n${b.title}` : `${b.title}\n\n${fmtDate(from)} → ${fmtDate(lastClose ?? to)}: ${pctText(ret)}${vsBook != null ? `; our book ${vsBook >= 0 ? "+" : "−"}${Math.abs(vsBook).toFixed(1)} points against it` : ""}.`;
  };
  const pillBase = "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors";
  const LineDot = ({ color }: { color: string }) => (
    <span aria-hidden data-nav-dot className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
  );
  /** A dot of the line's colour on its last point, and nothing on any other. */
  const endDot = (key: string, color: string) => (p: { cx?: number; cy?: number; index?: number }) =>
    p.index === ends[key] && p.cx != null && p.cy != null
      ? (
        <g key={`e${key}`} data-nav-end={key}>
          <circle cx={p.cx} cy={p.cy} r={8} fill={color} fillOpacity={0.2} />
          <circle cx={p.cx} cy={p.cy} r={5} fill={color} data-nav-end-dot />
        </g>
      )
      : <g key={`d${key}${p.index}`} />;

  return (
    <Card className="flex flex-col"
      title={
        <span data-testid="nav-basis" title={basisHover} className="cursor-help">
          Our book vs benchmarks
        </span>
      }
      right={
        <div className="flex flex-wrap items-center justify-end gap-2" data-testid="nav-range" data-nav-starts={starts.join(" ")}>
          <span className="text-[11px] text-slate-500 tabular" data-testid="nav-window">
            {fmtDate(from)} → {fmtDate(to)}
          </span>
        </div>
      }>

      <div className="rounded-xl border border-ink-700 bg-ink-900/40 p-3">
        {/* ── THE LIST THAT PICKS THE LINES, THEN THE LINES ON THE CHART ──────────
            The selector leads, top left of the plot; the book is always drawn. Each
            option is keyed `data-nav-line` / `data-bench`, and the closed list stays
            in the DOM, so a claim about what the card offers is struck on keys,
            never on labels. */}
        <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="nav-legend"
          data-nav-from={from} data-nav-to={to}>
          <div ref={picker} className="relative">
            <button type="button" data-nav-picker aria-haspopup="listbox" aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((o) => !o)}
              className={`${pillBase} border-transparent font-medium text-slate-200 ring-focus hover:bg-ink-700/60`}>
              <LineChartIcon className="h-4 w-4 shrink-0 text-slate-400" />
              Benchmarks
              <span className="tabular text-slate-500">{shownKeys.size}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
            </button>
            <div hidden={!pickerOpen} data-nav-picker-panel
              className="absolute left-0 z-50 mt-1 w-[min(17rem,92vw)] overflow-hidden rounded-lg border border-ink-700 bg-ink-800 shadow-xl shadow-black/40">
              <ul role="listbox" aria-multiselectable="true" aria-label="Benchmarks" className="py-1">
                {benches.map(({ b, load, ret, lastClose }) => {
                  const on = shownKeys.has(b.key);
                  return (
                    <li key={b.key}>
                      <button type="button" role="option" aria-selected={on} onClick={() => toggle(b.key)}
                        data-nav-line={b.key} data-bench={b.key} data-bench-symbol={b.symbol} data-bench-state={load.state}
                        data-nav-ret={ret ?? ""} title={benchHover(b, load, ret, lastClose)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-ink-700/60 ${on ? "text-slate-100" : "text-slate-300"}`}>
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-champagne-500 bg-champagne-500/20 text-champagne-400" : "border-ink-600 text-transparent"}`}>
                          <Check className="h-3 w-3" />
                        </span>
                        <LineDot color={b.color} />
                        <span className="truncate">{b.label}</span>
                        <span className={`ml-auto shrink-0 tabular font-semibold ${changeColor(ret)}`}>{load.state === "loading" ? "…" : pctText(ret)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <span className={`${pillBase} cursor-help border-ink-600 text-slate-300`}
            data-nav-line="book" data-nav-ret={bookRet ?? ""} data-testid="nav-book-chip" title={bookHover}
            data-nav-basis={useAssumed ? "assumed" : "statement"}
            data-nav-assumed-count={useAssumed && assumed ? assumed.assumedCount : 0}
            data-nav-assumed-value={useAssumed && assumed ? assumed.assumedValue : 0}>
            <LineDot color={BOOK_COLOR} />
            <span className="font-medium">Our book</span>
            <span className={`tabular font-semibold ${changeColor(bookRet)}`}>{pctText(bookRet)}</span>
            <span className="text-slate-500">available data{useAssumed && " · assumed holdings"}</span>
          </span>
          {benches.filter((x) => shownKeys.has(x.b.key)).map(({ b, load, ret, lastClose }) => (
            <span key={b.key} data-nav-selected={b.key} title={benchHover(b, load, ret, lastClose)}
              className={`${pillBase} cursor-help border-ink-600 pr-1.5 text-slate-300`}>
              <LineDot color={b.color} />
              <span className="font-medium">{b.label}</span>
              <span className={`tabular font-semibold ${changeColor(ret)}`}>{load.state === "loading" ? "…" : pctText(ret)}</span>
              <button type="button" data-nav-remove={b.key} aria-label={`Remove ${b.label}`} title={`Remove ${b.label}`}
                onClick={() => toggle(b.key)}
                className="grid h-5 w-5 place-items-center rounded-full text-slate-400 ring-focus hover:bg-ink-700/60 hover:text-slate-200">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>

        {/* A DEFINITE HEIGHT: `ResponsiveContainer height="100%"` inside a flex
            item measured 0 and drew no SVG at all (see the `nav-chart` probe). */}
        <div className="h-[22rem]" data-testid="nav-chart" data-nav-from={from} data-nav-to={to}
          data-bench-ok={benches.filter((x) => x.load.state === "ok").length}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                ticks={ticks} tickFormatter={tickFmt} minTickGap={16}
                axisLine={false} tickLine={false} tick={{ fill: AXIS_COLOR }} tickMargin={8} fontSize={11} />
              {/* PER CENT SINCE THE PERIOD'S FIRST DAY — a change, never an amount. */}
              <YAxis axisLine={false} tickLine={false} tick={{ fill: AXIS_COLOR }} fontSize={11} width={44} domain={["auto", "auto"]}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <ReferenceLine y={0} stroke={AXIS_COLOR} strokeDasharray="1 4" />
              <Tooltip cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }} content={({ active: on, payload }) => {
                const row = on ? (payload?.[0]?.payload as Record<string, number | string | boolean | null> | undefined) : undefined;
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
                        <span className="flex items-center gap-1.5"><LineDot color={x.color} />{x.label}</span>
                        <span className="tabular font-semibold">{pctText(x.v)}</span>
                      </div>
                    ))}
                    {row.valued && <div className="mt-1 opacity-70" data-nav-valued-note>Statement valuation on this date</div>}
                  </div>
                );
              }} />
              {benches.filter((x) => shownKeys.has(x.b.key) && x.line.length).map(({ b }) => (
                <Line key={b.key} type="linear" dataKey={b.key} stroke={b.color} strokeWidth={2} dot={endDot(b.key, b.color)}
                  activeDot={{ r: 4, fill: b.color, stroke: "none" }} name={b.label} connectNulls isAnimationActive={false} />
              ))}
              {/* DRAWN LAST SO IT SITS ON TOP — the card's subject. */}
              <Line type="linear" dataKey="book" stroke={BOOK_COLOR} strokeWidth={2} dot={endDot("book", BOOK_COLOR)}
                activeDot={{ r: 4, fill: BOOK_COLOR, stroke: "none" }} name="Our book" connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {starts.length > 1 && (
          <div role="tablist" aria-label="Compare from" className="mt-3 flex flex-wrap items-center gap-1 border-t border-ink-700 pt-3">
            {[...starts].reverse().map((d) => (
              <button key={d} type="button" role="tab" aria-selected={from === d} data-start={d}
                onClick={() => setStart(d)} title={`${fmtDate(d)} → ${fmtDate(to)}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  from === d ? "bg-ink-700/60 text-slate-100" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
                }`}>
                Since {fmtDate(d)}
              </button>
            ))}
          </div>
        )}
      </div>

    </Card>
  );
}
