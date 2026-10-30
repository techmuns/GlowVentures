import { useEffect, useMemo, useState } from "react";
import { AbsentCell } from "@/components/Absent";
import { BENCHMARKS, DEFAULT_BENCHMARK, benchmarkIdentity, benchmarkMismatchReason, type Benchmark } from "@/lib/benchmarks";
import { closeOnOrBefore, fetchPriceHistory, priceErrorReason, settledPriceHistory, type PriceResult } from "@/lib/prices";
import { compareToIndex, datedSinceInvestment, type BenchmarkComparison, type CardCoverage } from "@/lib/cardBenchmark";
import { capitalMovesWithCalls } from "@/lib/tranches";
import { changeColor, fmtPct } from "@/lib/format";
import type { AvailableCardReturn } from "@/lib/availableCardReturns";
import type { Account } from "@/lib/types";
import { BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_POSITION_TRANCHES, BOOK_REVIEW_FLOWS } from "@/data/glowData";

const pct = (v: number) => fmtPct(v, { sign: true, decimals: 1 });
const lead = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} pp`;

function useHistory(b: Benchmark): PriceResult | undefined {
  const [h, setH] = useState<PriceResult | undefined>(() => settledPriceHistory(b.symbol));
  useEffect(() => {
    let live = true;
    fetchPriceHistory(b.symbol).then((r) => { if (live) setH(r); });
    return () => { live = false; };
  }, [b.symbol]);
  return h;
}

function useComparison(b: Benchmark, card: AvailableCardReturn, accounts: Account[]): BenchmarkComparison {
  const h = useHistory(b);
  const coverage = useMemo<CardCoverage | null>(() => !card.selection.inception ? null : datedSinceInvestment(card.total.units,
    capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, accounts, BOOK_REVIEW_FLOWS), BOOK_POSITION_TRANCHES, accounts), [card, accounts]);
  return useMemo(() => {
    const none = (reason: string): BenchmarkComparison => ({ book: card.total.returnPct, index: null, gap: null, annual: false, reason, coverage });
    if (!h) return none(`Fetching the ${b.label} closes`);
    if (!h.ok) return none(priceErrorReason(h, true));
    const id = benchmarkIdentity(h, b);
    if (!id.ok) return none(benchmarkMismatchReason(b, id.reportedName));
    return compareToIndex(card, (d) => closeOnOrBefore(h, d)?.value ?? null, coverage);
  }, [b, h, card, coverage]);
}

const HOW = "Each rupee behind this figure goes into the index on the day it moved and closes on the same date, then the same formula is struck. A price index: dividends are not in it.";

/** The line on the tile: the default benchmark, on this tile's own money. */
export function CardBenchmarkLine({ card, accounts, money }: { card: AvailableCardReturn; accounts: Account[]; money: (n: number) => string }) {
  const c = useComparison(DEFAULT_BENCHMARK, card, accounts);
  const partial = !!c.coverage && c.coverage.undated.length > 0;
  return <span data-card-bench={DEFAULT_BENCHMARK.key} data-card-bench-book={c.book ?? ""} data-card-bench-index={c.index ?? ""} data-card-bench-gap={c.gap ?? ""}
    data-card-bench-dated={c.coverage?.datedInvested ?? ""} data-card-bench-total={c.coverage?.totalInvested ?? ""}
    title={c.index == null ? c.reason ?? undefined : `${HOW}${partial ? ` Struck on the ${money(c.coverage!.datedInvested)} of ${money(c.coverage!.totalInvested)} invested with every purchase dated, so it is not on the same money as the figure above; the info button has the comparison.` : ""}`}
    className="pointer-events-auto mt-0.5 block whitespace-normal">
    vs {DEFAULT_BENCHMARK.label} {c.index == null ? <AbsentCell reason={c.reason ?? undefined} /> : <>
      <span className={`mono ${changeColor(c.index)}`}>{pct(c.index)}</span>{c.annual && " p.a."}
      {/* A narrowed comparison's lead is off a book figure the tile does not show, so it would not tie to the figure above it. */}
      {c.gap != null && !partial && <> · <span data-card-bench-lead className={`mono whitespace-nowrap font-semibold ${changeColor(c.gap)}`}>{lead(c.gap)}</span></>}
    </>}
  </span>;
}

function IndexRow({ b, card, accounts }: { b: Benchmark; card: AvailableCardReturn; accounts: Account[] }) {
  const c = useComparison(b, card, accounts);
  return <li data-card-bench-row={b.key} data-card-bench-index={c.index ?? ""} title={b.title} className="flex items-baseline justify-between gap-3">
    <span>{b.label}</span>
    <span className="tabular">{c.index == null ? <AbsentCell reason={c.reason ?? undefined} /> : <>
      <span className={changeColor(c.index)}>{pct(c.index)}</span>{c.annual && " p.a."}
      {c.gap != null && <> · <strong className={changeColor(c.gap)}>{lead(c.gap)}</strong></>}
    </>}</span>
  </li>;
}

/** The info card's section: every benchmark on this tile's money, and what is left out of it. */
export function CardBenchmarkInfo({ card, accounts, money }: { card: AvailableCardReturn; accounts: Account[]; money: (n: number) => string }) {
  const c = useComparison(DEFAULT_BENCHMARK, card, accounts);
  const left = c.coverage ? [...c.coverage.undated].sort((a, b) => b.invested - a.invested) : [];
  return <div data-card-bench-info className="rounded-lg bg-ink-900 p-3">
    <p className="font-semibold text-slate-100">Against the benchmarks</p>
    <p className="mt-1">{HOW}</p>
    {c.coverage && c.book != null && <p className="mt-2" data-card-bench-scope>
      Compared on <strong>{money(c.coverage.datedInvested)}</strong> of {money(c.coverage.totalInvested)} invested, where every purchase is dated.
      The book on that money: <strong className={changeColor(c.book)}>{pct(c.book)}</strong>.</p>}
    <ul className="mt-2 space-y-1">{BENCHMARKS.map((b) => <IndexRow key={b.key} b={b} card={card} accounts={accounts} />)}</ul>
    {left.length > 0 && <details className="mt-2 text-xs text-slate-400" data-navigation-details="cardbenchmark-1">
      <summary className="cursor-pointer">{left.length} left out of this comparison: no complete dated purchases</summary>
      <ul className="mt-1 space-y-1">{left.map((u) => <li key={u.key}>{u.label} · {money(u.invested)}</li>)}</ul>
    </details>}
  </div>;
}
