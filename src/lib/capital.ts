/**
 * THE CAPITAL BEHIND AN INVESTMENT — one definition, read by every surface.
 *
 * *"According to the client the return on this AIF is a lot higher than what
 *  we are showing on the dashboard … check it for all other investments as
 *  well … we need to make sure that the root cause of this is fixed."*
 *
 * ── THE ROOT CAUSE ──────────────────────────────────────────────────────────
 *
 * Every return on this dashboard was struck on the COST OF THE UNITS HELD
 * TODAY. That is a tax figure, and it equals the money the family put in only
 * while nothing in the account has been realised. Three things in this book
 * break that, and each moves the return a different way:
 *
 *   • A CLASS SWITCH (Buoyant). A switch is a redemption and a re-allotment,
 *     so the new class's cost is the switch-in value: the old class's gain is
 *     realised and folded into the cost. The return loses it from its numerator
 *     AND gains it in its denominator. Ajay's folio read +3.71% — Class A4's
 *     two months since the switch — against +7.17% on the ₹46 Cr he paid in.
 *   • A MANAGER TRADING (every PMS). Shares are sold and the proceeds bought
 *     again at a new cost; realised gains, dividends and fees never reach a
 *     return struck on what is held. V.E.C 128004 read +8.42% against +30.12%
 *     on capital; Carnelian read +24.98% against +19.93%, because its manager
 *     realised LOSSES and charged ₹0.99 Cr of fees. The error runs both ways.
 *   • A FUND PAYING OUT (Neo Infra). ₹51.04 L had come back by its 30 June
 *     valuation — income, principal and equalisation — and no return on cost
 *     can see money that is no longer in the fund.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 * A RETURN ON AN INVESTMENT IS STRUCK ON THE CAPITAL THE FAMILY PUT INTO IT.
 * The investment is the ACCOUNT — a mandate, a fund folio, a capital account:
 * the thing the family funded — and its capital is PUBLISHED, by one of three
 * documents, in this order of precedence:
 *
 *   1. a DATED RECORD of every payment in and out, provably reaching inception
 *      (`contributionsAreComplete`) AND the account's own as-of
 *      (`Account.capitalRecordTo`). The strongest, because it dates the money:
 *      it is the only source a money-weighted return can be solved over;
 *   2. the manager's SINCE-INCEPTION STATEMENT — the Net Capital In a
 *      performance appraisal prints, or the Contribution less Withdrawal a
 *      fact sheet prints — struck on the account's OWN as-of, so the capital
 *      and the value it is compared with stand on one date;
 *   3. a drawdown fund's CAPITAL ACCOUNT — every call it made and every payout
 *      it sent back, each DATED, and each reconciled against the totals the
 *      fund's own statement prints (the calls at Stage 10ay, the payouts at
 *      Stage 10bw). Counted up to the valuation and no further: a payout dated
 *      after it is still inside the value it is set against. Where the payout
 *      table is not reconciled (`Commitment.payouts` null) there is no capital
 *      here at all — reading the absence as nil would assert a fund returned
 *      nothing when its statement does not say so, and the printed distribution
 *      TOTAL cannot stand in for the dated rows (see the note at step 3).
 *
 * A HOLDING INSIDE AN ACCOUNT HAS NO CAPITAL OF ITS OWN. A share a manager
 * bought inside a mandate, a stock in a demat: the family funded the account,
 * not the share, so the share's return on the cost of its units is that
 * share's own figure and stays exactly as it was. Nothing here touches it.
 *
 * ── THE WHOLE-ACCOUNT RULE ──────────────────────────────────────────────────
 *
 * An account's capital describes the WHOLE account, so it may stand in for a
 * set of positions only where the set carries the whole account's value. A
 * mandate row, a bucket, an entity and the book do; a sector table picking
 * three shares out of a mandate does not, and those shares keep their cost.
 * Measured against the account's own current value rather than by counting
 * rows, so a consolidated set that dropped a dedupe member counts the account
 * once — under whichever member the set kept — which is §"consolidated counts
 * once" applied to capital.
 *
 * ── WHAT NEVER CHANGES ──────────────────────────────────────────────────────
 *
 * Nothing here enters `glowData.ts`, moves a market value or touches a
 * position's own cost. The cost of the units held is still what the Avg cost
 * column, the tax card and every holding-level row print — it is the right
 * figure for tax and the wrong one for a return, and both stay true.
 */
