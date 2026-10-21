import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

const output = path.resolve('.cache/table-export-check', String(Date.now()));
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

/** A no-match search must still download exactly the complete table. */
export async function assertUnfilteredSearchExport(page, table, input, label) {
  const original = await input.inputValue();
  const complete = await downloadTableWorkbook(table, `${label}-unfiltered`);
  await input.fill('no-such-row-in-this-table-938472');
  const rows = await table.locator(':scope > tbody > tr').count();
  const address = page.url();
  const filtered = await downloadTableWorkbook(table, `${label}-no-matches`);
  assert.deepEqual(filtered.getSheetValues(), complete.getSheetValues(), `${label}: filters cannot remove Excel rows or change their values`);
  assert.equal(await input.inputValue(), 'no-such-row-in-this-table-938472');
  assert.equal(page.url(), address, `${label}: export preserves URL filters`);
  assert.equal(await table.locator(':scope > tbody > tr').count(), rows, `${label}: the filtered screen remains intact`);
  await input.fill(original);
  console.log(`PASS: ${label} exports the same ${complete.rowCount} rows under a no-match search`);
}

export async function assertPrivateMarketFilterExport(page) {
  const table = page.locator('table[data-pm-table="brands"]');
  const picker = page.getByRole('combobox', {name:'Show funds, companies or both', exact:true});
  const selection = await picker.inputValue();
  const complete = await downloadTableWorkbook(table, 'private-complete');
  await picker.selectOption('funds');
  const visible = await table.locator('[data-pm-group]').count();
  const filtered = await downloadTableWorkbook(table, 'private-funds-filter');
  assert.deepEqual(filtered.getSheetValues(), complete.getSheetValues(), 'Companies/Funds cannot narrow Excel');
  assert.equal(await picker.inputValue(), 'funds');
  assert.equal(await table.locator('[data-pm-group]').count(), visible);
  await assertUnfilteredSearchExport(page,table,page.getByPlaceholder('Search brands, funds or entities…'),'private-market');
  await picker.selectOption(selection);
}

