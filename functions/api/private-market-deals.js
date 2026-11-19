// Cloudflare Pages Function — THE PRIVATE-MARKET DEAL UNIVERSE (client #441–#448).
//
//   Gaurav, 12 Nov 2026: *"tracking investment activity: other companies which
//   are getting funding … based on that we go through those businesses … Either
//   we put them under watch list or … reach out to the founders."*
//
// A thin, keyless proxy of Glow Central Research's Inc42 "Funding Galore" feed —
// the WHOLE market of Indian startup funding rounds (~3,000+), not only the
// family's own holdings (those are matched into `privateMarketNews.json` at build
// time; this is the universe to shortlist FROM). The dashboard bundle stays lean
// — the feed is fetched live and edge-cached — and the family's statements are
// never touched: this is public reporting only.
//
// EVERY ROW IS INC42'S OWN, TRIMMED, NEVER INVENTED. The source carries funding
// ROUNDS only (no M&A), and no founder contacts — the page says so rather than
// fabricating either. The amount is parsed to {value, currency} for the client's
// sort; a cell the source leaves blank ("–"/"_") stays null, never zero.
const FEED = "https://glow-central-research.tech-441.workers.dev/data/private-market-news.json";
const CACHE_TTL_S = 3600; // the upstream refreshes twice daily; an hour at the edge is plenty
const TIMEOUT_MS = 12000;

function json(obj, cacheControl) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": cacheControl || "no-store" },
  });
}

/** "$41.8 Mn", "₹12 Cr", "Rs 5 Lakh" → { value, currency } in the row's own currency; null when undisclosed. */
function parseAmount(text) {
  if (typeof text !== "string") return null;
  const s = text.replace(/\*+\s*$/, "").trim();
  const m = s.match(/(US\$|\$|₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)\s*(k|mn|m|million|bn|b|billion|cr|crore|lakhs?|lacs?|l)?/i);
  if (!m) return null;
  const currency = /₹|Rs|INR/i.test(m[1]) ? "INR" : "USD";
  let value = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = (m[3] || "").toLowerCase();
  const mult = unit.startsWith("b") ? 1e9 : unit === "m" || unit.startsWith("mn") || unit === "million" ? 1e6
    : unit.startsWith("cr") ? 1e7 : unit.startsWith("l") ? 1e5 : unit === "k" ? 1e3 : 1;
  return { value: value * mult, currency };
}

/** The funding type, cleaned to a canonical stage + a coarse group the funnel filters on. */
function normStage(round) {
  const raw = typeof round === "string" ? round.replace(/[*_–—-]+\s*$/, "").replace(/\s+/g, " ").trim() : "";
  if (!raw || raw === "–" || raw === "_" || raw === "-") return { stage: null, group: "Other" };
  const t = raw.toLowerCase();
  if (/debt|venture debt|ncd/.test(t)) return { stage: raw, group: "Debt" };
  if (/pre[-\s]?seed/.test(t)) return { stage: "Pre-Seed", group: "Pre-Seed" };
  if (/\bseed\b/.test(t)) return { stage: "Seed", group: "Seed" };
  const grp = (L) => "ABC".includes(L) ? `Series ${L}` : "Series D+";
  const pre = t.match(/pre[-\s]?series\s*([a-h])/);
  if (pre) return { stage: `Pre-Series ${pre[1].toUpperCase()}`, group: grp(pre[1].toUpperCase()) };
  const sr = t.match(/series\s*([a-h])/);
  if (sr) { const L = sr[1].toUpperCase(); return { stage: `Series ${L}`, group: grp(L) }; }
  if (/bridge/.test(t)) return { stage: raw, group: "Other" };
  return { stage: raw, group: "Other" };
}

/** Split Inc42's investor string into names; "–"/"_"/blank → []. */
function splitInvestors(s) {
  if (typeof s !== "string") return [];
  const t = s.trim();
  if (!t || /^[–_\-]+$/.test(t)) return [];
  return t.split(/\s*,\s*|\s*;\s*|\s+&\s+(?=[A-Z])/).map((x) => x.trim()).filter((x) => x && !/^[–_\-]+$/.test(x));
}

export async function onRequest(context) {
  const cache = caches.default;
  const key = new Request(`${new URL(context.request.url).origin}/__cache/private-market-deals/v1`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let feed = null;
  try {
    const r = await fetch(FEED, { headers: { accept: "application/json", "user-agent": "GlowVenturesDealFlow/1.0 (+https://github.com/techmuns/GlowVentures)" }, signal: controller.signal });
    if (r.ok) feed = await r.json();
  } catch { feed = null; }
  finally { clearTimeout(timer); }

  const src = feed && Array.isArray(feed.deals) ? feed.deals : null;
  if (!src) return json({ ok: false, reason: "upstream_error" });

  const deals = src.map((d) => {
    const { stage, group } = normStage(d.round);
    return {
      id: d.id,
      company: typeof d.name === "string" && d.name ? d.name : d.company,
      slug: d.company,
      date: d.dateISO || null,
      sector: d.sector || null,
      subsector: d.subsector || null,
      businessModel: d.businessModel || null,
      amountText: typeof d.amount === "string" ? d.amount.replace(/\*+\s*$/, "").trim() : null,
      amount: parseAmount(d.amount),
      stage, stageGroup: group,
      investors: splitInvestors(d.investors),
      leadInvestor: typeof d.leadInvestor === "string" && d.leadInvestor && !/^[–_\-]+$/.test(d.leadInvestor) ? d.leadInvestor.trim() : null,
      sourceUrl: d.sourceUrl || null,
      sourceTitle: d.sourceTitle || null,
    };
  }).filter((d) => d.company && d.date);

  const dates = deals.map((d) => d.date).sort();
  const resp = json({
    ok: true,
    deals,
    count: deals.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    asOf: feed.generatedAt || feed.sourceCheckedAt || null,
    source: "Inc42 Funding Galore, via Glow Central Research",
  }, `public, max-age=${CACHE_TTL_S}`);
  await cache.put(key, resp.clone());
  return resp;
}
