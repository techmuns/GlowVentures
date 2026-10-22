import type { Property } from "./realEstate.mjs";
import type { CanonicalOwner } from "./owners.mjs";

export type TaxGap = { short: string; reason: string };
export type OwnerGainsTax = {
  name: string; ownerId: string | null;
  /** This owner's fraction of the whole property. */
  share: number;
  /** Resident individual, Trust, Residence not recorded, … — what decides the indexation option. */
  status: string;
  /** May take the 20%-with-indexation ceiling: true, false, or null where the registry does not say. */
  eligible: boolean | null;
  holderNote: string;
  /** 12.5% without indexation, with cess, on this owner's share. */
  flatTax: number;
  /** 20% with indexation, with cess, on this owner's share; null when the indexed cost cannot be struck. */
  indexedTax: number | null;
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
  notCapitalAsset: boolean; received: boolean;
  acquiredOn: string | null; longTermFrom: string | null; longTerm: boolean | null;
  basis: number | null; basisLabel: string;
  improvements: number; improvementsCounted: number; improvementsBefore2001: number;
  /** Whole property: cost for tax including counted improvements, and the gain over it. */
  cost: number | null; gain: number | null;
  acquisitionIndex: number | null; indexedCost: number | null; indexGap: string; indexedGain: number | null;
  /** Whether the property and its dates allow the 20%-with-indexation ceiling (null: not settled from the record). */
  option: { open: boolean | null; note: string } | null;
  owners: OwnerGainsTax[];
  /** Selected owners' share. */
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