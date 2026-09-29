// THE FAMILY'S "KEEP THEM UNVALUED", HELD TO THE BOOK AND THE STATEMENT.
//
//   "keep them unvalued for now" — the family, 28 Sep 2026, about Ankita's
//   94,967 Clean Max Enviro Energy Solutions shares, which Ankita's Motilal Oswal
//   demat statement of 31 Jul 2026 holds under lock-in with no rate.
//
// `shared/keptUnvalued.mjs` is the answer and `build-book` applies it. This
// suite proves three things, none of which implies another:
//
//   1. THE STATEMENT STILL SAYS WHAT THE ENTRY CLAIMS — its cited words are in
//      that document's committed pages.json. A drop that prices the shares, or
//      releases the lock-in, fails here rather than leaving the decision to
//      assert something the page no longer prints.
//   2. THE BOOK CARRIES THE ROW AS A QUANTITY WITH NO VALUE, and its reason
//      names the family's decision. A drifted key would match nothing and the
//      row would go back to the statement's own reason without a word.
//   3. NOTHING VALUES IT: no position anywhere in the book is that account's
//      row of that ISIN. The decision is to NOT borrow a mark; a build that
//      valued it would put a figure on screen the family declined.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import { KEPT_UNVALUED, keptUnvaluedFor } from "../../../shared/keptUnvalued.mjs";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

ok("the table carries at least one decision", KEPT_UNVALUED.length > 0, String(KEPT_UNVALUED.length));

for (const d of KEPT_UNVALUED) {
  const label = `${d.isin} on ${d.provider} ${d.accountNo}`;
  // ── 1. the statement ──
  const file = path.resolve("public/audit", d.cite.docKey, "pages.json");
  let text = "";
  try { text = JSON.stringify(JSON.parse(readFileSync(file, "utf8"))).replace(/\\n/g, " ").replace(/\s+/g, " "); } catch { /* reported below */ }
  ok(`${label}: the cited statement is in the archive`, text.length > 0, d.cite.docKey);
  for (const c of d.cite.text) ok(`${label}: it prints "${c}"`, text.includes(c));

  // ── 2. the book ──
  const acc = BOOK_ACCOUNTS.filter((a) => a.provider === d.provider && String(a.accountNo) === String(d.accountNo));
  ok(`${label}: the account is one account in the book`, acc.length === 1, `${acc.length} found`);
  const rows = BOOK_UNVALUED_HOLDINGS.filter((u) => u.accountId === acc[0]?.accountId && u.isin === d.isin);
  ok(`${label}: the book carries it as one unvalued row`, rows.length === 1, `${rows.length} row(s)`);
  for (const u of rows) {
    ok(`${label}: its reason names the family's decision and its date`,
      u.reason.includes(d.decided) && u.reason.includes(d.words), u.reason);
    ok(`${label}: …and keeps the statement's own fact`, u.reason.includes(d.why), u.reason);
    ok(`${label}: it is a quantity, never a value`, typeof u.quantity === "number" && u.quantity > 0 && !("marketValue" in u), String(u.quantity));
  }
  ok(`${label}: the helper finds the entry the book's row is on`,
    keptUnvaluedFor({ provider: d.provider, accountNo: d.accountNo, isin: d.isin }) === d);

  // ── 3. nothing values it ──
  const valued = BOOK_POSITIONS.filter((p) => p.accountId === acc[0]?.accountId && p.isin === d.isin);
  ok(`${label}: no position in the book values that account's row`, valued.length === 0, valued.map((p) => p.marketValue).join(", "));
}

// THE HELPER IS KEYED ON THE ACCOUNT AND THE ISIN, NEVER ON A NAME: the same
// company held in ANOTHER account is not swept in. Ajay's ICICI NSDL statement
// values Clean Max; that row must not take Ankita's decision.
{
  const d = KEPT_UNVALUED[0];
  const elsewhere = BOOK_POSITIONS.filter((p) => p.isin === d.isin);
  const accs = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
  ok("the same ISIN valued in another account takes no decision",
    elsewhere.every((p) => keptUnvaluedFor({ provider: accs.get(p.accountId)?.provider ?? "", accountNo: accs.get(p.accountId)?.accountNo ?? "", isin: p.isin }) === null),
    elsewhere.map((p) => p.accountId).join(", "));
  ok("…and a row with no ISIN takes none", keptUnvaluedFor({ provider: d.provider, accountNo: d.accountNo, isin: null }) === null);
}

console.log(`\n${fails ? `${fails} FAILED` : "all passed"}`);
process.exit(fails ? 1 : 0);
