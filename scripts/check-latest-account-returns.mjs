// Local browser verification; all API traffic is refused, so no production writes or model work.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.BASE ?? 'http://127.0.0.1:4187';
const output = path.resolve('docs/page-check/latest-returns');
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
  await page.goto(`${base}/cio?tiles=mwr,value`);
  const tile = page.locator('[data-tile-slot="mwr"]');
  await tile.locator('[data-return-info]').waitFor();
  assert((await tile.innerText()).includes(faceDate));
  assert((await tile.innerText()).includes(`${selected.length} of ${accounts.length}`));
  assert.match(await tile.innerText(), /Some accounts still need return inputs/);
  const shown = Number((await tile.locator('[data-kpi-value]').innerText()).replace(/[^0-9.+-]/g, ''));
  await tile.locator('[data-return-info]').click();
  const dialog = page.getByRole('dialog');
  assert.equal(Number((await dialog.locator('[data-return-result]').innerText()).replace(/[^0-9.+-]/g, '')), shown);
  await dialog.getByText('Show more', { exact: true }).click();
  assert.match(await dialog.innerText(), /6 Oct|2026-10-06/);
  assert.match(await dialog.innerText(), /2026-09-22/);
  assert.match(await dialog.innerText(), /189 days/);
  const flows = await dialog.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(c => c.textContent)));
  const parsed = flows.map(([date, amount]) => ({ date: Date.parse(`${date} UTC`), amount: Number(amount.replace(/[^0-9.+-]/g, '')) }));
  const first = Math.min(...parsed.map(f => f.date)), last = Math.max(...parsed.map(f => f.date));
  const balance = rate => parsed.reduce((n, f) => n + f.amount / ((1 + rate) ** ((f.date - first) / (365 * 86400000))), 0);
  let low = -.999, high = 100;
  for (let i = 0; i < 200; i++) { const mid = (low + high) / 2; if (balance(low) * balance(mid) <= 0) high = mid; else low = mid; }
  const calculated = (((1 + (low + high) / 2) ** ((last - first) / (365 * 86400000))) - 1) * 100;
  assert.equal(calculated.toFixed(1), shown.toFixed(1), 'the displayed dated record independently reproduces the return');
  assert.equal(new Date(last).toISOString().slice(0, 10), expectedEnd);
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
    await page.goto(`${base}/cio?tiles=mwr,value`);
    await page.locator('[data-tile-slot="mwr"] [data-return-info]').click();
    assert(await page.getByRole('dialog').evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1; }));
    await page.screenshot({ path: path.join(output, `${theme}-mobile.png`) });
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  console.log(`PASS browser: ${shown}% through ${expectedEnd}, ${selected.length}/${accounts.length} coverage, named gaps, independent cash-flow arithmetic, Performance/Family consistency, themes and mobile`);
} finally { await browser.close(); }
