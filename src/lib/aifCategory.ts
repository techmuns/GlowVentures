// ── WHICH SEBI CATEGORY AN AIF IS, TAKEN FROM WHAT THE STATEMENT PRINTS ─────
//
//   "when you're drilling down in the AIF ना नवल, make it cat one, cat two, cat
//    three … क्योंकि there are only three categories. तो आप वहीं पर drill down
//    करने पर फिर उसको club कर दो कि these are cat two AIFs, these are cat three
//    AIFs, this is cat one AIF."
//
// SEBI has three categories, and the family are right that every AIF is in one
// of them. **THIS BOOK DOES NOT KNOW WHICH FOR EVERY FUND**, and those are
// different facts: the first is about the regulation, the second is about the
// paperwork in `source/`. Filing a fund under a category no document states
// would be a fabricated classification — `VAL_METHODS[i % 5]` assigning "DCF"
// by row order, arriving through a section heading, and a heading looks exactly
// as authoritative whichever rows sit under it.
//
// ── SO IT IS READ, NEVER INFERRED, AND THERE ARE TWO PLACES IT IS PRINTED ───
//
// Both are the statement's own words, with the standing `providerSector` and
// `providerEngagement` already have in this model:
//
//   • THE SECURITY NAME, which names the FUND —
//       `Sanshi Fund-I (Open Ended AIF CAT-III) — Class E`
//       `BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A4`
//       `360 ONE SPECIAL OPPORTUNITIES FUND … (AIF CATEGORY II)`
//   • `Account.providerEngagement`, which describes the ACCOUNT —
//       `Category II AIF - drawdown, with a commitment and called capital`
//       `Category I Alternative Investment Fund – Angel Fund`
//
// Neither is preferred over the other. WHERE BOTH SPEAK THEY MUST AGREE, and a
// disagreement leaves the holding UNSTATED rather than letting either side win
// silently — the rule `build-symbols` already applies to its ISIN tier, where
// adding a second identifier makes the match stricter rather than looser.
// Measured over this book that check fires ZERO times, and it is reported at
// zero for the reason this repo keeps naming: a guard that only speaks when it
// fires is indistinguishable, on a clean run, from one that was deleted.
//
// ── A PHRASE NAMING TWO CATEGORIES RESOLVES TO NEITHER ──────────────────────
//
// Transition Venture Capital's account reads **`Category I/II AIF — drawdown`**.
// That is the issuer declining to commit, and picking one of the two would be
// this book inventing the answer the document withheld. It yields both, the
// caller sees a set of size two, and the holding is filed as not stated — with
// its own wording, because "the statement names two categories" and "the
// statement names none" send a reader to different documents.
import type { Position } from "./types";
import type { Account } from "./types";
import { engagementOf, type AccountIndex } from "./accounts";
import { isMandateHeld } from "./analytics";

export const CATEGORY_I = "Category I";
export const CATEGORY_II = "Category II";
export const CATEGORY_III = "Category III";

/** Reading order: the SEBI categories in order, then what is not stated. */
export const AIF_CATEGORIES = [CATEGORY_I, CATEGORY_II, CATEGORY_III] as const;
export type AifCategory = (typeof AIF_CATEGORIES)[number];

/**
 * EVERY CATEGORY A PIECE OF TEXT NAMES, not the first one.
 *
 * `Category I/II` has to come back as BOTH or the ambiguity is lost at the
 * first step and can never be recovered. The pattern is anchored on the word so
 * a `Class A2` or a `Series II` cannot be read as a category: `\bcat` requires
 * the word, and the numeral must follow it.
 *
 * ── TWO THINGS STOP `III` BEING READ AS `I`, AND ONLY ONE IS LOAD-BEARING ──
 *
 * Reading `CAT-III` as Category I would file ₹297.78 Cr — 84% of this book's
 * AIF row — under the wrong heading, silently. Two things prevent it and the
 * first draft of this comment credited the wrong one, which is the
 * comment-asserting-an-enforcement-that-never-happens failure this repo names:
 *
 *   • THE TRAILING `\b` — the real guard. Matching `I` out of `III` leaves
 *     `II` after it, and a word boundary between two word characters fails, so
 *     the engine backtracks to `III`. **Measured: with it, BOTH alternation
 *     orders read `CAT-III` correctly; without it, `I|II|III` reads it as `I`.**
 *   • the alternation ordered longest-first, which is the backup and is what
 *     would carry it if the boundary were ever loosened.
 *
 * Either alone is sufficient here, so the suite asserts BOTH variants rather
 * than only the one this file happens to use.
 */
