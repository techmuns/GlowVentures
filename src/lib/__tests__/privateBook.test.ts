// THE PRIVATE MARKET TABLE'S ROWS, CHECKED AGAINST THE GENERATED BOOK.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// *"make one consolidated structured table instead of breaking it into such
// smaller tables and parts."* The Private Market page drew one set of folios in
// five cards; `src/lib/privateBook.ts` builds that set once and every row of the
// one table is read off it. That puts FOUR claims in one module that used to be
// spread across five components, and each is the kind of thing that renders
// perfectly when it is wrong:
//
//   · the private total is the book's private side, to the rupee;
//   · the capital columns are the PRIVATE-MARKET funds' capital accounts —
//     `capitalScope`'s, the family's own placing (Stage 10bw) — never deduped,
//     each on exactly one folio, and not one public-market account among them;
//   · a fund row counts each holding once and its folios add to MORE by the
//     book's double count — the "Counted once" line — while a member row is
//     on the printed basis and the section's line takes it back;
//   · both groupings close on ONE private total.
//
// ── EVERY ANCHOR IS A SECOND PATH ───────────────────────────────────────────
//
// `BOOK_SUMMARY.privateValue` comes from `build-book.mjs`; `callTotals` from
// `capitalCalls.ts`; `privateScope`'s double count from `privateMarket.ts`. Each
// is an independent derivation of a figure this module also produces, so the
// two agreeing is a cross-check rather than a figure compared with its own
// copy. Nothing typed here would go stale on the next drop except where a
// COUNT is what a `?? 0` would move — and those are written as relations.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_COMMITMENTS, BOOK_SUMMARY } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { sum, currentHoldings, dedupedPositions } from "@/lib/analytics";
import { privateScope, unvaluedAccounts, capitalScope, INCOME_ONLY_VIEWS } from "@/lib/privateMarket";
import { isValuedByNoStatement, unvaluedAifFolios } from "@/lib/aifCategory";
import fs from "node:fs";
import path from "node:path";
import { schemeCalls, callTotals } from "@/lib/capitalCalls";
import { bookFolios, privateBook, figuresOf, BOOK_SECTIONS, type BookFolio } from "@/lib/privateBook";
import type { SchemeCall } from "@/lib/capitalCalls";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};
/** To the rupee, the tolerance every reconciliation in this repo uses. */
const near = (name: string, got: number | null | undefined, want: number | null | undefined, tol = 0.01) => {
  const pass = got != null && want != null && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want}`); }
  else console.log(`ok   ${name} = ${got}`);
};

// ── THE PAGE'S OWN INPUTS, BUILT THE WAY THE PAGE BUILDS THEM ───────────────
const accIdx = accountIndex(BOOK_ACCOUNTS);
const current = currentHoldings(BOOK_POSITIONS);
/** The capital accounts ON the page — the private-market funds' — and the ones left out. */
const cap = capitalScope(BOOK_COMMITMENTS, BOOK_ACCOUNTS);
const commitments = cap.onPage;
const schemes = schemeCalls(
  commitments,
  (c) => c.name,
  (c) => (c.ownerId ? ownerDisplayName(c.ownerId) : null),
);
const folios = bookFolios({
  positions: current, allPositions: BOOK_POSITIONS, accounts: BOOK_ACCOUNTS,
  commitments, accIdx, schemes,
});
const byFund = privateBook(folios, "fund");
const byOwner = privateBook(folios, "owner");

console.log("\n── the private total is the book's private side ──");
{
  /**
   * The page draws CURRENT holdings — closed rows and ₹1,000 specks out — and
   * `BOOK_SUMMARY.privateValue` is struck over the whole deduped book. So the
   * relation is exact once the private value `currentHoldings` dropped is put
   * back, and that figure is DERIVED here rather than assumed to be zero: a
   * drop that brings a private speck moves both sides together.
   */
  const privAll = dedupedPositions(BOOK_POSITIONS.filter((p) => p.marketSide === "private"));
  const privNow = dedupedPositions(current.filter((p) => p.marketSide === "private"));
  const dropped = sum(privAll.map((p) => p.marketValue)) - sum(privNow.map((p) => p.marketValue));
  near("private total === BOOK_SUMMARY.privateValue less what currentHoldings drops",
    byFund.privateTotal.value, BOOK_SUMMARY.privateValue - dropped);
  near("…and privateValue is the private section's own consolidated value",
    byFund.privateValue, byFund.sections.private.value);
  near("the private section band and the private total agree on value (nothing unvalued adds any)",
    byFund.sections.private.value, byFund.privateTotal.value);
  ok("the unvalued section carries NO value — absent, never a zero",
    byFund.sections.unvalued.value === null && byFund.sections.unvalued.folios > 0);
}

console.log("\n── the capital columns: every statement as printed, each account once with its holding ──");
{
  /**
   * PM-A2. A consolidated row counts a capital account ON THE BASIS ITS HOLDING
   * IS COUNTED. Transition Venture Fund I is one `dedupeGroup` — both family
   * trusts' statements report the same 7,500 units — so its fund row counts
   * the holding once, and it printed BOTH trusts' capital beside it: ₹3 Cr
   * committed and ₹1.5 Cr paid in over a ₹75 L cost, a row describing two
   * different sets. The printed basis still carries every statement.
   *
   * THE COUNTED SET IS DERIVED HERE BY A SECOND PATH — `dedupedPositions`,
   * which decides which member of a group every consolidated figure keeps —
   * never through `capitalCountedOnce`, the helper under test: of each group's
   * members that carry a capital account, the one kept stands for the group
   * (or, if the kept member carries none, one of the others does).
   */
  const priv = current.filter((p) => p.marketSide === "private");
  const kept = new Set(dedupedPositions(priv));
  const capitalAcc = new Set(commitments.map((c) => c.accountId));
  const leftOut = new Set<string>();
  for (const g of new Set(priv.map((p) => p.dedupeGroup).filter(Boolean))) {
    const members = priv.filter((p) => p.dedupeGroup === g && capitalAcc.has(p.accountId));
    const stand = members.find((p) => kept.has(p)) ?? members[0];
    for (const p of members) if (p !== stand) leftOut.add(p.accountId);
  }
  ok("this book has a capital account whose holding a second statement also reports — so the checks below have a subject",
    leftOut.size > 0, [...leftOut].join(", "));
  const countedSchemes = schemes.filter((s) => !leftOut.has(s.accountId));
  const printed = figuresOf(folios, false);
  const all = byFund.privateTotal;
  for (const [label, fig, ct] of [
    ["as printed", printed, callTotals(schemes)],
    ["counted once", all, callTotals(countedSchemes)],
  ] as const) {
    eq(`${label}: capital accounts`, fig.capitalAccounts, ct.count);
    near(`${label}: committed`, fig.committed, ct.committed);
    near(`${label}: called`, fig.called, ct.called);
    eq(`${label}: called covers`, fig.calledOf, ct.calledOf);
    near(`${label}: paid in`, fig.paid, ct.paid);
    eq(`${label}: paid covers`, fig.paidOf, ct.paidOf);
    near(`${label}: still to call`, fig.uncalled, ct.uncalled);
    eq(`${label}: still to call covers`, fig.uncalledOf, ct.uncalledOf);
    eq(`${label}: dated calls`, fig.calls, ct.callCount);
  }
  eq("the consolidated total names how many statements it leaves out", all.capitalAlso, leftOut.size);
  eq("…and the two add to every statement on the page", all.capitalAccounts + all.capitalAlso, commitments.length);
  // THE LOAD-BEARING GATE: a total that counted every statement would pass
  // every relation above written between its own rows — so the consolidated
  // capital must be BELOW the printed one, by exactly the left-out accounts'.
  const gone = callTotals(schemes.filter((s) => leftOut.has(s.accountId)));
  near("the consolidated committed is the printed one less the left-out accounts'",
    all.committed, (printed.committed ?? 0) - gone.committed);
  ok("…and the gap is real on this book", gone.committed > 1, `₹${gone.committed}`);
  // THE `?? 0` TRAP, stated as the relation it breaks: every private capital
  // account prints an uncalled line on this book, so coverage is ALL of them —
  // and it must be the count of accounts that PRINT one, never the count of
  // rows. A `?? 0` would make those two the same number on any book; so the
  // count is held to the statements themselves.
  eq("still-to-call covers exactly the accounts that print it",
    printed.uncalledOf, commitments.filter((c) => c.undrawn != null).length);
  // EACH CAPITAL ACCOUNT ON EXACTLY ONE FOLIO — a commitment on two rows is
  // counted twice in every capital total, one on none is missing from them.
  const withCap = folios.filter((f) => f.capital);
  eq("capital accounts attached to folios", withCap.length, commitments.length);
  eq("…each to one folio", new Set(withCap.map((f) => f.capital!.accountId)).size, withCap.length);
  ok("…and to a folio of its own account", withCap.every((f) => f.capital!.accountId === f.accountId));
  // The same register whichever way the rows are grouped.
  near("both groupings carry the same committed", byOwner.privateTotal.committed, all.committed);
  near("both groupings carry the same paid in", byOwner.privateTotal.paid, all.paid);
  // The sections partition the register.
  near("the two sections' committed add to the register's",
    sum(BOOK_SECTIONS.map((s) => byFund.sections[s].committed ?? 0)), all.committed);
  eq("…and their capital accounts",
    sum(BOOK_SECTIONS.map((s) => byFund.sections[s].capitalAccounts)), all.capitalAccounts);
}

console.log("\n── counted once, and where the two bases meet ──");
{
  const scope = privateScope(current, BOOK_ACCOUNTS);
  ok("this book carries a private holding reported twice — so the checks below have a subject",
    scope.doubleCounted > 1, `₹${scope.doubleCounted.toFixed(2)}`);
  // FUND ROWS: each overlap line is the gap between its folios and its row.
  const fundGroups = byFund.sections.private.groups;
  for (const g of fundGroups) {
    const printed = sum(g.folios.filter((f) => f.position).map((f) => f.value ?? 0));
    const want = printed - (g.value ?? 0);
    if (want > 1) {
      ok(`${g.label}: the folios add to more than the row, by the "Counted once" line`,
        !!g.overlap && Math.abs(g.overlap.value - want) <= 0.01 && Math.abs(g.overlap.printed - printed) <= 0.01,
        `${printed.toFixed(2)} − ${(g.value ?? 0).toFixed(2)}`);
    } else {
      ok(`${g.label}: no "Counted once" line where nothing is counted twice`, g.overlap === null);
    }
  }
  // PM-A2 — EVERY COLUMN, CAPITAL INCLUDED: the folios add to the row through
  // its "Counted once" line, so a reader who adds the lines under a row gets
  // the row. Struck per column over every fund row, so a row whose capital
  // stayed on the printed basis while its holding was counted once fails here.
  for (const g of fundGroups) {
    for (const k of ["committed", "called", "paid", "uncalled"] as const) {
      const lines = sum(g.folios.map((f) => f.capital?.[k] ?? 0));
      const adjust = g.overlap?.[k] ?? 0;
      near(`${g.label}: ${k} — the folios less the Counted once line are the row`, lines - adjust, g[k] ?? 0);
    }
    // …and the row's capital is its COUNTED holding's: one basis per row.
    const heldAccounts = new Set(g.folios.filter((f) => f.position && f.counted).map((f) => f.accountId));
    const capAccounts = g.folios.filter((f) => f.capital && f.capitalCounted).map((f) => f.accountId);
    ok(`${g.label}: every capital account the row counts is a counted holding's own account`,
      capAccounts.every((a) => heldAccounts.has(a) || !g.folios.some((f) => f.accountId === a && f.position)),
      capAccounts.join(", "));
  }
  const tv = fundGroups.find((g) => g.overlap && (g.overlap.committed ?? 0) > 0);
  ok("a fund row carries a capital adjustment on its Counted once line — the pair the family is asked about",
    !!tv, tv?.label ?? "none");
  if (tv) {
    const heldOnce = tv.folios.filter((f) => f.position && f.counted);
    ok(`${tv.label}: the row's units, cost and capital are one statement's`,
      heldOnce.length === 1
      && tv.units === heldOnce[0].units && tv.cost === heldOnce[0].cost
      && tv.committed === heldOnce[0].capital?.committed && tv.paid === heldOnce[0].capital?.paid,
      `${tv.units} units · cost ${tv.cost} · committed ${tv.committed} · paid ${tv.paid}`);
  }
  const fundGap = sum(fundGroups.map((g) => g.overlap?.value ?? 0));
  near("the fund rows' overlap lines add to the book's double count", fundGap, scope.doubleCounted);
  // MEMBER ROWS: on the printed basis, and the section's own line takes them
  // back to the consolidated total. A per-owner figure never dedupes.
  const ownerPriv = byOwner.sections.private;
  near("the member rows add to the PRINTED total",
    sum(ownerPriv.groups.map((g) => g.value ?? 0)), sum(scope.rows.map((p) => p.marketValue)));
  near("…the section's 'Counted once' line is the book's double count", ownerPriv.overlap?.value, scope.doubleCounted);
  near("…and the section less that line is the consolidated private total",
    (ownerPriv.value ?? 0) - (ownerPriv.overlap?.value ?? 0), byFund.privateTotal.value);
  for (const k of ["committed", "called", "paid", "uncalled"] as const) {
    near(`…in the capital columns too: the member section's ${k} less its line is the fund section's`,
      (ownerPriv[k] ?? 0) - (ownerPriv.overlap?.[k] ?? 0), byFund.sections.private[k] ?? 0);
  }
  // BOTH GROUPINGS CLOSE ON ONE TOTAL, field by field.
  for (const k of ["value", "cost", "pnl", "committed", "called", "paid", "uncalled"] as const) {
    near(`both groupings close on the same private ${k}`, byOwner.privateTotal[k], byFund.privateTotal[k]);
  }
  // THE LOAD-BEARING GATE: a table that summed every statement would pass
  // every relation above that is written between its own rows — so the
  // consolidated total must be BELOW the printed one, by exactly the gap.
  near("the consolidated private total is the printed one less the double count",
    byFund.privateTotal.value, sum(scope.rows.map((p) => p.marketValue)) - scope.doubleCounted);
}

