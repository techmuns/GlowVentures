/**
 * ── MORNING CIO → RETURNS → RETURN ATTRIBUTION (Stages 10ez, 10fd) ──────────
 *
 * *"It is supposed to be a section inside the returns page only. Just give
 * options to select the attribution and see how different categories and
 * segments offer attribution to the return profile."* So it is the Returns
 * tab's third section, under the portfolio's card and the benchmarks — never a
 * tab of its own (Stage 10ez drew one, and the family took it back).
 *
 * Which part of the book earned its return: pick an axis — Category, Asset
 * class, Basket, Sector, Listed / Private, All Securities — and every segment
 * shows its value, its weight, the capital behind it, its FIFO gain and return,
 * and its contribution to the book's return in percentage points. A segment
 * opens into its holdings (or, for a security and for the PMS mandates, into
 * the accounts that hold it), rows of the same table.
 *
 * The model is `segmentAttribution`: the same current holdings and the same
 * FIFO as the Gain / Loss tile, so the Total row IS that tile's gain and
 * return, and the contributions add to it. Since investment, never a window:
 * no holding carries a dated value, so a sector or a basket cannot be struck
 * over FYTD the way an account is. The section says so on its face, because it
 * sits under a period selector it does not follow.
 */
import { Fragment, useMemo } from "react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell } from "@/components/Absent";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { TREE_ROW, TREE_CELL, TreeNameCell, rowToggle, useExpanded, ExpandAllButton } from "@/components/TreeTable";
import { useViewParam } from "@/components/ViewToggle";
import { useTableView, sortRows } from "@/lib/tableView";
import { usePortfolio } from "@/context/PortfolioContext";
import { changeColor } from "@/lib/format";
import { AT_COST_RETURN, currentHoldings, isCompanyShare } from "@/lib/analytics";
import { companySectorIndex } from "@/lib/lookthrough";
import { useStockExposure } from "@/lib/useStockExposure";
import { segmentAttribution, SEGMENT_VIEWS, type SegmentLine } from "@/lib/segmentReturns";

