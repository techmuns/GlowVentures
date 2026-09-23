import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

// A click-to-open, multi-select dropdown filter. Unlike SearchInput (which only
// reveals options once you type), the full option list is shown the moment you
// click, and you can tick several at once. Selection is controlled by the parent
// (a Set of the chosen option strings) so one instance can drive several views.
export function MultiSelectFilter({
  options,
  selected,
  onChange,
  allLabel = "All",
  unit = "selected",
  placeholder = "Search…",
  className = "w-72",
  dense = false,
  render,
  emptyNote,
}: {
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  allLabel?: string;        // trigger text when nothing is selected
  unit?: string;            // e.g. "holdings" → "3 holdings"
  placeholder?: string;     // search box placeholder
  className?: string;
  /** Tighter type and padding, to sit in a dense filter bar. */
  dense?: boolean;
  // How to DISPLAY an option, where the stored value is not the readable one.
  // The economic calendar stores ISO country codes ("IN") and must show
  // "India"; searching still runs over both, so typing either finds the row.
  render?: (option: string) => string;
  /**
   * What ELSE to say when a search matches no option — for a caller that can
   * explain the absence. The Portfolio Monitor's holdings list uses it to name
   * a holding the family's own review carries that no statement in this book
   * reports; every other caller passes nothing and keeps the plain line.
   */
  emptyNote?: (query: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const show = useMemo(() => render ?? ((o: string) => o), [render]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Matched against BOTH the stored value and its label — a reader typing
    // "India" and a reader typing "IN" must both find it.
    return s ? options.filter((o) => o.toLowerCase().includes(s) || show(o).toLowerCase().includes(s)) : options;
  }, [options, q, show]);

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange(next);
  };
  const clearAll = () => onChange(new Set());

  const count = selected.size;
  const label = count === 0 ? allLabel : count === 1 ? show([...selected][0]) : `${count} ${unit}`;
  /**
   * THE NOUN FOR THE OPTION LIST, taken from `unit` — which every caller passes
   * as a plural ("holdings", "countries", "categories").
   *
   * The empty-search line hardcoded "companies", so the economic calendar's
   * country filter rendered "No companies match" over a list of COUNTRIES: one
   * caller's vocabulary asserted at every other caller. `unit`'s own default is
   * the count's word ("3 selected"), which is not a noun for a list, so that
   * one case falls back to a neutral one rather than reading "No selected match".
   */
  const noun = unit === "selected" ? "options" : unit;

  return (
    /* STRUCTURAL HANDLES, so a claim about this control is not struck on prose.
       `data-multiselect` is the control's own "all" label, `data-option` each
       offered value — which is what lets a sweep assert that a company only a
       fund holds is OFFERED here at all, the half of the family's ask that no
       figure on the page can see. */
    <div ref={wrapRef} className={`relative ${className}`} data-multiselect={allLabel}>
      <button
        type="button"
        data-multiselect-toggle={allLabel}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex w-full items-center gap-2 rounded-md border border-ink-700 bg-ink-800 ring-focus ${dense ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
      >
        <Search className={`shrink-0 text-slate-500 ${dense ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
        <span className={`truncate ${count === 0 ? "text-slate-400" : "text-slate-100"}`}>{label}</span>
        <span className="ml-auto flex items-center gap-1">
          {count > 0 && (
            <span
              role="button"
              tabIndex={0}
              title="Clear selection"
              onClick={(e) => { e.stopPropagation(); clearAll(); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); clearAll(); } }}
              className="grid h-5 w-5 place-items-center rounded text-slate-500 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-[min(24rem,92vw)] overflow-hidden rounded-lg border border-ink-700 bg-ink-800 shadow-xl shadow-black/40">
          <div className="border-b border-ink-700 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                autoFocus
                className="w-full rounded-md border border-ink-700 bg-ink-900 py-1.5 pl-8 pr-3 text-sm text-slate-200 ring-focus"
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px]">
            <span className="text-slate-500">{count} of {options.length} selected</span>
            {count > 0
              ? <button onClick={clearAll} className="font-medium text-champagne-400 hover:underline">Clear all</button>
              : <span className="text-slate-600">Pick one or more</span>}
          </div>
          <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-auto border-t border-ink-700 py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">
                No {noun} match “{q}”.
                {/* AND WHERE THE BOOK KNOWS WHY, IT SAYS SO. An empty result and
                    a defect look identical, which is how a search for BSE read
                    as the dashboard having lost a holding. `emptyNote` renders
                    nothing when the caller has no answer, so a plain typo still
                    gets the plain line above and nothing more. */}
                {emptyNote?.(q)}
              </li>
            )}
            {filtered.map((o) => {
              const on = selected.has(o);
              return (
                <li
                  key={o}
                  role="option"
                  data-option={o}
                  aria-selected={on}
                  onMouseDown={(e) => { e.preventDefault(); toggle(o); }}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-ink-700/60 ${on ? "text-slate-100" : "text-slate-300"}`}
                >
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-champagne-500 bg-champagne-500/20 text-champagne-400" : "border-ink-600 text-transparent"}`}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="truncate">{show(o)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
