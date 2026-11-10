import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

// Compact KPI tile — like StatTile but a touch smaller and non-wrapping, so several
// fit across a strip inside the app frame (with the left nav) without the value
// breaking onto two lines. Used by the CIO cockpit and the Stock Info page.
export function Kpi({ label, labelText, value, large, second, sub, delta, icon, info, href, hrefTitle, action, raise, compact = false }: {
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
  /** The figure IS the card — Morning CIO's return cards, a return and one line under it (5 Nov 2026). */
  large?: boolean;
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
  /** Calculation info button, above the tile's navigation target. */
  info?: ReactNode;
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
  /** Controls that act on the TILE — remove it. Lifted above the click target. Adding is the ADD TILE card's, a grid cell of its own. */
  action?: ReactNode;
  /** Raise the tile above its neighbours while its picker's menu hangs over them. */
  raise?: boolean;
  /**
   * TIGHTER SPACING AND TYPE, SAME CONTENT (Morning CIO's strip, 10 Nov 2026:
   * *"Without changing any content on the tiles make them smaller they are
   * taking too much space because of which the content below is tough to
   * view"*). That page does not scroll, so every pixel the strip takes is one
   * the panel under it loses. Padding, the figure's size and the gaps between
   * lines shrink; no line, figure or control is dropped.
   */
  compact?: boolean;
}) {
  const name = labelText ?? (typeof label === "string" ? label : "");
  return (
    // THE RAISED LOOK IS ONLY ON A TILE THAT ACTUALLY OPENS SOMETHING. A tile
    // with no `href` — the drill-down page's own four, a stock page's — must
    // keep reading as a panel: a card that presses under the pointer and then
    // does nothing is a worse lie than a flat one.
    <div className={`card relative ${compact ? "px-3 py-2.5" : "p-4"}${href ? " kpi-btn" : ""}${raise ? " z-30" : ""}`}>
      {href && (
        <Link to={href} title={hrefTitle} aria-label={`${name} — open the holdings behind it`}
          className="absolute inset-0 z-0 rounded-2xl ring-focus" />
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
        {/* COMPACT: NO DECORATIVE ICON, AND THE ⓘ DOES NOT SET THE ROW'S HEIGHT
            (Stage 10mn: *"compress them more … so they dont take so much of
            space"*). The icon only repeated the heading and took the width a
            heading needs on a six-column strip; the 24px info target keeps its
            size and hangs into the padding, centred on the heading's line. */}
        {compact ? info && <div className="-my-[5px] -mr-1 flex shrink-0 items-center">{info}</div>
          : (info || icon) && <div className="flex shrink-0 items-center gap-1.5">{info}{icon && <div className="text-slate-500">{icon}</div>}</div>}
      </div>
      {/* The wrapper passes clicks to a tile target. Explicit source controls
          take pointer events back on their own boxes, without nesting controls
          inside the tile's sibling anchor. */}
      <div data-kpi-value className={`pointer-events-none relative z-10 w-fit max-w-full whitespace-nowrap font-display font-bold tracking-tight text-slate-100 tabular ${compact
        ? large ? "mt-1.5 text-[24px] leading-none" : "mt-1 text-[17px] leading-tight"
        : large ? "mt-3 text-[30px] leading-none" : "mt-2.5 text-[19px]"}`}>{value}</div>
      {second && (
        <div data-kpi-second className={`pointer-events-none relative z-10 whitespace-nowrap text-slate-300 ${compact ? "mt-0.5 text-[11px] leading-snug" : "mt-1 text-[12.5px]"}`}>{second}</div>
      )}
      {/* No caption, no arrow: no row — an empty one still spent its margin. */}
      {(sub || typeof delta === "number") && <div className={`pointer-events-none relative z-10 flex items-center gap-2 ${compact ? "mt-1 text-[10px] leading-[1.3]" : "mt-1.5 text-[11px]"}`}>
        {typeof delta === "number" && (
          <span className={`mono ${delta > 0 ? "text-gain" : delta < 0 ? "text-loss" : "text-slate-400"}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span data-kpi-sub className="text-slate-400">{sub}</span>}
      </div>}
      {/* THE TILE'S OWN CONTROL — remove — IN THE BOTTOM CORNER, above the
          click target. In the header it took the width the label needed; down
          here it sits beside a figure that is left-aligned and short.
          `pointer-events-auto` because everything else in the card passes
          clicks through to the tile's link. Adding a tile is not a control
          inside one: it is the ADD TILE card, the strip's own last cell
          (Stage 10cl). */}
      {/* COMPACT: THE CONTROL SHOWS ON HOVER OR FOCUS (`.kpi-tile-action`), on
          a solid chip. A tightened tile's caption runs into this corner, and a
          control drawn over it all the time hid its last words; in the header
          it narrowed the heading. A touch screen, with no hover, shows it always. */}
      {action && <div className={`pointer-events-auto absolute z-20 ${compact ? "kpi-tile-action bottom-2 right-2" : "bottom-2.5 right-2.5"}`}>{action}</div>}
    </div>
  );
}
