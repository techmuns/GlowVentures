// Canonical publications and originals remain in GitHub. The compute service
// keeps only disposable caches. A compare-and-swap promotes one whole version.
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export class VersionConflict extends Error {}
export function runtimeStore({ token, repo = 'techmuns/GlowVentures', branch = 'statement-publications', fetchImpl = fetch }) {
  const base = `https://api.github.com/repos/${repo}`, enc = s => s.split('/').map(encodeURIComponent).join('/');
  async function call(method, endpoint, body, allow404 = false) {
    const response = await fetchImpl(base + endpoint, { method, headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'glow-statement-processor', 'Cache-Control': 'no-cache', ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw Error(`Statement repository answered HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  const blob = async sha => {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Invalid statement blob');
    const data = await call('GET', `/git/blobs/${sha}`);
    const bytes = Buffer.from(data.content, 'base64');
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (actual !== sha) throw Error('Statement blob checksum mismatch');
    return bytes;
  };
  const put = async bytes => (await call('POST', '/git/blobs', { encoding: 'base64', content: Buffer.from(bytes).toString('base64') })).sha;
  async function read() {
    const ref = await call('GET', `/git/ref/heads/${enc(branch)}`, null, true);
    if (!ref) return { head: null, tree: null, state: null };
    const head = ref.object.sha;
    const [commit, file] = await Promise.all([
      call('GET', `/git/commits/${head}`), call('GET', `/contents/current.json?ref=${head}`),
    ]);
    return { head, tree: commit.tree.sha, state: JSON.parse(Buffer.from(file.content || (await call('GET', `/git/blobs/${file.sha}`)).content, 'base64')) };
  }
  return {
    read, blob,
    async load(state) { return JSON.parse(gunzipSync(await blob(state.artifact))); },
    async publish(previous, snapshot, receipt) {
      const artifact = await put(gzipSync(JSON.stringify(snapshot), { level: 1 }));
      const state = { schemaVersion: 1, revision: snapshot.revision, readerRevision: snapshot.readerRevision,
        artifact, receipts: { ...(previous.state?.receipts ?? {}), [receipt.id]: receipt } };
      const entries = [{ path: `versions/${snapshot.revision}.json.gz`, mode: '100644', type: 'blob', sha: artifact },
        { path: 'current.json', mode: '100644', type: 'blob', content: JSON.stringify(state) }];
      const tree = await call('POST', '/git/trees', { ...(previous.tree ? { base_tree: previous.tree } : {}), tree: entries });
      const commit = await call('POST', '/git/commits', { message: `Verified statements ${snapshot.revision} [skip ci]`,
        tree: tree.sha, parents: previous.head ? [previous.head] : [] });
      // No force and no automatic replay of a stale financial candidate.
      try {
        await call(previous.head ? 'PATCH' : 'POST', previous.head ? `/git/refs/heads/${enc(branch)}` : '/git/refs',
          previous.head ? { sha: commit.sha, force: false } : { ref: `refs/heads/${branch}`, sha: commit.sha });
      } catch (error) {
        if ((await read()).head !== previous.head) throw new VersionConflict('A newer publication must be included before retrying');
        throw error;
      }
      return { head: commit.sha, tree: tree.sha, state };
    },
    async loadVersion(revision) {
      if (!/^[a-f0-9]{20}$/.test(revision)) throw Error('Invalid statement version');
      const file = await call('GET', `/contents/versions/${revision}.json.gz?ref=${enc(branch)}`);
      return JSON.parse(gunzipSync(await blob(file.sha)));
    },
  };
}
