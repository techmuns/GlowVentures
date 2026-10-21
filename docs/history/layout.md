# Layout

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 202–588). CLAUDE.md now carries the condensed rules; this file is the record. -->

## Layout

- Corporate-action integration (2026-09-23): see `docs/CORPORATE-ACTIONS.md`.
  `shared/corporateActions.mjs` normalizes the Glow Central Research feed;
  `src/lib/corporateActions.ts` projects ONLY post-statement events before live
  marking. The statement book stays immutable. Gross dividend entitlements are
  included in a separately labelled **since-statement** return, never in cash,
  NAV or account XIRR. The public calendar is not proof of historical holdings
  or payment receipt, and incomplete evidence withholds the affected calculation.

- `src/pages/*` — one file per dashboard route (see `src/App.tsx`).
- `src/lib/types.ts` — the canonical model. Read this first.
- `src/lib/securityKey.ts` — the join key (see below).
- `src/lib/accounts.ts` — the account registry: owner vs provider, per-account as-of.
- `src/lib/analytics.ts` — shared aggregation math (per-entity / per-sector /
  per-custodian rollups); `sumOrNull`; `publicPrivateSplit` and `marketSides`,
  which return LISTED, PRIVATE and NOT-PLACED and never derive one from the
  others; `holdingBucket`, the ONE place that decides
  which section a holding sits in on a holdings table — including
  `CASH_EQUIVALENT_KEYS`, the family's own instruction that a liquid fund, a
  liquid ETF or an ARBITRAGE fund is cash whatever wrapper its statement typed
  it as, and `readerClassOf`, the class a page NAMES a holding under by the same
  rule. See Stage 10av, and Stage 10ce for arbitrage.
