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
 * A capital move inside the window is a dated flow, so the four measures
 * handle "investments made during the window" each in their own way and say
 * how.
 */
import { xirr, type DatedFlow } from "@/lib/xirr";

export type PeriodKey = "mtd" | "ytd" | "fytd" | "y1" | "y2" | "y3" | "inception" | "custom";
export type ReturnType = "xirr" | "absolute" | "twr" | "cagr";

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
 * The four returns every investor reads, and nothing more exotic (the family's
 * ask, Stage 10eb). `short` is drawn under the selector; `title` is its hover.
 */
export const RETURN_TYPES: readonly { key: ReturnType; label: string; short: string; title: string }[] = [
  { key: "xirr", label: "XIRR", short: "Yearly rate, timing every rupee in and out",
    title: "XIRR (money-weighted return): the yearly rate that accounts for when each rupee went in and came out. The standard measure for SIPs, top-ups and redemptions. Over less than a year it is shown for the period, never stretched to a year." },
  { key: "absolute", label: "Absolute return", short: "Total gain ÷ money invested, not per year",
    title: "Absolute return: total gain as a percentage of the money invested — the opening value plus anything added during the period. Since investment, gain over what was paid in. Not annualised." },
  { key: "twr", label: "Time-weighted return", short: "Gain ÷ money at work, weighted by days held",
    title: "Time-weighted return (Modified Dietz): gain over the money actually at work, each top-up or withdrawal counted only for the days it was invested. The way fund managers report performance. Not annualised." },
  { key: "cagr", label: "CAGR", short: "Yearly growth rate · needs a year or more",
    title: "CAGR (compound annual growth rate): the steady yearly rate that would turn the starting money into today's value — the time-weighted return stated per year. Only over a year or more." },
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
  excluded: Excluded[];
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
};

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

/** Each account's window, struck on its own marks. */
export function windowReturns(accounts: AccountInput[], start: string, end: string): WindowResult {
  const included: AccountWindow[] = [];
  const excluded: Excluded[] = [];
  for (const a of accounts) {
    const ex = (reason: string) => excluded.push({ accountId: a.accountId, label: a.label, owner: a.owner, reason });
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
        ex(vals.length
          ? `no statement values it on or before ${start} — its first mark is ${vals[0].date}, and its cost is never used as an opening value`
          : "no statement in this book values it");
        continue;
      }
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
      ex("it held nothing across the window");
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
    start, end, included, excluded, measuredFrom, measuredTo,
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

  if (type === "xirr") {
    const r = xirr(windowFlows(rows));
    if (r == null) return { shown: false, reason: "these dated flows do not yield a money-weighted rate", formula };
    if (D >= 365) return { shown: true, pct: r * 100, basis: "annual", formula,
      worked: `Opening ${money(V0)} on ${from}, ${money(cin)} in and ${money(cout)} out on their dates, closing ${money(V1)} on ${to} → ${pct(r * 100)} a year over ${D} days.` };
    const w = (Math.pow(1 + r, D / 365) - 1) * 100;
    return { shown: true, pct: w, basis: "window", formula,
      worked: `${D} days is under a year, so the rate is not annualised: (1 + ${pct(r * 100)})^(${D}/365) − 1 = ${pct(w)} over the period.` };
  }
  if (type === "absolute") {
    const base = V0 + cin;
    if (!(base > 0)) return { shown: false, reason: "nothing was at work at the start or put in during the period", formula };
    const p = (gain / base) * 100;
    return { shown: true, pct: p, basis: "window", formula,
      worked: `Gain ${money(V1)} − ${money(V0)} − ${money(C)} = ${money(gain)}, over ${money(V0)} + ${money(cin)} invested = ${money(base)} → ${pct(p)} over ${D} days, not annualised.` };
  }
  // Time-weighted (Modified Dietz), every opening and closing treated as a
  // dated flow so accounts that open or close on different days pool honestly.
  const T0 = t(from), T1 = t(to), span = T1 - T0;
  const w = (d: string) => (T1 - t(d)) / span;
  let denom = 0;
  for (const r of rows) {
    denom += r.openValue * w(r.openDate);
    for (const f of r.flows) denom += -f.amount * w(f.date);
    denom -= r.closeValue * w(r.closeDate);
  }
  if (!(denom > 0)) return { shown: false, reason: "the money at work over this period is not positive", formula };
  const p = (gain / denom) * 100;
  if (type === "twr") return { shown: true, pct: p, basis: "window", formula,
    worked: `Gain ${money(gain)}, over money at work weighted by days held ${money(denom)} → ${pct(p)} over ${D} days, not annualised.` };
  // CAGR: the time-weighted return stated per year.
  if (D < 365) return { shown: false, reason: `the period is ${D} days, and a return under a year is never stated per year — Time-weighted return is its measure`, formula };
  const g = (Math.pow(1 + p / 100, 365 / D) - 1) * 100;
  return { shown: true, pct: g, basis: "annual", formula,
    worked: `Time-weighted ${pct(p)} over ${D} days: (1 + ${pct(p)})^(365/${D}) − 1 = ${pct(g)} a year.` };
}

