# Stage history — continuation

### Stage 10fs — COMPLETE COST RECOVERY FOR LIVE FUND HOLDINGS

- The second audit found that Stage 10fn covered quote-only shares but omitted the analogous fund overlays. Exact owner, scheme/plan, dated units and FIFO now recover 21 more valued fund/account costs and three recorded DSP ETF costs. Twenty valued rows support HPR; ICICI Equity Savings recovers cost only because its sale proceeds have an inconsistent cash sign. Individual and pooled return paths withhold that unverified HPR. No layout, controls or styles change. Automated review also caught an aggregate path excluding the unknown-proceeds holding: Return Analysis now keeps it in the FIFO pool and withholds the pooled return. Existing absence helpers name the actual proceeds gap.
- A Closing ends a review folio block. Ajay's 34,045.997 Kotak Large & Mid Cap units must not be pooled with the separate, already-costed 27,900.484-unit AMC folio. Unmatched plans, later movements and even the 0.066-unit Motilal Arbitrage discrepancy refuse recovery.
- The exact client request now includes residual fund balances, Hope's printed-cost/available-unit disagreement and the ESDS register's 42-share bridge and ₹774 rate/payment difference. The four-page HDFC scan was visually read: it has quantities, not acquisition costs. Existing source files are not requested again as though absent.
- Tests cover separate/ambiguous folios, original FIFO lots, wrong-sign proceeds, exact-unit refusals and recovered costs reaching both fund overlays. Full source regeneration and financial CI verify reproducibility; source-row evidence stays beside every recovery.

### Stage 10ft — NAME UNVERIFIED SALE PROCEEDS ON THE HOME GAIN CARD

- Production verification of Stage 10fs found that the home Gain / loss card correctly withheld the unknown aggregate but called it missing cost. It now names unverified sale proceeds and carries the source-row reason into the existing calculation and hover. A separately measured private gain cannot replace an explicitly unverified book gain. No layout or controls change.

### Stage 10fu — RECOVER WHEN AN OPEN TAB REQUESTS AN OLD PAGE FILE

- An older company-page asset was gone from the current deployment; Pages returned the app HTML with HTTP 200 at its JavaScript URL. The preload handler and error boundary now share one guarded reload per minute, preserving the address and saved preferences. Offline and storage-restricted tabs offer manual recovery; persistent failures stop at a clear retry screen. Actual runtime errors retain their existing boundary.
- Authenticated HTML revalidates privately, missing `/assets/` files return 404 instead of SPA HTML, and signed-out asset requests return 401 so a recovery reload opens sign-in at the original page.
- Unit and middleware contracts cover classification, reload limits, blocked storage, cache policy and asset/auth responses. The built-app browser regression injects transient 404, persistent HTML/401, runtime exceptions and offline failures, and checks successful retry and address retention. CI runs these alongside the financial and table suites.

### Stage 10fv — RETURN ATTRIBUTION AND BENCHMARKS IN SUBTABS

- Morning CIO's Returns panel keeps the period controls and portfolio summary above two subtabs: Return attribution (default) and Benchmarks. Only the selected block is visible; switching preserves the attribution's grouping and expanded rows. `rview=benchmarks` supports direct links and browser history without changing the existing return parameters.
- The controls link to labelled panels, support arrow keys and Home/End, and keep one tab in the keyboard tab order. Existing page checks now verify the selected panel and summary placement, with a separate benchmark route and the existing financial checks retained.

### Stage 10fw — EVERY RETURN READS THE DATES BEHIND IT

*"We need to also make sure that we are accounting for all the dates to calculate the returns everywhere on the dashboard, so that the returns are logically correct."*

