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
import { useMarketHistories } from "@/lib/useMarketReturns";
import { assumedHoldingBook } from "@/lib/assumedHoldingBook";
import { holdingAssumptionText } from "@/lib/assumedHoldingReturns";
import { availableCardReturns, statementReturnInputs } from "@/lib/availableCardReturns";
import { allDebt, currentHoldings } from "@/lib/analytics";
import { periodLine } from "@/lib/periodLine";
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
//  · *"how can our book be 6.1% when all the above things are showing 12%"* —
//    the family, 4 Nov 2026 (Stage 10le). The time-weighted index above is
//    retired from this card: the book's line is the return card's own selection,
//    ended on each day (`periodLine`), and each benchmark the same dated money in
//    the index. Its periods are the cards'; its last point is the card.

/** The benchmarks drawn until the reader changes them. */
const DEFAULT_SHOWN: readonly BenchmarkKey[] = ["nifty-500"];

const BOOK_COLOR = "var(--chart-book, #d9c48f)";
const GRID_COLOR = "var(--chart-grid, #2b2668)";
const AXIS_COLOR = "var(--chart-axis, #6b6880)";

const DAY = 86400000;
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
/** `holdingAssumptionText`, for the several owners one line carries. */
const assumptionText = (owners: readonly string[]) => owners.length <= 1
  ? holdingAssumptionText(owners[0])
  : `No sale appears in the records we have. We assume ${owners.slice(0, -1).join(", ")} and ${owners.at(-1)} still hold these shares.`;

/**
 * The periods the line can cover — the return cards' own three (Stage 10la).
 * Over the available history the line is cumulative and the card a rate a year;
 * a few small holdings reach back to 2023 and most of the money joins in 2026,
 * so its early points rest on little money, and the hover says so.
 */
const PERIOD_PICKS = [
  { key: "fytd", label: "This financial year", card: "Return this financial year" },
  { key: "ytd", label: "This calendar year", card: "Return this calendar year" },
  { key: "history", label: "Available history", card: "Return over available history" },
] as const;
type PeriodPick = (typeof PERIOD_PICKS)[number]["key"];
/** An index's close on or before a day, from its own points. */
const levelOf = (points: readonly Point[]) => (d: string): number | null => {
  let lo = 0, hi = points.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (points[mid].t <= d) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at < 0 ? null : points[at].v;
};
const lastCloseOn = (points: readonly Point[], d: string) => [...points].reverse().find((p) => p.t <= d)?.t ?? null;

