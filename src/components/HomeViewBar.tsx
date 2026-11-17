import { useEffect, useRef, useState } from 'react';
import { Copy, LayoutDashboard, Pencil, Plus, Trash2, X } from 'lucide-react';
import { HOME_VIEW_PRESETS } from '@/lib/homeViews';
import type { useHomeViews } from '@/lib/homeViews';

type Controller = ReturnType<typeof useHomeViews>;

/**
 * THE VIEW SWITCHER — several named dashboards on one Home.
 *
 * *"the view function they have for the home page where people can see many
 *  views."* — the family, 17 Nov 2026. The chips are the views: one click switches
 * which view the widget board below shows and edits; a double-click (or the pencil)
 * renames the active one; New / Duplicate / Delete manage the set. A dashboard
 * always keeps at least one view, and deleting one asks first, so a curated
 * arrangement is never lost to a stray click.
 */
export function HomeViewBar({ controller }: { controller: Controller }) {
  const { views, activeId, active, atCap } = controller;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(active.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // The name field, the delete prompt and the "new view" menu reset when the active
  // view changes. (Renaming is NOT reset here: creating a new view changes the active
  // id AND opens rename mode in the same click, so resetting it would cancel that.)
  useEffect(() => { setDraft(active.name); setConfirmDelete(false); setAdding(false); }, [activeId]);
  useEffect(() => { if (renaming) input.current?.select(); }, [renaming]);
  useEffect(() => {
    if (!adding) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAdding(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [adding]);

  const commitRename = () => { controller.renameActive(draft); setRenaming(false); };

  return (
    <div className="home-view-bar" data-home-view-bar data-home-view-active={activeId}>
      <LayoutDashboard size={15} aria-hidden className="home-view-icon" />
      <div className="home-view-tabs" role="group" aria-label="Dashboard views">
        {views.map(v => (v.id === activeId && renaming ? (
          <form key={v.id} className="home-view-rename" onSubmit={e => { e.preventDefault(); commitRename(); }}>
            <label><span className="sr-only">View name</span>
              <input ref={input} value={draft} maxLength={48} placeholder="View name"
                onChange={e => setDraft(e.target.value)} onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Escape') { setDraft(active.name); setRenaming(false); } }} autoFocus /></label>
          </form>
        ) : (
          <button key={v.id} type="button" data-home-view={v.id} aria-pressed={v.id === activeId}
            onClick={() => controller.setActiveId(v.id)}
            onDoubleClick={() => { if (v.id === activeId) setRenaming(true); }}
            title={v.id === activeId ? 'Double-click to rename' : `Switch to ${v.name}`}>{v.name}</button>
        )))}
        <div className="home-view-newwrap">
          <button type="button" className="home-view-add" aria-haspopup="menu" aria-expanded={adding}
            onClick={() => setAdding(a => !a)} disabled={atCap}
            aria-label="New view" title={atCap ? 'That is the most views a dashboard keeps' : 'New view'}><Plus size={15} /></button>
          {adding && (<>
            <button type="button" className="home-view-menu-backdrop" aria-hidden tabIndex={-1} onClick={() => setAdding(false)} />
            <div className="home-view-menu" role="menu" aria-label="Start a new view from">
              <span className="home-view-menu-head">Start from a template</span>
              {HOME_VIEW_PRESETS.map(p => (
                <button key={p.id} type="button" role="menuitem" data-home-view-preset={p.id}
                  onClick={() => { controller.addView(p.name, p.layout.map(e => ({ ...e }))); setAdding(false); }}>{p.name}</button>
              ))}
              <button type="button" role="menuitem" className="home-view-menu-blank"
                onClick={() => { controller.addView('New view', []); setAdding(false); setRenaming(true); }}>Blank view</button>
            </div>
          </>)}
        </div>
      </div>
      <div className="home-view-actions">
        <button type="button" className="home-button home-view-icon-button" onClick={() => setRenaming(true)} aria-label="Rename view" title="Rename this view"><Pencil size={13} /></button>
        <button type="button" className="home-button home-view-icon-button" onClick={() => controller.duplicateActive()}
          disabled={atCap} aria-label="Duplicate view" title={atCap ? 'That is the most views a dashboard keeps' : 'Duplicate this view'}><Copy size={13} /></button>
        {confirmDelete ? (
          <span className="home-view-confirm">
            <button type="button" className="home-button home-view-danger" onClick={() => { controller.removeActive(); setConfirmDelete(false); }}>Delete “{active.name}”?</button>
            <button type="button" className="home-button home-view-icon-button" onClick={() => setConfirmDelete(false)} aria-label="Keep view" title="Keep"><X size={13} /></button>
          </span>
        ) : (
          <button type="button" className="home-button home-view-icon-button" onClick={() => setConfirmDelete(true)}
            disabled={views.length <= 1} aria-label="Delete view" title={views.length <= 1 ? 'A dashboard keeps at least one view' : 'Delete this view'}><Trash2 size={13} /></button>
        )}
      </div>
    </div>
  );
}
