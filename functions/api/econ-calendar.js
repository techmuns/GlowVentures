// Cloudflare Pages Function — the ECONOMIC RELEASE CALENDAR.
//
// ── WHY THIS EXISTS, AND WHAT IT REPLACES ───────────────────────────────────
//
// The Economy page carried an AbsentSection reading "No release calendar can be
// built from the sources wired here … a SCHEDULE of when each statistic is next
// published, and a CONSENSUS of what the street expects [are] licensed products
// sold by paid vendors." The first half was true and the second half was an
// absence recorded against an UNCHECKED premise — the third time this repo has
// made that mistake (FRED, declared unreachable from a dev container; RBI,
// declared geo-blocked from the same). An absence recorded against the wrong
// cause is worse than a gap: it tells a reader to stop looking for something
// that is available.
//
// ── WHAT WAS ACTUALLY MEASURED, 2026-08-13 ──────────────────────────────────
//
//   tradingeconomics.com/calendar   200, but its free API is DISCONTINUED —
//                                   `api.tradingeconomics.com?c=guest:guest`
//                                   answers HTTP 410 "the guest account has
//                                   been discontinued, please subscribe".
//   bloomberg.com/markets/…         403 on the page AND on its internal API.
//   moneycontrol.com/economic-…     page loads; no JSON endpoint behind it.
//   web.sensibull.com/…             a JS shell; no public calendar endpoint.
//   api.nasdaq.com/api/calendar/…   200 JSON, free, keyless — previous,
//                                   consensus and actual for 17 countries.
//   economic-calendar.tradingview   200 JSON, free, keyless, and RICHER on
//     .com/events                   every axis. This is what is wired.
//
// TradingView's is the one used because of what it carries that the others do
// not: an ISO-8601 UTC timestamp per event, an importance rank, the PERIOD the
// reading is for, numeric values with their unit, and — the reason it belongs
// in this codebase at all — `source` and `source_url` naming the agency that
// published each figure ("Ministry of Statistics and Programme Implementation",
// "Office of the Economic Advisor"). Every figure traces to a source, which is
// this book's whole claim.
//
// ── FOUR THINGS MEASURED THAT A NAIVE CLIENT WOULD GET WRONG ────────────────
//
// 1. THE ORIGIN AND REFERER HEADERS ARE MANDATORY. Without them the upstream
//    answers 403. That is why this is a server-side proxy and not a fetch from
//    the browser (which could not set them anyway).
//
// 2. THE RESPONSE IS CAPPED AT 2000 EVENTS AND THE CAP IS SILENT. A single
//    request for 2026-08-13 → 2026-09-13 returns exactly 2000 rows; the same
//    window fetched as four sub-windows returns 2180 distinct ids. A caller
//    that asks for a month in one call therefore loses 180 events and is told
//    nothing. So this function SPLITS every window into ≤7-day slices, merges
//    on the event id, and — where a slice still comes back at the cap — says so
//    in `truncated` rather than presenting a short answer as a complete one.
//
// 3. THE FORWARD HORIZON IS ABOUT A MONTH, and that is the upstream's, not a
//    limit of this code: 2026-08-13 → 2026-09-13 returns 2000 events, and every
//    window starting after ~2026-09-13 returns zero. History runs back to at
//    least 2015 with actuals. Reported as `horizon` so the page can say it.
//
// 4. `importance` IS -1 / 0 / 1, and the mapping was verified rather than
//    assumed. Over three weeks of US events, `1` is Non Farm Payrolls,
//    Unemployment Rate, Inflation Rate YoY, Core Inflation Rate and the ISM
//    PMIs; `-1` is bill auctions and PMI finals. So -1 = low, 0 = medium,
//    1 = high. Guessing this the other way round would have printed "High"
//    against a 3-month bill auction — a fabricated classification of exactly
//    the kind this book already caught once (`VAL_METHODS[i % 5]`).
//
// It needs no token, so it keeps working when the muns API is down — which it
// was on the day this was written.
import { bundleCache, ageS } from "../../shared/edgeBundleCache.js";

