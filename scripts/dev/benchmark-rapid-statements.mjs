// Real source replay in an isolated in-memory book. Never uploads a statement.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { transform } from 'esbuild';
import { buildCanonicalBook, canonicalBookValues, emitCanonicalBook, prepareBookReferences } from '../build-book.mjs';
import { prepareRapidStatement } from '../ingest/rapid-core.mjs';
import { restoreStatementPasswords } from '../lib/statementPasswords.mjs';
import { passwordsFromEnv } from '../ingest/lib/layout.mjs';
import { digest } from '../ingest/lib/publication.mjs';

const output = '.cache/rapid-statement-publications'; fs.mkdirSync(output, { recursive: true });
const started = performance.now();
const manifest = JSON.parse(fs.readFileSync('public/audit/manifest.json'));
const archive = manifest.map(d => JSON.parse(fs.readFileSync(`public/audit/${d.docKey}/document.json`)));
const references = prepareBookReferences();
const preparedMs = performance.now() - started;
const originalSource = fs.readFileSync('src/data/glowData.ts', 'utf8');
const built = buildCanonicalBook(archive.filter(d => d.status !== 'failed'), archive.length, references);
assert.equal(emitCanonicalBook(built), originalSource, 'Warm engine reproduces the current book byte for byte');
const { code } = await transform(originalSource, { loader: 'ts', format: 'esm' });
const expected = { ...await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) };
assert.deepEqual(canonicalBookValues(built), expected, 'Runtime snapshot includes every canonical export');
await restoreStatementPasswords();
const key = 'bandhan-mutual-fund-8652064-2026-10-26-holdings';
const source = archive.find(d => d.docKey === key); assert.ok(source);
const baseline = archive.filter(d => d.docKey !== key), unchanged = digest(baseline);
const options = { baseline, references, passwords: passwordsFromEnv(),
  files: [{ name: 'new-bandhan.pdf', bytes: fs.readFileSync(source.sourcePath) }],
  sourcePrefix: 'source/uploads-rapid-local-replay', readerRevision: 'a'.repeat(64) };
if (!options.passwords.length) throw Error('The real protected-statement replay needs the existing saved password vault');
const results = [];
for (let n = 0; n < 3; n++) {
  const result = await prepareRapidStatement(options);
  assert.equal(result.decision, 'verified', JSON.stringify(result.issues));
  assert.equal(result.documents.length, archive.length);
  assert.equal(digest(baseline), unchanged, 'Preparing a candidate cannot mutate the published book');
  for (const name of Object.keys(expected)) {
    // Source prefixes necessarily differ in a re-delivery. Compare the facts
    // after replacing only this fixture's original source-path string.
    const actual = JSON.stringify(result.book[name]).replaceAll('source/uploads-rapid-local-replay/new-bandhan.pdf', source.sourcePath);
    assert.equal(actual, JSON.stringify(expected[name]), name);
  }
  results.push(result.timings);
}
const report = { checkedAt: new Date().toISOString(), preparedMs, replay: 'protected PDF absent from baseline',
  baselineDocuments: baseline.length, publishedDocuments: archive.length, canonicalCollectionsChecked: Object.keys(expected).length,
  results, memoryBytes: process.memoryUsage(), productionUploadsPerformed: 0 };
fs.writeFileSync(`${output}/benchmark.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
