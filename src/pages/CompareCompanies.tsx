import { useEffect, useMemo, useState } from "react";
import { X, Plus, GitCompare } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { SearchInput } from "@/components/SearchInput";
import { StockLink } from "@/components/StockLink";
import { Markdown } from "@/components/Markdown";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, consolidatedMarketValue, dedupedPositions, sumOrNull } from "@/lib/analytics";
import { symbolFor } from "@/lib/quotes";
import { fmtPct, changeColor } from "@/lib/format";
import { fetchRatios, isRatiosError, DEFAULT_METRICS, type Ratios, type RatiosError } from "@/lib/ratios";
import { fetchReturnsTable, type ReturnsTable } from "@/lib/returnsTable";
import { readWatchlist, upsidePct } from "@/lib/watchlist";
import type { Position } from "@/lib/types";

// COMPARE UP TO FOUR COMPANIES — the client spec's comparison screen.
//
// WHERE THE CANDIDATES COME FROM. The picker lists the book's OWN holdings and
// nothing else. Seeding it with a set of well-known tickers would put security
// names on screen that no statement in this book mentions, which the conventions
// forbid: nothing is hardcoded that isn't derived from the book.
//
// WHAT IS COMPARED, AND ON WHAT AUTHORITY
//
//   Position, cost, value, weight, return   the book — statement or live basis
//   Price, market cap, 52-week range        the quote feed — a verified shape
//   Target price, upside                    the family's own view (local)
//   Ratios (PE, PB, EV/EBITDA, ROE, ROCE…)  muns ratio_source — PROSE, verbatim
//   Returns over ten horizons               muns market_data, one close per period
//
// The ratio block is shown as the upstream wrote it rather than parsed into a
// grid. That is a deliberate limit: the endpoint returns text/plain with no
// documented schema, and deciding which number in an undocumented blob is which
// company's PE is exactly how a figure nobody can trace enters a dashboard whose
// whole claim is that every figure traces to a source.

const MAX = 4;

type Candidate = {
  securityKey: string;
  security: string;
  symbol: string | null;
  sector: string;
  rows: Position[];
};

