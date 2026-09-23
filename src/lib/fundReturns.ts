// ── WHICH RETURN A PRIVATE FUND IS SHOWING, AND SAYING WHICH ────────────────
//
//   *"Just like you have this return methodology in portfolio monitor we need to
//    have it in private market table as well. The customer is confused about
//    what kind of return this is that we're showing in the private market
//    table."*
//
// The Private Market fund table printed one "Return" column: current value
// against cost, un-annualised, with nothing on screen saying so. That is a real
// figure and it is the least informative one a drawdown fund can be described
// by — the money went in over several calls, some of the funds have paid cash
// back, and neither shows in value ÷ cost.
//
// ── THE MONITOR'S METHODOLOGY, AND ITS HOLDINGS WORDING DOES NOT TRANSFER ────
//
// The picker, the tags and the one-column-per-measure mechanics are shared
// (`ReturnMeasureSelect`, `returnColumns.ts`). What is NOT shared is how a row
// RESOLVES a measure, because the Monitor's reasons are false of a fund:
//
//   · "the statements here cover the current period only, so no per-holding
//     XIRR can be struck" is true of a share in a demat and FALSE of a drawdown
//     fund, whose capital account prints every dated call since its first —
//     and, since Stage 10bw, every dated payout too;
//   · "no purchase date is on file" is false where a fund was paid in ONE
//     dated call, which is exactly a purchase date.
//
// So a fund resolves through `fundMeasuredReturn`, on the record this file
// assembles from `BOOK_COMMITMENTS`, and every refusal names the gap that is
// TRUE of that fund — a return a reader cannot trust is shown as a dash with
// its reason, never as a plausible number.
//
// ── THE FAMILY'S RULE, APPLIED TO A FUND ────────────────────────────────────
//
// "Equity under a year absolute, a year or more CAGR; fixed income XIRR; an XIRR
// when there are multiple tranches." A drawdown fund paid in several calls is
// the "multiple tranches" case by construction, and a fund that has paid cash
// back has flows a CAGR on value cannot see — so both are XIRR. One call and
// nothing paid back is the equity rule. The guard is the one this repo already
// keeps everywhere (Stage 10g(ii)): nothing under a year is ever compounded
// onto one.
//
// ── HPR STAYS WHAT IT IS ON EVERY OTHER PAGE ────────────────────────────────
//
// The Holding Period Return here is the SAME figure the Monitor's AIF section
// prints for the same fund, because one label meaning two figures on two pages
// is the failure this book keeps paying for. Both strike it on the row's own
// Invested (`fundRollup`): the CAPITAL the family put in where the fund's folios
// are whole accounts whose capital is published (`src/lib/capital.ts`), and the
// cost of the units otherwise. On capital a fund's payouts are netted out of
// what it is struck on; on cost they cannot be seen, and there the cell says so
// and names the column that can. Either way the note says which it is.
import type { Commitment, FundPayout, Position } from "./types";
import type { AccountIndex } from "./accounts";
import {
  daysBetween, YEAR_DAYS, returnMeasureDef,
  type MeasuredReturn, type ReturnMeasure,
} from "./analytics";
import { pooledXirr, moneyWeightedReturn } from "./bucketXirr";
import type { FundRow } from "./privateMarket";

type Money = (n: number) => string;
type DateFmt = (iso: string) => string;

/** One dated cash movement between the family and a fund. */
export type FundFlow = {
  date: string;
  /** Positive: what moved. The direction is the `kind`. */
  amount: number;
  kind: "call" | FundPayout["kind"];
  accountId: string;
  label: string | null;
};

/** One folio behind a fund row: the value it closes on, and when. */
export type FundPart = { accountId: string; valuedAt: string; value: number; cost: number | null };

/**
 * ── A FUND ROW'S DATED RECORD ────────────────────────────────────────────────
 *
 * Built over the row's OWN deduped positions, which is load-bearing: the row's
 * value and cost count each `dedupeGroup` once, so its calls must come from the
 * same folios or the two sides of the return describe different money.
 * Transition Venture's two trusts each hold 7,500 units against a ₹75 L call;
 * the row counts the holding once, and pairing it with BOTH trusts' calls would
 * set ₹1.5 Cr of calls against ₹75 L of cost.
 */
