// THE FAMILY'S OWN INVESTMENT REGISTER, USED AS THE CROSS-CHECK IT CAN BE —
// and never as a source.
//
// `source/august-2026-f/NEW INVESTMENT SHEET.xlsx` is the family's record of what
// they PAID: 8 sheets, one row per tranche, with the date, the entity it was made
// under and the amount. It reads perfectly. It still has no reader in
// `scripts/ingest/` BY DECISION, for the same reason the adviser's consolidated
// review does not: no institution struck it, so folding it in would end the
// guarantee that every figure traces to the statement of the institution that
// struck it. `lib/classify.mjs` labels it `Family investment register (not a
// statement)` and no extractor can reach it.
//
// ── WHAT IT CAN AND CANNOT SETTLE ───────────────────────────────────────────
//
// It is a CASH-OUTFLOW register. Its `INVESTMENT AMOUNT` column is money that
// left a bank account on a date; its `CURRENT VALUATION` column is empty on every
// row. So:
//
//   • it CAN speak to INVESTED CAPITAL, which is a cost, and the book is missing
//     a cost on exactly the rows a depository reports (a depository holds the
//     shares; it did not buy them);
//   • it CANNOT speak to MARKET VALUE, and therefore cannot move NAV by a rupee.
//     A NAV gap is closed by a HOLDING STATEMENT, never by a payment record.
//
// Conflating those two is the whole reason this report exists, and section C is
// where the distinction is drawn against real rows.
//
// Run: node scripts/register-reconcile.mjs  ->  docs/REGISTER-RECONCILIATION.md
import { readFileSync, writeFileSync } from "node:fs";
import { makeSecurityMatcher } from "../shared/nameMatch.mjs";
import { ownerIdFor } from "../shared/owners.mjs";
import { readRegister, partitionAgainstBook, EXIT_SHEET } from "./lib/registerRead.mjs";

const REGISTER = "source/august-2026-f/NEW INVESTMENT SHEET.xlsx";
const BOOK = "src/data/glowData.ts";
const OUT = "docs/REGISTER-RECONCILIATION.md";
const CR = 1e7;

const cr = (v, dp = 2) => (v == null ? "—" : (v / CR).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const rupees = (v) => (v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 }));

// ── the book ────────────────────────────────────────────────────────────────
const src = readFileSync(BOOK, "utf8");
function grab(name) {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) throw new Error(`${name} not found in ${BOOK}`);
  const eq = src.indexOf("=", i);
  const st = src.slice(eq + 1).search(/\S/) + eq + 1;
  let depth = 0, inStr = false, esc = false;
  for (let k = st; k < src.length; k++) {
    const c = src[k];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (depth === 0) return JSON.parse(src.slice(st, k + 1)); }
  }
  throw new Error(`${name}: unterminated literal`);
}
const POSITIONS = grab("BOOK_POSITIONS");
const ACCOUNTS = grab("BOOK_ACCOUNTS");
const SUMMARY = grab("BOOK_SUMMARY");
const ACCT = new Map(ACCOUNTS.map((a) => [a.accountId, a]));

const BY_KEY = new Map();
for (const p of POSITIONS) if (!BY_KEY.has(p.securityKey)) BY_KEY.set(p.securityKey, p);
const matchSecurity = makeSecurityMatcher(BY_KEY);
/** The provider names the register's manager aliases may resolve to. */
const PROVIDERS_IN_BOOK = new Set(ACCOUNTS.map((a) => a.provider));


// ── the register ────────────────────────────────────────────────────────────
// The workbook, its subtotal rules and the book partition all live in
// `scripts/lib/registerRead.mjs`, because `build-register.mjs` reads the same
// document to generate the page's data. Two copies would be two chances for this
// report and that page to state different figures about one workbook.
const {
  rows, perSheet, byName, ownerRows, qtyRows,
  gross, returned, blindSum, valuedRows, ownerResolved, ownerUnresolved,
} = readRegister(REGISTER);
const B = partitionAgainstBook(byName, BY_KEY, PROVIDERS_IN_BOOK);
const sum = (a) => a.reduce((s, x) => s + x.amt, 0);

