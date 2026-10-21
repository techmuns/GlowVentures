// A COST IS EVERY RUPEE THE FAMILY PAID IN — held to the archive (VD-24).
//   npm run test:family
//
// Stamp duty was treated two ways. Sanshi's statements print each contribution
// as a GROSS row, a "Stamp Duty @ 0.005%" row and an allotment on one date, and
// the book costed the holding at what bought units — the gross LESS the duty —
// while Helios, Active Momentum, Founders and Delphi carry the duty inside their
// cost. So one page's Invested and another's Purchase disagreed by ₹78,746.09 on
// the same five folios, and a return struck on the net overstated itself by the
// duty it left out.
//
// The book now costs a contribution at what was PAID and keeps the statement's
// own net beside it as `printedCostBasis` — a check, never a source — on three
// conditions this suite re-expresses off the ARCHIVE rather than reading back
// from the builder:
//
//   · the gross is the row the statement prints as the movement, and the charge
//     is the statement's own charge row on that date — never a rate applied;
//   · the net the holding was costed at (the holdings row's printed cost) is the
//     gross less those charges TO THE PAISA, or nothing is restated;
//   · the entry NAV a contribution shows is still what bought units over the
//     units it bought — (paid − charges) ÷ units, day by day — so a stamp duty
//     does not move a unit price.
import fs from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POSITION_TRANCHES } from "@/data/glowData";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const paisa = (a: number, b: number) => Math.abs(a - b) <= 0.01;

type Row = Record<string, any>;
const AUDIT = path.resolve("public/audit");
const docs = fs.readdirSync(AUDIT).sort()
  .map((dir) => path.join(AUDIT, dir, "document.json"))
  .filter((f) => fs.existsSync(f))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Row);
const byPA = new Map(BOOK_ACCOUNTS.map((a) => [`${a.provider}::${a.accountNo}`, a.accountId]));

// ── THE ARCHIVE'S OWN ANSWER, per (account, security), from its newest issue ─
// A contribution day on the THREE-ROW layout: a gross row (no units, no printed
// net), the statement's charge rows (kind "expense") on the same date, and the
// allotment carrying the units. Only those days carry a charge as a row of its
// own; a self-contained row (3P, Buoyant) prints its own net and is FIFO's.
type Day = { date: string; gross: number; charges: number; units: number };
type Expect = { asOf: string; days: Day[]; printed: number | null };
const expect = new Map<string, Expect>();
for (const d of docs) {
  const accountId = byPA.get(`${d.provider}::${d.accountNo}`);
  if (!accountId) continue;
  const flows: Row[] = d.cashFlows ?? [];
  const chargeOn = new Map<string, number>();
  for (const c of flows) if (c.kind === "expense" && c.date && isNum(c.amount)) chargeOn.set(c.date, (chargeOn.get(c.date) ?? 0) + Math.abs(c.amount));
  const allot = flows.filter((c) => c.kind === "contribution" && c.date && isNum(c.units) && c.units > 0 && !isNum(c.netAmount) && c.securityKey);
  const perKey = new Map<string, Day[]>();
  for (const a of allot) {
    const grossRows = flows.filter((c) => c.kind === "contribution" && c.date === a.date && !isNum(c.units) && !isNum(c.netAmount));
    if (!grossRows.length) continue;
    const list = perKey.get(a.securityKey) ?? [];
    list.push({ date: a.date, gross: grossRows.reduce((s, c) => s + (c.amount ?? 0), 0), charges: chargeOn.get(a.date) ?? 0, units: a.units });
    perKey.set(a.securityKey, list);
  }
  for (const [securityKey, days] of perKey) {
    const k = `${accountId}|${securityKey}`;
    const prev = expect.get(k);
    // A reissue restates the same record; the NEWEST issue is the whole of it.
    if (prev && String(prev.asOf) >= String(d.asOf)) continue;
    const holding = (d.holdings ?? []).find((h: Row) => h.securityKey === securityKey);
    expect.set(k, { asOf: d.asOf, days, printed: holding && isNum(holding.totalCost) ? holding.totalCost : null });
  }
}
const sumOf = (xs: Day[], f: (d: Day) => number) => xs.reduce((s, d) => s + f(d), 0);
const charged = [...expect].filter(([, e]) => sumOf(e.days, (d) => d.charges) > 0);
ok("the archive carries contributions with a printed charge", charged.length > 0,
  `${charged.length} holding(s), ${charged.reduce((s, [, e]) => s + sumOf(e.days, (d) => d.charges), 0).toFixed(2)} of charges`);

