// THE MOPWM REVIEW TAB ON PRIVATE MARKET — the family's consolidated review's
// private-market lines, as the review prints them (Stage 10dg).
//
// *"The client has given us instruction to show the private market data in the
// dashboard using the data provided in the motilal excel sheet."* Every figure in
// this table is the REVIEW'S, at its own date, and most are at COST. It reads
// `src/data/reviewPrivate.ts` and nothing else, so no figure here can reach a book
// total, and no book figure can be mistaken for one of these.
//
// One table, the Stage 10bx standard: a band per block of the review, a row per
// line, the dated-row arithmetic re-derived beside the review's own, and the
// review's own inconsistencies listed in a closed band of their own.

import { Fragment, useMemo, type ReactNode } from "react";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows, type Accessor } from "@/lib/tableView";
import { AbsentCell } from "@/components/Absent";
import { TREE_ROW, useExpanded, rowToggle, TreeNameCell, TreeSectionCell, ExpandAllButton } from "@/components/TreeTable";
import { fmtPct, fmtNum, fmtDate, changeColor } from "@/lib/format";
import { REVIEW_PRIVATE } from "@/data/reviewPrivate";
import {
  reviewTotals, memberTotal, allReviewRows, statementOwners,
  type ReviewRow, type ReviewSection, type ReviewSectionKey,
} from "@/lib/reviewPrivate";

const COLS = ["name", "invested", "paidIn", "paidBack", "value", "gain", "ret", "xirr", "basis", "stmts"] as const;
const DAY = 864e5;
/** A rate over less than a year is never compounded onto one (Stage 10g(ii)). */
const YEAR_DAYS = 365;

type Kind = "valued" | "at-cost" | "now-listed" | "written-off";
const kindOf = (r: ReviewRow): Kind =>
  /written off/i.test(r.remark ?? "") ? "written-off" : r.equityTab ? "now-listed" : r.atCost ? "at-cost" : "valued";

const BASIS_WORD: Record<Kind, string> = { valued: "review mark", "at-cost": "at cost", "now-listed": "now listed", "written-off": "written off" };

/** Why a line has no return, worded by what the line is. */
const NO_RETURN: Record<Kind, string> = {
  valued: "the review carries no dated row and no cost for this line",
  "at-cost": "held at cost on the review — no gain is measured",
  "now-listed": "now listed — the review carries it on its Equity tab, and this tab does not",
  "written-off": "written off on the review",
};

const SUB: Record<ReviewSectionKey, string> = {
  "pe-funds": "Alternate tab · valued by the review",
  unlisted: "Equity tab · valued by the review",
  "pre-ipo": "Private Investments · at cost",
  "at-cost": "Private Investments · at cost",
  "now-listed": "Private Investments · ₹0 there, on the Equity tab",
  "written-off": "Private Investments · ₹0",
  credit: "Debt tab",
};

const ACCESSORS: Record<string, Accessor<ReviewRow>> = {
  name: (r) => r.name,
  invested: (r) => r.invested,
  paidIn: (r) => r.paidIn,
  paidBack: (r) => r.paidBack,
  value: (r) => r.value,
  gain: (r) => r.gain,
  ret: (r) => r.ret,
  xirr: (r) => r.xirr ?? r.reviewXirr,
  basis: (r) => BASIS_WORD[kindOf(r)],
  stmts: (r) => r.statements.length,
};

const daysOf = (r: ReviewRow) => (r.since && r.until ? Math.round((Date.parse(r.until) - Date.parse(r.since)) / DAY) : null);
const pct = (x: number | null) => (x === null ? "—" : fmtPct(x * 100, { sign: true }));
const unitsText = (n: number | null) => (n === null ? "no units" : `${fmtNum(n, Number.isInteger(n) ? 0 : 3)} units`);