// ── the costless positions, which is the point of the whole exercise ────────
const costless = POSITIONS.filter((p) => p.costBasis == null);
const costed = POSITIONS.filter((p) => p.costBasis != null);
const costlessMV = costless.reduce((s, p) => s + (p.marketValue ?? 0), 0);

/**
 * THE JOIN RUNS REGISTER -> BOOK, NEVER BOOK -> REGISTER, AND THE DIRECTION IS
 * THE WHOLE OF IT.
 *
 * `makeSecurityMatcher`'s prefix tier accepts an INDEX key that EXTENDS the
 * query key, because the book's names come from a depository that appends what
 * the scrip is ("FRACTAL ANALYTICS LIMITED - EQ") while a human writes the
 * company. So the human's name must be the QUERY and the book must be the
 * INDEX. Asking it the other way round — matching each costless book name
 * against a register index — inverts every prefix and reports that the register
 * covers NONE of the 60, which is measurably false.
 *
 * So the register is walked once against the book (the same pass section E
 * reports), and a costless position is "covered" when some register line
 * resolved TO IT.
 */
const regByBookKey = new Map();
for (const g of B.pos) if (!regByBookKey.has(g.hit)) regByBookKey.set(g.hit, g);
const covered = [], uncovered = [];
for (const p of costless) {
  const g = regByBookKey.get(p.securityKey);
  (g ? covered : uncovered).push({ p, reg: g ?? null, how: g?.how ?? "no register line resolves to this position" });
}

// ── the report ──────────────────────────────────────────────────────────────
const out = [];
const say = (s = "") => out.push(s);

