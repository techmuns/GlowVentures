import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOOK_POSITIONS, BOOK_ACCOUNTS } from '../../data/glowData';
import { depositoryFundHoldings } from '../fundNavs';
import { holdingSourceTrace, statementSourceHref, sourceRecordAt, sourcePage } from '../sourceTrace';
import { pdfSourceMatch, isinBeforePage } from '../pdfSourceHighlight';
import { sourceBackground } from '../../components/SourceLink';
import { sourceSheetIndex } from '../statementPreview';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SourceCell, SourceDetails } from '../../components/SourceTrace';

const bandhan = BOOK_POSITIONS.find(p => p.accountId === 'bandhan-mutual-fund-8652064' && p.isin === 'INF194K01Y60')!;
const trace = holdingSourceTrace([bandhan], 'quantity');
assert.equal(trace.derived, false); assert.equal(trace.sources.length, 1); assert.equal(trace.missing, 0);
const url = new URL(statementSourceHref(trace.sources[0])!, 'https://local.test');
assert.equal(url.pathname, '/statements');
assert.equal(url.searchParams.get('file'), bandhan.statementRecord!.document);
assert.equal(url.searchParams.get('record'), '/holdings/1');
assert.equal(url.searchParams.get('sourceValue'), '202573.963', 'the full value survives rounded display');
const doc = JSON.parse(fs.readFileSync(`public/audit/${bandhan.statementRecord!.document}/document.json`, 'utf8'));
assert.equal((sourceRecordAt(doc, '/holdings/1') as typeof bandhan).quantity, bandhan.quantity);
assert.equal(sourceRecordAt(doc, '/holdings/999999'), undefined);
assert.equal(sourceRecordAt(doc, '/__proto__/constructor'), undefined);
assert.equal(sourceRecordAt(doc, '/holdings/1x'), undefined);

const demat = depositoryFundHoldings().find(p => p.accountId === 'motilal-oswal-financial-services-demat-1201090012539150' && p.isin === 'INF247L01ED1')!;
assert.ok(demat); assert.equal(demat.quantity, 28067435.434);
const closing = holdingSourceTrace([demat], 'quantity');
assert.equal(closing.sources.length, 1); assert.equal(closing.sources[0].field, 'closing');
assert.equal(closing.sources[0].document, demat.depositoryUnits!.source);
assert.ok(!closing.sources[0].document!.includes('90414963315'), 'the separate redeemed AMC folio never supplies these demat units');
const dematPages = JSON.parse(fs.readFileSync(`public/audit/${closing.sources[0].document}/pages.json`, 'utf8')).pages;
assert.equal(sourcePage(dematPages, demat.isin!, String(demat.quantity)), 5, 'the exact closing balance follows its ISIN header across the page break');
const valuation = holdingSourceTrace([demat], 'marketValue');
assert.equal(valuation.derived, true); assert.ok(valuation.sources.some(s => s.label === 'AMFI'));
assert.ok(valuation.sources.some(s => s.document === demat.depositoryUnits!.source));
assert.ok(valuation.notes.some(n => n.includes('published price')));

const zero = BOOK_POSITIONS.find(p => p.accountId === 'motilal-oswal-mutual-fund-90414963315')!;
assert.equal(holdingSourceTrace([zero], 'quantity').sources[0].value, 0, 'a measured zero remains traceable');
const aggregate = holdingSourceTrace([demat, zero], 'quantity');
assert.equal(aggregate.derived, true); assert.equal(aggregate.sources.length, 2);
const sameFile = holdingSourceTrace([bandhan, BOOK_POSITIONS.find(p => p.accountId === bandhan.accountId && p.isin === 'INF194K01V89')!], 'statement');
assert.equal(sameFile.sources.length, 1); assert.equal(sameFile.derived, false);
assert.equal(sameFile.sources[0].pointer, undefined, 'a common account PDF never selects an arbitrary constituent');
const edited = holdingSourceTrace([{ ...bandhan, quantity: 12, enteredNumbers: ['quantity'] }], 'quantity');
assert.equal(edited.derived, true); assert.ok(edited.notes.some(n => n.includes('saved family correction')));
assert.equal(edited.sources[0].value, undefined, 'an edited quantity cannot be presented as a printed PDF value');
const absent = holdingSourceTrace([{ ...bandhan, quantity: null }], 'quantity');
assert.equal(absent.sources.length, 0, 'an absence is never linked as a measured quantity');
const missing = holdingSourceTrace([{ ...bandhan, statementRecord: undefined }], 'quantity');
assert.equal(missing.sources.length, 0); assert.equal(missing.missing, 1, 'equal values never invent a source');

