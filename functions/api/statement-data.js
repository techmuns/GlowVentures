import { githubStatementReader, githubStatementsEnabled } from '../../shared/githubStatementBackend.mjs';
export async function onRequestGet({ env, request }, fetchImpl) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
    ...(githubStatementsEnabled(env) ? { 'X-Glow-Statement-Storage': 'github' } : {}) };
  try {
    const status = new URL(request.url).searchParams.get('status') === '1';
    const response = await githubStatementReader(env, fetchImpl).request(status ? '/current' : '/bootstrap');
    if (!response) {
      // Before the first upload, keep discovery on this endpoint. That first
      // data-only publication must be visible without a dashboard deployment.
      if (status && githubStatementsEnabled(env) && env.ASSETS?.fetch) {
        const compiled = await env.ASSETS.fetch(new URL('/publication.json', request.url));
        if (!compiled.ok) throw Error('Compiled publication is unavailable');
        return new Response(compiled.body, { headers });
      }
      return new Response(null, { status: 204, headers });
    }
    return new Response(response.body, { status: response.status, headers });
  } catch { return Response.json({ error: 'Latest statements are unavailable' }, { status: 503, headers }); }
}
