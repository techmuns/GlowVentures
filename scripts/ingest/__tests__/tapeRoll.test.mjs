// A PMS account's own tape, rolled past its holding statement as one mandate
// (Stage 10mh): every line, the cash and the names it bought, witnessed by the
// manager's own later fact sheet — or nothing, with the reason.
import assert from "node:assert/strict";
import fs from "node:fs";
import { rollAccountTape } from "../../lib/tapeRoll.mjs";

const saved = { from: "2025-01-01", through: "2026-10-31", bySymbol: new Map() };
const pos = (securityKey, quantity, marketValue, extra = {}) =>
  ({ securityKey, security: securityKey.toUpperCase(), assetClass: "Equity", quantity, marketValue, currentPrice: marketValue / quantity, costBasis: marketValue * 0.8, ...extra });
const cash = (securityKey, v) => ({ securityKey, security: securityKey, assetClass: "Cash", quantity: v, marketValue: v, currentPrice: 1, costBasis: v });
const t = (date, side, securityKey, quantity, unitPrice) => ({ date, side, securityKey, security: securityKey.toUpperCase(), quantity, unitPrice, settled: quantity * unitPrice });
const positions = [pos("aaa", 100, 10000), pos("bbb", 50, 5000), pos("ccc", 10, 2000), cash("cash", 50000), cash("cash-rec-payable", 1000)];
const trades = [t("2026-08-05", "sell", "bbb", 50, 110), t("2026-08-06", "buy", "new", 20, 300), t("2026-08-07", "sell", "aaa", 40, 105),
  t("2026-09-22", "buy", "new", 5, 320), t("2026-09-23", "sell", "ccc", 4, 210)];
// On 22 Sep: aaa 60, ccc 10, new 25; cash and a receivable.
const values = [{ securityKey: "aaa", security: "AAA", marketValue: 6600 }, { securityKey: "ccc", security: "CCC", marketValue: 2100 },
  { securityKey: "new", security: "NEW", marketValue: 7750 }, { securityKey: "cash", security: "Cash", sector: "Cash and Equivalent", marketValue: 51000 },
  { securityKey: "dividend-interest-receivable", security: "Dividend / Interest receivable", marketValue: 50 }];
const sheet = (over = {}) => ({ asOf: "2026-09-22", docKey: "fs", corpus: 67500, values, ...over });
const run = (over = {}) => rollAccountTape({ asOf: "2026-07-27", positions, trades, tapeTo: "2026-09-23", factSheet: sheet(),
  saved, symbolOf: () => null, demergers: [], ...over });

const r = run();
assert.equal(r.reason, undefined, r.reason);
const row = (k) => r.rows.find((x) => x.securityKey === k);
assert.deepEqual([row("aaa").quantity, row("aaa").price, row("aaa").costBasis], [60, 110, null], "sold down: rolled units at the fact sheet's price; a sale past the capital gains leaves no cost");
assert.deepEqual([row("bbb").quantity, row("bbb").costBasis], [0, 0], "sold to nil");
assert.deepEqual([row("ccc").quantity, row("ccc").price], [6, 210], "a sale after the fact sheet moves its units");
assert.deepEqual([row("new").quantity, row("new").price, row("new").costBasis, row("new").statement], [25, 310, 7600, null],
  "a name the statement never held: its own trades, first-in first-out, marked at the fact sheet's price");
assert.deepEqual(row("new").heldPurchases, { first: "2026-08-06", last: "2026-09-22", lots: 2 });
assert.equal(row("cash").quantity, 51000 + 840, "cash is the fact sheet's, settled for the trade after it");
assert.equal(row("cash-rec-payable").quantity, 0, "a cash line the fact sheet no longer prints is nil");
assert.equal(row("dividend-interest-receivable").quantity, 50, "a cash line only the fact sheet prints is a new line");
const at22 = r.rows.filter((x) => x.securityKey !== "cash").reduce((s, x) => s + x.quantity * (x.price ?? 0), 0) - row("ccc").quantity * 210 + 10 * 210 + 51000;
assert.equal(Math.round(at22), 67500, "on the fact sheet's date the rolled lines add to its portfolio value");

