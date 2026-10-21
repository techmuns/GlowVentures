// Export one exact code revision and reuse prepared dependencies. All source,
// local Git objects, browser evidence and reports remain inside this checkout.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const parent = path.join(root, '.cache/build-copies'); fs.mkdirSync(parent, { recursive: true });
const workspace = path.join(parent, 'statement-upload-e2e');
if (fs.existsSync(workspace)) throw new Error('Prior upload rehearsal retained at ' + workspace + '. Reuse that workspace for investigation; do not overwrite its evidence.');
fs.mkdirSync(workspace);
const sourceArchive = path.join(parent, 'statement-upload-e2e-source.tar');
execFileSync('git', ['archive', 'HEAD', '--output', sourceArchive], { cwd: root });
execFileSync('tar', ['-xf', sourceArchive, '-C', workspace]);
const dependencies = fs.realpathSync(path.join(root, 'node_modules'));
if (process.platform === 'darwin') {
  execFileSync('/Users/chiraagkapil/.codex/bin/codex-temp-copy', [dependencies, path.join(workspace, 'node_modules')], { stdio: 'inherit' });
} else fs.symlinkSync(dependencies, path.join(workspace, 'node_modules'), 'dir');
const child = spawn(process.execPath, [path.join(root, 'scripts/dev/check-statement-upload-e2e.mjs'), workspace], { cwd: root, env: process.env, stdio: 'inherit' });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
