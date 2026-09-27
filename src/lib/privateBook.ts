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
//              publishes no NAV, an income-only folio no valued holding can be
//              shown to be a view of, an account redeemed to nil. On this book
//              that is the funds that publish no NAV alone — the set the AIF
//              drill-down names too (`isValuedByNoStatement`), because an
//              income-only folio that ties to a holding is a line of that
//              holding's row. *"If this is missing data this needs to be like a hidden
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
// ── AND A CAPITAL ACCOUNT IS COUNTED ONCE WHERE ITS HOLDING IS ─────────────
//
// The capital columns used to be every statement as printed on EVERY row, while
// the holding columns beside them counted a dedupe group once. On Transition
// Venture Capital Fund I — reported by both family trusts — the fund row then
// read ₹3 Cr committed and ₹1.5 Cr paid in beside ONE holding's 7,500 units,
// ₹75 L cost and ₹1.71 Cr value: a reader dividing the value by its own Paid in
// got +14.3% against a printed +128.6%. One half of that row was wrong whichever
// way the family answers whether the two trusts hold one investment or two.
//
// So a CONSOLIDATED row counts a capital account once with its holding
// (`capitalCountedOnce` in `privateMarket.ts`, the one rule the tiles read too),
// and a PRINTED row — each folio line, each family member — shows every
// statement's own capital. The "Counted once" line under a fund carries the
// capital difference as well as the holding difference, so the folios add to
// the fund row through it in EVERY column, and the family's answer moves both
// halves together: take the `dedupeGroup` off the pair and both holdings and
// both capital accounts are counted, with no change here.
//
// ── AN INCOME-ONLY FOLIO IS A LINE UNDER THE HOLDING IT IS A VIEW OF ────────
//
// 360 ONE Alternates' two folios report the income a fund distributed and no
// valuation; their units ARE valued, by 360 ONE Private Wealth, in the Private
// funds section. They used to stand in "Not valued" as a fund of their own —
// one fund in two sections, and a capital call keyed two ways. They are lines
// of the valued row now (`incomeOnlyViewOf`, a committed join checked against
// the book's own unit count), carrying no holding figure of their own: their
// units are already counted on the line above.
import type { Account, Commitment, Position } from "./types";
import { sum, sumOrNull, dedupedPositions, isPrivateClass, currentHoldings } from "./analytics";
import { type AccountIndex, accountIndex, ownerOf, providerOf } from "./accounts";
import { aifSectionOf, categoriesNamedIn, readsAsPrivateEquity, PRIVATE_EQUITY_SECTION, AIF_UNSTATED_SECTION } from "./aifCategory";
import {
  COST_COVERAGE_MIN, unvaluedAccounts, incomeOnlyViewOf, capitalCountedOnce, distributionOf, privateCapital, type UnvaluedKind,
} from "./privateMarket";
import { schemeCalls, type SchemeCall } from "./capitalCalls";
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
  /**
   * WHETHER A CONSOLIDATED FIGURE COUNTS THIS FOLIO'S CAPITAL ACCOUNT — false
   * only where its holding is the second statement of a dedupe group whose
   * capital another folio's account already carries (`capitalCountedOnce`).
   * A printed figure — a folio line, a family member — counts it regardless.
   */
  capitalCounted: boolean;
  /** The account whose capital account stands for this one's, where it is not counted. */
  capitalCountedAs: string | null;
  /**
   * AN INCOME-ONLY VIEW: the account whose statement values these units. Set
   * only on a folio folded under the valued holding it is a view of; it carries
   * no holding figure of its own, because its units are that line's.
   */
  viewOf: string | null;
  /**
   * ── WHAT THIS FOLIO'S OWN PAPERS SAY THE FUND PAID BACK (B-10) ─────────
   *
   * A capital account's distribution total (`distributionOf` — income and
   * principal, gross of TDS, never equalisation), or an income-only folio's own
   * distribution letters, summed exactly as each prints the cash: 360 ONE's
   * letter prints its ₹7,15,619 NET of expenses and TDS and no gross figure, so
   * that is the figure, and `distributedBasis` says so. NULL where nothing this
   * book reads reports one — never 0, which would say the fund returned nothing.
   */
  distributed: number | null;
  distributedBasis: DistributionBasis | null;
  /**
   * WHETHER A CONSOLIDATED TOTAL COUNTS IT. The same rule as the capital
   * account: a capital account's distribution goes with `capitalCounted`, and
   * an income-only folio's with the holding it is a view of — so 360 ONE's two
   * folios, reporting one ₹7,15,619 on one 9,90,429.684 units, count it once,
   * on the line whose holding the consolidated book counts.
   */
  distributionCounted: boolean;
  /** The folio whose distribution stands for this one's, where it is not counted. */
  distributionCountedAs: string | null;
  /** The book's own words for why nothing values this folio. Never re-worded. */
  reason: string | null;
};

