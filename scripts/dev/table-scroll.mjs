import assert from 'node:assert/strict';

// Bring an offscreen control beside the pinned column, then use a real click.
// Native scrollIntoView can centre the control underneath that sticky cell.
export async function clickTableControl(control) {
  await control.scrollIntoViewIfNeeded();
  await control.evaluate(button => {
    const port = button.closest('[data-navigation-scroll]');
    port.scrollLeft += button.getBoundingClientRect().right - port.getBoundingClientRect().right + 6;
  });
  assert.ok(await control.evaluate(button => {
    const box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }), 'table control is reachable beside the frozen first column');
  await control.click();
}

// Exercise the actual scroll surface and require new rows after every append.
export async function appendByScrolling(table) {
  const end = table.locator('[data-table-scroll-end]');
  const before = Number(await end.getAttribute('data-loaded-rows'));
  const total = Number(await end.getAttribute('data-total-rows'));
  assert.ok(before < total, 'more rows are available');
  await end.scrollIntoViewIfNeeded();
  await end.page().waitForFunction(({ element, before }) => Number(element.dataset.loadedRows) > before,
    { element: await end.elementHandle(), before });
}

export async function scrollToEnd(table) {
  const end = table.locator('[data-table-scroll-end]');
  let shown = Number(await end.getAttribute('data-loaded-rows'));
  const total = Number(await end.getAttribute('data-total-rows'));
  assert.ok(Number.isSafeInteger(total) && Number.isSafeInteger(shown) && shown >= 0 && shown <= total, 'valid table row counts');
  // Integer progress bounds this loop by the number of rows. An arbitrary
  // 200-append limit failed after loading the last batch of the 10,034-row book.
  while (shown < total) {
    await appendByScrolling(table);
    const next = Number(await end.getAttribute('data-loaded-rows'));
    assert.ok(Number.isSafeInteger(next) && next > shown && next <= total, 'scrolling makes bounded row progress');
    assert.equal(Number(await end.getAttribute('data-total-rows')), total, 'the complete table size stays fixed');
    shown = next;
  }
  return total;
}
