import type { Portfolio } from "./types";
import { measuredAccountsReturn, accountReturnInputs, nothingToMeasure } from "./returns";
import { accountEmptiness } from "./searchIndex";
import { xirrPct, totalReturnFromXirr } from "./bucketXirr";
import { fmtDate } from "./format";

/**
 * WHY THE ANNUAL RATE IS ABSENT — and whether it is waiting or cannot come.
 *
 * Every verified return record opens on the financial year's first day
 * (`accountReturnRecords.mjs`, periodStart = YYYY-04-01), so the window from
 * that opening can reach at most 364 days before the next year's records open
 * on the next 1 April. "189 days recorded · need at least 1 year" read like a
 * card that fills itself in time, which this one never does (CLAUDE.md: a card
 * that can never be filled must not look like one that is waiting). Where the
 * window opens on an FY start the reason says that, and what would fill it;
 * no annual rate is struck either way (Stage 10fz). The "N days recorded"
 * clause stays the first words, as the tile's probe reads it. The face keeps
 * to a few words (no explainer lines, Stage 10cp); the why is `detail`, for
 * the hover.
 */
export function annualisedReturnIssue(annualPct: number | null, days: number | null, start?: string | null) {
  if (days == null || days < 365) {
    const fyOpening = days != null && !!start && /^\d{4}-04-01$/.test(start);
    return {
      issueLabel: "Insufficient history",
      reason: days == null ? "Need dated opening values and cash flows"
        : fyOpening ? `${days} days recorded · records open each 1 Apr`
        : `${days} days recorded · need at least 1 year`,
      detail: fyOpening
        ? `The verified records open at the financial year's start (${fmtDate(start!)}), so no window reaches a year until a since-inception record is reconciled.`
        : null,
    };
  }
  if (annualPct == null || !Number.isFinite(annualPct)) return {
    issueLabel: "Unable to calculate",
    reason: "Cash flows do not produce a valid XIRR",
    detail: null,
  };
  return { issueLabel: null, reason: null, detail: null };
}

/** Statement accounts only: coverage and the destination show exactly this set. */
export function investorAnnualReturn(statement: Portfolio) {
  const measured = measuredAccountsReturn(statement, statement.accounts);
  // Whole or absent: the missing accounts name the cause before the window does.
  const issue = measured.missing.length
    ? { issueLabel: "Incomplete records", reason: measured.reason, detail: null }
    : annualisedReturnIssue(measured.annPct, measured.windowDays, measured.windowStart);
  return { ...issue, start: measured.windowStart, end: measured.lastClose,
    covered: measured.parts.length, total: measured.parts.length + measured.missing.length,
    missing: measured.missing, outside: measured.outside,
    windowDays: measured.windowDays, measuredValue: measured.measuredMV,
    pct: issue.reason ? null : measured.annPct,
    flows: measured.whole ? measured.parts.flatMap((p) => [...p.flows, { date: p.asOf, amount: p.terminalValue }]) : [],
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
    const input = accountReturnInputs(statement, a);
    const flows = input.flows;
    const openings = flows.filter((f) => /^opening portfolio value/i.test(f.description ?? ""));
    // An opening value alone does not prove that every later movement is
    // dated. Require an explicit record endpoint through the closing value.
    const recordCoversClose = input.capitalRecordTo != null
      && validDate(input.capitalRecordTo) && input.capitalRecordTo >= input.asOf;
    return !a.transactionsOnly && !a.partialValuation && recordCoversClose
      && openings.length === 1 && openings[0].date === start && openings[0].amount < 0
      && validDate(input.asOf) && input.asOf > start && input.asOf <= now
      && flows.every((f) => validDate(f.date) && f.date >= start && f.date <= input.asOf && Number.isFinite(f.amount));
  });
  const parts = accounts.flatMap((a) => {
    const rows = statement.positions.filter((p) => p.accountId === a.accountId);
    const input = accountReturnInputs(statement, a);
    const value = input.value;
    // A liquidated account still contributes its opening value and proceeds.
    // No positions without evidence of redemption means unknown, never zero.
    if (!Number.isFinite(value) || value < 0
      || (value === 0 && !input.source && accountEmptiness(a, rows)?.kind !== "redeemed")) return [];
    return [{ account: a, asOf: input.asOf, value, flows: input.flows }];
  });
  // The set the return must cover: every account except those with nothing of
  // their own to measure (a verified nil, or valued nowhere in the book).
  const outside = new Set(statement.accounts.filter((a) => nothingToMeasure(statement, a)).map((a) => a.accountId));
  const covered = parts.filter((p) => !outside.has(p.account.accountId)).length;
  const total = statement.accounts.filter((a) => !outside.has(a.accountId)).length;
  const distinctCloses = new Set(parts.map((p) => p.asOf));
  const closes = [...distinctCloses].sort();
  const end = closes[closes.length - 1] ?? null;
  const flows = parts.flatMap((p) => [
    ...p.flows.map((f) => ({ date: new Date(f.date), amount: f.amount })),
    { date: new Date(p.asOf), amount: p.value },
  ]);
  const days = end ? (Date.parse(end) - Date.parse(start)) / 864e5 : null;
  const annualPct = xirrPct(flows);
  const pct = totalReturnFromXirr(annualPct, days);
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
    // No figure, no inputs: a partial panel's flows are not the calculation of anything shown.
    flows: reason ? [] : flows, annualPct: reason ? null : annualPct, windowDays: days,
  };
}
