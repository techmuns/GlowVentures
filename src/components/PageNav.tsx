import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Home } from "lucide-react";

/** One segment of the trail. `to` makes it a link; the last segment never has one. */
export type CrumbStep = { label: string; to?: string };

/**
 * ── THE SAME THREE CONTROLS AND THE SAME CRUMB ON EVERY PAGE ────────────────
 *
 * *"add three small back reverse and home buttons on the top of every page. The
 * first line 'Morning CIO › What is Behind this Figure' should rather label the
 * page/KPI tile that we have opened — 'Morning CIO › Current Value of
 * Holding'. Remove 'Back to Morning CIO' and replace it with the three small
 * buttons. Follow this format for every single page that we Open."*
 *
 * THE CRUMB'S LAST SEGMENT NAMES WHAT WAS OPENED, NOT WHAT THE ROUTE IS.
 * `/holdings` serves eleven different sets — the value of the holdings, the
 * capital invested, one allocation row, the winners — and it read "What is
 * behind the figure" for every one of them, which is a description of the
 * ROUTE. A reader who clicked a tile and wants to know which tile they are
 * inside learnt nothing from it. `Drilldown.crumb` names the figure, so the
 * crumb says which of the eleven this is.
 *
 * AND IT REPLACES A LINK THAT ONLY WENT ONE WAY. "Back to Morning CIO" was a
 * hardcoded parent on four pages, so a reader who reached a company page from
 * Sector Composition was offered a link to the Portfolio Monitor. The browser's
 * own history knows where they came from and these three buttons are that
 * history: BACK and FORWARD walk it, HOME goes to the dashboard's front door.
 * The parent still shows — as the crumb's first segment, which is a statement
 * about where the page SITS rather than about where the reader was.
 *
 * ── FORWARD IS DISABLED ONLY WHERE THAT IS MEASURED ─────────────────────────
 *
 * A control that looks live and does nothing is the failure this repo keeps
 * naming, and at the end of the history stack FORWARD is exactly that. React
 * Router's history keeps its position in `window.history.state.idx`, so where
 * that is readable the button is disabled once nothing lies ahead — and where
 * it is not (a page entered outside the router), both stay live rather than
 * being greyed out on a guess. BACK is never disabled: `idx === 0` still has
 * whatever the tab held before the app, and leaving the app is what the
 * browser's own back button does there too.
 */
export function PageNav({ trail, className = "" }: { trail: CrumbStep[]; className?: string }) {
  const navigate = useNavigate();
  const loc = useLocation();
  // Re-read on every navigation: `idx` moves with each push and pop, and this
  // header stays mounted when only the search params change.
  const canForward = useMemo(() => {
    const i = histIdx();
    return i == null || i < window.history.length - 1;
  }, [loc.key]);

  const btn = "grid h-6 w-6 place-items-center rounded-md border border-ink-700 bg-ink-800/60 text-slate-400 ring-focus transition-colors";
  const live = `${btn} hover:bg-ink-700/60 hover:text-slate-200`;

  return (
    <div data-page-nav className={`flex w-full flex-wrap items-center gap-x-2.5 gap-y-1.5 ${className}`}>
      <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
        <button type="button" data-page-nav-back onClick={() => navigate(-1)}
          title="Back — the page you came from" aria-label="Back" className={live}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" data-page-nav-forward onClick={() => navigate(1)}
          disabled={!canForward} aria-label="Forward"
          title={canForward ? "Forward" : "Forward — nothing ahead in this session"}
          className={canForward ? live : `${btn} cursor-not-allowed text-slate-700`}>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        {/* HOME IS AN ANCHOR, and the other two cannot be: a history step has no
            address. It points at `/` rather than `/cio` because `RootRedirect`
            is the one place that knows whether the book is empty — hardcoding
            the cockpit here would land an unfed book on a gated page. */}
        <Link to="/" data-page-nav-home title="Home — the dashboard" aria-label="Home" className={live}>
          <Home className="h-3.5 w-3.5" />
        </Link>
      </div>
      {/* THE LEAF READS BRIGHTER THAN ITS PARENTS, so the line says which of
          its segments is the page you are on without needing a marker. A
          linked parent is champagne — the colour every other link in this app
          uses — and an unlinked one is dimmer still: a nav GROUP has no
          address, and styling it like a link would offer a click that does
          nothing, which is the control-that-looks-alive failure. */}
      <nav aria-label="Breadcrumb" data-page-crumb className="min-w-0 text-[12px]">
        {trail.map((step, i) => (
          <span key={`${step.label}-${i}`} data-crumb-step={i === trail.length - 1 ? "leaf" : "parent"}>
            {i > 0 && <span className="mx-1.5 text-slate-600">›</span>}
            {step.to
              ? <Link to={step.to} className="text-champagne-400 hover:underline">{step.label}</Link>
              : <span className={i === trail.length - 1 ? "text-slate-300" : "text-slate-500"}>{step.label}</span>}
          </span>
        ))}
      </nav>
    </div>
  );
}

/**
 * Where this session sits in the history stack, or `null` where the router's
 * own state is not there to read. Never `0` by default: a missing index and a
 * first entry are different facts, and only one of them licenses a verdict
 * about what lies ahead.
 */
function histIdx(): number | null {
  try {
    const i = (window.history.state as { idx?: unknown } | null)?.idx;
    return typeof i === "number" ? i : null;
  } catch {
    return null;
  }
}
