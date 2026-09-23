// WHICH RETURN A PRIVATE FUND IS SHOWING — CHECKED AGAINST THE BOOK.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "Just like you have this return methodology in portfolio monitor we need to
//    have it in private market table as well. The customer is confused about
//    what kind of return this is."
//
// `fundReturns.ts` resolves each measure for a FUND from its dated capital
// account — calls AND payouts — rather than from the Monitor's holdings
// wording. The failures worth catching are the ones that render perfectly:
//
//   • a money-weighted return that forgot the cash a fund paid back, which
//     reads exactly like one that counted it and is lower;
//   • a fund held in two folios whose calls are paired with the row's
//     consolidated cost twice, so the two sides of a return describe different
//     money;
//   • a payout dated AFTER the valuation counted as well as the value that
//     already holds it;
//   • a sub-year window compounded onto a year — the +99.0% failure of Stage
//     10g(ii), arriving through a fund;
//   • a pooled footer that quietly skipped a fund it could not measure.
//
// Anchored on the GENERATED book (`glowData.ts`) through the page's own scope
// helpers, so every expectation is derived on the run or written as a relation
// that survives the next drop moving it.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_COMMITMENTS } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import { currentHoldings, daysBetween, YEAR_DAYS, type MeasuredReturn } from "@/lib/analytics";
import { privateScope, fundRollup, capitalScope } from "@/lib/privateMarket";
import {
  fundDatedRecords, fundMeasuredReturn, pooledFundXirr, fundReturnColumnMeta,
  PM_AGG_NO_MEASURE, PM_RETURN_HINTS, type FundDated,
} from "@/lib/fundReturns";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}`);
};
const money = (n: number) => `₹${(n / 1e7).toFixed(4)} Cr`;
const date = (iso: string) => iso;

const idx = accountIndex(BOOK_ACCOUNTS);
const scope = privateScope(currentHoldings(BOOK_POSITIONS), BOOK_ACCOUNTS);
const onPage = capitalScope(BOOK_COMMITMENTS, BOOK_ACCOUNTS).onPage;
const funds = fundRollup(scope.dedupedRows, idx, scope.rows);
const dated = fundDatedRecords(scope.dedupedRows, onPage, idx, money, date);
const MEASURES = ["auto", "absolute", "cagr", "xirr", "ytd", "calendar"] as const;
const resolve = (key: string, m: typeof MEASURES[number]) => {
  const f = funds.find((x) => x.securityKey === key)!;
  return fundMeasuredReturn(f, dated.get(key), m, money, date);
};

console.log("── the record covers the table ──");
ok("the private scope holds funds to test on", funds.length > 0, String(funds.length));
ok("every fund row has a dated record", funds.every((f) => dated.has(f.securityKey)));

// ── 1. THE RECORD IS BUILT OVER THE ROW'S OWN DEDUPED FOLIOS ─────────────────
console.log("── the record is built over the row's own folios ──");
{
  for (const f of funds) {
    const d = dated.get(f.securityKey)!;
    const deduped = scope.dedupedRows.filter((p) => p.securityKey === f.securityKey);
    ok(`${f.security.slice(0, 32)}: one part per deduped folio`, d.parts.length === deduped.length,
      `${d.parts.length} parts, ${deduped.length} folios`);
    if (d.gap) continue;
    // THE TWO SIDES OF THE RETURN DESCRIBE THE SAME MONEY: the calls the record
    // carries add to the capital the row divides by. Pairing a consolidated cost
    // with both trusts' calls would set twice the money against it.
    //
    // UNDER FIFO THAT CAPITAL IS THE COST HELD PLUS THE COST OF UNITS ALREADY
    // REDEEMED (Stage 10by) — Neo Infra's ₹5 Cr called is ₹4.86 Cr held and
    // ₹14.16 L redeemed. Read off the row's own positions, so a fund that has
    // redeemed nothing still ties to its cost to the rupee.
    const calls = d.calls.reduce((t, c) => t + c.amount, 0);
    const sold = deduped.reduce((t, p) => t + (p.costOfUnitsSold ?? 0), 0);
    ok(`${f.security.slice(0, 32)}: its calls add to the row's own cost held plus the cost of units redeemed`,
      f.cost != null && Math.abs(calls - (f.cost + sold)) <= 1,
      `${money(calls)} vs ${f.cost == null ? "—" : money(f.cost + sold)}`);
  }
  // THE CASE THAT MAKES IT LOAD-BEARING: a fund two folios both report, where
  // the raw rows carry two sets of calls and the row carries one cost.
  const doubled = funds.find((f) => scope.rows.filter((p) => p.securityKey === f.securityKey).length
    > scope.dedupedRows.filter((p) => p.securityKey === f.securityKey).length && !dated.get(f.securityKey)!.gap);
  ok("this book has a fund reported under two folios with a complete dated record", !!doubled);
  if (doubled) {
    const raw = fundDatedRecords(scope.rows, onPage, idx, money, date).get(doubled.securityKey)!;
    const rawCalls = raw.calls.reduce((t, c) => t + c.amount, 0);
    const rowCalls = dated.get(doubled.securityKey)!.calls.reduce((t, c) => t + c.amount, 0);
    ok("…built over the RAW rows it would carry the calls twice", rawCalls > rowCalls * 1.9,
      `raw ${money(rawCalls)} vs row ${money(rowCalls)}`);
  }
}

