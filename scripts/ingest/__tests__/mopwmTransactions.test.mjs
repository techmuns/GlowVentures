// MOPWM's family transaction report (Stage 10hu): the workbook is read in full
// through its `x:`-prefixed XML, every holder is either a registered owner or
// counted as nobody's, and a holding's cost is recovered only where the rows
// leave exactly its units on the statement's own date.
import assert from "node:assert/strict";
import { classify } from "../lib/classify.mjs";
import {
  MOPWM_TRANSACTIONS, MOTILAL_DEMAT, dmyToIso, splitOf, loadMopwmTransactions, mopwmRowsFor, replayMopwmRows, reportDate,
  mopwmCapitalExits, rollMopwmFundTrades, rollMopwmShareTrades, sameScheme,
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
  const merger = rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows: [...rows, t(6, "2026-09-22", "PURCHASE", 5, 0.01, KR, "MERG/22/09/2026/1")] }, { accounts: [acct(1)], records: recs });
  assert.match(merger.refused.find((r) => r.security === KR).reason, /MERG entry, not a trade/, "gate 1: exchange trades and whole splits only");

  // A SPLIT block (Stage 10kk): every lot out at its own amount and back at
  // five times its units — one switch of the holding into itself.
  const S = "SPLIT/22/09/2026/1";
  const kr2 = t(13, "2026-09-02", "PURCHASE", 3, 330, KR);
  const lotsOut = [t(20, "2026-09-22", "SELL", 5, 500, KR, S), t(21, "2026-09-22", "SELL", 3, 330, KR, S)];
  const lotsIn = [t(22, "2026-09-22", "PURCHASE", 25, 500, KR, S), t(23, "2026-09-22", "PURCHASE", 15, 330, KR, S)];
  const later = t(24, "2026-10-01", "SELL", 10, 160, KR);
  const split = rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows: [...rows, kr2, ...lotsOut, ...lotsIn, later] }, { accounts: [acct(1)], records: recs });
  const kr = split.rolls.find((r) => r.isin === "INE001B01026");
  assert.deepEqual([kr.quantity, kr.costBasis, kr.costOfUnitsSold, kr.realizedPnL, kr.trades, kr.through], [30, 630, 200, -40, 3, "2026-10-01"],
    "8 bought, ×5 = 40, FIFO sells 10 of the first lot's 25 (cost 500 × 10/25 = 200, for 160); the split is not a trade");
  assert.deepEqual(kr.shareEvents, [{ type: "split", exDate: "2026-09-22", factor: 5 }], "the roll names the split its units carry");
  assert.deepEqual(splitOf([...lotsOut, ...lotsIn], "X").split, { type: "split", exDate: "2026-09-22", factor: 5 });
  assert.match(splitOf([lotsOut[0], { ...lotsIn[0], amount: 450 }], "X").reason, /does not come back at its own amount/, "a lot must keep its amount");
  assert.match(splitOf([lotsOut[0], { ...lotsIn[0], qty: 12 }], "X").reason, /not a whole-number split/);
  assert.match(splitOf([lotsOut[0], lotsIn[0], lotsIn[1]], "X").reason, /same number of lots/);
  const partial = rollMopwmShareTrades({ path: "x", asOf: "2026-10-23", rows: [...rows, kr2, lotsOut[0], lotsIn[0]] }, { accounts: [acct(1)], records: recs });
  assert.match(partial.refused.find((r) => r.security === KR).reason, /splits 5 units where the record holds 8/, "a split must take the whole holding");
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
  // rolls the family approved on 28 Oct 2026, and TAAL carried through its
  // 22 Sep split (Stage 10kk).
  const book = fs.readFileSync("src/data/glowData.ts", "utf8");
  const committed = JSON.parse(/export const BOOK_SHARE_ROLLS: ShareRoll\[\] = (\[[\s\S]*?\n\]);/.exec(book)[1]).filter((r) => r.isin.startsWith("INE"));
  assert.deepEqual(committed.map((r) => [r.accountId.slice(-16), r.isin, r.statementQuantity, r.quantity]), [
    ["1201090012539150", "INE559A01017", 15772, 0], ["1201090012539150", "INE001B01026", 0, 67500],
    ["1201090012539150", "INE589A01014", 32000, 0], ["1201090012539150", "INE524T01029", 0, 20000],
    ["1201090012539150", "INE011K01018", 0, 24250], ["1201090012539150", "INE358U01012", 0, 27500],
    ["1201090012838316", "INE238A01034", 7300, 0],
    ["1201090012838316", "INE090A01021", 14500, 0], ["1201090012838316", "INE062A01020", 27750, 0],
  ], "the committed book carries exactly the reconciled share trades");
  assert.ok(committed.every((r) => r.report.path === MOPWM_TRANSACTIONS && r.report.asOf === "2026-10-23"));
  const taal = committed.find((r) => /TAAL/.test(r.security));
  assert.deepEqual([taal.costBasis, taal.trades, taal.shareEvents], [18009805, 4, [{ type: "split", exDate: "2026-09-22", factor: 5 }]],
    "TAAL: 4,000 bought for ₹1,80,09,805 in September, 20,000 after its 22 Sep 5-for-1 split");
}