export type FundDated = {
  securityKey: string;
  parts: FundPart[];
  /** Calls, oldest first, across the row's folios. */
  calls: FundFlow[];
  /** Payouts dated on or before their folio's valuation — cash OUTSIDE the value. */
  paidBack: FundFlow[];
  /** Payouts dated after the valuation — INSIDE that value, never counted twice. */
  afterValuation: FundFlow[];
  /**
   * `nil`      every folio's statement prints a measured nil
   * `measured` every folio's payout record is carried, and some paid
   * `unknown`  at least one folio carries no payout record at all
   */
  payouts: "nil" | "measured" | "unknown";
  paidOut: number;
  paidOutByKind: Record<FundPayout["kind"], number>;
  firstCall: string | null;
  lastCall: string | null;
  /** The latest valuation date among the row's folios. */
  valuedAt: string | null;
  /** Distinct dated calls — the family's "tranches". */
  tranches: number;
  /**
   * WHY THIS RECORD CANNOT CARRY A DATED RETURN, in a sentence that is true of
   * this fund — or null where it can. Lower-case and full-stop-free, so each
   * measure can put it in its own sentence.
   */
  gap: string | null;
};

const PAYOUT_KINDS: FundPayout["kind"][] = ["income", "capital", "equalisation"];

/**
 * The dated record behind every fund row, keyed on `securityKey`.
 *
 * `dedupedRows` MUST be the rows the fund table's money is struck over
 * (`privateScope(...).dedupedRows`) — see the note on `FundDated`.
 */
export function fundDatedRecords(
  dedupedRows: Position[],
  commitments: Commitment[],
  accIdx: AccountIndex,
  money: Money,
  date: DateFmt,
): Map<string, FundDated> {
  const byAccount = new Map(commitments.map((c) => [c.accountId, c]));
  const groups = new Map<string, Position[]>();
  for (const p of dedupedRows) {
    const g = groups.get(p.securityKey) ?? [];
    g.push(p);
    groups.set(p.securityKey, g);
  }
  const out = new Map<string, FundDated>();
  for (const [key, g] of groups) {
    const parts: FundPart[] = [];
    const calls: FundFlow[] = [];
    const paidBack: FundFlow[] = [];
    const afterValuation: FundFlow[] = [];
    const gaps: string[] = [];
    let unknownPayouts = false;
    let withoutAccount = 0;
    for (const p of g) {
      const valuedAt = accIdx.get(p.accountId)?.asOf ?? null;
      if (!valuedAt) { gaps.push("a folio behind this fund states no valuation date"); continue; }
      parts.push({ accountId: p.accountId, valuedAt, value: p.marketValue, cost: p.costBasis });
      const c = byAccount.get(p.accountId);
      // A folio whose record stops short is UNKNOWN on the payout side too —
      // never "nil", which would say the fund paid nothing.
      if (!c) { withoutAccount++; unknownPayouts = true; continue; }
      if (!c.calls.length) {
        gaps.push("this fund's dated calls did not reproduce the total its own statement prints, so none is carried — and a return over a partial schedule would read as the whole of it");
        unknownPayouts = true;
        continue;
      }
      const sumCalls = c.calls.reduce((t, k) => t + k.amount, 0);
      if (p.costBasis == null || Math.abs(sumCalls - p.costBasis) > 1) {
        gaps.push(`the dated calls add to ${money(sumCalls)} against the ${p.costBasis == null ? "unreported" : money(p.costBasis)} cost its statement reports for this holding, so the two sides of a return would describe different money`);
        unknownPayouts = true;
        continue;
      }
      const late = c.calls.find((k) => k.date > valuedAt);
      if (late) {
        gaps.push(`a call dated ${date(late.date)} is after the ${date(valuedAt)} valuation, so the value it would be measured against does not hold it yet`);
        unknownPayouts = true;
        continue;
      }
      for (const k of c.calls) calls.push({ date: k.date, amount: k.amount, kind: "call", accountId: p.accountId, label: k.label });
      if (c.payouts == null) { unknownPayouts = true; continue; }
      for (const r of c.payouts) {
        const flow: FundFlow = { date: r.date, amount: r.gross, kind: r.kind, accountId: p.accountId, label: r.label };
        // ON the valuation date is OUTSIDE the value: a NAV struck on a
        // distribution date is struck after it (Baring's own summary deducts
        // the distribution to arrive at its NAV). AFTER it is inside.
        (r.date <= valuedAt ? paidBack : afterValuation).push(flow);
      }
    }
    if (withoutAccount === g.length) {
      gaps.push("no capital account for this fund is in the book — its statements report the holding and its cost, and no dated contribution");
    } else if (withoutAccount > 0) {
      gaps.push(`${withoutAccount} of the ${g.length} folios behind this fund carry no dated contribution`);
    }
    calls.sort((a, b) => a.date.localeCompare(b.date));
    paidBack.sort((a, b) => a.date.localeCompare(b.date));
    const paidOutByKind = Object.fromEntries(PAYOUT_KINDS.map((k) =>
      [k, paidBack.filter((f) => f.kind === k).reduce((t, f) => t + f.amount, 0)])) as Record<FundPayout["kind"], number>;
    const paidOut = paidBack.reduce((t, f) => t + f.amount, 0);
    const valuedAt = parts.map((x) => x.valuedAt).sort().pop() ?? null;
    out.set(key, {
      securityKey: key,
      parts, calls, paidBack, afterValuation,
      payouts: unknownPayouts ? "unknown" : paidBack.length || afterValuation.length ? "measured" : "nil",
      paidOut, paidOutByKind,
      firstCall: calls[0]?.date ?? null,
      lastCall: calls[calls.length - 1]?.date ?? null,
      valuedAt,
      tranches: new Set(calls.map((c) => `${c.accountId}|${c.date}`)).size,
      gap: gaps[0] ?? null,
    });
  }
  return out;
}