/**
 * How a folio's distribution figure is struck: off a capital account (gross of
 * TDS, as its statement's distribution total prints it), or off the fund's own
 * distribution letter to an income-only folio (the cash, as the letter prints
 * it). Said on the page, because the two are different bases added together.
 */
export type DistributionBasis = "capital-account" | "letter";

/**
 * A dated distribution a fund paid to one account, read from its own letter —
 * `BOOK_CORPORATE_ACTIONS` carries exactly these. Only `kind: "distribution"`
 * is read, and only against the fund the folio is a line of.
 */
export type DistributionRecord = {
  accountId: string;
  securityKey: string;
  kind: string | null;
  amount: number | null;
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
  /**
   * Capital accounts under this row that a CONSOLIDATED figure leaves out,
   * because each is the second statement of a holding counted once. Always 0 on
   * a printed row. Counted apart so a caption can say "10 capital accounts, 1
   * more reported twice" rather than a fraction of a set that does not exist.
   */
  capitalAlso: number;
  calledOf: number;
  paidOf: number;
  pendingOf: number;
  uncalledOf: number;
  /** Dated calls behind this row, each reconciled against its own statement. */
  calls: number;
  /**
   * WHAT THE FUNDS PAID BACK, on the row's basis (B-10) — summed over the
   * folios that could report it (a capital account, or an income-only folio's
   * letter), each once on a consolidated row. `distributedOf` of
   * `distributionAccounts` say how many report a figure; null where none does.
   */
  distributed: number | null;
  distributedOf: number;
  distributionAccounts: number;
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
  /**
   * THE CAPITAL THE CONSOLIDATED ROW LEAVES OUT — the second statement's own
   * commitment, calls and still-to-call, where its holding is counted once.
   * Null where the gap has no such capital, never 0 standing for "none".
   */
  committed: number | null;
  called: number | null;
  paid: number | null;
  uncalled: number | null;
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
  /** The funds' own distribution letters (`BOOK_CORPORATE_ACTIONS`); absent reads as none. */
  distributions?: DistributionRecord[];
}): BookFolio[] {
  const { positions, allPositions, accounts, commitments, accIdx, schemes } = args;
  const letters = (args.distributions ?? []).filter((d) => d.kind === "distribution" && d.amount != null);
  const schemeOf = new Map(schemes.map((s) => [s.accountId, s]));
  const commitmentOf = new Map(commitments.map((c) => [c.accountId, c]));
  const inScope = positions.filter((p) => sectionOf(p) != null);
  const counted = new Set(dedupedPositions(inScope));
  const groupSize = new Map<string, number>();
  for (const p of inScope) if (p.dedupeGroup) groupSize.set(p.dedupeGroup, (groupSize.get(p.dedupeGroup) ?? 0) + 1);
  /**
   * WHICH CAPITAL ACCOUNTS A CONSOLIDATED FIGURE COUNTS — struck over the same
   * holdings, in the same book order, as `counted` above, so the capital that
   * stands for a dedupe group is the capital of the member whose holding does.
   */
  const alsoCapital = new Map(capitalCountedOnce(commitments, inScope).alsoReported
    .map((x) => [x.commitment.accountId, x.countedAs]));

  const out: BookFolio[] = [];
  const attached = new Set<string>();
  const capitalOf = (accountId: string) => {
    const cap = !attached.has(accountId) ? schemeOf.get(accountId) ?? null : null;
    if (cap) attached.add(accountId);
    const capCounted = !!cap && !alsoCapital.has(accountId);
    const capCountedAs = cap ? alsoCapital.get(accountId) ?? null : null;
    // A capital account's distribution total goes wherever its capital does.
    const c = cap ? commitmentOf.get(accountId) : undefined;
    const distributed = c ? distributionOf(c) : null;
    return {
      capital: cap,
      capitalCounted: capCounted,
      capitalCountedAs: capCountedAs,
      distributed,
      distributedBasis: distributed != null ? ("capital-account" as const) : null,
      distributionCounted: capCounted,
      distributionCountedAs: capCountedAs,
    };
  };
  // Largest first, so an account holding two funds hands its capital account to
  // the larger — none does on this book, and the choice is stated rather than
  // left to array order.
  for (const p of [...inScope].sort((a, b) => b.marketValue - a.marketValue)) {
    const a = accIdx.get(p.accountId);
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
      ...capitalOf(p.accountId),
      viewOf: null,
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
    /**
     * AN INCOME-ONLY FOLIO THAT TIES TO A VALUED HOLDING IS A LINE OF THAT
     * HOLDING'S ROW — its fund, its section, its capital-call key — and carries
     * no holding figure: the units are counted on the valued line. One that does
     * not tie stays in "Not valued" with its own reason, never under a row it no
     * longer ties to.
     */
    const view = u.kind === "income-only" ? incomeOnlyViewOf(a, inScope, accIdx) : null;
    if (view) {
      const p = view.position;
      // ITS OWN LETTERS — the account's, never another account's. The letter
      // names the fund in its own words (`…series-8-class-a3`, where the valued
      // holding's statement prints `…class-a3-aif-category-ii`), so it is joined
      // on the ACCOUNT, which the committed view table already ties to this
      // holding on the paper's units. An account whose letters name more than
      // one fund cannot say which is this one, and attributes none.
      const mine = letters.filter((d) => d.accountId === a.accountId);
      const oneFund = new Set(mine.map((d) => d.securityKey)).size <= 1;
      const paid = mine.length && oneFund ? sum(mine.map((d) => d.amount!)) : null;
      out.push({
        key: `${a.accountId}|view`,
        section: sectionOf(p)!,
        status: "income-only",
        accountId: a.accountId,
        owner: a.owner,
        provider: a.provider,
        accountNo: a.accountNo,
        asOf: a.asOf ?? null,
        fundKey: p.securityKey,
        fundName: p.security,
        securityKey: p.securityKey,
        category: p.assetClass === "AIF" ? aifSectionOf(accIdx, p) : null,
        position: null,
        units: null,
        cost: null,
        value: null,
        pnl: null,
        counted: false,
        alsoCount: 1,
        alsoReportedUnder: [],
        ...capitalOf(a.accountId),
        viewOf: p.accountId,
        distributed: paid,
        distributedBasis: paid != null ? "letter" : null,
        // Decided once every folio is built, below: which of a holding's views
        // stands for the distribution its letters all report.
        distributionCounted: paid != null,
        distributionCountedAs: null,
        reason: u.reason,
      });
      continue;
    }
    const c = commitmentOf.get(a.accountId);
    const name = c?.name || a.strategy || a.provider;
    out.push(unvaluedFolio(a, name, u.kind, u.reason, capitalOf(a.accountId), accIdx));
  }
  for (const s of schemes) {
    if (attached.has(s.accountId)) continue;
    const a = accIdx.get(s.accountId);
    out.push(unvaluedFolio(a, s.fund, "other",
      a?.noPositionsReason ?? "this capital account's statement carries no current holding", capitalOf(s.accountId), accIdx, s));
  }
  /**
   * ── ONE DISTRIBUTION, HOWEVER MANY VIEWS OF THE HOLDING REPORT IT ────────
   *
   * Two income-only folios that are views of ONE holding counted once (a dedupe
   * group) report one distribution between them — 360 ONE's letters to 1000632
   * and 1000633 print the same ₹7,15,619 on the same 9,90,429.684 units. The
   * consolidated total counts it once: with the view of the holding the book
   * counts, and where that view reports none, with the first that does — the
   * rule `capitalCountedOnce` applies to a capital account. The others say
   * which folio stands for theirs, and a printed row still shows each.
   */
  const viewPos = new Map<string, Position>();
  for (const p of inScope) viewPos.set(p.accountId + "|" + p.securityKey, p);
  const groupOfView = (f: BookFolio) => {
    const p = f.viewOf ? viewPos.get(f.viewOf + "|" + f.fundKey) : undefined;
    return p ? p.dedupeGroup ?? `${p.accountId}|${p.securityKey}` : null;
  };
  const views = new Map<string, BookFolio[]>();
  for (const f of out) {
    const g = f.viewOf && f.distributed != null ? groupOfView(f) : null;
    if (g) views.set(g, [...(views.get(g) ?? []), f]);
  }
  for (const vs of views.values()) {
    const keptView = vs.find((f) => {
      const p = viewPos.get(f.viewOf! + "|" + f.fundKey);
      return !!p && counted.has(p);
    }) ?? vs[0];
    for (const f of vs) {
      f.distributionCounted = f === keptView;
      f.distributionCountedAs = f === keptView ? null : keptView.accountId;
    }
  }
  return out;
}

