import assert from 'node:assert/strict';
import { scrollToEnd } from './table-scroll.mjs';

function tableFixture(total, batch = 50, mode = 'normal') {
  let shown = Math.min(batch, total), appends = 0;
  const element = { dataset: {} };
  Object.defineProperty(element.dataset, 'loadedRows', { get: () => String(shown) });
  const end = {
    getAttribute: async name => String(name === 'data-loaded-rows' ? shown : total),
    scrollIntoViewIfNeeded: async () => { appends++; if (mode !== 'stalled') shown = mode === 'overshoot' ? total + 1 : Math.min(total, shown + batch); },
    elementHandle: async () => element,
    page: () => ({ waitForFunction: async (fn, args) => { assert.ok(fn(args), 'new rows arrive after a scroll'); } }),
  };
  return { locator: () => end, appends: () => appends };
}
for (const total of [0, 1, 50, 100, 10034, 10050, 10051, 15000]) {
  const table = tableFixture(total);
  assert.equal(await scrollToEnd(table), total, `${total} rows stay reachable`);
  assert.equal(table.appends(), Math.max(0, Math.ceil(total / 50) - 1), 'no redundant scroll after the last batch');
}
await assert.rejects(scrollToEnd(tableFixture(100, 50, 'stalled')), /new rows arrive/);
await assert.rejects(scrollToEnd(tableFixture(100, 50, 'overshoot')), /bounded row progress/);
console.log('Infinite scroll probe: exact 200-load boundary, larger workbooks, empty tables, stalled loads and overcounts passed.');