/**
 * THE MONEY-WEIGHTED RETURN OF ONE OR MORE FUNDS' RECORDS, pooled, each folio
 * closing on its OWN valuation date (`pooledXirr`) — the row's return and the
 * footer's are the same computation over different sets, so they cannot
 * disagree about what a money-weighted return is.
 *
 * Null where any record in the set has a gap or an unknown payout side: a pool
 * that quietly skipped one would be a figure over a set nobody chose.
 */
export function pooledFundXirr(records: FundDated[]): {
  annualPct: number | null; pct: number | null; annualised: boolean; windowDays: number | null;
} | null {
  if (!records.length || records.some((d) => d.gap || d.payouts === "unknown" || !d.firstCall || !d.valuedAt)) return null;
  const parts = records.flatMap((d) => d.parts.map((part) => ({
    flows: [
      ...d.calls.filter((c) => c.accountId === part.accountId).map((c) => ({ date: new Date(c.date), amount: -c.amount })),
      ...d.paidBack.filter((f) => f.accountId === part.accountId).map((f) => ({ date: new Date(f.date), amount: f.amount })),
    ],
    terminalValue: part.value,
    asOf: new Date(part.valuedAt),
  })));
  const annual = pooledXirr(parts);
  const first = records.map((d) => d.firstCall!).sort()[0];
  const last = records.map((d) => d.valuedAt!).sort().pop()!;
  const windowDays = daysBetween(first, last);
  const mw = moneyWeightedReturn(annual, windowDays);
  return { annualPct: annual, pct: mw.pct, annualised: mw.annualised, windowDays: mw.windowDays };
}

