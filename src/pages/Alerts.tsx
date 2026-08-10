import { useMemo, useState } from "react";
import { BellRing, Plus, Trash2, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { dedupedPositions } from "@/lib/analytics";
import {
  IPS_BUCKETS, readFamilyInputs, writeFamilyInputs,
  type AlertRule, type AlertRuleKind, type FamilyInputs, type IpsBucketKey,
} from "@/lib/familyInputs";
import { evaluateAlerts, ALERT_KIND_LABEL, type EvaluatedAlert } from "@/lib/alertEngine";

// LAYER 5 — ALERT SYSTEM (FOOS spec).
//
// This page used to state the CONDITION each alert would evaluate and say plainly
// that nothing had fired, because there was no rules engine and no thresholds:
// the spec's examples ("Growth bucket exceeds max allocation", "FM resigned") need
// a rule someone wrote and a book to test it against. The rules now exist — the
// family writes them in the family-input store — and `alertEngine` evaluates them
// against the real portfolio.
//
// THE RULE THAT MATTERS MOST HERE: SILENCE IS READ AS ALL-CLEAR.
// So a rule whose inputs are incomplete must NEVER look like a rule that was
// checked and passed. A price rule on a security with no live quote, an IPS rule
// on a bucket nothing is mapped to, a review rule with no schedules recorded —
// each reports as UNMEASURABLE with the reason, in its own colour, counted apart
// from the ones that are genuinely fine. That is the absent-vs-zero rule applied
// to a boolean: a condition nobody could evaluate is not a condition that held.

const NEW_RULE = (kind: AlertRuleKind): AlertRule => ({
  id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  kind, threshold: null, note: "", enabled: true, createdAt: new Date().toISOString(),
});

export function Alerts() {
  const { portfolio, consolidated } = usePortfolio();
  const [inputs, setInputs] = useState<FamilyInputs>(() => readFamilyInputs());
  const save = (next: FamilyInputs) => setInputs(writeFamilyInputs(next));
  const [adding, setAdding] = useState<AlertRuleKind>("ips-over");

  const nameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of dedupedPositions(portfolio?.positions ?? [])) if (!m.has(p.securityKey)) m.set(p.securityKey, p.security);
    return m;
  }, [portfolio]);

  const securities = useMemo(
    () => [...nameByKey.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name)),
    [nameByKey],
  );

  const evaluated: EvaluatedAlert[] = useMemo(
    () => (portfolio ? evaluateAlerts(portfolio, inputs, { nameFor: (k) => nameByKey.get(k) ?? k }) : []),
    [portfolio, inputs, nameByKey],
  );

  const firing = evaluated.filter((e) => e.status === "firing");
  const ok = evaluated.filter((e) => e.status === "ok");
  const unmeasurable = evaluated.filter((e) => e.status === "unmeasurable");

  const addRule = () => save({ ...inputs, alertRules: [...inputs.alertRules, NEW_RULE(adding)] });
  const patch = (id: string, p: Partial<AlertRule>) =>
    save({ ...inputs, alertRules: inputs.alertRules.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const remove = (id: string) => save({ ...inputs, alertRules: inputs.alertRules.filter((r) => r.id !== id) });

  if (!portfolio) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Monitor · Layer 5"
        title="Alerts"
        subtitle="Rules the family writes, evaluated against the book on every load — IPS breaches, price levels, concentration and overdue thesis reviews."
        right={
          <div className="flex items-center gap-2">
            {firing.length > 0 && <Pill tone="loss">{firing.length} firing</Pill>}
            {unmeasurable.length > 0 && <Pill tone="warn">{unmeasurable.length} unmeasurable</Pill>}
            <Pill tone="gain">{ok.length} clear</Pill>
          </div>
        } />

      {/* ── Evaluated results ──────────────────────────────────────────── */}
      {evaluated.length === 0 ? (
        <Card title="No rules yet">
          <p className="text-[12.5px] leading-relaxed text-slate-400">
            An alert needs a rule someone wrote. Add one below and it is evaluated against the book immediately —
            there is nothing to fetch and no vendor involved, because every input is either the family's own
            threshold or a figure already in the book.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {[
            { rows: firing, tone: "loss" as const, icon: AlertTriangle, label: "Firing" },
            { rows: unmeasurable, tone: "warn" as const, icon: HelpCircle, label: "Cannot be evaluated" },
            { rows: ok, tone: "gain" as const, icon: CheckCircle2, label: "Clear" },
          ].filter((g) => g.rows.length > 0).map((g) => (
            <Card key={g.label}
              title={<span className="flex items-center gap-2"><g.icon className={`h-4 w-4 ${g.tone === "loss" ? "text-loss" : g.tone === "warn" ? "text-amber-400" : "text-gain"}`} /> {g.label}</span>}
              right={<Pill tone={g.tone}>{g.rows.length}</Pill>}>
              <ul className="space-y-2">
                {g.rows.map((e) => (
                  <li key={e.rule.id} className="rounded-lg border border-ink-700 bg-ink-800/60 p-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-slate-200">{e.headline}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {ALERT_KIND_LABEL[e.rule.kind]}
                          {e.rule.threshold != null && <> · threshold {e.rule.threshold}</>}
                          {e.rule.note && <> · {e.rule.note}</>}
                        </div>
                        {e.reason && <div className="mt-1 text-[11px] leading-relaxed text-amber-400/80">{e.reason}</div>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {/* ── Rule editor ────────────────────────────────────────────────── */}
      <Card className="mt-5"
        title={<span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-champagne-400" /> Alert rules</span>}
        subtitle="The family's own thresholds. Stored in this browser and exportable from Exposure &amp; IPS."
        right={
          <div className="flex items-center gap-1.5">
            <select value={adding} onChange={(e) => setAdding(e.target.value as AlertRuleKind)}
              className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] text-slate-200 focus:outline-none">
              {(Object.keys(ALERT_KIND_LABEL) as AlertRuleKind[]).map((k) => (
                <option key={k} value={k}>{ALERT_KIND_LABEL[k]}</option>
              ))}
            </select>
            <button onClick={addRule}
              className="flex items-center gap-1 rounded-md border border-champagne-500/40 bg-champagne-500/10 px-2 py-1 text-[11px] text-champagne-400 hover:bg-champagne-500/20">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        } pad={false}>
        {inputs.alertRules.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-slate-500">No rules recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full whitespace-nowrap text-[12.5px]">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Rule</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">Subject</th>
                  <th className="label-xs px-3 py-2 text-right font-medium">Threshold</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">Note</th>
                  <th className="label-xs px-3 py-2 text-center font-medium">On</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {inputs.alertRules.map((r) => {
                  const isPrice = r.kind === "price-above" || r.kind === "price-below";
                  const isIps = r.kind === "ips-over" || r.kind === "ips-under";
                  return (
                    <tr key={r.id} className="hover:bg-ink-700/30">
                      <td className="px-4 py-2 text-slate-300">{ALERT_KIND_LABEL[r.kind]}</td>
                      <td className="px-3 py-2">
                        {isPrice ? (
                          <select value={r.securityKey ?? ""} onChange={(e) => patch(r.id, { securityKey: e.target.value || undefined })}
                            className="max-w-[190px] rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none">
                            <option value="">— pick a holding —</option>
                            {securities.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                          </select>
                        ) : isIps ? (
                          <select value={r.bucket ?? ""} onChange={(e) => patch(r.id, { bucket: (e.target.value || undefined) as IpsBucketKey | undefined })}
                            className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none">
                            <option value="">— pick a bucket —</option>
                            {IPS_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                          </select>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            {r.kind === "concentration" ? "Largest single name" : "All scheduled theses"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input inputMode="decimal" value={r.threshold ?? ""} placeholder="—"
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(/[,\s%₹]/g, ""));
                            patch(r.id, { threshold: e.target.value === "" || !Number.isFinite(n) ? null : n });
                          }}
                          className="w-20 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-right mono text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
                        <span className="ml-1 text-[10px] text-slate-600">{isPrice ? "₹" : r.kind === "review-overdue" ? "" : "%"}</span>
                      </td>
                      <td className="px-3 py-2">
                        <input value={r.note} placeholder="why this matters"
                          onChange={(e) => patch(r.id, { note: e.target.value })}
                          className="w-44 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none" />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={r.enabled} onChange={(e) => patch(r.id, { enabled: e.target.checked })} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => remove(r.id)} className="text-slate-600 hover:text-loss" title="Delete rule">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          A rule with no threshold is an <span className="font-medium text-slate-400">unfinished rule, not a passing one</span>, and
          is reported as such rather than counted among the clear. IPS rules need at least one asset class mapped to the
          bucket on <span className="font-medium text-slate-400">Exposure &amp; IPS</span>; price rules need a live quote,
          because a month-old statement mark cannot answer whether a level was crossed today.
        </p>
      </Card>

      {/* What still needs a source rather than a rule */}
      <Card className="mt-5" title="Alerts the spec asks for that need a source, not a threshold"
        subtitle="Named rather than shown as rules that silently never fire">
        <ul className="space-y-2 text-[11.5px] leading-relaxed text-slate-500">
          <li><span className="font-medium text-slate-400">Manager alerts — FM resigned, style drift, AUM exploded.</span> These need a manager-monitoring feed: fund-manager changes and AUM are published by each AMC and by SEBI, not by anything this book reads. A rule with no way to observe its subject would sit permanently silent and read as all-clear.</li>
          <li><span className="font-medium text-slate-400">Liquidity coverage falling below a threshold.</span> Needs the family's cash and near-term commitments outside the book; the statements carry holdings, not bank balances.</li>
          <li><span className="font-medium text-slate-400">Capital call due, board meeting pending.</span> The drawdown funds' capital accounts give committed and undrawn amounts but no call SCHEDULE — the date a call lands is in fund correspondence.</li>
        </ul>
      </Card>
    </div>
  );
}
