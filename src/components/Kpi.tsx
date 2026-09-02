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
   * ── THE WHOLE TILE IS THE TARGET ─────────────────────────────────────────
   *
   * *"there are multiple links on these KPI tiles. Make these KPI tiles
   * clickable and remove all the other links."* It used to be on the LABEL
   * alone, with the caption underneath carrying links of its own to other
   * pages — so one tile offered two or three destinations and the largest
   * click target on it, the figure itself, went nowhere.
   *
   * IT IS A STRETCHED OVERLAY, NOT A WRAPPER, and that is not decoration. The
   * value carries an `<Auditable>` popover, which is a `<button>`; a button
   * inside an anchor is invalid markup and browsers disagree about which of the
   * two interactions survives. So the anchor is an absolutely-positioned
   * sibling covering the card, and the interactive children sit above it —
   * the arithmetic stays clickable where it is, the rest of the tile navigates,
   * and the markup stays valid.
   */
  href?: string;
  /** What the reader will find there. Required in spirit whenever `href` is set. */
  hrefTitle?: string;
}) {
  return (
    <div className={`card relative p-4${href ? " transition-colors hover:border-champagne-500/40" : ""}`}>
      {href && (
        <Link to={href} title={hrefTitle} aria-label={`${label} — open the holdings behind it`}
          className="absolute inset-0 z-0 rounded-xl ring-focus" />
      )}
      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
        <div className="label-xs">
          {href ? (
            <span className="group inline-flex items-center gap-1">
              <span className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px]">{label}</span>
              <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-600" />
            </span>
          ) : label}
        </div>
        {icon && <div className="shrink-0 text-slate-500">{icon}</div>}
      </div>
      {/* `relative z-10` LIFTS THE FIGURE ABOVE THE OVERLAY so its popover still
          opens; `pointer-events-none` on the wrappers lets a click anywhere else
          fall through to the anchor beneath. The popover's own trigger re-enables
          them on itself. */}
      <div className="relative z-10 mt-2.5 w-fit max-w-full whitespace-nowrap text-[19px] font-semibold tracking-tight text-slate-100 tabular">{value}</div>
      <div className="pointer-events-none relative z-10 mt-1.5 flex items-center gap-2 text-[11px]">
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
