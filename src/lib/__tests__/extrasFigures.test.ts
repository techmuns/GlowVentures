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
  // The financial year the newest window closes in, written out again rather
  // than read from `financialYearStart`: 1 April of the year a date in April or
  // later falls in, else of the year before.
  const newest = reported.map((c) => c.periodTo ?? "").sort().at(-1) ?? "";
  const fy = newest ? `${Number(newest.slice(5, 7)) >= 4 ? newest.slice(0, 4) : Number(newest.slice(0, 4)) - 1}-04-01` : "";
  const perOwner = new Map<string, { st: number; lt: number; oneYear: boolean }>();
  for (const c of reported) {
    if (!c.ownerId) continue;
    const e = perOwner.get(c.ownerId) ?? { st: 0, lt: 0, oneYear: true };
    e.st += c.realisedST ?? 0; e.lt += c.realisedLT ?? 0;
    if (!c.periodFrom || c.periodFrom < fy) e.oneYear = false;
    perOwner.set(c.ownerId, e);
  }
  // s.70(2): a short-term loss sets off against the same person's long-term
  // gain; s.70(3): a long-term loss never against a short-term gain.
  const withSetOff = (e: { st: number; lt: number; oneYear: boolean }) => {
    const off = e.oneYear && e.st < 0 && e.lt > 0 ? Math.min(-e.st, e.lt) : 0;
    return Math.max(0, e.st + off) * ST + Math.max(0, e.lt - off) * LT;
  };
  let expected = 0, noSetOff = 0;
  for (const e of perOwner.values()) {
    expected += withSetOff(e);
    noSetOff += Math.max(0, e.st) * ST + Math.max(0, e.lt) * LT;
  }
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

  // THE SET-OFF (A-13). LOAD-BEARING: the book must carry a person whose own
  // short-term loss sits beside their own long-term gain inside one year, or the
  // figure above would pass just as well without the set-off.
  const paired = [...perOwner.entries()].filter(([, e]) => e.oneYear && e.st < 0 && e.lt > 0);
  ok("the book carries a taxpayer whose short-term loss sits beside their own long-term gain, in one year",
    paired.length > 0, paired.map(([o]) => o).join(", "));
  ok("…so the set-off moves the estimate, by more than a lakh",
    Math.abs(noSetOff - expected) > 1e5, `without ${inr(noSetOff)} · with ${inr(expected)}`);
  ok("…and the helper names the amount it set off for each such person",
    paired.every(([o, e]) => near(est.byTaxpayer.find((t) => t.ownerId === o)?.setOff, Math.min(-e.st, e.lt))));
  ok("a long-term loss never absorbs a short-term gain",
    [...perOwner.entries()].filter(([, e]) => e.lt < 0 && e.st > 0).every(([o, e]) =>
      near(est.byTaxpayer.find((t) => t.ownerId === o)?.tax, e.st * ST)));

  // A LOSS CARRIES FORWARD, NEVER BACK. Constructed, because on this book the
  // one taxpayer whose windows span two years has nothing to set off: a
  // short-term loss beside a long-term gain whose windows reach into an earlier
  // year is not set off, and the helper says why.
  const row = (entity: string, ownerId: string, st: number, lt: number, from: string, to: string) =>
    ({ ...reported[0], entity, ownerId, realisedST: st, realisedLT: lt, periodFrom: from, periodTo: to });
  const spans = estimateRealisedTax([
    row("x · A", "x", -100_000, 400_000, "2025-04-01", "2026-07-31"),
    row("y · B", "y", -100_000, 400_000, "2026-04-01", "2026-07-31"),
  ]);
  const x = spans.byTaxpayer.find((t) => t.ownerId === "x"), y = spans.byTaxpayer.find((t) => t.ownerId === "y");
  ok("windows that span financial years strike no set-off, and say so",
    !!x && x.setOff === 0 && x.setOffWithheld && near(x.tax, 400_000 * LT), x ? `${inr(x.tax)}` : "missing");
  ok("…while the same figures inside one year do",
    !!y && near(y.setOff, 100_000) && !y.setOffWithheld && near(y.tax, 300_000 * LT), y ? `${inr(y.tax)}` : "missing");
}

process.exit(fails ? 1 : 0);
