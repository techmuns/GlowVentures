// Local/staging only: real DOM file/folder drops, with an isolated inbox service.
// No statement is sent to GitHub and no production endpoint is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.BASE || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = path.resolve('.cache/statement-drop-check');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const batches = [], staged = [], committed = [], errors = [], results = [];
let unavailable = false, release = null, held = null;
let archiveState = 'ready', archiveHeld = null, releaseArchive = null;
const fixture = '%PDF-1.4\nSynthetic drag-and-drop fixture, no financial records.\n';
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== new URL(base).origin) return route.abort();
  if (url.pathname === '/audit/manifest.json') {
    if (archiveState === 'loading') await archiveHeld;
    if (archiveState === 'restricted') return route.fulfill({ status: 503, body: 'Local archive failure' });
  }
  if (url.pathname === '/api/statement-uploads') {
    if (request.method() === 'GET') return route.fulfill({
      status: unavailable ? 503 : 200,
      json: unavailable ? { ok: false, message: 'Local test: uploads unavailable' } : { ok: true, batches },
    });
    if (request.headers()['content-type']?.includes('multipart/form-data')) {
      const form = await new Request(request.url(), { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData();
      const file = form.get('file');
      const record = { name: form.get('name'), size: file.size, blob: String(staged.length + 1).padStart(40, '0') };
      staged.push({ ...record, bytes: await file.text() });
      if (held) await held;
      return route.fulfill({ json: { ok: true, staged: record } });
    }
    const body = request.postDataJSON();
    assert.equal(body.op, 'commit');
    committed.push(body.files);
    batches.unshift({ id: `20261027T050000Z-local${committed.length}`, uploadedAt: '2026-10-27T05:00:00Z',
      files: body.files.map(file => ({ ...file, status: 'queued' })) });
    return route.fulfill({ json: { ok: true, batches, started: false } });
  }
  if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { ok: false } });
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const overlay = () => page.locator('[data-statement-drop-overlay]');
const folder = () => page.locator('[data-open-folder="Helios Mutual Fund"]');
const event = async (target, type, data) => target.dispatchEvent(type, { dataTransfer: data });
const fileData = name => page.evaluateHandle(({ name, fixture }) => {
  const data = new DataTransfer();
  data.items.add(new File([fixture], name, { type: 'application/pdf' }));
  return data;
}, { name, fixture });
const open = async (route = '/statements?provider=Helios+Mutual+Fund') => {
  await page.goto(base + route);
  await page.locator('[data-upload-state="ready"]').waitFor();
};
const waitForCommit = count => page.waitForFunction(count =>
  document.querySelectorAll('[data-upload-status="queued"]').length === count, count);

