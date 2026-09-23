import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Check } from "lucide-react";
import { RETURN_MEASURES, returnMeasureDef, isReturnMeasure, type ReturnMeasure } from "@/lib/analytics";

// ── THE RETURN-METHODOLOGY PICKER, SHARED ───────────────────────────────────
//
// It was private to the Portfolio Monitor. The family then asked for it on the
// Private Market fund table too — *"The customer is confused about what kind of
// return this is"* — and a second copy of a control is a second chance for one
// page to offer a measure the other words differently. So this is the ONE
// picker, and its state lives in the URL (`?ret=`) on whichever page it sits.
//
// WHAT A PAGE MAY OVERRIDE IS THE HINT, AND ONLY WHERE THE MONITOR'S WORDING IS
// FALSE OF IT. The XIRR hint says the statements "do not carry per holding"
// each tranche's date and amount — true of a share in a demat, and false of a
// drawdown fund, whose capital account prints every dated call since its
// first. Private Market passes its own sentence for exactly the measures where
// that is so; the labels, tags, order and mutual exclusion stay one definition.

/** The picker's option keys, in reading order — `auto` first. */
export const MEASURE_KEYS = RETURN_MEASURES.map((m) => m.key);

/**
 * WHICH RETURN(S) THE ONE RETURN COLUMN SHOWS — held in the URL (`?ret=`) like
 * every other view on the page it sits on, so "send me the CAGR view" is a link.
 *
 * `auto` is the methodology and the param-free default, so `/monitor` stays one
 * URL — and `/private-market` likewise. It is MUTUALLY EXCLUSIVE with the concrete measures: picking Absolute or
 * CAGR means "show me that one", not "that one on top of the rule", so a concrete
 * selection replaces auto and clearing everything falls back to it. The concrete
 * measures multi-select — the family can pin Absolute AND CAGR side by side, each
 * labelled, which is the "always have a CAGR column" ask answered without a
 * second column.
 */
export function useReturnMeasures(): [ReturnMeasure[], (next: ReturnMeasure[]) => void] {
  const [sp, setSp] = useSearchParams();
  const set = new Set((sp.get("ret") ?? "").split(",").map((s) => s.trim()).filter(isReturnMeasure));
  // Concrete measures win over auto, in canonical order; empty → auto.
  const concrete = MEASURE_KEYS.filter((k) => k !== "auto" && set.has(k));
  const measures = concrete.length ? concrete : (["auto"] as ReturnMeasure[]);
  const setMeasures = useCallback((next: ReturnMeasure[]) => {
    const clean = MEASURE_KEYS.filter((k) => k !== "auto" && next.includes(k));
    const nextSp = new URLSearchParams(sp);
    if (clean.length === 0) nextSp.delete("ret");
    else nextSp.set("ret", clean.join(","));
    setSp(nextSp);
  }, [sp, setSp]);
  return [measures, setMeasures];
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
export function ReturnMeasureSelect({ measures, onChange, hints }: {
  measures: ReturnMeasure[];
  onChange: (m: ReturnMeasure[]) => void;
  /** Per-measure hint text where this page's truth differs from the Monitor's. */
  hints?: Partial<Record<ReturnMeasure, string>>;
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
  const label = isAuto ? "Return · by methodology"
    : measures.length === 1 ? returnMeasureDef(measures[0]).label
    : `${measures.length} return types`;
  return (
    <div ref={wrapRef} className="relative"
      data-return-measures={MEASURE_KEYS.join(",")} data-return-active={measures.join(",")}>
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
                <li key={m.key} role="option" aria-selected={on}
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
        </div>
      )}
    </div>
  );
}