console.log("\n── the two sections ──");
{
  const un = unvaluedAccounts(BOOK_ACCOUNTS, BOOK_POSITIONS, commitments).filter((u) => u.side === "private");
  const unFolios = byFund.sections.unvalued.groups.flatMap((g) => g.folios);
  /**
   * A-15 — "VALUED BY NO STATEMENT" IS ONE SET, and the AIF drill-down and this
   * page list it by one definition (`isValuedByNoStatement`). The two pages said
   * 10 and 9 while the truth was 7: an income-only folio's units ARE valued, under
   * another account, and a redeemed one holds nothing to value. The set is
   * DERIVED here by a second path — an account holding no position at all whose
   * own capital account records capital drawn — never through that predicate.
   */
  const drawnNothingHeld = BOOK_ACCOUNTS.filter((a) =>
    !BOOK_POSITIONS.some((p) => p.accountId === a.accountId)
    && BOOK_COMMITMENTS.some((c) => c.accountId === a.accountId && (c.drawn ?? 0) > 0)
    && commitments.some((c) => c.accountId === a.accountId));
  eq("the unvalued section holds exactly the private accounts nothing values (A-15)",
    unFolios.map((f) => f.accountId).sort(), drawnNothingHeld.map((a) => a.accountId).sort());
  const withPositions = new Set(BOOK_POSITIONS.map((p) => p.accountId));
  const drill = unvaluedAifFolios(BOOK_ACCOUNTS, withPositions, new Map());
  eq("…the same set the AIF drill-down names", drill.map((f) => f.accountId).sort(), unFolios.map((f) => f.accountId).sort());
  ok("…every one of them marked as a fund that publishes no NAV — the one definition both pages read",
    unFolios.every((f) => f.status === "no-nav") && drawnNothingHeld.every((a) => isValuedByNoStatement(a)));
  // THE INCOME-ONLY FOLIOS ARE LINES OF THE ROW WHOSE UNITS THEY REPORT.
  const incomeOnly = un.filter((u) => u.kind === "income-only").map((u) => u.account.accountId).sort();
  const views = folios.filter((f) => f.viewOf);
  ok("this book carries income-only folios — so the fold below has a subject", incomeOnly.length > 0, incomeOnly.join(", "));
  eq("every income-only folio is folded under the holding it reports", views.map((f) => f.accountId).sort(), incomeOnly);
  ok("…each naming the account whose line values its units, a line of the same fund in the same row",
    views.every((f) => folios.some((x) => x.accountId === f.viewOf && x.position && x.fundKey === f.fundKey && x.section === f.section)));
  ok("…and carrying no holding figure, so nothing is counted twice",
    views.every((f) => f.position === null && f.value === null && f.units === null && f.cost === null && !f.counted));
  /**
   * THE JOIN IS A COMMITTED TABLE, SO IT IS HELD TO THE PAPER. `INCOME_ONLY_VIEWS`
   * names each income-only folio's fund; what licenses it is the statement of
   * earnings' own unit count, which must be the valued holding's to the unit —
   * read here off the ARCHIVE, never off the table.
   */
  const docOf = (key: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/audit", key, "document.json"), "utf8"));
  const auditDirs = fs.readdirSync(path.join(process.cwd(), "public/audit"));
  for (const v of INCOME_ONLY_VIEWS) {
    const acc = BOOK_ACCOUNTS.find((a) => a.accountId === v.accountId);
    const earn = auditDirs.filter((d) => acc && d.includes(`-${acc.accountNo}-`) && d.endsWith("statement-of-earnings"));
    const units = earn.map((d) => docOf(d).aifEarnings?.units).filter((u): u is number => typeof u === "number");
    ok(`${v.accountId}: the statement of earnings prints the units the join table commits`,
      units.length > 0 && units.every((u) => Math.abs(u - v.units) < 0.0005), units.join(", "));
    const valued = BOOK_POSITIONS.filter((p) => p.securityKey === v.securityKey && p.accountId !== v.accountId
      && accIdx.get(p.accountId)?.ownerId === acc?.ownerId);
    ok(`${v.accountId}: …and the same member's valued holding of that fund carries the same units`,
      valued.some((p) => Math.abs(p.quantity - v.units) < 0.0005), valued.map((p) => `${p.accountId} ${p.quantity}`).join("; "));
  }
  ok("…each with no holding and no value",
    unFolios.every((f) => f.position === null && f.value === null && f.units === null && f.cost === null));
  ok("…and each keeps the book's own reason for it", unFolios.every((f) => f.status !== "valued"));
  const redeemed = unFolios.filter((f) => f.status === "redeemed");
  eq("redeemed-to-nil folios are named as such, not as missing", redeemed.length,
    un.filter((u) => u.kind === "redeemed").length);
  // THE PUBLIC-MARKET FUNDS' CAPITAL ACCOUNTS ARE ON NO ROW. This table carried
  // them in a closed section of their own until the family placed each fund
  // (Stage 10bw): *"private market fund needs to be here in private market
  // only"*. So not one of `capitalScope`'s left-out accounts may reach a folio —
  // and the set must be non-empty on this book, or the check asserts nothing.
  ok("this book has capital accounts in public-market funds — so the check below has a subject",
    cap.elsewhere.length > 0, `${cap.elsewhere.length}`);
  const out = new Set(cap.elsewhere.map((x) => x.commitment.accountId));
  ok("…and not one of them is on any folio of this table",
    folios.every((f) => !out.has(f.accountId)));
  ok("…each is on the listed side or on neither, never the private one",
    cap.elsewhere.every((x) => x.side !== "private"));
  eq("…and the page's accounts and the left-out ones are the whole register",
    commitments.length + cap.elsewhere.length, BOOK_COMMITMENTS.length);
  ok("every folio on the table is a private fund's — its holding on the private side, or an account whose fund is",
    folios.every((f) => (f.position ? f.position.marketSide === "private"
      : f.viewOf ? f.section === "private" : f.section === "unvalued")));
  // Every current PRIVATE holding lands in exactly one folio with its holding;
  // nothing outside the private side carries one.
  eq("every private statement line is exactly one folio carrying its holding",
    folios.filter((f) => f.position).length, current.filter((p) => p.marketSide === "private").length);
}

console.log("\n── units never add across funds ──");
{
  ok("no band or total carries a unit count",
    BOOK_SECTIONS.every((s) => byFund.sections[s].units === null)
    && byFund.privateTotal.units === null);
  const multi = byFund.sections.private.groups.filter((g) => g.folios.filter((f) => f.position).length > 1);
  ok("a fund row held in several folios adds their units (counted once)",
    multi.length > 0 && multi.every((g) => g.units != null && g.units > 0));
  ok("a member row across several funds carries none",
    byOwner.sections.private.groups
      .filter((g) => new Set(g.folios.map((f) => f.fundKey)).size > 1)
      .every((g) => g.units === null));
}

console.log("\n── figuresOf on a constructed pair: absent is skipped, never zero ──");
{
  const cap = (over: Partial<SchemeCall>): SchemeCall => ({
    accountId: "a", fund: "F", owner: null, asOf: "2026-07-31", staleDays: 0,
    committed: 100, called: 60, paid: 60, pending: null, uncalled: 40,
    impliedUncalled: 40, uncalledTies: true, calls: [], firstCall: null, lastCall: null, ...over,
  });
  const folio = (key: string, c: SchemeCall): BookFolio => ({
    key, section: "private", status: "valued", accountId: c.accountId, owner: "X", provider: "P",
    accountNo: "1", asOf: "2026-07-31", fundKey: key, fundName: key, securityKey: key, category: null,
    position: null, units: null, cost: null, value: null, pnl: null, counted: false,
    alsoCount: 1, alsoReportedUnder: [], capital: c, capitalCounted: true, capitalCountedAs: null,
    viewOf: null, reason: null,
  });
  const fig = figuresOf([
    folio("one", cap({ accountId: "a" })),
    folio("two", cap({ accountId: "b", uncalled: null, called: null, impliedUncalled: null, uncalledTies: null })),
  ], true);
  eq("uncalled sums the account that prints it, and skips the one that does not", [fig.uncalled, fig.uncalledOf], [40, 1]);
  eq("called likewise", [fig.called, fig.calledOf], [60, 1]);
  eq("committed is on every capital account", [fig.committed, fig.capitalAccounts], [200, 2]);
  eq("nothing held: value is absent, not ₹0", fig.value, null);
}

if (fails) {
  console.log(`\n${fails} failure(s)`);
  process.exit(1);
}
console.log("\nall private-book checks pass");
