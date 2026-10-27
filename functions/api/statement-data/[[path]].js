import { githubStatementReader } from '../../../shared/githubStatementBackend.mjs';
import { onRequestGet as bootstrap } from '../statement-data.js';
export async function onRequestGet({ env, request, params }, fetchImpl) {
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '');
  if (!path) return bootstrap({ env, request }, fetchImpl);
  if (!/^[a-f0-9]{20}\/[a-zA-Z0-9._/-]+$/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) return new Response(null, { status: 404 });
  const preview = /^([a-f0-9]{20})\/statement-previews\/([a-f0-9]{64}\.pdf)$/.exec(path);
  if (preview) return Response.redirect(new URL(`/api/statement-previews/${preview[2]}?revision=${preview[1]}`, request.url), 307);
  try {
    const response = await githubStatementReader(env, fetchImpl).request(`/views/${path}`);
    if (!response) return new Response(null, { status: 404 });
    return new Response(response.body, { status: response.status, headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
