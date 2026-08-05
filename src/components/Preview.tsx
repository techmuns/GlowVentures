import type { ReactNode } from "react";
import { Sparkles, Info } from "lucide-react";
import { Card } from "@/components/Card";

// THE PREVIEW CONVENTION — deliberately the OPPOSITE discipline from Absent.tsx.
//
// `Absent` renders a dash for a real measurement this book does not carry. This
// file renders a GREYED SAMPLE figure to show a client how a page will look once
// a live source is wired up. The client asked to SEE the shape of the FOOS spec
// — every macro series, every research module, the family dashboard — before the
// data feeds behind them exist.
//
// The standing rule (CLAUDE.md) is that a reader must never mistake a placeholder
// for a measurement. This honours it by making the placeholder UNMISTAKABLE
// rather than by hiding it:
//   • every preview figure is muted, dashed-underlined and tagged "not live",
//   • every preview card carries a "Preview" badge and a faint hatch, and
//   • every preview page opens with a banner naming the source that would make
//     it live and stating that nothing on the page is real.
//
// Nothing here ever touches the book. These components render sample constants
// only — they are illustrative furniture, never wired to `usePortfolio()` data.

/** The amber tag that marks a card, section or nav item as illustrative. */
export function PreviewBadge({ label = "Preview", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400 ${className}`}
      title="Illustrative placeholder — not live data"
    >
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * The banner every preview page opens with. `source` names the feed, store or
 * decision that would make the page live; `layer` optionally names the FOOS spec
 * layer this page implements, so the client can map screen to document.
 */
export function PreviewBanner({ source, layer, children }: { source: string; layer?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/[0.06] px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="text-[12.5px] leading-relaxed text-slate-300">
        <span className="font-semibold text-amber-300">Preview — illustrative layout{layer ? ` · ${layer}` : ""}.</span>{" "}
        Every figure on this page is a placeholder, shown to convey how the screen will look once {source} is
        connected. Nothing here is live or drawn from the family's statements — real figures replace these the
        moment the source is wired in.
        {children ? <div className="mt-1 text-slate-400">{children}</div> : null}
      </div>
    </div>
  );
}

/**
 * A greyed sample figure. Muted tone + champagne-dashed underline mark it apart
 * from a real number (bright slate) and from an Absent dash (plain slate-500).
 */
export function PreviewNum({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`preview-num mono ${className}`} title="Placeholder — not live data">
      {children}
    </span>
  );
}

/** StatTile props for a preview figure: greyed value, muted sub. Spread it in. */
export function previewTile(value: ReactNode, sub?: ReactNode) {
  return { value: <PreviewNum>{value}</PreviewNum>, sub: sub ? <span className="text-slate-500">{sub}</span> : undefined };
}

/** A Card pre-marked as preview: faint hatch background + a Preview badge. */
export function PreviewCard({
  title, subtitle, right, children, className = "", pad,
}: {
  title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <Card
      title={title}
      subtitle={subtitle}
      pad={pad}
      className={`preview-hatch ${className}`}
      right={<div className="flex items-center gap-2">{right}<PreviewBadge /></div>}
    >
      {children}
    </Card>
  );
}

/** A small greyed tag for sample categorical values (themes, statuses, sectors). */
export function PreviewPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ink-600/70 bg-ink-700/40 px-2 py-0.5 text-[10.5px] text-slate-400" title="Placeholder — not live data">
      {children}
    </span>
  );
}

// A deterministic sample series, so the illustrative charts render the same shape
// every time (no Math.random, which the build environment also forbids).
const SAMPLE = [38, 42, 40, 47, 52, 49, 58, 63, 60, 68, 72, 78];

/**
 * A muted, self-contained sample chart — an area line or a bar row — drawn in
 * inline SVG so a preview page can show the SHAPE of a chart without a real
 * series and without an empty axis frame. Never plots book data.
 */
export function PreviewChart({ kind = "area", height = 160, className = "" }: {
  kind?: "area" | "bars"; height?: number; className?: string;
}) {
  const W = 560, H = height, pad = 8;
  const max = Math.max(...SAMPLE) * 1.1;
  const stepX = (W - pad * 2) / (SAMPLE.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);

  return (
    <div className={`relative ${className}`} title="Illustrative chart — not live data">
      <div className="absolute right-2 top-2 z-10"><PreviewBadge /></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Illustrative sample chart">
        <defs>
          <linearGradient id="previewFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(217,196,143,0.28)" />
            <stop offset="100%" stopColor="rgba(217,196,143,0.02)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={H * f} y2={H * f} stroke="rgba(148,148,180,0.14)" strokeDasharray="2 5" />
        ))}
        {kind === "area" ? (
          <>
            <path
              d={`M ${pad},${y(SAMPLE[0])} ${SAMPLE.map((v, i) => `L ${pad + i * stepX},${y(v)}`).join(" ")} L ${W - pad},${H - pad} L ${pad},${H - pad} Z`}
              fill="url(#previewFill)"
            />
            <path
              d={`M ${pad},${y(SAMPLE[0])} ${SAMPLE.map((v, i) => `L ${pad + i * stepX},${y(v)}`).join(" ")}`}
              fill="none" stroke="rgba(217,196,143,0.65)" strokeWidth={1.75}
            />
          </>
        ) : (
          SAMPLE.map((v, i) => {
            const bw = stepX * 0.6;
            return <rect key={i} x={pad + i * stepX - bw / 2} y={y(v)} width={bw} height={H - pad - y(v)} rx={2} fill="rgba(217,196,143,0.45)" />;
          })
        )}
      </svg>
    </div>
  );
}
