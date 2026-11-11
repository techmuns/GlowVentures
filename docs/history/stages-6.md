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

### Stage 10jq — GLOWTERRA LLP AND GLOWSPHERE LLP: TWO NEW ENTITIES, HELD AT WHAT WAS PAID

- The family (31 Oct 2026): two newly incorporated LLPs have invested, and each must show as a separate entity. Glowterra's partners are Ajay and Aarti; Glowsphere's are Bharat and Ankita. Both hold equity and preference shares of Nzuri Pune Knowledge Park Private Limited.
- `source/october-2026-f/`: HDFC Bank NSDL holding statements of 29 Oct, DP accounts 67776432 (Glowterra) and 67776424 (Glowsphere). A text layer this time, so `readPrintedStatement` (`hdfcNsdl.mjs`) reads them by coordinates. Their ₹10 rate is face value (`faceValueBasis`), so the archive carries units and no value. This print's `1352,11,270.000` grouping is checked locally; `parseNum` still refuses it elsewhere.
- The covering note's table is a note, not a statement, so it lives in `scripts/ingest/reference/familyAdvisedInvestments.mjs`. `applyFamilyAdvice`, at the book's document seam, joins it where the units equal the statement's, or refuses and leaves a quantity. It gives each line its cost, dated capital and tranche, and `valuedAtCost`: value is cost, no gain, no return. ₹47.62 Cr + ₹15.87 Cr = ₹63.50 Cr, private. Total ₹900.58 Cr → ₹964.08 Cr; listed unchanged.
- **Open with the family:** each equity line reads "at 17.75" and pays about ₹16.70 a share (₹7.52 Cr against ₹8.00 Cr; ₹22.57 Cr against ₹24.00 Cr). Both preference lines tie to the paisa. The amount invested is the cost; the shortfall is on each holding's Sources note and in BOOK-REPORT.
- `shared/owners.mjs` gains both as `kind: "firm"` with `partners`, which names people and attributes no money: no profit share is on record. The member picker labels them LLP; the Family & Entities row's hover names the partners.
- At-cost wording across surfaces said only "the family's consolidated review"; it now reads "consolidated review or written note". An account held entirely at cost names that as its return gap (`accountReturnRecords.mjs`).
- Test: `llpStatements.test.mjs` (both statements, the join, the refusal, the equity shortfall).

### Stage 10jr — THE COLUMN A TABLE IS SORTED BY IS HIGHLIGHTED, TOP TO BOTTOM
- *"that particular column must be highlighted in light blue shade … same blue color when we select anything … on the Windows"*: heading, every row and the total take Windows' selection blue, `#0078d7` at 20% (32% in the dark theme), with a 3px edge in the full colour.
- One seam: `SortHeader` calls `useSortedColumn` (`src/lib/sortedColumn.ts`), so every table with sortable headings gets it. It marks cells from the DOM because many cells are components that take no extra props, and a `MutationObserver` follows rows arriving, rows opening and a column being moved.
- The fill is a background image over the cell's own surface (stripes, hover and pinned cells stay). The edge recolours the grid lines and adds 1px of inset shadow, so a sort moves no column. A cell spanning past the column (footer label, opened panel) is left unmarked; a nested table keeps its own mark.
- `check:columns` gains the rule, proven by disabling the hook. That script's older `/monitor` picker loop fails before it (`review:investmentRange` is gone from the picker); left alone, it is not in CI.

### Stage 10js — ALL SECURITIES IS COMPANIES AGAIN; FRANKLIN IS DEBT ON ASSET CLASS

- *"we need to reverse the all securities change ... We do not need to show every single holding in the all securities."* PR #302 (Stage 10jp) is reverted whole: All Securities draws company shares and look-through names, as under Stage 10aj, with its columns, footers, the "Show it on Category" line and their checks restored.
- *"in asset class you can show it under as debt, and in basket you can show it as not classified."* `FAMILY_SAID_CLASS` files Franklin India Credit AIF under Debt, with a source of its own (`family`), since no review row can be cited. Its basket stays "Not classified in the family's review"; Category keeps it under AIF.
- Being Debt, it now takes `isDebtHolding`'s rule, which allows a rate under a year. Its XIRR cell moves from NA to `—` No solution, because the statement's only valuation (21 Oct) predates the capital (22 Oct). The next statement gives it a figure.

### Stage 10jt — THE SORTED COLUMN, LIGHTER AND THINNER
- *"use some lighter color shade and thinned borders"*: Stage 10jr's fill goes from 20% to 9% of the selection blue (32% to 16% in the dark theme), and the edge from a 3px `#0078d7` to the grid's own width in `#7ab8ea` (`#2f6fa8` dark). The inset shadows are gone, so a tree row's first cell keeps its depth guide when sorted.

### Stage 10ju — NAV MOVERS' "NOT THE MEAN" TEST NO LONGER READS THE DAY'S DATA

- Main's CI went red in `build` and, through the family suite in its intake rehearsal, in `upload-e2e`. The test required the day's mean and weighted move to differ, and they coincide on a date when the day figure rests on one scheme. The card's figure was right.
- The test is now constructed: ₹1,000 up 10% and ₹9,000 up 1% must aggregate to 1.9%, not their 5.5% mean.

### Stage 10jv — A HELD UPLOAD SAYS WHY IN FULL

- Kotak's four-folio ZIP was held with `READ_GAP` and `SECURITY_SPLIT`, but the reason kept only the first three findings and the run log printed no warning text, so the failure could not be diagnosed from a run whose PDFs only CI can open.
- The inbox reason now names every kind of finding with its count. The run log carries every finding, each changed document's read gaps, and its ISIN-to-key pairs.

### Stage 10jw — OUR BOOK VS BENCHMARKS, LAID OUT LIKE GOOGLE FINANCE

- *"make the UI of our book vs benchmark similar to the google finance UI … Keep the benchmark selector on the top left area of the graph chart and a visible dot of the color of lines on the graph"* — the family, 2 Nov 2026.
- The Benchmarks list now leads the row at the top left of the plot, followed by a pill per line: a dot of the line's colour, its return, and a ✕ on each benchmark. Every line ends in a dot of its colour.
- Vertical gridlines, a dotted zero, no axis lines, month labels ("Apr 2026"), equal line weights. The start tabs moved under the plot. The app's light and dark themes stay.
- The dots that marked statement dates on the book line are gone, so the only dots on the plot are line ends; the tooltip says "Statement valuation on this date". No figure changed.
- `check:pages` strikes the selector's position, each end dot against its own curve's last point and colour, and the ✕ on `cio-nav-live`.

### Stage 10jx — A ZIP IS NOT HELD FOR WHAT IS ALREADY IN THE LIBRARY; A SWITCH PAIRS ACROSS A RENAME

- Every sealed statement's `pdf-encrypted` warning names its password's position in the saved list. The full reader re-opens them all, so the list's order made each one "changed", and old documents (360 ONE's empty earnings statement, ASK's two readings of 31 Mar) blocked an unrelated upload. The gate now ignores that position when deciding what changed; any other difference still counts.
- `SECURITY_SPLIT` no longer fires on an AMC's own folio statement naming a fund (`INF` ISIN, `Mutual Fund` row) that only other accounts hold under another key. A depository row, or a new name inside one account, still fires.
- `KEY_ALIASES` closes the two Kotak pairs this delivery added, joined on the exact ISINs (`INF174K01LC6`, `INF174KA1HV3`).
- Kotak prints a switch-out's target as named at the time ("To Kotak Equity Arbitrage" reached today's Kotak Arbitrage Fund), so the reader withheld three folios' ledgers. A matching name still decides; failing that, one sole switch-in with the same rupees inside the settlement week is the pair, and two or more withhold the ledger as before.

### Stage 10jy — KOTAK'S FOLIOS PASS THE BOOK'S OWN CHECKS

- A statement that prints no cost and whose unit record ties with only a switch now takes its record's FIFO cost. It had nothing for `carryCostThroughSwitches` to carry, so Aarti's Kotak Multi Cap (folio 5372722) would have stayed uncosted by the folio and disagreed with its own tranches.
- `CASH_EQUIVALENT_KEYS` gains Kotak Arbitrage (Regular) and Kotak Overnight (Direct). The dead-key check waits on them until the upload lands.
- Kajaria Ceramics joins the screener tier: the new Kotak funds' filings place it, and the premise is that filings never decide a held company's sector.
- Where a folio now reports a demat's exact units, the folio values them. `fundNavs` and `recoveredCosts` count those demat rows as reported elsewhere instead of expecting a row.

### Stage 10jz — THE "IN THE RETURN" FOLD UNDER THE BENCHMARK CHART IS GONE

- *"remove the highlighted section from the UI"* — the family, 2 Nov 2026, over "In the return: 58 of 138 investments · ₹805 Cr · …" under Our book vs benchmarks, on both routes that draw the card (Morning CIO, Performance).
- `SeriesCoverage` is deleted, so the lists it opened into (joined later, at cost, not revalued, no valued holding, demat holdings) and its reconciling footer (MNT-4) are off the card. The book pill's hover still gives the counts, the rupee coverage and the stale and unproven names. No figure changed.
- This narrows the "the rest are named" rule on this card by the family's decision: individual investments are no longer listed here.
- `check:pages`: the partition and MNT-4 claims are retired for one that the fold stays removed, the hovers still count the coverage, and the series stands for every account holding value. `check-nav-assumed.mjs` keeps its hover checks.

### Stage 10ka — THE FAMILY'S LIQUID-HOLDINGS NOTE CARRIES FIVE MOTILAL DEMAT FUND BALANCES TO 21 OCT

- The family sent a table (shared 3 Nov 2026) of what each member holds in "Demat Mode" (Motilal Oswal Arbitrage, Nippon Liquid BeES) and "Physical Mode" (HDFC Overnight), as rupee values with no units and no date. It is kept word for word in `scripts/ingest/reference/familyAdvisedBalances.mjs`.
- The date is AMFI's NAV of 21 Oct 2026. On that day, and on no day from 14 to 28 Oct, two recorded counts give the printed values to the paisa: Aarti's 48.183 HDFC Overnight units (her 1 Oct folio statement) and the 2,473,221.627 Motilal Arbitrage units that MOPWM's report shows bought on 13 Oct. Liquid BeES's NAV is ₹1,000.0000 every day, so it dates nothing. Bharat's 31 Jul units plus the report's reinvestments still give his figure exactly.
- `adviseBalances` turns each demat value into units at that NAV. It carries exactly one older recorded balance of the same owner and ISIN to those units: a Motilal holding statement's quantity, or the closing of Ajay's transaction-only 1201090012539150. Anything else is refused and named. The physical line confirms Aarti's HDFC folio and changes nothing.
- These are published as `BOOK_ADVISED_BALANCES`. `depositoryFundHoldings` and `unpricedStatementUnits` value the note's units at AMFI's NAV on the live basis, and `describeDepositoryUnits` names the carry. The statement basis is unchanged. A recovered cost joins on exact units, so the 31 Jul arbitrage cost no longer attaches, and the new balance shows no cost.
- Live effect: Ajay's arbitrage moves from 28,067,435.434 units (₹31.90 Cr, sold or moved on 23 Sep and 1 Oct) to ₹2.81 Cr. Liquid BeES is ₹89.86 L on Ajay's demat, ₹2.58 Cr on Ankita's, ₹77.49 L on Aarti's and ₹38.63 L on Bharat's. The live book falls by about ₹25.6 Cr.
- The Sources popup (`holdingSourceTrace`) still points at the count the statement prints, and it lists the note beside it.
- `check:pages` re-expresses the carry in `withDepositoryFunds` / `withUnpricedStatementUnits` (`advisedUnits`). `test:ingest` gains `familyAdvisedBalances`.

### Stage 10kb — KOTAK'S MULTI CAP FOLIOS COST THE DEMAT UNITS THEY REPORT

- The client's Kotak ZIP (four folio statements, Apr 2025 – Nov 2026; Ajay, Ankita, Aarti, Bharat) was held in the statement inbox: `test:family` failed with it, `only exact owner/ISIN/quantity matches are recoverable`, 60 against 62.
- The two records it removes are correct. Kotak folios 7111389 (Ajay) and 5372722 (Aarti) report the exact Multi Cap units (INF174KA1HV3) that the Motilal demats 1201090012539150 and 1201090012838335 recorded, and each folio prints a cost or ties one by FIFO. `recoverHoldingCosts` leaves a same-owner balance that another statement costs without a recovered record, and fund gates 5/7 value the folio rather than the demat.
- `recoveredCosts.test.ts` names the two balances. It takes one off both pinned counts (records and costed live fund rows) for each folio that costs it, and it checks that the record and the demat row go when the folio arrives and stay until then. A scratch book with the two folio positions added reproduced 60 against 62 on the old test and passes on the new one.

### Stage 10kc — THE SOURCE-TRACE AND NAVIGATION BROWSER CHECKS FOLLOW THE NOTE'S ROW

- CI's `build` job had failed on main since Stage 10ka: `check-source-trace.mjs` waited for a direct quantity link on Ajay's Motilal Arbitrage demat row (1201090012539150). The family's note now sources that row as well, so its quantity and labels open a sources list, and the cell shows the note's 24,73,222 units.
- The check now opens that list. It finds the note and the statement's own 2,80,67,435.434, then follows the statement link, so the page-5 highlight and the Monitor's return-state walk test the same document as before.
- `check-navigation-state.mjs` picked "Kotak Arbitrage Fund" from the holdings search. Kotak's folios add the Regular plan, so it now picks the Direct plan the walk links to.
- All four scripts after `check-source-trace` in that CI step pass against a build carrying Kotak's delivery.

### Stage 10kd — EVERY HOLDING AGAINST ITS OWN INDEX, ON ITS OWN MONEY

*"Map a benchmark to every holding by what it is … if the investment in a portfolio holding is in tranches then we need to show benchmark return also based on tranches investment in the same magnitude and time period."*

- `src/lib/holdingBenchmark.ts` picks one index per Monitor row. A mandate takes the benchmark its manager's report prints (`BOOK_ACCOUNT_RETURNS`: BSE 500 TRI, N50TRI …, price version). A listed share takes AMFI's size class from its 30 Jun 2026 list (`src/data/amfiMarketCap.json`, `npm run build-amfi-market-cap`): large → Nifty 50, mid → Midcap 150, small → Smallcap 250. The ISIN comes from the statement, else from the verified exchange instrument. An SME-platform share is small cap. A main-board listing after the list is ranked on the list's floors by its quote's market value, else the Nifty 500. A fund takes its SEBI category from its name. Unlisted shares and private funds take the Nifty 500. Cash, arbitrage, hybrid and debt lines name the index they would need and show no figure.
- The index figure sits under the holding's in each return cell (`components/HoldingBenchmark.tsx`, `inline-block`, so the cell's text stays one line). It uses the row's own dated money: `RowCapital.legs` keeps each line's flows and close, and each payment buys the index on its own day. HPR is the index gain over the money paid in. XIRR/CAGR is the index's money-weighted rate over the same flows. YTD from a dated value is the index's move over the same window. A row whose purchases are not all dated shows `—`, and the hover gives the reason. Histories come through `/api/prices` with the name check.
- Mapped on today's book: 159 shares (14 large, 13 mid, 124 small, 8 unranked/broad), 30 funds/AIFs to an index, 56 unlisted to the Nifty 500, 33 cash/arbitrage/debt/hybrid lines with a named reason.

### Stage 10ke — HELIOS'S 3 NOVEMBER UPLOADS LAND, AND ONE FILE NO LONGER HOLDS ITS BATCH

