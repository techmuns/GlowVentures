import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

const output = path.resolve('.cache/table-export-check');
let sequence = 0;
export async function downloadTableWorkbook(table, label) {
  await fs.mkdir(output, {recursive:true});
  const button = table.locator(':scope > caption [data-export-excel]');
  const downloadPromise = table.page().waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.xlsx$/);
  const destination = path.join(output, `${++sequence}-${label.replace(/[^a-z0-9]+/gi,'-')}.xlsx`);
  await download.saveAs(destination);
  await button.page().waitForFunction(element => !element.disabled, await button.elementHandle());
  assert.equal(await table.locator(':scope > caption [role=alert]').count(),0);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(destination);
  assert.ok(book.getWorksheet('About'));
  return book.getWorksheet('Table');
}

export async function assertTableExportControls(page, label) {
  const tables = page.locator('#root table, .return-calculation table');
  for (const table of await tables.all()) {
    assert.equal(await table.locator(':scope > caption [data-export-excel]').count(),1,`${label}: every table has its own Excel control`);
  }
}

/** Export before scrolling so a DOM-only/first-batch implementation fails. */
export async function assertInfiniteTableExport(page, label) {
  const table = page.locator('table').filter({has:page.locator('[data-table-scroll-end]')}).first();
  if (!await table.count()) return;
  const end = table.locator(':scope > tbody > [data-table-scroll-end]');
  if (!await end.count()) return;
  const loaded = Number(await end.getAttribute('data-loaded-rows'));
  const total = Number(await end.getAttribute('data-total-rows'));
  const before = await table.locator(':scope > tbody > tr').count();
  await table.locator(':scope > caption [data-export-excel]').scrollIntoViewIfNeeded();
  const ports = () => table.evaluate(t => { const values=[]; for(let p=t.parentElement;p;p=p.parentElement) values.push([p.scrollLeft,p.scrollTop]); return values; });
  const positions = await ports();
  const sheet = await downloadTableWorkbook(table,label);
  assert.ok(sheet.rowCount >= total + await table.locator(':scope > thead > tr').count(),`${label}: every matching row is exported (${sheet.rowCount} vs ${total})`);
  assert.equal(await table.locator(':scope > tbody > tr').count(),before,`${label}: export restores the scroll batch`);
  assert.equal(Number(await end.getAttribute('data-loaded-rows')),loaded);
  assert.deepEqual(await ports(),positions,`${label}: export restores scroll positions`);
  assert.ok(!sheet.getSheetValues().flat(2).some(v=>typeof v==='string' && /Load more|Export Excel/.test(v)),`${label}: table controls are not exported`);
  console.log(`PASS: ${label} exports ${total} rows with ${loaded} loaded`);
}

export async function assertPrivateProfileExport(page, store) {
  const table = page.locator('table[data-pm-table="brands"]');
  const form = table.locator('form[data-pm-profile-form="strategy"][data-pm-profile-funds*=" "]').first();
  const field = form.locator('textarea');
  const saved = await field.inputValue();
  const writes = store.writes.length;
  await field.fill('UNSAVED EXPORT DRAFT');
  const sheet = await downloadTableWorkbook(table,'private-market-profiles');
  const values = sheet.getSheetValues().flat(2);
  assert.ok(values.includes(saved),'saved strategy is included');
  assert.ok(!values.includes('UNSAVED EXPORT DRAFT'),'unsaved text is excluded');
  assert.ok(!values.some(v=>typeof v==='string' && /Remove typed text|Write strategy|Write description/.test(v)),'editing controls are excluded');
  assert.equal(await field.inputValue(),'UNSAVED EXPORT DRAFT','export preserves the draft');
  assert.equal(store.writes.length,writes,'export never writes to the shared store');
  await field.press('Escape');
  await table.locator('[data-col-grip="strategy"]').focus();
  await table.locator('[data-col-grip="strategy"]').press('ArrowRight');
  const headings = await table.locator(':scope > thead [data-col-button]').allTextContents();
  const arranged = await downloadTableWorkbook(table,'private-market-column-order');
  assert.deepEqual(arranged.getRow(1).values.slice(1),headings.map(text=>text.trim()),'Excel follows the arranged columns');
  await page.getByRole('tab',{name:/^Transactions/}).click();
  await downloadTableWorkbook(page.locator('table[data-pm-table="transactions"]'),'private-market-transactions');
  console.log('PASS: Private Market saved profiles, retained drafts and transactions export');
}

export async function assertExportRetry(page) {
  const table = page.locator('table').filter({has:page.locator('[data-table-scroll-end]')}).first();
  await page.evaluate(() => {
    const original=URL.createObjectURL;
    URL.createObjectURL=function(...args) { URL.createObjectURL=original; throw new Error('local export failure fixture'); };
  });
  await table.locator(':scope > caption [data-export-excel]').click();
  await table.locator(':scope > caption [role=alert]').waitFor();
  await downloadTableWorkbook(table,'retry-after-export-failure');
  console.log('PASS: Excel export failure is visible and retry succeeds');
}
