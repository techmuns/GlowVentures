/**
 * ── LISTED DEMAT SHARES AT EACH DAY'S PUBLISHED CLOSE, IN THE BOOK LINE (Stage 10iz) ──
 *
 *   *"mark listed demat holdings at historical prices in the book line"*
 *   — the family, 28 Oct 2026.
 *
 * The statement series (`bookNav.ts`) holds each demat at its statement's value
 * until the next statement: Ajay's ICICI NSDL demat flat at its 31 Mar value
 * for seven months, and the demats whose statements print quantities and no
 * value — Bharat's HDFC NSDL and the Motilal Oswal demats — not at all. Under
 * the family's assumed-continued-ownership rule (22 Oct 2026, `assumedHolding`),
 * a listed share whose balance a statement dates, and that no later trade,
 * movement or capital record contradicts, is valued at every published close
 * from that date: checked splits applied, gross dividends paid out on their
 * ex-dates.
 *
 * A DEMAT, ON EVERY TRADING DAY FROM ITS STATEMENT:
 *
 *   value(d) = Σ assumed shares × their split-adjusted close on or before d
 *            + its other holdings at their statement values, carried as before
 *
 * THE STATEMENT DAY IS VALUED THE SAME WAY, AT THAT DAY'S CLOSE. Ajay's ICICI
 * statement values five recently listed shares above any close they traded at
 * by 31 Mar (Clean Max at ₹1,336.50 a share against a ₹901.10 high), so a line
 * struck from the statement's mark would open with an ₹11 Cr fall that is the
 * gap between two bases, not a market move. Both ends at a published close is
 * how the Returns tab already measures the same holdings (`assumedHolding`).
 *
 * A demat no statement values becomes an investment of its own, valued from its
 * statement date and joining the return there, like any first valuation.
 *
 * Nothing here enters the statement book. It is a second series over the same
 * units, and the card names every holding valued this way and every one it is not.
 */
import type { Account, Position } from "./types";
import { bookNavSeries, comparableStarts, type BookNavSeries, type NavUnit, type NavUnitMark } from "./bookNav";
import { assumedHolding, publishedClose, type AssumedHolding, type AssumedReturnBook } from "./assumedHoldingReturns";

export type DematHolding = {
  accountId: string;
  securityKey: string;
  security: string;
  owner: string;
  /**
   * `assumed` — valued at published closes from `from`; `statement` — kept at its
   * statement value, as before; `left-out` — no statement values it and it could
   * not be valued this way, so it is in neither series.
   */
  status: "assumed" | "statement" | "left-out";
  /** The statement date its units are carried from (assumed only). */
  from: string | null;
  /** Its value at the series' end: the published close for an assumed holding, else the statement's. */
  value: number;
  /** Gross dividend entitlements counted for it, paid out on their ex-dates. */
  income: number;
  /** Why it is not assumed held; null when it is. */
  reason: string | null;
  /** Still waiting on its price history. */
  pending: boolean;
  /** Its price history failed to load — a retry may value it. */
  retry: boolean;
};

export type AssumedBookNav = {
  series: BookNavSeries;
  starts: string[];
  holdings: DematHolding[];
  /** Holdings whose price history has not arrived. */
  pending: number;
  /** Assumed holdings, their value at the series' end, and their owners. */
  assumedCount: number;
  assumedValue: number;
  owners: string[];
};

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** The key suffix of a demat's assumed shares where its other holdings stay an investment of their own. */
export const ASSUMED_KEY = "|assumed";

/**
 * THE DEMAT ACCOUNTS AND WHAT THEY HOLD. An account the family holds directly or
 * through a broker, that is not a review holder bucket and holds a listed share —
 * so a direct mutual-fund folio, which holds funds, is never one. Its holdings
 * are its statement rows and the depository's share balances its statements
 * record (`shareCandidates`).
 */
