// Per-entity money-weighted returns for the Family & Entities breakdown.
// These need dated inputs the base position model doesn't carry, so each
// function returns null (rendered as "—") until the upload supplies them:
//   • XIRR  — needs each account's dated flows AND an opening portfolio value.
//   • YTD   — needs entityNavHistory (a per-entity opening NAV for the FY).
import type { Portfolio, Position } from "./types";
import { xirrPct, totalReturnFromXirr } from "./bucketXirr";
import { fyStartYear } from "./analytics";
import { ownerDisplayName } from "./owners";

/**
 * An account carries an opening portfolio value only if a flow says so.
 *
 * EXPORTED, because three surfaces now ask the same question and a fourth copy
 * of this regex is a fourth chance for them to disagree. Morning CIO decides
 * which accounts its money-weighted return covers, `/holdings` lists the
 * holdings behind that coverage, and this file measures a return per owner —
 * all three must draw the line in exactly the same place, or the drill-down
 * lists a set the tile did not measure.
 */
export const accountHasOpeningValue = (portfolio: Portfolio, accountId: string): boolean =>
  (portfolio.accountReturnRecords?.[accountId]?.record?.flows ?? portfolio.accountCashFlows?.[accountId] ?? [])
    .some((f) => /^opening portfolio value/i.test(f.description ?? ""));

/** Display name an account resolves to, matching `ownerOf` / `byEntity`. */
const accountOwnerName = (a: { ownerId?: string | null; owner?: string | null }): string =>
  a.ownerId ? ownerDisplayName(a.ownerId) : (a.owner || "Unattributed");

/**
 * ── ONE MONEY-WEIGHTED RETURN, STRUCK ONE WAY ─────────────────────────────
 *
 * Morning CIO's tile, NAV & Performance's consolidated row and each Family &
 * Entities member row all pool per-account parts — the account's own dated
 * flows, closed against its own value on its own date — and each carried a
 * copy of that arithmetic. The copies drifted in the two places that decide
 * the figure:
 *
 *   • THE WINDOW'S END. Morning CIO ended it on `portfolio.asOf`, the book's
 *     NEWEST date — 29 Aug 2026, which is the date of two quantity-only trust
 *     demats that value nothing — so the rate was de-annualised over 150 days
 *     where the pool closes on 13 Aug, 134 days. +30.1% on the tile against
 *     +26.5% on NAV & Performance, for the same seven accounts.
 *   • THE TERMINAL VALUE'S BASIS. The flows are complete only to each account's
 *     STATEMENT date; nothing reports the capital that moved after it. So the
 *     account closes on the value its statement strikes on that date. Closing
 *     it on today's LIVE value instead dates a price struck today to a
 *     statement weeks old — on live prices that read +45.3% against +37.0%.
 *
 * So a part's terminal value comes from the STATEMENT positions, at the
 * account's own as-of; the window runs from the pool's first flow to its
 * LATEST close; and the account set is decided once — `accountHasOpeningValue`,
 * with a positive statement value to close against.
 *
 * Per ACCOUNT, never deduped: each account closes against the value ITS OWN
 * statement prints (§"consolidated counts once, per-account does not").
 */
export type MeasuredPart = {
  accountId: string;
  accountNo: string;
  flows: { date: Date; amount: number }[];
  terminalValue: number;
  /** The account's own statement date — where its terminal value is struck. */
  asOf: Date;
  source?: string;
};

export type AccountsReturn = {
  /** Annualised money-weighted rate (%), or null where no account qualifies. */
  annPct: number | null;
  /** The rate de-annualised to the window it measured (%). */
  toDatePct: number | null;
  /** First flow → LATEST close, in days; null with no parts. */
  windowDays: number | null;
  windowStart: string | null;
  /** The earliest and latest statement dates the parts close on. */
  firstClose: string | null;
  lastClose: string | null;
  /** Σ terminal values of the parts (statement basis). */
  measuredMV: number;
  parts: MeasuredPart[];
  /** Account numbers left out for want of an opening portfolio value. */
  excluded: string[];
  /** Newer valuations that lack matching verified capital records, by account. */
  gaps: { accountId: string; accountNo: string; asOf: string; reason: string }[];
  /**
   * Accounts the pooled rate must cover and cannot, each with its reason. Any
   * one of them leaves the pooled rate absent (`whole` false).
   */
  missing: UnmeasuredAccount[];
  /** Accounts with nothing of their own to measure: a verified nil, or valued nowhere in the book. */
  outside: UnmeasuredAccount[];
  /** True only when every account that must be covered is measured. */
  whole: boolean;
  /** Why the pooled rate is absent, where it is; null when it is struck. */
  reason: string | null;
};

