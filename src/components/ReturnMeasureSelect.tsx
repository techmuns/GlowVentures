import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Check } from "lucide-react";
import { RETURN_MEASURES, returnMeasureDef, type ReturnMeasure } from "@/lib/analytics";
import { useMemory, writeMemory } from "@/lib/viewMemory";
import {
  MEASURE_KEYS, DEFAULT_RETURN_MEASURES, normaliseMeasures, resolveReturnMeasures, returnMeasuresKey, parseSavedMeasures,
} from "@/lib/returnMeasures";

// ── THE RETURN-METHODOLOGY PICKER, SHARED ───────────────────────────────────
//
// It was private to the Portfolio Monitor. The family then asked for it on the
// Private Market fund table too — *"The customer is confused about what kind of
// return this is"* — and a second copy of a control is a second chance for one
// page to offer a measure the other words differently. So this is the ONE
// picker; its state is the reader's saved pick per page, which a `?ret=`
// address overrides (`resolveReturnMeasures`).
//
// WHAT A PAGE MAY OVERRIDE IS THE HINT, AND ONLY WHERE THE MONITOR'S WORDING IS
// FALSE OF IT. The XIRR hint says the statements "do not carry per holding"
// each tranche's date and amount — true of a share in a demat, and false of a
// drawdown fund, whose capital account prints every dated call since its
// first. Private Market passes its own sentence for exactly the measures where
// that is so; the labels, tags, order and mutual exclusion stay one definition.

export { MEASURE_KEYS, DEFAULT_RETURN_MEASURES } from "@/lib/returnMeasures";

/**
 * WHICH RETURN(S) THE TABLE SHOWS — one column each (`withReturnCols`).
 *
 * REMEMBERED, per page, in this browser. It used to live in the URL alone
 * (`?ret=`), so the sidebar, a breadcrumb or any link without the param put the
 * table back on the methodology and the reader had to pick again every visit.
 * A pick now saves to `viewMemory` and takes any `?ret=` off the address (with
 * `replace`, so Back does not step through picker states), because an address
 * that still named the old pick would outrank the new one on the next load.
 *
 * `auto` is MUTUALLY EXCLUSIVE with the concrete measures: picking Absolute or
 * CAGR means "show me that one", not "that one on top of the rule", so a
 * concrete selection replaces auto and clearing everything falls back to it.
 */
export function useReturnMeasures(page: string): [ReturnMeasure[], (next: ReturnMeasure[]) => void, "address" | "saved" | "default"] {
  const [sp, setSp] = useSearchParams();
  const param = sp.get("ret");
  const saved = useMemory(returnMeasuresKey(page), parseSavedMeasures);
  const { measures, from } = resolveReturnMeasures(param, saved);
  const key = measures.join(",");
  // A STABLE ARRAY, so a column list built from it is not rebuilt every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => [...measures], [key]);
  const setMeasures = useCallback((next: ReturnMeasure[]) => {
    writeMemory(returnMeasuresKey(page), normaliseMeasures(next) ?? ["auto"]);
    if (sp.has("ret")) {
      const nextSp = new URLSearchParams(sp);
      nextSp.delete("ret");
      setSp(nextSp, { replace: true });
    }
  }, [page, sp, setSp]);
  return [stable, setMeasures, from];
}

/**
 * THE RETURN-MEASURE PICKER — replaces the Absolute/CAGR toggle.
 *
 * "When you say return… what return is it? I can give you ten different returns
 * for one scheme." So this offers every one of them, the single Return column
 * shows whichever are ticked, and each cell is labelled with the measure it is.
 * `auto` behaves as a reset-to-methodology choice (mutually exclusive); the rest
 * tick on and off together. It is never empty — unticking the last one falls back
 * to auto — because an empty selection is not a state a reader means to be in.
 */
export function ReturnMeasureSelect({ measures, onChange, hints, source }: {
  measures: ReturnMeasure[];
  onChange: (m: ReturnMeasure[]) => void;
  /** Per-measure hint text where this page's truth differs from the Monitor's. */
  hints?: Partial<Record<ReturnMeasure, string>>;
  /** Where the ticked measures came from — `useReturnMeasures`' third value. */
  source?: "address" | "saved" | "default";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const isAuto = measures.length === 1 && measures[0] === "auto";
  const ticked = (k: ReturnMeasure) => (k === "auto" ? isAuto : measures.includes(k));
  const toggle = (k: ReturnMeasure) => {
    if (k === "auto") { onChange(["auto"]); return; }
    const set = new Set(measures.filter((m) => m !== "auto"));
    set.has(k) ? set.delete(k) : set.add(k);
    onChange(MEASURE_KEYS.filter((m) => m !== "auto" && set.has(m)));
  };
  const all = !isAuto && DEFAULT_RETURN_MEASURES.every((k) => measures.includes(k));
  const label = isAuto ? "Return · by methodology"
    : all ? "Returns · all"
    : measures.length === 1 ? returnMeasureDef(measures[0]).label
    : `${measures.length} return types`;
  return (
    <div ref={wrapRef} className="relative"
      data-return-measures={MEASURE_KEYS.join(",")} data-return-active={measures.join(",")}
      data-return-source={source ?? ""}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox"
        title="Which return to show — the methodology, or pick one or more explicitly. Every cell is labelled with the return it is showing."
        className="flex w-fit items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus">
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {/* RIGHT-ALIGNED PANEL, so it can never extend past the trigger's right
          edge into horizontal overflow. The picker was the last control on the
          filter row, so a `left-0` panel opened rightward and ran off the page —
          the family had to scroll sideways to read it. Anchored to the right, its
          22rem width grows leftward into the row it already occupies, and the
          `92vw` cap keeps it on screen at any width. (On the Portfolio Monitor it
          now sits after the axis control, with the two narrowing selectors at the
          row's right end — the panel still opens over the axis control, which is
          wider than the gap it needs.) */}
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[min(22rem,92vw)] overflow-hidden rounded-lg border border-ink-700 bg-ink-800 shadow-xl shadow-black/40" role="listbox" aria-multiselectable="true">
          <div className="border-b border-ink-700 px-3 py-1.5 text-[11px] text-slate-500">Pick the return to show. Each cell is labelled with it.</div>
          <ul className="max-h-80 overflow-auto py-1">
            {RETURN_MEASURES.map((m) => {
              const on = ticked(m.key);
              return (
                <li key={m.key} role="option" aria-selected={on} data-return-option={m.key}
                  onMouseDown={(e) => { e.preventDefault(); toggle(m.key); }}
                  className={`flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-ink-700/60 ${on ? "text-slate-100" : "text-slate-300"}`}>
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-champagne-500 bg-champagne-500/20 text-champagne-400" : "border-ink-600 text-transparent"}`}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium">{m.label}</span>
                      <span className="ret-tag">{m.tag}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{hints?.[m.key] ?? m.hint}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {/* WHERE THE PICK IS KEPT — a status, never a sentence (Stage 10cp). */}
          <div className="border-t border-ink-700 px-3 py-1.5 text-[11px] text-slate-500" data-return-kept>
            {source === "address" ? "Set by this link · a pick here is remembered" : "Remembered in this browser"}
          </div>
        </div>
      )}
    </div>
  );
}
