// Header-driven table reading over a coordinate grid.
//
// Columns are located by matching the HEADER TEXT, never by fixed index.
// Statement layouts shift between report versions — a column is inserted, two
// are swapped, a label is reworded — and an index-based reader keeps producing
// numbers after such a change, just wrong ones. Matching on the header means a
// layout change shows up as "column not found", which is a visible failure.
//
// A table that cannot be located returns null. A column that cannot be matched
// is absent from the map, and the caller reports the field as unavailable
// rather than reading whatever happens to sit at that x.
import { rowText, regrid } from "./layout.mjs";
import { parseNumInfo } from "./parseNum.mjs";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

/** Do this row's item texts look like the header of the table we want? */
function headerScore(row, fieldAliases) {
  const fields = Object.keys(fieldAliases);
  const hit = new Set();
  for (const it of row.items ?? []) {
    const t = norm(it.text);
    if (!t) continue;
    for (const field of fields) {
      if (hit.has(field)) continue;
      if (fieldAliases[field].some((re) => re.test(t))) { hit.add(field); break; }
    }
  }
  return hit;
}

/**
 * Locate a table, then re-grid it against its OWN column geometry.
 *
 * Two things happen here, in this order, and the order is the point:
 *
 *   1. The header row is found by matching header TEXT against the alias sets —
 *      never by position, so a shifted or reordered layout fails loudly instead
 *      of quietly reading the wrong column.
 *   2. The table's extent is bounded (header → terminator), and columns are
 *      re-inferred over THAT REGION alone. Page-wide inference is wrong for a
 *      table: a full-width title or address block bridges the blank corridor
 *      between two columns and collapses them into one.
 *
 * @returns {{ headerIndex:number, endIndex:number, columns:Record<string,number>,
 *             missing:string[], headerText:string, grid:object, stitches:Array }|null}
 */
export function findTable(pageGrid, fieldAliases, opts = {}) {
  const fields = Object.keys(fieldAliases);
  const minFields = opts.minFields ?? Math.min(3, fields.length);
  const stopRe = opts.stopRe ?? null;

  for (let i = opts.from ?? 0; i < pageGrid.rows.length; i++) {
    // Headers in these reports frequently WRAP onto two lines — "Market" above
    // "Price", "%" above "Assets" — so a one-row scan misses the table or maps
    // only half its columns. Try a single-row header first, then a two-row one.
    const spans = [1, 2];
    for (const headerRows of spans) {
      if (i + headerRows > pageGrid.rows.length) continue;
      const headerSlice = pageGrid.rows.slice(i, i + headerRows);
      const combinedItems = headerSlice.flatMap((r) => r.items ?? []);
      if (headerScore({ items: combinedItems }, fieldAliases).size < minFields) continue;

      // Bound the table before measuring its columns.
      let end = pageGrid.rows.length;
      for (let j = i + headerRows; j < pageGrid.rows.length; j++) {
        const joined = rowText(pageGrid.rows[j]).join(" ");
        if (stopRe && stopRe.test(joined)) { end = j; break; }
      }
      const slice = pageGrid.rows.slice(i, end);
      const grid = regrid(slice, opts);
      if (grid.rows.length <= headerRows - 1) continue;

      // Map fields using the combined text of every header line, per column.
      const headerText = new Map();
      for (const hr of grid.rows.slice(0, headerRows)) {
        for (const cell of hr.cells) {
          headerText.set(cell.column, `${headerText.get(cell.column) ?? ""} ${cell.text}`.trim());
        }
      }
      const columns = {};
      for (const [column, text] of [...headerText.entries()].sort((a, b) => a[0] - b[0])) {
        const t = norm(text);
        if (!t) continue;
        for (const field of fields) {
          if (field in columns) continue;
          if (fieldAliases[field].some((re) => re.test(t))) { columns[field] = column; break; }
        }
      }
      if (Object.keys(columns).length < minFields) continue;

      return {
        headerIndex: i,
        headerRows,
        endIndex: end,
        columns,
        missing: fields.filter((f) => !(f in columns)),
        headerText: [...headerText.values()].join(" | "),
        grid,
        stitches: grid.stitches,
      };
    }
  }
  return null;
}

/**
 * Read the data rows of a located table.
 *
 * Reads from the table's own re-gridded region, so cells line up with the
 * columns that were measured for this table rather than for the page.
 *
 * @returns {{ rows: Array<{ y:number, fields:Record<string,string>, cells:string[] }>,
 *             stoppedAt: number, terminator: string|null }}
 */
export function readRows(pageGrid, table, opts = {}) {
  const { stopRe = null, maxRows = 5000, requireField = null } = opts;
  const out = [];
  let terminator = null;
  const rows = table.grid.rows;

  // Skip every header line, not just the first — a wrapped header occupies two.
  for (let i = table.headerRows ?? 1; i < rows.length && out.length < maxRows; i++) {
    const row = rows[i];
    const joined = rowText(row).join(" ");
    if (stopRe && stopRe.test(joined)) { terminator = joined; break; }
    if (!row.cells.length) continue;

    const fields = {};
    for (const [field, col] of Object.entries(table.columns)) {
      const cell = row.cells.find((c) => c.column === col);
      if (cell) fields[field] = cell.text;
    }
    // A row that carries nothing in the field the caller says identifies a
    // record (usually the security name) is layout noise, not data.
    if (requireField && !String(fields[requireField] ?? "").trim()) continue;
    out.push({ y: row.y, fields, cells: rowText(row) });
  }
  return { rows: out, stoppedAt: table.endIndex, terminator };
}

/**
 * Find a labelled figure in free-form report text — "Total Cost 175,196,522.44".
 *
 * Scans rows for a label, then takes the first parseable number to its right
 * ON THE SAME ROW. Returns null when the label is absent or nothing to its
 * right parses; it never falls back to a number from a different row, which is
 * how a total gets attributed to the wrong label.
 *
 * @returns {{ value:number, label:string, y:number, raw:string }|null}
 */
export function findLabelledNumber(pageGrid, labelRe, opts = {}) {
  const { occurrence = 1 } = opts;
  let seen = 0;
  for (const row of pageGrid.rows) {
    const idx = row.cells.findIndex((c) => labelRe.test(norm(c.text)));
    if (idx < 0) continue;
    // The label may itself be a cell that also carries the value ("Total: 1,234").
    const inline = parseNumInfo(String(row.cells[idx].text).replace(labelRe, "").replace(/[:\s]/g, ""));
    const candidates = inline.status === "ok"
      ? [{ info: inline, raw: row.cells[idx].text }]
      : row.cells.slice(idx + 1).map((c) => ({ info: parseNumInfo(c.text), raw: c.text }));
    const hit = candidates.find((c) => c.info.status === "ok");
    if (!hit) continue;
    if (++seen < occurrence) continue;
    return { value: hit.info.value, label: row.cells[idx].text, y: row.y, raw: hit.raw };
  }
  return null;
}

/** Every row whose joined text matches — for locating sections within a bundle. */
export function rowsMatching(pageGrid, re) {
  return pageGrid.rows
    .map((r, i) => ({ i, text: rowText(r).join(" ") }))
    .filter((r) => re.test(r.text));
}

/** Convert located rows into `{ name, rows: [[cell,...],...] }` for the audit archive. */
export function toAuditSheet(name, header, rows) {
  return { name, rows: [header, ...rows.map((r) => r.cells)] };
}
