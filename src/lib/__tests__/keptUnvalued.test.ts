// THE FAMILY'S "KEEP THEM UNVALUED" — DECIDED 28 SEP 2026, REVERSED 14 OCT 2026.
//
//   "keep them unvalued for now" (28 Sep), then "include this in the dashboard
//   data as well" (14 Oct) — about Ankita's 94,967 Clean Max Enviro Energy
//   Solutions shares on her Motilal Oswal demat 1201090012838316.
//
// The table in `shared/keptUnvalued.mjs` is empty again. This suite holds the
// REVERSAL, three ways, none of which implies another:
//
//   1. THE TABLE NAMES NO CLEAN MAX ROW, and the helper finds none for it.
//   2. THE BOOK'S ROW NO LONGER CARRIES THE DECISION: it is still a quantity with
//      no STATEMENT value (rate 0.000 is printed), with the statement's own reason.
//   3. NOTHING ON THE STATEMENT BASIS VALUES IT — the value is the LIVE layer's,
//      at the CLEANMAX quote (`depositoryShares.ts`, kind "no-price"), which
//      `fundNavs.test.ts` asserts.
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import { KEPT_UNVALUED, keptUnvaluedFor } from "../../../shared/keptUnvalued.mjs";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const ISIN = "INE647U01026";
const acc = BOOK_ACCOUNTS.filter((a) => String(a.accountNo) === "1201090012838316");
ok("Ankita's demat is one account in the book", acc.length === 1, `${acc.length} found`);
const a = acc[0];

ok("the table names no Clean Max row", !KEPT_UNVALUED.some((d: { isin: string }) => d.isin === ISIN), String(KEPT_UNVALUED.length));
ok("the helper finds no decision for Ankita's row",
  keptUnvaluedFor({ provider: a?.provider ?? "", accountNo: a?.accountNo ?? "", isin: ISIN }) === null);

const rows = BOOK_UNVALUED_HOLDINGS.filter((u) => u.accountId === a?.accountId && u.isin === ISIN);
ok("the book still carries it as one statement row", rows.length === 1, `${rows.length} row(s)`);
for (const u of rows) {
  ok("its reason no longer names the family's 28 Sep decision", !/keep them unvalued/i.test(u.reason) && !u.reason.includes("2026-09-28"), u.reason);
  ok("it is 94,967 units, a quantity with no statement value", u.quantity === 94967 && !("marketValue" in u), String(u.quantity));
}
const valued = BOOK_POSITIONS.filter((p) => p.accountId === a?.accountId && p.isin === ISIN);
ok("no statement-basis position values that account's row", valued.length === 0, valued.map((p) => p.marketValue).join(", "));

console.log(`\n${fails ? `${fails} FAILED` : "all passed"}`);
process.exit(fails ? 1 : 0);
