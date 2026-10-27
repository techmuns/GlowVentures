import { rapidStatementRequest } from '../../shared/rapidStatementBackend.mjs';
export async function onRequestGet({ env, request }) {
  try {
    const status = new URL(request.url).searchParams.get('status') === '1';
    const response = await rapidStatementRequest(env, status ? '/current' : '/bootstrap');
    if (!response) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Latest statements are unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
