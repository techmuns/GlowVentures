// The private book, derived once so the page and its test read the same numbers.
//
// WHY A MODULE AND NOT INLINE IN THE PAGE. Every figure here is one a reader
// checks against a fund's own capital account, and several of them are the exact
// figures this repo has been bitten by before — the ₹3.17 Cr double count, the
// drawn capital nothing values, an `undrawn` that is null on two folios and a
// measured nil on seven. A helper that returns the right number into no caller
// looks exactly like a working feature, so these are unit-tested against the
// real book (`src/lib/__tests__/privateMarket.test.ts`) rather than eyeballed on
// a screen. Every function takes its inputs as ARGUMENTS — no module-level
// import of the book — so the test can also feed a fixture and prove the
// null-handling, which real data alone cannot do.
//
// THE AXIS IS THE HOLDING'S OWN MARKET SIDE, NEVER THE ACCOUNT'S ENGAGEMENT.
// `isPrivateClass` is `marketSide === "private"` — read from the SEBI category
// the statements print (`shared/aifCategory.mjs`). Keying on
// `Account.engagement === "AIF"` instead would be wrong in both directions on
// this book: three private holdings sit in accounts whose engagement is
// `Distribution` (both 360 ONE CRNs) or `Direct` (the ICICI NSDL demat row), and
// both Buoyant accounts carry engagement `AIF` with a cash sleeve row that is
// not a private holding at all.
//
// ── AND IT USED TO BE THE ASSET CLASS, WHICH PUT ₹297.78 Cr HERE WRONGLY ────
//
//   "Sanshi, Buoyant and Carnelian. These are not private market investments.
//    They should come under AIFs. In fact they are already in AIF."
//
// Every AIF was private, so this page claimed the Category III folios — open-
// ended funds trading listed securities, 84% of what it showed. They are on
// the listed side now and this page does not carry them. What it must NOT do is
// drop them silently: `pageScopeNote` below names them with their value and
// says where they are shown, because a reader who knows they hold Sanshi and
// cannot find it here learns that the dashboard lost it.
//
// The one place engagement IS the right key is the opposite question — an
// account that holds NOTHING, so it has no position to read a class off. That is
// `unvaluedAccounts`, and it is scoped to `AIF` deliberately.
import type { Account, Commitment, Position } from "./types";
import {
  sum, sumOrNull, dedupedPositions, isPrivateClass, isUnplacedSide, marketSides,
  type MarketSideRow,
} from "./analytics";
import { type AccountIndex, ownerOf, providerOf } from "./accounts";

/**
 * How much of a row set's market value must carry a cost before a return is
 * struck over it.
 *
 * This is the Morning CIO allocation footer's own test, reused rather than
 * re-invented: a percentage across an Invested column covering one set of
 * holdings and a Value column covering another divides one set by the other and
 * prints a number neither claims. On this book it keeps the fund rows that are
 * fully costed and correctly refuses the two that are not.
 */
export const COST_COVERAGE_MIN = 0.995;

/** The private rows, raw and deduped, plus the accounts they touch. */
export type PrivateScope = {
  /** EVERY private row as its own statement prints it — 21 today. Never deduped. */
  rows: Position[];
  /** Each dedupeGroup counted once — 19 today. The basis for every book-wide figure. */
  dedupedRows: Position[];
  /** Accounts holding a private row, PLUS AIF-engagement accounts holding nothing. */
  accounts: Account[];
  /** What the rows on screen add to, less what the consolidated total counts. */
  doubleCounted: number;
};

export function privateScope(positions: Position[], accounts: Account[]): PrivateScope {
  const rows = positions.filter(isPrivateClass);
  const dedupedRows = dedupedPositions(positions).filter(isPrivateClass);
  const held = new Set(rows.map((p) => p.accountId));
  const inScope = accounts.filter(
    (a) => held.has(a.accountId) || (a.engagement === "AIF" && !positions.some((p) => p.accountId === a.accountId)),
  );
  return {
    rows,
    dedupedRows,
    accounts: inScope,
    doubleCounted: sum(rows.map((p) => p.marketValue)) - sum(dedupedRows.map((p) => p.marketValue)),
  };
}

