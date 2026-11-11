import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, GripVertical, LayoutGrid, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_HOME_LAYOUT, HOME_LAYOUT_KEY, HOME_WIDGETS, moveHomeWidget, readHomeLayout, type HomeWidgetEntry, type HomeWidgetId, type HomeWidgetSize } from '@/lib/homeWidgets';

export function useHomeWidgets() {
  const [layout, update] = useState<HomeWidgetEntry[]>(() => {
    try { return readHomeLayout(JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY) ?? 'null')) ?? DEFAULT_HOME_LAYOUT; } catch { return DEFAULT_HOME_LAYOUT; }
  });
  const [editing, setEditing] = useState(false), [open, setOpen] = useState(false), [announcement, setAnnouncement] = useState('');
  const setLayout = (next: HomeWidgetEntry[]) => { update(next); try { localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(next)); } catch { /* Keep the current session's layout if storage is unavailable. */ } };
  return { layout, setLayout, editing, setEditing, open, setOpen, announcement, setAnnouncement };
}
type State = ReturnType<typeof useHomeWidgets>;
export function HomeWidgetActions({ state }: { state: State }) {
  return <div className="home-widget-actions"><button type="button" className="home-button" aria-pressed={state.editing} onClick={() => state.setEditing(!state.editing)}><SlidersHorizontal size={14} />{state.editing ? 'Done' : 'Edit layout'}</button><button type="button" className="home-button home-add-widgets" onClick={() => state.setOpen(true)}><Plus size={14} />Add widgets</button></div>;
}
function WidgetArt({ kind }: { kind: string }) {
  return <div className={`home-widget-art home-widget-art-${kind}`} aria-hidden="true">{kind === 'donut' ? <div className="widget-art-donut" /> : kind === 'number' ? <div className="widget-art-number"><span /><strong>—</strong><i /></div> : kind === 'table' ? <div className="widget-art-table">{[0, 1, 2, 3].map(i => <div key={i}><i /><span /><span /></div>)}</div> : <svg viewBox="0 0 180 90"><path d="M12 8V78H168" fill="none" stroke="currentColor" strokeOpacity=".2" />{kind === 'bars' ? [30, 54, 37, 64, 44, 22].map((h, i) => <rect key={i} x={25 + i * 22} y={78 - h} width="13" height={h} rx="2" fill="currentColor" opacity={.35 + i * .08} />) : <><path d="M15 65L38 56L59 61L81 38L102 44L125 27L148 34L167 15" fill={kind === 'area' ? 'currentColor' : 'none'} fillOpacity=".14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="M15 71L38 67L59 68L81 58L102 61L125 49L148 51L167 43" fill="none" stroke="#b29558" strokeWidth="2" /></>}</svg>}</div>;
}

export function HomeWidgetBoard({ state, widgets, irrelevant }: { state: State; widgets: Record<HomeWidgetId, ReactNode>; irrelevant: HomeWidgetId[] }) {
  const drag = useRef<HomeWidgetId | null>(null), dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState(''), [category, setCategory] = useState('All'), [selected, setSelected] = useState<HomeWidgetId | null>(null);
  useEffect(() => { if (state.open) { setSelected(null); dialog.current?.showModal(); } else dialog.current?.close(); }, [state.open]);
  const close = () => state.setOpen(false);
  const active = HOME_WIDGETS.find(w => w.id === selected);
  const add = (id: HomeWidgetId) => {
    if (state.layout.some(w => w.id === id)) return;
    const definition = HOME_WIDGETS.find(w => w.id === id)!;
    state.setLayout([...state.layout, { id, size: definition.size }]); state.setAnnouncement(`${definition.name} added to Home`); close();
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-home-widget="${id}"]`)?.focus(), 50);
  };
  const categories = ['All', ...new Set(HOME_WIDGETS.map(w => w.category))];
  return <><div className={`home-widget-board ${state.editing ? 'home-widget-editing' : ''}`} data-home-widget-board>
    {state.layout.map((entry, index) => {
      const definition = HOME_WIDGETS.find(w => w.id === entry.id)!;
      return <div className={`home-widget home-widget-${entry.size}`} data-home-widget={entry.id} key={entry.id} tabIndex={-1} title={irrelevant.includes(entry.id) ? 'Not relevant for firm' : undefined}
        onDragOver={e => { if (state.editing) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (drag.current) state.setLayout(moveHomeWidget(state.layout, drag.current, index)); drag.current = null; }}>
        {state.editing && <div className="home-widget-tools"><button type="button" draggable aria-label={`Drag ${definition.name}`} title="Drag to reorder" onDragStart={e => { drag.current = entry.id; e.dataTransfer.setData('text/plain', entry.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { drag.current = null; }}><GripVertical size={15} /></button><span>{definition.name}</span><button type="button" disabled={index === 0} aria-label={`Move ${definition.name} earlier`} onClick={() => state.setLayout(moveHomeWidget(state.layout, entry.id, index - 1))}><ArrowUp size={13} /></button><button type="button" disabled={index === state.layout.length - 1} aria-label={`Move ${definition.name} later`} onClick={() => state.setLayout(moveHomeWidget(state.layout, entry.id, index + 1))}><ArrowDown size={13} /></button><select aria-label={`Size of ${definition.name}`} value={entry.size} onChange={e => state.setLayout(state.layout.map(w => w.id === entry.id ? { ...w, size: e.target.value as HomeWidgetSize } : w))}><option value="quarter">Compact</option><option value="half">Half</option><option value="full">Full</option></select><button type="button" aria-label={`Remove ${definition.name}`} onClick={() => { state.setLayout(state.layout.filter(w => w.id !== entry.id)); state.setAnnouncement(`${definition.name} removed from Home`); }}><X size={13} /></button></div>}
        {widgets[entry.id]}
      </div>;
    })}
    {!state.layout.length && <div className="home-widget-empty"><LayoutGrid size={30} strokeWidth={1} /><h2>Make Home your own</h2><p>Add the widgets you want to see here.</p><button type="button" className="home-button home-add-widgets" onClick={() => state.setOpen(true)}><Plus size={14} />Add widgets</button></div>}
  </div>{state.editing && <div className="home-layout-note"><span>Drag a widget or use the arrows to reorder. Your layout is saved in this browser.</span><button type="button" onClick={() => state.setLayout(DEFAULT_HOME_LAYOUT)}>Restore default layout</button></div>}
  <span role="status" className="sr-only">{state.announcement}</span>
  <dialog ref={dialog} className="home-widget-dialog" aria-labelledby="home-widget-dialog-title" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    {state.open && <div className="home-widget-dialog-content"><div className="home-widget-dialog-heading"><div>{active && <button type="button" className="home-widget-back" onClick={() => setSelected(null)}><ArrowLeft size={13} />All widgets</button>}<span className="home-eyebrow">BUILD YOUR OVERVIEW</span><h2 id="home-widget-dialog-title">{active?.name ?? 'Widget library'}</h2></div><button type="button" className="home-widget-close" aria-label="Close widget library" onClick={close}><X size={19} /></button></div>
    {!active ? <><div className="home-library-filters"><label className="home-widget-search"><Search size={15} /><input type="search" aria-label="Search widgets" placeholder="Find a widget…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Widget category" value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></div><div className="home-widget-catalog">{HOME_WIDGETS.filter(w => (category === 'All' || w.category === category) && `${w.name} ${w.description}`.toLowerCase().includes(search.toLowerCase())).map(w => <button type="button" className={`home-widget-card ${irrelevant.includes(w.id) ? 'home-widget-not-relevant' : ''}`} key={w.id} data-widget-catalog={w.id} onClick={() => setSelected(w.id)} title={irrelevant.includes(w.id) ? 'Not relevant for firm' : `Preview ${w.name}`}><WidgetArt kind={w.kind} /><span className="home-widget-card-title">{w.name}{state.layout.some(e => e.id === w.id) && <Check size={13} aria-label="Added" />}</span><small>{w.description}</small>{irrelevant.includes(w.id) && <span className="home-relevance-tooltip">Not relevant for firm</span>}</button>)}{!HOME_WIDGETS.some(w => (category === 'All' || w.category === category) && `${w.name} ${w.description}`.toLowerCase().includes(search.toLowerCase())) && <p className="home-widget-no-results">No widgets match your search.</p>}</div></> : <><span className="home-widget-category">{active.category}</span><div className={`home-widget-live-preview ${irrelevant.includes(active.id) ? 'home-widget-not-relevant' : ''}`} tabIndex={0} title={irrelevant.includes(active.id) ? 'Not relevant for firm' : undefined}>{widgets[active.id]}{irrelevant.includes(active.id) && <span className="home-relevance-tooltip">Not relevant for firm</span>}</div><p className="home-widget-description">{active.description}</p><div className="home-widget-dialog-footer"><button type="button" className="home-button home-add-widgets" disabled={state.layout.some(w => w.id === active.id)} onClick={() => add(active.id)}>{state.layout.some(w => w.id === active.id) ? <><Check size={14} />Added to Home</> : <><Plus size={14} />Add to Home</>}</button><button type="button" className="home-button" onClick={close}>Cancel</button></div></>}
    </div>}
  </dialog></>;
}