- **The audit:** account-level returns (Performance, Morning CIO, Family & Entities, Private Market, a fund's or mandate's own row) already solve over dated capital. Holdings did not. A lot-dated holding's CAGR compounded its whole return from the **oldest lot**: Crompton Greaves (₹9.88 L in Mar 2025, ₹5.59 L in Nov 2025) read −26.14% a year as if all of it were a year old. And per-holding XIRR was refused everywhere, though Stage 10fm's trades date every unit of 107 holdings.
- **`src/lib/holdingFlows.ts`** gives a holding its own dated money: each buy is money in on its day, each sale and dividend money out on its day, and the statement's value closes it on the statement's date. It applies only where the account's trades account for every unit held, or a lot register does and nothing was sold. The build now emits `BOOK_HOLDING_INCOME` (each dividend dated, tying to `dividendReceived`) and `BOOK_HOLDING_LOTS`.
- **`datedCapital.behind`** pools those flows for a row that is holdings rather than whole accounts (`RowCapital.holdings`). Every line must be dated in full, or the row keeps the per-holding answer. `measuredReturn` then applies the family's rule exactly as for an account: under a year HPR, several payments XIRR, one payment compounded from its own day. So a staggered holding's CAGR is refused and names XIRR (Crompton: XIRR −33.41%).
- **YTD:** `holdingPeriodOf` proves from the trades that a holding held nothing on 1 January. That gives 11 holdings opened this year a year-to-date return (their return since opening). One already held then names the date its units were first bought.
- **Every surface reads it:** Monitor rows, account lines and mandate shares, the company page's XIRR line, the Excel export and the consolidated audit sheet (whose purchase-date columns now use `investedOnOf`). The XIRR column's hover and the measure hints say holdings can carry a rate. `data-capital="holding"` marks these rows. An unverified HPR refuses every measure on such a row.
- **Checks:** `holdingFlows.test.ts` (test:family) ties the dividends to the holding's total, the lot cost to the statement cost, and the rule on all 111 dated holdings. The Excel and dated-capital suites move to the new rule and re-solve the 43 holding-level XIRR rows independently. `check:pages` gains `HOLDING_FLOWS_BOOK`, re-expressed off the book; the XIRR, CAGR and stock-page invariants read it; and new routes `monitor-xirr-security` / `monitor-cagr-security` put the PMS shares under the same claims.

### Stage 10fx — REMOVE THE PORTFOLIO RETURN SUMMARY CARD

- Removed the Portfolio return card, its window/coverage chips, calculation popup and five amount tiles from Morning CIO's Returns view. The toolbar now leads directly into Return attribution and Benchmarks. The benchmark portfolio comparison retains the same calculations and whole-account coverage gate.
- Removed unused card-only presentation code. Existing browser checks now assert that the summary stays absent, the subtabs follow the toolbar, and benchmark window/return checks still use the comparison tile. The period/type selection matrix follows the remaining controls instead of the removed popup.

### Stage 10fy — PRIVATE MARKET PROFILE FIELDS STAY OPEN FOR EDITING

- The family clarified that “live by default” means open text fields, rather than automatic public-source enrichment. Strategy and Description now start visible and editable within each investment row. Save/Cancel appears for a draft; failed saves retain it. Saved overrides can still be removed to reveal supplied text.
- Brand edits retain the existing exact investment keys and shared save endpoint. Aggregate rows keep their existing read-only resolution. Explicit column visibility choices, calculations, scrolling and sticky headers remain supported.
- Inline saves are serialized because each response carries its starting store snapshot plus the edit; overlapping replies must not hide another successful field. Focus reads wait for pending saves and cannot replace a newer edit.
- Existing profile/store suites verify identity and persistence contracts. The browser regression checks the default inputs, overlapping field saves and reopening the page, cancellation, a failed save and retry, removal, and a brand edit spanning several investments.

### Stage 10fz — A FULL CALCULATION AUDIT AGAINST INDUSTRY STANDARDS

*"logical calculations need to be correct as per the industry standards."*

- **Scope:** six areas were audited against GIPS/CFA, ILPA and the Income-tax
  Act, each finding reproduced on the book. Every finding and its fix is in
  `docs/CALCULATION-AUDIT.md`. The rules now bind every session in `CLAUDE.md`
  § Calculation standards.
- **Headlines:**
  - CAGR only for one purchase (`Position.purchaseDates`).
  - Exits and closed mandates stay in since-inception returns: book FIFO
    22.03% → 21.20%.
  - The Returns tab reads the verified records, so FYTD now agrees with the tile.
  - Period "Absolute" return is Modified Dietz; the benchmark comparison is PME.
- **Private:**
  - Distributions are the same cash the XIRR counts: ₹64.17 L → ₹94.53 L.
  - Private funds' returns include their income: Neo 13.83% → 21.21%, 360 ONE
    46.96% → 65.59%.
  - TVPI/DPI/RVPI are struck.
- **Tax:**
  - Long-term from the anniversary + 1 day in calendar months
    (`shared/holdingPeriod.mjs`).
  - The planner works per lot.
  - Dividends are gross of TDS.
  - The ₹1.25 L exemption is applied per person.
  - The headline is FY-scoped, superseding Stage 10da's windows headline.
- **Exposure:**
  - Entity-scoped look-through.
  - Active weights over the classified equity sleeve.
  - Concentration by fund (`concentrationNames`).
  - The day move never blends a missing line in as ₹0.
  - No constant FX rate.
- **Tests:** new suites `calcAudit` (ingest), plus display FX rate, day move,
  concentration and lot terms (family). The `check-pages` re-derivations follow
  each rule.

### Stage 10ga — ONE UPLOAD FOR THE STATEMENT LIBRARY, WIRED END TO END; UPLOAD HISTORY REMOVED

