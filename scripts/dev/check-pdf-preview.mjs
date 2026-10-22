// Regression for Chrome ERR_BLOCKED_BY_CLIENT from native PDF plugins inside
// the sandboxed Muns embed. Only local fixtures; no deployed data is changed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { makeMultiPagePdf } from '../ingest/__tests__/fixtures/makePdf.mjs';
const base = process.env.BASE || 'http://127.0.0.1:4173';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(base)) throw Error('Use a local BASE for this fixture test.');
const out = path.resolve('.cache/pdf-preview-check'); await fs.mkdir(out, {recursive:true});
const plain = Buffer.from(makeMultiPagePdf([[[60,700,'Preview page one']],[[60,700,'Preview page two']]], {fontSize:24}));
// Synthetic two-page PDF, generated with pypdf, encrypted with 'preview-test'.
const locked = await fs.readFile(new URL('./fixtures/preview-password.pdf', import.meta.url));
const keys = ['preview-plain', 'preview-locked', 'preview-part', 'preview-bad'];
const manifest = keys.map(key => ({docKey:key, fileKey:key, provider:'Preview test',
  accountNo:null, owner:null, ownerId:null, familyGroup:null, strategy:null, asOf:null,
  reportType:'holdings', sourcePath:`source/${key}.pdf`, pages:2, status:'ok', warnings:0, sheets:[], label:key, fy:''}));
const index = {files:Object.fromEntries(keys.map(key => [key, {file:key+'.pdf', bytes:plain.length,
  encrypted:key === 'preview-locked', part:key === 'preview-part' ? {from:2,to:2} : null}])), missing:{}};
const browser = await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
const context = await browser.newContext({viewport:{width:1512,height:982}});
const page = await context.newPage(); const errors = []; const assetFailures = [];
const diagnostics = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {if (m.type() === 'error') diagnostics.push(m.text())});
page.on('requestfailed', r => diagnostics.push({url:r.url(),failure:r.failure()}));
page.on('response', r => {if (/\/pdf-assets\/|pdf\.worker/.test(r.url()) && !r.ok()) assetFailures.push(r.url())});
await page.route('**/api/**', r => r.fulfill({status:503,json:{ok:false}}));
await page.route('**/audit/manifest.json', r => r.fulfill({json:manifest}));
await page.route('**/audit/preview-*/pages.json', r => r.fulfill({json:{pages:[{page:1,text:'Preview page one'},{page:2,text:'Preview page two'}]}}));
await page.route('**/statement-files/index.json', r => r.fulfill({json:index}));
await page.route('**/statement-files/preview-*.pdf', r => r.fulfill({contentType:'application/pdf',body:r.request().url().includes('preview-locked') ? locked : r.request().url().includes('preview-bad') ? Buffer.from('not a PDF') : plain}));
const address = key => `${base}/statements?provider=Preview%20test&file=${key}`;
// Keep local navigation on one loopback origin: recent Chrome also blocks
// local-network frame navigation across origins. Sandbox still denies the PDF
// plugin, even with allow-scripts and allow-same-origin on the dashboard frame.
const outer = `${base}/__pdf-embed-test`;
await page.route(outer, r => r.fulfill({contentType:'text/html',body:`<iframe src="${outer}/inner" style="width:100%;height:950px"></iframe>`}));
await page.route(`${outer}/inner`, r => r.fulfill({contentType:'text/html',body:`<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups" src="${address(keys[0])}" style="width:100%;height:930px"></iframe>`}));
const frame = page.frameLocator('iframe').frameLocator('iframe');
const rendered = n => frame.locator(`canvas[data-pdf-page="${n}"]`);
const open = async key => {
  const app = page.frames().find(f => f.parentFrame() && f.url().startsWith(`${base}/statements?`));
  await app.goto(address(key));
  await frame.locator('[data-statement-preview]').waitFor();
};
const ink = async n => {
  await rendered(n).waitFor();
  const {count,area} = await rendered(n).evaluate(c => {
    const data = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let count = 0; for (let i=0;i<data.length;i+=4) if (data[i]<180 && data[i+1]<180 && data[i+2]<180 && data[i+3]>0) count++;
    return {count,area:c.width*c.height};
  });
  assert.ok(count > Math.max(30,area * 0.0001), 'The original page must contain visible ink, not an empty canvas.');
};
try {
  await page.goto(outer);
  await ink(1);
  assert.equal(await frame.locator('[data-preview-pdf] iframe, iframe[data-preview-pdf], object, embed').count(),0);
  await frame.getByRole('button',{name:'Next PDF page'}).click(); await ink(2);
  await frame.getByLabel('PDF zoom',{exact:true}).selectOption('1.5'); await ink(2);
  await frame.getByLabel('PDF page',{exact:true}).fill('1'); await ink(1);
  await frame.getByRole('tab',{name:'Text as read',exact:true}).click();
  await frame.locator('[data-preview-page="1"]').getByText('Preview page one').waitFor();
  await frame.getByRole('tab',{name:'Original file',exact:true}).click(); await ink(1);
  await open('preview-part'); await ink(2);
  assert.equal(await frame.getByLabel('PDF page',{exact:true}).inputValue(),'2');
  await open('preview-locked');
  await frame.getByLabel('Statement password',{exact:true}).fill('wrong');
  await frame.getByRole('button',{name:'Open PDF',exact:true}).click();
  await frame.getByRole('alert').filter({hasText:'Incorrect password. Try again.'}).waitFor();
  await frame.getByLabel('Statement password',{exact:true}).fill('preview-test');
  await frame.getByRole('button',{name:'Open PDF',exact:true}).click(); await ink(1);
  // Close/switch while password loading is pending; must leave no worker errors.
  await open('preview-locked'); await frame.getByLabel('Statement password',{exact:true}).waitFor();
  await frame.getByRole('tab',{name:'Text as read',exact:true}).click();
  await frame.locator('[data-preview-page="1"]').waitFor();
  await frame.getByRole('tab',{name:'Original file',exact:true}).click();
  await frame.getByLabel('Statement password',{exact:true}).waitFor();
  await open('preview-bad'); await frame.getByRole('alert').filter({hasText:/could not be opened/}).waitFor();
  await frame.getByRole('tab',{name:'Text as read',exact:true}).click(); await frame.locator('[data-preview-page="1"]').waitFor();
  await open('preview-plain'); await ink(1);
  await page.setViewportSize({width:430,height:932}); await ink(1);
  assert.deepEqual(errors,[]); assert.deepEqual(assetFailures,[]);
  await page.screenshot({path:path.join(out,'sandboxed-preview.png')});
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({sandboxedEmbed:true,visibleInk:true,pages:true,zoom:true,bundleStart:true,passwordRetry:true,cancellation:true,invalidFile:true,mobile:true,errors,assetFailures},null,2));
  console.log('PASS: sandboxed PDF renders original pages, zoom, bundle start, password retry, cancellation, invalid-file fallback and mobile layout.');
} catch (e) {
  await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({errors,assetFailures,diagnostics,frames:page.frames().map(f=>f.url())},null,2));
  await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{}); throw e;
}
finally {await browser.close();}
