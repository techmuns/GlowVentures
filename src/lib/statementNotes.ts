// WHAT A STATEMENT SAYS ABOUT A MARK THAT THE MARK DOES NOT (VD-16, VD-18).
//
// Two holdings carry a figure that is right and a basis nobody on screen was
// told. Sanshi Fund-I and Carnelian Bharat Amritkaal are marked at the PRE-TAX
// NAV their statements print, and each statement says so in its own words:
// Sanshi's also prints a post-tax NAV, Carnelian's heads its figure "Pre tax
// NAV". And the ABSL Liquid units on Bharat's Motilal demat, filed under Cash,
// are all under pledge or earmark on the depository's own statement: its free
// balance is 0.000.
//
// A NOTE CARRIES NO FIGURE. It says what basis a mark is on, never a mark: which
// NAV to value a fund at is the family's question (pre-tax, as the family's own
// review also does, or post-tax), and a pledged balance is still the family's
// money. `cite` is text `statementNotes.test.ts` finds in that document's
// committed pages.json, so an entry that stops being true of its statement fails
// the suite rather than going on asserting it.
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
    note: "Marked at the fund's pre-tax NAV. Sanshi's statement also prints a post-tax NAV, lower, and says its NAV is calculated without accounting for tax.",
    cite: { docKey: "sanshi-fund-9039671821-2026-06-30-unknown", text: ["The Post Tax Nav is", "The NAV has been calculated without accounting"] },
  },
  {
    securityKeys: ["carnelian-bharat-amritkaal-fund-class-a2", "carnelian-bharat-amritkaal-fund"],
    short: "pre-tax NAV",
    note: "Marked at the NAV the statement heads \"Pre tax NAV\"; it prints no post-tax figure.",
    cite: { docKey: "carnelian-bharat-amritkaal-fund-4551-2026-07-31-holdings", text: ["Pre tax NAV :"] },
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
