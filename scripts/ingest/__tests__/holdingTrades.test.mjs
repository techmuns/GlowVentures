// When a holding's units were bought, off its account's own dated trades (Stage 10fm).
// Run: node scripts/ingest/__tests__/holdingTrades.test.mjs
//
// ON CONSTRUCTED INPUTS, because the real book cannot break a gate on purpose:
// each refusal — a window that opens after the units were held, a tape that
// sells more than it holds, a window that stops short of the holding's date,
// a sale with no earlier buy — is made to happen once here and must date
// nothing, and the one case that may date is checked to date the RIGHT buys:
// the ones still holding units after first-in, first-out matching.
import {
  tradeWindows, windowThrough, oneCopyPerTrade, holdingTradeRows, holdingTradeRecord,
} from "../../lib/holdingTrades.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("holdingTrades");

const buy = (date, quantity, amount = quantity * 100, extra = {}) => ({ date, side: "buy", quantity, unitPrice: 100, amount, ...extra });
const sell = (date, quantity, amount = quantity * 110, extra = {}) => ({ date, side: "sell", quantity, unitPrice: 110, amount, ...extra });

// ── windows: printed periods, merged where they touch ───────────────────────
{
  const w = tradeWindows([
    { periodFrom: "2026-04-01", periodTo: "2026-06-25" },
    { periodFrom: "2025-01-16", periodTo: "2026-04-01" },
    { periodFrom: "2026-06-26", periodTo: "2026-09-22" },
    { periodFrom: null, periodTo: null },
  ]);
  ok("overlapping and touching periods are one window", w.length === 1 && w[0].from === "2025-01-16" && w[0].to === "2026-09-22",
    JSON.stringify(w));
  const gap = tradeWindows([{ periodFrom: "2026-04-01", periodTo: "2026-05-31" }, { periodFrom: "2026-07-01", periodTo: "2026-09-30" }]);
  ok("a month with no statement splits the windows", gap.length === 2);
  ok("...and a date in the gap is in no window", windowThrough(gap, "2026-06-15") === null);
  ok("a statement that prints no period adds no window", tradeWindows([{ periodFrom: null, periodTo: "2026-09-30" }]).length === 0);
}

// ── one trade on two overlapping statements is one trade ────────────────────
{
  const a = { ...buy("2026-04-17", 56, 60120.63), unitPrice: 1071.6538, source: "since-inception" };
  const b = { ...buy("2026-04-17", 56, 60120.63), unitPrice: 1071.6537, source: "april-july" };
  ok("the same trade at two printed precisions is kept once", oneCopyPerTrade([a, b]).length === 1);
  const twice = [{ ...buy("2026-04-02", 77, 133656.63), source: "x" }, { ...buy("2026-04-02", 77, 133656.63), source: "x" }];
  ok("a statement's own repetition is two trades", oneCopyPerTrade(twice).length === 2);
  ok("...and stays two when another statement prints it once",
    oneCopyPerTrade([...twice, { ...buy("2026-04-02", 77, 133656.63), source: "y" }]).length === 2);
  ok("a row with no settled amount is never collapsed",
    oneCopyPerTrade([{ ...buy("2026-05-01", 10, null), source: "x" }, { ...buy("2026-05-01", 10, null), source: "y" }]).length === 2);
}

// ── rows: oldest first, a buy before a sell on one day, lot dates on a sale ──
{
  const rows = holdingTradeRows([sell("2026-05-02", 30), buy("2026-05-02", 10), buy("2026-01-10", 50)], [
    { saleDate: "2026-05-02", purchaseDate: "2026-01-10", quantity: 30 },
  ]);
  ok("rows run oldest first", rows.map((r) => r.date).join() === "2026-01-10,2026-05-02,2026-05-02");
  ok("a buy sorts before a sell on the same day", rows[1].side === "buy" && rows[2].side === "sell");
  ok("a sale carries the purchase dates of the lots that settle it", JSON.stringify(rows[2].boughtOn) === JSON.stringify(["2026-01-10"]));
  const short = holdingTradeRows([sell("2026-05-02", 30)], [{ saleDate: "2026-05-02", purchaseDate: "2026-01-10", quantity: 20 }]);
  ok("...and none where the lots do not add to the day's sales", short[0].boughtOn === undefined);
}

const WINDOW = { from: "2025-01-16", to: "2026-09-22" };