export function ReviewPrivateTable({ money, moneyFull }: {
  money: (n: number | null | undefined, sign?: boolean) => string;
  moneyFull: (n: number | null | undefined, sign?: boolean) => string;
}) {
  const d = REVIEW_PRIVATE;
  const view = useTableView("pm-review", COLS);
  const lineSections = d.sections;
  const bands = useExpanded(lineSections.map((s) => s.key));
  const all = useMemo(() => allReviewRows(d), [d]);
  const foot = useMemo(() => reviewTotals(all), [all]);
  const refusedFor = (r: ReviewRow) => d.refused.find((x) => x.line === r.name) ?? null;
  const memberSum = d.members.reduce((s, m) => s + (memberTotal(m) ?? 0), 0);
  const allKeys = [...lineSections.map((s) => s.key), "members", "checks"];
  const allOpen = allKeys.every((k) => bands.isOpen(k));
  const asOf = fmtDate(d.asOf);

  const cell = (n: number | null, opts: { sign?: boolean; colour?: boolean; why?: string; data?: string } = {}) =>
    n === null
      ? <td className="px-4 py-2 text-right"><AbsentCell reason={opts.why} /></td>
      : <td className={`mono px-4 py-2 text-right ${opts.colour ? changeColor(n) : ""}`} title={moneyFull(n, opts.sign)}>{money(n, opts.sign)}</td>;

  const rateCell = (mine: number | null, printed: number | null, tol: number, label: "return" | "XIRR") =>
    mine !== null && printed !== null && Math.abs(mine - printed) > tol
      ? <span className="ml-1 text-amber-400" data-review-mismatch={label} title={`The review prints ${pct(printed)} — see the band at the foot of the table.`}>≠</span>
      : null;

  const statementsCell = (r: ReviewRow) => {
    const refused = refusedFor(r);
    if (!r.statements.length) {
      const why = [
        "No statement in this drop carries this line — the review's figure is the only one this dashboard has for it.",
        refused ? `Not joined to ${refused.why.split(":")[0]}: ${refused.why}.` : null,
      ].filter(Boolean).join(" ");
      return <td className="px-4 py-2 text-slate-500" title={why} data-review-stmts="0">on no statement</td>;
    }
    const lines = r.statements.map((s) => `${s.owner} — ${s.provider} ${s.accountNo}: ${unitsText(s.units)}${s.valued ? ", valued" : ", a quantity only"}`);
    const hint = [...lines, r.why ? `Joined on: ${r.why}.` : null].filter(Boolean).join("\n");
    return (
      <td className="px-4 py-2 text-slate-300" title={hint} data-review-stmts={r.statements.length}>
        {statementOwners(r).join(" · ")} <span className="text-slate-500">({r.statements.length})</span>
      </td>
    );
  };

  const lineRow = (r: ReviewRow, i: number, n: number) => {
    const k = kindOf(r);
    const days = daysOf(r);
    const subBits = [`${r.tab} row ${r.row}`, r.dates?.text].filter(Boolean).join(" · ");
    const hint = [
      `The review's ${r.tab} tab, row ${r.row}, as on ${asOf}.`,
      r.dates?.precision === "month" ? `Invested ${r.dates.text}: the review prints "${r.dates.printed}".` : r.dates ? `Invested ${r.dates.text}.` : null,
      r.valuedAsOf ? `The review: "${r.valuedAsOf}".` : null,
      r.remark ? `Remark: ${r.remark}.` : null,
      r.benchmark ? `Benchmark: ${r.benchmark}.` : null,
    ].filter(Boolean).join(" ");
    const investedWhy = k === "written-off" ? "written off on the review — no cost is carried"
      : k === "now-listed" && r.equityTab ? `₹0 on Private Investments — the review carries it on its Equity tab: ${unitsText(r.equityTab.units)}, cost ${moneyFull(r.equityTab.cost)}, value ${moneyFull(r.equityTab.value)}`
      : "the review prints no cost for this line";
    const valueWhy = k === "now-listed" && r.equityTab ? `on the review's Equity tab, row ${r.equityTab.row}: ${moneyFull(r.equityTab.value)}` : "the review prints no value for this line";
    const flowWhy = k === "valued" ? "Transactions since inception carries no dated row for this line" : NO_RETURN[k];
    let xirr: ReactNode;
    if (r.xirr !== null && days !== null && days < YEAR_DAYS) {
      xirr = <AbsentCell reason={`${days} days from the first payment to the valuation — a rate is not compounded onto a year. The review prints ${r.reviewXirr === null ? "no XIRR" : pct(r.reviewXirr)}.`} />;
    } else if (r.xirr !== null) {
      xirr = <span className={changeColor(r.xirr)}>{pct(r.xirr)}{rateCell(r.xirr, r.reviewXirr, 0.0005, "XIRR")}</span>;
    } else if (r.reviewXirr !== null && k === "valued") {
      xirr = (
        <span className="text-slate-300" data-review-printed-xirr=""
          title="The review's own figure: Transactions since inception carries no dated row for this line, so it cannot be re-derived here.">
          {pct(r.reviewXirr)} <span className="text-[10px] uppercase tracking-wide text-slate-500">review</span>
        </span>
      );
    } else {
      xirr = <AbsentCell reason={NO_RETURN[k]} />;
    }
    return (
      <Tr key={r.key} view={view} className={TREE_ROW.child} data-review-row={r.key} data-review-kind={k}
        data-review-tab={r.tab} data-review-xlrow={r.row} data-review-dates={r.dates?.text ?? ""} data-review-basis={r.retBasis ?? undefined}
        data-review-invested={r.invested ?? undefined} data-review-value={r.value ?? undefined}
        data-review-paidin={r.paidIn ?? undefined} data-review-paidback={r.paidBack ?? undefined}
        data-review-gain={r.gain ?? undefined} data-review-ret={r.ret ?? undefined} data-review-ret-printed={r.reviewRet ?? undefined}
        data-review-xirr={r.xirr ?? undefined} data-review-days={days ?? undefined}>
        <TreeNameCell depth={1} last={i === n - 1} title={r.name} sub={subBits} hint={hint} />
        {cell(r.invested, { why: investedWhy })}
        {cell(r.paidIn, { why: flowWhy })}
        {cell(r.paidBack, { why: flowWhy })}
        {k === "written-off"
          ? <td className="mono px-4 py-2 text-right text-slate-300" title="Written off on the review: a measured ₹0, not a missing figure.">{money(0)}</td>
          : cell(r.value, { why: valueWhy })}
        {cell(r.gain, { sign: true, colour: true, why: r.retBasis === null ? NO_RETURN[k] : undefined })}
        <td className="mono px-4 py-2 text-right">
          {r.ret === null ? <AbsentCell reason={NO_RETURN[k]} /> : (
            <span className={changeColor(r.ret)}
              title={r.retBasis === "cost" ? "Value against the review's own cost: Transactions since inception carries no dated row for this line." : "Value plus what was paid back, against what was paid in, on the line's own dated rows. Not annualised."}>
              {pct(r.ret)}{rateCell(r.ret, r.reviewRet, 0.0001, "return")}
            </span>
          )}
        </td>
        <td className="mono px-4 py-2 text-right">{xirr}</td>
        <td className="px-4 py-2 text-slate-400" title={r.valuedAsOf ?? undefined}>{BASIS_WORD[k]}</td>
        {statementsCell(r)}
      </Tr>
    );
  };

  const band = (s: ReviewSection) => {
    const t = reviewTotals(s.rows);
    const open = bands.isOpen(s.key);
    const ties = s.head ? Math.abs((t.invested ?? 0) - s.head.invested) <= 1 && Math.abs((t.value ?? 0) - s.head.value) <= 1 : null;
    const hint = [
      s.head ? `The review's own head, ${s.tab} row ${s.head.row}: cost ${moneyFull(s.head.invested)}, value ${moneyFull(s.head.value)}${ties ? " — the lines below add to it." : " — the lines below do not add to it."}` : `The lines below, from the review's ${s.tab} tab.`,
      s.key === "credit" ? "The review files this line under Debt, and its private-market summary leaves it out." : null,
    ].filter(Boolean).join(" ");
    const rows = sortRows(s.rows, view.sort, ACCESSORS);
    return (
      <Fragment key={s.key}>
        <Tr view={view} className={`${TREE_ROW.section} cursor-pointer`} {...rowToggle(() => bands.toggle(s.key))}
          data-review-section={s.key} data-review-lines={s.rows.length} data-review-open={open ? "true" : "false"}
          data-review-invested={t.invested ?? undefined} data-review-value={t.value ?? undefined}
          data-review-head-invested={s.head?.invested ?? undefined} data-review-head-value={s.head?.value ?? undefined}>
          <TreeSectionCell title={s.title} marker={<span data-review-marker={s.key}>{s.rows.length}</span>} sub={SUB[s.key]} hint={hint}
            open={open} onToggle={() => bands.toggle(s.key)} toggleData={{ "data-review-toggle": s.key }} />
          {cell(t.invested, { why: "no line in this block carries a cost" })}
          {cell(t.paidIn, { why: "no line in this block has dated rows" })}
          {cell(t.paidBack, { why: "no line in this block has dated rows" })}
          {cell(t.value, { why: s.key === "now-listed" ? "these lines are on the review's Equity tab" : "no line in this block carries a value" })}
          {cell(t.gain, { sign: true, colour: true, why: "no line in this block measures a gain" })}
          <td className="px-4 py-2 text-right"><AbsentCell reason="a return is struck per line, never across a block" /></td>
          <td className="px-4 py-2 text-right"><AbsentCell reason="a rate is struck per line, never across a block" /></td>
          <td className="px-4 py-2" />
          <td className="px-4 py-2" />
        </Tr>
        {open && rows.map((r, i) => lineRow(r, i, rows.length))}
      </Fragment>
    );
  };

  const filler = (n: number) => Array.from({ length: n }, (_, i) => <td key={i} className="px-4 py-1.5" />);

  return (
    <div className="overflow-x-auto">
      <div className="flex justify-end px-4 pb-2">
        <ExpandAllButton allOpen={allOpen} onClick={() => bands.setMany(allKeys, !allOpen)} />
      </div>
      <table className="min-w-full text-[13px]" data-pm-table="review">
        <thead className="border-b border-ink-700">
          <Tr view={view}>
            <SortHeader col="name" view={view} align="left" className="min-w-[16rem]"
              title={`The family's consolidated review (MOPWM), as on ${asOf}: each private-market line as it prints it.`}>Line</SortHeader>
            <SortHeader col="invested" view={view} title="The review's own Investment at Cost.">Cost</SortHeader>
            <SortHeader col="paidIn" view={view} title="What the review's own dated rows (Transactions since inception) say was paid in.">Paid in</SortHeader>
            <SortHeader col="paidBack" view={view} title="Income and sale proceeds on those dated rows.">Paid back</SortHeader>
            <SortHeader col="value" view={view} title="The review's own market value — for a line held at cost, its cost.">Value</SortHeader>
            <SortHeader col="gain" view={view} title="Value plus paid back, less paid in.">Gain</SortHeader>
            <SortHeader col="ret" view={view} title="Gain over paid in, re-derived from the review's own rows and not annualised. ≠ marks a line where the review prints another figure.">Return</SortHeader>
            <SortHeader col="xirr" view={view} title="The money-weighted rate over the line's own dated rows, ACT/365. Under a year it is not shown: a rate is never compounded onto a year.">XIRR</SortHeader>
            <SortHeader col="basis" view={view} align="left" title="How the review values the line.">Valued</SortHeader>
            <SortHeader col="stmts" view={view} align="left" title="Which of this book's statements carry the same holding — joined by hand on an arithmetic witness or the company's own name, never by a guess.">In the statements</SortHeader>
          </Tr>
        </thead>
        <tbody className="divide-y divide-ink-700/60">
          {lineSections.map(band)}
          <TrFoot view={view} className="border-t border-ink-600 bg-ink-800/60 font-medium" data-review-foot=""
            data-review-lines={foot.lines} data-review-invested={foot.invested ?? undefined} data-review-value={foot.value ?? undefined}
            label={<span className="px-4 py-2 block">Total · {foot.lines} lines</span>}
            labelTitle={`The review's own figures, as on ${asOf} — in no total of this book. Cost covers ${foot.investedOf} of ${foot.lines} lines and value ${foot.valueOf}: a line written off carries no cost, and the ${lineSections.find((s) => s.key === "now-listed")?.rows.length ?? 0} now listed are on the review's Equity tab.`}
            cells={{
              invested: cell(foot.invested),
              paidIn: cell(foot.paidIn),
              paidBack: cell(foot.paidBack),
              value: cell(foot.value),
              gain: cell(foot.gain, { sign: true, colour: true }),
              ret: <td className="px-4 py-2 text-right"><AbsentCell reason="a return is struck per line, never across the table" /></td>,
              xirr: <td className="px-4 py-2 text-right"><AbsentCell reason="a rate is struck per line, never across the table" /></td>,
            }} />
        </tbody>
        <tbody className="divide-y divide-ink-700/60">
          <tr className={`${TREE_ROW.section} cursor-pointer`} {...rowToggle(() => bands.toggle("members"))}
            data-review-members={d.members.length} data-review-members-value={memberSum} data-review-open={bands.isOpen("members") ? "true" : "false"}>
            <TreeSectionCell title="By member" marker={<span>{d.members.length}</span>} colSpan={COLS.length}
              sub={`the review's Investorwise summary · ${money(memberSum)}`}
              hint={`${d.basis ?? "The review's Investorwise summary"}: PE funds and unlisted shares at the review's value, private investments at cost. It leaves out K M Global, filed under Debt — so it is the total above less that one line, ${moneyFull(memberSum)}.`}
              open={bands.isOpen("members")} onToggle={() => bands.toggle("members")} toggleData={{ "data-review-toggle": "members" }} />
          </tr>
          {bands.isOpen("members") && d.members.map((m, i) => (
            <Tr key={m.name} view={view} className={TREE_ROW.child} data-review-member={m.name} data-review-member-value={memberTotal(m) ?? undefined}>
              <TreeNameCell depth={1} last={i === d.members.length - 1} title={m.name} />
              <td className="px-4 py-1.5" />
              <td className="px-4 py-1.5" />
              <td className="px-4 py-1.5" />
              <td className="mono px-4 py-1.5 text-right"
                title={`PE funds ${moneyFull(m.peFunds)} + unlisted ${moneyFull(m.unlisted)} + private equity at cost ${moneyFull(m.peAtCost)}`}>{money(memberTotal(m))}</td>
              {filler(5)}
            </Tr>
          ))}
          <tr className={`${TREE_ROW.section} cursor-pointer`} {...rowToggle(() => bands.toggle("checks"))}
            data-review-checks={d.checks.length} data-review-open={bands.isOpen("checks") ? "true" : "false"}>
            <TreeSectionCell title="Where the review disagrees with itself" marker={<span>{d.checks.length}</span>} colSpan={COLS.length}
              sub="each re-derived from its own rows"
              hint="Each line is a figure the review prints set against what its own rows give. The tab shows the review's figure; the re-derived one is beside it, marked ≠."
              open={bands.isOpen("checks")} onToggle={() => bands.toggle("checks")} toggleData={{ "data-review-toggle": "checks" }} />
          </tr>
          {bands.isOpen("checks") && d.checks.map((c, i) => (
            <Tr key={c.key} view={view} className={TREE_ROW.child} data-review-check={c.key}>
              <TreeNameCell depth={1} last={i === d.checks.length - 1} title={c.short} hint={`${c.text}. ${c.detail}`} />
              {filler(COLS.length - 1)}
            </Tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** For a caller that only needs the totals (the tab's own button count). */
export const REVIEW_LINE_COUNT = allReviewRows(REVIEW_PRIVATE).length;

