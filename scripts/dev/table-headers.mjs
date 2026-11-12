import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export async function assertTableHeaderFixture(browser, base) {
  const html = await fs.readFile('dist/index.html','utf8');
  const styles = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/g)]
    .map(m => `<link rel="stylesheet" href="${new URL(m[1],base).href}">`).join('');
  assert.ok(styles, 'the fixture uses the built application stylesheet');
  const table = `<table style="width:1800px"><thead><tr><th colspan="3">Column letters and preamble</th></tr><tr><th class="sticky left-0 z-30">Name</th><th>Amount</th><th>Date</th></tr></thead><tbody>${Array.from({length:50},(_,i)=>`<tr><td class="sticky left-0 z-10" style="background:var(--table-header-bg);height:30px">Fixture ${i}</td><td>${i}</td><td>2026-10-21</td></tr>`).join('')}</tbody></table>`;
  const page = await browser.newPage({viewport:{width:1200,height:900}});
  try {
    await page.setContent(`${styles}<div id="root"><div class="overflow-x-auto" data-header-fixture style="width:600px">${table}</div></div><div class="return-calculation" style="height:200px;overflow:auto;width:600px">${table}</div>`);
    await page.waitForLoadState('networkidle');
    const result = await assertStickyTableHeaders(page, 'multi-row and dialog fixture');
    assert.equal(result.scrolled,4,'both table scrollports move in both themes');
    assert.equal(result.multirow,4,'all header rows stay together in both themes');
    const alignment = await page.locator('[data-header-fixture]').evaluate(port => {
      port.scrollLeft=300;
      const table=port.querySelector('table');
      return [...table.tHead.rows[1].cells].map((cell,i)=>cell.getBoundingClientRect().left-table.tBodies[0].rows[0].cells[i].getBoundingClientRect().left);
    });
    assert.ok(alignment.every(delta=>Math.abs(delta)<2),'horizontal scrolling keeps headers aligned with body columns');
    await page.emulateMedia({media:'print'});
    const print = await page.locator('[data-header-fixture]').evaluate(port => ({
      position:getComputedStyle(port.querySelector('thead')).position,
      maxHeight:getComputedStyle(port).maxHeight, overflow:getComputedStyle(port).overflowY,
    }));
    assert.equal(print.position,'static','print repeats normal table headings');
    assert.equal(print.maxHeight,'none','print does not clip table rows');
    assert.equal(print.overflow,'visible');
  } finally { await page.close(); }
}

