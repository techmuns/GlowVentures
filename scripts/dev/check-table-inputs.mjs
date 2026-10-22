// Local/staging only. The real API handler runs against an isolated in-memory
// store; this suite never writes to the production dashboard or GitHub store.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import ExcelJS from 'exceljs';
import { validateProperty } from '../../shared/realEstate.mjs';
import { onRequest as propertyRequest } from '../../functions/api/real-estate.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, '.cache/table-inputs/browser'); await fs.mkdir(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.match(new URL(base).hostname, /^(127\.0\.0\.1|localhost)$/, 'this write suite only runs locally');
await build({ entryPoints: [path.join(root, 'functions/api/table-inputs.ts')], bundle: true, platform: 'node', format: 'esm', packages: 'external', alias: { '@': path.join(root, 'src') }, outfile: path.join(out, 'api.mjs') });
const { onRequest } = await import(path.join(out, 'api.mjs'));
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
const holding = catalog.find(r => r.id === capital.id.replace(/^private-capital:/, 'holding:'));
const results = [];
const check = (name, condition) => { assert.ok(condition, name); results.push(name); };
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1050 }, acceptDownloads: true });
await context.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'External feeds unavailable in isolated test' }) }));
for (const [endpoint, handler] of [['table-inputs', onRequest], ['real-estate', propertyRequest]]) await context.route(`**/api/${endpoint}`, async route => {
  const request = route.request();
  const response = await handler({ request: new Request(request.url(), { method: request.method(), headers: request.headers(), ...(request.method() === 'POST' ? { body: request.postData() } : {}) }), env });
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
});
for (const [endpoint, key] of [['capital-calls', 'calls'], ['investment-profiles', 'profiles']]) await context.route(`**/api/${endpoint}`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, [key]: [] }) }));
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
async function visit(route) { await page.goto(base + route); await page.locator('[data-edit-numbers]').first().waitFor(); await page.waitForFunction(() => !document.querySelector('[data-edit-numbers]')?.disabled); }
async function download(name) {
  const downloading = page.waitForEvent('download'); await page.locator('[data-export-excel]').first().click();
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
  await visit('/private-market');
  await page.locator('[data-edit-numbers]').first().click();
  const cost = page.locator(`[data-input-record="${holding.id}"][data-input-field="costBasis"]`).first();
  await cost.locator('input').fill('200000'); await cost.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-entered-numbers]')?.textContent?.includes('2 user-entered'));
  check('Inline edits and workbook imports share the same store', (await snapshot()).catalog.find(r => r.id === holding.id).values.costBasis === 200000);
  await page.screenshot({ path: path.join(out, 'inline-private.png'), fullPage: false });
  await cost.getByRole('button', { name: 'Restore original' }).click();
  await page.waitForFunction(() => document.querySelector('[data-entered-numbers]')?.textContent?.includes('1 user-entered'));
  check('Restore original removes a number correction', (await snapshot()).catalog.find(r => r.id === holding.id).values.costBasis === holding.values.costBasis);
  await visit('/monitor');
  const monitor = await download('monitor.xlsx');
  check('The same correction appears in a different table export', inputCell(monitor.book, capital.id, 'paid', 'Capital inputs').value === 123456);
  check('Nested tables travel in their own detail worksheets', monitor.book.worksheets.some(s => /^Detail /.test(s.name)));
  inputCell(original.book, capital.id, 'paid', 'Capital inputs').value = 500;
  const stale = path.join(out, 'stale.xlsx'); await original.book.xlsx.writeFile(stale); await upload(stale);
  await page.getByRole('alert').filter({ hasText: 'changed since' }).waitFor();
  check('Stale uploads are refused without a write', commits === 3);
  await visit('/real-estate');
  const realEstate = await download('property.xlsx');
  check('Property input sheet uses the whole property amount', inputCell(realEstate.book, `property:${property.id}`, 'value', 'Property inputs').value === 100000);
  inputCell(realEstate.book, `property:${property.id}`, 'value', 'Property inputs').value = 150000;
  const propertyFile = path.join(out, 'property-edited.xlsx'); await realEstate.book.xlsx.writeFile(propertyFile);
  await upload(propertyFile); await savePreview();
  check('Property Excel upload updates the existing property record', data.get(`real-estate:${property.id}`).value === 150000);
  await page.locator('[data-real-estate-table]').getByText('₹75,000', { exact: true }).first().waitFor();
  check('Property shares and totals recalculate from whole-property inputs', true);
  await page.setViewportSize({ width: 420, height: 900 });
  await page.locator('[data-all-inputs]').first().click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: path.join(out, 'mobile-inputs.png') });
  check('Mobile editor stays within the viewport', await page.getByRole('dialog').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
  check('No uncaught browser errors', errors.length === 0);
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ checks: results, commits }, null, 2));
  console.log(`PASS: ${results.length} browser checks; all ${commits} writes used an isolated local store`);
} catch (error) { await page.screenshot({ path: path.join(out, 'failure.png') }); await fs.writeFile(path.join(out, 'failure.json'), JSON.stringify({ results, errors, error: String(error) }, null, 2)); throw error; }
finally { await browser.close(); }
