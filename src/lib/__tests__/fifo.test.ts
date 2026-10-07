// FIFO RETURNS, CHECKED THREE WAYS.   npm run test:family
//
// *"Everything in the returns part and all the calculations on the dashboard
// need to be accounted for using the methodology of FIFO … the returns that we
// are showing on the dashboard are completely off."*
//
// ── WHAT THIS SUITE IS FOR ───────────────────────────────────────────────────
//
// The returns were off for three reasons, each of which renders a perfectly
// ordinary percentage and none of which any page could catch:
//
//   1. every aggregate divided the unrealised gain on the shares STILL HELD by
//      what those shares cost — so the gain on every unit already sold left the
//      return (V.E.C 128004 read 8.42% where its own record says 30.10%);
//   2. a fund's class SWITCH was booked as a sale and a purchase at the switch
//      NAV — the family's own contributions vanished from the cost (Buoyant);
//   3. a redemption left a holding at ₹0 with no realised figure (3P, Neo Infra).
//
// So it is checked three ways, and only the third can tell a working engine
// from a plausible one:
//
//   A. the ENGINE against constructed events whose FIFO answer is known — and
//      whose LIFO answer is DIFFERENT, so a queue that takes the newest units
//      first cannot pass;
//   B. the AGGREGATOR against constructed holdings — whole mandate against
//      partial, coverage, and that nothing is ever an average of percentages;
//   C. the GENERATED BOOK against a figure produced on a DIFFERENT path: the
//      fund's own statement of what the family paid in, the manager's own
//      since-inception profit, the redemption the bank received. None is typed
//      in, so none goes stale when the next drop moves the book.
import fs from "node:fs";
import path from "node:path";
import {
  BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_ACCOUNT_BRIDGES, BOOK_CAPITAL_MOVES,
} from "@/data/glowData";
import { fifoLedger, fifoForClass, fifoReturnPct, fifoFromCashFlows } from "../../../shared/fifo.mjs";
import { fifoTotals, fifoBasisNote, realisedReason, positionFifoReturn } from "@/lib/fifo";
import { currentHoldings, dedupedPositions, holdingBucket } from "@/lib/analytics";
import type { Account, Position } from "@/lib/types";