/**
 * ── WHAT THIS PAGE DOES NOT CARRY, AND WHY ─────────────────────────────────
 *
 * The private book is one side of a THREE-way split, so a page scoped to it
 * leaves out two other sides — and both have to be named with their value or
 * the page reads as the whole of the family's fund holdings.
 *
 * The three figures RECONSTRUCT the consolidated book. That is the claim a
 * reader acts on and no single figure can make it alone, which is why this
 * returns the parts rather than a sentence.
 */
export type PageScopeNote = {
  /** Every side of the book, in order, with its own reason. */
  sides: MarketSideRow[];
  /** The consolidated book these sides partition. */
  bookMV: number;
  /**
   * AIF HOLDINGS ON THE LISTED SIDE — the funds this page used to claim.
   * Named, because they are the specific thing the family asked about.
   */
  listedFunds: { securities: string[]; mv: number; count: number };
  /** Holdings no statement places on either side. */
  unplaced: { securities: string[]; mv: number; count: number };
};

export function pageScopeNote(positions: Position[]): PageScopeNote {
  const deduped = dedupedPositions(positions);
  const pick = (rows: Position[]) => ({
    securities: [...new Set(rows.map((p) => p.security))].sort(),
    mv: sum(rows.map((p) => p.marketValue)),
    count: rows.length,
  });
  return {
    sides: marketSides(deduped),
    bookMV: sum(deduped.map((p) => p.marketValue)),
    // Scoped to AIF deliberately: a company share on the listed side is not
    // something a reader would look for on a private-market page, and listing
    // every listed holding here would bury the three funds that matter.
    listedFunds: pick(deduped.filter((p) => p.assetClass === "AIF" && p.marketSide === "listed")),
    unplaced: pick(deduped.filter(isUnplacedSide)),
  };
}

export type FundRow = {
  securityKey: string;
  security: string;
  /** Who REPORTS it — a depository or a distributor, not necessarily its manager. */
  providers: string[];
  /**
   * HOW MANY FOLIOS REPORT THIS FUND — a PER-ACCOUNT count, struck over the RAW
   * rows and never over the deduped ones.
   *
   * §"a consolidated figure counts each `dedupeGroup` ONCE; a per-account or
   * per-owner figure does not". Counted off the deduped set this reads 1 for
   * the two holdings two members' statements both report, over a breakdown that
   * lists both — which is exactly the defect that once put "Held in 1 entity"
   * above a table of two CRNs, arriving one page over. The row's MONEY stays
   * consolidated; only this count is raw, and the two differing is what the
   * expansion names in rupees.
   */
  folios: number;
  /** Distinct statement dates behind the row, ascending. A group can span two. */
  asOf: string[];
  units: number;
  /** NULL where no statement reports a cost — never 0, and never blended in as one. */
  cost: number | null;
  mv: number;
  pnl: number | null;
  /** The market value of the rows that HAVE a cost — the numerator of any ratio. */
  costedMV: number;
  /** Non-null only where the cost side covers essentially the whole row. */
  returnPct: number | null;
};

/**
 * One row per FUND, each holding counted once however many members report it.
 *
 * `rawRows` is REQUIRED and feeds exactly one field — `folios`, which is a count
 * of statements and therefore must not dedupe. Required rather than optional so
 * no caller can quietly get the deduped count back: an optional parameter that
 * changes a figure is the trap this book has paid for before.
 */