/**
 * ── THE FOLIOS OF A BOOK, BUILT ONE WAY FOR EVERY PAGE THAT PRINTS OFF THEM ─
 *
 * Private Market draws its master table from these folios, and Morning CIO's
 * Distributions tile opens that page. Built twice they drifted: once the page
 * counted 360 ONE's distribution letters — once across the two CRNs — it read
 * ₹57 L while the tile, summing the capital accounts alone, went on reading
 * ₹50 L (B-10). So the inputs are assembled here and nowhere else: the current
 * holdings, the capital accounts counted once with their holdings
 * (`privateCapital`), their dated calls, and the funds' own letters.
 *
 * `ownerName` labels a scheme row for the call history and moves no figure.
 */
export function privateBookFolios(
  book: { positions: Position[]; accounts: Account[]; commitments?: Commitment[] | null },
  distributions: readonly DistributionRecord[],
  ownerName: (ownerId: string) => string | null = () => null,
) {
  const accIdx = accountIndex(book.accounts);
  const current = currentHoldings(book.positions);
  const cap = privateCapital(book.commitments ?? [], book.accounts, book.positions);
  const schemes = schemeCalls(cap.onPage, (c) => c.name, (c) => (c.ownerId ? ownerName(c.ownerId) : null));
  const folios = bookFolios({
    positions: current, allPositions: book.positions, accounts: book.accounts,
    commitments: cap.onPage, accIdx, schemes, distributions: [...distributions],
  });
  return { accIdx, current, cap, schemes, folios };
}

