import assert from "node:assert/strict";
import { BOOK_POSITIONS, BOOK_COMMITMENTS, BOOK_ACCOUNTS } from "../../data/glowData";
import { buildInputCatalog, validateInputChanges, type InputChange, type InputRecord, type SavedInput } from "../tableInputs";
import { applyTableInputs } from "../applyTableInputs";
import { privateBookFolios, figuresOf } from "../privateBook";
import { CAPITAL_CELL_FIELDS, capitalRecordId, parseRupees, rupeeText } from "../capitalEntry";
import type { Portfolio } from "../types";

// Stage 10ir — Committed, Called, Paid in and Still to call type in their own cells.
const book = { positions: BOOK_POSITIONS, commitments: BOOK_COMMITMENTS, accounts: BOOK_ACCOUNTS } as Portfolio;
const catalog = buildInputCatalog(BOOK_POSITIONS, BOOK_COMMITMENTS, BOOK_ACCOUNTS);
const byId = new Map(catalog.map((r) => [r.id, r]));
const folios = privateBookFolios(book, []).folios;

// Every folio the table shows, except an income-only view, has a record its
// four capital cells write — one record per folio, never shared by two.
const ids = folios.map((f) => ({ f, id: capitalRecordId(f, (x) => byId.has(x)) }));
for (const { f, id } of ids) {
  if (f.viewOf) assert.equal(id, null, `${f.fundName}: an income-only view carries no capital of its own`);
  else assert.ok(id, `${f.fundName} (${f.accountId}) has a capital record`);
}
const held = ids.filter((x) => x.id);
assert.equal(new Set(held.map((x) => x.id)).size, held.length, "no two folios type into one record");
for (const field of Object.values(CAPITAL_CELL_FIELDS)) {
  assert.ok(held.every((x) => byId.get(x.id!)!.fields.some((f) => f.key === field)), `every capital record takes ${field}`);
}
const open = held.find((x) => byId.get(x.id!)!.kind === "private-capital" && x.f.category != null)!;
const stated = held.find((x) => byId.get(x.id!)!.kind === "capital" && byId.get(x.id!)!.values.committed != null)!;
assert.ok(open && stated, "a fund with no capital statement and one with a statement are both typed into");
assert.equal(byId.get(stated.id!)!.values.committed, figuresOf([stated.f], false).committed, "a statement's cell opens on the figure the row prints");

// Amounts as they are typed.
assert.equal(parseRupees("12,50,000"), 1250000);
assert.equal(parseRupees("₹2.5 Cr"), 25000000);
assert.equal(parseRupees("40 lakh"), 4000000);
assert.equal(parseRupees("0"), 0, "a typed zero is a zero");
assert.equal(parseRupees("  "), null, "blank is not known, never zero");
assert.ok(Number.isNaN(parseRupees("five crore")!), "words are not an amount");
assert.ok(Number.isNaN(parseRupees("2 bn")!), "an unknown unit is refused, not ignored");
assert.equal(rupeeText(25000000), "2,50,00,000");

// Typed figures reach the private book's rollup on the folio, never the fund.
const rec = byId.get(open.id!)!;
const change = (r: InputRecord, field: string, value: number | null): InputChange => ({ id: r.id, field, value, version: r.versions[field] ?? "", source: r.source });
const changes = [change(rec, "committed", 5e7), change(rec, "called", 3e7), change(rec, "paid", 3e7), change(rec, "undrawn", 2e7)];
assert.equal(validateInputChanges(changes, catalog), null);
const saved: SavedInput[] = changes.map((c) => ({ ...c, updatedAt: "2026-10-28T00:00:00.000Z" }));
const typed = privateBookFolios(applyTableInputs(book, saved)!, []).folios.filter((f) => capitalRecordId(f, (x) => byId.has(x)) === rec.id);
assert.equal(typed.length, 1);
assert.deepEqual([figuresOf(typed, false).committed, figuresOf(typed, false).called, figuresOf(typed, false).paid, figuresOf(typed, false).uncalled], [5e7, 3e7, 3e7, 2e7],
  "each typed cell is the folio's own figure");
const statedRec = byId.get(stated.id!)!;
assert.match(validateInputChanges([change(statedRec, "committed", null)], catalog) ?? "", /cannot be cleared/, "a statement's commitment is corrected, never blanked");
console.log(`capital cells: ${held.length} folios typed into, ${ids.length - held.length} income-only views read-only`);
