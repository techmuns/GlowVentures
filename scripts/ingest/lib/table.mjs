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

/** An alias regex, unanchored and global, for finding EVERY occurrence in a merged label. */
const unanchored = (re) => new RegExp(re.source.replace(/^\^/, ""), re.flags.replace("g", "") + "g");

/**
 * Normalise for matching while keeping a map back to the ORIGINAL offsets.
 *
 * Proportional character-to-x conversion is only valid against the string as
 * RENDERED. Collapsing runs of whitespace first would shift every index after
 * the first collapse and put a label in the wrong column — which matters
 * because Carnelian emits its entire nine-label header as a single text span.
 */
function normWithMap(raw) {
  const src = String(raw ?? "");
  let text = "";
  const map = [];
  let lastWasSpace = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i].toLowerCase();
    const keep = /[a-z0-9%]/.test(c);
    if (keep) { text += c; map.push(i); lastWasSpace = false; }
    else if (!lastWasSpace) { text += " "; map.push(i); lastWasSpace = true; }
  }
  return { text: text.trim(), map, srcLength: src.length, lead: text.length - text.trimStart().length };
}

/**
 * Map header labels onto the columns measured from the body.
 *
 * The hard case is a header item that covers SEVERAL data columns because the
 * report engine emitted the labels as one text span:
 *
 *     x=383.7 w=100.3  "Market Value Gain / Loss (+/-)"
 *
 * while the body underneath has a clean corridor between the Market Value column
 * (…428) and the Gain/Loss column (451…). Matching that item as a whole would
 * bind only one of the two fields and silently drop the other.
 *
 * So a merged label is split by locating each field's alias WITHIN the text and
 * converting the character offsets to x by proportion of the item's width — the
 * fonts here are near-monospace at these sizes, and the result only has to be
 * good enough to pick the nearest column, not to be exact.
 */
