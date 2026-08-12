// ADAPTER — AMFI's monthly mutual-fund report, the Indian capital-market flows
// the spec asks for and nothing here could serve.
//
// ── WHY THIS NEEDED A NEW DEPENDENCY ────────────────────────────────────────
//
// AMFI publishes one workbook a month and keeps roughly a hundred of them
// online. They are legacy BIFF (`d0cf11e0a1b11ae1` — an OLE2 compound
// document), which neither ExcelJS nor this repo's own `sheet.mjs` opens:
// `sheet.mjs` was built for Office Open XML and for the HTML tables brokers
// misname `.xls`, and this is neither. `xlsx` (SheetJS) reads BIFF, so it is
// added for exactly this.
//
// ── HISTORY, NOT ACCUMULATION ───────────────────────────────────────────────
//
// The CEA and RBI adapters accumulate because their sources publish only a
// current value. AMFI does not: every past month is still on the site, so this
// backfills the whole archive on the first run and the merge keeps it. That is
// the difference between a series a reader can chart and one that says
// "building · 2".
//
// ── THE RULES THIS FOLLOWS, ALL OF THEM LEARNT HERE ─────────────────────────
//
// **The file list is DISCOVERED, never constructed.** A URL built from the
// current month (`am` + `jul` + `2026` + `repo.xls`) keeps returning 404 the
// month AMFI changes its naming, or silently fetches the wrong month if they
// shift a convention. The index page is read and its own links are followed —
// the same rule the Pink Sheet adapter follows for its release-hashed path.
//
// **The month comes from INSIDE the file.** Row 0 reads "Monthly Report for the
// month of July 2026". Trusting the FILENAME for the period is the mistake the
// ingest already made once, when a fact-sheet named `G100023_…` printed
// `Account: 100022` and got filed under the wrong client.
//
// **Headline rows are NAMED, never summed.** AMFI prints its own "Grand Total"
// and per-category sub-totals. Re-deriving them from the 80 scheme rows would
// produce a figure AMFI never published and would silently drift the moment a
// category is added. This is the WPI rule, applied to a different crosstab: a
// named row that goes missing FAILS with the labels it did find, so a rename is
// a one-line diagnosis instead of a silent switch to a different series.

import * as XLSX from "xlsx";

const INDEX = "https://www.amfiindia.com/research-information/amfi-monthly";
const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Last day of a month, so a monthly observation is dated at the period it describes. */
const monthEnd = (y, m) => {
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
};

/**
 * Every monthly workbook AMFI currently links, newest first.
 *
 * Deliberately not filtered by name shape beyond the `.xls` extension: the
 * point of reading the index is to take what AMFI actually publishes rather
 * than what we expect it to be called.
 */
async function listWorkbooks() {
  const r = await fetch(INDEX, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`AMFI index: HTTP ${r.status}`);
  const html = await r.text();
  const urls = [];
  const seen = new Set();
  for (const m of html.matchAll(/href="([^"]*\.xls)"/gi)) {
    const u = new URL(m[1], INDEX).toString();
    if (!seen.has(u)) { seen.add(u); urls.push(u); }
  }
  if (!urls.length) throw new Error("AMFI index: no .xls links found — the page layout has changed");
  return urls;
}

/**
 * The reporting month, read from the workbook's own title row.
 *
 * Returns null rather than guessing when the title does not name a month; the
 * caller then skips that file and says so, which is better than filing a
 * month's flows under the wrong date.
 */
export function monthFromTitle(text) {
  // AMFI WRITES THIS THREE DIFFERENT WAYS, and a stricter pattern silently
  // dropped whole months. Measured across the published archive:
  //   "Monthly Report for the month of July 2026"
  //   "Monthly Report for April 2026"
  //   "Monthly Report for March-2026"
  // The invariant is "for <month> <year>", optionally via "the month of", and
  // with either a space or a hyphen between the two.
  const m = /for\s+(?:the\s+month\s+of\s+)?([A-Za-z]+)[-,\s]+(\d{4})/i.exec(String(text ?? ""));
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  if (!mm) return null;
  return { year: Number(m[2]), month: mm, t: monthEnd(Number(m[2]), mm) };
}

