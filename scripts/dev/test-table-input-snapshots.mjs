// Local API tests: GitHub reads are stubbed and all writes use an in-memory store.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { canonicalJson, jsonFingerprint } from '../../shared/canonicalJson.mjs';
import { digest } from '../ingest/lib/publication.mjs';

const root = process.cwd(), out = path.join(root, '.cache/table-inputs/snapshots');
await fs.mkdir(out, { recursive: true });
const modulePath = path.join(out, `api-${process.pid}.mjs`);
await build({ stdin: { contents: 'export {onRequest} from "./functions/api/table-inputs"; export * from "./src/data/glowData"; export {default as manifest} from "./src/data/readModels.json";',
  resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external',
  alias: { '@': path.join(root, 'src') }, outfile: modulePath, logLevel: 'error' });
const { onRequest, manifest, ...exports } = await import(pathToFileURL(modulePath));
const book = Object.fromEntries(Object.entries(exports).filter(([key]) => key.startsWith('BOOK_')));
assert.match(manifest.bookRevision ?? '', /^[a-f0-9]{64}$/, 'Build read models before running the API suite');
assert.equal(manifest.bookRevision, digest(book), 'Compiled fingerprint includes the complete canonical book');
const differentReader = manifest.readerRevision === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64);
const snapshot = (changes = {}) => ({ schemaVersion: 1, revision: '1'.repeat(20), readerRevision: differentReader, book: structuredClone(book), ...changes });
const request = changes => new Request('https://fixture.example/api/table-inputs', changes ? {
  method: 'POST', headers: { Origin: 'https://fixture.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }),
} : undefined);

async function withSnapshot(value, check) {
  const saved = new Map(); let writes = 0;
  const store = { list: async ({ prefix }) => ({ keys: [...saved.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
    get: async key => saved.get(key) ?? null, put: async (key, body) => { writes++; saved.set(key, JSON.parse(body)); },
    delete: async key => { writes++; saved.delete(key); }, flush: async () => {} };
  const env = { GLOW_GITHUB_TOKEN: 'isolated-fixture-token', GLOW_GITHUB_REPO: 'fixture/repo', DASHBOARD_STORE: store };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://api.github.com');
    if (url.pathname.endsWith('/contents/current.json')) return Response.json({ schemaVersion: 1, storage: 'github-actions-v1', revision: value.revision, readerRevision: value.readerRevision });
    assert.ok(url.pathname.endsWith(`/contents/views/${value.revision}/bootstrap.json`), 'Only the selected immutable bootstrap is read');
    return Response.json(value);
  };
  try { await check({ call: changes => onRequest({ request: request(changes), env }), saved, writes: () => writes }); }
  finally { globalThis.fetch = originalFetch; }
}

await test('build and Web Crypto use the same canonical bytes, without collapsing missing values', async () => {
  const sample = { z: [null, 0, { b: '₹', a: 1.25 }], a: { b: false, a: 'source' } };
  const expected = '{"a":{"a":"source","b":false},"z":[null,0,{"a":1.25,"b":"₹"}]}';
  assert.equal(canonicalJson(sample), expected);
  assert.equal(await jsonFingerprint(sample), createHash('sha256').update(expected).digest('hex'));
  assert.equal(await jsonFingerprint(book), manifest.bookRevision);
  assert.notEqual(await jsonFingerprint({ value: null }), await jsonFingerprint({ value: 0 }));
  assert.notEqual(await jsonFingerprint([1, 2]), await jsonFingerprint([2, 1]));
  await assert.rejects(jsonFingerprint({ value: NaN }), /Non-finite/);
});

let validChange;
await test('a changed reader with the identical complete book permits an audited local correction', async () => {
  await withSnapshot(snapshot(), async ({ call, saved, writes }) => {
    const response = await call(); assert.equal(response.status, 200);
    const current = await response.json(); assert.equal(current.ok, true);
    const record = current.catalog.find(r => r.kind === 'holding' && Number.isFinite(r.values.marketValue));
    validChange = { id: record.id, field: 'marketValue', value: record.values.marketValue + 1, source: record.source, version: '' };
    const changed = await call([validChange]); assert.equal(changed.status, 200);
    const result = await changed.json();
    assert.equal(result.catalog.find(r => r.id === record.id).values.marketValue, validChange.value);
    assert.equal(writes(), 1);
    const correction = [...saved.values()][0];
    assert.equal(correction.audit.sourceFingerprint, record.source);
    assert.equal(correction.audit.originalValue, record.values.marketValue);
  });
});

await test('a published schema-compatible book remains editable across deployment readers, with stale edits protected', async () => {
  const value = snapshot({ bookRevision: manifest.bookRevision });
  const position = value.book.BOOK_POSITIONS.find(p => `holding:${p.accountId}|${p.securityKey}|${p.memberId ?? ''}` === validChange.id);
  position.marketValue += 1;
  await withSnapshot(value, async ({ call, writes }) => {
    const response = await call(); assert.equal(response.status, 200);
    const current = await response.json();
    const input = current.catalog.find(r => r.id === validChange.id);
    assert.equal(input.values.marketValue, position.marketValue, 'the published source supplies the number');
    assert.equal((await call([validChange])).status, 409, 'a stale source fingerprint cannot overwrite new facts');
    assert.equal(writes(), 0);
    const fresh = { ...validChange, source: input.source, version: input.versions.marketValue ?? '', value: input.values.marketValue + 1 };
    assert.equal((await call([fresh])).status, 200);
    assert.equal(writes(), 1);
  });
});

await test('unrelated published history does not disable the established number-editing workflow', async () => {
  const value = snapshot();
  const trades = Object.values(value.book.BOOK_HOLDING_TRADES).find(rows => rows.length);
  assert.ok(trades, 'The source fixture includes dated trade history');
  trades[0].date = trades[0].date === '2000-01-01' ? '2000-01-02' : '2000-01-01';
  await withSnapshot(value, async ({ call, writes }) => {
    assert.equal((await call()).status, 200);
    assert.equal(writes(), 0);
  });
});

await test('a malformed reader identifier cannot use identical-book compatibility', async () => {
  await withSnapshot(snapshot({ readerRevision: 'invalid' }), async ({ call, writes }) => {
    assert.equal((await call()).status, 502); assert.equal(writes(), 0);
  });
});

await test('a deployment fingerprint is not a new requirement for editing the active source record', async () => {
  const fingerprint = manifest.bookRevision;
  try {
    delete manifest.bookRevision;
    await withSnapshot(snapshot(), async ({ call, writes }) => {
      assert.equal((await call()).status, 200); assert.equal(writes(), 0);
    });
  } finally { manifest.bookRevision = fingerprint; }
});

await test('a matching reader still accepts newly published statement facts', async () => {
  const value = snapshot({ readerRevision: manifest.readerRevision });
  value.book.BOOK_POSITIONS[0].marketValue += 1;
  await withSnapshot(value, async ({ call }) => {
    const response = await call(); assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  });
});
