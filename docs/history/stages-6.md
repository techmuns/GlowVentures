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

### Stage 10ha — OUR BOOK VS BENCHMARK

- Renamed the Morning CIO tab and its search result to “Our Book vs Benchmark”. The existing tab link and benchmark calculations stay the same.

### Stage 10hb — BSE QUOTES FOR YASH HIGHVOLTAGE AND NSE; YASH ROLLED ON THE REVIEW

- *"use the BSE symbols for them to fetch live prices"* (the family, 22 Oct 2026), on the two Direct Equity names the movers card dropped as "No exchange symbol". Yash Highvoltage already had a BSE identity (`BSE:YASHHV`, `BSE_EQ|INE00GK01023`, scrip 544310) and was priced live on every other page; the movers models read day moves by NSE symbol alone. `moveSymbolFor` (NSE symbol, else the exchange-qualified quote key) now feeds `dailyMovers`, `insideMovers` and the card's wait list. The AIF & PMS card gains five mandate names the same way (Manali Petrochemical, Sasken, CreditAccess Grameen, Krishca, Punjab Chemicals), all resolved by exact ISIN.
- NSE listed on BSE on 24 Sep 2026. Upstox's BSE master carries its own ISIN as `BSE_EQ|INE721I01024` (trading symbol NSE, scrip 544937). `build-upstox-instruments` now resolves a review line the family placed on the listed side, and `applyQuotes` prices such a line only through its exact-ISIN listing. This reverses the 13 Oct note that no exchange price is published for NSE; the statement basis keeps the review's ₹41.5 Cr. Only NSE's three map entries were added: a full rebuild today also drops BUILDPRO, SHANKARA, SURYAROSNI, JSWDULUX and HEG because Upstox's masters moved, which is its own change.
- Yash's rupee impact was withheld for three review sales after its 31 Mar statement. The family chose the review's count (*"Review's 116,462"*). `rollReviewRows` rolls a statement holding on the review's dated buys and sales only where the review's own later Closing holds what they leave, and `build-book` publishes it as `rolledForward` (`source: "review"`) where the account's own tape gives none: Yash, 138,462 → 116,462 through 30 Jun, cost held ₹84.11 L. The June sale cash is unverified, so realised gain and HPR stay absent (`hprUnavailableReason`). `rolledPosition` (and `check-pages`' mirror) now marks a no-price statement row at its own value per unit.
- Tests: `companyQuotes` (NSE identity, live price, private review lines stay unpriced), `liveWithheld` (Yash's roll), `dailyMovers` (a BSE-only listing ranks), `insideMovers` (scope re-derived with the same key rule).

### Stage 10hc — RETURNS ON THIS YEAR’S PURCHASES

- Morning CIO Returns adds Invested this year beside the time presets. It selects the current Indian financial year from 1 April, measures current units from their own acquisition dates, and defaults to Absolute return. The existing periods retain their calculations. This purchase cohort uses current holdings only; sold units, dividends and payouts are explicitly outside the figure.
- Reconciled surviving lots, fund allotments and the verified FIFO trade tape split older units from this year’s units. The settled purchase cash retains its charges rather than being scaled to a statement’s book cost. A product review range or PMS funding date never dates an underlying security. Unknown dates, unmatched units/costs and missing post-purchase valuations are named in the info popup.
- The summary weights each included holding’s return by the value of its selected units. The searchable table names category, exact fund/mandate, owner/account, acquisition dates, cost, value date, gain and weight. XIRR uses each holding’s dated buys and closing value before weighting; under-year CAGR retains the period figure.
- Tests cover fiscal boundaries, mixed-age purchases, FIFO sales, source and valuation refusals, portfolio weights, complete coverage reconciliation, toolbar behavior, search, type changes, reload and mobile.

### Stage 10hd — DISTINCT BACKGROUNDS FOR EXPANDED TABLE ROWS

- Group headings use a warm band; expanded rows use opaque blue stripes, with deeper shades for nested levels and a left-edge guide. Both themes keep readable secondary text, a separate child hover and the existing gain/loss colours.
- Shared tree tables and custom holdings, trade and sector detail tables use the same palette. Row-depth markers stay attached when columns move; the existing zebra check recognises these intentional hierarchy colours.

### Stage 10he — THE UPSTOX INSTRUMENT MAP REFRESHED; SPLITS THAT RETIRED AN ISIN

- `npm run build-upstox-instruments` re-run against the 22 Oct masters, last done 7 Oct. Ten held names gain an exact quote identity: APOLLOPIPE, BHAGYANGR, FINCABLES, PARACABLES, RPOWER, STLNETWORK, SURANAT&P, UNIVCABLES, VINDHYATEL, VISHNU. SHANKARA and SURYAROSNI drop out because SVAN exited both; `heg` and `cosmo-films` are now asked for as `heg-advanced-materials` and `cosmo-first`.
- A plain rebuild would have dropped two names a face-value split gave a new ISIN, which the statements still print. `ISIN_SUCCESSORS` (same issuer and class enforced, used only once the old ISIN has no listing): Shankara Buildpro INE24OJ01011 → INE24OJ01029 (₹10 → ₹2, ex 8 Oct, in the saved capture), held in both SVAN mandates; JSW Dulux INE133A01011 → INE133A01029 (1:10, record date 22 Oct), disclosed by funds. `joinedBy` records `+successor`.
- Poojaa Precision (Goldstandard, both mandates) listed on BSE SME on 4 Aug 2026 as `BSE:PPEL` (`INE288301026`). Upstox abbreviates the name, so a cited alias resolves it. Its statement prints neither ISIN nor NSE symbol, so the corporate-action capture could never be asked about it. `listingIsinFor` gives the gate and the evidence request the listing's ISIN where a statement prints none.
- Still unresolved, correctly: HEG Graphite (demerged, not yet listed), NICCO Corporation, Sterlite Electric and Sterlite Grid (10 shares each, no listing).
- Tests: `companyQuotes` (successor ISINs, Poojaa's alias and listing ISIN), `liveWithheld` (Poojaa covered by its listing ISIN, still held back by a capture not asked about it).

### Stage 10hf — SHARED NUMBER EDITING AND EXCEL CORRECTIONS

- Every table has Edit numbers, All inputs and Upload Excel beside the existing export. Single-investment source cells edit inline; full exports expand the tree and include nested tables, source input sheets and yellow missing-value cells. Totals, ratios, live prices and archived statement ledgers stay calculated/read-only.
- Uploads preview changes, retain stable investment/field identities, reject altered structure, formulas and stale/conflicting edits, and commit the validated batch together to the existing GitHub dashboard store. Zero and unknown remain different. Property edits use the existing property record; holding corrections leave source statements and dated return records intact, with restore and provenance labels.
- Private investment capital gaps can be filled without assigning them to every holding in a consolidated account. The private-book rollups and Morning CIO capital totals include those entered figures. Property ownership percentages and existing upcoming call amounts use their existing shared records. Drafts survive exports and warn on conflicting refreshes. Focused API, workbook, concurrency and isolated browser round-trip checks cover the shared workflow.

### Stage 10hg — REAL ESTATE TILES DROP NET EQUITY

- The family asked for Net equity to come off the Real Estate tiles. It is no longer a tile option, and the default strip is Property value, Total cost and Monthly rent. A saved layout that named it drops that slot (`SelectableTiles` filters unknown ids).
- Net equity stays as an optional table column and in property details.

### Stage 10hh — INHERITED AND GIFTED PROPERTIES WITHOUT A PURCHASE COST

- A property records how it was acquired: Purchased, Inherited or Gifted (`acquisition`; an older record reads as not entered). For an inherited or gifted one the editor asks for the value on the date of inheritance (or gift) instead of a total cost, may leave it blank, and refuses ₹0, which would show the whole value as appreciation. The date field is relabelled to match.
- That value is labelled wherever it appears: "On inheritance" under the cost cell, the detail row's own label, and the Total cost tile and footer count how many of their properties it covers.
- New Appreciation and Appreciation % columns (and an Appreciation tile option). Without a cost, a current value or a cost above ₹0, both show — with the reason (`appreciationGap`), never 0% or 100%; with an inheritance value they read "Since inheritance". The percentage is whole-property, like gross yield.
- Tests: `test:real-estate` (acquisition, blank and ₹0 inheritance values, labels, older ₹0 costs, shares); `check-real-estate.mjs` adds an inherited property through the editor and reads its cells.

### Stage 10hi — REAL ESTATE: EARMARKED / TO BE GIFTED

- A property can be flagged as earmarked to be gifted, with the intended recipient (a family member or entity, picked from the members list or typed; `recipientId` when it names a member) and a note (`Property.earmark`, null when not earmarked; an older record reads as null). A recipient may be added later.
- It is a marker only: owners, shares, every figure, every total and the member scope stay with the current owners until a transfer is recorded under Family ownership. The recipient holds no share.
- New "Earmarked for" column (recipient, "To be gifted", the note in its hover), an earmark filter (all earmarked, one recipient, or not earmarked; `?earmark=`), the recipient in search, a line in the map list and a callout in property details.
- Tests: `test:real-estate` (validation, older records, figures and scope unchanged, store round trip); `check-real-estate.mjs` earmarks a property through the editor, filters on it and clears it.

### Stage 10hj — REAL ESTATE: CAPITAL GAINS TAX ON A SALE, WITH INDEXATION

*"make sure to account for indexation and other things … indexation was removed in a 2024 budget … that should be accounted for in the real estate page valuation and taxation calculation"* — the family, 22 Oct 2026.
- `shared/propertyTax.mjs`: the tax if each property were sold today at its current value. Long-term after more than 24 months (a previous owner's holding counts for an inheritance or gift); 12.5% without indexation (Finance (No. 2) Act 2024); a resident individual or HUF selling land or a building acquired before 23 Jul 2024 pays no more than 20% with indexation, so the lower applies; 4% cess. Struck per owner on their share, then added. The Cost Inflation Index runs FY 2001-02 = 100 to FY 2026-27 = 384 (s.72(8)(a), Income-tax Act 2025, S.O. 3889(E), 15 Jul 2026); a year not yet in the table leaves the indexed route —.
- Residence: each family member's own Motilal Oswal demat statement (31 Jul 2026) prints "A/C Type: Individual-Resident"; `shared/owners.mjs` records it with that citation (`residence`, `residenceEvidence`). Trusts take 12.5%. An owner who is not a registered member, a property of type Other or blank, an inheritance received on or after 23 Jul 2024, an undated improvement or a missing index leaves the tax — only where indexation would have lowered it; otherwise 12.5% stands.
- The record gains what the rules need, all optional: dated improvements (each indexed from its own year; the Cost column now adds them, so appreciation does too), the previous owner's cost and acquisition date for an inherited or gifted property (the value on inheritance is not a tax cost), the value on 1 Apr 2001 for a property held since before then (used where higher; improvements before that date do not count), and rural agricultural land (not a capital asset: a computed ₹0). The editor's cost field is now "Purchase cost".
- Page: Est. tax on sale (with its rate: 12.5%, 20% indexed, Mixed, No gain) and Value after tax columns and tiles (Value after tax joins the default strip), optional Holding and Indexed cost columns, footer totals with coverage, and a "Capital gains tax if sold today" section in property details with each owner's 12.5% and 20%-indexed figures. A short-term gain shows — (slab rate on total income, not carried), and so does a property whose acquisition, cost, purchase date or previous owner's cost is not entered. Surcharge, selling costs and reinvestment exemptions are named in the hover and not applied.
- Tests: `test:real-estate` now also runs `test-property-tax.mjs` (21 checks: the index table, holding boundary, per-owner routes, pre-2001, inheritance, reform cutoff, missing inputs, validation, registry residence); `check-real-estate.mjs` enters an inherited property's previous owner's cost and an improvement and reads the tax and after-tax cells.

### Stage 10hk — UNDER A YEAR, EVERY RETURN IS ABSOLUTE; ONLY DEBT IS ANNUALISED

*"Never annualise equity returns for periods under one year - Karur Vysya Bank showed ~54%, which looked annualised over a holding of under a year … whatever investments are being held for less than a year need to show only absolute return, even if we have selected XIRR or CAGR return … debt investments are to be annualized."* — the family, 22 Oct 2026.
- One rule, `mayAnnualise(days, debt)` in `analytics.ts`: a year or more, or debt. Debt is `isDebtHolding`: a Bond, or the family's own Debt class (`familyAssetClass`: Neo Infra Income, K M Global Credit). Liquid and arbitrage funds are their Cash, so they stay absolute. Stage 10gu's "XIRR is a yearly rate at any length" is withdrawn: FYTD read XIRR 43.25% p.a. on 20.79% earned, and now shows 20.79% for XIRR, CAGR and Absolute alike.
- Every engine asks it, and under a year shows the absolute figure, named, rather than a rate or a dash:
  - `measuredReturn` (Monitor, mandates, stock page, Excel): CAGR on a lotted holding, CAGR on staggered dated capital, and XIRR on a holding dated under a year now show the HPR.
  - `capitalReturn` / `clubCapitalReturn` (Transactions, with `CapitalGroup.debt`).
  - `fundMeasuredReturn` and Private Market's pooled rows.
  - `measureWindow` / `measureInception`: Returns tab, attribution by category, asset class, basket and sector, headline cards. `Measured.shownAs: "absolute"` carries this to every face; `periodXirr` is gone.
  - `marketReturnSummary` and the benchmark indices.
  - `investedThisYear`: its XIRR read 75.23% p.a. in total (Poojaa Precision +1,540% p.a.) and now reads 3.84%.
- Karur Vysya has no dated purchase. Its ~54% was the Returns tab's market-return column annualising a part-year price move, which is fixed above.
- The review's printed "scheme / index XIRR" columns show the review's absolute return, tagged ABS, unless the row's first investment (the review's range, else the statements' dates) is a year before 30 Jun 2026. Example: MPS +228.34% "XIRR" now reads +4.18% ABS.
- Hovers too: Performance no longer prints a sub-year "p.a." figure.
- `/api/macro` Max annualises only from a year. `moneyWeightedReturn` puts no figure on an unknown window. The price table's Max* asterisk follows its span.
- Checks:
  - New suite `underAYear.test.ts` (test:family).
  - Updated suites: period-return, attribution, market-return and invested-this-year.
  - `check-pages`: the Returns-tab and Performance invariants.
  - CI scripts: `check-market-returns` and `check-selected-attribution` now require XIRR = CAGR = Absolute under a year.

### Stage 10hl — RETURNS: EQUAL COMPACT SUMMARY BLOCKS

- Investment performance and Market performance share an equal-column, equal-height grid on desktop and stack on small screens. The capital bridge is a compact ledger with a prominent return, a collapsed gain breakdown and the existing account drilldown.
- Market coverage keeps the original inline holdings, covered value and actual price dates. No coverage progress bar, extra coverage sections or invested-cost summary. Existing source-info dialogs remain available.
- The Returns picker names the measure the covered total actually displays. Its display-only Absolute return state retains the originally requested calculation for debt-only rows; choosing Absolute explicitly remains available. Stage 10hk's calculation rule and debt exception remain intact.
- Browser regressions cover picker/figure agreement, equal summary dimensions, the collapsed gain breakdown and inline market coverage alongside the existing period, source and assumption checks.
- CI exposed the existing property-tax owner table missing the standard export wrapper; it now uses `ExportableTable`, preserving the owner-level tax figures and restoring the export-coverage contract.

### Stage 10hm — BANDHAN'S CURRENT FOLIO REPLACES ITS OLDER DEMAT BALANCES

- Preserve Ashwini's 26 October original statement for Ajay's Bandhan folio 8652064. A checked reader covers all four schemes and every printed movement: Arbitrage has 202,573.963 units / ₹7,724,469.33; Large & Mid Cap has 2,639,320.472 units / ₹407,339,525.05, both valued on 23 October. Liquid and Overnight close to nil. Purchase costs come from the matching account-summary rows, never cumulative purchase cost less redemption proceeds.
- Read and reconcile the five arbitrage switches and receiving fund entries, fees/stamp duty, running units and printed account total. The partial unit-history openings remain explicit; no missing purchase history or whole-account return is invented.
- Reviewed custody-to-folio links are verified against the source's 7 October rematerialisation entries, owner and exact ISIN. The newer linked folio replaces older custody balances in both canonical positions and live overlays; custody history stays archived. Wrong owners, schemes, unlinked folios, equal/older records, later custody holdings and ambiguous successors cannot suppress a holding. A later measured zero on the linked folio can replace an old positive balance.
- Prevent an older cached AMFI NAV from rolling a newer statement valuation backwards. Separate Motilal and Invesco folios remain separate; other family members' Bandhan holdings stay counted.
- Data Audit exposes a current-balances sheet with each scheme's ISIN, dated NAV, units, cost and value. Classify the two nil liquid/overnight schemes as cash equivalents and regenerate the review's gap list so the newly received named holding is no longer requested.
- Review corrections: include explicit opening-unit rows in the per-scheme origin test. The two nonzero Bandhan openings prevent the small nil-origin sleeves from certifying the whole folio's capital history; appreciation and XIRR stay withheld until preceding purchases are supplied. Both full Large & Mid Cap spellings resolve to the existing exact-ISIN key used by the other holders, NAVs and scheme-name indexes, keeping one family holding.
- Encrypted archive rereads accept reviewed aliases only with the same exact ISIN, units and value. CI retains the regenerated archive and book for diagnosis on a source mismatch, and the mismatch still fails the required job.
- Regression checks cover source reconciliation and refusals, chronology, account/owner/plan isolation, measured-zero successors, retained history and a single current Bandhan balance.
- Integrated Stage 10hn's Helios statements and regenerated the combined archive/book, retaining both latest deliveries.

### Stage 10hn — HELIOS, 26 OCTOBER: TWO FOLIOS, AND THEIR RETURNS CLOSE ON THE NEW NAV

- `source/october-2026-d/`: CAMS account statements of 26 Oct for Helios Flexi Cap Direct Growth. Folio 10355977 (Ajay) is revalued at the 23 Oct NAV of 14.83, ₹31.00 Cr → ₹28.36 Cr. Folio 10056128 (Ajay, with Aarti as joint holder) is new to the book: 32,45,281.682 units, ₹4.60 Cr paid over three purchases since 7 Aug 2024, ₹4.81 Cr today. It is the review's Ajay MOPWM Helios line to the unit; the units were rematerialised out of demat on 6 Oct, and no demat holding in the book carries them. The client sent 10355977 twice (byte-identical), so one copy is kept.
- `Acctstmt_G_8652064 (1).pdf` from the same message is PAN-encrypted and was not added on this branch, which had no `GLOW_PDF_PASSWORDS`. It is Ajay's Bandhan Mutual Fund folio 8652064, and a parallel delivery integrated it as `source/october-2026-d/Bandhan-8652064-2026-10-26.pdf` — opened from the encrypted password vault (`config/statement-passwords.bin`, restored with `GLOW_DASHBOARD_PASSWORD`) — in Stage 10hm, which merged alongside this one. All three of the 26 Oct statements are in the book.
- The Helios layout records the window a dated issue prints (`From 07-AUG-2024 To 26-OCT-2026`) and its joint holder. A "Since Inception" issue prints neither.
- Return records (`unitLedgerReturns.mjs`, `stitchSinceInception`): a dated issue that opens after the FY start cannot witness its own nil origin. An earlier since-inception issue of the same folio can, if its ledger reaches the later window's first day and prints the same rows where the two overlap. 10355977's record now closes on 23 Oct at ₹28.36 Cr on its August + October ledger. Before this, it stayed on 6 Aug with "newer valuation lacks a complete ledger".
- 10056128 opens the FY at 32,45,281.682 units × AMFI's published 31 Mar 2026 NAV of 13.33 (scheme 152135, added to `reference/amfi-opening-navs.json`) and closes on 23 Oct.
- Not regenerated: `docs/REVIEW-RECONCILIATION.md` / `src/data/reviewGaps.ts`. A fresh `reconcile:review` also rewrites sections that main's own book has moved since #176 (Polycab, Smart Works, cost recovery). That belongs in its own change.

### Stage 10ho — TRACE HOLDINGS BACK TO THEIR SELECTED STATEMENTS

- Restore source navigation at the family's 26 October request without changing table layouts. Portfolio Monitor account/owner labels and quantities open Statement Library; the shared table seam also traces available holding quantities, costs, marks, values and unrealised gains on holding, mandate, entity and drill-down tables. Stock summary figures and measured totals use their own contributing records.
- Resolve links from retained document/record pointers, explicit depository source IDs and recorded review workbook rows. Never infer a source from an equal amount or a similar account name. Combined figures list their separate inputs; live/NAV prices and saved family corrections are distinguished from PDF measurements.
- Statement Library resolves a linked document's provider automatically, displays its exact normalized source record and opens a uniquely matched PDF page. The ISIN context can continue across a page break: Ajay's Motilal Arbitrage closing balance is on page 5 after its page-4 header. Workbook evidence selects its recorded sheet and highlights the cited rows. Broken pointers and ambiguous page matches do not guess a replacement.
- Preserve formula popovers, editing, exports, sorting and column movement. Source record reads and related purchase evidence use the existing revision-bound canonical/provenance views. Data Audit source and quantity links open the same library documents.
- Regression checks cover every selected canonical quantity, real demat/zero-folio isolation, combined quantities, market-feed separation, saved corrections, strict pointer resolution and page matching. Browser checks exercise real PDF rendering, account labels and expanded Monitor rows.

### Stage 10hp — HIGHLIGHT THE PRINTED SOURCE NUMBER AND RETURN TO THE SAME VIEW

- Source links open the existing Statement Library viewer above the originating route, keeping its mounted table, selected tabs, filters, expansions, sorting, column order and scroll containers. An explicit Back control, Close, Escape and browser Back return over the same history entry; direct/copied URLs remain ordinary library links. Member scope travels with the link, and Data Audit's consolidated-source links retain their original tab.
- On a uniquely identified PDF page, match the full source value inside its exact ISIN section, carrying identity across consecutive pages. Draw a yellow overlay over the printed number and scroll it into view, recalculating its position when zoom changes. Motilal Arbitrage's page-5 Closing Balance is selected over the identical last running balance. Other ISINs, partial numbers, duplicate matches and missing closing labels cannot receive a guessed marker; unsupported text shows a short status.
- PDF bytes, statement records, holdings and financial calculations stay unchanged. Retain password, bundle, sandbox and original/text preview behavior, and contain keyboard focus within the preview.
- Regression checks cover numeric precision/boundaries, nil balances, ISIN isolation, duplicate refusal, explicit closing rows and continued page context. Browser checks use the real Motilal PDF, yellow marker visibility/zoom and return through Back, Close, Escape and browser history with the Cash selection, holding filter, expanded account and table scroll retained.
- Automated review corrections: reuse keyboard focus/Escape handling for loading and failed archive dialogs; retain an explicit unavailable-highlight status when page selection is ambiguous or missing; keep PDF text extraction failures separate from successful canvas rendering. Browser regressions hold the manifest request pending, fail it, and exercise an ambiguous multi-page citation.
- Keep the source dialog shell eager so the first click immediately has an accessible loading dialog. Capture Escape for the top dialog and contain its pointer events, preserving an underlying multi-source list through Back, Close and loading/failure exits.
- Full-family Excel snapshots retain unfiltered statement hyperlinks as well as unfiltered figures; member scope is carried only during interactive source navigation. The existing member/sector export equality regression guards this contract.

### Stage 10hq — DSP GOLD AND SILVER ETF VALUED ACROSS THEIR 1:10 SPLIT

- *"why are there no values for market value or anything for dsp gold and silver?"* (26 Oct 2026). DSP sub-divided both ETFs ₹10 → ₹1 on 28 Aug 2026, and NSE moved them to new ISINs: GOLDADD INF740KA1SW3 → INF740KA1ZP2, SILVERADD INF740KA1RE3 → INF740KA1ZQ0. The sources are NSE/CML/75868 (21 Aug) and NCL/CMPT/75902 (24 Aug, record and ex-date 28 Aug). The Motilal statements of 31 Jul print the old ISIN and the pre-split units, and AMFI's file carries only the new ISIN. So 14,00,000 Gold and 1,23,000 Silver units met no NAV, and the security pages showed `—` everywhere.
- `shared/fundUnitSplits.mjs` records each split with its circulars. AMFI's NAV history independently drops by the factor between 27 and 28 Aug (Gold 152.3813 → 15.3425). `build-fund-navs` joins the successor's NAV, strikes the basis check on NAV × factor, and writes `FundNav.unitSplit`.
- `unpricedStatementUnits` values only lines counted before the ex-date, at statement units × factor × NAV. It matches the review's recovered cost on the statement's own count, then moves the row to the NAV's unit (`depositoryUnits.unitSplit` keeps the printed count). On 23 Oct NAVs: Aarti's Gold ₹16.31 Cr, Ankita's Gold ₹2.80 Cr and Ankita's Silver ₹2.28 Cr. Live basis only, as every unpriced statement unit is. The book's units are unchanged.
- `applyFundNavs` and check-pages' `withPublishedNavs` leave a position alone under a split-joined NAV. `investedOn` reconciles recovered lots on the statement's count. The words follow: the price hover (`describeDepositoryUnits`), the account note, the value-date hover (`valuedAt`, which no longer says the quantity is as printed), the fund card's unit note and the quantity source trace (the PDF's own count, with the split named).
- Tests: `unpricedUnits` (re-derivation with the factor, DSP rows, a post-ex-date line refused), `recoveredCosts` (24 recovered, a cost never values a broken basis), `clubbedFigures` (DSP Gold's two lines now share AMFI's one NAV, so one mark).
- Morning CIO's allocation gains an ETF row (₹25.1 Cr invested, ₹21.4 Cr current, −8.5%). Its FIFO return carries Silver's ₹1.47 Cr realised, so it no longer equals Current ÷ Invested. The return cell now carries `data-alloc-booked` / `data-alloc-sold`, and check-pages ties each row to (Current − Invested + booked) ÷ (Invested + sold). `BUCKET_SLOTS` goes to nine.

### Stage 10hr — FOCUS THE STATEMENT READER ON THE ORIGINAL PDF

- Remove the technical normalized "Source record" block above statement previews at the family's request. The original PDF receives the freed space; its yellow source-number highlight, page/zoom controls and return to the same dashboard selection remain intact.
- Retain source links, canonical provenance, Data Audit and the optional "Text as read" view. The reader no longer fetches a canonical document just to repeat its raw fields above the PDF.
- Update the existing source-navigation browser regression to require the actual PDF and absence of the technical block, retaining its exact closing-balance highlight and return-navigation checks.

### Stage 10hs — RETURN FROM A FUND TO THE SAME PORTFOLIO MONITOR VIEW

- Keep Monitor's Holdings/Transactions selection, section (including Cash), holding/entity filters, expanded rows and closed sections with their browser history entry. Transaction direction, dates, ordering and expansions use the same presentation memory. Returning from Stock Info restores the entry before painting instead of recreating All; different visits keep separate choices.
- Preserve each entry's main scroll and named Monitor table scroll, restoring as lazy content becomes available and yielding to reader input. Statement overlays continue to use their origin's entry. Existing table column/order preferences and full-family Excel snapshots remain separate.
- Store bounded presentation snapshots in tab-local session storage, with an in-memory fallback when storage is blocked. Full document entries receive distinct router-compatible history keys; reload retains its existing key. No portfolio records or financial calculations are changed.
- Regression checks cover snapshot isolation, reload, invalid/blocked storage, the real Kotak drilldown, Back/Forward, Cash, row expansion, filters, sorting, horizontal/vertical table scroll and a separate ETF visit.
- Review corrections: the old mount-time expansion reset now runs only for an actual new basis choice, preserving remounts and history traversal. Validate saved entity/section choices and intersect picked holdings with the current book's options before applying them; wait for fund-only options before declaring those selections obsolete. Browser coverage seeds retired choices and retains the valid holding across reload.

### Stage 10ht — KEEP THE READER'S PLACE ACROSS THE DASHBOARD

- Extend per-history-entry presentation memory to page searches, ledger/research/chart tabs, private-market/sector/holdings trees, comparison picks and source-archive workbook/sheet/search choices. Existing URL-held tabs and member filters remain bookmarkable; global column/layout preferences retain their existing scope.
- Name nested page/card/table scrollports throughout the dashboard, including repeated rows, and retain native disclosures. Restore loaded infinite-table windows before their scroll position, including horizontal scroll. Reader input still takes precedence over an unfinished asynchronous restore.
- Statement previews keep their own view, sheet, loaded rows, PDF page/zoom and scroll. Fresh source visits retain the exact-number yellow highlight; history restoration keeps the reader's later position. Remove mount-time resets that would override restored archive and investment-card state. No book, calculations, credentials or pending edits enter presentation memory.
- Add a single-worker browser regression covering every routed page, its discovered tabs, drill-downs, both Back controls, Forward, filters, disclosures and both scroll axes. Retain the targeted Cash/Kotak regression and source/PDF checks; extend parser validation for typed presentation snapshots.
- Review corrections: give every infinite table an explicit independent identity, and freeze its display window during a full-family export so mounted number drafts survive. Normalize sector comparison picks against the loaded scope before counting capacity. Qualify repeated DOM elements by their stable row/group/account keys so a shared sort change cannot move an expansion to another holding. Regression checks cover reordered row identities and source/PDF Forward restoration.
- Keep unresolved sector picks when look-through data is loading or unreachable; only a complete successful result can retire absent choices. The browser tour visits nested research/held-view tabs before leaving their parent, and includes all consolidated workbook subtabs and the Monitor/Ledger mode controls.
- A deployed-preview check caught PDF scroll anchoring against the temporary loading line. Keep restoration pending through PDF rendering and require stable scrollport geometry across two frames, so removing that line cannot shift the restored source position.
- The full navigation tour exposed a pre-existing crash in the archive's Raw page text tab. Decode its page/text records into a searchable grid, preserve the source page numbers and text, and reject malformed extraction payloads through the existing fallback. The browser regression now explicitly restores that tab and its search.
- A delayed Polycab quote changes only its heading text, widening the table without resizing the scrollport. Observe text-node mutations so a temporarily clamped horizontal position is retried. The browser tour deliberately delays that reply; the focused case reproduces the reset before the fix and passes afterwards.
- Integrate the continuous PDF reader from #253: retain its page placeholders and lazy canvases, restore the saved page/zoom/scroll, and suppress citation recentering on historical visits. Extend the source regression to read onwards from the cited page to page 6 before Back/Forward. The mobile fixture waits for the resized canvas before scrolling, so an old desktop canvas cannot falsely satisfy readiness.

- Latest-main integration: preserve Stage 10hw's source-data policy and accompanying regression fixes verbatim. Its purchase-cost and valuation checks supersede the temporary fixture adjustments made while this branch awaited CI. This change adds no financial calculation or source-data changes.

### Stage 10hu — MOPWM'S FAMILY TRANSACTION REPORT: 20 MORE PURCHASE COSTS

- `source/october-2026-e/ANKITA_JAISINGHANI_FAMILY_23Oct2026131535.xlsx`, sent by the client on 27 Oct: MOPWM's family-wide transaction report of 23 Oct, with 26,402 dated rows across Direct Equity, Mutual Funds, PMS_AIF_SP, Fixed Income and Derivative. `lib/sheet.mjs` read it as five empty sheets, because its XML is written `<x:row>`/`<x:c>`. The prefix is now taken from each part's root element; unprefixed workbooks match exactly as before, and the archive is otherwise byte-identical.
- It is the adviser's record, not a statement: it has no holding, valuation or ISIN. It is classified on its Mutual Funds header run (`ADVISER_TRANSACTIONS_SIGNATURE`) as `Adviser transaction report (not a statement)` and archived held out by decision. `scripts/lib/mopwmTransactions.mjs` reads every row by header text. Holders resolve through `shared/owners.mjs` with the `M/S` dropped. Nine people the registry does not know (116 Mutual Funds rows) are counted and attributed to nobody.
- `recoverHoldingCosts` tries it only where the review and the register leave a holding unrecovered. Identity comes from `MOPWM_SECURITIES` (ISIN → the report's name, plan included). A fund's rows must be in the folio that is the account (the demat client ID); a share's must be the owner's, held in a Motilal demat. Rows are replayed to the statement's own date and must leave exactly its units. A split, merger, demerger, bonus or transfer entry refuses the holding (Insolation, Nuvama, Vedanta Aluminium), as does a non-trade fund row. No cash dividends are claimed.
- 45 → 65 recovered costs. Ankita's nine bank shares and Kaynes (whose 7 Jul receipt was her two existing purchases). Ajay's Kotak Arbitrage, Bandhan Large & Mid Cap / Arbitrage, and Motilal Arbitrage, whose demat folio leaves exactly 28,067,435.434: the review's 0.066-unit gap is closed. Bharat's ABSL Liquid, HDFC BAF Direct and two ICICI index residues; Ankita's Mirae residue; and the Family Trust's Kotak Arbitrage. Market values are unchanged.
- 12 of them were sold after their 31 Jul custody statements (Axis, ICICI Bank and SBI on 23 Sep; the arbitrage and liquid funds in Sep/Oct). They carry `salesAfter`, so the holding names its later sales and needs a newer balance. They are not rolled forward: the report prints no closing balance to witness one. `docs/client/PURCHASE-COST-RECORDS-NEEDED.md` drops the recovered asks and requests the current Motilal demat holdings.
- `10387.pdf`, from the same message, is a one-page password-protected PDF. It is not added until a run holding the statement passwords can read it.
- Tests: `mopwmTransactions.test.mjs` (the prefixed workbook in full, owners, classification, FIFO, corporate-action and identity refusals, a later sale counted); `recoveredCosts.test.ts` counts 65 / 22 / 31 and pins Kaynes and Motilal Arbitrage.

### Stage 10hv — FULL-PAGE STATEMENT DROPS AND RETAINED FINANCIAL HISTORY

- Accept file and folder drags across the Statement Library viewport, including inside a provider folder, with a blue overlay naming the current folder. Keep Files/Folder controls and upload results available there. The existing intake still classifies each statement by its actual issuing provider.
- Use one document-level file-drop handler and a synchronous busy lock; nested tables cannot submit a second copy or open a dropped PDF over the dashboard. Clear the overlay on exit, cancellation, blur and navigation. Preserve ordinary text and table-column drags.
- Add local browser coverage for whole-viewport geometry at the app's zoom, nested drag transitions, repeated drops, paged directory traversal, exact fixture bytes, validation, the file chooser, service failure, light/dark themes and narrow screens. Preserve its evidence in CI; no production uploads are part of the checks.
- Automated review corrections: keep the non-uploading drop guard mounted while the manifest loads or fails, and clear source-document parameters when opening an upload's provider or returning to All folders. Browser cases cover both edge paths.
- The Stage 10hu MOPWM cost records exposed two tiny residual fund balances with real purchase and sale history being hidden by the value floor (before Stage 10hw withheld those cost records upstream). Preserve a whole security when any deduped line carries investment cost or nonzero realised/sold-cost/income history; keep the existing paid-out cash-at-value exception and the ₹1,000 threshold for uncosted specks. No source or generated book record is changed.
- The original regression reproduced six failures when restoring the old floor. Stage 10hw subsequently withheld those tiny recovered costs upstream; preserve that source-data change and its updated mixed-cost and corporate-action checks. Constructed cost/sale/income cases independently retain the display guard against future statements that establish investment history.
- Independently rederive the financial-history exception in the chat, Excel and page-check reference models. A costed residual now prevents claiming a complete PMS mandate when it is omitted; a genuinely uncosted speck still does not. The targeted context, Excel and FIFO suites pass; preview checks retain both affected fund records in Portfolio Monitor and Family & Entities.

### Stage 10hw — MAIN GREEN AGAIN AFTER 10HU

- #251 merged with CI still running, and CI failed. Three family checks printed `FAIL` lines that the local scan missed (it grepped only for `AssertionError`); the upload rehearsal failed with them, because its intake run holds an upload on any new `test:family` failure.
- `negligibleFloor`: Bharat's 0.43 / 0.048 ICICI index units and Ankita's 0.003 Mirae took ₹109, ₹3 and ₹0.15 of cost from MOPWM's report, and the floor drops them, so Capital invested would be short by what they paid. A transaction-report record now needs at least ₹1,000 of cost held (`SPECK_FLOOR`, the `NEGLIGIBLE_VALUE_FLOOR`); the three are named in COST-RECOVERY.md instead. 65 → 62 recovered costs.
- `clubbedFigures`: ICICI Bank no longer clubs a costed line with an uncosted one, because Ankita's lot is costed now. The book's own case is Insolation Energy: Ajay's costed ICICI NSDL lot beside his Motilal lot and Bharat's HDFC lot, both uncosted.
- `fundNavs`: every share candidate passes the live gate except those with a sale recorded after their statement (Ankita's Axis Bank, ICICI Bank and SBI), which it withholds by design. The check now says so and requires that exception to have a subject.

### Stage 10hx — FRANKLIN INDIA CREDIT AIF: AJAY'S ₹20 CR, FROM A SEALED STATEMENT

- `source/october-2026-e/10387.pdf` (27 Oct delivery) is sealed with the holder's PAN. At the family's instruction a temporary branch workflow opened it once with the saved statement passwords. As the statement intake does, it restored them in memory from the vault via `GLOW_DASHBOARD_PASSWORD`. It committed the archive and the encrypted preview, and was deleted before merge. Every run since re-reads its archived page text (`carriedForward`). Ten other sealed documents changed only in the vault entry that opened them; those were restored.
- It is Franklin India Credit AIF – Scheme I (Franklin Templeton's Category II AIF, SEBI IN/AIF2/24-25/1592), folio 10387, Unit Class DB2, Ajay. ₹20 Cr was committed, called and paid on 22 Oct; after ₹9,999.50 stamp duty, ₹19,99,90,000.50 bought 201,254.604 units at 993.7164, the NAV as on 21 Oct. The classifier filed it as an "HDFC" capital call, from the investor's bank on the page. It now matches the fund's name.
- `providers/franklinAif.mjs` reads text only and spells out the issuer's `ti` ligature (`Ɵ`). Nothing publishes unless every printed figure ties: contributed − stamp duty = net, commitment − called = uncalled, units × NAV = the printed value, the ledger's gross / charge / allotment rows match the summary, and the closing balance equals balance capital. A redemption, repayment or distribution row it has not been taught refuses the statement.
- In the book: a new account with one holding, worth ₹19.999 Cr. It is private by its printed category. Its cost is the ₹20 Cr gross paid (`grossPaid`), with a ₹20 Cr capital move and tranche on 22 Oct and a commitment fully drawn. Total value ₹880.59 Cr → ₹900.58 Cr.
- The return record names its actual gap: the capital arrived after the statement's only valuation. That reason is reached only where every dated row postdates the valuation, so no other account's wording changed.

### Stage 10ia — STATEMENT UPLOAD PROGRESS IN THE STATEMENT TABLE

- Replace the separate upload log with pending rows at the top of the existing statement table: Uploading, Preparing analysis, Analysing, Updating dashboard, then a green tick. The progress bar is indeterminate until the actual result is known; queued work never claims analysis has started.
- Completed uploads decorate and promote their actual source rows. Exact duplicate receipts match the full original source path, retain one document, and show Already in library. Unmatched receipts never guess a holder, account, date or source.
- Remove GitHub, commits, deployment paths and setup instructions from customer upload messages. Failures retain a clear next action; processing and publication rules are unchanged. Folder context persists for the browser session until analysis identifies the real issuer.
- Add browser coverage for local sending rows, stage transitions, completion without a duplicate row, duplicate handoff, useful failures and folder isolation; retain file-drop/cancellation/availability regressions.
- Reject pre-mutation background responses so they cannot erase a just-acknowledged upload or resurrect an old status. The browser regression reproduces the disappearing-row defect before the fix. Order format groups by upload order, including identical timestamps, so a new file type stays at the top.

### Stage 10hz — MORNING CIO RETURNS: THE MONITOR'S HOLDING COLUMNS

- *"add invested on date column in this returns section in the morning CIO page, and also add average cost and all of those columns as well … they should be able to select and see them in the morning CIO returns page as well"* (27 Oct).
- Return attribution (`SegmentReturns`) draws Invested on and Avg cost by default. Qty, CMP, Day, Purchase cost, Unreal. P&L, Realised P&L, Sector, Entities and the June review's holding fields are `optional`, ticked on in Edit Columns. The review's date range is not a column of its own: Invested on already falls back to it.
- `lib/lineHoldingFigures.ts` strikes them over a line's current holdings with the Monitor's own helpers (`totalQuantity`, `costedFigures`, `commonMark`, `dayMoveOf`, `investedOnOf` / `accountInvestedOn`). Per-unit figures need one security. Money is struck holding by holding, so rows add to the total on every axis. A line that is whole PMS accounts is dated by the accounts, except on All Securities.
- The money columns are since purchase, not the selected period, and their headers say so. `daySessionGate` (`dailyMovers.ts`) is the Monitor's one-session gate, now shared by both tables.

### Stage 10ic — WHICH DEMAT HOLDS A FUND POSITION, ON THE DRILL-DOWN

- Asked on the call: a fund position in the family's own name read "via own account" on its drill-down and never said which demat holds the units. `Account.demat` (generated, `scripts/lib/dematAccounts.mjs`) now carries the depository, DP ID and Client ID each account's own statements print, read off the archived page text in five declared layouts: NSDL/CDSL header pairs, the CDSL 16-digit BO ID (DP ID ‖ Client ID), Motilal Oswal's and 3P's demat tables, and NSDL's `DP: NAME [IN……]` header. A DP ID must have NSDL's `IN`+6 or CDSL's 8-digit shape; a depository's own statement must tie its Client ID / BO ID to the account number. The newest statement that names one is the record; an older disagreeing one would be noted, and none disagrees.
- All 12 depository accounts read their own; 13 fund accounts' statements name the demat their units are credited to (Sky Capital ×4, ASK ×2, Baring, Carnelian Bharat Amritkaal, 3P, Motilal Oswal Founders ×2, Delphi, Hedged Equity), and every one that is a book demat belongs to the same owner. The participant is named by the book's own statement for that DP ID. The review's buckets carry none.
- `components/DematLine.tsx` draws it under "Managed by · held via" on every measured and recorded row: `CDSL demat · DP ID · Client ID`, then the participant and the holder. An own-account or fund row whose statements print none — the Nifty 100 Low Volatility 30 ETF FOF from the call sits in ICICI Prudential folios 36378950 (Ajay) and 36379637 (Bharat), whose statements print no DP ID — shows `A/c <no> · Demat —` with the reason as its hover, never a guessed demat. Mandate rows draw nothing new.
- Checks: `dematAccounts.test.mjs` (layouts, newest-wins, and the committed book), and `check:pages` routes `stock-demat` / `stock-demat-folio` (chosen off the book) plus `stock`, struck on `data-demat` / `data-demat-holder`. `stock`'s "page does not scroll" and "table fits its card" findings predate this (Aditya Birla Capital has no demat line).

### Stage 10id — HIGHLIGHT FUND UNITS IN THE PRINTED TOTAL HOLDING COLUMN

- ICICI Liquid's demat statement repeats its exact units in Free Balance and Total Holding, so the source reader previously refused the duplicate as ambiguous. Resolve quantity citations using the nearest printed ISIN table header, its explicit Total Holding column and the exact security row. Unclear headers, repeated rows, combined text runs and other metrics still abstain; transaction closing-balance matching stays unchanged.
- Add coordinate regressions for the actual statement layout and browser checks against the published ICICI, Invesco and Kotak rows. Require one yellow mark in Total Holding on the correct row, the original PDF, and working return navigation. The original matcher reproduces all three failures on the actual PDF text; the fix selects their printed totals. No holdings, balances or financial calculations change.

### Stage 10ie — RECOGNISE EXISTING STATEMENTS WITHOUT WAITING FOR ANALYSIS

- The family's renamed Bandhan PDF waited over three minutes for a runner, only to be recognised as an exact duplicate. Publish the original Git content address alongside each statement file; the upload Function matches the staged blob to this deployment's manifest and file index. Only fully read, available originals qualify, including every part of a bundled source.
- A duplicate completes in the commit response, retains a durable receipt pointing to the original documents and starts no workflow. Mixed batches queue only new files. Read-only inbox responses also reconcile older pending copies against the exact published originals without changing production runs or records. Missing evidence falls back to normal analysis.
- Cover renamed copies, mixed batches, durable receipts, read-only reconciliation, unread bundle parts, incorrect sizes and unavailable assets. The local end-to-end rehearsal requires the green duplicate tick without an analysis worker or a second publication. Source figures, identities and publication gates are unchanged; genuinely new statements still require the existing validated background pipeline.

### Stage 10if — PREPARE RAPID NEW STATEMENTS AS ONE VERIFIED DASHBOARD VERSION

- Separate routine PDF/Excel ingestion from application deployment, reusing the coordinate readers, saved password vault, exact-witness backfills, reconciliation, publication assessment and canonical builder. Cache evidence fingerprints only within an immutable candidate; preserve the CLI's byte-identical book. Keep originals, encrypted previews, receipts and version history in GitHub, with atomic publication and serialized claims.
- Bootstrap every canonical book collection before financial modules initialize. Pin ledgers, exports, audits, source previews and stock exposure to that version. Preserve new statements across code deployments; refuse conflicting static copies and cross-reader reporting. Restore pending claims after compute restarts, and prevent the legacy worker from taking them. Scans, ZIPs and large batches retain the full reader. Preserve main's subsequent portfolio correction (#263), including its removed collection.
- The real protected Bandhan statement is absent from the isolated baseline before upload. The browser replay reaches Ready in 4.9 seconds and checks all 38 current collections, five reporting projections, 12 routes, original bytes, passwordless previews, duplicate no-ops and a code deployment. The production Node image at one CPU processes the new statement in 1.6–2.4 seconds; these measurements exclude production network latency.
- The private Cloudflare processor and its deployment workflow remain disabled pending explicit production activation approval. Merging the code does not create the service, configure credentials or bindings, initialize production publication data, or upload a production statement. `docs/RAPID-STATEMENTS.md` records the boundaries, cost model and activation steps.

### Stage 10ig — REAL ESTATE: BULK ENTRY BY EXCEL TEMPLATE, AND AN EMI FIELD

- *"Excel template download / upload for bulk property entry … the same fields as the Add Property form (type, status, address, country, area, cost, current value, owners and %, loan outstanding, EMI, rent, lease, earmark) … Single add / edit stays."* Real Estate gains **Bulk entry** beside Add property. `shared/propertySheet.mjs` is the one definition of the workbook: a Properties sheet with every form field (owner / share pairs, tax basis, dated improvement pairs, earmark, map pin), a How to fill sheet, and a Lists sheet behind every dropdown, family members included. "Download with N current properties" fills the rows the member selection shows, each with its Property ID and Last saved, so a row edits that property.
- The upload reads every row before saving any. A blank cell is not entered and a typed 0 is a measured zero; rupees must be plain numbers ("2 Cr" is refused with its row and column, never guessed); dates read as Excel dates or DD/MM/YYYY; any problem row, renamed column or non-.xlsx file blocks the whole file. The review lists each row as New, Update (with what changed), Unchanged or Problem. Repeating a saved property, a stale downloaded row and an unknown Property ID are refused.
- The save (`op: "saveMany"` on `/api/real-estate`) stores every row or none in one store commit; each row carries the `updatedAt` it was read against, held with the store's `expect()` through the commit's retry, so another person's save landing meanwhile refuses the file (409). Saved rows are published into the table-inputs snapshot (`publishPropertyChanges`), so the table, tiles and map show them at once.
- The form had no EMI: `monthlyEmi` is a money field beside the loan, scaled by the owners' share, never netted out of rent. It is a table column, an optional tile, in the property detail, and an inline number input with the loan.
- `npm run test:real-estate` runs `scripts/dev/test-real-estate-bulk.mjs` (16 checks, real .xlsx round trips; the concurrent-save check was proved by removing the `expect()` call). `scripts/dev/check-real-estate-bulk.mjs` drives the whole flow in a browser against the real handlers, with the page reading the table-inputs snapshot as in production; CI runs it.

### Stage 10ih — GITHUB-ONLY STATEMENT PROCESSING ON FREE RUNNERS

- Keep the existing free Pages hosting. Replace the disabled paid container proposal with standard GitHub Actions processing and GitHub-only originals, encrypted previews, snapshots and complete materialized reporting views. Remove the private service, deployment workflow, configuration and credentials.
- Publish one non-force Git pack using a separate index; advance the pointer only with every view present. Preserve immutable history, duplicate no-ops, saved-password reading, financial proof gates, interrupted-job recovery and the scan/ZIP full reader. Data commits use the Pages skip prefix so routine uploads need no app rebuild or deployment.
- Authenticated delivery streams bounded prepared GitHub files. An open compiled dashboard discovers the first data publication. Revision-pinned protected previews use the existing cookie's actual path; no global-cookie test shortcut. Queue/startup time remains additional to processing time and is never advertised as a universal few-second guarantee.
- Local/CI verification uses an isolated Git remote and a real protected PDF absent from its baseline, complete collection/report comparisons, browser routes, original bytes, preview, duplicate and code-migration checks. No agent uploads, data initialization or manual service deployment occurs in production.
- CI exposed redundant per-stock archive/settlement preparation. Batch those inputs within one publication, preserving the scalar ledger calculation and existing financial regression checks. Keep code-update browser verification on a clean page while the original page independently discovers the new version.
- Production sign-in returned a free-host resource-limit error during verification. Derive the same 100,000-iteration preview key in browser WebCrypto, then verify the password on the server before provisioning cookies. Preserve ciphertext, saved keys, HttpOnly/path isolation and old-client fallback; tests prove a supplied key cannot authenticate and the server skips the expensive KDF for the current form.

### Stage 10ii — REAL ESTATE: NO "SAVED FOR EVERYONE" LINE IN THE TILE PICKER

- The family asked (28 Oct 2026) for the "Saved for everyone — the dashboard opens this way on any device." line gone from the Real Estate tab.
- `SelectableTiles` takes `showSavedWhere` (default `true`); Real Estate passes `false`, so its picker and add menus render no `[data-tile-saved-where]`. Private Market and Morning CIO keep the line and its checks.

### Stage 10ij — SECTOR COMPOSITION: AN OPENED SECTOR HAS NO EXCEL BAR, AND ITS ISSUERS CARRY A RETURN

- The family (28 Oct 2026): the Export Excel / Edit numbers / Upload Excel bar inside an opened sector "doesn't make sense", and the issuer table should show Return next to % of sector.
- Both nested tables (Consolidated issuers, Direct Equity holdings) pass `controlsHost={null}`: no bar, but they stay `data-table-export` so the Sector table's own Export Excel still carries them.
- Consolidated issuer rows gain a `return` column (`issuerReturn`): FIFO over that issuer's own holdings that report a cost, as `rollSectors` strikes a sector; an issuer held only through funds is `—` with its reason. The hover is `SectorReturnDetails` (`noun="issuer"`); the footer cell is the sector's own return, so it ties to the sector row.
- `ONLY=sectors check:pages`: the same 9 failures as main, none new.

### Stage 10ik — RETURNS: AN ACCOUNT OPENS INTO ITS HOLDINGS; ALL SECURITIES IS THE FIRST TAB

- The family (28 Oct 2026): *"earlier these returns table like Portfolio monitor was actually showing individual names … now it is showing the account holdings"*, and *"put all securities as the first tab"*. Since Stage 10gh a segment opened into accounts only, so no security was named under Category, Asset class, Basket or Listed / Private.
- `selectedSegmentReturns` gives each account child its holdings (`holdingLines`), one per security key, named by `securityLabel` and sorted by value. A holding takes only units that are its own (assumed holdings, purchase-cost lines, review holder rows); holding units with nothing current behind them are one "Sold or exited holdings" row, so the holdings' gains add to the account's. A whole-account record (`key === accountId`) stays on the account row; each holding is `—` naming it, never a share of its gain. All Securities rows are one security already and do not open further.
- `SegmentReturns` draws the third level (`data-seg-holding`, `data-seg-holding-of`); account rows carry a chevron, `data-seg-value` / `data-seg-gain` / `data-seg-whole`, and Expand all opens both levels. Children and holdings follow the table's sort.
- `SEGMENT_AXES` / `SEGMENT_VIEWS` put All Securities first, so it is the param-free default; `?seg=category` still lands on Category.
- Checks: `selectedSegmentReturns.test.ts` (whole-account dashes, per-holding gains with an exit, every period × axis on the archive); `check:pages` `SEG_AXES` order and default, and route `cio-returns-category` with `CIO_SEGMENT_HOLDINGS` (opens a segment and an account; names, values and gains add).

### Stage 10il — HOLDING PAGE: THE TOTALS STAY PINNED WHILE THE ROWS SCROLL

- The family asked (28 Oct 2026) to *"freeze the last rows in the table so that, as I scroll the table, they are always visible"* on a holding's Position by account table.
- Its `<tfoot>` (`data-held-foot-pinned`) is `sticky bottom-0` on an opaque card surface, inside the table's own scroll box that already pins the header; the Total, Inside your mutual funds and Total exposure lines stay in view with every column.
- That box alone was 36rem, taller than the panel on a laptop window, so the pinned footer sat below the fold (Codex review). On the Position tab the panel, section and card are now a desktop flex column (`min-h-0`, the Polycab card's shape): the box shrinks to the visible panel before the panel scrolls.
- `check:pages` (`heldChecks`): the `heldTable` probe's `pin` resizes to a real `HELD_PIN_H` (640px) window, puts the panel and box at their top, and requires the sticky footer inside the panel. It fails on main and on the first, box-only fix (`stock-held`, `stock-held-funds`, `stock-funds-only`) and passes now; the other light-mode findings on those routes and on `stock` are on main too.

### Stage 10im — PORTFOLIO LIBRARY: EVERY STATEMENT, ONE FOLDER PER STOCK

- The family (28 Oct 2026): a Portfolio Library tab under the Statement Library that files the same statements by stock name, view-only (uploads stay in the Statement Library); Admin now reads Statement Library → Portfolio Library → Data Audit (`src/lib/nav.ts`).
- `/portfolios` (`src/pages/PortfolioLibrary.tsx`) reads the same manifest plus a new read model, `statement-securities.json`: `deriveStatementSecurities` in `ledgerModel.ts` lists, per `securityKey`, every document carrying a holding, trade, realised lot, open lot or income row for it. Cash lines (Cash class, or a provider sector resolving to Cash) and ASK's "Equity Dividend Income" bucket (`isIncomeBucket`, shared with `consolidatedSheet.ts`) are out; the Polycab ring-fence is applied on the build server by key and ISIN. Built by `build:views` and, for published versions, by `rapid-processor.mjs` / `publication-views.mjs`. 493 folders on this book.
- Grid, status pill and folder tile moved to `src/components/LibraryFolder.tsx` and are shared with the Statement Library. An opened folder lists each format's files with a Provider column linking to that provider's Statement Library folder; rows open the same preview.
- `ExportableTable` takes `viewOnly`: Export Excel stays and exports the table alone (no input sheets); Edit numbers / All inputs / Upload Excel are not offered. `stockKeys` now include `openLots`, so every folder's `/stock/` link has a ledger.
- `check:pages` routes `portfolios` and `portfolios-folder` re-derive the folders off `public/audit` (`PORTFOLIO_BOOK`): tile set and counts, the largest folder's exact documents, no upload control. `statements-folder`'s "an opened folder carries no upload of its own" fails on main too; left alone.

### Stage 10in — STOCK PAGE: PRICE & RETURNS AND RESEARCH LOAD AHEAD

- The family asked (28 Oct 2026) for a stock's Price & returns and Research tabs to load much faster. Both fetched only on click, from cold, every visit.
- `PrefetchStockTabs` in `StockInfo.tsx` asks for the price history and the Financials document as a company page opens; once Research is open, `ResearchPanel` asks for every other sub-tab, the ratio table and insider deals. All go through the shared requests the panels make, so nothing is fetched twice and a click finds its answer ready (`settledPriceHistory`, `settledResearch` draw it on the first paint).
- `src/lib/stockPageStore.ts` keeps each answer in this browser (IndexedDB) with the time the service fetched it upstream (`fetchedAt`, now on `/api/prices` and `/api/research`), and reuses it only inside the edge cache's own window: 6 h for prices, 12 h for research. Benchmarks do not use it.
- `/api/research` and the ratio table cache one entry per company (`v2`). The shared entry was read whole for one company and dropped a company whenever two were fetched at once; `stockTabsAhead.test.ts` reproduces that loss on the old code.
- A page left open keeps nothing longer in memory than in the store: a price history expires with its window, and insider deals are keyed by the UTC day as `/api/insider` keys them, and research is held no later than the service's twelve-hour cutoff. `/api/prices` is keyed `v3`, so no edge copy without `fetchedAt` is served (Codex review on #270).
- Measured in the browser with a 3 s mock service: Price & returns 133 ms and Research 93 ms after the click (was 3 s+), each sub-tab under 100 ms, and a later visit makes no price or Financials request.

### Stage 10io — PRIVATE MARKET: ENTER COMMITMENTS PER FOLIO, OR BY EXCEL

- The family (28 Oct 2026): *"Capital commitment and yet-to-be-drawn capital per fund — Gaurav to enter"*, in the Private Market table or by Excel. Edit numbers already took both, one cell and one Save at a time, inside each fund's folios; nothing had been saved through it.
- `Enter commitments` (`src/components/CommitmentEntry.tsx`, beside Upload Excel through `ExportableTable`'s new `inputControls`) lists one row per folio, funds first, with Committed and Still to call and one Save for the lot. A fund held by three members is three rows: a figure for the whole fund would have to be split, and nobody supplied that split.
- Each row is the record that folio's own cells edit (`commitmentRecordId`, `src/lib/commitmentEntry.ts`): the capital account's where a statement sends one, the holding's `private-capital` record otherwise. Saving uses the same store, checks and Restore-original rule as Edit numbers, so the table, the Still to call tile and every export read the figure back. Typed amounts take `2.5 Cr` / `40 lakh`. Blank means not known, never zero.
- `Download Excel` writes only the listed rows' two columns (`createCommitmentWorkbook`, the table inputs' own workbook format). `Upload Excel` in the dialog or above the table reads it with the same refusals. `commitmentEntry.test.ts` covers the rows, the parsing, the rollup and the Excel round trip, and `check-table-inputs.mjs` drives the dialog end to end.

### Stage 10ip — REAL ESTATE: TAX ON SALE IN FIVE PLAIN RULES, SHOWN ON THE PAGE

*"I'm confused by this improvement section, what is the use of it. Please make sure to keep all the tax related calculations very simple and i need to clearly see taxation part on the real estate page."* — the family, 28 Oct 2026.
- `shared/propertyTax.mjs` is now five rules: gain = current value − cost (an inheritance or gift takes the previous owner's cost and every date; before 1 Apr 2001 the higher value on that date); held 2 years or less is the slab rate (—); over 2 years 12.5%; bought before 23 Jul 2024 by a resident individual or HUF, 20% after indexation where lower; plus 4% cess. Per owner, then added, as in Stage 10hj.
- Removed: dated improvements (field, form rows, Excel columns — no saved property had one; an old template's Improvement columns are ignored with a note, and the hover names renovation costs as not included), the property-type gate (every property here is land or a building), and the open question on an inheritance received after 23 Jul 2024 (the previous owner's date decides, as it does for holding and indexation). A blank acquisition is taxed as the purchase its "Purchase cost" and "Purchase date" fields were entered as. Every missing input is named at once ("Needs purchase cost, purchase date"), not the first only.
- Page: a "Tax if sold today" card under Properties, one row per property that reads across — Holding · Cost for tax (indexed where the 20% route wins) · Current value · Taxable gain · Rate · Tax on sale (incl. 4% cess) · Value after tax — with totals and coverage, a one-line rate key (`data-prose-ok`), and a "Needs …" button that opens the form. The optional Holding and Indexed cost columns left the main table; Est. tax on sale and Value after tax stay. The editor's "Tax basis" section is "Tax on sale" and appears only for an inheritance or gift, a pre-2001 holding or land.
- Tests: `test-property-tax.mjs` (21 checks, each settled figure tied across the row), `test-real-estate-bulk.mjs` and both browser checks updated.

### Stage 10iq — PDF PREVIEW: A PAGE IN VIEW IS ALWAYS DRAWN, AND ITS CHECK STOPS FLAKING

- `check-pdf-preview.mjs` failed three times on 28 Oct 2026 on PRs that did not touch the reader (#266, #271), each passing on re-run. Two were `IndexSizeError` in `ink()`: after a resize or zoom the reader swaps the page's canvas and drops the old one (width 0), and the check read pixels through a handle taken a moment earlier.
- The third was the reader. Its CI screenshot shows page 2 empty (no canvas, no "Loading") with page 3 drawn. Each page's `IntersectionObserver` callback read only the FIRST entry; a busy main thread can deliver "left the range" and "back again" for one page in one callback (seen in Chrome on demand), so the page kept the stale "not nearby" and was never drawn. `PdfPage` now reads the newest entry.
- `ink(n)` polls in the page (`waitForFunction`, 100 ms, 30 s) until exactly one `canvas[data-pdf-page=n]` has a non-zero size and the same ink threshold; on timeout it fails naming the last canvas state, so a blank page still fails.
- The check's init script can hold observer deliveries and release them as one batch. After the mobile resize it sends "far away, then back" for the first pages and requires page 3 to draw: 4 of 4 runs fail on the old reader (page 3 blank, as in CI) and pass with the fix. Skipping the render call fails `ink(1)` with a blank canvas.
- Measured locally: the old check failed 2 of 8 runs (`IndexSizeError`); the new one passed 12 of 12 in a row and 12 of 12 more with four runs in parallel.

### Stage 10ir — PRIVATE MARKET: CAPITAL CELLS TYPE IN PLACE, LIKE STRATEGY AND DESCRIPTION

- The family (28 Oct 2026), on 10io's dialog: *"remove this enter commitments part, make the other relevant cells still to call, called, paid in, etc individual cells editable just like the description and strategy cells. In the same format"*. The button, dialog and its Excel template (`CommitmentEntry`, `commitmentExcel`, `ExportableTable`'s `inputControls`) are gone.
- Committed, Called, Paid in and Still to call are now always-open boxes (`src/components/CapitalCellInput.tsx`), in `ProfileCellInput`'s format: the figure as the table prints it, the exact rupees on focus, and Save / Cancel once it changes. Enter saves and Escape cancels. A typed figure shows in champagne with "Remove typed figure". Amounts take `2.5 Cr` / `40 lakh`; blank is not known, never zero. A statement's commitment can be corrected, never blanked.
- Only a row that is ONE folio types: a folio line, or a fund row with a single folio. A row over several folios stays their calculated sum. Its record is the one `<Tr>` tags for Edit numbers and Excel (`capitalRecordId`, `src/lib/capitalEntry.ts`), so a figure typed in place, in Edit numbers or in an uploaded Excel is one saved figure. Exports still print the figure, and Edit numbers still swaps in its own editor. `<Tr>` adds no "Edited" tag to a cell marked `data-cell-editor`.
- `capitalEntry.test.ts` (89 folios typed into, 2 income-only views read-only; typed figures reach `figuresOf`) and `check-table-inputs.mjs` (type, save, refuse words, export, upload, remove) cover it. `check:pages ONLY=private-market,private-market-tiles` shows main's same seven findings.

### Stage 10is — REAL ESTATE: THE TAX COLUMNS EXPLAIN THEMSELVES; NO SEPARATE TAX SECTION

*"we did not have to create a separate section for tax, we already show the tax columns in the main table, just make the tax columns on the main table show a pop up section after we click on it to see the explanation of tax calculation on the holdings."* — the family, 28 Oct 2026.
- The "Tax if sold today" card of Stage 10ip is gone. Est. tax on sale and Value after tax in the Properties table are each a `ReturnCalculationInfo` trigger (`PropertyTaxInfo`, `src/components/PropertyTax.tsx`): the click opens the working for the share the cell shows — holding, current value − cost (indexed where 20% wins) = taxable gain, which rate and why (both rates where bought before 23 Jul 2024), gain × rate + 4% cess = tax, value − tax = value after tax — in whole rupees that add up to the cell. A mixed route shows each owner's sum. The five rules sit under "The rules".
- A cell that cannot be worked out yet opens the same popup, names every input still to enter and offers Enter details, which closes it and opens the form (`ReturnCalculationInfo` children may be a function given `close`).
- `check-real-estate.mjs` opens the popup for an inherited property and reads each step's figures, the value-after-tax result, the missing-input path and the unregistered-owner reason.

### Stage 10it — NUMBER INPUTS ONLY ON PORTFOLIO MONITOR, PRIVATE MARKET AND REAL ESTATE

*"This upload or edit numbers only need to be in portfolio monitor and private market and real estate no where else … Morning CIO is a view for the user, not an edit place"* — the family, 28 Oct 2026 (Daily Movers, Return attribution, Sector Composition, Allocation & Risk named).
- `ExportableTable`'s inputs are now opt-in: `editable` replaces `viewOnly`. Only the Portfolio Monitor holdings table, Private Market's book and Transactions tables and the Real Estate properties table take it. Every other table keeps Export Excel alone, exports the table without input sheets, and its workbook's About sheet names the three pages where numbers are edited. Stage 10hf's "every table" no longer holds.
- `scripts/dev/check-table-inputs.mjs`: the stale-upload check runs on `/monitor` before leaving it; `/sectors` and `/cio?tab=allocation` assert Export Excel with no Edit numbers, All inputs or Upload Excel, and a view-only export carries no input sheets.

### Stage 10iu — PORTFOLIO LIBRARY: FILTER FOLDERS BY CATEGORY

- The family (28 Oct 2026): filter the Portfolio Library by the Portfolio Monitor's categories — All, Direct Equity, PMS mandates, ETF, Mutual Fund, AIF, Bond, Unlisted, Private investments at cost, Cash.
- `deriveStatementSecurities` (`src/lib/ledgerModel.ts`) now gives each folder its `categories`, decided by `holdingBucket`: the book's positions for a security it holds, plus every statement row's printed class and its account's engagement (so an exited holding is still placed). A security the book holds at cost is at cost on every row. "Not classified by the statement" / "how it is held is not stated" are kept only when nothing else places a folder. A folder can sit in several (Ather Energy: Direct Equity and PMS mandates).
- Page: a tab row under the search, in the Monitor's order with a count per tab (counted on the searched set); the tab is in the address (`?category=`), kept when a folder opens and on Back. The opened folder names its categories. On this book: PMS mandates 256, Direct Equity 63, Not classified 62, AIF 36, Mutual Fund 29, Cash 24, at cost 20, Unlisted 12, ETF 2 (no Bond row is named by a statement).
- Checks: `portfolios` — every folder has a category and each tab counts the folders carrying it; new route `portfolios-category` — the PMS mandates tab shows exactly the folders a PMS account's statement names (re-derived off the archive). Both proven by breaking them.

### Stage 10iv — OUR BOOK VS BENCHMARK: EVERY BENCHMARK ON ONE CHART, FROM A DAY THE BOOK WAS VALUED

*"Can you audit check and fix if this view in all tabs is even correct and taking in all data before showing me how the book is also can you make it more simple to compare on the same graph across all benchmarks no verbose"* — the family, 28 Oct 2026.
- **Audit.** (1) The solid book line was one point: it began when every valued investment is in the return, and Bandhan 8652064 (₹41.5 Cr, no 31 Mar value, "opening valuation and complete dated cash flows are missing") is first valued on 26 Oct, the series' last day. The chart was the pale "still joining" line end to end; the dashed NAV line and its toggle were a single point; no book return was stated. Main's own `cio-nav` checks were failing on it. (2) Rolling periods set old values against new prices: nothing in the 31 Mar panel was revalued in April, so "6M" from 26 Apr opened the book on 31 Mar values and the Nifty 500 after a ~10% rally (book +5.3% vs −4.3%). 3M and 6M were rebased at 31 Mar, not at their start; 1Y–Max drew months of index with no book; the index ran past the book's last valuation.
- **What the line covers** (unchanged, now on the card): 52 of 128 investments, ₹760.5 Cr of the ₹901.2 Cr NAV; 76 review lines held at cost (₹140.7 Cr) are out; 25 join on a first valuation (30 Apr – 26 Oct). ₹374.3 Cr of it was last valued more than three months before 26 Oct (Sanshi ×5 at 30 Jun, the ICICI demat at 31 Mar, Zepto at Jul 2025 …), carried flat. Live-only depository shares and funds are not in the statement series.
- **Card.** "Our book vs benchmarks": the book and all seven benchmarks on one chart, each its % change since one start day to the book's latest valuation (`benchCompare.ts`, `changeSince`). One chip per line with its return; a benchmark's chip hides or shows its line, colour fixed per index (`--chart-bench-1…7`, validated with the book's gold). The book is one line, time-weighted over each link's own investments, chip "available data"; its hover names what is in, what joined late, what is at cost, money in/out over the window, stale value and any unproven move. The fold's summary adds the value not revalued in 3 months.
- **Start days.** A comparison starts only on a day the book was valued (`comparableStarts`, `bookNav.ts`): at most 5% of the return's value carried from a valuation over 7 days old and valued again later, and 30+ days to the end. Today only 31 Mar 2026 qualifies (30 Jun 21%, 30 Sep 11%), so no period control is drawn; later start days appear as statements arrive. Old `?bench=` links show the same chart.
- **Checks.** `test:family` suite `book against every benchmark` (one start/end, start days on a constructed book and the real one, colours). `check:pages` re-derives start days off the series' units (`NAV_FAIR_STARTS`) and strikes the book chip's return against the link chain from the window's start, each benchmark's against its fixture ramp over the same dates, one book line through every point, no line past the book's end, the wrong-index chip, offline chips, and hide/show. On `cio-nav*` and `performance` the remaining findings are main's (DL-11, scroll region, MNT-4/25's current value, Performance's own).

### Stage 10iw — MOPWM'S LATER SHARE TRADES CARRY THE MOTILAL DEMATS FORWARD

- The family, 28 Oct 2026, on MOPWM's 23 Oct transaction report (already read since Stage 10hu): *"Apply share trades only."* Its NSE/BSE share trades after each 31 Jul Motilal demat statement now carry those balances forward. No fund row moves a quantity: the 1 Oct ₹214.68 Cr "redemptions" are at least partly rematerialisations and wait for the family's answer.
- `rollMopwmShareTrades` (`scripts/lib/mopwmTransactions.mjs`) checks five things. Every row for the security is an exchange trade. An exact alias pins it to one ISIN. It lands on one of the owner's Motilal demats. The report replayed from its first row holds exactly the statement's units on the statement's date. No sale takes units the record does not hold. Cost and realised are FIFO over that record. Emitted as `BOOK_SHARE_ROLLS`, with every refusal named in BOOK-REPORT.
- Eight rolls. Ajay's 539150 sold IFB 15,772 and NLC 32,000 to nil, and bought KRBL 67,500, Tega 24,250 and Zota 27,500. Ankita's 838316 sold Axis 7,300, ICICI Bank 14,500 and SBI 27,750 to nil on 23 Sep. Not applied: TAAL (its 22 Sep 1:5 split is a SPLIT entry, not a trade), Manorama (a 2024 split), and Birla Cable, Man Industries, Tech Mahindra and Zaggle, sales of balances no statement in the book records on Ajay's demat.
- Live basis only (`withShareRolls`, `depositoryShares.ts`). A balance sold to nil is no candidate. A share bought since is an `adviser-trades` candidate at the roll's units and the report's cost, priced only while the feed and the corporate-action gate allow. Account notes, the units sentence and Family & Entities name sold balances as not held, never as "held, not valued". The statement basis keeps the 31 Jul snapshot.
- `build-upstox-instruments` reads the rolls: KRBL and Zota gain NSE identities. Its refresh also picks up NSE's rename of ICICI Pru Life to ICICILIFE, the same ISIN, a look-through company only.
- Tests: `mopwmTransactions.test.mjs` (each gate, the committed rolls) and `shareRolls.test.ts` (sold, bought, priced at the roll, notes). `fundNavs` / `recoveredCosts` counts move by the five sold candidates (22 → 17 recovered-cost candidates).

### Stage 10ix — SECTOR COMPOSITION: ITS NINE FAILING CHECKS, FIXED AT THEIR CAUSES

- The family (28 Oct 2026): "fix the 9 failing checks on sector composition". `ONLY=sectors check:pages` failed nine invariants on main; three causes, none a wrong figure on the dashboard.
- **The checker double-counted ₹43 Cr.** Its `withDepositoryFunds` re-expression still valued Ajay's Motilal demat balances of Bandhan Arbitrage (₹12.85 Cr) and Large & Mid Cap (₹30.17 Cr), which the Bandhan folio's 26 Oct statement superseded (rematerialised 7 Oct, Stage 10hm, `shared/custodySuccessors.mjs`). The page was right. `custodySucceeded` re-expresses the rule off the book's `custodyPredecessors` / `custodyEvidence` in both depository re-derivations. That fixed five checks: security axis, book rebuild, FS-13 tiers, FS-15 derived hover, "Not on this page".
- **The page scrolled 46px.** `EnteredNumbersNotice` sat inside `<main>`, above pages that are `h-full` of it, so any notice (saved edits, or the store unreachable) pushed Sector Composition, Morning CIO and Portfolio Monitor down. It now sits above `<main>`, like the index strip. That fixed the two layout checks, and Morning CIO drops from 8 failures to 1 (DL-11, also on main).
- **Unclassified's "—" is right.** Yash Highvoltage's cost is known but its sale proceeds are unverified (`hprUnavailableReason`), which withholds the pooled return. The return cell now names such holdings (`data-return-withheld`), and the two return checks accept that dash only where every named key carries the reason in `glowData.ts`.
- `ONLY=sectors,sectors-direct,sectors-direct-live,sectors-compare` all pass; `monitor` fails exactly as on main.

### Stage 10iy — PORTFOLIO LIBRARY: ONE FOLDER PER SECURITY, BY ISIN

- The family (28 Oct 2026): merge the duplicate folders. The Motilal Oswal CDSL transaction list prints `AXIS BANK LIMITED # NEW EQUITY SHARES…` and `HDFC AMC LTD#HDFC MF-…`, which keyed apart from the holding statements' `Axis Bank` / `HDFC BAF D GROW`, so one security stood as two folders, the depository's under "Not classified".
- `deriveStatementSecurities` (`src/lib/ledgerModel.ts`) files keys printed with the same ISIN in one folder: the book's own key for that ISIN (`bookKeyForShare`, the join that already files these depository lines under the book's company), else the one key a holding statement prints, else the key most statements name. A key printing two ISINs stays put. The merged keys are the folder's `aliases`, so an old `?stock=` link opens the merged folder. Nothing moves in the archive or the book. Depository transaction names are read with `displayDepositoryName` ("Balaji Amines Limited").
- On this book: 493 → 437 folders, 56 keys into 51 folders; "Not classified" 62 → 19, each now the only folder for its ISIN. Left apart, because no statement prints a shared ISIN (the fund's own statement prints none): 3P B1 and B2, Buoyant A1 and A4, Neo Infra A5, 360 ONE Special Opportunities A3, Vedanta Iron and Steel.
- Checks: `portfolios` — every statement's key in exactly one folder, same-ISIN keys together, a folder takes a key no row prints only when it is the book's, each folder counting its statements; `portfolios-folder` — the opened folder lists every statement naming any of its keys; `portfolios-category` re-struck on folder keys. Both new claims fail with the merge switched off.

### Stage 10iz — THE BOOK LINE VALUES THE DEMATS' LISTED SHARES AT EVERY PUBLISHED CLOSE

*"mark listed demat holdings at historical prices in the book line"* — the family, 28 Oct 2026.
- **Before:** the statement series held Ajay's ICICI NSDL demat flat at its 31 Mar value for seven months, and left out the demats that print quantities only (Bharat's HDFC NSDL, the Motilal Oswal demats). The line sat at 0% through April while every index rallied.
- **Rule:** the family's assumed-continued-ownership rule (22 Oct), now one function, `assumedHolding` (`assumedHoldingReturns.ts`), read by the Returns tab and the NAV card. A listed share whose statement dates its balance, with no later trade, movement or capital record, is valued at each split-adjusted published close from that date. Checked splits are applied, and gross dividends are paid out on their ex-dates.
- **Series** (`assumedBookNav.ts`): a demat is its assumed shares at each close, plus its other holdings at their statement values. The statement day is valued at its own close: the ICICI statement values five new listings above any close they traded at (Clean Max ₹1,336.50 against a ₹901.10 high), worth ₹11 Cr. A quantity-only demat becomes its own investment and joins on its statement date. A newer valuation of the account wins. A start day needs 28 days since the last (`comparableStarts`), so daily closes do not turn 1–7 Apr into new periods.
- **Real prices, 28 Oct:** 35 holdings, ₹85.3 Cr, valued (ICICI ×5, LKP ×2, HDFC 22025655 ×12, Motilal ×16). The book reads +9.0% since 31 Mar, against +5.3% on statements alone. Twelve holdings stay at statement values (₹19.2 Cr: three ICICI listings with no history, Yash Highvoltage and five LKP shares with later trades). Nine are in neither line.
- **Card:** the line switches only once every demat history and the split/dividend capture are in. The book chip reads "available data · assumed holdings", and its hover names the owners ("No sale appears in the records we have…"). The fold lists every demat holding with its value or reason. The footer adds the step "from listed demat shares valued at published closes".
- **Review (Codex):** a demat's holdings left at statement values are an investment of their own (`|assumed` holds the priced shares), so they keep their statement date in the stale figure (₹328.8 Cr, not ₹309.5 Cr). An account that records money after its statement stays on the statement, so a daily mark never erases a flow and each dividend is counted once. A history that failed to load shows "Retry demat prices".
- **Checks:** `test:family` suite `demat shares at published closes in the book line` (constructed rules, and on the real book each demat's end value moving by exactly what its closes add). `scripts/dev/check-nav-assumed.mjs` in CI (fixture prices: switch, owners, fold, footer tie, statement fallback, retry). `check:pages` `cio-nav` asserts the statement fallback says why. The Returns tab's `check-assumed-holdings` still passes.
- **Also (main's red `build`):** Sector Composition held its page to the window height at every width. On a 390 px phone that squeezed the sector table to 21 px, so its rows could not be seen and `check-sector-return-details` timed out on main after #281 shortened `<main>`. The page is now window-high only from `lg`, as its own comment says (`flex flex-col lg:h-full`).

### Stage 10ja — SECTOR COMPOSITION: A PHONE'S STACKED CARDS ARE THE PAGE'S WIDTH

- After Stage 10iz made the page window-high only from `lg`, a 390 px phone still drew each stacked card as wide as its table (the sector card +676 px), so the page body carried the table's width instead of the table scrolling in its own box (Conventions: wide tables scroll inside their own container).
- `SectorComposition.tsx`: the grid below `lg` is one column the width of the page (`grid-cols-1`, `minmax(0, 1fr)`); `lg` keeps its two halves. Desktop is unchanged.
- Checks: `check-sector-return-details` passes on all four route/width cases; `check:pages ONLY=sectors,sectors-direct,sectors-compare` clean at 1500; at 390 the widest element is now the table inside its scroll box. Left alone: every page overflows 344 px at 390 from the top bar's controls, and `cio-sectors` DL-11 fails the same with or without this change.

### Stage 10jb — PORTFOLIO MONITOR: ITS FAILING CHECKS, FIXED AT THEIR CAUSES

- The family (28 Oct 2026): "fix the portfolio monitor failing checks too". `ONLY=monitor` failed 26 invariants on main and now fails none. Over 93 related routes, main failed 191 checks and this branch 106: 118 fixed, none new once run alone.
- **The checker read 50 rows.** Long tables load 50 at a time (`InfiniteTableBody`); `allTableRows()` still picked a "Rows per page" control that is gone. It now presses "Load more" in the DOM (no scroll) until every row is drawn.
- **Its live book lagged the app's.** Depository rows now take recovered costs (`BOOK_RECOVERED_COSTS`, re-expressed) and their purchase lots as dates. A ₹0, 0-unit fund is closed in the Cash model too. The Monitor's sector model gains the fund-filing tier (Kajaria Ceramics).
- **Unverified sale proceeds withhold a set's return and realised** (Yash Highvoltage; ICICI Pru Equity Savings on Ajay's demat). The footer's "—" cells carry `data-footer-return-withheld` / `data-realised-withheld`, and the checks accept them only with the book's own reasons in the hover. The Realised dash now names that cause, not "no capital gain statement".
- **Page:** the holdings table's Excel controls ride the section-tab row, beside the tablist and never in it (CI's dashboard-navigation check exercises every button in a tablist as a tab); "Keep Excel format; change numbers only." is the Upload button's hover; the saved-numbers notice rides the index strip's right end (about 46px back on every page); the asset-class Cash band's line is `data-prose-ok`. `schemeNames.json` is regenerated (49 schemes, none refused; the second tier follows its documented gate 1), so no fund spells out "Direct Plan Growth". The cost probes read the figure's hover, not the source-trace button's.
- Left as found (also red on main): the Cash/Liquidity heading's "credits the arbitrage funds … to the rupee" on Asset class and Basket (the check predates liquid funds the review does not name), and Transactions' "Purchased on" check.

### Stage 10jc — PORTFOLIO MONITOR: THE WHOLE BOOK'S RETURN LEAVES OUT TWO HOLDINGS AND NAMES THEM

- The family (29 Oct 2026), on the footer's "—": *"show the return for all other holdings and name the two it leaves out. very subtly like we always do"*.
- A holding whose sale proceeds are unverified (`hprUnavailableReason`: Yash Highvoltage; the ICICI Pru Equity Savings units on Ajay's demat) is left out of the Monitor's pooled return and of every Realised total (footer and sections), and named in their hovers. Only the figure is on the face (+12.04% over 369 of 454 holdings on 28 Oct). Invested and Unrealised keep both holdings: their cost and value are known. A section's return still needs near-full coverage, so Direct Equity and Mutual Fund name the left-out value in their "—". CLAUDE.md's rule now says so.
- `MONITOR_BASIS_BOOK` strikes the return over `returnCount`/`returnValue` and names `leftOut.reasons`. The 10jb withheld-dash branches are gone.
- Transactions' "Purchased on" check: a capital record with no purchase in it (Motilal Oswal MF 90414963315, a redemption only) owes a dash, never its outflow's date. The page was right.
- Private Market's fit check: 19 columns (Strategy, Description, a column per return measure) no longer fit 1,440px. The claim is now the Conventions' own: the table fits or scrolls inside its card, and the page never scrolls sideways.
- `ONLY=monitor,monitor-entity,monitor-security,monitor-txns,private-market` all pass. Morning CIO's Gain / Loss card (+17.2%, 342 holdings) is struck on the statement basis, without the 29 depository fund rows the Monitor's live book costs, so the two still differ.

### Stage 10jd — STATEMENT LIBRARY: RECENT STATEMENTS IS A SMALL TAB, CLOSED UNTIL ASKED FOR

- The family (29 Oct 2026), on the Recent statements table above the folders: *"these cant be hovering on top always it needs to be a drop down or a small tab"*.
- The main page's recent uploads are one button beside the filter (`data-recent-statements-toggle`, `aria-expanded`): the count, plus "in progress" / "needs attention" pills while closed. Clicking it opens the same table under the filter row, without its duplicate heading (`FormatBlock`'s `heading`).
- It opens itself only when a file is dropped on this page (a new `inbox.sending` row), so a fresh upload's progress stays in view. Its open state is a navigation value (`library-recent-open`), so the full reload a new publication makes (`refreshForPublication`) leaves it open; held in component state, that reload closed it and CI's `rapid-statements` never saw its upload turn Ready. An opened folder's own upload rows are unchanged.
- `check-statement-drop.mjs` asserts it is closed on arrival, opens on a root-page drop and stays open through a reload, and opens it before following a folder link; `check-statement-upload-e2e.mjs` opens it, if it is closed, before counting landed rows (a fresh load of `/statements` in the same browser tab restores the last choice, as the filter does). `check-statement-drop` and `ONLY=statements` pass; `statements-folder`'s "carries no upload of its own" is red on main too (the one upload panel now sits over every folder) and is left as found.

### Stage 10je — DATA AUDIT: TWO TABS, A CONSOLIDATED VIEW AND EVERY TRANSACTION

- The family (29 Oct 2026): *"All I need is just two tabs here: one is consolidated view, and the second is transaction level view. When I download the Excel, it should have both these tabs as sheets … the first column will of course be security … every single transaction absolutely listed since day one … newest on the top"*.
- `buildConsolidatedSheet` now emits only **Consolidated View** and **Transactions**; the 17-tab template (`consolidatedTemplate.json`) is retired. Full INR throughout.
- Consolidated View: one row per book position (plus unvalued custody units, review write-offs, and each account with no holding row, all named), 61 columns: security, ISIN, symbol, owner and entity type, account, provider, custodian, account type, family asset class / category / basket, instrument type, listed/private, SEBI AIF category, sector (normalised and printed), investment dates, quantity, cost held and sold, price, value, allocation, unrealised / realised / income, FIFO total gain and capital deployed, absolute return, XIRR (≥1 year), ST/LT cost, the fund commitment with DPI and TVPI (Stage 10fz's dated-payout rule kept), a count of the holding's transactions (linked to them), the counted flag and source document. The counted rows' value ties to `BOOK_SUMMARY.totalValue`.
- Transactions: trades, capital flows, income, corporate actions, and the sold and open tax lots, newest first. A tax lot carries no cash flow and a trade carries no realised gain (it is its lots'), so neither is counted twice. Polycab stays off both tabs.
- Review fixes: sold tax lots keep the statement's tax-effective cost; unvalued custody rows carry asset class / category / basket wherever the statement names the instrument (`CustodyAuditRow.assetClass`; depository rolls name none and stay blank); a linked number in the Excel (Transactions on file, quantity) is a `HYPERLINK` formula whose result is the number, so it still sorts and sums. An account-level capital record (a fund's payout or call with no security) joins the account's one holding where it holds exactly one, never a PMS mandate's (Neo Infra's 30 payouts). An exited security's records are classified from the class its statements state, in its own account (Bandhan Bank's lots), and a mandate account's every record files under PMS mandates (`holdingBucket`'s rule): uncategorised Transactions rows fall from 2,303 to 7.
- Checks: `consolidatedSheet.test.ts` rewritten (ties, ordering, no double count, typed Excel roundtrip, links land); `check:pages`' audit invariant expects 2 tabs; `check-consolidated-sheet.mjs` and the upload e2e read the new columns. `ONLY=audit` passes; `audit-short-rows` is red on main too and is left as found.

### Stage 10jf — RECOVERED LOTS REACH THE RETURN; RETURN COUNTS ARE OF REAL HOLDINGS

*"check why all the return columns are mostly empty, we have received most of the purchased amount and dates data already so why are we not showing returns."* — the family, 30 Oct 2026.
- All Securities measured on the statement book, 629 rows: 475 are companies reached only through funds, which can never carry a return, and the headers counted them. The other 154 had 153 HPRs, and under CAGR and XIRR 16 XIRR, 32 sub-year HPRs, 106 dashes.
- A cost-recovery replay kept each lot's date and amount but published only `heldPurchases` (first, last, count), so nine direct shares (₹63.8 Cr) showed dates and a cost and could not take a rate. `RecoveredHoldingCost.cashRecord` now carries every priced purchase, sale and dated receipt. `holdingFlowsOf` reads it as a third basis, behind the same account, ISIN and exact-unit gate as `investedOn`, and `holdingPeriodOf` dates YTD from it. The book gains only that field: no cost, value or HPR moved.
- Refused: an unverified sale (Yash Highvoltage), later sales needing a newer balance, a rolled-forward line, and a row whose only value is a live quote (the record would close on a date no statement reached).
- A holding's single purchase now takes the rate its flows solve to, closing on its statement's value and date, on CAGR and `auto` alike. Compounding the row's return mixed a live price with a statement-dated window.
- Headers count `measuredRows`, as the date column's footer already did: HPR 153 of 154, CAGR 3, XIRR 21, YTD 5. The hover names the fund-only rows.
- Still dashes, for want of source data: 95 share rows have an undated line, because most managers' trade records start on 1 Apr 2026 (Green Lantern's in Jan 2025) and their statements print no lots. YTD and CY need a value on 1 Jan or 31 Dec, which no statement in the book carries.
- Tests: `holdingFlows.test.ts` section 6 ties each record's cash to its FIFO cost and gain, and holds every refusal.

### Stage 10jg — OUR BOOK VS BENCHMARKS: THE BOOK AND THE NIFTY 500 UNTIL A CHIP ADDS ANOTHER

*"NAV chart: show only the book and Nifty 500 by default; other indices added by clicking"* — the family, 30 Oct 2026.
- `NavVsIndex` drew all seven benchmarks on first paint. It now draws the book and the Nifty 500 (`DEFAULT_SHOWN`); every other benchmark keeps its chip, colour and return, dimmed and unpressed, and a click adds its line. Morning CIO and Performance share the card, so both open this way.
- The state is the list shown (`nav-shown`), not the list hidden; an empty list is the book alone, which is why it no longer collapses to `null`.
- All seven histories still load on open, because every chip states its return.
- `check:pages`: the probe reads the first paint as `navChart.defaults`, adds one chip (`navChart.added`), turns the rest on for the per-line claims, then restores the default. Two new invariants hold the first paint and the click.

### Stage 10jh — NA WHERE A RETURN CANNOT APPLY, A DASH WHERE A RECORD IS MISSING

*"for holdings for which we cannot show holding CAGR or XIRR, because … they are held under 1 year, so you can just show NA … but for others we suppose have missing data, so it would be clear to distinguish between them."* — the family, 30 Oct 2026.
- `MeasuredReturn` gains `na`; `NotApplicableCell` (`Absent.tsx`) draws it, with the reason as its hover.
- NA: CAGR and XIRR under a year (hover names the held days and the HPR); CAGR bought on several dates or partly sold; a total loss's CAGR; CY on a holding opened this year; every measure on a fund-only company or a nil line.
- Still a dash: no dated record, no cost, no 1 January or year-end value, an uncounted purchase record, an unverified sale, an at-cost line.
- Supersedes Stage 10hk on the Monitor and the stock page only: under a year the CAGR and XIRR cells no longer repeat the HPR, which has its own column. `auto`, Excel, Private Market, Transactions and the Returns tab keep 10hk.
- `returnCoverage` counts `na`, `subYear` and `otherNa`; `staggered` counts only rows CAGR refuses for it. Headers state the split and what NA means.

### Stage 10ji — MORNING CIO: EVERY RETURN TILE AGAINST THE INDEX, ON THE SAME MONEY

- *"Versus benchmark return over the same period using the same methodology."* The Consolidated return, Gain / loss, financial-year, calendar-year and history tiles each carry a `vs Nifty 500` line with the lead in percentage points. The info card lists all seven benchmarks. `src/lib/cardBenchmark.ts`, `components/CardBenchmark.tsx`.
- Each rupee behind the tile buys the index on its own date and closes on its record's own date. Period tiles strike `measureWindow` over `pmeWindowRows` of the tile's own windows, so type, under-a-year rule and debt rule are the tile's.
- Since-investment tiles are gain ÷ money invested per holding, with no flows of their own. Each unit is dated from `holdingFlowsOf`, then its capital moves, then its allotments, and counts only where the money in ties to what it invested within 1% (`DATED_MONEY_TIE`). The rest leaves BOTH sides and is named in the info card, so the tile shows the book's figure on that money beside the index's. Measured 30 Oct: ₹579 Cr of ₹793 Cr dated, the book +15.8% (tile +17.2%) against Nifty 500 +1.6%; FYTD +17.6% against +9.1%.
- Price indices on statement dates; no live quote enters. No feed, a wrong-name answer or an index younger than the money renders `—` with the reason. The Nifty 500 loads with the tile; the other six load when the info card opens.
- `closeOnOrBefore` moved from `PortfolioReturns` to `lib/prices.ts`. Test `cardBenchmark.test.ts`; invariant on `cio`.

### Stage 10jk — MORNING CIO: THE TILE'S BENCHMARK LINE SHOWS ONE PORTFOLIO FIGURE

- *"Just simply write vs Nifty 500… why there are two no. for portfolio return being shown."* A since-investment tile whose comparison covers part of its money now reads `vs Nifty 500 +1.6%`, without "₹579.3 Cr dated +15.8%".
- Its lead goes too: +14.2 pp is off +15.8%, so it would not tie to the +17.2% above it. A tile compared on all its money keeps the lead. The hover says the figure is on the dated money; the info card keeps the book's figure on that money and the leads.

### Stage 10jl — PORTFOLIO MONITOR: YTD FROM THE FIRST DATE WE HAVE; THE CY COLUMN IS GONE

- The family (30 Oct 2026): *"for YTD atleast for this year lets show from the date we have"* and *"Remove the CY coloumn all together - best not have it than have it blank"*.
- **CY removed** from `ReturnMeasure`, the picker and every table (Monitor holdings and transactions, Private Market): no statement values anything at a past year-end, so it was a dash on every row. A saved pick or `?ret=` naming it drops it (`normaliseMeasures`).
- **YTD** keeps the full year to date where a holding was opened this year (`holdingYtd`). Otherwise `ytdAvailable.ts` measures the row from its first dated value this year on the Returns tab's records: a whole account on its verified return record (`statementReturnInputs` → `windowReturns`, Modified Dietz), else each listed share or growth fund carried from its statement balance at published closes (`assumedHolding`, labelled assumed). Never both for one account. The cell is tagged with the start ("from 31 Mar"), not annualised; its note names the dates and the arithmetic. Parts last valued more than a week apart are not pooled (V.E.C's 13 Aug and 7 Oct accounts would read +53.1% against +38.2% and +42.1%); each child line carries its own. Price histories load only while YTD is on screen.
- On this book the Category view's YTD reads 11 of 124 rows on statement records alone (PMS mandates and fund folios from 31 Mar, plus Stage 10jf's recovered openings); listed shares and funds add more once published prices load. The prices are read once every history has answered: redrawing All Securities' 629 rows per arriving batch held the page for a minute.
- Checks: `ytdAvailable.test.ts` (test:family; whole/part account, full year, refused record, parts valued apart, archive). `check:pages` `monitor-ytd` counts only untagged cells against `YTD_MEASURABLE`, asserts each part-year tag and window, and re-solves whole-account cells off `BOOK_ACCOUNT_RETURN_RECORDS` (`YTD_RECORD_BOOK`). CY assertions on `monitor-txn-returns`, `monitor-remember`, `private-market-returns` and `monitor` now assert it is absent. `monitor-xirr` (2) and `monitor-txn-returns` (2) invariants are red on main too and are left as found.

### Stage 10jm — PORTFOLIO MONITOR: A BLANK RETURN CELL SAYS WHY ON ITS FACE

- The family (30 Oct 2026): *"in the blank you can simple write - No buy/sell date"*, asking why direct equity's XIRR was empty when the Data Audit holds the dated records. Stage 10jf (merged alongside) carries those records into the rate. This stage names what is still missing.
- `AbsentCell` takes an optional `label`. The Monitor's return cells (rows and lines) print a few words after the dash from `returnGapLabel` (`returnColumns.ts`), most specific cause first: "No buy/sell dates", "Sale amount missing", "Needs newer statement", "No statement value", "Several buys — see XIRR", "No 1 Jan value", "No valuation", "No cost", "Dates incomplete", "Valued on different dates". The full reason stays the hover. Category totals keep the bare dash and their own reason.
- **"No statement value"** (`datedButUnvalued`, `ReturnInput.needsStatementValue`): every line's money is dated by its recovered record, but only a live price or a published NAV values it. Stage 10jf refuses a rate there, so CAGR and XIRR say so, rather than claiming a purchase date the row does not lack. 8 rows on statement marks (Motilal demat fund units at AMFI's NAV).
- While the YTD column's price histories are still answering, the holdings table carries `data-prices-pending="true"` (its cells say "Loading prices"). `table-excel.mjs`' `downloadTableWorkbook` waits for it to clear, so `check-data-performance`'s two-export comparison no longer races the prices (CI's `build` failed on exactly that). The prices are loaded for the whole family's holdings whatever the member selector shows, because the Excel snapshot is the whole family's: loaded for one member, its other rows exported as "Loading prices".
- Checks: `RETURN_COLUMNS` asserts every blank holding cell carries its label. `moneyCell` / `pctCell` and the MH-15 / MH-09 claims read a labelled dash as absent. `monitor-xirr-security`'s count excludes fund-only rows, as Stage 10jf's header does (red on main since #293), and its "an XIRR stands only on…" claim accepts Stage 10jh's NA beside the dash. NA cells keep Stage 10jh's `NotApplicableCell`; only a dash carries a label.

### Stage 10jn — SOURCES POPUP: A REVIEW RECORD IN PLAIN WORDS

*"When i click on it to understand it is so complex can you please make it simplest to read layman language"* — the family, 30 Oct 2026, on National Stock Exchange's "Quantity held · Sources".

- A family-review record now leads with what a reader asks: worth (₹ Cr/L), shares, date, what was paid, and only the lines that change how to read it (cost shared out by shares, one member's part, no named holder, now listed, a newer statement differs). `reviewFacts` in `src/lib/sourceTrace.ts` reads them off the holding and the note `reviewBook.mjs` writes; `ReviewPlain` in `SourceTrace.tsx` prints them.
- The full review note is kept, one click away under "Full detail"; Data Audit, Excel and Private Market still carry it whole. The record's label names the review, not an account number.
- The popup's other notes (correction, rolled-forward units, recovered cost, feed price, totals) are short sentences; a caption still names its narrowing (gain only where the cost is known).
- `sourceTrace.test.ts` holds the NSE record's facts, its rendered line and a line held at cost; `check-source-trace.mjs` looks for the feed note's new words, "published price (NAV)".

### Stage 10jo — XIRR TO THE MARKET PRICE, A TRUE YTD, AND NO CAGR COLUMN

*"ok i agree to what you recomend — do it and push to main"* — the family, 30 Oct 2026, on: XIRR blank on Onesource Special though every buy and sale is dated (HPR +25.34%, XIRR ≈ 13.6% to today's price).

- `holdingFlowsOf` closes a fully dated line (trades, lots or recovered record) on its dated market price or NAV when the line is priced by the market; null where the price has no date, predates the statement, or a later trade, movement or withdrawal is on record (`movedAfter`, `assumedHolding`'s test) — `datedCapital` then falls back to the statement line. `RowCapital.assumed` names the owners and statement dates; the cell shows "assumed" (`AssumedMark`, also on the company page) and the hover says whose units. Demat fund units at AMFI NAV (DSP, Helios, ICICI, ABSL, WhiteOak) now carry an XIRR instead of "No statement value".
- Recovered records carry `unitRecord` (units after each dated row, built by `recoverHoldingCosts` / `replayMopwmRows`). `recordedYearWindow` in `ytdAvailable.ts` opens YTD on 1 January's units at 31 December's close, counts this year's purchases and sales on their dates (and dividend entitlements where the record dates none), and carries the units from the statement at published closes; it falls back to the old path on any gap (split before the statement, unvouched dividend).
- CAGR left the picker and the default columns (`PICKER_KEYS`); a saved pick drops it; `?ret=cagr` still opens its column for the checks. CLAUDE.md records the rule beside the 22 Oct one.
- Checks: cells carry `data-capital-close`; `HOLDING_FLOWS_BOOK.solve(keys, closes)` re-solves with the page's market closes (a demat line by account and acquisition ISIN). Picker, default and Transactions checks expect no CAGR; `monitor-remember` ticks XIRR. Red as on main: `monitor-xirr` (360 ONE row), `monitor-txn-returns` (2), `stock` width, `stock-unpriced`.

### Stage 10jj — OUR BOOK VS BENCHMARKS: ONE DROPDOWN, NO RETRY BUTTON

*"remove the 'retry demat prices button', just give a simple benchmark dropdown list selector, to select multiple benchmarks"* — the family, 30 Oct 2026.
- The row of seven chips is one Benchmarks list: tick several, and it stays open until a click outside or Escape. Each option carries its colour and return; the row beside it names only the lines drawn.
- The retry button is gone. A failed demat price history is named on the book's hover, and a page reload fetches it again (failures are kept in memory only, never stored). Automatic retry was not added.
- `check:pages`: a new invariant holds the closed list as the row's one control, and that it stays open across picks. The probe ticks options through the list; the closed panel stays in the DOM, so each option's keys read without opening it. `check-nav-assumed.mjs` now asserts the hover instead of the button.

### Stage 10jp — ALL SECURITIES: EVERY HOLDING IS A ROW

- *"if we are holding a company or an investment and we are able to search it in the universal search bar, then it should be available in all the different segments."* Franklin India Credit AIF (₹20 Cr, Stage 10hx) was searchable and on no row of All Securities, because that axis drew company shares alone. This reverses Stage 10aj's "AIF itself shouldn't show up as a security". The same rule hid every fund, AIF, private line and cash row.
- On Category, Asset class and Basket it was already a row. On Asset class and Basket it sits in "Not classified in the family's review", the last section, because the 30 June review predates the 22 Oct purchase. No class is guessed; a later review, or the family, fills it.
- `Market value` (was `Direct + PMS`) now adds every holding: Direct + PMS + Other accounts, and its footer is the book, tying to the other three axes. Invested, unrealised and return read the same set as Category.
- **No double count:** a fund or cash row has `—` for Total exposure, with the reason, because what a fund holds is already in the Via funds of the companies inside it. Private lines have no look-through and are counted. Weight is total exposure over the book, or a fund's own value, so a company inside a fund sits in two rows' weights and the column has no total.
- Realised on this axis stays holding by holding (`holdingByHolding`), so the footer adds to its column; the return is struck on whole mandates, as everywhere else. `pickedNotRows` and its "Show it on Category" line are gone. Invariant: "every current holding is a row", off `glowData.ts`.