// ── the report's later fund trades (Stage 10me) ──────────────────────────────
{
  const SILVER = "INF740KA1RE3", NAME = "DSP Silver ETF-G", OWNER = "ankita-jaisinghani", DEMAT = "1201090012838316";
  const acct = (n) => ({ accountId: `d${n}`, accountNo: `${DEMAT}${n}`, provider: MOTILAL_DEMAT, ownerId: OWNER, asOf: "2026-07-31" });
  const names = { [SILVER]: "DSP Silver ETF", INF000000002: "Bandhan Arbitrage Fund - Direct Plan - Growth" };
  const recs = [{ accountId: "d1", isin: SILVER, quantity: 123, asOf: "2026-07-31" }];
  const m = (row, date, type, subType, qty, amount, over = {}) =>
    ({ sheet: "Mutual Funds", row, date, type, subType, qty, amount, price: amount / qty, folio: "466887", ownerId: OWNER, security: NAME, ...over });
  const rows = [m(1, "2025-09-30", "Buy", "Purchase", 230, 32200), m(2, "2026-01-22", "Sell", "Redemption", 107, 29650),
    m(3, "2026-08-28", "Buy", "Corpus In", 1230, 17220), m(4, "2026-08-28", "Sell", "Corpus Out", 123, 17220),
    m(5, "2026-10-13", "Sell", "Redemption", 1230, 25650)];
  const run = (rs, over = {}) => rollMopwmFundTrades({ path: "x", asOf: "2026-10-23", rows: rs },
    { accounts: [acct(1)], records: recs, names, statements: [], ...over });
  const out = run(rows);
  assert.deepEqual(out.rolls.map((r) => [r.accountId, r.isin, r.statementQuantity, r.quantity, r.through, r.trades, r.costOfUnitsSold, r.realizedPnL]),
    [["d1", SILVER, 123, 0, "2026-10-13", 1, 32200, 23100]], "230 bought, 107 sold, 123 split to 1,230 and redeemed whole; the split is not a trade");
  assert.deepEqual(out.rolls[0].shareEvents, [{ type: "split", exDate: "2026-08-28", factor: 10 }], "the Corpus block is DSP's recorded 1:10 split");
  const part = run([...rows.slice(0, 4), m(5, "2026-10-13", "Sell", "Redemption", 1000, 20850)]).rolls[0];
  assert.deepEqual([part.quantity, part.costBasis], [230, 3220], "a partial sale leaves the rest, at its FIFO cost");
  assert.equal(run(rows.slice(0, 4)).rolls.length, 0, "a sub-division alone is no roll: fundUnitSplits converts it");
  assert.equal(run(rows, { names: { [SILVER]: "DSP Gold ETF" } }).rolls.length, 0, "gate 1: the group must name AMFI's scheme");
  assert.match(run(rows, { records: [{ ...recs[0], quantity: 124 }] }).refused[0].reason, /holds the statement's 124 units/,
    "gate 2: the group must hold the statement's units");
  assert.match(run([...rows, ...rows.map((r) => ({ ...r, folio: "999", row: r.row + 10 }))]).refused[0].reason, /2 of the owner's report groups/,
    "gates 1-2: exactly one group");
  assert.match(run([...rows.slice(0, 2), m(3, "2026-08-28", "Buy", "Corpus In", 615, 17220), m(4, "2026-08-28", "Sell", "Corpus Out", 123, 17220), rows[4]]).refused[0].reason,
    /5-for-1 restatement no entry of shared\/fundUnitSplits\.mjs records/, "gate 3: only the sub-division its ISIN is recorded with");
  assert.match(run([...rows.slice(0, 4), m(5, "2026-10-13", "Sell", "Redemption", 2000, 41700)]).refused[0].reason, /takes units the record does not hold/, "gate 4");
  // A TRANSFER IS NOT A SALE: a whole-balance demat redemption on a day another
  // statement of the owner holds a demat redemption's exact units.
  const BA = "Bandhan Arbitrage Direct-G", baRec = { accountId: "d1", isin: "INF000000002", quantity: 1000, asOf: "2026-07-31" };
  const b = (row, date, type, qty) => m(row, date, type, type === "Buy" ? "Purchase" : "Redemption", qty, qty * 10, { folio: `${DEMAT}1`, security: BA });
  const baRows = [b(1, "2026-07-01", "Buy", 1000), b(2, "2026-08-11", "Sell", 400), b(3, "2026-10-01", "Sell", 600)];
  const elsewhere = [{ ownerId: OWNER, accountNo: "8652064", quantity: 600, asOf: "2026-10-26" }];
  const moved = rollMopwmFundTrades({ path: "x", asOf: "2026-10-23", rows: baRows }, { accounts: [acct(1)], records: [baRec], names, statements: elsewhere });
  assert.deepEqual(moved.transferDays, ["2026-10-01"], "a demat redemption another statement holds unit for unit is a transfer day");
  assert.deepEqual(moved.rolls.map((r) => [r.quantity, r.through, r.transferredOn, r.trades]), [[600, "2026-08-11", "2026-10-01", 1]],
    "the 11 Aug sale applies; the 1 Oct transfer moves the 600 left and sells none");
  const sold = rollMopwmFundTrades({ path: "x", asOf: "2026-10-23", rows: baRows }, { accounts: [acct(1)], records: [baRec], names, statements: [] });
  assert.deepEqual(sold.rolls.map((r) => [r.quantity, r.through]), [[0, "2026-10-01"]], "with no statement holding those units, a redemption is a sale");
  assert.ok(sameScheme("Kotak Multi Cap Direct-G", "Kotak Multicap Fund-Direct Plan-Growth")
    && sameScheme("Aditya Birla SL Liquid Direct-G", "Aditya Birla Sun Life Liquid Fund - Growth - Direct Plan")
    && !sameScheme("HDFC Balanced Advantage Reg-G", "HDFC Balanced Advantage Fund - Growth Plan - Direct Plan")
    && !sameScheme("ICICI Pru Liquid Direct-G", "ICICI Prudential Balanced Advantage Fund - Direct Plan -  Growth"), "scheme names, plans told apart");

  // The real report, against the book's own statement records.
  const book = fs.readFileSync("src/data/glowData.ts", "utf8");
  const committed = JSON.parse(/export const BOOK_SHARE_ROLLS: ShareRoll\[\] = (\[[\s\S]*?\n\]);/.exec(book)[1]).filter((r) => r.isin.startsWith("INF"));
  assert.deepEqual(committed.map((r) => [r.accountId.slice(-16), r.isin, r.statementQuantity, r.quantity, r.transferredOn ?? null]).sort(), [
    ["1201090012838316", "INF084M01AB8", 393095.951, 0, null], ["1201090012838316", "INF179K01830", 37755.485, 0, null],
    ["1201090012838316", "INF740KA1RE3", 123000, 0, null], ["1201090012838316", "INF740KA1SW3", 205000, 0, null],
    ["1201090012838320", "INF084M01AB8", 183499.511, 7659.877, null], ["1201090012838320", "INF109K012B0", 146856.943, 33256.943, "2026-10-01"],
    ["1201090012838320", "INF209K01VA3", 264720.521, 1855.521, "2026-10-01"], ["1201090032387399", "INF174K01LC6", 613293.929, 32693.929, "2026-10-01"],
  ].sort(), "every Motilal demat fund line the report's later trades reconcile, none through the 1 Oct transfer");
  assert.ok(committed.every((r) => r.report.sheet === "Mutual Funds" && r.trades > 0));
}

