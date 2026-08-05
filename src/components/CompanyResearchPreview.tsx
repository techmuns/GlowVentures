import { useState } from "react";
import {
  Building2, PieChart, BarChart3, Network, Users2, FileText, CalendarClock, Sparkles, Boxes, Search, Landmark,
} from "lucide-react";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { PreviewBadge, PreviewNum, PreviewPill, PreviewChart, PreviewCard, previewTile } from "@/components/Preview";

// COMPANY RESEARCH — the FOOS spec's deep company page, as an illustrative
// PREVIEW. It replaces the old "deep-dive activates later" strip on StockInfo and
// sits BELOW the live sections (position, tax, transactions, returns table,
// investment tools, research panel). Everything here is greyed sample data: the
// spec asks for business segments, operating KPIs, a 10-year ratio grid, value
// chain, shareholding & deals, a document repository with AI summaries, and
// earnings / meeting calendars — none of which the current API can serve as
// structured data. It reads nothing from the book; `name` and `ticker` label it.

const YEARS = ["FY22", "FY23", "FY24", "FY25", "FY26"];

const RATIOS: { cat: string; rows: { label: string; vals: string[] }[] }[] = [
  { cat: "Valuation", rows: [
    { label: "P/E", vals: ["28.4", "31.2", "26.8", "33.5", "29.7"] },
    { label: "P/B", vals: ["5.1", "5.6", "4.8", "6.0", "5.4"] },
    { label: "EV / EBITDA", vals: ["18.2", "19.6", "16.9", "20.4", "18.1"] },
    { label: "Dividend yield", vals: ["0.9%", "0.8%", "1.1%", "0.7%", "0.9%"] },
    { label: "FCF yield", vals: ["3.2%", "2.8%", "3.6%", "2.4%", "3.1%"] },
  ] },
  { cat: "Growth", rows: [
    { label: "Revenue growth", vals: ["12.1%", "15.4%", "9.8%", "18.2%", "13.6%"] },
    { label: "EBITDA growth", vals: ["13.0%", "16.2%", "8.9%", "20.1%", "12.4%"] },
    { label: "EPS growth", vals: ["14.3%", "17.1%", "8.2%", "21.5%", "12.9%"] },
  ] },
  { cat: "Margins (reported · adjusted)", rows: [
    { label: "Gross margin", vals: ["48.2%", "49.0%", "47.1%", "50.3%", "49.4%"] },
    { label: "EBITDA margin", vals: ["22.4%", "23.1%", "21.8%", "24.6%", "23.3%"] },
    { label: "Net margin", vals: ["14.1%", "14.9%", "13.2%", "16.0%", "15.1%"] },
  ] },
  { cat: "Working capital", rows: [
    { label: "Cash conversion (days)", vals: ["58", "61", "54", "49", "52"] },
    { label: "Receivable days", vals: ["42", "45", "39", "37", "40"] },
    { label: "Inventory days", vals: ["31", "34", "29", "27", "30"] },
  ] },
  { cat: "Returns", rows: [
    { label: "ROE", vals: ["17.8%", "18.4%", "16.9%", "19.7%", "18.9%"] },
    { label: "ROCE", vals: ["21.2%", "22.0%", "20.1%", "23.4%", "22.5%"] },
    { label: "ROA", vals: ["11.4%", "11.9%", "10.8%", "12.6%", "12.1%"] },
  ] },
  { cat: "Other", rows: [
    { label: "Effective tax rate", vals: ["24.8%", "25.1%", "24.2%", "25.6%", "25.0%"] },
    { label: "Promoter holding", vals: ["54.2%", "54.2%", "53.8%", "53.1%", "52.7%"] },
  ] },
];

const SEGMENTS = [
  { name: "Core products", rev: "58%", ebit: "63%" },
  { name: "Services", rev: "27%", ebit: "24%" },
  { name: "New businesses", rev: "15%", ebit: "13%" },
];

