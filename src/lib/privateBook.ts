// THE PRIVATE MARKET BOOK AS ONE TABLE — every fund, every folio behind it,
// and the capital account each folio sends, in two sections.
//
//   *"Why are these two tables separate they need to be in one master table
//    itself … make one consolidated structured table instead of breaking it
//    into such smaller tables and parts. One table that can show me everything
//    that is required to be seen."*
//
// The page used to draw the same money in five cards: the funds held, the
// capital accounts scheme by scheme, the accounts nothing values, the funds the
// page does not carry, and the calls. They were five views of ONE set of
// folios, so this module builds that set once and every row of the master table
// is read off it — the page cannot show a fund in one card and its capital
// account in another with two different owners, dates or counts.
//
// ── THE ATOM IS THE FOLIO: ONE ACCOUNT'S VIEW OF ONE FUND ───────────────────
//
// A folio carries up to two documents' worth of figures, and they are joined on
// the ACCOUNT, never on a name:
//
//   the HOLDING    units, cost, value — off the fund's holding statement
//   the CAPITAL    committed, called, paid in, still to call — off the same
//                  account's capital-account statement
//
// A fund row is its folios. A family member's row (the By owner view) is theirs.
// The two groupings share every column, so switching between them changes which
// rows are drawn and never what a column means.
//
// ── THE TWO SECTIONS, AND WHY THE SECOND STARTS CLOSED ─────────────────────
//
//   private    the private side of the book with a value — open.
//   unvalued   private accounts whose statement carries NO value: a fund that
//              publishes no NAV, an income-only folio, an account redeemed to
//              nil. *"If this is missing data this needs to be like a hidden
//              drop down clearly marked."* Their capital figures are real and
//              are in the capital totals; their value is absent, never ₹0.
//
// ── AND THERE IS NO THIRD, BECAUSE THE FAMILY PLACED THEIR FUNDS ───────────
//
// This table carried a third section — the capital accounts of AIFs that are
// NOT private market, closed and marked, so the capital columns would add to
// every capital account in the book. The family then classified all fifteen
// capital accounts themselves (Stage 10bw): *"Your dashboard should NOT
// classify these 15 capital accounts as 'private-market funds'"*, and *"private
// market fund needs to be here in private market only"*. A section of
// public-market funds on a private-market page is exactly what that rules out,
// however it is marked. So the page reads only the capital accounts
// `capitalScope` places on the private side, and the ones it leaves out are
// NAMED on the page in one clause — never counted, never dropped silently.
//
// ── THE TWO BASES, AND THE ONE PLACE THEY MEET ─────────────────────────────
//
// A FUND row counts each `dedupeGroup` once (consolidated). Its FOLIOS are each
// statement as printed. Where two statements report one holding, the folios add
// to MORE than the fund row, and the expansion draws that difference as its own
// line — "counted once", in the same columns — so the lines under a row always
// add to the row. A family member's row is on the printed basis (a per-owner
// figure never dedupes), and the section carries the same "counted once" line at
// its foot. Both views then close on the same private total.
//
// The CAPITAL columns are never deduped, in either view: each capital account is
// a separate statement with its own commitment and its own dated calls, and the
// book's commitment register counts every one. Where a holding is counted once
// but its two capital accounts are both counted, the fund row says so.
import type { Account, Commitment, Position } from "./types";
import { sum, sumOrNull, dedupedPositions, isPrivateClass } from "./analytics";
import { type AccountIndex, ownerOf, providerOf } from "./accounts";
import { aifSectionOf, categoriesNamedIn, readsAsPrivateEquity, PRIVATE_EQUITY_SECTION, AIF_UNSTATED_SECTION } from "./aifCategory";
import { COST_COVERAGE_MIN, unvaluedAccounts, type UnvaluedKind } from "./privateMarket";
import type { SchemeCall } from "./capitalCalls";
import { fifoTotals } from "./fifo";

export type BookSectionId = "private" | "unvalued";
export type BookGrouping = "fund" | "owner";
/** Why a folio carries (or does not carry) a value. */
export type FolioStatus = "valued" | UnvaluedKind;

export const BOOK_SECTIONS: readonly BookSectionId[] = ["private", "unvalued"];

