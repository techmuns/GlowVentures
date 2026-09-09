// THE YEAR'S TRADING, AS FIVE LINES INSTEAD OF FOUR HUNDRED AND SIXTY-TWO.
//
// *"Show the year's transactions as one line per entity / manager / instrument,
// not a raw tape. I will only see five items — Buoyant, VEC, Carnelian and the
// direct stocks — then I can drill down."* And, separately: *"Bandhan mutual
// fund staggered for the last seven eight months… I want to see that as one
// line item and then drill down."*
//
// Those are one request. A raw tape answers "what happened on 13 August"; a
// family office asks "what did each manager do this year, and what did they
// build a position in". This book's own tape makes the point: Green Lantern
// bought The Anup Engineering on FIFTY separate days across five months, in two
// accounts — a hundred rows for one decision. Reading that tape, a reader
// cannot see the decision at all.
//
// ── THREE LEVELS, AND THE MIDDLE ONE IS THE ANSWER ──────────────────────────
//
//   group      one line per manager (or per family member, or per instrument)
//   instrument one line per security inside it — WHERE A STAGGERED SERIES
//              COLLAPSES, because "all the Anup Engineering buys" is one row by
//              construction rather than by pattern-matching a rhythm
//   tranche    the dated rows themselves, unchanged
//
// The staggered-purchase ask needs no separate detector: grouping by instrument
// collapses a series whether it was a monthly SIP, a broker working an order
// over five weeks, or two unrelated buys. A DETECTOR would have to decide what
// counts as "a series" — a cadence, a tolerance, a minimum count — and every one
// of those thresholds is a judgement the statements do not state, applied to
// real money. `staggered` below is therefore a LABEL on a row that is already
// collapsed, never a decision about what to merge.
//
// ── EVERY TOTAL SKIPS WHAT WAS NOT REPORTED ────────────────────────────────
//
// `amount` is null where the statement printed no settlement, no net and no
// gross, and `realized` is null on every sell from the sixteen accounts whose
// manager issues no capital gain statement. Both are summed with `sumOrNull`
// and both carry a COVERAGE COUNT, because a realised total over three of a
// manager's nine sells is a different fact from one over all nine, and on screen
// they are the same number.
import { mandateLabel, sumOrNull } from "./analytics";
import type { Txn } from "./ledger";
import type { Account } from "./types";

/**
 * How many rows on one side of one instrument read as a series worth marking.
 *
 * Four, because three is an ordinary week's working of a single order and the
 * label should mean "this was built up over time". It changes NOTHING about
 * what is collapsed — see the note above — so getting it wrong costs a chip,
 * not a figure.
 */
export const STAGGERED_MIN = 4;

export type GroupBy = "manager" | "entity" | "instrument";

/**
 * What the Transactions card is showing.
 *
 * `direct` is NOT a fourth grouping — it is the `instrument` rollup over a
 * FILTERED tape (the accounts the family runs itself), which is why it lives
 * here as a view rather than as a `GroupBy`. `tape` is the raw dated rows.
 *
 * `mine` reads a DIFFERENT SOURCE entirely and touches no `Txn`: the family's
 * own dated capital into each mandate and fund (`BOOK_CAPITAL_MOVES`, via
 * `capitalRollup`). It is the default, because the question this card is asked
 * first is what the FAMILY did — a share a discretionary manager picked is that
 * manager's decision, and it belongs one level down, inside the mandate.
 */
export type TxnView = GroupBy | "mine" | "direct" | "tape";

/** A dated row, plus the group it was filed under. */
export type TrancheRow = Txn;

export type InstrumentRow = {
  key: string;
  security: string;
  securityKey: string;
  buys: number;
  sells: number;
  qtyBought: number;
  qtySold: number;
  /** Settled value, over the rows that report one. Null where none does. */
  bought: number | null;
  sold: number | null;
  /** Rows reporting a settled amount, against rows on that side. */
  boughtOf: number;
  soldOf: number;
  realized: number | null;
  /** Sells carrying a realised figure, against sells. */
  realizedOf: number;
  first: string;
  last: string;
  /** Distinct trade dates — what makes a series a series. */
  days: number;
  staggered: boolean;
  tranches: TrancheRow[];
};

