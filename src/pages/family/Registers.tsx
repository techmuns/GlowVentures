import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell } from "@/components/Absent";
import { TextField, SelectField, RowList } from "@/components/FormBits";
import { readFamilyInputs, writeFamilyInputs, type FamilyInputs } from "@/lib/familyInputs";
import {
  ADVISOR_ROLES, DECISION_CATEGORIES, DECISION_STATES,
  emptyAdvisor, emptyDecision,
  type Advisor, type Decision, type DecisionState, type Household,
} from "@/lib/household";
import { fetchSeriesIndex, type SeriesEntry } from "@/lib/series";

// THE ADVISER REGISTER, THE DECISIONS QUEUE AND THE BENCHMARK CHOICE.
//
// All three are Layer 6 items the spec asks for and no source can answer.
//
// THE DECISIONS QUEUE IS THE ONE TO BE CAREFUL WITH. The Family Dashboard's
// version of it was a preview, and the previous build of that preview named two
// of this book's own managers and asserted a pending approval that did not
// exist — "Review FM change at Aristos", "Approve GLC Growth Fund top-up". An
// item on a decisions queue is a to-do: a reader who sees one either acts or
// worries, and no badge undoes either. So the queue starts EMPTY and only ever
// contains what somebody typed. Nothing generates an item.
//
// THE BENCHMARK IS A CHOICE AND STAYS UNSET UNTIL MADE. Defaulting to the Nifty
// would be the obvious move and the wrong one: this book is 62% private by
// value, and measuring it against a large-cap equity index is a misleading
// comparison rather than a neutral one. The family picks, or the tile stays
// absent with that reason.

