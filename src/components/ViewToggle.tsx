import { ComponentType, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// Segmented control for pages that carry several views behind one route.
// The active view lives in the URL (`?view=…`) so a segment can be bookmarked,
// deep-linked and shared — and the browser's back button steps between segments.
//
// Used by the consolidated pages (Private Markets, Allocation, Performance,
// Data & Audit) so every one of them behaves the same way.

export type ViewDef<K extends string> = {
  key: K;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Optional tooltip — say what the segment answers, not what it contains. */
  title?: string;
};

/**
 * Reads/writes the active view from the `?view=` search param.
 * Falls back to the first view when the param is absent or unrecognised, so a
 * stale bookmark degrades to the page's default rather than a blank screen.
 */
export function useViewParam<K extends string>(
  views: readonly ViewDef<K>[],
  /** Retired view keys mapped to their replacement, so old links keep landing. */
  aliases: Partial<Record<string, K>> = {},
  param = "view",
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(param);
  const resolved = raw && aliases[raw] ? aliases[raw] : raw;
  const active = views.find((v) => v.key === resolved)?.key ?? views[0].key;

  const setView = useCallback((key: K) => {
    const next = new URLSearchParams(searchParams);
    // The default view stays param-free, so `/private` and `/private?view=overview`
    // don't become two URLs for the same screen.
    if (key === views[0].key) next.delete(param);
    else next.set(param, key);
    // Push (not replace) so Back returns to the segment the user came from.
    setSearchParams(next);
  }, [searchParams, setSearchParams, views, param]);

  return [active, setView] as const;
}

export function ViewToggle<K extends string>({ views, active, onChange, right }: {
  views: readonly ViewDef<K>[];
  active: K;
  onChange: (key: K) => void;
  /** Optional controls pinned to the right of the toggle row. */
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div role="tablist" className="inline-flex w-fit flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
        {views.map(({ key, label, icon: Icon, title }) => (
          <button key={key} type="button" role="tab" aria-selected={active === key} title={title}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active === key
                ? "bg-champagne-500 text-ink-950 shadow-glow"
                : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
            }`}>
            {Icon && <Icon className="h-4 w-4" />}
            {label}
          </button>
        ))}
      </div>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
