/**
 * ── RETURNS OVER A PERIOD THE READER PICKS (Stage 10dq) ─────────────────────
 *
 * *"Returns-page should be able to show MTD, YTD, financial-year-to-date,
 * trailing 1Y/2Y/3Y, since-investment and custom start/end periods … For a
 * selected date range, use the portfolio/holding market value at the opening
 * date rather than original investment cost. Use cost for since-investment
 * measures where appropriate. Reconstruct the holdings at the selected dates
 * and handle investments made during the window."*
 *
 * PURE: every input is an argument, so the page and the suite strike one
 * figure by one definition.
 *
 * A DATED WINDOW IS STRUCK ACCOUNT BY ACCOUNT, ON THE ACCOUNT'S OWN MARKS. The
 * book does not value every account on every day — statements are dated where
 * their issuer dated them — so "the book on 1 April" is each account's latest
 * statement valuation on or before that date, and the window an account
 * actually covers is printed beside the one the reader asked for. Four things
 * are refused rather than guessed, each with its reason:
 *
 *   - an account with no valuation on or before the opening date (never its
 *     COST standing in for a value, which is exactly what the family asked this
 *     page not to do);
 *   - an account no statement values after its opening mark, before the end;
 *   - an account whose capital in and out is not DATED across the window (a
 *     return over unknown flows reads a deposit as performance — Stage 10p);
 *   - an account whose own statements print capital no dated row carries
 *     inside the window (`BOOK_UNDATED_CAPITAL`).
 *
 * A capital move inside the window is a dated flow, so the three measures
 * handle "investments made during the window" each in their own way and say
 * how.
 *
 * ── ONE SELECTED RECORD PER ACCOUNT (Stage 10fz) ─────────────────────────────
 *
 * The Returns tab used to assemble its own inputs — the account's cash-flow
 * rows, its NAV history, the capital rollup — and never read the verified
 * return record (`accountReturnRecords`, `accountReturnInputs`) that Morning
 * CIO's tile and NAV & Performance close on. Over FYTD that read +25.04% over
 * 9 accounts where the tile read +20.59% over 17: Green Lantern closed on
 * 27 Jul where its record runs to 22 Sep, Active Momentum opened at nil where
 * its record refuses it, and nine unit-ledger folios the records verify were
 * dropped. `accountInputs` below takes each account's opening, flows, close
 * date and value from that record, falls back to the older sources only where
 * the book carries no record for the account at all, and excludes an account
 * the record refuses with the record's own reason — never opening it at nil.
 */
import { xirr, xirrAmbiguity, type DatedFlow } from "@/lib/xirr";
import type { Account, AccountReturnCoverage, CashFlow, Position } from "@/lib/types";
import { capitalWindow, type CapitalGroup } from "@/lib/tranches";

export type PeriodKey = "mtd" | "ytd" | "fytd" | "y1" | "y2" | "y3" | "inception" | "custom";
export type ReturnType = "xirr" | "absolute" | "cagr";

export const PERIODS: readonly { key: PeriodKey; label: string; title: string }[] = [
  { key: "fytd", label: "FYTD", title: "Financial year to date — from 31 March, the last day of the previous financial year" },
  { key: "mtd", label: "MTD", title: "Month to date — from the last day of the previous month" },
  { key: "ytd", label: "YTD", title: "Year to date — from 31 December of the previous year" },
  { key: "y1", label: "1Y", title: "Trailing one year" },
  { key: "y2", label: "2Y", title: "Trailing two years" },
  { key: "y3", label: "3Y", title: "Trailing three years" },
  { key: "inception", label: "Since investment", title: "From each account's first purchase, struck on the capital paid in" },
  { key: "custom", label: "Custom", title: "Pick both dates" },
] as const;

/**
 * The three returns the family selected, and nothing more exotic (the family's
 * ask, Stage 10eb). `short` is drawn under the selector; `title` is its hover.
 */
export const RETURN_TYPES: readonly { key: ReturnType; label: string; short: string; title: string }[] = [
  { key: "xirr", label: "XIRR", short: "Yearly rate, timing every rupee in and out",
    title: "XIRR (money-weighted return): the yearly rate that accounts for when each rupee went in and came out. The standard measure for SIPs, top-ups and redemptions. Over less than a year it is shown for the period, never stretched to a year." },
  { key: "absolute", label: "Absolute return", short: "Total gain ÷ money at work, not per year",
    title: "Absolute return (Modified Dietz): total gain over the period as a percentage of the money at work — the opening value plus each amount added or taken out, counted for the share of the period it was invested. Not annualised. Since investment it is the simple return: gain over what was paid in." },
  { key: "cagr", label: "CAGR", short: "Yearly growth rate · needs a year or more",
    title: "CAGR (annualised Modified Dietz): the period's Modified Dietz return — gain over the money at work, each dated amount counted for the days it was invested — stated as a yearly compound rate. One period, not a chain of statement intervals. Only over a year or more." },
] as const;