// ── a PMS/AIF folio paid out in full (Stage 10me) ────────────────────────────
{
  const a = { accountId: "aif", accountNo: "9049241536", provider: "Some AIF", ownerId: "o", asOf: "2026-06-30" };
  const pos = [{ accountId: "aif", marketValue: 100, costBasis: 80 }];
  const c = (row, date, type, amount) => ({ sheet: "PMS_AIF_SP", row, date, type, amount, folio: "9049241536", ownerId: "o", security: "F" });
  const run = (rows) => mopwmCapitalExits({ path: "x", asOf: "2026-10-23", rows }, { accounts: [a], positions: pos });
  assert.deepEqual(run([c(1, "2026-07-16", "WITHDRAWAL", 105)]).exits.map((x) => [x.accountId, x.paidOut, x.value, x.cost]), [["aif", 105, 100, 80]],
    "paid out at least the whole value, nothing paid in: redeemed");
  assert.match(run([c(1, "2026-07-16", "WITHDRAWAL", 40)]).refused[0].reason, /less than/, "a part paid out places on no units");
  assert.match(run([c(1, "2026-07-16", "WITHDRAWAL", 105), c(2, "2026-08-01", "CONTRIBUTION", 50)]).refused[0].reason, /paid in/);
  assert.equal(run([c(1, "2026-06-30", "WITHDRAWAL", 105)]).exits.length, 0, "a row on the statement's own date is inside it");
  const real = mopwmCapitalExits(report, { accounts: [{ ...a, ownerId: "ajay-jaisinghani" }], positions: [{ accountId: "aif", marketValue: 111287535.35, costBasis: null }] });
  assert.deepEqual(real.exits.map((x) => [x.through, x.paidOut]), [["2026-07-16", 112450217.21]], "MO Delphi: ₹11.25 Cr paid out on 16 Jul 2026");
}

console.log("mopwmTransactions: prefixed workbook read in full, owners, classification, FIFO replay, identity gates, share and fund rolls and capital exits passed");
