export type FundUnitAction = { oldIsin: string; newIsin: string; exDate: string; factor: number; sources: string[] };
export type FundUnitAdjustment = { isin: string; quantity: number; asOf: string; through: string; factor: number };
export const FUND_UNIT_ACTIONS: readonly FundUnitAction[];
export function fundUnitBasis(isin: string, asOf: string | null | undefined, through: string, actions?: readonly FundUnitAction[]): { isin: string; factor: number; actions: FundUnitAction[]; reason: string | null };
export function fundPricingIsin(isin: string, through: string): string;
export function fundIdentityDisagrees(left: string | null, right: string | null, through: string): boolean;
export function heldEtfCoverageGaps<T extends { key: string; bookIsin?: string | null; pricingIsin?: string | null; assetClass?: string | null; holds: boolean }>(wanted: T[], priced: { securityKey: string; usableForValue: boolean }[], schemeRecords: { isin?: string; pricingIsin?: string; securityKey?: string; category?: string | null }[]): T[];
export function acquisitionIdentity<T extends { isin?: string | null; quantity?: number | null; fundUnitAdjustment?: FundUnitAdjustment }>(position: T): T;
