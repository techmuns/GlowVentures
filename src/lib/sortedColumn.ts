import { type RefObject, useLayoutEffect } from "react";

const CELL = "data-sorted-col";
const BEFORE = "data-sorted-col-before";

/** Every cell of this table that stands in the columns `head` occupies, top to bottom. */
function columnCells(table: HTMLTableElement, head: HTMLTableCellElement): HTMLTableCellElement[] {
  // A rowSpan above pushes the cells below it to the right, so a cell's place in
  // the grid is worked out from the rows above it rather than read from its index.
  const taken = new Map<number, number>();
  const placed: { cell: HTMLTableCellElement; start: number; span: number }[] = [];
  for (const row of Array.from(table.rows)) {
    let at = 0;
    for (const cell of Array.from(row.cells)) {
      while ((taken.get(at) ?? 0) > 0) at += 1;
      placed.push({ cell, start: at, span: cell.colSpan });
      for (let i = at; i < at + cell.colSpan; i += 1) if (cell.rowSpan > 1) taken.set(i, cell.rowSpan);
      at += cell.colSpan;
    }
    for (const [i, left] of taken) taken.set(i, left - 1);
  }
  const own = placed.find((p) => p.cell === head);
  if (!own) return [];
  // A cell reaching beyond the column — a footer's label span, a row's opened
  // panel — is not this column's cell, and tinting it would paint its neighbours.
  return placed.filter((p) => p.start >= own.start && p.start + p.span <= own.start + own.span).map((p) => p.cell);
}

/**
 * ── THE COLUMN A TABLE IS SORTED BY IS MARKED DOWN ITS WHOLE LENGTH ─────────
 *
 *   *"that particular column must be highlighted in light blue shade, so it is
 *    clear that based on which column the current table is being sorted."*
 *
 * Marked on the DOM from the heading because a row's cells are written by each
 * table and many are components that take no extra props (`AbsentCell`,
 * `ReviewColumnCell`). So every table that uses `SortHeader` gets this without
 * touching its cells. `table.rows` is this table's own rows, so a table opened
 * inside a row keeps its own mark. The observer follows rows arriving (infinite
 * scroll, a row opening) and cells moving (a column dragged, the sort itself).
 * The paint is in `index.css`.
 */
export function useSortedColumn(head: RefObject<HTMLTableCellElement>, active: boolean) {
  useLayoutEffect(() => {
    const th = head.current;
    const table = th?.closest("table");
    if (!active || !th || !table) return;
    let marked: Element[] = [];
    const clear = () => {
      for (const el of marked) { el.removeAttribute(CELL); el.removeAttribute(BEFORE); }
      marked = [];
    };
    const mark = () => {
      clear();
      const cells = columnCells(table, th);
      cells.forEach((cell, i) => {
        cell.setAttribute(CELL, i === 0 ? "top" : i === cells.length - 1 ? "bottom" : "");
        marked.push(cell);
        const before = cell.previousElementSibling;
        if (before) { before.setAttribute(BEFORE, ""); marked.push(before); }
      });
    };
    mark();
    const observer = new MutationObserver((records) => {
      if (records.some((r) => r.target instanceof HTMLElement && /^(TABLE|THEAD|TBODY|TFOOT|TR|TD|TH)$/.test(r.target.tagName)
        && (r.type === "attributes" || !/^T[DH]$/.test(r.target.tagName)))) mark();
    });
    observer.observe(table, { childList: true, subtree: true, attributes: true, attributeFilter: ["colspan", "rowspan"] });
    return () => { observer.disconnect(); clear(); };
  }, [head, active]);
}