- `src/lib/tranches.ts` — THE FAMILY'S OWN DATED INVESTMENTS, one definition read
  by both surfaces: the Transactions card's Purchase / Redemption / appreciation
  columns and the per-contribution breakdown a holdings row opens into. See Stage
  10ag, and Stage 10cd for `capitalRollup`'s appreciation split, `capitalReturn`
  (the return methodology struck on the family's own money) and
  `capitalMovesWithCalls` (a drawdown fund's dated calls as purchases).
  `carriedCostOf` / `carriedCostNote` are the ONE place a cost carried through a
  fund's class switch is described on screen, read by the Portfolio Monitor and
  the company page alike — see Stage 10bv.
  `recordShortfall` is the rule that a capital RECORD must reach the date its
  value is struck on (`Account.capitalRecordTo`) — see Stage 10cf.
- `src/lib/datedCapital.ts` + `src/lib/useDatedCapital.ts` — WHICH ROWS OF A
  HOLDINGS TABLE ARE WHOLE ACCOUNTS, and the money-weighted rate over them. It
  defines nothing of its own: the accounts, their dated flows and the value they
  close on are `capitalRollup`'s, so a folio's XIRR on the Portfolio Monitor and
  the company page is its XIRR on the Transactions card by construction. A
  holding inside an account has no cash flows and gets none. See Stage 10cf.
- `scripts/lib/classSwitch.mjs` — WHAT A FUND'S CLASS SWITCH DOES TO THE FAMILY'S
  COST. Buoyant moved both folios from Class A1 into A4 and restated the units'
  cost at the switch-day NAV; this carries each dated contribution through the
  switch at the fund's own unit ratio and sets the holding's cost to what was
  PAID, under two gates the statements supply. Used by `build-book` alone. See
  Stage 10bv.
- `src/lib/lookthrough.ts` — what a fund the family holds DISCLOSES, and
  `companyExposure`: ONE definition of this family's exposure to a COMPANY, both
  halves kept apart, read by the Portfolio Monitor's stock axis and by Sector
  Composition's Consolidated view. `src/lib/useStockExposure.ts` assembles its
  three inputs once. See Stage 10aq. `companySectorIndex` is its sector half as a
  `securityKey` → sector map — a PROJECTION of the same function, never a second
  resolver — which is how Family & Entities classifies a company the same way
  Sector Composition does over a set of its own. See Stage 10bq.
- `src/lib/heldThrough.ts` — EVERY WAY THE FAMILY HOLDS ONE COMPANY, for the
  company page's Position by account table: the statement rows filed by ROUTE
  (their own accounts, a PMS manager's mandate, anything else) and one DERIVED
  line per family member per fund whose filing names the company — the same
  `familyValue` the Monitor's stock axis sums, never added into the measured
  figures. `measuredTotals` strikes the average cost over the units that REPORT
  a cost, never over every unit. See Stage 10ck.
- `shared/aifCategory.mjs` — WHICH SEBI CATEGORY AN AIF IS, read from the two
  places the statements print it, and WHICH SIDE OF THE BOOK that puts a holding
  on. Read by BOTH `build-book` (which generates `Position.marketSide` and the
  listed / private / not-placed split) and the browser through
  `src/lib/aifCategory.ts`, so the book and the AIF drill-down cannot file one
  fund two ways. Category III trades LISTED securities; Categories I and II are
  private capital; a fund whose own name says private equity or venture is
  private whichever it prints; and a fund printing none is on NEITHER side and is
  named. See Stage 10bp. **The family's own placing outranks all of it** —
  `FAMILY_MARKET_SIDE`, one committed table of what each fund invests in, in
  their words (Stage 10bw) — and `fundMarketSideOf` is the fund-level half a
  CAPITAL ACCOUNT is placed by, so a fund's holding and its capital account
  cannot land on different sides of the Private Market page.
  `DECLARED_AIF_CATEGORY` is the one tier of the CATEGORY that is not read off a
  statement — the FAMILY's own declaration, keyed on `securityKey`, cited, and
  only ever filling a category both printed fields leave blank; it can never
  overrule a statement, and it decides a fund's AIF drill-down section rather
  than its side. See Stage 10cd.
- `shared/separateInvestments.mjs` — THE FAMILY'S ANSWER TO WHETHER A PAIR IS
  ONE HOLDING OR TWO. Figures that coincide on two accounts' statements are
  evidence of one holding reported twice, never proof, so §4c counts such a
  pair once until the family answers. `SEPARATE_INVESTMENTS` is their answer,
  keyed on `securityKey` and the accounts named, with its date; a pair it names
  is never grouped, and a third account reporting the same figures is a new
  question. Read by `reconcile.mjs`, `build-book`, `npm run replay:dedupe` and
  the suites. See Stage 10cx.
- `shared/keptUnvalued.mjs` — HOLDINGS THE FAMILY HAVE DECIDED TO KEEP
  UNVALUED where another statement's mark could value them. Keyed on the
  account the statement names and the ISIN it prints, never on a name; the
  row's reason says what the statement says and what the family decided. It
  never values anything. See Stage 10cx.
- `src/lib/sectors.ts` — the browser's door to `shared/sectors.mjs`, so
  `build-book` and the app resolve a sector through ONE committed table. Three
  TIERS read it: the family's own statement, a fund's SEBI filing joined on the
  ISIN, and screener.in joined on the NSE symbol (`src/data/screenerSectors.json`,
  `npm run build-sectors`). A lower tier only ever FILLS AN EMPTY sector and can
  never overrule a statement — measured, 80 of the 84 companies where both have
  an answer agree, and the statement wins on all four that differ. See Stage 10at.
- `src/lib/drilldown.ts` — WHICH HOLDINGS ARE BEHIND A FIGURE. One definition per
  set, read by the page that PRINTS a figure (to build the link) and by
  `src/pages/HoldingsBehind.tsx` at `/holdings` (to list the rows). See Stage 10n.
- `shared/fifo.mjs` + `src/lib/fifo.ts` — **FIFO: THE ONE RETURN.** The first is
  the lot engine (buy / sell / class switch, oldest units first, a switch
  carrying each lot's own cost and date) plus `fifoReturnPct` — `(unrealised +
  realised) ÷ (cost held + cost of units sold)` — and `fifoFromCashFlows`, which
  runs a fund's own dated unit record; `build-book` and the suites both import
  it. The second is the only place a SET of holdings becomes a return
  (`fifoTotals`): summed before it is divided, never an average of
  percentages, and a PMS mandate the set holds whole is struck on its own
  capital since inception. Every return on every page goes through one of the
  two. See Stage 10ca.
- `src/lib/clubbedFigures.ts` — ONE ROW OVER SEVERAL STATEMENT LINES: cost, the
  units and value it covers and the gain on it struck together (`costedFigures`),
  and one mark or none (`commonMark`). See Stage 10ct.
- `shared/lotSettlement.mjs` — which sale a capital-gain lot settles, read by
  the ledger and by `build-book`. See Stage 10ct.
- `src/lib/schemeReturns.ts` — a fund's published return is refused across a
  step in its NAV series (a unit split). See Stage 10ct.
- `src/lib/taxEstimate.ts` — the tax on realised gains, per taxpayer, with the
  Act's set-off of a short-term loss against the same person's long-term gain
  inside one financial year. See Stage 10ct.
- `src/lib/returns.ts` + `src/lib/xirr.ts` — money-weighted returns (XIRR, YTD).
- `src/lib/navSeries.ts` — the DATED NAV series' presentation half: the chained
  flow-adjusted index, the nearest-EARLIER alignment against an index series, and
  the coverage stats. The series itself is generated (`BOOK_NAV_HISTORY`); this
  is what turns levels into a return the book actually earned. Each link is
  chained over the accounts valued at BOTH its ends, which is what lets the
  series start before the panel is complete. See Stage 10p and Stage 10ar.
- `src/lib/attribution.ts` — WHAT MOVED, AND WHAT THE MARKET DID. The bridge is
  generated (`BOOK_ATTRIBUTION`, struck in `attributionFrom` off the same
  snapshots the series is drawn from, so the two cannot describe different
  windows); this turns it into rows — the four labelled steps, the ranked
  contributors and detractors with a name held in several accounts counted once,
  and the managers' own one-year returns paired with their own benchmark ON ONE
  DOCUMENT. See Stage 10ar. **NO PAGE RENDERS IT since Stage 10bb**, when the
  family asked for the Return attribution section to go: the generator still
  emits the bridge on every `build-book`, and `attribution.test.ts` is the only
  thing that checks it ties — and it also carries the chain-linked NAV-series
  assertions the chart on Morning CIO still depends on. A DOCUMENTED no-caller,
  the `series.ts` treatment, and not the silent orphan this file keeps naming.
- `src/lib/indices.ts` — the four live NSE index levels (`/api/indices`), and the
  one place `NIFTY_500_SYMBOL` is named so the strip and the NAV chart cannot
  disagree about which index "Nifty 500" means.
- `src/lib/benchmarks.ts` — WHICH INDEX THE NAV CHART IS SET AGAINST. Seven
  benchmarks, each fetched through the same `/api/prices` call the Nifty 500
  line has always used, and each checked by the NAME the upstream reports
  before a close is drawn (`benchmarkIdentity`) — a symbol that looks right
  answers 200 for a different index. `?bench=` picks one; the Nifty 500 is first
  and therefore param-free. See Stage 10by.
- `src/lib/ledger.ts` — the DATED record, read from `public/audit/` at runtime (see below).
- `src/lib/schemeLabel.ts` — WHAT A MUTUAL-FUND SCHEME IS CALLED ON SCREEN. The
  AMC's own published name, joined to this book BY ISIN through
  `src/data/schemeNames.json` (`npm run build-scheme-names`), with the plan
  phrase cut to one word. Display only, on `stripDepositoryTail`'s terms:
  `securityKeyOf` is not routed through it. See Stage 10az.
- `src/lib/securityLabel.ts` — ONE NAME PER `securityKey`, ON EVERY SCREEN. One
  of the spellings the book's own statements printed, chosen by a stated rule
  (a spelling the statement cased beats one this app had to title-case, then the
  longest, then the larger holding) and applied at `PortfolioContext`, so a
  company two statements spell two ways is one option and one row. Display
  only. See Stage 10cc.
- `shared/polycabSources.mjs` — WHAT THE EXCHANGE SAYS ABOUT THE RING-FENCED
  HOLDING, read once and imported by BOTH the daily builder
  (`scripts/build-polycab-live.mjs`) and the live edge function
  (`functions/api/polycab.js`), so a committed figure and an intraday one cannot
  disagree. It also holds the IDENTITY GATES — a source that cannot echo back the
  book's own ISIN yields nothing rather than a figure with a caveat. Its read side
  is `src/lib/polycabLive.ts`, whose only caller is the Polycab page. See Stage 10bk.
- `shared/upstoxQuotes.mjs` + `shared/upstoxInstruments.mjs` — LIVE PRICES FROM
  UPSTOX, the primary quote feed. The first is the ONE reading of Upstox's full
  market quote (identity gate, previous close as `last_price − net_change`, no
  redirect followed), imported by `functions/api/quotes.js` and its suite; the
  second is GENERATED by `npm run build-upstox-instruments` — NSE symbol → Upstox
  instrument key, matched on the exact symbol or the book's own ISIN and never on
  a name. See Stage 10br.
- `src/lib/shareMovements.ts` — OPENING, PLUS, MINUS, CLOSING: the one definition
  of what the depository statements' quantity columns add to, read by the page
  that PRINTS them and by the suite that CHECKS them. `movementNet` deliberately
  excludes the encumbrance count — a pledge moves units between an account's free
  and encumbered balances and nothing enters or leaves. See Stage 10ba.
- `src/lib/txnSort.ts` — HOW THE TRANSACTION ROLLUPS ARE ORDERED, defined once
  and applied at all three levels: recent first by default, or largest. An
  absent amount sorts last rather than as zero. "Longest held" was the third
  and was DELETED from the union rather than hidden, at the family's request —
  see Stage 10az for the modes and Stage 10bg for the removal.
- `src/lib/txnLedger.ts` — THE TWO DATED RECORDS AS ONE ROW SET: the family's
  own capital and their managers' dealing, merged on the key both rollups
  already build, so a mandate that publishes both is ONE row. The MONEY stays in
  two column blocks that are never added — measured, summing them reports
  ₹291.9 Cr where the family paid in ₹221.5 Cr. See Stage 10bo.
- `src/lib/txnAxis.ts` — WHICH SECTION A DATED RECORD LANDS IN: the same three
  axes the Holdings table sections on, joined to a trade's own fields (provider
  + account number, `securityKey`, the class its STATEMENT printed). It defines
  no fourth taxonomy — `groupKeyFor` still answers — and it takes a `GroupAxis`
  rather than a `MonitorAxis`, so a transactions table sectioned by SECURITY
  does not compile. See Stage 10bg.
- `src/lib/tableView.ts` + `src/components/SortHeader.tsx` — HOW EVERY TABLE IS
  ARRANGED, defined once: the column order a reader has dragged it to, the sort
  they picked, and the header cell that offers both. A table declares its
  columns and `<Tr>` / `<TrFoot>` permute its cells from the DECLARED order into
  the reader's, so no table's cell JSX changes and an undragged table renders
  byte-for-byte what it did. The first column is the row's identity and never
  moves; an absent value sorts LAST in both directions, never as zero.
  `SortableTable` is the seam for a panel drawn inside a row, where a hook
  cannot sit. A table that must NOT be rearranged declares
  `data-table-static="<reason>"` — an upstream financial document, a transposed
  metric grid, a fixed list of facts. See Stage 10bh. The DRAG itself is
  `src/lib/columnDrag.ts`, called from `SortHeader`: a pointer gesture that
  lifts the WHOLE column — heading and every visible cell — rather than
  HTML5's picture of the heading. See Stage 10co. What a reader arranged is
  remembered in `src/lib/viewMemory.ts` — read before the first paint, one copy
  per key, kept in step across tables and browser tabs — and a saved order keeps
  the columns a tab does not draw, so arranging one tab never loses another's.
  See Stage 10cs.
- `src/lib/returnMeasures.ts` — WHICH RETURNS A TABLE SHOWS: a `?ret=` address,
  then the reader's saved pick for that page, then the default, which is every
  measure (HPR, CAGR, XIRR, YTD, CY), one column each. See Stage 10cs.
- `src/components/TreeTable.tsx` — THE STANDARD FOR A TABLE WHOSE ROWS OPEN
  INTO OTHER ROWS. A row opens into ROWS OF THE SAME TABLE, in the same columns
  — never into a table drawn inside a cell, whose columns cannot line up with
  the ones above it. Four kinds of row (a section band that can close, a parent
  whose whole row is the control, a child under a tree guide drawn in the FIRST
  cell only, and an italic adjust row such as "Counted once"), and one
  `ExpandAllButton`. The columns, the sort and the drag stay `useTableView`'s,
  so a dragged column moves a parent, its children and the totals together.
  The Portfolio Monitor's holdings table adopts it at `density="dense"`, with a
  depth-2 row for a statement line's dated contributions. See Stages 10bx and
  10ch.
- `src/lib/privateBook.ts` — THE PRIVATE MARKET TABLE'S ONE MODEL. A folio is
  one account's view of one fund; a fund row, a member row and a section band
  are all built from folios, so no two can disagree. Fund rows are
  CONSOLIDATED and folio rows AS PRINTED, with the difference named on an adjust
  row; capital is never deduped; a total sums only what was reported and says
  how much that covers. See Stage 10bx.
- `scripts/lib/reviewBook.mjs` — THE PRIVATE BOOK, FROM THE FAMILY'S OWN
  CONSOLIDATED REVIEW. On 5 Oct 2026 the family asked for the review to be the
  SOURCE of every private-market figure, so `reviewBookLayer` turns its four
  private blocks — PE Funds, the unlisted shares, `Private Investments` and the
  Debt tab's one credit line — into POSITIONS, and names the statement rows they
  supersede. Called by `build-book` alone. It reads the workbook through
  `scripts/lib/reviewPrivateRead.mjs` (by header text) and joins a line to a
  statement row through `shared/reviewPrivateJoin.mjs`, and it **THROWS, NAMING
  THE LINE, rather than guess**: every one of the 87 `Private Investments` lines
  must be held, named elsewhere or written off; the lines must add to the tab's
  own printed Total; a valued line's parts must add to its cost and value and tie
  to the review's own Transactions closing; and every member must tie to the
  review's Investorwise summary. See Stage 10dh.
- `shared/reviewHolders.mjs` — WHOSE EACH REVIEW LINE IS, and what it replaces.
  The family's own answer, committed: `PRIVATE_INVESTMENT_HOLDERS` (the at-cost
  lines, split by member where a line is shared), `VALUED_HOLDERS` (the lines the
  review values, with their units and the split's reason),
  `PRIVATE_INVESTMENT_ELSEWHERE` (a line counted somewhere else), `SUPERSEDED`
  (the statement rows the review now stands for, by kind) and
  `FRESHER_STATEMENT` (where a statement says something different, named on the
  row's hover and never dropped). A line nobody holds goes to `NOT_ATTRIBUTED`
  rather than to a guess. See Stage 10dh.
- `Position.review` / `.valuedAtCost` / `.reviewNote` / `.reviewSource` — WHICH
  ROWS ARE THE REVIEW'S, AND WHICH ROW OF IT. `reviewSource` carries the sheet,
  the block and the ROW NUMBER, so any private figure on any screen can be
  opened against the workbook; `valuedAtCost` is what makes an at-cost line
  carry no gain and no return (`isValuedAtCost`, `AT_COST_BUCKET`,
  `AT_COST_RETURN` in `src/lib/analytics.ts`). See Stage 10dh.
- `src/lib/nav.ts` — THE ONE NAV TABLE, read by the sidebar AND by every page's
  breadcrumb, so the two cannot file a page under different groups.
  `src/components/PageNav.tsx` renders the back / forward / home controls and
  that crumb on every route. See Stage 10bh.
- `src/lib/memberScope.ts` + `src/components/MemberScopeSelect.tsx` — WHOSE
  BOOK THE DASHBOARD SHOWS. The top bar's selector (Whole family by default,
  any members or trusts ticked together) writes `?members=`, and
  `PortfolioContext` narrows `portfolio` and `statementPortfolio` to those
  members' accounts at ONE seam (`scopePortfolio`), so every page follows with
  no edit of its own. `useMemberScope()` reads it, `<WholeFamily>` /
  `useWholePortfolio()` undo it for Family & Entities, and `OutOfScope` is what
  a page about another member's holding draws. See Stage 10di.
- `src/lib/fundNavs.ts` — THE PUBLISHED NAV'S READ SIDE. `applyFundNavs` is
  applied at ONE seam (`PortfolioContext`, beside `applyQuotes`), which is what
  makes a current fund value reach every page rather than needing a per-page
  edit. It moves only what a price may move (§6) and deliberately never sets
  `live`: a quote is intraday and a NAV is struck once after the close, and the
  two must never be added. See Stage 10bn. `depositoryCashHoldings` is its
  second job: the arbitrage and liquid funds a depository reports on an account
  that sent no holding statement, valued at `units × published NAV` on the LIVE
  basis only, behind one switch (`VALUE_DEPOSITORY_CASH_UNITS`). See Stage 10ce.
  Since Stage 10cy the same statement's OTHER mutual funds are valued the same
  way (`depositoryFundHoldings`, `VALUE_DEPOSITORY_FUND_UNITS`); an ETF there
  is still refused.
- `src/lib/depositoryShares.ts` — THE LISTED SHARES NO STATEMENT PRICES: a
  transaction-only demat's closing balances, and a holding statement's shares
  printed at no rate or at face value. Valued at the live quote on the LIVE
  basis only, and a share the feed has not priced is not a row. The symbol
  comes from identifiers that must agree, never from a name. See Stage 10cy.
- `src/lib/recordedHoldings.ts` — WHAT A STATEMENT RECORDS AND NOTHING VALUES,
  filed under one company (`homeKey`), with the look-through's join set
  (`lookthroughCompanies`), the family's name for it (`recordedLabel`) and an
  account's own line (`recordedLineFor`). See Stage 10cz.
- `src/lib/format.ts` — currency / percent / number formatting; `fmtFromBase` (via `PortfolioContext`) is the standard money formatter.
- `src/components/*` — shared UI (`Card`, `StatTile`, `SelectableTiles`, `SearchInput`, `Pill`, `BasisPill`, `Auditable`, `Absent`, …). Reuse these rather than re-styling tables inline.
- `src/context/PortfolioContext.tsx` — loads the book, holds display-currency state, detects the empty book.
- `scripts/ingest/*` — the statement intake pipeline. `lib/bundle.mjs` splits a
  multi-report PDF; `lib/sheet.mjs` reads the spreadsheets — the format is
  sniffed from the BYTES and never the extension, because a broker names an HTML
  table `.xls` and a bank names a genuine legacy BIFF workbook the same thing,
  and BIFF is read for its STORED values rather than its displayed text (see
  `readBiff` and Stage 10dj); `providers/*` is one reader per document family,
  and `providers/bankStatement.mjs` is the one that reads a document about
  nobody's INVESTMENTS — the family's own savings accounts at two banks,
  published only where the tape ties to every figure the statement prints, and
  carried in no total on this site.
- `src/data/glowData.ts` also exports `BOOK_COMMITMENTS` — what the family has
  promised a drawdown fund, what it has CALLED, what has been PAID, what is
  called and still unpaid, and the fund's own DATED calls. Not a holding, and
  never summed into NAV. `src/lib/capitalCalls.ts` is its read half: the
  per-scheme rows, the coverage-aware totals and the dated call history. The
  1/3/6-month windows it used to carry are DELETED since Stage 10bs — no fund
  here publishes a forward schedule, so they could only ever read "nothing
  scheduled". See Stage 10ay.
- `src/lib/enteredCalls.ts` + `src/components/EnteredCalls.tsx` +
  `functions/api/capital-calls.js` — THE FAMILY'S OWN UPCOMING CAPITAL CALLS,
  typed into the Private Market fund table's "Capital call" column and saved in
  a shared Cloudflare KV store (binding `GLOW_STORE`) so every reader sees the
  same list. What the family has been TOLD is coming, never a statement figure:
  nothing here reaches `glowData.ts`, and no entered amount is ever added into
  Called, Paid in or Still to call. Until the binding is connected the column
  says saving is not switched on — never an empty column. See Stage 10bs, and
  Stage 10cl: every cell names that cause in a word ("Not set up") and opens an
  editor giving the one-time Cloudflare steps (`SWITCH_ON_STEPS`) — the same one
  step that switches on the shared tile layouts below.
- `src/lib/fundReturns.ts` — WHICH RETURN A PRIVATE FUND SHOWS, AND WHY. Each
  fund row's dated record (every call and every payout off its own capital
  account, over the row's own deduped folios) and `fundMeasuredReturn`, which
  resolves the Monitor's measures for a fund — HPR, CAGR, XIRR, YTD, CY and the
  methodology — with a reason that is TRUE of that fund wherever it refuses one.
  The picker and the one-column-per-measure mechanics are shared with the
  Monitor (`src/components/ReturnMeasureSelect.tsx`, `src/lib/returnColumns.ts`).
  See Stage 10bw — and Stage 10bx, where the Private Market master table
  resolves a FOLIO row through the same function on its one statement.
- `src/lib/searchIndex.ts` + `src/components/SmartSearch.tsx` — THE SEARCH BOX
  IN THE TOP BAR. One index over every holding, mandate, account, member, page,
  tab, category, sector and headline figure the app has, each with the address
  that opens it. (A question went to Muns until the family paused the chat —
  Stage 10bz.) Built from the book on every render
  and never from a hand-kept list, and the ring-fenced security is in none of
  it. See Stage 10bw.
- `src/lib/tileSets.ts` + `functions/api/tile-sets.js` — WHICH KPI TILES EACH
  PAGE SHOWS, remembered for everyone. `SelectableTiles` (Private Market and
  Morning CIO) saves a picked layout to the same `GLOW_STORE` KV binding, one key
  per page, METRIC IDS AND NOTHING ELSE; `localStorage` is the instant copy the
  page paints from and the whole memory where the store is not connected.
  `chooseTileSet` is the one precedence rule — a `?tiles=` address, then a change
  made here the store never confirmed, then the shared layout. See Stage 10cb.
  A tile is ADDED from the strip's own last cell, the ADD TILE card, and saved
  the same way — see Stage 10cl.
- `src/lib/priceAlerts.ts` + `src/lib/usePriceAlerts.ts` — WHETHER A PRICE ALERT
  HAS FIRED, decided once for a holding's alert boxes and Morning CIO's All
  alerts tab: which price (a live quote, then a fund's published NAV, NEVER a
  statement mark), which way each of the five kinds fires, and four states —
  reached, watching, checking, unchecked — of which only the first two are
  verdicts. The levels are the family's own, in `watchlist.ts`, per browser.
  `alertBoxesHref` is the ONE address of a holding's alert boxes — its My
  targets tab — read by every link that opens them. See Stage 10cq.
- `src/lib/researchLevels.ts` + `src/lib/researchSync.ts` +
  `src/lib/useResearchSync.ts` — EVERY LEVEL ON A LISTED SHARE ALSO GOES TO GLOW
  CENTRAL RESEARCH, which checks it against its own live price and raises it in
  its All Alerts and AI Alerts. The first decides what is sent — NSE symbol, ISIN
  and the five levels, as a seed, a set or a clear — what an answer means, how
  the All alerts footer words the count (`summaryLine`) and how a card words
  where its levels went (`researchLine`), all PURE; the second
  sends it and remembers what arrived (`glow:research-levels/v1`, never inside
  the store); the third is the one mount, in the app shell. A fund or an AIF has
  no NSE symbol, so its levels stay here and its card says so. See Stage 10cq.
- `src/lib/insideMovers.ts` + `src/components/InsideMovers.tsx` — THE COMPANIES
  INSIDE THE AIFs AND THE MANDATES, ranked by the day's move — the movers
  toggle's third branch. A wrapper is NEVER a row: the mandate half is MEASURED
  (a PMS reports every share, so a rupee impact too) and the fund half DERIVED
  from what a fund discloses, and the two money figures are never added. The
  percentage is the exchange's own figure, the same either way, which is why one
  card can rank both halves. Deliberately NOT routed through `companyExposure`:
  `src/lib/fundDisclosures.ts` reads `deriveFundDisclosures`' own read model —
  the AIFs' own snaps, a name and a weight, never `lookthrough.json`, on which
  every stock-axis figure rests. See Stage 10dl.
- ...and `BOOK_POLYCAB` — the RING-FENCED promoter holding, a real position kept
  out of `BOOK_POSITIONS` and therefore out of every total, split, allocation and
  holdings table. `src/pages/Polycab.tsx` is its ONLY reader and reads it
  directly rather than through `PortfolioContext`, so it cannot leak back into a
  portfolio figure. See **The ring-fence**.

