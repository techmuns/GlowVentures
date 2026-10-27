// One disposable compute instance per family book. Canonical state is in
// GitHub; this Durable Object deliberately does not write application storage.
import { DurableObject } from 'cloudflare:workers';
import { timingSafeEqual } from 'node:crypto';

const authorized = (request, token) => {
  if (!token || token.length < 32) return false;
  const supplied = new TextEncoder().encode(request.headers.get('Authorization') ?? '');
  const expected = new TextEncoder().encode(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};
const unavailable = () => Response.json({ error: 'Statement processor is unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

export class StatementProcessor extends DurableObject {
  async fetch(request) {
    if (!authorized(request, this.env.GLOW_RAPID_STATEMENTS_TOKEN)) return new Response(null, { status: 401 });
    const container = this.ctx.container;
    if (!container) return unavailable();
    try {
      if (!container.running) container.start({ enableInternet: true, env: {
        GLOW_GITHUB_TOKEN: this.env.GLOW_GITHUB_TOKEN,
        GLOW_DASHBOARD_PASSWORD: this.env.GLOW_DASHBOARD_PASSWORD,
        GLOW_RAPID_STATEMENTS_TOKEN: this.env.GLOW_RAPID_STATEMENTS_TOKEN,
        GLOW_GITHUB_REPO: 'techmuns/GlowVentures',
      } });
      await container.setInactivityTimeout(15 * 60_000);
      const port = container.getTcpPort(8788), deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        try {
          const health = await port.fetch('http://processor/__health');
          const healthy = health.ok;
          await health.body?.cancel();
          if (healthy) return port.fetch(request);
        } catch { /* The private port is not ready during a cold start. */ }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch { /* Fail closed without logging repository or vault credentials. */ }
    return unavailable();
  }
}
export default {
  async fetch(request, env) {
    if (!authorized(request, env.GLOW_RAPID_STATEMENTS_TOKEN)) return new Response(null, { status: 401 });
    return env.STATEMENT_PROCESSOR.getByName('glow-family-office').fetch(request);
  },
};
