/**
 * ── A DATED RECORD, FILED UNDER THE SAME SECTION AS A HOLDING ───────────────
 *
 *   *"the format of the transactions page and the holdings page is very
 *    different… different categorization names and methods. Make sure that the
 *    transactions page matched the … categorization as in the holdings page…
 *    replace it with what is in the holdings — Category / Asset class /
 *    Basket."*
 *
 * The Transactions card used to carry a categorisation of its own — five tabs
 * (What I invested / Direct Equity / Manager trades / Trades by member / Full
 * trade list) that mixed two SOURCES with three GROUPINGS and a raw list, in a
 * vocabulary no other screen used. The Holdings table beside it sections on
 * `groupAxis`. A reader crossing between them had to learn both.
 *
 * So the dated records section on the SAME three axes, and this is the one
 * place that decides which section a dated record lands in. It does not define
 * a fourth taxonomy: `groupKeyFor` still answers, and everything here is the
 * JOIN that lets it — a trade names its account by the two fields its statement
 * prints (provider + number) and its instrument by `securityKey`, where
 * `groupKeyFor` wants an `accountId` and an asset class.
 *
 * ── WHY THE JOIN IS NEEDED AT ALL, AND WHY IT IS NOT A SECOND DEFINITION ────
 *
 * `groupKeyFor` takes a `Classifiable` — `{ assetClass, securityKey, accountId }`
 * — which is exactly what it reads and nothing more (see `familyTaxonomy.ts`).
 * A `Txn` carries two of those three outright and names the account the way the
 * statement does, never by the id. Re-deriving an `accountId` slug from the
 * tape's display label would be identity re-derived in the presentation layer,
 * which is the trap `ledger.ts` already refuses once for `securityKey`; so the
 * lookup is on PROVIDER + ACCOUNT NUMBER, the two fields both sides print.
 *
 * ── AN UNSTATED ASSET CLASS IS JOINED, THEN NAMED — NEVER GUESSED ───────────
 *
 * `Txn.assetClass` is what the STATEMENT called the instrument, and it is null
 * where the statement said nothing. Measured over this book's tape: 22 of 691
 * rows, of which 20 are inside a PMS mandate — where the class never decides
 * anything, because `holdingBucket` answers MANDATE_BUCKET on the engagement
 * alone and the family's two axes key a mandate on its account.
 *
 * The other 2 are in an AIF folio, and for those the class is taken from the
 * BOOK's own position for that (account, security) — the same instrument, as
 * this book already classifies it, joined on an identifier rather than on a
 * name. Where even that is silent the null is HANDED TO `groupKeyFor` rather
 * than short-circuited here, because it already answers correctly for one: the
 * category axis names the absence (`UNSTATED_BUCKET`) and the family's two axes
 * answer `UNCLASSIFIED`, which is what their review genuinely says about a
 * product it does not list. Either way nothing picks a class, because a trade
 * whose instrument nothing classifies is not an equity, a fund or cash, and
 * choosing one would be the fabricated classification `VAL_METHODS[i % 5]`
 * already cost this book once.
 *
 * ── AND THE SECURITY AXIS IS NOT REACHABLE FROM HERE, BY TYPE ──────────────
 *
 *   *"don't put security categorization filter in transactions."*
 *
 * Everything here takes a `GroupAxis` — the three ALLOCATION axes — and not the
 * Monitor's four-key `MonitorAxis`. The security axis files every holding in one
 * section by design, so a transactions table built on it would draw one heading
 * over everything and mean nothing; stating that in the type is stronger than
 * omitting a button, because a caller that tried would not compile.
 *
 * ── AN ACCOUNT'S OWN SECTION, FOR THE CAPITAL RECORD ────────────────────────
 *
 * The family's dated capital is per ACCOUNT rather than per instrument, so it
 * is filed under the section its own holdings sit in. Measured on this book,
 * every one of the eleven funded accounts resolves to exactly ONE section on
 * each of the three axes — but "measured today" is not "true by construction",
 * so a mixed account is NAMED rather than filed under whichever key happened to
 * come first.
 */
import { isAssetClass, type Account, type Position } from "./types";
import { accountIndex } from "./accounts";
import { UNSTATED_BUCKET } from "./analytics";
import { groupKeyFor, groupOrdFor, type GroupAxis } from "./groupAxis";
import type { Classifiable } from "./familyTaxonomy";
import { acctKey } from "./txnRollup";

/**
 * Where a dated record goes when nothing this book carries says what the
 * instrument is. Its own section, with its own reason on screen — never folded
 * into a real one.
 *
 * IT IS `holdingBucket`'S OWN CONSTANT, re-exported rather than re-typed: the
 * category axis reaches this key through that function, and a second spelling
 * would draw two sections that mean the same thing the first time either was
 * edited.
 */
export const TXN_UNSECTIONED = UNSTATED_BUCKET;

export const TXN_UNSECTIONED_WHY =
  "The statement that reports these movements does not say what the instrument is, and no holding in this book "
  + "carries the same security in the same account to take a classification from. They are listed here rather "
  + "than filed under a class nobody stated.";

/** What `sectionsFor` needs off a dated trade — the tape's own fields, no more. */
export type SectionableTxn = {
  provider: string;
  accountNo: string;
  securityKey: string;
  assetClass: string | null;
};

export type TxnSections = {
  /** The section a trade belongs in, on the chosen axis. */
  forTxn: (axis: GroupAxis, t: SectionableTxn) => string;
  /** The section an ACCOUNT's own capital record belongs in. */
  forAccount: (axis: GroupAxis, accountId: string) => string;
};

