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
  sweep is not needed before every merge.
- **Stage notes are short** and go at the end of the newest
  `docs/history/stages-N.md` (heading `### Stage 10xx — …`, a few bullets; start a
  new file when one passes ~350 KB). Do not grow this file with history.
- Before merging, `git fetch origin main` and compare the stage HEADINGS (letter
  and title) across `CLAUDE.md` and `docs/history/*.md` against main's tip. Two
  sections can land under one letter with no conflict marker.
- On a merge, union the `ctx` literal in `scripts/check-pages.mjs` (every key
  must name a declared probe), and REGENERATE generated files (`glowData.ts`,
  `docs/BOOK-REPORT.md`, reports) rather than trusting a text merge.

## Where the history is

This file is the working guide. Everything it used to carry — the reasoning,
measurements and defects behind every rule, stage by stage — is kept verbatim in
`docs/history/` (see its `README.md` for which file holds which stage). A code
comment citing "CLAUDE.md §…" or "Stage 10xx" resolves there:
`grep -n 'Stage 10ak' docs/history/*.md`. Read the stage before changing the
code it describes.

## The standing rule

**Latest verified data (15 October 2026):** always select the newest usable source record for each
metric when new documents arrive. Money-weighted returns use the newest account closing valuation
with matching reconciled dated capital through that valuation date, independently of an older
security-by-security holdings appraisal. Every return surface reads the same selected record.
Retain the last verified record when a newer source is incomplete, name that newer source's date
and gap, and show the actual measured end date and account coverage on the card. Live quotes never
establish missing cash-flow history or permit advancing a statement's date to today.

Verified full unit ledgers may establish FY opening units against an archived 31 March
NAV, joined by exact ISIN, or the fund's own dated NAV. Historical references under
`scripts/ingest/reference/` establish return openings only; they never change statement
holdings or insert live prices into the book. Nil origins, retired classes, distributions
and transfers require their own source evidence. `docs/RETURN-COVERAGE.md` lists the current
account coverage and remaining records.

**No figure is ever fabricated.** If the source doesn't carry a number, the UI
renders `—` with a reason. Not a zero, not an estimate, not an interpolation, not
a plausible default.

- A metric needing data the model doesn't carry renders `—` until an ingest
  supplies it.
- **An empty book renders an empty state, never zeros.** `PortfolioContext`
  exposes `bookIsEmpty` and `<Gate>` in `src/App.tsx` stops every analytics route
  on it.
- A price the quote feed couldn't supply keeps its statement mark and is flagged
  not-live.
- The ingest classifier writes `null` for a field it can't determine; a file it
  can't place goes in a "could not classify" section, never under a guess.
- **A preview/sample figure must never be arithmetic on the family's own money**,
  and **must never assert a fact about a real, named counterparty**. Test: would
  it still be honest if the badge were cropped out of a screenshot?
- A fabricated field is retired by deleting it from the TYPE, not just the render.

## The presentation half

**A measured zero and an absent measurement must never look the same.**
`src/components/Absent.tsx` is the one place that renders absence —
`AbsentValue`, `absentTile(reason, hint)`, `AbsentCell`, `AbsentSection` — and
every one takes the reason as a required argument.

- **Never blend a missing value into a total as zero** — `sumOrNull` in
  `src/lib/analytics.ts`.
- **A figure that exists for SOME accounts is shown for those and the rest are
  named**, including in the total's own caption.
- **A COMPUTED zero is legitimate and stays**, with its reason on the face.
- **A caption must neither narrow nor widen the figure it describes.**
- **A total must tie to its own columns.**
- `check:pages`' on-screen `₹0` / `0.00%` findings are leads, not verdicts.

## Layout

One line per area; the history files explain each in depth.

- `src/pages/*` — one file per route (see `src/App.tsx`); `src/lib/nav.ts` is the
  one nav table read by the sidebar and every breadcrumb (`PageNav`).
