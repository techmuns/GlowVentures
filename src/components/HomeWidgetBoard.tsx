import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowLeft, Check, GripVertical, LayoutGrid, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_HOME_LAYOUT, HOME_WIDGETS, homeWidgetColumns, moveHomeWidget, packHomeRows, type HomeWidgetEntry, type HomeWidgetId, type HomeWidgetSize } from '@/lib/homeWidgets';

// The widget board's layout is CONTROLLED by the active Home view (`homeViews.ts`):
// a reader switches views and the board shows and edits THAT view's widgets, so
// persistence belongs to the view, not here. This hook keeps only the board's own
// UI flags — edit mode, the library dialog, and the live-region announcement.
export function useHomeWidgets(layout: HomeWidgetEntry[], setLayout: (next: HomeWidgetEntry[]) => void) {
  const [editing, setEditing] = useState(false), [open, setOpen] = useState(false), [announcement, setAnnouncement] = useState('');
  return { layout, setLayout, editing, setEditing, open, setOpen, announcement, setAnnouncement };
}
type State = ReturnType<typeof useHomeWidgets>;
export function HomeWidgetActions({ state }: { state: State }) {
  return <div className="home-widget-actions"><button type="button" className="home-button" aria-pressed={state.editing} onClick={() => state.setEditing(!state.editing)}><SlidersHorizontal size={14} />{state.editing ? 'Done' : 'Edit layout'}</button><button type="button" className="home-button home-add-widgets" onClick={() => state.setOpen(true)}><Plus size={14} />Add widgets</button></div>;
}
function WidgetArt({ kind }: { kind: string }) {
  return <div className={`home-widget-art home-widget-art-${kind}`} aria-hidden="true">{kind === 'donut' ? <div className="widget-art-donut" /> : kind === 'number' ? <div className="widget-art-number"><span /><strong>—</strong><i /></div> : kind === 'table' ? <div className="widget-art-table">{[0, 1, 2, 3].map(i => <div key={i}><i /><span /><span /></div>)}</div> : <svg viewBox="0 0 180 90"><path d="M12 8V78H168" fill="none" stroke="currentColor" strokeOpacity=".2" />{kind === 'bars' ? [30, 54, 37, 64, 44, 22].map((h, i) => <rect key={i} x={25 + i * 22} y={78 - h} width="13" height={h} rx="2" fill="currentColor" opacity={.35 + i * .08} />) : <><path d="M15 65L38 56L59 61L81 38L102 44L125 27L148 34L167 15" fill={kind === 'area' ? 'currentColor' : 'none'} fillOpacity=".14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="M15 71L38 67L59 68L81 58L102 61L125 49L148 51L167 43" fill="none" stroke="#b29558" strokeWidth="2" /></>}</svg>}</div>;
}

// Drag to rearrange (Stage 10pl). A widget lifts off the board under the pointer, a dashed
// outline marks the slot it will land in, and the rest of the board slides to make room —
// the board's own order changes live, but the layout is saved once, on the drop. No
// library: pointer events, a grid, and WAAPI for the slides, all transform-only.
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)', SLIDE_MS = 240, START_PX = 4, EDGE_PX = 64;
type Drag = { id: HomeWidgetId; order: HomeWidgetId[]; grabX: number; grabY: number; width: number; height: number; zoom: number };
type Pending = { id: HomeWidgetId; el: HTMLElement; x: number; y: number; pointerId: number };
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollParent = (el: HTMLElement | null): HTMLElement => {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement as HTMLElement;
};
const inside = (r: DOMRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

export function HomeWidgetBoard({ state, widgets, irrelevant }: { state: State; widgets: Record<HomeWidgetId, ReactNode>; irrelevant: HomeWidgetId[] }) {
  const dialog = useRef<HTMLDialogElement>(null), board = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState(''), [category, setCategory] = useState('All'), [selected, setSelected] = useState<HomeWidgetId | null>(null);
  const [boardWidth, setBoardWidth] = useState(1300), [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null), pending = useRef<Pending | null>(null), pointer = useRef({ x: 0, y: 0 }), lastTarget = useRef<HomeWidgetId | null>(null);
  const frame = useRef(0), offsets = useRef(new Map<string, { left: number; top: number }>()), settle = useRef<{ id: HomeWidgetId; x: number; y: number; origin: string } | null>(null);
  const live = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: () => void; key: (e: KeyboardEvent) => void; scroll: () => void } | null>(null);
  const still = useRef(false), refocus = useRef<HomeWidgetId | null>(null), shape = useRef('');
  useEffect(() => { if (state.open) { setSelected(null); dialog.current?.showModal(); } else dialog.current?.close(); }, [state.open]);
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    setBoardWidth(el.clientWidth);
    const watch = new ResizeObserver(() => setBoardWidth(el.clientWidth));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const close = () => state.setOpen(false);
  const active = HOME_WIDGETS.find(w => w.id === selected);
  const add = (id: HomeWidgetId) => {
    if (state.layout.some(w => w.id === id)) return;
    const definition = HOME_WIDGETS.find(w => w.id === id)!;
    state.setLayout([...state.layout, { id, size: definition.size }]); state.setAnnouncement(`${definition.name} added to Home`); close();
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-home-widget="${id}"]`)?.focus(), 50);
  };
  const categories = ['All', ...new Set(HOME_WIDGETS.map(w => w.category))];
  const nameOf = (id: HomeWidgetId) => HOME_WIDGETS.find(w => w.id === id)!.name;
  const sizeOf = (id: HomeWidgetId) => state.layout.find(w => w.id === id)?.size ?? HOME_WIDGETS.find(w => w.id === id)!.size;
  const order = drag ? drag.order : state.layout.map(w => w.id);
  const spans = packHomeRows(order.map(sizeOf), homeWidgetColumns(boardWidth));

  // Slide every widget (and the drop outline) from where it was to where it now is.
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    // Only a change of order or size slides; a chart finishing its load or a window resize
    // moves things without motion.
    const signature = `${order.join()}|${spans.join()}|${boardWidth}`, sameWidth = shape.current.endsWith(`|${boardWidth}`);
    const animate = signature !== shape.current && sameWidth && !still.current && !reducedMotion();
    shape.current = signature; still.current = false;
    const landed = settle.current, next = new Map<string, { left: number; top: number }>();
    settle.current = null;
    for (const child of el.querySelectorAll<HTMLElement>(':scope > [data-flip]')) {
      const key = child.dataset.flip!, now = { left: child.offsetLeft, top: child.offsetTop };
      next.set(key, now);
      if (child.hasAttribute('data-dragging') || key === landed?.id) continue;
      const before = offsets.current.get(key);
      if (!animate || !before) continue;
      // Start from wherever a slide already in flight has it, so a quick second move never jumps.
      const [cx = 0, cy = 0] = getComputedStyle(child).translate.split(' ').map(parseFloat).map(n => (Number.isFinite(n) ? n : 0));
      const dx = before.left + cx - now.left, dy = before.top + cy - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      child.getAnimations().forEach(a => a.cancel());
      child.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: SLIDE_MS, easing: EASE });
    }
    offsets.current = next;
    // The drop: the lifted card settles from under the pointer into its slot.
    const card = landed && el.querySelector<HTMLElement>(`:scope > [data-home-widget="${landed.id}"]`);
    if (landed && card) {
      if (!reducedMotion()) {
        card.style.transformOrigin = landed.origin;
        card.animate([{ translate: `${landed.x - card.offsetLeft}px ${landed.y - card.offsetTop}px`, scale: '1.02' }, { translate: '0 0', scale: '1' }], { duration: SLIDE_MS, easing: EASE })
          .finished.then(() => { card.style.transformOrigin = ''; }, () => {});
      } else card.style.transformOrigin = '';
    }
    // The lifted card takes the shape of the slot it would land in, so it always shows how
    // it will sit (a compact tile lifted off a row of its own shrinks back to compact).
    const d = dragRef.current, lifted = el.querySelector<HTMLElement>(':scope > [data-dragging]'), drop = el.querySelector<HTMLElement>(':scope > [data-home-widget-drop]');
    if (d && lifted && drop) {
      const width = drop.offsetWidth;
      if (Math.abs(width - lifted.offsetWidth) > 1) {
        d.grabX *= width / lifted.offsetWidth;
        lifted.style.width = `${width}px`; lifted.style.height = 'auto';
        drop.style.minHeight = `${lifted.offsetHeight}px`;
        lifted.style.transformOrigin = `${d.grabX / d.zoom}px ${d.grabY / d.zoom}px`;
      }
      if (Math.abs(drop.offsetHeight - lifted.offsetHeight) > 1) lifted.style.height = `${drop.offsetHeight}px`;
    }
    // A card just lifted is placed under the pointer before the first paint.
    if (d && lifted && !lifted.style.translate) update();
    if (refocus.current) { el.querySelector<HTMLElement>(`[data-home-widget="${refocus.current}"] [data-home-widget-grip]`)?.focus(); refocus.current = null; }
  });

  // Keep the card under the pointer and find the slot it is over — on every pointer move
  // and every scroll, so it never waits on an animation frame.
  const update = () => {
    const d = dragRef.current, el = board.current;
    if (!d || !el) return;
    const { x, y } = pointer.current, box = el.getBoundingClientRect(), card = el.querySelector<HTMLElement>(':scope > [data-dragging]');
    if (card) card.style.translate = `${(x - d.grabX - box.left) / d.zoom}px ${(y - d.grabY - box.top) / d.zoom}px`;
    let over: HomeWidgetId | null = null;
    for (const child of el.querySelectorAll<HTMLElement>(':scope > [data-home-widget]:not([data-dragging])')) if (inside(child.getBoundingClientRect(), x, y)) over = child.dataset.homeWidget as HomeWidgetId;
    if (lastTarget.current && over !== lastTarget.current) {
      const prev = el.querySelector<HTMLElement>(`:scope > [data-home-widget="${lastTarget.current}"]`);
      if (!prev || !inside(prev.getBoundingClientRect(), x, y)) lastTarget.current = null;
    }
    let target = over && over !== lastTarget.current ? d.order.indexOf(over) : -1;
    if (target < 0 && y > box.bottom && d.order.at(-1) !== d.id) target = d.order.length - 1;
    if (target >= 0 && target !== d.order.indexOf(d.id)) {
      const next = [...d.order];
      next.splice(next.indexOf(d.id), 1); next.splice(target, 0, d.id);
      lastTarget.current = over;
      dragRef.current = { ...d, order: next }; setDrag(dragRef.current);
    }
  };
  // Near the top or bottom of the scrolling pane, scroll it — faster the closer the pointer.
  const edgeScroll = () => {
    const el = board.current;
    if (!dragRef.current || !el) return;
    const { y } = pointer.current, scroller = scrollParent(el), bounds = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
    const speed = y < bounds.top + EDGE_PX ? -(bounds.top + EDGE_PX - y) : y > bounds.bottom - EDGE_PX ? y - (bounds.bottom - EDGE_PX) : 0;
    if (speed) scroller.scrollTop += Math.max(-24, Math.min(24, speed / 3));
    frame.current = requestAnimationFrame(edgeScroll);
  };
  const stopListening = () => {
    const l = live.current;
    if (l) { window.removeEventListener('pointermove', l.move); window.removeEventListener('pointerup', l.up); window.removeEventListener('pointercancel', l.cancel); window.removeEventListener('keydown', l.key, true); window.removeEventListener('scroll', l.scroll, true); }
    live.current = null;
    cancelAnimationFrame(frame.current);
    document.documentElement.classList.remove('home-widget-grabbing');
  };
  const finish = (commit: boolean) => {
    const d = dragRef.current;
    stopListening(); pending.current = null; dragRef.current = null; lastTarget.current = null;
    if (!d) return;
    const card = board.current?.querySelector<HTMLElement>(':scope > [data-dragging]');
    if (card) {
      const [x = 0, y = 0] = card.style.translate.split(' ').map(parseFloat);
      settle.current = { id: d.id, x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0, origin: card.style.transformOrigin };
      card.style.translate = ''; card.style.width = ''; card.style.height = '';
    }
    setDrag(null);
    const before = state.layout.map(w => w.id);
    if (commit && d.order.some((id, i) => id !== before[i])) {
      state.setLayout(d.order.map(id => state.layout.find(w => w.id === id)!));
      state.setAnnouncement(`${nameOf(d.id)} moved to position ${d.order.indexOf(d.id) + 1} of ${d.order.length}`);
    }
  };
  function onMove(e: PointerEvent) {
    const p = pending.current;
    if (!p || e.pointerId !== p.pointerId) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (dragRef.current) { update(); return; }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < START_PX) return;
    const r = p.el.getBoundingClientRect(), zoom = r.width / p.el.offsetWidth || 1;
    dragRef.current = { id: p.id, order: state.layout.map(w => w.id), grabX: p.x - r.left, grabY: p.y - r.top, width: p.el.offsetWidth, height: p.el.offsetHeight, zoom };
    p.el.style.transformOrigin = `${(p.x - r.left) / zoom}px ${(p.y - r.top) / zoom}px`;
    p.el.style.width = `${p.el.offsetWidth}px`; p.el.style.height = `${p.el.offsetHeight}px`;
    document.documentElement.classList.add('home-widget-grabbing');
    setDrag(dragRef.current);
    frame.current = requestAnimationFrame(edgeScroll);
  }
  function onUp(e: PointerEvent) { if (e.pointerId === pending.current?.pointerId) finish(true); }
  function onCancel() { finish(false); }
  // Escape puts the widget back where it was.
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && dragRef.current) { e.preventDefault(); e.stopPropagation(); finish(false); } }
  useEffect(() => () => stopListening(), []);
  useEffect(() => { if (!state.editing && dragRef.current) finish(false); }, [state.editing]);
  const grab = (id: HomeWidgetId) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!state.editing || e.button !== 0 || pending.current || (e.target as HTMLElement).closest('select, button:not([data-home-widget-grip])')) return;
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-home-widget]');
    if (!el) return;
    e.preventDefault();
    pending.current = { id, el, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    pointer.current = { x: e.clientX, y: e.clientY };
    live.current = { move: onMove, up: onUp, cancel: onCancel, key: onKey, scroll: update };
    window.addEventListener('scroll', update, true);
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
  };
  // The keyboard way: arrows on the handle move it one place, at once (no slide — it is a keystroke).
  const nudge = (id: HomeWidgetId) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    const index = state.layout.findIndex(w => w.id === id), target = index + step;
    if (target < 0 || target >= state.layout.length) return;
    still.current = true; refocus.current = id;
    state.setLayout(moveHomeWidget(state.layout, id, target));
    state.setAnnouncement(`${nameOf(id)} moved to position ${target + 1} of ${state.layout.length}`);
  };

  const card = (id: HomeWidgetId, span: number | null) => {
    const entry = { id, size: sizeOf(id) }, definition = HOME_WIDGETS.find(w => w.id === id)!, lifted = drag?.id === id;
    // Always an object: React then clears only the span when the card lifts, never the width set on it.
    const style = !lifted && span ? { gridColumn: `span ${span}` } : {};
    return <div className={`home-widget home-widget-${entry.size}`} data-home-widget={id} data-flip={id} key={id} tabIndex={-1} style={style} {...(lifted ? { 'data-dragging': '' } : {})} title={irrelevant.includes(id) ? 'Not relevant for firm' : undefined}>
      {state.editing && <div className="home-widget-tools" onPointerDown={grab(id)}><button type="button" data-home-widget-grip aria-label={`Move ${definition.name}`} title="Drag to move, or use the arrow keys" aria-describedby="home-widget-move-help" onKeyDown={nudge(id)}><GripVertical size={15} /></button><span>{definition.name}</span><select aria-label={`Size of ${definition.name}`} value={entry.size} onChange={e => state.setLayout(state.layout.map(w => w.id === id ? { ...w, size: e.target.value as HomeWidgetSize } : w))}><option value="quarter">Compact</option><option value="half">Half</option><option value="wide">Wide</option><option value="full">Full</option></select><button type="button" aria-label={`Remove ${definition.name}`} onClick={() => { state.setLayout(state.layout.filter(w => w.id !== id)); state.setAnnouncement(`${definition.name} removed from Home`); }}><X size={13} /></button></div>}
      {widgets[id]}
    </div>;
  };
  return <><div ref={board} className={`home-widget-board ${state.editing ? 'home-widget-editing' : ''} ${drag ? 'home-widget-board-dragging' : ''}`} data-home-widget-board>
    {/* One keyed list, the lifted card last: React then MOVES its node rather than rebuilding it. */}
    {[...order.map((id, index) => drag?.id === id
      ? <div key="__drop" className="home-widget-drop" data-flip="__drop" data-home-widget-drop aria-hidden="true" style={{ gridColumn: `span ${spans[index]}`, minHeight: drag.height }} />
      : card(id, spans[index])), ...(drag ? [card(drag.id, null)] : [])]}
    {!state.layout.length && <div className="home-widget-empty"><LayoutGrid size={30} strokeWidth={1} /><h2>Make Home your own</h2><p>Add the widgets you want to see here.</p><button type="button" className="home-button home-add-widgets" onClick={() => state.setOpen(true)}><Plus size={14} />Add widgets</button></div>}
  </div>{state.editing && <div className="home-layout-note"><span id="home-widget-move-help">Drag a widget by its bar to move it, or focus its handle and use the arrow keys. Each view keeps its own layout.</span><button type="button" onClick={() => state.setLayout(DEFAULT_HOME_LAYOUT)}>Restore default layout</button></div>}
  <span role="status" className="sr-only">{state.announcement}</span>
  <dialog ref={dialog} className="home-widget-dialog" aria-labelledby="home-widget-dialog-title" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    {state.open && <div className="home-widget-dialog-content"><div className="home-widget-dialog-heading"><div>{active && <button type="button" className="home-widget-back" onClick={() => setSelected(null)}><ArrowLeft size={13} />All widgets</button>}<span className="home-eyebrow">BUILD YOUR OVERVIEW</span><h2 id="home-widget-dialog-title">{active?.name ?? 'Widget library'}</h2></div><button type="button" className="home-widget-close" aria-label="Close widget library" onClick={close}><X size={19} /></button></div>
    {!active ? <><div className="home-library-filters"><label className="home-widget-search"><Search size={15} /><input type="search" aria-label="Search widgets" placeholder="Find a widget…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Widget category" value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></div><div className="home-widget-catalog">{HOME_WIDGETS.filter(w => (category === 'All' || w.category === category) && `${w.name} ${w.description}`.toLowerCase().includes(search.toLowerCase())).map(w => <button type="button" className={`home-widget-card ${irrelevant.includes(w.id) ? 'home-widget-not-relevant' : ''}`} key={w.id} data-widget-catalog={w.id} onClick={() => setSelected(w.id)} title={irrelevant.includes(w.id) ? 'Not relevant for firm' : `Preview ${w.name}`}><WidgetArt kind={w.kind} /><span className="home-widget-card-title">{w.name}{state.layout.some(e => e.id === w.id) && <Check size={13} aria-label="Added" />}</span><small>{w.description}</small>{irrelevant.includes(w.id) && <span className="home-relevance-tooltip">Not relevant for firm</span>}</button>)}{!HOME_WIDGETS.some(w => (category === 'All' || w.category === category) && `${w.name} ${w.description}`.toLowerCase().includes(search.toLowerCase())) && <p className="home-widget-no-results">No widgets match your search.</p>}</div></> : <><span className="home-widget-category">{active.category}</span><div className={`home-widget-live-preview ${irrelevant.includes(active.id) ? 'home-widget-not-relevant' : ''}`} tabIndex={0} title={irrelevant.includes(active.id) ? 'Not relevant for firm' : undefined}>{widgets[active.id]}{irrelevant.includes(active.id) && <span className="home-relevance-tooltip">Not relevant for firm</span>}</div><p className="home-widget-description">{active.description}</p><div className="home-widget-dialog-footer"><button type="button" className="home-button home-add-widgets" disabled={state.layout.some(w => w.id === active.id)} onClick={() => add(active.id)}>{state.layout.some(w => w.id === active.id) ? <><Check size={14} />Added to Home</> : <><Plus size={14} />Add to Home</>}</button><button type="button" className="home-button" onClick={close}>Cancel</button></div></>}
    </div>}
  </dialog></>;
}
