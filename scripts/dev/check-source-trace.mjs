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
  await page.locator('canvas[data-pdf-page="5"]').waitFor({timeout:30000});
  assert.equal(await page.locator('[data-selected-source-record]').count(), 0, 'technical source records do not crowd the original PDF');
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
  // Read further into the continuous document: history must retain the later
  // reading position rather than jumping back to the original page-5 citation.
  await page.locator('[data-pdf-scroll]').evaluate(el => {
    const paper = el.querySelector('[data-pdf-paper="6"]');
    el.scrollTop = paper.offsetTop + paper.offsetHeight * 0.25; el.scrollLeft = 37;
  });
  await page.waitForFunction(() => document.querySelector('input[aria-label="PDF page"]')?.value === '6');
  await page.locator('canvas[data-pdf-page="6"]').waitFor();
  await page.locator('[data-pdf-paper="6"] [role="status"]').waitFor({state:'hidden'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const pdfPosition = await page.locator('[data-navigation-scroll="pdfpreview-1"]').evaluate(el => ({top:el.scrollTop,left:el.scrollLeft}));
  await page.locator('[data-source-back]').click();
  assert.ok(page.url().includes('/stock/'+motilal));
  await page.goForward();
  await page.locator('canvas[data-pdf-page="6"]').waitFor();
  await page.locator('[data-pdf-paper="6"] [role="status"]').waitFor({state:'hidden'});
  await page.waitForFunction(expected => {
    const el = document.querySelector('[data-navigation-scroll="pdfpreview-1"]');
    return el && Math.abs(el.scrollTop-expected.top)<1 && Math.abs(el.scrollLeft-expected.left)<1;
  }, pdfPosition);
  assert.equal(await page.getByLabel('PDF zoom',{exact:true}).inputValue(),'1.5');
  assert.equal(await page.getByLabel('PDF page',{exact:true}).inputValue(),'6');
  await page.locator('[data-source-back]').click();

  // This real holding statement prints the units in both Free Balance and
  // Total Holding. The citation must mark the latter on the exact ISIN row.
  const trust = 'motilal-oswal-financial-services-demat-1201090032387399';
  const holdingsDoc = trust+'-2026-07-31-holdings';
  for (const [stock, value, expectedY] of [
    ['icici-liqf-d-growth', '46654.378', 0.268],
    ['inves-arbf-d-grow', '1092470.994', 0.294],
    ['kotak-arbfd-dp-grow', '613293.929', 0.320],
  ]) {
    await gotoStock(stock);
    const quantity = page.locator(`[data-account-row="${trust}"] a[data-source-metric="quantity"]`);
    await quantity.waitFor();
    const source = new URL(await quantity.getAttribute('href'), base);
    assert.equal(source.searchParams.get('file'), holdingsDoc);
    assert.equal(source.searchParams.get('sourceValue'), value);
    assert.equal(source.searchParams.get('field'), 'quantity');
    await quantity.click();
    await page.locator(`[data-statement-preview="${holdingsDoc}"] canvas[data-pdf-page="1"]`).waitFor({timeout:30000});
    const mark = page.locator(`mark[data-pdf-source-value="${value}"]`);
    await mark.waitFor(); assert.equal(await mark.count(), 1);
    await mark.evaluate((el, y) => {
      const r = el.getBoundingClientRect(), paper = el.closest('[data-pdf-paper]').getBoundingClientRect();
      const x = (r.left-paper.left)/paper.width, top = (r.top-paper.top)/paper.height;
      // Independent coordinates from the printed PDF: Free Balance is at 33%
      // of page width; Total Holding is at 73%, with three distinct rows.
      if (x < 0.70 || x > 0.79 || Math.abs(top-y) > 0.012) throw Error('Highlight must select the exact ISIN row in Total Holding');
      if (getComputedStyle(el).backgroundColor !== 'rgba(255, 230, 0, 0.6)') throw Error('Source marker must be yellow');
    }, expectedY);
    assert.equal(await page.getByText('Exact number could not be uniquely highlighted in this statement.',{exact:true}).count(), 0);
    if (stock === 'icici-liqf-d-growth') await page.screenshot({path:path.join(out,'icici-liquid-total-holding.png')});
    await page.locator('[data-source-back]').click();
    assert.ok(page.url().includes('/stock/'+stock));
  }

  await gotoStock(motilal);
  const nil = page.locator('[data-account-row="motilal-oswal-mutual-fund-90414963315"] a[data-source-metric="quantity"]');
  await nil.waitFor(); assert.equal((await nil.innerText()).trim(),'0');
  const nilSource = new URL(await nil.getAttribute('href'),base);
  assert.equal(nilSource.searchParams.get('record'),'/holdings/0');
  assert.equal(nilSource.searchParams.get('sourceValue'),'0');
  await nil.click();
  await page.locator('[data-statement-preview="motilal-oswal-mutual-fund-90414963315-2026-09-30-holdings"]').waitFor();
  // This folio uses the protected preview API, deliberately blocked above.
  // Its exact document/record/value must remain linked without a raw-record pane.
  assert.equal(await page.locator('[data-selected-source-record]').count(), 0);

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
  await combined.waitFor();
  const combinedOrigin = page.url();
  let releaseCombinedManifest;
  const combinedPending = new Promise(resolve=>{releaseCombinedManifest=resolve;});
  await page.route('**/audit/manifest.json',async route=>{await combinedPending;await route.fulfill({status:503,body:'unavailable'});});
  await combined.locator('a[data-source-document]').first().click();
  await page.getByRole('dialog',{name:'Statement source',exact:true}).waitFor();
  await page.keyboard.press('Escape');await page.waitForURL(combinedOrigin);
  await combined.waitFor();
  releaseCombinedManifest();await page.unroute('**/audit/manifest.json');
  await page.route('**/audit/manifest.json',route=>route.fulfill({status:503,body:'unavailable'}));
  await combined.locator('a[data-source-document]').first().click();
  await page.getByRole('alert').filter({hasText:'This exact source statement could not be opened.'}).waitFor();
  await page.keyboard.press('Escape');await page.waitForURL(combinedOrigin);
  await combined.waitFor();await page.unroute('**/audit/manifest.json');

  await gotoStock(motilal);
  await page.locator('button[data-source-metric="marketValue"]').first().click();
  const market = page.getByRole('dialog',{name:'Market value sources'});
  await market.getByText('AMFI',{exact:true}).waitFor(); assert.match(await market.innerText(), /published price \(NAV\)/);

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
  // Slow and failed manifest reads retain the same keyboard exit and trap.
  const manifestPattern = '**/audit/manifest.json';
  let releaseManifest;
  const pending = new Promise(resolve => { releaseManifest = resolve; });
  await page.route(manifestPattern, async route => { await pending; await route.fulfill({status:503,body:'unavailable'}); });
  await venue.locator('a[data-source-metric="quantity"]').click();
  const loadingDialog = page.getByRole('dialog',{name:'Statement source',exact:true});
  await loadingDialog.waitFor();
  await loadingDialog.getByRole('button').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.activeElement?.closest('[aria-label="Statement source"]'));
  await page.keyboard.press('Tab');
  assert.ok(await loadingDialog.evaluate(el=>el.contains(document.activeElement)));
  await page.keyboard.press('Shift+Tab');
  assert.ok(await loadingDialog.evaluate(el=>el.contains(document.activeElement)));
  await page.keyboard.press('Escape'); await page.waitForURL(origin);
  releaseManifest(); await page.unroute(manifestPattern);
  await page.route(manifestPattern, route=>route.fulfill({status:503,body:'unavailable'}));
  await venue.locator('a[data-source-metric="quantity"]').click();
  await page.getByRole('alert').filter({hasText:'This exact source statement could not be opened.'}).waitFor();
  await page.keyboard.press('Escape'); await page.waitForURL(origin);
  await page.unroute(manifestPattern);
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
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({exactDematDocument:true,closingPage:5,separateNilFolio:true,aggregateSources:true,feedDistinct:true,monitorLabels:true,yellowClosingBalance:true,yellowTotalHoldingColumn:true,exactReturnState:true,loadingAndFailedDialog:true,underlyingSourceListRetained:true,filteredMandate:true,workbookSheetAndRow:true,errors},null,2));
  console.log('PASS source links: monitor account labels, exact demat closing page, ICICI/Invesco/Kotak Total Holding highlights, separate nil folio, combined quantities and feed/statement distinction');
} catch(e) {
  await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({url:page.url(),errors,text:(await page.locator('body').innerText()).slice(-10000)},null,2));
  await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{}); throw e;
} finally {await browser.close();}
