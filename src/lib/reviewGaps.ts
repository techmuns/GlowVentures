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
import { REVIEW_GAPS, REVIEW_AS_OF, type ReviewGap } from "@/data/reviewGaps";

export type { ReviewGap };
export { REVIEW_AS_OF };

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
  for (const g of REVIEW_GAPS) {
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
