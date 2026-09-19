import { ReactNode } from "react";

function changeColor(n: number) { return n > 0 ? "text-gain" : n < 0 ? "text-loss" : "text-slate-400"; }

export function StatTile({ label, value, sub, delta, icon, hint }: {
  label: string; value: ReactNode; sub?: ReactNode;
  /**
   * The percentage arrow. NULL is accepted and renders NOTHING — a tile whose
   * figure the book does not carry must not show a "■ 0.00%" that reads as a
   * measured flat move.
   */
  delta?: number | null; icon?: ReactNode; hint?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="label-xs">{label}</div>
        {icon && <div className="text-slate-500">{icon}</div>}
      </div>
      {/* `data-stat-value` tells a tile carrying a FIGURE from one carrying an
          em dash, which are two different things wearing one layout: the first
          takes a short definition of the term under it, the second takes the
          REASON it is absent and the document that would fill it — which this
          book requires to be complete rather than brief. */}
      <div data-stat-value className="mt-3 text-2xl font-semibold text-slate-100 tabular tracking-tight">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {typeof delta === "number" && (
          <span className={`mono ${changeColor(delta)}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(delta).toFixed(2)}%
          </span>
        )}
        {sub && <span className="text-slate-400">{sub}</span>}
      </div>
      {/* THE DEFINITION UNDER A FIGURE, AND IT HAS TO BE READABLE.
          *"just tell what is it in short and legible font text."* At 11px in
          `slate-500` it was the least legible text on the page, under figures
          rendered at 22px — so a reader who asked what a term meant was sent to
          the one line hardest to read. 12.5px in `slate-400` is the sub-line’s
          own weight, which is what a definition of the figure above it should
          carry. Set HERE rather than per caller: every hint in this app is the
          same thing in the same place, and a size chosen per page is a size
          that drifts. */}
      {hint && <p className="mt-1.5 text-[12.5px] leading-snug text-slate-400" data-stat-hint>{hint}</p>}
    </div>
  );
}
