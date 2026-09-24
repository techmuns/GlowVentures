import type { PointerEvent as ReactPointerEvent } from "react";
import type { TableView } from "./tableView";

/**
 * ── A DRAGGED COLUMN LIFTS WHOLE ─────────────────────────────────────────────
 *
 * *"When I'm dragging a column across the table to a different position — it
 * should lift up the whole column instead of just lifting up the header. If you
 * can implement this across the dashboard, across all tables, that would be
 * great."*
 *
 * The drag was HTML5's own, and HTML5 lets a page choose only a STATIC picture
 * to drag: the browser photographs the element under the pointer — the heading
 * — and fades it. So the drag is a pointer gesture now, and what moves is a copy
 * of the whole column as it stands on screen: the heading and every cell under
 * it that the reader can see, lifted off the table with a shadow while the
 * column it came from dims in place. A bar across the table shows where it will
 * land, and letting go puts it there.
 *
 * IT LIVES HERE AND `SortHeader` CALLS IT, so every table in the app gets it by
 * declaring its columns — the same reason the sort and the keyboard move live
 * in one place: fifty tables are fifty chances to drift.
 *
 * FOUR THINGS IT MUST NOT BREAK, each a way a drag goes wrong quietly:
 *
 *  - A CLICK STILL SORTS. A press only becomes a drag once the pointer has
 *    travelled a few pixels; a press that goes nowhere is a click and reaches
 *    the heading's own sort button untouched. And a drag that ends back over the
 *    heading it began on must NOT then sort it, so the click that follows a drag
 *    is swallowed.
 *  - THE FIRST COLUMN STAYS PUT, as a subject and as a destination. The family
 *    asked for it; `useTableView.move` enforces it; the drop never asks it to
 *    break.
 *  - IT DRAWS AT THE APP'S OWN SCALE. `#root` carries `--app-zoom` (0.875 on a
 *    wide screen), and a copy drawn at 100% over a table drawn at 87.5% would be
 *    a different size from the column it is a copy of. Measured in this
 *    Chromium: `getBoundingClientRect` reports painted pixels while CSS lengths
 *    are pre-zoom, so the copy takes the table's own effective zoom and every
 *    position is divided back into its CSS pixels.
 *  - ESCAPE CANCELS, and nothing is left behind — no copy, no dimmed cells, no
 *    bar. A drag that could strand a ghost on the page is worse than no drag.
 *
 * Touch starts from the grip only: the whole heading taking a touch would stop a
 * finger from scrolling a wide table sideways, which is the one gesture a phone
 * reader needs from it.
 */

const THRESHOLD = 5;   // px of travel before a press becomes a drag
const EDGE = 56;       // px from a scroller's edge where the table starts to scroll
const MAX_SPEED = 16;  // px per frame at the very edge

type Box = { left: number; top: number; right: number; bottom: number };

/** How much smaller than its CSS pixels `el` paints — every `zoom` up the tree, multiplied. */
function effectiveZoom(el: Element | null): number {
  let z = 1;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const v = parseFloat(getComputedStyle(e).zoom || "1");
    if (Number.isFinite(v) && v > 0) z *= v;
  }
  return z;
}

/** The part of the viewport where `el` can actually be seen: every clipping ancestor, intersected. */
function visibleBox(el: Element): Box {
  let b: Box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let e = el.parentElement; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (/(auto|scroll|hidden|clip)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
      const r = e.getBoundingClientRect();
      b = { left: Math.max(b.left, r.left), top: Math.max(b.top, r.top), right: Math.min(b.right, r.right), bottom: Math.min(b.bottom, r.bottom) };
    }
  }
  return b;
}

/** The nearest ancestor that scrolls sideways, if the table is wider than it. */
function sidewaysScroller(el: Element): HTMLElement | null {
  for (let e = el.parentElement; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) return e as HTMLElement;
  }
  return null;
}

/** Which grid column a cell starts at, counting every `colSpan` before it. */
function gridStart(cell: HTMLTableCellElement): number {
  let x = 0;
  for (const c of Array.from((cell.parentElement as HTMLTableRowElement).cells)) {
    if (c === cell) return x;
    x += c.colSpan || 1;
  }
  return -1;
}

/**
 * EVERY CELL OF THIS COLUMN, in the table's own rows — header, body and footer —
 * found by GRID POSITION rather than by index, so a row carrying a `colSpan`
 * (a section heading, a footer label, an opened panel) is recognised for what it
 * is. A cell that covers this column and others is not this column's, and that
 * row is skipped rather than half-copied. `table.rows` is this table's own rows,
 * never a nested table's.
 */
function columnCells(table: HTMLTableElement, start: number, span: number): HTMLTableCellElement[] {
  const out: HTMLTableCellElement[] = [];
  for (const row of Array.from(table.rows)) {
    let x = 0;
    for (const c of Array.from(row.cells)) {
      const n = c.colSpan || 1;
      if (x === start) { if (n === span) out.push(c); break; }
      if (x + n > start) break;
      x += n;
    }
  }
  return out;
}