import type { Account, AccountBridge, CapitalMove, Commitment, Position, PositionTranches } from "./types";
import { contributionsAreComplete, recordShortfall } from "./tranches";
import { moneyWeightedReturn, pooledXirr, type MoneyWeighted } from "./bucketXirr";
import { costCoversSet } from "./analytics";
import type { DatedFlow } from "./xirr";

export type CapitalSource = "dated-record" | "statement" | "capital-account";

export type AccountCapital = {
  accountId: string;
  source: CapitalSource;
  /** Paid in, gross — where the source states it. A performance appraisal prints only the net. */
  paidIn: number | null;
  /** Taken out — withdrawals, redemptions paid, distributions — where stated. */
  tookOut: number | null;
  /** The family's own money still at work: paid in less taken out. Always > 0. */
  net: number;
  /** The date this capital stands at — always the account's OWN as-of. */
  asOf: string;
  /** The first payment in, or the inception the statement prints. */
  since: string | null;
  /** How many dated payments IN, where the source dates them. */
  payments: number | null;
  /** Dated flows in the solver's sign (money in negative), where the source dates them. */
  flows: DatedFlow[] | null;
  /** The document the figure is read from. */
  document: string | null;
};

/** What a source IS, in a reader's words — the first clause of every hover. */
export const CAPITAL_SOURCE_LABEL: Record<CapitalSource, string> = {
  "dated-record": "every payment in and out, dated, from the account's own statements",
  "statement": "the capital the manager's since-inception statement prints",
  "capital-account": "the fund's capital account — every call paid in and every payout received, dated",
};

/** A rupee is this book's settlement tolerance; a missed payment moves crores. */
const TIE = 1;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The family's capital in ONE account, from the strongest source that states
 * it — or null, and then every figure for this account stays on cost.
 */
