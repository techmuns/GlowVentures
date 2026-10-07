import { useCallback, type CSSProperties, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AllocationPie, type PieSlice } from "@/components/AllocationPie";

/**
 * ── ONE ALLOCATION, THREE WAYS TO DRAW IT ───────────────────────────────────
 *
 *   *"instead of removing the bar graphs just give a view selector for the user
 *    then he can simply select whether he wants to see all the view as a bar
 *    graph or a pie chart or any other suitable view."*
 *
 * Pie, bars and a treemap are three drawings of the SAME slices — the rows of
 * the allocation table under them, with the same value, the same weight and the
 * same drill-down each row opens. None of them computes anything of its own,
 * which is what lets the reader switch freely: a figure cannot change with the
 * picture.
 *
 * THE PICK IS AN ADDRESS (`?chart=`) AND IS REMEMBERED PER BROWSER, like a
 * reader's column order (Stage 10cs). The address wins, then the saved pick,
 * then the pie — the view this card has drawn by default since the family asked
 * for it.
 */
export type AllocChartView = "pie" | "bar" | "treemap";

export const ALLOC_CHART_VIEWS: readonly { key: AllocChartView; label: string; title: string }[] = [
  { key: "pie", label: "Pie", title: "Each wedge is a section's share of the value" },
  { key: "bar", label: "Bars", title: "One bar per section, scaled to the largest" },
  { key: "treemap", label: "Treemap", title: "Each tile's area is a section's share of the value" },
];

const STORE_KEY = "glow:allocChart:v1";
const isView = (v: string | null | undefined): v is AllocChartView => !!v && ALLOC_CHART_VIEWS.some((x) => x.key === v);

function readSaved(): AllocChartView | null {
  try { const v = window.localStorage.getItem(STORE_KEY); return isView(v) ? v : null; } catch { return null; }
}

export function useAllocChartView() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("chart");
  const active: AllocChartView = isView(raw) ? raw : readSaved() ?? "pie";
  const set = useCallback((v: AllocChartView) => {
    try { window.localStorage.setItem(STORE_KEY, v); } catch { /* a blocked store keeps the pick in the address only */ }
    const next = new URLSearchParams(sp);
    next.delete("chart");
    setSp(next, { replace: true });
  }, [sp, setSp]);
  return [active, set] as const;
}

