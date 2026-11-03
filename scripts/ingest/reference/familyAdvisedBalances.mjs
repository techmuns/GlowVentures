// THE FAMILY'S NOTE OF ITS LIQUID HOLDINGS BY MODE, keyed on the member it names.
//
// An email table sent to the office and shared on 3 Nov 2026: per member, what
// sits in "Demat Mode" (Motilal Oswal Arbitrage Fund, Nippon India ETF Nifty 1D
// Rate Liquid BeES) and in "Physical Mode" (HDFC Overnight Fund), as a rupee
// value and nothing else — no units, no date. It is a covering note, not a
// statement, so it lives here rather than under `source/`, word for word.
//
// THE DATE IS PROVED, NOT ASSUMED: AMFI's published NAV of 21 Oct 2026, and of
// no day from 14 to 28 Oct beside it, turns two independently recorded unit
// counts into the note's two values to the paisa:
//   HDFC Overnight Fund Direct Growth (INF179KB1HT1)  4107.1768
//     Aarti's 48.183 units on her HDFC folio's 1 Oct statement = ₹1,97,896.10
//     (20 Oct's NAV gives ₹1,97,865.76, 22 Oct's ₹1,97,926.26).
//   Motilal Oswal Arbitrage Direct Growth (INF247L01ED1)  11.3690
//     the 2,473,221.627 units MOPWM's transaction report shows bought on 13 Oct
//     2026 in Ajay's demat 1201090012539150 = ₹2,81,18,056.68 (23 Oct's 11.3693
//     gives ₹2,81,18,798.64).
//   Nippon India ETF Nifty 1D Rate Liquid BeES (INF732E01037)  1000.0000, as on
//     every day: it dates nothing, but Bharat's 3,828.050 units on his 31 Jul
//     statement plus the report's twelve weekly reinvestments through 19 Oct
//     are 3,862.532 units = ₹38,62,532.00.
// (AMFI NAV history, `DownloadNAVHistoryReport_Po.aspx`, 10 Oct – 3 Nov 2026.)
//
// So each line's units are its value ÷ that NAV, kept only where three decimals
// — the precision a fund unit is struck at — give the value back to the paisa,
// and only where a recorded balance of the same owner and ISIN, older than
// 21 Oct, is there to be carried (`adviseBalances`). The tie is a consistency
// check, not a proof: at a NAV near 11 some three-decimal count fits almost any
// value, which is why the date rests on the two recorded counts above. The
// name → ISIN reading is ours.

export const ADVISED_ON = "2026-10-21";
export const ADVISED_SOURCE = "the family's note of its demat and physical liquid holdings, valued at AMFI's NAV of 21 Oct 2026";

/** AMFI's published NAV of `ADVISED_ON` for each scheme the note names. */
export const ADVISED_NAVS = Object.freeze({
  INF247L01ED1: 11.3690,
  INF732E01037: 1000.0000,
  INF179KB1HT1: 4107.1768,
});

const SCHEME = Object.freeze({
  "Motilal Oswal Arbitrage Fund Direct Growth": "INF247L01ED1",
  "Nippon India ETF Nifty 1D Rate Liquid BeES": "INF732E01037",
  "HDFC Overnight Direct-G": "INF179KB1HT1",
});

/** The note's two tables, cell for cell. A dash is not held, so it is no line. */
export const FAMILY_ADVISED_BALANCES = Object.freeze([
  { mode: "demat", holder: "Ajay Jaisinghani", ownerId: "ajay-jaisinghani", printed: "Motilal Oswal Arbitrage Fund Direct Growth", amount: 28118056.68 },
  { mode: "demat", holder: "Ajay Jaisinghani", ownerId: "ajay-jaisinghani", printed: "Nippon India ETF Nifty 1D Rate Liquid BeES", amount: 8986080.00 },
  { mode: "demat", holder: "Aarti Jaisinghani", ownerId: "aarti-jaisinghani", printed: "Nippon India ETF Nifty 1D Rate Liquid BeES", amount: 7748670.00 },
  { mode: "demat", holder: "Ankita Jaisinghani", ownerId: "ankita-jaisinghani", printed: "Nippon India ETF Nifty 1D Rate Liquid BeES", amount: 25775416.00 },
  { mode: "demat", holder: "Bharat Jaisinghani", ownerId: "bharat-jaisinghani", printed: "Nippon India ETF Nifty 1D Rate Liquid BeES", amount: 3862532.00 },
  { mode: "physical", holder: "Aarti Jaisinghani", ownerId: "aarti-jaisinghani", printed: "HDFC Overnight Direct-G", amount: 197896.10 },
].map((l) => ({ ...l, isin: SCHEME[l.printed] })));