export function Registers() {
  const [inputs, setInputs] = useState<FamilyInputs>(() => readFamilyInputs());
  const save = (next: FamilyInputs) => setInputs(writeFamilyInputs(next));
  const h = inputs.household;
  const patch = (p: Partial<Household>) => save({ ...inputs, household: { ...h, ...p } });

  // The harvested series, so the benchmark picker offers only what the store can
  // actually measure a return from. An id typed by hand would render absent.
  const [series, setSeries] = useState<SeriesEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSeriesIndex().then((i) => { if (alive) setSeries(i?.series ?? []); }).catch(() => { if (alive) setSeries([]); });
    return () => { alive = false; };
  }, []);

  // Indices first — a family benchmark is nearly always one — then the rest, so
  // the list is usable without hiding anything the store carries.
  const benchOpts = useMemo(() => {
    const all = (series ?? []).slice().sort((a, b) => {
      const ai = a.category === "indices" ? 0 : 1;
      const bi = b.category === "indices" ? 0 : 1;
      return ai - bi || a.label.localeCompare(b.label);
    });
    return all.map((s) => ({ value: s.id, label: `${s.label}${s.category === "indices" ? "" : ` · ${s.category}`}` }));
  }, [series]);

  const chosen = (series ?? []).find((s) => s.id === h.benchmarkSeriesId) ?? null;

  const setAdvisor = (id: string, p: Partial<Advisor>) =>
    patch({ advisors: h.advisors.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const setDecision = (id: string, p: Partial<Decision>) =>
    patch({ decisions: h.decisions.map((d) => (d.id === id ? { ...d, ...p } : d)) });

  const open = h.decisions.filter((d) => d.state === "Open" || d.state === "In progress");

  return (
    <div className="space-y-5">
      {/* ── Benchmark ─────────────────────────────────────────────────────── */}
      <Card title="Benchmark"
        subtitle="What the family measures its return against — the dashboard's benchmark tile reads this"
        right={<Pill tone={h.benchmarkSeriesId ? "gain" : "default"}>{h.benchmarkSeriesId ? "chosen" : "not chosen"}</Pill>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Benchmark series" value={h.benchmarkSeriesId} options={benchOpts}
            blank={series === null ? "loading the series store…" : "not chosen"}
            onChange={(v) => patch({ benchmarkSeriesId: v })}
            hint="Only series the harvest store actually carries are offered, so a chosen benchmark always has a measurable return." />
          <div className="self-end pb-1 text-[11.5px] text-slate-500">
            {chosen
              ? <>Returns come from the harvested store's own precomputed horizons, on {chosen.frequency} data
                  {chosen.last ? <> to {chosen.last}</> : null}.</>
              : <AbsentCell reason="no benchmark chosen — the dashboard's benchmark tile stays absent until one is" />}
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          <strong className="text-slate-400">Nothing is chosen by default, deliberately.</strong> The Nifty would be the
          obvious pick and the wrong one to make on the family's behalf: this book is majority private by value, and an
          equity index would flatter or damn it for reasons that have nothing to do with how it is run. A comparison
          nobody agreed to is a judgement the dashboard would be making.
        </p>
      </Card>

      {/* ── Advisers ──────────────────────────────────────────────────────── */}
      <Card title="Advisers &amp; service providers"
        subtitle="Who the family engages, on what mandate, at what cost, and when each engagement is next reviewed"
        right={<Pill tone={h.advisors.length ? "gain" : "default"}>{h.advisors.length} recorded</Pill>}>
        <RowList
          title="Register"
          note="Managers appear in the book because they issue statements; accountants, lawyers and trustees do not, and nothing in the archive knows what any of them is paid."
          addLabel="Add adviser"
          empty="No adviser recorded."
          onAdd={() => patch({ advisors: [...h.advisors, emptyAdvisor()] })}
          onRemove={(id) => patch({ advisors: h.advisors.filter((a) => a.id !== id) })}
          items={h.advisors.map((a) => ({
            id: a.id,
            cells: [
              <TextField key="n" label="Name" mono={false} value={a.name} onChange={(v) => setAdvisor(a.id, { name: v })} placeholder="Person" />,
              <TextField key="f" label="Firm" mono={false} value={a.firm} onChange={(v) => setAdvisor(a.id, { firm: v })} placeholder="Firm" />,
              <SelectField key="r" label="Role" value={a.role} options={ADVISOR_ROLES.map((r) => ({ value: r, label: r }))}
                blank="not recorded" onChange={(v) => setAdvisor(a.id, { role: v })} />,
              <TextField key="c" label="Contact" mono={false} value={a.contact} onChange={(v) => setAdvisor(a.id, { contact: v })} placeholder="email / phone" />,
              <TextField key="s" label="Engaged since" type="date" value={a.since} onChange={(v) => setAdvisor(a.id, { since: v })} />,
              <TextField key="v" label="Next review" type="date" value={a.reviewOn} onChange={(v) => setAdvisor(a.id, { reviewOn: v })} />,
              <TextField key="m" label="Mandate" mono={false} wide value={a.mandate} onChange={(v) => setAdvisor(a.id, { mandate: v })} placeholder="What they are engaged to do" />,
              <TextField key="e" label="Fees" mono={false} wide value={a.fees} onChange={(v) => setAdvisor(a.id, { fees: v })}
                placeholder="1% AUM + 10% over hurdle, ₹X per annum, hourly…"
                hint="Free text on purpose — a fee structure is rarely a single number, and forcing one would lose the terms that matter." />,
            ],
          }))} />
      </Card>

      {/* ── Decisions ─────────────────────────────────────────────────────── */}
      <Card title="Decisions required"
        subtitle="What the family owes an answer on. Nothing generates an item — every row is one somebody entered."
        right={<Pill tone={open.length ? "warn" : "default"}>{open.length} outstanding</Pill>}>
        {h.decisions.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="min-w-full whitespace-nowrap text-[12.5px]">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-3 py-2 text-left font-medium">Decision</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">Category</th>
                  <th className="label-xs px-3 py-2 text-left font-medium">With</th>
                  <th className="label-xs px-3 py-2 text-right font-medium">Raised</th>
                  <th className="label-xs px-3 py-2 text-right font-medium">Due</th>
                  <th className="label-xs px-3 py-2 text-right font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {h.decisions.map((d) => {
                  // Overdue is measured against the DUE DATE only. A decision with
                  // no due date is not overdue and not on time — it is undated, and
                  // colouring it either way would assert a deadline nobody set.
                  const overdue = !!d.dueOn && (d.state === "Open" || d.state === "In progress")
                    && Date.parse(`${d.dueOn}T00:00:00Z`) < Date.now();
                  return (
                    <tr key={d.id}>
                      <td className="px-3 py-2 text-slate-200">{d.title}</td>
                      <td className="px-3 py-2 text-slate-400">{d.category}</td>
                      <td className="px-3 py-2 text-slate-400">{d.owner || <AbsentCell reason="nobody is named against this decision" />}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{d.raisedOn || <AbsentCell reason="no date recorded" />}</td>
                      <td className={`px-3 py-2 text-right ${overdue ? "text-rose-400" : "text-slate-400"}`}>
                        {d.dueOn || <AbsentCell reason="no due date set, so this is neither overdue nor on time" />}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Pill tone={d.state === "Decided" ? "gain" : d.state === "Dropped" ? "default" : overdue ? "warn" : "info"}>{d.state}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <RowList
          title="Queue"
          note="An empty queue means nothing has been entered — it is not a statement that the family has no decisions outstanding."
          addLabel="Add decision"
          empty="No decision recorded."
          onAdd={() => patch({ decisions: [...h.decisions, emptyDecision()] })}
          onRemove={(id) => patch({ decisions: h.decisions.filter((d) => d.id !== id) })}
          items={h.decisions.map((d) => ({
            id: d.id,
            cells: [
              <TextField key="t" label="Decision" mono={false} wide value={d.title} onChange={(v) => setDecision(d.id, { title: v })} placeholder="What has to be decided" />,
              <SelectField key="c" label="Category" value={d.category} options={DECISION_CATEGORIES.map((c) => ({ value: c, label: c }))}
                onChange={(v) => setDecision(d.id, { category: v })} />,
              <TextField key="o" label="With" mono={false} value={d.owner} onChange={(v) => setDecision(d.id, { owner: v })} placeholder="Who decides" />,
              <TextField key="r" label="Raised on" type="date" value={d.raisedOn} onChange={(v) => setDecision(d.id, { raisedOn: v })} />,
              <TextField key="u" label="Due on" type="date" value={d.dueOn} onChange={(v) => setDecision(d.id, { dueOn: v })} />,
              <SelectField key="s" label="State" value={d.state} options={DECISION_STATES.map((s) => ({ value: s, label: s }))}
                onChange={(v) => setDecision(d.id, { state: v as DecisionState })} />,
              <TextField key="n" label="Note" mono={false} wide value={d.note} onChange={(v) => setDecision(d.id, { note: v })} placeholder="Context, options, what it turns on" />,
            ],
          }))} />
      </Card>
    </div>
  );
}
