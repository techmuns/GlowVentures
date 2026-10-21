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
import fs from "node:fs";
import path from "node:path";
import { BOOK_CAPITAL_GAINS, BOOK_NAV_HISTORY } from "@/data/glowData";
import { estimateRealisedTax } from "@/lib/taxEstimate";
import { bookDrawdown, maxDrawdown } from "@/lib/drawdown";
import type { EntityCG, NavPoint } from "@/lib/types";

const ROOT = process.env.GLOW_FIXTURES ? path.resolve(process.env.GLOW_FIXTURES, "../../../..") : process.cwd();
const AUDIT = path.join(ROOT, "public", "audit");

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number | null | undefined, b: number | null | undefined, tol = 0.01) =>
  typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tol;
const inr = (n: number | null | undefined) => (n == null ? "null" : `₹${n.toFixed(2)}`);

// ── 1. THE TAX ON REALISED GAINS IS STRUCK PER TAXPAYER (XA-1), FOR ONE YEAR ─
{
  // Statutory rates are the one literal a suite may carry (CLAUDE.md §"nothing
  // hardcoded"): STCG u/s 111A, LTCG u/s 112A.
  const ST = 0.2, LT = 0.125;
  const reported = BOOK_CAPITAL_GAINS.filter((c) => c.realisedST !== null || c.realisedLT !== null);
  // The financial year the newest window closes in, written out again rather
  // than read from `financialYearStart`: 1 April of the year a date in April or
  // later falls in, else of the year before.
  const fyOf = (d: string) => `${Number(d.slice(5, 7)) >= 4 ? d.slice(0, 4) : Number(d.slice(0, 4)) - 1}-04-01`;
  const newest = reported.map((c) => c.periodTo ?? "").sort().at(-1) ?? "";
  const fy = newest ? fyOf(newest) : "";

  // THE SPLIT BY YEAR, RE-EXPRESSED FROM THE ARCHIVE. An account whose realised
  // comes from ONE capital gain statement can be summed straight off that
  // document's own lots by the year each was sold in — a second path to the
  // generated `realisedByYear`, which build-book strikes over the deduped union
  // of every issue. (An account with several issues needs that dedupe, so it is
  // held to the identity below instead.)
  const cgDocs = fs.readdirSync(AUDIT).filter((d) => d.endsWith("-capital-gain"));
  type Lot = { saleDate?: string | null; shortTerm?: number | null; longTerm?: number | null };
  const lotsOf = (d: string) => (JSON.parse(fs.readFileSync(path.join(AUDIT, d, "document.json"), "utf8")).capitalGains ?? []) as Lot[];
  const single = reported.filter((c) => c.accountId && cgDocs.filter((d) => d.includes(`-${c.accountId!.split("-").at(-1)}-`) && lotsOf(d).length).length === 1);
  const splitWrong = single.filter((c) => {
    const doc = cgDocs.find((d) => d.includes(`-${c.accountId!.split("-").at(-1)}-`) && lotsOf(d).length)!;
    const by = new Map<string, { st: number; lt: number; lots: number }>();
    for (const l of lotsOf(doc)) {
      const k = typeof l.saleDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.saleDate) ? fyOf(l.saleDate) : "none";
      const e = by.get(k) ?? { st: 0, lt: 0, lots: 0 };
      e.st += l.shortTerm ?? 0; e.lt += l.longTerm ?? 0; e.lots += 1; by.set(k, e);
    }
    const got = c.realisedByYear ?? [];
    return got.length !== by.size || got.some((e) => {
      const w = by.get(e.fy ?? "none");
      return !w || w.lots !== e.lots || !near(w.st, e.st) || !near(w.lt, e.lt);
    });
  });
  ok("each one-statement account's split by year is its own lots summed by the year they were sold in",
    single.length > 0 && splitWrong.length === 0, `${single.length} accounts: ${splitWrong.map((c) => c.entity).join(", ") || "all agree"}`);
  // …and every account's years add up to its realised total, whatever its issues.
  const identityWrong = reported.filter((c) => {
    const y = c.realisedByYear ?? [];
    const tol = 0.01 * Math.max(1, y.length);
    return !y.length || !near(y.reduce((s, e) => s + e.st, 0), c.realisedST ?? 0, tol) || !near(y.reduce((s, e) => s + e.lt, 0), c.realisedLT ?? 0, tol)
      || y.reduce((n, e) => n + e.lots, 0) !== c.lots;
  });
  ok("every reported account's years add up to its realised ST, LT and lots", identityWrong.length === 0,
    identityWrong.map((c) => c.entity).join(", ") || `${reported.length} accounts`);

  // The year's heads per account, re-expressed: the split's own year, a
  // measured ₹0 where the account sold nothing in it, nothing where its window
  // closes before the year opens.
  const yearHeads = (c: EntityCG) => {
    if (c.periodTo && c.periodTo < fy) return { st: null as number | null, lt: null as number | null };
    const y = (c.realisedByYear ?? []).filter((e) => e.fy === fy);
    return {
      st: c.realisedST === null ? null : y.reduce((s, e) => s + e.st, 0),
      lt: c.realisedLT === null ? null : y.reduce((s, e) => s + e.lt, 0),
    };
  };
  const perOwner = new Map<string, { st: number; lt: number }>();
  for (const c of reported) {
    if (!c.ownerId) continue;
    const h = yearHeads(c), e = perOwner.get(c.ownerId) ?? { st: 0, lt: 0 };
    e.st += h.st ?? 0; e.lt += h.lt ?? 0;
    perOwner.set(c.ownerId, e);
  }
  // s.70(2): a short-term loss sets off against the same person's long-term
  // gain; s.70(3): a long-term loss never against a short-term gain. Every
  // figure here is one year's, so the set-off always applies.
  const withSetOff = (e: { st: number; lt: number }) => {
    const off = e.st < 0 && e.lt > 0 ? Math.min(-e.st, e.lt) : 0;
    return Math.max(0, e.st + off) * ST + Math.max(0, e.lt - off) * LT;
  };
  let expected = 0, noSetOff = 0;
  for (const e of perOwner.values()) {
    expected += withSetOff(e);
    noSetOff += Math.max(0, e.st) * ST + Math.max(0, e.lt) * LT;
  }
  const sumST = reported.reduce((s, c) => s + (yearHeads(c).st ?? 0), 0);
  const sumLT = reported.reduce((s, c) => s + (yearHeads(c).lt ?? 0), 0);
  const pooled = Math.max(0, sumST) * ST + Math.max(0, sumLT) * LT;
  const est = estimateRealisedTax(BOOK_CAPITAL_GAINS);

  ok("the book reports realised gains to tax", reported.length > 0, `${reported.length} accounts`);
  ok("the estimate is for the year the newest window closes in", est.year === fy, `${est.year} · ${fy}`);
  ok("the estimate is the per-taxpayer sum over that year's sales, re-expressed from the statements", near(est.total, expected),
    `helper ${inr(est.total)} · re-expressed ${inr(expected)}`);
  ok("…one figure per taxpayer, and they add to the total",
    est.byTaxpayer.length === perOwner.size && near(est.byTaxpayer.reduce((s, t) => s + t.tax, 0), est.total),
    `${est.byTaxpayer.length} taxpayers`);
  ok("…each taxpayer's heads are that taxpayer's own accounts only, in that year",
    est.byTaxpayer.every((t) => {
      const e = perOwner.get(t.ownerId);
      return !!e && near(t.st, e.st) && near(t.lt, e.lt);
    }));

  // LOAD-BEARING: the year matters only where an account's statement reports
  // sales from an EARLIER year — ASK's and Marathon's run from inception. The
  // book must carry one, and striking the estimate on the whole window must
  // move it by more than a lakh, or the year rule could be deleted and the
  // equality above would pass just as well.
  const earlier = reported.filter((c) => (c.realisedByYear ?? []).some((e) => e.fy !== null && e.fy < fy));
  const windowEst = estimateRealisedTax(BOOK_CAPITAL_GAINS.map((c) => ({ ...c, realisedByYear: undefined })));
  ok("the book carries statements reporting sales from earlier financial years", earlier.length > 0,
    earlier.map((c) => c.entity).join(", "));
  ok("…so taxing each whole window would move the estimate, by more than a lakh",
    windowEst.total !== null && est.total !== null && Math.abs(windowEst.total - est.total) > 1e5,
    `whole windows ${inr(windowEst.total)} · this year ${inr(est.total)}`);
  ok("…and the helper names every such account, with the gains it left out",
    est.earlierYears.length === earlier.length && earlier.every((c) => {
      const e = est.earlierYears.find((x) => x.entity === c.entity);
      const w = (c.realisedByYear ?? []).filter((y) => y.fy !== null && y.fy !== fy);
      return !!e && near(e.st, w.reduce((s, y) => s + y.st, 0)) && near(e.lt, w.reduce((s, y) => s + y.lt, 0))
        && e.lots === w.reduce((n, y) => n + y.lots, 0);
    }), est.earlierYears.map((e) => `${e.entity} ${inr(e.st + e.lt)}`).join("; "));
  if (reported.every((c) => (c.realisedByYear ?? []).every((e) => e.fy !== null))) {
    console.log(`NOT CHECKED a lot with no sale date is placed in no year and named — every one of this book's ${reported.reduce((n, c) => n + (c.lots ?? 0), 0)} lots carries a sale date; the constructed case below holds it`);
  }

  // LOAD-BEARING: pooling is only wrong where one member's loss sits beside
  // another member's gain under the same head. The book must carry that, or the
  // equality above would pass just as well against the pooled rule.
  const signs = [...perOwner.values()].map((e) => Math.sign(e.st));
  ok("the book carries a short-term loss beside another taxpayer's short-term gain, in the year",
    signs.includes(-1) && signs.includes(1));
  ok("…so the pooled figure differs from the per-taxpayer one, by more than a lakh",
    Math.abs(pooled - expected) > 1e5, `pooled ${inr(pooled)} · per taxpayer ${inr(expected)}`);
  ok("the helper reports the pooled figure it replaced, over the same year, for the page to state", near(est.pooled, pooled));
  ok("no reported account is left without a canonical owner on this book", est.unattributed.length === 0);

  // THE SET-OFF (A-13). LOAD-BEARING: the book must carry a person whose own
  // short-term loss sits beside their own long-term gain inside the year, or
  // the figure above would pass just as well without the set-off.
  const paired = [...perOwner.entries()].filter(([, e]) => e.st < 0 && e.lt > 0);
  ok("the book carries a taxpayer whose short-term loss sits beside their own long-term gain, in the year",
    paired.length > 0, paired.map(([o]) => o).join(", "));
  ok("…so the set-off moves the estimate, by more than a lakh",
    Math.abs(noSetOff - expected) > 1e5, `without ${inr(noSetOff)} · with ${inr(expected)}`);
  ok("…and the helper names the amount it set off for each such person",
    paired.every(([o, e]) => near(est.byTaxpayer.find((t) => t.ownerId === o)?.setOff, Math.min(-e.st, e.lt))));
  ok("…and strikes no set-off it withholds: every figure is one year's",
    est.byTaxpayer.every((t) => !t.setOffWithheld));
  ok("a long-term loss never absorbs a short-term gain",
    [...perOwner.entries()].filter(([, e]) => e.lt < 0 && e.st > 0).every(([o, e]) =>
      near(est.byTaxpayer.find((t) => t.ownerId === o)?.tax, e.st * ST)));

  // A LOSS CARRIES FORWARD, NEVER BACK. Constructed, because every row on this
  // book is split by sale date: a row with no split falls back to its window,
  // and a short-term loss beside a long-term gain whose window reaches into an
  // earlier year is not set off, and the helper says why.
  const row = (entity: string, ownerId: string, st: number, lt: number, from: string, to: string): EntityCG =>
    ({ ...reported[0], entity, ownerId, realisedST: st, realisedLT: lt, periodFrom: from, periodTo: to, realisedByYear: undefined });
  const spans = estimateRealisedTax([
    row("x · A", "x", -100_000, 400_000, "2025-04-01", "2026-07-31"),
    row("y · B", "y", -100_000, 400_000, "2026-04-01", "2026-07-31"),
  ]);
  const x = spans.byTaxpayer.find((t) => t.ownerId === "x"), y = spans.byTaxpayer.find((t) => t.ownerId === "y");
  ok("an unsplit window that spans financial years strikes no set-off, and says so",
    !!x && x.setOff === 0 && x.setOffWithheld && near(x.tax, 400_000 * LT), x ? `${inr(x.tax)}` : "missing");
  ok("…while the same figures inside one year do",
    !!y && near(y.setOff, 100_000) && !y.setOffWithheld && near(y.tax, 300_000 * LT), y ? `${inr(y.tax)}` : "missing");

  // THE SAME WINDOW, SPLIT BY SALE DATE: only the year's sales are taxed, the
  // set-off is struck, the earlier year is named — and a lot with no sale date
  // is placed in no year and named too. Constructed, because this book has no
  // undated lot and no window closing before the year it is estimated for.
  const split = estimateRealisedTax([
    { ...row("z · C", "z", -100_000 + 50_000 + 30_000, 400_000 + 70_000, "2025-04-01", "2026-07-31"),
      lots: 4,
      realisedByYear: [
        { fy: null, st: 30_000, lt: 0, lots: 1 },
        { fy: "2025-04-01", st: 50_000, lt: 70_000, lots: 1 },
        { fy: "2026-04-01", st: -100_000, lt: 400_000, lots: 2 },
      ] },
    { ...row("w · D", "w", 999_000, 0, "2024-04-01", "2025-12-31"),
      lots: 1, realisedByYear: [{ fy: "2025-04-01", st: 999_000, lt: 0, lots: 1 }] },
  ]);
  const z = split.byTaxpayer.find((t) => t.ownerId === "z"), w = split.byTaxpayer.find((t) => t.ownerId === "w");
  // `st` and `lt` are the year's heads BEFORE the set-off (the helper's own
  // contract); the set-off and the tax struck after it are separate fields.
  ok("constructed: a split window taxes only the year's own sales, with the set-off struck",
    !!z && near(z.st, -100_000) && near(z.lt, 400_000) && near(z.setOff, 100_000) && !z.setOffWithheld && near(z.tax, 300_000 * LT),
    z ? `ST ${inr(z.st)} LT ${inr(z.lt)} tax ${inr(z.tax)}` : "missing");
  ok("constructed: …the earlier year's sales are named and taxed nowhere",
    split.earlierYears.some((e) => e.entity === "z · C" && near(e.st, 50_000) && near(e.lt, 70_000) && e.lots === 1));
  ok("constructed: …a lot with no sale date is placed in no year, and named",
    split.undated.some((e) => e.entity === "z · C" && near(e.st, 30_000) && e.lots === 1));
  ok("constructed: a window that closes before the year opens says nothing about the year — no tax, and its gains named",
    !!w && w.st === null && w.tax === 0 && split.earlierYears.some((e) => e.entity === "w · D" && near(e.st, 999_000)),
    w ? `ST ${String(w.st)} tax ${inr(w.tax)}` : "missing");
}

