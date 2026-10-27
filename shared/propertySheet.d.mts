import type { Property } from "./realEstate.mjs";
type ExcelJSModule = typeof import("exceljs");
export const SHEET: string;
export const MAX_UPLOAD_ROWS: number;
export const MAX_FILE_BYTES: number;
export type TemplateColumn = { key: string; header: string; kind: string; width?: number; owner?: number; improvement?: number; options?: string[] };
export function templateColumns(ownerPairs?: number, improvementPairs?: number): TemplateColumn[];
export type Member = { ownerId: string; label: string };
export function buildPropertyWorkbook(ExcelJS: ExcelJSModule, options?: { properties?: readonly Property[]; members?: readonly Member[] }): import("exceljs").Workbook;
export type ReadRow = { row: number; values: Record<string, unknown>; owners: { n: number; name: string; share: number | null }[]; improvements: { n: number; on: string | null; amount: number | null }[]; errors: string[]; content: boolean };
export type ReadResult = { fileErrors: string[]; notes: string[]; rows: ReadRow[] };
export function readPropertyWorkbook(ExcelJS: ExcelJSModule, data: ArrayBuffer | Uint8Array): Promise<ReadResult>;
export type PlanRow = {
  row: number; isNew: boolean; label: string;
  /** "new" | "update" | "unchanged" | "error" */
  action: "new" | "update" | "unchanged" | "error";
  property: Property | null; base: string | null; errors: string[]; notes: string[];
  changes: { field: string; before: string; after: string }[]; identity: string | null;
};
export type UploadPlan = {
  rows: PlanRow[]; counts: { new: number; update: number; unchanged: number; error: number };
  fileErrors: string[]; notes: string[]; ready: boolean; items: { property: Property; base: string | null }[];
};
export function planPropertyUpload(read: ReadResult, options?: { existing?: readonly Property[]; members?: readonly Member[]; newId?: () => string }): UploadPlan;