function mapHeaderToColumns(headerRows, columns, fieldAliases) {
  const fields = Object.keys(fieldAliases);
  const taken = new Set();
  const out = {};

  /** Best column for an x-range: most overlap, else nearest centre. */
  const columnFor = (x0, x1) => {
    let best = null, bestOverlap = 0;
    for (const c of columns) {
      const ov = Math.min(x1, c.x1) - Math.max(x0, c.x0);
      if (ov > bestOverlap) { bestOverlap = ov; best = c.index; }
    }
    if (best !== null) return best;
    let nearest = null, dist = Infinity;
    const mid = (x0 + x1) / 2;
    for (const c of columns) {
      const d = Math.abs(c.center - mid);
      if (d < dist) { dist = d; nearest = c.index; }
    }
    return nearest;
  };

  // Collect EVERY occurrence of every alias as a claim, then resolve. All
  // occurrences matter because a label can legitimately repeat: "Unit Cost Cost"
  // gives the loose `cost` alias two candidate positions, and only the second is
  // the Cost column.
  const claims = [];
  const claim = (field, x0, x1, index, combined) =>
    claims.push({ field, x0, x1, index, combined, anchored: index === 0 });

  const matchInto = (text, emit) => {
    const { text: t, map, lead } = normWithMap(text);
    if (!t) return;
    for (const field of fields) {
      let found = false;
      for (const re of fieldAliases[field]) {
        for (const m of t.matchAll(unanchored(re))) {
          emit(field, m, map, lead);
          found = true;
        }
        if (found) break;        // first alias that matched at all wins for this field
      }
    }
  };

  // (1) Per SPAN, with the matched text's offsets converted to x by proportion of
  // the span's width. This is what handles one span covering several columns.
  for (const row of headerRows) {
    for (const it of row.items ?? []) {
      const srcLen = it.text.length || 1;
      matchInto(it.text, (field, m, map, lead) => {
        const s0 = map[m.index + lead] ?? 0;
        const s1 = map[m.index + lead + m[0].length - 1] ?? srcLen - 1;
        claim(field, it.x + (s0 / srcLen) * it.width, it.x + ((s1 + 1) / srcLen) * it.width, m.index, false);
      });
    }
  }

  // (2) Per COLUMN, over the header lines joined top to bottom — the mirror case,
  // where one column's label is SPLIT ACROSS LINES. "Unit" above "Cost" is the
  // Unit Cost column, but neither line alone says so: "Unit" matches the units
  // alias and the bare "Cost" matches the Total Cost alias, so a span-only reader
  // binds the unit column to the wrong field and drops unitCost entirely.
  //
  // (2a) Per STACK — spans at about the same x on different header lines, joined
  // top to bottom. This is the same wrapped label case as (2), but keyed on the
  // label's own x rather than on a column, so it still works when the label
  // overhangs into the next column's territory: "Settlement" sits at x=214 and
  // runs to 256 where Security begins, and "Date" beneath it at 225. Neither
  // line matches an alias alone, and the pair is too wide to be assigned to a
  // column by midpoint — so without this pass the Settlement Date column binds
  // to nothing at all.
  const STACK_TOL = 14;
  const stacks = [];
  for (const row of headerRows) {
    for (const it of row.items ?? []) {
      const s = stacks.find((k) => Math.abs(k.x - it.x) <= STACK_TOL);
      if (s) { s.parts.push(it.text); s.x = Math.min(s.x, it.x); s.x1 = Math.max(s.x1, it.x + it.width); }
      else stacks.push({ x: it.x, x1: it.x + it.width, parts: [it.text] });
    }
  }
  for (const s of stacks) {
    if (s.parts.length < 2) continue;
    matchInto(s.parts.join(" "), (field, m) => claim(field, s.x, s.x1, m.index, true));
  }

  // A span belongs to the column its MIDPOINT sits nearest, and only if it
  // covers no other column's centre. Requiring it to fit inside the column's
  // bounds would be too strict: those bounds are measured from the BODY, so a
  // header label wider than its values ("Assets" over "4.75") overhangs and would
  // be dropped from its own column. Spanning several centres, on the other hand,
  // is the merged-label case that (1) already resolves properly.
  const centres = columns.map((c) => c.center);
  for (const col of columns) {
    const parts = [];
    for (const row of headerRows) {
      for (const it of row.items ?? []) {
        const mid = it.x + it.width / 2;
        const covered = centres.filter((c) => c >= it.x && c <= it.x + it.width);
        if (covered.length > 1) continue;
        let nearest = null, dist = Infinity;
        for (const c of columns) {
          const d = Math.abs(c.center - mid);
          if (d < dist) { dist = d; nearest = c; }
        }
        if (nearest === col) parts.push(it.text);
      }
    }
    if (parts.length < 2) continue;
    matchInto(parts.join(" "), (field, m) => claim(field, col.x0, col.x1, m.index, true));
  }

  // Anchored claims first, and among those the ones assembled from a whole
  // column's header — so "Unit Cost" beats the bare "Cost" sitting in it. Then
  // field order, so `unitCost` binds before the looser `cost` alias can take it,
  // then leftmost occurrence.
  claims.sort((a, b) => (b.anchored ? 1 : 0) - (a.anchored ? 1 : 0)
    || (b.combined ? 1 : 0) - (a.combined ? 1 : 0)
    || fields.indexOf(a.field) - fields.indexOf(b.field)
    || a.index - b.index);
  for (const c of claims) {
    if (c.field in out) continue;
    const col = columnFor(c.x0, c.x1);
    if (col === null || taken.has(col)) continue;
    out[c.field] = col;
    taken.add(col);
  }
  return out;
}

/**
 * Restrict a row slice to a horizontal band.
 *
 * For a table that shares its page with an unrelated one — the fact sheet is a
 * two-column magazine layout, a Sector Allocation table on the left and the
 * holdings table on the right — everything on the page lands in the same y rows.
 * Inferring columns over that mixture merges the two tables' geometry and reads
 * a security's name out of the other table's cells.
 *
 * The band is taken from the MATCHED HEADER LABELS, not from a hard-coded x, so
 * it stays header-driven like everything else here: a layout that moves the
 * table moves the band with it, and a layout that removes the header still fails
 * loudly rather than reading a fixed slice of the page.
 *
 * Membership is CONTAINMENT, not overlap. A cell of this table sits inside this
 * table's band; a span that runs past either edge belongs to the page rather
 * than the table. One overlap test would be enough to undo the whole thing — the
 * fact sheet's footer is a single 382pt address line that reaches into the band
 * and, admitted, drags the first column's left edge back across the gutter and
 * collapses the table to two columns.
 */
function bandRows(rows, x0, x1) {
  return rows
    .map((r) => ({ ...r, items: (r.items ?? []).filter((it) => it.x >= x0 && it.x + it.width <= x1) }))
    .filter((r) => r.items.length);
}

/**
 * Cut a column that carries TWO header labels into two columns.
 *
 * Returns the new column list, or null when nothing needed splitting. Only
 * labels that ANCHOR their span count — a label found mid-span belongs to a
 * merged header item, which mapHeaderToColumns already resolves by offset.
 */