export type GroupRow = {
  key: string;
  label: string;
  /** The second line: whose money, or how the account is run. */
  sublabel: string | null;
  trades: number;
  buys: number;
  sells: number;
  bought: number | null;
  sold: number | null;
  boughtOf: number;
  soldOf: number;
  realized: number | null;
  realizedOf: number;
  securities: number;
  first: string;
  last: string;
  instruments: InstrumentRow[];
};

/** Sum of the reported values only — null when nothing on this side reported one. */
const money = (xs: (number | null)[]) => sumOrNull(xs);

/**
 * WHICH GROUP A TRADE BELONGS TO.
 *
 * Joined to the account registry on PROVIDER + ACCOUNT NUMBER — two fields the
 * statement itself prints and which both sides carry verbatim. Deriving an
 * `accountId` slug from the tape's display label would be re-deriving identity
 * in the presentation layer, which is the failure `securityKey` already refuses
 * once in `ledger.ts`.
 *
 * The label for a PMS account is the MANDATE, qualified by whose money it runs:
 * four pairs of mandates in this book share a strategy name (Goldstandard's
 * Aristos for Ankita and Ajay, SVAN's Velocity, Green Lantern's GLC Growth,
 * V.E.C's Small & Mid-Cap), and unqualified they would draw as identical rows.
 * Everything else is grouped by its PROVIDER, which is how the family names
 * these — "the direct stocks" is the broker, not a mandate.
 */
export const acctKey = (provider: string, accountNo: string) => `${provider}|${accountNo}`;

function groupOf(t: Txn, acc: Account | undefined, by: GroupBy): { key: string; label: string; sublabel: string | null } {
  if (by === "entity") {
    const label = acc?.owner ?? t.account;
    return { key: `owner:${label}`, label, sublabel: null };
  }
  if (by === "instrument") {
    return { key: `sec:${t.securityKey}`, label: t.security, sublabel: null };
  }
  /**
   * MANAGER — through `mandateLabel`, NOT re-derived here.
   *
   * That helper is the one place this app decides what a mandate is called
   * (`strategy || provider`), and it was written because four pairs of mandates
   * in this book share a strategy name. Re-deriving the same expression inline
   * is how `mandateLabelWithOwner` came to exist and be called by nothing while
   * the monitor drew four pairs of identical rows beside it.
   *
   * THE PROVIDER IS ALWAYS IN THE SUBLABEL, and that is not decoration. A
   * strategy name is whatever the manager printed: Molecule's is the single
   * word `GROWTH`, which as a heading over a year's trading names nobody. The
   * second line carries the owner, the house and the account number, so every
   * row identifies its manager whatever the first line happens to say.
   */
  const label = acc ? mandateLabel(acc) : t.provider;
  const house = acc?.provider ?? t.provider;
  const who = [acc?.owner, label === house ? null : house, t.accountNo].filter(Boolean).join(" · ");
  return { key: `acct:${acctKey(t.provider, t.accountNo)}`, label, sublabel: who || t.accountNo };
}

