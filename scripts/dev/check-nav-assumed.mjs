// A local/preview browser regression for the NAV card's demat shares at published
// closes (Stage 10iz). Prices are explicit test fixtures, never written to records.
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
  await page.goto(base + '/cio?tab=nav');
  await page.locator('[data-testid="nav-book-chip"]').waitFor();
  return { context, errors };
};
try {
  // ── With published prices: the line values the demats' shares at every close ──
  const priced = await open(true);
  await page.waitForFunction(() => document.querySelector('[data-testid="nav-book-chip"]')?.getAttribute('data-nav-basis') === 'assumed', null, { timeout: 120000 });
  const chip = page.locator('[data-testid="nav-book-chip"]');
  const count = Number(await chip.getAttribute('data-nav-assumed-count'));
  assert.ok(count > 0, 'demat shares are valued at published closes');
  assert.match(await chip.innerText(), /assumed holdings/);
  const hover = await chip.getAttribute('title');
  assert.match(hover, /No sale appears in the records we have\. We assume .+ still hold these shares\./);
  assert.match(hover, /valued at each day's published close from their statement dates/);
  await page.locator('[data-testid="nav-excluded"] summary').click();
  const listed = await page.locator('[data-testid="nav-demat-assumed"] li').count();
  assert.equal(listed, count, 'every assumed holding is named in the fold');
  const others = await page.locator('[data-testid="nav-demat-other"] li').evaluateAll((li) => li.map((x) => x.getAttribute('data-nav-demat-status')));
  assert.ok(others.every((s) => s === 'statement' || s === 'left-out'));
  // THE FOOTER TIES: the series' end level is the statement book plus its named steps.
  const r = await page.locator('[data-testid="nav-excluded-recon"]').evaluate((el) => ({ ...el.dataset }));
  const n = (k) => Number(r[k]);
  assert.ok(Math.abs(n('assumedDelta')) > 1, 'the published closes move the level');
  assert.ok(Math.abs(n('levelEnd') - (n('statementBook') + n('newerMarks') + n('capitalAfter') + n('assumedDelta'))) <= 1, 'the level ties to its named steps');
  assert.match(await page.locator('[data-testid="nav-excluded-recon"]').getAttribute('title'), /from listed demat shares valued at published closes and assumed still held/);
  await page.screenshot({ path: out + '/assumed.png', fullPage: false });
  assert.deepEqual(priced.errors, []);
  await priced.context.close();

  // ── Without them: the statement line, saying why ──
  const unpriced = await open(false);
  await page.waitForFunction(() => /at their statement values/.test(document.querySelector('[data-testid="nav-book-chip"]')?.getAttribute('title') ?? ''), null, { timeout: 120000 });
  assert.equal(await page.locator('[data-testid="nav-book-chip"]').getAttribute('data-nav-basis'), 'statement');
  assert.doesNotMatch(await page.locator('[data-testid="nav-book-chip"]').innerText(), /assumed/);
  assert.deepEqual(unpriced.errors, []);
  await unpriced.context.close();
  console.log('NAV card demat shares: published closes, owner assumption, fold and footer tie, statement fallback passed.', { count });
} catch (error) { await page?.screenshot({ path: out + '/failure.png' }).catch(() => {}); throw error; } finally { await browser.close(); }
