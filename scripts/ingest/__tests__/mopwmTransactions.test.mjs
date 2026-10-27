// MOPWM's family transaction report (Stage 10hu): the workbook is read in full
// through its `x:`-prefixed XML, every holder is either a registered owner or
// counted as nobody's, and a holding's cost is recovered only where the rows
// leave exactly its units on the statement's own date.
import assert from "node:assert/strict";
import { classify } from "../lib/classify.mjs";
import {
  MOPWM_TRANSACTIONS, dmyToIso, exitAfterStatement, loadMopwmTransactions, mopwmRowsFor, replayMopwmRows, reportDate,
} from "../../lib/mopwmTransactions.mjs";
import { retireConfirmedExits } from "../../lib/confirmedExits.mjs";
import { readSpreadsheet } from "../lib/sheet.mjs";
import fs from "node:fs";

// ── the real workbook ────────────────────────────────────────────────────────
const report = loadMopwmTransactions(".");
assert.equal(report.asOf, "2026-10-23", "the generation stamp in the file name");
assert.deepEqual(report.tabs.map((t) => [t.name, t.rows]), [
  ["Direct Equity", 1378], ["Mutual Funds", 24602], ["PMS_AIF_SP", 418], ["Fixed Income", 2], ["Derivative", 2],
], "every row of every tab — a prefixed workbook is not an empty one");
const owners = new Set(report.rows.map((r) => r.ownerId));
for (const id of ["ajay-jaisinghani", "ankita-jaisinghani", "bharat-jaisinghani", "aarti-jaisinghani",
  "bharat-jaisinghani-family-trust", "bharat-jaisinghani-family-trust-2", "bharat-jaisinghani-family-trust-3", "hope-india-trust"])
  assert.ok(owners.has(id), `${id} resolves, the M/S prefix stripped`);
const strangers = new Set(report.rows.filter((r) => !r.ownerId).map((r) => r.holder));
assert.equal(strangers.size, 9, "holders the registry does not know are attributed to nobody");
assert.equal(report.rows.filter((r) => !r.ownerId).every((r) => r.sheet === "Mutual Funds"), true);
assert.equal(report.rows.find((r) => r.sheet === "Derivative").segment, "COMMODITIES", "a segment heading is not a holder");

const wb = readSpreadsheet(fs.readFileSync(MOPWM_TRANSACTIONS));
const text = wb.sheets.map((s) => s.rows.map((r) => r.join("\t")).join("\n")).join("\n");
const meta = classify({ fileName: "ANKITA_JAISINGHANI_FAMILY_23Oct2026131535.xlsx", text });
assert.equal(meta.provider, "Adviser transaction report (not a statement)", "never filed under a manager it names");
assert.equal(meta.reportType, "unknown");
assert.equal(meta.accountNo, null);

assert.equal(dmyToIso("01-Jul-2026"), "2026-07-01");
assert.equal(dmyToIso("2026-07-01"), null);
assert.throws(() => reportDate("source/x/report.xlsx"));

// ── the replay ───────────────────────────────────────────────────────────────
const eq = (row, date, type, qty, amount, ref = "NSE/M/121/D") =>
  ({ sheet: "Direct Equity", row, date, type, qty, amount, price: amount / qty, ref, ownerId: "o", security: "S" });
const isin = "INE000000001";
const trades = [eq(1, "2020-01-01", "PURCHASE", 10, 1000), eq(2, "2021-01-01", "PURCHASE", 10, 3000),
  eq(3, "2023-01-01", "SELL", 15, 4500), eq(4, "2026-09-23", "SELL", 5, 2000)];
const r = replayMopwmRows(trades, { isin, asOf: "2026-07-31", quantity: 5 });
assert.equal(r.costBasis, 1500);
assert.equal(r.costOfUnitsSold, 2500);
assert.equal(r.realizedPnL, 2000);
assert.deepEqual(r.heldPurchases, { first: "2021-01-01", last: "2021-01-01", lots: 1 });
assert.equal(r.dividendReceived, null, "the report carries no cash dividends: unreported, not zero");
assert.equal(r.salesAfter, 1, "a sale after the statement is counted, never applied");
assert.deepEqual(r.rows, [1, 2, 3]);
assert.match(replayMopwmRows(trades, { isin, asOf: "2026-07-31", quantity: 6 }).reason, /FIFO holds 5 units; custodian records 6/);
assert.match(replayMopwmRows([...trades, eq(5, "2022-06-01", "PURCHASE", 10, 0, "SPLIT/01/06/2022/1")], { isin, asOf: "2026-07-31", quantity: 15 }).reason,
  /SPLIT entry, not a trade/, "a corporate-action entry refuses rather than re-dating the lots");