/** One account's view of one fund — the atom every row of the table is built from. */
export type BookFolio = {
  /** Unique across the table: the account, and the security it reports. */
  key: string;
  section: BookSectionId;
  status: FolioStatus;
  accountId: string;
  owner: string;
  provider: string;
  accountNo: string;
  asOf: string | null;
  /** The fund this folio is a line of. */
  fundKey: string;
  fundName: string;
  /** The holding's own `securityKey`, for a link to its page. Null with no holding. */
  securityKey: string | null;
  category: string | null;
  // ── THE HOLDING — null where the account reports no valued position ──
  position: Position | null;
  units: number | null;
  cost: number | null;
  value: number | null;
  pnl: number | null;
  /** True where this folio's holding is the one the consolidated total counts. */
  counted: boolean;
  /** How many statements report this same holding — 1 unless it is a dedupe group. */
  alsoCount: number;
  alsoReportedUnder: string[];
  // ── THE CAPITAL ACCOUNT — null where the account sends none ──
  capital: SchemeCall | null;
  /** The book's own words for why nothing values this folio. Never re-worded. */
  reason: string | null;
};

/** What a row, a section or a total adds to — each figure with what it covers. */
export type BookFigures = {
  committed: number | null;
  called: number | null;
  paid: number | null;
  pending: number | null;
  uncalled: number | null;
  /** How many capital accounts sit under this row, and how many print each line. */
  capitalAccounts: number;
  calledOf: number;
  paidOf: number;
  pendingOf: number;
  uncalledOf: number;
  /** Dated calls behind this row, each reconciled against its own statement. */
  calls: number;
  /** Units add only within ONE fund; across funds they are null by construction. */
  units: number | null;
  cost: number | null;
  value: number | null;
  pnl: number | null;
  /** The value of the holdings that report a cost — the numerator any return needs. */
  costedValue: number;
  /** How many holdings are summed into cost/value, and how many report a cost. */
  holdings: number;
  costed: number;
  /** Struck only where the cost side covers essentially the whole value. */
  returnPct: number | null;
  asOf: string[];
  /** Every capital account's committed − called = still to call. Null where none can be struck. */
  ties: boolean | null;
};

export type BookGroup = BookFigures & {
  key: string;
  kind: BookGrouping;
  label: string;
  section: BookSectionId;
  /** The fund's own page, where there is one to link to. */
  securityKey: string | null;
  category: string | null;
  status: FolioStatus;
  folios: BookFolio[];
  /**
   * THE FOLIOS ADD TO MORE THAN THE ROW BY THIS MUCH — two statements reporting
   * one holding. Null where the two agree, which is every row but the ones a
   * dedupe group runs through.
   */
  overlap: Overlap | null;
  /**
   * Days the row's capital accounts are behind the newest capital account in
   * the book — the LEAST stale of them, and only where every capital account
   * under the row is behind at all. One current statement beside a stale one
   * is a mixed row, which is null here and stated per folio instead.
   */
  staleDays: number | null;
};

export type Overlap = {
  /** How many statements the counted-once holdings are reported on. */
  statements: number;
  units: number | null;
  cost: number | null;
  value: number;
  /** As printed, and counted once — the two figures the overlap is the gap between. */
  printed: number;
  consolidated: number;
};

export type BookSection = BookFigures & {
  id: BookSectionId;
  groups: BookGroup[];
  folios: number;
  /**
   * The By owner view's "counted once" line, which sits at the foot of the
   * section because a duplicated holding runs across two MEMBERS. Null in the
   * fund view, where each fund row is already counted once.
   */
  overlap: Overlap | null;
};