/**
 * THE DISTRIBUTIONS A CONSOLIDATED TOTAL LEAVES OUT, IN ONE SENTENCE — each on
 * the second statement of a holding counted once, counted with the first and
 * not again, pending the family's answer on whether the two are one investment
 * or two (§4c). Written once, so a tile and the page it opens say it alike.
 */
export function distributionLeftOutNote(
  folios: BookFolio[],
  accountName: (accountId: string) => string,
  money: (n: number | null | undefined) => string,
): string {
  return folios
    .filter((f) => f.distributed != null && !f.distributionCounted && f.distributedBasis != null)
    .map((f) => `${f.provider} ${f.accountNo} reports ${money(f.distributed)} too, on the second statement of a holding counted once; it is counted with ${f.distributionCountedAs ? accountName(f.distributionCountedAs) : "the first"}'s and not again — pending the family's answer on whether the two are one investment or two${(f.distributed ?? 0) > 0 ? `; if two, add ${money(f.distributed)}` : ""}.`)
    .join(" ");
}

function unvaluedFolio(
  a: Account | undefined, name: string, status: UnvaluedKind, reason: string | null,
  capital: Pick<BookFolio, "capital" | "capitalCounted" | "capitalCountedAs" | "distributed" | "distributedBasis" | "distributionCounted" | "distributionCountedAs">,
  accIdx: AccountIndex, s?: SchemeCall,
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
    ...capital,
    viewOf: null,
    reason,
  };
}

