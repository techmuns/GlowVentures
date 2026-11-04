// BROKER EXPORTS (Stage 10kn) — HDFC Securities' two InvestRight CSVs read as one
// snapshot, and an equity order book filed under the demat account it settles
// into. Synthetic rows throughout; the committed archive is checked at the end.
import assert from "node:assert/strict";
import fs from "node:fs";
import { classify } from "../lib/classify.mjs";
import { readSpreadsheet, sniffFormat } from "../lib/sheet.mjs";
import { makeDocument, deriveDocument } from "../lib/document.mjs";
import * as hdfc from "../providers/hdfcSecurities.mjs";
import * as book from "../providers/equityOrderBook.mjs";

const sheetOf = (text) => ({ sheets: readSpreadsheet(Buffer.from(text)).sheets });
const flat = (text) => readSpreadsheet(Buffer.from(text)).sheets[0].rows.map((r) => r.join("\t")).join(" ").replace(/\s+/g, " ");

// ── A tab-separated file saved as .csv is read as one, not as one column ──────
const TSV = "Date\tStock\tAction\n27-Oct-26\tABC\tSell\n";
assert.equal(sniffFormat(Buffer.from(TSV)), "tsv");
assert.deepEqual(readSpreadsheet(Buffer.from(TSV)).sheets[0].rows[1], ["27-Oct-26", "ABC", "Sell"]);
assert.equal(sniffFormat(Buffer.from("a,b,c\n1,2,3\n")), "csv");
assert.equal(sniffFormat(Buffer.from("just a note\n")), "unknown");

// ── InvestRight: the trading view, dated and keyed, named by symbol ───────────
const EQUITY = [
  `"Trading account: 3110320","Equity Portfolio Details as on 02/11/2026 16:50:13"`,
  "",
  `"SYMBOL","QTY","LONG TERM QTY","AVG PRICE","LTP","LTP %","INVESTMENT VALUE","CURRENT VALUE","UNREALISED P&L","UNREALISED P&L %","TOTAL P&L","TODAY'S P&L","TODAY'S CHG %","REALISED P&L"`,
  `"AAA","100.00","100.00","1,000.50","1200.00","1.00","100050.00","120000.00","19950.00","19.94","20950.00","0.00","0.00","1000.00"`,
  `"BBB","10.00","0.00","50.00","60.00","1.00","500.00","600.00","100.00","20.00","100.00","0.00","0.00","0.00"`,
].join("\n");
const DEMAT = [
  `"Symbol","LTP","STOCK VAL.","FREE QTY","AVAIL QTY"`,
  `"AAA INDUSTRIES LIMITED EQ NEW.RS. 5/-","1200.00","120000.00","100.00","100.00"`,
  `"BBB LIMITED EQ NEW RS.1''''/-","60.00","600.00","10.00","10.00"`,
  `"CCC DEMERGED LIMITED EQ","0.00","0.00","5.00","5.00"`,
].join("\n");

const eqName = "Invest Right Equity Portfolio_3110320.csv";
const dmName = "Invest Right Demat Portfolio.csv";
const ec = classify({ fileName: eqName, text: flat(EQUITY) });
assert.deepEqual([ec.provider, ec.accountNo, ec.asOfDate, ec.reportType], ["HDFC Securities", "3110320", "2026-11-02", "holdings"]);
const dc = classify({ fileName: dmName, text: flat(DEMAT) });
assert.deepEqual([dc.provider, dc.accountNo, dc.asOfDate], ["HDFC Securities", null, null]);
// Without the app's name on the file the header alone claims nothing for HDFC Securities.
assert.notEqual(classify({ fileName: "portfolio.csv", text: flat(DEMAT) }).provider, "HDFC Securities");

const eq = hdfc.extract({ grid: sheetOf(EQUITY), meta: { docKey: "eq" } });
assert.equal(eq.owner, "Ajay Jaisinghani");
assert.ok(eq.warnings.some((w) => w.code === "owner-from-register"));
assert.equal(eq.holdings.length, 2);
const aaa = eq.holdings[0];
assert.deepEqual([aaa.symbol, aaa.quantity, aaa.unitCost, aaa.totalCost, aaa.marketPrice, aaa.realized],
  ["AAA", 100, 1000.5, 100050, 1200, 1000]);

// A row whose columns do not reproduce each other is refused, and named.
const broken = EQUITY.replace(`"120000.00","19950.00"`, `"130000.00","19950.00"`);
const br = hdfc.extract({ grid: sheetOf(broken), meta: { docKey: "eq" } });
assert.equal(br.holdings.length, 1);
assert.ok(br.warnings.some((w) => w.code === "row-does-not-reproduce-itself" && /AAA/.test(w.detail)));

