// Deterministic public-price fixtures; holdings stay in the local/staging browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';
import { revealTableControl } from './table-pointer.mjs';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = '.cache/market-returns'; await fs.mkdir(out, { recursive: true });
const t = [], v = [];
for (let ms = Date.parse('2020-01-01T00:00:00Z'), i = 0; ms <= Date.parse('2026-11-04T00:00:00Z'); ms += 864e5, i++) {
 t.push(new Date(ms).toISOString().slice(0,10)); v.push(100 + i * .1 + i*i*.0001);
}
const price = d => v[t.indexOf(d)];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let page;
try {
 page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 await page.clock.install({ time: new Date('2026-11-05T06:30:00Z') });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('**/api/**', r => r.fulfill({ status: 503, json: { status: 'unreachable' } }));
 await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
 await installReadModelRoutes(page);
 let requests = 0, retrying = false, nseSourceFailures = 0;
 await page.route('**/api/market-history?*', r => {
  requests++;
  const q = new URL(r.request().url()).searchParams;
  const symbol = q.get('symbol'), isin = q.get('isin'), fund = q.get('fund');
  // A real holding's first request fails. The retry button must recover it.
  if (symbol === 'KARURVYSYA' && !retrying) return r.fulfill({ json: { ok: false, reason: 'Temporary source failure' } });
  // NSE is now a verified BSE listing. Explicitly simulate a missing source
  // history instead of assuming the actual book has no listing for it.
  if (symbol === 'NSE.BO' && !retrying) { nseSourceFailures++; return r.fulfill({ json: { ok: false, reason: 'The price source returned HTTP 404 for this listing.' } }); }
  return r.fulfill({ json: { ok: true, version: 2, symbol: fund || symbol+'.NS', isin, name: fund || symbol, source: fund ? 'NAV fixture' : 'Adjusted stock fixture', basis: fund ? 'nav' : 'adjusted-close', first: t[0], last: t.at(-1), t, v } });
 });
 await page.goto(base + '/cio?tab=returns&tiles=value,gain,fytd');
 const table = page.locator('[data-segment-returns]'), summary = table;
 // The fixed TWR columns also load sold holdings through the shared loader.
 // Include that initial work before measuring requests caused by date changes.
 await page.waitForFunction(() => {
  const d = document.querySelector('[data-segment-returns]')?.dataset;
  return d?.marketPending === '0' && d?.twrPending === '0';
 });
 assert.ok(Number(await summary.getAttribute('data-market-covered')) > 20, 'stock and fund histories resolve from the actual book');
 assert.ok(requests > 10);
 assert.ok(nseSourceFailures > 0, 'the missing-listing-history fixture was exercised');
 const initialRequests = requests, results = [];
 // Stage 10lg: Market performance reads the period's own selection — each
 // holding's return over its own part of the period, weighted by today's value.
 // It is the period's move whatever the return type picked, and ties to its rows.
 for (const period of ['fytd','mtd','ytd','y1','y2','y3']) {
  await page.locator(`[data-returns-period="${period}"]`).click();
  for (const type of ['absolute','xirr','cagr']) {
   await page.locator('[data-returns-type-select]').selectOption(type);
   await page.waitForFunction(({ period,type }) => { const d=document.querySelector('[data-segment-returns]')?.dataset; return d?.segPeriod===period && d?.segType===type; }, {period,type});
   await page.waitForFunction(() => document.querySelector('[data-segment-returns]')?.dataset.marketPending === '0');
   const actual = Number(await summary.getAttribute('data-market-total'));
   assert.ok(Number.isFinite(actual), `${period}/${type}: a market figure`);
   // Stage 10mr: the attribution table no longer draws a Market return column (it restated the Return column).
   assert.equal(await table.locator('[data-seg-cell="market"]').count(), 0, `${period}/${type}: no Market return column`);
   assert.ok(Number(await summary.getAttribute('data-market-covered')) > 20, `${period}/${type}: holdings measured`);
   // Each holding from its first value on record in the period: never before
   // the period opens, beyond a statement value at most seven days old
   // (`OPENING_MARK_TOLERANCE_DAYS`).
   const segStart = await table.getAttribute('data-seg-start'), segEnd = await table.getAttribute('data-seg-end');
   const from = await summary.getAttribute('data-market-from'), to = await summary.getAttribute('data-market-to');
   const earliest = new Date(Date.parse(`${segStart}T00:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10);
   assert.ok(from && to && from >= earliest && to <= segEnd && from < to, `${period}/${type}: ${from} → ${to} inside ${segStart} → ${segEnd}`);
   results.push({ period,type,actual,from,to });
  }
 }
 assert.equal(requests, initialRequests, 'changing the period reuses public history instead of refetching it');
 // A month opens on its own values; the longer periods open where the records first value each holding.
 assert.ok(Math.abs(results.find(r=>r.period==='mtd').actual-results.find(r=>r.period==='fytd').actual)>1e-6, 'the month has its own figure');
 const of = (period, type) => results.find(r => r.period===period && r.type===type).actual;
 for (const period of ['fytd','mtd','ytd','y1','y2','y3']) {
  assert.ok(Math.abs(of(period,'xirr')-of(period,'absolute'))<1e-9 && Math.abs(of(period,'cagr')-of(period,'absolute'))<1e-9, `${period}: each holding's return over the period, whatever the type`);
 }
 // Stage 10mr: the attribution table sets each row against its own index, so the market return and
 // its details are the Sector axis's (Stage 10gs): Sector Composition's sectors, priced per sector.
 await table.locator('[data-seg-axis-option="sector"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-segment-returns]')?.dataset.segAxis==='sector');
 await page.waitForFunction(()=>document.querySelector('[data-sector-attribution]')?.dataset.status==='ready');
 assert.ok(await table.locator('[data-sa-cell="market"][data-market-return]:not([data-market-return=""])').count()>5);
 await page.screenshot({path:`${out}/sector-market-returns.png`});
 const sectorTotal = () => Number(document.querySelector('[data-sa-total] [data-sa-cell="market"]')?.dataset.marketReturn);
 await summary.getByRole('button', { name: 'What is included in total market return?', exact: true }).click();
 const dialog = page.getByRole('dialog'); await dialog.waitFor();
 assert.equal(await dialog.getByRole('tab').count(),3);
 assert.equal(await dialog.getByRole('tab',{name:'Return Overview',exact:true}).getAttribute('aria-selected'),'true');
 assert.match(await dialog.innerText(),/values today/);
 const detail=dialog.locator('[data-market-details]');
 const includedCount=Number(await detail.getAttribute('data-market-included-count'));
 const missingCount=Number(await detail.getAttribute('data-market-missing-count'));
 const holdingCount=Number(await detail.getAttribute('data-market-holding-total'));
 assert.ok(includedCount>5,'the sector total prices its holdings');
 assert.equal(includedCount+missingCount,holdingCount,'every holding belongs to one of the two lists');
 assert.equal(await dialog.locator('[data-market-source]').count(),0,'Overview stays short; no long list is mounted');
 await page.screenshot({path:`${out}/overview-tab.png`});
 await dialog.locator('[data-market-tab="included"]').click();
 assert.equal(await dialog.locator('[data-market-source]').count(),includedCount);
 const includedKeys=await dialog.locator('[data-market-source]').evaluateAll(els=>els.map(el=>el.dataset.marketHoldingKey));
 assert.equal(new Set(includedKeys).size,includedCount,'separate accounts remain separate entries');
 const rows=await dialog.locator('[data-market-source]').evaluateAll(els=>els.map(el=>({pct:+el.dataset.marketPct,value:+el.dataset.marketValue})));
 const tied=rows.reduce((n,r)=>n+r.value*r.pct,0)/rows.reduce((n,r)=>n+r.value,0);
 assert.ok(Math.abs(tied-await page.evaluate(sectorTotal))<1e-6,'the total is its holdings’ returns weighted by today’s value');
 assert.ok(await dialog.locator('[data-market-source]').evaluateAll(els=>els.every(el=>el.querySelector('[data-market-through]')?.textContent.trim()&&el.querySelector('[data-market-category]')?.textContent.trim()&&el.querySelector('[data-market-owner]')?.textContent.includes('Account'))));
 await dialog.getByRole('textbox',{name:'Search included holdings'}).fill('no-such-investment-12345');
 assert.equal(await dialog.locator('[data-market-source]').count(),0);
 assert.match(await dialog.innerText(),/No included holdings match/);
 await dialog.getByRole('textbox',{name:'Search included holdings'}).fill('');
 assert.equal(await dialog.locator('[data-market-source]').count(),includedCount);
 await page.screenshot({path:`${out}/included-tab.png`});
 await dialog.locator('[data-market-tab="missing"]').click();
 assert.equal(await dialog.locator('[data-market-gap]').count(),missingCount);
 const missingKeys=await dialog.locator('[data-market-gap]').evaluateAll(els=>els.map(el=>el.dataset.marketHoldingKey));
 assert.equal(new Set([...includedKeys,...missingKeys]).size,holdingCount,'no overlap or omitted holding');
 assert.ok(await dialog.locator('[data-market-gap]').evaluateAll(els=>els.every(el=>el.querySelector('[data-market-through]')?.textContent.trim()&&el.querySelector('[data-market-category]')?.textContent.trim()&&el.querySelector('[data-market-missing-data]')?.textContent.trim()&&el.querySelector('[data-market-needed]')?.textContent.trim())));
 // Stage 10lh: a period lists no private investment.
 assert.equal(await dialog.locator('[data-market-side="private"]').count(),0,'no private investment is listed on a period');
 await dialog.getByRole('textbox',{name:'Search missing holdings'}).fill('Karur');
 assert.ok(await dialog.locator('[data-market-gap]').count()>0, 'the failed history is named as missing');
 const karur = dialog.locator('[data-market-gap]').first();
 assert.ok(await karur.evaluate(el => Boolean(el.querySelector('[data-market-missing-data]').compareDocumentPosition(el.querySelector('[data-market-owner]')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'the missing data comes before account metadata');
 assert.match(await dialog.innerText(),/Account/);
 await page.screenshot({path:`${out}/coverage.png`});
 await dialog.locator('[data-market-tab="missing"]').focus();
 await page.keyboard.press('ArrowRight');
 assert.equal(await dialog.locator('[data-market-tab="overview"]').getAttribute('aria-selected'),'true');
 await page.keyboard.press('End');
 assert.equal(await dialog.locator('[data-market-tab="missing"]').getAttribute('aria-selected'),'true');
 await page.keyboard.press('Escape');
 assert.equal(await summary.getByRole('button',{name:'What is included in total market return?',exact:true}).evaluate(el=>el===document.activeElement),true);
 // Stage 10lz: the retry is the Total row's own, on its details' Missing tab.
 const before = Number(await summary.getAttribute('data-market-covered')); retrying=true;
 await summary.getByRole('button',{name:'What is included in total market return?',exact:true}).click(); await dialog.waitFor();
 await dialog.locator('[data-market-tab="missing"]').click();
 await dialog.locator('[data-market-retry]').click();
 await page.waitForFunction(n=>Number(document.querySelector('[data-segment-returns]')?.dataset.marketCovered)>n, before);
 await page.keyboard.press('Escape');
 // Stage 10gu: every history is now kept in this browser, so the next visit draws the figure without fetching any.
 const covered = Number(await summary.getAttribute('data-market-covered')), kept = requests;
 await page.reload();
 await page.waitForFunction(n => Number(document.querySelector('[data-segment-returns]')?.dataset.marketCovered) === n
   && document.querySelector('[data-segment-returns]')?.dataset.marketPending === '0', covered);
 await page.waitForTimeout(1000);
 assert.equal(requests, kept, 'a reload draws the kept histories instead of refetching them');
 await page.setViewportSize({width:390,height:844});
 await summary.getByRole('button', {name:'What is included in total market return?',exact:true}).click(); await dialog.waitFor();
 // The tab is kept with its history entry (`useNavigationState`): the retry above left it on Missing, and the reload is the same entry.
 assert.equal(await dialog.locator('[data-market-tab="missing"]').getAttribute('aria-selected'),'true','reopening keeps the tab this history entry left it on');
 for(const tab of ['overview','included','missing']) {
  await dialog.locator(`[data-market-tab="${tab}"]`).click();
  assert.ok(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;}));
  await page.screenshot({path:`${out}/mobile-${tab}.png`});
 }
 await page.keyboard.press('Escape');
 await page.locator('[data-returns-period="invested-year"]').click();
 const yearly=page.locator('[data-invested-year]');await yearly.waitFor();
 assert.ok(await yearly.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;}),'the purchase cohort fits a mobile viewport');
 assert.equal(await yearly.getAttribute('data-year-start'),'2026-04-01');
 assert.equal(await yearly.getAttribute('data-year-type'),'absolute');
 assert.match(await page.locator('[data-returns-type-desc]').innerText(),/Purchase-to-value.*weighted/);
 assert.equal(await page.locator('[data-returns-from]').isDisabled(),true);
 assert.equal(await page.locator('[data-returns-to]').isDisabled(),true);
 const counts=await yearly.evaluate(el=>({included:+el.dataset.yearIncluded,missing:+el.dataset.yearMissing,older:+el.dataset.yearOlder,total:+el.dataset.yearTotal,pct:+el.dataset.yearReturn}));
 assert.ok(counts.included>10);assert.equal(counts.included+counts.missing+counts.older,counts.total);
 const purchases=await yearly.locator('[data-year-row]').evaluateAll(els=>els.map(el=>({key:el.dataset.yearKey,cost:+el.dataset.yearCost,value:+el.dataset.yearValue,first:el.dataset.yearFirst,last:el.dataset.yearLast,pct:+el.dataset.yearPct})));
 assert.equal(new Set(purchases.map(p=>p.key)).size,purchases.length);
 assert.ok(purchases.every(p=>p.first>='2026-04-01' && p.last<='2026-11-05'));
 const weighted=purchases.reduce((n,p)=>n+p.value*p.pct,0)/purchases.reduce((n,p)=>n+p.value,0);
 assert.ok(Math.abs(weighted-counts.pct)<1e-8,'this year’s return uses only the included units and their portfolio weights');
 const costSort = yearly.locator('th[data-col="cost"] [data-col-button]');
 await revealTableControl(costSort);
 assert.ok(await costSort.evaluate(el => {
  const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return hit === el || el.contains(hit);
 }), 'the mobile cost sort is exposed beside the frozen investment name');
 await costSort.click();
 const costs=await yearly.locator('[data-year-row]').evaluateAll(els=>els.map(el=>+el.dataset.yearCost));
 assert.ok(costs.every((n,i)=>i===0||n<=costs[i-1]),'purchase-cost sorting follows the real amounts, highest first');
 await yearly.getByRole('button',{name:'What is included in this year’s investments?',exact:true}).click();
 assert.match(await dialog.innerText(),/older purchases/);
 await dialog.getByText(`Dates or values to check (${counts.missing})`,{exact:true}).click();
 assert.equal(await dialog.locator('[data-year-gap]').count(),counts.missing);
 await page.screenshot({path:`${out}/invested-year-mobile-coverage.png`});
 await page.keyboard.press('Escape');
 await page.getByRole('textbox',{name:'Search this year’s investments',exact:true}).fill('no-such-holding-12345');
 assert.equal(await yearly.locator('[data-year-row]').count(),0);
 await page.getByRole('textbox',{name:'Search this year’s investments',exact:true}).fill('');
 await page.locator('[data-returns-type-select]').selectOption('xirr');
 await page.waitForFunction(()=>document.querySelector('[data-invested-year]')?.dataset.yearType==='xirr');
 // Every purchase this year is under a year old, so XIRR shows the same absolute return (Stage 10hk).
 assert.ok(Math.abs(Number(await yearly.getAttribute('data-year-return'))-counts.pct)<1e-9, 'this year\'s purchases are never annualised');
 await page.reload();await yearly.waitFor();assert.equal(await yearly.getAttribute('data-year-type'),'xirr');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-returns-type-select]').selectOption('absolute');
 await page.screenshot({path:`${out}/invested-year-desktop.png`});
 results.push({period:'invested-year',...counts});
 await page.locator('[data-returns-period="fytd"]').click();await summary.waitFor();
 assert.equal(await yearly.count(),0,'other periods leave the purchase cohort mode');
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));
 console.log('Historical market return: all six periods, three return types, totals, three coverage tabs, complete holding/account membership, missing-data actions, retry, sector regrouping, kept histories and mobile passed.',results);
} catch(error) { await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error; } finally {await browser.close();}
