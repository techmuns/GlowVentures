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
  /**
   * Scheme or strategy, e.g. "Aristos Equity Portfolio". NULL where the provider
   * names none: 360 ONE's client-level report is issued per CRN, not per
   * mandate, and prints no strategy line anywhere.
   */
  strategy: string | null;
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
  // Quantity and market value are on every position in this book: every
  // holdings statement in the drop prints both for every row including cash.
  quantity: number;
  marketValue: number;      // INR
  /**
   * COST, AND THE TWO FIGURES DERIVED FROM IT — NULLABLE, because a DEPOSITORY
   * does not know what shares cost.
   *
   * The managed accounts all print a total cost per row: their manager bought
   * the position and reports its basis. LKP's depository holding statement
   * prints ISIN, quantity, rate and value and no cost at all — CDSL holds the
   * shares, it did not buy them. Nine of those ten positions recover a cost from
   * the broker's own opening ledger (`costBasisSource`); the tenth, a liquid ETF
   * the ledger does not carry, genuinely has none in this drop.
   *
   * A zero here would report the whole market value as profit and an infinite
   * return. Render through `src/components/Absent.tsx`.
   */
  costBasis: number | null;      // INR
  unrealizedPnL: number | null;  // INR
  returnPct: number | null;
  /**
   * Where a cost basis came from another document — "opening-position" means the
   * broker's carried-forward ledger row, joined only where the quantities match
   * exactly. Absent when the holdings statement printed the cost itself.
   */
  costBasisSource?: "opening-position";
  /**
   * PER-UNIT figures, and NULLABLE — not every provider prints them.
   *
   * The four PMS appraisals print a Unit Cost and a Market Price on every row.
   * 360 ONE's Detailed Holding Statement prints neither: an AIF unit is marked
   * at a Net Asset Value with no NAV per unit and no unit cost anywhere on the
   * page. So for that holding these two are genuinely absent, and market value
   * is the printed primitive rather than price x quantity.
   *
   * They were `number` while every statement in the book happened to carry them.
   * Widening is the honest fix: a zero would say the fund's units cost nothing,
   * and nothing on screen would tell a reader that apart from a measurement.
   * Render through `src/components/Absent.tsx`. A position whose `currentPrice`
   * is null is also unpriceable by the live feed, which is already how the AIF
   * behaves — it has no NSE listing.
   */
  avgCost: number | null;
  currentPrice: number | null;
  /**
   * Cost of lots held under / over a year, on India's 12-month threshold for
   * listed equity.
   *
   * POPULATED ONLY WHERE A LOT REGISTER EXISTS. One broker in this drop
   * publishes dated acquisition lots; the managed accounts publish a capital
   * register, which is a capital-account ledger (contributions, withdrawals,
   * TDS) and carries no purchase dates. So these are real figures on some
   * positions and NULL on the rest — never a split assumed from an average
   * holding period, which would be a tax number somebody might act on.
   * `docs/BOOK-REPORT.md` counts which.
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

/**
 * One time-weighted return series exactly as a manager publishes it.
 *
 * The period fields are deliberately NOT interchangeable. `mtd`/`qtd`/`fytd` are
 * TO-DATE windows (Goldstandard); `m1`/`m3`/`m6`/`y1` are TRAILING ones (Green
 * Lantern, Carnelian). A trailing one-month return and a month-to-date return
 * measure different things, so a series carries one set and leaves the other
 * null — and the UI renders "—" for the columns that manager does not publish.
 */
export type ReturnSeries = {
  series: string;             // "Portfolio", "N50TRI", "S&P BSE 500 Total" …
  isBenchmark: boolean;
  mtd: number | null;
  qtd: number | null;
  fytd: number | null;        // Indian FINANCIAL year to date (1 Apr →), not calendar
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
  si: number | null;          // since inception
  /** False when the period is under a year — the reports annualise only past one. */
  siAnnualised: boolean | null;
  /** "after" | "before" — whether returns are net of management fees. */
  feeBasis: string | null;
};

/** The return series one report published, with the document it came from. */
export type AccountReturnBlock = {
  reportType: string;
  source: string;             // docKey → public/audit/<docKey>/
  series: ReturnSeries[];
};

