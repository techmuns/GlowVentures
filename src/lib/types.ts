// Canonical data model for the Glow Ventures Family Office dashboard.
// All monetary values are INR (the base currency); the display layer converts.
//
// This book is assembled from PDF statements issued by several wealth platforms,
// not from one workbook. Three consequences are baked into the model:
//
//   1. A security may arrive with nothing but a printed NAME. ISIN and ticker are
//      enrichment, never a precondition for a position existing — so the join key
//      is `securityKey`, a slug of the normalized name (see ./securityKey).
//   2. "Account" means two different things on a statement — who OWNS the money
//      and who RUNS it. They are separate fields on `Account`, resolved from a
//      registry rather than guessed from the account string.
//   3. Statements for different accounts carry different report dates, so as-of
//      is per account. `Portfolio.asOf` is only the newest of them.
export type DisplayCurrency = "INR" | "USD" | "EUR" | "GBP";
export type AssetClass = "Equity" | "ETF" | "Liquid";

/**
 * One account as a provider reports it: the statement's own header, normalized.
 *
 * `owner` is the entity or person the assets belong to; `provider` is the
 * platform that issued the statement. Keeping them apart is what lets a page say
 * "the family holds X" and "this manager runs Y" without conflating the two.
 */
export type Account = {
  accountId: string;        // stable internal id — the join target for Position.accountId
  provider: string;         // issuing platform, e.g. "360 ONE Private Wealth"
  accountNo: string;        // account / folio number as printed
  strategy: string;         // scheme or strategy, e.g. "Aristos Equity Portfolio"
  owner: string;            // owning entity or individual, as printed
  engagement: string;       // PMS | AIF | Advisory | Custody | Direct | …
  asOf: string;             // report date of THIS account's latest statement (ISO)
};

// One current position: a security held within one account.
export type Position = {
  /**
   * Stable slug of the normalized security name — the join key used for
   * grouping, look-through, dedupe and the /stock/:securityKey route. Present on
   * every position, including the many that carry no ISIN.
   */
  securityKey: string;
  security: string;         // security name as printed on the statement
  isin?: string;            // enrichment — several providers print no ISIN at all
  symbol?: string;          // NSE trading symbol, when one is mapped
  accountId: string;        // → Account.accountId; owner/provider come from there
  sector: string;           // normalized sector (our taxonomy)
  providerSector?: string;  // sector exactly as the provider printed it
  assetClass: AssetClass;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  costBasis: number;        // INR
  marketValue: number;      // INR
  unrealizedPnL: number;    // INR
  returnPct: number;
  stCostBasis: number;      // cost of lots held < 1yr (short-term)
  ltCostBasis: number;      // cost of lots held >= 1yr (long-term)
  daysToLT: number | null;  // min days for short-term lots to turn long-term
  dividendReceived: number; // INR, cumulative
  costUnavailable?: boolean; // cost basis missing/unreliable — P&L & return not meaningful
  // ── Live-quote overlay (src/lib/quotes.ts) ────────────────────────────────
  // Present once the muns quote feed has been applied. `live: false` means the
  // price above is still the statement mark — the UI flags those rather than
  // presenting a month-old mark as current.
  live?: boolean;
  prevClose?: number | null;  // previous close, for the intraday move
  dayChange?: number | null;  // INR change on the position since previous close
  dayChangePct?: number | null;
  low52?: number | null;
  high52?: number | null;
  quoteAgeS?: number;         // seconds since the quote was pulled upstream
};

export type NavPoint = { period: string; date: string; nav: number };

// A dated cash flow for money-weighted return (XIRR). Sign convention:
// amount < 0 = capital in (contribution / buy), amount > 0 = capital out
// (sale / distribution). The terminal market value is appended at compute time.
export type CashFlow = { date: string; amount: number };

export type EntityCG = {
  entity: string;
  realisedST: number;
  realisedLT: number;
  unrealisedST: number;
  unrealisedLT: number;
};

export type FundInvestment = {
  name: string;
  firstInvest: string | null;
  committed: number;        // INR
  drawn: number;            // INR (capital called)
  distributed: number;      // INR (returned)
  currentValue: number;     // INR (residual NAV)
  tvpi: number | null;
  dpi: number | null;
};

export type StartupInvestment = {
  name: string;
  investDate: string | null;
  invested: number;         // INR
  fairValue: number;        // INR
  ownershipPct: number;
  moic: number | null;
};

export type BookSummary = {
  asOf: string;             // newest report date across all accounts
  listedValue: number;
  privateValue: number;
  totalValue: number;
  positionsCount: number;
  entitiesCount: number;
  startupsCount: number;
};

export type Portfolio = {
  fileName: string;
  uploadedAt: string;
  baseCurrency: DisplayCurrency;
  /**
   * The NEWEST report date in the book. Individual accounts can be older — see
   * `accounts[].asOf` and `staleAccounts()` in ./accounts, which every
   * consolidated total surfaces through <BasisPill>.
   */
  asOf: string;
  totalValue: number;       // consolidated INR (listed + private)
  listedValue: number;
  privateValue: number;
  /** Registry of every account in the book. Positions reference it by accountId. */
  accounts: Account[];
  positions: Position[];
  navHistory: NavPoint[];
  capitalGains: EntityCG[];
  // Optional, keyed by owning entity. Populated by the ingest pipeline when the
  // source statements carry dated transactions / per-entity NAV snapshots;
  // absent on books that only provide current cost & market value. Drives the
  // per-entity XIRR (annualized) and YTD columns, which render "—" when missing.
  entityCashFlows?: Record<string, CashFlow[]>;
  entityNavHistory?: Record<string, NavPoint[]>;
  privateMarkets: {
    peFunds: FundInvestment[];
    preIpoFunds: FundInvestment[];
    unlistedCompanies: FundInvestment[];
    debtFunds: FundInvestment[];
    closedFunds: FundInvestment[];
    startups: StartupInvestment[];
  };
};