/** Normalise a printed label for comparison: case, spacing, and AMFI's own footnote marks. */
const norm = (s) => String(s ?? "")
  .replace(/ /g, " ")
  .replace(/[*#]+/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

/**
 * The rows this adapter reads, each by the label AMFI prints.
 *
 * `match` is a predicate on the normalised label rather than an equality test
 * because AMFI writes its sub-totals with the constituent list appended —
 * "Sub Total - II (i+ii+iii+iv+v+vi+vii+viii+ix+x+xi)" — and that list changes
 * as categories are added. The ANCHOR is the sub-total number, which does not.
 */
const ROWS = {
  // "Grand Total" today; "Grand Total (A + B + C)" in the 2019-20 workbooks.
  // An exact-equality test silently cost eleven months on three series before
  // this was measured — anchored-prefix, like every other matcher here.
  "grand-total": (l) => /^grand total\b/.test(l),
  "equity": (l) => /^sub total - ii\b/.test(l),
  "debt": (l) => /^sub total - i\b(?!i)/.test(l),
  "hybrid": (l) => /^sub total - iii\b/.test(l),
  "gold-etf": (l) => l === "gold etf",
  "other-etf": (l) => l === "other etfs",
  "index-funds": (l) => l === "index funds",
};

/** Column positions are read from the HEADER TEXT, never assumed. */
const COLUMNS = {
  schemes: /^no\.? of schemes/i,
  folios: /^no\.? of folios/i,
  mobilised: /^funds mobilized/i,
  redemption: /^repurchase\/redemption/i,
  net: /^net inflow/i,
  // "Net Assets Under Management as on 31-Jul-2026" today; plain "AUM as on
  // 29-Feb-2020" in the older workbooks. Both name the same column, and the
  // stricter pattern silently stopped this series eleven months short.
  aum: /^(net assets under management|aum) as on/i,
  avgAum: /^average net assets under management/i,
};

function readWorkbook(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  // THE SHEET NAME CHANGES EVERY FEW MONTHS — measured across the archive it is
  // "MCR", "MCR Monthly Report", "MCR_MonthlyReport", "MCR_Report" and
  // "AMFI MONTHLY". Matching the literal "MCR" worked only because that sheet
  // happens to sort first today, which is luck rather than a rule, so the name
  // is matched by pattern and the first sheet is the last resort.
  // Older workbooks name the sheet after the month instead ("Dec 19 ",
  // "Feb 2020"), which no pattern should try to enumerate — the first sheet is
  // the data sheet in every issue measured, so it is the fallback.
  const name = wb.SheetNames.find((n) => /mcr|amfi\s*monthly/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`AMFI workbook: no readable sheet among ${JSON.stringify(wb.SheetNames)}`);
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const period = monthFromTitle(grid[0]?.[0]);
  if (!period) return { period: null, grid, cols: null };

  // Locate the header row by its own text, then map each column we need.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 8); i++) {
    if ((grid[i] ?? []).some((c) => COLUMNS.net.test(String(c ?? "")))) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error("AMFI workbook: no header row carrying a 'Net Inflow' column");

  const header = grid[headerIdx];
  const cols = {};
  for (const [key, re] of Object.entries(COLUMNS)) {
    const idx = header.findIndex((c) => re.test(String(c ?? "").replace(/\s+/g, " ").trim()));
    if (idx >= 0) cols[key] = idx;
  }
  return { period, grid, cols, headerIdx };
}

/** The value of one named row in one column, or null when either is absent. */
function valueOf(grid, headerIdx, matcher, col) {
  if (col == null) return null;
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    // The label sits in column 1 on the scheme rows and on the sub-totals.
    if (!matcher(norm(row[1]))) continue;
    const v = row[col];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return null;
}

/**
 * @param spec catalogue entry carrying `source.row` (a key of ROWS) and
 *   `source.column` (a key of COLUMNS).
 * @param opts `maxFiles` caps how many monthly workbooks are read in one run.
 */
export async function fetchSeries(spec, opts = {}) {
  const { row, column } = spec.source;
  const matcher = ROWS[row];
  if (!matcher) throw new Error(`AMFI: unknown row key ${row}`);
  if (!COLUMNS[column]) throw new Error(`AMFI: unknown column key ${column}`);

  const urls = await listWorkbooks();
  const max = Number(opts.maxFiles ?? spec.source.maxFiles ?? urls.length);
  const take = urls.slice(0, Math.max(1, max));

  const points = [];
  const skipped = [];
  let labelsSeen = [];
  for (const url of take) {
    let buf;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) { skipped.push(`${url} HTTP ${r.status}`); continue; }
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) { skipped.push(`${url} ${e.message}`); continue; }

    let parsed;
    try { parsed = readWorkbook(buf); }
    catch (e) { skipped.push(`${url} ${e.message}`); continue; }

    // A workbook whose title does not name its month is skipped rather than
    // dated from its filename — see the note at the top.
    if (!parsed.period) { skipped.push(`${url} no reporting month in the title row`); continue; }

    const v = valueOf(parsed.grid, parsed.headerIdx, matcher, parsed.cols[column]);
    if (v === null) {
      if (!labelsSeen.length) {
        labelsSeen = parsed.grid.slice(parsed.headerIdx + 1)
          .map((r) => String(r?.[1] ?? "").trim()).filter(Boolean).slice(0, 40);
      }
      skipped.push(`${url} no value for row=${row} column=${column}`);
      continue;
    }
    points.push({ t: parsed.period.t, v });
  }

  if (!points.length) {
    const detail = labelsSeen.length ? ` Labels found: ${labelsSeen.slice(0, 12).join(" | ")}` : "";
    throw new Error(`AMFI: no observations for row=${row} column=${column} across ${take.length} workbooks.${detail}`);
  }
  points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

  return {
    points,
    upstreamCurrency: "INR",
    exchange: null,
    sourceUrl: INDEX,
    note: skipped.length ? `${skipped.length} of ${take.length} workbooks contributed nothing` : null,
  };
}

export const unitPrefixFor = () => null;
