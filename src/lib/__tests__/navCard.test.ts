// THE NAV CARD'S PRESENTATION ARITHMETIC — the lines it draws and the accounts
// it names.   npm run test:family
//
// Two claims the page sweep cannot strike on its own, both derived from the
// GENERATED book rather than from a fixture:
//
//   1. THE LINE WITH CAPITAL LEFT IN STARTS ON THE BOOK'S LINE (MNT-12). It was
//      rebased to its own 100 at the date the panel completes while the book's
//      line is 100 at the series' first point, so on one chart the two sat on
//      different bases and the distance between them was not the capital.
//   2. A REDEEMED ACCOUNT IS A MEASURED NIL (MNT-14). `build-book` writes the
//      distinction only in the sentence it puts on the account, so the card's
//      classifier reads that sentence's own clause — and this suite TIES the
//      clause to its generator, so rewording the branch there fails here rather
//      than quietly turning a measured zero back into an absence.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_NAV_HISTORY, BOOK_NAV_COVERAGE, BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { navIndexSeries, isMeasuredNilAccount, MEASURED_NIL_CLAUSE } from "@/lib/navSeries";
import { unvaluedKindOf } from "@/lib/aifCategory";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const ROOT = process.env.GLOW_ROOT ?? process.cwd();

// ── 1. The dashed line meets the book's line where the panel completes ──────
{
  const s = navIndexSeries(BOOK_NAV_HISTORY);
  const from = s.findIndex((p) => p.panelComplete);
  ok("the book's panel completes inside the series, so the two bases can differ at all",
    from > 0, `complete from index ${from} (${s[from]?.date}) of ${s.length}`);
  if (from > 0) {
    const at = s[from];
    ok("at the complete-panel date the line with capital left in sits ON the book's line",
      Math.abs(at.navIndex - at.index) < 1e-9, `nav ${at.navIndex.toFixed(4)} vs book ${at.index.toFixed(4)} on ${at.date}`);
    ok("…and is undefined before it, where the level is a growing set of accounts",
      s.slice(0, from).every((p) => !Number.isFinite(p.navIndex)));
    // After the anchor its growth is the raw NAV's own, from that date.
    const last = s[s.length - 1];
    const rawGrowth = last.nav / at.nav;
    ok("after it, the line moves exactly as the raw NAV does",
      Math.abs(last.navIndex / at.navIndex - rawGrowth) < 1e-9,
      `line ×${(last.navIndex / at.navIndex).toFixed(6)} vs NAV ×${rawGrowth.toFixed(6)}`);
    // LOAD-BEARING: on this book the two bases really differ, so the old
    // rebasing (100 at the complete panel) would put the dashed line somewhere
    // else. A book whose panel completed at 100 would pass without testing it.
    ok("the anchor is load-bearing: the book's line is not at 100 where the panel completes",
      Math.abs(at.index - 100) > 0.5, `book line ${at.index.toFixed(2)} on ${at.date}`);
  }
}

// ── 2. A measured nil is read off the generator's own clause ────────────────
{
  const src = readFileSync(path.join(ROOT, "scripts/build-book.mjs"), "utf8");
  ok("the clause the card reads is the one build-book writes, verbatim",
    src.includes(MEASURED_NIL_CLAUSE), MEASURED_NIL_CLAUSE);
  const byId = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
  const withPositions = new Set(BOOK_POSITIONS.map((p) => p.accountId));
  const nils = BOOK_NAV_COVERAGE.unvalued.filter((u) => isMeasuredNilAccount(byId.get(u.accountId)));
  // THE BOOK SAYS HOW MANY THERE ARE. An account that has a holdings statement
  // and no positions is the nil branch's own premise, so the count is derived:
  // every account the classifier names holds nothing and carries a zero, and at
  // least one exists — or the suite has stopped testing anything and says so.
  ok("this book carries at least one account redeemed to nil on its own statement",
    nils.length >= 1, nils.map((u) => u.accountNo).join(", "));
  ok("every account read as a measured nil holds no position and carries a zero",
    nils.every((u) => !withPositions.has(u.accountId) && u.bookValue === 0));
  ok("no account that holds a position is read as a measured nil",
    BOOK_ACCOUNTS.filter((a) => withPositions.has(a.accountId)).every((a) => !isMeasuredNilAccount(a)));
  ok("an account with no reason, or a reason naming a different cause, is not a measured nil",
    !isMeasuredNilAccount(null) && !isMeasuredNilAccount({ noPositionsReason: null })
    && !isMeasuredNilAccount({ noPositionsReason: "this fund publishes no NAV: its statement carries units and no valuation" }));
}

// ── 3. ONE ANSWER TO "IS THIS ACCOUNT A MEASURED NIL" ──────────────────────
//
// The NAV card reads `isMeasuredNilAccount`; Private Market and the AIF
// drill-down read `unvaluedKindOf`. The second matched the bare word
// "redeemed", which agreed on this book and would call any other reason that
// says the word a measured nil. It reads the first now, so the two cannot name
// one account two things.
{
  const disagree = BOOK_ACCOUNTS.filter((a) =>
    (unvaluedKindOf(a.noPositionsReason) === "redeemed") !== isMeasuredNilAccount(a));
  ok("every account the drill-downs call redeemed is the NAV card's measured nil, and no other",
    disagree.length === 0, disagree.map((a) => a.accountNo).join(", "));
  ok("...and a reason that says \"redeemed\" without the generator's clause is not one",
    unvaluedKindOf("some units were redeemed during the period; the statement carries no valuation") !== "redeemed");
}

console.log(fails ? `\n${fails} FAILED` : "\nall NAV card checks passed");
process.exit(fails ? 1 : 0);
