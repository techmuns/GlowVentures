import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PageNav, type CrumbStep } from "@/components/PageNav";
import { navEntry } from "@/lib/nav";

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
 * THE SUBTITLE IS THE TITLE'S HOVER (Stage 10cp). It was a sentence on its own
 * line under the headline on seven pages — "Time-weighted returns as each
 * manager publishes them…", "Provenance and status of the ingested book…" —
 * and the family asked for every such line to go. A string, for the same
 * reason `Card`'s is.
 *
 * ── AND THE EYEBROW IS NOW THE CRUMB, NOT A SECOND LABEL BESIDE IT ──────────
 *
 * *"add three small back reverse and home buttons on the top of every page …
 * Follow this format for every single page that we Open."* So `PageNav` sits
 * above the headline on every route, and the eyebrow moved INTO it as the
 * crumb's parent segment rather than being rendered twice: the eyebrow's whole
 * job was to say where the reader is, and the crumb does that job with a link
 * in it. Two renderings of one fact on adjacent lines is what this file's own
 * rules forbid everywhere else.
 *
 * ITS PARENT SEGMENT COMES FROM `NAV`, WHICH IS WHY THE PROP IS A FALLBACK.
 * Four pages had been passing an eyebrow that named a group they had since
 * left — "Setup" for Data Audit, which the nav puts under Admin; "Analytics"
 * and "Tax & Income" for the four pages the family moved into Extras. A string
 * typed per page is free to drift from the nav beside it, and a crumb built on
 * one would have put that contradiction on screen. `eyebrow` is read only for a
 * page the nav does not list, which today is `/upload` alone.
 */
export function PageHeader({ eyebrow, title, subtitle, beside, right, trail }: {
  eyebrow?: string; title: string; subtitle?: string; beside?: ReactNode; right?: ReactNode;
  /**
   * An explicit trail, for a page opened INTO rather than navigated to — where
   * the last segment names the figure or the holding, not the route. Given one,
   * neither `NAV` nor `eyebrow` is consulted.
   */
  trail?: CrumbStep[];
}) {
  const { pathname } = useLocation();
  const entry = navEntry(pathname);
  // A GROUP IS NOT A PAGE, so the parent segment carries no link: "Daily" and
  // "Extras" are headings in the sidebar and have no address of their own.
  const steps: CrumbStep[] = trail
    ?? (entry ? [{ label: entry.group }, { label: entry.label }]
      : eyebrow ? [{ label: eyebrow }, { label: title }]
        : [{ label: title }]);

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <PageNav trail={steps} />
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h1 className="font-display text-xl font-bold tracking-tight text-slate-100" title={subtitle || undefined}>{title}</h1>
        {beside}
      </div>
      {right}
    </div>
  );
}
