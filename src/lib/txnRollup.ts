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
import { isMandateHeld, mandateLabel, sumOrNull } from "./analytics";
import type { Txn } from "./ledger";
import type { Account } from "./types";
import { sortRows, type TxnSort } from "./txnSort";

/**
 * How many rows on one side of one instrument read as a series worth marking.
 *
 * Four, because three is an ordinary week's working of a single order and the
 * label should mean "this was built up over time". It changes NOTHING about
 * what is collapsed — see the note above — so getting it wrong costs a chip,
 * not a figure.
 */
export const STAGGERED_MIN = 4;

/**
 * ── HOW A TRADE IS ROLLED UP, AND WHY "auto" IS THE ONLY ONE LEFT ───────────
 *
 * `manager`, `entity` and `instrument` were the three groupings the Transactions
 * card offered as TABS, beside two more views that were not groupings at all.
 * The family asked for that strip to go and for this card to section the way the
 * Holdings table does — Category / Asset class / Basket — so the SECTION is now
 * the axis and the grouping is no longer something a reader picks.
 *
 * `auto` is what the Holdings table already does inside each section, and it is
 * a per-trade choice between the two behaviours that were already here:
 *
 *   • a trade inside a PMS MANDATE rolls up to the mandate, because that is one
 *     row on the Holdings table too — Stage 10L lifted the mandates out of it
 *     into one row each, and a share a discretionary manager chose sits inside
 *     that row rather than beside the family's own;
 *   • every other trade rolls up to its SECURITY, which is what a Holdings row
 *     is everywhere else.
 *
 * So the two tables draw the same row for the same thing, which is the whole of
 * what "standardise them" means here. `manager`, `entity` and `instrument` stay
 * because `rollup` is exercised against fixtures on each of them and because
 * `auto` is defined in terms of two of them — not as views anybody can select.
 */
export type GroupBy = "manager" | "entity" | "instrument" | "auto";

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
  /**
   * The section this row is drawn under — `groupKeyFor`'s answer, supplied by
   * the caller. It is part of the group KEY as well, so a group can never span
   * two sections and be summed into both.
   */
  section: string;
  /**
   * THE ACCOUNT THIS ROW IS ABOUT, where it is about one — a MANDATE row, which
   * is one account by construction. Null on a SECURITY row, which is an
   * instrument dealt across however many accounts carried it, so the account is
   * not a property of it.
   *
   * Taken off the registry entry the rollup already resolved rather than parsed
   * back out of the key: `acct:<provider>|<accountNo>` is a DISPLAY identity the
   * statements print, and re-deriving an `accountId` from it is the
   * identity-in-the-presentation-layer trap `ledger.ts` already refuses once for
   * `securityKey`. `txnLedger.ts` reads it to fill an account's own market
   * value on a mandate that publishes no dated capital record — nine of this
   * book's ten.
   */
  accountId: string | null;
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

function groupOf(t: Txn, acc: Account | undefined, by: GroupBy): { key: string; label: string; sublabel: string | null; accountId: string | null } {
  // AUTO IS NOT A FOURTH RULE — it picks between the two below, per trade, on
  // the one fact that decides it on the Holdings table as well: whether a
  // discretionary manager chose the position or the family did.
  if (by === "auto") return groupOf(t, acc, isMandateHeld(acc?.engagement ?? null) ? "manager" : "instrument");
  if (by === "entity") {
    const label = acc?.owner ?? t.account;
    return { key: `owner:${label}`, label, sublabel: null, accountId: null };
  }
  if (by === "instrument") {
    return { key: `sec:${t.securityKey}`, label: t.security, sublabel: null, accountId: null };
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
  return { key: `acct:${acctKey(t.provider, t.accountNo)}`, label, sublabel: who || t.accountNo, accountId: acc?.accountId ?? null };
}

function instrumentRow(key: string, rows: TrancheRow[], sort: TxnSort): InstrumentRow {
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
    // ORDERED LIKE EVERY LEVEL ABOVE IT. This was newest-first unconditionally,
    // which was right on its own and wrong once the levels above it could be
    // ordered any of three ways: a group set to "longest held" opened on its
    // newest tranche. A tranche has one date, which `sortRows` reads.
    tranches: sortRows(rows.map((r) => ({ ...r })), sort, (r) => r.amount ?? null),
  };
}

