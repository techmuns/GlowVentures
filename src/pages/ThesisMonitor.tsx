import { useMemo, useState } from "react";
import { Crosshair, ChevronDown, ChevronRight, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { StockLink } from "@/components/StockLink";
import { AbsentCell } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { dedupedPositions, sumOrNull } from "@/lib/analytics";
import {
  emptyThesis, readFamilyInputs, writeFamilyInputs,
  type FamilyInputs, type ThesisRecord,
} from "@/lib/familyInputs";
import { fmtPct, changeColor } from "@/lib/format";

// LAYER 4 — MONITOR & DECISION MAKING (FOOS spec).
//
//   "Why invested? Expected return? Risk? Exit triggers? Who proposed? Date?
//    Meeting notes? Review schedule?"
//
// EVERY ONE OF THOSE IS A FAMILY RECORD, NOT A FEED. No statement in `source/`
// carries why a position was bought or what would make the family sell it, and no
// API ever could — which is why this page was a preview until the family-input
// store existed. It is now an editor over the book's own holdings: the position
// figures on the left are live and measured, and the thesis fields beside them
// are the family's.
//
// THE ONE PLACE THIS PAGE COULD FABRICATE, AND DOES NOT: an EXPECTED return sits
// in the same row as a REALISED one. They are labelled distinctly and the
// expected figure renders only when someone typed it — never defaulted, never
// inferred from the actual, because "expected 18%" appearing beside "actual
// +23%" would read as a judgement the family made and did not.
//
// The review schedule feeds the `review-overdue` rule on Alerts, which is why a
// cadence with no last-reviewed date is left absent rather than assumed to be the
// purchase date: it would silently make every unreviewed position look current.

export function ThesisMonitor() {
  const { portfolio, fmtFromBase } = usePortfolio();
  const [inputs, setInputs] = useState<FamilyInputs>(() => readFamilyInputs());
  const save = (next: FamilyInputs) => setInputs(writeFamilyInputs(next));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  /** One row per SECURITY — a thesis is about a company, not about a lot. */
  const rows = useMemo(() => {
    if (!portfolio) return [];
    const m = new Map<string, { key: string; name: string; mv: number; cost: number | null; pnl: number | null }>();
    for (const p of dedupedPositions(portfolio.positions)) {
      const e = m.get(p.securityKey) ?? { key: p.securityKey, name: p.security, mv: 0, cost: null, pnl: null };
      e.mv += p.marketValue;
      e.cost = sumOrNull([e.cost, p.costBasis]);
      e.pnl = sumOrNull([e.pnl, p.unrealizedPnL]);
      m.set(p.securityKey, e);
    }
    return [...m.values()].sort((a, b) => b.mv - a.mv);
  }, [portfolio]);

  const filtered = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.toLowerCase().trim()));
  const recorded = rows.filter((r) => inputs.theses[r.key]?.why).length;

  /** Months since a thesis was last reviewed — null when never recorded. */
  const monthsSince = (iso: string): number | null => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return (Date.now() - t) / (365.25 / 12 * 86400000);
  };

  const patch = (key: string, p: Partial<ThesisRecord>) => {
    const base = inputs.theses[key] ?? emptyThesis(key);
    save({
      ...inputs,
      theses: { ...inputs.theses, [key]: { ...base, ...p, securityKey: key, updatedAt: new Date().toISOString() } },
    });
  };

  if (!portfolio) return null;
  const money = (n: number | null) => fmtFromBase(n, { compact: true });

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string, rows_ = 2) => (
    <label className="block">
      <span className="label-xs">{label}</span>
      <textarea value={value} rows={rows_} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 text-[12px] leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
    </label>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Monitor · Layer 4"
        title="Thesis &amp; Triggers"
        subtitle="Why each position is owned, what would make the family sell it, and when the thesis is next due for review — the family's own record, held against the book's live figures."
        right={<div className="flex items-center gap-2">
          <Pill tone={recorded ? "gain" : "default"}>{recorded} of {rows.length} recorded</Pill>
        </div>} />

      <div className="mb-4 max-w-sm"><SearchInput value={q} onChange={setQ} placeholder="Find a holding…" /></div>

      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-[12.5px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Value</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Return (actual)</th>
                <th className="label-xs px-3 py-2 text-right font-medium" title="The family's own expectation, recorded below. Never inferred from the actual.">Expected</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Thesis</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {filtered.slice(0, 60).map((r) => {
                const t = inputs.theses[r.key];
                const isOpen = open === r.key;
                const ret = t && r.cost != null && r.cost > 0 && r.pnl != null ? (r.pnl / r.cost) * 100 : null;
                const actualRet = r.cost != null && r.cost > 0 && r.pnl != null ? (r.pnl / r.cost) * 100 : null;
                const since = t?.lastReviewed ? monthsSince(t.lastReviewed) : null;
                const overdue = t?.reviewEveryMonths != null && since != null && since > t.reviewEveryMonths;
                return (
                  <>
                    <tr key={r.key} className="cursor-pointer hover:bg-ink-700/30" onClick={() => setOpen(isOpen ? null : r.key)}>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-1.5">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
                          <StockLink securityKey={r.key} name={r.name} />
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right mono text-slate-300">{money(r.mv)}</td>
                      <td className={`px-3 py-2 text-right mono ${changeColor(actualRet)}`}>{fmtPct(actualRet, { sign: true })}</td>
                      <td className="px-3 py-2 text-right mono text-slate-400">
                        {t?.expectedReturnPct == null
                          ? <AbsentCell reason="No expected return recorded for this position. It is the family's own judgement and is never inferred from the actual return beside it." />
                          : `${t.expectedReturnPct.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2 max-w-[280px] truncate text-slate-400">
                        {t?.why || <span className="text-slate-600">not recorded</span>}
                      </td>
                      <td className="px-3 py-2">
                        {t?.reviewEveryMonths == null
                          ? <span className="text-[11px] text-slate-600">no schedule</span>
                          : since == null
                            ? <span className="text-[11px] text-amber-400" title="A cadence is set but no review has been logged, so nothing can be called current.">never reviewed</span>
                            : <span className={`text-[11px] ${overdue ? "text-loss" : "text-gain"}`}>
                                {overdue ? "overdue" : "current"} · every {t.reviewEveryMonths}m
                              </span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={r.key + "-edit"} className="bg-ink-900/50">
                        <td colSpan={6} className="px-4 pb-4 pt-2">
                          <div className="grid gap-3 md:grid-cols-2">
                            {field("Why invested?", t?.why ?? "", (v) => patch(r.key, { why: v }), "The case for owning this — the spec's first question.")}
                            {field("Risk", t?.risk ?? "", (v) => patch(r.key, { risk: v }), "What could go wrong, and what the family is accepting.")}
                            {field("Exit triggers", t?.exitTriggers ?? "", (v) => patch(r.key, { exitTriggers: v }), "What would make the family sell — the condition, not a price alone.")}
                            <div className="grid grid-cols-2 gap-3">
                              <label className="block">
                                <span className="label-xs">Expected return (% p.a.)</span>
                                <input inputMode="decimal" value={t?.expectedReturnPct ?? ""} placeholder="—"
                                  onChange={(e) => {
                                    const n = Number(e.target.value.replace(/[%\s,]/g, ""));
                                    patch(r.key, { expectedReturnPct: e.target.value === "" || !Number.isFinite(n) ? null : n });
                                  }}
                                  className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 mono text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
                              </label>
                              <label className="block">
                                <span className="label-xs">Proposed by</span>
                                <input value={t?.proposedBy ?? ""} placeholder="who"
                                  onChange={(e) => patch(r.key, { proposedBy: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
                              </label>
                              <label className="block">
                                <span className="label-xs">Decided on</span>
                                <input type="date" value={t?.decidedOn ?? ""}
                                  onChange={(e) => patch(r.key, { decidedOn: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 text-[12px] text-slate-200 focus:border-champagne-500/40 focus:outline-none" />
                              </label>
                              <label className="block">
                                <span className="label-xs">Last reviewed</span>
                                <input type="date" value={t?.lastReviewed ?? ""}
                                  onChange={(e) => patch(r.key, { lastReviewed: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 text-[12px] text-slate-200 focus:border-champagne-500/40 focus:outline-none" />
                              </label>
                              <label className="col-span-2 block">
                                <span className="label-xs">Review every (months)</span>
                                <input inputMode="numeric" value={t?.reviewEveryMonths ?? ""} placeholder="e.g. 6"
                                  onChange={(e) => {
                                    const n = Number(e.target.value);
                                    patch(r.key, { reviewEveryMonths: Number.isFinite(n) && n > 0 ? n : null });
                                  }}
                                  className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 mono text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
                              </label>
                            </div>
                          </div>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                            Saved to this browser as you type. Back it up with{" "}
                            <span className="font-medium text-slate-400">Export</span> on Exposure &amp; IPS — the whole
                            family record, including these theses, round-trips through one JSON file.
                          </p>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 60 && (
          <p className="border-t border-ink-700/70 px-4 py-2 text-[11px] text-slate-500">
            Showing the 60 largest of {filtered.length} — search to reach the rest.
          </p>
        )}
      </Card>

      <Card className="mt-5" title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-champagne-400" /> What still needs a source</span>}
        subtitle="Named rather than shown as an empty feature">
        <ul className="space-y-2 text-[11.5px] leading-relaxed text-slate-500">
          <li><span className="font-medium text-slate-400">Meeting notes.</span> The spec's Layer 1 note store — tagged notes from manager meetings and IC discussions, queryable in natural language. It needs a note store and an index; the theses above are the decision record, not the meeting record.</li>
          <li><span className="font-medium text-slate-400">Fund-manager change and style drift.</span> These would let a thesis break automatically rather than at the next scheduled review. Both need a manager-monitoring feed — AMC and SEBI disclosures — that nothing in this book reads.</li>
          <li><span className="font-medium text-slate-400">"AI prompt — if any of the above changes significantly, highlight it."</span> Buildable once the notes and the manager feed exist: the thesis text above is exactly the input such a monitor would compare against.</li>
        </ul>
      </Card>
    </div>
  );
}
