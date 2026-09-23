// WHY A NAME THE FAMILY HOLDS IS ON NO SCREEN — the read side of
// `src/data/reviewGaps.ts`.
//
// THE DEFECT THIS ANSWERS. The family searched the Portfolio Monitor for BSE,
// got "No holdings match “BSE”." and asked whether the dashboard was broken. It
// was not: BSE Ltd. is 40,000 shares on their own consolidated review and NO
// STATEMENT in `source/` reports it, so the book is right to carry nothing —
// a figure for it would be the fabrication this whole book exists to prevent.
// What was wrong is that the screen could not say so, which is this repo's
// most-repeated failure arriving one layer up from a dashed cell: a reader who
// cannot tell "no custodian sent this" from "the dashboard lost it" assumes the
// second. `costWhy` names the custodian on a cost cell for exactly this reason.
//
// NOTHING HERE IS A FIGURE. The review is not a source (§"the consolidated
// review workbook is not a source — by decision"), so no value and no quantity
// of its own crosses over; `REVIEW_GAPS` carries a name, a custodian and two
// sentences, and its generator throws rather than emit a number.
import { BOOK_POSITIONS } from "@/data/glowData";
import { securityKeyOf } from "@/lib/securityKey";
import { depositoryCashHoldings } from "@/lib/fundNavs";
import { REVIEW_GAPS, REVIEW_AS_OF, type ReviewGap } from "@/data/reviewGaps";

export type { ReviewGap };
export { REVIEW_AS_OF };

/**
 * ── A GAP THIS BOOK MAY NOT CLAIM, BECAUSE A NAME LIKE IT IS IN THE BOOK ────
 *
 * The reconciler reports a review line as absent when no tier JOINS it, and it
 * is right to: its prefix tier runs one way only, because accepting the reverse
 * once matched `Vedanta Power`, `Vedanta Iron & Steel` and `Vedanta Oil & Gas`
 * onto the one book row named `Vedanta` — four demerged companies reported
 * against 12,909 shares of their former parent.
 *
 * ON SCREEN THE CONSEQUENCES ARE THE OTHER WAY ROUND, AND THAT IS THE WHOLE
 * REASON THIS TIER MAY BE LOOSER THAN THAT ONE. There, a weak match JOINS and
 * publishes a figure. Here it only decides whether to stay quiet: the cost of
 * suppressing too much is the silence a reader already had, and the cost of
 * suppressing too little is telling them a holding they own is missing.
 *
 * Measured and the case is real: the book holds `ONESOURCE SPECIAL-EQ` — 48,000
 * shares, ₹8.61 Cr, a depository's clipped spelling — while the review writes
 * `Onesource Specialty Pharma`, and without this the note told a reader no
 * statement reported a position sitting one search away. Also `Bharat
 * Parenteral`, `Infinium Pharma`, `Kaynes Technology` and `Zaggle Prepaid`.
 *
 * AND IT DECLINES THE THREE VEDANTA SPIN-OFFS TOO, which ARE genuine gaps — the
 * book's `vedanta` row is their former parent, and nothing here can tell that
 * apart from a clipped name without the hand-checked table `nameMatch.mjs`
 * already says this corpus needs. Three real answers withheld rather than one
 * false one published; `shared/nameMatch.mjs` lists them for a human to commit.
 */
const flat = (k: string) => k.replace(/-/g, "");
const BOOK_KEYS = [...new Set(BOOK_POSITIONS.map((p) => securityKeyOf(p.security)))].filter(Boolean);

/**
 * ── …NOR ONE THE LIVE BOOK VALUES FROM A DEPOSITORY'S OWN BALANCE ──────────
 *
 * Stage 10bv values the cash-equivalent funds a depository reports on an
 * account that sent a transaction statement and no holding statement — at
 * units × AMFI's published NAV, on the LIVE basis only — so `BOOK_POSITIONS`
 * above never carries them, and the name tier cannot see them either: the
 * depository prints the AMC's name in front of the scheme's. Two of them are
 * lines the family's review prints, and left claimable, a search that empties
 * a narrowed page would say "no statement reports it … no value or quantity"
 * beside the Cash row that values it.
 *
 * JOINED BY ISIN THROUGH A HAND-CHECKED TABLE, never by a name rule, and each
 * entry says what ties the review's line to the depository's balance. Keyed on
 * what the live book ACTUALLY carries rather than on the table alone, so
 * switching that valuation off (`VALUE_DEPOSITORY_CASH_UNITS`) brings the
 * sentence back — which is then true again.
 */
