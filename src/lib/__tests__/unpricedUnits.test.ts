/**
 * ── UNITS A HOLDING STATEMENT RECORDS AND PRICES NOWHERE (the figure audit, A-17)
 *
 * Anchored on the GENERATED artefacts — `glowData.ts` (the book, and the
 * unvalued rows `build-book` names) and `fundNavs.ts` (AMFI's published NAVs) —
 * so every expectation is derived on the run.
 *
 * The expected set is RE-DERIVED here by the six gates written a second time,
 * never read back out of `unpricedStatementUnits`: a check that calls the helper
 * it is checking agrees with it by construction. The two agreeing is the
 * measurement.
 *
 * The load-bearing cases are the REFUSALS, on constructed inputs: a valuation
 * that priced every recorded balance renders a page of plausible figures, and
 * the one book this suite has cannot exercise most of them.
 */
import {
  unpricedStatementUnits, describeDepositoryUnits, depositoryUnitsGist, VALUE_UNPRICED_STATEMENT_UNITS,
} from "../fundNavs";
import { BOOK_FUND_NAVS } from "@/data/fundNavs";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS, BOOK_POLYCAB } from "@/data/glowData";
import type { Account, Position, UnvaluedStatementHolding } from "../types";
import { unvaluedHoldingsOf, unvaluedStatementLinesOf } from "../accounts";

let pass = 0;
const fails: string[] = [];
const ok = (what: string, cond: boolean, note = "") => {
  if (cond) { pass += 1; console.log(`ok   ${what}${note ? ` — ${note}` : ""}`); }
  else { fails.push(what); console.log(`FAIL ${what}${note ? ` — ${note}` : ""}`); }
};

console.log("──── Units a statement records and prices nowhere (A-17)");

const I = (x: { isin?: string | null }) => x.isin?.trim().toUpperCase() || null;
const acc = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
const navBy = new Map<string, (typeof BOOK_FUND_NAVS)[number]>();
for (const e of BOOK_FUND_NAVS) {
  const k = e.isin.trim().toUpperCase();
  const cur = navBy.get(k);
  if (!cur || (!cur.usableForValue && e.usableForValue)) navBy.set(k, e);
}

// ── the six gates, written a second time ─────────────────────────────────────
function expected(unvalued: readonly UnvaluedStatementHolding[], accounts: Map<string, Account>, positions: readonly Position[]) {
  const out: { accountId: string; isin: string; quantity: number; nav: number; witness: string }[] = [];
  for (const u of unvalued) {
    const isin = I(u);
    if (!isin || u.assetClass !== "Mutual Fund" || !(typeof u.quantity === "number" && u.quantity > 0)) continue;
    if (u.sameUnitsReportedBy) continue;
    const nav = navBy.get(isin);
    if (!nav || !nav.usableForValue || !(nav.nav > 0)) continue;
    const own = accounts.get(u.accountId);
    if (!own || !u.asOf) continue;
    const w = positions.find((p) => I(p) === isin && p.accountId !== u.accountId
      && accounts.get(p.accountId)?.provider === own.provider && accounts.get(p.accountId)?.asOf === u.asOf
      && typeof p.currentPrice === "number" && p.currentPrice > 0);
    if (!w) continue;
    const r = nav.nav / (w.currentPrice as number);
    if (!(r > 0.5 && r < 2)) continue;
    if (positions.some((p) => p.accountId === u.accountId && I(p) === isin)) continue;
    out.push({ accountId: u.accountId, isin, quantity: u.quantity, nav: nav.nav, witness: w.accountId });
  }
  return out;
}

const got = unpricedStatementUnits();
const want = expected(BOOK_UNVALUED_HOLDINGS, acc, BOOK_POSITIONS);
const sig = (x: { accountId: string; isin?: string | null; quantity: number }) => `${x.accountId}|${I(x)}|${x.quantity}`;

console.log("── the book ──");
ok("the switch is on", VALUE_UNPRICED_STATEMENT_UNITS === true);
ok("the book names holdings no statement prices — a suite that passes over no input claims nothing",
  BOOK_UNVALUED_HOLDINGS.length > 0, `${BOOK_UNVALUED_HOLDINGS.length} row(s)`);
ok("LOAD-BEARING: at least one recorded balance passes every gate — or the whole rule is untested here",
  want.length > 0, want.map((w) => `${w.accountId} ${w.quantity} u`).join("; "));
