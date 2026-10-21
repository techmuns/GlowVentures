// Cloudflare Pages Function — the INTRADAY half of the Polycab page.
//
// TWO LAYERS, AND WHY BOTH.
//
// `src/data/polycabLive.ts` is committed every morning by
// `.github/workflows/polycab.yml`: the corporate-action record, the promoter
// holding and pledge, and the last settled close. It renders with NO NETWORK AT
// ALL, which is what keeps the page free of blank tiles in a preview, in the
// headless sweep, and on a morning when an upstream is down.
//
// This function is the other half: the price WHILE THE MARKET IS OPEN. The
// stored close is a fact about yesterday; a reader looking at a ₹12,000 Cr
// promoter block during a session wants today's. `IndexStrip` already draws
// exactly this distinction — `public/series/` holds the settled history and
// `/api/indices` is polled for the live level — and this is that pattern applied
// to one scrip.
//
// IT NEEDS NO TOKEN. BSE's own endpoints are keyless, which is the whole reason
// the Polycab page can be live at all: the quote feed behind the rest of this
// dashboard is keyed on an NSE symbol and MUNS_TOKEN, and the ring-fence means
// `PortfolioContext` never asks it for this holding.
//
// THE PARSING IS NOT REPEATED HERE. `shared/polycabSources.mjs` is imported by
// this function AND by the daily builder, so the live figure and the committed
// one cannot disagree about what a day change is — the seam
// `shared/seriesReturns.mjs` already holds between the harvester and
// `/api/prices`.
//
// THE IDENTITY GATE IS NOT OPTIONAL HERE EITHER. A wrong scrip code returns a
// complete, correct, well-formed quote for another company, and a price is the
// one figure on this page a reader would act on fastest. The ISIN the exchange
// echoes must equal the one the CALLER passes, which the page takes from
// `BOOK_POLYCAB` — so the browser cannot widen what this endpoint will confirm,
// and a mismatch returns no price at all rather than a price with a warning.
import {
  BSE_API, BSE_SCRIP, BROWSER_HEADERS, parseQuote, parseIdentity,
} from "../../shared/polycabSources.mjs";

const TIMEOUT_MS = 12000;
// A quote is only worth caching for as long as it is still the same quote. Half
// a minute keeps a poll cheap at the edge without ever pinning a stale price
// across a meaningful move.
const CACHE_TTL_S = 30;

const json = (obj, ttl) =>
  new Response(JSON.stringify(obj), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": ttl ? `public, max-age=${ttl}` : "no-store",
    },
  });

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: BROWSER_HEADERS, signal: ctl.signal, redirect: "manual" });
    // BSE answers a rejected request with a 302 to an HTML error page. Followed,
    // that parses as neither JSON nor a failure; refused, it is visible.
    if (r.status >= 300 && r.status < 400) throw new Error(`upstream refused the request (HTTP ${r.status})`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  // The ISIN the BOOK carries, passed by the page. Absent, nothing is served:
  // this endpoint exists to CONFIRM an identity, and with nothing to confirm
  // against it would be a bare proxy for whatever scrip code it was handed.
  const expect = (url.searchParams.get("isin") || "").trim().toUpperCase();
  if (!/^IN[EF][0-9A-Z]{9}$/.test(expect)) {
    return json({ ok: false, reason: "NO_ISIN", detail: "the caller must state the ISIN the book carries, so the exchange's answer can be checked against it" });
  }

  try {
    const identity = parseIdentity(await get(`${BSE_API}/ComHeadernew/w?quotetype=EQ&scripcode=${BSE_SCRIP}&seriesid=`));
    if (!identity) {
      return json({ ok: false, reason: "NO_IDENTITY", detail: "the exchange returned no well-formed ISIN for this scrip" });
    }
    if (identity.isin !== expect) {
      // Never a price with a caveat. A caveat on a figure about the wrong
      // company is still a figure about the wrong company.
      return json({
        ok: false, reason: "IDENTITY_MISMATCH",
        detail: `the exchange returns ${identity.isin} for scrip ${BSE_SCRIP}; the book carries ${expect}`,
      });
    }

    const quote = parseQuote(await get(`${BSE_API}/getScripHeaderData/w?Debtflag=&scripcode=${BSE_SCRIP}&seriesid=`));
    if (!quote) return json({ ok: false, reason: "NO_QUOTE", detail: "the exchange returned no last-traded price" });

    return json({ ok: true, identity, quote, retrievedAt: new Date().toISOString() }, CACHE_TTL_S);
  } catch (e) {
    // The CAUSE picks the headline (`src/lib/upstreamStatus.ts`'s rule): this is
    // a fact about the EXCHANGE being unreachable, and the page must not render
    // it as a fact about the holding.
    return json({ ok: false, reason: "UPSTREAM_ERROR", detail: String(e?.message || e) });
  }
}
