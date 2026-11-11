// A statement-costed holding dated off the review's purchases (Stage 10mr).
// Run: node scripts/ingest/__tests__/reviewPurchaseDates.test.mjs
//
// ON CONSTRUCTED INPUTS shaped like Ajay's Man Industries at HDFC Securities
// 3110320: the review buys 60,000 (10 Jan 2025) and 4,57,317 (25 Jul 2025) to
// its 30 June Closing of 5,17,317; the account's trade window (1 Apr – 31 Oct)
// sells 37,317 on 23 Sep; the portfolio of 2 Nov holds 4,80,000, every unit
// long-term. Each gate is broken once and must date nothing.
import { reviewPurchaseDates } from "../../lib/reviewPurchaseDates.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("reviewPurchaseDates");

const row = (n, txn, date, qty, rate) => ({ row: n, investor: "Ajay Jaisinghani", advisor: "HDFC Bank", product: "Man Industries",
  txn, date, qty, rate, value: txn === "Purchase" ? -qty * rate : txn === "Sale" ? qty * rate : qty * rate });
const REVIEW = [row(327, "Purchase", "2025-01-10", 60000, 320), row(328, "Purchase", "2025-07-25", 457317, 328), row(329, "Closing", "2026-06-30", 517317, 581.45)];
const SALE = { date: "2026-09-23", side: "sell", quantity: 37317, price: 940, amount: 35077980 };
const base = {
  accountId: "hdfc-securities-3110320", ownerId: "ajay", asOf: "2026-11-02",
  window: { from: "2026-04-01", to: "2026-10-31" }, trades: [SALE], reviewRows: REVIEW,
  ownerOf: (n) => (n === "Ajay Jaisinghani" ? "ajay" : "other"), workbook: "review.xlsx",
  holding: { securityKey: "man-industries-india", quantity: 480000, totalCost: 157268856.77, longTermQuantity: 480000, assetClass: "Equity", marketSide: "listed" },
};
const run = (over = {}) => reviewPurchaseDates({ ...base, ...over, holding: { ...base.holding, ...(over.holding ?? {}) } });

{
  const r = run();
  ok("the review's two buys, carried through the window's sale, date every unit held",
    r?.first === "2025-01-10" && r.last === "2025-07-25" && r.lots === 2 && r.units === 480000 && r.sales === 1, JSON.stringify(r));
  ok("…with the review rows as its evidence", JSON.stringify(r?.evidence?.rows) === "[327,328,329]");
  ok("…and the sale takes the oldest lot first", Math.abs(r.lotCost - (22683 * 320 + 457317 * 328)) < 0.01, String(r?.lotCost));
}
ok("a security no alias names is not attempted", run({ holding: { securityKey: "kingfa-unknown" } }) === null);
ok("an account no custody alias names is not attempted", run({ accountId: "other-account" }) === null);
ok("another owner's rows date nothing", /records no/.test(run({ ownerId: "bharat" })?.reason ?? ""));
ok("units that do not tie date nothing", /holds 480001/.test(run({ holding: { quantity: 480001 } })?.reason ?? ""));
ok("a window opening after the Closing dates nothing", /open on 2026-08-01/.test(run({ window: { from: "2026-08-01", to: "2026-10-31" } })?.reason ?? ""));
ok("a gap with no long-term quantity dates nothing", /no long-term quantity/.test(run({ holding: { longTermQuantity: null } })?.reason ?? ""));
ok("a long-term quantity the dates contradict dates nothing", /prints 400000/.test(run({ holding: { longTermQuantity: 400000 } })?.reason ?? ""));
{
  // Bought within the year: the broker's long-term quantity is nil and agrees,
  // but a purchase in the gap would be just as short-term, so it proves nothing.
  const recent = REVIEW.map((r) => ({ ...r, date: r.txn === "Closing" ? r.date : r.row === 327 ? "2026-01-22" : "2026-01-23" }));
  const r = run({ reviewRows: recent, holding: { longTermQuantity: 0 } });
  ok("short-term units across a gap date nothing", /short-term on the broker's own record/.test(r?.reason ?? ""), JSON.stringify(r));
  const closed = run({ reviewRows: recent, holding: { longTermQuantity: 0 }, window: { from: "2026-04-01", to: "2026-11-02" } });
  ok("…but do once the window reaches the holding's date", closed?.first === "2026-01-22", JSON.stringify(closed));
}
ok("a cost more than 0.5% from the statement's dates nothing", /0\.5%/.test(run({ holding: { totalCost: 150000000 } })?.reason ?? ""));
ok("a window trade the review does not carry, before its Closing, dates nothing",
  /do not move the same units/.test(run({ trades: [{ date: "2026-05-04", side: "buy", quantity: 10, amount: 5000 }, SALE] })?.reason ?? ""));
ok("a bonus row in the review dates nothing",
  /Bonus/.test(run({ reviewRows: [...REVIEW.slice(0, 2), { ...REVIEW[0], row: 330, txn: "Bonus / Split", date: "2025-09-01" }, REVIEW[2]] })?.reason ?? ""));
ok("two Closings in one block date nothing", /2 dated Closing/.test(run({ reviewRows: [...REVIEW, { ...REVIEW[2], row: 331 }] })?.reason ?? ""));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
