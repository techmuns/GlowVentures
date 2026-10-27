import { rapidStatementRequest } from '../../../shared/rapidStatementBackend.mjs';
import { onRequestGet as bootstrap } from '../statement-data.js';
import { keyFromCookie, openPreview } from '../../../shared/statementPreviewCrypto.mjs';
export async function onRequestGet({ env, request, params }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '');
  // Pages also routes the bare directory through its optional catch-all.
  if (!path) return bootstrap({ env, request });
  if (!/^[a-f0-9]{20}\/[a-zA-Z0-9._/-]+$/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) return new Response(null, { status: 404 });
  try {
    const response = await rapidStatementRequest(env, `/views/${path}`);
    if (!response) return new Response(null, { status: 404 });
    const preview = /^[a-f0-9]{20}\/statement-previews\/([a-f0-9]{64})\.pdf$/.exec(path);
    let body = response.body, type = response.headers.get('Content-Type') ?? 'application/octet-stream';
    if (preview && response.ok) {
      const key = keyFromCookie(request.headers.get('Cookie'));
      if (!key) return new Response(null, { status: 401 });
      body = await openPreview(new Uint8Array(await response.arrayBuffer()), key, preview[1]); type = 'application/pdf';
    }
    return new Response(body, { status: response.status, headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
