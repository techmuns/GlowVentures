import { useEffect, useMemo, useState } from "react";
import {
  Building2, BarChart3, Network, CalendarClock, Boxes, ArrowUpRight, ArrowDownRight, FileText,
} from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell, AbsentSection } from "@/components/Absent";
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
//   • ABSENT — business segments, operating KPIs, value chain and the forward
//     calendar. No endpoint in the catalogue serves any of them, VERIFIED
//     against the live API rather than assumed, so each renders its reason.
//     They were sample figures until 2026-08-11; see the note above that block
//     for why a badge did not make them safe.
//
// What is NOT shown: a rupee market cap / EV / book value / face value. The quote
// feed returns a market-cap figure of unverified unit and no share count, so a
// value here could be wrong by a factor of a crore — and this book's rule is that
// an unverifiable figure is absent, not guessed. Book value and the rest are in
// the live Financials tables above.

export function CompanyResearchPreview({ name, ticker, price, live, low52, high52 }: {
  name: string;
  ticker: string | null;
  price: number | null;
  live: boolean;
  low52: number | null;
  high52: number | null;
}) {
  const { fmtFromBase } = usePortfolio();
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

      {/* ── WHAT THIS PAGE CANNOT ANSWER, AND WHY IT NO LONGER GUESSES ─────
          Until now this block printed four cards of invented figures under the
          real company's name: segment revenue 58/27/15, geography India 72 / US
          18 / RoW 10, "Capacity 11.0 mn units · Utilisation 76%", "Customer A /
          Supplier X · Top-5 concentration 38%", and a calendar asserting "Next
          earnings 24 Oct 2026".

          Every one of them fails this book's own test — WOULD IT STILL BE HONEST
          IF THE BADGE WERE CROPPED OUT OF A SCREENSHOT? "Utilisation 76%" under
          the heading Aditya Birla Capital is a claim about Aditya Birla Capital,
          and greying it marks it not-live without stopping it being a number
          ABOUT THIS COMPANY. The dated ones are worse: a reader who takes away
          an earnings date has learnt something false and will act on it. This is
          the same failure the book already fixed twice — the ×1.25 target values
          on the public dashboard, and the "fund manager resigned" alerts naming
          real managers.

          MEASURED, NOT ASSUMED: the live `financials` response was checked for
          each of these on 2026-08-11 and carries none of them. Its sections are
          Pros & Cons, About, Stock details, Shareholding Pattern, Balance Sheet,
          Profit & Loss, Quarterly Results and Peer Comparison — no segment
          split, no capacity, no customer list, no calendar. So these are absent
          for want of a source, and each says which source would fill it. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        <Card title={<span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-slate-500" /> Business segments</span>}
          subtitle="Revenue & EBIT by segment, geography and product">
          <AbsentSection
            what={`No segment split is published for ${name} by any source wired here`}
            needs="Segment revenue and EBIT are in the notes to the annual report and in the quarterly segment
              disclosure — PDFs listed under Documents above, not a structured field. Reading them needs a filing
              parser per company, which is a different kind of source from the tables on this page." />
        </Card>

        <Card title={<span className="flex items-center gap-2"><Boxes className="h-4 w-4 text-slate-500" /> Operating metrics</span>}
          subtitle="Volume, capacity, utilisation, realisation">
          <AbsentSection
            what="No operating KPIs are carried for this company"
            needs="Volume, capacity and utilisation are sector-specific and appear in the investor presentation, not in
              any financial statement. They differ by industry — tonnes for a cement maker, disbursements for a lender —
              so there is no single field to read even once a source exists." />
        </Card>

        <Card title={<span className="flex items-center gap-2"><Network className="h-4 w-4 text-slate-500" /> Value chain</span>}
          subtitle="Customers, suppliers & concentration">
          <AbsentSection
            what="No customer or supplier list is published"
            needs="Customer concentration appears in the annual report's risk section as prose, and named customers
              usually do not appear at all. Nothing in the catalogue returns it as data." />
        </Card>

        {/* THE CALENDAR IS THE ONE WITH A PARTIAL ANSWER, AND IT SAYS SO. Past
            dated events ARE available — the Documents and Concalls tabs above
            list filings with their dates, straight from the exchange feed. What
            is absent is the FUTURE: no source here publishes a scheduled
            earnings date, and inferring one from last year's timing would put a
            date on screen that the company never announced. */}
        <Card title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-500" /> Calendar</span>}
          subtitle="Earnings, board meetings & investor events">
          <AbsentSection
            what="No FORTHCOMING dates are published by any source wired here"
            needs="A scheduled earnings date comes from the company's own board-meeting intimation. Those are filed as
              announcements and appear once issued, so the calendar can only ever look backwards here — the dated
              filings and concalls above are that record. A future date inferred from last year's timing would be one
              the company never announced." />
        </Card>
      </div>

    </div>
  );
}
