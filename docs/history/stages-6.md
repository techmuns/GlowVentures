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

### Stage 10gh — RETURN ATTRIBUTION FOLLOWS THE PERIOD AND SHOWS COVERED TOTALS

- The period and return-type toolbar now drives the attribution table. Dated windows use the shared verified account inputs (including proven nil origins), opening market values and dated capital; Absolute uses Modified Dietz, XIRR uses dated flows, and CAGR keeps its history requirements. Since-investment Absolute includes all usable purchase-cost records and exits while excluding incomplete sales and missing valuations individually.
- Total gain and return show the measurable subset, labelled “available data”, with the covered holding count and value. Separate i buttons beside gain and return explain the amount covered, actual statement dates, accounts used and the records still needed in plain English. Missing data is never zero. This is the family's explicit exception to the older whole-portfolio refusal on this table.
- Whole-account returns that cannot be assigned to a stock/sector without inventing historical holding values stay in a named “Account returns without a holding split” row. Values, gains and Absolute contributions tie out across axes; XIRR/CAGR percentages are never added. Statement values keep live prices out of historical calculations. Account children identify the return's source.
- Arithmetic regressions cover every period and axis on the real archive, distinct return measures, valid partial totals, missing costs/sales/valuations, whole mandates, exited holdings and unsplit accounts. Browser regression changes the actual toolbar and checks totals, info cards and narrow layouts.

### Stage 10gi — VERIFIED STATEMENT PUBLICATION AND EXACT SOURCE ROWS

- Added the backend contract for the upload worker: isolate extraction/builds, verify owner/account/security and format/field coverage, compare individual reconciliation findings with the verified base, retain source receipts, seal artifacts and publish an atomic Git tree through a codex PR. CI/review and deployment verification remain explicit gates; intake never directly mutates production or clears staged files.
- The generated book retains the actual selected normalized holding pointer. Audit source links use it, and canonical data, per-field evidence and all reporting projections share one content-addressed revision. Quotes/NAVs retain independent instrument/value/time evidence. No dashboard layout changes.
- Added format-mutation, identity, duplicate, reconciliation, stale-artifact, atomic Git/retry and merge-gate tests, plus an actual-book/source-row contract. See `docs/STATEMENT-PUBLICATION.md` for the teammate's handoff and the precise evidence/format limitations.
- Integrated the teammate's actual intake runner: source identity/reconciliation gates and checksum receipts now precede PR publication. It starts on codex branches, retains inbox bytes while checks/review/deployment are pending, monitors exact document versions with authenticated GETs and requeues a stale candidate. Main is never committed/pushed/reset by intake; a failing baseline cannot waive required gates. Existing status/reason controls carry the lifecycle without a UI change.
- A version listener replaces the whole browser application when a verified publication changes, retaining its URL/member scope. Uploads, folder reading and edits defer refresh, and a persisted guard stops reload loops. Controller tests and a built-app browser regression cover drafts, navigation and exact URL retention; no controls or layout were added.


### Stage 10gj — EXCEL EXPORTS IGNORE DISPLAY FILTERS

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

### Stage 10gk — EVERY STATEMENT IS READ: A SCAN BY OCR, CHECKED BY THE PAGE; A REMOVAL NOTICE IS A STATEMENT THAT NEVER ARRIVED

*"check and fix why these two files are unreadable, find the root cause and make sure no file in future is left unread and no data in any file should be dropped"* — the family, 21 Oct 2026.

