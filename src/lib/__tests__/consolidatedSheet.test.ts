import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { buildConsolidatedSheet, CONSOLIDATED_VIEW, TRANSACTIONS, type ConsolidatedBook } from "../consolidatedSheet";
import { createConsolidatedWorkbook, consolidatedExcelTarget } from "../exportConsolidatedExcel";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_AS_OF, BOOK_SUMMARY, BOOK_COMMITMENTS, BOOK_RECOVERED_COSTS, BOOK_POLYCAB } from "../../data/glowData";
import { deriveTransactions, deriveRealisedLots, type ArchiveDoc } from "../ledgerModel";
import revision from "../../data/readModels.json";

const manifest = JSON.parse(readFileSync("public/audit/manifest.json", "utf8"));
const docs: ArchiveDoc[] = manifest.map((d: { docKey: string }) => JSON.parse(readFileSync(`public/audit/${d.docKey}/document.json`, "utf8")));
const book = buildConsolidatedSheet(docs);
assert.deepEqual(JSON.parse(readFileSync(`public/views/${revision.revision}/consolidated/book.json`, "utf8")), JSON.parse(JSON.stringify(book)), "build output is the complete deterministic projection");
const sheet = (name: string, b: ConsolidatedBook = book) => b.tabs.find(t => t.name === name)!;
const idx = (name: string, key: string, b = book) => { const i = sheet(name, b).columns.findIndex(c => c.key === key); assert.ok(i >= 0, `${name} has a ${key} column`); return i; };
const value = (name: string, row: number, key: string, b = book) => sheet(name, b).rows[row].values[idx(name, key, b)];
const column = (name: string, key: string, b = book) => sheet(name, b).rows.map(r => r.values[idx(name, key, b)]);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);

// TWO TABS (Stage 10je): one row per holding, and every dated record.
assert.deepEqual(book.tabs.map(t => t.name), [CONSOLIDATED_VIEW, TRANSACTIONS]);
assert.equal(book.client, "Glow Ventures");
assert.equal(book.documents, manifest.length);
assert.equal(sheet(CONSOLIDATED_VIEW).columns[0].label, "Security", "the security is the first column");
assert.ok(sheet(CONSOLIDATED_VIEW).columns.length >= 50, "every mapping the dashboard carries is a column");
for (const key of ["ent", "acct", "provider", "ac", "cat", "basket", "sector", "side", "qty", "cost", "mv", "ugain", "rgain", "income", "tgain", "absret", "xirr", "comm", "src"])
  idx(CONSOLIDATED_VIEW, key);
assert.ok(book.tabs.every(t => t.rows.every(r => r.values.length === t.columns.length)));

// The view ties to the canonical book: the counted rows' value is the family total.
near(book.totalValue, BOOK_SUMMARY.totalValue);
const counted = sheet(CONSOLIDATED_VIEW).rows.filter((_, i) => value(CONSOLIDATED_VIEW, i, "counted") === "Y");
near(counted.reduce((s, r) => s + (r.values[idx(CONSOLIDATED_VIEW, "mv")] as number), 0), BOOK_SUMMARY.totalValue);
near(counted.reduce((s, r) => s + ((r.values[idx(CONSOLIDATED_VIEW, "alloc")] as number) ?? 0), 0), 1);
assert.equal(column(CONSOLIDATED_VIEW, "sec").filter((k, i) => k && String(value(CONSOLIDATED_VIEW, i, "hid")).startsWith("H")).length, BOOK_POSITIONS.length, "every book position has its row");
const viewAccounts = new Set(column(CONSOLIDATED_VIEW, "acct"));
for (const a of BOOK_ACCOUNTS) assert.ok(viewAccounts.has(a.accountId), `account ${a.accountId} is in the view, a holding row or a named no-holding row`);
assert.ok(sheet(CONSOLIDATED_VIEW).rows.some((_, i) => String(value(CONSOLIDATED_VIEW, i, "hid")).startsWith("U") && value(CONSOLIDATED_VIEW, i, "mv") === null),
  "unvalued custody units stay absent, never ₹0");
