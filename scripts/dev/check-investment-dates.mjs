// Local-only regression for the reported MF omission and every holdings surface.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';

const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = '.cache/investment-date-check';
await fs.mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: 'export { BOOK_ACCOUNTS, BOOK_POSITIONS } from "./src/data/glowData.ts";', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'error' });
const { BOOK_ACCOUNTS: accounts, BOOK_POSITIONS: positions } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const pms = accounts.filter(a => a.engagement === 'PMS' && positions.some(p => p.accountId === a.accountId && p.tradeRecord?.held));
const peers = a => pms.filter(b => b.provider === a.provider && b.strategy === a.strategy);
const mandate = pms.find(a => peers(a).length === 1);
const strategy = pms.find(a => peers(a).length > 1);
assert.ok(mandate && strategy);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Los_Angeles' });
const page = await context.newPage();
const errors = [], checked = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (/^<Tr> got/.test(message.text())) errors.push(message.text()); });
await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"unreachable"}' }));
await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
await installReadModelRoutes(page);
const table = key => page.locator(`table[data-table-view="${key}"]`).first();
const go = url => page.goto(base + url, { waitUntil: 'domcontentloaded' });
const totalsOf = t => t.evaluate(t => {
  const columns = [...t.tHead.rows[0].cells].map(c => c.dataset.col);
  let at = 0;
  return Object.fromEntries([...t.tFoot.rows[0].cells].map(c => {
    const id = columns[at]; at += c.colSpan;
    return [id, c.innerText.trim()];
  }));
});
async function check(key, dateCol = 'investedOn') {
  const t = table(key);
  await t.waitFor();
  assert.equal(await t.locator(`thead th[data-col="${dateCol}"]`).count(), 1, `${key}: investment date is visible exactly once`);
  const widths = await t.evaluate(t => [...t.rows].filter(r => r.closest('table') === t && r.cells.length).map(r => [...r.cells].reduce((n, c) => n + c.colSpan, 0)));
  assert.ok(widths.length > 1, `${key}: rows rendered`);
  if (!widths.every(w => w === widths[0])) errors.push(`${key}: headers, rows and totals do not align: ${widths}`);
  checked.push(key);
  return t;
}
try {
  await go('/');
  await page.evaluate(() => localStorage.setItem('glow:tableView:stock-positions:v1', JSON.stringify({ order: ['entity', 'managedBy', 'qty', 'avgCost', 'cmp', 'invested', 'current', 'pnl', 'return'], sort: null, visibility: { 'review:investmentRange': false } })));
  const mf = '/stock/hdfc-balanced-advantage-fund-regular-plan-growth';
  await go(mf);
  const t = await check('stock-positions');
  for (const [account, date] of [['hdfc-mutual-fund-15644806', '3 Aug 2022'], ['hdfc-mutual-fund-16002141', '5 Aug 2022']]) {
    assert.equal(await t.locator(`tr[data-account-row="${account}"] [data-col-cell="investedOn"]`).innerText(), date);
  }
  const total = await totalsOf(t);
  await t.locator('[data-col-button="investedOn"]').click();
  assert.equal(await t.locator('tr[data-account-row]').first().getAttribute('data-account-row'), 'hdfc-mutual-fund-16002141');
  await t.locator('[data-col-button="investedOn"]').click();
  assert.equal(await t.locator('tr[data-account-row]').first().getAttribute('data-account-row'), 'hdfc-mutual-fund-15644806');
  await t.locator('[data-col-grip="investedOn"]').focus();
  await page.keyboard.press('ArrowLeft');
  const order = await t.locator('thead th').evaluateAll(ths => ths.map(th => th.dataset.col));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await check('stock-positions');
  assert.deepEqual(await t.locator('thead th').evaluateAll(ths => ths.map(th => th.dataset.col)), order);
  assert.deepEqual(await totalsOf(t), total, 'adding and moving a date never changes the total under any financial column');
  await page.locator('[data-edit-columns="stock-positions"]').click();
  await page.locator('[data-column-checkbox="investedOn"]').uncheck();
  await page.keyboard.press('Escape');
  assert.equal(await t.locator('thead [data-col="investedOn"]').count(), 0);
  await page.locator('[data-edit-columns="stock-positions"]').click();
  await page.getByRole('button', { name: 'Reset columns', exact: true }).click();
  await page.keyboard.press('Escape');
  await check('stock-positions');
  await page.screenshot({ path: `${out}/hdfc-position.png` });
  await go('/stock/icici-ioppf-d-grw');
  await check('stock-positions');
  for (const [suffix, date] of [['12539150', '2025-03-06'], ['12838316', '2025-11-06'], ['12838320', '2025-07-11']]) {
    const cell = table('stock-positions').locator(`tr[data-account-row$="${suffix}"] [data-col-cell="investedOn"]`);
    assert.equal(await cell.getAttribute('data-invested-first'), date, 'the demat fund row keeps its own reconciled purchase date');
  }
  await page.screenshot({ path: `${out}/icici-position.png` });
  await go(mf + '?members=ajay-jaisinghani');
  await check('stock-positions');
  assert.equal(await t.locator('tr[data-account-row]').count(), 1);
  assert.equal(await t.locator('[data-col-cell="investedOn"]').innerText(), '3 Aug 2022');

  for (const group of ['category', 'assetClass', 'basket', 'security']) {
    await go(`/monitor?group=${group}`);
    await check('monitor');
  }
  for (const held of ['all', 'direct', 'managers', 'funds']) {
    await go(`/stock/state-bank-of-india?held=${held}`);
    await check('stock-positions');
    if (held === 'funds') {
      const dates = await table('stock-positions').locator('[data-col-cell="investedOn"]').allTextContents();
      assert.ok(dates.length > 0 && dates.every(d => d.trim() === '—'), 'derived fund exposures never borrow the fund units\' purchase dates');
    }
  }
  await go(`/mandate/${encodeURIComponent(mandate.accountId)}`);
  await check('mandate-holdings');
  await go(`/mandate/${encodeURIComponent(strategy.accountId)}`);
  await check('strategy-holders');
  await check('strategy-holdings');
  await go('/family');
  await page.locator('tr[data-entity-mv]').first().click();
  await check('family-holdings');
  for (const [entity, account, date] of [['ajay-jaisinghani', 'hdfc-mutual-fund-15644806', '2022-08-03'], ['ankita-jaisinghani', 'hdfc-mutual-fund-16002141', '2022-08-05']]) {
    await go(`/family?entity=${entity}`);
    await check('family-holdings');
    const cell = table('family-holdings').locator(`tr[data-fe-holding-account="${account}"][data-fe-holding-key="hdfc-balanced-advantage-fund-regular-plan-growth"] [data-col-cell="investedOn"]`);
    assert.equal(await cell.getAttribute('data-invested-first'), date, 'the same folio has its own date in the entity table');
  }
  await go('/holdings?of=book');
  await check('holdings-behind');
  const combined = table('holdings-behind').locator('tr[data-hb-key="hdfc-balanced-advantage-fund-regular-plan-growth"] [data-col-cell="investedOn"]');
  assert.equal(await combined.getAttribute('data-invested-first'), '2022-08-03');
  assert.equal(await combined.getAttribute('data-invested-last'), '2022-08-05', 'the combined holding includes both folios\' actual dates');
  await go('/performance');
  await check('performance-xirr');
  await go('/returns');
  await check('returns-contributors');
  await check('returns-detractors');
  await go('/capital-gains');
  for (const key of ['cg-hold', 'cg-harvest']) if (await table(key).count()) await check(key);
  for (const view of ['?view=direct', '?view=consolidated']) {
    await go('/sectors' + view);
    await page.locator('tr[data-sector-row]:not([data-sector-index-only])').first().click();
    const key = await table('sector-holdings').count() ? 'sector-holdings' : 'sector-companies';
    await check(key);
  }
  for (const view of ['', '?view=brands']) {
    await go('/private-market' + view);
    await check('pm-book', 'invested');
  }
  await go(mf);
  await page.setViewportSize({ width: 390, height: 844 });
  await check('stock-positions');
  const mobile = await table('stock-positions').evaluate(t => {
    const host = t.closest('.overflow-x-auto');
    return host ? { width: host.clientWidth, content: host.scrollWidth, viewport: innerWidth, overflow: getComputedStyle(host).overflowX } : null;
  });
  if (!mobile || mobile.width > mobile.viewport || mobile.content <= mobile.width || !['auto', 'scroll'].includes(mobile.overflow)) {
    errors.push(`the holding table needs its own horizontal scrollport on mobile: ${JSON.stringify(mobile)}`);
  }
  await table('stock-positions').locator('thead [data-col="investedOn"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/hdfc-mobile.png` });
  assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/results.json`, JSON.stringify({ checked, mobile, errors }, null, 2));
  console.log(`ok investment dates: ${checked.join(', ')}; exact MF allotments, saved layouts, sorting, movement, reset, member scope, totals and mobile`);
} finally { await browser.close(); }