- **Bharat's HDFC NSDL statement (`august-2026-e/`) was refused by policy, not by necessity.** It is four photographed JPEG pages with no text layer, and a figure OCR'd off a photograph could not be checked. The page checks itself, though. Each row prints its quantity twice (Quantity and Total Balance, in two digit groupings), each ISIN carries a check digit, and the footers count the pages and close with `End of Report`.
- **How it is read now.** `lib/scan.mjs` (tesseract.js 5.1.1, deskew, 2× enlargement, cleaned cell re-reads) and `providers/nsdlScan.mjs` read it. A row is published only when its two printings agree and its ISIN passes the check digit (`lib/isin.mjs` repairs OCR's letter/digit confusions, cheapest repair across the readings). One unchecked row refuses the whole document (`scan-not-verified`). A scan of any other layout is `scan-no-reader`.
- **What it adds.** 38/38 rows match a person's reading. The account is DP IN301151, client 22025655, Bharat, 31 Mar 2026; pages 1–4 are present, scanned out of order.
- **Names.** A scanned row takes the name its own depository prints for the ISIN on a text-layer statement (Ajay's ICICI NSDL). A row with no such statement takes the name every text statement printing the ISIN agrees on, and otherwise keeps OCR's words, named in `security-name-from-scan`. A scan's names never rename another statement's holdings. Lines are grouped by word centre, so a hyphen stays on its line. Height, not OCR confidence, keeps a word (`INDIA`, `AL`, `SANSHI` were dropped at confidence < 60).
- **In the book.** It is a quantity-only custody account; the statement prints no rate. Polycab's 51,08,911 shares go to `BOOK_POLYCAB` (ring-fenced rows on an unvalued statement are now carried there, and `/polycab` shows `—` with the reason for a holder with no mark). Sanshi Class E is cross-referenced to the fund's own statement. Twelve private rows are counted under the review (`SUPERSEDED`): Everest Fleet ×2, Integris, Matrix Gas, Big Bang Boom, India SME, Sky Capital Hudle, 360 ONE, Karban, Zippmat ×3. Bharat's shares correct two witnesses: Matrix Gas is ₹4.5 Cr ÷ 1,12,500 = ₹400 a share, and Big Bang Boom is ₹6,30,000 a share. Left unjoined: Stay Vista (one row, two review lines), Procyon Star (refused: not Procyon Enterprise LLP) and Innoviti Technologies (refused).
- **The LKP files (`october-2026-c/LKP EQUITY/`) never arrived.** The mail server replaced both `.xls` attachments (`519_…` capital gain, `666125807_…` transactions) with its 85-byte removal notice. The second was hidden as a byte duplicate of the first. Each notice is now its own document, `attachment-removed`, never deduped. `check:reads`, `coverage:source` and the Statement Library list both as **never arrived**: not passed, not failed. The fix is LKP re-sending them. `acceptedUnread.mjs` is empty.
- **For future uploads.** The upload refuses a removal notice or a file that is not the format it claims (`shared/statementBytes.mjs`, 400 `NOT_A_STATEMENT` / `INVALID`). The intake holds an all-notice delivery as `not-a-statement`, lands the rest of a ZIP and names what never arrived, and reads a new scan (`GLOW_OCR=new`). CI carries scans forward (`GLOW_OCR=off`).
- **Publication (Stage 10gg's verifier).** `lib/publication.mjs` now accepts three cases.
  - A failed reading that published nothing may be replaced by another reading of the same source file. That is not `ARCHIVE_LOSS`.
  - A never-arrived notice publishes no facts, so it is not a `READ_GAP`, `UNKNOWN_FORMAT`, `EMPTY_EXTRACTION` or content duplicate.
  - `SECURITY_SPLIT` / `SECURITY_CONFLICT` fire on a pairing the verified book does not already carry. An AIF's units filed under the depository's name and under the fund's (`sanshi-trust-fd-i-cl-e-…` / `sanshi-fund-i-class-e`) are the reviewed state. Under the old `size !== 1` rule, no future NSDL or Motilal delivery carrying those ISINs could have been published.
  - The intake carries a ZIP's `neverArrived` names through every publication stage (`withNotice`).
- **Polycab.** `BOOK_POLYCAB` is `PolycabHolding[]`, a Position whose `marketValue` may be `null`. The type surfaced two misreads:
  - `chatContext` summed the value as if Bharat's block were ₹0. It now values the demat that prints a value and names the one that does not.
  - `sectorReturnCoverage.test` used the fenced row as a Position.
  - The store (`build-polycab`) carries the book's 1,90,10,140 shares. The corporate-action capture was re-imported for Bharat's 21 new symbols, so the depository-share gate can rule on each.
- **Checks.** `test:ingest` adds suite `scanRead` (ISIN repair, the two printings, bytes, refusals) and golden case HDFC 22025655 (ten quantities read off the page). `checkReads` gains never-arrived and scan-not-verified cases; `statementUploads` refuses a notice and a sign-in page saved as `.pdf`. `test:statements` adds the three publication cases.

### Stage 10gl — ADDRESS LOOKUP AND DRAGGABLE PROPERTY PINS

- Property entry removes latitude/longitude fields. Find on map locates an address with free Photon/OpenStreetMap search, fills missing location fields, offers matching addresses, flags approximate results and lets the user drag/click the pin. Old searches cannot replace a newer address or manually positioned pin; reopening never geocodes an existing pin.
- The user requires ₹0 usage spend. Search and maps need no account, key or billing. Searches are explicit, spaced and cached; the authenticated proxy bounds responses, validates points and exposes no property ownership or financial data to the provider. No paid-provider fallback or production configuration change.
- `docs/PROPERTY-MAPS.md` documents the free provider and limitations. CI covers address-only entry, choices, failures, actual Leaflet dragging/save/reload, stale responses, co-located properties and filtering. Public Indian landmarks are checked against the real free service without creating production records.
- Main's statement CI was already failing because carrying the newly read scan appended its derived naming notes again. Recompute those two notes instead; a focused two-pass regression checks byte-identical output, quantities and retained OCR wording. No archive figures are edited.

### Stage 10gm — HEADLINE GAIN AND RETURN CARDS SHOW AVAILABLE DATA

- The family asked for the top Gain / Loss and return cards to show what can be calculated, with the same simple coverage info as attribution. The cards now use its verified subset model: one incomplete holding cannot erase other recorded gains. Whole managed accounts and exits stay in the gain.
- FYTD/YTD use the same selected account inputs and dated-window measure as attribution. The history and money-weighted choices pool each usable account's own recorded window; under one year the former is labelled “Return over available history”, with “not annualised” and actual dates.
- Every card names covered holdings/value/accounts. The shared info body explains amounts, includes account and statement names, lists the records needed for exclusions, and keeps newer incomplete source records visible beside the older verified record in use. Other strict whole-portfolio measures retain their existing gates.
- Tests cover partial gain/capital arithmetic, exits, true zero versus absence, dated periods, a liquidated account, live-price isolation and the actual archive. Built-app browser checks cover default and saved card choices, info dialogs, focus restoration and FYTD card/table agreement.

### Stage 10gn — READABLE EXCEL EXPORTS WITH FROZEN HEADERS

*"Also freeze the column headers in the exported Excel files and auto-fit the column widths so all the data is readable."* — the family, 22 Oct 2026.

- Table, full-portfolio and consolidated exports share one layout pass over every exported row. Column widths measure formatted values, including expanded amounts, percentages, dates and hyperlinks; merged titles do not inflate only the first column.
- Long text wraps at a practical column width, with row heights fitted to the resulting lines and merged spans. Saved values, precision, notes, links, filters and complete export coverage are preserved.
- Freeze the complete header band explicitly: all table header rows, four rows in the Portfolio Monitor workbook and five in the consolidated workbook. The first scrollable cell opens immediately below the header.
- Serialized-workbook tests cover long values at the end of the data, expanded currency, multi-line descriptions, merged headers and all three export paths. Browser downloads check frozen panes and fitted columns as part of existing table coverage.

### Stage 10go — REMOVE THE STANDALONE MONEY-WEIGHTED RETURN CARD

- Removed the dedicated money-weighted metric from Morning CIO, its tile menus and search. Existing saved layouts and old `tiles=mwr` links discard the retired metric; an all-retired layout falls back to the standard cards.
- Remaining gain and return cards retain their available figures and coverage info. Their hover text uses plain “return” wording.
- Browser regressions check both menus, legacy links and local/shared saved layouts, including a layout containing only the retired card and conflicting local/shared preferences. The legacy measured-holdings bookmark keeps its independently verified calculation rather than depending on a removed card.
- Review follow-up: an explicitly all-retired URL now selects defaults even when valid local/shared preferences exist. The older return-dialog and latest-record browser commands target the remaining history card and current coverage UI, and run in required CI.

### Stage 10gp — UPLOAD REHEARSAL AND COMPLETE CUSTODY AUDIT DATES

- Added a full local browser drop → real upload handler → Git inbox → actual intake/extraction/build → reviewed publication → version refresh rehearsal. Seven original source PDFs supply the two HDFC folios and three ICICI demat rows; financial facts are never fabricated for the test. GitHub/reviewer/deployment service boundaries are explicitly emulated locally.
- A read-only production check found two ICICI custody rows without their reconciled dates and one transaction-derived balance absent from Data Audit. The audit now retains verified custody closing balances and their exact account/ISIN/unit/snapshot purchase evidence. Missing statement valuations stay absent and outside summary totals. Source links and the promoter ring fence are preserved.
- Re-extraction preserves exact immutable delivery receipts, including carry history, so later builds retain upload-to-document provenance. Conflicting or unsafe receipt paths fail before archive replacement.
- CI retains the complete upload evidence and checks every investment-date table family after publication. Added independent guards for owner, account, instrument, quantity, snapshot, duplicate rows and absent valuations. See `docs/STATEMENT-UPLOAD-E2E.md` for scope and external-service limits.

### Stage 10gq — HISTORICAL MARKET RETURNS FOR CURRENT HOLDINGS

- Returns now fetch full public adjusted stock-price history and exact-ISIN fund NAV history. The FYTD, MTD, YTD, 1Y, 2Y, 3Y and custom selectors calculate a current-value-weighted market return alongside recorded investment returns. Both aggregate amounts before annualising; short periods remain unannualised.
- The market summary and every attribution grouping share actual published calculation dates and show covered holding counts/value. Their info buttons explain current weights, sources and exclusions, naming each holding and account. Historical price changes are never passed off as actual purchase/sale profit or past portfolio ownership. Private investments retain recorded figures where supported.
- The authenticated Pages proxy sends only public listing/fund identities to free Yahoo Finance and MFapi, checks INR listing and fund ISIN, bounds upstream responses, excludes unfinished sessions and caches public history. Browser requests deduplicate histories, limit concurrency and allow failed histories to be retried without reloading successful ones.
- Focused arithmetic/feed tests cover capital weights, common dates, corporate-action-adjusted series, annualisation, exact identity and failures. Required CI exercises every period/type, totals, source/coverage dialogs, retry, sector regrouping and mobile layout.

### Stage 10gr — A BUYBACK IS NOT A SHARE EVENT

- *"Why in the daily movers for direct equity … only one holding is shown as percentage move, and why is it saying shares count unverified?"* (the family, 22 Oct 2026). The one name was EMA Partners on Ajay's ICICI NSDL demat (statement 31 Mar 2026): a tender-offer buyback went ex on 30 Apr, and `projectActions` filed every type that is not a split, bonus or dividend as a quantity issue, so the gate withheld its live value and the card ranked it by % alone. Transport Corp in both Goldstandard mandates (buyback 9 Oct, statements 6 Oct) was held back the same way on the AIF & PMS card.
- A buyback buys only the shares a holder tenders, and a tender is a sale the account's own record carries (`realizedLotsAfter`, `rolledForward`). `isHolderElective` files it as an `elective` line with that reason, and a recorded sale still withholds the price. Rights issues, demergers and other events keep the gate.
- `movesCloseBasis` drops buybacks from the ex-date previous-close guard in `dailyMovers` and `insideMovers`; a buyback does not move the exchange's close.
- `liveWithheld.test.ts` now uses a demerger for the held-back case and asserts that a buyback goes live, or is held back only for recorded sales. `dailyMovers.test.ts` checks that a buyback's ex-date keeps the day move. `docs/CORPORATE-ACTIONS.md` says the same.

### Stage 10gs — SECTOR ATTRIBUTION AS SECTOR COMPOSITION DRAWS IT

- *"why are AIF and mutual funds showing up as sectors? … show sector return attribution in the same way as we are showing in the sector composition tab … a consolidated view and a direct equity view … and a drop down list of the contributors and holdings in each sector and their returns."* The generic attribution filed every fund, private line and cash row under its class on the Sector axis; the Returns tab's Sector axis now draws `components/SectorAttribution.tsx` instead.
- One rollup for both panels: `rollSectors`, `emptySector` and the two sets moved verbatim from `pages/SectorComposition.tsx` into `lib/sectorRollup.ts` (`sectorSets`), which Sector Composition now reads too. Consolidated = company shares plus the funds' disclosed holdings (derived); Direct Equity = own demat/broking shares. Rows are GICS sectors and Unclassified only.
- Value, Weight and Return on cost are Sector Composition's figures (FIFO over the holdings that report a cost, "N of M", details card naming the fund-derived part). Gain and Contribution are since investment; contribution = row gain ÷ the set's capital, so rows add to the total. Market return is the one column that follows the toolbar's dates. A sector opens into its issuers (Consolidated) or holdings (Direct Equity) in the same columns; a company held only inside a fund shows 0 holdings and dashes with the reason.
- `?sset=direct` selects Direct Equity. check:pages `cio-returns-sector` / `cio-returns-sector-direct` strike `data-sa-*`: sector-only rows, totals and contributions adding, children adding to the opened sector. `check-selected-attribution` keeps its regrouping assertion on the Security axis and walks both sector sets; `check-market-returns` reads the sector panel's market cells.

### Stage 10gt — AUTOMATIC PUBLICATION OF VERIFIED STATEMENTS

- Removed the blanket code-review callback requirement from statement intake. Passing data-only deliveries merge automatically after required CI; missing, unclear or conflicting records remain held with their source bytes. No dashboard layout change.
- A trusted worker rechecks the exact base/head, generated-file allowlist, immutable receipt, uploaded bytes and document versions, including nested ZIP leaves, and reruns identity/date/coverage/reconciliation checks. Application code and policy edits cannot use this path. Actual unresolved findings and repository protections remain blocking.
- The complete folder-drop rehearsal now publishes without any reviewer callback, verifies the exact live document versions before clearing bytes, and checks the resulting MF/audit dates and dashboard table families. Added rejection contracts for invalid data, altered evidence and unexpected code changes.
- Completion of CI on a same-repository statement-delivery branch wakes the trusted main intake worker immediately; fork branches cannot trigger it. The scheduled poll remains a recovery path.

### Stage 10gu — RETURNS TAB: KEPT HISTORIES, XIRR PER YEAR, CAPITAL BRIDGE

*"it is taking a lot of time to read all the files again and again … It should automatically already be reading and storing cached returns … when I'm changing XIRR to absolute and vice versa, the return is not changing … show … the original invested amount, the portfolio value at the beginning of the period … at the end … the additional capital brought in, what was realized, what was unrealized"* — the family, 22 Oct 2026.
- Measured: the statement figures render in under a second; the wait was ~350 public histories refetched on every page load, 4 at a time, each arrival redrawing the tab and rebuilding every history's price table. `useMarketReturns` now has one page-wide loader (8 at a time, arrivals batched every 120 ms) and `marketHistoryStore` keeps each successful history in IndexedDB; a reload draws the market return in ~1 s with no request, and histories older than 6 h refresh in the background. Morning CIO warms the histories once idle, whatever panel is open. Failures are never kept; storage that is unavailable or silent for 3 s falls back to fetching.
- XIRR was restated over the period under a year, which for one set of flows sits within basis points of Modified Dietz, so the selector looked dead. XIRR is now a yearly rate at any length (`measureWindow`/`measureInception`, `marketReturnSummary`, the benchmarks' index), shown "p.a." with the period figure beside it; Absolute is never annualised and CAGR only from a year. The headline cards keep their period reading through `periodXirr`. FYTD on the book: XIRR 43.26% p.a. (20.58% over the period), Absolute 20.79%.
- `capitalBridge` over the attribution total's own units: value at start + money added − money taken out + gain = value at end, per account and in total, plus the purchase cost of what those accounts hold now. The gain is split only where a record splits it: the account's statement P&L over exactly these dates whose lines make the gain within ₹1 (accrued income outside a record that closes without it), or a fund folio's dated unit record (no redemption in the period realises nothing; a scheme redeemed only inside it realises its FIFO gain; any switch, undated dividend or unattributable redemption leaves it unsplit). Fund and purchase-cost records carry no separate charges (inside the NAV / prices), shown as — with that reason. Everything else is one named "Not split" part. FYTD: 14 of 17 accounts split (5 statement, 9 fund record); Green Lantern ×2 and Motilal 90414963315 not split.
- Checks: `capitalBridge.test.ts` (new), period-return, attribution and market-return suites for the yearly XIRR; `check-selected-attribution` strikes the bridge on every period and type and the card against the tab's period figure; `check-market-returns` asserts XIRR ≠ Absolute under a year and a reload makes no history request; check:pages' benchmark invariants read XIRR as per year.

### Stage 10gv — THREE CLEAR TABS FOR MARKET RETURN COVERAGE

- The market-return popup opens on Return Overview, with short coverage, date and weighting explanations. All Securities Considered and Missing Values have live counts, searchable complete holding lists, and one entry per security/account rather than combining different owners or mandates.
- Every entry uses the attribution table’s existing classification and the account registry’s exact fund/mandate, owner, provider, account and report date. Missing entries state the specific missing price, NAV, identity, valuation or source response and the next step in plain language. Pending histories stay named until they finish loading.
- Structured gap reasons preserve the original diagnostics and calculations. A holding without a usable current value is explicitly left out rather than disappearing from the coverage reconciliation. Fund wording clearly distinguishes NAV changes from income paid out or reinvested.
- Focused tests check membership and missing-data wording. Required browser coverage checks tab keyboard controls, complete/disjoint holding lists, fund and mandate context, searches, retry, focus restoration, reopening and all three tabs on mobile.

### Stage 10gw — CLEAR MISSING-RETURN MESSAGES

- Recorded-return info boxes show the missing record and what to provide first, in short plain English. Account/source metadata and calculation explanations remain available in collapsed details.
- The market popup keeps its three coverage tabs. Missing Values puts the specific missing item and next step before account metadata; an unavailable overview points to that tab. NSE names missing public price history and directs statement-based returns to Recorded return.
- Purchase cost/date, sale proceeds, later valuations, payment history and invalid return windows each have a short message. Focused fixtures and browser checks cover the wording, immediate visibility and NSE example; authenticated previews were checked on desktop and mobile.

### Stage 10gx — THE STATEMENT LIBRARY OPENS THE ORIGINAL FILE

*"publish the original statement files to the hosted site behind the password gate so the preview can show the real PDF and spreadsheet layout"* — the family, 22 Oct 2026.

- `scripts/build-statement-files.mjs` (`build:statement-files`, run by `prebuild`, `predev` and `pretest:family`) copies the file behind every manifest entry to the gitignored `public/statement-files/<docKey>.<ext>` and writes `index.json` (size, password, bundle part, and a `missing` reason for any it cannot find). Pages' SPA fallback answers a missing path with index.html and a 200, so the page reads the index, never the status code. `source/_extracted/` is gitignored, so the committed ZIPs are expanded into a temp dir by the inventory's own rule. On a checkout without the expanded copies, all 425 files (64 MB, largest 1.5 MB) came out byte-identical to the main checkout's. The folder is not `public/statements/`, because `/statements` is the library's route.
- The preview opens on **Original file**, with **Text as read** one switch away. A PDF opens in the browser's own viewer, and a statement cut from a bundled PDF opens at `#page=<its first page>` and says which pages it is. A workbook is drawn from its own cells by the `xlsx` reader (a lazy chunk), with merged cells, sheet names and the file's number formats. Download and New tab sit beside Data Audit.
- Two reader traps closed. A text file (CSV, LKP's HTML-table `.xls`) is read `raw`: unparsed, "01/07/2026" became a month-first date serial (7 January) for 1 July. A binary workbook's built-in short date (format 14) is drawn `dd/mm/yyyy`, not the reader's US default.
- "Password-protected" is a measurement, not a guess. An `/Encrypt` dictionary marked 27 PDFs, but 12 (ICICI's payment advices, the HDFC folios) carry an empty user password and open freely. The build opens each with pdfjs and no password, and labels only the 15 that refuse.
- `test:family` suite `statement preview`: every document's original is published, at the stated size, named `<docKey>.<format>`, the kind its format says (magic bytes, so never the SPA's index.html), byte for byte with `source/` where the file is committed outside an archive, and each bundled part at its own pages. Merged-cell layout and file sizes are covered too.

### Stage 10gy — ATTRIBUTION TABLES START UNDER THEIR TITLE

*"there's a lot of empty space in this area, realign export excel in above empty space so that there is more space to see the below table"* — the family, 22 Oct 2026.
- The Return attribution card stacked three rows above its table: the title with the axis tabs, an Edit Columns row (`AutoEditColumns`' own toolbar) and the Export Excel caption. Both controls now sit in the card header beside the axis tabs and Expand all, and on the Sector view in the Consolidated / Direct Equity row; the table header starts ~45 px below the card top instead of ~130 px at 1550 px wide.
- `ExportableTable` takes an optional `controlsHost`: the control is drawn there (portal) instead of in a caption, and names its table (`data-export-for` ↔ `data-table-export-id`). `scripts/dev/table-excel.mjs` finds each table's one control either way (`exportControls`), so `assertTableExportControls` and the download/retry checks cover both placements. The two tables use `manualEditor` with `EditColumns` placed in the header.
- Checked locally: export from the header downloads the complete table on both views; `check-selected-attribution`, `check-market-returns` and check:pages `cio-returns*` show no new findings.

### Stage 10gz — SAVE PROPERTY DETAILS NOW, COMPLETE THEM LATER

- Every property field is optional, including name, address, owner/share and valuation date. Empty records save as Untitled property in the table, map and details, remain visible without an assigned member, and can be reopened to add details. New records no longer assume an apartment, vacant status or zero rent; changing status preserves entered rent.
- Identical owner rows save once instead of blocking Save or doubling ownership. Partial or conflicting ownership stays editable; unknown shares remain unknown in family totals. Details show entered whole-property figures, so incomplete ownership does not hide the saved amounts there.
- Record/API and local browser checks cover empty save/reload/edit, value without date or owner, duplicate-owner saving, missing shares, later additions, existing address search/dragging and unchanged valid share calculations. Production checks are read-only.

### Stage 10ha — RETURNS ON THIS YEAR’S PURCHASES

- Morning CIO Returns adds Invested this year beside the time presets. It selects the current Indian financial year from 1 April, measures current units from their own acquisition dates, and defaults to Absolute return. The existing periods retain their calculations. This purchase cohort uses current holdings only; sold units, dividends and payouts are explicitly outside the figure.
- Reconciled surviving lots, fund allotments and the verified FIFO trade tape split older units from this year’s units. The settled purchase cash retains its charges rather than being scaled to a statement’s book cost. A product review range or PMS funding date never dates an underlying security. Unknown dates, unmatched units/costs and missing post-purchase valuations are named in the info popup.
- The summary weights each included holding’s return by the value of its selected units. The searchable table names category, exact fund/mandate, owner/account, acquisition dates, cost, value date, gain and weight. XIRR uses each holding’s dated buys and closing value before weighting; under-year CAGR retains the period figure.
- Tests cover fiscal boundaries, mixed-age purchases, FIFO sales, source and valuation refusals, portfolio weights, complete coverage reconciliation, toolbar behavior, search, type changes, reload and mobile.