// ── THE BOOK AGAINST IT ─────────────────────────────────────────────────────
const want = new Set<string>();
let wantCharges = 0;
for (const [k, e] of charged) {
  const [accountId, securityKey] = k.split("|");
  const gross = sumOf(e.days, (d) => d.gross), charges = sumOf(e.days, (d) => d.charges), net = gross - charges;
  const p = BOOK_POSITIONS.find((x) => x.accountId === accountId && x.securityKey === securityKey);
  if (!p) { ok(`${k}: the book carries the holding`, false); continue; }
  const gate = isNum(e.printed) && paisa(e.printed, net);
  ok(`${k}: the statement's printed cost is the gross less its own charges, to the paisa`, gate,
    `printed ${e.printed}, gross ${gross.toFixed(2)} − charges ${charges.toFixed(2)} = ${net.toFixed(2)}`);
  if (!gate) continue;
  want.add(k); wantCharges += charges;
  ok(`${k}: the cost is every rupee paid in`, isNum(p.costBasis) && paisa(p.costBasis, gross) && p.costBasisSource === "gross-paid",
    `${p.costBasis} (${p.costBasisSource})`);
  ok(`${k}: …and the statement's own net stands beside it as the check`, isNum(p.printedCostBasis) && paisa(p.printedCostBasis, net),
    `${p.printedCostBasis}`);
  ok(`${k}: the unrealised gain and the return are struck on what was paid`,
    isNum(p.unrealizedPnL) && paisa(p.unrealizedPnL, p.marketValue - gross)
      && isNum(p.returnPct) && Math.abs(p.returnPct - ((p.marketValue - gross) / gross) * 100) <= 0.01,
    `${p.unrealizedPnL}, ${p.returnPct}%`);
  const moves = BOOK_POSITION_TRANCHES[k]?.moves ?? [];
  const dayOk = e.days.every((d) => {
    const m = moves.find((x) => x.date === d.date);
    return !!m && isNum(m.invested) && paisa(m.invested, d.gross) && isNum(m.charges) && paisa(m.charges, d.charges)
      && isNum(m.units) && Math.abs((m.invested - m.charges) / m.units - (d.gross - d.charges) / d.units) < 1e-6;
  });
  ok(`${k}: each contribution is the gross paid, names the charge inside it, and keeps its entry NAV`,
    moves.length === e.days.length && dayOk, `${moves.length} move(s) for ${e.days.length} contribution day(s)`);
}

// ── LOAD-BEARING, AND NOWHERE ELSE ──────────────────────────────────────────
// The restatement must reach every holding the archive says was charged, and
// no holding the archive says was not — a "gross-paid" cost on a holding with
// no printed charge would be a restatement of nothing.
const restated = BOOK_POSITIONS.filter((p) => p.costBasisSource === "gross-paid");
ok("every charged holding is restated, and no other", restated.length === want.size
  && restated.every((p) => want.has(`${p.accountId}|${p.securityKey}`)),
  `${restated.length} restated, ${want.size} expected`);
const moved = restated.reduce((s, p) => s + ((p.costBasis ?? 0) - (p.printedCostBasis ?? 0)), 0);
ok("…and the gross and the net differ by exactly the charges the statements print",
  paisa(moved, wantCharges) && moved > 1, `${moved.toFixed(2)} against ${wantCharges.toFixed(2)}`);

console.log(`\n${fails ? `${fails} FAILED` : "all gross-paid checks passed"}`);
process.exit(fails ? 1 : 0);
