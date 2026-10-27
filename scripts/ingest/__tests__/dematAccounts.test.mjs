// THE DEMAT A STATEMENT NAMES (Stage 10ic) — each declared layout on its own
// printed form, and the committed book's readings held to the statements.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dematPrintedOn, dematAccountsFor } from '../../lib/dematAccounts.mjs';

const doc = (accountNo, clientCode = null) => ({ accountNo, clientCode });

// Each layout, as its statement prints it.
assert.deepEqual(dematPrintedOn('DP ID : IN302902\nName AJAY T JAISINGHANI Client Id 49794950', doc('49794950')),
  { depository: 'NSDL', dpId: 'IN302902', clientId: '49794950', participant: null, layout: 'dp-client-pair', own: true });
assert.deepEqual(dematPrintedOn('(A Depository Participant of NSDL)DP ID IN301549\nHolding Statement as on : 29/08/2026\nDP Account No : 67786137', doc('67786137')),
  { depository: 'NSDL', dpId: 'IN301549', clientId: '67786137', participant: null, layout: 'dp-client-pair', own: true });
assert.deepEqual(dematPrintedOn('Client ID: 1201090012838335 A/C Status: Active', doc('1201090012838335')),
  { depository: 'CDSL', dpId: '12010900', clientId: '12838335', participant: null, layout: 'bo-id', own: true });
assert.equal(dematPrintedOn('BO ID 1203000000739979', doc('98245', '1203000000739979')).own, true);
assert.deepEqual(dematPrintedOn('Client Demat Details\nDepository Participant Name Depository (NSDL/ CDSL) DP Number Client ID\nMOTILAL OSWAL FINANCIAL SERVICES LIMITED CDSL 12010900 12539150\nAccount Summary', doc('90410016104')),
  { depository: 'CDSL', dpId: '12010900', clientId: '12539150', participant: 'MOTILAL OSWAL FINANCIAL SERVICES LIMITED', layout: 'participant-table', own: false });
assert.deepEqual(dematPrintedOn('Demat Details\nDP ID DP Name Client ID\n12010900 MOTILAL OSWAL FINANCIAL SERVICES LIMITED 37359311\nAccount Summary', doc('3000048')),
  { depository: 'CDSL', dpId: '12010900', clientId: '37359311', participant: 'MOTILAL OSWAL FINANCIAL SERVICES LIMITED', layout: 'dp-name-table', own: false });
assert.deepEqual(dematPrintedOn('NSDL DP: HDFC BANK LIMITED [IN301151]\nStatement of Holdings', doc('22025655')),
  { depository: 'NSDL', dpId: 'IN301151', clientId: '22025655', participant: 'HDFC BANK LIMITED', layout: 'nsdl-participant-header', own: true });
// An AIF's statement crediting a demat on two lines, past other fields.
assert.equal(dematPrintedOn('DP ID : 12010900 First Holder PAN : XXXXX\nClient ID : 12539150 Second Holder', doc('9039917111')).clientId, '12539150');

// Blank demat fields name none — a fund-house folio's "DP ID / CLIENT ID :", an empty BOID.
for (const text of ['DP ID / CLIENT ID :\nDP ID : Client ID : to the default bank account', 'FOLIO : 904168868444 CAN :\nBOID : UMRN :', 'DP ID | Beneficiary Account No. |'])
  assert.equal(dematPrintedOn(text, doc('904168868444')), null);
// A DP ID of neither depository's shape is not one.
assert.equal(dematPrintedOn('DP ID : 1234 Client ID : 12345678', doc('x')), null);

// The newest statement is the record; an older one naming another demat is noted, never blended.
{
  const accounts = [{ accountId: 'f', provider: 'Fund', accountNo: '1' }, { accountId: 'd', provider: 'Broker (demat)', accountNo: '1201090012345678' }];
  const issues = new Map([
    ['f', [{ docKey: 'old', asOf: '2026-01-31', accountNo: '1' }, { docKey: 'new', asOf: '2026-06-30', accountNo: '1' }]],
    ['d', [{ docKey: 'dem', asOf: '2026-06-30', accountNo: '1201090012345678' }]],
  ]);
  const text = { old: 'DP ID : 12010900 Client ID : 99999999', new: 'DP ID : 12010900 Client ID : 12345678', dem: 'Client ID: 1201090012345678' };
  const notes = [];
  dematAccountsFor(accounts, issues, (k) => text[k] ?? null, notes);
  assert.deepEqual(accounts[0].demat.printed, { depository: 'CDSL', dpId: '12010900', clientId: '12345678', participant: 'Broker', accountId: 'd', asOf: '2026-06-30', documents: ['new'] });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /the newer new names CDSL 12010900\/12345678/);
}

// THE COMMITTED BOOK. Every depository account carries its own demat; every
// fund statement's demat that is one of the book's own is held by the same
// owner; the example on the call — the Nifty 100 Low Volatility 30 ETF FOF —
// sits in two fund-house folios that name no demat.
const src = fs.readFileSync(new URL('../../../src/data/glowData.ts', import.meta.url), 'utf8');
const start = src.indexOf('= [', src.indexOf('export const BOOK_ACCOUNTS'));
const accounts = JSON.parse(src.slice(start + 2, src.indexOf(';\n', start)));
const acc = new Map(accounts.map((a) => [a.accountId, a]));
const depository = accounts.filter((a) => /\(NSDL demat\)|\(demat\)$/.test(a.provider) || a.provider === 'LKP Securities');
assert.ok(depository.length >= 10);
for (const a of depository) {
  const p = a.demat?.printed;
  assert.ok(p, `${a.accountId} names its own demat`);
  assert.equal(p.accountId, a.accountId);
  if (p.depository === 'NSDL') assert.equal(p.clientId, a.accountNo);
}
for (const a of accounts) {
  const p = a.demat?.printed;
  if (!p?.accountId || p.accountId === a.accountId) continue;
  assert.equal(acc.get(p.accountId).ownerId, a.ownerId, `${a.accountId}'s units are credited to a demat of its own holder`);
}
assert.deepEqual(acc.get('sky-capital-rising-titans-fund-SKY022').demat.printed.accountId, 'icici-bank-nsdl-demat-49794950');
for (const id of ['icici-prudential-mutual-fund-36378950', 'icici-prudential-mutual-fund-36379637']) {
  assert.equal(acc.get(id).demat.printed, null);
  assert.match(acc.get(id).demat.reason, /prints no DP ID or Client ID/);
}
assert.ok(accounts.filter((a) => a.reviewHolder || a.provider.startsWith('Consolidated review')).every((a) => a.demat === undefined));

console.log('Demat account checks passed');
