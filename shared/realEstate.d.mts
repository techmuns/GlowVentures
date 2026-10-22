/** A capital improvement, indexed from its own year for tax. */
export type PropertyImprovement = { on: string | null; amount: number };
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
  /** Improvements after acquisition; the Cost figures add them. */
  improvements: PropertyImprovement[];
  /** Inherited or gifted: the previous owner's cost and acquisition date, which tax carries over. */
  priorCost: number | null; priorAcquiredOn: string | null;
  /** Fair market value on 1 Apr 2001, for a property held since before then. */
  fmv2001: number | null;
  /** Rural agricultural land is not a capital asset. */
  ruralAgricultural: boolean;
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
export const MAX_IMPROVEMENTS: number;
export function totalCost(p: Property): number | null;
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
