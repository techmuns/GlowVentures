// Build-server read models. Source absence is a build failure, never a silently
// partial ledger. URLs are derived from output content, so book revisions cannot mix.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const root = process.cwd();
const compiled = await build({ stdin: { contents: 'export * from "./src/lib/ledgerModel"; export { buildConsolidatedSheet } from "./src/lib/consolidatedSheet"; export { BOOK_POSITIONS, BOOK_POLYCAB } from "./src/data/glowData";', resolveDir: root }, bundle: true, write: false, format: 'esm', platform: 'node', alias: { '@': path.join(root, 'src') }, logLevel: 'error' });
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const read = async (p) => JSON.parse(await fs.readFile(path.join(root, 'public', p), 'utf8'));
const manifest = await read('audit/manifest.json');
const docs = await Promise.all(manifest.map(d => read(`audit/${d.docKey}/document.json`)));
const outputs = new Map();
const put = (name, value) => outputs.set(name, JSON.stringify(value));
put('ledger/transactions.json', model.deriveTransactions(docs));
put('ledger/lots.json', model.deriveRealisedLots(docs));
put('ledger/income.json', model.deriveIncome(docs));
put('ledger/sales.json', model.deriveSales(docs));
put('consolidated/book.json', model.buildConsolidatedSheet(docs));
const keys = new Set([...model.BOOK_POSITIONS.map(p => p.securityKey), ...docs.flatMap(d => ['transactions','capitalGains','holdings','income'].flatMap(k => (d[k] || []).map(r => r.securityKey)))]);
const stockKeys = [...keys].filter(Boolean).sort();
for (const key of stockKeys) {
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`Invalid security key: ${key}`);
  put(`ledger/stocks/${key}.json`, model.deriveStockLedger(docs, key));
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
await fs.writeFile(path.join(root, 'src/data/readModels.json'), JSON.stringify({ revision, stockKeys, emptyLedger: model.deriveStockLedger(docs, '') }) + '\n');
console.log(`Prepared ${docs.length} statements into ${outputs.size} views (${revision}); ledger views ${[...outputs].filter(([n])=>/^ledger\/[^/]+\.json$/.test(n)).map(([n,b])=>`${n}: ${Buffer.byteLength(b)} B`).join(', ')}`);
