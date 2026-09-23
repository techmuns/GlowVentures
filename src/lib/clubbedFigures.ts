// WHAT A ROW THAT CLUBS SEVERAL STATEMENT LINES MAY STATE.
//
// A consolidated row — one security across every account that reports it, a
// fund's classes clubbed, a section band, a member's holdings — is a sum of
// statement lines, and the statements do not all report the same fields.
// Cost is the one that bites: a PMS statement prints what a share cost, a
// depository does not, so one row can hold a costed line and an uncosted one.
//
// ── THE DEFECT THIS EXISTS TO STOP (A-02 in docs/FIGURE-AUDIT.md) ───────────
//
// The row build struck cost over the lines that report one and set it against
// EVERY unit and EVERY rupee of value: ICICI Bank carried ₹94.2 L of cost on
// 7,000 of its 21,500 shares, so its average cost printed ₹438.34 (₹94.2 L ÷
// 21,500) where the costed shares cost ₹1,346.33 each, and its unrealised P&L
// printed +₹2.06 Cr (+218.5%) — every share's value less 7,000 shares' cost —
// where the costed shares had gained +₹5.98 L (+6.35%). Each figure was a real
// sum over a real set; the two sets were different. The same construction put
// a ₹15.92 Cr P&L column under a ₹13.92 Cr footer on the security axis, and
// Family & Entities' popover printed "(₹349.4 − ₹254.3) ÷ ₹254.3 = +12.34%",
// arithmetic that gives 37.4%.
//
// So cost, the units and value it covers, and the gain on it are struck
// TOGETHER, here, once — and the part no statement costs is carried beside
// them, named, rather than silently folded into either side.
//
// ── AND A COST TOTAL OVER NOTHING IS NOT ₹0 (A-14) ──────────────────────────
//
// The Cash section held ₹14.2 Cr of liquid funds whose cost no statement
// reports and two nil cash sleeves that report a cost of ₹0. The sum over the
// costed lines was ₹0 and printed as Invested ₹0 and P&L ₹0 beside ₹14.2 Cr —
// a measured zero over the only part of the section that is worth nothing.
// `vacuous` names that case, and a caller renders an absence with its reason.
import type { Position } from "./types";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A line whose statement reports what it cost — the one test, used everywhere. */
export const reportsCost = (p: Pick<Position, "costBasis" | "costUnavailable">): boolean =>
  !p.costUnavailable && isNum(p.costBasis);

export type CostedFigures = {
  /** Σ cost over the lines that report one; null where none does, or where that part is `vacuous`. */
  cost: number | null;
  /** The units and the value THAT cost covers — never the whole row's. */
  costedUnits: number;
  costedValue: number;
  /** Σ (value − cost) over those same lines; null exactly where `cost` is. */
  unrealised: number | null;
  /** cost ÷ costed units; null where there is no cost or no unit count behind it. */
  avgCost: number | null;
  /** The part no statement reports a cost for. */
  uncosted: { lines: number; units: number; value: number };
  lines: number;
  units: number;
  value: number;
  /** Every line with any value reports a cost — the cost describes the whole row. */
  complete: boolean;
  /**
   * The costed lines hold nothing (value 0 and cost 0 — nil balances) while
   * the rest of the row carries value: a cost total over them is a figure
   * about nothing, so `cost`, `unrealised` and `avgCost` are null.
   */
  vacuous: boolean;
};

/**
 * Cost, the units and value it covers, and the gain on it — struck together
 * over `set`, which the caller has already deduped where the row is
 * consolidated (`dedupedPositions`), and left raw where it is per account.
 */