export type UnmeasuredAccount = { accountId: string; accountNo: string; reason: string };

/** Use the latest verified return endpoint; holding quantities retain their own statement date. */
export function accountReturnInputs(statement: Portfolio, account: Portfolio['accounts'][number]) {
  const coverage = statement.accountReturnRecords?.[account.accountId];
  const record = coverage?.record;
  if (record) {
    return { value: record.value, asOf: record.asOf, flows: record.flows,
      capitalRecordTo: record.capitalRecordTo, source: record.source, gap: coverage.gap,
      notApplicable: coverage.notApplicable,
      latestValuationDate: coverage.latestValuationDate };
  }
  return { value: statement.positions.filter((p) => p.accountId === account.accountId).reduce((n, p) => n + p.marketValue, 0),
    asOf: account.asOf, flows: coverage ? [] : statement.accountCashFlows?.[account.accountId] ?? [],
    capitalRecordTo: account.capitalRecordTo, source: undefined,
    gap: coverage?.notApplicable ?? coverage?.gap ?? null, notApplicable: coverage?.notApplicable,
    latestValuationDate: coverage?.latestValuationDate ?? account.asOf };
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * WHY AN ACCOUNT HAS NOTHING OF ITS OWN TO MEASURE, or null where it has. Not a
 * gap in a whole-portfolio return: a verified nil (`notApplicable`), or an
 * account the book values nowhere — no verified record, no position and no
 * opening value — which the book's total leaves out the same way. Every other
 * account without a verified record is one a pooled return cannot cover.
 * One rule for every return surface (Stage 10fb).
 */
export function nothingToMeasure(statement: Portfolio, account: Portfolio["accounts"][number],
  input = accountReturnInputs(statement, account)): string | null {
  if (input.notApplicable) return input.notApplicable;
  if (input.source || statement.positions.some((p) => p.accountId === account.accountId)
    || input.flows.some((f) => /^opening portfolio value/i.test(f.description ?? ""))) return null;
  return account.noPositionsReason ?? "no statement in this book values this account";
}

/**
 * The money-weighted return over `accounts`, on `statement` — the portfolio
 * the flows were recorded against (`statementPortfolio`, never the live one).
 */
export function measuredAccountsReturn(
  statement: Portfolio,
  accounts: readonly Portfolio["accounts"][number][],
): AccountsReturn {
  const parts: MeasuredPart[] = [];
  const excluded: string[] = [];
  const gaps: AccountsReturn['gaps'] = [];
  const missing: UnmeasuredAccount[] = [];
  const outside: UnmeasuredAccount[] = [];
  for (const a of accounts) {
    const input = accountReturnInputs(statement, a);
    const mv = input.value;
    if (input.gap && !input.notApplicable) gaps.push({ accountId: a.accountId, accountNo: a.accountNo,
      asOf: input.latestValuationDate, reason: input.gap });
    const unmeasured = (reason: string) => {
      const row = { accountId: a.accountId, accountNo: a.accountNo };
      const none = nothingToMeasure(statement, a, input);
      if (none) outside.push({ ...row, reason: none });
      else missing.push({ ...row, reason });
    };
    // A sourced closing zero is real (redemption); an unvalued legacy account
    // is not. Decide the account set here so every surface pools the same flows.
    if (!Number.isFinite(mv) || mv < 0 || (mv === 0 && !input.source)) {
      unmeasured(input.gap ?? "no verified valuation on a date its dated capital reaches");
      continue;
    }
    const flows = input.flows.map((f) => ({ date: new Date(f.date), amount: f.amount }));
    if (!input.flows.some((f) => /^opening portfolio value/i.test(f.description ?? '')) || !flows.length) {
      excluded.push(a.accountNo);
      unmeasured(input.gap ?? "no verified opening value and complete dated capital record");
      continue;
    }
    parts.push({ accountId: a.accountId, accountNo: a.accountNo, flows, terminalValue: mv, asOf: new Date(input.asOf), source: input.source });
  }
  let first: number | null = null, lastC: number | null = null, firstC: number | null = null;
  for (const pt of parts) {
    for (const f of pt.flows) { const t = f.date.getTime(); if (first == null || t < first) first = t; }
    const c = pt.asOf.getTime();
    if (lastC == null || c > lastC) lastC = c;
    if (firstC == null || c < firstC) firstC = c;
  }
  // NEVER A PARTIAL POOL: a rate over some of the accounts is not the return of
  // the set asked for, so it stays absent until every account is measured.
  const whole = parts.length > 0 && missing.length === 0;
  const annPct = whole ? xirrPct(parts.flatMap(p => [...p.flows, { date: p.asOf, amount: p.terminalValue }])) : null;
  const windowDays = first != null && lastC != null ? Math.round((lastC - first) / 864e5) : null;
  return {
    annPct,
    toDatePct: totalReturnFromXirr(annPct, windowDays),
    windowDays,
    windowStart: first == null ? null : isoOf(new Date(first)),
    firstClose: firstC == null ? null : isoOf(new Date(firstC)),
    lastClose: lastC == null ? null : isoOf(new Date(lastC)),
    measuredMV: parts.reduce((s, x) => s + x.terminalValue, 0),
    parts,
    excluded,
    gaps,
    missing,
    outside,
    whole,
    reason: whole ? null
      : missing.length ? incompleteReason(missing.length)
      : "no account here holds anything to measure",
  };
}

/** Why a pooled return is absent: how many accounts lack which records. */
export function incompleteReason(n: number): string {
  return `${n} ${n === 1 ? "account holding value lacks" : "accounts holding value lack"} a verified opening value and dated capital through a closing valuation, so no whole return can be struck`;
}

export type OwnerReturn = {
  /** Annualised money-weighted return (%) over every account of the owner; null unless all are measured. */
  annPct: number | null;
  /** The above de-annualised to the window the flows span (%). */
  toDatePct: number | null;
  /** Terminal market value of the accounts that could be measured (statement basis). */
  measuredMV: number;
  /** The owner's whole market value (for naming coverage). */
  totalMV: number;
  /** Account numbers excluded for want of an opening portfolio value. */
  excluded: string[];
  /** How many accounts contributed to the measured figure. */
  covered: number;
  /** Days the measured window spans. */
  windowDays: number | null;
  /** The owner's accounts that hold value and lack a verified record (`AccountsReturn.missing`). */
  missing: UnmeasuredAccount[];
  /** Why the rate is absent, where it is. */
  reason: string | null;
};

/**
 * MONEY-WEIGHTED RETURN FOR ONE OWNER — measurable accounts only.
 *
 * This is the fix for the failure CLAUDE.md §9 documents and `/performance` and
 * Morning CIO already guard against. An owner's opening portfolio values cover
 * only the accounts that publish a performance summary, so closing the owner's
 * WHOLE market value against those partial openings folds every uncovered
 * account's value into the terminal inflow with no opening stake behind it — for
 * Ajay that closed ~₹62.86 Cr of openings against his full ₹155.45 Cr and
 * returned ~+2,600% p.a.; for Ankita worse. The old per-entity helper did exactly
 * that (it appended the entity's whole `currentMV` to partial flows).
 *
 * The rate itself is `measuredAccountsReturn` over the owner's accounts, on the
 * STATEMENT portfolio, so a member's row and the book's tile are one
 * computation. `positions` is the page's own set, read for `totalMV` alone.
 */
export function ownerMeasuredReturn(statement: Portfolio, positions: Position[], owner: string): OwnerReturn {
  const own = statement.accounts.filter((a) => accountOwnerName(a) === owner);
  const ids = new Set(own.map((a) => a.accountId));
  const totalMV = positions.filter((x) => ids.has(x.accountId)).reduce((s, x) => s + x.marketValue, 0);
  const r = measuredAccountsReturn(statement, own);
  return {
    annPct: r.annPct, toDatePct: r.toDatePct, measuredMV: r.measuredMV, totalMV,
    excluded: r.excluded, covered: r.parts.length, windowDays: r.windowDays,
    missing: r.missing, reason: r.reason,
  };
}

// Financial-year-to-date return (1 Apr → as-of) for one owning entity, using the
// Simple Dietz method so mid-year contributions don't distort the figure.
// Returns a non-annualized percentage for the period, or null when the entity
// carries no opening NAV for the financial year (this book carries none, so it
// renders "—" — never a fabricated figure against a partial opening).
export function entityYtdPct(portfolio: Portfolio, owner: string, currentMV: number): number | null {
  const nav = portfolio.entityNavHistory?.[owner];
  if (!nav || nav.length === 0 || currentMV <= 0) return null;
  const asOf = new Date(portfolio.asOf);
  const fyStart = new Date(fyStartYear(asOf), 3, 1); // 1 April of the current FY
  const opening = [...nav]
    .filter((n) => new Date(n.date) <= fyStart)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  if (!opening || opening.nav <= 0) return null;
  // Net capital contributed during the FY-to-date window (amount < 0 = capital in).
  const contrib = (portfolio.entityCashFlows?.[owner] ?? [])
    .filter((f) => { const d = new Date(f.date); return d > fyStart && d <= asOf; })
    .reduce((s, f) => s + (-f.amount), 0);
  const gain = currentMV - opening.nav - contrib;
  const base = opening.nav + contrib / 2;
  return base > 0 ? (gain / base) * 100 : null;
}
