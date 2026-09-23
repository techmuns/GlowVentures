import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

// Compact KPI tile — like StatTile but a touch smaller and non-wrapping, so several
// fit across a strip inside the app frame (with the left nav) without the value
// breaking onto two lines. Used by the CIO cockpit and the Stock Info page.
export function Kpi({ label, labelText, value, second, sub, delta, icon, href, hrefTitle, action, raise }: {
  /**
   * NORMALLY A STRING, and a CONTROL where the tile's metric is the reader's to
   * choose — Morning CIO's strip renders `SelectableTiles`' picker here. A
   * control label sits ABOVE the tile's click target (see `action`), so opening
   * the picker never navigates.
   */
  label: ReactNode;
  /** The label in words, for the link's accessible name when `label` is a control. */
  labelText?: string;
  value: ReactNode;
  /**
   * A SECOND FIGURE under the first — the Current Value of Holdings tile shows
   * what was invested beneath what it is worth, at the family's request. A
   * figure struck from the book, never a caption; `data-kpi-second` marks it so
   * a check can tell it from one.
   */
  second?: ReactNode;
  sub?: ReactNode;
  /**
   * The percentage arrow. NULL renders nothing at all — a tile whose figure the
   * book does not carry must not show "■ 0.0%", which reads as a measured flat.
   */
  delta?: number | null; icon?: ReactNode;
  /**
   * WHERE THE HOLDINGS BEHIND THIS FIGURE ARE — the drill-down the family asked
   * for. Optional, because a tile whose set has no address must not pretend to
   * one: a link that opens a page which can only be empty is worse than no link.
   *
   * ── THE WHOLE TILE IS THE TARGET, AND IT LOOKS LIKE A BUTTON ─────────────
   *
   * *"there are multiple links on these KPI tiles. Make these KPI tiles
   * clickable and remove all the other links."* … *"Just make the KPI tiles
   * look like 3-d clickable buttons and remove every other underlines /
   * hyperlinks on the texts."*
   *
   * Those are one request in two rounds. The click target moved to the whole
   * card first, and the underlines stayed — so the tile carried two competing
   * affordances: a dotted-underlined LABEL and a dashed-underlined FIGURE, both
   * of which say "this text is the thing to click" about a card where the text
   * is not the thing to click. The affordance is the RAISED SURFACE now
   * (`.kpi-btn`, which presses on click), and every underline inside is gone.
   *
   * IT IS A STRETCHED OVERLAY, NOT A WRAPPER. Anything interactive inside a
   * tile would be a nested control — invalid markup inside an anchor, and
   * browsers disagree about which of the two interactions survives. So the
   * anchor is an absolutely-positioned sibling covering the card and the
   * content sits above it with `pointer-events-none`, which also means a
   * selection drag over the figure cannot swallow the click.
   */
  href?: string;
  /** What the reader will find there. Required in spirit whenever `href` is set. */
  hrefTitle?: string;
  /** Controls that act on the TILE — remove, add. Lifted above the click target. */
  action?: ReactNode;
  /** Raise the tile above its neighbours while its picker's menu hangs over them. */
  raise?: boolean;
}) {
  const name = labelText ?? (typeof label === "string" ? label : "");
  return (
    // THE RAISED LOOK IS ONLY ON A TILE THAT ACTUALLY OPENS SOMETHING. A tile
    // with no `href` — the drill-down page's own four, a stock page's — must
    // keep reading as a panel: a card that presses under the pointer and then
    // does nothing is a worse lie than a flat one.
    <div className={`card relative p-4${href ? " kpi-btn" : ""}${raise ? " z-30" : ""}`}>
      {href && (
        <Link to={href} title={hrefTitle} aria-label={`${name} — open the holdings behind it`}
          className="absolute inset-0 z-0 rounded-xl ring-focus" />
      )}
      {/* THE HEADER RISES WITH ITS MENU. Every layer in this card is its own
          `z-10` so it sits above the link, which makes each a stacking context
          of equal rank — and the figure below, later in the document, painted
          OVER the open picker's menu. While the menu is open the header outranks
          the rest of the card, as the card outranks its neighbours. */}
      <div className={`pointer-events-none relative ${raise ? "z-30" : "z-10"} flex items-start justify-between gap-2`}>
        {/* `flex-1` so a label that is a CONTROL takes the free width and is
            only ever wrapped, never cut — the Private Market tiles' own lesson.
            A control label takes pointer events back ON ITS OWN BOX (the picker
            sets it); the empty width around it does not, so a click there still
            falls through to the tile's link. */}
        {typeof label === "string" ? (
          <div className="label-xs min-w-0 flex-1">
            {href ? (
              // NO UNDERLINE. The arrow stays: it says the tile opens ANOTHER
              // PAGE, which the raised surface alone does not — a button could
              // as easily toggle something in place.
              <span className="inline-flex items-center gap-1">
                {label}
                <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-600" />
              </span>
            ) : label}
          </div>
        ) : (
          /* A CONTROL LABEL IS A FLEX ITEM OF A BLOCK-WIDTH ROW, not of an
             inline-flex span. Inside a shrink-to-fit span its `max-w-full`
             resolved against a width the span had not settled yet, and the
             label wrapped at a word's width — "DISTRIBUTION / S" — on a tile
             with a third of its header empty. */
          /* NO ↗ BESIDE A PICKER. A chevron that opens a menu and an arrow that
             opens a page, side by side on one word, are two affordances fighting
             over a 10px label — and on a tile a fifth of the strip wide they
             pushed "DISTRIBUTIONS" onto two lines. The raised surface already
             says the tile opens something. */
          <div className="label-xs flex min-w-0 flex-1 items-start">
            {label}
          </div>
        )}
        {icon && <div className="shrink-0 text-slate-500">{icon}</div>}
      </div>
      {/* `pointer-events-none` on every wrapper lets a click anywhere fall
          through to the anchor beneath — there is nothing interactive left in
          here to protect, now that the figure no longer opens a popover. */}
      <div data-kpi-value className="pointer-events-none relative z-10 mt-2.5 w-fit max-w-full whitespace-nowrap text-[19px] font-semibold tracking-tight text-slate-100 tabular">{value}</div>
      {second && (
        <div data-kpi-second className="pointer-events-none relative z-10 mt-1 whitespace-nowrap text-[12.5px] text-slate-300">{second}</div>
      )}
      <div className="pointer-events-none relative z-10 mt-1.5 flex items-center gap-2 text-[11px]">
        {typeof delta === "number" && (
          <span className={`mono ${delta > 0 ? "text-gain" : delta < 0 ? "text-loss" : "text-slate-400"}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-slate-400">{sub}</span>}
      </div>
      {/* THE TILE'S OWN CONTROLS — remove, and add on the last — IN THE BOTTOM
          CORNER, above the click target. In the header they took the width the
          label needed; down here they sit beside a figure that is left-aligned
          and short. `pointer-events-auto` because everything else in the card
          passes clicks through to the tile's link. */}
      {action && <div className="pointer-events-auto absolute bottom-2.5 right-2.5 z-20">{action}</div>}
    </div>
  );
}
