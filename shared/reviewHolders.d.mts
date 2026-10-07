// Types for shared/reviewHolders.mjs — who holds each private-market line of the
// family's consolidated review (MOPWM, 30 Jun 2026), and where in this book it
// lives (Stage 10dh).
//
// Implementation is plain JS in shared/ so `build-book` (through
// scripts/lib/reviewBook.mjs) and the suites read one table.
//
// WITHOUT THIS FILE `tsc -b` FAILS THE WHOLE BUILD ON TS7016, which
// `test:family` would not catch because it bundles with esbuild and does not
// typecheck. `shared/separateInvestments.d.mts` records the same trap.

/** The book account each holder's line sits in, unless the entry names one. */
export declare const REVIEW_ACCOUNT_PREFIX: string;

/** The holder this table adds: the part of a line no document names a holder for. */
export declare const NOT_ATTRIBUTED: string;
export declare const NOT_ATTRIBUTED_NAME: string;

/** One holder's part of a review line. Figures in rupees. */
export type ReviewHolderSplit = {
  /** The book's ownerId, or NOT_ATTRIBUTED. */
  owner: string;
  /** The book account the holding sits in; absent means the holder's `review-<ownerId>` account. */
  account?: string;
  /** What this holder paid, where the line is split. */
  cost?: number;
  /** The review's value of this holder's part; absent means held at cost. */
  value?: number;
  /** Units, where the review or a statement prints them. */
  qty?: number;
};

export type ReviewHolderEntry = {
  line: RegExp;
  key?: string;
  name?: string;
  tab?: string;
  assetClass: string;
  atCost?: boolean;
  split: readonly ReviewHolderSplit[];
  why: string;
};

export declare const PRIVATE_INVESTMENT_HOLDERS: readonly ReviewHolderEntry[];

export declare const PRIVATE_INVESTMENT_ELSEWHERE: readonly { line: RegExp; why: string }[];

/** The PE funds, the unlisted shares and the credit line, each holder with the review's figures. */
export declare const VALUED_HOLDERS: readonly (ReviewHolderEntry & { tab: string; key: string; name: string })[];

/**
 * Statement rows the review now stands for. A window is named by its key, or by
 * the ISIN its own tape prints with `line` the review line it goes with.
 */
export declare const SUPERSEDED: readonly {
  accountId: string;
  securityKey?: string;
  isin?: string;
  line?: string;
  kind: "unvalued" | "position" | "window";
}[];

/** Where a newer statement says something different from the review's figure. */
export declare const FRESHER_STATEMENT: readonly { key: string; owner: string; text: string }[];
