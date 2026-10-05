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
  const { feed, retained, refreshing, errors } = await loadActionCapture(context);
  if (!feed) return json({ ok: false, reason: "Research feed unavailable; use the dated saved capture", errors }, 503);
  const wanted = new Set(symbols), identities = new Set(isins);
  return json({ ok: true, retained, refreshing, errors, feed: { ...feed, symbols, isins, rows: feed.rows.filter((r) => wanted.has(r.ticker) || identities.has(r.isin)) } });
}

/** Return local evidence immediately; external feeds refresh only in waitUntil. */
export async function loadActionCapture(context) {
  const origin = new URL(context.request.url).origin;
  // Reuse the existing validated capture on rollout. The payload is unchanged;
  // older entries merely lack the new refresh metadata and refresh once below.
  const key = new Request(`${origin}/__cache/corporate-actions/v1`);
  const now = Date.now();
  const today = new Date(now + 19_800_000).toISOString().slice(0, 10);
  const errors = [];
  let cache, saved, feed = null;
  try {
    cache = caches.default;
    saved = await cache.match(key);
    const candidate = saved ? await saved.json() : null;
    if (validActionFeed(candidate)) feed = candidate;
  } catch { errors.push({ source: "cache", reason: "Saved capture could not be read" }); }
  // The deployed asset is available even in a cold edge location. A new browser
  // never waits for Research or downloads the full market-wide source to filter it.
  if (!feed && context.env?.ASSETS) {
    try {
      const response = await context.env.ASSETS.fetch(new Request(`${origin}/data/corporate-actions.json`));
      if (response.ok) {
        const candidate = await readBoundedJson(response);
        if (validActionFeed(candidate)) feed = candidate;
      }
    } catch { errors.push({ source: "deployment", reason: "Saved capture could not be read" }); }
  }
  const dated = !feed?.verifiedThrough || feed.verifiedThrough < today;
  const checkedAt = Number(saved?.headers.get("x-checked-at") || 0);
  const failed = saved?.headers.get("x-refresh-failed") === "1";
  const refreshing = saved?.headers.get("x-refreshing") === "1" && now - checkedAt < 25_000;
  const due = !checkedAt || now - checkedAt >= (dated || failed ? 30_000 : 15 * 60_000);
  const persist = async (value, pending, failedRefresh = false) => {
    if (!cache) return;
    try { await cache.put(key, new Response(JSON.stringify(value), { headers: {
      "Content-Type": "application/json", "Cache-Control": "public, max-age=604800",
      "x-checked-at": String(Date.now()), "x-refreshing": pending ? "1" : "0", "x-refresh-failed": failedRefresh ? "1" : "0",
    } })); } catch { /* Never discard evidence because its cache write failed. */ }
  };
  const refresh = async () => {
    // Independent transports share one deadline rather than serial 12s waits.
    const responses = await Promise.all([
      ["Research", RESEARCH_ACTIONS_URL], ["Research repository", RESEARCH_MIRROR_URL],
    ].map(async ([source, address]) => {
      try {
        const response = await fetch(address, { signal: AbortSignal.timeout(12_000), redirect: "manual" });
        if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
        const next = normalizeActionFeed(await readBoundedJson(response));
        if (Date.parse(next.capturedAt) > Date.now() + 5 * 60_000) throw new Error("Future capture");
        if (feed && (Date.parse(next.capturedAt) < Date.parse(feed.capturedAt)
          || (feed.verifiedThrough && (!next.verifiedThrough || next.verifiedThrough < feed.verifiedThrough))
          || next.rows.length < feed.rows.length * 0.75)) throw new Error("Regressed capture");
        return next;
      } catch (error) {
        errors.push({ source, reason: String(error?.message || "Capture unavailable").slice(0, 160) });
        return null;
      }
    }));
    const candidates = responses.filter(Boolean).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
    // Choose once, never racing writes from an old deployment and a newer mirror.
    let next = feed;
    for (const candidate of candidates) {
      if (next && ((next.verifiedThrough && (!candidate.verifiedThrough || candidate.verifiedThrough < next.verifiedThrough))
        || candidate.rows.length < next.rows.length * 0.75)) continue;
      next = candidate;
    }
    if (next) await persist(next, false, !candidates.length);
    return { feed: next, retained: !candidates.length || !next?.verifiedThrough || next.verifiedThrough < today, refreshing: false, errors };
  };
  if (!feed) return refresh(); // Only when both edge cache and deployment asset are unavailable.
  if (due) {
    await persist(feed, true); // Back off other readers while this refresh runs.
    context.waitUntil(refresh().catch(() => {}));
  }
  return { feed, retained: dated || failed || due || refreshing, refreshing: due || refreshing, errors };
}