function splitAtHeaderLabels(columns, headerRows, fieldAliases) {
  const sets = Object.values(fieldAliases);
  const matches = (t) => !!t && sets.some((set) => set.some((re) => re.test(t)));

  // Group the header items into STACKS: spans at about the same x on different
  // header lines are one label wrapped ("Settlement" over "Date", "Received"
  // over "Date"). Neither line alone matches an alias, so a per-span scan misses
  // exactly the columns that most need splitting — a Received Date column with
  // three values in thirty rows leaves no corridor of its own.
  const STACK_TOL = 14;
  const stacks = [];
  for (const row of headerRows) {
    for (const it of row.items ?? []) {
      const s = stacks.find((k) => Math.abs(k.x - it.x) <= STACK_TOL);
      if (s) { s.parts.push(it.text); s.x = Math.min(s.x, it.x); }
      else stacks.push({ x: it.x, parts: [it.text] });
    }
  }
  const labels = stacks
    .filter((s) => matches(norm(s.parts.join(" "))) || s.parts.some((p) => matches(norm(p))))
    .map((s) => s.x);
  if (labels.length < 2) return null;

  const out = [];
  let changed = false;
  for (const col of columns) {
    // Distinct label positions inside this column, left to right.
    const inside = [...new Set(labels.filter((x) => x >= col.x0 - 1 && x < col.x1))].sort((a, b) => a - b);
    if (inside.length < 2) { out.push({ x0: col.x0, x1: col.x1 }); continue; }
    changed = true;
    let x0 = col.x0;
    inside.slice(1).forEach((x) => { out.push({ x0, x1: x - 1 }); x0 = x - 1; });
    out.push({ x0, x1: col.x1 });
  }
  return changed ? out.map((c, i) => ({ index: i, x0: c.x0, x1: c.x1, center: (c.x0 + c.x1) / 2 })) : null;
}

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
/**
 * Does this row carry FIGURES — i.e. is it data rather than a wrapped label?
 *
 * True when any cell parses as a number. See the note in `findTable`: this is
 * what stops a header span from extending over the first data row.
 */
function isFiguresRow(row) {
  return rowText(row).some((t) => parseNumInfo(t).value !== null);
}

