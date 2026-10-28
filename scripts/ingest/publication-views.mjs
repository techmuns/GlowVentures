// Generate every reporting view before the publication pointer can advance.
import fs from 'node:fs';
import path from 'node:path';
import { rapidProcessor } from './rapid-processor.mjs';

export function publicationViews({ root = process.cwd(), instantiate, store, baseAsset }) {
  return async snapshot => {
    const renderer = rapidProcessor({ initial: snapshot, instantiate, baseAsset,
      store: { ...store, read: async () => ({ state: null }) } });
    await renderer.initialize();
    const entries = [], prefix = `views/${snapshot.revision}/`;
    const json = (name, value) => {
      const content = JSON.stringify(value);
      if (Buffer.byteLength(content) > 64 * 1024 * 1024) throw Error(`Publication view exceeds the delivery bound: ${name}`);
      entries.push({ path: prefix + name, mode: '100644', type: 'blob', content });
    };
    json('bootstrap.json', renderer.snapshot()); json('published.json', renderer.published());
    const names = new Set(['canonical/book.json', 'publication.json', 'audit/manifest.json', 'audit/formats.json',
      'statement-files/index.json', 'provenance/positions.json', 'ledger/transactions.json', 'ledger/lots.json',
      'ledger/income.json', 'ledger/sales.json', 'consolidated/book.json', 'fund-disclosures.json', 'statement-securities.json', 'exposure-fence.json', 'lookthrough.json']);
    for (const [key, ledger] of Object.entries(renderer.stockLedgers())) json(`ledger/stocks/${key}.json`, ledger);
    for (const doc of snapshot.documents) {
      names.add(`canonical/documents/${doc.docKey}.json`); names.add(`provenance/documents/${doc.docKey}.json`);
      const auditFiles = new Set(['document.json', ...Object.keys(snapshot.records[doc.docKey]?.files ?? {})]);
      const dir = path.join(root, 'public/audit', doc.docKey);
      if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir)) if (name.endsWith('.json')) auditFiles.add(name);
      for (const name of auditFiles) names.add(`audit/${doc.docKey}/${name}`);
    }
    for (const name of names) {
      const value = await renderer.asset(snapshot.revision, name);
      if (value === null || value === undefined) {
        if (name === 'audit/formats.json') { json(name, {}); continue; }
        throw Error(`Publication view is missing: ${name}`);
      }
      json(name, value);
    }
    const originals = [];
    const raw = (name, sha, filename) => originals.push({ name, sha, filename });
    for (const original of Object.values(snapshot.originals)) {
      raw(`statement-files/${original.file}`, original.blob,
        original.sourcePath ? null : path.join(root, 'public/statement-files', original.file));
    }
    const previews = new Set(Object.values(snapshot.originals).flatMap(f => f.preview ? [f.preview.file] : []));
    for (const file of previews) raw(`statement-previews/${file}`, snapshot.previews[file]?.blob,
      snapshot.previews[file] ? null : path.join(root, 'public/statement-previews', file.replace(/\.pdf$/, '.bin')));
    // One Git invocation imports all baseline ZIP members and previews, rather
    // than launching a process for each original on every statement upload.
    const files = [...new Set(originals.map(f => f.filename).filter(Boolean))];
    const hashes = store.putFiles ? await store.putFiles(files) : new Map(await Promise.all(files.map(async file => [file, await store.putBlob(fs.readFileSync(file))])));
    for (const { name, sha, filename } of originals) {
      const actual = filename ? hashes.get(filename) : sha;
      if (!actual || (sha && sha !== actual)) throw Error('Original bytes differ from their publication index');
      entries.push({ path: prefix + name, mode: '100644', type: 'blob', sha: actual });
    }
    return entries;
  };
}