- *"give a universal file/folder upload option on the main statement library page … automatically be saved in github … wired into the dashboard end to end … arranged in its correct respective folder"* — the per-folder R2 drop box (never switched on) is gone. One panel on the library's main page takes files, a folder, or a drop of either; each file is a git blob on the `statement-inbox` branch, the upload one `[skip ci]` commit (`shared/statementInbox.mjs`, `functions/api/statement-uploads.js`, same `GLOW_GITHUB_TOKEN` as the dashboard store), and it dispatches `statement-intake.yml`.
- `scripts/ingest/intake-uploads.mjs` drops byte-identical files (ZIP members too), files each new one under `source/uploads-<IST date>/<provider>/` by the classifier's issuer, runs inventory → extract → build-symbols (additions only) → build-book, coverage:source and check:reads (now `GLOW_CHECK_READS_JSON`), holds back exactly the file each finding names and reads again, then accounts-table, build, test:ingest and test:family (a gate failing on main too is not the upload's). Only what passes lands on main, in one commit; the outcome goes back to the inbox log. Held files show the gate's reason with Retry/Remove; a landed file reads Publishing until the redeployed manifest carries its documents.
- Upload History is removed from the nav, search and routes; `/history` forwards to `/statements`, asserted in check:pages, which also strikes the one upload control (folder button) on the grid and none inside a folder. The library is open on an empty book. `pull-uploads.mjs` is retired.

### Stage 10gb — SHOW WHICH SECTOR HOLDINGS HAVE NO PURCHASE COST

- The sector return percentage and its N-of-M count open one readable card. It names every excluded stock, owner, provider, statement date and account, says whether the purchase cost is missing or unverified, and names the record needed. Holdings inside funds are explained separately from the account-holding count. The formula and included-holding list stay under an optional expansion.
- The same card works on both sector views, the Morning CIO panel and Compare. It remains usable with live prices and on narrow screens; opening it does not also expand the sector row. The existing FIFO calculation and cost gate are unchanged.
- Coverage tests distinguish the same stock in two accounts, absent versus unverified cost, recorded zero, unknown sources, and the actual unresolved Polycab statement. A built-app CI browser regression checks source identity, complete exclusion lists, light/dark mobile/desktop layouts, collapsed math, scrolling and keyboard dismissal/focus.

### Stage 10gc — EVERY FILE IN THE STATEMENT LIBRARY OPENS IN A PREVIEW WINDOW

*"we should be able to open and see contents of every file in the dashboard itself, irrespective of the type of file it is … a small preview window"* — the family, 21 Oct 2026.