export function accountCapital(input: {
  account: Account;
  moves: readonly CapitalMove[];
  bridges: readonly AccountBridge[];
  commitment: Commitment | null;
  positions: Position[];
  tranches: Record<string, PositionTranches>;
}): AccountCapital | null {
  const { account, positions, tranches } = input;
  const asOf = account.asOf;
  if (!asOf) return null;

  // 1 — a dated record reaching BOTH ends: back to inception, and forward to
  //     the date the value is struck. A record that stops before `asOf` has
  //     not seen what moved in between, so it cannot state the capital behind
  //     that value (Green Lantern 510861: a quarterly report ending 30 Jun
  //     against holdings struck 27 Jul). It falls to the statement instead.
  const moves = input.moves.filter((m) => m.accountId === account.accountId && m.date <= asOf);
  const reachesAsOf = recordShortfall(account) === null;
  if (moves.length && reachesAsOf && moves.every((m) => isNum(m.amount))
      && contributionsAreComplete(account.accountId, moves, positions, tranches, account.inceptionDate) === null) {
    const ins = moves.filter((m) => m.direction === "in");
    const outs = moves.filter((m) => m.direction === "out");
    const paidIn = ins.reduce((t, m) => t + (m.amount as number), 0);
    const tookOut = outs.reduce((t, m) => t + (m.amount as number), 0);
    const net = paidIn - tookOut;
    if (net > 0) {
      return {
        accountId: account.accountId, source: "dated-record", paidIn, tookOut, net, asOf,
        since: ins.map((m) => m.date).sort()[0] ?? null,
        payments: ins.length,
        flows: moves.map((m) => ({ date: new Date(m.date), amount: m.direction === "in" ? -(m.amount as number) : (m.amount as number) })),
        document: null,
      };
    }
  }

  // 2 — the manager's since-inception statement, on the account's own as-of.
  //     Where a fact sheet and a performance appraisal BOTH state it they must
  //     agree; a pair that disagrees is not a figure this book will pick from.
  const onDate = input.bridges.filter((b) => b.basis === "since-inception" && b.periodTo === asOf);
  const stated = onDate
    .map((b) => {
      const net = isNum(b.netCapitalInOut) ? b.netCapitalInOut
        : isNum(b.contribution) ? b.contribution - (b.withdrawal ?? 0) : null;
      return net === null ? null : { b, net };
    })
    .filter((x): x is { b: AccountBridge; net: number } => x !== null);
  if (stated.length && stated.every((s) => Math.abs(s.net - stated[0].net) <= TIE) && stated[0].net > 0) {
    const gross = stated.find((s) => isNum(s.b.contribution));
    const net = (stated.find((s) => isNum(s.b.netCapitalInOut)) ?? stated[0]).net;
    return {
      accountId: account.accountId, source: "statement",
      paidIn: gross ? gross.b.contribution : null,
      tookOut: gross ? (gross.b.withdrawal ?? 0) : null,
      net, asOf,
      since: account.inceptionDate ?? stated[0].b.periodFrom ?? null,
      payments: null, flows: null,
      document: stated[0].b.source,
    };
  }

  // 3 — a drawdown fund's CAPITAL ACCOUNT, on its own dated calls and payouts.
  //
  //     THE PRINTED DISTRIBUTION TOTAL IS NOT USED, AND THAT WAS MEASURED. Neo
  //     Infra's statement is struck at 30 June and prints ₹49.48 L distributed —
  //     which includes ₹7.13 L of income paid on 9 July, after the valuation, so
  //     still inside the value it is set against. Subtracting the total counted
  //     that payment twice: once in the value, once out of the capital. The
  //     dated rows say which payouts the value no longer holds, and they are
  //     read only where they reproduce the totals the statement prints.
  //
  //     Every payout kind counts — income, principal returned and equalisation —
  //     because each is cash that came back to the family from this investment,
  //     at its GROSS amount, the basis the fund values itself on (TDS is the
  //     family's own tax, credited back to them). It is the same set of flows the
  //     Private Market fund table solves its XIRR over (`fundReturns.ts`), so the
  //     capital and that rate describe one set of money.
  const c = input.commitment;
  if (c && c.asOf === asOf && isNum(c.paid) && c.calls?.length && c.payouts != null) {
    const called = c.calls.reduce((t, k) => t + k.amount, 0);
    // The calls must BE the money paid — a call still unpaid is a demand, not
    // capital — and none may fall after the value it is measured against.
    if (Math.abs(called - c.paid) <= TIE && !c.calls.some((k) => k.date > asOf)) {
      // ON the valuation date is OUTSIDE the value, as `fundReturns.ts` reads it:
      // a NAV struck on a distribution date is struck after it.
      const back = c.payouts.filter((r) => r.date <= asOf);
      const tookOut = back.reduce((t, r) => t + r.gross, 0);
      const net = called - tookOut;
      if (net > 0) {
        return {
          accountId: account.accountId, source: "capital-account",
          paidIn: called, tookOut, net, asOf,
          since: c.calls.map((k) => k.date).sort()[0] ?? null,
          payments: c.calls.length,
          // Money to the fund negative, money back positive. Equalisation is the
          // one kind a statement may print with a sign — a payment BY the family —
          // and its gross then already carries it.
          flows: [
            ...c.calls.map((k) => ({ date: new Date(k.date), amount: -k.amount })),
            ...back.map((r) => ({ date: new Date(r.date), amount: r.gross })),
          ],
          document: null,
        };
      }
    }
  }
  return null;
}

// ── A SET OF POSITIONS ────────────────────────────────────────────────────────

/**
 * A position's cost is unusable where the statement reported none — or printed
 * zero beside a positive value, which would book the whole holding as profit.
 * Exported so a surface that also needs "which of these report a cost" asks the
 * same question the model does rather than re-deriving it.
 */
export const reportsNoCost = (p: Position) =>
  !!p.costUnavailable || p.costBasis === null || p.costBasis === undefined || (p.costBasis === 0 && p.marketValue > 0);