const tie = (a, b) => Math.abs(a - b) < 0.0005;

/** Units for a value at the day's NAV, or null where no three-decimal count reproduces the value to the paisa (a check, not a proof). */
export function unitsFor(amount, nav) {
  const units = Math.round((amount / nav) * 1000) / 1000;
  return Math.abs(Math.round(units * nav * 100) / 100 - amount) < 0.005 ? units : null;
}

/**
 * The note laid over the book's own records of the same holdings.
 *
 * A DEMAT line carries ONE recorded balance forward to `ADVISED_ON`: the owner's
 * Motilal Oswal demat whose holding statement records the ISIN as a quantity
 * (`unvalued`), or whose transaction statement walks it to a closing balance
 * (`movements`, an account with no holding statement). Those balances are valued
 * on the LIVE basis only (`fundNavs.ts`), and so is the carried one; no
 * statement figure moves. A PHYSICAL line is a fund's own folio, which a
 * statement already values: the note confirms its units or is named as
 * disagreeing, and changes nothing either way.
 *
 * @returns {{ balances: object[], confirmed: string[], refused: string[] }}
 */
export function adviseBalances({ accounts, positions, unvalued, movements, lines = FAMILY_ADVISED_BALANCES }) {
  const acc = new Map(accounts.map((a) => [a.accountId, a]));
  const balances = [], confirmed = [], refused = [];
  for (const l of lines) {
    const nav = ADVISED_NAVS[l.isin];
    const units = nav ? unitsFor(l.amount, nav) : null;
    const what = `${l.holder}'s ${l.printed} (${l.mode}, ₹${l.amount.toLocaleString("en-IN")})`;
    if (!l.isin || units === null) {
      refused.push(`${what}: no unit count at AMFI's ${ADVISED_ON} NAV reproduces the value, so the line is not applied`);
      continue;
    }
    if (l.mode === "physical") {
      const held = positions.filter((p) => p.isin === l.isin && acc.get(p.accountId)?.ownerId === l.ownerId && (p.quantity ?? 0) > 0);
      if (held.length === 1 && tie(held[0].quantity, units)) confirmed.push(`${what}: ${units} units, as ${held[0].accountId}'s statement of ${acc.get(held[0].accountId)?.asOf} records`);
      else refused.push(`${what}: ${units} units, which ${held.length === 1 ? `${held[0].accountId}'s ${held[0].quantity}` : `${held.length} statement holdings`} do not match; nothing is changed`);
      continue;
    }
    const demat = (id) => acc.get(id)?.provider === "Motilal Oswal Financial Services (demat)" && acc.get(id)?.ownerId === l.ownerId;
    const records = [
      ...unvalued.filter((u) => demat(u.accountId) && u.isin === l.isin && (u.quantity ?? 0) > 0)
        .map((u) => ({ accountId: u.accountId, quantity: u.quantity, asOf: u.asOf, kind: "holding statement" })),
      ...Object.values(movements).filter((w) => demat(w.accountId) && acc.get(w.accountId)?.transactionsOnly
        && w.isin === l.isin && w.reason == null && (w.closing ?? 0) > 0)
        .map((w) => ({ accountId: w.accountId, quantity: w.closing, asOf: w.periodTo, kind: "transaction statement's closing balance" })),
    ];
    if (records.length !== 1) {
      refused.push(`${what}: ${records.length} recorded Motilal demat balances of this ISIN for ${l.holder}, so the note lands on none`);
      continue;
    }
    const [r] = records;
    if (!(r.asOf && r.asOf < ADVISED_ON)) {
      refused.push(`${what}: ${r.accountId}'s balance is dated ${r.asOf}, not before the note's ${ADVISED_ON}`);
      continue;
    }
    balances.push({
      accountId: r.accountId, isin: l.isin, security: l.printed, mode: l.mode,
      recordQuantity: r.quantity, recordAsOf: r.asOf, recordKind: r.kind,
      quantity: units, on: ADVISED_ON, amount: l.amount, nav, source: ADVISED_SOURCE,
    });
  }
  balances.sort((a, b) => a.accountId.localeCompare(b.accountId) || a.isin.localeCompare(b.isin));
  return { balances, confirmed, refused };
}
