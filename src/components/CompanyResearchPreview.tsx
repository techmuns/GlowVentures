import { useEffect, useMemo, useState } from "react";
import { Building2, BarChart3, ArrowUpRight, ArrowDownRight, FileText } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtNum, fmtDate } from "@/lib/format";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { getHoldingsInsider, type InsiderResponse } from "@/lib/insider";
import { fetchPriceHistory } from "@/lib/prices";

// COMPANY RESEARCH — the FOOS spec's deep company page. MIXED, now that the real
// endpoints are wired:
//   • LIVE — the 52-week trading range (from the quote feed, or from the price
//     history's daily closes where the quote carries none) and insider trades
//     (the muns insider endpoint). The Financials, ratios, shareholding, street
//     estimates, documents and concalls the spec asks for are ALREADY live in the
//     Research panel above this, straight from screener.in / the filings feed, so
//     they are pointed to rather than duplicated here.
//   • NOT SHOWN AT ALL — business segments, operating KPIs, value chain and the
//     forward calendar. No endpoint in the catalogue serves any of them,
//     VERIFIED against the live API rather than assumed. They were sample
//     figures until 2026-08-11 and then four dashed "absent" cards; the family
//     asked for the cards to go, so the absence is recorded in
//     docs/API-PROBE.md instead of occupying half the page.
//
// What is NOT shown: a rupee market cap / EV / book value / face value. The quote
// feed returns a market-cap figure of unverified unit and no share count, so a
// value here could be wrong by a factor of a crore — and this book's rule is that
// an unverifiable figure is absent, not guessed. Book value and the rest are in
// the live Financials tables above.

/** The columns, in the order the insider table's rows write their cells. */
const INSIDER_COLS = ["date", "insider", "type", "shares", "value", "post"] as const;

