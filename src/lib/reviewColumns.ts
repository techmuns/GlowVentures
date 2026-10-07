import { REVIEW_COLUMN_DATA } from "@/data/reviewColumns";
import { familyBasket } from "@/lib/familyTaxonomy";
import type { Position } from "@/lib/types";
import type { Accessor } from "@/lib/tableView";

export type ReviewField = { value: string | number | null; source: string; note?: string; sortValue?: string; precision?: string; from?: string; to?: string };
type ReviewRecord = Record<string, ReviewField>;
export type ReviewColumnData = {
  asOf: string; workbook: string;
  bySource: Record<string, ReviewRecord>; byProduct: Record<string, ReviewRecord>; bySecurity: Record<string, string>;
  byEntity: Record<string, ReviewRecord>; byCategory: Record<string, ReviewRecord>; byBasket: Record<string, ReviewRecord>; bySector: Record<string, ReviewRecord>;
};
export type ReviewKind = "holding" | "category" | "entity" | "sector";
export type ReviewScope = {
  positions?: readonly Position[]; securityKey?: string; accountId?: string; isMandate?: boolean;
  product?: string; category?: string; basket?: string; entity?: string; sector?: string;
  familySubset?: boolean;
};
type Format = "text" | "currency" | "percent" | "number";
export type ReviewColumn = { id: string; field: string; label: string; format: Format; kinds: readonly ReviewKind[] };
const H: readonly ReviewKind[] = ["holding"];
const HC: readonly ReviewKind[] = ["holding", "category"];
const column = (field: string, label: string, format: Format = "text", kinds = H): ReviewColumn => ({ id: `review:${field}`, field, label, format, kinds });
export const REVIEW_COLUMNS: readonly ReviewColumn[] = [
  column("investmentRange", "Investment date / range", "text", HC),
  column("advisor", "Adviser"), column("investors", "Review investors"), column("benchmark", "Benchmark"),
  column("remarks", "Review remarks"), column("status", "Review status"),
  column("fundManager", "Fund manager"), column("fundAum", "Whole fund AUM", "currency"), column("investmentStyle", "Investment style"),
  column("regularExpense", "Regular expense ratio"), column("directExpense", "Direct expense ratio"), column("managementFee", "Management fee"),
  column("exitLoad", "Exit load"), column("lockIn", "Lock-in"),
  column("income", "Review dividend / interest", "currency", HC),
  column("schemeAbsolute", "Review absolute return", "percent", HC), column("benchmarkAbsolute", "Review index return", "percent", HC),
  column("schemeXirr", "Review scheme XIRR", "percent", HC), column("benchmarkXirr", "Review index XIRR", "percent", HC),
  column("reviewCost", "Review product cost", "currency", HC), column("reviewValue", "Review product value", "currency", HC),
  column("allocation", "Review product allocation", "percent"),
  column("reviewCommitment", "Review commitment", "currency"), column("valuationNote", "Review valuation note"),
  column("monthlyOpening", "May closing value", "currency", HC), column("monthlyPurchase", "June purchases", "currency", HC), column("monthlySale", "June sales / redemptions", "currency", HC),
  column("monthlyClosing", "June closing value", "currency", HC), column("monthlyReturn", "June return", "percent", HC),
  column("monthlyBenchmark", "June index return", "percent", HC), column("monthlyAlpha", "June alpha", "percent"), column("inceptionAlpha", "Inception alpha", "percent"),
  column("monthlyRemarks", "Monthly review remarks"),
  column("recommendation", "Historical adviser plan"),
  column("schemes", "Review scheme count", "number"), column("nifty50Weight", "Nifty 50 weight", "percent", ["holding", "sector"]),
  column("nifty500Weight", "Nifty 500 weight", "percent", ["holding", "sector"]),
  column("withinClass", "Review weight within asset class", "percent", ["category"]),
  column("activeGain", "Review active gain", "currency", ["category"]),
  column("monthlyGain", "June gain", "currency", ["category"]), column("monthlyIncome", "June dividend / interest", "currency", ["category"]),
  column("effectiveAllocation", "Review effective allocation", "percent", ["category"]),
  column("adjustedAllocation", "Review adjusted allocation", "percent", ["category"]),
  column("adjustedEffectiveAllocation", "Review adjusted effective allocation", "percent", ["category"]),
  column("entityTotal", "Review entity total", "currency", ["entity"]), column("entityPrivateCost", "Review private equity at cost", "currency", ["entity"]),
  column("entityPeFunds", "Review PE funds", "currency", ["entity"]), column("entityUnlisted", "Review unlisted equity", "currency", ["entity"]),
  column("entityDebt", "Review debt", "currency", ["entity"]), column("entityCash", "Review cash", "currency", ["entity"]), column("entityAlternate", "Review alternate", "currency", ["entity"]),
  column("reviewAllocation", "Review sector weight", "percent", ["sector"]),
];
export const reviewColumn = (id: string) => REVIEW_COLUMNS.find((c) => c.id === id);
export const reviewColumnIds = (kind: ReviewKind) => REVIEW_COLUMNS.filter((c) => c.kinds.includes(kind)).map((c) => c.id);
export const REVIEW_NOTE = "Motilal consolidated review · 30 Jun 2026. Source product figures cover the family investment, not an individual account. Unmatched or ambiguous records show a dash.";
const INSTRUMENT_FIELDS = new Set(["fundManager", "fundAum", "investmentStyle", "regularExpense", "directExpense", "managementFee", "exitLoad", "lockIn", "benchmark", "status", "valuationNote"]);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

