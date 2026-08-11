import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { TextField, SelectField, CheckField, RowList } from "@/components/FormBits";
import { usePortfolio } from "@/context/PortfolioContext";
import { readFamilyInputs, writeFamilyInputs, IPS_BUCKETS, type FamilyInputs, type IpsBucketKey } from "@/lib/familyInputs";
import {
  ASSET_KINDS, LIABILITY_KINDS, emptyAsset, emptyLiability, emptyOutflow,
  outflowsWithin, viewHousehold,
  type BalanceItem, type Household, type Outflow,
} from "@/lib/household";

// THE HOUSEHOLD BALANCE SHEET — the editor behind the Family Dashboard's four
// previously-absent tiles.
//
// Everything here is entered by the family, and everything derived from it says
// what it covers. See `src/lib/household.ts` for why these four figures were
// never a vendor problem.
//
// ONE THING THIS SCREEN IS CAREFUL ABOUT AND A SIMPLER ONE WOULD NOT BE: an
// amount of ZERO is accepted and stored. Every other family-input field in this
// codebase treats zero as not-set, because a target price of ₹0 is meaningless.
// A bank balance of ₹0 is not — it is the measurement that turns liquidity
// coverage from unknown into a hard zero, and a register that silently refused
// to record it would show `—` where the family had told it something urgent.

