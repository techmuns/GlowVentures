// UNDER A YEAR, A RETURN IS ABSOLUTE; ONLY DEBT IS ANNUALISED (Stage 10hk).
//
// *"whatever investments are being held for less than a year need to show
// only absolute return, even if we have selected XIRR or CAGR return … debt
// investments are to be annualized."* — the family, 22 Oct 2026, after Karur
// Vysya Bank read ~54% on a holding of under a year. Every return surface asks
// `mayAnnualise`; this suite holds each engine to it, on both sides of a year.
import assert from "node:assert/strict";
import {
  mayAnnualise, isDebtHolding, allDebt, measuredReturn, holdingReturn, CASH_EQUIVALENT_KEYS, type ReturnInput, type RowCapital,
} from "../analytics";
import { marketReturnSummary, type MarketUnit } from "../marketReturns";
import { reviewField } from "../reviewColumns";
import { REVIEW_COLUMN_DATA } from "../../data/reviewColumns";
import type { Position } from "../types";

const near = (a: number | null | undefined, b: number, tol = 1e-9) => assert.ok(a != null && Math.abs(a - b) < tol, `${a} != ${b}`);

// ── The rule itself ─────────────────────────────────────────────────────────
assert.equal(mayAnnualise(364, false), false);
assert.equal(mayAnnualise(365, false), true);
assert.equal(mayAnnualise(null, false), false, "an unknown span is not a year");
assert.equal(mayAnnualise(30, true), true, "debt is annualised at any length");

// ── What is debt: a bond, or the family's own Debt class — never their Cash ──
assert.equal(isDebtHolding({ assetClass: "Bond", securityKey: "x" }), true);
assert.equal(isDebtHolding({ assetClass: "Equity", securityKey: "karur-vysya-bank" }), false);
assert.equal(isDebtHolding({ assetClass: "AIF", securityKey: "neo-infra-income-opportunities-fund-i-class-a5", accountId: "neo" }), true,
  "Neo Infra Income is Debt on the family's review");
assert.equal(isDebtHolding({ assetClass: "Unlisted", securityKey: "a-review-line", reviewTaxonomy: { assetClass: "Debt", basket: "Stable Growth" } }), true);
assert.equal(isDebtHolding({ assetClass: "Mutual Fund", securityKey: Object.keys(CASH_EQUIVALENT_KEYS)[0] }), false,
  "a liquid fund is the family's Cash, not Debt");
assert.equal(isDebtHolding({ assetClass: "AIF" }), false, "a row with no security to classify is not debt");
assert.equal(allDebt([{ assetClass: "Bond", marketValue: 10 }, { assetClass: "Equity", marketValue: 0 }]), true, "a nil line does not decide");
assert.equal(allDebt([{ assetClass: "Bond", marketValue: 10 }, { assetClass: "Equity", marketValue: 5 }]), false);
assert.equal(allDebt([]), false);

// ── A holding, by measure ─────────────────────────────────────────────────────
const holding = (o: Partial<ReturnInput> = {}): ReturnInput => ({
  returnPct: 27.74, heldSince: "2026-03-10", valuedAt: "2026-10-06", assetClass: "Equity", securityKey: "karur-vysya-bank",
  purchaseDates: 1, costOfUnitsSold: null, costBasis: 100, marketValue: 127.74, ...o,
});
const AS_OF = "2026-10-06";
// CAGR and XIRR are NA under a year, naming the HPR (Stage 10jh); the methodology view prints it.
for (const measure of ["cagr", "xirr"] as const) {
  const r = measuredReturn(holding(), measure, AS_OF);
  assert.ok(!r.shown && r.na, `${measure} under a year is NA`);
  if (!r.shown) assert.match(r.reason, /under a year.*\+27\.74%/);
}
{
  const r = measuredReturn(holding(), "auto", AS_OF);
  assert.ok(r.shown && r.tag === "HPR");
  if (r.shown) near(r.pct, 27.74);
}
// Bought in lots, under a year: its oldest unit is under a year old, so every unit is — NA, never a dash.
const lots = measuredReturn(holding({ purchaseDates: 3 }), "cagr", AS_OF);
assert.ok(!lots.shown && lots.na);
// NA is what cannot exist; a dash is what a record would fill.
const noDate = measuredReturn(holding({ heldSince: null }), "xirr", AS_OF);
assert.ok(!noDate.shown && !noDate.na, "no dated record is a dash");
const noCostSubYear = measuredReturn(holding({ returnPct: null, costBasis: null }), "cagr", AS_OF);
assert.ok(!noCostSubYear.shown && !noCostSubYear.na, "a missing cost is a dash");
const noOpening = measuredReturn(holding({ heldSince: "2025-01-10" }), "ytd", AS_OF);
assert.ok(!noOpening.shown && !noOpening.na, "a missing 1 January value is a dash");
const fundOnly = measuredReturn(holding({ measuredNA: true }), "absolute", AS_OF);
assert.ok(!fundOnly.shown && fundOnly.na, "a company reached only through funds is NA");
const noYear = measuredReturn(holding(), "calendar", AS_OF);
assert.ok(!noYear.shown && noYear.na, "opened this year: no calendar year to measure");
const several = measuredReturn(holding({ heldSince: "2024-01-10", purchaseDates: 3 }), "cagr", AS_OF);
assert.ok(!several.shown && several.na, "bought on several dates has no single-start CAGR");
// A year or more: CAGR for one purchase, refused for lots (XIRR's).
const old = holding({ heldSince: "2025-01-01" });
const oldCagr = measuredReturn(old, "cagr", AS_OF);
assert.ok(oldCagr.shown && oldCagr.tag === "CAGR");
assert.equal(measuredReturn({ ...old, purchaseDates: 3 }, "cagr", AS_OF).shown, false);
assert.equal(measuredReturn(old, "xirr", AS_OF).shown, false, "no dated record, no XIRR, from a year");
// Debt under a year: compounded to a year.
const debt = holding({ assetClass: "Bond", securityKey: "a-bond" });
const days = 210;
const debtCagr = measuredReturn(debt, "cagr", AS_OF);
assert.ok(debtCagr.shown && debtCagr.tag === "CAGR");
near(debtCagr.shown ? debtCagr.pct : null, (1.2774 ** (365 / days) - 1) * 100, 1e-6);
const hr = holdingReturn(debt, "cagr", AS_OF);
assert.equal(hr.kind, "absolute", "holdingReturn defaults to not debt");
assert.equal(holdingReturn(debt, "cagr", AS_OF, true).kind, "cagr");