/** "income ₹28.2 L, principal ₹14.2 L, equalisation ₹8.7 L" — only the kinds that paid. */
function payoutParts(d: FundDated, money: Money): string {
  const words: Record<FundPayout["kind"], string> = { income: "income", capital: "principal returned", equalisation: "equalisation" };
  return PAYOUT_KINDS.filter((k) => d.paidOutByKind[k] !== 0).map((k) => `${words[k]} ${money(d.paidOutByKind[k])}`).join(", ");
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The return to print for ONE FUND ROW, on the measure the reader picked.
 *
 * `f.returnPct` is the row's value against its own Invested — the capital put
 * in where the row stands on it, the cost of the units otherwise — the Monitor's
 * HPR for the same fund, struck on the same deduped rows, and the ONLY figure
 * here not derived from the dated record. Everything dated comes from `d`.
 */
export function fundMeasuredReturn(
  f: FundRow,
  d: FundDated | undefined,
  measure: ReturnMeasure,
  money: Money,
  date: DateFmt,
): MeasuredReturn {
  const tag = returnMeasureDef(measure).tag;
  const hpr = f.returnPct;
  const noHpr = f.cost == null
    ? "no cost is reported for this fund, so there is no capital to strike a return against"
    : "the cost reported here covers only part of this row's value, and a percentage across the two would divide one set of holdings by another";
  /*
   * WHERE THE PAYOUTS ARE, SAID FOR THE BASIS THIS ROW IS ON. On the cost of the
   * units a payout is invisible, and the cell says XIRR counts it. On the
   * capital put in, the fund's capital account has already netted it out — the
   * capital model reads the SAME dated payouts to the same valuation — so saying
   * "not in this figure" there would be false. The netted sentence is used only
   * where the capital's own taken-out figure IS these payouts, to the rupee;
   * anything else names what the capital was struck on instead.
   */
  const onCap = f.capital?.onCapital.length ? f.capital : null;
  const tookOut = onCap ? onCap.onCapital.reduce((t, x) => t + (x.capital.tookOut ?? 0), 0) : 0;
  const paidNote = d && d.paidOut > 0 && d.valuedAt
    ? !onCap
      ? ` The ${money(d.paidOut)} it had paid back by the ${date(d.valuedAt)} valuation (${payoutParts(d, money)}) is not in this figure — XIRR counts it.`
      : Math.abs(tookOut - d.paidOut) <= 1
        ? ` The ${money(d.paidOut)} it had paid back by the ${date(d.valuedAt)} valuation (${payoutParts(d, money)}) is netted out of the capital this is struck on — XIRR dates each payment.`
        : ` It is struck on the capital put in, net of ${money(tookOut)} taken out as its own record states it; the ${money(d.paidOut)} the fund paid back by the ${date(d.valuedAt)} valuation is dated in the XIRR.`
    : "";
  const hprBasis = onCap && d && d.paidOut > 0
    ? "Current value against the capital put in, net of what the fund has paid back, not annualised."
    : "Current value against the capital paid in, not annualised.";

  if (measure === "absolute") {
    if (hpr == null) return { shown: false, tag, reason: noHpr };
    return { shown: true, pct: hpr, tag, note: `${hprBasis}${paidNote}` };
  }

  if (measure === "calendar") {
    return {
      shown: false, tag,
      reason: `a calendar-year return needs the fund's value at the start and at the end of that year, and no statement in this book values it at a year end — the only valuation here is dated ${d?.valuedAt ? date(d.valuedAt) : "this year"}`,
    };
  }

  if (measure === "cagr") {
    if (hpr == null) return { shown: false, tag, reason: noHpr };
    if (!d || d.gap) return { shown: false, tag, reason: `annualising needs to know when the money went in, and ${d?.gap ?? "no dated contribution for this fund is in the book"}` };
    if (d.tranches > 1) {
      return {
        shown: false, tag,
        reason: `this fund was paid in ${d.tranches} calls between ${date(d.firstCall!)} and ${date(d.lastCall!)}, so there is no one purchase date to compound from — compounding from the first call would credit the later money with time it was not invested. XIRR weights each call by its own date`,
      };
    }
    if (d.payouts === "unknown") {
      return { shown: false, tag, reason: "an annualised return on value alone assumes the fund paid nothing back, and this book carries no payout record for it to confirm that" };
    }
    if (d.paidOut > 0) {
      return { shown: false, tag, reason: `the fund has paid back ${money(d.paidOut)}, which an annualised return on its value alone would leave out — XIRR counts it` };
    }
    const days = daysBetween(d.firstCall!, d.valuedAt!);
    if (days < YEAR_DAYS) {
      return {
        shown: true, pct: hpr, tag: "HPR",
        note: `Paid in ${days} days before the ${date(d.valuedAt!)} valuation — under a year, so this is the holding-period return, not an annual rate.`,
      };
    }
    const growth = 1 + hpr / 100;
    if (growth <= 0) return { shown: false, tag, reason: "this fund is worth nothing against its cost, so it has no compound rate — only a total loss" };
    return {
      shown: true, pct: (Math.pow(growth, YEAR_DAYS / days) - 1) * 100, tag,
      note: `Annualised over the ${days} days from the one call on ${date(d.firstCall!)} to the ${date(d.valuedAt!)} valuation.`,
    };
  }

  if (measure === "xirr") return xirrOf(f, d, money, date);

  if (measure === "ytd") {
    const year = (d?.valuedAt ?? "").slice(0, 4);
    if (!d || d.gap) return { shown: false, tag, reason: `a year-to-date return needs to know whether the fund was held on 1 January and what it was worth then, and ${d?.gap ?? "no dated contribution for this fund is in the book"}` };
    if (d.firstCall! < `${year}-01-01`) {
      return {
        shown: false, tag,
        reason: `the family were already in this fund on 1 January ${year} (first call ${date(d.firstCall!)}), and no statement in this book values it on that date — the only valuation here is dated ${date(d.valuedAt!)}`,
      };
    }
    // Entered during the year: no opening value is missing, because there was
    // none. Its return since the first call IS its year to date.
    const x = xirrOf(f, d, money, date);
    if (!x.shown) return { shown: false, tag, reason: x.reason };
    return { shown: true, pct: x.pct, tag, note: `Entered on ${date(d.firstCall!)}, during ${year}, so its return since the first call is its year to date. ${x.note ?? ""}`.trim() };
  }

  // ── auto: the family's methodology ─────────────────────────────────────────
  if (hpr == null) return { shown: false, tag: "AUTO", reason: noHpr };
  if (!d || d.gap) {
    return {
      shown: true, pct: hpr, tag: "HPR",
      note: `${sentence(d?.gap ?? "no dated contribution for this fund is in the book")}. So it cannot be annualised or money-weighted: this is its holding-period return, current value against cost.`,
    };
  }
  if (d.tranches > 1 || (d.payouts === "measured" && d.paidOut > 0)) {
    const x = xirrOf(f, d, money, date);
    const why = d.tranches > 1 ? `Paid in ${d.tranches} calls` : `One call, and ${money(d.paidOut)} paid back`;
    if (x.shown && x.tag === "XIRR") return { ...x, note: `${why}, so the methodology uses XIRR. ${x.note ?? ""}`.trim() };
    return {
      shown: true, pct: hpr, tag: "HPR",
      note: `${why}, so the methodology would use XIRR — which cannot be struck here because ${x.shown ? "its window is under a year" : x.reason}. This is the holding-period return.${paidNote}`,
    };
  }
  const days = daysBetween(d.firstCall!, d.valuedAt!);
  if (days >= YEAR_DAYS && d.payouts === "nil") {
    const c = fundMeasuredReturn(f, d, "cagr", money, date);
    if (c.shown) return { ...c, note: `One call and nothing paid back, held ${days} days — so the methodology annualises it. ${c.note ?? ""}`.trim() };
  }
  return {
    shown: true, pct: hpr, tag: "HPR",
    note: days < YEAR_DAYS
      ? `Paid in one call ${days} days before the ${date(d.valuedAt!)} valuation — under a year, so the methodology shows the holding-period return, not an annual rate.`
      : `One call, and this book carries no payout record to confirm nothing came back, so the methodology shows the holding-period return.`,
  };
}

/** The XIRR measure, which `auto` and `ytd` also lean on. */
function xirrOf(f: FundRow, d: FundDated | undefined, money: Money, date: DateFmt): MeasuredReturn {
  const tag = "XIRR";
  if (!d || d.gap) return { shown: false, tag, reason: `a money-weighted return needs every dated cash flow, and ${d?.gap ?? "no dated contribution for this fund is in the book"}` };
  if (d.payouts === "unknown") {
    return {
      shown: false, tag,
      reason: "a money-weighted return needs what the fund paid back as well as what it called, and this book carries no dated payout record for it — an XIRR on the calls alone would count any cash it returned as lost",
    };
  }
  const pooled = pooledFundXirr([d]);
  if (!pooled || pooled.pct == null) return { shown: false, tag, reason: "the dated flows do not solve to a rate" };
  const flowsLine = `${d.tranches} dated call${d.tranches === 1 ? "" : "s"}`
    + (d.paidOut > 0 ? `, ${money(d.paidOut)} paid back (${payoutParts(d, money)})` : ", nothing paid back")
    + ` and the ${date(d.valuedAt!)} value`;
  const after = d.afterValuation.reduce((t, x) => t + x.amount, 0);
  const afterLine = after > 0
    ? ` ${money(after)} paid after the valuation is inside that value, so it is not counted again.`
    : "";
  if (pooled.annualised) {
    return {
      shown: true, pct: pooled.pct, tag,
      note: `Money-weighted across ${flowsLine} — annualised over the ${pooled.windowDays} days since the first call.${afterLine}`,
    };
  }
  // UNDER A YEAR. With one call and nothing paid back the money-weighted return
  // over the window IS the holding-period return — the same figure, exactly —
  // so it is shown and tagged for what it is. Anything else under a year has no
  // honest single name here and is refused rather than dressed as an XIRR.
  if (d.tranches === 1 && d.paidOut === 0 && f.returnPct != null) {
    return {
      shown: true, pct: f.returnPct, tag: "HPR",
      note: `The money went in ${pooled.windowDays} days before the valuation — under a year, so an annual rate would be a projection. With one call and nothing paid back, the money-weighted return over that window is the holding-period return.`,
    };
  }
  return {
    shown: false, tag,
    reason: `the dated flows span ${pooled.windowDays} days — under a year, so an annual rate would be a projection of a part-year; the holding-period return is in the HPR column`,
  };
}

/**
 * ── THE HEADER'S NOTE AND HOVER, FROM THE CELLS IT HEADS ────────────────────
 *
 * The Monitor states a column's coverage in its header note and the reason in
 * its hover (`returnColumnMeta`). The same here, struck on the RESOLVED CELLS
 * rather than re-derived, so the count and the dashes under it cannot describe
 * different sets. `auto` gets neither, as on the Monitor: its measure resolves
 * per row and every cell's tag names it.
 */
export function fundReturnColumnMeta(measure: ReturnMeasure, cells: MeasuredReturn[], hint: string):
  { note: string; title: string } | null {
  if (measure === "auto") return null;
  const def = returnMeasureDef(measure);
  const total = cells.length;
  const shown = cells.filter((c) => c.shown).length;
  const onMeasure = cells.filter((c) => c.shown && c.tag === def.tag).length;
  const guarded = shown - onMeasure;
  const absent = total - shown;
  const note = measure === "cagr" || measure === "xirr"
    ? `${onMeasure} ${measure === "cagr" ? "annualised" : "money-weighted"} of ${total}`
    : `${shown} of ${total}`;
  return {
    note,
    title: `${hint} Shown on ${shown} of ${total} ${total === 1 ? "fund" : "funds"}`
      + (guarded > 0 ? `; ${guarded} of those ${guarded === 1 ? "is" : "are"} under a year and show${guarded === 1 ? "s" : ""} the holding-period return instead, marked HPR, because annualising a part-year would state a rate for a year the money has not been invested` : "")
      + (absent > 0 ? `. The other ${absent} ${absent === 1 ? "shows" : "show"} a dash, and each dash says why.` : "."),
  };
}

/**
 * WHY THE FUND TABLE'S FOOTER HAS NO SUCH RETURN, per measure. The footer is
 * the whole private book: it has a cumulative return on cost (under HPR and the
 * methodology) and a pooled money-weighted one (under XIRR), and neither a
 * single purchase date nor a year-end valuation.
 */
export const PM_AGG_NO_MEASURE: Partial<Record<ReturnMeasure, string>> = {
  cagr: "a private book has no one date the money went in — its funds were paid in over years, so compounding from any single date would credit money with time it was not invested. The pooled XIRR is under XIRR.",
  ytd: "a year-to-date return needs the book's value on 1 January, and no statement here values a fund on that date.",
  calendar: "a calendar-year return needs a valuation at both ends of the year, and no statement here values a fund at a year end.",
};

/**
 * THE PICKER'S HINTS WHERE THE MONITOR'S ARE FALSE OF A FUND. Passed to the
 * shared `ReturnMeasureSelect` — the labels, tags and order stay one
 * definition; only the sentence that would mislead is replaced.
 */
export const PM_RETURN_HINTS: Partial<Record<ReturnMeasure, string>> = {
  auto: "One call, held under a year: holding-period return. One call held a year or more: CAGR. More than one dated call, or cash paid back: XIRR. Each cell says which one it is.",
  absolute: "Current value against the capital put in, not annualised. Where a fund's capital account dates every call and payout, what it has paid back is netted out of that capital; where it does not, the payouts are not in this figure. XIRR weights each by its date.",
  cagr: "The return on cost annualised — only for a fund paid in one call at least a year ago that has paid nothing back. A fund paid in several calls is money-weighted instead.",
  xirr: "Money-weighted across every dated call, every dated payout and the value on the fund's statement date — each fund's own capital account prints every one.",
  ytd: "The fund's own return since 1 January — measurable only where it was entered during the year, because no statement here values a fund on 1 January.",
  calendar: "A past calendar year's return — it needs a valuation at both ends of that year, which no statement in this book carries.",
};
