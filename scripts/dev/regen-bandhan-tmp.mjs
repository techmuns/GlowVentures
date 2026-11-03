// TEMPORARY (removed before merge): open the four sealed Bandhan uploads with
// the vault and regenerate the archive on a runner. Prints indices only.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { restoreStatementPasswords } from '../lib/statementPasswords.mjs';
import { extractLayout, passwordsFromEnv } from '../ingest/lib/layout.mjs';

await restoreStatementPasswords();
const pw = passwordsFromEnv();
console.log(`vault entries: ${pw.length}`);
const dir = 'source/uploads-2026-11-04/Bandhan Mutual Fund';
for (const f of fs.readdirSync(dir)) {
  const bytes = fs.readFileSync(`${dir}/${f}`);
  const grid = await extractLayout(new Uint8Array(bytes), { passwords: pw });
  let note = `entry #${grid.usedPassword}`;
  if (grid.error) {
    const variants = { lower: p => p.toLowerCase(), upper: p => p.toUpperCase() };
    note = `no entry opens it (${grid.error})`;
    for (const [name, fn] of Object.entries(variants)) {
      const g = await extractLayout(new Uint8Array(bytes), { passwords: pw.map(fn) });
      if (!g.error) { note = `opens with ${name}-cased entry #${g.usedPassword}`; break; }
    }
  }
  console.log(`${f}: pages ${grid.numPages} — ${note}`);
}
for (const args of [['inventory'], ['extract'], ['build-symbols'], ['build-book'], ['build-review-columns'], ['run', 'accounts-table', '--', '--write'], ['build:statement-files']]) {
  const a = args[0] === 'run' ? args : ['run', ...args];
  console.log(`\n$ npm ${a.join(' ')}`);
  const r = spawnSync('npm', a, { stdio: 'inherit', env: process.env });
  if (r.status) console.log(`(exit ${r.status})`);
}
