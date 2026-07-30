import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Table2 } from "lucide-react";
import type { FormulaDef } from "@/lib/auditFormulas";

// Wrap any number so it's traceable:
//   • `to`      → a raw source value; renders a hyperlink into the Data Audit tab.
//   • `formula` → a calculated value; renders a dotted number that opens a popover
//                  explaining the calculation (Excel-style + plain language).
// Without either it just renders its children (a graceful no-op).
const LINK_CLS = "cursor-pointer text-inherit underline decoration-dotted decoration-1 decoration-slate-500/50 underline-offset-[3px] transition-colors hover:decoration-champagne-500";
const CALC_CLS = "cursor-pointer text-inherit underline decoration-dashed decoration-1 decoration-slate-500/50 underline-offset-[3px] transition-colors hover:decoration-champagne-500";

export function Auditable({ children, to, formula, title }: {
  children: ReactNode;
  to?: string;
  formula?: FormulaDef;
  title?: string;
}) {
  if (to) return <Link to={to} title={title ?? "Trace to the source in Data Audit"} className={LINK_CLS}>{children}</Link>;
  if (formula) return <FormulaTrigger formula={formula}>{children}</FormulaTrigger>;
  return <>{children}</>;
}

function FormulaTrigger({ formula, children }: { formula: FormulaDef; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = 328, H = 210;
    const left = Math.max(12, Math.min(r.left, window.innerWidth - W - 12));
    const top = r.bottom + 6 + H > window.innerHeight ? Math.max(12, r.top - H - 6) : r.bottom + 6;
    setPos({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" aria-expanded={open} title="How this number is worked out"
        onClick={() => { if (!open) place(); setOpen((o) => !o); }} className={CALC_CLS}>
        {children}
      </button>
      {open && (
        // whitespace-normal: the trigger often sits in a whitespace-nowrap table
        // cell, and the popover — a DOM child of it — would inherit that and refuse
        // to wrap, running its worked example out past the panel edge.
        <div ref={popRef} style={{ top: pos.top, left: pos.left }}
          className="fixed z-[60] w-[328px] whitespace-normal break-words rounded-lg border border-ink-600 bg-ink-800 p-3.5 text-left shadow-xl shadow-black/60">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[13px] font-semibold text-slate-100">{formula.title}</div>
            <span className="rounded bg-champagne-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-champagne-400">Formula</span>
          </div>
          <div className="rounded-md border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 mono text-[12px] leading-relaxed text-slate-200">{formula.excel}</div>
          {formula.worked && <div className="mt-1.5 mono text-[11px] leading-relaxed text-slate-400">{formula.worked}</div>}
          <p className="mt-2 text-[12px] leading-snug text-slate-400">{formula.plain}</p>
          {formula.auditHref && (
            <Link to={formula.auditHref} onClick={() => setOpen(false)}
              className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-champagne-400 hover:underline">
              <Table2 className="h-3.5 w-3.5" /> See the source numbers in Data Audit
            </Link>
          )}
        </div>
      )}
    </>
  );
}
