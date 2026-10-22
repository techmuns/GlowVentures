// Self-host PDF.js fonts, character maps and decoders behind the dashboard gate.
// Never send a private statement or its password to a third-party viewer/CDN.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = dirname(require.resolve('pdfjs-dist/package.json'));
const target = resolve('public/pdf-assets');
mkdirSync(target, {recursive:true});
for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(source, folder), join(target, folder), {recursive:true});
}
console.log('Prepared self-hosted PDF preview assets');