/** The colour behind the table, so the lifted copy is opaque and readable. */
function surfaceOf(el: Element): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const bg = getComputedStyle(e).backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg;
  }
  return getComputedStyle(document.body).backgroundColor || "#ffffff";
}

/** One cell of the copy — the cell's own markup, at its own place and size, in the table's own type. */
function copyCell(cell: HTMLTableCellElement, top: number, z: number): HTMLDivElement {
  const r = cell.getBoundingClientRect();
  const cs = getComputedStyle(cell);
  const box = document.createElement("div");
  box.setAttribute("data-col-ghost-cell", "");
  Object.assign(box.style, {
    position: "absolute", left: "0px", top: `${(r.top - top) / z}px`,
    width: `${r.width / z}px`, height: `${r.height / z}px`, boxSizing: "border-box",
    // A table cell centres its content vertically; a flex column does the same
    // without turning the cell's own inline content into blocks, because the
    // copy sits in ONE inner block below.
    display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden",
    paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
    fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
    color: cs.color, textAlign: cs.textAlign, textTransform: cs.textTransform,
    letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight, whiteSpace: cs.whiteSpace,
    fontVariantNumeric: cs.fontVariantNumeric,
  });
  const inner = document.createElement("div");
  inner.innerHTML = cell.innerHTML;
  box.appendChild(inner);
  return box;
}

type Lift = { update: (x: number) => void; drop: () => { before: string | null; changed: boolean } | null; cancel: () => void };

/**
 * LIFT THE COLUMN: draw the copy, dim the source, show the bar. Returns null
 * when the heading is not in a table this can read — the press then stays a
 * press, which is the harmless failure.
 */
function lift(th: HTMLTableCellElement, col: string, fixed: string, startX: number): Lift | null {
  const table = th.closest("table") as HTMLTableElement | null;
  const headRow = th.parentElement as HTMLTableRowElement | null;
  if (!table || !headRow) return null;
  const start = gridStart(th);
  if (start < 0) return null;
  const cells = columnCells(table, start, th.colSpan || 1);
  const z = effectiveZoom(table);
  const clip = visibleBox(table);
  const tr = th.getBoundingClientRect();
  const tableBox = table.getBoundingClientRect();

  // Only the cells a reader can see are copied: the copy is of the column AS IT
  // STANDS ON SCREEN, and a two-hundred-row table need not be cloned whole.
  const top = Math.max(tr.top, clip.top);
  const bottom = Math.min(tableBox.bottom, clip.bottom);
  const shown = cells.filter((c) => {
    if (c === th) return false;
    const r = c.getBoundingClientRect();
    return r.bottom > tr.bottom && r.top < bottom;
  });

  const ghost = document.createElement("div");
  ghost.setAttribute("data-col-ghost", col);
  ghost.setAttribute("aria-hidden", "true");
  const left0 = tr.left;
  Object.assign(ghost.style, {
    position: "fixed", zIndex: "9999", pointerEvents: "none", zoom: String(z),
    left: `${left0 / z}px`, top: `${top / z}px`,
    width: `${tr.width / z}px`, height: `${Math.max(tr.height, bottom - top) / z}px`,
    background: surfaceOf(table), borderRadius: "8px", overflow: "hidden",
    boxShadow: "0 24px 48px -14px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(212,175,95,0.9)",
    transform: "rotate(1.2deg) scale(1.03)", transformOrigin: "50% 12%",
  });
  for (const c of shown) ghost.appendChild(copyCell(c, top, z));
  // The heading last, so a row sitting under a sticky header in the table sits
  // under it in the copy too.
  const head = copyCell(th, top, z);
  head.style.background = surfaceOf(table);
  head.setAttribute("data-col-ghost-head", "");
  ghost.appendChild(head);
  document.body.appendChild(ghost);

  const bar = document.createElement("div");
  bar.setAttribute("data-col-drop-marker", "");
  bar.setAttribute("aria-hidden", "true");
  Object.assign(bar.style, {
    position: "fixed", zIndex: "9998", pointerEvents: "none", width: "3px", borderRadius: "2px",
    top: `${top}px`, height: `${Math.max(tr.height, bottom - top)}px`,
    background: "rgba(212,175,95,0.95)", boxShadow: "0 0 0 3px rgba(212,175,95,0.2)", display: "none",
  });
  document.body.appendChild(bar);

  for (const c of cells) c.setAttribute("data-col-lifted", "");
  document.documentElement.classList.add("col-dragging");

  let target: { before: string | null; changed: boolean } | null = null;
  const heads = () => [...headRow.cells].filter((c) => c.hasAttribute("data-col"));

  const update = (x: number) => {
    ghost.style.left = `${(left0 + (x - startX)) / z}px`;
    // WHERE IT WOULD LAND: before the first movable heading whose midpoint is
    // right of the pointer, or last. Never before the fixed first column.
    const all = heads();
    const others = all.filter((c) => c !== th);
    const movable = others.filter((c) => c.getAttribute("data-col") !== fixed);
    const before = movable.find((c) => { const r = c.getBoundingClientRect(); return x < r.left + r.width / 2; }) ?? null;
    const beforeCol = before?.getAttribute("data-col") ?? null;
    // Dropping a column where it already is changes nothing, and the bar says
    // so by not appearing.
    const order = all.map((c) => c.getAttribute("data-col"));
    const next = order.slice(order.indexOf(col) + 1).find((c) => c !== fixed) ?? null;
    target = { before: beforeCol, changed: beforeCol !== next };
    const edge = before ? before.getBoundingClientRect().left
      : (others.length ? others[others.length - 1].getBoundingClientRect().right : null);
    if (target.changed && edge != null) {
      bar.style.left = `${edge - 1.5}px`;
      bar.style.display = "block";
    } else {
      bar.style.display = "none";
    }
  };

  const clear = () => {
    ghost.remove();
    bar.remove();
    for (const c of cells) c.removeAttribute("data-col-lifted");
    document.documentElement.classList.remove("col-dragging");
  };

  update(startX);
  return {
    update,
    drop: () => { clear(); return target; },
    cancel: clear,
  };
}

