// Actual toolbar interactions against a local/staging build; never a production test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';
import { GICS_SECTORS, UNCLASSIFIED } from '../../shared/sectors.mjs';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = '.cache/returns-period';
await fs.mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `export * from './src/data/glowData'; export * from './src/lib/periodReturns'; export { nothingToMeasure } from './src/lib/returns';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'error' });
const b = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const statement = { accounts: b.BOOK_ACCOUNTS, positions: b.BOOK_POSITIONS, accountReturnRecords: b.BOOK_ACCOUNT_RETURN_RECORDS, privateMarkets: {} };
const inputs = b.accountInputs({ accounts: b.BOOK_ACCOUNTS, positions: b.BOOK_POSITIONS, returnRecords: b.BOOK_ACCOUNT_RETURN_RECORDS, navHistory: b.BOOK_ACCOUNT_NAV_HISTORY,
 cashFlows: b.BOOK_ACCOUNT_CASH_FLOWS, groups: [], coverage: b.BOOK_NAV_COVERAGE.covered, undated: b.BOOK_UNDATED_CAPITAL, fromInception: b.BOOK_CAPITAL_FROM_INCEPTION, labelOf: a => a.provider })
 .map(i => ({ ...i, outside: b.nothingToMeasure(statement, b.BOOK_ACCOUNTS.find(a => a.accountId === i.accountId)) }));
const end = '2026-10-22'; // Toolbar defaults to today; account measures retain their own verified closes.
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let page;
try {
 page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 await page.clock.install({ time: new Date('2026-10-22T06:30:00Z') });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('**/api/**', r => r.fulfill({ status: 503, json: { status: 'unreachable' } }));
 await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
 await installReadModelRoutes(page);
 await page.goto(base + '/cio?tab=returns');
 const table = page.locator('[data-segment-returns]');
 await table.waitFor();
 // Headline cards show their covered subset and open the same simple source explanation.
 for (const id of ['gain', 'annualised', 'fytd']) {
  const card = page.locator(`[data-tile-slot="${id}"]`);
  await card.locator('[data-card-coverage]').waitFor();
  const numeric = await card.locator('[data-card-coverage]').evaluate(el => ({ ...el.dataset }));
  assert.notEqual(numeric.cardGain, ''); assert.notEqual(numeric.cardReturn, '');
  assert.match(await card.innerText(), /Available data/);
  assert.equal(await card.locator('[data-return-info]').count(), 1);
  await card.locator('[data-return-info]').click();
  const popup = page.getByRole('dialog'); await popup.waitFor();
  assert.match(await popup.innerText(), /Based on the available records/);
  assert.match(await popup.innerText(), /What is missing/);
  assert.ok(await popup.locator('[data-return-gap]').count() > 0);
  assert.equal(await popup.locator('[data-attribution-method]').getAttribute('open'), null);
  const firstGap = popup.locator('[data-return-gap]').first();
  assert.ok(await firstGap.locator('[data-return-gap-reason]').isVisible(), 'missing inputs are shown immediately');
  await firstGap.locator('summary').click();
  assert.match(await firstGap.innerText(), /account .*statement/i);
  await firstGap.locator('summary').click();
  assert.match(await popup.innerText(), /purchase|opening|dated|money/i);
  if (id === 'gain') {
   assert.equal(await popup.locator('[data-return-result]').innerText(), await card.locator('[data-kpi-value]').innerText());
   await page.screenshot({ path: `${out}/headline-gain-info.png` });
  }
  await page.keyboard.press('Escape');
  assert.equal(await card.locator('[data-return-info]').evaluate(el => el === document.activeElement), true);
 }
 const historyCard = page.locator('[data-tile-slot="annualised"]');
 assert.match(await historyCard.innerText(), /Return over available history/i);
 assert.match(await historyCard.innerText(), /not annualised/);
 const fytdCard = page.locator('[data-tile-slot="fytd"] [data-card-coverage]');
 assert.ok(Math.abs(Number(await fytdCard.getAttribute('data-card-gain')) - Number(await table.getAttribute('data-seg-total-gain'))) < .001);
 // FYTD is under a year: the card and the tab's XIRR are both the absolute return, never a rate per year (Stage 10hk).
 assert.ok(Math.abs(Number(await fytdCard.getAttribute('data-card-return')) - Number(await table.getAttribute('data-seg-total-period-ret'))) < 1e-8);
 assert.ok(Math.abs(Number(await table.getAttribute('data-seg-total-ret')) - Number(await fytdCard.getAttribute('data-card-return'))) < 1e-8, 'under a year the XIRR shown is the absolute return');
 await page.screenshot({ path: `${out}/headline-cards.png` });
 // Saved choices use the same covered inputs as the default cards.
 for (const id of ['return']) {
  await page.locator('[data-tile-select="2"]').click();
  await page.locator(`[data-tile-option="${id}"]`).click();
  const card = page.locator(`[data-tile-slot="${id}"]`);
  const data = card.locator('[data-card-coverage]'); await data.waitFor();
  assert.notEqual(await data.getAttribute('data-card-return'), '');
  await card.locator('[data-return-info]').click();
  assert.match(await page.getByRole('dialog').innerText(), /What is missing/);
  await page.keyboard.press('Escape');
 }
 await page.locator('[data-tile-select="2"]').click();
 await page.locator('[data-tile-option="annualised"]').click();
 const results = [];
 for (const period of ['fytd', 'mtd', 'ytd', 'y1', 'y2', 'y3']) {
  await page.locator(`[data-returns-period="${period}"]`).click();
  const start = b.periodStart(period, end), win = b.windowReturns(inputs, start, end);
  for (const type of ['xirr', 'absolute', 'cagr']) {
   const measured = b.measureWindow(win.included, type, String);
   const effectiveType = measured.shownAs ?? type;
   await page.locator('[data-returns-type-select]').selectOption(type);
   await page.waitForFunction(({ period, type }) => { const el = document.querySelector('[data-segment-returns]'); return el?.dataset.segPeriod === period && el?.dataset.segType === type; }, { period, type: effectiveType });
   assert.equal(await page.locator('[data-returns-type-select]').inputValue(), effectiveType, 'picker names the displayed measure');
   const expectedGain = win.included.length ? win.gain : null;
   const expectedReturn = measured.shown ? measured.pct : null;
   const rawGain = await table.getAttribute('data-seg-total-gain'), rawReturn = await table.getAttribute('data-seg-total-ret');
   assert.ok(expectedGain == null ? rawGain === '' : rawGain !== '' && Math.abs(Number(rawGain) - expectedGain) < 0.001, `${period}/${type} gain: ${rawGain} vs ${expectedGain}`);
   // Chromium and Node can round the XIRR root a few binary digits apart.
   assert.ok(expectedReturn == null ? rawReturn === '' : rawReturn !== '' && Math.abs(Number(rawReturn) - expectedReturn) < 1e-8, `${period}/${type} return: ${rawReturn} vs ${expectedReturn}`);
   assert.equal(await table.getAttribute('data-seg-start'), start);
   // The capital bridge is the total's own figure, and start + added − taken out + gain = end.
   const bridge = page.locator('[data-capital-bridge]'), bd = await bridge.evaluate(el => ({ ...el.dataset }));
   if (expectedGain == null) assert.equal(bd.bridgeMode, '');
   else {
    assert.ok(Math.abs(Number(bd.bridgeGain) - expectedGain) < 0.001, `${period}/${type} bridge gain ${bd.bridgeGain}`);
    assert.ok(Math.abs(Number(bd.bridgeOpening) + Number(bd.bridgeAdded) - Number(bd.bridgeTaken) + Number(bd.bridgeGain) - Number(bd.bridgeClosing)) < 0.01);
    const part = k => bd[k] === '' ? 0 : Number(bd[k]);
    assert.ok(Math.abs(part('bridgeRealised') + part('bridgeUnrealised') + part('bridgeIncome') - part('bridgeCharges') + Number(bd.bridgeUnsplit) - Number(bd.bridgeGain)) < 0.01);
   }
   results.push({ period, type, gain: rawGain, return: rawReturn });
  }
  // Under a year XIRR and CAGR are the absolute return; from a year XIRR is per year (Stage 10hk).
  const byType = results.filter(r => r.period === period && r.return !== '');
  const x = byType.find(r => r.type === 'xirr'), a = byType.find(r => r.type === 'absolute'), c = byType.find(r => r.type === 'cagr');
  const underYear = b.measureWindow(win.included, 'xirr', String).shownAs === 'absolute';
  if (x && a && underYear) assert.ok(Math.abs(Number(x.return) - Number(a.return)) < 1e-8 && (!c || Math.abs(Number(c.return) - Number(a.return)) < 1e-8), `${period}: XIRR ${x.return} and CAGR ${c?.return} are Absolute ${a.return} under a year`);
  if (x && a && !underYear) assert.ok(Math.abs(Number(x.return) - Number(a.return)) > 0.01, `${period}: XIRR ${x.return} vs Absolute ${a.return}`);
 }
 // FYTD's bridge splits most accounts' gain from their own records and names the rest.
 await page.locator('[data-returns-period="fytd"]').click();
 await page.locator('[data-returns-type-select]').selectOption('xirr');
 await page.waitForFunction(() => document.querySelector('[data-segment-returns]')?.dataset.segPeriod === 'fytd');
 const bridge = page.locator('[data-capital-bridge]');
 assert.equal(await bridge.getAttribute('data-bridge-mode'), 'window');
 await page.waitForFunction(() => document.querySelector('[data-returns-type-select]')?.value === 'absolute');
 assert.match(await bridge.locator('[data-bridge-return-label]').innerText(), /Absolute return/);
 assert.equal(await bridge.locator('[data-bridge-split]').getAttribute('open'), null, 'gain breakdown starts collapsed');
 const boxes = await page.locator('[data-return-summary-cards] > .card').evaluateAll(els => els.map(el => {
  const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, top: r.top };
 }));
 assert.equal(boxes.length, 2);
 assert.ok(Math.abs(boxes[0].width - boxes[1].width) < 1 && Math.abs(boxes[0].height - boxes[1].height) < 1 && boxes[0].top === boxes[1].top, 'two equal-sized summary blocks');
 assert.equal(await page.locator('[data-market-summary] details, [data-market-summary] [role="progressbar"]').count(), 0);
 assert.match(await page.locator('[data-market-coverage]').innerText(), /holdings · .* covered/);
 await bridge.locator('[data-bridge-split] summary').click();
 assert.ok(await bridge.locator('[data-bridge-part="realised"]').isVisible());
 await bridge.locator('[data-bridge-split] summary').click();
 assert.ok(Number(await bridge.getAttribute('data-bridge-split-accounts')) >= 10);
 await bridge.locator('[data-bridge-accounts-table] summary').click();
 assert.equal(await bridge.locator('tr[data-bridge-row]').count(), Number(await bridge.getAttribute('data-bridge-accounts')));
 await bridge.getByRole('button', { name: 'What is included in the capital bridge?', exact: true }).click();
 const bridgeDialog = page.getByRole('dialog'); await bridgeDialog.waitFor();
 assert.match(await bridgeDialog.innerText(), /Statement's own profit and loss/); assert.match(await bridgeDialog.innerText(), /Fund's dated unit record/);
 await page.screenshot({ path: `${out}/capital-bridge.png` });
 await page.keyboard.press('Escape');
 await page.locator('[data-returns-period="fytd"]').click();
 await page.locator('[data-returns-type-select]').selectOption('xirr');
 const total = table.locator('[data-seg-total]');
 assert.equal(await total.locator('[data-return-info]').count(), 3);
 await total.getByRole('button', { name: 'What is included in total return?', exact: true }).click();
 const dialog = page.getByRole('dialog'); await dialog.waitFor();
 assert.match(await dialog.innerText(), /Based on the available records for 17 accounts only/);
 assert.match(await dialog.innerText(), /What is missing/);
 assert.ok(await dialog.locator('[data-return-gap]').count() > 0);
 assert.match(await dialog.innerText(), /We need/);
 await page.screenshot({ path: `${out}/desktop-info.png` });
 await page.keyboard.press('Escape');
 await total.getByRole('button', { name: 'What is included in total gain?', exact: true }).click();
 await dialog.waitFor(); await dialog.locator('[data-attribution-method] summary').click(); assert.match(await dialog.innerText(), /money added and taken out/); await page.keyboard.press('Escape');
 // Regrouping cannot change the measured pool; source-only returns get a named row.
 const gain = await table.getAttribute('data-seg-total-gain');
 // The Sector axis is Sector Composition's own sectors (Stage 10gs): Consolidated and
 // Direct Equity, every row a GICS sector, each opening into its contributors.
 await table.locator('[data-seg-axis-option="sector"]').click();
 const sectors = page.locator('[data-sector-attribution]');
 await page.waitForFunction(() => document.querySelector('[data-sector-attribution]')?.dataset.status === 'ready');
 assert.deepEqual(await sectors.locator('[data-sector-set-option]').evaluateAll(els => els.map(el => el.dataset.sectorSetOption)), ['consolidated', 'direct']);
 assert.equal(await table.locator('tr[data-seg-row]').count(), 0);
 for (const set of ['direct', 'consolidated']) {
  await sectors.locator(`[data-sector-set-option="${set}"]`).click();
  await page.waitForFunction(set => document.querySelector('[data-sector-attribution]')?.dataset.sectorSet === set, set);
  const keys = await sectors.locator('tr[data-sa-row]').evaluateAll(els => els.map(el => el.dataset.saRow));
  assert.ok(keys.length > 0 && keys.every(k => [...GICS_SECTORS, UNCLASSIFIED].includes(k)), `${set}: ${keys.join()}`);
  const first = await sectors.locator('tr[data-sa-row]').first().getAttribute('data-sa-row');
  if (await sectors.locator('tr[data-sa-row]').first().getAttribute('data-sa-open') !== '1') await sectors.locator('[data-sa-toggle]').first().click();
  assert.ok(await sectors.locator(`tr[data-sa-child="${first}"]`).count() > 0, `${set}: ${first} opens into its contributors`);
  await page.screenshot({ path: `${out}/sector-attribution-${set}.png` });
 }
 await table.locator('[data-seg-axis-option="security"]').click();
 await page.waitForFunction(() => document.querySelector('[data-segment-returns]')?.dataset.segAxis === 'security');
 assert.equal(await table.getAttribute('data-seg-total-gain'), gain);
 assert.equal(await table.locator('tr[data-seg-row="__account_returns"]').count(), 1);
 await page.locator('[data-returns-period="inception"]').click();
 await page.locator('[data-returns-type-select]').selectOption('absolute');
 await page.waitForFunction(() => document.querySelector('[data-segment-returns]')?.dataset.segType === 'absolute');
 assert.notEqual(await table.getAttribute('data-seg-total-gain'), '');
 assert.notEqual(await table.getAttribute('data-seg-total-ret'), '');
 assert.equal(await page.locator('[data-returns-from]').isDisabled(), true); // Since-investment dates are deliberately locked.
 await page.screenshot({ path: `${out}/desktop-table.png` });
 // Invalid custom dates must clear the old numbers.
 await page.locator('[data-returns-period="custom"]').click();
 await page.locator('[data-returns-from]').fill('2030-01-01');
 await page.locator('[data-returns-from]').blur();
 await page.waitForFunction(() => document.querySelector('[data-segment-returns]')?.dataset.segStart === '2030-01-01');
 assert.equal(await table.getAttribute('data-seg-total-gain'), '');
 await page.locator('[data-returns-period="fytd"]').click();
 await page.setViewportSize({ width: 390, height: 844 });
 await total.getByRole('button', { name: 'What is included in total return?', exact: true }).click();
 await dialog.waitFor();
 assert.ok(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth+1 && r.top >= 0 && r.bottom <= innerHeight+1 && el.scrollWidth <= el.clientWidth+1; }));
 await page.screenshot({ path: `${out}/mobile-info.png` });
 await page.keyboard.press('Escape');
 // Retired metrics cannot return through a picker, an old link or a saved layout.
 await page.setViewportSize({ width: 1440, height: 1000 });
 await page.goto(base + '/cio?tab=returns&tiles=value,gain,fytd,mwr');
 await page.locator('[data-tile-slot="fytd"]').waitFor();
 assert.deepEqual(await page.locator('[data-tile-slot]').evaluateAll(els => els.map(el => el.dataset.tileSlot)), ['value', 'gain', 'fytd']);
 await page.locator('[data-tile-select]').first().click();
 assert.equal(await page.locator('[data-tile-option="mwr"]').count(), 0);
 assert.doesNotMatch(await page.locator('[data-tile-menu]').innerText(), /money.weighted/i);
 await page.keyboard.press('Escape');
 await page.locator('[data-tile-add]').click();
 assert.equal(await page.locator('[data-tile-add-option="mwr"]').count(), 0);
 assert.doesNotMatch(await page.locator('[data-tile-add-menu]').innerText(), /money.weighted/i);
 await page.keyboard.press('Escape');
 for (const source of ['local', 'shared']) {
  for (const ids of [['value', 'mwr', 'gain'], ['mwr']]) {
   const context = await browser.newContext();
   try {
    const saved = await context.newPage();
    saved.on('pageerror', e => errors.push(e.message));
    await saved.route('**/api/**', r => r.fulfill({ status: 503, json: { status: 'unreachable' } }));
    await saved.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await installReadModelRoutes(saved);
    if (source === 'local') await saved.addInitScript(ids => localStorage.setItem('glow:cioTiles:v1', JSON.stringify({ ids, synced: true })), ids);
    else await saved.route('**/api/tile-sets', r => r.fulfill({ json: { ok: true, sets: { cio: { ids } } } }));
    await saved.goto(base + '/cio?tab=returns');
    await saved.locator('[data-segment-returns]').waitFor();
    const expected = ids.length === 1 ? ['value', 'gain', 'annualised', 'fytd'] : ['value', 'gain'];
    await saved.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-tile-slot]')].map(el => el.dataset.tileSlot)) === JSON.stringify(expected), expected);
    assert.equal(await saved.locator('[data-tile-slot="mwr"]').count(), 0);
    await saved.goto(base + '/cio?tab=returns&tiles=mwr');
    await saved.locator('[data-segment-returns]').waitFor();
    assert.deepEqual(await saved.locator('[data-tile-slot]').evaluateAll(els => els.map(el => el.dataset.tileSlot)), ['value', 'gain', 'annualised', 'fytd']);
   } finally { await context.close(); }
  }
 }
 for (const scenario of [
  { local: { ids: ['mwr'], synced: false }, shared: ['value', 'gain'], expected: ['value', 'gain', 'annualised', 'fytd'] },
  { local: { ids: ['value', 'gain'], synced: true }, shared: ['mwr'], expected: ['value', 'gain', 'annualised', 'fytd'] },
  { local: { ids: ['mwr'], synced: true }, shared: ['value', 'gain'], expected: ['value', 'gain'] },
 ]) {
  const context = await browser.newContext();
  try {
   const saved = await context.newPage();
   saved.on('pageerror', e => errors.push(e.message));
   await saved.addInitScript(local => localStorage.setItem('glow:cioTiles:v1', JSON.stringify(local)), scenario.local);
   await saved.route('**/api/**', r => r.fulfill({ status: 503, json: { status: 'unreachable' } }));
   const writes = [];
   await saved.route('**/api/tile-sets', r => {
    if (r.request().method() !== 'GET') writes.push(r.request().method());
    return r.fulfill({ json: { ok: true, sets: { cio: { ids: scenario.shared } } } });
   });
   await installReadModelRoutes(saved);
   const loaded = saved.waitForResponse('**/api/tile-sets');
   await saved.goto(base + '/cio?tab=returns');
   await loaded;
   await saved.locator('[data-segment-returns]').waitFor();
   await saved.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-tile-slot]')].map(el => el.dataset.tileSlot)) === JSON.stringify(expected), scenario.expected);
   assert.deepEqual(writes, [], 'retiring a saved metric must not write an empty shared layout');
   if (!scenario.local.synced) assert.deepEqual(await saved.evaluate(() => JSON.parse(localStorage.getItem('glow:cioTiles:v1'))), scenario.local, 'an older shared layout cannot overwrite the pending retired selection');
  } finally { await context.close(); }
 }
 await page.goto(base + '/cio?tab=returns&tiles=mwr');
 await page.locator('[data-segment-returns]').waitFor();
 assert.ok(await page.locator('[data-tile-slot]').count() > 0);
 assert.equal(await page.locator('[data-tile-slot="mwr"]').count(), 0);
 await page.screenshot({ path: `${out}/retired-return-card.png` });
 assert.deepEqual(errors, []);
 await fs.writeFile(`${out}/browser-results.json`, JSON.stringify(results, null, 2));
 console.log('Attribution toolbar, covered totals, source cards and mobile layout passed:', results);
} catch (error) { await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {}); throw error; } finally { await browser.close(); }