// The gates, each refusing the whole account.
assert.match(run({ factSheet: sheet({ corpus: 70000 }) }).reason, /not its printed portfolio value/, "gate 1: the lines add to the printed value");
assert.match(run({ factSheet: sheet({ asOf: "2026-07-20" }) }).reason, /no fact sheet is dated after/);
assert.match(run({ tapeTo: "2026-09-20" }).reason, /tape stops on 2026-09-20/);
assert.match(run({ trades: [...trades, t("2026-09-01", "sell", "aaa", 100, 100)] }).reason, /sells more aaa/, "gate 2: no line below nil");
assert.match(run({ factSheet: sheet({ values: values.filter((v) => v.securityKey !== "new").concat([{ securityKey: "cash", security: "Cash", marketValue: 7750 }]) }) }).reason,
  /holds 25 new where the fact sheet does not list it/, "gate 3: every held name listed");
assert.match(run({ factSheet: sheet({ values: [...values.slice(0, 3), { securityKey: "bbb", security: "BBB", marketValue: 0.0001 }, ...values.slice(3)], corpus: 67500.0001 }) }).reason,
  /holds no bbb where the fact sheet lists it/, "gate 3: no name sold to nil listed");
assert.match(run({ factSheet: sheet({ values: values.map((v) => v.securityKey === "aaa" ? { ...v, marketValue: 66000 } : v), corpus: 126900 }) }).reason,
  /aaa's 2026-09-22 value over its 60 rolled units is 1100/, "gate 4: the printed value is a price the tape bears out");
const bonus = { ...saved, bySymbol: new Map([["AAA", [{ ticker: "AAA", type: "bonus", exDate: "2026-08-20", factor: 2, purpose: "Bonus 1:1", source: "NSE", id: "x" }]]]) };
assert.match(run({ saved: bonus, symbolOf: (k) => k.toUpperCase() }).reason, /aaa's bonus of 2026-08-20 falls inside the roll/, "gate 2: no split or bonus inside the roll");
assert.match(run({ factSheet: sheet({ values: [...values, { securityKey: "zzz", security: "ZZZ Ltd", sector: "Banks", marketValue: 1 }], corpus: 67501 }) }).reason,
  /lists zzz, which neither the statement nor the tape holds/);

// A registered demerger allots the child on its record date; parent and child are priced together.
const dm = [{ parentKey: "new", childKey: "kid", recordDate: "2026-09-07", ratio: 1 }];
const dv = values.map((v) => v.securityKey === "new" ? { ...v, marketValue: 2500 } : v).concat([{ securityKey: "kid", security: "KID", marketValue: 5250 }]);
const d = run({ demergers: dm, factSheet: sheet({ values: dv }) });
assert.equal(d.reason, undefined, d.reason);
assert.deepEqual([d.rows.find((x) => x.securityKey === "kid").quantity, d.rows.find((x) => x.securityKey === "kid").costBasis, d.rows.find((x) => x.securityKey === "new").costBasis],
  [20, null, null], "the child takes the parent's 20 record-date units; neither carries a cost no apportionment records");

// The committed book: Green Lantern's two accounts, rolled to their own fact sheets.
const book = fs.readFileSync("src/data/glowData.ts", "utf8");
const tapeRows = JSON.parse(/export const BOOK_TAPE_ROWS: Position\[\] = (\[[\s\S]*?\n\]|\[\]);/.exec(book)[1]);
for (const acct of ["green-lantern-capital-llp-510854", "green-lantern-capital-llp-510861"]) {
  const bought = tapeRows.filter((p) => p.accountId === acct).map((p) => p.securityKey).sort();
  assert.deepEqual(bought, ["dividend-interest-receivable", "elgi-equipments", "heg-advanced-materials", "heg-graphite", "indian-energy-exchange"],
    `${acct}: the names its tape bought, HEG's demerged child, and the fact sheet's receivable`);
}
console.log("tapeRoll: one mandate, rolled whole to its own fact sheet — or not at all, with the reason");
