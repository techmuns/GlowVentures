// NAMED HOME VIEWS — several dashboards a reader can build, name and switch between.
//
// *"Look at all the widgets they have and the view function they have for the home
//  page where people can see many views."* — the family, 17 Nov 2026.
//
// Home already kept ONE widget layout (`homeWidgets.ts`). This wraps that one
// layout into a SET of named views: the switcher on Home chooses which view's
// layout the widget board shows and edits, and every edit saves back to that view.
//
// ── WHERE A VIEW IS KEPT (for now) ──────────────────────────────────────────
//
// In this browser (`localStorage`), the same place the single layout lived, so a
// reader's existing arrangement carries forward unchanged (see `migratedViews`).
// The follow-up moves these to the dashboard's shared store (`/api/tile-sets`'s
// sibling), so the same named views open on any device — the hook `useHomeViews`
// is the only seam that changes. A VIEW IS A LIST OF WIDGET IDS AND SIZES AND A
// NAME, never a figure: the page decides what a widget means from the book at
// render time, so nothing stored here can put a number on screen.
import { useEffect, useState } from 'react';
import { DEFAULT_HOME_LAYOUT, HOME_LAYOUT_KEY, LEGACY_HOME_LAYOUT_KEY, migrateHomeLayout, readHomeLayout, type HomeWidgetEntry } from './homeWidgets';

export type HomeView = { id: string; name: string; layout: HomeWidgetEntry[] };
export type HomeViewsState = { views: HomeView[]; activeId: string };

export const HOME_VIEWS_KEY = 'glow:home:views:v1';
/** More dashboards than anyone curates by hand; a longer list is a mistake, not a set. */
export const MAX_VIEWS = 24;
const MAX_NAME = 48;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** A readable, bounded slug for a view id, derived from its name; never empty. */
export const slugify = (name: string): string =>
  (name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'view';

/** A slug not already taken, so two views named the same still address distinctly. */
export function uniqueViewId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = slugify(base);
  if (!set.has(root)) return root;
  for (let n = 2; ; n++) {
    const id = `${root}-${n}`.slice(0, 40);
    if (!set.has(id)) return id;
  }
}

/** A view name, trimmed and bounded; falls back rather than storing an empty string. */
export function cleanName(name: unknown, fallback = 'Untitled view'): string {
  const s = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME) : '';
  return s || fallback;
}

/** One view read from untrusted storage: a clean id/name and a sanitized layout, or null. */
export function sanitizeView(raw: unknown, taken: Set<string>): HomeView | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { id?: unknown; name?: unknown; layout?: unknown };
  const name = cleanName(r.name);
  const base = typeof r.id === 'string' && ID.test(r.id) ? r.id : slugify(name);
  const id = taken.has(base) ? uniqueViewId(base, taken) : base;
  taken.add(id);
  // An empty layout is legitimate — the board shows its "add widgets" empty state.
  return { id, name, layout: readHomeLayout(r.layout) ?? [] };
}

export function sanitizeViews(raw: unknown): HomeView[] {
  if (!Array.isArray(raw)) return [];
  const taken = new Set<string>();
  const out: HomeView[] = [];
  for (const v of raw) {
    const view = sanitizeView(v, taken);
    if (view) out.push(view);
    if (out.length >= MAX_VIEWS) break;
  }
  return out;
}

export const DEFAULT_VIEW_NAME = 'Overview';
export const defaultViews = (): HomeView[] => [{ id: 'overview', name: DEFAULT_VIEW_NAME, layout: DEFAULT_HOME_LAYOUT }];

/**
 * FIRST RUN CARRIES A READER'S EXISTING LAYOUT FORWARD. Before views existed,
 * Home kept one arrangement in `glow:home:widgets:v2`. If that is present and no
 * views are saved yet, it becomes a named view ("My overview") rather than being
 * silently replaced by the default — nothing a reader arranged is lost.
 */
function migratedViews(): HomeView[] | null {
  try {
    // Honour BOTH legacy keys exactly as the single-layout hook did: the v2 key
    // first, else the v1 key through `migrateHomeLayout` (which also rebalances a
    // simplified summary row). A reader's personal removals must survive the move.
    const saved = localStorage.getItem(HOME_LAYOUT_KEY);
    const layout = saved != null
      ? readHomeLayout(JSON.parse(saved))
      : migrateHomeLayout(JSON.parse(localStorage.getItem(LEGACY_HOME_LAYOUT_KEY) ?? 'null'));
    return layout && layout.length ? [{ id: 'my-overview', name: 'My overview', layout }] : null;
  } catch {
    return null;
  }
}

