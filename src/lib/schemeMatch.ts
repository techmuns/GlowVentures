/**
 * HOW A HOLDING WAS JOINED TO ITS SCHEME, SAID AS IT HAPPENED (DSM-C5, VD-19).
 *
 * The fund card's match pill read "matched on name+plan" while its own hover
 * said "Matched from this holding's own ISIN", the Plan tile's caption said
 * "from this holding's ISIN" and the page header said "no ISIN reported" — on
 * Motilal Oswal Active Momentum, whose statement prints ISIN INF247L01EP5 and
 * whose reader did not capture it. Three claims about one join, two of them
 * false, each a constant written for the case where the ISIN did join.
 *
 * What is true in every case is what the BOOK carries and what the fund store
 * matched on. So each sentence is chosen by `matchedVia`, and an ISIN the store
 * carries for a scheme it matched another way is named as the store's, never as
 * one read off the family's statement.
 */

export type SchemeMatchWords = {
  /** The pill's face: how the store joined this holding to its scheme. */
  pill: string;
  /** The pill's hover. */
  pillTip: string;
  /** The Plan tile's caption: where the plan came from. */
  planSource: string;
  /** Its hover. */
  planTip: string;
};

const PLANS_DIFFER = "Plans differ in expense ratio, and therefore NAV — not in what the fund owns.";

export function schemeMatchWords(matchedVia: string | null | undefined, storeIsin?: string | null): SchemeMatchWords {
  if (matchedVia === "isin") {
    return {
      pill: "matched on ISIN",
      pillTip: "Matched on this holding's own ISIN, so the NAV and returns are the plan the family actually holds.",
      planSource: "from this holding's ISIN",
      planTip: `Resolved from this holding's own ISIN, so the NAV is this plan's. ${PLANS_DIFFER}`,
    };
  }
  const via = matchedVia && matchedVia.trim() ? matchedVia.trim() : "name";
  const plan = /plan/i.test(via);
  const store = storeIsin ? ` ${storeIsin} is the scheme's own ISIN, from the fund store — not one read off this family's statement.` : "";
  return {
    pill: `matched on ${via}`,
    pillTip: `No statement behind this holding carries an ISIN in the book, so the scheme was matched on its name${plan ? " and the plan its statement names" : ""}.${store}`,
    planSource: plan ? "the plan its statement names" : "matched on the scheme's name",
    planTip: `No statement behind this holding carries an ISIN in the book, so the plan is ${plan ? "the one its statement names" : "the one the scheme's name matched"}. ${PLANS_DIFFER}`,
  };
}

/**
 * THE PAGE HEADER'S ISIN, WHERE THE BOOK CARRIES NONE. "No ISIN reported" is a
 * claim about the statement, and it is false of a statement that prints one its
 * reader did not capture. What is true is that the BOOK carries none — and, for
 * a scheme, whether the fund store knows one another way.
 */
export function isinAbsentWords(fundOnly: boolean, storeIsin?: string | null): { text: string; tip: string } {
  if (fundOnly) return { text: "no ISIN reported", tip: "No fund filing that discloses this company carries an ISIN for it." };
  return {
    text: "no ISIN in the book",
    tip: `The book carries no ISIN for this holding — none was read off the statements behind it.${storeIsin
      ? ` The fund store matches the scheme another way and carries ${storeIsin} as the scheme's own ISIN — not one read off this family's statement.`
      : ""}`,
  };
}
