import { useState } from "react";
import { Globe, Fuel, Gem, Wheat, Ship, LineChart, DollarSign, CalendarClock, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { ViewToggle, type ViewDef } from "@/components/ViewToggle";
import { PreviewBanner, PreviewBadge, PreviewNum, PreviewChart } from "@/components/Preview";

// LAYER 2 · A. MACRO RESEARCH (FOOS spec) — Commodities, Global Equity Indices,
// Currencies. The muns catalogue has no macro or commodity endpoint at all, so
// none of this can be served live today. The page previews the exact returns
// table, comparison and release-calendar the spec asks for.

type View = "commodities" | "indices" | "currencies";

// Sample percentage pool — deterministic, none exactly zero, so no cell reads as
// a measured 0.00%.
const PCTS = [12.4, -3.1, 8.7, 22.5, -7.8, 15.2, 4.3, -1.6, 31.0, 6.9, -11.2, 18.4, 9.1, -5.5, 27.3, 2.8, -9.4, 13.7];
const pct = (seed: number, k: number) => PCTS[(seed * 3 + k * 5) % PCTS.length];

// The spec's returns table, verbatim: Daily / Weekly / Monthly / QTD / YTD / 1Y /
// 3Y / 5Y / 10Y / Max CAGR, plus 52-week High / Low.
const RET_COLS = ["1D", "1W", "1M", "QTD", "YTD", "1Y", "3Y", "5Y", "10Y", "Max"] as const;

type Series = { name: string; group?: string; last: string; hi: string; lo: string };

const COMMODITIES: Series[] = [
  { name: "Brent Crude", group: "Energy", last: "$82.4", hi: "$91.2", lo: "$68.9" },
  { name: "WTI Crude", group: "Energy", last: "$78.1", hi: "$87.6", lo: "$64.3" },
  { name: "Natural Gas", group: "Energy", last: "$2.84", hi: "$3.61", lo: "$1.92" },
  { name: "Thermal Coal", group: "Energy", last: "$134", hi: "$168", lo: "$102" },
  { name: "Gold", group: "Precious Metals", last: "$2,412", hi: "$2,540", lo: "$1,984" },
  { name: "Silver", group: "Precious Metals", last: "$28.6", hi: "$32.1", lo: "$22.4" },
  { name: "Platinum", group: "Precious Metals", last: "$978", hi: "$1,092", lo: "$864" },
  { name: "Copper", group: "Industrial Metals", last: "$9,240", hi: "$10,120", lo: "$8,010" },
  { name: "Aluminium", group: "Industrial Metals", last: "$2,486", hi: "$2,760", lo: "$2,120" },
  { name: "Zinc", group: "Industrial Metals", last: "$2,910", hi: "$3,180", lo: "$2,340" },
  { name: "Steel (HRC)", group: "Industrial Metals", last: "$612", hi: "$720", lo: "$540" },
  { name: "Iron Ore", group: "Industrial Metals", last: "$108", hi: "$142", lo: "$92" },
  { name: "Wheat", group: "Agriculture", last: "$586", hi: "$672", lo: "$512" },
  { name: "Soybean", group: "Agriculture", last: "$1,184", hi: "$1,342", lo: "$1,038" },
  { name: "Cotton", group: "Agriculture", last: "$0.82", hi: "$0.98", lo: "$0.71" },
  { name: "Sugar", group: "Agriculture", last: "$0.21", hi: "$0.27", lo: "$0.18" },
  { name: "CRB Commodity Index", group: "Others", last: "298.4", hi: "324.1", lo: "268.7" },
  { name: "Baltic Dry Index", group: "Others", last: "1,842", hi: "2,410", lo: "1,190" },
];

const INDICES: Series[] = [
  { name: "S&P 500", last: "5,470", hi: "5,620", lo: "4,810" },
  { name: "Nasdaq", last: "17,690", hi: "18,120", lo: "14,900" },
  { name: "Dow Jones", last: "39,400", hi: "40,900", lo: "36,100" },
  { name: "Russell 2000", last: "2,036", hi: "2,300", lo: "1,840" },
  { name: "FTSE 100", last: "8,240", hi: "8,470", lo: "7,410" },
  { name: "DAX", last: "18,340", hi: "18,900", lo: "15,600" },
  { name: "Nikkei 225", last: "39,120", hi: "42,400", lo: "31,200" },
  { name: "Hang Seng", last: "18,010", hi: "20,200", lo: "14,800" },
  { name: "Shanghai Composite", last: "3,020", hi: "3,420", lo: "2,690" },
  { name: "Nifty 50", last: "24,180", hi: "24,900", lo: "19,300" },
  { name: "Sensex", last: "79,400", hi: "82,100", lo: "63,900" },
];

const CURRENCIES: Series[] = [
  { name: "USD / INR", last: "83.4", hi: "84.1", lo: "81.6" },
  { name: "EUR / USD", last: "1.082", hi: "1.121", lo: "1.036" },
  { name: "GBP / USD", last: "1.271", hi: "1.312", lo: "1.208" },
  { name: "USD / JPY", last: "157.2", hi: "160.4", lo: "140.8" },
  { name: "USD / CNY", last: "7.24", hi: "7.31", lo: "7.02" },
  { name: "Dollar Index (DXY)", last: "104.6", hi: "106.8", lo: "100.2" },
];

const GROUP_ICON: Record<string, typeof Fuel> = {
  Energy: Fuel, "Precious Metals": Gem, "Industrial Metals": Gem, Agriculture: Wheat, Others: Ship,
};

function SeriesTable({ rows, kind }: { rows: Series[]; kind: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full whitespace-nowrap text-[12.5px]">
        <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
          <tr>
            <th className="label-xs px-4 py-2 text-left font-medium">{kind}</th>
            <th className="label-xs px-3 py-2 text-right font-medium">Last</th>
            {RET_COLS.map((c) => (
              <th key={c} className="label-xs px-3 py-2 text-right font-medium" title={c.length > 2 ? `${c} CAGR` : `${c} return`}>{c}</th>
            ))}
            <th className="label-xs px-3 py-2 text-right font-medium">52W H</th>
            <th className="label-xs px-3 py-2 text-right font-medium">52W L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-700/60">
          {rows.map((r, i) => (
            <tr key={r.name} className="hover:bg-ink-700/30">
              <td className="px-4 py-2 font-medium text-slate-300">
                {r.name}
                {r.group && <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-600">{r.group}</span>}
              </td>
              <td className="px-3 py-2 text-right"><PreviewNum>{r.last}</PreviewNum></td>
              {RET_COLS.map((c, k) => {
                const v = pct(i + 1, k);
                return (
                  <td key={c} className="px-3 py-2 text-right">
                    <PreviewNum>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</PreviewNum>
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right"><PreviewNum>{r.hi}</PreviewNum></td>
              <td className="px-3 py-2 text-right"><PreviewNum>{r.lo}</PreviewNum></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MacroResearch() {
  const [view, setView] = useState<View>("commodities");
  const views: ViewDef<View>[] = [
    { key: "commodities", label: "Commodities", icon: Fuel },
    { key: "indices", label: "Global Indices", icon: LineChart },
    { key: "currencies", label: "Currencies", icon: DollarSign },
  ];
  const rows = view === "commodities" ? COMMODITIES : view === "indices" ? INDICES : CURRENCIES;
  const kind = view === "commodities" ? "Commodity" : view === "indices" ? "Index" : "Pair";

  return (
    <div>
      <PageHeader
        eyebrow="Research · Layer 2A"
        title="Macro Research"
        subtitle="Historical prices, returns and comparison for commodities, global equity indices and currencies."
        right={<PreviewBadge />}
      />

      <PreviewBanner source="a macro & commodities data feed" layer="FOOS Layer 2A">
        The muns API catalogue has no macro or commodity endpoint — not a partial one — so every series here is
        illustrative. The columns, comparison and release calendar mirror the spec exactly.
      </PreviewBanner>

      <ViewToggle
        views={views}
        active={view}
        onChange={setView}
        right={
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Download className="h-3.5 w-3.5" />
            <span>Export Excel · PDF · PowerPoint</span>
            <PreviewBadge />
          </div>
        }
      />

      <Card className="preview-hatch" title={<span className="flex items-center gap-2"><Globe className="h-4 w-4 text-champagne-400" /> Returns table</span>}
        subtitle="Daily · Weekly · Monthly · QTD · YTD · 1Y · 3Y · 5Y · 10Y · Max CAGR, with 52-week high & low — the spec's returns table for every series"
        right={<PreviewBadge />} pad={false}>
        <div className="max-h-[440px] overflow-auto">
          <SeriesTable rows={rows} kind={kind} />
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2 preview-hatch" title="Historical chart & comparison"
          subtitle="Overlay multiple series on one chart, adjustable periods, multiple chart types — line / bar / area / scatter"
          right={<PreviewBadge />}>
          <div className="h-56"><PreviewChart kind={view === "currencies" ? "bars" : "area"} height={220} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            Compare across: multiple commodities · indices · currencies · sectors · macro indicators — all on one screen.
          </div>
        </Card>

        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-champagne-400" /> Release calendar</span>}
          subtitle="Previous · consensus · actual · surprise, with AI commentary" right={<PreviewBadge />}>
          <ul className="space-y-2.5">
            {[
              { s: "US CPI (MoM)", prev: "0.3%", cons: "0.2%", act: "0.1%" },
              { s: "India IIP (YoY)", prev: "5.0%", cons: "4.6%", act: "5.2%" },
              { s: "China GDP (YoY)", prev: "5.3%", cons: "5.1%", act: "4.7%" },
            ].map((r) => (
              <li key={r.s} className="rounded-lg border border-ink-700 bg-ink-800/60 p-2.5">
                <div className="text-[12.5px] font-medium text-slate-300">{r.s}</div>
                <div className="mt-1 flex items-center gap-3 text-[11px]">
                  <span className="text-slate-500">Prev <PreviewNum>{r.prev}</PreviewNum></span>
                  <span className="text-slate-500">Cons <PreviewNum>{r.cons}</PreviewNum></span>
                  <span className="text-slate-500">Actual <PreviewNum>{r.act}</PreviewNum></span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Each release would carry an AI-generated 2–3 line note explaining the print and its significance.
          </p>
        </Card>
      </div>
    </div>
  );
}
