import { History, ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtDate, fmtPct } from "@/lib/format";

export function UploadHistory() {
  const { portfolio, fmtFromBase } = usePortfolio();
  if (!portfolio) return null;
  const nav = portfolio.navHistory;
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
                  {r.growth != null ? (
                    <span className="mono text-gain inline-flex items-center gap-1"><ArrowUp className="h-3 w-3" />{fmtPct(r.growth, { decimals: 0 })}</span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-5 py-3.5">{r.latest ? <Pill tone="gain">Active</Pill> : <Pill>Archived</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="mt-5" title="Current consolidated snapshot">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md border border-champagne-500/30 bg-champagne-500/10 text-champagne-400"><History className="h-5 w-5" /></div>
          <div>
            <div className="text-sm text-slate-200">{portfolio.fileName}</div>
            <div className="text-xs text-slate-500">Listed {fmtFromBase(portfolio.listedValue, { compact: true })} · Private {fmtFromBase(portfolio.privateValue, { compact: true })} · Total {fmtFromBase(portfolio.totalValue, { compact: true })} · as of {fmtDate(portfolio.asOf)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
