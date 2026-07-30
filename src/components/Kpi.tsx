import { ReactNode } from "react";

// Compact KPI tile — like StatTile but a touch smaller and non-wrapping, so several
// fit across a strip inside the app frame (with the left nav) without the value
// breaking onto two lines. Used by the CIO cockpit and the Stock Info page.
export function Kpi({ label, value, sub, delta, icon }: {
  label: string; value: ReactNode; sub?: ReactNode; delta?: number; icon?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="label-xs">{label}</div>
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
