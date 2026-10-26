export type FundUnitAction = { oldIsin: string; newIsin: string; exDate: string; factor: number; sources: string[] };
export type FundUnitAdjustment = { isin: string; quantity: number; asOf: string; through: string; factor: number };
export const FUND_UNIT_ACTIONS: readonly FundUnitAction[];
export function fundUnitBasis(isin: string, asOf: string | null | undefined, through: string, actions?: readonly FundUnitAction[]): { isin: string; factor: number; actions: FundUnitAction[]; reason: string | null };
export function fundPricingIsin(isin: string, through: string): string;
export function acquisitionIdentity<T extends { isin?: string | null; quantity?: number | null; fundUnitAdjustment?: FundUnitAdjustment }>(position: T): T;
