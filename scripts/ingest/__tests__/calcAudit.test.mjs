// The calculation audit's book-side fixes, each pinned (Stage 10fz).
// Run: node scripts/ingest/__tests__/calcAudit.test.mjs
//
// Two halves. The RULES on constructed inputs, because a rule the real book
// happens to satisfy cannot show a broken one: the review's FIFO cost and
// income (`measuredFromRows`), the s.2(42A) holding period
// (`scripts/lib/holdingPeriod.mjs`), and FIFO's refusal of a sale with no
// proceeds. Then the BOOK the rules produce, read off the generated file as
// text — the named figures the audit moved, and the `purchaseDates` gate held
// to `heldSince` on every position. A drop that moves a pinned figure moves
// this suite, which is the point of pinning it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measuredFromRows } from "../../lib/reviewBook.mjs";
import { addMonths, longTermFrom, longTermRuleOf, termSplit, SPECIFIED_FUND_FROM } from "../../lib/holdingPeriod.mjs";
import { fifoFromCashFlows } from "../../../shared/fifo.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
const near = (a, b, tol = 0.005) => typeof a === "number" && Math.abs(a - b) <= tol;

console.log("calcAudit");

// ── A2 / A1: the review's dated rows, first-in first-out, with their income ──
// 360 ONE Special Opportunities Series 8, as the review dates it for one holder.
const SOF = [
  { date: "2021-04-22", kind: "purchase", amount: 9999500.02, units: 999950.002 },
  { date: "2022-03-31", kind: "income", amount: 18908, units: null },
  { date: "2023-03-31", kind: "income", amount: 14547, units: null },
  { date: "2024-04-30", kind: "sale", amount: 78320, units: 5751.296 },
  { date: "2024-06-27", kind: "income", amount: 1150402, units: null },
  { date: "2026-05-18", kind: "income", amount: 715619, units: null },
];
{
  const m = measuredFromRows(SOF, "2026-06-30");
  ok("a sale's units are matched FIFO: cost held is what the units left cost", near(m.fifo?.costHeld, 9941987.06), JSON.stringify(m));
  ok("...the cost of the units sold is theirs at the purchase price", near(m.fifo?.costSold, 57512.96));
  ok("...and the sale's gain is REALISED, not a reduction of cost", near(m.fifo?.realised, 20807.04));
  ok("...cost held + cost sold is every rupee that bought a unit", near(m.fifo.costHeld + m.fifo.costSold, 9999500.02));
  ok("every payout on or before the valuation is income", near(m.income?.amount, 1899476));
  ok("...over a window that opens on the holder's first dated row", m.income?.from === "2021-04-22");
}
{
  const m = measuredFromRows(SOF, "2026-03-31");
  ok("a payout after the valuation is inside the value, not income", near(m.income?.amount, 1899476 - 715619) && m.lateIncome === 1,
    JSON.stringify(m.income));
}
{
  const rows = SOF.map((r) => (r.kind === "sale" ? { ...r, units: null } : r));
  const m = measuredFromRows(rows, "2026-06-30");
  ok("a sale with no units leaves the review's cost standing, and says why", m.fifo === null && /no units/.test(m.why ?? ""), m.why);
  ok("...while its income is still counted", near(m.income?.amount, 1899476));
}
{
  const rows = [SOF[0], { ...SOF[3], units: 2000000 }];
  const m = measuredFromRows(rows, "2026-06-30");
  ok("a sale of more units than were bought is refused, never absorbed", m.fifo === null && /no dated purchase/.test(m.why ?? ""), m.why);
}
{
  const m = measuredFromRows([SOF[0]], "2026-06-30");
  ok("a line nothing was sold from is left alone — its cost is already the purchases", m.fifo === null && m.why === null);
  ok("...and a line with no payout row carries no income figure (null, not a zero)", m.income === null);
}

