// A local/preview browser regression for the NAV card (Stages 10iz, 10la): its book line is the
// return card's own, demat shares at published closes. Prices are test fixtures, never written to records.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'tests use a local preview only');
const out = '.cache/nav-assumed/browser'; await fs.mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `export { CAPTURE } from './src/lib/__tests__/liveBook'; export { WHOLE_BOOK_NAV } from './src/lib/bookNavBook';`,
  resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'error', alias: { '@': `${process.cwd()}/src` } });
const book = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const end = book.WHOLE_BOOK_NAV.coverage.to;
// A gentle daily ramp to the series' end, and a capture read through it with no
// share events, so every listed demat share passes the split check on fixture prices.
const dates = []; for (let ms = Date.parse('2026-01-01'); ms <= Date.parse(end); ms += 864e5) dates.push(new Date(ms).toISOString().slice(0, 10));
const prices = dates.map((_, i) => 100 + i * 0.05);
const capture = { ...book.CAPTURE, verifiedThrough: end, requestedTo: '2027-12-31', rows: book.CAPTURE.rows.filter((r) => r.type !== 'split' && r.type !== 'bonus') };
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let page;
const open = async (serveHistory) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (r) => r.fulfill({ status: 503, json: { status: 'unreachable' } }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('**/api/corporate-actions?*', (r) => r.fulfill({ json: { ok: true, feed: capture } }));
  await page.route('**/data/corporate-actions.json', (r) => r.fulfill({ json: capture }));
  await page.route('**/api/market-history?*', (r) => {
    if (!serveHistory) return r.fulfill({ status: 503, json: { ok: false, reason: 'unreachable' } });
    const q = new URL(r.request().url()).searchParams, symbol = q.get('symbol'), fund = q.get('fund');
    return r.fulfill({ json: { ok: true, version: 2, symbol: fund || symbol + '.NS', isin: q.get('isin'), name: fund ? 'Example NAV fixture - Growth' : symbol,
      source: 'Public-price layout fixture', basis: fund ? 'nav' : 'adjusted-close', first: dates[0], last: dates.at(-1), t: dates, v: prices, c: prices, splits: [] } });
  });
  await page.goto(base + '/cio?tab=nav&tiles=annualised,fytd,ytd');
  await page.locator('[data-testid="nav-book-chip"]').waitFor();
  return { context, errors };
};
try {
  // ── THE CARD'S OWN LINE (Stage 10la): its last point is the return card ──
  const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-8;
  const cardOf = (slot) => page.locator(`[data-tile-slot="${slot}"] [data-card-coverage]`);
  const priced = await open(true);
  const chip = page.locator('[data-testid="nav-book-chip"]');
  // Once the histories are in, the financial-year card values the demats' shares at published closes.
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="nav-book-chip"]')?.getAttribute('data-nav-assumed-count')) > 0, null, { timeout: 120000 });
  const count = Number(await chip.getAttribute('data-nav-assumed-count'));
  assert.equal(await chip.getAttribute('data-nav-period'), 'fytd', 'the line opens on the financial year');
  assert.ok(near(await chip.getAttribute('data-nav-ret'), await cardOf('fytd').getAttribute('data-card-return')), 'the line ends on the financial-year card');
  assert.ok(near(await chip.getAttribute('data-nav-card-gain'), await cardOf('fytd').getAttribute('data-card-gain')));
  const hover = await chip.getAttribute('title');
  assert.match(hover, /the card's own figure on every day/);
  assert.match(hover, /No sale appears in the records we have\. We assume .+ still hold these shares\./);
  assert.match(hover, /Covers \d+% of public investments/);
  // THE FOLD UNDER THE CHART IS GONE (Stage 10jz); the hover says what the line covers.
  assert.equal(await page.locator('[data-testid="nav-excluded"]').count(), 0);
  await page.screenshot({ path: out + '/assumed.png', fullPage: false });
  // The calendar year: the same, on its own card.
  await page.locator('[data-start="ytd"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="nav-book-chip"]')?.getAttribute('data-nav-period') === 'ytd');
  assert.ok(near(await chip.getAttribute('data-nav-ret'), await cardOf('ytd').getAttribute('data-card-return')), 'the line ends on the calendar-year card');
  // The available history: the chip carries the card's own figure (a rate a year past one year).
  await page.locator('[data-start="history"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="nav-book-chip"]')?.getAttribute('data-nav-period') === 'history');
  assert.ok(near(await chip.getAttribute('data-nav-card-return'), await cardOf('annualised').getAttribute('data-card-return')), 'the line is the available-history card');
  assert.deepEqual(priced.errors, []);
  await priced.context.close();

  // ── Without them: still the card's figure, and what waits for prices is named ──
  const unpriced = await open(false);
  await page.waitForTimeout(3000);
  assert.ok(near(await page.locator('[data-testid="nav-book-chip"]').getAttribute('data-nav-ret'), await cardOf('fytd').getAttribute('data-card-return')));
  assert.match(await page.locator('[data-testid="nav-book-chip"]').getAttribute('title'), /waiting for prices/);
  assert.deepEqual(unpriced.errors, []);
  await unpriced.context.close();
  console.log('NAV card: the line ends on its return card for each period, with and without published prices.', { count });
} catch (error) { await page?.screenshot({ path: out + '/failure.png' }).catch(() => {}); throw error; } finally { await browser.close(); }