- A row in an open folder opens `StatementPreview` (`src/components/StatementPreview.tsx`) over the page: a PDF's pages one after another, a spreadsheet's (XLS/XLSX/CSV) sheets as a lettered grid with a tab per sheet. The open file is `?file=<docKey>`, so a preview is linkable and Back or Esc closes it.
- It reads `public/audit/<docKey>/pages.json`, the text the pipeline read and the archive already serves behind the gate, labelled "Text as read". No original file is published: copying `source/` into the build was considered and not done, pending the family's decision. `src/lib/statementPreview.ts` turns a sheet's tab-separated rows into cells and shows a stored double at 15 significant digits (`12.085000000000001` → `12.085`, stored text on hover). Whole numbers are never touched, because a 16-digit demat number would round into an account that does not exist.
- A document with no text (the HDFC scan, the LKP mail-server removal notice) shows its own `document.json` warning through `AbsentSection`, never an empty window. Opened deliberately, a preview may name the ring-fenced holding (the family's email domain is on many statements), as Data Audit's raw page text does; no route opens one by default.
- `test:family` suite `statement preview`: all 424 documents have `pages.json`, each with text or a stated reason, every spreadsheet lays out across columns, and the number clean-up leaves account numbers alone.

### Stage 10gd — EXPORT EXCEL FROM EVERY TABLE

- Every dashboard table, drilldown and document table uses the shared
  `ExportableTable` control; existing full Portfolio Monitor and consolidated
  workbook downloads remain available.
- Exports include all matching scroll rows in the current sort and column
  arrangement. The scroll batch, position, filters and open rows are preserved.
- Saved Private Market Strategy/Description text is included without saving or
  discarding drafts. Excel retains missing values, numeric currencies/percentages,
  source precision where available, totals, links and multi-row headings.
- Workbook round-trip and browser download checks cover full scroll collections,
  saved profiles, source sheets and recovery after a failed download.

### Stage 10ge — THE NAV CHART IS THE WHOLE BOOK, STRUCK FROM THE DATED RECORD

*"now that we have a lot more holdings invested and purchase dates … fill this NAV completely and accurately … according to the principal investment, additional capital brought in, buys and sale transactions, dividends"* — the family, 21 Oct 2026.

- **Cause:** the chart chained `BOOK_NAV_HISTORY`, which covers only the 21 accounts a statement values twice (₹247 Cr of ₹837 Cr). Its July jump was three months of PMS marks landing on 6–10 Jul in a small panel.
- **`src/lib/bookNav.ts`** strikes one series over every investment: each account, and each review holder line. Each is held at its latest valuation plus the capital dated after it. Valuations are statement marks, verified openings and closings, the book's own holdings and the review's marks. Capital is the selected return record, or else the dated record with calls, payouts and the review's purchases, sales and income (`capitalMovesWithCalls`). A record's units running out is a measured nil. Points fall on every valuation date and every date capital moved. A deposit therefore buys in at the value last carried, as a unitised fund issues units.
- **Two panels.** The return chains over the investments valued at both ends of each link. One joins at its first valuation in the window, or on its payment day when bought from nil inside it. A holding bought before 31 Mar and first valued later (Sanshi ×5, Buoyant ×2, Founders, NSE …) joins on that valuation. Lines the review holds at cost (76, ₹140.7 Cr) are in the NAV and never in the return. The NAV level carries everything, at cost until first valued.
- **On the card:** the return is solid from 31 Jul 2026, when every valued investment is in it. Before that it is a lighter line, and no return is stated over it (Stage 10fc). The book reads −0.43% over 31 Jul → 7 Oct net of ₹49 Cr of capital (+5.81% with it). Only material capital is circled. The fold lists what joined later, what is held at cost, what has not been revalued since 31 Mar and what carries no value. The NAV ties to the statement book plus ₹61.4 L of valuations newer than the book's holdings statements. Return & Drawdown strikes its drawdown on the same series' whole-book segment. The statement series stays for its own uses, its per-step proofs now emitted (`BOOK_NAV_COVERAGE.covered[].steps`).
- **Checks:** `test:family` suite `whole-book NAV series` (constructed books for each rule, and the real book's coverage, tie-out, capital dates and chain). `check:pages` builds the series with esbuild and re-derives the chain, the coverage partition and the NAV tie-out off `glowData.ts`. On the NAV routes its findings equal main's.

### Stage 10gf — EXCEL INCLUDES HIDDEN COLUMNS AND COLLAPSED SECTIONS

- Table exports include every available column in its saved arrangement,
  including fields hidden through Edit Columns. Headers, values and totals
  share the complete order without changing screen preferences.
- All matching scroll rows remain included. Closed Portfolio Monitor and
  Private Market sections also contribute their investment rows.
- Browser checks hide columns, reopen the workbook, compare its complete
  schema and verify that visibility and scroll state stay intact; a collapsed
  Private Market section is exported without opening it on screen.

### Stage 10gg — REAL ESTATE TABLE AND PROPERTY MAP

- Real Estate sits directly below Private Market. The existing header, four configurable tiles, sortable/reorderable columns and column picker frame one register with Table and Map tabs. Both views share city/district, state, country, property type, status and search filters, and open the same property details and editor.
- One record per property supports joint owners and their shares, Indian area units and area basis, acquisition cost, dated valuation, rental income and costs, loans, lease and title details. Displayed money follows recorded shares and the dashboard's member/currency selections. Unknown inputs remain absent; partial totals show coverage. These manually recorded assets do not enter the statement portfolio's totals.
- `functions/api/real-estate.js` uses the existing authenticated GitHub dashboard store, one key per property, with bounded requests and same-origin writes. Saves are acknowledged after the store commits; a failed save retains the editor. Only confirmed coordinates are plotted. Co-located properties share a selectable pin; unpinned properties remain listed. Leaflet and attributed OpenStreetMap tiles need no paid API or new credentials.
- `test:real-estate` covers ownership arithmetic, missing values, validation, CRUD and endpoint failure contracts. The localhost-only browser check uses the real handler and an in-memory store for creation, editing, persistence, filters, map/details parity, coincident pins, deletion, themes and mobile layout; CI runs it with the existing browser checks.


### Stage 10gh — EXCEL EXPORTS IGNORE DISPLAY FILTERS

- Excel snapshots read the complete family dataset and bypass table search,
  category, entity, side and date filters. Private Market includes funds and
  companies regardless of its selector; consolidated/source searches also do
  not constrain downloads. The Monitor's whole-book export follows the same rule.
- Filters and saved preferences are never written by export. The synchronous
  snapshot restores loaded row batches and scroll positions; scope-dependent
  look-through and lot records are prepared before the snapshot.
- Regression checks compare complete workbooks under no-match search, member,
  sector, property location/type and Private Market type filters, and retain hidden-column, profile
  draft, scroll, retry and source-precision coverage.
