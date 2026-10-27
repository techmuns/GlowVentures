// GitHub Actions publishes one Git pack, without rebuilding/deploying the app.
// A separate index leaves the checkout and main untouched. No force pushes.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runtimeStore, publicationTree, VersionConflict } from './runtime-store.mjs';

export function gitPublicationStore({ root = process.cwd(), remote = 'origin', gitDir, branch = 'statement-publications', materialize, ...options }) {
  if (branch !== 'statement-publications') throw Error('Unexpected publication branch');
  if (remote !== 'origin' && (!path.isAbsolute(remote) || !remote.startsWith(path.join(root, '.cache') + path.sep))) throw Error('Test publication remote must be inside this checkout');
  if (remote === 'origin' && process.env.GITHUB_ACTIONS !== 'true') throw Error('Production publications run only in GitHub Actions');
  const scratch = path.join(root, '.cache', 'github-publication', String(process.pid));
  fs.mkdirSync(scratch, { recursive: true });
  const git = (args, input, extraEnv = {}) => execFileSync('git', [...(gitDir ? ['--git-dir', gitDir] : []), ...args], {
    cwd: root, input, env: { ...process.env, ...extraEnv }, maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const api = runtimeStore({ branch, ...options });
  const putBlob = async value => git(['hash-object', '-w', '--stdin'], Buffer.from(value)).toString().trim();
  const blob = async sha => {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Invalid statement blob');
    try { return git(['cat-file', 'blob', sha]); } catch {
      const bytes = await api.blob(sha);
      if (await putBlob(bytes) !== sha) throw Error('Statement blob checksum mismatch');
      return bytes;
    }
  };
  return { ...api, putBlob, blob,
    async publish(previous, snapshot, receipt) {
      const { state, entries } = await publicationTree(previous, snapshot, receipt, putBlob, materialize);
      const index = path.join(scratch, 'index'), env = { GIT_INDEX_FILE: index };
      if (previous.head) {
        // Fetch only missing tree metadata. The parent is already on the server;
        // it never needs to be uploaded again when publishing a new version.
        try { git(['cat-file', '-e', previous.head]); }
        catch { git(['fetch', '--depth=1', '--filter=blob:none', remote, previous.head]); }
        git(['read-tree', previous.tree], undefined, env);
      } else git(['read-tree', '--empty'], undefined, env);
      const content = entries.filter(e => e.content !== undefined);
      const files = content.map((e, i) => {
        const filename = path.join(scratch, `content-${i}`); fs.writeFileSync(filename, e.content); return filename;
      });
      const hashes = files.length ? git(['hash-object', '-w', '--stdin-paths'], files.join('\n') + '\n').toString().trim().split('\n') : [];
      content.forEach((entry, i) => { entry.sha = hashes[i]; });
      const unique = new Map();
      for (const entry of entries) {
        if (!/^[a-f0-9]{40}$/.test(entry.sha) || /[\\\r\n\0\t]/.test(entry.path)
          || entry.path.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe publication tree entry');
        if (unique.has(entry.path) && unique.get(entry.path) !== entry.sha) throw Error('Conflicting publication tree entry');
        unique.set(entry.path, entry.sha);
      }
      git(['update-index', '-z', '--index-info'], [...unique].map(([name, sha]) => `100644 blob ${sha}\t${name}\0`).join(''), env);
      const tree = git(['write-tree', '--missing-ok'], undefined, env).toString().trim();
      const head = git(['-c', 'user.name=Glow statement intake', '-c', 'user.email=glow-statement-intake@users.noreply.github.com',
        'commit-tree', tree, ...(previous.head ? ['-p', previous.head] : [])],
        `[CF-Pages-Skip] Verified statements ${snapshot.revision} [skip ci]\n`).toString().trim();
      try { git(['push', remote, `${head}:refs/heads/${branch}`]); }
      catch {
        if ((await api.read()).head !== previous.head) throw new VersionConflict('A newer publication must be included before retrying');
        throw Error('GitHub did not accept the statement publication');
      }
      return { head, tree, state };
    },
  };
}
