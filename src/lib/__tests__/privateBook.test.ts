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
//   · the capital columns are the whole commitment register, never deduped,
//     each capital account on exactly one folio;
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
import { privateScope, unvaluedAccounts } from "@/lib/privateMarket";
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
const schemes = schemeCalls(
  BOOK_COMMITMENTS,
  (c) => c.name,
  (c) => (c.ownerId ? ownerDisplayName(c.ownerId) : null),
);
const folios = bookFolios({
  positions: current, allPositions: BOOK_POSITIONS, accounts: BOOK_ACCOUNTS,
  commitments: BOOK_COMMITMENTS, accIdx, schemes,
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

console.log("\n── the capital columns are the whole register, never deduped ──");
{
  const ct = callTotals(schemes);
  const all = byFund.allCapital;
  eq("capital accounts", all.capitalAccounts, BOOK_COMMITMENTS.length);
  near("committed", all.committed, ct.committed);
  near("called", all.called, ct.called);
  eq("called covers", all.calledOf, ct.calledOf);
  near("paid in", all.paid, ct.paid);
  eq("paid covers", all.paidOf, ct.paidOf);
  near("still to call, summed as printed", all.uncalled, ct.uncalled);
  eq("still to call covers", all.uncalledOf, ct.uncalledOf);
  eq("dated calls", all.calls, ct.callCount);
  // THE `?? 0` TRAP, stated as the relation it breaks: a figure on every
  // account would make the coverage the whole register.
  ok("still-to-call covers fewer accounts than the register holds",
    all.uncalledOf < all.capitalAccounts, `${all.uncalledOf} of ${all.capitalAccounts}`);
  // EACH CAPITAL ACCOUNT ON EXACTLY ONE FOLIO — a commitment on two rows is
  // counted twice in every capital total, one on none is missing from them.
  const withCap = folios.filter((f) => f.capital);
  eq("capital accounts attached to folios", withCap.length, BOOK_COMMITMENTS.length);
  eq("…each to one folio", new Set(withCap.map((f) => f.capital!.accountId)).size, withCap.length);
  ok("…and to a folio of its own account", withCap.every((f) => f.capital!.accountId === f.accountId));
  // The same register whichever way the rows are grouped.
  near("both groupings carry the same committed", byOwner.allCapital.committed, all.committed);
  near("both groupings carry the same paid in", byOwner.allCapital.paid, all.paid);
  // The sections partition the register.
  near("the three sections' committed add to the register's",
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

console.log("\n── the three sections ──");
{
  const un = unvaluedAccounts(BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_COMMITMENTS);
  const unFolios = byFund.sections.unvalued.groups.flatMap((g) => g.folios);
  eq("the unvalued section holds every private account nothing values", unFolios.length, un.length);
  ok("…each with no holding and no value",
    unFolios.every((f) => f.position === null && f.value === null && f.units === null && f.cost === null));
  ok("…and each keeps the book's own reason for it", unFolios.every((f) => f.status !== "valued"));
  const redeemed = unFolios.filter((f) => f.status === "redeemed");
  eq("redeemed-to-nil folios are named as such, not as missing", redeemed.length,
    un.filter((u) => u.kind === "redeemed").length);
  // THE OTHER AIFs: every folio is an AIF on the listed side or on neither,
  // and none of them is inside the private total.
  const elsewhere = byFund.sections.elsewhere.groups.flatMap((g) => g.folios);
  ok("the Other AIFs section holds only AIFs on the listed side or on none",
    elsewhere.length > 0 && elsewhere.every((f) => f.position?.assetClass === "AIF"
      && (f.position.marketSide === "listed" || f.position.marketSide == null)));
  ok("…and no private folio is filed there", elsewhere.every((f) => f.position?.marketSide !== "private"));
  near("…and none of its value is in the private total",
    byFund.privateTotal.value, byFund.sections.private.value);
  // Every current holding the page is about lands in exactly one section.
  const inScope = current.filter((p) => p.marketSide === "private"
    || (p.assetClass === "AIF" && p.marketSide === "listed") || p.marketSide == null);
  eq("every in-scope statement line is exactly one folio",
    folios.filter((f) => f.position).length, inScope.length);
}

console.log("\n── units never add across funds ──");
{
  ok("no band or total carries a unit count",
    BOOK_SECTIONS.every((s) => byFund.sections[s].units === null)
    && byFund.privateTotal.units === null && byFund.allCapital.units === null);
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
