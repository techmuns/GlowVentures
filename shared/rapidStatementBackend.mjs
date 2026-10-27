// Server-side only. The browser never receives the processor credential or URL.
export const rapidStatementsEnabled = env => !!((env?.GLOW_RAPID_STATEMENTS?.fetch || env?.GLOW_RAPID_STATEMENTS_URL) && env?.GLOW_RAPID_STATEMENTS_TOKEN);
export async function rapidStatementRequest(env, pathname, init = {}) {
  if (!rapidStatementsEnabled(env)) return null;
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${env.GLOW_RAPID_STATEMENTS_TOKEN}`);
  const options = { ...init, headers,
    signal: init.signal ?? AbortSignal.timeout(25_000) };
  if (env.GLOW_RAPID_STATEMENTS?.fetch) return env.GLOW_RAPID_STATEMENTS.fetch(new Request(new URL(pathname, 'https://statement-processor.internal'), options));
  const base = new URL(env.GLOW_RAPID_STATEMENTS_URL);
  if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) throw Error('Private processor requires HTTPS');
  return fetch(new URL(pathname, base), options);
}
export async function rapidReceiptLog(env, log) {
  if (!rapidStatementsEnabled(env)) return log;
  const response = await rapidStatementRequest(env, '/current');
  if (!response?.ok) return log;
  const state = await response.json();
  return { ...log, batches: log.batches.map(b => ({ ...b, files: b.files.map(f => {
    const receipt = state.receipts?.[b.id]?.files?.find(r => r.name === f.name);
    return f.processor === 'rapid' && receipt ? { ...f, ...receipt } : f;
  }) })) };
}
