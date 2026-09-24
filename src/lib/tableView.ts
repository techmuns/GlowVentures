import { useCallback, useMemo, useSyncExternalStore } from "react";
import { readMemory, subscribeMemory, writeMemory } from "@/lib/viewMemory";

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

/**
 * WHAT IS SAVED FOR A TABLE: every column it has ever been arranged with, in
 * the reader's order — INCLUDING the ones not drawn right now — and its sort.
 * An empty `order` means "never arranged": the table follows its declared order.
 */
export type StoredView = { order: readonly string[]; sort: TableSort };

const KEY = (k: string) => `glow:tableView:${k}:v1`;
const EMPTY: StoredView = Object.freeze({ order: Object.freeze([]) as readonly string[], sort: null });
const NO_LEGACY: readonly string[] = [];

/** Read what a table saved, from any build: unknown fields are ignored, a bad sort is dropped. */
export function parseStoredView(raw: unknown): StoredView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { order?: unknown; sort?: unknown };
  const order: string[] = [];
  if (Array.isArray(r.order)) {
    for (const c of r.order) if (typeof c === "string" && c && !order.includes(c)) order.push(c);
  }
  const s = r.sort as { col?: unknown; dir?: unknown } | null | undefined;
  const sort: TableSort = s && typeof s === "object" && typeof s.col === "string" && (s.dir === "asc" || s.dir === "desc")
    ? { col: s.col, dir: s.dir } : null;
  return { order, sort };
}

/**
 * What a table saved, falling back to the keys it used to save under — so a
 * table whose key was merged keeps the arrangement the reader already made.
 */
export function storedView(storageKey: string, legacyKeys: readonly string[]): StoredView {
  const own = readMemory(KEY(storageKey), parseStoredView);
  if (own) return own;
  for (const k of legacyKeys) {
    const v = readMemory(KEY(k), parseStoredView);
    if (v) return v;
  }
  return EMPTY;
}

/**
 * A saved sort applies while its column is drawn — and is KEPT, not dropped,
 * while it is not, so a tab that hides the column gives the sort back when the
 * reader returns to one that draws it.
 */
export const visibleSort = (sort: TableSort, declared: readonly string[]): TableSort =>
  sort && declared.includes(sort.col) ? sort : null;

/** `ret:cagr` → `ret`. Columns of one family (one per return measure) stay together. */
const familyOf = (c: string) => { const i = c.indexOf(":"); return i > 0 ? c.slice(0, i) : null; };

/**
 * ── THE WHOLE ARRANGEMENT, WITH EVERY DECLARED COLUMN IN IT ────────────────
 *
 * The saved order, with each column this table declares that the reader has
 * never placed put where it belongs — and every column the reader HAS placed
 * kept exactly where they put it, whether or not it is drawn right now.
 *
 * That last clause is the fix for *"remember the exact position … even when i
 * am changing the tab"*. A table's columns change with its tab and its picker:
 * the security axis adds Via funds and Total exposure, the return picker adds
 * a column per measure. The old rule kept only the columns drawn at the time,
 * so arranging one tab threw away where the reader had put the other tab's
 * columns, and a column that came back reappeared at the far right.
 *
 * A column never placed goes:
 *   - beside its own family — a newly ticked return goes with the other
 *     returns, wherever the reader has put them, in the picker's order;
 *   - otherwise right after the column it is declared after, wherever the
 *     reader has moved that one — Via funds follows Market value.
 * With nothing saved, that reproduces the declared order exactly.
 */
export function arrangeColumns(stored: readonly string[], declared: readonly string[]): string[] {
  const fixed = declared[0];
  if (fixed === undefined) return [];
  const rest: string[] = [];
  const seen = new Set<string>([fixed]);
  for (const c of stored) {
    if (typeof c !== "string" || seen.has(c)) continue;
    seen.add(c);
    rest.push(c);
  }
  for (let i = 1; i < declared.length; i++) {
    const c = declared[i];
    if (seen.has(c)) continue;
    const fam = familyOf(c);
    const pred = i > 1 ? declared[i - 1] : null;
    let at: number;
    if (pred && fam && familyOf(pred) === fam) {
      at = rest.indexOf(pred) + 1;
    } else {
      const members = fam ? rest.filter((x) => familyOf(x) === fam) : [];
      if (members.length) {
        // Before the first sibling that comes AFTER it in the picker's order,
        // or after the last sibling where none does.
        const later = members.filter((x) => declared.indexOf(x) > i);
        at = later.length ? rest.indexOf(later[0]) : rest.indexOf(members[members.length - 1]) + 1;
      } else {
        at = pred ? rest.indexOf(pred) + 1 : 0;
      }
    }
    rest.splice(at, 0, c);
    seen.add(c);
  }
  return [fixed, ...rest];
}

/** The columns as they are DRAWN: the whole arrangement, narrowed to what this table declares. */
export function visibleOrder(stored: readonly string[], declared: readonly string[]): string[] {
  const want = new Set(declared);
  return arrangeColumns(stored, declared).filter((c) => want.has(c));
}

