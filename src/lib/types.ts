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
export const ASSET_CLASSES = [
  "Equity",
  "ETF",
  "Mutual Fund",
  "AIF",
  "Bond",
  "Structured Product",
  "Unlisted",
  "Cash",
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

/**
 * IS THIS ONE OF THEM? A `Txn.assetClass` is what the STATEMENT called the
 * instrument — a free string, and null where it said nothing — so a dated
 * record being filed under the same section as a holding has to be able to ask.
 * A class this model does not carry is not silently coerced into one: the
 * caller names it absent, exactly as it does for a null.
 */
export const isAssetClass = (v: string | null | undefined): v is AssetClass =>
  v != null && (ASSET_CLASSES as readonly string[]).includes(v);

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
  /**
   * The date the account's DATED CAPITAL RECORD reaches — the latest window end
   * of the documents carrying a payment row. Null when no statement dates the
   * family's payments at all. A record ending before `asOf` cannot state the
   * capital behind a value struck on `asOf`: see `src/lib/capital.ts`.
   */
  capitalRecordTo?: string | null;
  /** Who holds the assets. For a PMS mandate this is the manager. */
  custodian?: string;
  /**
   * Why this account contributes no positions, when it contributes none.
   *
   * NULL on every account that holds something. Non-null distinguishes an empty
   * account (a folio redeemed to nil — a real zero) from one whose statements
   * simply do not value anything (an AIF income letter, whose units are marked
   * on another account's report). Both render `₹0` without it, and only one of
   * them means the money is gone.
   */
  noPositionsReason?: string | null;
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
  /**
   * WHICH SIDE OF THE BOOK THIS HOLDING SITS ON — `"listed"`, `"private"`, or
   * `null` where no statement places it.
   *
   * GENERATED (`shared/aifCategory.mjs`, applied in `build-book`), because the
   * answer needs the ACCOUNT's own engagement wording as well as the security
   * name and only one of those is on a position. `null` is a third answer and
   * never a default to either side: three funds in this book print no SEBI
   * category, and putting them on either side would be a claim no document
   * makes. See `publicPrivateSplit`, which returns all three.
   *
   * Optional on the type so a hand-built fixture need not carry it — the
   * generated book carries it on every row, and `marketSide.test.ts` asserts
   * that rather than trusting it.
   */
  marketSide?: MarketSide | null;
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
  /**
   * ISO date the OLDEST unit still held was bought — the holding's own start.
   *
   * The ONLY field in this book that can say how long a holding has been held,
   * and therefore the only one that can license an ANNUALISED return. Populated
   * under the same gate as the ST/LT split above (the lots must account for the
   * units held exactly), so it is real on a few positions and NULL on the rest.
   *
   * NEVER DEFAULT IT. A missing date read as "today" makes every annualised
   * return infinite; read as "long ago" it makes every one vanish. A holding
   * whose start is unknown cannot be annualised at all — see `holdingReturn`
   * in ./analytics, which renders it absent rather than guessing the window.
   */
  heldSince: string | null;
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
  marketCap?: number | null;  // ₹, from the quote feed — for the company market-data block
  quoteAgeS?: number;         // seconds since the quote was pulled upstream
  // ── Published-NAV overlay (src/lib/fundNavs.ts) ───────────────────────────
  // A fund resolves no NSE symbol, so the quote feed never prices one and the
  // fields above stay empty on every scheme. `navPriced` says the price above
  // is AMFI's published NAV rather than the statement's mark — a different
  // thing from `live`, which means an INTRADAY quote and which gates the
  // day-change surfaces. A NAV is struck once after the close, so it must
  // never set `live` and never fills the intraday fields.
  navPriced?: boolean;
  navDate?: string;           // AMFI's own publication date for that NAV
};

/**
 * One dated portfolio valuation.
 *
 * The optional fields exist because a CONSOLIDATED point is a blend and has to
 * say so. `accountsOnDate` / `accountsCarried` split the point's composition
 * between accounts marked ON that date and accounts held at an earlier mark —
 * the same "N accounts behind" fact `<BasisPill>` states for the headline NAV,
 * carried per point so a reader can see which steps are real restatements.
 *
 * `flowIn` is NET EXTERNAL CAPITAL since the previous point, in base currency,
 * positive for money in. It is not optional decoration: one ₹11.24 Cr deposit
 * into V.E.C 128005 is an +8% step in this book's covered set with no market
 * movement behind it, so a series charted against an index MUST subtract it.
 *
 * `unreportedFlowValue` is the value restated in that interval by an account
 * that publishes no dated capital record — the part of the step that cannot be
 * shown to be performance rather than a subscription. Stated, never assumed nil.
 */
