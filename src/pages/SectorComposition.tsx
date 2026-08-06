import { Fragment, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { bySector, sum, consolidatedMarketValue } from "@/lib/analytics";
import { accountIndex, ownerOf } from "@/lib/accounts";
import { fmtPct, fmtCurrency, changeColor } from "@/lib/format";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { BasisPill } from "@/components/BasisPill";
import { Auditable } from "@/components/Auditable";
import { holdingHref, auditHref, LEDGER, returnFormula, weightFormula } from "@/lib/auditFormulas";

const LIVE_CELL = "Recalculated from live prices. Cost basis comes from the ledger; this figure is worked out from it, so it has no workbook cell to trace to.";

export function SectorComposition() {
  const { portfolio, consolidated, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  if (!portfolio) return null;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  /**
   * EVERY FIGURE ON THIS PAGE IS BOOK-WIDE, SO IT READS THE DEDUPED SET.
   *
   * This ran `bySector` over `portfolio.positions`, which carries BOTH rows of a
   * holding reported under two members, while its own printed total came from
   * `consolidatedMarketValue`, which counts each group once. The two sides were
   * on different measurements: the sectors summed to ₹338.61 Cr beside a total
   * of ₹335.43 Cr, Unclassified read ₹239.14 Cr against a true ₹235.97 Cr, and
   * the weights added to 100.95%.
   *
   * Two groups are duplicated in this drop, not one — 360 ONE Special
   * Opportunities Series 8 under both CRNs (₹1.46 Cr) and Transition Venture
   * Fund I under both family trusts (₹1.71 Cr) — so the over-count is ₹3.17 Cr.
   * The drill-down rows come from the same set, or a sector's holdings would not
   * add up to the sector.
   *
   * Per-ACCOUNT and per-OWNER views do the opposite and show both rows as
   * printed; that is Family & Entities, and it is right there for the same
   * reason it is wrong here.
   */
  const p = consolidated;
  const accIdx = accountIndex(portfolio.accounts);
  const totalMV = consolidatedMarketValue(p);
  const sectors = bySector(p);
  // Every figure on this page is rebuilt from position market values, so once the
  // quote feed is up they all track live prices — and none of them matches a cell
  // in the source extract any more. Live figures render plain; only a book still on its
  // workbook marks keeps the audit trail back to the ledger.
  const feedLive = p.some((x) => x.live);
  const liveBySector = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const x of p) m[x.sector] = !!x.live || !!m[x.sector];
    return m;
  }, [p]);
  const chartData = sectors.map((s) => ({ name: s.key, value: convertFromBase(s.mv) }));
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  // Holdings in each sector (newest-value first) — the rows revealed when a sector is expanded.
  const holdingsBySector = useMemo(() => {
    const m: Record<string, typeof p> = {};
    for (const s of sectors) m[s.key] = p.filter((x) => x.sector === s.key).sort((a, b) => b.marketValue - a.marketValue);
    return m;
  }, [p, sectors]);
  const topHolding = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sectors) m[s.key] = holdingsBySector[s.key]?.[0]?.security ?? "—";
    return m;
  }, [sectors, holdingsBySector]);
  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  return (
    <div>
      <PageHeader eyebrow="Allocation" title="Sector Composition"
        right={<div className="flex items-center gap-2">
          <BasisPill liveText={feedLive ? "Live prices" : "Workbook marks"}
            hint="Sector values, weights and returns are rebuilt from live prices; cost basis comes from the statements. Sectors are our normalised taxonomy — each provider's own label is kept per position." />
          <Pill tone="info">{sectors.length} sectors</Pill>
        </div>} />
      <Card className="mt-1">
        <div className="flex flex-col items-center gap-6 md:flex-row md:gap-8">
          {/* Donut on the left, sector total in the hole */}
          <div className="relative shrink-0" style={{ width: 230, height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={96} stroke="none"
                  className="cursor-pointer" onClick={(d: any) => { const nm = d?.name ?? d?.payload?.name; if (nm) toggle(nm); }}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                  formatter={(v: number) => axisFmt(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="label-xs">Listed NAV</div>
              <div className="mono text-base font-semibold text-slate-100">{fmtFromBase(totalMV, { compact: true })}</div>
            </div>
          </div>
          {/* Legend on the right — colour, sector, weight, value */}
          <ul className="grid w-full flex-1 grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
            {sectors.map((s, i) => (
              <li key={s.key} onClick={() => toggle(s.key)}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-ink-700/40">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="flex-1 truncate text-[13px] text-slate-200" title={s.key}>{s.key}</span>
                <span className="mono text-[13px] font-semibold text-slate-100">{(s.weight * 100).toFixed(1)}%</span>
                <span className="mono w-20 text-right text-[11px] text-slate-400">{fmtFromBase(s.mv, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card className="mt-5" title="Sector breakdown" subtitle="Click a sector to expand its holdings" pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Sector</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Positions</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Top holding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {sectors.map((s, i) => {
                  const isOpen = expanded.has(s.key);
                  const rows = holdingsBySector[s.key] ?? [];
                  return (
                    <Fragment key={s.key}>
                      <tr className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(s.key)} aria-expanded={isOpen}>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2 font-medium text-slate-100">
                            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            {s.key}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-200 whitespace-nowrap" title={liveBySector[s.key] ? LIVE_CELL : undefined}>
                          {liveBySector[s.key] ? fmtFromBase(s.mv, { compact: true })
                            : <Auditable formula={{ title: "Sector value", excel: "= Σ market value of the sector's holdings", plain: "Every holding in this sector, added up.", worked: `= ${money(s.mv)} across ${s.count} holdings`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(s.mv, { compact: true })}</Auditable>}
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400" title={liveBySector[s.key] ? LIVE_CELL : undefined}>
                          {liveBySector[s.key] ? `${(s.weight * 100).toFixed(1)}%`
                            : <Auditable formula={weightFormula(s.mv, totalMV, s.weight * 100, money)}>{`${(s.weight * 100).toFixed(1)}%`}</Auditable>}
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400">{s.count}</td>
                        <td className={`px-4 py-2.5 text-right mono ${changeColor(s.returnPct)}`} title={liveBySector[s.key] ? LIVE_CELL : undefined}>
                          {liveBySector[s.key] ? fmtPct(s.returnPct, { sign: true })
                            : <Auditable formula={{ title: "Sector return", excel: "= Σ P&L ÷ Σ Cost × 100", plain: "The value-weighted average return of every holding in this sector — combined gain or loss against combined cost.", worked: `= ${money(s.pnl)} ÷ ${money(s.cost)} × 100 = ${fmtPct(s.returnPct, { sign: true })}`, auditHref: auditHref(LEDGER) }}>{fmtPct(s.returnPct, { sign: true })}</Auditable>}
                        </td>
                        <td className="px-4 py-2.5 text-left text-[12px] text-slate-400"><span className="block max-w-[170px] truncate" title={topHolding[s.key]}>{topHolding[s.key]}</span></td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-ink-900/50">
                          <td colSpan={6} className="px-4 pb-3 pt-1">
                            <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
                              <div className="max-h-[320px] overflow-auto">
                                <table className="min-w-full text-[12px]">
                                  <thead className="sticky top-0 bg-ink-800">
                                    <tr className="border-b border-ink-700/70">
                                      <th className="label-xs px-3 py-1.5 text-left font-medium">Security</th>
                                      <th className="label-xs px-3 py-1.5 text-left font-medium">Entity</th>
                                      <th className="label-xs px-3 py-1.5 text-right font-medium">Market value</th>
                                      <th className="label-xs px-3 py-1.5 text-right font-medium">% of sector</th>
                                      <th className="label-xs px-3 py-1.5 text-right font-medium">Return</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-ink-700/50">
                                    {rows.map((h) => (
                                      <tr key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/30">
                                        <td className="px-3 py-1.5 text-slate-200"><StockLink securityKey={h.securityKey} name={h.security} /></td>
                                        <td className="px-3 py-1.5 text-slate-400">{ownerOf(accIdx, h)}</td>
                                        <td className="px-3 py-1.5 text-right mono text-slate-100" title={h.live ? LIVE_CELL : undefined}>
                                          {h.live ? fmtFromBase(h.marketValue, { compact: true })
                                            : <Auditable to={holdingHref(accIdx.get(h.accountId), h.security)} title="Market value — trace to this account's appraisal">{fmtFromBase(h.marketValue, { compact: true })}</Auditable>}
                                        </td>
                                        <td className="px-3 py-1.5 text-right mono text-slate-400" title={h.live ? LIVE_CELL : undefined}>
                                          {h.live ? `${s.mv > 0 ? ((h.marketValue / s.mv) * 100).toFixed(1) : "0.0"}%`
                                            : <Auditable formula={{ title: "% of sector", excel: "= Market value ÷ Sector value × 100", plain: "How big this holding is as a share of its sector.", worked: `= ${money(h.marketValue)} ÷ ${money(s.mv)} × 100 = ${(s.mv > 0 ? (h.marketValue / s.mv) * 100 : 0).toFixed(1)}%` }}>{s.mv > 0 ? ((h.marketValue / s.mv) * 100).toFixed(1) : "0.0"}%</Auditable>}
                                        </td>
                                        <td className={`px-3 py-1.5 text-right mono ${h.costUnavailable ? "text-slate-500" : changeColor(h.returnPct)}`} title={h.live && !h.costUnavailable ? LIVE_CELL : undefined}>
                                          {h.costUnavailable ? "—"
                                            : h.live ? fmtPct(h.returnPct, { sign: true })
                                            : <Auditable formula={returnFormula(h.marketValue, h.costBasis, h.returnPct, money, holdingHref(accIdx.get(h.accountId), h.security))}>{fmtPct(h.returnPct, { sign: true })}</Auditable>}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
    </div>
  );
}
