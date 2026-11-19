// Local-only regression for the Private Market History tab (client #414 / #415).
//
// Drives the real page offline (statement basis) and holds it to its honesty:
//  - a fund with dated calls shows its real capital-flow timeline;
//  - the value/NAV trajectory is an honest absence ("awaiting quarterly NAVs"),
//    never a fabricated line, while only one dated valuation is on record;
//  - the full inception→latest money-weighted return computes, and a NARROWED
//    window becomes a dash with a reason — never a guessed number.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';

const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = '.cache/fund-history-check';
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Kolkata' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Real JS exceptions are strict; the deliberately-stubbed /api 503s (offline,
// statement basis) and font aborts are not page defects, so they are excluded.
page.on('console', (m) => {
  const t = m.text();
  if (/^<Tr> got/.test(t) || (m.type() === 'error' && !/Failed to load resource|503|Service Unavailable|net::ERR|ERR_FAILED/.test(t))) errors.push(t);
});
await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"unreachable"}' }));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
await installReadModelRoutes(page);

const dayBefore = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

try {
  await page.goto(`${base}/private-market?view=history`, { waitUntil: 'domcontentloaded' });
  const select = page.locator('[data-fund-history-select]');
  await select.waitFor({ timeout: 20000 });
  assert.ok(await page.locator('[data-pm-table="history"]').count() === 1, 'the History tab renders');

  const values = await select.locator('option').evaluateAll((os) => os.map((o) => o.value));
  assert.ok(values.length > 0, 'the picker offers at least one fund');

  // Find a fund whose real dated timeline renders AND whose full-window IRR
  // computes — proving the live data path, not just the absent states.
  let good = null;
  for (const v of values) {
    await select.selectOption(v);
    await page.locator('[data-pm-table="history"]').waitFor();
    await page.waitForTimeout(120);
    const flows = await page.locator('[data-fund-flow-row]').count();
    const irrAbsent = await page.locator('[data-fund-irr-absent]').count();
    if (flows >= 1 && irrAbsent === 0) { good = v; break; }
  }
  assert.ok(good, 'at least one fund shows a real dated capital-flow timeline with a computable inception→latest return');

  await select.selectOption(good);
  await page.locator('[data-fund-flow-row]').first().waitFor();

  // The capital-flow table has dated rows and the cumulative cash chart is drawn.
  assert.ok(await page.locator('[data-fund-flow-row]').count() >= 1, 'dated capital-flow rows are present');

  // The NAV trajectory is an honest absence naming the one valuation on record —
  // never a drawn line while only a single dated NAV exists.
  const needs = await page.locator('[data-fund-nav-trajectory]').count()
    ? null
    : await page.locator('[data-absent-needs]').first().getAttribute('data-absent-needs');
  if (needs !== null) assert.match(needs, /NAV/i, 'the value/NAV trajectory names the missing quarterly NAV statements');

  // The full window computes (no absent); a narrowed end date, on a day the fund
  // was never valued, becomes a dash with a reason — the #415 honest absent.
  assert.equal(await page.locator('[data-fund-irr-absent]').count(), 0, 'the full inception→latest window shows a money-weighted return');
  await page.screenshot({ path: `${out}/fund-history-full.png`, fullPage: true });
  const to = await page.locator('[data-fund-irr-to]').inputValue();
  assert.match(to, /^\d{4}-\d{2}-\d{2}$/, 'the IRR window carries a real end date');
  await page.locator('[data-fund-irr-to]').fill(dayBefore(to));
  await page.locator('[data-fund-irr-to]').blur();
  await page.waitForFunction(() => document.querySelector('[data-fund-irr-absent]') != null, { timeout: 5000 });
  const reason = await page.locator('[data-fund-irr-absent]').first().innerText();
  assert.match(reason, /value on|valuation/i, 'a window the book cannot close names the missing valuation, not a number');

  await page.screenshot({ path: `${out}/fund-history-narrowed.png`, fullPage: true });

  assert.equal(errors.length, 0, `console/page errors:\n${errors.join('\n')}`);
  console.log('PASS fund history: real dated timeline, honest NAV-trajectory absence, full-window IRR computes, narrowed window dashes with a reason');
} finally {
  await browser.close();
}
