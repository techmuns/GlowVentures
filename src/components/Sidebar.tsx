import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Sunrise, LineChart, Users, PieChart, Receipt,
  Landmark, FolderOpen, Activity, Newspaper, History, Lock, Table2, Calculator, Gauge,
} from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";

const ALWAYS_ACCESSIBLE = new Set(["/upload", "/history", "/audit", "/ledger"]);

// Drag-to-resize bounds for the left nav (px). Default 224 (14rem) keeps the
// Portfolio Monitor holdings table off a horizontal scrollbar at common laptop
// widths. The storage key is versioned so a returning user with an older saved
// width still picks up this narrower default (they can always drag it back).
const NAV_MIN = 200, NAV_MAX = 460, NAV_DEFAULT = 224;
const NAV_WIDTH_KEY = "glow:navWidth:v2";
const clampWidth = (w: number) => Math.max(NAV_MIN, Math.min(NAV_MAX, Math.round(w)));

const NAV = [
  { to: "/audit", label: "Data Audit", icon: Table2, group: "Setup" },
  { to: "/cio", label: "Morning CIO", icon: Sunrise, group: "Daily" },
  { to: "/monitor", label: "Portfolio Monitor", icon: LineChart, group: "Daily" },
  { to: "/news", label: "News & Announcements", icon: Newspaper, group: "Daily" },
  { to: "/family", label: "Family & Entities", icon: Users, group: "Allocation" },
  { to: "/sectors", label: "Sector Composition", icon: PieChart, group: "Allocation" },
  { to: "/capital-gains", label: "Capital Gains & Tax", icon: Receipt, group: "Tax" },
  { to: "/private", label: "Private Markets", icon: Landmark, group: "Private Markets" },
  { to: "/data-bank", label: "Data Bank", icon: FolderOpen, group: "Private Markets" },
  { to: "/performance", label: "NAV & Performance", icon: Activity, group: "Analytics" },
  { to: "/returns", label: "Return & Drawdown", icon: Gauge, group: "Analytics" },
  { to: "/ledger", label: "Ledger Insights", icon: Calculator, group: "Analytics" },
  { to: "/history", label: "Upload History", icon: History, group: "Admin" },
] as const;

export function Sidebar() {
  const { portfolio, bookIsEmpty } = usePortfolio();
  // An empty book locks the analytics routes exactly as a missing one does:
  // there is nothing behind them but zeros until statements are ingested.
  const hasPortfolio = !!portfolio && !bookIsEmpty;

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
      className="relative flex h-screen shrink-0 flex-col border-r border-ink-700 bg-ink-900">
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
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-4">
            <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{group}</div>
            <ul className="space-y-0.5">
              {items.map(({ to, label, icon: Icon }) => {
                const locked = !hasPortfolio && !ALWAYS_ACCESSIBLE.has(to);
                return (
                  <li key={to}>
                    <NavLink to={to} title={locked ? "Ingest statements first" : label}
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
        ))}
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