/** Export before scrolling so a DOM-only/first-batch implementation fails. */
export async function assertInfiniteTableExport(page, label, source = false) {
  const tables = page.locator('table').filter({has:page.locator('[data-table-scroll-end]')});
  const table = source ? tables.last() : tables.first();
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

/** Hidden fields and offscreen columns must survive without changing preferences. */
export async function assertCompleteColumnExport(page, table, label) {
  const key = await table.getAttribute('data-table-view');
  assert.ok(key,`${label}: configurable table is ready`);
  const picker = page.locator(`[data-edit-columns=${JSON.stringify(key)}]`).first();
  const editor = page.locator(`[data-column-editor=${JSON.stringify(key)}]`);
  await picker.click();
  const columns = await editor.locator('[data-column-checkbox]').evaluateAll(inputs => inputs.map(input => ({
    id:input.dataset.columnCheckbox, checked:input.checked, disabled:input.disabled,
    label:input.closest('label').querySelector('span > span').textContent,
  })));
  const hide = columns.find(c=>c.checked&&!c.disabled&&['cost','mv','amount'].includes(c.id)) ?? columns.find(c=>c.checked&&!c.disabled);
  assert.ok(hide);
  await editor.locator(`[data-column-checkbox=${JSON.stringify(hide.id)}]`).uncheck();
  await editor.getByRole('button',{name:'Close Edit Columns',exact:true}).click();
  const visible = await table.locator(':scope > thead th[data-col]').evaluateAll(cells=>cells.map(cell=>cell.dataset.col));
  assert.ok(!visible.includes(hide.id));
  const preferences = await page.evaluate(key=>localStorage.getItem(`glow:tableView:${key}:v1`),key);
  const beforeRows = await table.locator(':scope > tbody > tr').count();
  const sheet = await downloadTableWorkbook(table,`${label}-all-columns`);
  const headings = sheet.getRow(1).values.slice(1);
  const compact = value=>String(value).replace(/\s+/g,'').toLowerCase();
  assert.equal(headings.length,columns.length,`${label}: every available column is exported`);
  columns.forEach((column,i)=>assert.ok(compact(headings[i]).startsWith(compact(column.label)),`${label}: ${column.id} has its own correctly arranged heading`));
  assert.ok(headings.length>visible.length,`${label}: hidden fields are present in the workbook`);
  assert.deepEqual(await table.locator(':scope > thead th[data-col]').evaluateAll(cells=>cells.map(cell=>cell.dataset.col)),visible,`${label}: screen visibility is unchanged`);
  assert.equal(await table.locator(':scope > tbody > tr').count(),beforeRows,`${label}: export preserves the scroll batch`);
  assert.equal(await page.evaluate(key=>localStorage.getItem(`glow:tableView:${key}:v1`),key),preferences,`${label}: exporting does not save visibility changes`);
  await picker.click();
  await editor.locator(`[data-column-checkbox=${JSON.stringify(hide.id)}]`).check();
  await editor.getByRole('button',{name:'Close Edit Columns',exact:true}).click();
  console.log(`PASS: ${label} exports all ${headings.length} columns with ${visible.length} visible`);
}

export async function assertCollapsedSectionExport(page) {
  const table = page.locator('table[data-pm-table]').first();
  const section = table.locator('[data-pm-section="atCost"]');
  const toggle = table.locator('[data-pm-section-toggle="atCost"]');
  if (await section.getAttribute('data-pm-section-open') !== 'true') await toggle.click();
  const name = await table.locator('tr[data-pm-group] td').first().innerText();
  const before = await table.locator('tr[data-pm-group]').count();
  assert.ok(before>0);
  await toggle.click();
  assert.equal(await section.getAttribute('data-pm-section-open'),'false');
  const collapsed = await table.locator('tr[data-pm-group]').count();
  assert.ok(collapsed<before);
  const sheet = await downloadTableWorkbook(table,'private-market-collapsed-section');
  const compact = value=>String(value).replace(/\s+/g,'');
  assert.ok(sheet.getColumn(1).values.some(value=>compact(value?.text??value)===compact(name)),'an investment inside a collapsed section is exported');
  assert.equal(await table.locator('tr[data-pm-group]').count(),collapsed);
  assert.equal(await section.getAttribute('data-pm-section-open'),'false','export preserves collapsed sections on screen');
  await toggle.click();
  console.log('PASS: collapsed Private Market investments are exported without changing section state');
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
  const headings = await table.locator(':scope > thead th').allTextContents();
  const arranged = await downloadTableWorkbook(table,'private-market-column-order');
  const compact = text => String(text).replace(/\s+/g,'');
  const exported = arranged.getRow(1).values.slice(1).map(compact);
  let previous = -1;
  for (const heading of headings.map(compact)) {
    const index = exported.indexOf(heading,previous+1);
    assert.ok(index>previous,'Excel preserves the arrangement while including hidden columns');
    previous=index;
  }
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

/** Scope selectors and URL filters cannot constrain the downloadable dataset. */
export async function assertMemberFilterExport(page, base, route, selector) {
  await page.goto(base+route);
  await page.waitForLoadState('networkidle');
  const table = page.locator(selector).first();
  await table.waitFor();
  const complete = await downloadTableWorkbook(table, `${route}-whole-family`);
  const target = new URL(base+route);
  target.searchParams.set('members','ankita-jaisinghani');
  if(route==='/monitor') target.searchParams.set('sector','no-such-sector-in-the-book');
  await page.goto(target.href);
  await page.waitForLoadState('networkidle');
  const scopedTable = page.locator(selector).first();
  await scopedTable.waitFor();
  const displayed = await scopedTable.locator(':scope > tbody > tr').count();
  const scoped = await downloadTableWorkbook(scopedTable, `${route}-member-filter`);
  assert.deepEqual(scoped.getSheetValues(),complete.getSheetValues(),`${route}: member/sector filters cannot narrow the workbook`);
  assert.equal(page.url(),target.href,`${route}: member selection remains on screen`);
  assert.equal(await scopedTable.locator(':scope > tbody > tr').count(),displayed);
  console.log(`PASS: ${route} exports the complete family dataset with member filters applied`);
}

export async function assertTransactionFilterExport(page, base) {
  await page.goto(base+'/monitor?show=transactions');
  await page.waitForLoadState('networkidle');
  const table = page.locator('table[data-dated-table]');
  await table.waitFor();
  const complete = await downloadTableWorkbook(table,'transactions-all-dates');
  const from = page.locator('input[type=date][title="From date"]');
  await from.fill('2099-01-01');
  await page.locator('[data-side-option="out"]').click();
  const entity = page.locator('[data-entity-filter]');
  const option = await entity.locator('option').nth(1).getAttribute('value');
  await entity.selectOption(option);
  const rows = await table.locator(':scope > tbody > tr').count();
  const filtered = await downloadTableWorkbook(table,'transactions-filtered');
  assert.deepEqual(filtered.getSheetValues(),complete.getSheetValues(),'date, side and entity filters cannot narrow Excel');
  assert.equal(await from.inputValue(),'2099-01-01');
  assert.equal(await entity.inputValue(),option);
  assert.equal(await page.locator('[data-side-filter]').getAttribute('data-side-filter'),'out');
  assert.equal(await table.locator(':scope > tbody > tr').count(),rows);
  console.log('PASS: transaction exports ignore date, side and entity filters while keeping them on screen');
}