const DOCS = [
  { type: "Annual Report", date: "FY26", note: "Record revenue; margin guidance raised on operating leverage." },
  { type: "Q1 FY26 Results", date: "Jul 2026", note: "Volumes ahead of estimate; realisations firm QoQ." },
  { type: "Investor Presentation", date: "Jul 2026", note: "Capacity roadmap to FY29; capex funded from internal accruals." },
  { type: "Earnings Call Transcript", date: "Jul 2026", note: "Management confident on demand; input costs easing." },
  { type: "Credit Rating Report", date: "Jun 2026", note: "Rating affirmed AA+/Stable; leverage comfortable." },
  { type: "Broker Report", date: "Jun 2026", note: "Street PT raised; consensus BUY, 2–3 yr earnings CAGR mid-teens." },
];

const DUPONT = [
  { k: "Net margin", v: "15.1%" }, { k: "Asset turnover", v: "0.80x" }, { k: "Equity multiplier", v: "1.56x" }, { k: "→ ROE", v: "18.9%" },
];

export function CompanyResearchPreview({ name, ticker }: { name: string; ticker: string | null }) {
  const [query, setQuery] = useState("");
  return (
    <div className="mt-6">
      {/* Section banner — scoped to THIS block, since the sections above are live. */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/[0.06] px-4 py-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="text-[12.5px] leading-relaxed text-slate-300">
          <span className="font-semibold text-amber-300">Deep company research — illustrative preview.</span>{" "}
          The sections below show the full FOOS company-research layout for {name}; every figure is a placeholder until
          the segment, ratio and document feeds are wired in. The position, tax, transactions, returns table and
          research panel above this are live.
        </div>
      </div>

      {/* Market data — EV / shares / book / face (price & market cap are live above) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Enterprise value" {...previewTile("₹1.94 L Cr", "EV")} icon={<Building2 className="h-4 w-4" />} />
        <StatTile label="Shares outstanding" {...previewTile("64.2 Cr", "issued")} icon={<PieChart className="h-4 w-4" />} />
        <StatTile label="Fully diluted" {...previewTile("65.1 Cr", "incl. ESOP")} icon={<PieChart className="h-4 w-4" />} />
        <StatTile label="Book value / share" {...previewTile("₹412", "latest")} icon={<Landmark className="h-4 w-4" />} />
        <StatTile label="Face value" {...previewTile("₹2", "per share")} icon={<Landmark className="h-4 w-4" />} />
      </div>

      {/* Segments + operating metrics */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        <PreviewCard className="lg:col-span-2" title={<span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-champagne-400" /> Business segments</span>}
          subtitle="Revenue & EBIT by segment, geography and product">
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead><tr className="border-b border-ink-700">
                <th className="label-xs py-2 pr-3 text-left font-medium">Segment</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Revenue</th>
                <th className="label-xs py-2 pl-3 text-right font-medium">EBIT</th>
              </tr></thead>
              <tbody className="divide-y divide-ink-700/60">
                {SEGMENTS.map((s) => (
                  <tr key={s.name}>
                    <td className="py-2 pr-3 text-slate-300">{s.name}</td>
                    <td className="px-3 py-2 text-right"><PreviewNum>{s.rev}</PreviewNum></td>
                    <td className="py-2 pl-3 text-right"><PreviewNum>{s.ebit}</PreviewNum></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            Geography: <PreviewPill>India 72%</PreviewPill><PreviewPill>US 18%</PreviewPill><PreviewPill>RoW 10%</PreviewPill>
            <span className="ml-2">Product mix:</span> <PreviewPill>Premium 41%</PreviewPill><PreviewPill>Mass 59%</PreviewPill>
          </div>
        </PreviewCard>

        <PreviewCard title={<span className="flex items-center gap-2"><Boxes className="h-4 w-4 text-champagne-400" /> Operating metrics</span>} subtitle="Sector-specific KPIs">
          <ul className="space-y-2 text-[12.5px]">
            {[["Volume", "8.4 mn units"], ["Capacity", "11.0 mn units"], ["Utilisation", "76%"], ["Realisation / unit", "₹18,400"], ["Branches / stores", "1,240"]].map((r) => (
              <li key={r[0]} className="flex items-center justify-between"><span className="text-slate-400">{r[0]}</span><PreviewNum>{r[1]}</PreviewNum></li>
            ))}
          </ul>
        </PreviewCard>
      </div>

      {/* 10-year ratio grid */}
      <PreviewCard className="mt-5" title={<span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-champagne-400" /> Financial ratios</span>}
        subtitle="Valuation · growth · margins · working capital · returns — 10-year history (last 5 shown); historical valuation on any selected date">
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-[12.5px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs py-2 pr-3 text-left font-medium">Ratio</th>
                {YEARS.map((y) => <th key={y} className="label-xs px-3 py-2 text-right font-medium">{y}</th>)}
              </tr>
            </thead>
            {RATIOS.map((group) => (
              <tbody key={group.cat} className="divide-y divide-ink-700/60">
                <tr><td colSpan={YEARS.length + 1} className="bg-ink-800/40 px-0 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-champagne-500">{group.cat}</td></tr>
                {group.rows.map((r) => (
                  <tr key={r.label} className="hover:bg-ink-700/30">
                    <td className="py-2 pr-3 text-slate-400">{r.label}</td>
                    {r.vals.map((v, i) => <td key={i} className="px-3 py-2 text-right"><PreviewNum>{v}</PreviewNum></td>)}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="font-medium text-slate-400">DuPont:</span>
          {DUPONT.map((d) => <PreviewPill key={d.k}>{d.k} {d.v}</PreviewPill>)}
        </div>
      </PreviewCard>

      {/* Value chain + shareholding & deals */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        <PreviewCard title={<span className="flex items-center gap-2"><Network className="h-4 w-4 text-champagne-400" /> Value chain</span>} subtitle="Customers, suppliers, concentration & inputs">
          <div className="space-y-2.5 text-[12.5px]">
            <div><span className="text-slate-400">Major customers: </span><span className="inline-flex flex-wrap gap-1.5 align-middle"><PreviewPill>Customer A</PreviewPill><PreviewPill>Customer B</PreviewPill><PreviewPill>Customer C</PreviewPill></span></div>
            <div><span className="text-slate-400">Major suppliers: </span><span className="inline-flex flex-wrap gap-1.5 align-middle"><PreviewPill>Supplier X</PreviewPill><PreviewPill>Supplier Y</PreviewPill></span></div>
            <div className="flex items-center justify-between"><span className="text-slate-400">Top-5 customer concentration</span><PreviewNum>38%</PreviewNum></div>
            <div><span className="text-slate-400">Raw material mix: </span><span className="inline-flex flex-wrap gap-1.5 align-middle"><PreviewPill>Steel 34%</PreviewPill><PreviewPill>Energy 21%</PreviewPill><PreviewPill>Chemicals 18%</PreviewPill></span></div>
          </div>
        </PreviewCard>

        <PreviewCard title={<span className="flex items-center gap-2"><Users2 className="h-4 w-4 text-champagne-400" /> Shareholding & deals</span>} subtitle="Pattern (10+ yr), bulk & block deals">
          <div className="grid grid-cols-2 gap-2 text-[12.5px]">
            {[["Promoter", "52.7%"], ["FII", "21.4%"], ["DII", "14.8%"], ["Public", "11.1%"]].map((r) => (
              <div key={r[0]} className="flex items-center justify-between rounded-md border border-ink-700 bg-ink-800/60 px-2.5 py-1.5"><span className="text-slate-400">{r[0]}</span><PreviewNum>{r[1]}</PreviewNum></div>
            ))}
          </div>
          <div className="mt-3 space-y-1.5 text-[11.5px] text-slate-500">
            <div className="flex items-center gap-2"><PreviewPill>Block</PreviewPill><span title="Placeholder — not live data">FII bought 12.4 L shares · 21 Jul 2026</span></div>
            <div className="flex items-center gap-2"><PreviewPill>Bulk</PreviewPill><span title="Placeholder — not live data">DII added 4.1 L shares · 09 Jul 2026</span></div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-ink-600/70 bg-ink-800/40 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11.5px] text-slate-500">Search shareholders holding &gt; </span><PreviewNum>1%</PreviewNum>
          </div>
        </PreviewCard>
      </div>

      {/* Document repository */}
      <PreviewCard className="mt-5" title={<span className="flex items-center gap-2"><FileText className="h-4 w-4 text-champagne-400" /> Document repository</span>}
        subtitle="Annual & quarterly reports, presentations, transcripts, credit & broker reports — each with an AI summary, key takeaways, searchable text and a source link">
        <div className="overflow-x-auto">
          <table className="min-w-full text-[12.5px]">
            <thead className="border-b border-ink-700"><tr>
              <th className="label-xs py-2 pr-3 text-left font-medium">Document</th>
              <th className="label-xs px-3 py-2 text-left font-medium">Period</th>
              <th className="label-xs px-3 py-2 text-left font-medium"><span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI summary</span></th>
              <th className="label-xs py-2 pl-3 text-right font-medium">Source</th>
            </tr></thead>
            <tbody className="divide-y divide-ink-700/60">
              {DOCS.map((d) => (
                <tr key={d.type} className="hover:bg-ink-700/30">
                  <td className="py-2 pr-3 font-medium text-slate-300">{d.type}</td>
                  <td className="px-3 py-2 text-slate-500">{d.date}</td>
                  <td className="px-3 py-2 max-w-md text-slate-500" title="Placeholder — not live data">{d.note}</td>
                  <td className="py-2 pl-3 text-right"><PreviewPill>link</PreviewPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PreviewCard>

      {/* Calendars + AI query */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        <PreviewCard title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-champagne-400" /> Calendars & meetings</span>} subtitle="Earnings, meetings & management history">
          <ul className="space-y-2 text-[12.5px]">
            <li className="flex items-center justify-between"><span className="text-slate-400">Next earnings</span><PreviewNum>24 Oct 2026</PreviewNum></li>
            <li className="flex items-center justify-between"><span className="text-slate-400">AGM</span><PreviewNum>14 Aug 2026</PreviewNum></li>
            <li className="flex items-center justify-between"><span className="text-slate-400">Analyst meet</span><PreviewNum>05 Sep 2026</PreviewNum></li>
          </ul>
          <div className="mt-3 border-t border-ink-700/70 pt-2.5">
            <div className="label-xs mb-1.5">Management meeting history</div>
            <ul className="space-y-1 text-[11.5px] text-slate-500">
              <li title="Placeholder — not live data">12 Jun 2026 · CFO — capex & margins</li>
              <li title="Placeholder — not live data">03 Mar 2026 · MD — demand outlook</li>
            </ul>
          </div>
        </PreviewCard>

        <PreviewCard className="lg:col-span-2" title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-champagne-400" /> AI query engine</span>} subtitle={`Ask in plain language about ${name}`}>
          <div className="flex items-center gap-2 rounded-lg border border-ink-600/70 bg-ink-800/40 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`e.g. How has ${name}'s ROCE trended over 10 years?`}
              className="w-full bg-transparent text-[13px] text-slate-300 placeholder:text-slate-600 focus:outline-none" />
            <PreviewBadge />
          </div>
          <ul className="mt-3 space-y-1.5 text-[12px] text-slate-500">
            {["Compare margins vs sector over 5 years", "Summarise the last four earnings calls", "Show promoter & FII holding changes"].map((q) => (
              <li key={q} className="flex items-center gap-2 rounded-md border border-ink-700 bg-ink-800/60 px-2.5 py-1.5" title="Placeholder — not live data">
                <Sparkles className="h-3 w-3 text-slate-600" />{q}
              </li>
            ))}
          </ul>
          {ticker && <p className="mt-2 text-[10.5px] text-slate-600">Scoped to {ticker}.</p>}
        </PreviewCard>
      </div>
    </div>
  );
}