/** Only an exact source row, security identity, or the existing audited taxonomy can join a product. */
function productRecord(scope: ReviewScope, p?: Position): ReviewRecord | undefined {
  const securityKey = p?.securityKey ?? scope.securityKey;
  const accountId = scope.accountId ?? p?.accountId;
  const taxonomy = securityKey || (scope.isMandate && accountId) ? familyBasket(p ?? { accountId: accountId ?? "", securityKey: securityKey ?? "", assetClass: null }, scope.isMandate ?? false) : null;
  const product = scope.product ?? taxonomy?.reviewProduct ?? (securityKey ? REVIEW_COLUMN_DATA.bySecurity[securityKey] : undefined);
  const common = product ? REVIEW_COLUMN_DATA.byProduct[norm(product)] : undefined;
  const source = p?.reviewSource ? REVIEW_COLUMN_DATA.bySource[`${p.reviewSource.sheet.trim()}:${p.reviewSource.row}`] : undefined;
  return common || source ? { ...common, ...source } : undefined;
}

export function reviewField(scope: ReviewScope | undefined, field: string): ReviewField {
  const missing: ReviewField = { value: null, source: "", note: "This row has no exact matching record for this field in the Motilal June review." };
  if (!scope) return missing;
  if (scope.familySubset && !INSTRUMENT_FIELDS.has(field)) return { ...missing, note: "The June review reports this field for the whole family. It cannot be apportioned to the selected members; choose Whole family to see it." };
  const groups: [string | undefined, Record<string, ReviewRecord>][] = [
    [scope.entity, REVIEW_COLUMN_DATA.byEntity], [scope.category, REVIEW_COLUMN_DATA.byCategory],
    [scope.basket, REVIEW_COLUMN_DATA.byBasket], [scope.sector, REVIEW_COLUMN_DATA.bySector],
  ];
  for (const [name, records] of groups) if (name) return records[norm(name)]?.[field] ?? missing;
  const positions = scope.positions;
  const records = positions?.length ? positions.map((p) => productRecord(scope, p)) : [productRecord(scope)];
  const values = records.map((r) => r?.[field]);
  if (values.some((v) => !v)) return missing;
  const first = values[0];
  if (!first) return missing;
  // Different products are never summed, and one constituent is never presented as the whole row.
  if (values.some((v) => v?.value !== first.value || v?.source !== first.source)) return { ...missing, note: "This row combines different source records. Expand it to see each investment's review fields." };
  return first;
}

/** Sorting and cells resolve exactly the same source field; missing figures sort last. */
export function withReviewAccessors<T>(accessors: Record<string, Accessor<T>>, scope: (row: T) => ReviewScope, familySubset = false): Record<string, Accessor<T>> {
  return { ...accessors, ...Object.fromEntries(REVIEW_COLUMNS.map((c) => [c.id, (row: T) => {
    const resolved = scope(row);
    const field = reviewField({ ...resolved, familySubset: familySubset || resolved.familySubset }, c.field);
    return field.value == null ? null : field.sortValue ?? field.value;
  }])) };
}
