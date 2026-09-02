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
import { readSpreadsheet } from "./ingest/lib/sheet.mjs";
import { makeSecurityMatcher } from "../shared/nameMatch.mjs";
import * as XLSX from "xlsx";

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

/**
 * MANAGERS ARE MATCHED ON A COMMITTED LIST, NOT ON TOKENS.
 *
 * The register writes a manager's name however the family types it — "VEC
 * ASSAGO PMS", "CARNELIAN BESPOKE", "MOTILAL OSWAL HEDGED". A token overlap
 * rule was tried and matched `KIRANAKART TECHNOLOGIES PRIVATE - ZEPTO` to
 * `TATA TECHNOLOGIES LIMITED` on the word "TECHNOLOGIES", `MAN INDUSTRIES` to
 * `Deep Industries` and `INTEGRIS HEALTH` to `Star Health`. Each is a different
 * company and each looked like a confident match, which is `securityKey`'s own
 * rule arriving one layer up: merging two different things is worse than
 * showing them apart. Every entry below is one line and can be challenged.
 */
const MANAGER_ALIASES = [
  [/^SANSHI\s+FUND/i, "Sanshi Fund"],
  [/BUOYANT/i, "Buoyant Capital"],
  [/^CARNELIAN\s+BESPOKE|^CARNELIAN$/i, "Carnelian Asset Management and Advisors Pvt Ltd"],
  [/CARNELIAN.*AMRITKAAL|AMRITKAAL/i, "Carnelian Bharat Amritkaal Fund"],
  [/ARISTOS|GOLDSTANDARD|GOLD\s*STANDARD/i, "Goldstandard Wealth Private Limited"],
  [/GREEN\s+LANTERN/i, "Green Lantern Capital LLP"],
  [/^SVAN/i, "SVAN Investment Managers LLP"],
  [/V\.?\s*E\.?\s*C\s+ASSAGO|^VEC\s+ASSAGO/i, "V.E.C Assago Capital Management LLP"],
  [/MOLECULE/i, "Molecule Ventures LLP"],
  [/HELIOS/i, "Helios Mutual Fund"],
  [/MOTILAL\s+OSWAL\s+HEDGED/i, "Motilal Oswal Hedged Equity Multi Factor Strategy"],
  [/FOUNDERS\s+FUND/i, "Motilal Oswal Founders Fund"],
  [/ACTIVE\s+MOMENTUM/i, "Motilal Oswal Active Momentum Fund"],
  [/DELPHI/i, "Motilal Oswal Delphi Equity Fund"],
  [/NEO\s+INFRA/i, "Neo Infra Income Opportunities Fund"],
  [/BARING/i, "Baring Private Equity India Fund"],
  [/SKY\s+CAPITAL/i, "Sky Capital Rising Titans Fund"],
  [/TRANSITION\s+VENTURE/i, "Transition Venture Capital"],
  [/INDIA\s+SME/i, "India SME Investments"],
  [/^3P\b/i, "3P Investment Managers"],
  [/^LKP/i, "LKP Securities"],
  [/360\s*ONE/i, "360 ONE Private Wealth"],
];
const PROVIDERS_IN_BOOK = new Set(ACCOUNTS.map((a) => a.provider));
const matchManager = (name) => {
  const hit = MANAGER_ALIASES.find(([re]) => re.test(name))?.[1] ?? null;
  return hit && PROVIDERS_IN_BOOK.has(hit) ? hit : null;
};

// ── the register ────────────────────────────────────────────────────────────
const wbBytes = readFileSync(REGISTER);
if (!readSpreadsheet(wbBytes).sheets?.length) throw new Error(`${REGISTER}: no sheets`);
const wb = XLSX.read(wbBytes, { type: "buffer", cellDates: true });

const EXIT_SHEET = /WRITE\s*OFF|EXIT/i;
const rows = [];
const perSheet = [];
for (const name of wb.SheetNames) {
  const rr = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
  const hdr = (rr[0] ?? []).map((c) => String(c ?? "").trim().toUpperCase());
  const iName = hdr.indexOf("INVESTMENT NAME");
  const iUnder = hdr.indexOf("INVESTMENT DONE UNDER");
  const iAmt = hdr.indexOf("INVESTMENT AMOUNT");
  const iCur = hdr.indexOf("CURRENT VALUATION");
  const iRet = hdr.findIndex((h) => h.includes("LOAN RETURNED"));
  let sum = 0, n = 0, subtotals = 0, returned = 0, valued = 0;
  for (const r of rr.slice(1)) {
    const nm = String(r[iName] ?? "").trim();
    if (iRet >= 0 && typeof r[iRet] === "number") returned += r[iRet];
    if (iCur >= 0 && typeof r[iCur] === "number") valued++;
    /**
     * A SUBTOTAL ROW IS NOT A TRANCHE. The register prints "<NAME> - TOTAL"
     * under each multi-tranche investment; summing the column blind counts
     * every one of those twice. 61 such rows carry ₹340.06 Cr between them.
     */
    if (/\bTOTAL\b/i.test(nm)) { subtotals++; continue; }
    const amt = typeof r[iAmt] === "number" ? r[iAmt] : null;
    if (!nm || amt == null) continue;
    sum += amt; n++;
    rows.push({ sheet: name, name: nm, under: String(r[iUnder] ?? "").trim(), amt });
  }
  perSheet.push({ name, tranches: n, subtotals, sum, returned, valued, isExit: EXIT_SHEET.test(name) });
}

const byName = new Map();
for (const r of rows) {
  const k = r.name.toUpperCase();
  if (!byName.has(k)) byName.set(k, { name: r.name, sheets: new Set(), unders: new Set(), amt: 0, tranches: 0 });
  const g = byName.get(k);
  g.sheets.add(r.sheet); if (r.under) g.unders.add(r.under); g.amt += r.amt; g.tranches++;
}

const B = { mgr: [], pos: [], none: [], exit: [] };
for (const g of byName.values()) {
  if ([...g.sheets].some((s) => EXIT_SHEET.test(s))) { B.exit.push(g); continue; }
  const m = matchManager(g.name);
  if (m) { g.hit = m; g.how = "manager"; B.mgr.push(g); continue; }
  const s = matchSecurity(g.name);
  if (s.key) { g.hit = s.key; g.how = s.how; B.pos.push(g); continue; }
  g.how = s.how; B.none.push(g);
}
const sum = (a) => a.reduce((s, x) => s + x.amt, 0);
const gross = sum([...byName.values()]);
const returned = perSheet.reduce((s, x) => s + x.returned, 0);
const valuedRows = perSheet.reduce((s, x) => s + x.valued, 0);

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
say(`Register: \`${REGISTER}\`, ${wb.SheetNames.length} sheets, ${rows.length} tranche rows, ${byName.size} distinct names.`);
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
say("**THE SUBTOTAL ROWS ARE THE FIRST TRAP.** The register prints a `<NAME> - TOTAL` row");
say(`under each multi-tranche investment. Summing the amount column blind reads ₹${cr(gross + perSheet.reduce((a, s) => a + 0, 0))} Cr`);
say("plus every one of those again. They are excluded here by name.");
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
say("1. **The quantities must tie.** The register records a payment, not a share count. Where");
say("   the family bought the same name twice and sold part, the money paid is not the cost of");
say("   the units still held — which is the rule `costFor` already applies to LKP's opening");
say("   ledger, joining a cost ONLY where the quantities match exactly.");
say("2. **The entity must match.** The register's `INVESTMENT DONE UNDER` is a first name;");
say("   the book's positions carry an `accountId`. A cost posted against the wrong member");
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