export function fundRollup(dedupedRows: Position[], accIdx: AccountIndex, rawRows: Position[]): FundRow[] {
  const groups = new Map<string, Position[]>();
  for (const p of dedupedRows) {
    const g = groups.get(p.securityKey) ?? [];
    g.push(p);
    groups.set(p.securityKey, g);
  }
  const statements = new Map<string, number>();
  for (const p of rawRows) statements.set(p.securityKey, (statements.get(p.securityKey) ?? 0) + 1);
  return [...groups.values()]
    .map((g) => {
      const cost = sumOrNull(g.map((p) => p.costBasis));
      const mv = sum(g.map((p) => p.marketValue));
      const pnl = sumOrNull(g.map((p) => p.unrealizedPnL));
      const costedMV = sum(g.filter((p) => p.costBasis != null).map((p) => p.marketValue));
      return {
        securityKey: g[0].securityKey,
        security: g[0].security,
        providers: [...new Set(g.map((p) => providerOf(accIdx, p)))],
        folios: statements.get(g[0].securityKey) ?? g.length,
        asOf: [...new Set(g.map((p) => accIdx.get(p.accountId)?.asOf).filter(Boolean) as string[])].sort(),
        units: sum(g.map((p) => p.quantity)),
        cost,
        mv,
        pnl,
        costedMV,
        returnPct:
          cost != null && cost > 0 && pnl != null && mv > 0 && costedMV >= mv * COST_COVERAGE_MIN
            ? (pnl / cost) * 100
            : null,
      };
    })
    .sort((a, b) => b.mv - a.mv);
}

export type FolioRow = {
  position: Position;
  accountId: string;
  owner: string;
  provider: string;
  accountNo: string;
  asOf: string | null;
  /**
   * How many ACCOUNTS report this same holding — computed over the RAW set.
   *
   * Over the deduped set this can never exceed 1, which is the defect that put
   * "Held in 1 entity" above a table listing two CRNs. A count of the statements
   * carrying a name is a per-account figure and must not dedupe.
   */
  alsoCount: number;
  alsoReportedUnder: string[];
};

/** Every private row as printed, with the duplicate count struck on the raw set. */
export function folioRows(rows: Position[], accIdx: AccountIndex): FolioRow[] {
  const byGroup = new Map<string, number>();
  for (const p of rows) {
    if (!p.dedupeGroup) continue;
    byGroup.set(p.dedupeGroup, (byGroup.get(p.dedupeGroup) ?? 0) + 1);
  }
  return rows
    .map((p) => {
      const a = accIdx.get(p.accountId);
      return {
        position: p,
        accountId: p.accountId,
        owner: ownerOf(accIdx, p),
        provider: providerOf(accIdx, p),
        accountNo: a?.accountNo ?? "",
        asOf: a?.asOf ?? null,
        alsoCount: p.dedupeGroup ? byGroup.get(p.dedupeGroup) ?? 1 : 1,
        alsoReportedUnder: p.alsoReportedUnder ?? [],
      };
    })
    .sort((a, b) => b.position.marketValue - a.position.marketValue);
}

export type OwnerRow = { owner: string; rows: number; mv: number; cost: number | null };

/**
 * Per-owner subtotals — DELIBERATELY NOT DEDUPED.
 *
 * These add to the raw ₹355.52 Cr rather than the consolidated ₹352.35 Cr, and
 * that is the correct arithmetic: each member's row is their own statement as
 * printed. Deduping here is the mirror failure that once emptied Bharat's
 * 360 ONE row to ₹0 for an account holding ₹1.46 Cr.
 */
export function ownerRollup(rows: Position[], accIdx: AccountIndex): OwnerRow[] {
  const by = new Map<string, Position[]>();
  for (const p of rows) {
    const who = ownerOf(accIdx, p);
    const g = by.get(who) ?? [];
    g.push(p);
    by.set(who, g);
  }
  return [...by.entries()]
    .map(([owner, g]) => ({
      owner,
      rows: g.length,
      mv: sum(g.map((p) => p.marketValue)),
      cost: sumOrNull(g.map((p) => p.costBasis)),
    }))
    .sort((a, b) => b.mv - a.mv);
}

