import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sunrise, LineChart, Users, PieChart, Receipt,
  Activity, History, Lock, Table2, Calculator, Gauge,
  Cable, ChevronDown, Handshake,
} from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";

// Setup and admin routes carry no book dependency, so they stay reachable even
// before statements are ingested. Knowledge & Memory, Macro Research and Economy
// & Macro were the other three and have been removed at the family's request;
// their addresses now redirect, so they need no entry here.
//
// COMPARE COMPANIES has gone the same way, and with it the RESEARCH group: the
// headings below are derived from `group`, so a group whose last entry is
// removed disappears on its own rather than leaving an empty label — the same
// thing that happened to MONITOR at Stage 10y and KNOWLEDGE at Stage 10x. There
// is nothing to delete here beyond the row itself, which is why this is written
// down: a future session looking for the heading will not find one.
const ALWAYS_ACCESSIBLE = new Set(["/upload", "/history", "/audit", "/ledger"]);

// Drag-to-resize bounds for the left nav (px). Default 224 (14rem) keeps the
// Portfolio Monitor holdings table off a horizontal scrollbar at common laptop
// widths. The storage key is versioned so a returning user with an older saved
// width still picks up this narrower default (they can always drag it back).
const NAV_MIN = 200, NAV_MAX = 460, NAV_DEFAULT = 224;
const NAV_WIDTH_KEY = "glow:navWidth:v2";
const clampWidth = (w: number) => Math.max(NAV_MIN, Math.min(NAV_MAX, Math.round(w)));

/**
 * ── EXTRAS IS THE ONE COLLAPSIBLE GROUP ─────────────────────────────────────
 *
 * *"Move the following page buttons inside a drop down option in the left
 * navigation bar labelled as 'Extras' and after clicking on the drop down we
 * should be able to select any of these page buttons."* — Capital Gains & Tax,
 * NAV & Performance, Return & Drawdown and Ledger Insights, which were the
 * whole of the TAX and ANALYTICS groups.
 *
 * Both headings therefore disappear with their entries rather than being
 * deleted by hand: the headings below are DERIVED from `group`, so a group
 * whose last entry leaves stops rendering on its own. That is the same
 * mechanism that retired MONITOR at Stage 10y, KNOWLEDGE at 10x and RESEARCH
 * at 10ap, and it is why there is nothing to remove here beyond the rows.
 */
const EXTRAS = "Extras";
const EXTRAS_OPEN_KEY = "glow:navExtras:v1";

const NAV = [
  // ── DAILY, IN THE ORDER THE FAMILY ASKED FOR ────────────────────────────
  // *"change the hierarchy of these pages, Morning CIO then Portfolio Monitor
  // and then Private Market and then Polycab"*. Polycab led this group until
  // now, on an earlier request; it closes it instead. Nothing about the
  // ring-fence moves with it — the promoter holding is still kept out of every
  // other route's figures by `RINGFENCED_SECURITY_KEYS` in build-book.mjs, and
  // a nav position was never what enforced that.
  { to: "/cio", label: "Morning CIO", icon: Sunrise, group: "Daily" },
  { to: "/monitor", label: "Portfolio Monitor", icon: LineChart, group: "Daily" },
  { to: "/private-market", label: "Private Market", icon: Handshake, group: "Daily" },
  { to: "/polycab", label: "Polycab", icon: Cable, group: "Daily" },
  // EXPOSURE & IPS was REMOVED at the family's request. Its ALLOCATION group
  // survives with the other two entries, so — unlike MONITOR, KNOWLEDGE and
  // RESEARCH — there is no heading to go with it. See App.tsx for where the
  // address forwards and what became a no-caller.
  { to: "/family", label: "Family & Entities", icon: Users, group: "Allocation" },
  { to: "/sectors", label: "Sector Composition", icon: PieChart, group: "Allocation" },
  { to: "/capital-gains", label: "Capital Gains & Tax", icon: Receipt, group: EXTRAS },
  { to: "/performance", label: "NAV & Performance", icon: Activity, group: EXTRAS },
  { to: "/returns", label: "Return & Drawdown", icon: Gauge, group: EXTRAS },
  { to: "/ledger", label: "Ledger Insights", icon: Calculator, group: EXTRAS },
  // ── ADMIN CLOSES THE NAV, AND DATA AUDIT IS NOW IN IT ───────────────────
  // *"move data audit page at the bottom of the left navigation bar just above
  // upload page selection button rather than at the top"*. It was the only
  // entry in SETUP, so that heading goes with it by the same derivation as the
  // two above — a group label standing over nothing is the defect this repo
  // already records twice.
  { to: "/audit", label: "Data Audit", icon: Table2, group: "Admin" },
  { to: "/history", label: "Upload History", icon: History, group: "Admin" },
] as const;

