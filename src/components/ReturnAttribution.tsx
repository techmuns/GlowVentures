import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection, AbsentCell } from "@/components/Absent";
import { StockLink } from "@/components/StockLink";
import { usePortfolio } from "@/context/PortfolioContext";
import { BOOK_ATTRIBUTION, BOOK_ACCOUNT_RETURNS, BOOK_NAV_COVERAGE } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { bridgeSteps, contributorsOf, managerYears, priceReturnPct, accountRows } from "@/lib/attribution";
import { fetchPriceHistory, toPoints, type PriceHistory } from "@/lib/prices";
import { indexReturnBetween } from "@/lib/navSeries";
import { NIFTY_500_SYMBOL, NIFTY_500_LABEL } from "@/lib/indices";
import { fmtPct, changeColor, DASH } from "@/lib/format";

// ── RETURN ATTRIBUTION — WHAT MOVED, AND WHAT THE MARKET DID ─────────────────
//
// *"What was the attribution to those returns? So what did the benchmark do?
// What did I do? What did my portfolio do? In this last year, return
// attribution… which were the biggest detractors of returns?"*
//
// FOUR QUESTIONS, AND THE ARCHIVE ANSWERS THREE. Each is answered from primary
// documents or is declared absent with the document that would fill it — never
// approximated from the one next to it, which is the substitution this book
// refuses everywhere else.
//
//   what moved, and which names       → the four-term bridge, 268 holdings
//                                        priced at both ends of a window
//   what did the market do            → the Nifty 500 over the same span
//   what happened over the last year  → the managers' own published one-year
//                                        returns, each beside the benchmark
//                                        THAT MANAGER publishes, on the same
//                                        document
//   what was it worth in August 2025  → ABSENT. The archive's earliest dated
//                                        valuation of any kind is 2026-03-31.
//
// THE FOURTH IS THE ONE WORTH BEING CAREFUL ABOUT, because two plausible
// substitutes were available and both are refused. The book's cost basis is
// dated only where a lot register exists (3 of 371 positions), so "what it was
// worth a year ago" cannot be backed out of cost; and the family's own dated
// contributions run to 2023, so an opening value could have been *inferred*
// from capital in less capital out. Neither is a valuation. What is needed is a
// holdings statement dated on or before the date asked about, per account, and
// that is what the card says.
export function ReturnAttribution() {
  const { portfolio, fmtFromBase } = usePortfolio();
  const [index, setIndex] = useState<PriceHistory | null>(null);
  const [indexState, setIndexState] = useState<"loading" | "ok" | "down">("loading");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPriceHistory(NIFTY_500_SYMBOL).then((r) => {
      if (!alive) return;
      if (r.ok) { setIndex(r); setIndexState("ok"); } else setIndexState("down");
    });
    return () => { alive = false; };
  }, []);

  const model = useMemo(() => {
    const a = BOOK_ATTRIBUTION;
    if (!a.accounts.length) return null;
    const ranked = contributorsOf(a);
    const pts = index ? toPoints(index) : [];
    return {
      a,
      steps: bridgeSteps(a),
      ranked,
      // TOP AND TAIL OF ONE RANKING, so a name cannot appear in both lists.
      gainers: ranked.filter((c) => c.priceEffect > 0),
      losers: ranked.filter((c) => c.priceEffect < 0).slice().reverse(),
      priceRet: priceReturnPct(a),
      indexRet: a.from && a.to && pts.length ? indexReturnBetween(pts, a.from, a.to) : null,
      years: managerYears(BOOK_ACCOUNT_RETURNS),
      accounts: accountRows(a),
    };
  }, [index]);

  if (!portfolio) return null;
  if (!model) {
    return (
      <Card title="Return attribution">
        <AbsentSection
          what="No account in this book publishes a valued holdings statement at two dates"
          needs="A second dated holdings statement for any account. One statement is a level; two are a change, and only a change can be attributed."
        />
      </Card>
    );
  }
  const { a, steps, ranked, gainers, losers, priceRet, indexRet, years, accounts } = model;
  const accts = accountIndex(portfolio.accounts);
  const nameOf = (id: string) => {
    const acc = accts.get(id);
    if (!acc) return id;
    const owner = acc.ownerId ? ownerDisplayName(acc.ownerId) : acc.owner;
    return `${acc.strategy || acc.provider}${owner ? ` · ${owner}` : ""}`;
  };
  const money = (n: number) => fmtFromBase(n, { compact: true });
  const N = showAll ? 25 : 5;
  /**
   * WHICH ACCOUNTS PUBLISH A YEAR AND A BENCHMARK, AND WHICH DO NOT.
   *
   * Counted off the book rather than asserted: five of the twelve accounts with
   * return blocks publish a one-year return or a benchmark but never both on one
   * document, so no row can be struck for them without pairing two windows —
   * which the S&P BSE 500 reading 1.22% on one Green Lantern document and 5.89%
   * on another, four days apart, is exactly the demonstration of.
   */
  const yearMissing = Object.keys(BOOK_ACCOUNT_RETURNS).filter(
    (id) => !years.some((y) => y.accountId === id));

  return (
    <Card
      title="Return attribution"
      subtitle={<>
        Every holding priced at <strong className="text-slate-300">both ends</strong> of a window, over the{" "}
        <strong className="text-slate-300">{a.accounts.length} of {portfolio.accounts.length} accounts</strong>{" "}
        that publish a valued holdings statement at two or more dates — {money(a.coveredBookValue)} of the{" "}
        {money(a.bookValue)} book, {a.from} → {a.to}. Each account is decomposed over ITS OWN first and last
        statement, because the report dates differ by weeks and one imposed window would credit an account with
        standing still. Market value is quantity × the statement's own mark on every priced row here, so the split
        below is exact arithmetic on printed figures and leaves no residual.
      </>}
      right={
        <div className="flex flex-col items-end gap-1">
          {priceRet == null
            ? <Pill>{DASH} no return</Pill>
            : <Pill tone={priceRet >= 0 ? "gain" : "loss"} className="whitespace-nowrap">
                Price {fmtPct(priceRet, { sign: true })}
              </Pill>}
          {indexState === "loading"
            ? <Pill>{NIFTY_500_LABEL} fetching…</Pill>
            : indexRet == null
              ? <span title="The index history could not be fetched, so no comparison is drawn over this window."><Pill>{DASH} {NIFTY_500_LABEL}</Pill></span>
              : <Pill tone="info" className="whitespace-nowrap">{NIFTY_500_LABEL} {fmtPct(indexRet, { sign: true })}</Pill>}
          <span className="text-[10px] uppercase tracking-wide text-slate-500">{a.from} → {a.to}</span>
        </div>
      }>

      {/* ── THE BRIDGE ───────────────────────────────────────────────────────
          Opening value → four terms → closing value, and the terms are LABELLED
          as performance or as money moving. That distinction is the whole reason
          for decomposing: V.E.C 128005 runs +119% over its window and nearly all
          of it is a ₹11.24 Cr deposit, which a two-term split would have left
          sitting inside a performance figure. */}
      <div className="overflow-x-auto" data-testid="attrib-bridge">
        <table className="w-full min-w-[38rem] text-sm">
          <thead>
            <tr className="label-xs border-b border-ink-700/60 text-slate-400">
              <th className="py-2 pr-3 text-left">Step</th>
              <th className="py-2 pr-3 text-right">Amount</th>
              <th className="py-2 pr-3 text-right">of opening</th>
              <th className="py-2 text-left">What it is</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink-700/40" data-bridge-step="open">
              <td className="py-1.5 pr-3 font-medium text-slate-200">Opening value</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-slate-200">{money(a.openValue)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">100.0%</td>
              <td className="py-1.5 text-[11px] text-slate-500">
                Each covered account at its own first valued statement in this span.
              </td>
            </tr>
            {steps.map((s) => (
              <tr key={s.key} className="border-b border-ink-700/40" data-bridge-step={s.key}>
                <td className="py-1.5 pr-3">
                  <span className="text-slate-200">{s.label}</span>
                  {s.performance
                    ? <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">performance</span>
                    : <span className="ml-2 rounded bg-ink-700/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">capital</span>}
                </td>
                <td className={`py-1.5 pr-3 text-right tabular-nums ${changeColor(s.value)}`}>
                  {s.value >= 0 ? "+" : "−"}{money(Math.abs(s.value))}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                  {a.openValue > 0 ? fmtPct((s.value / a.openValue) * 100, { sign: true, decimals: 2 }) : DASH}
                </td>
                <td className="py-1.5 text-[11px] text-slate-500">{s.why}</td>
              </tr>
            ))}
            <tr data-bridge-step="close">
              <td className="py-2 pr-3 font-medium text-slate-200">Closing value</td>
              <td className="py-2 pr-3 text-right tabular-nums font-medium text-slate-100">{money(a.closeValue)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                {a.openValue > 0 ? fmtPct((a.closeValue / a.openValue) * 100, { decimals: 1 }) : DASH}
              </td>
              <td className="py-2 text-[11px] text-slate-500">
                Each covered account at its own last valued statement. The steps above add to it exactly.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── WHAT DROVE IT, AND WHAT HELD IT BACK ─────────────────────────────
          Ranked on the PRICE step alone, which is the only term that is
          performance. A name held in several accounts is ONE contributor: the
          rupee impact adds and the percentage is re-derived from the combined
          opening value, never averaged across positions of different sizes —
          Today's movers' own rule, arriving through a window instead of a day. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {([["Contributors", gainers, "attrib-gainers"], ["Detractors", losers, "attrib-losers"]] as const).map(
          ([heading, list, testid]) => (
            <div key={heading}>
              <div className="mb-2 flex items-baseline justify-between">
                <div className="label-xs text-slate-400">{heading}</div>
                <div className="text-[11px] text-slate-500">
                  {list.length} of {ranked.length} names
                </div>
              </div>
              {list.length === 0 ? (
                <AbsentCell reason={`No holding priced at both ends of its window moved ${heading === "Contributors" ? "up" : "down"} over this span.`} />
              ) : (
                <table className="w-full text-sm" data-testid={testid}>
                  <thead>
                    <tr className="label-xs border-b border-ink-700/60 text-slate-400">
                      <th className="py-1.5 pr-2 text-left">Name</th>
                      <th className="py-1.5 pr-2 text-right">Price effect</th>
                      <th className="py-1.5 text-right">Its return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.slice(0, N).map((c) => (
                      <tr key={c.securityKey} className="border-b border-ink-700/30"
                        data-attrib-row={c.securityKey} data-price-effect={c.priceEffect.toFixed(2)}>
                        <td className="py-1.5 pr-2">
                          <StockLink securityKey={c.securityKey} name={c.security} />
                          <div className="text-[10.5px] text-slate-500">
                            {c.from} → {c.to}
                            {c.accounts > 1 && <> · {c.accounts} accounts, added</>}
                          </div>
                        </td>
                        <td className={`py-1.5 pr-2 text-right tabular-nums ${changeColor(c.priceEffect)}`}>
                          {c.priceEffect >= 0 ? "+" : "−"}{money(Math.abs(c.priceEffect))}
                        </td>
                        <td className={`py-1.5 text-right tabular-nums ${changeColor(c.returnPct ?? 0)}`}>
                          {c.returnPct == null ? DASH : fmtPct(c.returnPct, { sign: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
      </div>
      {ranked.length > 5 && (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs text-champagne-300 hover:text-champagne-400"
          data-testid="attrib-more">
          {showAll ? "Show the top five each" : `Show the top ${Math.min(25, Math.max(gainers.length, losers.length))} each`}
        </button>
      )}

      {/* ── THE LAST YEAR, FROM THE MANAGERS' OWN REPORTS ────────────────────
          *"In this last year, return attribution…"* — and this book's own dated
          series is eleven weeks, so it cannot answer that. The archive can: each
          of these accounts publishes a one-year return AND its benchmark's
          one-year return on the SAME document, over the same window, struck by
          the manager who runs the mandate.

          THEY ARE NEVER AVERAGED INTO A BOOK FIGURE, and that refusal is the
          point rather than a caveat. Different fee bases, different benchmarks,
          different end dates — a weighted mean of those is a number no document
          supports. See `managerYears`. */}
      <div className="mt-8">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div className="label-xs text-slate-400">The last year, as each manager publishes it</div>
          <div className="text-[11px] text-slate-500" data-testid="attrib-year-coverage">
            {years.length} of {portfolio.accounts.length} accounts publish a one-year return beside their own benchmark
          </div>
        </div>
        {years.length === 0 ? (
          <AbsentSection
            what="No account publishes a one-year return beside a benchmark on the same document"
            needs="A performance history or fact sheet carrying both. Pairing a portfolio return from one document with a benchmark from another is two windows in one row."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm" data-testid="attrib-years">
              <thead>
                <tr className="label-xs border-b border-ink-700/60 text-slate-400">
                  <th className="py-1.5 pr-2 text-left">Mandate</th>
                  <th className="py-1.5 pr-2 text-right">1 year</th>
                  <th className="py-1.5 pr-2 text-left">Its own benchmark</th>
                  <th className="py-1.5 text-right">Active</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.accountId} className="border-b border-ink-700/30" data-year-row={y.accountId}>
                    <td className="py-1.5 pr-2">
                      <div className="text-slate-200">{nameOf(y.accountId)}</div>
                      <div className="text-[10.5px] text-slate-500">
                        {y.reportType}
                        {y.feeBasis ? ` · ${y.feeBasis} fees` : " · fee basis not stated"}
                      </div>
                    </td>
                    <td className={`py-1.5 pr-2 text-right tabular-nums ${changeColor(y.portfolioPct)}`}>
                      {fmtPct(y.portfolioPct, { sign: true })}
                    </td>
                    <td className="py-1.5 pr-2 text-[11.5px] text-slate-400">
                      {y.benchmarks.map((b) => `${b.name} ${fmtPct(b.pct, { sign: true })}`).join(" · ")}
                    </td>
                    <td className={`py-1.5 text-right tabular-nums ${changeColor(y.activePct)}`}>
                      {fmtPct(y.activePct, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {yearMissing.length > 0 && (
          <div className="mt-2 text-[11px] text-slate-500" data-testid="attrib-year-missing">
            {yearMissing.length} more account{yearMissing.length === 1 ? "" : "s"} publish a return report that carries
            no one-year figure beside a benchmark on the same document — {yearMissing.map(nameOf).join(", ")}. Their
            figures are on Performance, per account and per window. There is no book-wide one-year return here and
            there cannot be one: these mandates report on different fee bases, against different benchmarks, each to
            its own statement date, and a weighted mean of those is a figure no document supports.
          </div>
        )}
      </div>

      {/* ── WHAT THE CORPUS CANNOT ANSWER, AND WHAT WOULD FILL IT ────────────
          *"What was my portfolio value in end of August 2025?"* — measured, not
          assumed: the earliest dated valuation of ANY kind in this archive is
          the ICICI NSDL statement of 2026-03-31, and the earliest belonging to
          an account that publishes twice is 2026-05-31. Two substitutes were
          available and both are refused above; the ask is one document. */}
      <div className="mt-6 rounded-lg border border-ink-700/60 bg-ink-800/30 p-3 text-[11px] text-slate-400"
        data-testid="attrib-cannot">
        <div className="label-xs mb-1 text-slate-400">What this window cannot reach</div>
        A value for <strong className="text-slate-300">any date before {BOOK_NAV_COVERAGE.from}</strong> is not in this
        book. The archive's earliest dated valuation of any kind is 2026-03-31, so a comparison against August 2025 —
        or any calendar year — has no opening side, and neither the cost basis (dated on 3 of{" "}
        {portfolio.positions.length} positions) nor the family's own contribution record is a valuation. What would
        fill it is one holdings statement per account dated on or before the date in question.
        {" "}The remaining {portfolio.accounts.length - a.accounts.length} accounts, worth{" "}
        {money(a.bookValue - a.coveredBookValue)}, publish one dated statement or none, so nothing in them can be
        attributed at all — a level is not a change.
      </div>

      {/* Per-account, because a reader who sees a bridge wants to know which
          mandate moved it — and each row carries the window it was struck over,
          which differs by weeks between managers. */}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300">
          Per account — {accounts.length} windows
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm" data-testid="attrib-accounts">
            <thead>
              <tr className="label-xs border-b border-ink-700/60 text-slate-400">
                <th className="py-1.5 pr-2 text-left">Mandate</th>
                <th className="py-1.5 pr-2 text-left">Window</th>
                <th className="py-1.5 pr-2 text-right">Opening</th>
                <th className="py-1.5 pr-2 text-right">Price</th>
                <th className="py-1.5 pr-2 text-right">Trading</th>
                <th className="py-1.5 pr-2 text-right">In / out</th>
                <th className="py-1.5 pr-2 text-right">Not split</th>
                <th className="py-1.5 text-right">Closing</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((x) => (
                <tr key={x.accountId} className="border-b border-ink-700/30" data-account-window={x.accountId}>
                  <td className="py-1.5 pr-2 text-slate-200">{nameOf(x.accountId)}</td>
                  <td className="py-1.5 pr-2 text-[11px] text-slate-500">{x.from} → {x.to} · {x.days}d</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-300">{money(x.openValue)}</td>
                  {/* ── A ZERO PRICE EFFECT AND NO PRICE EFFECT ARE NOT THE SAME
                         CELL ──────────────────────────────────────────────────
                      360 ONE's account holds ONE AIF unit line marked at a total
                      value with no per-unit price, so no split exists for it at
                      all — and its value still moved ₹1.44 Cr → ₹1.47 Cr. Printed
                      as `+₹0` that reads "this mandate went nowhere", which is a
                      measurement nothing made. The account has no priced row, so
                      both cells are absent WITH THE REASON and the change is in
                      Not split, where it can be seen. */}
                  {x.rowsHeld === 0 ? (
                    <>
                      <td className="py-1.5 pr-2 text-right">
                        <AbsentCell reason={`No holding in this account carries a per-unit price on both statements — ${x.rowsUnpriced} row(s) are marked at a total value only, so there is no price/trading split to make. The change is in Not split.`} />
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <AbsentCell reason="Same reason as the price cell: units traded cannot be valued without a per-unit mark." />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={`py-1.5 pr-2 text-right tabular-nums ${changeColor(x.priceEffect)}`}>
                        {x.priceEffect >= 0 ? "+" : "−"}{money(Math.abs(x.priceEffect))}
                      </td>
                      <td className={`py-1.5 pr-2 text-right tabular-nums ${changeColor(x.tradeEffect)}`}>
                        {x.tradeEffect >= 0 ? "+" : "−"}{money(Math.abs(x.tradeEffect))}
                      </td>
                    </>
                  )}
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-400">
                    {x.enteredValue || x.exitedValue
                      ? <>+{money(x.enteredValue)} / −{money(x.exitedValue)}</>
                      : DASH}
                  </td>
                  {/* THE COLUMN THAT MAKES THE ROW TIE. Without it 360 ONE reads
                      open ₹1.44 Cr, price ₹0, trading ₹0, in/out —, close
                      ₹1.47 Cr, and a reader who adds the printed cells and gets
                      a different answer has found a contradiction no popover
                      rescues. Every row here now adds across. */}
                  <td className={`py-1.5 pr-2 text-right tabular-nums ${x.undecomposedValue ? changeColor(x.undecomposedValue) : "text-slate-400"}`}>
                    {x.undecomposedValue
                      ? <>{x.undecomposedValue >= 0 ? "+" : "−"}{money(Math.abs(x.undecomposedValue))}</>
                      : DASH}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-200">{money(x.closeValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
