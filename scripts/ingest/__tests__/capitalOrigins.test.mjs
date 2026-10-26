import assert from 'node:assert/strict';
import fs from 'node:fs';
import { capitalRecordFromInception } from '../../lib/capitalOrigins.mjs';
const opening = (securityKey, units, date='2026-08-01') => ({kind:'opening-units',securityKey,units,balance:units,date});
const buy = (securityKey, units, balance, date='2026-08-02') => ({kind:'contribution',securityKey,units,balance,amount:1000,date});
assert.equal(capitalRecordFromInception([buy('nil-sleeve',10,10)]),true);
assert.equal(capitalRecordFromInception([opening('nil-sleeve',0),buy('nil-sleeve',10,10)]),true);
// A small nil-based sleeve cannot certify the larger opening holdings.
assert.equal(capitalRecordFromInception([opening('main',100),opening('nil-sleeve',0),buy('nil-sleeve',10,10)]),false);
assert.equal(capitalRecordFromInception([opening('main',100),buy('main',10,110),buy('nil-sleeve',10,10)]),false);
assert.equal(capitalRecordFromInception([opening('main',100)]),false);
assert.equal(capitalRecordFromInception([{...opening('main',100),balance:null},buy('nil-sleeve',10,10)]),false);
// Supplied preceding purchases can prove an origin before a later checkpoint.
assert.equal(capitalRecordFromInception([buy('main',100,100,'2026-07-01'),opening('main',100),buy('main',10,110)]),true);
const bandhan=JSON.parse(fs.readFileSync(new URL('../../../public/audit/bandhan-mutual-fund-8652064-2026-10-26-holdings/document.json',import.meta.url)));
assert.equal(capitalRecordFromInception(bandhan.cashFlows),false);
console.log('Capital origin checks passed');
