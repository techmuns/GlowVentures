// WHICH PART OF THE BOOK EARNED ITS RETURN (Stage 10ex).   npm run test:family
//
// Morning CIO's Return Attribution tab files the current holdings under one
// axis and strikes each segment with FIFO. The claims a reader makes by adding
// are asserted on the COMMITTED book, on every axis: the values add to the
// book's value, the gains (with the one named mandate remainder) add to the
// Gain / Loss tile's gain, the contributions add to the book's return, and a
// segment's holdings add to the segment. The book figure is re-struck here
// through `bookReturnOnCost`, the tile's own call — never read back from the
// helper under test.
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { currentHoldings, dedupedPositions } from "@/lib/analytics";
import { bookReturnOnCost } from "@/lib/drilldown";
import { segmentAttribution, SEGMENT_AXES, SEGMENT_VIEWS } from "@/lib/segmentReturns";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

const current = currentHoldings(dedupedPositions(BOOK_POSITIONS as Position[]));
const tile = bookReturnOnCost(current, { accounts: BOOK_ACCOUNTS, universe: current });
const bookValue = current.reduce((s, p) => s + p.marketValue, 0);

ok("the control offers every axis, in order", SEGMENT_VIEWS.map((v) => v.key).join() === SEGMENT_AXES.join());

for (const axis of SEGMENT_AXES) {
  console.log(`── ${axis} ──`);
  // A fixed sector for every company, so the sector axis runs off the book alone.
  const a = segmentAttribution(current, BOOK_ACCOUNTS, axis, (k) => (k.charCodeAt(0) % 2 ? "Odd sector" : "Even sector"));
  const value = a.rows.reduce((s, r) => s + r.value, 0);
  const gain = a.rows.reduce((s, r) => s + (r.gain ?? 0), 0) + (a.mandateRemainder?.gain ?? 0);
  const dep = a.rows.reduce((s, r) => s + (r.deployed ?? 0), 0) + (a.mandateRemainder?.deployed ?? 0);
  const contrib = a.rows.reduce((s, r) => s + (r.contribPct ?? 0), 0) + (a.mandateRemainder?.contribPct ?? 0);
  ok("the total is the Gain / Loss tile's gain and return", near(a.total.gain ?? NaN, tile.fifo.gain ?? NaN) && near(a.total.returnPct ?? NaN, tile.fifo.returnPct ?? NaN, 1e-9),
    `${((a.total.gain ?? 0) / 1e7).toFixed(2)} Cr, ${(a.total.returnPct ?? 0).toFixed(2)}%`);
  ok("the segments' values add to the book's value", near(value, bookValue) && near(a.total.value, bookValue));
  ok("the segments' gains and the mandate remainder add to the total", near(gain, a.total.gain ?? NaN));
  ok("...and so do their capital deployed", near(dep, a.total.deployed ?? NaN));
  ok("the contributions add to the book's return", near(contrib, a.total.returnPct ?? NaN, 1e-6), `${contrib.toFixed(4)} pp`);
  ok("every segment's holdings add to it, with its own remainder",
    a.rows.every((r) => near(r.children.reduce((s, c) => s + c.value, 0), r.value)
      && near(r.children.reduce((s, c) => s + (c.gain ?? 0), 0) + (r.childRemainder?.gain ?? 0), r.gain ?? 0)));
  ok("a segment that strikes no gain shows none, never ₹0",
    a.rows.every((r) => (r.struck === 0) === (r.gain === null)) && a.rows.every((r) => r.children.every((c) => (c.struck === 0) === (c.gain === null))));
  if (axis === "category" || axis === "side") {
    ok("an axis that keeps each mandate in one segment needs no remainder", a.mandateRemainder === null);
  }
  if (axis === "security") {
    ok("one row per security", a.rows.length === new Set(current.map((p) => p.securityKey)).size);
  }
}

console.log("── constructed ──");
const mk = (o: Partial<Position>): Position => ({
  accountId: "x", securityKey: "k", security: "K", assetClass: "Equity", marketValue: 100, costBasis: 80,
  unrealizedPnL: 20, returnPct: 25, ...o,
} as Position);
const tiny = segmentAttribution([mk({ securityKey: "a" }), mk({ securityKey: "b", costBasis: null, unrealizedPnL: null, returnPct: null, costUnavailable: true } as Partial<Position>)], [], "security");
const b = tiny.rows.find((r) => r.key === "b")!;
ok("a holding with no cost is in the value and in no gain", b.value === 100 && b.gain === null && b.contribPct === null && b.uncostedValue === 100);
ok("the other carries the whole gain", tiny.rows.find((r) => r.key === "a")!.contribPct === 25 && tiny.total.value === 200);

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log("\nall passed");
