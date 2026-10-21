// Local-only table/network budget regression. The real exposure handler reads
// checkout assets; live services are deterministic stand-ins, never production.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';
import { assertStickyTableHeaders, assertTableHeaderFixture } from './table-headers.mjs';
import { installProfileStoreFixture, assertInlineProfileEditing } from './private-profile-inputs.mjs';
import { assertTableExportControls, assertInfiniteTableExport, assertPrivateProfileExport, assertExportRetry } from './table-excel.mjs';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const capture = JSON.parse(await fs.readFile('public/data/corporate-actions.json', 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
await fs.mkdir('.cache/table-scroll-check', { recursive: true });
const results = [];
const symbols = JSON.parse(await fs.readFile('src/data/nseSymbols.json', 'utf8'));
let insiderPath;
const manifest = JSON.parse(await fs.readFile('public/audit/manifest.json', 'utf8'));
const source = manifest.flatMap(f => f.sheets.map(s => ({file:f.fileKey, sheet:s.key, rows:s.rows})))
  .filter(s => s.rows > 250).sort((a,b) => a.rows - b.rows)[0];
assert.ok(source, 'a large source table is available');
const sourceRoute = `/audit?file=${encodeURIComponent(source.file)}&sheet=${encodeURIComponent(source.sheet)}`;
// Drive the real scroll surface: automatic append must work without a button.
async function appendByScrolling(table) {
  const end = table.locator('[data-table-scroll-end]');
  const before = Number(await end.getAttribute('data-loaded-rows'));
  const total = Number(await end.getAttribute('data-total-rows'));
  assert.ok(before < total, 'more rows are available');
  await end.scrollIntoViewIfNeeded();
  await end.page().waitForFunction(({ element, before }) => Number(element.dataset.loadedRows) > before,
    { element: await end.elementHandle(), before });
}
async function scrollToEnd(table) {
  const end = table.locator('[data-table-scroll-end]');
  for (let i = 0; i < 200; i++) {
    const shown = Number(await end.getAttribute('data-loaded-rows'));
    const total = Number(await end.getAttribute('data-total-rows'));
    if (shown === total) return total;
    await appendByScrolling(table);
  }
  assert.fail('table never reached its final row');
}
try {
  await assertTableHeaderFixture(browser,base);
  for (const route of ['/corporate-actions','/monitor','/monitor?group=category','/monitor?group=basket','/monitor?group=assetClass','/monitor?show=transactions','/ledger','/sectors','/family','/capital-gains','/private-market','/holdings','/performance','/returns','/audit','/audit?consolidated=Transactions',sourceRoute,'/cio','/polycab','/upload','/history']) {
    const page = await browser.newPage({ viewport: { width:1440, height:1000 } });
    const requests=[], errors=[];
    page.on('request', r => requests.push(new URL(r.url()).pathname));
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', r => r.fulfill({ json: new URL(r.request().url()).pathname === '/api/corporate-actions'
      ? { ok:true, retained:true, feed:capture } : { ok:false, reason:'local audit fixture' } }));
    await installReadModelRoutes(page);
    const profileStore = route === '/private-market' ? await installProfileStoreFixture(page) : null;
    await page.addInitScript(() => { window.__long=[]; new PerformanceObserver(l => window.__long.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true}); });
    const started = Date.now(); await page.goto(base+route); await page.waitForLoadState('networkidle');
    const metrics = await page.evaluate(() => ({ rows:document.querySelectorAll('main tbody tr').length, longTasks:window.__long.length,
      blockedMs: Math.round(window.__long.reduce((s,d)=>s+d,0)), scriptBytes:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').reduce((s,r)=>s+r.encodedBodySize,0) }));
    results.push({route,settledMs:Date.now()-started,requests:requests.length,archiveRequests:requests.filter(p=>p.startsWith('/audit/')).length,...metrics});
    assert.deepEqual(errors, [], route);
    await assertTableExportControls(page, route);
    if (['/monitor','/monitor?show=transactions','/ledger','/corporate-actions','/capital-gains','/audit?consolidated=Transactions',sourceRoute].includes(route)) await assertInfiniteTableExport(page, route);
    if (route === '/ledger') await assertExportRetry(page);
    if (route !== '/audit') assert.equal(requests.filter(p => /^\/audit\/[^/]+\/document.json$/.test(p)).length,0,`${route}: no browser archive fan-out`);
    assert.equal(requests.filter(p=>/^\/lookthrough\/\d+\.json$/.test(p)).length,0,`${route}: no browser fund fan-out`);
    if (route === '/corporate-actions') {
      const table=page.locator('[data-corporate-return-table]');
      const rows=page.locator('[data-corporate-return-row]');
      assert.equal(await rows.count(),50);
      const first=await rows.first().getAttribute('data-corporate-return-row');
      await appendByScrolling(table);
      assert.ok(await rows.count() > 50);
      assert.equal(await rows.first().getAttribute('data-corporate-return-row'),first,'scrolling preserves earlier rows');
      await page.getByRole('textbox',{name:'Search corporate action holdings'}).fill('no-such-company-in-the-book');
      assert.equal(await rows.count(),0);
      await page.getByRole('textbox',{name:'Search corporate action holdings'}).fill('');
      assert.equal(await rows.first().getAttribute('data-corporate-return-row'),first,'clearing search resets the scroll batch');
      await page.locator('[data-col-button="holding"]').click();
      assert.equal(await rows.count(),50,'sorting does not mount the whole table');
      const total = await scrollToEnd(table);
      assert.ok(total > 250, 'every holding remains reachable');
      assert.equal(await rows.count(), total);
      const keys = await rows.evaluateAll(rs => rs.map(r => r.dataset.corporateReturnRow));
      assert.equal(new Set(keys).size, keys.length, 'no duplicate rows at batch boundaries');
    }
    if (route === '/ledger') {
      assert.ok(metrics.rows < 120, 'ledger defaults stay bounded');
      assert.ok(requests.filter(p=>p.includes('/views/')).length<=2,'inactive income and gain tabs do not load');
      for (const label of ['Realised gains','Income']) {
        const tab=page.getByRole('button',{name:new RegExp(label,'i')});
        if (await tab.count()) { await tab.first().click(); await page.waitForLoadState('networkidle'); }
      }
      assert.ok(await page.locator('main tbody tr').count()<120);
    }
    if (route === '/monitor' || route.startsWith('/monitor?group=')) {
      const table=page.locator('[data-monitor-table="holdings"]');
      const holdings=table.locator('tbody tr[data-bucket]');
      assert.ok(await holdings.count()<=50, 'one 50-row limit across all sections');
      assert.equal(await table.locator('[data-table-scroll-end]').count(),1, 'one table-wide scroll boundary');
      const allKeys=await holdings.evaluateAll(rows=>rows.map(r=>r.getAttribute('data-security-key')||r.getAttribute('data-mandate-account')));
      const totals = await table.locator('tfoot').innerText();
      await appendByScrolling(table);
      assert.ok(await holdings.count() > 50);
      assert.deepEqual((await holdings.evaluateAll(rows=>rows.map(r=>r.getAttribute('data-security-key')||r.getAttribute('data-mandate-account')))).slice(0, allKeys.length), allKeys, 'previous holdings stay mounted');
      if (route.includes('group=')) assert.ok(await table.locator('tr[data-section]').count()>0, 'scrolling retains section headings');
      const total = await scrollToEnd(table);
      assert.equal(await holdings.count(), total, 'all grouped holdings remain reachable');
      assert.equal(await table.locator('tfoot').innerText(), totals, 'scrolling never changes full-data totals');
      if (route === '/monitor') {
        const links = await table.locator('a[href^="/stock/"]').evaluateAll(as => as.map(a => a.getAttribute('href')));
        insiderPath = links.find(href => symbols[decodeURIComponent(href.split('/stock/')[1].split('?')[0])]);
      }
      await page.screenshot({ path: `.cache/table-scroll-check/monitor-${new URL(base+route).searchParams.get('group') || 'security'}.png` });
      await table.locator('[data-col-button="security"]').click();
      assert.equal(await holdings.count(), 50, 'sorting resets the Monitor to its first batch');
    }
    assert.equal(await page.getByLabel('Rows per page').count(), 0, 'no page size selector');
    assert.equal(await page.getByRole('button', {name:'Next table page',exact:true}).count(), 0, 'no next page');
    assert.equal(await page.getByRole('button', {name:'Previous table page',exact:true}).count(), 0, 'no previous page');
    if (route.startsWith('/audit?consolidated=')) {
      const table = page.locator('table').filter({has:page.locator('[data-infinite-rows]')}).first();
      const total = await scrollToEnd(table);
      assert.ok(total > 200, 'the complete large workbook tab is available');
      assert.equal(await table.locator('[data-consolidated-row]').count(), total);
      await page.getByRole('textbox', {name:'Search consolidated sheet'}).fill('no-such-row-in-workbook');
      assert.equal(await table.locator('[data-consolidated-row]').count(), 0);
      await page.getByRole('textbox', {name:'Search consolidated sheet'}).fill('');
      assert.equal(await table.locator('[data-consolidated-row]').count(), 50, 'clearing workbook search resets row loading');
    }
    if (route === sourceRoute) {
      const table = page.locator('table').filter({has:page.locator('[data-table-scroll-end]')}).last();
      const total = await scrollToEnd(table);
      assert.ok(total > 200, 'the complete source table is available');
      assert.equal(await table.locator('tbody > tr:not([data-table-scroll-end])').count(), total);
      assert.equal(await page.getByRole('button', {name:/Load all/}).count(), 0);
    }
    if (profileStore) { await assertInlineProfileEditing(page, profileStore); await assertPrivateProfileExport(page, profileStore); }
    Object.assign(results.at(-1), await assertStickyTableHeaders(page, route));
    assert.deepEqual(errors, [], `${route}: no runtime errors after interactions`);
    console.log(JSON.stringify(results.at(-1))); await page.close();
  }
  // A feed larger than both old insider cutoffs (40 UI / 150 client rows).
  assert.ok(insiderPath, 'the Monitor resolves a company with a known symbol');
  const insiderPage = await browser.newPage({viewport:{width:1440,height:1000}});
  await insiderPage.route('**/api/**', r => r.fulfill({json:{ok:false}}));
  const disclosures = Array.from({length:175}, (_,i) => ({company:'Local fixture company', insider:`Local fixture ${i}`,
    transaction:'Acquisition', shares:i+1, value:0, broadcastDate:'2026-10-01', key:`fixture-${i}`, postPct:'1%'}));
  await insiderPage.route('**/api/insider', r => r.fulfill({json:{ok:true,items:disclosures}}));
  await installReadModelRoutes(insiderPage);
  const insiderURL = new URL(insiderPath, base);
  insiderURL.searchParams.set('tab','research');
  await insiderPage.goto(insiderURL.href);
  await insiderPage.getByRole('tab',{name:'Insider deals',exact:true}).click();
  const insiderTable = insiderPage.locator('[data-insider-deals="ok"] table');
  await insiderTable.waitFor();
  assert.equal(await insiderTable.locator('tbody > tr:not([data-table-scroll-end])').count(), 50);
  assert.equal(await scrollToEnd(insiderTable), disclosures.length, 'every disclosed insider row remains reachable');
  await assertStickyTableHeaders(insiderPage, 'insider disclosures');
  await insiderPage.close();
  const updatePage=await browser.newPage();
  await updatePage.route('**/api/**',r=>r.fulfill({json:{ok:false}}));
  await updatePage.route('**/api/stock-exposure',r=>r.fulfill({status:409,json:{status:'revision_changed'}}));
  await updatePage.goto(base+'/monitor');
  await updatePage.getByRole('heading',{name:'A new dashboard version is ready'}).waitFor();
  assert.equal(await updatePage.getByRole('button',{name:'Reload dashboard'}).count(),1);
  assert.equal(await updatePage.locator('[data-monitor-table]').count(),0,'deployment prompt replaces misleading partial tables');
  await updatePage.close();
  await fs.mkdir('.cache/table-scroll-check',{recursive:true});
  await fs.writeFile('.cache/table-scroll-check/data-performance.json',JSON.stringify(results,null,2));
  console.log('PASS all routes, source-request budgets, default row limits, infinite scrolling, sticky headers in both themes, full-data access and filter reset');
} finally { await browser.close(); }
