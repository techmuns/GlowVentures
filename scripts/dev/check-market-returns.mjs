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
 const summary = page.locator('[data-market-summary]'), table = page.locator('[data-segment-returns]');
 await page.waitForFunction(() => document.querySelector('[data-market-summary]')?.dataset.marketPending === '0');
 assert.ok(Number(await summary.getAttribute('data-market-covered')) > 20, 'stock and fund histories resolve from the actual book');
 assert.ok(requests > 10);
 assert.ok(nseSourceFailures > 0, 'the missing-listing-history fixture was exercised');
 const initialRequests = requests, results = [];
 for (const period of ['fytd','mtd','ytd','y1','y2','y3']) {
  await page.locator(`[data-returns-period="${period}"]`).click();
  for (const type of ['absolute','xirr','cagr']) {
   await page.locator('[data-returns-type-select]').selectOption(type);
   await page.waitForFunction(({ period,type }) => {
    const d=document.querySelector('[data-segment-returns]')?.dataset;
    const selected=document.querySelector('[data-returns-type-select]')?.value;
    const label=document.querySelector('[data-bridge-return-label]')?.textContent ?? '';
    return d?.segPeriod===period && d?.segType===selected && (selected===type || selected==='absolute')
     && (selected==='absolute' || !label.startsWith('Absolute return'));
   }, {period,type});
   const from = await table.getAttribute('data-seg-start'), to = '2026-10-21';
   const days = (Date.parse(to)-Date.parse(from))/864e5;
   // XIRR and CAGR per year from a year only; under a year every type is the period's own move (Stage 10hk).
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
 const of = (period, type) => results.find(r => r.period===period && r.type===type).actual;
 for (const period of ['fytd','mtd','ytd']) {
  assert.ok(Math.abs(of(period,'xirr')-of(period,'absolute'))<1e-9 && Math.abs(of(period,'cagr')-of(period,'absolute'))<1e-9, `${period}: under a year every type is the absolute return`);
 }
 for (const period of ['y2','y3']) assert.ok(Math.abs(of(period,'xirr')-of(period,'absolute'))>0.01, `${period}: from a year XIRR is per year`);
 await summary.getByRole('button', { name: 'What is included in total market return?', exact: true }).click();
 const dialog = page.getByRole('dialog'); await dialog.waitFor();
 assert.equal(await dialog.getByRole('tab').count(),3);
 assert.equal(await dialog.getByRole('tab',{name:'Return Overview',exact:true}).getAttribute('aria-selected'),'true');
 assert.match(await dialog.innerText(),/values today/);assert.match(await dialog.innerText(),/Gain \/ loss/);
 const detail=dialog.locator('[data-market-details]');
 const includedCount=Number(await detail.getAttribute('data-market-included-count'));
 const missingCount=Number(await detail.getAttribute('data-market-missing-count'));
 const holdingCount=Number(await detail.getAttribute('data-market-holding-total'));
 assert.equal(includedCount+missingCount,holdingCount,'every holding belongs to one of the two lists');
 assert.equal(await dialog.locator('[data-market-source]').count(),0,'Overview stays short; no long list is mounted');
 await page.screenshot({path:`${out}/overview-tab.png`});
 await dialog.locator('[data-market-tab="included"]').click();
 assert.equal(await dialog.locator('[data-market-source]').count(),includedCount);
 const includedKeys=await dialog.locator('[data-market-source]').evaluateAll(els=>els.map(el=>el.dataset.marketHoldingKey));
 assert.equal(new Set(includedKeys).size,includedCount,'separate accounts remain separate entries');
 assert.ok(await dialog.locator('[data-market-source]').filter({hasText:'PMS mandates'}).count()>0);
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
 const aif=dialog.locator('[data-market-gap]').filter({has:page.locator('[data-market-category]').filter({hasText:/^AIF$/})}).first();
 assert.equal(await aif.locator('[data-market-through]').innerText(),await aif.getByRole('heading').innerText());
 assert.match(await aif.locator('[data-market-needed]').innerText(),/fund manager.*NAV/);
 // Listings can become available (NSE now has its own BSE listing). Exercise
 // a real missing-price row instead of requiring a named company to stay unlisted.
 const unpriced = dialog.locator('[data-market-gap]').filter({has:page.locator('[data-market-missing-data]').filter({hasText:'Public price history is missing.'})}).first();
 const missingName = await unpriced.getByRole('heading').innerText();
 await dialog.getByRole('textbox',{name:'Search missing holdings'}).fill(missingName);
 const missingStock = dialog.locator('[data-market-gap]').first();
 assert.match(await missingStock.locator('[data-market-missing-data]').innerText(), /Public price history is missing/);
 assert.match(await missingStock.locator('[data-market-needed]').innerText(), /Return column/);
 assert.ok(await missingStock.evaluate(el => Boolean(el.querySelector('[data-market-missing-data]').compareDocumentPosition(el.querySelector('[data-market-owner]')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'the missing data comes before account metadata');
 await dialog.getByRole('textbox',{name:'Search missing holdings'}).fill('National Stock Exchange of India');
 const nse = dialog.locator('[data-market-gap]').first();
 assert.match(await nse.locator('[data-market-missing-data]').innerText(), /The price source has no history for this listing/);
 assert.match(await nse.locator('[data-market-needed]').innerText(), /price history.*exact stock or fund.*selected period/);
 assert.ok(await nse.evaluate(el => Boolean(el.querySelector('[data-market-missing-data]').compareDocumentPosition(el.querySelector('[data-market-owner]')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'the missing data comes before account metadata');
 await dialog.getByRole('textbox',{name:'Search missing holdings'}).fill('Karur');
 assert.ok(await dialog.locator('[data-market-gap]').count()>0);
 assert.match(await dialog.innerText(),/No new statement/);assert.match(await dialog.innerText(),/Account/);
 await page.screenshot({path:`${out}/coverage.png`});
 await dialog.locator('[data-market-tab="missing"]').focus();
 await page.keyboard.press('ArrowRight');
 assert.equal(await dialog.locator('[data-market-tab="overview"]').getAttribute('aria-selected'),'true');
 await page.keyboard.press('End');
 assert.equal(await dialog.locator('[data-market-tab="missing"]').getAttribute('aria-selected'),'true');
 await page.keyboard.press('Escape');
 assert.equal(await summary.getByRole('button',{name:'What is included in total market return?',exact:true}).evaluate(el=>el===document.activeElement),true);
 const before = Number(await summary.getAttribute('data-market-covered')); retrying=true;
 await page.locator('[data-market-retry]').click();
 await page.waitForFunction(n=>Number(document.querySelector('[data-market-summary]')?.dataset.marketCovered)>n, before);
 await table.locator('[data-seg-axis-option="sector"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-segment-returns]')?.dataset.segAxis==='sector');
 // Stage 10gs: the Sector axis is Sector Composition's sectors, with the market return per sector.
 await page.waitForFunction(()=>document.querySelector('[data-sector-attribution]')?.dataset.status==='ready');
 assert.ok(await table.locator('[data-sa-cell="market"][data-market-return]:not([data-market-return=""])').count()>5);
 await page.screenshot({path:`${out}/sector-market-returns.png`});
 // Stage 10gu: every history is now kept in this browser, so the next visit draws the figure without fetching any.
 const covered = Number(await summary.getAttribute('data-market-covered')), kept = requests;
 await page.reload();
 await page.waitForFunction(n => Number(document.querySelector('[data-market-summary]')?.dataset.marketCovered) === n
   && document.querySelector('[data-market-summary]')?.dataset.marketPending === '0', covered);
 await page.waitForTimeout(1000);
 assert.equal(requests, kept, 'a reload draws the kept histories instead of refetching them');
 await page.setViewportSize({width:390,height:844});
 await summary.getByRole('button', {name:'What is included in total market return?',exact:true}).click(); await dialog.waitFor();
 assert.equal(await dialog.locator('[data-market-tab="overview"]').getAttribute('aria-selected'),'true','reopening starts on Overview');
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
 assert.ok(purchases.every(p=>p.first>='2026-04-01' && p.last<='2026-10-22'));
 const weighted=purchases.reduce((n,p)=>n+p.value*p.pct,0)/purchases.reduce((n,p)=>n+p.value,0);
 assert.ok(Math.abs(weighted-counts.pct)<1e-8,'this year’s return uses only the included units and their portfolio weights');
 await yearly.locator('th[data-col="cost"]').click();
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
