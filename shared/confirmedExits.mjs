// HOLDINGS THE FAMILY CONFIRMED THEY HAVE EXITED (Stage 10ib).
//
// *"they have exited all of these three positions from their direct equity
// portfolio"* — the family, 27 Oct 2026, of HDFC Bank, ICICI Bank and Axis Bank.
//
// WHAT EVERY STATEMENT SAYS, AND WHY ONLY TWO ROWS ARE HERE.
//
//   • HDFC Bank — no statement in the book holds it, so there is nothing to
//     retire. Ankita's 18,750 Motilal Oswal shares were received on 2 Jul 2026
//     and delivered out on 22 Jul (sold on 21 Jul, MOPWM row 1210); her
//     custodian's 31 Jul statement closes the window at nil. Ajay's and
//     Ankita's Marathon Trends shares were sold in July 2025, and the MOPWM
//     report closes Ajay's and Bharat's older lots in 2024 and 2020.
//   • ICICI Bank 14,500 and Axis Bank 7,300 on Ankita's Motilal Oswal demat
//     1201090012838316 — her custodian's latest holding statement (31 Jul 2026)
//     still records them. MOPWM's transaction report of 23 Oct records each
//     bought on 1 Jul and sold in full on the exchange on 23 Sep 2026 (rows 1221
//     and 1127). That report is the adviser's record, not a statement, and
//     prints no closing balance, so on its own it never moves a quantity (Stage
//     10hu). The family's confirmation is what retires these two lines.
//   • ICICI Bank in the Aristos Equity Portfolio (Goldstandard 100022 and
//     100023, 2,000 and 5,000 shares) is the manager's PMS mandate, not direct
//     equity, and its statement of 6 Oct 2026 still holds it. Not touched.
//
// `scripts/lib/confirmedExits.mjs` retires a line only where the report's rows
// reconcile the statement's own units on its own date AND its later exchange
// trades leave exactly nil; anything else refuses the build. The retired line
// leaves `BOOK_UNVALUED_HOLDINGS` — so no page, live or statement, calls it held
// — and is kept, with the sale rows and these words, in `BOOK_CONFIRMED_EXITS`.
// No sale price, proceeds or gain is taken from the report.
//
// Keyed on the ACCOUNT its statement names (provider and account number, as
// printed) and the ISIN the line prints — never on a name. When a newer
// statement for the account arrives without the line, the entry reaches nothing
// and the book report says so: delete it then.

const ANKITA_MOTILAL = Object.freeze({
  ownerId: "ankita-jaisinghani",
  provider: "Motilal Oswal Financial Services (demat)",
  accountNo: "1201090012838316",
});
const WORDS = "they have exited all of these three positions from their direct equity portfolio";

export const CONFIRMED_EXITS = Object.freeze([
  { ...ANKITA_MOTILAL, isin: "INE090A01021", confirmed: "2026-10-27", words: WORDS },
  { ...ANKITA_MOTILAL, isin: "INE238A01034", confirmed: "2026-10-27", words: WORDS },
]);

/** The family's confirmed exit for one statement line, or null. */
export function confirmedExitFor({ provider, accountNo, isin }) {
  if (!isin) return null;
  return CONFIRMED_EXITS.find((d) => d.provider === provider && String(d.accountNo) === String(accountNo)
    && d.isin === isin.trim().toUpperCase()) ?? null;
}
