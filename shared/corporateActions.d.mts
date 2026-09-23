export type ResearchAction = {
  id: string; ticker: string; isin: string | null; company: string; type: string;
  exDate: string | null; recordDate: string | null; purpose: string; source: string; sourceUrl: string | null;
  factor: number | null; cashPerShare: number | null; issue: string | null;
};
export type ActionFeed = {
  version: 1; capturedAt: string; requestedFrom: string; requestedTo: string;
  verifiedThrough: string | null; symbols: string[] | null; isins: string[]; sourceUrl: string; rows: ResearchAction[];
};
export const RESEARCH_ACTIONS_URL: string;
export function isoDay(v: unknown): string | null;
export function parseAction(row: unknown): ResearchAction;
export function normalizeActionFeed(raw: unknown, symbols?: string[] | null, isins?: string[]): ActionFeed;
export function validActionFeed(v: unknown): v is ActionFeed;
