// Fixed deterministic prices and local/staging interactions. No production API.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import ExcelJS from 'exceljs';
import { installReadModelRoutes } from './read-model-api.mjs';
import { clickTableControl } from './table-scroll.mjs';

const base = process.env.BASE ?? 'http://127.0.0.1:4173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const out = path.resolve('.cache/inr-twr-browser'); await fs.mkdir(out, { recursive: true });
const columns = ['twrMtd', 'twrQtd', 'twrYtd', 'twrSi'];
const labels = ['Adjusted TWR (Current Month, INR)', 'Adjusted TWR (Current Quarter, INR)', 'Adjusted TWR (YTD, INR)', 'Annualised Adjusted TWR (Since Inception, INR)'];
const t = [], c = [];
for (let ms = Date.parse('2020-01-01T00:00:00Z'), i = 0; ms <= Date.parse('2026-11-11T00:00:00Z'); ms += 864e5, i++) {
  t.push(new Date(ms).toISOString().slice(0, 10)); c.push(100 + i * .025);
}
const price = date => c[t.indexOf(date)];
const expectedMtd = (price('2026-11-11') / price('2026-10-31') - 1) * 100;
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let page;
let failHistory = false;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.install({ time: new Date('2026-11-11T06:30:00Z') });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', r => r.fulfill({ status: 503, json: { status: 'unreachable' } }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await installReadModelRoutes(page);
  await page.route('**/api/fx', r => r.fulfill({ json: { ok: true, inrPerUsd: 90, date: '2026-11-11' } }));
  await page.route('**/api/market-history?*', route => {
    if (failHistory) return route.fulfill({ status: 503, json: { ok: false, reason: 'Temporary test outage' } });
    const q = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { ok: true, version: 2, symbol: q.get('symbol') ?? q.get('fund'), isin: q.get('isin'),
      name: q.has('fund') ? 'Deterministic INR Fund - Growth' : 'Deterministic INR stock', source: 'Local INR fixture', basis: q.has('fund') ? 'nav' : 'adjusted-close',
      first: t[0], last: t.at(-1), t, c, v: c, splits: [] } });
  });
  await page.goto(`${base}/cio?tab=returns&seg=security&rto=2026-11-11`);
  const table = page.locator('[data-segment-returns]'); await table.waitFor();
  await page.waitForFunction(() => { const d = document.querySelector('[data-segment-returns]')?.dataset; return d?.marketPending === '0' && d?.twrPending === '0'; });
  for (const id of columns) assert.ok(await table.locator(`th[data-col="${id}"]`).isVisible(), `${id} visible by default`);
  await table.getByRole('button', { name: 'Expand all', exact: true }).click();
  const snapshots = async () => {
    const expand = table.getByRole('button', { name: 'Expand all', exact: true });
    if (await expand.count()) await expand.click();
    return table.locator('tr[data-seg-row], tr[data-seg-child]').evaluateAll((rows, columns) => rows.map(row => ({
    key: row.dataset.segRow ?? `${row.dataset.segChild}::${row.dataset.segChildKey}`,
    selector: row.dataset.segRow ? `tr[data-seg-row="${CSS.escape(row.dataset.segRow)}"]`
      : `tr[data-seg-child="${CSS.escape(row.dataset.segChild)}"][data-seg-child-key="${CSS.escape(row.dataset.segChildKey)}"]`,
    values: Object.fromEntries(columns.map(id => [id, row.querySelector(`[data-seg-cell="${id}"]`)?.getAttribute('data-twr-pct') ?? ''])),
    })).filter(r => !r.key.startsWith('__')), columns);
  };
  const before = await snapshots();
  await fs.writeFile(path.join(out, 'initial-values.json'), JSON.stringify(before, null, 2));
  if (!before.some(r => r.values.twrMtd !== '')) {
    const reasons = [];
    for (const key of ['helios-flexi-cap-fund-direct', 'mirae-asset-liquid-fund-direct', 'absl-liquid-fund-direct-growth']) {
      const sample = table.locator(`tr[data-seg-row*="${key}"] [data-seg-cell="twrMtd"]`).first();
      if (await sample.count()) { await sample.getByRole('button').click(); reasons.push(await page.getByRole('dialog').innerText()); await page.keyboard.press('Escape'); }
    }
    await fs.writeFile(path.join(out, 'initial-gaps.json'), JSON.stringify(reasons, null, 2));
  }
  assert.ok(before.some(r => r.values.twrMtd !== ''), 'at least one holding has measurable MTD');
  assert.ok(before.some(r => r.values.twrQtd !== ''), 'at least one holding has measurable QTD');
  assert.ok(before.some(r => r.values.twrYtd !== ''), 'at least one holding has measurable calendar YTD');
  assert.ok(before.some(r => r.values.twrSi !== ''), 'complete purchase records produce since-inception TWR');
  const match = before.find(r => r.values.twrMtd !== '' && Math.abs(Number(r.values.twrMtd) - expectedMtd) < 1e-9);
  assert.ok(match, 'a no-flow holding matches the independently known INR price ratio');
  // The fixed columns retain their horizons when the main selector changes.
  for (const period of ['y2', 'inception', 'fytd']) {
    await page.locator(`[data-returns-period="${period}"]`).click();
    for (const type of ['xirr', 'absolute', 'cagr']) {
      await page.locator('[data-returns-type-select]').selectOption(type);
      const after = new Map((await snapshots()).map(r => [r.key, r.values]));
      for (const row of before) assert.deepEqual(after.get(row.key), row.values, `${period}/${type}/${row.key}: fixed horizons unchanged`);
    }
  }
  const currency = page.getByRole('group', { name: 'Display currency', exact: true });
  await currency.getByRole('button', { name: 'USD', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-ccy-shown]')?.getAttribute('data-ccy-shown') === 'USD');
  assert.deepEqual(await snapshots(), before, 'USD display conversion cannot turn these into USD investment returns');
  assert.equal(await table.locator('[data-twr-currency]:not([data-twr-currency="INR"])').count(), 0);
  assert.match(await table.locator('th[data-col="bench"]').innerText(), /INR/);
  assert.equal(await table.locator('[data-seg-cell="bench"]:not([data-bench-currency="INR"])').count(), 0);
  const cell = table.locator(`${match.selector} [data-seg-cell="twrMtd"]`);
  await cell.getByRole('button').click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  assert.match(await dialog.innerText(), /INR valuations and INR cash flows/);
  await dialog.locator('[data-twr-working] summary').click();
  assert.match(await dialog.innerText(), /₹/);
  await page.screenshot({ path: path.join(out, 'working-in-inr.png') });
  await page.keyboard.press('Escape');
  const gapCell = table.locator('tr[data-seg-row] [data-seg-cell="twrMtd"][data-twr-pct=""]').first();
  await gapCell.getByRole('button').click(); await dialog.waitFor();
  assert.ok(await dialog.locator('[data-twr-gaps] li').count() > 0, 'missing evidence is explained');
  await page.keyboard.press('Escape');
  // Edit Columns remembers the added measures just like existing columns.
  const edit = page.locator('[data-edit-columns="cio-attribution"]');
  await edit.click();
  let editor = page.locator('[data-column-editor="cio-attribution"]');
  for (const [i, label] of labels.entries()) {
    assert.match(await editor.innerText(), new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(await editor.locator(`[data-column-checkbox="${columns[i]}"]`).isChecked(), `${label} offered and selected`);
  }
  await editor.locator('[data-column-checkbox="twrMtd"]').uncheck();
  await page.keyboard.press('Escape'); await page.reload(); await table.waitFor();
  assert.equal(await table.locator('th[data-col="twrMtd"]').count(), 0, 'hidden choice survives reload');
  await edit.click(); editor = page.locator('[data-column-editor="cio-attribution"]');
  await editor.locator('[data-column-checkbox="twrMtd"]').check(); await page.keyboard.press('Escape');
  await page.waitForFunction(() => { const d = document.querySelector('[data-segment-returns]')?.dataset; return d?.marketPending === '0' && d?.twrPending === '0'; });
  const heading = table.locator('th[data-col="twrMtd"]'); await heading.locator('[data-col-button]').click();
  const direction = await heading.getAttribute('aria-sort');
  const sortedGroups = new Map();
  for (const row of await snapshots()) if (row.values.twrMtd !== '') {
    const group = row.key.includes('::') ? row.key.split('::')[0] : 'root';
    sortedGroups.set(group, [...(sortedGroups.get(group) ?? []), Number(row.values.twrMtd)]);
  }
  assert.ok([...sortedGroups.values()].every(sorted => sorted.every((v, i) => i === 0 || (direction === 'ascending' ? v >= sorted[i - 1] : v <= sorted[i - 1]))), 'numeric TWR sorting within each sibling group');
  const download = page.waitForEvent('download', { timeout: 180000 });
  await table.locator('[data-export-excel]').first().count().then(async n => {
    await (n ? table.locator('[data-export-excel]').first() : page.locator('[data-export-excel]').first()).click();
  });
  const file = path.join(out, 'inr-returns.xlsx'); await (await download).saveAs(file);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0]; let header;
  sheet.eachRow(row => { if (row.values.some(v => v === labels[0])) header = row; });
  assert.ok(header, 'Excel contains the named INR TWR columns');
  const index = header.values.indexOf(labels[0]); let exportedMatch = false;
  sheet.eachRow(row => {
    const x = row.getCell(index);
    if (typeof x.value === 'number' && Math.abs(x.value * 100 - expectedMtd) < 1e-9) {
      assert.match(x.numFmt, /%/); exportedMatch = true;
    }
  });
  assert.ok(exportedMatch, 'Excel exports a numeric percentage with the same value as the INR calculation');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileInfo = table.locator('[data-seg-cell="twrMtd"]').first().getByRole('button');
  await clickTableControl(mobileInfo); await dialog.waitFor();
  assert.ok(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1; }));
  await page.screenshot({ path: path.join(out, 'mobile-info.png') }); await page.keyboard.press('Escape');
  // Recovery includes histories requested only for sold investments.
  // This browser has just cached successful public histories; empty only this
  // isolated test context's store so the next load actually exercises failures.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('glow-market-history');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('histories', 'readwrite');
      tx.objectStore('histories').clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  failHistory = true; await page.reload(); await table.waitFor();
  await page.waitForFunction(() => { const d = document.querySelector('[data-segment-returns]')?.dataset; return d?.marketPending === '0' && d?.twrPending === '0'; });
  await table.locator('tr[data-seg-row] [data-seg-cell="twrMtd"]').first().getByRole('button').click(); await dialog.waitFor();
  failHistory = false; await dialog.locator('[data-twr-retry]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-seg-cell="twrMtd"]')].some(c => c.getAttribute('data-twr-pct')));
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ expectedMtd, matchedHolding: match.key, measurable: Object.fromEntries(columns.map(c => [c, before.filter(r => r.values[c] !== '').length])), checks: 'fixed horizons, INR/ USD display invariance, source gaps, Edit Columns persistence, sorting, numeric Excel export, mobile popup and history retry' }, null, 2));
  console.log('INR TWR browser checks passed.');
} catch (error) { await page?.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {}); throw error; }
finally { await browser.close(); }
