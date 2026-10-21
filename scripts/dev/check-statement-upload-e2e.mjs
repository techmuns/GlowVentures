// Complete local rehearsal: real browser drop, Pages upload handler, Git inbox,
// CLI intake, extraction, reconciliation, builds, publication and browser tables.
// GitHub CI/reviewer/Pages service boundaries are explicitly emulated locally.
// Never point this at a deployed site or a repository with a network remote.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { onRequest } from '../../functions/api/statement-uploads.js';
import { inboxService, localGit, readControl, writeControl } from './statement-e2e-git.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspace = path.resolve(process.argv[2] || '.cache/build-copies/statement-upload-e2e');
assert.ok(workspace.startsWith(path.join(root, '.cache') + path.sep));
assert.notEqual(workspace, root);
const output = path.join(workspace, '.cache/statement-upload-e2e'); fs.mkdirSync(output, { recursive: true });
const marker = path.join(output, 'control.json');
const remote = path.join(output, 'local-remote.git');
const publishedBranch = 'codex/e2e-published';
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GLOW_|GH_|GITHUB_|CI$|NODE_OPTIONS$)/.test(key)));
let sequence = 0;
const journal = [];
const note = message => { console.log(message); journal.push(message); fs.writeFileSync(path.join(output, 'progress.json'), JSON.stringify(journal, null, 2)); };
const git = (...args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', maxBuffer: 128 << 20 }).trim();
async function run(command, args, label, extra = {}) {
  note('Running ' + label);
  const log = path.join(output, String(++sequence).padStart(2, '0') + '-' + label.replace(/[^a-z0-9]+/gi, '-') + '.log');
  const fd = fs.openSync(log, 'w');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: workspace, env: { ...environment, ...extra }, stdio: ['ignore', fd, fd] });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(label + ' failed (' + code + '): ' + log)));
    });
  } finally { fs.closeSync(fd); }
}
const npm = (script, label = script, extra = {}) => run('npm', ['run', script], label, extra);
async function model() {
  const code = await build({ stdin: { contents: 'export * from "./src/data/glowData";export { applyFundNavs, depositoryFundHoldings, unpricedStatementUnits } from "./src/lib/fundNavs";export { investedOnOf } from "./src/lib/investedOn";', resolveDir: workspace }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'error' });
  return import('data:text/javascript;base64,' + Buffer.from(code.outputFiles[0].text).toString('base64'));
}
const targetSpecs = [
  ['hdfc-mutual-fund-15644806', 'INF179K01830', '2022-08-03'], ['hdfc-mutual-fund-16002141', 'INF179K01830', '2022-08-05'],
  ['motilal-oswal-financial-services-demat-1201090012539150', 'INF109KC1RH9', '2025-03-06'],
  ['motilal-oswal-financial-services-demat-1201090012838316', 'INF109KC1RH9', '2025-11-06'],
  ['motilal-oswal-financial-services-demat-1201090012838320', 'INF109KC1RH9', '2025-07-11'],
];
const accounts = new Set(targetSpecs.map(x => x[0]));
function checkDisplayedMoney(text, expected) {
  const m = /([\d,.]+)\s*(Cr|L|K)?/.exec(text); assert.ok(m, 'A measured amount is visible: ' + text);
  const scale = { Cr: 1e7, L: 1e5, K: 1e3 }[m[2]] ?? 1;
  const decimals = m[1].split('.')[1]?.length ?? 0;
  assert.ok(Math.abs(Number(m[1].replaceAll(',', '')) * scale - expected) <= scale / 10 ** decimals / 2 + 1, 'Amount is in the correct source row: ' + text + ' vs ' + expected);
}
const names = ['Acctstmt_H_15644806 (1).pdf', 'Acctstmt_H_16002141 (1).pdf', 'H19119_Ajay Jaisinghani_Transation.pdf',
  'H19189_Bharat Jaisinghani_Holding .pdf', 'H19191_Ankita Jaisinghani_Transation.pdf', 'H19191-Ankita Jaisinghani_Holding.pdf',
  'H43383  -BHARAT JAISINGHANI FAMILY TRUST_Transaction.pdf'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let browser, server, workerPromise = null, baseURL, servedInitial, fixtureFiles, expected, beforeRevision;
const errors = [], requests = [];
try {
  assert.ok(!fs.existsSync(path.join(workspace, '.git')), 'Use one fresh isolated source export; prior evidence is never overwritten.');
  if (!fs.existsSync(path.join(workspace, 'node_modules/leaflet')) || !fs.existsSync(path.join(workspace, 'node_modules/tesseract.js'))) {
    await run('npm', ['install', '--ignore-scripts', '--no-save', '--package-lock=false'], 'complete-prepared-dependencies');
  }
  const original = await model();
  const originalPositions = [...original.BOOK_POSITIONS, ...original.depositoryFundHoldings(), ...original.unpricedStatementUnits()];
  expected = targetSpecs.map(([accountId, isin, date]) => {
    const p = originalPositions.find(p => p.accountId === accountId && p.isin === isin); assert.ok(p);
    assert.equal(original.investedOnOf([p])?.first, date);
    const live = original.applyFundNavs([p])[0];
    return { accountId, isin, date, last: original.investedOnOf([p]).last, securityKey: p.securityKey, quantity: p.quantity, costBasis: p.costBasis, marketValue: p.marketValue, livePrice: live.currentPrice, liveValue: live.marketValue, source: p.statementRecord?.document ?? p.depositoryUnits?.source };
  });
  fs.writeFileSync(path.join(output, 'expected.json'), JSON.stringify(expected, null, 2));
  const fixtureDir = path.join(output, 'upload-files'); fs.mkdirSync(fixtureDir);
  // Withdraw original PDF bytes from two ZIPs, changing no statement fact.
  // They re-enter exclusively through the browser upload below.
  const prepare = [
    'import sys,json,zipfile,pathlib', 'wanted=set(json.loads(sys.argv[2]))', 'dest=pathlib.Path(sys.argv[3])',
    'for name in json.loads(sys.argv[1]):', ' p=pathlib.Path(name); tmp=p.with_suffix(".e2e.zip")',
    ' with zipfile.ZipFile(p) as src,zipfile.ZipFile(tmp,"w") as out:',
    '  for e in src.infolist():', '   b=src.read(e.filename)',
    '   if pathlib.PurePosixPath(e.filename).name in wanted: (dest/pathlib.PurePosixPath(e.filename).name).write_bytes(b)',
    '   else: out.writestr(e,b)', ' tmp.replace(p)',
  ].join('\n');
  execFileSync('python3', ['-c', prepare, JSON.stringify(['source/august-2026-d/MOTILAL REPORTS.zip', 'source/october-2026-c/MOTILAL FOLDER 1..zip']), JSON.stringify(names), fixtureDir], { cwd: workspace });
  fixtureFiles = names.map(name => ({ name, bytes: fs.readFileSync(path.join(fixtureDir, name)) }));
  const all = JSON.parse(fs.readFileSync(path.join(workspace, 'public/audit/manifest.json')));
  assert.equal(all.filter(d => names.includes(path.basename(d.sourcePath))).length, names.length);
  await npm('inventory', 'baseline-inventory');
  // Deliberately reproduce a stale/incomplete generated dashboard, keeping all
  // trusted source history. Do not weaken the builder's coverage assertions to
  // manufacture this fixture. Only the initial served book omits these accounts;
  // the real upload must regenerate it and pass every normal production gate.
  const bookPath = path.join(workspace, 'src/data/glowData.ts');
  let initialBook = fs.readFileSync(bookPath, 'utf8');
  const changes = {
    BOOK_POSITIONS: original.BOOK_POSITIONS.filter(p => !accounts.has(p.accountId)),
    BOOK_UNVALUED_HOLDINGS: original.BOOK_UNVALUED_HOLDINGS.filter(p => !accounts.has(p.accountId)),
    BOOK_SHARE_MOVEMENTS: Object.fromEntries(Object.entries(original.BOOK_SHARE_MOVEMENTS).filter(([key]) => !accounts.has(key.split('|')[0]))),
  };
  const parsed = ts.createSourceFile(bookPath, initialBook, ts.ScriptTarget.Latest, true), replacements = [];
  for (const statement of parsed.statements) if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
    const name = declaration.name.getText(parsed);
    if (Object.hasOwn(changes, name)) replacements.push({ start: declaration.initializer.getStart(parsed), end: declaration.initializer.end, value: JSON.stringify(changes[name], null, 2) });
  }
  assert.equal(replacements.length, 3);
  for (const r of replacements.sort((a, b) => b.start - a.start)) initialBook = initialBook.slice(0, r.start) + r.value + initialBook.slice(r.end);
  fs.writeFileSync(bookPath, initialBook);
  await npm('build', 'baseline-app');
  const before = await model();
  assert.ok(!before.BOOK_POSITIONS.some(p => accounts.has(p.accountId)));
  assert.ok(!before.unpricedStatementUnits().some(p => accounts.has(p.accountId)));
  assert.ok(!before.depositoryFundHoldings().some(p => accounts.has(p.accountId)));
  beforeRevision = JSON.parse(fs.readFileSync(path.join(workspace, 'public/publication.json'))).revision;
  servedInitial = path.join(output, 'served-before'); fs.renameSync(path.join(workspace, 'dist'), servedInitial);
  // This repository has no network remote and no main branch. All fixture
  // commits and publication refs stay in the local codex namespace.
  git('init', '-b', publishedBranch); git('config', 'user.name', 'Local upload rehearsal'); git('config', 'user.email', 'test@invalid.example'); git('config', 'commit.gpgsign', 'false');
  git('add', '-A'); git('commit', '-m', 'Isolated baseline with seven original statements withheld');
  execFileSync('git', ['init', '--bare', remote]); git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', publishedBranch);
  const baseCommit = git('rev-parse', 'HEAD');
  writeControl(marker, { remote, publishedBranch, baseCommit, dispatches: 0, merges: 0, deployed: false, ciPassed: false, reviewReady: false });
  const bin = path.join(output, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), '#!/usr/bin/env node\nimport(' + JSON.stringify(pathToFileURL(path.join(root, 'scripts/dev/statement-e2e-git.mjs')).href) + ').then(m=>m.cli());\n', { mode: 0o700 });
  const offline = path.join(output, 'offline-master.csv'); fs.writeFileSync(offline, 'SYMBOL,NAME OF COMPANY,ISIN NUMBER,SERIES\n');
  const workerEnv = { PATH: bin + path.delimiter + environment.PATH, GLOW_E2E_CONTROL: marker, GLOW_INTAKE_MAIN: publishedBranch,
    GLOW_DASHBOARD_PASSWORD: 'local-e2e-only', GLOW_NSE_CSV_MAINBOARD: offline, GLOW_NSE_CSV_SME: offline, GLOW_NSE_CSV_ETF: offline };
  const inboxGit = localGit(remote);
  const inboxLog = () => JSON.parse(inboxGit(['show', 'refs/heads/statement-inbox:inbox.json']));
  const rawFilesRemain = () => {
    const log = inboxLog();
    for (const batch of log.batches) for (const f of batch.files.filter(f => f.status !== 'duplicate' && f.status !== 'landed')) {
      const stored = execFileSync('git', ['--git-dir', remote, 'show', 'refs/heads/statement-inbox:files/' + batch.id + '/' + f.name]);
      assert.equal(hash(stored), hash(fixtureFiles.find(x => x.name === path.basename(f.name)).bytes));
    }
  };
  const startWorker = () => {
    assert.equal(workerPromise, null, 'Only one real intake worker is active');
    workerPromise = run(process.execPath, ['scripts/ingest/intake-uploads.mjs', '--allow-reset'], 'real-intake-' + (sequence + 1), { ...workerEnv, GLOW_BASE_URL: baseURL });
    workerPromise.catch(() => {});
  };
  const github = inboxService({ remote, stateFile: marker, dispatched: startWorker });
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, baseURL); requests.push({ method: req.method, path: url.pathname });
      if (url.pathname === '/api/statement-uploads') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const response = await onRequest({ request: new Request(url, { method: req.method, headers: req.headers,
          ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) }), env: { GLOW_GITHUB_TOKEN: 'local-only', GLOW_GITHUB_REPO: 'local/statement-test' } }, github);
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (url.pathname.startsWith('/api/')) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"status":"unreachable"}'); return; }
      const served = readControl(marker).deployed ? path.join(workspace, 'dist') : servedInitial;
      let file = path.resolve(served, '.' + decodeURIComponent(url.pathname)); assert.ok(file === served || file.startsWith(served + path.sep));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(served, 'index.html');
      const ext = path.extname(file), mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' }); res.end(fs.readFileSync(file));
    } catch (error) { errors.push(error.stack); res.writeHead(500); res.end('Local test server failure'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); baseURL = 'http://127.0.0.1:' + server.address().port;
  workerEnv.GLOW_BASE_URL = baseURL;
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Los_Angeles' });
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  const page = await context.newPage(), watching = await context.newPage();
  for (const p of [page, watching]) p.on('pageerror', error => errors.push(error.stack));
  const mf = '/stock/hdfc-balanced-advantage-fund-regular-plan-growth?members=ajay-jaisinghani';
  await watching.goto(baseURL + mf); await watching.locator('main h1').waitFor(); assert.equal(await watching.locator('tr[data-account-row="hdfc-mutual-fund-15644806"]').count(), 0);
  await page.goto(baseURL + '/statements'); await page.locator('[data-upload-state="ready"]').waitFor();
  const payload = fixtureFiles.map(f => ({ name: f.name, bytes: f.bytes.toString('base64') }));
  // Real drop event and File objects; directory entries page their children,
  // as Chromium's native folder drag API does. No chooser or upload client call.
  await page.locator('[data-upload-drop]').evaluate((element, files) => {
    const leaves = files.map(f => { const bytes = Uint8Array.from(atob(f.bytes), c => c.charCodeAt(0)); const file = new File([bytes], f.name, { type: 'application/pdf' });
      return { isFile: true, isDirectory: false, fullPath: '/Actual statements/' + f.name, file: callback => callback(file) }; });
    let position = 0;
    const directory = { isFile: false, isDirectory: true, fullPath: '/Actual statements', createReader: () => ({ readEntries: callback => { const next = leaves.slice(position, position + 3); position += next.length; callback(next); } }) };
    const data = new DataTransfer(); data.items.add(new File(['folder marker'], 'Actual statements'));
    // Chromium can return a new JS wrapper each time items[0] is read. Override
    // the prototype for this synchronous event so the real client's entry read
    // sees the folder, then restore it before any further browser interaction.
    const descriptor = Object.getOwnPropertyDescriptor(DataTransferItem.prototype, 'webkitGetAsEntry');
    Object.defineProperty(DataTransferItem.prototype, 'webkitGetAsEntry', { ...descriptor, value: function () {
      return this.getAsFile()?.name === 'Actual statements' ? directory : descriptor.value.call(this);
    } });
    try { element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })); }
    finally { Object.defineProperty(DataTransferItem.prototype, 'webkitGetAsEntry', descriptor); }
  }, payload);
  await page.getByRole('status').filter({ hasText: '7 statement files saved' }).waitFor({ timeout: 30_000 });
  assert.ok(workerPromise); await workerPromise; workerPromise = null;
  let c = readControl(marker); assert.ok(c.pr && c.ciRequested); assert.equal(c.pr.state, 'OPEN'); assert.equal(c.merges, 0);
  assert.ok(inboxLog().batches.flatMap(b => b.files).every(f => f.status === 'processing'));
  rawFilesRemain(); assert.equal((await (await fetch(baseURL + '/publication.json')).json()).revision, beforeRevision);
  note('PASS folder drop: exact bytes committed to local inbox; real intake prepared a PR while served book stayed unchanged');
  await run(process.execPath, ['scripts/ingest/intake-uploads.mjs', '--allow-reset'], 'pending-ci-resume', workerEnv);
  rawFilesRemain(); assert.equal(readControl(marker).merges, 0);
  await npm('inventory', 'candidate-source-inventory'); await npm('extract', 'candidate-source-reextract', { GLOW_OCR: 'off' });
  await npm('build-book', 'candidate-source-regenerate');
  assert.equal(git('diff', '--name-only', '--', 'src/data/glowData.ts', 'src/data/reviewColumns.ts', 'docs/BOOK-REPORT.md', 'public/audit'), '', 'Candidate re-extracts and regenerates byte-identically');
  await npm('build', 'candidate-deployment-build');
  c = readControl(marker); c.ciPassed = true; c.pr.statusCheckRollup = ['build', 'statements'].map(name => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })); writeControl(marker, c);
  await run(process.execPath, ['scripts/ingest/intake-uploads.mjs', '--allow-reset'], 'review-unavailable-holds', workerEnv);
  assert.ok(inboxLog().batches.flatMap(b => b.files).every(f => f.status === 'held')); rawFilesRemain(); assert.equal(readControl(marker).merges, 0);
  note('PASS review outage: validated statements and raw bytes remain held; no premature publication');
  // A fixture for the external reviewer callback, after the real full checks.
  c = readControl(marker); c.reviewReady = true; c.pr.comments = [{ author: { login: 'chatgpt-codex-connector[bot]' }, body: '<!-- codex-review-state:v1 ' + JSON.stringify({ code_review: { commit_sha: c.pr.headRefOid, status: 'completed', has_any_findings: false, has_unresolved_findings: false } }) + ' -->' }]; writeControl(marker, c);
  await run(process.execPath, ['scripts/ingest/intake-uploads.mjs', '--allow-reset'], 'reviewed-publication-merge', workerEnv);
  assert.equal(readControl(marker).merges, 1); rawFilesRemain();
  assert.equal((await (await fetch(baseURL + '/publication.json')).json()).revision, beforeRevision);
  note('PASS reviewed merge still retains inbox bytes and old served version until the new publication is available');
  c = readControl(marker); c.deployed = true; writeControl(marker, c);
  await run(process.execPath, ['scripts/ingest/intake-uploads.mjs', '--allow-reset'], 'deployed-version-confirmation', workerEnv);
  assert.ok(inboxLog().batches.flatMap(b => b.files).every(f => f.status === 'landed'));
  assert.equal(inboxGit(['ls-tree', '-r', '--name-only', 'refs/heads/statement-inbox', '--', 'files']), '');
  const after = await model(), afterPositions = [...after.BOOK_POSITIONS, ...after.depositoryFundHoldings(), ...after.unpricedStatementUnits()];
  const published = await (await fetch(baseURL + '/publication.json')).json();
  const publication = await (await fetch(baseURL + published.manifest)).json();
  for (const uploaded of inboxLog().batches.flatMap(b => b.files)) for (const version of uploaded.documentVersions.filter(v => uploaded.docKeys.includes(v.document))) {
    const entry = publication.statementDocuments.find(d => d.document === version.document && d.revision === version.revision);
    assert.ok(entry, 'Published manifest attests to this exact uploaded document version');
    const provenance = await (await fetch(baseURL + '/views/' + published.revision + '/' + entry.evidence)).json();
    assert.equal(provenance.source.sha256, uploaded.sha256, 'The published source checksum belongs to these exact uploaded bytes');
    assert.ok(provenance.receipt, 'The published document retains its immutable delivery receipt');
  }
  for (const e of expected) { const p = afterPositions.find(p => p.accountId === e.accountId && p.isin === e.isin); assert.ok(p);
    assert.equal(p.quantity, e.quantity); assert.equal(p.costBasis, e.costBasis); assert.equal(p.marketValue, e.marketValue); assert.equal(after.investedOnOf([p])?.first, e.date); }
  await watching.bringToFront(); await watching.evaluate(() => window.dispatchEvent(new Event('focus')));
  await watching.locator('tr[data-account-row="hdfc-mutual-fund-15644806"] [data-col-cell="investedOn"]').waitFor({ timeout: 45_000 });
  assert.equal(new URL(watching.url()).searchParams.get('members'), 'ajay-jaisinghani');
  assert.equal(await watching.locator('tr[data-account-row="hdfc-mutual-fund-15644806"] [data-col-cell="investedOn"]').getAttribute('data-invested-first'), '2022-08-03');
  await page.goto(baseURL + '/statements'); await page.locator('[data-upload-state="ready"]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-upload-status="in-library"]').length === 7);
  for (const f of inboxLog().batches.flatMap(b => b.files)) {
    const uploaded = page.locator('tr[data-upload-status="in-library"]').filter({ has: page.getByText(path.basename(f.name), { exact: true }) });
    assert.equal(await uploaded.count(), 1);
    for (const provider of f.providers) assert.equal(await uploaded.getByRole('button', { name: provider, exact: true }).count(), 1);
  }
  const firstFile = inboxLog().batches[0].files[0], firstProvider = firstFile.providers[0];
  await page.locator('tr[data-upload-status="in-library"]').filter({ has: page.getByText(path.basename(firstFile.name), { exact: true }) }).getByRole('button', { name: firstProvider, exact: true }).click();
  await page.locator('[data-open-folder]').waitFor();
  assert.equal(await page.locator('[data-open-folder]').getAttribute('data-open-folder'), firstProvider);
  assert.ok(await page.locator('[data-preview-row]').count());
  note('PASS all seven uploads report In library and open the actual issuer folder');
  const cells = [];
  for (const [key, entries] of [['hdfc-balanced-advantage-fund-regular-plan-growth', expected.slice(0, 2)], ['icici-ioppf-d-grw', expected.slice(2)]]) {
    await page.goto(baseURL + '/stock/' + key);
    for (const e of entries) { const row = page.locator('tr[data-account-row="' + e.accountId + '"]'); await row.waitFor();
      assert.equal(await row.locator('[data-col-cell="investedOn"]').getAttribute('data-invested-first'), e.date);
      assert.equal(Number((await row.locator('[data-col-cell="qty"]').innerText()).replaceAll(',', '')), Math.round(e.quantity));
      assert.equal(Number(await row.locator('[data-cmp]').getAttribute('data-cmp')), e.livePrice);
      checkDisplayedMoney(await row.locator('[data-col-cell="invested"]').innerText(), e.costBasis);
      checkDisplayedMoney(await row.locator('[data-col-cell="current"]').innerText(), e.liveValue);
      cells.push({ table: 'stock-positions', account: e.accountId, date: e.date, text: await row.innerText() }); }
  }
  await page.screenshot({ path: path.join(output, 'after-mf-rows.png'), fullPage: true });
  // Data Audit must expose the same account, security, quantity and date, even
  // when its statement correctly has no valuation for custody-only units.
  const auditColumns = JSON.parse(fs.readFileSync(path.join(workspace, 'src/data/consolidatedTemplate.json'))).Holdings;
  const column = key => auditColumns.findIndex(c => c.key === key);
  for (const e of expected) {
    await page.goto(baseURL + '/audit?consolidated=Holdings&scope=' + encodeURIComponent(JSON.stringify({ acct: e.accountId, sec: e.securityKey })));
    await page.locator('[data-consolidated="ready"]').waitFor();
    assert.deepEqual((await page.locator('[data-consolidated="ready"] thead th').allTextContents()).map(s => s.trim()), auditColumns.map(c => c.label));
    const rows = await page.locator('[data-consolidated-row]').evaluateAll(rows => rows.map(r => [...r.cells].map(c => c.getAttribute('data-export-value'))));
    const values = rows.find(r => r[column('acct')] === e.accountId && r[column('sec')] === e.securityKey);
    assert.ok(values, 'Data Audit has the exact account/security row: ' + e.accountId);
    const sourceLink = page.locator('[data-consolidated-row]').filter({ has: page.locator('td[data-export-value="' + e.accountId + '"]') }).locator('td').nth(column('src')).getByRole('link');
    assert.equal(new URL(await sourceLink.getAttribute('href'), baseURL).searchParams.get('file'), e.source);
    assert.equal(values[column('first')], e.date); assert.equal(values[column('last')], e.last);
    assert.equal(Number(values[column('qty')]), e.quantity); assert.equal(Number(values[column('cost')]), e.costBasis);
    if (e.isin === 'INF109KC1RH9') { assert.equal(values[column('mv')], '—'); assert.equal(values[column('price')], '—'); }
    else assert.equal(Number(values[column('mv')]), e.marketValue);
    cells.push({ table: 'audit-holdings', account: e.accountId, date: e.date });
  }
  // A direct file drop of the same original bytes must not add positions or
  // create another publication. A disguised HTML attachment is refused early.
  const stableRevision = (await (await fetch(baseURL + '/publication.json')).json()).revision;
  await page.goto(baseURL + '/statements'); await page.locator('[data-upload-state="ready"]').waitFor();
  const dropFile = async (name, bytes) => page.locator('[data-upload-drop]').evaluate((element, f) => {
    const data = new DataTransfer(); data.items.add(new File([Uint8Array.from(atob(f.bytes), c => c.charCodeAt(0))], f.name, { type: 'application/pdf' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  }, { name, bytes: bytes.toString('base64') });
  await dropFile(fixtureFiles[0].name, fixtureFiles[0].bytes);
  await page.getByRole('status').filter({ hasText: '1 statement file saved' }).waitFor();
  await workerPromise; workerPromise = null;
  assert.equal(inboxLog().batches.flatMap(b => b.files).filter(f => f.status === 'duplicate').length, 1);
  assert.equal(readControl(marker).merges, 1);
  const inboxBeforeRefusal = inboxGit(['rev-parse', 'refs/heads/statement-inbox']);
  await dropFile('not-a-statement.pdf', Buffer.from('<!DOCTYPE html><html><body>Local test attachment, not a statement</body></html>'));
  await page.getByRole('status').filter({ hasText: 'Nothing was saved' }).waitFor();
  assert.equal(inboxGit(['rev-parse', 'refs/heads/statement-inbox']), inboxBeforeRefusal);
  assert.equal((await (await fetch(baseURL + '/publication.json')).json()).revision, stableRevision);
  assert.equal(readControl(marker).dispatches, 2);
  note('PASS direct file drop, byte-duplicate suppression and disguised attachment refusal without changing published data');
  assert.deepEqual(errors, []);
  await browser.close(); browser = null;
  // Existing wide browser regression checks every holdings table family,
  // nested views, member scopes, layout migration, sorting, totals and mobile.
  await run(process.execPath, ['scripts/dev/check-investment-dates.mjs'], 'all-dashboard-date-tables', { BASE: baseURL, CHROME: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'passed', sourceStatements: fixtureFiles.map(f => ({ name: f.name, sha256: hash(f.bytes) })), expected, cells, beforeRevision,
    publication: await (await fetch(baseURL + '/publication.json')).json(), externalBoundaries: ['GitHub REST/CLI, CI/reviewer callbacks and Pages activation emulated against local Git only'], requests, errors }, null, 2));
  note('PASS complete local upload-to-publication flow and every dashboard date-table family');
} catch (error) {
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, journal, errors, requests }, null, 2));
  if (browser) for (const context of browser.contexts()) for (const [i, p] of context.pages().entries()) await p.screenshot({ path: path.join(output, 'failure-page-' + i + '.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (workerPromise) await workerPromise.catch(() => {});
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