- `src/lib/types.ts` — the canonical model. Read this first.
- `src/context/PortfolioContext.tsx` — loads the book; `portfolio` (live overlay),
  `statementPortfolio` (never touched by a feed), `basis`; applies the overlays
  (`applyQuotes`, `applyFundNavs`, corporate-action gate, depository rows) and the
  member scope (`scopePortfolio`, `src/lib/memberScope.ts`) at ONE seam.
- `src/lib/analytics.ts` — shared aggregation: `sumOrNull`, `dedupedPositions`,
  `currentHoldings` (closed rows and the ₹1,000 speck floor), `holdingBucket`
  (which section a holding sits in, incl. `CASH_EQUIVALENT_KEYS`),
  `readerClassOf`, `marketSides` / `publicPrivateSplit`, `costCoversSet`,
  `measuredReturn` / `holdingReturn`, `isValuedAtCost`.
- `src/lib/fifo.ts` + `shared/fifo.mjs` — FIFO, the one return:
  `(unrealised + realised) ÷ (cost held + cost of units sold)`; a whole PMS
  mandate is struck on its capital (`fifoTotals`).
- `src/lib/accounts.ts` (registry), `securityKey.ts` (join key), `securityLabel.ts`
  (one name per key), `schemeLabel.ts` (AMFI scheme names by ISIN), `sectors.ts`
  (three sector tiers: statement → fund filing by ISIN → screener.in by symbol;
  lower tiers only fill).