export type NavPoint = {
  period: string;
  date: string;
  /**
   * The whole marked panel's value at this date. It CLIMBS as accounts join,
   * so it is a book NAV only from the point `panelComplete` turns true — see
   * `navHistoryFrom` in build-book.mjs, and `panelComplete` below.
   */
  nav: number;
  accountsOnDate?: number;
  accountsCarried?: number;
  flowIn?: number;
  unreportedFlowValue?: number;
  /**
   * ── THE LINK, AND WHY THE SERIES CAN START BEFORE THE PANEL IS COMPLETE ────
   *
   * The series used to begin where every covered account had published at least
   * once (2026-07-10 here), because a NAV LEVEL that climbs from ₹27 Cr to
   * ₹142 Cr as accounts ARRIVE reads as performance. That rule protected the
   * level and it also threw away 40 of the archive's 74 measured days, which is
   * what the family reported: *"we are only able to see portfolio NAV for a very
   * short period of time."*
   *
   * A chain-linked index does not need a constant panel across the WHOLE series
   * — only across each LINK. So each point carries the interval ending at it,
   * struck over the accounts valued at BOTH of its ends:
   *
   *   r = (linkClose − flowIn) / linkOpen − 1
   *
   * An account joining at this date is in neither end of the link that ends
   * here, so its arrival contributes 0.00% rather than a step. Where the panel
   * is already complete the common set IS the whole panel and `linkClose`
   * equals `nav` exactly, which is the check `navSeries.test.ts` strikes.
   */
  linkOpen?: number | null;
  linkClose?: number | null;
  /** How many accounts the link covers — the panel it was struck over. */
  linkAccounts?: number;
  /**
   * True from the date every covered account has published. The RAW NAV line is
   * drawn only from here: before it, the level is a growing panel and rebasing
   * it to 100 would draw exactly the arrivals-as-performance curve the link
   * exists to avoid.
   */
  panelComplete?: boolean;
};

/**
 * ── RETURN ATTRIBUTION OVER A DATED WINDOW ──────────────────────────────────
 *
 * *"What was the attribution to those returns? … which were the biggest
 * detractors of returns?"*
 *
 * Answered from the archive's own reissues: 16 accounts publish a VALUED
 * holdings statement at two or more dates, so 273 holdings are priced at both
 * ends of a window and the change in each is measurable. Nothing in this app
 * read that until now — the seventh absence in this book recorded against a
 * premise nobody rechecked.
 *
 * THE DECOMPOSITION IS EXACT, NOT APPORTIONED. For a holding priced at both
 * ends, market value is quantity × price (rule 3, and measured: 765 of 765
 * priced rows in the archive satisfy it to the paisa), so
 *
 *   v₁ − v₀  =  q₀·(p₁ − p₀)  +  (q₁ − q₀)·p₁
 *               └─ price ─┘      └── trading ──┘
 *
 * with no residual. `price` is what the units held at the start earned; the
 * second term is units bought or sold inside the window, valued where they
 * ended. A position that ENTERED contributes its whole closing value and a
 * position that EXITED its whole opening value — neither is performance, and
 * both are their own term rather than being folded into one of the two above.
 */
export type AttributionRow = {
  securityKey: string;
  security: string;
  accountId: string;
  /** `held` | `entered` | `exited` | `unpriced` — which term this row lands in. */
  kind: string;
  from: string;
  to: string;
  openValue: number | null;
  closeValue: number | null;
  openPrice: number | null;
  closePrice: number | null;
  openQty: number | null;
  closeQty: number | null;
  /** q₀·(p₁ − p₀) — null where the row is not priced at both ends. */
  priceEffect: number | null;
  /** (q₁ − q₀)·p₁ — units traded inside the window, at the closing mark. */
  tradeEffect: number | null;
  /** priceEffect / p₀q₀ — the holding's own return over the window. */
  returnPct: number | null;
};

export type AttributionAccount = {
  accountId: string;
  from: string;
  to: string;
  days: number;
  openValue: number;
  closeValue: number;
  priceEffect: number;
  tradeEffect: number;
  enteredValue: number;
  exitedValue: number;
  /** Rows valued at both ends but carrying no price at one of them. */
  undecomposedValue: number;
  rowsHeld: number;
  rowsEntered: number;
  rowsExited: number;
  rowsUnpriced: number;
};

export type Attribution = {
  from: string | null;
  to: string | null;
  /** Σ over the covered accounts, each over ITS OWN window inside that span. */
  openValue: number;
  closeValue: number;
  priceEffect: number;
  tradeEffect: number;
  enteredValue: number;
  exitedValue: number;
  undecomposedValue: number;
  /** How much of the BOOK the window covers, and how much it does not. */
  bookValue: number;
  coveredBookValue: number;
  accounts: AttributionAccount[];
  rows: AttributionRow[];
};

