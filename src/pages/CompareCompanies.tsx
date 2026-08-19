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
import { sum, consolidatedMarketValue, dedupedPositions, sumOrNull, isCompanyShare, isFundVehicle } from "@/lib/analytics";
import { symbolFor } from "@/lib/quotes";
import { fmtPct, changeColor } from "@/lib/format";
import { fetchRatios, isRatiosError, DEFAULT_METRICS, type Ratios, type RatiosError } from "@/lib/ratios";
import { fetchPriceHistory, type PriceResult } from "@/lib/prices";
import { HORIZON_COLS, fmtReturn } from "@/lib/series";
import { readWatchlist, upsidePct } from "@/lib/watchlist";
import { accountIndex } from "@/lib/accounts";
import type { Position } from "@/lib/types";
import { isOutage, outageHeadline, outageSentence } from "@/lib/upstreamStatus";

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
//   Returns over twelve horizons            /api/prices — the security's own
//                                           settled closes, computed at the edge
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
  const [returns, setReturns] = useState<Record<string, PriceResult>>({});
  const watchlist = useMemo(() => readWatchlist(), []);
  // Per-account report dates — a statement mark closes on its own account's date.
  const accIdx = useMemo(() => accountIndex(portfolio?.accounts ?? []), [portfolio]);

  /**
   * One row per SECURITY, not per position: the same name is held by several
   * accounts and comparing it against itself is not a comparison.
   *
   * AND THE PICKER LISTS COMPANIES, WHICH IS WHAT THIS PAGE COMPARES. Every row
   * it offers is a share in a company (`isCompanyShare`). A fund unit and a cash
   * line were in the list too, so a reader could put "Sanshi Fund-I (Open Ended
   * AIF CAT-III) — Class E" and "Cash" side by side under a heading that reads
   * "Compare companies" — with a PE column, a filings row and a returns table
   * that can never be filled for either. This is not a narrowing that hides
   * value: the fund's own figures are on Portfolio Monitor's AIF section and on
   * its holding page. It is the page answering the question it asks.
   */
  const candidates = useMemo<Candidate[]>(() => {
    if (!portfolio) return [];
    const m = new Map<string, Candidate>();
    for (const p of portfolio.positions) {
      if (!isCompanyShare(p)) continue;
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
    // COUNT ONCE per candidate: a name reported under two members (360 ONE, the
    // Transition trust) shares one securityKey, so its lots include both rows.
    // Dedupe them or "Weight in book" doubles — while the column's own hint says
    // "each duplicate counted once".
    return [...m.values()]
      .map((c) => ({ ...c, rows: dedupedPositions(c.rows) }))
      .sort((a, b) => sum(b.rows.map((r) => r.marketValue)) - sum(a.rows.map((r) => r.marketValue)));
  }, [portfolio]);

  /** Fund units and cash the picker does not offer — named, never silently dropped. */
  const notCompanies = useMemo(() => {
    if (!portfolio) return { funds: 0, mv: 0 };
    const rows = dedupedPositions(portfolio.positions.filter(isFundVehicle));
    return { funds: new Set(rows.map((p) => p.securityKey)).size, mv: sum(rows.map((p) => p.marketValue)) };
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

  // Returns: ONE call per company against `/api/prices`, which returns the whole
  // daily close history and the returns table computed from it at the edge.
  //
  // This replaces a per-DATE lookup loop. The old path asked the muns
  // `market_data` endpoint one question per horizon — twelve upstream calls per
  // company, capped at sixteen dates — because that endpoint returns a four-row
  // preview of a window rather than a series. It also had to be told which date
  // to close against, and got it wrong for a while: it measured every horizon to
  // TODAY even for a company whose price was still a month-old statement mark.
  //
  // That whole class of bug is gone here. The edge computes every horizon from
  // the security's own settled closes, so there is no "as of" to pass and no way
  // for two pages to disagree — the company page reads the identical payload.
  useEffect(() => {
    let alive = true;
    for (const c of chosen) {
      if (!c.symbol) continue;
      if (c.securityKey in returns) continue;
      fetchPriceHistory(c.symbol).then((t) => {
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
        subtitle={<>Up to {MAX} names side by side — position, price, ratios and returns. The picker lists the companies this book holds directly; a name that appears in no statement here has nothing to compare.</>}
        right={<BasisPill liveText="Position and price move with the feed; ratios and filings do not." />}
      />

      <Card
        title="Pick companies"
        subtitle={`${picked.length} of ${MAX} selected${picked.length >= MAX ? " — remove one to add another" : ""}`}
        right={<Pill>{candidates.length} companies in the book</Pill>}
      >
        {notCompanies.funds > 0 && (
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            The picker lists <span className="text-slate-400">company shares</span> only. {notCompanies.funds}{" "}
            fund {notCompanies.funds === 1 ? "holding" : "holdings"} worth {money(notCompanies.mv)} — AIF folios,
            mutual-fund schemes and ETFs — are not offered here: a fund is a wrapper holding many companies, so it has
            no PE, no filings and no peer set of its own. Its position and return are on Portfolio Monitor.
          </p>
        )}
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
                {HORIZON_COLS.map((col) => (
                  <tr key={col.key}>
                    <th scope="row" className="whitespace-nowrap px-4 py-2 text-left text-[12px] font-medium text-slate-400">
                      {col.label}{col.annualised ? " (CAGR)" : ""}
                    </th>
                    {chosen.map((c) => {
                      const t = returns[c.securityKey];
                      if (t === undefined) return <td key={c.securityKey} className="px-4 py-2 text-right text-[11px] text-slate-600">…</td>;
                      if (!t.ok) {
                        return (
                          <td key={c.securityKey} className="px-4 py-2 text-right">
                            <AbsentCell reason={c.symbol ? `no price history resolved for this company (${t.reason})` : "no NSE symbol, so no closes to measure against"} />
                          </td>
                        );
                      }
                      const v = t.returns[col.key];
                      const span = t.spans[col.key];
                      return (
                        <td key={c.securityKey} className={`px-4 py-2 text-right mono ${v == null ? "" : changeColor(v)}`}
                          title={span ? `${span[0]} → ${span[1]}` : undefined}>
                          {v == null
                            ? <AbsentCell reason={`this listing only goes back to ${t.first}, so the ${col.label} horizon cannot be measured — it is absent rather than computed over a shorter window`} />
                            : fmtReturn(v, "price")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            Every horizon is measured from each company’s OWN settled closes, to its own last trading day — so the
            columns are comparable and a young listing simply has no long horizon rather than a since-listing figure
            standing in for one. 3Y/5Y/10Y/Max are annualised.
          </p>
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
              what={isOutage(ratios) ? outageHeadline : "The ratio service didn’t answer"}
              needs={isOutage(ratios)
                ? outageSentence(ratios, "the ratio comparison")
                : `Reported ${ratios.failureCode}${ratios.upstreamStatus ? ` (HTTP ${ratios.upstreamStatus})` : ""}. This panel stays empty rather than showing ratios from a response we didn’t get.`}
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
