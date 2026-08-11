// ADAPTER — the Central Electricity Authority's monthly Installed Capacity
// report: India's generating capacity by fuel, in MW.
//
// This is the FOOS spec's "industry structure" data — capacity, the half of
// Industry Research that has been declared absent since it was built because
// CEA publishes monthly behind a dynamic path rather than at a fixed URL.
//
// THE URL IS DISCOVERED, NOT HARDCODED, for exactly the reason the Pink Sheet's
// is: the workbook lives under `/uploads/installed/<YYYY>/<MM>/Website_<Month>.xlsx`
// and that path moves every month. A hardcoded path keeps returning 200 while
// serving a frozen file — the failure nobody notices until someone asks why a
// figure stopped moving. That failure has now been observed twice in this repo
// (the Pink Sheet, and data.gov.in's "till last month" resources whose record
// metadata moves while the data does not), so the date is taken from the PATH
// of the file actually being served and becomes the observation's own date.
//
// ROWS ARE MATCHED BY CATEGORY TEXT, NEVER BY ROW NUMBER. The sheet is 20 rows
// today and CEA adds fuels to it — "Waste to Energy" and "Small Hydro" are
// recent additions. A positional read would keep working while silently
// reporting a different fuel, the same class of failure `lib/table.mjs` avoids
// on the statement PDFs by matching header text.
//
// IT IS ACCUMULATING. Each monthly workbook is a SNAPSHOT of capacity at that
// month end, not a history, so one run contributes one observation and `merge`
// keeps every earlier one — the same pattern as the RBI policy rates and IEX
// spot power. The series is therefore built here a month at a time, the UI
// marks it "building · N", and every horizon stays absent until the store has
// held it long enough to answer one. That is the honest state, not a defect.

import ExcelJS from "exceljs";

const LANDING = "https://cea.nic.in/installed-capacity-report/?lang=en";
const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";
const SHEET = "Summary";

/**
 * The workbook CEA is currently publishing, and the month it describes.
 *
 * Cached per run: the harvester fetches several CEA series concurrently and
 * each would otherwise re-download the landing page and the workbook. The cache
 * holds the PROMISE rather than the result, so four concurrent callers share
 * one download instead of starting four — the same bug the Pink Sheet adapter
 * had and the same fix.
 */
let workbookPromise = null;

async function loadWorkbook() {
  const r = await fetch(LANDING, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`CEA: HTTP ${r.status} for the installed-capacity page`);
  const html = await r.text();

  // Anchored on the `installed/` upload directory so a link to some other CEA
  // spreadsheet elsewhere on the page cannot be picked up instead.
  const m = /https:\/\/cea\.nic\.in\/wp-content\/uploads\/installed\/(\d{4})\/(\d{2})\/[^"']+?\.xlsx/i.exec(html);
  if (!m) throw new Error("CEA: no installed-capacity .xlsx link on the landing page — the page layout changed");
  const [url, year, month] = m;

  const f = await fetch(url, { headers: { "User-Agent": UA } });
  if (!f.ok) throw new Error(`CEA: HTTP ${f.status} downloading ${url}`);
  const buf = Buffer.from(await f.arrayBuffer());
  // A month's report describes capacity AT that month, and the repo dates a
  // monthly observation by the month's first day (as the Pink Sheet does).
  const t = `${year}-${month}-01`;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`CEA: no "${SHEET}" worksheet (found: ${wb.worksheets.map((w) => w.name).join(", ")})`);

  // Flatten to { label -> MW }. The sheet is two label columns (category and
  // sub-category) then the MW figure; the TOTAL row carries its label in the
  // first column with the figure shifted left, so both shapes are read.
  const byLabel = new Map();
  ws.eachRow((row) => {
    const cells = [];
    row.eachCell({ includeEmpty: false }, (c) => cells.push(c.value));
    if (cells.length < 2) return;
    // Find the last numeric cell that is NOT the % share (a share is ≤ 1 here,
    // written as a fraction). Capacity in MW is always far larger.
    const nums = cells.map((c) => (typeof c === "number" ? c : Number(c))).map((n) => (Number.isFinite(n) ? n : null));
    const mwIdx = nums.findIndex((n) => n != null && n > 1);
    if (mwIdx < 0) return;
    const label = String(cells[mwIdx - 1] ?? cells[0] ?? "").trim();
    if (!label) return;
    byLabel.set(label.toLowerCase().replace(/\s+/g, " "), nums[mwIdx]);
  });

  if (!byLabel.size) throw new Error("CEA: the Summary sheet parsed to no rows — its shape changed");
  return { byLabel, t, url };
}

/**
 * @param spec catalogue entry with `source.row` — the sheet's own label for the
 *   fuel, matched case- and whitespace-insensitively.
 */
export async function fetchSeries(spec) {
  if (!workbookPromise) workbookPromise = loadWorkbook();
  const { byLabel, t, url } = await workbookPromise;

  const want = String(spec.source.row).toLowerCase().replace(/\s+/g, " ");
  const v = byLabel.get(want);
  if (v == null) {
    // Naming what WAS on the sheet turns a renamed fuel into a one-line
    // diagnosis rather than an empty series nobody can explain.
    const seen = [...byLabel.keys()].slice(0, 14).join(" · ");
    throw new Error(`CEA: no row labelled "${spec.source.row}" in the Summary sheet. Saw: ${seen}`);
  }

  return { points: [{ t, v }], upstreamCurrency: null, exchange: null, sourceUrl: url };
}

export const unitPrefixFor = () => null;
