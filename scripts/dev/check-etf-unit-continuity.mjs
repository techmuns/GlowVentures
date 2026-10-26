// Local browser contract: ETF conversion, source lots, both searches, and an
// unpriced holding's independent acquisition details. Never writes a store.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { installReadModelRoutes } from './read-model-api.mjs';

const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out = path.resolve('.cache/etf-regression/browser');
await fs.mkdir(out,{recursive:true});
const bundle = await build({stdin:{contents:'export { recordedLines, recordedLabel } from "./src/lib/recordedHoldings.ts";',resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const {recordedLines,recordedLabel} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const unpriced = recordedLines().find(l=>l.isin==='INE0MRE01011' && l.recoveredCost);
assert.ok(unpriced,'an independent unpriced holding with known acquisition records exercises the fallback');
const browser = await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context = await browser.newContext({viewport:{width:1512,height:1000},timezoneId:'Asia/Kolkata'});
const page = await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"status":"unreachable"}'}));
await installReadModelRoutes(page);
try {
  for (const [key,quantity,accounts] of [['dsp-gold-etf',14000000,[['12838316','2026-01-22'],['12838335','2026-01-29']]],
    ['dsp-silver-etf',1230000,[['12838316','2025-09-30']]]]) {
    await page.goto(base+'/stock/'+key,{waitUntil:'domcontentloaded'});
    await page.locator(`[data-stock-qty="${quantity}"]`).waitFor();
    assert.equal(await page.locator('[data-stock-recorded-value]').count(),0);
    const table = page.locator('table[data-table-view="stock-positions"]');
    for (const [suffix,date] of accounts) {
      const row=table.locator(`tr[data-account-row$="${suffix}"]`);
      await row.waitFor();
      assert.equal(await row.locator('[data-col-cell="investedOn"]').getAttribute('data-invested-first'),date);
      assert.doesNotMatch(await row.locator('[data-source-metric="costBasis"]').innerText(),/^—$/);
    }
    assert.equal(await table.locator('tr[data-recorded-row]').count(),0,'converted holdings are not repeated as unvalued');
    await page.screenshot({path:path.join(out,key+'.png')});
  }
  await page.goto(base+'/monitor?group=category',{waitUntil:'domcontentloaded'});
  const search=page.getByTestId('smart-search-input');
  await search.fill('dsp');
  for (const key of ['dsp-gold-etf','dsp-silver-etf']) {
    const hit=page.locator(`[data-search-result="holding:${key}"]`); await hit.waitFor();
    assert.doesNotMatch(await hit.innerText(),/not valued/i);
  }
  await page.keyboard.press('Escape');
  const picker=page.locator('[data-multiselect="All holdings"]');
  await picker.locator('[data-multiselect-toggle]').click();
  await picker.locator('input').fill('dsp');
  for (const name of ['DSP Gold ETF','DSP Silver ETF'])
    assert.equal(await picker.locator(`[data-option="${name}"]`).count(),1);
  await page.screenshot({path:path.join(out,'monitor-dsp-search.png')});
  await picker.locator('input').fill(recordedLabel(unpriced.homeKey));
  await picker.locator(`[data-option="${recordedLabel(unpriced.homeKey)}"]`).click();
  await page.keyboard.press('Escape');
  await page.locator('[data-monitor-unvalued]').waitFor();
  const sections=page.locator('[data-section-filter]');
  await sections.locator('[data-section-tab="ETF"]').click();
  assert.equal(await page.locator('[data-monitor-unvalued]').count(),0,'unvalued results obey the active section');
  await sections.locator('[data-section-tab="All"]').click();
  await page.locator('[data-monitor-unvalued]').waitFor();
  await page.locator(`[data-monitor-unvalued] a[href="/stock/${unpriced.homeKey}"]`).click();
  const row=page.locator(`tr[data-recorded-row="${unpriced.accountId}"]`); await row.waitFor();
  assert.doesNotMatch(await row.locator('[data-source-metric="costBasis"]').innerText(),/^—$/);
  assert.equal(await row.locator('[data-col-cell="investedOn"]').getAttribute('data-invested-first'),unpriced.recoveredCost.heldPurchases.first);
  assert.ok(Number(await page.locator('[data-stock-avg-cost]').getAttribute('data-stock-avg-cost'))>0);
  assert.equal(await page.locator('[data-stock-recorded-value]').count(),1,'known cost does not invent a valuation');
  await page.screenshot({path:path.join(out,'unpriced-acquisition.png')});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({goldUnits:14000000,silverUnits:1230000,purchaseDates:true,
    bothSearches:true,unpricedCostAndDate:true,errors},null,2));
  console.log('PASS ETF pages, conversion quantities, original purchase dates, both searches and unpriced acquisition details');
} catch(e) {
  await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({url:page.url(),errors,text:(await page.locator('body').innerText()).slice(-9000)},null,2));
  await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{}); throw e;
} finally {await browser.close();}