// ── 2. A PAYOUT IS COUNTED ONCE, ON THE RIGHT SIDE OF THE VALUATION ──────────
console.log("── a payout is counted once ──");
{
  for (const f of funds) {
    const d = dated.get(f.securityKey)!;
    if (d.gap || d.payouts === "unknown") continue;
    const printed = d.parts.flatMap((part) => onPage.find((c) => c.accountId === part.accountId)?.payouts ?? []);
    const carried = [...d.paidBack, ...d.afterValuation];
    ok(`${f.security.slice(0, 32)}: every payout the capital account carries is in exactly one list`,
      carried.length === printed.length
        && Math.abs(carried.reduce((t, x) => t + x.amount, 0) - printed.reduce((t, x) => t + x.gross, 0)) < 0.01,
      `${carried.length} carried of ${printed.length}`);
    const valuedAt = (accountId: string) => d.parts.find((p) => p.accountId === accountId)!.valuedAt;
    ok(`${f.security.slice(0, 32)}: paid back ON or BEFORE the valuation is outside the value`,
      d.paidBack.every((x) => x.date <= valuedAt(x.accountId)));
    ok(`${f.security.slice(0, 32)}: paid AFTER the valuation is inside it, never counted again`,
      d.afterValuation.every((x) => x.date > valuedAt(x.accountId)));
  }
  // THE BOOK HAS BOTH KINDS, or the two checks above run over nothing.
  const all = [...dated.values()];
  ok("this book has a fund that paid cash back before its valuation", all.some((d) => d.paidBack.length > 0));
  ok("…and a payout dated after a valuation, which must not be counted twice", all.some((d) => d.afterValuation.length > 0));
}

// ── 3. THE MONEY-WEIGHTED RETURN COUNTS WHAT WAS PAID BACK ───────────────────
//
// THE LOAD-BEARING CHECK. An XIRR over the calls alone treats every rupee a
// fund returned as lost, and it renders as an ordinary — lower — percentage.
// So the same record with its payouts removed must solve LOWER, on every fund
// that paid anything.
console.log("── the money-weighted return counts the cash paid back ──");
{
  const paying = [...dated.values()].filter((d) => !d.gap && d.payouts === "measured" && d.paidOut > 0);
  ok("this book has funds that paid cash back", paying.length > 0);
  for (const d of paying) {
    const withPay = pooledFundXirr([d]);
    const without = pooledFundXirr([{ ...d, paidBack: [], paidOut: 0 } as FundDated]);
    ok(`${d.securityKey.slice(0, 32)}: counting the payouts raises the rate`,
      withPay?.annualPct != null && without?.annualPct != null && withPay.annualPct > without.annualPct,
      `${withPay?.annualPct?.toFixed(2)} vs ${without?.annualPct?.toFixed(2)}`);
    const f = funds.find((x) => x.securityKey === d.securityKey)!;
    const x = fundMeasuredReturn(f, d, "xirr", money, date);
    ok(`${d.securityKey.slice(0, 32)}: the XIRR column shows it, tagged XIRR`, x.shown && x.tag === "XIRR",
      x.shown ? x.tag : x.reason);
    // AND THE HPR BESIDE IT SAYS WHAT IT CANNOT SEE.
    const h = fundMeasuredReturn(f, d, "absolute", money, date);
    ok(`${d.securityKey.slice(0, 32)}: the HPR cell names the cash it leaves out`,
      h.shown && /paid back/.test(h.note ?? "") && /XIRR counts it/.test(h.note ?? ""), h.shown ? h.note : h.reason);
  }
}

