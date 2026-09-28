import { normalizeActionFeed, validActionFeed, RESEARCH_ACTIONS_URL } from "../../shared/corporateActions.mjs";

// The identical public capture, on an independent transport. Pages cannot
// always reach the sister Worker; a source outage must not disable valuation.
const RESEARCH_MIRROR_URL = "https://raw.githubusercontent.com/techmuns/Glow-Central-Research/main/public/data/corporate-actions.json";

const LIMIT = 16 * 1024 * 1024;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

/** Bound the decoded body too: Content-Length alone does not bound gzip/chunked responses. */
export async function readBoundedJson(response) {
  if (!response.body || Number(response.headers.get("content-length")) > LIMIT) throw new Error("Capture too large");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw new Error("Capture too large"); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbols = [...new Set((url.searchParams.get("symbols") || "").split(",").filter(Boolean))];
  const isins = [...new Set((url.searchParams.get("isins") || "").split(",").filter(Boolean))];
  if (!symbols.length || symbols.length > 250 || symbols.some((s) => !/^[A-Z0-9&_.-]{1,30}$/.test(s))
    || isins.length > 250 || isins.some((s) => !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s))) {
    return json({ ok: false, reason: "Invalid symbol list" }, 400);
  }
  // Fetch the market-wide public capture. No holdings, cookies or credentials
  // are forwarded to Research; filtering happens here, behind our own gate.
  const key = new Request(`${url.origin}/__cache/corporate-actions/v1`);
  const errors = [];
  let cache, saved, feed = null;
  try {
    cache = caches.default;
    saved = await cache.match(key);
    const candidate = saved ? await saved.json() : null;
    if (validActionFeed(candidate)) feed = candidate;
  } catch { errors.push({ source: "cache", reason: "Saved capture could not be read" }); }
  const today = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
  let retained = !!feed && (!feed.verifiedThrough || feed.verifiedThrough < today);
  const fetched = Number(saved?.headers.get("x-fetched-at") || 0);
  if (!feed || retained || Date.now() - fetched > 15 * 60_000) {
    retained = true;
    for (const [source, address] of [["Research", RESEARCH_ACTIONS_URL], ["Research repository", RESEARCH_MIRROR_URL]]) {
      try {
        const response = await fetch(address, { signal: AbortSignal.timeout(12_000), redirect: "manual" });
        if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
        const next = normalizeActionFeed(await readBoundedJson(response));
        if (Date.parse(next.capturedAt) > Date.now() + 5 * 60_000) throw new Error("Future capture");
        if (feed && (Date.parse(next.capturedAt) < Date.parse(feed.capturedAt)
          || (feed.verifiedThrough && (!next.verifiedThrough || next.verifiedThrough < feed.verifiedThrough))
          || next.rows.length < feed.rows.length * 0.75)) throw new Error("Regressed capture");
        feed = next;
        retained = !next.verifiedThrough || next.verifiedThrough < today;
        // A reachable but out-of-date deployment should not mask a fresher
        // capture already committed by Research's existing refresh job.
        if (retained) continue;
        break;
      } catch (error) {
        errors.push({ source, reason: String(error?.message || "Capture unavailable").slice(0, 160) });
      }
    }
    if (!feed) return json({ ok: false, reason: "Research feed unavailable; use the dated saved capture", errors }, 503);
    // Write the winning capture once. Parallel writes for an old deployment
    // and a newer mirror could otherwise leave the old capture in the cache.
    // A cache failure must never discard a successfully fetched capture.
    if (!retained && cache) context.waitUntil(Promise.resolve().then(() => cache.put(key, new Response(JSON.stringify(feed), { headers: {
      "Content-Type": "application/json", "Cache-Control": "public, max-age=604800", "x-fetched-at": String(Date.now()),
    } }))).catch(() => {}));
  }
  const wanted = new Set(symbols);
  const identities = new Set(isins);
  return json({ ok: true, retained, errors, feed: { ...feed, symbols, isins, rows: feed.rows.filter((r) => wanted.has(r.ticker) || identities.has(r.isin)) } });
}