export function findTable(pageGrid, fieldAliases, opts = {}) {
  const fields = Object.keys(fieldAliases);
  const minFields = opts.minFields ?? Math.min(3, fields.length);
  const stopRe = opts.stopRe ?? null;

  for (let i = opts.from ?? 0; i < pageGrid.rows.length; i++) {
    // A header block's FIRST line must itself carry a column label. Without this
    // a decorative line above the table ("By Asset Class") gets absorbed as
    // header line 1, which pushes a real sub-header line down into the body —
    // and a sub-header span like "Accrued Income" then bridges two data columns
    // and merges them.
    if (!headerScore(pageGrid.rows[i], fieldAliases).size) continue;

    // Headers in these reports WRAP over up to three lines ("Market"/"Price",
    // and a lone "Accrued Income" beneath). Evaluate each span fully and keep
    // whichever maps the MOST columns, rather than taking the first that clears
    // the bar — a shorter header often "works" while silently losing a column.
    let best = null;
    for (const headerRows of [1, 2, 3]) {
      if (i + headerRows >= pageGrid.rows.length) continue;
      const headerSlice = pageGrid.rows.slice(i, i + headerRows);
      const combinedItems = headerSlice.flatMap((r) => r.items ?? []);
      if (headerScore({ items: combinedItems }, fieldAliases).size < minFields) continue;

      // Bound the table before measuring its columns.
      let end = pageGrid.rows.length;
      for (let j = i + headerRows; j < pageGrid.rows.length; j++) {
        const joined = rowText(pageGrid.rows[j]).join(" ");
        if (stopRe && stopRe.test(joined)) { end = j; break; }
      }
      let slice = pageGrid.rows.slice(i, end);
      let body = pageGrid.rows.slice(i + headerRows, end);

      // Optional: confine the table to the horizontal band its own header
      // occupies, for pages that carry two unrelated tables side by side.
      if (opts.bandToHeader) {
        const matched = combinedItems.filter((it) => {
          const t = norm(it.text);
          return t && Object.values(fieldAliases).some((set) => set.some((re) => re.test(t)));
        });
        if (matched.length < minFields) continue;
        const pad = opts.bandPad ?? 6;
        const x0 = Math.min(...matched.map((m) => m.x)) - pad;
        const x1 = Math.max(...matched.map((m) => m.x + m.width)) + pad;
        slice = bandRows(slice, x0, x1);
        body = bandRows(body, x0, x1);
      }
      if (!body.length) continue;
      // Measure columns from the BODY only, and within the body only from rows
      // that carry SEVERAL items. See regrid's note: one wide span bridges the
      // corridors between columns and collapses them. A single-item row is never
      // a data row here — it is a section heading ("Listed Shares/Equity",
      // spanning 45→281 across three columns of the capital gain statement), a
      // wrapped security name, or a lone continuation figure. None of them
      // should get a vote on where the columns are; all of them still get READ,
      // because only the measurement is narrowed, not the table.
      const dataRows = body.filter((r) => (r.items ?? []).length > 1);
      const measureFrom = dataRows.length >= 2 ? dataRows : body;
      let grid = regrid(slice, { ...opts, measureFrom });
      // The HEADER gets the casting vote on how many columns there are. Where
      // two of its labels land inside one inferred column, the body did not
      // separate them — a mostly-empty column leaves too few items to open a
      // corridor or to cluster an edge, as on the dividend statement where only
      // three of thirty rows carry a Received Date and the Security beside it
      // was swallowed whole. Splitting on the labels' own positions is the same
      // header-driven rule the rest of this module runs on.
      const split = splitAtHeaderLabels(grid.columns, slice.slice(0, headerRows), fieldAliases);
      if (split) grid = regrid(slice, { ...opts, measureFrom, columns: split });
      if (grid.rows.length <= headerRows - 1) continue;

      const columns = mapHeaderToColumns(slice.slice(0, headerRows), grid.columns, fieldAliases);
      const mapped = Object.keys(columns).length;
      if (mapped < minFields) continue;
      if (!best || mapped > best.mapped) {
        best = {
          mapped,
          headerIndex: i,
          headerRows,
          // WHERE THE BODY STARTS, WHICH IS NOT ALWAYS AFTER THE HEADER SPAN.
          //
          // A span that reaches over the first DATA row scores BETTER than the
          // right one: that row's cells sit squarely in their columns, so it
          // sharpens the geometry `splitAtHeaderLabels` measures and one more
          // label maps. Molecule's July dividend statement is where this first
          // bit — headerRows grew to 3, ate the Indian Metals row, and the
          // account's dividend read 10,201 against its own printed 21,451. It
          // was silently costing rows on statements already in the book:
          // Carnelian's Biocon dividend, 62,750, had never been read.
          //
          // Refusing the longer span is the wrong fix and was tried: it loses
          // the column the extra row was helping to place (Carnelian's `rate`
          // went unmapped, so every ratePerUnit on that statement went null).
          // The span is a MEASUREMENT and the header is a set of LABELS, and
          // only the second decides where data begins. So the geometry keeps
          // the full span and the body starts at the first line carrying
          // figures.
          //
          // "Carries figures" is exact rather than heuristic here: every real
          // wrapped label in this corpus — "Amount", "(M)", "Quantity (S)",
          // "Rate (P)", "Held", "Gain-LT" — parses as no number, and so does
          // the capital gain header's `31-Jan-18`, a DATE inside the "Price on
          // 31-Jan-18" label that a no-dates rule would have thrown away.
          bodyFrom: (() => {
            const k = headerSlice.findIndex(isFiguresRow);
            return k < 0 ? headerRows : k;
          })(),
          endIndex: end,
          columns,
          missing: fields.filter((f) => !(f in columns)),
          headerText: slice.slice(0, headerRows).map((r) => rowText(r).join(" | ")).join(" / "),
          grid,
          stitches: grid.stitches,
        };
      }
    }
    if (best) { delete best.mapped; return best; }
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
  // `bodyFrom` is where the DATA starts, which is earlier than the end of the
  // header span whenever that span reached over a data row to measure columns.
  // See the note on it in `findTable`.
  for (let i = table.bodyFrom ?? table.headerRows ?? 1; i < rows.length && out.length < maxRows; i++) {
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
    // A separate cell to the right is the value, when there is one. Only when
    // there is not does the label's OWN cell get read — some of these reports
    // print label and figure as a single span ("Capital In(+)/Out(-) -22,975.00").
    //
    // Right-cells first, and the inline figure taken from the END of the cell
    // rather than by stripping the label: the label matched the NORMALISED text
    // so it will not match the raw text it would have to be stripped from. This
    // order also keeps a date out of the answer — "Portfolio Value(10/07/2026)"
    // ends in 2026, and its real value sits in the next cell.
    const tail = /(\(?-?[\d,]+(?:\.\d+)?\)?%?)\s*$/.exec(String(row.cells[idx].text));
    const candidates = [
      ...row.cells.slice(idx + 1).map((c) => ({ info: parseNumInfo(c.text), raw: c.text })),
      ...(tail ? [{ info: parseNumInfo(tail[1]), raw: row.cells[idx].text }] : []),
    ];
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
