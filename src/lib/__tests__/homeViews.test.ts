import assert from 'node:assert/strict';
import { sanitizeViews, addView, duplicateView, renameView, removeView, setActiveLayout, activeView, uniqueViewId, slugify, cleanName, chooseViews, MAX_VIEWS, HOME_VIEW_PRESETS, defaultViews, type HomeView, type HomeViewsState } from '../homeViews';
import { readHomeLayout, DEFAULT_HOME_LAYOUT, type HomeWidgetEntry } from '../homeWidgets';
import { validateViews } from '../../../functions/api/home-views.js';

const layout: HomeWidgetEntry[] = [{ id: 'aum', size: 'full' }, { id: 'cash', size: 'quarter' }];
const base: HomeViewsState = { views: [{ id: 'overview', name: 'Overview', layout }], activeId: 'overview' };

// ── slug / name helpers ──────────────────────────────────────────────────────
assert.equal(slugify('Equity Dashboard'), 'equity-dashboard');
assert.equal(slugify('   '), 'view', 'a slug is never empty');
assert.equal(uniqueViewId('overview', ['overview']), 'overview-2', 'a taken id is made unique');
assert.equal(uniqueViewId('Equity', []), 'equity');
assert.equal(cleanName('  Big   Name  '), 'Big Name');
assert.equal(cleanName(''), 'Untitled view', 'a blank name falls back, never empty');

// ── sanitizeViews: untrusted storage in, a clean set out ─────────────────────
const clean = sanitizeViews([
  { id: 'overview', name: 'Overview', layout: [{ id: 'aum', size: 'full' }, { id: 'nope', size: 'full' }, { id: 'aum', size: 'full' }] },
  { id: 'overview', name: 'Duplicate id', layout: [] },
  null, 42, { name: 'No id', layout: 'x' },
]);
assert.equal(clean.length, 3, 'null and non-objects are dropped');
assert.deepEqual(clean[0].layout, [{ id: 'aum', size: 'full' }], 'unknown and duplicate widgets are dropped from a layout');
assert.notEqual(clean[1].id, clean[0].id, 'a duplicate view id is made unique');
assert.deepEqual(clean[2].layout, [], 'a malformed layout becomes empty, never invalid');
assert.equal(sanitizeViews(Array.from({ length: 50 }, (_, i) => ({ id: `v${i}`, name: `V${i}`, layout: [] }))).length, MAX_VIEWS, 'the set is capped');

// ── addView: appended, activated, and capped ─────────────────────────────────
const added = addView(base, 'Equity');
assert.equal(added.views.length, 2);
assert.equal(added.activeId, added.views[1].id, 'a new view becomes active');
assert.equal(activeView(added).name, 'Equity');

// ── setActiveLayout: only the active view changes ────────────────────────────
const relaid = setActiveLayout(added, [{ id: 'performance', size: 'full' }]);
assert.deepEqual(activeView(relaid).layout, [{ id: 'performance', size: 'full' }]);
assert.deepEqual(relaid.views[0].layout, layout, 'other views are untouched');

// ── duplicateView: a copy sits after the source and becomes active ───────────
const dup = duplicateView(base, 'overview');
assert.equal(dup.views.length, 2);
assert.equal(dup.activeId, dup.views[1].id);
assert.deepEqual(dup.views[1].layout, layout, 'the copy carries the source layout');
assert.notEqual(dup.views[1].id, 'overview', 'the copy has its own id');

// ── renameView ───────────────────────────────────────────────────────────────
assert.equal(renameView(base, 'overview', 'Main').views[0].name, 'Main');
assert.equal(renameView(base, 'overview', '   ').views[0].name, 'Overview', 'a blank rename keeps the old name');

// ── removeView: a dashboard always keeps at least one view ───────────────────
assert.equal(removeView(base, 'overview'), base, 'the last view is never removed');
const two = addView(base, 'Second');
const removed = removeView(two, two.activeId);
assert.equal(removed.views.length, 1);
assert.equal(removed.activeId, 'overview', 'the active view falls back to a survivor');

