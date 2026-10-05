// Local-only table/network budget regression. The real exposure handler reads
// checkout assets; live services are deterministic stand-ins, never production.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const capture = JSON.parse(await fs.readFile('public/data/corporate-actions.json', 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
try {
  for (const route of ['/corporate-actions','/monitor','/monitor?show=transactions','/ledger','/sectors','/family','/capital-gains','/private-market','/holdings','/performance','/returns','/audit','/cio','/polycab','/upload','/history']) {
    const page = await browser.newPage({ viewport: { width:1440, height:1000 } });
    const requests=[], errors=[];
    page.on('request', r => requests.push(new URL(r.url()).pathname));
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', r => r.fulfill({ json: new URL(r.request().url()).pathname === '/api/corporate-actions'
      ? { ok:true, retained:true, feed:capture } : { ok:false, reason:'local audit fixture' } }));
    await installReadModelRoutes(page);
    await page.addInitScript(() => { window.__long=[]; new PerformanceObserver(l => window.__long.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true}); });
    const started = Date.now(); await page.goto(base+route); await page.waitForLoadState('networkidle');
    const metrics = await page.evaluate(() => ({ rows:document.querySelectorAll('main tbody tr').length, longTasks:window.__long.length,
      blockedMs: Math.round(window.__long.reduce((s,d)=>s+d,0)), scriptBytes:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').reduce((s,r)=>s+r.encodedBodySize,0) }));
    results.push({route,settledMs:Date.now()-started,requests:requests.length,archiveRequests:requests.filter(p=>p.startsWith('/audit/')).length,...metrics});
    assert.deepEqual(errors, [], route);
    if (route !== '/audit') assert.equal(requests.filter(p => /^\/audit\/[^/]+\/document.json$/.test(p)).length,0,`${route}: no browser archive fan-out`);
    assert.equal(requests.filter(p=>/^\/lookthrough\/\d+\.json$/.test(p)).length,0,`${route}: no browser fund fan-out`);
    if (route === '/corporate-actions') {
      const table=page.locator('[data-corporate-return-table]');
      const rows=page.locator('[data-corporate-return-row]');
      assert.equal(await rows.count(),50);
      const first=await rows.first().getAttribute('data-corporate-return-row');
      await table.getByRole('button',{name:'Next table page',exact:true}).click();
      assert.notEqual(await rows.first().getAttribute('data-corporate-return-row'),first);
      await page.getByRole('textbox',{name:'Search corporate action holdings'}).fill('no-such-company-in-the-book');
      assert.equal(await rows.count(),0);
      await page.getByRole('textbox',{name:'Search corporate action holdings'}).fill('');
      assert.equal(await rows.first().getAttribute('data-corporate-return-row'),first,'clearing search resets the page');
      await page.locator('[data-col-button="holding"]').click();
      assert.equal(await rows.count(),50,'sorting does not mount the whole table');
      await table.getByLabel('Rows per page').selectOption('all');
      assert.ok(await rows.count()>250,'every holding remains reachable');
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
    console.log(JSON.stringify(results.at(-1))); await page.close();
  }
  await fs.mkdir('docs/page-check',{recursive:true});
  await fs.writeFile('docs/page-check/data-performance.json',JSON.stringify(results,null,2));
  console.log('PASS all routes, source-request budgets, default row limits, pagination, full-data access and filter reset');
} finally { await browser.close(); }
