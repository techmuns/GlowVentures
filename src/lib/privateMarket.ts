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
// the listed side now and this page does not carry them. `pageScopeNote` below
// states every SIDE of the book with its value, so the page says which side it
// is. It used to name the Category III funds one by one as well, in a card of
// their own; the family asked for that card to go ("these kind of placeholders
// are not relevant"), and the funds are in the Portfolio Monitor's AIF section
// and under their own Category III heading in the AIF drill-down.
//
// The one place engagement IS the right key is the opposite question — an
// account that holds NOTHING, so it has no position to read a class off. That is
// `unvaluedAccounts`, and it is scoped to `AIF` deliberately.
//
// ── AND THE CAPITAL ACCOUNTS ARE SCOPED THE SAME WAY NOW ────────────────────
//
//   "private market fund needs to be here in private market only" — sent with
//    the family's own classification of all fifteen capital accounts.
//
// This file used to say the capital-account cards were DELIBERATELY not scoped,
// because a drawdown structure is how an account funds itself and not where it
// invests. That reasoning was right about the structure, and the family agree
// with it word for word — which is exactly why it does not put a public-market
// fund on a private-market page. Carnelian Bharat Amritkaal, Motilal Oswal
// Delphi Equity and both Founders Fund folios call capital against a
// commitment and invest in listed equity: ₹55 Cr of the ₹97.7 Cr register. So
// `capitalScope` places each capital account by what its FUND invests in, on
// the same rule that places its holding (`fundMarketSideOf`), and the page
// NAMES the ones it leaves out rather than dropping them.
import type { Account, Commitment, Position } from "./types";
import {
  sum, sumOrNull, dedupedPositions, isPrivateClass, marketSides,
  type MarketSideRow,
} from "./analytics";
import { type AccountIndex, ownerOf, providerOf } from "./accounts";
import {
  fundMarketSideOf, fundMarketSideBasis,
  type AifCategory, type MarketSide, type MarketSideBasis,
} from "./aifCategory";

/**
 * THE SIDE OF THE FUND AN ACCOUNT HOLDS, read off the account alone — for an
 * account with no position to read `marketSide` from. India SME and Sky
 * Capital publish no NAV, 360 ONE Alternates' folios carry only income, and
 * each still has to land on one side of the page or the other.
 *
 * The account's own strategy names the fund where it prints one (360 ONE
 * Alternates: `360 ONE Special Opportunities Fund - Series 8`); otherwise the
 * provider IS the fund for a single-scheme account. `fundMarketSideOf` also
 * reads the account's engagement wording, which is where the SEBI category is.
 */
export const accountFundSide = (a: Account): MarketSide | null =>
  fundMarketSideOf(a.strategy ?? a.provider, a);

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
  const holdsAnything = new Set(positions.map((p) => p.accountId));
  /**
   * AN AIF ACCOUNT HOLDING NOTHING IS IN SCOPE ONLY IF ITS FUND IS PRIVATE.
   *
   * It used to be every such account, which quietly counted two that are not:
   * 3P's folio (Category III, every class redeemed — so it holds nothing among
   * CURRENT holdings) and Motilal Oswal's Hedged Equity strategy (redeemed to
   * nil, no category printed). Neither is a private-market fund, and both
   * inflated the "N of this page's M private accounts" the tiles print.
   */
  const inScope = accounts.filter(
    (a) => held.has(a.accountId)
      || (a.engagement === "AIF" && !holdsAnything.has(a.accountId) && accountFundSide(a) === "private"),
  );
  return {
    rows,
    dedupedRows,
    accounts: inScope,
    doubleCounted: sum(rows.map((p) => p.marketValue)) - sum(dedupedRows.map((p) => p.marketValue)),
  };
}

/**
 * ── WHICH SIDE OF THE BOOK THIS PAGE IS ────────────────────────────────────
 *
 * The private book is one side of a THREE-way split, so a page scoped to it
 * leaves out two other sides — and both are stated with their value, or the
 * page reads as the whole of the family's fund holdings.
 *
 * The figures RECONSTRUCT the consolidated book. That is the claim a reader
 * acts on and no single figure can make it alone, which is why this returns the
 * parts rather than a sentence.
 *
 * IT ALSO NAMED THE FUNDS ON THE OTHER TWO SIDES, one by one, for a card
 * headed "Funds this page does not carry". The family asked for that card to go
 * and the two lists went with it rather than being left computing the right
 * answer into no caller — the dead-code-that-looks-alive failure this repo keeps
 * naming. The sides survive, because the line under the fund table prints them.
 */
