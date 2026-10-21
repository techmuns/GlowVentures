// ── WHICH RETURNS A TABLE SHOWS, BEFORE AND AFTER THE READER PICKS ─────────
//
// The rules behind `useReturnMeasures`, kept free of React so a suite can hold
// them (`tableView.test.ts`). The picker itself is `ReturnMeasureSelect`.
import { RETURN_MEASURES, isReturnMeasure, type ReturnMeasure } from "@/lib/analytics";

/** The picker's option keys, in reading order — `auto` first. */
export const MEASURE_KEYS = RETURN_MEASURES.map((m) => m.key);

/**
 * ── WHAT A TABLE SHOWS BEFORE ANYONE PICKS: EVERY RETURN ────────────────────
 *
 * *"make default All ratios showing coloumns as selected. So tick holding
 *  period, cagr, xirr, YTD, calendar year etc and remeber it the next time user
 *  always comes."*
 *
 * The five measures, one column each, in the picker's order. `auto` (the
 * methodology, one column) stays one click away and is still exclusive: it
 * picks ONE of these per row, so ticking it beside all five would show every
 * figure twice.
 */
export const DEFAULT_RETURN_MEASURES: readonly ReturnMeasure[] = Object.freeze(MEASURE_KEYS.filter((k) => k !== "auto"));

/**
 * A list of measures in the picker's order: the concrete ones win over `auto`,
 * `auto` alone where none is concrete, and `null` where nothing in it is a
 * measure at all.
 */
export function normaliseMeasures(list: readonly unknown[]): ReturnMeasure[] | null {
  const set = new Set(list.filter((k): k is ReturnMeasure => typeof k === "string" && isReturnMeasure(k)));
  const concrete = MEASURE_KEYS.filter((k) => k !== "auto" && set.has(k));
  if (concrete.length) return concrete;
  return set.has("auto") ? ["auto"] : null;
}

/**
 * WHICH MEASURES A TABLE SHOWS, AND WHY. Pure, so the precedence is testable:
 *
 *   a `?ret=` address  >  the reader's saved pick  >  every measure.
 *
 * The address wins where it names a measure, so a link like "open Private
 * Market on XIRR" still opens on XIRR; it is not saved, exactly as `?tiles=` is
 * not. `?ret=auto` names the methodology view.
 */
export function resolveReturnMeasures(param: string | null, saved: readonly ReturnMeasure[] | null): {
  measures: readonly ReturnMeasure[];
  from: "address" | "saved" | "default";
} {
  if (param != null) {
    const fromParam = normaliseMeasures(param.split(",").map((s) => s.trim()));
    if (fromParam) return { measures: fromParam, from: "address" };
  }
  if (saved && saved.length) return { measures: saved, from: "saved" };
  return { measures: DEFAULT_RETURN_MEASURES, from: "default" };
}

/** The key a page's pick is saved under. One per page: the Monitor's two tables share it. */
export const returnMeasuresKey = (page: string) => `glow:returnMeasures:${page}:v1`;

/** Read a saved pick, from any build: anything that is not a list of measures is nothing saved. */
export const parseSavedMeasures = (raw: unknown): ReturnMeasure[] | null =>
  Array.isArray(raw) ? normaliseMeasures(raw) : null;