export const FORMULAS: Record<ReturnType, string> = {
  xirr: "Σ CFₜ ÷ (1 + r)^((t − t₀)/365) = 0 — the opening value as money in, every top-up and withdrawal on its date, the closing value as money out. Under a year: (1 + r)^(days/365) − 1.",
  absolute: "(V₁ − V₀ − C) ÷ (V₀ + money added during the period)",
  twr: "(V₁ − V₀ − C) ÷ (V₀ + Σ wᵢ·Cᵢ),  wᵢ = days Cᵢ was invested ÷ days in the period",
  cagr: "(1 + time-weighted return)^(365 ÷ days) − 1 — over a year or more",
};

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
  if (type === "absolute") {
    if (!(paid > 0)) return { shown: false, reason: "nothing was paid in", formula };
    const p = (gain / paid) * 100;
    return { shown: true, pct: p, basis: "cumulative", formula,
      worked: `${money(val)} + ${money(out)} − ${money(paid)} = ${money(gain)}, over ${money(paid)} paid in → ${pct(p)} since ${from}, not annualised.` };
  }
  if (type === "xirr") {
    const flows: DatedFlow[] = [];
    for (const r of rows) {
      for (const f of r.flows) flows.push({ date: new Date(t(f.date)), amount: f.amount });
      if (r.value > 0) flows.push({ date: new Date(t(r.valueAsOf)), amount: r.value });
    }
    const x = xirr(flows);
    if (x == null) return { shown: false, reason: "these dated flows do not yield a money-weighted rate", formula };
    if (D >= 365) return { shown: true, pct: x * 100, basis: "annual", formula,
      worked: `${money(paid)} in and ${money(out)} out on their own dates since ${from}, each account closing on its own value date (last ${to}), ${money(val)} in all → ${pct(x * 100)} a year.` };
    const w = (Math.pow(1 + x, D / 365) - 1) * 100;
    return { shown: true, pct: w, basis: "window", formula,
      worked: `${D} days is under a year, so the rate is not annualised: ${pct(w)} over the period.` };
  }
  if (type === "twr") {
    // Modified Dietz from the first purchase: no opening value, each purchase
    // and redemption weighted by the days it was invested, each account's
    // value closing on its own date.
    const T0 = t(from), T1 = t(to), span = T1 - T0;
    if (!(span > 0)) return { shown: false, reason: "the money has been in for no days", formula };
    const w = (d: string) => (T1 - t(d)) / span;
    let denom = 0;
    for (const r of rows) {
      for (const f of r.flows) denom += -f.amount * w(f.date);
      denom -= r.value * w(r.valueAsOf);
    }
    if (!(denom > 0)) return { shown: false, reason: "the money at work since the first purchase is not positive", formula };
    const p = (gain / denom) * 100;
    return { shown: true, pct: p, basis: "cumulative", formula,
      worked: `Gain ${money(gain)}, over money at work weighted by days held ${money(denom)} → ${pct(p)} since ${from}, not annualised.` };
  }
  const buys = rows.flatMap((r) => r.flows.filter((f) => f.amount < 0));
  if (buys.length !== 1 || rows.some((r) => r.flows.some((f) => f.amount > 0))) {
    return { shown: false, reason: "the capital went in over several dated purchases, which one compound rate from a single start cannot describe — XIRR is its measure", formula };
  }
  if (D < 365) return { shown: false, reason: `the money has been in for ${D} days, and a rate under a year is never annualised`, formula };
  const g = (Math.pow(val / paid, 365 / D) - 1) * 100;
  return { shown: true, pct: g, basis: "annual", formula, worked: `(${money(val)} ÷ ${money(paid)})^(365/${D}) − 1 = ${pct(g)} a year.` };
}

export const INCEPTION_FORMULAS: Record<ReturnType, string> = {
  xirr: "Σ CFₜ ÷ (1 + r)^((t − t₀)/365) = 0 — every purchase and redemption on its date, each account's value as money out on its own value date",
  absolute: "(Value today + taken out − paid in) ÷ paid in",
  twr: "Gain ÷ Σ (paid in × days held ÷ days since first purchase)",
  cagr: "(Value today ÷ paid in)^(365 ÷ days since the purchase) − 1 — one purchase only",
};