- The client's four Helios statements (Ajay 10355977 and 10056128, Ankita 10056154, Bharat 10063876; all as of 3 Nov 2026) were held in the statement inbox with "needs a full reading". The rapid reader found a `READ_GAP` on Ankita's and Bharat's folios: `transaction-type-not-declared`.
- Cause: CAMS prints its job reference (`EISC-…(I)-…--1031`) up the page margin. The layout joined it to the 04/06/2025 Net Purchase row, the anchored row pattern missed, and `mfPurchaseFlows` withheld the whole dated record. It now cuts that reference before matching, as `mutualFundFolio`'s `furnitureFree` already did. A real figure after the balance still withholds.
- Ajay's two statements were clean but held anyway, because one failing file held the whole batch. `prepareRapidStatement` now sets aside only files whose every finding names them, re-checks the rest, and publishes those. The hold reason names the failed check and the reader's warnings, so `inbox.json` says what to fix.
- Ankita's and Bharat's folios are new accounts. Each holds exactly the Helios units its owner's Motilal demat printed on 31 Jul, and each statement prints `Demat To Remat -Accept` on 6 Oct. The Helios layout carries that date as `custodyRematOn`, and `CUSTODY_FOLIO_LINKS` links each demat to its folio on it, as Bandhan's are (Stage 10hm). The units count once, and the two review-recovered demat costs step aside for the folio's own (`recoveredCosts.test.ts`, 62 → 60, as Stage 10kb).
- The four files are in `source/november-2026/`. The book rises ₹13.56 Cr: Ankita ₹7.98 Cr and Bharat ₹3.77 Cr (units that were quantity-only on the demat statements), and Ajay ₹1.81 Cr at the 2 Nov NAV.
- A fetched NAV older than a statement's own price never replaces it (`applyFundNavs`). Helios's statements price at 2 Nov, after the newest fetched NAV, which is the first time the book hit this rule. `check:pages`' `withPublishedNavs` and `portfolioExcel.test.ts` now re-express it. Without it they showed 7 false findings on `monitor`/`sectors` and a ₹68.7 L footer gap.
- Tests pinned to the old dates or windows now state their rules instead. `capitalRecord`: an older record never pulls the close back. `periodReturnWorking`: October's MTD is ended by October's last valuation. `navSeries`: the flow adjustment is struck over the like-for-like stretch carrying the most capital (complete-panel now starts at Bandhan's 26 Oct join and holds none). The taxonomy's dead-entry check counts custody audit rows, which keeps `sec:helios-fcf-d-grow` classifying the superseded demat rows in the Consolidated View.

### Stage 10kf — THE TRANSACTIONS TAB SAYS BUY OR SELL

- The family (3 Nov 2026), on Data Audit → Transactions: *"add a column next to it, which we call as transaction type. The transaction type can only be two types, which is buy or sell, for the ease of analysis."*
- `consolidatedSheet.ts` adds `txntype` ("Transaction type") right after "Type (as printed)", on the page and in the Excel download. Trades take their side. A capital flow that counts as Investment is Buy, and one that counts as Divestment (redemptions, withdrawals, TDS transfers out) is Sell. An open tax lot is Buy and a sold tax lot is Sell.
- Income (dividends, interest and gain distributions, equalisation) and non-cash corporate actions (bonus, spin-off) are neither, so their cell is blank. The column's `blank` reason is the cell's hover. `consolidatedSheet.test.ts` pins the mapping row by row.

### Stage 10kg — THE TRANSACTION TYPE ADDS INCOME

- The family (3 Nov 2026), after the Stage 10kf column: *"I'm fine with adding an income row."* Dividends, interest and gain distributions, and equalisation received now read **Income** in Transactions' `txntype`. This covers every row that counts as Income, from income records and capital flows alike.
- A reversal stays Income. Its minus sign is in Gross and Net, so adding the column up nets it out: 188 of the book's 191 negative income rows have an equal positive on the same day. Only non-cash corporate actions (bonus, spin-off) are left blank, and the column's `blank` reason says why.

### Stage 10kh — NO "LATEST STATEMENTS COULD NOT BE LOADED" BANNER

- The family (3 Nov 2026), on the amber strip *"Latest statements could not be loaded. Showing saved data. Retry"*: *"Never show this garbage to the user please remove."*
- `renderApp.tsx` no longer draws it. Nothing else changes. When `bootstrapRuntimeBook` cannot fetch a published version, or the version does not match this build's reader, the app still opens on its compiled book. `bootstrapWarning` still sets the background refresh to look every 5 s, so a newer version still loads when it arrives.

### Stage 10ki — MOLECULE'S 2 NOVEMBER STATEMENTS PASS THE PUBLICATION GATE

- The client's ZIP `Re__Urgent_Request_for_Transaction_Statement,_Bank_Book_&_Portfolio_Appraisal_Report.zip` (upload `20261103T082041Z-6ce46088`; Molecule 7810404's bank book, current portfolio, appraisal, fact sheet and transaction statement, all struck 2 Nov 2026) was held `needs_review` with 34 findings. Every reader had read it; the gate refused it for three reasons.
- **MISSING_DATE.** A since-inception BANK BOOK prints no "From … to …" window. It prints only the report date on its own line under the title. `readBankBook` now reads that line from the title block, above `Account :`, and only where nothing else dates the report. V.E.C's two July bank books have the same layout and were archived as `…-unknown-bank-book`. They are now `…-2026-07-06-bank-book`, the date of their July siblings. `assessPublication` lets an undated reading give way to the same source file read with its printed date: same provider, account and report. It is still an archive loss in every other case.
- **RECONCILIATION_FAILED ×2.** CURRENT PORTFOLIO adds Elecon's ₹1,000 outstanding dividend to its market value (877,500 against 2,000 × 438.25). `outstandingBySecurity` only knew a dividend statement as the witness for that. This delivery has none, so the same-date APPRAISAL's "Accrued Income" line is now the witness. It is used only when no dividend statement exists, so the dividend is never counted twice, and the cause line names which document witnessed it.
- **CROSS_RECORD_CONFLICT ×31.** CURRENT PORTFOLIO prints cost to the rupee and the appraisal to the paisa (915,402 against 915,402.34). Per-holding cross-report deltas now carry `severity` (`classifyDelta`; a unit count is always material), and the gate holds only deltas that are not `rounding`.
- Book: Molecule 7810404 moves from 31 Jul (₹1.16 Cr) to 2 Nov (₹1.14 Cr), 469 → 472 positions. Its 8 Oct capital register's two TDS transfers (₹1,765) now fall inside the account's window and are listed as dated capital. `navProof`'s load-bearing check (b) had depended on Molecule having no dated flows. It is now judged per window: a printed step with no dated flow inside it. It finds four accounts, not one.
- Tests: `pipeline` (the appraisal witness, rounding against material, and a gap the accrual does not explain stays material; the first three fail on the old reconcile), `publication` (dated re-reading, rounding-only deltas).

### Stage 10kj — STATEMENT AND PORTFOLIO LIBRARY TABLES FIT THE PAGE

- `/statements` (and `/portfolios`, the same layout) were capped at `max-w-5xl`, leaving wide empty margins, and a filename with no spaces (the Molecule ZIP `Re__Urgent_Request_…_Report.zip`, `ANKITA_JAISINGHANI_FAMILY_…xlsx`) set the Document column's minimum width, so the table scrolled sideways inside its card.
- Both pages now take the full content width (folder grid gains `xl:grid-cols-6`). The tables are `w-full`; Document (and Arrived in) break anywhere (`[overflow-wrap:anywhere]`); Account and As of never wrap, so a date no longer stacks as "3 / Nov / 2026".
- Measured in the preview: all 47 folder tables across 44 folders, at 1600 px and 1100 px wide, have `scrollWidth == clientWidth`; with the ZIP name injected, the old cell classes give 1224 against 964 and the new ones fit. The scroll container stays for narrow windows.

### Stage 10kk — MOPWM'S TRANSACTION REPORT: TAAL CARRIED THROUGH ITS SPLIT

- The family, 4 Nov 2026, asked whether `ANKITA_JAISINGHANI_FAMILY_23Oct2026131535.xlsx` was fully integrated. Audit: 26,402 rows. Direct Equity 1,378 (31 after 31 Jul), Mutual Funds 24,602 (116 under nine people the registry does not know), PMS_AIF_SP 418, Fixed Income 2 and Derivative 2 (both closed before 2026). It feeds cost recovery (Stage 10hu) and the share rolls (Stage 10iw). Every later share trade was either applied or refused for a reason, except TAAL Tech.
- TAAL was refused only because its 22 Sep 1:5 split is a `SPLIT/…` block, not an exchange trade. `splitOf` reads a block as one FIFO switch of the holding into itself. The block must have one reference and one date, take every lot out at its own amount, and put each back at the same amount and a whole multiple of its units. It must take the whole holding the record has at that moment. Anything else is still refused, with its reason. TAAL: 4,000 bought 2–8 Sep for ₹1,80,09,805, now 20,000 on Ajay's 539150 (`INE524T01029`, `TAALTECH` from Upstox's NSE master). Live basis only, like every roll. Manorama's 2024 split now reads; it is refused for want of an alias, and no statement records it.
- A roll names the splits its units carry (`ShareRoll.shareEvents` → `rolledForward.shareEvents`). `projectActions` files the same split from the capture as `in-roll`, matched on ex-date, type and factor, and does not apply its factor again. The "share adjustment between the statement and the later trades" block skips it. A capture split the roll does not carry, or one with another ratio, still withholds the price.
- Still not moved, by decision: the fund rows (the 1 Oct "redemptions"), DSP ETF AMC-folio rows, and PMS/AIF capital rows. The PMS/AIF rows after a statement include Delphi's 16 Jul ₹11.25 Cr withdrawal (book: 30 Jun, ₹11.13 Cr), Neo Infra's 9 Jul distributions and Baring's 3 Aug ₹50 L call. Funds the book does not carry: Aarti's ABSL Balanced Advantage 1044874113 (₹2 Cr bought 1 Aug 2023, no redemption recorded) and Ajay's DSP Gold ETF on the AMC folio. Both need a statement.
- Tests: `mopwmTransactions.test.mjs` (a split block's FIFO, ratio, amount, lot-count and whole-holding refusals; the committed nine rolls) and `shareRolls.test.ts` (TAAL priced at 20,000 against a capture listing the split; withheld where the roll does not carry it or the ratio differs).

### Stage 10kl — Bandhan's 3 Nov uploads read; a held batch names each file's own cause

- **Why the four uploads showed "Needs attention":** one `verifyPublication` verdict held the whole batch under one reason. Aarti's PDF opens with none of the vault's five passwords, so its finding was `pdf-read-failed`. The judge's sealed test looked for a manifest status `encrypted`, which no document carries, so it never said "Needs password".
- `intake-uploads.mjs` `heldPerUpload`: a held publication is attributed to the uploads whose documents it names. Each upload is held for its own findings, a sealed one as `needs-password`, and a clean one is judged again without the others. A finding that names no upload still holds the batch. `uploadIsSealed` reads the failed document's own warning.
- A publication PR GitHub refuses to open ("Actions is not permitted to create … pull requests") is now held with that cause instead of `processing` forever. The 2 Nov Kotak ZIP sat verified for a day on it; it lands here canonically (folios 7111389, 5372722, 7125319, 7125555 as of 2 Nov).
- `bandhanFolio.mjs`: a ledger carried onto the next page reprints its scheme heading and column header and is now joined, not counted as a second scheme. Page furniture and the `EISC-…--NNNN` stamp are stripped. A ledger with no opening line opens at nil only when its first row's running balance is its units. `Purchase` (80C) is a contribution, with its `Transaction charges` as the levy. A folio redeemed to nil (no account summary) totals its ledgers' printed nil values. `classify.mjs` also knows Bandhan by its transaction slip.
- Read: Ajay 8652064 to 14 Oct (12 purchases from 2 Apr and the Overnight→Large & Mid Cap legs the 26 Oct statement lacks), Ankita 8691267 (₹39.2 L in Large & Mid Cap) and Ankita's 2017 ELSS folio 1802619 (redeemed 21 Apr 2023). Aarti's statement is not in `source/`; it needs her password in the vault, or an unlocked copy.

### Stage 10km — Private Market's tile picker offers IRR

*"In the KPI tiles give the option to select IRR"*

- A new **IRR** metric in the Private Market picker (after Unrealised P&L). It reads `aggRet(…, "total")("xirr")`, the same resolver the table's total row uses under XIRR, so the tile and that cell cannot disagree.
- **Whole or absent (Stage 10fc).** The tile shows a rate only when every valued fund's dated record joins the pool. Otherwise it shows `—`, and the hover names each fund left out. Holdings carried at cost have no return by decision; the hover names them, as Unrealised P&L does. Under a year, the tile shows the holding-period return and says so.
- On this book the tile is `—`: Franklin India Credit AIF DB2 has a 22 Oct call after its 21 Oct valuation. The table's total still pools 7 of 71 funds, as before.
- `check:pages`: `irr` is in the picker's `mustOffer`. On `private-market-tiles`, `PM_IRR_TILE_CHECK` compares the tile with `PM_RETURN_BOOK`'s own pool and fails if the tile prints a partial pool. Proved by reintroducing the bug.

### Stage 10kn — ATJ's ICICI + HDFC reports as on 31 Oct 2026: the ICICI demat moves to 31 Oct, HDFC Securities 3110320 joins the book

- `source/november-2026-b/` holds the client's ZIP "ATJ Sir's Reports – ICICI + HDFC as on 31-10-2026" (renamed to drop the apostrophe). Five files: ICICI Bank's Statement of Holding for 49794950 at 31 Oct (prices of 30 Oct), an equity order book for the same demat, HDFC Securities' InvestRight equity and demat portfolios for trading account 3110320, and `3110320_Equity_Trade_Details_Report (3).xlsx`, an 85-byte removal notice (NEVER ARRIVED; ask for a re-send).
- `nsdlDemat.mjs` reads the new statement unchanged (47 rows, ties to its printed total). Its footer types it a transaction statement, so the ICICI route tries the order book reader first and then `nsdlDemat`.
- `providers/equityOrderBook.mjs`: a tab-separated file saved as `.csv` (`sheet.mjs` now sniffs TSV). It is filed under the demat its rows settle into, via a DP ID a letterhead names (`lib/depositoryParticipants.mjs`), and the holder comes from that account (`backfillOwners`). Trade Value is the consideration; `Price` is the order's. Each ISIN comes from the instrument master, plus `EMAIN` → EMA Partners on the account's own counts. Trades are named from the account's holding statement by ISIN (`nameTradesByIsin`). 73 trades, 24 Jun–27 Oct 2026; every sale ties to the 31 Mar → 31 Oct change.
- `providers/hdfcSecurities.mjs`: the equity portfolio (account, date, symbol, cost) and the demat portfolio (names, four extra rows, no account or date) are one snapshot, paired only where every row's quantity and LTP agree to the paisa (`pairDematPortfolio`). The demat view becomes the witness (`twinOf`). The holder is `HOLDER_BY_TRADING_ACCOUNT`, evidenced by the 30 June review's HDFC Bank block for Ajay, which holds the same seven quantities. An LTP of 0.00 (the two Sterlite demerger shares) is no price.
- Review joins: Sotefin Bharat now carries a depository mark and stays on the statement (`PRIVATE_INVESTMENT_ELSEWHERE`, like ESDS). Borosil's 2,83,018 warrants are now 2,83,018 preferential equity shares, listing awaited, at face value. Assetgro is now a public company (541 Series B preference + 20,797 equity), and both rows are superseded by its review line. NSE stays the review's per the family's decision, with its statement mark on the hover. `review-reconcile.mjs` subtracts every line named elsewhere, not just ESDS and Credit Fair. Franklin's demat units are in `AIF_UNITS`.
- Book ₹987.89 → ₹1,075.53 Cr: HDFC Securities +₹47.24 Cr, ICICI 49794950 ₹63.76 → ₹106.16 Cr, review −₹2.00 Cr (Sotefin). Vantage Oak Fund (₹4.10 Cr, 22,75,000 units on the ICICI demat) is UNPLACED: no document prints its SEBI category. The family's declaration (`DECLARED_AIF_CATEGORY`) places it.
- Monitor: the fund look-through now loads on every axis. A fund files Sterlite Technologies under Information Technology and screener.in under Communication Services, so the row's sector changed with the axis. It is one read-model request, and `monitorSectors.test.ts` now asserts that the filing tier is the only thing that moves a sector. Screener sectors were fetched for KINGFA, MANINDS, MANORAMA, STLTECH and STLNETWORK.
- `KEY_ALIASES` (exact ISIN): the 31 Oct statement's City Union, Federal, Karur Vysya, RBL, Assetgro Series B, Franklin DB2 and Vantage Oak spellings take the keys the book already carries, which the publication verifier requires. Four recovered costs on 49794950 no longer match exact quantities (Smartworks, Insolation, Yash, EMA) and are absent, not divided down. Carrying them through the order book's sales is a follow-up. Family suites were updated to the 31 Oct facts.

### Stage 10ko — A private company's own page: funding rounds, valuation history and stake, sourced and refreshed weekly

- *"Make Drill down page for private market investments similar to full drill down pages for public investments … Fetch information like valuation, funding rounds, etc. … thru credible sources and these should be automatically updated. Also give the option to select and view these metrics in the edit columns filter."* — the family, 4 Nov 2026.
- `/private-company/:id` (`src/pages/PrivateCompany.tsx`): `/stock/`'s template — fixed header, six tiles (Invested, Date of investment, Valuation at entry with pre-money, Latest valuation and its date, Change since entry, Your stake) and three tabs: Position (folios), Funding rounds (date, round, raised, pre, post, price/share, stake, lead investors, linked sources, entry round marked; filings that name a book member as allottee) and Valuation (a line per round, with the investment date).
- The record is `src/data/privateRounds.json`, the one record that is public reporting rather than the family's statements: written by `npm run build-private-rounds` (`--import` takes researched batches, `--check` validates), one entry per company in `scripts/lib/privateCompanies.mjs` keyed on the book's own line keys. 52 companies, 104 sourced rounds on 4 Nov 2026; `docs/PRIVATE-ROUNDS.md` lists each. Funds, the Borosil lines and the credit line are named as not companies (`NOT_A_PRIVATE_COMPANY`).
- Every figure is the one its source prints; unlisted-share dealer quotes and forums are blocked hosts. Derived only: pre = post − raised (and the reverse), marked `d`; a "valued at" with no basis is drawn as such, never as post-money; a figure printed only in another currency is shown as printed and left off the chart, never converted.
- Stake: at entry, shares × the entry round's price ÷ its post-money, struck only where the family's own cost per share is that price (±5%) — Zepto's rounds print ₹33 and ₹53 a share against the family's ₹31,810, so no stake. After entry, each share-issuing round dilutes by pre ÷ post; a round without both breaks the chain from there.
- Refresh: `.github/workflows/private-rounds.yml`, Mondays, the fifteen stalest companies, Claude (Messages API, web search + fetch) under the same brief. A source the run did not actually open is dropped, a refresh never deletes a sourced round, and the commit only lands when `--check` and `build` pass. **Needs the `ANTHROPIC_API_KEY` repository secret**; without it the run says so and the pages keep the last record and its date.
- Private Market: a company row's ↗ opens its page (DrinkPrime's four sellers included); Edit Columns offers Valuation at entry, Latest valuation, Latest valuation date, Latest round and Valuation change since entry, hidden by default, NA on a fund. `/stock/` pages of a private company link to it. Polycab text in a report is dropped (`FENCED`), and the suite asserts the record never names it.
- Checks: `privateRounds.test.ts` (coverage of every private Unlisted line, sourced rounds, the derivations, the stake rule); `check:pages` routes `private-company`, `-rounds`, `-valuation` (probe `privateCo`).

