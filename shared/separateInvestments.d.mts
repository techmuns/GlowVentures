// Types for shared/separateInvestments.mjs — the pairs of matching holdings the
// family has confirmed are separate investments, so every figure counts both.
//
// Implementation is plain JS in shared/ so the ingest (`reconcile.mjs`), the
// book build, `replay:dedupe` and the suites read one table.
//
// WITHOUT THIS FILE `tsc -b` FAILS THE WHOLE BUILD ON TS7016, which
// `test:family` would not catch because it bundles with esbuild and does not
// typecheck. `shared/aifCategory.d.mts` records the same trap.

/** One account, named by its provider and the number its statement prints. */
export type NamedAccount = { provider: string; accountNo: string };

export type SeparateInvestment = {
  /** The holding's identity in this book. A drifted key matches nothing. */
  securityKey: string;
  /** Every account whose holding of it is its own investment. */
  accounts: NamedAccount[];
  /** Income-only folios reporting the same holdings' distributions. */
  incomeFolios: NamedAccount[];
  /** The date the family gave the answer, ISO. */
  confirmed: string;
};

export declare const SEPARATE_INVESTMENTS: readonly SeparateInvestment[];

export declare function sameAccount(a: NamedAccount, b: NamedAccount): boolean;

/** The decision covering EVERY account given, or null. */
export declare function separateInvestmentFor(
  securityKey: string,
  accounts: readonly NamedAccount[],
  decisions?: readonly SeparateInvestment[],
): SeparateInvestment | null;

/** The same, for income-only folios. */
export declare function separateIncomeFor(
  accounts: readonly NamedAccount[],
  decisions?: readonly SeparateInvestment[],
): SeparateInvestment | null;
