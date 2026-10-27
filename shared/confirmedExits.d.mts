// Types for shared/confirmedExits.mjs — the statement lines the family
// confirmed they have exited, which `build-book` retires from the held book
// once MOPWM's dated exchange sales take them to nil (Stage 10ib).
//
// Without this file `tsc -b` fails the whole build on TS7016
// (`shared/keptUnvalued.d.mts` records the same trap).

export type ConfirmedExitDecision = {
  ownerId: string;
  /** The account's provider, as its statement prints it. */
  provider: string;
  /** The account number the statement prints. */
  accountNo: string;
  /** The line's ISIN — never a name. */
  isin: string;
  /** The date the family confirmed the exit, ISO. */
  confirmed: string;
  /** The family's own words. */
  words: string;
};

export declare const CONFIRMED_EXITS: readonly ConfirmedExitDecision[];

/** The family's confirmed exit for one statement line, or null. */
export declare function confirmedExitFor(row: { provider: string; accountNo: string; isin: string | null | undefined }): ConfirmedExitDecision | null;
