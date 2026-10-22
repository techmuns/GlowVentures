import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { BOOK_POSITIONS, BOOK_COMMITMENTS, BOOK_ACCOUNTS } from "../../data/glowData";
import { buildInputCatalog, applySavedInputs, privateCapitalId, type InputChange, type InputRecord, type SavedInput } from "../tableInputs";
import { applyTableInputs } from "../applyTableInputs";
import { createTableWorkbook } from "../exportTableExcel";
import { readInputWorkbook } from "../tableInputExcel";
import { privateBookFolios, figuresOf } from "../privateBook";
import { onRequest } from "../../../functions/api/table-inputs";
import type { Portfolio } from "../types";
import { validateProperty } from "../../../shared/realEstate.mjs";

const source = buildInputCatalog(BOOK_POSITIONS, BOOK_COMMITMENTS, BOOK_ACCOUNTS);
const target = source.find(r => r.kind === "holding" && r.values.quantity === null)!;
assert.ok(target, "a genuinely missing input is available");
const atCost = BOOK_POSITIONS.find(p => p.valuedAtCost)!;
assert.equal(source.find(r => r.id === `holding:${atCost.accountId}|${atCost.securityKey}|${atCost.memberId ?? ""}`)!.values.marketValue, null, "a cost proxy is highlighted as a missing valuation input");
const change = (r: InputRecord, field: string, value: number | null): InputChange => ({ id: r.id, field, value, version: r.versions[field] ?? "", source: r.source });
const record = new Map<string, unknown>(); let flushes = 0;
const store = {
  list: async ({ prefix }: { prefix: string }) => ({ keys: [...record.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
  get: async (key: string) => record.get(key) ?? null,
  put: async (key: string, value: string) => { record.set(key, JSON.parse(value)); },
  delete: async (key: string) => { record.delete(key); }, flush: async () => { flushes++; },
};
async function request(changes?: unknown, origin = "https://test.example", raw?: string) {
  const response = await onRequest({ request: new Request("https://test.example/api/table-inputs", changes !== undefined || raw !== undefined ? {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: raw ?? JSON.stringify({ changes }),
  } : undefined), env: { DASHBOARD_STORE: store } });
  return { status: response.status, body: await response.json() };
}
assert.equal((await request()).status, 200);
assert.equal((await request([change(target, "quantity", 0)])).status, 200, "a real zero saves");
const saved = (await request()).body.saved as SavedInput[];
let current = applySavedInputs(source, saved);
assert.equal(current.find(r => r.id === target.id)!.values.quantity, 0);
assert.equal(flushes, 1);
assert.equal((await request([change(target, "quantity", 2)])).status, 409, "stale edits cannot overwrite a newer save");
assert.equal((await request([change(target, "quantity", -1)])).status, 409);
assert.equal((await request([change(target, "quantity", 1)], "https://other.example")).status, 403);
assert.equal((await request([change(target, "quantity", 1)], "")).status, 403);
assert.equal((await request(undefined, undefined, "{" )).status, 400);
assert.equal((await request([{ ...change(target, "quantity", 1), field: "__proto__" }])).status, 409);
const fresh = current.find(r => r.id === target.id)!;
assert.equal((await request([change(fresh, "quantity", 12), { ...change(fresh, "costBasis", 50), id: "unknown" }])).status, 409);
assert.equal(flushes, 1, "an invalid batch writes nothing");
assert.equal((await request([{ ...change(fresh, "quantity", null), reset: true }])).status, 200);
assert.equal((await request()).body.saved.length, 0, "restore removes the correction");
const property = validateProperty({ id: "test-excel-property", name: "Excel property", value: 1000, owners: [{ name: "Test owner", share: 50 }] }).property!;
record.set(`real-estate:${property.id}`, property);
const propertyRecord = (await request()).body.catalog.find((r: InputRecord) => r.kind === "property");
assert.equal((await request([change(propertyRecord, "value", 2000)])).status, 200);
assert.equal((record.get(`real-estate:${property.id}`) as typeof property).value, 2000, "Excel edits update the same property store as its existing editor");
assert.deepEqual((record.get(`real-estate:${property.id}`) as typeof property).owners, property.owners, "property format and ownership survive");
const ownerRecord = (await request()).body.catalog.find((r: InputRecord) => r.kind === "owner");
assert.equal(ownerRecord.values.share, .5, "Excel ownership uses a typed percentage fraction");
assert.equal((await request([change(ownerRecord, "share", .75)])).status, 200);
assert.equal((record.get(`real-estate:${property.id}`) as typeof property).owners[0].share, 75, "ownership percentages update the existing property owner");
const call = { id: "test-call-001", fund: "test-fund", fundName: "Test call", date: "2026-12-01", amount: 100, note: "Retain call details", updatedAt: "2026-10-22T00:00:00Z" };
record.set(`capital-call:${call.id}`, call);
const callRecord = (await request()).body.catalog.find((r: InputRecord) => r.kind === "call");
assert.equal((await request([change(callRecord, "amount", 200)])).status, 200);
assert.equal((record.get(`capital-call:${call.id}`) as typeof call).amount, 200, "Excel updates the existing upcoming capital call");
assert.equal((record.get(`capital-call:${call.id}`) as typeof call).date, call.date, "the call's date and format stay intact");

const cap = source.find(r => r.kind === "private-capital" && r.id === target.id.replace(/^holding:/, "private-capital:"))!;
assert.ok(cap);
const edits: SavedInput[] = [
  { ...change(target, "quantity", 0), updatedAt: "2026-10-22T00:00:00.000Z" },
  { ...change(cap, "paid", 100), updatedAt: "2026-10-22T00:00:00.000Z" },
];
const book = { positions: BOOK_POSITIONS, commitments: BOOK_COMMITMENTS, accounts: BOOK_ACCOUNTS } as Portfolio;
const original = JSON.stringify(book);
const applied = applyTableInputs(book, edits)!;
assert.equal(JSON.stringify(book), original, "the canonical source book stays untouched");
const position = applied.positions.find(p => privateCapitalId(p) === cap.id)!;
assert.equal(position.quantity, 0);
assert.equal(position.enteredCapital?.paid, 100);
const folios = privateBookFolios(applied, []).folios.filter(f => f.position === position);
assert.equal(figuresOf(folios, true).paid, 100, "new capital numbers reach the shared private-book rollup");
assert.equal(figuresOf(folios, true).committed, null, "a partial manual record never invents a commitment");
assert.equal(applyTableInputs(book, [])!.positions, BOOK_POSITIONS, "removing edits restores source references");
assert.equal(applySavedInputs(source, [{ ...edits[0], source: "old source" }]).find(r => r.id === target.id)!.values.quantity, null, "a changed source retires an older correction");

const snapshot = { title: "Round trip", url: "https://test.example/private-market", inputs: [target, cap], rows: [
  { kind: "header" as const, cells: [{ text: "Investment" }, { text: "Units" }, { text: "Total" }] },
  { kind: "body" as const, cells: [{ text: target.label }, { text: "", value: "", input: change(target, "quantity", null) }, { text: "150", value: 150 }] },
] };
const exported = createTableWorkbook(snapshot);
assert.equal(exported.getWorksheet("Holding inputs")!.getCell("D2").fill.type, "pattern");
assert.equal((exported.getWorksheet("Holding inputs")!.getCell("D2").fill as ExcelJS.FillPattern).fgColor?.argb, "FFFFE6A3");
assert.equal(exported.getWorksheet("_Glow")!.state, "veryHidden");
assert.equal((exported.getWorksheet("Holding inputs")!.views[0] as ExcelJS.WorksheetViewFrozen).xSplit, 2, "both investment and account stay visible while editing");
assert.ok(exported.getWorksheet("Holding inputs")!.getColumn(1).width! <= 48 && exported.getWorksheet("Holding inputs")!.getColumn(2).width! <= 48, "the frozen identity columns leave room for numbers");
const bytes = async (b: ExcelJS.Workbook) => await b.xlsx.writeBuffer() as unknown as ArrayBuffer;
assert.deepEqual(await readInputWorkbook(await bytes(exported), source), [], "an untouched workbook makes no changes");
exported.getWorksheet("Holding inputs")!.getCell("D2").value = 0;
assert.deepEqual((await readInputWorkbook(await bytes(exported), source)).map(c => [c.id, c.field, c.value]), [[target.id, "quantity", 0]]);
exported.getWorksheet("Table")!.getCell("B2").value = 5;
await assert.rejects(async () => readInputWorkbook(await bytes(exported), source), /Two copies/);
for (const [modify, message] of [
  [(b: ExcelJS.Workbook) => { b.getWorksheet("Table")!.getCell("A1").value = "Changed heading"; }, /Only change/],
  [(b: ExcelJS.Workbook) => { b.getWorksheet("Holding inputs")!.getCell("D2").value = { formula: "1+1", result: 2 }; }, /Formulas/],
  [(b: ExcelJS.Workbook) => { b.getWorksheet("Holding inputs")!.spliceRows(2, 1); }, /rows and columns/],
  [(b: ExcelJS.Workbook) => { b.getWorksheet("Holding inputs")!.getCell("D2").value = "100 rupees"; }, /Enter a number/],
] as const) {
  const b = createTableWorkbook(snapshot); modify(b);
  await assert.rejects(async () => readInputWorkbook(await bytes(b), source), message);
}
const staleBook = createTableWorkbook(snapshot);
staleBook.getWorksheet("Holding inputs")!.getCell("D2").value = 2;
await assert.rejects(async () => readInputWorkbook(await bytes(staleBook), applySavedInputs(source, edits)), /changed since/);
const optionalBook = createTableWorkbook(snapshot);
optionalBook.getWorksheet("Holding inputs")!.getCell("E2").value = null;
const optional = await readInputWorkbook(await bytes(optionalBook), source);
assert.equal(optional[0]?.value, null, "clearing a known optional cost records absence, never zero");
const liveCatalog = (await request()).body.catalog;
const callBook = createTableWorkbook({ ...snapshot, inputs: [liveCatalog.find((r: InputRecord) => r.kind === "call")] });
callBook.getWorksheet("Call inputs")!.getCell("D2").value = 300;
const callChanges = await readInputWorkbook(await bytes(callBook), liveCatalog);
assert.equal((await request(callChanges)).status, 200);
assert.equal((record.get(`capital-call:${call.id}`) as typeof call).amount, 300, "capital call amounts complete the same Excel round trip");
const ownerCatalog = (await request()).body.catalog;
const ownerBook = createTableWorkbook({ ...snapshot, inputs: [ownerCatalog.find((r: InputRecord) => r.kind === "owner")] });
assert.equal(ownerBook.getWorksheet("Ownership inputs")!.getCell("D2").numFmt, "0.0%");
ownerBook.getWorksheet("Ownership inputs")!.getCell("D2").value = .6;
assert.equal((await request(await readInputWorkbook(await bytes(ownerBook), ownerCatalog))).status, 200);
assert.equal((record.get(`real-estate:${property.id}`) as typeof property).owners[0].share, 60, "ownership completes the Excel round trip without a factor-of-100 error");
console.log("Table input persistence, source rollups and Excel round-trip contracts passed");
