import { normalizeActionFeed, RESEARCH_ACTIONS_URL } from "../../shared/corporateActions.mjs";

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
  const cache = caches.default;
  const saved = await cache.match(key);
  let feed = saved ? await saved.json() : null;
  let retained = false;
  const fetched = Number(saved?.headers.get("x-fetched-at") || 0);
  if (!feed || Date.now() - fetched > 15 * 60_000) {
    try {
      const response = await fetch(RESEARCH_ACTIONS_URL, { signal: AbortSignal.timeout(20_000), redirect: "error" });
      if (!response.ok) throw new Error(`Research HTTP ${response.status}`);
      const next = normalizeActionFeed(await readBoundedJson(response));
      if (Date.parse(next.capturedAt) > Date.now() + 5 * 60_000) throw new Error("Future capture");
      if (feed && (next.capturedAt < feed.capturedAt || next.rows.length < feed.rows.length * 0.75)) throw new Error("Regressed capture");
      feed = next;
      context.waitUntil(cache.put(key, new Response(JSON.stringify(feed), { headers: {
        "Content-Type": "application/json", "Cache-Control": "public, max-age=604800", "x-fetched-at": String(Date.now()),
      } })));
    } catch {
      if (!feed) return json({ ok: false, reason: "Research feed unavailable; use the dated saved capture" }, 503);
      retained = true;
    }
  }
  const wanted = new Set(symbols);
  const identities = new Set(isins);
  return json({ ok: true, retained, feed: { ...feed, symbols, isins, rows: feed.rows.filter((r) => wanted.has(r.ticker) || identities.has(r.isin)) } });
}