/**
 * Build the join once for a set of accounts and positions.
 *
 * Takes them as arguments rather than reading the book, the seam every other
 * helper here uses, so the arithmetic can be exercised against a fixture.
 */
export function sectionsFor(accounts: Account[], positions: Position[]): TxnSections {
  const idx = accountIndex(accounts);
  const byPA = new Map(accounts.map((a) => [acctKey(a.provider, a.accountNo), a]));
  // The book's own class for a (account, security) pair, which is what fills an
  // asset class the statement left unstated. Keyed on two identifiers; there is
  // deliberately no name tier.
  const classOf = new Map<string, string>();
  const byAccount = new Map<string, Position[]>();
  for (const p of positions) {
    classOf.set(`${p.accountId}|${p.securityKey}`, p.assetClass);
    (byAccount.get(p.accountId) ?? byAccount.set(p.accountId, []).get(p.accountId)!).push(p);
  }

  const forTxn = (axis: GroupAxis, t: SectionableTxn): string => {
    const acc = byPA.get(acctKey(t.provider, t.accountNo));
    if (!acc) return TXN_UNSECTIONED;
    const accountId = acc.accountId;
    const stated = t.assetClass ?? classOf.get(`${accountId}|${t.securityKey}`) ?? null;
    /**
     * A CLASS THIS MODEL DOES NOT CARRY IS AS ABSENT AS NO CLASS AT ALL, AND
     * ABSENT IS PASSED THROUGH RATHER THAN SHORT-CIRCUITED HERE.
     *
     * The tape's `assetClass` is whatever the statement printed, so it is
     * checked against the model's own list rather than cast into it — a string
     * nobody here recognises would otherwise become a section heading of its
     * own, which is a classification invented in the presentation layer.
     *
     * Returning early on a null was the first cut and it was WRONG, measured on
     * this book: 20 of the 22 unstated rows are inside a PMS MANDATE, where the
     * class decides nothing — `holdingBucket` answers on the engagement alone
     * and both family axes key a mandate on its ACCOUNT — so Carnelian Bespoke
     * Portfolio was drawn twice, once under PMS mandates and once under a
     * heading saying nothing knew what it was. `groupKeyFor` already answers
     * correctly for a null; letting it is the fix.
     */
    const assetClass = isAssetClass(stated) ? stated : null;
    const what: Classifiable = { assetClass, securityKey: t.securityKey, accountId };
    return groupKeyFor(axis, idx, what);
  };

  const forAccount = (axis: GroupAxis, accountId: string): string => {
    const all = byAccount.get(accountId) ?? [];
    /**
     * AN ACCOUNT THAT HOLDS NO VALUED POSITION IS STILL AN AIF ON THE CATEGORY
     * AXIS, WHEN ITS OWN STATEMENT SAYS SO.
     *
     * Stage 10bw put a drawdown fund's dated CALLS on this table for the
     * accounts that publish no capital record — India SME's three folios and
     * Sky Capital's four among them — and none of those seven carries a
     * position, because no statement values them. Left to the holdings they
     * would all file under "not classified", on a page whose Category axis the
     * family read them on as AIFs. The ACCOUNT's engagement is the statement's
     * own wording (`Category I Alternative Investment Fund – Angel Fund`,
     * `Category II AIF - drawdown…`), never defaulted, so it answers the
     * CATEGORY question — and only that one: which basket or family asset
     * class a fund belongs to is the family's review, keyed on a product this
     * book holds no row for, so those two axes still say it is not stated.
     */
    if (!all.length) {
      if (axis === "category" && idx.get(accountId)?.engagement === "AIF") {
        return groupKeyFor(axis, idx, { assetClass: "AIF", securityKey: "", accountId });
      }
      return TXN_UNSECTIONED;
    }
    /**
     * A LINE THAT HOLDS NOTHING IS NOT WHERE THE MONEY WENT.
     *
     * Buoyant's two folios each carry an empty cash sleeve — a MEASURED ₹0 —
     * beside the fund units their deposits bought. Counted, it made both
     * accounts "mixed" on every axis, and their payments were filed under the
     * heading that says no statement stated what the instrument is: false of a
     * fund whose own statement names the class each payment bought. So a ₹0 line
     * is set aside where the account holds something else, and ONLY there: an
     * account holding nothing but ₹0 lines — 3P, redeemed to nil — is still
     * filed under what it held, which is where its money went. The zero is not
     * altered or summed anywhere; it simply decides no section.
     */
    const held = all.filter((p) => p.marketValue !== 0);
    const keys = new Set((held.length ? held : all).map((p) => groupKeyFor(axis, idx, p)));
    // A MIXED ACCOUNT IS NAMED, NOT FILED UNDER ITS FIRST KEY. No funded account
    // in this book is mixed on any axis once an empty line is set aside —
    // measured, all thirteen resolve to one, and `txnAxis.test.ts` holds the
    // book to that — and an account that holds nothing at all is filed only
    // where its own statement names what it is (above).
    return keys.size === 1 ? [...keys][0] : TXN_UNSECTIONED;
  };

  return { forTxn, forAccount };
}

/**
 * Sections in the axis's own reading order, with the unstated one always last.
 *
 * `groupOrdFor` is what the Holdings table orders on, so the two pages cannot
 * draw the same sections in different orders. `TXN_UNSECTIONED` belongs to
 * neither axis's order, so it falls through that function's own `i < 0` branch
 * and sorts last — which is where an absence goes on every other table here.
 */
export function orderSections(axis: GroupAxis, keys: Iterable<string>): string[] {
  const ord = groupOrdFor(axis);
  return [...new Set(keys)].sort((a, b) => ord(a) - ord(b) || a.localeCompare(b));
}
