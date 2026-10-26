// Read-only browser regression against a local build; no production store writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.match(new URL(base).hostname, /^(127\.0\.0\.1|localhost)$/, 'Use local BASE');
const out = path.resolve('.cache/source-trace/browser'); await fs.mkdir(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
const context = await browser.newContext({viewport:{width:1512,height:1000}});
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', r => r.fulfill({status:503,json:{ok:false}}));
const demat = 'motilal-oswal-financial-services-demat-1201090012539150';
const doc = demat+'-2026-07-31-demat-transactions';
const motilal = 'motilal-oswal-arbitrage-fund-direct-plan-growth';
const gotoStock = key => page.goto(base+'/stock/'+key);
try {
  await gotoStock(motilal);
  const units = page.locator(`[data-account-row="${demat}"] a[data-source-metric="quantity"]`);
  await units.waitFor(); assert.match(await units.innerText(), /2,80,67,435/);
  assert.equal(new URL(await units.getAttribute('href'),base).searchParams.get('file'),doc);
  await units.click();
  await page.locator(`[data-statement-preview="${doc}"]`).waitFor();
  await page.locator('[data-selected-source-record="/transactions"]').getByText(/28067435\.434/).last().waitFor();
  await page.locator('canvas[data-pdf-page="5"]').waitFor({timeout:30000});
  assert.equal(await page.getByLabel('PDF page',{exact:true}).inputValue(),'5');
  const highlight = page.locator('mark[data-pdf-source-value="28067435.434"]');
  await highlight.waitFor();
  await highlight.evaluate(el => {
    const r = el.getBoundingClientRect(), v = el.closest('[data-preview-pdf]').getBoundingClientRect();
    if (r.top < v.top || r.bottom > v.bottom) throw Error('Exact source number must be scrolled into view');
    if (getComputedStyle(el).backgroundColor !== 'rgba(255, 230, 0, 0.6)') throw Error('Source marker must be yellow');
  });
  assert.equal(await highlight.getAttribute('data-pdf-source-field'), 'closing');
  await page.getByLabel('PDF zoom',{exact:true}).selectOption('1.5');
  await highlight.waitFor();
  await page.screenshot({path:path.join(out,'demat-closing-source.png')});
  await page.locator('[data-source-back]').click();
  assert.ok(page.url().includes('/stock/'+motilal));

  await gotoStock(motilal);
  const nil = page.locator('[data-account-row="motilal-oswal-mutual-fund-90414963315"] a[data-source-metric="quantity"]');
  await nil.waitFor(); assert.equal((await nil.innerText()).trim(),'0'); await nil.click();
  await page.locator('[data-statement-preview="motilal-oswal-mutual-fund-90414963315-2026-09-30-holdings"]').waitFor();
  await page.locator('[data-selected-source-record="/holdings/0"] [data-source-field="quantity"]').getByText('0',{exact:true}).waitFor();

  await gotoStock('kotak-arbfd-dp-grow');
  await page.locator('button[data-source-metric="quantity"]').first().click();
  const combined = page.getByRole('dialog',{name:'Quantity held sources'}); await combined.waitFor();
  const documents = await combined.locator('a[data-source-document]').evaluateAll(a=>a.map(el=>el.dataset.sourceDocument));
  assert.ok(documents.some(d=>d.includes('1201090012539150')));
  assert.ok(documents.some(d=>d.includes('1201090032387399')));
  await page.screenshot({path:path.join(out,'combined-quantity-sources.png')});
  await combined.locator('a[data-source-document]').first().click();
  await page.locator('[data-source-back]').waitFor();
  assert.ok(await page.locator('[data-statement-preview]').evaluate(el=>parseInt(getComputedStyle(el.parentElement).zIndex)>60), 'statement stays above its source list');
  await page.locator('[data-source-back]').click();

  await gotoStock(motilal);
  await page.locator('button[data-source-metric="marketValue"]').first().click();
  const market = page.getByRole('dialog',{name:'Market value sources'});
  await market.getByText('AMFI',{exact:true}).waitFor(); assert.match(await market.innerText(), /Published NAV/);

  await page.goto(base+'/monitor');
  await page.getByRole('tab',{name:'Category',exact:true}).click();
  await page.getByRole('button',{name:'All holdings',exact:true}).click();
  await page.getByPlaceholder('Search holdings…').fill('Motilal Oswal Arbitrage');
  await page.getByRole('option',{name:/Motilal Oswal Arbitrage Fund/i}).click();
  await page.getByRole('heading',{name:'Portfolio Monitor',exact:true}).click();
  const parent = page.locator(`[data-security-key="${motilal}"][data-tree-parent]`);
  if (await parent.getAttribute('data-tree-parent') !== 'open') await parent.locator('button[aria-expanded]').first().click();
  const venue = page.locator(`[data-venue-account="${demat}"]`); await venue.waitFor();
  assert.ok(await venue.locator('a[data-source-metric="statement"]').count() >= 2,'owner/provider/account labels are linked');
  assert.equal(new URL(await venue.locator('a[data-source-metric="quantity"]').getAttribute('href'),base).searchParams.get('file'),doc);
  // Opening evidence must retain actual DOM state, not reconstruct a default
  // Monitor. Keep the selected holding, Cash category, expansion and scroll.
  await page.getByRole('tab',{name:'Cash',exact:true}).click();
  await venue.locator('a[data-source-metric="quantity"]').scrollIntoViewIfNeeded();
  const origin = page.url();
  const snapshot = await page.locator('main').evaluate(el => {
    const scrolls = [...el.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+5 && e.clientWidth>0 && /auto|scroll/.test(getComputedStyle(e).overflowX));
    for (const scroll of scrolls) scroll.scrollLeft = Math.min(65,scroll.scrollWidth-scroll.clientWidth);
    window.__sourceReturn = scrolls.map(el=>({el,left:el.scrollLeft,top:el.scrollTop}));
    return {top:el.scrollTop};
  });
  await venue.locator('a[data-source-metric="quantity"]').click();
  await page.locator(`[data-statement-preview="${doc}"]`).waitFor();
  assert.equal(await page.locator('a a, button button, a button, button a').count(),0,'source links never nest interactive controls');
  await page.locator('[data-source-back]').click();
  assert.equal(page.url(), origin);
  assert.ok(await page.evaluate(()=>window.__sourceReturn.every(({el,left,top})=>el.isConnected && Math.abs(el.scrollLeft-left)<=1 && Math.abs(el.scrollTop-top)<=1)), 'same table containers and horizontal/vertical scroll survive');
  assert.equal(await parent.getAttribute('data-tree-parent'),'open');
  assert.equal(await page.getByRole('tab',{name:'Cash',exact:true}).getAttribute('aria-selected'),'true');
  assert.ok(Math.abs(await page.locator('main').evaluate(el=>el.scrollTop)-snapshot.top) <= 1);
  assert.equal(await page.getByRole('button',{name:'All holdings',exact:true}).count(),0,'holding filter stays selected');
  await venue.locator('a[data-source-metric="statement"]').first().click();
  await page.locator('[data-source-back]').waitFor();
  await page.getByRole('button',{name:'Close preview',exact:true}).click();
  assert.equal(page.url(),origin);
  await venue.locator('a[data-source-metric="quantity"]').click();
  await page.locator('[data-source-back]').waitFor();
  await page.goBack();
  assert.equal(page.url(),origin);
  assert.equal(await parent.getAttribute('data-tree-parent'),'open');
  await page.goForward();
  await page.locator('[data-source-back]').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForURL(origin);
  assert.equal(page.url(),origin);
  assert.equal(await parent.getAttribute('data-tree-parent'),'open');
  // A filter must narrow provenance as well as the money. Carnelian's one
  // selected company must not expose every other holding in the account.
  await page.goto(base+'/monitor');
  await page.getByRole('tab',{name:'Category',exact:true}).click();
  await page.locator('[data-monitor-filters-right] button').first().click();
  const clear = page.getByRole('button',{name:'Clear all',exact:true});
  if (await clear.count()) await clear.click();
  await page.getByPlaceholder('Search holdings…').fill('Aditya Birla Capital');
  await page.getByRole('option',{name:/Aditya Birla Capital/i}).click();
  await page.getByRole('heading',{name:'Portfolio Monitor',exact:true}).click();
  const partial = page.locator('tr[data-mandate]').filter({hasText:/Carnelian/i}).first();
  const selected = partial.locator('a[data-source-metric="marketValue"]'); await selected.waitFor();
  const selectedUrl = new URL(await selected.getAttribute('href'),base);
  assert.equal(selectedUrl.searchParams.get('file'),'carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-09-30-appraisal');
  assert.equal(selectedUrl.searchParams.get('record'),'/holdings/0');
  const workbook = new URLSearchParams({path:'source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx',sheet:'Private Investments',rows:'4'});
  await page.goto(base+'/statements?'+workbook);
  const citedSheet = page.getByRole('tab',{name:'Private Investments',exact:true}); await citedSheet.waitFor();
  assert.equal(await citedSheet.getAttribute('aria-selected'),'true');
  assert.match(await page.locator('[data-source-row="true"]').innerText(),/^4\s/);
  await page.getByRole('tab',{name:'Equity',exact:true}).click();
  assert.equal(await page.locator('[data-source-row="true"]').count(),0,'citation highlights never move to an unrelated worksheet');
  await page.screenshot({path:path.join(out,'workbook-citation.png')});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({exactDematDocument:true,closingPage:5,separateNilFolio:true,aggregateSources:true,feedDistinct:true,monitorLabels:true,yellowClosingBalance:true,exactReturnState:true,filteredMandate:true,workbookSheetAndRow:true,errors},null,2));
  console.log('PASS source links: monitor account labels, exact demat closing page, separate nil folio, combined quantities and feed/statement distinction');
} catch(e) {
  await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({url:page.url(),errors,text:(await page.locator('body').innerText()).slice(-10000)},null,2));
  await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{}); throw e;
} finally {await browser.close();}
