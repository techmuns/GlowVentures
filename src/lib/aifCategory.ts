// ── WHICH SEBI CATEGORY AN AIF IS — THE BROWSER'S DOOR TO THE SHARED READ ───
//
// The read itself lives in `shared/aifCategory.mjs` so `build-book` and this
// app answer the question with the SAME code: the listed/private split is
// GENERATED and the AIF drill-down's sections are rendered, and a second copy
// of the rule on either side would be a second taxonomy. That is the standing
// `shared/sectors.mjs` already has, one map over.
//
// Nothing here infers a category. What this file adds is the shapes this app
// holds — a `Position` plus the `AccountIndex` every page already carries — and
// the sectioning the AIF drill-down draws.
import type { Position } from "./types";
import type { Account } from "./types";
import { engagementOf, type AccountIndex } from "./accounts";
import { isMandateHeld } from "./analytics";
import { isMeasuredNilAccount } from "./navSeries";
import {
  CATEGORY_I, CATEGORY_II, CATEGORY_III, AIF_CATEGORIES,
  categoriesNamedIn, readAifCategory as readAifCategoryText,
  DECLARED_AIF_CATEGORY, declaredAifCategory,
  readsAsPrivateEquity as readsAsPrivateEquityText,
  marketSideOf as marketSideOfText,
  MARKET_SIDE_UNPLACED,
  FAMILY_MARKET_SIDE, familyMarketDecision, fundMarketSideOf, fundMarketSideBasis,
  type AifCategory, type AifCategoryRead, type MarketSide,
  type FamilyMarketDecision, type FundMarketSide, type MarketSideBasis,
} from "../../shared/aifCategory.mjs";

export {
  CATEGORY_I, CATEGORY_II, CATEGORY_III, AIF_CATEGORIES,
  categoriesNamedIn, MARKET_SIDE_UNPLACED, DECLARED_AIF_CATEGORY, declaredAifCategory,
  // THE FAMILY'S OWN PLACING OF A FUND, and the fund-level read built on it —
  // re-exported rather than re-written, so a capital account on the Private
  // Market page and a holding in the book are placed by one rule.
  FAMILY_MARKET_SIDE, familyMarketDecision, fundMarketSideOf, fundMarketSideBasis,
};
export type { AifCategory, AifCategoryRead, MarketSide, FamilyMarketDecision, FundMarketSide, MarketSideBasis };

/**
 * THE CATEGORY OF ONE HOLDING, given the shapes this app holds.
 *
 * Takes the `Account` rather than an index so it can be called with either;
 * `aifCategoryOf` below is the one that takes the index.
 */
export const readAifCategory = (p: Pick<Position, "security"> & { securityKey?: string }, account: Account | undefined): AifCategoryRead =>
  readAifCategoryText(p.security, account, p.securityKey);

/** The same read, given the account index every page already holds. */
export const aifCategoryOf = (idx: AccountIndex, p: Position): AifCategoryRead =>
  readAifCategoryText(p.security, idx.get(p.accountId), p.securityKey);

/**
 * WHICH SIDE OF THE BOOK A HOLDING SITS ON, derived live.
 *
 * `Position.marketSide` is the GENERATED answer and is what every total reads —
 * this is the same function on the same inputs, for a caller that has the index
 * to hand and wants it without a round trip through the book. The two cannot
 * disagree, because they are one function; `marketSide.test.ts` asserts it on
 * every row rather than trusting that sentence.
 */
export const marketSideOf = (idx: AccountIndex, p: Position): MarketSide | null =>
  marketSideOfText(p, idx.get(p.accountId));

// ── PRIVATE EQUITY, WHICH IS A SECTION AND NOT A CATEGORY ───────────────────
//
//   "Similarly for Private equity also, we will have some private equity fund
//    also. So either you create one more line item here. I think that'll be
//    better if there is PE funds. Just create another private equity fund line
//    item."
//
// A private-equity fund IS an AIF — Category I or II under SEBI — so PE and the
// category axis overlap by construction and the family were offered the choice
// in those terms. They asked for the separate line, so `PRIVATE_EQUITY_SECTION`
// takes PRECEDENCE over the category when a holding is filed, and the row still
// prints the category the statement gave it. The sections then partition: every
// AIF holding is in exactly one, and nothing is counted twice.
//
// ── AND IT IS READ FROM THE STATEMENT, ON THE SAME TERMS AS THE CATEGORY ────
//
// "Is this a private equity fund" is a judgement about what a manager does, and
// this book does not make those. It is taken from the words the paperwork
// prints, and on this book exactly two valued holdings carry them:
//
//   `Baring Private Equity India Fund 6 — Class A1`
//      engagement: `Category II AIF — drawdown private equity fund`
//   `Transition Venture Capital Fund I — Class A1`
//      engagement: `drawdown fund — … the statement prints a blank SEBI
//      registration line` (its reader used to hard-code `Category I/II`,
//      which neither statement prints; the figure audit removed it)
//
// Both name the discipline in the FUND'S OWN NAME, which is the strongest
// evidence available and is why the name is matched at all. Nothing is inferred
// from a fund being a drawdown vehicle: this book holds five drawdown AIFs, and
// calling all of them private equity would file an infrastructure income fund
// and a listed-equity growth fund under a discipline neither claims.
export const PRIVATE_EQUITY_SECTION = "Private Equity";