export function CompareCompanies() {
  const { portfolio, consolidated, fmtFromBase, basis } = usePortfolio();
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [ratios, setRatios] = useState<Ratios | RatiosError | null | undefined>(undefined);
  const [returns, setReturns] = useState<Record<string, ReturnsTable | null>>({});
  const watchlist = useMemo(() => readWatchlist(), []);

  // One row per SECURITY, not per position: the same name is held by several
  // accounts and comparing it against itself is not a comparison.
  const candidates = useMemo<Candidate[]>(() => {
    if (!portfolio) return [];
    const m = new Map<string, Candidate>();
    for (const p of portfolio.positions) {
      const c = m.get(p.securityKey);
      if (c) { c.rows.push(p); continue; }
      m.set(p.securityKey, {
        securityKey: p.securityKey,
        security: p.security,
        symbol: symbolFor(p),
        sector: p.sector,
        rows: [p],
      });
    }
    return [...m.values()].sort((a, b) =>
      sum(b.rows.map((r) => r.marketValue)) - sum(a.rows.map((r) => r.marketValue)));
  }, [portfolio]);

  const chosen = useMemo(
    () => picked.map((k) => candidates.find((c) => c.securityKey === k)).filter((c): c is Candidate => !!c),
    [picked, candidates],
  );
  const tickers = useMemo(
    () => chosen.map((c) => c.symbol).filter((s): s is string => !!s),
    [chosen],
  );

  // Ratios: one call for the whole set — the only endpoint in the catalogue that
  // takes several tickers at once.
  useEffect(() => {
    if (!tickers.length) { setRatios(null); return; }
    let alive = true;
    setRatios(undefined);
    fetchRatios(tickers, DEFAULT_METRICS, { formulas: true }).then((r) => { if (alive) setRatios(r); });
    return () => { alive = false; };
  }, [tickers.join(",")]);

  // Returns: one call PER company. Each is twelve dated closes, and the history
  // endpoint caps a single request at sixteen dates, so four companies cannot
  // share one call.
  useEffect(() => {
    let alive = true;
    for (const c of chosen) {
      const price = c.rows[0]?.currentPrice ?? null;
      if (!c.symbol || price === null || !(price > 0)) continue;
      if (c.securityKey in returns) continue;
      fetchReturnsTable(c.symbol, price).then((t) => {
        if (alive) setReturns((r) => ({ ...r, [c.securityKey]: t }));
      });
    }
    return () => { alive = false; };
    // `returns` is read to skip work already done and must not re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  if (!portfolio) return null;
  const totalMV = consolidatedMarketValue(portfolio.positions);
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });

  const filtered = candidates
    .filter((c) => !picked.includes(c.securityKey))
    .filter((c) => !q.trim() || c.security.toLowerCase().includes(q.toLowerCase().trim())
      || (c.symbol ?? "").toLowerCase().includes(q.toLowerCase().trim()))
    .slice(0, 40);

  const add = (k: string) => setPicked((p) => (p.length >= MAX || p.includes(k) ? p : [...p, k]));
  const remove = (k: string) => setPicked((p) => p.filter((x) => x !== k));

  /** One measured row of the comparison grid. */
  const metric = (label: string, hint: string, render: (c: Candidate) => React.ReactNode) => (
    <tr key={label}>
      <th scope="row" className="whitespace-nowrap px-4 py-2 text-left text-[12px] font-medium text-slate-400" title={hint}>{label}</th>
      {chosen.map((c) => (
        <td key={c.securityKey} className="px-4 py-2 text-right mono text-slate-200">{render(c)}</td>
      ))}
    </tr>
  );

  return (
    <div>
      <PageHeader
        eyebrow="RESEARCH"
        title="Compare companies"
        subtitle={<>Up to {MAX} names side by side — position, price, ratios and returns. The picker lists this book’s own holdings; a name that appears in no statement here has nothing to compare.</>}
        right={<BasisPill liveText="Position and price move with the feed; ratios and filings do not." />}
      />

      <Card
        title="Pick companies"
        subtitle={`${picked.length} of ${MAX} selected${picked.length >= MAX ? " — remove one to add another" : ""}`}
        right={<Pill>{candidates.length} securities in the book</Pill>}
      >
        {chosen.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {chosen.map((c) => (
              <span key={c.securityKey} className="inline-flex items-center gap-1.5 rounded-md border border-champagne-400/40 bg-champagne-400/10 px-2 py-1 text-[12px] text-champagne-400">
                {c.security}
                {c.symbol && <span className="text-[10px] text-slate-500">{c.symbol}</span>}
                <button type="button" onClick={() => remove(c.securityKey)} aria-label={`Remove ${c.security}`} className="hover:text-slate-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <SearchInput value={q} onChange={setQ} placeholder="Filter by security name or NSE symbol…" />
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-ink-700/70">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-slate-500">
              {q.trim() ? "No holding in this book matches that." : "Every holding is already selected."}
            </div>
          )}
          {filtered.map((c) => (
            <button
              key={c.securityKey}
              type="button"
              disabled={picked.length >= MAX}
              onClick={() => add(c.securityKey)}
              className="flex w-full items-center gap-3 border-b border-ink-700/50 px-4 py-2 text-left last:border-0 hover:bg-ink-700/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">{c.security}</span>
              <span className="shrink-0 text-[11px] text-slate-500">{c.sector}</span>
              <span className="mono w-16 shrink-0 text-right text-[11px] text-slate-600">{c.symbol ?? "—"}</span>
              <span className="mono w-20 shrink-0 text-right text-[12px] text-slate-400">
                {money(sum(c.rows.map((r) => r.marketValue)))}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {chosen.length === 0 && (
        <Card className="mt-5">
          <AbsentSection
            what="Nothing selected yet"
            needs="Pick up to four holdings above. Every figure below is measured for the names you choose — none of it is precomputed, and nothing is shown for a company this book does not hold."
          >
            <GitCompare className="mt-1 h-4 w-4 text-slate-600" />
          </AbsentSection>
        </Card>
      )}

      {chosen.length > 0 && (
        <Card className="mt-5" title="Side by side" subtitle="Position and price from the book and the quote feed; the target is our own view." pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-ink-700/70">
                  <th className="label-xs px-4 py-2 text-left font-medium">Metric</th>
                  {chosen.map((c) => (
                    <th key={c.securityKey} className="px-4 py-2 text-right">
                      <StockLink securityKey={c.securityKey} name={c.security} />
                      <div className="mono text-[10px] font-normal text-slate-600">{c.symbol ?? "no NSE symbol"}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {metric("Sector", "Our normalised sector, from the provider's own taxonomy", (c) => (
                  <span className="text-[12px] text-slate-400">{c.sector}</span>
                ))}
                {metric("Held by", "How many of the family's accounts carry this name", (c) => c.rows.length)}
                {metric("Quantity", "Total units held across every account", (c) =>
                  sum(c.rows.map((r) => r.quantity)).toLocaleString("en-IN"))}
                {metric("Price", "Live where a quote resolved, otherwise the statement mark", (c) =>
                  c.rows[0]?.currentPrice === null || c.rows[0]?.currentPrice === undefined
                    ? <AbsentCell reason="marked at a total value, not a per-unit price" />
                    : fmtFromBase(c.rows[0].currentPrice!))}
                {metric("Average cost", "Total cost over total quantity", (c) => {
                  const qty = sum(c.rows.map((r) => r.quantity));
                  const cost = sumOrNull(c.rows.map((r) => r.costBasis));
                  return cost !== null && qty > 0
                    ? fmtFromBase(cost / qty)
                    : <AbsentCell reason={qty > 0 ? "no cost basis on any statement for this name" : "no quantity"} />;
                })}
                {metric("Invested", "Cost basis across every account holding it", (c) =>
                  money(sumOrNull(c.rows.map((r) => r.costBasis))))}
                {metric("Current value", "Market value across every account", (c) =>
                  money(sum(c.rows.map((r) => r.marketValue))))}
                {metric("Unrealised P&L", "Current value less cost", (c) => {
                  const pnl = sumOrNull(c.rows.map((r) => r.unrealizedPnL));
                  return <span className={changeColor(pnl)}>{money(pnl, true)}</span>;
                })}
                {metric("Return on cost", "Holding-period return, not annualised", (c) => {
                  const cost = sumOrNull(c.rows.map((r) => r.costBasis));
                  const pnl = sumOrNull(c.rows.map((r) => r.unrealizedPnL));
                  return cost !== null && pnl !== null && cost > 0
                    ? <span className={changeColor(pnl / cost)}>{fmtPct((pnl / cost) * 100, { sign: true })}</span>
                    : <AbsentCell reason="no cost basis" />;
                })}
                {metric("Weight in book", "Share of consolidated NAV, each duplicate counted once", (c) =>
                  totalMV > 0 ? fmtPct((sum(c.rows.map((r) => r.marketValue)) / totalMV) * 100, { decimals: 2 }) : <AbsentCell reason="no book value" />)}
                {metric("Target price", "Our own view — set it on the company page", (c) => {
                  const t = watchlist[c.securityKey]?.targetPrice ?? null;
                  return t === null ? <AbsentCell reason="no target set for this name" /> : fmtFromBase(t);
                })}
                {metric("Upside to target", "Target over current price", (c) => {
                  const u = upsidePct(c.rows[0]?.currentPrice ?? null, watchlist[c.securityKey]?.targetPrice ?? null);
                  return u === null
                    ? <AbsentCell reason="needs both a target and a current price" />
                    : <span className={changeColor(u)}>{fmtPct(u, { sign: true, decimals: 1 })}</span>;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {chosen.length > 0 && (
        <Card className="mt-5" title="Returns" subtitle="One resolved close per period, per company. A period the feed could not answer is absent, never filled from a nearer date." pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-ink-700/70">
                  <th className="label-xs px-4 py-2 text-left font-medium">Period</th>
                  {chosen.map((c) => (
                    <th key={c.securityKey} className="px-4 py-2 text-right text-[12px] font-medium text-slate-300">{c.security}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {(returns[chosen[0].securityKey]?.rows ?? []).map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="whitespace-nowrap px-4 py-2 text-left text-[12px] font-medium text-slate-400">{row.label}</th>
                    {chosen.map((c) => {
                      const t = returns[c.securityKey];
                      if (t === undefined) return <td key={c.securityKey} className="px-4 py-2 text-right text-[11px] text-slate-600">…</td>;
                      const r = t?.rows.find((x) => x.key === row.key);
                      return (
                        <td key={c.securityKey} className={`px-4 py-2 text-right mono ${r?.pct == null ? "" : changeColor(r.pct)}`}>
                          {r?.pct == null
                            ? <AbsentCell reason={r?.reason ?? (c.symbol ? "no closes resolved for this company" : "no NSE symbol, so no closes to measure against")} />
                            : fmtPct(r.pct, { sign: true, decimals: 1 })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!returns[chosen[0].securityKey] && (
            <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] text-slate-500">
              Resolving closes — or none could be resolved for the first selection, in which case the
              rows above stay empty rather than showing another company’s periods.
            </p>
          )}
        </Card>
      )}

      {chosen.length > 0 && (
        <Card
          className="mt-5"
          title="Ratios"
          subtitle={<>{DEFAULT_METRICS.join(" · ")} — as the data service wrote them. Nothing here is parsed into a figure, because the endpoint publishes no schema that says which number belongs to which company.</>}
          right={tickers.length < chosen.length ? <Pill>{chosen.length - tickers.length} without an NSE symbol</Pill> : undefined}
        >
          {tickers.length === 0 && (
            <AbsentSection
              what="None of the selected companies has an NSE symbol"
              needs="Ratios are looked up by ticker. Cash, receivables and fund units have no listing, so there is nothing to look up."
            />
          )}
          {tickers.length > 0 && ratios === undefined && (
            <div className="py-6 text-center text-xs text-slate-500">Fetching ratios…</div>
          )}
          {tickers.length > 0 && ratios && isRatiosError(ratios) && (
            <AbsentSection
              what="The ratio service didn’t answer"
              needs={`Reported ${ratios.failureCode}${ratios.upstreamStatus ? ` (HTTP ${ratios.upstreamStatus})` : ""}. This panel stays empty rather than showing ratios from a response we didn’t get.`}
            />
          )}
          {tickers.length > 0 && ratios && !isRatiosError(ratios) && (
            <>
              <Markdown text={ratios.text} />
              {ratios.formulas && (
                <details className="mt-4 border-t border-ink-700/70 pt-3">
                  <summary className="cursor-pointer text-[12px] text-slate-400">How each ratio is defined</summary>
                  <div className="mt-2"><Markdown text={ratios.formulas} /></div>
                </details>
              )}
            </>
          )}
        </Card>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        The spec also asks to compare operating metrics, shareholding and capital allocation.
        Those need per-company fundamentals the current API set returns only as prose on a
        single-company page — see the Financials tab on any company. Comparing them across four
        names needs a structured fundamentals endpoint this cockpit does not have.
      </p>
    </div>
  );
}
