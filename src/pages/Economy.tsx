import { useEffect, useState } from "react";
import {
  TrendingUp, Percent, Users, Landmark, Building, Home, PiggyBank, ShoppingCart, BarChart3, CalendarClock, Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { PreviewBadge, PreviewNum } from "@/components/Preview";
import { fetchEconomy, fmtEcon, econChange, type EconFeed } from "@/lib/economy";

// LAYER 2 · B–H (FOOS spec) — Macro economic indicators, Fixed income & credit,
// Banking, Housing, Household, Consumption, Capital markets. LIVE for the handful
// of India series a free source (World Bank, latest annual) publishes — growth,
// inflation, government debt, unemployment; the rest stay illustrative until an
// economic-data feed is added, since no free source publishes them at the
// frequency the spec asks for.

// `code` maps a row to a /api/economy indicator; rows without one stay preview.
type Row = { name: string; value: string; chg: string; code?: string };

const CATEGORIES: { title: string; icon: typeof TrendingUp; rows: Row[] }[] = [
  {
    title: "Economic growth", icon: TrendingUp, rows: [
      { name: "GDP (YoY)", value: "6.7%", chg: "+0.3pp", code: "gdp_growth" },
      { name: "Industrial Production", value: "5.2%", chg: "+0.6pp" },
      { name: "Manufacturing PMI", value: "58.1", chg: "+1.2" },
      { name: "Capacity Utilisation", value: "76.4%", chg: "+0.8pp" },
    ],
  },
  {
    title: "Inflation", icon: Percent, rows: [
      { name: "CPI (YoY)", value: "4.8%", chg: "-0.2pp", code: "cpi" },
      { name: "Core CPI", value: "3.9%", chg: "-0.1pp" },
      { name: "WPI", value: "2.6%", chg: "+0.4pp" },
      { name: "Rural / Urban CPI", value: "5.1 / 4.5%", chg: "-0.1pp" },
    ],
  },
  {
    title: "Labour market", icon: Users, rows: [
      { name: "Unemployment Rate", value: "7.1%", chg: "-0.3pp", code: "unemployment" },
      { name: "Labour Participation", value: "42.4%", chg: "+0.2pp" },
      { name: "US Non-Farm Payrolls", value: "206k", chg: "-38k" },
      { name: "Wage Growth", value: "4.1%", chg: "+0.2pp" },
    ],
  },
  {
    title: "Government", icon: Landmark, rows: [
      { name: "Fiscal Deficit (% GDP)", value: "5.1%", chg: "-0.2pp" },
      { name: "Govt Debt / GDP", value: "81.2%", chg: "+0.4pp", code: "govt_debt_gdp" },
      { name: "GST Collections", value: "₹1.82 L Cr", chg: "+8.4%" },
      { name: "E-way Bills", value: "103.2 mn", chg: "+6.1%" },
    ],
  },
  {
    title: "Fixed income & credit", icon: BarChart3, rows: [
      { name: "India 10Y", value: "6.98%", chg: "-4bp" },
      { name: "US 10Y", value: "4.28%", chg: "+6bp" },
      { name: "AAA Credit Spread", value: "62bp", chg: "+3bp" },
      { name: "Yield Curve (10Y–2Y)", value: "+18bp", chg: "+2bp" },
    ],
  },
  {
    title: "Banking & policy", icon: Building, rows: [
      { name: "Repo Rate", value: "6.50%", chg: "0bp" },
      { name: "CRR / SLR", value: "4.5 / 18.0%", chg: "0bp" },
      { name: "Bank Credit Growth", value: "15.4%", chg: "-0.6pp" },
      { name: "NBFC Credit Growth", value: "17.9%", chg: "-0.4pp" },
    ],
  },
  {
    title: "Housing", icon: Home, rows: [
      { name: "House Price Index", value: "+6.2%", chg: "+0.3pp" },
      { name: "Affordability Index", value: "3.4x", chg: "-0.1x" },
      { name: "Registrations (MoM)", value: "+4.8%", chg: "+1.1pp" },
      { name: "Inventory (months)", value: "22.6", chg: "-0.9" },
    ],
  },
  {
    title: "Household", icon: PiggyBank, rows: [
      { name: "Household Debt / GDP", value: "40.1%", chg: "+0.5pp" },
      { name: "Financial Savings", value: "5.3% GDP", chg: "-0.2pp" },
      { name: "Physical Savings", value: "12.1% GDP", chg: "+0.3pp" },
      { name: "Equity in Asset Mix", value: "6.4%", chg: "+0.4pp" },
    ],
  },
  {
    title: "Consumption", icon: ShoppingCart, rows: [
      { name: "Passenger Vehicles", value: "+3.9%", chg: "-1.2pp" },
      { name: "Two Wheelers", value: "+11.4%", chg: "+2.1pp" },
      { name: "Tractors", value: "-2.6%", chg: "-3.0pp" },
      { name: "FMCG Volumes", value: "+5.8%", chg: "+0.7pp" },
    ],
  },
  {
    title: "Capital markets", icon: BarChart3, rows: [
      { name: "Equity MF Flows", value: "₹34,700 Cr", chg: "+12.4%" },
      { name: "SIP Flows", value: "₹21,260 Cr", chg: "+3.1%" },
      { name: "Demat Accounts", value: "161.2 mn", chg: "+2.4 mn" },
      { name: "F&O Turnover", value: "₹412 L Cr", chg: "-6.8%" },
    ],
  },
];

const RELEASES = [
  { s: "India CPI (YoY)", date: "12 Aug", prev: "5.08%", cons: "4.90%", act: "4.83%", note: "Cooler than expected on food; keeps a rate cut on the table for Q4." },
  { s: "US Non-Farm Payrolls", date: "02 Aug", prev: "218k", cons: "185k", act: "206k", note: "Labour market resilient; wage growth steady, no dovish tilt yet." },
  { s: "RBI Policy Rate", date: "08 Aug", prev: "6.50%", cons: "6.50%", act: "6.50%", note: "Held as expected; stance stays 'withdrawal of accommodation'." },
  { s: "China GDP (YoY)", date: "15 Jul", prev: "5.3%", cons: "5.1%", act: "4.7%", note: "Miss on weak property and consumption; stimulus expectations rising." },
];

export function Economy() {
  const [econ, setEcon] = useState<EconFeed | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetchEconomy().then((f) => { if (alive) setEcon(f); });
    return () => { alive = false; };
  }, []);

  const liveCount = econ?.ok
    ? CATEGORIES.reduce((n, c) => n + c.rows.filter((r) => r.code && econ.indicators[r.code]).length, 0)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Research · Layer 2B"
        title="Economy & Macro Indicators"
        subtitle="Growth, inflation, labour, government, fixed income, banking, housing, household, consumption and capital-market series — with a release calendar and AI commentary."
        right={liveCount > 0
          ? <Pill tone="gain">{liveCount} live · World Bank</Pill>
          : <PreviewBadge />}
      />

      <div className="mb-5 rounded-lg border border-ink-700 bg-ink-800/40 px-4 py-3 text-[12px] leading-relaxed text-slate-400">
        {liveCount > 0 ? (
          <>Growth, inflation, government debt and unemployment are <span className="text-gain">live</span> from the
          World Bank (latest annual figure, labelled with its year). The remaining series — fixed income & credit,
          banking, housing, household, consumption and capital markets — need a dedicated economic-data feed the
          current API does not include, and stay illustrative.</>
        ) : (
          <>A handful of India series (growth, inflation, government debt, unemployment) go live from the World Bank
          when the edge function is reachable; the rest need a dedicated economic-data feed the current API does not
          include. All figures below are illustrative in this environment.</>
        )}
      </div>

      {/* Release calendar — the spec's signature macro feature */}
      <Card className="preview-hatch" title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-champagne-400" /> Data release calendar</span>}
        subtitle="Previous · consensus · actual · surprise vs consensus, each with an AI-generated 2–3 line note" right={<PreviewBadge />} pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-[12.5px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Series</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Date</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Previous</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Consensus</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Actual</th>
                <th className="label-xs px-4 py-2 text-left font-medium"><span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI commentary</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {RELEASES.map((r) => (
                <tr key={r.s} className="hover:bg-ink-700/30">
                  <td className="px-4 py-2.5 font-medium text-slate-300">{r.s}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.date}</td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.prev}</PreviewNum></td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.cons}</PreviewNum></td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.act}</PreviewNum></td>
                  <td className="px-4 py-2.5 max-w-md text-[11.5px] text-slate-500" title="Placeholder — not live data">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Indicator grid */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-start">
        {CATEGORIES.map((cat) => {
          const catLive = econ?.ok ? cat.rows.filter((r) => r.code && econ.indicators[r.code!]).length : 0;
          const catAllPreview = catLive === 0;
          return (
          <Card key={cat.title} className={catAllPreview ? "preview-hatch" : undefined} title={<span className="flex items-center gap-2 text-[13px]"><cat.icon className="h-4 w-4 text-slate-500" />{cat.title}</span>} right={catLive > 0 ? <Pill tone="gain">{catLive} live</Pill> : <PreviewBadge />}>
            <ul className="space-y-2">
              {cat.rows.map((r) => {
                const ind = r.code && econ?.ok ? econ.indicators[r.code] : undefined;
                if (ind) {
                  const chg = econChange(ind);
                  return (
                    <li key={r.name} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="text-slate-300">{r.name}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-gain" title={`Live · World Bank ${ind.year}`} />
                        <span className="tabular-nums font-medium text-slate-200">{fmtEcon(ind.value)}</span>
                        {chg && <span className="text-[10px] text-slate-500" title={`vs ${ind.prevYear}`}>{chg}</span>}
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={r.name} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-slate-400">{r.name}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <PreviewNum>{r.value}</PreviewNum>
                      <span className="text-[10px] text-slate-600" title="Placeholder — not live data">{r.chg}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Each series would carry daily / weekly / monthly / quarterly / year-end history, a returns table, cross-series
        comparison and export to Excel · PDF · PowerPoint — the cross-cutting research functionality the spec asks for.
      </p>
    </div>
  );
}
