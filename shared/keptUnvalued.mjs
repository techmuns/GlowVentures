// HOLDINGS THE FAMILY HAVE DECIDED TO KEEP UNVALUED.
//
// A statement row with no rate carries a quantity and no value (§2): the book
// never borrows a mark from another document to fill it. Where a mark from
// another statement COULD value it, whether to borrow it is the family's
// question rather than the pipeline's, and this table is their answer — the
// standing `shared/separateInvestments.mjs` and `FAMILY_MARKET_SIDE` have for
// their own decisions. `build-book` reads it and the row's reason says so, so a
// reader sees the absence is chosen, not missed.
//
// *"keep them unvalued for now"* — the family, 28 Sep 2026, about Ankita's
// 94,967 Clean Max Enviro Energy Solutions shares.
//
// WHAT THE STATEMENT SAYS, READ OFF THE PAGE'S OWN COLUMNS. Ankita's Motilal Oswal
// demat statement of 31 Jul 2026 prints each holding as a row and wraps its
// middle balances onto two more lines. The page's x positions put the 94,967 in
// the "LOCKIN + FREEZE BAL" column, with FREE BAL. at 0.000 and a Rs RATE of
// 0.000 — so every share is locked in, none is free, and nothing prices them.
// (The text layer carries that header in pieces, "LOCKIN +" and "FREEZE BAL",
// and the row's figures in order; which column the 94,967 sits in is the
// geometry, and was read from it.)
//
// WHY A BORROWED MARK WAS THE QUESTION. Ajay's ICICI Bank NSDL statement of
// 31 Mar 2026 carries the same count of the same company, 94,967 Clean Max
// shares, as "Beneficiary - Pre IPO Shares/27-AUG-26", and values them at
// ₹1,336.50 a share. At that borrowed mark Ankita's shares would read about
// ₹12.69 Cr. Whether they are those shares moved, or a second equal allotment,
// no statement here says, and the family have chosen to keep Ankita's shares a
// quantity with no value until a statement for that account prices them.
//
// Keyed on the ACCOUNT the statement names (provider and account number, as
// printed) and the ISIN it prints — never on a name — so a second holding of
// the same company elsewhere is not swept in. `cite` is text
// `keptUnvalued.test.ts` finds in that document's committed pages.json, so an
// entry that stops being true of its statement fails the suite.
//
// Removing an entry does not value the holding: the row goes back to the
// statement's own reason. Valuing it would need a mark this book does not
// borrow.

export const KEPT_UNVALUED = [
  {
    provider: "Motilal Oswal Financial Services (demat)",
    accountNo: "1201090012838316",
    isin: "INE647U01026",
    decided: "2026-09-28",
    words: "keep them unvalued for now",
    why: "holds every one of these shares in its lock-in + freeze balance, none of them free, and prints no rate for them",
    cite: {
      docKey: "motilal-oswal-financial-services-demat-1201090012838316-2026-07-31-holdings",
      text: [
        "FREE BAL.",
        "LOCKIN +",
        "FREEZE BAL",
        "INE647U01026 CLEAN MAX ENV-EQ 1/- 0.000 0.000 0.000 0.000 0.000 94967.000 0.000 0.00 0.000 0.000 94967.000",
      ],
    },
  },
];

/**
 * The family's decision for one statement row, or null. `provider` and
 * `accountNo` are the ACCOUNT's, as its statement prints them; `isin` the row's.
 */
export function keptUnvaluedFor({ provider, accountNo, isin }) {
  if (!isin) return null;
  return KEPT_UNVALUED.find((d) => d.provider === provider && String(d.accountNo) === String(accountNo) && d.isin === isin) ?? null;
}

/**
 * The reason a kept-unvalued row carries: the statement's own fact, then the
 * family's decision, in the house style of every other unvalued row ("the …
 * statement of … prints no rate …, so it carries a quantity and no value"). The
 * quantity is on the line's face, so the reason does not repeat it.
 */
export function keptUnvaluedReason(d, asOf) {
  return `the ${d.provider} statement of ${asOf} ${d.why} — and the family decided on ${d.decided} `
    + `to keep them unvalued ("${d.words}") rather than borrow a mark from another statement, `
    + "so they carry a quantity and no value";
}