/**
 * Opening → capital → realised → unrealised → income → fees → closing, over ONE
 * window. Each account has more than one block on more than one window (the
 * financial year to date, and since inception) and they are never added together.
 */
export type AccountBridge = {
  reportType: string;
  source: string;
  periodFrom: string;
  periodTo: string;
  basis: "since-inception" | "financial-year-to-date";
  opening: number | null;
  contribution: number | null;
  withdrawal: number | null;
  netCapitalInOut: number | null;
  realized: number | null;
  unrealized: number | null;
  income: number | null;
  fees: number | null;
  expenses: number | null;
  closing: number | null;
  profit: number | null;
};

/**
 * A NON-CASH corporate action: bonus, split, rights. Separate from dividend
 * income because its substance is the entitlement, not an amount — a bonus
 * prints 0.00 and that zero is a real measurement, not a missing one.
 */
export type CorporateAction = {
  security: string;
  securityKey: string;
  accountId: string;
  kind: string | null;
  exDate: string | null;
  quantity: number | null;
  entitlement: string | null;
  amount: number | null;
  source: string | null;
};

// A dated cash flow for money-weighted return (XIRR). Sign convention:
// amount < 0 = capital in (contribution / buy), amount > 0 = capital out
// (sale / distribution). The terminal market value is appended at compute time.
export type CashFlow = { date: string; amount: number; description?: string };

export type EntityCG = {
  entity: string;
  /** The account these gains belong to, and its canonical owner. */
  accountId?: string;
  ownerId?: string | null;
  /**
   * NULL when the account has no capital gain statement at all — distinct from
   * a statement that reports zero realised gain. The page names the account and
   * says which document is missing rather than averaging it in as nothing.
   */
  realisedST: number | null;
  realisedLT: number | null;
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
  /** docKey of the capital gain statement these lots came from. */
  source?: string | null;
  /** Set when there is no statement: why, in one line, for the row to show. */
  absent?: string;
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

/**
 * A CAPITAL COMMITMENT to a drawdown fund — and specifically the part of it that
 * has NOT been called.
 *
 * Deliberately not a `FundInvestment`, and deliberately not a holding. The
 * fund's current value is already an ordinary position with `assetClass: "AIF"`;
 * putting it here as well would count it twice. What this carries is the
 * LIABILITY side — capital the fund can call at any time — which appears nowhere
 * else in the book and which the Morning CIO's dry-powder tile previously denied
 * existed while two statements reporting it sat unread.
 */
export type Commitment = {
  accountId: string;
  name: string;
  provider: string;
  ownerId: string | null;
  asOf: string | null;
  committed: number;        // INR — the total the family signed up for
  drawn: number | null;     // INR — capital actually called so far
  undrawn: number | null;   // INR — the dry powder, AS PRINTED, not derived
  distributed: number | null;
  /**
   * Whether the fund's own three figures agree: committed − drawn = undrawn, to
   * the rupee. False means the statement disagrees with itself and the figures
   * are shown as printed rather than reconciled here.
   */
  arithmeticHolds: boolean | null;
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
  /**
   * Undrawn capital commitments. Separate from `privateMarkets` because a
   * commitment is not an investment — see the type's own note.
   */
  commitments: Commitment[];
  privateMarkets: {
    peFunds: FundInvestment[];
    preIpoFunds: FundInvestment[];
    unlistedCompanies: FundInvestment[];
    debtFunds: FundInvestment[];
    closedFunds: FundInvestment[];
    startups: StartupInvestment[];
  };
};

/**
 * Realised gains split by asset class, per account.
 *
 * The canonical realised total nets two unlike books — an equity mandate and a
 * liquid-fund cash sweep whose gains offset the equity losses. This makes that
 * visible without changing the figure. `assetClass` is null where no statement
 * in the drop classifies the security; the names are carried so the page can
 * say WHICH rather than describing them in the abstract.
 */
export type RealisedByClass = {
  accountId: string;
  entity: string;
  assetClass: string | null;
  lots: number;
  realisedST: number | null;
  realisedLT: number | null;
  securities: string[];
};
