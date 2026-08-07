import { useMemo, useState } from "react";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { Users, Building2, UserCheck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { SearchInput } from "@/components/SearchInput";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { byEntity, byCustodian, bySector, sum, consolidatedMarketValue, dedupedPositions } from "@/lib/analytics";
import { DIRECT, accountIndex, custodyLabelOf, ownerOf } from "@/lib/accounts";
import { BasisPill } from "@/components/BasisPill";
import { AbsentCell, absentTile } from "@/components/Absent";
import { ownerMeasuredReturn, entityYtdPct } from "@/lib/returns";
import { fmtPct, changeColor, fmtCurrency } from "@/lib/format";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { Auditable } from "@/components/Auditable";
import { holdingHref, auditHref, LEDGER, pnlFormula, returnFormula, weightFormula } from "@/lib/auditFormulas";

export function FamilyEntities() {
  const { portfolio, fmtFromBase, displayCurrency, convertFromBase } = usePortfolio();
  const [scope, setScope] = useState("All");
  const [holdingsQ, setHoldingsQ] = useState("");
  if (!portfolio) return null;
  const p = portfolio.positions;
  const accIdx = accountIndex(portfolio.accounts);
  // The FAMILY total counts each dedupeGroup once; the per-owner rows below do
  // not dedupe, because each owner's row must show their own statement as
  // printed. That is the whole of "carry both, count once".
  const totalMV = consolidatedMarketValue(p);
  // Owner and custodian are separate reads of the account registry: one entity
  // can hold through several platforms, and one platform can serve several
  // entities, so neither is derivable from the other.
  const entities = byEntity(p, portfolio.accounts);
  // Custody is a FAMILY-level allocation ("how much sits at each platform"), so it
  // counts each dedupeGroup once. Run over the raw set it summed both rows of the
  // 360 ONE AIF (both CRNs → 360 ONE) and Transition Fund I (both trusts →
  // Transition), so custodian totals came to ₹338.61 Cr, ₹3.17 Cr over family NAV.
  const cust = byCustodian(dedupedPositions(p), portfolio.accounts);
  // Which platforms hold each owner's assets — the honest answer to "custody"
  // at entity granularity, where a single label would be a guess.
  const custodiansByOwner = new Map<string, Set<string>>();
  for (const x of p) {
    const who = ownerOf(accIdx, x);
    const set = custodiansByOwner.get(who) ?? new Set<string>();
    set.add(custodyLabelOf(accIdx, x));
    custodiansByOwner.set(who, set);
  }
  // The in-house bucket either EXISTS in this book or it doesn't. Every account
  // here is an external mandate, so there are no direct-held positions at all —
  // and "0% / ₹0" would read as a measurement of an in-house book that holds
  // nothing, which is a different claim from having no in-house book. The tile
  // below renders the dash and names the reason when the bucket is absent.
  const direct = cust.find((c) => c.key === DIRECT);
  const directMV = direct?.mv ?? 0;
  const externalMV = totalMV - directMV;
  const externalCustodians = cust.filter((c) => c.key !== DIRECT);
  const largest = entities[0];
  const entityChart = entities.slice(0, 12).map((e) => ({ name: e.key, value: convertFromBase(e.mv) }));
  const custPie = cust.map((c) => ({ name: c.key, value: c.mv }));
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  const selected = scope === "All" ? null : p.filter((x) => ownerOf(accIdx, x) === scope);
  const selSectors = useMemo(() => (selected ? bySector(selected) : []), [selected]);
  const selMV = selected ? sum(selected.map((x) => x.marketValue)) : 0;
  const holdings = (() => {
    if (!selected) return [];
    const rows = [...selected].sort((a, b) => b.marketValue - a.marketValue);
    const s = holdingsQ.trim().toLowerCase();
    return s ? rows.filter((h) => h.security.toLowerCase().includes(s) || (h.isin ?? "").toLowerCase().includes(s)) : rows;
  })();
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  return (
    <div>
      <PageHeader eyebrow="Allocation" title="Family & Entities"
        right={<div className="flex items-center gap-2">
          <BasisPill liveText="Live prices" hint="Entity NAVs are rebuilt from live prices where a quote exists; cost basis comes from the statements." />
          <Pill tone="info">{entities.length} entities</Pill>
        </div>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Entities" value={entities.length} sub="distinct owners in the book" icon={<Users className="h-4 w-4" />} />
        <StatTile label="Largest entity" value={largest?.key ?? "—"} sub={largest ? <><Auditable to={auditHref({ ...LEDGER, find: largest.key })} title="Largest entity NAV — trace to the ledger">{fmtFromBase(largest.mv, { compact: true })}</Auditable>{" · "}<Auditable formula={weightFormula(largest.mv, totalMV, largest.weight * 100, money)}>{`${(largest.weight * 100).toFixed(0)}%`}</Auditable></> : "—"} icon={<Building2 className="h-4 w-4" />} />
        {direct
          ? <StatTile label="In-house / Direct" value={<Auditable formula={{ title: "In-house / Direct share", excel: "= In-house market value ÷ Total market value × 100", plain: "The share of the whole book the family holds directly (in-house), rather than through an external custodian or manager.", worked: `= ${money(directMV)} ÷ ${money(totalMV)} × 100 = ${((directMV / totalMV) * 100).toFixed(0)}%`, auditHref: auditHref(LEDGER) }}>{`${((directMV / totalMV) * 100).toFixed(0)}%`}</Auditable>} sub={<Auditable to={auditHref(LEDGER)} title="In-house NAV — trace to the ledger">{fmtFromBase(directMV, { compact: true })}</Auditable>} icon={<Wallet className="h-4 w-4" />} />
          : <StatTile label="In-house / Direct"
              {...absentTile("no account in this book is run in-house",
                `All ${portfolio.accounts.length} accounts are external mandates, so there are no direct-held positions to measure. A 0% here would say the family runs an in-house book that holds nothing, which is a different claim.`)}
              icon={<Wallet className="h-4 w-4" />} />}
        <StatTile label="External custodians" value={<Auditable formula={{ title: "External-custody share", excel: "= External market value ÷ Total market value × 100", plain: "The share of the whole book held through external custodians and managers, rather than directly in-house.", worked: `= ${money(externalMV)} ÷ ${money(totalMV)} × 100 = ${((externalMV / totalMV) * 100).toFixed(0)}%`, auditHref: auditHref(LEDGER) }}>{`${((externalMV / totalMV) * 100).toFixed(0)}%`}</Auditable>} sub={<>{externalCustodians.length} custodian{externalCustodians.length === 1 ? "" : "s"}{" · "}<Auditable to={auditHref(LEDGER)} title="External-custody NAV — trace to the ledger">{fmtFromBase(externalMV, { compact: true })}</Auditable></>} icon={<UserCheck className="h-4 w-4" />} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {["All", ...entities.map((e) => e.key)].map((m) => {
          const active = scope === m;
          return (
            <button key={m} onClick={() => setScope(m)}
              className={["rounded-md border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]",
                active ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400" : "border-ink-700 bg-ink-800/60 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
              {m === "All" ? "All entities" : m}
            </button>
          );
        })}
      </div>
      {!selected && (
        <>
          <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
            <Card className="lg:col-span-2" title="Market value by entity">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entityChart} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                    <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="name" stroke="#6b6880" fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis stroke="#6b6880" fontSize={11} tickFormatter={axisFmt} width={84} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                      formatter={(v: number) => [fmtCurrency(v, displayCurrency, { compact: true }), "NAV"]} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      {entityChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title={direct ? "In-house vs external" : "Custody"}
              subtitle={direct ? "Who custodies the capital" : `Who custodies the capital — all of it external, across ${externalCustodians.length} manager${externalCustodians.length === 1 ? "" : "s"}`}>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={custPie} dataKey="value" innerRadius={46} outerRadius={70} paddingAngle={2} stroke="none">
                      {custPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                      formatter={(v: number) => fmtFromBase(v, { compact: true })} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1.5">
                {cust.map((c, i) => (
                  <li key={c.key} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{c.key}</span>
                    <span className="mono text-slate-200"><Auditable to={auditHref(LEDGER)} title={`${c.key} NAV — trace to the ledger`}>{fmtFromBase(c.mv, { compact: true })}</Auditable></span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card className="mt-5" title="Entity breakdown" pad={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">NAV</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Positions</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Unreal. P&L</th>
                    <th className="label-xs px-4 py-2 text-right font-medium" title="Cumulative unrealized return on cost (holding-period, not annualized)">Return</th>
                    <th className="label-xs px-4 py-2 text-right font-medium" title="Money-weighted return earned to date (Excel XIRR, de-annualised to the window) over dated cash flows">Return (to date)</th>
                    <th className="label-xs px-4 py-2 text-right font-medium" title="Financial-year-to-date return (since 1 Apr), flow-adjusted">YTD</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Custody</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {entities.map((e) => {
                    // Money-weighted return over this owner's MEASURABLE accounts
                    // only — closing the whole entity MV against partial openings
                    // returned +147%/+353% here for real family members.
                    const mwr = ownerMeasuredReturn(portfolio, p, e.key);
                    const xirrPct = mwr.toDatePct;
                    const coverNote = mwr.annPct == null ? undefined
                      : `${fmtPct(mwr.annPct, { sign: true })} p.a. annualised. Covers ${money(mwr.measuredMV)} of ${money(e.mv)}${mwr.excluded.length ? ` — ${mwr.excluded.length === 1 ? "account" : "accounts"} ${mwr.excluded.join(", ")} carry no opening portfolio value and are excluded on both sides` : ""}.`;
                    const ytdPct = entityYtdPct(portfolio, e.key, e.mv);
                    return (
                      <tr key={e.key} className="cursor-pointer hover:bg-ink-700/40" onClick={() => setScope(e.key)}>
                        <td className="px-4 py-2.5 font-medium text-slate-100">{e.key}</td>
                        <td className="px-4 py-2.5 text-right mono text-slate-200"><Auditable to={auditHref({ ...LEDGER, find: e.key })} title="Entity NAV — trace to the ledger">{fmtFromBase(e.mv, { compact: true })}</Auditable></td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400"><Auditable formula={weightFormula(e.mv, totalMV, e.weight * 100, money)}>{`${(e.weight * 100).toFixed(1)}%`}</Auditable></td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400">{e.count}</td>
                        <td className={`px-4 py-2.5 text-right mono ${changeColor(e.pnl)}`}><Auditable formula={pnlFormula(e.mv, e.cost, e.pnl, money, auditHref({ ...LEDGER, find: e.key }))}>{fmtFromBase(e.pnl, { compact: true, sign: true })}</Auditable></td>
                        <td className={`px-4 py-2.5 text-right mono ${changeColor(e.returnPct)}`}><Auditable formula={returnFormula(e.mv, e.cost, e.returnPct, money, auditHref({ ...LEDGER, find: e.key }))}>{fmtPct(e.returnPct, { sign: true })}</Auditable></td>
                        <td className={`px-4 py-2.5 text-right mono ${xirrPct == null ? "text-slate-500" : changeColor(xirrPct)}`}>
                          {xirrPct == null
                            ? <AbsentCell reason="no account for this entity carries an opening portfolio value — a money-weighted return needs one on both sides, and closing the whole entity value against a subset would overstate it" />
                            : <span title={coverNote}>{fmtPct(xirrPct, { sign: true })}</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right mono ${ytdPct == null ? "text-slate-500" : changeColor(ytdPct)}`}>
                          {ytdPct == null
                            ? <AbsentCell reason="needs a per-entity NAV on 1 April; no statement in this book carries one" />
                            : fmtPct(ytdPct, { sign: true })}
                        </td>
                        <td className="px-4 py-2.5 text-left text-[12px] text-slate-400">
                          {[...(custodiansByOwner.get(e.key) ?? [])].sort().join(", ") || "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      {selected && (
        <>
          <Card className="mt-5" title={`${scope} — sector mix`} subtitle={<>{selected.length} positions{" · "}<Auditable to={auditHref({ ...LEDGER, find: scope })} title="Entity NAV — trace to the ledger">{fmtFromBase(selMV, { compact: true })}</Auditable> NAV</>}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={selSectors.map((s) => ({ name: s.key, value: convertFromBase(s.mv) }))} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                    <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="name" stroke="#6b6880" fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis stroke="#6b6880" fontSize={11} tickFormatter={axisFmt} width={84} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                      formatter={(v: number) => [fmtCurrency(v, displayCurrency, { compact: true }), "NAV"]} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      {selSectors.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </Card>
          <Card className="mt-5" title={`${scope} — holdings`} pad={false}
            right={<SearchInput value={holdingsQ} onChange={setHoldingsQ} placeholder="Search this entity…" className="w-56" suggestions={selected ? Array.from(new Set(selected.map((x) => x.security))).sort() : []} />}>
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Sector</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Market value</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {holdings.map((h) => (
                    <tr key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={h.securityKey} name={h.security} /></td>
                      <td className="px-4 py-2.5 text-slate-400">{h.sector}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-200"><Auditable to={holdingHref(accIdx.get(h.accountId), h.security)} title="Market value — trace to this account's appraisal">{fmtFromBase(h.marketValue, { compact: true })}</Auditable></td>
                      <td className={`px-4 py-2.5 text-right mono ${h.costUnavailable ? "text-slate-500" : changeColor(h.returnPct)}`}>{h.costUnavailable ? "—" : <Auditable formula={returnFormula(h.marketValue, h.costBasis, h.returnPct, money, holdingHref(accIdx.get(h.accountId), h.security))}>{fmtPct(h.returnPct, { sign: true })}</Auditable>}</td>
                    </tr>
                  ))}
                  {holdings.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-slate-500">No holdings match “{holdingsQ}”.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