ok("the helper values exactly the rows the gates admit, and no other",
  got.map(sig).sort().join(",") === want.map(sig).sort().join(","),
  `got ${got.length}, re-derived ${want.length}`);
ok("each is valued at its own units × the published NAV, nothing else",
  got.every((p) => { const w = want.find((x) => sig(x) === sig(p)); return !!w && Math.abs(p.marketValue - w.quantity * w.nav) < 0.01 && p.currentPrice === w.nav; }));
// THE UNITS, NOT THE VALUE: the value moves with every published NAV (it read
// ≈ ₹7.15 Cr on the day of the audit and ₹7.18 Cr once AMFI's file refreshed),
// and "units × that NAV" is already asserted above. What the audit found is the
// two statements' own balances.
ok("...and on this book that is the ABSL Balanced Advantage units the audit found — 3,93,095.951 + 2,42,412.122 units",
  got.length === 2 && got.every((p) => I(p) === "INF084M01AB8")
    && Math.abs(got.reduce((s, p) => s + p.quantity, 0) - 635508.073) < 0.0005,
  `${got.reduce((s, p) => s + p.quantity, 0).toFixed(3)} units, ₹${(got.reduce((s, p) => s + p.marketValue, 0) / 1e7).toFixed(4)} Cr over ${got.length} account(s)`);
ok("no cost, never zero — a depository holds units and did not buy them",
  got.every((p) => p.costBasis === null && p.costUnavailable === true && p.unrealizedPnL === null && p.returnPct === null));
ok("each is NAV-priced, carries the NAV's own date, and says it is a no-rate row with its witness",
  got.every((p) => p.navPriced === true && !!p.navDate && p.depositoryUnits?.kind === "no-rate"
    && !!p.depositoryUnits.witnessAccountId && acc.has(p.depositoryUnits.witnessAccountId)));
ok("each takes the witness's key, so one scheme stays one key on every page",
  got.every((p) => BOOK_POSITIONS.some((b) => b.securityKey === p.securityKey && I(b) === I(p))));
ok("no row is a position the book already carries in the same account",
  got.every((p) => !BOOK_POSITIONS.some((b) => b.accountId === p.accountId && I(b) === I(p))));
const fenced = new Set(BOOK_POLYCAB.map((p) => p.securityKey));
ok("no ring-fenced security is valued", got.every((p) => !fenced.has(p.securityKey)));
ok("every row's account is one the book carries, owned by a named member",
  got.every((p) => !!acc.get(p.accountId)?.owner));

// ── the words ────────────────────────────────────────────────────────────────
console.log("── the sentence ──");
for (const p of got) {
  const s = describeDepositoryUnits(p.depositoryUnits!);
  const w = acc.get(p.depositoryUnits!.witnessAccountId!)!;
  ok(`the no-rate sentence names the statement's date and the witness (${p.accountId.slice(-6)})`,
    s.includes(p.depositoryUnits!.asOf ?? "∅") && s.includes(w.owner) && s.includes(w.accountNo) && /prints no rate/.test(s));
  ok("...and never says the account sent no holding statement — it did",
    !/no holding statement/.test(s));
}
ok("a closing-balance row keeps the sentence it has always had",
  /transaction statement and no holding statement/.test(describeDepositoryUnits({ asOf: "2026-07-31", source: null })));
const closingRow = { depositoryUnits: { asOf: "2026-07-31", source: null } };
ok("the set phrase over no-rate rows alone never says no holding statement was sent",
  got.length > 0 && !/no holding statement/.test(depositoryUnitsGist(got)) && /prints no rate/.test(depositoryUnitsGist(got)));
ok("...over closing-balance rows alone it says the account sent none",
  /no holding statement/.test(depositoryUnitsGist([closingRow])) && !/prints no rate/.test(depositoryUnitsGist([closingRow])));
ok("...and over both it names both",
  got.length > 0 && /no holding statement/.test(depositoryUnitsGist([...got, closingRow])) && /prints no rate/.test(depositoryUnitsGist([...got, closingRow])));

