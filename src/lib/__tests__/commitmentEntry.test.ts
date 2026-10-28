import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { BOOK_POSITIONS, BOOK_COMMITMENTS, BOOK_ACCOUNTS } from "../../data/glowData";
import { buildInputCatalog, applySavedInputs, type SavedInput } from "../tableInputs";
import { applyTableInputs } from "../applyTableInputs";
import { privateBookFolios, figuresOf } from "../privateBook";
import { readInputWorkbook } from "../tableInputExcel";
import { createCommitmentWorkbook } from "../commitmentExcel";
import { commitmentChanges, commitmentRecordId, commitmentRows, draftKey, parseRupees, rupeeText, type CommitmentDraft } from "../commitmentEntry";
import type { Portfolio } from "../types";

// Stage 10io — "Capital commitment and yet-to-be-drawn capital per fund — Gaurav to enter".
const book = { positions: BOOK_POSITIONS, commitments: BOOK_COMMITMENTS, accounts: BOOK_ACCOUNTS } as Portfolio;
const catalog = buildInputCatalog(BOOK_POSITIONS, BOOK_COMMITMENTS, BOOK_ACCOUNTS);
const ids = new Set(catalog.map((r) => r.id));
const folios = privateBookFolios(book, []).folios;
const rows = commitmentRows(folios, catalog);

// Every folio the table shows, except an income-only view, has a row — and it
// is the record that folio's own Committed cell edits.
for (const f of folios) {
  const id = commitmentRecordId(f, (x) => ids.has(x));
  if (f.viewOf) assert.equal(id, null, `${f.fundName}: an income-only view carries no commitment of its own`);
  else assert.ok(id && rows.some((r) => r.record.id === id), `${f.fundName} (${f.accountId}) has a commitment row`);
}
assert.equal(new Set(rows.map((r) => r.record.id)).size, rows.length, "one row per capital record");
const funds = rows.filter((r) => r.isFund);
assert.ok(funds.length > 0 && funds.length < rows.length, "funds and directly held companies are told apart");
assert.ok(rows.findIndex((r) => !r.isFund) > funds.length - 1, "funds are listed first");
assert.ok(funds.some((r) => r.record.kind === "capital") && funds.some((r) => r.record.kind === "private-capital"),
  "a fund's capital-account statement and a fund with none are both on the sheet");

// Amounts as they are typed.
assert.equal(parseRupees("12,50,000"), 1250000);
assert.equal(parseRupees("₹2.5 Cr"), 25000000);
assert.equal(parseRupees("40 lakh"), 4000000);
assert.equal(parseRupees("0"), 0, "a typed zero is a zero");
assert.equal(parseRupees("  "), null, "blank is not known, never zero");
assert.ok(Number.isNaN(parseRupees("five crore")!), "words are not an amount");
assert.ok(Number.isNaN(parseRupees("2 bn")!), "an unknown unit is refused, not ignored");
assert.equal(rupeeText(25000000), "2,50,00,000");

// Drafts become store changes against the version they were typed over.
const open = funds.find((r) => r.record.kind === "private-capital")!;
const stated = funds.find((r) => r.record.kind === "capital" && r.record.values.committed != null)!;
const draft = (r: typeof open, text: string): [string, CommitmentDraft] => [draftKey(r.record.id, "committed"), { text, version: r.record.versions.committed ?? "", source: r.record.source }];
const made = commitmentChanges(new Map([draft(open, "5 Cr"), [draftKey(open.record.id, "undrawn"), { text: "2 Cr", version: "", source: open.record.source }]]), catalog);
assert.equal(made.error, null);
assert.deepEqual(made.changes.map((c) => [c.field, c.value]), [["committed", 5e7], ["undrawn", 2e7]]);
assert.deepEqual(commitmentChanges(new Map([draft(stated, rupeeText(stated.record.values.committed))]), catalog).changes, [], "retyping the same figure changes nothing");
assert.match(commitmentChanges(new Map([draft(open, "lots")]), catalog).error ?? "", /Enter an amount/);

// Saved, they reach the private book's own rollup — on the folio, never the fund.
const stamp = "2026-10-28T00:00:00.000Z";
const saved: SavedInput[] = made.changes.map((c) => ({ ...c, updatedAt: stamp }));
const applied = applyTableInputs(book, saved)!;
const entered = privateBookFolios(applied, []).folios.filter((f) => commitmentRecordId(f, (x) => ids.has(x)) === open.record.id);
assert.equal(entered.length, 1);
assert.equal(figuresOf(entered, false).committed, 5e7, "the entered commitment is the folio's");
assert.equal(figuresOf(entered, false).uncalled, 2e7, "the entered still-to-call is the folio's");
assert.equal(figuresOf(entered, false).called, null, "nothing entered for called stays absent");
const reentered = applySavedInputs(catalog, saved).find((r) => r.id === open.record.id)!;
const cleared = commitmentChanges(new Map([[draftKey(open.record.id, "committed"), { text: "", version: reentered.versions.committed, source: reentered.source }]]), [reentered]);
assert.equal(cleared.changes[0]?.reset, true, "clearing an entered figure restores the original rather than writing a blank over it");

// The Excel sheet: Committed and Still to call only, read back by the same upload checks.
const bytes = async (b: ExcelJS.Workbook) => await b.xlsx.writeBuffer() as unknown as ArrayBuffer;
const sheetBook = createCommitmentWorkbook(funds);
const sheet = sheetBook.getWorksheet("Capital inputs")!;
assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), ["Investment", "Account", "As of", "Committed (INR)", "Still to call (INR)"]);
assert.equal(sheet.rowCount, funds.length + 1, "one line per fund folio");
assert.deepEqual(await readInputWorkbook(await bytes(sheetBook), catalog), [], "an untouched sheet changes nothing");
const line = funds.indexOf(open) + 2;
sheet.getCell(`D${line}`).value = 30000000;
sheet.getCell(`E${line}`).value = 10000000;
const read = await readInputWorkbook(await bytes(sheetBook), catalog);
assert.deepEqual(read.map((c) => [c.id, c.field, c.value]), [[open.record.id, "committed", 3e7], [open.record.id, "undrawn", 1e7]]);
const renamed = createCommitmentWorkbook(funds);
renamed.getWorksheet("Capital inputs")!.getCell("A2").value = "Another fund";
await assert.rejects(async () => readInputWorkbook(await bytes(renamed), catalog), /identifies a row/, "a row's fund cannot be swapped");
console.log(`commitment entry: ${rows.length} folios (${funds.length} funds), Excel round trip ok`);
