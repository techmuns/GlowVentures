/**
 * ── UNITS A HOLDING STATEMENT RECORDS AND PRICES NOWHERE (the figure audit, A-17)
 *
 * Anchored on the GENERATED artefacts — `glowData.ts` (the book, and the
 * unvalued rows `build-book` names) and `fundNavs.ts` (AMFI's published NAVs) —
 * so every expectation is derived on the run.
 *
 * The expected set is RE-DERIVED here by the seven gates written a second time,
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

// ── the seven gates, written a second time ───────────────────────────────────
//
// Stage 10cz: the Motilal statements' printed rate is the price of each
// holding's LAST DEPOSITORY MOVEMENT. For a fund that is a NAV of the scheme on
// the movement's day, struck on the units the statement counts — so a row's OWN
// rate is its strongest witness, and another row's is used only where it prints
// none, and only for a mutual fund.
const movedRate = (x: { lastMovementRate?: number | null }) =>
  typeof x.lastMovementRate === "number" && x.lastMovementRate > 0 ? x.lastMovementRate : null;
function expected(unvalued: readonly UnvaluedStatementHolding[], accounts: Map<string, Account>, positions: readonly Position[]) {
  const out: { accountId: string; isin: string; quantity: number; nav: number; witness: string | null; ownRate: number | null }[] = [];
  const ownerOfId = (id: string) => accounts.get(id)?.ownerId ?? accounts.get(id)?.owner ?? null;
  for (const u of unvalued) {
    const isin = I(u);
    const etf = u.assetClass === "ETF";
    if (!isin || (u.assetClass !== "Mutual Fund" && !etf) || !(typeof u.quantity === "number" && u.quantity > 0)) continue;
    if (u.sameUnitsReportedBy) continue;
    const nav = navBy.get(isin);
    if (!nav || !nav.usableForValue || !(nav.nav > 0)) continue;
    const own = accounts.get(u.accountId);
    if (!own || !u.asOf) continue;
    // Stage 10hq: a NAV joined across a sub-division is on a unit `factor`
    // times smaller, and meets only units counted before its ex-date.
    const f = nav.unitSplit ? nav.unitSplit.factor : 1;
    if (nav.unitSplit && !(u.asOf < nav.unitSplit.exDate)) continue;
    const sameDay = (id: string) => accounts.get(id)?.provider === own.provider && accounts.get(id)?.asOf === u.asOf;
    const ownRate = movedRate(u);
    let price: number | null = ownRate;
    let witness: string | null = null;
    if (price === null && !etf) {
      const w = positions.find((p) => I(p) === isin && p.accountId !== u.accountId && sameDay(p.accountId)
        && typeof p.currentPrice === "number" && p.currentPrice > 0);
      const r = w ? undefined : unvalued.find((x) => x !== u && I(x) === isin && x.accountId !== u.accountId
        && sameDay(x.accountId) && movedRate(x) !== null);
      price = w ? (w.currentPrice as number) : r ? movedRate(r) : null;
      witness = w?.accountId ?? r?.accountId ?? null;
    }
    if (price === null) continue;
    const ratio = (nav.nav * f) / price;
    if (!(ratio > 0.5 && ratio < 2)) continue;
    if (positions.some((p) => p.accountId === u.accountId && I(p) === isin)) continue;
    if (positions.some((p) => I(p) === isin && Math.abs((p.quantity ?? NaN) - (u.quantity as number)) < 0.0005
      && ownerOfId(p.accountId) === ownerOfId(u.accountId))) continue;
    out.push({ accountId: u.accountId, isin, quantity: u.quantity * f, nav: nav.nav, witness, ownRate });
  }
  return out;
}

const got = unpricedStatementUnits();
const want = expected(BOOK_UNVALUED_HOLDINGS, acc, BOOK_POSITIONS);
const sig = (x: { accountId: string; isin?: string | null; quantity: number | null }) => `${x.accountId}|${I(x)}|${x.quantity}`;

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
// THE UNITS, NOT THE VALUE: the value moves with every published NAV, and
// "units × that NAV" is already asserted above. What the audit found is the two
// statements' own ABSL Balanced Advantage balances, which print no rate at all.
const absl = got.filter((p) => I(p) === "INF084M01AB8" && p.depositoryUnits?.kind === "no-rate");
ok("...and on this book that includes the ABSL Balanced Advantage units the audit found with no rate — 3,93,095.951 + 2,42,412.122 units",
  absl.length === 2 && Math.abs(absl.reduce((s, p) => s + (p.quantity ?? 0), 0) - 635508.073) < 0.0005,
  `${absl.reduce((s, p) => s + (p.quantity ?? 0), 0).toFixed(3)} units over ${absl.length} account(s)`);
// Stage 10cz: EVERY fund the three Motilal holding statements carry is now a
// quantity in the book, so the live book values far more than the audit's two.
const motilalHolding = new Set(BOOK_ACCOUNTS.filter((a) => /motilal oswal/i.test(a.provider) && /demat/i.test(a.provider)
  && !a.transactionsOnly).map((a) => a.accountId));
ok("...and the funds of the three Motilal holding statements, whose printed rate is a last movement's price",
  got.filter((p) => motilalHolding.has(p.accountId) && p.depositoryUnits?.kind === "last-movement").length > 2,
  `${got.length} row(s), ₹${(got.reduce((s, p) => s + p.marketValue, 0) / 1e7).toFixed(4)} Cr, ${got.filter((p) => p.depositoryUnits?.kind === "last-movement").length} on their own rate`);
ok("cost is absent unless exact owner, scheme and units reconcile to original lots",
  got.every((p) => p.recoveredCost ? p.costBasis === p.recoveredCost.costBasis && !p.costUnavailable
    : p.costBasis === null && p.costUnavailable === true && p.unrealizedPnL === null && p.returnPct === null));
ok("each is NAV-priced, carries the NAV's own date, and says which witness put its units on the NAV's basis",
  got.every((p) => {
    const w = want.find((x) => sig(x) === sig(p));
    if (!w || p.navPriced !== true || !p.navDate) return false;
    const d = p.depositoryUnits;
    return w.ownRate !== null
      ? d?.kind === "last-movement" && d.lastMovementRate === w.ownRate
      : d?.kind === "no-rate" && d.witnessAccountId === w.witness && !!w.witness && acc.has(w.witness);
  }));
ok("the movement's price is a witness and nothing more — never the price a row is valued at",
  got.every((p) => p.currentPrice === navBy.get(I(p) ?? "")?.nav));

// ── a sub-division that retired the statement's ISIN (Stage 10hq) ───────────
// DSP split its Gold and Silver ETFs 1:10 on 28 Aug 2026 and NSE moved both to
// new ISINs. The 31 Jul statements print the old ISIN and the pre-split units.
console.log("── a sub-division since the statement ──");
const dspLines = BOOK_UNVALUED_HOLDINGS.filter((u) => I(u) === "INF740KA1SW3" || I(u) === "INF740KA1RE3");
const dspRows = got.filter((p) => !!p.depositoryUnits?.unitSplit);
ok("LOAD-BEARING: the book records DSP Gold and Silver ETF units on two Motilal statements, and AMFI's NAV for both is joined across the split",
  dspLines.length === 3 && ["INF740KA1SW3", "INF740KA1RE3"].every((i) => navBy.get(i)?.usableForValue && navBy.get(i)?.unitSplit?.factor === 10),
  dspLines.map((u) => `${u.accountId.slice(-6)} ${u.securityKey} ${u.quantity}`).join("; "));
ok("every DSP line is valued, and nothing else carries a split",
  dspRows.length === dspLines.length && dspLines.every((u) => dspRows.some((p) => p.accountId === u.accountId && I(p) === I(u))));
ok("each is the statement's units × 10 at the published NAV, and keeps the statement's own count",
  dspRows.every((p) => {
    const u = dspLines.find((l) => l.accountId === p.accountId && I(l) === I(p))!;
    const s = p.depositoryUnits!.unitSplit!;
    return s.statementQuantity === u.quantity && p.quantity === (u.quantity as number) * 10
      && Math.abs(p.marketValue - (u.quantity as number) * 10 * (p.currentPrice as number)) < 0.01;
  }));
ok("...priced against the successor ISIN AMFI publishes it under, never the retired one",
  dspRows.every((p) => p.priceEvidence?.instrument === p.depositoryUnits!.unitSplit!.publishedIsin && p.priceEvidence?.instrument !== I(p)));
ok("...and its recovered cost still reconciles on the statement's units, with the cost per unit on the new one",
  dspRows.every((p) => !p.recoveredCost
    || (p.recoveredCost.quantity === p.depositoryUnits!.unitSplit!.statementQuantity
      && Math.abs((p.avgCost as number) * (p.quantity as number) - (p.costBasis as number)) < 0.01)));
ok("the sentence names the split, its date and both counts",
  dspRows.every((p) => {
    const s = describeDepositoryUnits(p.depositoryUnits!), d = p.depositoryUnits!.unitSplit!;
    return s.includes(d.exDate) && s.includes(d.publishedIsin)
      && s.includes(d.statementQuantity.toLocaleString("en-IN")) && s.includes((p.quantity as number).toLocaleString("en-IN"));
  }));
if (dspLines.length) {
  const line = dspLines[0];
  ok("REFUSED: a line counted on or after the ex-date under the retired ISIN is on neither unit",
    unpricedStatementUnits([{ ...line, asOf: "2026-08-28" }], [{ ...acc.get(line.accountId)!, asOf: "2026-08-28" }], []).length === 0);
  ok("REFUSED: an own rate far from the NAV once the split is applied is still a basis break",
    unpricedStatementUnits([{ ...line, lastMovementRate: (line.lastMovementRate as number) * 10 }], [acc.get(line.accountId)!], []).length === 0);
  ok("CONTROL: the same line as the book has it passes",
    unpricedStatementUnits([line], [acc.get(line.accountId)!], []).length === 1);
}
ok("each keeps the book's own key for its line, so one scheme stays one key on every page",
  got.every((p) => BOOK_UNVALUED_HOLDINGS.some((u) => u.accountId === p.accountId && u.securityKey === p.securityKey && I(u) === I(p))));
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
  if (p.depositoryUnits!.kind === "no-rate") {
    const w = acc.get(p.depositoryUnits!.witnessAccountId ?? "");
    ok(`the no-rate sentence names the statement's date and the witness (${p.accountId.slice(-6)})`,
      !!w && s.includes(p.depositoryUnits!.asOf ?? "∅") && s.includes(w.owner) && s.includes(w.accountNo) && /prints no rate/.test(s));
  } else {
    ok(`the last-movement sentence names the statement's date and says the price is a movement's, not a valuation (${p.accountId.slice(-6)} ${p.securityKey})`,
      s.includes(p.depositoryUnits!.asOf ?? "∅") && /last depository movement/.test(s) && /not a valuation of the balance/.test(s));
  }
  ok("...and never says the account sent no holding statement — it did",
    !/no holding statement/.test(s));
}
ok("a closing-balance row keeps the sentence it has always had",
  /transaction statement and no holding statement/.test(describeDepositoryUnits({ asOf: "2026-07-31", source: null })));
const closingRow = { depositoryUnits: { asOf: "2026-07-31", source: null } };
const noRate = got.filter((p) => p.depositoryUnits?.kind === "no-rate");
ok("the set phrase over no-rate rows alone never says no holding statement was sent",
  noRate.length > 0 && !/no holding statement/.test(depositoryUnitsGist(noRate)) && /prints no rate/.test(depositoryUnitsGist(noRate)));
ok("...over closing-balance rows alone it says the account sent none",
  /no holding statement/.test(depositoryUnitsGist([closingRow])) && !/prints no rate/.test(depositoryUnitsGist([closingRow])));
ok("...and over both it names both",
  noRate.length > 0 && /no holding statement/.test(depositoryUnitsGist([...noRate, closingRow])) && /prints no rate/.test(depositoryUnitsGist([...noRate, closingRow])));
ok("...and over this book's rows it names the last movement too, and never says no holding statement was sent",
  !/no holding statement/.test(depositoryUnitsGist(got)) && /last depository movement/.test(depositoryUnitsGist(got)),
  depositoryUnitsGist(got));

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
  // A witness BUILT here rather than found in the book: since Stage 10cz no
  // statement values this scheme at all, so the book has no position to borrow.
  const wit = {
    ...BOOK_POSITIONS[0], securityKey: "t-scheme", security: "T SCHEME", isin, accountId: "t-w",
    assetClass: "Mutual Fund", quantity: 5, marketValue: 5 * base.nav * 0.97, currentPrice: base.nav * 0.97,
  } as Position;
  const row: UnvaluedStatementHolding = {
    accountId: "t-u", ownerId: "t", securityKey: "t-scheme", security: "T SCHEME", isin,
    assetClass: "Mutual Fund", quantity: 1000, faceValue: null,
    lastMovementRate: null, lastMovementValue: null, lastMovementDate: null, lastMovementSide: null,
    asOf: "2026-07-31", sameUnitsReportedBy: null, reason: "test",
  };
  const accs = [mk("t-u"), mk("t-w")];
  const run = (u: Partial<UnvaluedStatementHolding>, as = accs, ps: Position[] = [wit]) =>
    unpricedStatementUnits([{ ...row, ...u }], as, ps);
  ok("CONTROL: the constructed row passes every gate", run({}).length === 1);
  ok("an ETF with no rate of its own is refused — another row's price says nothing about when its units last moved, or split",
    run({ assetClass: "ETF" }).length === 0);
  ok("a row's OWN last-movement rate on the NAV's basis is its witness, needing no other account",
    (() => { const r = run({ lastMovementRate: base.nav * 0.98 }, [mk("t-u")], []); return r.length === 1 && r[0].depositoryUnits?.kind === "last-movement"; })());
  ok("...and it outranks a witness elsewhere: a row whose own rate is ten times the NAV is refused however good the other account's mark is",
    run({ lastMovementRate: base.nav * 10 }).length === 0);
  ok("an ETF on its own rate is valued — a share-count break shows up as its own rate ten times the NAV",
    run({ assetClass: "ETF", lastMovementRate: base.nav * 1.01 }, [mk("t-u")], []).length === 1
      && run({ assetClass: "ETF", lastMovementRate: base.nav * 10 }, [mk("t-u")], []).length === 0);
  ok("another row's last-movement rate on the same depository and day witnesses a row that prints none",
    unpricedStatementUnits([row, { ...row, accountId: "t-w", lastMovementRate: base.nav * 0.97 }], accs, []).some((p) => p.accountId === "t-u"));
  ok("the same units of the same ISIN under the SAME owner in another account are one holding — refused",
    run({}, [mk("t-u"), mk("t-w"), { ...mk("t-o"), owner: "Test Owner" } as Account],
      [wit, { ...wit, accountId: "t-o", quantity: 1000 }]).length === 0);
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
