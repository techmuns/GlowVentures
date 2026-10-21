import { Children, ReactNode, isValidElement, useRef } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, GripVertical } from "lucide-react";
import { useTableView, type TableView } from "@/lib/tableView";
import { pressColumn } from "@/lib/columnDrag";
import { AutoEditColumns, columnText } from "./EditColumns";
import { reviewColumn, REVIEW_NOTE, type ReviewScope } from "@/lib/reviewColumns";
import { ReviewColumnCell } from "./ReviewColumnCell";

/**
 * ── ONE HEADER CELL FOR EVERY TABLE IN THE APP ──────────────────────────────
 *
 * *"Every single table on the dashboard must have clickable column headings to
 * sort the table data, and also every single column except the first name one,
 * the user should be able to drag and drop to rearrange columns."*
 *
 * Both halves live here, so a table gets them by declaring its columns rather
 * than by implementing them. `sortable={false}` is for a column whose values
 * are not comparable — a chip group, a control, a spacer — and it keeps the
 * DRAG while refusing the click, because a heading that looks clickable and
 * sorts nothing is the control-that-looks-alive failure this repo keeps naming.
 *
 * ── THE DRAG LIFTS THE WHOLE COLUMN, AND THE ARROW KEYS ARE THE OTHER HALF ─
 *
 * *"it should lift up the whole column instead of just lifting up the header"*
 * — so the drag is a pointer gesture (`src/lib/columnDrag.ts`) that carries a
 * copy of the column as it stands on screen, heading and cells together, rather
 * than HTML5's own drag, which can only carry a picture of the heading.
 *
 * A pointer drag is unreachable by keyboard, so a focused heading also moves
 * one place on ← and →. That is not a nicety on a dashboard of fifty tables: a
 * feature only a mouse can reach is a feature half the readers do not have.
 */
export function SortHeader({ col, view, children, align = "right", title, pad = "px-4 py-2", sortable = true, className = "", colSpan, note, noteTitle, coverage }: {
  /** The column's id, as declared in `useTableView`. */
  col: string;
  view: TableView;
  children: ReactNode;
  align?: "left" | "right" | "center";
  title?: string;
  pad?: string;
  sortable?: boolean;
  className?: string;
  colSpan?: number;
  /**
   * A word about WHAT THE COLUMN IS, rendered under its label and never in a
   * hover — the derived fence on the Portfolio Monitor's stock axis: "it says
   * DERIVED, not a position, in words rather than in a tooltip" is a rule of
   * this book, and the sentence a reader may want beyond the word rides in
   * `noteTitle`.
   *
   * Lower-case on purpose — `label-xs` uppercases the label, and a second
   * SHOUTED line would read as a second column rather than a note on this one.
   */
  note?: string;
  noteTitle?: string;
  /**
   * HOW MANY OF THE COLUMN'S ROWS IT ANSWERS — "4 of 4", "2 money-weighted of
   * 4" — kept OFF the screen. It rides at the front of the heading's hover and
   * on `data-col-coverage`, never as a line under the label.
   *
   *   *"Why do i need all this garbage written … its obvious from the table what
   *    it is."*
   *
   * A cell the column cannot answer already shows a dash that says why, and a
   * cell showing a different measure carries its own tag, so the count under
   * the heading repeated what the column's own cells say. It is still one hover
   * away for a reader who wants the tally.
   */
  coverage?: string;
}) {
  const active = view.sort?.col === col;
  const dir = view.sort?.dir;
  const Icon = active ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  const movable = col !== view.fixed;
  const alignCls = align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";

  return (
    <th
      colSpan={colSpan}
      data-col={col}
      data-col-sort={active ? dir : undefined}
      data-col-movable={movable ? "" : undefined}
      data-col-coverage={coverage}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      title={[coverage, title ?? (sortable
        ? `Sort by this column${movable ? " · drag it, or focus the handle and press ← or →, to move it" : ""}`
        : movable ? "Drag this column, or focus the handle and press ← or →, to move it" : undefined)]
        .filter(Boolean).join(" · ") || undefined}
      onPointerDown={movable ? (e) => pressColumn(e, col, view) : undefined}
      className={`label-xs select-none ${pad} font-semibold ${alignCls} ${active ? "text-slate-300" : ""} ${
        movable ? "cursor-grab" : ""} ${className}`}>
      {/* ── NOT ONE FLEX BOX IN THIS CELL, AND THAT IS LOAD-BEARING ─────────
          `innerText` blockifies the CHILDREN of a flex container, so an
          `inline-flex` heading put its icon and its label on separate lines —
          and this repo's page sweep reads a header row as one tab-joined line
          in around a hundred places. Measured: with flex, `/as of.*capital
          in.*marked on this date/` matched nothing on a header rendering
          perfectly. Plain inline flow keeps every one of those reading exactly
          as it did before the headings became controls.

          The icon therefore takes its side from DOM ORDER rather than from
          `flex-row-reverse`: after the label on a right-aligned column, before
          it on a left-aligned one. */}
      <span className="whitespace-nowrap">
        {sortable ? (
          <button type="button" data-col-button={col} onClick={() => view.toggleSort(col)}
            /* `uppercase` REPEATED HERE ON PURPOSE. The HTML rendering spec
               gives form controls `text-transform: none`, so a `<button>`
               inside a `label-xs` heading renders its label in the source's own
               case while the cell around it is uppercase — and this repo's
               sweep slices pages on header text that `innerText` returns
               TRANSFORMED, which broke four Polycab invariants on a header
               rendering the right words. The cell's own class is what this
               mirrors. */
            className="rounded align-middle uppercase ring-focus transition-colors hover:text-slate-300">
            {align === "right" ? <>{children}<Icon className={`ml-1 inline-block h-3 w-3 align-[-1px] ${active ? "text-champagne-400" : "text-slate-600"}`} /></>
              : <><Icon className={`mr-1 inline-block h-3 w-3 align-[-1px] ${active ? "text-champagne-400" : "text-slate-600"}`} />{children}</>}
          </button>
        ) : (
          <span>{children}</span>
        )}
        {/* THE HANDLE IS THE AFFORDANCE, and it is a real focusable control so
            the keyboard path has somewhere to live. Only on a column that can
            actually move — the first one carries none, which is how a reader
            sees that it is fixed without being told. */}
        {movable && (
          <button type="button" data-col-grip={col} tabIndex={0}
            aria-label="Move this column"
            title="Drag to move this column, or press ← or →"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") { e.preventDefault(); view.nudge(col, -1); }
              if (e.key === "ArrowRight") { e.preventDefault(); view.nudge(col, 1); }
            }}
            className="ml-1 cursor-grab touch-none rounded align-middle text-slate-700 ring-focus transition-colors hover:text-slate-400">
            <GripVertical className="inline-block h-3 w-3 align-[-1px]" />
          </button>
        )}
      </span>
      {note && (
        <div data-col-note className="mt-0.5 text-[9px] font-normal normal-case tracking-normal text-champagne-400/70" title={noteTitle}>
          {note}
        </div>
      )}
    </th>
  );
}