/**
 * WHAT A DATED NAV SERIES COVERS, AND WHAT IT LEAVES OUT — by account, by name.
 *
 * A series over 17 of 49 accounts is a real measurement and a claim about a
 * fifth of the book. The two are only distinguishable if the page can name the
 * accounts it does not cover, which is what `single` and `unvalued` are for:
 * `single` publishes exactly ONE dated valuation (a level, never a change),
 * `unvalued` publishes none at all.
 */
export type NavCoverage = {
  covered: {
    accountId: string;
    points: number;
    first: string;
    last: string;
    /** The series' own last point for this account — what the chart is built on. */
    latestValue: number;
    /**
     * The same account as the BOOK carries it, which is not always the same
     * figure: the archive's own row sum runs before the depository-duplicate
     * drop and the ring-fence. Both are emitted so a page can check one against
     * the other rather than trusting either alone.
     */
    bookValue: number;
    /** `reported` | `units-unchanged` | `unreported` — see BOOK_NAV_COVERAGE. */
    flowBasis: string;
  }[];
  single: { accountId: string; provider: string; accountNo: string; date: string; bookValue: number }[];
  unvalued: { accountId: string; provider: string; accountNo: string; bookValue: number }[];
  from: string | null;
  to: string | null;
  /**
   * The date every covered account has published by — the old series start, and
   * still the date from which the RAW NAV level is a book NAV rather than a
   * growing panel. Points before it carry `panelComplete: false`.
   */
  panelCompleteFrom?: string | null;
};

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

/**
 * ONE DATED INVESTMENT THE FAMILY MADE — not a trade their manager made.
 *
 * *"in transactions we need to see the transactions we have done, not what the
 * transactions the portfolio manager has done."* A share Carnelian bought is the
 * manager's decision; the ₹10 Cr the family put INTO Carnelian is theirs. This
 * is the second, and it is the same axis `holdingBucket` settled for holdings
 * (Stage 10L) arriving on the transactions side.
 *
 * `amount` is what left (or reached) the bank on that date, as the statement
 * prints it. `invested` is what actually bought units — `amount` less the
 * charges the SAME statement levies on the SAME date — and is the figure a
 * return is struck on, because it ties to the position's own cost basis to the
 * paisa. Both are carried: the family thinks in the gross ("I invested an
 * additional 10 crores") and the arithmetic needs the net.
 */
export type CapitalMove = {
  accountId: string;
  date: string;
  /** `in` is money the family committed; `out` is money that came back or was deducted. */
  direction: "in" | "out";
  /** What the STATEMENT called it — "Top Up", "Capital inflow", "Purchase". Never our word for it. */
  label: string;
  /**
   * Gross movement, unsigned. NULL where the statement prints only a running
   * BALANCE for this date and no gross figure — a balance is not a movement, and
   * differencing an ambiguous sequence would invent one.
   */
  amount: number | null;
  /** `amount` less the same date's printed charges. Null wherever `amount` is. */
  invested: number | null;
  /**
   * Units the fund allotted on the way IN, or redeemed (negative) on the way
   * OUT, where it prints them. A capital register moves money and names no
   * units at all, and keeps its null.
   */
  units: number | null;
  /** The security those units are in — only a unitised fund names one. */
  security: string | null;
  securityKey: string | null;
};

/**
 * WHAT HAPPENED TO A QUANTITY OVER A STATEMENT'S OWN WINDOW.
 *
 * `opening + unitsIn - unitsOut + corporateAction = closing`, every term read
 * off a demat statement's per-ISIN block — its printed opening balance, its
 * dated movements and its printed closing balance. The identity holds on every
 * entry that carries one, because the reader refuses a block whose rows do not
 * walk between the two printed balances; where it refused, the movement terms
 * are `null` and `reason` says why. Null is never zero here: a zero would read
 * as a window in which nothing moved.
 *
 * NONE OF IT IS A TRADE. A depository movement has no price, no counterparty
 * and no consideration, so these are UNITS IN and UNITS OUT rather than bought
 * and sold, and no cost or realised gain is derived from any of them.
 */
