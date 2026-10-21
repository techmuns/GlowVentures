// ADAPTER — FRED (Federal Reserve Bank of St. Louis), via the keyless CSV
// endpoint `fredgraph.csv`, which returns a series' FULL history.
//
// WHY THIS EXISTS NOW AND NOT BEFORE. Two series in the catalogue were declared
// absent with the reason "FRED is unreachable from the harvest environment".
// That was measured in a development container. The harvest does not run there
// — it runs on a GitHub Actions runner, on a completely different network — and
// measured from the runner, all three FRED endpoints answer in well under a
// second with valid CSV. The absence was real where it was taken and false
// where it mattered, which is the more dangerous of the two: a declared gap
// tells a reader to stop looking.
//
// `scripts/harvest/probe-reach.mjs` is what settled it, and it carries two
// known-good controls so that a degraded runner can never be mistaken for a
// dead source.
//
// NO API KEY. `fredgraph.csv?id=<SERIES>` is the same endpoint the public
// graph page uses and needs no registration, so nothing here goes near the
// secret store. The documented `api.stlouisfed.org` REST API does need a key
// and is not used.
//
// THESE ARE YIELDS AND SPREADS, NOT PRICES. Every series this adapter serves is
// already a percentage, so the catalogue declares `unit: "%"` and the harvester
// reports absolute percentage-point change rather than a CAGR — 0.52% → 4.28%
// is +376bp, not +723%.

const BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";

/**
 * @param spec catalogue entry with `source.seriesId` (e.g. "INDIRLTLT01STM")
 */
export async function fetchSeries(spec) {
  const { seriesId } = spec.source;
  // THE ENDPOINT RETURNS FULL HISTORY, AND ONE SERIES HERE IS SHORT ANYWAY.
  //
  // BAMLC0A0CM comes back as exactly three years, which looked like a default
  // window — the truncation failure this repo has hit before, where a response
  // is well-formed, plausible and silently short. It is not that: DGS10 from
  // the same endpoint returns 16,855 rows back to 1962, and no `cosd`/`coed`
  // parameter changes either result. The ICE BofA indices are LICENSED, and
  // FRED redistributes only a rolling recent window for that family.
  //
  // So the short series is a property of the source, not of this request, and
  // it is recorded in the catalogue note rather than papered over. `merge`
  // accumulates, so the store extends that window from here on; every horizon
  // longer than what is stored stays null until it can actually be reached.
  const url = `${BASE}?id=${encodeURIComponent(seriesId)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, accept: "text/csv" } });
  if (!r.ok) throw new Error(`FRED: HTTP ${r.status} for ${seriesId}`);
  const text = await r.text();

  // An unknown id returns an HTML error page with a 200, so the shape is
  // checked rather than the status — the same reason `probe-reach` prints a
  // body's first line instead of trusting the code.
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || /^\s*</.test(lines[0])) throw new Error(`FRED: non-CSV response for ${seriesId}`);

  // Header is `observation_date,<SERIES_ID>` on the current endpoint and
  // `DATE,<SERIES_ID>` on the older one. Matched by POSITION within a
  // two-column CSV rather than by either literal, so a rename of the date
  // column cannot silently shift the value column.
  const header = lines[0].split(",").map((h) => h.trim());
  if (header.length < 2) throw new Error(`FRED: expected two columns for ${seriesId}, got "${lines[0]}"`);

  const points = [];
  for (const line of lines.slice(1)) {
    const [rawDate, rawValue] = line.split(",");
    const t = String(rawDate ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
    const raw = String(rawValue ?? "").trim();
    // FRED writes "." for a period with NO OBSERVATION — a holiday, a
    // suspended series, a month before the series began. That is an absent
    // measurement and is skipped; coercing it to 0 would put a 0% yield into
    // the middle of a bond series and drag every average through it.
    if (!raw || raw === ".") continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    points.push({ t, v });
  }
  points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  if (!points.length) throw new Error(`FRED: no observations parsed for ${seriesId}`);

  return { points, upstreamCurrency: null, exchange: null, sourceUrl: url };
}

export const unitPrefixFor = () => null;
