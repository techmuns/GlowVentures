// Regression for Chrome ERR_BLOCKED_BY_CLIENT from native PDF plugins inside
// the sandboxed Muns embed. Only local fixtures; no deployed data is changed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { makeMultiPagePdf } from '../ingest/__tests__/fixtures/makePdf.mjs';
import { previewKey, unlockPdf } from '../lib/statementPreviewPdf.mjs';
const base = process.env.BASE || 'http://127.0.0.1:4173';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(base)) throw Error('Use a local BASE for this fixture test.');
const out = path.resolve('.cache/pdf-preview-check'); await fs.mkdir(out, {recursive:true});
const pageCount = 12;
const labels = Array.from({length:pageCount}, (_,i) => `Preview page ${['one','two'][i] || i+1}${i === 7 ? ' INF247L01ED1 987.65' : ''}`);
const plain = Buffer.from(makeMultiPagePdf(labels.map(text => [[60,700,text]]), {fontSize:24}));
const longPageCount = 235;
const longLabels = Array.from({length:longPageCount},(_,i)=>`Long statement page ${i+1}`);
const longPdf = Buffer.from(makeMultiPagePdf(longLabels.map(text=>[[60,700,text]]),{fontSize:24}));
const mixedPdf = Buffer.from(makeMultiPagePdf([1,2,3].map(n=>[[60,500,`Mixed size page ${n}`]]),{
  fontSize:24,mediaBoxes:[[0,0,612,792],[0,0,792,612],[0,0,420,1000]],
}));
// Synthetic two-page PDF, generated with pypdf, encrypted with 'preview-test'.
const locked = await fs.readFile(new URL('./fixtures/preview-password.pdf', import.meta.url));
const unlocked = await unlockPdf(locked, ['preview-test']);
const unlockedName = previewKey(locked);
const keys = ['preview-plain', 'preview-locked', 'preview-part', 'preview-bad', 'preview-auto', 'preview-long', 'preview-mixed'];
const manifest = keys.map(key => ({docKey:key, fileKey:key, provider:'Preview test',
  accountNo:null, owner:null, ownerId:null, familyGroup:null, strategy:null, asOf:null,
  reportType:'holdings', sourcePath:`source/${key}.pdf`, pages:key==='preview-long'?longPageCount:pageCount, status:'ok', warnings:0, sheets:[], label:key, fy:''}));
const index = {files:Object.fromEntries(keys.map(key => [key, {file:key+'.pdf', bytes:plain.length,
  encrypted:key === 'preview-locked' || key === 'preview-auto', part:key === 'preview-part' ? {from:2,to:2} : null,
  ...(key === 'preview-auto' ? {preview:{file:unlockedName,bytes:unlocked.length}} : {})}])), missing:{}};
