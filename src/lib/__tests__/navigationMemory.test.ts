import assert from 'node:assert/strict';
import { createNavigationMemory, validNavigationState } from '../navigationMemory';

let raw: string | null = null;
const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
const memory = createNavigationMemory(() => storage, 3);
const string = (value: unknown) => typeof value === 'string' ? value : null;
const strings = (value: unknown) => Array.isArray(value) && value.every(s => typeof s === 'string') ? value : null;
memory.write('cash-entry', '/monitor:section', 'Cash');
memory.write('cash-entry', '/monitor:expanded', ['kotak']);
memory.write('all-entry', '/monitor:section', 'All');
memory.write('fund-entry', '/stock/kotak:view', 'transactions');
assert.equal(memory.read('cash-entry', '/monitor:section', string), 'Cash');
assert.equal(memory.read('all-entry', '/monitor:section', string), 'All');
assert.equal(memory.read('fund-entry', '/monitor:section', string), null);
assert.deepEqual(memory.read('cash-entry', '/monitor:expanded', strings), ['kotak']);
const reloaded = createNavigationMemory(() => storage, 3);
assert.equal(reloaded.read('cash-entry', '/monitor:section', string), 'Cash');
assert.deepEqual(reloaded.read('cash-entry', '/monitor:expanded', strings), ['kotak']);
memory.write('next-entry', '/monitor:section', 'ETF');
assert.equal(memory.read('cash-entry', '/monitor:section', string), null, 'old entries are bounded');
assert.equal(memory.read('all-entry', '/monitor:section', string), 'All');

raw = 'invalid JSON';
assert.equal(createNavigationMemory(() => storage).read('x', 'y', string), null);
raw = JSON.stringify([['bad', [['section', { unexpected: true }]]], ['broken'], null]);
assert.equal(createNavigationMemory(() => storage).read('bad', 'section', string), null);
const blocked = createNavigationMemory(() => { throw Error('storage blocked'); });
blocked.write('entry', 'section', 'Cash');
assert.equal(blocked.read('entry', 'section', string), 'Cash', 'blocked storage retains this tab\'s navigation');
assert.equal(validNavigationState('Removed owner', 'All', new Set(['All', 'Ajay'])), 'All');
assert.equal(validNavigationState('Old section', 'All', new Set(['All', 'Cash'])), 'All');
assert.equal(validNavigationState('Cash', 'All', new Set(['All', 'Cash'])), 'Cash');
const picked = new Set(['Kotak', 'Removed fund']);
assert.deepEqual([...validNavigationState(picked, new Set(), new Set(['Kotak']))], ['Kotak']);
assert.deepEqual([...validNavigationState(picked, new Set(), new Set())], []);
assert.equal(validNavigationState(picked, new Set(), undefined), picked, 'pending fund-only options retain their selection');
console.log('PASS navigation snapshots: distinct history entries, reload, validation, bounded storage and blocked storage');

// Shared codecs reject stale or malformed presentation values without coercion.
const codecs = await import('../useNavigationState');
assert.equal(codecs.booleanNavigation.read(false), false);
assert.equal(codecs.booleanNavigation.read('false'), null);
assert.equal(codecs.numberNavigation.read(137), 137);
for (const invalid of [-1, NaN, Infinity, '137', {}]) assert.equal(codecs.numberNavigation.read(invalid), null);
assert.deepEqual(codecs.nullableStringsNavigation.read(['Energy', 'Financials']), ['Energy', 'Financials']);
assert.equal(codecs.nullableStringsNavigation.read(['Energy', 42]), null);

const { validNavigationPicks } = await import('../navigationMemory');
assert.deepEqual(validNavigationPicks(['old', 'Energy', 'Finance', 'removed'], new Set(['Energy', 'Finance']), 4), ['Energy', 'Finance']);
assert.deepEqual(validNavigationPicks(['old'], new Set(['Energy']), 4), []);
assert.equal(validNavigationPicks(null, new Set(['Energy']), 4), null, 'automatic default remains automatic');
assert.deepEqual(validNavigationPicks(['Energy', 'Energy', 'Finance'], new Set(['Energy', 'Finance']), 1), ['Energy']);
const { navigationElements } = await import('../navigationDom');
// Reordering siblings must keep each disclosure/scrollport attached to its holding.
function rowPort(rowAttribute: string, key: string) {
  const parent = { attributes: [{ name: rowAttribute, value: key }], parentElement: null };
  return { attributes: [], parentElement: parent, getAttribute: () => 'repeated-source-site' } as unknown as HTMLElement;
}
for (const rowAttribute of ['data-sector-row', 'data-corporate-return-row', 'data-pm-group', 'data-unvalued-account']) {
  const a = rowPort(rowAttribute, 'alpha'), b = rowPort(rowAttribute, 'beta');
  let children = [a, b];
  const root = { querySelectorAll: () => children } as unknown as HTMLElement;
  const first = navigationElements(root, 'scroll');
  children = [b, a];
  const second = navigationElements(root, 'scroll');
  for (const [key, element] of first) assert.equal(second.get(key), element, rowAttribute);
}

const { readNavigationWindow } = await import('../navigationMemory');
assert.deepEqual(readNavigationWindow({ key: 'sorted/filtered view', limit: 150 }), { key: 'sorted/filtered view', limit: 150 });
for (const invalid of [null, {}, { key: 'x', limit: 0 }, { key: 'x', limit: 1.2 }, { key: 1, limit: 50 }]) assert.equal(readNavigationWindow(invalid), null);

const deferredPicks = ['fund-only sector', 'Energy'];
assert.equal(validNavigationPicks(deferredPicks, new Set(['Energy']), 4, false), deferredPicks, 'an unavailable option universe never erases saved picks');
assert.deepEqual(validNavigationPicks(deferredPicks, new Set(['Energy']), 4, true), ['Energy'], 'a complete source can retire missing picks');
