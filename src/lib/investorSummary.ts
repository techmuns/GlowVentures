import type { Portfolio } from "./types";
import { measuredAccountsReturn } from "./returns";

export const INVESTOR_DEFAULT_TILES = ["value", "gain", "annualised", "fytd"] as const;

/** The current reporting year, never the year of a stale statement. */
export function investorPeriodStart(today: Date, period: "fytd" | "ytd"): string {
  const year = today.getFullYear() - (period === "fytd" && today.getMonth() < 3 ? 1 : 0);
  return `${year}-${period === "fytd" ? "04" : "01"}-01`;
}

/**
 * A whole-portfolio period return needs every account's opening value and
 * dated flows, with a common closing date. Partial or changing panels cannot
 * stand in for the investor's portfolio, nor can today's quotes close flows
 * recorded only through an older statement. Reuse the statement XIRR solver
 * and de-annualise it over the exact period when those requirements are met.
 */
export function investorPeriodReturn(statement: Portfolio, today: Date, period: "fytd" | "ytd") {
  const start = investorPeriodStart(today, period);
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const accounts = statement.accounts.filter((a) => {
    const flows = statement.accountCashFlows?.[a.accountId] ?? [];
    const openings = flows.filter((f) => /^opening portfolio value/i.test(f.description ?? ""));
    // A known gap or a partially valued account cannot close a whole-account
    // return. A null record date is common on performance-summary cash flows;
    // it does not mean a dated record ending before the valuation is complete.
    const recordCoversClose = a.capitalRecordTo == null
      || (validDate(a.capitalRecordTo) && a.capitalRecordTo >= a.asOf);
    return !a.transactionsOnly && !a.partialValuation && recordCoversClose
      && openings.length === 1 && openings[0].date === start && openings[0].amount < 0
      && validDate(a.asOf) && a.asOf > start && a.asOf <= now
      && flows.every((f) => validDate(f.date) && f.date >= start && f.date <= a.asOf && Number.isFinite(f.amount));
  });
  const measured = measuredAccountsReturn(statement, accounts);
  const covered = measured.parts.length;
  const total = statement.accounts.length;
  const distinctCloses = new Set(measured.parts.map((p) => p.asOf.toISOString().slice(0, 10)));
  const groups = statement.positions.map((p) => p.dedupeGroup).filter(Boolean);
  const overlaps = new Set(groups).size !== groups.length;
  const separateFunds = Object.values(statement.privateMarkets).some((rows) => rows.length > 0);
  let reason: string | null = null;
  if (!total || covered !== total) reason = "Opening values or cash flows missing";
  else if (overlaps || separateFunds) reason = "Complete consolidated cash flows needed";
  else if (distinctCloses.size !== 1) reason = "Matching valuation dates needed";
  else if (measured.toDatePct == null || !Number.isFinite(measured.toDatePct)) reason = "Return cannot be calculated from these cash flows";

  const opening = measured.parts.reduce((s, p) => s - (statement.accountCashFlows?.[p.accountId] ?? [])
    .filter((f) => /^opening portfolio value/i.test(f.description ?? "")).reduce((n, f) => n + f.amount, 0), 0);
  const movements = measured.parts.reduce((s, p) => s + (statement.accountCashFlows?.[p.accountId] ?? [])
    .filter((f) => !/^opening portfolio value/i.test(f.description ?? "")).reduce((n, f) => n + f.amount, 0), 0);
  return {
    start, end: measured.lastClose, covered, total, reason,
    pct: reason ? null : measured.toDatePct,
    gain: reason ? null : measured.measuredMV + movements - opening,
  };
}