try {
  await open();
  await folder().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Files', exact: true }).count(), 1);
  const data = await fileData('local-helios.pdf');
  const cell = folder().locator('tbody tr').first().locator('td').first();
  await event(page.locator('main'), 'dragenter', data);
  await event(cell, 'dragenter', data);
  await event(cell, 'dragover', data);
  await event(cell, 'dragleave', data);
  await overlay().waitFor();
  assert.match(await overlay().innerText(), /Helios Mutual Fund/);
  const rect = await overlay().boundingBox();
  assert.deepEqual(rect, { x: 0, y: 0, width: 1440, height: 1000 }, 'Overlay covers the real viewport despite application zoom');
  assert.equal(await overlay().evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.screenshot({ path: path.join(output, 'helios-drop-light.png') });
  await event(page.locator('main'), 'dragleave', data);
  await overlay().waitFor({ state: 'detached' });
  results.push('Full viewport in an open folder; nested table transitions do not flicker');

  for (const cancellation of ['Escape', 'blur', 'dragend']) {
    await event(cell, 'dragenter', data);
    await overlay().waitFor();
    if (cancellation === 'Escape') await page.keyboard.press('Escape');
    else await page.evaluate(type => window.dispatchEvent(new Event(type)), cancellation === 'blur' ? 'blur' : 'dragend');
    // dragend belongs to the document, not the window capture path.
    if (cancellation === 'dragend') await cell.dispatchEvent('dragend');
    await overlay().waitFor({ state: 'detached' });
  }
  const textDrag = await page.evaluate(() => {
    const data = new DataTransfer(); data.setData('text/plain', 'A dragged table column');
    return document.body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
  });
  assert.equal(textDrag, true, 'Text and column drags retain their normal behaviour');
  assert.equal(await overlay().count(), 0);
  results.push('Escape, leaving the window and ending the drag clear the overlay; text drags are ignored');

  // Two drops in the same browser turn exercise the synchronous upload lock.
  held = new Promise(resolve => { release = resolve; });
  await cell.evaluate((el, fixture) => {
    for (let i = 0; i < 2; i++) {
      const data = new DataTransfer(); data.items.add(new File([fixture], 'local-helios.pdf', { type: 'application/pdf' }));
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    }
  }, fixture);
  await page.locator('[data-publication-busy="true"]').waitFor();
  await event(cell, 'dragenter', data);
  await overlay().waitFor();
  assert.match(await overlay().innerText(), /Please wait/);
  release(); held = null;
  await event(cell, 'dragleave', data);
  await waitForCommit(1);
  assert.equal(staged.length, 1);
  assert.equal(committed.length, 1);
  assert.equal(staged[0].bytes, fixture);
  assert.match(await page.locator('[data-xa="statement-upload-log"]').innerText(), /local-helios.pdf/);
  assert.equal(new URL(page.url()).searchParams.get('provider'), 'Helios Mutual Fund');
  results.push('A table-cell drop uploads the exact bytes once; concurrent drops are blocked and status stays in the folder');

  await page.getByRole('button', { name: 'All folders', exact: true }).click();
  await page.locator('[data-upload-drop]').waitFor();
  const rootData = await fileData('library-root.pdf');
  await event(page.locator('aside'), 'dragenter', rootData);
  await overlay().waitFor();
  assert.match(await overlay().innerText(), /Statement Library/);
  await event(page.locator('aside'), 'drop', rootData);
  await waitForCommit(2);
  assert.equal(committed.length, 2, 'The root view and the sidebar use the same upload owner');

  // Folder traversal is paged and nested, like a native Chrome directory drop.
  await open();
  await folder().evaluate((el, fixture) => {
    const leaf = (name, fullPath) => ({ isFile: true, isDirectory: false, fullPath,
      file: callback => callback(new File([fixture], name, { type: 'application/pdf' })) });
    const directory = (fullPath, children) => ({ isFile: false, isDirectory: true, fullPath,
      createReader: () => { let offset = 0; return { readEntries: callback => callback(children.slice(offset, ++offset)) }; } });
    const entry = directory('/Statements', [leaf('one.pdf', '/Statements/one.pdf'),
      directory('/Statements/Nested', [leaf('two.pdf', '/Statements/Nested/two.pdf')])]);
    const data = new DataTransfer(); data.items.add(new File(['folder'], 'Statements'));
    const descriptor = Object.getOwnPropertyDescriptor(DataTransferItem.prototype, 'webkitGetAsEntry');
    Object.defineProperty(DataTransferItem.prototype, 'webkitGetAsEntry', { ...descriptor, value: () => entry });
    try { el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })); }
    finally { Object.defineProperty(DataTransferItem.prototype, 'webkitGetAsEntry', descriptor); }
  }, fixture);
  await waitForCommit(4);
  assert.deepEqual(committed.at(-1).map(file => file.name), ['Statements/one.pdf', 'Statements/Nested/two.pdf']);
  assert.ok(staged.every(file => file.bytes === fixture));
  results.push('Root-page and sidebar drops work; nested folders retain paths and submit as one batch');

  // Client validation and the file chooser still share the normal upload path.
  const rejected = await fileData('unsupported.txt');
  await event(folder(), 'drop', rejected);
  await page.getByRole('status').filter({ hasText: 'Nothing to upload' }).waitFor();
  assert.equal(committed.length, 3);
  await page.locator('[data-xa="statement-upload"] input[type="file"][accept]').setInputFiles({ name: 'chooser.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fixture) });
  await waitForCommit(5);
  assert.equal(committed.length, 4);
  results.push('Unsupported files show a reason without a request; the file chooser still uploads');

  const manifest = JSON.parse(await fs.readFile('public/audit/manifest.json', 'utf8'));
  const linked = manifest.find(doc => doc.provider === 'Helios Mutual Fund');
  const other = manifest.find(doc => doc.provider && doc.provider !== linked.provider && doc.status === 'ok');
  assert.ok(linked && other);
  batches.unshift({ id: '20261027T050000Z-navigation', uploadedAt: '2026-10-27T05:00:00Z',
    files: [{ name: 'previously-published.pdf', status: 'landed', docKeys: [other.docKey], providers: [other.provider] }] });
  await open('/statements?file=' + encodeURIComponent(linked.docKey));
  await folder().waitFor();
  // A file link also opens its preview. Invoke the underlying folder action
  // directly to verify that it clears the source selection in the address.
  await page.locator('[data-xa="statement-upload-log"]').getByRole('button', { name: other.provider, exact: true }).evaluate(el => el.click());
  await page.locator('[data-open-folder]').filter({ hasText: other.provider }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('provider'), other.provider);
  assert.equal(new URL(page.url()).searchParams.has('file'), false);
  await open('/statements?path=' + encodeURIComponent(linked.sourcePath));
  await folder().waitFor();
  await page.getByRole('button', { name: 'All folders', exact: true }).evaluate(el => el.click());
  await page.locator('[data-upload-drop]').waitFor();
  assert.equal(new URL(page.url()).search, '');
  await open();
  results.push('Upload-log folder links and All folders clear source selections instead of getting trapped by file/path links');

  const themeData = await fileData('theme-check.pdf');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await event(folder(), 'dragenter', themeData);
  await overlay().waitFor();
  assert.equal(await page.locator('.statement-drop-message').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(23, 37, 84)');
  await page.screenshot({ path: path.join(output, 'helios-drop-dark.png') });
  await event(folder(), 'dragend', themeData);
  await page.setViewportSize({ width: 390, height: 844 });
  await event(folder(), 'dragenter', themeData);
  await overlay().waitFor();
  assert.deepEqual(await overlay().boundingBox(), { x: 0, y: 0, width: 390, height: 844 });
  assert.ok(await page.locator('.statement-drop-message').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
  await page.screenshot({ path: path.join(output, 'helios-drop-mobile.png') });
  await event(folder(), 'dragend', themeData);
  results.push('Light, dark and narrow viewports retain a readable blue overlay');

  unavailable = true;
  await page.reload();
  await page.locator('[data-upload-state="error"]').waitFor();
  const before = staged.length;
  const unavailableData = await fileData('unavailable-check.pdf');
  await event(folder(), 'dragenter', unavailableData);
  await overlay().waitFor();
  assert.match(await overlay().innerText(), /Uploads unavailable/);
  const cancelled = await folder().evaluate(el => {
    const data = new DataTransfer(); data.items.add(new File(['blocked'], 'blocked.pdf'));
    return !el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  });
  assert.equal(cancelled, true, 'An unavailable service cannot let a dropped PDF navigate over the dashboard');
  await overlay().waitFor({ state: 'detached' });
  assert.equal(staged.length, before);
  results.push('Unavailable uploads are named, submit nothing and still prevent dropped-file navigation');

  unavailable = false;
  archiveState = 'loading';
  archiveHeld = new Promise(resolve => { releaseArchive = resolve; });
  await page.goto(base + '/statements?provider=Helios+Mutual+Fund');
  await page.getByRole('status').filter({ hasText: 'Opening the statement archive' }).waitFor();
  let guardData = await fileData('archive-not-ready.pdf');
  await event(page.locator('main'), 'dragenter', guardData);
  await overlay().waitFor();
  assert.match(await overlay().innerText(), /Opening statement archive/);
  assert.equal(await page.locator('main').evaluate((el, data) =>
    !el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })), guardData), true);
  await overlay().waitFor({ state: 'detached' });
  assert.equal(staged.length, before);
  releaseArchive(); archiveState = 'ready'; archiveHeld = null;
  await page.locator('[data-upload-state="ready"]').waitFor();
  await folder().waitFor();
  archiveState = 'restricted';
  await page.reload();
  await page.getByText('The statement archive is password-protected', { exact: true }).waitFor();
  guardData = await fileData('archive-unavailable.pdf');
  await event(page.locator('main'), 'dragenter', guardData);
  await overlay().waitFor();
  assert.match(await overlay().innerText(), /Statement archive unavailable/);
  assert.equal(await page.locator('main').evaluate((el, data) =>
    !el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })), guardData), true);
  await overlay().waitFor({ state: 'detached' });
  assert.equal(staged.length, before);
  results.push('Loading and failed archives retain a non-uploading document drop guard');

  await page.getByRole('link', { name: 'Portfolio Monitor', exact: true }).click();
  await page.getByRole('heading', { name: 'Portfolio Monitor', exact: true }).waitFor();
  await event(page.locator('main'), 'dragenter', guardData);
  assert.equal(await overlay().count(), 0, 'Library listeners are removed after leaving the page');
  assert.deepEqual(errors, []);
  results.push('Navigating away removes the library drop handlers; no browser runtime errors');
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, results, staged: staged.map(({ bytes, ...file }) => file), committed, errors }, null, 2));
  console.log('PASS: ' + results.join('; '));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, errors, results }, null, 2));
  throw error;
} finally {
  release?.();
  releaseArchive?.();
  await browser.close();
}