/** One account's statement valuation on one date. */
export type Valuation = { date: string; value: number };
/** Investor's view: negative = money put IN, positive = money taken OUT. */
export type Flow = { date: string; amount: number; description?: string };

export type AccountInput = {
  accountId: string;
  label: string;
  owner: string;
  valuations: Valuation[];
  flows: Flow[];
  /** Dates between which the flow record is complete (inclusive). null = from inception / unbounded. */
  knownFrom: string | null;
  knownTo: string | null;
  /** Why the flows are not known at all, where they are not. */
  flowsUnknown: string | null;
  /** [from, to] windows the statements print capital no dated row carries. */
  undated: { from: string; to: string; amount: number }[];
  /**
   * Why the account has nothing of its own to measure (a verified nil, or
   * valued nowhere in the book), where it has not. Such an account is outside
   * the whole, never a gap in it.
   */
  outside?: string | null;
};

export type AccountWindow = {
  accountId: string;
  label: string;
  owner: string;
  openDate: string;
  openValue: number;
  /** True where the account was opened inside the window — it opens at nil. */
  openedInWindow: boolean;
  closeDate: string;
  closeValue: number;
  flows: Flow[];
  capitalIn: number;
  capitalOut: number;
  gain: number;
};

export type Excluded = { accountId: string; label: string; owner: string; reason: string };

export type WindowResult = {
  start: string;
  end: string;
  included: AccountWindow[];
  /** Accounts the whole must cover and cannot be measured over this window. */
  excluded: Excluded[];
  /** Accounts with nothing to measure over this window — not gaps in the whole. */
  outside: Excluded[];
  /** True only when every account that must be covered is measured. */
  whole: boolean;
  /** The window the included accounts actually span. */
  measuredFrom: string | null;
  measuredTo: string | null;
  days: number | null;
  openValue: number;
  closeValue: number;
  capitalIn: number;
  capitalOut: number;
  gain: number;
};

export type Measured = {
  shown: boolean;
  pct?: number;
  /** "annual", "window" (not annualised), or "cumulative". */
  basis?: "annual" | "window" | "cumulative";
  reason?: string;
  formula: string;
  worked?: string;
  /** Inputs and intermediate values from this very calculation, for the info popup. */
  working?: ReturnWorking;
};

export type ReturnWorking = {
  from: string; to: string; days: number; inception: boolean;
  opening: number; capitalIn: number; capitalOut: number; closing: number; gain: number;
  flows: DatedFlow[];
  base?: number;
  annualPct?: number;
  periodPct?: number;
  growthRatio?: number;
  weighted?: { date: string; amount: number; days: number; weighted: number }[];
};

/** Preserve the same signed, dated terms used by Modified Dietz. */
function weightCapital(working: ReturnWorking) {
  working.weighted = working.flows.map((f) => {
    const date = f.date.toISOString().slice(0, 10);
    // Held to the period: nothing is at work for longer than the period itself.
    const days = Math.min(daysBetween(date, working.to), working.days);
    return { date, amount: -f.amount, days, weighted: -f.amount * days / working.days };
  });
  working.base = working.weighted.reduce((sum, f) => sum + f.weighted, 0);
  return working.base;
}

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const daysBetween = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The opening date of a period ending on `to` — the CLOSE of the day before the period starts. */
export function periodStart(key: PeriodKey, to: string): string | null {
  const d = new Date(`${to}T00:00:00Z`);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  switch (key) {
    case "mtd": return iso(Date.UTC(y, m, 0));
    case "ytd": return `${y - 1}-12-31`;
    case "fytd": return m >= 3 ? `${y}-03-31` : `${y - 1}-03-31`;
    case "y1": case "y2": case "y3": {
      const n = key === "y1" ? 1 : key === "y2" ? 2 : 3;
      // Clamp 29 Feb onto 28 Feb rather than letting Date roll it into March.
      const day = d.getUTCDate();
      const last = new Date(Date.UTC(y - n, m + 1, 0)).getUTCDate();
      return iso(Date.UTC(y - n, m, Math.min(day, last)));
    }
    default: return null;
  }
}

