import { readerRevisionFor } from './ingest/reader-revision.mjs';
// Build-server read models. Source absence is a build failure, never a silently
// partial ledger. URLs are derived from output content, so book revisions cannot mix.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { archiveRevision, documentEvidence, positionEvidenceReader, safeKey, digest } from './ingest/lib/publication.mjs';
const root = process.cwd();
const compiled = await build({ stdin: { contents: 'export * from "./src/lib/ledgerModel"; export { buildConsolidatedSheet } from "./src/lib/consolidatedSheet"; export { investedOnOf } from "./src/lib/investedOn"; export * from "./src/data/glowData";', resolveDir: root }, bundle: true, write: false, format: 'esm', platform: 'node', alias: { '@': path.join(root, 'src') }, logLevel: 'error' });
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const read = async (p) => JSON.parse(await fs.readFile(path.join(root, 'public', p), 'utf8'));
const manifest = await read('audit/manifest.json');
if (manifest.some(d => !safeKey(d.docKey))) throw new Error('Unsafe archive document key');
const docs = await Promise.all(manifest.map(d => read(`audit/${d.docKey}/document.json`)));
const outputs = new Map();
const put = (name, value) => outputs.set(name, JSON.stringify(value));
// These are backend audit endpoints served by the existing password gate. The
// canonical book, lineage and all reporting projections share ONE revision.
const canonicalBook = Object.fromEntries(Object.entries(model).filter(([key]) => key.startsWith('BOOK_')));
const readerRevision = await readerRevisionFor(root);
const rawSources = new Map();
try {
  for (const file of (await fs.readdir(path.join(root, 'public/audit/deliveries'))).sort()) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) throw new Error('Invalid delivery receipt name');
    const receipt = await read(`audit/deliveries/${file}`);
    for (const d of receipt.documents) {
      const key = `${d.document}|${d.revision}`, old = rawSources.get(key);
      if (old && old.sha256 !== d.sha256) throw new Error('Conflicting raw source checksums for one normalized document');
      rawSources.set(key, { ...d, receipt: `audit/deliveries/${file}` });
    }
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
put('canonical/book.json', canonicalBook);
if (model.BOOK_POSITIONS.some(p => !p.review && !p.statementRecord)) throw new Error('Regenerate the book: a statement position has no selected source record.');
const evidenceForPosition = positionEvidenceReader(docs, model.BOOK_ACCOUNTS);
put('provenance/positions.json', model.BOOK_POSITIONS.map(p => ({ ...evidenceForPosition(p),
  investmentDate: { value: model.investedOnOf([p]), inputs: { accountId: p.accountId, memberId: p.memberId ?? null,
    securityKey: p.securityKey, heldSince: p.heldSince ?? null, heldPurchases: p.recoveredCost?.heldPurchases ?? null,
    supplementary: p.recoveredCost?.evidence ?? [], review: p.reviewSource ?? null,
    tranches: model.BOOK_POSITION_TRANCHES[`${p.accountId}|${p.securityKey}`] ?? null } } })));
for (const doc of docs) {
  const source = rawSources.get(`${doc.docKey}|${digest(doc)}`);
  put(`canonical/documents/${doc.docKey}.json`, doc);
  put(`provenance/documents/${doc.docKey}.json`, { ...documentEvidence(doc, { readerRevision, sourceSha256: source?.sha256 ?? null }),
    normalizedDocument: `canonical/documents/${doc.docKey}.json`, receipt: source?.receipt ?? null });
}
put('publication.json', { schemaVersion: 1, archiveRevision: archiveRevision(docs), bookRevision: digest(canonicalBook), readerRevision,
  statementDocuments: docs.map(d => ({ document: d.docKey, revision: digest(d), evidence: `provenance/documents/${d.docKey}.json` })),
  canonical: 'canonical/book.json', positions: 'provenance/positions.json',
  overlays: { livePrices: 'Quotes and NAVs retain their own provider/time; they do not overwrite the statement evidence.',
    enteredData: 'Entered capital calls and investment profiles retain their separate dashboard-store history.' } });
