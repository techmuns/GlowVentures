import { ReactNode } from "react";

function changeColor(n: number) { return n > 0 ? "text-gain" : n < 0 ? "text-loss" : "text-slate-400"; }

export function StatTile({ label, value, sub, delta, icon, hint, action, title, className = "" }: {
  /**
   * NORMALLY A STRING, and a node where the tile's own label is a CONTROL —
   * `SelectableTiles` renders its metric picker here, because the label is where a
   * reader already looks to see which metric they are reading and a picker
   * tucked into a corner is invisible on a touch screen.
   */
  label: ReactNode; value: ReactNode; sub?: ReactNode;
  /**
   * The percentage arrow. NULL is accepted and renders NOTHING — a tile whose
   * figure the book does not carry must not show a "■ 0.00%" that reads as a
   * measured flat move.
   */
  delta?: number | null; icon?: ReactNode;
  /**
   * WHAT THE FIGURE IS, ON HOVER — never a paragraph under it (Stage 10cp).
   * *"We have such random one-liners, two-liners, and footnotes everywhere
   * across the product … no one is genuinely reading them."* It was a visible
   * 12.5px line; it is folded into the tile's own `title` now, after `title`,
   * so every tile in the app sheds it at once rather than page by page. A
   * qualifier a reader must SEE — a coverage, a "not annualised" — is the
   * tile's `sub`, never this. A string, because a hover can carry nothing else.
   */
  hint?: string;
  /** Controls that act on the TILE rather than on its figure — remove it. Adding is the ADD TILE card's. */
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
    <div className={`card p-5 ${className}`} title={[title, hint].filter((x) => x && x.trim()).join("\n\n") || undefined}>
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
      <div data-stat-value className="mt-3 font-display text-2xl font-bold text-slate-100 tabular tracking-tight">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {typeof delta === "number" && (
          <span className={`mono ${changeColor(delta)}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(delta).toFixed(2)}%
          </span>
        )}
        {/* `data-stat-sub` so a claim about the ONE short line under a figure
            is struck on that line rather than on the tile's words. */}
        {/* 13px in `slate-300`: *"the small text below the KPI tile … is not
            legible at all."* It was 12px in `slate-400` — the palest, smallest
            text on the card, under a 24px figure. A line worth keeping is worth
            reading, and a line not worth reading is removed by its caller. */}
        {sub && <span className="text-[13px] leading-snug text-slate-300" data-stat-sub>{sub}</span>}
      </div>
      {/* NO LINE UNDER THE SUB (Stage 10cp). The 12.5px definition that sat
          here — "just tell what is it in short and legible font text" (Stage
          10be) — went when the family asked for every explainer line to go;
          it is the tile's hover now, and `data-stat-hint` is counted ABSENT on
          every route so it cannot quietly come back. */}
    </div>
  );
}
