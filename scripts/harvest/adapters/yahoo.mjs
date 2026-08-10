// ADAPTER — Yahoo Finance chart API. Daily closes for commodities, equity
// indices, currencies and the CBOE yield indices.
//
// THE PARAMETER THAT MATTERS
// ──────────────────────────
// `range=max` comes back COARSENED — Yahoo silently drops to weekly or monthly
// bars on a long range, which is fine for a decade-long chart and ruins every
// short-horizon return computed from it. `period1=0&period2=<far future>` with
// `interval=1d` returns the same span at true daily granularity: the S&P comes
// back with 14,271 daily closes from January 1970. So this adapter never uses
// `range`, and the harvest report prints each series' point count and first date
// so a silent coarsening would be visible immediately.
//
// UNITS ARE THE SOURCE'S, AND THEY ARE NOT ALL DOLLARS. Yahoo quotes the grains,
// cotton, sugar and coffee in US CENTS and reports `currency: "USX"`. The
// catalogue declares the unit for each series and this adapter records what the
// upstream actually said, so a mismatch between the two is caught rather than
// rendered as a 100x error that looks like a plausible price.

const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";
const TIMEOUT_MS = 30000;

/** Yahoo's currency code → the unit string this repo uses. */
const CURRENCY_UNIT = { USX: "USc", USD: "USD", INR: "INR", GBP: "GBP", EUR: "EUR", JPY: "JPY", HKD: "HKD", CNY: "CNY" };

const iso = (epochSeconds) => new Date(epochSeconds * 1000).toISOString().slice(0, 10);

async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, accept: "application/json" }, signal: ctrl.signal });
      if (r.ok) return await r.json();
      // 4xx other than 429 will not improve on a retry.
      if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status}`);
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((res) => setTimeout(res, 1500 * 2 ** i));
  }
  throw lastErr ?? new Error("unreachable");
}

/**
 * Fetch one series' full daily history.
 * @returns {{points: {t:string,v:number}[], upstreamCurrency: string|null, exchange: string|null}}
 */
export async function fetchSeries(spec) {
  const sym = spec.source.symbol;
  const url = `${CHART}/${encodeURIComponent(sym)}?period1=0&period2=9999999999&interval=1d`;
  const j = await fetchWithRetry(url);
  const res = j?.chart?.result?.[0];
  if (!res) {
    const err = j?.chart?.error?.description || "no result in response";
    throw new Error(`${sym}: ${err}`);
  }
  const stamps = res.timestamp ?? [];
  const closes = res.indicators?.quote?.[0]?.close ?? [];
  const points = [];
  // THE LAST BAR IS TODAY'S SESSION, STILL OPEN. Yahoo appends an in-progress
  // bar whose "close" is really the last trade, and it moves all day. Storing it
  // would put an intraday snapshot into a series of CLOSES — the stored value
  // for a date would change every time the harvester ran, and a 1-day return
  // would be measured against a price that was never a close. Only settled
  // sessions are stored; what the market is doing right now is the live quote
  // proxy's job, not this store's.
  const today = new Date().toISOString().slice(0, 10);
  // One point per trading day. A null close is a non-trading stamp Yahoo pads
  // with — dropped rather than carried forward, which would invent a flat day.
  const byDate = new Map();
  for (let i = 0; i < stamps.length; i++) {
    const v = closes[i];
    if (!Number.isFinite(v)) continue;
    const t = iso(stamps[i]);
    if (t >= today) continue;               // settled sessions only
    byDate.set(t, v);                       // later stamp on a date wins
  }
  for (const [t, v] of byDate) points.push({ t, v });
  points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

  return {
    points,
    upstreamCurrency: res.meta?.currency ?? null,
    exchange: res.meta?.fullExchangeName ?? res.meta?.exchangeName ?? null,
  };
}

/** What the upstream's own currency code implies our unit should start with. */
export const unitPrefixFor = (currency) => CURRENCY_UNIT[currency] ?? currency ?? null;
