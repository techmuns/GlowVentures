// THE WHOLE BOOK'S NAV SERIES (Stage 10gd), CHECKED ON CONSTRUCTED BOOKS AND
// AGAINST THE GENERATED ONE.
//   npm run test:family
//
// Every rule `bookNav.ts` states is a wrong series avoided, so each is struck
// here on a book built to break it: a deposit read as performance, an arrival
// read as a return, a cost read as a valuation, a redemption at a gain carried
// at a cost that no longer exists, and a step no record settles passing as
// measured. Then the real book: every investment holding value is in the
// series, its NAV ties to the statements in named steps, the capital the
// family moved lands on the day it moved, and the return is chained on the link.
import {
  BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_SUMMARY, BOOK_CAPITAL_MOVES, BOOK_ACCOUNT_RETURN_RECORDS,
  BOOK_ACCOUNT_NAV_HISTORY,
} from "@/data/glowData";
import {
  bookNavSeries, bookNavStats, returnEntry, levelEntry, unitValueAt, seriesStart, type NavUnit,
} from "@/lib/bookNav";
import { BOOK_NAV_UNITS, WHOLE_BOOK_NAV } from "@/lib/bookNavBook";
import { navIndexSeries } from "@/lib/navSeries";
import { isValuedAtCost } from "@/lib/analytics";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, got: number | null | undefined, want: number, tol = 0.01) => {
  const pass = got != null && Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want}`); }
  else console.log(`ok   ${name} = ${got}`);
};

const unit = (over: Partial<NavUnit> & { key: string }): NavUnit => ({
  accountId: over.key, securityKey: null, marks: [], flows: [], origin: null, originDated: false,
  atCost: false, recordTo: null, steps: [], bookValue: 0, ...over,
});
const chain = (s: ReturnType<typeof bookNavSeries>) => navIndexSeries(s.points);
const at = (s: ReturnType<typeof bookNavSeries>, d: string) => s.points.find((p) => p.date === d);

const K = 1e5;

// ── 1. A deposit is capital, not performance ────────────────────────────────
{
  const a = unit({
    key: "a", recordTo: "2026-06-30",
    marks: [{ date: "2026-03-31", value: 100 * K, source: "opening" }, { date: "2026-06-30", value: 165 * K, source: "statement" }],
    flows: [{ date: "2026-05-15", amount: 50 * K }],
  });
  const s = bookNavSeries([a]);
  const idx = chain(s);
  near("a deposit lands in the NAV on its own date, at what was paid", at(s, "2026-05-15")?.nav, 150 * K);
  // The deposit buys in at the value the account was last carried at, exactly as
  // a unitised fund issues units at its last struck NAV; the 15 the next
  // valuation shows is then earned on the 150 in the account, not on the 100.
  near("…and is netted out of the return: the deposit buys in at the carried value, 165 / 150", idx.at(-1)?.index, 110, 1e-9);
  near("…and the NAV moves by the whole 65", (at(s, "2026-06-30")?.nav ?? 0) - 100 * K, 65 * K, 1);
  near("the capital is reported where it moved", at(s, "2026-05-15")?.levelFlowIn, 50 * K, 1);
}

// ── 2. An investment arriving at a valuation contributes nothing ────────────
{
  const a = unit({ key: "a", recordTo: "2026-09-30", marks: [
    { date: "2026-03-31", value: 100 * K, source: "opening" }, { date: "2026-09-30", value: 110 * K, source: "statement" }] });
  // Bought long before the window, first valued inside it: no value on 31 Mar.
  const b = unit({ key: "b", origin: "2025-01-01", originDated: true, recordTo: "2026-09-30",
    flows: [{ date: "2025-01-01", amount: 50 * K }],
    marks: [{ date: "2026-06-30", value: 80 * K, source: "book" }, { date: "2026-09-30", value: 88 * K, source: "statement" }] });
  ok("a unit bought before the window and first valued after it joins on that valuation",
    returnEntry(b, "2026-03-31") === "2026-06-30", String(returnEntry(b, "2026-03-31")));
  ok("…but is in the NAV level at its cost from the start", levelEntry(b) === "2025-01-01" && unitValueAt(b, "2026-03-31") === 50 * K);
  const s = bookNavSeries([a, b]);
  const idx = chain(s);
  // The 50 → 80 revaluation (gains since 2025) must not reach the return;
  // only the 80 → 88 after it joined does.
  near("its catch-up revaluation is not in the return", idx.find((p) => p.date === "2026-06-30")?.index, 100);
  near("…its move after joining is: (110 + 88) / (100 + 80)", idx.at(-1)?.index, (198 / 180) * 100, 1e-6);
  ok("the return is complete from the arrival", s.coverage.returnCompleteFrom === "2026-06-30");
}

// ── 3. A line held at cost is in the NAV and never in the return ────────────
{
  const a = unit({ key: "a", recordTo: "2026-06-30", marks: [
    { date: "2026-03-31", value: 100 * K, source: "opening" }, { date: "2026-06-30", value: 105 * K, source: "statement" }] });
  const c = unit({ key: "c", atCost: true, origin: "2024-01-01", originDated: true, recordTo: "2026-06-30",
    flows: [{ date: "2024-01-01", amount: 300 * K }], marks: [{ date: "2026-06-30", value: 300 * K, source: "review" }], bookValue: 300 * K });
  const s = bookNavSeries([a, c]);
  ok("an at-cost line never joins the return", returnEntry(c, "2026-03-31") === null);
  near("…so the return is the valued holding's alone, +5%", chain(s).at(-1)?.index, 105, 1e-9);
  near("…while the NAV carries it at cost", s.points.at(-1)?.nav, 405 * K, 1);
  const st = bookNavStats(s.coverage);
  ok("…and the stats name it as held at cost", st.atCost.length === 1 && st.atCostValue === 300 * K);
}

// ── 4. Bought from nil inside the window: joins on the day it was paid for ──
{
  const a = unit({ key: "a", recordTo: "2026-09-30", marks: [
    { date: "2026-03-31", value: 100 * K, source: "opening" }, { date: "2026-09-30", value: 100 * K, source: "statement" }] });
  const n = unit({ key: "n", origin: "2026-08-06", originDated: true, recordTo: "2026-09-30",
    flows: [{ date: "2026-08-06", amount: 40 * K }], marks: [{ date: "2026-09-30", value: 44 * K, source: "book" }] });
  const s = bookNavSeries([a, n]);
  ok("a purchase from nil inside the window joins the return that day", returnEntry(n, "2026-03-31") === "2026-08-06");
  // Joining from nil leaves nothing out, so it does not delay completeness.
  ok("…and does not delay the whole-book date", s.coverage.returnCompleteFrom === "2026-03-31");
  near("…its gain after purchase is in the return: (100 + 44) / (100 + 40)", chain(s).at(-1)?.index, (144 / 140) * 100, 1e-6);
  near("…and its purchase is capital in the NAV level", at(s, "2026-08-06")?.levelFlowIn, 40 * K, 1);
}

// ── 5. A full redemption is a measured nil, not a cost carried on ───────────
{
  const r = unit({ key: "r", origin: "2024-07-29", originDated: true,
    flows: [{ date: "2024-07-29", amount: 130 * K }, { date: "2025-07-31", amount: -112 * K }],
    marks: [{ date: "2025-07-31", value: 0 * K, source: "nil" }, { date: "2026-07-31", value: 0 * K, source: "book" }] });
  ok("a unit redeemed to nil units is worth nothing after the redemption", unitValueAt(r, "2026-03-31") === 0);
  const g = unit({ key: "g", origin: "2019-01-01", originDated: true,
    flows: [{ date: "2019-01-01", amount: 85 * K }, { date: "2024-11-18", amount: -151 * K }] });
  ok("a cost carried past a redemption at a gain never goes below nil", unitValueAt(g, "2026-03-31") === 0);
}

// ── 6. A step no record settles is carried as unproven, by its MOVE ─────────
{
  const u = unit({ key: "u", marks: [
    { date: "2026-03-31", value: 100 * K, source: "opening" }, { date: "2026-06-30", value: 130 * K, source: "statement" }] });
  const s = bookNavSeries([u]);
  near("an unsettled step's move is named, never its value", at(s, "2026-06-30")?.unreportedFlowValue, 30 * K, 1);
  ok("…and the unit is listed as unproven", s.coverage.units[0].unproven.length === 1);
  // A build proof settles it, and its capital no dated row carries lands on the step's last day.
  const p = unit({ key: "p", marks: u.marks, steps: [{ from: "2026-03-31", to: "2026-06-30", basis: "printed-totals", net: 20 * K }] });
  const sp = bookNavSeries([p]);
  near("a proven step's undated capital is netted at its end: (130 − 20) / 100", chain(sp).at(-1)?.index, 110, 1e-9);
  ok("…and is not unproven", sp.coverage.units[0].unproven.length === 0 && at(sp, "2026-06-30")?.unreportedFlowValue === 0);
}

// ── 7. The window opens on the verified financial-year opening ──────────────
ok("the window opens on the earliest opening valuation",
  seriesStart([unit({ key: "x", marks: [{ date: "2025-07-31", value: K, source: "review" }, { date: "2026-03-31", value: K, source: "opening" }] })]) === "2026-03-31");

// ════════════════════════════════════════════════════════════════════════════
// THE GENERATED BOOK
// ════════════════════════════════════════════════════════════════════════════
const S = WHOLE_BOOK_NAV;
const cov = S.coverage;
const pts = S.points;
ok("the whole-book series exists", pts.length >= 2, `${pts.length} points, ${cov.from} → ${cov.to}`);
ok("its dates are strictly increasing", pts.every((p, i) => i === 0 || p.date > pts[i - 1].date));

// EVERY ACCOUNT HOLDING VALUE IS IN IT — re-derived off the positions.
const holdingAccounts = new Set(BOOK_POSITIONS.filter((p) => Math.abs(p.marketValue) >= 1000).map((p) => p.accountId));
const unitAccounts = new Set(BOOK_NAV_UNITS.map((u) => u.accountId));
const missing = [...holdingAccounts].filter((a) => !unitAccounts.has(a));
ok("every account holding value is an investment in the series", missing.length === 0, missing.join(", "));
const lines = BOOK_POSITIONS.filter((p) => BOOK_ACCOUNTS.find((a) => a.accountId === p.accountId)?.reviewHolder && p.marketValue !== 0);
ok("each review holder line is its own investment",
  lines.every((p) => BOOK_NAV_UNITS.some((u) => u.key === `${p.accountId}|${p.securityKey}`)), `${lines.length} lines`);

// THE NAV TIES TO THE STATEMENTS, in the two named steps.
near("the NAV at the last point is the statement book plus the two named steps",
  cov.levelEnd, cov.statementBook + cov.newerMarks + cov.capitalAfterLastValuation, 1);
near("…and the statement book is BOOK_SUMMARY's", cov.statementBook, BOOK_SUMMARY.totalValue, 1);
// The newer valuations, re-derived here off the records and the statement
// series: for each account, its latest-dated valuation less the book's value.
{
  let newer = 0;
  for (const a of BOOK_ACCOUNTS) {
    const own = BOOK_POSITIONS.filter((p) => p.accountId === a.accountId);
    if (a.reviewHolder || (own.length && own.every((p) => p.review))) continue;
    const book = own.reduce((t, p) => t + p.marketValue, 0);
    const rec = BOOK_ACCOUNT_RETURN_RECORDS[a.accountId]?.record ?? null;
    const cands: { date: string; value: number; rank: number }[] = [];
    if (own.length && a.asOf) cands.push({ date: a.asOf, value: book, rank: 1 });
    if (rec) cands.push({ date: rec.asOf, value: rec.value, rank: 0 });
    for (const p of BOOK_ACCOUNT_NAV_HISTORY[a.accountId] ?? []) cands.push({ date: p.date, value: p.nav, rank: 2 });
    cands.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.rank - y.rank));
    if (cands.length && own.length) newer += cands[0].value - book;
  }
  near("…the newer-valuation step re-derived off the records", cov.newerMarks, newer, 1);
}

// THE CAPITAL LANDS ON THE DAY IT MOVED — anchored on the book's own rows.
const moveOn = (accountPrefix: string, label: RegExp) =>
  BOOK_CAPITAL_MOVES.filter((m) => m.accountId.startsWith(accountPrefix) && label.test(m.label));
const vec = moveOn("v-e-c-assago-capital-management-llp-128005", /Fund Deposit/);
ok("V.E.C 128005's fund deposits are in the book", vec.length >= 2);
for (const m of vec) {
  const p = pts.find((x) => x.date === m.date);
  ok(`…its ₹${(m.amount! / 1e7).toFixed(2)} Cr deposit of ${m.date} is capital on that day, in the NAV and in the return`,
    !!p && (p.levelFlowIn ?? 0) >= m.amount! - 1 && (p.flowIn ?? 0) >= m.amount! - 1);
}
const fresh = moveOn("motilal-oswal-active-momentum-fund", /Purchase/)[0];
if (fresh) {
  const p = pts.find((x) => x.date === fresh.date);
  ok("a purchase from nil (Motilal Active Momentum) is capital in the NAV on its day",
    !!p && (p.levelFlowIn ?? 0) >= fresh.amount! - 1);
}
const threeP = BOOK_ACCOUNT_RETURN_RECORDS["3p-investment-managers-3000048"]?.record?.flows
  .find((f) => /Redemption/i.test(f.description ?? ""));
if (threeP) {
  const p = pts.find((x) => x.date === threeP.date);
  ok("3P's full redemption leaves the NAV on its day", !!p && (p.levelFlowIn ?? 0) <= -threeP.amount + 1);
}

// THE RETURN IS CHAINED ON THE LINK, AND THE LEVEL WOULD SAY SOMETHING ELSE.
const idx = navIndexSeries(pts);
let byLink = 100, byLevel = 100;
for (let i = 1; i < pts.length; i++) {
  const p = pts[i];
  if ((p.linkOpen ?? 0) > 0) byLink *= ((p.linkClose ?? 0) - (p.flowIn ?? 0)) / (p.linkOpen ?? 1);
  if (pts[i - 1].nav > 0) byLevel *= (p.nav - (p.levelFlowIn ?? 0)) / pts[i - 1].nav;
}
near("the chained index is the product of its links, re-derived here", idx.at(-1)?.index, byLink, 1e-6);
ok("…and differs from a level chained through arrivals and first valuations", Math.abs(byLevel - byLink) > 1,
  `${(byLink - 100).toFixed(2)}% vs ${(byLevel - 100).toFixed(2)}%`);
ok("the whole-book date is after the window opens (investments join inside it)",
  !!cov.returnCompleteFrom && !!cov.from && cov.returnCompleteFrom > cov.from, `${cov.from} → ${cov.returnCompleteFrom}`);
const st = bookNavStats(cov);
ok("…and is the last first-valuation arrival",
  cov.returnCompleteFrom === st.joinedLater.map((u) => u.returnFrom as string).sort().at(-1));

// AT COST: the review's at-cost lines, all of them, none in the return.
const atCostBook = BOOK_POSITIONS.filter((p) => isValuedAtCost(p) && p.marketValue !== 0).reduce((t, p) => t + p.marketValue, 0);
near("every line the review holds at cost is out of the return, at its cost", st.atCostValue, atCostBook, 1);
ok("no investment is ever negative", BOOK_NAV_UNITS.every((u) => pts.every((p) => (unitValueAt(u, p.date) ?? 0) >= -1)));
// In the complete segment no unit arrives, so each link's close is the whole panel.
const seg = pts.filter((p) => p.panelComplete);
ok("in the whole-book segment every link closes over the whole panel",
  seg.slice(1).every((p) => Math.abs((p.linkClose ?? 0) - (p.panelValue ?? 0)) <= 1 || st.boughtInWindow.some((u) => u.returnFrom === p.date)),
  `${seg.length} points`);

if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log("\nall whole-book NAV checks pass");