const browser = await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
const context = await browser.newContext({viewport:{width:1512,height:982}});
await context.addInitScript(()=>{
  window.__pdfWorkers = 0; window.__pdfPageRequests = [];
  const OriginalWorker = window.Worker;
  window.Worker = class extends OriginalWorker {
    constructor(...args) { super(...args); window.__pdfWorkers++; }
    postMessage(message,...args) {
      if(message?.action==='GetPage')window.__pdfPageRequests.push(message.data?.pageIndex);
      return super.postMessage(message,...args);
    }
  };
  // A busy main thread can deliver several observations of one page in one
  // callback. Let the check hold deliveries and release them as one batch.
  const OriginalObserver = window.IntersectionObserver, held = new Set();
  window.__holdIntersections = false;
  window.IntersectionObserver = class extends OriginalObserver {
    constructor(callback, options) {
      let queue = [];
      const deliver = () => { const entries = queue; queue = []; if (entries.length) callback(entries, this); };
      super(entries => { queue.push(...entries); if (window.__holdIntersections) held.add(deliver); else deliver(); }, options);
    }
  };
  window.__releaseIntersections = () => { window.__holdIntersections = false; for (const deliver of held) deliver(); held.clear(); };
});
const page = await context.newPage(); const errors = []; const assetFailures = [];
const diagnostics = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {if (m.type() === 'error') diagnostics.push(m.text())});
page.on('requestfailed', r => diagnostics.push({url:r.url(),failure:r.failure()}));
page.on('response', r => {if (/\/pdf-assets\/|pdf\.worker/.test(r.url()) && !r.ok()) assetFailures.push(r.url())});
await page.route('**/api/**', r => r.fulfill({status:503,json:{ok:false}}));
await page.route('**/api/statement-previews/*.pdf', r => r.fulfill({contentType:'application/pdf',body:unlocked}));
await page.route('**/audit/manifest.json', r => r.fulfill({json:manifest}));
await page.route('**/audit/preview-*/pages.json', r => r.fulfill({json:{pages:(r.request().url().includes('preview-long')?longLabels:labels).map((text,i)=>({page:i+1,text:i<2 ? `${text} INF247L01ED1 123.45` : text}))}}));
await page.route('**/statement-files/index.json', r => r.fulfill({json:index}));
let plainRequests = 0;
await page.route('**/statement-files/preview-*.pdf', r => {
  const url=r.request().url();if(url.includes('preview-plain.pdf'))plainRequests++;
  return r.fulfill({contentType:'application/pdf',body:/preview-(locked|auto)/.test(url) ? locked : url.includes('preview-bad') ? Buffer.from('not a PDF') : url.includes('preview-long') ? longPdf : url.includes('preview-mixed') ? mixedPdf : plain});
});
const address = key => `${base}/statements?provider=Preview%20test&file=${key}`;
// Keep local navigation on one loopback origin: recent Chrome also blocks
// local-network frame navigation across origins. Sandbox still denies the PDF
// plugin, even with allow-scripts and allow-same-origin on the dashboard frame.
const outer = `${base}/__pdf-embed-test`;
await page.route(outer, r => r.fulfill({contentType:'text/html',body:`<iframe src="${outer}/inner" style="width:100%;height:950px"></iframe>`}));
await page.route(`${outer}/inner`, r => r.fulfill({contentType:'text/html',body:`<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups" src="${address(keys[0])}" style="width:100%;height:930px"></iframe>`}));
const frame = page.frameLocator('iframe').frameLocator('iframe');
const rendered = n => frame.locator(`canvas[data-pdf-page="${n}"]`);
const appFrame = () => page.frames().find(f => f.parentFrame() && f.url().startsWith(`${base}/statements?`));
const currentPage = n => appFrame().waitForFunction(n => document.querySelector('input[aria-label="PDF page"]')?.value === String(n), n);
const scrollTo = async n => {
  await frame.locator('[data-pdf-scroll]').evaluate((el,n) => {
    el.scrollTop = el.querySelector(`[data-pdf-paper="${n}"]`).offsetTop - 16;
  }, n);
  await currentPage(n); await ink(n);
};
const open = async key => {
  const app = page.frames().find(f => f.parentFrame() && f.url().startsWith(`${base}/statements?`));
  await app.goto(address(key));
  await frame.locator('[data-statement-preview]').waitFor();
};
// After a resize or zoom the reader keeps the old bitmap until a new canvas is
// painted, then drops the old one (width 0). Read the page's current canvas in
// the page on every poll; a handle taken a moment earlier may already be gone.
const pageInk = ([n, required]) => {
  const found = document.querySelectorAll(`canvas[data-pdf-page="${n}"]`), c = found[0];
  const box = c?.getBoundingClientRect();
  const state = {canvases:found.length, width:c?.width ?? 0, height:c?.height ?? 0, shown:!!(box?.width && box?.height), count:0};
  if (found.length === 1 && state.width && state.height && state.shown) {
    const data = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    for (let i=0;i<data.length;i+=4) if (data[i]<180 && data[i+1]<180 && data[i+2]<180 && data[i+3]>0) state.count++;
  }
  return !required || state.count > Math.max(30,state.width * state.height * 0.0001) ? state : false;
};
const ink = async n => {
  await frame.locator('[data-pdf-scroll]').waitFor({state:'attached'});
  const inked = await appFrame().waitForFunction(pageInk, [n, true], {polling:100, timeout:30_000})
    .then(() => true, e => { if (e.name !== 'TimeoutError') throw e; return false; });
  if (!inked) assert.fail(`The original page must contain visible ink, not an empty canvas (page ${n}: ${JSON.stringify(await appFrame().evaluate(pageInk, [n, false]))}).`);
};
try {
  await page.goto(outer);
  await ink(1);
  assert.equal(await frame.locator('[data-preview-pdf] iframe, iframe[data-preview-pdf], object, embed').count(),0);
  assert.equal(await frame.locator('[data-pdf-paper]').count(),pageCount,'every page has a place in one continuous document');
  // A single wheel gesture crosses the page boundary without using controls.
  await frame.locator('[data-pdf-scroll]').evaluate(el => {
    el.scrollTop = el.querySelector('[data-pdf-paper="2"]').offsetTop - el.clientHeight / 2;
  });
  await ink(2);
  const boundary = await frame.locator('[data-pdf-scroll]').evaluate(el => {
    const root = el.getBoundingClientRect();
    return [1,2].map(n => {const r=el.querySelector(`[data-pdf-paper="${n}"]`).getBoundingClientRect();return r.top<root.bottom && r.bottom>root.top;});
  });
  assert.deepEqual(boundary,[true,true],'adjacent pages are visible together at their boundary');
  await page.screenshot({path:path.join(out,'continuous-page-boundary.png')});
  await frame.locator('[data-pdf-scroll]').hover();
  await page.mouse.wheel(0,500); await currentPage(2); await ink(2);
  await scrollTo(1);
  await frame.getByRole('button',{name:'Next PDF page'}).click(); await ink(2);
  await frame.getByLabel('PDF zoom',{exact:true}).selectOption('1.5'); await ink(2);
  await currentPage(2);
  await scrollTo(pageCount);
  await rendered(1).waitFor({state:'detached'});
  assert.ok(await frame.locator('canvas[data-pdf-page]').count()<6,'distant page canvases are released');
  await frame.getByRole('button',{name:'Previous PDF page'}).click(); await currentPage(pageCount-1); await ink(pageCount-1);
  await frame.getByLabel('PDF page',{exact:true}).fill('1'); await ink(1);
  const workersBefore = await appFrame().evaluate(()=>window.__pdfWorkers);
  const downloadsBefore = plainRequests;
  await frame.getByRole('tab',{name:'Text as read',exact:true}).click();
  await frame.locator('[data-preview-page="1"]').getByText('Preview page one').waitFor();
  await frame.getByRole('tab',{name:'Original file',exact:true}).click(); await ink(1);
  assert.equal(await appFrame().evaluate(()=>window.__pdfWorkers),workersBefore,'reopening reuses the initialized PDF worker');
  assert.equal(plainRequests,downloadsBefore,'reopening uses the bounded in-memory PDF bytes');
  await open('preview-long');await ink(1);
  assert.equal(await frame.locator('[data-pdf-paper]').count(),longPageCount);
  const requestedPages=await appFrame().evaluate(()=>window.__pdfPageRequests.length);
  assert.ok(requestedPages<=6,`first paint must not load all ${longPageCount} page descriptions (${requestedPages} requested)`);
  await scrollTo(longPageCount);await rendered(1).waitFor({state:'detached'});
  assert.ok(await frame.locator('canvas[data-pdf-page]').count()<6);
  await open('preview-mixed');await ink(1);await scrollTo(2);
  const landscape=await rendered(2).evaluate(c=>parseFloat(c.style.width)/parseFloat(c.style.height));
  assert.ok(Math.abs(landscape-792/612)<0.001,'lazy page sizing retains the actual landscape aspect ratio');
  await frame.getByLabel('PDF page',{exact:true}).fill('3');await currentPage(3);await ink(3);
  const portrait=await rendered(3).evaluate(c=>parseFloat(c.style.width)/parseFloat(c.style.height));
  assert.ok(Math.abs(portrait-420/1000)<0.001,'a page jump retains the actual tall-page aspect ratio');
  await scrollTo(2);await scrollTo(1);
  await open('preview-plain');
  const app = page.frames().find(f => f.parentFrame() && f.url().startsWith(`${base}/statements?`));
  await app.goto(address('preview-plain')+'&isin=INF247L01ED1&sourceValue=123.45&field=quantity');
  await ink(1);
  await frame.getByRole('status').filter({hasText:'Exact number could not be uniquely highlighted'}).waitFor();
  assert.equal(await frame.locator('mark[data-pdf-source-value]').count(),0,'ambiguous pages do not guess a highlight');
  await app.goto(address('preview-plain')+'&isin=INF247L01ED1&sourceValue=987.65&field=quantity');
  await currentPage(8); await ink(8);
  const marker = frame.locator('mark[data-pdf-source-value="987.65"]'); await marker.waitFor();
  await app.waitForFunction(() => {
    const marker=document.querySelector('mark[data-pdf-source-value="987.65"]');
    const root=document.querySelector('[data-pdf-scroll]');
    if (!marker || !root) return false;
    const r=marker.getBoundingClientRect(), v=root.getBoundingClientRect();
    return r.top>=v.top && r.bottom<=v.bottom;
  });
  await scrollTo(11); await scrollTo(8);
  await open('preview-plain'); await ink(1);
  await scrollTo(6);
  await page.setViewportSize({width:1100,height:850}); await currentPage(6); await ink(6);
  await open('preview-part'); await ink(2);
  assert.equal(await frame.getByLabel('PDF page',{exact:true}).inputValue(),'2');
  await open('preview-auto'); await ink(1);
  assert.equal(await frame.getByLabel('Statement password',{exact:true}).count(),0);
  assert.ok((await frame.locator('[data-preview-download]').getAttribute('href')).endsWith('/statement-files/preview-auto.pdf'));
  assert.equal(await frame.getByRole('link',{name:'New tab',exact:true}).count(),0);
  await frame.getByRole('tab',{name:'Text as read',exact:true}).click();
  await frame.locator('[data-preview-page="1"]').waitFor();
  await frame.getByRole('tab',{name:'Original file',exact:true}).click(); await ink(1);
  await open('preview-plain'); await ink(1);
  await open('preview-auto'); await ink(1);
  assert.equal(await frame.getByLabel('Statement password',{exact:true}).count(),0);
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
  await page.setViewportSize({width:430,height:932});
  // Resizing the outer frame returns before the inner reader redraws. Do not
  // accept the old desktop canvas as proof that mobile layout has settled.
  await appFrame().waitForFunction(() => {
    const scroller = document.querySelector('[data-pdf-scroll]');
    const paper = scroller?.querySelector('[data-pdf-paper="1"]');
    const canvas = paper?.querySelector('canvas[data-pdf-page="1"]');
    return scroller && paper && canvas
      && Math.abs(paper.getBoundingClientRect().width - (scroller.clientWidth - 32)) < 1
      && Math.abs(canvas.getBoundingClientRect().width - paper.getBoundingClientRect().width) < 1;
  });
  await ink(1);
  // CI, 28 Oct 2026: page 2 stayed blank after this resize. The page observer
  // got "left the range" and "back again" in one batch and the reader kept the
  // older entry. Send that batch for the first pages; page 3 must still draw.
  await appFrame().evaluate(async () => {
    const scroller = document.querySelector('[data-pdf-scroll]'), back = scroller.scrollTop;
    const frames = n => new Promise(resolve => { const step = () => --n ? requestAnimationFrame(step) : resolve(); requestAnimationFrame(step); });
    window.__holdIntersections = true;
    scroller.scrollTop = scroller.scrollHeight; await frames(3);
    scroller.scrollTop = back; await frames(3);
    window.__releaseIntersections();
  });
  await scrollTo(3);
  await scrollTo(2);
  await frame.getByLabel('PDF zoom',{exact:true}).selectOption('2'); await currentPage(2); await ink(2);
  await frame.getByLabel('PDF zoom',{exact:true}).selectOption('fit'); await currentPage(2); await ink(2);
  await scrollTo(pageCount); await scrollTo(1);
  assert.deepEqual(errors,[]); assert.deepEqual(assetFailures,[]);
  await page.screenshot({path:path.join(out,'sandboxed-preview.png')});
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({sandboxedEmbed:true,visibleInk:true,continuousScroll:true,adjacentPages:true,scrollTracksPage:true,boundedCanvases:true,pageJump:true,sourceHighlight:true,resizeAnchor:true,batchedVisibility:true,zoom:true,bundleStart:true,automaticUnlock:true,reopenWithoutPassword:true,originalDownload:true,passwordRetry:true,cancellation:true,invalidFile:true,mobile:true,lazyLongDocument:true,workerReused:true,pdfBytesReused:true,firstPaintPageRequests:requestedPages,errors,assetFailures},null,2));
  console.log('PASS: continuous PDF scrolling, adjacent pages, current-page tracking, bounded canvases, page jumps, source highlight, resize, zoom, sandbox, saved passwords, original downloads, cancellation and mobile layout.');
} catch (e) {
  await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({errors,assetFailures,diagnostics,frames:page.frames().map(f=>f.url())},null,2));
  await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{}); throw e;
}
finally {await browser.close();}
