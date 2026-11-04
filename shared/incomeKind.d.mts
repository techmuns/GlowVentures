// Types for shared/incomeKind.mjs — which income events paid money. Shared by
// `build-book` (the holding's income) and `ledgerModel` (the Transactions rows)
// so the two read one row the same way.

/** Did this income event pay money? A dividend, IDCW, interest, coupon or distribution. */
export declare function isCashIncomeKind(kind: string | null | undefined): boolean;