/**
 * The tape, rolled up two levels deep.
 *
 * Pure in its arguments — the accounts registry is passed in rather than
 * imported — so the arithmetic can be exercised against a fixture instead of
 * against whatever the current drop happens to contain.
 */
export function rollup(
  txns: Txn[],
  accounts: Account[],
  by: GroupBy,
  sort: TxnSort = "recent",
  /**
   * WHICH SECTION EACH TRADE IS DRAWN UNDER — `groupKeyFor`'s answer, handed in
   * by the caller through `sectionsFor` (`txnAxis.ts`) rather than decided here.
   * Two definitions of "which section is this in" is the failure `holdingBucket`
   * and `groupAxis` were each extracted to stop, and this is the same question
   * arriving at a dated record.
   *
   * Optional, and every row falls in ONE section when it is not supplied, so a
   * caller that does not section (the fixtures, and `ManagerTrades` inside a
   * mandate page, where every row is that mandate's by construction) is
   * unchanged.
   */
  sectionOf: (t: Txn) => string = () => "",
): GroupRow[] {
  const acctByKey = new Map(accounts.map((a) => [acctKey(a.provider, a.accountNo), a]));
  const groups = new Map<string, { section: string; accountId: string | null; label: string; sublabel: string | null; rows: Map<string, TrancheRow[]> }>();

  for (const t of txns) {
    const acc = acctByKey.get(acctKey(t.provider, t.accountNo));
    const g = groupOf(t, acc, by);
    const section = sectionOf(t);
    // THE SECTION IS PART OF THE KEY, so a group can never span two of them.
    // A mandate group cannot anyway — one account, one section — but a SECURITY
    // group can: the same name traded in two accounts whose engagements differ
    // is two sections on the category axis, and one group summed into both
    // would double-count it in whichever footer read the sections.
    const key = `${section}\u0000${g.key}`;
    const entry = groups.get(key)
      ?? { section, accountId: g.accountId, label: g.label, sublabel: g.sublabel, rows: new Map<string, TrancheRow[]>() };
    // Grouped by instrument, the second level would be one row per group — so
    // it splits by SIDE instead, which is the useful cut there: "everything I
    // bought of this name" beside "everything I sold".
    const inner = g.key.startsWith("sec:") ? `${t.securityKey}|${t.side}` : t.securityKey;
    (entry.rows.get(inner) ?? entry.rows.set(inner, []).get(inner)!).push(t);
    groups.set(key, entry);
  }

  const out: GroupRow[] = [];
  for (const [key, g] of groups) {
    // ORDERED BY THE MODE, at this level too. "Biggest committed first" is the
    // `size` mode and is no longer the only one: a reader who asked for recent
    // first wants the name the manager last touched at the top of the
    // expansion, not the largest position they built two years ago. An absent
    // amount still sorts last rather than as zero — `sortRows` uses -Infinity.
    const instruments = sortRows(
      [...g.rows.entries()].map(([k, rows]) => instrumentRow(k, rows, sort)).sort((a, b) => a.key.localeCompare(b.key)),
      sort, (i) => (i.bought == null && i.sold == null ? null : (i.bought ?? 0) + (i.sold ?? 0)));
    const all = instruments.flatMap((i) => i.tranches);
    const dates = all.map((r) => r.date).filter(Boolean).sort();
    out.push({
      key,
      section: g.section,
      accountId: g.accountId,
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

  out.sort((a, b) => a.key.localeCompare(b.key));
  return sortRows(out, sort, (g) => (g.bought == null && g.sold == null ? null : (g.bought ?? 0) + (g.sold ?? 0)));
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

/**
 * ── THE SECTIONS ARE `datedSectionRollup`'S NOW ─────────────────────────────
 *
 * `SectionRows` and `sectionRollup` grouped a `GroupRow[]` under its headings
 * and were the trades table's half of that. One table carries both dated
 * records since Stage 10bm, so a section holds rows of BOTH kinds and
 * `datedSectionRollup` in `txnLedger.ts` is what groups them — this pair had no
 * caller left, which is the dead-code-that-looks-alive failure this repo keeps
 * naming, so it went the way `exportDeck.ts` did rather than being left
 * exported and dead.
 *
 * What did NOT go is `rollupTotals` above: `datedTotals` calls it for the
 * trades half of every section and of the footer, so there is still ONE
 * definition of what a set of trade rollups adds to.
 */
