// A local/preview browser regression. Prices are explicit test fixtures, never written to records.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import ExcelJS from 'exceljs';
const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname) || /^[a-f0-9]{8}\.glowventures-1xw\.pages\.dev$/.test(new URL(base).hostname), 'tests use local or immutable preview only');
const out = '.cache/assumed-holdings/browser'; await fs.mkdir(out,{recursive:true});
const bundle = await build({stdin:{contents:`export * from './src/data/glowData'; export {CAPTURE,stubShareFeed} from './src/lib/__tests__/liveBook'; export {shareCandidates} from './src/lib/depositoryShares'; export {quoteSymbolFor} from './src/lib/quotes';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',logLevel:'error'});
const book = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const quotes = book.stubShareFeed();
for (const p of [...book.BOOK_POSITIONS,...book.shareCandidates()]) {
 const q = quotes.quotes[p.symbol], key = book.quoteSymbolFor(p);
 if (q && key) quotes.quotes[key] = {...q,tradedAt:quotes.asOf};
}
const dates = []; for(let ms=Date.parse('2020-01-01');ms<=Date.parse(book.CAPTURE.verifiedThrough);ms+=864e5) dates.push(new Date(ms).toISOString().slice(0,10));
const prices = dates.map((_,i)=>100+i*.02);
const browser = await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
let page;
try {
 const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) {
  const password = execFileSync('/usr/bin/security',['find-generic-password','-s','codex.glowventures.dashboard','-a','glowventures-1xw.pages.dev','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trimEnd();
  const login = await context.request.post(base+'/__auth/login?next=%2Fcio',{form:{password},maxRedirects:0}); assert.equal(login.status(),302);
 }
 page = await context.newPage(); await page.clock.setFixedTime(new Date(quotes.asOf));
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'unreachable'}}));
 await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await page.route('**/api/quotes',r=>r.fulfill({json:{ok:true,...quotes}}));
 await page.route('**/api/corporate-actions?*',r=>r.fulfill({json:{ok:true,feed:book.CAPTURE}}));
 await page.route('**/data/corporate-actions.json',r=>r.fulfill({json:book.CAPTURE}));
 await page.route('**/api/market-history?*',r=>{
  const q=new URL(r.request().url()).searchParams, symbol=q.get('symbol'), fund=q.get('fund');
  const splits=book.CAPTURE.rows.filter(x=>x.ticker===symbol&&['split','bonus'].includes(x.type)&&x.factor&&x.exDate<=book.CAPTURE.verifiedThrough).map(x=>({date:x.exDate,factor:x.factor}));
  return r.fulfill({json:{ok:true,version:2,symbol:fund||symbol+'.NS',isin:q.get('isin'),name:fund?'Example Growth NAV fixture':symbol,source:'Public-price layout fixture',basis:fund?'nav':'adjusted-close',first:dates[0],last:dates.at(-1),t:dates,v:prices,c:prices,splits}});
 });
 await page.goto(base+'/cio?tab=returns&rp=custom&rfrom=2026-09-01&rto=2026-10-22&rtype=absolute&seg=security&tiles=value,gain,fytd');
 const panel=page.locator('[data-segment-returns]'); await panel.waitFor();
 // Use the actual toolbar so this test remains independent of URL parameter spelling.
 await page.locator('[data-returns-period="custom"]').click();
 const inputs=page.locator('input[type="date"]'); await inputs.nth(0).fill('2026-09-01'); await inputs.nth(1).fill('2026-10-22');
 await page.waitForFunction(()=>Number(document.querySelector('[data-segment-returns]')?.dataset.segAssumed)>0);
 await page.waitForFunction(()=>document.querySelector('[data-market-summary]')?.dataset.marketPending==='0');
 const assumed=Number(await panel.getAttribute('data-seg-assumed')); assert.ok(assumed>=10);
 const hdfc=panel.locator('[data-seg-row]').filter({hasText:'Smartworks'}); await hdfc.first().waitFor();
 assert.ok(await hdfc.first().locator('[data-holding-assumption]').count()>0,'March HDFC shares now carry a period return');
 await hdfc.first().getByRole('button',{name:'Why is this holding assumed?',exact:true}).first().click();
 const dialog=page.getByRole('dialog'); await dialog.waitFor();
 assert.match(await dialog.locator('[data-assumption-explanation]').innerText(),/No sale appears in the records we have\. We assume Bharat Jaisinghani still holds these shares\./);
 await page.screenshot({path:out+'/owner-explanation.png'}); await page.keyboard.press('Escape');
 const bridge=await page.locator('[data-capital-bridge]').evaluate(el=>({...el.dataset}));
 assert.ok(Math.abs(Number(bridge.bridgeOpening)+Number(bridge.bridgeAdded)-Number(bridge.bridgeTaken)+Number(bridge.bridgeGain)-Number(bridge.bridgeClosing))<.01);
 assert.ok(Math.abs(Number(bridge.bridgeGain)-Number(await panel.getAttribute('data-seg-total-gain')))<.01);
 // Exported numeric cells remain numeric; provenance survives in its own column.
 const table=panel.locator('table[data-seg-table]');
 const pending=page.waitForEvent('download'); await table.getByRole('button',{name:'Export Excel',exact:true}).click();
 const download=await pending; const file=out+'/assumed-holdings.xlsx'; await download.saveAs(file);
 const workbook=new ExcelJS.Workbook(); await workbook.xlsx.readFile(file); const sheet=workbook.worksheets[0];
 assert.equal(sheet.views[0].state,'frozen'); assert.ok(sheet.columns.every(c=>c.width>=12));
 const values=sheet.getSheetValues().flat(2); assert.ok(values.includes('Holding basis')); assert.ok(values.some(v=>typeof v==='string'&&v.includes('Assumed held')));
 assert.ok(values.some(v=>typeof v==='number'&&Number.isFinite(v)));
 await page.locator('[data-returns-period="fytd"]').click(); await page.locator('[data-returns-type-select]').selectOption('xirr');
 const card=page.locator('[data-tile-slot="fytd"] [data-card-coverage]');
 await page.waitForFunction(()=>Number(document.querySelector('[data-tile-slot="fytd"] [data-holding-assumption]')?.dataset.assumedCount)>0);
 assert.ok(Math.abs(Number(await card.getAttribute('data-card-gain'))-Number(await panel.getAttribute('data-seg-total-gain')))<.01);
 assert.ok(Math.abs(Number(await card.getAttribute('data-card-return'))-Number(await panel.getAttribute('data-seg-total-period-ret')))<1e-7);
 await page.setViewportSize({width:390,height:844});
 await panel.locator('[data-holding-assumption] button').first().click(); await dialog.waitFor();
 assert.ok(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;}));
 await page.screenshot({path:out+'/mobile-explanation.png'}); await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/results.json',JSON.stringify({base,assumedSeptemberHoldings:assumed,fytdAssumedHoldings:Number(await panel.getAttribute('data-seg-assumed')),bridgeTies:true,headlineMatches:true,excel:true,mobile:true,errors},null,2));
 console.log('Assumed holdings: real-book September gaps, owner info, bridge, FYTD headline, Excel basis/frozen headers and mobile passed.',{assumed});
} catch(error) { await page?.screenshot({path:out+'/failure.png'}).catch(()=>{}); throw error; } finally {await browser.close();}