### Stage 10ks — Private Market's Weight, at cost and at value, of the private investments only

- *"Weights – show only % of pvt investments – show both at cost and latest value"* (4 Nov 2026). The one Weight column becomes two: **Weight at cost** (row cost ÷ the private book's cost, `PrivateBook.privateCost`) and **Weight at value** (row value ÷ `privateValue`, unchanged). Both denominators are the valued private holdings only; each heading's hover names its amount.
- A valued holding with no cost is named in the at-cost heading (`PrivateBook.costless`) and renders `—` with its reason, never a nil share. None today: both columns add to 100% (private 22.8% / 26.4%, held at cost 77.2% / 73.6%).
- The Counted once line takes back the duplicated cost's share as it does the value's. `weightCost` sorts on cost, as `weight` sorts on value.
- Checks: `build`; `privateBook.test.ts`, `privateMarket.test.ts`; `check:pages ONLY=private-market,private-market-tiles` (the one finding, the B-10 distributions hover on the tile strip, does not read either column).

### Stage 10kt — Private company pages read Inc42's funding table and the company's headlines

- *"The drill down pages of the private companies need to show complete information … access the private market news section in the Glow Central Research to understand how we are fetching data for it and use that knowledge to fetch and show data for private markets investments."* — the family, 4 Nov 2026.
- What Glow Central Research does: its News → Private Market tab is Inc42's weekly "Funding Galore" tables (date, company, sector, subsector, business model, round size, round type, investors, lead investor), walked every six hours from the public table and published at `data/private-market-news.json` (3,220 rows, Aug 2023 → Oct 2026, archive 41 of 48 pages read). Its rule is that a Glow dashboard never scrapes Inc42 a second time, so `npm run import-private-market` reads that publication — as `import-corporate-actions.mjs` reads its corporate actions — plus `data/private-company-news.json` (headlines naming a family private company) and `data/portfolio-companies.json` (which book lines each is). No key; `.github/workflows/private-market-news.yml` runs it twice a day and commits `src/data/privateMarketNews.json` only on change, after the rounds suite and `build`.
- Matching (`scripts/lib/privateFunding.mjs`): a row is a company's only when its printed name is the brand, the legal name, a former/later name the registry states, or a reviewed alias (the registry's new fifth field, Glow Central Research's `REVIEWED` spellings) — exact after legal suffixes and punctuation, a name two companies share matches neither. 30 rows for 15 companies on 4 Nov (more than Glow Central Research's own 12: the registry's brands catch StockGro, WeVOIS and InCred).
- A row is the researched round it describes only on evidence — dated within 45 days and two of: the same amount in a currency both print (±15%), an investor both name, the same day, the same series — never across a different amount in one currency or a different series (seed and pre-seed are one cheque); one row per round, ties fold neither. 27 of 30 fold; three are rounds the research did not have (Zepto's Nov 2023 Series E $31 Mn and Aug 2025 MapmyIndia $2.9 Mn, Innoviti's Mar 2025 $4 Mn), drawn as `kind: "reported"` with an "Inc42" badge. Inc42 prints no valuation, so none comes from it, and a reported round breaks the stake chain (it does not say whether it issued shares). `--offline` re-matches after the weekly research refresh (`private-rounds.yml` runs it).
- The page: an Investors column (every investor Inc42 lists), Inc42's sector · subsector · business model beside the researched sector, "Inc42 checked" with its coverage on the hover, the amount's footnote ("Mix of equity and debt", "Part of a larger round") on the Raised hover, a row whose amount sits in the round-type column read swapped and said so, family members an Inc42 investor list names under "Named in the filings", and a fourth tab, News (headlines, newest first; a name in a headline, not a verified event; held beyond Glow Central Research's 120-day window, 60 per company). "Bharat Jaisinghani (PolyCab)" in a ScrapUncle row is cut to the name — the import refuses to write a record that names the ring-fenced holding.
- InCred and Rays Experts (the family's screenshots) have no Inc42 row beyond InCred's Series D; a research pass found no newer priced event for either (InCred: IPO-size talk and dealer quotes only; Rays Power Experts' Jul 2024 ₹20 Cr round prints no valuation), so their dashes stand with their reasons.
- Checks: `privateRounds.test.ts` (names exact, every dated row on the page, rounds = researched + unfolded rows, no valuation from Inc42, links, the fold rules and the stake break on fixtures); `check:pages` route `private-company-news`, the four-tab header, Inc42 badges and Investors cells against the record (probe `privateCo`).

### Stage 10ku — ICICI 49794950's "31 March" statement is priced at 20 July: balances kept, no valuation

- `source/august-2026-e/Holding Statement Ajay Jaisinghani As on 31 March 2026.pdf` prints `Statement of Holding 31-Mar-2026` and `( Prices as on 30-Mar-2026 )`, but its footer says it was run on Tue 21 Jul 2026 at 15:57. Every listed value ÷ balance is the 20 July close to the paisa (Yahoo): Polycab ₹8,885.00 (30 Mar ₹6,843.50), Clean Max ₹1,336.50 (₹769.70), Fractal ₹842.05 (₹759.45), Smartworks ₹486.05 (₹372.45), Insolation ₹119.11 (₹82.18), Yash Highvoltage ₹906.00 (₹417.75). ICICI's report prices a past balance at the last close on file when it runs, and the extractor had copied the label.
- `nsdlDemat.mjs` reads the run stamp (`runStamp`; a stamp whose weekday contradicts its date is ignored). The label stands only if it falls on or before the run day with no weekday between them (`weekdaysStrictlyBetween`); a holiday can only make it refuse a label that was right. Otherwise the new statement note `values-priced-when-run` applies: every balance is kept, with no `marketValue` and no `priceAsOn`. The column's figure goes in `valueWhenRun`, an optional holding field written only where set. The printed-total check still runs. The 31 Oct statement (labelled 30 Oct, run Mon 2 Nov 16:51) passes; only its skew note gains a sentence.
- Book: ICICI 49794950's ₹119.26 Cr 31 March point (Polycab already fenced out) leaves `BOOK_ACCOUNT_NAV_HISTORY`. Valued only at 31 Oct now, the account leaves the multi-date NAV panel: 28 → 27 points, 25 → 24 accounts, last point ₹534.75 → ₹323.52 Cr. The attribution window now opens 31 May. Positions, the book total and the return records are unchanged. The Sanshi A2 / E units on that statement (122.647 / 151.966) carried the NAV on file at the run, on an unprinted date, and are now quantities only.
- The NAV card's assumed line now splits the ICICI demat like any demat first valued at its shares' statement: the rest at 31 Oct, the shares at their closes. `assumedBookNav.test.ts` asserts this, and a constructed case keeps the "valued earlier → one investment" branch covered. `nsdlPriceDate.test.mjs` covers the contradicted, corroborated and misread-stamp cases.

### Stage 10kw — Private Market: columns per filter; Funds show Quarterly NAV and IRR, no YTD

- *"whatever columns we edit for companies or for funds should be saved for that particular filter only … for the Funds, remove YTD performance column. Add quarterly NAV – show IRR."* — the family, 4 Nov 2026.
- `useTableView` takes a `memoryKey`: the table keeps its identity (`pm-book`) and saves one arrangement per filter (`pm-book:companies|funds|both`). `useReturnMeasures` saves one pick per filter (`private-market:<filter>`). Both read the old shared key until the first edit under a filter.
- Funds: the picker does not offer YTD (`omit`, `resolveReturnMeasures`); the XIRR column is headed IRR; a Quarterly NAV column sits after Value — value ÷ units over the held folios of ONE fund vehicle valued on ONE date (`navOf` in `privateBook.ts`), its Indian FY quarter under it (any other date printed as the date). A company, a held-at-cost line, a row without a unit count and a band over several funds show `—` with the reason.
- Checks: `privateBook.test.ts` [E] re-derives each NAV off the folios; `tableView.test.ts` covers `omit`. `check:pages` on the six Private Market routes matches main's findings.

### Stage 10kx — Private Market: Upload documents, filed under a company or fund

- *"add a "Upload documents" button where we can choose the company or fund and upload any kind of file related to it … The files then also need to be automatically added in the admin pages accordingly at the right place and also update the hyperlinks to the newly uploaded file"* — the family, 4 Nov 2026.
- A button at the right of Private Market's title row opens a dialog: one company or fund (each `byFund` row; a row is a fund when a folio is an AIF / MF unit or a capital account with no holding, `uploadSubjects`), then any files up to 25 MB. They go through the Statement Library's inbox with the row named: every file carries `subject` `{ kind, key, label, keys }` (`cleanSubject`; `keys` are the `securityKey`s behind the row).
- A statement format (PDF / Excel / ZIP) is `queued` and read into the book by the usual intake run. Any other file is `stored` (a new inbox status the intake never picks up) and feeds no figure. A holding's PDF the reader holds as `not-a-statement` reads as Saved, without a retry. Batches with a subject are never pruned from the log, which is the holding's document index (`holdingDocuments`).
- `GET /api/statement-uploads?file=<batch>/<path>` serves a file while its bytes are on the inbox branch. Only paths the log names are served; only PDF, images and text open inline, everything else downloads under a sandbox CSP. A read statement links to `/statements?file=<docKey>` instead (`uploadedFileHref`).
- Admin pages: the Portfolio Library lists a holding's uploads in the folder of any security behind it (Uploaded documents). A holding with no statement folder (review-only, e.g. Aksum; or Sky Capital, whose row key is fund-level while its folders are per class) gets an upload folder named after the row. The Statement Library's recent uploads link the holding's folder and the file. Private Market rows show a clip with the count, linking to the folder.
- Checks: `statementUploads.test.ts` §9 (document types, subject validation, stored vs queued, served bytes and headers, no pruning, removal, links). `check:pages` on private-market, private-market-tiles, statements and portfolios matches a main control build (B-10 fails on both).

### Stage 10ky — Clean Max on two demats is two holdings, now under one key

- Defect 3 of the 4 Nov review (#333) asked whether Clean Max's 94,967 shares on Ajay's ICICI demat 49794950 and Ankita's Motilal demat 1201090012838316 are a double count on the live basis. **They are two holdings, each counted once.**
  - Both depositories hold their 94,967 at the same time: Ajay's NSDL account on 31 Mar and 31 Oct, and Ankita's CDSL account (in lock-in) through a tape that moves none of them from 1 Apr to 31 Jul.
  - The review buys them in two separate rows (262–263 and 264–265), ₹9,38,57,991 each. Its 1,89,934 total and the register's ₹18.77 Cr are both holdings together.
  - The live book carries exactly those two rows, each at its own recovered cost; the consolidated count keeps both.
- The real defect was identity: Ankita's statement row was keyed `clean-max-env`, so one ISIN was two keys on the statement basis, with its own `/stock/clean-max-env` ledger view. `KEY_ALIASES` now maps it to `clean-max-enviro-energy-solutions` on the exact ISIN (INE647U01026 → CLEANMAX). `rekey:archive` moved 1 row (its `--check` control was a no-op first). The book report's split-ISIN list goes 12 → 11. The extraction report now names the pair under "Matched on QUANTITY ALONE — NOT deduped".
- `fundNavs.test.ts` asserts one key on the statement basis, exactly two live rows (never a third), a recovered cost per account, and both kept by the dedupe. Run against main's book, the key assertion fails.

### Stage 10kz — Every private company researched individually; a researched batch merges without overwriting

- *"For every single private investment look for data for every single investment individually and add them to the dashboard."* — the family, 4 Nov 2026.
- All 52 companies researched one by one (ten batches, two waves; the second re-covered the fourteen a shared search budget had cut short), under the record's rules: a figure only where a source the research opened states it, a verbatim quote of ≤30 words on every source, dealer price pages and forums blocked. Every cited URL was checked to resolve (69 of 71; YourStory answers 403 to a script, one Hoopr page timed out and its round has a second source).
- `build-private-rounds --import <batch> --merge`: a batch joins the record the way the weekly refresh does. The refresh's own merge is now field-wise too — a round returned again keeps every figure it had, fills only a blank, gains sources; a figure stated differently is kept and logged as a conflict (two: DrinkPrime's 2020 amount, ₹21 Cr kept against ₹21.56 Cr; ADIA's USD equivalents).
- Reviewed out before import: Zepto's Aug 2026 placement keeps its amount (a floor) but not the pre-close "expected" valuations, which disagree; Zepto's ₹37.74 is a weighted average acquisition cost, not an issue price; Innoviti's $230 Mn from a broker's IPO page; Radiant's amounts read off yearly cash-flow totals (its ₹140 issue price is from the directors' report); StayVista's data-vendor valuation, which two vendors state differently.
- Record: 104 → 141 rounds, valued rounds 29 → 39 (companies with a valuation 13 → 19), per-share prices 22 → 55 (offer documents: InCred, Integris, Electromech, Sotefin, Radiant, EMA), family lines 7 → 40 (allottee tables, round reports, LLP partner registers), websites 26 → 41. Sixteen companies still print no round anywhere public; their notes say what was searched.
- Page: a valuation only a data vendor's page states is marked so (tiles, table `v`, chart tooltip); "Named in the filings" shows without rounds too; an absent valuation tile carries one line with the research note as its hover.

### Stage 10kq — RETURN THIS CALENDAR YEAR: YTD FROM THE FIRST DATE WE HAVE, NOT ONE FUND

- The family (4 Nov 2026) found Morning CIO's "Return this calendar year" card reading −3.5% on "1 of 509 holdings · ₹29.9 Cr · 1 accounts": Ajay's Helios 10355977 alone. The card opened every account on 31 Dec 2025 (`windowReturns`) and carried a holding only from a share count dated by then (`assumedHolding`). No statement here is dated before 31 Mar 2026, so the only account it could measure was the one bought in August, which opens at nil. The Returns tab's YTD, which the card opens, read the same single fund.
- The Portfolio Monitor's YTD has measured from the first date we have since Stage 10jl (with Stage 10jo's 1 January opening from a purchase record). The card and the Returns tab's YTD now read that record: `ytdSelection` in `ytdAvailable.ts`, off `ytdBook`'s `account` and `holding`. Each account is measured from its first verified value this year; otherwise each of its holdings is measured, either for the full year from its purchase record or carried from its statement balance at published closes (assumed). The whole account or its holdings, never both. Gaps keep their reasons.
- Offline (no price feed) the card reads 192 of 452 holdings across 20 accounts, +19.83%; listed shares and funds add more once prices load. Not a full year, so the card reads "YTD from first dated value"; its hover lists the value measured from each start date. Money first invested this year counts as a full year. `fullPeriod` and `starts` ride on every `availableCardReturns` result. "1 accounts" now reads "1 account".
- Checks: `availableCardReturns.test.ts` (YTD from 31 Mar, opened-at-nil full year, the archive reads at least FYTD's accounts) and `ytdAvailable.test.ts` (the pooled selection: purchase-record unit, whole account, refused account). `check:pages` route `cio-ytd-card` re-derives the card off `glowData.ts`. `cio-returns` fails the same four invariants as on main (DL-11, the period/type picker pair, missing-gain dashes), so they are left as found.
- **CI, red on main since Stage 10kl and 10kn.** This branch carries #334's fixes (Stage 10kv) file for file — the NSE `differs` test, the rapid-statement rehearsal leaving out folio 8652064's other statements, and the sector check's `securityLabel` — so either can land first. Of its own: `check-selected-attribution` re-derives YTD through `ytdSelection`, and `table-excel.mjs`'s Private Market filter check compares the Funds export with the complete one row for row on every column both carry. Stage 10kw gives each filter its own columns (Quarterly NAV and IRR, no YTD); the rows, 161 of them, are unchanged.
- **`ytdBook` takes the period's opening day** (`open`), so the three return cards share one engine. Leaving it out keeps 31 December, the year to date. A date opens any other period (31 March for the financial year). `null` opens each account at its own first record and each purchase-record holding at nil, the day before its first row. Only the parts after the open move: each account's start, each holding's anchor, and `recordedYearWindow`'s units, split check and dated rows. `YtdBook.yearOpen` becomes `open`.

### Stage 10kp — ICICI's "Cumulative" option is the growth option; Deepak Fertilisers gets its NSE symbol

*"This is showing only 362"* — the family, 4 Nov 2026, on Morning CIO's Return over available history card (362 of 509 holdings).

- Most of the 147 holdings left out are left out correctly: review lines valued on one date, AIFs with one valuation and no dated capital, holdings at cost, later trades with no newer balance, funds that pay out.
- `assumedHolding` refused every NAV whose scheme name did not end in Growth or Accumulation. ICICI Prudential files its growth option as "Cumulative", which `fundNavs` has always read as growth, so Equity Savings and India Opportunities (four holdings on the Motilal demats, ~₹48 Cr) were refused as payers. `Cumulative` / `Cumulative Option` now passes; a payout word still refuses. `assumedHoldingReturns.test.ts` covers both, plus a "Cumulative" strategy name with an IDCW option.
- `build-nse-symbols` override `deepak-fertilisers-and-petrochemicals` → `DEEPAKFERT`. HDFC Securities prints "Fertilisers" and no ISIN; NSE lists "Fertilizers" (INE501A01019). The book changed by that one symbol.
- HEG Graphite stays unmapped. SVAN's 30 Sep appraisal splits the same 8,220 HEG Ltd shares into HEG Advanced Materials (117.96) and HEG Graphite (309.42), which sum to the old 427.37: a demerger. HEG Graphite is on no NSE master, and `HEGAM` is the parent's price.
- DSP Gold and Silver ETFs (3 holdings, ~₹20.7 Cr on the Motilal demats) had no history. DSP split both ten for one on 28 Aug 2026 under new ISINs (Stage 10hq), and AMFI publishes only the successor. `marketInstruments` now asks for a fund by its `pricingIsin`. `market-history` puts a successor's NAVs before the ex-date on today's unit from `FUND_UNIT_ACTIONS` and lists the split, as Yahoo's close is split-adjusted. `assumedHolding` converts the 31 Jul count through `fundUnitBasis` and refuses when the history's splits and the documented terms disagree. A bullion ETF ("ETFs - Gold ETF" / "Silver ETF", AMFI's category now on the history) counts as the growth option. A plain ISIN alias would have read the tenfold drop as a ~90% loss.
- Measured off the book with today's public histories and corporate-action capture: the card's cover goes from 359 to 367 holdings (the page adds the live-priced shares). DSP Gold −3.7%, Silver −19.2% since 31 Jul; each close ties to the NAV overlay's value.

### Stage 10la — The three return cards: each investment from its first value on record, the rest held at last value

*"approve"* — the family, 4 Nov 2026, on the three cards' design (financial year, calendar year, available history).

- One selection for every card and the Returns tab: `periodSelection` in `src/lib/availableCardReturns.ts` runs the Monitor's `ytdBook` with the period's `open` (31 Mar, 31 Dec, or `null` for each part's first record), so a card and its table never disagree.
- Further first values, each only where its own evidence holds (`src/lib/periodRules.ts`, off `scripts/lib/periodEvidence.mjs` → `BOOK_EARLIER_BALANCES`, `BOOK_STATEMENT_UNIT_NAVS`, `BOOK_UNIT_WINDOWS`):
  - consecutive statements with the same units, so no money moved between them (Buoyant, Founders, Mirae, ABSL);
  - fund units at a NAV a later statement prints, linked by units that tie (Sanshi on Ajay's ICICI demat);
  - an older balance plus the broker's dated trades, which must reconcile to the units held now (Yash, the bank shares);
  - an older balance of the same units, opened on the first exchange close if the holding listed later (ESDS, NSE).
- Whatever public holding none of these measures is **held at its last value**: 0%, in the base from its valuation date, and named in the ⓘ with its reason. A price service that did not answer is "waiting for prices", never held.
- Every part is carried at its latest value to the card's end in the pooled measure (`AccountWindow.carriedTo`). A record that closes on 30 Sep is no longer read as money withdrawn that day, and each record keeps the date it actually measures.
- The caption shows coverage of public investments by value, split into measured and held, with private investments on their own line (Private Market's value and gain since investment, not this period's). There is one ⓘ per card, and the assumed label sits on the face.
- Merges #331 (DSP bullion ETFs across their split, ICICI "Cumulative", Deepak) and #342 (`ytdBook({ open })`). `build-upstox-instruments` is re-run, so Deepak (now on NSE) carries its listed ISIN to Glow Central Research, and the map also covers Man Industries, Kingfa and Sotefin on BSE.

### Stage 10lb — The seven "Not classified" holdings placed on the family's two axes

- *"Why are these not classified? … tell me where these need to go"* then *"Apply all seven"* — 4 Nov 2026. ₹96.7 Cr sat under "Not classified in the family's review" on the Monitor's asset-class axis.
- **HDFC Balanced Advantage · Regular (₹6.82 Cr) was a map gap, not a missing answer.** The review names it (Liquid sheet r4, Equity sheet r23) and both folios tie to its Transactions since inception by units (Ajay 83,001.863, Ankita 49,917.632). The map was keyed on the Motilal demat's `hdfc-baf-r-grow`, which matches only unvalued demat rows; HDFC MF's own folio statements spell the scheme out. One `FAMILY_TAXONOMY` entry, cited and checked against the workbook: Equity / Liquidity.
- **The other six are on none of the review's 25 tabs**, so they are the family's word (`source: "family"`), not citations: `FAMILY_SAID_CLASS` gains them and `FAMILY_SAID_BASKET` (new) carries their basket. Active Momentum: Equity / Thematic & Tactical (AMFI Sectoral/Thematic; the email's sectoral clause). Kotak Flexi Cap (Aarti) and the Nifty 100 Low Volatility 30 ETF FOF: Equity / Stable Growth, like every diversified equity fund in the review. Vantage Oak Fund I and both Nzuri lines (equity and Pref 24SP46): Alternate / Entrepreneurial Growth, like every private company and fund in the review.
- Asset-class axis: nothing current is unclassified. Basket axis: Franklin alone, as the family asked in Stage 10js (plus two sub-₹1,000 bank balances that `currentHoldings` drops).
- **Monitor tabs follow the table.** On Holdings the section tabs now come from `currentHoldings`, so a section only closed ₹0 funds sit in (asset class, once the seven were placed) offers no tab onto an empty table. Transactions keeps every position.
- **Vantage Oak on the Private side** (*"Move it now anyway"*): `DECLARED_AIF_CATEGORY` gains it as Category II on the family's word (no statement prints one), so `unplacedValue` ₹4.10 Cr → 0 and Private Market shows it under Private funds (₹274.6 → ₹278.7 Cr). The family accepted the cost: no document records its paid-in or cost, so the band's DPI/RVPI/TVPI are refused naming it, and the band's and the private total's HPR are refused (cost covers under 99.5% of value). The pooled XIRR still strikes over 7 of 9 funds and names it. Its own row reads cost —, every return — with the reason. `BRAND_NAMES` maps it; the book report's declared-category note now says a declared fund the family have not placed takes its category's side.
- Wording: a band's or the total's refused HPR now names every valued holding that reports no cost ("No cost is reported for …"), where it read only "covers only part of this row's value". A fund with no capital account whose statement prints no cost no longer reads "its statements report the holding and its cost".
- `check-pages.mjs`: `PM_RETURN_BOOK` re-expresses the page's 99.5% cost-coverage gate (`costCovers`, `costless`), and the four checks on the book's HPR footer (DL-16, PM-C1, FIFO hover, FIFO footer) hold a refused footer to its reason and names (`pmFootRefused`) when the book says the gate trips.
- Checks: `familyTaxonomy.test.ts` asserts the HDFC entry is the review's, each of the six lands on the family's word on both axes and repeats no review product, and no fund or company but Franklin is left without a basket. `aifCategory.test.ts` takes three declarations; a declared, unplaced fund's side is its category's. `privateBook.test.ts` asserts the band's multiple and HPR are refused naming only Vantage Oak, and strikes the DPI/RVPI/TVPI and DL-16 arithmetic on a build without it, so the day its paid-in lands those first checks fail. `privateMarket.test.ts` and `fundReturns.test.ts` follow. `check-pages.mjs`'s drill-down re-derivation reads `FAMILY_SAID_BASKET`.

### Stage 10ld — HDFC Securities 3110320's trade details report arrives: 466 dated sales, April–October 2026

- The client re-sent `3110320_Equity_Trade_Details_Report (3).xlsx` (523 KB), the file `november-2026-b`'s ZIP carried only as an 85-byte removal notice (Stage 10kn). It is in `source/november-2026-c/`. The other four files sent with it are byte-identical to the ZIP's and are not added.
- `providers/hdfcSecurities.mjs` `readTradeDetails` reads one transaction per fill. Holder, trading ID and window (1 Apr–31 Oct 2026) come from the header. Each row checks QTY × MARKET PRICE = MARKET VALUE to the paisa, and value less the nine charges and STT = NET AMOUNT to the rupee (the largest gap over 466 rows is ₹0.82). The printed holder must agree with `HOLDER_BY_TRADING_ACCOUNT`, and a fill outside the window is refused.
- The report prints no broker name. `classify.mjs` claims it for HDFC Securities only for a trading ID an InvestRight equity portfolio prints (`HDFC_SECURITIES_TRADING_IDS`).
- `lib/sheet.mjs` `readXlsx` now reads `<v xml:space="preserve">`; it had read the report's four two-line headers as blank cells. No other archived document changed.
- The 466 trades: Vedanta 67,000 and Man Industries 37,317, which tie the 30 June review's HDFC Bank block (1,77,000 and 5,17,317) to the 2 Nov portfolio (1,10,000 and 4,80,000), plus all 1,77,000 of each of Vedanta Iron and Steel, Vedanta Power and Vedanta Oil and Gas. `MAN INDUSTRIES (I) LTD.` is named onto the held `man-industries-india` on that evidence (`EVIDENCED_SCRIPS`, note `scrip-name-evidenced`).
- Book: 439 of the trades sit behind the two held positions (`BOOK_HOLDING_TRADES` 1,082 → 1,521). The 27 spin-off fills have no holding. Totals are unchanged. The account stays described by its equity portfolio, because the report sets no `providerEngagement`.
- A removal notice whose file is in `source/` under the same name is now "re-sent" (`attachment-resent`, manifest `resentAs`), not "never arrived". This flows through check:reads, coverage:source (class `re-sent`) and the Statement Library ("Re-sent" pill, no folder flag). The LKP pair stays never arrived.

### Stage 10lc — Every Monitor return carries its index line; a gap names its cause

- *"It should never show blank … read how we have fixed a lot of things here which would fill in a lot of blanks so no confusion."* — the family, 4 Nov 2026, on "N500 —" under a return and a total with nothing under it.
- Checked first: Sanshi Fund-I's N500 −0.4% is right. Its ten payments (21 Mar–16 Dec 2025, ₹157.5 Cr) bought into the Nifty 500 on their own days and valued on Sanshi's own 30 Jun 2026 statement date are worth ₹156.95 Cr (−0.35%), recomputed off Yahoo's ^CRSLDX closes.
- Filled (`PortfolioMonitor.tsx`, `holdingBenchmark.ts`):
  - an opened row's lines (each holder, unit class, mandate account, share in a mandate) carry their own index on their own dated money, a mandate account by its manager's printed index. Before this, about 600 figures in the Category view had nothing under them.
  - each contribution under a fund buys the index with its one payment (`onePaymentLeg`).
  - a holding bought once and never sold (the CAGR gate's own proof, `singlePurchaseGap`) buys the index on that day for its HPR and a YTD opened this year.
  - the footer and each section pool every row's legs, each closed on its own value date (`closeLegsOn`, `pooledLegs`), against the index the rows share, else the Nifty 500.
- A gap names its cause on its face, as the return cell's own dash does (Stage 10jm): `benchGapLabel` gives "No buy dates", "Dates incomplete", "Range only", "No dated capital" and so on. The hover now gives the row's actual cause (`undatedMoneyWhy`), for example units bought before a PMS manager's transaction statements begin, 86 of 516 units on a dated trade, or a review that dates only a span.
- Left as a dash on purpose: 91 of the default view's 94 HPR dashes are holdings no record dates, so their Investment date cell is "—" too. The other three are dated only as a span or in part: NSE and Manorama by the review's range, ZF Commercial Vehicle with 86 of 516 units on a dated trade. Mostly they are PMS shares (Goldstandard, Green Lantern, etc.) bought before each manager's transaction statements in the drop begin on 1 Apr 2026. They fill when those statements arrive back to purchase.
- Which money buys the index is decided before any close arrives, so a record gap shows at once. The feed's own state (closes loading, the price service down) keeps the plain dash with its reason as the hover (`IndexFigure.feed`, `data-bench-feed`). A label that changed as the fetch failed reflowed the table, and CI's navigation check restored scroll 16px short.
- `check:pages` (monitor): new invariant "every return carries its index line, and a gap in it names its cause" (`monitorBench`). Removing the footer's line makes it fail. The footer and section captures read the figure without its `[data-bench]` line, so "only the figure on its face" still holds.

### Stage 10lt — A holding's Transactions tab lists every buy, sell, switch and income

- *"If there is any transaction on any security or asset where dividends, or any income etc is coming it will show in transactions as buy sell or income … if now tomorrow interest payments come in how will you show and also say what happens when I redeem from somewhere and I invest somewhere else … populate if we have missed anything at all"* — the family, 4 Nov 2026, on Buoyant A4's Transactions tab, which showed one purchase out of ten.
- A holding's Transaction history now draws Data Audit → Transactions' own rows for it (`holdingRecordsFrom` in `consolidatedSheet.ts`, carried in `ledger/stocks/<key>.json` as `records` by `deriveHoldingLedgers`, on the build and the statement publication alike). These are trades, purchases, redemptions and contributions, switches, income and non-cash actions, each badged BUY / SELL / INCOME. Tax lots stay on Data Audit. First bought and Last added read the same rows (Buoyant: 1 Jun 2024, not 2026). 210 holdings gain rows; none loses one.
- Across a class switch the holding keeps its history. The Class A1 deposits the book carried into A4 (`carriedFrom`) are on the A4 page, marked "bought as Class A1". Each switch's two legs are one neutral SWITCH row, so Buoyant A4's buys add to the ₹70.85 Cr paid, and with the ₹58,862 reinvested gain distribution they add to its cost.
- Data Audit gains what it missed:
  - **Switches**: 186 legs (`kind: "reclassification"`), each its holding's Buy or Sell. They count as "Internal switch", are signed like a trade, and each names its other leg (the nearest-dated partner).
  - **Income on a fund's unit record**: 687 rows for IDCW reinvestments and payouts and Buoyant's reinvested gain distribution. That was ₹48.2 L the returns counted with no row. `build-book` now tags those `BOOK_HOLDING_INCOME` entries `via: "unit-record"` (and `earnedOn` where income followed a class switch); no figure moved. Every statement-sourced holding's Income rows now add to the income its return counts.
- **Interest is income the day it arrives.** `shared/incomeKind.mjs` is the single cash rule that `build-book` and `deriveIncome` both read: dividend, IDCW, interest, coupon, distribution. Bonus, split, spin-off, rights and mergers stay non-cash. Before this, an interest row would have been a blank corporate action, outside income. Today's archive has none, so nothing moves.
- Redeeming and reinvesting elsewhere: through the bank it is a Sell (redemption) on one holding and a Buy (purchase) on the other, each external capital to its account. As a switch it is a Sell leg and a Buy leg that name each other, internal, with no capital flow.
- The type badges are one `.txn-type` class with both themes defined. The old BUY tag was indigo-300 on ivory in light mode.
- Checks: `consolidatedSheet.test.ts` (cash rule, unit-record rows, income tie, switch legs, Buoyant's lineage, holding records); `readModels.test.ts` against `deriveHoldingLedger`.

### Stage 10lf — Return card coverage review: findings, the approved method and its outcome

- Why: the FYTD card read +20.0% over "203 of 509 holdings · ₹167.3 Cr" — about 13–15% of the book by value; the family read it as broken.
- Recorded in `docs/RETURN-COVERAGE-REVIEW.md`: the method discussed on 4 Nov 2026 (measure from the first value on record, labelled; mid-year arrivals in at market value; newly listed from listing day; private on its own line; coverage against public only), and the figure it gives — +13.0% (+₹55.8 Cr) on ₹932 Cr of ₹992 Cr public (94%), statement values and market closes to 3 Nov. Decided: build it (preview first); one-statement funds held at their last value until the next statement, which gives +12.3% on 99% of public.
- Six data defects: the ICICI "31 March 2026" holding statement is valued at 20 Jul closes; MOPWM share rolls do not reproduce sale proceeds; Clean Max 94,967 on two demats; NSE (listed 24 Sep) at the review's unlisted mark on the statement basis only, since the live basis prices it at BSE since 22 Oct; VOF (Vantage Oak Fund I) unplaced; Grand Continent and Parth are NSE SME listings, not private.
- Outcome: the family approved the method on 4 Nov 2026, and it is built in Stages 10la (#343: the three cards) and 10le (#350: the chart drawn as the card, Gain / Loss at 100%). Of the six defects, the ICICI 31 Mar pricing is fixed by Stage 10ku (#337) and Clean Max by Stage 10ky (#341). Each remaining one is in the review's own list.

### Stage 10le — Our book vs benchmarks draws the return card's own line; Gain / Loss covers every investment

*"how can our book by 6.1% when all the above things are showing 12% … everything should match … as i change time filters it would change"* and *"make coverage 100%"*, from the family on 4 Nov 2026.

- **The chart is the card.** `NavVsIndex` draws the selected card's selection (`availableCardReturns`, the same rows, histories and records as Morning CIO's cards). On each day it shows the card's figure as if the period ended there (`src/lib/periodLine.ts`), so its last point is the card to the decimal.
  - Each benchmark is the same dated money put into the index (`pmeWindowRows`), which is the card's own "vs" figure.
  - The picker offers the three cards' periods: financial year, calendar year and available history.
  - Over the available history the line is cumulative and the card is a rate a year (+70.7% over the period = +16.9% a year). A few small holdings reach back to 2023 and most of the money joins in 2026, so its early points rest on little money, and the hover says so.
  - Records carry their dated values between open and close (`AccountWindow.marks`: statement marks, published closes, printed NAVs). Nothing is interpolated.
- **Gain / Loss: 100% of investments.**
  - A holding is measured from its purchase record where there is one, otherwise from its first value on record. That second case uses the available-history card's unit, marked `sinceFirst`.
  - What neither measures is held at its value: no gain, in the base, named with the record it needs.
  - The caption reads "S% since investment · F% from first value · H% held at value".
  - Since investment accepts only units marked `sinceFirst` or `held`, so an assumed holding never stands in for a purchase cost.
- A held value is measured on its valuation date and only carried to the end, so it sets neither a card's dates nor its end (Stage 10la follow-up, `heldAtLastValue`).
- Checks:
  - `scripts/dev/page-book.ts` gives the page's own rows with no quote feed, and the cards are re-derived from it exactly.
  - Thirteen NAV checks that asserted the old engine (chained links, statement series, valuation-day starts) are retired. `NAV_CARD_LINE` strikes the new line against the cards.
  - `check-nav-assumed` is rewritten for the new line.

### Stage 10lg — Every Returns-tab period, panel and subtab reads the cards' one selection

*"Can you please sync all … FYTD +13.02%, Market performance +29.09% 362 of 509 holdings, YTD different, 1 Y different … it should all follow the logics and be complete for all holdings"*, then *"same since investement"* and *"invested this year fix all"*, from the family on 5 Nov 2026.

- **One selection per period** (`src/lib/useReturnSelection.ts`, `returnSelectionFor`). FYTD, MTD, YTD, 1Y, 2Y, 3Y and a custom date all read `periodSelection`, the cards' rule, each with its own opening.
  - Since investment, XIRR: the available-history card's selection.
  - Since investment, absolute: the Gain / Loss card's selection (`sinceInvestmentSelection`, now exported).
  - The headline, the attribution table, the capital bridge, Market performance and the Benchmarks subtab (`compareToIndex` on the same pool) all strike it.
  - A node test strikes FYTD, YTD and both since-investment figures against the cards on the page's own rows, to the decimal.
- **Market performance covers every holding** (`src/lib/selectionMarket.ts`). It is each holding's return over its own part of the period, from the same units, weighted by today's value.
  - The sources are a published close, a printed NAV or a statement value. A holding held at its last value counts 0%, and a whole mandate's return is each of its holdings'.
  - It is the period's move whatever the type picked, never annualised.
  - Private investments are reported apart on a period, as on the cards.
  - A history that failed to load is named with the source's answer (`code: 'source'`, the `detail` now carried through `ytdBook`). It no longer waits for prices forever.
  - The old figure was price-only on one shared pair of dates, so mandates, AIFs and unpriced units were out, and "since investment" opened on the youngest listing's first close.
- **Invested this year places every holding** (`placeEveryHolding`). A holding with no purchase lots this year is placed by the financial year's selection:
  - "held before this year" if it opens on a value on or before 31 March, or an older statement holds it then;
  - otherwise "first valued this year", counted from that value as the cards count it and named so in the table;
  - only what no record values stays in "dates or values to check".
- The capital bridge steps a period unit with no inception row from its first value, so Since investment · absolute no longer throws on a held unit.
- `check-market-returns` is rewritten for the new figure:
  - the total ties to its rows' value-weighted returns and is the same for every type;
  - its dates stay inside the period, allowing the 7-day opening tolerance;
  - NSE's 404 and Karur's failed load are named, and retry recovers them;
  - its clock moves to 5 Nov so the 31 Oct ICICI balances date the counts.

### Stage 10lu — Zepto is a company: Private Market draws a valued companies band

- *"Zepto is a private market company not a fund"* — the family, 5 Nov 2026, on Private market → By brand, where Zepto sat under PRIVATE FUNDS.
- The Private funds band was every private holding with a measured value, so Zepto — the one company the review values (Direct Equity - Unlisted, ₹22.8 Cr) rather than holds at cost — fell in with the funds.
- `privateBook.ts` now has a fourth section, `company` ("Private Companies ( Valued )"): a private, valued holding whose class is Unlisted or Equity and not a fund vehicle (`isPrivateCompany`). It is drawn under Companies and Both and starts open. Private funds keeps the funds; K M Global's loan (Bond) stays where it was.
- The Funds tile names the valued companies apart. The TVPI / DPI multiple's set is unchanged: valued funds and valued companies, never at-cost lines.
- `check:pages` follows it: `pmBandOf` re-expresses the band, PM_C_BOOK splits `funds.company` out of `funds.valued`, and the Companies view must draw the band while the book holds one.

### Stage 10lh — Review fixes to Stage 10lg: Invested this year places a holding only on its own evidence

Codex's review of #352, verified against the code and the book:

- **Held before this year** needs the same units on an older statement dated on or before 31 March, with no trade since (`heldBeforeYear`). Any older balance used to be enough, which hid units bought this year (2 holdings).
- **A mixed or partly sold record stays to check, with its reason.**
  - A record held before the year that money was also added to: 16 accounts, which used to be counted as older.
  - A record first valued this year that money was taken out of.
- **A first-valued row is purchase to value** like every other row. Its first value plus the money added since is what was paid, shared across a whole account's holdings by today's value, so value − paid = gain on every row and in the total. The row's value is the record's own close on its own date, never a later quote over money the record has not seen. It used to scale the account's gain, which did not tie.
- **Only a missing-purchases gap is placed** (`YearGap.need`). A verified purchase with no usable value, or a holding valued at cost, keeps its own reason.
- **XIRR and CAGR** annualise a first-valued debt holding as they do a purchased one. Equities under a year stay absolute.
- **Only a sale or withdrawal counts as money taken out.** A dividend or other income paid out, and the tax withheld on it (TDS on Payout, TDS Trf to Capital A/c), leaves the units held, so the holding is still placed. A redemption, or any outgoing flow the book can't classify, still counts.
- **A value dated before the first value is no closing value.** That holding stays to check.
- **"Held before" rests on the family's assumed-continued-ownership rule** (22 Oct): a dated balance that no later recorded trade contradicts.
- **An account opened inside the year starts on its first money in.** It used to open at nil on 31 March and was then read as "held before, with money added".
- **Market performance:**
  - a period reports private holdings apart even when a measured account holds them (`selectionMarket(…, { inception })`). That account's public holdings are left unmeasured too, since its return carries the private ones, under their own gap (`code: 'mixed'`) that asks for the holding's own return, not prices;
  - a holding held at its last value sets no row's dates (`MarketUnit.held`), and a row, or a total, that measured no dates claims none: it no longer falls back to the portfolio's dates.
  - on a period, its details list the public holdings with value, as the face's denominator does. The private investments reported apart are named in the Overview, with their count and value, and are out of the lists and totals. A row of private holdings alone still lists them.
- `check-nav-assumed` compares the line and its card on one snapshot of all four figures (return and gain, line and card). It waits until that snapshot matches and holds still for a second, since histories arrive one by one and the two redraw apart. A missing attribute fails rather than reading as 0, and a failure prints the snapshot.

### Stage 10lm — Right-click a holding to move it to another tab

- *"Allow the ability for any security or row to move any sub tab by doing right click — for example if i want to move DSP gold from alternate to any other i should be able to do so"* — the family, 4 Nov 2026.
- On the Portfolio Monitor's Holdings table, on the Category, Asset class and Basket axes, right-clicking a row (or the menu key on a focused control in it) opens a menu of that axis's tabs. The row's current tab is ticked. Once a row has been moved, the menu also offers "Move back". A toast confirms the move and offers Undo. A moved row carries a `moved` pill, with the tab it came from in the hover, and its tab heading says "N moved here". All Securities has no tabs, so right-clicking there keeps the browser's own menu.
- A move is a section name keyed by PRODUCT (`productKeyOf`), so a whole mandate, or every class of a fund, moves together. It is saved for everyone through `/api/placements` (the shared store, `placement:<axis>:<product>`), and painted first from `localStorage`. A move made while the store is down stays in the browser, and the menu says where it went; it is pushed on the next load.
- `familyPlacements.ts` is read first by `familyAssetClass`, `familyBasket` and the category branch of `groupKeyFor` (`categoryKeyFor`), with the new source `moved`. That puts the moved row in the same tab on Morning CIO, the drill-down, transactions, both Excel sheets and `isDebtHolding`. The review's citation is kept, so the review columns still join. `PortfolioContext` re-issues the book's arrays when a placement changes, so every memoised table re-sections. Morning CIO's allocation note names the moved value.
- Not offered as targets: "Not classified" (it names an absence), and on Category the PMS mandates, at-cost and unrouted headings, because each makes a claim a move cannot make true. A row already under one of them can still go back to it.
- Checks: `familyPlacements.test.ts` (`moved holdings`) covers the store (stale list, null clears, refusals, NOT_CONFIGURED) and DSP Gold moving from Alternate to Equity and back. It also checks that the citation is kept, an unknown tab is ignored, Carnelian moves whole on Category, and which targets are offered.

### Stage 10lv — Morning CIO's three return cards, minimal: the return, and how many holdings it covers

- *"We need to change the design of these card to make it more minimal … Return % in big bold … I rather see number of records covered over total records like before. Rest all … in (i) button"* — the family, 5 Nov 2026.
- Face (Annualised / history, calendar year, financial year): the label, the return large (`TileMetric.large` → `Kpi large`, 30px), then "N of M holdings" — public holdings covered (measured + held at last value) over every public holding with value (`coverage.publicHoldings`, `measuredPublicHoldings`, `heldPublicHoldings` in `availableCardReturns.ts`) — and a muted line with the measured end date (the standing rule) and "assumed" / "not annualised" where they qualify the figure. The value bar and the three caption lines are gone.
- The ⓘ opens on a short summary (`data-card-summary`): period and dates, gain, the Nifty 500 line on the same money (`CardBenchmarkLine`, moved off the face), holdings measured vs held, coverage by value with what waits for prices, and the private investments reported apart. The full working follows unchanged.
- Gain / Loss and Consolidated return keep their captions.
- Checks: `headlineMatches` reads "N of M holdings" against `data-card-public-covered` / `data-card-public-holdings`; the Stage 10ji face-index invariant skips the three cards and `check-selected-attribution.mjs` finds the index in their ⓘ; FYTD/YTD/history read the label, hover and caption where they read the removed second line; `check-latest-account-returns.mjs` takes the new caption.

### Stage 10lw — SVAN's 4 November reports: holdings and since-inception capital to 4 Nov

- *"Integrate all of these files into the dashboard end - to - end. These are futher data that we're received from the client"* — 5 Nov 2026. `source/november-2026-d/` holds five SVAN Velocity reports as of 4 Nov: the appraisal and capital register for 8710067 (Ajay) and 8710090 (Bharat), and 8710090's bank book. All five are read `ok` by the existing PMS-system readers. No reader change was needed.
- **Holdings move to 4 Nov** through SVAN's `newestWins` rule. 8710067 is ₹15.47 Cr over 46 equities and cash (was ₹16.22 Cr at 30 Sep). 8710090 is ₹10.21 Cr (was ₹10.71 Cr).
- **The mandate's capital since inception is now set** (`Account.capital`, `source: "capital-record"`). The fallback that builds it from the dated capital record checked the TYPED rows' reach (`capitalRecordTo`, 31 Jul for 8710067). It ignored the reach a tying register had just extended (`acct.capitalRecordTo`, 4 Nov). It now reads the extended reach. 8710067 has ₹14.50 Cr in and ₹1,66,345.65 out; 8710090 has ₹9.50 Cr in and ₹1,01,151.60 out. Both equal the registers' printed Total row to the paisa. The whole mandate is now struck on its capital, as for other PMS accounts.
- **A reissued bank book is no longer double-counted** in the unwitnessed-capital note (`bankBookCapitalWitnessed`). The 4 Nov bank book slots a late-settled dividend in earlier, so the 13 Jul and 25 Aug TDS rows print on a new running balance. A row key that includes the balance could not match the 30 Sep copy, so both copies were summed. Each day is now taken from the newest issue whose window covers it. Only 8710090's false "2 moves not carried" note changes.
- Still `—`: the FY-period return. No SVAN statement values the account at 31 Mar 2026, so `RETURN-COVERAGE.md` keeps "Opening valuation … missing". Eleven SVAN holdings also lose their Invested on date (240 → 229 book-wide), because the trade tapes end 30 Sep and no longer reach the 4 Nov holdings. The first needs a 31 Mar 2026 valuation; the second, SVAN's transaction statements through 4 Nov.
- `docs/INGEST-INVENTORY.md` / `ingest-inventory.json` are main's copies. A local inventory run without the vault passwords degrades them.
- Tests: `calcAudit` A8 now checks the rule on every PMS account whose capital comes from its dated record: the record must reach the holdings' date. It also pins 8710067's register totals. `datedCapital` takes its share-versus-mandate case from the first dated mandate holding one share its trades fully date and one they do not, since no SVAN share is fully dated any more.

### Stage 10lx — SVAN's trade tapes to 4 Nov: holdings dated, Shankara keeps its post-split ISIN

- *"integrate these as well"* — 5 Nov 2026. Five more SVAN Velocity reports, all to 4 Nov and all from each account's inception, went into `source/november-2026-d/`: the transaction statement and capital gain statement for 8710067 and 8710090, and 8710067's bank book. The existing readers read all five `ok` (285 and 224 trades, 85 and 69 realised lots).
- **Invested on returns to SVAN.** 41 of 47 held lines in each account are now dated by their own trades (0 before: the tapes stopped at 30 Sep). Book-wide, 311 of 435 holdings are dated (was 229). The FIFO realised gain on SVAN's current holdings now covers the whole life of each account: 8710067 rises from ₹41.0 L to ₹47.6 L, and 8710090 from ₹25.3 L to ₹29.3 L. The mandate's capital and its whole-mandate return are unchanged (Stage 10lw).
- **Still undated, with the reason shown:** HEG Graphite, Shankara Buildpro, Sharda Motor, Time Technoplast and V2 Retail. The tapes print trades only, never the bonus, split, demerger or rename that took each holding to its current count (Sharda and Time Technoplast hold exactly twice their bought units; V2 Retail ten times). Dating them needs each corporate action with its own source.
- **A split's retired ISIN and its successor are one security.** The 4 Nov capital gain statements reprint Shankara Buildpro's 19 May sale under INE24OJ01029, the ISIN after the ₹10 → ₹2 split; the 30 Sep issues printed INE24OJ01011. build-book's identity check read that as one key naming two securities and stripped the holding's ISIN. `ISIN_SUCCESSORS` moved from `build-upstox-instruments.mjs` to `shared/isinSuccessors.mjs` (`currentIsin`). The identity check, the publication verifier and the ledger's lot-ISIN borrowing (`ledgerModel.ts`) now compare through it, and the holding carries INE24OJ01029.
- **Vedanta INE205A01025 is one key.** SVAN prints the ISIN as `Vedanta Ltd` (`vedanta`, the book's key). Ajay's Motilal demat prints it as `VEDANTA LIMITED#EQUITY SHARES OF RE 1/- AFTER SPLIT`. A `KEY_ALIASES` entry joins the two, and `rekey:archive` moved the demat's 4 rows (the book was already joining them by ISIN, so `glowData.ts` does not change). The verifier's baseline now also remembers the key a `KEY_ALIASES` entry files each archived key under (`securityKeyOf(storedKey)`), so a reviewed re-key is not a "new split".
- `build-upstox-instruments --check` reports WOULD CHANGE on main too (it would drop HEGAM); left alone here.
- Tests: `publication.test.mjs` adds the successor-ISIN case (a third ISIN still conflicts) and the alias re-key case (an unaliased key still splits). `ledgerJoins` re-reads lot ISINs through `currentIsin`.

### Stage 10ly — Purchase dates carried through splits, bonuses and demergers

- Follow-up to Stage 10lx, at the family's go-ahead (5 Nov 2026). Five SVAN holdings per account held units no dated buy printed, so Invested on read `—`:
  - V2 Retail (10-for-1 split, ex 25 Mar 2026);
  - Sharda Motor (1:1 bonus, ex 4 Jul 2025) and Time Technoplast (1:1 bonus, ex 23 Sep 2025);
  - Shankara Buildpro (1-for-1 demerger from Shankara Building Products, record date 24 Sep 2025, then a 5-for-1 split, ex 8 Oct 2026);
  - HEG Graphite (1-for-1 demerger from HEG Advanced Materials, record date 7 Sep 2026, whose own 5-for-1 split was ex 18 Oct 2024).
- **`actionReplay` (`scripts/lib/holdingTrades.mjs`) replays a holding's trades through those actions, first-in, first-out.** An action applies before that day's trades. A split or bonus multiplies the lots held, keeping their dates. A demerger hands the child the parent's lots held on the record date, times the entitlement, with the parent's purchase dates. SVAN's own capital gain statement dates the 19 May 2026 Buildpro sale to the 29 Oct 2024 parent purchase, and the replay sells exactly that lot.
- **Every action is sourced, and every replay must land on the statement (`scripts/lib/shareActions.mjs`):**
  - Splits and bonuses are rows of the saved NSE capture, refreshed here to 5 Nov (`import-corporate-actions`). They are read only inside the capture's verified window and only where the symbol's rows name one ISIN (through `currentIsin`).
  - Demergers are cited in `shared/demergers.mjs`: Shankara's 12 Sep 2025 record-date filing to NSE, and HEG's record date from the capture with the 1:1 entitlement as reported from its filing.
  - Any other non-dividend action in the window refuses the replay. So do Goldstandard's Zydus buyback and Carnelian's PVR INOX buyback, and LIC, whose window starts after the units were bought (each named in BOOK-REPORT).
  - The replay must end on exactly the units held. A demerger's parent must also close on exactly what the statements hold of it (nil for both parents here), which proves its trades started from nothing.
- **`Position.actionRecord`, read by the Invested on column only (source `action-trades`).** `tradeRecord` keeps its meaning (the trades alone hold every unit). Its `unaccounted === 0` readers (`holdingFlows`, `holdingPeriodOf`, `investedThisYear`, check-pages' money-weighted mirror) replay the trades' money, and a demerged unit's money was paid for the parent. The display-time bonus rule (`bonusPurchaseDates`) is checked first, so ZF keeps its `bonus-trades` source.
- Dated now: every share line in both SVAN accounts (only the cash lines stay `—`). Sharda Motor and Time Technoplast show through the display-time bonus rule once the capture covers 4 Nov, and the other six through `action-trades`. V.E.C 128004's Nuvama is also dated (353 bought on 5 Aug 2025, 1,765 after the 5-for-1 split of 26 Dec 2025). No figure changes: `glowData.ts` only gains `actionRecord` on 13 positions.
- `fundNavs.test.ts`: the refreshed capture now names TEGA, which the adviser report's trades roll to 8 Oct. Its fixed 25 Sep quote check now leaves out shares rolled past that quote, which are priced by design only on a later one.
- Tests: `holdingTrades.test.mjs` adds 8 constructed cases covering split, FIFO after a split, a bonus, a one-unit miss, a buyback refusal, a stale capture and a demerger, with and without the parent's control. `investedOn.test.ts` checks four SVAN lines and that every action-dated line keeps a not-trade-complete `tradeRecord`.

### Stage 10lz — Returns tab: no separate Market performance card

*"What is the Market performance section … is it causing unnecessary confusion and doesn't make sense. Either remove it if it is showing any redundant data …"* — the family, 6 Nov 2026.

- The card was the attribution table's Total row Market return cell set beside Investment performance as a second headline: same holdings, same figure (`check-market-returns` already asserted the two were equal), same details popover and Retry. It is gone. The market return stays a column, per row and on the Total row.
- Investment performance is the one summary block and spans the row: the return beside its opening → closing ledger on a wide screen, stacked on a narrow one.
- The panel wrapper (`[data-segment-returns]`) carries the total's `data-market-*` handles; Retry is the Total row details' Missing tab (`data-market-retry`). The column's hover says it is how today's holdings moved, not the return on the money invested.

### Stage 10ma — DSP Silver ETF: the sale the family confirmed is applied

*"according to the client they have sold dsp silver etf and it should not be showing up in holdings"* — the family, 6 Nov 2026.

- Shown on Ankita's Motilal demat 1201090012838316: 1,23,000 units on the 31 Jul statement, valued live as 12,30,000 at AMFI's NAV across DSP's 28 Aug 1:10 split (Stage 10hq). MOPWM's 23 Oct report (folio 466887, rows 21484–21488) shows 2,30,000 bought on 30 Sep 2025, 1,07,000 sold on 22 Jan, the Corpus Out/In split on 28 Aug, and all 12,30,000 redeemed on 13 Oct for ₹2,56,48,310.01. ₹2,55,04,778.88 of Liquid BeES was bought the same day. The fund-row hold (Stage 10iw) kept it on screen.
- **`FAMILY_CONFIRMED_FUND_SALES` + `rollMopwmFundSales` (`scripts/lib/mopwmTransactions.mjs`).** A confirmed owner/ISIN releases its report rows. They roll the balance to nil only where: the name is an exact alias; the rows sit in one folio; every row is a tied purchase or redemption, or the Corpus block of the split `shared/fundUnitSplits.mjs` records; one demat records the ISIN; the replay holds exactly the statement's units on its date; and the record ends at nil. The roll joins `BOOK_SHARE_ROLLS` with `report.sheet` "Mutual Funds" (realised ₹2,30,93,912.99 over the whole record).
- `unpricedStatementUnits` gate 8 (`soldSinceStatement`): a fund line sold to nil is not held on the live basis. The statement basis keeps the 31 Jul snapshot. check-pages' re-expressed model carries the same gate. The account note and Family Entities hover say "sales", not "exchange trades", when a fund is among them.
- **`recordedLines` (`src/lib/recordedHoldings.ts`) drops a statement line `soldSinceStatement` finds.** The stock page, Monitor pick-list and search read it. They still listed a balance sold to nil as "units held · not valued". That covered the five shares Stage 10iw rolled to nil (Ankita ICICI 14,500, Axis 7,300, SBI 27,750; Ajay IFB, NLC). /stock/dsp-silver-etf now reads Position closed.
- Not applied, still waiting on the family: every other fund row, including Ankita's DSP Gold ETF (2,05,000 → 20,50,000, redeemed 23 Sep on the same folio).
- Tests: `mopwmTransactions.test.mjs` adds the gate cases and the real folio; `shareRolls`, `unpricedUnits`, `fundUnitActions` and `recoveredCosts` read the split mechanics without the rolls and assert the sold line is gone.

### Stage 10mb — DSP Gold ETF: the same folio's sale applied

*"Yes, remove Gold"* — the family, 6 Nov 2026, on Stage 10ma's open item.

- Ankita's Motilal demat 1201090012838316 records 2,05,000 DSP Gold ETF units on 31 Jul. MOPWM's folio 466887 (rows 21164–21167) shows them bought on 22 Jan for ₹3,01,93,698.90, split 1:10 on 28 Aug, and all 20,50,000 redeemed on 23 Sep for ₹2,99,99,805.02 (realised −₹1,93,893.88).
- One entry added to `FAMILY_CONFIRMED_FUND_SALES`, plus the `DSP Gold ETF-G` alias. `rollMopwmFundSales` reconciles it on the same gates; the book changes by that one roll.
- Aarti's DSP Gold (1201090012838335, 11,95,000 → 1,19,50,000) is untouched and still valued; her folio 470582 shows no sale.
- Tests: the split-mechanics suites read Ankita's lines without the rolls, and assert only Aarti still holds DSP Gold.

### Stage 10md — Sectors: screener.in for every company; Sector Composition counts equity only

*"Make sure to use same sector classification for all the holdings, for eg. if you're using sector classification based on screener.in then every holding should be based on it only"* and *"in sector composition we need to show only equity asset class exposure in sectors … gold/silver/debt holdings … should not be included"* — the family, 6 Nov 2026.

- **One classification.** `companyExposure` placed a company by the first source that answered: its statement (each platform's own taxonomy), then a fund's AMFI industry, then screener.in. Before: 90 by a statement, 327 by a filing, 57 by screener, 174 issuers unplaced (₹43 Cr). Now screener.in places every company it has a page for. A fund's filing places a company only where screener has no page, and the statement only where neither does.
- **`npm run build-sectors` asks about every company the page can draw.** `scripts/lib/sectorUniverse.ts` runs `companyExposure` itself over the book, the depository's funds and shares, and every equity line the funds disclose (550 companies). Each is joined to a listing in this order: the app's symbol, exact ISIN in NSE's mainboard/SME masters, a unique issuer code, a unique `securityKeyOf` name, or the reviewed `LISTED_AS` table (BSE-only listings such as Yash Highvoltage, Sotefin Bharat, NSE India's own BSE listing 544937; renames such as Affle 3i and LTM; listed REITs/InvITs). Each page must echo its NSE symbol or BSE code, or agree on name. 542 of 550 are placed. `src/data/screenerKeys.json` carries company key → listing for the ones the app's symbol does not reach.
- **GICS comes from screener's Broad Industry**, which is the AMFI industry list funds file under, so a filing-placed company and a screener-placed one go through the same `shared/sectors.mjs` entry. The Sector level is used only where the map has no entry. `"Diversified"` → Industrials was added (3M India, Godrej Industries).
- **Sector Composition is the equity sleeve** (`equityOnly` in `sectorRollup.ts`). A Consolidated row's derived half is `derivedEquity`: no debt paper, no CD/CP by ISIN type, no liquid/overnight scheme, and no balanced-advantage equity disclosed gross of hedges. Debt-only issuers (T-bills, NABARD, bank CDs) are no longer rows. What is left out (`fundsLeftOut`) is named under "Not on this page" and in the derived figure's hover. The figure is now "Equity their funds disclose". The Returns tab's sector attribution reads the same sets.
- On the committed book: 425 issuers on Consolidated, 421 placed by screener.in, 4 unplaced (₹0.76 Cr: HEG Graphite, Gujarat Gas, GSPL India Transco, Talwandi Sabo — demerged or merged, no classified page). Direct Equity: 28 of 28 by screener.in.
- Captions on Family & Entities, Data Refresh, Monitor and Returns name the new order. check-pages' tier re-expressions (`placeOf`, `MANDATE_SECTOR_BOOK`, XA-11, the Monitor index) read screener first. `SECURITY_AXIS_BOOK.sector` carries the equity sleeve the page is held to.
- Tests: `screenerSectors.test.ts` (Broad-Industry mapping, BSE-code joins), `monitorSectors.test.ts` (a filing moves only a company screener has no page for).

### Stage 10mc — Realised and unrealised: gains and losses apart

*"Show realised losses separately and confirm to Yamini that realised gain is net of them"* — the family, 6 Nov 2026.

- **Checked: realised is net on every account.** Every record behind it is signed: a statement's realised line (5 PMS accounts on FYTD), a fund folio's FIFO `realizedPnL` per scheme redeemed in the window (12), and since investment each holding's FIFO result or a whole mandate's capital residual (105). FYTD to 6 Nov: net +₹4.98 Cr = gains +₹7.04 Cr − losses ₹2.06 Cr.
- `capitalBridge` adds `realisedGains / realisedLosses / unrealisedGains / unrealisedLosses`: each record's signed figure by sign, at the finest record that carries it. A fund record keeps `realisedBy` per scheme.
- **Capital gain lots.** `realisedByYear` entries now carry `gains` and `losses` (Σ of lots by sign; `gains + losses = st + lt`). Where a statement's FY or since-inception lots add to its realised line within ₹1, the bridge reads them (`lotsBehind`). Carnelian 3517383's −₹17.6 L FYTD is +₹1.88 Cr lot gains and −₹2.06 Cr lot losses, 29 lots. Before this, a per-account split would have shown its loss as −₹17.6 L.
- The Gain breakdown shows Realised · net and Unrealised · net, each with Gains and Losses beneath it (`data-bridge-part="realised-gains"` and the other three). By account adds Realised gains and Realised losses columns, and the total ties. The info card names every loss-making record and every statement whose realised is one line with no lots (Goldstandard 100022, 100023).
- Window unrealised is still an account's residual, so its gains and losses are netted per account. Since investment they are per holding or mandate.

### Stage 10me — Later transactions update the holdings: MOPWM's fund trades and full exits

*"why were we not considering the sale transactions to update the holdings data? … If we have transaction data that shows buy or sale transactions then those should be considered to update the portfolio"* — the family, 6 Nov 2026.

- **Root cause.** The live roll-forward of MOPWM's 23 Oct report covered SHARES only (Stage 10iw, at the family's 28 Oct choice). Its Mutual Funds and PMS_AIF_SP rows waited on the family's answer about the 1 Oct "redemptions". So every fund sold after a 31 Jul Motilal statement stayed on screen. Stages 10ma/10mb released DSP Silver and Gold one confirmation at a time.
- **The 1 Oct question, answered from the data.** On 1 Oct the report "redeems" every fund balance on all five Motilal demats. Seven of them reappear unit for unit on AMC folio statements dated after that day (Kotak 5372722/7111389, Bandhan 8652064/8691267, Helios 10056128/10056154/10063876), and none contradicts. So a demat-folio redemption of a whole balance on a day another statement of the owner witnesses is a **transfer of custody**, never a sale.
- **`rollMopwmFundTrades`** (replaces `FAMILY_CONFIRMED_FUND_SALES` / `rollMopwmFundSales`) rolls each Motilal demat fund line on the report's later fund trades where:
  - ONE group of the owner's rows names AMFI's scheme for the line's ISIN (`sameScheme`, plans told apart);
  - that group holds the line's exact units on the statement date;
  - every row ties;
  - no sale over-sells.
  The roll stops at a transfer (`transferredOn`). Applied: Ankita ABSL BAF 3,93,096 → 0, HDFC BAF 37,755 → 0, DSP Silver/Gold → 0; Bharat ABSL BAF 1,83,500 → 7,660, ABSL Liquid 2,64,721 → 1,856, ICICI BAF 1,46,857 → 33,257; Bharat's family trust Kotak Arbitrage 6,13,294 → 32,694. A sub-division alone is no roll (`fundUnitSplits` converts it).
- `unpricedStatementUnits` values a rolled line at the roll's units and FIFO cost (`rolledSinceStatement`); check-pages' model mirrors it.
- **`mopwmCapitalExits`**: a PMS/AIF folio the report pays out in full after its statement (at least the value it struck, nothing paid in) rolls to nil on the live basis: MO Delphi, ₹11.25 Cr on 16 Jul vs ₹11.13 Cr on 30 Jun. Smaller capital rows carry no units and are named in BOOK-REPORT (Neo Infra's 9 Jul distribution).
- Audited, nothing to apply:
  - Ajay's Man Industries, Manorama, Tech Mahindra, Zaggle and Birla Cable sales (no alias) are of Motilal 539150 balances no statement records.
  - AMC-folio accounts' statements already postdate their report rows.
- Still open, in a follow-up: Green Lantern 510854/510861. Their own tape runs to 22–23 Sep (sold out of Gujarat Ambuja, Graphite India, GMM Pfaudler, Ratnamani, Bajaj Auto; bought IEX, HEG AM, Elgi). It is refused because no depository or capital-gain witness exists. A correct roll also needs the cash line, the bought names and HEG's 7 Sep demerger. Baring's 3 Aug ₹50 L call is also open: no units.
- Tests: `mopwmTransactions.test.mjs` covers the gates, transfer days, partial sales and capital exits, on constructed rows and the real report. `shareRolls`, `unpricedUnits`, `recoveredCosts` and `corporateActions` assert the rolls. The `concentration` and `searchIndex` twin-key checks build a constructed pair when the live book has none (the last pair is sold).

### Stage 10mf — Private Market weights are of the filter shown

- *"When we are seeing only the companies filter or the funds filter then the weightage of investments should be measured for that particular filter only."* Weight at value and Weight at cost divided every row by the whole private book, so under Companies the two company bands read 5.7% + 77.2% at cost (8.2% + 72.5% at value) beside a fund band that was not drawn.
- `weightBase(book, sections)` in `src/lib/privateBook.ts` totals value and cost over the bands the selector draws (same basis as `privateValue` / `privateCost`: valued holdings, each once, a costless one named). Companies now reads 6.9% + 93.1% at cost, Funds 100%, Both unchanged. The headings name the filter's own total.
- `privateBook.test.ts` [F] and check:pages `PM_WEIGHT_SHOWN_CHECK` (on `private-market-default`, `-show-funds`, `-folios`): the drawn bands' weights add to 100% at value and at cost under every filter.

### Stage 10mg — The LLPs' Nzuri shares are Real Estate

- *"Glowterra LLP and Glowsphere LLP: show their Nzuri Pune Knowledge Park holdings under Real Estate — as line items on the Real Estate tab and as real-estate exposure on the Category / Asset class views, counted once in the total."*
- `REAL_ESTATE_KEYS` in `src/lib/analytics.ts` is the one list (the two Nzuri keys). `holdingBucket` files them under `REAL_ESTATE_BUCKET` after cash and before the at-cost section, and `FAMILY_SAID_CLASS` gives them the family's new class, Real Estate (`FAMILY_CLASS_ORDER`: Equity, Debt, Alternate, Real Estate, Cash). The basket stays Entrepreneurial Growth. The same four positions move: Category's at-cost section drops ₹63.50 Cr and Real Estate shows ₹63.50 Cr. Both axes still add to the same NAV. The section is still at cost, so it shows no gain and `costCoversSet` refuses its return. Real Estate is not a Category move target. The Monitor band links to `/real-estate`.
- Real Estate lists the four lines (`data-book-holding`) under the property rows. They come from the scoped `portfolio`, not the property store, and cannot be edited there. Value and cost add into the tiles and the footer once each ("N holdings via entities"). Appreciation, tax, rent and the property fields render `—` with their reasons, and every total that leaves the holdings out says so in its hover. A property filter hides them; search matches them.
- Tests: `familyTaxonomy.test.ts` (Real Estate on both axes, nothing else filed there), `familyPlacements` and `portfolioExcel` list five classes. check:pages re-derives the bucket off `REAL_ESTATE_KEYS` in its five copies of `holdingBucket`, adds Real Estate to the asset-class sections, and gives Morning CIO's sweep a tenth allocation slot (`BUCKET_SLOTS`).

### Stage 10mh — Green Lantern: the account's own tape rolls the whole mandate

*"Yes, do Green Lantern"* — the family, 6 Nov 2026, on Stage 10me's open item.

- **Root cause.** Green Lantern 510854/510861 hold 27 Jul statements, but their own transaction statements run to 22–23 Sep. Stage 10dw's per-holding roll needs a depository balance or capital-gain lots to witness a tape, and a PMS has neither. So about 70 trades per account were on no page. A per-holding roll would also have been wrong for a mandate: a sale moves value into the cash line, and a purchase adds a name the statement never held.
- **The witness is the manager's own 22 Sep fact sheet.** Its Portfolio Holdings table prints every line's market value, including cash, the Axis Liquid fund and the dividend receivable, and the lines add to the printed portfolio value (₹5,87,49,582 / ₹11,60,19,848). The reader always parsed the figures (`readSectors` → `rows`) and dropped them. It now keeps them apart from the holdings as `factSheetValues` (never a holding, as `readSectors` has always held). A NUMBERED line named like a subtotal ("31 Cash") is now kept there; only an unnumbered one is a subtotal.
- **`rollAccountTape`** (`scripts/lib/tapeRoll.mjs`) rolls the whole account or none of it. Gates:
  - the fact sheet postdates the statement, the tape reaches it, and its lines add to its value;
  - no line goes below nil;
  - no split or bonus falls in the roll (the saved NSE capture); a registered demerger allots its child on the record date (HEG Graphite, 1:1 on HEG AM, 7 Sep, `shared/demergers.mjs`);
  - on the fact sheet's date the roll holds exactly the names it lists, and it lists nothing else but cash and receivables;
  - every printed value over the rolled units is within ×2 of the tape's own last price (a demerger's parent and child together).
- **Marks and cash.** Each line is marked at value ÷ units (`rolledForward.price`, dated, read by `rolledPosition` and check-pages). Cash is the fact sheet's cash, settled for any later trade; a cash line it no longer prints is nil.
- **Cost.** A name sold after the 27 Jul capital-gain statement carries no cost or realised figure (null). A name only bought adds its buys. A name the statement never held is FIFO on its own trades. HEG's parent and child carry none: no apportionment is on record.
- **Bought names** (IEX, HEG AM, HEG Graphite, Elgi, the receivable) are `BOOK_TAPE_ROWS`: live rows through the corporate-action layer, so quotes price them. The statement basis keeps the 27 Jul snapshot.
- **A whole mandate's uncosted lines no longer withhold its return.** Its return is its capital bridge, (value + withdrawn − paid in) ÷ paid in, and no line cost enters it. `fifoTotals` exposes `wholeUncostedValue` and leaves it out of cost coverage, and so do the Monitor section total and Morning CIO's category row. check-pages' realised model now carries the uncosted value into the realised half, as the app does (B8).
- **The period window of a roll with a later dated mark opens on that mark's date** (`applyCorporateActionQuotes`), never the statement's.
- Only three archived documents change: the two Green Lantern 22 Sep fact sheets and V.E.C 128005's 30 Sep one. `keepUsableFactSheetValues` (extract) keeps the figures only on an account's newest fact sheet that postdates its holdings. `statements:verify`: verified.
- Tests: `tapeRoll.test.mjs` (every gate on constructed rows, a demerger, and the committed book's bought rows).

### Stage 10mi — Real Estate: no empty-state row above entity holdings

- The family asked to remove the "No properties added" section: with no property entered, the table drew that row (with its Add property link) above the four Nzuri holdings held through Glowsphere LLP.
- The empty-state row now appears only when the table has nothing at all to show — no entered property and no entity holding. The header's Add property button is unchanged.
- `scripts/dev/check-real-estate.mjs` and `check-real-estate-bulk.mjs` wait for the entity holding rows and assert no empty-state row, instead of waiting for that text.

### Stage 10mj — HPR's hover names the dividends it holds

*"verify and tell me if HPR is absolute return or something else?"*

- HPR is the measure keyed `absolute`: FIFO (unrealised + realised + recorded dividends) ÷ (cost held + cost sold), cumulative, not annualised. All 382 costed positions in the book tie to that formula; the 174 with `dividendReceived` include it.
- The picker hint (`RETURN_MEASURES`) and the Excel export note still said individual-share returns exclude dividends — true before Stage 10fb, wrong since. Both now name the dividends; Morning CIO's header already did.

### Stage 10mk — Morning CIO: smaller tiles, no All alerts tab, Returns breakdown in its (i)

*"Without changing any content on the tiles make them smaller … Also remove this all alerts … In returns if i have to view breakdown you can simply give an (i) view which can make it completely and simply visible as a popup instead of taking so much space."*

- **Tiles.** `Kpi`'s `compact` (Morning CIO's strip only): tighter padding, the return figure 24px (was 30), smaller second and caption lines, 12px gaps. Same lines, figures and controls. A tile's remove × shows on hover or focus, on a solid chip, because the tighter caption runs into its corner. A touch screen always shows it. In the header it narrowed the headings: `check-pages` caught "Return this financial year" wrapping with room to spare. The strip is about a fifth shorter at 1280px, and the panel under it starts 4px higher.
- **All alerts.** The tab, its badge and `AllAlerts` are gone, with what only they read (`usePriceAlerts`, `ResearchSummaryLine`, `useResearchSummary`, `KindPill`, `alertBoxesHref`). `?tab=alerts` lands on Daily Movers. A price alert is still set on its company's page, and its box says when it is reached; that card's "All alerts →" link and the search entry are gone. check-pages drops the four `cio-alerts*` walks and asserts five tabs and no badge (on `cio`, `cio-returns`, `cio-ytd-card` and `cio-tiles-saved` the sweep finds nothing main does not); check-family-inputs clears a level in its box instead of on the tab.
- **Investment performance** is one row: what it covers and the return. Its (i) opens the breakdown: start to end beside the gain's parts, the dates, By account (names wrap so the figures show) and How it is built. The card keeps every `data-bridge-*` figure; `check-selected-attribution` opens the popup to assert the steps, parts, rows and working.
- CI's attribution step was already red on main (the MTD return check, 0.1010 vs 0.1012), and `check-assumed-holdings`' bridge identity fails on main too. Neither is touched here.

### Stage 10ml — The HPR column is headed "HPR - Absolute"

*"rename the column heading as HPR - Absolute so that it is clear that it is an absolute return only. Do this universally on the dashboard."*

- `ReturnMeasureDef` gains `heading`; every return column heading reads it (Portfolio Monitor holdings and transactions, Private Market). Morning CIO's allocation column is "Return (HPR - Absolute)".
- Cells, the picker and the Excel Measure column keep the short `HPR` tag, so every `res.tag !== def.tag` comparison is unchanged.
- `check-pages`: the two header-label invariants read the new heading.

### Stage 10mm — Main's CI green again: the bridge counts a purchase record's money; the check reads the tape rows

*"Yes, fix it"* — the family, 10 Nov 2026, on main's CI, red since 5 Nov.

- `capitalBridge`: an assumed row from a purchase record (`recordedYearWindow`) now takes its purchases as money added and its sales and income as money taken out. Since SVAN's tapes dated its holdings (Stage 10lx), its start + added − taken out + gain missed its end by ₹28.5 L (`check-assumed-holdings`). A row with a sale on its record stays unsplit, saying why.
- `scripts/dev/page-book.ts` passes `BOOK_TAPE_ROWS` through the corporate-action layer as `PortfolioContext` does (Stage 10mh). Without them `check-selected-attribution` left out Green Lantern's ten tape-only lines (₹65.2 L) and read MTD at 0.10117% against the page's 0.10100%, stopping CI's browser step before the bridge check.
- `ytdAvailable.test.ts`: the bridge ties for a sale, a since-first and a purchase-only window; it fails on the old bridge.
- `check-source-trace`, which CI had not reached since 5 Nov: the trust's Kotak units are rolled by MOPWM's later trades (Stage 10me), so the cell is a sources button saying so, citing the 31 Jul row without its printed count. ICICI and Invesco keep the Total Holding highlight.
- `check-etf-unit-continuity`, likewise unreached: DSP Silver and Ankita's DSP Gold are sold (Stages 10ma, 10mb), so it reads Aarti's 1,19,50,000 Gold units in one account, Silver as a closed position, and neither search lists Silver.

### Stage 10mn — Morning CIO's tiles, compressed: Gain / Loss's coverage moves into its (i)

*"Remove this from this tile and i think you cna further figure out as the worlds best family office dashboard ui maker how to compress them more … so they dont take so much of space"* (10 Nov 2026).

- **Gain / Loss.** The coverage bar and its two lines ("Covers 100% of investments …", "63% since investment · 17% from first value · 20% held at value") leave the face. They open the tile's (i) as `data-card-gain-summary`: the share covered, the bar and a keyed row for each part with its % and value. The bar's "held at value" share is `bg-slate-500` (warm grey in light mode) because light mode painted `bg-ink-600` the same gold as since-investment. The coverage handles (`data-card-coverage`, `data-card-since` and the rest) are on the figure now.
- **Compact tiles** (`Kpi`'s `compact`, Morning CIO only) drop the decorative icon, which repeated the heading and took the width a heading needs on a six-column strip. The 24px (i) target hangs into the padding, so the header row is as tall as one heading line. A tile with no caption and no delta renders no empty caption row.
- **The picker heading takes its column's full width**: `-ml-1` had shifted the button 4px left and left those 4px empty on the right. With the icon gone, `check-pages`' dense strip caught "Return over available history" wrapping within 3px of its "room to spare" line.
- **FYTD / YTD headings** read "FYTD return" / "YTD return" on the face, the Returns tab's own pill names for the period each one opens (`TileMetric.short`). The picker's menu, the tile's accessible name and the picker's hover keep "Return this financial / calendar year". The return cards' count line is 11px and their date line 10px, matching the strip's other second lines.
- Measured on this book at 1440px with value, gain, annualised, YTD and FYTD: the strip goes from 150px to 114px. The tallest tile here is the short-history card, whose heading "Return over available history" is required by CLAUDE.md. On a book whose history is a year or more, that card reads "Annualised return" on one line.
- `check:pages` (`cio`, `cio-ytd-card`, `cio-returns`, `cio-tiles-saved`, `cio-tiles-dense`, `cio-return-metrics`, `stock`, `stock-fund`, `mandate`, `private-company`): every failure left is on main's build too (DL-11 invested line, the gain card's covered count, three Returns-tab checks, `stock`'s table fit, `monitor`'s sector rows).
- Checks: `headlineMatches` asserts the gain card's face carries no caption; the destination probes accept "FYTD return"; `check-selected-attribution` asserts the coverage is in the (i), not on the card.

### Stage 10mo — Morning CIO's tiles stay on one row at any desktop width; ADD TILE is the row's end column

*"I tihnk they still need to be smaller when they rearrange , look how small my bottom returns table look think as the best ui designer in the world"* (10 Nov 2026, from a 1278px window).

- **One row by the strip's own width.** `.grid.kpi-grid` dropped to three columns below 1280px, so five tiles plus ADD TILE took two rows and the Returns panel lost a row's height on a page that does not scroll. The grid is now `repeat(auto-fit, minmax(max(9.5rem, 100% / --kpi-cols), 1fr))` from 640px up. Tiles share one row while each is at least 9.5rem wide, up to `--kpi-cols` (the tile count, at most six), and wrap only below that.
- **ADD TILE is the row's narrow end column** (`AddTile`'s `column`, Morning CIO only): 4.5rem wide, as tall as the tiles, dashed, "ADD" over "TILE" in bold. It sits outside the tiles' grid, so six tiles are still one row. Its menu opens from the column's right edge, 16rem wide. On a phone it is a short bar under the tiles. Private Market's card is unchanged (the size of a tile, Stage 10cl). Pressing it scales to 0.97 (`motion-safe`).
- Measured at 1278×680 on this book (value, gain, annualised, YTD, FYTD): strip 207px → 114px, tiles 340px → 185px wide each, and the Returns panel starts 93px higher.
- Checks: `tilePickerChecks` takes `addColumn`. On Morning CIO, ADD TILE is an empty dashed column as tall as the tiles and narrower than one, reading ADD TILE in bold. It shares the tiles' row with six tiles too, and `cio-tiles-dense` asserts that.

### Stage 10mp — A review line dated only by months says so: "Range only", not "No dated capital"

*"we have the dates of the investment, but still we are showing in XIRR and in the benchmark return that we don't have any dated capital"* — the family, on National Stock Exchange (Invested on "Dec 2022 → Aug 2023").

- **Root cause.** A review holder line (Stage 10dh) is a "whole account" to `datedCapital.behind`, and with no capital group it fell to the custodian-account reason, "publishes no dated record … capital known only as a total". The XIRR cell read that as "No buy/sell dates" and the index line as "No dated capital". The same row's Invested on showed the review's month span.
- **What is actually missing.** The review prints the months (Dec 2022 – Aug 2023) and one cost (₹12.085 Cr for 2,00,000 shares). It does not say what was paid on each day, so there is still no rate. Placing the cost inside the span would be an estimate.
- **Now** (`spanReason` in `datedCapital.ts`): such a line says the review dates it only as a span (or a month), with one cost, and names the holders. XIRR reads "Date range only" (or "Month only"; `returnColumns.ts`), and the index line reads "Range only" (or "Month only"; `holdingBenchmark.ts`). A line whose account has a capital group keeps that group's reason.
- **Would date it.** The investment register dates part of it: Ankita's 15,000 pre-bonus shares (8 Dec 2022 and 26 Jan 2023 payments, ₹4.28 Cr) and 5,000 of Ajay's (18 Aug 2023; the amount printed does not match its own 5,000 × ₹3,100). Ajay's other 20,000 have no dated purchase. Not applied: it would replace the review's cost split, and that is the family's decision.
- Checks: `datedCapital.test.ts` (NSE's two lines: undated, reason names the span, XIRR refuses), `holdingBenchmark.test.ts` (labels).

### Stage 10mq — The client's "records still needed" PDF, regenerated from the book

*"we need to create an updated PDF for the current missing gaps … in the same format"* — the family, 11 Nov 2026, of the 27 October list.

- `npm run client:request` (`scripts/client-request/`) prints `docs/client/Glow-Ventures-records-still-needed-<date>.pdf` in the 27 October layout. Sections 2 (PMS stocks with no purchase date) and 3 (private investments carried at cost) are derived with the dashboard's own `investedOnOf` and `holdingBucket`. Section 1 is written by hand; every item is checked against the book, and an item the book no longer bears out stops the build. Section 4 lists the 27 October items since answered, each one checked.
- 11 Nov result: 43 named records (was 35), 73 PMS stocks in 6 accounts (was 163 in 9), 75 private records / 60 investments (was 76 / 61).
- Closed since 27 Oct: Ankita's HDFC Balanced Advantage Regular (sold 23 Sep, MOPWM report); Yash Highvoltage and EMA Partners sales (ICICI order book); SVAN 8710067/8710090 and Molecule dated; SOTEFIN now on the ICICI statement.
- New from the 31 Oct ICICI and HDFC Securities statements: Indian Bank, IndusInd, Karur Vysya and RBL on 49794950 with no purchase or transfer; City Union's 25,117 shares beyond the 2 July buy; Sotefin's allotment; Vantage Oak (and Ankita's 1,225,000 units); Man Industries, Deepak Fertilisers and Kingfa dates; Sterlite Technologies and its demerged shares. Also LKP's other 31 March balances (dates for the later sales), Hope's Mirae folio, both Marathon Trends holding statements and the second LKP removal notice. Liquid BeES rows name the 21 Oct note's units.
- Not asked of the client (our follow-ups): Federal Bank (whole balance bought 2 July per the order book), and carrying the Yash, EMA, Insolation and Smartworks recovered costs through the order book's sales (Stage 10kn).

### Stage 10mr — Returns attribution: Benchmark return replaces Market return

*"the market return column and the return XIRR column are showing the same returns … replace the market column with benchmark return similar to what we have in portfolio monitor"* — the family, 11 Nov 2026.

- On a one-holding row, Market return (the holding's own move, `selectionMarket`) equalled the Return column. The attribution table now draws **Benchmark return** (`lineBenchmark.ts`, `LineBenchmarkCell.tsx`). Every unit behind the row's return goes into ITS OWN index, chosen by the Monitor's `rowBenchmark`: the manager's printed benchmark for a whole PMS account, AMFI size class for a share, fund category, Nifty 500 for a private holding. The money goes in through `pmeWindowRows` / `pmeInceptionRows` / dated since-investment money, and the Return column's own measure and debt rule are then struck. A mixed row is a **Blend**, weighted by each unit's money.
- Cash, debt, arbitrage, hybrid and metal units have no index in the feed. They are named in the info card and left out of BOTH sides: `book` is the row's figure over the same units, and ◦ marks a partial blend. A row of them alone reads "No index". Equity savings funds are now hybrid in `holdingBenchmark.ts` (Monitor too).
- Each record closes the index on its own last value date, as the return does: Sanshi Class E reads N500 −4.78%, the index's 30 Jun → 30 Oct move.
- The Sector axis keeps its Market return and details; `check-market-returns.mjs` now opens them there. `check-selected-attribution.mjs` asserts the Total row's `data-seg-cell="bench"`. Suite: `lineBenchmark.test.ts`.

### Stage 10ms — Statement-costed holdings dated off the review's purchases (Man Industries, Deepak, Kingfa)

*"If we already have the average cost of an holding, then why we are not showing the invested date? … in this man industries, we have the average cost, but we don't have the dates. Is it correct? Or we are missing out on the dates from the files."* — the family, 11 Nov 2026.

- An average cost is one figure a broker prints; it carries no dates. HDFC Securities 3110320's portfolio prints Man Industries at ₹327.64, and its trade report starts 1 Apr 2026, after every purchase. The dates were in the files all the same: the 30 June review's "Transactions since inception", HDFC Bank block, buys 60,000 on 10 Jan 2025 and 4,57,317 on 25 Jul 2025 (the register prints the second). Cost recovery read those rows only for holdings with no cost.
- `scripts/lib/reviewPurchaseDates.mjs` dates a statement-costed holding off those rows, for the Invested on column only (`Position.reviewPurchases`, source `review-lots`). The statement's cost stands. Five gates: the review block ties to its own Closing (FIFO); the account's trade window opens by the day after it and agrees where they overlap; the window's trades carry the lots to exactly the units held (5,17,317 − 37,317 sold 23 Sep = 4,80,000); where the window stops before the holding's date, every unit must be long-term on both the dates and the broker's LONG TERM QTY (now read by `hdfcSecurities.mjs` as `longTermQuantity`), since a unit bought in the gap would be short-term; and the lots' cost must be within 0.5% of the statement's.
- Dated: Man Industries (2 lots, 10 Jan – 25 Jul 2025), Deepak Fertilisers (30 Jul 2024), Kingfa (22 Nov 2024). Manorama (bought Jan 2026) stays undated with the reason: all its units are short-term, so the 31 Oct → 2 Nov gap cannot be closed.
- Identity is an alias table (`REVIEW_PRODUCT_BY_KEY`, `REVIEW_CUSTODY_BY_ACCOUNT`), never an amount or a date.
- The client request (Stage 10mq) no longer asks HDFC Securities for these three holdings' dates: 41 named records (was 43).
- Checks: `reviewPurchaseDates.test.mjs` (each gate broken once).

### Stage 10mt — PMS trade dates: a trade printed on both the investor report and the transaction statement is kept

*"According to the client, we have received transaction statements for all the PMSs from the initial date of investment … we are not able to show the dates anywhere, transaction dates for all the holdings."* — the family, 11 Nov 2026.

- Checked per account. From-inception transaction statements are in the drop for ASK ×2, Green Lantern ×2, Marathon ×2, Molecule, SVAN ×2 and V.E.C 128004, and they date every share held except Vedanta Aluminium Metal (Green Lantern; demerged units with no cited entitlement in `shared/demergers.mjs`). Carnelian 3517383 (inception 6 Jan 2025), Goldstandard 100022/100023 (26 Dec 2025) and V.E.C 128005 (30 Jul 2025) have transaction statements from 1 Apr 2026 only. Nothing else in `source/`, the zips or `statement-publications` dates their earlier lots, so they stay undated with the reason and remain on the client request.
- Root cause of a real loss: `datedRowsAcross` dedupes trades across ALL of an account's documents, kept documents first. Green Lantern's 30 Jun investor report prints the same trades as its transaction statements. Where both print a row identically (a whole-rupee rate), the investor report's copy won. The tape then kept transaction-statement rows only, so the trade vanished. Green Lantern 510861 lost Ingersoll Rand's 17 Apr 2026 buy (170 at ₹4,100), Ratnamani's 29 Apr buy (157 at ₹2,650) and Anup Engineering's 15 Jun buy (41 at ₹1,950), and its three holdings showed "368 units on no dated trade".
- `build-book` now reads the tape (`saleRows`: the holding trades and the day's sales settled against capital-gain lots) from the winning report type alone, deduped among itself, which is the runtime ledger's `datedRows` rule. Book: 1,817 → 1,820 trades, Green Lantern 510861 28 → 31 of 34 lines dated; no value, cost, realised gain or summary moves. Client request: 73 → 70 PMS stocks.
- Check: `holdingTrades.test.mjs` restates the tape off the archive for every account issuing both report types and fails on main's book with exactly those three holdings.

### Stage 10mv — The investment register dates money no statement does: Sotefin, V.E.C 128005, Goldstandard ×2, Ankita's NSE

*"whatever data we have available, we need to use that, right?"* · *"Yes, apply all four"* — the family, 11 Nov 2026, after an audit of the 180 holdings with no dated money (99 valued, ₹211 Cr).

- **The "held out by decision" was a build rule from the August 2026 delivery, not the family's.** The register has fed missing costs since 21 Oct (Stage 10fn). It now also dates money, through `scripts/lib/registerRecords.mjs`: one committed entry per row, found by sheet and serial number. A changed row stops the build.
- **Sotefin Bharat** (Ajay, ICICI 49794950; no cost before): `AJAY SIR - AARTI` rows 41–42 give 11,364 at ₹1,100 (12 Jul 2024) and 46,875 at ₹160 (3 Nov 2025). The RHP's 10:1 bonus of 25 Jun 2025 (1,13,640 to Ajay) makes 1,71,879, every unit held. Cost ₹2,00,00,400 (`recoverHoldingCosts`), with cost, HPR and XIRR.
- **V.E.C 128005, Goldstandard 100023/100022**: each mandate's opening payment (₹7.5 Cr on 30 Jul 2025; ₹17.5 Cr and ₹7.5 Cr on 26 Dec 2025) is on the manager's printed inception date. It is listed only where the manager's 1 Apr 2026 opening capital balance is that payment less at most 0.1% (`inceptionMoves`).
  - The shortfall (₹21,531, ₹18,025, ₹7,050; the manager's own rows of that kind are TDS) is an outflow on 31 Mar 2026 marked `assumedDate`.
  - Goldstandard's own TDS rows, held back while nothing had been paid in (rule 4 of `datedCapitalElsewhere`), now merge.
  - Money-weighted: V.E.C 128005 18.77% (128004 is 18.42%). Goldstandard is under a year, so it shows absolute.
- **NSE, Ankita**: `PVT INV` rows 74–75 (₹64,12,500 on 9 Dec 2022, "15000 EQUITY SHARES OF NSE"; ₹3,63,51,213 on 27 Jan 2023) tie to their subtotal. MOPWM's report carries the 15,000 into her demat and adds the 60,000 bonus of 2 Nov 2024, making her 75,000.
  - They are her `BOOK_REVIEW_FLOWS` rows (`register`, `reviewRow: null`). Her cost is ₹4,27,63,713 and Ajay's the review's ₹12.085 Cr less it, ₹7,80,86,287 (was a split by shares).
  - Her line: XIRR 45.49%. The two-owner row stays undated for Ajay's part: the register dates 5,000 of his 25,000 pre-bonus shares, at an amount that does not match its rate.
- `CapitalMove.fromRegister` / `assumedDate` and `ReviewFlow.register` carry the source into the transaction rows (`consolidatedSheet.ts` notes).
- Checks: `registerRecords.test.mjs` (test:ingest) reads the real rows and breaks each one: renamed row, other holder, units × rate, bonus ratio, missing MOPWM bonus, subtotal, and each reconciliation refusal.

### Stage 10mu — Home: the portfolio at a glance

- Home sits above Morning CIO in Daily and is the populated dashboard's front door. The existing Home buttons and global search reach it; an empty book still opens ingestion. The root redirect retains the member query so it cannot race the context's scope restoration.
- The reference layout becomes an asset-class donut on the left, with AUM and Geography on the right. AUM and every class open their holdings. The total counts each duplicate group once, shares Morning CIO's family asset-class rules, and follows the member and currency selectors.
- On phones the navigation becomes an icon rail with an expandable menu, leaving room for the cards; AUM uses compact currency notation there. Desktop navigation keeps its saved width.
- Geography names the unclassified value. The book has no verified country exposure, so no countries, weights or historical AUM change are inferred from the screenshot, listing venue, currency or fund names.
- Validation covers canonical AUM, dedupe, allocation totals, missing classifications, scoped totals, search, navigation, currency and light/dark desktop/mobile layouts.

### Stage 10mw — Home: date-scoped overview and a configurable widget library

- Home gains a single date range with MTD/YTD/FYTD/1Y presets and the existing global member/currency scope. Current AUM still reconciles to the consolidated book; past end dates use only earlier NAV marks plus dated capital. Whole-account history stays mixed rather than using today's allocation weights. Partial historical levels are labelled recorded AUM.
- Every block is a widget. The searchable, category-filtered library opens a live preview popup with Add to Home/Cancel. Eighteen widget types cover AUM, summary metrics, portfolio versus Indian benchmark, asset class, geography, currency, allocation history, recorded/projected cash flows, asset details, concentration, large movements, monthly returns, vintage, volatility and sectors. Layout editing supports drag or keyboard reorder, size, remove, restore defaults and browser-local persistence. Unsupported firm widgets expose “Not relevant for firm” on hover/focus.
- Returns reuse Morning CIO's selected records and dated-money index comparison. Monthly returns are independent available-record cohorts; held/partial records are named. Daily volatility requires at least 20 observed returns with boundary coverage and refuses sparse histories. No geography, underlying currency, household liabilities, fund vintages or future payment schedules are invented. Polycab remains ring-fenced.
- Every Home table uses the standard view-only Excel exporter, with source-precision numeric cells and all collapsed asset detail rows. Updated the NSE source-trace fixture to select exact owner/security identity after the register-based cost update; no financial source or calculation changes. Test bundles stay in this checkout’s ignored cache even when dependencies are reused.
- Home alone reflows the global toolbar into two mobile rows, keeping entity selection, search, currency and theme controls within the viewport. Widget confirmation actions stay visible; long return-source coverage opens in an accessible dialog.
- Added focused arithmetic/coverage tests and expanded the local browser check to exercise benchmark switching, custom historical dates, each widget's popup/add lifecycle, layout order/size/persistence/removal, entity scope and both themes at desktop/mobile widths. Validation results are recorded on the PR.
