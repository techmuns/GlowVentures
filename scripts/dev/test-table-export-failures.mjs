import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadWorkbook } from './table-excel.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('a failed export click retains its cause when browser cleanup rejects the pending download', async () => {
  const clickFailure = new Error('Export control could not be clicked');
  let rejectDownload;
  const page = { waitForEvent: () => new Promise((_, reject) => { rejectDownload = reject; }) };
  const button = { page: () => page, click: async () => {
    setTimeout(() => rejectDownload(new Error('Browser closed during cleanup')), 10);
    throw clickFailure;
  } };
  await assert.rejects(downloadWorkbook(button, 'click-failure-fixture'), error => error === clickFailure);
  // An orphaned listener rejects here, after the caller starts cleanup. The
  // test runner treats that unhandled rejection as a failure.
  await delay(40);
});

test('a download failure retains its cause when a pending click later fails too', async () => {
  const downloadFailure = new Error('Workbook download failed');
  const page = { waitForEvent: () => new Promise((_, reject) => setTimeout(() => reject(downloadFailure), 5)) };
  const button = { page: () => page, click: async () => { await delay(20); throw new Error('Page closed after the download failure'); } };
  await assert.rejects(downloadWorkbook(button, 'download-failure-fixture'), error => error === downloadFailure);
  await delay(40);
});
