import { ReactNode, useCallback, useState, type MouseEvent } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

/**
 * ── THE STANDARD FOR A TABLE WHOSE ROWS OPEN INTO OTHER ROWS ────────────────
 *
 *   *"I want it structured in well-structured columns and rows so that it is
 *    easily expandable and people can read this easily … so that we can have a
 *    standard across the whole dashboard. And instead of seeing these kind of
 *    sub-rows which have data indented towards the right and left, this does
 *    not make sense."*
 *
 * The rows a parent opens into are ROWS OF THE SAME TABLE, in the SAME columns,
 * and never a second table drawn inside a cell. A nested table sizes its own
 * columns, so its Units sat at one x in one panel and another x in the next and
 * neither lined up with the Units above it — which is exactly what was pointed
 * at. Here a child's Value is under its parent's Value by construction, because
 * it is the same column; and since every row goes through `<Tr view>`, a column
 * a reader drags moves in the parent, its children and the totals together.
 *
 * FOUR KINDS OF ROW, AND EACH LOOKS LIKE WHAT IT IS:
 *
 *   section   a band across the table — a heading, a marker chip, the section's
 *             own totals in their columns. It can be closed, which is how a
 *             section of missing data stays out of the way and stays NAMED.
 *   parent    one line per thing — a fund, a member — with a chevron. The whole
 *             row opens it; links and buttons inside it keep their own click.
 *   child     the lines behind a parent, indented under a tree guide in the
 *             FIRST cell only. Every other cell is in its own column.
 *   adjust    a line that makes the children add to the parent — "counted
 *             once" — italic, so a reader sees it is arithmetic and not a folio.
 *
 * A table adopts the standard by writing its first cell with `TreeNameCell` /
 * `TreeSectionCell` and its rows with the `TREE_ROW` classes; the columns, the
 * sort and the drag stay `useTableView`'s.
 */

/** The row classes. Light mode remaps every one of these (see `index.css`). */
export const TREE_ROW = {
  section: "bg-ink-900/60 border-y border-ink-700",
  parent: "cursor-pointer hover:bg-ink-700/40",
  child: "bg-ink-900/40 text-[12.5px] hover:bg-ink-700/30",
  adjust: "bg-ink-900/40 text-[12px] italic",
  total: "bg-ink-800/60",
} as const;

/** Cell padding per row kind, so a parent and its children share one rhythm. */
export const TREE_CELL = {
  parent: "px-4 py-2.5",
  child: "px-4 py-1.5",
  section: "px-4 py-2",
} as const;

/**
 * WHICH ROWS ARE OPEN — component state rather than the URL: it is a reader's
 * place in a table, not a view of the book.
 */
export function useExpanded(initial: Iterable<string> = []) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(initial));
  const isOpen = useCallback((k: string) => open.has(k), [open]);
  const toggle = useCallback((k: string) => setOpen((p) => {
    const n = new Set(p);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  }), []);
  const setMany = useCallback((keys: Iterable<string>, on: boolean) => setOpen((p) => {
    const n = new Set(p);
    for (const k of keys) { if (on) n.add(k); else n.delete(k); }
    return n;
  }), []);
  return { open, isOpen, toggle, setMany };
}

/**
 * THE WHOLE ROW IS THE CONTROL. A click anywhere on it toggles — except on a
 * link, a button or a field inside it, which keeps its own meaning (the fund
 * name's page link, a pill, the chevron itself).
 */
export function rowToggle(onToggle: () => void) {
  return {
    onClick: (e: MouseEvent<HTMLElement>) => {
      const t = e.target as HTMLElement;
      if (t.closest("a, button, input, select, textarea, summary, [data-no-row-toggle]")) return;
      // A reader selecting text to copy a figure is not asking to fold the row.
      if (window.getSelection()?.toString()) return;
      onToggle();
    },
  };
}

