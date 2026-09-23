/**
 * ── THE MONEY-WEIGHTED RETURN OF A ROW THAT IS WHOLE ACCOUNTS ON A DATED RECORD ─
 *
 * *"According to the client the return [on] all this AIF is a lot higher than
 *  what we are showing on the dashboard. So please check if we are missing
 *  anything … check it for all other investments as well."* — sent with a
 *  screenshot of Buoyant Opportunities Strategy Class A4's company page.
 *
 * WHAT WAS MISSING WAS A MEASURE, NOT A FIGURE. The Portfolio Monitor's XIRR
 * column and the company page carried no money-weighted return for any row —
 * *"per holding it is shown as absent"* — because a holding inside an account
 * has no cash flows of its own. That is true of a share a manager bought, and
 * FALSE of a row that IS an account: a Buoyant folio, a Sanshi folio, a drawdown
 * fund, a PMS mandate whose statements date every payment the family made. For
 * those the record exists, and Buoyant's own fact sheet prints the rate it
 * yields — **15.30% and 9.76%**, which an XIRR over the dated deposits here
 * reproduces to the printed decimal.
 *
 * ── ONE DEFINITION, AND IT IS NOT THIS FILE'S ───────────────────────────────
 *
 * Which accounts carry a complete dated record, what their flows are and what
 * value they close at is `capitalRollup`'s — the Transactions card and the
 * mandate page already strike each account's XIRR from it (`capitalXirr`). This
 * file only answers the question those two never had to: WHICH ROWS OF A
 * HOLDINGS TABLE ARE WHOLE ACCOUNTS, and what the pooled rate over them is. So
 * a folio's XIRR on the Monitor is its XIRR on the Transactions card, by
 * construction rather than by agreement.
 *
 * ── THE WHOLE-ACCOUNT RULE ──────────────────────────────────────────────────
 *
 * An account's dated record describes the WHOLE account, so it stands behind a
 * row only where the row carries every holding of it — a mandate row, a fund's
 * row over its folios, one statement line that is the whole folio. A row holding
 * part of an account (one share of a mandate, a sector's slice) has no dated
 * record of its own and keeps the per-holding refusal. Measured over the
 * positions that CARRY some of the account's money: each Buoyant folio prints a
 * ₹0 Cash line beside its units, and the category axis files that line apart,
 * so counted over every position both folios would be "split" and lose a rate
 * the whole of their money supports. A ₹0 line with a COST (a write-off) still
 * splits, because that is money.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It moves no HPR, no Invested and no cost. The holding-period return stays
 * FIFO's (Stage 10ca) on every row, a whole mandate stays struck on the capital
 * paid in, and a cost stays what the units cost. Stage 10cf ported this from a
 * branch that ALSO re-based every return on the net capital put in; that half
 * was superseded by FIFO — the family's own later instruction for every return
 * on the dashboard — and did not land. What landed is the money-weighted rate,
 * which is a different measure and needs no basis of its own.
 *
 * THE RATE IS STRUCK AT THE STATEMENT, like the Transactions card's: each
 * account closes at the value its own statement prints, on that statement's
 * date. A live quote moves a mandate row's value today, and closing today's
 * value on a month-old date would credit the rate with days nobody measured.
 */
import type { Account, CapitalMove, Commitment, Position, PositionTranches } from "./types";
import type { RowCapital } from "./analytics";
import { capitalMovesWithCalls, capitalRollup, type CapitalGroup } from "./tranches";
import { xirrPct } from "./bucketXirr";
import type { DatedFlow } from "./xirr";

export type DatedCapital = {
  /** The account's whole-record group, where it carries a money-weighted rate. Null otherwise. */
  of: (accountId: string) => CapitalGroup | null;
  /**
   * The dated capital behind a set of positions — or NULL where the set is not
   * whole accounts at all (a holding inside an account), which is the caller's
   * cue to keep the per-holding refusal.
   *
   * `universe` is what "every holding of the account" is measured against: the
   * positions the surface draws its rows from, so a filter that drops one share
   * of a mandate drops the mandate back to holding-by-holding — the rule
   * `fifoTotals` applies to a mandate's capital.
   */
  behind: (set: readonly Position[], universe: readonly Position[]) => RowCapital | null;
};

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * A position CARRIES the account's money unless it is a ₹0 line with no cost —
 * see the whole-account rule above.
 */
const carries = (p: Position) => p.marketValue !== 0 || (typeof p.costBasis === "number" && p.costBasis !== 0);

