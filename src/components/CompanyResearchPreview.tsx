import { useEffect, useMemo, useState } from "react";
import {
  Building2, BarChart3, Network, CalendarClock, Sparkles, Boxes, Search, ArrowUpRight, ArrowDownRight, FileText,
} from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell } from "@/components/Absent";
import { PreviewBadge, PreviewNum, PreviewPill, PreviewCard } from "@/components/Preview";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtNum, fmtDate } from "@/lib/format";
import { getHoldingsInsider, type InsiderResponse } from "@/lib/insider";

// COMPANY RESEARCH — the FOOS spec's deep company page. MIXED, now that the real
// endpoints are wired:
//   • LIVE — the 52-week trading range (from the quote feed) and insider trades
//     (the muns insider endpoint). The Financials, ratios, shareholding, street
//     estimates, documents and concalls the spec asks for are ALREADY live in the
//     Research panel above this, straight from screener.in / the filings feed, so
//     they are pointed to rather than duplicated here.
//   • PREVIEW — business segments, operating KPIs, value chain, the earnings /
//     meeting calendars and the AI query engine. No endpoint in the catalogue
//     serves these as structured data, so they stay clearly-marked placeholders.
//
// What is NOT shown: a rupee market cap / EV / book value / face value. The quote
// feed returns a market-cap figure of unverified unit and no share count, so a
// value here could be wrong by a factor of a crore — and this book's rule is that
// an unverifiable figure is absent, not guessed. Book value and the rest are in
// the live Financials tables above.

const SEGMENTS = [
  { name: "Core products", rev: "58%", ebit: "63%" },
  { name: "Services", rev: "27%", ebit: "24%" },
  { name: "New businesses", rev: "15%", ebit: "13%" },
];