let fails = 0, notChecked = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, got: number | null | undefined, want: number, tol = 0.01) => {
  const pass = typeof got === "number" && Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want} (±${tol})`); }
  else console.log(`ok   ${name} = ${Math.round(got! * 100) / 100}`);
};
const skip = (name: string, why: string) => { notChecked++; console.log(`NOT CHECKED ${name} — ${why}`); };
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// ═══ A. THE ENGINE ═══════════════════════════════════════════════════════════

{
  // Two lots at different costs and one sale that takes part of the second.
  // FIFO takes lot 1 whole and 50 of lot 2 → cost sold 1,000 + 1,000 = 2,000.
  // LIFO takes lot 2 whole and 50 of lot 1 → cost sold 2,000 + 500 = 2,500.
  // The two answers differ, which is the whole point of the case.
  const L = fifoLedger([
    { date: "2025-01-01", kind: "buy", units: 100, amount: 1000 },
    { date: "2025-02-01", kind: "buy", units: 100, amount: 2000 },
    { date: "2025-03-01", kind: "sell", units: 150, amount: 4500 },
  ]);
  near("A1 FIFO: the oldest lot is sold first — cost sold", L.costSold, 2000);
  near("A1 …and the cost still held is half the NEWER lot", L.costHeld, 1000);
  near("A1 …realised is proceeds less that cost", L.realisedGain, 2500);
  ok("A1 …and the remaining lot is the newer one", L.lots.length === 1 && L.lots[0].date === "2025-02-01"
    && Math.abs(L.lots[0].units - 50) < 1e-9);
  ok("A1 …with its purchase history intact", L.lots[0].unitsBought === 100);
}

{
  // THE SWITCH. 100 units of A bought early, 50 of B bought later, then A is
  // switched into B at 2:1. A later sale of 200 B must take the CARRIED lot —
  // it was bought first — and leave the lot bought directly in B untouched.
  // Appended at the back of the queue, the sale would take the newer B lot and
  // the carried one: LIFO wearing FIFO's name, which is the bug the re-sort in
  // `fifoLedger` exists for.
  const events = [
    { date: "2025-01-01", kind: "buy" as const, units: 100, amount: 1000, cls: "A" },
    { date: "2025-02-01", kind: "buy" as const, units: 50, amount: 1000, cls: "B" },
    { date: "2025-03-01", kind: "switch" as const, units: 100, unitsIn: 200, from: "A", to: "B" },
  ];
  const before = fifoLedger(events);
  const carried = before.lots.find((l) => l.carriedFrom === "A");
  ok("A2 a switch carries the lot, it does not sell it", before.realised.length === 0 && !!carried);
  ok("A2 …with its own cost and its own purchase date", !!carried && carried.cost === 1000
    && carried.date === "2025-01-01" && carried.cls === "B" && Math.abs(carried.units - 200) < 1e-9);
  ok("A2 …and the carried lot is FIRST in the class's queue", before.lots[0] === carried);
  near("A2 no cost is lost across the switch", before.costHeld, 2000);

  const after = fifoLedger([...events, { date: "2025-04-01", kind: "sell", units: 200, amount: 5000, cls: "B" }]);
  near("A2 the sale takes the carried lot — cost sold", after.costSold, 1000);
  ok("A2 …which was bought on the ORIGINAL date", after.realised.every((r) => r.buyDate === "2025-01-01"));
  ok("A2 …and leaves the lot bought directly in B", after.lots.length === 1 && after.lots[0].date === "2025-02-01"
    && after.lots[0].carriedFrom === null && after.lots[0].cost === 1000);
  const b = fifoForClass(after, "B");
  near("A2 per-class totals: B's realised gain", b.realisedGain, 4000);
}

{
  // A lot partly sold BEFORE a switch stays partly sold after it.
  const L = fifoLedger([
    { date: "2025-01-01", kind: "buy", units: 100, amount: 1000, cls: "A" },
    { date: "2025-02-01", kind: "sell", units: 40, amount: 600, cls: "A" },
    { date: "2025-03-01", kind: "switch", units: 60, unitsIn: 120, from: "A", to: "B" },
  ]);
  const lot = L.lots[0];
  ok("A3 a partly-sold lot carries its history through a switch", L.lots.length === 1
    && Math.abs(lot.units - 120) < 1e-9 && Math.abs(lot.unitsBought - 200) < 1e-9,
    `units ${lot?.units}, bought ${lot?.unitsBought}`);
  near("A3 …and its remaining cost", lot.cost, 600);
}

{
  // A sale of more units than the record bought is a SHORTFALL, never a lot
  // invented at a cost nobody paid.
  const L = fifoLedger([
    { date: "2025-01-01", kind: "buy", units: 10, amount: 100 },
    { date: "2025-02-01", kind: "sell", units: 15, amount: 300 },
  ]);
  ok("A4 an oversold record is reported as a shortfall", L.shortfalls.length === 1
    && Math.abs(L.shortfalls[0].units - 5) < 1e-9);
  near("A4 …and only the units that were bought carry a cost", L.costSold, 100);
  ok("A4 …no lot is left, and none is invented", L.lots.length === 0);
}

{
  // THE ONE FORMULA. Null wherever the cost is unknown — never 0, which reads as
  // break-even; with nothing sold it is the familiar unrealised ÷ cost.
  ok("A5 no cost → no return", fifoReturnPct(100, null, 0, 0) === null);
  ok("A5 nothing deployed → no return", fifoReturnPct(0, 0, 0, 0) === null);
  near("A5 nothing sold → unrealised ÷ cost", fifoReturnPct(120, 100, null, null), 20);
  // 50 units held at cost 500 worth 600; 50 sold that cost 500 for 900.
  // (100 unrealised + 400 realised) ÷ (500 + 500) = 50%.
  near("A5 sold units stay in the return", fifoReturnPct(600, 500, 400, 500), 50);
  const survivorsOnly = ((600 - 500) / 500) * 100;
  ok("A5 …which the survivors-only formula does not", Math.abs(survivorsOnly - 50) > 10,
    `survivors ${survivorsOnly}%`);
}

// ═══ B. THE AGGREGATOR ═══════════════════════════════════════════════════════

const pos = (o: Partial<Position> & { accountId: string; securityKey: string; marketValue: number }): Position =>
  ({ security: o.securityKey, assetClass: "Equity", quantity: 1, currentPrice: null, ...o } as Position);
const acct = (accountId: string, engagement: Account["engagement"], capital?: Account["capital"]): Account =>
  ({ accountId, engagement, capital, owner: "x", provider: "x", accountNo: accountId } as unknown as Account);

{
  const accounts = [acct("m", "PMS", { contributed: 100_000, withdrawn: 10_000, from: "2025-01-01", to: "2026-01-01", source: "t" })];
  const p1 = pos({ accountId: "m", securityKey: "a", marketValue: 60_000, costBasis: 50_000, realizedPnL: 5_000, costOfUnitsSold: 20_000 });
  const p2 = pos({ accountId: "m", securityKey: "b", marketValue: 50_000, costBasis: 40_000, realizedPnL: 0, costOfUnitsSold: 0 });
  const universe = [p1, p2];

  // Whole: (1,10,000 + 10,000 − 1,00,000) ÷ 1,00,000 = 20%, whatever the window's lots say.
  const whole = fifoTotals(universe, { accounts, universe });
  ok("B1 a set holding every share of a mandate strikes it whole", whole.wholeMandates.join() === "m");
  near("B1 …on its capital: gain", whole.gain, 20_000);
  near("B1 …over what was paid in", whole.deployed, 100_000);
  near("B1 …return", whole.returnPct, 20);
  near("B1 …and the unrealised half is still the holdings' own", whole.unrealised, 20_000);

  // (Every figure clears the ₹1,000 floor — below it a holding is a speck no
  // table draws, and `currentHoldings` would drop it from the universe.)
  // Partial: one share of the mandate is not the mandate — holding by holding.
  const part = fifoTotals([p1], { accounts, universe });
  ok("B2 a set holding PART of a mandate is struck holding by holding", part.wholeMandates.length === 0);
  near("B2 …(10,000 unrealised + 5,000 realised) ÷ (50,000 held + 20,000 sold)", part.returnPct, (15_000 / 70_000) * 100);

  // A sub-₹1,000 speck elsewhere in the account is on no holdings table, so its
  // absence from the set must not stop the rest counting as whole.
  const speck = pos({ accountId: "m", securityKey: "speck", marketValue: 500, costBasis: 400, assetClass: "Equity" });
  const withSpeck = fifoTotals(universe, { accounts, universe: [...universe, speck] });
  ok("B3 a speck the floor drops does not break a mandate's wholeness", withSpeck.wholeMandates.join() === "m");

  // Without the accounts or the universe nothing is struck whole.
  ok("B4 no accounts → nothing whole", fifoTotals(universe, { universe }).wholeMandates.length === 0);
  ok("B4 a non-PMS account is never struck on capital",
    fifoTotals(universe, { accounts: [acct("m", "AIF", accounts[0].capital)], universe }).wholeMandates.length === 0);
}

{
  // NEVER AN AVERAGE OF PERCENTAGES. A ₹1 Cr holding at +10% and a ₹50,000 one
  // at +100%: the book earned 10.05%, the average of the two is 55%.
  const big = pos({ accountId: "d", securityKey: "big", marketValue: 11_000_000, costBasis: 10_000_000 });
  const small = pos({ accountId: "d", securityKey: "small", marketValue: 100_000, costBasis: 50_000 });
  const t = fifoTotals([big, small]);
  near("B5 the aggregate is Σ gain ÷ Σ deployed", t.returnPct, (1_050_000 / 10_050_000) * 100);
  ok("B5 …and is not the mean of the two", Math.abs((t.returnPct ?? 0) - 55) > 40);
}

{
  // COVERAGE. A holding with no cost is counted, never blended in at zero; where
  // it is material the return is refused rather than struck over a fraction.
  const c = pos({ accountId: "d", securityKey: "c", marketValue: 1_000_000, costBasis: 900_000 });
  const u = pos({ accountId: "d", securityKey: "u", marketValue: 1_000_000, costBasis: null });
  const t = fifoTotals([c, u]);
  ok("B6 an uncosted half refuses the return", t.returnPct === null, `got ${t.returnPct}`);
  ok("B6 …and says how much it could not cost", t.uncosted === 1 && t.uncostedValue === 1_000_000);
  const tiny = pos({ accountId: "d", securityKey: "t", marketValue: 1_000, costBasis: null });
  ok("B6 an immaterial uncosted speck does not", fifoTotals([c, tiny]).returnPct !== null);
  // A fully-redeemed holding is worth ₹0 and still earned a return.
  const gone = pos({ accountId: "d", securityKey: "g", marketValue: 0, quantity: 0, costBasis: 0,
    realizedPnL: 20, costOfUnitsSold: 100 });
  near("B7 a holding sold down to nothing keeps its realised return", fifoTotals([gone]).returnPct, 20);
  ok("B8 the basis note names the arithmetic",
    /unrealised .* realised .* capital deployed/.test(fifoBasisNote(fifoTotals([c]), (n) => String(n))));
}

// ═══ C. THE GENERATED BOOK ═══════════════════════════════════════════════════

const byAcct = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
const accountsOf = (id: string) => BOOK_POSITIONS.filter((p) => p.accountId === id);
const one = (acctId: string, key: RegExp) => BOOK_POSITIONS.find((p) => p.accountId === acctId && key.test(p.securityKey));
const bridge = (acctId: string, reportType: string, asOf?: string) =>
  (BOOK_ACCOUNT_BRIDGES[acctId] ?? []).find((b) => b.basis === "since-inception" && b.reportType === reportType
    && (!asOf || b.periodTo === asOf));
const movesIn = (acctId: string) => BOOK_CAPITAL_MOVES.filter((m) => m.accountId === acctId && m.direction === "in");

// C1. EVERY POSITION'S RETURN IS THE ONE FORMULA, ON ITS OWN FIELDS.
{
  let costed = 0, bad: string[] = [];
  for (const p of BOOK_POSITIONS) {
    if (p.costUnavailable || !isNum(p.costBasis)) continue;
    costed += 1;
    const want = positionFifoReturn(p);
    const got = p.returnPct;
    if (want === null ? got !== null && got !== undefined : !isNum(got) || Math.abs(got - want) > 0.006) {
      bad.push(`${p.accountId}/${p.securityKey}: ${got} vs ${want?.toFixed(3)}`);
    }
  }
  ok(`C1 every costed position's returnPct is fifoReturnPct of its own fields (${costed} positions)`,
    costed > 200 && bad.length === 0, bad.slice(0, 3).join(" · "));
}

