import type { Portfolio } from "./types";
import { measuredAccountsReturn } from "./returns";
import { accountEmptiness } from "./searchIndex";
import { xirrPct, totalReturnFromXirr } from "./bucketXirr";

export function annualisedReturnIssue(annualPct: number | null, days: number | null) {
  if (days == null || days < 365) return {
    issueLabel: "Insufficient history",
    reason: days == null ? "Need dated opening values and cash flows" : `${days} days recorded · need at least 1 year`,
  };
  if (annualPct == null || !Number.isFinite(annualPct)) return {
    issueLabel: "Unable to calculate",
    reason: "Cash flows do not produce a valid XIRR",
  };
  return { issueLabel: null, reason: null };
}

/** Statement accounts only: coverage and the destination show exactly this set. */
export function investorAnnualReturn(statement: Portfolio) {
  const measured = measuredAccountsReturn(statement, statement.accounts);
  const issue = annualisedReturnIssue(measured.annPct, measured.windowDays);
  return { ...issue, start: measured.windowStart, end: measured.lastClose,
    covered: measured.parts.length, total: statement.accounts.length,
    windowDays: measured.windowDays, measuredValue: measured.measuredMV,
    pct: issue.reason ? null : measured.annPct,
  };
}

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
    // An opening value alone does not prove that every later movement is
    // dated. Require an explicit record endpoint through the closing value.
    const recordCoversClose = a.capitalRecordTo != null
      && validDate(a.capitalRecordTo) && a.capitalRecordTo >= a.asOf;
    return !a.transactionsOnly && !a.partialValuation && recordCoversClose
      && openings.length === 1 && openings[0].date === start && openings[0].amount < 0
      && validDate(a.asOf) && a.asOf > start && a.asOf <= now
      && flows.every((f) => validDate(f.date) && f.date >= start && f.date <= a.asOf && Number.isFinite(f.amount));
  });
  const parts = accounts.flatMap((a) => {
    const rows = statement.positions.filter((p) => p.accountId === a.accountId);
    const value = rows.reduce((n, p) => n + p.marketValue, 0);
    // A liquidated account still contributes its opening value and proceeds.
    // No positions without evidence of redemption means unknown, never zero.
    if (!Number.isFinite(value) || value < 0
      || (value === 0 && accountEmptiness(a, rows)?.kind !== "redeemed")) return [];
    return [{ account: a, value, flows: statement.accountCashFlows![a.accountId] }];
  });
  const covered = parts.length;
  const total = statement.accounts.length;
  const distinctCloses = new Set(parts.map((p) => p.account.asOf));
  const closes = [...distinctCloses].sort();
  const end = closes[closes.length - 1] ?? null;
  const flows = parts.flatMap((p) => [
    ...p.flows.map((f) => ({ date: new Date(f.date), amount: f.amount })),
    { date: new Date(p.account.asOf), amount: p.value },
  ]);
  const days = end ? (Date.parse(end) - Date.parse(start)) / 864e5 : null;
  const pct = totalReturnFromXirr(xirrPct(flows), days);
  const groups = statement.positions.map((p) => p.dedupeGroup).filter(Boolean);
  const overlaps = new Set(groups).size !== groups.length;
  const separateFunds = Object.values(statement.privateMarkets).some((rows) => rows.length > 0);
  let reason: string | null = null;
  if (!total || covered !== total) reason = "Opening values or cash flows missing";
  else if (overlaps || separateFunds) reason = "Complete consolidated cash flows needed";
  else if (distinctCloses.size !== 1) reason = "Matching valuation dates needed";
  else if (pct == null || !Number.isFinite(pct)) reason = "Return cannot be calculated from these cash flows";

  const value = parts.reduce((n, p) => n + p.value, 0);
  // All flow signs are from the investor's perspective: openings and deposits
  // negative, withdrawals positive. Including the opening gives net gain.
  const movements = parts.reduce((n, p) => n + p.flows.reduce((v, f) => v + f.amount, 0), 0);
  return {
    start, end, covered, total, reason,
    pct: reason ? null : pct,
    gain: reason ? null : value + movements,
  };
}