export function CompanyResearchPreview({ name, ticker, price, live, low52, high52 }: {
  name: string;
  ticker: string | null;
  price: number | null;
  live: boolean;
  low52: number | null;
  high52: number | null;
}) {
  const { fmtFromBase } = usePortfolio();
  const [query, setQuery] = useState("");
  const [insider, setInsider] = useState<InsiderResponse | undefined>(undefined);

  useEffect(() => {
    if (!ticker) { setInsider(null as unknown as InsiderResponse); return; }
    let alive = true;
    setInsider(undefined);
    getHoldingsInsider([{ symbol: ticker, name, key: ticker, weight: 0 }]).then((r) => { if (alive) setInsider(r); });
    return () => { alive = false; };
  }, [ticker, name]);

  // Position within the 52-week range, for the live band.
  const rangePct = useMemo(() => {
    if (price == null || low52 == null || high52 == null || high52 <= low52) return null;
    return Math.min(100, Math.max(0, ((price - low52) / (high52 - low52)) * 100));
  }, [price, low52, high52]);

  const items = insider && insider.ok ? (insider.items ?? []) : [];

  return (
    <div className="mt-6">
      {/* Live: 52-week trading range */}
      <Card title={<span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-champagne-400" /> Trading range</span>}
        subtitle="52-week high & low from the quote feed" right={<Pill tone="info">{live ? "live" : "statement mark"}</Pill>}>
        {low52 == null || high52 == null ? (
          <AbsentCell reason="the quote feed did not return a 52-week range for this security" />
        ) : (
          <>
            <div className="flex items-end justify-between text-sm">
              <div><div className="label-xs">52-week low</div><div className="mono text-slate-200">{fmtFromBase(low52)}</div></div>
              <div className="text-center"><div className="label-xs">Current</div><div className="mono font-semibold text-slate-100">{price == null ? "—" : fmtFromBase(price)}</div></div>
              <div className="text-right"><div className="label-xs">52-week high</div><div className="mono text-slate-200">{fmtFromBase(high52)}</div></div>
            </div>
            <div className="relative mt-2 h-1.5 rounded-full bg-ink-700">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-loss/50 to-gain/60" style={{ width: `${rangePct ?? 0}%` }} />
              {rangePct != null && <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-100 bg-champagne-500" style={{ left: `${rangePct}%` }} />}
            </div>
          </>
        )}
      </Card>

      {/* Live: insider trades (the spec's insider / bulk / block deals) */}
      <Card className="mt-5" title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-champagne-400" /> Insider & bulk deals</span>}
        subtitle="Insider trading disclosures from the exchange feed" right={ticker ? <Pill tone="info">{ticker}</Pill> : undefined} pad={false}>
        {!ticker ? (
          <p className="px-5 py-4 text-[12.5px] text-slate-500">No NSE symbol mapped, so the insider feed can't be queried for this name.</p>
        ) : insider === undefined ? (
          <div className="grid h-24 place-items-center text-sm text-slate-500">Loading insider trades…</div>
        ) : !insider || !insider.ok ? (
          <p className="px-5 py-4 text-[12.5px] leading-relaxed text-slate-500">
            {insider && insider.reason === "not_configured"
              ? "The insider feed isn't switched on yet — it activates once the data-service token is configured."
              : "The insider feed didn't respond for this security."}
          </p>
        ) : items.length === 0 ? (
          <p className="px-5 py-4 text-[12.5px] text-slate-500">No insider transactions disclosed for {name} in the feed's window.</p>
        ) : (
          <div className="max-h-[360px] overflow-auto">
            <table className="min-w-full whitespace-nowrap text-[12.5px]">
              <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Date</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">Insider</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">Type</th>
                  <th className="label-xs px-3 py-2 text-right font-medium">Shares</th>
                  <th className="label-xs px-3 py-2 text-right font-medium">Value</th>
                  <th className="label-xs px-3 py-2 text-right font-medium">Post-holding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {items.slice(0, 40).map((t, i) => {
                  const acq = /acquisition|buy|purchase/i.test(t.transaction);
                  return (
                    <tr key={t.key ?? i} className="hover:bg-ink-700/30">
                      <td className="px-4 py-2 mono text-[11.5px] text-slate-400">{t.broadcastDate ? fmtDate(String(t.broadcastDate).slice(0, 10)) : "—"}</td>
                      <td className="px-3 py-2 max-w-[220px] truncate text-slate-300" title={t.insider}>{t.insider}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${acq ? "bg-emerald-500/15 text-gain" : "bg-red-500/15 text-loss"}`}>
                          {acq ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{t.transaction}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right mono text-slate-300">{fmtNum(t.shares)}</td>
                      <td className="px-3 py-2 text-right mono text-slate-400">{t.value ? fmtFromBase(t.value, { compact: true }) : "—"}</td>
                      <td className="px-3 py-2 text-right mono text-slate-500">{t.postPct || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pointer: everything already live in the Research panel above */}
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-champagne-400" />
        <div className="text-[12.5px] leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-200">Financials, ratios, shareholding, street estimates, documents & concalls are live above</span> —
          the Research panel serves the spec's quarterly & annual P&L, balance sheet, cash flow, the 10-year ratio history,
          the shareholding pattern, consensus estimates and the document repository straight from the data service. Market
          cap, enterprise value, book value and face value are in those tables; they are not repeated here as standalone
          figures because the price feed does not return them in a unit this book can verify.
        </div>
      </div>

      {/* Preview — genuinely no endpoint serves these as structured data */}
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Illustrative — awaiting a structured source
        </div>
        <div className="grid gap-5 lg:grid-cols-3 items-start">
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
            </div>
          </PreviewCard>

          <PreviewCard title={<span className="flex items-center gap-2"><Boxes className="h-4 w-4 text-champagne-400" /> Operating metrics</span>} subtitle="Sector-specific KPIs">
            <ul className="space-y-2 text-[12.5px]">
              {[["Volume", "8.4 mn units"], ["Capacity", "11.0 mn units"], ["Utilisation", "76%"], ["Realisation / unit", "₹18,400"]].map((r) => (
                <li key={r[0]} className="flex items-center justify-between"><span className="text-slate-400">{r[0]}</span><PreviewNum>{r[1]}</PreviewNum></li>
              ))}
            </ul>
          </PreviewCard>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
          <PreviewCard title={<span className="flex items-center gap-2"><Network className="h-4 w-4 text-champagne-400" /> Value chain</span>} subtitle="Customers, suppliers & inputs">
            <div className="space-y-2.5 text-[12.5px]">
              <div><span className="text-slate-400">Major customers: </span><span className="inline-flex flex-wrap gap-1.5 align-middle"><PreviewPill>Customer A</PreviewPill><PreviewPill>Customer B</PreviewPill></span></div>
              <div><span className="text-slate-400">Major suppliers: </span><span className="inline-flex flex-wrap gap-1.5 align-middle"><PreviewPill>Supplier X</PreviewPill><PreviewPill>Supplier Y</PreviewPill></span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Top-5 concentration</span><PreviewNum>38%</PreviewNum></div>
            </div>
          </PreviewCard>

          <PreviewCard title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-champagne-400" /> Calendars</span>} subtitle="Earnings, meetings & history">
            <ul className="space-y-2 text-[12.5px]">
              <li className="flex items-center justify-between"><span className="text-slate-400">Next earnings</span><PreviewNum>24 Oct 2026</PreviewNum></li>
              <li className="flex items-center justify-between"><span className="text-slate-400">AGM</span><PreviewNum>14 Aug 2026</PreviewNum></li>
              <li className="flex items-center justify-between"><span className="text-slate-400">Analyst meet</span><PreviewNum>05 Sep 2026</PreviewNum></li>
            </ul>
          </PreviewCard>

          <PreviewCard title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-champagne-400" /> AI query</span>} subtitle={`Ask about ${name}`}>
            <div className="flex items-center gap-2 rounded-lg border border-ink-600/70 bg-ink-800/40 px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. ROCE trend over 10 years?"
                className="w-full bg-transparent text-[13px] text-slate-300 placeholder:text-slate-600 focus:outline-none" />
              <PreviewBadge />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Needs an AI layer over the financials & filings above.</p>
          </PreviewCard>
        </div>
      </div>
    </div>
  );
}