// C2. BUOYANT — THE CLASS SWITCH IS NOT A SALE.
//
// Two implementations reach this cost: `carryCostThroughSwitches` carries each
// contribution through the switch at the fund's own ratio (the book's source,
// since nothing was sold), and the FIFO engine runs the same unit record on its
// own. The book is held to BOTH — different code over one record, so agreement
// is a real check, and a disagreement means one of them has the wrong units in
// the wrong lot.
const docOf = (key: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/audit", key, "document.json"), "utf8"));
for (const id of ["buoyant-capital-103472", "buoyant-capital-103473"]) {
  const p = one(id, /class-a4/);
  const ph = bridge(id, "performance-history");
  if (!p || !ph) { skip(`C2 ${id}`, "no A4 position or no performance history in this drop"); continue; }
  const deposits = movesIn(id).reduce((s, m) => s + (m.amount ?? 0), 0);
  ok(`C2 ${id}: cost is carried through the switch, not the statement's restamp`, p.costBasisSource === "carried-through-switch");
  const record = docOf(`${id}-2026-07-31-holdings`).cashFlows ?? [];
  const run = fifoFromCashFlows(record);
  const a4 = run?.ledger ? fifoForClass(run.ledger, p.securityKey) : null;
  if (!a4) ok(`C2 ${id}: FIFO runs over the fund's own unit record`, false, run?.reason ?? "no switch or sale in the record");
  else {
    near(`C2 ${id}: FIFO over the unit record reproduces the carried cost`, a4.costHeld, p.costBasis ?? NaN, 1);
    near(`C2 ${id}: …holds exactly the units the statement prints`, a4.unitsHeld, p.quantity!, 0.0005);
    ok(`C2 ${id}: …and finds nothing sold`, a4.realised.length === 0 && run!.ledger!.shortfalls.length === 0);
  }
  // What the family paid in, plus any distribution the fund reinvested into
  // units — which the manager's own bridge reports as INCOME. A second report
  // standing witness for the reinvestment, rather than the book for itself.
  near(`C2 ${id}: FIFO cost = cash deposits + reinvested distribution`, (p.costBasis ?? 0) - deposits, ph.income ?? 0, 0.05);
  ok(`C2 ${id}: …and no unit was sold`, (p.realizedPnL ?? 0) === 0 && (p.costOfUnitsSold ?? 0) === 0);
  // The fund's OWN total gain — realised on the switch plus unrealised — is the
  // same money FIFO reports as unrealised over the family's own cost. Struck on
  // the manager's own closing value and date: the book values each folio on its
  // 31 Aug portfolio snap since the September 2026 delivery, a month after this
  // report, and a gain struck a month later is a different measurement
  // (`carriedCost.test.ts` holds the book's own date to the snap's Profit / Loss).
  ok(`C2 ${id}: the manager's report prints the value its gain is struck on`, isNum(ph.closing), String(ph.closing));
  const fifoGain = (ph.closing ?? NaN) - (p.costBasis ?? 0) + (p.realizedPnL ?? 0);
  near(`C2 ${id}: FIFO gain on the manager's own date = its realised + unrealised`, fifoGain,
    (ph.realized ?? 0) + (ph.unrealized ?? 0), 0.15);
  // And the statement's own restamped cost is off by exactly what the switch
  // "realised" — the reason the old return was wrong.
  const stmt = docOf(`${id}-2026-07-31-holdings`);
  const printed = (stmt.holdings ?? []).find((h: { security: string }) => /A4/.test(h.security))?.totalCost;
  if (!isNum(printed)) { skip(`C2 ${id}: restamped cost`, "no printed cost on the holdings statement"); continue; }
  near(`C2 ${id}: the book keeps the statement's own cost beside it, as a check`, p.printedCostBasis ?? NaN, printed, 0.01);
  near(`C2 ${id}: statement cost − FIFO cost = the switch's booked gain`, printed - (p.costBasis ?? 0), ph.realized ?? 0, 0.1);
  const oldPct = ((p.marketValue - printed) / printed) * 100;
  // The gap between the two returns is the switch's booked gain over the cost —
  // derived from the fund's own figure, never a threshold chosen here.
  const expectedGap = ((ph.realized ?? 0) / printed) * 100;
  ok(`C2 ${id}: …which the restamped cost's return misses (load-bearing)`,
    Math.abs((p.returnPct ?? 0) - oldPct) >= 0.9 * expectedGap && expectedGap > 0,
    `FIFO ${p.returnPct}% vs restamped ${oldPct.toFixed(2)}%, gap should be ~${expectedGap.toFixed(2)} pp`);
}

// C3. NEO INFRA — A CAPITAL REDEMPTION IS A SALE OF THE OLDEST UNITS.
{
  const id = "neo-infra-income-opportunities-fund-9039920536";
  const p = accountsOf(id)[0];
  if (!p) skip("C3 Neo Infra", "not in this drop");
  else {
    const paid = movesIn(id).reduce((s, m) => s + (m.amount ?? 0), 0);
    ok("C3 Neo Infra: cost is FIFO", p.costBasisSource === "fifo");
    near("C3 Neo Infra: cost held + cost sold = every rupee paid in", (p.costBasis ?? 0) + (p.costOfUnitsSold ?? 0), paid, 0.01);
    ok("C3 …and the redemption is IN the return", (p.costOfUnitsSold ?? 0) > 0);
  }
}

// C4. 3P — REDEEMED IN FULL, AND THE RETURN IS WHAT THE BANK RECEIVED.
{
  const id = "3p-investment-managers-3000048";
  const p = one(id, /class-b3/);
  const out = BOOK_CAPITAL_MOVES.find((m) => m.accountId === id && m.direction === "out");
  if (!p || !out) skip("C4 3P", "no B3 position or no redemption in this drop");
  else {
    // EVERY RUPEE PAID IN, GROSS (VD-24): a cost is what the family paid, and
    // 3P's setup expense and stamp duty were paid — the net is what bought units
    // after the fund took them. The move's `amount` is the gross row.
    const grossIn = movesIn(id).reduce((s, m) => s + (m.amount ?? 0), 0);
    near("C4 3P: cost of units sold = every rupee paid in, gross", p.costOfUnitsSold, grossIn, 0.01);
    // …and the gate that licenses it, off the ARCHIVE row by row: the net the
    // fund invested plus the charges the SAME row prints is the gross, to the
    // paisa. Without it the gross would be a figure nothing on the page
    // reconciles, and the check above would pass on any amount column.
    const p3rows = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/audit",
      "3p-investment-managers-3000048-2026-07-31-holdings", "document.json"), "utf8")).cashFlows ?? [])
      .filter((c: { kind?: string; netAmount?: unknown }) => c.kind === "contribution" && isNum(c.netAmount)) as
      { amount: number; netAmount: number; expenses: number | null }[];
    ok("C4 3P: net + the row's printed charges = gross, on every subscription", p3rows.length > 0
      && p3rows.every((c) => isNum(c.expenses) && Math.abs(c.netAmount + c.expenses - c.amount) <= 0.01),
      `${p3rows.length} row(s), ${p3rows.reduce((t, c) => t + (c.expenses ?? 0), 0).toFixed(2)} of charges`);
    near("C4 3P: realised + cost sold = the redemption the bank received", (p.realizedPnL ?? 0) + (p.costOfUnitsSold ?? 0), out.amount ?? 0, 0.01);
    ok("C4 3P: held at nothing, with a return", p.quantity === 0 && p.marketValue === 0 && isNum(p.returnPct) && p.returnPct! > 0,
      `${p.returnPct}%`);
  }
}

