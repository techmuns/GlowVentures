// PLACEHOLDER — replaced by the ingest pipeline.
//
// The shape below is the contract the rest of the cockpit is written against.
// Every array is empty and every total is zero because no statements have been
// ingested yet. That is a real state, not a stand-in for data we have and
// haven't wired up: `PortfolioContext` detects the empty book and the UI shows
// "No statements ingested yet" instead of rendering zeros as if they were
// measurements.
//
// When the pipeline runs (source/*.pdf → docs/ingest-inventory → public/audit/ →
// here) it regenerates this file with the same exports. Nothing else changes.
import type {
  Account, BookSummary, EntityCG, FundInvestment, NavPoint, Position, StartupInvestment,
} from "@/lib/types";

/** Newest report date across all accounts. Empty until the first statement lands. */
export const BOOK_AS_OF = "";

export const BOOK_SUMMARY: BookSummary = {
  asOf: BOOK_AS_OF,
  listedValue: 0,
  privateValue: 0,
  totalValue: 0,
  positionsCount: 0,
  entitiesCount: 0,
  startupsCount: 0,
};

/** Account registry — one row per (provider, account no). Positions join on accountId. */
export const BOOK_ACCOUNTS: Account[] = [];

export const BOOK_POSITIONS: Position[] = [];
export const BOOK_NAV_HISTORY: NavPoint[] = [];
export const BOOK_CAPITAL_GAINS: EntityCG[] = [];

export const BOOK_PE_FUNDS: FundInvestment[] = [];
export const BOOK_PREIPO_FUNDS: FundInvestment[] = [];
export const BOOK_UNLISTED_COMPANIES: FundInvestment[] = [];
export const BOOK_DEBT_FUNDS: FundInvestment[] = [];
export const BOOK_CLOSED_FUNDS: FundInvestment[] = [];
export const BOOK_STARTUPS: StartupInvestment[] = [];