// ── A6: the holding period is the Act's, in calendar months ─────────────────
ok("12 months after 29 Feb 2024 is 28 Feb 2025 (clamped to the month's end)", addMonths("2024-02-29", 12) === "2025-02-28");
ok("1 month after 31 Jan is the last day of February", addMonths("2025-01-31", 1) === "2025-02-28");
ok("a listed share turns long-term the day AFTER its anniversary", longTermFrom("2025-10-07", 12) === "2026-10-08");
const LISTED = { assetClass: "Equity", marketSide: "listed", isin: "INE299U01018" };
{
  const lots = [{ purchaseDate: "2025-10-07", totalCost: 1000 }];
  const on = termSplit(lots, "2026-10-07", LISTED);
  ok("held exactly 12 months is still SHORT-term (not more than 12 months)", on.stCostBasis === 1000 && on.ltCostBasis === 0, JSON.stringify(on));
  ok("...and turns long-term in 1 day", on.daysToLT === 1);
  const after = termSplit(lots, "2026-10-08", LISTED);
  ok("the day after the anniversary it is long-term, with nothing left to turn", after.ltCostBasis === 1000 && after.daysToLT === null);
}
{
  // 365 days after 29 Feb 2024 is 28 Feb 2025 — the old `held >= 365` rule
  // called this lot long-term on the anniversary itself.
  const s = termSplit([{ purchaseDate: "2024-02-29", totalCost: 500 }], "2025-02-28", LISTED);
  ok("a leap-day lot held 365 days is short-term on its anniversary", s.stCostBasis === 500 && s.daysToLT === 1, JSON.stringify(s));
}
{
  const s = termSplit([{ purchaseDate: "2025-11-12", totalCost: 100 }, { purchaseDate: "2025-03-04", totalCost: 200 }], "2026-03-31", LISTED);
  ok("daysToLT is the soonest short-term lot's days to its first long-term day", s.daysToLT === 227 && s.ltCostBasis === 200, JSON.stringify(s));
}
{
  const unlisted = termSplit([{ purchaseDate: "2025-01-15", totalCost: 900 }], "2026-03-31", { assetClass: "Equity", marketSide: "private" });
  ok("an unlisted share needs 24 months", unlisted.stCostBasis === 900 && unlisted.daysToLT === 291, JSON.stringify(unlisted));
}
{
  const debt = { assetClass: "Debt", isin: "INF846K01EW2" };
  const s = termSplit([{ purchaseDate: "2023-05-01", totalCost: 400 }], "2026-09-30", debt);
  ok("a debt fund's units bought on/after 1 Apr 2023 are never long-term (s.50AA)",
    s.stCostBasis === 400 && s.ltCostBasis === 0 && s.daysToLT === null && /never long-term/.test(s.why ?? ""), JSON.stringify(s));
  const old = termSplit([{ purchaseDate: "2023-03-31", totalCost: 400 }], "2026-09-30", debt);
  ok(`...bought before ${SPECIFIED_FUND_FROM}, they are long-term after 24 months`, old.ltCostBasis === 400 && old.why === null, JSON.stringify(old));
  ok("an equity fund's units take the 12-month rule", longTermRuleOf({ assetClass: "Equity", isin: "INF179K01830" }).months === 12);
}
{
  const s = termSplit([{ purchaseDate: "2020-01-01", totalCost: 1 }], "2026-09-30", { assetClass: "ETF", isin: "INF732E01037" });
  ok("a holding the book cannot place gets NO split — null, never the equity rule by default",
    s.stCostBasis === null && s.ltCostBasis === null && s.daysToLT === null && !!s.why, JSON.stringify(s));
}

// ── A14: a sale with units and no proceeds refuses the account ──────────────
{
  const r = fifoFromCashFlows([
    { date: "2025-01-01", kind: "contribution", securityKey: "f", units: 100, amount: 1000, netAmount: 1000, expenses: null },
    { date: "2025-06-01", kind: "withdrawal", securityKey: "f", units: -40, amount: null },
  ]);
  ok("a redemption that prints no amount is refused, not booked as proceeds of 0", r?.ledger === null && /prints no amount/.test(r?.reason ?? ""),
    JSON.stringify(r));
}
{
  const r = fifoFromCashFlows([
    { date: "2025-01-01", kind: "contribution", securityKey: "f", units: 100, amount: 1000, netAmount: 1000, expenses: null },
    { date: "2025-06-01", kind: "withdrawal", securityKey: "f", units: -40, amount: -600 },
  ]);
  ok("...and one that prints its proceeds still runs", r?.reason === null && near(r.ledger.realisedGain, 200), JSON.stringify(r?.ledger?.realised));
}

