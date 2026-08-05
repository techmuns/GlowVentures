import { useMemo } from "react";
import { Eye, ShieldAlert, Sparkles, Crosshair } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { StockLink } from "@/components/StockLink";
import { PreviewBadge, PreviewNum, PreviewPill } from "@/components/Preview";
import { usePortfolio } from "@/context/PortfolioContext";
import { bySecurity } from "@/lib/analytics";
import { fmtPct, changeColor } from "@/lib/format";

// LAYER 4 — MONITOR & DECISION MAKING (FOOS spec). For every position: why
// invested, expected return, risk, exit triggers, who proposed, date, meeting
// notes, review schedule, FM change, style drift — plus a stop-loss monitor and
// an AI thesis-drift watcher.
//
// MIXED. The position, its live value and its return come from the book. The
// thesis fields, stop levels, review dates and drift flags need a thesis store
// and an AI model that do not exist yet, so those columns are PREVIEW. (A single
// security's "why we own it" note can already be recorded on its company page —
// this is the cross-book monitoring view of all of them.)

// Sample thesis text, cycled per row so the preview reads plausibly.
const THESIS = [
  { why: "Market-leading franchise, long runway", exp: "15–18% IRR", exit: "Thesis break / >40x PE", proposer: "Aristos", review: "Q3 FY26" },
  { why: "Capex cycle beneficiary, pricing power", exp: "12–15% IRR", exit: "Margin compression", proposer: "GLC", review: "Q2 FY26" },
  { why: "Structural formalisation tailwind", exp: "14–16% IRR", exit: "Regulatory shift", proposer: "Carnelian", review: "Q4 FY26" },
  { why: "Under-owned quality compounder", exp: "13–17% IRR", exit: "Governance red flag", proposer: "V.E.C Assago", review: "Q3 FY26" },
];
const FLAGS = ["On track", "Review due", "Watch: FM change", "Watch: style drift", "Near stop-loss"];
const FLAG_TONE: Record<string, string> = {
  "On track": "text-gain", "Review due": "text-amber-400", "Watch: FM change": "text-amber-400",
  "Watch: style drift": "text-amber-400", "Near stop-loss": "text-loss",
};

export function ThesisMonitor() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  const rows = useMemo(() => {
    const nameByKey = new Map<string, string>();
    const priceByKey = new Map<string, { price: number | null; ret: number }>();
    for (const p of consolidated) {
      if (!nameByKey.has(p.securityKey)) nameByKey.set(p.securityKey, p.security);
      if (!priceByKey.has(p.securityKey)) priceByKey.set(p.securityKey, { price: p.currentPrice ?? null, ret: p.returnPct });
    }
    return bySecurity(consolidated).slice(0, 12).map((b, i) => ({
      key: b.key, name: nameByKey.get(b.key) ?? b.key, mv: b.mv, ret: b.returnPct,
      price: priceByKey.get(b.key)?.price ?? null, t: THESIS[i % THESIS.length], flag: FLAGS[i % FLAGS.length],
    }));
  }, [consolidated]);

  if (!portfolio) return null;
  const money = (n: number) => fmtFromBase(n, { compact: true });
  const price = (n: number | null) => (n == null ? "—" : fmtFromBase(n));

  return (
    <div>
      <PageHeader
        eyebrow="Monitor · Layer 4"
        title="Thesis & Triggers"
        subtitle="Why we own each position, the expected return, the exit triggers and the review schedule — monitored across the book, with a stop-loss watcher."
        right={<BasisPill liveText="Positions marked live" hint="The position, value and return are live from the book; the thesis, stop levels, review dates and drift flags are illustrative until a thesis store exists." />}
      />

      <Card className="mb-5" title={<span className="flex items-center gap-2"><Eye className="h-4 w-4 text-champagne-400" /> Thesis monitor</span>}
        subtitle="Position · value · return are live; the thesis fields are placeholders (record a per-name thesis on its company page today)"
        right={<Pill tone="info">live + preview</Pill>} pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-[12.5px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Value</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Return</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Why we own it</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Expected</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Exit trigger</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Proposed by</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Review</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-ink-700/30">
                  <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={r.key} name={r.name} /></td>
                  <td className="px-3 py-2.5 text-right mono text-slate-200">{money(r.mv)}</td>
                  <td className={`px-3 py-2.5 text-right mono ${changeColor(r.ret)}`}>{fmtPct(r.ret, { sign: true })}</td>
                  <td className="px-4 py-2.5 max-w-[220px] whitespace-normal text-slate-400" title="Placeholder — not live data">{r.t.why}</td>
                  <td className="px-3 py-2.5"><PreviewNum>{r.t.exp}</PreviewNum></td>
                  <td className="px-4 py-2.5 text-slate-500" title="Placeholder — not live data">{r.t.exit}</td>
                  <td className="px-3 py-2.5 text-slate-400" title="Placeholder — not live data">{r.t.proposer}</td>
                  <td className="px-3 py-2.5"><PreviewNum>{r.t.review}</PreviewNum></td>
                  <td className={`px-3 py-2.5 font-medium ${FLAG_TONE[r.flag] ?? "text-slate-400"}`} title="Placeholder — not live data">{r.flag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3 items-start">
        {/* Stop-loss monitor */}
        <Card className="lg:col-span-2 preview-hatch" title={<span className="flex items-center gap-2"><Crosshair className="h-4 w-4 text-champagne-400" /> Stop-loss monitor</span>}
          subtitle="Current price is live; the stop level and distance are illustrative" right={<PreviewBadge />} pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[12.5px]">
              <thead className="border-b border-ink-700"><tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Current</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Stop level</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Distance</th>
              </tr></thead>
              <tbody className="divide-y divide-ink-700/60">
                {rows.slice(0, 6).map((r, i) => (
                  <tr key={r.key} className="hover:bg-ink-700/30">
                    <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={r.key} name={r.name} /></td>
                    <td className="px-3 py-2.5 text-right mono text-slate-300">{price(r.price)}</td>
                    <td className="px-3 py-2.5 text-right"><PreviewNum>−15% band</PreviewNum></td>
                    <td className="px-3 py-2.5 text-right"><PreviewNum>{[8.4, 12.1, 4.6, 19.2, 6.8, 2.1][i].toFixed(1)}%</PreviewNum></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* AI thesis-drift */}
        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-champagne-400" /> AI thesis-drift watch</span>} right={<PreviewBadge />}>
          <ul className="space-y-2.5">
            {[
              { t: "Aristos: style drift toward large-cap detected", tag: "Style" },
              { t: "GLC: AUM up 3× in 12 months — capacity risk", tag: "Manager" },
              { t: "Carnelian: FM change flagged in filing", tag: "FM change" },
              { t: "Holding X: margin guidance cut breaks thesis", tag: "Thesis" },
            ].map((a) => (
              <li key={a.t} className="flex items-start gap-2 rounded-md border border-ink-700 bg-ink-800/60 p-2.5">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <div>
                  <div className="text-[12px] text-slate-300" title="Placeholder — not live data">{a.t}</div>
                  <PreviewPill>{a.tag}</PreviewPill>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">An AI prompt would watch each thesis and flag significant changes — needs the thesis store plus a monitoring model.</p>
        </Card>
      </div>
    </div>
  );
}
