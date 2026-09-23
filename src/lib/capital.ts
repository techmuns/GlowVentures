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
 *   • A FUND PAYING OUT (Neo Infra). ₹49.48 L of distributions left the fund
 *     and no return on cost can see money that is no longer in it.
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
 *   3. a drawdown fund's CAPITAL ACCOUNT — paid in, less distributed — used
 *      only where the distribution line is PRINTED, zero included. Reading an
 *      absent line as nil would assert a fund returned nothing when its
 *      statement does not say; `Commitment.distributed` is null for exactly
 *      that reason.
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
import { contributionsAreComplete } from "./tranches";
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
  "capital-account": "the fund's capital account — paid in, less what it has distributed",
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
  const reachesAsOf = !!account.capitalRecordTo && account.capitalRecordTo >= asOf;
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

  // 3 — a drawdown fund's capital account, only where the payout line is printed.
  const c = input.commitment;
  if (c && c.asOf === asOf && isNum(c.paid) && isNum(c.distributed) && c.paid - c.distributed > 0) {
    return {
      accountId: account.accountId, source: "capital-account",
      paidIn: c.paid, tookOut: c.distributed, net: c.paid - c.distributed, asOf,
      since: (c.calls ?? []).map((x) => x.date).sort()[0] ?? null,
      payments: null, flows: null,
      document: null,
    };
  }
  return null;
}

// ── A SET OF POSITIONS ────────────────────────────────────────────────────────

/** A position's cost is unusable where the statement reported none. */
const noCost = (p: Position) =>
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
  /** Whole accounts measured on their capital. */
  onCapital: { accountId: string; capital: AccountCapital; value: number }[];
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
  /** The first dated payment behind the set, where every part is dated. */
  since: string | null;
};

export type CapitalModel = {
  /** The capital in one account, or null — then that account is on cost. */
  of: (accountId: string) => AccountCapital | null;
  /** The account's own current value, over the universe the model was built on. */
  valueOf: (accountId: string) => number;
  /** What the family has in a set of positions, and what it has returned. */
  behind: (set: readonly Position[]) => InvestedBehind;
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
  for (const p of book.positions) accountValue.set(p.accountId, (accountValue.get(p.accountId) ?? 0) + p.marketValue);

  const behind = (set: readonly Position[]): InvestedBehind => {
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
      const inSet = ps.reduce((t, p) => t + p.marketValue, 0);
      // WHOLE, OR NOT AT ALL. Half a rupee is float noise on a sum; anything
      // more is a position of this account the set does not carry.
      if (cap && Math.abs(inSet - (accountValue.get(accountId) ?? 0)) <= 0.5) {
        onCapital.push({ accountId, capital: cap, value: inSet });
        continue;
      }
      for (const p of ps) (noCost(p) ? bare : costed).push(p);
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
      since = new Date(first).toISOString().slice(0, 10);
      if (xirr.pct === null) xirrWhy = "these payments and this value do not solve to a rate";
    }

    return {
      invested, value, gain,
      returnPct: invested !== null && invested > 0 && gain !== null ? (gain / invested) * 100 : null,
      onCapital,
      onCost: { count: costed.length, value: costValue, cost },
      noBasis: { count: bare.length, value: bareValue },
      covers: costCoversSet(value + bareValue, bareValue),
      xirr, xirrWhy, payments, since,
    };
  };

  return {
    of: (accountId) => capital.get(accountId) ?? null,
    valueOf: (accountId) => accountValue.get(accountId) ?? 0,
    behind,
  };
}
