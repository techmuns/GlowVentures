// ADAPTER — the World Bank "Pink Sheet" (Commodity Markets Outlook), monthly
// prices back to January 1960.
//
// This is the source that closes the commodity gaps no free daily feed carries:
// thermal coal, LNG, iron ore, palm oil, rubber, and the LME metals (zinc,
// nickel, lead, tin) whose real-time prices are licensed. It also carries the
// fertiliser complex — urea, DAP, phosphate rock, potash — which the spec asks
// for under Industry Research.
//
// THE DOWNLOAD URL IS VERSIONED PER RELEASE AND MUST BE DISCOVERED.
// The file lives at a path containing a release hash and a date segment
// (…/74e8be41…-0050012026/related/CMO-Historical-Data-Monthly.xlsx). That path
// changes every month. Hardcoding the one that works today produces a harvester
// that silently fetches a stale file until someone notices the last data point
// stopped moving — so the adapter reads the landing page and takes the link the
// World Bank is currently publishing.
//
// COLUMNS ARE MATCHED BY HEADER TEXT, NEVER BY INDEX. The same rule the ingest
// pipeline's `lib/table.mjs` applies to statement PDFs, for the same reason: the
// Pink Sheet gains and drops columns between releases, and a positional read
// would keep working while returning a different commodity. A header that stops
// matching is a loud failure instead.

import ExcelJS from "exceljs";

const LANDING = "https://www.worldbank.org/en/research/commodity-markets";
const LINK_RE = /https:\/\/[^"' ]*CMO-Historical-Data-Monthly[^"' ]*\.xlsx/;
const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";
const SHEET = "Monthly Prices";
const HEADER_ROW = 5;   // commodity names
const UNIT_ROW = 6;     // "($/mt)", "($/mmbtu)", …
const FIRST_DATA_ROW = 7;

/**
 * The workbook is ~780 KB and all fifteen series come from it.
 *
 * The cache holds the PROMISE, not the result: the runner harvests several
 * series concurrently, and caching only the resolved value lets every one of
 * them see an empty cache and start its own download of the same file.
 */
let cached = null;

function loadWorkbook() {
  if (!cached) cached = loadWorkbookOnce().catch((e) => { cached = null; throw e; });
  return cached;
}

async function loadWorkbookOnce() {
  const page = await fetch(LANDING, { headers: { "User-Agent": UA } });
  if (!page.ok) throw new Error(`Pink Sheet landing page: HTTP ${page.status}`);
  const html = await page.text();
  const url = html.match(LINK_RE)?.[0];
  if (!url) throw new Error("Pink Sheet: no CMO-Historical-Data-Monthly.xlsx link on the landing page");

  const file = await fetch(url, { headers: { "User-Agent": UA } });
  if (!file.ok) throw new Error(`Pink Sheet download: HTTP ${file.status}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()));

  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`Pink Sheet: no "${SHEET}" worksheet (found: ${wb.worksheets.map((w) => w.name).join(", ")})`);

  // Header text → column index, normalised so the trailing footnote markers the
  // sheet uses ("Coal, South African **") do not have to be reproduced exactly.
  const norm = (s) => String(s ?? "").replace(/\*+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const names = ws.getRow(HEADER_ROW).values;
  const units = ws.getRow(UNIT_ROW).values;
  const byName = new Map();
  for (let c = 2; c <= ws.columnCount; c++) {
    const n = norm(names[c]);
    if (n) byName.set(n, { col: c, unit: String(units[c] ?? "").replace(/[()]/g, "").trim() });
  }
  return { ws, byName, url, norm };
}

/** "1960M01" → "1960-01-01". The Pink Sheet dates a month by its first day. */
function periodToDate(raw) {
  const m = String(raw ?? "").trim().match(/^(\d{4})M(\d{1,2})$/);
  if (!m) return null;
  const mm = String(Number(m[2])).padStart(2, "0");
  if (Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return `${m[1]}-${mm}-01`;
}

/**
 * @param spec catalogue entry whose `source.column` is the Pink Sheet header text
 */
export async function fetchSeries(spec) {
  const { ws, byName, url, norm } = await loadWorkbook();
  const key = norm(spec.source.column);
  const hit = byName.get(key);
  if (!hit) {
    // A renamed or dropped column is a loud failure, not a silent zero-length
    // series — the store then keeps its last good data and the report says why.
    throw new Error(`column "${spec.source.column}" not found in the Pink Sheet`);
  }

  const points = [];
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const t = periodToDate(row.getCell(1).value);
    if (!t) continue;
    const raw = row.getCell(hit.col).value;
    // The sheet writes "…" (a single ellipsis character) for a month it does not
    // report. That is NOT ZERO and must not become one — it is skipped, so the
    // series simply has no observation for that month.
    const v = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;
    points.push({ t, v });
  }
  points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

  return { points, upstreamCurrency: null, upstreamUnit: hit.unit, exchange: null, sourceUrl: url };
}

/** The Pink Sheet states its own units in row 6; nothing to translate. */
export const unitPrefixFor = () => null;
