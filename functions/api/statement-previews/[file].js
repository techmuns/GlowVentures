import { keyFromCookie, openPreview, MAX_PREVIEW_BYTES } from '../../../shared/statementPreviewCrypto.mjs';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const failure = (status, message) => new Response(message, { status, headers });
export async function onRequest(context) {
  if (!['GET', 'HEAD'].includes(context.request.method)) return failure(405, 'Method not allowed');
  const match = /^([a-f0-9]{64})\.pdf$/.exec(context.params.file);
  if (!match) return failure(404, 'Preview not found');
  const key = keyFromCookie(context.request.headers.get('Cookie'));
  if (!key) return failure(401, 'Sign into the dashboard again to open saved previews.');
  try {
    const url = new URL(`/statement-previews/${match[1]}.bin`, context.request.url);
    const asset = await context.env.ASSETS.fetch(new Request(url));
    if (!asset.ok || !asset.body) return failure(404, 'Preview not found');
    // AES-GCM must authenticate the complete file before returning any bytes.
    const reader = asset.body.getReader(), chunks = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > MAX_PREVIEW_BYTES + 68) { await reader.cancel(); return failure(413, 'Preview is too large'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const sealed = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { sealed.set(chunk, offset); offset += chunk.length; }
    const pdf = await openPreview(sealed, key, match[1]);
    return new Response(context.request.method === 'HEAD' ? null : pdf, { headers: { ...headers,
      'Content-Type': 'application/pdf', 'Content-Length': String(pdf.length),
      'Content-Disposition': 'inline; filename="statement.pdf"' } });
  } catch { return failure(422, 'Saved preview could not be opened. Sign in again or download the original.'); }
}
