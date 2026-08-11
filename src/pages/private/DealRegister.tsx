import { useMemo, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, PiggyBank, Banknote, Hourglass, Layers } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { StatTile } from "@/components/StatTile";
import { AbsentCell, AbsentSection, absentTile } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { TextField, SelectField, RowList } from "@/components/FormBits";
import { readFamilyInputs, writeFamilyInputs, type FamilyInputs } from "@/lib/familyInputs";
import {
  DEAL_SEGMENTS, DOC_KINDS, deriveDeal, emptyDeal, summarise, newId,
  type DealDoc, type DealRound, type DealSegment, type DealTranche, type PrivateDeal,
} from "@/lib/deals";

// THE PRIVATE DEAL REGISTER — the FOOS spec's private-investment tracker, wired.
//
// This screen replaced a preview, and the preview was not wrong to exist: the
// spec asks for sixteen columns about companies no statement in `source/` names,
// so there was nothing to render but a shape. What changed is the direction the
// data comes from. A cap table is not a feed the family is waiting on; it is
// paperwork they already hold, and the only thing missing was somewhere to put
// it. `src/lib/deals.ts` is that place.
//
// WHAT THIS SCREEN WILL NOT DO, and it is the whole reason it can be trusted:
//
//   IT DERIVES RATHER THAN ACCEPTS. Amount invested is the sum of the tranches
//   the family entered. Pending to invest is committed less that sum. Stake
//   value after a raise is the post-raise stake times that round's post-money.
//   None of the three can be typed, so none of them can disagree with its own
//   inputs — the same rule the ingest applies to a statement's printed totals.
//
//   AN UNENTERED FIGURE IS ABSENT, AND ABSENT IS NOT ZERO. A deal with no
//   tranches shows `—` for invested, not ₹0, and therefore shows `—` for pending
//   rather than reporting the entire commitment as outstanding. "We have not
//   entered the drawdowns" and "nothing has been drawn" are different facts and
//   only one of them is a call for cash.
//
//   THE TOTALS SAY WHAT THEY COVER. Four deals with a committed figure among
//   nine rows is a total over four, and the caption says four. A footer that
//   sums what it has and presents it as the register's total is the "missing
//   value blended in as zero" failure with a bigger denominator.

const btn = "inline-flex items-center gap-1.5 rounded-md border border-ink-600/70 px-2.5 py-1 text-[11.5px] text-slate-400 transition-colors hover:text-slate-200";