// ── THE BOOK ────────────────────────────────────────────────────────────────
const glow = fs.readFileSync(path.join(ROOT, "src", "data", "glowData.ts"), "utf8");
/** One export's JSON literal, read to its matching bracket — the file carries prose between exports. */
const exportJson = (name) => {
  const m = new RegExp(`export const ${name}(?::[^=]+)? = `).exec(glow);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 0, inStr = false;
  const start = i;
  for (; i < glow.length; i++) {
    const c = glow[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if ((c === "]" || c === "}") && --depth === 0) { i++; break; }
  }
  return JSON.parse(glow.slice(start, i));
};
const positions = exportJson("BOOK_POSITIONS") ?? [];
const accounts = exportJson("BOOK_ACCOUNTS") ?? [];
const pos = (accountId, securityKey) => positions.find((p) => p.accountId === accountId && p.securityKey === securityKey) ?? null;
ok("the generated book is readable", positions.length > 0 && accounts.length > 0);

// A7 — under exactly heldSince's gate.
{
  const bad = positions.filter((p) => (p.heldSince != null) !== (p.purchaseDates !== undefined)
    || (p.purchaseDates !== undefined && !(Number.isInteger(p.purchaseDates) && p.purchaseDates >= 1)));
  ok("purchaseDates is set on exactly the positions heldSince is, and is a count ≥ 1", bad.length === 0,
    bad.slice(0, 3).map((p) => `${p.accountId}|${p.securityKey}`).join("; "));
  ok("...and there are such positions to check it on", positions.some((p) => p.purchaseDates !== undefined));
}
// A1/A2 — 360 ONE Special Opportunities Series 8, on both separate investments.
for (const acct of ["360-one-private-wealth-37702", "360-one-private-wealth-60117"]) {
  const p = pos(acct, "360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii");
  ok(`${acct}: the review line carries FIFO's cost held, its realised gain and the review's figure as the check`,
    near(p?.costBasis, 9941987.06) && near(p?.realizedPnL, 20807.04) && near(p?.costOfUnitsSold, 57512.96) && near(p?.printedCostBasis, 9921180.02),
    JSON.stringify(p && { c: p.costBasis, r: p.realizedPnL, s: p.costOfUnitsSold, pc: p.printedCostBasis }));
  ok(`${acct}: ...and its income, so the return counts what the fund paid`, near(p?.dividendReceived, 1899476) && near(p?.returnPct, 65.59),
    JSON.stringify(p && { d: p.dividendReceived, r: p.returnPct }));
}
// A3 — Neo Infra's distributions, gross, through its valuation, capital excluded.
{
  const p = pos("neo-infra-income-opportunities-fund-9039920536", "neo-infra-income-opportunities-fund-i-class-a5");
  ok("Neo Infra carries its distributed income and equalisation received through 30 Jun, and not the capital redemption",
    near(p?.dividendReceived, 2818763 + 869355) && near(p?.returnPct, 21.21), JSON.stringify(p && { d: p.dividendReceived, r: p.returnPct }));
}
// A4 — gross of TDS.
{
  const p = pos("goldstandard-wealth-private-limited-100022", "hdfc-asset-management");
  ok("a dividend is counted gross of its TDS (HDFC AMC: ₹59,400 declared, ₹5,940 TDS)", near(p?.dividendReceived, 59400),
    String(p?.dividendReceived));
  ok("...over the dividend statement's own window", p?.dividendFrom === "2026-04-01", String(p?.dividendFrom));
}
// A11 — Buoyant's reinvested Gain Distr., carried with its units into A4.
{
  const p = pos("buoyant-capital-103473", "buoyant-opportunities-strategy-category-iii-class-a4");
  ok("a Gain Distr. reinvested in the carried cost is income of the class that holds it", near(p?.dividendReceived, 58861.66),
    String(p?.dividendReceived));
}
// A8 — a since-inception capital record must reach the holdings' date.
{
  const a = accounts.find((x) => x.accountId === "svan-investment-managers-llp-8710067");
  ok("SVAN 8710067's capital is not stamped to 30 Sep over a record that ends 31 Jul", a && a.capitalRecordTo < a.asOf && a.capital === null,
    JSON.stringify(a && { to: a.capitalRecordTo, asOf: a.asOf, capital: a.capital }));
}
// A6 on the book — the LKP lot register at 31 Mar 2026.
{
  const p = pos("lkp-securities-98245", "mrs-bectors-food-specialities");
  ok("LKP Mrs Bectors' soonest lot turns long-term 227 days after 31 Mar 2026 (13 Nov 2026)", p?.daysToLT === 227, String(p?.daysToLT));
}
// A13 — the realised split files a liquid fund's lots under the holding's class.
{
  const rbc = exportJson("BOOK_REALISED_BY_CLASS") ?? [];
  const gl = rbc.filter((r) => r.accountId === "green-lantern-capital-llp-510861");
  ok("Green Lantern's Axis Liquid Fund gains are under Cash, as its appraisal classes the holding",
    gl.some((r) => r.assetClass === "Cash" && r.securities.some((s) => /Axis Liquid/.test(s)))
    && !gl.some((r) => r.assetClass === "Equity" && r.securities.some((s) => /Axis Liquid/.test(s))), JSON.stringify(gl.map((r) => [r.assetClass, r.securities.length])));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