say("# The family's investment register against the generated book");
say();
say("Generated by `node scripts/register-reconcile.mjs` — **do not edit by hand**.");
say();
say(`Register: \`${REGISTER}\`, ${perSheet.length} sheets, ${rows.length} tranche rows, ${byName.size} distinct names.`);
say(`Book: \`${BOOK}\`, ${POSITIONS.length} positions across ${ACCOUNTS.length} accounts, consolidated **₹${cr(SUMMARY.totalValue)} Cr**.`);
say();
say("## A. What this document is, and the one distinction that governs it");
say();
say("The register is the family's own record of **what they paid**. It is not a statement,");
say("has no reader in `scripts/ingest/` by decision, and never becomes a source — every");
say("figure in the book traces to the statement of the institution that struck it.");
say();
say(`**Its \`CURRENT VALUATION\` column is populated on ${valuedRows} of ${rows.length} rows.**`);
say("So it is a cost record and nothing else, and the consequence is the whole of section C:");
say();
say("| | Can the register settle it? | |");
say("| --- | --- | --- |");
say("| **Invested capital** | **YES** | it is a cost, and the book is missing a cost on exactly the rows a depository reports |");
say("| **Consolidated NAV** | **NO** | NAV is a market value; a payment record cannot move it by a rupee. A NAV gap closes with a HOLDING STATEMENT |");
say();
say("## B. What the register totals");
say();
say("| Sheet | Tranche rows | Subtotal rows skipped | Gross paid in |");
say("| --- | ---: | ---: | ---: |");
for (const s of perSheet) say(`| ${s.name.trim()}${s.isExit ? " *(exits)*" : ""} | ${s.tranches} | ${s.subtotals} | ₹${cr(s.sum)} Cr |`);
say(`| **Total** | **${rows.length}** | **${perSheet.reduce((a, s) => a + s.subtotals, 0)}** | **₹${cr(gross)} Cr** |`);
say();
say("**THE SUBTOTAL ROWS ARE THE FIRST TRAP.** The register repeats each multi-tranche");
say(`investment as its own row. Summing the amount column blind reads **₹${cr(blindSum)} Cr** —`);
say(`₹${cr(blindSum - gross)} Cr of double count, ${Math.round((blindSum / gross - 1) * 100)}% too high. They are excluded here by name`);
say("AND by shape: one of them, `BARING PRIVATE EQUITY INDIA FUND 6` on the FUND HOUSE sheet,");
say("carries ₹2.03 Cr and does not contain the word TOTAL at all — what marks it is that it has");
say("no serial number and no `INVESTMENT DONE UNDER`, because it is not an investment anybody");
say("made on a date.");
say();
say(`**AND GROSS IS NOT NET.** ₹${cr(returned)} Cr of the COMPANY sheet's rows have already been`);
say("repaid (its own `LOAN RETURNED BACK` column), and the `WRITE OFF - EXIT` sheet carries");
say(`₹${cr(sum(B.exit))} Cr the family no longer holds. Neither belongs in live invested capital.`);
say();
say("## C. THE HEADLINE — the costless positions, and whether the register covers them");
say();
say(`The book reports a cost on **${costed.length} of ${POSITIONS.length}** positions. The other **${costless.length}**, worth`);
say(`**₹${cr(costlessMV)} Cr** of market value, carry none — and every one of them sits in a`);
say("DEPOSITORY account, which is not an accident and not a defect:");
say();
say("| Custodian | Costless positions | Market value |");
say("| --- | ---: | ---: |");
const byProv = new Map();
for (const p of costless) {
  const k = ACCT.get(p.accountId)?.provider ?? "(unknown)";
  if (!byProv.has(k)) byProv.set(k, { n: 0, mv: 0 });
  const g = byProv.get(k); g.n++; g.mv += p.marketValue ?? 0;
}
for (const [k, g] of [...byProv].sort((a, b) => b[1].mv - a[1].mv)) say(`| ${k} | ${g.n} | ₹${cr(g.mv)} Cr |`);
say();
say("**A DEPOSITORY DOES NOT KNOW WHAT SHARES COST.** It holds them; it did not buy them.");
say("That is why the cell is `—` and not `₹0`: a zero cost reports the whole market value as");
say("profit at an infinite return. The register is the first document in this corpus that");
say("could supply the missing side.");
say();
say(`**IT COVERS ${covered.length} OF THE ${costless.length}.**`);
say();
say("| Costless book position | Custodian | Market value | Register line | Paid | Joined |");
say("| --- | --- | ---: | --- | ---: | --- |");
for (const c of covered.sort((a, b) => (b.p.marketValue ?? 0) - (a.p.marketValue ?? 0))) {
  say(`| ${c.p.security} | ${ACCT.get(c.p.accountId)?.provider ?? "—"} | ₹${cr(c.p.marketValue ?? 0)} Cr | ${c.reg.name} | ₹${cr(c.reg.amt)} Cr | ${c.how} |`);
}
say();
say(`Those ${covered.length} carry **₹${cr(covered.reduce((s, c) => s + (c.p.marketValue ?? 0), 0))} Cr** of market value against`);
say(`**₹${cr(covered.reduce((s, c) => s + c.reg.amt, 0))} Cr** the register says was paid for them.`);
say();
say("**THE PAID FIGURE IS NOT A COST BASIS YET, AND MUST NOT BE POSTED AS ONE.** Three things");
say("have to be true first, and none of them can be established from the register alone:");
say();
say(`1. **The quantities must tie**, and the register can only half support that. Its money column`);
say("   is a payment, not a share count: where the family bought the same name twice and sold");
say("   part, what was paid is not the cost of the units still held. That is the rule `costFor`");
say("   already applies to LKP's opening ledger, joining a cost ONLY where quantities match");
say(`   exactly. A count IS stated on **${qtyRows} of the ${rows.length} money rows (${Math.round(qtyRows / rows.length * 100)}%)** — but as PROSE`);
say('   inside the free-text "VALUATION AT THE TIME OF INVESTMENT" column ("3932 EQUITY SHARES -');
say('   FACE VALUE OF 10 - DISTICTIVE FROM…"). Parsing somebody\'s sentence for a figure that then');
say(`   becomes a tax basis is a different risk from reading a printed column, and on the other`);
say(`   ${rows.length - qtyRows} rows there is no count to tie against at all.`);
say("2. **The entity must resolve, and on this register it does not.** The book's positions carry");
say("   an `accountId`; the register carries `INVESTMENT DONE UNDER`, and on almost every row that");
say(`   is a BARE FIRST NAME. Run through \`shared/owners.mjs\`, **₹${cr(ownerUnresolved)} Cr —`);
say(`   ${Math.round(ownerUnresolved / (ownerUnresolved + ownerResolved) * 100)}% of the register — resolves to no \`ownerId\` at all**:`);
say();
say("   | `INVESTMENT DONE UNDER` | Resolves to | Paid |");
say("   | --- | --- | ---: |");
for (const [k, v] of [...ownerRows].sort((a, b) => b[1] - a[1])) {
  say(`   | ${k} | ${ownerIdFor(k) ?? "**— nothing —**"} | ₹${cr(v)} Cr |`);
}
say();
say("   Every alias in the registry carries a surname and the initials rule returns a one-word");
say("   name unchanged, so `AJAY`, `ANKITA`, `BHARAT` and `AARTI` can match nothing. Only the");
say("   fully-spelled trust names resolve — and `Bharat Jaisinghani Family Trust` with no numeral");
say("   resolves to neither trust, which is the hazard this book already names for that string.");
say("   Adding four aliases would fix it and is a DECISION, not a parsing rule: a bare `AJAY` is");
say("   unambiguous only because this family happens to have one, and the registry resolves on a");
say("   PAN first precisely because a name is a spelling. A cost posted against the wrong member");
say("   moves two per-entity totals at once.");
say("3. **It must not double-count a cost the book already has.** Several of these names are");
say("   also held in a PMS mandate that DOES report a cost.");
say();
say(`**AND ${uncovered.length} OF THE ${costless.length} ARE NOT IN THE REGISTER AT ALL** — ₹${cr(uncovered.reduce((s, c) => s + (c.p.marketValue ?? 0), 0))} Cr of market`);
say("value whose cost no document in this corpus reports. Largest first:");
say();
say("| Costless book position | Custodian | Market value |");
say("| --- | --- | ---: |");
for (const c of uncovered.sort((a, b) => (b.p.marketValue ?? 0) - (a.p.marketValue ?? 0)).slice(0, 20)) {
  say(`| ${c.p.security} | ${ACCT.get(c.p.accountId)?.provider ?? "—"} | ₹${cr(c.p.marketValue ?? 0)} Cr |`);
}
if (uncovered.length > 20) say(`| *… and ${uncovered.length - 20} more* | | |`);
say();
/**
 * NEAR MISSES ARE REPORTED AND NEVER APPLIED.
 *
 * The matcher refuses `ONESOURCE SPECIALITY PHARMA LTD` against the book's
 * `ONESOURCE SPECIAL-EQ` because the depository CLIPS a name to its column
 * width, so neither string prefixes the other. It refuses `CHANAKYA CORPORATE
 * SERVICES (FRACTUAL ANALYTICS)` against `FRACTAL ANALYTICS LIMITED - EQ`
 * because those are two different legal names and the register's is not a
 * misspelling of the book's — it names the vehicle the family invested THROUGH.
 *
 * The first is probably one holding and the second is a question only the family
 * can answer, and a rule that joined both would be indistinguishable from a rule
 * that joined neither. So they are LISTED, with the evidence, for a human to
 * commit as an alias — the same treatment `SECURITY_ALIASES` gets in
 * `review-reconcile.mjs`, where every entry was established by reading both
 * documents and is one line so it can be challenged on its own.
 */
