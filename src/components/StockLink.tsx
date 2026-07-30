import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { stockHref } from "@/lib/auditFormulas";

// A security name that links to its Stock Info drill-down. Keyed by securityKey
// rather than ISIN, so names that arrive without an ISIN — most of this book —
// still get a drill-down. Falls back to plain text when there is no key at all.
export function StockLink({ securityKey, name, children, className = "" }: {
  securityKey?: string | null; name: string; children?: ReactNode; className?: string;
}) {
  if (!securityKey) return <>{children ?? name}</>;
  return (
    <Link to={stockHref(securityKey)} title={`${name} — open Stock Info`}
      className={`underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:decoration-champagne-500 hover:text-champagne-400 ${className}`}>
      {children ?? name}
    </Link>
  );
}
