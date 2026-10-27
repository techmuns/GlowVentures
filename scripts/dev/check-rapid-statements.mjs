// Local/staging only. Real protected PDF, browser drop, upload handler, readers,
// financial models and Git object/ref promotion; GitHub is an isolated bare repo.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright-core';
import { inboxService, localGit, writeControl, readControl } from './statement-e2e-git.mjs';
import { runtimeStore } from '../ingest/runtime-store.mjs';
import { rapidProcessor } from '../ingest/rapid-processor.mjs';
import { serveRapidStatements } from '../ingest/rapid-server.mjs';
import { prepareRuntimeModel } from '../ingest/runtime-model.mjs';
import { buildCanonicalBook, canonicalBookValues, prepareBookReferences } from '../build-book.mjs';
import { restoreStatementPasswords } from '../lib/statementPasswords.mjs';
import { passwordsFromEnv } from '../ingest/lib/layout.mjs';
import { digest, archiveRevision } from '../ingest/lib/publication.mjs';
import { inboxFor } from '../../shared/statementInbox.mjs';
import { onRequest as uploadRequest } from '../../functions/api/statement-uploads.js';
import { onRequestGet as bootstrapRequest } from '../../functions/api/statement-data.js';
import { onRequestGet as dataRequest } from '../../functions/api/statement-data/[[path]].js';
import { PREVIEW_COOKIE, previewKeyBytes, keyCookieValue } from '../../shared/statementPreviewCrypto.mjs';
import { extractLayout } from '../ingest/lib/layout.mjs';

const root = process.cwd(), output = path.resolve(process.env.GLOW_RAPID_TEST_OUTPUT ?? path.join(root, '.cache/rapid-statement-publications/browser'));
assert.ok(output.startsWith(path.join(root, '.cache') + path.sep));
fs.mkdirSync(output, { recursive: true });
const remote = path.join(output, 'local-remote.git');
assert.ok(!fs.existsSync(remote), 'Preserve prior evidence; use another scratch output for a new rehearsal');
execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
const control = path.join(output, 'control.json'); writeControl(control, { dispatches: 0 });
const read = file => JSON.parse(fs.readFileSync(file));
const manifest = read('public/audit/manifest.json'), all = manifest.map(d => read(`public/audit/${d.docKey}/document.json`));
const key = 'bandhan-mutual-fund-8652064-2026-10-26-holdings', source = all.find(d => d.docKey === key); assert.ok(source);
const bytes = fs.readFileSync(source.sourcePath), baseline = all.filter(d => d.docKey !== key), refs = prepareBookReferences();
const values = docs => canonicalBookValues(buildCanonicalBook(docs.filter(d => d.status !== 'failed'), docs.length, refs));
const fullBook = values(all), initialBook = values(baseline), instantiate = await prepareRuntimeModel();
const readModels = read('src/data/readModels.json'), fileIndex = read('public/statement-files/index.json');
delete fileIndex.files[key];
const initial = { schemaVersion: 1, readerRevision: readModels.readerRevision, revision: digest(initialBook).slice(0, 20),
  baseCommit: 'a'.repeat(40), archiveRevision: archiveRevision(baseline), book: initialBook, documents: baseline,
  manifest: manifest.filter(d => d.docKey !== key), records: {}, originals: fileIndex.files, missingOriginals: fileIndex.missing,
  previews: {}, lookthrough: read(`public/views/${readModels.revision}/lookthrough.json`) };
await restoreStatementPasswords();
assert.ok(passwordsFromEnv().length && process.env.GLOW_DASHBOARD_PASSWORD, 'Use the existing encrypted vault in a trusted test environment');
const github = inboxService({ remote, stateFile: control, dispatched: () => { throw Error('A routine new statement must not start the slow workflow'); } });
const env = { GLOW_GITHUB_TOKEN: 'local-only', GLOW_GITHUB_REPO: 'local/statement-test',
  GLOW_RAPID_STATEMENTS_ENABLED: 'true',
  GLOW_RAPID_STATEMENTS_TOKEN: 'isolated-test-token-never-used-in-production' };
const store = runtimeStore({ token: env.GLOW_GITHUB_TOKEN, repo: env.GLOW_GITHUB_REPO, fetchImpl: github });
const processorConfig = { store, inbox: inboxFor(env, github), initial, references: refs, instantiate, seed: true,
  passwords: passwordsFromEnv(), dashboardPassword: process.env.GLOW_DASHBOARD_PASSWORD,
  baseAsset: async (_commit, name, binary) => {
    const target = path.resolve(root, 'public', name); assert.ok(target.startsWith(path.join(root, 'public') + path.sep));
    if (!fs.existsSync(target)) return null;
    return binary ? { bytes: fs.readFileSync(target), type: 'application/octet-stream' } : read(target);
  } };
