// Client-side chunked fan-out for the holdings feeds.
//
// Each proxy Function fetches a bounded number of tickers per invocation (to stay
// under Cloudflare's per-request subrequest limit). To cover EVERY holding we split
// them into small chunks and post the chunks with limited concurrency, then merge.
//
// Reliability: the upstream data APIs rate-limit under a big concurrent burst, so a
// chunk can come back with some tickers un-fetched. Each Function reports the tickers
// that hit a RETRYABLE error (rate-limit / 5xx / timeout) in `failed`; we re-sweep
// just those (with backoff) for a couple of rounds until every ticker is covered.
// Successful tickers are edge-cached for the day, so retries only re-hit failures.

const CHUNK = 12;        // tickers per Function invocation (well under the limit)
const CONCURRENCY = 3;   // chunks in flight at once — gentle enough to avoid rate limits
const MAX_ROUNDS = 5;    // initial sweep + up to 4 retry rounds of the failed tickers
                         // (upstream rate-limits under load, so stragglers need a few
                         //  gentle sweeps; successful tickers are edge-cached between them)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function chunksOf<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapLimit<A, B>(arr: A[], limit: number, fn: (a: A) => Promise<B>): Promise<B[]> {
  const out: B[] = new Array(arr.length);
  let i = 0;
  const worker = async () => { while (i < arr.length) { const idx = i++; out[idx] = await fn(arr[idx]); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, arr.length)) }, worker));
  return out;
}

async function postChunk(endpoint: string, chunk: unknown[], refresh: boolean): Promise<any> {
  try {
    const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ holdings: chunk, refresh }) });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return { ok: false, reason: r.status === 200 ? "auth" : "error" };
    return await r.json();
  } catch {
    return { ok: false, reason: "error" };
  }
}

export type FeedResult<T> = {
  ok: boolean;
  reason?: "not_configured" | "auth" | "error" | "upstream_error";
  status?: number;
  generatedAt?: string;
  count: number;
  searched: number;
  withData: number;
  items: T[];
};

export async function fetchFeedChunked<T>(
  endpoint: string,
  holdings: Array<{ key: string }>,
  refresh: boolean,
  opts: { itemsField: "articles" | "items"; dedupeKey: (t: T) => string; sortDesc: (t: T) => string; displayCap: number },
): Promise<FeedResult<T>> {
  if (!holdings.length) return { ok: true, generatedAt: new Date().toISOString(), count: 0, searched: 0, withData: 0, items: [] };

  // Correlated by securityKey. It used to be ISIN, which silently collapsed
  // once most of the book stopped carrying one: every ISIN-less holding shared
  // the empty-string key, so a single failure re-swept one arbitrary holding and
  // dropped the rest.
  const byKey = new Map(holdings.map((h) => [h.key, h]));
  const seen = new Set<string>();
  const items: T[] = [];
  let searched = 0, withData = 0, anyOk = false;
  let generatedAt: string | undefined;
  let notConfigured = false, auth = false;
  const statusTally: Record<string, number> = {};

  let pending: Array<{ key: string }> = holdings;
  for (let round = 0; round < MAX_ROUNDS && pending.length; round++) {
    const failedKeys = new Set<string>();
    const responses = await mapLimit(chunksOf(pending, CHUNK), CONCURRENCY, (chunk) => postChunk(endpoint, chunk, refresh));
    for (const res of responses) {
      if (res && res.ok) {
        anyOk = true;
        searched += res.symbolsSearched ?? res.holdingsSearched ?? 0;
        withData += res.symbolsWithData ?? res.holdingsWithData ?? 0;
        generatedAt = res.generatedAt ?? generatedAt;
        for (const it of (res[opts.itemsField] ?? []) as T[]) { const k = opts.dedupeKey(it); if (seen.has(k)) continue; seen.add(k); items.push(it); }
        for (const k of (res.failed ?? [])) failedKeys.add(k);
      } else if (res && res.reason === "not_configured") notConfigured = true;
      else if (res && res.reason === "auth") auth = true;
      else if (res && res.reason === "upstream_error") { const s = String(res.status ?? 0); statusTally[s] = (statusTally[s] || 0) + 1; }
      else { statusTally["0"] = (statusTally["0"] || 0) + 1; }
    }
    pending = [...failedKeys].map((k) => byKey.get(k)).filter((h): h is { key: string } => !!h);
    if (pending.length && round < MAX_ROUNDS - 1) await sleep(600 * (round + 1));
  }

  if (!anyOk) {
    if (notConfigured) return { ok: false, reason: "not_configured", count: 0, searched: 0, withData: 0, items: [] };
    if (auth) return { ok: false, reason: "auth", count: 0, searched: 0, withData: 0, items: [] };
    const top = Object.entries(statusTally).sort((a, b) => b[1] - a[1])[0];
    return { ok: false, reason: "upstream_error", status: top ? Number(top[0]) : 0, count: 0, searched: 0, withData: 0, items: [] };
  }

  items.sort((a, b) => opts.sortDesc(b).localeCompare(opts.sortDesc(a)));
  const capped = items.slice(0, opts.displayCap);
  return { ok: true, generatedAt: generatedAt ?? new Date().toISOString(), count: capped.length, searched, withData, items: capped };
}