/** The click a browser sends after a drag ends over a button must not sort it. */
function swallowNextClick() {
  const stop = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); };
  window.addEventListener("click", stop, true);
  window.setTimeout(() => window.removeEventListener("click", stop, true), 60);
}

/**
 * `SortHeader`'s `onPointerDown`. Listens on the WINDOW until the pointer comes
 * up, so the drag follows the pointer anywhere on the page, and only turns into
 * a drag once it has travelled — a press that goes nowhere is left to be a
 * click.
 */
export function pressColumn(e: ReactPointerEvent<HTMLTableCellElement>, col: string, view: TableView) {
  if (e.button !== 0 || col === view.fixed) return;
  const origin = e.target as Element;
  if (e.pointerType === "touch" && !origin.closest("[data-col-grip]")) return;
  const th = e.currentTarget;
  const id = e.pointerId;
  const startX = e.clientX, startY = e.clientY;
  /**
   * THREE STATES, and the third is the one that is easy to forget: a drag the
   * reader CANCELLED with Escape is still a pointer that is down. Its release
   * over the heading it began on would be a click, and that click must not sort
   * the column — so the listeners stay until the pointer comes up.
   */
  let state: "pressed" | "dragging" | "cancelled" = "pressed";
  let drag: Lift | null = null;
  let lastX = startX;
  let raf = 0;
  const scroller = sidewaysScroller(th);

  // THE TABLE SCROLLS UNDER A COPY HELD AT ITS EDGE, so a column can be carried
  // to a place the reader cannot yet see.
  const tick = () => {
    raf = 0;
    if (state !== "dragging" || !drag || !scroller) return;
    const b = scroller.getBoundingClientRect();
    let v = 0;
    if (lastX < b.left + EDGE) v = -Math.ceil(MAX_SPEED * Math.min(1, (b.left + EDGE - lastX) / EDGE));
    else if (lastX > b.right - EDGE) v = Math.ceil(MAX_SPEED * Math.min(1, (lastX - (b.right - EDGE)) / EDGE));
    if (!v) return;
    const was = scroller.scrollLeft;
    scroller.scrollLeft += v;
    if (scroller.scrollLeft !== was) { drag.update(lastX); raf = requestAnimationFrame(tick); }
  };

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== id || state === "cancelled") return;
    lastX = ev.clientX;
    if (state === "pressed") {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
      drag = lift(th, col, view.fixed, startX);
      if (!drag) { finish(); return; }
      state = "dragging";
    }
    ev.preventDefault();
    drag!.update(ev.clientX);
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    const was = state;
    finish();
    if (was === "pressed") return;          // a press that went nowhere: a click, left alone
    swallowNextClick();
    if (was === "dragging" && drag) {
      const t = drag.drop();
      if (t?.changed) view.move(col, t.before);
    }
  };
  const cancelLift = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    drag?.cancel();
    drag = null;
  };
  // The pointer is gone (the window lost focus, the browser took the gesture):
  // no release is coming, so everything is cleared now.
  const abandon = () => { const was = state; cancelLift(); finish(); if (was !== "pressed") swallowNextClick(); };
  const onCancel = (ev: PointerEvent) => { if (ev.pointerId === id) abandon(); };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || state !== "dragging") return;
    ev.preventDefault(); ev.stopPropagation();
    cancelLift();
    state = "cancelled";
  };
  function finish() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", abandon);
  }
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", abandon);
}