function instrumentRow(key: string, rows: TrancheRow[]): InstrumentRow {
  const buys = rows.filter((r) => r.side === "Buy");
  const sells = rows.filter((r) => r.side === "Sell");
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  return {
    key,
    security: rows[0].security,
    securityKey: rows[0].securityKey,
    buys: buys.length,
    sells: sells.length,
    qtyBought: buys.reduce((s, r) => s + (r.qty || 0), 0),
    qtySold: sells.reduce((s, r) => s + (r.qty || 0), 0),
    bought: money(buys.map((r) => r.amount ?? null)),
    sold: money(sells.map((r) => r.amount ?? null)),
    boughtOf: buys.filter((r) => r.amount != null).length,
    soldOf: sells.filter((r) => r.amount != null).length,
    realized: money(sells.map((r) => r.realized ?? null)),
    realizedOf: sells.filter((r) => r.realized != null).length,
    first: dates[0] ?? "",
    last: dates.at(-1) ?? "",
    days: new Set(dates).size,
    // Marked per SIDE: eight buys and eight sells of one name is two campaigns,
    // and sixteen rows is not evidence that either was staggered.
    staggered: buys.length >= STAGGERED_MIN || sells.length >= STAGGERED_MIN,
    // Newest first, like the tape it came from.
    tranches: [...rows].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/**
 * The tape, rolled up two levels deep.
 *
 * Pure in its arguments — the accounts registry is passed in rather than
 * imported — so the arithmetic can be exercised against a fixture instead of
 * against whatever the current drop happens to contain.
 */
export function rollup(txns: Txn[], accounts: Account[], by: GroupBy): GroupRow[] {
  const acctByKey = new Map(accounts.map((a) => [acctKey(a.provider, a.accountNo), a]));
  const groups = new Map<string, { label: string; sublabel: string | null; rows: Map<string, TrancheRow[]> }>();

  for (const t of txns) {
    const acc = acctByKey.get(acctKey(t.provider, t.accountNo));
    const g = groupOf(t, acc, by);
    const entry = groups.get(g.key) ?? { label: g.label, sublabel: g.sublabel, rows: new Map<string, TrancheRow[]>() };
    // Grouped by instrument, the second level would be one row per group — so
    // it splits by SIDE instead, which is the useful cut there: "everything I
    // bought of this name" beside "everything I sold".
    const inner = by === "instrument" ? `${t.securityKey}|${t.side}` : t.securityKey;
    (entry.rows.get(inner) ?? entry.rows.set(inner, []).get(inner)!).push(t);
    groups.set(g.key, entry);
  }

  const out: GroupRow[] = [];
  for (const [key, g] of groups) {
    const instruments = [...g.rows.entries()]
      .map(([k, rows]) => instrumentRow(k, rows))
      // Biggest committed first — a reader scanning a manager's year wants the
      // position they built, not the alphabet. Absent amounts sort last rather
      // than as zero.
      .sort((a, b) => ((b.bought ?? 0) + (b.sold ?? 0)) - ((a.bought ?? 0) + (a.sold ?? 0)));
    const all = instruments.flatMap((i) => i.tranches);
    const dates = all.map((r) => r.date).filter(Boolean).sort();
    out.push({
      key,
      label: g.label,
      sublabel: g.sublabel,
      trades: all.length,
      buys: all.filter((r) => r.side === "Buy").length,
      sells: all.filter((r) => r.side === "Sell").length,
      // SUMMED FROM THE ROWS THE GROUP RENDERS, never recomputed from the tape.
      // A footer derived independently of the rows above it is the defect the
      // Private Market page shipped: both figures correct on their own terms,
      // and no check able to see the disagreement.
      bought: money(instruments.map((i) => i.bought)),
      sold: money(instruments.map((i) => i.sold)),
      boughtOf: instruments.reduce((s, i) => s + i.boughtOf, 0),
      soldOf: instruments.reduce((s, i) => s + i.soldOf, 0),
      realized: money(instruments.map((i) => i.realized)),
      realizedOf: instruments.reduce((s, i) => s + i.realizedOf, 0),
      securities: new Set(instruments.map((i) => i.securityKey)).size,
      first: dates[0] ?? "",
      last: dates.at(-1) ?? "",
      instruments,
    });
  }

  return out.sort((a, b) => ((b.bought ?? 0) + (b.sold ?? 0)) - ((a.bought ?? 0) + (a.sold ?? 0)));
}

/** The footer, summed from the group rows on screen — never from the tape again. */
export function rollupTotals(groups: GroupRow[]) {
  return {
    groups: groups.length,
    trades: groups.reduce((s, g) => s + g.trades, 0),
    buys: groups.reduce((s, g) => s + g.buys, 0),
    sells: groups.reduce((s, g) => s + g.sells, 0),
    bought: sumOrNull(groups.map((g) => g.bought)),
    sold: sumOrNull(groups.map((g) => g.sold)),
    realized: sumOrNull(groups.map((g) => g.realized)),
    realizedOf: groups.reduce((s, g) => s + g.realizedOf, 0),
    securities: new Set(groups.flatMap((g) => g.instruments.map((i) => i.securityKey))).size,
  };
}
