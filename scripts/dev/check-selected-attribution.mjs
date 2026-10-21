// Actual toolbar interactions against a local/staging build; never a production test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = '.cache/returns-period';
await fs.mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `export * from './src/data/glowData'; export * from './src/lib/periodReturns'; export { nothingToMeasure } from './src/lib/returns';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'error' });
const b = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const statement = { accounts: b.BOOK_ACCOUNTS, positions: b.BOOK_POSITIONS, accountReturnRecords: b.BOOK_ACCOUNT_RETURN_RECORDS, privateMarkets: {} };
const inputs = b.accountInputs({ accounts: b.BOOK_ACCOUNTS, positions: b.BOOK_POSITIONS, returnRecords: b.BOOK_ACCOUNT_RETURN_RECORDS, navHistory: b.BOOK_ACCOUNT_NAV_HISTORY,
 cashFlows: b.BOOK_ACCOUNT_CASH_FLOWS, groups: [], coverage: b.BOOK_NAV_COVERAGE.covered, undated: b.BOOK_UNDATED_CAPITAL, fromInception: b.BOOK_CAPITAL_FROM_INCEPTION, labelOf: a => a.provider })
 .map(i => ({ ...i, outside: b.nothingToMeasure(statement, b.BOOK_ACCOUNTS.find(a => a.accountId === i.accountId)) }));
const end = inputs.flatMap(i => i.valuations.map(v => v.date)).sort().at(-1);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let page;
try {
 page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('**/api/**', r => r.fulfill({ status: 503, json: { status: 'unreachable' } }));
 await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
 await installReadModelRoutes(page);
 await page.goto(base + '/cio?tab=returns');
 const table = page.locator('[data-segment-returns]');
 await table.waitFor();
 const results = [];
 for (const period of ['fytd', 'mtd', 'ytd', 'y1', 'y2', 'y3']) {
  await page.locator(`[data-returns-period="${period}"]`).click();
  const start = b.periodStart(period, end), win = b.windowReturns(inputs, start, end);
  for (const type of ['xirr', 'absolute', 'cagr']) {
   await page.locator('[data-returns-type-select]').selectOption(type);
   await page.waitForFunction(({ period, type }) => { const el = document.querySelector('[data-segment-returns]'); return el?.dataset.segPeriod === period && el?.dataset.segType === type; }, { period, type });
   const measured = b.measureWindow(win.included, type, String);
   const expectedGain = win.included.length ? win.gain : null;
   const expectedReturn = measured.shown ? measured.pct : null;
   const rawGain = await table.getAttribute('data-seg-total-gain'), rawReturn = await table.getAttribute('data-seg-total-ret');
   assert.ok(expectedGain == null ? rawGain === '' : rawGain !== '' && Math.abs(Number(rawGain) - expectedGain) < 0.001, `${period}/${type} gain: ${rawGain} vs ${expectedGain}`);
   // Chromium and Node can round the XIRR root a few binary digits apart.
   assert.ok(expectedReturn == null ? rawReturn === '' : rawReturn !== '' && Math.abs(Number(rawReturn) - expectedReturn) < 1e-8, `${period}/${type} return: ${rawReturn} vs ${expectedReturn}`);
   assert.equal(await table.getAttribute('data-seg-start'), start);
   results.push({ period, type, gain: rawGain, return: rawReturn });
  }
 }
 await page.locator('[data-returns-period="fytd"]').click();
 await page.locator('[data-returns-type-select]').selectOption('xirr');
 const total = table.locator('[data-seg-total]');
 assert.equal(await total.locator('[data-return-info]').count(), 2);
 await total.getByRole('button', { name: 'What is included in total return?', exact: true }).click();
 const dialog = page.getByRole('dialog'); await dialog.waitFor();
 assert.match(await dialog.innerText(), /Based on the available records for 17 accounts only/);
 assert.match(await dialog.innerText(), /What is missing/);
 assert.ok(await dialog.locator('[data-return-gap]').count() > 0);
 assert.match(await dialog.innerText(), /We need/);
 await page.screenshot({ path: `${out}/desktop-info.png` });
 await page.keyboard.press('Escape');
 await total.getByRole('button', { name: 'What is included in total gain?', exact: true }).click();
 await dialog.waitFor(); assert.match(await dialog.innerText(), /money added and taken out/); await page.keyboard.press('Escape');
 // Regrouping cannot change the measured pool; source-only returns get a named row.
 const gain = await table.getAttribute('data-seg-total-gain');
 await table.locator('[data-seg-axis-option="sector"]').click();
 await page.waitForFunction(() => document.querySelector('[data-segment-returns]')?.dataset.segAxis === 'sector');
 assert.equal(await table.getAttribute('data-seg-total-gain'), gain);
 assert.equal(await table.locator('tr[data-seg-row="__account_returns"]').count(), 1);
 await page.locator('[data-returns-period="inception"]').click();
 await page.locator('[data-returns-type-select]').selectOption('absolute');
 await page.waitForFunction(() => document.querySelector('[data-segment-returns]')?.dataset.segType === 'absolute');
 assert.notEqual(await table.getAttribute('data-seg-total-gain'), '');
 assert.notEqual(await table.getAttribute('data-seg-total-ret'), '');
 assert.equal(await page.locator('[data-returns-from]').isDisabled(), true); // Since-investment dates are deliberately locked.
 await page.screenshot({ path: `${out}/desktop-table.png` });
 // Invalid custom dates must clear the old numbers.
 await page.locator('[data-returns-period="custom"]').click();
 await page.locator('[data-returns-from]').fill('2030-01-01');
 await page.locator('[data-returns-from]').blur();
 await page.waitForFunction(() => document.querySelector('[data-segment-returns]')?.dataset.segStart === '2030-01-01');
 assert.equal(await table.getAttribute('data-seg-total-gain'), '');
 await page.locator('[data-returns-period="fytd"]').click();
 await page.setViewportSize({ width: 390, height: 844 });
 await total.getByRole('button', { name: 'What is included in total return?', exact: true }).click();
 await dialog.waitFor();
 assert.ok(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth+1 && r.top >= 0 && r.bottom <= innerHeight+1 && el.scrollWidth <= el.clientWidth+1; }));
 await page.screenshot({ path: `${out}/mobile-info.png` });
 await page.keyboard.press('Escape');
 assert.deepEqual(errors, []);
 await fs.writeFile(`${out}/browser-results.json`, JSON.stringify(results, null, 2));
 console.log('Attribution toolbar, covered totals, source cards and mobile layout passed:', results);
} catch (error) { await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {}); throw error; } finally { await browser.close(); }
