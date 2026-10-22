// Public market history only; no portfolio, account or transaction data goes upstream.
const TTL = 6 * 3600;
const json = (body, cache = 'no-store') => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });
async function boundedJson(response) {
  if (!response.ok) throw new Error(`The history provider returned HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The history provider returned an empty response.');
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('The history response was too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const fund = url.searchParams.get('fund'), isin = (url.searchParams.get('isin') || '').toUpperCase();
  const raw = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  if (fund ? !/^\d{3,9}$/.test(fund) || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) : !/^[A-Z0-9&^_.=-]{1,40}$/.test(raw)) return json({ ok: false, reason: 'A verified stock symbol or fund code and ISIN is needed.' });
  const symbol = fund ? fund : raw.includes('.') || raw.startsWith('^') ? raw : `${raw}.NS`;
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const key = new Request(`${url.origin}/__cache/market-history/v2/${today}/${fund ? `fund/${fund}/${isin}` : `stock/${encodeURIComponent(symbol)}`}`);
  const hit = await caches.default.match(key).catch(() => null); if (hit) return hit;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
  try {
    const upstream = fund ? `https://api.mfapi.in/mf/${fund}` : `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=9999999999&interval=1d&events=div%2Csplits&includeAdjustedClose=true`;
    const data = await boundedJson(await fetch(upstream, { signal: controller.signal, redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GlowVenturesDashboard/1.0)', accept: 'application/json' } }));
    const points = new Map(), closes = new Map();
    let name, source, basis, splits = [];
    if (fund) {
      const meta = data?.meta;
      if (String(meta?.scheme_code) !== fund || ![meta?.isin_growth, meta?.isin_div_reinvestment].includes(isin)) throw new Error('The fund history did not match the holding’s exact ISIN and scheme code.');
      name = meta.scheme_name; source = 'AMFI NAV history via MFapi.in'; basis = 'nav';
      for (const row of data.data ?? []) {
        const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(row.date || '');
        if (!match) continue;
        const date = `${match[3]}-${match[2]}-${match[1]}`, value = Number(row.nav);
        if (Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date && date <= today && Number.isFinite(value) && value > 0) points.set(date, value);
      }
    } else {
      const r = data?.chart?.result?.[0];
      if (!r || r.meta?.symbol?.toUpperCase() !== symbol || r.meta?.currency !== 'INR') throw new Error('The stock history did not match the requested INR listing.');
      const values = r.indicators?.adjclose?.[0]?.adjclose, closing = r.indicators?.quote?.[0]?.close;
      splits = Object.values(r.events?.splits ?? {}).map(s => ({ date: Number.isFinite(s.date) ? new Date(s.date * 1000).toISOString().slice(0, 10) : null,
        factor: Number(s.numerator) / Number(s.denominator) })).filter(s => s.date && s.date <= today && Number.isFinite(s.factor) && s.factor > 0);
      if (!Array.isArray(values)) throw new Error('Dividend and split-adjusted closing prices are not available for this listing.');
      const session = r.meta.currentTradingPeriod?.regular;
      const sessionDate = session?.start ? new Date(session.start * 1000).toISOString().slice(0, 10) : today;
      const unfinished = !session?.end || Date.now() < session.end * 1000;
      name = r.meta.longName || r.meta.shortName || symbol; source = 'Yahoo Finance'; basis = 'adjusted-close';
      for (let i = 0; i < (r.timestamp?.length ?? 0); i++) {
        if (!Number.isFinite(r.timestamp[i])) continue;
        const date = new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10), value = values[i];
        if (date <= today && !(unfinished && date === sessionDate) && Number.isFinite(value) && value > 0) {
          points.set(date, value);
          if (Number.isFinite(closing?.[i]) && closing[i] > 0) closes.set(date, closing[i]);
        }
      }
    }
    const ordered = [...points].sort(([a], [b]) => a.localeCompare(b));
    if (!ordered.length) throw new Error('No completed daily prices are available for this investment.');
    // Yahoo's Close adjusts for splits only; Adj Close also adjusts for dividends.
    // Keep both: an adjusted return index must never be multiplied by share units.
    const response = json({ ok: true, version: 2, symbol, isin: fund ? isin : null, name, source, basis, first: ordered[0][0], last: ordered.at(-1)[0], t: ordered.map(([d]) => d), v: ordered.map(([, v]) => v), c: ordered.map(([d, v]) => fund ? v : closes.get(d) ?? null), splits }, `public, max-age=${TTL}`);
    context.waitUntil(caches.default.put(key, response.clone()).catch(() => {}));
    return response;
  } catch (error) {
    return json({ ok: false, reason: error.name === 'AbortError' ? 'The history provider timed out. Retry to load it again.' : error.message || 'The history provider could not be reached.' });
  } finally { clearTimeout(timer); }
}