// ── 4. HPR IS THE MONITOR'S FIGURE: FIFO ─────────────────────────────────────
//
// Every return on the dashboard is FIFO (Stage 10by): the gain on the units
// still held plus the gain on units already redeemed, over the cost of both.
// Struck here from the row's own positions' fields by the formula written out,
// never through `fifoTotals` — which is the code under test.
console.log("── HPR is FIFO, the same figure on every page ──");
let redeemedFunds = 0;
for (const f of funds) {
  const h = resolve(f.securityKey, "absolute");
  if (f.cost == null || f.returnPct == null) { ok(`${f.security.slice(0, 32)}: no cost, no HPR`, !h.shown); continue; }
  const ps = scope.dedupedRows.filter((p) => p.securityKey === f.securityKey && p.costBasis != null);
  const held = ps.reduce((t, p) => t + (p.costBasis as number), 0);
  const sold = ps.reduce((t, p) => t + (p.costOfUnitsSold ?? 0), 0);
  const realised = ps.reduce((t, p) => t + (p.realizedPnL ?? 0), 0);
  const mv = ps.reduce((t, p) => t + p.marketValue, 0);
  if (sold > 0) redeemedFunds++;
  const want = ((mv - held + realised) / (held + sold)) * 100;
  ok(`${f.security.slice(0, 32)}: HPR = (unrealised + realised) ÷ (cost held + cost redeemed)`,
    h.shown && Math.abs((h.pct ?? NaN) - want) < 1e-9, `${h.shown ? h.pct : "—"} vs ${want}`);
}
// THE BOOK HAS A FUND THAT REDEEMED UNITS, or the FIFO half of that formula
// is multiplied by zero on every row and the check cannot tell it from
// value ÷ cost.
ok("a private fund in this book has redeemed units, so FIFO's second half is exercised", redeemedFunds > 0,
  `${redeemedFunds} fund(s)`);

// ── 5. NOTHING UNDER A YEAR IS COMPOUNDED ONTO ONE ───────────────────────────
console.log("── the annualisation guard ──");
{
  let annualised = 0;
  for (const f of funds) {
    const d = dated.get(f.securityKey)!;
    for (const m of MEASURES) {
      const r = resolve(f.securityKey, m);
      if (!r.shown || (r.tag !== "CAGR" && r.tag !== "XIRR")) continue;
      annualised++;
      const window = d.firstCall && d.valuedAt ? daysBetween(d.firstCall, d.valuedAt) : 0;
      ok(`${f.security.slice(0, 28)} ${m}: an annual rate only over a year or more`, window >= YEAR_DAYS, `${window} days`);
    }
  }
  ok("some fund is annualised, or the guard above ran over nothing", annualised > 0);
  // THE SUB-YEAR FUND IS SHOWN AS WHAT IT IS, under every measure that shows it.
  const young = funds.find((f) => {
    const d = dated.get(f.securityKey)!;
    return !d.gap && d.firstCall && d.valuedAt && daysBetween(d.firstCall, d.valuedAt) < YEAR_DAYS;
  });
  ok("this book has a fund paid in under a year before its valuation", !!young);
  if (young) {
    for (const m of ["auto", "cagr", "xirr"] as const) {
      const r = resolve(young.securityKey, m);
      ok(`${young.security.slice(0, 28)} ${m}: shown as the holding-period return, tagged HPR`,
        !r.shown || (r.tag === "HPR" && Math.abs((r.pct ?? NaN) - (young.returnPct ?? NaN)) < 1e-9),
        r.shown ? `${r.tag} ${r.pct}` : r.reason);
    }
  }
}

// ── 6. A FUND WITH NO DATED RECORD SAYS SO, UNDER EVERY DATED MEASURE ────────
console.log("── a fund with no capital account ──");
{
  const bare = funds.filter((f) => dated.get(f.securityKey)!.gap);
  ok("this book has a private fund with no capital account", bare.length > 0);
  for (const f of bare) {
    const gap = dated.get(f.securityKey)!.gap!;
    for (const m of ["cagr", "xirr", "ytd"] as const) {
      const r = resolve(f.securityKey, m);
      ok(`${f.security.slice(0, 28)} ${m}: refused, naming the gap`, !r.shown && r.reason.includes(gap), r.shown ? `${r.tag} ${r.pct}` : r.reason);
    }
    const a = resolve(f.securityKey, "auto");
    ok(`${f.security.slice(0, 28)} auto: falls back to HPR and says why`,
      a.shown && a.tag === "HPR" && /cannot be annualised or money-weighted/.test(a.note ?? ""), a.shown ? a.note : a.reason);
  }
}