export type PrivateBook = {
  grouping: BookGrouping;
  sections: Record<BookSectionId, BookSection>;
  /**
   * The whole table — both sections — on the consolidated basis. Its capital
   * columns are every capital account on the page, which is what the capital
   * tiles add to: there is no capital account on this page outside the two
   * sections, so one total carries both.
   */
  privateTotal: BookFigures;
  /** The consolidated private value — the denominator of every Weight cell. */
  privateValue: number;
  /** Every folio, in no particular order. */
  folios: BookFolio[];
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The category a position-less account's own wording states, on the AIF drill-down's terms. */
function accountCategory(a: Account | undefined): string | null {
  if (!a) return null;
  if (readsAsPrivateEquity({ security: "" }, a)) return PRIVATE_EQUITY_SECTION;
  const cats = categoriesNamedIn(a.providerEngagement);
  return cats.length === 1 ? cats[0] : AIF_UNSTATED_SECTION;
}

/**
 * WHICH SECTION A HOLDING SITS IN, or null if it is not on this page. Only a
 * PRIVATE holding is — the generated `marketSide`, which carries the family's
 * own placing of each fund before the SEBI category (Stage 10bw). A holding on
 * the listed side, or one nothing places, is on the Portfolio Monitor and the
 * sides line under this table says what the rest of the book is worth.
 */
function sectionOf(p: Position): BookSectionId | null {
  return isPrivateClass(p) ? "private" : null;
}

/**
 * EVERY FOLIO ON THE PAGE, with its capital account attached by ACCOUNT.
 *
 * `positions` are the CURRENT holdings the page draws (closed rows and specks
 * already out); `allPositions` is the whole book, which is what decides whether
 * an account holds nothing at all — the question `unvaluedAccounts` asks.
 * `commitments` are the capital accounts ON THIS PAGE — `capitalScope`'s
 * `onPage`, the private-market funds' — and `schemes` are read off the same set.
 *
 * A capital account lands on exactly one folio. Measured on this book every one
 * of the 11 attaches to a folio its own account already carries; one that
 * cannot is not dropped — it becomes a folio of its own in `unvalued`, with the
 * account's own reason, because a commitment nobody can see is the defect this
 * page was built to end.
 */
export function bookFolios(args: {
  positions: Position[];
  allPositions: Position[];
  accounts: Account[];
  commitments: Commitment[];
  accIdx: AccountIndex;
  schemes: SchemeCall[];
}): BookFolio[] {
  const { positions, allPositions, accounts, commitments, accIdx, schemes } = args;
  const schemeOf = new Map(schemes.map((s) => [s.accountId, s]));
  const commitmentOf = new Map(commitments.map((c) => [c.accountId, c]));
  const inScope = positions.filter((p) => sectionOf(p) != null);
  const counted = new Set(dedupedPositions(inScope));
  const groupSize = new Map<string, number>();
  for (const p of inScope) if (p.dedupeGroup) groupSize.set(p.dedupeGroup, (groupSize.get(p.dedupeGroup) ?? 0) + 1);

  const out: BookFolio[] = [];
  const attached = new Set<string>();
  // Largest first, so an account holding two funds hands its capital account to
  // the larger — none does on this book, and the choice is stated rather than
  // left to array order.
  for (const p of [...inScope].sort((a, b) => b.marketValue - a.marketValue)) {
    const a = accIdx.get(p.accountId);
    const cap = !attached.has(p.accountId) ? schemeOf.get(p.accountId) ?? null : null;
    if (cap) attached.add(p.accountId);
    out.push({
      key: `${p.accountId}|${p.securityKey}`,
      section: sectionOf(p)!,
      status: "valued",
      accountId: p.accountId,
      owner: ownerOf(accIdx, p),
      provider: providerOf(accIdx, p),
      accountNo: a?.accountNo ?? "",
      asOf: a?.asOf ?? null,
      fundKey: p.securityKey,
      fundName: p.security,
      securityKey: p.securityKey,
      category: p.assetClass === "AIF" ? aifSectionOf(accIdx, p) : null,
      position: p,
      units: p.quantity,
      cost: p.costBasis,
      value: p.marketValue,
      pnl: p.unrealizedPnL,
      counted: counted.has(p),
      alsoCount: p.dedupeGroup ? groupSize.get(p.dedupeGroup) ?? 1 : 1,
      alsoReportedUnder: p.alsoReportedUnder ?? [],
      capital: cap,
      reason: null,
    });
  }

  // THE ACCOUNTS NOTHING VALUES. Their fund is named from their own paperwork —
  // the capital account's name, then the account's strategy, then its provider —
  // and never matched against a holding elsewhere by name. PRIVATE-MARKET FUNDS
  // ONLY, by the same rule as the capital register (Stage 10bw): Motilal Oswal's
  // Hedged Equity strategy is an AIF holding nothing too, and it is not one.
  for (const u of unvaluedAccounts(accounts, allPositions, commitments).filter((x) => x.side === "private")) {
    const a = u.account;
    const c = commitmentOf.get(a.accountId);
    const name = c?.name || a.strategy || a.provider;
    const cap = !attached.has(a.accountId) ? schemeOf.get(a.accountId) ?? null : null;
    if (cap) attached.add(a.accountId);
    out.push(unvaluedFolio(a, name, u.kind, u.reason, cap, accIdx));
  }
  for (const s of schemes) {
    if (attached.has(s.accountId)) continue;
    const a = accIdx.get(s.accountId);
    attached.add(s.accountId);
    out.push(unvaluedFolio(a, s.fund, "other",
      a?.noPositionsReason ?? "this capital account's statement carries no current holding", s, accIdx, s));
  }
  return out;
}

function unvaluedFolio(
  a: Account | undefined, name: string, status: UnvaluedKind, reason: string | null,
  capital: SchemeCall | null, accIdx: AccountIndex, s?: SchemeCall,
): BookFolio {
  const accountId = a?.accountId ?? s?.accountId ?? "";
  return {
    key: `${accountId}|account`,
    section: "unvalued",
    status,
    accountId,
    owner: a?.owner ?? s?.owner ?? "",
    provider: a?.provider ?? "",
    accountNo: a?.accountNo ?? "",
    asOf: a?.asOf ?? s?.asOf ?? null,
    fundKey: `account:${slug(name)}`,
    fundName: name,
    securityKey: null,
    category: accountCategory(a ?? accIdx.get(accountId)),
    position: null,
    units: null,
    cost: null,
    value: null,
    pnl: null,
    counted: false,
    alsoCount: 1,
    alsoReportedUnder: [],
    capital,
    reason,
  };
}

/**
 * WHAT A SET OF FOLIOS ADDS TO.
 *
 * `consolidated` decides the HOLDING columns only: counted once per dedupe group,
 * or every statement as printed. The capital columns are the same either way —
 * see the note at the top of this file.
 *
 * Every total is `sumOrNull`: a folio whose statement prints no uncalled line
 * contributes nothing, and the coverage count says how many did. A `?? 0` here
 * would report a fund with nothing left to call.
 */
export function figuresOf(folios: BookFolio[], consolidated: boolean): BookFigures {
  const held = folios.filter((f) => f.position && (!consolidated || f.counted));
  const caps = folios.map((f) => f.capital).filter((c): c is SchemeCall => c != null);
  const of = (g: (c: SchemeCall) => number | null) => caps.filter((c) => g(c) != null).length;
  const cost = sumOrNull(held.map((f) => f.cost));
  const value = held.length ? sum(held.map((f) => f.value ?? 0)) : null;
  const pnl = sumOrNull(held.map((f) => f.pnl));
  const costedValue = sum(held.filter((f) => f.cost != null).map((f) => f.value ?? 0));
  const funds = new Set(held.map((f) => f.fundKey));
  const ties = caps.map((c) => c.uncalledTies).filter((t): t is boolean => t != null);
  return {
    committed: caps.length ? sum(caps.map((c) => c.committed)) : null,
    called: sumOrNull(caps.map((c) => c.called)),
    paid: sumOrNull(caps.map((c) => c.paid)),
    pending: sumOrNull(caps.map((c) => c.pending)),
    uncalled: sumOrNull(caps.map((c) => c.uncalled)),
    capitalAccounts: caps.length,
    calledOf: of((c) => c.called),
    paidOf: of((c) => c.paid),
    pendingOf: of((c) => c.pending),
    uncalledOf: of((c) => c.uncalled),
    calls: sum(caps.map((c) => c.calls.length)),
    // Units of two different funds are two different units, so they add only
    // inside one fund — a sum across funds is a number with no unit.
    units: held.length && funds.size === 1 ? sum(held.map((f) => f.units ?? 0)) : null,
    cost,
    value,
    pnl,
    costedValue,
    holdings: held.length,
    costed: held.filter((f) => f.cost != null).length,
    // FIFO, through the one aggregator every other return on the dashboard is
    // struck with (`fifoTotals`): the gain on units a fund has already redeemed
    // stays in the return and what those units cost stays in its denominator —
    // Neo Infra's capital redemption above all. Over the same held set, behind
    // the same coverage gate.
    returnPct: cost != null && cost > 0 && pnl != null && value != null && value > 0
      && costedValue >= value * COST_COVERAGE_MIN
      ? fifoTotals(held.map((f) => f.position!)).returnPct : null,
    asOf: [...new Set(folios.map((f) => f.asOf).filter((d): d is string => !!d))].sort(),
    ties: ties.length ? ties.every(Boolean) : null,
  };
}

/** The gap between a set's printed holding figures and its counted-once ones. */
function overlapOf(folios: BookFolio[]): Overlap | null {
  const printed = figuresOf(folios, false);
  const once = figuresOf(folios, true);
  if (printed.value == null || once.value == null) return null;
  const gap = printed.value - once.value;
  // Above a rupee, so float noise is never a claim.
  if (gap <= 1) return null;
  return {
    statements: folios.filter((f) => f.position && f.alsoCount > 1).length,
    units: printed.units != null && once.units != null ? printed.units - once.units : null,
    cost: printed.cost != null && once.cost != null ? printed.cost - once.cost : null,
    value: gap,
    printed: printed.value,
    consolidated: once.value,
  };
}

const byValueThenPaid = (a: { value: number | null; paid: number | null; committed: number | null }, b: typeof a) =>
  (b.value ?? -1) - (a.value ?? -1) || (b.paid ?? -1) - (a.paid ?? -1) || (b.committed ?? -1) - (a.committed ?? -1);

/**
 * THE TABLE: two sections of rows, grouped by fund or by family member, and the
 * one total every figure on the page ties to.
 */
export function privateBook(folios: BookFolio[], grouping: BookGrouping): PrivateBook {
  const privateValue = figuresOf(folios.filter((f) => f.section === "private"), true).value ?? 0;
  const sections = {} as Record<BookSectionId, BookSection>;
  for (const id of BOOK_SECTIONS) {
    const mine = folios.filter((f) => f.section === id);
    const keyOf = (f: BookFolio) => (grouping === "fund" ? f.fundKey : `owner:${f.owner}`);
    const buckets = new Map<string, BookFolio[]>();
    for (const f of mine) buckets.set(keyOf(f), [...(buckets.get(keyOf(f)) ?? []), f]);
    const consolidated = grouping === "fund";
    const groups: BookGroup[] = [...buckets.entries()].map(([key, fs]) => {
      const sorted = [...fs].sort((a, b) => byValueThenPaid(
        { value: a.value, paid: a.capital?.paid ?? null, committed: a.capital?.committed ?? null },
        { value: b.value, paid: b.capital?.paid ?? null, committed: b.capital?.committed ?? null }));
      const first = sorted[0];
      const stale = sorted.map((f) => f.capital?.staleDays ?? null).filter((d): d is number => d != null);
      const statuses = new Set(sorted.map((f) => f.status));
      return {
        ...figuresOf(sorted, consolidated),
        key,
        kind: grouping,
        label: grouping === "fund" ? first.fundName : first.owner,
        section: id,
        securityKey: grouping === "fund" ? first.securityKey : null,
        category: grouping === "fund" ? first.category : null,
        status: statuses.size === 1 ? first.status : "other",
        folios: sorted,
        overlap: grouping === "fund" ? overlapOf(sorted) : null,
        // The row is stale only where EVERY capital account under it is: one
        // current statement beside a stale one is a mixed row, and the folios
        // say which is which.
        staleDays: stale.length && stale.length === sorted.filter((f) => f.capital).length
          ? Math.min(...stale) : null,
      };
    }).sort(byValueThenPaid);
    sections[id] = {
      ...figuresOf(mine, consolidated),
      id,
      groups,
      folios: mine.length,
      overlap: grouping === "owner" ? overlapOf(mine) : null,
    };
  }
  return {
    grouping,
    sections,
    privateTotal: figuresOf(folios, true),
    privateValue,
    folios,
  };
}
