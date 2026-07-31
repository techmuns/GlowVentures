import { History, ArrowUp, ArrowDown } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { AbsentSection, DASH } from "@/components/Absent";
import { fmtDate, fmtPct } from "@/lib/format";

export function UploadHistory() {
  const { portfolio, fmtFromBase } = usePortfolio();
  if (!portfolio) return null;
  const nav = portfolio.navHistory;
  const pm = portfolio.privateMarkets;
  const hasPrivate = pm.peFunds.length + pm.preIpoFunds.length + pm.unlistedCompanies.length
    + pm.debtFunds.length + pm.closedFunds.length + pm.startups.length > 0;
  const rows = nav.map((n, i) => {
    const prev = i > 0 ? nav[i - 1].nav : null;
    const growth = prev ? (n.nav / prev - 1) * 100 : null;
    return { ...n, growth, latest: i === nav.length - 1 };
  }).reverse();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Admin" title="Snapshot History"
        subtitle="Year-end listed-book snapshots, as reported by the ingested performance-history statements."
        right={<Pill tone="info">{nav.length} snapshots</Pill>} />
      {/* An empty table is still a table: header row, column names, and nothing
          under them reads as "we looked and there were no snapshots". There are
          none because no performance-history statement in this drop prints a
          dated portfolio value series — say that instead of drawing the frame. */}
      {nav.length === 0 ? (
        <Card>
          <AbsentSection
            what="No snapshots ingested"
            needs="A snapshot is a dated portfolio value from a performance-history statement. The reports in this
              drop print period RETURNS rather than a valuation series, so there is no dated NAV to record. A
              periodic — monthly or quarterly — valuation statement per account is what fills this." />
        </Card>
      ) : (
      <Card pad={false}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-ink-700">
            <tr>
              <th className="label-xs px-5 py-3 text-left font-medium">Period</th>
              <th className="label-xs px-5 py-3 text-left font-medium">As of</th>
              <th className="label-xs px-5 py-3 text-right font-medium">Listed NAV</th>
              <th className="label-xs px-5 py-3 text-right font-medium">Growth</th>
              <th className="label-xs px-5 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700/70">
            {rows.map((r) => (
              <tr key={r.period} className="hover:bg-ink-700/40">
                <td className="px-5 py-3.5 font-medium text-slate-100">{r.period}</td>
                <td className="px-5 py-3.5 text-slate-400">{fmtDate(r.date)}</td>
                <td className="px-5 py-3.5 text-right mono text-slate-200">{fmtFromBase(r.nav, { compact: true })}</td>
                <td className="px-5 py-3.5 text-right">
                  {/* Signed both ways: a green up-arrow on a fall is a lie the
                      reader has no way to catch from the number beside it. */}
                  {r.growth != null ? (
                    <span className={`mono inline-flex items-center gap-1 ${r.growth >= 0 ? "text-gain" : "text-loss"}`}>
                      {r.growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {fmtPct(r.growth, { decimals: 0 })}
                    </span>
                  ) : <span className="text-slate-600" title="the first snapshot has nothing before it to grow from">{DASH}</span>}
                </td>
                <td className="px-5 py-3.5">{r.latest ? <Pill tone="gain">Active</Pill> : <Pill>Archived</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      )}
      <Card className="mt-5" title="Current consolidated snapshot">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md border border-champagne-500/30 bg-champagne-500/10 text-champagne-400"><History className="h-5 w-5" /></div>
          <div>
            <div className="text-sm text-slate-200">{portfolio.fileName}</div>
            {/* Private renders as absent, not ₹0, when the book holds no private
                instrument — "₹0 private" claims a private book worth nothing. */}
            <div className="text-xs text-slate-500">
              Listed {fmtFromBase(portfolio.listedValue, { compact: true })} ·{" "}
              Private {hasPrivate
                ? fmtFromBase(portfolio.privateValue, { compact: true })
                : <span title="No private-market holding in this book — absent, not zero.">{DASH}</span>} ·{" "}
              Total {fmtFromBase(portfolio.totalValue, { compact: true })} · as of {fmtDate(portfolio.asOf)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
