// Read-only regression for history entries, including a real fund drilldown.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.match(new URL(base).hostname, /^(127\.0\.0\.1|localhost)$/, 'Use local BASE');
const out = path.resolve('.cache/navigation-state-check'); await fs.mkdir(out,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page = await browser.newPage({viewport:{width:1512,height:1000}}), errors = [];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/**',route=>route.fulfill({status:503,json:{ok:false}}));
const kotak = 'kotak-arbfd-dp-grow';
const row = () => page.locator(`[data-security-key="${kotak}"][data-tree-parent]`);
const link = () => row().locator(`a[href="/stock/${kotak}"]`).first();
const cash = () => page.getByRole('tab',{name:'Cash',exact:true});
const back = () => page.locator('[data-page-nav-back]').click();
const assertCash = async () => {
  await cash().waitFor();
  assert.equal(await cash().getAttribute('aria-selected'),'true');
  assert.equal(await row().getAttribute('data-tree-parent'),'open');
};
try {
  await page.goto(base+'/monitor?group=category');
  await cash().click();
  await row().locator('button[aria-expanded]').first().click();
  await page.locator('[data-monitor-table="holdings"] button[data-col-button="qty"]').click();
  await link().scrollIntoViewIfNeeded();
  const origin = page.url(), entry = await page.evaluate(()=>history.state.key);
  const position = await page.locator('[data-navigation-scroll="monitor-holdings"]').evaluate(el=>{
    el.scrollLeft=45;el.scrollTop=35;return {left:el.scrollLeft,top:el.scrollTop};
  });
  assert.ok(position.left>0 && position.top>0,'exercise both directions of table scrolling');
  await link().click();
  await page.waitForURL(base+'/stock/'+kotak);
  await back(); await page.waitForURL(origin); await assertCash();
  await page.waitForFunction(p=>{
    const el=document.querySelector('[data-navigation-scroll="monitor-holdings"]');
    return el && Math.abs(el.scrollLeft-p.left)<=1 && Math.abs(el.scrollTop-p.top)<=1;
  },position);
  assert.equal(await page.locator('[data-monitor-table="holdings"] th[data-col="qty"]').getAttribute('aria-sort'),'descending');
  await page.screenshot({path:path.join(out,'cash-return.png')});
  await page.goForward(); await page.waitForURL(base+'/stock/'+kotak);
  await page.goBack(); await page.waitForURL(origin); await assertCash();

  // Preserve the narrower filters too, then create an independent Monitor visit.
  await page.locator('[data-entity-filter]').selectOption('Ajay Jaisinghani');
  await page.getByRole('button',{name:'All holdings',exact:true}).click();
  await page.getByPlaceholder('Search holdings…').fill('Kotak Arbitrage');
  await page.getByRole('option',{name:/Kotak Arbitrage Fund/i}).click();
  await page.getByRole('heading',{name:'Portfolio Monitor',exact:true}).click();
  await link().click(); await page.waitForURL(base+'/stock/'+kotak);
  await page.getByRole('link',{name:'Portfolio Monitor',exact:true}).click();
  await page.getByRole('tab',{name:'Category',exact:true}).click();
  await page.getByRole('tab',{name:'ETF',exact:true}).click();
  assert.equal(await page.locator('[data-entity-filter]').inputValue(),'All');
  assert.equal(await page.getByRole('button',{name:'All holdings',exact:true}).count(),1);
  await page.locator('[data-monitor-table="holdings"] a[href^="/stock/"]').first().click();
  await page.waitForURL(url=>url.pathname.startsWith('/stock/'));
  await back();
  assert.equal(await page.getByRole('tab',{name:'ETF',exact:true}).getAttribute('aria-selected'),'true');
  await page.goBack(); await page.waitForURL(base+'/monitor');
  await page.goBack(); await page.waitForURL(base+'/stock/'+kotak);
  await back(); await page.waitForURL(origin); await assertCash();
  assert.equal(await page.evaluate(()=>history.state.key),entry);
  assert.equal(await page.locator('[data-entity-filter]').inputValue(),'Ajay Jaisinghani');
  assert.equal(await page.getByRole('button',{name:'All holdings',exact:true}).count(),0);
  await page.reload(); await assertCash();
  assert.equal(await page.evaluate(()=>history.state.key),entry,'reload retains the same history entry');
  assert.equal(await page.locator('[data-entity-filter]').inputValue(),'Ajay Jaisinghani');
  assert.equal(await page.getByRole('button',{name:'All holdings',exact:true}).count(),0);
  await page.screenshot({path:path.join(out,'filtered-return.png')});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({fundBackToCash:true,browserBackForward:true,expandedRows:true,sortRetained:true,tableScroll:true,holdingAndEntityFilters:true,independentVisits:true,reloadSameEntry:true,errors},null,2));
  console.log('PASS navigation: fund Back returns to Cash, filters/rows/sort/scroll persist, entries stay independent and reload restores');
} catch(error) {
  await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({message:error.message,url:page.url(),errors,text:(await page.locator('body').innerText()).slice(-12000)},null,2));
  await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;
} finally {await browser.close();}