const flat = (x) => String(x).toUpperCase().replace(/[^A-Z0-9]/g, "");
const near = [];
for (const c of uncovered) {
  const bf = flat(c.p.security);
  let best = null;
  for (const g of [...B.none, ...B.pos]) {
    const rf = flat(g.name);
    const head = rf.slice(0, 10);
    if (head.length >= 8 && (bf.startsWith(head) || rf.startsWith(bf.slice(0, 10)))) {
      if (!best || g.amt > best.amt) best = g;
    }
  }
  if (best) near.push({ c, best });
}
if (near.length) {
  say("### D0. Near misses — the same holding under two names, for a human to confirm");
  say();
  say("Not joined, and deliberately so: each of these needs somebody to read both documents");
  say("and commit an alias. A rule loose enough to take them is loose enough to take");
  say("`KIRANAKART TECHNOLOGIES` against `TATA TECHNOLOGIES`, which it did when tried.");
  say();
  say("| Book position (no cost) | Market value | Looks like this register line | Paid |");
  say("| --- | ---: | --- | ---: |");
  for (const n of near.sort((a, b) => (b.c.p.marketValue ?? 0) - (a.c.p.marketValue ?? 0))) {
    say(`| ${n.c.p.security} | ₹${cr(n.c.p.marketValue ?? 0)} Cr | ${n.best.name.slice(0, 58)} | ₹${cr(n.best.amt)} Cr |`);
  }
  say();
}
say("What closes these is a **contract note or a transaction statement** from the custodian —");
say("Motilal Oswal for the demat rows, ICICI Bank for the NSDL ones — not another register.");
say();
say("## D. Register names with NO counterpart in the book");
say();
say("These are investments the family records paying for and which **no statement in");
say("`source/` reports**. This is the part of the register that speaks to NAV — not because");
say("the amounts are values, but because each names a holding the book cannot see at all.");
say();
say("| Register line | Entity | Sheets | Paid |");
say("| --- | --- | --- | ---: |");
for (const g of B.none.sort((a, b) => b.amt - a.amt).slice(0, 40)) {
  say(`| ${g.name.slice(0, 62)} | ${[...g.unders].join(", ") || "—"} | ${[...g.sheets].join(", ")} | ₹${cr(g.amt)} Cr |`);
}
if (B.none.length > 40) say(`| *… and ${B.none.length - 40} more* | | | ₹${cr(sum(B.none.slice(40)))} Cr |`);
say();
say(`**${B.none.length} names, ₹${cr(sum(B.none))} Cr paid in.** That figure is a COST and is the size of the`);
say("ask, never a value this book will publish: what each is worth today is on a statement");
say("nobody has sent.");
say();
say("## E. Where the register and the book already agree on a name");
say();
say(`| | Names | Paid, per the register |`);
say("| --- | ---: | ---: |");
say(`| Matched to a MANAGED ACCOUNT in the book | ${B.mgr.length} | ₹${cr(sum(B.mgr))} Cr |`);
say(`| Matched to a POSITION in the book | ${B.pos.length} | ₹${cr(sum(B.pos))} Cr |`);
say(`| No counterpart (section D) | ${B.none.length} | ₹${cr(sum(B.none))} Cr |`);
say(`| Written off / exited | ${B.exit.length} | ₹${cr(sum(B.exit))} Cr |`);
say(`| **Total** | **${byName.size}** | **₹${cr(gross)} Cr** |`);
say();
say("**THE ₹" + cr(gross) + " Cr IS NOT ADDITIVE TO THE BOOK AND MUST NEVER BE PRESENTED AS IF IT WERE.**");
say("It is money paid since 2017 across every vehicle the family has ever used, including the");
say("mandates the book already carries in full, positions it already values, capital already");
say("returned and investments already written off.");
say();
say("| Matched to a managed account | Register line | Paid |");
say("| --- | --- | ---: |");
for (const g of B.mgr.sort((a, b) => b.amt - a.amt)) say(`| ${g.hit} | ${g.name} | ₹${cr(g.amt)} Cr |`);
say();
say("| Matched to a position | Register line | Paid | Joined |");
say("| --- | --- | ---: | --- |");
for (const g of B.pos.sort((a, b) => b.amt - a.amt)) say(`| ${BY_KEY.get(g.hit).security} | ${g.name} | ₹${cr(g.amt)} Cr | ${g.how} |`);
say();

writeFileSync(OUT, out.join("\n") + "\n");
console.log(OUT);
console.log(`  register gross      ₹${cr(gross)} Cr over ${rows.length} tranches, ${byName.size} names`);
console.log(`  costless positions  ${costless.length} (₹${cr(costlessMV)} Cr) — register covers ${covered.length}, misses ${uncovered.length}`);
console.log(`  no book counterpart ${B.none.length} names, ₹${cr(sum(B.none))} Cr paid in`);