assert.match(replayMopwmRows([{ ...trades[0], amount: 1200 }], { isin, asOf: "2026-07-31", quantity: 10 }).reason, /does not tie/);
assert.match(replayMopwmRows([trades[2]], { isin, asOf: "2026-07-31", quantity: 0 }).reason, /no purchase lots/);
assert.match(replayMopwmRows([eq(1, "2020-01-01", "PURCHASE", 5, 500), eq(2, "2021-01-01", "SELL", 6, 900)], { isin, asOf: "2026-07-31", quantity: 0 }).reason,
  /not covered by recorded purchases/);

const mf = (row, date, type, subType, qty, price, amount = qty * price) =>
  ({ sheet: "Mutual Funds", row, date, type, subType, qty, price, amount, folio: "1201090012539150", ownerId: "o", security: "F" });
const fund = "INF000000001";
const units = [mf(1, "2025-01-01", "Buy", "Purchase", 100, 10, 1000.04), mf(2, "2025-02-01", "Buy", "Div Reinvest", 1, 10),
  mf(3, "2025-03-01", "Sell", "Switch Out", 50, 12), mf(4, "2025-04-01", "Buy", "Switch In", 20, 11)];
const f = replayMopwmRows(units, { isin: fund, asOf: "2026-07-31", quantity: 71 });
assert.equal(f.costBasis, 730.02, "stamp duty rides in the purchase amount; the switch-in is a priced acquisition");
assert.equal(f.realizedPnL, 99.98);
assert.match(replayMopwmRows([...units, mf(5, "2025-05-01", "Buy", "Corpus In", 1, 10)], { isin: fund, asOf: "2026-07-31", quantity: 72 }).reason,
  /unsupported transaction Buy \/ Corpus In/);

// ── which rows may speak for a holding ───────────────────────────────────────
const demat = { ownerId: "ankita-jaisinghani", accountNo: "1201090012838316", provider: "Motilal Oswal Financial Services (demat)" };
assert.ok(mopwmRowsFor(report, { isin: "INE238A01034", account: demat }), "Ankita's Axis Bank trades");
assert.equal(mopwmRowsFor(report, { isin: "INE238A01034", account: { ...demat, provider: "ICICI Bank (NSDL demat)" } }), null,
  "a share's trades settle in the Motilal depository, not another");
assert.ok(mopwmRowsFor(report, { isin: "INE238A01034", account: { ...demat, ownerId: "ajay-jaisinghani" } })
  .every((x) => x.holder === "MR. AJAY THAKURDAS JAISINGHANI"), "one owner's trades never speak for another's holding");
assert.equal(mopwmRowsFor(report, { isin: "INE238A01034", account: { ...demat, ownerId: "bharat-jaisinghani-family-trust-2" } }), null);
assert.equal(mopwmRowsFor(report, { isin: "INE999999999", account: demat }), null, "no alias, no rows");
const ajay = { ownerId: "ajay-jaisinghani", accountNo: "1201090012539150", provider: "Motilal Oswal Financial Services (demat)" };
const kotak = mopwmRowsFor(report, { isin: "INF174K01LC6", account: ajay });
assert.ok(kotak.every((x) => x.folio === "1201090012539150"), "a fund's rows are the folio that is this account");
const k = replayMopwmRows(kotak, { isin: "INF174K01LC6", asOf: "2026-07-31", quantity: 4165239.582 });
assert.equal(k.costBasis, 177991100.44);
assert.deepEqual(k.heldPurchases, { first: "2026-07-02", last: "2026-07-02", lots: 1 });
assert.equal(k.salesAfter, 1, "redeemed in full on 23 Sep 2026, after the 31 Jul statement");
assert.match(replayMopwmRows(mopwmRowsFor(report, { isin: "INE1CDF01017", account: ajay }), { isin: "INE1CDF01017", asOf: "2026-07-31", quantity: 281000 }).reason,
  /DMERG entry/, "Vedanta Aluminium's demerger lot is not a trade");