for (const p of BOOK_POSITIONS.filter(p => p.quantity != null && p.statementRecord)) {
  const source = holdingSourceTrace([p], 'quantity').sources[0];
  assert.equal(source.document, p.statementRecord!.document);
  assert.equal(source.pointer, p.statementRecord!.pointer);
  const original = JSON.parse(fs.readFileSync(`public/audit/${source.document}/document.json`, 'utf8'));
  assert.equal((sourceRecordAt(original, source.pointer!) as { quantity: number }).quantity, p.quantity);
  const a = BOOK_ACCOUNTS.find(a => a.accountId === p.accountId)!;
  assert.equal(original.accountNo, a.accountNo, 'source belongs to the exact account');
}
assert.equal(sourcePage([{ page: 2, text: 'INF194K01Y60 2,02,573.963' }], 'INF194K01Y60', '202573.963'), 2);
assert.equal(sourcePage([{ page: 1, text: 'INF194K01Y60 100000.000' }], 'INF194K01Y60', '100000'), 1, 'printed trailing zeroes retain the same exact quantity');
assert.equal(sourcePage([{ page: 2, text: 'INF000WRONG 2,02,573.963' }], 'INF194K01Y60', '202573.963'), undefined);
assert.equal(sourcePage([{ page: 2, text: 'INF194K01Y60 1202573.963' }], 'INF194K01Y60', '202573.963'), undefined);
assert.equal(sourcePage([{ page: 1, text: 'INF194K01Y60 202573.963' }, { page: 2, text: 'INF194K01Y60 202573.963' }], 'INF194K01Y60', '202573.963'), undefined, 'ambiguous page matches abstain');
assert.equal(sourceSheetIndex(['Portfolio Allocation', 'Private Investments '], 'Private Investments'), 1, 'the ingest-trimmed name selects the original worksheet');
assert.equal(sourceSheetIndex(['Private Investments', 'Private Investments '], 'Private Investments'), 0, 'exact identity wins');
assert.equal(sourceSheetIndex([' Private Investments', 'Private Investments '], 'Private Investments'), null, 'ambiguous trimmed names abstain');
assert.equal(sourceSheetIndex(['Portfolio Allocation'], 'Unknown sheet'), null);
const quoteCell = renderToStaticMarkup(createElement(SourceCell, { positions: [bandhan], metric: 'currentPrice',
  children: createElement('span', { 'data-cmp-source': 'upstox' }, '₹99') }));
assert.ok(quoteCell.includes('₹99')); assert.ok(!quoteCell.includes('href='), 'a separately displayed market quote cannot inherit the older statement price source');
const allocated = holdingSourceTrace([{ ...bandhan, statementRecord: undefined, reviewSource: { sheet: 'Private Investments', block: 'Private Investments', row: 4 }, reviewNote: 'Allocated to this owner by the review record.' }], 'marketValue');
assert.equal(allocated.derived, true); assert.ok(allocated.sources.some(s => s.note === 'Allocated to this owner by the review record.'));
// A review record in plain words (Stage 10jn): its value, date, cost and
// shares off the holding and the review's own note; the full note is kept.
const nse = BOOK_POSITIONS.find(p => p.reviewNote?.includes('Now a listed company') && /split by shares/.test(p.reviewNote) && p.quantity === 125000)!;
const nseReview = holdingSourceTrace([nse], 'quantity').sources.find(s => s.review)!;
assert.equal(nseReview.note, nse.reviewNote, 'the full audit note stays under Full detail');
assert.deepEqual(nseReview.review, { value: 259375000, cost: nse.costBasis, units: 125000, unitWord: 'shares', asOf: '30 Jun 2026',
  atCost: false, splitByShares: true, shared: false, noHolder: false, listed: true, differs: false });