// C4b. WHAT A BUY LOT COSTS — THE RULE, AND A WITNESS THAT IS NOT THE RULE.
//
// `fifoFromCashFlows` costs a self-contained contribution at the NET the fund
// invested plus the CHARGES the same row prints, and counts the charges as nil
// only on a row that prints none. On this book that happens to equal the larger
// of the row's gross and its net on every buy row — 3P (net + charges = gross)
// and Buoyant (a net ABOVE its gross, the ₹58,861.66 Gain Distr. reinvested,
// charges null). The larger-of is asserted as a WITNESS only: written as the
// rule it would pick whichever figure a future layout printed larger.
{
  const dir = path.join(process.cwd(), "public/audit");
  const buys = fs.readdirSync(dir).map((d) => path.join(dir, d, "document.json")).filter((f) => fs.existsSync(f))
    .flatMap((f) => ((JSON.parse(fs.readFileSync(f, "utf8")).cashFlows ?? []) as
      { kind?: string; units?: unknown; amount?: unknown; netAmount?: unknown; expenses?: unknown; notes?: string }[])
      .filter((c) => c.kind === "contribution" && isNum(c.units) && (c.units as number) > 0 && isNum(c.netAmount)));
  const rule = (c: typeof buys[number]) => (c.netAmount as number) + (isNum(c.expenses) ? c.expenses : 0);
  const witness = (c: typeof buys[number]) => Math.max(isNum(c.amount) ? c.amount : -Infinity, c.netAmount as number);
  ok("C4b every buy row: net + printed charges agrees with the larger of gross and net (a witness)", buys.length > 0
    && buys.every((c) => Math.abs(rule(c) - witness(c)) <= 0.01), `${buys.length} buy row(s)`);
  const charged = buys.filter((c) => isNum(c.expenses) && (c.expenses as number) > 0);
  const reinvested = buys.filter((c) => !isNum(c.expenses) && isNum(c.amount) && (c.netAmount as number) > (c.amount as number) + 0.01);
  ok("C4b …a row that prints charges is costed at its gross (3P)", charged.length > 0
    && charged.every((c) => isNum(c.amount) && Math.abs(rule(c) - (c.amount as number)) <= 0.01), `${charged.length} row(s)`);
  ok("C4b …and a row printing a net above its gross and no charge line keeps its net (Buoyant's reinvested distribution)",
    reinvested.length > 0 && reinvested.every((c) => Math.abs(rule(c) - (c.netAmount as number)) <= 0.01),
    `${reinvested.length} row(s), ${reinvested.map((c) => ((c.netAmount as number) - (c.amount as number)).toFixed(2)).join(", ")} above gross`);
  // And the engine itself, on 3P's own record: the lots it bought add to the gross.
  const p3 = JSON.parse(fs.readFileSync(path.join(dir, "3p-investment-managers-3000048-2026-07-31-holdings", "document.json"), "utf8"));
  const run = fifoFromCashFlows(p3.cashFlows);
  const bought = run?.ledger ? (run.ledger.costSold as number) : NaN;
  const gross3p = (p3.cashFlows as { kind?: string; netAmount?: unknown; amount?: number }[])
    .filter((c) => c.kind === "contribution" && isNum(c.netAmount)).reduce((t, c) => t + (c.amount ?? 0), 0);
  near("C4b the lot engine, run on 3P's own record, sells lots costing the gross paid", bought, gross3p, 0.01);

  // WHERE THE RULE AND THE WITNESS WOULD PART — constructed, because on this
  // book they never do, so a larger-of written as the rule would pass every
  // check above. A row that prints a gross and a net with NO charge line
  // between them costs its units at the net that bought them (charges nil);
  // a larger-of would cost them at the gross. And a row whose printed charges
  // do not bridge its gross to its net is costed at what the rule says —
  // net + charges — never at whichever figure is larger.
  const lot = (row: Record<string, unknown>) => {
    const r = fifoFromCashFlows([
      { kind: "contribution", date: "2025-01-01", securityKey: "x", units: 10, description: "Subscription", ...row },
      { kind: "withdrawal", date: "2025-06-01", securityKey: "x", units: -10, amount: -120, description: "Redemption" },
    ]);
    return r?.ledger ? (r.ledger.costSold as number) : NaN;
  };
  near("C4b constructed: a gross and a net with no charge line is costed at the net, never the larger", lot({ amount: 100, netAmount: 99, expenses: null }), 99, 0.001);
  near("C4b constructed: net + printed charges, even where they fall short of the gross", lot({ amount: 100, netAmount: 98, expenses: 1 }), 99, 0.001);
}

