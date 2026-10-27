#!/usr/bin/env node
// All routed pages and their visible tab controls, one browser worker. Read-only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
const base=process.env.BASE??'http://127.0.0.1:4173';
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,'Use local/staging only');
const out=path.resolve('.cache/dashboard-navigation');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1512,height:1000}}), errors=[], cases=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',r=>r.fulfill({status:503,json:{ok:false}}));
async function settled(){
 await page.locator('main h1').first().waitFor({timeout:30000});
 await page.waitForLoadState('networkidle');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
const fingerprint=()=>page.locator('main').evaluate(main=>({
 tabs:[...main.querySelectorAll('[role="tab"][aria-selected="true"], [aria-current="page"]')].map(e=>e.textContent.trim()),
 inputs:[...main.querySelectorAll('input:not([type="file"]):not([type="password"]),select')].filter(e=>e.getClientRects().length).map(e=>[e.getAttribute('placeholder')??e.getAttribute('aria-label')??e.tagName,e.value]),
 windows:[...main.querySelectorAll('[data-table-scroll-end]')].map(e=>[e.getAttribute('data-loaded-rows'),e.getAttribute('data-total-rows')]),
 expanded:[...main.querySelectorAll('[data-navigation-expanded][aria-expanded]')].map(e=>[e.getAttribute('aria-label')??e.textContent.trim(),e.getAttribute('aria-expanded')]),
 details:[...main.querySelectorAll('details[data-navigation-details]')].map(e=>[e.dataset.navigationDetails,e.open]),
 scroll:[['main',main],...[...main.querySelectorAll('[data-navigation-scroll]')].filter(e=>e.getClientRects().length).map(e=>[e.dataset.navigationScroll,e])].map(([id,e])=>[id,Math.round(e.scrollTop),Math.round(e.scrollLeft)]),
}));
async function roundTrip(label,depth=137){
 // Ensure the navigation link is already focused so activating it cannot move a panel.
 const target=new URL(page.url()).pathname==='/statements'?'/monitor':'/statements';
 const away=page.locator(`aside a[href="${target}"]`).first();
 await away.focus();
 await page.locator('main').evaluate((main,depth)=>{
  const ports=[main,...main.querySelectorAll('[data-navigation-scroll]')];
  for(const el of ports){if(!el.getClientRects().length)continue;el.scrollTop=Math.min(depth,el.scrollHeight-el.clientHeight);el.scrollLeft=Math.min(73,el.scrollWidth-el.clientWidth);}
 },depth);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const url=page.url(), expected=await fingerprint();
 await page.keyboard.press('Enter');await settled();
 await page.locator('[data-page-nav-back]').first().click();await settled();
 assert.equal(page.url(),url,label+' URL');
 await assertEventually(expected,label);
 // Exercise browser Forward as well, then the browser's Back.
 await page.goForward();await settled();await page.goBack();await settled();
 await assertEventually(expected,label+' browser Back/Forward');
 cases.push({label,url,ports:expected.scroll.length});
}
async function assertEventually(expected,label){
 const deadline=Date.now()+6000;
 let actual;
 do{actual=await fingerprint();if(JSON.stringify(actual)===JSON.stringify(expected))return;await page.waitForTimeout(100);}while(Date.now()<deadline);
 assert.deepEqual(actual,expected,label);
}
try{
 // Discover real drill-down addresses from the current book, never fabricate an account.
 await page.goto(base+'/monitor?group=category');await settled();
 for(let n=0;n<12;n++){const more=page.getByRole('button',{name:'Load more table rows',exact:true}).first();if(!await more.count())break;await more.click();}
 const links=await page.locator('main a[href]').evaluateAll(els=>els.map(e=>e.getAttribute('href')));
 for(const name of ['PMS mandates','AIF']){
  await page.getByRole('tab',{name,exact:true}).click();await settled();
  links.push(...await page.locator('main a[href]').evaluateAll(els=>els.map(e=>e.getAttribute('href'))));
 }
 const dynamic=['/stock/','/mandate/','/fund/'].map(prefix=>links.find(h=>h.startsWith(prefix))).filter(Boolean);
 const routes=['/cio','/monitor','/private-market','/real-estate','/polycab','/family','/sectors','/capital-gains','/performance','/returns','/corporate-actions','/ledger','/audit','/statements','/upload','/holdings?category=Cash',...dynamic];
 assert.equal(dynamic.length,3,'Stock, mandate and fund detail routes are covered');
 const only=process.env.ONLY?.split(',');
 for(const route of routes.filter(r=>!only||only.includes(new URL(r,base).pathname))){
  await page.goto(base+route);await settled();
  const tabNames=()=>page.locator('main button[role="tab"]').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>e.textContent.trim()));
  const tabs=await tabNames(), visited=new Set();
  await roundTrip(route+' default');
  for(const name of tabs){
   if(visited.has(name))continue;visited.add(name);
   const tab=page.getByRole('tab',{name,exact:true});
   if(await tab.count()!==1||!await tab.isVisible())continue;
   await tab.click();await settled();
   assert.equal(await tab.getAttribute('aria-selected'),'true');
   // Open a native disclosure and a tree row where this tab offers them.
   const detail=page.locator('main details[data-navigation-details]:not([open]) > summary').first();
   if(await detail.count()&&await detail.isVisible())await detail.click();
   const expand=page.locator('main [data-navigation-expanded][aria-expanded="false"]').first();
   if(await expand.count()&&await expand.isVisible())await expand.click();
   await settled();await roundTrip(route+' tab '+name);
   for(const nested of await tabNames())if(!visited.has(nested)&&!tabs.includes(nested))tabs.push(nested);
  }
 }
 if(!process.env.ONLY||process.env.ONLY.split(',').includes('/monitor')){
 await page.goto(base+'/monitor');await settled();
 const more=page.getByRole('button',{name:'Load more table rows',exact:true}).first();
 assert.ok(await more.count(),'a table extends beyond its initial window');
 await more.click();await settled();
 await roundTrip('deep loaded table window',2400);
 }
 // Non-URL filters, including the async archive's workbook/sheet selection.
 for(const [route,placeholder,value] of [
  ['/private-market','Search funds','Fund'],
  ['/capital-gains','Search security…','Kotak'],
  ['/statements','Search folders','motilal'],
  ['/family?entity=Ajay%20Jaisinghani','Search this entity…','Kotak'],
 ].filter(([route])=>!process.env.ONLY||process.env.ONLY.split(',').includes(new URL(route,base).pathname))){
  await page.goto(base+route);await settled();
  const search=page.locator('main input[placeholder]').filter({visible:true}).first();
  assert.ok(await search.count(),placeholder+' search exists');await search.fill(value);await settled();
  await roundTrip(route+' search '+value);
 }
 if(!process.env.ONLY||process.env.ONLY.split(',').includes('/audit')){
 await page.goto(base+'/audit?sources=1');await settled();
 const chips=page.locator('[data-xa="audit-chip"]');await chips.last().waitFor();
 await chips.nth(1).click();await settled();
 const auditSearch=page.getByPlaceholder('Search this sheet…',{exact:true}).last();await auditSearch.fill('ISIN');await settled();
 await roundTrip('Data Audit workbook/sheet/search');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({cases,errors},null,2));
 console.log(`PASS dashboard navigation: ${cases.length} page/tab/filter round trips with Back, Forward, disclosures and both scroll axes`);
}catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:e.message,url:page.url(),cases,errors,text:(await page.locator('body').innerText()).slice(-8000)},null,2));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
