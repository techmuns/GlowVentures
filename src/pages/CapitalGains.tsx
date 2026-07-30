import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Receipt, Landmark, Timer, Percent } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { SearchInput } from "@/components/SearchInput";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { sum } from "@/lib/analytics";
import { accountIndex, ownerOf } from "@/lib/accounts";
import { fmtPct, changeColor, fmtDate } from "@/lib/format";
import { Auditable } from "@/components/Auditable";
import { ledgerHref, auditHref, LEDGER, sumFormula } from "@/lib/auditFormulas";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle } from "@/lib/chartTheme";

// Illustrative Indian equity rates: STCG u/s 111A = 20%; LTCG u/s 112A = 12.5%
// (beyond the ₹1.25L annual exemption, which we don't net per-entity here).
const STCG_RATE = 0.20;
const LTCG_RATE = 0.125;

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const DAY_MS = 864e5;
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);

export function CapitalGains() {
  const { portfolio, fmtFromBase } = usePortfolio();
  const [holdQ, setHoldQ] = useState("");
  const [harvestQ, setHarvestQ] = useState("");
  if (!portfolio) return null;
  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const accIdx = accountIndex(portfolio.accounts);
  const cg = portfolio.capitalGains;
  const p = portfolio.positions;
  const totRealST = sum(cg.map((c) => c.realisedST));
  const totRealLT = sum(cg.map((c) => c.realisedLT));
  const totUnrealST = sum(cg.map((c) => c.unrealisedST));
  const totUnrealLT = sum(cg.map((c) => c.unrealisedLT));
  const realisedTotal = totRealST + totRealLT;
  const unrealisedTotal = totUnrealST + totUnrealLT;
  const estTaxRealised = Math.max(0, totRealST) * STCG_RATE + Math.max(0, totRealLT) * LTCG_RATE;
  // Hold-to-LTCG planner: short-term positions (daysToLT set) sitting on a gain.
  //
  // `daysToLT` counts from the workbook's as-of date, not from today, so the
  // countdown has to be re-based or the planner keeps advertising dates that have
  // already passed. Anything whose one-year mark is now behind us is out: its gain
  // is already taxed at the long-term rate, so there is nothing left to save by
  // holding. Those are counted and reported rather than silently dropped.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const elapsed = daysBetween(portfolio.asOf, today);
  const { holdCandidates, crossed, crossedGain } = useMemo(() => {
    const all = p.filter((x) => x.daysToLT != null && x.unrealizedPnL > 0 && !x.costUnavailable)
      .map((x) => ({
        ...x,
        saving: x.unrealizedPnL * (STCG_RATE - LTCG_RATE),
        ltDate: addDays(portfolio.asOf, x.daysToLT!),
        daysLeft: x.daysToLT! - elapsed,
      }));
    const done = all.filter((x) => x.daysLeft <= 0);
    return {
      holdCandidates: all.filter((x) => x.daysLeft > 0).sort((a, b) => a.daysLeft - b.daysLeft),
      crossed: done.length,
      crossedGain: sum(done.map((x) => x.unrealizedPnL)),
    };
  }, [p, portfolio.asOf, elapsed]);
  const totalSaving = sum(holdCandidates.map((x) => x.saving));
  const savingTotalFormula = {
    title: "Hold-to-LTCG saving",
    excel: "= Σ (Unrealised gain × (STCG rate − LTCG rate))",
    plain: "If every short-term winner below is held past its one-year mark, each gain is taxed at the 12.5% long-term rate instead of 20% — this totals the 7.5% saved across them all.",
    worked: `= ${money(totalSaving)} across ${holdCandidates.length} positions`,
    auditHref: auditHref(LEDGER),
  };
  // Tax-loss harvesting: positions currently underwater, to offset realised gains.
  const harvest = useMemo(() =>
    p.filter((x) => x.unrealizedPnL < 0 && !x.costUnavailable).sort((a, b) => a.unrealizedPnL - b.unrealizedPnL), [p]);
  const harvestTotal = sum(harvest.map((x) => x.unrealizedPnL));
  const match = (q: string) => (h: { security: string; isin?: string }) => {
    const s = q.trim().toLowerCase();
    return h.security.toLowerCase().includes(s) || (h.isin ?? "").toLowerCase().includes(s);
  };
  const holdRows = (holdQ.trim() ? holdCandidates.filter(match(holdQ)) : holdCandidates).slice(0, 30);
  const harvestRows = (harvestQ.trim() ? harvest.filter(match(harvestQ)) : harvest).slice(0, 30);
  const byEnt = useMemo(() =>
    cg.map((c) => ({ ...c, total: c.realisedST + c.realisedLT + c.unrealisedST + c.unrealisedLT }))
      .sort((a, b) => b.total - a.total), [cg]);
  const splitPie = [
    { name: "Short-term", value: Math.max(0, totUnrealST) },
    { name: "Long-term", value: Math.max(0, totUnrealLT) },
  ];
  return (
    <div>
      <PageHeader eyebrow="Tax & Income" title="Capital Gains & Tax"
        right={<BasisPill liveText="Unrealised gains live" hint="Unrealised gains move with live prices; cost basis, holding periods and realised gains come from the statements \u2014 each on its own report date." />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Embedded (unrealised) gains" value={<Auditable formula={sumFormula("Embedded (unrealised) gains", "The short-term and long-term unrealised gains added together — everything you still hold, measured on paper against cost.", [{ label: "Unrealised ST", value: totUnrealST }, { label: "Unrealised LT", value: totUnrealLT }], unrealisedTotal, money)}>{fmtFromBase(unrealisedTotal, { compact: true })}</Auditable>}
          sub={<>ST <Auditable to={auditHref(LEDGER)} title="Unrealised short-term gains — trace to the ledger">{fmtFromBase(totUnrealST, { compact: true })}</Auditable> · LT <Auditable to={auditHref(LEDGER)} title="Unrealised long-term gains — trace to the ledger">{fmtFromBase(totUnrealLT, { compact: true })}</Auditable></>} icon={<Landmark className="h-4 w-4" />} />
        <StatTile label="Realised gains (period)" value={<Auditable formula={sumFormula("Realised gains (period)", "The short-term and long-term gains actually booked this period, added together.", [{ label: "Realised ST", value: totRealST }, { label: "Realised LT", value: totRealLT }], realisedTotal, money)}>{fmtFromBase(realisedTotal, { compact: true, sign: true })}</Auditable>}
          sub={<>ST <Auditable to={auditHref(LEDGER)} title="Realised short-term gains — trace to the ledger">{fmtFromBase(totRealST, { compact: true })}</Auditable> · LT <Auditable to={auditHref(LEDGER)} title="Realised long-term gains — trace to the ledger">{fmtFromBase(totRealLT, { compact: true })}</Auditable></>} icon={<Receipt className="h-4 w-4" />} />
        <StatTile label="Est. tax on realised" value={<Auditable formula={{ title: "Est. tax on realised", excel: "= max(0, Realised ST) × STCG rate + max(0, Realised LT) × LTCG rate", plain: "An illustrative tax bill on booked gains: positive short-term gains taxed at the STCG rate and long-term at the LTCG rate. Losses aren't taxed, so negative amounts count as zero.", worked: `= ${money(Math.max(0, totRealST))} × ${(STCG_RATE * 100).toFixed(0)}% + ${money(Math.max(0, totRealLT))} × ${(LTCG_RATE * 100).toFixed(1)}% = ${money(estTaxRealised)}`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(estTaxRealised, { compact: true })}</Auditable>}
          sub="STCG 20% · LTCG 12.5% · illustrative" icon={<Percent className="h-4 w-4" />} />
        <StatTile label="Hold-to-LTCG saving" value={<Auditable formula={savingTotalFormula}>{fmtFromBase(totalSaving, { compact: true })}</Auditable>}
          sub={`${holdCandidates.length} still short-term${crossed ? ` · ${crossed} already crossed` : ""}`} icon={<Timer className="h-4 w-4" />} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2" title="Gains by entity" subtitle="Realised & unrealised, short- vs long-term" pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Real. ST</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Real. LT</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Unreal. ST</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Unreal. LT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {byEnt.map((c) => (
                  <tr key={c.entity} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5 font-medium text-slate-100">{c.entity}</td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(c.realisedST)}`}><Auditable to={auditHref({ ...LEDGER, eq: c.entity })} title={`${c.entity} · realised short-term — trace to the ledger`}>{fmtFromBase(c.realisedST, { compact: true, sign: true })}</Auditable></td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(c.realisedLT)}`}><Auditable to={auditHref({ ...LEDGER, eq: c.entity })} title={`${c.entity} · realised long-term — trace to the ledger`}>{fmtFromBase(c.realisedLT, { compact: true, sign: true })}</Auditable></td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(c.unrealisedST)}`}><Auditable to={auditHref({ ...LEDGER, eq: c.entity })} title={`${c.entity} · unrealised short-term — trace to the ledger`}>{fmtFromBase(c.unrealisedST, { compact: true, sign: true })}</Auditable></td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(c.unrealisedLT)}`}><Auditable to={auditHref({ ...LEDGER, eq: c.entity })} title={`${c.entity} · unrealised long-term — trace to the ledger`}>{fmtFromBase(c.unrealisedLT, { compact: true, sign: true })}</Auditable></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-ink-700 font-semibold">
                <tr>
                  <td className="px-4 py-2.5 text-slate-200">Total</td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(totRealST)}`}><Auditable formula={{ title: "Total realised ST", excel: "= Σ Realised ST across entities", plain: "Every entity's realised short-term gain or loss, added together.", worked: `= ${money(totRealST, true)} across ${byEnt.length} entities`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(totRealST, { compact: true, sign: true })}</Auditable></td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(totRealLT)}`}><Auditable formula={{ title: "Total realised LT", excel: "= Σ Realised LT across entities", plain: "Every entity's realised long-term gain or loss, added together.", worked: `= ${money(totRealLT, true)} across ${byEnt.length} entities`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(totRealLT, { compact: true, sign: true })}</Auditable></td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(totUnrealST)}`}><Auditable formula={{ title: "Total unrealised ST", excel: "= Σ Unrealised ST across entities", plain: "Every entity's unrealised short-term gain or loss, added together.", worked: `= ${money(totUnrealST, true)} across ${byEnt.length} entities`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(totUnrealST, { compact: true, sign: true })}</Auditable></td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(totUnrealLT)}`}><Auditable formula={{ title: "Total unrealised LT", excel: "= Σ Unrealised LT across entities", plain: "Every entity's unrealised long-term gain or loss, added together.", worked: `= ${money(totUnrealLT, true)} across ${byEnt.length} entities`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(totUnrealLT, { compact: true, sign: true })}</Auditable></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <Card title="Unrealised: ST vs LT" subtitle="Embedded gains by holding period">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={splitPie} dataKey="value" innerRadius={46} outerRadius={70} paddingAngle={2} stroke="none">
                  <Cell fill="#e0709b" />
                  <Cell fill="#10b981" />
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                  formatter={(v: number) => fmtFromBase(v, { compact: true })} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-sm bg-[#e0709b]" />Short-term</span><span className="mono text-slate-200">{fmtFromBase(totUnrealST, { compact: true })}</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-sm bg-[#10b981]" />Long-term</span><span className="mono text-slate-200">{fmtFromBase(totUnrealLT, { compact: true })}</span></div>
            <p className="pt-1 text-[11px] text-slate-500">Long-term equity gains are taxed at 12.5% vs 20% short-term — deferring short-term winners past their 1-year mark saves 7.5% of the gain.</p>
          </div>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Hold-to-LTCG planner" subtitle={`Short-term winners nearing their 1-year mark — holding defers to the 12.5% rate. Counted to today, ${fmtDate(today)}.`}
          right={<div className="flex items-center gap-2"><SearchInput value={holdQ} onChange={setHoldQ} placeholder="Search security…" className="w-44" suggestions={holdCandidates.map((x) => x.security)} /><Pill tone="gain"><Auditable formula={savingTotalFormula}>{fmtFromBase(totalSaving, { compact: true })}</Auditable> saveable</Pill></div>} pad={false}>
          <div className="max-h-[440px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Unreal. gain</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Turns LT</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Tax saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {holdRows.map((h) => (
                  <tr key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5"><div className="text-slate-100"><StockLink securityKey={h.securityKey} name={h.security} /></div><div className="text-[10px] text-slate-500">{ownerOf(accIdx, h)}</div></td>
                    <td className="px-4 py-2.5 text-right mono text-gain"><Auditable to={ledgerHref(h.security)} title="Unrealised gain — trace to the ledger">{fmtFromBase(h.unrealizedPnL, { compact: true, sign: true })}</Auditable></td>
                    <td className="px-4 py-2.5 text-right">
                      <Pill tone={h.daysLeft <= 30 ? "warn" : "default"}>{h.daysLeft}d</Pill>
                      <div className="mt-0.5 text-[10px] text-slate-500">{fmtDate(h.ltDate)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-champagne-400"><Auditable formula={{ title: "Tax saved by holding to long-term", excel: "= Unrealised gain × (STCG rate − LTCG rate)", plain: "Hold this position past its one-year mark and the gain is taxed at the 12.5% long-term rate instead of 20% — a saving of 7.5% of the gain.", worked: `= ${money(h.unrealizedPnL)} × ${((STCG_RATE - LTCG_RATE) * 100).toFixed(1)}% = ${money(h.saving)}` }}>{fmtFromBase(h.saving, { compact: true })}</Auditable></td>
                  </tr>
                ))}
                {holdRows.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-slate-500">{holdQ.trim() ? `No securities match “${holdQ}”.` : "No short-term winners approaching the LTCG threshold."}</td></tr>}
              </tbody>
            </table>
          </div>
          {crossed > 0 && (
            <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
              {crossed} position{crossed === 1 ? "" : "s"} carrying {money(crossedGain)} of gain passed the one-year mark in the {elapsed} days since the {fmtDate(portfolio.asOf)} book, so {crossed === 1 ? "it is" : "they are"} already at the 12.5% long-term rate and no longer appear here.
            </p>
          )}
        </Card>
        <Card title="Tax-loss harvesting" subtitle="Positions underwater — booking losses can offset realised gains"
          right={<div className="flex items-center gap-2"><SearchInput value={harvestQ} onChange={setHarvestQ} placeholder="Search security…" className="w-44" suggestions={harvest.map((x) => x.security)} /><Pill tone="loss"><Auditable formula={{ title: "Harvestable losses", excel: "= Σ Unrealised loss of every underwater holding", plain: "Every position currently below its cost, added together — the paper losses you could book to offset realised gains.", worked: `= ${money(harvestTotal)} across ${harvest.length} positions`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(harvestTotal, { compact: true })}</Auditable> available</Pill></div>} pad={false}>
          <div className="max-h-[440px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Unreal. loss</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {harvestRows.map((h) => (
                  <tr key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={h.securityKey} name={h.security} /></td>
                    <td className="px-4 py-2.5 text-slate-400">{ownerOf(accIdx, h)}</td>
                    <td className="px-4 py-2.5 text-right mono text-loss"><Auditable to={ledgerHref(h.security)} title="Unrealised loss — trace to the ledger">{fmtFromBase(h.unrealizedPnL, { compact: true, sign: true })}</Auditable></td>
                    <td className="px-4 py-2.5 text-right mono text-loss"><Auditable formula={{ title: "Return", excel: "= (Market value − Cost) ÷ Cost × 100", plain: "How far this position sits below what it cost, as a percentage.", worked: `= ${money(h.unrealizedPnL)} ÷ ${money(h.costBasis)} × 100 = ${fmtPct(h.returnPct, { sign: true })}`, auditHref: ledgerHref(h.security) }}>{fmtPct(h.returnPct, { sign: true })}</Auditable></td>
                  </tr>
                ))}
                {harvestRows.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-slate-500">{harvestQ.trim() ? `No securities match “${harvestQ}”.` : "No positions currently at a loss."}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <p className="mt-4 text-[11px] text-slate-500">
        Tax figures are illustrative, using current Indian equity rates (STCG 20% u/s 111A, LTCG 12.5% u/s 112A) and do not apply the ₹1.25L LTCG exemption, set-off rules, surcharge, or cess. Not tax advice.
        Gains and losses move with live prices; holding periods are counted to today ({fmtDate(today)}) from lot dates in the {fmtDate(portfolio.asOf)} book. The short- vs long-term split by entity above is that book's own classification and has not been re-cut for the {elapsed} days since.
      </p>
    </div>
  );
}