/** Whether the paperwork calls this fund a private-equity or venture vehicle. */
export const readsAsPrivateEquity = (p: Pick<Position, "security">, account: Account | undefined): boolean =>
  readsAsPrivateEquityText(p.security, account);

/**
 * ── THE SECTION ONE AIF HOLDING SITS IN, inside the AIF drill-down ──────────
 *
 * Private Equity first, then the SEBI category, then what is not stated. That
 * order IS the family's answer to the overlap, and it is why the sections
 * partition rather than double-counting a Category II fund that is also PE.
 *
 * Scoped to holdings whose own asset class is AIF: a share a PMS mandate holds
 * is not an AIF however the mandate is described, and `isMandateHeld` is what
 * this site uses to tell those apart.
 */
export const AIF_UNSTATED_SECTION = "Category not stated";

export function aifSectionOf(idx: AccountIndex, p: Position): string {
  const account = idx.get(p.accountId);
  if (readsAsPrivateEquity(p, account)) return PRIVATE_EQUITY_SECTION;
  return readAifCategory(p, account).category ?? AIF_UNSTATED_SECTION;
}

/** Reading order: the three categories, then private equity, then unstated. */
export const AIF_SECTION_ORDER = [
  CATEGORY_I, CATEGORY_II, CATEGORY_III, PRIVATE_EQUITY_SECTION, AIF_UNSTATED_SECTION,
];
export const aifSectionOrd = (s: string) => {
  const i = AIF_SECTION_ORDER.indexOf(s);
  return i < 0 ? AIF_SECTION_ORDER.length : i;
};

/** Whether this holding is one the AIF sectioning applies to. */
export const isAifHolding = (idx: AccountIndex, p: Position) =>
  p.assetClass === "AIF" && !isMandateHeld(engagementOf(idx, p) || null);

/**
 * WHY A HOLDING HAS NO CATEGORY, in words, for the row that renders a dash.
 * Every branch names a DIFFERENT next step, which is the whole reason the read
 * carries `why` rather than a boolean.
 */
export function aifCategoryWhy(r: AifCategoryRead): string {
  if (r.why === "ambiguous") {
    const named = [...new Set([...r.fromSecurity, ...r.fromEngagement])].join(" and ");
    return `the statement names ${named} and commits to neither, so this book does not pick one — the fund's own contribution agreement or its SEBI registration would settle it`;
  }
  if (r.why === "conflict") {
    return `the fund's name says ${r.fromSecurity.join("/")} and the account's own wording says ${r.fromEngagement.join("/")} — the two printed fields disagree, so neither is used`;
  }
  return "no statement for this account prints a SEBI category, in the fund's name or in its own description of the account";
}

/**
 * ── WHY AN AIF ACCOUNT HOLDS NOTHING — ONE CLASSIFIER, READ BY BOTH PAGES ────
 *
 * An account can hold no valued position for four different reasons, and a
 * reader acts differently on each — only one of them is money this book cannot
 * value:
 *
 *   no-nav       the fund publishes no NAV: its statement carries units and the
 *                capital drawn against a commitment, and no valuation
 *   income-only  the folio's documents report earnings and distributions; its
 *                units are valued under ANOTHER account (the reason says so)
 *   redeemed     the balance is nil — a measurement, not a gap
 *   other        anything else, which is named by its own reason
 *
 * Read off `Account.noPositionsReason`, the book's own sentence for the account
 * (`build-book` writes it), and never re-worded here. It lived in
 * `privateMarket.ts` for the Private Market page alone, while the AIF
 * drill-down kept a second answer of its own — every AIF account holding
 * nothing — and the two pages disagreed about one set of folios (10 on the
 * drill-down, 9 on Private Market, 7 in truth). It is here now because both
 * read it: `privateMarket.ts` imports this file, and this file cannot import it
 * back without a cycle.
 *
 * AND "REDEEMED" IS `isMeasuredNilAccount`, NOT A SECOND TEST OF ITS OWN. That
 * predicate reads the clause `build-book` writes on an account whose statement
 * struck a nil balance, and `navCard.test.ts` ties it to its generator. This
 * matched the bare word "redeemed" instead, which agrees on this book (two
 * accounts both ways) and would file any other reason that happens to say the
 * word as a measured nil — so the NAV card and this page could have called one
 * account two things.
 */
