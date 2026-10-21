# Build

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 28824–29108). CLAUDE.md now carries the condensed rules; this file is the record. -->

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
