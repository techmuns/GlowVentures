// Run against a local build: npm run build && npm run preview, then
// CHROME='/path/to/chrome' node scripts/check-return-calculations.mjs
// All API calls are intercepted; selecting a tile cannot write a shared layout.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173';
const OUT = path.resolve(process.env.OUT ?? 'docs/page-check/return-calculations');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const number = text => Number(text.replace(/[^0-9.+-]/g, ''));
const normalise = text => text.replace(/\s+/g, ' ').trim();

// Independently grow each displayed cash flow forward to the last date and
// find the rate at which they balance. This checks that the popup exposes the
// actual inputs behind the card, including each account's own closing date.
function returnFromDisplayedFlows(rows, annualised) {
  const flows = rows.map(([date, amount]) => ({ date: Date.parse(date), amount: number(amount) }));
  const first = Math.min(...flows.map(f => f.date)), last = Math.max(...flows.map(f => f.date));
  const balance = rate => flows.reduce((n, f) => n + f.amount * (1 + rate) ** ((last - f.date) / (365 * 864e5)), 0);
  let low = -0.9999, high = 100;
  assert.ok(balance(low) * balance(high) < 0, 'displayed cash flows must bracket a return');
  for (let i = 0; i < 150; i++) {
    const middle = (low + high) / 2;
    if (balance(low) * balance(middle) <= 0) high = middle; else low = middle;
  }
  const yearly = (low + high) / 2;
  return { pct: annualised ? yearly * 100 : ((1 + yearly) ** ((last - first) / (365 * 864e5)) - 1) * 100, yearly, first };
}

