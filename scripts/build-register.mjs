// THE FAMILY'S INVESTMENT REGISTER, GENERATED FOR THE SCREEN — and kept out of
// every portfolio total by construction.
//
// `src/data/registerData.ts` is to the register what `BOOK_POLYCAB` is to the
// promoter stock: real, measured data that must never reach a NAV. The pattern is
// deliberately copied, because it is the one this repo has already proven:
//
//   • it is GENERATED from `source/`, so it regenerates byte-identically and is
//     never hand-edited (Convention 7);
//   • it is a SEPARATE module from `glowData.ts`, so no page reading the book can
//     pick it up by accident;
//   • `src/pages/Register.tsx` is its ONLY reader and reads it DIRECTLY rather
//     than through `PortfolioContext`, so nothing here can leak into a portfolio
//     figure.
//
// WHAT IT IS NOT. The register is a CASH-OUTFLOW record: `INVESTMENT AMOUNT` is
// money that left a bank account on a date, and `CURRENT VALUATION` is empty on
// every row. So it can speak to what was PAID and it cannot value anything. No
// figure it carries is a market value, and none may be added to one.
//
// AND ITS GROSS IS NOT ADDITIVE. Roughly half of it is mandates and positions the
// book already carries in full. That is why the emit is PARTITIONED rather than
// dumped: the page shows which names the book already has and which it does not,
// and the two are never summed. `partitionAgainstBook` in scripts/lib does it,
// and `register-reconcile.mjs` reports the same partition — one definition, two
// consumers, so the page and the report cannot disagree.
//
// Run: node scripts/build-register.mjs  ->  src/data/registerData.ts
import { readFileSync, writeFileSync } from "node:fs";
import { readRegister, partitionAgainstBook, REGISTER_PATH } from "./lib/registerRead.mjs";

const BOOK = "src/data/glowData.ts";
const OUT = "src/data/registerData.ts";

// ── the book, read the same way review-reconcile reads it ───────────────────
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
const ACCT = new Map(ACCOUNTS.map((a) => [a.accountId, a]));
const BY_KEY = new Map();
for (const p of POSITIONS) if (!BY_KEY.has(p.securityKey)) BY_KEY.set(p.securityKey, p);
const PROVIDERS_IN_BOOK = new Set(ACCOUNTS.map((a) => a.provider));

// ── the register ────────────────────────────────────────────────────────────
const R = readRegister(REGISTER_PATH);
const B = partitionAgainstBook(R.byName, BY_KEY, PROVIDERS_IN_BOOK);
const sum = (a) => a.reduce((s, g) => s + g.amt, 0);

const line = (g) => ({
  name: g.name,
  paid: Math.round(g.amt * 100) / 100,
  tranches: g.tranches,
  sheets: [...g.sheets].map((s) => s.trim()).sort(),
  owners: [...g.unders].sort(),
});
const byPaid = (a, b) => b.paid - a.paid;

/**
 * THE COSTLESS POSITIONS THE REGISTER COVERS.
 *
 * 60 of the book's positions report no cost, every one of them in a DEPOSITORY
 * account — a depository holds the shares and did not buy them. This is the one
 * place the register could supply the missing side, and it reaches 7 of them.
 *
 * `paid` is NOT posted as a cost basis and this file does not pretend it could
 * be: the quantities have to tie, the entity has to resolve to an account, and it
 * must not double-count a cost a mandate already reports. The page states all
 * three. What is emitted is the register's own figure beside the book's own
 * market value, for a human to compare.
 */
const regByBookKey = new Map();
for (const g of B.pos) if (!regByBookKey.has(g.hit)) regByBookKey.set(g.hit, g);
const costlessCovered = POSITIONS
  .filter((p) => p.costBasis == null && regByBookKey.has(p.securityKey))
  .map((p) => ({
    security: p.security,
    securityKey: p.securityKey,
    custodian: ACCT.get(p.accountId)?.provider ?? null,
    marketValue: p.marketValue ?? null,
    paid: Math.round(regByBookKey.get(p.securityKey).amt * 100) / 100,
  }))
  .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
const costlessAll = POSITIONS.filter((p) => p.costBasis == null);