// ── Dated capital: several payments under a year ───────────────────────────────
const capital = (o: Partial<Extract<RowCapital, { dated: true }>> = {}): RowCapital => ({
  dated: true, accountIds: ["a"], accounts: 1, flows: 3, since: "2026-03-10", to: "2026-10-06", days, annualPct: 80, ...o,
});
for (const measure of ["cagr", "xirr", "auto"] as const) {
  const r = measuredReturn(holding({ heldSince: null, capital: capital() }), measure, AS_OF);
  if (measure === "auto") assert.ok(r.shown && r.tag === "HPR", "auto: staggered money under a year is its HPR");
  else assert.ok(!r.shown && r.na, `${measure}: staggered money under a year is NA`);
}
const longCap = holding({ heldSince: null, capital: capital({ days: 400, since: "2025-09-01" }) });
assert.equal(measuredReturn(longCap, "cagr", AS_OF).shown, false, "several payments from a year: CAGR refused");
const longX = measuredReturn(longCap, "xirr", AS_OF);
assert.ok(longX.shown && longX.tag === "XIRR"); near(longX.shown ? longX.pct : null, 80);
const debtX = measuredReturn(holding({ heldSince: null, assetClass: "Bond", securityKey: "a-bond", capital: capital() }), "xirr", AS_OF);
assert.ok(debtX.shown && debtX.tag === "XIRR", "debt keeps its yearly rate under a year");
assert.match(debtX.shown ? debtX.note ?? "" : "", /Debt, so it is annualised/);

// ── The market-return card ─────────────────────────────────────────────────────
const unit = (assetClass: string, periodPct: number): MarketUnit => ({
  position: { accountId: "a", securityKey: assetClass === "Bond" ? "a-bond" : "karur-vysya-bank", assetClass, marketValue: 100 } as Position,
  periodPct, from: "2026-03-31", to: "2026-10-06", history: {} as MarketUnit["history"],
});
for (const type of ["xirr", "cagr"] as const) {
  const m = marketReturnSummary([unit("Equity", 20)], type, "2026-03-31", "2026-10-06");
  assert.equal(m.annual, false, `${type} market return under a year is not annualised`); near(m.pct, 20);
}
const bondMarket = marketReturnSummary([unit("Bond", 4)], "xirr", "2026-03-31", "2026-10-06");
assert.equal(bondMarket.annual, true);
const yearMarket = marketReturnSummary([unit("Equity", 20)], "xirr", "2025-03-31", "2026-10-06");
assert.equal(yearMarket.annual, true);

// ── The adviser's printed XIRR (the review columns) ────────────────────────────
// MPS was first bought in June 2026; the review prints +228% "XIRR" on +4% earned.
const mps = REVIEW_COLUMN_DATA.byProduct["mps"];
assert.ok(mps?.schemeXirr && mps.schemeAbsolute && mps.investmentRange?.from === "2026-06", "the fixture is the review's own row");
const mpsXirr = reviewField({ product: "MPS" }, "schemeXirr");
assert.equal(mpsXirr.tag, "ABS"); assert.equal(mpsXirr.value, mps.schemeAbsolute.value);
assert.match(mpsXirr.note ?? "", /under a year before the review's .* date/);
// A product first bought more than a year before the review keeps its XIRR.
const [longName, longRow] = Object.entries(REVIEW_COLUMN_DATA.byProduct)
  .find(([, r]) => r.schemeXirr?.value != null && r.investmentRange?.from && r.investmentRange.from <= "2025-05")!;
const longXirr = reviewField({ product: longName }, "schemeXirr");
assert.equal(longXirr.tag, undefined); assert.equal(longXirr.value, longRow.schemeXirr.value);
// Every other review field is untouched.
assert.equal(reviewField({ product: "MPS" }, "schemeAbsolute").tag, undefined);

console.log("Under a year: absolute on every measure and surface; a year or more annualised; debt annualised at any length — passed.");
