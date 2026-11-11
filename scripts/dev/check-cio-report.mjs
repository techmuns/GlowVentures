// Exercise the actual export on local or immutable preview data. Production is read-only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const base = process.env.BASE || 'http://127.0.0.1:4173';
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
assert.ok(local || /^[a-f0-9]{8}\.glowventures-1xw\.pages\.dev$/.test(new URL(base).hostname), 'Use local or an immutable preview');
const out = path.resolve('.cache/cio-report-check'); await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true });
if (!local) {
  const password = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'codex.glowventures.dashboard', '-a', 'glowventures-1xw.pages.dev', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
  const login = await context.request.post(base + '/__auth/login?next=%2Fcio', { form: { password }, maxRedirects: 0 }); assert.equal(login.status(), 302);
}
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', r => r.fulfill({ status: 503, json: { ok: false } }));
await page.route('**/api/fx', r => r.fulfill({ json: { ok: true, inrPerUsd: 84, date: '2026-11-11' } }));
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const readPdf = async download => {
  const file = path.join(out, download.suggestedFilename()); await download.saveAs(file);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(await fs.readFile(file)), useSystemFonts: true }).promise;
  let text = ''; const bounds = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const p = await pdf.getPage(n), v = p.getViewport({ scale: 1 }); assert.ok(v.width > v.height, 'Landscape A4');
    for (const item of (await p.getTextContent()).items.filter(i => 'str' in i && i.str.trim())) {
      text += item.str + ' ';
      const [x, y] = [item.transform[4], item.transform[5]];
      if (x < 15 || x + item.width > v.width - 12 || y < 8 || y > v.height - 12) bounds.push({ page: n, text: item.str, x, y, width: item.width });
    }
    text += '\n';
  }
  assert.deepEqual(bounds, [], 'All text stays on the page');
  const pages = pdf.numPages; await pdf.destroy(); return { file, text, pages };
};
const downloadReport = async () => {
  const link = page.getByRole('link', { name: 'Download PDF', exact: true }); await link.waitFor({ timeout: 60000 });
  await page.locator('[data-cio-report-preview] canvas[data-pdf-page="1"]').waitFor({ timeout: 60000 });
  const pending = page.waitForEvent('download'); await link.click(); return readPdf(await pending);
};
try {
  await page.goto(base + '/cio');
  const value = page.locator('[data-tile-slot="value"]').first(); await value.waitFor();
  const headline = (await value.innerText()).match(/₹[\d,.]+\s*(?:Cr|L)?/)?.[0].trim(); assert.ok(headline);
  // An unavailable asset must give a retryable error, rather than an empty PDF.
  await page.route('**/report-assets/NotoSans-Bold.ttf', r => r.fulfill({ status: 503, body: 'Unavailable test asset' }));
  await page.getByRole('button', { name: 'Export report', exact: true }).click();
  await page.getByRole('button', { name: 'Retry report', exact: true }).waitFor();
  await page.unroute('**/report-assets/NotoSans-Bold.ttf');
  await page.getByRole('button', { name: 'Retry report', exact: true }).click();
  const whole = await downloadReport();
  assert.ok(whole.pages >= 8); assert.ok(whole.text.includes(headline), 'PDF matches the actual portfolio tile');
  for (const expected of ['Glow Ventures', 'Munshot AI', 'Table of Contents', 'Portfolio Overview', 'Equity', 'Returns & Coverage', 'Report Notes', '₹']) assert.ok(whole.text.includes(expected), expected);
  for (const absent of ['TERRABELLA', 'Andrea Smith', 'S&P 500', 'Hedge Fund', 'Geography Exposure', 'Currency Exposure', 'Projected Income']) assert.ok(!whole.text.includes(absent), absent);
  await page.screenshot({ path: path.join(out, 'whole-family-preview.png') });
  await page.keyboard.press('Escape'); await page.locator('[data-cio-report-preview]').waitFor({ state: 'detached' });
  assert.ok(await page.getByRole('button', { name: 'Export report', exact: true }).evaluate(el => el === document.activeElement), 'Focus restored');
  // Capture the chosen member and USD, then confirm the second export uses that snapshot.
  await page.goto(base + '/cio?members=ajay-jaisinghani');
  await value.waitFor(); await page.getByRole('button', { name: 'USD', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-tile-slot="value"]')?.textContent.includes('$'));
  const usdHeadline = (await value.innerText()).match(/\$[\d,.]+\s*[KMBT]?/)?.[0].trim(); assert.ok(usdHeadline);
  await page.getByRole('button', { name: 'Export report', exact: true }).click();
  const scoped = await downloadReport(); assert.ok(scoped.text.includes(usdHeadline)); assert.ok(scoped.text.includes('Ajay')); assert.ok(scoped.text.includes('USD')); assert.ok(!scoped.text.includes('Whole family'));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('[data-cio-report-preview]').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }));
  await page.screenshot({ path: path.join(out, 'mobile-preview.png') });
  await page.getByRole('button', { name: 'Close report preview', exact: true }).click();
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ base, whole: { file: whole.file, pages: whole.pages, headline }, scoped: { file: scoped.file, pages: scoped.pages, headline: usdHeadline }, assetRetry: true, focusRestored: true, mobile: true, errors }, null, 2));
  console.log('Colour CIO report: real-book totals, selected member, USD, landscape pages, text bounds, omissions, retry, PDF preview, download and mobile passed.');
} catch (e) { await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); throw e; }
finally { await browser.close(); }