export function readHomeViews(): HomeViewsState {
  try {
    const raw = localStorage.getItem(HOME_VIEWS_KEY);
    if (raw != null) {
      const parsed = JSON.parse(raw) as { views?: unknown; activeId?: unknown };
      const views = sanitizeViews(parsed.views);
      if (views.length) {
        const activeId = typeof parsed.activeId === 'string' && views.some(v => v.id === parsed.activeId) ? parsed.activeId : views[0].id;
        return { views, activeId };
      }
    }
    const migrated = migratedViews();
    if (migrated?.length) return { views: migrated, activeId: migrated[0].id };
  } catch {
    /* private mode, or a value this build cannot parse → the default below */
  }
  const views = defaultViews();
  return { views, activeId: views[0].id };
}

export function writeHomeViews(state: HomeViewsState) {
  try { localStorage.setItem(HOME_VIEWS_KEY, JSON.stringify(state)); } catch { /* private mode: keep this session's views */ }
}

// ── PURE TRANSFORMS (testable without a browser) ─────────────────────────────

export const activeView = (s: HomeViewsState): HomeView => s.views.find(v => v.id === s.activeId) ?? s.views[0];

export function setActiveLayout(s: HomeViewsState, layout: HomeWidgetEntry[]): HomeViewsState {
  return { ...s, views: s.views.map(v => (v.id === s.activeId ? { ...v, layout } : v)) };
}

/** Add a new view and make it active. A no-op past the cap, so the caller can report it. */
export function addView(s: HomeViewsState, name: string, layout: HomeWidgetEntry[] = []): HomeViewsState {
  if (s.views.length >= MAX_VIEWS) return s;
  const id = uniqueViewId(name || DEFAULT_VIEW_NAME, s.views.map(v => v.id));
  return { views: [...s.views, { id, name: cleanName(name), layout }], activeId: id };
}

/** Copy the active view beside itself and make the copy active. */
export function duplicateView(s: HomeViewsState, id: string): HomeViewsState {
  const index = s.views.findIndex(v => v.id === id);
  if (index < 0 || s.views.length >= MAX_VIEWS) return s;
  const src = s.views[index];
  const newId = uniqueViewId(`${src.name} copy`, s.views.map(v => v.id));
  const copy: HomeView = { id: newId, name: cleanName(`${src.name} copy`), layout: src.layout.map(e => ({ ...e })) };
  const views = [...s.views];
  views.splice(index + 1, 0, copy);
  return { views, activeId: newId };
}

export function renameView(s: HomeViewsState, id: string, name: string): HomeViewsState {
  return { ...s, views: s.views.map(v => (v.id === id ? { ...v, name: cleanName(name, v.name) } : v)) };
}

/** Remove a view. A set always keeps at least one, so Home never has nothing to show. */
export function removeView(s: HomeViewsState, id: string): HomeViewsState {
  if (s.views.length <= 1) return s;
  const views = s.views.filter(v => v.id !== id);
  return { views, activeId: s.activeId === id ? views[0].id : s.activeId };
}

// ── THE HOOK: STATE + THIS BROWSER'S COPY ────────────────────────────────────
// A thin wrapper so Home reads one object. The shared-store upgrade replaces the
// body here (load/save against the endpoint) without changing Home.
export function useHomeViews() {
  const [state, setState] = useState<HomeViewsState>(() => readHomeViews());
  useEffect(() => { writeHomeViews(state); }, [state]);
  return {
    views: state.views,
    activeId: state.activeId,
    active: activeView(state),
    atCap: state.views.length >= MAX_VIEWS,
    setActiveId: (id: string) => setState(s => (s.views.some(v => v.id === id) ? { ...s, activeId: id } : s)),
    setActiveLayout: (layout: HomeWidgetEntry[]) => setState(s => setActiveLayout(s, layout)),
    addView: (name: string, layout?: HomeWidgetEntry[]) => setState(s => addView(s, name, layout)),
    duplicateActive: () => setState(s => duplicateView(s, s.activeId)),
    renameActive: (name: string) => setState(s => renameView(s, s.activeId, name)),
    removeActive: () => setState(s => removeView(s, s.activeId)),
  };
}