export type InvestedBehind = {
  /**
   * What the family has in this set: each WHOLE account's published capital,
   * plus the cost of the units held for every other position that reports one.
   * Null when nothing in the set carries either.
   */
  invested: number | null;
  /** The market value of the parts that carry a basis — what `gain` is struck on. */
  value: number;
  gain: number | null;
  returnPct: number | null;
  /** Whole accounts measured on their capital, with how many positions each carries here. */
  onCapital: { accountId: string; capital: AccountCapital; value: number; count: number }[];
  /** Everything measured on the cost of its units. */
  onCost: { count: number; value: number; cost: number };
  /** Positions with no basis at all — in no figure above. */
  noBasis: { count: number; value: number };
  /**
   * Whether the parts with a basis are essentially the whole set — the same
   * 0.5% test `costCoversSet` applies everywhere a return could otherwise sit
   * between two columns covering different sets.
   */
  covers: boolean;
  /** The money-weighted return, where EVERY part is on a dated record. */
  xirr: MoneyWeighted | null;
  /** Why there is none, in words — where there is none. */
  xirrWhy: string | null;
  /** Dated payments in behind the XIRR. The family's rule routes more than one to XIRR. */
  payments: number;
  /** Dated payments OUT behind the XIRR — withdrawals, redemptions paid. */
  paymentsOut: number;
  /** The first dated payment behind the set, where every part is dated. */
  since: string | null;
  /**
   * EVERY RUPEE IN THIS SET IS ON A DATED RECORD — whole accounts only, each
   * with its payments dated. The one condition a money-weighted return needs.
   */
  dated: boolean;
  /**
   * The date the family first put money into this set: the first dated payment,
   * or the inception each statement prints. Null the moment any part is on the
   * cost of its units or states no start — `sumOrNull` applied to a date.
   */
  openedOn: string | null;
  /** The latest date the capital behind this set is struck at. */
  closes: string | null;
  /**
   * What this set's return is struck on, in a reader's words — the first clause
   * of every hover on a figure measured here. Null where nothing is on capital,
   * which is the one case where the cost of the units is the only basis there is.
   */
  basisNote: string | null;
};

export type CapitalModel = {
  /** The capital in one account, or null — then that account is on cost. */
  of: (accountId: string) => AccountCapital | null;
  /** The account's own current value, over the universe the model was built on. */
  valueOf: (accountId: string) => number;
  /**
   * One WHOLE account, measured over the universe's own positions for it — for a
   * page about one account, which must not re-derive "the whole account" from a
   * set it filtered differently (a ₹54 speck the universe dropped would leave
   * the page's set one position larger than the account and off its capital).
   */
  ofAccount: (accountId: string) => InvestedBehind;
  /**
   * What the family has in a set of positions, and what it has returned.
   *
   * `unitOf` names the ROW each position is drawn in, where the set is a total
   * over rows — a section, a footer. An account then stands on its capital only
   * where ONE row carries it whole, because the rows are what the total must tie
   * to: an account split across two rows is on cost in both, and a total that
   * put it back on capital would add up to something its own rows do not.
   */
  behind: (set: readonly Position[], unitOf?: (p: Position) => string | undefined) => InvestedBehind;
};

/**
 * Build once, from the book and the positions a surface draws from.
 *
 * `positions` IS THE UNIVERSE: every account's own value is measured over it,
 * so it must be the same set the surface filters its rows from — live or
 * statement basis, current holdings — or no set drawn from it could ever carry
 * a whole account. The context builds one on the live book; a page that
 * reconciles to the PDF builds its own on `statementPortfolio`.
 */
