import { Fragment, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { bySector, sum, consolidatedMarketValue, isPrivateClass, isDirectEquity, excludedClasses } from "@/lib/analytics";
import { accountIndex, ownerOf } from "@/lib/accounts";
import { fmtPct, fmtCurrency, changeColor } from "@/lib/format";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { BasisPill } from "@/components/BasisPill";
import { Auditable } from "@/components/Auditable";
import { holdingHref, auditHref, LEDGER, returnFormula, weightFormula } from "@/lib/auditFormulas";
import { AbsentCell } from "@/components/Absent";

const LIVE_CELL = "Recalculated from live prices. Cost basis comes from the ledger; this figure is worked out from it, so it has no workbook cell to trace to.";

export function SectorComposition() {
  const { portfolio, consolidated, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // The spec's "compare multiple sectors on a single screen". Empty until the
  // reader picks; there is no default selection to argue about.
  const [compare, setCompare] = useState<string[]>([]);
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
  /**
   * SECTOR IS A DIRECT-EQUITY VIEW. Nothing else on this book HAS a sector.
   *
   * A GICS sector is a property of a COMPANY. A fund — an AIF folio, a mutual
   * fund scheme, an ETF, a liquid sweep — is a wrapper holding many companies,
   * and no statement in this drop prints a sector for one; every one of them
   * lands in "Unclassified". The page first excluded only the PRIVATE classes,
   * which fixed the worst of it and left the rest: Unclassified still read
   * **49.0%, ₹88.6 Cr, top holding "Helios Flexi Cap Fund"** — a mutual fund
   * standing at the head of a sector table, in the largest slice of the chart,
   * describing nothing.
   *
   * So the denominator is `assetClass === "Equity"` — shares in companies the
   * family holds directly, whether through a PMS mandate or its own demat. That
   * is what the family asked for and it is also the only set the question is
   * answerable on. Everything else is NAMED below with its value, per class,
   * rather than folded in as a false sector: a fund's look-through would need
   * each scheme's own portfolio disclosure, which this book has for exactly one
   * scheme and does not join to the folios the family holds.
   *
   * The residual Unclassified is now real — direct equity whose own statement
   * printed no sector, listed in `docs/BOOK-REPORT.md` — and it is stated below
   * as such rather than being the place funds went to hide.
   */
  const accIdx = accountIndex(portfolio.accounts);
  // `isDirectEquity` and `excludedClasses` live in `analytics.ts` — the one
  // place the company-vs-fund axis is decided, so this page, Exposure & IPS,
  // Return Analysis and the stock page narrow on the same rule rather than on
  // four local re-derivations of it.
  const p = consolidated.filter(isDirectEquity);
  const totalMV = consolidatedMarketValue(p);
  const privateMV = consolidatedMarketValue(consolidated.filter(isPrivateClass));
  // Every class this page does NOT cover, largest first, so the note below can
  // name them from the book rather than from a hardcoded list. `isPrivateClass`
  // still drives the private-book sentence; this drives the rest.
  const excluded = excludedClasses(consolidated, isDirectEquity);
  const excludedMV = sum(excluded.map((c) => c.mv));
  const sectors = bySector(p);
  const unclassified = sectors.find((s) => s.key === "Unclassified") ?? null;
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
  const toggleCompare = (key: string) =>
    setCompare((prev) => (prev.includes(key)
      ? prev.filter((k) => k !== key)
      : prev.length >= 4 ? [...prev.slice(1), key] : [...prev, key]));
  const comparedSectors = compare
    .map((k) => sectors.find((s2) => s2.key === k))
    .filter((s2): s2 is NonNullable<typeof s2> => !!s2);

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  return (
    <div>
      <PageHeader eyebrow="Allocation" title="Sector Composition" subtitle="Direct equity only — shares in companies the family holds, through a manager's mandate or its own demat"
        right={<div className="flex items-center gap-2">
          <BasisPill liveText={feedLive ? "Live prices" : "Workbook marks"}
            hint="Direct equity only — a GICS sector is a property of a company, and no statement here prints one for a fund. Values, weights and returns are rebuilt from live prices; cost basis comes from the statements. Sectors are our normalised taxonomy — each provider's own label is kept per position." />
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
              <div className="label-xs">Direct equity</div>
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
      {/* ── Compare sectors ────────────────────────────────────────────────
          The spec asks to compare "multiple sectors" on a single screen. Every
          figure here is one the book already carries; nothing is derived that
          the sector rollup does not already compute.

          COST, P&L AND RETURN CAN BE ABSENT and are shown as such. `bySector`
          sums them with `sumOrNull`, so a sector whose holdings report no cost
          has a null cost rather than a zero — and `withoutCost` names how many
          positions were skipped when only some reported one. Rendering either
          as 0 would report the whole market value as profit. */}
      <Card className="mt-5" title="Compare sectors"
        subtitle={compare.length
          ? `${compare.length} of 4 selected — click a chip to add or remove`
          : "Pick up to four sectors to put side by side"}
        right={compare.length > 0
          ? <button onClick={() => setCompare([])}
              className="rounded-md border border-ink-700 px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-200">Clear</button>
          : undefined}>
        <div className="flex flex-wrap gap-1.5">
          {sectors.map((sc) => {
            const on = compare.includes(sc.key);
            return (
              <button key={sc.key} onClick={() => toggleCompare(sc.key)}
                className={`rounded-md border px-2.5 py-1 text-[11.5px] transition-colors ${on
                  ? "border-champagne-500/50 bg-champagne-500/15 text-champagne-300"
                  : "border-ink-600/70 bg-ink-800/40 text-slate-400 hover:border-ink-500 hover:text-slate-200"}`}>
                {sc.key} <span className="text-slate-500">{(sc.weight * 100).toFixed(1)}%</span>
              </button>
            );
          })}
        </div>

        {comparedSectors.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full whitespace-nowrap text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-700">
                  <th className="label-xs px-3 py-2 text-left font-medium">Metric</th>
                  {comparedSectors.map((sc) => (
                    <th key={sc.key} className="label-xs px-3 py-2 text-right font-medium text-slate-300">{sc.key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                <tr>
                  <td className="px-3 py-2 text-slate-400">Market value</td>
                  {comparedSectors.map((sc) => <td key={sc.key} className="px-3 py-2 text-right mono">{money(sc.mv)}</td>)}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Weight of direct equity</td>
                  {comparedSectors.map((sc) => <td key={sc.key} className="px-3 py-2 text-right mono">{(sc.weight * 100).toFixed(1)}%</td>)}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Cost basis</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className="px-3 py-2 text-right mono">
                      {sc.cost == null
                        ? <AbsentCell reason="No holding in this sector reports a cost — a depository statement carries a value and no basis" />
                        : money(sc.cost)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Unrealised P&amp;L</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className={`px-3 py-2 text-right mono ${sc.pnl == null ? "" : changeColor(sc.pnl)}`}>
                      {sc.pnl == null
                        ? <AbsentCell reason="Needs a cost basis, which no holding in this sector reports" />
                        : money(sc.pnl, true)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Return on cost</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className={`px-3 py-2 text-right mono ${sc.returnPct == null ? "" : changeColor(sc.returnPct)}`}>
                      {sc.returnPct == null
                        ? <AbsentCell reason="Needs a cost basis" />
                        : fmtPct(sc.returnPct, { sign: true })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Holdings</td>
                  {comparedSectors.map((sc) => <td key={sc.key} className="px-3 py-2 text-right mono">{sc.count}</td>)}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Of which report no cost</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className="px-3 py-2 text-right mono text-slate-400">
                      {sc.withoutCost === 0 ? "none" : `${sc.withoutCost} of ${sc.count}`}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Largest holding</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className="px-3 py-2 text-right text-slate-300">{topHolding[sc.key]}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Weights are of the <span className="text-slate-400">direct-equity book</span>, the same denominator the
              rest of this page uses — every fund wrapper is excluded rather than folded in, so the column sums to 100
              across all sectors. A sector whose holdings report no cost shows <span className="text-slate-400">—</span> for cost,
              P&amp;L and return rather than a zero, which would report its whole market value as profit; where only
              some holdings lack a cost the row above names how many.
            </p>
          </div>
        )}
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
      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        This is <span className="font-medium text-slate-400">direct equity only</span> — {money(totalMV)} across {p.length} holdings the family owns as shares in a company, each counted once,
        whether held through a manager’s PMS mandate or the family’s own demat account.
        {excluded.length > 0 && <> {money(excludedMV)} of the book sits in wrappers and is excluded rather than folded in—{" "}
          {excluded.map((c, i) => (
            <Fragment key={c.key}>
              {i > 0 && (i === excluded.length - 1 ? " and " : ", ")}
              <span className="font-medium text-slate-400">{c.key}</span> {money(c.mv)}
            </Fragment>
          ))}. A GICS sector is a property of a COMPANY; a fund holds many, and no statement in this book prints a sector for one,
          so every wrapper would land in a single false “Unclassified” slice and bury the sectors this view exists to show.
          {privateMV > 0 && <> They are broken out by asset class on <span className="font-medium text-slate-400">Morning CIO</span> and folio by folio in <span className="font-medium text-slate-400">Portfolio Monitor</span>.</>}
        </>}
        {unclassified && <> Within direct equity, {money(unclassified.mv)} across {unclassified.count} holdings shows as <span className="font-medium text-slate-400">Unclassified</span> because its own statement printed no sector — it is left unclassified rather than assigned a sector we would have to guess.</>}
      </p>
    </div>
  );
}
