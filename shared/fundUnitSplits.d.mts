export type FundUnitSplit = {
  isin: string;
  successorIsin: string;
  scheme: string;
  symbol: string;
  factor: number;
  exDate: string;
  source: string;
};
export const FUND_UNIT_SPLITS: readonly FundUnitSplit[];
export function fundUnitSplitFor(isin: string | null | undefined): FundUnitSplit | null;
