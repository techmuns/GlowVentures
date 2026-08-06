import { useEffect, useMemo, useState } from "react";
import { Globe, Fuel, Gem, Wheat, Ship, LineChart, DollarSign, CalendarClock, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { ViewToggle, type ViewDef } from "@/components/ViewToggle";
import { PreviewBadge, PreviewNum, PreviewChart } from "@/components/Preview";
import { changeColor } from "@/lib/format";
import { fetchMacro, fmtLevel, MACRO_COLS, type MacroFeed } from "@/lib/macro";

// LAYER 2 · A. MACRO RESEARCH (FOOS spec) — Commodities, Global Equity Indices,
// Currencies. LIVE where a free source (Yahoo Finance, via /api/macro) publishes
// the series: last level, the full returns table (1D…10Y/Max CAGR) and the
// 52-week range, all computed from real closes. Series with no reliable free
// symbol, and the whole page when the feed is unreachable, fall back to the
// illustrative preview — greyed, so a placeholder never reads as a live figure.

type View = "commodities" | "indices" | "currencies";

// Deterministic sample pool for preview rows only (none exactly zero).
const PCTS = [12.4, -3.1, 8.7, 22.5, -7.8, 15.2, 4.3, -1.6, 31.0, 6.9, -11.2, 18.4, 9.1, -5.5, 27.3, 2.8, -9.4, 13.7];
const pct = (seed: number, k: number) => PCTS[(seed * 3 + k * 5) % PCTS.length];

type Series = { name: string; group?: string; yahoo: string | null; last: string; hi: string; lo: string };

const COMMODITIES: Series[] = [
  { name: "Brent Crude", group: "Energy", yahoo: "BZ=F", last: "$82.4", hi: "$91.2", lo: "$68.9" },
  { name: "WTI Crude", group: "Energy", yahoo: "CL=F", last: "$78.1", hi: "$87.6", lo: "$64.3" },
  { name: "Natural Gas", group: "Energy", yahoo: "NG=F", last: "$2.84", hi: "$3.61", lo: "$1.92" },
  { name: "Thermal Coal", group: "Energy", yahoo: null, last: "$134", hi: "$168", lo: "$102" },
  { name: "Gold", group: "Precious Metals", yahoo: "GC=F", last: "$2,412", hi: "$2,540", lo: "$1,984" },
  { name: "Silver", group: "Precious Metals", yahoo: "SI=F", last: "$28.6", hi: "$32.1", lo: "$22.4" },
  { name: "Platinum", group: "Precious Metals", yahoo: "PL=F", last: "$978", hi: "$1,092", lo: "$864" },
  { name: "Copper", group: "Industrial Metals", yahoo: "HG=F", last: "$4.20", hi: "$5.10", lo: "$3.60" },
  { name: "Aluminium", group: "Industrial Metals", yahoo: "ALI=F", last: "$2,486", hi: "$2,760", lo: "$2,120" },
  { name: "Zinc", group: "Industrial Metals", yahoo: null, last: "$2,910", hi: "$3,180", lo: "$2,340" },
  { name: "Steel (HRC)", group: "Industrial Metals", yahoo: null, last: "$612", hi: "$720", lo: "$540" },
  { name: "Iron Ore", group: "Industrial Metals", yahoo: null, last: "$108", hi: "$142", lo: "$92" },
  { name: "Wheat", group: "Agriculture", yahoo: "ZW=F", last: "$586", hi: "$672", lo: "$512" },
  { name: "Soybean", group: "Agriculture", yahoo: "ZS=F", last: "$1,184", hi: "$1,342", lo: "$1,038" },
  { name: "Cotton", group: "Agriculture", yahoo: "CT=F", last: "$0.82", hi: "$0.98", lo: "$0.71" },
  { name: "Sugar", group: "Agriculture", yahoo: "SB=F", last: "$0.21", hi: "$0.27", lo: "$0.18" },
  { name: "CRB Commodity Index", group: "Others", yahoo: null, last: "298.4", hi: "324.1", lo: "268.7" },
  { name: "Baltic Dry Index", group: "Others", yahoo: null, last: "1,842", hi: "2,410", lo: "1,190" },
];

const INDICES: Series[] = [
  { name: "S&P 500", yahoo: "^GSPC", last: "5,470", hi: "5,620", lo: "4,810" },
  { name: "Nasdaq", yahoo: "^IXIC", last: "17,690", hi: "18,120", lo: "14,900" },
  { name: "Dow Jones", yahoo: "^DJI", last: "39,400", hi: "40,900", lo: "36,100" },
  { name: "Russell 2000", yahoo: "^RUT", last: "2,036", hi: "2,300", lo: "1,840" },
  { name: "FTSE 100", yahoo: "^FTSE", last: "8,240", hi: "8,470", lo: "7,410" },
  { name: "DAX", yahoo: "^GDAXI", last: "18,340", hi: "18,900", lo: "15,600" },
  { name: "Nikkei 225", yahoo: "^N225", last: "39,120", hi: "42,400", lo: "31,200" },
  { name: "Hang Seng", yahoo: "^HSI", last: "18,010", hi: "20,200", lo: "14,800" },
  { name: "Shanghai Composite", yahoo: "000001.SS", last: "3,020", hi: "3,420", lo: "2,690" },
  { name: "Nifty 50", yahoo: "^NSEI", last: "24,180", hi: "24,900", lo: "19,300" },
  { name: "Sensex", yahoo: "^BSESN", last: "79,400", hi: "82,100", lo: "63,900" },
];

const CURRENCIES: Series[] = [
  { name: "USD / INR", yahoo: "INR=X", last: "83.4", hi: "84.1", lo: "81.6" },
  { name: "EUR / USD", yahoo: "EURUSD=X", last: "1.082", hi: "1.121", lo: "1.036" },
  { name: "GBP / USD", yahoo: "GBPUSD=X", last: "1.271", hi: "1.312", lo: "1.208" },
  { name: "USD / JPY", yahoo: "JPY=X", last: "157.2", hi: "160.4", lo: "140.8" },
  { name: "USD / CNY", yahoo: "CNY=X", last: "7.24", hi: "7.31", lo: "7.02" },
  { name: "Dollar Index (DXY)", yahoo: "DX-Y.NYB", last: "104.6", hi: "106.8", lo: "100.2" },
];

const ALL_SYMBOLS = [...COMMODITIES, ...INDICES, ...CURRENCIES].map((s) => s.yahoo).filter((s): s is string => !!s);

function fmtRet(v: number | null): { text: string; cls: string } {
  if (v == null) return { text: "—", cls: "text-slate-600" };
  return { text: `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`, cls: changeColor(v) };
}

function SeriesTable({ rows, kind, feed }: { rows: Series[]; kind: string; feed: MacroFeed | undefined }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full whitespace-nowrap text-[12.5px]">
        <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
          <tr>
            <th className="label-xs px-4 py-2 text-left font-medium">{kind}</th>
            <th className="label-xs px-3 py-2 text-right font-medium">Last</th>
            {MACRO_COLS.map((c) => (
              <th key={c.key} className="label-xs px-3 py-2 text-right font-medium" title={c.label.length > 2 ? `${c.label} CAGR` : `${c.label} return`}>{c.label}</th>
            ))}
            <th className="label-xs px-3 py-2 text-right font-medium">52W H</th>
            <th className="label-xs px-3 py-2 text-right font-medium">52W L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-700/60">
          {rows.map((r, i) => {
            const live = r.yahoo && feed && feed.ok ? feed.series[r.yahoo] : undefined;
            return (
              <tr key={r.name} className="hover:bg-ink-700/30">
                <td className="px-4 py-2 font-medium text-slate-300">
                  {r.name}
                  {r.group && <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-600">{r.group}</span>}
                  {live && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400/80" title={`Live · Yahoo Finance · as of ${live.asOf}`} />}
                </td>
                {live ? (
                  <>
                    <td className="px-3 py-2 text-right mono text-slate-100">{fmtLevel(live.last, live.currency)}</td>
                    {MACRO_COLS.map((c) => { const rr = fmtRet(live.returns[c.key]); return <td key={c.key} className={`px-3 py-2 text-right mono ${rr.cls}`}>{rr.text}</td>; })}
                    <td className="px-3 py-2 text-right mono text-slate-400">{live.high52 == null ? "—" : fmtLevel(live.high52, live.currency)}</td>
                    <td className="px-3 py-2 text-right mono text-slate-400">{live.low52 == null ? "—" : fmtLevel(live.low52, live.currency)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right"><PreviewNum>{r.last}</PreviewNum></td>
                    {MACRO_COLS.map((c, k) => { const v = pct(i + 1, k); return <td key={c.key} className="px-3 py-2 text-right"><PreviewNum>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</PreviewNum></td>; })}
                    <td className="px-3 py-2 text-right"><PreviewNum>{r.hi}</PreviewNum></td>
                    <td className="px-3 py-2 text-right"><PreviewNum>{r.lo}</PreviewNum></td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MacroResearch() {
  const [view, setView] = useState<View>("commodities");
  const [feed, setFeed] = useState<MacroFeed | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetchMacro(ALL_SYMBOLS).then((f) => { if (alive) setFeed(f); });
    return () => { alive = false; };
  }, []);

  const views: ViewDef<View>[] = [
    { key: "commodities", label: "Commodities", icon: Fuel },
    { key: "indices", label: "Global Indices", icon: LineChart },
    { key: "currencies", label: "Currencies", icon: DollarSign },
  ];
  const rows = view === "commodities" ? COMMODITIES : view === "indices" ? INDICES : CURRENCIES;
  const kind = view === "commodities" ? "Commodity" : view === "indices" ? "Index" : "Pair";
  const liveCount = useMemo(() => (feed && feed.ok ? rows.filter((r) => r.yahoo && feed.series[r.yahoo]).length : 0), [feed, rows]);

  return (
    <div>
      <PageHeader
        eyebrow="Research · Layer 2A"
        title="Macro Research"
        subtitle="Historical prices, returns and comparison for commodities, global equity indices and currencies."
        right={feed === undefined
          ? <Pill>loading…</Pill>
          : liveCount > 0
            ? <Pill tone="info">{liveCount} live · Yahoo Finance</Pill>
            : <PreviewBadge />}
      />

      {(feed && !feed.ok) || (feed && feed.ok && liveCount === 0) ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/[0.06] px-4 py-3">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-[12.5px] leading-relaxed text-slate-300">
            <span className="font-semibold text-amber-300">Showing illustrative figures.</span>{" "}
            The free macro feed (Yahoo Finance) is unreachable right now — it runs as a server-side function on the
            deployed site, not in local preview. Live levels & returns replace these the moment it responds.
          </div>
        </div>
      ) : (
        <p className="mb-5 text-[12px] leading-relaxed text-slate-500">
          Levels, the full returns table and the 52-week range are <span className="text-gain">live</span> (green dot)
          for every series a free source (Yahoo Finance) publishes; the rest — thermal coal, some base metals, the CRB and
          Baltic Dry — have no free feed and stay illustrative until a data vendor is chosen.
        </p>
      )}

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

      <Card title={<span className="flex items-center gap-2"><Globe className="h-4 w-4 text-champagne-400" /> Returns table</span>}
        subtitle="Daily · Weekly · Monthly · QTD · YTD · 1Y · 3Y · 5Y · 10Y · Max CAGR, with 52-week high & low — live where a free source covers the series"
        right={liveCount > 0 ? <Pill tone="info">{liveCount} live</Pill> : <PreviewBadge />} pad={false}>
        <div className="max-h-[440px] overflow-auto">
          <SeriesTable rows={rows} kind={kind} feed={feed} />
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2 preview-hatch" title="Historical chart & comparison"
          subtitle="Overlay multiple series on one chart, adjustable periods, multiple chart types — line / bar / area / scatter"
          right={<PreviewBadge />}>
          <div className="h-56"><PreviewChart kind={view === "currencies" ? "bars" : "area"} height={220} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            The returns table above is live; an interactive overlay chart needs the full daily series per symbol — a small
            extension of the same feed.
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
            Consensus & surprise need an economic-calendar source (no free feed publishes forecasts); each release would
            carry an AI-generated 2–3 line note.
          </p>
        </Card>
      </div>
    </div>
  );
}
