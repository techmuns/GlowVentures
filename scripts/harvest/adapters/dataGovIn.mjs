// ADAPTER — data.gov.in (the Government of India Open Government Data platform).
//
// WHAT THIS CATALOGUE ACTUALLY HOLDS, because it decides what can be wired.
// A complete scan of the active catalogue (see `probe-datagov.mjs`) shows that
// nearly everything here is a SNAPSHOT: a parliamentary answer, a survey round,
// a table "up to December 2022" that will never gain another row. A resource
// whose ministry stopped publishing years ago still serves HTTP 200 with a full
// JSON envelope, so "the call worked" says nothing about whether the figure is
// current.
//
// A handful are different. They carry a moving window in the TITLE — "till last
// month" — and the ministry appends to them. Those are the only entries that can
// back a series, and they do not sort to the top by record date, which is how
// they get missed: ranking by "most recently uploaded" answers which
// parliamentary answer landed last, not which of these is alive.
//
// THE SHAPE IS A CROSSTAB, NOT A SERIES. These tables are one row per commodity
// or industry and one COLUMN PER MONTH — `INDX042012`, `INDX052012`, … or
// `_2012_apr`, `_2012_may`, …. So the series is read DOWN a row, not down a
// column, and a new month arrives as a new FIELD rather than a new record. Two
// consequences the code below depends on:
//
//   - Month columns are parsed from the field NAME by shape, not by position.
//     A positional read would keep working while returning a different month
//     the first time the ministry inserts a column, which is the same failure
//     `lib/table.mjs` avoids on the statement PDFs by matching header text.
//
//   - THE HEADLINE ROW IS NAMED, NEVER SUMMED. WPI's table has 869 commodity
//     rows and IIP's has 27 industry divisions; both already carry their own
//     aggregate row ("All Commodities", "General"), computed by the ministry
//     with the official weights. Re-deriving it by averaging the rows here
//     would produce a number nobody published and that no reader could tie to
//     the source. If the named row is absent the adapter FAILS with the labels
//     it did find, so a renamed row is a visible error rather than a silent
//     switch to a different series.
//
// THE KEY. `DATA_GOV_IN_KEY` comes from the environment — a GitHub Actions
// repository secret, never a tracked file — and is redacted from every error
// this module raises, because those errors reach the run log.

const BASE = "https://api.data.gov.in/resource";
const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";
const PAGE = 1000;

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const keyFromEnv = () => process.env.DATA_GOV_IN_KEY || "";
const redact = (s, key) => (key ? String(s).split(key).join("<API-KEY>") : String(s));

/**
 * A month column's field name → the first day of that month.
 *
 * Two shapes are recognised because the two live resources use different ones,
 * and both are ANCHORED so a field that merely contains a year cannot match.
 * Returns null for anything that is not a month column — a weight, a code, a
 * name — which is how the non-series fields are skipped without listing them.
 *
 *   INDX042012   → 2012-04-01   (WPI: INDX + MM + YYYY)
 *   _2012_apr    → 2012-04-01   (IIP: _ + YYYY + _ + mon)
 */
export function monthFromField(field) {
  const f = String(field || "").trim().toLowerCase();

  const wpi = /^indx(\d{2})(\d{4})$/.exec(f);
  if (wpi) {
    const m = Number(wpi[1]);
    if (m >= 1 && m <= 12) return `${wpi[2]}-${String(m).padStart(2, "0")}-01`;
    return null;
  }

  const iip = /^_?(\d{4})_([a-z]{3,4})$/.exec(f);
  if (iip) {
    const m = MONTHS[iip[2]];
    if (m) return `${iip[1]}-${String(m).padStart(2, "0")}-01`;
    return null;
  }

  return null;
}

/**
 * The published figure, or null.
 *
 * The API returns these as strings on some resources and numbers on others, and
 * writes "NA" / "-" / "" for a month with no observation. Those are ABSENT
 * measurements and are skipped — coercing "NA" to 0 would put a zero index into
 * the middle of a price series and drag every average and every return through
 * it, which is the exact failure the book's own rules exist to prevent.
 */
export function valueOf(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || /^(na|n\.a\.?|-{1,2}|\.|nil)$/i.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchPage(resource, offset, key) {
  const url = `${BASE}/${encodeURIComponent(resource)}?api-key=${key}&format=json&offset=${offset}&limit=${PAGE}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, accept: "application/json" } });
  const body = await r.text();
  if (!r.ok) throw new Error(`data.gov.in: HTTP ${r.status} for ${resource} — ${redact(body, key).slice(0, 200)}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`data.gov.in: non-JSON response for ${resource} — ${redact(body, key).slice(0, 200)}`);
  }
}

/**
 * @param spec catalogue entry with `source.resource` (the resource uuid),
 *   `source.rowField` (which column identifies a row) and `source.rowValue`
 *   (the headline row's label).
 */
export async function fetchSeries(spec) {
  const key = keyFromEnv();
  if (!key) throw new Error("data.gov.in: DATA_GOV_IN_KEY is not set — the series keeps its stored data rather than being emptied");

  const { resource, rowField, rowValue } = spec.source;
  const want = String(rowValue).trim().toLowerCase();

  let offset = 0;
  let row = null;
  const seenLabels = [];
  // Paged rather than taking one big limit: these tables run to 869 rows and a
  // server-side cap that silently truncated the page would drop the aggregate
  // row, which on this data would look like "the series does not exist".
  for (let page = 0; page < 20 && !row; page++) {
    const d = await fetchPage(resource, offset, key);
    const records = d?.records ?? [];
    if (!Array.isArray(records) || !records.length) break;
    for (const rec of records) {
      const label = String(rec?.[rowField] ?? "").trim();
      if (label) seenLabels.push(label);
      if (label.toLowerCase() === want) { row = rec; break; }
    }
    offset += records.length;
    if (records.length < PAGE) break;
  }

  if (!row) {
    // Naming what WAS found turns a renamed aggregate row into a one-line
    // diagnosis instead of an empty series nobody can explain.
    const sample = seenLabels.slice(0, 12).join(" · ");
    throw new Error(`data.gov.in: no row where ${rowField} = "${rowValue}" in ${resource}. Saw ${seenLabels.length} labels: ${sample}`);
  }

  const points = [];
  for (const [field, raw] of Object.entries(row)) {
    const t = monthFromField(field);
    if (!t) continue;
    const v = valueOf(raw);
    if (v === null) continue;
    points.push({ t, v });
  }
  points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  if (!points.length) {
    throw new Error(`data.gov.in: row "${rowValue}" in ${resource} carried no month columns — the table's shape changed`);
  }

  return {
    points,
    upstreamCurrency: null,
    exchange: null,
    // The KEY IS NOT IN THE RECORDED URL. `sourceUrl` is written into the
    // series meta and committed; the public resource page is the right
    // provenance link and carries no secret.
    sourceUrl: `https://www.data.gov.in/resource/${encodeURIComponent(resource)}`,
  };
}

export const unitPrefixFor = () => null;