export type UnvaluedKind = "no-nav" | "income-only" | "redeemed" | "other";

export function unvaluedKindOf(reason: string | null | undefined): UnvaluedKind {
  const r = reason ?? "";
  if (/publishes no NAV/i.test(r)) return "no-nav";
  if (/report income and distribution/i.test(r)) return "income-only";
  if (isMeasuredNilAccount({ noPositionsReason: r })) return "redeemed";
  return "other";
}

/**
 * ── HELD, AND VALUED BY NO STATEMENT — THE ONE DEFINITION ──────────────────
 *
 * An account whose fund publishes no NAV: it holds units, bought with capital
 * the family paid in, and nothing in the book values them. That is the set the
 * AIF drill-down names under its table and Private Market draws in its closed
 * "Not valued" section — ONE predicate, so the two cannot list different
 * folios. The other three kinds are not in it: an income-only folio's units ARE
 * valued, under the account its reason names; a redeemed account holds nothing
 * to value; and an unrecognised reason is not a claim that units are held.
 */
export const isValuedByNoStatement = (a: Pick<Account, "noPositionsReason">): boolean =>
  unvaluedKindOf(a.noPositionsReason) === "no-nav";

/**
 * ── THE FOLIOS THAT PUBLISH NO NAV, BY THE SAME AXIS ────────────────────────
 *
 * The family expect to see all three categories — *"these are cat two AIFs,
 * these are cat three AIFs, this is cat one AIF"* — and on this book a holdings
 * table can only ever draw two of them. **Every Category I AIF the family owns
 * is an angel fund that publishes no NAV**: Sky Capital's four folios report
 * units and the capital drawn against a commitment and no valuation anywhere,
 * so they carry no valued position and stand in no holdings table on this site.
 *
 * Drawn silently that reads as *the family holds no Category I AIF*, which is
 * false and is the opposite of what they asked to see. So the folios are NAMED
 * under the table with what they have drawn — the standing rule that a figure
 * existing for some accounts is shown for those and THE REST ARE NAMED.
 *
 * THE MONEY IS IN NO TOTAL ON THE PAGE, and must not be: a contribution is what
 * was PAID and not what the stake is WORTH, and the drill-down's own total is
 * market value. It is reported as drawn capital, under its own heading.
 *
 * ── AND ONLY THE FOLIOS THE SENTENCE IS TRUE OF ─────────────────────────────
 *
 * This listed EVERY AIF-engagement account holding nothing — ten on this book —
 * under a sentence saying each "reports units and the capital drawn against a
 * commitment and no NAV anywhere". Three of the ten were not that: 360 ONE
 * Alternates' two income-only folios are views of a holding 360 ONE Private
 * Wealth values at ₹1.47 Cr IN THE TABLE ABOVE, and Motilal Oswal's Hedged
 * Equity strategy is redeemed to nil and reports no units at all. So the list
 * is `isValuedByNoStatement` now — the definition Private Market reads too.
 */
export type UnvaluedAifFolio = {
  section: string;
  accountId: string;
  provider: string;
  accountNo: string;
  owner: string;
  /** Capital called to date, as the fund's own statement prints it. */
  drawn: number | null;
  /** Why no position stands for it. */
  reason: string | null;
};

export function unvaluedAifFolios(
  accounts: readonly Account[],
  positionsByAccount: ReadonlySet<string>,
  drawnByAccount: ReadonlyMap<string, number | null>,
): UnvaluedAifFolio[] {
  const out: UnvaluedAifFolio[] = [];
  for (const a of accounts) {
    // SCOPED BY THE ACCOUNT'S OWN ENGAGEMENT, which is the only axis available
    // here: an account holding nothing has no position to read an asset class
    // off. Private Market starts from the same engagement and then keeps the
    // private-market funds' accounts alone (Stage 10bw); on this book every
    // folio this list names is one of those, so the two surfaces list one set.
    if (a.engagement !== "AIF") continue;
    if (positionsByAccount.has(a.accountId)) continue;
    // HELD AND VALUED BY NOTHING — the one definition both pages read.
    if (!isValuedByNoStatement(a)) continue;
    const pe = readsAsPrivateEquity({ security: "" }, a);
    const cats = categoriesNamedIn(a.providerEngagement);
    const section = pe ? PRIVATE_EQUITY_SECTION
      : cats.length === 1 ? cats[0]
      : AIF_UNSTATED_SECTION;
    out.push({
      section, accountId: a.accountId, provider: a.provider, accountNo: a.accountNo,
      owner: a.owner, drawn: drawnByAccount.get(a.accountId) ?? null,
      reason: a.noPositionsReason ?? null,
    });
  }
  return out.sort((x, y) => aifSectionOrd(x.section) - aifSectionOrd(y.section) || x.provider.localeCompare(y.provider));
}
