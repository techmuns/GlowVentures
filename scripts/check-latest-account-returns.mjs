// Local browser verification; all API traffic is refused, so no production writes or model work.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './dev/read-model-api.mjs';

const base = process.env.BASE ?? 'http://127.0.0.1:4187';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = path.resolve('.cache/latest-returns');
const bookText = readFileSync('src/data/glowData.ts','utf8');
const constant = name => JSON.parse(new RegExp(`export const ${name}[^=]*= ([\\s\\S]*?);\\n`).exec(bookText)[1]);
const records = constant('BOOK_ACCOUNT_RETURN_RECORDS'), accounts = constant('BOOK_ACCOUNTS');
const selected = Object.values(records).filter(c => c.record).map(c => c.record);
const expectedEnd = selected.map(r => r.asOf).sort().at(-1);
const faceDate = new Date(`${expectedEnd}T00:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
assert(selected.length >= 17 && expectedEnd >= '2026-10-07');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"NOT_CONFIGURED"}' }));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/,route => route.abort());
  await installReadModelRoutes(page);
  await page.goto(`${base}/cio?tiles=annualised,value`);
  const tile = page.locator('[data-tile-slot="annualised"]');
  await tile.locator('[data-return-info]').waitFor();
  assert((await tile.innerText()).includes(faceDate));
  assert(Number(await tile.locator('[data-card-coverage]').getAttribute('data-card-accounts')) >= selected.length);
  assert.match(await tile.innerText(), /Available data/);
  const shown = Number((await tile.locator('[data-kpi-value]').innerText()).replace(/[^0-9.+-]/g, ''));
  await tile.locator('[data-return-info]').click();
  const dialog = page.getByRole('dialog');
  assert.equal(Number((await dialog.locator('[data-return-result]').innerText()).replace(/[^0-9.+-]/g, '')), shown);
  assert.match(await dialog.innerText(), /What is missing/);
  assert.match(await dialog.innerText(), /Newer records still need checking/);
  await dialog.locator('details').filter({ hasText: '2026-10-06' }).first().locator('summary').click();
  assert.match(await dialog.innerText(), /6 Oct|2026-10-06/);
  await dialog.locator('[data-attribution-included] summary').click();
  const included = await dialog.locator('[data-attribution-included]').innerText();
  assert.match(included, new RegExp(faceDate));
  assert.match(included, /22 Sept|22 Sep|2026-09-22/);
  assert.equal(await page.locator('[data-tile-slot="mwr"]').count(), 0);
  await page.screenshot({ path: path.join(output, 'cio-latest-return.png') });
  await page.keyboard.press('Escape');
  await page.goto(`${base}/performance`);
  const row = page.locator('[data-xirr-row="green-lantern-capital-llp-510861"]');
  await row.waitFor();
  assert.equal(Number(await row.getAttribute('data-xirr-mv')), 116019848);
  assert.match(await row.innerText(), /2026-09-22/);
  await page.goto(`${base}/family`);
  await page.locator('[data-mwr-accounts]').first().waitFor();
  assert(await page.locator('[data-mwr-accounts]').evaluateAll((rows,end) => rows.some(r => r.getAttribute('data-mwr-end') === end),expectedEnd));
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => localStorage.setItem('glow:theme', theme), theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/cio?tiles=annualised,value`);
    await page.locator('[data-tile-slot="annualised"] [data-return-info]').click();
    assert(await page.getByRole('dialog').evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1; }));
    await page.screenshot({ path: path.join(output, `${theme}-mobile.png`) });
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  console.log(`PASS browser: ${shown}% through ${expectedEnd}, ${selected.length}/${accounts.length} coverage, named gaps, Performance/Family consistency, themes and mobile`);
} finally { await browser.close(); }
