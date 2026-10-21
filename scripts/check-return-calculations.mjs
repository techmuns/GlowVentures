// Local browser verification of the current coverage dialogs and retired card.
// Arithmetic/dated-flow fixtures live in test:family; selected-period browser
// arithmetic is checked by scripts/dev/check-selected-attribution.mjs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './dev/read-model-api.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(BASE).hostname));
const OUT = path.resolve(process.env.OUT ?? '.cache/return-calculations');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const normalise = text => text.replace(/\s+/g, ' ').trim();
try {
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(theme => localStorage.setItem('glow:theme', theme), theme);
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-10-22T06:30:00Z') });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ status: 503, json: { code: 'NOT_CONFIGURED' } }));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await installReadModelRoutes(page);
    for (const id of ['return', 'gain', 'annualised', 'fytd', 'ytd']) {
      await page.goto(`${BASE}/cio?tiles=${id},value`);
      const tile = page.locator(`[data-tile-slot="${id}"]`);
      const button = tile.locator('[data-return-info]');
      await button.waitFor();
      const shown = normalise(await tile.locator('[data-kpi-value]').innerText());
      const url = page.url();
      await button.click();
      const dialog = page.getByRole('dialog');
      assert.equal(normalise(await dialog.locator('[data-return-result]').innerText()), shown, `${id}: same figure as card`);
      assert.match(await dialog.innerText(), /Based on the available records|No account has enough information/);
      assert.match(await dialog.innerText(), /What is missing/);
      assert.equal(await dialog.locator('[data-attribution-coverage]').count(), 1);
      assert.ok(await dialog.evaluate(el => {
        const box = el.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
      }), `${id}: dialog fits viewport`);
      assert.equal(await dialog.locator('[data-attribution-included]').getAttribute('open'), null);
      await dialog.locator('[data-attribution-included] summary').click();
      assert.ok(await dialog.locator('[data-attribution-included] li').count() > 0);
      assert.equal(page.url(), url, 'info does not follow the card link');
      if (id === 'annualised' || id === 'return') await page.screenshot({ path: path.join(OUT, `${theme}-${width}-${id}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0);
      assert.equal(await button.evaluate(el => el === document.activeElement), true);
      await button.press('Enter');
      await page.getByLabel('Close return calculation').waitFor();
      await page.keyboard.press('Shift+Tab');
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'focus stays in modal');
      await page.getByLabel('Close return calculation').click();
      await button.click();
      await page.mouse.click(2, 2);
      assert.equal(await dialog.count(), 0);
      assert.equal(page.url(), url);
    }
    await page.goto(`${BASE}/cio?tiles=mwr`);
    await page.locator('[data-tile-slot="fytd"]').waitFor();
    assert.equal(await page.locator('[data-tile-slot="mwr"]').count(), 0);
    assert.deepEqual(await page.locator('[data-tile-slot]').evaluateAll(els => els.map(el => el.dataset.tileSlot)), ['value', 'gain', 'annualised', 'fytd']);
    assert.deepEqual(errors, []);
    console.log(`PASS ${theme}/${width}: coverage dialogs, matching figures, keyboard controls and retired-card fallback`);
    await context.close();
  }
} finally { await browser.close(); }
