import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Wallet, Layers, TrendingUp, Coins, Activity, Building2 } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, sumOrNull, consolidatedMarketValue } from "@/lib/analytics";
import { fmtCurrency, fmtNum, fmtPct, fmtDate, changeColor, DASH } from "@/lib/format";
import { AbsentValue, AbsentCell } from "@/components/Absent";
import { Auditable } from "@/components/Auditable";
import { ledgerHref, auditHref, LEDGER } from "@/lib/auditFormulas";
import { loadStockLedger, type StockLedger } from "@/lib/ledger";
import { symbolFor } from "@/lib/quotes";
import { accountIndex, ownerOf, providerOf, strategyOf } from "@/lib/accounts";
import { ResearchPanel } from "@/components/ResearchPanel";
import { ReturnsTable } from "@/components/ReturnsTable";
import { InvestmentTools } from "@/components/InvestmentTools";
import { CompanyResearchPreview } from "@/components/CompanyResearchPreview";

// Per-stock drill-down: how one security is held across the family's entities, its
// tax basis, every dated buy/sell from the ledger, and — from the muns research
// endpoints — street estimates, screener financial tables and concall documents.
export function StockInfo() {
  // Keyed by securityKey — this book's providers mostly print a name and nothing
  // else, so an ISIN route would leave most holdings unreachable.
  const { securityKey = "" } = useParams();
  const { portfolio, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  const [led, setLed] = useState<StockLedger | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setLed(undefined);
    loadStockLedger(securityKey).then((r) => { if (alive) setLed(r); });
    return () => { alive = false; };
  }, [securityKey]);

  const rows = useMemo(() => (portfolio ? portfolio.positions.filter((p) => p.securityKey === securityKey) : []), [portfolio, securityKey]);
  // Denominator for this security's weight in the book — consolidated.
  const listedMV = useMemo(() => (portfolio ? consolidatedMarketValue(portfolio.positions) : 0), [portfolio]);
  const accIdx = useMemo(() => accountIndex(portfolio?.accounts ?? []), [portfolio]);
  if (!portfolio) return null;

  const name = rows[0]?.security ?? led?.name ?? securityKey;
  const sector = rows[0]?.sector;
  const providerSector = rows[0]?.providerSector;
  const isin = rows[0]?.isin;
  const cmp = rows[0]?.currentPrice ?? 0;
  const qty = sum(rows.map((r) => r.quantity));
  const cost = sum(rows.map((r) => r.costBasis));
  const mv = sum(rows.map((r) => r.marketValue));
  const pnl = sum(rows.map((r) => r.unrealizedPnL));
  const avgCost = qty > 0 ? cost / qty : 0;
  const ret = cost > 0 ? (pnl / cost) * 100 : 0;
  const weight = listedMV > 0 ? (mv / listedMV) * 100 : 0;
  // Null, not zero, when no statement supplied the figure — see sumOrNull.
  const stCost = sumOrNull(rows.map((r) => r.stCostBasis));
  const ltCost = sumOrNull(rows.map((r) => r.ltCostBasis));
  const div = sumOrNull(rows.map((r) => r.dividendReceived));
  // Live-quote state for this name. Every lot shares one quote, so this is
  // all-or-nothing in practice; the day move is summed across the lots.
  const sym = rows[0] ? symbolFor(rows[0]) : null;
  const live = rows.length > 0 && rows.every((r) => r.live);
  const dayPct = live ? rows[0]?.dayChangePct ?? null : null;
  const dayChange = sum(rows.map((r) => r.dayChange ?? 0));
  const held = rows.length;
  const exited = held === 0;

  const price = (n: number) => fmtCurrency(convertFromBase(n), displayCurrency);
  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const buys = (led?.txns ?? []).filter((t) => t.side === "Buy");
  const firstBought = buys.length ? buys[buys.length - 1].date : null;
  const lastAdded = buys.length ? buys[0].date : null;
  // Null when the long-term cost is unknown — the bar is hidden rather than
  // drawn at zero, which would read as "none of this is long-term".
  const ltPct = ltCost !== null && cost > 0 ? (ltCost / cost) * 100 : null;

  return (
    <div>
      <div className="mb-2 text-[12px] text-slate-500">
        <Link to="/monitor" className="text-champagne-400 hover:underline">Portfolio Monitor</Link>
        <span className="mx-1.5">›</span>Stock Info
      </div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/monitor" className="mb-1 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-300">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to holdings
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {sector && <Pill tone="info">{sector}</Pill>}
            {/* The provider's own sector label, kept alongside ours — the
                taxonomies differ per platform and neither is authoritative. */}
            {providerSector && providerSector !== sector && (
              <Pill><span title="Sector exactly as the provider printed it">{providerSector}</span></Pill>
            )}
            {isin
              ? <span className="mono text-[11px] text-slate-500">{isin}</span>
              : <span className="text-[11px] text-slate-600" title="This provider reports no ISIN for this holding.">no ISIN reported</span>}
            {sym && <span className="mono text-[11px] text-slate-500">{sym}</span>}
            <Pill>{exited ? "Position closed" : `Held in ${held} ${held === 1 ? "entity" : "entities"}`}</Pill>
          </div>
        </div>
        {!exited && (
          <div className="text-right">
            <div className="mono text-2xl font-semibold text-slate-100">{price(cmp)}</div>
            <div className="mt-0.5 text-[10.5px] text-slate-500">
              {live ? `CMP \u00b7 live${sym ? ` \u00b7 ${sym}` : ""}` : `CMP \u00b7 statement mark${rows[0] ? `, ${accIdx.get(rows[0].accountId)?.asOf ?? portfolio.asOf}` : ""} \u2014 no live quote for this security`}
            </div>
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Holding value" value={<Auditable to={ledgerHref(name)} title="Holding value — trace to the ledger">{fmtFromBase(mv, { compact: true })}</Auditable>} sub={`${weight.toFixed(1)}% of listed book`} icon={<Wallet className="h-4 w-4" />} />
        <Kpi label="Quantity" value={fmtNum(qty)} sub="shares held" icon={<Layers className="h-4 w-4" />} />
        <Kpi label="Avg cost" value={<span className="mono">{price(avgCost)}</span>} sub={`invested ${money(cost)}`} icon={<Coins className="h-4 w-4" />} />
        <Kpi label="Unrealised P&L" value={<span className={changeColor(pnl)}><Auditable to={ledgerHref(name)} title="Unrealised P&L — trace to the ledger">{fmtFromBase(pnl, { compact: true, sign: true })}</Auditable></span>} delta={ret} sub="on cost" icon={<TrendingUp className="h-4 w-4" />} />
        {/* Realised P&L exists only where a capital gain statement covers this
            name's sells. Null is not zero: the sells may be real and what they
            realised simply never reported. */}
        <Kpi label="Realised P&L"
          value={led === undefined ? "…" : led?.realizedProfit == null
            ? <AbsentValue />
            : <span className={changeColor(led.realizedProfit)}><Auditable to={ledgerHref(name)} title="Realised P&L — trace to the ledger">{fmtFromBase(led.realizedProfit, { compact: true, sign: true })}</Auditable></span>}
          sub={led === undefined ? "booked on exits" : led?.realizedProfit == null
            ? <span className="text-slate-500">no capital gain statement covers this name</span>
            : "booked on exits"}
          icon={<Activity className="h-4 w-4" />} />
        <Kpi label="Change today"
          value={dayPct == null ? <span className="text-slate-500">—</span> : <span className={changeColor(dayPct)}>{fmtPct(dayPct, { sign: true })}</span>}
          sub={dayPct == null ? "no live quote" : `${fmtFromBase(dayChange, { compact: true, sign: true })} on the position`}
          icon={<Building2 className="h-4 w-4" />} />
      </div>

      {exited ? (
        <Card className="mt-5" title="Position" subtitle="This name is fully exited — no current holding.">
          <p className="text-sm text-slate-400">Realised P&amp;L and the full transaction history are below.</p>
        </Card>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Position by account" subtitle="How this name is held \u2014 owning entity, and the platform that runs the account" pad={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full whitespace-nowrap text-sm">
                <thead className="border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Managed by</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Qty</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Avg cost</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Invested</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Current</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Unreal. P&L</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {[...rows].sort((a, b) => b.marketValue - a.marketValue).map((r) => (
                    <tr key={r.accountId} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5 font-medium text-slate-100">{ownerOf(accIdx, r)}</td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-400">
                        {providerOf(accIdx, r)}
                        {strategyOf(accIdx, r) && <div className="text-[10px] text-slate-600">{strategyOf(accIdx, r)}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(r.quantity)}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">{r.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" /> : price(r.avgCost)}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">{money(r.costBasis)}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-200"><Auditable to={ledgerHref(name)} title="Current value — trace to the ledger">{money(r.marketValue)}</Auditable></td>
                      <td className={`px-4 py-2.5 text-right mono ${changeColor(r.unrealizedPnL)}`}>{money(r.unrealizedPnL, true)}</td>
                      <td className={`px-4 py-2.5 text-right mono ${changeColor(r.returnPct)}`}>{fmtPct(r.returnPct, { sign: true, decimals: 1 })}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${(r.ltCostBasis ?? 0) >= (r.stCostBasis ?? 0) ? "bg-emerald-500/15 text-gain" : "bg-amber-500/15 text-amber-400"}`}>{r.stCostBasis === null && r.ltCostBasis === null ? DASH : (r.ltCostBasis ?? 0) >= (r.stCostBasis ?? 0) ? "LT" : "ST"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-ink-600 font-semibold">
                  <tr>
                    <td className="px-4 py-2.5 text-left text-slate-200">Total</td>
                    <td />
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(qty)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{price(avgCost)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{money(cost)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(pnl)}`}>{money(pnl, true)}</td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(ret)}`}>{fmtPct(ret, { sign: true, decimals: 1 })}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card title="Tax basis & holding">
            <div className="flex items-center justify-between py-2 text-sm"><span className="text-slate-400">Long-term cost</span><span className="mono text-slate-100">{ltCost === null ? DASH : money(ltCost)}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Short-term cost</span><span className="mono text-slate-100">{stCost === null ? DASH : money(stCost)}</span></div>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full border border-ink-700">
              <div style={{ width: `${ltPct ?? 0}%`, background: "#10b981" }} />
              <div style={{ width: `${ltPct === null ? 0 : 100 - ltPct}%`, background: "rgba(245,158,11,.5)" }} />
            </div>
            {/* No lot dates in this book, so the split is unknown — say so rather
                than drawing an empty bar that reads as "all short-term". */}
            <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-500">
              {ltPct === null
                ? <span>Long-term / short-term split {DASH} no lot dates on the statements</span>
                : <><span>Long-term {ltPct.toFixed(0)}%</span><span>Short-term {(100 - ltPct).toFixed(0)}%</span></>}
            </div>
            {/* A purchase date only exists where the statements' window covers
                the buy. Absent here means "not in this window", not "never
                bought" — the tooltip says which. */}
            <div className="mt-2 flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">First bought</span><span className="mono text-slate-100">{firstBought ? fmtDate(firstBought) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover — this holding predates it" />}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Last added</span><span className="mono text-slate-100">{lastAdded ? fmtDate(lastAdded) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover" />}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Dividends recorded</span><span className="mono text-slate-100">{div !== null && div > 0 ? fmtFromBase(div, { compact: true }) : <AbsentCell reason="no dividend statement in this book records an event in this name" />}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Weight in listed book</span><span className="mono text-slate-100">{weight.toFixed(1)}%</span></div>
          </Card>
        </div>
      )}

      {/* Transaction history */}
      <Card className="mt-5" title="Transaction history" subtitle='Every dated buy & sell from the ledger — the "Transaction Info" drill-down' pad={false}
        right={led && led.txns.length ? <Pill>{led.txns.length} rows · {led.txns.filter((t) => t.side === "Sell").length} sells</Pill> : undefined}>
        <div className="max-h-[460px] overflow-auto">
          {led === undefined ? (
            <div className="grid h-32 place-items-center text-sm text-slate-500">Loading transactions…</div>
          ) : led == null ? (
            <div className="grid h-32 place-items-center px-6 text-center text-sm text-slate-500">
              The audit archive didn't respond. Refresh to retry — it is served alongside the app, so this is the
              archive being unreachable rather than your session being stale.
            </div>
          ) : led.txns.length === 0 ? (
            <div className="grid h-32 place-items-center px-6 text-center text-[12.5px] leading-relaxed text-slate-500">
              <span className="max-w-md">
                No transaction in this name over the window the statements cover
                {led.periodFrom && led.periodTo ? <> ({fmtDate(led.periodFrom)} → {fmtDate(led.periodTo)})</> : null}.
                A holding bought before that window and untraded since carries no row here — the transaction
                statements are a period record, not a lot history.
              </span>
            </div>
          ) : (
            <table className="min-w-full whitespace-nowrap text-sm">
              <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Date</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Type</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Qty</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Rate</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {led.txns.map((t, i) => (
                  <tr key={i} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2 mono text-[12px] text-slate-400">{fmtDate(t.date)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.side === "Buy" ? "bg-indigo-500/10 text-indigo-300" : "bg-red-500/15 text-loss"}`}>{t.side === "Buy" ? "BUY" : "SELL"}</span>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-slate-300">{t.account}</td>
                    <td className="px-4 py-2 text-right mono text-slate-300">{fmtNum(t.qty)}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{price(t.rate)}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200"><Auditable to={ledgerHref(name)} title="Trace this transaction in Data Audit">{fmtFromBase(t.amount, { compact: true })}</Auditable></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <ReturnsTable
        ticker={sym}
        price={rows[0]?.currentPrice ?? null}
        priceIsLive={live}
        asOf={rows[0] ? accIdx.get(rows[0].accountId)?.asOf ?? portfolio.asOf : portfolio.asOf}
      />

      <InvestmentTools
        securityKey={securityKey}
        name={name}
        price={rows[0]?.currentPrice ?? null}
        priceIsLive={live}
      />

      <ResearchPanel ticker={sym} name={name} />

      {/* Deep company research — the FOOS spec's full company page, as an
          illustrative preview below the live sections. */}
      <CompanyResearchPreview name={name} ticker={sym} />

      <p className="mt-4 text-[11px] text-slate-500">
        Figures are live from the current book and the dated ledger. Amounts are auditable — click any dotted number to trace it in <Link to={auditHref(LEDGER)} className="text-champagne-400 hover:underline">Data Audit</Link>.
      </p>
    </div>
  );
}
