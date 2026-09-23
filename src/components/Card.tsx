import { ReactNode } from "react";

export function Card({ children, className = "", title, subtitle, right, pad = true }: {
  children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; pad?: boolean;
}) {
  return (
    <div className={`card ${pad ? "p-5" : ""} ${className}`}>
      {(title || right) && (
        <div className={`flex items-start justify-between gap-3 ${pad ? "mb-4" : "px-5 pt-5"}`}>
          <div>
            {title && <div className="h-section">{title}</div>}
            {/* `data-card-subtitle` is the handle the page sweep counts: the
                family asked for explainer lines under card titles to go, and a
                page that must carry none is checked on this, not on wording. */}
            {subtitle && <div className="mt-1 text-xs text-slate-400" data-card-subtitle="">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
