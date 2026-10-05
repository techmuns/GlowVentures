// The real server handler in local Vite and browser regressions. Assets are
// served only from this checkout; no request reaches a production API.
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
let handler;
async function loadHandler() {
  if (!handler) handler = (async () => {
    const result = await build({ entryPoints: ['functions/api/stock-exposure.ts'], bundle: true, write: false,
      platform: 'node', format: 'esm', alias: { '@': path.resolve('src') }, logLevel: 'error' });
    return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)).onRequestPost;
  })();
  return handler;
}
export async function serveExposure(request) {
  const handle = await loadHandler();
  return handle({ request, waitUntil: p => { void p.catch(() => {}); }, env: { ASSETS: { fetch: async request => {
    const pathname = new URL(request.url).pathname;
    if (!/^\/views\/[a-f0-9]{20}\/lookthrough.json$/.test(pathname)) return new Response(null, { status: 404 });
    try { return new Response(await fs.readFile(path.join(process.cwd(), 'public', pathname)), { headers: { 'content-type': 'application/json' } }); }
    catch { return new Response(null, { status: 404 }); }
  } } } });
}
export async function installReadModelRoutes(page) {
  await page.route('**/api/stock-exposure', async route => {
    const request = route.request();
    const result = await serveExposure(new Request(request.url(), { method: 'POST', body: request.postData() }));
    await route.fulfill({ status: result.status, contentType: 'application/json', body: await result.text() });
  });
}
export function readModelApi() {
  const install = server => { server.middlewares.use(async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/stock-exposure' || req.method !== 'POST') return next();
    try {
      let size = 0; const chunks = [];
      for await (const part of req) {
        size += part.length; if (size > 128 * 1024) { res.writeHead(413); res.end(); return; }
        chunks.push(part);
      }
      const response = await serveExposure(new Request('http://localhost/api/stock-exposure', { method: 'POST', body: Buffer.concat(chunks) }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
    } catch { res.writeHead(503); res.end('{"status":"unreachable"}'); }
  }); };
  return { name: 'read-model-api', configureServer: install, configurePreviewServer: install };
}
