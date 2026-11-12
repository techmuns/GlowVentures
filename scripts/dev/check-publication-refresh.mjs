// Local/immutable-preview regression. API fixtures are intercepted; no production requests or uploads.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://127.0.0.1:4173';
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
assert.ok(local || /^[a-f0-9]{8}\.glowventures-1xw\.pages\.dev$/.test(new URL(base).hostname), 'Use local or immutable staging only');
const password = local ? null : execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'codex.glowventures.dashboard', '-a', 'glowventures-1xw.pages.dev', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
async function authenticate(context) {
  if (local) return;
  const login = await context.request.post(base + '/__auth/login?next=%2Faudit', { form: { password }, maxRedirects: 0 });
  assert.equal(login.status(), 302);
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let manifest;
if (local) manifest = JSON.parse(await fs.readFile('src/data/readModels.json', 'utf8'));
else {
  const metadata = await browser.newContext(); await authenticate(metadata);
  const pointer = await (await metadata.request.get(base + '/publication.json')).json();
  const publication = await (await metadata.request.get(`${base}/views/${pointer.revision}/publication.json`)).json();
  manifest = { revision: pointer.revision, readerRevision: publication.readerRevision };
  await metadata.close();
}
const compiled = manifest.revision;
const future = compiled === 'b'.repeat(20) ? 'c'.repeat(20) : 'b'.repeat(20);
const results = [];
await fs.mkdir('.cache/publication-refresh-check', { recursive: true });
try {
  for (const startup of ['compiled', 'unavailable', 'incompatible']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await authenticate(context);
    let published = { schemaVersion: 1, revision: compiled, readerRevision: manifest.readerRevision }, checks = 0;
    await context.route('**/api/**', route => route.fulfill({ json: { ok: false, reason: 'local publication fixture' } }));
    await context.route('**/api/statement-data', route => startup === 'compiled' ? route.fulfill({ status: 204 })
      : startup === 'unavailable' ? route.fulfill({ status: 503, json: { error: 'Temporary fixture outage' } })
      : route.fulfill({ json: { schemaVersion: 1, revision: future, readerRevision: 'd'.repeat(64) } }));
    const publication = route => { checks++; return route.fulfill({ json: published }); };
    await context.route('**/publication.json', publication);
    await context.route('**/api/statement-data?status=1', publication);
    await context.addInitScript(() => {
      if (location.protocol.startsWith('http')) sessionStorage.setItem('publication-test-loads', String(Number(sessionStorage.getItem('publication-test-loads') || 0) + 1));
      // Exercise many real poll rounds without a multi-minute browser test.
      const interval = window.setInterval;
      window.setInterval = (fn, delay, ...args) => interval(fn, [5_000, 30_000].includes(delay) ? 100 : delay, ...args);
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/audit?members=ajay-jaisinghani&consolidated=Consolidated%20View&proof=keep#holding`);
    await page.locator('[data-consolidated="ready"]').waitFor();
    await page.bringToFront();
    // The exact production failure: a processor advertises an incompatible book.
    published = { schemaVersion: 1, revision: future, readerRevision: 'd'.repeat(64) };
    const firstChecks = checks;
    await page.waitForTimeout(600);
    assert.ok(checks >= firstChecks + 3, 'multiple incompatible-pointer polls were exercised');
    assert.equal(await page.locator('[data-dashboard-update]').count(), 0, 'an incompatible book cannot advertise a reload loop');
    const search = page.getByRole('textbox', { name: 'Search consolidated sheet' });
    await search.fill('HDFC');
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.__publicationMain = document.querySelector('main');
      window.__publicationSheet = document.querySelector('[data-consolidated="ready"]');
      document.querySelector('main').scrollTop = 180;
      window.__publicationScroll = document.querySelector('main').scrollTop;
    });
    published = { schemaVersion: 1, revision: future, readerRevision: manifest.readerRevision };
    const update = page.getByRole('button', { name: 'Load latest dashboard', exact: true });
    await update.waitFor();
    await page.waitForTimeout(300);
    assert.equal(await update.isDisabled(), true, 'a draft blocks the explicit update action');
    for (let i = 0; i < 8; i++) {
      published = { ...published, revision: i % 2 ? future : 'e'.repeat(20) };
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(100);
    }
    assert.equal(await search.inputValue(), 'HDFC', 'background refresh preserves the current search');
    assert.ok(await page.evaluate(() => window.__publicationMain === document.querySelector('main')
      && window.__publicationSheet === document.querySelector('[data-consolidated="ready"]')
      && window.__publicationScroll === document.querySelector('main').scrollTop), 'the same page, table and scroll position stay mounted');
    assert.equal(await page.getByRole('heading', { name: 'A new dashboard version is ready' }).count(), 0);
    assert.equal(await page.getByText('Loading dashboard…', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => Number(sessionStorage.getItem('publication-test-loads'))), 1, 'polling and focus never reload the document');
    await page.screenshot({ path: `.cache/publication-refresh-check/${startup}.png` });
    // Navigation clears the draft block but still cannot reload automatically.
    await page.locator('a[href^="/monitor"]').first().click();
    await page.locator('[data-monitor-table]').first().waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-dashboard-update]')?.disabled);
    assert.equal(await page.evaluate(() => Number(sessionStorage.getItem('publication-test-loads'))), 1);
    assert.equal(new URL(page.url()).searchParams.get('members'), 'ajay-jaisinghani');
    const currentURL = page.url();
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), update.click()]);
    await page.locator('[data-monitor-table]').first().waitFor();
    await page.waitForTimeout(400);
    assert.equal(page.url(), currentURL, 'the explicit update preserves URL and member scope');
    assert.equal(await page.evaluate(() => Number(sessionStorage.getItem('publication-test-loads'))), 2, 'exactly one reload, only after an explicit click');
    assert.deepEqual(errors, []);
    results.push({ startup, checks, spontaneousReloads: 0, explicitReloads: 1, retainedSearchAndScroll: true, errors });
    await context.close();
  }
  // A deployed asset mismatch used to replace the whole application with an alert.
  const context = await browser.newContext(); await authenticate(context);
  await context.route('**/api/**', route => route.fulfill({ json: { ok: false } }));
  await context.route('**/api/statement-data', route => route.fulfill({ status: 204 }));
  await context.route('**/publication.json', route => route.fulfill({ json: { schemaVersion: 1, revision: compiled } }));
  await context.route('**/api/stock-exposure', route => route.fulfill({ status: 409, json: { status: 'revision_changed' } }));
  const mismatch = await context.newPage();
  await mismatch.goto(base + '/monitor');
  await mismatch.locator('[data-dashboard-update]').waitFor();
  assert.ok(await mismatch.locator('[data-monitor-table]').count() > 0, 'a 409 retains the dashboard and withholds unavailable exposure');
  assert.equal(await mismatch.getByRole('heading', { name: 'A new dashboard version is ready' }).count(), 0);
  await context.close();
  results.push({ startup: 'deployment-mismatch', pageRetained: true });
  await fs.writeFile('.cache/publication-refresh-check/results.json', JSON.stringify(results, null, 2));
  console.log('PASS quiet publication discovery: incompatible pointers, repeated polls, startup failures, drafts, scroll, focus, navigation and explicit updates');
} finally { await browser.close(); }