/** Latest valuation on or before `d`, never before `notBefore`. */
function markOnOrBefore(v: Valuation[], d: string, notBefore: string | null, after?: string): Valuation | null {
  let best: Valuation | null = null;
  for (const x of v) {
    if (x.date > d) continue;
    if (notBefore && x.date < notBefore) continue;
    if (after && x.date <= after) continue;
    if (!best || x.date > best.date) best = x;
  }
  return best;
}

/**
 * ── HOW OLD AN OPENING MARK MAY BE (Stage 10fz) ─────────────────────────────
 *
 * An account opens on its latest statement value ON OR BEFORE the opening
 * date, and nothing used to bound how far before. Over October's MTD the two
 * Goldstandard folios opened on 11 Aug marks and Assago 128004 on 13 Aug, so
 * the headline −3.06% "month to date" was a 57-day return. An opening more
 * than this many days before the window opens is not this window's opening:
 * the account is excluded and the reason names the mark's date.
 */
export const OPENING_MARK_TOLERANCE_DAYS = 7;

/** Each account's window, struck on its own marks. */
export function windowReturns(accounts: AccountInput[], start: string, end: string): WindowResult {
  const included: AccountWindow[] = [];
  const excluded: Excluded[] = [];
  const outside: Excluded[] = [];
  for (const a of accounts) {
    const ex = (reason: string) => excluded.push({ accountId: a.accountId, label: a.label, owner: a.owner, reason });
    if (a.outside) { outside.push({ accountId: a.accountId, label: a.label, owner: a.owner, reason: a.outside }); continue; }
    if (a.flowsUnknown) { ex(a.flowsUnknown); continue; }
    const vals = [...a.valuations].sort((x, y) => x.date.localeCompare(y.date));
    let open = markOnOrBefore(vals, start, a.knownFrom);
    let openedInWindow = false;
    if (!open) {
      // An account opened INSIDE the window opens at nil — but only where its
      // record runs from inception, so "nothing before" is a measurement.
      const firstIn = a.flows.filter((f) => f.amount < 0).map((f) => f.date).sort()[0];
      const firstMark = vals[0]?.date;
      if (a.knownFrom == null && firstIn && firstIn > start && (!firstMark || firstMark >= firstIn)) {
        open = { date: start, value: 0 };
        openedInWindow = true;
      } else {
        ex(a.knownFrom && a.knownFrom > start
          ? `its verified dated record opens on ${a.knownFrom}, after this window opens on ${start}, and nothing dates its value or its capital before then`
          : vals.length
          ? `no statement values it on or before ${start} — its first mark is ${vals[0].date}, and its cost is never used as an opening value`
          : "no statement in this book values it");
        continue;
      }
    }
    const stale = openedInWindow ? 0 : daysBetween(open.date, start);
    if (stale > OPENING_MARK_TOLERANCE_DAYS) {
      ex(`its latest statement value on or before ${start} is dated ${open.date}, ${stale} days earlier — a window does not open on a mark more than ${OPENING_MARK_TOLERANCE_DAYS} days old, or its return would cover days the window does not`);
      continue;
    }
    // Close on the last mark on or before the end — and never past where the
    // dated capital record reaches, or a flow after it would read as gain.
    const closeBy = a.knownTo && a.knownTo < end ? a.knownTo : end;
    const close = markOnOrBefore(vals, closeBy, null, open.date);
    if (!close) {
      ex(closeBy < end
        ? `its dated capital record stops on ${closeBy}, before any statement values it after ${open.date}`
        : `no statement values it after ${open.date} and on or before ${end}`);
      continue;
    }
    const gap = a.undated.find((u) => u.from < close.date && u.to > open!.date);
    if (gap) { ex(`its statements print capital no dated row carries between ${gap.from} and ${gap.to}, so the window would read a deposit as performance`); continue; }
    const flows = a.flows.filter((f) => f.date > open!.date && f.date <= close.date);
    const capitalIn = flows.filter((f) => f.amount < 0).reduce((s, f) => s - f.amount, 0);
    const capitalOut = flows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
    if (open.value === 0 && close.value === 0 && flows.length === 0) {
      outside.push({ accountId: a.accountId, label: a.label, owner: a.owner, reason: "it held nothing across the window" });
      continue;
    }
    included.push({
      accountId: a.accountId, label: a.label, owner: a.owner,
      openDate: open.date, openValue: open.value, openedInWindow,
      closeDate: close.date, closeValue: close.value,
      flows, capitalIn, capitalOut,
      gain: close.value - open.value - capitalIn + capitalOut,
    });
  }
  const measuredFrom = included.length ? included.map((x) => x.openDate).sort()[0] : null;
  const measuredTo = included.length ? included.map((x) => x.closeDate).sort().at(-1)! : null;
  const sum = (f: (x: AccountWindow) => number) => included.reduce((s, x) => s + f(x), 0);
  return {
    start, end, included, excluded, outside, whole: included.length > 0 && excluded.length === 0,
    measuredFrom, measuredTo,
    days: measuredFrom && measuredTo ? daysBetween(measuredFrom, measuredTo) : null,
    openValue: sum((x) => x.openValue), closeValue: sum((x) => x.closeValue),
    capitalIn: sum((x) => x.capitalIn), capitalOut: sum((x) => x.capitalOut), gain: sum((x) => x.gain),
  };
}

