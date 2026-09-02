import { ReactNode } from "react";

/**
 * THE HEADLINE IS ONE LINE, AND THAT IS A SPACE DECISION.
 *
 * The eyebrow used to sit on its own line above the title, so every page spent
 * two rows saying where it was before showing anything. On a dashboard whose
 * tables are the point — and which the family already asked to render denser
 * (see `--app-zoom` in index.css) — that is a row of vertical space bought back
 * on all 27 routes for nothing.
 *
 * `beside` is for a control that belongs WITH the title rather than opposite it:
 * the Portfolio Monitor's Holdings / Transactions switch is what the reader is
 * looking at, not an action on it, and putting it here retires a whole toolbar
 * row. `right` keeps its meaning — status and basis, hard against the far edge.
 *
 * The subtitle takes `w-full` so it wraps to its own line under both, which is
 * what a sentence needs and what a chip beside a heading must never do.
 */
export function PageHeader({ eyebrow, title, subtitle, beside, right }: {
  eyebrow?: string; title: string; subtitle?: ReactNode; beside?: ReactNode; right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {eyebrow && <span className="label-xs text-champagne-500">{eyebrow}</span>}
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h1>
        {beside}
      </div>
      {right}
      {subtitle && <p className="w-full max-w-2xl text-sm text-slate-400">{subtitle}</p>}
    </div>
  );
}
