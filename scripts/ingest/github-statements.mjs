// Trusted GitHub Actions job. No site build/deploy, server or paid API.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { inboxFor, waitingStatementFiles } from '../../shared/statementInbox.mjs';
import { runtimeStore } from './runtime-store.mjs';

const root = process.cwd(), env = process.env;
const token = env.GLOW_GITHUB_TOKEN || env.GH_TOKEN;
const config = { ...env, GLOW_GITHUB_TOKEN: token, GLOW_GITHUB_REPO: env.GITHUB_REPOSITORY || env.GLOW_GITHUB_REPO };
if (!token) throw Error('Statement repository credential is missing');
const inbox = inboxFor(config), api = runtimeStore({ token, repo: config.GLOW_GITHUB_REPO });
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const pending = log => log.batches.filter(b => b.files.some(f => ['github', 'rapid'].includes(f.processor) && ['queued', 'processing'].includes(f.status)));
const [{ log }, publication] = await Promise.all([inbox.read(), api.read()]);
if (process.argv.includes('--check')) {
  const waiting = pending(log).length + (publication.state && publication.state.baseCommit !== head ? 1 : 0);
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `waiting=${waiting}\nlegacy=${waitingStatementFiles(log).length}\n`);
  console.log(`${waiting} statement batch/code update(s) waiting.`);
} else if (pending(log).length || publication.state) {
  const started = performance.now();
  const [{ prepareBookReferences, buildCanonicalBook, canonicalBookValues }, { prepareRuntimeModel }, { readerRevisionFor },
    { digest, archiveRevision }, { restoreStatementPasswords }, { passwordsFromEnv }, { gitPublicationStore }, { publicationViews }, { rapidProcessor }] = await Promise.all([
    import('../build-book.mjs'), import('./runtime-model.mjs'), import('./reader-revision.mjs'), import('./lib/publication.mjs'),
    import('../lib/statementPasswords.mjs'), import('./lib/layout.mjs'), import('./git-publication-store.mjs'), import('./publication-views.mjs'), import('./rapid-processor.mjs'),
  ]);
  await restoreStatementPasswords();
  // Only source-original assets are needed, never a complete app/view build.
  execFileSync(process.execPath, ['scripts/build-statement-files.mjs'], { cwd: root, stdio: 'inherit' });
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name)));
  const manifest = read('public/audit/manifest.json'), documents = manifest.map(d => read(`public/audit/${d.docKey}/document.json`));
  const references = prepareBookReferences(), instantiate = await prepareRuntimeModel(root), readerRevision = await readerRevisionFor(root);
  const book = canonicalBookValues(buildCanonicalBook(documents.filter(d => d.status !== 'failed'), documents.length, references));
  const index = read('public/statement-files/index.json'), lookthroughIndex = read('public/lookthrough/index.json');
  const initial = { schemaVersion: 1, readerRevision, revision: digest({ readerRevision, book, head }).slice(0, 20), baseCommit: head,
    archiveRevision: archiveRevision(documents), book, documents, manifest, records: {}, originals: index.files, missingOriginals: index.missing,
    previews: {}, lookthrough: { index: lookthroughIndex, portfolios: Object.fromEntries([...new Set(Object.values(lookthroughIndex.schemes || {})
      .map(s => s.schemecode))].sort().map(code => [code, read(`public/lookthrough/${code}.json`)])) } };
  const baseAsset = async (_commit, name, binary = false) => {
    const filename = path.resolve(root, 'public', name);
    if (!filename.startsWith(path.join(root, 'public') + path.sep)) throw Error('Unsafe source asset');
    if (!fs.existsSync(filename)) return null;
    return binary ? { bytes: fs.readFileSync(filename), type: 'application/octet-stream' } : read(path.relative(root, filename));
  };
  let materialize;
  const store = gitPublicationStore({ root, token, repo: config.GLOW_GITHUB_REPO, materialize: snapshot => materialize(snapshot) });
  materialize = publicationViews({ root, instantiate, store, baseAsset });
  const processor = rapidProcessor({ store, inbox, initial, references, instantiate, baseAsset,
    passwords: passwordsFromEnv(), dashboardPassword: env.GLOW_DASHBOARD_PASSWORD,
    seed: false, recover: false, dispatchFallback: false, processorName: 'github' });
  // Migrate old disabled-service claims to the GitHub worker on recovery.
  if (log.batches.some(b => b.files.some(f => f.processor === 'rapid' && ['queued', 'processing'].includes(f.status)))) {
    await inbox.commit({ message: 'Statements: use GitHub processing', mutate: log => ({ ...log, batches: log.batches.map(b => ({ ...b,
      files: b.files.map(f => f.processor === 'rapid' ? { ...f, processor: 'github' } : f) })) }) });
  }
  await processor.initialize();
  // A later upload dispatches another serialized job. Drain arrivals during this
  // job as well, without keeping a runner resident or creating a paid service.
  const handled = new Set();
  while (performance.now() - started < 10 * 60_000) {
    const batch = pending((await inbox.read()).log).find(b => !handled.has(b.id));
    if (!batch) break;
    handled.add(batch.id);
    const receipt = await processor.submit(batch.id);
    console.log(JSON.stringify({ batch: batch.id, processingMs: receipt?.processingMs, outcomes: receipt?.files.map(f => f.status) }));
  }
  console.log(JSON.stringify({ batches: handled.size, jobMs: performance.now() - started,
    queueMs: 'GitHub scheduling; excluded from processing timings', publication: processor.status().revision }));
}
