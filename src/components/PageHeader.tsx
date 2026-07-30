import { ReactNode } from "react";

export function PageHeader({ eyebrow, title, subtitle, right }: {
  eyebrow?: string; title: string; subtitle?: ReactNode; right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && <div className="label-xs text-champagne-500">{eyebrow}</div>}
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
