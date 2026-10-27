import assert from 'node:assert/strict';
import { decodeAuditSheet } from '../auditSheet';

const grid = { name: 'Holdings', rows: [['ISIN', 'Units'], ['INF247L01ED1', 28067435.434], [null, 0]] };
assert.deepEqual(decodeAuditSheet(grid), grid, 'workbook coordinates and full numerical precision survive decoding');
assert.deepEqual(decodeAuditSheet({ name: 'flags', rows: [[true, false]] }).rows, [['true', 'false']]);
const text = 'Closing Balance 28067435.434\nISIN: INF247L01ED1';
assert.deepEqual(decodeAuditSheet({ name: 'pages', pages: [{ page: 5, text }] }), {
  name: 'pages', rows: [['Page', 'Text'], [5, text]],
}, 'PDF extraction becomes a searchable grid without changing page numbers or source text');
assert.deepEqual(decodeAuditSheet({ name: 'pages', pages: [] }).rows, [['Page', 'Text']]);
for (const bad of [null, {}, { name: 'bad' }, { name: 'bad', rows: [null] },
  { name: 'bad', rows: [[{}]] }, { name: 'bad', rows: [[Infinity]] },
  { name: 'pages', pages: [{ page: 0, text }] }, { name: 'pages', pages: [{ page: 1 }] }]) {
  assert.throws(() => decodeAuditSheet(bad), /Invalid archive/, 'malformed data is handled by the loader fallback');
}
console.log('PASS archive sheets: workbook precision, searchable PDF pages and malformed-data fallback');