export function categoriesNamedIn(text: string | null | undefined): AifCategory[] {
  if (!text) return [];
  const out = new Set<AifCategory>();
  // `cat`/`category`, any dash or space, then one or more numerals separated by
  // slashes — `Category I/II`, `CAT-III`, `Category 2`.
  for (const m of text.matchAll(/\b(?:categor(?:y|ies)|cat)[\s‐-―-]*((?:III|II|I|[123])(?:\s*\/\s*(?:III|II|I|[123]))*)\b/gi)) {
    for (const part of m[1].split("/")) {
      const t = part.trim().toUpperCase();
      const c = t === "I" || t === "1" ? CATEGORY_I
        : t === "II" || t === "2" ? CATEGORY_II
        : t === "III" || t === "3" ? CATEGORY_III : null;
      if (c) out.add(c);
    }
  }
  return AIF_CATEGORIES.filter((c) => out.has(c));
}

/** What the two printed fields say, and whether they agree. */
export type AifCategoryRead = {
  /** The category, where exactly one is named and the two sources agree. */
  category: AifCategory | null;
  /** Everything the security name named. */
  fromSecurity: AifCategory[];
  /** Everything the account's own engagement wording named. */
  fromEngagement: AifCategory[];
  /**
   * Why there is no category. `null` where there is one.
   *   `ambiguous`  — the statement names more than one and commits to neither.
   *   `conflict`   — the two printed fields name DIFFERENT single categories.
   *   `unstated`   — neither field names one at all.
   */
  why: "ambiguous" | "conflict" | "unstated" | null;
};

/**
 * THE CATEGORY OF ONE HOLDING, from the security name and the account's own
 * engagement wording. Takes the `Account` rather than an index so it can be
 * called with either; `aifCategoryOf` below is the one that takes the index.
 */
export function readAifCategory(p: Pick<Position, "security">, account: Account | undefined): AifCategoryRead {
  const fromSecurity = categoriesNamedIn(p.security);
  const fromEngagement = categoriesNamedIn(account?.providerEngagement);
  const union = AIF_CATEGORIES.filter((c) => fromSecurity.includes(c) || fromEngagement.includes(c));

  if (union.length === 0) return { category: null, fromSecurity, fromEngagement, why: "unstated" };
  if (union.length > 1) {
    // TWO SOURCES NAMING DIFFERENT SINGLE CATEGORIES IS NOT THE SAME FAULT as
    // one source naming two. The first says the paperwork disagrees with itself
    // and someone must decide; the second says the issuer never committed.
    const conflict = fromSecurity.length === 1 && fromEngagement.length === 1 && fromSecurity[0] !== fromEngagement[0];
    return { category: null, fromSecurity, fromEngagement, why: conflict ? "conflict" : "ambiguous" };
  }
  return { category: union[0], fromSecurity, fromEngagement, why: null };
}

/** The same read, given the account index every page already holds. */
export const aifCategoryOf = (idx: AccountIndex, p: Position): AifCategoryRead =>
  readAifCategory(p, idx.get(p.accountId));

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
//      engagement: `Category I/II AIF — drawdown`
//
// Both name the discipline in the FUND'S OWN NAME, which is the strongest
// evidence available and is why the name is matched at all. Nothing is inferred
// from a fund being a drawdown vehicle: this book holds five drawdown AIFs, and
// calling all of them private equity would file an infrastructure income fund
// and a listed-equity growth fund under a discipline neither claims.
export const PRIVATE_EQUITY_SECTION = "Private Equity";

/**
 * The phrases that make a fund a private-equity or venture vehicle, matched
 * against the FUND'S OWN NAME and its account's engagement wording.
 *
 * DELIBERATELY NARROW, and every entry is a phrase an issuer prints about
 * ITSELF. `\bventure capital\b` and not `venture`, because "Venture" appears in
 * ordinary company names; `private equity` as the whole phrase. There is no
 * fuzzy tier here for the reason `shared/nameMatch.mjs` records at length — a
 * token-overlap rule on this corpus matched `KIRANAKART TECHNOLOGIES` to `TATA
 * TECHNOLOGIES` — and a near miss is listed for a human rather than committed.
 */
const PE_PHRASES = [
  /\bprivate equity\b/i,
  /\bventure capital\b/i,
  /\bgrowth equity\b/i,
  /\bbuyout\b/i,
];

/** Whether the paperwork calls this fund a private-equity or venture vehicle. */
export function readsAsPrivateEquity(p: Pick<Position, "security">, account: Account | undefined): boolean {
  const hay = [p.security, account?.providerEngagement, account?.strategy, account?.provider]
    .filter(Boolean).join(" · ");
  return PE_PHRASES.some((re) => re.test(hay));
}

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
    // off. That is the same reason Private Market scopes its own unvalued list
    // this way and not on `isPrivateClass`.
    if (a.engagement !== "AIF") continue;
    if (positionsByAccount.has(a.accountId)) continue;
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
