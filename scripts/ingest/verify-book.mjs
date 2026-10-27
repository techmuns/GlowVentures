#!/usr/bin/env node
// Verify the prepared book against the exact archive it was built from.
import fs from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';
import { readArchive, ROOT } from './verify-publication.mjs';
import { positionEvidenceReader, holdingKey } from './lib/publication.mjs';
const source = fs.readFileSync(process.env.GLOW_BOOK_TS ?? path.join(ROOT, 'src/data/glowData.ts'), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const book = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const docs = readArchive(process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, 'public/audit'));
const keys = new Set();
const evidenceForPosition = positionEvidenceReader(docs, book.BOOK_ACCOUNTS);
for (const position of book.BOOK_POSITIONS) {
  const key = holdingKey(position);
  if (keys.has(key)) throw new Error(`Ambiguous canonical holding: ${key}`);
  keys.add(key);
  if (!position.review && !position.statementRecord) throw new Error(`Missing selected statement record: ${key}`);
  evidenceForPosition(position);
}
console.log(`Verified ${keys.size} canonical holding identities and their selected source records.`);