const UPSTREAM = "https://economic-calendar.tradingview.com/events";
/** Sent because the upstream 403s without them. */
const ORIGIN = "https://in.tradingview.com";

/** Measured: a single response is truncated at exactly this many rows. */
const UPSTREAM_ROW_CAP = 2000;
/** Slice width. Seven days keeps every slice well under the cap in practice. */
const SLICE_DAYS = 7;
/** A whole-window request is refused beyond this, so a caller cannot ask for
 *  2015→2026 and quietly receive 150 upstream calls. */
const MAX_SPAN_DAYS = 120;

const CACHE_TTL_S = 6 * 3600;   // hold for six hours…
const FRESH_S = 900;            // …but only serve without re-fetching for 15
                                // minutes: an `actual` lands the moment the
                                // agency publishes, and a stale actual read as
                                // current is the one figure here that matters.
const TIMEOUT_MS = 20000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const dayMs = 864e5;

/** Inclusive-start, exclusive-end slices of at most SLICE_DAYS. */
function slices(fromISO, toISO) {
  const out = [];
  let t = Date.parse(fromISO);
  const end = Date.parse(toISO);
  while (t < end) {
    const next = Math.min(t + SLICE_DAYS * dayMs, end);
    out.push([new Date(t).toISOString(), new Date(next).toISOString()]);
    t = next;
  }
  return out;
}

async function fetchSlice(from, to, countries, signal) {
  const u = new URL(UPSTREAM);
  u.searchParams.set("from", from);
  u.searchParams.set("to", to);
  if (countries) u.searchParams.set("countries", countries);
  const r = await fetch(u.toString(), {
    headers: { accept: "application/json", origin: ORIGIN, referer: `${ORIGIN}/`, "user-agent": "Mozilla/5.0" },
    signal,
  });
  if (!r.ok) return { ok: false, status: r.status };
  const d = await r.json().catch(() => null);
  if (!d || d.status !== "ok" || !Array.isArray(d.result)) return { ok: false, status: r.status, shape: true };
  return { ok: true, rows: d.result };
}

/**
 * Only the fields this dashboard renders, normalised.
 *
 * `actual`, `forecast` and `previous` stay NULL when the upstream has none —
 * never 0. A not-yet-published reading and a reading of zero are different
 * facts, and on a release calendar the first is most of the table.
 */
function shape(e) {
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id: String(e.id ?? ""),
    date: typeof e.date === "string" ? e.date : null,
    country: typeof e.country === "string" ? e.country : null,
    title: typeof e.title === "string" ? e.title : "",
    indicator: typeof e.indicator === "string" ? e.indicator : null,
    category: typeof e.category === "string" ? e.category : null,
    period: typeof e.period === "string" ? e.period : null,
    referenceDate: typeof e.referenceDate === "string" ? e.referenceDate : null,
    // -1 low / 0 medium / 1 high. Passed through as the upstream's own number;
    // the label is applied once, on the client, from a mapping that was
    // verified against known-high events rather than assumed.
    importance: num(e.importance),
    actual: num(e.actual),
    forecast: num(e.forecast),
    previous: num(e.previous),
    unit: typeof e.unit === "string" ? e.unit : null,
    currency: typeof e.currency === "string" ? e.currency : null,
    // The agency that published it, and where. This is why this source was
    // chosen over the others that answered.
    source: typeof e.source === "string" ? e.source : null,
    sourceUrl: typeof e.source_url === "string" ? e.source_url : null,
    comment: typeof e.comment === "string" ? e.comment : null,
  };
}

