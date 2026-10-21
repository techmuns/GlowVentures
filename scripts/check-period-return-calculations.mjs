// Local-only selection matrix for the Returns toolbar and benchmark comparison.
// API calls are intercepted to keep test state private. Run through codex-heavy-run.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(BASE).hostname), 'local environment required');
const OUT = path.resolve(process.env.OUT ?? '.cache/period-return-controls');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const periods = ['fytd', 'mtd', 'ytd', 'y1', 'y2', 'y3', 'inception', 'custom'];
const types = ['xirr', 'absolute', 'cagr'];
try {
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(theme => localStorage.setItem('glow:theme', theme), theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"NOT_CONFIGURED"}' }));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await page.goto(`${BASE}/cio?tab=returns&rview=benchmarks&rto=2026-10-05`);
    const panel = page.locator('[data-returns-benchmarks]');
    const portfolio = panel.locator('[data-returns-bench-portfolio]');
    const select = page.locator('[data-returns-type-select]');
    await select.waitFor();
    assert.deepEqual(await select.locator('option').evaluateAll(options => options.map(o => o.value)), types);
    assert.doesNotMatch(await page.locator('[data-portfolio-returns]').innerText(), /time.weighted/i);
    for (const period of periods) {
      await page.locator(`[data-returns-period="${period}"]`).click();
      if (period === 'custom') {
        await page.locator('[data-returns-from]').fill('2026-06-30');
        await page.locator('[data-returns-to]').fill('2026-07-31');
      }
      for (const type of types) {
        await select.selectOption(type);
        assert.equal(await page.locator('[data-returns-portfolio]').count(), 0, 'portfolio summary stays removed');
        assert.equal(await panel.isVisible(), true, 'changing the period or type retains the subtab');
        assert.equal(await page.locator('[data-returns-panel="attribution"]').isVisible(), false);
        const pct = await portfolio.getAttribute('data-returns-pct');
        const excluded = Number(await portfolio.getAttribute('data-returns-excluded'));
        if (excluded > 0) {
          assert.equal(pct, '', 'no partial portfolio return');
          assert.ok((await panel.locator('[data-returns-bench]').evaluateAll(rows => rows.map(r => r.getAttribute('data-bench-gap')))).every(gap => gap === ''), 'no gap without a whole-portfolio return');
        }
        if (pct) {
          const from = await panel.getAttribute('data-measured-from');
          const to = await panel.getAttribute('data-measured-to');
          const days = Number(await panel.getAttribute('data-measured-days'));
          assert.ok(from < to && days > 0, 'measured window is ordered');
          if (days < 365) assert.notEqual(await portfolio.getAttribute('data-returns-basis'), 'annual', 'short windows are never annualised');
        }
        assert.match(await portfolio.innerText(), new RegExp(`Portfolio · ${type === 'absolute' ? 'Absolute return' : type === 'cagr' ? 'CAGR' : 'XIRR'}`));
      }
    }
    await page.locator('[data-returns-from]').fill('2026-08-01');
    assert.equal(await portfolio.getAttribute('data-returns-pct'), '', 'invalid date order invents no return');
    await page.goto(`${BASE}/cio?tab=returns&rview=benchmarks&rtype=twr&rto=2026-10-05`);
    assert.equal(await select.inputValue(), 'xirr', 'retired return URLs fall back to XIRR');
    await page.getByRole('tab', { name: 'Return attribution', exact: true }).click();
    assert.equal(await panel.isVisible(), false);
    assert.equal(await page.locator('[data-returns-panel="attribution"]').isVisible(), true);
    assert.equal(await page.locator('[data-returns-portfolio]').count(), 0);
    await page.screenshot({ path: path.join(OUT, `attribution-${theme}-${width}.png`) });
    await page.goto(`${BASE}/performance`);
    await page.getByRole('heading', { name: 'NAV & Performance', exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('main').innerText(), /time.weighted/i);
    assert.equal(await page.locator('[data-xa="twrr-block"], [data-xa="twrr-cell"]').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${theme} ${width}px: all 24 method/period selections, missing coverage, invalid dates and subtab visibility passed`);
    await context.close();
  }
} finally { await browser.close(); }
