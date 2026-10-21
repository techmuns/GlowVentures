import assert from "node:assert/strict";
import { accountIndex } from "../accounts";
import { hasSectorReturnCost, sectorReturnHolding } from "../sectorReturnCoverage";
import { BOOK_ACCOUNTS, BOOK_POLYCAB } from "../../data/glowData";
import type { Account, Position } from "../types";

// The same stock in two statements must retain the identity of the missing row.
const accounts = accountIndex([
  { accountId: "one", owner: "First owner", provider: "First broker", accountNo: "111", asOf: "2026-03-31" },
  { accountId: "two", owner: "Second owner", provider: "Second broker", accountNo: "222", asOf: "2026-09-30" },
] as Account[]);
const rows = [
  { securityKey: "same-stock", security: "Same stock", accountId: "one", costBasis: 120, costUnavailable: false },
  { securityKey: "same-stock", security: "Same stock", accountId: "two", costBasis: null },
] as Position[];
const missing = rows.filter(p => !hasSectorReturnCost(p)).map(p => sectorReturnHolding(p, accounts));
assert.equal(missing.length, 1);
assert.equal(missing[0].owner, "Second owner");
assert.equal(missing[0].provider, "Second broker");
assert.equal(missing[0].accountNo, "222");
assert.equal(missing[0].statementDate, "2026-09-30");
assert.equal(missing[0].missing, "The purchase cost is missing.");
assert.equal(sectorReturnHolding(rows[0], accounts).missing, null);
const unreliable = { ...rows[0], costUnavailable: true };
assert.equal(hasSectorReturnCost(unreliable), false);
assert.match(sectorReturnHolding(unreliable, accounts).missing!, /cannot be verified/);
assert.equal(hasSectorReturnCost({ ...rows[0], costBasis: 0 }), true, "a recorded zero is not missing");
const unknown = sectorReturnHolding({ ...rows[1], accountId: "unregistered" }, accounts);
assert.equal(unknown.statementDate, null, "never borrow the other account's date");
assert.equal(unknown.accountNo, "unregistered");
assert.equal(unknown.provider, "Statement provider not recorded");

// The book's unresolved Polycab holding names the actual custody statement.
const polycab = BOOK_POLYCAB.find(p => p.accountId === "icici-bank-nsdl-demat-49794950")!;
assert.ok(polycab);
const source = sectorReturnHolding(polycab, accountIndex(BOOK_ACCOUNTS));
assert.equal(source.owner, "Ajay Jaisinghani");
assert.equal(source.provider, "ICICI Bank (NSDL demat)");
assert.equal(source.accountNo, "49794950");
assert.equal(source.statementDate, "2026-03-31");
assert.match(source.missing!, /purchase cost is missing/);
console.log("Sector coverage: account-specific stock identities, verified/absent cost, zero cost, unknown source and actual statement passed");
