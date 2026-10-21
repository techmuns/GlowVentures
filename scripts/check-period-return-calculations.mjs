// Local-only selection matrix. API calls are intercepted to keep test state private.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173';
const OUT = path.resolve(process.env.OUT ?? 'docs/page-check/period-return-calculations');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const clean = s => s.replace(/\s+/g, ' ').trim();
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
    await page.goto(`${BASE}/cio?tab=returns&rto=2026-10-05`);
    const card = page.locator('[data-returns-portfolio]');
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
        assert.equal(await card.locator('[data-returns-formula]').count(), 0, 'no formula on the card');
        const pct = card.locator('[data-returns-pct]');
        const shown = (await pct.getAttribute('data-returns-pct')) ? (await pct.innerText()).match(/[+-]?\d+\.\d+%/)[0] : '—';
        const measured = clean(await page.locator('[data-returns-measured]').innerText());
        const requested = clean(await page.locator('[data-returns-requested]').innerText());
        const coverage = clean(await page.locator('[data-returns-coverage]').innerText());
        const button = card.locator('[data-return-info]');
        await button.click();
        const dialog = page.locator('dialog[data-return-calculation]');
        assert.equal(clean(await dialog.locator('[data-return-result]').innerText()), shown, `${period}/${type} result matches`);
        const ctx = clean(await dialog.locator('[data-return-context]').innerText());
        assert.ok(ctx.includes(measured) && ctx.includes(requested) && ctx.includes(coverage), `${period}/${type} dates and coverage`);
        const steps = await dialog.locator('[data-return-steps] > li').allInnerTexts();
        assert.ok(steps.length >= 2 && steps.length <= 3, `${period}/${type} simple steps`);
        if (shown !== '—') assert.ok(steps.at(-1).includes(shown));
        const more = dialog.locator('[data-return-more]');
        assert.equal(await more.getAttribute('open'), null);
        assert.equal(await dialog.locator('[data-returns-formula]').isVisible(), false);
        await more.locator('summary').click();
        assert.equal(await dialog.locator('[data-returns-formula]').getAttribute('data-returns-formula'), type);
        assert.ok(await dialog.locator('[data-returns-formula]').isVisible());
        assert.ok(await dialog.evaluate(el => {
          const box = el.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && el.scrollWidth <= el.clientWidth + 1;
        }), `${period}/${type} popup fits the viewport`);
        const excluded = Number(await page.locator('[data-returns-coverage]').getAttribute('data-returns-excluded'));
        assert.equal(await dialog.locator('[data-return-excluded] > ul > li').count(), excluded);
        if (excluded && shown !== '—') assert.ok(await card.locator('[data-returns-partial]').isVisible());
        if (period === 'fytd' && type === 'cagr') {
          assert.equal(shown, '—');
          assert.match(await card.locator('[data-returns-unavailable]').innerText(), /Needs at least 1 year/);
          assert.match(steps.join(' '), /This app shows it only.*365 days/);
        }
        await more.locator('summary').click();
        if (period === 'fytd' && type === 'absolute' || period === 'ytd' && type === 'absolute') {
          await dialog.screenshot({ path: path.join(OUT, `${period}-${type}-${theme}-${width}.png`) });
        }
        await page.keyboard.press('Escape');
        assert.equal(await dialog.count(), 0);
        assert.ok(await button.evaluate(el => document.activeElement === el));
      }
    }
    // A changed custom date must change the popup's context too.
    await select.selectOption('absolute');
    await page.locator('[data-returns-from]').fill('2026-04-01');
    await card.locator('[data-return-info]').click();
    assert.match(await page.locator('[data-return-context]').innerText(), /1 Apr 2026/);
    await page.keyboard.press('Escape');
    // Invalid date ordering keeps the explanation available without inventing a return.
    await page.locator('[data-returns-from]').fill('2026-08-01');
    await card.locator('[data-return-info]').click();
    assert.equal(await page.locator('[data-return-result]').innerText(), '—');
    assert.match(await page.locator('[data-return-steps]').innerText(), /opening date.*before/);
    await page.keyboard.press('Escape');
    await page.goto(`${BASE}/cio?tab=returns&rtype=twr&rto=2026-10-05`);
    assert.equal(await select.inputValue(), 'xirr', 'retired return URLs fall back to XIRR');
    await card.locator('[data-return-info]').click();
    await page.locator('[data-return-more] summary').click();
    assert.doesNotMatch(await page.locator('[data-return-calculation]').innerText(), /time.weighted/i);
    await page.keyboard.press('Escape');
    await page.goto(`${BASE}/performance`);
    await page.getByRole('heading', {name: 'NAV & Performance', exact: true}).waitFor();
    assert.doesNotMatch(await page.locator('main').innerText(), /time.weighted/i);
    assert.equal(await page.locator('[data-xa="twrr-block"], [data-xa="twrr-cell"]').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${theme} ${width}px: all 24 method/period selections, custom date changes and unavailable states passed`);
    await context.close();
  }
} finally { await browser.close(); }
