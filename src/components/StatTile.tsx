import { ReactNode } from "react";

function changeColor(n: number) { return n > 0 ? "text-gain" : n < 0 ? "text-loss" : "text-slate-400"; }

export function StatTile({ label, value, sub, delta, icon, hint, action, title, className = "" }: {
  /**
   * NORMALLY A STRING, and a node where the tile's own label is a CONTROL —
   * `SelectableTiles` renders a `<select>` here, because the label is where a
   * reader already looks to see which metric they are reading and a picker
   * tucked into a corner is invisible on a touch screen.
   */
  label: ReactNode; value: ReactNode; sub?: ReactNode;
  /**
   * The percentage arrow. NULL is accepted and renders NOTHING — a tile whose
   * figure the book does not carry must not show a "■ 0.00%" that reads as a
   * measured flat move.
   */
  delta?: number | null; icon?: ReactNode; hint?: ReactNode;
  /** Controls that act on the TILE rather than on its figure — remove, add. */
  action?: ReactNode;
  /**
   * THE DETAIL BEHIND THE FIGURE, ON HOVER. A tile is a figure and one short
   * line — *"No one will read this on the dashboard; it needs to be absolutely
   * simple and clear"* — so the coverage and the working a reader might want
   * ride here, where they cost the tile nothing. A hover is weaker than a
   * caption and that is the trade the family asked for.
   */
  title?: string;
  className?: string;
}) {
  return (
    <div className={`card p-5 ${className}`} title={title}>
      <div className="flex items-start justify-between gap-2">
        {/* `flex-1`, NOT just `min-w-0`. Sized to its content, Chromium measured
            a label that is a CONTROL (the tile picker's button) short of its own
            text and cut "PRIVATE MARKET VALUE" to "PRIVATE MARKET VAL…" with a
            third of the header row empty beside it. Taking the free width means
            a label is only ever cut when there is genuinely no room. */}
        <div className="label-xs min-w-0 flex-1">{label}</div>
        <div className="flex shrink-0 items-start gap-1.5">
          {action}
          {icon && <div className="text-slate-500">{icon}</div>}
        </div>
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
        {/* `data-stat-sub` so a claim about the ONE short line under a figure
            is struck on that line rather than on the tile's words. */}
        {sub && <span className="text-slate-400" data-stat-sub>{sub}</span>}
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