export function CompanyResearchPreview({ name, ticker, price, live, low52: quoteLow52, high52: quoteHigh52 }: {
  name: string;
  ticker: string | null;
  price: number | null;
  live: boolean;
  low52: number | null;
  high52: number | null;
}) {
  const { fmtFromBase } = usePortfolio();
  const [insider, setInsider] = useState<InsiderResponse | undefined>(undefined);
  const view = useTableView("insider-trades", INSIDER_COLS);

  useEffect(() => {
    if (!ticker) { setInsider(null as unknown as InsiderResponse); return; }
    let alive = true;
    setInsider(undefined);
    getHoldingsInsider([{ symbol: ticker, name, key: ticker, weight: 0 }]).then((r) => { if (alive) setInsider(r); });
    return () => { alive = false; };
  }, [ticker, name]);

  // THE 52-WEEK RANGE HAS TWO SOURCES, AND THE CARD SAYS WHICH ONE IT SHOWS.
  //
  // The muns quote carries the exchange's own 52-week range; an Upstox full
  // quote carries none. Where the quote gave none, the range is struck from the
  // price history's DAILY CLOSES — the figures the returns table on this page
  // already prints — rather than the card going blank. The two are not the same
  // measurement (intraday extremes against closes), which is why the subtitle
  // names the one on screen.
  const fromQuote = quoteLow52 != null && quoteHigh52 != null;
  const [hist, setHist] = useState<{ low52: number | null; high52: number | null } | null | undefined>(undefined);
  useEffect(() => {
    if (fromQuote || !ticker) { setHist(null); return; }
    let alive = true;
    setHist(undefined);
    fetchPriceHistory(ticker).then((r) => { if (alive) setHist(r.ok ? { low52: r.low52, high52: r.high52 } : null); });
    return () => { alive = false; };
  }, [fromQuote, ticker]);
  const low52 = fromQuote ? quoteLow52 : hist?.low52 ?? null;
  const high52 = fromQuote ? quoteHigh52 : hist?.high52 ?? null;
  const rangeFrom = fromQuote ? "quote" : low52 != null && high52 != null ? "history" : null;

  // Position within the 52-week range, for the live band.
  const rangePct = useMemo(() => {
    if (price == null || low52 == null || high52 == null || high52 <= low52) return null;
    return Math.min(100, Math.max(0, ((price - low52) / (high52 - low52)) * 100));
  }, [price, low52, high52]);

  const items = sortRows(insider && insider.ok ? (insider.items ?? []) : [], view.sort, {
    date: (t) => (t.broadcastDate ? String(t.broadcastDate).slice(0, 10) : null),
    insider: (t) => t.insider,
    type: (t) => t.transaction,
    shares: (t) => t.shares,
    value: (t) => t.value,
    post: (t) => (t.postPct ? Number(String(t.postPct).replace(/[^\d.-]/g, "")) : null),
  });

  return (
    <div className="mt-6">
      {/* Live: 52-week trading range */}
      <Card title={<span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-champagne-400" /> Trading range</span>}
        subtitle={rangeFrom === "history" ? "52-week high & low of daily closes, from the price history" : "52-week high & low from the quote feed"}
        right={<Pill tone="info">{live ? "live" : "statement mark"}</Pill>}>
        {low52 == null || high52 == null ? (
          hist === undefined && !fromQuote && ticker
            ? <div className="text-[12.5px] text-slate-500">Loading the 52-week range…</div>
            : <AbsentCell reason={ticker
                ? "neither the quote feed nor the price history returned a 52-week range for this security"
                : "no NSE symbol is mapped for this security, so no 52-week range can be fetched"} />
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
                <Tr view={view}>
                  <SortHeader col="date" view={view} align="left" pad="px-4 py-2">Date</SortHeader>
                  <SortHeader col="insider" view={view} align="left" pad="px-3 py-2">Insider</SortHeader>
                  <SortHeader col="type" view={view} align="left" pad="px-3 py-2">Type</SortHeader>
                  <SortHeader col="shares" view={view} pad="px-3 py-2">Shares</SortHeader>
                  <SortHeader col="value" view={view} pad="px-3 py-2">Value</SortHeader>
                  <SortHeader col="post" view={view} pad="px-3 py-2">Post-holding</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {items.slice(0, 40).map((t, i) => {
                  const acq = /acquisition|buy|purchase/i.test(t.transaction);
                  return (
                    <Tr view={view} key={t.key ?? i} className="hover:bg-ink-700/30">
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
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pointer: everything already live in the Research panel above. ONE LINE,
          the detail in its hover — it was a 511-character paragraph under the
          insider-trades table, and the family asked for the notes around the
          tables to go (Stage 10cg). */}
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3"
        data-research-pointer
        title="The Research panel serves the quarterly and annual P&L, balance sheet, cash flow, the 10-year ratio history, the shareholding pattern, consensus estimates and the document repository straight from the data service. Market cap, enterprise value, book value and face value are in those tables; they are not repeated here as standalone figures because the price feed does not return them in a unit this book can verify.">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-champagne-400" />
        <div className="text-[12.5px] leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-200">Financials, ratios, shareholding, street estimates, documents & concalls are live above</span>
        </div>
      </div>

      {/* THE FOUR CARDS THAT USED TO CLOSE THIS PAGE ARE GONE, at the family's
          request. They were Business segments, Operating metrics, Value chain
          and Calendar — each an AbsentSection naming the source that would fill
          it, because nothing wired here publishes any of them for any company.
          Four permanently empty boxes are not a feature: on a page where a
          panel above may ALSO be empty because the data service is down, they
          made the screen read as broken. The absence itself is recorded in
          docs/API-PROBE.md and in CLAUDE.md rather than drawn on screen, which
          is where a "no source exists for this" belongs — a reader should not
          have to scroll past four dashed boxes to learn nothing. The rule that
          put them here stands: what must never come back is the INVENTED
          version they replaced (segment revenue 58/27/15, "Utilisation 76%",
          "Next earnings 24 Oct 2026"), which asserted facts about a real,
          named company. */}

    </div>
  );
}
