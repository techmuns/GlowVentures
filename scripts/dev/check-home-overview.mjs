// Local-only Home navigation, real-book reconciliation and responsive layout.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
const base = process.env.BASE ?? 'http://127.0.0.1:4173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'local environment required');
const out = path.resolve('.cache/home-overview');
await fs.mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `
  export { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_TAPE_ROWS } from './src/data/glowData';
  export { dedupedPositions } from './src/lib/analytics';
  export { applyFundNavs, depositoryFundHoldings, unpricedStatementUnits } from './src/lib/fundNavs';
  export { applyCorporateActionQuotes } from './src/lib/corporateActions';
  export { depositoryShareHoldings } from './src/lib/depositoryShares';
  export { applyQuotes } from './src/lib/quotes';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', alias: { '@': path.resolve('src') }, logLevel: 'error' });
const b = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const actions = JSON.parse(await fs.readFile('public/data/corporate-actions.json', 'utf8'));
const raw = b.applyFundNavs([
  ...b.applyCorporateActionQuotes([...b.BOOK_POSITIONS, ...b.BOOK_TAPE_ROWS], b.BOOK_ACCOUNTS, null, actions).positions,
  ...b.applyQuotes([...b.depositoryFundHoldings(), ...b.unpricedStatementUnits()], null),
  ...b.depositoryShareHoldings(null, actions, undefined, b.BOOK_ACCOUNTS),
]);
const totalOf = rows => b.dedupedPositions(rows).reduce((sum, row) => sum + row.marketValue, 0);
const expected = totalOf(raw);
const owner = b.BOOK_ACCOUNTS.find(a => a.ownerId && raw.some(p => p.accountId === a.accountId && p.marketValue > 0)).ownerId;
const ids = new Set(b.BOOK_ACCOUNTS.filter(a => a.ownerId === owner).map(a => a.accountId));
const scopedTotal = totalOf(raw.filter(p => ids.has(p.accountId)));
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
let activePage;
try {
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1100 } });
    await context.addInitScript(theme => localStorage.setItem('glow:theme', theme), theme);
    const page = await context.newPage(), errors = [];
    activePage = page;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ status: 503, json: { ok: false } }));
    await page.route('**/api/fx', route => route.fulfill({ json: { ok: true, inrPerUsd: 100, date: '2026-11-10' } }));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await page.goto(base + '/');
    await page.locator('[data-home-overview]').waitFor();
    assert.equal(new URL(page.url()).pathname, '/home', 'the front door opens Home');
    assert.deepEqual(await page.locator('[data-nav-group="Daily"] [data-nav-entry]').evaluateAll(els => els.slice(0, 2).map(el => el.dataset.navEntry)), ['/home', '/cio']);
    assert.equal(await page.locator('[data-nav-entry="/home"]').getAttribute('aria-current'), 'page');
    await page.waitForFunction(expected => Math.abs(Number(document.querySelector('[data-home-aum]')?.dataset.homeAum) - expected) < .01, expected);
    const rows = await page.locator('[data-home-class]').evaluateAll(els => els.map(el => ({ value: Number(el.dataset.value), weight: Number(el.dataset.weight) })));
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.value, 0) - expected) < .01, 'asset values reconstruct AUM');
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.weight, 0) - 100) < 1e-8, 'asset weights sum to 100%');
    assert.equal(Number(await page.locator('[data-home-geography]').getAttribute('data-unclassified-value')), expected);
    assert.doesNotMatch(await page.locator('[data-home-geography]').innerText(), /United States|Europe|Canada/, 'no reference-image geography is fabricated');
    assert.ok(await page.locator('[data-home-overview]').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Home has no horizontal overflow');
    const boxes = await page.locator('[data-home-grid] > .card').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    if (width === 1440) {
      assert.ok(boxes[0].x < boxes[1].x && Math.abs(boxes[0].y - boxes[1].y) < 1, 'donut left and AUM right');
      assert.ok(Math.abs(boxes[1].x - boxes[2].x) < 1 && boxes[2].y > boxes[1].y, 'geography is under AUM');
    } else assert.ok(boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y, 'cards stack on narrow screens');
    await page.locator('[data-home-grid]').screenshot({ path: path.join(out, `${theme}-${width}.png`) });
    const sector = page.locator('[data-home-allocation-chart] .recharts-sector').first();
    const sectorBox = await sector.boundingBox();
    // The bounding-box centre is the donut's empty hole. Click its painted arc.
    await sector.click({ position: { x: sectorBox.width / 2, y: 8 } });
    assert.match(new URL(page.url()).search, /of=family-class/, 'donut segment opens its holdings');
    await page.locator('[data-page-nav-home]').click();
    await page.locator('[data-home-aum]').waitFor();
    await page.locator('[data-home-class] a').first().click();
    assert.match(new URL(page.url()).search, /of=family-class/, 'asset slice opens its holdings');
    await page.locator('[data-page-nav-home]').click();
    await page.locator('[data-home-aum]').waitFor();
    if (width === 1440) {
      await page.getByRole('group', { name: 'Display currency', exact: true }).getByRole('button', { name: 'USD', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-home-aum]')?.textContent.includes('$'));
      assert.equal(Number(await page.locator('[data-home-aum]').getAttribute('data-home-aum')), expected, 'currency changes the display, not the model');
    }
    await page.goto(`${base}/home?members=${owner}`);
    await page.waitForFunction(expected => Math.abs(Number(document.querySelector('[data-home-aum]')?.dataset.homeAum) - expected) < .01, scopedTotal);
    await page.locator('[data-nav-entry="/cio"]').click();
    await page.locator('main h1').first().waitFor();
    await page.locator('[data-page-nav-home]').first().click();
    await page.locator('[data-home-overview]').waitFor();
    assert.equal(new URL(page.url()).pathname, '/home');
    assert.ok(Math.abs(Number(await page.locator('[data-home-aum]').getAttribute('data-home-aum')) - scopedTotal) < .01, 'Home navigation preserves member scope');
    assert.deepEqual(errors, []);
    results.push({ theme, width, total: expected, scopedTotal, classes: rows.length });
    await context.close();
  }
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log('Home navigation, real-book AUM and weights, scoped totals, currency, drilldowns and layouts passed:', results);
} catch (error) {
  await activePage?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  throw error;
} finally { await browser.close(); }