/**
 * ── A ROW'S CELLS ARE WRITTEN IN THE DECLARED ORDER AND DRAWN IN THE READER'S
 *
 * `<Tr view={view}>` takes its `<td>`s exactly as the table has always written
 * them — one per `useTableView` column, in that order — and permutes them to
 * `view.order`. So no table's cell JSX changes when a column moves, and with
 * nothing dragged the permutation is the identity: the rendered markup is
 * byte-for-byte what it was, which is what keeps every column-index assertion
 * in `check:pages` reading the column it was written against.
 *
 * IT SERVES THE HEADER ROW TOO, and it has to: the `<thead>`'s cells are
 * written in the same declared order, so a `<thead>` left unpermuted would keep
 * its headings still while the body followed a drag — every figure under the
 * wrong heading, which is the one outcome this feature must never produce. Found
 * by driving the keyboard move against a real page rather than by reading the
 * code, which is why the note is here.
 *
 * IT REFUSES A MISMATCH RATHER THAN DRAWING A SCRAMBLED ROW. A row with the
 * wrong number of cells means a conditional `<td>` or a `colSpan` somewhere,
 * and permuting it would put a figure under the wrong heading — which is the
 * failure this whole file exists to prevent. It renders the cells in the
 * DECLARED order instead, so the row is right even if it does not follow the
 * drag, and the mismatch is loud in development.
 */
