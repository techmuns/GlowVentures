// Display precision for the Data Audit grid.
//
// Excel stores full binary precision but shows each cell through its number
// format, so a rate held as 1687.79022064853 appears on screen as "1,687.79"
// and an amount as "75,95,056". Our extracted JSON keeps the stored value
// (verified cell-for-cell against every client workbook), so the grid has to
// re-apply the workbook's own formats or it shows far more decimals than the
// source ever displays.
//
// The precision therefore CANNOT be guessed from the column heading: the same
// heading is formatted differently in different workbooks — "Cl. Stk. Rate" is
// 2dp in the Q1 FY27 file but 0dp in FY21-22 / FY22-23 / FY23-24, and
// "Sales Amount" is 2dp only in FY22-23. So it is read per workbook, per sheet,
// per column straight out of the source files (openpyxl `number_format`,
// decimals taken from the positive section of each format) into
// public/audit/formats.json, which this module loads.

export type SheetFormats = Record<string, Record<string, (number | null)[]>>;

const BASE = import.meta.env.BASE_URL;
let cache: SheetFormats | null = null;
let inflight: Promise<SheetFormats> | null = null;

// Load (once) the per-column decimal places for every extracted sheet. Resolves
// to {} if the file is unavailable (e.g. behind the edge password gate) — the
// grid then falls back to natural rendering.
export function loadSheetFormats(): Promise<SheetFormats> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(`${BASE}audit/formats.json`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((j: SheetFormats) => { cache = j ?? {}; return cache; })
    .catch(() => { cache = {}; return cache; });
  return inflight;
}

// Decimal places for one column of one sheet, or null when the workbook leaves
// the column as General (render the number naturally).
export function columnDecimals(
  formats: SheetFormats | null, fileKey: string, sheetKey: string, col: number,
): number | null {
  const cols = formats?.[fileKey]?.[sheetKey];
  if (!cols || col >= cols.length) return null;
  const d = cols[col];
  return typeof d === "number" ? d : null;
}