export function costedFigures(
  set: readonly Pick<Position, "costBasis" | "costUnavailable" | "marketValue" | "quantity">[],
): CostedFigures {
  let cost: number | null = null, costedUnits = 0, costedValue = 0;
  let uLines = 0, uUnits = 0, uValue = 0, units = 0, value = 0;
  for (const p of set) {
    const q = isNum(p.quantity) ? p.quantity : 0;
    units += q;
    value += p.marketValue;
    if (reportsCost(p)) {
      cost = (cost ?? 0) + (p.costBasis as number);
      costedUnits += q;
      costedValue += p.marketValue;
    } else {
      uLines += 1; uUnits += q; uValue += p.marketValue;
    }
  }
  const vacuous = cost !== null && cost === 0 && costedValue === 0 && uValue !== 0;
  const c = vacuous ? null : cost;
  return {
    cost: c,
    costedUnits,
    costedValue,
    unrealised: c === null ? null : costedValue - c,
    avgCost: c !== null && costedUnits > 0 ? c / costedUnits : null,
    uncosted: { lines: uLines, units: uUnits, value: uValue },
    lines: set.length,
    units,
    value,
    complete: uLines === 0 || uValue === 0,
    vacuous,
  };
}

/**
 * The sentence a partial cost carries, for the cell's hover: which part of the
 * row the figure covers. Empty where the cost covers the whole row.
 */
export function costCoverNote(f: CostedFigures, money: (n: number) => string, unitsFmt: (n: number) => string): string {
  if (f.complete || f.cost === null) return "";
  return `Over the ${unitsFmt(f.costedUnits)} of ${unitsFmt(f.units)} units whose statement reports a cost (${money(f.costedValue)} of ${money(f.value)}); `
    + `${f.uncosted.lines} line${f.uncosted.lines === 1 ? "" : "s"} worth ${money(f.uncosted.value)} ${f.uncosted.lines === 1 ? "reports" : "report"} none — a depository holds shares and does not record what they cost — and ${f.uncosted.lines === 1 ? "is" : "are"} left out of the cost, the average and the gain alike, never counted at zero.`;
}

/** Why a vacuous cost is absent. */
export const VACUOUS_COST_REASON =
  "the only lines here that report a cost are nil balances worth nothing; no statement reports what the holdings with value cost, so there is no invested figure to show — a ₹0 would read as holdings that cost nothing";

/**
 * ONE MARK OR NONE (A-03). A row that clubs several statement lines prints
 * a per-unit mark only where every line's mark renders as ONE figure — the
 * test is what the renderer can distinguish (Stage 10bm), not an invented
 * tolerance. Where the lines disagree the row has no single price: DSP Gold's
 * ₹151.10 (2,05,000 units) printed over all 14,00,000 units gave ₹21.15 Cr
 * against the row's ₹19.98 Cr, because the 11,95,000 units on the other
 * statement are marked ₹141.24.
 *
 * Lines with no per-unit mark (marked at a total value) are left out of the
 * comparison, as the stock page does.
 */
export function commonMark(
  lines: readonly { currentPrice?: number | null }[],
  render: (n: number) => string,
): { price: number | null; marks: string[]; values: number[] } {
  const seen = new Map<string, number>();
  for (const l of lines) {
    const v = l.currentPrice;
    if (!isNum(v)) continue;
    const k = render(v);
    if (!seen.has(k)) seen.set(k, v);
  }
  const marks = [...seen.keys()];
  return { price: marks.length === 1 ? seen.get(marks[0])! : null, marks, values: [...seen.values()] };
}

/**
 * The agreement key for a mark: the book's own precision, to the paisa, in the
 * BASE currency. Two marks equal to the paisa are one mark to a reader in any
 * display currency; keyed on the display formatter instead, whether a row shows
 * a price would change with the currency picker.
 */
export const markKey = (n: number): string => n.toFixed(2);

/** Why a split mark is absent, naming the marks. */
export const splitMarkReason = (marks: readonly string[]) =>
  `the statements reporting this holding do not agree on a mark — ${marks.join(" and ")}. No one price covers every line, and a weighted mean of them is a figure no statement printed; open the row: each line carries its own`;