export function NavVsIndex() {
  const { portfolio, statementPortfolio, consolidated, fmtFromBase, scope, corporateActions } = usePortfolio();
  /**
   * ── THE CARD'S OWN LINE (Stage 10la) ──────────────────────────────────────
   * *"how can our book be 6.1% when all the above things are showing 12% …
   * everything should match"* — the family, 4 Nov 2026. The book line is the
   * return card's own selection for the period picked (`availableCardReturns`,
   * the same rows, histories and records Morning CIO's cards read), measured on
   * each day as if the period ended there (`periodLine`): its last point is the
   * card. Each benchmark is that same dated money put into the index.
   */
  const today = useMemo(() => new Date(), []);
  const holdingsNow = useMemo(() => currentHoldings(consolidated), [consolidated]);
  const feed = useMarketHistories(holdingsNow);
  const assumptionBook = useMemo(() => assumedHoldingBook({ actions: corporateActions, instruments: feed.instruments, histories: feed.histories }),
    [corporateActions, feed.instruments, feed.histories]);
  const cards = useMemo(() => {
    const stmt = statementPortfolio ?? portfolio;
    return stmt ? availableCardReturns(stmt, consolidated, statementReturnInputs(stmt), today, assumptionBook) : null;
  }, [statementPortfolio, portfolio, consolidated, today, assumptionBook]);
  /** The period the line covers — one of the return cards'; the financial year by default. */
  const [startPick, setStart] = useNavigationValue<string | null>("nav-start", null, nullableStringNavigation);
  const period: PeriodPick = PERIOD_PICKS.some((x) => x.key === startPick) ? startPick as PeriodPick : "fytd";
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
    const card = cards?.[period];
    if (!portfolio || !card) return null;
    const windows = card.total.units.flatMap((u) => (u.window ? [u.window] : []));
    const to = card.selection.end ?? null;
    const from = card.selection.start ?? windows.map((w) => w.openDate).sort()[0] ?? null;
    if (!from || !to || !windows.length || card.total.returnPct == null || from >= to) return { card, ready: false as const };
    const debt = allDebt(card.total.units.flatMap((u) => u.positions));
    const type = card.selection.type;
    const bookLine = periodLine(windows, type, from, to, { debt }).filter((p) => p.pct != null).map((p) => ({ t: p.date, v: p.pct as number }));
    const bookRet = card.total.measured?.working?.periodPct ?? bookLine.at(-1)?.v ?? null;
    // A dot only where a STATEMENT valued something, as before.
    const valuedOn = new Set(portfolio.navHistory.filter((p) => (p.accountsOnDate ?? 0) > 0).map((p) => p.date));
    const benches = BENCHMARKS.map((b) => {
      const load = loads[b.key];
      if (load.state !== "ok") return { b, load, line: [] as { t: string; v: number }[], ret: null as number | null, lastClose: null as string | null };
      const level = levelOf(load.points);
      // The same dated money put into the index: its line only where it is drawn, its figure for every one.
      const line = shownKeys.has(b.key)
        ? periodLine(windows, type, from, to, { debt, level }).filter((p) => p.pct != null).map((p) => ({ t: p.date, v: p.pct as number }))
        : [];
      const ret = line.length ? line.at(-1)!.v : periodLine(windows, type, to, to, { debt, level }).at(-1)?.pct ?? null;
      return { b, load, line, ret, lastClose: lastCloseOn(load.points, to) };
    });
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
    const ends: Record<string, number> = Object.fromEntries(drawn.map((d) =>
      [d.key, rows.reduce((last, r, i) => (r[d.key] != null ? i : last), -1)]));
    const spanDays = (ts(to) - ts(from)) / DAY;
    const { ticks, fmt: tickFmt } = axisTicks(allDates, spanDays);
    return { card, ready: true as const, from, to, bookLine, bookRet, benches, rows, ends, ticks, tickFmt };
  }, [portfolio, cards, period, loads, shownKeys]);
  if (!model || !portfolio) return null;
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
    const label = PERIOD_PICKS.find((x) => x.key === period)!.card;
    return (
      <Card className="flex flex-col" title="Our book vs benchmarks">
        <AbsentSection
          what={`No return to draw for ${label.toLowerCase()}`}
          needs={`${label} has no measured record yet, so there is no line to draw. Its card names what each investment still needs.`} />
      </Card>
    );
  }

  const { from, to, bookRet, benches, rows, ends, ticks, tickFmt, card } = model;
  const c = (n: number | null | undefined) => fmtFromBase(n, { compact: true });
  const pick = PERIOD_PICKS.find((x) => x.key === period)!;
  const annual = card.total.measured?.basis === "annual";
  const cov = card.coverage;
  const allValue = cov.publicValue + cov.privateTotalValue;
  const share = (v: number) => (allValue > 0 ? Math.min(100, Math.round((v / allValue) * 100)) : 0);
  const assumedOwners = [...new Set(card.total.units.flatMap((u) => (u.assumption ? [u.assumption.owner] : [])))];
  /**
   * ── WHAT THE BOOK'S LINE IS, ON ITS CHIP ──────────────────────────────────
   * The card's own words: what each investment counts from, what is measured
   * and what is held at its last value, private investments among it (Stage
   * 10nu) — counted off the card's own units, never typed.
   */
  const bookHover = [
    `Our book: ${pick.card.toLowerCase()}, the card's own figure on every day — had the period ended that day. Each investment counts from its first value on record in the period, that value treated as money arriving that day; money in and out counts on its date and is never a gain.`,
    `Covers ${share(cov.measuredValue + cov.heldValue + cov.privateCoveredValue)}% of investments: ${c(cov.measuredValue + cov.privateCoveredValue - cov.privateHeldValue)} measured, ${c(cov.heldValue + cov.privateHeldValue)} held at its last value (0% until its next value), ${c(cov.privateHeldValue)} of it private${cov.waitingValue > 5e5 ? `, ${c(cov.waitingValue)} waiting for prices` : ""}.`,
    "Each investment is held at its latest valuation until the next: a statement, a published close or a printed NAV. Nothing is interpolated between them.",
    assumedOwners.length ? assumptionText(assumedOwners) : "",
    annual ? `Over the available history the line is the return so far, money-weighted: where only a little money was invested, as before ${fmtDate(card.starts.find((s) => s.date && s.close > 0.5 * cov.measuredValue)?.date ?? to)}, a small move reads large.` : "",
    bookRet != null ? `${fmtDate(from)} → ${fmtDate(to)}: ${pctText(bookRet)}${annual ? `, ${pctText(card.total.returnPct)} a year` : ", not annualised"} — the card's figure.` : "",
  ].filter(Boolean).join("\n\n");
  const basisHover = [
    `Every line is its return from ${fmtDate(from)} to each day, to ${fmtDate(to)}, on the same dated money, so every figure covers the same dates and the last point of the book's line is the card.`,
    "Each benchmark: every rupee behind the book's figure put into the index on the day it moved, and the same formula struck. A price index: dividends are not in it.",
    "Benchmarks come from the live price service, each checked by the name the service reports. Pick any of them from the Benchmarks list.",
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
        <div className="flex flex-wrap items-center justify-end gap-2" data-testid="nav-range" data-nav-starts={PERIOD_PICKS.map((x) => x.key).join(" ")}>
          <span className="text-[11px] text-slate-500 tabular" data-testid="nav-window">
            {/* The card's own dates: the first value it opens on and the last it measures. */}
            {fmtDate(card.from ?? from)} → {fmtDate(card.to ?? to)}
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
            data-nav-period={period} data-nav-card-return={card.total.returnPct ?? ""} data-nav-card-gain={card.total.gain ?? ""}
            data-nav-assumed-count={card.total.units.filter((u) => u.assumption).length}>
            <LineDot color={BOOK_COLOR} />
            <span className="font-medium">Our book</span>
            <span className={`tabular font-semibold ${changeColor(bookRet)}`}>{pctText(bookRet)}</span>
            {annual && <span className="tabular text-slate-400">{pctText(card.total.returnPct)} a year</span>}
            <span className="text-slate-500">{pick.label.toLowerCase()}</span>
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

        <div role="tablist" aria-label="Period" className="mt-3 flex flex-wrap items-center gap-1 border-t border-ink-700 pt-3" data-nav-periods>
          {PERIOD_PICKS.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={period === x.key} data-start={x.key}
              onClick={() => setStart(x.key)} title={`The line of the "${x.card}" card`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                period === x.key ? "bg-ink-700/60 text-slate-100" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
              }`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

    </Card>
  );
}