// The depository view: names cleaned of the app's quoting, a 0.00 LTP is no price.
const dm = hdfc.extract({ grid: sheetOf(DEMAT), meta: { docKey: "dm" } });
assert.deepEqual(dm.holdings.map((h) => h.securityKey), ["aaa-industries", "bbb", "ccc-demerged"]);
assert.equal(dm.holdings[1].printedSecurity, "BBB LIMITED EQ NEW RS.1''''/-");
assert.equal(dm.holdings[2].marketPrice, null);
assert.equal(dm.holdings[2].printed.marketValue, null);
assert.ok(dm.warnings.some((w) => w.code === "no-rate-published"));

// ── The pair: one snapshot, or nothing ────────────────────────────────────────
const asDoc = (r, key, sourcePath) => deriveDocument(makeDocument({ docKey: key, sourcePath, status: "ok", ...r }));
const rekey = (d) => { d.docKey = `hdfc-securities-${d.accountNo}-${d.asOf}-holdings`; return d; };
function pairOf(eqText, dmText, dirs = ["x/a.csv", "x/b.csv"]) {
  const docs = [
    asDoc(hdfc.extract({ grid: sheetOf(eqText), meta: { docKey: "hdfc-securities-3110320-2026-11-02-holdings" } }), "hdfc-securities-3110320-2026-11-02-holdings", dirs[0]),
    asDoc({ ...hdfc.extract({ grid: sheetOf(dmText), meta: { docKey: "dm" } }) }, "hdfc-securities-unknown-unknown-holdings", dirs[1]),
  ];
  const n = hdfc.pairDematPortfolio(docs, { rekey });
  return { n, trading: docs[0], demat: docs[1] };
}
{
  const { n, trading, demat } = pairOf(EQUITY, DEMAT);
  assert.equal(n, 1);
  assert.equal(demat.twinOf, trading.docKey);
  assert.equal(demat.accountNo, "3110320");
  assert.equal(demat.holdings.length, 0, "the witness adds no facts");
  assert.deepEqual(trading.holdings.map((h) => h.securityKey), ["aaa-industries", "bbb", "ccc-demerged"]);
  assert.equal(trading.holdings[0].printedSecurity, "AAA");
  assert.equal(trading.holdings[2].source, demat.docKey);
  const weights = trading.holdings.reduce((t, h) => t + (h.pctAssets ?? 0), 0);
  assert.ok(Math.abs(weights - 100) < 0.02, `weights re-derived over every row: ${weights}`);
  assert.ok(!trading.warnings.some((w) => w.code === "security-named-by-symbol-only"));
}
{
  // An LTP that differs by a paisa is another moment: refused, and the trading
  // view says it is still named by symbol.
  const { n, trading, demat } = pairOf(EQUITY, DEMAT.replace(`"1200.00","120000.00"`, `"1200.01","120001.00"`));
  assert.equal(n, 0);
  assert.equal(demat.twinOf, undefined);
  assert.ok(demat.warnings.some((w) => w.code === "demat-portfolio-not-paired"));
  assert.ok(trading.warnings.some((w) => w.code === "security-named-by-symbol-only"));
}
{
  // Different folders are different deliveries.
  const { n } = pairOf(EQUITY, DEMAT, ["x/a.csv", "y/b.csv"]);
  assert.equal(n, 0);
}

// ── The order book ────────────────────────────────────────────────────────────
const HEAD = "Date\tStock\tAction\tQty\tPrice\tTrade Value\tOrder Ref.\tSettlement\tSegment\tDP Id - Client DP Id\tExchange\tSTT\tTransaction and SEBI Turnover charges\tStamp Duty\tBrokerage + Service Tax\tBrokerage Incl. Taxes";
const row = (...c) => c.join("\t");
const BOOK = [HEAD,
  row("27-Oct-26", "SMARTWORKS", "Sell", "10000", "453.94", "4532918.55", "R1", "2026202", "Rolling T1", "IN302902-49794950", "NSE", "4545.8", "143.69", "0", "3770.1", "8459.59"),
  row("02-Jul-26", "FEDERALBNK", "Buy", "100", "330.91", "33091", "R2", "2026120", "Rolling T1", "IN302902-49794950", "NSE", "33", "1", "5", "27", "66"),
  row("22-Oct-26", "NOSUCHSYM", "Buy", "10", "1", "10", "R3", "2026200", "Rolling T1", "IN302902-49794950", "NSE", "0", "0", "0", "0", "0"),
].join("\n");
const bc = classify({ fileName: "orderBook_Equity_1.csv", text: flat(BOOK) });
assert.deepEqual([bc.provider, bc.accountNo, bc.reportType], ["ICICI Bank (NSDL demat)", "49794950", "transaction-statement"]);

