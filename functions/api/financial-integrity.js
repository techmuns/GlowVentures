// Read-only, authenticated by the common edge gate. The report is prepared and
// versioned alongside the exact canonical book, never recomputed from mixed data.
import { githubStatementReader } from '../../shared/githubStatementBackend.mjs';
const PARTS = new Set(['integrity', 'graph', 'events', 'metrics', 'checks', 'reconciliationReviews', 'registry']);
export async function onRequestGet({ request, env }) {
  const part = new URL(request.url).searchParams.get('part') ?? 'integrity';
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!PARTS.has(part)) return Response.json({ error: 'Unknown financial report' }, { status: 400, headers });
  try {
    const backend = githubStatementReader(env), current = await backend.state();
    let response;
    if (current) response = await backend.request(`/views/${current.revision}/financial/${part}.json`);
    else {
      if (!env.ASSETS?.fetch) throw Error('Static financial report is unavailable');
      const publication = await env.ASSETS.fetch(new URL('/publication.json', request.url));
      if (!publication.ok) throw Error('Publication is unavailable');
      const manifest = await publication.json();
      if (!/^[a-f0-9]{20}$/.test(manifest.revision)) throw Error('Invalid financial revision');
      response = await env.ASSETS.fetch(new URL(`/views/${manifest.revision}/financial/${part}.json`, request.url));
    }
    if (!response?.ok || !response.headers.get('Content-Type')?.includes('application/json')) throw Error('Financial report is unavailable');
    return new Response(response.body, { headers });
  } catch { return Response.json({ error: 'The financial report could not be loaded for this book version.' }, { status: 503, headers }); }
}