// ── Ready-made themed templates (never a blank canvas) ───────────────────────
assert.ok(HOME_VIEW_PRESETS.length >= 3 && HOME_VIEW_PRESETS.every(p => p.layout.length > 0), 'themed templates exist and none is blank');
for (const p of HOME_VIEW_PRESETS) assert.equal(readHomeLayout(p.layout)?.length, p.layout.length, `preset ${p.id} uses only real widgets`);
assert.ok(defaultViews().length >= 3 && defaultViews().every(v => v.layout.length > 0), 'a fresh book opens on several populated views');

// The family's baskets lead the default Home allocation (17 Nov: "their buckets").
const bi = DEFAULT_HOME_LAYOUT.findIndex(w => w.id === 'baskets'), ai = DEFAULT_HOME_LAYOUT.findIndex(w => w.id === 'allocation');
assert.ok(bi >= 0 && ai >= 0 && bi < ai, 'the basket donut leads the default, the asset-class donut sits beside it');

// ── Shared store: validateViews (server side) ────────────────────────────────
// The endpoint stores SHAPE only — never a figure — so a view carrying an unknown
// widget is kept and dropped by the page, and a name is trimmed, never refused.
{
  const r = validateViews({ views: [{ id: 'a', name: '  My   View ', layout: [{ id: 'aum', size: 'huge' }, { id: 'nope', size: 'full' }, { id: 'aum', size: 'wide' }] }] });
  assert.equal(r.error, undefined);
  assert.equal(r.views!.length, 1);
  assert.equal(r.views![0].name, 'My View', 'a name is trimmed and collapsed');
  // SHAPE ONLY: a bad size falls to full and a duplicate id drops; a slug the
  // current build will not know ("nope") is KEPT here and dropped by the page's
  // own `sanitizeViews`, exactly as the tile store keeps an unknown metric id.
  assert.deepEqual(r.views![0].layout, [{ id: 'aum', size: 'full' }, { id: 'nope', size: 'full' }], 'bad size → full, duplicate id dropped, unknown slug kept for the page');
}
assert.ok(validateViews({ views: 'x' }).error, 'a non-array views is refused');
assert.ok(validateViews(null).error, 'an empty body is refused');
assert.equal(validateViews({ views: [] }).error, undefined, 'an empty views list is allowed — the page keeps one itself');
assert.equal(validateViews({ views: [{ id: 'A B', name: 'x', layout: [] }, { id: 'ok', name: 'y', layout: [] }] }).views!.length, 1, 'a view whose id is not a slug is dropped');
assert.ok(validateViews({ views: Array.from({ length: MAX_VIEWS + 1 }, (_, i) => ({ id: `v${i}`, name: `V${i}`, layout: [] })) }).error, 'more views than the dashboard keeps is refused (the page caps before sending)');

// ── Shared store: chooseViews (which side wins on load) ──────────────────────
// an unconfirmed local change  >  the shared store  >  this browser's copy.
const vA: HomeView[] = [{ id: 'a', name: 'A', layout: [] }];
const vB: HomeView[] = [{ id: 'b', name: 'B', layout: [] }];
assert.deepEqual(chooseViews({ localViews: vA, localSynced: false, sharedViews: vB }), { adopt: null, push: true }, 'an unconfirmed local change wins and is pushed, never overwritten');
assert.deepEqual(chooseViews({ localViews: vA, localSynced: true, sharedViews: vB }), { adopt: vB, push: false }, 'a confirmed local yields to the shared store (another device may be newer)');
assert.deepEqual(chooseViews({ localViews: vA, localSynced: true, sharedViews: null }), { adopt: null, push: false }, 'store empty and nothing unconfirmed → keep local, no push');
assert.deepEqual(chooseViews({ localViews: vA, localSynced: true, sharedViews: [] }), { adopt: null, push: true }, 'store connected but empty → seed it from this browser');

console.log('homeViews: all assertions passed');
