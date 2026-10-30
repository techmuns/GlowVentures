/**
 * ── A RETURN TILE AGAINST THE INDEX, ON THE SAME MONEY (Stage 10ji) ─────────
 *
 *   *"We need to add a detail there versus benchmark return over the same
 *    period using the same methodology. So we can see exactly how we performed
 *    with respect to the benchmark."*
 *
 * Every rupee behind the tile goes into the index on the day it moved, and each
 * record closes on its own closing date (the public-market equivalent,
 * `pmeWindowRows`). The tile's own measure is then struck over that, so the lead
 * compares one definition with itself.
 *
 *  - A PERIOD TILE reads its own account windows, whole or not at all.
 *  - A SINCE-INVESTMENT TILE is gain ÷ money invested per holding, and those
 *    units carry no flows of their own. Each is dated here from its own record.
 *    A unit whose dated money does not tie to what it invested is left out of
 *    BOTH sides and named: an index return over part of the money set beside a
 *    book return over all of it would not be like with like.
 *
 * Price indices, statement dates. Live quotes never enter either side.
 */
import { allDebt } from "./analytics";
import { holdingFlowsOf } from "./holdingFlows";
import { measureWindow, pmeWindowRows, type IndexLevel } from "./periodReturns";
import type { ReturnUnit, SelectedLine, ReturnSelection } from "./selectedSegmentReturns";
import { trancheKey } from "./tranches";
import type { Account, CapitalMove, PositionTranches } from "./types";

/** How far a unit's dated money may sit from what it invested (rounding, charges). */
export const DATED_MONEY_TIE = 0.01;

export type DatedUnit = { unit: ReturnUnit; flows: { date: string; amount: number }[]; closeOn: string; paidIn: number };
export type CardCoverage = { dated: DatedUnit[]; undated: ReturnUnit[]; datedInvested: number; totalInvested: number };

export type BenchmarkComparison = {
  /** The book's figure on the money compared: the tile's own, unless `coverage` narrows it. */
  book: number | null;
  index: number | null;
  /** Book less index, in percentage points. */
  gap: number | null;
  annual: boolean;
  /** Why no index figure is struck. */
  reason: string | null;
  /** Set only on a since-investment tile, whose comparison may cover part of its money. */
  coverage: CardCoverage | null;
};

/** The moves dated to this unit: its account's for a whole mandate, else this security's. */
function movesOf(u: ReturnUnit, moves: readonly CapitalMove[]) {
  const whole = u.key === u.accountId, key = u.positions[0]?.securityKey;
  return moves.filter((m) => m.accountId === u.accountId && (whole || m.securityKey === key));
}

function asFlows(ms: readonly CapitalMove[], closeOn: string) {
  const within = ms.filter((m) => m.date <= closeOn);
  if (within.some((m) => m.amount == null)) return null;
  return within.map((m) => ({ date: m.date, amount: m.direction === "in" ? -m.amount! : m.amount! }));
}

const paidInOf = (flows: readonly { amount: number }[]) => flows.reduce((s, f) => s + (f.amount < 0 ? -f.amount : 0), 0);
const ties = (paid: number, invested: number) => invested > 0 && Math.abs(paid / invested - 1) <= DATED_MONEY_TIE;

/** Which since-investment units carry dated money accounting for what they invested. */
export function datedSinceInvestment(units: readonly ReturnUnit[], moves: readonly CapitalMove[],
  tranches: Readonly<Record<string, PositionTranches>>, accounts: readonly Account[]): CardCoverage {
  const dated: DatedUnit[] = [], undated: ReturnUnit[] = [];
  const asOf = new Map(accounts.map((a) => [a.accountId, a.asOf]));
  for (const u of units) {
    const whole = u.key === u.accountId, p = u.positions[0];
    const accept = (flows: { date: string; amount: number }[] | null, closeOn: string): DatedUnit | null => {
      if (!flows?.length || !closeOn) return null;
      const paidIn = paidInOf(flows);
      return ties(paidIn, u.invested) ? { unit: u, flows, closeOn, paidIn } : null;
    };
    const own = !whole && p ? holdingFlowsOf(p, asOf.get(p.accountId) ?? null) : null;
    const allotted = !whole && p ? tranches[trancheKey(p.accountId, p.securityKey)] : null;
    const found = (own?.dated ? accept(own.flows, own.close?.date ?? u.to) : null)
      ?? accept(asFlows(movesOf(u, moves), u.to), u.to)
      ?? (allotted ? accept(asFlows(allotted.moves, u.to), u.to) : null);
    if (found) dated.push(found); else undated.push(u);
  }
  const sum = (us: readonly ReturnUnit[]) => us.reduce((s, u) => s + u.invested, 0);
  return { dated, undated, datedInvested: sum(dated.map((d) => d.unit)), totalInvested: sum(units) };
}

function sinceInvestment(coverage: CardCoverage, level: IndexLevel): BenchmarkComparison {
  const none = (reason: string): BenchmarkComparison => ({ book: null, index: null, gap: null, annual: false, reason, coverage });
  if (!coverage.dated.length) return none("no holding behind this figure dates all the money it invested");
  let indexGain = 0, paid = 0, bookGain = 0;
  for (const { unit, flows, closeOn, paidIn } of coverage.dated) {
    const l1 = level(closeOn);
    if (l1 == null || !(l1 > 0)) return none(`the index has no close on or before ${closeOn}`);
    for (const f of flows) {
      const l = level(f.date);
      if (l == null || !(l > 0)) return none(`the index has no close on or before ${f.date}, when ${unit.label} moved money`);
      // What the index holding is worth at the close, plus the cash already out, less the money in.
      indexGain += -f.amount * (l1 / l) + f.amount;
    }
    paid += paidIn;
    bookGain += unit.gain;
  }
  const book = coverage.datedInvested > 0 ? (bookGain / coverage.datedInvested) * 100 : null;
  const index = paid > 0 ? (indexGain / paid) * 100 : null;
  return { book, index, gap: book != null && index != null ? book - index : null, annual: false, reason: null, coverage };
}

function overWindows(line: SelectedLine, selection: ReturnSelection, level: IndexLevel): BenchmarkComparison {
  const none = (reason: string): BenchmarkComparison => ({ book: line.returnPct, index: null, gap: null, annual: false, reason, coverage: null });
  const windows = line.units.flatMap((u) => (u.window ? [u.window] : []));
  if (line.returnPct == null || !windows.length || windows.length !== line.units.length) return none("this tile has no measured return to compare");
  const p = pmeWindowRows(windows, level);
  if (!p.rows) return none(p.reason);
  const m = measureWindow(p.rows, selection.type, String, { debt: allDebt(line.units.flatMap((u) => u.positions)) });
  if (!m.shown || m.pct == null || !Number.isFinite(m.pct)) return none(m.reason ?? "the index's flows do not yield this measure");
  return { book: line.returnPct, index: m.pct, gap: line.returnPct - m.pct, annual: m.basis === "annual", reason: null, coverage: null };
}

/** The tile's figure and the index's, on the same dated money. */
export function compareToIndex(card: { total: SelectedLine; selection: ReturnSelection }, level: IndexLevel,
  coverage: CardCoverage | null): BenchmarkComparison {
  return card.selection.inception && coverage ? sinceInvestment(coverage, level) : overWindows(card.total, card.selection, level);
}
