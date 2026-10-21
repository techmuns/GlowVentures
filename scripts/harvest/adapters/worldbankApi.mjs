// ADAPTER — World Bank Open Data indicators (keyless REST), annual, with the
// full history the API holds rather than only the latest observation.
//
// The Economy page already showed four India indicators from this source through
// an edge function, but that call returns one value and its predecessor: enough
// for a tile, useless for the chart and the CAGR the spec asks for. Reading the
// same indicators into the series store instead gives 60+ years per series, so
// the same page can carry history, a chart and a returns table computed the same
// way as every other series in the system.
//
// THESE ARE RATES, NOT LEVELS. GDP growth, CPI inflation and unemployment are
// already percentages, so a "percentage return" on them is a category error in
// exactly the way it is for a bond yield: 6.5% → 7.2% is +70 basis points, not
// "+10.8%". Every series here is declared `unit: "%"`, which the harvester maps
// to `kind: "yield"` and reports as absolute percentage-point change.
//
// ANNUAL DATA IS LAGGED, and the page says so rather than implying it is current:
// the World Bank publishes a year's figure well into the following year, so
// `staleSince` and the observation date carry the truth.

const BASE = "https://api.worldbank.org/v2";
const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";

/**
 * @param spec catalogue entry with `source.country` (ISO code) and `source.indicator`
 */
export async function fetchSeries(spec) {
  const { country, indicator } = spec.source;
  // `per_page` large enough to take the whole series in one page — these run to
  // ~65 annual observations, and paging would risk a silent truncation.
  const url = `${BASE}/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=500`;
  const r = await fetch(url, { headers: { "User-Agent": UA, accept: "application/json" } });
  if (!r.ok) throw new Error(`World Bank API: HTTP ${r.status}`);
  const d = await r.json();

  // Shape is [meta, rows]; an unknown indicator returns a message object instead.
  if (!Array.isArray(d) || !Array.isArray(d[1])) {
    const msg = Array.isArray(d) && d[0]?.message?.[0]?.value;
    throw new Error(`World Bank API: ${msg || "unexpected response shape"}`);
  }

  const points = [];
  for (const row of d[1]) {
    // `value: null` means the indicator was not reported for that year. Skipped,
    // never coerced to zero — a year with no measurement is not a year of 0%.
    if (row?.value == null || !Number.isFinite(row.value)) continue;
    const year = String(row.date ?? "").trim();
    if (!/^\d{4}$/.test(year)) continue;
    // An annual observation is dated at the year end it describes.
    points.push({ t: `${year}-12-31`, v: row.value });
  }
  points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  if (!points.length) throw new Error(`World Bank API: no non-null observations for ${indicator} / ${country}`);

  return { points, upstreamCurrency: null, exchange: null, sourceUrl: url };
}

export const unitPrefixFor = () => null;
