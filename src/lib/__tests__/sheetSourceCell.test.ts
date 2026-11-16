// THE CITED CELL IN A SPREADSHEET STATEMENT (Stage 10oo).   npm run test:family
//
// A figure's source link opens a CSV or workbook on the cited record's row and
// marks the figure's own cell, as a PDF marks its number. Ways it could
// quietly mislead:
//
//   • marking LONG TERM QTY when the link cites QTY — the same 1,77,000 is
//     printed twice on HDFC Securities' row;
//   • marking a row by an equal amount on another security's row;
//   • treating "VEDL" as the symbol inside "VEDL-RE", or 123 as 1234.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOOK_POSITIONS } from '../../data/glowData';
import { sourceRecordAt } from '../sourceTrace';
import { cellText, sheetRows } from '../statementPreview';
import { sheetSourceCell, sheetSourceTarget, type SheetCell } from '../sheetSourceCell';

const grid = (text: string): SheetCell[][] => sheetRows(text).rows.map(r => r.map(cellText));
const audit = (docKey: string, file: string) => JSON.parse(fs.readFileSync(`public/audit/${docKey}/${file}`, 'utf8'));

// ── 1. THE CLICK THAT RAISED IT: Ajay's VAML in HDFC Securities 3110320 ─────
const HDFC = 'hdfc-securities-3110320-2026-11-02-holdings';
const doc = audit(HDFC, 'document.json');
const sheet: SheetCell[][][] = audit(HDFC, 'pages.json').pages.map((p: { text: string }) => grid(p.text));
const vaml = sourceRecordAt(doc, '/holdings/4') as { printedSecurity: string; quantity: number };
assert.equal(vaml.printedSecurity, 'VAML');
assert.equal(vaml.quantity, 177000);
const at = (value: string | null, field: string | null) => sheetSourceCell(sheet, sheetSourceTarget(vaml, value, field)!);
const header = sheet[0][2].map(c => c.text);
const column = (name: string) => header.indexOf(name);
assert.equal(sheet[0][7][0].text, 'VAML');
assert.deepEqual(at('177000', 'quantity'), { sheet: 0, row: 7, col: column('QTY') }, 'QTY, not the identical LONG TERM QTY');
assert.deepEqual(at('177000', null), { sheet: 0, row: 7, col: column('QTY') }, 'an account label carries the units, so it marks QTY too');
assert.deepEqual(at(null, 'marketValue'), { sheet: 0, row: 7, col: column('CURRENT VALUE') }, "the record's own market value, as the file printed it");
assert.deepEqual(at(null, 'marketPrice'), { sheet: 0, row: 7, col: column('LTP') });
assert.deepEqual(at(null, 'totalCost'), { sheet: 0, row: 7, col: column('INVESTMENT VALUE') });
assert.deepEqual(at(null, null), { sheet: 0, row: 7, col: null }, 'no figure: the row alone');
assert.deepEqual(at('1770000', 'quantity'), { sheet: 0, row: 7, col: null }, 'a figure the row does not print marks the row, never a near number');

// ── 2. ABSTENTIONS ──────────────────────────────────────────────────────────
const tape = grid('SYMBOL\tQTY\tVALUE\nVEDL\t100\t500\nVEDL\t100\t600\nVEDL-RE\t40\t9\nABC\t123\t1234');
const t = (identities: string[], value: string | null, field: string | null = 'quantity') => sheetSourceCell([tape], { identities, value, field });
assert.equal(t(['VEDL'], '100'), undefined, 'the same identity and figure on two rows abstains');
assert.deepEqual(t(['VEDL'], '600', 'marketValue'), { sheet: 0, row: 2, col: 2 }, 'the figure narrows two rows of one security to one');
assert.deepEqual(t(['VEDL-RE'], '40'), { sheet: 0, row: 3, col: 1 });
assert.deepEqual(t(['VEDL-RE'], '100'), { sheet: 0, row: 3, col: null },
  "VEDL-RE is not VEDL — its own row, never the other security's row that prints 100");
assert.deepEqual(t(['ABC'], '1234', 'marketValue'), { sheet: 0, row: 4, col: 2 }, '1234 is not 123');
assert.equal(t(['XYZ'], '123'), undefined, 'an identity the file does not print abstains');
const twice = grid('NAME\tA\tB\nACME\t50\t50');
assert.deepEqual(sheetSourceCell([twice], { identities: ['ACME'], value: '50', field: 'quantity' }), { sheet: 0, row: 1, col: null },
  'the same figure under two headings neither names stays unmarked');
const isinCell = grid('ISIN / NAME\tUNITS\nINF109K01Q49 - ICICI PRU LIQUID\t46654.378');
assert.deepEqual(sheetSourceCell([isinCell], { identities: ['INF109K01Q49'], value: '46654.378', field: 'quantity' }), { sheet: 0, row: 1, col: 1 },
  'an ISIN is found inside a longer cell');
const stored = [[{ text: 'X', full: 'X' }, { text: '12.09', full: '12.085000000000001' }]];
assert.deepEqual(sheetSourceCell([stored], { identities: ['X'], value: '12.085', field: null }), { sheet: 0, row: 0, col: 1 }, "a workbook's stored double is the number it shows");
assert.equal(sheetSourceTarget(doc.holdings, '177000', 'quantity'), null, 'a pointer at a list, not a record, has nothing to find');
assert.equal(sheetSourceTarget(undefined, '177000', 'quantity'), null, 'a stale pointer has nothing to find');

// ── 3. EVERY SPREADSHEET-SOURCED HOLDING IN THE BOOK ────────────────────────
// Report, not a gate: how many links into a spreadsheet now land on their cell.
const sheetDocs = new Map<string, SheetCell[][][] | null>();
let links = 0, cells = 0, rows = 0;
for (const p of BOOK_POSITIONS) {
  const record = p.statementRecord;
  if (!record?.document) continue;
  if (!sheetDocs.has(record.document)) {
    const source = audit(record.document, 'document.json').sourcePath ?? '';
    sheetDocs.set(record.document, /\.(csv|tsv|xlsx?|xlsm|ods)$/i.test(source)
      ? audit(record.document, 'pages.json').pages.map((pg: { text: string }) => grid(pg.text)) : null);
  }
  const sheets = sheetDocs.get(record.document);
  if (!sheets) continue;
  const target = sheetSourceTarget(sourceRecordAt(audit(record.document, 'document.json'), record.pointer), String(p.quantity), 'quantity');
  links++;
  const found = target && sheetSourceCell(sheets, target);
  if (found?.col != null) cells++; else if (found) rows++;
}
assert.ok(links > 0 && cells > 0);
console.log(`ok   spreadsheet statement links — ${cells} of ${links} mark their units' cell, ${rows} more their row`);
console.log('ok   the cited cell in a spreadsheet statement');
