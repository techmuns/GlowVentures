/**
 * SEPARATE INVESTMENTS, CONFIRMED BY THE FAMILY — their answer to the one
 * question the duplicate policy cannot settle from a statement.
 *
 *   "both are separate investments" — the family, 28 Sep 2026, asked about the
 *   two pairs this book had been counting once.
 *
 * Identical figures on two accounts' statements are EVIDENCE of one holding
 * reported twice, never proof: two members can subscribe the same number of
 * units of the same fund on the same terms, and then every figure a statement
 * prints about the two holdings coincides. Check (c) in
 * `scripts/ingest/reconcile.mjs` finds such pairs and its policy — carry both,
 * count once — tags them pending an answer. Only the family can give one, and
 * for these two pairs they have:
 *
 *   • 360 ONE Special Opportunities Fund Series 8 Class A3 — 9,90,429.684 units
 *     under Ajay's CRN37702 AND 9,90,429.684 more under Bharat's CRN60117. The
 *     two 360 ONE Alternates folios (1000632 Ajay, 1000633 Bharat) are the fund
 *     manager's view of the same two holdings, so their identical income
 *     statements are two incomes, one per holder.
 *   • Transition Venture Capital Fund I Class A1 — 7,500 units under Bharat
 *     Jaisinghani Family Trust 2 (TVC262) AND 7,500 more under Trust 3
 *     (TVC263), each trust's own ₹75 L paid in.
 *
 * A decision about the family's affairs, not a parsing rule, so it is a
 * committed table carrying the date it was given rather than anything
 * inferred — the standing of `RINGFENCED_SECURITY_KEYS` (build-book.mjs) and
 * `FAMILY_MARKET_SIDE` (aifCategory.mjs). Deleting an entry puts that pair back
 * under the count-once policy: `npm run replay:dedupe` puts its tags back on the
 * committed archive (no PDF passwords needed) and `npm run build-book` counts it
 * once again. Until the replay runs, the ingest suite fails on the drift.
 *
 * IT COVERS THE ACCOUNTS NAMED AND NOTHING ELSE. A third account reporting the
 * same figures would be a new question, so a group reaching any account not
 * named here is grouped exactly as before.
 *
 * KEYED ON `securityKey`, so a change to `securityKeyOf` must carry this table
 * with it. `npm run build-book` names an entry that matches no holding, and
 * `separateInvestments.test.ts` fails on one, because a drifted key would put a
 * pair back under the count-once policy without a word.
 *
 * Shared by the ingest (`reconcile.mjs`, which decides what is tagged), the
 * book build (which reports and guards it), `npm run replay:dedupe` (which
 * lands a change here on the committed archive without the PDF passwords) and
 * the suites — one table, so the four cannot disagree about which pairs are
 * separate.
 */
export const SEPARATE_INVESTMENTS = [
  {
    securityKey: "360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii",
    accounts: [
      { provider: "360 ONE Private Wealth", accountNo: "37702" },
      { provider: "360 ONE Private Wealth", accountNo: "60117" },
    ],
    /** The income-only folios that report the same two holdings' distributions. */
    incomeFolios: [
      { provider: "360 ONE Alternates Asset Management", accountNo: "1000632" },
      { provider: "360 ONE Alternates Asset Management", accountNo: "1000633" },
    ],
    confirmed: "2026-09-28",
  },
  {
    securityKey: "transition-venture-capital-fund-i-class-a1",
    accounts: [
      { provider: "Transition Venture Capital", accountNo: "TVC262" },
      { provider: "Transition Venture Capital", accountNo: "TVC263" },
    ],
    incomeFolios: [],
    confirmed: "2026-09-28",
  },
];

/** One account named by the provider and the number its statement prints. */
export const sameAccount = (a, b) => a.provider === b.provider && String(a.accountNo) === String(b.accountNo);

/**
 * The family's decision covering EVERY account in a group of matching rows of
 * one security, or null. Every account must be named: a decision about two
 * accounts says nothing about a third.
 */
export function separateInvestmentFor(securityKey, accounts, decisions = SEPARATE_INVESTMENTS) {
  return decisions.find((d) => d.securityKey === securityKey
    && accounts.length > 0
    && accounts.every((a) => d.accounts.some((n) => sameAccount(n, a)))) ?? null;
}

/** The same, for income-only folios, which carry no holding to key on. */
export function separateIncomeFor(accounts, decisions = SEPARATE_INVESTMENTS) {
  return decisions.find((d) => (d.incomeFolios ?? []).length > 0
    && accounts.length > 0
    && accounts.every((a) => d.incomeFolios.some((n) => sameAccount(n, a)))) ?? null;
}
