// MOPWM's family transaction report (Stage 10hu): the workbook is read in full
// through its `x:`-prefixed XML, every holder is either a registered owner or
// counted as nobody's, and a holding's cost is recovered only where the rows
// leave exactly its units on the statement's own date.
import assert from "node:assert/strict";
import { classify } from "../lib/classify.mjs";
import {
  MOPWM_TRANSACTIONS, MOTILAL_DEMAT, dmyToIso, loadMopwmTransactions, mopwmRowsFor, replayMopwmRows, reportDate, rollMopwmShareTrades,
} from "../../lib/mopwmTransactions.mjs";
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

// ── the later share trades (Stage 10iw) ──────────────────────────────────────
{
  const acct = (n, owner = "o", asOf = "2026-07-31") => ({ accountId: `d${n}`, provider: MOTILAL_DEMAT, ownerId: owner, asOf });
  const t = (row, date, type, qty, amount, security, ref = "NSE/M/121/D") =>
    ({ sheet: "Direct Equity", row, date, type, qty, amount, price: amount / qty, ref, ownerId: "o", security });
  const AX = "Axis Bank Ltd", IC = "ICICI Bank Ltd", KR = "KRBL Ltd";
  const rows = [t(1, "2021-01-01", "PURCHASE", 10, 1000, AX), t(2, "2026-09-23", "SELL", 10, 1500, AX),
    t(3, "2026-08-28", "PURCHASE", 5, 500, KR), t(4, "2022-01-01", "PURCHASE", 4, 400, IC), t(5, "2026-09-01", "SELL", 1, 150, IC)];
  const recs = [{ accountId: "d1", isin: "INE238A01034", quantity: 10, asOf: "2026-07-31" },
    { accountId: "d1", isin: "INE090A01021", quantity: 4, asOf: "2026-07-31" }];
  const out = rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows }, { accounts: [acct(1)], records: recs });
  const by = (isin) => out.rolls.find((r) => r.isin === isin);
  assert.deepEqual([by("INE238A01034").quantity, by("INE238A01034").realizedPnL, by("INE238A01034").through], [0, 500, "2026-09-23"], "sold to nil, FIFO realised");
  assert.deepEqual([by("INE090A01021").statementQuantity, by("INE090A01021").quantity, by("INE090A01021").costBasis], [4, 3, 300], "a partial sale");
  assert.deepEqual([by("INE001B01026").statementQuantity, by("INE001B01026").quantity, by("INE001B01026").costBasis, by("INE001B01026").accountId],
    [0, 5, 500, "d1"], "a share bought since lands on the demat the report already reproduces");
  const wrongUnits = rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows }, { accounts: [acct(1)], records: [{ ...recs[0], quantity: 11 }, recs[1]] });
  assert.match(wrongUnits.refused.find((r) => r.security === AX).reason, /holds 10 on 2026-07-31 where the statement records 11/, "gate 4: the record must be whole");
  const split = rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows: [...rows, t(6, "2026-09-22", "PURCHASE", 5, 0.01, KR, "SPLIT/22/09/2026/1")] }, { accounts: [acct(1)], records: recs });
  assert.match(split.refused.find((r) => r.security === KR).reason, /SPLIT entry, not a trade/, "gate 1: exchange trades only");
  const unknown = rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows: [t(1, "2026-09-01", "PURCHASE", 1, 10, "Nobody Ltd")] }, { accounts: [acct(1)], records: [] });
  assert.match(unknown.refused[0].reason, /no alias/, "gate 2: an exact alias");
  const twoDemats = rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows }, { accounts: [acct(1), acct(2)], records: [...recs, { ...recs[1], accountId: "d2" }] });
  assert.match(twoDemats.refused.find((r) => r.security === IC).reason, /2 of the owner's Motilal demats record/, "gate 3: one account");
  assert.match(twoDemats.refused.find((r) => r.security === KR).reason, /reproduce a recorded balance on 2 of the owner's Motilal demats/);
  const oversold = rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows: [...rows, t(7, "2026-10-01", "SELL", 9, 900, IC)] }, { accounts: [acct(1)], records: recs });
  assert.match(oversold.refused.find((r) => r.security === IC).reason, /takes units the record does not hold/, "gate 5");
  assert.equal(rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows }, { accounts: [{ ...acct(1), provider: "ICICI Bank (NSDL demat)" }], records: recs }).rolls.length, 0,
    "only a Motilal demat");

  // The real workbook, against the book's own statement records: the eight
  // rolls the family approved on 28 Oct 2026, and TAAL's split refused.
  const book = fs.readFileSync("src/data/glowData.ts", "utf8");
  const committed = JSON.parse(/export const BOOK_SHARE_ROLLS: ShareRoll\[\] = (\[[\s\S]*?\n\]);/.exec(book)[1]);
  assert.deepEqual(committed.map((r) => [r.accountId.slice(-16), r.isin, r.statementQuantity, r.quantity]), [
    ["1201090012539150", "INE559A01017", 15772, 0], ["1201090012539150", "INE001B01026", 0, 67500],
    ["1201090012539150", "INE589A01014", 32000, 0], ["1201090012539150", "INE011K01018", 0, 24250],
    ["1201090012539150", "INE358U01012", 0, 27500], ["1201090012838316", "INE238A01034", 7300, 0],
    ["1201090012838316", "INE090A01021", 14500, 0], ["1201090012838316", "INE062A01020", 27750, 0],
  ], "the committed book carries exactly the reconciled share trades");
  assert.ok(committed.every((r) => r.report.path === MOPWM_TRANSACTIONS && r.report.asOf === "2026-10-23"));
  assert.ok(!committed.some((r) => /TAAL/.test(r.security)), "TAAL's 22 Sep split is not an exchange trade");
}

console.log("mopwmTransactions: prefixed workbook read in full, owners, classification, FIFO replay, identity gates and share rolls passed");