const ob = book.extract({ grid: sheetOf(BOOK), meta: { docKey: "ob" } });
assert.equal(ob.accountNo, "49794950");
assert.equal(ob.asOf, "2026-10-27");
assert.equal(ob.transactions.length, 3);
const sw = ob.transactions[0];
// The trade value is the consideration; the printed price is the order's.
assert.equal(sw.isin, "INE0NAZ01010");
assert.equal(sw.side, "sell");
assert.ok(Math.abs(sw.unitPrice * sw.quantity - 4532918.55) < 1e-6);
assert.equal(sw.stt, 4545.8);
assert.equal(sw.otherCharges, 3913.79);
assert.match(sw.description, /at 453\.94/);
assert.equal(ob.transactions[2].isin, null);
assert.ok(ob.warnings.some((w) => w.code === "symbol-not-resolved" && /NOSUCHSYM/.test(w.detail)));
// EMAIN is not an exchange symbol; the account's own statements pin it.
assert.equal(book.isinOfSymbol("EMAIN", "NSE")?.isin, "INE0ZOL01023");
assert.equal(book.isinOfSymbol("YASHHV", "BSE")?.isin, "INE00GK01023");

// Charges that do not add to their printed total refuse the row.
const bad = book.extract({ grid: sheetOf(BOOK.replace("\t8459.59", "\t8460.59")), meta: { docKey: "ob" } });
assert.equal(bad.transactions.length, 2);
assert.ok(bad.warnings.some((w) => w.code === "trade-row-not-read"));

// Two demat accounts in one file, or a DP no letterhead names: nothing is read.
const two = book.extract({ grid: sheetOf(BOOK.replace("R2\t2026120\tRolling T1\tIN302902-49794950", "R2\t2026120\tRolling T1\tIN302902-11111111")), meta: { docKey: "ob" } });
assert.equal(two.transactions.length, 0);
assert.ok(two.warnings.some((w) => w.code === "demat-account-not-placed"));
const foreign = book.extract({ grid: sheetOf(BOOK.split("IN302902-").join("IN300476-")), meta: { docKey: "ob" } });
assert.equal(foreign.transactions.length, 0);

// A file that is not an order book is not this reader's.
assert.equal(book.extract({ grid: sheetOf("a,b,c\n1,2,3\n"), meta: {} }), null);

// The trades take the account's own holding statement's name for each ISIN.
{
  const docs = [
    { docKey: "h", provider: "ICICI Bank (NSDL demat)", accountNo: "49794950", reportType: "holdings", warnings: [],
      holdings: [{ isin: "INE171A01029", security: "THE FEDERAL BANK LIMITED - EQ NEW FV RS.2/", securityKey: "the-federal-bank" }] },
    { ...ob, docKey: "ob", warnings: [], transactions: ob.transactions.map((t) => ({ ...t })) },
  ];
  assert.equal(book.nameTradesByIsin(docs), 1);
  const fed = docs[1].transactions[1];
  assert.equal(fed.securityKey, "the-federal-bank");
  assert.match(fed.description, /^FEDERALBNK: /);
}

// ── The committed archive ─────────────────────────────────────────────────────
const AUDIT = "public/audit";
const read = (k) => JSON.parse(fs.readFileSync(`${AUDIT}/${k}/document.json`, "utf8"));
if (fs.existsSync(`${AUDIT}/hdfc-securities-3110320-2026-11-02-holdings`)) {
  const t = read("hdfc-securities-3110320-2026-11-02-holdings");
  assert.equal(t.status, "ok");
  assert.equal(t.holdings.length, 10);
  assert.ok(t.holdings.every((h) => h.security !== h.symbol), "every row named by the depository view");
  const d = read("hdfc-securities-3110320-2026-11-02-holdings-demat");
  assert.equal(d.twinOf, t.docKey);
  const o = read("icici-bank-nsdl-demat-49794950-2026-10-27-transaction-statement");
  assert.equal(o.ownerId, "ajay-jaisinghani");
  assert.equal(o.transactions.length, 73);
  // Every sale ties to the account's two holding statements.
  const sold = (key) => o.transactions.filter((x) => x.securityKey === key && x.side === "sell").reduce((s, x) => s + x.quantity, 0);
  assert.equal(sold("smartworks-coworking-spaces"), 187778);
  assert.equal(sold("insolation-energy"), 212000);
  assert.equal(sold("ema-partners-india"), 44000);
  assert.equal(sold("yash-highvoltage"), 34000);
}

console.log("brokerExports: ok");
