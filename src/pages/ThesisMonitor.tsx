import { useMemo } from "react";
import { Eye, ShieldAlert, Sparkles, Crosshair } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { StockLink } from "@/components/StockLink";
import { PreviewBadge, PreviewPill } from "@/components/Preview";
import { AbsentCell } from "@/components/Absent";
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

// WHY THERE IS NO SAMPLE THESIS TEXT HERE.
//
// This table's first three columns are REAL — the family's own securities, their
// market value and their return, straight from the book. The remaining six were
// filled from a rotating list of invented theses, and the effect was to publish
// statements about identifiable holdings and identifiable managers: an expected
// "15–18% IRR" against a name nobody underwrote, an exit trigger nobody set, a
// "Near stop-loss" flag on whichever row landed on index 4, and a "Proposed by"
// naming Aristos, Carnelian and V.E.C Assago — three managers who really do run
// this family's money and really did not propose those positions.
//
// A greyed number reads as illustrative. A sentence does not: "governance red
// flag" beside a company the family owns ₹4 Cr of is a claim, and a badge in the
// card header does not unmake it. The standing rule already covers this —
// nothing on screen may be hardcoded that isn't derived from the book, entity
// names and dates included.
//
// So every thesis column renders through `AbsentCell` with the reason. The
// layout is unchanged, the client sees exactly which fields a thesis store would
// populate, and the page asserts nothing about anyone. `InvestmentTools` on a
// company page already records a real per-name note, and when that store grows
// a cross-book view these cells fill from it.
const THESIS_ABSENT = "no thesis recorded — needs a thesis store; record one per name on its company page";

export function ThesisMonitor() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  const rows = useMemo(() => {
    const nameByKey = new Map<string, string>();
    const priceByKey = new Map<string, number | null>();
    for (const p of consolidated) {
      if (!nameByKey.has(p.securityKey)) nameByKey.set(p.securityKey, p.security);
      if (!priceByKey.has(p.securityKey)) priceByKey.set(p.securityKey, p.currentPrice ?? null);
    }
    return bySecurity(consolidated).slice(0, 12).map((b) => ({
      key: b.key, name: nameByKey.get(b.key) ?? b.key, mv: b.mv, ret: b.returnPct,
      price: priceByKey.get(b.key) ?? null,
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
                  {/* Six thesis fields, none of which any statement or store
                      carries. Absent with a reason — never an invented sample
                      against a real holding. */}
                  <td className="px-4 py-2.5"><AbsentCell reason={THESIS_ABSENT} /></td>
                  <td className="px-3 py-2.5"><AbsentCell reason="no expected return underwritten for this position" /></td>
                  <td className="px-4 py-2.5"><AbsentCell reason="no exit trigger set for this position" /></td>
                  <td className="px-3 py-2.5"><AbsentCell reason="the statements do not record who proposed a position" /></td>
                  <td className="px-3 py-2.5"><AbsentCell reason="no review schedule recorded" /></td>
                  <td className="px-3 py-2.5"><AbsentCell reason="status needs a thesis to drift from" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3 items-start">
        {/* Stop-loss monitor */}
        {/* A stop level is a family decision, and the distance to it is arithmetic
            on that decision. Neither exists, so neither is drawn: the six sample
            distances here were a fixed list indexed by row, printed against real
            securities at their real prices. */}
        <Card className="lg:col-span-2 preview-hatch" title={<span className="flex items-center gap-2"><Crosshair className="h-4 w-4 text-champagne-400" /> Stop-loss monitor</span>}
          subtitle="The current price is live; a stop level is the family's own decision and none is recorded" right={<PreviewBadge label="Not wired" />} pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[12.5px]">
              <thead className="border-b border-ink-700"><tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Current</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Stop level</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Distance</th>
              </tr></thead>
              <tbody className="divide-y divide-ink-700/60">
                {rows.slice(0, 6).map((r) => (
                  <tr key={r.key} className="hover:bg-ink-700/30">
                    <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={r.key} name={r.name} /></td>
                    <td className="px-3 py-2.5 text-right mono text-slate-300">{price(r.price)}</td>
                    <td className="px-3 py-2.5 text-right"><AbsentCell reason="no stop level set — record one as an exit price on this name's company page" /></td>
                    <td className="px-3 py-2.5 text-right"><AbsentCell reason="distance is measured to a stop level, and none is set" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* AI thesis-drift */}
        {/* WHAT IT WOULD WATCH FOR, not what it found. These four read as fired
            findings — "Aristos: style drift toward large-cap detected",
            "Carnelian: FM change flagged in filing" — about two managers who run
            ₹78 Cr of this book between them. Nothing detected or flagged
            anything; there is no monitor. A description of the rule is true
            whether or not it ever fires. */}
        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-champagne-400" /> AI thesis-drift watch</span>} right={<PreviewBadge label="Not wired" />}>
          <ul className="space-y-2.5">
            {[
              { t: "A mandate's holdings drift outside its stated style or market cap", tag: "Style" },
              { t: "A mandate's AUM grows past the capacity it published", tag: "Manager" },
              { t: "A manager discloses a key-personnel change in a filing", tag: "FM change" },
              { t: "A holding's own guidance moves against the thesis recorded for it", tag: "Thesis" },
            ].map((a) => (
              <li key={a.t} className="flex items-start gap-2 rounded-md border border-ink-700 bg-ink-800/60 p-2.5">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
                <div>
                  <div className="text-[12px] leading-snug text-slate-400">{a.t}</div>
                  <PreviewPill>{a.tag}</PreviewPill>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">
            These are the conditions such a watch would evaluate. Nothing evaluates them yet — it needs the thesis
            store plus a monitoring model — so no drift has been detected for any manager or holding.
          </p>
        </Card>
      </div>
    </div>
  );
}