export function HouseholdSheet({ owners }: { owners: string[] }) {
  const { fmtFromBase } = usePortfolio();
  const [inputs, setInputs] = useState<FamilyInputs>(() => readFamilyInputs());
  const save = (next: FamilyInputs) => setInputs(writeFamilyInputs(next));
  const h = inputs.household;
  const patch = (p: Partial<Household>) => save({ ...inputs, household: { ...h, ...p } });

  const money = (n: number | null) => (n === null ? null : fmtFromBase(n, { compact: true }));

  /** Blank is NOT SET; a typed 0 is zero. See the note at the top of the file. */
  const num = (v: string): number | null => {
    const t = v.trim().replace(/[₹$,\s]/g, "");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const numStr = (n: number | null) => (n === null ? "" : String(n));

  const view = useMemo(() => viewHousehold(h, null), [h]);
  const nextYear = useMemo(() => outflowsWithin(h, new Date(), 12), [h]);

  const ownerOpts = [{ value: "", label: "Whole family" }, ...owners.map((o) => ({ value: o, label: o }))];
  const bucketOpts = IPS_BUCKETS.map((b) => ({ value: b.key, label: b.label }));

  const setAsset = (id: string, p: Partial<BalanceItem>) =>
    patch({ assets: h.assets.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const setLiab = (id: string, p: Partial<BalanceItem>) =>
    patch({ liabilities: h.liabilities.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const setOutflow = (id: string, p: Partial<Outflow>) =>
    patch({ outflows: h.outflows.map((o) => (o.id === id ? { ...o, ...p } : o)) });

  const nothing = !h.assets.length && !h.liabilities.length && !h.outflows.length;

  return (
    <div className="space-y-5">
      <Card title="What this register answers"
        subtitle="Net worth, cash available, liquidity coverage and the charity pool — four figures the statements cannot carry"
        right={<Pill tone={nothing ? "default" : "gain"}>{h.assets.length + h.liabilities.length} lines · {h.outflows.length} outflows</Pill>}>
        <p className="text-[12px] leading-relaxed text-slate-400">
          A PMS statement reports a mandate. It has never known about a flat in Worli, a fixed deposit, a loan against
          property or the school fees due next quarter — so the four tiles on the dashboard rendered{" "}
          <span className="text-slate-500">—</span> with that reason. They were never waiting on a data vendor. They
          were waiting on this.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Net worth is <span className="text-slate-400">derived</span>: portfolio value from the book, plus the assets
          below, less the liabilities. Nothing here is added to the book — <span className="mono">glowData.ts</span> is
          generated from <span className="mono">source/</span> and stays byte-identical to it. Everything is included in
          the family-inputs export on Exposure &amp; IPS, so a cleared browser is recoverable.
        </p>
      </Card>

      {/* The four derived figures, off-book only — the dashboard adds the
          portfolio to them, because it is the surface that knows the basis. */}
      <Card title="Off-book totals" subtitle="What the register itself adds up to, before the portfolio">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["Assets entered", view.assets, "no asset carries an amount yet"],
            ["Liabilities entered", view.liabilities, "no liability carries an amount yet"],
            ["Cash available", view.cash, "no asset is marked liquid — tick 'counts as cash' on a bank line"],
            ["Charity pool", view.charity, "no asset is ring-fenced for charity"],
          ] as const).map(([label, c, reason]) => (
            <div key={label} className="rounded-lg border border-ink-700/70 p-3">
              <div className="label-xs text-slate-400">{label}</div>
              <div className="mono mt-1.5 text-[16px] text-slate-100">
                {c.total === null ? <AbsentCell reason={reason} /> : money(c.total)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {c.total === null ? "nothing to total" : `over ${c.of} of ${c.rows} line${c.rows === 1 ? "" : "s"}`}
              </div>
            </div>
          ))}
        </div>
        {/* TANGIBLE / INTANGIBLE follows from the KIND, not from a judgement per
            row — a flat is tangible whoever owns it. Recording it on the kind
            means the split can never disagree with itself across two lines
            describing the same sort of asset. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink-700/70 pt-3 text-[12px]">
          <span className="text-slate-500">
            Tangible:{" "}
            {view.tangible.total === null
              ? <AbsentCell reason="no tangible asset entered — property and bullion are the tangible kinds" />
              : <span className="mono text-slate-300">{money(view.tangible.total)}</span>}
          </span>
          <span className="text-slate-500">
            Intangible:{" "}
            {view.intangible.total === null
              ? <AbsentCell reason="no intangible asset entered — bank balances, unlisted stakes, insurance and receivables are the intangible kinds" />
              : <span className="mono text-slate-300">{money(view.intangible.total)}</span>}
          </span>
          <span className="text-slate-600">the split follows from each line's kind, not a per-row judgement</span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Each total names how many lines it spans. A register with one bank balance entered gives a net worth over one
          line, and a figure that reads as complete when it is not is the failure this whole cockpit is built against.
          {view.assets.rows > view.assets.of && <> {view.assets.rows - view.assets.of} asset line{view.assets.rows - view.assets.of === 1 ? " carries" : "s carry"} no amount and {view.assets.rows - view.assets.of === 1 ? "is" : "are"} counted in neither.</>}
        </p>
      </Card>

      {nothing && (
        <AbsentSection
          what="The household register is empty"
          needs="Add a bank balance, a property, a loan and the outflows the family is committed to. Net worth, cash
            available, liquidity coverage and the charity pool then compute on the dashboard — and stay absent until
            each has what it needs, rather than falling back to the portfolio value or to zero." />
      )}

      <RowList
        title="Assets"
        note={<>Anything the family owns that no statement in this book reports. <span className="text-slate-400">Counts as cash</span> decides what liquidity coverage is measured from; <span className="text-slate-400">charity</span> ring-fences a line into the charity pool. A tangible / intangible split follows from the kind.</>}
        addLabel="Add asset"
        empty="No asset entered."
        onAdd={() => patch({ assets: [...h.assets, emptyAsset()] })}
        onRemove={(id) => patch({ assets: h.assets.filter((a) => a.id !== id) })}
        items={h.assets.map((a) => ({
          id: a.id,
          cells: [
            <TextField key="l" label="Label" mono={false} value={a.label} onChange={(v) => setAsset(a.id, { label: v })} placeholder="Worli flat, HDFC current a/c…" />,
            <SelectField key="k" label="Kind" value={a.kind} options={ASSET_KINDS.map((k) => ({ value: k.key, label: k.label }))}
              onChange={(v) => {
                // Re-default the liquid flag from the new kind, because the flag
                // is a property of what the thing IS more often than not. It
                // stays overridable on the next line.
                const kind = ASSET_KINDS.find((k) => k.key === v);
                setAsset(a.id, { kind: v, liquid: kind?.liquidByDefault ?? a.liquid });
              }} />,
            <TextField key="a" label="Amount (₹)" value={numStr(a.amount)} onChange={(v) => setAsset(a.id, { amount: num(v) })}
              placeholder="not recorded" hint="0 is accepted and recorded — an empty account is a measurement." />,
            <TextField key="d" label="As of" type="date" value={a.asOf} onChange={(v) => setAsset(a.id, { asOf: v })} />,
            <SelectField key="o" label="Whose" value={a.owner} options={ownerOpts.slice(1)} blank="Whole family"
              onChange={(v) => setAsset(a.id, { owner: v })}
              hint="An item attributed to nobody counts only in the whole-family scope — splitting it across members would invent a share." />,
            <SelectField key="b" label="IPS bucket" value={a.bucket ?? ""} options={bucketOpts} blank="not mapped"
              onChange={(v) => setAsset(a.id, { bucket: (v || null) as IpsBucketKey | null })} />,
            <CheckField key="c" label="Counts as cash" checked={a.liquid} onChange={(v) => setAsset(a.id, { liquid: v })}
              hint="Included in cash available, which is the numerator of liquidity coverage." />,
            <CheckField key="h" label="Charity pool" checked={a.charity} onChange={(v) => setAsset(a.id, { charity: v })} />,
          ],
        }))} />

      <RowList
        title="Liabilities"
        note="Subtracted from net worth. Enter the amount OUTSTANDING, not the facility limit — an undrawn facility is not a debt."
        addLabel="Add liability"
        empty="No liability entered."
        onAdd={() => patch({ liabilities: [...h.liabilities, emptyLiability()] })}
        onRemove={(id) => patch({ liabilities: h.liabilities.filter((a) => a.id !== id) })}
        items={h.liabilities.map((a) => ({
          id: a.id,
          cells: [
            <TextField key="l" label="Label" mono={false} value={a.label} onChange={(v) => setLiab(a.id, { label: v })} placeholder="Loan against property…" />,
            <SelectField key="k" label="Kind" value={a.kind} options={LIABILITY_KINDS.map((k) => ({ value: k.key, label: k.label }))}
              onChange={(v) => setLiab(a.id, { kind: v })} />,
            <TextField key="a" label="Outstanding (₹)" value={numStr(a.amount)} onChange={(v) => setLiab(a.id, { amount: num(v) })} placeholder="not recorded" />,
            <TextField key="d" label="As of" type="date" value={a.asOf} onChange={(v) => setLiab(a.id, { asOf: v })} />,
            <SelectField key="o" label="Whose" value={a.owner} options={ownerOpts.slice(1)} blank="Whole family"
              onChange={(v) => setLiab(a.id, { owner: v })} />,
          ],
        }))} />

      <RowList
        title="Committed outflows"
        note={<>What liquidity coverage is measured AGAINST. Coverage is cash divided by the average monthly outflow over the next twelve months — {nextYear.total === null
          ? <span className="text-slate-400">nothing is scheduled in that window yet</span>
          : <>currently {money(nextYear.total)} across {nextYear.of} payment{nextYear.of === 1 ? "" : "s"}</>}. A recurring item counts once per occurrence inside the window, not once in total.</>}
        addLabel="Add outflow"
        empty="No committed outflow entered — so liquidity coverage stays absent rather than reading as unlimited."
        onAdd={() => patch({ outflows: [...h.outflows, emptyOutflow()] })}
        onRemove={(id) => patch({ outflows: h.outflows.filter((o) => o.id !== id) })}
        items={h.outflows.map((o) => ({
          id: o.id,
          cells: [
            <TextField key="l" label="Label" mono={false} value={o.label} onChange={(v) => setOutflow(o.id, { label: v })} placeholder="School fees, advance tax, capital call…" />,
            <TextField key="d" label="Due on" type="date" value={o.dueOn} onChange={(v) => setOutflow(o.id, { dueOn: v })} />,
            <TextField key="a" label="Amount (₹)" value={numStr(o.amount)} onChange={(v) => setOutflow(o.id, { amount: num(v) })} placeholder="not recorded" />,
            <TextField key="r" label="Repeats every (months)" value={o.everyMonths === null ? "" : String(o.everyMonths)}
              onChange={(v) => {
                const n = Number(v.trim());
                setOutflow(o.id, { everyMonths: v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null });
              }} placeholder="one-off" />,
          ],
        }))} />
    </div>
  );
}