export async function onRequest(context) {
  const { request } = context;
  const started = Date.now();
  const u = new URL(request.url);

  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  // Comma-separated ISO-3166 alpha-2, e.g. "IN,US". Empty = every country the
  // upstream carries (136 of them).
  const countries = (u.searchParams.get("countries") ?? "").replace(/[^A-Za-z,]/g, "").toUpperCase() || "";

  if (!isDate(from) || !isDate(to)) {
    return json({ ok: false, failureCode: "BAD_RANGE", detail: "from and to must be YYYY-MM-DD" }, 400);
  }
  const spanDays = (Date.parse(to) - Date.parse(from)) / dayMs;
  if (spanDays <= 0) return json({ ok: false, failureCode: "BAD_RANGE", detail: "to must be after from" }, 400);
  if (spanDays > MAX_SPAN_DAYS) {
    return json({ ok: false, failureCode: "RANGE_TOO_WIDE", detail: `at most ${MAX_SPAN_DAYS} days per request` }, 400);
  }

  const key = `${from}..${to}|${countries || "ALL"}`;
  const cache = bundleCache("econ-calendar", { ttlS: CACHE_TTL_S, version: "v2", request });
  const bundle = await cache.read();
  const now = Date.now();
  if (ageS(bundle, key, now) < FRESH_S && bundle[key] && bundle[key].v) {
    return json({ ok: true, cached: true, stale: false, ...bundle[key].v, totalDurationMs: Date.now() - started });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const windows = slices(`${from}T00:00:00.000Z`, `${to}T00:00:00.000Z`);
    const results = await Promise.all(windows.map(([a, b]) => fetchSlice(a, b, countries, controller.signal).catch(() => ({ ok: false, status: null }))));

    const failed = results.filter((r) => !r.ok);
    if (failed.length === results.length) {
      // EVERY slice failed. Fall back to the last held copy rather than an
      // empty calendar — a release schedule does not change minute to minute,
      // and "yesterday's calendar because the feed is down" is a different and
      // far more useful statement than a blank panel. Same treatment, and same
      // reasoning, as the research endpoint's stale fallback.
      const held = bundle[key];
      if (held && held.v) {
        return json({
          ok: true, cached: true, stale: true,
          ageS: Math.round(ageS(bundle, key, now)),
          servedAt: new Date(held.at).toISOString(),
          upstreamFailure: { failureCode: "UPSTREAM_ERROR", upstreamStatus: failed[0].status ?? null },
          ...held.v, totalDurationMs: Date.now() - started,
        });
      }
      return json({
        ok: false, failureCode: failed[0].status ? "UPSTREAM_ERROR" : "UPSTREAM_NO_RESPONSE",
        upstreamStatus: failed[0].status ?? null, totalDurationMs: Date.now() - started,
      });
    }

    // MERGE ON THE EVENT ID. Adjacent slices share a boundary instant, so the
    // same event can arrive twice; an id-keyed map counts it once. This is the
    // same rule `datedRowsAcross` applies in the ingest — a repeat across two
    // requests is a duplicate, not data.
    const byId = new Map();
    let cappedSlices = 0;
    for (const r of results) {
      if (!r.ok) continue;
      if (r.rows.length >= UPSTREAM_ROW_CAP) cappedSlices += 1;
      for (const e of r.rows) {
        const s = shape(e);
        if (s.id && s.date) byId.set(s.id, s);
      }
    }
    const events = [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));

    const value = {
      from, to, countries: countries ? countries.split(",") : [],
      events,
      count: events.length,
      // NO SILENT CAPS. If any slice came back at the upstream's row limit the
      // answer is incomplete, and the page says so rather than showing a short
      // calendar that looks whole.
      truncated: cappedSlices > 0,
      truncatedSlices: cappedSlices,
      // A partial outage across slices is not a total one; report which.
      slices: results.length,
      slicesFailed: failed.length,
      source: "TradingView economic calendar",
      fetchedAt: new Date().toISOString(),
    };

    bundle[key] = { at: Date.now(), v: value };
    await cache.write(bundle);
    return json({ ok: true, cached: false, stale: false, ...value, totalDurationMs: Date.now() - started });
  } catch (e) {
    const held = bundle[key];
    if (held && held.v) {
      return json({
        ok: true, cached: true, stale: true,
        ageS: Math.round(ageS(bundle, key, now)),
        upstreamFailure: { failureCode: "NETWORK", detail: String((e && e.message) || e) },
        ...held.v, totalDurationMs: Date.now() - started,
      });
    }
    return json({ ok: false, failureCode: "NETWORK", detail: String((e && e.message) || e) });
  } finally {
    clearTimeout(timer);
  }
}
