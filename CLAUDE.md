# Glow Ventures Family Office — Investor Cockpit

A Vite + React + TypeScript single-page dashboard for the Glow Ventures Family Office.
The book is assembled offline from **PDF statements issued by several wealth
platforms** and baked into `src/data/glowData.ts`; the display layer converts INR
(the base currency) into the selected display currency.

## How to ship — read this first

*"this is a live dashboard and main will keep moving but the code will not
unless something is pushed … i want things pushed"* — the family, 24 Sep 2026.

- **Default: push, open the PR, and merge it to `main` yourself** as soon as
  `build` and the checks for what you changed are green. Do not leave a fix
  waiting on a PR. Hold a PR open only when the user says so in that request
  (for example "do not merge until I tell you").
- **Be quick.** Run the checks that cover the change: `build`, the relevant
  suite, and `ONLY=<routes>` for the pages you touched. A full `check:pages`
  sweep is not needed before every merge. Keep the stage notes in this file
  short.
- Before merging, `git fetch origin main` and check that no other change has
  taken your stage letter.

## The standing rule

**No figure is ever fabricated.** If the source doesn't carry a number, the UI
renders `—`. Not a zero, not an estimate, not an interpolation, not a plausible
default. This applies to every layer:

- A metric needing data the model doesn't carry (per-entity XIRR/YTD, which need
  dated cash flows) renders `—` until an ingest supplies it.
- An **empty book renders an empty state, never zeros.** `₹0` is a measurement;
  "no statement yet" is the absence of one, and they look identical on screen.
  `PortfolioContext` exposes `bookIsEmpty` and `<Gate>` in `App.tsx` stops every
  analytics route on it.
- A price the quote feed couldn't supply keeps its statement mark and is flagged
  as not-live, rather than passing a month-old mark off as current.
- The ingest classifier writes `null` for a field it can't determine, and files
  it can't place go in a "could not classify" section rather than under a guess.

### The preview convention, and the two lines it must not cross

`src/components/Preview.tsx` rendered a GREYED SAMPLE so the client could see
the shape of a FOOS-spec screen before its source existed. That is legitimate
for a page that is nothing but a mock. It went wrong twice, in ways worth naming
because both looked compliant — badged, hatched, muted, `title`-tagged:

***THE COMPONENT IS GONE SINCE Stage 10bc AND THE RULE BELOW IS NOT.*** Its last
caller was Exposure & IPS, which the family asked to remove — and that caller
imported exactly ONE of its seven exports, the other six having been uncalled for
some time. A module nothing calls is the dead-code-that-looks-alive failure this
file keeps naming, so it got the `exportDeck.ts` treatment rather than being left
exported and dead. What follows is a rule about what a greyed sample may never
do, and a rule lives here rather than in an uncalled component; a future page
that needs one writes the badge again and obeys it.

**1. A preview figure must never be arithmetic on the family's own money.**
`PublicDashboardView` printed Target value = `marketValue × 1.25`, Pending to
invest = `× 0.18`, Target weight = `weight × 1.3 + 0.4`, Fair value =
`(price ?? cost ?? 100) × 1.18` — the `100` a per-share price invented outright.
Each sat in the same ROW as that holding's real market value. `ExposureIPS`
computed `gap = actual − desired` from a real actual and a typed-in desired, and
the gap is the only figure a reader acts on. Greying a number marks it not-live;
it does not stop it being a number ABOUT THIS HOLDING. The book's own rule for
this exact field already said so: a price nobody set is `null`, never a default,
because a default is "a fabricated figure produced by a default, which is the
exact failure this book exists to prevent". `× 1.25` is worse than `0` — it is
plausible. **These render `AbsentCell` with a reason.**

*`PublicDashboardView` itself has since been REMOVED* — the family asked for the
Portfolio Monitor's third tab to go, so the component, its route in
`check-pages.mjs` and the block in `check-family-inputs.mjs` that drove it are
all gone, and the remaining check asserts the tab is ABSENT rather than deleting
the test with the feature. The judgement fields it displayed are untouched:
`watchlist.ts` still stores target price, fair value, its reference year, the
valuation method and the target weight, and a name's own company page still
reads and writes them. Only the table that showed them beside the book is gone.
The lesson above stands on its own and is why this paragraph names the file
rather than quietly dropping it.

(The four cards on the company page that recorded a permanent absence —
Business segments, Operating metrics, Value chain, Calendar — have since been
REMOVED too, at the same request. Nothing wired here publishes any of them for
any company; the absence is recorded in `docs/API-PROBE.md` rather than drawn as
four dashed boxes that read, during an upstream outage, as four more failures.
What must never come back is the INVENTED version they replaced.)

**2. A preview must never assert a FACT about a real, named counterparty.**
Alerts carried "Aristos: fund manager resigned" at high severity; Thesis &
Triggers, "Carnelian: FM change flagged in filing"; Knowledge, a dated manager
meeting where the family "exited on governance concerns after promoter pledge
rose". Aristos is the strategy SVAN runs for two of these accounts; Carnelian and
Green Lantern run two more. **A greyed number reads as illustrative; a sentence
does not.** A reader who sees that their manager resigned has learnt something,
and no badge unlearns it. Each of those cards now states the CONDITION it would
evaluate — true whether or not it ever fires — and says plainly that nothing has
fired. Index-cycled categorical attributions are the same failure in miniature:
`VAL_METHODS[i % 5]` assigned "DCF" to real companies by ROW ORDER, so sorting
the table changed which company was valued by DCF.

**A third round of the same failure, found by finally measuring production.**
The client's URL arrived only after these screens shipped, and `MUNS_TOKEN`
lives in the Cloudflare environment and nowhere else — so several endpoints
carried an explicit UNVERIFIED AGAINST THE LIVE API comment, and every
preview built around them had never been checked against what the upstream
really returns. Probed on 2026-08-11 (`scripts/dev/live-api-proxy.mjs` serves
the LOCAL build with `/api/*` forwarded to the deployment), all of them answer.
That measurement removed the excuse for five more fabrications, each of which
had been sitting on the client's live dashboard:

- **Company page** — `Business segments 58/27/15`, `Geography India 72 / US 18 /
  RoW 10`, `Capacity 11.0 mn units · Utilisation 76%`, `Customer A / Supplier X
  · Top-5 concentration 38%`, and a calendar asserting `Next earnings 24 Oct
  2026` — all under a real company's name. The live `financials` response was
  then checked for every one of them and carries none: its sections are Pros &
  Cons, About, Stock details, Shareholding, Balance Sheet, P&L, Quarterly
  Results, Peer Comparison. Absent, each naming its source.
- **Exposure & IPS** *(the PAGE has since been REMOVED at the family's request —
  see Stage 10bc. The entry stays for the reason the Economy ones below it do:
  the lesson is about what was PRINTED, not about which route printed it)* —
  `Portfolio movement: MoM +2.1% · QoQ +6.4% · YoY +18.7%`
  about this family's real ₹335 Cr book, with its own caption already saying the
  book cannot measure it. And three GAP dimensions whose **ACTUAL** columns were
  typed in — the desired side was a known fabrication, the actual side claims a
  measurement.
- **Economy / Macro Research** — release calendars asserting real prints in
  SENTENCES: `India CPI actual 4.83%`, `RBI Policy Rate — held as expected;
  stance stays 'withdrawal of accommodation'`, `China GDP actual 4.7% — miss on
  weak property`. The RBI policy rate is IN the harvest store, so the page was
  printing a fabricated policy rate while carrying the real one.
- **Every Economy row's `value` and `chg`** — `Manufacturing PMI 58.1`,
  `Capacity Utilisation 76.4%`, `Household Debt / GDP 38.9%`. **The FIELDS were
  deleted from the `Row` type, not just the render**, so reintroducing one is a
  type error. Deleting a render leaves the numbers one line from returning; the
  same reasoning that removed `custodianOf()` rather than fixing it.

*(The **Economy** and **Macro Research** pages named in those last two entries
have since been REMOVED at the family's request — see Stage 10x. The entries
stay because the lesson is about what was PRINTED, not about which route printed
it, and the `Row`-type deletion above is still the model for how a fabricated
field is retired. The same treatment `PublicDashboardView` gets further up.)*

The test to apply: **would this still be honest if the badge were cropped out of
a screenshot?** Sample macro series on a page with no family data pass it.
Anything sharing a row, a tile or a sentence with the book does not.

### The presentation half of the same rule

The rule above governs the model. It has a twin on screen, and the screen is
where a reader actually forms a belief:

**A measured zero and an absent measurement must never look the same.** Any
tile, chart, table cell or total whose underlying collection is EMPTY renders
`—` with a one-line reason — never `0`, never `0.00%`, never an empty chart
frame with axes drawn around nothing. `src/components/Absent.tsx` is the one
place that renders it: `AbsentValue`, `absentTile(reason, hint)`, `AbsentCell`
for one row among many that do have the figure, and `AbsentSection` for where a
chart would be. Every one of them takes the reason as a required argument,
because "no data" tells a reader nothing about whether to go and find something.

Three corollaries that this book actually needed:

- **Never blend a missing value into a total as zero.** `sumOrNull` in
  `src/lib/analytics.ts` returns `null` when every input is null and skips the
  nulls otherwise. Averaging a missing account in as zero drags the answer
  towards a number nobody measured.
- **A figure that exists for SOME accounts is shown for those and the rest are
  named.** Realised gains exist for 7 of 23 accounts here; the other 16 render
  "no capital gain statement issued for this account in this drop", and the total
  says how many it covers.
- **A COMPUTED zero is legitimate and stays** — cash has no P&L, a net realised
  loss owes no tax — but the reason goes in the tile, not in a tooltip. A reader
  scanning `₹0` beside a −₹1.97 Cr loss must be able to see it is the arithmetic.
- **A CAPTION THAT NARROWS A FIGURE IT DOES NOT NARROW is the same failure as one
  that widens it.** Morning CIO's Capital invested tile printed "cost in · listed
  only" over a sum that has always run across `consolidated` — every account,
  every asset class — and the tile beside it was headed "Listed return". The
  locals were named `listedMV` / `listedCost` / `listedPnL` from the days when
  every account in the drop was a listed-equity mandate, and the labels followed
  the names rather than the arithmetic. They are `bookMV` / `bookCost` /
  `bookPnL` now, the captions say "whole book", and the tile names the **6 of
  309 positions whose statement reports no cost** — `sumOrNull` skips them, so
  the total's own caption is where that has to be said.
- **AND A TOTAL MUST TIE TO ITS OWN COLUMNS.** That page's allocation table put
  the MONEY-WEIGHTED whole-book return in the Total row of a column whose every
  other cell is return-on-cost, so the footer read +28.3% beside its own Invested
  ₹394.1 Cr and Current ₹461.0 Cr — which is +17.0%. Both figures were right on
  their own terms and a long paragraph underneath explained the difference; the
  family asked for the paragraph to go, and a reader who divides one printed cell
  by another and gets a third answer has found a contradiction no popover
  rescues. The footer is on its rows' basis now. The money-weighted figure keeps
  its place — in that cell's popover, in the Consolidated return tile's popover
  and on the Book performance card — each stating the fraction of the book it
  covers, because it can only be struck on the accounts that publish an opening
  portfolio value.

`npm run check:pages` renders every route headlessly and reports console errors,
failed requests, and any on-screen `₹0` / `0.00%` with its surrounding text. The
last of those is a lead rather than a verdict — a bar chart's ₹0 axis tick and a
cash holding's genuinely-zero return both match, and both are correct.

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

## The data model, and why it differs from a workbook-sourced book

This book comes from PDF statements across several wealth platforms, not from one
spreadsheet. Four things follow, and they are load-bearing:

**What is actually in `source/` today.** NINE DELIVERIES, and every one stays:
the original set at the top of `source/`, the client's `august-2026/` folder,
`august-2026-b/` to `august-2026-f/` — statements that arrived after it —
`september-2026/`, the client's `Jaisinghani_Reports.zip` (Stage 10da), and
`october-2026/`, Green Lantern 510861 since inception (Stage 10dk). **ALL NINE
have been through `npm run extract`**: `august-2026-f/`'s two outlined-text
statements are read by rendering their glyphs (see its own section) and its third
file is a register held out of the book by decision. 38 provider names in the
archive — ASK's PMS, the ASK Absolute Return Fund and Marathon are the newest —
**64 accounts** in the book, seven holders (three of them family trusts, Stage 10db)
and one `Not attributed to a member` bucket (Stage 10dh), and **363 leaf
files** — of which **309 documents** are in the archive (18 of them spreadsheet
exports read as WITNESSES of the PDF beside each), 242 read fully, 64 partially and
**exactly ONE not at all**:

- Bharat's HDFC NSDL holding statement from `august-2026-e/`, which is a SCAN —
  four JPEG pages of photographed paper, so there is nothing any reader or any
  renderer can recover. Reported as `no-text-layer`, never as a missing reader,
  because those two send the next person to do completely different things and
  only one of them is possible.

Two more documents are `failed` in the archive and are NOT that: the adviser's
consolidated review workbook and the family's investment register are both read
perfectly and are **held out BY DECISION**, because neither is a statement. The
archive records the decision so a future session cannot mistake it for a gap.

**AND `npm run coverage:source` PROVES THERE IS NO OTHER GAP.** The extraction
report answers *did the documents we read tie out?*; that question presupposes a
prior one nobody could answer without reading a directory listing by hand — *is
there a file in `source/` whose data never reached anything?* `scripts/source-coverage.mjs`
accounts for every leaf file in exactly one class and **exits non-zero if any is
`unread`**, so a delivery that lands a file nobody reads cannot pass silently.
Measured on the September 2026 delivery (Stage 10da): 277 read, 4 read via a
byte-identical twin, 18 read as witnesses of the PDF beside them, 2 held out by
decision, 58 macOS `__MACOSX/._*` resource forks (checked per file for a `%PDF`
header, never assumed from the path), 2 password notes excluded by policy, and
**0 unread** — 361 leaf files. On the October 2026 delivery (Stage 10dk) it is 363
leaf files, 279 read, and still **0 unread**. `docs/SOURCE-COVERAGE.md` is its output; the counts in this
paragraph come from it and from `docs/BOOK-REPORT.md`, and should be re-read from
them rather than edited to taste.

Every encrypted statement opens, every issuer whose statements carry text has a
reader, and `source/README.md` carries the rule for adding the next delivery.

**A MONTHLY DROP REISSUES THE SAME FILENAMES, and both issues must survive.**
`LKP 2.zip`, `GREEN LANTERN - ANKITA.zip` and `GREEN LANTERN - AJAY .zip` all
arrive again in August. `lib/bundle.mjs`'s caller used to expand every archive
into `source/_extracted/<basename>/`, so the later drop overwrote the earlier
one in place — and that is not a cosmetic clash, because a SNAPSHOT supersedes
but a DATED ROW does not. The capital gain lots and transaction tape carried
only by the July issue would have gone with the folder. The extraction path now
mirrors the archive's own path under `source/`, which is byte-identical for
every ZIP already at the top level.