export type ShareMovement = {
  accountId: string;
  securityKey: string;
  security: string | null;
  isin: string | null;
  /** The window the two balances bound — the Indian FINANCIAL year on these. */
  periodFrom: string | null;
  periodTo: string | null;
  opening: number | null;
  closing: number | null;
  unitsIn: number | null;
  unitsOut: number | null;
  /** Signed: the security itself changing, never a decision anybody made. */
  corporateAction: number | null;
  /**
   * A COUNT, and in no total. A pledge moves units between free and pledged
   * without changing the balance, so it is shown and never summed.
   */
  encumbranceMoves: number | null;
  /** How many dated rows the statement prints between the two balances. */
  rows: number | null;
  /**
   * Rows matching no particular this reader knows. They still count, by their
   * own balance change — a weaker basis than a named event, so the page says so
   * rather than presenting them as classified. Zero on this corpus.
   */
  unclassified: number | null;
  /** The reader's own sentence where a block did not walk. Null when it did. */
  reason: string | null;
  /** The document this came from, for the archive. */
  source: string | null;
};

/**
 * The dated investments behind ONE position, where they account for ALL of it.
 *
 * *"I invested additional 10 crores… previous amount… what was the return? Now
 * this 10 crores… what it has done."* Answering that per tranche needs units
 * allotted per contribution, because a tranche's value today is its own units at
 * today's NAV. So the gate is the same one `costFor` and the ST/LT split already
 * apply: the allotted units must account for the units held, or the breakdown is
 * withheld and the reason named. A partial breakdown reads as a whole one.
 */
export type PositionTranches = {
  accountId: string;
  securityKey: string;
  moves: CapitalMove[];
  /** Allotted units, which equal the position's own quantity — that is the gate. */
  units: number;
};

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
/** One dated demand a drawdown fund made on the family, as its statement prints it. */
export type CapitalCall = {
  date: string;             // ISO
  label: string | null;     // the fund's own wording — "Drawdown 3", "Fourth Contribution"
  amount: number;           // INR
};

export type Commitment = {
  accountId: string;
  name: string;
  provider: string;
  ownerId: string | null;
  asOf: string | null;
  committed: number;        // INR — the total the family signed up for
  /**
   * INR — whichever of CALLED and PAID this fund's own layout matched.
   *
   * The comment here used to read "capital actually called so far" and that was
   * true of one reader out of six: India SME's, Baring's, Sky Capital's and Neo
   * Infra's all take the CONTRIBUTION line, and Carnelian's takes the CALL. The
   * two differ by ₹2,925.10 on this drop, so nothing on screen was visibly
   * wrong — which is the condition under which one field means two things for a
   * drop and a half. `called` and `paid` below are the split; this field is
   * unchanged so that no figure already in the book moves with the correction.
   */
  drawn: number | null;
  undrawn: number | null;   // INR — the dry powder, AS PRINTED, not derived
  distributed: number | null;
  /** INR — what the fund has DEMANDED, off the line its statement labels so. Null where it labels none. */
  called: number | null;
  /** INR — what the family has actually PAID. This is "capital invested". */
  paid: number | null;
  /**
   * INR — called and NOT yet paid, which is the only thing in this book that is
   * genuinely DUE. A measured zero on the statements that print it, and null on
   * the ones that do not: a fund that does not publish the line is not a fund
   * with nothing outstanding.
   */
  pending: number | null;
  /**
   * The fund's own dated calls, oldest first — and only ever a set that
   * reproduced the total its statement prints for it. A schedule that did not
   * tie is EMPTY rather than partial.
   */
  calls: CapitalCall[];
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

/** Which side of the listed/private split a holding sits on. */
export type MarketSide = "listed" | "private";

export type BookSummary = {
  asOf: string;             // newest report date across all accounts
  listedValue: number;
  privateValue: number;
  /**
   * What no statement places on either side. A THIRD FIGURE rather than a
   * residual: `listed + private + unplaced === totalValue` is an identity the
   * suite checks, and a two-field split would absorb this silently.
   */
  unplacedValue: number;
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
  totalValue: number;       // consolidated INR (listed + private + unplaced)
  listedValue: number;
  privateValue: number;
  /** What no statement places on either side — see `BookSummary.unplacedValue`. */
  unplacedValue: number;
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

/**
 * THE FAMILY'S INVESTMENT REGISTER — THE TYPES ARE GONE WITH THE PAGE.
 *
 * `RegisterLine`, `RegisterCostCandidate` and `RegisterSummary` described
 * `src/data/registerData.ts`, which `src/pages/Register.tsx` was the only reader
 * of. The family asked for that page to go, so the module, the builder that
 * emitted it (`npm run build-register`) and these three types went with it —
 * three interfaces describing a file that no longer exists are the orphan this
 * repo keeps naming, one layer up from the builder.
 *
 * THE REGISTER ITSELF IS UNTOUCHED. The workbook is still in `source/`,
 * `scripts/lib/registerRead.mjs` is still its ONE reader, and `npm run
 * reconcile:register` still writes `docs/REGISTER-RECONCILIATION.md` — the
 * independent cross-check it was always allowed to be, and never a source for
 * the book. See the `/register` redirect in `App.tsx`.
 */