/** Why an account whose whole record is on this row still carries no rate. */
const noRateReason = (g: CapitalGroup | undefined) =>
  !g ? "this account publishes no dated record of the family's payments — its capital is known only as a total since inception, if at all — so there are no dated flows to solve a money-weighted return over. The per-account money-weighted return, where one can be struck, is on Performance"
  : g.appreciationReason ?? g.incompleteReason
    ?? (g.value == null ? "no statement values this account, so there is no value today to close a money-weighted return on"
      : !g.flows?.length ? "this account's payments are not all dated, so no money-weighted return can be solved over them"
      : "these dated payments and this value do not solve to a rate");

/**
 * Build once per book. `positions` and `accounts` are the book the rates are
 * struck on — the STATEMENT book, as the Transactions card reads it.
 */
export function buildDatedCapital(input: {
  moves: readonly CapitalMove[];
  commitments: readonly Commitment[];
  accounts: readonly Account[];
  positions: readonly Position[];
  tranches: Record<string, PositionTranches>;
  fromInception: readonly string[];
}): DatedCapital {
  const record = capitalMovesWithCalls([...input.moves], [...input.commitments], input.accounts);
  const groups = capitalRollup(record, [...input.accounts], [...input.positions], input.tranches, "all", "recent", {
    commitments: [...input.commitments], fromInception: input.fromInception,
  });
  const byAccount = new Map(groups.map((g) => [g.accountId, g]));
  const rated = (g: CapitalGroup | undefined): g is CapitalGroup =>
    !!g && g.appreciationReason == null && g.value != null && !!g.flows?.length;
  const labelOf = new Map(input.accounts.map((a) => [a.accountId, a.strategy || `${a.provider} ${a.accountNo}`]));

  const behind = (set: readonly Position[], universe: readonly Position[]): RowCapital | null => {
    const keysIn = new Map<string, Set<string>>();
    for (const p of set) {
      if (!keysIn.has(p.accountId)) keysIn.set(p.accountId, new Set());
      keysIn.get(p.accountId)!.add(p.securityKey);
    }
    if (!keysIn.size) return null;
    // WHOLE, OR NOT AT ALL — every account the set touches, every holding of it
    // that carries money.
    for (const [acct, keys] of keysIn) {
      const own = universe.filter((p) => p.accountId === acct && carries(p));
      if (!own.length || !own.every((p) => keys.has(p.securityKey))) return null;
    }
    const accts = [...keysIn.keys()].sort();
    const gs = accts.map((a) => byAccount.get(a));
    const missing = accts.filter((_, i) => !rated(gs[i]));
    if (missing.length) {
      const why = noRateReason(byAccount.get(missing[0]));
      return {
        dated: false,
        accountIds: accts,
        reason: accts.length === 1 ? why
          : `${missing.length} of the ${accts.length} accounts behind this row carry no dated record a money-weighted return can be solved over — ${labelOf.get(missing[0]) ?? missing[0]}: ${why}`,
      };
    }
    // POOLED, EACH ACCOUNT CLOSING ON ITS OWN DATE — `capitalXirr`'s construction
    // for one account, and `pooledXirr`'s rule for several. A folio redeemed in
    // full closes on its last flow with no terminal value, exactly as there.
    const flows: DatedFlow[] = [];
    let since: string | null = null, to: string | null = null, n = 0;
    for (const g of gs as CapitalGroup[]) {
      for (const f of g.flows!) {
        flows.push({ date: new Date(f.date), amount: f.amount });
        n += 1;
        if (f.amount < 0 && (since === null || f.date < since)) since = f.date;
      }
      const lastFlow = g.flows!.map((f) => f.date).sort().at(-1)!;
      const close = g.value === 0 ? lastFlow : (g.valueAsOf ?? lastFlow);
      if (g.value! > 0) flows.push({ date: new Date(close), amount: g.value! });
      if (to === null || close > to) to = close;
    }
    if (since === null || to === null) {
      return { dated: false, accountIds: accts, reason: "no dated payment INTO this row is on record, so there is nothing to measure a return from" };
    }
    return {
      dated: true,
      accountIds: accts,
      accounts: accts.length,
      flows: n,
      since,
      to,
      days: dayDiff(since, to),
      annualPct: xirrPct(flows),
    };
  };

  return {
    of: (id) => { const g = byAccount.get(id); return rated(g) ? g : null; },
    behind,
  };
}
