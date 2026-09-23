// THE FAMILY'S OWN DATED INVESTMENTS, CHECKED AGAINST THE GENERATED BOOK.
//   npm run test:family
//
// ── WHAT COULD GO WRONG HERE, AND WHY NO PAGE WOULD SHOW IT ─────────────────
//
// The Sanshi statement prints a contribution as THREE rows on one date, and the
// third carries a RUNNING BALANCE in the same column the others print a movement
// in:
//
//   17-06-2025  Drawdown                                        1,00,00,000.00
//   17-06-2025  Stamp Duty @ 0.005%                                   (499.98)
//   17-06-2025  Units Allotment  109.4462  91,364.524  1,91,359.524  1,99,98,999.97
//
// All three are typed `contribution` in the archive. Summing them reports ₹44 Cr
// of investment into a folio that received ₹22 Cr — and every row LOOKS right:
// same kind, same date, a plausible rupee figure, no error anywhere. That is the
// defect this suite exists for, and the only thing that catches it is a figure
// produced on a DIFFERENT path from the sum being checked.
//
// ── THREE INDEPENDENT ANCHORS, NONE OF THEM TYPED IN ────────────────────────
//
//   Σ tranche units    = the position's own `quantity`     (the build-book gate)
//   Σ tranche invested = the position's own `costBasis`    (a separate pipeline)
//   Σ tranche value    = the position's own `marketValue`
//
// `costBasis` reaches `glowData.ts` from the fund's HOLDINGS table and the
// tranches from its TRANSACTIONS table — two different readers over two
// different regions of the same statement — so their agreeing to the paisa is a
// real cross-check rather than a figure compared with its own copy. None of the
// three can go stale: when the next drop moves the book, both sides move.
//
// ── AND THE ALLOTMENT NAV IS CHECKED AGAINST THE PRINTED PAGE ───────────────
//
// `navAtEntry` is DERIVED (invested ÷ units) because the extractor does not
// carry the statement's Allotment NAV column. So the check for it cannot live in
// the data, and it lives here instead: the derived figures must reproduce the
// NAVs the statement actually prints, read out of the committed archive's own
// `pages.json`. That is the archive standing as the witness for a figure no
// other artefact in this repo can confirm.
import fs from "node:fs";
import path from "node:path";
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_CAPITAL_MOVES, BOOK_POSITION_TRANCHES } from "@/data/glowData";
import {
  trancheTable, trancheKey, trancheCoverage,
  contributionsAreComplete, capitalRollup, capitalTotals,
} from "@/lib/tranches";
import type { Position } from "@/lib/types";

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
const near = (name: string, got: number | null, want: number, tol = 0.01) => {
  const pass = got != null && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want} (tol ${tol})`); }
  else console.log(`ok   ${name} = ${got}`);
};

const ASOF = "2026-08-29";
// The family's own rule, and `holdingReturn`'s "cagr" mode IS that rule: a year
// or more annualises, anything shorter stands as the absolute figure and is
// labelled so. Never "absolute", which would refuse to annualise a tranche held
// eighteen months — the one place in this book where a genuine CAGR exists.
const TRANCHE_MODE = "cagr" as const;
const posOf = (accountId: string, securityKey: string) =>
  BOOK_POSITIONS.find((p) => p.accountId === accountId && p.securityKey === securityKey) as Position | undefined;

console.log("\n── the capital moves are the family's own, and are not the manager's ──");
ok("the book carries dated capital moves", BOOK_CAPITAL_MOVES.length > 0, `${BOOK_CAPITAL_MOVES.length} rows`);
const ins = BOOK_CAPITAL_MOVES.filter((m) => m.direction === "in");
const outs = BOOK_CAPITAL_MOVES.filter((m) => m.direction === "out");
ok("both directions are represented", ins.length > 0 && outs.length > 0, `${ins.length} in · ${outs.length} out`);

// THE RUNNING-BALANCE TRAP, ASSERTED AS A CEILING. Every rupee the family put
// into an account must be less than or equal to what that account is worth plus
// what it has taken out — a book where the balance rows were summed as movements
// breaks this by construction on the Sanshi folios (₹44 Cr in against ₹29 Cr of
// value). Stated as an inequality so it cannot go stale when the market moves.
const valueOf = new Map<string, number>();
for (const p of BOOK_POSITIONS) valueOf.set(p.accountId, (valueOf.get(p.accountId) ?? 0) + p.marketValue);
for (const acct of new Set(ins.map((m) => m.accountId))) {
  const paid = ins.filter((m) => m.accountId === acct).reduce((a, m) => a + (m.amount ?? 0), 0);
  const held = valueOf.get(acct) ?? 0;
  const back = outs.filter((m) => m.accountId === acct).reduce((a, m) => a + (m.amount ?? 0), 0);
  // 3x is deliberately loose: this is a trap detector, not a performance
  // assertion. The bug it exists for DOUBLES the figure on a folio whose value
  // is close to its cost, and a real book cannot lose two thirds of itself
  // across every account at once.
  ok(`capital in is not a summed balance — ${acct}`, paid <= (held + back) * 3,
    `paid ${Math.round(paid).toLocaleString("en-IN")} vs held+returned ${Math.round(held + back).toLocaleString("en-IN")}`);
}

console.log("\n── the per-contribution breakdown ties to the position it expands ──");
const keys = Object.keys(BOOK_POSITION_TRANCHES).sort();
ok("breakdowns are published", keys.length > 0, `${keys.length} position(s)`);
let multiTranche = 0;
for (const k of keys) {
  const tr = BOOK_POSITION_TRANCHES[k];
  const p = posOf(tr.accountId, tr.securityKey);
  if (!p) { ok(`position exists for ${k}`, false); continue; }
  if (tr.moves.length > 1) multiTranche++;
  const t = trancheTable([p], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF);
  if (!t) { ok(`a table is built for ${k}`, false); continue; }

  // Half of the last decimal the position's unit count is PRINTED to. Neo
  // Infra's statement prints its balance as 4,85,837 — whole units — while its
  // own dated record carries 4,85,837.2 after the capital redemption, so the
  // tie is the printed precision reproduced, never a tolerance widened to fit.
  const dp = String(p.quantity).split(".")[1]?.length ?? 0;
  const tie = Math.max(0.0005, 0.5 * 10 ** -dp);
  near(`units tie to quantity — ${tr.securityKey.slice(0, 28)} ${tr.accountId.slice(-8)}`, t.units, p.quantity, tie);
  // …and the value follows the units: the residual units at the position's own
  // per-unit mark, or a rupee, whichever is larger.
  near(`value ties to market value — ${tr.accountId.slice(-8)}`, t.value, p.marketValue,
    Math.max(1, tie * (p.marketValue / p.quantity)));
  if (p.costBasis != null) near(`invested ties to cost basis — ${tr.accountId.slice(-8)}`, t.invested, p.costBasis, 0.01);
}
ok("at least one position was bought over several dates", multiTranche > 0, `${multiTranche} of ${keys.length}`);

console.log("\n── the earlier rupee is worth more, which is the whole question ──");
// Ankita's Sanshi folio: four contributions, NAV 100.00 → 123.84. If the split
// were size-weighted rather than unit-weighted every tranche would show the same
// return, which is exactly the figure the family asked to have broken apart.
const ANKITA = trancheKey("sanshi-fund-9069671554", "sanshi-fund-i-open-ended-aif-cat-iii-class-e");
const at = BOOK_POSITION_TRANCHES[ANKITA];
if (!at) ok("the four-contribution folio is in the book", false);
else {
  const p = posOf(at.accountId, at.securityKey)!;
  const t = trancheTable([p], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF)!;
  eq("it has four contributions", t.rows.length, 4);
  const first = t.rows[0], last = t.rows.at(-1)!;
  ok("the entry NAV rises across them", first.navAtEntry < last.navAtEntry,
    `${first.navAtEntry.toFixed(4)} → ${last.navAtEntry.toFixed(4)}`);
  ok("so the earliest tranche's return beats the latest", first.returnPct > last.returnPct,
    `${first.returnPct.toFixed(2)}% vs ${last.returnPct.toFixed(2)}%`);
  // LOAD-BEARING: the spread must be wide enough that a size-weighted split
  // could not produce it by accident. A suite that passes on a book where every
  // tranche happens to return the same thing is checking nothing.
  ok("the spread is material, not rounding", first.returnPct - last.returnPct > 10,
    `${(first.returnPct - last.returnPct).toFixed(2)} points apart`);
  // And the combined figure is BETWEEN them — a weighted mean of its own rows,
  // never outside the range of what it averages.
  ok("the combined return sits between the extremes",
    t.returnPct <= first.returnPct && t.returnPct >= last.returnPct,
    `combined ${t.returnPct.toFixed(2)}%`);
}

console.log("\n── the return goes through the book's one guard ──");
for (const k of keys) {
  const tr = BOOK_POSITION_TRANCHES[k];
  const p = posOf(tr.accountId, tr.securityKey);
  if (!p) continue;
  const t = trancheTable([p], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF)!;
  for (const r of t.rows) {
    const held = (new Date(ASOF).getTime() - new Date(r.date).getTime()) / 86400000;
    // Under a year the absolute figure stands; a year or more annualises. Never
    // the other way round — that is Stage 10g(ii)'s +99.0%.
    const want = held >= 365 ? "cagr" : "absolute";
    ok(`${r.date} ${r.ret.kind === want ? "" : "MIS"}labelled ${r.ret.kind}`, r.ret.kind === want,
      `${Math.round(held)} days held`);
  }
}
const allRows = keys.flatMap((k) => {
  const tr = BOOK_POSITION_TRANCHES[k];
  const p = posOf(tr.accountId, tr.securityKey);
  return p ? (trancheTable([p], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF)?.rows ?? []) : [];
});
// ANNUALISING A WINDOW LONGER THAN A YEAR MUST SHRINK THE FIGURE, and that is
// the invariant rather than any ceiling on the rate itself. A first draft here
// banned triple digits outright and failed a TRUE figure: Transition Venture is
// +128.6% ABSOLUTE over 316 days, which is what that holding really did. Banning
// it would have been this book's own fabrication rule running backwards —
// refusing a measured figure for being inconveniently large.
const annualised = allRows.flatMap((r) => (r.ret.kind === "cagr" ? [{ ...r, pct: r.ret.pct }] : []));
ok("some tranche annualises at all", annualised.length > 0, `${annualised.length} of ${allRows.length}`);
ok("annualising a >1yr window never inflates it",
  annualised.every((r) => Math.abs(r.pct) <= Math.abs(r.returnPct) + 1e-9),
  annualised.map((r) => `${r.returnPct.toFixed(1)}→${r.pct.toFixed(1)}`).join(" "));

// And no row may be labelled annualised off a window shorter than the year it
// claims — Stage 10g(ii)'s guard, asserted on the rendered kind.
ok("nothing under a year is labelled annualised",
  allRows.every((r) => r.ret.kind !== "cagr" || (r.ret.heldDays ?? 0) >= 365));

console.log("\n── the derived entry NAV reproduces the one the statement PRINTS ──");
// The archive is the witness. `navAtEntry` is invested ÷ units and the extractor
// carries no NAV column, so nothing else in this repo can confirm it.
const AUDIT = path.join(process.cwd(), "public", "audit");
const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8")) as
  { docKey: string; accountNo: string }[];
let navChecked = 0;
let navCarried = 0;
for (const k of keys) {
  const tr = BOOK_POSITION_TRANCHES[k];
  const p = posOf(tr.accountId, tr.securityKey);
  if (!p) continue;
  const acctNo = tr.accountId.split("-").at(-1)!;
  const entry = manifest.find((m) => m.accountNo === acctNo);
  if (!entry) continue;
  const pagesPath = path.join(AUDIT, entry.docKey, "pages.json");
  if (!fs.existsSync(pagesPath)) continue;
  const raw = fs.readFileSync(pagesPath, "utf8");
  const t = trancheTable([p], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF)!;
  for (const r of t.rows) {
    // A TRANCHE CARRIED THROUGH A FUND'S CLASS SWITCH is priced here in the
    // class held TODAY — invested ÷ the carried units — which no statement
    // prints. The NAV it was BOUGHT at is the printed one, and
    // `carriedCost.test.ts` finds every such figure on the account's own pages
    // and FAILS where it cannot. Counted apart here rather than falling into the
    // silent skip below, whose comment ("this issuer prints no NAV column")
    // would be false of it: Buoyant prints every NAV.
    if (r.move.carriedFrom) { navCarried++; continue; }
    // The statement prints its NAV to four decimals, so that is the precision
    // the derived figure is held to — the document's own, never a widened one.
    const printed = r.navAtEntry.toFixed(4);
    if (!raw.includes(printed)) continue;   // this issuer prints no NAV column
    navChecked++;
    ok(`${acctNo} ${r.date} entry NAV ${printed} is on the page`, true);
  }
}
// A check that finds nothing to check must say so rather than pass — golden.mjs's
// rule. Every Sanshi tranche prints a NAV, so this cannot legitimately be zero.
ok("the archive actually witnessed some entry NAVs", navChecked >= 10, `${navChecked} matched`);
// ...and the carried ones were set aside by NAME, not lost: exactly the book's
// own count of tranches carrying a `carriedFrom`, over the same positions.
const carriedInBook = keys.reduce((a, k) => a + BOOK_POSITION_TRANCHES[k].moves.filter((m) => m.carriedFrom).length, 0);
ok("every tranche carried through a class switch was set aside for carriedCost.test.ts, and only those",
  navCarried === carriedInBook, `${navCarried} set aside, ${carriedInBook} in the book`);

console.log("\n── the completeness gate, on inputs this book does not contain ──");
// EVERY FUNDED ACCOUNT IN THIS BOOK PASSES THE GATE — seven by units, three
// because the statement's own inception date is the first contribution — so a
// rendered check cannot tell a working gate from a deleted one here: both draw
// ten returns. That is recorded in CLAUDE.md rather than papered over, and the
// gate itself is exercised HERE, on constructed inputs, which is the only place
// it can be.
const gateAcct = "acct-x";
const gateMoves = [{
  accountId: gateAcct, date: "2025-06-01", direction: "in" as const, label: "Capital inflow",
  amount: 1e7, invested: 1e7, units: null, security: null, securityKey: null,
}];
const gatePos = [{ ...BOOK_POSITIONS[0], accountId: gateAcct, securityKey: "sk-x" }];
eq("no dated contribution at all → refused",
  contributionsAreComplete(gateAcct, [], gatePos, {}, "2025-01-01") === null, false);
eq("contributions starting AFTER inception → refused (the record may not reach the start)",
  contributionsAreComplete(gateAcct, gateMoves, gatePos, {}, "2024-01-01") === null, false);
eq("inception on the first contribution → accepted",
  contributionsAreComplete(gateAcct, gateMoves, gatePos, {}, "2025-06-01"), null);
eq("inception after the first contribution → accepted",
  contributionsAreComplete(gateAcct, gateMoves, gatePos, {}, "2025-09-01"), null);
eq("no inception date at all, and no unit tie → refused",
  contributionsAreComplete(gateAcct, gateMoves, gatePos, {}, null) === null, false);
// ...and the units route accepts it with no inception date whatsoever.
const gateIdx = { [trancheKey(gateAcct, "sk-x")]: { accountId: gateAcct, securityKey: "sk-x", moves: gateMoves, units: 1 } };
eq("every position unit-tied → accepted with no inception date",
  contributionsAreComplete(gateAcct, gateMoves, gatePos, gateIdx, null), null);

// AND THE ROLLUP HONOURS IT. A group that fails the gate keeps its figures and
// loses its return — never the other way round, which would put a return on a
// cost the statements do not claim is complete.
const gateGroups = capitalRollup(gateMoves,
  [{ accountId: gateAcct, provider: "P", accountNo: "1", strategy: null, owner: "O", inceptionDate: "2024-01-01" }],
  gatePos, {});
eq("a refused group publishes no return", gateGroups[0].returnPct, null);
eq("...and no gain either", gateGroups[0].gain, null);
ok("...but keeps what it DID pay in", gateGroups[0].paidIn === 1e7);
ok("...and names why the return is absent", !!gateGroups[0].incompleteReason);
const okGroups = capitalRollup(gateMoves,
  [{ accountId: gateAcct, provider: "P", accountNo: "1", strategy: null, owner: "O", inceptionDate: "2025-06-01" }],
  gatePos, {});
ok("an accepted group does publish one", okGroups[0].returnPct !== null);
eq("...with no reason attached", okGroups[0].incompleteReason, null);
/**
 * `capitalTotals` NO LONGER COUNTS THE MEASURABLE ROWS, and this asserts the
 * removal rather than deleting the case with the field.
 *
 * It existed for one caption, which the family asked to have removed — and a
 * COUNT of rows that can state a return has no other reader, because a row that
 * cannot renders `AbsentCell` with its own reason (the two cases above), which
 * is the per-row claim rather than a page-wide fraction. A totals field nothing
 * renders is the dead-code-that-looks-alive failure this repo keeps naming, so
 * it went with its caller; the two cases that give it meaning stay above.
 */
ok("the totals no longer carry a measurable count",
  !("measurable" in capitalTotals([...gateGroups, ...okGroups])));
eq("...and still sum what was paid in across both",
  capitalTotals([...gateGroups, ...okGroups]).paidIn, 2e7);

console.log("\n── coverage is counted, never claimed ──");
const cov = trancheCoverage(BOOK_POSITIONS, BOOK_POSITION_TRANCHES);
eq("coverage counts the whole book", cov.total, BOOK_POSITIONS.length);
eq("with a breakdown", cov.withBreakdown, keys.length);
ok("most of the book has none, and that is the honest state",
  cov.withBreakdown < cov.total, `${cov.withBreakdown} of ${cov.total}`);

console.log("\n── a holding with no breakdown yields nothing, never an empty table ──");
const noneKey = BOOK_POSITIONS.find((p) => !BOOK_POSITION_TRANCHES[trancheKey(p.accountId, p.securityKey)])!;
eq("no table for an unbroken-down holding", trancheTable([noneKey], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF), null);
eq("no table for an empty set", trancheTable([], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF), null);

// ALL OR NOTHING ACROSS A CONSOLIDATED ROW. One constituent with a breakdown
// and one without must yield nothing: a table covering half a row's Invested
// would fall short of the cell it expands from, and the shortfall reads as a
// return. Verified on a real pair rather than asserted.
const withTr = posOf(BOOK_POSITION_TRANCHES[keys[0]].accountId, BOOK_POSITION_TRANCHES[keys[0]].securityKey)!;
eq("a mixed set yields no table", trancheTable([withTr, noneKey], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF), null);
ok("...while the covered one alone still does",
  trancheTable([withTr], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF) !== null);

// AND A DEDUPE PAIR COUNTS ONCE. Transition Venture Fund I is reported under
// both family trusts as one dedupeGroup, so a consolidated row prints 7,500
// units. Handing this both positions is what a securityKey-keyed union would
// do, and it must NOT quietly report 15,000 — the caller passes the deduped
// set, and this asserts what the wrong set would have produced.
const tvcs = BOOK_POSITIONS.filter((p) => p.securityKey === "transition-venture-capital-fund-i-class-a1");
if (tvcs.length === 2) {
  const both = trancheTable(tvcs, BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF)!;
  const one = trancheTable([tvcs[0]], BOOK_POSITION_TRANCHES, TRANCHE_MODE, ASOF)!;
  near("both trusts' units are twice one trust's", both.units, one.units * 2, 0.0005);
  ok("so a consolidated row must be given the deduped set, never the securityKey",
    both.units !== one.units, `${both.units} vs ${one.units}`);
}

console.log("\n── every account with a breakdown is one the family really funded ──");
const acctIds = new Set(BOOK_ACCOUNTS.map((a) => a.accountId));
ok("every move names an account in the book",
  BOOK_CAPITAL_MOVES.every((m) => acctIds.has(m.accountId)));
ok("no move carries units without a security",
  BOOK_CAPITAL_MOVES.every((m) => m.units == null || !!m.securityKey));
ok("no figure in the moves is non-finite",
  BOOK_CAPITAL_MOVES.every((m) =>
    (m.amount == null || Number.isFinite(m.amount))
    && (m.invested == null || Number.isFinite(m.invested))
    && (m.units == null || Number.isFinite(m.units))));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
