// WHAT A CLUBBED ROW MAY STATE.  npm run test:family
//
// A-02, A-03 and A-14 in docs/FIGURE-AUDIT.md: a row that clubs several
// statement lines set a cost over some lines against the units and value of
// all of them, printed one line's mark over every line's units, and printed a
// ₹0 cost total over a section whose only costed lines are nil balances.
// `costedFigures` and `commonMark` are the one place those are struck; this
// holds them to the GENERATED book, by a second expression, so it moves with
// the next drop rather than going stale on a literal.
import { BOOK_ACCOUNTS } from "@/data/glowData";
import { LIVE_PRICED } from "./liveBook";
import { dedupedPositions, currentHoldings, holdingBucket } from "@/lib/analytics";
import { costedFigures, commonMark, reportsCost } from "@/lib/clubbedFigures";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number | null, b: number, tol: number) => a !== null && Math.abs(a - b) <= tol;

const eng = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a.engagement]));
/**
 * THE BOOK THE MONITOR CLUBS, ON A DAY THE QUOTE FEED ANSWERS. Since Stage 10cz
 * the family's own Motilal demat shares are rows only while a quote prices them
 * (their statement's rate is the last depository movement, never a price), and
 * those uncosted rows are exactly what ICICI Bank's costed Goldstandard lines are
 * clubbed with. On the statement basis alone that case left the book and this
 * suite's load-bearing check passed over nothing — so it reads the live book
 * with a STUB feed pricing every recorded share (`liveBook.ts`), as `check:pages`
 * does with its fixture feed. No stubbed price is asserted on.
 */
const current = currentHoldings(dedupedPositions(LIVE_PRICED));
const byKey = new Map<string, Position[]>();
for (const p of current) byKey.set(p.securityKey, [...(byKey.get(p.securityKey) ?? []), p]);

console.log("\n── cost, its units and its value are struck over ONE set ──");
let mixed = 0;
for (const [key, ps] of byKey) {
  const f = costedFigures(ps);
  // A second expression of the same rule, line by line.
  const costed = ps.filter((p) => !p.costUnavailable && typeof p.costBasis === "number");
  const cost = costed.length ? costed.reduce((s, p) => s + (p.costBasis as number), 0) : null;
  const cv = costed.reduce((s, p) => s + p.marketValue, 0);
  const cu = costed.reduce((s, p) => s + p.quantity, 0);
  const uv = ps.filter((p) => !costed.includes(p)).reduce((s, p) => s + p.marketValue, 0);
  if (costed.length && costed.length < ps.length && uv > 0) mixed++;
  const vac = cost === 0 && cv === 0 && uv !== 0;
  const want = vac ? null : cost;
  const pass = f.cost === want
    && (want === null ? f.unrealised === null : near(f.unrealised, cv - want, 0.01))
    && (want === null || cu === 0 ? f.avgCost === null : near(f.avgCost, want / cu, 1e-6))
    && near(f.costedValue + f.uncosted.value, f.value, 0.01);
  if (!pass) ok(`${key}: cost, units, value and gain on one set`, false, JSON.stringify({ f, cost, cv, cu }));
}
ok("every consolidated row strikes cost, units, value and gain on one set", true, `${byKey.size} rows`);
ok("some row really does club a costed line with an uncosted one (load-bearing)", mixed > 0, `${mixed} such rows`);

console.log("\n── the book's own case: ICICI Bank ──");
{
  const ps = byKey.get("icici-bank") ?? [];
  const f = costedFigures(ps);
  const allUnits = ps.reduce((s, p) => s + p.quantity, 0);
  ok("ICICI Bank is held through lines that report a cost and lines that do not",
    ps.some(reportsCost) && ps.some((p) => !reportsCost(p)), `${ps.length} lines`);
  ok("its average cost is cost over the COSTED units, not over every unit",
    f.avgCost !== null && f.cost !== null && Math.abs(f.avgCost - f.cost / allUnits) > 100,
    `₹${f.avgCost?.toFixed(2)} vs the old ₹${f.cost !== null ? (f.cost / allUnits).toFixed(2) : "—"}`);
  const oldPnl = f.cost === null ? null : f.value - f.cost;
  ok("its unrealised gain is the costed shares' value less their cost, not every share's value",
    f.unrealised !== null && oldPnl !== null && Math.abs(oldPnl - f.unrealised) > 1e6,
    `₹${Math.round(f.unrealised ?? 0).toLocaleString("en-IN")} vs the old ₹${Math.round(oldPnl ?? 0).toLocaleString("en-IN")}`);
}

console.log("\n── a section whose only costed lines are nil balances has no cost total (A-14) ──");
{
  const cash = current.filter((p) => holdingBucket(p, eng.get(p.accountId)) === "Cash");
  const f = costedFigures(cash);
  const nilCosted = cash.filter((p) => reportsCost(p) && p.marketValue === 0 && p.costBasis === 0).length;
  const valued = cash.filter((p) => !reportsCost(p) && p.marketValue > 0).length;
  if (!(nilCosted > 0 && valued > 0)) {
    ok("the Cash section still pairs nil costed sleeves with uncosted liquid funds", false,
      `${nilCosted} nil costed, ${valued} valued uncosted — the case this guards has left the book; re-derive it`);
  } else {
    ok("the Cash section's cost total is absent, never ₹0", f.vacuous && f.cost === null && f.unrealised === null,
      `${nilCosted} nil costed sleeves beside ${valued} uncosted holdings worth ₹${Math.round(f.uncosted.value).toLocaleString("en-IN")}`);
  }
  // …and a genuine measured zero is untouched: a set whose costed lines carry value keeps its cost.
  const g = costedFigures([{ costBasis: 0, costUnavailable: false, marketValue: 0, quantity: 0 }]);
  ok("a set of nothing but nil costed lines keeps its measured ₹0 (there is nothing uncosted beside it)",
    g.cost === 0 && !g.vacuous);
}

console.log("\n── one mark or none (A-03) ──");
{
  const render = (n: number) => n.toFixed(2);
  let split = 0, single = 0;
  for (const [, ps] of byKey) {
    const m = commonMark(ps, render);
    const distinct = new Set(ps.map((p) => p.currentPrice).filter((v): v is number => typeof v === "number").map(render));
    if (distinct.size > 1) { split++; if (m.price !== null) ok("a split mark is refused", false); }
    if (distinct.size === 1) { single++; if (m.price === null || render(m.price) !== [...distinct][0]) ok("a single mark is shown", false); }
  }
  ok("rows whose lines disagree on a mark print none", split > 0, `${split} split rows (load-bearing), ${single} single`);
  const dsp = [...byKey.entries()].find(([k]) => /dsp-gold/.test(k))?.[1] ?? [];
  const dm = commonMark(dsp, render);
  ok("DSP Gold's two statements disagree, so its row prints no single mark", dsp.length < 2 || dm.price === null,
    dm.marks.join(" vs "));
}

console.log(fails ? `\n${fails} failed` : "\nall clubbed-figure checks passed");
process.exit(fails ? 1 : 0);
