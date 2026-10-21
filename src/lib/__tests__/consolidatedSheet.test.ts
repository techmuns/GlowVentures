import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { buildConsolidatedSheet, type ConsolidatedBook } from "../consolidatedSheet";
import { createConsolidatedWorkbook, consolidatedExcelTarget } from "../exportConsolidatedExcel";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_AS_OF, BOOK_SUMMARY, BOOK_COMMITMENTS, BOOK_RECOVERED_COSTS } from "../../data/glowData";
import { deriveTransactions, deriveRealisedLots, type ArchiveDoc } from "../ledgerModel";
import revision from "../../data/readModels.json";

const manifest = JSON.parse(readFileSync("public/audit/manifest.json", "utf8"));
const docs: ArchiveDoc[] = manifest.map((d: { docKey: string }) => JSON.parse(readFileSync(`public/audit/${d.docKey}/document.json`, "utf8")));
const book = buildConsolidatedSheet(docs);
assert.deepEqual(JSON.parse(readFileSync(`public/views/${revision.revision}/consolidated/book.json`, "utf8")), JSON.parse(JSON.stringify(book)), "build output is the complete deterministic projection");
const sheet = (name: string, b = book) => b.tabs.find(t => t.name === name)!;
const value = (name: string, row: number, key: string, b = book) => { const t = sheet(name, b); return t.rows[row].values[t.columns.findIndex(c => c.key === key)]; };
const sumColumn = (name: string, key: string, b = book) => sheet(name, b).rows.reduce((s, r) => {
  const v = r.values[sheet(name, b).columns.findIndex(c => c.key === key)]; return s + (typeof v === "number" ? v : 0);
}, 0);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);
assert.equal(book.tabs.length, 17);
assert.equal(book.client, "Glow Ventures");
assert.equal(book.documents, manifest.length);
assert.equal(sheet("Accounts").rows.length, BOOK_ACCOUNTS.length);
near(book.totalValue, BOOK_SUMMARY.totalValue);
near(value("Portfolio Allocation", sheet("Portfolio Allocation").rows.length - 1, "value") as number * 1e7, BOOK_SUMMARY.totalValue);
near(sumColumn("Basket Detail", "mv") * 1e7, BOOK_SUMMARY.totalValue);
near(value("Basket Allocation", sheet("Basket Allocation").rows.length - 1, "value") as number * 1e7, BOOK_SUMMARY.totalValue);
assert.equal(sheet("Tax Lots").rows.filter(r => String(r.values[0]).startsWith("R")).length, deriveRealisedLots(docs).lots.length);
assert.ok(sheet("Tax Lots").rows.some((_, i) => typeof value("Tax Lots", i, "gf") === "number" && typeof value("Tax Lots", i, "rtcost") === "number"), "source-stated FMV and effective tax cost are filled, not discarded");
assert.ok(sheet("Tax Summary").rows.some((_, i) => typeof value("Tax Summary", i, "tlt") === "number"), "reported effective long-term gains reach the tax summary");
assert.equal(sheet("Transactions").rows.filter(r => r.values[sheet("Transactions").columns.findIndex(c => c.key === "counts")] === "Internal trade").length, deriveTransactions(docs).txns.length, "own fund allotments are not repeated as internal trades");
assert.ok(sheet("Holdings").rows.some(r => String(r.values[0]).startsWith("U") && r.values[sheet("Holdings").columns.findIndex(c => c.key === "mv")] === null));
assert.ok(sheet("Holdings").rows.some(r => r.values[sheet("Holdings").columns.findIndex(c => c.key === "basis")] === "At cost" && r.values[sheet("Holdings").columns.findIndex(c => c.key === "ugain")] === null));
for (const key of ["opening", "marketGain", "return"]) assert.ok(sheet("Period Change").rows.every((_, i) => value("Period Change", i, key) === null));
for (const key of ["target", "gap"]) assert.ok(sheet("Basket Allocation").rows.every((_, i) => value("Basket Allocation", i, key) === null));
assert.ok(!JSON.stringify(book).includes("Malhotra"), "fictional client data never enters the projection");
assert.ok(book.tabs.every(t => t.rows.every(r => r.values.length === t.columns.length)));
const scopedAif = sheet("Portfolio Allocation").rows.find(r => r.values[0] === "AIF" && r.links?.category?.where?.ac === "Debt");
assert.ok(scopedAif, "a category link retains its parent asset class");
const debtAifTarget = consolidatedExcelTarget(book, scopedAif.links!.category)!;
const targetRow = Number(/A(\d+)$/.exec(debtAifTarget)![1]) - 6;
assert.equal(value("Holdings", targetRow, "ac"), "Debt");
assert.equal(value("Holdings", targetRow, "cat"), "AIF");
const firstHolding = sheet("Holdings").rows[0];
assert.deepEqual(firstHolding.links!.acct.where, { id: value("Holdings", 0, "acct") });
assert.deepEqual(firstHolding.links!.ent.where, { name: value("Holdings", 0, "ent") });
const entityTarget = consolidatedExcelTarget(book, firstHolding.links!.ent)!;
assert.equal(value("Entities", Number(/A(\d+)$/.exec(entityTarget)![1]) - 6, "name"), value("Holdings", 0, "ent"));
assert.ok(!JSON.stringify(book).match(/#REF!|#DIV\/0!|NaN|Infinity/));

// A custody statement need not price its units for the exact account's
// reconciled purchase cost and dates to appear in the audit register.
for (const [suffix, first, last] of [["12539150", "2025-03-06", "2026-03-23"], ["12838316", "2025-11-06", "2025-11-06"], ["12838320", "2025-07-11", "2025-07-11"]]) {
  const record = BOOK_RECOVERED_COSTS.find(r => r.accountId.endsWith(suffix) && r.isin === "INF109KC1RH9")!;
  const i = sheet("Holdings").rows.findIndex((_, i) => value("Holdings", i, "acct") === record.accountId && value("Holdings", i, "sec") === "icici-ioppf-d-grw");
  assert.ok(i >= 0, "Every verified custody balance has its own audit row");
  assert.equal(value("Holdings", i, "qty"), record.quantity);
  assert.equal(value("Holdings", i, "cost"), record.costBasis);
  assert.equal(value("Holdings", i, "rgain"), record.realizedPnL);
  assert.equal(value("Holdings", i, "income"), record.dividendReceived);
  assert.equal(value("Holdings", i, "first"), first); assert.equal(value("Holdings", i, "last"), last);
  for (const field of ["price", "mv", "ugain", "absret", "xirr"]) assert.equal(value("Holdings", i, field), null);
  assert.ok(sheet("Holdings").rows[i].links?.src?.file, "The row opens its actual custody source");
}

for (const t of book.tabs) for (const r of t.rows) for (const link of Object.values(r.links ?? {})) {
  if (link.sheet) assert.ok(sheet(link.sheet), `missing linked subtab ${link.sheet}`);
  if (link.sheet === "Securities" && link.where?.id) assert.ok(sheet("Securities").rows.some(r => r.values[0] === link.where!.id), `missing security master ${link.where.id}`);
  if (link.file) assert.ok(manifest.some((m: { docKey: string }) => m.docKey === link.file), `missing source ${link.file}`);
}
assert.ok(!sheet("Securities").rows.some(r => r.values[0] === "equity-dividend-income"), "a printed account income bucket is not a financial security");

// Future ingestion: a new valued holding changes the same summaries and masters,
// and duplicate reporting does not increase the family total a second time.
const fresh = { ...BOOK_POSITIONS[0], accountId: BOOK_ACCOUNTS[0].accountId, securityKey: "newly-wired-regression", security: "Newly wired regression",
  quantity: 2, costBasis: 100, marketValue: 120, unrealizedPnL: 20, avgCost: 50, currentPrice: 60, realizedPnL: null, valuedAtCost: false, dedupeGroup: "new-regression" };
const updated = buildConsolidatedSheet(docs, { accounts: BOOK_ACCOUNTS, positions: [...BOOK_POSITIONS, fresh, { ...fresh }], asOf: BOOK_AS_OF });
near(updated.totalValue - book.totalValue, 120);
assert.ok(sheet("Securities", updated).rows.some(r => r.values[0] === fresh.securityKey));
assert.equal(sheet("Holdings", updated).rows.filter(r => r.values[2] === fresh.securityKey).length, 2);
near(value("Portfolio Allocation", sheet("Portfolio Allocation", updated).rows.length - 1, "value", updated) as number * 1e7, updated.totalValue);
const doc = { ...docs[0], docKey: "new-source-regression" };
assert.equal(buildConsolidatedSheet([...docs, doc]).documents, book.documents + 1, "new source enters the same build automatically");

const wb = createConsolidatedWorkbook(book, "https://glowventures-1xw.pages.dev");
const reopened = new ExcelJS.Workbook();
await reopened.xlsx.load(await wb.xlsx.writeBuffer());
assert.deepEqual(reopened.worksheets.map(s => s.name), book.tabs.map(t => t.name));
for (const t of book.tabs) {
  const s = reopened.getWorksheet(t.name)!;
  assert.equal(s.rowCount, t.rows.length + 5);
  assert.equal(s.getCell(5, 1).value, t.columns[0].label);
  assert.equal((s.getCell(4, 1).value as ExcelJS.CellHyperlinkValue).hyperlink, "#'Start Here'!A1");
  assert.equal(s.views[0].state, "frozen");
}
const pa = reopened.getWorksheet("Portfolio Allocation")!;
near(pa.getCell(sheet("Portfolio Allocation").rows.length + 5, 4).value as number * 1e7, BOOK_SUMMARY.totalValue);
assert.equal(pa.getCell(6, 4).numFmt, "#,##0.00");
assert.match((pa.getCell(6, 1).value as ExcelJS.CellHyperlinkValue).hyperlink, /^#'Holdings'!A\d+$/);
assert.equal(consolidatedExcelTarget(book, { sheet: "Accounts", find: BOOK_ACCOUNTS[0].accountId }), "#'Accounts'!A6");
assert.equal(consolidatedExcelTarget(book, { sheet: "Accounts", where: { id: "unreported-account" } }), null, "a missing target is not redirected to an unrelated row");
const hs = reopened.getWorksheet("Holdings")!;
const dateCol = sheet("Holdings").columns.findIndex(c => c.key === "stmt") + 1;
assert.ok(hs.getCell(6, dateCol).value instanceof Date, "Excel dates remain typed dates");
assert.equal(typeof hs.getCell(6, 18).value, "number", "holding market values remain typed INR numbers");
assert.match((hs.getCell(6, 2).value as ExcelJS.CellHyperlinkValue).hyperlink, /^#'Accounts'!A\d+$/);
// STAGE 10fz — TVPI counts only the distributions paid by the valuation date.
// Neo's printed distributed includes a payout dated after the 30 Jun NAV it is
// added to; re-derived off the commitment's own dated payouts.
for (const c of BOOK_COMMITMENTS.filter(c => (c.distributed ?? 0) > 0 && c.payouts)) {
  const row = sheet("Commitments").rows.find(r => r.values[sheet("Commitments").columns.findIndex(k => k.key === "acct")] === c.accountId)!;
  const get = (k: string) => row.values[sheet("Commitments").columns.findIndex(x => x.key === k)];
  const after = c.payouts!.filter(x => x.inPrintedTotal && x.kind !== "equalisation" && c.asOf != null && x.date > c.asOf);
  const value = get("value");
  if (typeof get("tvpi") !== "number" || typeof value !== "number") continue;
  near(get("tvpi") as number, (value + c.distributed! - after.reduce((s, x) => s + x.gross, 0)) / c.paid!);
  if (after.length) assert.ok(Math.abs((get("tvpi") as number) - (value + c.distributed!) / c.paid!) > 0.005, `${c.name}: TVPI leaves out the payouts dated after ${c.asOf}`);
  if (after.length) assert.match(String(get("notes")), /not the \d+ paid after it/);
}
// STAGE 10fz — the XIRR column is ONE pooled money-weighted rate, never an
// average of the rows' rates: it lies between the rates it pools, and on a row
// that pools rates which differ it is not their value-weighted mean.
{
  const hsh = sheet("Holdings"), hx = hsh.columns.findIndex(c => c.key === "xirr"), hmv = hsh.columns.findIndex(c => c.key === "mv"), hck = hsh.columns.findIndex(c => c.key === "check");
  const rates = hsh.rows.filter(r => !/^Duplicate/.test(String(r.values[hck] ?? ""))).map(r => ({ x: r.values[hx], mv: r.values[hmv] })).filter((r): r is { x: number; mv: number } => typeof r.x === "number" && typeof r.mv === "number");
  const tot = value("Portfolio Allocation", sheet("Portfolio Allocation").rows.length - 1, "xirr");
  if (rates.length > 1 && typeof tot === "number") {
    const lo = Math.min(...rates.map(r => r.x)), hi = Math.max(...rates.map(r => r.x));
    assert.ok(tot >= lo - 1e-9 && tot <= hi + 1e-9, `the pooled XIRR ${tot} lies between the rates it pools [${lo}, ${hi}]`);
    const avg = rates.reduce((s, r) => s + r.x * r.mv, 0) / rates.reduce((s, r) => s + r.mv, 0);
    assert.ok(Math.abs(tot - avg) > 1e-6, "the Total XIRR is pooled, not the value-weighted average of holding XIRRs");
  }
  assert.match(sheet("Portfolio Allocation").note, /XIRR is pooled/);
}
console.log(`PASS consolidated sheet: ${book.tabs.length} subtabs, ${book.documents} sources, ₹${book.totalValue}; future wiring, missing values, dedupe, typed Excel roundtrip and hyperlinks`);
