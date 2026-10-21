import { useState } from "react";

// Lightweight client-side table sorting. Each sortable column supplies an
// accessor that returns the comparable value for a row; nulls sort last in
// descending order. Clicking the active column flips the direction.
export type SortDir = "asc" | "desc";
export type SortState = { col: string; dir: SortDir };

type Accessor<T> = (r: T) => number | string | null | undefined;

export function useSort<T>(rows: T[], accessors: Record<string, Accessor<T>>, initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const acc = accessors[sort.col];
  const dir = sort.dir === "asc" ? 1 : -1;
  const norm = (v: number | string | null | undefined) => (v == null ? -Infinity : v);
  const sorted = acc
    ? [...rows].sort((a, b) => {
        const av = norm(acc(a)), bv = norm(acc(b));
        if (av < bv) return -dir;
        if (av > bv) return dir;
        return 0;
      })
    : rows;
  const toggle = (col: string) =>
    setSort((p) => (p.col === col ? { col, dir: p.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" }));
  return { sorted, sort, toggle };
}