| Provider | Account | Owner | As of | Market value |
| --- | --- | --- | --- | ---: |
| Consolidated review (MOPWM) | MOPWM | Ajay Jaisinghani | 2026-06-30 | ₹125.40 Cr |
| Sanshi Fund | 9039671821 | Aarti Jaisinghani | 2026-06-30 | ₹97.68 Cr |
| ICICI Bank (NSDL demat) | 49794950 | Ajay Jaisinghani | 2026-03-31 | ₹63.76 Cr\*\* |
| Buoyant Capital | 103473 | Ajay Jaisinghani | 2026-08-31 | ₹50.33 Cr |
| Carnelian Asset Management and Advisors Pvt Ltd | 3517383 | Ajay Jaisinghani | 2026-08-10 | ₹39.53 Cr |
| Consolidated review (MOPWM) | MOPWM | Bharat Jaisinghani | 2026-06-30 | ₹37.26 Cr |
| Helios Mutual Fund | 10355977 | Ajay Jaisinghani | 2026-08-07 | ₹31.00 Cr |
| Sanshi Fund | 9069671554 | Ankita Jaisinghani | 2026-06-30 | ₹29.42 Cr |
| Sanshi Fund | 9039671912 | Ajay Jaisinghani | 2026-06-30 | ₹29.35 Cr |
| Consolidated review (MOPWM) | MOPWM | Ankita Jaisinghani | 2026-06-30 | ₹29.04 Cr |
| Sanshi Fund | 9069671634 | Ajay Jaisinghani | 2026-06-30 | ₹28.46 Cr |
| Buoyant Capital | 103472 | Ankita Jaisinghani | 2026-08-31 | ₹28.27 Cr |
| Motilal Oswal Founders Fund | 90410016104 | Ajay Jaisinghani | 2026-07-31 | ₹21.83 Cr |
| Motilal Oswal Active Momentum Fund | 904168868444 | Ankita Jaisinghani | 2026-08-06 | ₹21.42 Cr |
| V.E.C Assago Capital Management LLP | 128005 | Ajay Jaisinghani | 2026-08-13 | ₹20.29 Cr |
| Sanshi Fund | 9039671854 | Bharat Jaisinghani | 2026-06-30 | ₹19.57 Cr |
| Goldstandard Wealth Private Limited | 100023 | Ajay Jaisinghani | 2026-08-11 | ₹18.80 Cr |
| SVAN Investment Managers LLP | 8710067 | Ajay Jaisinghani | 2026-07-31 | ₹16.45 Cr |
| Carnelian Bharat Amritkaal Fund | 4551 | Ankita Jaisinghani | 2026-07-31 | ₹16.31 Cr |
| Green Lantern Capital LLP | 510861 | Ajay Jaisinghani | 2026-07-27 | ₹11.45 Cr |
| Motilal Oswal Delphi Equity Fund | 9049241536 | Ajay Jaisinghani | 2026-06-30 | ₹11.13 Cr |
| Motilal Oswal Founders Fund | 90410016093 | Ankita Jaisinghani | 2026-07-31 | ₹10.99 Cr |
| SVAN Investment Managers LLP | 8710090 | Bharat Jaisinghani | 2026-07-31 | ₹10.70 Cr |
| India SME Investments | 175962 | Ajay Jaisinghani | 2026-06-30 | ₹9.56 Cr |
| Goldstandard Wealth Private Limited | 100022 | Ankita Jaisinghani | 2026-08-11 | ₹8.02 Cr |
| Consolidated review (MOPWM) | MOPWM | Not attributed to a member | 2026-06-30 | ₹7.26 Cr |
| V.E.C Assago Capital Management LLP | 128004 | Ankita Jaisinghani | 2026-08-13 | ₹6.50 Cr |
| Green Lantern Capital LLP | 510854 | Ankita Jaisinghani | 2026-07-27 | ₹5.80 Cr |
| Neo Infra Income Opportunities Fund | 9039920536 | Ajay Jaisinghani | 2026-06-30 | ₹5.55 Cr |
| India SME Investments | 175964 | Bharat Jaisinghani | 2026-06-30 | ₹3.19 Cr |
| India SME Investments | 177302 | Ankita Jaisinghani | 2026-06-30 | ₹3.19 Cr |
| Baring Private Equity India Fund | AIFM_BPEPF6_0584 | Ankita Jaisinghani | 2026-03-31 | ₹1.88 Cr |
| Sky Capital Rising Titans Fund | SKY003 | Bharat Jaisinghani | 2026-07-31 | ₹1.72 Cr |
| Sky Capital Rising Titans Fund | SKY022 | Ajay Jaisinghani | 2026-07-31 | ₹1.50 Cr |
| 360 ONE Private Wealth | 37702 | Ajay Jaisinghani | 2026-09-30 | ₹1.46 Cr\* |
| 360 ONE Private Wealth | 60117 | Bharat Jaisinghani | 2026-09-30 | ₹1.46 Cr\* |
| Consolidated review (MOPWM) | MOPWM | Bharat Jaisinghani Family Trust 2 | 2026-06-30 | ₹1.35 Cr |
| Consolidated review (MOPWM) | MOPWM | Bharat Jaisinghani Family Trust 3 | 2026-06-30 | ₹1.35 Cr |
| Molecule Ventures LLP | 7810404 | Ajay Jaisinghani | 2026-07-31 | ₹1.16 Cr |
| LKP Securities | 98245 | Bharat Jaisinghani | 2026-03-31 | ₹0.99 Cr |
| Transition Venture Capital | TVC262 | Bharat Jaisinghani Family Trust 2 | 2026-03-31 | ₹0.97 Cr\* |
| Transition Venture Capital | TVC263 | Bharat Jaisinghani Family Trust 3 | 2026-03-31 | ₹0.97 Cr\* |
| Sky Capital Rising Titans Fund | SKY023 | Bharat Jaisinghani Family Trust 2 | 2026-07-31 | ₹0.75 Cr |
| Sky Capital Rising Titans Fund | SKY024 | Bharat Jaisinghani Family Trust 3 | 2026-07-31 | ₹0.75 Cr |
| ICICI Prudential Mutual Fund | 36378950 | Ajay Jaisinghani | 2026-10-05 | ₹0.56 Cr |
| ICICI Prudential Mutual Fund | 36379637 | Bharat Jaisinghani | 2026-10-05 | ₹0.38 Cr |
| ASK Investment Managers Limited | 10034025 | Ajay Jaisinghani | 2026-09-08 | ₹0.34 (a MEASURED residue — the mandate is closed; its bank balance is under the ₹1,000 floor) |
| ASK Investment Managers Limited | 10032723 | Ankita Jaisinghani | 2026-09-08 | ₹0.01 (a MEASURED residue — the mandate is closed; its bank balance is under the ₹1,000 floor) |
| 360 ONE Alternates Asset Management | 1000632 | Ajay Jaisinghani | 2026-05-18 | — (income-only folio; the units are marked elsewhere) |
| 360 ONE Alternates Asset Management | 1000633 | Bharat Jaisinghani | 2026-05-18 | — (income-only folio; the units are marked elsewhere) |
| 360 ONE Private Wealth | 60066 | Ajay Jaisinghani | 2026-09-30 | ₹0 (a MEASURED zero — the statement prints a nil portfolio) |
| 3P Investment Managers | 3000048 | Ajay Jaisinghani | 2026-07-31 | ₹0 (a MEASURED zero — every class redeemed to nil) |
| ASK Absolute Return Fund | 9039917111 | Ajay Jaisinghani | 2026-03-31 | ₹0 (a MEASURED zero — every series redeemed to nil) |
| ASK Absolute Return Fund | 9039917144 | Ankita Jaisinghani | 2026-03-31 | ₹0 (a MEASURED zero — every series redeemed to nil) |
| HDFC Bank (NSDL demat) | 67786137 | Bharat Jaisinghani Family Trust 3 | 2026-08-29 | — (**its private holding is counted under the review**, Stage 10dh) |
| HDFC Bank (NSDL demat) | 67786547 | Bharat Jaisinghani Family Trust 2 | 2026-08-29 | — (**its private holding is counted under the review**, Stage 10dh) |
| HDFC Mutual Fund | 16180583 | Bharat Jaisinghani | 2026-08-06 | ₹0 (a MEASURED zero — both schemes redeemed to nil) |
| Marathon Trends Advisory Pvt Ltd | 5110758 | Ankita Jaisinghani | 2026-09-09 | — (**no holdings statement** in the drop — its dated statements only) |
| Marathon Trends Advisory Pvt Ltd | 5110837 | Ajay Jaisinghani | 2026-09-09 | — (**no holdings statement** in the drop — its dated statements only) |
| Motilal Oswal Financial Services (demat) | 1201090012539150 | Ajay Jaisinghani | 2026-07-31 | — (**transaction statement only**, no holdings) |
| Motilal Oswal Financial Services (demat) | 1201090012838316 | Ankita Jaisinghani | 2026-07-31 | — (**quantity only** — the Rate column is the last movement's price, Stage 10cz; 10 of its lines are private and counted under the review, Stage 10dh) |
| Motilal Oswal Financial Services (demat) | 1201090012838320 | Bharat Jaisinghani | 2026-07-31 | — (**quantity only** — the Rate column is the last movement's price, Stage 10cz) |
| Motilal Oswal Financial Services (demat) | 1201090012838335 | Aarti Jaisinghani | 2026-07-31 | — (**quantity only** — the Rate column is the last movement's price, Stage 10cz) |
| Motilal Oswal Financial Services (demat) | 1201090032387399 | Bharat Jaisinghani Family Trust | 2026-07-31 | — (**quantity only** — the Rate column is the last movement's price, Stage 10cz) |
| Motilal Oswal Financial Services (demat) | 1201090037359311 | Ajay Jaisinghani | 2026-07-31 | — (**quantity only** — the rate printed is face value) |
| Motilal Oswal Financial Services (demat) | 1201090037436848 | Bharat Jaisinghani | 2026-07-31 | ₹0 (a MEASURED zero — the statement's balance is nil) |
| Motilal Oswal Hedged Equity Multi Factor Strategy | 90410014574 | Ajay Jaisinghani | 2026-07-31 | ₹0 (a MEASURED zero — the statement's balance is nil) |

**THIS COLUMN WAS TEN TIMES THE BOOK.** Every row read ₹976.8 Cr, ₹103.8 Cr,
₹11.2 Cr — while the consolidated figure below it, which is generated, was
right. The rows summed to ten times their own stated total, which is the
contradiction the footer rule already names: a reader who adds up the printed
cells and gets a different answer has found one, and no prose rescues it. The
column is regenerated from `BOOK_POSITIONS` now, and it is regenerated EVERY
TIME rather than patched: hand-merging rows to keep it short is what let eight
accounts go unlisted, and a row added by hand is a figure copied into prose. It
is one row per account, all 64 of them, sorted by value — and the words in the
right-hand cell are `Account.noPositionsReason`, routed rather than written, so
an account that changes WHY it is empty changes this table on the next run.

**AND THE RULE WAS ASPIRATIONAL UNTIL THERE WAS SOMETHING TO RUN.** It said
"regenerated" and nothing regenerated it, so the merge that brought the six
review accounts into the book (Stage 10dh) left this table untouched —
**six accounts unlisted, fourteen of the other fifty-eight carrying a stale
cell, and a column summing to ₹613.01 Cr against a book of ₹833.80 Cr.** Seven
of those fourteen read "no NAV published" over a holding the review values;
two named a face value where the review carries the line; three marks were the
statement's where the review's now stands; the ring-fenced account's fell by the
two private lines the review took over; and one demat's own reason gained the
count of its lines the review carries. That is the same defect as the
ten-times one, found the same way — by adding the printed cells up.
**`npm run accounts-table` prints it and `-- --write` splices it in**, and it
REFUSES rather than emitting one nobody can check: a `noPositionsReason` that
routes to no words, or a column that does not tie to `BOOK_SUMMARY.totalValue`,
exits non-zero. Both footnote markers are routed too — `\*` off
`SEPARATE_INVESTMENTS` and `\*\*` off `BOOK_POLYCAB`'s own account — because a
marker typed per row drifts, and the one hand-written attempt at these 64 rows
dropped `\*` from the two Transition ones.

\* one of two holdings of the same fund whose figures coincide on two accounts'
statements. The family confirmed on 28 Sep 2026 that each pair is two separate
investments, so every row is counted in full — see §4c and Stage 10cx. **All
four cells are the REVIEW's mark since Stage 10dh**, which is why both 360 ONE
rows read ₹1.46 Cr again where CRN37702's own statement of 31 Jul values the
same units at ₹1,46,68,362.66 — a disagreement `docs/BOOK-REPORT.md` names
rather than resolves.

\*\* **THE FAMILY HAVE SINCE SAID SO, AND POLYCAB IS RING-FENCED.** That row used to
read ₹12,415.02 Cr, of which **₹12,351.24 Cr was POLYCAB INDIA** — the family's
promoter stock rather than a portfolio position. The paragraph here posed the
question and named the reversal; the family answered it, and the answer is the
`/polycab` page. The account keeps its other 9 holdings and its own as-of; the
promoter row is out of this column and out of every total below it. *(It kept
11 until Stage 10dh: Blue Ashva and the Borosil warrant are private lines the
review carries, so they are counted under the review's own accounts now.)* See **The
ring-fence** section.

**Consolidated ₹833.80 Cr**: listed ₹599.20 Cr, private ₹234.59 Cr, and
**nothing left on neither side** — Blue Ashva was the one holding no document
placed, and the review names it. *(It was ₹713.56 Cr until Stage 10cz found the
three Motilal Oswal demats' Rate column to be the last movement's price rather
than a mark, ₹611.40 Cr after it, ₹613.01 Cr since Stage 10da read Buoyant's
31 Aug snaps — both folios' units at the 31 Aug NAV — and ₹833.80 Cr since
Stage 10dh made the family's consolidated review the source for the 89 private
lines no statement carries.)* The split reads the
family's own placing of a fund first and the SEBI category the statements print
second — see `shared/aifCategory.mjs`, Stage 10bp and Stage 10bw. *(It was
listed ₹655.82 Cr · private ₹37.88 Cr · not placed ₹16.69 Cr on the category
alone; the family then placed Founders and Delphi on the listed side and Neo
Infra on the private one. It was ₹710.39 Cr, private ₹10.62 Cr, while the two
pairs below were each counted once; the family then confirmed both are separate
investments — Stage 10cx.)*

**IT HAS BEEN WRONG TWICE, THE SAME WAY.** It was `listedValue: totalValue,
privateValue: 0` — true when every account was a listed-equity mandate, and false
the moment the AIF statements got a reader, at which point 62% of the book was
reported under a label that did not describe it. It was then `assetClass`, with
every AIF private — true of the AIFs the book held when that was written (both
drawdown vehicles) and false from the drop that brought the Category III folios,
at which point **₹297.78 Cr, 84% of the private half, was Sanshi, Buoyant and
Carnelian Bharat Amritkaal**: open-ended funds trading LISTED securities,
reported as private capital. *"These are not private market investments"*, as the
family put it.

**AND THE RING-FENCE TOOK ₹12,351.24 Cr OFF THE LISTED SIDE.** This heading read
*the listed half is now the smaller one* — true of the book it was written
against, where the fence left listed ₹358.04 Cr against private ₹352.35 Cr, and
false since Stage 10bw moved the Category III folios onto the listed side.
Before the ring-fence this book read ₹13,061.63 Cr, listed ₹12,709.28 Cr; the
promoter block was 95% of the whole and 97% of the listed side. Anything that
compares this book against an older figure of its own is comparing two different
sets, and the two are ₹12,351.24 Cr apart by construction rather than by drift.

Six PMS mandates run on one reporting system (Goldstandard, Green Lantern,
Carnelian, V.E.C Assago, Molecule, and SVAN's SEBI report); five are Category-III
AIF folios; six are drawdown AIF capital accounts, four of them Sky Capital's
angel-fund folios and two held by TRUSTS; two are 360 ONE Distribution
engagements; SEVEN are the family's own CDSL demat accounts at Motilal Oswal
and one more at LKP; one is a joint mutual-fund folio; and SIX issue no
statement at all — they are the holders of the private lines the family's
consolidated review carries, one per member plus `Not attributed to a member`
(Stage 10dh). The rest are single-scheme fund accounts, each issuing one
statement.

**SIX OF THE 64 HOLD NOTHING, AND THAT IS A MEASUREMENT.** HDFC 16180583's two
schemes are redeemed to nil units, and both classes of Motilal Oswal's Hedged
Equity Multi Factor Strategy are redeemed — Class B2 switched out, Class F1 paid
out ₹11.19 Cr on 31 July 2025 — with the Account Summary printing a DASH for
units and for valuation on each. A dash is read as null, so the account carries
no holding rather than a zero-valued one: its ₹13 Cr contribution set against a
zero value would book the whole of it as an unrealised loss against money the
fund has already paid back. The account is kept and states the reason, which is
why the two look nothing alike from a page: an account nobody wired and an
account that holds nothing are both empty, and only one of them is a defect.
The other four are in the table above with their own words, and they split the
same two ways: 3P's three classes and both ASK Absolute Return Fund folios carry
a position at a MEASURED ₹0, and Motilal Oswal demat 1201090037436848 carries
none, because its statement prints a nil balance.

**Read completely, and deliberately NOT in the book.** Four mutual-fund folios
(₹32,70,831.46) are held by `HOPE INDIA TRUST` — a separate taxpayer, filed by
each AMC as `Status : Trust`. WhiteOak's monthly scheme portfolio disclosure has
no folio, no units and no holder at all; it is the SCHEME's own holdings.
`docs/BOOK-REPORT.md` names all of them with their value, so nobody has to wonder
whether the money was missed or excluded, and one entry in `shared/owners.mjs`
reverses it if the family says the trust belongs here.

**A folio that was excluded on an unchecked premise.** This book's note used to
say all five mutual-fund folios were the trust's. HDFC 16180583 prints
`Bharat A Jaisinghani`, `Tax Status : Individual` and `Joint 1 : ANKITA
JAISINGHANI`, with both their PANs. It is the family's own and now in the book —
at a value of ₹0, because both its schemes have been redeemed to nil units. That
is a MEASURED zero and keeps its zero; contrast the two 360 ONE Alternates
folios, which no statement values at all and which render `—` with the reason.


**Two funds are reported under two accounts each, and each pair is two
investments.** 360 ONE Special Opportunities Fund Series 8 Class A3 appears under
CRN37702 and CRN60117 — the same 9,90,429.684 units on both — and Transition
Venture Capital Fund I — Class A1 under both Bharat Jaisinghani family trusts
(7,500 units, ₹1,71,45,962.25 each). Check (c) found both pairs because the
figures that would have to coincide by chance do coincide, and until 28 Sep 2026
the policy in §4c counted each once: **₹3.17 Cr** (₹3,17,26,374.76) was left out
of every consolidated total. The family then answered — *"both are separate
investments"* — and `shared/separateInvestments.mjs` records it, so neither pair
is a `dedupeGroup` and every figure counts all four rows. See Stage 10cx.

**AND THE 360 ONE PAIR STOPPED MATCHING ON FIGURES, WHICH COST ₹1.47 Cr.** They
were byte-identical (₹1,45,80,412.51 each) for as long as both CRNs published to
the same date. CRN37702 then advanced to 2026-07-31 and CRN60117 stayed at
2026-06-30, so the two marks diverged by ₹87,950.15 and check (c) — which keys on
the security plus the FIGURES that would have to coincide by chance — stopped
matching them. It still matched their JUNE issues, and tagged those. But
`newestPerReportType` supersedes: `build-book.mjs` takes 37702's JULY holdings,
which carry no tag, so the group reached the book with ONE member,
`dedupedPositions` had nothing to collapse, and the same units were counted under
both CRNs. *(The divergence is no longer on screen: since Stage 10dh the review
is what values 37702's row, at ₹1,45,80,413 against the statement's
₹1,46,68,362.66, so the accounts table above reads ₹1.46 Cr on both CRNs. The
defect below is about the TAG, which is unchanged.)*

Nothing failed and nothing said so — the consolidated total ran ₹1,45,80,412.51
above the truth, and the AIF section beneath it was over by the same amount.
**A tag that collapses nothing looks exactly like a book with no duplicates in
it.** (The figure is stated as the DELTA rather than as two totals, because the
totals move with every drop and the overstatement is the fact.)

Two things changed, and the second is the one that speaks up next time:

- **The tag travels across ISSUES of the same account.** `dedupeByAcctSec` in
  `build-book.mjs` carries a group established on any issue onto whichever issue
  the supersede rule picked. The duplication is a fact about the ACCOUNTS — two
  CRNs of one wealth platform reporting one AIF holding — not about one month's
  mark. Detection stays exactly as strict; only the tag moves. Same join as the
  ISIN and asset-class ones beside it: this drop's own paperwork, applied where
  unambiguous.
- **A group that reaches the book with ONE position is reported as a broken
  dedupe**, by name, in `docs/BOOK-REPORT.md`. That is the line that was missing.

**What this still cannot catch, stated rather than papered over:** a pair whose
figures never coincide at ANY as-of forms no group on any issue, so there is no
tag to carry. Widening detection to match on quantity alone is the wrong trade,
and that is measured rather than feared: it produced THREE false duplicates on
this corpus, each refuted by a document already in hand (see "…and then it was
flagging THREE pairs" below). So the residual risk is named here instead.
`duplicateAifEarnings` covers the income-only side of the same folio pair, which
is how this one was visible in the archive at all.

**Every issuer whose statements carry recoverable text has a reader.** Each earned
its own file because the layouts share nothing. The one issuer without one is HDFC
Bank's `august-2026-e` statement, and that is not a missing reader — it is four
JPEG pages with nothing on them to read (see the ring-fence section):

| Reader | Documents | What it reads |
| --- | ---: | --- |
| `providers/altFundStatements.mjs` | 33 | twelve single-scheme fund statements — Buoyant, Helios, Motilal Oswal's Founders, Active Momentum, Delphi and Hedged Equity funds, 3P, India SME, Sky Capital's angel fund, Neo Infra, Baring PE and Carnelian's Bharat Amritkaal. One reader, twelve declared layouts, each keyed on the FUND rather than the distributor whose stationery it arrives on |
| `providers/pmsStatements.mjs` | 76 | the house statement sets — six managers, one reporting system |
| `providers/pmsInvestorReport.mjs` | 5 | the SEBI PMS INVESTOR REPORT, keyed on the REPORT TYPE rather than the house: SVAN issues it monthly and Green Lantern quarterly, and it is one prescribed layout |
| `providers/threeSixtyOne.mjs` | 4 | 360 ONE Private Wealth's client-level PORTFOLIO ANALYSIS REPORT |
| `providers/aifDistribution.mjs` | 5 | 360 ONE ALTERNATES — a different issuer from the wealth arm. Distribution letters and statements of earnings, carrying AIF income split by TAX HEAD |
| `providers/sanshiFund.mjs` | 5 | Category-III AIF monthly account statements |
| `providers/transitionVenture.mjs` | 2 | drawdown AIF capital accounts — the only source of an undrawn COMMITMENT |
| `providers/lkpSecurities.mjs` | 4 | a self-directed demat account, in three file formats — the only LOT REGISTER in the book |
| `providers/mutualFundFolio.mjs` | 5 | folio statements, three different layouts behind one reader |
| `providers/motilalDemat.mjs` | 12 | the family's own CDSL demat accounts — SEVEN of them, keyed on the `Client ID:` the page prints because three of the twelve FILE NAMES name the wrong member |
| `providers/nsdlDemat.mjs` | 1 | the family's NSDL account at ICICI Bank — the mirror image of the CDSL reader, with NO RATE COLUMN, so value is the primitive and the price would be the derived thing |
| `providers/hdfcNsdl.mjs` | 2 | the two trusts' NSDL accounts at HDFC Bank — the only reader in this book working on text recovered by RENDERING, and the only one that REFUSES its document unless the rows reproduce the statement's own printed total to the paisa |
| `providers/bankAdvice.mjs` | 2 | ICICI payment receipts — read in full, attributed to nothing, because a receipt names no holder and no security |
| `providers/schemePortfolio.mjs` | 1 | a fund's own SEBI portfolio disclosure — archived for look-through, worth nothing to the book |

**Three files are BUNDLES.** `lib/bundle.mjs` splits a PDF by the report title
each page reprints, because a run of pages sharing one title is a document:

- `Molecule_June_2026_392.pdf` — 8pp: fact sheet, CURRENT PORTFOLIO, transaction
  statement, capital gain, expense statement. Filed as a single fact sheet, its
  holdings arrived with a market value and no quantity, no unit cost and no price
  while pages 2–3 printed all three.
- `GREEN LANTERN - AJAY.pdf` — 15pp: PMS INVESTOR REPORT, capital gain, expense
  statement, corporate benefits. Filed as a contract note, a type with no reader,
  so 15 pages of a ₹11.7 Cr account contributed nothing while the coverage table
  reported "no reader" about a document four readers here already handle.
- 360 ONE's client report carries its transaction and corporate-action statements
  inside the holdings document, which is why superseding one issue of it used to
  discard that month's corporate actions.

A file whose pages resolve to FEWER THAN TWO report types is not a bundle and is
returned untouched, so every single-report PDF takes the path it always took.

**A phrase in a footnote is not what a document is.** All four SVAN statements
were classified `contract-note` because the report's own footnote reads "…
customarily included in the contract note of broker". Title rules now run before
keyword rules. The same class of mistake, one layer up: `360 One WAM Limited` is
a listed company, WhiteOak's fund holds ₹10.16 Cr of it, and matching `360 ONE`
against the whole text filed that scheme's disclosure under 360 ONE Private
Wealth. Issuer rules match the LETTERHEAD; only titles match the whole document.

**Whose folio is it? The statement says, in words.** Every AMC prints the
holder's tax status because it must — `Status : Trust`, `Tax Status :
Individual` — and that printed word is what decides whether a folio belongs in a
family book. Not the PAN: two of these mask it (`XXXXX4894A`), so a PAN-only rule
would have failed on exactly the statements that needed it. Where a PAN IS
printed in full it is used too, and its fourth character says whether the holder
is an individual (`P`) or a trust (`T`).

**Owners resolve on PAN first.** `shared/owners.mjs` tries the PAN before any
name rule, because a PAN is issued once per taxpayer and printed on the page
while a name is a spelling. That settled a question this book had reasoned the
wrong way round: `BHARAT AJAY JAISINGHANI` and `BHARAT JAISINGHANI` print the
same PAN and are one man. The initials rule was right about what it could see; it
simply had no access to the fact, and neither did anyone else, because the fact
was on page one of a statement nobody had a reader for. Two aliases seeded by
analogy and observed on no statement were removed.

The fourth character of a PAN also keeps the two Transition Venture TRUSTS from
being folded into the man they are named after — `T` is a separate taxpayer, not
a nickname — and `AARTI AJAY JAISINGHANI` is now a canonical owner on her own PAN
and her own folio. Leaving her unresolved was not the neutral choice it looked
like: her ₹976.8 Cr was already in the consolidated total, attributed to nobody.

**A PAN that is also a document password is NOT written into the registry.** The
alias it justifies is listed instead and the evidence recorded in words. Anyone
extending `shared/owners.mjs` follows the same rule.

### The August 2026 drop — what came in, and what it could not tell us

The client's `august-2026/` folder brings 13 files. Six accounts advance their
as-of — Goldstandard to 11 Aug, Carnelian to 10 Aug, SVAN 8710067 to 31 Jul,
both Green Lanterns to 27 Jul — and the consolidated total moves ₹335.43 Cr →
**₹337.46 Cr**.

**TEN DOCUMENTS DO NOT READ, and they are two different problems.**

*Six investments that had no reader, and now do.* `reports.zip` and three loose
PDFs carry managers this pipeline had never seen. They are read by
`providers/altFundStatements.mjs` — ONE reader, SIX DECLARED LAYOUTS — and they
brought **₹123.54 Cr** into the consolidated total:

| Fund | Holder | As of | In the book |
| --- | --- | --- | ---: |
| Buoyant Opportunities Strategy — Category III — Class A4 | Ajay | 2026-07-31 | ₹49.30 Cr |
| Helios Flexi Cap Fund — Direct Growth | Ajay | 2026-08-07 | ₹31.00 Cr |
| Motilal Oswal Founders Fund Series II — Class G1 | Ajay | 2026-07-31 | ₹21.83 Cr |
| Motilal Oswal Active Momentum Fund — Direct Growth | Ankita | 2026-08-06 | ₹21.42 Cr |
| 3P India Equity Fund 1 — Classes B1/B2/B3 | Ajay | 2026-07-31 | ₹0 — measured |
| India SME Investments Fund II — Class A2 | Ajay, Ankita, Bharat | 2026-06-30 | — no NAV |

**THE FUND'S OWN NAME BEATS THE STATIONERY IT ARRIVES ON.** Four of these print
`Motilal Oswal` on the letterhead — as the DISTRIBUTOR, the depository
participant or the RTA — one arrives through CAMS and three through their
investors' banks, which is why the classifier had filed them under those houses.
Matched on the house, Buoyant's Category III AIF and Motilal Oswal's own
Founders Fund land in one account under one manager. The issuer rules now match
each FUND, ahead of the distributor rules, for the same reason `360 ONE` cannot
be matched against a whole document that merely HOLDS ₹10.16 Cr of the listed
company.

**A HOLDING ITS FUND HAS NOT VALUED DOES NOT BECOME A POSITION.** India SME's
three folios print a commitment, the capital drawn against it and the units it
bought — and no NAV and no valuation anywhere. `Position.marketValue` is
`number`, and the three wrong answers were all available: carry the drawn
capital as if it were the value, carry zero, or widen the type for 300-odd
positions to accommodate three. The account is kept and carries the REASON, by
the same mechanism 360 ONE Alternates already uses for an income-only folio.
₹13.5 Cr of contributions are in the archive and out of the total.

**AND A PROVIDER THE PIPELINE CAN READ MUST BE IN `precedence.mjs`.** All eight
documents read correctly, landed with the right owner and the right figures —
and contributed nothing, because `authoritative()` returns null for a provider
with no precedence block. Eight accounts at 0 positions and ₹0, holding
₹123.54 Cr between them. Nothing failed and nothing said so.

*Two documents this run could not decrypt — SINCE SOLVED.* Bharat's 360 ONE
Alternates distribution notice and statement of earnings are encrypted with a
password that is NOT in the drop's own `pASSWORD.docx` — that file names the
Kotak and ABSL ones only. Without it folio **1000633** had no readable statement
naming its holder, and the one other document mentioning the folio prints the
holder as the literal word "Investor".

**AN ACCOUNT NOBODY CAN BE SHOWN TO OWN IS EXCLUDED, NOT CARRIED EMPTY.** That
was the right call and this is what made it reversible. `Account.owner` is
`string`, not `string | null`, and that is the model saying every account in
this book belongs to a named member. The two wrong fixes were both available —
widen the type for all 30 accounts to accommodate one, or emit `owner: null` and
let a page render an account attributed to nobody. Folio 1000633 went to
`excludedAccounts` instead, by the same mechanism as the HOPE INDIA TRUST
folios: not summed, reason printed, **and back the moment the password lets its
statements be read.**

**THE PASSWORD IS THE HOLDER'S OWN PAN, and it was in the book all along** — the
family supplied it, and it is the same PAN Bharat's SVAN investor report prints
on page one. So the third entry in `GLOW_PDF_PASSWORDS` opens both documents,
the folio names its holder in words, and it is an ordinary account in the book:
31 accounts now, `owner: "Bharat Jaisinghani"`, still zero positions and still
₹0, because it is income-only and no statement values it. The consolidated total
does not move by a rupee. What came in is the ₹7,38,106 of AIF income split by
tax head — LTCG on listed equity (₹1,767), STCG on listed equity ₹7,25,037,
STCG on debt/liquid funds ₹14,836, expenses ₹26,437, TDS ₹73,811.

**AND IT ARRIVED AS A DUPLICATE.** Bharat's folio 1000633 and Ajay's 1000632
carry BYTE-IDENTICAL earnings: the same 9,90,429.684 Class A3 units, the same
₹7,38,106, the same TDS — the AIF-manager's view of the position 360 ONE's
WEALTH arm already reports under both CRN37702 and CRN60117. `duplicateHoldings`
could not see it, because an income-only folio has no holdings to key on. Check
(c) has a sibling now, `duplicateAifEarnings`, and the extraction report names
the pair. Nothing aggregates `aifEarnings` today, so **no figure on screen is
wrong** — which is exactly when a duplicate is cheapest to record, and exactly
how `dedupedPositions` came to sit correct and uncalled for a drop and a half.

### The `august-2026-b` delivery — five files, two of them new

Five files arrived after the August drop. **Three were byte-identical to
statements already in `source/august-2026/`** — Goldstandard Ajay, LKP 2 and
India SME Bharat, matched on md5 — and were not copied in a second time.
`extract.mjs` does detect byte-identical duplicates and reads each once, so a
copy would have been safe; it would just have been noise in a provenance record.
The other two advance an account each:

| File | Account | As of was | now | Value |
| --- | --- | --- | --- | ---: |
| `SVAN - BHARAT.pdf` | SVAN 8710090 | 2026-06-30 | 2026-07-31 | ₹10.38 → ₹10.70 Cr |
| `MOLECULE - AJAY.pdf` | Molecule 7810404 | 2026-06-30 | 2026-07-31 | ₹1.12 → ₹1.16 Cr |

Both accounts' earlier issues are superseded for SNAPSHOT facts and their DATED
rows still counted — `BOOK_CAPITAL_GAINS`, `BOOK_CORPORATE_ACTIONS`,
`BOOK_REALISED_BY_CLASS`, `BOOK_COMMITMENTS` and every cash-flow series are
BYTE-IDENTICAL across the rebuild. That is the supersede rule working, verified
rather than assumed.

**A CONTROL RUN IS WHAT MAKES THAT VERIFIABLE.** Before the new files went in,
the pipeline was run over the unchanged `source/` and `public/audit/`
regenerated byte-identically — so every difference afterwards belongs to the two
new statements and to nothing else. Without that the diff is 53 files and no way
to tell a fix from a regression.

### The `august-2026-d` delivery — PARTIALLY INGESTED, and the rest is named

Four files. **Two were byte-identical** to statements already in `august-2026/`
(`reports.zip`, Ankita's Active Momentum Fund). The other two are a 68-file
`MOTILAL REPORTS.zip` and a 25-tab consolidated review workbook.

**WHAT LANDED — ₹73.55 Cr, and the consolidated total ties to it exactly**
(₹472.35 Cr → ₹545.90 Cr, of which ₹1.46 Cr turned out to be a double-count,
found and removed later — see the 360 ONE pair above). The first two
needed no new code; the rest are five
new layouts on `altFundStatements.mjs`, built ONE AT A TIME and each verified
against the family's own consolidated review before the next was started:

| Account | Owner | Value | How |
| --- | --- | ---: | --- |
| Buoyant Capital 103472 | Ankita | ₹27.69 Cr | new folio, existing reader |
| Motilal Oswal Founders Fund 90410016093 | Ankita | ₹10.99 Cr | new folio, existing layout |
| Carnelian Bharat Amritkaal Fund 4551 | Ankita | ₹16.31 Cr | new layout |
| Motilal Oswal Delphi Equity Fund 9049241536 | Ajay | ₹11.13 Cr | new layout |
| Neo Infra Income Opportunities Fund 9039920536 | Ajay | ₹5.55 Cr | new layout |
| Baring Private Equity India Fund `AIFM_BPEPF6_0584` | Ankita | ₹1.88 Cr | new layout |
| Motilal Oswal Hedged Equity Multi Factor 90410014574 | Ajay | ₹0 | new layout — redeemed to nil |

**BUOYANT IS THE FIRST MANAGER WITH TWO DOCUMENT FAMILIES.** It sends its own
Category III account statement (read by `altFundStatements.mjs`) AND issues from
the shared PMS reporting system under an `I83_` account code — appraisal, fact
sheet, capital register, transaction statement, performance history, for both
folios. `EXTRACTORS` is keyed on the provider NAME alone, so one family would
always have gone to the wrong reader and come back empty.
`BY_PROVIDER_REPORT_TYPE` in `extract.mjs` routes on the report type instead;
the name stays single, because splitting it would split account 103473 across
two providers and break every per-account figure.

Its precedence moved from the single-scheme block to `PMS_REPORTING_SYSTEM`, so
the APPRAISAL is authoritative for holdings. For 103473 the two agree and the
choice is cosmetic; for 103472 it is not, because Ankita's folio sends the PMS
set and no account statement, and naming the wrong one authoritative would have
left ₹27.69 Cr out of the book. **The appraisal reports the AIF UNIT** — one row
under "Alternative Assets" — so nothing here turns a fund into equities.

**AND ₹76.99 Cr OF AIF UNITS CAME OUT AS CASH.** Buoyant's appraisal prints
`Alternative Assets` over its Category III rows. That heading was not in
`SECTION_ROW`, so it was not recognised as a heading at all — it glued itself
onto the `Cash` row above it, the section never changed, and the appraisal's
`/^cash/i.test(section) ? "Cash" : "Equity"` filed both folios' units as Cash.
Listed/private read ₹269.09 / ₹241.94 Cr against the true ₹192.11 / ₹318.92 Cr.

That test was right while every appraisal in the book held shares and cash and
nothing else. It is `classOfSection` now — a section heading names WHAT THE ROWS
UNDER IT ARE, so `Alternative Assets` → AIF, `Mutual Fund` → Mutual Fund,
`Debt`/`Bond` → Bond, cash by section or by the row's own name, equity
otherwise. **This is the client's own bifurcation complaint arriving through the
INGEST rather than the UI**, and it is why the listed/private split is worth
checking on every drop and not only the total: the consolidated figure was
correct to the rupee the whole time it was wrong.

**AND ALL FIFTEEN NOW READ — see "The demat statements" below.** They used to
sit here as documents with no reader. Twelve are the family's own CDSL accounts
at Motilal Oswal and brought **₹102.16 Cr** into the book; two are ICICI payment
receipts, read in full and attributed to nothing because a receipt names no
holder and no security; the last is the review workbook, held out by decision.

### The demat statements — ₹102.16 Cr, and three columns that disagree

Twelve documents, SEVEN accounts, and the only source in this drop for the
family's direct equity, their gold and silver ETFs and their arbitrage and
hybrid funds. `providers/motilalDemat.mjs`.

**THE FILE NAME IS WRONG THREE TIMES OUT OF TWELVE.**
`H46082_Aarti Ajay Jaisinghani_Transation 1.pdf` is AJAY's account 37359311;
`H43383 -BHARAT JAISINGHANI FAMILY TRUST_Transaction.pdf` is BHARAT's 12838320;
`H46082_Aarti Ajay Jaisinghani_Transation.pdf` is the account the OTHER files
call the family trust. Every one would have filed a statement under the wrong
member. The account is the `Client ID:` the page prints — and not the UCC
either, because Ajay's UCC H19119 covers two different demat accounts.

***BOTH COLUMNS ARE THE LAST MOVEMENT'S, NOT A MARK — see Stage 10cz.*** The paragraph below is kept as it was learnt.

**WHICH COLUMN TO BELIEVE HAD TO BE MEASURED.** The statement prints quantity,
rate and value, and on 22 of 67 rows they do not agree:

```
Birla Cable   11,900.000 units   rate 170.600   printed value 34,120.00
```

— ₹2.87 a share for a stock the same row prices at ₹170.60. The row is four
text items on one line; nothing is misread. **The printed VALUE column ties to
the printed grand total to the rupee on all five statements**, so the
depository stands behind it, and it is still the column that cannot be used.
The family's own review is independent of both and settles it: PG Electroplast
180,000 units × 502.200 = ₹9.04 Cr against the review's 180,000 units at
₹10.04 Cr; Onesource and Birla Cable likewise land within ordinary drift.
Quantity and rate are the primitives, market value is DERIVED, and the printed
figure goes to `printed.marketValue` — rules 3 and 4, applied to a document
whose own arithmetic is broken. Those 28 deltas are `explained` with that cause
named, because leaving them `material` would bury the two real settlement
residuals this book needs a reader to look at.

**A RATE OF 0.000 IS NOT PRICED**, and a rate of 100.000 on an AIF unit is the
FACE VALUE it was issued at, not a NAV. Read as a mark it puts ₹34.71 Cr on 3P's
units against the ₹52.12 Cr the review carries them at, and ₹34.17 Cr on a
Buoyant folio the fund itself values at ₹49.30 Cr. So an AIF row from a
depository carries its UNITS and no price — the same rule as "a depository does
not know what shares cost", one column over.

**AND A DEPOSITORY ROW WHOSE FUND ALREADY REPORTS ITSELF IS DROPPED.**
`AIF_UNITS` names which fund reports each ISIN, and `dropDepositoryDuplicates`
CHECKS that table rather than trusting it: the depository's unit count is
compared against the units the reporting account carries, and only an exact
match is dropped. A mismatch keeps BOTH rows and says so, because a depository
holding units the fund does not report is either a folio this drop is missing
or a reclassification — and that is the 3P case exactly. The tolerance is half
of the third decimal both sides print: matched to the bit, Buoyant's
3,416,657.416 against the fund's 3,416,657.417 failed to dedupe and put
₹34.17 Cr into the book twice.

**ONE ACCOUNT IS EXCLUDED BECAUSE ITS THREE IDENTIFIERS GIVE THREE ANSWERS.**
Account 32387399 prints `Client Name: AARTI AJAY JAISINGHANI` with
`PAN No: AAXXX-XX-8H`; Aarti's PAN is AFIPJ4151N, and the file it arrived in is
named for a family trust whose two PANs it does not match either. The masked PAN
cannot IDENTIFY a holder — three characters of ten — but it can REFUSE one, and
here it does. ₹8.23 Cr is excluded with the reason rather than attributed to a
guess, by the mechanism the HOPE INDIA TRUST folios already use. Returning
`owner: null` was not enough: `extract.mjs` falls back to the classifier's name,
which is the same name the PAN contradicts, so `excludedFromBook` carries it.

*(Attributed at Stage 10db. The holder lines print the trustees of the
unnumbered "Bharat Jaisinghani Family Trust", which the family's register and
review name. Since Stage 10cz its rates are last-movement prices, so the
statement book does not move; the live book values its three funds at AMFI's
NAV, about ₹8.72 Cr.)*

| Account | Owner | As of | In the book |
| --- | --- | --- | ---: |
| 1201090012838316 | Ankita Jaisinghani | 2026-07-31 | ₹38.38 Cr |
| 1201090012838320 | Bharat Jaisinghani | 2026-07-31 | ₹32.83 Cr |
| 1201090012838335 | Aarti Jaisinghani | 2026-07-31 | ₹30.95 Cr |
| 1201090037359311 | Ajay Jaisinghani | 2026-07-31 | ₹0 — both rows are AIF units the funds report |
| 1201090037436848 | Bharat Jaisinghani | 2026-07-31 | ₹0 — `NO HOLDING IS AVAILABLE`, a measured zero |
| 1201090012539150 | Ajay Jaisinghani | 2026-07-31 | ₹0 — **transaction statement only** |
| 1201090032387399 | — | 2026-07-31 | excluded, ₹8.23 Cr, holder unresolved |

**AND THE LARGEST REMAINING GAP IS A MISSING HOLDING STATEMENT.** Account
12539150 is Ajay's main demat — the one his Delphi and Hedged Equity statements
print as their depository account — and the drop carries its TRANSACTION
statement and not its holdings. The tape's closing balances give 38 quantities
at 31 July and no rates, so they are carried as `positionsAsOf` and valued at
nothing, the same separation `lkpSecurities.mjs` makes. That single missing
document is most of why Ajay's coverage against the review sits at 34.5% while
Aarti's is at 97.8%.

**A DEPOSITORY MOVEMENT IS NOT A TRADE.** The transaction statements carry units
in and units out with no price, no consideration and no counterparty, so
`precedence.mjs` names the demat for `holdings` and deliberately not for
`transactions`. The tape stays in the archive, where Data Audit shows it for
what it is.

### The two ICICI payment advices — read, and attributed to nothing

`3P_Folio 3000048.pdf` and `3000049.pdf` are single-page ICICI receipts:
₹31,05,82,835.17 and ₹21,42,90,815.61, both debited 04/08/2026. They carry no
holder, no security and no folio. The two sum to ₹52.49 Cr against the
₹52.12 Cr the review carries 3P at, and the file names assert the two 3P folios
— which is a compelling story and still only a file name plus an arithmetic
coincidence. This book has been bitten four times by a document filed on a name
it merely MENTIONS. So the amount is recorded, the folio is recorded AS THE FILE
NAME'S CLAIM, and `excludedFromBook` keeps it out of every total. A payment
receipt is also the wrong instrument to book a redemption from: it says money
moved between two banks, not which units were sold, at what NAV, or how much of
it was gain.

| Issuer | Docs | What it is |
| --- | ---: | --- |
| Consolidated family review | 1 | the only document in `source/` with no reader — see below |

### The two Motilal Oswal ACCOUNT SUMMARY funds — one layout, and a DASH

Delphi and the Hedged Equity strategy print the same block: one row per unit
class reading `Class | NAV Date | Post Tax NAV | Unit | Commitment |
Contribution | Valuation`. One reader factory serves both, and three of its
decisions are the whole of it:

**A DASH IS NULL, NEVER ZERO.** Hedged Equity's Unit and Valuation columns are
`-` on both classes, because both are redeemed. Read as 0 the account books its
₹13 Cr contribution as an unrealised loss against money the fund has already
paid back; read as null it carries no holding and states why.

**A CLOSED CLASS COMMITS NOTHING EITHER.** Summing the commitment column across
both rows gives ₹26.11 Cr for ₹13 Cr of real money — Class F1 was SWITCHED IN
from Class B2, so the same contribution is printed twice under two class names.
Only classes that still hold units contribute a commitment, which is also why
this account appears in no dry-powder figure.

**AND THE DRIVER LEARNED TO SAY WHY IT IS EMPTY.** With no rows it reported
`summary-row-not-matched` — "the columns did not line up" — about a document
whose columns lined up perfectly and printed a dash in both. A layout that knows
why it has no rows now says so through `emptyReason`; everything else keeps the
column diagnosis, which is the honest answer when the reason is genuinely
unknown. **A wrong diagnosis sends the next reader to fix a regex**, which is
the same rule that governs an unreachable archive on screen.

Delphi's one class ties exactly: 99,995 units × ₹1,112.9310 = **₹11,12,87,535.35**,
the figure the statement prints. The family's review carries it under what it
OWNS — `Fund of Funds (VEC + Carnelian + Girik Cap + Insightful)` — at
₹11,12,87,435.35, ₹100 lower **because the review rounds the NAV to two
decimals**. Ours is derived from the printed NAV to four, so the ₹100 is theirs
and not a discrepancy in the book. The review does not list Hedged Equity at
all, which agrees with an account holding nothing.

**THE UNNUMBERED TRUST IS A REAL HAZARD.** `H43383 - BHARAT JAISINGHANI FAMILY
TRUST` carries no numeral, and this book has Trust 2 and Trust 3 as separate
taxpayers with separate PANs. Whoever writes that reader must resolve it on the
PAN the statement prints, never on the name.

*(Resolved at Stage 10db. The unnumbered trust is a third owner of its own,
attributed by a join on the client ID that is checked against the page on every
read, never by a name. No statement prints its PAN.)*

**AND THE CONSOLIDATED REVIEW WORKBOOK IS NOT A SOURCE — BY DECISION.** The
adviser's 25-tab aggregation of the whole book is matched on a column header no
issuer prints (`Absolute Gain / (Loss) Including Redeemed Funds`) and has no
reader deliberately. Every figure in this book traces to the statement of the
institution that struck it; an aggregation carries someone else's decisions
about what to include and how to value it, and folding it in would end that
guarantee on the first cell. Its proper use is as an independent CROSS-CHECK of
the generated book, which is the role `golden.mjs` plays for the extractors.

***THE FAMILY HAVE NARROWED THIS, AND ONLY FOR THE PRIVATE MARKET — see Stage
10dh.*** On 5 Oct 2026 they asked for the review to be the SOURCE of every
private-market figure, so `scripts/lib/reviewBook.mjs` carries its PE Funds
block, its unlisted shares, its `Private Investments` tab and its one credit
line as positions, each naming the sheet, the block and the row it came from.
**Everything above still holds of every other figure in this book**: a holding,
a cost, a mark, a dated flow and a commitment all trace to the statement of the
institution that struck them, and the review is the cross-check and nothing
more. The workbook still has no reader of its own — the private blocks are read
by one function the book calls, which refuses rather than guesses.

Matched on any issuer NAME it claimed whichever its cells mentioned first — it
landed under Helios, then under Motilal Oswal Founders Fund, with an "owner"
read as the literal word "Sale". It contributed nothing either time only because
the fund readers refused its summary row, which is luck rather than design.

**THREE ORDERING FAULTS, ALL THE SAME FAULT.** Everything in this delivery that
went wrong went wrong because a document was matched on a name it MENTIONS
rather than the one that ISSUED it:

- The new issuer rules were first placed ABOVE the established fund rules, and
  the demat rule matched `Motilal Oswal Financial Services` printed as the
  DEPOSITORY PARTICIPANT on the Founders Fund and 3P statements. **₹21.83 Cr
  walked out of the book on a re-run** before the block was moved below them.
- The demat statements list every fund the family owns as a transaction row, so
  they were claimed by Buoyant and by Neo Infra. They are matched on the DP's
  own SEBI registration line (`CDSL AND NSDL : IN-DP-…`) now, and
  `matchGoldstandard` returns null for anything carrying it — a depository
  statement is never a PMS house report.
- The Carnelian Amritkaal AIF statement names Carnelian as its manager and was
  taken by the PMS house rule.

The guard that caught all three is the same one the `august-2026-b` control run
established: **no account that was already in the book may move.** It is checked
on every run now and it is what turned a silent ₹21.83 Cr loss into a one-line
diagnosis.

### The `august-2026-c` delivery — a new manager, and three defects it found

Five files. **Two were byte-identical** to statements already in
`source/august-2026/` (LKP 1, Carnelian Ajay) and were not copied in again. The
other three:

| File | What it is |
| --- | --- |
| `SKY CAPITAL RISING FUND.zip` | 16 statements from an issuer this pipeline had never seen |
| `VEC - AJAY.zip` | V.E.C 128005, 2026-07-06 → **2026-08-13** |
| `VEC - ANKITA.zip` | V.E.C 128004, 2026-07-06 → **2026-08-13** |

V.E.C 128005 moves **₹9.24 Cr → ₹20.29 Cr**, and that is real: its own capital
register prints Fund Deposits of ₹10.65 Cr on 28 July and ₹59 L on 29 July. The
consolidated total moves ₹461.36 Cr → **₹472.35 Cr**, which is those two
accounts and nothing else, to the rupee.

**SKY CAPITAL RISING TITANS FUND I** — a Category I AIF (Angel Fund), four
folios, four month-ends each. It is a SEVENTH declared layout in
`altFundStatements.mjs` rather than a provider file of its own: one reader, one
layout per FUND, which is what that file exists for.

| Folio | Holder | Series | Units | Drawn | Uncalled |
| --- | --- | --- | ---: | ---: | ---: |
| SKY003 | Bharat Jaisinghani | Hudle A1 + TED A2 | 17,000 + 285 | ₹1.73 Cr | NIL |
| SKY022 | Ajay Jaisinghani | Oncare A3 | 15,000 | ₹1.50 Cr | NIL |
| SKY023 | Bharat Jaisinghani Family Trust 2 | Oncare A3 | 7,500 | ₹75 L | NIL |
| SKY024 | Bharat Jaisinghani Family Trust 3 | Oncare A3 | 7,500 | ₹75 L | NIL |

**IT VALUES NOTHING**, like India SME: commitment, drawdowns, units and face
value, and no NAV anywhere on either page. So ₹4.73 Cr of drawn capital is in
the archive and OUT of the consolidated total, four accounts carry zero
positions with the reason printed, and the book gains 4 accounts and 0
positions.

**ONE HOLDING PER SERIES, NOT PER ALLOTMENT AND NOT PER FOLIO.** Bharat's folio
prints five allotment lines across two startups; three folios hold the SAME
Oncare series. Per allotment would put five rows on one position; per folio
would merge Hudle with TED and stop the three Oncare folios sharing a
securityKey. Cost per series is units × the face value the row prints, and
`verify` ties the sum to the printed Total Drawdown on every folio — two printed
columns and a printed total, not an allocation nobody published. These are also
the first statements in the book to print a real ISIN per series.

**A FOURTH CHARACTER DECIDES WHETHER A NAME IS A PERSON.** `trimPersonName`
turned `Bharat Jaisinghani Family Trust 2` and `Trust 3` into plain "Bharat
Jaisinghani" — two trusts and the man they are named after, one owner, every
per-entity total wrong. `investor()` now takes the holder VERBATIM when the
PAN's fourth character is not `P`. `transitionVenture.mjs` reached the same
conclusion for the same two trusts and hard-coded it; this derives it from the
statement.

**AND THE HOLDER ANCHOR IS LOAD-BEARING.** `\bName` matched the "Name" inside
`Fund Name Sky Capital Rising Titans Fund I`, so every folio came back owned by
the fund. Three of the four still resolved — `resolveOwner` tries the PAN first
— and Bharat's did not, because his PAN is deliberately withheld from the
registry. A fallback masked the bug on three folios out of four.

### The `august-2026-e` delivery — the two NSDL accounts, and a scan

Two files, found by diffing the client's Google Drive against `source/` after
every other delivery had landed. Every one of the other 47 files in Drive matched
a local file on name and byte size; these two matched nothing. Both are dated
**31 March 2026**, five months behind the rest of the corpus, and both are
DEPOSITORY statements for accounts this book had never seen.

| File | Whose | Outcome |
| --- | --- | --- |
| `Holding Statement Ajay Jaisinghani As on 31 March 2026.pdf` | Ajay — ICICI Bank NSDL, client 49794950 | read: 38 holdings, 12 valued, **₹12,415.02 Cr** — 11 and ₹63.78 Cr in the book once Polycab is ring-fenced |
| `HOLDING STATEMENT AS ON 31 MARCH 2026.pdf` | Bharat — HDFC Bank NSDL, client 22025655 | **not read — it is a scan** |

**AND ₹12,351.24 Cr OF THAT IS ONE ROW.** Polycab India, 13,901,229 shares at
the ₹8,885.00 the depository marks them at. This is promoter stock — the family
are Polycab's promoters — and Bharat's scanned statement carries 5,108,911 more.
It is about seventeen times the rest of the book put together, and **the family's
own consolidated review, which totals ₹1,300 Cr, does not carry it at all.** That
absence is the evidence that they do not think of it as part of the portfolio
being tracked, and it is not evidence about what the statement says.

So it is INGESTED, because the statement says the account holds it and refusing
a measured holding for being inconveniently large is the fabrication rule run
backwards. Whether it belongs in the same consolidated total as the managed
mandates is a decision about the family's affairs, of exactly the kind §4c
reserves for them. What must not happen is the third option: dropping it quietly
and leaving the book looking complete. **The family have since made that
decision — see the next section.**

### The `august-2026-f` delivery — a THIRD way a PDF is unreadable, and a register that is not a statement

Three files, found by diffing the client's Google Drive against `source/` after
every other delivery. **NOT ONE OF THEM MOVES A RUPEE OF NAV**, and every one of
them is read — which is the point of this section, because those two facts look
contradictory and are not. The two statements are read by RENDERING their outlined
glyphs and their single holding is priced at face value, so it carries a quantity
and no value; the register reads perfectly and is held out of the book by
decision. What moves is the account count, the book's as-of and the `/register`
page — never a total.

The passage below is kept in the order it was learnt, because the first answer
("neither is an OCR job") was right about a scan and wrong about these, and the
distinction it turns on is the whole of why one is read and the other still is not.

| File | What it is | Outcome |
| --- | --- | --- |
| `NEW INVESTMENT SHEET.xlsx` | the family's own record of what they PAID — 8 sheets, 427 tranche rows, 151 names, **₹842.92 Cr gross paid in** | reads perfectly, and is **not a source** |
| `HOLDING STATEMENT BHARAT JAISINGHANI FAMILY TRUST 2.pdf` | HDFC Bank NSDL, DP account **67786547** | **READ — by rendering its outlined glyphs, see below** |
| `HOLDING STATEMENT BHARAT JAISINGHANI FAMILY TRUST 3.pdf` | HDFC Bank NSDL, DP account **67786137** | **READ — same** |

**A DOCUMENT WITH NO TEXT IS NOT ALWAYS A SCAN.** `august-2026-e` established that
a scan is not a document with no reader. These two are neither: **no raster image
anywhere and no text either** — zero font objects, zero `BT`/`Tj`, and ~9,300
bezier curves, because every glyph has been CONVERTED TO VECTOR OUTLINES by
whatever exported the file. pdfjs's operator list reads 2,752 ops / 545 paths /
**zero text ops**; poppler's `pdftotext` returns one character. Two independent
engines agree there is nothing to read.

The old test would have called them `no-text-layer` — "**1 page(s) of SCANNED
IMAGE**" — which is the same class of confidently wrong answer that test's own
comment already records about the review workbook, and it sends the next person
to ask HDFC to re-scan paper that was never on paper. They report
**`text-outlined-to-paths`** now, and the reason names the actual remedy: a
**re-export from the issuing system with fonts embedded**. That diagnosis is still
what a document reports when nothing can read it; what changed is that something
now can — see the next section, which is where this passage's original conclusion
("neither is an OCR job") was overturned for these two and upheld for the scan.

`classifyInk` in `lib/layout.mjs` draws the distinction **on the operator list**,
because a PDF 1.7 file keeps `/Font` and `/DCTDecode` inside compressed object
streams and a raw byte search finds neither. It runs **only** for a document that
yielded no text at all, so no ordinary statement pays for the second parse —
asserted in `layout.test.mjs` along with both directions of the classification,
against PDFs generated in the test. Measured on the corpus: the two new files are
`vector` (0 images, 545/540 paths), Bharat's HDFC scan is `raster` (**4 images**,
0 paths — the four DCTDecode JPEGs this file already documents), and Ajay's ICICI
statement returns 124 text rows and is never classified at all.

#### They ARE read now — by rendering the outlines, and never a scan

*"use whatever method you want to for extracting the data … every single file must
be incorporated."* The refusal above was right about a SCAN and wrong to extend to
these, and the difference is not a technicality:

- a SCAN is a photograph of paper. Its information is genuinely lossy — sensor
  noise, skew, JPEG ringing — so a figure recovered from it cannot be traced to
  what the document printed, and a wrong digit looks exactly like a right one.
  **Bharat's `august-2026-e` statement stays refused for that reason.**
- OUTLINED TEXT is not a photograph of anything. The file itself carries every
  glyph's exact bezier curves; rendering them is EVALUATING data the document
  already holds, at whatever resolution we choose. At 600 dpi the bitmap is a
  clean synthetic rendering of exact shapes: no noise, no skew, no compression.

`lib/ocr.mjs` renders and reads those, and hands the words back **in the same
`{x,y,width,height,text}` shape `itemsFrom` produces from pdfjs** — so
`pageToGrid` and every reader above it work unchanged and there is no second,
drifting "OCR table parser". `extractLayout` routes ONLY `inkKind.kind ===
"vector"` there; a `raster` page keeps its `no-text-layer` diagnosis and is not
read. Both directions are asserted in `layout.test.mjs`.

**AND A PREMISE IS NOT A PROOF, SO THE READER CHECKS ITSELF.**
`providers/hdfcNsdl.mjs` will not emit a holding unless the rows it read
reproduce the statement's own printed `Total Valuation (Rs.)` **to the paisa**;
on a mismatch it emits nothing and says why. That check is the whole licence for
reading a rendered document — the page's own arithmetic is the witness. Here it
passes on both files, and three further things agree: 347 x 100.000 = 34,700.000,
the statement's words ("Rupees Thirty-Four Thousand Seven Hundred Only") match
its digits, and the register in the same delivery independently records 347
preference shares per trust.

**THEY ADD ₹0 TO NAV, AND THAT IS THE CORRECT ANSWER.** The Market Rate is exactly
100.000 — the FACE VALUE an unlisted preference share was allotted at —
so `faceValueBasis` grades it `par` and the holding carries its QUANTITY and no
value. The book gains **two accounts (49 → 51)** and its as-of advances to
**2026-08-29**; `totalValue` does not move by a rupee. Reading 100.000 as a mark
would have invented ₹34,700 twice.

`textSource: "ocr"` rides in the provenance, and the document carries a
`text-recovered-by-rendering` warning naming the remedy — a re-export from HDFC
with fonts embedded — so no figure read this way is ever mistaken for a native one.

**IT NEEDS TWO SYSTEM BINARIES, AND DEGRADES WITHOUT THEM RATHER THAN GUESSING.**
`pdftoppm` (poppler-utils) and `tesseract`. Neither is an npm package and neither
is in CI — which costs nothing, because **CI never re-extracts**: it reads the
committed archive and checks that the book regenerates from it byte-identically.
Where they are absent `ocrAvailable()` says so, `extractLayout` falls back to the
`text-outlined-to-paths` diagnosis, and the run is exactly what it was before OCR
existed. It never half-reads. Re-extracting these two locally needs:

```
sudo apt-get install -y poppler-utils tesseract-ocr
```

**AND THE PIPELINE GREW A GUARD, BECAUSE THIS SESSION DELETED 24 DOCUMENTS.**
`node scripts/ingest/extract.mjs --help` is not a help flag — `extract.mjs` takes
no options, so it ran a FULL extraction against the default paths, and the eight
encrypted statements it could not open without `GLOW_PDF_PASSWORDS` simply left
the archive. Recovered with `git checkout -- public/audit/`, and the fix is not
"be careful": `guardAgainstShrinkingTheArchive` compares the documents this run
read against the documents already on disk and **refuses to write, exit 1**, if
the run produced fewer. A deliberate shrink sets `GLOW_ALLOW_ARCHIVE_SHRINK=1`
and says so out loud. A re-extraction that quietly loses the statements it lacked
a password for is indistinguishable, in the diff, from a drop that never carried
them.

**AND `build-book` WAS TELLING THE WRONG STORY ABOUT THEM.** Its
`noPositionsReason` had one sentence for every unvalued account — *"this fund
publishes no NAV … the capital drawn against a commitment"* — which is true of
India SME and Sky Capital and false of a depository. It branches on the HOLDING
now: a row carrying a `faceValue` gets the custody wording, and the fund wording
is reserved for a fund. A confidently wrong reason sends the next reader to ask a
fund manager for a NAV no fund owes.

**AND THE FILENAMES NAME THE WRONG HOLDER, FOR THE FOURTH TIME.** Both files are
named for a Bharat Jaisinghani family trust; both statements print `AJAY T
JAISINGHANI` and `AARTI AJAY JAISINGHANI` as joint holders at Ajay's own
Prabhadevi address. `providers/hdfcNsdl.mjs` therefore resolves the account on the
`DP Account No:` the page prints, never on the file name — `motilalDemat.mjs`'s
rule, arriving through a third issuer — and it will not fall back to the file name
even when the account line is unreadable: with no `DP Account No:` it emits
nothing and says so. What they hold is one line each,
`SWAPECO SOLUTIONS PRIVATE LIMITED` / `INE2DT103015`, 347.000 units of a
`0.01% PRE SERIES A PREF` at a Market Rate of **100.000** — the FACE VALUE of a
preference share in an unlisted private company. Read as a mark it adds ₹34,700
twice; under this book's own rules it is **quantity-only with no value**.

**AND THE REGISTER IN THE SAME DELIVERY CONFIRMS THESE *ARE* THE TRUSTS'
HOLDINGS — ONCE THE WHOLE CELL IS READ.** Its `TRUST INVESTMENT` rows read
`2807 PRE SERIRES A CCPS OF FACE VALUE RS. 100 EACH (NO OF PREFERENCE SHARE 347)`
— **347**, once per trust, and 347 x ₹100 face = **₹34,700**, the exact Total
Valuation both statements print. Instrument, face value and quantity all tie, so
each file is one trust's holding and the holder line prints the **TRUSTEES**
rather than the trust. The register also carries Bharat's own separate 244 EQUITY
shares (₹50,20,300), for which no statement exists.

**THIS PASSAGE FIRST ASSERTED THE OPPOSITE**, and the mistake is worth keeping
because it is a new shape of an old one. The cell was read to 240 characters; the
parenthetical carrying the unit count sits past that cut, so `2807` read as the
quantity and nothing matched. The conclusion — "these are not the trusts' files,
the trusts' ₹2.70 Cr has no statement, that is two asks" — was confident,
internally consistent, and would have sent the client hunting for documents they
had already sent. **A TRUNCATED CELL IS NOT A SHORT CELL**, and a display limit
in a debugging script is not a fact about the source, which is the same class of
error as reading a figure off a `title` attribute the check could not see.

What survives is the mapping caution, not the ask: the statement names only the
trustees, so a reader must resolve each account on the `DP Account No:` the page
prints (67786547 / 67786137) and attribute it to a trust through the register.
That is a join to establish, not a document to request.

***AND IT HAS BEEN ESTABLISHED — see Stage 10bp.*** It was named here and not
made, so for three deliveries both accounts sat under `Ajay Jaisinghani` and the
trusts' entity page listed one holding, which is what the family eventually
reported. `BENEFICIAL_OWNER_BY_DP_ACCOUNT` in `providers/hdfcNsdl.mjs` is the
join, keyed on the DP account and cited to the register's `TRUST INVESTMENT`
sheet; `npm run replay:owners` lands it without the passwords. **A join this file
names and nobody makes is a gap with a paper trail, which is better than a silent
one and is still a gap.**

#### The register is the same decision as the review — and it was the dangerous one

`NEW INVESTMENT SHEET.xlsx` is a CASH-OUTFLOW register: `INVESTMENT AMOUNT` is
money that left a bank account on a date, and **`CURRENT VALUATION` is empty on
every one of its 427 rows**. So it can speak to INVESTED CAPITAL, which is a cost,
and it **cannot move NAV by a rupee** — a NAV gap closes with a holding
statement, never with a payment record. That distinction is the whole of
`docs/REGISTER-RECONCILIATION.md`.

It is held out of the book for the reason the consolidated review is, and matched
the same way — on a column header no issuer prints. A depository tracks units,
never whether the family holds the paper certificate, so `ORG. SHARE CERTIFICATE
STATUS` is the anchor. **Unmatched it was measured classifying as provider
`Green Lantern Capital LLP`, strategy `Aristos Equity Portfolio`, owner
`"COMMUNITY PRIVATE LIMITED BHARAT"`, accountNo `"EDUGORILLA"` and reportType
`capital-call`** — five fields scraped off PORTFOLIO COMPANY names in its own
cells. Green Lantern has a reader and `capital-call` is a live report type, so
unlike the review workbook this one would have been **handed to a reader** rather
than merely misfiled.

**AND IT EXPOSED THAT THE REVIEW'S OWN PROTECTION WAS LUCK.** That rule lives in
`ISSUER_PROVIDER_RULES`, which run AFTER `match360One`/`matchGoldstandard`, so the
workbook escaped those only because its cells spell "Green Lantern Growth
Strategy" rather than "GREEN LANTERN CAPITAL". The adviser writing a manager's
full legal name in one cell was all it would have taken. Both house matchers now
return null for either signature (`isNonStatement`), and a document nobody issued
is short-circuited to **no report type, no account, no owner, no as-of** — because
a reader is chosen BY REPORT TYPE, and the review reached `unknown` by accident
while the register reached `capital-call` by the same accident running the other
way. `pipeline.test.mjs` asserts all of it, and asserts the guard is NARROW: an
ordinary Goldstandard appraisal, which also names Aristos, still resolves to its
own house.

#### Stage 10q — THE REGISTER IS ON THE DASHBOARD, AND IN NO TOTAL ON IT

*"integrate these three new files into the dashboard, make sure there's no
duplication."* The two PDFs cannot be read by anything (see above). The register
can, and it now has a page — built as `BOOK_POLYCAB` is, because that is the
construction this repo has already proven for real data that must never reach a
NAV:

***THE PAGE HAS SINCE BEEN REMOVED at the family's request — `/register`
redirects, and `src/data/registerData.ts` and `npm run build-register` went with
it, because that module had exactly one reader. See Stage 10bb. What survives is
everything below about the WORKBOOK: `scripts/lib/registerRead.mjs` is still its
one reader, `npm run reconcile:register` still writes
`docs/REGISTER-RECONCILIATION.md`, and the absence check below is stricter than
it was — no route may name the register now, and its sentinel is derived from the
workbook rather than from the deleted module. The passage stays in the order it
was learnt, because the anti-duplication reasoning is why the figures were never
additive in the first place.***

- ~~**`npm run build-register`** emits `src/data/registerData.ts`~~ — REMOVED with
  the page. It was generated, never hand-edited and idempotent; a builder whose
  output nothing reads is the failure this file keeps naming.
- ~~**`src/pages/Register.tsx` at `/register` is its ONLY reader**~~ — and that
  is exactly why both went together. It read the module DIRECTLY rather than
  through `PortfolioContext`, using `usePortfolio` for the display-currency
  formatter alone, so nothing on it could ever leak into a total, an allocation,
  a sector or a NAV. That construction was right and is recorded for the next
  page that needs it.
- **`scripts/lib/registerRead.mjs` is the one reader, and it STAYS**, used now by
  `register-reconcile.mjs` and by `check-pages.mjs`'s `REGISTER_SENTINEL`. Two
  copies would be two chances for the report and the sweep to state different
  figures about one workbook — the failure `drilldown.ts` exists to stop for the
  book's own numbers. Extracting it was verified by regenerating
  `docs/REGISTER-RECONCILIATION.md` byte-identically.

**THE PAGE LEADS WITH THE PARTITION, NOT THE TOTAL, AND THAT IS THE ANTI-DUPLICATION
DESIGN.** ₹842.92 Cr of paid-in capital is NOT additive to a ₹710.39 Cr book:
₹391.14 Cr of it across 31 names is already inside NAV at a statement mark. A page
that printed only the gross would invite exactly the double count the family asked
to be ruled out, so the four buckets — in-book-as-account ₹347.73 Cr,
in-book-as-position ₹43.42 Cr, not-in-book ₹450.08 Cr, exited ₹1.69 Cr — are shown
apart, each with what it means for the dashboard, and they sum to the gross.

**TWO INVARIANTS, AND NEITHER IMPLIES THE OTHER**, both verified by reintroducing
their bug. `check:pages` walked `/register` and asserted it renders the register's
own largest not-in-book name, states these are amounts PAID rather than a
valuation, states it is no part of the book's totals, names the double count, and
never posts a paid figure as a cost basis. And on EVERY OTHER ROUTE it asserts that
name does NOT appear — `REGISTER_SENTINEL`, derived from the data like
`RINGFENCED_KEY` so the next drop picks its own. Measured: leaking the sentinel
onto Morning CIO fires the absence check; breaking the page's own wording fires the
page check; the full sweep is 102 combinations clean.

***ONLY THE SECOND STILL HAS A SUBJECT, AND IT IS STRICTER FOR IT (Stage 10bb).***
The page's five own invariants went with the page; the absence check now applies
to EVERY route with no exception, and `cio` additionally asserts the sentinel
DERIVED — because it used to be read out of `registerData.ts` inside a
`try/catch`, and deleting that module would have left it `null`, short-circuited
the guard and made the whole claim unfalsifiable in silence.

The sentinel is a NAME and deliberately not the word "register": `capital-register`
is a live report type in the book and the Data Audit page prints it on every walk.

#### `npm run reconcile:register` — what the register can and cannot settle

`scripts/register-reconcile.mjs` is to the register what `review-reconcile.mjs` is
to the review: an independent cross-check that never writes to the book.

- **60 of 371 positions carry no cost**, worth ₹165.94 Cr, and **every one is in a
  DEPOSITORY account** — 43 Motilal Oswal demat, 11 ICICI NSDL, 6 in accounts
  holding nothing. That is not a defect: a depository holds the shares and did not
  buy them, which is why the cell is `—` and not `₹0`.
- **The register covers 7 of the 60** (₹27.35 Cr of market value against ₹43.42 Cr
  paid) and **misses 53** (₹138.60 Cr), whose cost no document in this corpus
  reports. Those need a contract note or transaction statement from Motilal Oswal
  and ICICI Bank — not another register.
- **113 register names have no counterpart in the book at all**, ₹450.08 Cr paid
  in. That is a COST and the size of an ask, never a value this book will publish.
**AND ONE SUBTOTAL DOES NOT SAY "TOTAL".** The register repeats each multi-tranche
investment as its own row, and summing the amount column blind reads **₹1,274.79 Cr**
— ₹431.88 Cr of double count, 51% too high. Matching the WORD finds 63 of them.
It misses a 64th: `FUND HOUSE` repeats `BARING PRIVATE EQUITY INDIA FUND 6` under
its own four tranches at ₹2,02,50,000, exactly 65 + 50 + 25 + 62.5 lakh, with no
"TOTAL" anywhere in it. What gives it away is its SHAPE — a subtotal carries no
serial number and no `INVESTMENT DONE UNDER`, because it is not an investment
anybody made on a date. Measured, that structural test catches exactly that one
row and no data row. This is `dataGovIn.mjs` and `amfi.mjs`'s own rule one layer
up — **a headline row is NAMED, never summed** — meeting a workbook that forgot to
name one, and the first count published here (₹844.94 Cr over 428 rows) was wrong
by that row.

- **₹842.92 Cr IS NOT ADDITIVE TO THE BOOK.** It is money paid since 2017 across
  every vehicle the family has used, including mandates the book already carries
  in full, capital already returned (₹6.60 Cr on the COMPANY sheet's own
  `LOAN RETURNED BACK` column) and investments already written off (₹1.69 Cr).

**A PAID FIGURE IS NOT A COST BASIS AND MUST NOT BE POSTED AS ONE** until the
quantities tie, the entity resolves and it is shown not to double-count a cost the
book already has — the rule `costFor` already applies to LKP's opening ledger,
joining a cost ONLY where the quantities match exactly.

**AND THE MATCHER IS SHARED, BECAUSE TWO COPIES WOULD DRIFT.**
`shared/nameMatch.mjs` now holds the exact/alias/prefix/spacing tiers both
reconcilers use. Extracting it exposed a live defect: `matchSecurity` took an
`index` parameter and honoured it on **two tiers out of four**, the alias and
prefix tiers reading `BY_KEY` whatever they were passed — so the second call, the
one asking "did we READ this and simply fail to value it?", searched the BOOK for
a name it was meant to look for in the ARCHIVE. That verdict is what puts a line
on the section D1 ASK LIST, so the defect asks the client for documents already in
hand. Measured on this corpus it changed no line and the report regenerates
byte-identically, which is exactly why it had to be fixed structurally rather than
left for the first line that hit it. **There is still no fuzzy tier**: a token
overlap rule was tried and matched `KIRANAKART TECHNOLOGIES (Zepto)` to `TATA
TECHNOLOGIES`, `MAN INDUSTRIES` to `Deep Industries` and `INTEGRIS HEALTH` to
`Star Health`. Near misses are LISTED for a human to commit as an alias — among
them a Borosil WARRANT against the Borosil EQUITY, which must never be joined.

### The audit against the family's consolidated review — and the question it was asked

*"the invested capital is incorrect and should be higher, and thus consolidated NAV
will also be higher … find the gaps and tell me the root cause and what we need
exactly to fill them."*

**THE FIRST HALF IS RIGHT AND THE SECOND DOES NOT FOLLOW**, and separating them is
the whole value of the audit, because the two halves need DIFFERENT documents:

```
  NAV      = Σ marketValue  over EVERY position
  Invested = Σ costBasis    over the positions that REPORT one
```

Different columns over different subsets. A position the book already carries at
its statement mark but with NO COST understates invested capital by its whole cost
and understates NAV by **nothing at all** — its contract note moves the first and
cannot move the second by a rupee. Measured: invested ₹471.92 Cr against the
review's ₹1,076.01 Cr, and the ₹604.09 Cr between them splits three ways:

| Cause | Invested | NAV | Size |
| --- | :---: | :---: | ---: |
| **A.** held, valued, no cost reported — 60 of 369 positions | understated | **unaffected** | ₹165.94 Cr of MV already in NAV |
| **B.** not in the book at all | understated | understated | ₹367.78 Cr at the review's marks |
| **C.** an aggregate block, itemised only on the review's own `Private Investments` tab | understated | understated | ₹136.16 Cr at the review's marks |

**EVERY ONE OF THE 60 IS IN A DEPOSITORY ACCOUNT** — ICICI NSDL and three Motilal
demats. A depository holds the shares and did not buy them, so no cost is a fact
about the document rather than a parsing failure: across the WHOLE archive not one
of those (account, security) pairs carries a cost on any record type. **A is closed
by contract notes, never by another holding statement**, and it is the only one of
the three that leaves NAV where it is.

**THE THREE OTHER TABS ARE LINE-MATCHED NOW, AND THAT MOVED THE RESIDUAL ₹184 Cr.**
Section C had only ever read the review's **Equity** tab, so Debt, Alternate and
Cash — ₹275.05 Cr — reached the bridge untested and section F could state only the
SIZE of that hole, beside a residual of the same order. `assetTabLines` reads all
three, through the same manager and security matchers, and **the residual is
−₹79.38 Cr against −₹263.10 Cr before.**

- **A heading is told from a holding by `Investment Date Range`.** A holding was
  bought over a window (`Jul-25 - Jul-25`); a heading is not a purchase, so the
  cell is blank or carries a stray Excel serial. Verified on all 30 rows of the
  three tabs. Columns are matched on HEADER TEXT — `Alternate` has no Quantity
  column at all, so every column after it sits one place left of where Debt and
  Cash put it, and a positional read returns the wrong column silently.
- **A heading with no children is a LINE, not a subtotal.** `PE Funds ₹32.71 Cr`
  sits above six funds summing to exactly that — skip it for its children.
  `Private Equity ₹136.16 Cr` sits above nothing: that block is itemised on the
  review's own `Private Investments` tab and is reported here only in aggregate.
  Skipping it as a subtotal loses ₹136.16 Cr; counting the ones that DO have
  children double-counts. So it is carried and MARKED, gets its own bridge step,
  and is kept OFF the ask list — no custodian issues a statement for a block.
- **Consecutive identical headings are one.** `Private Equity` prints twice, the
  second tagged `EG`. Counted twice it invents ₹136.16 Cr.
- **THE TAB'S OWN TOTAL IS THE WITNESS.** Every rule above is a judgement about a
  layout, so none is trusted: what is read must reproduce the tab's printed
  `Total`, and a tab that does not yields NOTHING and says so — the same licence
  `hdfcNsdl.mjs` needs to publish a rendered figure. All three tie to the paisa.

**IT CORRECTED THREE ROWS IN A SECTION THAT LOOKED FINE**, which is what says this
was a real gap rather than a tidy-up: Neo Infra (Debt), Baring PE and Transition
Venture (both Alternate) were reported as holdings *the review does not carry*
while the review carried every one of them on a tab nothing read. Five managers
joined C1, and the DSP Gold and Silver ETFs left the client ask list for D0 —
they are in the book, through the Motilal demat.

**AND THE ASK LIST IS FOUR DOCUMENTS, NOT THIRTY-EIGHT HOLDINGS.** That is the
deliverable: Motilal Oswal holding statements (20 lines, ₹244.59 Cr), Bharat's
HDFC Bank NSDL statement **as a text PDF rather than a scan** (10, ₹75.63 Cr), AMC
folio statements or a CAS for the Debt/Cash/Alternate fund lines (14, ₹47.56 Cr),
and one block with **nothing to ask for**. The Motilal figure stays an UPPER BOUND
and says so: the book already carries ₹78.78 Cr of Motilal demat rows no review
line matches, because the depository clips `WOC MAAF D-GROW` where the review
writes the scheme out in full and no tier above a prefix may join them. Closing
that needs a hand-checked abbreviation table, not another statement.

### THE RING-FENCE — Polycab is one page, and no figure anywhere else

*"We will remove everything related to Polycab from the dashboard, and move that
information as a single pager in this new Polycab page. So basically Polycab must
not be included in any data set information and any calculation in any other part
of the dashboard."*

That is the §4c judgement above, answered. It is a decision about the family's
affairs and NOT a parsing rule, which is exactly why it is applied at the BOOK
layer and nowhere else:

**ONE CONSTANT DECIDES IT.** `RINGFENCED_SECURITY_KEYS` in `build-book.mjs` holds
`polycab-india-limited-eq`. Right after the positions are sorted — before the
dedupe-for-total, the listed/private split, `positionsCount`, the emit and the
report, which ALL read the one `positions` array — the matching rows are spliced
out into their own array and emitted as **`BOOK_POLYCAB`**. Removing the key folds
the holding back into every total in one line, which is the reversibility §4c
requires of a decision that is the family's rather than the pipeline's.

**KEYED ON `securityKey`, NOT ON THE ACCOUNT.** `excludedAccounts` was the
mechanism this file named before the request arrived, and it is the wrong one
here: the ICICI NSDL account holds ELEVEN OTHER POSITIONS worth ₹63.78 Cr, and
excluding the account would take them out too — ₹63.78 Cr of the family's real
book vanishing to move one row. The security is the unit of the request, and
`securityKey` is this book's identity for a security (§1), so the fence holds
wherever the holding is reported rather than only where it is reported today.

**THE STATEMENT IS UNTOUCHED, AND SO IS THE ARCHIVE.** `source/` still holds the
PDF, `public/audit/` still carries every extracted row, and `nsdlDemat.mjs` still
reads all 38 holdings and still ties to the statement's own printed grand total
of ₹1,24,79,90,00,337.69 to the rupee. Ring-fencing is a decision about which
figures a DASHBOARD sums; deleting the extraction would be a decision to stop
being able to check the book, and it would break the provenance the audit archive
exists to provide. The Polycab page links straight into that document.

**AND THE PAGE DERIVES EVERY FIGURE — none is typed in.** `src/pages/Polycab.tsx`
reads `BOOK_POLYCAB` DIRECTLY rather than the portfolio context, so nothing on it
can leak back into a portfolio total, and its share count, market value, mark and
as-of all come from the book. The mark is DERIVED — value ÷ units, because an NSDL
statement has no rate column (§"the value column is a mark on 14 rows and par on
24") — and cost renders `AbsentValue` with its reason, because a depository holds
the shares and did not buy them. A ₹0 cost would report the whole ₹12,351.24 Cr as
profit at an infinite return.

***THE PAGE IS ONE TABLE CARD SINCE Stage 10bt*** — *"Polycab could be just a
simple table with all the columns and fields as required"* — so the hero, the five
KPI tiles and the stacked cards the paragraphs below describe are gone, and every
figure they printed is a column of the holding table, on the row it describes. The
reasoning below about what the statement does and does not carry is unchanged.

**THE PAGE IS THE HOLDING AND NOTHING ELSE — TWO CARDS HAVE SINCE BEEN REMOVED**,
at the family's request, and the reasoning is kept here rather than on screen. One
explained WHY the holding is ring-fenced; the other named Bharat's unreadable HDFC
scan as an absence. That second removal was made only after the premise behind it
was RE-MEASURED, because this file has recorded three absences against unchecked
premises (FRED, the RBI, the release calendar) and a fourth was worth ruling out:
the PDF carries **four DCTDecode JPEG images and ZERO font objects**, pdfjs returns
no text, and opening the scan by eye confirms both the `no-text-layer` diagnosis and
that the statement has **NO VALUE COLUMN AT ALL** — its Polycab line reads
`INE455K01017 · Free Balance 51,08,911` and nothing more. So the diagnosis was
right, no code could ever have extracted it, and OCR stays refused: a figure
recovered by OCR cannot be traced to what the document printed. The statement is
still in `source/`, still unread, and still needs a text PDF from the bank. What
changed is only that the DASHBOARD no longer says so; `docs/EXTRACTION-REPORT.md`
and the `august-2026-e` section above still do.

**AND THE CHECK INVERTED RATHER THAN BEING DELETED WITH THE CARD.** `check:pages`
now asserts the card STAYS gone — and, in the same line, that no share count from
that scan ever appears on the page, which is the half that would actually be
dangerous. Same treatment as the removed Public dashboard tab and the `/news`
redirects: a removal is verified by asserting it happened.

**BOTH HALVES ARE CHECKED, AND NEITHER IMPLIES THE OTHER.** `check:pages` walks
`/polycab` and asserts the holding renders with a share count, a value, the
statement that it is excluded from portfolio totals, and an absent cost with its
reason. And on EVERY OTHER ROUTE
in the sweep it asserts the page's `<main>` does not name Polycab at all. A page
that named it everywhere would fail the second while passing the first; an empty
`BOOK_POLYCAB` would satisfy every absence check while the page rendered nothing.
Both were verified by REINTRODUCING THE BUG: emptying `RINGFENCED_SECURITY_KEYS`
fires the absence check on nine routes — `cio`, `monitor`, `monitor-entity`,
`family-entity`, `sectors`, `compare`, `exposure`, `thesis`, `upload`, which is
the leak surface measured rather than guessed — and emptying `BOOK_POLYCAB` fires
the page's own checks while leaving the absence checks green.

**THE ABSENCE CHECK IS SCOPED TO `<main>`, DELIBERATELY.** Every other invariant
reads `document.body.innerText`, and the left nav carries a "Polycab" ENTRY on
every page by request. Read off the body it failed all 27 routes at once, for the
one reason that is correct — the same "a check that cannot read the figure it
asserts on" failure this file already names once. The claim is about a page's
CONTENT, so it is struck on the content.

**WHAT DID NOT NEED CHANGING, AND WHY THAT IS THE POINT.** The Excel and deck
exports, `dedupedPositions`, `publicPrivateSplit`, every allocation, sector,
entity, concentration and market-cap figure, and the XIRR all read the book
through `BOOK_POSITIONS` or the context built on it. One splice at the book layer
moved all of them. The surfaces that needed a hand were the two that read the
security by NAME: `review-reconcile.mjs`, which reconciles the promoter block
against the family review and now reads `BOOK_POLYCAB` — the review carries it
outside its own total too, so both sides are now ex-promoter and directly
comparable — and the stale worked examples in `check-pages.mjs`.

**ONE UNEXERCISED CODE PATH IS NAMED RATHER THAN DELETED.** The `CR` regex's
thousands-separator handling exists because this book once crossed ₹1,000 Cr and
three invariants read `₹13,061.6 Cr` as `13`. Ex-Polycab the book is ₹710.39 Cr,
so no page currently renders a separator and nothing would fail if that handling
were dropped. It comes straight back the first time the book grows past ₹1,000 Cr
or the key is removed — silently, on pages computing correctly, exactly as it did
the first time — so the comment says so.

**A SCAN IS NOT A DOCUMENT WITH NO READER.** Bharat's four pages are JPEGs —
pdfjs returns zero text items on every one — so there is no header to match and
no coordinate to read a column at. `extract.mjs` said `no-extractor`, which sends
the next person to write a provider reader for a file that has nothing to write
one against; it says `no-text-layer` now, and names the actual remedy: HDFC
re-sending it as a text PDF. Not OCR — a figure recovered by OCR cannot be traced
to what the document printed. The statement also carries NO VALUE COLUMN AT ALL,
so even read perfectly it would value nothing.

**THAT CHECK'S FIRST DRAFT DIAGNOSED THE REVIEW WORKBOOK AS A SCAN**, because
`gridFromSpreadsheet` gives every sheet `rows: []` by design. A confidently wrong
answer about a perfectly readable document is worse than the vague one it
replaced, so the test is gated on `grid.sheets` — what the grid itself uses to say
which kind it is.

**IDENTITY CAME FROM THE BOOK'S OWN UNIT COUNTS.** Neither statement prints a
PAN. Both carry fund units this book already holds from the funds' own
statements, matching to the last decimal: Sanshi Class A2 2,341,480.851 and Class
E 1,761,264.629 on Ajay's; Sanshi Class E 1,211,186.597, Sky Capital's Hudle A1
17,000 and 360 ONE Special Opportunities Series 8 Class A3 at the same
9,90,429.684 units on Bharat's. A name is a spelling; four exact unit counts
against four different funds are not.

### The Polycab page answers five asks, and the statements answer three

*"Polycab page should show the holding per demat, per holder, pledges, dividends
and splits."* Measured against the corpus rather than assumed, and the split
between what is reported and what is not is a fact about the DOCUMENT TYPE
rather than about the holding:

- **Per demat** — `INE455K01017` appears in exactly ONE document in the whole
  archive: the ICICI Bank NSDL `Statement of Holding`. Some thirty other files
  match "polycab" and every one of them matches the family's own
  **`@polycab.com` EMAIL ADDRESS** on a statement about something else. That is
  §"a document is not what it MENTIONS" arriving through a mail domain, and it
  is why the table is built on `securityKey` rather than on a name search.
- **Per holder** — the statement prints `Name AJAY T JAISINGHANI`, which
  `shared/owners.mjs` resolves. The rollup keys on the ACCOUNT and is
  deliberately NOT deduped: a per-owner breakdown shows each statement's row as
  printed (§"consolidated counts once, per-account does not").
- **Pledges** — an NSDL `Statement of Holding` has five columns: ISIN Code,
  Scrip Name, Account Description, Balance, Value. **There is no pledge,
  lock-in, earmark or freeze column on it at all.**
- **Dividends** — the only report type this account has ever issued is
  `holdings`. No dividend statement and no corporate-benefits report covers it.
- **Splits** — `BOOK_CORPORATE_ACTIONS` is real and populated: a 1:1 bonus, a
  1:5 bonus, a five-way spin-off and two distributions, across four accounts.
  This demat is not one of them and no row in it names this security.

**AND A NIL PLEDGE IS THE MOST DANGEROUS ZERO ON THIS PAGE.** The CDSL
statements elsewhere in this book DO print the encumbrance breakdown — `FREE
BAL. | PLEDGED SETUP | PLEDGEE | LOCKIN + FREEZE | SAFE/PENDING DEMAT | REMAT`,
with a measured `0.000` in each — so an unpledged balance is a figure this book
knows how to report honestly, and an invented one would be indistinguishable
from a measured one on screen. On a PROMOTER block, where a pledge is the fact a
reader would act on, it is also the most consequential zero available to invent.
The row rendered `—` with the reason, and `check:pages` asserts it can never
acquire a number that parses as zero.

***THE CARD THAT CARRIED THOSE LAST THREE ROWS IS GONE SINCE Stage 10bq***, at
the family's request, and the rule above is not. Its four claims were audited one
at a time before it went: the DIVIDEND distinction survives on the declared
table's `On this block · derived` column, which is what it is about; the BONUS
half survives and says something stronger, because the exchange's record is
complete from listing and carries none; the closing line genuinely went. **And
the PLEDGE claim — the paragraph above, and the only one on this page a reader
can be harmed by losing — moved onto the promoter card's third tile**, where it
sits BESIDE the group encumbrance it exists to be told apart from rather than two
cards away from it, which is a better home than the one it came from.
`check:pages` asserts that tile's dash, its reason and the group figure beside it
as ONE claim, and the card's absence as another. ***AND IT MOVED A THIRD TIME AT
Stage 10bt***: the promoter card became a table on its own tab, so the claim is on
this demat's own Pledged cell — `this demat` under the heading, and a dash whose
reason names the group figure as a different fact — while the group half is under
the promoter table's heading (`group, not this demat`). Two claims on two tables,
each asserted where it is drawn.

The paragraph below is kept in the order it was learnt, because what it says
about a card that can never be filled is still the rule this book follows
everywhere else. **`BOOK_CORPORATE_ACTIONS` is no longer read on this page at
all**: the record is unchanged, still names none of this security, and is still
what a future drop would fill — it simply has no surface here. *(Its original
wording:)* the card filtered `BOOK_CORPORATE_ACTIONS` on this holding's own
`securityKey` and summed `dividendReceived` off the position, so a drop bringing
a Polycab dividend or bonus into the archive would have filled those rows with no
code change. Until then each row stated what was missing and which document would
carry it, as **three rows in ONE card** rather than three dashed boxes: during an
upstream outage three empty frames read as three failures, which is the company
page's own lesson applied before it had to be learnt twice.

**THE STATEMENT'S `Account Description` IS MEASURED AND THEN DISCARDED, and that
is the one improvement left here.** `bandsFromHeader` in `nsdlDemat.mjs` derives
that column's band — it has to, to place the two money columns — and
`readHoldings` never reads it. It prints `Beneficiary` on the Polycab row,
`Beneficiary - Pre IPO Shares/27-AUG-26` and `Pending Demat` on others: a real
balance-TYPE field, and the closest thing this document has to a statement about
encumbrance. Carrying it needs a re-extraction, which needs
`GLOW_PDF_PASSWORDS`. It is named here rather than re-derived from `pages.json`
in the browser, because a presentation layer that repairs an extraction hides
the gap from the reconciler (§1) — the same reason `securityKey` is not patched
on the read side.

**SIX INVARIANTS, EACH VERIFIED BY REINTRODUCING ITS BUG.** `check:pages` walks
`/polycab` and reconciles the rendered tables rather than matching their
captions: the per-demat rows must account for every share the KPI strip reports
AND the strip for every share in `BOOK_POLYCAB` (two comparisons, because
rows-against-their-own-footer catches a total computed independently of its rows
— the Private Market page's PM-1 — and rendered-against-the-book catches a page
that drops the same row from both and reconciles perfectly with itself); the
per-holder rollup must regroup the same shares over the book's own count of
DISTINCT accounts; the share-of-block weights must sum to 100 (against the
portfolio they read ~1,738%, and it renders as an ordinary percentage either
way); every account number the book carries the holding in must appear; and the
three unreported facts must each be named and must each render a dash or a real
figure, never a zero *(that last pair went with the card at **Stage 10bq** and
INVERTED rather than being deleted: the three rows must now be absent, and the
pledge claim they carried must still be on the promoter card's third tile. The
two per-holder reconciliations moved with them — they bounded a `sliceBetween` on
the removed card's own heading, which is the "a boundary the page no longer
prints is not a boundary" failure, and they read that table's own node through
`data-polycab-holders` now)*. Verified by breaking each in turn — an off-by-one
tile, a demat count taken from rows, a weight over consolidated NAV, an unnamed
account, a fabricated nil, and a silently dropped row — and watching exactly the right
check fail. *(The KPI strip the first comparison read went at **Stage 10bt**; the
demat rows are reconciled against `BOOK_POLYCAB` directly now, and against their
own footer the moment there are two — while there is one, the footer's ABSENCE is
asserted, because a total of one row is the row again. The share-of-block weights
went with their column, which could only ever print 100% on a block held in one
demat, and the check inverted to assert the column stays gone.)*

**`ONLY=<route,route>` walks a subset of the sweep**, added for that
verification: the discipline costs a build and a full 62-combination sweep per
bug, and it is what makes reintroducing six of them practical rather than
theoretical. The default is still every route.

### THE VALUE COLUMN IS A MARK ON 14 ROWS AND PAR ON 24

`motilalDemat.mjs`'s rate column prints `100.000` on an AIF unit and that is the
face value, not a NAV. The NSDL statement has NO RATE COLUMN, so the same failure
arrives through the only price-bearing column there is. Divide value by balance:

```
NATIONAL STOCK EXCHANGE OF INDIA LTD   125,000 sh   Rs 1,25,000.00   = Re 1.00
INDIA SME INVESTMENTS AIF TRUST II      67,500 u    Rs 6,75,00,000   = Rs 1,000
SKS FASTENERS LIMITED                   24,800 sh   Rs 2,48,000.00   = Rs 10.00
```

NSE's unlisted share is not worth a rupee. **Fourteen different securities coming
to exactly Rs 10.0000 is not fourteen coincidences.** A par row therefore carries
its QUANTITY and NO VALUE, in three graded tiers — `declared` where the scrip name
states the face value and the implied price is exactly it, `scheme` for an `INF`
identifier at a unit's issue price, and `par` for a whole-rupee denomination on a
name that declares nothing. **Every row in the weakest tier is NAMED**, in the
extraction report and in `docs/BOOK-REPORT.md`, so any one of them can be
challenged. The error runs towards an em dash with a reason; the alternative is a
mark nobody struck, which renders as a number.

**AND THE PARTIAL CASE WAS GOING UNREPORTED.** `build-book`'s note for an account
that contributes no market value fired only when EVERY row was unvalued. This
account values 14 of 38, so its other 24 were dropped by the filter with nothing
said anywhere — 38 rows silently becoming 12 positions. That is "shown for those
and the rest are NAMED" failing INSIDE an account instead of across accounts, and
those 24 are now listed with their units and their face value.

**A RECORD IS THREE LINES AND THE ISIN IS THE MIDDLE ONE.** A cell too wide for
its column wraps ABOVE and BELOW the anchor line, so read line by line, `NEW FV
RS. 10/-` is a company. Non-anchor lines are assigned to the NEAREST ANCHOR BY Y,
which is a measurement: within a record the gaps are 4.6-9.6pt and between records
15-21pt. Two boundaries are load-bearing and both were found by getting them
wrong — the table starts BELOW its own header (or the first holding is named
`ICICI BANK LIMITED DP ID : IN302902 …`) and ends AT its own `Total Value of
Holding` row (or the last one is named `ZENITH LEISURE HOLIDAYS LIMITED - EQ Total
Value of Holding ( Prices as on 30-Mar-2026 ) Rs. 124,799,000,337.69 This is a
computer generated report …`, and that string becomes its securityKey).

**ONE VALUE WRAPS TOO, AND IT IS THE ROW THAT MATTERS MOST.** Polycab's
`123,512,419,665.00` is drawn as `123,512,419,665.0` at y703 and `0` at y693,
with the ISIN line between them at y698. Fragments are joined only where the join
yields ONE well-formed number, and the check that it is the right number is the
statement's own printed grand total: the 38 rows read reproduce
`Rs. 1,24,79,90,00,337.69` **to the rupee**.

**FOUR DEFECTS THIS DELIVERY FOUND IN CODE THAT WAS ALREADY HERE**, none of them
about ICICI:

- **`makeHolding` silently dropped `faceValue`.** Both depository readers have
  emitted it since they were written and the field does not exist on the object,
  so the archive never showed what the depository printed where it had no price —
  and the comment in each reader saying it did was false.
- **`dropDepositoryDuplicates`'s note had never printed.** It runs on POSITIONS,
  and a face-valued row carries no market value, so the unvalued filter removes
  every CDSL AIF row long before it. Its stated reason — that the depository
  "marks them at the face value it prints" — was therefore unchecked, and is false
  of the first rows it has ever actually dropped: the two Sanshi ones here, where
  the depository prints a real NAV. A dead branch with a confident explanation is
  how a future session "fixes" a rule that was never broken.
- **`dropDepositoryDuplicates` was keyed on ONE provider by name.** Four of this
  statement's fund ISINs are in `AIF_UNITS`; keyed on the CDSL provider alone,
  every one would have been counted a second time. It takes a SET now.
- **Three `check:pages` invariants could not read a book past ₹1,000 Cr.** They
  parsed `₹([\d.]+)\s*Cr`, which stops dead at a thousands separator, so
  `₹13,061.6 Cr` read as `13` and all three failed against pages computing
  correctly. `fmtFromBase` has always grouped Indian-style — its own header
  comment gives `₹1,606.8 Cr` as the format it exists to produce. The repair then
  introduced its own bug in one line, `Number("")` being 0, which made a check
  with no input PASS; that is `golden.mjs`'s rule, and a missing match is `NaN`.

### THE FILENAME OUTRANKED THE LETTERHEAD, AND AN ACCOUNT CHANGED MANAGER

V.E.C Assago has always filed as `VECBES0004_145052_…`. This delivery names the
same account `G128005_145052_…` — and `^G\d` is GOLDSTANDARD's prefix. All 23
new V.E.C documents, two accounts and ₹26.8 Cr of Ajay's and Ankita's money were
filed under Goldstandard Wealth.

Two things were wrong at once in `pmsStatements.mjs`:

- `detectProvider` tests the letterhead FIRST — and `extract()` called it with
  **`text: ""`**, so that branch could never fire and the decision always fell
  through to the filename. The pages were already in hand.
- The order then put `filePrefix` above the classifier's own answer. A filename
  is the WEAKEST evidence here: these six managers issue from one reporting
  system and the prefix is an account code, not a house. It is the last resort
  now, which is what it was written to be — the appraisal used to carry no
  letterhead at all.

Every one of those documents prints `V.E.C ASSAGO CAPITAL MANAGEMENT LLP` on
page one. This is §"a phrase in a footnote is not what a document is", one layer
down: **a filename is not a letterhead.**

### ₹11.5 Cr OF UNCALLED CAPITAL WAS BEING DROPPED ON A FIELD NAME

`transitionVenture.mjs` emits `commitment: { total, contributed, … }`;
`altFundStatements.mjs` emits `{ committed, drawn, … }`. `build-book.mjs` gates
on `isNum(c.total)`, so every commitment from the second shape fell out without
a word — **India SME's ₹6.9 Cr, ₹2.3 Cr and ₹2.3 Cr of genuinely uncalled
capital** among them. The dry-powder register held ₹1.5 Cr against a real
₹13.0 Cr, which is exactly the failure it was built to stop: *denying a figure is
worse than omitting it, because a reader plans around it.*

`makeDocument` normalises both spellings to one shape at the boundary, so a
third reader cannot repeat it. Field-by-field `??` and never `?? 0`: Motilal
Oswal's Founders Fund prints a commitment and a drawdown and NO undrawn figure,
and a zero there would assert the fund has nothing left to call. Sky Capital's
`Uncalled Commitment NIL` is the opposite case and keeps its measured zero. The
register is ten entries now.

### Check (c) was flagging one folio against itself

`duplicateHoldings` keyed on `account@asOf`, which lets ONE account's monthly
reissues satisfy a check whose own heading is "across owners". Sky Capital
reissues an unchanged statement every month, so Bharat's Hudle position appeared
four times at identical figures and was reported as a duplicate of itself; the
HDFC folio's two issues were doing the same, already. The guard is distinct
ACCOUNTS now.

### …and then it was flagging THREE pairs that are not duplicates at all

That fix left five groups, and this file said "the five groups that remain are
all real" **on the same page as its own reason why one of them is not** —
*"India SME's three folios print coincidentally equal units."* Both cannot be
true, and the contradiction was sitting in the prose for two deliveries.

**ONE FIGURE IS NOT "THE FIGURES THAT WOULD HAVE TO COINCIDE BY CHANCE".** The
key is `securityKey | quantity | unitCost | marketValue`, and the check's own
comment is the rule: a group is suspicious because SEVERAL independent numbers
agree. On a holding no statement values, quantity is the only one there is — and
two holders subscribing the same round number of units to the same fund is an
ordinary event. Measured, that tier was producing three false duplicates, each
refuted by a document already in hand:

| Flagged as one holding | Actually | The document that says so |
| --- | --- | --- |
| Sky Capital Oncare A3, 7,500 units, SKY023 + SKY024 | ₹1.50 Cr across two trusts | each folio's own statement prints ₹75 L drawn |
| India SME Fund II A2, 27,000 units, three folios | three subscriptions | this file already called it a coincidence |
| Swapeco Solutions, 347 shares, HDFC 67786547 + 67786137 | 694 shares across two trusts | the register records ₹1,35,00,875 under EACH |

**NONE OF THEM COLLAPSED ANYTHING, WHICH IS EXACTLY WHY IT HAD TO BE FIXED NOW.**
A quantity-only row carries no market value, so `dedupedPositions` drops it from
no total and no figure on screen was ever wrong. The day any of those funds
publishes a NAV, it would have halved a real holding silently, on a page
computing correctly — the same shape as `dedupedPositions` sitting correct and
uncalled for a drop and a half, running the other way.

So a match on fewer than TWO coinciding figures is **reported and never
grouped**, in its own section of the extraction report — narrowing detection and
NAMING what it left out, rather than dropping it. The three that remain are the
two Transition trusts and 360 ONE Special Opportunities under both CRNs, and the
₹3.17 Cr excluded from the consolidated total does not move by a rupee.

### Two more defects the same verification found, neither about a figure

Both were invisible in every artefact except the one written to catch them.

**A macOS RESOURCE FORK BECAME 25 FAILED DOCUMENTS.** Zipping on a Mac writes a
`__MACOSX/` shadow tree of 212-byte AppleDouble stubs named `._<real name>`,
carrying the real file's extension — so `READABLE` matched them, pdfjs failed on
them, and each became a `failed` document with no provider, no account and no
owner. They were invisible for as long as `source/_extracted/` happened to be
expanded by a tool that dropped them, and that directory is GITIGNORED and
DERIVED: a pipeline whose document count depends on who unzipped is not
idempotent. `walk()` skips them by path now, and `scripts/source-coverage.mjs`
still checks the bytes independently — the path says what macOS meant, the
`%PDF` header says what is actually there, and neither alone is enough.

**AND A READER SILENTLY ERASED ITS OWN PROVENANCE.** `extractOne` merges
`{ ...base, ...result }`, which is what gives a reader the last word on what it
read off the page. `base` also carries what only `extract.mjs` knows — which
file, how many pages, which pages of a bundle. `hdfcNsdl.mjs` returned a whole
`makeDocument(...)` instead of the partial every other provider returns, so that
object's own defaults spread over them and both its documents went into the
archive **naming no file**: right figures, no provenance, nothing failed.
`npm run coverage:source` is what caught it, by reporting both PDFs as UNREAD —
which is the check earning its place, and a good deal later than the merge. A
reader that returns an empty `docKey`, `sourcePath`, `pages` or `sourcePages`
now keeps the derived value and gets a `reader-cleared-provenance` warning.

### Two settlement deltas stand, and both are inside the printed precision

`transaction settlement` is held to ±₹1 on the house statements, deliberately:
that tightness is what caught brokerage being a per-unit RATE on all 256 rows.
Two rows now exceed it, and neither is an extraction error — both are the
residual of deriving a settlement from a price and a rate the report prints to
FOUR decimals:

```
V.E.C 128005  SBFC Finance   53,846 × 90.6262 + 0.1024/unit + STT   delta −1.77   bound ±5.38
Carnelian     Bandhan Bank   40,130 × 166.1882 + 0.1163/unit − STT  delta +1.27   bound ±4.01
```

The bound is `quantity × 1e-4` — half of the last printed decimal on each of the
two per-unit figures. Both sit well inside it, and the brokerage bug that
tolerance exists to catch was ~₹2,900 on a 22,476-share trade, more than a
thousand times the allowance. They are reported rather than explained away: the
`ratePrecision` machinery that would relax them exists and the house statements
opt out of it on purpose.

### Two engine defects the Molecule statement exposed

Neither is about Molecule. Both had been silently costing rows on statements
already in the book, and a new bundle is simply what made them visible.

**A REPORT TITLE PRINTS IN BOTH WORD ORDERS.** `lib/bundle.mjs` matched
`DIVIDEND STATEMENT` and `EXPENSE STATEMENT`; this reporting system also prints
**`STATEMENT OF DIVIDEND`** and **`STATEMENT OF EXPENSES`**, which is why
`STATEMENT OF CAPITAL GAIN` already needed its own entry. A page whose title
does not match announces nothing and joins the report BEFORE it, so Molecule's
two dividend pages were absorbed into CURRENT PORTFOLIO: the holdings document
was four pages of two different reports and the account's dividends reached no
reader. Every earlier document carrying those titles arrived STANDALONE, where
`classify.mjs` types the whole file and the splitter never runs — which is
exactly why it went unnoticed until the first bundle carried one.

**A HEADER SPAN WAS SWALLOWING THE FIRST DATA ROW.** `findTable` tries header
spans of one, two and three lines and keeps whichever maps the most columns.
A DATA row helps that score — its cells sit squarely in their columns, so the
geometry sharpens and one more label maps — so the longer span wins and its data
is read as header. Refusing the longer span is the wrong fix and was tried: it
loses the column the extra row was helping to place (Carnelian's `rate` went
unmapped and every `ratePerUnit` on that statement went null).

The span is a MEASUREMENT; the header is a set of LABELS; only the second says
where data begins. So the geometry keeps the full span and `bodyFrom` starts the
body at the first line carrying FIGURES. "Carries figures" is exact rather than
heuristic: every real wrapped label here — `Amount`, `(M)`, `Quantity (S)`,
`Rate (P)`, `Held`, `Gain-LT` — parses as no number, **and so does the capital
gain header's `31-Jan-18`**, a date inside the "Price on 31-Jan-18" label that a
no-dates rule would have thrown away.

It was worth **₹1,27,240.50 of dividend income the book had never carried** —
one row per statement, always the first:

| Account | Recovered | Row |
| --- | ---: | --- |
| Carnelian 3517383 | ₹62,750 | Biocon Ltd |
| V.E.C Assago 128004 | ₹25,189.50 | Navneet Education Ltd |
| Green Lantern 510854 | ₹17,850 | Bajaj Auto Ltd |
| Molecule 7810404 | ₹21,451 | the new statement's three rows |

plus three Goldstandard capital registers' `Opening Balance` rows and one
Molecule expense row. **Every affected dividend statement now ties to its own
printed grand total to the rupee**, which is the check that says the recovery is
complete rather than merely larger.

### A FOURTH BASIS: CURRENT PORTFOLIO FOLDS IN THE OUTSTANDING DIVIDEND

The nine material deltas the new statement raised were not extraction errors.
CURRENT PORTFOLIO's Market Value column folds in the dividend that has gone EX
and has not yet been RECEIVED:

```
INDIAN METALS    1,500 x 1,448.60 = 2,172,900.00  + 11,250 = 2,184,150  printed 2,184,150
KIRLOSKAR        2,967 x   475.65 = 1,411,253.55  +  8,901 = 1,420,154.55  printed 1,420,155
SASKEN             100 x 1,811.80 =   181,180.00  +  1,300 =   182,480  printed   182,480
```

and the account's printed total sits exactly 21,451 above the sum of the derived
rows — the figure its own DIVIDEND SUMMARY prints as "Outstanding Dividend".

**IT IS NOT THE INCOME COLUMN.** That column is year-to-date (Indian Metals
48,750 against 11,250 outstanding), which is why `explainedByAccrual` — the same
shape, reading `accruedIncome` — explained the one row where the two coincide
and left the rest material. `outstandingBySecurity` reads the SAME account's
dividend statement instead, and only a report the splitter actually produced —
which is why the title fix above had to land first.

Kirloskar's 0.45 residual is the printed price's own last digit, so the bound is
`quantity x 0.005`, the statement's printing precision reproduced — not a
tolerance widened until it fits. The percentage column is explained the same
way, by reproducing `printed market value / printed total` and requiring EXACT
equality at the two places the statement prints. Both are scoped to
`reportType === "holdings"`: the appraisal's market value is price x quantity
exactly and must keep failing loudly if it ever stops being.

Material deltas are back to the baseline's one — a pre-existing ₹1.27 settlement
difference on Carnelian's August transaction statement, which this delivery
neither caused nor fixed.

### A THIRD %-BASIS, DECLARED BY THE STATEMENT AND WORTH 46 MATERIAL DELTAS

SVAN's 31 July investor report put 46 material deltas in the reconciliation —
every `pctAssets` on the document, each about 11% adrift, which blocks the
golden test. It was not an extraction error. The report heads its weight column
**"Assets Under Management (%)"** and totals that column at **111.54%** of the
market value printed beside it:

```
Shares  144,891,378.61   155,651,492.21   105.37%
Cash      9,110,226.43     9,110,226.43     6.17%
Total   154,001,605.04   164,761,718.64   111.54%
```

So AUM is a SMALLER number than the portfolio's market value — 164,761,718.64
/ 1.1154 = 147,715,365 — and the total row is the only place the document
states it. Two source properties combine, which is why a naive check missed it:
the denominator is AUM, and on **11 of 46 rows the statement's own market value
does not equal its own quantity × price** (Ceat prints 1,590 at 3,429.90 and a
value of 5,509,191.00, which is 3,465.53 a share).

Reproduced from the printed value over the declared AUM, all 46 rows land
within the printed 2dp, so they are `explained` with that cause named — the
same treatment as the income-inclusive basis, and for the same reason: **the
formula is reproduced per row, never a tolerance widened.** The AUM is taken
from the document's own total row and nowhere else; an AUM fitted to the rows
it is meant to explain would explain anything, so a report that does not
declare one leaves its deltas material.

### Encrypted statements — `GLOW_PDF_PASSWORDS`

EIGHT of the PDFs in this drop are encrypted, and with the third password the
run now reports **zero failed documents**. The passwords are **never committed**;
they are read from the environment:

```
GLOW_PDF_PASSWORDS="one,two,three" npm run extract
```

`passwordsFromEnv()` in `lib/layout.mjs` supplies the list and every attempt is
tried in order per file, because it is not one password — three different ones
open eight files across four issuers, and which opens which is not printed
anywhere reliable. The drop's own `pASSWORD.docx` names two of the three, and
even those it mislabels: the entry it calls the Kotak password opens the August
Kotak statement and NOT the July one, which the ABSL entry opens instead. The
third — the one that unlocks Bharat's 360 ONE Alternates pair — is named in no
file here at all; it is his own PAN, printed on page one of statements this
pipeline already reads. **An unreadable document is not proof the key is
missing.** The archive records THAT a document was encrypted and which list
entry opened it, **by position, never the value**.

Two things about this are worth stating plainly rather than leaving implicit:

- These passwords are PANs and a SEBI registration number, so they are
  personally identifying and cannot live in a tracked file as configuration.
- They nonetheless appear in `public/audit/*/pages.json`, because **the
  statements print them on the page** and that file is the faithful text record.
  Removing them would break provenance for no security gain: `source/` holds the
  encrypted PDFs themselves in the same repository.

`extractLayout` hands pdfjs a COPY of the bytes per attempt. pdfjs takes
ownership of the buffer it is given and detaches it, so without the copy the
second password is tried against zero bytes and fails with a parse error that
says nothing about passwords.

### 1. `securityKey`, not ISIN, is the join key

These providers print a security **name and nothing else** — no ISIN, no ticker,
on any of the PMS statements. A model that requires an ISIN to identify a security
cannot represent this book at all.

So `Position.securityKey` — a slug of the normalised security name
(`securityKeyOf`) — is the identity, and it is what grouping, look-through, dedupe
and the `/stock/:securityKey` route all use. `isin` and `symbol` are **optional
enrichment**: nice when present, never required for a position to exist.

The normalisation is deliberately conservative (case, punctuation, trailing legal
suffixes — `HFCL LIMITED` = `HFCL Ltd.`) and preserves anything that distinguishes
real instruments (series, class, tranche). Merging two different securities into
one key is worse than showing them apart.

**Some providers glue the ISIN onto the name.** Carnelian's capital gain statement
prints `CRIZAC LIMITED-INE0S4R01014` in one column. `splitSecurityName` (in
`shared/securityKey.mjs`) separates them before anything else runs, so the key
comes from the CLEAN name — `crizac`, which joins that manager's own transaction
statement natively — and the ISIN is kept as enrichment rather than thrown away.
It runs on EVERY record type, not the one report that glues them today.

The pattern is anchored and narrow on purpose: a trailing `IN[EF]` + nine
alphanumerics, matched only at the end after a separator. An unanchored search
finds `INDraprastha Medical Corp. Ltd.` — same shape — and would amputate a real
company name; three statements in this drop carry it. A separator printed with an
empty ISIN column (`Vedanta Iron and Steel Limited-`) is trimmed too.

This used to be patched on the read side, in `src/lib/ledger.ts`. **Do not
reinstate that.** A presentation layer that repairs identity hides the defect from
the reconciler, which is the only thing that would have caught it.

### 2. Owner and custodian are different fields

`account` used to mean both "which family entity owns this" and "who holds it".
Those are two questions and one string cannot answer both. `Account` (in
`types.ts`) now carries `owner`, `provider`, `accountNo`, `strategy`, `engagement`
and `asOf`; `Position.accountId` references it; `Portfolio.accounts` is the
registry.

The old `custodianOf()` heuristic — which pattern-matched manager names out of the
account label — **has been deleted**. It was only ever safe against a known set of
four managers. Read the registry (`ownerOf`, `providerOf`, `custodyLabelOf`,
`isDirect`); never infer a manager from text.

### 3. As-of is per account

Statements for different accounts carry different report dates, so a consolidated
total is nearly always a blend. `Portfolio.asOf` is only the **newest** of them.
`staleAccounts()` / `stalenessNote()` name the ones lagging behind, and
`<BasisPill>` renders an "N accounts behind" pill wherever a page shows a
consolidated total. Don't present the blend as one clean date.

### 4. Sectors are per provider

Each platform uses its own taxonomy. `Position.sector` is our normalised value;
`Position.providerSector` is what the provider actually printed. Both are kept —
neither is authoritative on its own.

### 4b. Primitives are ingested; everything derivable is DERIVED

A statement's own arithmetic is not internally consistent. The Goldstandard
Appraisal prints Sundaram Finance at MV 7,740,510 with %Assets 4.29%, but
7,740,510 / 181,533,677 = 4.26% — its percentage is on an income-inclusive basis
its own MV column excludes. Ingesting both as facts imports that contradiction.

So `makeHolding` takes only **primitives** — quantity, unit cost, total cost,
market price, accrued income (plus market value where no price is reported, e.g.
360 ONE AIF units, flagged `marketValueFromPrinted`). `deriveHolding` computes
market value = price x quantity, gain = value - cost, %gain, and %assets.

**The %assets denominator is derived, not printed.** It is the sum of the derived
market values including cash, NOT the statement's printed total. Both sides then
sit on the same measurement and the weights add to 100. Dividing an ex-income
numerator by the printed income-inclusive total leaves them summing to 99.83 —
a gap that is neither rounding nor a holding, just two bases mixed together.

The printed figures are kept in `printed.*` as a **CHECK, not a source**. Every
delta lands in the extraction report's section (a2).

**The one income-inclusive rule, verified exactly.** Across all five appraisals,
every appraisal row satisfies

```
printed %Assets = (row market value + row accrued income) / (printed total, itself income-inclusive)
```

so those deltas are classified `explained` with that cause named, by reproducing
the formula per row — not by widening a tolerance. The same basis explains every
row-sum shortfall: `sum(marketValue)` falls short of the printed total by exactly
the account's accrued income (Goldstandard 100023: ₹3,79,600, to the rupee).

### 5. Asset class is what a thing IS; engagement is how it is RUN

`AssetClass` = `Equity | ETF | Mutual Fund | AIF | Bond | Structured Product |
Unlisted | Cash`. **PMS is not on that list and must never be added.** A
portfolio-management mandate is a relationship with a manager; the holdings
inside a PMS are ordinary listed equity and are classified as such.
`assertNormalized` rejects a document that tries otherwise.

How an account is run is `Account.engagement` = `PMS | AIF | Advisory |
Distribution | Execution | Direct | unknown`, with `providerEngagement` holding
the provider's own wording verbatim.

**Engagement lives on the MEMBER, not the account, and is never defaulted.** One
360 ONE CRN spans several member sub-accounts on different engagements —
CRN37702 carries a Distribution member and an Executionary one, and its May
corporate actions are tagged Executionary while its holding sits in
Distribution. `Account.members: Member[]` holds them; `Account.engagement` is
**derived** (`dominantEngagement`) from whichever member carries the most value.
An engagement that cannot be read is `unknown` and warns — never Advisory by
default, which would mislabel both of this book's CRNs.

### 4c. Duplicates: carry both, count once — until the family answers

*Reversible policy, kept in one place; answered for both of this book's pairs.*
The same position can appear on two family members' statements. Neither row is
suppressed: matching rows share a `dedupeGroup` and carry `alsoReportedUnder`, an
account view shows each statement as printed, and **consolidated totals count
each group once** (`dedupedPositions` in `src/lib/analytics.ts`, mirrored by
`consolidatedValue` in `reconcile.mjs`).

**Figures that coincide are evidence of one holding reported twice, never
proof**: two members can buy the same units of the same fund on the same terms.
So count-once is an answer pending, and only the family can give the real one.
Their answers are `shared/separateInvestments.mjs`: a pair it names is two
investments, forms no `dedupeGroup`, and is counted in full. On 28 Sep 2026 they
named both of this book's pairs (Stage 10cx), so on this book the policy tags
nothing. It stays for the next pair a drop brings. Deleting an entry puts that
pair back under it: `npm run replay:dedupe`, then `npm run build-book`.

### 6. One person, one ownerId

The same family member is printed three ways across these providers — `Mr. AJAY
T JAISINGHANI` (360 ONE), `Ajay Thakurdas Jaisinghani` (Goldstandard), `Ajay
Jaisinghani` (a family-name field). Grouped by printed name, one person becomes
three and every per-entity total, allocation and XIRR is quietly wrong.

`shared/owners.mjs` is the canonical registry: `{ ownerId, displayName,
aliases[] }`, matched case- and honorific-insensitively, plus an initials rule
that bridges `Thakurdas` and `T` without merging different first names. Every
account resolves to an `ownerId`. **A name that matches nothing is reported
loudly** in the extraction report's "unresolved" section — never turned into a
new owner.

(`SattvaSummary` from the source cockpit is `BookSummary` here.)

## The ingest pipeline

```
source/*.{zip,pdf,xls,xlsx} raw statements — committed, NEVER served to a browser
   |  npm run inventory     what is in the drop, grouped and classified
   v
docs/INGEST-INVENTORY.md    provider -> account -> as-of -> reportType
   |  npm run extract       coordinate-aware extraction + reconciliation
   v
public/audit/<docKey>/      extracted tables, keyed by DOCUMENT (served, gated)
docs/EXTRACTION-REPORT.md   does it tie out?
   |  npm run build-symbols securityKey -> NSE symbol (name-matched, see below)
   |  npm run build-book     precedence applied, sectors mapped, gaps left as gaps
   v
src/data/glowData.ts        the book        docs/BOOK-REPORT.md   what it does NOT carry
```

All four steps are idempotent, and `glowData.ts` regenerates **byte-identically**
from `source/` alone.

### Stage 1 — inventory (`npm run inventory`)

Expands every ZIP (including nested), walks every PDF, records path / size /
pages plus a best-effort `{ provider, ownerName, accountNo, asOfDate,
reportType }`, and groups **provider → account → as-of → report type**. That
grouping is the point: *one account at one date routinely produces several
overlapping reports that sometimes disagree*, and which one is authoritative is
a decision someone makes, not an accident of parse order.

### Stage 2 — extraction (`npm run extract`)

**ONE FILE IS NOT ONE DOCUMENT.** `lib/bundle.mjs` runs first: every page of these
statements reprints its report title, so a run of pages sharing one title is a
document, and a page with no title continues the one before it. Three files in
this drop carry several reports each. A file resolving to fewer than two report
types is not a bundle and is returned untouched.

**NOT EVERY FILE IS A PDF.** `lib/sheet.mjs` reads Office Open XML and the HTML
tables that brokers name `.xls`, sniffing the format from the FIRST BYTES rather
than the extension — handed to pdfjs, an HTML table comes back "Invalid PDF
structure" and gets reported as a corrupt download that does not exist.

**PAGE ROTATION FIRST.** Most of these statements are `/Rotate 90` pages — every
transaction statement, bank book, capital register, capital gain, dividend,
corporate benefits, expense statement and CURRENT PORTFOLIO. On such a page the
glyph transform is `[0, s, -s, 0, tx, ty]`, so `transform[4]` runs DOWN the
displayed page. Reading x from it TRANSPOSES the table — every column becomes a
row — and it does not fail, it yields a grid where "Exchg NSE NSE NSE …" is one
line and each trade is a column. `itemsFrom` maps coordinates by the page's own
rotation before anything else runs.

**Coordinate-aware, via `pdfjs-dist`.** The text layer of these statements is
column-scrambled: values print out of document order and run together
(`-33.7912,500`), and figures split mid-number across spans (`3,440,` `425.00`)
and across lines (`2,037,517.` / `00`). Line-based regex parsing produces numbers
that are wrong and look right.

- `lib/layout.mjs` — x from `transform[4]`, y from `transform[5]`. Clusters rows
  by y (tolerance absorbs sub-pixel drift and superscripts), infers columns from
  a horizontal occupancy histogram, and stitches split numbers.
  **`regrid()` matters:** columns are inferred over ONE TABLE REGION, never the
  whole page — a full-width title bridges the blank corridor between two columns
  and collapses them. Getting this wrong silently merges the security name into
  the quantity column.
  **`splitByAlignedEdges()` matters too:** the blank corridor can close
  completely on the widest row, so columns are also refined by their ALIGNMENT
  edge — right edges for money columns, left edges for text ones. Each column is
  cut only along the side it is *not* aligned to, or two values of equal width
  would fake a boundary through the middle of the figures.
- `lib/parseNum.mjs` — Indian (`1,45,80,412.51`) and Western grouping, leading /
  trailing minus, parenthesised negatives. **`null` means NOT REPORTED and never
  zero.** A grouping validator rejects concatenations like `-33.7912,500` rather
  than returning a plausible wrong number.
- `lib/table.mjs` — tables are located by matching HEADER TEXT, never by column
  index, so a layout change surfaces as "column not matched" instead of wrong
  figures. Header labels are matched two ways, because these reports break them
  both ways: **per span** (Carnelian emits all nine labels as ONE item, split by
  character offset within it) and **per column across the header lines** ("Unit"
  above "Cost" is the Unit Cost column, though neither line alone says so).
  `bandToHeader` confines a table to the horizontal band its own header occupies,
  for the fact sheet's two-column magazine layout.
- `providers/pmsStatements.mjs` — ONE extractor for all three managers, who
  publish from the same reporting system. **Nothing provider-specific may leak
  past this layer**; `lib/document.mjs` defines the normalized shape and
  `assertNormalized` enforces it at runtime.

**Three period vocabularies, three sets of fields.** Goldstandard prints to-date
periods (`MTD QTD YTD Since`), Green Lantern and Carnelian trailing ones
(`1m 3m 1y Since`), and the performance appraisal a transposed third
(`1 Month / 3 Months / 6 Months / Since inception`). They are stored as
`mtd/qtd/fytd` and `m1/m3/m6/y1` respectively — never folded together, because a
trailing one-month return and a month-to-date return are different measurements.
`ReturnSeries.feeBasis` records whether returns are after fees (Goldstandard) or
before them (Carnelian), as each report's own disclosure states.

**Every report type has a reader.** The appraisal and fact sheet supply the
holdings, sectors and returns; the transaction statement supplies the dated
trades; capital gain, dividend, corporate benefits, bank book, capital register
and expense statement supply the rest. CURRENT PORTFOLIO is read for TWO FIELDS
ONLY — per-position accrued income and IRR% — because precedence names the
appraisal authoritative for everything else it duplicates and its market value
folds accrued income in on some rows but not others.

**Brokerage is a per-unit RATE, not an amount.** The transaction statement prints
`0.1288` against a 22,476-share trade at `128.8256` — a tenth of a percent of the
price, charged per unit. Read as an amount, every one of the 256 trades settles
short by roughly its own brokerage. Read as a rate, `gross + rate x quantity ±
STT` reproduces the printed settlement on all 256 to within one rupee. Section
(a3) of the reconciliation is what found it.

**The bank book's Buy/Sell and Dep/With columns are already SIGNED** (a buy prints
`-2,898,379.09`). Imposing a sign moves every trade row by twice its own value.

**Flows carry their window.** `periodFrom`/`periodTo` on every flows block. The
performance summary runs the financial year to date, the performance appraisal and
fact sheet run since inception, and both print a "Realized Gain" — ₹4,15,051.23
and ₹8,82,423.12. Both are right. Comparing them as a disagreement produced 14
phantom deltas that would have buried the 3 real ones.

### `precedence.mjs` — a committed decision

Which report is authoritative for which fact, per provider. Not a default:
"whichever file we parsed last wins" produces a different book on every run.
The reconciler reports disagreements; precedence decides what is used.

For all four PMS managers — who share one reporting system and therefore one
precedence block — **PortfolioAppraisal is the clean basis**: its market value
equals price × quantity exactly. CurrentPortfolio folds accrued income into
market value on some rows but not others (Sundaram Finance yes, Sonata Software
no) while adding it to Total G/L on every row, so accrued income is carried as
its own field instead.

The block's keys must match `PROVIDERS[*].name` in `pmsStatements.mjs` character
for character. A key that doesn't match resolves to no precedence at all and the
reconciler then reports disagreements with nothing to say about which side to
believe — which is exactly how "Goldstandard" spelled "GoldStandard" silently
disabled this whole table.

### Stage 3 — reconciliation (`docs/EXTRACTION-REPORT.md`)

Extraction that "ran" is worthless; extraction that ties out is the product.
Five checks, none of which resolve a conflict:

| | |
| --- | --- |
| **a** Row sums vs printed totals, per table — both figures and the delta |
| **a2** Derived vs printed — every computed figure against the statement's own |
| **b** Cross-report deltas — same account, same as-of, field by field |
| **c** Duplicate holdings with identical primitives — **flagged, never deduped** |
| **d** Coverage — found / parsed / partial / failed, with reasons |
| **a3** Dated statements — derived settlement vs printed, bank-book running balance vs its own flows, capital-gain lots vs the account's stated realised gain |
| **e** Unresolved — securities with no symbol, owners with no canonical match, report types with no reader |

Every delta a check reports carries a `severity`, and the distinction is the
product:

- `rounding` — within the printing precision (≤ ₹1, ≤ 0.005pp). Aggregated, does
  not block.
- `explained` — reproduced exactly from a known basis difference, with the cause
  named. Also does not block, because it is understood rather than merely small.
- `material` — anything else. Reported per row, and it blocks the golden test.

**As of this calibration exactly TWO material deltas stand**, both named and
both quantified above: ₹1.27 on Carnelian's 2026-08-10 transaction statement and
₹1.77 on V.E.C 128005's 2026-08-13 one, each a settlement residual inside the
precision of a four-decimal price. The run is 261 row-sum checks, 670
derived-vs-printed, 1,881 dated-table row checks and 18 cross-report. Every
other delta that is not `ok` is `explained` or `rounding`, and every `explained`
one names a basis difference reproduced exactly — never a widened tolerance.

This paragraph read "zero material deltas anywhere" with counts of 119 / 250 /
1,112 / 5 for several drops after both had stopped being true. **A figure copied
into prose does not regenerate**, which is the same reason `docs/BOOK-REPORT.md`
counts the ST/LT split rather than asserting it: the numbers above come from
`docs/extraction-report.json`'s own summary and should be re-read from it, not
edited to taste.

Check (c) exists for a real case, and this drop contains it: 360 ONE Special
Opportunities Fund Series 8 Class A3 appears with byte-identical figures under
CRN37702 and CRN60117. Summing both double-counts ₹1,45,80,412.51. Deciding which
statement owns the position is a judgement about the family's affairs, not a
parsing rule, so both rows are carried and the consolidated total counts the
group once.

**A SNAPSHOT SUPERSEDES; A DATED ROW DOES NOT.** `newestPerReportType` keeps the
newest issue of each report type per account, which is right for a holding
statement — June restates May, and counting both doubles the account. It is wrong
for a trade, and this drop is the first where that matters: SVAN's May investor
report was superseded by June's and May's trades went with it, 360 ONE's bundle
carries a corporate-action statement INSIDE its holdings document so superseding
May discarded May's corporate actions, and Green Lantern's two capital gain
statements cover different windows. Dated rows are therefore unioned across every
issue and deduped on their own identity — the same row printed on two statements
counts once, and two different rows sharing a date both survive.

**The tags must reach disk.** `applyDedupePolicy` runs inside `reconcile()` and
writes `dedupeGroup` / `alsoReportedUnder` onto the in-memory holdings.
`extract.mjs` therefore reconciles BEFORE `writeArchive` — it used to do the
opposite, which froze untagged rows to disk and left the tag existing only for
the length of one function call. That was invisible for as long as no drop
contained a duplicate. The first one that did was ₹1.46 Cr counted twice.

### Stage 4 — tests (`npm run test:ingest`)

- `parseNum`, `layout`, `pipeline` — the machinery, against PDFs generated in
  the test with known coordinates. These must pass.
- `golden.mjs` — figures read off the REAL statements by a human. Four outcomes:
  PASS; **FAIL (exit 1)**; **BLOCKED (exit 2)** for a case whose statements are
  absent; and **NOT CHECKED** for a figure whose report type this engine
  deliberately does not read, marked `pending` with the reason and counted apart
  from both passes and failures. FAIL outranks BLOCKED. Neither blocked nor
  unchecked is ever reported as a pass: a test that passes with no input claims
  confidence nobody earned.

### The audit archive

`public/audit/manifest.json` is an array, one entry per document, carrying both
the document identity (`docKey`, provider, account, owner, ownerId, asOf,
reportType, sourcePath, pages, sections, status) and the fields the Data Audit
browser reads (`fileKey`, `sheets[]`). Per document:
`<docKey>/<section>.json` (`{ name, rows }`), `pages.json` (raw per-page text,
for provenance) and `document.json` (the normalized facts).

`docKey` = `<provider>-<accountNo>-<asOf>-<reportType>`.
**Raw PDFs stay in `source/` and are never copied under `public/`.**

The account number in that key is the one the STATEMENT PRINTS, not the one in
the file name — they disagree. `G100023_100023_PortFolioFactSheet.pdf` prints
`Account: 100022`, and keying it by file name filed Ankita's fact sheet with
Ajay's statements. `rekey()` in `extract.mjs` re-derives the key after extraction
and carries every `source` back-reference with it; `ensureUniqueDocKeys()` makes
a collision a visible warning rather than one document silently overwriting
another on disk.

Two identity fields are joined from this drop's own statements when a report
doesn't print them, each recorded as derived with a warning naming the join:
`accountNoSource: "client-code"` (Green Lantern and Carnelian print
`AJAY T JAISINGHANI - GLC0780`, and other reports for that client print both
identifiers) and `ownerSource: "same-account"`. Neither is a guess; both are the
same account's own paperwork, and both are applied only when the mapping is
unambiguous.

Adding a provider: write `providers/<name>.mjs` returning a normalized document,
register it in `extract.mjs`'s `EXTRACTORS`, and add its precedence block.

## Stage 5 — the book (`npm run build-book`)

`scripts/build-book.mjs` turns the archive into `src/data/glowData.ts`, applying
`precedence.mjs` at every field: holdings and primitives from the appraisal,
`providerSector` from the fact sheet, accrued income and IRR% from CURRENT
PORTFOLIO, realised gains from the capital gain statement, capital movements from
the capital register (or the bank book where a provider issues none).

**It will not fill a gap.** Where the corpus does not support a figure the field
is `null` or the array is empty, the reason is printed at the end of the run and
written to `docs/BOOK-REPORT.md`, and the UI renders `—`. In this drop that is:

| Not populated | Why | What would fix it |
| --- | --- | --- |
| ~~`navHistory`~~ | **NOW POPULATED — see Stage 10p, and Stage 10ar for the window.** This row read "two dated portfolio values per account is not a series" for four deliveries after the archive started carrying three month-ends for some accounts. 13 of 51 accounts publish two or more dated valuations; 23 publish one and 15 publish none, and all of them are NAMED in `BOOK_NAV_COVERAGE`. The series is **12 points over 2026-05-31 → 2026-08-13** since each link was struck over the accounts valued at both its ends — it was 7 over 34 days while it began where the panel completes | a monthly valuation statement from any of the other 38 |
| `stCostBasis` / `ltCostBasis` / `daysToLT` on 296 of 301 positions | needs per-lot purchase dates. The CAPITAL REGISTER the managed accounts issue is a capital-account ledger (contributions, withdrawals, TDS), not a lot register | a holding statement with lot-level acquisition dates, which ONE broker in this drop publishes — see below |
| `privateMarkets.peFunds` etc. | no statement here reports a fund-of-funds structure with its own TVPI and DPI. The AIF HOLDINGS are ordinary positions with `assetClass: "AIF"`, and the undrawn COMMITMENTS are `BOOK_COMMITMENTS` | a fund-of-funds statement |

**The split is produced only where the lots ACCOUNT FOR THE UNITS HELD.** The
register and the holdings statement are drawn at different dates, so they drift:
Pricol's register carries 650 units bought 05/02 and 2,225 bought 05/05 against a
holding of 650, and summing both put a short-term basis of ₹16,71,343.29 on a
position whose entire cost is ₹3,78,730.63 — a tax basis 4.4x the money in it.
Belrise's register carries 6,500 against 12,500 held, so the split covered 52% of
the position and the uncovered ₹8,51,340 silently read as "long-term ₹0". Both
now render `—` and are NAMED in the book report. Five positions reconcile exactly
and keep their split; that is the same rule `costFor` already applies to the cost
join, and for the same reason.

**The short/long-term split IS produced now, for one account.** LKP's `519:
Annual P&L II` is a lot register: one row per lot with both the buy date and the
sale date, and a row with no sale is an OPEN lot carrying its acquisition date.
So days held, the ST/LT split of unrealised gain and the cost basis on each side
are all measurable there, on India's 12-month threshold for listed equity — and
`null` on the other 22 accounts, which is the truth rather than a split estimated
from an average holding period. `docs/BOOK-REPORT.md` COUNTS which, so the note
cannot go stale the way its predecessor did: it claimed the split was impossible
on every position while the register sat unread in `source/`.

**A depository does not know what shares cost.** LKP's holding statement prints
ISIN, quantity, rate and value and no cost — CDSL holds the shares, it did not
buy them. Nine of those ten positions recover a cost from the broker's own
opening ledger row, joined ONLY where the quantities match exactly, and recorded
as `costBasisSource: "opening-position"`. The tenth, a liquid ETF the ledger does
not carry, genuinely has none. So `costBasis`, `unrealizedPnL` and `returnPct`
are `number | null` on `Position`: a zero cost reports the whole market value as
profit at an infinite return.

**Undrawn capital is not a holding.** `BOOK_COMMITMENTS` carries what the family
has committed to a drawdown fund and not yet paid — ₹75 L per Transition Venture
trust. It is a LIABILITY the fund can call, kept apart from `positions` because
the fund's current value is already one and adding it here would count ₹3.43 Cr
twice. The Morning CIO's dry-powder tile read `privateMarkets`, found it empty
and printed "no fund commitments in this book" while both statements sat in the
archive. Denying a figure is worse than omitting it: a reader plans around it.

**Cash flows are checked, not assumed.** The capital-register total is compared
against the performance summary's own Net Capital In/Out over the same window —
they agree to the rupee on every account that prints both — and the window's
opening portfolio value is the series' first entry, because a return computed
against the few thousand rupees of TDS that moved during the period is nonsense.

### Sectors — `shared/sectors.mjs`

Provider sector → GICS, as a committed map. Nothing is inferred: the three
platforms disagree with each other on nearly every name ("Non Banking Financial
Company (NBFC)", "Finance (including NBFCs)", "Banks"), and a wrongly-sectored
holding looks exactly like a correctly-sectored one on an allocation chart.
Anything unmapped renders **Unclassified** and is listed in the book report.

The one bridge is a PREFIX match, because these fact sheets clip the sector
column to its width and the same sector arrives as `Heavy Electrical Equip`,
`Heavy Electrical Equipmen` and in full. A prefix must be ≥8 characters and match
exactly one entry; an ambiguous prefix stays unclassified.

**IT ALSO CARRIES THE AMFI *INDUSTRY* LEVEL NOW, and `src/lib/sectors.ts` is the
browser's door to the same table.** The block seeded from the PMS fact sheets is
that taxonomy's MACRO level; a fund's own SEBI monthly disclosure prints the
INDUSTRY level, and 57 of the 65 labels `public/lookthrough/` carries resolved to
nothing until they were listed. That is what lets Sector Composition place a
company by the industry a filing printed against its ISIN — see Stage 10aq, which
also records that the FIRST measurement of the gap was wrong because it compared
`resolveSector`'s object against a string.

### NSE symbols — `npm run build-symbols`

**EVERY LIVE ENDPOINT IS KEYED ON THE NSE TRADING SYMBOL, AND NOTHING ELSE.**
`quotes` posts `ticker_symbol`, `insider` and `research` post `ticker`,
`/financials` wants `<SYMBOL>.NS`, `prices` takes `symbol`, `ratios` takes
`tickers`. **None of them accepts an ISIN or a name.** So "can this security
reach the APIs?" reduces entirely to "did a symbol resolve?", and
`docs/SECURITY-IDENTIFIERS.md` — generated by this script — answers it per
security, with the identifier that resolved it or the reason none did.

**THE ISIN TIER IS NEW, AND ITS ABSENCE WAS THE FOURTH UNCHECKED PREMISE.** This
section used to read "Keyed on name, not ISIN: no statement in this book prints
one." That was TRUE when written and FALSE since the depository statements
arrived with `august-2026-d` and `-e`: **69 of 214 securities now carry an ISIN**.
Nobody re-measured, so the resolver went on matching names — and the depository
prints `AXIS BANK EQ`, `ICICI BANK-EQ`, `SBI - EQ`, `INDUSIND BANK EQUITY`,
`CITY UNION -EQ RE1/`. No name tier bridges that, so Axis, ICICI, SBI, IndusInd,
Federal, Karur Vysya, City Union, RBL, Crompton, Kaynes, Zaggle and PG
Electroplast all sat unpriced while their ISINs matched NSE's master exactly.
This is FRED, the RBI and the release calendar again: *an absence recorded
against a premise nobody rechecked*.

The tiers are now **ISIN → exact name → securityKey → override**, and there is
still no fuzzy tier. Adding an identifier above the name tiers makes the match
STRICTER, not looser: where both answer they are **compared**, and a
DISAGREEMENT leaves the security unresolved rather than either side winning
silently. That check is printed on every run **even when it is zero** — a safety
check that only speaks when it fires is indistinguishable, on a clean run, from
one that was quietly deleted. Measured on this book it fires zero times, which
is what earns the tier its place: **0 mappings changed, 0 lost, 30 added**.

**THREE MASTERS, BECAUSE NSE PUBLISHES THE UNIVERSE IN THREE FILES.** Mainboard
`EQUITY_L.csv` alone would still miss four SME listings (EMA Partners, Grand
Continent Hotels, Infinium Pharma, Parth Electricals) and both precious-metal
ETFs — reported as "no NSE listing" about names NSE lists. Each master declares
its COLUMN NAMES rather than positions, because the three disagree on spelling
(`ISIN NUMBER`, `ISIN_NUMBER`, `ISINNumber`) and the previous positional read
would have returned a different column silently the first time one gained a
field. Each is checked by CONTENT, not status: NSE answers 200 with an HTML
error page often enough that a status-only test reports a working list and
resolves nothing.

**WHAT STILL CANNOT RESOLVE, AND WHY THAT IS FINAL FOR MOST OF IT.** An `INF`
ISIN is a FUND unit — an AIF, PMS or mutual-fund folio is one purchase of a
manager's portfolio, and NSE lists no equity symbol for it however it is
identified. That is a permanent absence, not a missing identifier, and the report
says so rather than telling a reader to go and find an ISIN that would not help.
The genuinely actionable rows are the handful of listed COMPANIES a PMS
statement names without an ISIN (Cosmo Films, Credit Access Grameen): those need
either an ISIN-bearing statement or a hand-checked `OVERRIDES` entry.

### The missing cost figures are MISSING, not broken — and the page must say which

The family opened Fractal Analytics and saw Avg cost, Unrealised P&L, Realised
P&L and Change today all dashed, and asked whether the data was absent or the
dashboard was buggy. **That question is the defect.** Measured, both halves:

- **The data is genuinely absent.** 60 of 371 positions carry no `costBasis`,
  all of them in depository accounts — the Motilal Oswal CDSL demats, ICICI's
  NSDL, one LKP row. Across the WHOLE audit archive, **not one of those (account,
  security) pairs carries a cost on any record type** — not on a holdings row,
  not on an open lot, not on a transaction. The demat transaction statements have
  no price field populated at all, which is the same finding `precedence.mjs`
  already acts on: a depository movement is not a trade. Realised is the same
  shape — 7 of 49 accounts issue a capital gain statement, and **zero accounts
  with a capital-gain document lack a realised figure in the book**. There is no
  join failure in either direction; the em dashes are correct.
- **The PAGE was wrong.** Two of those four tiles named their cause ("no capital
  gain statement covers this name", "no live quote") and two did not: Avg cost
  printed `invested —`, which is a SECOND DASH rather than a reason, and
  Unrealised P&L printed `on cost` — a basis the figure does not have. Every
  sibling surface already did this properly (`MandateHoldings`: "no row on this
  statement reports a cost"; Morning CIO: "no statement in this book reports a
  cost basis"), so the stock page was the one outlier, and it is the page a
  reader opens when they want to know why.

`costWhy` NAMES THE CUSTODIAN, from the account registry (`providerOf`) and never
from the security name — "no cost on the ICICI Bank (NSDL demat) statement for
this holding". Scoped to THIS holding, so it stays true for an account that
reports a cost on its other rows. That is `Absent.tsx`'s rule arriving one tile
late: a reason is a REQUIRED argument, because a reader who cannot tell "the
custodian does not send this" from "the dashboard is broken" assumes the second.

`check:pages` walks `stock-nocost` — the largest costless company share, DERIVED
from the book rather than typed — and asserts both tiles name the statement, that
neither falls back to `invested —`, and that the other two still carry their own
reasons so a future edit cannot fix one pair by breaking the other. All three
were verified by restoring the old tiles and watching two fail.

### Security names on screen — the depository furniture is stripped

A demat statement prints the SERIES and FACE VALUE after the company name because
that identifies a line in the depository's own books:
`CLEAN MAX ENVIRO ENERGY SOLUTIONS LIMITED - EQ NEW FV RE.1/`, `SBI - EQ`,
`RBL BNK-EQ RE 10`. It says nothing about the holding — all of it is ordinary
equity — and it pushes the real name out of the column.

`stripDepositoryTail` in `shared/securityKey.mjs` removes it, and lives there for
two reasons: beside the key, which it now feeds (see Stage 10ak — it was
display-only until the ICICI split proved that the furniture is not identity),
and shared with the Node side so the screen and `docs/SECURITY-IDENTIFIERS.md`
clean a name with ONE implementation. **Anchored at the END, and only there** — three funds here are
named "…Equity Fund" (3P India, Baring Private Equity, Motilal Oswal Delphi) and
a rule matching "EQUITY" anywhere amputates all three. Measured over every name
in the book: **28 change, and those five fund names are untouched.**

**IT KEEPS WHAT NAMES A DIFFERENT INSTRUMENT** — Borosil's `WARRANTS 13AG26`,
EFPL's `PREF 18042043`. A warrant is not the equity, and folding it into the
company name merges two holdings on screen.

**AND IT ONLY EVER REMOVES.** Nothing supplies a name the statement did not
print, so a row still reads as its document does — which is why the clipped
`THE KARUR VYS-EQ` becomes `The Karur Vys` and not "Karur Vysya Bank". The
exchange's own name for that ISIN is now known for every ISIN-resolved security,
and substituting it is a SEPARATE decision the family has not been asked: it
would read better and would break the visual tie between a row and the PDF it
came from. **The key IS routed through this now** — see Stage 10ak for what that
merges (three keys, each corroborated by evidence outside the name) and what it
still leaves apart (a clipped name, which only an ISIN can bridge and which no
rule here may invent).

**`splitFundClass` SITS BESIDE IT ON THE SAME TERMS** — the fund's own name and
the unit class the statement appends to it (`3P India Equity Fund 1 - Class B3`),
so the Portfolio Monitor can draw ONE row per fund and open it into its classes.
Display only, anchored at the end, only ever removes, and `securityKeyOf` is not
routed through it: each class keeps its own key, its own `/stock/` page and its
own row everywhere else. **It is not a name matcher** — the fund base must match
character for character, which is what keeps two funds of one HOUSE apart. See
Stage 10ak.

### Income — split by EVENT TYPE, not by preferred document

The dividend statement is authoritative for **cash** dividends; the corporate
benefits report is authoritative for the **non-cash** actions (bonus, split,
rights, mergers) that a dividend statement structurally cannot carry. Where both
list the same cash event it is counted once, matched on `(date, security,
amount)`, with the dividend statement winning.

Both halves of that rule were load-bearing here. The one corporate benefits
report in this drop carries 10 events: 9 cash dividends byte-identical to rows on
the dividend statement, and 1 bonus (Life Insurance Corp, 1:1). Summing both
reports double-counted every one of those 9 — Can Fin Homes read ₹1,12,000
against the statement's own 7,000 × ₹8 = ₹56,000. Preferring the dividend
statement wholesale would have fixed the double-count and silently dropped the
bonus. `dividendReceived` on a position is cash only; non-cash actions live in
`BOOK_CORPORATE_ACTIONS` and are never summed into income.

## Stage 6 — the dated record at runtime (`src/lib/ledger.ts`)

The book baked into `glowData.ts` is a POSITION snapshot. The dated record —
every buy and sell, every capital-gain lot, every dividend — stays in
`public/audit/` and is fetched by the browser: it is 113 documents, it is already
gated by the edge password check, and inlining it would put megabytes of
transaction tape into the JS bundle for pages that may never be opened.

`ledger.ts` reads `manifest.json`, then each `<docKey>/document.json`, and
applies the **same precedence** the ingest does (`AUTHORITATIVE`) — transactions
from the transaction statement, lots from the capital gain statement, cash from
the dividend statement, non-cash from corporate benefits, holdings from the
appraisal. Reading every document that mentions a trade would count it several
times.

**It applies the supersede rule too, and for a long time it did not.**
`precedence` picks the winning report TYPE per account; it does not pick an
ISSUE, and four accounts publish the same report twice. So the runtime ledger
read both and disagreed with the book generated from the same archive:

- `newestOf` is for a fact that RESTATES. Both 360 ONE CRNs and both SVAN
  accounts issue a May report and a June one, and the held-quantity index summed
  them — 47 of 164 securities carried at twice their quantity, ₹1.46 Cr of AIF
  units counted as ₹2.90 Cr, and **Avalon Technologies, on SVAN's May holdings
  and gone from June, reported as still held**. A genuine exit shown as a trim.
- `datedRows` is for a fact that ACCUMULATES. Green Lantern 510861 issues a
  capital gain statement to 25 June (28 lots) and another to 30 June (31), and
  the first is a strict SUBSET of the second. Reading both put **118 lots and
  −₹43,69,132.88 on Capital Gains against the book's own 90 and −₹41,29,763.63**,
  and split the term wrongly by ₹4.44 L short and ₹6.84 L long — the figure that
  drives a tax estimate. The independent figure that says those 28 rows do not
  belong twice is the wider statement's own printed total, −₹49,893.94 for that
  account, which the deduped set reproduces exactly.

`datedRows` keys a row on its own fields **plus the account**, and on its
ORDINAL among identical rows of its own document, because a repeat within one
document is data and a repeat across two is a duplicate — the same rule, and the
same reasoning, as `datedRowsAcross` in `scripts/build-book.mjs`. Any new loader
here must pick one of the two helpers; `of()` alone is the bug.

Three things it deliberately does not do:

- **No per-security XIRR.** That needs every lot from first purchase; these
  transaction statements cover the CURRENT PERIOD only. A rate over a partial
  history is a real number for the wrong window. The money-weighted returns this
  book supports are per-ACCOUNT, over external capital movements, on
  `/performance`.
- **No realised gain where no capital gain statement covers the account.**
  Sixteen of 23 accounts issue none — the AIF folios, the 360 ONE engagements and
  the mutual-fund folio among them. Their sells are real; what they realised was
  never reported, so the cell is `—`, and Capital Gains names every account it
  does not cover.
- **No false diagnosis on failure.** When the archive doesn't respond the page
  says the archive didn't respond. It previously told the reader their session
  had expired and to sign in again — for a fetch aimed at a path this pipeline
  has never written. A wrong diagnosis is worse than a blank panel, because the
  reader acts on it.

**A day's sale is settled once.** The capital gain statement settles a day's sale
of a name against however many purchase lots it consumed; the transaction
statement prints that sale as one row — or, three times in this drop, as two.
Attributing the day's whole realised figure to each row counted Syngene's
−₹1.4 Cr twice and made the tape total −₹3.62 Cr against the statements' own
−₹1.93 Cr. Each `(account, security, date)` is therefore attributed once, to the
first row, and the others say where their figure went.

**One statement glues the ISIN onto the name.** Carnelian's capital gain
statement prints `CRIZAC LIMITED-INE0S4R01014`, so the lot keys
`crizac-limited-ine0s4r01014` while its own transaction statement keys `crizac` —
and the realised column showed `—` against every Carnelian sell while the gain
sat three folders away. `joinKey()` recognises a trailing ISIN by its exact shape
and re-normalises the remainder through the same `securityKeyOf`, lifting the
join from a minority of lots to 63 of 82. **This is a presentation-layer join,
not a repair:** the extractor should stop carrying an identifier inside a name
field, and until it does the archive keeps the key exactly as derived.
`splitSecurityName` in `shared/securityKey.mjs` now does that at ingest for every
record type, so a drop where this fires on the read side is a signal that a new
provider has the same habit.

### Two realised totals, and which one is canonical

The capital gain statements' own total is the **printed primitive and is
canonical** — now −₹41,29,763.63 across 90 lots, from 7 of 23 accounts. The lot
count grew because two things were being dropped: Green Lantern 510861 issues
capital gain statements over TWO windows (its house set's, and the one inside its
investor-report bundle) and `find` took whichever sorted first, and LKP's and
Molecule's statements had no reader at all. Dated rows are now unioned across
every issue of every report and deduped on their own identity — see
`datedRowsAcross` in `scripts/build-book.mjs`.

The worked example below is from the calibration that established the rule, on
the nine-account corpus, and the arithmetic it demonstrates is unchanged: The roll-up that attributes each lot
to the sale that produced it on the transaction tape is a **cross-check**, and it
is more negative:

```
statement (82 lots)     −49,65,684.69   ← canonical, what Capital Gains shows
attributed (63 lots)    −58,31,370.28   ← cross-check, on Ledger Insights
unattributed (19 lots)   +8,65,685.59
```

The 19 lots the tape never carries are **liquid mutual fund redemptions** — 18
Axis Liquid Fund across the two Green Lantern accounts, 1 DSP — the cash sweep
these managers run beside the equity mandate. The equity transaction statement
does not print them, so there is no sale row to hang them on. They are net GAINS,
which is the entire reason the attributed subtotal reads worse: removing gains
from a loss makes the remainder look bigger. **Unjoined never means dropped** —
all 82 lots count in the canonical figure. The three lines reconcile exactly, and
Ledger Insights shows them as three lines for that reason.

### XIRR: only accounts that can be measured, on one terminal date

Account 510854 publishes no FY performance summary, so its flows carry no opening
portfolio value. Pooling every account anyway put its ₹5.92 Cr of market value
into the terminal flow with no opening stake behind it, and — measured on the
five-account corpus this rule was written against — returned **174.3%** p.a.
against **109.7%** for the accounts that could be measured: a 64.6 pp
overstatement, and exactly the failure the presentation rule names.

Every account whose statements carry no opening portfolio value is excluded, and
that is most of them now: 510854 publishes no FY performance summary, the 360 ONE
client report carries no flow block at all, and the AIF folios report a
contribution history without a dated opening valuation. **The rate covers 6 of 23
accounts and ₹93.4 Cr of the book's ₹335.4 Cr** — 28% — and `/performance` names
every excluded account with the document it is missing. A rate over a quarter of
the book presented as the book's rate would be the same "missing value blended in
as zero" failure, one level up.

So a consolidated XIRR covers only accounts carrying an opening value, **on both
sides** (flows AND terminal market value), and every excluded account is named on
screen. **EACH ACCOUNT CLOSES ON ITS OWN AS-OF, and `pooledXirr` is what does it.** The
statements do not share a report date: Green Lantern values at 25 June, V.E.C at
6 July, the rest at 10 July. Pooling every flow and closing the lot on the newest
date credits the earlier accounts with fifteen days of standing still, and over a
quarter's window that is worth **5.44 pp** — 135.98% against 141.42% for the same
six accounts. Neither figure was wrong on its own terms, which is precisely why
two pages showed two numbers for one book. A money-weighted return means every
cash flow at the date it happened, and a terminal value is a cash flow.

Both pages also close against the book's own report dates rather than
`new Date()`: closing against today on one page and the report date on the other
gave the same measurement two values. The window is one quarter here, so every
rate annualises about three months; the pages say so, because an unlabelled
+141% reads as a sustained yearly rate.

## Stage 7 — the live layer

**`/api/indices` and `/api/prices` need no token** — both read Yahoo's keyless
chart endpoint. `indices` serves the four live NSE levels the strip carries and
VERIFIES each symbol against the instrument name its upstream reports; `prices`
serves one security's or index's whole daily close history. See Stage 10p and
Stage 9b for why each is a proxy rather than a harvest entry.

Eight Cloudflare Pages Functions proxy the in-house muns API, with `MUNS_TOKEN`
held in the Cloudflare environment and never in the browser: `quotes`, `ratios`,
`news`, `announcements`, `insider`, `research`, `history`. `fx` needs no token
(ECB reference rates, keyless) and falls back to a static rate.

**`quotes` PRICES FROM UPSTOX FIRST since Stage 10br** — `UPSTOX_ACCESS_TOKEN`
in the same environment, one call for the whole book — and asks muns only for
what Upstox did not price. `GET /api/quotes?check=1` says whether the token
works.

**The symbol bridge is keyed on `securityKey`, not ISIN.** Only ONE holdings
statement in this book prints an ISIN — LKP's depository statement, and it clips
every name to the column width (`CROMPTON GRE CONS-`), so the one account with
identifiers was the one that joined to nothing until the fuller name printed
against the same ISIN elsewhere in the drop was matched word by word. So
`nseSymbols.json` — which
`npm run build-symbols` resolves by NAME for exactly that reason — must be read
on the same key. `quotes.ts` previously exported `symbolForIsin(p.isin)` against
that map: two identifier spaces, one dictionary, no error anywhere, and a live
layer that resolved nothing for any position while looking wired up.

Coverage is 139 of 157 distinct securities. What does not resolve is `Cash`, the
liquid-fund sweeps, the AIF units and a handful of names with no NSE listing —
they can never go live. They are counted as `unpriceable`, separately from
`notLive`, because folding them together reports a permanent feed shortfall no
token would ever close.

### BASIS — the discipline that keeps the book checkable

`PortfolioContext` hands out three things: `portfolio` (live overlaid),
`statementPortfolio` (**never touched by the feed**) and `basis`.

- Live prices may move **market value, day change, unrealised P&L and return on
  cost**. They must NEVER touch quantity, cost basis, realised gains, dividends,
  fees or any dated cash flow — no price is evidence about any of them.
- Every consolidated total states its basis via `<BasisPill>`, which leads with
  `STATEMENT` or `LIVE` rather than burying it in a tooltip.
- **Pages that must tie to source pass `<BasisPill statement>` AND read
  `statementPortfolio`**: Capital Gains, Data Audit, Ledger Insights. A reader
  checks these by opening the PDF; a total that drifts with the market cannot be
  checked. Passing the pill without switching the data source is the trap — the
  label would then be a claim the page does not honour.
- **The as-of skew survives on both bases.** Green Lantern closes 2026-06-25, the
  others 2026-07-10. On LIVE basis prices share one moment, but every field the
  feed does not touch still blends dates, so the "N accounts behind" pill stays.

### Degrading without a token

With no `MUNS_TOKEN` and no network — how it runs locally, and how it will run
before the token is set — every page renders on statement marks, the pill reads
`STATEMENT · as of 2026-07-10`, and consolidated NAV is exactly
**₹3,35,43,23,674.24**. No blank tiles, no zeros, no unresolved spinners, and no
"session expired" wording for what is a missing upstream.

## Stage 8 — the client's Family Office Operating System spec

The client's spec describes six layers. Most of it needs data sources this
cockpit does not have, so **what shipped is the subset the muns API catalogue can
actually serve**, and the rest is named rather than stubbed. A route that renders
a frame around data nobody can supply is worse than no route: it reads as a
feature that is broken instead of one that was never possible.

### What shipped, and what backs it

| Spec item | Where | Backed by |
| --- | --- | --- |
| Returns table — daily / weekly / monthly / QTD / FYTD / 1Y / 3Y / 5Y / 10Y / max CAGR | company page | `market_data`, one dated close per horizon |
| Compare up to four companies | **REMOVED at the family's request — see Stage 10ap.** `/compare` redirects to Portfolio Monitor, whose security axis is one row per company; each opens `/stock/:securityKey`, where every figure the comparison drew still renders per company | the book, the quote feed, `ratio_source` |
| Document repository — annual reports, concalls, earnings, announcements | company page | `combined_filings_announcements`, `filings_domestic` |
| Financial tables, ratios, shareholding | company page | `financial_tables_markdown` (screener.in) |
| **Cash flow statement + earnings calendar** | company page | `financials/<T>.NS` — see Stage 10e |
| **Ratio analysis, 7 year-ends** | company page | `ratio_source` → `web-reader` — see Stage 10e |
| Consensus / street estimates | company page | `street_estimates` |
| Personal watchlist, target price, fair value, entry / exit price, price alerts | company page (the `/watchlist` page is REMOVED, see Stage 10w) | **nothing** — these are the family's own judgements |
| Insider trades, corporate announcements | company page | `insider_trades`, `corp_announcements` — the `/news` page is REMOVED, see Stage 10k |

### Two limits that are load-bearing, and are stated on screen

**There is no price chart, and there cannot be one from this API.** The spec asks
for interactive charts over adjustable periods. `market_data` returns a four-row
PREVIEW of any window — a header, the first two rows, a literal `...`, and the
last two — and writes the real series to a path on its own disk that no
documented endpoint serves. See the note at the top of `functions/api/history.js`.
A returns TABLE is a set of "what did this close at on date D" questions, which
that preview answers exactly; a chart is not, and the card says so rather than
drawing a line through ten closes.

**The ratio and estimate endpoints return PROSE and it stays prose.** Both are
`text/plain` with no documented schema. `src/lib/ratios.ts` and
`src/lib/research.ts` hand the upstream's own words through and compute nothing
from them. A parsed comparison grid would be the nicer screen and the wrong one:
nothing in the response says which number is which company's PE, and inventing
that mapping is how a figure nobody can trace enters a dashboard whose entire
claim is that every figure traces to a source.

### Investment tools are the ONE thing a reader writes to

**AND THE PAGE THAT ROLLED THEM UP IS GONE — see Stage 10w.** `/watchlist`
redirects and `src/pages/Watchlist.tsx` is deleted. Everything below is about the
STORE, which is untouched and is still written on every company page.

`src/lib/watchlist.ts` is the only store in the app that takes user input, and it
is deliberately nowhere near the book. `glowData.ts` is generated from `source/`
and regenerates byte-identically; a target price is a judgement, not a statement
figure, and writing one into the book would break that guarantee on the first
edit. It lives in `localStorage`, which is a real limitation and is stated on the
page rather than left to be discovered on a second device.

**A price nobody has set is `null`, never 0.** That matters more here than
anywhere else in the codebase: a target of zero renders as a real number and
makes every holding look 100% overvalued — a fabricated figure produced by a
default, which is the exact failure this book exists to prevent.

### What the spec asks for that NO current API can serve

Named here so the gap stays visible, and so nobody builds a frame around it:

- **Layer 1 — Knowledge & Memory.** *(A note store shipped and the page has
  since been REMOVED at the family's request — see Stage 10x.)* Tagged notes from manager meetings, IC
  discussions, fund pitches, conference notes, books and podcasts, queryable in
  natural language. Needs a note store, a tagging model and an AI index. The
  catalogue's `document_search` searches muns' own corpus, not the family's.
- ~~**The macro release calendar.**~~ **SOLVED — see Stage 9d.** The card here
  read "consensus and the surprise measured against it are licensed products
  sold by paid vendors", which was an absence recorded against an UNCHECKED
  premise. Bloomberg does 403 and TradingEconomics' free tier is discontinued
  (HTTP 410), but TradingView's calendar endpoint answers with previous,
  consensus, actual, an impact rank and the publishing agency, keylessly.
- ~~**All of macro research.**~~ **SOLVED for prices, from a different direction —
  see Stage 9.** It remains true that the muns catalogue has no macro or commodity
  endpoint at all. What changed is that the answer was never going to come from a
  request-time API: the spec wants 10-year CAGRs and interactive charts, and those
  are functions of a STORED SERIES. `npm run harvest` now commits one. Commodities,
  global indices, currencies and the US 10-year are live off it; the India macro
  aggregates (GDP, CPI, policy rates, credit growth, housing, household savings,
  vehicle sales, capital-market flows) still are not, and are declared absent with
  their intended source rather than drawn.
- **Industry research.** Industry size, capacity, utilisation, order books. No
  industry endpoint, and the page that composed the raw-material half of it from
  the harvest store has been REMOVED at the family's request — see Stage 9c. The
  price series themselves are unaffected and are still harvested; Macro Research
  has since been removed too (Stage 10x), so no page charts them today.
- **Layer 3 — IPS buckets and GAP analysis.** Growth / Liquidity / Tactical /
  Hedge / Charity, actual vs desired by geography, market cap, duration. The
  actuals are in the book; the DESIRED allocations are a family decision nobody
  has supplied, and inventing a target weight would fabricate the entire gap.
- **Layer 4 — thesis monitoring** and **Layer 5 — alerts** beyond price levels.
  Both need a store plus a rules engine; only the price-level half of Layer 5 was
  ever possible, and both pages that shipped it have since been REMOVED at the
  family's request — see Stage 10y. The STORE is untouched: every thesis and
  alert rule they entered is still held in `familyInputs.ts`. Nothing evaluates a
  rule today and — since Exposure & IPS went at Stage 10bc — **nothing exports
  one either**: that page carried the only Export/Import, so the rules are still
  stored, still correct and no longer reachable from any screen.
- **PDF and PowerPoint export.** Excel export exists (`exportPortfolioExcel.ts`).

## Conventions

These are not style preferences. Each one is here because violating it produced a
figure on screen that was wrong and looked right. **A future session must not
violate any of them.**

### The seven that govern figures

1. **Never fabricate.** If the source carries no number, render `—` with a reason
   through `src/components/Absent.tsx`. Not a zero, not an estimate, not an
   interpolation, not a plausible default.
2. **A measured zero and an absent measurement must never look the same.** Any
   tile, chart, cell or total whose underlying collection is EMPTY renders `—`.
   A *computed* zero is legitimate and stays — but its reason goes in the tile,
   not in a tooltip.
3. **Ingest PRIMITIVES; DERIVE everything else.** Quantity, unit cost, market
   price, accrued income are read. Market value, gain, %gain and %assets are
   computed. A statement's own arithmetic is not internally consistent, and
   ingesting both sides imports the contradiction.
4. **Printed values are a CHECK, never a source.** They live in `printed.*` and
   every delta goes to the reconciliation report classified `rounding`,
   `explained` or `material`. A material delta blocks the golden test.
5. **Never blend a missing value into a total as zero.** Use `sumOrNull`. A
   figure that exists for SOME accounts is shown for those and the rest are
   named — including in the total's own caption.
6. **STATEMENT vs LIVE basis.** Live prices may move market value, day change,
   unrealised P&L and return on cost — and nothing else. Never quantity, cost
   basis, realised gains, dividends, fees or a dated cash flow. Every
   consolidated figure carried a `<BasisPill>` until Stage 10ao, when the family
   asked for it off Morning CIO and off the `/holdings` drill-down, Stage
   10ap, when they asked for it off Private Market too, and Stage 10by, off
   Sector Composition. That last one reads the LIVE book and always has — it
   was never a page a reader checks against a PDF — so what it lost is the
   label and the as-of skew, not a guarantee.

   **THE HALF THAT IS A CORRECTNESS GUARANTEE IS UNCHANGED AND IS NOT
   NEGOTIABLE, and it is the SOURCE rather than the label** — Capital Gains,
   Data Audit, Ledger Insights **and Private Market** all still read
   `statementPortfolio`, because a reader checks those against the PDF and a
   total that drifted with the market could not be checked at all. The first
   three still SAY so; Private Market no longer does, which is weaker and is
   recorded rather than glossed. What makes it cost almost nothing THERE is
   measured, not assumed: no private holding resolves an NSE symbol, so no quote
   could touch those rows even on the live portfolio — and `check:pages` checks
   that premise every run, so a drop that brings a quotable private holding
   fires by name instead of quietly making the reasoning false.

   `check:pages` asserts the three removals AND that the remaining three keep
   their pill, which are separate claims: a build that deleted the component
   everywhere would satisfy every absence and take this with it.
7. **`src/data/glowData.ts` is GENERATED. Never hand-edit it.** It regenerates
   byte-identically from `source/`; an edit is reverted by the next
   `build-book`, and until then the book no longer matches its own archive.

### And five more that have each cost a debugging session

- Identity is `securityKey`, derived from the CLEAN name. If a join fails, fix
  the EXTRACTOR — never re-derive a key in the presentation layer, which hides
  the defect from the reconciler.
- **A consolidated figure counts each `dedupeGroup` ONCE; a per-account or
  per-owner figure does not.** `usePortfolio().consolidated` is the deduped set;
  `portfolio.positions` carries both rows. Getting this backwards fails in both
  directions and both were live in this repo: a raw sum put ₹1.46 Cr into the
  consolidated NAV twice and made an allocation weight read 101.4%, and deduping
  a PER-ACCOUNT breakdown emptied Bharat's 360 ONE row to `0 · ₹0 · ₹0` for an
  account holding ₹1.46 Cr. The helper existed in `analytics.ts` and was wired
  into nothing for as long as no drop contained a duplicate.
- **THE DATA AUDIT DEEP-LINKS ARE GONE — every one of them, at the family's
  request.** A figure used to hyperlink to its source document (`holdingHref`
  built `<accountId>-<asOf>-appraisal`, exactly as `extract.mjs` composes the
  docKey) and a consolidated one to the archive index with its search
  pre-filled. All 42 of those links were removed across 12 pages, along with the
  `to`/`title` props on `<Auditable>`, the "See the source numbers in Data Audit"
  link inside the formula popover, `FormulaDef.auditHref`, and the builders that
  made the URLs (`auditHref`, `AUDIT_INDEX`, `LEDGER`, `ledgerHref`,
  `holdingHref`, `appraisalDocKey`, `privateHref`). They were DELETED rather
  than left exported and uncalled: a builder nothing calls is the
  dead-code-that-looks-alive failure this file keeps naming, and the next
  session would wire it back believing it load-bearing.
  **The FORMULA popovers stay, EXCEPT on Morning CIO** — a dashed figure still
  opens the arithmetic behind it elsewhere in the app, which is an explanation
  rather than a hyperlink. Morning CIO has none left, at the family's request:
  the KPI tiles went in Stage 10y and the allocation table's rows and footer in
  Stage 10ac, and in both cases the arithmetic is rendered on the page the
  figure opens instead. Nothing on that page is underlined. **And the Data
  Audit PAGE is untouched and still in the nav**: only the links pointing INTO
  it were removed, its own document chips are `<button>`s, and the provenance it
  serves is unchanged. A future session that wants a figure traceable again
  should read this paragraph first rather than reinventing `holdingHref`.
- Nothing on screen may be hardcoded that isn't derived from the book. No
  security names, entity names, dates, amounts, document titles or sample rows.
  Icon maps, sector tables and statutory tax rates are the legitimate exceptions.
- **Every new `ink-*`/`slate-*` utility needs a light-mode remap in
  `index.css`** — including each opacity variant, which Tailwind emits as its own
  class. And `divide-*` remaps must mirror Tailwind's
  `> :not([hidden]) ~ :not([hidden])` selector or they lose on specificity and
  silently do nothing. `npm run check:pages` resolves computed colour and catches
  both.
- A failure message must diagnose the ACTUAL failure. "Your session expired" for
  an unreachable archive is worse than a blank panel, because the reader acts
  on it. **The CAUSE picks the headline, and `src/lib/upstreamStatus.ts` is the
  one place that decides which.** A gateway status is a fact about the SERVICE;
  only an empty 200 is a fact about the company. The company page said "No ratio
  table for this company" over an HTTP 522 — a status that means Cloudflare
  reached the hostname and the server behind it never completed a connection —
  so a reader learnt that Reliance publishes no ratios. Measured on the live
  deployment 2026-08-13, with the site's own cache-bypassing control failing
  alongside: `fastapi.muns.io` (quotes, street estimates, `/financials`,
  `ratio_source`, `web-reader`, `market_data`) and `devde.muns.io`
  (`financial_tables`, filings, DRHP) both 522; `birdnest.muns.io`
  (announcements) and `hostapi.muns.io` (news) answering normally. **A partial
  outage across four hosts is why every panel must name its own cause rather
  than the page asserting one for all of them.**
- **And a card that can NEVER be filled must not look like one that is waiting.**
  The company page's Business segments, Operating metrics, Value chain and
  Calendar cards are permanent, decided absences — no wired source publishes
  them for any company — and they render the same dashed `AbsentSection` as a
  panel whose feed is momentarily down. During the outage above that is eight
  empty boxes reading as eight failures. `CompanyResearchPreview` states, once,
  above that group, that those four are absent by decision and not by failure.
  *(Those four cards were removed at the family's request, and
  `CompanyResearchPreview` itself is DELETED since Stage 10cn, when the position
  page became tabs. The decided absence is recorded in `InsiderDeals.tsx`'s
  header, the file its last live table moved into.)*

### Formatting and layout

- All monetary values are INR at the model layer; format with `fmtFromBase`,
  never hard-code currency symbols. Compact suffixes follow the SELECTED
  currency (Cr/L for INR, M/B for USD), not the base. Statutory figures (the
  ₹1.25L LTCG exemption) and the FX rate itself are denominated in rupees by
  definition and correctly do not convert.
- Wide tables scroll inside their own `overflow-x-auto` container. The page body
  must never scroll horizontally at any width.
- **THE DATA AUDIT DEEP-LINKS ARE GONE — every one of them, at the family's
  request.** A figure used to hyperlink to its source document (`holdingHref`
  built `<accountId>-<asOf>-appraisal`, exactly as `extract.mjs` composes the
  docKey) and a consolidated one to the archive index with its search
  pre-filled. All 42 of those links were removed across 12 pages, along with the
  `to`/`title` props on `<Auditable>`, the "See the source numbers in Data Audit"
  link inside the formula popover, `FormulaDef.auditHref`, and the builders that
  made the URLs (`auditHref`, `AUDIT_INDEX`, `LEDGER`, `ledgerHref`,
  `holdingHref`, `appraisalDocKey`, `privateHref`). They were DELETED rather
  than left exported and uncalled: a builder nothing calls is the
  dead-code-that-looks-alive failure this file keeps naming, and the next
  session would wire it back believing it load-bearing.
  **The FORMULA popovers stay, EXCEPT on Morning CIO** — a dashed figure still
  opens the arithmetic behind it elsewhere in the app, which is an explanation
  rather than a hyperlink. Morning CIO has none left, at the family's request:
  the KPI tiles went in Stage 10y and the allocation table's rows and footer in
  Stage 10ac, and in both cases the arithmetic is rendered on the page the
  figure opens instead. Nothing on that page is underlined. **And the Data
  Audit PAGE is untouched and still in the nav**: only the links pointing INTO
  it were removed, its own document chips are `<button>`s, and the provenance it
  serves is unchanged. A future session that wants a figure traceable again
  should read this paragraph first rather than reinventing `holdingHref`.
- Large holdings lists get a `SearchInput` (filter by security name or ISIN).
- Pages that must RECONCILE to a source document read `statementPortfolio`, and
  the three that a reader checks against a PDF carrying quotable rows also SAY so
  with a `<BasisPill statement>` — Capital Gains, Data Audit, Ledger Insights.
  Morning CIO and `/holdings` lost theirs at Stage 10ao, Private Market at
  Stage 10ap and Sector Composition at Stage 10by, all at the family's request; those are the places this file's own
  §6 has been narrowed rather than upheld, and what each costs is recorded there
  rather than softened here. **The source never moved on any of them.**
- An absent figure goes through `src/components/Absent.tsx` with a reason. Never
  type a bare `—` inline, and never let an empty collection reach a formatter.
- **No explainer lines.** *"Why do i need all this garbage written please remove
  its obvious from the table what it is."* No page carries a card subtitle, a
  footnote, a line under a figure or a fold of working under a table. A sentence
  a reader ACTS ON is the hover on the figure it qualifies — `title`, `Card`'s
  `subtitle` (the title's hover now), `StatTile`'s `hint`, `PageHeader`'s
  `subtitle`, `AbsentSection`'s `needs`, `TreeNameCell`'s `hint`, `SortHeader`'s
  `coverage` — and is asserted there. What stays on the face is a figure, a
  count, a status word, a fence ("DERIVED", "in no total") or a guard ("not
  annualised"); a line a reader must SEE says why at the element with
  `data-prose-ok="<reason>"`. Checked on structure by the `prose` probe in
  `check:pages`, on every route, rather than on wording. See Stages 10co and
  10cp.

## Stage 10 — the family-input layer (`src/lib/familyInputs.ts`)

Layers 3, 4 and 5 of the spec were never blocked on a vendor. They were blocked
on the FAMILY: an IPS target weight, why a position is owned, what would make
them sell it, what should raise an alarm. No API has ever known any of that, so
those three screens sat as previews waiting for a feed that could not exist.

`familyInputs.ts` is the store that unblocks them, and it extends the rule
`watchlist.ts` set: **nothing here may ever reach `glowData.ts`**, which is
generated from `source/` and must regenerate byte-identically.

**AN UNSET FIGURE IS `null`, NEVER 0**, and here it matters more than anywhere.
A target weight of zero is a real instruction ("hold none of this"); a target
nobody entered is the absence of one. The GAP — actual minus target — is the only
number on that page anyone acts on, so a gap computed against a defaulted zero is
a fabricated instruction to sell. Both halves must exist or the cell is `—`.

**THE BUCKET MAPPING IS THE FAMILY'S TOO.** Growth / Liquidity / Tactical / Hedge
/ Charity are not properties of a security; nothing in the archive says the AIF
book is "Growth" rather than "Tactical". The family maps ASSET CLASS → bucket —
four or five decisions instead of one per holding — and an unmapped class
contributes to no bucket and is NAMED, so a partial mapping yields a partial
actual rather than a wrong one.

**EXPORT / IMPORT, because `localStorage` alone is not good enough here.** The
watchlist states its per-browser limitation and leaves it. An IPS and a set of
theses are the family's own record, and a cleared browser would lose them with no
way back — so the whole store round-trips through one JSON file. Everything
re-enters through `coerce`, so a hand-edited file cannot put a malformed number
into the GAP analysis. **One file carries the WHOLE store** — charter, IPS
targets, bucket mapping, theses, alert rules, the deal register and the household
balance sheet. A partial export looks like a backup and loses the rest.

### The stage history lives in `docs/STAGE-LOG.md`

Everything that used to sit here — every `### Stage 10b` … `### Stage 10ef`
entry, and the `## Stage 10e`, `## Stage 9`, `## Stage 9b`, `## Stage 9c` and
`## Stage 9d` sections — is the chronological engineering record, and it has been
**moved to `docs/STAGE-LOG.md` verbatim**. Nothing was deleted. This file is
re-injected into the model's context on every turn, and the narrative had grown
to ≈466k tokens — enough to overflow the window on its own, so a `/clear` or
`/compact` could not recover it. A `CLAUDE.md` that cannot load is a `CLAUDE.md`
nobody reads, so the history was RELOCATED rather than trimmed: the
`exportDeck.ts` treatment, applied to this file itself.

- A `see Stage 10xx` cross-reference anywhere in this file points at a `### Stage
  10xx` heading in `docs/STAGE-LOG.md`. Grep that file for the heading.
- A new stage entry is APPENDED to `docs/STAGE-LOG.md`, never to this file. Keep
  this file to the standing reference — how to ship, the standing rule, the
  preview convention, the Layout map, the data model (§1–§6, §4b, §4c), the
  ingest pipeline, Stages 5–8, the Conventions and the Build commands — and keep
  the stage log to the history of how each of those was arrived at.
- The two must not drift. A rule this file states is the live rule; the log
  records the making of it. The reasoning behind any rule here is in the log
  under the stage that set it.

## Build

- `npm run build` runs `tsc -b && vite build` — keep it green before landing changes.
- `npm run harvest` refreshes `public/series/` and `docs/SERIES-REPORT.md`.
  Idempotent; `--only <ids>` limits it. Runs nightly via `.github/workflows/harvest.yml`.
- `npm run inventory` regenerates the ingest inventory.
- `npm run replay:calls` re-runs the CAPITAL-CALL reader over the committed
  archive — the called/paid/pending split and the dated calls — from each
  document's own `pages.json`, through the same `capitalFrom` the extractor
  calls. A faithful partial replay of extraction, not a repair layer, and the
  third of its kind after `rekey:archive` and `build-lookthrough --reindex`; it
  is how a reader change lands WITHOUT `GLOW_PDF_PASSWORDS` (see Stage 10ay).
  It only ever ADDS fields — `total`, `contributed`, `undrawn` and `distributed`
  are written back byte-identically and a run that would move one refuses — and
  `--check` writes nothing and is the control run, which must be a no-op.
  Since Stage 10bw it replays the dated PAYOUTS too (Neo Infra, Baring,
  Transition Venture), through the same readers. Follow it with `build-book`.
- `npm run replay:movements` re-runs the DEMAT MOVEMENT reader over the committed
  archive — the dated credits and debits, and each holding's opening-to-closing
  split — from each document's own `pages.json`, through the same
  `readTransactions` the extractor calls. The FOURTH faithful partial replay
  after `rekey:archive`, `build-lookthrough --reindex` and `replay:calls`, on the
  same three rules (see Stage 10ba). The two printed balances already on disk
  must come back byte-identical, holding for holding and in the same order, and
  the tape may only GROW — a replay that would lose a movement refuses. `--check`
  writes nothing and is the control run, which must be a no-op. Follow it with
  `build-book`.
- `npm run replay:owners` re-runs the BENEFICIAL-OWNER join over the committed
  archive — the two HDFC Bank NSDL statements whose holder line prints the
  TRUSTEES rather than the trust — from each document's own `pages.json`, keyed
  on the DP account number the page prints and cited to the family's own
  investment register. Since Stage 10db it lands the Motilal client-ID join for
  demat 1201090032387399 the same way. The FIFTH faithful partial replay after `rekey:archive`,
  `build-lookthrough --reindex`, `replay:calls` and `replay:movements`, on the
  same three rules (see Stage 10bp): it touches the owner, its id and one
  warning and nothing else; its gate is struck on the ARCHIVE — the owner on
  disk must be either the holder the committed text prints or the one the join
  produces, and a third value means somebody else wrote it; and `--check` writes
  nothing and is the control run, which must be a no-op. Follow it with
  `build-book`.
- `npm run replay:flows` re-runs the FUND-STATEMENT reader over the committed
  archive and lands the dated record it now reads — Buoyant's Cash Deposits, its
  per-class allotments and redemptions, and the class switch; since Stage 10cy
  the dated purchase on the Helios and Active Momentum statements — from each
  document's own `pages.json`, through the same `extract()` the extractor calls.
  The SIXTH faithful partial replay, on the same three rules (see Stage 10bv): it
  only ever ADDS a dated record where none was archived and refuses a document
  that already carries one; its gate is struck on the ARCHIVE — the replayed
  holdings must reproduce the stored ones on security, quantity, printed cost and
  NAV; and `--check` writes nothing and is the control run, which must be a
  no-op. Follow it with `build-book`.
- `npm run replay:flow-lines` lands the printed lines behind ASK's profit and
  loss account and Marathon's income-and-expense statement (`flows.lines`). It
  writes those lines and nothing else, its gate is the committed `pages.json`
  and section files, and `--check` is a no-op. Since Stage 10df `replay:flows`
  also lands a Portfolio Snap Report's return row. Follow either with
  `build-book`.
- `npm run replay:dedupe` re-runs the DUPLICATE POLICY over the committed
  archive — check (c) and `applyDedupePolicy`, the two functions `reconcile()`
  calls — so a change to `shared/separateInvestments.mjs` lands without
  `GLOW_PDF_PASSWORDS`. The SEVENTH faithful partial replay, on the same three
  rules (see Stage 10cx): only `dedupeGroup` and `alsoReportedUnder` on a
  holding may change, asserted per document; its gate is struck on the
  ARCHIVE — a holding's tags on disk must be its group's tag, or no tag on
  every member of its group, which is what lets an answer be WITHDRAWN; and
  `--check` writes nothing and is the control run, which must be a no-op.
  Follow it with `build-book`, which refuses a book where a pair the family
  called separate still carries a tag.
- `npm run replay:demat-holdings` re-runs the Motilal holding reader over the
  committed archive and lands the last-movement fields; `--check` is a no-op.
  `npm run report:extraction` regenerates the extraction report from the
  archive. See Stage 10cz.
- `npm run rekey:archive` re-derives `securityKey` across the committed archive
  from each row's own stored NAME, through the same `securityKeyOf` the extractor
  uses — a faithful partial replay of extraction, not a repair layer. It is how a
  change to that function lands WITHOUT `GLOW_PDF_PASSWORDS` (see Stage 10ak);
  `--check` writes nothing and is the control run, which must be a no-op against
  an unchanged function. It refuses outright if any name carries more than one
  stored key, because then the key is not a function of the name and this pass
  cannot reproduce it. Follow it with `build-symbols` and `build-book`.
  **It walks EVERY object carrying a `securityKey`, at any depth** — the first
  version read top-level arrays only, and LKP's nested `positionsAsOf` opening
  rows kept the old key while their holding moved, which silently cost Crompton
  its ₹15,47,017.80 cost basis and its return on the next `build-book` (see
  Stage 10cc). The gate refuses a half-moved archive for exactly that reason.
- `npm run extract` re-extracts the audit archive and the reconciliation report.
  **It takes no options** — a stray argument is IGNORED, not rejected, so
  `extract.mjs --help` runs a full extraction. Without `GLOW_PDF_PASSWORDS` that
  drops the eight encrypted statements, which is why `guardAgainstShrinkingTheArchive`
  refuses to write a run that read fewer documents than are already on disk
  (override with `GLOW_ALLOW_ARCHIVE_SHRINK=1`, deliberately). `GLOW_SOURCE_DIR` /
  `GLOW_AUDIT_DIR` / `GLOW_DOCS_DIR` point a run at a scratch tree, which is how a
  new provider is developed without touching the committed archive.
  Reading the two outlined-text PDFs additionally needs `pdftoppm` and `tesseract`
  on PATH; without them the run reports `text-outlined-to-paths` and reads
  everything else exactly as before.
- `npm run coverage:source` accounts for EVERY leaf file in `source/` — read /
  read-via-a-byte-identical-twin / held-out-by-decision / not-a-document /
  excluded-by-policy / unread — and **exits non-zero if anything is unread**. It
  answers the question `docs/EXTRACTION-REPORT.md` presupposes: not *did the
  documents tie out*, but *is there a file whose data never reached anything*.
  Output: `docs/SOURCE-COVERAGE.md`.
- `npm run test:ingest` runs the ingest test suites — including
  `capitalCalls.test.mjs`, which breaks a synthetic drawdown statement one
  figure at a time to prove the dated-call gate is load-bearing: a reader that
  publishes a schedule it could not reconcile is the one thing on that card a
  reader cannot check by opening the PDF. `askArf.test.mjs`,
  `buoyantSnap.test.mjs` and `sheetWitness.test.mjs` do the same for the ASK
  Absolute Return Fund statement, Buoyant's Portfolio Snap Report and every
  spreadsheet export held to its PDF (Stage 10da).
- `npm run accounts-table` regenerates the data-model section's one-row-per-account
  table in this file, from `src/data/glowData.ts` alone — `-- --write` splices it
  in, no argument prints it. It is what makes that passage's own rule
  ("regenerated EVERY TIME rather than patched") enforceable rather than
  aspirational: the Stage 10dh merge left the table six accounts short with
  fourteen stale cells, because nothing regenerated it. Nothing in it is typed —
  the money is summed off each account's positions, the words for an empty
  account are ROUTED from `Account.noPositionsReason`, and both footnote markers
  come off `SEPARATE_INVESTMENTS` and `BOOK_POLYCAB`. It REFUSES rather than
  emitting a table nobody can check: a reason that routes to no words, or a
  column that does not tie to `BOOK_SUMMARY.totalValue`, exits non-zero, and so
  does a splice that cannot find the table's header row exactly once. Idempotent
  — a second `-- --write` changes nothing, which is the control run. Run it after
  `build-book`.
- `npm run reconcile:review` checks the book against the adviser's consolidated
  review; `npm run reconcile:register` checks it against the family's own
  investment register. **Neither ever writes to the book** — both are independent
  cross-checks, the role `golden.mjs` plays for the extractors. The register one
  is where the costless-position gap is quantified: which of the 60 depository
  rows the family's own record could supply a cost for, and which need a contract
  note from the custodian. The review one leads with **section G** — the client's
  own question about invested capital, answered by splitting the shortfall on the
  one line that decides what to ask for — and **D1**, the ask list grouped by the
  document that would close each line.
- `npm run test:family` runs the derived-figure suites — among them
  **`fifo.test.ts`** (Stage 10ca: the lot engine on constructed events whose
  LIFO answer differs, the aggregator, and the book against the managers' own
  since-inception bridges, the fund's cash deposits and the redemption the bank
  received) — and the family-input
  arithmetic (deal register, household totals, plan columns, market-cap bands),
  the financial-table parser, the cash-flow/calendar reader, the ratio-table
  reader, the account XIRR, the private-market roll-up, the Excel export, the
  **index strip's day move** (`indicesFunction.test.ts` — the level and the
  previous close must never be the same session; a live probe cannot check it,
  because outside a 3h45m window plus every weekend the function is correct),
  the **dated record merge** (`txnLedger.test.ts`, Stage 10bo — the family's own
  capital and their managers' dealing become one row set, and the two money
  blocks must never be added: summing them reports ₹291.9 Cr where the family
  paid in ₹221.5 Cr),
  the **daily-NAV movers** (`navMovers.test.ts`, Stage 10aw — every row must tie
  to its own columns, and the model must never value a holding at `units × NAV`,
  which is an order of magnitude out on the gold and silver ETFs), the **AIF
  category read** (`aifCategory.test.ts`, Stage 10aw — `III` is never read as
  `I`, `Class A2` names nothing, `Category I/II` resolves to neither, and the
  sections partition the AIF row to the rupee),
  the **share movements** (`shareMovements.test.ts`, Stage 10ba — the four
  printed figures must add across on every window, and the exclusion of a pledge
  is asserted as LOAD-BEARING: counting one must BREAK the identity that holds
  without it; since Stage 10cc also that a window whose ISIN names one company
  the book holds is keyed on that company, found by the ISIN and never by key),
  the **security names** (`securityNames.test.ts`, Stage 10cc — no NSE symbol
  under two keys, one label per key and always one a statement printed, nothing
  shouted in capitals or left in lower case, and an instrument's coupon, maturity
  and footnote marks kept off its issuer's name),
  the **ways one company is held** (`heldThrough.test.ts`, Stage 10ck — each
  company's statement rows partition across the routes, no derived rupee reaches
  the measured figure, the fund lines tie to the store's own totals one line per
  member per fund, and the average cost is over the units that report a cost —
  load-bearing on ICICI Bank, where cost ÷ every unit read ₹438.34),
  the **family's own dated investments** (`tranches.test.ts`, Stage 10ag: the
  tranches must tie to the position's own quantity, cost basis and market value
  on three separate paths; the derived entry NAV is checked against the one the
  archive's own `pages.json` PRINTS, because nothing else in this repo can
  confirm it) and the **dated NAV series** (`navSeries.test.ts`, Stage 10p: the series' last point
  against the covered accounts' own roll-up, and the flow adjustment asserted as
  LOAD-BEARING rather than merely present). Every one of the API-backed three
  runs against a REAL saved API response
  rather than an invented fixture, and the cash-flow suite needs TWO responses
  for one company because its unit check is a reconciliation between them: a
  hand-written pair would prove only that two inventions agree with each other.
  Bundled through esbuild; no test framework.
- `npm run check:family` seeds a family register into a real browser and reads
  the rendered figures back, so a correct helper wired into nothing fails. Needs
  a `vite preview` on :4173, same as `check:pages`.
- `npm run build-symbols` re-resolves securityKey → NSE symbol, from NSE's own
  three masters. Since Stage 10dl it reads a fund's own PORTFOLIO DISCLOSURE as a
  FILL-ONLY second pass — a key pass 1 did not produce, never one it did — gated
  on the document carrying a family holding, which is the difference between 31
  keys and the 183 every scheme filing in the archive mentions. A disclosed-only
  row is MARKED in `docs/SECURITY-IDENTIFIERS.md` (`From`), its unresolved reason
  says there is no issuer to ask for an ISIN, and its count prints even at zero.
- `npm run build-sectors` refreshes `src/data/screenerSectors.json` and
  `docs/SCREENER-SECTORS.md` — the THIRD and weakest sector tier, fetched from
  screener.in per NSE symbol. It is a LOOKUP and never a judgement: each page
  must echo back the symbol it was asked for (or, where it prints none, agree
  with the book's own name through `securityKeyOf`), and the GICS answer is
  whatever `shared/sectors.mjs` returns for the label the page printed — never a
  value the script decides. Run `build-symbols` first, since it is keyed on that
  output. `ONLY=<symbols>` limits it; `SCREENER_DELAY_MS` paces the fetch.
  A company with no NSE symbol is NAMED in the report and never name-matched.
- `npm run build-fund-navs` refreshes `src/data/fundNavs.ts` and
  `docs/FUND-NAVS.md` — every mutual-fund scheme's NAV from **AMFI's own daily
  published file**, keyless, joined to this book ON THE ISIN and never on a
  name. It is what makes a fund carry a CURRENT value at all: a scheme resolves
  no NSE trading symbol, so the quote feed has never priced one. Run daily by
  `.github/workflows/fund-navs.yml` at 03:30 UTC (09:00 IST, after AMFI
  publishes the previous business day), committing only when a NAV moved.
  Idempotent; `-- --check` writes nothing. A scheme whose units are not on the
  same basis as its NAV carries the NAV and does NOT value the holding — see
  Stage 10bn. Nothing it writes reaches `glowData.ts`. It records each
  scheme's SEBI CATEGORY verbatim — which is how an arbitrage fund is known —
  and also prices a fund a depository reports on a transaction-only account,
  never an ETF there (no mark to test its basis against). See Stage 10ce.
- `npm run build-upstox-instruments` refreshes `shared/upstoxInstruments.mjs`
  and `docs/UPSTOX-INSTRUMENTS.md` — which Upstox instrument each NSE symbol the
  dashboard asks about IS, from Upstox's own public instrument list (keyless),
  matched on the exact trading symbol or the book's own ISIN and never on a name.
  Run it after `build-symbols` when a drop brings a new listed holding.
  Idempotent; `--check` writes nothing. A map, not a figure: nothing it writes
  reaches `glowData.ts`. See Stage 10br.
- `npm run build-scheme-names` emits `src/data/schemeNames.json` and
  `docs/SCHEME-NAMES.md` from the COMMITTED `public/lookthrough/` files — the
  full scheme name and plan behind every clipped depository label, joined by
  ISIN. It needs no AmfiBeas checkout, is idempotent, and `--check` writes
  nothing. Re-run it after `build-lookthrough` or after a drop brings a new
  scheme. Nothing it writes reaches `glowData.ts`.
- `npm run build-review-private` regenerates `src/data/reviewPrivate.ts` and
  `docs/REVIEW-PRIVATE-MARKET.md` from the family's consolidated review workbook
  (Stage 10dg). It reads `glowData.ts` for the statements column only and never
  writes to the book; it refuses to write if Private Investments is not 87 lines
  adding to its own Total, if a join pattern names other than one review line,
  or if a join key is on no statement row. Idempotent; `-- --check` writes
  nothing. Re-run it after `build-book` moves a joined holding.
- `npm run build-polycab` refreshes `src/data/polycabLive.ts` and
  `docs/POLYCAB-LIVE.md` — what the EXCHANGE and the statutory disclosures say
  about the ring-fenced promoter holding: the whole corporate-action record since
  listing, the promoter group's disclosed holding and pledge, and the last
  settled close. Every source is KEYLESS, so it needs no secret; it is run daily
  by `.github/workflows/polycab.yml` at 12:00 UTC (after the Indian close, so the
  stored price is a SETTLED session). Idempotent — nothing moved upstream means
  nothing written — and `-- --check` writes nothing. **Everything it publishes is
  gated on the exchange echoing back the ISIN `BOOK_POLYCAB` carries**, and a
  source that fails keeps its last good figure rather than emptying one. Nothing
  it writes reaches `glowData.ts` or any book total. See Stage 10bk.
- `npm run build-lookthrough` refreshes `public/lookthrough/` and
  `docs/FUND-LOOKTHROUGH.md` — each scheme's NAV, daily NAV change, returns and
  **every disclosed holding, not the equity section alone**: shares, bonds, NCDs,
  commercial paper and each line's own class and rating (see Stage 10aq) — from a
  READ-ONLY checkout of `techmuns/amfibeas`
  (`AMFIBEAS_DIR`, `DRY=1` to resolve and report without writing). Idempotent.
  Re-run it when that repo advances: NAV is daily and the disclosure monthly, and
  the card prints both as-of dates so staleness is visible rather than silent.
  **`-- --reindex` rebuilds `index.json` alone, off the COMMITTED scheme files,
  and needs no AmfiBeas checkout** — every field the index projects is read
  verbatim off a record already written to `<schemecode>.json`, so it is a
  faithful partial replay of the build rather than a repair layer, on the same
  terms as `rekey:archive`. It is how a change to that projection lands on a
  machine without the clone; `-- --reindex --check` writes nothing and is the
  control run, which must be a no-op against an unchanged projection. It refuses
  outright if any entry's stored `navDate` disagrees with its scheme file, because
  then the entry is joined to the wrong record and the replay cannot reproduce it.
- `npm run build-book` regenerates `src/data/glowData.ts` and `docs/BOOK-REPORT.md`.
- ~~`npm run build-register`~~ — REMOVED at Stage 10bb with the `/register` page
  it was the only producer for. The workbook itself is untouched and
  `npm run reconcile:register` still reads it.
- `npm run check:pages` renders every route headlessly (needs `npm run build` and
  a `vite preview` on :4173) and reports console errors, failed requests and
  on-screen `₹0` / `0.00%`. Screenshots land in `docs/page-check/`.
  `ONLY=cio,holdings-book` walks a subset — for verifying an invariant by
  reintroducing its bug, which is one edit, one rebuild and one sweep per check.
  The routes that resolve addresses for others (`cio-allocation`, `monitor`) are
  always kept, so a subset can never silently stop checking. That first one was
  `cio` until Morning CIO was split into panels: the Concentration card and the
  allocation rows that resolve every holdings drill-down's address sit behind
  `?tab=allocation` now, and `PUBLISHERS` follows the cards. See Stage 10bj.
  **`cio-live` is the same page with the live layer FULFILLED** from fixtures
  built out of the book (`installLiveMocks`): every symbol at its own statement
  mark × 1.10 and every index at ×0.99, so the day's move is exactly +10.00%,
  each index exactly −1.00% and the gap exactly 11.00 points. The plain `cio`
  walk deliberately gets no mocks, because its absent states are invariants too.
- `npm run dev:mock-quotes` serves `dist/` with `/api/quotes`, `/api/indices`,
  `/api/prices`, `/api/fx` and the three holdings feeds mocked, for exercising
  the live layer without a token. `INDEX_FACTOR` moves the indices independently
  of `FACTOR`, so the book-against-index gap is never zero by construction.
- `npm run set-password -- "<password>"` sets the edge gate password.
