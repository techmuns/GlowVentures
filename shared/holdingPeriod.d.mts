// Types for shared/holdingPeriod.mjs — the s.2(42A) holding-period rule,
// shared by `build-book` and the browser. See the long note there.

/** `n` calendar months after an ISO date, clamped to the month's last day. */
export declare function addMonths(date: string, n: number): string;
/** The first day a lot bought on `purchaseDate` is long-term under a `months` period: the anniversary + 1 day. */
export declare function longTermFrom(purchaseDate: string, months: number): string;
/** The date from which a debt or liquid fund's units are "specified mutual fund" units (s.50AA). */
export declare const SPECIFIED_FUND_FROM: string;

export type LongTermRule =
  | { months: number; specifiedFund: boolean; why?: undefined }
  | { months: null; why: string; specifiedFund?: undefined };
export declare function longTermRuleOf(holding: {
  assetClass?: string | null; marketSide?: string | null; isin?: string | null;
}): LongTermRule;

export declare function termSplit(
  lots: readonly { purchaseDate: string; totalCost: number }[],
  asOf: string,
  holding: { assetClass?: string | null; marketSide?: string | null; isin?: string | null },
): { stCostBasis: number | null; ltCostBasis: number | null; daysToLT: number | null; why: string | null };
