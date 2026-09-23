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
import { privateScope, unvaluedAccounts, capitalScope } from "@/lib/privateMarket";
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

console.log("\n── the capital columns are the private register, never deduped ──");
{
  const ct = callTotals(schemes);
  const all = byFund.privateTotal;
  eq("capital accounts", all.capitalAccounts, commitments.length);
  near("committed", all.committed, ct.committed);
  near("called", all.called, ct.called);
  eq("called covers", all.calledOf, ct.calledOf);
  near("paid in", all.paid, ct.paid);
  eq("paid covers", all.paidOf, ct.paidOf);
  near("still to call, summed as printed", all.uncalled, ct.uncalled);
  eq("still to call covers", all.uncalledOf, ct.uncalledOf);
  eq("dated calls", all.calls, ct.callCount);
  // THE `?? 0` TRAP, stated as the relation it breaks: every private capital
  // account prints an uncalled line on this book, so coverage is ALL of them —
  // and it must be the count of accounts that PRINT one, never the count of
  // rows. A `?? 0` would make those two the same number on any book; so the
  // count is held to the statements themselves.
  eq("still-to-call covers exactly the accounts that print it",
    all.uncalledOf, commitments.filter((c) => c.undrawn != null).length);
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
  eq("the unvalued section holds every private account nothing values", unFolios.length, un.length);
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
    folios.every((f) => (f.position ? f.position.marketSide === "private" : f.section === "unvalued")));
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
    alsoCount: 1, alsoReportedUnder: [], capital: c, reason: null,
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
