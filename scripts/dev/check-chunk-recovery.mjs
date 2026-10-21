// Local/staging regression against the built app; no production mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const output = '.cache/chunk-recovery-check';
await fs.mkdir(output, { recursive: true });
const results = [];
async function open() {
  const context = await browser.newContext();
  await context.route('**/api/**', r => r.fulfill({ json: { ok: false, reason: 'local recovery fixture' } }));
  await context.route('https://fonts.**', r => r.abort());
  const page = await context.newPage();
  let documents = 0;
  page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++; });
  await page.goto(`${base}/monitor`);
  const link = page.locator('main a[href^="/stock/"]').first();
  await link.waitFor();
  const stock = await link.getAttribute('href');
  assert.ok(stock);
  await page.evaluate(() => localStorage.setItem('glow:theme', 'dark'));
  return { context, page, stock, documents: () => documents };
}
try {
  for (const failure of ['transient-404', 'persistent-html', 'expired-session', 'runtime-error']) {
    const test = await open();
    const { context, page, stock } = test;
    let attempts = 0, fail = true;
    await context.route(/\/assets\/StockInfo-[^/]+\.js$/, async r => {
      attempts++;
      if (!fail || (failure === 'transient-404' && attempts > 1)) return r.continue();
      if (failure === 'runtime-error') return r.fulfill({ contentType: 'application/javascript', body: 'throw new Error("fixture runtime error");' });
      if (failure === 'persistent-html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><html>old SPA fallback</html>' });
      return r.fulfill({ status: failure === 'expired-session' ? 401 : 404, contentType: 'text/plain', body: 'unavailable' });
    });
    const destination = new URL(stock, base);
    destination.searchParams.set('recovery', 'keep');
    destination.hash = 'holding';
    await page.goto(destination.href, { waitUntil: 'commit' });
    if (failure === 'transient-404') {
      await page.locator('[data-stock-head]').waitFor();
      assert.equal(attempts, 2, 'failed route loads after one automatic document reload');
      assert.equal(test.documents(), 3, 'monitor, stock, and one recovery reload');
    } else if (failure === 'runtime-error') {
      await page.getByRole('heading', { name: 'Something went wrong', exact: true }).waitFor();
      assert.equal(test.documents(), 2, 'runtime bugs do not trigger update recovery');
      assert.match(await page.getByRole('alert').innerText(), /fixture runtime error/);
    } else {
      await page.getByRole('heading', { name: "This page couldn't load", exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(attempts, 2, 'the second failure reaches an actionable fallback');
      assert.equal(test.documents(), 3, 'persistent failures never loop');
      assert.doesNotMatch(await page.getByRole('alert').innerText(), /assets\/|dynamically imported/);
      await page.screenshot({ path: `${output}/${failure}.png` });
      fail = false;
      await page.getByRole('button', { name: 'Reload dashboard', exact: true }).click();
      await page.locator('[data-stock-head]').waitFor();
      assert.equal(test.documents(), 4, 'manual retry still works after automatic recovery is exhausted');
    }
    assert.equal(page.url(), destination.href, 'route, query, and hash survive recovery');
    assert.equal(await page.evaluate(() => localStorage.getItem('glow:theme')), 'dark', 'saved preferences survive recovery');
    results.push({ failure, attempts, documents: test.documents(), passed: true });
    await context.close();
  }
  const test = await open();
  const { page, context } = test;
  await context.setOffline(true);
  await page.locator('main a[href^="/stock/"]').first().click();
  await page.getByRole('heading', { name: "You're offline", exact: true }).waitFor();
  assert.equal(test.documents(), 1, 'offline navigation never reloads the working document');
  const destination = page.url();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reload dashboard', exact: true }).click();
  await page.locator('[data-stock-head]').waitFor();
  assert.equal(page.url(), destination);
  results.push({ failure: 'offline', documents: test.documents(), passed: true });
  await context.close();
  await fs.writeFile(`${output}/browser-results.json`, JSON.stringify(results, null, 2));
  console.log('PASS: transient/persistent/401 route failures, offline recovery, URL retention and real runtime errors');
} finally {
  await browser.close();
}
