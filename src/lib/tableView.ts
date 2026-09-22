import { useCallback, useEffect, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export type TableSort = { col: string; dir: SortDir } | null;

/** What a row is worth in one column. `null` means the source reports none. */
export type Accessor<T> = (r: T) => number | string | null | undefined;

export type TableView = {
  /** The columns left to right as they are drawn now. The first never moves. */
  order: readonly string[];
  /** The columns in the order this table DECLARES, which is what a row's cells arrive in. */
  columns: readonly string[];
  sort: TableSort;
  toggleSort: (col: string) => void;
  /** Put `col` immediately before `before`, or last when `before` is null. */
  move: (col: string, before: string | null) => void;
  /** Nudge one place left or right — the keyboard's version of a drag. */
  nudge: (col: string, delta: -1 | 1) => void;
  /** Back to the declared order and no sort. */
  reset: () => void;
  isDefault: boolean;
  /** The id of the column that cannot be moved — the first one. */
  fixed: string;
};

const KEY = (k: string) => `glow:tableView:${k}:v1`;

/**
 * ── ONE DEFINITION OF "HOW THIS TABLE IS ARRANGED" ──────────────────────────
 *
 * *"Every single table on the dashboard must have clickable column headings to
 * sort the table data, and also every single column except the first name one,
 * the user should be able to drag and drop to rearrange columns, make this
 * standardized for every table anywhere on the dashboard."*
 *
 * Fifty-odd tables, so the arrangement is a hook and the header cell is a
 * component: a per-table implementation would be fifty chances for one screen
 * to sort nulls one way and another the other, and this repo has paid for that
 * shape of drift with `holdingBucket`, `costCoversSet` and `companyExposure`.
 *
 * ── THE DECLARED ORDER IS THE ONE THE CELLS ARRIVE IN ───────────────────────
 *
 * `columns` is the order each table's own JSX writes its `<td>`s in, and it is
 * never rewritten. `order` is what a reader has dragged them to. `<Tr>`
 * permutes the cells from the first into the second, so no table's markup
 * changes when a column moves — and with nothing dragged the two are identical,
 * which is what keeps every column-index assertion in `check:pages` reading the
 * column it was written against.
 *
 * ── THE FIRST COLUMN IS FIXED, BECAUSE THE FAMILY SAID SO ───────────────────
 *
 * *"every single column except the first name one."* It is the row's identity —
 * the security, the fund, the account, the date — and a table whose name column
 * has been dragged into the middle is a table a reader cannot scan. `move` and
 * `nudge` both refuse it as a subject AND as a destination.
 *
 * ── AND AN ABSENT VALUE SORTS LAST IN BOTH DIRECTIONS ───────────────────────
 *
 * Not as zero, and not as negative infinity either. A statement that reports no
 * cost has not reported a small one, and this book's own rule for a total —
 * `sumOrNull` skips a null rather than blending it in — is the same rule one
 * axis over: `txnSort` already sorts an unreported amount last rather than
 * among the smallest. Sorting them to the TOP on ascending would put every
 * holding whose custodian sends no cost at the head of a table about cost.
 *
 * ── STORED PER TABLE, IN `localStorage`, AND NOWHERE NEAR THE BOOK ──────────
 *
 * It is a preference about a screen, exactly like the nav's width and the
 * Extras group's open state, so it never reaches `glowData.ts`. Every read and
 * write is wrapped, because the accessor throws in a private window and a
 * blocked store must leave the table rendering its declared order rather than
 * rendering nothing. Deliberately NOT a URL param: there are fifty-odd tables
 * and a param each would make every address unreadable, and unlike the private
 * market's tile picker nothing here changes WHICH FIGURES are on screen — only
 * the order they are read in.
 */
export function useTableView(storageKey: string, columns: readonly string[]): TableView {
  const declared = useMemo(() => columns.filter((c, i) => columns.indexOf(c) === i), [columns]);
  const fixed = declared[0] ?? "";

  const [state, setState] = useState<{ order: string[]; sort: TableSort }>(() => ({ order: [...declared], sort: null }));

  /**
   * READ ON MOUNT RATHER THAN IN THE INITIALISER, and reconciled against the
   * columns this build declares: a set saved by an older build can name a
   * column that no longer exists, and one that has GAINED a column must show
   * it rather than silently hiding it at the end of the world. Unknown ids are
   * dropped, missing ones are appended in declared order, and a stored sort on
   * a column that has gone is discarded.
   */
  useEffect(() => {
    let stored: { order?: unknown; sort?: unknown } | null = null;
    try {
      const raw = window.localStorage.getItem(KEY(storageKey));
      if (raw) stored = JSON.parse(raw) as { order?: unknown; sort?: unknown };
    } catch { /* private mode, or a value this build cannot parse */ }
    const kept = Array.isArray(stored?.order)
      ? (stored!.order as unknown[]).filter((c): c is string => typeof c === "string" && declared.includes(c))
      : [];
    const order = kept.length
      ? [fixed, ...kept.filter((c) => c !== fixed), ...declared.filter((c) => c !== fixed && !kept.includes(c))]
      : [...declared];
    const s = stored?.sort as TableSort | undefined;
    const sort = s && typeof s === "object" && declared.includes(s.col) && (s.dir === "asc" || s.dir === "desc")
      ? { col: s.col, dir: s.dir } : null;
    setState({ order, sort });
  }, [storageKey, declared, fixed]);

  const commit = useCallback((next: { order: string[]; sort: TableSort }) => {
    setState(next);
    try { window.localStorage.setItem(KEY(storageKey), JSON.stringify(next)); } catch { /* private mode */ }
  }, [storageKey]);

  const toggleSort = useCallback((col: string) => {
    setState((p) => {
      /**
       * THREE STATES, NOT TWO, AND THE THIRD IS THE ONE THAT MATTERS. A third
       * click clears the sort and puts the table back in the order its own page
       * chose — which is routinely a meaningful order (largest first, newest
       * first, the statement's own) rather than an arbitrary one, so a reader
       * who sorted by a column must be able to get that back without reloading.
       */
      const next: { order: string[]; sort: TableSort } = p.sort?.col !== col
        ? { order: p.order, sort: { col, dir: "desc" } }
        : p.sort.dir === "desc"
          ? { order: p.order, sort: { col, dir: "asc" } }
          : { order: p.order, sort: null };
      try { window.localStorage.setItem(KEY(storageKey), JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [storageKey]);

  const move = useCallback((col: string, before: string | null) => {
    // THE FIXED COLUMN IS NEITHER A SUBJECT NOR A DESTINATION: it is the row's
    // identity and the family asked for it to stay put.
    if (col === fixed || col === before) return;
    setState((p) => {
      const rest = p.order.filter((c) => c !== col && c !== fixed);
      const at = before && before !== fixed ? rest.indexOf(before) : rest.length;
      rest.splice(at < 0 ? rest.length : at, 0, col);
      const next = { order: [fixed, ...rest], sort: p.sort };
      try { window.localStorage.setItem(KEY(storageKey), JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [fixed, storageKey]);

  const nudge = useCallback((col: string, delta: -1 | 1) => {
    if (col === fixed) return;
    setState((p) => {
      const i = p.order.indexOf(col);
      const j = i + delta;
      // Never past the fixed column, never off either end.
      if (i < 0 || j < 1 || j >= p.order.length) return p;
      const order = [...p.order];
      [order[i], order[j]] = [order[j], order[i]];
      const next = { order, sort: p.sort };
      try { window.localStorage.setItem(KEY(storageKey), JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [fixed, storageKey]);

  const reset = useCallback(() => commit({ order: [...declared], sort: null }), [commit, declared]);

  const isDefault = state.sort == null
    && state.order.length === declared.length
    && state.order.every((c, i) => c === declared[i]);

  return { order: state.order, columns: declared, sort: state.sort, toggleSort, move, nudge, reset, isDefault, fixed };
}

/**
 * Apply a view's sort to a row list. Stable, and an absent value sorts LAST
 * whichever direction is asked for — see the note above.
 *
 * A column with no accessor sorts nothing and returns the list untouched, which
 * is what a descriptive column (a sector, a reason, a chip) should do: its
 * heading is still clickable so the reader is not left guessing which columns
 * are sortable, and `SortHeader` is what refuses the click there.
 */
export function sortRows<T>(rows: readonly T[], sort: TableSort, accessors: Record<string, Accessor<T>>): T[] {
  if (!sort) return [...rows];
  const acc = accessors[sort.col];
  if (!acc) return [...rows];
  const dir = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: acc(r) }))
    .sort((a, b) => {
      const an = a.v == null || a.v === "", bn = b.v == null || b.v === "";
      if (an && bn) return a.i - b.i;
      if (an) return 1;
      if (bn) return -1;
      if (typeof a.v === "number" && typeof b.v === "number") {
        // A NaN is not a figure either: it sorts with the absent rather than
        // wherever the comparison happens to put it.
        const af = Number.isFinite(a.v), bf = Number.isFinite(b.v);
        if (!af && !bf) return a.i - b.i;
        if (!af) return 1;
        if (!bf) return -1;
        return a.v === b.v ? a.i - b.i : (a.v < b.v ? -dir : dir);
      }
      const as = String(a.v), bs = String(b.v);
      const c = as.localeCompare(bs, undefined, { numeric: true, sensitivity: "base" });
      return c === 0 ? a.i - b.i : c * dir;
    })
    .map((x) => x.r);
}