export type PageScopeNote = {
  /** Every side of the book, in order, with its own reason. */
  sides: MarketSideRow[];
  /** The consolidated book these sides partition. */
  bookMV: number;
};

export function pageScopeNote(positions: Position[]): PageScopeNote {
  const deduped = dedupedPositions(positions);
  return {
    sides: marketSides(deduped),
    bookMV: sum(deduped.map((p) => p.marketValue)),
  };
}

/**
 * ── WHICH CAPITAL ACCOUNTS BELONG ON A PRIVATE-MARKET PAGE ──────────────────
 *
 * A capital account is placed by what its FUND invests in, through the same
 * `fundMarketSideOf` that places the fund's holding — so a fund's holding and
 * its capital account cannot land on different sides of the page.
 * `marketSide.test.ts` asserts that on every capital account whose fund also
 * reports a holding.
 *
 * THE ONES LEFT OUT ARE RETURNED, NOT DROPPED. They are real commitments the
 * family signed; the page names each with what it committed, what has been
 * called and what is left, because a reader who knows they committed ₹30 Cr to
 * Founders and cannot find it here learns that the dashboard lost it.
 */
export type CapitalElsewhere = {
  commitment: Commitment;
  side: MarketSide | null;
  basis: MarketSideBasis;
  invests: string | null;
};

export function capitalScope(commitments: Commitment[], accounts: Account[]): {
  onPage: Commitment[];
  elsewhere: CapitalElsewhere[];
} {
  const acc = new Map(accounts.map((a) => [a.accountId, a]));
  const onPage: Commitment[] = [];
  const elsewhere: CapitalElsewhere[] = [];
  for (const c of commitments) {
    const b = fundMarketSideBasis(c.name, acc.get(c.accountId));
    if (b.side === "private") onPage.push(c);
    else elsewhere.push({ commitment: c, side: b.side, basis: b.basis, invests: b.decision?.invests ?? null });
  }
  return { onPage, elsewhere };
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
  const of = (k: "committed" | "drawn" | "undrawn") =>
    commitments.filter((c) => c[k] != null).length;
  return {
    committed: sumOrNull(commitments.map((c) => c.committed)),
    drawn: sumOrNull(commitments.map((c) => c.drawn)),
    undrawn: sumOrNull(commitments.map((c) => c.undrawn)),
    distributed: sumOrNull(commitments.map(distributionOf)),
    committedOf: of("committed"),
    drawnOf: of("drawn"),
    undrawnOf: of("undrawn"),
    distributedOf: commitments.filter((c) => distributionOf(c) != null).length,
    count: commitments.length,
  };
}

/**
 * ONE FUND'S DISTRIBUTION TOTAL — what its statement prints as distributed.
 *
 * `distributed` where the reader captured the summary figure. Baring's reader
 * never did, although its statement prints one — `Less: Distribution (E)` in
 * the NAV summary — and that page always said the fund printed "no
 * distribution line", which was false. Since the payout reader (Stage 10bw)
 * reconciles Baring's dated distribution against exactly that E, the income
 * and principal it carries ARE that printed total, so this reads them there.
 *
 * Equalisation is NOT a distribution and is not counted here: the statements
 * print it apart from the distribution total (Neo Infra's `Net Equalisation`
 * beside its `Total Payout`, Baring's compensating contribution "NOT PART OF
 * NAV"). The money-weighted return counts it, because it is cash the family
 * received; a distribution total does not, because the fund does not call it
 * one.
 *
 * NULL where neither is carried — never 0, which would report a fund that has
 * returned nothing on the strength of a figure this book does not hold.
 */
export function distributionOf(c: Commitment): number | null {
  if (c.distributed != null) return c.distributed;
  if (c.payouts == null) return null;
  return c.payouts.filter((p) => p.kind !== "equalisation").reduce((t, p) => t + p.gross, 0);
}

/**
 * Why an account in this book holds nothing. The three are never conflated —
 * a reader acts differently on each, and only one of them is a defect.
 */
export type UnvaluedKind = "no-nav" | "income-only" | "redeemed" | "other";

export type UnvaluedAccount = {
  account: Account;
  /**
   * WHAT THE ACCOUNT'S FUND INVESTS IN — `accountFundSide`, since an account
   * holding nothing has no position to read a side off. The Private Market page
   * lists only the private ones: Motilal Oswal's Hedged Equity strategy is an
   * AIF holding nothing too, and it is not a private-market fund.
   */
  side: MarketSide | null;
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
      side: accountFundSide(a),
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
