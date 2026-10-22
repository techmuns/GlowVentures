export type PropertyOwner = { ownerId: string | null; name: string; share: number | null };
/** Who the property is meant to be gifted to. A marker only: ownership and value stay with `owners`. */
export type PropertyEarmark = { recipientId: string | null; recipient: string; note: string };
export type Property = {
  id: string; name: string; type: string; address: string; city: string; state: string; country: string; pincode: string;
  owners: PropertyOwner[]; area: number | null; areaUnit: string; areaBasis: string;
  cost: number | null; value: number | null; monthlyRent: number | null; monthlyCosts: number | null; debt: number | null;
  purchasedOn: string | null; valuationDate: string | null; leaseEnd: string | null;
  /** "Purchased", "Inherited", "Gifted", or "" when not entered. */
  acquisition: string;
  status: string; tenant: string; titleStatus: string; notes: string;
  /** null when the property is not earmarked; an older record without one reads as null. */
  earmark: PropertyEarmark | null;
  latitude: number | null; longitude: number | null; updatedAt?: string;
};
export type PropertyFigures = { share: number | null; value: number | null; cost: number | null; debt: number | null; rent: number | null; costs: number | null; equity: number | null; netRent: number | null; yield: number | null; gain: number | null; gainPct: number | null };
export const PROPERTY_TYPES: string[];
export const ACQUISITION_TYPES: string[];
export const PROPERTY_STATUSES: string[];
export const AREA_UNITS: string[];
export const TITLE_STATUSES: string[];
export const MONEY_FIELDS: string[];
export const PROPERTY_ID: RegExp;
export function validateProperty(raw: unknown): { property: Property; error?: undefined } | { error: string; property?: undefined };
export function hasPin(p: Property): boolean;
export function propertyLabel(p: Property): string;
export function receivedWithoutPurchase(p: Property): boolean;
export function costLabel(p: Property): string;
export function acquiredOnLabel(p: Property): string;
export function isEarmarked(p: Property): boolean;
export function earmarkLabel(p: Property): string;
export const EARMARK_MARKER_ONLY: string;
export function appreciationGap(p: Property): { short: string; reason: string } | null;
export function propertyShare(p: Property, owners?: ReadonlySet<string> | null): number | null;
export function wholePropertyFigures(p: Property): PropertyFigures;
export function propertyFigures(p: Property, owners?: ReadonlySet<string> | null): PropertyFigures;
export function propertyTotal(properties: readonly Property[], key: Exclude<keyof PropertyFigures, "share" | "gainPct">, owners?: ReadonlySet<string> | null): { value: number | null; known: number; count: number };
