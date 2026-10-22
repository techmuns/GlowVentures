// Exercise the actual Pages auth/middleware against static-asset responses.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { onRequest } from '../../functions/_middleware.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const source = fs.readFileSync('functions/_middleware.js', 'utf8');
const hash = /const PASSWORD_HASH = "([a-f0-9]+)"/.exec(source)[1];
const session = createHash('sha256').update(`session::v2\n${hash}`).digest('hex');
function request(path, type, body, auth = true, status = 200) {
  return onRequest({ request: new Request(`https://local.test${path}`, { headers: auth ? { Cookie: `glow_auth=${session}` } : {} }),
    next: async () => new Response(body, { status, headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: 'fixture' } }) });
}
for (const path of ['/statement-files/original.pdf', '/statement-previews/' + 'a'.repeat(64) + '.bin', '/api/statement-previews/' + 'a'.repeat(64) + '.pdf']) {
  const denied = await request(path, 'application/pdf', '%PDF-private-statement', false);
  assert.equal(denied.status, 200);
  assert.match(denied.headers.get('content-type'), /^text\/html/);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await denied.text(), /%PDF-private-statement/);
  const allowed = await request(path, 'application/pdf', '%PDF-private-statement');
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), '%PDF-private-statement');
}
for (const path of ['/', '/index.html', '/stock/known?members=one', '/audit/source.html']) {
  const r = await request(path, 'text/html; charset=utf-8', '<!doctype html><html>app</html>');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'private, no-cache');
  assert.equal(r.headers.get('etag'), 'fixture');
  assert.match(await r.text(), /app/);
}
for (const ext of ['js', 'css']) {
  const r = await request(`/assets/missing.${ext}`, 'text/html', '<html>SPA fallback</html>');
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.headers.get('content-type'), /^text\/plain/);
  assert.equal(await r.text(), 'Asset not found');
  const signedOut = await request(`/assets/current.${ext}`, 'text/javascript', 'never served', false);
  assert.equal(signedOut.status, 401);
  assert.equal(signedOut.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await signedOut.text(), /<html|never served/);
}
for (const [path, type, body] of [['/assets/current.js', 'application/javascript', 'export default 1;'], ['/assets/current.css', 'text/css', 'body{}'], ['/api/indices', 'application/json', '{"ok":true}']]) {
  const r = await request(path, type, body);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.equal(await r.text(), body);
}
const missing = await request('/assets/gone.js', 'text/plain', 'missing', true, 404);
assert.equal(missing.status, 404);
const login = await request('/stock/known?members=one', 'text/html', 'never served', false);
assert.equal(login.status, 200);
assert.match(await login.text(), /Sign in|Enter password/);
assert.equal(login.headers.get('cache-control'), 'no-store');
console.log('PASS: fresh HTML, missing assets, expired sessions and valid JS/CSS/API passthrough');