// C5. LKP — A SALE AFTER THE HOLDING STATEMENT IS NOT BOOKED INTO IT.
{
  const id = "lkp-securities-98245";
  const asOf = byAcct.get(id)?.asOf;
  const dir = path.join(process.cwd(), "public/audit");
  const lots = fs.readdirSync(dir).filter((d) => d.startsWith(id) && d.endsWith("capital-gain"))
    .flatMap((d) => JSON.parse(fs.readFileSync(path.join(dir, d, "document.json"), "utf8")).capitalGains ?? []) as
    { securityKey: string; saleDate: string; isin?: string | null }[];
  // A lot belongs to the holding carrying its own key or, where none does, to the
  // ONE holding on this account printing the lot's ISIN — an identifier join on
  // the same account, re-expressed here rather than read from the builder, and
  // refused where two holdings qualify. Liquid BeES is why: its lots and its
  // holding spell the security differently and share one ISIN.
  const rows = accountsOf(id);
  const holdingOf = (l: { securityKey: string; isin?: string | null }) => {
    if (rows.some((p) => p.securityKey === l.securityKey) || !l.isin) return l.securityKey;
    const hits = [...new Set(rows.filter((p) => p.isin === l.isin).map((p) => p.securityKey))];
    return hits.length === 1 ? hits[0] : l.securityKey;
  };
  const after = new Set(lots.filter((l) => asOf && l.saleDate > asOf).map(holdingOf));
  const held = accountsOf(id).filter((p) => (p.quantity ?? 0) > 0);
  if (!asOf || !after.size) skip("C5 LKP", "no capital gain lot dated after the holding statement");
  else {
    const flagged = held.filter((p) => (p.realizedLotsAfter ?? 0) > 0);
    ok("C5 LKP: every holding sold after its statement's date is flagged",
      held.every((p) => ((p.realizedLotsAfter ?? 0) > 0) === after.has(p.securityKey)),
      `${flagged.length} flagged of ${held.length}`);
    ok("C5 …and carries no realised gain from those later sales — absent, never a measured ₹0",
      flagged.every((p) => p.realizedPnL === null && p.costOfUnitsSold === null));
    ok("C5 …and its empty realised cell says why", flagged.every((p) => /after its statement's date/.test(realisedReason(p))));
  }
}

// C6. A MANDATE'S CAPITAL IS THE MANAGER'S OWN — AND SO IS ITS PROFIT.
//
// `value + withdrawn − contributed`, struck from the book's own positions,
// against the manager's own since-inception bridge AT THE SAME DATE:
// realised + unrealised + income − fees, printed on a different report from the
// appraisal the book's value is summed from. Two paths to one figure.
//
// The fact sheet's own printed PROFIT is not used as a second witness, and on
// purpose: once contributed and withdrawn match the statement's, `gain − profit`
// is just the book's value less the fact sheet's closing value, which carries
// dividends declared and not yet received that §4b keeps out of market value.
// That is a check on the VALUE, not on the return, and comparing it here would
// look like a second path while being the first one restated.
{
  let witnessed = 0;
  for (const a of BOOK_ACCOUNTS) {
    if (a.engagement !== "PMS" || !a.capital) continue;
    const ps = accountsOf(a.accountId);
    const mv = ps.reduce((s, p) => s + p.marketValue, 0);
    const gain = mv + a.capital.withdrawn - a.capital.contributed;
    const src = (BOOK_ACCOUNT_BRIDGES[a.accountId] ?? []).find((b) => b.source === a.capital!.source);
    if (!src) {
      ok(`C6 ${a.accountId}: capital is the account's own dated record from inception`,
        a.capital.source === "capital-record" && a.capital.contributed > 0);
      continue;
    }
    near(`C6 ${a.accountId}: contributed = the statement's`, a.capital.contributed, src.contribution ?? NaN, 0.5);
    near(`C6 ${a.accountId}: withdrawn = the statement's`, a.capital.withdrawn, src.withdrawal ?? 0, 0.5);
    const ph = bridge(a.accountId, "performance-history", a.capital.to);
    if (ph && [ph.realized, ph.unrealized, ph.income, ph.fees].every(isNum)) {
      witnessed += 1;
      near(`C6 ${a.accountId}: gain = the manager's realised + unrealised + income − fees`, gain,
        ph.realized! + ph.unrealized! + ph.income! - ph.fees!, 0.5);
    } else if ([src.realized, src.unrealized, src.income, src.fees].every(isNum)) {
      // ASK prints its decomposition on the SAME profit-and-loss account its
      // capital is read from, so against it the gain would only test the
      // book's value against that account's closing — the value, not the
      // return, which is this section's own reason for not using a profit.
      skip(`C6 ${a.accountId}: the manager's bridge`,
        `its only since-inception decomposition is the ${src.reportType} its capital is read from, so it would test the value, not the return`);
    } else {
      skip(`C6 ${a.accountId}: the manager's bridge`, `no performance history dated ${a.capital.to}, the capital's own date`);
    }
  }
  // A suite that witnessed nothing claims confidence nobody earned.
  ok("C6 the manager's own bridge witnessed at least one mandate", witnessed > 0, `${witnessed} witnessed`);
}

// C7. THE WHOLE BOOK — EVERY MANDATE IS STRUCK WHOLE, AND IT IS LOAD-BEARING.
{
  const universe = currentHoldings(dedupedPositions(BOOK_POSITIONS));
  const t = fifoTotals(universe, { accounts: BOOK_ACCOUNTS, universe });
  const withCapital = BOOK_ACCOUNTS.filter((a) => a.engagement === "PMS" && a.capital && a.capital.contributed > 0
    && universe.some((p) => p.accountId === a.accountId));
  ok("C7 every PMS mandate with a capital record is struck whole in the book",
    t.wholeMandates.length === withCapital.length && withCapital.length > 0, `${t.wholeMandates.length} of ${withCapital.length}`);

  // V.E.C 128004: struck on its surviving shares it reads single digits; its
  // own record says ~30%. The gap is the gain on the shares already sold.
  const vec = "v-e-c-assago-capital-management-llp-128004";
  const vecSet = universe.filter((p) => p.accountId === vec);
  if (!vecSet.length) skip("C7 V.E.C 128004", "not in this drop");
  else {
    const whole = fifoTotals(vecSet, { accounts: BOOK_ACCOUNTS, universe }).returnPct;
    const cost = vecSet.reduce((s, p) => s + (p.costBasis ?? 0), 0);
    const survivors = ((vecSet.reduce((s, p) => s + p.marketValue, 0) - cost) / cost) * 100;
    const ph = bridge(vec, "performance-history");
    const own = ph && [ph.realized, ph.unrealized, ph.income, ph.fees].every(isNum)
      ? ((ph.realized! + ph.unrealized! + ph.income! - ph.fees!) / a_contrib(vec)) * 100 : null;
    ok("C7 V.E.C 128004: whole-mandate FIFO and survivors-only differ materially (load-bearing)",
      isNum(whole) && Math.abs(whole - survivors) > 10, `FIFO ${whole?.toFixed(2)}% vs survivors ${survivors.toFixed(2)}%`);
    if (own !== null) near("C7 V.E.C 128004: FIFO return = the manager's own profit over capital", whole, own, 0.05);
  }

  // PARTITION. Split by category, every rupee of gain and capital lands in one
  // bucket, and the buckets add back to the book — a whole mandate is never
  // split across two, so none of its capital is counted twice or lost.
  const buckets = new Map<string, Position[]>();
  for (const p of universe) {
    const k = holdingBucket(p, byAcct.get(p.accountId)?.engagement);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(p);
  }
  let g = 0, d = 0;
  for (const set of buckets.values()) {
    const b = fifoTotals(set, { accounts: BOOK_ACCOUNTS, universe });
    g += b.gain ?? 0; d += b.deployed ?? 0;
  }
  near("C7 the category buckets' gains add to the book's", g, t.gain ?? NaN, 1);
  near("C7 …and their capital deployed", d, t.deployed ?? NaN, 1);
}

function a_contrib(id: string): number { return byAcct.get(id)?.capital?.contributed ?? NaN; }

console.log(`\n${fails ? `${fails} FAILED` : "all passed"}${notChecked ? ` · ${notChecked} not checked` : ""}`);
if (fails) process.exit(1);