export type CommitmentTotals = {
  committed: number | null;
  drawn: number | null;
  undrawn: number | null;
  distributed: number | null;
  /** How many of the register's rows each total actually covers. */
  committedOf: number;
  drawnOf: number;
  undrawnOf: number;
  distributedOf: number;
  count: number;
};

/**
 * The capital-account register's totals, each with the rows it covers.
 *
 * `undrawn` is summed AS PRINTED and never derived from committed − drawn. Two
 * folios here print a commitment and a drawdown and no undrawn figure at all; a
 * derived zero there would assert the fund has nothing left to call, and a
 * `?? 0` would do the same. They are skipped, and the caption says 13 of 15.
 */
export function commitmentTotals(commitments: Commitment[]): CommitmentTotals {
  const of = (k: "committed" | "drawn" | "undrawn" | "distributed") =>
    commitments.filter((c) => c[k] != null).length;
  return {
    committed: sumOrNull(commitments.map((c) => c.committed)),
    drawn: sumOrNull(commitments.map((c) => c.drawn)),
    undrawn: sumOrNull(commitments.map((c) => c.undrawn)),
    distributed: sumOrNull(commitments.map((c) => c.distributed)),
    committedOf: of("committed"),
    drawnOf: of("drawn"),
    undrawnOf: of("undrawn"),
    distributedOf: of("distributed"),
    count: commitments.length,
  };
}

/**
 * Why an account in this book holds nothing. The three are never conflated —
 * a reader acts differently on each, and only one of them is a defect.
 */
export type UnvaluedKind = "no-nav" | "income-only" | "redeemed" | "other";

export type UnvaluedAccount = {
  account: Account;
  kind: UnvaluedKind;
  /** The book's own reason string, rendered verbatim. Never re-worded here. */
  reason: string | null;
  /** Capital actually paid against this folio, where a capital account states it. */
  drawn: number | null;
  undrawn: number | null;
};

const kindOf = (reason: string | null | undefined): UnvaluedKind => {
  const r = reason ?? "";
  if (/publishes no NAV/i.test(r)) return "no-nav";
  if (/report income and distribution/i.test(r)) return "income-only";
  if (/redeemed/i.test(r)) return "redeemed";
  return "other";
};

/**
 * The private accounts no statement values — the strongest reason this page
 * exists, because their drawn capital appears on no holdings table anywhere.
 *
 * Scoped to `engagement === "AIF"` because an account with no position has no
 * asset class to read (see the note at the top of this file). The book's other
 * position-less accounts are demat accounts and belong to Portfolio Monitor.
 */
export function unvaluedAccounts(
  accounts: Account[],
  positions: Position[],
  commitments: Commitment[],
): UnvaluedAccount[] {
  const held = new Set(positions.map((p) => p.accountId));
  const byAccount = new Map(commitments.map((c) => [c.accountId, c]));
  return accounts
    .filter((a) => a.engagement === "AIF" && !held.has(a.accountId))
    .map((a) => ({
      account: a,
      kind: kindOf(a.noPositionsReason),
      reason: a.noPositionsReason ?? null,
      drawn: byAccount.get(a.accountId)?.drawn ?? null,
      undrawn: byAccount.get(a.accountId)?.undrawn ?? null,
    }))
    .sort((a, b) => (b.drawn ?? 0) - (a.drawn ?? 0));
}

/**
 * Capital paid into funds that value nothing — ₹18.23 Cr across 7 accounts here.
 *
 * It is real money and it is in NO total on this page: adding it to the private
 * market value would report what was PAID as what the stake is WORTH, which is
 * the fabrication rule applied to a drawdown fund.
 */
export const unvaluedDrawn = (unvalued: UnvaluedAccount[]): number | null =>
  sumOrNull(unvalued.map((u) => u.drawn));