// ── the one case that dates: the window accounts for every unit held ────────
{
  const rows = holdingTradeRows([buy("2025-01-20", 100), buy("2025-06-11", 50), sell("2025-09-01", 120), buy("2026-03-17", 70)]);
  const r = holdingTradeRecord({ rows, quantity: 100, asOf: "2026-07-27", window: WINDOW });
  ok("every unit accounted for dates the holding", r?.unaccounted === 0 && r.held !== null, JSON.stringify(r));
  // FIFO: the sale of 120 takes all of the first buy and 20 of the second, so
  // the units held are 30 of 11 Jun 2025 and 70 of 17 Mar 2026.
  ok("the first date is the oldest buy STILL HOLDING units, not the first buy ever",
    r.held.first === "2025-06-11" && r.held.last === "2026-03-17" && r.held.lots === 2, JSON.stringify(r.held));
  ok("the window is cut at the holding's own date", r.to === "2026-07-27" && r.buys === 3 && r.sells === 1);
}
{
  const rows = holdingTradeRows([buy("2025-02-01", 40), buy("2026-08-10", 25)]);
  const r = holdingTradeRecord({ rows, quantity: 40, asOf: "2026-07-27", window: WINDOW });
  ok("a buy after the holding's statement is not part of what it holds", r?.held?.first === "2025-02-01" && r.held.lots === 1 && r.buys === 1);
}
{
  const r = holdingTradeRecord({ rows: holdingTradeRows([buy("2025-02-01", 40), sell("2025-03-01", 40)]), quantity: 0, asOf: "2026-07-27", window: WINDOW });
  ok("a holding sold to nil is accounted for and dates nothing", r?.unaccounted === 0 && r.held === null && r.reason === null);
}

// ── and every refusal dates nothing ─────────────────────────────────────────
{
  const r = holdingTradeRecord({ rows: [], quantity: 500, asOf: "2026-09-30", window: { from: "2026-04-01", to: "2026-09-30" } });
  ok("units on no trade in the window are not dated", r?.held === null && r.unaccounted === 500);
  ok("...and the reason says what the window holds, not why", /none of its 500 units is on a dated trade/.test(r.reason) && !/bonus|before/i.test(r.reason), r.reason);
}
{
  const rows = holdingTradeRows([buy("2026-05-01", 100)]);
  const r = holdingTradeRecord({ rows, quantity: 300, asOf: "2026-09-30", window: { from: "2026-04-01", to: "2026-09-30" } });
  ok("a window that accounts for part of the units dates none of them", r?.held === null && r.unaccounted === 200, JSON.stringify(r));
}
{
  // The trades leave more than the holding statement holds — an unread split,
  // a double-counted row: the two documents disagree and nothing is dated.
  const rows = holdingTradeRows([buy("2025-02-01", 2196)]);
  const r = holdingTradeRecord({ rows, quantity: 2140, asOf: "2026-07-27", window: WINDOW });
  ok("a tape that leaves more than is held dates nothing", r?.held === null && r.unaccounted === null && /do not agree/.test(r.reason), JSON.stringify(r));
}
{
  const r = holdingTradeRecord({ rows: holdingTradeRows([buy("2025-02-01", 40)]), quantity: 40, asOf: "2026-10-07", window: { from: "2025-01-16", to: "2026-09-22" } });
  ok("a window that ends before the holding's date dates nothing, and says where it stops",
    r?.held === null && /end on 2026-09-22, before this holding's own statement of 2026-10-07/.test(r.reason), JSON.stringify(r));
  const w = tradeWindows([{ periodFrom: "2025-01-16", periodTo: "2026-09-22" }]);
  ok("...and no window contains that date", windowThrough(w, "2026-10-07") === null);
}
{
  const r = holdingTradeRecord({ rows: holdingTradeRows([buy("2026-04-21", 40)]), quantity: 40, asOf: "2026-03-31", window: null });
  ok("a tape with no printed period dates nothing", r === null);
}
{
  const rows = holdingTradeRows([{ ...buy("2025-02-01", 40), quantity: null }]);
  const r = holdingTradeRecord({ rows, quantity: 40, asOf: "2026-07-27", window: WINDOW });
  ok("a trade with no unit count dates nothing", r?.held === null && /no unit count/.test(r.reason));
}
{
  // Sells before any buy, with the same net: the arithmetic balances and the
  // order does not — first-in, first-out has nothing to sell from.
  const rows = holdingTradeRows([sell("2025-02-01", 10), buy("2025-03-01", 50)]);
  const r = holdingTradeRecord({ rows, quantity: 40, asOf: "2026-07-27", window: WINDOW });
  ok("a sale no earlier buy holds dates nothing", r?.held === null && /no earlier buy/.test(r.reason), JSON.stringify(r));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
