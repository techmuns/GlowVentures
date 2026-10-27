// Local/CI only: real published previews plus a synthetic password fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { previewKey, unlockPdf } from '../lib/statementPreviewPdf.mjs';
import { describePreview, openPreview, sealPreview, sealPrivateBytes, previewKeyBytes, keyCookieValue, PREVIEW_COOKIE } from '../../shared/statementPreviewCrypto.mjs';
import { restoreStatementPasswords, PASSWORD_VAULT_DOMAIN } from '../lib/statementPasswords.mjs';
import { onRequest as previewRequest } from '../../functions/api/statement-previews/[file].js';
import { readDeployedPublication } from '../ingest/lib/intakePublication.mjs';

test('published content addresses match the exact original bytes, including protected PDFs', () => {
  const index = JSON.parse(fs.readFileSync('public/statement-files/index.json', 'utf8'));
  assert.ok(Object.keys(index.files).length);
  for (const [key, file] of Object.entries(index.files)) {
    const bytes = fs.readFileSync('public/statement-files/' + file.file);
    assert.equal(file.blob, createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), key);
    assert.equal(file.bytes, bytes.length, key);
  }
});

async function read(bytes, password) {
  const task = getDocument({ data: new Uint8Array(bytes), password, verbosity: 0 });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      pages.push({ view: page.view, rotation: page.rotate, text: (await page.getTextContent()).items.map(i => i.str) });
    }
    return pages;
  } finally { await task.destroy(); }
}

test('saved passwords unlock once, preserve pages, and never change the original or process exit status', async () => {
  const original = fs.readFileSync(new URL('./fixtures/preview-password.pdf', import.meta.url));
  const copy = Buffer.from(original), previousExitCode = process.exitCode;
  assert.equal(await unlockPdf(original, []), null);
  assert.equal(await unlockPdf(original, ['wrong-password']), null);
  assert.equal(process.exitCode, previousExitCode);
  const unlocked = await unlockPdf(original, ['wrong-password', 'preview-test']);
  assert.ok(unlocked);
  assert.deepEqual(await read(unlocked), await read(original, 'preview-test'));
  assert.deepEqual(original, copy);
  assert.equal(process.exitCode, previousExitCode);
  // Another document after successful/failed attempts must use its own password.
  assert.equal(await unlockPdf(original, ['wrong-password']), null);
  assert.ok(await unlockPdf(original, ['preview-test']));
});

test('every known protected statement has an encrypted saved preview bound to its exact source', () => {
  const index = JSON.parse(fs.readFileSync('public/statement-files/index.json', 'utf8'));
  const protectedFiles = Object.entries(index.files).filter(([, f]) => f.encrypted);
  assert.ok(protectedFiles.length >= 15);
  for (const [key, file] of protectedFiles) {
    assert.ok(file.preview, `Missing saved preview: ${key}`);
    const original = fs.readFileSync('public/statement-files/' + file.file);
    assert.equal(file.preview.file, previewKey(original));
    const preview = fs.readFileSync('public/statement-previews/' + file.preview.file.replace(/\.pdf$/, '.bin'));
    assert.equal(describePreview(preview).bytes, file.preview.bytes);
    assert.notEqual(preview.subarray(0, 5).toString(), '%PDF-');
    assert.deepEqual(Object.keys(file.preview).sort(), ['bytes', 'file']);
  }
  assert.ok(fs.readdirSync('public/statement-previews').every(p => /^[a-f0-9]{64}\.bin$/.test(p)), 'Never publish clear PDF copies in the repository');
});

