/** Expose a table control beside its pinned name before a real pointer click. */
export async function revealTableControl(control) {
  await control.scrollIntoViewIfNeeded();
  await control.evaluate(el => {
    let port = el.parentElement;
    while (port && !(port.scrollWidth > port.clientWidth && /auto|scroll/.test(getComputedStyle(port).overflowX))) port = port.parentElement;
    if (!port) throw Error('The table has no horizontal scrollport');
    const frozen = el.closest('tr').firstElementChild.getBoundingClientRect(), bounds = port.getBoundingClientRect(), r = el.getBoundingClientRect();
    const left = Math.max(bounds.left, frozen.right), right = Math.min(bounds.right, innerWidth);
    if (right - left < r.width) throw Error('The pinned name leaves too little room for the table control');
    port.scrollLeft += r.left + r.width / 2 - (left + right) / 2;
  });
}