export function AllocChartPicker({ active, onChange }: { active: AllocChartView; onChange: (v: AllocChartView) => void }) {
  return (
    <div className="inline-flex rounded-md border border-ink-700 p-0.5" role="tablist" aria-label="Chart view" data-alloc-chart-picker>
      {ALLOC_CHART_VIEWS.map((v) => (
        <button key={v.key} type="button" role="tab" aria-selected={active === v.key} title={v.title}
          data-alloc-chart-view={v.key} data-active={active === v.key ? "" : undefined}
          onClick={() => onChange(v.key)}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${active === v.key ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
          {v.label}
        </button>
      ))}
    </div>
  );
}

/** A slice as a link where its row is one, and as plain text where it is not. */
function SliceLink({ s, className, children, attr, style }: { s: PieSlice; className: string; children: ReactNode; attr: Record<string, string>; style?: CSSProperties }) {
  return s.href
    ? <Link to={s.href} title={s.title} className={className} style={style} {...attr}>{children}</Link>
    : <div title={s.staticTitle} className={className} style={style} {...attr} data-alloc-static="">{children}</div>;
}

/** The bar chart this card drew before the pie — each bar scaled to the largest. */
export function AllocationBars({ slices }: { slices: PieSlice[] }) {
  const max = Math.max(0, ...slices.map((s) => s.value));
  // A bar is a length, so a section worth nothing — or a payable, below zero —
  // draws none rather than a negative width; its figure is beside it.
  const barWidth = (v: number) => (max > 0 && v > 0 ? (v / max) * 100 : 0);
  return (
    <div className="mb-5 flex flex-col gap-2" data-alloc-bars>
      {slices.map((s) => (
        <SliceLink key={s.key} s={s} attr={{ "data-alloc-bar": s.key, "data-alloc-value": String(s.value) }}
          className="flex items-center gap-3 rounded px-1 py-1 transition-colors hover:bg-ink-700/40 hover:text-champagne-400">
          <span className="flex min-w-[11rem] max-w-[11rem] items-center gap-2 text-sm font-medium text-slate-100">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="truncate">{s.label}</span>
          </span>
          <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(148,163,184,0.16)" }}>
            <span className="absolute inset-y-0 left-0 rounded-full" data-alloc-bar-width={barWidth(s.value)}
              style={{ width: `${barWidth(s.value)}%`, background: s.color }} />
          </span>
          <span className="mono w-24 shrink-0 text-right text-sm text-slate-200 whitespace-nowrap">{s.valueText}</span>
          <span className="w-14 shrink-0 text-right text-xs text-slate-400">{s.weightText}</span>
        </SliceLink>
      ))}
    </div>
  );
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Squarified treemap (Bruls, Huizing & van Wijk): tiles are laid out in rows
 * along the shorter side, a row growing while it makes its tiles squarer. Areas
 * are exactly proportional to value; only the arrangement is a choice.
 */
export function squarify(values: number[], box: Rect): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  const out: Rect[] = new Array(values.length);
  if (total <= 0) return values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
  const scale = (box.w * box.h) / total;
  const items = values.map((v, i) => ({ i, a: v * scale })).filter((x) => x.a > 0);
  let r = { ...box };
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    const mx = Math.max(...row), mn = Math.min(...row);
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  let k = 0;
  while (k < items.length) {
    const side = Math.min(r.w, r.h);
    let row = [items[k]];
    let j = k + 1;
    while (j < items.length && worst([...row, items[j]].map((x) => x.a), side) <= worst(row.map((x) => x.a), side)) {
      row = [...row, items[j]]; j++;
    }
    const s = row.reduce((a, x) => a + x.a, 0);
    if (r.w >= r.h) {
      const w = s / r.h; let y = r.y;
      for (const it of row) { const h = it.a / w; out[it.i] = { x: r.x, y, w, h }; y += h; }
      r = { x: r.x + w, y: r.y, w: r.w - w, h: r.h };
    } else {
      const h = s / r.w; let x = r.x;
      for (const it of row) { const w = it.a / h; out[it.i] = { x, y: r.y, w, h }; x += w; }
      r = { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
    }
    k = j;
  }
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = { x: box.x, y: box.y, w: 0, h: 0 };
  return out;
}

export function AllocationTreemap({ slices }: { slices: PieSlice[] }) {
  const drawn = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const rects = squarify(drawn.map((s) => s.value), { x: 0, y: 0, w: 100, h: 100 });
  const zero = slices.filter((s) => !(s.value > 0));
  return (
    <div className="mb-5" data-alloc-treemap>
      <div className="relative h-56 w-full overflow-hidden rounded-lg">
        {drawn.map((s, i) => {
          const r = rects[i];
          return (
            <SliceLink key={s.key} s={s} attr={{ "data-alloc-tile": s.key, "data-alloc-tile-area": String(r.w * r.h), "data-alloc-value": String(s.value) }}
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
              className="absolute overflow-hidden border border-ink-700 p-1.5 pl-2.5 text-[11px] leading-tight transition-opacity hover:opacity-90">
              {/* A TINT, NOT A SOLID FILL, so the label stays the page's own
                  ink in either theme — solid palette colours put dark type on a
                  dark page or pale type on a light one. The full colour is the
                  stripe on the left, which is what matches the table's swatch. */}
              <span className="absolute inset-0" style={{ background: s.color, opacity: 0.3 }} />
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: s.color }} />
              <span className="relative block font-semibold text-slate-100">{s.label}</span>
              <span className="relative block text-slate-300 mono">{s.weightText} · {s.valueText}</span>
            </SliceLink>
          );
        })}
      </div>
      {zero.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
          {zero.map((s) => (
            <SliceLink key={s.key} s={s} attr={{ "data-alloc-tile": s.key, "data-alloc-tile-area": "0", "data-alloc-value": String(s.value) }}
              className="inline-flex items-center gap-1.5 rounded border border-ink-700 px-1.5 py-0.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label} · {s.valueText}
            </SliceLink>
          ))}
        </div>
      )}
    </div>
  );
}

/** The picker and the chosen drawing, over one set of slices. */
export function AllocationChart({ slices, ariaLabel }: { slices: PieSlice[]; ariaLabel: string }) {
  const [view, setView] = useAllocChartView();
  return (
    <div data-alloc-chart={view}>
      <div className="mb-2 flex justify-end"><AllocChartPicker active={view} onChange={setView} /></div>
      {view === "bar" ? <AllocationBars slices={slices} />
        : view === "treemap" ? <AllocationTreemap slices={slices} />
        : <AllocationPie slices={slices} ariaLabel={ariaLabel} />}
    </div>
  );
}
