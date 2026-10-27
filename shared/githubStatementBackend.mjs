// Authenticated, read-only delivery of data produced by GitHub Actions.
// No extraction, book generation, paid service or credential reaches the browser.
export const githubStatementsEnabled = env => !!env?.GLOW_GITHUB_TOKEN;
const branch = 'statement-publications';
const validRevision = value => /^[a-f0-9]{20}$/.test(value);
const limit = 64 * 1024 * 1024;
async function bounded(stream, max = limit) {
  const reader = stream.getReader(), parts = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw Error('Statement data is too large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
export function githubStatementReader(env, fetchImpl = fetch) {
  const base = `https://api.github.com/repos/${env?.GLOW_GITHUB_REPO ?? 'techmuns/GlowVentures'}`;
  let current;
  async function file(name) {
    const response = await fetchImpl(`${base}/contents/${name.split('/').map(encodeURIComponent).join('/')}?ref=${branch}`, { headers: {
      Authorization: `Bearer ${env.GLOW_GITHUB_TOKEN}`, Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'glow-statement-reader', 'Cache-Control': 'no-cache',
    }, signal: AbortSignal.timeout(15_000) });
    if (response.status === 404) return null;
    if (!response.ok || !response.body) throw Error('Statement repository is unavailable');
    const length = Number(response.headers.get('Content-Length'));
    if (length > limit) throw Error('Statement object is too large');
    return response;
  }
  async function state() {
    if (!githubStatementsEnabled(env)) return null;
    current ??= (async () => {
      const response = await file('current.json'); if (!response) return null;
      const value = JSON.parse(new TextDecoder().decode(await bounded(response.body)));
      if (value.storage !== 'github-actions-v1') return null;
      if (value.schemaVersion !== 1 || !validRevision(value.revision) || !/^[a-f0-9]{64}$/.test(value.readerRevision)) throw Error('Invalid statement publication');
      return value;
    })();
    return current;
  }
  async function request(pathname) {
    if (!githubStatementsEnabled(env)) return null;
    if (pathname === '/current') {
      const value = await state();
      return value ? Response.json({ schemaVersion: 1, revision: value.revision, readerRevision: value.readerRevision, receipts: value.receipts }) : null;
    }
    let name;
    if (['/bootstrap', '/published'].includes(pathname)) {
      const value = await state(); if (!value) return null;
      name = `views/${value.revision}/${pathname.slice(1)}.json`;
    } else if (/^\/views\/[a-f0-9]{20}\/[a-zA-Z0-9._/-]+$/.test(pathname)
      && !pathname.slice(1).split('/').some(p => !p || p === '.' || p === '..')) name = pathname.slice(1);
    else return new Response(null, { status: 404 });
    const response = await file(name);
    if (!response) return new Response(null, { status: 404 });
    // Stream prepared bytes. Git packs compress storage/transfer on publication;
    // the free host performs no base64 conversion, decompression or book parsing.
    let size = 0;
    const stream = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > limit) throw Error('Statement object is too large');
      controller.enqueue(chunk);
    } }));
    return new Response(stream, { headers: { 'Content-Type': /\/statement-(files|previews)\/(?!index\.json$)/.test(name)
      ? name.includes('/statement-files/') && name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream' : 'application/json' } });
  }

  async function receiptLog(log) {
    const value = await state();
    if (!value) return log;
    return { ...log, batches: log.batches.map(b => ({ ...b, files: b.files.map(f => {
      const receipt = value.receipts?.[b.id]?.files?.find(r => r.name === f.name);
      return ['github', 'rapid'].includes(f.processor) && receipt ? { ...f, ...receipt } : f;
    }) })) };
  }
  return { state, request, receiptLog };
}
