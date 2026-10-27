import assert from 'node:assert/strict';
import { pdfSourceMatch, type PdfSourceText } from '../pdfSourceHighlight';

const item = (str: string, x: number, y: number, width = str.length * 3): PdfSourceText => ({ str, transform: [6, 0, 0, 6, x, y], width, height: 6 });
// Coordinates read from H43383's published 31 July holding statement. Its
// exact ICICI units occur twice on one row, under two distinct headings.
const headers = [item('ISIN', 49, 638.6, 14), item('ISIN NAME', 110, 638.6),
  item('FREE BAL.', 190.54, 638.6, 31.668), item('PENDING', 378, 638.6),
  item('TOTAL', 429.56, 638.6, 19.998), item('HOLDING', 426.558, 632.6, 27.666),
  item('Rs', 479, 638.6, 8), item('RATE', 475.108, 632.6, 16.332), item('VALUE', 524.038, 632.6, 20.334)];
const isin = item('INF109K01Q49', 31.47, 616.6, 41.688);
const free = item('46654.378', 197.46, 616.6, 28.356);
const total = item('46654.378', 433.32, 616.6, 28.356);
const target = { value: '46654.378', isin: isin.str, field: 'quantity' };
assert.equal(pdfSourceMatch([...headers, isin, free, total], target)?.item, total, 'highlight Total Holding rather than the identical Free Balance');
for (const [id, value] of [['INF205K01KR8', '1092470.994'], ['INF174K01LC6', '613293.929']]) {
  const held = item(value, 423, 594.6, 39);
  assert.equal(pdfSourceMatch([...headers, item(id, 31, 594.6, 42), item(value, 187, 594.6, 39), held], { ...target, isin: id, value })?.item, held);
}
assert.equal(pdfSourceMatch([isin, free, total], target), undefined, 'duplicate values without column evidence still abstain');
assert.equal(pdfSourceMatch([...headers.filter(i => i.str !== 'HOLDING'), isin, free, total], target), undefined, 'a bare Total label does not establish Total Holding');
assert.equal(pdfSourceMatch([...headers, isin, free, total, item(total.str, 433.32, 594.6, 28.356)], target), undefined, 'equal values on another row are not resolved by column alone');
assert.equal(pdfSourceMatch([...headers, isin, free, total], { ...target, field: 'marketValue' }), undefined, 'the quantity rule cannot choose a different metric');
assert.equal(pdfSourceMatch([...headers, isin, free, total], { ...target, isin: 'INF174K01LC6' }), undefined, 'another security cannot borrow this row');
assert.equal(pdfSourceMatch([item('Total Holding Valuation', 420, 650), isin, free, total], target), undefined, 'a valuation footer is not a column heading');
assert.equal(pdfSourceMatch([...headers, isin, item('46654.378 46654.378', 197, 616.6, 265)], target), undefined, 'combined text runs do not guess numeric column coordinates');
assert.equal(pdfSourceMatch([...headers, item('ISIN', 49, 628, 14), isin, free, total], target), undefined, 'an earlier table cannot supply a missing Total Holding header to the nearest table');
assert.equal(pdfSourceMatch([...headers, item('TOTAL HOLDING', 190, 638.6, 33), isin, free, total], target), undefined, 'two Total Holding headers are ambiguous');
assert.equal(pdfSourceMatch([...headers, isin, free, total, item(total.str, 434, 616.6, 28.356)], target), undefined, 'multiple values in the Total Holding column remain ambiguous');
const sameLineHeaders = headers.filter(i => i.str !== 'TOTAL' && i.str !== 'HOLDING');
assert.equal(pdfSourceMatch([...sameLineHeaders, item('TOTAL HOLDING', 419, 638.6, 41), isin, free, total], target)?.item, total);
console.log('PASS PDF quantity highlights: explicit Total Holding column, exact ISIN row and strict ambiguity guards');
