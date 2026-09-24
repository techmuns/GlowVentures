import { ReactNode } from "react";

export function Card({ children, className = "", title, subtitle, right, pad = true }: {
  children: ReactNode; className?: string; title?: ReactNode;
  /**
   * WHAT THE CARD IS, ON THE TITLE'S HOVER — never a line under it (Stage 10cp).
   *
   * *"We have such random one-liners, two-liners, and footnotes everywhere
   * across the product. Please go hunt and remove all of this … The customer
   * is literally looking at the table and seeing the values inside it."* It
   * was a visible 12px line on 48 cards across 21 files; it is the title's
   * `title` attribute now, set HERE so no card can draw one again. A STRING,
   * because a hover can carry nothing else — a card whose line carried a
   * FIGURE moves that figure into its title or its body instead.
   */
  subtitle?: string; right?: ReactNode; pad?: boolean;
}) {
  return (
    <div className={`card ${pad ? "p-5" : ""} ${className}`}>
      {(title || right) && (
        <div className={`flex items-start justify-between gap-3 ${pad ? "mb-4" : "px-5 pt-5"}`}>
          <div>
            {/* `data-card-title-hint` marks a title carrying the hover, so the
                sweep can hold a moved sentence to where it went. There is no
                `data-card-subtitle` any more: the sweep counts it ABSENT on
                every route. */}
            {title && <div className="h-section" title={subtitle || undefined}
              data-card-title-hint={subtitle ? "" : undefined}>{title}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
