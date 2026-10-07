// Types for shared/aifCategory.mjs — the SEBI category an AIF's own statements
// print, and which side of the listed/private split that puts a holding on.
//
// Implementation is plain JS in shared/ so the Node ingest (`build-book`, which
// GENERATES the split) and the browser app (which sections the AIF drill-down
// on the same read) resolve it with identical code. A second copy would be a
// second taxonomy — see the long note there.
//
// WITHOUT THIS FILE `tsc -b` FAILS THE WHOLE BUILD ON TS7016, which
// `test:family` would not catch because it bundles with esbuild and does not
// typecheck. `shared/indices.d.ts` records the same trap.

export declare const CATEGORY_I: "Category I";
export declare const CATEGORY_II: "Category II";
export declare const CATEGORY_III: "Category III";

export type AifCategory = "Category I" | "Category II" | "Category III";

/** The SEBI categories in reading order. */
export declare const AIF_CATEGORIES: readonly AifCategory[];

/** EVERY category a piece of text names — `Category I/II` yields both. */
export declare function categoriesNamedIn(text: string | null | undefined): AifCategory[];

/** The shape `readAifCategory` needs of an account. A real `Account` satisfies it. */
export type CategoryAccount = {
  providerEngagement?: string | null;
  strategy?: string | null;
  provider?: string | null;
};

/** What the two printed fields say, and why there is no category where there is none. */
export type AifCategoryRead = {
  /** The category, where exactly one is named and the two sources agree. */
  category: AifCategory | null;
  /** Everything the security name named. */
  fromSecurity: AifCategory[];
  /** Everything the account's own engagement wording named. */
  fromEngagement: AifCategory[];
  /**
   *   `ambiguous`  — the statement names more than one and commits to neither.
   *   `conflict`   — the two printed fields name DIFFERENT single categories.
   *   `unstated`   — neither field names one at all.
   */
  why: "ambiguous" | "conflict" | "unstated" | null;
  /**
   * Where the category came from: a STATEMENT printed it, or the FAMILY
   * declared it for a fund whose statements print none. Null where there is no
   * category.
   */
  source: "statement" | "family" | null;
};

/** One family declaration of a fund's SEBI category. */
export type DeclaredAifCategory = {
  category: AifCategory;
  source: "family";
  declaredOn: string;
  /** What in the archive agrees with it, in words — null where nothing does. */
  corroboration: string | null;
};

/** The family's declared categories, keyed on `securityKey`. Fills a gap only. */
export declare const DECLARED_AIF_CATEGORY: Readonly<Record<string, DeclaredAifCategory>>;

/** The family's declared category for one fund, where there is one. */
export declare function declaredAifCategory(securityKey: string | null | undefined): DeclaredAifCategory | null;

/** Whether the paperwork calls this fund a private-equity or venture vehicle. */
export declare function readsAsPrivateEquity(
  security: string | null | undefined,
  account: CategoryAccount | null | undefined,
): boolean;

/** The category of one holding, from the security name and the account's wording. */
export declare function readAifCategory(
  security: string | null | undefined,
  account: CategoryAccount | null | undefined,
  securityKey?: string | null,
): AifCategoryRead;

/** Which side of the book a holding sits on. `null` = no statement places it. */
export type MarketSide = "listed" | "private";

/** The shape `marketSideOf` needs of a position. A real `Position` satisfies it. */
export type SidePosition = { assetClass: string; security: string; securityKey?: string | null; review?: boolean };

export declare function marketSideOf(
  position: SidePosition,
  account: CategoryAccount | null | undefined,
): MarketSide | null;

/**
 * One fund the family have placed themselves — what it invests in, in their
 * words, and when they said it. Matched on the fund's own name.
 */
export type FamilyMarketDecision = {
  fund: string;
  match: RegExp;
  side: MarketSide;
  invests: string;
  said: string;
};

/** The family's own classification of the funds they hold, by what each invests in. */
export declare const FAMILY_MARKET_SIDE: readonly FamilyMarketDecision[];

/** The family's placing of one fund, or null where they have not named it. */
export declare function familyMarketDecision(
  name: string | null | undefined,
  account: CategoryAccount | null | undefined,
): FamilyMarketDecision | null;

/** Why a fund is on the side it is on. */
export type MarketSideBasis = "family" | "private-equity" | "category" | "unstated";

export type FundMarketSide = {
  side: MarketSide | null;
  basis: MarketSideBasis;
  decision: FamilyMarketDecision | null;
  /**
   * The fund's SEBI category, whether or not it decided — as the statement
   * prints it, or where it prints none, as the family declared it
   * (`DECLARED_AIF_CATEGORY`, which only ever fills that gap).
   */
  category: AifCategory | null;
};

/** The side of one AIF from its own name — for a capital account with no position. */
export declare function fundMarketSideOf(
  name: string | null | undefined,
  account: CategoryAccount | null | undefined,
  securityKey?: string | null,
): MarketSide | null;

/** The side and the reason for it. */
export declare function fundMarketSideBasis(
  name: string | null | undefined,
  account: CategoryAccount | null | undefined,
  securityKey?: string | null,
): FundMarketSide;

/** What `marketSide === null` means, in words. */
export declare const MARKET_SIDE_UNPLACED: string;