/**
 * WHAT A SET OF FOLIOS ADDS TO.
 *
 * `consolidated` decides the basis of EVERY column: counted once per dedupe
 * group, or every statement as printed — the holding columns by `counted`, the
 * capital columns by `capitalCounted`, so a consolidated row never pairs one
 * holding with two statements' capital (PM-A2). See the note at the top of
 * this file.
 *
 * Every total is `sumOrNull`: a folio whose statement prints no uncalled line
 * contributes nothing, and the coverage count says how many did. A `?? 0` here
 * would report a fund with nothing left to call.
 */
export function figuresOf(folios: BookFolio[], consolidated: boolean): BookFigures {
  const held = folios.filter((f) => f.position && (!consolidated || f.counted));
  // THE CAPITAL ON THE SAME BASIS AS THE HOLDING: every statement's own on a
  // printed row, each capital account once with its holding on a consolidated
  // one — see the note at the top of this file.
  const caps = folios.filter((f) => f.capital && (!consolidated || f.capitalCounted))
    .map((f) => f.capital!);
  const capitalAlso = consolidated ? folios.filter((f) => f.capital && !f.capitalCounted).length : 0;
  const of = (g: (c: SchemeCall) => number | null) => caps.filter((c) => g(c) != null).length;
  // THE FOLIOS THAT COULD REPORT A DISTRIBUTION — a capital account, or an
  // income-only folio's letters — each once on a consolidated row (B-10).
  const dists = folios.filter((f) => (f.capital || f.viewOf) && (!consolidated || f.distributionCounted));
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
    capitalAlso,
    calledOf: of((c) => c.called),
    paidOf: of((c) => c.paid),
    pendingOf: of((c) => c.pending),
    uncalledOf: of((c) => c.uncalled),
    calls: sum(caps.map((c) => c.calls.length)),
    distributed: sumOrNull(dists.map((f) => f.distributed)),
    distributedOf: dists.filter((f) => f.distributed != null).length,
    distributionAccounts: dists.length,
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
    // An income-only VIEW contributes no figure to the row, so its letter's
    // date is not a date any figure on the row is struck at.
    asOf: [...new Set(folios.filter((f) => !f.viewOf).map((f) => f.asOf).filter((d): d is string => !!d))].sort(),
    ties: ties.length ? ties.every(Boolean) : null,
  };
}

/**
 * The gap between a set's printed figures and its counted-once ones — the
 * holding columns AND the capital columns, so the lines under a row add to it
 * in every column through one "Counted once" line.
 */
function overlapOf(folios: BookFolio[]): Overlap | null {
  const printed = figuresOf(folios, false);
  const once = figuresOf(folios, true);
  const gap = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);
  // Above a rupee, so float noise is never a claim — and null, never 0, where a
  // column carries no difference.
  const real = (n: number | null) => (n != null && n > 1 ? n : null);
  const value = gap(printed.value, once.value) ?? 0;
  const capital = {
    committed: real(gap(printed.committed, once.committed)),
    called: real(gap(printed.called, once.called)),
    paid: real(gap(printed.paid, once.paid)),
    uncalled: real(gap(printed.uncalled, once.uncalled)),
  };
  if (value <= 1 && Object.values(capital).every((v) => v == null)) return null;
  return {
    statements: folios.filter((f) => f.position && f.alsoCount > 1).length,
    units: printed.units != null && once.units != null && printed.units - once.units > 0 ? printed.units - once.units : null,
    cost: real(gap(printed.cost, once.cost)),
    value: value > 1 ? value : 0,
    ...capital,
    printed: printed.value ?? 0,
    consolidated: once.value ?? 0,
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
        // A row with ANY valued folio is a valued row: an income-only view folded
        // under it adds a line, never a doubt about whether the row is valued.
        status: sorted.some((f) => f.status === "valued") ? "valued" : statuses.size === 1 ? first.status : "other",
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