export function buildCapitalModel(book: {
  accounts: readonly Account[];
  capitalMoves: readonly CapitalMove[];
  bridges: Readonly<Record<string, AccountBridge[]>>;
  commitments: readonly Commitment[];
  tranches: Record<string, PositionTranches>;
  positions: Position[];
}): CapitalModel {
  const capital = new Map<string, AccountCapital>();
  for (const account of book.accounts) {
    const c = accountCapital({
      account,
      moves: book.capitalMoves,
      bridges: book.bridges[account.accountId] ?? [],
      commitment: book.commitments.find((x) => x.accountId === account.accountId) ?? null,
      positions: book.positions,
      tranches: book.tranches,
    });
    if (c) capital.set(account.accountId, c);
  }
  const accountValue = new Map<string, number>();
  const accountRows = new Map<string, Position[]>();
  // THE UNIVERSE BY IDENTITY. A surface may hand in a set drawn from the raw
  // book — a closed row, a ₹54 speck the universe dropped — and the whole-account
  // test must compare like with like: the set's part that IS in the universe
  // against the account's value over it. The speck still counts in the set's
  // value; it just cannot stop an account being whole.
  const universe = new Set<Position>(book.positions);
  for (const p of book.positions) {
    accountValue.set(p.accountId, (accountValue.get(p.accountId) ?? 0) + p.marketValue);
    if (!accountRows.has(p.accountId)) accountRows.set(p.accountId, []);
    accountRows.get(p.accountId)!.push(p);
  }

  const behind = (set: readonly Position[], unitOf?: (p: Position) => string | undefined): InvestedBehind => {
    const byAccount = new Map<string, Position[]>();
    for (const p of set) {
      if (!byAccount.has(p.accountId)) byAccount.set(p.accountId, []);
      byAccount.get(p.accountId)!.push(p);
    }
    const onCapital: InvestedBehind["onCapital"] = [];
    const costed: Position[] = [];
    const bare: Position[] = [];
    for (const [accountId, ps] of byAccount) {
      const cap = capital.get(accountId);
      const inSet = ps.filter((p) => universe.has(p)).reduce((t, p) => t + p.marketValue, 0);
      // WHOLE, OR NOT AT ALL. Half a rupee is float noise on a sum; anything
      // more is a position of this account the set does not carry.
      //
      // ONE ROW IS COUNTED OVER THE POSITIONS THAT CARRY SOME OF THE ACCOUNT'S
      // MONEY. Buoyant's folios each print a ₹0 cash line beside the fund's
      // units, and the category axis files that line under Cash — so counted
      // over every position both folios were "split across two rows" and fell
      // to cost in the footer while standing on capital in their own AIF
      // section, and the sections stopped adding to the footer. A line at ₹0
      // value and ₹0 cost moves no total on either basis, so it cannot split
      // an account; one that carries a cost (a write-off at ₹0) still can.
      const carries = ps.filter((p) => p.marketValue !== 0 || (p.costBasis ?? 0) !== 0);
      const oneRow = !unitOf || new Set(carries.map(unitOf)).size <= 1;
      if (cap && oneRow && Math.abs(inSet - (accountValue.get(accountId) ?? 0)) <= 0.5) {
        onCapital.push({ accountId, capital: cap, value: ps.reduce((t, p) => t + p.marketValue, 0), count: ps.length });
        continue;
      }
      for (const p of ps) (reportsNoCost(p) ? bare : costed).push(p);
    }
    const capInvested = onCapital.reduce((t, x) => t + x.capital.net, 0);
    const capValue = onCapital.reduce((t, x) => t + x.value, 0);
    const cost = costed.reduce((t, p) => t + (p.costBasis as number), 0);
    const costValue = costed.reduce((t, p) => t + p.marketValue, 0);
    const bareValue = bare.reduce((t, p) => t + p.marketValue, 0);
    const any = onCapital.length > 0 || costed.length > 0;
    const invested = any ? capInvested + cost : null;
    const value = capValue + costValue;
    const gain = invested === null ? null : value - invested;

    // THE MONEY-WEIGHTED RETURN, ONLY WHERE EVERY RUPEE IS DATED. A pool that
    // closed some accounts on dated payments and others on a total would solve a
    // rate over money whose timing it half invented.
    let xirr: MoneyWeighted | null = null;
    let xirrWhy: string | null = null;
    let payments = 0;
    let paymentsOut = 0;
    let since: string | null = null;
    const undatedCap = onCapital.filter((x) => !x.capital.flows);
    if (!onCapital.length) {
      xirrWhy = "no account in this set publishes the capital put into it, so there are no dated payments to solve a money-weighted return over";
    } else if (costed.length || bare.length) {
      xirrWhy = "part of this set is held inside accounts measured on the cost of their units, which carries no dated payments";
    } else if (undatedCap.length) {
      xirrWhy = "the capital behind part of this set is published as a total since inception, not as dated payments, so no money-weighted return can be solved over it — the manager's own published return is on Performance";
    } else {
      const parts = onCapital.map((x) => ({ flows: x.capital.flows as DatedFlow[], terminalValue: x.value, asOf: new Date(x.capital.asOf) }));
      const first = Math.min(...parts.flatMap((p) => p.flows.map((f) => f.date.getTime())));
      const last = Math.max(...parts.map((p) => p.asOf.getTime()));
      xirr = moneyWeightedReturn(pooledXirr(parts), Math.round((last - first) / 864e5));
      payments = onCapital.reduce((t, x) => t + (x.capital.payments ?? 0), 0);
      paymentsOut = parts.reduce((t, p) => t + p.flows.filter((f) => f.amount > 0).length, 0);
      since = new Date(first).toISOString().slice(0, 10);
      if (xirr.pct === null) xirrWhy = "these payments and this value do not solve to a rate";
    }
    const dated = onCapital.length > 0 && !costed.length && !bare.length && !undatedCap.length;
    const starts = onCapital.map((x) => x.capital.since);
    const openedOn = onCapital.length && !costed.length && !bare.length && starts.every((d): d is string => !!d)
      ? [...starts].sort()[0] : null;
    const closes = onCapital.length ? onCapital.map((x) => x.capital.asOf).sort().at(-1) ?? null : null;
    const sources = [...new Set(onCapital.map((x) => x.capital.source))];
    const onWhat = sources.length === 1 ? CAPITAL_SOURCE_LABEL[sources[0]] : "each account's own published capital";
    const basisNote = !onCapital.length ? null
      : costed.length || bare.length
        ? `On the capital the family put into ${onCapital.length === 1 ? "one whole account" : `${onCapital.length} whole accounts`} here (${onWhat}), and on the cost of the units held for the rest, which sit inside accounts this set does not carry whole.`
        : `On the capital the family put in — ${onWhat} — not on the cost of the units held today, which a class switch, a manager's trading or a fund's payout resets.`;

    return {
      invested, value, gain,
      returnPct: invested !== null && invested > 0 && gain !== null ? (gain / invested) * 100 : null,
      onCapital,
      onCost: { count: costed.length, value: costValue, cost },
      noBasis: { count: bare.length, value: bareValue },
      covers: costCoversSet(value + bareValue, bareValue),
      xirr, xirrWhy, payments, paymentsOut, since, dated, openedOn, closes, basisNote,
    };
  };

  return {
    of: (accountId) => capital.get(accountId) ?? null,
    valueOf: (accountId) => accountValue.get(accountId) ?? 0,
    ofAccount: (accountId) => behind(accountRows.get(accountId) ?? []),
    behind,
  };
}