/** The pooled dated flows of a window, investor's view: each opening an outflow, each closing an inflow. */
export function windowFlows(rows: AccountWindow[]): DatedFlow[] {
  const out: DatedFlow[] = [];
  for (const r of rows) {
    if (r.openValue !== 0) out.push({ date: new Date(t(r.openDate)), amount: -r.openValue });
    for (const f of r.flows) out.push({ date: new Date(t(f.date)), amount: f.amount });
    if (r.closeValue !== 0) out.push({ date: new Date(t(r.closeDate)), amount: r.closeValue });
  }
  return out;
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;

/** One measure over a set of account windows. `money` formats a rupee figure. */
export function measureWindow(rows: AccountWindow[], type: ReturnType, money: (n: number) => string): Measured {
  if (!rows.length) return { shown: false, reason: "no account can be measured over this window", formula: FORMULAS[type] };
  const from = rows.map((r) => r.openDate).sort()[0];
  const to = rows.map((r) => r.closeDate).sort().at(-1)!;
  const D = daysBetween(from, to);
  const V0 = rows.reduce((s, r) => s + r.openValue, 0);
  const V1 = rows.reduce((s, r) => s + r.closeValue, 0);
  const cin = rows.reduce((s, r) => s + r.capitalIn, 0);
  const cout = rows.reduce((s, r) => s + r.capitalOut, 0);
  const C = cin - cout;
  const gain = V1 - V0 - C;
  const formula = FORMULAS[type];
  if (D <= 0) return { shown: false, reason: "the window spans no days", formula };
  const working: ReturnWorking = { from, to, days: D, inception: false,
    opening: V0, capitalIn: cin, capitalOut: cout, closing: V1, gain, flows: windowFlows(rows) };
  const finish = (value: Measured): Measured => ({ ...value, working });

  if (type === "xirr") {
    const r = xirr(working.flows);
    if (r == null) return finish({ shown: false, reason: xirrAmbiguity(working.flows) ?? "these dated flows do not yield a money-weighted rate", formula });
    working.annualPct = r * 100;
    if (D >= 365) return finish({ shown: true, pct: r * 100, basis: "annual", formula,
      worked: `Opening ${money(V0)} on ${from}, ${money(cin)} in and ${money(cout)} out on their dates, closing ${money(V1)} on ${to} → ${pct(r * 100)} a year over ${D} days.` });
    const w = (Math.pow(1 + r, D / 365) - 1) * 100;
    return finish({ shown: true, pct: w, basis: "window", formula,
      worked: `${D} days is under a year, so the rate is not annualised: (1 + ${pct(r * 100)})^(${D}/365) − 1 = ${pct(w)} over the period.` });
  }
  /**
   * ── ABSOLUTE RETURN IS MODIFIED DIETZ OVER A DATED WINDOW (Stage 10fz) ────
   *
   * It divided the gain by `V₀ + capital in`, counting money added on the
   * window's last weeks at the weight of money held all along. Over FYTD that
   * read 12.52% (₹17.84 Cr ÷ ₹142.49 Cr) against Modified Dietz 25.26% and
   * XIRR 25.04%: ₹52.42 Cr of 6-Aug purchases (Helios 10355977, Active
   * Momentum 904168868444) were 37% of the denominator for the window's last
   * two months alone. The industry's period return with dated flows is
   * Modified Dietz — the day-weighted money at work CAGR below already
   * strikes — so both read one denominator, and the hover says which.
   *
   * THE PERIOD STARTS WHEN MONEY IS FIRST AT WORK. Where every included
   * account opens at nil (each funded inside the window), Modified Dietz over
   * the whole window divides a one-day gain by one day's share of the money —
   * YTD's Helios and Active Momentum, bought on 6 Aug, would read their ₹26 K
   * loss on ₹52 Cr as −1.85% instead of −0.005%. A portfolio with no opening
   * value starts its period on its first flow (the GIPS convention), so the
   * day weights run from there.
   */
  const atWork = [
    ...rows.filter((r) => r.openValue !== 0).map((r) => r.openDate),
    ...rows.flatMap((r) => r.flows.filter((f) => f.amount < 0).map((f) => f.date)),
  ].sort()[0];
  const lateStart = atWork != null && atWork > from;
  if (lateStart) { working.from = atWork; working.days = daysBetween(atWork, to); }
  const Dd = working.days;
  if (!(Dd > 0)) return finish({ shown: false, reason: `money was first at work on ${atWork}, the day the window closes, so it was at work for no days`, formula });
  const since = lateStart ? ` from ${atWork}, when money was first at work` : "";
  const denom = weightCapital(working);
  if (type === "absolute") {
    if (!(denom > 0)) return finish({ shown: false, reason: "the money at work over this period is not positive", formula });
    const p = (gain / denom) * 100;
    working.periodPct = p;
    return finish({ shown: true, pct: p, basis: "window", formula,
      worked: `Gain ${money(V1)} − ${money(V0)} − ${money(C)} = ${money(gain)}, over ${money(denom)} at work — each amount counted for the days it was invested (Modified Dietz) → ${pct(p)} over ${Dd} days${since}, not annualised.` });
  }
  // CAGR's period growth uses dated capital weights, including each account's
  // own opening and closing dates, before it is stated per year. It is ONE
  // Modified Dietz period annualised, not a chain of statement intervals
  // (Stage 10fz): the pooled accounts share no set of interval dates to chain
  // on, so the label says which it is rather than claim a time-weighted rate.
  if (!(denom > 0)) return finish({ shown: false, reason: "the money at work over this period is not positive", formula });
  const p = (gain / denom) * 100;
  working.periodPct = p;
  if (Dd < 365) return finish({ shown: false, reason: `CAGR is a yearly growth rate. This app shows it only for measured periods of at least 365 days. This period has ${Dd} days${since}. For a shorter period, select Absolute return or XIRR`, formula });
  const g = (Math.pow(1 + p / 100, 365 / Dd) - 1) * 100;
  return finish({ shown: true, pct: g, basis: "annual", formula,
    worked: `Modified Dietz period return ${pct(p)} across ${Dd} days${since}, annualised: (1 + ${pct(p)})^(365/${Dd}) − 1 = ${pct(g)} a year.` });
}

export const FORMULAS: Record<ReturnType, string> = {
  xirr: "Σ CFₜ ÷ (1 + r)^((t − t₀)/365) = 0 — the opening value as money in, every top-up and withdrawal on its date, the closing value as money out. Under a year: (1 + r)^(days/365) − 1.",
  absolute: "Modified Dietz: (V₁ − V₀ − C) ÷ (V₀ + Σ Cᵢ × days the amount was invested ÷ days in the period)",
  cagr: "Annualised Modified Dietz: ((1 + gain ÷ money at work weighted by days held)^(365 ÷ days) − 1) × 100 — over a year or more",
};

/** The book the Returns tab measures, as `accountInputs` reads it. Every field is an argument, so the suite strikes the page's own inputs. */
export type InputBook = {
  accounts: readonly Account[];
  positions: readonly Position[];
  /** `Portfolio.accountReturnRecords` — the verified return record per account, where the book carries one. */
  returnRecords?: Record<string, AccountReturnCoverage> | null;
  /** `BOOK_ACCOUNT_NAV_HISTORY` — each account's statement valuations. */
  navHistory: Record<string, readonly { date: string; nav: number }[]>;
  /** `BOOK_ACCOUNT_CASH_FLOWS` — read only for an account with no return record. */
  cashFlows: Record<string, readonly CashFlow[]>;
  /** `capitalRollup` over the statement book — read only for an account with no return record. */
  groups: readonly CapitalGroup[];
  /** `BOOK_NAV_COVERAGE.covered` — read only for an account with no return record. */
  coverage: readonly { accountId: string; flowBasis?: string; first: string; last: string }[];
  undated: readonly { accountId: string; from: string; to: string; undated: number }[];
  /** `BOOK_CAPITAL_FROM_INCEPTION` — accounts whose running unit balance starts from nil. */
  fromInception: readonly string[];
  labelOf: (a: Account) => string;
};

const OPENING_ROW = /^opening portfolio value/i;
const dayBefore = (d: string) => iso(t(d) - DAY);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * EVERY ACCOUNT'S VALUATIONS AND DATED FLOWS, FROM THE ONE SELECTED RECORD.
 *
 *   • A VERIFIED RETURN RECORD (`accountReturnInputs`' own record): the account
 *     opens on the record's opening valuation — the close of the day before
 *     its opening row — carries the record's dated flows, and closes no later
 *     than the record's own valuation date, on the record's value. Its
 *     statement marks between those two dates stay, so a window inside the
 *     record (MTD, a custom month) opens and closes on real marks; a mark after
 *     the record's date does not, because no verified flow reaches it. Where
 *     the record opens at a witnessed nil AND the statement's unit balance
 *     starts from nil (`fromInception`), the origin is measured, so the account
 *     opens at nil in any window it was funded inside (Helios 10355977).
 *   • A RECORD THE BOOK REFUSES (`record: null`): excluded with the record's
 *     own gap in every window. The rollup's nil origin is not read in its
 *     place — that is how Active Momentum 904168868444 opened at nil over FYTD
 *     and Sanshi 9039671912 over 1Y while the record refuses both.
 *   • NO RECORD AT ALL (an older book, a fixture): the sources this tab read
 *     before Stage 10fz — the cash-flow opening, the rollup, unit-unchanged
 *     coverage — in that order.
 */
export function accountInputs(book: InputBook): AccountInput[] {
  const coverage = new Map(book.coverage.map((c) => [c.accountId, c]));
  const fromInception = new Set(book.fromInception);
  const out: AccountInput[] = [];
  for (const a of book.accounts) {
    const base = { accountId: a.accountId, label: `${book.labelOf(a)} · ${a.accountNo}`, owner: a.owner };
    const undated = book.undated.filter((u) => u.accountId === a.accountId)
      .map((u) => ({ from: u.from, to: u.to, amount: u.undated }));
    const refuse = (flowsUnknown: string) =>
      out.push({ ...base, valuations: [], flows: [], knownFrom: null, knownTo: null, undated, flowsUnknown });
    if (a.reviewHolder) { refuse("the family's review values its lines on one date, so no window can be struck over it"); continue; }
    const marks = book.navHistory[a.accountId] ?? [];
    const cov = book.returnRecords?.[a.accountId];
    if (cov) {
      const r = cov.record;
      if (!r) {
        refuse(cov.notApplicable ? lowerFirst(cov.notApplicable)
          : `its verified return record refuses it — ${lowerFirst(cov.gap ?? "no verified valuation and dated cash flows")}`);
        continue;
      }
      const opening = r.flows.find((f) => OPENING_ROW.test(f.description ?? ""));
      if (!opening) { refuse("its verified return record carries no opening valuation"); continue; }
      const openDate = dayBefore(opening.date);
      const nilOrigin = opening.amount === 0 && fromInception.has(a.accountId);
      const vals = new Map<string, number>();
      for (const p of marks) if (p.date <= r.asOf && (nilOrigin || p.date >= openDate)) vals.set(p.date, p.nav);
      if (!nilOrigin) vals.set(openDate, -opening.amount);
      vals.set(r.asOf, r.value);
      out.push({ ...base,
        valuations: [...vals].map(([date, value]) => ({ date, value })).sort((x, y) => x.date.localeCompare(y.date)),
        flows: r.flows.filter((f) => f !== opening).map((f) => ({ date: f.date, amount: f.amount, description: f.description })),
        knownFrom: nilOrigin ? null : openDate,
        knownTo: r.capitalRecordTo < r.asOf ? r.capitalRecordTo : r.asOf,
        flowsUnknown: null, undated });
      continue;
    }
    // ── No record for this account: the pre-Stage-10fz sources. ──
    const vals = new Map<string, number>();
    for (const p of marks) vals.set(p.date, p.nav);
    const held = book.positions.filter((p) => p.accountId === a.accountId);
    if (held.length && !vals.has(a.asOf)) vals.set(a.asOf, held.reduce((s, p) => s + (p.marketValue ?? 0), 0));
    const cash = book.cashFlows[a.accountId] ?? [];
    const opening = cash.find((c) => OPENING_ROW.test(c.description ?? ""));
    let flows: Flow[] = [];
    let knownFrom: string | null = null;
    let knownTo: string | null = null;
    let flowsUnknown: string | null = null;
    const mine = book.groups.filter((g) => g.accountId === a.accountId);
    if (opening) {
      const openDate = dayBefore(opening.date);
      vals.set(openDate, -opening.amount);
      flows = cash.filter((c) => c !== opening).map((c) => ({ date: c.date, amount: c.amount }));
      knownFrom = openDate;
      knownTo = a.capitalRecordTo ?? a.asOf;
    } else if (mine.length === 1 && mine[0].flows && mine[0].appreciation != null && capitalWindow(mine[0])) {
      // A rollup with appreciation published passed `contributionsAreComplete`
      // — its record reaches inception on the statement's own evidence — so
      // `knownFrom: null` (nil before the first purchase) is that evidence.
      flows = mine[0].flows.map((f) => ({ date: f.date, amount: f.amount }));
      knownTo = capitalWindow(mine[0])!.to;
    } else if (coverage.get(a.accountId)?.flowBasis === "units-unchanged") {
      const c = coverage.get(a.accountId)!;
      knownFrom = c.first; knownTo = c.last;
    } else {
      flowsUnknown = mine.length
        ? (mine.find((g) => g.incompleteReason)?.incompleteReason ?? "its capital record does not reach the date its value is struck on")
        : "no statement dates the capital put in or taken out";
    }
    out.push({ ...base, valuations: [...vals].map(([date, value]) => ({ date, value })), flows, knownFrom, knownTo, flowsUnknown, undated });
  }
  return out;
}

/**
 * ── THE INDEX ON THE PORTFOLIO'S OWN FLOWS (PME, Stage 10fz) ────────────────
 *
 * The Benchmarks card set a MONEY-weighted portfolio figure beside an index's
 * TIME-weighted close-to-close move over measuredFrom → measuredTo — while
 * ₹37.5 Cr of the pool stopped being measured weeks earlier and 128005's
 * ₹11.24 Cr deposit on 28–29 Jul moved the money weighting. That gap is not
 * like with like. The industry's answer is the public-market equivalent
 * (Long–Nickels, "index XIRR"): every rupee that went in or came out on its
 * date buys or sells the index instead, and each account closes on what that
 * index holding would be worth ON ITS OWN closing date. The SAME measure the
 * portfolio was struck on is then struck over those flows, so the gap compares
 * one definition with itself.
 *
 * `level` is the index close on or before a date. Null, with the reason,
 * where the index has no close for a date a flow needs.
 */
export type IndexLevel = (date: string) => number | null;

export function pmeWindowRows(rows: readonly AccountWindow[], level: IndexLevel): { rows: AccountWindow[]; reason: null } | { rows: null; reason: string } {
  const out: AccountWindow[] = [];
  for (const r of rows) {
    const l1 = level(r.closeDate);
    if (l1 == null || !(l1 > 0)) return { rows: null, reason: `the index has no close on or before ${r.closeDate}` };
    let v = 0;
    const terms: { date: string; put: number }[] = [
      ...(r.openValue !== 0 ? [{ date: r.openDate, put: r.openValue }] : []),
      ...r.flows.map((f) => ({ date: f.date, put: -f.amount })),
    ];
    for (const x of terms) {
      const l = level(x.date);
      if (l == null || !(l > 0)) return { rows: null, reason: `the index has no close on or before ${x.date}, when ${r.label} moved money` };
      v += x.put * (l1 / l);
    }
    out.push({ ...r, closeValue: v, gain: v - r.openValue - r.capitalIn + r.capitalOut });
  }
  return { rows: out, reason: null };
}

export function pmeInceptionRows(rows: readonly InceptionRow[], level: IndexLevel): { rows: InceptionRow[]; reason: null } | { rows: null; reason: string } {
  const out: InceptionRow[] = [];
  for (const r of rows) {
    const l1 = level(r.valueAsOf);
    if (l1 == null || !(l1 > 0)) return { rows: null, reason: `the index has no close on or before ${r.valueAsOf}` };
    let v = 0;
    for (const f of r.flows) {
      const l = level(f.date);
      if (l == null || !(l > 0)) return { rows: null, reason: `the index has no close on or before ${f.date}, when ${r.label} moved money` };
      v += -f.amount * (l1 / l);
    }
    out.push({ ...r, value: v });
  }
  return { rows: out, reason: null };
}

/** Since-investment, on cost: each account's capital, its value and its dated flows. */
export type InceptionRow = {
  accountId: string;
  label: string;
  owner: string;
  first: string;
  valueAsOf: string;
  paidIn: number;
  takenOut: number;
  value: number;
  /** Purchases negative, redemptions positive — no terminal value. */
  flows: Flow[];
};

export function measureInception(rows: InceptionRow[], type: ReturnType, money: (n: number) => string): Measured {
  const formula = INCEPTION_FORMULAS[type];
  if (!rows.length) return { shown: false, reason: "no account publishes a complete dated capital record and a value to close on", formula };
  const paid = rows.reduce((s, r) => s + r.paidIn, 0);
  const out = rows.reduce((s, r) => s + r.takenOut, 0);
  const val = rows.reduce((s, r) => s + r.value, 0);
  const gain = val + out - paid;
  const from = rows.map((r) => r.first).sort()[0];
  const to = rows.map((r) => r.valueAsOf).sort().at(-1)!;
  const D = daysBetween(from, to);
  const flows: DatedFlow[] = [];
  for (const r of rows) {
    for (const f of r.flows) flows.push({ date: new Date(t(f.date)), amount: f.amount });
    // Non-zero, not positive: an index-equivalent value (`pmeInceptionRows`)
    // can be negative where withdrawals outran the index, and it still closes.
    if (r.value !== 0) flows.push({ date: new Date(t(r.valueAsOf)), amount: r.value });
  }
  const working: ReturnWorking = { from, to, days: D, inception: true,
    opening: 0, capitalIn: paid, capitalOut: out, closing: val, gain, flows };
  const finish = (value: Measured): Measured => ({ ...value, working });
  if (type === "absolute") {
    working.base = paid;
    if (!(paid > 0)) return finish({ shown: false, reason: "nothing was paid in", formula });
    const p = (gain / paid) * 100;
    return finish({ shown: true, pct: p, basis: "cumulative", formula,
      worked: `${money(val)} + ${money(out)} − ${money(paid)} = ${money(gain)}, over ${money(paid)} paid in → ${pct(p)} since ${from}, not annualised.` });
  }
  if (type === "xirr") {
    const x = xirr(flows);
    if (x == null) return finish({ shown: false, reason: xirrAmbiguity(flows) ?? "these dated flows do not yield a money-weighted rate", formula });
    working.annualPct = x * 100;
    if (D >= 365) return finish({ shown: true, pct: x * 100, basis: "annual", formula,
      worked: `${money(paid)} in and ${money(out)} out on their own dates since ${from}, each account closing on its own value date (last ${to}), ${money(val)} in all → ${pct(x * 100)} a year.` });
    const w = (Math.pow(1 + x, D / 365) - 1) * 100;
    return finish({ shown: true, pct: w, basis: "window", formula,
      worked: `${D} days is under a year, so the rate is not annualised: ${pct(w)} over the period.` });
  }
  const buys = rows.flatMap((r) => r.flows.filter((f) => f.amount < 0));
  if (buys.length !== 1 || rows.some((r) => r.flows.some((f) => f.amount > 0))) {
    return finish({ shown: false, reason: "the capital went in over several dated purchases, which one compound rate from a single start cannot describe — XIRR is its measure", formula });
  }
  if (D < 365) return finish({ shown: false, reason: `CAGR is a yearly growth rate. This app shows it only for measured periods of at least 365 days. This period has ${D} days. For a shorter period, select Absolute return or XIRR`, formula });
  working.growthRatio = val / paid;
  const g = (Math.pow(val / paid, 365 / D) - 1) * 100;
  return finish({ shown: true, pct: g, basis: "annual", formula, worked: `(${money(val)} ÷ ${money(paid)})^(365/${D}) − 1 = ${pct(g)} a year.` });
}

export const INCEPTION_FORMULAS: Record<ReturnType, string> = {
  xirr: "Σ CFₜ ÷ (1 + r)^((t − t₀)/365) = 0 — every purchase and redemption on its date, each account's value as money out on its own value date",
  absolute: "(Value today + taken out − paid in) ÷ paid in",
  cagr: "(Value today ÷ paid in)^(365 ÷ days since the purchase) − 1 — one purchase only",
};