// ── a confirmed exit is applied only to nil, on exchange trades (Stage 10ib) ─
const sold = exitAfterStatement(trades, { isin, asOf: "2026-07-31", quantity: 5 });
assert.deepEqual(sold, { exitedOn: "2026-09-23", unitsSold: 5, rows: [4] });
assert.match(exitAfterStatement(trades, { isin, asOf: "2026-07-31", quantity: 6 }).reason, /does not reconcile the statement's 6 units/);
assert.match(exitAfterStatement(trades.slice(0, 3), { isin, asOf: "2026-07-31", quantity: 5 }).reason, /no trade after 2026-07-31/);
assert.match(exitAfterStatement([...trades.slice(0, 3), eq(4, "2026-09-23", "SELL", 3, 1200)], { isin, asOf: "2026-07-31", quantity: 5 }).reason,
  /leave 2 units, not nil/, "a partial sale never moves the statement's quantity");
assert.match(exitAfterStatement([...trades.slice(0, 3), eq(4, "2026-09-23", "SELL", 5, 2000, "OFFMKT/1")], { isin, asOf: "2026-07-31", quantity: 5 }).reason,
  /OFFMKT entry, not a trade/, "an off-market transfer is not a sale");
assert.match(exitAfterStatement([...trades.slice(0, 3), eq(4, "2026-09-23", "SELL", 6, 2400)], { isin, asOf: "2026-07-31", quantity: 5 }).reason,
  /sells units the holding no longer has/);
assert.deepEqual(exitAfterStatement([...trades, eq(5, "2026-10-01", "PURCHASE", 2, 800), eq(6, "2026-10-02", "SELL", 2, 900)],
  { isin, asOf: "2026-07-31", quantity: 5 }).rows, [4, 5, 6], "a round trip after the exit still ends at nil");
// Ankita's two bank shares on her Motilal demat: the report's own rows.
for (const [bank, qty, row] of [["INE238A01034", 7300, 1127], ["INE090A01021", 14500, 1221]]) {
  const e = exitAfterStatement(mopwmRowsFor(report, { isin: bank, account: demat }), { isin: bank, asOf: "2026-07-31", quantity: qty });
  assert.deepEqual(e, { exitedOn: "2026-09-23", unitsSold: qty, rows: [row] }, `${bank} sold in full on 23 Sep 2026`);
}

// The seam refuses rather than guesses.
const acct = { accountId: "m", provider: demat.provider, accountNo: demat.accountNo, ownerId: demat.ownerId };
const line = (o = {}) => ({ accountId: "m", ownerId: demat.ownerId, securityKey: "axis-bank", security: "AXIS BANK EQ",
  isin: "INE238A01034", assetClass: "Equity", quantity: 7300, asOf: "2026-07-31", ...o });
const decision = { ...demat, isin: "INE238A01034", confirmed: "2026-10-27", words: "exited" };
const retire = (o) => { const notes = []; const unvalued = o.unvalued ?? [line()];
  const out = retireConfirmedExits({ accounts: [acct], positions: [], report, notes, exits: [decision], ...o, unvalued });
  return { out, unvalued, notes }; };
const ok = retire({});
assert.equal(ok.unvalued.length, 0, "the witnessed line leaves the held book");
assert.deepEqual([ok.out[0].exitedOn, ok.out[0].sale.rows, ok.out[0].quantity], ["2026-09-23", [1127], 7300]);
assert.match(ok.notes[0], /^confirmed exit: AXIS BANK EQ/);
assert.throws(() => retire({ unvalued: [line({ quantity: 7301 })] }), /not witnessed — the report does not reconcile/);
assert.throws(() => retire({ unvalued: [line(), line()] }), /reaches 2 lines/);
assert.throws(() => retire({ positions: [{ accountId: "m", isin: "INE238A01034" }] }), /valued holding/);
assert.throws(() => retire({ accounts: [{ ...acct, ownerId: "ajay-jaisinghani" }] }), /is ankita-jaisinghani's/);
assert.throws(() => retire({ accounts: [] }), /carries 0 times/);
const gone = retire({ unvalued: [] });
assert.deepEqual([gone.out, gone.notes.length], [[], 1]);
assert.match(gone.notes[0], /reaches no line/, "a newer statement without the line: named, nothing retired");

console.log("mopwmTransactions: prefixed workbook read in full, owners, classification, FIFO replay, identity gates and confirmed exits passed");
