import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";

// Small controlled search box used above/inside any large holdings list.
// Mirrors the Portfolio Monitor filter so every list searches the same way.
//
// Pass `suggestions` (e.g. the security / entity names in the list) to turn it
// into a typeahead: matching options appear in a dropdown as you type, and
// picking one fills the box (which filters the list to that name). Without
// `suggestions` it behaves as a plain search input.
export function SearchInput({
  value, onChange, placeholder = "Search…", className = "w-64", suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  suggestions?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Close the dropdown on any click outside the widget.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const q = value.trim().toLowerCase();
  const matches = suggestions && q
    ? [...new Set(suggestions)].filter((s) => s.toLowerCase().includes(q)).slice(0, 8)
    : [];
  // Don't pop the menu for a query that already exactly equals its only match.
  const redundant = matches.length === 1 && matches[0].toLowerCase() === q;
  const showList = open && matches.length > 0 && !redundant;

  const choose = (s: string) => { onChange(s); setOpen(false); setActive(-1); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        className="w-full rounded-md border border-ink-700 bg-ink-800 py-2 pl-9 pr-3 text-sm text-slate-200 ring-focus"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border border-ink-700 bg-ink-800 py-1 shadow-xl shadow-black/50"
        >
          {matches.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer truncate px-3 py-1.5 text-sm ${i === active ? "bg-ink-700 text-slate-100" : "text-slate-300"}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
