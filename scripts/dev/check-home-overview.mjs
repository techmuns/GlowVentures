// Local-only Home verification: real book totals, dates, entity scope and widget lifecycle.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import ExcelJS from 'exceljs';
const base = process.env.BASE ?? 'http://127.0.0.1:4173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'local environment required');
const out = path.resolve(process.env.HOME_CHECK_OUT ?? '.cache/home-dashboard/browser');
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
    await context.addInitScript(theme => {
      localStorage.setItem('glow:theme', theme);
      if (theme === 'light' && !localStorage.getItem('glow:home:widgets:v1') && !localStorage.getItem('glow:home:widgets:v2')) {
        localStorage.setItem('glow:home:widgets:v1', JSON.stringify([
          { id: 'aum', size: 'full' }, { id: 'cash', size: 'quarter' }, { id: 'performance', size: 'full' },
          { id: 'allocation', size: 'half' }, { id: 'geography', size: 'half' }, { id: 'history', size: 'full' },
          { id: 'flows', size: 'full' }, { id: 'assets', size: 'full' },
        ]));
      }
    }, theme);
    const page = await context.newPage(), errors = [];
    activePage = page;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ status: 503, json: { ok: false } }));
    await page.route('**/api/fx', route => route.fulfill({ json: { ok: true, inrPerUsd: 100, date: '2026-11-10' } }));
    // Deliberately synthetic benchmark fixtures, local QA only; never part of the application.
    await page.route('**/api/prices?**', route => {
      const symbol = new URL(route.request().url()).searchParams.get('symbol');
      const t = [], v = [], rate = symbol === '^NSEI' ? .0005 : .0002;
      for (let d = Date.UTC(2022, 0, 1), i = 0; d <= Date.UTC(2026, 11, 1); d += 86400000, i++) { t.push(new Date(d).toISOString().slice(0, 10)); v.push(1000 * (1 + rate) ** i); }
      return route.fulfill({ json: { ok: true, symbol, name: symbol === '^NSEI' ? 'NIFTY 50' : 'NIFTY 500', t, v } });
    });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await page.goto(base + '/');
    await page.locator('[data-home-overview]').waitFor();
    assert.equal(new URL(page.url()).pathname, '/home');
    assert.deepEqual(await page.locator('[data-nav-group="Daily"] [data-nav-entry]').evaluateAll(els => els.slice(0, 2).map(el => el.dataset.navEntry)), ['/home', '/cio']);
    await page.waitForFunction(expected => Math.abs(Number(document.querySelector('[data-home-aum]')?.dataset.homeAum) - expected) < .01, expected);
    const rows = await page.locator('[data-home-class]').evaluateAll(els => els.map(el => ({ value: Number(el.dataset.value), weight: Number(el.dataset.weight) })));
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.value, 0) - expected) < .01);
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.weight, 0) - 100) < 1e-8);
    assert.equal(Number(await page.locator('[data-home-geography]').getAttribute('data-unclassified-value')), expected);
    const choices = page.locator('[data-home-allocation-choice]');
    const firstChoice = await choices.first().getAttribute('data-home-allocation-choice');
    await choices.first().hover();
    assert.equal(await page.locator('[data-home-allocation-selection]').getAttribute('data-home-allocation-selection'), firstChoice, 'legend hover updates the donut');
    await choices.nth(1).focus();
    assert.equal(await page.locator('[data-home-allocation-selection]').getAttribute('data-home-allocation-selection'), await choices.nth(1).getAttribute('data-home-allocation-choice'), 'keyboard focus has the same data detail');
    assert.equal(await page.locator('[data-home-allocation-chart] .recharts-tooltip-wrapper').count(), 0, 'a floating tooltip never covers the donut');
    await page.getByRole('button', { name: 'Add widgets', exact: true }).focus();
    if (theme === 'light') {
      for (const id of ['netWorth', 'assetsTotal', 'liabilities']) assert.equal(await page.locator(`[data-home-widget="${id}"]`).count(), 0, 'personal removals stay removed');
      assert.match(await page.locator('[data-home-widget="aum"]').getAttribute('class'), /home-widget-wide/);
      const aum = await page.locator('[data-home-widget="aum"]').boundingBox(), cash = await page.locator('[data-home-widget="cash"]').boundingBox();
      if (width === 1440) {
        assert.ok(Math.abs(aum.y - cash.y) < 1 && Math.abs(aum.height - cash.height) < 1, 'AUM and cash share a balanced row');
      } else assert.ok(cash.y >= aum.y + aum.height && Math.abs(cash.width - aum.width) < 1, 'mobile summary cards fill the available width');
    }
    if (width === 1440) {
      for (const id of ['allocation', 'geography']) assert.ok((await page.locator(`[data-home-widget="${id}"]`).boundingBox()).height < 440, 'allocation and geography stay compact');
    }
    await page.waitForFunction(() => document.querySelector('[data-home-benchmark-return]')?.getAttribute('data-home-benchmark-return') !== '');
    const benchmarkBefore = Number(await page.locator('[data-home-benchmark-return]').getAttribute('data-home-benchmark-return'));
    await page.getByLabel('Indian benchmark', { exact: true }).selectOption('nifty-50');
    await page.waitForFunction(before => {
      const n = document.querySelector('[data-home-benchmark-return]')?.getAttribute('data-home-benchmark-return'); return n && Math.abs(Number(n) - before) > .01;
    }, benchmarkBefore);
    await page.getByRole('button', { name: 'Return calculation and coverage', exact: true }).first().click();
    await page.getByRole('dialog', { name: 'Return calculation and coverage', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close return coverage', exact: true }).click();
    assert.ok(await page.locator('[data-home-overview]').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Home has no page-level horizontal overflow');
    assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1), 'the global toolbar does not widen the mobile page');
    await page.locator('[data-home-overview]').screenshot({ path: path.join(out, `${theme}-${width}.png`) });
    if (theme === 'light' && width === 1440) {
      const downloadPromise = page.waitForEvent('download');
      await page.locator('[data-home-asset-table]').getByRole('button', { name: 'Export Excel', exact: true }).click();
      const download = await downloadPromise, file = path.join(out, 'assets.xlsx');
      await download.saveAs(file);
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file);
      const sheet = workbook.getWorksheet('Table');
      assert.ok(sheet.rowCount > 100, 'collapsed underlying assets are included in Excel');
      const total = sheet.getRows(1, sheet.rowCount).find(row => row.getCell(1).text === 'Total investment AUM');
      assert.ok(total && typeof total.getCell(2).value === 'number' && Math.abs(total.getCell(2).value - expected) < .01, 'Excel keeps exact numeric AUM instead of rounded crore labels');
    }
    if (width === 1440) {
      await page.getByRole('group', { name: 'Display currency', exact: true }).getByRole('button', { name: 'USD', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-home-aum]')?.textContent.includes('$'));
      assert.ok(Math.abs(Number(await page.locator('[data-home-aum]').getAttribute('data-home-aum')) - expected) < .01, 'display currency does not change base AUM');
      await page.getByRole('group', { name: 'Display currency', exact: true }).getByRole('button', { name: 'INR', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Add widgets', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.locator('[data-widget-catalog]').count(), 18, 'all personal-choice widgets remain available');
    await page.getByRole('searchbox', { name: 'Search widgets' }).fill('currency');
    assert.equal(await dialog.locator('[data-widget-catalog]').count(), 1);
    await dialog.locator('[data-widget-catalog="currency"]').hover();
    assert.equal(await dialog.locator('[data-widget-catalog="currency"]').getAttribute('title'), 'Not relevant for firm');
    await dialog.locator('[data-widget-catalog="currency"]').click();
    assert.equal(await dialog.getByRole('heading', { name: 'Currency Exposure', exact: true }).count(), 1);
    assert.equal(await dialog.locator('.home-widget-live-preview').count(), 1, 'click opens the detailed preview popup');
    await dialog.getByRole('button', { name: 'Add to Home', exact: true }).click();
    await page.locator('[data-home-widget="currency"]').waitFor();
    await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
    await page.getByRole('button', { name: 'Move Currency Exposure earlier' }).click();
    await page.getByRole('combobox', { name: 'Size of Currency Exposure', exact: true }).selectOption('full');
    assert.match(await page.locator('[data-home-widget="currency"]').getAttribute('class'), /home-widget-full/);
    const layout = await page.locator('[data-home-widget]').evaluateAll(els => els.map(el => el.dataset.homeWidget));
    assert.equal(layout.at(-2), 'currency', 'keyboard reorder moves the new widget');
    await page.reload();
    await page.locator('[data-home-widget="currency"]').waitFor();
    assert.deepEqual(await page.locator('[data-home-widget]').evaluateAll(els => els.map(el => el.dataset.homeWidget)), layout, 'layout persists across reload');
    await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Currency Exposure', exact: true }).click();
    assert.equal(await page.locator('[data-home-widget="currency"]').count(), 0);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    // Add every additional reference widget through its actual popup.
    for (const id of ['concentration', 'movements', 'monthly', 'vintage', 'volatility', 'sectors']) {
      await page.getByRole('button', { name: 'Add widgets', exact: true }).click();
      await page.getByRole('searchbox', { name: 'Search widgets' }).fill('');
      await dialog.locator(`[data-widget-catalog="${id}"]`).click();
      await dialog.getByRole('button', { name: 'Add to Home', exact: true }).click();
      await page.locator(`[data-home-widget="${id}"]`).waitFor();
    }
    await page.getByLabel('Home start date', { exact: true }).fill('2026-03-31');
    await page.getByLabel('Home end date', { exact: true }).fill('2026-06-30');
    await page.getByRole('button', { name: 'Apply Home dates', exact: true }).click();
    await page.waitForFunction(total => { const el = document.querySelector('[data-home-aum]'); return el && Math.abs(Number(el.dataset.homeAum) - total) > 1; }, expected);
    assert.match(await page.locator('[data-home-widget="aum"]').innerText(), /Recorded AUM/);
    assert.equal(await page.getByRole('row', { name: /July 2026/ }).count(), 0, 'monthly widget respects the end date');
    await page.getByRole('group', { name: 'Home date presets' }).getByRole('button', { name: 'FYTD', exact: true }).click();
    await page.waitForFunction(expected => Math.abs(Number(document.querySelector('[data-home-aum]')?.dataset.homeAum) - expected) < .01, expected);
    await page.getByRole('button', { name: 'Add widgets', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search widgets' }).fill('not-a-widget');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await dialog.isVisible(), false, 'Escape closes and releases focus');
    await page.goto(`${base}/home?members=${owner}`);
    await page.waitForFunction(expected => Math.abs(Number(document.querySelector('[data-home-aum]')?.dataset.homeAum) - expected) < .01, scopedTotal);
    await page.locator('[data-nav-entry="/cio"]').click();
    await page.locator('main h1').first().waitFor();
    await page.locator('[data-page-nav-home]').first().click();
    await page.locator('[data-home-overview]').waitFor();
    assert.ok(Math.abs(Number(await page.locator('[data-home-aum]').getAttribute('data-home-aum')) - scopedTotal) < .01, 'Home preserves member scope');
    assert.deepEqual(errors, []);
    results.push({ theme, width, total: expected, scopedTotal, classes: rows.length, widgets: layout.length });
    await context.close();
  }
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log('Home: AUM reconciliation, benchmark switch, dates, all widget previews/additions, layout size/order/persistence/removal, member scope and responsive themes passed:', results);
} catch (error) {
  await activePage?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  throw error;
} finally { await browser.close(); }