// ── IN A READER'S WORDS ──────────────────────────────────────────────────────

/**
 * The hover behind an Invested figure struck on capital: what the family put
 * in, which document says so, and — where it differs — the cost of the units it
 * replaced as the basis. Takes the page's own money formatter so every figure
 * prints in the reader's display currency; a helper that formatted money itself
 * would print rupees on a page showing dollars.
 */
export function describeCapital(
  c: InvestedBehind,
  money: (n: number) => string,
  unitCost?: number | null,
): string {
  const lines = c.onCapital.map(({ capital: k }) => {
    const flow = k.paidIn !== null
      ? `${money(k.paidIn)} paid in less ${money(k.tookOut ?? 0)} taken out`
      : `${money(k.net)} net`;
    const when = k.payments
      ? `, over ${k.payments} dated payment${k.payments === 1 ? "" : "s"}${k.since ? ` from ${k.since}` : ""}`
      : k.since ? `, since ${k.since}` : "";
    return `${flow} — ${CAPITAL_SOURCE_LABEL[k.source]}${when}, as of ${k.asOf}`;
  });
  const head = c.onCapital.length === 1
    ? `Capital put in: ${lines[0]}.`
    : `Capital put in across ${c.onCapital.length} accounts: ${lines.join("; ")}.`;
  const cost = c.onCost.count
    ? ` Plus ${money(c.onCost.cost)}, the cost of ${c.onCost.count} holding${c.onCost.count === 1 ? "" : "s"} held in accounts this figure does not carry whole.`
    : "";
  const units = typeof unitCost === "number" && Number.isFinite(unitCost) && Math.abs(unitCost - (c.invested ?? 0)) >= 1
    ? ` The units held today cost ${money(unitCost)} — a tax figure, reset by every class switch, sale and payout, which is why no return here is struck on it.`
    : "";
  return head + cost + units;
}
