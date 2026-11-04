import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, CornerUpLeft } from "lucide-react";

/**
 * ── RIGHT-CLICK A ROW, MOVE IT TO ANOTHER TAB (Stage 10la) ──────────────────
 *
 *   "Allow the ability for any security or row to move any sub tab by doing
 *    right click — for example if i want to move DSP gold from alternate to any
 *    other i should be able to do so."
 *
 * A context menu at the pointer: the axis's tabs, the row's own one ticked, and
 * "Move back" once the family has moved it. Origin-aware — it grows from the
 * corner under the pointer — and instant when opened from the keyboard.
 * Highlight follows the pointer and the arrow keys alike, so the two never
 * disagree about which item Enter would pick.
 */
export type MoveRowRequest = {
  /** Where the menu opens: the pointer, or the row's own edge from the keyboard. */
  x: number;
  y: number;
  keyboard: boolean;
  /** The row's name, as its first cell shows it. */
  name: string;
  /** The tab the row is in now. */
  current: string;
  /** The tab it was in before the family moved it; equal to `current` if never moved. */
  stated: string;
  targets: readonly { key: string; label: string }[];
  /** The element focus returns to when the menu closes. */
  returnFocus: HTMLElement | null;
};

export function MoveRowMenu({ request, status, onMove, onClose }: {
  request: MoveRowRequest;
  /** Where moves are kept, when it is not everyone's store — said inside the menu. */
  status: string | null;
  onMove: (section: string) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; origin: string } | null>(null);
  const moved = request.current !== request.stated;
  const items = request.targets.filter((t) => t.key !== request.current);
  const [active, setActive] = useState(0);

  const close = useCallback(() => {
    onClose();
    request.returnFocus?.focus({ preventScroll: true });
  }, [onClose, request.returnFocus]);

  // Keep the menu on screen: it opens down-right of the pointer and flips at an
  // edge, and its transform-origin is the corner the pointer is at.
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const gap = 8;
    const flipX = request.x + width + gap > window.innerWidth;
    const flipY = request.y + height + gap > window.innerHeight;
    setPlace({
      left: Math.max(gap, flipX ? request.x - width : request.x),
      top: Math.max(gap, flipY ? request.y - height : request.y),
      origin: `${flipY ? "bottom" : "top"} ${flipX ? "right" : "left"}`,
    });
  }, [request.x, request.y]);

  useEffect(() => {
    if (!place) return;
    menu.current?.querySelector<HTMLButtonElement>(`[data-move-index="${active}"]`)?.focus({ preventScroll: true });
  }, [place, active]);

  // Any press outside, a scroll of the page, or the window losing focus closes
  // it — the row it was opened on may no longer be under it.
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) onClose(); };
    const away = () => onClose();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    window.addEventListener("blur", away);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("blur", away);
    };
  }, [onClose]);

  const count = items.length + (moved ? 1 : 0);
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { e.preventDefault(); close(); return; }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step) { e.preventDefault(); setActive((i) => (i + step + count) % count); }
    if (e.key === "Home") { e.preventDefault(); setActive(0); }
    if (e.key === "End") { e.preventDefault(); setActive(count - 1); }
  };

  const pick = (section: string) => { onMove(section); close(); };
  const label = (key: string) => request.targets.find((t) => t.key === key)?.label ?? key;

  return createPortal(
    <div ref={menu} role="menu" aria-label={`Move ${request.name} to another tab`}
      data-move-menu="" data-instant={request.keyboard ? "" : undefined}
      onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}
      className="move-menu fixed z-[60] w-60 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 py-1 text-slate-200 shadow-xl"
      style={place
        ? { left: place.left, top: place.top, transformOrigin: place.origin }
        : { left: request.x, top: request.y, visibility: "hidden" }}>
      <div className="truncate px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500" title={request.name}>
        Move {request.name} to
      </div>
      <div role="none" className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500" aria-disabled="true"
        data-move-current={request.current}>
        <Check className="h-3.5 w-3.5 shrink-0 text-champagne-400" aria-hidden />
        <span className="truncate">{label(request.current)}</span>
        <span className="ml-auto shrink-0 text-[10px]">here now</span>
      </div>
      {items.map((t, i) => (
        <button key={t.key} type="button" role="menuitem" tabIndex={i === active ? 0 : -1}
          data-move-index={i} data-move-to={t.key}
          onPointerMove={() => { if (active !== i) setActive(i); }}
          onClick={() => pick(t.key)}
          className="move-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs">
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{t.label}</span>
          {t.key === request.stated && <span className="ml-auto shrink-0 text-[10px] text-slate-500">where it was</span>}
        </button>
      ))}
      {moved && (
        <>
          <div role="separator" className="my-1 border-t border-ink-600" />
          <button type="button" role="menuitem" tabIndex={active === items.length ? 0 : -1}
            data-move-index={items.length} data-move-back={request.stated}
            onPointerMove={() => { if (active !== items.length) setActive(items.length); }}
            onClick={() => pick(request.stated)}
            title={`Undo the move: back to ${label(request.stated)}, where the family's review, their rules or the book place it`}
            className="move-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs">
            <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
            <span className="truncate">Move back to {label(request.stated)}</span>
          </button>
        </>
      )}
      {status && (
        <div className="mt-1 border-t border-ink-600 px-3 pb-1 pt-1.5 text-[10px] leading-snug text-amber-400" data-move-status>
          {status}
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * THE CONFIRMATION, WITH UNDO. A moved row leaves the tab the reader is on, so
 * without this the only evidence of the move is a row disappearing.
 */
export function MoveRowToast({ text, onUndo, onDone }: { text: string; onUndo: () => void; onDone: () => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(onDone, 5000);
    return () => window.clearTimeout(t);
  }, [paused, onDone, text]);
  return createPortal(
    <div role="status" aria-live="polite" data-move-toast=""
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      className="move-toast fixed bottom-5 left-1/2 z-[60] flex max-w-[min(92vw,28rem)] items-center gap-3 rounded-lg border border-ink-600 bg-ink-800 py-2 pl-3.5 pr-2 text-xs text-slate-200 shadow-xl">
      <span className="min-w-0 truncate">{text}</span>
      <button type="button" onClick={() => { onUndo(); onDone(); }}
        className="move-toast-undo ring-focus shrink-0 rounded px-2 py-1 font-medium text-champagne-400">
        Undo
      </button>
    </div>,
    document.body,
  );
}
