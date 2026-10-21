import assert from 'node:assert/strict';

// A browser-local store: no save in this regression reaches a hosted account.
export async function installProfileStoreFixture(page) {
  const records = new Map(), writes = [];
  let fail = false;
  await page.route('**/api/investment-profiles', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (fail) {
        fail = false;
        return route.fulfill({ status: 502, json: { ok: false, message: 'Fixture save failed' } });
      }
      for (const fund of body.funds) {
        const key = `${fund}:${body.field}`;
        if (body.op === 'delete') records.delete(key);
        else records.set(key, { fund, field: body.field, fundName: body.fundName, text: body.text, updatedAt: '2026-10-21T12:00:00Z' });
      }
    }
    return route.fulfill({ json: { ok: true, profiles: [...records.values()] } });
  });
  return { writes, records, failNextSave() { fail = true; } };
}

export async function assertInlineProfileEditing(page, store) {
  const first = page.locator('textarea[data-pm-profile-input="strategy"]').first();
  await first.waitFor();
  await page.waitForFunction(() => !document.querySelector('textarea[data-pm-profile-input="strategy"]').disabled);
  assert.ok(await page.locator('textarea[data-pm-profile-input="description"]').count() > 0, 'both fields are open without clicking Add or Edit Columns');
  assert.equal(await page.locator('[data-pm-profile-editor]').count(), 0, 'no separate editor row');
  const row = first.locator('xpath=ancestor::tr');
  const rowId = await row.getAttribute('data-pm-group');
  assert.ok(rowId);
  const rowSelector = `[data-pm-group=${JSON.stringify(rowId)}]`;
  const find = field => page.locator(rowSelector).locator(`[data-pm-profile-input="${field}"]`);
  const save = field => page.locator(rowSelector).locator(`[data-pm-profile-save="${field}"]`);
  const initialFolios = await page.locator('tr[data-pm-folio-row]').count();
  await first.fill('Fixture strategy');
  assert.equal(await page.locator('tr[data-pm-folio-row]').count(), initialFolios, 'editing never toggles its parent row');
  assert.equal(store.writes.length, 0, 'drafts do not write until Save');
  await save('strategy').click();
  await page.locator(rowSelector).locator('[data-pm-profile-remove="strategy"]').waitFor();
  assert.equal(store.writes.at(-1).field, 'strategy');
  await find('description').fill('Fixture description\nSecond line');
  await save('description').click();
  await page.locator(rowSelector).locator('[data-pm-profile-remove="description"]').waitFor();
  await page.reload();
  await page.waitForFunction(selector => document.querySelector(selector)?.value === 'Fixture strategy', `${rowSelector} [data-pm-profile-input="strategy"]`);
  assert.equal(await find('description').inputValue(), 'Fixture description\nSecond line', 'saved fields persist after reopening the page');
  await find('description').fill('Unsaved draft');
  const beforeCancel = store.writes.length;
  await page.locator(rowSelector).getByRole('button', { name: /^Cancel description/ }).click();
  assert.equal(await find('description').inputValue(), 'Fixture description\nSecond line');
  assert.equal(store.writes.length, beforeCancel, 'Cancel makes no write');
  await find('description').fill('Retry this draft');
  store.failNextSave();
  await save('description').click();
  await page.locator(rowSelector).getByRole('alert').waitFor();
  assert.equal(await find('description').inputValue(), 'Retry this draft', 'failed saves keep the draft');
  await save('description').click();
  await page.waitForFunction(selector => !document.querySelector(selector), `${rowSelector} [data-pm-profile-error]`);
  assert.equal(await find('description').inputValue(), 'Retry this draft');
  await page.locator(rowSelector).locator('[data-pm-profile-remove="description"]').click();
  await page.waitForFunction(selector => document.querySelector(selector)?.value === '', `${rowSelector} [data-pm-profile-input="description"]`);
  assert.equal(store.writes.at(-1).op, 'delete');
  assert.equal(await find('strategy').inputValue(), 'Fixture strategy', 'removing one field retains the other');
  await page.getByRole('button', { name: 'By brand', exact: true }).click();
  const shared = page.locator('form[data-pm-profile-form="strategy"][data-pm-profile-funds*=" "]').first();
  await shared.waitFor();
  const funds = (await shared.getAttribute('data-pm-profile-funds')).split(' ');
  assert.ok(funds.length > 1, 'a brand spanning several investments is exercised');
  await shared.locator('textarea').fill('Shared brand strategy');
  await shared.locator('[data-pm-profile-save]').click();
  await shared.locator('[data-pm-profile-remove]').waitFor();
  assert.deepEqual(store.writes.at(-1).funds, funds, 'a brand edit still updates every investment under it');
  console.log('PASS: always-open profile fields, save/reload, cancel, retained drafts, retry and removal');
}