const j = (v) => JSON.stringify(v, null, 2);
const L = [];
L.push("// GENERATED — do not edit by hand. Rebuild with `npm run build-register`.");
L.push("//");
L.push(`// Source: \`${REGISTER_PATH}\` — the family's OWN record of what they paid.`);
L.push("// It is NOT a statement and is NOT a source for the book: no institution struck");
L.push("// it, and `CURRENT VALUATION` is empty on every one of its rows. Every figure");
L.push("// below is a CASH OUTFLOW, never a market value, and none may be added to NAV.");
L.push("//");
L.push("// `src/pages/Register.tsx` is the only reader. It reads this module DIRECTLY");
L.push("// rather than through PortfolioContext, so nothing here can reach a portfolio");
L.push("// total — the same construction that keeps BOOK_POLYCAB off every other page.");
L.push("import type { RegisterLine, RegisterSummary, RegisterCostCandidate } from \"@/lib/types\";");
L.push("");
L.push("/** The workbook this file is generated from. */");
L.push(`export const REGISTER_SOURCE = ${j(REGISTER_PATH)};`);
L.push("");
L.push("export const REGISTER_SUMMARY: RegisterSummary = " + j({
  grossPaid: Math.round(R.gross * 100) / 100,
  blindSum: Math.round(R.blindSum * 100) / 100,
  tranches: R.rows.length,
  names: R.byName.size,
  sheets: R.perSheet.length,
  loansRepaid: Math.round(R.returned * 100) / 100,
  writtenOff: Math.round(sum(B.exit) * 100) / 100,
  rowsWithCurrentValuation: R.valuedRows,
  rowsStatingAQuantity: R.qtyRows,
  paidUnderAnUnresolvedOwner: Math.round(R.ownerUnresolved * 100) / 100,
  inBookAsAccount: Math.round(sum(B.mgr) * 100) / 100,
  inBookAsPosition: Math.round(sum(B.pos) * 100) / 100,
  notInBook: Math.round(sum(B.none) * 100) / 100,
  namesInBookAsAccount: B.mgr.length,
  namesInBookAsPosition: B.pos.length,
  namesNotInBook: B.none.length,
  namesExited: B.exit.length,
  costlessPositions: costlessAll.length,
  costlessMarketValue: Math.round(costlessAll.reduce((s, p) => s + (p.marketValue ?? 0), 0) * 100) / 100,
  costlessCovered: costlessCovered.length,
}) + ";");
L.push("");
L.push("/** Per sheet, with the subtotal rows the reader excluded. */");
L.push("export const REGISTER_SHEETS = " + j(R.perSheet.map((s) => ({
  name: s.name.trim(),
  tranches: s.tranches,
  subtotalRowsSkipped: s.subtotals,
  paid: Math.round(s.sum * 100) / 100,
  isExit: s.isExit,
}))) + ";");
L.push("");
L.push("/** Owner strings as the family typed them, and whether they resolve. */");
L.push("export const REGISTER_OWNERS = " + j([...R.ownerRows]
  .map(([owner, amt]) => ({ owner, paid: Math.round(amt * 100) / 100 }))
  .sort((a, b) => b.paid - a.paid)) + ";");
L.push("");
L.push("/** Names with NO counterpart anywhere in the book — the ask, and a COST. */");
L.push("export const REGISTER_NOT_IN_BOOK: RegisterLine[] = " + j(B.none.map(line).sort(byPaid)) + ";");
L.push("");
L.push("/** Names the book already carries as a managed account. NOT additive. */");
L.push("export const REGISTER_IN_BOOK_ACCOUNT: RegisterLine[] = " + j(B.mgr.map((g) => ({ ...line(g), heldAs: g.hit })).sort(byPaid)) + ";");
L.push("");
L.push("/** Names the book already carries as a position. NOT additive. */");
L.push("export const REGISTER_IN_BOOK_POSITION: RegisterLine[] = " + j(B.pos.map((g) => ({ ...line(g), heldAs: g.hit })).sort(byPaid)) + ";");
L.push("");
L.push("/** Written off or exited — money the family no longer holds. */");
L.push("export const REGISTER_EXITED: RegisterLine[] = " + j(B.exit.map(line).sort(byPaid)) + ";");
L.push("");
L.push("/** Costless book positions the register states a paid figure for. */");
L.push("export const REGISTER_COST_CANDIDATES: RegisterCostCandidate[] = " + j(costlessCovered) + ";");
L.push("");

writeFileSync(OUT, L.join("\n"));
const cr = (v) => (v / 1e7).toFixed(2);
console.log(OUT);
console.log(`  ${R.rows.length} tranches, ${R.byName.size} names, ₹${cr(R.gross)} Cr paid in`);
console.log(`  in the book: ₹${cr(sum(B.mgr) + sum(B.pos))} Cr (${B.mgr.length + B.pos.length} names) — NOT additive`);
console.log(`  not in the book: ₹${cr(sum(B.none))} Cr (${B.none.length} names)`);
console.log(`  cost candidates for costless positions: ${costlessCovered.length} of ${costlessAll.length}`);
