// Deterministic public-price fixtures; holdings stay in the local/staging browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = '.cache/market-returns'; await fs.mkdir(out, { recursive: true });
const t = [], v = [];
for (let ms = Date.parse('2020-01-01T00:00:00Z'), i = 0; ms <= Date.parse('2026-10-21T00:00:00Z'); ms += 864e5, i++) {
 t.push(new Date(ms).toISOString().slice(0,10)); v.push(100 + i * .1 + i*i*.0001);
}
const price = d => v[t.indexOf(d)];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let page;
try {
 page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 await page.clock.install({ time: new Date('2026-10-22T06:30:00Z') });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('**/api/**', r => r.fulfill({ status: 503, json: { status: 'unreachable' } }));
 await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
 await installReadModelRoutes(page);
 let requests = 0, retrying = false;
 await page.route('**/api/market-history?*', r => {
  requests++;
  const q = new URL(r.request().url()).searchParams;
  const symbol = q.get('symbol'), isin = q.get('isin'), fund = q.get('fund');
  // A real holding's first request fails. The retry button must recover it.
  if (symbol === 'KARURVYSYA' && !retrying) return r.fulfill({ json: { ok: false, reason: 'Temporary source failure' } });
  return r.fulfill({ json: { ok: true, symbol: fund || symbol+'.NS', isin, name: fund || symbol, source: fund ? 'NAV fixture' : 'Adjusted stock fixture', basis: fund ? 'nav' : 'adjusted-close', first: t[0], last: t.at(-1), t, v } });
 });
 await page.goto(base + '/cio?tab=returns&tiles=value,gain,fytd');
 const summary = page.locator('[data-market-summary]'), table = page.locator('[data-segment-returns]');
 await page.waitForFunction(() => document.querySelector('[data-market-summary]')?.dataset.marketPending === '0');
 assert.ok(Number(await summary.getAttribute('data-market-covered')) > 20, 'stock and fund histories resolve from the actual book');
 assert.ok(requests > 10);
 const initialRequests = requests, results = [];
 for (const period of ['fytd','mtd','ytd','y1','y2','y3']) {
  await page.locator(`[data-returns-period="${period}"]`).click();
  for (const type of ['absolute','xirr','cagr']) {
   await page.locator('[data-returns-type-select]').selectOption(type);
   await page.waitForFunction(({ period,type }) => { const d=document.querySelector('[data-segment-returns]')?.dataset; return d?.segPeriod===period && d?.segType===type; }, {period,type});
   const from = await table.getAttribute('data-seg-start'), to = '2026-10-21';
   const days = (Date.parse(to)-Date.parse(from))/864e5;
   const raw = price(to)/price(from), expected = ((type!=='absolute' && days>=365 ? Math.pow(raw,365/days) : raw)-1)*100;
   const actual = Number(await summary.getAttribute('data-market-total'));
   assert.ok(Number.isFinite(actual) && Math.abs(actual-expected)<1e-7, `${period}/${type}: ${actual} vs ${expected}`);
   const footer = table.locator('[data-seg-total] [data-seg-cell="market"]');
   assert.ok(Math.abs(Number(await footer.getAttribute('data-market-return'))-actual)<1e-8);
   results.push({ period,type,actual });
  }
 }
 assert.equal(requests, initialRequests, 'changing the period reuses public history instead of refetching it');
 assert.ok(new Set(results.filter(r=>r.type==='absolute').map(r=>r.actual)).size===6);
 await summary.getByRole('button', { name: 'What is included in total market return?', exact: true }).click();
 const dialog = page.getByRole('dialog'); await dialog.waitFor();
 assert.match(await dialog.innerText(), /current value/); assert.match(await dialog.innerText(), /not reconstruct your buys or sales/);
 await dialog.getByText('Which histories are missing?', { exact:true }).click();
 assert.match(await dialog.innerText(), /Karur Vysya Bank/); assert.match(await dialog.innerText(), /account/);
 await page.screenshot({ path: `${out}/coverage.png` }); await page.keyboard.press('Escape');
 const before = Number(await summary.getAttribute('data-market-covered')); retrying=true;
 await page.locator('[data-market-retry]').click();
 await page.waitForFunction(n=>Number(document.querySelector('[data-market-summary]')?.dataset.marketCovered)>n, before);
 await table.locator('[data-seg-axis-option="sector"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-segment-returns]')?.dataset.segAxis==='sector');
 // Stage 10gs: the Sector axis is Sector Composition's sectors, with the market return per sector.
 await page.waitForFunction(()=>document.querySelector('[data-sector-attribution]')?.dataset.status==='ready');
 assert.ok(await table.locator('[data-sa-cell="market"][data-market-return]:not([data-market-return=""])').count()>5);
 await page.screenshot({path:`${out}/sector-market-returns.png`});
 await page.setViewportSize({width:390,height:844});
 await summary.getByRole('button', {name:'What is included in total market return?',exact:true}).click(); await dialog.waitFor();
 assert.ok(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;}));
 await page.screenshot({path:`${out}/mobile-coverage.png`});
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));
 console.log('Historical market return: all six periods, three return types, totals, sources, retry, sector regrouping and mobile passed.',results);
} catch(error) { await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error; } finally {await browser.close();}
