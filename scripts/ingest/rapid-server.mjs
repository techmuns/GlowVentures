// Private Node compute endpoint. No canonical data is written to its filesystem.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rapidProcessor, ReaderVersionChanged } from './rapid-processor.mjs';
import { runtimeStore } from './runtime-store.mjs';
import { prepareRuntimeModel } from './runtime-model.mjs';
import { prepareBookReferences } from '../build-book.mjs';
import { restoreStatementPasswords } from '../lib/statementPasswords.mjs';
import { passwordsFromEnv } from './lib/layout.mjs';
import { inboxFor } from '../../shared/statementInbox.mjs';

export function serveRapidStatements({ processor, token, port = 8788, host = '127.0.0.1' }) {
  if (typeof token !== 'string' || token.length < 32) throw Error('A private processor credential is required');
  const authenticated = request => {
    const supplied = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  const server = http.createServer(async (request, response) => {
    const send = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.url === '/__health') return send(processor.status().ready ? 200 : 503, { ready: processor.status().ready });
      if (!authenticated(request)) return send(401, { error: 'Unauthorized' });
      if (request.method === 'GET' && request.url === '/current') return send(200, { schemaVersion: 1, ...processor.status() });
      if (request.method === 'GET' && request.url === '/bootstrap') return send(200, processor.snapshot());
      if (request.method === 'GET' && request.url === '/published') return send(200, processor.published());
      if (request.method === 'POST' && request.url === '/process') {
        let text = '';
        for await (const part of request) { text += part; if (Buffer.byteLength(text) > 1024) return send(413, { error: 'Too large' }); }
        const { batch } = JSON.parse(text);
        // Respond only after publication or a useful held outcome. The edge may
        // continue this request independently of the browser's upload response.
        const receipt = await processor.submit(batch);
        return send(200, { ok: true, receipt });
      }
      const exposure = /^\/exposure\/([a-f0-9]{20})$/.exec(request.url ?? '');
      if (request.method === 'POST' && exposure) {
        let text = '';
        for await (const part of request) { text += part; if (Buffer.byteLength(text) > 128 * 1024) return send(413, { status: 'invalid' }); }
        return send(200, await processor.exposure(exposure[1], JSON.parse(text)));
      }
      const asset = /^\/views\/([a-f0-9]{20})\/([a-zA-Z0-9._/-]+)$/.exec(request.url ?? '');
      if (request.method === 'GET' && asset && !asset[2].split('/').some(p => !p || p === '.' || p === '..')) {
        const value = await processor.asset(asset[1], asset[2]);
        if (!value) return send(404, { error: 'Not found' });
        if (value.bytes instanceof Uint8Array) {
          response.writeHead(200, { 'Content-Type': value.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
          response.end(value.bytes); return;
        }
        return send(200, value);
      }
      return send(404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof ReaderVersionChanged) return send(409, { status: 'revision_changed' });
      return send(503, { error: 'The statement processor could not complete this request' });
    }
  });
  server.listen(port, host);
  return server;
}

async function main() {
  const env = process.env, root = process.cwd(), read = p => JSON.parse(fs.readFileSync(path.join(root, p)));
  if (!env.GLOW_PROCESSOR_BASE_COMMIT && fs.existsSync('.processor-commit')) env.GLOW_PROCESSOR_BASE_COMMIT = fs.readFileSync('.processor-commit', 'utf8').trim();
  if (!/^[a-f0-9]{40}$/.test(env.GLOW_PROCESSOR_BASE_COMMIT ?? '')) throw Error('The image must identify its exact base commit');
  if (!env.GLOW_GITHUB_TOKEN || !env.GLOW_DASHBOARD_PASSWORD) throw Error('Processor repository and vault credentials are required');
  await restoreStatementPasswords();
  const readModels = read('src/data/readModels.json'), publication = read(`public/views/${readModels.revision}/publication.json`);
  const manifest = read('public/audit/manifest.json'), index = read('public/statement-files/index.json');
  const initial = { schemaVersion: 1, revision: readModels.revision, readerRevision: publication.readerRevision,
    archiveRevision: publication.archiveRevision, baseCommit: env.GLOW_PROCESSOR_BASE_COMMIT,
    documents: manifest.map(d => read(`public/audit/${d.docKey}/document.json`)), manifest, records: {},
    book: read(`public/views/${readModels.revision}/canonical/book.json`), originals: index.files, missingOriginals: index.missing,
    previews: {}, lookthrough: read(`public/views/${readModels.revision}/lookthrough.json`) };
  const processor = rapidProcessor({ store: runtimeStore({ token: env.GLOW_GITHUB_TOKEN, repo: env.GLOW_GITHUB_REPO }),
    inbox: inboxFor(env), initial, references: prepareBookReferences(), instantiate: await prepareRuntimeModel(),
    seed: true,
    passwords: passwordsFromEnv(), dashboardPassword: env.GLOW_DASHBOARD_PASSWORD,
    baseAsset: async (commit, name, binary = false) => {
      if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid source revision');
      const response = await fetch(`https://raw.githubusercontent.com/${env.GLOW_GITHUB_REPO ?? 'techmuns/GlowVentures'}/${commit}/public/${name}`,
        { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      return binary ? { bytes: new Uint8Array(await response.arrayBuffer()), type: 'application/octet-stream' } : response.json();
    },
  });
  await processor.initialize();
  serveRapidStatements({ processor, token: env.GLOW_RAPID_STATEMENTS_TOKEN, host: '0.0.0.0', port: Number(env.PORT ?? 8788) });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Statement processor could not initialize; verify its saved publication and configuration.'); process.exitCode = 1; });
}