export function Tr({ view, children, reviewScope, ...rest }: { view: TableView; children: ReactNode; reviewScope?: ReviewScope } & React.HTMLAttributes<HTMLTableRowElement>) {
  const row = useRef<HTMLTableRowElement>(null);
  const cells = Children.toArray(children).filter((c) => isValidElement(c) || c === 0 || !!c);
  const header = cells.some((cell) => isValidElement(cell) && cell.type === SortHeader);
  if (cells.length === view.baseColumns.length) for (const id of view.additionalColumns) {
    const column = reviewColumn(id)!;
    cells.push(header
      ? <SortHeader key={id} col={id} view={view} align={column.format === "text" ? "left" : "right"} note="30 Jun 2026 review" title={REVIEW_NOTE}>{column.label}</SortHeader>
      : <ReviewColumnCell key={id} id={id} scope={reviewScope} />);
  }
  const labels = Object.fromEntries(cells.flatMap((cell) => {
    if (!isValidElement<{ col?: string; children?: ReactNode; title?: string }>(cell) || !cell.props.col) return [];
    return [[cell.props.col, { label: columnText(cell.props.children), detail: reviewColumn(cell.props.col) ? REVIEW_NOTE : undefined }]];
  }));
  if (cells.length !== view.columns.length) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`<Tr> got ${cells.length} cells for ${view.columns.length} columns — the row is drawn in declared order`);
    }
    return <tr {...rest}>{children}</tr>;
  }
  const byCol = new Map(view.columns.map((c, i) => [c, cells[i]]));
  return <tr ref={row} {...rest}>{header && <AutoEditColumns view={view} row={row} labels={labels} />}{view.order.map((c) => byCol.get(c))}</tr>;
}

/**
 * ── AND A FOOTER FOLLOWS THE SAME ORDER, OR IT TOTALS THE WRONG COLUMN ──────
 *
 * A footer's label spans the leading columns that have no total — "Total · 73
 * rows" over the security and its chips — and the rest carry one cell each. The
 * span is therefore a FUNCTION of the current order rather than a literal:
 * computed as the leading run of columns with no cell in the map, it reproduces
 * today's markup exactly while nothing has been dragged, and it follows when
 * something has.
 *
 * Left as a literal it would be the most dangerous thing in this change: the
 * header would move and the totals would not, so a reader would find a market
 * value under a heading reading Sector. This repo has already paid for a total
 * printed under a column that describes something else — twice.
 *
 * The caller supplies whole `<td>` elements, because a footer cell's alignment,
 * colour and popover belong to the table that knows what the figure is.
 */
export function TrFoot({ view, label, labelTitle, cells, className = "", ...rest }: {
  view: TableView;
  /** The label cell's CONTENT — `TrFoot` computes its `colSpan`. */
  label: ReactNode;
  /**
   * A hover on the LABEL CELL, never on the row. A claim about what a total
   * leaves out belongs on the figure it qualifies, and a `title` spread onto
   * the `<tr>` would hover anywhere along it including over other columns'
   * own totals.
   */
  labelTitle?: string;
  /** One `<td>` per column that carries a total, keyed by column id. */
  cells: Record<string, ReactNode>;
  className?: string;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  let lead = 0;
  while (lead < view.order.length && !(view.order[lead] in cells)) lead += 1;
  // A footer with a total in its very first column has no label span at all,
  // which is legitimate and must not become `colSpan={0}`.
  const span = Math.max(lead, 1);
  return (
    <tr {...rest}>
      <td colSpan={span} className={className} title={labelTitle}>{label}</td>
      {/* A COLUMN WITH NO TOTAL STILL NEEDS ITS CELL, and it takes the row's
          own class: the footer carries a top rule, and an unstyled filler
          breaks that line across the table. */}
      {view.order.slice(span).map((c) => cells[c] ?? <td key={c} className={className} />)}
    </tr>
  );
}

/**
 * ── A TABLE THAT OWNS ITS OWN ARRANGEMENT, FOR A PANEL INSIDE A ROW ─────────
 *
 * `useTableView` is a hook, so a table rendered inside a `.map` over rows — a
 * row's expansion panel, drawn once per opened row — cannot call it where its
 * JSX sits. This is the seam: the hook lives in a component at a stable call
 * site and the arrangement arrives as an argument, so the panel's markup stays
 * exactly where it is rather than being lifted into a component of its own.
 *
 * Every open panel of one kind shares a `storageKey`, which is the right
 * behaviour rather than a compromise: a reader who moves a column on one
 * tranche panel means it for the next one they open, not for that row alone.
 */
export function SortableTable({ storageKey, columns, children, ...rest }: {
  storageKey: string;
  columns: readonly string[];
  children: (view: TableView) => ReactNode;
} & Omit<React.TableHTMLAttributes<HTMLTableElement>, "children">) {
  const view = useTableView(storageKey, columns);
  return <table {...rest}>{children(view)}</table>;
}
