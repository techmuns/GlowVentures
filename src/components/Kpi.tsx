import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

// Compact KPI tile — like StatTile but a touch smaller and non-wrapping, so several
// fit across a strip inside the app frame (with the left nav) without the value
// breaking onto two lines. Used by the CIO cockpit and the Stock Info page.
export function Kpi({ label, value, sub, delta, icon, href, hrefTitle }: {
  label: string; value: ReactNode; sub?: ReactNode;
  /**
   * The percentage arrow. NULL renders nothing at all — a tile whose figure the
   * book does not carry must not show "■ 0.0%", which reads as a measured flat.
   */
  delta?: number | null; icon?: ReactNode;
  /**
   * WHERE THE HOLDINGS BEHIND THIS FIGURE ARE — the drill-down the family asked
   * for. Optional, because a tile whose set has no address must not pretend to
   * one: a link that opens a page which can only be empty is worse than no link.
   *
   * IT IS ON THE LABEL, NOT ON THE TILE. The value carries an `<Auditable>`
   * popover on most of these tiles, and a button inside an anchor is invalid
   * markup that swallows one of the two interactions depending on the browser —
   * so the arithmetic stays clickable where it is and the label carries the
   * navigation. The label TEXT is unchanged, which also keeps every `check:pages`
   * invariant that reads a tile by its label still able to find it.
   */
  href?: string;
  /** What the reader will find there. Required in spirit whenever `href` is set. */
  hrefTitle?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="label-xs">
          {href ? (
            <Link to={href} title={hrefTitle}
              className="group inline-flex items-center gap-1 transition-colors hover:text-champagne-400">
              <span className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] group-hover:decoration-champagne-500">{label}</span>
              <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-600 transition-colors group-hover:text-champagne-500" />
            </Link>
          ) : label}
        </div>
        {icon && <div className="shrink-0 text-slate-500">{icon}</div>}
      </div>
      <div className="mt-2.5 whitespace-nowrap text-[19px] font-semibold tracking-tight text-slate-100 tabular">{value}</div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        {typeof delta === "number" && (
          <span className={`mono ${delta > 0 ? "text-gain" : delta < 0 ? "text-loss" : "text-slate-400"}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}