/**
 * DERIVED, NEVER TYPED. The dropdown opens itself when the reader navigates to
 * a route inside it — otherwise someone landing on /performance from a link or
 * a bookmark sees no active entry anywhere in the nav, which reads as the page
 * having left the app. Reading the set off `NAV` means a fifth entry added to
 * Extras keeps that working with no second list to remember.
 */
// Widened to `string` deliberately: `NAV` is `as const`, so the inferred set
// would be a union of the four literals and `.has(pathname)` a type error.
const EXTRAS_PATHS: ReadonlySet<string> = new Set(NAV.filter((i) => i.group === EXTRAS).map((i) => i.to));

export function Sidebar() {
  const { portfolio, bookIsEmpty } = usePortfolio();
  // An empty book locks the analytics routes exactly as a missing one does:
  // there is nothing behind them but zeros until statements are ingested.
  const hasPortfolio = !!portfolio && !bookIsEmpty;

  /**
   * THE DROPDOWN IS SEEDED FROM THE ROUTE, NOT OPENED BY AN EFFECT AFTERWARDS.
   * A reader who lands directly on /performance would otherwise see the group
   * paint collapsed and then spring open — and, for that first frame, a nav
   * with no active entry in it. `pathname` is read before the initialiser runs,
   * so the first paint is already correct; the effect below only has to cover
   * navigating INTO the group later.
   *
   * Remembered per browser, exactly as the nav width beside it is, and for the
   * same reason: it is a per-reader convenience and nothing about the book.
   * A blocked or cleared store just means it opens on its own terms again.
   */
  const { pathname } = useLocation();
  const [extrasOpen, setExtrasOpen] = useState<boolean>(() => {
    try { if (window.localStorage.getItem(EXTRAS_OPEN_KEY) === "1") return true; } catch { /* private mode */ }
    return EXTRAS_PATHS.has(pathname);
  });
  useEffect(() => { if (EXTRAS_PATHS.has(pathname)) setExtrasOpen(true); }, [pathname]);
  useEffect(() => {
    try { window.localStorage.setItem(EXTRAS_OPEN_KEY, extrasOpen ? "1" : "0"); } catch { /* private mode */ }
  }, [extrasOpen]);

  const asideRef = useRef<HTMLElement>(null);
  const widthRef = useRef(NAV_DEFAULT);
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(typeof window !== "undefined" ? window.localStorage.getItem(NAV_WIDTH_KEY) : NaN);
    return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : NAV_DEFAULT;
  });
  widthRef.current = width;
  useEffect(() => {
    try { window.localStorage.setItem(NAV_WIDTH_KEY, String(width)); } catch { /* private mode */ }
  }, [width]);

  // Live-resize imperatively during the drag (no per-pixel React re-render), then
  // commit the final width to state on release so it persists across reloads.
  const startResize = useCallback(() => {
    const onMove = (ev: MouseEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0;
      const w = clampWidth(ev.clientX - left);
      widthRef.current = w;
      if (asideRef.current) asideRef.current.style.width = `${w}px`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth(widthRef.current);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  const onHandleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setWidth((w) => clampWidth(w - 16)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setWidth((w) => clampWidth(w + 16)); }
    else if (e.key === "Home") { e.preventDefault(); setWidth(NAV_DEFAULT); }
  };

  const groups = NAV.reduce<Record<string, typeof NAV[number][]>>((acc, item) => {
    (acc[item.group] = acc[item.group] || []).push(item);
    return acc;
  }, {});

  return (
    <aside ref={asideRef} style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-r border-ink-700 bg-ink-900">
      <div className="flex h-16 items-center gap-2.5 border-b border-ink-700 px-5">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-champagne-500 to-champagne-600 text-ink-950 shadow-glow">
          <span className="font-serif text-sm font-bold">G</span>
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight text-slate-100">Glow Ventures Family Office</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Investor Cockpit</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {Object.entries(groups).map(([group, items]) => {
          /**
           * ONE GROUP COLLAPSES AND THE REST DO NOT, and the heading is the
           * control rather than something beside it — a label that looks like
           * every other heading but is the only one that does anything is the
           * affordance problem Stage 10y fixed on the KPI tiles.
           *
           * `data-nav-group` / `data-nav-entry` / `aria-expanded` are what
           * `check:family` reads. The nav's ORDER and its GROUPING are the
           * whole of what the family asked for here, so asserting either on
           * rendered prose would be striking a structural claim on text a
           * redesign is free to reword — the rule `data-section`,
           * `data-mandate` and `data-movers-scope` already follow.
           */
          const collapsible = group === EXTRAS;
          const shown = !collapsible || extrasOpen;
          return (
          <div key={group} data-nav-group={group} className="mb-4">
            {collapsible ? (
              <button type="button" onClick={() => setExtrasOpen((o) => !o)}
                data-nav-group-toggle={group} aria-expanded={shown}
                title={shown ? `Hide ${group}` : `Show ${group}`}
                className="flex w-full items-center gap-1.5 rounded-md px-2.5 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 transition-colors hover:text-slate-400">
                <ChevronDown className={["h-3 w-3 shrink-0 transition-transform", shown ? "" : "-rotate-90"].join(" ")} />
                <span>{group}</span>
              </button>
            ) : (
              <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{group}</div>
            )}
            <ul className={["space-y-0.5", shown ? "" : "hidden"].join(" ")}>
              {items.map((item) => {
                const { to, label, icon: Icon } = item;
                // The PREVIEW badge went with the Family Dashboard, which was the
                // only entry that carried `preview: true`. Left in place it typed
                // `item.preview` as `unknown` — no member of the union declares
                // the field any more — so it is removed rather than cast away.
                // Reintroducing it means adding the flag back to NAV first.
                const locked = !hasPortfolio && !ALWAYS_ACCESSIBLE.has(to);
                return (
                  <li key={to}>
                    <NavLink to={to} data-nav-entry={to} title={locked ? "Ingest statements first" : label}
                      className={({ isActive }) => [
                        "group flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] transition-colors",
                        isActive ? "bg-ink-700/80 text-slate-100"
                          : locked ? "text-slate-600 hover:bg-ink-700/20"
                          : "text-slate-400 hover:bg-ink-700/40 hover:text-slate-200",
                      ].join(" ")}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{label}</span>
                      {locked && <Lock className="ml-auto h-3 w-3 shrink-0 text-slate-700" />}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </nav>
      <div className="border-t border-ink-700 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-ink-600 text-xs font-semibold text-slate-200">GV</div>
          <div className="leading-tight">
            <div className="text-xs font-medium text-slate-200">Glow Ventures Family Office</div>
            <div className="text-[10px] text-slate-500">Principal</div>
          </div>
        </div>
      </div>

      {/* Drag handle on the right border — resize the nav to give pages more room. */}
      <div
        role="separator" aria-orientation="vertical" tabIndex={0}
        aria-label="Resize navigation" aria-valuenow={width} aria-valuemin={NAV_MIN} aria-valuemax={NAV_MAX}
        title="Drag to resize · double-click to reset"
        onMouseDown={(e) => { e.preventDefault(); startResize(); }}
        onDoubleClick={() => setWidth(NAV_DEFAULT)}
        onKeyDown={onHandleKey}
        className="group absolute right-0 top-0 z-30 flex h-full w-2.5 cursor-col-resize justify-end focus:outline-none"
      >
        <span className="h-full w-0.5 bg-transparent transition-colors group-hover:bg-champagne-500/70 group-focus-visible:bg-champagne-500" />
      </div>
    </aside>
  );
}