export const REVIEW_LINE_ISINS: ReadonlyMap<string, string> = new Map([
  // The review's transaction sheet records Ajay buying 1,63,08,407.445 units at
  // ₹11.0367 on 20 May 2026, and the depository credits exactly those units on
  // his demat the next day — the unit witness `fundNavs.test.ts` asserts.
  ["Motilal Oswal Arbitrage Fund Direct (G)", "INF247L01ED1"],
  // The review's Cash tab and its transaction sheet both print Ajay's 2,282.178
  // units: the depository's closing balance on the same demat, to the third
  // decimal.
  ["HDFC Liquid Fund -Direct(G)", "INF179KB1HP9"],
]);
const DEPOSITORY_VALUED = new Set(
  depositoryCashHoldings().map((p) => p.isin?.trim().toUpperCase()).filter((x): x is string => !!x));
/** Whether the live book values this review line from a depository's balance. */
export const valuedFromDepository = (g: ReviewGap) =>
  DEPOSITORY_VALUED.has(REVIEW_LINE_ISINS.get(g.name) ?? "");

const CLAIMABLE = REVIEW_GAPS.filter((g) => {
  if (valuedFromDepository(g)) return false;
  const k = securityKeyOf(g.name);
  if (!k) return false;
  return !BOOK_KEYS.some((bk) =>
    bk.startsWith(k) || k.startsWith(bk) || flat(bk).startsWith(flat(k)) || flat(k).startsWith(flat(bk)));
});

/** The gaps a search may be told about — see `CLAIMABLE` above. */
export const claimableGaps = () => CLAIMABLE;

/**
 * Case, punctuation and spacing folded away, so `BSE Ltd.` and `bse ltd` are
 * one string. Deliberately the same shape as `securityKeyOf`'s normalisation
 * and deliberately NOT that function: this compares a reader's typing against a
 * display name, where that one derives the book's identity from a statement.
 */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every spelling a gap answers to: the review's own name plus its aliases. */
const spellings = (g: ReviewGap) => [g.name, ...g.aliases];

/**
 * The review lines a reader's search term names, closest first.
 *
 * SUBSTRING IN BOTH DIRECTIONS AND NOTHING LOOSER. "bse" finds "BSE Ltd."
 * because the query sits inside the name; "bombay stock exchange ltd" finds it
 * because the ALIAS sits inside the query. There is deliberately no fuzzy tier
 * — `shared/nameMatch.mjs` records what a token-overlap rule did to this corpus
 * (`KIRANAKART TECHNOLOGIES` matched to `TATA TECHNOLOGIES`), and a wrong match
 * here would tell a reader the wrong thing about their own money.
 *
 * A one-character query matches nothing: at that length a substring rule names
 * half the list, which is noise rather than an answer.
 */
export function reviewGapsFor(query: string, limit = 3): ReviewGap[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const scored: Array<{ g: ReviewGap; rank: number }> = [];
  for (const g of CLAIMABLE) {
    let best = Infinity;
    for (const s of spellings(g)) {
      const n = norm(s);
      // 0 exact · 1 the name starts with what was typed · 2 either contains the
      // other. Ranked so a reader typing a full name is not led by a longer one
      // that merely contains it.
      const rank = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) || q.includes(n) ? 2 : Infinity;
      if (rank < best) best = rank;
    }
    if (best < Infinity) scored.push({ g, rank: best });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.g.name.length - b.g.name.length || a.g.name.localeCompare(b.g.name))
    .slice(0, limit)
    .map((x) => x.g);
}