test('sign-in provisions a protected key cookie; the PDF route authenticates ciphertext without exposing passwords', async () => {
  const password = 'synthetic-dashboard-password';
  const hash = createHash('sha256').update(`glow-ventures-family-office::pw::v1\n${password}`).digest('hex');
  const moduleURL = pathToFileURL(process.cwd() + '/shared/statementPreviewCrypto.mjs').href;
  const source = fs.readFileSync('functions/_middleware.js', 'utf8')
    .replace("'../shared/statementPreviewCrypto.mjs'", JSON.stringify(moduleURL))
    .replace(/const PASSWORD_HASH = "[a-f0-9]+"/, `const PASSWORD_HASH = "${hash}"`);
  const { onRequest } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const login = await onRequest({ request: new Request('https://local.test/__auth/login?next=/statements', {
    method: 'POST', body: new URLSearchParams({ password }) }), next: () => { throw Error('Login must not forward'); } });
  assert.equal(login.status, 302);
  const derivedKey = keyCookieValue(await previewKeyBytes(password));
  const derive = crypto.subtle.deriveBits;
  crypto.subtle.deriveBits = () => { throw Error('Sign-in must not repeat the KDF on the host'); };
  try {
    const preparedLogin = await onRequest({ request: new Request('https://local.test/__auth/login', {
      method: 'POST', body: new URLSearchParams({ password, preview_key: derivedKey }) }) });
    assert.equal(preparedLogin.status, 302);
    assert.ok(preparedLogin.headers.getSetCookie().some(c => c.startsWith(PREVIEW_COOKIE + '=' + derivedKey + ';')));
    const refused = await onRequest({ request: new Request('https://local.test/__auth/login', {
      method: 'POST', body: new URLSearchParams({ password: 'wrong', preview_key: derivedKey }) }) });
    assert.equal(refused.status, 401, 'A preview key cannot substitute for the dashboard password');
  } finally { crypto.subtle.deriveBits = derive; }
  const gate = await onRequest({ request: new Request('https://local.test/statements') });
  const script = /<script>([\s\S]*?)<\/script>/.exec(await gate.text())[1];
  let submit, submitted = false;
  const fields = { password: { value: password }, preview_key: { value: '' } }, button = { disabled: false };
  const form = { elements: { namedItem: name => fields[name] }, querySelector: () => button,
    addEventListener: (_type, callback) => { submit = callback; }, submit: () => { submitted = true; } };
  new Function('document', script)({ querySelector: () => form });
  await submit({ preventDefault() {} });
  assert.equal(submitted, true); assert.equal(fields.preview_key.value, derivedKey, 'The actual login script preserves the existing KDF/key');
  const publication = { statementDocuments: [{ document: 'fixture', revision: 'verified-version' }] };
  assert.deepEqual(await readDeployedPublication({ credential: password, baseURL: 'https://local.test',
    fetchImpl: (url, options) => onRequest({ request: new Request(url, options), next: async () => Response.json(
      new URL(url).pathname === '/publication.json' ? { manifest: `/views/${'a'.repeat(20)}/publication.json` } : publication) }) }), publication,
  'The intake deployment verifier must authenticate against the actual sign-in middleware');
  const cookies = login.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  const cookie = cookies.find(c => c.startsWith(PREVIEW_COOKIE + '='));
  assert.match(cookie, /Path=\/api\/statement-previews\/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=2592000/);
  assert.ok(!cookies.join().includes(password));
  const original = fs.readFileSync(new URL('./fixtures/preview-password.pdf', import.meta.url));
  const pdf = await unlockPdf(original, ['preview-test']), file = previewKey(original), digest = file.slice(0, -4);
  const key = await previewKeyBytes(password), sealed = await sealPreview(pdf, key, digest, hash);
  assert.deepEqual(await openPreview(sealed, key, digest), new Uint8Array(pdf));
  assert.equal(keyCookieValue(key), cookie.split(';')[0].split('=')[1]);
  let payload = sealed;
  const request = (cookieHeader = cookie, name = file, method = 'GET') => previewRequest({
    request: new Request('https://local.test/api/statement-previews/' + name, { method, headers: { Cookie: cookieHeader } }),
    params: { file: name }, env: { ASSETS: { fetch: async req => {
      assert.equal(new URL(req.url).pathname, '/statement-previews/' + digest + '.bin');
      return new Response(payload);
    } } },
  });
  const response = await request();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  assert.equal((await request('')).status, 401);
  assert.equal((await request(PREVIEW_COOKIE + '=' + keyCookieValue(new Uint8Array(32)))).status, 422);
  assert.equal((await request(cookie, '../other.pdf')).status, 404);
  assert.equal((await request(cookie, file, 'POST')).status, 405);
  const head = await request(cookie, file, 'HEAD'); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  payload = Uint8Array.from(sealed); payload[60] ^= 1;
  assert.equal((await request()).status, 422);
  const logout = await onRequest({ request: new Request('https://local.test/__auth/logout') });
  assert.equal(logout.headers.getSetCookie().length, 2);
  assert.ok(logout.headers.getSetCookie().every(c => c.includes('Max-Age=0')));
});

test('the intake restores known statement passwords only in memory; explicit secrets take precedence', async () => {
  const dir = fs.mkdtempSync(process.cwd() + '/.cache/password-vault-test-');
  const file = dir + '/vault.bin', password = 'synthetic-dashboard-password';
  const key = await previewKeyBytes(password);
  const sealed = await sealPrivateBytes(new TextEncoder().encode(JSON.stringify(['fixture-one', 'fixture-two'])), key, PASSWORD_VAULT_DOMAIN, 'b'.repeat(64));
  fs.writeFileSync(file, sealed);
  const env = { GLOW_DASHBOARD_PASSWORD: password };
  await restoreStatementPasswords(env, file);
  assert.equal(env.GLOW_PDF_PASSWORDS, 'fixture-one\nfixture-two');
  const explicit = { GLOW_DASHBOARD_PASSWORD: 'wrong', GLOW_PDF_PASSWORDS: 'explicit' };
  await restoreStatementPasswords(explicit, file); assert.equal(explicit.GLOW_PDF_PASSWORDS, 'explicit');
  await assert.rejects(restoreStatementPasswords({ GLOW_DASHBOARD_PASSWORD: 'wrong' }, file), /^Error: Saved statement passwords could not be opened with the dashboard credential$/);
  assert.ok(!fs.readFileSync(file).includes(Buffer.from('fixture-one')));
});