// ── 2. THE DRAWDOWN IS STRUCK ON THE CHAINED LINK, NEVER ON THE LEVEL (XA-17)
//
// On this book a drawdown struck on the raw level AGREES with the one struck on
// the link: the deepest fall sits inside the complete-panel window with no
// external capital in it. So the page can never see the difference, and this
// is where it is held — on a constructed series whose level and link part.
{
  const pt = (date: string, nav: number, linkOpen: number | null, linkClose: number | null, flowIn = 0): NavPoint =>
    ({ period: date, date, nav, linkOpen, linkClose, flowIn });
  // A fall, then a deposit that lifts the LEVEL above its old high while the
  // holdings go on falling: 100 → 90 → 150, with 70 of new money in the last.
  const hist = [
    pt("2026-01-31", 100, null, null),
    pt("2026-02-28", 90, 100, 90),
    pt("2026-03-31", 150, 90, 150, 70),
  ];
  // Re-expressed: the links are 90/100 and (150 − 70)/90, so the index runs
  // 100 → 90 → 80 — a 20% fall to the last point, never recovered.
  const { drawdown: d } = bookDrawdown(hist);
  ok("the drawdown is struck on the chained link: 100 → 90 → 80 is −20%", near(d?.pct, -20, 1e-9), `${d?.pct}`);
  ok("…its trough is where the index bottomed, not where the level did", d?.troughDate === "2026-03-31", String(d?.troughDate));
  ok("…and a deposit is not a recovery", d?.recoveredOn === null, String(d?.recoveredOn));
  // LOAD-BEARING: struck on the level the same series reads −10%, recovered.
  const onLevel = maxDrawdown(hist.map((p) => ({ date: p.date, index: p.nav })));
  ok("the level would have said otherwise, so the case can tell them apart",
    !!onLevel && !near(onLevel.pct, d?.pct, 1e-6) && onLevel.recoveredOn === "2026-03-31",
    `level ${onLevel?.pct} recovered ${onLevel?.recoveredOn}`);

  // A peak is dated where its level was FIRST reached; an interval that
  // measured nothing repeats the level and is not a new high.
  const flat = maxDrawdown([
    { date: "a", index: 100 }, { date: "b", index: 110 }, { date: "c", index: 110 }, { date: "d", index: 99 },
  ]);
  ok("a peak is dated where its level was first reached", flat?.peakDate === "b" && near(flat?.pct, -10, 1e-9),
    `${flat?.peakDate} ${flat?.pct}`);
  const up = maxDrawdown([{ date: "a", index: 100 }, { date: "b", index: 101 }]);
  ok("an index that never fell is a MEASURED nil with no trough", up?.pct === 0 && up.troughDate === null && up.peakDate === null);
  ok("one level is not a path", maxDrawdown([{ date: "a", index: 100 }]) === null);

  // On the book: the index re-expressed off each point's own link fields, and
  // the peak-to-trough struck here, never through `navIndexSeries`.
  const nav = BOOK_NAV_HISTORY as NavPoint[];
  const idx: { date: string; v: number }[] = [];
  let v = 100;
  nav.forEach((n, i) => {
    if (i > 0) {
      const open = n.linkOpen ?? nav[i - 1].nav, close = n.linkClose ?? n.nav;
      if (open > 0) v *= (close - (n.flowIn ?? 0)) / open;
    }
    idx.push({ date: n.date, v });
  });
  let worst = 0, peakAt = "", troughAt = "", hi = idx[0];
  for (const q of idx.slice(1)) {
    if (q.v > hi.v) { hi = q; continue; }
    const f = (q.v / hi.v - 1) * 100;
    if (f < worst) { worst = f; peakAt = hi.date; troughAt = q.date; }
  }
  const book = bookDrawdown(nav).drawdown;
  ok("the book's dated series has a path to fall along", nav.length >= 2 && worst < 0, `${nav.length} points, ${worst.toFixed(4)}%`);
  ok("the book's drawdown is its link index's own peak-to-trough",
    !!book && near(book.pct, worst, 1e-9) && book.peakDate === peakAt && book.troughDate === troughAt,
    `${book?.pct} ${book?.peakDate}→${book?.troughDate} against ${worst} ${peakAt}→${troughAt}`);
}

process.exit(fails ? 1 : 0);
