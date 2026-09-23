import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtNum, fmtDate } from "@/lib/format";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { getHoldingsInsider, type InsiderResponse } from "@/lib/insider";

/**
 * ── INSIDER & BULK DEALS, AS ONE PANEL OF THE COMPANY RESEARCH CARD ─────────
 *
 * This was the second card of `CompanyResearchPreview`, which stood under the
 * Research panel, the ratio table and the returns table on one long page. The
 * family asked for the position page to become tabs with no long scroll —
 * *"remove what is not necessary and consolidate what can be consolidated"* —
 * so it is a sub-tab of the research card now, beside Financials and Ratios,
 * and the card it lived in is gone with the two things that were not needed:
 *
 *   • the TRADING RANGE card printed the 52-week high and low, which the returns
 *     table on the Price & returns tab already carries as two of its columns —
 *     and since Upstox became the primary quote feed (which carries no 52-week
 *     range) both were struck from the same daily closes, so they were one
 *     figure printed twice;
 *   • a paragraph that described the OTHER cards on the page ("Financials,
 *     ratios … are live above"), which is chrome once they are tabs of one card.
 *
 * What that card's header also recorded stands and is repeated here so it is not
 * lost with the file: business segments, operating KPIs, value chain and the
 * forward calendar are absent BY DECISION — no endpoint in the catalogue serves
 * any of them (`docs/API-PROBE.md`) — and what must never come back is the
 * INVENTED version they once replaced, which asserted facts about a real, named
 * company.
 *
 * NOTHING HERE IS A POSITION. These are the exchange's disclosures about other
 * people's dealing in the company, read as the feed wrote them.
 */

/** The columns, in the order the insider table's rows write their cells. */
const INSIDER_COLS = ["date", "insider", "type", "shares", "value", "post"] as const;

export function InsiderDeals({ ticker, name }: { ticker: string; name: string }) {
  const { fmtFromBase } = usePortfolio();
  const [insider, setInsider] = useState<InsiderResponse | undefined>(undefined);
  // The same storage key the card used, so a reader's own column order and sort
  // survive the move rather than resetting.
  const view = useTableView("insider-trades", INSIDER_COLS);

  useEffect(() => {
    let alive = true;
    setInsider(undefined);
    getHoldingsInsider([{ symbol: ticker, name, key: ticker, weight: 0 }]).then((r) => { if (alive) setInsider(r); });
    return () => { alive = false; };
  }, [ticker, name]);

  const items = sortRows(insider && insider.ok ? (insider.items ?? []) : [], view.sort, {
    date: (t) => (t.broadcastDate ? String(t.broadcastDate).slice(0, 10) : null),
    insider: (t) => t.insider,
    type: (t) => t.transaction,
    shares: (t) => t.shares,
    value: (t) => t.value,
    post: (t) => (t.postPct ? Number(String(t.postPct).replace(/[^\d.-]/g, "")) : null),
  });

  // THE CAUSE PICKS THE SENTENCE. A feed that is not switched on, a feed that
  // did not answer and a company with nothing disclosed are three different
  // facts, and only the last is a statement about the company.
  if (insider === undefined) {
    return <div className="grid h-24 place-items-center text-sm text-slate-500" data-insider-deals="loading">Loading insider trades…</div>;
  }
  if (!insider || !insider.ok) {
    return (
      <p className="py-3 text-[12.5px] leading-relaxed text-slate-500" data-insider-deals="unavailable">
        {insider && insider.reason === "not_configured"
          ? "The insider feed isn't switched on yet — it activates once the data-service token is configured."
          : "The insider feed didn't respond for this security."}
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="py-3 text-[12.5px] text-slate-500" data-insider-deals="none">No insider transactions disclosed for {name} in the feed&rsquo;s window.</p>;
  }
  return (
    <div className="max-h-[420px] overflow-auto" data-insider-deals="ok">
      <p className="mb-2 text-[11.5px] text-slate-500">Insider trading disclosures from the exchange feed — dealing by the company&rsquo;s insiders, not by this family.</p>
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
  );
}
