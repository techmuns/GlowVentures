// Types for shared/keptUnvalued.mjs — the statement rows the family have
// decided to keep unvalued, so the book's reason for each says so.
//
// Implementation is plain JS in shared/ so `build-book` and the suite read one
// table.
//
// WITHOUT THIS FILE `tsc -b` FAILS THE WHOLE BUILD ON TS7016, which
// `test:family` would not catch because it bundles with esbuild and does not
// typecheck. `shared/separateInvestments.d.mts` records the same trap.

export type KeptUnvalued = {
  /** The account's provider, as its statement prints it. */
  provider: string;
  /** The account number the statement prints. */
  accountNo: string;
  /** The row's ISIN — never a name. */
  isin: string;
  /** The date the family gave the answer, ISO. */
  decided: string;
  /** The family's own words. */
  words: string;
  /** What the statement itself says about the row, as a clause after "the … statement of <date>". */
  why: string;
  cite: { docKey: string; text: string[] };
};

export declare const KEPT_UNVALUED: readonly KeptUnvalued[];

/** The family's decision for one statement row, or null. */
export declare function keptUnvaluedFor(row: { provider: string; accountNo: string; isin: string | null | undefined }): KeptUnvalued | null;

/**
 * The reason a kept-unvalued row carries: the statement's own fact, then the
 * family's decision. The quantity is on the line's face, so it is not repeated.
 */
export declare function keptUnvaluedReason(d: KeptUnvalued, asOf: string): string;
