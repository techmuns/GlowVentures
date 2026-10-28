// Local/staging only. The real API handler runs against an isolated in-memory
// store; this suite never writes to the production dashboard or GitHub store.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { installReadModelRoutes } from './read-model-api.mjs';
import { chromium } from 'playwright-core';
import ExcelJS from 'exceljs';
import { validateProperty } from '../../shared/realEstate.mjs';
import { onRequest as propertyRequest } from '../../functions/api/real-estate.js';
import { onRequest as callRequest } from '../../functions/api/capital-calls.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, '.cache/table-inputs/browser'); await fs.mkdir(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.match(new URL(base).hostname, /^(127\.0\.0\.1|localhost)$/, 'this write suite only runs locally');
await build({ stdin: { contents: 'export {onRequest} from "./functions/api/table-inputs"; export {BOOK_ACCOUNTS,BOOK_POSITIONS} from "./src/data/glowData";', resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', alias: { '@': path.join(root, 'src') }, outfile: path.join(out, 'api.mjs') });
const { onRequest, BOOK_ACCOUNTS, BOOK_POSITIONS } = await import(path.join(out, 'api.mjs'));
const data = new Map(); let commits = 0;
const property = { ...validateProperty({ id: 'test-table-excel', name: 'Excel round-trip property', value: 100000, owners: [{ name: 'Test owner', share: 50 }] }).property, updatedAt: '2026-10-22T00:00:00Z' };
data.set(`real-estate:${property.id}`, property);
const store = {
  list: async ({ prefix }) => ({ keys: [...data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
  get: async key => data.get(key) ?? null,
  put: async (key, value) => { data.set(key, JSON.parse(value)); }, delete: async key => { data.delete(key); },
  flush: async () => { commits++; },
};
const env = { DASHBOARD_STORE: store };
const snapshot = async () => (await onRequest({ request: new Request(`${base}/api/table-inputs`), env })).json();
const catalog = (await snapshot()).catalog;
const capital = catalog.find(r => r.kind === 'private-capital');
let holding;
data.set('capital-call:test-table-call', { id: 'test-table-call', fund: 'test-round-trip-fund', fundName: 'Test capital call', date: '2026-12-01', amount: 10000, note: 'Isolated test fixture', updatedAt: '2026-10-22T00:00:00Z' });
const results = [];
const check = (name, condition) => { assert.ok(condition, name); results.push(name); console.log(`PASS: ${name}`); };
const context = await chromium.launchPersistentContext(path.join(out, `browser-profile-${process.pid}`), { executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, viewport: { width: 1500, height: 1050 }, acceptDownloads: true });
const browser = context;
await context.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'External feeds unavailable in isolated test' }) }));
for (const [endpoint, handler] of [['table-inputs', onRequest], ['real-estate', propertyRequest], ['capital-calls', callRequest]]) await context.route(`**/api/${endpoint}`, async route => {
  const request = route.request();
  const response = await handler({ request: new Request(request.url(), { method: request.method(), headers: request.headers(), ...(request.method() === 'POST' ? { body: request.postData() } : {}) }), env });
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
});
await context.route('**/api/investment-profiles', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, profiles: [] }) }));
context.setDefaultTimeout(30000);
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
async function visit(route) { await page.goto(base + route); await page.locator('[data-edit-numbers]').first().waitFor(); await page.waitForFunction(() => !document.querySelector('[data-edit-numbers]')?.disabled); }
async function download(name, selector) {
  const id = selector ? await page.locator(selector).first().getAttribute('data-table-export-id') : null;
  const button = id ? page.locator(`[data-export-for="${id}"]`) : page.locator('[data-export-excel]').first();
  const downloading = page.waitForEvent('download', { timeout: 180000 }); await button.click();
  const file = path.join(out, name); await (await downloading).saveAs(file);
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(file); return { file, book };
}
function manifest(book) { let text = ''; book.getWorksheet('_Glow').eachRow(row => { text += row.getCell(1).text; }); return JSON.parse(text); }
function inputCell(book, id, field, sheetName) {
  for (const sheet of manifest(book).sheets) if (!sheetName || sheet.name === sheetName) for (const cell of sheet.cells) if (cell.input?.id === id && cell.input.field === field) return book.getWorksheet(sheet.name).getCell(cell.address);
  throw new Error(`Missing workbook input ${id} ${field}`);
}
async function upload(file) { await page.locator('input[aria-label="Upload corrected Excel"]').first().setInputFiles(file); }
async function savePreview() { await page.getByRole('dialog', { name: 'Review Excel changes' }).waitFor(); await page.getByRole('button', { name: /^Save \d+ changes$/ }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); }
try {
  await visit('/private-market');
  const beforeRows = await page.locator('table[data-pm-table] > tbody > tr').count();
  const original = await download('private-original.xlsx');
  check('Private Market exports collapsed detail rows in expanded form', original.book.getWorksheet('Table').rowCount > beforeRows);
  check('Workbook includes holding and missing capital inputs', !!original.book.getWorksheet('Holding inputs') && !!original.book.getWorksheet('Capital inputs'));
  check('Missing editable numbers are highlighted yellow', inputCell(original.book, capital.id, 'paid', 'Capital inputs').fill.fgColor.argb === 'FFFFE6A3');
  check('Export restores collapsed rows on screen', await page.locator('table[data-pm-table] > tbody > tr').count() === beforeRows);
  await upload(original.file); await page.getByText('No number changes found.').waitFor();
  check('Untouched Excel upload writes nothing', commits === 0);
  inputCell(original.book, capital.id, 'paid', 'Capital inputs').value = 123456;
  const edited = path.join(out, 'capital-edited.xlsx'); await original.book.xlsx.writeFile(edited);
  await upload(edited); await savePreview();
  check('Excel upload persists a missing private capital number', (await snapshot()).catalog.find(r => r.id === capital.id).values.paid === 123456 && commits === 1);
  await page.locator('select[data-pm-show]').selectOption('both');
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  const savedPaid = page.locator(`[data-pm-folio-row] [data-input-record="${capital.id}"][data-input-field="paid"]`).first();
  check('Saved capital is visible in the expanded detail row', await savedPaid.evaluate(cell => cell.closest('tr').dataset.pmPaid === '123456' && cell.textContent.includes('₹')));
  await visit('/private-market');
  await page.locator('[data-edit-numbers]').first().click();
  const costId = await page.locator('[data-input-record^="holding:"][data-input-field="costBasis"]').first().getAttribute('data-input-record');
  holding = catalog.find(r => r.id === costId);
  assert.ok(holding, 'a displayed company has a source cost input');
  await page.getByPlaceholder('Search companies, funds or brands…').fill(holding.label);
  const cost = page.locator(`[data-input-record="${holding.id}"][data-input-field="costBasis"]`).first();
  await cost.locator('input').fill('200000');
  const draftExport = await download('unsaved-draft.xlsx');
  check('Export preserves an unsaved inline draft', await cost.locator('input').inputValue() === '200000');
  check('Export includes saved inputs rather than unsaved drafts', inputCell(draftExport.book, holding.id, 'costBasis', 'Holding inputs').value === holding.values.costBasis);
  const latestHolding = (await snapshot()).catalog.find(r => r.id === holding.id);
  const other = await onRequest({ request: new Request(`${base}/api/table-inputs`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ changes: [{ id: holding.id, field: 'costBasis', value: (holding.values.costBasis ?? 0) + 1, source: latestHolding.source, version: latestHolding.versions.costBasis ?? '' }] }) }), env });
  assert.equal(other.status, 200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await cost.getByText(/Saved data changed/).waitFor();
  check('An external save preserves the local draft and warns about the conflict', await cost.locator('input').inputValue() === '200000');
  await cost.getByRole('button', { name: 'Use latest' }).click();
  await cost.locator('input').fill('200000');
  const saving = page.waitForResponse(response => response.url().endsWith('/api/table-inputs') && response.request().method() === 'POST');
  await cost.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await saving).status(), 200);
  await cost.getByRole('button', { name: 'Save', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-entered-numbers]')?.textContent?.includes('2 user-entered'));
  check('Inline edits and workbook imports share the same store', (await snapshot()).catalog.find(r => r.id === holding.id).values.costBasis === 200000);
  await page.screenshot({ path: path.join(out, 'inline-private.png'), fullPage: false });
  await cost.getByRole('button', { name: 'Restore original' }).click();
  await page.waitForFunction(() => document.querySelector('[data-entered-numbers]')?.textContent?.includes('1 user-entered'));
  check('Restore original removes a number correction', (await snapshot()).catalog.find(r => r.id === holding.id).values.costBasis === holding.values.costBasis);
  const ownerOf = id => BOOK_ACCOUNTS.find(a => a.accountId === id)?.ownerId;
  const crossMember = [...BOOK_POSITIONS].reverse().find(p => p.assetClass === 'AIF' && p.costBasis > 0 && ownerOf(p.accountId)
    && BOOK_POSITIONS.filter(q => q.securityKey === p.securityKey && ownerOf(q.accountId) === ownerOf(p.accountId)).length === 1
    && BOOK_POSITIONS.some(q => q.securityKey === p.securityKey && ownerOf(q.accountId) && ownerOf(q.accountId) !== ownerOf(p.accountId)));
  assert.ok(crossMember, 'cross-member source fixture exists');
  const memberQuery = new URLSearchParams({ members: ownerOf(crossMember.accountId), group: 'category' });
  await visit(`/monitor?${memberQuery}`);
  await page.locator('[data-multiselect-toggle="All holdings"]').click();
  await page.getByPlaceholder('Search holdings…').fill(crossMember.security);
  await page.locator('[data-option]').filter({ hasText: crossMember.security }).first().click();
  await page.keyboard.press('Escape');
  await page.locator('[data-edit-numbers]').first().click();
  const scopedId = `holding:${crossMember.accountId}|${crossMember.securityKey}|${crossMember.memberId ?? ''}`;
  const scopedCost = page.locator(`[data-input-record="${scopedId}"][data-input-field="costBasis"]`).first();
  await scopedCost.locator('input').fill('456789');
  await download('member-scoped-draft.xlsx', '[data-monitor-table="holdings"]');
  check('A member-scoped draft survives export to the whole expanded book', await scopedCost.locator('input').inputValue() === '456789');
  await visit('/monitor?group=category');
  const monitorRows = await page.locator('[data-monitor-table] > tbody > tr').count();
  const monitor = await download('monitor.xlsx', '[data-monitor-table="holdings"]');
  check('The same correction appears in a different table export', inputCell(monitor.book, capital.id, 'paid', 'Capital inputs').value === 123456);
  check('The monitor exports its custom hierarchy in full', monitor.book.getWorksheet('Table').rowCount > monitorRows);
  await upload(monitor.file); await page.getByText('No number changes found.').waitFor();
  check('A complete nested export uploads unchanged without false edits', commits === 4);
  await installReadModelRoutes(page);
  await visit('/monitor');
  const allSecurities = await download('all-securities.xlsx', '[data-monitor-table="holdings"]');
  await upload(allSecurities.file); await page.getByText('No number changes found.').waitFor();
  check('The full All Securities workbook uploads unchanged', commits === 4);
  console.log(`All Securities Excel: ${(await fs.stat(allSecurities.file)).size} bytes, ${allSecurities.book.getWorksheet('Table').rowCount} rows`);
  await visit('/sectors');
  const sectors = await download('sectors.xlsx', '[data-sector-table]');
  check('Nested tables travel in their own detail worksheets', sectors.book.worksheets.some(s => /^Detail /.test(s.name)));
  inputCell(original.book, capital.id, 'paid', 'Capital inputs').value = 500;
  const stale = path.join(out, 'stale.xlsx'); await original.book.xlsx.writeFile(stale); await upload(stale);
  await page.getByRole('alert').filter({ hasText: 'changed since' }).waitFor();
  check('Stale uploads are refused without a write', commits === 4);
  await visit('/real-estate');
  const realEstate = await download('property.xlsx');
  check('Property input sheet uses the whole property amount', inputCell(realEstate.book, `property:${property.id}`, 'value', 'Property inputs').value === 100000);
  inputCell(realEstate.book, `property:${property.id}`, 'value', 'Property inputs').value = 150000;
  inputCell(realEstate.book, `property-owner:${property.id}|0`, 'share', 'Ownership inputs').value = .75;
  const propertyFile = path.join(out, 'property-edited.xlsx'); await realEstate.book.xlsx.writeFile(propertyFile);
  await upload(propertyFile); await savePreview();
  check('Property Excel upload updates the existing property record', data.get(`real-estate:${property.id}`).value === 150000);
  check('Ownership is imported as a percentage, with names preserved', data.get(`real-estate:${property.id}`).owners[0].share === 75 && data.get(`real-estate:${property.id}`).owners[0].name === 'Test owner');
  await page.locator('[data-real-estate-table]').getByText('₹1,12,500', { exact: true }).first().waitFor();
  check('Property shares and totals recalculate from whole-property inputs', true);
  // Stage 10io — Enter commitments: a folio's Committed and Still to call, typed together and from its own Excel sheet.
  await visit('/private-market');
  await page.locator('[data-commitment-entry-open]').first().click();
  const entry = page.locator('dialog[data-commitment-entry]');
  await entry.locator('[data-commitment-row]').first().waitFor();
  const fundRow = entry.locator('[data-commitment-fund][data-commitment-row^="private-capital:"]').first();
  const fundId = await fundRow.getAttribute('data-commitment-row');
  await fundRow.locator('[data-commitment-input="committed"]').fill('2.5 Cr');
  await fundRow.locator('[data-commitment-input="undrawn"]').fill('75 lakh');
  const commitsBefore = commits;
  await entry.locator('[data-commitment-save]').click();
  await entry.getByText('Saved 2 numbers for everyone.').waitFor();
  const enteredFund = (await snapshot()).catalog.find(r => r.id === fundId);
  check('Enter commitments saves a fund folio\'s Committed and Still to call in one write', enteredFund.values.committed === 25000000 && enteredFund.values.undrawn === 7500000 && commits === commitsBefore + 1);
  const sheetDownload = page.waitForEvent('download', { timeout: 60000 }); await entry.locator('[data-commitment-download]').click();
  const sheetFile = path.join(out, 'commitments.xlsx'); await (await sheetDownload).saveAs(sheetFile);
  const sheetBook = new ExcelJS.Workbook(); await sheetBook.xlsx.readFile(sheetFile);
  check('The commitments sheet lists the funds with their saved figures', inputCell(sheetBook, fundId, 'committed', 'Capital inputs').value === 25000000 && !sheetBook.getWorksheet('Holding inputs'));
  inputCell(sheetBook, fundId, 'undrawn', 'Capital inputs').value = 5000000;
  const sheetEdited = path.join(out, 'commitments-edited.xlsx'); await sheetBook.xlsx.writeFile(sheetEdited);
  await entry.locator('input[aria-label="Upload commitments Excel"]').setInputFiles(sheetEdited);
  await entry.getByText(/^1 number read from/).waitFor();
  await entry.locator('[data-commitment-save]').click();
  await entry.getByText('Saved 1 number for everyone.').waitFor();
  check('A filled commitments sheet uploads through the same checks', (await snapshot()).catalog.find(r => r.id === fundId).values.undrawn === 5000000);
  await page.keyboard.press('Escape');
  await page.locator('select[data-pm-show]').selectOption('both');
  const expandAll = page.getByRole('button', { name: 'Expand all', exact: true });
  if (await expandAll.count()) await expandAll.click();
  const folioUncalled = page.locator(`[data-pm-folio-row] [data-input-record="${fundId}"][data-input-field="undrawn"]`).first();
  check('The table\'s folio row shows the entered Still to call', await folioUncalled.evaluate(cell => cell.closest('tr').dataset.pmUncalled === '5000000' && cell.closest('tr').dataset.pmCommitted === '25000000'));
  await page.setViewportSize({ width: 420, height: 900 });
  await page.locator('[data-all-inputs]').first().click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: path.join(out, 'mobile-inputs.png') });
  check('Mobile editor stays within the viewport', await page.getByRole('dialog').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
  check('No uncaught browser errors', errors.length === 0);
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ checks: results, commits }, null, 2));
  console.log(`PASS: ${results.length} browser checks; all ${commits} writes used an isolated local store`);
} catch (error) { await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 10000 }).catch(() => {}); await fs.writeFile(path.join(out, 'failure.json'), JSON.stringify({ results, errors, error: String(error) }, null, 2)); throw error; }
finally { await browser.close(); }
