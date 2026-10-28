import type { Property } from "./realEstate.mjs";
import type { CanonicalOwner } from "./owners.mjs";

export type TaxGap = { short: string; reason: string };
export type OwnerGainsTax = {
  name: string; ownerId: string | null;
  /** This owner's fraction of the whole property. */
  share: number;
  /** Resident individual, Trust, Not registered, … — what decides the indexation option. */
  status: string;
  /** May take the 20%-with-indexation option: true, false, or null where the registry does not say. */
  eligible: boolean | null;
  holderNote: string;
  /** 12.5% without indexation, with cess, on this owner's share. */
  flatTax: number;
  /** 20% with indexation, with cess, on this owner's share; null where this owner or purchase date cannot take it, or the index is missing. */
  indexedTax: number | null;
  /** The cost the settled rate uses (indexed for the 20% route), on this owner's share; null while the route is open. */
  costForTax: number | null;
  tax: number | null;
  route: "flat" | "indexed" | "none" | null;
  gap: TaxGap | null;
  note: string;
};
export type PropertyGainsTax = {
  asOf: string; fy: string; saleIndex: number | null;
  share: number | null; value: number | null;
  /** Why the selected owners' tax is not known. */
  gap: TaxGap | null;
  /** The inputs still to enter, in words ("purchase date", …). */
  needs: string[];
  notCapitalAsset: boolean; received: boolean;
  acquiredOn: string | null; longTermFrom: string | null; longTerm: boolean | null;
  /** Whole property: the cost for tax and the gain over it. */
  costLabel: string; cost: number | null; gain: number | null;
  /** Bought before 23 Jul 2024, so the 20%-with-indexation option exists. */
  indexable: boolean | null;
  acquisitionIndex: number | null; indexedCost: number | null; indexedGain: number | null; indexGap: string;
  owners: OwnerGainsTax[];
  /** Selected owners' share: the cost the tax is struck on, the gain over it, the tax and what is left. */
  costForTax: number | null; taxableGain: number | null;
  tax: number | null; afterTax: number | null;
  route: string | null;
};
export const COST_INFLATION_INDEX: Readonly<Record<string, number>>;
export const LONG_TERM_RATE: number;
export const INDEXED_RATE: number;
export const CESS: number;
export const REFORM_DATE: string;
export const INDEX_BASE_DATE: string;
export function financialYear(iso: string): string;
export function indexYear(iso: string): string;
export function longTermFrom(iso: string): string;
export function propertyGainsTax(p: Property, opts: { asOf: string; owners?: ReadonlySet<string> | null; ownerOf?: (id: string) => Pick<CanonicalOwner, "displayName" | "kind" | "residence" | "residenceEvidence"> | null }): PropertyGainsTax;