assert.ok(sheet(CONSOLIDATED_VIEW).rows.some((_, i) => value(CONSOLIDATED_VIEW, i, "basis") === "At cost" && value(CONSOLIDATED_VIEW, i, "ugain") === null));
// A holding's total gain is its FIFO terms, and its return is that gain over capital deployed.
for (let i = 0; i < sheet(CONSOLIDATED_VIEW).rows.length; i++) {
  const g = value(CONSOLIDATED_VIEW, i, "tgain"), d = value(CONSOLIDATED_VIEW, i, "deployed"), r = value(CONSOLIDATED_VIEW, i, "absret");
  if (typeof g === "number" && typeof d === "number" && d > 0 && typeof r === "number") assert.ok(Math.abs(g / d - r) < 0.0005, `row ${i}: ${g} / ${d} ≠ ${r}`);
}
// A commitment rides the one holding row of its account, never repeated.
assert.equal(column(CONSOLIDATED_VIEW, "comm").filter(v => v != null).length, BOOK_COMMITMENTS.length);
// STAGE 10fz — TVPI counts only the distributions paid by the valuation date.
for (const c of BOOK_COMMITMENTS.filter(c => (c.distributed ?? 0) > 0 && c.payouts)) {
  const i = sheet(CONSOLIDATED_VIEW).rows.findIndex((_, i) => value(CONSOLIDATED_VIEW, i, "acct") === c.accountId && value(CONSOLIDATED_VIEW, i, "comm") != null);
  const tvpi = value(CONSOLIDATED_VIEW, i, "tvpi"), mv = value(CONSOLIDATED_VIEW, i, "mv");
  if (typeof tvpi !== "number" || typeof mv !== "number") continue;
  const after = c.payouts!.filter(x => x.inPrintedTotal && x.kind !== "equalisation" && c.asOf != null && x.date > c.asOf);
  near(tvpi, (mv + c.distributed! - after.reduce((s, x) => s + x.gross, 0)) / c.paid!);
  if (after.length) assert.match(String(value(CONSOLIDATED_VIEW, i, "notes")), /not the \d+ paid after it/);
}
// The ring-fence holds: Polycab is named on no row of either tab.
for (const p of BOOK_POLYCAB) assert.ok(!JSON.stringify(book).includes(p.securityKey), `${p.securityKey} stays on /polycab only`);
assert.ok(!/polycab/i.test(JSON.stringify(book)));
assert.ok(!JSON.stringify(book).includes("Malhotra"), "fictional client data never enters the projection");
assert.ok(!JSON.stringify(book).match(/#REF!|#DIV\/0!|NaN|Infinity/));

// A custody statement need not price its units for the exact account's
// reconciled purchase cost and dates to appear in the view.
for (const [suffix, first, last] of [["12539150", "2025-03-06", "2026-03-23"], ["12838316", "2025-11-06", "2025-11-06"], ["12838320", "2025-07-11", "2025-07-11"]]) {
  const record = BOOK_RECOVERED_COSTS.find(r => r.accountId.endsWith(suffix) && r.isin === "INF109KC1RH9")!;
  const i = sheet(CONSOLIDATED_VIEW).rows.findIndex((_, i) => value(CONSOLIDATED_VIEW, i, "acct") === record.accountId && value(CONSOLIDATED_VIEW, i, "sec") === "icici-ioppf-d-grw");
  assert.ok(i >= 0, "Every verified custody balance has its own row");
  assert.equal(value(CONSOLIDATED_VIEW, i, "qty"), record.quantity);
  assert.equal(value(CONSOLIDATED_VIEW, i, "cost"), record.costBasis);
  assert.equal(value(CONSOLIDATED_VIEW, i, "rgain"), record.realizedPnL);
  assert.equal(value(CONSOLIDATED_VIEW, i, "income"), record.dividendReceived);
  assert.equal(value(CONSOLIDATED_VIEW, i, "first"), first); assert.equal(value(CONSOLIDATED_VIEW, i, "last"), last);
  for (const field of ["price", "mv", "ugain", "absret", "xirr"]) assert.equal(value(CONSOLIDATED_VIEW, i, field), null);
  assert.ok(sheet(CONSOLIDATED_VIEW).rows[i].links?.src?.file, "The row opens its actual custody source");
}

// TRANSACTIONS: every record, newest first, nothing counted twice.
const dates = column(TRANSACTIONS, "date").map(d => String(d ?? ""));
assert.ok(dates.every((d, i) => i === 0 || d <= dates[i - 1]), "newest first");
const record = column(TRANSACTIONS, "record");
assert.equal(record.filter(r => r === "Trade").length, deriveTransactions(docs).txns.length, "every trade; own fund allotments are not repeated as trades");
assert.equal(record.filter(r => r === "Tax lot — sold").length, deriveRealisedLots(docs).lots.length, "every realised lot");
sheet(TRANSACTIONS).rows.forEach((r, i) => {
  const lot = String(record[i]).startsWith("Tax lot");
  if (lot) for (const k of ["net", "gross"]) assert.equal(r.values[idx(TRANSACTIONS, k)], null, `a tax lot carries no ${k}: its cash is on the trade row`);
  if (record[i] === "Trade") assert.equal(r.values[idx(TRANSACTIONS, "rgain")], null, "a trade's realised gain is on its tax-lot rows, counted once");
});
assert.ok(column(TRANSACTIONS, "gf").some(v => typeof v === "number") && column(TRANSACTIONS, "taxlt").some(v => typeof v === "number"),
  "source-stated FMV and taxable long-term gain are kept, not discarded");
// Each holding's count of records ties to the Transactions tab.
for (let i = 0; i < sheet(CONSOLIDATED_VIEW).rows.length; i++) {
  const acct = value(CONSOLIDATED_VIEW, i, "acct"), sec = value(CONSOLIDATED_VIEW, i, "sec"), n = value(CONSOLIDATED_VIEW, i, "txns");
  if (!acct || !sec || typeof n !== "number") continue;
  assert.equal(n, sheet(TRANSACTIONS).rows.filter((_, j) => value(TRANSACTIONS, j, "acct") === acct && value(TRANSACTIONS, j, "sec") === sec).length);
}

for (const t of book.tabs) for (const r of t.rows) for (const link of Object.values(r.links ?? {})) {
  if (link.sheet) assert.ok(sheet(link.sheet), `missing linked tab ${link.sheet}`);
  if (link.sheet) assert.ok(consolidatedExcelTarget(book, link), `the ${link.sheet} link lands on a row: ${JSON.stringify(link.where)}`);
  if (link.file) assert.ok(manifest.some((m: { docKey: string }) => m.docKey === link.file), `missing source ${link.file}`);
}
const withTxns = sheet(CONSOLIDATED_VIEW).rows.findIndex(r => r.links?.txns);
const txnTarget = consolidatedExcelTarget(book, sheet(CONSOLIDATED_VIEW).rows[withTxns].links!.txns)!;
const txnRow = Number(/A(\d+)$/.exec(txnTarget)![1]) - 6;
assert.equal(value(TRANSACTIONS, txnRow, "acct"), value(CONSOLIDATED_VIEW, withTxns, "acct"));
assert.equal(value(TRANSACTIONS, txnRow, "sec"), value(CONSOLIDATED_VIEW, withTxns, "sec"));

// Future ingestion: a new valued holding changes the same view and total,
// and duplicate reporting does not increase the family total a second time.
const fresh = { ...BOOK_POSITIONS[0], accountId: BOOK_ACCOUNTS[0].accountId, securityKey: "newly-wired-regression", security: "Newly wired regression",
  quantity: 2, costBasis: 100, marketValue: 120, unrealizedPnL: 20, avgCost: 50, currentPrice: 60, realizedPnL: null, valuedAtCost: false, dedupeGroup: "new-regression" };
const updated = buildConsolidatedSheet(docs, { accounts: BOOK_ACCOUNTS, positions: [...BOOK_POSITIONS, fresh, { ...fresh }], asOf: BOOK_AS_OF });
near(updated.totalValue - book.totalValue, 120);
const freshRows = sheet(CONSOLIDATED_VIEW, updated).rows.filter(r => r.values[idx(CONSOLIDATED_VIEW, "sec", updated)] === fresh.securityKey);
assert.equal(freshRows.length, 2);
assert.deepEqual(freshRows.map(r => r.values[idx(CONSOLIDATED_VIEW, "counted", updated)]), ["Y", "N"]);
assert.equal(freshRows[1].values[idx(CONSOLIDATED_VIEW, "dup", updated)], BOOK_ACCOUNTS[0].accountId, "the uncounted twin names the row it is counted on");
const doc = { ...docs[0], docKey: "new-source-regression" };
assert.equal(buildConsolidatedSheet([...docs, doc]).documents, book.documents + 1, "new source enters the same build automatically");

// The Excel download is the same two tabs, typed.
const wb = createConsolidatedWorkbook(book, "https://glowventures-1xw.pages.dev");
const reopened = new ExcelJS.Workbook();
await reopened.xlsx.load(await wb.xlsx.writeBuffer());
assert.deepEqual(reopened.worksheets.map(s => s.name), [CONSOLIDATED_VIEW, TRANSACTIONS]);
for (const t of book.tabs) {
  const s = reopened.getWorksheet(t.name)!;
  assert.equal(s.rowCount, t.rows.length + 5);
  assert.equal(s.getCell(5, 1).value, t.columns[0].label);
  assert.equal((s.getCell(4, 1).value as ExcelJS.CellHyperlinkValue).hyperlink, `#'${book.tabs.find(o => o !== t)!.name}'!A1`, "row 4 opens the other tab");
  assert.ok(s.views[0].state === "frozen");
  assert.equal(s.views[0].ySplit, 5, `${t.name}: the header below the title block stays frozen`);
  assert.equal(s.views[0].topLeftCell, "B6");
  for (let c = 1; c <= t.columns.length; c++) assert.ok(s.getColumn(c).width! >= 12, `${t.name}: column ${c} has a fitted width`);
}
const cv = reopened.getWorksheet(CONSOLIDATED_VIEW)!;
const mvCol = idx(CONSOLIDATED_VIEW, "mv") + 1, stmtCol = idx(CONSOLIDATED_VIEW, "stmt") + 1, txnCol = idx(CONSOLIDATED_VIEW, "txns") + 1;
assert.equal(typeof cv.getCell(6, mvCol).value, "number", "market values remain typed INR numbers");
assert.match(cv.getCell(6, mvCol).numFmt, /^#,##0\.00/);
assert.ok(cv.getCell(6, stmtCol).value instanceof Date, "Excel dates remain typed dates");
assert.match((cv.getCell(withTxns + 6, txnCol).value as ExcelJS.CellHyperlinkValue).hyperlink, /^#'Transactions'!A\d+$/);
const tx = reopened.getWorksheet(TRANSACTIONS)!;
assert.ok(tx.getCell(6, 1).value instanceof Date);
assert.equal(consolidatedExcelTarget(book, { sheet: CONSOLIDATED_VIEW, where: { acct: "unreported-account" } }), null, "a missing target is not redirected to an unrelated row");
console.log(`PASS consolidated sheet: ${book.tabs.map(t => `${t.name} ${t.rows.length} rows × ${t.columns.length} columns`).join(", ")}; ${book.documents} sources, ₹${book.totalValue}; ties to the book, newest-first ledger, nothing counted twice, typed Excel roundtrip and hyperlinks`);