export function DealRegister() {
  const { fmtFromBase } = usePortfolio();
  const [inputs, setInputs] = useState<FamilyInputs>(() => readFamilyInputs());
  const [open, setOpen] = useState<string | null>(null);
  const save = (next: FamilyInputs) => setInputs(writeFamilyInputs(next));

  const deals = inputs.deals;
  const totals = useMemo(() => summarise(deals), [deals]);
  const money = (n: number | null) => (n === null ? null : fmtFromBase(n, { compact: true }));

  const patch = (id: string, p: Partial<PrivateDeal>) =>
    save({ ...inputs, deals: deals.map((d) => (d.id === id ? { ...d, ...p, updatedAt: new Date().toISOString() } : d)) });

  const add = () => {
    const d = { ...emptyDeal(), company: "New deal" };
    save({ ...inputs, deals: [...deals, d] });
    setOpen(d.id);
  };

  const remove = (id: string) => save({ ...inputs, deals: deals.filter((d) => d.id !== id) });

  /** Parse an amount typed into a register field. Blank is not zero. */
  const num = (v: string): number | null => {
    const t = v.trim().replace(/[₹$,\s]/g, "");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  /** A stake percent. Zero is accepted — a fully diluted holding is a fact. */
  const pctOf = (v: string): number | null => {
    const t = v.trim().replace(/[%\s,]/g, "");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  const numStr = (n: number | null) => (n === null ? "" : String(n));

  const header = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Pill tone={deals.length ? "gain" : "default"}>{deals.length} deal{deals.length === 1 ? "" : "s"} recorded</Pill>
      <button type="button" onClick={add} className={btn}><Plus className="h-3.5 w-3.5" />Add a deal</button>
      <span className="text-[11px] text-slate-500">
        Saved in this browser and included in the family-inputs export on Exposure &amp; IPS.
      </span>
    </div>
  );

  if (!deals.length) {
    return (
      <div className="mt-8">
        <div className="mb-2 text-[13px] font-medium text-slate-200">Private deal register</div>
        {header}
        <AbsentSection
          what="No direct private deals recorded"
          needs="This register is the family's own paperwork — a term sheet, a cap table, a drawdown notice. No statement
            issuer holds any of it, so nothing can be ingested into it. Add a deal above and every column below fills
            from what is entered, with amount invested, pending to invest and stake value derived rather than typed." />
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="mb-2 text-[13px] font-medium text-slate-200">Private deal register</div>
      {header}

      {/* Lifecycle totals. Each states its coverage, because a total over 4 of 9
          rows is a different claim from a total over 9. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Committed" icon={<PiggyBank className="h-4 w-4" />}
          {...(totals.committed.total === null
            ? absentTile("no deal carries a committed amount yet", "enter one on a deal below")
            : { value: money(totals.committed.total), sub: `across ${totals.committed.of} of ${totals.count} deals` })} />
        <StatTile label="Invested" icon={<Banknote className="h-4 w-4" />}
          {...(totals.invested.total === null
            ? absentTile("no drawdown tranches recorded", "amount invested is the sum of a deal's tranches, never typed")
            : { value: money(totals.invested.total), sub: `tranches on ${totals.invested.of} of ${totals.count} deals` })} />
        <StatTile label="Pending to invest" icon={<Hourglass className="h-4 w-4" />}
          {...(totals.pending.total === null
            ? absentTile("needs both a commitment and its drawdowns", "a deal missing either shows no gap rather than its whole commitment")
            : { value: money(totals.pending.total), sub: `measurable on ${totals.pending.of} of ${totals.count} deals` })} />
        <StatTile label="Stake value (post raise)" icon={<Layers className="h-4 w-4" />}
          {...(totals.stakeValue.total === null
            ? absentTile("needs a post-raise stake and that round's valuation", "both sides, or the value is not measurable")
            : { value: money(totals.stakeValue.total), sub: `valued on ${totals.stakeValue.of} of ${totals.count} deals` })} />
      </div>

      <Card className="mt-5" pad={false}
        title="Deals"
        subtitle="One row per company. Amount invested, pending, document count, subsequent rounds and stake value are derived from what is entered below them.">
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-[12.5px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-3 py-2 text-left font-medium">Company</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Segment</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Committed</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Committed on</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Invested</th>
                <th className="label-xs px-3 py-2 text-right font-medium">First drawdown</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Pending</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Docs</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Valuation (last round)</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Stake (FD) at entry</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Cap table @ entry</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Subsequent rounds</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Stake value</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Stake % post raise</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Financials</th>
                <th className="label-xs px-3 py-2 text-right font-medium">MIS received</th>
                <th className="label-xs px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {deals.map((d) => {
                const x = deriveDeal(d);
                const isOpen = open === d.id;
                return [
                  <tr key={d.id} className="hover:bg-ink-700/30">
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => setOpen(isOpen ? null : d.id)}
                        className="inline-flex items-center gap-1.5 font-medium text-slate-100 hover:text-champagne-400">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        {d.company}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {d.segment ?? <AbsentCell reason="no segment recorded for this deal" />}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-slate-200">
                      {d.committed === null ? <AbsentCell reason="no committed amount recorded" /> : money(d.committed)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">
                      {d.committedOn || <AbsentCell reason="no commitment date recorded" />}
                    </td>
                    {/* DERIVED — the sum of this deal's tranches, never typed. */}
                    <td className="px-3 py-2.5 text-right mono text-slate-200"
                      title={x.invested === null ? undefined : `sum of ${d.tranches.length} tranche${d.tranches.length === 1 ? "" : "s"}`}>
                      {x.invested === null ? <AbsentCell reason="no drawdown tranches recorded — open the row to add them" /> : money(x.invested)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">
                      {x.firstInvestedOn || <AbsentCell reason="no tranche carries a date" />}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-slate-300">
                      {x.pending === null
                        ? <AbsentCell reason={d.committed === null
                            ? "no commitment recorded, so there is no gap to measure"
                            : "no drawdowns recorded — the whole commitment is not automatically outstanding"} />
                        : money(x.pending)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {x.docCount ? <Pill tone="info">{x.docCount}</Pill> : <AbsentCell reason="no documents registered against this deal" />}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-slate-300">
                      {d.lastRoundValuation === null ? <AbsentCell reason="no last-round valuation recorded" /> : money(d.lastRoundValuation)}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-slate-300">
                      {d.stakeFdPct === null ? <AbsentCell reason="no fully-diluted stake at entry recorded" /> : `${d.stakeFdPct.toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {d.capTableAtEntry || <AbsentCell reason="no entry cap-table stage recorded" />}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {x.hasSubsequentRounds
                        ? <Pill tone="info">{d.rounds.length}</Pill>
                        : <span className="text-slate-500" title="No round recorded. That is not the same as none having happened — nothing here asserts one way or the other.">none recorded</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-slate-200"
                      title={x.stakeValuePostRaise === null ? undefined : `${d.stakePctPostRaise!.toFixed(2)}% of ${money(d.lastRoundValuation)}`}>
                      {x.stakeValuePostRaise === null
                        ? <AbsentCell reason="needs both a post-raise stake and that round's valuation" />
                        : money(x.stakeValuePostRaise)}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-slate-300">
                      {d.stakePctPostRaise === null ? <AbsentCell reason="no post-raise stake recorded" /> : `${d.stakePctPostRaise.toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {d.financials || <AbsentCell reason="no financials recorded for this deal" />}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">
                      {x.latestMis?.dated || d.misReceivedOn || <AbsentCell reason="no MIS pack registered" />}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" onClick={() => remove(d.id)} title="Remove this deal"
                        className="text-slate-600 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>,
                  isOpen && (
                    <tr key={`${d.id}-edit`}>
                      <td colSpan={17} className="bg-ink-900/40 px-3 py-4">
                        <DealEditor
                          deal={d}
                          onPatch={(p) => patch(d.id, p)}
                          num={num} pctOf={pctOf} numStr={numStr}
                          money={money}
                        />
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-ink-700/70 px-3 py-3 text-[11px] leading-relaxed text-slate-500">
          <strong className="text-slate-400">Derived, not typed:</strong> amount invested is the sum of a deal's
          tranches, pending is its commitment less that sum, and stake value is the post-raise stake applied to that
          round's post-money valuation. A deal missing either half of one of those shows{" "}
          <span className="text-slate-400">—</span> rather than a figure standing in for it.{" "}
          <strong className="text-slate-400">Documents are registered, not stored:</strong> what is kept here is that a
          document exists, what it is and where it lives — the files themselves belong in the family's own store, not
          in a browser.
        </p>
      </Card>
    </div>
  );
}

// ── The per-deal editor ─────────────────────────────────────────────────────

function DealEditor({ deal, onPatch, num, pctOf, numStr, money }: {
  deal: PrivateDeal;
  onPatch: (p: Partial<PrivateDeal>) => void;
  num: (v: string) => number | null;
  pctOf: (v: string) => number | null;
  numStr: (n: number | null) => string;
  money: (n: number | null) => string | null;
}) {
  const x = deriveDeal(deal);

  const setTranche = (id: string, p: Partial<DealTranche>) =>
    onPatch({ tranches: deal.tranches.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  const setRound = (id: string, p: Partial<DealRound>) =>
    onPatch({ rounds: deal.rounds.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const setDoc = (id: string, p: Partial<DealDoc>) =>
    onPatch({ docs: deal.docs.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label="Company" value={deal.company} onChange={(v) => onPatch({ company: v })} placeholder="Legal name" />
        <SelectField label="Segment" value={deal.segment ?? ""} blank="not recorded"
          options={DEAL_SEGMENTS.map((s) => ({ value: s, label: s }))}
          onChange={(v) => onPatch({ segment: (v || null) as DealSegment | null })} />
        <TextField label="Committed (₹)" value={numStr(deal.committed)} onChange={(v) => onPatch({ committed: num(v) })} placeholder="not recorded" />
        <TextField label="Committed on" type="date" value={deal.committedOn} onChange={(v) => onPatch({ committedOn: v })} />
        <TextField label="Stake at entry (FD %)" value={numStr(deal.stakeFdPct)} onChange={(v) => onPatch({ stakeFdPct: pctOf(v) })} placeholder="not recorded" />
        <TextField label="Cap table @ entry" value={deal.capTableAtEntry} onChange={(v) => onPatch({ capTableAtEntry: v })} placeholder="Seed, Series A…" />
        <TextField label="Last round valuation (₹, post-money)" value={numStr(deal.lastRoundValuation)} onChange={(v) => onPatch({ lastRoundValuation: num(v) })} placeholder="not recorded" wide />
        <TextField label="Last round on" type="date" value={deal.lastRoundOn} onChange={(v) => onPatch({ lastRoundOn: v })} />
        <TextField label="Stake post raise (FD %)" value={numStr(deal.stakePctPostRaise)} onChange={(v) => onPatch({ stakePctPostRaise: pctOf(v) })}
          placeholder="not recorded" hint="Dilution is a cap-table fact. 0 is accepted — a stake diluted to nothing is a measurement." />
        <TextField label="Financials" value={deal.financials} onChange={(v) => onPatch({ financials: v })} placeholder="FY25 audited, H1 FY26 management…" />
        <TextField label="Financials as of" type="date" value={deal.financialsAsOf} onChange={(v) => onPatch({ financialsAsOf: v })} />
        <TextField label="MIS received on" type="date" value={deal.misReceivedOn} onChange={(v) => onPatch({ misReceivedOn: v })} />
      </div>

      {/* TRANCHES — the spec's "click → investment by tranches & dates". This is
          the primitive: the amount-invested column above is their sum. */}
      <RowList
        title="Drawdowns (tranches)"
        note={x.invested === null
          ? "Amount invested stays absent until a tranche carries an amount — it is never assumed to be the commitment."
          : `Amount invested = ${money(x.invested)}, the sum of these ${deal.tranches.length} tranche${deal.tranches.length === 1 ? "" : "s"}. It is not typed anywhere.`}
        onAdd={() => onPatch({ tranches: [...deal.tranches, { id: newId("t"), date: "", amount: null, note: "" }] })}
        onRemove={(id) => onPatch({ tranches: deal.tranches.filter((t) => t.id !== id) })}
        items={deal.tranches.map((t) => ({
          id: t.id,
          cells: [
            <TextField key="d" label="Date" type="date" value={t.date} onChange={(v) => setTranche(t.id, { date: v })} />,
            <TextField key="a" label="Amount (₹)" value={numStr(t.amount)} onChange={(v) => setTranche(t.id, { amount: num(v) })} placeholder="not recorded" />,
            <TextField key="n" label="Note" value={t.note} onChange={(v) => setTranche(t.id, { note: v })} placeholder="tranche 1 of 3, milestone…" wide />,
          ],
        }))}
        empty="No drawdown recorded." addLabel="Add tranche" />

      {/* SUBSEQUENT ROUNDS — the spec's per-round valuation, investors, amount
          invested, cap table and primary/secondary. */}
      <RowList
        title="Subsequent rounds"
        note="An empty list records nothing — it does not assert that no round has happened."
        onAdd={() => onPatch({ rounds: [...deal.rounds, { id: newId("r"), name: "", date: "", valuation: null, investors: "", amountInvested: null, kind: "", capTable: "" }] })}
        onRemove={(id) => onPatch({ rounds: deal.rounds.filter((r) => r.id !== id) })}
        items={deal.rounds.map((r) => ({
          id: r.id,
          cells: [
            <TextField key="n" label="Round" value={r.name} onChange={(v) => setRound(r.id, { name: v })} placeholder="Series B" />,
            <TextField key="d" label="Date" type="date" value={r.date} onChange={(v) => setRound(r.id, { date: v })} />,
            <TextField key="v" label="Post-money (₹)" value={numStr(r.valuation)} onChange={(v) => setRound(r.id, { valuation: num(v) })} placeholder="not recorded" />,
            <TextField key="a" label="We invested (₹)" value={numStr(r.amountInvested)} onChange={(v) => setRound(r.id, { amountInvested: num(v) })} placeholder="did not participate / not recorded" />,
            <SelectField key="k" label="Primary / secondary" value={r.kind} blank="not recorded"
              options={[{ value: "primary", label: "Primary" }, { value: "secondary", label: "Secondary" }]}
              onChange={(v) => setRound(r.id, { kind: v as DealRound["kind"] })} />,
            <TextField key="i" label="Investors" value={r.investors} onChange={(v) => setRound(r.id, { investors: v })} placeholder="who led, who followed" wide />,
            <TextField key="c" label="Cap table at this round" value={r.capTable} onChange={(v) => setRound(r.id, { capTable: v })} placeholder="founders %, ESOP %, investors %" wide />,
          ],
        }))}
        empty="No subsequent round recorded." addLabel="Add round" />

      {/* DOCUMENTS — registered, not stored. */}
      <RowList
        title="Documents & MIS"
        note="Records that a document exists and where it lives. The files themselves stay in the family's own store — a browser is the wrong home for signed agreements."
        onAdd={() => onPatch({ docs: [...deal.docs, { id: newId("d"), title: "", kind: "Other", dated: "", location: "" }] })}
        onRemove={(id) => onPatch({ docs: deal.docs.filter((c) => c.id !== id) })}
        items={deal.docs.map((c) => ({
          id: c.id,
          cells: [
            <TextField key="t" label="Title" value={c.title} onChange={(v) => setDoc(c.id, { title: v })} placeholder="SHA, Q1 MIS…" />,
            <SelectField key="k" label="Kind" value={c.kind}
              options={DOC_KINDS.map((k) => ({ value: k, label: k }))}
              onChange={(v) => setDoc(c.id, { kind: v as DealDoc["kind"] })} />,
            <TextField key="d" label="Dated" type="date" value={c.dated} onChange={(v) => setDoc(c.id, { dated: v })} />,
            <TextField key="l" label="Where it lives" value={c.location} onChange={(v) => setDoc(c.id, { location: v })} placeholder="Drive folder, cabinet, email thread…" wide />,
          ],
        }))}
        empty="No document registered." addLabel="Add document" />

      <label className="block">
        <span className="label-xs text-slate-400">Notes</span>
        <textarea rows={2} value={deal.note} onChange={(e) => onPatch({ note: e.target.value })}
          placeholder="Why we backed it, who introduced it, what we are watching…"
          className="mt-1 w-full rounded-md border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
      </label>
    </div>
  );
}