put('ledger/transactions.json', model.deriveTransactions(docs));
put('ledger/lots.json', model.deriveRealisedLots(docs));
put('ledger/income.json', model.deriveIncome(docs));
put('ledger/sales.json', model.deriveSales(docs));
put('consolidated/book.json', model.buildConsolidatedSheet(docs));
const keys = new Set([...model.BOOK_POSITIONS.map(p => p.securityKey), ...docs.flatMap(d => ['transactions','capitalGains','holdings','income','openLots'].flatMap(k => (d[k] || []).map(r => r.securityKey)))]);
const stockKeys = [...keys].filter(Boolean).sort();
for (const [key, ledger] of Object.entries(model.deriveStockLedgers(docs, stockKeys))) {
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`Invalid security key: ${key}`);
  put(`ledger/stocks/${key}.json`, ledger);
}
// A FUND'S OWN PORTFOLIO, FROM THE STATEMENTS — deliberately its own model and
// not folded into `lookthrough.json`. That one is the AMCs' monthly filings for
// mutual funds and ETFs, with an ISIN and a value per line, and it is what
// `companyExposure` is built on; this is the one AIF disclosure in the archive,
// a name and a weight per line, read by one card. One model for two sources
// would make an AIF's weights reach every stock-axis figure (Stage 10df).
// The canonical promoter ring-fence is applied HERE, on the build server, so a
// disclosed line naming it never reaches a browser — `functions/api/stock-exposure.js`
// does the same for the look-through, and for the same reason: the fence is a
// decision about the BOOK, and `ledgerModel` is about the archive.
put('fund-disclosures.json', model.deriveFundDisclosures(docs, new Set(model.BOOK_POLYCAB.map(p => p.securityKey))));
// THE PORTFOLIO LIBRARY'S FOLDERS: every statement that names each security,
// behind the same ring-fence (`deriveStatementSecurities`).
put('statement-securities.json', model.deriveStatementSecurities(docs, { keys: new Set(model.BOOK_POLYCAB.map(p => p.securityKey)),
  isins: new Set(model.BOOK_POLYCAB.flatMap(p => p.isin ? [p.isin.trim().toUpperCase()] : [])) }));
const index = await read('lookthrough/index.json');
const portfolios = Object.fromEntries(await Promise.all([...new Set(Object.values(index.schemes || {}).map(s => s.schemecode))].sort().map(async code => [code, await read(`lookthrough/${code}.json`)])));
put('lookthrough.json', { index, portfolios });
const hash = createHash('sha256');
for (const [name, body] of outputs) hash.update(name).update('\0').update(body).update('\0');
const revision = hash.digest('hex').slice(0, 20);
const target = path.join(root, 'public/views', revision);
await fs.mkdir(target, { recursive: true });
for (const [name, body] of outputs) {
  const file = path.join(target, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body + '\n');
}
// Keys absent from this complete archive have a valid empty ledger, including
// companies held only through funds. A missing file for a listed key is an outage.
const manifestPath = path.join(root, 'src/data/readModels.json');
const manifestTemporary = `${manifestPath}.${process.pid}.tmp`;
await fs.writeFile(manifestTemporary, JSON.stringify({ revision, readerRevision, stockKeys, emptyLedger: model.deriveStockLedger(docs, ''), publication: 'publication.json' }) + '\n');
await fs.rename(manifestTemporary, manifestPath);
// Stable discovery URL. The immutable revision below it pins an audit/export to
// one dataset; deployment promotes this pointer with all other Pages assets.
const publicationPath = path.join(root, 'public/publication.json');
const publicationTemporary = `${publicationPath}.${process.pid}.tmp`;
await fs.writeFile(publicationTemporary, JSON.stringify({ schemaVersion: 1, revision, archiveRevision: archiveRevision(docs),
  manifest: `/views/${revision}/publication.json` }) + '\n');
await fs.rename(publicationTemporary, publicationPath);
console.log(`Prepared ${docs.length} statements into ${outputs.size} views (${revision}); ledger views ${[...outputs].filter(([n])=>/^ledger\/[^/]+\.json$/.test(n)).map(([n,b])=>`${n}: ${Buffer.byteLength(b)} B`).join(', ')}`);