export function dematHoldings(accounts: readonly Account[], positions: readonly Position[], candidates: readonly Position[]): Position[] {
  const out: Position[] = [];
  for (const a of accounts) {
    if (!(a.engagement === "Direct" || a.engagement === "Execution") || a.reviewHolder) continue;
    const held = [...positions.filter((p) => p.accountId === a.accountId), ...candidates.filter((p) => p.accountId === a.accountId)];
    if (held.some((p) => p.assetClass === "Equity" && p.marketSide !== "private")) out.push(...held);
  }
  return out;
}

/**
 * The statement series, with every demat's assumed shares valued daily. Null
 * where the series has no window. Holdings still loading are named `pending`,
 * and the caller decides whether to draw before they arrive.
 */
export function assumedBookNav(input: {
  units: readonly NavUnit[];
  series: BookNavSeries;
  accounts: readonly Account[];
  /** The demat accounts' holdings (`dematHoldings`). */
  holdings: readonly Position[];
  book: AssumedReturnBook;
}): AssumedBookNav | null {
  const start = input.series.coverage.from, end = input.series.coverage.to;
  if (!start || !end) return null;
  const accountOf = new Map(input.accounts.map((a) => [a.accountId, a]));
  // A holding two accounts both report is in the series once (`navUnits`), so
  // its second copy is never valued here either.
  const seenGroup = new Set<string>();
  const dup = new Set<Position>();
  for (const p of input.book.positions) {
    if (!p.dedupeGroup) continue;
    if (seenGroup.has(p.dedupeGroup)) dup.add(p); else seenGroup.add(p.dedupeGroup);
  }
  const byAccount = new Map<string, Position[]>();
  for (const p of input.holdings) (byAccount.get(p.accountId) ?? byAccount.set(p.accountId, []).get(p.accountId)!).push(p);

  const holdings: DematHolding[] = [];
  const replaced = new Map<string, NavUnit>();
  const added: NavUnit[] = [];
  let pending = 0;
  for (const [accountId, held] of byAccount) {
    const a = accountOf.get(accountId);
    if (!a) continue;
    const existing = input.units.find((u) => u.key === accountId) ?? null;
    const lastReal = existing?.marks.at(-1)?.date ?? null;
    const assumed: { p: Position; r: AssumedHolding }[] = [];
    for (const p of held) {
      const base = { accountId, securityKey: p.securityKey, security: p.security, owner: a.owner, from: null, income: 0, retry: false };
      const kept = p.marketValue !== 0 ? "statement" as const : "left-out" as const;
      if (dup.has(p)) continue;
      const r = assumedHolding(p, a, null, end, input.book);
      if ("gap" in r) {
        if (r.gap.pending) pending++;
        holdings.push({ ...base, status: kept, value: p.marketValue, reason: r.gap.reason, pending: !!r.gap.pending, retry: !!r.gap.retry });
        continue;
      }
      // A NEWER VALUATION OF THE ACCOUNT WINS. Units carried from an older
      // statement cannot overwrite a value a later record struck.
      if (lastReal && r.anchor.date < lastReal) {
        holdings.push({ ...base, status: kept, value: p.marketValue, pending: false, retry: false,
          reason: `The account is valued on ${lastReal}, after the ${r.anchor.date} share count; its own valuation is used.` });
        continue;
      }
      assumed.push({ p, r });
    }
    if (!assumed.length) continue;

    // Every assumed share is held from the latest of their statement dates.
    const from = assumed.map((x) => x.r.anchor.date).sort().at(-1) as string;
    /**
     * MONEY THE ACCOUNT RECORDS AFTER ITS STATEMENT KEEPS IT ON THE STATEMENT.
     * A contribution, withdrawal or recorded payout after `from` would sit in
     * the account between two closes, and a daily mark of fixed shares has no
     * place for it: the next close would erase it from the level and the chain
     * would read it as a loss or a gain. No demat in this book records one; one
     * that does keeps its statement series until a newer balance arrives.
     */
    if (existing?.flows.some((f) => f.date > from && f.date <= end)) {
      for (const x of assumed) holdings.push({ accountId, securityKey: x.p.securityKey, security: x.p.security, owner: a.owner,
        status: x.p.marketValue !== 0 ? "statement" : "left-out", from: null, value: x.p.marketValue, income: 0, pending: false, retry: false,
        reason: "The account records money in or out after its statement. A newer share balance is needed before assuming these shares were unchanged." });
      continue;
    }
    const dates = [...new Set([from, ...assumed.flatMap((x) => x.r.history.t.filter((t) => t > from && t <= end))])].sort();
    // The assumed shares alone, at each close every one of them has.
    const marks: NavUnitMark[] = [];
    for (const d of dates) {
      let value = 0, priced = true;
      for (const x of assumed) {
        const c = publishedClose(x.r.history, d);
        if (!c) { priced = false; break; }
        value += x.r.quantity * c.value;
      }
      if (priced) marks.push({ date: d, value, source: "assumed" });
    }
    if (!marks.length) continue;
    // GROSS DIVIDENDS ARE PAID OUT ON THEIR EX-DATES — money leaving the
    // holding, as every payout in the series is. The account records none after
    // its statement (above), so each entitlement is counted once, here.
    const income = assumed.flatMap((x) => x.r.incomeDates.filter((f) => f.date > from && f.date <= end)
      .map((f) => ({ date: f.date, amount: -f.amount })));
    for (const x of assumed) {
      const own = x.r.incomeDates.filter((f) => f.date > from && f.date <= end);
      holdings.push({ accountId, securityKey: x.p.securityKey, security: x.p.security, owner: a.owner, status: "assumed",
        from: x.r.anchor.date, value: x.r.quantity * x.r.closing.value, income: sum(own.map((f) => f.amount)), reason: null, pending: false, retry: false });
    }
    const stated = sum(assumed.map((x) => x.p.marketValue));
    // THE ASSUMPTION IS THAT NO CAPITAL MOVED but the dividends counted, so the
    // record is complete through the end — every step between two closes is
    // settled by it, never left unproven.
    const shares: NavUnit = { key: accountId, accountId, securityKey: null, marks, flows: income, origin: null, originDated: false,
      atCost: false, recordTo: end, steps: [], bookValue: stated };
    if (!existing) { added.push({ ...shares, bookValue: 0 }); continue; }
    /**
     * …AND WHAT IT DOES NOT VALUE AT A CLOSE KEEPS ITS OWN STATEMENT DATE. The
     * account's other holdings stay at their statement values as an investment
     * of their own, so a share priced every day never makes them look freshly
     * valued: Ajay's ICICI demat keeps ₹18.5 Cr of listings no published price
     * reaches at its 31 Mar statement, and the card names it as carried from
     * then. Where the account was valued BEFORE the shares' statement too, its
     * earlier value is the whole account's and cannot be split, so the two stay
     * one investment.
     */
    const carried = (existing.marks.at(-1)?.value ?? 0) - stated;
    if (existing.marks.some((m) => m.date < from)) {
      replaced.set(accountId, { ...existing, flows: [...existing.flows, ...income].sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0)),
        marks: [...existing.marks.filter((m) => m.date < from), ...marks.map((m) => ({ ...m, value: m.value + carried }))],
        recordTo: existing.recordTo && existing.recordTo > end ? existing.recordTo : end });
    } else if (Math.abs(carried) >= 1) {
      replaced.set(accountId, { ...existing, marks: [{ date: from, value: carried, source: existing.marks.at(-1)?.source ?? "book" }],
        bookValue: existing.bookValue - stated });
      added.push({ ...shares, key: `${accountId}${ASSUMED_KEY}` });
    } else {
      replaced.set(accountId, { ...shares, bookValue: existing.bookValue });
    }
  }
  const units = [...input.units.map((u) => replaced.get(u.key) ?? u), ...added].sort((x, y) => x.key.localeCompare(y.key));
  const series = bookNavSeries(units, start);
  const assumedRows = holdings.filter((h) => h.status === "assumed");
  return {
    series,
    starts: comparableStarts(units, series),
    holdings,
    pending,
    assumedCount: assumedRows.length,
    assumedValue: sum(assumedRows.map((h) => h.value)),
    owners: [...new Set(assumedRows.map((h) => h.owner))].sort(),
  };
}
