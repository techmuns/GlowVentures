// THE EXTRAS & ADMIN PAGES' FIGURES — Capital Gains, Snapshot History, Data &
// Refresh, Return & Drawdown, NAV & Performance.
//   npm run test:family
//
// Every expectation here is RE-EXPRESSED from `glowData.ts` by a second path
// and never read back out of the helper under test: a check that calls the
// helper it is checking agrees with it by construction. Where a claim is only
// worth making because the book exercises it (a taxpayer whose loss pooling
// would have hidden, a panel that grew under a raw level), the suite ASSERTS
// the book exercises it, so it cannot pass by accident on a book where the
// right and the wrong answer coincide.
import { BOOK_CAPITAL_GAINS } from "@/data/glowData";
import { estimateRealisedTax } from "@/lib/taxEstimate";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number | null | undefined, b: number | null | undefined, tol = 0.01) =>
  typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tol;
const inr = (n: number | null | undefined) => (n == null ? "null" : `₹${n.toFixed(2)}`);

// ── 1. THE TAX ON REALISED GAINS IS STRUCK PER TAXPAYER (XA-1) ─────────────
{
  // Statutory rates are the one literal a suite may carry (CLAUDE.md §"nothing
  // hardcoded"): STCG u/s 111A, LTCG u/s 112A.
  const ST = 0.2, LT = 0.125;
  const reported = BOOK_CAPITAL_GAINS.filter((c) => c.realisedST !== null || c.realisedLT !== null);
  const perOwner = new Map<string, { st: number; lt: number }>();
  for (const c of reported) {
    if (!c.ownerId) continue;
    const e = perOwner.get(c.ownerId) ?? { st: 0, lt: 0 };
    e.st += c.realisedST ?? 0; e.lt += c.realisedLT ?? 0;
    perOwner.set(c.ownerId, e);
  }
  let expected = 0;
  for (const e of perOwner.values()) expected += Math.max(0, e.st) * ST + Math.max(0, e.lt) * LT;
  const sumST = reported.reduce((s, c) => s + (c.realisedST ?? 0), 0);
  const sumLT = reported.reduce((s, c) => s + (c.realisedLT ?? 0), 0);
  const pooled = Math.max(0, sumST) * ST + Math.max(0, sumLT) * LT;
  const est = estimateRealisedTax(BOOK_CAPITAL_GAINS);

  ok("the book reports realised gains to tax", reported.length > 0, `${reported.length} accounts`);
  ok("the estimate is the per-taxpayer sum, re-expressed from the statements", near(est.total, expected),
    `helper ${inr(est.total)} · re-expressed ${inr(expected)}`);
  ok("…one figure per taxpayer, and they add to the total",
    est.byTaxpayer.length === perOwner.size && near(est.byTaxpayer.reduce((s, t) => s + t.tax, 0), est.total),
    `${est.byTaxpayer.length} taxpayers`);
  ok("…each taxpayer's heads are that taxpayer's own accounts only",
    est.byTaxpayer.every((t) => {
      const e = perOwner.get(t.ownerId);
      return !!e && near(t.st, e.st) && near(t.lt, e.lt);
    }));
  // LOAD-BEARING: pooling is only wrong where one member's loss sits beside
  // another member's gain under the same head. The book must carry that, or the
  // equality above would pass just as well against the pooled rule.
  const signs = [...perOwner.values()].map((e) => Math.sign(e.st));
  ok("the book carries a short-term loss beside another taxpayer's short-term gain",
    signs.includes(-1) && signs.includes(1));
  ok("…so the pooled figure differs from the per-taxpayer one, by more than a lakh",
    Math.abs(pooled - expected) > 1e5, `pooled ${inr(pooled)} · per taxpayer ${inr(expected)}`);
  ok("the helper reports the pooled figure it replaced, for the page to state", near(est.pooled, pooled));
  ok("no reported account is left without a canonical owner on this book", est.unattributed.length === 0);
}

process.exit(fails ? 1 : 0);
