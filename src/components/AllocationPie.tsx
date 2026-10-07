import { useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

/**
 * ── THE ALLOCATION PIE (Stage 10dm) ─────────────────────────────────────────
 *
 * *"In the allocation by asset class and mandate in all the tabs replace bar
 * graph with pie chart."* One pie per axis — Category, Asset class, Basket —
 * with a legend beside it that is the same list the bars were: a swatch, the
 * section's name, its value and its weight of the book.
 *
 * EACH WEDGE AND EACH LEGEND ENTRY OPENS WHAT ITS ROW OPENS. A section built
 * from positions carries the same `href` its table row links to; a
 * fund-of-funds line carries none, and its wedge and its entry are not
 * clickable, exactly as its row is not a link (Stage 10o).
 *
 * A WEDGE IS ITS SHARE OF THE POSITIVE TOTAL, AND ONLY A POSITIVE SECTION HAS
 * ONE. A pie cannot draw a negative or a zero amount, so a section worth ₹0 (or
 * less, a cash payable) is listed in the legend with its own figure and draws no
 * wedge — its hover says so. The weight PRINTED is the table's (value ÷ the
 * book), so the figure a reader reads beside a wedge is the table's figure.
 *
 * Hand-drawn SVG rather than a chart library: every wedge carries its own
 * `data-alloc-wedge` / `data-href` / `data-alloc-share` so `check:pages` can
 * pair it with its row and check its angle, which a library's generated nodes
 * do not expose.
 */
export interface PieSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Where the slice opens — the row's own drill-down; null where the row is not a link. */
  href: string | null;
  /** The figure printed beside it. */
  valueText: string;
  /** The weight printed beside it (the table's), or the dash its row prints. */
  weightText: string;
  /** The hover on a clickable slice. */
  title?: string;
  /** The hover on a slice that opens nothing. */
  staticTitle?: string;
}

const SIZE = 184;
const R = 88;
const C = SIZE / 2;

function point(angle: number): [number, number] {
  return [C + R * Math.cos(angle), C + R * Math.sin(angle)];
}

export function AllocationPie({ slices, ariaLabel }: { slices: PieSlice[]; ariaLabel: string }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState<string | null>(null);
  const positive = slices.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = positive.reduce((a, s) => a + s.value, 0);

  let angle = -Math.PI / 2;
  const wedges = positive.map((s) => {
    const share = total > 0 ? s.value / total : 0;
    const a0 = angle;
    const a1 = angle + share * Math.PI * 2;
    angle = a1;
    return { s, share, a0, a1 };
  });

  const open = (href: string | null) => { if (href) navigate(href); };
  const onKey = (href: string | null) => (e: KeyboardEvent) => {
    if (href && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); navigate(href); }
  };

  return (
    <div className="mb-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center" data-alloc-pie>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-44 w-44 shrink-0" role="img" aria-label={ariaLabel}>
        {total <= 0 && (
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--chart-grid)" strokeWidth={2} />
        )}
        {wedges.map(({ s, share, a0, a1 }) => {
          const dim = hover != null && hover !== s.key;
          const common = {
            "data-alloc-wedge": s.key,
            "data-href": s.href ?? undefined,
            "data-alloc-share": share.toFixed(6),
            fill: s.color,
            stroke: "var(--chart-tooltip-bg)",
            strokeWidth: wedges.length > 1 ? 1.5 : 0,
            opacity: dim ? 0.45 : 1,
            style: { cursor: s.href ? "pointer" : "default", transition: "opacity 120ms" },
            role: s.href ? "link" : undefined,
            tabIndex: s.href ? 0 : undefined,
            "aria-label": `${s.label} · ${s.valueText} · ${s.weightText}`,
            onClick: () => open(s.href),
            onKeyDown: onKey(s.href),
            onMouseEnter: () => setHover(s.key),
            onMouseLeave: () => setHover(null),
          };
          const tip = <title>{`${s.label} · ${s.valueText} · ${s.weightText}`}</title>;
          // A single wedge that is the whole pie cannot be drawn as an arc — the
          // start and end points coincide — so it is a circle.
          if (share >= 0.999999) return <circle key={s.key} {...common} cx={C} cy={C} r={R}>{tip}</circle>;
          const [x0, y0] = point(a0);
          const [x1, y1] = point(a1);
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M ${C} ${C} L ${x0.toFixed(3)} ${y0.toFixed(3)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)} Z`;
          return <path key={s.key} {...common} d={d}>{tip}</path>;
        })}
      </svg>
      <div className="grid w-full min-w-0 flex-1 gap-1" data-alloc-slices>
        {slices.map((s) => {
          const drawn = Number.isFinite(s.value) && s.value > 0;
          const inner = (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color, opacity: drawn ? 1 : 0.35 }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{s.label}</span>
              <span className="mono w-24 shrink-0 text-right text-sm text-slate-200 whitespace-nowrap">{s.valueText}</span>
              <span className="w-14 shrink-0 text-right text-xs text-slate-400">{s.weightText}</span>
            </>
          );
          const noWedge = drawn ? "" : " · no wedge: a pie draws only a positive amount";
          const cls = `flex items-center gap-3 rounded px-1.5 py-1 transition-colors ${hover === s.key ? "bg-ink-700/40" : ""}`;
          return s.href ? (
            <Link key={s.key} data-alloc-slice={s.key} data-alloc-value={s.value} to={s.href}
              title={`${s.title ?? s.label}${noWedge}`}
              onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
              className={`${cls} hover:bg-ink-700/40 hover:text-champagne-400`}>
              {inner}
            </Link>
          ) : (
            <div key={s.key} data-alloc-slice={s.key} data-alloc-value={s.value} data-alloc-slice-static
              title={`${s.staticTitle ?? s.label}${noWedge}`}
              onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
              className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