- `src/lib/groupAxis.ts` (Category / Asset class / Basket / All Securities axes),
  `familyTaxonomy.ts` (the family's review-cited baskets and asset classes),
  `drilldown.ts` (which holdings are behind a figure; `/holdings`).
- `src/lib/lookthrough.ts` + `useStockExposure.ts` — `companyExposure`: one
  definition of exposure to a company (measured half + DERIVED fund half, never
  added into NAV). `heldThrough.ts` — every way one company is held.
  `insideMovers.ts` / `fundDisclosures.ts` — companies inside AIFs and mandates.
- `src/lib/tranches.ts` (the family's dated capital, `capitalRollup`,
  `capitalReturn`), `datedCapital.ts` (money-weighted rate where a row is whole
  accounts), `txnLedger.ts` (capital and trades as one row set — never added),
  `txnAxis.ts`, `txnSort.ts`, `txnRollup.ts`, `ledger.ts` (runtime dated record
  from `public/audit/`), `capitalCalls.ts`, `fundReturns.ts`, `privateBook.ts`
  (Private Market's one model; brand grouping via `brandOf`/`BRAND_OVERRIDES`),
  `investmentProfiles.ts` (supplied strategy/description, matched by identity —
  security key → ISIN → name → brand → folio; Stage 10eo), `enteredProfiles.ts`
  (the same cells typed on the table, shown over a file's; Stage 10ev).
- `src/lib/navSeries.ts`, `attribution.ts` (no caller; kept, tested),
  `benchmarks.ts` (seven indices, name-checked), `indexSectors.ts` (their sector
  weights off NSE's factsheets, through `resolveSector`; Stage 10fe), `indices.ts`, `periodReturns.ts`
  (Morning CIO Returns tab), `segmentReturns.ts` (its attribution section:
  FIFO gain and contribution by any axis, tied to the Gain / Loss tile),
  `returnMeasures.ts`, `returnColumns.ts`.
- `src/lib/fundNavs.ts` (AMFI NAV overlay; never sets `live`; depository cash and
  fund rows on the live basis only), `depositoryShares.ts`, `recordedHoldings.ts`,
  `corporateActions.ts`, `dailyMovers.ts`, `quotes.ts`, `quoteCache.ts`,
  `upstreamStatus.ts` (the cause picks the headline).
- `src/lib/tableView.ts` + `components/SortHeader.tsx` + `columnDrag.ts` +
  `viewMemory.ts` — every table sorts, every column but the first drags, the
  arrangement is remembered. `components/TreeTable.tsx` — rows open into rows of
  the same table, never a table in a cell.
- `src/lib/enteredCalls.ts` + `functions/api/capital-calls.js`, `enteredProfiles.ts` +
  `functions/api/investment-profiles.js`, `tileSets.ts` +
  `functions/api/tile-sets.js` — the shared store: one JSON file on the repo's
  `dashboard-store` branch, written with `GLOW_GITHUB_TOKEN` (`shared/dashboardStore.mjs`,
  Stage 10ex; the repo is public, so everything saved there is public).
- `src/lib/priceAlerts.ts`, `watchlist.ts`, `researchLevels.ts`/`researchSync.ts`
  — price alerts (per browser) and the send to Glow Central Research.
- `src/lib/searchIndex.ts` + `components/SmartSearch.tsx` — the top-bar search.
- Documented no-callers, kept on purpose: `familyInputs.ts`, `alertEngine.ts`,
  `marketCap.ts`, `series.ts`, `deals.ts`, `household.ts`, `chatContext.ts`,
  `munsChat.ts` / `components/MunsChat.tsx` (chat paused), `attribution.ts`.
- `shared/*.mjs` — code shared by the build and the browser: `aifCategory`
  (SEBI category, `FAMILY_MARKET_SIDE`, `DECLARED_AIF_CATEGORY`), `owners`,
  `separateInvestments`, `keptUnvalued`, `reviewHolders`, `reviewPrivateJoin`,
  `sectors`, `securityKey`, `nameMatch`, `lotSettlement`, `corporateActions`,
  `polycabSources`, `upstoxQuotes` / `upstoxInstruments`, `seriesReturns`. A new
  one ships with its `.d.mts`.
- `functions/api/*` — Cloudflare Pages Functions (see Live layer).
- `scripts/ingest/*` — the statement intake (see Ingest).
- `src/data/glowData.ts` — the generated book. **Never hand-edit.**

## The data model

**Sources.** Statements from several wealth platforms live in `source/`, one
folder per delivery (`source/README.md` has the rule for adding the next one).
`npm run coverage:source` accounts for every leaf file and exits non-zero if any
is unread; `docs/SOURCE-COVERAGE.md`, `docs/BOOK-REPORT.md` and
`docs/EXTRACTION-REPORT.md` carry the counts — read them, never copy counts into
prose. One document is unread by necessity: Bharat's HDFC NSDL statement in
`august-2026-e/` is a scan (`no-text-layer`). The adviser's consolidated review
workbook and the family's investment register are read and **held out by
decision** as statement sources. A monthly drop reissues the same filenames, so
extraction mirrors each archive's own path under `source/`.

**Accounts.** One row per account, regenerated from `BOOK_POSITIONS` by
`npm run accounts-table` — never edited by hand:

| Provider | Account | Owner | As of | Market value |
| --- | --- | --- | --- | ---: |
| Consolidated review (MOPWM) | MOPWM | Ajay Jaisinghani | 2026-06-30 | ₹125.40 Cr |
| Sanshi Fund | 9039671821 | Aarti Jaisinghani | 2026-06-30 | ₹97.68 Cr |
| ICICI Bank (NSDL demat) | 49794950 | Ajay Jaisinghani | 2026-03-31 | ₹63.76 Cr\*\* |
| Buoyant Capital | 103473 | Ajay Jaisinghani | 2026-09-30 | ₹48.07 Cr |
| Carnelian Asset Management and Advisors Pvt Ltd | 3517383 | Ajay Jaisinghani | 2026-09-30 | ₹38.16 Cr |
| Consolidated review (MOPWM) | MOPWM | Bharat Jaisinghani | 2026-06-30 | ₹37.26 Cr |
| Helios Mutual Fund | 10355977 | Ajay Jaisinghani | 2026-08-07 | ₹31.00 Cr |
| Sanshi Fund | 9069671554 | Ankita Jaisinghani | 2026-06-30 | ₹29.42 Cr |
| Sanshi Fund | 9039671912 | Ajay Jaisinghani | 2026-06-30 | ₹29.35 Cr |
| Consolidated review (MOPWM) | MOPWM | Ankita Jaisinghani | 2026-06-30 | ₹29.04 Cr |
| Sanshi Fund | 9069671634 | Ajay Jaisinghani | 2026-06-30 | ₹28.46 Cr |
| Buoyant Capital | 103472 | Ankita Jaisinghani | 2026-09-30 | ₹27.00 Cr |
| Motilal Oswal Founders Fund | 90410016104 | Ajay Jaisinghani | 2026-09-30 | ₹22.07 Cr |
| Motilal Oswal Active Momentum Fund | 904168868444 | Ankita Jaisinghani | 2026-08-06 | ₹21.42 Cr |
| V.E.C Assago Capital Management LLP | 128005 | Ajay Jaisinghani | 2026-08-13 | ₹20.29 Cr |
| Sanshi Fund | 9039671854 | Bharat Jaisinghani | 2026-06-30 | ₹19.57 Cr |
| Goldstandard Wealth Private Limited | 100023 | Ajay Jaisinghani | 2026-10-06 | ₹18.03 Cr |
| Carnelian Bharat Amritkaal Fund | 4551 | Ankita Jaisinghani | 2026-07-31 | ₹16.31 Cr |
| SVAN Investment Managers LLP | 8710067 | Ajay Jaisinghani | 2026-09-30 | ₹16.22 Cr |
| Green Lantern Capital LLP | 510861 | Ajay Jaisinghani | 2026-07-27 | ₹11.45 Cr |
| Motilal Oswal Delphi Equity Fund | 9049241536 | Ajay Jaisinghani | 2026-06-30 | ₹11.13 Cr |
| Motilal Oswal Founders Fund | 90410016093 | Ankita Jaisinghani | 2026-09-30 | ₹11.11 Cr |
| SVAN Investment Managers LLP | 8710090 | Bharat Jaisinghani | 2026-09-30 | ₹10.71 Cr |
| India SME Investments | 175962 | Ajay Jaisinghani | 2026-06-30 | ₹9.56 Cr |
| Goldstandard Wealth Private Limited | 100022 | Ankita Jaisinghani | 2026-10-06 | ₹7.67 Cr |
| Consolidated review (MOPWM) | MOPWM | Not attributed to a member | 2026-06-30 | ₹7.26 Cr |
| V.E.C Assago Capital Management LLP | 128004 | Ankita Jaisinghani | 2026-10-07 | ₹6.11 Cr |
| Green Lantern Capital LLP | 510854 | Ankita Jaisinghani | 2026-07-27 | ₹5.80 Cr |
| Neo Infra Income Opportunities Fund | 9039920536 | Ajay Jaisinghani | 2026-06-30 | ₹5.55 Cr |
| HDFC Mutual Fund | 15644806 | Ajay Jaisinghani | 2026-10-01 | ₹4.36 Cr |
| India SME Investments | 175964 | Bharat Jaisinghani | 2026-06-30 | ₹3.19 Cr |
| India SME Investments | 177302 | Ankita Jaisinghani | 2026-06-30 | ₹3.19 Cr |
| HDFC Mutual Fund | 16002141 | Ankita Jaisinghani | 2026-10-01 | ₹2.62 Cr |
| Baring Private Equity India Fund | AIFM_BPEPF6_0584 | Ankita Jaisinghani | 2026-03-31 | ₹1.88 Cr |
| Sky Capital Rising Titans Fund | SKY003 | Bharat Jaisinghani | 2026-08-31 | ₹1.72 Cr |
| Sky Capital Rising Titans Fund | SKY022 | Ajay Jaisinghani | 2026-08-31 | ₹1.50 Cr |
| 360 ONE Private Wealth | 37702 | Ajay Jaisinghani | 2026-09-30 | ₹1.46 Cr\* |
| 360 ONE Private Wealth | 60117 | Bharat Jaisinghani | 2026-09-30 | ₹1.46 Cr\* |
| Consolidated review (MOPWM) | MOPWM | Bharat Jaisinghani Family Trust 2 | 2026-06-30 | ₹1.35 Cr |
| Consolidated review (MOPWM) | MOPWM | Bharat Jaisinghani Family Trust 3 | 2026-06-30 | ₹1.35 Cr |
| Molecule Ventures LLP | 7810404 | Ajay Jaisinghani | 2026-07-31 | ₹1.16 Cr |
| Kotak Mahindra Mutual Fund | 7125255 | Ajay Jaisinghani | 2026-10-05 | ₹1.08 Cr |
| LKP Securities | 98245 | Bharat Jaisinghani | 2026-03-31 | ₹0.99 Cr |
| Transition Venture Capital | TVC262 | Bharat Jaisinghani Family Trust 2 | 2026-03-31 | ₹0.97 Cr\* |
| Transition Venture Capital | TVC263 | Bharat Jaisinghani Family Trust 3 | 2026-03-31 | ₹0.97 Cr\* |
| Sky Capital Rising Titans Fund | SKY023 | Bharat Jaisinghani Family Trust 2 | 2026-08-31 | ₹0.75 Cr |
| Sky Capital Rising Titans Fund | SKY024 | Bharat Jaisinghani Family Trust 3 | 2026-08-31 | ₹0.75 Cr |
| ICICI Prudential Mutual Fund | 36378950 | Ajay Jaisinghani | 2026-10-05 | ₹0.56 Cr |
| ICICI Prudential Mutual Fund | 36379637 | Bharat Jaisinghani | 2026-10-05 | ₹0.38 Cr |
| HDFC Mutual Fund | 15725046 | Aarti Jaisinghani | 2026-10-01 | ₹0.02 Cr |
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
| HDFC Mutual Fund | 16180583 | Bharat Jaisinghani | 2026-10-05 | ₹0 (a MEASURED zero — both schemes redeemed to nil) |
| ICICI Prudential Mutual Fund | 14320536 | Ankita Jaisinghani | 2026-10-01 | ₹0 (a MEASURED zero — every scheme redeemed to nil) |
| Invesco Mutual Fund | 3041491081 | Bharat Jaisinghani | 2026-09-30 | ₹0 (a MEASURED zero — every scheme redeemed to nil) |
| Invesco Mutual Fund | 3041491145 | Ajay Jaisinghani | 2026-09-30 | ₹0 (a MEASURED zero — both schemes redeemed to nil) |
| Invesco Mutual Fund | 3041794916 | Ankita Jaisinghani | 2026-09-30 | ₹0 (a MEASURED zero — both schemes redeemed to nil) |
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
| Motilal Oswal Mutual Fund | 90414963315 | Ajay Jaisinghani | 2026-09-30 | ₹0 (a MEASURED zero — every scheme redeemed to nil) |

The table above is **regenerated every time, never patched**: `npm run
accounts-table` prints it and `-- --write` splices it in. It refuses (exit
non-zero) when a `noPositionsReason` routes to no words or the column does not
tie to `BOOK_SUMMARY.totalValue`. Both markers are routed, never typed.

\* one of two holdings of the same fund whose figures coincide on two accounts'
statements (360 ONE Special Opportunities under CRN37702 and CRN60117;
Transition Venture Fund I under TVC262 and TVC263). The family confirmed on
28 Sep 2026 that each pair is two investments, so every row is counted in full
(`shared/separateInvestments.mjs`). The cells carry the review's mark since
Stage 10dh.

\*\* the ICICI NSDL account 49794950 also holds the family's POLYCAB promoter
block, which is ring-fenced: out of this column and every total, shown only on
`/polycab`.

**Consolidated.** `BOOK_SUMMARY` in `glowData.ts` is authoritative; at the time
of writing: 76 accounts, 448 positions, 8 owners/entities, current value of
holdings ₹836.57 Cr — listed ₹643.48 Cr, private ₹193.09 Cr, nothing unplaced.

**Side of the book**, decided in this order and generated as
`Position.marketSide`: the family's own fund placing (`FAMILY_MARKET_SIDE`) → a
review private-market line is private → a fund whose own name says private
equity / venture → the SEBI category (III listed; I/II private) → neither, named.
Never derive one side from the others.

**The rules that are load-bearing:**

1. **`securityKey`, not ISIN, is the join key** — a slug of the clean name
   (`securityKeyOf`, depository furniture stripped, glued ISIN split off). ISIN
   and symbol are enrichment. If a join fails, fix the EXTRACTOR, never re-derive
   a key in the presentation layer.
2. **Owner and custodian are different fields** (`Account.owner` vs `provider`);
   read the registry, never infer a manager from text.
3. **As-of is per account**; a consolidated total is a blend (`staleAccounts()`).
4. **Sectors are per provider**: `Position.sector` normalised,
   `Position.providerSector` as printed.
5. **Primitives are ingested; everything derivable is derived.** Printed values
   live in `printed.*` as a CHECK, never a source.
6. **Asset class is what a thing IS; engagement is how it is run.** PMS is never
   an asset class.
7. **Duplicates: carry both, count once** (`dedupeGroup`) until the family
   answers (`shared/separateInvestments.mjs`; `npm run replay:dedupe`).
8. **One person, one ownerId** — `shared/owners.mjs`, PAN first. A PAN that is
   also a document password is never written into the registry.

**Decisions to know about:**

- **The ring-fence.** `RINGFENCED_SECURITY_KEYS` in `scripts/build-book.mjs`
  splices Polycab out into `BOOK_POLYCAB`; `src/pages/Polycab.tsx` is its only
  reader. Polycab is named on no other route; the register's sentinel name
  appears on no route.
- **The review is the source of the PRIVATE book only** (Stage 10dh):
  `scripts/lib/reviewBook.mjs` + `shared/reviewHolders.mjs` turn its private
  blocks into positions, each with a `reviewSource` (sheet, block, row), and
  throw rather than guess. For everything else the review is a cross-check
  (`npm run reconcile:review`). At-cost lines carry no gain or return
  (`AT_COST_BUCKET`, `AT_COST_RETURN`).
- **The Motilal CDSL "rate" is the last movement's price**, not a mark or a cost
  (Stage 10cz); those rows are quantities on the statement basis.
- **Encrypted statements** open with `GLOW_PDF_PASSWORDS` from the environment.
  Passwords are PANs — **never commit them** or put them in any tracked file.

## The ingest pipeline

```
source/*  →  npm run inventory  →  docs/INGEST-INVENTORY.md
          →  npm run extract    →  public/audit/<docKey>/  +  docs/EXTRACTION-REPORT.md
          →  npm run build-symbols
          →  npm run build-book →  src/data/glowData.ts  +  docs/BOOK-REPORT.md
```

All steps are idempotent; `glowData.ts` regenerates byte-identically.

- `scripts/ingest/extract.mjs` drives it; `lib/bundle.mjs` splits multi-report
  PDFs by title; `lib/sheet.mjs` sniffs format from the BYTES (BIFF read for
  stored values); `lib/layout.mjs` is coordinate-aware (page rotation first);
  `lib/parseNum.mjs` — `null` means not reported, never zero; `lib/table.mjs`
  matches tables by HEADER TEXT, never column index; `lib/classify.mjs` — title
  rules before keyword rules, issuer by letterhead, never by a name a document
  merely mentions; `lib/ocr.mjs` only for outlined-text PDFs (needs `pdftoppm`
  and `tesseract`), never for a scan.
- `providers/*` — one reader per document family; `lib/document.mjs`'s
  `assertNormalized` enforces the shape. Adding a provider: write the reader,
  register it in `EXTRACTORS`, and add its block to `precedence.mjs` (a provider
  with no precedence block contributes nothing).
- `precedence.mjs` decides which report is authoritative per fact. A snapshot
  supersedes; a dated row does not (dated rows are unioned and deduped).
- `reconcile.mjs` classifies every delta `rounding` / `explained` / `material`;
  a material delta blocks `__tests__/golden.mjs`.
- **`extract.mjs` takes no options and runs on any machine** (Stage 10ep): a
  statement it cannot open for want of a password or the OCR tools is CARRIED
  FORWARD from the archive a run that could open it wrote (a failed one is
  re-read from its archived page text, kept only if it publishes more); with no
  password and no OCR it reproduces the committed archive byte for byte.
  `guardAgainstShrinkingTheArchive` still refuses a smaller archive. The
  `replay:*` / `rekey:archive` scripts remain for their own narrow changes.
- **`partial` means a read gap** — `lib/readStatus.mjs` splits warnings into
  statement NOTES (what the document prints or lacks) and read GAPS; a document
  whose every warning is a note is `ok`. A new warning code is a gap until it is
  argued into the note list.
- **`npm run check:reads` is the gate on every delivery** (Stage 10er; CI's
  `statements` job re-extracts `source/` and runs it on every PR). It fails on a
  `partial` document, a `failed` one not held out by decision or recorded in
  `scripts/ingest/acceptedUnread.mjs` (reason + the action that fixes it — only
  for a file that carries nothing to read), a read account the book neither
  carries nor excludes by name, and a book date older than the newest statement
  read. Never silence it by widening the note list or the accepted list for a
  file a reader could read: write the reader.

## The live layer

- `functions/api/quotes.js` — Upstox first (`UPSTOX_ACCESS_TOKEN`, one call for
  the book; `?check=1` verifies the token), muns for the rest (`MUNS_TOKEN`).
  Tokens live in Cloudflare only.
- `indices.js`, `prices.js` — Yahoo, keyless, every symbol checked by the name
  the upstream reports. `fx.js` — ECB, keyless. `research`, `insider`,
  `announcements`, `ratios`, `news` — muns. `polycab.js` — BSE, keyless.
  `capital-calls.js`, `tile-sets.js`, `investment-profiles.js` — the repo's store
  file via `GLOW_GITHUB_TOKEN` (until it is set, they say so). `corporate-actions.js` — the Glow Central Research
  capture. `stock-exposure.ts` — the look-through read model.
- Workflows: `harvest.yml` (macro series store), `fund-navs.yml` (AMFI NAVs),
  `polycab.yml` (Polycab exchange data), `index-sectors.yml` (NSE factsheet
  sector weights, days 1–15 monthly).
- With no token and no network every page renders on statement marks.

## Conventions

These are not style preferences; each one exists because breaking it put a wrong
figure on screen.

1. **Never fabricate** — `—` with a reason through `Absent.tsx`.
2. **Measured zero ≠ absent measurement.**
3. **Ingest primitives; derive the rest.**
4. **Printed values are a check, never a source.**
5. **Never blend a missing value into a total as zero** (`sumOrNull`).
6. **STATEMENT vs LIVE basis.** Live prices move market value, day change,
   unrealised P&L and return on cost — never quantity, cost, realised, dividends,
   fees or a dated flow. Capital Gains, Data Audit, Ledger Insights and Private
   Market read `statementPortfolio`. Named exceptions: a holding rolled forward
   on witnessed dated trades (`rolledForward`, Stage 10dw); the AMFI NAV overlay
   never sets `live`; depository-valued rows exist on the live basis only.
7. **`src/data/glowData.ts` is generated. Never hand-edit it.**

And:

- A consolidated figure counts each `dedupeGroup` once; a per-account or
  per-owner figure does not.
- Nothing on screen is hardcoded that isn't derived from the book (icon maps,
  sector tables and statutory rates excepted).
- Every new `ink-*`/`slate-*`/`champagne-*` utility needs a light-mode remap in
  `index.css`, including each opacity and `hover:` variant; `divide-*` remaps
  mirror Tailwind's selector.
- A failure message names the ACTUAL cause (`upstreamStatus.ts`); a card that can
  never be filled must not look like one that is waiting.
- Money is INR at the model layer; format with `fmtFromBase`.
- Wide tables scroll inside their own container; the page body never scrolls
  horizontally. Nothing under `#root` is sized in `vh` (`--app-zoom` is 0.875).
- **No explainer lines** (Stage 10cp): a sentence a reader acts on is the hover
  on the figure it qualifies; a line that must be seen says why with
  `data-prose-ok="<reason>"`. Checked by the `prose` probe on every route.
- Tables declare their columns (`useTableView` / `SortHeader` / `Tr`); a table
  that must not be rearranged declares `data-table-static="<reason>"`. Every table
  stripes (`--row-alt`).
- Deep links into Data Audit are gone; formula popovers stay except on Morning
  CIO.

## Verifying

- `check:pages` invariants return `true`/`false` or `{ notChecked }` — **never a
  string** (any truthy return is a pass). Abstain only with evidence from the
  book; a missing probe or control is a failure.
- Strike claims on `data-*` handles or geometry, never on prose a redesign may
  reword. Re-express a derivation in `scripts/check-pages.mjs` off `glowData.ts`
  rather than importing the helper under test.
- Prove a check by reintroducing its bug: the `scripts/dev/*-bug.*` harnesses
  restore by copy on a trap, rebuild on the way out, report a patch that does not
  apply as NOT A RESULT, and are best run in a separate worktree.
- Restart `vite preview` after a book change (the read-model endpoint is
  memoised). Read models (`public/views/`, `src/data/readModels.json`) are
  gitignored and built by `npm run build:views`.
- Known failures on main to leave alone unless asked: VD-17 on `monitor`, the
  priority-request check on `cio-live`, and the no-NSE-symbol check on
  `corporate-actions`.

## Build

- `npm run build` — `tsc -b && vite build` (builds the read models first). Keep
  it green.
- `npm run dev` / `preview` — local server; checks expect a preview on :4173.
- `npm run inventory` · `extract` (no options; `GLOW_PDF_PASSWORDS`;
  `GLOW_SOURCE_DIR` / `GLOW_AUDIT_DIR` / `GLOW_DOCS_DIR` for a scratch tree,
  `GLOW_CARRY_DIR` for the archive a scratch run carries sealed files from) ·
  `report:extraction` (extraction report from the archive).
- `npm run build-book` — the book and its report (then `build-review-columns`,
  `build-profiles` → `src/data/privateProfiles.json` from any profile table in `source/`).
- `npm run accounts-table` — the accounts table above (`-- --write` splices).
- Replays (each `--check` is a no-op control; follow with `build-book`):
  `rekey:archive`, `replay:calls`, `replay:owners`, `replay:dedupe`,
  `replay:movements`, `replay:flows`, `replay:flow-lines`,
  `replay:demat-holdings`, `replay:folio-cost`.
- Reference data: `build-symbols`, `build-sectors`, `build-index-sectors`
  (monthly; index sector weights), `build-fund-navs`,
  `build-upstox-instruments`, `build-scheme-names`, `build-lookthrough`
  (`-- --reindex` needs no AmfiBeas checkout), `build-polycab`, `harvest`,
  `probe:sources`.
- Cross-checks (never write to the book): `reconcile:review`,
  `reconcile:register`, `coverage:source`, `check:reads` (exits non-zero on
  any statement not read in full or not in the book).
- Tests: `test:ingest`, `test:family`, `check:family`, `check:pages`
  (`ONLY=<routes>`; screenshots in `docs/page-check/`), `check:columns`.
- `dev:mock-quotes` — the live layer mocked; `set-password -- "<password>"` —
  the edge gate.