/** The chevron. A real button, so the keyboard reaches every row the mouse can. */
export function TreeChevron({ open, onToggle, label, ...data }: {
  open: boolean;
  onToggle: () => void;
  label: string;
} & Record<`data-${string}`, string | number | undefined>) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-label={label} title={label}
      {...data}
      className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 ring-focus transition-colors hover:bg-ink-700/60 hover:text-champagne-400">
      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
    </button>
  );
}

/**
 * THE FIRST CELL OF A PARENT OR A CHILD ROW.
 *
 * A parent carries the chevron; a child carries the tree guide — a vertical
 * line down the left of the children and a tick into each one, ending at the
 * last. The guide is drawn in the cell's own padding so it is continuous from
 * row to row, and it is the ONLY thing indented: the figures stay in columns.
 */
export function TreeNameCell({ depth, title, sub, open, onToggle, toggleLabel, toggleData, last, className = "" }: {
  depth: 0 | 1;
  title: ReactNode;
  /** A second, quieter line: what the row is, never a figure another column holds. */
  sub?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
  toggleData?: Record<`data-${string}`, string | number | undefined>;
  /** The last child ends the guide at its tick, like a └. */
  last?: boolean;
  className?: string;
}) {
  if (depth === 1) {
    return (
      <td className={`relative py-1.5 pl-[3.25rem] pr-4 ${className}`}>
        <span aria-hidden className={`absolute left-[1.6rem] top-0 border-l border-ink-600 ${last ? "h-1/2" : "bottom-0"}`} />
        <span aria-hidden className="absolute left-[1.6rem] top-1/2 w-3.5 border-t border-ink-600" />
        <div className="min-w-0">
          <div className="text-slate-200">{title}</div>
          {sub && <div className="mt-px text-[11px] leading-snug text-slate-500">{sub}</div>}
        </div>
      </td>
    );
  }
  return (
    <td className={`${TREE_CELL.parent} ${className}`}>
      <div className="flex items-start gap-2">
        {onToggle
          ? <TreeChevron open={!!open} onToggle={onToggle} label={toggleLabel ?? (open ? "Close" : "Open")} {...(toggleData ?? {})} />
          : <span aria-hidden className="inline-block h-5 w-5 shrink-0" />}
        <div className="min-w-0">
          <div className="font-medium text-slate-100">{title}</div>
          {sub && <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{sub}</div>}
        </div>
      </div>
    </td>
  );
}

/**
 * THE FIRST CELL OF A SECTION BAND: a chevron where the section can close, the
 * heading, a marker chip saying what kind of section it is, and one quiet line.
 */
export function TreeSectionCell({ title, marker, sub, open, onToggle, toggleData, colSpan }: {
  title: ReactNode;
  marker?: ReactNode;
  sub?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  toggleData?: Record<`data-${string}`, string | number | undefined>;
  /**
   * A band with no figures of its own spans the table in one cell. A band that
   * carries a total per column does not — it goes through `<Tr view>` like any
   * other row, so its totals follow a dragged column.
   */
  colSpan?: number;
}) {
  return (
    <td className={TREE_CELL.section} colSpan={colSpan}>
      <div className="flex items-start gap-2">
        {onToggle
          ? <TreeChevron open={!!open} onToggle={onToggle} label={open ? "Hide this section" : "Show this section"} {...(toggleData ?? {})} />
          : <span aria-hidden className="inline-block h-5 w-5 shrink-0" />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">{title}</span>
            {marker}
          </div>
          {sub && <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{sub}</div>}
        </div>
      </div>
    </td>
  );
}

/** One control that opens or closes every row the table can open. */
export function ExpandAllButton({ allOpen, onClick }: { allOpen: boolean; onClick: () => void }) {
  const Icon = allOpen ? ChevronsDownUp : ChevronsUpDown;
  return (
    <button type="button" onClick={onClick} data-tree-expand-all={allOpen ? "close" : "open"}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-ink-600 px-2 py-1 text-[11px] font-medium text-slate-400 ring-focus transition-colors hover:bg-ink-700/60 hover:text-slate-200">
      <Icon className="h-3.5 w-3.5" />
      {allOpen ? "Collapse all" : "Expand all"}
    </button>
  );
}
