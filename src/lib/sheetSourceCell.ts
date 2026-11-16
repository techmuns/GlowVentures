/**
 * ── THE CITED CELL IN A SPREADSHEET STATEMENT (Stage 10oo) ───────────────────
 *
 *   *"it should have opened the pdf right then why did it open this kind of
 *    table ?"* — the family, 16 Nov 2026, after clicking a holding's 1,77,000 on
 *    the Portfolio Monitor.
 *
 * The link was right: HDFC Securities sends its holdings as a CSV, so the
 * original file IS a table. What was missing was the pointer. A PDF opens on
 * the cited page with the exact figure marked (`pdfSourceMatch`); a
 * spreadsheet could mark a row only when the link carried row numbers, and a
 * statement record's link carries a JSON pointer instead (`?record=`).
 *
 * The record named by that pointer is already selected by provenance. This
 * only finds where IT sits inside ITS OWN file: the row that prints the
 * record's own identity (ISIN, the security as printed, its symbol), narrowed
 * by the exact figure, and the one cell in that row carrying the figure.
 * Anything short of one row abstains, and so does the cell when the figure is
 * printed twice in that row with no column heading to tell them apart — an
 * equal amount elsewhere is never evidence (the rule `sourcePage` keeps).
 */

export type SheetCell = { text: string; full: string };
export type SheetSourceTarget = { identities: string[]; value: string | null; field: string | null };
export type SheetSourceCell = { sheet: number; row: number; col: number | null };

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Fields a statement link can name, and the column headings that print them. */
const FIELD_HEADINGS: Record<string, RegExp> = {
  quantity: /^(?:QTY|QUANTITY|UNITS|BALANCE|HOLDINGS?|SHARES|NO\.? ?OF (?:SHARES|UNITS)|(?:TOTAL|NET|CURRENT|CLOSING|AVAILABLE|BALANCE) (?:QTY|QUANTITY|UNITS|BALANCE|HOLDINGS?))$/,
  closing: /^CLOSING (?:UNIT )?BALANCE$/,
  marketValue: /^(?:VALUE|VALUATION|(?:CURRENT|MARKET|MKT\.?|PRESENT|TOTAL|CURRENT MARKET) VALUE)(?: \(.*\))?$/,
  marketPrice: /^(?:LTP|CMP|NAV|PRICE|RATE|(?:MARKET|CURRENT|CLOSING|LAST) (?:PRICE|RATE|NAV))(?: \(.*\))?$/,
  totalCost: /^(?:COST|TOTAL COST|COST VALUE|BOOK COST|ACQUISITION COST|INVESTMENT(?: VALUE| AMOUNT)?|INVESTED(?: VALUE| AMOUNT)?|PURCHASE (?:VALUE|COST))(?: \(.*\))?$/,
};

/**
 * What to look for, read off the selected record itself. A link carries the
 * figure only for units (`sourceValue`); for any other field the record's own
 * figure for that field is the one its file printed. A link with no field
 * whose figure is the record's units is pointing at its units.
 */
export function sheetSourceTarget(record: unknown, value: string | null, field: string | null): SheetSourceTarget | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const r = record as Record<string, unknown>;
  const identities = [...new Set(['isin', 'printedSecurity', 'symbol', 'security']
    .map(k => r[k]).filter((v): v is string => typeof v === 'string').map(norm).filter(v => v.length >= 2))];
  if (!identities.length) return null;
  const own = field && typeof r[field] === 'number' ? String(r[field]) : null;
  const figure = value != null && value !== '' && Number.isFinite(Number(value)) ? value : own;
  const named = field ?? (figure != null && r.quantity === Number(figure) ? 'quantity' : null);
  return { identities, value: figure, field: named };
}

/** A cell carries the figure when it is that number, at full precision. A
 *  workbook's stored double (`12.085000000000001`) is the number it shows. */
function carries(cell: SheetCell, figure: number): boolean {
  for (const raw of [cell.full, cell.text]) {
    const s = raw.trim().replace(/,/g, '');
    if (!PLAIN_NUMBER.test(s)) continue;
    const n = Number(s);
    if (n === figure || Number(n.toPrecision(15)) === figure) return true;
  }
  return false;
}

function names(cell: SheetCell, identities: readonly string[]): boolean {
  const text = norm(cell.text);
  if (!text) return false;
  // An ISIN is unambiguous inside a longer cell ("INE… - NAME"); a name or a
  // symbol must be the whole cell, so "VEDL" never matches "VEDL-RE".
  return identities.some(id => text === id || (ISIN.test(id) && new RegExp(`(^|[^A-Z0-9])${id}([^A-Z0-9]|$)`).test(text)));
}

/** The heading over a column: the nearest text above the row in that column. */
function heading(rows: readonly (readonly SheetCell[])[], row: number, col: number): string | null {
  for (let r = row - 1; r >= 0; r--) {
    const t = rows[r]?.[col]?.text.trim();
    if (!t) continue;
    if (PLAIN_NUMBER.test(t.replace(/,/g, ''))) continue;
    return norm(t);
  }
  return null;
}

/**
 * The record's row (0-based) and the figure's column in one of the file's
 * sheets, or `undefined` when no single row qualifies. `col` is null when the
 * row is certain but the figure is not printed there exactly once under a
 * heading for its field.
 */
export function sheetSourceCell(sheets: readonly (readonly (readonly SheetCell[])[])[], target: SheetSourceTarget): SheetSourceCell | undefined {
  const figure = target.value != null ? Number(target.value) : null;
  const named: { sheet: number; row: number }[] = [];
  sheets.forEach((rows, sheet) => rows.forEach((cells, row) => {
    if (cells.some(c => names(c, target.identities))) named.push({ sheet, row });
  }));
  const withFigure = figure == null ? [] : named.filter(({ sheet, row }) => sheets[sheet][row].some(c => carries(c, figure)));
  const hit = withFigure.length === 1 ? withFigure[0] : withFigure.length === 0 && named.length === 1 ? named[0] : undefined;
  if (!hit) return undefined;
  if (figure == null) return { ...hit, col: null };
  const rows = sheets[hit.sheet];
  const cols = rows[hit.row].flatMap((c, i) => carries(c, figure) ? [i] : []);
  if (cols.length === 1) return { ...hit, col: cols[0] };
  const pattern = target.field ? FIELD_HEADINGS[target.field] : undefined;
  const headed = pattern ? cols.filter(c => pattern.test(heading(rows, hit.row, c) ?? '')) : [];
  return { ...hit, col: headed.length === 1 ? headed[0] : null };
}