let processor = rapidProcessor(processorConfig);
await processor.initialize();
let backend = serveRapidStatements({ processor, token: env.GLOW_RAPID_STATEMENTS_TOKEN, port: 0 }); await once(backend, 'listening');
env.GLOW_RAPID_STATEMENTS_URL = 'http://127.0.0.1:' + backend.address().port;
const errors = [], requests = [], background = new Set();
let browser, baseURL, publishedAt;
const gateway = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, baseURL), chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, path: url.pathname });
    const request = new Request(url, { method: req.method, headers: req.headers,
      ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
    const context = { request, env: { ...env, ASSETS: { fetch: async url => {
      const name = new URL(url).pathname;
      return Response.json(name === '/audit/manifest.json' ? initial.manifest : { files: initial.originals, missing: {} });
    } } }, waitUntil: promise => { background.add(promise); promise.finally(() => background.delete(promise)).catch(error => errors.push(error.stack)); } };
    let response;
    if (url.pathname === '/api/statement-uploads') response = await uploadRequest(context, github);
    else if (url.pathname === '/api/statement-data') response = await bootstrapRequest(context);
    else if (url.pathname.startsWith('/api/statement-data/')) response = await dataRequest({ ...context, params: { path: url.pathname.slice('/api/statement-data/'.length).split('/') } });
    else if (url.pathname === '/api/stock-exposure') {
      const body = await request.json(); response = Response.json(await processor.exposure(body.revision, body));
    } else if (url.pathname.startsWith('/api/')) response = Response.json({ status: 'unreachable' }, { status: 503 });
    if (response) { res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return; }
    let file = path.resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    assert.ok(file.startsWith(path.join(root, 'dist') + path.sep) || file === path.join(root, 'dist'));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'dist/index.html');
    const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(file));
  } catch (error) { errors.push(error.stack); res.writeHead(500); res.end('Local rehearsal failed'); }
});
try {
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening'); baseURL = 'http://127.0.0.1:' + gateway.address().port;
  assert.equal((await fetch(env.GLOW_RAPID_STATEMENTS_URL + '/bootstrap')).status, 401, 'Private data cannot bypass the edge credential');
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Calcutta' });
  await context.addCookies([{ name: PREVIEW_COOKIE, value: keyCookieValue(await previewKeyBytes(process.env.GLOW_DASHBOARD_PASSWORD)), url: baseURL, httpOnly: true }]);
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.stack));
  const position = fullBook.BOOK_POSITIONS.find(p => p.statementRecord?.document === key); assert.ok(position);
  await page.goto(baseURL + '/stock/' + position.securityKey); await page.locator('main h1').waitFor();
  assert.equal(await page.locator(`tr[data-account-row="${position.accountId}"]`).count(), 0, 'This statement is genuinely absent before the drop');
  await page.goto(baseURL + '/statements'); await page.locator('[data-upload-state="ready"]').waitFor(); await page.bringToFront();
  await page.getByPlaceholder('Filter by provider or file type…').fill('Bandhan');
  const start = performance.now();
  await page.locator('[data-upload-drop]').evaluate((element, base64) => {
    const data = new DataTransfer(); data.items.add(new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], 'new-protected-statement.pdf', { type: 'application/pdf' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  }, bytes.toString('base64'));
  await page.locator('tr[data-upload-status="in-library"]').waitFor({ timeout: 30_000 });
  assert.equal(await page.getByPlaceholder('Filter by provider or file type…').inputValue(), 'Bandhan', 'Search state survives the automatic publication refresh');
  const readyMs = performance.now() - start; publishedAt = processor.status().revision;
  await page.screenshot({ path: path.join(output, 'ready.png'), fullPage: true });
  assert.equal(readControl(control).dispatches, 0);
  const snapshot = processor.snapshot();
  assert.notEqual(snapshot.revision, initial.revision);
  const documents = await processor.asset(snapshot.revision, 'audit/manifest.json'); assert.equal(documents.length, all.length);
  for (const name of Object.keys(fullBook)) {
    const actual = JSON.stringify(snapshot.book[name]).replace(/source\/uploads-rapid-[^/]+\/new-protected-statement.pdf/g, source.sourcePath);
    assert.equal(digest(actual), digest(JSON.stringify(fullBook[name])), name);
  }
  // Compare the reporting projections against the fully verified original book.
  const restorePath = text => text.replace(/source\/uploads-rapid-[^/]+\/new-protected-statement.pdf/g, source.sourcePath);
  const expectedModel = instantiate(fullBook), actualModel = instantiate(JSON.parse(restorePath(JSON.stringify(snapshot.book))));
  // The export's source list follows archive order. Compare the same ordering
  // and restore only this renamed fixture's source path; no financial field is removed.
  const ordered = docs => JSON.parse(restorePath(JSON.stringify(docs))).sort((a, b) => a.docKey < b.docKey ? -1 : a.docKey > b.docKey ? 1 : 0);
  const latest = ordered((await store.load((await store.read()).state)).documents), expectedDocs = ordered(all);
  for (const name of ['deriveTransactions', 'deriveRealisedLots', 'deriveIncome', 'deriveSales', 'buildConsolidatedSheet']) {
    const actual = JSON.stringify(actualModel[name](latest)), expected = JSON.stringify(expectedModel[name](expectedDocs));
    if (digest(actual) !== digest(expected)) {
      fs.writeFileSync(path.join(output, `${name}-actual.json`), actual);
      fs.writeFileSync(path.join(output, `${name}-expected.json`), expected);
    }
    assert.equal(digest(actual), digest(expected), name);
  }
  const provenance = await processor.asset(snapshot.revision, `provenance/documents/${key}.json`);
  assert.equal(provenance.source.sha256, digest(bytes));
  const original = processor.published().index.files[key];
  const pdf = await fetch(`${baseURL}/api/statement-data/${snapshot.revision}/statement-files/${original.file}`);
  assert.equal(digest(Buffer.from(await pdf.arrayBuffer())), digest(bytes));
  assert.ok(original.preview, 'The saved vault also prepares a protected preview');
  const preview = await context.request.get(`${baseURL}/api/statement-data/${snapshot.revision}/statement-previews/${original.preview.file}`);
  assert.equal(preview.status(), 200);
  const opened = await extractLayout(new Uint8Array(await preview.body()), { passwords: [], ocr: false });
  assert.equal(opened.error, null); assert.equal(opened.numPages, 4);
  const raw = execFileSync('git', ['--git-dir', remote, 'show', 'statement-publications:' + provenance.source.path]);
  assert.equal(digest(raw), digest(bytes), 'The original is durable at its recorded GitHub source path');
  const routes = ['/stock/' + position.securityKey, '/mandate/' + position.accountId, '/cio', '/monitor', '/private-market', '/family', '/sectors', '/returns', '/capital-gains', '/ledger', '/audit?file=' + key, '/statements'];
  for (const route of routes) {
    await page.goto(baseURL + route); await page.locator('main h1').first().waitFor();
    if (route.startsWith('/stock/')) await page.locator(`tr[data-account-row="${position.accountId}"]`).waitFor();
  }
  assert.equal(processor.status().revision, publishedAt, 'Navigating never manufactures another publication');
  await page.goto(baseURL + '/statements'); await page.locator('[data-upload-state="ready"]').waitFor();
  const beforeDuplicate = processor.status().revision;
  await page.locator('[data-upload-drop]').evaluate((element, base64) => {
    const data = new DataTransfer(); data.items.add(new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], 'renamed.pdf', { type: 'application/pdf' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  }, bytes.toString('base64'));
  await page.locator('tr[data-upload-status="duplicate"]').waitFor();
  assert.equal(processor.status().revision, beforeDuplicate);
  await Promise.allSettled([...background]);
  await new Promise(resolve => backend.close(resolve));
  processor = rapidProcessor({ ...processorConfig, initial: { ...initial, baseCommit: 'b'.repeat(40) } });
  await processor.initialize();
  backend = serveRapidStatements({ processor, token: env.GLOW_RAPID_STATEMENTS_TOKEN, port: 0 }); await once(backend, 'listening');
  env.GLOW_RAPID_STATEMENTS_URL = 'http://127.0.0.1:' + backend.address().port;
  assert.equal(digest(processor.snapshot().book), digest(snapshot.book), 'A code deployment retains the new statement and every financial collection');
  assert.notEqual(processor.status().revision, beforeDuplicate);
  assert.equal((await processor.asset(beforeDuplicate, 'audit/manifest.json')).length, all.length, 'Old sessions retain their immutable version after restart');
  await page.goto(baseURL + '/stock/' + position.securityKey); await page.locator(`tr[data-account-row="${position.accountId}"]`).waitFor();
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'passed', readyMs, baselineDocuments: baseline.length,
    publishedDocuments: documents.length, canonicalCollectionsChecked: Object.keys(fullBook).length, reportingProjectionsChecked: 5,
    routes, publication: publishedAt, errors, productionUploadsPerformed: 0,
    boundaries: 'GitHub REST and ref promotion use an isolated local bare Git repository; processor, readers, upload handler and browser are real', requests }, null, 2));
  console.log(JSON.stringify({ status: 'passed', readyMs, routes: routes.length }));
} finally {
  await browser?.close(); await Promise.allSettled([...background]);
  await new Promise(resolve => gateway.close(resolve)); await new Promise(resolve => backend.close(resolve));
}