try {
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(theme => localStorage.setItem('glow:theme', theme), theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"NOT_CONFIGURED"}' }));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    for (const id of ['mwr', 'return', 'gain', 'annualised', 'fytd', 'ytd']) {
      await page.goto(`${BASE}/cio?tiles=${id},value`);
      const tile = page.locator(`[data-tile-slot="${id}"]`);
      const button = tile.locator('[data-return-info]');
      await button.waitFor();
      assert.equal(await page.locator('[data-tile-slot="value"] [data-return-info]').count(), 0);
      const shown = id === 'gain'
        ? (await tile.locator('[data-kpi-second]').innerText()).match(/[+-]?[\d.]+%/)?.[0] ?? '—'
        : normalise(await tile.locator('[data-kpi-value]').innerText());
      const url = page.url();
      await button.click();
      const dialog = page.getByRole('dialog');
      assert.equal(normalise(await dialog.locator('[data-return-result]').innerText()), shown, `${id}: same result as card`);
      assert.equal(page.url(), url, 'info must not follow the card link');
      assert.equal(await dialog.locator('[data-return-formula]').count(), 1, 'each return explains its formula');
      assert.equal(await dialog.locator('[data-return-formula]').isVisible(), false, 'detailed formula is hidden initially');
      const steps = dialog.locator('[data-return-steps] > li');
      assert.equal(await steps.count(), shown === '—' && !['return', 'gain'].includes(id) ? 2 : 3, 'default view contains only two or three steps');
      assert.ok((await dialog.locator('[data-return-steps]').innerText()).split(/\s+/).length < 70, 'steps stay short');
      if (shown !== '—') assert.ok((await steps.last().innerText()).includes(shown.replace(/\s*p\.a\.$/, '')), 'last step repeats the final return');
      assert.doesNotMatch(await dialog.innerText(), /FIFO|XIRR\(|\^/, 'technical working is kept under Show more');
      assert.ok(await dialog.evaluate(el => {
        const box = el.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && el.scrollWidth <= el.clientWidth + 1;
      }), `${id}: dialog fits the viewport without horizontal scrolling`);
      await dialog.getByText('Show more', { exact: true }).click();
      assert.equal(await dialog.locator('[data-return-formula]').isVisible(), true, 'Show more reveals the formula');
      if (id === 'return' || id === 'gain') {
        const [gain, capital] = await dialog.locator('dd').allTextContents();
        assert.equal((number(gain) / number(capital) * 100).toFixed(1), number(shown).toFixed(1), 'visible amounts reproduce the capital return');
      }
      if (id === 'mwr') {
        const rows = await dialog.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent)));
        assert.ok(rows.length > 2, 'dated account flows are exposed');
        const annualised = (await dialog.locator('[data-return-formula]').innerText()).includes('Yearly return =');
        const calculated = returnFromDisplayedFlows(rows, annualised);
        assert.equal(calculated.pct.toFixed(1), number(shown).toFixed(1), 'visible dated amounts reproduce money-weighted return');
        const balanced = await dialog.locator('[data-return-date-balance] dd').allTextContents();
        const discountedIn = rows.reduce((n, [date, amount]) => n + Math.max(-number(amount), 0) / (1 + calculated.yearly) ** ((Date.parse(date) - calculated.first) / (365 * 864e5)), 0);
        assert.ok(Math.abs(number(balanced[0]) - discountedIn) < 0.02, 'timing step uses actual dated cash flows');
        assert.ok(Math.abs(number(balanced[0]) - number(balanced[1])) < 0.02, 'the trial rate balances both sides');
        const conversion = await dialog.locator('[data-return-conversion]').innerText();
        const factors = annualised
          ? conversion.match(/Yearly growth: 1 \+ ([\d.+-]+) ÷ 100 = (\d+\.\d+)/)
          : conversion.match(/-day growth: (\d+\.\d+)\((\d+)\/365\) = (\d+\.\d+)/);
        assert.ok(factors, 'numeric conversion is visible in the short steps');
        const grown = annualised ? 1 + number(factors[1]) / 100 : Number(factors[1]) ** (Number(factors[2]) / 365);
        const shownFactor = annualised ? factors[2] : factors[3];
        assert.equal(grown.toFixed(6), shownFactor, 'shown yearly-to-period calculation is reproducible');
        assert.equal(((Number(shownFactor) - 1) * 100).toFixed(1), number(shown).toFixed(1), 'shown growth factor leads to the exact card percentage');
      }
      if (shown === '—') assert.match(await dialog.innerText(), /need|missing|history/i);
      await dialog.getByText('Show more', { exact: true }).click();
      assert.equal(await dialog.locator('[data-return-formula]').isVisible(), false, 'Show more can be collapsed again');
      if (id === 'mwr' || id === 'return') await page.screenshot({ path: path.join(OUT, `${theme}-${width}-${id}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0, 'Escape closes the popup');
      assert.equal(await button.evaluate(el => el === document.activeElement), true, 'focus returns to the info button');
      await button.press('Enter');
      await page.getByLabel('Close return calculation').waitFor();
      await page.keyboard.press('Shift+Tab');
      assert.ok(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement)), 'keyboard focus stays inside the modal');
      await page.getByLabel('Close return calculation').click();
      await button.click();
      await page.mouse.click(2, 2);
      assert.equal(await page.getByRole('dialog').count(), 0, 'backdrop click closes the popup');
      assert.equal(page.url(), url);
    }
    // Changing the metric creates the right explanation and removes it when
    // the selected metric is no longer a return.
    await page.goto(`${BASE}/cio?tiles=value,positions`);
    await page.locator('[data-tile-select="0"]').click();
    await page.locator('[data-tile-option="return"]').click();
    await page.locator('[data-tile-slot="return"] [data-return-info]').click();
    assert.equal(await page.getByRole('dialog').locator('h2').innerText(), 'Consolidated return');
    await page.keyboard.press('Escape');
    await page.locator('[data-tile-select="0"]').click();
    await page.locator('[data-tile-option="value"]').click();
    assert.equal(await page.locator('[data-return-info]').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${theme}/${width}: simple steps, Show more, matching returns, independent arithmetic, picker and keyboard controls`);
    await context.close();
  }
} finally {
  await browser.close();
}