const COLS = ["seg", "holdings", "value", "weight", "deployed", "gain", "ret", "contrib"] as const;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const pp = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)} pp`;

const HEAD: Record<string, string> = {
  category: "Category", assetClass: "Asset class", basket: "Basket", sector: "Sector / class", side: "Side", security: "Security",
};

export default function SegmentReturns() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  const [axis, setAxis] = useViewParam(SEGMENT_VIEWS, {}, "seg");
  const view = useTableView("cio-attribution", COLS);
  const exp = useExpanded();
  const money = (n: number, sign = false) => fmtFromBase(n, { compact: true, sign });

  const exposure = useStockExposure(consolidated, axis === "sector");
  const sectors = useMemo(
    () => (axis === "sector" ? companySectorIndex(consolidated.filter(isCompanyShare), exposure) : null),
    [axis, consolidated, exposure],
  );
  const current = useMemo(() => currentHoldings(consolidated), [consolidated]);
  const a = useMemo(
    () => (portfolio ? segmentAttribution(current, portfolio.accounts, axis, (k) => sectors?.get(k)?.sector || null) : null),
    [current, portfolio, axis, sectors],
  );
  if (!portfolio || !a) return null;

  const rows = sortRows(a.rows, view.sort, {
    seg: (r) => r.label, holdings: (r) => r.holdings, value: (r) => r.value, weight: (r) => r.weightPct,
    deployed: (r) => r.deployed, gain: (r) => r.gain, ret: (r) => r.returnPct, contrib: (r) => r.contribPct,
  });
  const maxAbs = Math.max(1e-9, ...a.rows.map((r) => Math.abs(r.contribPct ?? 0)), Math.abs(a.mandateRemainder?.contribPct ?? 0));
  const openable = a.rows.filter((r) => r.children.length > 1 || r.childRemainder);
  const allOpen = openable.length > 0 && openable.every((r) => exp.isOpen(r.key));
  const best = a.rows.filter((r) => r.contribPct != null).sort((x, y) => y.contribPct! - x.contribPct!);
  const top = best[0] ?? null;
  const drag = best.length > 1 && best.at(-1)!.contribPct! < 0 ? best.at(-1)! : null;

  const gainHint = (l: SegmentLine) => {
    const parts = [`FIFO since investment: unrealised + realised + dividends over ${l.struck} of ${l.holdings} holdings (${money(l.struckValue)} of ${money(l.value)})`];
    if (l.gain != null && Math.abs(l.gain) < 0.5) parts.unshift("A measured zero: value less cost, plus anything realised, nets to nothing here — as for cash carried at its cost");
    if (l.uncostedValue > 0.5) parts.push(`${money(l.uncostedValue)} reports no cost and is in the value, in no gain`);
    if (l.atCostValue > 0.5) parts.push(`${money(l.atCostValue)} is held at cost and is in the value, in no gain`);
    if (l.wholeMandates) parts.push(`${l.wholeMandates === 1 ? "1 PMS mandate is" : `${l.wholeMandates} PMS mandates are`} struck whole on the capital paid in`);
    return parts.join(" · ");
  };
  const noGain = (l: SegmentLine) => (l.atCostValue > 0 && l.atCostValue >= l.value - l.uncostedValue
    ? AT_COST_RETURN
    : "no holding here reports both a cost and a valuation, so no gain is struck");

  const cells = (l: SegmentLine, kind: "parent" | "child") => {
    const pad = TREE_CELL[kind];
    const tone = kind === "child" ? "text-slate-300" : "text-slate-100";
    return [
      <td key="holdings" className={`${pad} text-right mono text-slate-400`}>{l.holdings}</td>,
      <td key="value" className={`${pad} text-right mono ${tone}`} data-seg-cell="value">{money(l.value)}</td>,
      <td key="weight" className={`${pad} text-right mono text-slate-400`}>{l.weightPct != null ? `${l.weightPct.toFixed(1)}%` : <AbsentCell reason="the book has no value to weigh against" />}</td>,
      <td key="deployed" className={`${pad} text-right mono text-slate-300`} title="Capital deployed: the cost of the units held plus the cost of the units sold — or, for a whole PMS mandate, the capital paid in">
        {l.deployed != null ? money(l.deployed) : <AbsentCell reason={noGain(l)} />}
      </td>,
      <td key="gain" className={`${pad} text-right mono ${changeColor(l.gain)}`} title={l.gain != null ? gainHint(l) : undefined} data-seg-cell="gain">
        {l.gain != null ? money(l.gain, Math.abs(l.gain) >= 0.5) : <AbsentCell reason={noGain(l)} />}
      </td>,
      <td key="ret" className={`${pad} text-right mono ${changeColor(l.returnPct)}`} data-seg-cell="ret">
        {l.returnPct != null ? pct(l.returnPct) : <AbsentCell reason={noGain(l)} />}
      </td>,
      <td key="contrib" className={`${pad} text-right mono`} data-seg-cell="contrib"
        title={l.contribPct != null ? `${money(l.gain ?? 0, true)} of gain over the book's ${money(a.total.deployed ?? 0)} capital deployed` : undefined}>
        {l.contribPct != null ? <ContribBar value={l.contribPct} max={maxAbs} text={pp(l.contribPct)} /> : <AbsentCell reason={noGain(l)} />}
      </td>,
    ];
  };

  const btn = (on: boolean) => `rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${on ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`;

  const axisLabel = (SEGMENT_VIEWS.find((v) => v.key === axis)?.label ?? "").toLowerCase();

  return (
    <div className="shrink-0" data-segment-returns data-returns-attribution data-seg-axis={axis}
      data-seg-total-gain={a.total.gain ?? ""} data-seg-total-deployed={a.total.deployed ?? ""}
      data-seg-total-value={a.total.value} data-seg-total-ret={a.total.returnPct ?? ""}
      data-status={axis === "sector" && exposure.status === "loading" ? "loading" : "ready"}>
        <Card pad={false} title={<>Return attribution · <span className="font-normal text-slate-400" data-seg-basis>by {axisLabel}, since investment</span></>}
          subtitle="Which part of the book earned its return. FIFO on cost, as the Gain / Loss tile: each segment's unrealised and realised gain plus dividends, over the capital it deployed. Contribution is that gain over the whole book's capital deployed, so the segments add to the book's return. Since investment, not the period selected above: no holding carries a dated value to open a window on. A holding with no cost, or held at cost, is in the value and in no gain."
          right={
            <div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
              {top && (
                <Pill tone="info"><span data-seg-top={top.key} title={`Largest contribution to the book's return on this axis: ${money(top.gain ?? 0, true)}`}>Top {top.label} {pp(top.contribPct!)}</span></Pill>
              )}
              {drag && (
                <Pill tone="info"><span data-seg-drag={drag.key} title={`Largest drag on the book's return on this axis: ${money(drag.gain ?? 0, true)}`}>Drag {drag.label} {pp(drag.contribPct!)}</span></Pill>
              )}
              <div role="tablist" aria-label="Attribute the return by" className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5">
                {SEGMENT_VIEWS.map((v) => (
                  <button key={v.key} type="button" role="tab" aria-selected={axis === v.key} title={v.title} data-seg-axis-option={v.key}
                    onClick={() => setAxis(v.key)} className={btn(axis === v.key)}>{v.label}</button>
                ))}
              </div>
              {openable.length > 0 && <ExpandAllButton allOpen={allOpen} onClick={() => exp.setMany(openable.map((r) => r.key), !allOpen)} />}
            </div>
          }>
          <div className="overflow-x-auto">
            <table className="min-w-full whitespace-nowrap text-[12.5px]" data-seg-table>
              <thead className="border-b border-ink-700 bg-ink-800">
                <Tr view={view}>
                  <SortHeader col="seg" view={view} align="left" pad="px-4 py-2">{HEAD[axis]}</SortHeader>
                  <SortHeader col="holdings" view={view} pad="px-4 py-2" title="Holdings filed under the segment">Holdings</SortHeader>
                  <SortHeader col="value" view={view} pad="px-4 py-2">Value</SortHeader>
                  <SortHeader col="weight" view={view} pad="px-4 py-2" title="Share of the book's value">Weight</SortHeader>
                  <SortHeader col="deployed" view={view} pad="px-4 py-2" title="Cost of the units held plus the cost of the units sold; a whole PMS mandate enters on the capital paid in">Deployed</SortHeader>
                  <SortHeader col="gain" view={view} pad="px-4 py-2" title="Unrealised plus realised plus dividends, FIFO">Gain</SortHeader>
                  <SortHeader col="ret" view={view} pad="px-4 py-2" title="Gain ÷ deployed, since investment, not annualised">Return</SortHeader>
                  <SortHeader col="contrib" view={view} pad="px-4 py-2" title="Gain ÷ the whole book's capital deployed, in percentage points — the segments add to the book's return">Contribution</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {rows.map((r) => {
                  const canOpen = r.children.length > 1 || !!r.childRemainder;
                  const open = canOpen && exp.isOpen(r.key);
                  return (
                    <Fragment key={r.key}>
                      <Tr view={view} className={canOpen ? TREE_ROW.parent : ""} {...(canOpen ? rowToggle(() => exp.toggle(r.key)) : {})}
                        data-seg-row={r.key} data-seg-value={r.value} data-seg-gain={r.gain ?? ""} data-seg-deployed={r.deployed ?? ""}
                        data-seg-contrib={r.contribPct ?? ""} data-seg-children={r.children.length} data-seg-open={open ? "1" : "0"}>
                        <TreeNameCell depth={0} title={r.label} sub={r.unplaced ? "not placed" : undefined}
                          open={canOpen ? open : undefined} onToggle={canOpen ? () => exp.toggle(r.key) : undefined}
                          toggleLabel={open ? "Hide what is behind it" : "Show what is behind it"} toggleData={{ "data-seg-toggle": r.key }} />
                        {cells(r, "parent")}
                      </Tr>
                      {open && r.children.map((c, i) => (
                        <Tr view={view} key={`${r.key}|${c.key}`} className={TREE_ROW.child} data-seg-child={r.key} data-seg-child-key={c.key}
                          data-seg-value={c.value} data-seg-gain={c.gain ?? ""}>
                          <TreeNameCell depth={1} title={c.label} last={i === r.children.length - 1 && !r.childRemainder} />
                          {cells(c, "child")}
                        </Tr>
                      ))}
                      {open && r.childRemainder && (
                        <Tr view={view} className={TREE_ROW.adjust} data-seg-child={r.key} data-seg-child-remainder={r.childRemainder.gain}>
                          <TreeNameCell depth={1} last title="Mandate capital beyond its holdings"
                            hint="A whole PMS mandate is struck on its capital since inception — its fees, and the sales and income outside its holdings' own records. Split across these lines, each holding enters on its own lots, and the rest of the mandate's gain is here, so the lines add to the segment." />
                          <td className={TREE_CELL.child} />
                          <td className={TREE_CELL.child} />
                          <td className={TREE_CELL.child} />
                          <td className={`${TREE_CELL.child} text-right mono text-slate-400`}>{money(r.childRemainder.deployed, true)}</td>
                          <td className={`${TREE_CELL.child} text-right mono ${changeColor(r.childRemainder.gain)}`}>{money(r.childRemainder.gain, true)}</td>
                          <td className={TREE_CELL.child} />
                          <td className={TREE_CELL.child} />
                        </Tr>
                      )}
                    </Fragment>
                  );
                })}
                {a.mandateRemainder && (
                  <Tr view={view} className={TREE_ROW.adjust} data-seg-remainder={a.mandateRemainder.gain} data-seg-contrib={a.mandateRemainder.contribPct ?? ""}>
                    <TreeNameCell depth={0} title="PMS mandate capital not held by one segment"
                      hint={`${a.mandateRemainder.mandates} PMS mandate${a.mandateRemainder.mandates === 1 ? " is" : "s are"} struck whole on the capital paid in — its fees, and the sales and income outside its holdings' own records, belong to no single holding. This axis splits ${a.mandateRemainder.mandates === 1 ? "it" : "them"} across segments, so each holding enters on its own lots and the remainder is this line; it is never spread across segments it was not reported against.`} />
                    <td className={TREE_CELL.parent} />
                    <td className={TREE_CELL.parent} />
                    <td className={TREE_CELL.parent} />
                    <td className={`${TREE_CELL.parent} text-right mono text-slate-400`}>{money(a.mandateRemainder.deployed, true)}</td>
                    <td className={`${TREE_CELL.parent} text-right mono ${changeColor(a.mandateRemainder.gain)}`}>{money(a.mandateRemainder.gain, true)}</td>
                    <td className={`${TREE_CELL.parent} text-right`}><AbsentCell reason="a remainder of capital, not a holding: it has no return of its own" /></td>
                    <td className={`${TREE_CELL.parent} text-right mono`}>
                      {a.mandateRemainder.contribPct != null ? <ContribBar value={a.mandateRemainder.contribPct} max={maxAbs} text={pp(a.mandateRemainder.contribPct)} /> : <AbsentCell reason="the book deploys no capital" />}
                    </td>
                  </Tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-ink-600">
                <TrFoot view={view} className={`${TREE_ROW.total} px-4 py-2.5 font-semibold`} data-seg-total
                  label={<span className="text-slate-100">Total · {a.rows.length} {a.rows.length === 1 ? "segment" : "segments"}</span>}
                  cells={{
                    holdings: <td key="holdings" className="px-4 py-2.5 text-right mono text-slate-300">{a.total.holdings}</td>,
                    value: <td key="value" className="px-4 py-2.5 text-right mono text-slate-100">{money(a.total.value)}</td>,
                    weight: <td key="weight" className="px-4 py-2.5 text-right mono text-slate-300">{a.total.weightPct != null ? "100%" : <AbsentCell reason="the book has no value" />}</td>,
                    deployed: <td key="deployed" className="px-4 py-2.5 text-right mono text-slate-200">{a.total.deployed != null ? money(a.total.deployed) : <AbsentCell reason={noGain(a.total)} />}</td>,
                    gain: <td key="gain" className={`px-4 py-2.5 text-right mono ${changeColor(a.total.gain)}`} title={a.total.gain != null ? gainHint(a.total) : undefined}>{a.total.gain != null ? money(a.total.gain, true) : <AbsentCell reason={noGain(a.total)} />}</td>,
                    ret: <td key="ret" className={`px-4 py-2.5 text-right mono ${changeColor(a.total.returnPct)}`}>{a.total.returnPct != null ? pct(a.total.returnPct) : <AbsentCell reason={noGain(a.total)} />}</td>,
                    contrib: <td key="contrib" className={`px-4 py-2.5 text-right mono ${changeColor(a.total.returnPct)}`} title="The contributions above add to the book's return">{a.total.returnPct != null ? pp(a.total.returnPct) : <AbsentCell reason={noGain(a.total)} />}</td>,
                  }} />
              </tfoot>
            </table>
          </div>
        </Card>
    </div>
  );
}

/** The contribution, with a bar scaled to the largest on the axis — green adds, red drags. */
function ContribBar({ value, max, text }: { value: number; max: number; text: string }) {
  const w = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span aria-hidden className="relative inline-block h-1.5 w-16 overflow-hidden rounded-full bg-ink-700/60">
        <span className={`absolute inset-y-0 ${value >= 0 ? "left-0 bg-emerald-500/80" : "right-0 bg-rose-500/80"}`} style={{ width: `${w}%` }} />
      </span>
      <span className={changeColor(value)}>{text}</span>
    </span>
  );
}