/**
 * The whole arrangement after putting `col` before `before` (or after the last
 * DRAWN column when `before` is null). `null` when the move is refused: the
 * first column is neither a subject nor a destination, and a column not drawn
 * cannot be carried.
 */
export function moveColumn(stored: readonly string[], declared: readonly string[], col: string, before: string | null): string[] | null {
  const all = arrangeColumns(stored, declared);
  const fixed = all[0];
  if (fixed === undefined || col === fixed || col === before || !declared.includes(col)) return null;
  const rest = all.slice(1).filter((c) => c !== col);
  let at: number;
  if (before === fixed) at = 0;
  else if (before && rest.includes(before)) at = rest.indexOf(before);
  else {
    const drawn = new Set(declared);
    let last = -1;
    rest.forEach((c, i) => { if (drawn.has(c)) last = i; });
    at = last + 1;
  }
  rest.splice(at, 0, col);
  return [fixed, ...rest];
}

/**
 * One place left or right among the DRAWN columns — the keyboard's drag. A
 * column not drawn keeps its place. `null` when the nudge would pass the first
 * column or fall off the end.
 */
export function nudgeColumn(stored: readonly string[], declared: readonly string[], col: string, delta: -1 | 1): string[] | null {
  const all = arrangeColumns(stored, declared);
  const fixed = all[0];
  if (fixed === undefined || col === fixed) return null;
  const drawn = all.filter((c) => declared.includes(c));
  const i = drawn.indexOf(col), j = i + delta;
  if (i < 0 || j < 1 || j >= drawn.length) return null;
  const neighbour = drawn[j];
  const rest = all.slice(1).filter((c) => c !== col);
  const k = rest.indexOf(neighbour);
  rest.splice(delta < 0 ? k : k + 1, 0, col);
  return [fixed, ...rest];
}

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
 * ── REMEMBERED EXACTLY, ACROSS TABS, FROM THE FIRST PAINT ───────────────────
 *
 * Saved per table in `localStorage` through `viewMemory.ts`, and nowhere near
 * the book. What is saved is the WHOLE arrangement (`arrangeColumns`), so a
 * column the current tab does not draw keeps its place for the tab that does;
 * a sort on such a column is kept too, and applies again when it is drawn. It
 * is read before the first paint, so a page never opens on the declared order
 * and then jumps. `legacyKeys` names keys a merged table used to save under.
 * Deliberately NOT a URL param: there are fifty-odd tables and a param each
 * would make every address unreadable, and nothing here changes WHICH FIGURES
 * are on screen — only the order they are read in.
 */
export function useTableView(storageKey: string, columns: readonly string[], opts?: { legacyKeys?: readonly string[] }): TableView {
  // Keyed on the CONTENT of the list, so a caller that rebuilds the same list
  // every render does not re-derive the arrangement every render.
  const colKey = columns.join("\u0001");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const declared = useMemo(() => columns.filter((c, i) => columns.indexOf(c) === i), [colKey]);
  const fixed = declared[0] ?? "";
  const legacy = opts?.legacyKeys ?? NO_LEGACY;
  const legacyKey = legacy.join("\u0001");

  const subscribe = useCallback((l: () => void) => subscribeMemory(KEY(storageKey), l), [storageKey]);
  const read = () => storedView(storageKey, legacy);
  const stored = useSyncExternalStore(subscribe, read, read);

  const order = useMemo(() => visibleOrder(stored.order, declared), [stored.order, declared]);
  const sort = visibleSort(stored.sort, declared);

  // Every change reads what is saved NOW rather than what this render saw, so
  // two quick changes cannot write over each other.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const current = useCallback(() => storedView(storageKey, legacy), [storageKey, legacyKey]);
  const save = useCallback((next: StoredView) => writeMemory(KEY(storageKey), next), [storageKey]);

  const toggleSort = useCallback((col: string) => {
    const cur = current();
    const eff = visibleSort(cur.sort, declared);
    /**
     * THREE STATES, NOT TWO, AND THE THIRD IS THE ONE THAT MATTERS. A third
     * click clears the sort and puts the table back in the order its own page
     * chose — which is routinely a meaningful order (largest first, newest
     * first, the statement's own) rather than an arbitrary one, so a reader
     * who sorted by a column must be able to get that back without reloading.
     */
    const next: TableSort = eff?.col !== col ? { col, dir: "desc" }
      : eff.dir === "desc" ? { col, dir: "asc" } : null;
    save({ order: cur.order, sort: next });
  }, [current, declared, save]);

  const move = useCallback((col: string, before: string | null) => {
    const cur = current();
    const next = moveColumn(cur.order, declared, col, before);
    if (next) save({ order: next, sort: cur.sort });
  }, [current, declared, save]);

  const nudge = useCallback((col: string, delta: -1 | 1) => {
    const cur = current();
    const next = nudgeColumn(cur.order, declared, col, delta);
    if (next) save({ order: next, sort: cur.sort });
  }, [current, declared, save]);

  const reset = useCallback(() => save({ order: [], sort: null }), [save]);

  const isDefault = sort == null && order.every((c, i) => c === declared[i]);

  return { order, columns: declared, sort, toggleSort, move, nudge, reset, isDefault, fixed };
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
