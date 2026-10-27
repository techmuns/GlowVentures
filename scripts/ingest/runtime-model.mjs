// Compile the reporting rules once, then instantiate their module-level indexes
// against ONE complete book per immutable version. Never reuse an old index.
import path from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { CANONICAL_BOOK_KEYS } from '../../shared/canonicalBookKeys.mjs';

export async function prepareRuntimeModel(root = process.cwd()) {
  const keys = CANONICAL_BOOK_KEYS;
  const compiled = await build({ stdin: { resolveDir: root, contents:
    'export * from "./src/lib/ledgerModel"; export { buildConsolidatedSheet } from "./src/lib/consolidatedSheet"; export { investedOnOf } from "./src/lib/investedOn"; export { loadStockExposure } from "./src/lib/lookthrough";' },
    bundle: true, write: false, format: 'cjs', platform: 'node', alias: { '@': path.join(root, 'src') }, logLevel: 'error',
    plugins: [{ name: 'one-complete-canonical-book', setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)glowData$/ }, () => ({ path: 'book', namespace: 'runtime-book' }));
      builder.onLoad({ filter: /.*/, namespace: 'runtime-book' }, () => ({ contents:
        keys.map(k => `export const ${k} = __runtimeBook[${JSON.stringify(k)}];`).join('\n'), loader: 'js' }));
    } }] });
  const instantiate = new Function('__runtimeBook', 'exports', 'module', 'require', compiled.outputFiles[0].text);
  const require = createRequire(import.meta.url);
  return book => {
    if (Object.keys(book).sort().join() !== [...keys].sort().join()) throw Error('Incomplete canonical runtime book');
    const module = { exports: {} };
    instantiate(book, module.exports, module, require);
    return module.exports;
  };
}
