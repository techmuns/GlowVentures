// Local built-app regression. No production requests or statement uploads.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const compiled = JSON.parse(await fs.readFile('src/data/readModels.json', 'utf8')).revision;
const future = compiled === 'b'.repeat(20) ? 'c'.repeat(20) : 'b'.repeat(20);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
await fs.mkdir('.cache/publication-refresh-check', { recursive: true });
try {
  for (const editing of [false, true]) {
    const context = await browser.newContext();
    let published = compiled;
    await context.route('**/api/**', route => route.fulfill({ json: { ok: false, reason: 'local publication fixture' } }));
    await context.route('**/publication.json', route => route.fulfill({ json: { schemaVersion: 1, revision: published } }));
    await context.addInitScript(() => {
      if (location.protocol.startsWith('http')) sessionStorage.setItem('publication-test-loads', String(Number(sessionStorage.getItem('publication-test-loads') || 0) + 1));
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const initial = `${base}/audit?members=ajay-jaisinghani&consolidated=Holdings&proof=keep#holding`;
    await page.goto(initial);
    await page.locator('[data-consolidated="ready"]').waitFor();
    await page.bringToFront();
    if (editing) {
      await page.getByRole('textbox', { name: 'Search consolidated sheet' }).fill('HDFC');
      await page.evaluate(() => document.activeElement?.blur());
    }
    const currentURL = page.url();
    published = future;
    if (editing) {
      await Promise.all([page.waitForResponse(r => r.url().endsWith('/publication.json')), page.evaluate(() => window.dispatchEvent(new Event('focus')))]);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => Number(sessionStorage.getItem('publication-test-loads'))), 1, 'Editing does not discard the draft/query');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.locator('a[href^="/monitor"]').first().click(),
      ]);
      assert.equal(new URL(page.url()).pathname, '/monitor');
      assert.equal(new URL(page.url()).searchParams.get('members'), 'ajay-jaisinghani');
    } else {
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.evaluate(() => window.dispatchEvent(new Event('focus')))]);
      assert.equal(page.url(), currentURL, 'A read-only refresh preserves the exact current URL');
    }
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => Number(sessionStorage.getItem('publication-test-loads'))), 2, 'Exactly one document reload; a stale HTML response cannot loop');
    assert.deepEqual(errors, []);
    results.push({ editing, refreshedURL: page.url(), reloads: 1, errors });
    await context.close();
  }
  await fs.writeFile('.cache/publication-refresh-check/results.json', JSON.stringify(results, null, 2));
  console.log('PASS publication refresh preserves URL/member scope, defers drafts until navigation and reloads once');
} finally { await browser.close(); }
