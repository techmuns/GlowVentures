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

/**
 * What an instrument IS.
 *
 * Note what is absent: PMS. A portfolio-management mandate is a relationship
 * with a manager, not a kind of security — the holdings inside a PMS are
 * ordinary listed equity and are classified as such. How an account is run is
 * `Account.engagement`; what it holds is this.
 */
export type AssetClass =
  | "Equity"
  | "ETF"
  | "Mutual Fund"
  | "AIF"
  | "Bond"
  | "Structured Product"
  | "Unlisted"
  | "Cash";

/**
 * How the family engages the provider — a relationship, not an asset.
 *
 * `unknown` is a real value, not a placeholder to be tidied away. An engagement
 * that could not be read from the statement is recorded as unknown and flagged,
 * because guessing one (Advisory being the tempting default) mislabels the whole
 * account: both 360 ONE CRNs here are Distribution, not Advisory.
 */
export type Engagement =
  | "PMS"
  | "AIF"
  | "Advisory"
  | "Distribution"
  | "Execution"
  | "Direct"
  | "unknown";

/**
 * A member sub-account within a provider account.
 *
 * One 360 ONE CRN spans several members on DIFFERENT engagements — CRN60117
 * holds both an Advisory member and a Distribution one; CRN37702 holds
 * Distribution and Executionary, and its May corporate actions are tagged
 * Executionary while its holding sits in Distribution. So engagement belongs to
 * the member, and the account's engagement is derived from whichever member
 * carries the most value.
 */
export type Member = {
  memberId: string;
  label: string;
  engagement: Engagement;
  /** The provider's own wording, verbatim — "Executionary", not "Execution". */
  providerEngagement?: string;
};

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
  /** Account holder, as printed on this statement. Spelling varies by provider. */
  owner: string;
  /**
   * Canonical owner (see src/lib/owners.ts). The SAME person is printed three
   * different ways across these providers, so `owner` above cannot be used to
   * group a family book — this can. Null when no canonical owner matched, which
   * the extraction report surfaces rather than silently minting a new person.
   */
  ownerId: string | null;
  /** The wider family grouping a provider files the account under, when it prints one. */
  familyGroup?: string;
  /** DERIVED from `members` — the engagement carrying the most value, never asserted. */
  engagement: Engagement;
  /** The provider's own wording for the engagement, verbatim, before normalisation. */
  providerEngagement?: string;
  /** Member sub-accounts, each with its own engagement. Empty when the provider reports none. */
  members: Member[];
  asOf: string;             // report date of THIS account's latest statement (ISO)
  /** First investment date, where a statement prints one. Null when none does. */
  inceptionDate?: string | null;
  /** Who holds the assets. For a PMS mandate this is the manager. */
  custodian?: string;
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
  isin?: string | null;     // enrichment — several providers print no ISIN at all
  symbol?: string | null;   // NSE trading symbol, when one is mapped
  accountId: string;        // → Account.accountId; owner/provider come from there
  /** Member sub-account holding this, when the statement identifies one. */
  memberId?: string | null;
  sector: string;           // normalized sector (our taxonomy)
  providerSector?: string | null;  // sector exactly as the provider printed it
  assetClass: AssetClass;
  // These seven are present on every position in this book: the appraisal prints
  // quantity, unit cost and price for every row including cash, and the rest are
  // derived from them. A book whose statements did NOT carry one of them would
  // have no position to show, which `costUnavailable` below already expresses.
  quantity: number;
  avgCost: number;
  currentPrice: number;
  costBasis: number;        // INR
  marketValue: number;      // INR
  unrealizedPnL: number;    // INR
  returnPct: number;
  /**
   * Cost of lots held under / over a year. NULL, not zero, on this book: the
   * split needs per-lot purchase dates and no statement in the drop carries
   * them. See docs/BOOK-REPORT.md.
   */
  stCostBasis: number | null;
  ltCostBasis: number | null;
  daysToLT: number | null;  // min days for short-term lots to turn long-term
  dividendReceived: number | null; // INR, cumulative
  /** Income accrued but not yet received, carried separately from market value. */
  accruedIncome?: number | null;
  /** Per-position IRR, where the provider computes one (Goldstandard does). */
  positionIrrPct?: number | null;
  costUnavailable?: boolean; // cost basis missing/unreliable — P&L & return not meaningful
  /**
   * Shared id for positions the SAME holding is reported under by more than one
   * owner. Policy: carry both, count once — each owner's account view shows
   * their statement as printed, and consolidated totals count each group once.
   * See `dedupeGroupTotals` in ./analytics.
   */
  dedupeGroup?: string;
  /** Other owners whose statements also report this position. */
  alsoReportedUnder?: string[];
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
export type CashFlow = { date: string; amount: number; description?: string };

export type EntityCG = {
  entity: string;
  /** The account these gains belong to, and its canonical owner. */
  accountId?: string;
  ownerId?: string | null;
  realisedST: number;
  realisedLT: number;
  /**
   * NULL when the corpus cannot support the split — it needs per-lot purchase
   * dates. Never estimated: an unrealised ST/LT split is a tax figure, and a
   * guessed one is worse than an absent one.
   */
  unrealisedST: number | null;
  unrealisedLT: number | null;
  /** The window the realised figures cover. */
  periodFrom?: string | null;
  periodTo?: string | null;
  lots?: number;
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
  accountsCount?: number;
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
  /**
   * Dated external capital flows keyed by accountId — the money-weighted-return
   * input. Built from the capital register (or the bank book where a provider
   * issues none), with the window's opening portfolio value as its first entry.
   */
  accountCashFlows?: Record<string, CashFlow[]>;
  privateMarkets: {
    peFunds: FundInvestment[];
    preIpoFunds: FundInvestment[];
    unlistedCompanies: FundInvestment[];
    debtFunds: FundInvestment[];
    closedFunds: FundInvestment[];
    startups: StartupInvestment[];
  };
};