const plain = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(SourceDetails, { trace: holdingSourceTrace([nse], 'quantity') })));
assert.ok(plain.includes('Worth ₹25.94 Cr for 1,25,000 shares on 30 Jun 2026'), plain);
assert.ok(plain.includes('family review (MOPWM)') && !plain.includes('a/c …'), 'a review record names the review, not an account number');
const atCostLine = BOOK_POSITIONS.find(p => p.valuedAtCost && p.reviewNote?.startsWith('Held at cost') && /of the line\./.test(p.reviewNote))!;
const atCostFacts = holdingSourceTrace([atCostLine], 'costBasis').sources.find(s => s.review)!.review!;
assert.ok(atCostFacts.atCost && atCostFacts.value === null && atCostFacts.shared && atCostFacts.asOf === '30 Jun 2026', 'a line held at cost carries no value');
console.log('PASS exact holding sources, demat/folio isolation, aggregate/price lineage, saved corrections and strict record/page locators');

// Printed balances, not arbitrary equal numbers: duplicate running balances
// resolve only through the explicit closing-row label within this exact ISIN.
const item = (str: string, y: number, x = 0) => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10 });
const target = { value: '28067435.434', isin: 'INF247L01ED1', field: 'closing', initialIsin: 'INF247L01ED1' };
const text = [item('28,067,435.434', 500, 300), item('Closing Balance', 480), item('28067435.434000', 480, 300), item('INF247L01BK2', 460), item('Closing Balance 28067435.434', 440)];
assert.equal(pdfSourceMatch(text, target)?.item, text[2]);
assert.equal(pdfSourceMatch(text, { ...target, field: 'quantity' }), undefined, 'ambiguous duplicate amounts abstain');
assert.equal(pdfSourceMatch([item('28067435.434', 500)], target), undefined, 'running balance alone is not a closing-row citation');
assert.equal(pdfSourceMatch([item('Closing Balance 28067435.434', 500)], { ...target, initialIsin: null }), undefined);
assert.equal(pdfSourceMatch([item('INF247L01BK2', 600), ...text], target), undefined, 'another ISIN cannot inherit this balance');
assert.equal(pdfSourceMatch([item('INF247L01ED1', 600), item('1234.000', 500)], { ...target, field: 'quantity', value: '123' }), undefined);
assert.equal(pdfSourceMatch([item('INF247L01ED1', 600), item('123.4500', 500)], { ...target, field: 'quantity', value: '123.45' })?.start, 0);
assert.equal(pdfSourceMatch([item('INF247L01ED1', 600), item('0.000', 500)], { ...target, field: 'quantity', value: '0' })?.start, 0);
assert.equal(isinBeforePage(dematPages, 5), 'INF247L01ED1');
assert.equal(isinBeforePage([{ page: 1, text: 'INF247L01ED1' }, { page: 3, text: '' }], 3), null);
const previous = { pathname: '/monitor', search: '?tab=holdings', hash: '', key: 'previous', state: null };
const sourceLocation = { pathname: '/statements', search: '?file=x', hash: '', key: 'source', state: { sourceBackground: previous } };
assert.equal(sourceBackground(sourceLocation), previous);
assert.equal(sourceBackground({ ...sourceLocation, state: null }), undefined);
assert.equal(sourceBackground({ ...sourceLocation, state: { sourceBackground: { ...previous, pathname: '//evil.test' } } }), undefined);
assert.equal(sourceBackground({ ...sourceLocation, state: { sourceBackground: { ...previous, pathname: '/statements' } } }), undefined);