// ── 7. THE METHODOLOGY ALWAYS RESOLVES TO A NAMED MEASURE ────────────────────
console.log("── the methodology names what it chose ──");
for (const f of funds) {
  const r = resolve(f.securityKey, "auto");
  ok(`${f.security.slice(0, 32)}: auto resolves to a concrete measure`, !r.shown || ["HPR", "CAGR", "XIRR"].includes(r.tag),
    r.shown ? r.tag : r.reason);
  const d = dated.get(f.securityKey)!;
  if (!d.gap && (d.tranches > 1 || d.paidOut > 0)) {
    ok(`${f.security.slice(0, 32)}: several calls or cash back → XIRR`, r.shown && r.tag === "XIRR", r.shown ? r.tag : r.reason);
  }
}

// ── 8. EVERY SENTENCE IS A SENTENCE ──────────────────────────────────────────
//
// A template with a missing field renders "undefined", "null" or "NaN" in a
// hover, which reads as the dashboard being broken rather than the figure
// being absent.
console.log("── every reason and note is well formed ──");
{
  const bad: string[] = [];
  for (const f of funds) for (const m of MEASURES) {
    const r: MeasuredReturn = resolve(f.securityKey, m);
    const text = r.shown ? r.note ?? "" : r.reason;
    if (!r.shown && !text.trim()) bad.push(`${f.securityKey}/${m}: empty reason`);
    if (/\bundefined\b|\bnull\b|\bNaN\b/.test(text)) bad.push(`${f.securityKey}/${m}: ${text.slice(0, 80)}`);
  }
  ok("no reason or note is empty or carries a missing field", bad.length === 0, bad.slice(0, 3).join(" | "));
  ok("every refused aggregate measure has its own reason", (["cagr", "ytd", "calendar"] as const).every((m) => (PM_AGG_NO_MEASURE[m] ?? "").length > 20));
  ok("the picker's hints cover every measure", MEASURES.every((m) => (PM_RETURN_HINTS[m] ?? "").length > 20));
  ok("the XIRR hint no longer says the statements lack dated flows", !/do not carry|not carry per holding/i.test(PM_RETURN_HINTS.xirr ?? ""));
}

// ── 9. THE POOLED FOOTER NEVER SKIPS A FUND SILENTLY ─────────────────────────
console.log("── the pooled footer ──");
{
  const records = funds.map((f) => dated.get(f.securityKey)!);
  const complete = records.filter((d) => !d.gap && d.payouts !== "unknown");
  const pooled = pooledFundXirr(complete);
  ok("the complete records pool to a rate", pooled?.annualPct != null, JSON.stringify(pooled));
  if (pooled) {
    const first = complete.map((d) => d.firstCall!).sort()[0];
    const last = complete.map((d) => d.valuedAt!).sort().pop()!;
    ok("its window runs from the earliest call to the latest valuation", pooled.windowDays === daysBetween(first, last),
      `${pooled.windowDays} vs ${daysBetween(first, last)}`);
    ok("a window of a year or more is annualised, and under one is not", pooled.annualised === (pooled.windowDays! >= YEAR_DAYS));
  }
  // A POOL THAT QUIETLY SKIPPED A FUND IT COULD NOT MEASURE would be a figure
  // over a set nobody chose — so a gap anywhere refuses the whole pool, and the
  // page is left to name what it pooled.
  const gapped = records.find((d) => d.gap);
  if (gapped) ok("a set containing a fund with a gap does not pool at all", pooledFundXirr([...complete, gapped]) === null);
  ok("an empty set does not pool", pooledFundXirr([]) === null);
}

// ── 10. THE HEADER COUNTS ONLY THE CELLS ON ITS OWN MEASURE ──────────────────
console.log("── the header note ──");
{
  const cells: MeasuredReturn[] = [
    { shown: true, pct: 12, tag: "CAGR" },
    { shown: true, pct: 40, tag: "HPR", note: "under a year" },
    { shown: false, tag: "CAGR", reason: "several calls" },
  ];
  const meta = fundReturnColumnMeta("cagr", cells, "hint.");
  ok("the CAGR note counts only the annualised cells", meta?.note === "1 annualised of 3", meta?.note);
  ok("its hover names the guarded cell", /1 of those is under a year/.test(meta?.title ?? ""), meta?.title);
  ok("…and the dash", /The other 1 shows a dash/.test(meta?.title ?? ""), meta?.title);
  ok("the methodology column carries no count", fundReturnColumnMeta("auto", cells, "hint.") === null);
  const x = fundReturnColumnMeta("xirr", [{ shown: true, pct: 5, tag: "XIRR" }], "hint.");
  ok("a single fund reads in the singular", /Shown on 1 of 1 fund\./.test(x?.title ?? ""), x?.title);
}

console.log(fails ? `\n${fails} FAILED` : "\nall fund-return checks passed");
process.exit(fails ? 1 : 0);