// Measure the actual scrollport and rendered header group, rather than checking
// class names. Run in both themes; restore scroll positions for the row tests.
export async function assertStickyTableHeaders(page, label) {
  const reports = await page.evaluate(async () => {
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const reports = [];
    const wasDark = document.documentElement.classList.contains('dark');
    try {
      for (const dark of [false, true]) {
        document.documentElement.classList.toggle('dark', dark);
        for (const table of document.querySelectorAll('#root table, .return-calculation table')) {
          const head = table.tHead;
          if (!head || !head.getClientRects().length) continue;
          const style = getComputedStyle(head);
          const report = { theme: dark ? 'dark' : 'light', heading: head.innerText.slice(0,80),
            sticky: style.position === 'sticky' && style.top === '0px',
            opaque: !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor),
            aboveRows: Number(style.zIndex) >= 20 };
          let port = head.parentElement;
          while (port && !/auto|scroll|hidden/.test(getComputedStyle(port).overflowY)) port = port.parentElement;
          const row = table.tBodies[0]?.rows[0];
          if (port && row && port.scrollHeight - port.clientHeight > 32) {
            const saved = port.scrollTop;
            port.scrollTop = 0;
            await frame();
            const portBox = port.getBoundingClientRect();
            const scale = portBox.height / port.offsetHeight;
            const origin = portBox.top + parseFloat(getComputedStyle(port).borderTopWidth) * scale;
            const start = head.getBoundingClientRect();
            const offsets = [...head.rows].map(r => r.getBoundingClientRect().top - start.top);
            const rowTop = row.getBoundingClientRect().top;
            port.scrollTop = Math.min(port.scrollHeight - port.clientHeight, (Math.max(0,start.top-origin)+120)/scale);
            await frame();
            const end = head.getBoundingClientRect();
            const expected = Math.min(Math.max(start.top-port.scrollTop*scale,origin), table.getBoundingClientRect().bottom-end.height);
            report.scrolled = port.scrollTop > 20 && row.getBoundingClientRect().top < rowTop - 10;
            report.pinned = Math.abs(end.top-expected) < 2;
            report.groupIntact = [...head.rows].every((r,i) => Math.abs(r.getBoundingClientRect().top-end.top-offsets[i]) < 2);
            report.multirow = head.rows.length > 1;
            port.scrollTop = saved;
            await frame();
          }
          // A frozen label must cover exactly its column, including the total:
          // pinning a merged footer label would hide neighbouring figures.
          if (port && table.dataset.monitorTable === 'holdings' && port.scrollWidth-port.clientWidth > 32) {
            const security = head.querySelector('[data-col="security"]');
            const name = table.querySelector(':scope > tbody > tr > td:first-child:is(:not([colspan]), [colspan="1"])');
            const total = table.tFoot?.rows[0]?.cells[0];
            if (security && name && total) {
              const saved = port.scrollLeft;
              port.scrollLeft = Math.min(150,port.scrollWidth-port.clientWidth);
              await frame();
              const box = port.getBoundingClientRect();
              const origin = box.left + parseFloat(getComputedStyle(port).borderLeftWidth)*box.width/port.offsetWidth;
              const h = security.getBoundingClientRect(), n = name.getBoundingClientRect(), f = total.getBoundingClientRect();
              report.frozenLabels = { heading:h.left-origin, name:n.left-origin, total:f.left-origin, width:f.width-h.width };
              port.scrollLeft = saved;
              await frame();
            }
          }
          // Every table freezes its first column (Stage 10nh): scrolled sideways,
          // the first unspanned heading and body cell stay at the scrollport's
          // left edge, and the body cell paints an opaque surface under itself.
          let xport = table.parentElement;
          while (xport && !/auto|scroll/.test(getComputedStyle(xport).overflowX)) xport = xport.parentElement;
          if (xport && table.closest('#root') && !table.hasAttribute('data-freeze-off') && xport.scrollWidth-xport.clientWidth > 32) {
            const first = ':first-child:is(:not([colspan]), [colspan="1"])';
            const th = table.querySelector(`:scope > thead > tr > ${first}`);
            const td = table.querySelector(`:scope > tbody > tr > ${first}`);
            if (th && td) {
              const saved = xport.scrollLeft;
              xport.scrollLeft = Math.min(150,xport.scrollWidth-xport.clientWidth);
              await frame();
              const box = xport.getBoundingClientRect();
              const origin = box.left + parseFloat(getComputedStyle(xport).borderLeftWidth)*box.width/xport.offsetWidth;
              const surface = getComputedStyle(td,'::before').backgroundColor;
              report.firstColumn = { heading:th.getBoundingClientRect().left-origin, body:td.getBoundingClientRect().left-origin,
                opaque: /^rgb\(/.test(surface) || /^rgba\(.*,\s*1\)$/.test(surface) };
              xport.scrollLeft = saved;
              await frame();
            }
          }
          reports.push(report);
        }
      }
    } finally { document.documentElement.classList.toggle('dark',wasDark); }
    return reports;
  });
  for (const r of reports) {
    const context = `${label}, ${r.theme}, ${r.heading}`;
    assert.ok(r.sticky, `header is pinned: ${context}`);
    assert.ok(r.opaque && r.aboveRows, `header covers scrolling cells: ${context}`);
    if (r.frozenLabels) assert.ok(Object.values(r.frozenLabels).every(delta=>Math.abs(delta)<2),
      `Security and Total stay in one aligned frozen column: ${context}: ${JSON.stringify(r.frozenLabels)}`);
    if (r.firstColumn) assert.ok(Math.abs(r.firstColumn.heading)<2 && Math.abs(r.firstColumn.body)<2 && r.firstColumn.opaque,
      `the first column stays frozen and opaque while the table scrolls sideways: ${context}: ${JSON.stringify(r.firstColumn)}`);
    if ('scrolled' in r) {
      assert.ok(r.scrolled, `body actually scrolls: ${context}`);
      assert.ok(r.pinned && r.groupIntact, `header stays fixed without overlapping header rows: ${context}`);
    }
  }
  return { headers: reports.length, scrolled: reports.filter(r => r.scrolled).length, multirow: reports.filter(r => r.multirow && r.pinned).length };
}
