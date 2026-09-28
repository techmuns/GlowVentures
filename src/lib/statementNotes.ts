// WHAT A STATEMENT SAYS ABOUT A MARK THAT THE MARK DOES NOT (VD-16, VD-18).
//
// A fund's NAV is struck before tax or after it, and a statement says which in
// its own words. The mark on screen is right either way; what a reader needs is
// the basis, because a pre-tax and a post-tax figure for one fund differ by the
// tax and look the same.
//
// THE FAMILY HAVE DECIDED WHICH (28 Sep 2026): *"keep them pre tax only by
// default, whatever is in the review file we will follow the same rule and
// calculation across the dashboard."* Their consolidated review values each fund
// at the NAV its own statement values the holding at, and so does this book —
// measured fund by fund when they answered, on every fund carrying a value:
//
//   Sanshi Fund-I       prints both; values at the PRE-tax NAV  — review pre-tax
//   Carnelian Amritkaal prints "Pre tax NAV" alone               — review pre-tax
//   Baring PE Fund 6    prints a "pre tax value" alone           — review pre-tax
//   Founders, Delphi    print a "Post Tax NAV" alone             — review post-tax
//   Buoyant             prints a NAV "net of all expenses and taxes" alone
//
// So pre-tax wherever a statement prints a pre-tax figure, and the one figure it
// prints where that is all it prints. Nothing here moves a mark; a note names
// the basis the mark is on, so a post-tax fund never reads as the family's
// pre-tax default. (3P prints both and values at the post-tax NAV, as the review
// does; the book keeps its pre-tax NAV. Every 3P class is redeemed to nil, so the
// two agree on the value, ₹0, and a note there would have no figure to qualify.)
//
// And the ABSL Liquid units on Bharat's Motilal demat, filed under Cash, are all
// under pledge or earmark on the depository's own statement: its free balance is
// 0.000.
//
// A NOTE CARRIES NO FIGURE. It says what basis a mark is on, never a mark, and a
// pledged balance is still the family's money. `cite` is text
// `statementNotes.test.ts` finds in that document's committed pages.json, so an
// entry that stops being true of its statement fails the suite rather than going
// on asserting it.
export type StatementNote = {
  /** The holdings the note is about, by `securityKey`. */
  securityKeys: string[];
  /** Only on this account's statement line, where the note is about one account. */
  accountId?: string;
  /** A few words, for a line or a chip. */
  short: string;
  /** The sentence, for the hover. */
  note: string;
  cite: { docKey: string; text: string[] };
};

export const STATEMENT_NOTES: StatementNote[] = [
  {
    securityKeys: ["sanshi-fund-i-open-ended-aif-cat-iii-class-e", "sanshi-fund-i-open-ended-aif-cat-iii-class-a2", "sanshi-fund-i-class-e"],
    short: "pre-tax NAV",
    // The footnote the NAV is "calculated without accounting for" is about the
    // manager's PERFORMANCE FEE. This note once said tax; the page says the fee.
    note: "Marked at the fund's pre-tax NAV, the family's default. Sanshi's statement also prints a post-tax NAV, lower, and says its NAV is before the manager's annual performance fee, which is charged at the end of the financial year.",
    cite: { docKey: "sanshi-fund-9039671821-2026-06-30-unknown", text: ["The Post Tax Nav is", "annual performance fees, which will be factored in at the end of the financial year"] },
  },
  {
    securityKeys: ["carnelian-bharat-amritkaal-fund-class-a2", "carnelian-bharat-amritkaal-fund"],
    short: "pre-tax NAV",
    note: "Marked at the fund's pre-tax NAV, the family's default: the statement heads its figure \"Pre tax NAV\" and prints no post-tax one.",
    cite: { docKey: "carnelian-bharat-amritkaal-fund-4551-2026-07-31-holdings", text: ["Pre tax NAV :"] },
  },
  {
    securityKeys: ["baring-private-equity-india-fund-6-class-a1"],
    short: "pre-tax value",
    note: "Valued at what the statement calls a pre-tax value: an unaudited redemption value its manager calculates. It prints no post-tax figure.",
    cite: { docKey: "baring-private-equity-india-fund-aifm-bpepf6-0584-2026-03-31-holdings", text: ["The above pre tax value is an unaudited redemption value calculated by the Investment manager"] },
  },
  {
    securityKeys: ["motilal-oswal-founders-fund-series-ii-class-g1"],
    short: "post-tax NAV",
    note: "Marked at the fund's post-tax NAV, the only NAV its statement prints, so the family's pre-tax default cannot apply. The statement says that NAV takes off tax on realised gains only; tax on unrealised gains comes off only in the redemption NAV.",
    cite: { docKey: "motilal-oswal-founders-fund-90410016104-2026-07-31-holdings", text: ["Please note that NAV reported is post tax NAV", "only the tax on realized gains is incorporated"] },
  },
  {
    securityKeys: ["motilal-oswal-wealth-delphi-equity-fund"],
    short: "post-tax NAV",
    note: "Marked at the fund's post-tax NAV, the only NAV its statement prints, so the family's pre-tax default cannot apply.",
    cite: { docKey: "motilal-oswal-delphi-equity-fund-9049241536-2026-06-30-holdings", text: ["Please note that NAV reported is post tax NAV", "Post Tax NAV"] },
  },
  {
    securityKeys: ["buoyant-opportunities-strategy-category-iii-class-a4"],
    short: "post-tax NAV",
    note: "Marked at a post-tax NAV: the statement says its NAV is net of all expenses and taxes, and it prints no other, so the family's pre-tax default cannot apply.",
    cite: { docKey: "buoyant-capital-103473-2026-07-31-holdings", text: ["NAV per unit is net of all expenses and taxes"] },
  },
  {
    securityKeys: ["absl-liqf-d-growth"],
    accountId: "motilal-oswal-financial-services-demat-1201090012838320",
    short: "all units pledged / earmarked",
    note: "Every unit on this statement is under pledge or earmark: the depository prints its free balance as nil. It is still counted as cash, and it is not free to redeem.",
    cite: { docKey: "motilal-oswal-financial-services-demat-1201090012838320-2026-07-31-holdings", text: ["FREE BAL. PLEDGE / EARMARK", "ABSL LIQF D-GROWTH 0.000 264720.521"] },
  },
];

/** The one note every position of a set shares, or none — a row mixing two bases names neither. */
export function statementNoteForSet(ps: { securityKey: string; accountId: string }[]): StatementNote | null {
  if (!ps.length) return null;
  const n = statementNoteFor(ps[0].securityKey, ps[0].accountId);
  return n && ps.every((p) => statementNoteFor(p.securityKey, p.accountId) === n) ? n : null;
}

/** The note for a holding, or for its line on one account's statement. */
export function statementNoteFor(securityKey: string, accountId?: string): StatementNote | null {
  return STATEMENT_NOTES.find((n) => n.securityKeys.includes(securityKey) && (!n.accountId || !accountId || n.accountId === accountId)) ?? null;
}