// ── every line a statement records, named on the owner's page ────────────────
console.log("── the unvalued lines, per owner ──");
const live = [...BOOK_POSITIONS, ...got];
const owners = [...new Set(BOOK_ACCOUNTS.map((a) => a.owner))];
const listed = owners.flatMap((o) => unvaluedStatementLinesOf(o, BOOK_ACCOUNTS, live, BOOK_UNVALUED_HOLDINGS));
const lineRows = listed.flatMap((g) => g.lines.map((l) => l.row));
const wholeAccounts = new Set(owners.flatMap((o) => unvaluedHoldingsOf(o, BOOK_ACCOUNTS, live).map((u) => u.account.accountId)));
ok("LOAD-BEARING: the book has unvalued lines inside accounts that value others — or this list is untested",
  lineRows.length > 0, `${lineRows.length} line(s) across ${listed.length} account(s)`);
ok("every unvalued line is named once, or is a depository copy a fund's own statement reports, or sits in an account named whole",
  BOOK_UNVALUED_HOLDINGS.every((u) => {
    const n = lineRows.filter((r) => r === u).length;
    if (u.sameUnitsReportedBy) return n === 0;
    return wholeAccounts.has(u.accountId) ? n === 0 : n === 1;
  }));
ok("...and the depository copies are counted, not dropped silently",
  listed.reduce((s, g) => s + g.reportedElsewhere, 0)
    === BOOK_UNVALUED_HOLDINGS.filter((u) => u.sameUnitsReportedBy && !wholeAccounts.has(u.accountId)).length);
ok("an owner's accounts are split between the two lists, none in both",
  listed.every((g) => !wholeAccounts.has(g.account.accountId)));
ok("the lines the live book values at AMFI's NAV say so, and no other line does",
  lineRows.length > 0 && listed.every((g) => g.lines.every((l) =>
    !!l.valuedLive === got.some((p) => p.accountId === l.row.accountId && I(p) === I(l.row)))));

// ── the refusals, on constructed inputs ──────────────────────────────────────
console.log("── the refusals ──");
const DEP = "Test Depository (demat)";
const mk = (id: string, asOf = "2026-07-31", provider = DEP): Account =>
  ({ ...BOOK_ACCOUNTS[0], accountId: id, provider, asOf, owner: "Test Owner", accountNo: id.toUpperCase() } as Account);
const base = navBy.get("INF084M01AB8");
if (!base || !base.usableForValue) {
  ok("the ABSL NAV is in the store and usable — the constructed cases need a real one", false);
} else {
  const isin = "INF084M01AB8";
  const wit = { ...BOOK_POSITIONS.find((p) => I(p) === isin)!, accountId: "t-w", currentPrice: base.nav * 0.97 } as Position;
  const row: UnvaluedStatementHolding = {
    accountId: "t-u", ownerId: "t", securityKey: "t-scheme", security: "T SCHEME", isin,
    assetClass: "Mutual Fund", quantity: 1000, faceValue: null, asOf: "2026-07-31", sameUnitsReportedBy: null, reason: "test",
  };
  const accs = [mk("t-u"), mk("t-w")];
  const run = (u: Partial<UnvaluedStatementHolding>, as = accs, ps: Position[] = [wit]) =>
    unpricedStatementUnits([{ ...row, ...u }], as, ps);
  ok("CONTROL: the constructed row passes every gate", run({}).length === 1);
  ok("an ETF is refused — its units can be on another basis than its NAV", run({ assetClass: "ETF" }).length === 0);
  ok("an AIF unit is refused", run({ assetClass: "AIF" }).length === 0);
  ok("a row a fund's own statement also reports is refused", run({ sameUnitsReportedBy: "t-f" }).length === 0);
  ok("no ISIN, no valuation", run({ isin: null }).length === 0);
  ok("no units, no valuation", run({ quantity: null }).length === 0);
  ok("a scheme AMFI publishes no NAV for is refused", run({ isin: "INF000X00000" }).length === 0);
  ok("no witness at the same depository — refused",
    run({}, [mk("t-u"), mk("t-w", "2026-07-31", "Another Depository (demat)")]).length === 0);
  ok("a witness on another day — refused", run({}, [mk("t-u"), mk("t-w", "2026-06-30")]).length === 0);
  ok("a witness with no per-unit mark — refused", run({}, accs, [{ ...wit, currentPrice: null }]).length === 0);
  ok("a witness marked ten times the NAV is a share-count break — refused",
    run({}, accs, [{ ...wit, currentPrice: base.nav * 10 }]).length === 0);
  ok("an account that already carries the ISIN is not valued twice",
    run({}, accs, [wit, { ...wit, accountId: "t-u" }]).length === 0);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  FAILED: ${f}`); process.exit(1); }
console.log("All unpriced-units checks passed.");
