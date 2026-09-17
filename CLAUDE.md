# Glow Ventures Family Office — Investor Cockpit

A Vite + React + TypeScript single-page dashboard for the Glow Ventures Family Office.
The book is assembled offline from **PDF statements issued by several wealth
platforms** and baked into `src/data/glowData.ts`; the display layer converts INR
(the base currency) into the selected display currency.

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

`src/components/Preview.tsx` renders a GREYED SAMPLE so the client can see the
shape of a FOOS-spec screen before its source exists. That is legitimate for a
page that is nothing but a mock. It went wrong twice, in ways worth naming
because both looked compliant — badged, hatched, muted, `title`-tagged:

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
- **Exposure & IPS** — `Portfolio movement: MoM +2.1% · QoQ +6.4% · YoY +18.7%`
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

- `src/pages/*` — one file per dashboard route (see `src/App.tsx`).
- `src/lib/types.ts` — the canonical model. Read this first.
- `src/lib/securityKey.ts` — the join key (see below).
- `src/lib/accounts.ts` — the account registry: owner vs provider, per-account as-of.
- `src/lib/analytics.ts` — shared aggregation math (per-entity / per-sector /
  per-custodian rollups); `sumOrNull`; `holdingBucket`, the ONE place that decides
  which section a holding sits in on a holdings table — including
  `CASH_EQUIVALENT_KEYS`, the family's own instruction that a liquid fund or
  liquid ETF is cash whatever wrapper its statement typed it as. See Stage 10av.
- `src/lib/tranches.ts` — THE FAMILY'S OWN DATED INVESTMENTS, one definition read
  by both surfaces: the Transactions card's My investments rollup and the
  per-contribution breakdown a holdings row opens into. See Stage 10ag.
- `src/lib/lookthrough.ts` — what a fund the family holds DISCLOSES, and
  `companyExposure`: ONE definition of this family's exposure to a COMPANY, both
  halves kept apart, read by the Portfolio Monitor's stock axis and by Sector
  Composition's Consolidated view. `src/lib/useStockExposure.ts` assembles its
  three inputs once. See Stage 10aq.
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
  DOCUMENT. See Stage 10ar.
- `src/lib/indices.ts` — the four live NSE index levels (`/api/indices`), and the
  one place `NIFTY_500_SYMBOL` is named so the strip and the NAV chart cannot
  disagree about which index "Nifty 500" means.
- `src/lib/ledger.ts` — the DATED record, read from `public/audit/` at runtime (see below).
- `src/lib/format.ts` — currency / percent / number formatting; `fmtFromBase` (via `PortfolioContext`) is the standard money formatter.
- `src/components/*` — shared UI (`Card`, `StatTile`, `SearchInput`, `Pill`, `BasisPill`, `Auditable`, `Absent`, …). Reuse these rather than re-styling tables inline.
- `src/context/PortfolioContext.tsx` — loads the book, holds display-currency state, detects the empty book.
- `scripts/ingest/*` — the statement intake pipeline. `lib/bundle.mjs` splits a
  multi-report PDF; `lib/sheet.mjs` reads the spreadsheets (an `.xls` in this drop
  is an HTML table, not BIFF — the format is sniffed from the bytes, never the
  extension); `providers/*` is one reader per document family.
- `src/data/glowData.ts` also exports `BOOK_COMMITMENTS` — undrawn capital owed
  to a drawdown fund. Not a holding, and never summed into NAV.
- ...and `BOOK_POLYCAB` — the RING-FENCED promoter holding, a real position kept
  out of `BOOK_POSITIONS` and therefore out of every total, split, allocation and
  holdings table. `src/pages/Polycab.tsx` is its ONLY reader and reads it
  directly rather than through `PortfolioContext`, so it cannot leak back into a
  portfolio figure. See **The ring-fence**.

## The data model, and why it differs from a workbook-sourced book

This book comes from PDF statements across several wealth platforms, not from one
spreadsheet. Four things follow, and they are load-bearing:

**What is actually in `source/` today.** SEVEN DELIVERIES, and every one stays:
the original set at the top of `source/`, the client's `august-2026/` folder, and
`august-2026-b/`, `august-2026-c/`, `august-2026-d/`, `august-2026-e/` and
`august-2026-f/` — statements that arrived after it. **ALL SEVEN have now been
through `npm run extract`**, `august-2026-f/` included: its two outlined-text
statements are read by rendering their glyphs (see its own section) and its third
file is a register held out of the book by decision. 35 provider names in the
archive, of which **31 are issuing institutions** — HDFC Bank's NSDL depository is
the new one — **51 accounts** in the book, six holders and two family trusts, 53
delivered files expanding to **318 leaf files** — of which **264 documents** are
extracted, 199 read fully, 62 partially and **exactly ONE not at all**:

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
Measured today: 252 read, 4 read via a byte-identical twin, 2 held out by
decision, 58 macOS `__MACOSX/._*` resource forks (checked per file for a `%PDF`
header, never assumed from the path), 2 password notes excluded by policy, and
**0 unread**. `docs/SOURCE-COVERAGE.md` is its output; the counts in this
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
| Sanshi Fund | 9039671821 | Aarti Jaisinghani | 2026-06-30 | ₹97.68 Cr |
| ICICI Bank (NSDL demat) | 49794950 | Ajay Jaisinghani | 2026-03-31 | ₹63.78 Cr\*\* |
| Buoyant Capital | 103473 | Ajay Jaisinghani | 2026-07-31 | ₹49.30 Cr |
| Carnelian Asset Management | 3517383 | Ajay Jaisinghani | 2026-08-10 | ₹39.53 Cr |
| Motilal Oswal demat | 1201090012838316 | Ankita Jaisinghani | 2026-07-31 | ₹38.38 Cr |
| Motilal Oswal demat | 1201090012838320 | Bharat Jaisinghani | 2026-07-31 | ₹32.83 Cr |
| Helios Mutual Fund | 10355977 | Ajay Jaisinghani | 2026-08-07 | ₹31.00 Cr |
| Motilal Oswal demat | 1201090012838335 | Aarti Jaisinghani | 2026-07-31 | ₹30.95 Cr |
| Sanshi Fund | 9069671554 | Ankita Jaisinghani | 2026-06-30 | ₹29.42 Cr |
| Sanshi Fund | 9039671912 | Ajay Jaisinghani | 2026-06-30 | ₹29.35 Cr |
| Sanshi Fund | 9069671634 | Ajay Jaisinghani | 2026-06-30 | ₹28.46 Cr |
| Buoyant Capital | 103472 | Ankita Jaisinghani | 2026-07-31 | ₹27.69 Cr |
| Motilal Oswal Founders Fund | 90410016104 | Ajay Jaisinghani | 2026-07-31 | ₹21.83 Cr |
| Motilal Oswal Active Momentum Fund | 904168868444 | Ankita Jaisinghani | 2026-08-06 | ₹21.42 Cr |
| V.E.C Assago Capital | 128005 | Ajay Jaisinghani | 2026-08-13 | ₹20.29 Cr |
| Sanshi Fund | 9039671854 | Bharat Jaisinghani | 2026-06-30 | ₹19.57 Cr |
| Goldstandard Wealth | 100023 | Ajay Jaisinghani | 2026-08-11 | ₹18.80 Cr |
| SVAN Investment Managers | 8710067 | Ajay Jaisinghani | 2026-07-31 | ₹16.45 Cr |
| Carnelian Bharat Amritkaal Fund | 4551 | Ankita Jaisinghani | 2026-07-31 | ₹16.31 Cr |
| Green Lantern Capital | 510861 | Ajay Jaisinghani | 2026-07-27 | ₹11.45 Cr |
| Motilal Oswal Delphi Equity Fund | 9049241536 | Ajay Jaisinghani | 2026-06-30 | ₹11.13 Cr |
| Motilal Oswal Founders Fund | 90410016093 | Ankita Jaisinghani | 2026-07-31 | ₹10.99 Cr |
| SVAN Investment Managers | 8710090 | Bharat Jaisinghani | 2026-07-31 | ₹10.70 Cr |
| Goldstandard Wealth | 100022 | Ankita Jaisinghani | 2026-08-11 | ₹8.02 Cr |
| V.E.C Assago Capital | 128004 | Ankita Jaisinghani | 2026-08-13 | ₹6.50 Cr |
| Green Lantern Capital | 510854 | Ankita Jaisinghani | 2026-07-27 | ₹5.80 Cr |
| Neo Infra Income Opportunities Fund | 9039920536 | Ajay Jaisinghani | 2026-06-30 | ₹5.55 Cr |
| Baring Private Equity India Fund | AIFM_BPEPF6_0584 | Ankita Jaisinghani | 2026-03-31 | ₹1.88 Cr |
| Transition Venture Capital | TVC262 | Bharat Jaisinghani Family Trust 2 | 2026-03-31 | ₹1.71 Cr\* |
| Transition Venture Capital | TVC263 | Bharat Jaisinghani Family Trust 3 | 2026-03-31 | ₹1.71 Cr\* |
| 360 ONE Private Wealth | 37702 | Ajay Jaisinghani | 2026-07-31 | ₹1.47 Cr\* |
| 360 ONE Private Wealth | 60117 | Bharat Jaisinghani | 2026-06-30 | ₹1.46 Cr\* |
| Molecule Ventures | 7810404 | Ajay Jaisinghani | 2026-07-31 | ₹1.16 Cr |
| LKP Securities | 98245 | Bharat Jaisinghani | 2026-03-31 | ₹0.99 Cr |
| 3P Investment Managers | 3000048 | Ajay Jaisinghani | 2026-07-31 | ₹0 |
| HDFC Mutual Fund | 16180583 | Bharat Jaisinghani | 2026-08-06 | ₹0 |
| 360 ONE Alternates | 1000632 | Ajay Jaisinghani | 2026-05-18 | — (income-only folio; the units are marked elsewhere) |
| 360 ONE Alternates | 1000633 | Bharat Jaisinghani | 2026-05-18 | — (income-only folio; the units are marked elsewhere) |
| HDFC Bank (NSDL demat) | 67786137 | Ajay Jaisinghani | 2026-08-29 | — (**quantity only** — the rate printed is face value) |
| HDFC Bank (NSDL demat) | 67786547 | Ajay Jaisinghani | 2026-08-29 | — (**quantity only** — the rate printed is face value) |
| India SME Investments | 175962 | Ajay Jaisinghani | 2026-06-30 | — (no NAV published) |
| India SME Investments | 175964 | Bharat Jaisinghani | 2026-06-30 | — (no NAV published) |
| India SME Investments | 177302 | Ankita Jaisinghani | 2026-06-30 | — (no NAV published) |
| Motilal Oswal demat | 1201090012539150 | Ajay Jaisinghani | 2026-07-31 | — (**transaction statement only**, no holdings) |
| Motilal Oswal demat | 1201090037359311 | Ajay Jaisinghani | 2026-07-31 | — (**quantity only** — the rate printed is face value) |
| Motilal Oswal demat | 1201090037436848 | Bharat Jaisinghani | 2026-07-31 | ₹0 (a MEASURED zero — the statement's balance is nil) |
| Motilal Oswal Hedged Equity Multi Factor Strategy | 90410014574 | Ajay Jaisinghani | 2026-07-31 | ₹0 (a MEASURED zero — the statement's balance is nil) |
| Sky Capital Rising Titans Fund | SKY003 | Bharat Jaisinghani | 2026-07-31 | — (no NAV published) |
| Sky Capital Rising Titans Fund | SKY022 | Ajay Jaisinghani | 2026-07-31 | — (no NAV published) |
| Sky Capital Rising Titans Fund | SKY023 | Bharat Jaisinghani Family Trust 2 | 2026-07-31 | — (no NAV published) |
| Sky Capital Rising Titans Fund | SKY024 | Bharat Jaisinghani Family Trust 3 | 2026-07-31 | — (no NAV published) |

**THIS COLUMN WAS TEN TIMES THE BOOK.** Every row read ₹976.8 Cr, ₹103.8 Cr,
₹11.2 Cr — while the consolidated figure below it, which is generated, was
right. The rows summed to ten times their own stated total, which is the
contradiction the footer rule already names: a reader who adds up the printed
cells and gets a different answer has found one, and no prose rescues it. The
column is regenerated from `BOOK_POSITIONS` now, and it is regenerated EVERY
TIME rather than patched: hand-merging rows to keep it short is what let eight
accounts go unlisted, and a row added by hand is a figure copied into prose. It
is one row per account, all 51 of them, sorted by value — and the words in the
right-hand cell are `Account.noPositionsReason`, routed rather than written, so
an account that changes WHY it is empty changes this table on the next run.

\* the same holding, reported under both CRNs — see §4c. Counted once.

\*\* **THE FAMILY HAVE SINCE SAID SO, AND POLYCAB IS RING-FENCED.** That row used to
read ₹12,415.02 Cr, of which **₹12,351.24 Cr was POLYCAB INDIA** — the family's
promoter stock rather than a portfolio position. The paragraph here posed the
question and named the reversal; the family answered it, and the answer is the
`/polycab` page. The account keeps its other 11 holdings and its own as-of; the
promoter row is out of this column and out of every total below it. See **The
ring-fence** section.

**Consolidated ₹710.39 Cr**: listed ₹358.04 Cr, private ₹352.35 Cr. The
split is on `assetClass`, which is what a holding IS. It was `listedValue: totalValue,
privateValue: 0` — true when every account was a listed-equity mandate, and false
the moment the AIF statements got a reader, at which point 62% of the book was
being reported under a label that did not describe it.

**AND THE LISTED HALF IS NOW THE SMALLER ONE — because ₹12,351.24 Cr LEFT IT.**
Before the ring-fence this book read ₹13,061.63 Cr, listed ₹12,709.28 Cr; the
promoter block was 95% of the whole and 97% of the listed side. Anything that
compares this book against an older figure of its own is comparing two different
sets, and the two are ₹12,351.24 Cr apart by construction rather than by drift.

Six PMS mandates run on one reporting system (Goldstandard, Green Lantern,
Carnelian, V.E.C Assago, Molecule, and SVAN's SEBI report); five are Category-III
AIF folios; six are drawdown AIF capital accounts, four of them Sky Capital's
angel-fund folios and two held by TRUSTS; two are 360 ONE Distribution
engagements; SEVEN are the family's own CDSL demat accounts at Motilal Oswal
and one more at LKP; one is a joint mutual-fund folio. The rest are
single-scheme fund accounts, each issuing one statement.

**TWO OF THE 42 HOLD NOTHING, AND THAT IS A MEASUREMENT.** HDFC 16180583's two
schemes are redeemed to nil units, and both classes of Motilal Oswal's Hedged
Equity Multi Factor Strategy are redeemed — Class B2 switched out, Class F1 paid
out ₹11.19 Cr on 31 July 2025 — with the Account Summary printing a DASH for
units and for valuation on each. A dash is read as null, so the account carries
no holding rather than a zero-valued one: its ₹13 Cr contribution set against a
zero value would book the whole of it as an unrealised loss against money the
fund has already paid back. The account is kept and states the reason, which is
why the two look nothing alike from a page: an account nobody wired and an
account that holds nothing are both empty, and only one of them is a defect.

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


**Two holdings are reported under two members each, and are counted once.**
360 ONE Special Opportunities Fund Series 8 Class A3 appears under CRN37702 and
CRN60117 — the same 9,90,429.684 units on both — and Transition Venture Capital
Fund I — Class A1 under both Bharat Jaisinghani family trusts (₹1,71,26,374.76
each). Both rows of each are carried, naming the other through
`alsoReportedUnder`; the consolidated total counts the `dedupeGroup` once.
**₹3.17 Cr of double-count in total** — the figure to test any book-wide
aggregate against. This is check (c) firing on real cases, and it is what the
policy in §4c was written for.

**AND THE 360 ONE PAIR STOPPED MATCHING ON FIGURES, WHICH COST ₹1.47 Cr.** They
were byte-identical (₹1,45,80,412.51 each) for as long as both CRNs published to
the same date. CRN37702 then advanced to 2026-07-31 and CRN60117 stayed at
2026-06-30, so the two marks diverged by ₹87,950.15 and check (c) — which keys on
the security plus the FIGURES that would have to coincide by chance — stopped
matching them. It still matched their JUNE issues, and tagged those. But
`newestPerReportType` supersedes: `build-book.mjs` takes 37702's JULY holdings,
which carry no tag, so the group reached the book with ONE member,
`dedupedPositions` had nothing to collapse, and the same units were counted under
both CRNs.

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

**AND THE CONSOLIDATED REVIEW WORKBOOK IS NOT A SOURCE — BY DECISION.** The
adviser's 25-tab aggregation of the whole book is matched on a column header no
issuer prints (`Absolute Gain / (Loss) Including Redeemed Funds`) and has no
reader deliberately. Every figure in this book traces to the statement of the
institution that struck it; an aggregation carries someone else's decisions
about what to include and how to value it, and folding it in would end that
guarantee on the first cell. Its proper use is as an independent CROSS-CHECK of
the generated book, which is the role `golden.mjs` plays for the extractors.

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

- **`npm run build-register`** emits `src/data/registerData.ts` from the workbook.
  Generated, never hand-edited, and idempotent — it regenerates byte-identically.
- **`src/pages/Register.tsx` at `/register` is its ONLY reader**, and it reads
  that module DIRECTLY rather than through `PortfolioContext`. `usePortfolio` is
  used for one thing — the display-currency formatter — and never for a figure.
  So nothing on the page can leak into a total, an allocation, a sector or a NAV.
- **`scripts/lib/registerRead.mjs` is the one reader**, used by both
  `build-register.mjs` and `register-reconcile.mjs`. Two copies would be two
  chances for the page and the report to state different figures about one
  workbook — the failure `drilldown.ts` exists to stop for the book's own numbers.
  Extracting it was verified by regenerating `docs/REGISTER-RECONCILIATION.md`
  byte-identically.

**THE PAGE LEADS WITH THE PARTITION, NOT THE TOTAL, AND THAT IS THE ANTI-DUPLICATION
DESIGN.** ₹842.92 Cr of paid-in capital is NOT additive to a ₹710.39 Cr book:
₹391.14 Cr of it across 31 names is already inside NAV at a statement mark. A page
that printed only the gross would invite exactly the double count the family asked
to be ruled out, so the four buckets — in-book-as-account ₹347.73 Cr,
in-book-as-position ₹43.42 Cr, not-in-book ₹450.08 Cr, exited ₹1.69 Cr — are shown
apart, each with what it means for the dashboard, and they sum to the gross.

**TWO INVARIANTS, AND NEITHER IMPLIES THE OTHER**, both verified by reintroducing
their bug. `check:pages` walks `/register` and asserts it renders the register's
own largest not-in-book name, states these are amounts PAID rather than a
valuation, states it is no part of the book's totals, names the double count, and
never posts a paid figure as a cost basis. And on EVERY OTHER ROUTE it asserts that
name does NOT appear — `REGISTER_SENTINEL`, derived from the data like
`RINGFENCED_KEY` so the next drop picks its own. Measured: leaking the sentinel
onto Morning CIO fires the absence check; breaking the page's own wording fires the
page check; the full sweep is 102 combinations clean.

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
| **C.** an aggregate block the review itemises nowhere | understated | understated | ₹136.16 Cr at the review's marks |

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
The row renders `—` with the reason, and `check:pages` asserts it can never
acquire a number that parses as zero.

**THE LAST THREE ARE READ FROM THE BOOK, NOT DECLARED IN PROSE.** The card
filters `BOOK_CORPORATE_ACTIONS` on this holding's own `securityKey` and sums
`dividendReceived` off the position, so a drop that brings a Polycab dividend or
bonus into the archive fills those rows with no code change — and the page grows
a real corporate-actions table when one arrives. Until then each row states what
is missing and which document would carry it, as **three rows in ONE card**
rather than three dashed boxes: during an upstream outage three empty frames
read as three failures, which is the company page's own lesson applied before it
had to be learnt twice.

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
figure, never a zero. Verified by breaking each in turn — an off-by-one tile, a
demat count taken from rows, a weight over consolidated NAV, an unnamed account,
a fabricated nil, and a silently dropped row — and watching exactly the right
check fail.

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

### 4c. Duplicates: carry both, count once

*Pending confirmation from the provider — reversible policy, kept in one place.*
The same position can appear on two family members' statements. Neither row is
suppressed: matching rows share a `dedupeGroup` and carry `alsoReportedUnder`, an
account view shows each statement as printed, and **consolidated totals count
each group once** (`dedupedPositions` in `src/lib/analytics.ts`, mirrored by
`consolidatedValue` in `reconcile.mjs`).

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
  alert rule they entered is still held in `familyInputs.ts` and still exports
  from Exposure & IPS. Nothing evaluates a rule today.
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
   asked for it off Morning CIO and off the `/holdings` drill-down, and Stage
   10ap, when they asked for it off Private Market too.

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
  Morning CIO and `/holdings` lost theirs at Stage 10ao and Private Market at
  Stage 10ap, all at the family's request; those are the places this file's own
  §6 has been narrowed rather than upheld, and what each costs is recorded there
  rather than softened here. **The source never moved on any of them.**
- An absent figure goes through `src/components/Absent.tsx` with a reason. Never
  type a bare `—` inline, and never let an empty collection reach a formatter.

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

### Stage 10b — what else was waiting on the family, not on a vendor

Four more screens carried an absence whose stated cause was a missing feed, and
in each case the real cause was that nobody had asked the family. **An absence
recorded against the wrong cause is worse than a gap: it tells a reader to stop
looking for something they could supply in ten minutes.** The same discovery the
IPS made, applied to what was left.

**`src/lib/deals.ts` — the private deal register.** The AIF and drawdown
statements report a FUND's capital account; they say nothing about the companies
underneath — what was committed to which company, at what pre-money, for what
fully-diluted stake, and whether the last round diluted it. That is a
shareholders' agreement and a cap table, which no statement issuer holds and no
reader can extract. **Everything derivable is derived**: amount invested is the
SUM of the tranches entered, pending to invest is the commitment less that sum,
stake value is the post-raise stake times that round's post-money. None can be
typed, so none can disagree with its own inputs. A deal with no tranches recorded
shows `—` for invested, **not ₹0**, and therefore `—` for pending rather than
reporting the whole commitment as cash to find. Attachments are REGISTERED, not
stored: what a document is, its date and where it lives — a browser is the wrong
home for signed PDFs, and the page says so. The illustrative tracker preview
still renders on an empty book and **disappears the moment a real deal exists**,
because a sample beneath a table a reader has just learnt to trust is worse than
one standing alone.

**`src/lib/household.ts` — the balance sheet, the advisers, the decisions.** Net
worth, cash available, liquidity coverage and the charity pool were the four
Family Dashboard tiles whose reasons read "no bank statement in this drop", "no
outflow schedule has been supplied". Net worth = the measured portfolio + entered
assets − liabilities, and **the caption says how many register lines it spans** —
a net worth over one bank balance reads exactly like a complete one. Liquidity
coverage needs BOTH halves: cash with no schedule is not unlimited coverage and a
schedule with no cash is not zero months. A recurring outflow counts once per
occurrence inside the window, not once in total. **An amount of ZERO is accepted
and stored here**, unlike every price field in the codebase: a bank account at nil
is the measurement that turns coverage from unknown into a hard zero.
Tangible/intangible follows from the KIND, never a per-row judgement.

**The benchmark stays unchosen until the family chooses.** The harvest store
carries twelve indices, so the tile's old reason ("no index history endpoint") is
no longer true — but defaulting to the Nifty would put a comparison on screen
nobody agreed to, and this book is 62% private by value. The picker offers only
series the store actually carries, so a chosen benchmark always has a measurable
return.

**The decisions queue is real and still contains only what somebody typed.**
Nothing generates an item. Its predecessor was a preview that named two of this
book's own managers and asserted a pending approval — a reader who sees an item
on a decisions queue either acts or worries. An empty queue now says nothing has
been ENTERED, which is not the claim that nothing is outstanding.

**`Bucket.weight` on the Family Dashboard reads the mapping.** That card drew
invented weights summing to 100%, was corrected to show every bucket absent, and
then stayed absent whatever the family entered — wrong in both directions for the
same reason: it was not reading the one place the answer lives. It calls
`bucketActuals` now, like Exposure & IPS.

**Two suites check this, and they check different things.**
`npm run test:family` asserts the arithmetic (43 cases in
`src/lib/__tests__/familyMath.test.ts`); `npm run check:family` seeds a register
into a real browser and reads the rendered figures back. Both are needed:
`dedupedPositions` sat in `analytics.ts` correct and called by nothing for as long
as no drop contained a duplicate, and **a helper that returns the right number
into no caller looks exactly like a working feature.**

### Stage 10f — THREE OF THESE SCREENS HAVE SINCE BEEN REMOVED

The family asked for the **Family Dashboard** (`/household`), **Private Markets**
(`/private`) and the **Data Bank** to go: this book holds no private-market DEALS
to track, and every AIF folio it does carry is already in Portfolio Monitor's own
AIF section — folio for folio, same invested, same current value, same gain,
verified before the page was deleted. The only figures Private Markets showed
that the Monitor does not are the per-fund MANAGER column (the fund names carry
it) and the undrawn commitment, which is on Morning CIO's Dry powder tile and its
Capital deployment card.

**THE STORES STAY AND THE ARITHMETIC STAYS ASSERTED.** `deals.ts` and
`household.ts` still exist, `familyInputs.ts` still round-trips both through the
ONE export file on Exposure & IPS, and all 43 cases in `familyMath.test.ts` still
run. What is gone is the rendering. A family that had entered a balance sheet or
a deal register keeps it and can export it; deleting the model to match the UI
would have thrown their data away for a layout decision.

`check:family` lost the checks that read those pages, because it checks
RENDERING and there is nothing left to render — but it gained the assertion that
each removed route now REDIRECTS (`/household` → `/family`, `/private` and
`/data-bank` → `/monitor`) rather than breaking a bookmark. **A removal is
verified by asserting it happened, never by deleting the test alongside the
feature.**

**AND `/private` NOW FORWARDS TO `/private-market`, WHICH IS NOT THIS PAGE
COMING BACK — see Stage 10m.** The fund-of-funds tracker described above is
still gone and its six source arrays are still empty. What stands at the new
address is a different page over a different set of facts, and the redirect
moved because leaving it pointed at the Monitor while a live Private Market page
exists one link away is a stale routing decision — the same one Stage 9d removed
the day the calendar was wired. `/look-through`, `/funds` and `/value-creation`
were tabs of the removed page and follow it; `/data-bank` and `/household` do
not move, because neither is about private markets.

### Stage 10m — PRIVATE MARKET, and the money no other screen could show

*"there's no private market data anywhere on the dashboard. Make a new page below
portfolio monitor, 'Private Market' … whatever information for private markets is
there in the files, show that."*

Stage 10f removed a private-markets page and this adds one, so the difference has
to be stated plainly or the next session will read the pair as a reversal. **The
removed page rendered `portfolio.privateMarkets` — `BOOK_PE_FUNDS`,
`BOOK_PREIPO_FUNDS`, `BOOK_UNLISTED_COMPANIES`, `BOOK_DEBT_FUNDS`,
`BOOK_CLOSED_FUNDS`, `BOOK_STARTUPS`, all of them still `[]`** — so it drew a
₹0-invested private book and a deployment bar 100% undrawn against nothing
committed. Every one of those reads as a measurement. `PrivateMarket.tsx`
imports none of them, and never `src/lib/privateValue.ts`, whose helpers return
`0` rather than `null` for an empty input. Those absences are the last card on
the page, each named with what would fill it.

What the page shows instead is what the statements actually carry:

| | |
| --- | ---: |
| AIF holdings, deduped / raw | **19 rows ₹352.35 Cr** / 21 rows ₹355.52 Cr |
| Distinct funds · accounts · owners | 14 · 29 · 6 |
| Cost, and the rows reporting one | ₹293.73 Cr on **15 of 19** |
| Capital accounts: committed / drawn / still to call | ₹97.73 Cr / ₹81.75 Cr / **₹15.98 Cr on 13 of 15** |
| **Drawn against no valuation** | **₹18.23 Cr across 7 accounts** |

**THE AXIS IS `isPrivateClass`, NEVER `Account.engagement`.** Keying on the
engagement would be wrong in both directions on this book: three private
holdings sit in accounts whose engagement is `Distribution` (both 360 ONE CRNs)
or `Direct` (the ICICI NSDL row), and both Buoyant accounts carry engagement
`AIF` with a cash sleeve row that is not a private holding. The one question
engagement DOES answer is the opposite one — an account holding nothing has no
position to read a class off — which is why `unvaluedAccounts` is scoped to it.

**THE WHOLE OF THIS BOOK'S DOUBLE COUNT IS PRIVATE.** Both duplicated holdings —
360 ONE Special Opportunities under two CRNs, Transition Venture Fund I under
both trusts — are on this page, so ₹3.17 Cr of ₹3.17 Cr. Getting the dedupe
backwards here is guaranteed to be wrong in one direction or the other, and both
directions have shipped before. The fund table counts each group once, the folio
and per-owner tables do not, the page STATES the difference, and two invariants
assert it from opposite ends: a page that deduped everything passes one and fails
the other.

**₹18.23 Cr IS THE REASON THE PAGE EARNS ITS PLACE.** India SME's three folios
and Sky Capital's four report units and the capital drawn against a commitment
and no valuation anywhere. That money is real, paid, and appears on no holdings
table in this app — and it must never be added to a market value, because
contributions are what was PAID and not what the stake is WORTH. It has its own
tile, its own card and a footer saying it is in no total on the page.

**Two of the page's own checks were tautologies, and reintroducing the bug is
what found them.** The first draft computed the fund table's footer independently
of its rows, so building the rows from the raw set left every row carrying the
double count while the footer went on printing the deduped total — each figure
correct on its own terms, and no check able to see it. The footer is summed FROM
the rows now. The second compared the drawn-against-no-valuation tile against
another rendering of the same variable and passed while the tile was halved; it
reconstructs the tile from the table's rendered rows instead. **A check that
compares a figure with its own copy cannot fail**, which is this file's own rule
arriving through arithmetic rather than through prose. All eight invariants were
verified by reintroducing their bug and watching each fail.

`npm run test:family` carries the arithmetic (`privateMarket.test.ts`), anchored
on the deduped private total equalling **`BOOK_SUMMARY.privateValue` to the
rupee** — two independent paths to one figure, so it cannot go stale when the
next drop moves the book.

### Stage 10n — THE DEFAULT VIEW IS THE ZOOMED-OUT ONE

*"When I do ctrl -- the view becomes better and realigned. I want the zoomed out
view presentation without doing ctrl --."*

That is a defect report, not a preference. At 100% the Portfolio Monitor's filter
bar wraps its two buttons onto a second row, the Entity column breaks
`AJAY JAISINGHANI · V.E.C 128005` across two lines, and a wide table loses its
last column to the scroller. Zooming out buys CSS pixels and every one of those
goes away — so the reader was correcting a layout that did not fit, on every
visit.

**`--app-zoom` IN `index.css`, AND NOTHING ELSE MOVES.** One custom property,
`0.875` at ≥1024px, applied to `#root`. `zoom` is what browser zoom itself does:
it REFLOWS at the new scale, so the filter bar genuinely fits on one row. A
`transform: scale()` would shrink the picture and leave the layout believing it
was still 1500px wide — the wrap would stay, just smaller. Every px size in the
components is untouched; set the variable to 1 and the app is what it was.

**TWO THINGS ABOUT `zoom` THAT WERE MEASURED RATHER THAN REASONED**, because both
first drafts were wrong in ways that render:

- The obvious `height: calc(100% / var(--app-zoom))` is a DOUBLE compensation.
  Chrome already resolves a percentage height inside the zoomed coordinate
  space, so `100%` of a 900px viewport is the 1028px that paints back to 900.
  Dividing again gave `#root` a used height of 1028px against a 900px window and
  a permanent scrollbar on pages that fit.
- **Nothing in the zoomed subtree may be sized in `vh`.** A viewport unit is not
  rescaled by zoom, so the shell's `h-screen` painted at 100vh × 0.875 — a 787px
  app in a 900px window, with a dead band under it that reads as a rendering
  fault. The shell, the sidebar and the error boundary are `h-full` now, which
  chains off the `height: 100%` on html/body/#root. A future `min-h-screen`
  anywhere under `#root` brings the band straight back.

### Stage 10o — THE YEAR'S TRADING IS TWELVE LINES, NOT FOUR HUNDRED AND SIXTY-TWO

*"Show the year's transactions as one line per entity / manager / instrument, not
a raw tape. I will only see five items — Buoyant, VEC, Carnelian and the direct
stocks — then I can drill down."* And, separately: *"Bandhan mutual fund
staggered for the last seven eight months… I want to see that as one line item
and then drill down."*

Those are one request. A raw tape answers "what happened on 13 August"; a family
office asks what each manager did this year. This book's own tape makes the
point: Green Lantern bought The Anup Engineering on **fifty separate days across
five months**, in two accounts — a hundred rows for one decision, and reading
that tape a reader cannot see the decision at all. Measured over the PMS
transaction statements, **60 (account, security, side) groups carry four or more
dated rows.**

`src/lib/txnRollup.ts` collapses it in three levels — group → instrument →
tranche — and `TransactionsView` renders them expandable, with **By manager**
(the default), **By entity**, **By security** and **Tape**. Tape stays because a
reconciliation against a PDF needs the printed rows in printed order.

**THE STAGGERED ASK NEEDS NO DETECTOR, AND THAT IS THE POINT.** Grouping by
instrument collapses a series whether it was a monthly SIP, a broker working an
order over five weeks, or two unrelated buys. A DETECTOR would have to decide
what counts as "a series" — a cadence, a tolerance, a minimum count — and every
one of those thresholds is a judgement the statements do not state, applied to
real money. `staggered` is therefore a LABEL on a row that is already collapsed
(≥4 rows on one SIDE, so four buys and four sells is two campaigns rather than
one series of eight), never a decision about what to merge. Getting the
threshold wrong costs a chip, not a figure.

**AND THE FAMILY'S OWN EXAMPLE IS NOT IN THE BOOK — measured, and stated.** The
Bandhan rows in this corpus are in the Motilal Oswal DEMAT transaction
statements, and `precedence.mjs` deliberately excludes those from `transactions`
(*"a depository movement is not a trade"*). Checked rather than assumed: the
demat rows carry `side: "delivery"`, `unitPrice: null`, `net: null`, and the
Bandhan entries are `positionsAsOf` **closing balances** (`opening: 0 →
quantity: 3,371,575.697`), not dated tranches. **No statement in this book
carries those purchases date by date.** The card's footer says so — the tape
reads transaction statements only, because a depository moves units without a
price, a counterparty or a consideration. What would fill it is the folio's own
AMC account statement or a CAS.

**`settledAmount` ENDED `?? 0`, AND THE ROLLUP IS WHAT MADE IT MATTER.** A row
whose statement prints no settlement, no net and no gross reported the SAME
figure as a trade that settled for nothing. The tape got away with it by testing
`t.amount ? … : <AbsentCell>` at the point of render — the absent-vs-zero rule
enforced by a falsy check in the presentation layer rather than by the model.
The moment those amounts are SUMMED a `?? 0` blends an unreported trade into a
total as if it had cost nothing. `Txn.amount` and `Txn.price` are
`number | null` now, every rollup total uses `sumOrNull`, and each carries a
COVERAGE COUNT — a realised total over 13 of a manager's 18 sells is a different
fact from one over all 18, and on screen they are the same number.

**NET INVESTED NEEDS ONE DISTINCTION TO BE HONEST.** A side with NO ROWS
contributed a measured zero — nothing was sold, so the net is what was bought. A
side WITH rows whose statements report no settlement contributed nothing
measurable, and subtracting it as zero reports a net the book cannot strike. The
two are identical under `(bought ?? 0) - (sold ?? 0)`.

**THE GROUP LABEL GOES THROUGH `mandateLabel`, AND THE PROVIDER IS ALWAYS ON THE
SECOND LINE.** Re-deriving `strategy || provider` inline is how
`mandateLabelWithOwner` came to exist and be called by nothing while the monitor
drew four pairs of identical rows beside it. The provider rides in the sublabel
because a strategy name is whatever the manager printed: Molecule's is the single
word `GROWTH`, which as a heading over a year's trading names nobody.

**AND EVERY FIGURE SITS UNDER A HEADING THAT DESCRIBES IT.** The first draft drew
the tranche rows across the group table's columns by position, which put a
per-share price under `Bought` and the settled amount under `Sold`, and net units
under `Securities`. A caption asserting something of a figure that is not true of
it is the failure the Morning CIO's "cost in · listed only" tile already cost
this book once. Quantity and unit price ride with the date now (`228 @
₹3,086.88`); a tranche's amount lands in Bought or Sold by its own SIDE.

**SEVEN INVARIANTS AND THIRTY ARITHMETIC CASES, each verified by reintroducing
its bug.** `src/lib/__tests__/txnRollup.test.ts` runs against FIXTURES, because
the traps are `?? 0` on inputs that are absent in ways this drop may or may not
contain. `check:pages` walks `monitor-txns` and a new `monitor-txn-drill` route
that expands every manager and then the LONGEST staggered series, asserting on
DOM counts rather than prose: the footer must tie to the tape's own buy/sell
counter (a path that never touches the rollup), the realised total must name the
fraction of sells it covers, and the expansion must produce at least one dated
row per trading day the collapsed line claims.

**THAT LAST ONE WAS BLIND AT FIRST, AND REINTRODUCING THE BUG IS WHAT FOUND IT.**
Expanding whichever staggered row came first, a drill-down truncated to two
tranches still PASSED — that row spanned two trading days, so "at least one row
per day" was satisfied by the truncation itself. The walk picks the row with the
largest `data-days` now, chosen from the DOM rather than by name so the next drop
picks its own worst case. `data-row` attributes exist for exactly this: selecting
these rows out of rendered prose means matching a caption, which renders whatever
the data does and cannot fail.

### Stage 10p — DIRECT EQUITY IS A SET, AND THE HEADLINE IS ONE LINE

Four asks on the Transactions card, and two of them are about giving the table
back the rows the chrome was spending.

**THE EXPLANATORY FOOTER IS GONE.** It repeated under every view and told a
reader of the table nothing they needed. What survives is ONE line, and only on
Direct Equity, because that is the view where the absence IS the finding — see
below.

**"BY SECURITY" BECAME "DIRECT EQUITY", AND THAT IS A DIFFERENT SET RATHER THAN
A RENAME.** *"Replace by security with direct equity, that will contain the
transaction of all direct buy and sold equity transactions."* `holdingRoute` is
the axis Stage 10L settled after the same complaint arrived three times: a share
a discretionary manager picked and a share the family bought itself are the same
ASSET and a different DECISION. "Direct Equity" means the second everywhere else
in this app, so the tab FILTERS the tape to the accounts the family runs itself
(`Direct` / `Execution`) and then rolls those up per security. Re-using the word
for "grouped by security" would have been a fourth round of that argument.

Measured on the tape: of the twelve accounts that issue a transaction statement,
ten are PMS, one is Buoyant's AIF folio and **exactly one is own-account** — LKP
Securities 98245, Bharat's broking account: **21 trades across 14 securities,
₹84.4 L bought, ₹1.02 Cr sold**, which ties to the rupee to that account's own
row in the By-manager view. Every one of those rows is classed `Equity` by its
own statement, the liquid ETF sweep included, and that classification is not
second-guessed here; rows the statement classes as something else are excluded
so the tab's name stays true if an own-account fund purchase ever lands.

**AND THE ONE-LINE NOTE ON THAT VIEW IS LOAD-BEARING.** The tab is narrow
because the family's other own-account trading sits in the demat statements,
whose movements carry no price, no counterparty and no consideration and are
therefore not trades (`precedence.mjs`). Without saying so, fourteen securities
under a heading reading "Direct Equity" is a MEASUREMENT of how little this
family trades its own book — which is not what the corpus says. `check:pages`
asserts the line survives.

**THE HEADLINE IS ONE LINE AND THE VIEW SWITCH RIDES WITH IT.** *"Write daily
and portfolio monitor as a single line headline, daily in smaller font — this
will give us more space to show more data on the table. Also shift the
holdings/transactions toggle beside it."* `PageHeader` now renders eyebrow and
title inline on every route, and takes a `beside` slot for a control that says
WHAT the reader is looking at rather than acting on it. The Portfolio Monitor's
Holdings / Transactions switch moves there and its toolbar row is deleted
outright — the Holdings basis switch that shared it joins the Export / Deck
group. Two rows of chrome returned to the table, on top of the `--app-zoom`
change above.

**THAT CLAIM IS GEOMETRIC, SO IT IS CHECKED ON GEOMETRY.** `check:pages` reads
the bounding boxes of the eyebrow, the `h1` and the switch and requires them to
overlap vertically, with the eyebrow shorter than the title. Matching the words
"Daily" and "Portfolio Monitor" would pass just as happily with them stacked
three rows deep — which is the prose-matching failure this file already names
twice, arriving through layout.

**AND ONE CHECK PARSED A NUMBER THAT WAS NEVER THERE.** The rollup's Trades cell
renders the count and a `11B/1S` split beside it, so `innerText` is `211B/1S`
and the first number in it is 21 — a parser that happens to produce A number,
which is the exact class of wrong answer this sweep exists to catch rather than
commit. The count is read off `data-trades` now, like `data-days` beside it.

### Stage 10q — THREE ROWS OF CHROME, AND WHAT SURVIVED THE THIRD

*"Remove the security/entity switch — we will show just the default view as it
is. Also remove the review deck button, and adjust the export excel button in
the same line as all the filters. This will give us further space to show the
table."*

With Stage 10p's headline change, that is the Portfolio Monitor down from four
rows of chrome to two: headline + view switch, then filters + Export Excel. The
holdings table now starts 100px higher than it did at the top of this session.

**THE BASIS SWITCH IS GONE AND THE BASIS IS NOT.** `consolidate` moved from
`useState` to `useViewParam`, so `?view=entity` still reaches the per-statement
build. That is not a hedge: the by-entity rendering is threaded through fifteen
sites — the row build, the footer, the dedupe gap, the realised cells, the
Entities column header, the section subtotals — and pinning the flag to a
literal would leave every one of those branches unreachable, which is the
dead-code-that-looks-alive failure this file keeps naming. It is also where the
**₹3.17 Cr subtotal bug** lived: both of this book's duplicate holdings are AIF,
so by-entity is the ONLY view in which a class heading and the footer beneath it
can disagree. `check:pages` walks `/monitor?view=entity` now instead of clicking
a button that no longer exists, and its invariants are unchanged.

**THE REVIEW DECK IS DELETED, NOT ORPHANED.** `src/lib/exportDeck.ts` (403
lines) had exactly one caller, and this file's own rule is that a builder
nothing calls is worse than no builder — the next session finds it exported and
wires it back believing it load-bearing. So the module went with the button, and
`pptxgenjs` came out of `package.json` with it. Both are one `git revert` away
if the family wants the deck back.

**AND THE REMOVALS ARE ASSERTED, STRUCK ON BUTTONS RATHER THAN WORDS.**
`check:pages` counts `<button>` elements whose text is `By security` / `By
entity` / `Review deck` and requires zero. Matching those STRINGS would fail a
correct page: "By security" and "By entity" are still the Transactions card's
own view controls and still appear in this page's prose. The same probe measures
that Export Excel's box overlaps the last filter `<select>`'s — the "same line"
claim is geometric, so it is checked on geometry, like the headline above it.
All three verified by reintroducing their bug.

### Stage 10r — A CARD THAT IS LOADING SAYS SO, AND OPENS ON THE LAST SNAPSHOT

*"This section first shows empty and then starts showing data after some time.
It should show data from the beginning… it can show a small loading written text
but never empty and that data is not there."*

Today's movers rendered **"No holding in this book carries a day change right
now"** on the first paint of every cold open. That is a claim ABOUT THE BOOK,
made while the quote feed was still in flight — the same defect this file
already records on the company page, where a panel still fetching asserted the
security has no live quote. THE CAUSE PICKS THE HEADLINE, and there were three
causes collapsed into one branch.

**THE THREE STATES ARE SEPARATED NOW.** Still fetching says so. A feed that
answered and failed names the feed. Only a SETTLED feed that priced nothing
makes the claim about the book — and by then the claim is true. The index tile
inside the same card had the identical bug one layer down: it printed "Index
levels unavailable — the feed did not respond" whenever its feed was null, which
is true before the first response as well as after a failed one. `IndexStrip`
had already got this right with a three-state machine; the tile now matches it.

**AND THE APP OPENS ON THE LAST SNAPSHOT, SO THE FIRST STATE IS RARELY SEEN.**
`src/lib/quoteCache.ts` keeps the merged `QuoteFeed` in `localStorage` and
`PortfolioContext` seeds from it, so a reopen renders the day's figures
immediately and the live rounds refine them. That matters because the upstream
prices only PART of the book per call — the fill was several rounds deep, which
is why the card sat empty long enough to be reported.

Three rules keep a served snapshot honest, and the third is load-bearing:

- **`ageS` is RE-DERIVED on read**, never restored as written. It is what the
  top bar and the company page read to decide whether a price is fresh; restored
  verbatim it would say "0 seconds" about a snapshot hours old.
- **`quotesStatus` stays `loading` until a live round lands**, whatever the
  cache held. The figures are real and dated; the top bar is telling the truth
  when it says prices are still being fetched.
- **A SNAPSHOT OLDER THAN THE SESSION IS DISCARDED, NOT SHOWN.** A day change is
  `price − prevClose`, and `prevClose` is the PREVIOUS SESSION's close. Serving
  yesterday's snapshot would print yesterday's move under a heading reading
  "Today" — a real figure against the wrong day, which is the worst kind of
  wrong because it is plausible. Twelve hours: long enough to cover a trading
  day, short enough that a snapshot can never survive into the next session.

**THREE ROUTES, BECAUSE THE STATES NEED THE FEEDS IN DIFFERENT CONDITIONS.**
`cio-loading` holds both feeds open for the length of the walk — that window is
milliseconds against a real feed and cannot be caught by walking normally, since
the plain `cio` walk 404s immediately and lands on the FAILED branch, which is a
different and correct state. `cio-index-loading` fulfils the quotes and holds
only the indices, because the index tile lives inside the branch that renders
once there are priced rows and cannot be reached with the quote feed stalled.
`cio-cached` loads once with both answering, then RELOADS with them held open,
so whatever is on screen came out of storage alone.

**`networkidle` CANNOT BE REACHED WHILE A REQUEST IS HELD**, so those routes
navigate on `load` instead — waiting for the network to go quiet times out
against a page rendering exactly as intended.

**AND ONE CHECK WAS A TAUTOLOGY, FOUND BY REINTRODUCING ITS BUG.** "The index
tile says it is fetching" was matched page-wide, and the `IndexStrip` at the top
of every route prints that exact phrase while IT loads — so deleting the tile's
loading branch changed nothing the check could see. It is struck on the card's
own slice now. Six bugs were reintroduced in total and each fired the right
check; the one case left uncovered is named beside the code that governs it (a
failed POLL blanking a good tile needs one success then a failure, sixty seconds
apart).

### Stage 10s — THE MUNS CHAT, AND THE ONE SURFACE THAT IS NOT A MEASUREMENT

*"Replace the top search bar with our muns chat… it should be able to take data
from the dashboard and answer the client any queries. It should understand the
context since the dashboard data will be available to it."*

**WHAT IT REPLACED WAS A CONTROL THAT SEARCHED NOTHING.** The top bar's search
box was an `<input>` with no `value`, no `onChange` and no handler, in the most
prominent slot in the app. Nothing was lost, which is why this is recorded as a
replacement rather than as a removal to be asserted — but it is worth naming,
because a control that looks alive and does nothing is the failure this file
keeps finding in other forms.

**`functions/api/chat.js` — AND THE TOKEN NEVER REACHES A BROWSER.** POST
`https://devde.muns.io/chat/chat-muns` with `Bearer ${MUNS_TOKEN}`, the same
arrangement the eight functions beside it use. The body is PIPED, not buffered:
an expert-mode answer takes tens of seconds and a reader watching nothing happen
assumes it is broken. `X-Chat-Id` and `X-Message-Id` are forwarded and named in
`Access-Control-Expose-Headers`, because a header the browser cannot read is a
header that does not exist. **Nothing is cached**, unlike every other function in
that folder: an answer is not a document, and serving one from the edge would
attach one member's chat id to another's request.

**IT IS UNVERIFIED AGAINST THE LIVE API, AND SAYS SO.** `MUNS_TOKEN` exists only
in the Cloudflare environment, so this could not be exercised end to end —
`research.js` records the same position, and that doc has been wrong about a
response shape more than once. What IS measured: `POST /chat/chat-muns` with no
token answers **401**, so the host and route are real and the failure is
authentication rather than a wrong path. What is NOT: the SSE frame format, and
whether `DASHBOARD_INPUTS` is read at all. So `munsChat.ts` accepts the widest
plausible frame set (JSON with any of eight delta field names, `choices[0]`, or
a plain-text payload), IGNORES what it cannot parse rather than printing an
envelope into the answer, and reports `NO_TEXT_IN_STREAM` when a stream yields
nothing — which sends the next person to the field list rather than to the model.
The context also rides in the TASK TEXT for the same reason: a context the model
never sees is worse than none, because the answer looks fully briefed.

**THE CONTEXT IS THE PRODUCT, AND `chatContext.ts` IS WHERE THE HONESTY LIVES.**
A model asked about money it cannot see will fill the gap, so the snapshot is
built to make guessing unnecessary: consolidated NAV and its listed/private
split, allocation on `holdingBucket`, per-owner (NOT deduped, §"consolidated
counts once, per-account does not"), every account with owner, engagement and
report date, the top holdings, the undrawn commitments. Every figure derived,
none typed — 27.7 KB, against the function's 256 KB body cap.

**AND THE ABSENCES TRAVEL WITH THE FIGURES**, which is the half that matters.
`what_this_book_does_not_carry` is derived too, and names: the blend of report
dates (**47 of 49 accounts behind** the newest), the **60 of 371 positions
carrying no cost** and the ₹165.9 Cr they hold, the **₹3.17 Cr reported twice
and counted once**, the **₹12,351.24 Cr ring-fenced Polycab holding that is in
no total above** — with an instruction never to add it — and the four questions
this corpus structurally cannot answer. A model told the totals and not those
five things answers confidently and wrongly, and each is a question a family
office actually asks.

**AN ANSWER IS NOT A MEASUREMENT AND MUST NOT LOOK LIKE ONE.** Every figure
elsewhere in this app traces to a statement; this panel renders sentences that
no document produced, and **there is no `AbsentCell` in a paragraph.** So it is
marked `AI ANSWER · NOT A STATEMENT FIGURE` in words on the panel rather than in
a tooltip, the empty state says what the assistant was given AND that it cannot
reach an account, place a trade or see a figure the dashboard does not already
show, and a failure names its own code — `NOT_CONFIGURED` (no token) and
`UPSTREAM_ERROR` (a token the API refused) send the next person to completely
different places, which is `upstreamStatus.ts`'s rule arriving through a chat.

**`user_index` — AND WHY THE ENDPOINT'S OWN DOC DID NOT WORK HERE.** The first
live request came back `400 — "user_index is required in the request body for
service token requests"`. That is a TOKEN CLASS mismatch, not a wrong path. The
doc specifies `Authorization: Bearer <YOUR_SESSION_TOKEN>` — a USER session
token, where the acting user is implicit in the credential. `MUNS_TOKEN` is a
SERVICE token, so the user is not implicit and the API asks the caller to name
one. **This is the first USER-SCOPED muns endpoint this dashboard calls**: the
other seven are stateless lookups — a quote, a filing, a ratio table — with no
owner, session or history between them, which is exactly why none of them ever
needed the field and why the omission could only surface here.

**THE VALUE WAS TO BE CONFIGURED AND NEVER GUESSED — AND THE DEPLOYMENT
OVERTURNED THAT.** `MUNS_USER_INDEX` sat in the Cloudflare environment as the
ONLY source of the field: unset, the function refused before calling the
upstream and named the variable (`USER_INDEX_REQUIRED`), because a wrong index
would file this family's conversation under somebody else's account — a worse
outcome than the 400 it replaced. That was right while nobody had supplied a
value. See the two paragraphs below for what happened when somebody did.
A `user_index` in the REQUEST is still ignored — the browser does
not get to say whose account a question is filed under. `GET /api/chat?probe=1`
makes one live round trip so the value can be confirmed on the deployment
without a redeploy cycle, and the diagnostics report the index's PRESENCE, its
SHAPE and its SOURCE, never the token.

**AND THE IDENTITY IS `user_id: 14`, FIXED AT THE CLIENT'S INSTRUCTION.**
*"Pass an argument named `user_id`: 14 — this is a static value, don't change
it, keep it 14 only, include it in the main payload."* It is a CONSTANT rather
than an environment variable precisely because it was given as one: the value is
the same on every deployment, and putting it in the environment would let an
unset variable break a working dashboard. It is never taken from the request —
the browser does not get to say whose account a question is filed under — and a
`user_id` in the body is ignored.

**`MUNS_USER_INDEX` THEREFORE STOPPED BLOCKING THE CALL** — and that build sent
`user_id` alone, deliberately NOT copying it into `user_index`, on the reasoning
that "index" and "id" are not obviously the same field and a 14 meaning a
position in a list rather than an identity would file this family's conversation
under somebody else.

**AND THE UPSTREAM REFUSED IT ANYWAY, WHICH IS THE MEASUREMENT THAT SETTLED
IT.** Run on the deployment, that build came back with the SAME
`400 — user_index is required…`. So `user_id` is not the field the API is
asking for; the only value anyone has named for this deployment is 14; and the
choice was between sending it under both names or a chat that can never answer.
**The fixed identity now goes as `user_id` AND `user_index`.** What changed is
the evidence and not the rule: the earlier refusal was declining to INVENT a
value, and this is sending the one the client gave. `MUNS_USER_INDEX` survives
as the OVERRIDE — set it and it WINS — for the day the two turn out to differ.

**AND `USER_INDEX_REQUIRED` IS GONE RATHER THAN LEFT UNREACHABLE.** With an
identity always in the body, a 400 naming one means the value was REJECTED and
never that it was missing, so the two-code split collapses to
`USER_INDEX_REJECTED` carrying the upstream's own sentence — which names the
field, where the dashboard would only paraphrase it. The panel's
`USER_INDEX_REQUIRED` copy went with it. `chatFunction.test.ts` asserts the
REMOVAL — that the same 400 with no override set still comes back
`USER_INDEX_REJECTED` — because deleting the branch and its test together would
leave nothing to notice a future edit putting the request back to the shape the
deployment refused.

**AND THE PANEL PRINTED THE WHOLE ENVELOPE AT THE READER.** NestJS nests its
error as `{ message: { message, error, statusCode } }`, and the first cut
rendered that JSON blob into the chat — machine noise where a sentence belongs.
`upstreamMessage` unwraps to the deepest string; anything that is not JSON is
passed through truncated rather than swallowed.

**AND THE DIALOG WAS TRAPPED IN THE TOP BAR.** The family reported the panel
"mixing with the dashboard UI", and the cause was not transparency — the panel
measures fully opaque. `backdrop-filter` on an ancestor makes THAT ANCESTOR the
containing block for `position: fixed` descendants, and the top bar the trigger
lives in carries `backdrop-blur`. So `fixed inset-0` resolved against the
header: the overlay measured **1304×55**, a scrim over the header strip and
nothing else, with the dashboard underneath never dimmed at all. It is
portalled into `#root` now — not `document.body`, because `#root` carries
`--app-zoom` and the dialog has to keep the app's scale.

**A SCRIM HAS TO DIM, AND THE FIRST ONE DID NOT.** 0.35 alpha over a 4px blur
left the table behind perfectly legible. It is 0.62 over a 20px blur now, on a
warm mid-tone whose luminance stays above the light-remap check's threshold —
the utility reads as deliberately remapped rather than as the dark chassis
colour leaking onto a light page.

**AND THE PANEL IS SIZED IN PERCENT, NEVER `vh`.** `h-[min(78vh,720px)]` painted
78vh × 0.875 — a 614px panel in a 900px window while claiming 78% — because a
viewport unit is not rescaled by zoom (Stage 10n). A percentage of the
correctly-sized overlay avoids it: 896×805 against 672×614.

**BOTH ARE CHECKED ON GEOMETRY**, because not one rendered word changes when
either regresses: the overlay must cover the viewport, and the panel must take a
majority of it. Verified by removing the portal and by restoring the old size.

**THIRTY-FOUR ARITHMETIC CHECKS AND FIVE RENDERED ONES.**
`src/lib/__tests__/chatContext.test.ts` reconciles the snapshot against the
GENERATED book by a different path from the builder's — NAV against
`BOOK_SUMMARY`, buckets against `dedupedPositions`, the per-owner gap against
`doubleCountedValue`, the fence against `BOOK_POLYCAB` — and asserts the fenced
value is NOT inside the NAV the same context reports. It also walks the whole
payload for a non-finite number, because a `?? 0` in the builder is the
absent-vs-zero rule failing through a JSON field instead of a table cell.
`check:pages` walks a `chat` route that opens the panel and asks one question:
the label, the stated snapshot, the vanished search input, and the named
failure. All verified by reintroducing their bug.

**AND THIRTY MORE ON THE FUNCTION ITSELF** (`chatFunction.test.ts`),
against a STUBBED upstream — the token exists only in Cloudflare, so the real
API is out of reach from a test, but every branch around it is not: that
`user_id` and `user_index` both carry the fixed identity at the top level, that
`MUNS_USER_INDEX` overrides it as a number when it reads as one and verbatim
when it does not, that a request-supplied one is ignored, that no call is made
at all when the TOKEN is unconfigured, that `USER_INDEX_REQUIRED` can no longer
be reached, and that the deployment's exact 400 envelope comes back as one
readable sentence under its own code.

### Stage 10g — the XIRR is on the Morning CIO, and it is CHECKED

The family asked for Embedded gain to be replaced by an XIRR. Two things had to
be true first, and one of them was a latent bug:

**A PER-ACCOUNT TERMINAL VALUE MUST READ `portfolio.positions`, NOT THE DEDUPED
SET.** `measured()` closed each account against a market value taken from
`consolidated`, so the account whose row lost the dedupe would have closed
against less than its own statement prints. No account carrying a duplicate
publishes an opening portfolio value in this drop, so nothing on screen was
wrong — which is exactly why it had to be fixed BEFORE the rate went on a tile
rather than after a drop where it bites. It is the §"consolidated counts once,
per-account does not" rule, failing in the direction that is invisible.

**AND THE RATE IS VERIFIED AGAINST THE MANAGERS' OWN PRINTED FIGURES.**
`src/lib/__tests__/accountXirr.test.ts` reproduces each account's own
financial-year-to-date return from our flows and our terminal value:

```
Carnelian 3517383     ours 26.49%   printed 26.98%   −0.49 pp
Goldstandard 100022   ours 20.36%   printed 20.57%   −0.21 pp
Goldstandard 100023   ours 20.87%   printed 21.08%   −0.21 pp
V.E.C 128004          ours 51.09%   printed 51.41%   −0.32 pp
```

The gate is 1.0 pp because these are two different measurements of one window —
the manager publishes a TIME-weighted return, this is MONEY-weighted, and they
diverge only to the extent capital moved mid-window (here, TDS transfers of a few
thousand rupees against crores). Wide enough that the basis difference cannot
fail it; narrow enough that a wrong sign, a dropped opening value or a shared
terminal date cannot pass — each of those moves a figure by tens of points, and
the suite asserts that too.

**AND THE PREMISE IN THAT PARENTHESIS IS NOW MEASURED, BECAUSE AN ACCOUNT BROKE
IT.** V.E.C 128005 took ₹11.24 Cr of new capital on 28 and 29 July and closes 13
August — **182% of its own opening value, sixteen days before the terminal
date**. Its money-weighted return came out 39.13% against a printed 46.44% and
the suite reported a 7.31 pp FAILURE for an account where nothing is wrong: a
rupee-left-alone figure cannot see that deposit and ours must. Widening the
tolerance to 8 pp would have "fixed" it and let a dropped flow through forever.

Nothing is misread, and the statement settles it — strip the deposits out and
the account's gain over its own opening value is **46.43% against the printed
46.44%**, on the same flows and the same terminal value. So the comparison is
GATED ON THE PREMISE IT NEEDS: mid-window external capital over opening value,
and above 5% the money-weighted comparison is not struck. This book's seven
measurable accounts separate cleanly on that ratio — six between 0.012% and
0.045%, every one of them a TDS transfer of a few thousand rupees, and this one
at 181.9%.

**The gate is on the RATIO and never on an account number.** Typing `128005`
into the suite would stop checking it forever, including in the drop where its
flows go quiet again. And an excluded account is not dropped: it gets the
gain-over-opening reconciliation above as its own case, checked at 5 pp — wide
enough that WHEN a deposit landed cannot fail it, narrow enough that a sign
error still reads +363.72 pp. Both were verified by reintroducing the bug.

**Green Lantern's two accounts are NOT CHECKED and are named.** They are in the
tile, but their FYTD is printed on a report drawn 2026-08-10 while their holdings
close 2026-07-27; comparing them reports a −3.82 pp "failure" that is two weeks
of market movement. They are counted apart with their OWN reason printed rather
than one blanket line for every skip — a date mismatch and a capital movement
are different findings, and a reader who cannot tell them apart cannot act on
either. The suite fails if fewer than three accounts were actually compared — `golden.mjs`'s rule, that a suite passing over
no input claims confidence nobody earned.

**Trades are not flows**: a sale moves cash inside an account rather than out of
it, and its proceeds are already inside the closing value — which is why the four
comparisons above hold on accounts that traded actively over the window.

### Stage 10g(ii) — THE TILE READ +99% AND THAT WAS THE REAL BUG

Put on the strip as an annualised XIRR, it rendered **+99.0%**, and the family
challenged it. **Nothing was miscalculated.** ₹78.8 Cr of opening value and
contributions became ₹99.4 Cr over the 132 days from 1 April to 11 August —
**+28.3% money-weighted, +26.1% simple** — and compounding 0.36 of a year onto a
full one gives +99.0%. Every step reproduces.

**IT WAS A LOGICAL ERROR, NOT AN ARITHMETIC ONE.** An annualised figure is a
claim about a YEAR, and this book has four months of dated flows. The sources
settle it: these same managers publish their own ANNUALISED since-inception
returns for these very accounts — **Carnelian 19.83%, Green Lantern 11.45% and
10.6%, Molecule 7.31%** — so a 99% annual rate for the book they run contradicts
every one of them. A figure that no source supports is not made true by being
correctly derived.

**AND THE REPO ALREADY KNEW.** `totalReturnFromXirr` was written for exactly
this, `/performance` and `/family` were already de-annualising, and this file
already said "an unlabelled +141% reads as a sustained yearly return". It came
back the moment a tile asked for "XIRR", because the knowledge lived in prose
and in one page's local choice instead of in a function every caller must pass
through.

So the threshold is now **`moneyWeightedReturn` in `bucketXirr.ts`, once**:

- A window of **at least a year** returns the annual rate, `annualised: true`.
- Anything shorter returns the return earned **over that window**, and the
  caller must say so — the tile reads `+28.3% · 132-day window · not annualised`.
- The annualised rate is still on the object for the popover, where it is named
  an extrapolation beside the managers' own 7–31% range.
- When the flows eventually span a year the same call starts returning a genuine
  annual rate and the caption changes itself. No revisit needed.

`accountXirr.test.ts` asserts the guard is **load-bearing** — that annualising
this book's window would more than double the figure — so a test cannot pass by
accident on a book where the two happen to be close, and `check:pages` asserts
the refusal reaches the SCREEN: the window and coverage are rendered, a sub-year
window is never labelled annualised, and no triple-digit return appears anywhere
in the KPI strip.

**The strip carries BOTH returns, because they answer different questions over
different sets.** Money-weighted is dated and covers the 7 of 30 accounts that
publish an opening portfolio value (₹99.4 Cr); Consolidated return is cumulative
on cost and covers the whole ₹461 Cr book. Each states its own scope on its face.

### Stage 10j — "DIRECT EQUITY" WAS A CLAIM THE BOOK NEVER MADE

The family opened Jammu Kashmir Bank, saw it chipped **Direct Equity**, and read
two lines below that Carnelian manages it. They reported it as a classification
error. It was not one — and it was a real error.

**The asset class was right and its LABEL was making a second claim.** The shares
are `Equity`; §5 is unchanged and PMS still cannot be an asset class, because a
mandate is a relationship and the thing owned is a company's shares. What the
word "direct" asserted on top of that is that THE FAMILY CHOSE THEM, and for
₹127.12 Cr of this book a discretionary manager did. The page was contradicting
its own table.

**THE AXIS ALREADY EXISTED AND NOTHING READ IT.** `Account.engagement` is taken
off each statement's own wording and never defaulted (§5). Measured on this drop:

| | positions | value |
| --- | ---: | ---: |
| Equity · PMS mandate | 263 | ₹127.12 Cr |
| Equity · own demat | 18 | ₹30.12 Cr |
| Equity · broker (Execution) | 9 | ₹0.99 Cr |

So `isDirectEquity` is **`isCompanyShare`**, `assetClassLabel` renders the class
as **`Company Shares`** — the set was always right and only its name was wrong —
and `holdingRoute` / `ROUTE_LABEL` / `ROUTE_NOTE` in `analytics.ts` are the one
place the engagement becomes words.

**AND THE BUCKET THAT ESCAPED THE HELPER PROVED WHY IT EXISTS.** Morning CIO's
allocation row was keyed on the literal string `"Direct Equity"` rather than on
the asset class, so it was the one surface where the screen word was NOT chosen
in `assetClassLabel` — and it silently stopped matching the moment that helper
changed. Its key is `Equity` now and its label comes from the helper, like every
other class. The stock page
chips `via manager's mandate` beside the class and carries a **Held via** column;
Portfolio Monitor's per-entity drill-down carries the same column; Sector
Composition, Exposure & IPS and Compare say "company shares" and then state the
mandate/own split instead of leading with a word that denies it.

**AND MORNING CIO HAD COMPUTED THE SPLIT AND RENDERED IT NOWHERE.**
`equityManagedMV` / `equitySelfMV` were derived, exported from the memo, and
read by no caller — the comment above them said "for the caption only" and there
was no caption. That is `dedupedPositions` again: **a helper that returns the
right number into no caller looks exactly like a working feature.** The Equity
row states both halves now, and `check:pages` asserts it, along with the stock
page stating its route and never using the word "direct" for manager-chosen
shares. Both were verified by reintroducing the bug.

### Stage 10L — THE THIRD ROUND, AND THE WORD WAS NEVER THE PROBLEM

*"Any stock that is held thru an AIF or PMS, that will be shown inside the AIF/MF
drill down page. Direct Equity will be shares held directly. Also rename 'Company
shares' as 'Direct Equity'."* Jammu Kashmir Bank again — the same name, the third
report about it.

Rounds one and two both answered with a WORD. `Equity` → `Direct Equity` when the
heading was read as covering the AIF folios; `Direct Equity` → `Company Shares`
when "direct" was read as a claim about who chose the position. Both readings were
real and both fixes were right about what they fixed. **Neither was what the family
was asking for**, and the third time a complaint arrives on one screen is when the
answer has to stop being a better label.

They were asking for a different GROUPING: a share a manager picked and a share the
family bought are in one table under one heading, and they want the first inside its
mandate. Once the grouping is right, "Direct Equity" becomes TRUE — which is why the
word they asked for goes back on the heading in the same change that stops it lying.

**THE AXIS IS `holdingBucket`, AND IT IS NOT A NEW MODEL.** `assetClass` does not
move: §5 stands, PMS is an ENGAGEMENT, and `assertNormalized` still rejects a
document that says otherwise. The shares Carnelian holds for this family ARE
ordinary listed equity. What changed is only how the HOLDINGS TABLES group them:

```
mandate route (engagement PMS)  -> MANDATE_BUCKET  "PMS mandates"  (its cash sleeve too)
Equity + own                    -> DIRECT_EQUITY_BUCKET "Direct Equity"
Equity + unroutable             -> UNROUTED_EQUITY_BUCKET
anything else                   -> its own assetClass
```

Measured on the rendered page, and every figure precomputed from `BOOK_POSITIONS`
before a line was written:

| Section | | |
| --- | ---: | ---: |
| Direct Equity | 38 holdings | ₹12,446.1 Cr → **37 · ₹94.9 Cr** since the ring-fence |
| PMS mandates | 10 mandates · 281 holdings | ₹138.7 Cr |
| AIF | 14 | ₹352.3 Cr |
| Mutual Fund | 20 | ₹99.9 Cr |
| ETF | 3 | ₹24.6 Cr |
| Cash | 2 | ₹0 |

Only the Direct Equity row moves, and it moves by the one row: Polycab was 38th
of 38 by count and 99.2% of that section by value. Every other section is
untouched, which is what a fence around ONE security is supposed to look like.

The by-security row count falls 215 → 86, and Jammu Kashmir Bank now sits inside
Carnelian Bespoke Portfolio at `/mandate/<accountId>`.

**THE TWO WORDS NAME TWO DIFFERENT SETS AND BOTH ARE NOW TRUE OF THEIRS.**
`assetClassLabel("Equity")` stays **"Company Shares"** — it answers *what IS this*,
and a share a manager picked is a company share exactly like one the family picked.
`DIRECT_EQUITY_BUCKET` answers *who chose it*. Neither is asked to carry both claims,
which is precisely what rounds one and two each tried to make one word do. It is also
why **Sector Composition, Exposure & IPS, Compare and the market-cap bands KEEP
counting mandate-held shares**: a PMS-held share has a GICS sector and a market cap,
and narrowing those would throw away ₹127.12 Cr of real sector exposure and leave a
sector table built from depository rows that carry almost none. A look-through into a
mandate is a GAIN for exposure analysis. Those pages say so on their face.

**A MANDATE TAKES ITS CASH SLEEVE, SO ITS ROW TIES TO ITS STATEMENT.** Carnelian
3517383 reads ₹39.53 Cr — shares and cash, the figure its own statement prints.
Bucketing the cash elsewhere would leave the row with no document to tie to. The cost
is that the top-level Cash row falls from ₹11.58 Cr to ₹0, so **that row names where
the cash went** (`₹11.6 Cr more is held inside the PMS mandates above and counted
there`) and `check:pages` asserts it. The ₹0 is a MEASURED zero and keeps its zero.

*(THAT ROW IS ₹14.07 Cr NOW — see Stage 10av. The reasoning above is unchanged
and is why: a mandate still takes its whole account, its liquid sleeve included.
What moved into Cash is the liquid funds and liquid ETFs held OUTSIDE a mandate,
which were sitting under Mutual Fund and ETF — so the ₹0 this paragraph records
was real, and was the family being shown a book with no cash in it.)*

**AND A PMS ROLLS UP WHERE AN AIF CANNOT.** A mandate reports every underlying share
— the family owns them, the manager picks them — so the rollup is data the archive
actually holds. An AIF folio is ONE purchase of a fund, and the drop carries no
scheme portfolio that joins to any folio the family holds. So an AIF stays one row
and its drill-down SAYS the companies inside it are not reported to this book, rather
than drawing an empty constituent table. Same request, two different honest answers.

### The regroup's own defects, found by measuring rather than by reading

Eight surfaces changed at once, and an adversarial pass over each found **29 defects**
in the change itself. They are worth recording as a class, because six of them are the
same failure: **a figure that was whole became a figure over a FILTERED subset, and
its caption went on describing the whole.**

- **`% of mandate` divided by the filtered roll-up**, so selecting Jammu Kashmir Bank
  — the very holding this round was reported on — printed `100.0%` for a ₹4.3872 Cr
  position in a ₹39.53 Cr mandate. It is 11.10%.
- **The Weight column re-based on the company filter**, because the security
  multi-select had to move upstream to reach inside a mandate and the weight
  denominator moved with it. One selected name read 100.0% of a ₹13,061.63 Cr book.
- **A caption asserted what a named manager reports.** `The N holdings inside this
  mandate, as {manager} reports them at {asOf}` rendered over a filtered list —
  "The 1 holding inside this mandate, as Carnelian … reports them", about an account
  whose statement reports twelve. That is the §"never assert a FACT about a real,
  named counterparty" rule, arriving through a filter rather than through a preview.
- **An audit tooltip claimed the whole mandate** over a partial sum, and invited the
  reader to trace it to a statement printing a different figure.
- **The Realised P&L footer stopped tying to its column**: six of the seven accounts
  issuing a capital-gain statement are PMS mandates, whose rows now render `—`, so the
  visible cells summed to ~₹7 L against a footer an order of magnitude away.
- **A mandate row claimed LIVE pricing** because one constituent had a quote, while
  every mandate holds an unquotable cash sleeve.

And two that are the failure this file keeps naming in other forms: **a helper that
exists and is not called.** `mandateLabelWithOwner` was written for the four pairs of
mandates that share a strategy name — Goldstandard's Aristos for Ankita and Ajay,
SVAN's Velocity, Green Lantern's GLC Growth, V.E.C's Small & Mid-Cap — and the monitor
re-derived `strategy || provider` inline instead, drawing four pairs of
identically-named rows. `UNROUTED_EQUITY_BUCKET` was likewise never imported, so the
first unrouted account would have sorted its section below Cash.

**AND A RETURN WAS STRUCK ACROSS TWO DIFFERENT SETS OF HOLDINGS.** Morning CIO's
allocation showed Direct Equity at **−18.9%** beside ₹1.22 Cr invested and ₹12,446.1 Cr
current, because cost is reported for 9 of its 38 holdings and the regroup had isolated
the depository rows, which record what is held and never what it cost. Every figure was
right on its own terms; the three together were indefensible. The footer already
refuses exactly this ("No whole-book return in the Total row") and the row now uses the
footer's own 0.5% coverage test: a return appears only where the costed holdings
account for essentially the whole row. It keeps AIF (+20.0%) and PMS mandates (+11.4%),
and correctly refuses Direct Equity and Mutual Fund.

### Stage 10n — the pick-list is of HOLDINGS, and the money reads first

*"In the portfolio monitor tab it should be all holdings, it's not all companies,
because I'm buying multiple things."* Two changes, both to the Portfolio Monitor
and neither to the model.

**"ALL COMPANIES" WAS A CLAIM THE LIST DID NOT SUPPORT.** `securityNames` is keyed
on `p.security` over EVERY position, so the first options the dropdown offers are
Sanshi Fund-I, Buoyant Opportunities Strategy, the Motilal Oswal Founders Fund and
Helios Flexi Cap — an AIF folio, a Category-III strategy and two schemes, none of
them a company. That is Stage 10i/10j/10L one control down: a word true of SOME of
what is under it and not of all of it, on the surface a reader picks from. It reads
`All holdings` now, with the count and the search placeholder to match, and the
weight caption under the table says "the holdings you picked" for the same reason.

**AND THE SHARED COMPONENT WAS ASSERTING ONE CALLER'S VOCABULARY AT THE OTHERS.**
`MultiSelectFilter`'s empty-search line hardcoded "No companies match", so the
economic calendar's COUNTRY filter rendered it over a list of countries. It reads
the caller's own `unit` now — the noun each of the three callers already passes.

**MONEY FIRST, DESCRIPTORS LAST.** *"Reorder the columns so the money reads first
and Sector / Entity close the table."* Sector and Entity sat between the security
name and the first figure, so Qty, Avg cost, Invested and CMP were pushed off the
first screen on a table whose reader is scanning for value. They are the only two
columns on the row that describe the holding rather than measure it, and they now
close it: **Security · Qty · Avg cost · Invested · CMP · Day · Market value ·
Weight · Unreal. P&L · Realised P&L · Return · Sector · Entities.**

**NOTHING ABOUT WHAT ANY CELL RENDERS CHANGED** — every `AbsentCell` reason, every
`Auditable` formula, every basis note and the dedupe-aware footer are moved
verbatim. The footer's `Total · N rows` span narrows 5 → 3 and the row gains two
empty cells under the descriptor columns, because a column of words has no sum to
be missing; all three regions still come to 13. The same reading order is applied
to the two drill-downs the table opens out of (Sector last inside a mandate; the
route last on the per-entity split, where the owning entity is the row identity)
and to the Transactions tape, where Entity closes the row and Type stays beside
Security — one narrow column saying what the row IS, not a block of descriptors
standing between the name and the first figure.

**AND THE EXCEL EXPORT FOLLOWS, at the family's request.** It was left on its own
layout first — a different artefact, and the ask had been about the tab — and they
asked for it to match. `exportPortfolioExcel.ts` still carries three columns the
screen does not (Class, Held via, Mandate: which section a row sits in, who chose
it, and where a manager did, which mandate), and those are DESCRIPTORS too, so
they close the sheet beside Sector and Entities:

```
Security · Qty · Avg Cost · CMP · Market Value · Weight of book · Unreal. P&L ·
Return · Class · Held via · Mandate · Sector · Entities
```

**THE REORDER WAS THE EDIT THAT COULD NOT BE DONE BY HAND.** Every cell was
written as `row.getCell(9), cols[8]` — a literal index paired with the spec that
formats it, thirteen times, held together by nothing. Moving a column breaks that
pairing SILENTLY: the header row still prints correctly and a sector lands in the
column a reader's own `SUM()` is pointed at. The footer had the same defect twice
over, in `set(10, totMV)` / `set(12, totPnL)` and in a totals-row alignment reading
`col >= 7` — the boundary where money began in the OLD layout. So the order lives
in `cols` alone now and a row arrives as a record keyed by the same strings
(`writeRow`), with the footer's cells found by `colAt`. That is `lib/table.mjs`'s
own rule — **match on the HEADER, never on the column index** — applied to the
WRITING side, and it is why a future reorder is one edit rather than fourteen.

**THIS FILE HAD NO COVERAGE OF ANY KIND, AND IT IS THE ONE ARTEFACT WHOSE DEFECTS
ARE INVISIBLE.** `build`, `check:pages` and `check:family` never open the workbook
— it is a download — so a sheet with swapped columns passes every gate in the repo
and opens perfectly on the reader's machine.
`src/lib/__tests__/portfolioExcel.test.ts` builds it from `BOOK_POSITIONS` and
reads it back, anchored the way `privateMarket.test.ts` is: **the footer's Market
Value cell, LOCATED BY ITS HEADER, equals `BOOK_SUMMARY.totalValue` to the rupee**
— two independent paths to one figure, so it cannot go stale when the next drop
moves the book. Each column is then checked for what it can legitimately hold (a
money column is a number or an em dash; a descriptor column is a non-numeric
string and never either), which is what catches the values shifting while the
headers stay put. All three bug classes were verified by reintroducing them: the
old order fires the header assertion, a one-column value shift fires three checks,
and the footer back on its literal indices fires three more.

`buildPortfolioWorkbook` is the seam that made it testable — the workbook without
the `document` / `URL.createObjectURL` download around it.

**And the suite runner had to move its bundle.** `test-family.mjs` built into the
system temp dir, and `--packages=external` leaves a real dependency as a bare
import that Node resolves by walking UP from the bundle — so `exceljs` was
unreachable from `/tmp`. The bundle is written inside `node_modules` now, one
level below the packages it needs, and still outside the working tree.

### Stage 10o — EVERY FIGURE ON MORNING CIO OPENS THE HOLDINGS BEHIND IT

*"Every row of the allocation table on Morning CIO must open the holdings behind
it — AIF, PMS mandates, Mutual Fund, Direct Equity and ETF alike. The KPI tiles
and the Concentration figures are the same fix. Only the mandate and
family-entity drill-downs exist today."*

Morning CIO is a screen of totals — a NAV, a capital-invested sum, six allocation
rows, seven concentration figures — and two of those sets had an address
(`/mandate/:accountId`, `/family?entity=`). Everything else was a number a reader
could see and not open: ₹352.35 Cr of AIF across 19 holdings in 17 accounts, the
60 positions Capital invested leaves out, the 128 names two members both hold.

**ONE PAGE, NOT THIRTEEN, AND THE SET IS DEFINED ONCE.** A drill-down is not a
new measurement — every figure on that screen is `Σ f(x)` over a subset of the
same book, so what differs between them is the SUBSET and the words for it.
`src/lib/drilldown.ts` owns both, and **both sides call it**: Morning CIO calls
`drilldownHref` to build the link, `/holdings` calls `resolveDrilldown` to list
the rows. Thirteen pages would be thirteen chances for a drill-down to disagree
with the tile it opened from, which is this repo's most expensive recurring bug
— the allocation footer on a different basis from its own column, the AIF
section heading summing ₹3.17 Cr its own footer did not.

Its predicates are DELEGATED, never paraphrased: buckets from `holdingBucket`,
the listed/private split from `isPrivateClass`, the opening-value test from
`accountHasOpeningValue` — which was private in `returns.ts` and had a second
copy inside Morning CIO. It is exported now and both read it, because the tile
states a coverage and the drill-down lists the accounts behind that coverage,
and two copies of one regex are two chances for those to describe different
accounts.

| The figure | What opens | |
| --- | --- | ---: |
| Consolidated NAV · Positions · Distinct names | every holding | 369 rows · 214 names · ₹710.4 Cr |
| Capital invested · Consolidated return | the holdings reporting a cost | 309 rows · ₹471.9 Cr · +15.4% |
| …its coverage line | the holdings reporting none | 60 rows · ₹165.9 Cr |
| Money-weighted return | the accounts carrying an opening value | 179 rows · 7 accounts · ₹110.4 Cr |
| each allocation row | that bucket's holdings | AIF ₹352.3 Cr · PMS ₹138.7 Cr · MF ₹99.9 Cr · DE ₹94.9 Cr · ETF ₹24.6 Cr · Cash ₹0 |
| Listed / Private · Top-10 · Cross-held · Winners / losers | their own sets, each walked and reconciled against the card | ₹358.0 / ₹352.3 Cr · ₹430.9 Cr · 128 names · 174 / 115 |
| Dry powder · Distributions · Fund commitments | **`/private-market`** | not holdings — see below |

**THREE OF THOSE ROWS ARE NOW REACHED DIFFERENTLY — see Stage 10v.** The SETS are
unchanged and every figure above still holds; what moved is the route. The
cost-less holdings, the listed half and the private half were each an address of
their own, linked from a SECOND link inside a KPI tile; they are FACETS of the
tile's own drill-down now, selected by a toggle above the table, because a tile
offering three destinations made the reader choose between them before they knew
what any of them held. The old addresses still resolve.

**A REFUSED FIGURE STAYS REFUSED ONE CLICK DEEPER.** Three of the six allocation
rows print an em dash for Return, because their Invested column covers a minority
of their holdings — Mutual Fund reports a cost on 2 of 24, Direct Equity on 9 of
37, ETF on none. A drill-down opening from that dash and printing a percentage
would be the two screens contradicting each other on the reader's own click, and
the specific figure they went looking for would be the wrong one. The page runs
the SAME 0.5% coverage test the allocation row and the footer run, and names the
cause — and `check:pages` asserts it per row, against what that row printed.

**AND A COVERAGE CAPTION THAT PRINTS ONE FIGURE TWICE SAYS NOTHING.** The AIF
drill-down first read `covers ₹352.3 Cr of ₹352.3 Cr · 4 of 19 report none`:
the uncovered value is ₹98,742, both sides round to the same compact label, and
the sentence reads as full coverage while announcing that four holdings are
missing from it. It names the UNCOVERED value now — the small figure, the one
actually in question — which is the trap `MandateHoldings` already prints its
tie-out at full precision for.

**THE BASIS IS ON THE PAGE, BECAUSE IT IS NOT THE SAME FOR EVERY SET.** Ten of
these sets are CONSOLIDATED. The money-weighted coverage is PER-ACCOUNT and must
not dedupe — it closes each account against the value ITS OWN statement prints,
so collapsing a holding two accounts both report would put this page below the
coverage its own tile states. No account carrying a duplicate publishes an
opening portfolio value in this drop, so **the two agree today, which is exactly
the condition under which the mistake is invisible** — reintroducing it left the
sweep green. It is written down rather than tested for, and the page says which
basis it is on.

**COMMITMENT FIGURES DO NOT OPEN A HOLDINGS TABLE.** Undrawn capital is not a
holding and has no row in `BOOK_POSITIONS`, so Dry powder, Distributions and the
Capital deployment card point at `/private-market`, which carries those capital
accounts folio by folio. A holdings drill-down could only ever be empty there —
"a card that can NEVER be filled must not look like one that is waiting", with a
hyperlink on it. For the same reason a fund-of-funds allocation row (all six are
empty in this book) carries `fromPositions: false` and is deliberately NOT a
link.

**IT IS A WAY INTO THE MANDATE PAGE, NOT A REPLACEMENT FOR IT.** A set containing
mandate-held rows summarises every mandate above the table, each linking to
`/mandate/:accountId` — flattening 281 mandate-held shares into one
undifferentiated list would re-commit the grouping mistake Stage 10L exists to
fix. Every row is also individually linked to its mandate and its company page.

#### The drill-down has no view modes: a row is what you would click into

*"When I click on AIF or any Mutual Fund line item, it should simply show what
all AIFs/PMS/Mutual Funds I'm holding, invested amount in them and so on… and
when I further click on one particular AIF it should take me to the drill-down
page of that AIF that will show me what all stocks/companies that AIF/Mutual
Fund is holding. No need for statement/security toggle button, I do not
understand the purpose of it."*

The first two are the same fix and the third is what made it necessary. The page
opened on one row per STATEMENT LINE, so the AIF drill-down listed Sanshi Fund-I
Class E four times — once per family member — and answering "which funds do we
hold" meant grouping 19 rows into 14 by eye. The toggle was the escape hatch for
that, and **a MODE a reader has to understand before the table means anything is
a defect in the table, not a feature.**

So there is no mode. A row is the unit a reader would open: a MANDATE where the
set holds the whole of one, and otherwise the SECURITY — one fund, one scheme,
one company, however many statements report it.

| Drill-down | statement rows | rows now |
| --- | ---: | ---: |
| AIF | 19 | **14 funds** |
| Mutual Fund | 24 | **20 schemes** |
| PMS mandates | 281 | **10 mandates** |
| Direct Equity | 37 | 37 companies |
| ETF | 6 | 3 |
| the whole book | 369 | 84 |

**A MANDATE IS ONE ROW ONLY WHERE THE SET HOLDS ALL OF IT**, and that condition
is why this is safe everywhere rather than special-cased to the PMS bucket. A
bucket drill-down carries every row of the mandates in it, so the row ties to the
manager's own statement. A FILTERED set — the winners, the holdings reporting no
cost — carries only some of a mandate's rows, and a row under a manager's name
over a subset of what they hold is the *"caption asserts what a named
counterparty reports"* failure this file already records, with a total that ties
to no document. Measured: the winners set forms **zero** mandate rows. The
condition is struck against the BOOK, never against the filtered set — against
the set it would be trivially true — and the reader's search filter narrows what
is drawn without changing what a row means.

**AND THE ROW'S NOUN IS WHAT THE ROW IS.** "84 holdings" over a table where ten
rows are whole mandates of thirty-odd shares each is a caption not describing its
own figure. All mandates → `mandates`; all securities → `names`, which is the
count the tile above already prints; a mix → `rows`.

**THE SECOND ASK IS ANSWERED ASYMMETRICALLY, AND THAT IS THE HONEST ANSWER.**
Clicking a MANDATE opens `/mandate/:accountId`, which lists every share the
manager picked — the look-through the family wants, and the one this book has,
because a PMS reports every share and the family owns them. Clicking an AIF or a
mutual fund opens its holding page, which states that the companies inside are
the manager's and are **not reported to this book**: a fund unit is one purchase
of somebody else's portfolio, and no statement in this drop carries a scheme
disclosure that joins to any folio the family holds. Drawing a constituent table
there would be the fabrication this whole book exists to prevent. The two look
alike and are not, which is why the fund page says so in as many words rather
than rendering an empty table.

**The per-statement lines did not go away**; they moved from a global mode to a
per-row expander, which is where a reader asks for them. Morning CIO's Positions
count counts those lines, and the page's own caption still prints all three
figures (`369 holdings · 214 names · 34 accounts`) above a table of 84.

#### Verifying by reintroducing the bug found five defects IN THE CHECKS

Twenty-three bugs were reintroduced one at a time, each rebuilt and swept.
Eighteen fired immediately. **The five that did not are the point of doing it**,
and four of them were defects in the checks rather than in the pages:

- **ONE ALLOCATION ROW WAS NOT ENOUGH.** The sweep walked the row Morning CIO
  links first — its largest, AIF — and grouping the drill-down on `assetClass`
  instead of `holdingBucket` is a REAL defect that would empty the PMS mandates
  row entirely. It stayed green, because AIF is a bucket where the two groupings
  agree. **All six rows are walked now** (`holdings-row-1..6`), each compared
  against its own three cells, and a book with more buckets than slots fails the
  `cio` check by name rather than quietly leaving rows unwalked.
- **COUNTING ADDRESSES IS NOT PAIRING THEM.** "The page links to `/private-market`
  twice" passed while the Dry powder tile pointed at the holdings drill-down,
  because the Capital deployment card's own link kept the count up. Every
  drill-down invariant now pairs the LABEL a reader clicks with the DESTINATION,
  through a new `ctx.links` of `{href, text}` — the claim being asserted is
  about what the reader experiences, not about what the page happens to contain.
- **A REASON IN A `title` CANNOT BE READ FROM `innerText`.** `AbsentCell` puts
  its cause in a hover, so "every dashed cell names the custodian that reports no
  cost" was struck on text that never contains it. `ctx.titles` collects them.
  The fix is to read the reason, not to move it on screen where it would make a
  60-row table unreadable.
- **AND A CHIP THAT STOPPED RENDERING TOOK AN INVARIANT WITH IT.** "No
  private-class holding stands as a row in the listed half" looked for an `· AIF`
  chip among the rows — and the chip is only drawn where a set spans MORE THAN
  ONE bucket, which the all-AIF private half does not. Inverting the split left
  it green. It is a PARTITION check now, struck on counts both pages print: the
  two halves must hold every position between them and none twice, which is a
  claim neither page can make alone and which a widened or narrowed filter breaks
  in a way a value comparison alone can miss.

**AND ONE MORE THE SCREENSHOTS FOUND, WHICH NO CHECK WOULD HAVE.**
`Drilldown.defaultView` was declared, set on the two NAME-counting scopes and
**read by nothing** — this repo's most-repeated failure, a field carrying the
right answer into no caller. `useViewParam` defaults every page to its first
view, which is right where a route has one natural unit and wrong here, because
the unit belongs to the FIGURE: Positions counts statement rows, Top-10 and
Cross-held count names. Both now open on the by-security view, the param is
written explicitly on every toggle (so picking the other view cannot bounce the
reader back to the scope's default), and `check:pages` asserts it on the COLUMNS
each page draws — not on the word "security", which appears in these pages' own
prose and made the first draft fail a page that was landing correctly.

**TWO BUGS CANNOT BE CAUGHT ON THIS BOOK, and are written down rather than tested
for.** Deduping the per-account coverage set changes nothing, because no account
carrying a duplicate publishes an opening portfolio value. And keying `cross-held`
on the ACCOUNT rather than the OWNER gives the same 128, because no member holds
one name in two of their own accounts today — the moment one does, that count
would report a name as shared between entities when it is not. Both are recorded
beside the code they govern.

`ONLY=holdings-book npm run check:pages` walks a subset for exactly this loop.
main added the same flag independently and the two were reconciled rather than
one replacing the other: a name matching no route still yields an EMPTY walk (so
a typo reads as zero combinations rather than as a clean run), and a route that
resolves addresses for others — `cio` for every holdings drill-down, `monitor`
for the mandate one — is pulled in when a selected route needs it. A filter that
silently stops checking is worse than no filter, and a blanket keep would have
thrown away main's typo guard.


### Stage 10p — TODAY, THE INDICES, AND A NAV SERIES THAT HAD STOPPED BEING IMPOSSIBLE

*"we need to see which are today's movers, which are gainers … what are my
gainers, what are my losers. My stocks and ETFs are up, Sensex is down this
much, Nifty — I want to see this with Nifty 500. Build a dated portfolio NAV
series (or state the accounts that cannot supply one) and chart it against Nifty
500. Need to see live indices levels at all time: Nifty 50, Nifty 500, Nifty
Midcap 150, Nifty Smallcap 250 — put a persistent index strip on the dashboard
carrying the level and the day's move for all four."*

Four asks. Three of them needed a feed this repo had never called, and the fourth
turned out to need nothing at all — the data had been in the archive for four
deliveries behind a note saying it could not exist.

**THE FIFTH ABSENCE RECORDED AGAINST A PREMISE NOBODY RECHECKED.**
`build-book.mjs` carried `const navHistory = []` and a note reading *"the corpus
carries an opening and a closing portfolio value per account and nothing between
them. Two points are not a series."* That was TRUE of the nine-account corpus it
was written against, and FALSE from `august-2026-b` onwards — the drop that first
REISSUED a statement an account had already filed. Measured on the archive today:

| | accounts | value |
| --- | ---: | ---: |
| publish **two or more** dated valuations — a series | **13** | ₹141.6 Cr |
| publish exactly **one** — a level, never a change | 23 | ₹571.9 Cr |
| publish **none** — no statement values them at all | 13 | — |

FRED, the RBI, the release calendar and the ISIN tier were the first four. Each
cost the same thing: a reader told to stop looking for something already in hand.

#### The series, and the four rules that keep it from asserting a path

`navHistoryFrom` in `build-book.mjs` emits `BOOK_NAV_HISTORY`,
`BOOK_ACCOUNT_NAV_HISTORY` and `BOOK_NAV_COVERAGE`. Every rule below is a wrong
series avoided:

1. **THE COMPOSITION NEVER CHANGES INSIDE THE SERIES.** Only accounts with two or
   more dated valuations are in it, and it starts on the date the LAST of them
   first published — **2026-07-10**, when Goldstandard and Carnelian join the ten
   already reporting. Starting earlier draws a line climbing ₹27 Cr → ₹142 Cr
   because accounts ARRIVED, which a reader takes for performance.
2. **EACH POINT IS THE BOOK AS THE STATEMENTS STOOD**, so an account is held at
   its latest mark on or before the date — the headline NAV's own construction,
   evaluated at earlier dates. Every point states how many accounts are marked ON
   it and how many are carried.
3. **EACH `dedupeGroup` IS COUNTED ONCE, AT EVERY DATE**, and the tie-break is
   the LATER-DATED row rather than the alphabetically-first account. 360 ONE
   Special Opportunities sits under CRN37702 and CRN60117 and BOTH are in the
   covered set; sorting by accountId would have counted the group once (right) at
   60117's stale 30 June mark (wrong). The series' last point is ₹140.17 Cr
   against a per-account sum of ₹141.63 Cr, and the ₹1.4580 Cr gap is that
   holding — asserted in `navSeries.test.ts` as a relation, never as a literal.
4. **EXTERNAL CAPITAL IS NETTED OUT, ON THE ACCOUNT'S OWN CLOCK.**

**RULE 4 IS THE WHOLE CARD, AND WITHOUT IT THE CHART IS A FABRICATION.** Over this
window the covered set's NAV runs ₹128.25 Cr → ₹140.17 Cr, **+9.29%**, against a
Nifty 500 that moved **+1.33%**. Eight points of outperformance, and none of it is
performance: **₹11.24 Cr is a Fund Deposit into V.E.C 128005 on 28 and 29 July.**
Net of it the book earned **+0.54%** — below the index. `accountXirr.test.ts`
already gates that exact account for that exact reason (mid-window external
capital at 182% of opening value); this is the same failure arriving through a
chart instead of a rate.

**AND THE FLOW IS ATTRIBUTED WHERE THE MARK MOVES, NOT WHERE THE MONEY LANDED.**
V.E.C's deposit is dated 28–29 July and its next valuation is 13 August, so the
money and the revaluation fall in DIFFERENT consolidated intervals. Subtracting
a deposit from a NAV that has not yet been restated to include it produces a large
false loss followed by a large false gain. Each account's flows are therefore
attributed to the interval bounded by ITS OWN consecutive snapshots — the same
"each account closes on its own as-of" rule `pooledXirr` is built on.

**WHAT IT STILL CANNOT PROVE, STATED ON SCREEN RATHER THAN PAPERED OVER.** Ten of
the thirteen covered accounts publish no dated capital record. Where such an
account holds a SINGLE security whose unit count is identical at every snapshot,
the statement itself rules out a subscription (`units-unchanged`, which is how
both 360 ONE CRNs and the fund folios resolve). Where it does not — SVAN 8710067
and 8710090, Molecule and the HDFC folio — it is `unreported`, and **₹28.3 Cr of
the window's movement is named on the card as not proven to be performance**. A
subscription inside one of those would read here as a return.

**A CAPTION WRITTEN FOR AN ABSENCE OUTLIVED THE ABSENCE.** `/history` rendered the
series the moment it existed, under headings written for the one it EXPECTED:
"Year-end listed-book snapshots, as reported by the ingested performance-history
statements", with each row chipped `Archived`. All four claims are false of what
arrived — statement dates inside five weeks, every asset class the covered
accounts hold, taken from each account's authoritative HOLDINGS issue, and nothing
superseded. It reads `As of · Covered NAV · Change · Capital in · Marked on this
date` now, and **the capital column is what stops the 13 August row's +8.51% from
reading as a good month.** An absence's WORDING surviving its data is the same
defect as the absence itself.

#### The four live indices, and THREE traps that print plausible wrong numbers

`functions/api/indices.js` serves Nifty 50, Nifty 500, Nifty Midcap 150 and Nifty
Smallcap 250 from Yahoo's chart endpoint; `IndexStrip` renders them between the
top bar and `<main>`, on every route, polled every 60s. It is a PROXY rather than
a harvest entry by the same rule `/api/prices` follows: `public/series/` carries
`nifty-50` and `sensex` as settled daily closes — right for a ten-year chart, and
unable to answer "where is the Nifty right now", which is the whole request. Two
of the four are not in that store at all.

**1. `chartPreviousClose` IS NOT THE PREVIOUS CLOSE.** It is the close preceding
the requested RANGE. Measured on `^NSEI` on 2026-09-02 with `range=5d` it returns
24,090.85 — the 27 August close — while the previous SESSION closed 24,055.80 on
1 September. Read as the previous close the day's move is −1.15% against a true
−1.01%. The previous close is taken from the last SETTLED bar instead, which is
the rule `/api/prices` already applies when it drops today's in-progress bar.

**2. A SYMBOL THAT LOOKS RIGHT IS NOT THE INDEX.** Probed the same day:

```
NIFTYMIDCAP150.NS   → "NIFTY MIDCAP 150"   22,949.95   ← the index
NIFTY_MIDCAP_150.NS → an unnamed instrument 7,757.15   ← not the index
NIFTYSMLCAP250.NS   → "NIFTY SMLCAP 250"   18,166.10   ← the index
NIFTY_SMLCAP_250.NS → an unnamed instrument 5,861.60   ← not the index
^NSMIDCP            → "NIFTY NEXT 50"                  ← the NAME lies
^CNX500             → delisted;  ^CRSLDX → "NIFTY 500" ← the one that works
```

Every wrong one answers **200 with a well-formed rupee figure**. So each index
declares the name its upstream must report, the response is checked against
`meta.longName`/`shortName`, and a mismatch returns the index UNVERIFIED with no
level. Same rule as `lib/table.mjs`: match on the label the source prints, never
on the shape of the key. All three decoys are refused by the running code.

**AN INDEX LEVEL IS NOT MONEY AND DOES NOT CONVERT.** `fmtFromBase` is
deliberately not used on the strip or the NAV chart's axis: running 23,090.75
through the display-currency converter divides the Nifty 500 by the USD rate and
prints a level of nothing.

**3. THE TWO ENDS OF THE MOVE WERE PICKED BY TWO DIFFERENT CLOCKS, AND FOR HOURS
AT A TIME THEY WERE THE SAME SESSION.** The family sent a screenshot of the strip
reading **+0.00% on all four indices at once**, with moves of 0.05 / 0.00 / −0.05
/ +0.05 on levels near 23,000, and asked whether that could be right. It is not a
market that stood still — measured against Yahoo's own bars, all four reproduce
**to four decimals** as the level minus ITS OWN SESSION'S CLOSE:

```
Nifty 50            23,779.20 − 23,779.150390625  = +0.0496   (7 Sep − 7 Sep)
Nifty 500           23,156.20 − 23,156.199218750  = +0.0008
Nifty Midcap 150    23,062.20 − 23,062.250000000  = −0.0500
Nifty Smallcap 250  18,484.20 − 18,484.150390625  = +0.0496
```

Trap 1 established that the previous close is the last SETTLED bar. **It never
said which clock decides "settled"**, and the answer was `new Date()` — the
SERVER's UTC date — while `regularMarketPrice` follows the EXCHANGE's session.
IST is UTC+5:30, so from **05:30 IST** (00:00 UTC) until the session's first tick
at 09:15 the UTC date has already rolled over while the level is still the
previous session's close: the bar the filter exists to exclude becomes the
"previous" close, and the level is differenced against itself. **The same holds
through every weekend and every market holiday**, when the level does not move
for days — so this printed a fabricated zero for a large fraction of the week.

The residual ±0.05 is the tell, and it is why the figure looked like data: Yahoo
rounds `regularMarketPrice` to 2dp and its bar closes are float32
(`23,779.150390625`), so a session differenced against itself lands a few paise
off zero rather than exactly on it. **A clean 0.00 would have been easier to
doubt.**

**THE FUNCTION NO LONGER READS THE SERVER'S CLOCK AT ALL.** The level's session
is `meta.regularMarketTime`, each bar's is its own stamp, both are localised with
the `meta.gmtoffset` the response declares (19800 for IST), and the previous
close is the last bar **strictly before** the level's session. One clock, taken
from the document — `lib/table.mjs`'s own rule arriving through a date rather
than a column. Where the upstream omits the offset both ends fall back to UTC
*together*: **the defect was never the zone, it was using two clocks for the two
halves of one subtraction.**

Two consequences worth stating, because both are the honest answer rather than a
workaround. Pre-open, when `regularMarketPrice` is still yesterday's close, the
strip now reports **yesterday's** move — the last completed session, which is
what a level dated yesterday can truthfully be compared against. And a level
whose session cannot be read carries **no change at all**: without it there is
nothing to exclude and the last bar might be the level's own, which is the defect
itself, so it refuses rather than guessing. `sessionDate` rides in the response
and the strip's hover names BOTH ends — a reader could not see this defect
because only one of the two dates was ever printed.

**A LIVE PROBE CANNOT CHECK THIS, WHICH IS WHY IT IS A TEST.** Outside that
window the function is correct, so a probe run at the wrong hour reports a clean
feed — the defect had been shipping since Stage 10p and every sweep passed.
`src/lib/__tests__/indicesFunction.test.ts` stubs the upstream **from the real
measured bars** (7 and 8 September 2026) and supplies the clock, so the failing
window is reproducible on demand rather than once a day. Twelve checks: the
pre-open case, the mid-session case, a 24-hour sweep of the invariant, a null
holiday bar, the refusal, the offset in both directions, **that a genuinely
unchanged close still reports 0.00% from two different sessions** — the fix is
about WHICH sessions are compared and must not suppress a measured zero — and
that trap 2's identity check still outranks every figure.

Three bugs were reintroduced and each fired its own checks; **putting the
original filter back reproduces the client's screenshot at `Δ 0.0496`**, which is
what says the diagnosis is the defect rather than a theory about it. The
24-hour sweep is a guard on the invariant and did NOT catch the original — the
pre-open case is what does, and that is recorded rather than papered over.

#### Today's movers — and the denominator that is the whole point

*(The SET was narrowed to Direct Equity a request later — see Stage 10t. The
denominator rule below is unchanged and is why that narrowing had to move every
caption on the card with it.)*

**THE DAY'S MOVE IS STRUCK ON THE PRICED SUBSET, AND THE TILE SAYS SO.** A day
change needs a live price AND the previous close behind it; the AIF folios, the
mutual-fund units, the cash sweeps and every unresolved name have neither. The
feed prices about ₹200 Cr of a ₹710 Cr book, so dividing the same rupee move by
the whole NAV gives roughly a quarter of the true percentage — a real figure on
the wrong denominator, and the one a reader sets against the Nifty. A position
with no `dayChange` never enters a sum or a ranking either: an unpriced holding
must not appear in "today's losers" at ₹0.

A name held in several accounts is ONE mover — its rupee impact adds and its
percentage is re-derived from the combined previous close, never averaged across
positions of different sizes. The list ranks by ₹ impact or by % move, both
offered, because a 9% move on a ₹40 L holding is the larger mover by one and the
smaller by the other. **An empty list shows an em dash, not a summed ₹0**: "0
losers · ₹0" is a formatter reaching an empty collection, which §2 forbids on a
pill exactly as it forbids it on a tile.

**AND THE ROADMAP NO LONGER PROMISES WHAT SHIPPED.** "Market overview — Nifty /
Sensex / global" and "NAV vs benchmark (dynamic)" were chips on Morning CIO's
"coming as live data lands" list. A chip for a feature already on the reader's
screen is the same defect as an absence recorded against a premise that changed.

#### Eleven bugs reintroduced, and three of them were bugs in the CHECKS

`check:pages` gained a route — **`cio-live`**, the same page with `/api/quotes`,
`/api/indices` and `/api/prices` fulfilled from fixtures BUILT OUT OF THE BOOK
(`installLiveMocks`). `vite preview` runs no Function, so on the plain `cio` walk
every live figure renders its absent state — worth asserting on its own, and it
left the day's-move arithmetic checked by nothing. Each symbol is priced at its
own statement mark × 1.10 with every index at ×0.99, so the answers are closed
forms: **+10.00% for the book, −1.00% per index, 11.00 points of gap.** A tile
that diluted across the whole book, averaged percentages, or counted an unpriced
holding as flat lands somewhere else.

Every invariant was verified by reintroducing its bug. Three of the eleven
exposed a defect in the CHECK rather than the page, which is the point of doing
it:

- **`(\d+) of (\d+) accounts` IS NOT UNIQUE ON MORNING CIO.** The partition check
  matched page-wide and picked up the Money-weighted return tile's own coverage
  line ("7 of 49 accounts") four cards higher, failing a page that was correct.
  Two figures of the same SHAPE describing different sets is what a page-wide
  regex cannot tell apart; it is scoped to the card now.
- **`label-xs` IS `uppercase`, AND `innerText` RETURNS THE TRANSFORMED TEXT.**
  Restoring the old "Listed NAV" heading left a check reading `/Listed NAV/`
  green against a page rendering `LISTED NAV`.
- **A PAGE-WIDE MATCH FOR A COLUMN NAME IS SATISFIED BY PROSE ABOUT THE COLUMN.**
  Renaming the capital column to "Flows" left `/Capital in/` green, because the
  footnote under the table contains the phrase. Column claims are struck on the
  header row, which `innerText` joins with tabs.
- **A COLLAPSED `<details>` IS NOT IN `innerText`**, and the 36 excluded accounts
  live inside one. The sweep opens them on these routes — the same class of
  failure as a reason living in a `title`, and the same fix: read it.

`src/lib/__tests__/navSeries.test.ts` carries the arithmetic, anchored the way
`privateMarket.test.ts` is: the series' last point against the covered accounts'
own roll-up, two independent paths inside `navHistoryFrom` to one figure. Its
load-bearing gate is an INEQUALITY — the unadjusted NAV move must exceed the
adjusted return by more than 5 points — so a suite cannot pass by accident on a
drop where no capital moved, and it fails loudly if the series ever empties.

### Stage 10r — density, and the guard on an annualised return

Three asks on the Portfolio Monitor. Two shipped; the third is declared absent
against a MEASUREMENT rather than a premise, which is the whole of why this
section exists.

**THE PAGE SPENT ITS FIRST SCREEN ON CHROME.** *"I cannot even see 2 companies
completely, which is very inefficient presentation."* Measured, that was true:
the filters, the view toggle and the two export buttons each had a row of their
own, and the security column was narrow enough that `Fractal Analytics Limited`
wrapped onto THREE lines, so a row stood ~70px tall. One wrapping chrome row at
`text-xs`, `py-1.5` cells and a `min-w-[15rem]` name column put **15 holdings on
screen at 1500x950 where 2 fitted before**.

**AND DENSITY IS ASSERTED ON GEOMETRY, because no amount of matching innerText
can see it.** A page can print every row correctly and still bury them: the
complaint was about where things sit, not what they say. `check:pages` now
measures `rowsInView` and `firstRowTop` IN THE PAGE and hands them to the
invariants — at least ten rows fully visible, and the first row inside the top
third of the viewport. The second is what stops the first being satisfied by a
taller window instead of tighter chrome. Both were verified by putting the old
type scale and padding back.

**THE RETURN TOGGLE, AND WHY THE GUARD IS THE FEATURE.** *"More than one year
it'll be CAGR, less than one year I'd rather see absolute… never an annualised
extrapolation."* `holdingReturn` in `analytics.ts` is the one place that
decides, and the page only draws:

- a measured window of **≥ 365 days** → annualised, the window named in the cell;
- **under a year** → the ABSOLUTE figure, marked `abs`, because a rate for a
  year the holding has not seen is a claim about a year;
- **no reported purchase date** → `AbsentCell`. Not "weaker", not silently
  absolute: a rate over an unknown window is not a figure at all.

**`positionIrrPct` LOOKS LIKE THE SOURCE FOR THIS AND IS A TRAP.** The PMS
statements publish a per-position IRR — 75 of 371 positions carry one — and it
is ALREADY the extrapolation being banned: it reaches **+47,695%** on this book,
and reads 193.9% for a holding whose return on cost is 56.5%. That is a provider
annualising a few months, the same arithmetic that put +99.0% on the Morning CIO
strip in Stage 10g(ii). `holdingReturn` never reads it.

The window can only come from `Position.heldSince`, which `build-book` emits
under the SAME gate as the ST/LT split — the lots must account for the units held
exactly, or Pricol's departed units would date a holding they are no longer in.
On this drop that is **3 of 371 positions**: Crompton at 527 days annualises
(−27.78% on cost → **−20.18% p.a.**), Transrail at 337 and Bectors at 274 hit the
guard. The column's own caption COUNTS all three states rather than claiming
coverage, and `check:pages` reconciles those counts against the row total.

### AND YTD / CALENDAR-YEAR ON A HOLDING IS NOT MEASURABLE HERE

*"Add YTD and calendar-year columns for the holding itself, not just the
security's market return."* The distinction is exactly right — a holding's own
return over a window is a different question from what the share did — and this
book cannot answer it. Measured over `public/audit/`, not assumed:

| | |
| --- | --- |
| Earliest holdings statement of any account | **2026-03-31** |
| Transaction tape | **2026-04-01 → 2026-08-13** |
| Valuations dated on or before 2026-01-01 | **none** |
| Trades dated before 2026-01-01 | **0 of 839** |

A holding's YTD return needs its value at 1 January and every flow since. This
corpus begins in April, so both halves are missing for every position, and a
calendar-YEAR return (2025, 2024) is further out of reach still — the whole
archive is four and a half months long.

**THE COLUMN IS BUILT AND IT SHOWS A DASH** — *"if it is not possible to show
data then just show a dash."* It was first left out on the grounds that a
permanently-dashed column reads as a broken feed; the family asked for it
anyway, and they are right that a column naming its own absence is worth more
than a gap nobody can see. It renders `AbsentCell` on every row it cannot
measure, and the caption underneath COUNTS what it covers rather than leaving a
wall of dashes to be interpreted.

**ONE CASE IS GENUINELY MEASURABLE, which is why `holdingYtd` is a function and
not a constant dash.** A holding OPENED DURING THE YEAR did not exist on 1
January, so it has no opening value to be missing: its year-to-date return
simply IS its return since purchase. That needs `heldSince` and therefore the
same lot-coverage gate as everything else here. On this drop it fires for **no
position** — all three dated holdings were opened in 2025 — and it will fire on
its own the first time a drop brings a within-year purchase through the gate,
moving the caption with it.

**The SECURITY's market YTD is available today from `/api/prices` and is
deliberately not substituted.** It is the cheap way to fill this column and it
answers a different question: a position bought in March did not earn the
market's January-to-March move. Standing one in for the other is the substitution
this book refuses everywhere else.

**AND THE CHECK ON IT IS ANCHORED OFF THE BOOK, because the obvious version
could not fail.** The column and its caption are both computed by `holdingYtd`,
so reconciling one against the other passes even when both fabricate — this
file's own "a check that compares a figure with its own copy cannot fail",
arriving through a caption instead of a footer. `YTD_MEASURABLE` in
`check-pages.mjs` counts the qualifying rows out of `glowData.ts` directly, and
the invariant requires the RENDERED figures, the caption's claim and that count
to agree. Verified by fabricating a YTD on the holdings already held on 1
January: the caption-only version passed, the book-anchored one fails.

**What would fill it properly is one document**: a holdings statement dated on
or before 1 January, per account. The moment one lands, the value at the year's
start is measurable for every position in that account and the column becomes
ordinary work.

**CALENDAR-YEAR COLUMNS (2025, 2024) ARE NOT BUILT**, and unlike YTD they have
no fill path at all on this corpus: the whole archive is four and a half months
long, so no drop of the CURRENT statements can ever supply a 2024 opening value.
YTD earns its dash because it becomes real on the next within-year purchase;
a 2024 column would be a dash forever.

*(THE ABSOLUTE/CAGR TOGGLE AND THE SEPARATE YTD COLUMN ARE GONE — Stage 10af
folds every return into ONE column behind a measure picker. Everything above is
unchanged in substance: `holdingReturn`'s guard, `positionIrrPct` staying
banned, YTD measurable only on a within-year purchase, calendar-year absent.
What moved is only where the reader chooses the measure and how it is labelled.)*

### Stage 10af — WHICH RETURN, AND SAY WHICH: ONE COLUMN, A MEASURE PICKER

*"When you say return… is it my year-to-date return? my holding-period return?
my calendar-year return? I can give you ten different returns for one scheme."*
And: *"implement the return methodology — equity under a year absolute, a year or
more CAGR; fixed income XIRR; an XIRR when there are multiple tranches. Replace
the absolute/CAGR toggle with a dropdown multiselector of all the return types.
The holdings table gets ONE return column, remove YTD etc. from the table, and
that column shows the type we select."*

**THE METHODOLOGY IS ONE FUNCTION, `measuredReturn` IN `analytics.ts`**, so two
surfaces cannot disagree about what "the return" is — the same reason
`holdingBucket` and `costCoversSet` are single functions. It delegates the
annualisation to `holdingReturn`, so the guard that keeps a 132-day window from
compounding onto a year (Stage 10g(ii)) lives in exactly one place still, and
`positionIrrPct` stays unread. `RETURN_MEASURES` is the picker's catalogue —
`auto`, `absolute`, `cagr`, `xirr`, `ytd`, `calendar` — each with the tag the
cell prints so a reader always knows WHICH return it is.

**`auto` IS THE FAMILY'S RULE, TAGGED PER ROW.** Equity held a year or more is
CAGR, everything else is the total return on cost (tagged ABS), and fixed income
(`isFixedIncome`, `Bond`) would be XIRR — which this book cannot strike per
holding, so the return on cost stands with a note naming the ideal measure. On
this drop `auto` annualises exactly the rows the CAGR measure does (Crompton) and
shows ABS for the rest, absent only where there is no cost — verified against the
generated book, not asserted.

**EVERY MEASURE THIS BOOK CANNOT STRIKE RENDERS A DASH WITH THE REASON, never a
plausible number.** Per-holding XIRR needs a cash-flow history the statements do
not carry per security (`positionIrrPct` is the banned extrapolation), so it is
absent on every row and points to Performance for the per-account figure. YTD is
measurable only on a within-year purchase (§ Stage 10r), calendar-year not at all
on a four-month archive. This is the family's own *"if it is not possible to show
data then just show a dash"* applied to five measures at once.

**THE PICKER REPLACES THE TOGGLE, AND THE SELECTION LIVES IN `?ret=`** like every
other view on this page, so the CAGR view is a shareable link and `check:pages`
reaches each measure by URL rather than a click. `auto` is the param-free default
and is mutually exclusive with the concrete measures (picking one means "show me
that", not "that plus the rule"); the concrete ones MULTI-SELECT, so Absolute and
CAGR can sit side by side — the *"always have a CAGR column"* ask, answered
without a second column. The one Return column shows the ticked measure(s), each
on its own labelled line.

**THE SEPARATE YTD COLUMN IS GONE — 14 COLUMNS TO 13.** YTD is a measure now, not
a column; the footer's and each category-total's YTD cell went with it. The
category and footer returns DO NOT follow the picker and stay cumulative on cost
(`costCoversSet`): a bucket has no single purchase date to annualise over, so
annualising it would be the very extrapolation the guard forbids.

**RENDERED INLINE, NEVER STACKED**, and that is load-bearing rather than
cosmetic: the sweep reads whole rows by splitting the page text on newlines, and
a flex-column cell puts a newline INSIDE it that shatters the row for every
row-based check. A block-stacked first draft did exactly that and failed the
"sector is second from the end" invariant — so measures sit inline (visual
wrapping adds no newline) and each is `whitespace-nowrap` so a tag never splits
from its figure.

**CHECKED ON THE PICKER'S OWN ATTRIBUTES AND THE CELLS IT DRAWS**, not on option
prose the picker only shows when open. `data-return-measures` is every measure it
offers and `data-return-active` what is ticked; each Return cell carries
`data-return-cell`. Five routes assert it — `monitor` (the picker offers all
measures, defaults to auto, no YTD column, every cell labelled), `monitor-cagr`
(the guard: no triple-digit rate, the coverage note partitions, a sub-year row
tagged ABS), `monitor-ytd` (drawn ties to `YTD_MEASURABLE` off `glowData.ts`),
`monitor-xirr` (every cell a dash tagged XIRR, never an invented rate) and
`monitor-returns-multi` (both picked measures in one column, each labelled). The
methodology arithmetic is in `holdingReturn.test.ts` (`npm run test:family`),
anchored on the generated book so it cannot go stale when the next drop moves it.

### Stage 10ah — A FOURTH AXIS THAT IS NOT AN ALLOCATION AXIS: ONE ROW PER SECURITY

*"Remove sectors selector drop down."* And: *"Portfolio monitor is right now
based on category wise, asset class wise, and then the basket… Not stock wise. So
just incorporate this into THIS PAGE ONLY. Then you give a simple view where
whatever stock, like HDFC Bank, if Yamini wants to click on, she can click on and
then drill down. So based on every single investment direct/PMS/ETF/AIF etc etc.
we will club and show which stock has the highest exposure and thru what means in
the drill down page."*

**THE GAP WAS REAL AND IT WAS THE MANDATE ROLL-UP.** Stage 10L lifted the PMS
mandates out of the table into ONE ROW EACH — the right answer to "stop mixing
what I bought with what a manager bought", and the reason a reader cannot see a
name's total exposure at all: **₹138.7 Cr of this book's shares are inside ten
mandate rows**, and 140 names live ONLY there. On every existing axis Carnelian's
Jammu Kashmir Bank is not a row; it is a line inside a mandate's expansion.

**SO THE SECURITY AXIS CHANGES THE ROW BUILD, NOT A SECTION KEY.** It is the only
one that does, and that is why it is not a `GroupAxis`. Mandates are NOT lifted
out, and every position is clubbed on `securityKey` alone. Measured:

| | category axis | security axis |
| --- | ---: | ---: |
| rows | 85 | **214** |
| names visible only through a mandate | 0 | **140** |
| clubbed across more than one account | — | **130** |
| footer | ₹710.4 Cr | ₹710.4 Cr |

The footer does not move by a rupee, because it is struck over the POSITIONS and
regrouping cannot touch it — the same construction all three older axes rely on.

**IT IS THE MONITOR'S ALONE, BECAUSE THE FAMILY SCOPED IT IN THE SAME SENTENCE.**
`GroupAxis`, `GROUP_AXES` and `GROUP_VIEWS` are UNTOUCHED and Morning CIO still
offers three. Widening them would have put this axis on that page's allocation
card **by construction** — `AXIS_SCOPE` in `drilldown.ts` and `DECLARED` /
`ALLOC_TITLE` on Morning CIO are all `Record<GroupAxis, …>`, so a fourth key
would have forced four entries into each. `MonitorAxis` is a SUPERSET used by one
screen; the shared helpers take it, so every existing caller keeps passing a
`GroupAxis` unchanged and there is still one definition of "which section is
this holding in". An allocation table on this axis would draw 214
single-holding sections and mean nothing.

**AND IT FILES NOTHING, SO IT DRAWS NOTHING.** `groupKeyFor` returns one constant
(`SECURITY_SECTION`) for every row, so the table — which needs two keys to draw
headings — draws none, and the section filter is hidden rather than offered as a
control with a single option that changes nothing.

#### Two of the four vehicles can be clubbed and two cannot

*(**THE SECOND HALF OF THIS WAS OVERTURNED BY THE FAMILY — see Stage 10aj.** A
fund is no longer a row: what it discloses is looked through and added, and the
₹353.53 Cr that discloses nothing is stated as a bucket instead. The FIRST half
stands unchanged and is why the axis exists at all. The passage is kept because
the boundary it draws — what this book REPORTS versus what it can only DERIVE —
is the same boundary Stage 10aj had to state on screen; what changed is that the
derived side is now shown rather than withheld.)*

The request named "direct/PMS/ETF/AIF". **A SHARE IS CLUBBED HOWEVER IT WAS
ARRIVED AT** — the family's own demat and a discretionary manager's mandate both
REPORT THE SHARE, so both are positions carrying the same `securityKey`.

**A SHARE HELD INSIDE A FUND IS NOT REPORTED AT ALL.** An AIF folio, a
mutual-fund scheme and an ETF are each ONE PURCHASE of a manager's portfolio, and
no statement in this book reports the companies inside the folios the family
holds. `/mandate/:accountId` still refuses to draw a constituent table for a fund
folio for exactly that reason. What Stage 10aj adds is the one source that CAN
speak to it — `public/lookthrough/`, the AMCs' own monthly disclosures for 21 of
the 22 schemes here — carried as a DERIVED figure in its own column, never summed
into NAV, because the fund's value already stands for it there and counting both
would count the same money twice.

#### The drill-down, and where "thru what means" actually lives

`/stock/:securityKey` already carries a **Held via** column and a Position-by-account
card, and every security row already links there through `StockLink` — so the
drill-down PAGE needed nothing. What was missing is the answer in place, so a row
held through more than one account expands to a **venue table**: held via, the
vehicle, the owning entity, quantity, value, its share of the holding, P&L and
return, with each mandate linking to its own page.

**`venuesOf` IS NOT `entityParts`, AND THE DIFFERENCE IS THE POINT.** That helper
answers which family MEMBER holds a name and lumps every route into a Set, so a
name held through three mandates by one member collapses to one line reading
"manager's mandate". "Through what means" is a fact about the ACCOUNT — its
engagement names the route, its strategy or provider names the vehicle — so the
account is the unit. **The venues are NOT deduped**: the row's value counts each
`dedupeGroup` once and the breakdown lists every statement as printed
(§"consolidated counts once, per-account does not"), so `share` divides by the
PRINTED sum and the expansion names the gap when the two differ.

**AND THE ROW LITERAL NOW CARRIES TWO DIFFERENT SETS ON PURPOSE.** Stage 10ag's
tranche breakdown landed on the same row build, and it takes `trancheSet: dps` —
the DEDUPED set, because it opens the row's own Invested figure and every other
figure on the row is struck on that set. `venues` takes the RAW `ps` one line
below it, for the reason above. Neither is a slip and neither may be "made
consistent" with the other: they answer different questions, and one of them is a
per-account breakdown. A future session reading those two lines side by side
should read this paragraph before unifying them.

#### "…and another Y crores through these five funds" — the inverse look-through

*"If today I want to know that my public market portfolio is a thousand crores,
how much HDFC Bank do I hold in my 1,000 crores? … Then you tell me it is so much
AUM and this much percentage of the portfolio. Then I drill down, then you tell me
direct you hold X Cr through direct equity, and then you hold another Y crores
through these five funds."*

**THE SENTENCE HAS TWO HALVES AND THEY ARE DIFFERENT KINDS OF FIGURE.** The first
is the book's own: a direct holding and a PMS mandate both REPORT THE SHARE, so
the clubbed row and its route-split line answer it out of `BOOK_POSITIONS`. The
second is not reported about this family at all — the AMC disclosed what the FUND
holds, and the family's share is DERIVED from the units they own.

`loadFundExposure` in `lookthrough.ts` answers the inverse of what that file
already did: `loadLookthrough` asks *what does this fund hold*, this asks *which
of my funds hold this name*. Measured on this book: **ICICI Bank ₹2.08 Cr across
8 of the 21 readable schemes, SBI ₹1.25 Cr across 10** — on top of whatever is
held directly, and 17 of the 43 ISIN-bearing equities carry some.

**THE JOIN IS EXACT OR IT DOES NOT HAPPEN.** ISIN first, then this book's own
`securityKeyOf` over the disclosed name. **There is deliberately no fuzzy tier** —
the same refusal `shared/nameMatch.mjs` records, where a token-overlap rule
matched `KIRANAKART TECHNOLOGIES` to `TATA TECHNOLOGIES`. Inventing an exposure to
a company the family does not hold is worse than reporting none. In practice ISIN
carries almost all of it: the depository prints `SBI - EQ` where an AMC files
`State Bank of India`, and no name tier bridges that.

**IT IS FENCED FOUR WAYS AND EVERY ONE IS ON SCREEN**, because a derived figure
beside a measured one is exactly where this book has been bitten:

- it is **never added** to the row, the footer or any book total — the fund's own
  value already stands for it in NAV, so summing both counts the same money
  twice. `check:pages` asserts the row still prints the BOOK's figure, verified by
  reintroducing the double count;
- it says **DERIVED, not a position**, in words rather than in a tooltip;
- it is **partial**, and says so with counts: N of M fund holdings read, the
  schemes it could not read named, and **the AIF folios named as publishing
  nothing this book can join at all**. *(It read the EQUITY SECTION alone until
  Stage 10aq; it now reads each AMC's whole monthly filing — shares, bonds, NCDs
  and commercial paper — and a row is one ISSUER across every instrument of it.)*;
- the disclosure's **own as-of date** rides on every row, because a monthly
  filing and a statement mark are dated differently.

**AND ITS THREE STATES ARE DISTINCT.** Still loading says so; a store that did not
answer is a fact about the FETCH and is worded as one; only a store that answered
with nothing says the funds do not hold this name. Collapsing those is the failure
Stage 10r records on Today's movers, arriving through a fetch instead of a feed.

**IT LOADS ONLY WHEN A ROW IS OPENED**, and the scheme files are memoised, so a
table of 214 rows fetches nothing until a reader asks about one name.

#### The sector dropdown is gone and the sector filter is not

The same treatment the Holdings basis switch got in Stage 10q. Pinning the value
to `"All"` would have left every branch that reads it unreachable — the weight
denominator's scope caption, the base filter, and the sector handed to the
Transactions tape — which is the dead-code-that-looks-alive failure this file
keeps naming. It lives at **`?sector=`** like every other view on this page, and
`monitor-sector` WALKS it, because a param nothing exercises is indistinguishable
from a deleted feature. Sector remains a COLUMN on every row, and Sector
Composition is still the page that analyses the book by sector.

#### The checks are struck on the DOM, because this axis's row TEXT cannot be split

**130 OF THE 214 ROWS CONTAIN A NEWLINE INSIDE A CELL.** The "N entities" pill is
an `inline-flex`, so its chevron is a flex ITEM and `innerText` breaks the line
there. That is pre-existing — the category axis has 12 such rows and 10 mandate
rows besides — and harmless until an axis makes it the majority. So the rows
carry `data-security-key` and `data-venues`, the sweep captures every cell as an
array read by `COL`, and no invariant here splits a row on newlines. It is named
rather than fixed: making the pill `inline-block` is a visual change to every
table in the app and is not what was asked for.

**SIX BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: the mandates rolled up
again (fires three, from three directions — the row count, the mandate-only
names, and the venue counts), the sector dropdown restored, the honesty caption
deleted, the section filter shown anyway, the ranking reversed, and the
`?sector=` param ignored. Every expectation is derived from `glowData.ts` on each
run — the row count, the clubbed count, the largest name and the book's own NAV —
so none of it goes stale when the next drop moves the book.

### Stage 10aj — A SECURITY IS A COMPANY: THE CUMULATIVE STOCK POSITION

*"In the security selected page we should only see the aggregate stock position
across the portfolio thru various channels — direct equity / AIFs / PMS / ETFs.
AIF itself shouldn't show up as a security. We need to calculate cumulative
stocks position held in the whole portfolio together."*

Stage 10ah built the axis and drew a fund as a row. **The family say that is
wrong, and they are right**: a fund is not a security, it is one purchase of
somebody else's portfolio, and a screenshot of that table answered "which stock
do I hold most of" with `Sanshi Fund-I ₹175.1 Cr`.

**AND THEY HAD ALREADY BEEN SHOWN THE ALTERNATIVE AND CHOSE IT.** The PR before
this one delivered the measured and derived halves SIDE BY SIDE and named the
combination as their call; they repeated the sentence. So the two are added, in
a column of their own, and every surface that prints the sum says which half is
which.

#### The five buckets, because this table no longer covers the book

A fund leaving the table takes its money with it, and the honest problem is that
**half this book has no look-through and never will.** So every rupee of NAV is
placed in exactly one bucket and all five are printed under the table:

| | | |
| --- | ---: | --- |
| stocks the statements REPORT (direct + PMS) | ₹222.00 Cr | 31.3% |
| stocks DERIVED from what the funds disclose | ₹77.61 Cr | 10.9% |
| inside vehicles that publish NOTHING | ₹353.53 Cr | 49.8% |
| inside a disclosed fund and not equity | ₹45.68 Cr | 6.4% |
| the book's own cash | ₹11.58 Cr | 1.6% |

They sum to `BOOK_SUMMARY.totalValue` **to the rupee**, and both the suite and
the sweep hold them to it — the parts reconstructing the whole is the claim a
reader acts on, and no single figure can make it alone. **The table covers
₹299.61 Cr of ₹710.39 Cr**, 42.2%, and says so in the first sentence.

**₹353.53 Cr IS ALMOST ENTIRELY THE AIF BLOCK, AND THAT IS A FACT ABOUT THE
INSTRUMENT.** A mutual fund and an ETF file a monthly SEBI portfolio disclosure
— the store carries one for 21 of the 22 this book holds. **An AIF files nothing
that joins to a folio the family holds**, so no drop of the current statements
can ever fill it. Told the generic "no disclosure here" a reader goes looking for
a store fix that cannot exist, so `skipReason` in `lookthrough.ts` words the two
apart — `upstreamStatus.ts`'s rule arriving through a fund.

#### Three columns, because a measured rupee and a derived one are different claims

`Direct + PMS` is the MEASURED value and is what `Market value` means on every
other axis. `Via funds` is DERIVED. `Total exposure` is the two, and is what the
rows are ranked on. They are separate fields on the row rather than one blended
`marketValue` **because every other money column can only ever be struck on the
measured half** — Invested, Unrealised P&L, Realised and Return all come from
statements. Blending would put a return over a cost covering one half of its own
numerator, which is "a total must tie to its own columns" one column wider.

**THE FOOTER NARROWS WITH THE ROWS.** `footerSet` is the company shares alone on
this axis, so Invested, P&L and Return cover the rows above them. Left on the
whole book the footer printed **₹710.4 Cr under a column whose cells add to
₹222 Cr** — caught by reading the rendered page rather than by reasoning.

**AND WEIGHT IS THE FAMILY'S OWN QUESTION** — *"this much percentage of the
portfolio"* — so it divides TOTAL exposure by the whole book. The column
therefore sums to **42.2%, not 100%**, and the footer prints that. A weight over
the rows' own total would read 100% and tell a reader this table is their whole
portfolio, which is the one thing it is not.

**A COMPANY ONLY A FUND HOLDS IS STILL EXPOSURE**, so it gets a row: 395 of them
against the 174 the statements report. Every measured cell on such a row is
`AbsentCell` WITH ITS REASON, never ₹0 — no document reports a quantity, a cost
or a price for a share the family owns through somebody else's portfolio.

**A SCHEME THE FAMILY HOLDS AT ₹0 GIVES ₹0 OF EVERYTHING IN IT.** Five schemes
here are redeemed to nil, and carrying their disclosed lines drew 40 companies at
an exposure of exactly nothing — a computed zero, so not a fabrication, but a row
saying the family holds a company when what they hold is none of it. The line is
dropped; a company any funded scheme also discloses keeps that scheme's share.

#### One join, read by the row and by the card beneath it

`loadFundExposure` answered "which of my funds hold THIS name" one company at a
time. It is **replaced** by `loadStockExposure`, which builds the whole index
once: the row's `Via funds` cell and the itemised card inside that row's
expansion now read the same map, so they cannot disagree. It costs no more — the
same 21 files, memoised — and the deleted function left no orphan, which is this
file's own rule about a builder nothing calls.

**THE JOIN IS EXACT OR IT DOES NOT HAPPEN.** ISIN first, mapped to the BOOK's own
key where the book carries that ISIN — the only tier that bridges a depository's
`SBI - EQ` to an AMC's `State Bank of India`, and measured to be doing so for 10
companies. Otherwise this book's own `securityKeyOf`. **There is still no fuzzy
tier.**

**AND AN ISIN-BEARING FILING SETTLES THE KEY FOR ITS NAME.** 18% of disclosed
lines carry no ISIN, and the same company arrives both ways — one scheme files
`ICICI Bank Ltd.` with `INE090A01021`, another files `ICICI Bank Ltd.` with
nothing. On a single pass the first landed on the book's key and the second on
its own normalised name, so **the family's own question got two answers**:
measured on this store it split ICICI Bank, State Bank of India, Axis Bank and
IndusInd Bank. The ISIN-bearing filings are read FIRST and each records the key
for its normalised name. The evidence is the store's own — one AMC supplied the
identifier another omitted — so this is neither a fuzzy tier nor a re-derivation
of the book's identity.

**WHAT IT DELIBERATELY DID NOT REPAIR — AND THE EXTRACTOR HAS SINCE FIXED, see
Stage 10ak.** The BOOK carried ICICI Bank under TWO `securityKey`s: `icici-bank`
from a PMS statement and `icici-bank-eq` from the depository. Merging them ON
SCREEN would have given a reader one tidy row and left the reconciler none the
wiser, which this file forbids in as many words — *"if a join fails, fix the
EXTRACTOR"* — so it was COUNTED and STATED instead, and that sentence is what
told the next session there was an extractor join to make. The next session made
it: `securityKeyOf` removes the depository's own furniture before taking the key,
₹3.00 Cr of one company is one row, and the sentence's own detector is re-struck
on the ISIN because the name test became a tautology.

#### The ring-fence had to be carried onto the derived side

**A MUTUAL FUND THIS FAMILY HOLDS DISCLOSES POLYCAB.** ₹88,891 of it — so the
look-through drew a Polycab row on a page the fence says must not name it at all,
and `check:pages`'s existing absence check fired on the first sweep. The fence is
a decision about a SECURITY and has to hold wherever that security is reported,
including inside somebody else's portfolio, so `loadStockExposure` takes the
fenced keys and ISINs and drops those lines. Both, because they disagree: the
depository prints `POLYCAB INDIA LIMITED - EQ` and an AMC files `Polycab India
Ltd.`, which normalise apart.

**IT IS DROPPED SILENTLY AND NOT NAMED**, the one place this book departs from
"an absence is stated": naming it would put the word on the page, which is
exactly what the family asked to be rid of. `PortfolioMonitor` reads
`BOOK_POLYCAB` to take a name OUT and never to put a figure in — `Polycab.tsx`
remains its only reader for DISPLAY.

#### Eight bugs reintroduced, and one of them was a bug in a check

Each was put back on its own, rebuilt and swept: the funds back as rows (fires
six checks, from six directions), the fence dropped from the index (three,
including the pre-existing Polycab absence check), the footer back on the whole
book (two), Weight back on the measured half, the derived half summed into the
MEASURED column (three), the opaque bucket halved so the five no longer rebuild
NAV, a derived-only row printing ₹0 instead of an absence, and the two-pass
keying removed.

**THE WEIGHT CHECK DID NOT FIRE THE FIRST TIME.** It was struck on the FOOTER,
which is summed from `totalExposure` independently — so every ROW could divide
the measured half instead and the footer would go on printing 42.2% with nothing
to notice. It reads every row large enough for a printed decimal to mean
something now. That is this file's own *"a check that compares a figure with its
own copy cannot fail"*, arriving through a column.

**AND THE SWEEP READS A NEW COLUMN MAP.** `COL_STOCK` — this axis draws two more
columns, so everything after Market value sits two places right, and a Weight
assertion read against `COL` would have been struck on `Via funds`: a real
percentage against a real money figure, which is the plausible-wrong-answer this
sweep exists to catch rather than commit.

**THE ARITHMETIC IS `stockExposure.test.ts`** (`npm run test:family`), anchored
on `BOOK_SUMMARY.totalValue` and on the committed store rather than on a fixture
— a hand-written pair would prove only that two inventions agree. It asserts the
partition rebuilds NAV, that no company stands under two keys, that the ISIN tier
is doing work, and that the fence is LOAD-BEARING: the same store run WITHOUT it
must put Polycab back, or the guard would pass on a book where no scheme
discloses it and go on passing after the guard was deleted.

### Stage 10ak — ONE COMPANY, ONE KEY: THE DEPOSITORY FURNITURE LEAVES THE IDENTITY

*"fix the ICICI Bank double key in the extractor."*

Stage 10aj found it and refused to repair it on screen. This is the repair, in the
place that file's own rule names: **"if a join fails, fix the EXTRACTOR — never
re-derive a key in the presentation layer, which hides the defect from the
reconciler."**

**THE DEFECT WAS ONE LINE OF DOCTRINE.** `securityKeyOf` took the RAW name and
`stripDepositoryTail` was documented as DISPLAY ONLY — *"nothing here can move a
position between groups or break a join"*. So Goldstandard's appraisal printing
`ICICI Bank Ltd.` and the Motilal demat printing `ICICI BANK-EQ` were two
identities, and **₹3.00 Cr of one company across three statements never added
up.** The furniture is the depository's own bookkeeping about a line in ITS
books; it is not what the security IS — exactly as a glued-on ISIN is another
provider's, which `splitSecurityName` has always stripped before the key is taken
*"so the key comes from the CLEAN name"*. This is that rule, one column over.

**WHAT IT COSTS WAS MEASURED WITH THE ISIN AS THE WITNESS, over every security
name in the archive.** 49 keys change and exactly THREE merges follow — and a
merge of two NAMES is only safe if it is not a merge of two SECURITIES, which is
a question an identifier answers and a name cannot:

| Merged | Corroborated by |
| --- | --- |
| `icici-bank` — `ICICI Bank Ltd.` + `ICICI BANK-EQ` | **NSE's own name for the depository row's INE090A01021 is "ICICI Bank Limited", which normalises to that same key.** An identifier nobody in this join controls agrees |
| `everest-fleet` — two spellings | the SAME ISIN on both, INE0LTR01029 |
| `buoyant-…-class-a4` — three spellings | the third carries the broker's own `[BOUYA388]` code |

and **ZERO pairs whose ISINs disagree.** The strip keeps what names a DIFFERENT
instrument, which the same measurement confirms rather than assumes: Borosil's
`WARRANTS 13AG26` stays apart from the Borosil equity, EFPL's and URB's preference
lines stay apart from theirs, and Vedanta's four spin-offs stay four companies.

**NOT ONE FIGURE IN THE BOOK MOVES.** `BOOK_SUMMARY` is byte-identical —
consolidated ₹710.39 Cr, listed ₹358.04 Cr, private ₹352.35 Cr, 371 positions, 51
accounts. That is what a change to IDENTITY alone must look like, and it is the
check that says this was a rename rather than a re-measurement.

**AND THE FAMILY'S OWN REVIEW TIES TO ₹41.09 Cr MORE OF THEIR BOOK.**
`reconcile:review`'s "book positions no review line matches" falls from **65
positions / ₹166.43 Cr to 59 / ₹125.34 Cr** — ICICI NSDL from 11 to 8 — because
the depository's furnished names finally meet the review's plain ones on the key
both sides already reach through `securityKeyOf`. Nothing about the reconciler
changed.

#### `npm run rekey:archive` — how a key change lands without the passwords

`securityKey` is stored in `public/audit/*/document.json`, and `build-book` reads
it verbatim. Changing the function would therefore need `npm run extract` — which
needs `GLOW_PDF_PASSWORDS` for eight encrypted statements and `pdftoppm` +
`tesseract` for two outlined-text ones, and which `guardAgainstShrinkingTheArchive`
correctly refuses without them. **That would make this fix unlandable on any
machine without the family's passwords, which is most of them.**

It does not have to be. **The key is not READ off a page: it is DERIVED, by one
function, from a field the archive already carries verbatim** — the name the
statement printed. Measured before a line was written: **4,041 keys across six row
kinds, ZERO that are not `securityKeyOf(security)`.** So re-deriving it from the
committed archive is a faithful partial replay of extraction, and the next full
`npm run extract` calls the same function on the same name and writes the same
bytes. `scripts/rekey-archive.mjs` does exactly that and nothing else: it rewrites
`securityKey` and the key embedded in `dedupeGroup` (`dg-<securityKey>-<n>`), in
`extract.mjs`'s own `JSON.stringify(doc, null, 1) + "\n"`, and every figure,
warning and piece of provenance is written back unchanged. The diff was 57 lines
across 10 files, all of them one of those two fields.

**THE CONTROL RUN IS WHAT MAKES IT VERIFIABLE**, the same discipline the
`august-2026-b` delivery established: run BEFORE changing the function and the
tree must come back byte-identical, so every difference afterwards belongs to the
change and to nothing else. `--check` is that control, and a second run is a
no-op.

**AND ITS GATE IS STRUCK ON THE ARCHIVE, NOT ON A FUNCTION — because the first
one was one-way.** It began by asking "does the previous version of
`securityKeyOf` reproduce the stored key", which goes stale the moment the
function changes — the only occasion this script ever runs. Measured: after the
first re-key it refused every row, so the pass could not be reversed and a SECOND
change to the rule would have been unlandable. What stays true whatever the rule
is, is the PROPERTY the rule must have: **the key is a FUNCTION of the name, so
one name never carries two stored keys.** (The converse is not required and must
not be — two names sharing a key is exactly what a merge IS.) An archive that
violates it has a key that came from somewhere other than the name, so nothing is
written and the run exits non-zero. Verified by tampering with one row in a
scratch tree: it names the document, the name and both keys, and refuses.

#### Two identity guards, and only one of them could ever have seen this

`build-book` reports both on every run, **and prints them when they are zero** —
a guard that only speaks when it fires is indistinguishable, on a clean run, from
one that was quietly deleted:

- **one KEY carrying two ISINs** — a key naming two securities. It existed, and
  its own comment claimed it was "left with none and reported": `isinConflicts`
  was built, used to delete from `isinByKey`, and **printed nowhere.** A comment
  asserting an enforcement that never happened is worse than no enforcement,
  because the next session reads it and stops looking. It became load-bearing
  here, since stripping furniture is precisely the operation that could land two
  different securities on one key. Measured: **0.**
- **one ISIN carried under two KEYS** — one security keyed twice. **8**, and
  every one is a name one issuer CLIPS where another spells it out: `HELIOS FCF
  D-GROW` against `Helios Flexi Cap Fund - Direct Growth`, `CLEAN MAX ENV`
  against `Clean Max Enviro Energy Solutions`, `NATIONAL STOCK EX` against the
  full name. **No rule here bridges that and none may invent one**: the strip
  only ever REMOVES, and `backfillSecurityNames`'s ISIN-anchored rename needs the
  short form to be a per-word PREFIX of the long one, which an acronym is not.
  Each is now NAMED with its ISIN in `docs/BOOK-REPORT.md`, which turns the vague
  "there is an extractor join to make" into eight specific ones.

**AND THE SECOND GUARD WOULD NOT HAVE CAUGHT ICICI, which is worth stating rather
than implying:** the depository row carried INE090A01021 and the PMS row carried
no ISIN at all, so there was nothing to compare. The two are complementary — one
names what an identifier can prove, the other closes what only the name can show.

#### The literals that had to move with the key, and the one that would have cost ₹12,351 Cr

A key change breaks every typed literal keyed on the old spelling, silently, on
pages computing correctly. Four sets moved, and a fifth is the section below:

- **`RINGFENCED_SECURITY_KEYS`** — `polycab-india-limited-eq` → `polycab-india`.
  Left stale the fence matches nothing and the promoter block walks back into
  every total. Verified by reintroducing it: **nine invariants fire across four
  route/theme combinations**, both the `/polycab` page's own and the absence
  checks on `cio` and `monitor`.
- **`src/lib/familyTaxonomy.ts`** — **17** `sec:` entries, each a holding that
  would have fallen out of its basket and its family asset class. The suite's own
  no-dead-keys check catches it and names the key.
- **`scripts/review-reconcile.mjs`'s committed aliases** — three, and leaving
  them stale moved ₹11.10 Cr of review lines into "no counterpart in this book".
  The reconciler is what found them.
- **`src/data/nseSymbols.json`** — regenerated. **Zero symbols lost or gained by
  the key change**, measured by resolving BOTH keyings against ONE fetched master
  set, because two `build-symbols` runs differ by which NSE master answered.
  (Two symbols DID leave, and neither is this change: NSE has moved the DSP Gold
  and Silver ETFs to new ISINs — `INF740KA1ZP2` / `INF740KA1ZQ0` against the
  `INF740KA1SW3` / `INF740KA1RE3` the statements carry — so both are correctly
  reported as "on no NSE master" rather than joined on a name. One arrived: ESDS
  Software, a new listing the ISIN tier picked up.)

#### And a fifth literal was a ROUTE, whose check then turned out to be fixture-shaped

`check:pages` walks `stock-aif-dual` — the drill-down for a holding two accounts
both report, where *"carry both, count once"* either reads correctly or
contradicts itself on one screen. **Its address was a securityKey typed out in
full**, so the key moving landed it on the not-found page and three invariants
failed on a build that was correct. It is read off `dedupeGroup` now — the book's
own mark for a holding reported twice — so it moves with the book, and a drop
with no duplicate says so in the address rather than resolving to nothing.

**AND THAT EXPOSED A CHECK SHAPED BY ITS OWN FIXTURE.** Derived, the route picks
the LARGER duplicate — Transition Venture Fund I across two family trusts rather
than 360 ONE across two CRNs — and the entity-count invariant failed on it. The
page was right: pill "Held in 2 entities" over two rows. The CHECK counted those
rows by splitting the table's `innerText` on newlines, which works only while
every cell is one line — and the MANAGED BY cell carries a strategy sub-line
whenever the account prints one, which Transition Venture does and 360 ONE does
not. **The page's own comment already named this failure**, three columns to the
right: *"ONE LINE. A second `<div>` here becomes a newline in innerText, which
splits every account row in two and breaks the entity-count check."* The rule had
been applied to the HELD VIA column and not to the one column that actually
breaks it.

Fixed on the CHECK rather than by flattening the cell, because the sub-line is
real information and *"a structural claim must not depend on prose a redesign is
free to reword"*: the rows carry `data-account-row` and the sweep counts `<tr>`s.
Verified by reintroducing Stage 10j's original bug — the pill counting the
DEDUPED set — which fires it by name.

#### The on-screen detector had become a check that cannot fail

Stage 10aj's sentence counted a split by grouping on
`securityKeyOf(stripDepositoryTail(name))` and comparing that against the book's
key. That was a real check while the strip was display-only, and **the moment the
strip moved inside `securityKeyOf` it became the key compared with its own
definition** — this file's own *"a check that compares a figure with its own copy
cannot fail"*, arriving through a fix rather than a bug.

It is keyed on the ISIN now, on the page and in the sweep alike: two company
shares carrying one ISIN under two keys ARE one security keyed twice, whatever
their names say. The caption states that cause rather than the old one, because a
caption asserting a cause that is not the cause is the failure this file already
records twice.

**AND THE SWEEP ASSERTS BOTH DIRECTIONS, NEITHER OF WHICH IMPLIES THE OTHER.**
The sentence must be GONE — a removal is verified by asserting it happened — and
ICICI Bank must stand as ONE row over its three accounts at ₹3.00 Cr. That second
check is grouped by the STRIPPED NAME rather than by the book's key, which is
what makes it able to fail: the two coincide only BECAUSE the extractor strips,
so an extractor that stopped puts the group's rows under two keys and the
row-count assertion catches it. A missing candidate FAILS rather than abstaining.
Both verified by reintroducing their bug — the strip reverted (the original
defect, which fires the row check), and the sentence forced to render (which
fires the absence check) — and the bound on the money comparison is the page's
own printing precision reproduced, 0.005 Cr, never a tolerance widened until the
figure fits.

`build` · `test:ingest` 304 · `test:family` · `check:family` 53/0 ·
`check:pages` **138 combinations clean** — re-run against the merged main, whose
own two new routes account for the count moving — with the same two pre-existing
abstentions. `npm run rekey:archive --check` is a no-op, which is what says the
archive on disk is what the extractor would write.

### Stage 10s — MUTUAL FUND DATA, FROM THE FAMILY'S OWN AmfiBeas REPO

*"We should also be able to see each holding of every mutual fund."* … *"For all
the mutual funds related data you can get that from our repo — amfibeas. Mutual
Fund NAV, direct scheme NAV, rolling return etc etc., daily Mutual Fund scheme
NAV change… everything you can find in that repo. Do not make any changes in the
amfibeas repo — just access relevant data points from it."*

**READ-ONLY, ALWAYS.** `scripts/build-fund-lookthrough.mjs` takes the checkout as
an INPUT (`AMFIBEAS_DIR`, default `/home/user/techmuns/amfibeas`); nothing in
this repo clones, updates or writes to it.

```
techmuns/amfibeas (read-only)            npm run build-lookthrough
   |  book ISIN -> mf-latest-nav.json (3,439 schemes, ISIN on every one)
   v
public/lookthrough/index.json            securityKey -> scheme, plan, as-of
public/lookthrough/<schemecode>.json     NAV + day change, returns, EVERY disclosed row
docs/FUND-LOOKTHROUGH.md                 what resolved, what did not, and why
```

**THIS REPLACED A LIVE SCRAPE, AND THE JOIN IS THE REASON.** The first cut
fetched an aggregator at build time and matched a scheme BY NAME, through AMFI's
ISIN→name map and an AMC alias table. It worked, and every hop of it could go
wrong. AmfiBeas carries an **ISIN on all 3,439 schemes**, so the join is an exact
identifier lookup and the name match survives only as a fallback — the same
tiering `build-symbols` uses, and for the reason recorded there: an identifier
above the name tiers makes the match STRICTER, not looser. **20 of 22 join on
ISIN alone**, and the ISIN also settles the PLAN: `INF0R8701046` resolves to
`48299-D`, the DIRECT plan the family holds, where a name match could only ever
reach the Regular listing.

**A THIRD TIER, AND IT IS A READING RATHER THAN A GUESS.** One holding records no
ISIN and its name matches TWO schemes — the regular and direct listings of one
fund, which share a name and a portfolio. Its own printed name says *"- Direct
Plan Growth Option"*. So where candidates differ ONLY by plan and the holding
names one, the plan decides: both sides state it. Anything else stays
unresolved. **21 of 22 · ₹123.28 Cr of ₹124.46 Cr.**

**THE ONE THAT DOES NOT RESOLVE IS NAMED RATHER THAN FORCED.** Liquid BeES is
`INF732E01037` in this book — a legacy Benchmark/GS code — and AmfiBeas carries
`INF204KC1FU1` for the Nippon scheme. Nothing available here PROVES the two are
one security, so it is left unresolved with that reason. An ISIN alias would be
the guess this book refuses.

**FOUR THINGS THE BOOK COULD NOT SHOW BEFORE:**

- **NAV, and its DAILY CHANGE.** A mutual fund resolves to no NSE symbol, so the
  quote feed has never priced one and every fund's "Change today" was a dash. The
  last two points of the scheme's own NAV series answer it — and the card names
  the PREVIOUS NAV AND ITS DATE, because a fund does not publish on a
  non-business day and "since yesterday" would be wrong across a weekend.
- **RETURNS, taken from `mf-returns.json` rather than recomputed.** Two
  implementations of "what is a 1-year return" is how one screen disagrees with
  another; that file already states each period's basis (`simple` or `CAGR`).
- **THE WINDOW EACH RETURN REALLY SPANS.** Their `1M` for Helios runs
  **2026-06-19 → 2026-09-01**. The label is the source's; the DATES are the
  measurement, so both print. A period label rendered alone is the one figure on
  that card a reader could not check.
- **THE UNDERLYING'S OWN ISIN AND SECTOR**, which the aggregator never had.

**HOLDINGS: THE AMC'S OWN FILING FIRST.** `holdings-direct/` is scraped from the
fund house's own monthly disclosure page — `meta.source` is the AMC's URL — and
carries the underlying's ISIN and sector. `holdings/` is the same data via an
aggregator, with neither. So the filing wins, the aggregator is the fallback, and
**which one was used is recorded per scheme and printed on screen**: one is the
document the fund published, the other is somebody's reading of it. Measured: 14
schemes from the AMC, 3 from the aggregator.

**BOTH WERE EQUITY-ONLY, AND THAT LIMIT IS CLOSED — see Stage 10aq.** This
paragraph read *"a step back for those five, taken deliberately… wiring the debt
sleeve back would need a second source beside this one"*, which was TRUE of
`holdings-direct/` and false of the repo: **`public/amc-portfolio/` is the SAME
FILING read whole** — identical `sourceUrl`, every asset class, an ISIN on every
one of 157,125 rows. No second source, and no scheme resolves to zero rows any
more: the three liquid funds carry 214 / 161 / 151 debt lines each. It is kept
here in the order it was learnt, because *"we need a source we do not have"* is
exactly the shape of absence this file has now recorded against an unchecked
premise seven times — and the answer was in the directory next door.

**NONE OF IT ENTERS A BOOK TOTAL.** These are the only figures on the site that
are not the family's own — the fund's value already stands for everything the
card shows, and counting both would count the same money twice. The card says so
on its face. The family's exposure per underlying is `holding value × published
weight`, computed on screen where it is labelled derived.

**AVAILABLE IN AmfiBeas AND NOT SURFACED YET**, recorded so the next session does
not have to go looking: `mf-ratios.json` (standard deviation and beta with a
category rank and percentile), `mf-rolling-ranks.json`, `mf-category-returns.json`
(peer-group returns per period), `public/stocks/<isin>.json` and
`public/index-history/NIFTY_500.json`.

Seven bugs were reintroduced against the card's invariants — a NAV change without
the previous NAV's date, a return label without its window, holdings that stop
naming their document, a plan that stops naming its ISIN, a look-through column
on the fund's money, a dropped provenance line, and an AIF grown a card — and all
seven fire.

### Stage 10t — THE MOVERS ARE DIRECT EQUITY, AND THREE CAPTIONS GO

*"remove the book performance section. daily movers/losers should comprise of
direct equity holdings only. remove the highlighted text from ui."*

*(The ETFs have since come BACK to this card, at the family's request — see
Stage 10ad. What stands from this section is the mandate half, which is
unchanged: a share a discretionary manager picked is still not in the movers
list. The scope was a tab for a while and the default was stocks and ETFs
together; the family have since removed the tabs and settled the card on Direct
Equity alone — see Stage 10al, which is where this narrowing ends up standing.)*

**THE MOVERS CARD NOW COVERS A DIFFERENT SET, NOT A RENAMED ONE.**
`DIRECT_EQUITY_BUCKET` is this app's answer to WHO CHOSE A HOLDING — settled in
Stage 10L after the family reported the same thing three times, and applied to
the Transactions tab in Stage 10p. It means shares bought in the family's own
demat or broking account (`Direct` / `Execution`), never shares a discretionary
manager picked, and never a fund or an ETF. Measured on this book: **37 holdings,
₹94.9 Cr, of which 33 names and ₹82.3 Cr can reach the quote feed at all.** Before
this the list mixed the two — Jammu Kashmir Bank, Carnelian's pick, sat beside
Fractal Analytics from the family's own demat under one heading.

**EVERY FIGURE ON THE CARD MOVED WITH THE SET, AND THE CAPTIONS HAD TO FOLLOW.**
The tile is `Direct Equity · today` rather than `Book · today`; its coverage line
counts `N of 37 direct-equity names` rather than `N of 214 distinct names`; and
the index comparison reads "Direct equity is +x% against the Nifty 500" rather
than "the priced book is". A caption that widens a figure is the same failure as
one that narrows it — the Capital invested tile already cost this page once.

**AND WHAT THE NARROWING LEAVES OUT IS NAMED.** `130 PMS mandates ₹136.6 Cr · 3
ETF ₹28.3 Cr · 1 Mutual Fund` also moved today and are not in either list. Counted
over the holdings that carry a live day change — the ones that could otherwise
have appeared — so a bucket with nothing priceable in it needs no excusing.

**THE BOOK PERFORMANCE CARD IS REMOVED, AND NOT ONE OF ITS FIGURES IS.** It read
"Listed vs private, on a like-for-like basis" over the listed book's invested →
today with its unrealised gain, return and money-weighted return, and the same
for the AIF half. All of it is still on the page and still derived: invested and
current value per bucket in the allocation table, the money-weighted return in
its own KPI tile with its own coverage line, and the listed/private split in the
Consolidated NAV tile and on Concentration & risk, each linking to the holdings
behind it. `publicPrivateSplit`, `listedBook`, `privateBook` and
`listedTotalReturn` still feed those surfaces. **A layout removal, not a
measurement one — and `check:pages` asserts BOTH halves**, because a page that
dropped the card and the split together would pass the first check while losing a
figure.

**THREE CAPTIONS GO, AND TWO FACTS INSIDE ONE OF THEM DO NOT.** The movers footer
(the ranking rationale, the unchanged-name count, the multi-account rule) and the
movers subtitle described HOW the card works to a reader who can see it working.
The allocation table's subtitle also carried two things a reader ACTS on: that
every return there is CUMULATIVE rather than annualised, and the date the figures
close at. Both were **already on the page outside that card** — the Consolidated
return tile states "cumulative, not annualised" on its face and the header's
`<BasisPill>` states the as-of — so the subtitle could go without taking a
measurement with it, and an invariant now asserts those two survive.

**THE PILL KEEPS THE WORD "HELD".** The first draft moved the basis and the date
into it, reading `6 buckets · cumulative · 2026-08-13`. Two OTHER invariants read
the bucket count out of `N buckets held`, and both reported a missing figure on a
page rendering perfectly. **A caption is chrome; a count inside it is not.** The
same pass added a `title` prop to `Pill` for a hover that then had nothing to
carry, and it was reverted rather than left exported and uncalled.

**SIX INVARIANTS, EACH VERIFIED BY REINTRODUCING ITS BUG — and one of them was
in the wrong place.** The scope claim is struck on a COUNT, not on the rows: every
`cio-live` fixture price is the mark × 1.10, so every priceable name in scope
rises and the gainer count IS the size of the priced scope (33 here, 160-odd with
the mandates folded back in). A rows-only check passes on any day the mandate
names happen not to move, which is most days. The expectation is derived from the
book on every run and the bucket is recomputed inside `check-pages.mjs` rather
than imported — a check that imports the helper it is checking agrees with itself
by construction.

**AND A CHECK FOR REMOVED TEXT MUST RUN WHERE THAT TEXT WOULD RENDER.** The
movers footer only exists when the card has rows, and the plain `cio` walk serves
no feed — so "the footer stays removed" passed there whether it had been removed
or not. Reintroducing the sentence proved it: `cio` stayed green. It is asserted
on `cio-live` now; the allocation subtitle and the removed card render with no
feed at all and stay on `cio`.

### Stage 10u — A MANDATE ROW IS ITS NAME, AND THE CHECKS STOPPED READING PROSE

*"Do not write the entity along with the PMS name, entity name is already a
separate column. Other details in smaller text can be shown after we open the
full drill down page of individual PMS page. Remove the smaller text details
from the front table so it is a clean row."*

A mandate row printed three lines: the name with the owner appended, a "PMS
mandate" pill, and a grey sub-line reading `<manager> · account <no> · N
holdings`. It is one line now — name and pill — and rows on screen went **18 →
21** because a third of each mandate row was chrome.

**THE OWNER LEFT THE NAME BECAUSE THE COLUMN THAT HOLDS IT NOW EXISTS.**
`mandateLabelWithOwner` was written for a real defect: FOUR of this book's ten
mandates share a strategy name with another — Goldstandard's Aristos, SVAN's
Velocity, Green Lantern's GLC Growth, V.E.C's Small and Mid-Cap, each run for
two members — so on strategy alone the section drew four pairs of
identically-named rows with nothing to tell them apart. That reason EXPIRED when
Sector and Entity moved to the end of the row: a mandate row populates
`entities`, so the pairs are separated by the column that exists for it. The
helper stays for callers with no such column (the Excel export, the holdings
drill-down), and **`check:pages` asserts the pairs are still distinguishable**,
because this is the one thing the change could break.

**THE DETAILS MOVED TO THE PAGE THAT ALREADY PRINTED THEM.**
`/mandate/:accountId` has always shown `provider · accountNo · owner` under its
title. Nothing was lost: the row's link carries manager, account and count in
its hover `title`, and the row carries them as `data-*`.

**ONE THING IS NOT A DETAIL AND STAYS, CONDITIONALLY.** Under a filter a mandate
row's figures cover PART of the account, and a reader who is not told reads a
subset as the whole. That line renders only when `holdings.length <
accountCount` — nothing in the unfiltered view, which is the clean row that was
asked for.

**AND SIX INVARIANTS WERE READING THAT SUB-LINE.** `MANDATE_SUBLINE` parsed the
manager, the account and the constituent count out of the rendered text, and
`check:family` parsed the same string again. Deleting the line would have
retired all of them **silently**: a regex that matches nothing yields an empty
list, and an empty list passes `.every()` and satisfies a length comparison
against itself. So the row carries `data-mandate`, `data-manager`,
`data-account`, `data-holdings`, `data-account-holdings` and `data-bucket`, the
sweep collects them from the DOM into `ctx.tableRows` / `ctx.mandateRows`, and
every one of those checks reads structure instead. Same contract `data-row` and
`data-days` already carry on the transactions rollup, and the same rule: **a
structural claim must not depend on prose a redesign is free to delete.** A run
that captures no rows reports NOT CHECKED rather than passing.

**THE FIRST DRAFT OF THE NEW CHECK COULD NOT FAIL, AND REINTRODUCING THE BUG IS
WHAT FOUND IT.** "The name does not carry the owner" was struck on
`data-mandate` — which is `MandateInfo.name`, a DIFFERENT field from the
`Row.security` the cell actually renders. Putting the owner back into the
rendered name left the attribute untouched and the invariant green. It reads the
rendered first cell now. Both new invariants were then verified by reintroducing
their bug: the owner back in the name, and the sub-line back under it.
### Stage 10v — ONE TILE, ONE DESTINATION, AND THE HALVES BECOME A TOGGLE

*"there are multiple links on these KPI tiles. Make these KPI tiles clickable and
remove all the other links. suppose for consolidated NAV KPI tile, the
listed/private book links and pages should not exist separately… just give the
toggle option inside the Consolidated NAV link page. Do the same for all the
other KPI tiles as well."*

Stage 10o gave every figure on Morning CIO an address and gave several tiles
MORE THAN ONE. The NAV tile carried three — its label, and the listed and
private halves in its own caption; Capital invested carried two, the second
being the 60 cost-less positions. A reader had to work out which of them
answered their question, and the largest target on the tile, the figure itself,
went nowhere.

**THE TARGET IS THE WHOLE CARD, AND IT IS A STRETCHED OVERLAY RATHER THAN A
WRAPPER.** The value carries an `<Auditable>` popover, which is a `<button>`,
and a button inside an anchor is invalid markup that browsers disagree about.
So `Kpi.tsx` renders the anchor as an absolutely-positioned sibling covering the
card with the interactive children lifted above it: the arithmetic stays
clickable where it is, the rest of the tile navigates, and the markup stays
valid. Six tiles, six destinations, and every competing link inside one is gone.

**AND THE SUB-SCOPES BECAME FACETS OF THE TILE'S OWN PAGE.** `listed`, `private`
and `no-cost` were `DrilldownId`s of their own. They are `Facet`s now — a set
plus a label plus its note, carried on the drill-down the TILE opens — and
`/holdings` renders them as a toggle above the table, each chip printing its own
row count. `?facet=` selects one; the first is the default. The heading and the
lead follow the active facet, so a narrowed page never sits under the whole
set's caption.

| The tile | opens | with facets |
| --- | --- | --- |
| Consolidated NAV | `?of=book` | All holdings 369 · Listed 350 · Private 19 |
| Capital invested | `?of=invested` | Reports a cost 309 · Reports none 60 |
| Consolidated return | `?of=invested` | the same page — both figures divide by the same capital |
| Money-weighted return | `?of=measured` | Covered · Not covered |
| Winners / losers | `?of=winners` / `losers` | Showing a gain · In neither count |
| Dry powder · Distributions | `/private-market` | not holdings — no facet, and no holdings table |

**THE OLD ADDRESSES STILL RESOLVE, DELIBERATELY.** `?of=listed`, `?of=private`
and `?of=no-cost` map to their scope plus facet, so a bookmark keeps working —
which is exactly why their ABSENCE from the strip has to be asserted rather than
assumed: nothing would break if one came back.

**THE CHECKS HAD TO MOVE, AND ONE OF THEM COULD NO LONGER FAIL.** *"every KPI
tile and concentration figure opens ITS OWN set"* pairs a link's TEXT with its
href, read off `main a[href]`. A whole-card overlay anchor has no inner text, so
all six tiles arrived with an empty label and the pairing could not see them —
it would have gone on "passing" by being unable to fail. The six tiles are
struck on `ctx.kpiTiles` now, which pairs each card's own label with the one
anchor inside it; the concentration figures are still text links and are still
struck on the link list. Same claim, struck where the pairing lives.

**AND `kpiTiles` WAS CAPTURED INTO NO CALLER.** It was evaluated in the page and
left out of the ctx literal handed to the invariants, so all three new
KPI-strip checks reported NOT CHECKED — this repo's most-repeated failure,
arriving in the harness this time. They said `notChecked` rather than passing,
which is the only reason it was visible at all.

**A MISSING TOGGLE MUST BE A FINDING, NOT AN ABSTENTION.** Every facet invariant
first returned `notChecked` when a page drew no toggle — and deleting the toggle
outright, which is precisely the arrangement the family asked to be rid of, then
reported the whole sweep CLEAN with seven unchecked lines. That is `golden.mjs`'s
rule arriving through a control. Abstention is allowed only where the BOOK
genuinely has one side, evidenced by Morning CIO's own figures
(`BOOK_HAS_BOTH_HALVES`, `TILE_NAMES_COSTLESS`) rather than by a literal — so a
drop with nothing private abstains and this one fails.

**THE VALUE CHECKS COULD NOT SEE ANY OF IT.** Every figure on these pages renders
identically whether the halves are reached by a toggle here or by two links on
the page before, and all of them passed while the halves were separate scopes. So
the toggle is asserted on the CONTROL: that it exists, that it opens on the whole
set rather than a half, that its printed counts partition the scope, and — on the
listed half — that the private half and the undivided book are one click away
FROM THERE. That last one is the half of the request the figures cannot see: a
reader who opened one half must not have to go back to Morning CIO to reach the
other.

**IDENTIFIED BY THE FACET IT NAMES, NEVER BY THE SHAPE OF ITS ADDRESS.** The
whole-book chip is written `facet=all` rather than as a bare scope, and the first
draft of that check tested for the ABSENCE of a `facet=` param — asserting a URL
convention instead of the reader's route, and failing a page that was landing
correctly.

**AND THE WINNERS PAGE'S THIRD SET MOVED WITH THEM.** "The holdings in neither
count are named, not dropped" matched the companion table's PROSE, which a page
can print above an empty table. Those rows are a facet now, and the check reads
the chip's own row count — the stronger claim, and the one that survives the
wording changing again.

**ELEVEN BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: a second link inside a
tile, the NAV tile pointed at the wrong set, the Listed half pointed at the
private facet, the no-cost sentence dropped from the tile, Dry powder pointed at
a holdings table, the toggle deleted, the toggle defaulted to a half, and the
chips printing the active set's count instead of their own. Two of them fired
checks that had to be rewritten first, which is the whole reason for doing it.

### Stage 10w — Watchlist & Targets: REMOVED, and the store is not

*"remove this tab"* — the sidebar entry, pointed at.

`/watchlist` redirects, the nav entry is gone and `src/pages/Watchlist.tsx` is
deleted. The redirect went to Compare Companies rather than the monitor because
that was the surviving surface in the SAME nav group that still rendered a
watched name's target and its upside; leaving it pointed somewhere with none of
those figures while `/compare` sat one link away is the stale routing decision
Stage 9d removed the day the calendar was wired.

**COMPARE COMPANIES HAS SINCE BEEN REMOVED TOO (Stage 10ap), so `/watchlist` is
REPOINTED at `/monitor` rather than chained through a dead address** — two hops
settle at the same pathname as one, which is precisely the routing this suite
cannot catch and which therefore has to be fixed in the route table. The reason
above expired; the rule it applied did not.

**`src/lib/watchlist.ts` IS UNTOUCHED, AND THAT IS THE HALF A REMOVAL LIKE THIS
BREAKS SILENTLY.** Every target price, fair value, entry and exit level, price
alert, valuation method, FV reference year, target weight and "why we own it"
note the family typed is still stored and still read and written by
`InvestmentTools` on a name's own company page — and `CompareCompanies` read the
target and the upside beside each price until it too was removed (Stage 10ap).
Nothing anyone entered was deleted. With its most VISIBLE reader gone the store
looks dead, which is how a future session deletes
it and takes the family's own judgements with it: the same trap
`announcements.ts` was in when `/news` went, and the same reason `deals.ts` and
`household.ts` stayed in Stage 10f when their pages were removed.

So the check does not merely assert the tab is gone. `check:family` asserts
BOTH halves, and only the second one can fail quietly:

- the nav entry is absent and `/watchlist` REDIRECTS rather than 404s, because a
  bookmark is a promise the app made;
- a company page reached from the monitor still carries the Investment tools
  panel with Target price, Fair value and Valuation method on it — the address
  taken off the rendered page rather than typed, like every other route that
  suite follows.

`check:pages` no longer walks `/watchlist`: there is no page there to hold to
the light-mode, overflow and stray-₹0 bar. **A removal is verified by asserting
it happened, never by deleting the test alongside the feature.**

Nothing in the store became uncalled by this — `firedAlerts`, `ALERT_WORDING`,
`upsidePct`, `parseWeightPct` and `VALUATION_METHODS` all have their caller in
`InvestmentTools`, and `readWatchlist` kept its one in `CompareCompanies` — so
nothing was left exported and dead, which is the failure this file keeps naming.
**That last caller has since gone with the page (Stage 10ap).** `readWatchlist`
is still called by `readEntry` and `writeEntry` beside it, so it is not an
orphan — but it now LOOKS like one from outside the file, which is exactly how a
store the family typed into gets deleted a release later, so it says so at its
own definition.

### Stage 10y — Thesis & Triggers and Alerts: REMOVED, and the store is not

*"remove both the pages from the dashboard ui"* — the two nav entries, pointed
at.

`/thesis` and `/alerts` redirect, both nav entries are gone, and
`ThesisMonitor.tsx` and `Alerts.tsx` are deleted. Between them they were the
WHOLE of the **MONITOR** nav group, so its heading goes with them, exactly as
the KNOWLEDGE heading went with its one entry at Stage 10x.

**BOTH FORWARD TO EXPOSURE & IPS, and that is the surviving surface nearest
their purpose rather than a neutral fallback.** All three pages were the
family-input layer — a thesis, an alert rule and an IPS target are things the
family TYPES, not figures a statement reports. Exposure & IPS is the one that
stays, it holds the IPS targets and the bucket mapping, and the part that
decides it: **it carries the Export/Import that round-trips the WHOLE store in
one file, theses and alert rules included.** With both editors gone it is the
only surface that reaches a stored thesis or alert rule, which makes it the
honest destination for a bookmark rather than a near-enough one. Contrast
Stage 10x, where nothing survived that held notes or macro series and all three
addresses correctly went to the dashboard home.

**`src/lib/familyInputs.ts` IS UNTOUCHED.** Every thesis, expected return, exit
trigger, review schedule and alert rule the family entered is still stored,
still coerced on import and still travels in that one export file — the
treatment `deals.ts` and `household.ts` got at Stage 10f and `watchlist.ts` at
Stage 10w. `emptyThesis` is the one export left with no caller; it says so at
its own definition rather than sitting as a silent orphan, because this store is
deliberately kept whole and a future editor calls it again unchanged.

**`alertEngine.ts` LOST TWO THIRDS OF ITSELF AND STAYS.** Exposure & IPS reads
`bucketActuals` and `bucketWeightPct` from it — the bucket roll-up was never
about alerts, it answers "what fraction of the book sits in each IPS bucket" —
so those stay. `evaluateAlerts` and `ALERT_KIND_LABEL` had exactly one caller
between them and went with the page: **229 lines to 68.** No arithmetic
assertion was lost with them, checked rather than assumed —
`familyMath.test.ts` covers `deals`, `household`, `watchlist` and `marketCap`
and never touched the evaluator. What the evaluator ENFORCED is worth keeping in
view and is recorded in the section below rather than in dead code: *a rule
whose inputs are incomplete does not fire and does not pass either.*

**AND THE CHECK THAT WAS MEANT TO GUARD THE STORE COULD NOT FAIL.**
`check:family` already asserted "the whole store can still be exported from
here" as `/export/i` over the page text — and the paragraph BENEATH the buttons
explains what Export does, so deleting the button outright left it green. That
check is now struck on the BUTTONS, both of them, because an export with no
import back is a one-way door out of the family's own record. Reintroducing the
bug proved the rewrite: with the button gone and its prose intact it reports
`0 export · 1 import` and fails.

**AND A NEW CHECK FAILED A CORRECT PAGE, for the reason its own comment had just
named.** The removed pages are asserted to render none of their own content at
their old addresses, struck on each page's distinctive phrases. `alert rules`
was one of them — and it is in Exposure & IPS's export tooltip, legitimately,
because the export does carry them. A phrase the DESTINATION prints is not
distinctive to the page that was removed. Narrowed to `no rules yet` and `need a
source, not a threshold`, which only that page ever printed.

`check:pages` no longer walks either route and the `thesis` and `alerts`
invariant blocks went with the pages they described. Five bugs were
reintroduced — the page restored at its address, its route un-redirected, its
nav entry put back, the Monitor heading with it, and the Export button deleted
while its explanatory prose stayed — and each fired exactly its own check.

### Stage 10aa — THE NAV CHART WAS AN EMPTY BOX, AND EVERY CHECK ON IT PASSED

*"fix this blank section, it should show a proper time graph showing larger
period return comparison."*

**IT RENDERED NO SVG AT ALL.** `NavVsIndex`'s plot area was
`min-h-[15rem] flex-1` with `ResponsiveContainer height="100%"` inside it. That
holder is a `flex-basis: 0` item in an AUTO-HEIGHT column, so its used height
comes from `min-height` — and Chrome does not treat that as a DEFINITE height
for a percentage child. Measured in the browser: the holder painted 1225 × 210
and the container inside it 1225 × **0**. No axes, no legend, no lines, no
`<svg>` element. Every other chart in this app already sizes definitely
(`h-72`, `h-44`, `SeriesChart`'s `style={{height}}`); this was the single
exception and the single blank. It is `h-[22rem]` now.

**AND NOTHING COULD SEE IT — EIGHT INVARIANTS ON THIS CARD, ALL GREEN.** The
coverage line, the flow-adjusted return against the unadjusted one, the external
capital in rupees, the value not proven to be performance, the three-list
partition: every one of them reads `innerText`, and every one of them was
CORRECT while the chart beside them was an empty frame. Verified by
reintroducing the bug — the old holder puts the blank back and not one
pre-existing check fails. **A chart is checked on its geometry or it is not
checked**, which is the same rule this file already reaches for the headline's
layout, Export Excel's row and the KPI overlay anchor, arriving at the one
element that is nothing BUT geometry. `ctx.navChart` measures the painted SVG,
each curve's `d` length and vertex count, the axis ticks, the legend's order and
the range control.

**THE AXIS WAS NOT A TIME AXIS, WHICH IS THE OTHER HALF OF "PROPER".** It was
`dataKey="date"` on a CATEGORY scale over the book's seven statement dates, so
10 → 11 August (one day) took the same width as 10 → 27 July (seventeen), and
every segment's slope was a fact about ROW ORDER rather than about time. It is
`type="number" scale="time"` now, ticked one per year/quarter/month by span —
`SeriesChart`'s rule, on timestamps.

**AND THE "INDEX" WAS SEVEN STRAIGHT SEGMENTS.** `rebasedIndex` samples the
index AT THE BOOK'S DATES, which is exactly right for the comparison pill and
wrong to draw: a line through seven sampled closes is not the Nifty 500's path.
`indexCurve` draws every settled close the feed carries. The two now serve their
own purposes and the check tells them apart on VERTEX COUNT — 245 against 7.

#### The larger period is asymmetric, and saying so is the whole of the honesty

**THE BOOK'S OWN DATED SERIES IS FIVE WEEKS AND CANNOT BE LONGER.** Measured
rather than assumed: `BOOK_NAV_HISTORY` is 7 points over 2026-07-10 → 2026-08-13,
and the per-account histories reach back only to 2026-05-31 — the whole archive
is four and a half months (§"AND YTD / CALENDAR-YEAR ON A HOLDING IS NOT
MEASURABLE HERE"). No range control invents a point.

What CAN be lengthened is the INDEX's context around it, and `/api/prices`
carries years of `^CRSLDX` daily closes. So a `Book window · 3M · 6M · 1Y · 3Y ·
5Y · Max` control governs how far back the index is drawn, defaulting to **1Y**
— the ask was for a larger period, and opening on the book's own window would
show exactly what was complained about. Four rules keep it honest:

- **BOTH LINES ARE REBASED AT THE BOOK'S FIRST POINT, NOT THE WINDOW'S.** That is
  the only base at which the comparison is exact: both pass through 100 on the
  one date both measurements exist for. Rebasing to the left edge of a five-year
  window would put the book's line at whatever level the index happened to reach
  by July and invite a reader to compare two numbers struck from different starts.
- **THE MEASURED STRETCH IS SHADED**, at every range wider than itself. On the 1Y
  view most of the axis is index history the book has no measurement over, and an
  unshaded chart invites the reader to read the whole width as a comparison —
  a caption widening a figure it does not narrow, arriving through a time axis.
- **THE HEADLINE PILLS STAY ON THE BOOK'S OWN WINDOW.** Book +0.54% against the
  index's figure over the SAME dates. The selected range's return is stated
  separately, under the chart, as the index's own and labelled *market history
  rather than a comparison* — never set beside a book figure struck over a
  different period.
- **ONLY THE BOOK RANGE CAPS THE END.** Everywhere else the index runs to its own
  last settled close, which is the useful half of asking for a longer period:
  where the market has gone since the book was last marked. The book range caps
  because its label promises the window both lines cover, and **a control that
  describes itself wrongly is the same defect as a caption that does.**

**SIX SERIES COLOURS BECAME THEME VARIABLES.** `#d9c48f` on ivory is a line a
reader cannot see, and `#2b2668` grid lines are a near-black web on it — and the
light-mode sweep could not report either, because an SVG `stroke` is not a
Tailwind utility and there is no computed class to resolve. `--chart-grid`,
`--chart-axis`, `--chart-book`, `--chart-index`, `--chart-nav` and `--chart-band`
are defined for both themes in `index.css`; champagne darkens to `#8a6a1c` on
light, exactly as `.text-champagne-400` already does. This also gives
`SeriesChart` the `--chart-grid` it has always referenced and never had.

**AND THE LEGEND'S ORDER IS STATED, BECAUSE IT DIFFERS FROM THE PAINT ORDER ON
PURPOSE.** The book's line is drawn LAST so it sits above the index — seven
points against up to thirteen hundred closes — and a legend following the
children would then lead with the index on a card whose subject is the book.

**SIX BUGS REINTRODUCED, EACH FIRING EXACTLY ITS OWN CHECK**: the old
`min-h`/`flex-1` holder, the category axis, a range control defaulting to the
book's window, the sentence naming the measured window, the index sampled to the
book's dates, and the shaded band removed. Two of them exposed defects in the
CHECKS first, which is the point of doing it — a vertex counter that split on
`[LM]` read **1** for a 245-point curve, because these lines are
`type="monotone"` and recharts emits one `M` and a cubic bezier per point with
not an `L` in the whole path; and the band assertion was first struck on `cio`,
which serves no price feed, so the chart is correctly the book's own window with
nothing to mark. The band belongs on `cio-live`, where a wider window exists —
and it asserts the window really IS wider before requiring the band, so it
cannot pass by asserting nothing.

**WHAT IS STILL NOT DRAWN, AND WHERE THE LONGER COMPARISON ACTUALLY LIVES.**
`BOOK_ACCOUNT_RETURNS` carries the managers' OWN published 1m/3m/6m/1y and
since-inception returns for 12 accounts, each beside the benchmark that manager
publishes — real primary-source figures over genuinely long periods. They are
per-mandate, on different fee bases (`after`/`before`), against different
benchmarks (N50TRI, S&P BSE 500 TRI, NSmCap250TRI) and each ends at its own
statement date, so they can never be averaged into a book return. `/performance`
already renders them per account and this card deliberately does not duplicate
them.

**AND `/performance` STILL CARRIED THE ABSENCE THIS CARD EXISTS TO CORRECT —
FIXED AT STAGE 10ar.** Its "NAV trajectory" card rendered an `AbsentSection`
reading *"No valuation series in this book · each account's statements carry
exactly two dated portfolio values"* — the same premise Stage 10p measured and
found false, standing one route over from a chart built on the data it says does
not exist. It was named here rather than fixed because the family had pointed at
Morning CIO, as the sixth absence against an unchecked premise and *"one
`<NavVsIndex />` away"*. It draws that chart now, off the same generated series,
and `check:pages` asserts BOTH that the old wording is gone and that the series
is there — a build that deleted the card satisfies the first and draws nothing.

### Stage 10x — Knowledge & Memory, Macro Research and Economy & Macro: REMOVED

*"remove all three pages from the dashboard UI"* — the three nav entries,
pointed at.

`/knowledge`, `/macro` and `/economy` redirect, the three nav entries are gone
and `Knowledge.tsx`, `MacroResearch.tsx` and `Economy.tsx` are deleted, along
with every module left with no other caller: `lib/knowledge.ts` (the note
store), `lib/econCalendar.ts` and `EconomicCalendar.tsx` (Stage 9d's release
calendar), `YieldCurve.tsx`, `lib/exportChart.ts`, `lib/exportSeries.ts` and
`lib/macro.ts` — the last of which was ALREADY uncalled before this change and
went because it is the removed page's own feed client.

**ALL THREE FORWARD TO THE DASHBOARD HOME, WHICH IS A DECISION RATHER THAN A
DEFAULT.** Every other removal in this file sends its address to the surviving
surface nearest its purpose — `/private` to the private book, `/watchlist` to
Compare Companies (since removed itself — Stage 10ap — so both now go to the
Portfolio Monitor), `/household` to Family & Entities. Nothing that survives
holds the family's own notes, and nothing that survives renders a commodity,
index, currency or macro series. Pointing these at a page that merely LOOKS
adjacent would assert a continuity that does not exist. `/industry`, removed at
Stage 9c and forwarded to `/macro`, moves with it.

**WHAT DID NOT GO WITH THEM — and this is the half a removal like this breaks
silently.** `src/lib/series.ts` and `SeriesChart.tsx` were most visibly read by
the two pages that have just gone, so they now LOOK dead. They are not:
`ReturnsTable` draws a company's price history with `Point`, `SeriesMeta`,
`HORIZON_COLS`, `RANGES`, `fmtLevel`, `fmtReturn` and `rebase`, off
`/api/prices`; `NavVsIndex` fetches through the same client and
`navSeries.test.ts` reads the same shapes. (`CompareCompanies` was a third
reader and has since been removed — Stage 10ap.)
The `stock` invariant that asserts the price card renders is what holds them up
at runtime, and it says so in as many words; `SeriesChart` itself is held by the
BUILD, because the harness serves no price feed and the chart never mounts, so
the gate for this change is build AND sweep rather than either alone.

**AND `public/series/` AND `npm run harvest` STAY, WHICH IS THE ONE DECISION
HERE THAT IS NOT REVERSIBLE IF TAKEN THE OTHER WAY.** No page reads the store
now — `fetchSeriesIndex` and `fetchSeriesPoints` have no caller, and
`src/lib/series.ts`'s header says so plainly rather than leaving a silent
orphan. But seven RBI policy rates and IEX's day-ahead spot power are
ACCUMULATING series: their sources publish a current value and no history, so
the store builds them one observation per run. Stopping the nightly harvest
would not pause those series, it would END them, with nothing to backfill from.
Deleting the only reader of a store a nightly job keeps growing is the wrong
half to cut, and a documented no-caller is not the dead-builder failure this
file names — that failure is the SILENT orphan a future session wires back
believing it load-bearing.

**TWO CLOUDFLARE FUNCTIONS ARE NOW UNCALLED AND ARE LEFT STANDING**:
`functions/api/econ-calendar.js` and `functions/api/macro.js`. The request was
for the dashboard UI, and an endpoint is a deployment surface rather than a
page; both are stateless proxies, so nothing accumulates in them and nothing is
lost either way. They are named here rather than removed quietly, and either can
go on request. `check:pages`'s failed-request noise list no longer excuses
`/api/econ-calendar`, `/api/macro` or `/api/economy`, so a stray request to any
of them is now REPORTED instead of suppressed.

`check:pages` no longer walks the three routes, and the `knowledge` and `macro`
invariant blocks went with the pages they described. `check:family` carries the
removal instead: the four redirects land, the three nav entries are gone, the
now-empty KNOWLEDGE nav GROUP heading is gone with its one entry, and each page
renders NONE OF ITS OWN CONTENT at its old address — struck on each page's own
distinctive phrases rather than on its title, because a title survives in a nav
entry while the page is gone.

**A CHECK THAT COULD NOT CATCH WHAT ITS COMMENT CLAIMED, FOUND BY REINTRODUCING
THE BUG.** The `/industry` row was written to catch a redirect pointed at a
removed page. Pointed back at `/macro` it still PASSED — `/macro` now forwards
to `/cio`, and two hops settle at the same pathname as one. The suite reads
where a bookmark LANDS, and by that measure both routings keep the promise, so
the chain is a fact about the route table: fixed there, named there, and the
comment here corrected to claim only what it proves. Five other bugs were
reintroduced — the page restored at its address, its route un-redirected, its
nav entry put back, the group heading with it, and `ReturnsTable` dropped from
the company page — and each fired exactly its own check.

### Stage 10y — THE TILE IS THE AFFORDANCE, AND THE ARITHMETIC MOVES TO THE PAGE

*"remove the remaining underlines from the texts, and even the calculation that
we're showing that appears when click the underlined no. we can show that inside
the clickable KPI pages. Just make the KPI tiles look like 3-d clickable buttons
and remove every other underlines/hyperlinks on the texts."*

Stage 10v made the whole card the click target and left both underlines on it. So
each tile carried THREE affordances for one action: a dotted-underlined LABEL, a
dashed-underlined FIGURE that opened a popover, and the card itself. Two of them
pointed at text that is not the thing to click.

**THE AFFORDANCE IS THE SURFACE NOW.** `.card.kpi-btn` in `index.css` — an inset
top highlight (the lit edge), a hard offset shadow (the tile's thickness) and a
soft cast shadow (its distance from the page); hover lifts it, `:active` presses
it flat, `prefers-reduced-motion` keeps the depth and drops the movement. Written
as plain CSS with explicit colours rather than as Tailwind utilities, because
every `ink-*`/`slate-*` utility needs its own light-mode remap **including each
opacity variant**, and a four-layer shadow assembled from them would need four.

**IT IS `.card.kpi-btn`, NOT `.kpi-btn`, AND THE FIRST DRAFT SHIPPED FLAT.**
`html:not(.dark) .card` sets a box-shadow of its own further down the same file
at equal specificity, so source order decided it and every tile rendered as an
ordinary panel — a raised button that was not raised, with the entire sweep
green. `check:pages` resolves computed COLOUR and has never looked at a shadow.
Qualifying with `.card` puts the rule above any `.card` rule wherever either
lands in the file.

**AND THE RAISED LOOK IS ONLY ON A TILE THAT OPENS SOMETHING.** `Kpi` applies it
only where `href` is set, so the drill-down page's own four summary tiles stay
flat. A card that presses under the pointer and then does nothing is a worse lie
than a flat one — which is why the invariant is struck in BOTH directions, on two
different pages.

**THE ARITHMETIC IS ON THE PAGE THE TILE OPENS.** `drilldownFormula(d, money)` in
`drilldown.ts` returns the `FormulaDef` for a set, and `/holdings` renders it as
a card between the tiles and the table: the expression, the worked example, and
the paragraph. It sits beside the SET DEFINITION for the reason this whole file
exists — an explanation kept anywhere else drifts from the rows it explains — and
takes the money formatter as an argument rather than importing one, because every
figure here renders in the reader's selected display currency through
`fmtFromBase` and a formatter fixed in a lib prints rupees on a page showing
dollars. Same seam `auditFormulas.ts` already uses.

**IT IS STRUCK ON `d.rows`, WHICH IS THE ACTIVE FACET.** A version summed over
the whole scope reads correct on the undivided page and prints ₹710.4 Cr under a
heading saying "Private" — the caption-does-not-describe-its-figure failure the
Capital invested tile already cost this book once, arriving one click deeper. The
invariant compares the worked line against the page's OWN rendered total, and on
the private half additionally requires it NOT to equal the NAV.

**ONE OF THE REMOVED POPOVERS WAS WRONG, WHICH IS WHY NOTHING REPLACES IT.** Dry
powder's read `= Σ (Committed − Called) across funds`, and this book does not
derive it that way: Private Market's own tile says it is *"summed exactly as each
statement prints it, never derived from committed − drawn"*, because two folios
print a commitment and a drawdown and NO undrawn figure, and subtracting there
would assert a fund has nothing left to call. The page that tile opens already
carries the correct explanation beside Committed and Drawn.

**THE MONEY-WEIGHTED PAGE DOES NOT RESTATE ITS RATE, DELIBERATELY.** That figure
is a pooled XIRR over every account's dated flows, each closing on its own report
date; re-deriving it in `drilldown.ts` would be a SECOND source for one figure.
The page owns the SET — which accounts qualify, what they are worth, which 42 sit
outside — and the rate stays on the tile it was clicked from.

**SCOPED TO THE KPI STRIP.** The allocation table's per-bucket returns and its
footer still open a formula popover. That is deliberate rather than overlooked:
the footer's popover is the one place left that reconciles the money-weighted
whole-book figure against a column of return-on-cost cells — the Book performance
card that also carried it was removed in Stage 10t, and the Consolidated return
tile's went in this change. Removing the third would delete the reconciliation
this file's own "a total must tie to its own columns" rule exists to preserve.

**FIVE BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: the label underline back
on a tile, the `.card` qualifier dropped so the tiles go flat, every card raised
so a panel poses as a button, the formula card deleted, and the formula summed
over the scope instead of the facet. Two of them needed a second attempt to
reproduce, which is itself the finding — the light theme is what the sweep walks
first, so a bug introduced only in the dark rule changes nothing it can see.

### Stage 10z — THE SAME HOLDINGS, SLICED THREE WAYS

*"We should also be able to see this information: category wise (MF, direct
equity, Bonds, PMS, AIF etc), asset class wise (Equity, debt etc), my basket
definition wise (core, tactical etc). Default view will remain the current one,
category wise. Create separate filters/toggles for asset class wise and basket
definition wise."*

One set of rows, three groupings. `?group=` picks the axis, like every other
view in this app, so a slice is a link rather than an instruction. **The default
is untouched and asserted to be** — two new axes beside an old one is exactly
the change that silently moves the default, and the page would render perfectly
while showing the family a table they asked to keep.

*(THE AXIS MACHINERY HAS SINCE MOVED to `src/lib/groupAxis.ts` — Morning CIO's
allocation card groups on the same three at the family's request, and two copies
of "which section does this holding sit in" would be two chances for one screen
to file a holding under a basket the other puts somewhere else. See Stage 10ad.
Nothing below changed except where it is defined.)*

| Axis | Sections | Where it comes from |
| --- | --- | --- |
| **Category** (default) | Direct Equity · PMS mandates · ETF · Mutual Fund · AIF · Cash | `holdingBucket` — the book. Unchanged |
| **Asset class** | Equity ₹640.9 Cr · Alternate ₹28.5 Cr · Cash ₹14.1 Cr · Debt ₹5.6 Cr | the family's review |
| **Basket** | Stable Growth ₹412.7 Cr · Thematic & Tactical ₹243.7 Cr · Liquidity ₹27.5 Cr · Entrepreneurial Growth ₹5.1 Cr | the family's review — audited back against it, see Stage 10ae |

**ALL THREE SUM TO ₹710.39 Cr**, which is `BOOK_SUMMARY.totalValue` — the same
holdings rearranged, on the deduped basis the footer is on.

**THE TWO NEW AXES CANNOT BE DERIVED, AND THAT WAS MEASURED RATHER THAN
ASSUMED.** Our `AssetClass` says what an instrument IS; the family's says what
EXPOSURE it carries, and three of our five classes map to more than one of
theirs — `AIF → Equity / Alternate / Debt` (Sanshi against Baring PE against Neo
Infra), `Mutual Fund → Equity / Cash`, `ETF → Alternate / Cash` (DSP Gold
against Liquid BeES). **₹480 Cr of this book sits in those three**, so a
wrapper-based guess would misfile most of the money. Only two are safe by
definition and are derived: a company share is equity exposure under any
taxonomy, and cash is cash. `familyTaxonomy.test.ts` asserts the ambiguity
itself, so the day our own class could answer it the suite says so rather than
the map silently outliving its reason.

**AND IT IS A HAND-VERIFIED MAP, NOT A NAME MATCHER, BECAUSE THE MATCHER WAS
WRITTEN FIRST AND WAS WRONG.** It produced false positives that each filed a
real holding under the wrong basket:

```
"Motilal Oswal Active Momentum Fund"      → "Motilal Oswal Founders Fund II"
"Motilal Oswal Wealth Delphi Equity Fund" → "Motilal Oswal Founders Fund II"
"ICICI PRU BAF" (Balanced Advantage)      → "ICICI Pru India Opportunities Fund"
```

Sharing a fund HOUSE is not sharing a FUND — the index-cycled-valuation-method
failure arriving through string similarity, and invisible on screen because a
basket heading looks equally authoritative whichever rows are under it. The
depository's own abbreviations settle it in the other direction too: no
similarity measure gets from `WOC MAAF D-GROW` to WhiteOak Capital Multi Asset
Allocation Fund, and one stretched far enough to try would also match funds that
merely share a house. Every entry was read off the workbook, and then **38
adversarial verifiers — prompted to refute, and to default to refuted when
unsure — upheld all of them, with zero refutations.**

**THE WORKBOOK CARRIES THE ANSWER THREE TIMES AND THE THREE AGREE.** Four basket
sheets (the sheet a product sits on IS its basket), four asset-class sheets
(likewise), and a basket CODE column on the asset-class sheets. The code column
and the basket sheets are INDEPENDENT witnesses, cross-checked before a line of
the map was written: **33 of 33 agree, zero disagreements**, and all 82
basket-sheet products appear on an asset-class sheet. That is what earns this a
committed map rather than one reading of a spreadsheet.

*(The map has since been AUDITED back against that workbook, and the workbook is
now part of the suite rather than only its source — 57 entries, zero mismatched.
See **Stage 10ae**, which also records the three private-equity holdings this
first pass did not reach and the near misses it deliberately still refuses.)*

**THE REVIEW IS STILL NOT A SOURCE FOR FIGURES.** §"the consolidated review
workbook is not a source — by decision" is unchanged: every figure here is
still the book's own. What was taken is a CLASSIFICATION the family made, which
is the `familyInputs.ts` category — and it is committed rather than held in
`localStorage` because they supplied it as a document rather than typing it in,
the same standing `shared/sectors.mjs` has. `build-book.mjs` must never import
it, and `glowData.ts` regenerates byte-identically with it in the tree.

**A RULE FILLS GAPS AND NEVER OVERRIDES.** The family's email puts "all the
direct stocks" in Thematic & Tactical, and their workbook corroborates it on all
15 direct stocks it names, with no counterexample — so a company share the
review does not name is filed there and **tagged `rule`, never `review`**, with
the section printing how much of it was placed that way. The same sentence lists
"PMS", and their own workbook puts the **Carnelian** PMS under Stable Growth —
so that clause is deliberately NOT applied, and the suite asserts Carnelian
stays where the workbook put it. A rule with a known counterexample is not a
rule this book will apply to money.

Coverage: **₹680.9 Cr named product by product, ₹11.2 Cr by the rule, ₹21.4 Cr
unclassified** — and the unclassified is essentially one holding, Motilal Oswal
Active Momentum Fund at ₹21.4 Cr, which the 30 June review does not list.
Everything else in it is worth ₹0. That section names its cause rather than
reading "Other", which would look like a bucket the family chose.

**THE FILTER FOLLOWS THE AXIS, AND THAT IS A CORRECTNESS FIX.** Its options are
the active axis's sections, and reintroducing the bug is what proved the point:
the filter was still testing the CATEGORY key while the dropdown offered
baskets, so picking one would have matched no row and emptied the table
silently. Switching axis also clears the selection, for the same reason —
`setGroupAxis` is the only way in, so no caller can reintroduce it.

**AND THE SECTION BOUNDARY IS STRUCTURAL NOW.** `check:pages` used to find where
one section ends by matching a hardcoded list of heading NAMES, where a missing
entry is the dangerous direction: an unrecognised heading is not a boundary, so
the section above swallows every row below it. Three axes would triple that
list. Headings carry `data-section` / `data-axis` / `data-subtotal` instead —
the contract `data-mandate` and `data-row` already carry, and the same rule: a
structural claim must not depend on prose a redesign is free to reword.

**THE EXCEL EXPORT CARRIES ALL THREE AT ONCE**, as columns rather than sections:
a tab can only be grouped one way, a spreadsheet can be pivoted on any column.
They close the sheet with the other descriptors, and the suite asserts both the
order and that neither column is stuck on one constant — which is how a
defaulted field looks.

**Seven bugs reintroduced, and one of them was real.** The default axis moved,
a section dropped from the partition, a section counting rows instead of
holdings, the unclassified section losing its cause, the rule disclosure
dropped, the filter keeping the wrong "all" label, and the stale filter — each
fired exactly the right check. The stale-filter test is the one that earned its
keep: it passed at first, and finding out why exposed the live filter/axis
mismatch above.

### Stage 10aa — THE TILES ARE A LABEL AND A FIGURE, AND THE CAPTIONS MOVE

*"remove these small subtext from the clickable KPI buttons since these are also
already written inside each KPI pages."*

Stage 10y made the tile a button and moved the arithmetic to the page it opens.
The captions under each figure stayed, and they were the last chrome on the
strip. **The premise was checked line by line before anything was removed**,
which is the whole of this section: eight of the ten captions were indeed already
on the page their tile opens, and **two were not**.

| Caption | Already on the page it opens? |
| --- | --- |
| `Listed ₹358 Cr · Private ₹352.3 Cr` | yes — the facet toggle, with each half's count |
| `+ ₹47.1 L accrued income, not in this figure` | **NO** |
| `cost in · covers ₹544.4 Cr of ₹710.4 Cr` | yes — the page's own total and its share of the book |
| `60 positions worth ₹165.9 Cr carry no cost basis` | yes — the facet chip and the tile beside it |
| `134-day window · not annualised` | **NO** |
| `7 of 49 accounts · ₹110.4 Cr of ₹710.4 Cr` | yes — the lead, the total and the excluded list |
| `on capital invested · whole book` | yes |
| `cumulative, not annualised` | yes — that page's Return on cost tile |
| `undrawn fund commitments` · `cash returned to date` | yes — Private Market's own tiles |

**SO THE TWO MOVED RATHER THAN WENT.** The accrued-income disclosure is in the
`book` drill-down's arithmetic card, because a NAV that excludes accrued income
differs from a manager's printed total by exactly that and a reader reconciling
the two has to be told. The XIRR window is on `?of=measured`, **derived there
from the same flows and the same accounts the rate is struck over** — 134 days
either way, which is the two derivations agreeing rather than one copying the
other.

**THAT SECOND ONE IS STAGE 10g(ii)'s GUARD, AND IT CANNOT SIMPLY BE DELETED.**
The tile once read **+99.0%** because a 132-day return was compounded onto a
year; nothing was miscalculated and it contradicted the managers' own annualised
since-inception figures for those very accounts. `moneyWeightedReturn` refuses to
annualise a sub-year window and **the caller must say so** — the caller is now
the drill-down, which states the window, the refusal, and what compounding it
would claim.

**AN ABSENT TILE KEEPS ITS ONE LINE.** `sub` is removed only from the populated
branch. An em dash must name its cause (`Absent.tsx`), so a tile whose figure the
book does not carry still says why. On this book none are absent, which is
exactly when that distinction is invisible — so it is a check rather than a
comment.

**AND THE CHECKS HAD TO MOVE OFF THE CAPTIONS THEY WERE READING.** Seven
invariants failed and five more abstained the moment the captions went, because
`CIO_FIGURES` parsed `listed`, `private`, `no-cost` and `measured` OUT OF THEM.
Every claim survives, struck where the fact now is:

- The two gates that decide whether a missing facet toggle is a finding or an
  honest abstention (`BOOK_HAS_BOTH_HALVES`, `TILE_NAMES_COSTLESS`) read
  `glowData.ts` now instead of a tile caption. Read off the page they would have
  started abstaining silently the moment the caption was reworded — and removing
  the captions outright is precisely that event.
- Listed + Private = NAV moved to `holdings-private`, anchored on the two pages'
  own rendered totals plus the NAV the tile still prints. **Three independently
  produced figures rather than one sentence split three ways**, so a page showing
  the wrong half now fails instead of agreeing with the caption it came from.
- Costed + cost-less = NAV is the same shape on `holdings-nocost`.

**TWO OF THE NEW CHECKS COULD NOT FAIL, AND REINTRODUCING THE BUG IS WHAT FOUND
BOTH.** "What the NAV excludes is named" gated on the PAGE containing the words
"accrued income" — so deleting the sentence read as *this book has no accrued
income* and abstained; it is gated on the book now. And "a tile with no figure
still names why" required two lines, which is exactly what an unexplained
`DRY POWDER / —` renders; it requires three.

Five bugs reintroduced in total, each firing its own check: a caption back on a
tile, the accrued disclosure deleted, the window deleted, the private half
widened to the whole book, and an absent tile stripped of its reason.

### Stage 10ab — EVERY METRIC, TOTALLED FOR EACH CATEGORY

*"Show aggregate totals for every metric for each category investments."*

The Portfolio Monitor sections its holdings by CATEGORY — `holdingBucket`, the
grouping Stage 10L settled after the family reported the same thing three times
— and each section heading has carried a holding count and a market value ever
since. Everything else a reader compares categories on is a COLUMN, and the only
way to compare six categories on it was to add 85 rows by eye.

**EACH SECTION NOW CLOSES WITH A ROW THAT TOTALS ITS OWN COLUMNS.** Measured on
this book, and every figure derived rather than typed:

| Category | Invested | Market value | Weight | Unreal. P&L | Realised | Return |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Direct Equity | ₹1.22 Cr\* | ₹94.9 Cr | 13.4% | −₹22.9 L\* | +₹7 L | **refused** |
| PMS mandates | ₹124.6 Cr | ₹138.7 Cr | 19.5% | +₹14.1 Cr | +₹1.32 Cr | +11.36% |
| ETF | — | ₹24.6 Cr | 3.5% | — | — | — |
| Mutual Fund | ₹52.4 Cr\* | ₹99.9 Cr | 14.1% | −₹26,209\* | — | **refused** |
| AIF | ₹293.7 Cr\* | ₹352.3 Cr | 49.6% | +₹58.6 Cr\* | — | +19.95% |
| Cash | ₹0 | ₹0 | 0.0% | ₹0 | — | — |
| **Total** | **₹471.9 Cr** | **₹710.4 Cr** | **100.0%** | **+₹72.5 Cr** | **+₹1.39 Cr** | **+15.37%** |

\* struck over the holdings that report a cost — 9 of 37, 2 of 24, 15 of 19 —
with the uncovered value named in the cell's own hover.

**AND IT FOLLOWS THE AXIS, NOT THE CATEGORY.** Stage 10z made the table
sectionable three ways, so the partition keys on `groupKeyFor(groupAxis, …)` —
the same function the ROW build keys its section on — and the row's label on
`groupLabelFor(groupAxis)`. Keying it on `bucketFor` while the table sections on
Basket would have totalled the CATEGORY a holding sits in and printed it under
the basket's heading: every figure right, every one under the wrong name, which
is the caption failure this file already records twice.

**IT IS A ROW OF CELLS, NOT A WIDENED HEADING, AND THAT IS THE WHOLE DESIGN.** A
total belongs UNDER THE COLUMN IT TOTALS. This book has already paid twice for a
figure printed under a heading that describes something else — the allocation
footer carrying a money-weighted return in a column of returns-on-cost, and the
Morning CIO tile captioned "cost in · listed only" over a whole-book sum. The
heading keeps its name, count and size; the metrics sit where their column is.

**THE PARTITION IS OF THE POSITIONS THE FOOTER ITSELF SUMS**, so the categories
add to the Total row BY CONSTRUCTION rather than by a tolerance. Summing the
ROWS instead would tie for market value and could miss for the other two: a
consolidated row carries `mv − cost` as its P&L while the footer sums the lots'
own, and those differ the moment one security is consolidated from a costed lot
and an uncosted one. **Measured, that condition is 0 of 216 groups on this book**
— the wrong construction would tie here and no check could catch it — so it is
written down beside the code rather than tested for, and the right construction
was chosen before a drop makes the difference visible instead of after.

**A RETURN IS REFUSED WHERE THE TWO COLUMNS BESIDE IT COVER DIFFERENT SETS.**
`sumOrNull` skips a holding whose statement reports no cost, so Invested covers a
narrower set than Market value — and Direct Equity reports a cost on 9 of its 37
holdings. A return on cost there would sit between a printed ₹1.22 Cr invested
and a printed ₹94.9 Cr current and describe neither. That is the failure Morning
CIO's allocation row was already fixed for, so **the test is now
`costCoversSet` in `analytics.ts` and BOTH screens call it**: the two print a
return per bucket over the same buckets, and a test copied into each is two
chances for one screen to show a figure the other refuses for the category a
reader is comparing them on. Same reasoning as `holdingBucket` itself being one
function rather than a per-page reflex.

**AND THE HEADING'S SUBTOTAL IS NOW THE SAME FIELD THE ROW PRINTS.** It used to
walk the rows collapsing repeated `dedupeGroup`s — a correct computation, and a
SECOND SOURCE for a figure that now appears twice in one section. The two agreed
except in the by-entity view, where they would have picked different members of
the ₹1.46 Cr pair and printed marks ₹87,950 apart under one heading. One figure,
computed once, printed twice. `collapsed` is now derived as the gap between the
rows on screen and that printed subtotal, which is what its note has always
claimed.

**THE FOOTER'S WEIGHT CELL WAS EMPTY AND IS NOT ANY MORE.** A column of shares
with no total is a set of figures a reader cannot check by adding. It reads
100.0% unfiltered — the denominator IS this table's book — and less under a
company filter, which is the gap the caption below already explains.

**FOUR COLUMNS CAN NEVER HAVE A CATEGORY TOTAL, AND EACH SAYS SO.** Quantity —
shares of one company plus units of a fund is a number with no unit; average cost
and CMP — both per-unit, and a category has no unit; YTD — the same absence its
own rows carry, since no statement in this book is dated before the year began.
All four render `AbsentCell` WITH A REASON rather than sitting blank: a reader
who scans an empty cell learns nothing about whether a figure was withheld or
never existed, which is this book's founding rule arriving one row above the
footer that already keeps it.

**REALISED IS CLAIMED BY ONE CATEGORY, NEVER SPLIT.** A name's realised gain is
reported PER SECURITY across the whole book, so the categories claim each key
once, in reading order, and the sum is the footer's own union total. A name held
both directly and inside a mandate is the case that makes the rule necessary and
the case this book does not contain (zero of 175 distinct equity names); when one
arrives the cell says the figure was ATTRIBUTED rather than divided, because
there is no per-category split on any statement to divide it by.

**EIGHT INVARIANTS, EACH VERIFIED BY REINTRODUCING ITS BUG.** `check:pages` reads
the totals rows and the footer BY COLUMN — accumulating `colSpan`, because the
footer's label spans three columns and a category's spans one, and cell-for-cell
the two rows are different measurements. Seven bugs were put back one at a time
and each fired exactly its own check: a partition that skips the dedupe (three
checks), the coverage test dropped so a return prints beside two columns covering
different sets, a dash with no reason, the footer's Weight cell emptied again, a
category that quietly stops drawing its row, the section reader counting the
totals row among the holdings, and the totals keyed on the wrong AXIS — the last
of which is what found the gate hole two paragraphs down.

**THE CHECKS ARE STRUCK ON THE SECTIONS THE PAGE DECLARED, NOT ON A LIST OF
NAMES.** The first draft counted the `BUCKET_HEADINGS` that `sectionOf` could
find, which would have FAILED the asset-class and basket routes outright while
claiming to check them: those axes draw the family's own section names, which
that list does not and must not know. Matching `data-section` keys one-for-one
against `data-category-total` keys is also the stronger claim — equal counts pass
a page that totals one section twice and another not at all.

**AND THE SEVENTH BUG FOUND A HOLE IN THE GATE ITSELF.** Keying the partition on
`bucketFor` while the table sections on an axis Stage 10z added is the one
mistake this integration can make, so it was put back deliberately. The
asset-class route failed six checks — its keys overlap the category ones. The
BASKET route reported NOT CHECKED six times and **the sweep read CLEAN**: with no
key matching, every totals row disappeared, and a gate that abstained on "no
totals row captured" could not tell that from a table with one section.

That is `golden.mjs`'s rule and this file's own *"a missing toggle must be a
finding"*, arriving through a subtotal. Abstention is now allowed on exactly one
EVIDENCED condition — the page drew fewer than two sections, read off its own
`data-section` headings, which is the single-category filter where the footer IS
the total. Sections drawn and nothing totalling them is a failure, and so is a
footer that has lost its handle. Re-run against the same bug, the basket route
fails five.

**THAT LAST ONE WOULD HAVE BROKEN SIX EXISTING CHECKS SILENTLY.** The totals row
is a table row by every structural test `sectionOf` applies — a cell per column
and therefore a tab per boundary — and six invariants read `sectionOf(...).rows`
as "the holdings drawn in this section". Its Qty cell is an em dash BY DESIGN, so
"the first cell after the security name is a figure" fails on it. `sectionOf`
keeps it out of `rows` and exposes it as `total`, and a new invariant asserts the
exclusion against the rows the DOM says are holdings rather than against a count
of itself.

**AND TWO BUGS WERE IN THE CHECKER, BOTH FOUND BY THE FIGURES NOT ADDING UP.**

- **`crU` read a suffix-less figure as CRORE.** `fmtFromBase` drops the suffix
  below a lakh, so `−₹26,209` — Mutual Fund's real unrealised loss — came back as
  −₹2,620.9 Cr, four times this whole book, and the categories summed to
  −₹26,136 Cr against a printed +₹72.5 Cr. It is the plausible-wrong-number
  failure this file exists to catch, arriving in the checker rather than in the
  page. Fixed at `crU`, so every caller that allows an optional unit gets it.
- **`[+-−]` IS A RANGE, NOT THREE CHARACTERS.** Unescaped, the hyphen makes a
  range from `+` (U+002B) to `−` (U+2212) that swallows every digit and the rupee
  sign with them: the percent parser read `13.4%` as 3.4 and `100.0%` as 0, and a
  weight column summing to 30.1 against a printed 0 was the only sign of it.

**WHAT IS DELIBERATELY UNCHANGED.** Selecting a single category hides the
sections and the FOOTER is that category's total, which is complete and needs no
second row. The Excel export keeps its own footer and no per-category subtotals —
the ask was about the tab, and Stage 10n's record of the column reorder is that
the export follows when the family asks it to.

### Stage 10ac — THE ALLOCATION TABLE LOSES ITS UNDERLINES TOO

*"remove the underlines from the allocation table too."*

Stage 10y scoped the underline removal to the KPI strip and named the allocation
table as deliberately untouched, because its footer popover was the last place
reconciling the money-weighted whole-book figure against a column of
return-on-cost cells. The family have now asked for it, so that reconciliation
had to find a home before the popover could go — which is this section.

**TWO KINDS OF UNDERLINE, AND ONLY ONE OF THEM WAS A LINK.** The row labels and
`Total` were dotted-underlined `<Link>`s; the return chips were dashed-underlined
popover TRIGGERS. Removing the decoration alone would have left the second as a
click target nobody can see, so the chips lost their popovers and the labels kept
their links: **the rows are still clickable, and `check:pages` asserts both
halves** — no decoration and no `<button>` in the table, and a link on every row
that has a set behind it.

**WHERE EACH POPOVER'S CONTENT WENT.** Both were checked against their
destination before being deleted:

- **The per-bucket return** is on `?of=bucket&key=<b>`, whose formula card now
  carries the same worked example — invested, current, the return, and the
  coverage caveat — beside the very holdings it is struck over.
- **The footer's whole-book return** is on `?of=invested`, which is the page the
  Consolidated return tile opens and where that division is already worked out.
- **The money-weighted reconciliation** is on `?of=measured`, and the move made
  it SHARPER rather than merely relocating it: the footer set a whole-book
  cost-basis figure against a seven-account money-weighted one, where that page
  carries both bases for the SAME accounts — its own Return on cost tile and the
  rate the reader clicked. The sentence now names what the gap between them is,
  which is the timing of the flows and nothing else.

**AND THE FIRST DRAFT PUT A FORBIDDEN FIGURE ON SCREEN.** The bucket formula
simply divided, so Mutual Fund's card read **`−0.0% over 2 of 24`** on a page
whose own Return on cost tile correctly showed an em dash, under an allocation
row that showed one too. That is *"a refused figure stays refused one click
deeper"* failing between two surfaces of the same page. `coveredReturn` — the
0.5%-coverage test — moved out of `HoldingsBehind` into `drilldown.ts`, and both
surfaces call it: it was a private helper for as long as one page ran it, and the
moment a second surface stated a return, a second copy would have been a second
definition of "covered enough".

**THE CHECK FOR THAT COULD NOT FAIL EITHER, AND REINTRODUCING THE BUG IS WHAT
FOUND IT.** It tested the worked line for `[+-]\d+\.\d%` — an ASCII hyphen —
and the line renders a real **U+2212 MINUS**, so `= −0.0%` matched nothing and
the check read a page printing a forbidden return as one printing none. It
passed, twice, on exactly the two rows it exists for.

Three bugs reintroduced, each firing its own check: an underline back on a row
label, the rows stripped of their links, and the formula dividing regardless of
coverage.

### Stage 10ad — THE ETFs COME BACK TO THE MOVERS, AND THE ALLOCATION GETS THE FAMILY'S OWN AXES

Two asks on Morning CIO, and each is a request this file has a record of getting
half-right once already.

#### 1. *"ETFs can be a part of stocks… it should actually be stocks and ETFs. Basically, or else… separate tabs, stocks… ETF… mutual fund."*

*(**THE TABS THIS SECTION ADDED HAVE SINCE BEEN REMOVED** — the family asked for
the selectors to go and for the card to show Direct Equity alone, so the set is
back to what Stage 10t narrowed it to. See Stage 10al. Everything below is kept
because the reasoning about CAPTIONS is unchanged and still governs the card:
each one states what its figure covers, and the tile label, the coverage line,
the index sentence and the excluded footer read the set rather than a literal.
What is gone is only the control that let a reader change it.)*

**THE CARD'S OWN HEADER COMMENT HAS QUOTED THE ANSWER SINCE THE DAY IT WAS
WRITTEN.** The request that built Today's movers was *"MY STOCKS AND ETFS are up,
Sensex is down this much, Nifty"*; Stage 10t then narrowed the card to
`DIRECT_EQUITY_BUCKET` and the ETFs went out with the mandate names. That
narrowing was RIGHT about the mandates — a share Carnelian picked is not a
holding the family chose — and wrong about the ETFs, which the family have now
said. An ETF bought in the family's own demat is a holding they chose, priced by
the same feed, on the same session as the shares beside it. Nothing about
combining them mixes two measurements, which is the test that matters.

**SO THE DEFAULT IS BOTH AND THE CONSTITUENTS ARE TABS** — `Stocks & ETFs` ·
`Stocks` · `ETFs` · `Mutual funds` — which delivers both halves of that sentence
rather than picking one. Each scope is a set of `holdingBucket` keys, the same
function the allocation table and the Portfolio Monitor group on, so a tab here
and a row on the allocation table cover exactly the same holdings. That is also
why an ETF held INSIDE a PMS mandate is not in the ETF tab: the manager chose it,
so it belongs to the mandate exactly as a manager-picked share does. The scope
lives in `?movers=`, so a tab is a link.

| Tab | Names | Priced by the fixture |
| --- | ---: | ---: |
| Stocks & ETFs — default | 40 | **36** |
| Stocks | 37 | 33 |
| ETFs | 3 | 3 |
| Mutual funds | 20 | 1 |

**EVERY CAPTION MOVES WITH THE SCOPE, AND THAT IS NOT COSMETIC.** The tile label,
the coverage line, the index comparison and the excluded footer each state what
the figure covers; a caption that widens or narrows a figure it does not is the
failure the Capital invested tile already cost this page once. `subject` and
`verb` ride on each scope because these are SENTENCES — "Stocks and ETFs **are**
−0.2% against the Nifty 500" — and a label interpolated into one has to agree
with the verb after it.

**THE MUTUAL-FUND TAB'S ABSENCE IS ABOUT THE INSTRUMENT, NOT THE FEED**, and it
says so. A fund unit has no NSE trading symbol and the quote feed is keyed on
one, so 19 of the book's 20 schemes can never be priced intraday — told the
generic "no live quote" reason a reader goes looking for a feed fix that cannot
exist. What a scheme DOES publish is one dated NAV per business day struck after
the close, and printing that under a heading reading "today" would set one day's
move beside another's; the tab names where that figure actually lives (each
fund's own page, Stage 10s) rather than substituting it.

**THE FIRST DRAFT'S ABSENCE SENTENCE WAS AN ABSOLUTE AND WAS FALSE.** It read "no
scheme in this book can be priced intraday, today or on any other day" — and the
depository files one Liquid BeES row as a Mutual Fund, which resolves `LIQUIDBEES`
and prices like any listed instrument. The sentence takes the MEASURED counts now
(`19 of the 20 schemes here resolve to none`), which is the same discipline the
rest of this file applies to a premise nobody rechecked.

**AND THE COVERAGE LINE STATES A VALUE, NOT ONLY A NAME COUNT.** `scopeValue` was
already computed in that card's model and rendered nowhere — this book's
most-repeated defect — and the mutual-fund tab is what made it matter: one scheme
of twenty is priced and it is worth ₹18,822 against a ₹99.9 Cr scope, so "1 of 20"
and "₹18,822 of ₹99.9 Cr" disclose the same fact very differently. The second is
the one a reader needs beside a percentage printed at 22px. Every tab now reads
`on ₹X of the ₹Y held, across N of M … names`.

(*"1 GAINERS"* was on the family's own screenshot of this card and is fixed in the
same change: a scope tab makes a one-name list an ordinary outcome.)

#### 2. *"I have given you my baskets… how is the core doing, how is the satellite portfolio doing, how is the liquidity portfolio doing. This should be the Morning CIO page. Add a selector in the allocation section to select asset class wise / category wise / basket wise allocation and performance overview."*

This is Stage 10z arriving on a SECOND SCREEN. The Portfolio Monitor grew those
three axes and owned them privately; Morning CIO's allocation card now groups on
the same three, and two copies of "which section does this holding sit in" would
be two chances for one screen to file a holding under a basket the other puts
somewhere else — the failure `holdingBucket`, `costCoversSet` and
`accountHasOpeningValue` were each extracted for, arriving a fourth time.

**SO `src/lib/groupAxis.ts` IS THE ONE PLACE, AND BOTH PAGES IMPORT IT.** The
section key per axis, its source, its reading order, its heading, the category
order and the filter's "all" label all moved there verbatim; `PortfolioMonitor`
lost 64 lines net and gained no behaviour. Measured on this book, all three axes sum
to `BOOK_SUMMARY.totalValue` **to the rupee**:

| Category | | Family asset class | | Basket | |
| --- | ---: | --- | ---: | --- | ---: |
| AIF | ₹352.3 Cr | Equity | ₹640.9 Cr | Stable Growth | ₹412.7 Cr |
| PMS mandates | ₹138.7 Cr | Alternate | ₹28.5 Cr | Thematic & Tactical | ₹243.7 Cr |
| Mutual Fund | ₹99.9 Cr | Not classified | ₹21.4 Cr | Liquidity | ₹27.5 Cr |
| Direct Equity | ₹94.9 Cr | Cash | ₹14.1 Cr | Not classified | ₹21.4 Cr |
| ETF | ₹24.6 Cr | Debt | ₹5.55 Cr | Entrepreneurial Growth | ₹5.08 Cr |
| Cash | ₹0 | | | | |

**NOTHING ABOUT THE ARITHMETIC CHANGES WHEN THE AXIS DOES.** Invested, Current,
Return and Weight are the identical sums over the identical holdings on every
axis, so the footer, the weight base and the cost-coverage refusal needed no
branch of their own and stay correct by construction. In particular **a return
refused on one axis is refused on all three**: `costCoversSet` is what decides
it, and Stable Growth's Invested covers ₹391.5 Cr of its ₹412.7 Cr, so its Return
is an em dash for exactly the reason Direct Equity's is. That is the honest answer
to "how is the core doing" and it is the same answer the Portfolio Monitor's
per-category totals row gives — which is the point of the two screens sharing one
test rather than each carrying a copy.

**THE DEFAULT IS UNCHANGED AND IS ASSERTED TO BE.** Two new axes beside an old one
is exactly the change that silently moves a default, and the page would render
perfectly while showing the family a table they asked to keep.

**THE TITLE, THE COLUMN HEAD AND THE PILL'S NOUN ALL FOLLOW THE AXIS.** A table of
BASKETS headed "Allocation by asset class & mandate" is the
caption-does-not-describe-its-figure failure this page has already paid for twice,
and "6 buckets held" over a table of baskets would be wrong about what it counted
— but the COUNT inside that pill is not chrome (two invariants read it), so
`groupCount` supplies the noun per axis rather than the caption being rewritten.
The category title is left exactly as it was: it predates the regroup and is not a
perfect description of that axis, but it is the heading the family has learnt.

**AND EVERY ROW STILL OPENS THE HOLDINGS BEHIND IT.** `?of=basket&key=…` and
`?of=family-class&key=…` are scopes of their own rather than a `bucket` address
carrying an `axis=` param, because the three axes answer different questions and
the address should say which — and every existing `?of=bucket` bookmark keeps
meaning what it meant. `AXIS_SCOPE` is the one place the axis picks the scope, so
a link built on the page and a set resolved in `drilldown.ts` cannot name
different things. An axis a reader can select but not open would be a table of
totals with no way in, which is the state `/holdings` was built to end.

**WHOSE JUDGEMENT IT IS, IS ON THE CARD.** A basket and the family's own asset
class are derivable from no statement in the archive — they are the family's
consolidated review, product by product, plus one rule they stated themselves —
and on screen a section heading looks equally authoritative whichever put the rows
under it. So a family axis states its provenance and names the **₹11.2 Cr placed
by the rule** rather than by the review, exactly as the Portfolio Monitor's
section headings do. A holding their review does not place gets its own row that
says so, in the family's absence-names-its-cause form, never "Other".

**A FUND-OF-FUNDS ROW CARRIES NO FAMILY TAXONOMY AND IS MARKED.** Those come from
`privateMarkets.*` — fund-level records rather than positions — so `groupKeyFor`
has nothing to key them on and a review that classifies PRODUCTS names none of
them. Every one is empty in this book, so none renders; the marking is what keeps
a row under a table of BASKETS from ever reading as a basket the family chose.

**THE TWO BIGGEST BASKETS TOOK COLOURS FROM OPPOSITE ENDS OF THE PALETTE**, after
the first cut drew them as two champagne shades and the donut read as one wedge
covering 92% of the NAV.

#### Eight bugs reintroduced, and two of them were bugs in the CHECKS

Each was put back one at a time, rebuilt and swept. Six fired immediately; the
two that did not are the point of doing it:

- **`/ETFS · TODAY/` IS SATISFIED BY "STOCKS & ETFS · TODAY".** Pinning the
  tile's label to the default scope while the tab beside it narrowed — precisely
  the bug that check exists for — left the sweep GREEN. A caption claim has to be
  struck on the whole caption; it is anchored to the start of its own line now.
- **AN UNRESOLVED DRILL-DOWN ADDRESS PASSED EVERY GENERIC CHECK.** The two new
  `/holdings` routes take the address the axis routes drew; unresolved, the walk
  lands on `/holdings`'s own not-found page, which has no console error, no
  overflow and no stray zero. They now assert they OPENED something and that its
  market value reproduces the very cell a reader clicked — and a missing address
  is a FAILURE rather than an abstention.

The six that fired on the first attempt: the default movers scope dropping the
ETFs (the `cio-live` gainer count, derived per scope from the book), tabs that
render but filter nothing, the allocation card's default axis moving, a family
axis's rows all pointing at the CATEGORY scope, the unplaced row losing the
sentence naming its cause, and a section quietly dropped from the partition.

**THE ALLOCATION TABLE IS FOUND BY `data-alloc-table` NOW, NOT BY MATCHING "ASSET
CLASS" IN ITS HEADER.** That header is the family's own word for the active axis
on two of the three routes, so the old finder returns nothing there and every
invariant struck on it would have ABSTAINED rather than failed. Its cells are
read off the DOM for the same reason the Monitor's are: a section the review does
not place carries a second line in its label cell, and the page-text parser picks
that row up under the disclosure sentence instead of its own name — figures
unchanged, which is exactly why it would go unnoticed.

**AND THE PARTITION BOUND IS THE PAGE'S OWN PRINTING PRECISION, REPRODUCED.**
Every cell renders to one decimal in Cr, so n rows against a printed footer carry
(n + 1) half-digits of rounding: the family's asset-class rows sum to ₹710.35 Cr
against a printed ₹710.4 Cr on figures that tie to the rupee underneath. A
missing or double-counted row moves it by whole crores and still cannot pass.
That is a bound derived from what the page prints, never a tolerance widened
until the figures fit.

**THE ABSENT-STATE PROBES TAKE ANY NOUN NOW.** `No <scope> holding carries a day
change` is the movers card's settled-absence line and its noun moves with the
tab. The previous attempt at this enumerated the spellings — and lapsed the moment
the ETFs came back — so the pattern is anchored on the two ends of the sentence
instead.

### Stage 10ae — THE TAXONOMY IS AUDITED AGAINST THE WORKBOOK, AND THE WORKBOOK IS NOW THE TEST

*"make sure the basket as well as asset class categorization is correct and
matching as per the consolidated excel sheet information … do an audit and make
everything matching as per the classification provided in this excel sheet."*

Stage 10z built `familyTaxonomy.ts` by reading the family's consolidated review
and hand-verifying every line. This is that map audited back against the same
document, product by product — and the headline finding is that **the
classifications were already right**: 54 entries, 53 baskets and 53 asset
classes witnessed by the workbook, **zero mismatches**. What the audit found
instead were a broken CITATION, three holdings the review names and the map had
not reached, and — the part worth keeping — that nothing in the repo could have
told us any of that.

**THE WORKBOOK IS A TEST NOW, NOT ONLY A SOURCE.** `familyTaxonomy.test.ts`'s
eight existing sections assert the map is INTERNALLY sound: no dead keys, a
total partition on both axes, the rule as a fallback. Not one of them can see a
well-formed entry that files a real holding under the wrong basket — which is
the most dangerous defect this map can carry, because **a basket heading looks
exactly as authoritative whichever rows sit under it.** So the suite now reads
the committed workbook and holds every entry to the row it cites. That is
`review-reconcile.mjs`'s standing, applied to a map instead of to the book: an
independent cross-check against the family's own document, never a second source
the app reads at runtime. The workbook is TEST-ONLY — nothing under `src/pages`
may import `xlsx`.

**AND IT IMMEDIATELY CAUGHT A CITATION NOBODY COULD FOLLOW.** One entry read
`reviewProduct: "Motilal Oswal Founders Fund  II"` — a **DOUBLE SPACE**, which
matches no row in the family's document. The classification (Stable Growth /
Equity) was correct and the citation was unverifiable, and `reviewProduct` exists
for exactly one purpose: *"any one of these can be challenged against the
family's own document."* A citation that resolves to nothing is that field
failing silently, and it is invisible to every check that reads only the map.

#### Three holdings the review names, and what licensed each join

The review's `Private Equity ₹136.16 Cr` is ONE aggregate line on the Alternate
sheet — this file already records that the reconciler has to carry it as a block
with no custodian to ask. **It IS itemised**, on the workbook's own `Private
Investments` tab, corroborated row for row by `Private Equity Excl Pre IPO`, and
three of those rows are holdings this book carries. All three are Entrepreneurial
Growth / Alternate, on no basket sheet, so there is no second answer to weigh:

| Holding | Book value | Review row | Why the join is safe |
| --- | ---: | --- | --- |
| `BOROSIL RENEWABLES LIMITED - WARRANTS 13AG26` | ₹70,754.50 | `Borosil Renewables` ₹3.75 Cr | the ARITHMETIC — see below |
| `BLUE ASHVA VARENYA FUND - BAVF-SER20-C6` | ₹98,742 | `Blue Ashva Varenya Account` ₹0.02 Cr | the distinguishing word |
| `EVEREST FLEET-EQ1/` | ₹580 | `Everest Fleet Private Ltd - SIDDHARTH LADSARIYA` | an exact company name |

**THE WARRANT IS THE ONE THIS FILE ALREADY FORBADE JOINING BY NAME.** *"a
Borosil WARRANT against the Borosil EQUITY, which must never be joined"* — and
this book holds BOTH: 11,495 Borosil Renewables SHARES inside two PMS mandates,
and 283,018 WARRANTS in the ICICI NSDL demat. On the name they are
indistinguishable. On the arithmetic they are not:

```
₹3,74,99,885 ÷ 283,018 warrants = ₹132.5000 each   and   ₹132.50 × 4 = ₹530.00
```

— the 25% upfront an Indian preferential warrant allotment is subscribed at,
reproduced to the rupee. **The quantity is the witness**, which is the standard
`dropDepositoryDuplicates` and `costFor` already hold a join to. The
mandate-held shares belong to their mandate's own product and never reach this
map. That is the difference between a name matcher and a reading: the caution
stands and this join is licensed by evidence the caution was written for the
absence of.

**TWO BLUE ASHVA VEHICLES ARE IN THE REVIEW and only one is in this book** —
`Blue Ashva Varenya Account` (₹0.02 Cr) and `Blue Ashva India Pool Account`
(₹3.74 Cr). The demat holds BAVF-SER20-C6, whose own name carries VARENYA.
Matched on "Blue Ashva" there would have been two candidates and no way to
choose; the earlier normaliser missed the row entirely, which is the safer of
the two failures and still a failure.

**WHAT MOVED IS ₹1.70 L, AND THE POINT IS NOT THE MONEY.** Entrepreneurial
Growth ₹5.07 → **₹5.08 Cr** (3 → 6 rows), Alternate ₹28.44 → **₹28.46 Cr**, and
the basket axis's unclassified section loses the Blue Ashva row. All three axes
still sum to `BOOK_SUMMARY.totalValue` to the rupee. Two of the three also move
on the ASSET-CLASS axis from `Equity` to `Alternate`, which is derivation being
overridden by the review — an unlisted company's shares and a preferential
warrant are private capital that happens to sit in a depository account, and
`familyAssetClass` consults the map before it derives anything. Check 7 now
measures that: `Equity → Equity/Alternate`.

#### The tab fills a gap and never overrides, and the workbook itself is why

Two `Private Investments` rows — `M/S Grand Continent Hotels` and `Parth
Electrical & Engineering` — **also sit on the live `Thematic,Tactical` sheet**,
with real figures whose share counts tie to this book exactly (262,125 and
59,000), while their private rows are **₹0** and Parth's carries the remark
*"Listed in Aug'25"*. The family moved both out of private capital when they
listed. Read the tab as authoritative and it drags them back, refiling ₹5.31 Cr
of listed equity as Alternate. So the live sheets are read FIRST and the private
tab writes only into a gap.

**THE FIRST DRAFT ENFORCED THAT TWICE AND ONE OF THE TWO WAS DEAD.** A
`cost === 0` guard skipped the zeroed stubs explicitly — and the reader is
first-writer-wins, so the guard could never fire. Removing it changed nothing,
which is how it was found: **reintroducing the bug produced a clean run.** A
branch that documents a rule it does not enforce is the
dead-code-that-looks-alive failure this file keeps naming, so it is gone and the
LOOP ORDER is what the suite asserts instead — the contested products are
listed, the live sheet must win on each, and swapping the loops fails four
checks by name.

#### What the review names and the map deliberately does NOT join

Each is a near miss LISTED rather than committed, which is the rule
`shared/nameMatch.mjs` already holds for the register reconciler:

- **`EMA Preferred Shares`** (₹0.46 Cr) against this book's `EMA PARTNERS INDIA
  LIMITED - EQ NEW FV RS 5/` (₹0.37 Cr). PREFERENCE shares are not the EQUITY,
  and this file already names that exact pair as a near miss a human must
  commit. The equity falls to the direct-stock rule, which is where the review's
  own `Direct Equity - Non MO` block — coded **TT** — puts the demat's direct
  holdings anyway, so the answer on screen is unchanged and now corroborated.
- **`National Stock Exchange`** (Stable Growth / Equity, ₹41.5 Cr on 200,000
  shares). This book's ICICI NSDL statement carries 125,000 of them at an implied
  **Re 1.00** — a PAR row, so it carries its quantity and NO market value and is
  not in `BOOK_POSITIONS` at all. An entry would match no holding and fail the
  map's own no-dead-entries check. The answer is recorded for the drop that first
  values it.
- **`SKS Fastener`, `Incred Holdings`, `Swapeco Solutions`, `Aksum Trademart`,
  `EDUGORILLA`, `Blue Ashva India Pool Account`** — private investments this book
  carries no valued position for, by the same par/quantity-only rule.

**AND `Motilal Oswal Active Momentum Fund` ₹21.42 Cr IS GENUINELY ABSENT** from
the whole workbook, checked across all 25 tabs rather than assumed: the review is
drawn 30 June 2026 and that folio's statement is dated 6 August. It is 3.0% of
the book and it is the whole of the unclassified section on both axes. That is a
stale review, not a gap in the map, and the section already names its own cause.

**FIVE BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: the double space back in a
citation, Carnelian refiled as Thematic & Tactical, the private-equity tab read
first, the asset-class sheets read from the wrong column (which fired the
can't-pass-by-matching-nothing gate at `57/5 of 57`), and the workbook moved out
from under the suite.

### Stage 10ag — WHAT THE FAMILY DID, AND WHAT EACH TRANCHE OF IT EARNED

Two asks, one source, and the source had been in the archive since the first
drop with nothing reading it.

*"in transactions we need to see the transactions we have done, not what the
transactions the portfolio manager has done… and then if we click and open the
drill down page of one AIF/PMS then inside that we should see what all
transactions the portfolio manager of that fund has made."* And: *"VC… I
invested additional 10 crores… previous amount… what was the return? Now this 10
crores… what it has done what's the overall portfolio return."*

**THE ARCHIVE CARRIES BOTH RECORDS AND ONLY ONE WAS EVER READ.** `transactions`
is the manager working a mandate — Green Lantern buying The Anup Engineering on
fifty days. `cashFlows` typed `contribution` or `withdrawal` is the family
putting money IN, and `loadTransactions` had never touched it. Measured across
the corpus: **20 dated contributions totalling ₹193 Cr across 10 accounts**, and
94 withdrawals totalling ₹2.86 L. That is the decision the family actually
makes, and the card that exists to show their transactions was showing somebody
else's.

#### The amount column is a RUNNING BALANCE on the row that carries the units

The single most dangerous thing in this delivery. Sanshi prints one
contribution as THREE rows on one date, and the third is a cumulative total in
the same column the others print a movement in:

```
17-06-2025  Drawdown                                        1,00,00,000.00
17-06-2025  Stamp Duty @ 0.005%                                   (499.98)
17-06-2025  Units Allotment  109.4462  91,364.524  1,91,359.524  1,99,98,999.97
```

All three are typed `contribution` in the archive. **Summing them reports ₹44 Cr
of investment into a folio that received ₹22 Cr** — and every row looks right:
same kind, same date, a plausible rupee figure, nothing failing anywhere. It is
the plausible-wrong-number failure this book exists to catch, arriving through a
column heading nobody had read.

So a move's `amount` is the GROSS row the statement prints on that date, which
is a primitive needing no arithmetic, and `invested` is that less the same
date's printed charges. **The balance is the WITNESS rather than the source**,
and three things agree on this corpus, each measured before a line was written:

```
Σ invested       = the position's own costBasis      TO THE PAISA
Σ invested       = the last printed Balance Amount   within ₹0.04
invested ÷ units = the Allotment NAV the statement prints to 4dp
```

`costBasis` reaches the book from the fund's HOLDINGS table and the tranches
from its TRANSACTIONS table — two readers over two regions of one statement — so
their agreeing is a real cross-check and not a figure compared with its own
copy. A date carrying an allotment row and NO gross row is unambiguous only
where the account has exactly ONE such row (a balance after a single
contribution IS that contribution); with several and nothing to check against,
`amount` is null and says so. **An account whose running total does not
reproduce is withheld entirely, with the reason** — differencing a sequence that
might not be cumulative is how the ₹44 Cr gets invented.

#### Ask 1 — My investments, and the manager one level down

`BOOK_CAPITAL_MOVES` is the family's own dated capital; `capitalRollup` in
`src/lib/tranches.ts` puts one line per account on the Transactions card, which
now DEFAULTS to it. **Lumpsum or staggered is a COUNT, not a detector** — one
dated contribution is a lumpsum, more than one is not. No cadence, no tolerance,
no minimum, which is `txnRollup`'s own reasoning arriving at a question the
family asked in exactly those terms.

The manager's own dealing keeps its tab AND sits inside the MANDATE drill-down,
which is where the ask puts it. `ManagerTrades` reuses `rollup` rather than
reimplementing it, so the two surfaces cannot disagree about what a manager did.

*(IT WAS ALSO RENDERED ON THE FUND BRANCH, WITH ITS OWN WORDS, AND BOTH HAVE
SINCE BEEN REMOVED — see Stage 10ai.* The reasoning is kept because it is what
had to be re-measured before removing it: **Buoyant Capital 103473 is an AIF
folio that DOES issue a transaction statement**, the one non-mandate account in
this book that does, and hiding a manager's whole record behind a routing
decision about what the account is called would have been a real loss. And the
title followed the route, because Buoyant's statement prints `Buoyant
Opportunities Strategy — Class A4, ₹25 Cr` — the FAMILY subscribing for units,
not Buoyant trading — so *"What the manager traded"* over those rows asserts
something that did not happen. What Stage 10ai measured is that Buoyant is not a
My-investments row at all, so that card was never the way into its dealing; the
**By manager** tab is. *The removal is asserted rather than assumed.)*

#### Ask 2 — each investment separately, and why UNITS are the whole of it

A tranche's value today is ITS OWN units at today's NAV. Split a position's
value across its contributions by SIZE instead and every tranche reports the
same blended return — **which is precisely the figure the family asked to have
broken apart.** Ankita's Sanshi folio bought at 100.00 in March and 123.84 in
October, so the March rupee is worth 24% more than the October one:

| Bought | Entry NAV | Invested | Value today | Return |
| --- | ---: | ---: | ---: | ---: |
| 21 Mar 2025 | ₹100.0000 | ₹1.00 Cr | ₹1.62 Cr | +61.6% → **CAGR 39.50%** |
| 17 Jun 2025 | ₹109.4462 | ₹1.00 Cr | ₹1.48 Cr | +47.6% → **CAGR 38.34%** |
| 3 Sep 2025 | ₹121.6322 | ₹10.0 Cr | ₹13.3 Cr | **ABS 32.83%** |
| 6 Oct 2025 | ₹123.8393 | ₹10.0 Cr | ₹13.0 Cr | **ABS 30.47%** |

So `BOOK_POSITION_TRANCHES` is **gated on the allotted units accounting for
EVERY unit held** — the same gate `costFor` and the ST/LT split already apply,
and it holds EXACTLY on all seven positions that publish one. Three consequences
make the panel checkable rather than merely plausible: Σ units = the position's
quantity (the gate), Σ value = its market value, Σ invested = its cost basis. The
footer reconciles to the row it expands from **by construction**.

**THE RETURN GOES THROUGH `holdingReturn`, NOT A SECOND RULE.** A tranche is the
one thing in this book with a real purchase date, so it is the one place a
genuine CAGR is strikable — and exactly where compounding a four-month window
onto a year would be most tempting. A year or more annualises, anything shorter
stands as the absolute figure and is TAGGED, so Stage 10g(ii)'s guard lives in
one place still and `positionIrrPct` stays unread.

**AND THE TABLE IS HANDED THE ROW'S OWN DEDUPED POSITIONS.** Keyed on
`securityKey` it would union Transition Venture Fund I across both family
trusts and offer 15,000 units against a row printing 7,500 — while every
within-panel check still reconciled, because footer and rows would double
together. §"consolidated counts once, per-account does not", arriving through a
drill-down. Where a row spans several folios the panel names the HOLDER on every
line: two members contributed on the SAME DAY under the SAME label, and without
it those read as one decision printed twice at different sizes.

#### What is absent, counted rather than claimed

**7 of 371 positions** open a contribution history, **2 bought over more than
one date**; **10 of 51 accounts** publish any dated capital record at all. The
managed mandates issue a capital-account ledger rather than unit allotments, and
a depository records what is held and never what was paid for it. Both surfaces
COUNT that rather than asserting coverage, and a row with no breakdown draws no
chevron — an affordance that opens nothing is worse than none.

**A RETURN NEEDS THE DENOMINATOR TO BE COMPLETE, AND TWO THINGS ESTABLISH IT.**
Either every position in the account is unit-tied, or the account's own printed
**inception date is on or after its first contribution** — the statement saying
its record starts where the account does. Measured: seven qualify by units and
three by inception, EXACTLY (SVAN's and Green Lantern's inception dates equal
their first contribution to the day). An account meeting neither keeps its
figures and loses its return, with the reason on the cell.

#### Nine bugs reintroduced, and THREE of them exposed defects in the checks

- **The set-size test for a blended split could not fail.** A return cell reads
  `CAGR39.50%`, so comparing cell TEXT made two rows differ whenever their TAGS
  differed — and a size-weighted split passed happily while every tranche within
  an account reported the identical percentage. The real claim is MONOTONICITY:
  within one panel every tranche is the same fund at the same NAV today, so
  return is a strict function of entry NAV. Cheaper entry must show the higher
  return, and two contributions at the SAME entry NAV must show the SAME return
  — which this book exercises, two members having bought at 109.4462 on one day.
- **The entity check excused itself.** It read `head.includes("entity")` — it
  asked the page whether it had drawn the column and passed when it had not, so
  deleting the column left the sweep green. Gated on the BOOK's own count of the
  folios behind the largest history now.
- **And the return-coverage note was a tautology**, both sides reading the same
  flag. Worse, **this book cannot exercise that gate at all**: all ten funded
  accounts pass it, so a working gate and a deleted one draw the same ten
  returns. That is recorded here rather than papered over, and the gate is
  exercised in `tranches.test.ts` on constructed inputs — the only place it can
  be.

The six that fired first time: the default view back to the manager rollup
(7 checks), the running-balance trap (7 in the suite, cost basis exactly
doubled), a truncated panel (4), a footer computed independently of its rows,
the staggered label pinned to a literal, and a dedupe pair counted twice.

**AND ONE LIGHT-MODE REMAP WAS MISSING, FOUND BY A ROUTE THAT CLICKS.**
`hover:text-champagne-400` had no `html:not(.dark)` rule — only the base class
and the `group-hover` variant did — so a hovered control came back at `#ecdcae`
on white. The sweep had never caught it because nothing in it hovered one; a
route that CLICKS a toggle leaves it hovered. It covers the Entities pill and
the mandate links too, which have carried that class all along.

### Stage 10ai — A HOLDING OPENS THE SAME WAY EVERYWHERE, AND THE TRANSACTIONS PAGE STOPS OFFERING AN EMPTY ONE

Three asks, and the first two are the same request seen from either end: the
Transactions card was offering a way OUT of itself that led nowhere, while the
Holdings table was refusing one that led somewhere.

#### 1. *"remove the drill down pages for transactions page in portfolio monitor… since they're empty"*

Stage 10ag put a link on each My-investments row, on the reasoning that the
chevron opens what the FAMILY paid in and the name opens the mandate, where the
MANAGER's dealing is. That reasoning was right about a mandate and wrong about
this card, and the difference is measurable rather than aesthetic: **seven of its
ten rows are FUND FOLIOS** — the five Sanshi accounts and both Transition Venture
trusts — and `/mandate/:accountId` for one of those can only say it is not a
mandate and draw an empty dealing card underneath. The family screenshotted
exactly that page.

**THE LINK IS GONE AND THE THREE PMS ROWS LOSE NOTHING.** Their pages are still
reached from Holdings, Family & Entities, a company page and every holdings
drill-down — and every one of those links is gated on `isMandateHeld`, so none of
them could ever route a fund folio there. That is why `check-pages.mjs`'s own
comment beside the `mandate-fund` route says nothing in `src/` links to it: the
sentence was true, went false for one release, and is true again.

**AND THE DEALING CARD CAME OFF THE FUND BRANCH WITH IT.** It was put there
because **Buoyant Capital 103473 is an AIF folio that DOES issue a transaction
statement** — the one non-mandate account in this book that does — and hiding a
manager's whole record behind a routing decision would have been the "reason
expired" failure. Measured before removing it: Buoyant is **not a My-investments
row at all** (it publishes no dated capital record), so this card was never the
way into its dealing; the **By manager** tab is, and that covers all ten accounts
whose statements the tape reads. For the other six fund folios the card was an
empty box under an empty page.

`ManagerTrades` then had ONE caller, on the mandate branch, so
`holdingRoute(...) === "mandate"` was true every time it was asked — a title, an
absence and a footer sentence that could not be reached, each wearing a confident
explanation. All three collapsed to the mandate case; the words for the fund case
are recorded in the note where that call used to be, not left standing as code
nothing runs.

**BOTH DIRECTIONS ARE CHECKED, AND NEITHER IMPLIES THE OTHER.** `mandate` asserts
the card IS there; `mandate-fund` asserts it is NOT, on all three of its strings
— a build that dropped it everywhere passes the second, one that kept it
everywhere passes the first. Verified by reintroducing each.

#### 2. *"remove the highlighted text from the dashboard UI"*

The paragraph under the My-investments table. Checked line by line before
anything was deleted, which is the whole of this entry, because **one of its five
claims was nowhere else on the page**:

| The claim | Elsewhere? |
| --- | --- |
| "These are the family's own movements, not their managers'" | yes — the tab is called My investments, the columns are Paid in / Taken out, and each expanded row says it |
| **"10 of this book's 51 accounts publish a dated capital record"** | **NO** |
| "Value today is the account's own market value from the book" | no — a BASIS, and it moved |
| "A return is struck only where the contribution list provably reaches inception — 10 of 10" | the CONDITION moved; the per-row case was already on the cell |
| "see By manager, or open the mandate itself" | chrome, and its second half was about to become false |

**"10 OF 51" IS ON THE TOTAL NOW, WHERE THE MISLEADING FIGURE IS.** Read as
"Total · 10 accounts", ₹193 Cr is the whole of what this family has put in. It is
not — 41 more accounts were funded and no statement in this drop says when — so
the denominator sits on the label that total is printed against, with the reason
in its hover. A caption is chrome; a COUNT inside one is not.

**THE TWO BASES MOVED TO THE COLUMNS THEY DESCRIBE.** What a column means belongs
on the column, so Value today, Gain and Return each carry their own definition,
and the per-row `AbsentCell` reason stays exactly where it was — which is the
STRONGER claim, because a page-wide fraction tells a reader nothing about the row
they are looking at.

**AND `capitalTotals` LOST ITS `measurable` COUNT.** It existed for that one
caption and had no other reader. A totals field nothing renders is the
dead-code-that-looks-alive failure this file keeps naming, so it went with its
caller — and `tranches.test.ts` **asserts the removal** rather than deleting the
case alongside it, keeping the two constructed cases that give the gate meaning.

#### 3. *"just like how you have show individual investments return in the drop down for securities you need to implement the same for category/asset class/basket as well"*

**THE ROW WAS ALREADY THE SAME ROW; ONLY ITS EXPANSION WAS AXIS-DEPENDENT.** A
grouping axis decides which SECTION a holding is filed under and nothing else —
`groupKeyFor` is the whole of it — so the per-account panel `venues` had no
business being computed only when `?group=security`. On Category, Asset class and
Basket the name cell drew **no chevron at all**, and the older per-ENTITY panel
underneath could be reached only from an "N entities" pill at the far right end
of the row, past the horizontal scroller.

`venuesOf(ps, accIdx)` now runs on every consolidated row. Measured: **75 rows on
a non-security axis, 12 held through more than one account, 90 statements behind
them.**

**AND IT REPLACES THE OLD PANEL RATHER THAN SITTING BESIDE IT, BECAUSE THE OLD
ONE WAS WRONG WHERE THE TWO DIFFERED.** `entityParts` was built from the
**DEDUPED** positions while the pill offering it counted the **RAW** ones — so
Transition Venture Fund I, held by two family trusts and reported by both, showed
a pill reading "2 entities" over a table of ONE row. §"a consolidated figure
counts each `dedupeGroup` ONCE; a per-account or per-owner figure does not",
failing inside a drill-down. `venuesOf` lists every statement as printed and
NAMES the overlap. `EntityPart`, `entityParts` and the `parts` field are deleted,
not left exported and uncalled.

**AND THE PANEL'S LEAD SENTENCE WAS CONTRADICTING ITSELF, WHICH ONLY SHOWED UP
BECAUSE THE CHECK WALKED THE HARD ROW.** It read *"— ₹1.71 Cr, 0.24% of the book,
held ₹3.43 Cr through 2 fund vehicles"*: the head of the sentence on the deduped
basis and the route split three words later on the printed one. The
reconciliation under the table was correct and three lines too late — a reader
stops at the first sentence, and two figures for one holding a clause apart is
the contradiction the footer rule already names. The clause now says so inline,
and only where the two really differ.

#### Thirteen bugs reintroduced, and THREE were defects in the checks

- **The market-value reconciliation waived itself.** It passed on
  `/reported under two accounts/` — so the panel's own overlap sentence became an
  ESCAPE, and a panel that dropped a line kept printing it and reconciled with
  nothing. Truncating the lines proved it: the count check fired and this one did
  not. It parses that sentence's three figures now and holds each to what is on
  screen — the lines add to the figure it claims, the row is the figure it says
  the row is, and the overlap is the difference.
- **A claim about a COLUMN was read off a page-wide title list.** Stripping the
  condition from the Return head left the identical sentence on Gain, so the
  check passed against exactly the regression it exists for. Read at the column
  now (`mineHead`).
- **And the inverted link check would have passed by finding nothing.**
  `mineRows.href` read `[data-mine-link]` — an attribute that lived on the link
  and went with it — so "no row invites a click" could not have failed whether or
  not a link was there. Struck on every `a[href]` in the row.

**A CHECK THAT ABSTAINS MUST NEVER ABSTAIN ALONE.** The five panel invariants
report NOT CHECKED when no row opened — and that only ever happens alongside the
offer check FAILING, because `AXIS_DRILL` is captured whether or not the click
landed, so a missing button yields an empty panel and a failure rather than
silence. Verified by removing the chevron: three fire, three abstain.

**THE WALK OPENS THE BOOK'S OWN OVERLAP ROW**, not whichever sorts first. Every
other row's raw and deduped totals coincide, which is exactly the condition under
which a panel dividing by the wrong one still prints 100% — so `AXIS_VENUE_BOOK`
names the one holding reported by two accounts under one `dedupeGroup`, and the
next drop picks its own.

`build` · `test:ingest` 140 · `test:family` · `check:family` 53/0 ·
`check:pages` **140 combinations clean**, with the same two pre-existing
abstentions. `glowData.ts` is untouched — nothing here reads the ingest.

### Stage 10al — THREE REMOVALS ON MORNING CIO, AND ONLY ONE OF THEM WAS FREE

*(Numbered `10al` rather than `10aj`: that letter was already taken by the
cumulative stock position further up, and two branches picked it in parallel.
The references below were repointed with it.)*

Three asks, and they are worth recording together because the SAME instruction —
take this off the screen — needed three different amounts of work, decided
entirely by whether what was being removed carried a figure.

#### 1. *"remove these stocks etf mutual funds selectors for this top movers section... we will only show direct equity as default."*

Stage 10ad put four tabs on Today's movers — Stocks & ETFs / Stocks / ETFs /
Mutual funds, on `?movers=` — after the family read their own first wording
("my stocks and ETFs are up") as asking for the ETFs back. They have now settled
it the other way, and the card is the **`DIRECT_EQUITY_BUCKET`** set Stage 10t
narrowed it to: 37 holdings, ₹94.9 Cr, of which 33 names and ₹82.3 Cr can reach
the quote feed.

**THE SCOPE IS A CONSTANT, NOT A PINNED VIEW, and that is the OPPOSITE of the
call Stage 10q made** for the Portfolio Monitor's basis switch — so the two
belong side by side or the next session will read them as contradictory. There
the flag was threaded through fifteen render branches, so pinning it to a literal
would have left every one of them unreachable, and `?view=entity` survived the
button that set it. **Here each scope was a different SET**, and the family have
chosen which set the card covers: keeping three unselectable ones alive on a URL
nobody can reach from the page would keep their captions, their nouns, their
verbs and a mutual-fund absence essay standing for a card that renders one set
for ever — the dead-code-that-looks-alive failure, wearing a query parameter. So
`MOVER_SCOPES`, `CANNOT_BE_PRICED` and the param are deleted with the control.

**EVERY CAPTION STILL READS THE SET** — the tile label, the coverage line, the
index sentence and the excluded footer each state what the figure covers, off one
constant instead of an active tab. And **what the narrowing leaves out is still
NAMED**: the footer now carries the ETFs beside the PMS mandates, which is the
half a reader could otherwise not see changing.

**THE TWO CONSTITUENT ROUTES WENT WITH THE TABS AND THE ABSENCE IS ASSERTED
TWICE.** `cio-movers-etf` and `cio-movers-mf` walked sets the card no longer
offers, so there was nothing at either address to hold to the light; the
`moverScopes` probe they were checked with is KEPT, and now proves the group is
gone. That probe is the only thing that can: "Stocks", "ETFs" and "Mutual funds"
all still appear legitimately in this card's own sentences and in the allocation
table below it, so a text match would report the tabs absent while they were on
screen. Asserted on `cio` AND `cio-live`, because the tabs rendered whether or
not a quote had landed.

#### 2. *"remove the highlighted text from the dashboard ui"* — the NAV card's four paragraphs

**EVERY CLAIM WAS CHECKED AGAINST THE REST OF THE CARD BEFORE ANYTHING WAS
DELETED**, which is the whole of this one — the Stage 10aa / 10ai pattern, and
the reason it is not a one-line diff:

| The sentence | Elsewhere? | Where it is now |
| --- | --- | --- |
| "Both lines are rebased to 100 at …" | **NO** | the subtitle — this card's basis line |
| "…nets out ₹11.2 Cr of external capital…" + the Show/Hide control | **NO** | the toggle in the period row, which names the figure it reveals |
| "…it reads +9.29% against the book's +0.54%…" | **NO** | that toggle's hover, beside the control that draws the line |
| "₹28.3 Cr of the move is not proven to be performance…" | **NO** | an amber pill beside the Book pill it qualifies, accounts in the hover |
| "The book's own dated series is N statement dates over A → B" | yes — the subtitle, word for word | — |
| "…over the period shown it moved +1.80% … market history" | **NO** | the range note, beside the control that chose the window |
| "The index is taken at its last close *on or before* …" | methodology, no figure | deleted — it is `alignIndexToDates` in `navSeries.ts` |

**THE REBASE WAS THE ONE THAT WOULD HAVE GONE UNNOTICED.** The y-axis reads
84 / 91 / 98 — a RATIO, not an amount — so without that clause the ticks are
unitless and the chart quietly stops saying what it is measuring.

**AND THE RANGE'S OWN INDEX RETURN IS THE ONE THAT HAD TO LAND IN A PARTICULAR
PLACE.** It is the index ALONE over a period the book has no measurement across.
In the range note it is unmistakably about the selected window; moved up beside
the Book pill it becomes a pair a reader reads as struck over one period, which
is the caption-that-widens failure. So the check requires it to be in the note
**and NOT in the header** — see the defect that check exposed in itself, below.

**THE `<details>` OF EXCLUDED ACCOUNTS IS DELIBERATELY NOT PART OF THIS.** The
selection ran through it, and it is the other half of the family's own ask ("or
state the accounts that cannot supply one"), it is a collapsed one-liner rather
than prose, and §"a figure that exists for SOME accounts is shown for those and
the rest are NAMED" is a standing rule of this book. It is one line to remove if
they want it gone, and that is said out loud rather than decided silently.

#### 3. *"remove the placeholder for not live data from the dashboard ui"*

The dashed panel headed "Coming as live data lands — the rest of the CIO vision",
four chips and a footnote. **NOT ONE OF THEM WAS A MEASUREMENT**, which is why
this went cleanly where the paragraphs above needed an audit first: a chip named
a feature that does not exist, so there was nothing on it to move and nothing a
reader could act on. The gaps it stood for are in the Stage 8 table above, which
is where an unbuildable feature belongs — four dashed frames on a dashboard read,
during an upstream outage, as four more things that have broken, which is the
company page's own lesson applied one page over. Both claims are asserted and
neither implies the other: the panel is gone, AND the two chips retired earlier
(the index strip, NAV-vs-benchmark) stay retired in particular, so a build that
restored the panel with its ORIGINAL list cannot pass on the heading alone.

#### The bug-reintroduction pass found a check that could not fail

Ten bugs were put back one at a time, each rebuilt and swept. Nine fired their
own check immediately. **The tenth is the point of doing it.**

`navHead` — the slice these invariants read the card's header from — used to be
bounded on **"Both lines are rebased"**, the opening words of the block that has
just been removed. `sliceBetween` returns EVERYTHING AFTER its start marker when
the end marker is absent, so all ten would have gone on running against the rest
of the page rather than failing. That much was expected and fixed.

**THE FIX WAS BOUNDED ON THE WORD "PERIOD" — the period control's own label — AND
THAT COULD NOT FAIL EITHER.** Reintroducing the exact bug it exists for (moving
the range's index-only return up beside the book's figure) left the sweep GREEN:
the injected sentence reads "alone over this **period**", so the slice ended
INSIDE the very text it was meant to catch. **A boundary a page is free to print
is not a boundary.** It reads the card's header ELEMENT now, off the `navChart`
probe — the same answer `data-movers-scope`, `data-section` and `data-mandate`
already give: a structural claim must not depend on prose a redesign may reword.
Re-run against the same bug, it fails.

`build` · `test:ingest` 140 · `test:family` · `check:family` 53/0 ·
`check:pages` **136 combinations clean** (140 less the two removed movers
routes), with the same two pre-existing abstentions. `glowData.ts` is untouched —
nothing here reads the ingest.

### Stage 10ak — 3P'S ₹0 WAS RIGHT AND THE SCREEN WAS WRONG; AND A FUND IS ONE ROW

*"The figures in the dashboard and the consolidated excel sheet are not matching
… the 3P funds on the dashboard stable growth basket are lacking invested and
current market value figures, so please check why they are missing … Also 3P
Class B1 B2, all of that should be shown as a single line item as just 3P funds
like in the excel sheet … and then when we click on it, we should see a drop down
list of all the other categories, B1, B2, B3."*

Two asks that look like one bug and are not. The first is answered by the
statements and needed no arithmetic changed; the second is a grouping.

#### The first ask: the book was right, and it was still a defect

**3P'S OWN STATEMENT PRINTS `0.000` UNITS AND `0.000` VALUE ON ALL THREE
CLASSES.** Read from the archive rather than reasoned about
(`public/audit/3p-investment-managers-3000048-2026-07-31-holdings/pages.json`),
the account's own transaction history says what happened:

| Date | Class | Event |
| --- | --- | --- |
| 31-03-2026 | B1, B2 | `Reclassification Out` — both folded into Class B3 |
| 31-07-2026 | B3 | **`Full Units Redemption`, ₹31,05,82,835.17** |

That is the exact figure on the ICICI payment advice this book already carries
and already refuses to attribute (§"the two ICICI payment advices"). So three
documents agree: the fund's own statement, its own transaction tape, and the
bank's receipt for the money leaving.

**THE REVIEW IS DRAWN 30 JUNE 2026 AND CARRIES 3P AT ₹52.12 Cr.** The redemption
is 31 July. The workbook is not wrong and the book is not wrong; they are five
weeks apart, and **the newer document is the statement.** A dashboard matched to
a review would have to un-redeem a position the fund says is gone.

**WHAT WAS ACTUALLY BROKEN IS THAT THE SCREEN COULD NOT SAY SO.** Three rows of
em dashes beside a ₹0 look exactly like three rows nobody wired — which is this
file's founding rule (*a measured zero and an absent measurement must never look
the same*) failing in the one direction it had never been tested in: **the zero
was correct and the reader could not tell.** `isRedeemedToNil` in
`analytics.ts` names it, and the row says **redeemed** in words.

**SCOPED TO A FUND VEHICLE, AND THAT IS A MEASUREMENT.** Eight positions in this
book stand at zero units and only five are redemptions: the other three are a
`Cash` sleeve at nil and a `Tax Deducted at Source` line, which are balances
rather than holdings and have nothing to be redeemed. The predicate is
`isFundVehicle && quantity === 0 && currentPrice != null` — **the NAV is the
witness**: a fund still publishing one has measured the zero, where a holding
with no price and no units is an absence.

#### The second ask: one fund, one row, and the classes one click in

`splitFundClass` in `shared/securityKey.mjs`, beside `stripDepositoryTail` and on
exactly the same terms: **DISPLAY ONLY, and `securityKeyOf` never routes through
it**, so each class keeps its own key, its own join, its own `/stock/` page and
its own row in every drill-down. Anchored at the END and it only ever removes.

**IT IS NOT A NAME MATCHER, AND THAT DISTINCTION IS LOAD-BEARING.** The fund base
must match CHARACTER FOR CHARACTER; nothing here resembles anything. Stage 10z
already recorded what a similarity rule does to this corpus — `Motilal Oswal
Active Momentum Fund` matched to `Motilal Oswal Founders Fund II`, sharing a
HOUSE rather than a fund — and a basket heading looks equally authoritative
whichever rows sit under it. Measured over the whole book: **220 distinct names,
16 rows carrying a class suffix across 7 funds, and exactly TWO of those funds
carry more than one class** — 3P (B1/B2/B3) and Sanshi (A2/E). **Zero false
positives.**

**SANSHI IS THE INDEPENDENT WITNESS THAT THE GROUPING IS THE RIGHT ONE.** Clubbed
it reads **₹204,48,04,459.29 — ₹204.48 Cr — which is the review's own
`Sanshi Fund 1` line to the rupee.** The family asked for the shape the workbook
uses and the workbook's own figure falls out of it.

**TWO GUARDS, AND THE SECOND IS THE ONE THAT IS NOT OBVIOUS.** A fund clubs only
where the BOOK carries more than one class of it — a single-class fund keeps the
name its statement prints (Baring's A1, Neo Infra's A5, Buoyant's A4) — AND where
the FILTERED set holds every class the book has. Under a filter that reaches only
two of three, a row headed `3P India Equity Fund 1` would print two classes'
figures as the fund's, which is the *"a caption asserts what a named counterparty
reports"* failure arriving through a filter.

**THE PER-UNIT COLUMNS GO ABSENT, EXACTLY AS A MANDATE ROW'S DO, AND FOR THE SAME
REASON.** 3P's classes are marked at 169.221 / 170.4473 / 163.4835: units of two
classes are not the same unit, so a summed quantity has no price and a blended
average cost and CMP are figures no statement prints. **Money IS additive across
classes** — invested, market value, weight, P&L and return are ordinary sums and
stay. Each dash names the classes rather than borrowing the mandate's wording,
because a confidently wrong reason sends the next reader to the wrong document.

**AND THE CLUBBED ROW IS DELIBERATELY NOT A `StockLink`.** `/stock/:securityKey`
resolves ONE holding, so a link on the fund name would open one class under the
fund's title. The link moves INTO the expansion, where each class is the link —
which is what the family asked for, and is also the only place it is true.

**`venuesOf` IS RE-KEYED ON (SECURITY, ACCOUNT).** Identical to the old
account-only grouping on every row in the book but these two, and it matters on
them: **3P's three classes all sit in ONE folio**, so an account-keyed panel would
collapse the very classes the row was clubbed to reveal and open onto a single
line. Sanshi's five statement lines over two classes are the other direction —
several members holding the same class — which is why the expansion's identity is
the statement and its Class column is drawn from the ROW rather than the lines.

**`realizedKeys` IS EVERY KEY THE ROW CLUBS**, not `ps[0]`. A realised gain is
reported per SECURITY, so a row standing for three classes claims all three or
none; one key silently drops two classes' realised figures.

#### Thirteen bugs reintroduced, and one of them exposed a blind check

`FUND_CLASS_BOOK` in `check-pages.mjs` derives the expectations from
`glowData.ts` on every run — which funds club, which must not, and which classes
the fund reports redeemed — with the class split and `isRedeemedToNil` both
**re-derived rather than imported**, on the same terms as `isMandateHeld`: a
check that imports the helper it is checking agrees with it by construction. The
two expressions of the split agree exactly on this corpus, which is the whole
point of writing it twice.

| Bug put back | Fires |
| --- | --- |
| clubbing removed | clubs / no-class-alone on all four routes, and the fund never opens |
| a single-class fund clubbed too | clubs / a one-class fund keeps its name |
| two of three classes clubbed | clubs / no-class-alone |
| the per-unit dashes fall back to the mandate reason | the cells name the classes |
| the redeemed pill removed | redeemed, both directions |
| the pill on every row | redeemed / the measured zero |
| the ₹0 absented instead of named | the measured zero / the lines add up |
| the Class column dropped | the class link / leads with Class / per-class redeemed |
| a class rendered as text, not a link | the class link |
| the panel truncated to one line | draws every class / the lines add up |
| ONE statement line dropped | draws every class / the lines add up |
| only the widest row opens | every fund opens, and three more |
| `venuesOf` keyed on the account alone | the venue-count identity ×3 |
| the tranche panel blended across unit classes | combined units / monotonicity / largest history / sectioning |

**AND THE FULL SWEEP CAUGHT A DEFECT IN THE CHANGE ITSELF — THE ONE THING THE
SUBSET RUNS COULD NOT SEE.** Clubbing shipped with the CONTRIBUTION HISTORY
still drawn as one blended panel, and `monitor-tranche` failed three invariants
at once: the combined units, the monotonicity claim, and the panel matching the
book's largest single history.

Nothing was miscalculated. `trancheTable` values every tranche as ITS OWN units
at ITS OWN position's NAV, so each ROW stayed right. What broke is the panel's
two claims, and both hold only WITHIN one class:

- its footer ADDS THE UNITS UP, and units of two classes are not the same unit;
- **cheaper entry NAV, higher return, always** — which is the whole reason the
  panel exists, and which is simply false across two classes marked at NAVs of
  their own. Sanshi's Class E carries 9 dated contributions and Class A2 one,
  and the blended panel drew 10 under one footer against a book that knows the
  largest single history is 9.

**It is the same rule the clubbed row's own Qty, Avg cost and CMP cells already
follow, one level down**, and it was not reasoned out in advance — it was
measured. `trancheGroupsOf` sections the panel by class, each with its own
heading, its own footer and its own NAV; the three invariants moved to per
SECTION, and a fourth now asserts the sectioning itself against the book (how
many of that fund's classes carry a history), because a blended table reports
one section with no class and would otherwise satisfy a check that merely asks
whether the sections drawn are distinct. Reintroducing the blend fires all four.

**AND THE WALK HAD TO OPEN BOTH CLUBBED ROWS, NOT THE WIDEST.** The first draft
picked the row clubbing the most classes — 3P — and reintroducing a truncated
panel proved that blind: **every one of 3P's classes is redeemed to ₹0, so a
panel cut to one line still summed to the row's own ₹0 and the reconciliation
passed.** Sanshi is where the money adds up, so both are walked and the check
additionally requires at least one clubbed fund CARRYING money, which is
`golden.mjs`'s rule arriving through a drill-down: a suite that passes over
nothing claims confidence nobody earned. Re-run against the same bug, it fails.

#### What still does not tie to the review, measured line by line

Stable Growth reads **₹412.71 Cr** here against the review's **₹541.90 Cr**, and
the bridge was struck ROW BY ROW rather than asserted — because two of the five
steps are settled and three are open, and a single "it's the abbreviations"
sentence would bury that:

| | Δ vs the review |
| --- | ---: |
| **3P India Equity Fund 1** — redeemed 31 July, five weeks after the review's date | **−₹52.12 Cr** |
| **National Stock Exchange** — 125,000 unlisted shares the ICICI NSDL statement values at an implied **Re 1.00**, so a PAR row carrying its quantity and NO value (§"the value column is a mark on 14 rows and par on 24"). It is not in `BOOK_POSITIONS` at all | **−₹41.50 Cr** |
| **four depository-clipped mutual funds** — `ICICI IOPPF D-GRW` ₹6.37 Cr against the review's ICICI Pru India Opportunities ₹25.42 Cr, `BNDH L&MCF DP GR` ₹2.53 against Bandhan Large & Mid Cap ₹24.78, `KOTAK MTCF D-GROW` ₹1.27 against Kotak Multicap ₹10.24, and Kotak Large & Midcap ₹2.50 with no counterpart in the book at all | **−₹52.77 Cr** |
| **Helios**, where THE BOOK IS HIGHER — Ajay's AMC folio ₹31.00 Cr plus Ankita's ₹7.23 Cr and Bharat's ₹3.79 Cr demat rows | **+₹14.85 Cr** |
| Neo Infra +₹1.78 Cr, Buoyant +₹0.95 Cr, Carnelian −₹0.55 Cr, and two under ₹10 L | **+₹2.31 Cr** |
| | **−₹129.23 Cr**, against a printed gap of ₹129.19 Cr |

**THE FIRST TWO ARE SETTLED AND NEITHER IS A DEFECT.** 3P is answered above by
three documents; NSE is this book's own par rule, and inventing a mark for an
unlisted share the depository prices at a rupee is the fabrication that rule
exists to stop.

**THE OTHER THREE ARE OPEN, AND THIS SESSION DID NOT CLOSE THEM.** They are one
question in two directions: the review writes each scheme out in full while the
depository clips it (`WOC MAAF D-GROW`), so a family basket reaches some of a
scheme's rows and not others — which is the hand-checked abbreviation table this
file already names, not another statement, and **no tier above a prefix may join
them.** The Helios line is the same question running the other way and carries a
second one beside it: the three rows are marked at **₹16.21, ₹15.74 and ₹14.18
for one ISIN** (`INF0R8701046`), which no scheme can be on one day, so at least
two of the three statements are drawn on different dates. Both need the archive
rather than the screen, and both are named here rather than papered over.

**A SUSPECTED DOUBLE COUNT WAS CHECKED AND CLEARED, AND IT IS NOT THAT.**
`HELIOS FCF D-GROW` and `Helios Flexi Cap Fund - Direct Growth` share that ISIN
and are DIFFERENT HOLDERS in different accounts: Ajay 1,91,23,041 units in the
AMC folio, Ankita 51,00,985 and Bharat 24,07,981 in their own demats, from
separate documents. Not a duplicate — recorded so the next session does not
re-open it as one.

**AND THE WORKBOOK THE CLIENT ATTACHED IS ALREADY IN `source/`** — md5-identical
to `source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30
June 2026.xlsx`. It is still not a source (§"the consolidated review workbook is
not a source — by decision"); it is the cross-check `reconcile:review` runs and
the classification `familyTaxonomy.ts` cites.

### Stage 10am — THE REDEMPTION WAS ON PAGE 2 ALL ALONG, AND THE SIDE FILTER WAS WIRED TO NOTHING

Three asks, and the first two are one defect seen from both ends: a fund the
family knows they redeemed was in neither the holdings they hold nor the
transactions they made.

*"In the holdings page we only need to show the current holdings. Since the 3P
fund is redeemed, we need to show it in the transactions page as sold
transaction."* · *"When I'm clicking on sell/buy filter, nothing is changing on
the page … But nothing on the page is changing when I'm clicking either of the
filters."* · *"I cannot find the redeemed 3P fund anywhere in the transactions
page under sell side."*

#### 1. The redemption was never in the archive, and the statement had it all along

`docs/EXTRACTION-REPORT.md` reported the 3P statement READ. It was — the reader
took its **ACCOUNT SUMMARY** and stopped there, and the account's whole dated
history sits in a `Financial Transaction(s)` table on **page 2** that nothing had
ever looked at. `document.json` carried `holdings: [3]` and
`transactions: [] · cashFlows: [] · capitalGains: []`; `BOOK_CAPITAL_MOVES` had
114 rows across 10 accounts and **not one mentioning 3P**.

**AND THIS FILE ASSERTED THE OPPOSITE, IN THE READER'S OWN HEADER.** It read
*"all reclassified out on 31-03-2026 … WHERE THE UNITS WENT IS NOT ON THIS
STATEMENT and is not guessed at."* Page 2 says exactly where they went. That is
the **sixth** absence in this book recorded against a premise nobody rechecked —
after FRED, the RBI, the release calendar, the ISIN tier and the NAV series — and
it is the most expensive shape of it: an absence asserted about a document
already in hand.

| Date | Class | Event | |
| --- | --- | --- | ---: |
| 04-05-2023 → 15-07-2025 | B1 | four Subscriptions | ₹12.00 Cr |
| 31-10-2025 | B2 | Subscription | ₹4.50 Cr |
| 28-11-2025 | B3 | Subscription | ₹12.00 Cr |
| 31-03-2026 | B1, B2 → B3 | Reclassification Out / In | **₹0 — no money moved** |
| 31-07-2026 | B3 | **Full Units Redemption** | **₹31,05,82,835.17** |

₹28.50 Cr in, ₹31.06 Cr back — a ₹2.56 Cr gain — and that redemption figure is
the one on the **ICICI payment advice this book already carries and already
refuses to attribute on a file name alone**. Three documents agree.

**FIVE CHECKS, AND THE TABLE IS PUBLISHED ONLY IF ALL FIVE PASS.** A dated tape a
reader acts on is the one thing that must not be published on trust, so
`threePFlows` emits NOTHING and says why unless the statement's own arithmetic
witnesses it — `hdfcNsdl.mjs`'s licence, applied to a table rather than a
rendered page:

1. gross − setup expense − stamp duty = the printed `Amount Invested`, to the
   paisa, on every subscription;
2. |amount| = |units| × NAV, within the precision the statement prints those two
   to (units 3dp, NAV 4dp) — reproduced, never a tolerance widened;
3. the running unit total reproduces the printed `Balance Units` on every row of
   every class;
4. the reclassifications **net to zero in rupees**;
5. and page 3's own `Reclassification` table — a separately printed witness —
   agrees with the balance the transaction table runs to.

**CHECK 4 REFUTED ITS OWN FIRST DRAFT, WHICH IS THE CHECK EARNING ITS PLACE.** It
first required the units to net to zero as well, and failed by 37,368.064 on a
statement that is perfectly correct: 12,48,630.217 units leave B1 and B2 at
142.7354 and 143.7190, and 12,85,998.281 arrive in B3 at **138.8041**, because B3
carries a 0.70% management fee against B1's 1.00% and B2's 1.20% and the same
money buys more of it. The MONEY is the invariant; each side's unit count is held
to its own NAV by check 2. Page 3 prints the same 37,368.064 gain independently,
which is check 5.

**AND A RECLASSIFICATION IS NOT A CAPITAL MOVE.** ₹17.85 Cr left two classes and
the same ₹17.85 Cr arrived in a third, on one day, inside one folio. Typed as a
withdrawal and a contribution it would put ₹17.85 Cr of fictitious money out and
back into this family's dated record. It gets its own `kind`, is archived because
it is what the statement prints, and sits deliberately outside `CAPITAL_KINDS`.

**AND `capitalMovesFrom` HAD TO LEARN THAT A LAYOUT DECLARES ITSELF.** Its
ambiguity — *"the allotment row's amount might be a running balance"* — is a fact
about SANSHI, which prints the gross, the stamp duty and the allotment on three
lines. 3P prints all of it on ONE line and prints its own net. A row carrying its
own net **cannot** be a running balance, because a cumulative figure has no
per-row charge to be net of — so `netAmount` is a primitive the statement prints
AND a declaration, and the inference ("does it carry units?") that would have made
every 3P subscription an unusable balance is gone.

**RE-EXTRACTED SAFELY, WITH A CONTROL RUN.** `GLOW_PDF_PASSWORDS` is not set in
this session, so a full re-extraction would have dropped the eight encrypted
statements — which is exactly what `guardAgainstShrinkingTheArchive` exists to
refuse. The 3P PDF alone was extracted into a scratch `GLOW_AUDIT_DIR` and
**reproduced the committed document byte-identically except for `sourcePath`**
BEFORE the reader was touched, so every difference afterwards belongs to the
change. `docs/EXTRACTION-REPORT.md` does not move: the reconciler's dated checks
do not cover this document's cash flows, and its coverage row is unchanged.

**WHAT THE BOOK GAINED, AND WHAT IT DID NOT.** 6 contributions and 1 redemption;
`BOOK_CAPITAL_MOVES` 114 → 121 rows across 10 → 11 accounts. **`BOOK_SUMMARY`
does not move by a rupee** — a dated record of money that has already been paid
out changes no NAV. `positionTranchesFrom` correctly withholds a per-contribution
breakdown for all three classes, and now says *why* in the right words: a
redeemed position is not an unexplained shortfall, and the generic
"the contributions do not account for the position" would send the next reader
looking for a missing allotment.

#### 2. The side filter was a control whose value reached nothing

`side` was never passed to `MyInvestments`. Clicking moved the **counter beside
the table** — which read the manager's TAPE on every view, so the family's own
ten rows sat under *"284 buys · 178 sells"*, a count of a set the page does not
draw. That counter moving is the whole reason the dead filter looked alive.

- **`capitalRollup` takes a side**, and the vocabulary is the CALLER's: a family
  movement has no buy and no sell, it has money in and money out, which is what
  the columns are already headed. The control reads `Paid in` / `Taken out` here
  and `Buys` / `Sells` on the tape — `MultiSelectFilter`'s own "No companies
  match" over a list of countries, one control further on.
- **A NET OVER ONE SIDE IS NOT A NET.** It would tie to the two columns beside it
  and describe an account that also moved money the other way — the plausible
  wrong figure, which is worse than none. Under a filter the net, the gain and
  the return all render absent with the reason, and the footer's net cell with
  them: `sumOrNull`'s rule arriving through a side filter.
- **AND THE EMPTY SIDE IS ABSENT, NEVER ₹0.** Under `Taken out` a row has no
  contribution in view, and a ₹0 there says the account was never funded — the
  measured-zero rule failing in the direction that INVENTS a fact rather than
  hiding one.
- **ONE FILTERED SET, NOT TWO.** The date and entity filters moved up into
  `TransactionsView`, so the counter and the table read the same array. Two
  filterings of one set is two definitions of "the movements in view", free to
  disagree the first time either changed — which is how this defect looked
  plausible in the first place.

#### 3. A closed position is not a holding

Dropped at the BASE of the row build — before the filters, the weight
denominator, the footer set and every section subtotal — which is the one place
that makes each of those consistent by construction, the way the ring-fence is
applied one layer up. Measured: **5 rows across 2 accounts, every one ₹0 of
market value and no reported cost**, so it moves no money on the page; what
changes is the row count.

**AND THE `redeemed` PILL WENT WITH THE ROW IT EXPLAINED.** That pill was the
right answer to the LAST round — *"the 3P funds are lacking invested and current
market value figures"*, where the book was right and the screen could not say the
₹0 was measured. This supersedes it, and leaving the pill would leave code that
can never fire. So it is deleted, and `check:pages` **inverts** rather than
deleting the check with the feature: no closed key may be a row, no row may say
"redeemed", and the `data-redeemed` handle must be gone.

**WHAT MUST NOT BE LOST WITH IT, and is asserted from both ends:**

- the closed positions are **NAMED under the table** — how many, which funds, how
  many accounts, that the zero is MEASURED, and that the money is on
  *Transactions → What I invested* under *Taken out*. Dropping a row and saying
  nothing is the same defect as showing a ₹0 one: a reader who knew they held 3P
  and cannot find it learns the dashboard lost it;
- and `/holdings` **still renders them and now marks them**. That page lists the
  set BEHIND a Morning CIO figure, and Positions counts all 371 — so the ₹0 rows
  are still there and still need the explanation the monitor's pill used to
  carry. Without this the two removals cancel into a ₹0 nobody explains anywhere.

**`FUND_CLASS_BOOK` IS NOW STRUCK OVER THE CURRENT HOLDINGS**, because that is
what the monitor draws: **one** multi-class fund (Sanshi A2/E) where the whole
book has two. Derived from every position it would demand a clubbed 3P row on a
page that correctly does not draw one.

#### The checks, and the three that could not fail

`check:pages` gains two routes — `monitor-txn-in` and `monitor-txn-out` — whose
every expectation comes from `glowData.ts`: a filter that matched everything and
one that matched nothing both draw a table, and only the book says which rows
belong. The `out` route **opens every row**, because the statement's own word for
the movement (`Full Units Redemption`) rides in the expansion and the collapsed
row shows a count — the check has to look where the redemption's own label is.
`scripts/ingest/__tests__/altFund.test.mjs` (35 cases) exercises the reader
against a SYNTHETIC statement and **breaks it six ways**, one per check plus an
undeclared transaction type; every one refuses the whole table.

**AND EACH MUTATION ISOLATES ITS OWN CHECK, which took measuring rather than
reasoning.** The first draft changed a unit count — which moves the units × NAV
identity AND the running balance, so two checks fired and neither could be shown
load-bearing on its own. Every figure is now chosen so exactly one identity
breaks: the reclassification case moves the amount and its NAV TOGETHER
(99,990 × 119.9920 = ₹1,19,98,000.08, inside the printed precision), so only the
netting fails. Verified by weakening each of the six in turn: every one produces
exactly its own two failures and no others.

**AND ONE CASE ASSERTS THE MONEY RATHER THAN THE LABEL.** A check on the word
"reclassification" alone would pass a reader that renamed the kind and kept the
figure, so the suite states what the label is protecting — what a class transfer
would have added to each side had it been typed as a movement. Measured on the
real statement that is ₹17.85 Cr in each direction; on the synthetic one,
₹1,19,98,800.

**`CAPITAL_KINDS` TURNED OUT TO BE THE SECOND LOCK, NOT THE FIRST.** Widening it
to admit `reclassification` and rebuilding the book changes nothing — the day
split in `capitalMovesFrom` keys on `contribution` and `withdrawal` by name, so a
row of neither kind is picked up by nothing. The reader's own `kind` is what
actually decides, which is why the assertion lives in the ingest suite and not in
a page check that cannot fail.

Three existing checks had to be rewritten, and each was a check that could not
have failed:

- **`a row with no withdrawal shows a dash, never a zero` was a page-wide `₹0`
  ban**, and passed only for as long as no row legitimately carried one. 3P's
  account now does — the fund paid out, so its Value today IS zero and the zero
  is MEASURED. A page-wide ban cannot tell that from a fabricated one and would
  force the page to hide a real figure. Struck at the Taken-out column now, which
  is the claim it was always about.
- **the `in` filter does not narrow the ROW set**, because every funded account in
  this book has money going in — it narrows the MOVEMENTS. A blanket
  "the row set must shrink" assertion failed a correct page; it is struck
  conditionally, off the book, and `out` (4 of 11) is what catches a filter wired
  to nothing.
- **and the `redeemed` capture in `tableRows` went with the pill.** A handle that
  can never be present reads `false` for ever and quietly satisfies whatever asks
  for it.

**TEN BUGS WERE REINTRODUCED, EACH FIRING ITS OWN CHECK**: the side never
reaching `MyInvestments` (the original defect — three checks, from both routes),
the counter back on the manager's tape, the control back in the tape's
vocabulary, a net published over one side, the empty side back to ₹0, a closed
position listed among the holdings (three checks, from three directions), the
closed note deleted, the note dropping where the money went, the `/holdings`
marker removed, and the reclassification admitted to `CAPITAL_KINDS`.

**AND A FAILED BUILD SILENTLY REUSES THE OLD BUNDLE**, which is worth naming
because it produced a confidently wrong result once here: a mutation that did not
typecheck left `dist/` at the PREVIOUS bug's build, and the sweep dutifully
reported that bug's failures under the new one's name. A bug-reintroduction run
whose failures match the previous run's exactly is the tell.

`build` · `test:ingest` 140 + 35 · `test:family` · `check:family` **53/0** ·
`check:pages` **142 combinations clean**, with the two pre-existing abstentions.
`glowData.ts` regenerates from the archive; `BOOK_SUMMARY` is untouched.

### Stage 10an — THE MOVERS CARD LANDS COMPLETE, AND TWO CAPTIONS GO

*"this daily movers section take a lot of time to show data and sometimes first
shows incomplete data and then starts showing all the portfolio movers... make it
quick and it should show all the data together rather than in bits and pieces, so
it does not confuses anyone using the dashboard."* And: *"remove the highlighted
texts from the dashboard UI completely."*

**THE FIRST IS A CORRECTNESS COMPLAINT WEARING A SPEED COMPLAINT'S CLOTHES**, and
reading it as the second would have produced a faster card that was still wrong.
`/api/quotes` prices a BOUNDED SLICE per request — the upstream returns only part
of a large ask inside its own budget — so the card redrew on every round, and
**every figure on it is struck over whichever names had arrived**: the day's move
divided a partial rupee change by a partial previous close, the gainer and loser
lists ranked a subset, and the comparison against the Nifty 500 set that against
a real index. All of it real arithmetic over the wrong set, all of it changing
under the reader.

Measured before anything was written: **161 distinct book symbols, 64 per
request, so three rounds** — and the card's own 33 direct-equity names sat at
distinct-symbol positions **20 to 108** in book order, **30 of them beyond the
first request**. The card could not be complete until the third round. Worse,
`quotesStatus` flips to `live` after round one, so the "Fetching prices" note
disappeared while the lists were still a ranking over three names.

#### `pending` is not `missing`, and conflating them is why nothing could wait

A symbol this round **DEFERRED by the cap** and a symbol the upstream **CANNOT
PRICE** both arrived as `missing`, and they are opposite facts: the first is
answered in seconds, the second never is. A caller that cannot tell them apart
cannot know when a set is COMPLETE — which is the only thing a RANKING can
honestly wait on.

- **`missing` now means ATTEMPTED AND UNSERVABLE, `pending` NOT YET ATTEMPTED**,
  and the two partition everything a request could not price. The response
  carries both.
- **`fresh` excludes pending.** Counted in, a first round reported the whole book
  fresh while holding 136 prices it had not asked for — a coverage figure over a
  set nobody measured.
- **THE FILL POLL RUNS ON `pending`, NEVER ON `missing`.** This book has symbols
  the upstream cannot price, so the old condition held the tab at a four-second
  cadence for its whole life while nothing could change. A pre-existing defect
  the split fixes rather than one this change introduced.
- **`priority` is the other half.** The caller names the symbols the first screen
  needs and they are fetched first. It never WIDENS the ask — a priority symbol
  not in `symbols` is ignored, or a browser could reach past its own request —
  it only decides the order. The card's 33 names now land in ONE round.

`PRIORITY_SYMBOLS` in `PortfolioContext` is **derived through the same
`holdingBucket` the card groups on**, so a drop that moves a holding between
buckets moves it too. A typed list would go stale silently and the card would be
back to three rounds with nothing to say so.

#### The card holds on ITS OWN scope, never on the book's

`pendingFor(model.scopeSymbols)` — 33 symbols, not 161. Holding until the whole
book lands would make a 33-name card wait on 128 names it does not show, which is
this fix running the other way. **A FAILED FEED IS NOT A SLOW ONE**: when the
feed is unavailable no answer is coming, so the card stops waiting and renders
the absent state that names the feed. And the loading state **counts its own
progress** against its own scope size, because a spinner with no number is
indistinguishable from a hung one.

The "Fetching prices — figures are the last snapshot" caption now renders only
when the scope is COMPLETE and a refresh round is in flight, and says so:
figures that are complete and dated, with a newer round coming. It used to sit
above a partial ranking, describing it as a snapshot rather than as a subset.

#### The two captions, checked against the rest of the screen before they went

**`PortfolioMonitor`'s venue-table line** — *"The row above clubs them into one
holding; each line here is one statement as printed."* Both claims survive it:
the lead sentence above already names the row's own value and splits it by route,
and the per-statement basis only has a CONSEQUENCE where the two differ — on
exactly those rows the lead sentence names the overlap in rupees and the amber
line under the table reconciles it. On every other row the sentence described a
difference that row does not have.

**`FundExposure`'s loading line** — *"Checking which of your funds disclose this
name…"* — is a removal of a SENTENCE and not of the STATE. The load-bearing half
was never the words: a card still fetching must not print "none of the N funds
discloses this name", which is a claim about the holding made before a
disclosure has been read. It renders `null` now, which asserts nothing. **And
the fall-through is a TYPE ERROR rather than a check**: `StockExposureState` is a
discriminated union whose loading variant carries none of `covered`,
`considered`, `skipped` or `byKey`, so deleting the branch instead of its markup
does not compile. That is the stronger guard, and the invariant below is the
runtime backstop for a state the type cannot see.

#### `npm run test:family` gained the suite the server change needed

`quotesFunction.test.ts` — **nine checks against a stubbed upstream**, because
`MUNS_TOKEN` lives in the Cloudflare environment and the partition is a property
of THIS function rather than of the upstream. The partition itself, deferred vs
unservable in both directions, priority ordering, priority never widening the
ask, `fresh` excluding pending, an ask inside the cap deferring nothing, and the
last-good fallback moving a symbol OUT of pending once the bundle can serve it.

**THE PARTITION IS RE-STRUCK ON THE BUNDLED CALL, and that is the one that can
fail.** Everywhere else a pending symbol has no price, so "exactly one place" is
true by construction and the check cannot see the overlap it is written for.
Reintroducing the overlap proved it: the general partition check stayed green and
only the bundled one fired. Six server bugs were put back one at a time and each
fired exactly its own checks.

**AND THE STUBBED SHAPES ARE THE FUNCTION'S OWN, taken rather than guessed.** The
first draft answered under `data[]` keyed on `ticker_symbol`; the upstream answers
under `data.items` keyed on `ticker` with the rest inside a `rawQuote` blob, and
the whole suite reported nothing priced — every case failing for one reason that
had nothing to do with what any of them assert.

#### `cio-filling` and `monitor-security-loading` — two states no walk could reach

Both removals and the hold needed routes that HOLD A FETCH OPEN, because every
existing mock answers in one round and the settled walk waits for a settled box.

- **`installFillingQuotes`** prices a third of the ask and defers the rest for
  ever, and deliberately does NOT honour `priority` — it is the pessimistic case,
  so the card must hold on its own scope rather than on the server having ordered
  the ask conveniently. The invariants are struck on STRUCTURE: a card that drew
  six of its 33 names renders a perfectly well-formed list, and only a count of
  `[data-mover-row]` can see it.
- **`monitor-security-loading`** stalls `**/lookthrough/**` for the length of the
  walk. Without it *"the removed loading line is gone"* was struck on text that is
  never on screen at read time and could not have failed either way.

**AND IT IMMEDIATELY FOUND A LIGHT-MODE GAP NOTHING COULD HAVE REPORTED.**
`text-champagne-400/80` had no `html:not(.dark)` remap — Tailwind emits each
opacity variant as its own class, which this file already says in as many words —
and it came back at `#ecdcae` on white. It renders ONLY while the fund
look-through is loading, so the class had been on screen for nobody. Same shape
as the `hover:` variant Stage 10ag found the day a route first clicked something.

#### The bug-reintroduction pass found that FIVE OF THE NEW CHECKS COULD NOT FAIL

Every one of them returned a DESCRIPTIVE STRING on failure, and the harness reads
any truthy return as a pass (`if (!r) invariants.push(desc)`). So the first sweep
came back clean over a card rendering a partial ranking. Rewritten to return
booleans and `{ notChecked }`, with each claim split so a failure names its own
part. **This is the "a check that cannot fail is itself a defect" rule arriving
through a return type**, and it is why the pass is run at all: the sweep was
green, twice, over exactly the defect it was written for.

**AND A SIXTH ABSTAINED WHERE IT SHOULD HAVE FAILED.** The `priority` claim reads
the request rather than the page, and an absent field was recorded as `null` —
which the check read as "no request was captured" and abstained on. Dropping
`priority` entirely, the exact regression it exists for, produced a clean run
with one NOT CHECKED line. A request that named NONE now records `[]`, which is
a finding; `null` means only that no request was seen. `golden.mjs`'s rule and
this file's own *"a missing toggle must be a finding"*, arriving through a
captured request.

**Nine bugs reintroduced in the browser and six in the suite, each firing its
own check**: the card ranking a partial scope (the original defect), the ask
naming no priority, priority widened to the whole book, the card waiting on the
whole book, the card holding for ever, the loading state naming no progress, each
caption restored, and — in the suite — pending folded back into missing, priority
ignored, priority widening the ask, the two sets overlapping, `fresh` counting
pending, and an off-by-one on the cap. **The fall-through in `FundExposure` is
the one that could not be reintroduced at all**, and that is the finding: it does
not typecheck.

`build` · `test:ingest` 140 + 35 · `test:family` (9 new) · `check:family` **53/0** ·
`check:pages` **146 combinations clean** — 142 plus the two new routes across both
themes — with the same two pre-existing abstentions. `glowData.ts` is untouched:
nothing here reads the ingest.

### Stage 10ao — THE BASIS PILL GOES, AND THE DRILL-DOWN LOSES ITS PROSE

*"remove — 'LIVE · Consolidated · listed live / 49 accounts behind' part from
the UI."* And: *"Remove all the highlighted text and the sections from the
dashboard UI"* — the `/holdings` lead paragraph, its facet note, its pill row
and the whole "How this figure is worked out" card.

**THIS IS THE FIRST REMOVAL IN THIS FILE THAT CROSSES ONE OF THE SEVEN RULES,
AND IT IS RECORDED RATHER THAN GLOSSED.** §6 says every consolidated figure
carries a `<BasisPill>`, because a reader who cannot tell a statement mark from
a live one cannot check anything, and because a consolidated total here is a
BLEND of report dates that `portfolio.asOf` states only the newest of. Morning
CIO and the drill-down no longer print one. The family asked for it by name and
that is their decision; what this section owes them is an accurate account of
what it costs and of what was kept.

**THE HALF OF §6 THAT IS A CORRECTNESS GUARANTEE IS UNTOUCHED.** Capital Gains,
Data Audit, Ledger Insights and Private Market read `statementPortfolio` and
pass `<BasisPill statement>` — a reader checks those against the PDF, and a
total that drifted with the market could not be checked at all. That is asserted
on `private-market` now, and it is a SEPARATE claim from the two absences:
a build that deleted the component everywhere would satisfy both removals and
silently take this with it. Verified by making `BasisPill` return null for
`statement`, which fires exactly that check and nothing else.

#### Every claim was checked before it was deleted, and three had no second home

The same audit Stage 10aa and 10ai ran, on nine items this time:

| Removed | Elsewhere? | Where it is now |
| --- | --- | --- |
| `LIVE · …` + `N accounts behind`, Morning CIO | **NO** | gone — see above |
| the same pill on `/holdings` | **NO** | gone, same request |
| the `lead` paragraph | the heading + the four tiles' own captions | deleted, and `Drilldown.lead` with it |
| the active facet's NOTE paragraph | **the chip's own `title`** | the hover, which already had it |
| `behind Consolidated NAV · …` | the crumb, and each tile's own hover | deleted, and `Drilldown.backs` with it |
| `consolidated · each holding once` | **the holdings table's own subtitle** | already there, in the same two branches |
| the accrued income the NAV excludes | **NO** | the NAV tile's hover |
| the XIRR's window and its refusal to annualise | **NO** | the money-weighted tile's hover |
| cross-held is not the duplicate policy | **NO** | the Cross-held link's hover |

**THE THREE WITH NO SECOND HOME WENT INTO HOVERS, AND THAT IS WEAKER THAN A
CAPTION.** Said plainly because it is true: a hover is not read by someone
scanning. Each was kept anyway, because each is a figure a reader ACTS on —

- **accrued income** is exactly the amount by which a manager's printed total
  runs above ours. It has now been moved twice: it was this tile's caption,
  Stage 10aa moved it to the arithmetic card as *"the ONE line among the six
  that no other surface repeated"*, and the card has now gone too.
- **the XIRR window** is Stage 10g(ii)'s guard. This tile once read **+99.0%**
  with nothing miscalculated, against the managers' own 7–31% since-inception
  figures for the same accounts. `moneyWeightedReturn` refuses to annualise a
  sub-year window and **the caller must say so**; the hover is the caller now.
- **cross-held is not the duplicate policy** — two members each genuinely owning
  some of a name, counted once per member, against ONE holding two statements
  both report (this book's ₹3.17 Cr), which the consolidated set has already
  collapsed. A reader who conflates them misreads the concentration figure.

**AND `drilldownFormula` IS DELETED, NOT ORPHANED** — 240 lines with one caller,
plus `Drilldown.lead`, `Drilldown.backs`, `Drilldown.windowDays`, the window
local that fed it and the `FormulaDef` import. The shape `exportDeck.ts`,
`entityParts` and `holdingHref` were each removed in.

#### The bug-reintroduction pass, and the four checks it corrected

Eight bugs were put back one at a time. Five fired immediately; the other three
were defects in the checks, and a fourth turned up in the full sweep:

- **THE HARNESS ITSELF LOST A DAY'S WORK.** Two patches produced a JSX syntax
  error, `set -e` skipped the restore, and the bugged file sat there while the
  next sweep read a stale `dist` and reported CLEAN. The harness now restores on
  a `trap … EXIT` and reports a failed build as a failed PATCH rather than as a
  result. **A sweep that cannot build is not a sweep that passed.**
- **`it opened the row Morning CIO linked, and says which figure it stands
  behind`** read the `backs` pill on SEVEN routes, and `it opened a section
  Morning CIO's axis actually drew…` on two more — all nine would have failed
  the moment the pill went, and did. The half that still has an answer (the
  address resolved to the section the reader clicked) is what is left; the other
  half is the absence check.
- **`the page separates cross-held from the duplicate policy`** read the lead
  paragraph. That is the claim re-homed above — found by the sweep, not by
  reading, which is why the full walk runs before the commit and not after.
- **THE FACET-NOTE CHECK REQUIRED A NOTE ON EVERY CHIP, AND ONE HAS NONE.**
  `holdings-winners`' "Showing a gain" facet carries `note: ""` in the book,
  correctly — the label says the whole of it, and inventing a sentence to
  satisfy a check is the wrong direction. It is `some` rather than `every`, and
  it is spread ONLY into the eight scopes that draw a toggle: in the shared
  block it abstained on ten routes that have no facets at all, and **ten
  evidenced abstentions are how a real one gets missed.**

One more was found by the sweep rather than by a reintroduced bug: the
money-weighted hover's sub-year branch SHOUTS its sentence (`THE WINDOW IS 150
DAYS AND THE RATE IS NOT ANNUALISED`) and the annualised branch does not, so a
case-sensitive check failed a page that was right — `label-xs`'s trap arriving
through a template literal instead of a CSS transform.

`build` · `tsc` · `test:ingest` 140 · `test:family` · `check:family` 53/0 ·
`check:pages` **138 combinations clean**, with the same two pre-existing
abstentions. `glowData.ts` is untouched — nothing here reads the ingest.

### Stage 10ap — FOUR MORE REMOVALS, AND COMPARE COMPANIES GOES ENTIRELY

*"remove highlighted texts and sections from the dashboard UI"* — pointed at
three paragraphs on three pages — and *"remove the compare companies page from
the dashboard UI completely."*

The fourth round of the same instruction, and the fourth time the text being
removed turned out to be the LAST home of something. The method is the one
Stages 10aa, 10ai and 10am established and is the whole of the work: audit every
claim line by line against the rest of its own page, MOVE what has no second
home onto the figure it describes, delete the rest, and assert both the removal
and the new address. What is new here is the outcome of the audits — **two of
the three paragraphs were entirely redundant, and the third had four claims
already on its own page and four that were not.**

#### 1. Polycab — two paragraphs, and every claim already stated above them

The `Per demat account` card's subtitle and its footer. Audited before either
was touched:

| The claim | Where it already was |
| --- | --- |
| "one row per depository account" | the card's own TITLE, and its Depository account column |
| "the per-share mark is value ÷ units", "an NSDL statement has no rate column" | the `STATEMENT · as of` pill's hover, **in those words** |
| "a statement figure, not a live quote" | the same hover, and the pill itself |
| "cost is absent because a depository holds the shares; it did not buy them" | the Cost basis tile's own `sub`, which is where the em dash is |

Nothing moved, because nothing had to. Both halves are asserted and neither
implies the other: the prose is GONE, **and** the hover still carries the
derivation — a build that lost the lot passes an absence check on its own.

#### 2. Private Market — the lead, and both header pills

**THIS IS THE SECOND TIME §6 HAS BEEN NARROWED, AND IT IS RECORDED RATHER THAN
GLOSSED.** Stage 10ao took the `<BasisPill>` off Morning CIO and `/holdings` and
kept it here as the correctness half; the family have now pointed at it on this
page too. `statementPortfolio` IS STILL THE SOURCE — that is where the guarantee
actually lives, and it has not moved. What went is the reader being TOLD.

What that costs was measured rather than asserted, and on this page it is the
smallest it could be:

- **the LABEL.** Not one private holding resolves an NSE symbol, and every live
  endpoint is keyed on one — so no row here could drift even if the page read
  the live portfolio. That is a PREMISE, so `check:pages` now checks it every
  run (`PRIVATE_QUOTABLE`, derived from the book): a drop bringing a quotable
  private holding fires by name and the decision gets made again, instead of
  this paragraph silently becoming false. **This is the fifth absence in this
  file that could have been recorded against an unchecked premise, and the first
  one written down as a check on the day it was made.**
- **the DATE.** `<BasisPill>` dates a consolidated figure `portfolio.asOf` — the
  book's newest report date, two weeks ahead of every mark on this page. The
  derived spread below it (*"Marks span … → …"*) was always the truer statement
  and it stays, so losing the pill's date is a GAIN. That is the argument
  `Polycab.tsx` already makes at length for never having used the component.
- **`N accounts behind`** is about the BOOK's accounts, not this page's.

**Capital Gains, Data Audit and Ledger Insights keep theirs**, and `check:pages`
still asserts one of them, because a build that deleted the component everywhere
would satisfy this removal and take the guarantee with it.

The subtitle counted funds, accounts and owners. **Two of the three were already
printed** — the fund table's footer reads `Total · N funds` and the By-owner
rollup ENUMERATES the owners, which is stronger than counting them. The ACCOUNTS
count was nowhere else, so it moved onto the Private market value tile.

#### 3. Sector Composition — eight claims, four of them already on the page

The long footer. Four claims survived where they were — the "company shares
only" framing (the subtitle), the total (the donut hole), the mandate / own /
route-unstated split with its counts, accounts and shares (**three cards that
already render it, with more detail than the sentence had**), and "which of the
two chose a name" (the Held via column). Four had no second home:

- **the holdings count and "each counted once"** → the donut hole, under the
  total they describe. Asserted against the sector table's own Positions column,
  which is the same figure by a different path.
- **the excluded classes, each with a value** → a third partition card, `Not a
  company share ₹488.4 Cr`, beside the two that split the covered set. It is a
  LABELLED FIGURE rather than a sentence, which is also what lets the check be
  struck on arithmetic: company shares + the named classes must reconstruct the
  consolidated NAV, and the card's own total must tie to the list beneath it.
  **A sector page over ₹222 Cr of a ₹710 Cr book is an unexplained narrowing
  without it.**
- **why Unclassified is unclassified** → onto the Unclassified row and its
  legend entry, as a hover, which is where an absence's reason belongs.

`privateMV` and `unclassified` fed nothing but that paragraph and were DELETED
with it rather than left computing the right number into no caller.

**AND THE `title` WENT ON THE EXISTING SPAN, NEVER A NEW ONE.** That cell is a
flex container, so an added child becomes a flex ITEM and `innerText` breaks the
line at it — Stage 10ah's "N entities" trap, which would have silently reshaped
every row-based check on the page.

#### 4. Compare Companies — the page, the group, and one orphaned module

`/compare` redirects, the nav entry is gone, `src/pages/CompareCompanies.tsx` is
deleted, and with it the whole **RESEARCH** nav group, which held nothing else —
the same thing that happened to MONITOR at Stage 10y and KNOWLEDGE at 10x. The
headings are derived from the entries, so the group disappears on its own.

**`src/lib/ratios.ts` WENT WITH IT.** `fetchRatios`, `isRatiosError` and
`DEFAULT_METRICS` had no other caller, and a builder nothing calls is the
dead-code-that-looks-alive failure this file keeps naming. `functions/api/ratios.js`
STAYS — `RatioTable` on the company page still calls it.

**IT FORWARDS TO PORTFOLIO MONITOR**, which is the surviving surface nearest its
purpose rather than a neutral fallback: that page's SECURITY axis is one row per
company across every vehicle the family holds it through, and each row opens
`/stock/:securityKey`, where the price, the returns table, the ratios, the
filings and the family's own target and upside all still render per company.
Comparing four side by side is what is gone; reaching any one of them is not.

**AND `/watchlist` IS REPOINTED RATHER THAN CHAINED.** Stage 10w sent it HERE,
on the reasoning that Compare was the surviving surface in the same nav group
that still rendered a target and its upside. That reason expired with Compare,
so it goes straight to its own final destination — **two hops settle at the same
pathname as one, which is exactly the stale routing `check-family-inputs.mjs`
records it cannot catch.**

**NOTHING THE FAMILY TYPED WAS DELETED.** `src/lib/watchlist.ts` is untouched
and `InvestmentTools` still reads and writes every entry on a name's own company
page. `readWatchlist`'s last caller OUTSIDE that file has gone, so it now LOOKS
like an orphan while `readEntry` and `writeEntry` still call it — said at its
own definition, because that is exactly how a store the family typed into gets
deleted a release later.

**AND ONE CHECK ASSERTED THE OPPOSITE AND WAS INVERTED, NOT DELETED.**
`check-family-inputs.mjs` carried *"the Research group survives with Compare
Companies in it"* — true until the one that survived was removed.

#### Ten bugs reintroduced, and one weak check replaced before the pass

Each was put back on its own, rebuilt and swept, and each fired exactly its own
check: the Polycab subtitle restored; the pill hover stripped of the derivation;
the Private Market pills back; the accounts count dropped from the tile; a
private holding made quotable (which names the offenders in the failure line);
the donut's count deleted; a class dropped from the excluded card (**two checks,
from two directions**); the Unclassified hover removed; the Compare nav entry
restored (**two — the entry and the group heading**); and the `/compare`
redirect deleted.

**AND ONE NEW CHECK COULD NOT HAVE FAILED, WHICH IS WHY THE PASS IS WORTH
RUNNING BEFORE THE COMMIT AND NOT AFTER.** The first draft of the excluded
card's guard asserted that *no class named as excluded appears as a sector row*
— and the two name spaces never collide, because sectors are GICS and the
classes are `AssetClass`. It was replaced by the card's total tying to its own
list, which fires. What actually guards the original defect — a fund standing at
the head of a sector table — is the fund-NAME check that has been there since
Stage 10h.

**TWO MORE OF THE NEW CHECKS FAILED A CORRECT PAGE AND WERE FIXED**, both for
reasons this file has recorded before. `cr()` returns **NaN** for a missing
match, so `cr(a) ?? cr(b)` never falls back — NaN is neither null nor undefined
— and the reconstruction reported that it could not read figures the page was
rendering. And a sector row's NAME is on its own line: the name cell is a flex
container whose chevron and swatch are flex items, so `innerText` breaks before
the figures. Matching `Unclassified\t` found nothing and **ABSTAINED** on a page
whose largest sector is exactly that, which is the evidenced-abstention trap —
a gate that cannot see its own subject reports "not applicable" rather than
failing.

`build` · `tsc` · `test:ingest` 140 · `test:family` · `check:family` 57/0 ·
`check:pages` **136 combinations clean** (138 less the two the removed
`/compare` route walked), with the same two pre-existing abstentions.
`glowData.ts` is untouched — nothing here reads the ingest.

### Stage 10aq — SECTORS FOR TWO SETS, AND THE MAP THAT MADE THEM POSSIBLE

Four asks, and the one that took the work is the one that looked smallest.

#### 1. *"remove the highlighted text from the dashboard ui"* — the Portfolio Monitor's two grey paragraphs

Audited line by line before anything went, the Stage 10aa / 10ai / 10al pattern,
because most of it carried a FIGURE:

| The claim | Kept? |
| --- | --- |
| "One row per company, ranked by total exposure" | chrome — the table is one row per company and sorts on that column |
| "A FUND IS NOT A STOCK and is no longer a row" | chrome — no fund is in the table to contradict it |
| **the DERIVED fence** | **moved UP, onto the two columns it is about** |
| the coverage, the five buckets, the AIF block, the clubbed count | inside a one-line fold |
| the loading / unreachable states | in the SUMMARY, unfolded |
| "Weight is a share of the book, not of the holdings you picked" | already on the column — `weightPlain` is the `plain` line of every Weight cell's own popover and the footer's title carries it |

**A COLLAPSED ONE-LINER IS NOT A WALL OF PROSE**, and it is the form this book
already uses for "the rest are NAMED" (the excluded accounts on the NAV card).
What the family objected to was seven lines of grey under their table; what they
must not lose is a table that quietly reads as the whole of their money, so the
summary still states the one thing they act on — `covers ₹299.6 Cr of the
₹710.4 Cr book`.

**THE FENCE DOES NOT GO IN THE FOLD, AND NOT IN A HOVER EITHER.** *"It says
DERIVED, not a position, in words rather than in a tooltip"* is a rule of this
book. `Th` grew a `note`, so `Via funds` carries **derived** and `Total exposure`
**incl. derived** under their labels — visible whatever the fold is set to, on
the column each is about, which is strictly better than the paragraph was.
`check:pages` reads them structurally through `data-col-note`.

**AND THE PROBE HAD TO LEARN TO OPEN THE FOLD.** Three invariants read that
text; a collapsed `<details>` is not in `innerText`, so unopened they would have
reported it unparseable — an ABSTENTION, not a failure, retiring all three in
silence. The same fix the excluded-accounts block already needed.

#### 2. Sector Composition gets the family's own two sets

*"add a toggle switch for direct equity and consolidated. in direct equity we
will show only the sector composition of direct equity holdings, and in
consolidated sector composition we will show sector composition based on the
aggregate securities weightage as per the data from the security filter in the
holdings in portfolio monitor."*

**NEITHER IS THE SET THIS PAGE USED TO SHOW.** It was company shares —
mandate-chosen and self-bought — and the two asked for sit either side of it.
**Consolidated is the default**, a decision rather than an ordering: it is the
widest, and opening on Direct Equity would take ₹127 Cr of mandate-held shares
off the first paint, which this page's own header note has always warned against.

**ONE DEFINITION, AND THE TWO PAGES ARE HELD TO IT.** `companyExposure` in
`lookthrough.ts` is what the Monitor's stock axis and this view are both built
on, and `useStockExposure` assembles the three inputs `loadStockExposure` needs
(which vehicles the family holds and at what value, the ISIN bridge, the
ring-fence) once instead of per page — two of those fail silently when got
wrong. Measured, the two pages agree exactly:

| | Monitor · Security axis | Sector Composition · Consolidated |
| --- | ---: | ---: |
| Direct + PMS | ₹222 Cr | ₹222 Cr |
| Via funds | ₹77.6 Cr | ₹77.6 Cr |
| Total exposure | **₹299.6 Cr** | **₹299.6 Cr** |
| companies | 565 | 565 |

and the page's three tiles rebuild the book: ₹222 + ₹77.6 + ₹410.8 = ₹710.4 Cr.
`check:pages` holds both to ONE derivation off `glowData.ts` — if they ever
diverge, one of them is wrong.

**A RETURN IS REFUSED THROUGHOUT THE CONSOLIDATED VIEW, with its reason.** Its
value column is part measured and part derived and no statement reports a cost
for the second, so a percentage would divide a part-measured gain by a cost
covering a fraction of its own numerator — "a total must tie to its own columns",
one column wider. `AbsentCell` with that cause, never a bare dash.

#### …and Direct Equity was one grey wedge, which is a finding

**NOT ONE of the 37 company shares the family bought in its own demat or broking
account carries a sector.** A depository statement prints an ISIN, a quantity and
a rate and no industry at all, so read off the book alone this view is 100%
Unclassified — true, and it answers nothing.

What places them is an identifier. Fourteen of those ISINs are named in a monthly
portfolio disclosure filed by a fund **this same family holds**, and that filing
prints the company's industry. Joined on the ISIN — exactly, never on a name —
and resolved through the one committed map: **14 of 37 placed, ₹44.0 Cr of
₹94.9 Cr, and ZERO where two filings disagree.** The view draws 6 sectors instead
of 1.

**IT ONLY EVER FILLS AN EMPTY SECTOR** and can never contradict the book: a
position whose own statement printed one keeps it. So this page places names the
rest of the app leaves unplaced rather than placing them differently, and it says
so with the count — 84 from the family's own statements, 364 from a filing. The
durable fix is a backfill pass in the ingest; it is named here rather than done,
because `build-lookthrough` reads the book that would consume it.

#### The map is why any of that works, and my first measurement of it was wrong

`shared/sectors.mjs` carried the AMFI taxonomy's MACRO level ("Financial
Services", "Capital Goods"), which arrived with the PMS fact sheets. A fund's own
SEBI disclosure prints the INDUSTRY level, and none of it was there: **57 of 65
distinct labels resolved to nothing, 1,009 of 1,318 disclosed lines Unclassified**
— a sector table where a fifth of the book says "we could not place this" for want
of a map entry rather than for want of a source.

**THE FIRST MEASUREMENT SAID THE OPPOSITE, AND IT WAS MINE.** `resolveSector`
returns `{ sector, matchedBy }`, and a test comparing it against the STRING
`"Unclassified"` passes on every label — so the first pass reported "all 65 map,
zero unmapped" and would have shipped a Consolidated view mostly grey. Caught by
the per-company follow-up printing `[object Object]`. It is the
plausible-wrong-answer this repo exists to catch, arriving in the measurement
rather than in the page.

Fifty-seven entries added, one GICS sector each, listed as the disclosures print
them. Two are deliberately NOT listed: `UNRATED` joins `PROVIDER_UNCLASSIFIED`
(the filer declined to classify), and `Units of Infrastructure Investment Trusts`
has no GICS home — GICS names equity REITs and does not name InvITs, so placing
one in a company sector would assert a classification GICS does not make.

**AND IT MOVED THE BOOK BY EXACTLY ONE POSITION**, which is the check that says
this was a map extension rather than a re-measurement: Chemfab's `CHEMICALS`
prefix-matches the new `Chemicals & Petrochemicals` entry and leaves Unclassified
for **Materials**, ₹3,74,700. That is the map's own documented prefix rule doing
what it is for. `glowData.ts` is regenerated and idempotent.

#### 3. *"what is uncalled capital? … what is distributions?"*

The client, on two Private Market tiles. Both halves of each are answered **on the
tile** — `StatTile`'s `hint` renders on screen — because a definition a reader has
to point at is a definition they will not find. WHAT it is first, because the
figure means nothing without it; HOW it is arrived at second, including the two
folios the uncalled figure cannot cover. The second tile is renamed
**Distributions (cash returned)**: its sub-line had always said "distribution
figure", so a reader asking what a distribution is was reading a word the tile
used and never defined.

#### 4. *"rename consolidated NAV as Current Value of Holdings … wherever it is written"*

Every rendered label — the Morning CIO tile, the top bar, NAV & Performance, Data
Refresh, the drill-down's title and `backs` — **and the prose**, which is where
the instruction's "wherever" bit: the phrase was in sentences on Compare
Companies, the stock page, Register, the NAV card, the chat panel and a
drill-down note. Code comments keep it; nothing there renders.

**TWO OF THOSE SURFACES HAVE SINCE BEEN REMOVED**, by Stage 10ao and 10ap on the
way in: `Drilldown.backs` went with the header pill row, and Compare Companies
went entirely. The rename is recorded against them anyway rather than tidied out
of this list, because the surfaces it had to reach is what the instruction's
"wherever" measured, and a later removal does not unmake the audit. What DID
have to change is the check that guards it: `DRILLDOWN_CHROME_GONE` asserts the
retired pill never comes back, and it named only the OLD label — so it could not
have fired for the pill returning under the label the app now draws. It matches
both.

**AND THE RENAME BROKE FOUR CHECKS, WHICH IS THE POINT.** The sweep reads this
tile's figure OFF ITS LABEL to feed other invariants, and three more find the
tile by matching `/consolidated nav/i`. A rename the probe did not follow would
have made those report NOT CHECKED — an abstention, not a failure, and how a
check retires itself in silence. The new both-directions assertion is what
surfaced it, and it is also what found the prose: it failed while the tile was
already correct, because `NavVsIndex` renders the phrase inside a fold the sweep
opens.

#### 5. …AND THIS PAGE'S OWN FOOTERS WENT WITH THE REST, ON THE WAY IN

Stage 10ap removed Sector Composition's footer paragraph at the family's request
— *"Remove all the highlighted text and the sections from the dashboard UI"* —
while this branch was open, and this branch had written a NEW footer for each of
its two views. Merging the two by keeping both would have re-landed on the page
the exact block they had just asked to be rid of, one per view, which is the
letter of the merge and the opposite of the instruction.

**SO BOTH FOOTERS GO, AND EVERY CLAIM WAS AUDITED FIRST**, the same way Stage
10ap audited the one it replaced. Most of what they carried was already on the
page in the partition cards this branch built; three things were not, and each
moved onto the figure it describes rather than into a fold:

- **the row COUNT and that the set is deduped** → the donut hole, under the
  total, with the view's own noun (Consolidated rolls up COMPANIES, Direct
  Equity rolls up HOLDINGS — a count under the wrong noun is the caption
  failure this page has already paid for);
- **the two-tier sector provenance** — how many companies a family statement
  placed and how many a fund's own filing did — → the donut hole, as two
  counted figures. This is the one a reader cannot infer: it is the whole reason
  the page can place a depository holding at all;
- **why Unclassified is unclassified** → the hover on that row and its legend
  entry, which is where an absence's reason belongs.

**AND THAT REASON IS WORDED PER VIEW, which the merged-in version could not be.**
Stage 10ap's constant reads *"these are company shares, so the sector exists; the
document simply does not report it"* — true of Direct Equity, which has ONE place
to have looked, and silent about Consolidated, which has a second: the industry
an AMC filed against the same ISIN. A reason that names the wrong cause sends the
next reader to the wrong source, so `unclassifiedWhy` takes the view.

**THREE HELPERS LOST THEIR LAST CALLER AND WERE DELETED, NOT LEFT.**
`privateMV`, the standalone `unclassified` binding and `shareOfTable`. The last
is worth naming because Stage 10ap had just ADDED its callers: it printed a
subset's share of this table, which fitted cards that split the ONE set the page
drew. The cards here describe the active view and what sits OUTSIDE it, so the
only percentages it could produce were 100% and a share of a denominator the
reader cannot see. A helper with no caller is the failure this file keeps
naming, so it went with them rather than being kept for a future one.

**Seven bugs reintroduced, each firing its own check**: the Consolidated view
showing only the measured half (fires the two-page identity), the default view
moved (5), the disclosed-sector fallback dropped so Direct Equity is one wedge
again, the derived markers taken off the columns (2), the grey paragraph put
back, the uncalled-capital tile stripped of its definition, and the tile rename
reverted (4).

`build` · `test:ingest` 140 + 35 · `test:family` · `check:family` **57/0** ·
`check:pages` **146 combinations clean**, with the same two pre-existing
abstentions. `build-book` regenerates the book BYTE-IDENTICALLY, which is the
gate that says a sector-map extension moved one position's classification and
nothing else.

**THAT COUNT IS MEASURED ON THE MERGED TREE AND DOES NOT FOLLOW FROM THE ONE
ABOVE IT.** Stage 10ap states 136, which was true of the branch that wrote it
and is not a fact about main: three PRs landed in parallel and the last to merge
carried a count struck against its own base. This branch adds one route
(`sectors-direct`) and removes none, so the two figures cannot be reconciled by
arithmetic — which is the point of re-running the sweep rather than adding to a
number, and the same reason `docs/BOOK-REPORT.md` counts rather than asserts.

### Stage 10ar — THE NAV SERIES REACHES BACK, AND THE RETURNS ARE ATTRIBUTED

*"fix this portfolio NAV, we are only able to see portfolio NAV for a very short
period of time. Build return attribution over a period, against the benchmark —
'what was my portfolio value in end of August 2025? What's my portfolio value end
of August 2026? What was the attribution to those returns in 2026? So what did
the benchmark do? What did I do? What did my portfolio do? In this last year,
return attribution… which were the biggest detractors of returns?' All of these
questions in my mind, these should be visible in this section."*

**FOUR QUESTIONS. THE ARCHIVE ANSWERS THREE, AND THE FOURTH IS A REFUSAL WITH AN
ASK.** Measured before anything was built, which is the whole of why the split
is stated rather than glossed:

| The question | Answered from |
| --- | --- |
| what moved, and which names | **NEW** — the four-term bridge over 268 holdings priced at both ends of a window |
| what did the market do | the Nifty 500 over the same span, already fetched |
| what happened over the last year | **NEW** — the managers' own published one-year returns, each beside the benchmark THAT MANAGER publishes, on the same document |
| what was it worth in August 2025 | **ABSENT.** The archive's earliest dated valuation of any kind is 2026-03-31 |

#### 1. The series was 34 days because of a rule, not because of the archive

`navHistoryFrom` began the series where EVERY covered account had published —
2026-07-10 — because a NAV LEVEL that climbs ₹27 Cr → ₹142 Cr as accounts ARRIVE
reads as performance. That rule was right about the level and it threw away 40 of
the archive's 74 measured days, which is exactly what the family reported.

**A CHAIN-LINKED INDEX NEEDS A CONSTANT PANEL ACROSS EACH LINK, NOT ACROSS THE
WHOLE SERIES.** Each point now carries the interval ending at it, struck over the
accounts valued at BOTH its ends:

```
r = (linkClose − flowIn) / linkOpen − 1
```

An account first publishing on a date is in neither end of the link ending there,
so its arrival contributes **0.00%** instead of a step. Measured, the panel grows
4 → 13 and the series runs **7 points over 34 days → 12 points over 74**, from
2026-05-31. `navSeries.ts` chains on the link; `windowReturnPct` reads +5.09%
where dividing the LEVELS reads **+398.76%**, and the suite asserts that gap
rather than only the right answer.

**THE RAW NAV LINE IS THE ONE THING A CHAIN-LINK CANNOT RESCUE**, because it is a
LEVEL. It is rebased where the panel completes and is `null` before it — not NaN,
which reaches the axis domain and drags it. `panelComplete` rides on every point
and `panelCompleteFrom` in the coverage block, so the old rule survives exactly
where it is load-bearing.

**AND THE RAW-vs-ADJUSTED PAIR IS NOW STRUCK OVER ONE WINDOW.** The toggle's
hover set the whole series' adjusted return against the raw line's last value —
74 days against 34, calling the extra weeks a deposit. Both figures were right on
their own terms, which is this card's own footer rule failing inside a tooltip.
Both are over the complete-panel segment now (+9.29% against +0.54%, the original
pair), and the hover SAYS so.

#### 2. Return attribution — 268 holdings priced at both ends, and nothing read them

**SIXTEEN ACCOUNTS PUBLISH A VALUED HOLDINGS STATEMENT AT TWO OR MORE DATES, AND
THOSE STATEMENTS ARE PER HOLDING.** Goldstandard prints 32 rows at 10 July and 32
again at 11 August, SVAN 46 rows at three month-ends, Green Lantern 34 at two.
That is the **seventh** absence in this book recorded against a premise nobody
rechecked — after FRED, the RBI, the release calendar, the ISIN tier, the NAV
series itself and 3P's redemption on page 2.

**THE SPLIT IS EXACT, AND THAT IS THE WHOLE LICENCE FOR PUBLISHING IT.** Market
value is quantity × the statement's own mark wherever a price is printed — rule
3, and MEASURED rather than assumed: of 794 valued rows across the archive's
holdings documents, 765 carry both and **every one satisfies the identity to the
paisa, zero do not**, and the other 29 carry no price at all. So

```
v₁ − v₀  =  q₀·(p₁ − p₀)  +  (q₁ − q₀)·p₁
            └─ PRICE ──┘      └── TRADING ──┘
```

with **no residual**. Nothing is apportioned, smoothed or fitted.

**FOUR TERMS, BECAUSE TWO WOULD HIDE THE LARGEST MOVEMENT IN THIS BOOK.** A
holding that ENTERED contributes its whole closing value and one that EXITED its
whole opening value. Folding either into `tradeEffect` is defensible arithmetic
and a bad answer: V.E.C 128005 runs ₹9.24 Cr → ₹20.29 Cr, +119%, and essentially
all of it is the ₹11.24 Cr of Fund Deposits `accountXirr.test.ts` already gates
that account for. Split out, the bridge SHOWS it as capital. On this book:

| | |
| --- | ---: |
| Opening value, 13 accounts, 2026-05-31 → 2026-08-13 | ₹126.28 Cr |
| **Price** — the only term that is performance | **+₹2.54 Cr** |
| Trading | +₹8.37 Cr |
| Bought in | +₹10.72 Cr |
| Sold out | −₹8.23 Cr |
| Not split — no per-unit price at one end | +₹0.49 Cr |
| Closing value | **₹140.17 Cr** |

and it covers ₹140.17 Cr of the book's ₹710.39 Cr, because every other account
publishes one statement and **a level is not a change**.

**A ROW WITHOUT A PRICE IS ITS OWN TERM, NEVER ZERO.** Cash sleeves and AIF units
marked at a total value have no split. 360 ONE holds one such line and its value
still moved ₹1.44 Cr → ₹1.47 Cr; printed `+₹0` that reads *this mandate went
nowhere*, which is a measurement nothing made. Those cells render `AbsentCell`
with the reason — and the **Not split** column exists so the row still ADDS
ACROSS. Without it the row read open ₹1.44 Cr, price ₹0, trading ₹0, in/out —,
close ₹1.47 Cr, which is "a total must tie to its own columns" one table over.
**It was found by reading the rendered page, not by reasoning.**

**A NAME HELD IN SEVERAL ACCOUNTS IS ONE CONTRIBUTOR** — the rupee impact adds
and the percentage is re-derived from the combined opening value, never averaged
across positions of different sizes. Today's movers' own rule arriving through a
window: Ather Energy sits in both V.E.C folios at ₹33.69 L and ₹24.07 L and would
otherwise take two of the top five slots while understating itself in both. The
book's largest detractor is **Jammu Kashmir Bank −₹106.04 L, −19.47%**.

**EACH ACCOUNT KEEPS ITS OWN WINDOW.** Green Lantern's pair is 25 June → 27 July,
Carnelian's 10 July → 10 August, SVAN's 31 May → 31 July. One imposed window
would discard accounts or credit one with weeks of standing still, which is
`pooledXirr`'s own finding (5.44 pp on a quarter). Rule 3 applies too: one
`dedupeGroup` counts once, at its later row.

**AND AN ACCOUNT WHOSE BRIDGE DOES NOT TIE IS NOT PUBLISHED.** Every term is
arithmetic on printed primitives, so a gap above a rupee means a row landed in
two terms or in none — the account is dropped and NAMED in the run's notes.
`hdfcNsdl.mjs`'s licence, applied to a decomposition.

#### 3. The last year, from the managers' own reports — and no book-wide figure

**SEVEN ACCOUNTS PUBLISH A ONE-YEAR RETURN AND THEIR BENCHMARK'S ONE-YEAR RETURN
ON THE SAME DOCUMENT**, struck by the manager who runs the mandate. That is a
primary-source answer to *"what did the benchmark do? what did I do?"* over
exactly the period asked about — V.E.C 128004 **+30.46% against BSE 500 TRI
+4.93%**, Carnelian +15.84% against S&P BSE 500 +5.89%, SVAN 8710067 +7.27%
against +2.98%.

**BOTH FIGURES MUST COME FROM ONE BLOCK, and that is not a nicety.** Green
Lantern's fact sheet closes 27 July and its performance history 10 August, and
the S&P BSE 500's one-year reads **1.22% on the first and 5.89% on the second**.
Pairing across documents prints a 14.93 pp active return where the document says
10.30 — two windows in one row, and `attribution.test.ts` asserts the pairing per
account by `source`.

**AND THEY ARE NEVER AVERAGED INTO A BOOK FIGURE.** Different fee bases
(Goldstandard after fees, Carnelian before), different benchmarks (N50TRI, S&P
BSE 500 TRI, NSmCap250TRI) and different end dates. A weighted mean of those is a
number no document supports, so the card REFUSES it in words and names the five
accounts whose report carries no such pair. The refusal is the deliverable, which
is why it is asserted as text: a card that averaged them would render a perfectly
plausible percentage that no value check could see.

#### 4. August 2025 is a refusal, and two substitutes were available

Measured, not assumed: the archive's earliest dated valuation of ANY kind is
**2026-03-31**, and the earliest belonging to an account that publishes twice is
2026-05-31. So the opening side of that comparison does not exist, and neither
does any calendar year's.

**TWO PLAUSIBLE SUBSTITUTES WERE AVAILABLE AND BOTH ARE REFUSED.** Cost basis is
dated on **3 of 371** positions, so "what it was worth a year ago" cannot be
backed out of cost; and `BOOK_CAPITAL_MOVES` runs to 2023-05-04, so an opening
value could have been *inferred* from capital in less capital out. **Neither is a
valuation.** The ask is one document — a holdings statement per account dated on
or before the date in question — and the card says so with the figures behind it.

#### 5. `/performance`'s stale absence, which this change made a contradiction

That page rendered *"No valuation series in this book · each account's statements
carry exactly two dated portfolio values"* for five deliveries after it stopped
being true, and this file already named it as the SIXTH unchecked-premise absence
and *"one `<NavVsIndex />` away"*. It draws that chart now, off the same
generated series, so the two pages cannot disagree about what the book measured.
Both halves are asserted, and neither implies the other: a build that deleted the
card satisfies the absence check and draws nothing.

#### Fifteen bugs reintroduced, and the harness itself was the first defect

**THE RESTORE SILENTLY DID NOTHING.** Two of the files this pass patches are NEW
and therefore UNTRACKED, and `git checkout -- <untracked>` is a no-op — so the
first run left every bug in place and reported the accumulated failures under
each later bug's name. Caught by running a NO-PATCH CONTROL, which came back
with four failures on an unchanged tree. The harness snapshots to a temp dir and
restores by copy now. **A restore that cannot restore looks exactly like one that
did**, which is this file's own `set -e`/`trap` lesson in a new shape.

Thirteen of the fifteen then fired their own check on the first attempt. **The
two that did not are the point of doing it**, and both were gaps in the sweep
rather than in the pages:

- **Chaining on the LEVEL again makes the Book pill read +398.76% instead of
  +5.09%, and the whole sweep stayed CLEAN.** Every existing invariant on that
  card checks the header's shape, the chart's geometry and the panel sentence,
  and **not one looked at the MAGNITUDE of the figure**. `test:family` caught it;
  the screen is where a reader would have believed it. The pill is now reconciled
  against the book's own links, computed in `check-pages.mjs` on a path the page
  does not take — and against the WRONG chaining too, so an equality written only
  one way round cannot pass.
- **Rebasing the raw NAV line at the series' first point draws it climbing ~440%
  over a growing panel** and blows the y-axis domain out so far that both real
  lines flatten. Also clean, because the hover's pair is computed separately and
  stays right. The dashed curve's own vertex count is now checked against the
  book's complete-panel point count.

Three more defects were found this way in the checks themselves: `innerText`
returns `""` for everything inside a collapsed `<details>` (the per-account table
came back as eight empty cells and failed a correct page); `\b` does not exist
between two word characters, so `/\bperformance\b/` matched nothing in the
inline-badge cell `"PricePERFORMANCE"`; and a reason regex was struck on a
PARAPHRASE (`no per-unit price`) of a sentence that reads *"carries a per-unit
price on both statements"*.

**AND THREE `navSeries.test.ts` CHECKS ENCODED THE RULE THIS CHANGE REPLACED.**
One asserted no covered account's first valuation is later than the series'
start; it moved down a level, to `panelCompleteFrom` and the per-point flag. One
compared the whole series' adjusted return against the raw line's last value —
which silently became 74 days against 34 — and is struck over the complete-panel
segment now. One reproduced the chain by dividing levels, which is the bug. The
same fixture-shaped calibration was in `check:pages`: *"the book must read BELOW
the index"* was the fixture's outcome standing in for the claim, and inverts on a
card that is correct.

`build` · `tsc` · `test:ingest` 140 + 84 + 35 · `test:family` (a new
`attribution.test.ts`, anchored on the generated book) · `check:family` 57/0 ·
`check:pages` **146 combinations clean**, with the same two pre-existing
abstentions. `npm run build-book` was run as a CONTROL first and regenerated
byte-identically, so every difference belongs to this change; `BOOK_SUMMARY` does
not move by a rupee, because a decomposition of a window is not a re-measurement
of the book.

### Stage 10as — EVERY INSTRUMENT, NOT JUST STOCKS; AND A CLOSED POSITION IS NOT AN ALLOCATION

Four asks, and the last two turned out to be one defect seen from both ends.

*(Numbered `10as` rather than `10aq`: main took THAT letter and then `10ar` too,
while this branch was open — the same parallel-branch collision Stage 10al
already records, twice over. Four PRs landed on main during this branch's life,
which is why the letter moved twice and why every count below was re-measured on
the merged tree rather than carried across. And
the first of the four asks below OVERLAPS main's own — both rounds pointed at the
grey paragraph under this table — so what shipped for it is MAIN'S answer, the
collapsed fold in Stage 10aq, and the subsection here records only what this
branch put beside it and what the merge had to correct.)*

*"remove the highlighted text from the dashboard."* · *"we only need to show the
current holdings in these allocation drill down pages, if anything has been
redeemed or sold completely then remove it from these pages since they are
supposed to be the current holdings allocation only."* · *"we also need to
account for the stock positions held through mutual funds and PMS as well… in
the security filter page in holdings toggle page."* · *"the Look-through must
cover bonds, NCDs and every instrument, not just stocks. Any stock or bond. It
could be a bond. It could be an NCD. **If I type it, it has to first pick up.**
And then it has to show me how much — not just stocks. For example — there is a
LIC housing NCD in the market. Now there's some negative news on LIC housing. I
want to see how much LIC housing I hold through my mutual fund exposure and
through which mutual fund."*

#### The look-through read one section of a document it already had

`build-lookthrough` read `holdings-direct/` — the AMC's monthly filing, EQUITY
SECTION ONLY, `meta.section` reading "Equity Holdings" on all 17 schemes. The
same repo carries **`public/amc-portfolio/`, which is the SAME FILING read
whole**: identical `sourceUrl`, every asset class, and **an ISIN on every one of
157,125 rows**. Verified before switching, not assumed. So the equity-only limit
this book had recorded as a real one was an absence against a document already in
hand — the **seventh** of those, after FRED, the RBI, the release calendar, the
ISIN tier, the NAV series and 3P's own page 2.

| | was | now |
| --- | ---: | ---: |
| disclosed rows in the store | 1,394 | **2,362** — Equity 1,394 · Debt 964 · Other 4 |
| schemes resolving to ZERO rows | 3 liquid funds | **0** — 214 / 161 / 151 debt lines each |
| derived exposure | ₹77.6 Cr | **₹90.56 Cr** |
| the part of a disclosed fund no line accounts for | ₹45.7 Cr | **₹32.73 Cr** |

**NOTHING ABOUT THE JOIN LOOSENED.** ISIN first, then this book's own
`securityKeyOf`, and **still no fuzzy tier** — the refusal `shared/nameMatch.mjs`
already records, where a token-overlap rule matched `KIRANAKART TECHNOLOGIES` to
`TATA TECHNOLOGIES`.

**AND `techmuns/amfibeas` IS READ-ONLY, as it has been since Stage 10s.** Nothing
here clones, updates or writes to it; the checkout is an INPUT (`AMFIBEAS_DIR`).

#### An Indian ISIN carries its issuer in characters 1–7, and that is the whole fix

```
INE115A01026   LIC Housing Finance   —  the equity share
INE115A07QY1   …the same company     —  an NCD
INE115A14FW4   …the same company     —  commercial paper, matures in three weeks
```

Keyed on the FULL ISIN, one company got as many rows as it has instruments. And
the rule beside it made that worse rather than visible: `takenHere` kept **ONE
DISCLOSED LINE PER FUND PER COMPANY** and dropped the rest, which was right while
the store carried the equity section alone — there the only repeat was a second
share class. On the whole filing it is the difference between an answer and a
wrong answer: **HDFC Balanced Advantage files TWELVE separate LIC Housing NCDs,
and keeping the first reports 0.6% of that fund against a true 1.74%.**

A row is one **ISSUER** now and its `instruments` are what it is made of, opened
underneath — because a reader acting on news about a company needs to know
whether they hold the equity, the paper, or both. `seenHere` still drops an exact
repeat: the same ISIN filed twice in one scheme is one holding printed twice.

**THE ISSUER TIER WAS MEASURED BEFORE IT WAS RELIED ON.** 1,052 ISINs collapse to
557 issuer prefixes; **34 carry more than one spelling and every one of those 34
is one company written two ways** — NABARD / National Bank for Agriculture and
Rural Development, REC / Rural Electrification Corporation, Tata Power / The Tata
Power Company. **None merges two different companies.** And it is load-bearing
rather than decorative: **100 of 557 issuers have names that normalise to more
than one key** (HDFC Bank alone to twelve, because each commercial paper carries
its own maturity in the name).

**AND THE ISSUER'S ISIN IS THE ONE THAT NAMES THE ISSUER.** A row now spans a
share, an NCD and a CP maturing in three weeks — all real identifiers, and only
the first still identifies the company after that paper matures. `rankIsin` takes
the BOOK's own where the book carries one, then the `01` equity series, then
anything else. It never invents one; every candidate was filed.

**`industry` IS TWO FACTS IN ONE COLUMN**, verified empirically: a SECTOR on an
equity row (`Finance`, `Banks`) and a CREDIT RATING on a debt one (`CRISIL -
AAA`, `ICRA A1+`). They are emitted as separate fields and neither is ever
printed under the other's heading — `upstreamStatus.ts`'s rule arriving through a
spreadsheet column.

#### …and the row had nothing to open, in three separate ways

*"If I type it, it has to first pick up."* Measured on this book, **553 of the
615 issuers a fund discloses are ones the book holds no position in** — including
LIC Housing itself. Every one of the three refusals was invisible on its own:

- **`securityNames` was keyed on `p.security` over the POSITIONS**, so a company
  only a fund holds was in no option. It unions the look-through's own names on
  the security axis now.
- **`derivedShown` was gated on `selected.size === 0`**, so picking a name
  suppressed the very rows the pick was for. The gate is per-row now.
- **The row carried no `venues`, so it drew no chevron** — and the expansion was
  gated on `assetClass === "Equity"`, which refused an issuer reached through its
  NCDs. It is `canLookThrough` now: an issuer, whatever paper of theirs a fund
  holds, excluding only a FUND row (a scheme holding itself is not a look-through)
  and CASH. A derived-only row gets its own expansion branch rather than an empty
  version of the venue one, because a route-split sentence over zero routes and a
  table with no rows are both statements about a measurement that does not exist.

**AND THE ROW'S CLASS IS WHAT THE FILINGS SAID.** `assetClass: "Equity"` was
hardcoded on a derived row; an issuer the family reach only through its bonds is
not an equity holding, and filing it as one is the fabricated-classification
failure. It is `e.classes` joined now — `Debt`, `Equity`, or both.

Measured end to end, the family's own example: **LIC Housing Finance across SEVEN
funds, held as Debt AND Equity**, twelve NCDs inside HDFC Balanced Advantage, CPs
in two liquid funds, equity in Bandhan, Kotak and ICICI.

#### A closed position is not a holding, on any allocation surface

`currentHoldings` in `analytics.ts`, **one definition read by every surface that
draws an allocation**. The monitor had dropped closed positions a stage ago;
`/holdings` and Private Market had not — Private Market drew 3P's three unit
classes at ₹0 apiece, three of its fourteen fund rows.

**AND `/holdings` FILTERS INSIDE `resolveDrilldown`, NOT AT THE PAGE BOUNDARY,
WHICH IS THE HALF THE MERGE CORRECTED.** This branch narrowed the set as it
entered the page; main filters where the SET is defined and carries
`closedExcluded` out with it, so the table's own subtitle names the rows it
dropped — *"N closed positions are not listed: the fund still publishes a NAV,
the family no longer holds them"*. A boundary filter leaves that count at zero
and the page falls silent about them. **Main's is what stands.**

**AND MORNING CIO *IS* NARROWED, WHICH THE MERGE GOT WRONG ONCE BEFORE FIXING.**
The reasoning above looks as though it should extend to the tile — narrow the
tile too and nothing anywhere accounts for the five — and it does not, because
`/holdings` builds its own set from the portfolio context rather than from
Morning CIO's locals. `closedExcluded` is 5 either way and the subtitle prints
either way, so BOTH can be true at once: the tile counts 364 and the drill-down
still names what it left out. The family settled it in the same words —
*"exclude closed rows from morning cio positions too."* A tile that disagrees
with the page it opens is the one failure `drilldown.ts` exists to prevent, so
Positions reads 364, Distinct names 208, and the cost coverage 55 of 364. The
count reconciliations are plain equality again rather than carrying a gap term.

**AND IT GOES THROUGH `currentHoldings`, NOT AN INLINE PREDICATE.** Five surfaces
now ask what the family currently holds — this page, the Portfolio Monitor,
Private Market, the fund look-through and `resolveDrilldown` — and a fifth copy
of the test is a fifth chance for one screen to disagree with the others about
which rows are still held.

**IT MOVES NO MONEY, WHICH IS WHY THE COUNT IS THE ONLY THING WORTH ANCHORING.**
A closed position is a measured ₹0 with no reported cost: NAV, Capital invested,
every allocation row, every weight and every return are identical either way. So
`check:pages` holds the rows against `glowData.ts`'s own closed KEYS rather than
against the tile — comparing the tile with the page it opens passes when BOTH
revert together, and that is exactly how the regression would arrive — and holds
the subtitle's count against `closedCount` from the same source.

**`unvaluedAccounts` DELIBERATELY KEEPS THE WHOLE SET.** It asks a different
question — does this account report any holding at all — and narrowing it would
fold 3P's account into the list of funds that publish no NAV, which is the
opposite of true: it publishes one and redeemed against it. A confidently wrong
reason sends the next reader to ask a fund manager for a NAV no fund owes.

**AND THE `redeemed` PILL WENT WITH THE ROWS IT EXPLAINED.** It was the right
answer while `/holdings` was the one page that still listed them; a branch that
can never fire, wearing a confident explanation, is the dead-code-that-looks-alive
failure. `check:pages` INVERTS rather than being deleted with it — and it is
struck on `data-hb-key` rather than on the security NAME appearing in the page
text, because a name is clipped, wrapped and re-cased by the table it sits in
while the key is what the row IS.

#### The paragraph audit, and how it was reconciled with main's

Both branches audited the same grey paragraph claim by claim — the Stage 10aa /
10ai pattern — and reached DIFFERENT answers, which is exactly the case where a
merge must pick one rather than ship both readings of one screen:

- **main moved the load-bearing half into a collapsed `<details>`** and the
  derived fence up onto the two column headers. **That is what stands**, and it
  is the better answer: a fold is one click and is visible to a reader who never
  hovers, and its SUMMARY carries the loading and unreachable states, which a
  reader must not have to open anything to learn.
- **this branch moved the same facts into the footer cells' own hovers.** The
  partition hover on the `Total exposure` cell and the weight basis on the
  `Weight` footer both survive the merge, because main ships them too — a claim
  about a column belongs on the column, and the fold is where the five buckets
  are set out at length.

Two things this branch contributed to that audit stand on their own:

**AND THAT WEIGHT HOVER WAS WRONG.** On this axis every Weight cell divides TOTAL
EXPOSURE by the book, and the hover explained the printed percentage using the
MEASURED half alone — a figure a reader could not reproduce from the two numbers
they were given. It is the cell's own numerator now.

**`nonEquityValue` BECAME `unaccountedValue`, BECAUSE THE NAME STOPPED BEING
TRUE.** The debt sleeve is INSIDE the derived total now, so the remainder is what
no line in the filing accounted for — a scheme's cash, a metal ETF's metal, the
disclosure's own rounding. **A FIELD that misdescribes its own figure is the
caption failure one layer down, where every caller inherits it.** The fold and
the hover both say so, and the derived figure the partition is struck against
moved ₹77.6 Cr → **₹90.56 Cr** with the remainder falling ₹45.7 Cr → ₹32.73 Cr.

#### Sixteen bugs reintroduced, and FOUR of them were defects in the checks

- **The first attempt at the issuer bug changed nothing**, because the keying
  pass writes `issuerSeen`'s answer into `isinSeen` and the accumulation loop
  reads that first. The mutation had to move to the keying pass to isolate it —
  which is the whole point of doing this rather than reasoning about it.
- **Three checks ABSTAINED where the fact had been DELETED.** Restoring the
  `assetClass === "Equity"` gate removes the look-through card, and all three of
  its invariants reported NOT CHECKED over a **clean sweep**; deleting the
  partition from the footer hover did the same to three more. A missing panel and
  an absent hover are the defect, not a reason to abstain — `golden.mjs`'s rule,
  arriving twice in one pass.
- **Private Market had no invariant on WHICH funds it draws**, so the redeemed
  fund's ₹0 rows came back to a clean sweep. Every cell of such a row is correct
  and it adds nothing to any total, so no value check on that page can see it;
  the rows carry `data-pm-fund` now.
- **And one check had silently stopped biting.** `stock-mf-lookthrough`'s
  reconciliation matched a row shape of `name → one column → weight`, and the
  table gained a `Class` column when the store stopped being equity-only. It
  abstained on a page rendering perfectly. Anchored on the two adjacent cells it
  is actually about now.

The twelve that fired first time: the one-line-per-fund rule, the issuer tier,
the equity-only gate, the derived row's missing expansion, the pick-list dropping
fund-only names, closed positions back on `/holdings` and on Morning CIO, the
paragraph restored, the partition deleted, the weight hover's numerator, the
EQUITY ONLY sentence, a truncated breakdown, a debt line filed as equity, the
derived half summed into the measured column, and the look-through column on a
different basis.

**THE WALKED NAME IS DERIVED, NEVER TYPED.** `FUND_INSTRUMENTS` picks the issuer
ONE fund holds through the most separate instruments — the worst case by
construction, since a build that kept the old rule reports a twelfth of it — and
the next drop picks its own. The pick-list grew `data-multiselect` /
`data-option` and `/holdings` grew `data-hb-key`, because a claim about which
holdings a page draws must not be struck on prose a redesign is free to reword.

`build` · `tsc` · `test:ingest` 140 + 35 · `test:family` (10 new, anchored on the
committed store rather than on a fixture) · `check:family` 57/0 · `check:pages`
**148 combinations clean**, with the same two pre-existing abstentions —
MEASURED ON THE MERGED TREE, which is the only base any of these counts is a
fact about. Stages 10aq and 10ar each state 146 and this branch's own pre-merge
run stated 146 too; all three were struck against different bases and cannot be
reconciled by arithmetic, which is the point of re-running the sweep rather than
adding to a number. `npm run build-book` and `npm run build-lookthrough` are both
no-ops against the committed tree, which is what says the files on disk are what
the builders would write.

### Stage 10at — THE SECTORS ARE LOOKED UP, AND THE DONUT STOPS RUNNING OVER ITS OWN RING

Three asks on Sector Composition, sent with two screenshots of the page — the
Consolidated and Direct Equity views, with the grey explainer blocks highlighted:

*"fix the pie chart and text ui overlap."* · *"replace the highlighted explainer
texts with short and direct language explanation in legible font size. And it
has to be very short and direct, so it doesn't look cluttered."* · *"majority of
the classification of the securities is in the unclassified section, look up all
the holding securities sector classification on the screener.in website or any
other website and show them in their appropriate sector classification."*

The third is the one with the work in it, and it is the first time this book has
been asked to take a figure from **a source outside the family's own paperwork**.

#### 1. The Unclassified wedge was a MISSING MAP, not a missing document

Measured before a line was written, which is what says this was solvable at all:

| | Unclassified was | is now |
| --- | ---: | ---: |
| **Direct Equity** — 37 shares the family bought themselves | **100%** · one grey wedge over ₹94.9 Cr, 1 sector drawn | **13.2%** · ₹12.6 Cr, **9 sectors** |
| **Consolidated** — 565 companies, ₹299.6 Cr | **58.4%** · ₹129.7 Cr | **5.1%** · ₹15.4 Cr, **12 sectors** |

**NOT ONE own-account company share carries a sector, and that is a fact about
the DOCUMENT.** A depository statement prints an ISIN, a quantity and a rate and
**no industry at all** — so no drop of the current statements would ever fill
that column, and Stage 10aq's own note beside `directWithBookSector` says so.
The answer had to come from an identifier, and this book already resolves one:
`build-symbols` maps `securityKey` → the NSE trading symbol NSE itself issues.

**SO IT IS A LOOKUP, NEVER A JUDGEMENT — and that distinction is the whole of
why this is allowed.** A model assigning sectors from memory is
`VAL_METHODS[i % 5]` with better prose: a wedge on a donut carries no
provenance, so a fabricated classification is indistinguishable on screen from a
filed one, and sorting the table would change which company is a bank.
`scripts/build-screener-sectors.mjs` **fetches** each company's page, **proves**
it is that company, and **commits** what somebody else published.

#### `npm run build-sectors` — and four rules, each a wrong answer avoided

```
src/data/nseSymbols.json   securityKey → NSE symbol (build-symbols, ISIN-first)
   |  npm run build-sectors     fetch → guard → resolve → commit
   v
src/data/screenerSectors.json   symbol → { gics, screener's own words, joinedBy }
docs/SCREENER-SECTORS.md        what placed, what disagreed, what carries no symbol
```

**A PAGE MUST PROVE IT IS THE COMPANY IT WAS ASKED FOR.** A wrong symbol returns
a **complete, correct, well-formed** classification belonging to somebody else,
which is the worst fabrication available here because there is nothing on screen
to catch it by — and this repo has already measured that resolver being wrong
about a quarter of the time on a different vendor (Stage 10e: Aditya Birla
Capital → Tata Capital, Bajaj Auto → Bajaj Finance). So each page must **echo
the symbol back** (`NSE: <SYMBOL>`), and where it prints none — the SME listings
do not — its own H1 must agree with the book's name through this repo's
`securityKeyOf(stripDepositoryTail(...))`. **Neither, and the page is refused.**
Which guard let each entry through rides in the store as `joinedBy`, and the
suite asserts there is no third form: 156 of 160 by symbol, 4 by name.

**THE GICS ANSWER IS `shared/sectors.mjs`'s, NOT THE SCRIPT'S.** The script
stores screener's own label AND the GICS one, and the suite requires the second
to be exactly `resolveSector(the first)` — so the vendor tier extends the ONE
committed provider-label table rather than growing a second one. Two tables are
two chances for a company to sit under two headings on two screens, which is the
failure `holdingBucket`, `costCoversSet` and `companyExposure` were each
extracted for. Three screener labels are mapped (`Metals & Mining` → Materials,
`Oil, Gas & Consumable Fuels` → Energy, `Media, Entertainment & Publication` →
Communication Services) plus the eleven GICS names that are their own answer.

**THE MAP EXTENSION MOVED THE BOOK BY EXACTLY ONE POSITION**, which is the check
that says this was a map extension rather than a re-measurement: SASKEN
COMMUNICATION TECHNOLOGIES, ₹0.02 Cr, Unclassified → Information Technology, on
the `Telecom - Equipment & Accessories` entry that already existed. `BOOK_SUMMARY`
is byte-identical and `build-book` regenerates the whole file byte-identically.

**AND IT IS THE WEAKEST TIER, SO IT RUNS LAST AND ONLY EVER FILLS AN EMPTY
SECTOR.** `CompanyExposure.sectorFrom` is `book | disclosure | vendor | null`,
strongest first — the family's own statement, then a fund's SEBI filing joined on
the ISIN, then this. **Measured on the 84 companies where the book and the vendor
BOTH have an answer, they agree on 80 (95.2%)**; the four that differ are genuine
taxonomy judgements (GICS files a cinema under Communication Services, several
Indian IT-enabled providers under Industrials) and **the STATEMENT keeps its
answer on every one of them**. `docs/SCREENER-SECTORS.md` names all four, so any
one can be challenged.

#### What it still cannot place is NAMED, at its value, with the reason

Ten book companies resolve no NSE symbol and are not looked up. **The residual is
NOT the size the count suggests, which is exactly why the value has to be
printed beside it**: ₹12.5 Cr of the Consolidated view's ₹15.4 Cr — **81.6%** —
is ONE company, YASH HIGHVOLTAGE, a BSE-only SME **NSE does not list at all**.
No lookup keyed on an NSE symbol will ever reach it. The next four (Cosmo Films,
CreditAccess Grameen, Punjab Chem, Krishca) are the *"handful of listed COMPANIES
a PMS statement names without an ISIN"* this file already records as needing a
hand-checked `OVERRIDES` entry, and everything below them is a fund-disclosed
line worth lakhs.

**SCREENER'S OWN SEARCH FINDS SOME OF THEM BY NAME, AND THAT IS REFUSED.** Its
pages print no ISIN, so a name would be the only thing joining them and nothing
would corroborate it — `shared/nameMatch.mjs`'s rule, where a token-overlap tier
matched `KIRANAKART TECHNOLOGIES` to `TATA TECHNOLOGIES`. **There is still no
fuzzy tier.** They are listed in `docs/SCREENER-SECTORS.md` for a human to commit.

#### 2. The hole was three stacked lines inside a 112px circle

*"fix the pie chart and text ui overlap."* Reproduced rather than guessed at: the
donut hole carried a label, the total, the row count AND the sector provenance,
at 10.5px, inside an `innerRadius={56}` ring — so `OTAL EXPOSURE` clipped under
the ring and the lower lines ran over the wedges, which is what the screenshot
showed.

**THE FIRST GEOMETRY TEST WAS THE WRONG TEST**, and it passed a broken layout:
it measured the corner distance from the centre, which is far looser than the
real constraint. **A circle constrains a line of text by its CHORD at that line's
own height**, and a wide short line high in the hole has far less room than the
corner test allows. Re-measured on chords: `innerRadius` 56 → **66**,
`outerRadius` 96 → **98**, `!tracking-normal` on the label, and the two lower
lines OUT of the hole entirely — tightest slack **13.1px** on Consolidated and
18.1px on Direct Equity, confirmed by screenshot.

**THE TWO LINES THAT LEFT THE HOLE DID NOT LEAVE THE PAGE.** A figure a reader
acts on does not go away to fix a layout; it moves somewhere with room. The count
stays in the hole as one legible line, and the sector provenance became a line of
its own under the chart — **which made it better, not merely relocated**: it now
carries all three tiers with a count each, plus the unplaced count AND ITS VALUE.

#### 3. Six explainer blocks, each cut to one short line at a legible size

*"very short and direct, so it doesn't look cluttered."* They were `text-[11px]
text-slate-500` — small, grey and three or four lines each. They are `text-xs
leading-snug text-slate-400` now, **one line each**, and every one was audited
against the rest of the page before a word was cut, the Stage 10aa / 10ai / 10ap
method. What survives is what a reader ACTS on:

- the DERIVED fence — *"DERIVED, not a position … **No part of the book's NAV.**"*
  in words rather than a tooltip, which is a rule of this file;
- the three-way partition's closing claim, *"These three figures cover every
  rupee"*, because a table's total reads as the whole of a reader's money;
- and on Direct Equity, where the shares it leaves out are shown.

#### The checks moved off the prose, and two of them could not have failed

Six invariants read the removed paragraphs out of `innerText` and would have
retired themselves in silence — a regex that matches nothing yields an empty
result that passes `.every()`. They read **`data-donut-count`**,
**`data-donut-basis`** and **`data-sector-source`** (with `data-from-book` /
`-disclosure` / `-vendor`, `data-unplaced` and `data-unplaced-mv`) now: the
contract `data-section`, `data-mandate` and `data-row` already carry, and the same
rule — *a structural claim must not depend on prose a redesign is free to reword*.

**THE THREE PROVENANCE CHECKS ARE A FACTORY, RUN BY BOTH VIEWS, AND THE SECOND
VIEW IS WHY.** They were written for `sectors` alone, and unwiring the vendor
tier — the single most damaging regression this change can have — left
`sectors-direct` **GREEN**: its "draws sectors rather than one Unclassified
wedge" check is satisfied by the disclosure tier's 11 placements, while the 22
the vendor tier places, on the very view the family complained about, vanished
unnoticed. `sectorSourceChecks(bookCount)` is parameterised on the one thing that
differs between the views — how many companies the BOOK itself places, 85 against
**0** — so both now run all three, and both fire.

**AND THE PARTITION CHECK IS WHAT KEEPS AN ABSTENTION FROM STANDING ALONE.**
Dropping the unplaced residual makes *"the companies it could not place are
named"* report NOT CHECKED — correctly, since on that build nothing is unplaced —
and a suite that abstained there and nowhere else would read CLEAN over a page
that had silently lost its residual. The four sources must rebuild the donut's
own count, so that bug is a FAILURE on both views with the abstention beside it.

**TEN BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: the vendor tier unwired
(2), the vendor tier overruling a statement (2 — it moves companies out of `book`
and the exact count catches it), the donut's count handle deleted (5, across both
views), its counted-once hover deleted, a company counted by two tiers, the
unplaced residual dropped (2 + 2 abstentions), the residual keeping its count and
losing its value (2), the left-out card no longer saying where those shares are
shown, a stored GICS the committed map does not produce, a page accepted with no
round-trip guard, and the book and the vendor disagreeing wholesale.

**AND ONE OF THE SIX REPOINTINGS FAILED A CORRECT PAGE FOR A REASON THIS FILE
ALREADY RECORDS.** `label-xs` is `uppercase` and `innerText` returns the
TRANSFORMED text, so the left-out card renders `LEFT OUT BY THIS VIEW` while the
source says "Left out by this view" — and `sliceBetween` is a plain `indexOf`.
The same trap as "Listed NAV" three stages up, arriving through a slice instead
of a match.

**AND A FAILED PATCH THAT WRITES NOTHING IS WORSE THAN A FAILED PATCH.** The
first attempt at these six repointings ran as one script with `open(p,"w")` at
the end, asserted on the third substitution, and **discarded the two that had
succeeded** — so the file was untouched and the failure named only the third.
Each is applied one substitution per invocation now, and the bug harness restores
**and rebuilds** on a `trap … EXIT`: restoring the source alone leaves `dist/` at
the bugged build, and the next sweep reads it and reports the previous bug's
failures under the next one's name. Measured once in this session.

#### Merged with main THREE TIMES, and the union was the only safe resolution each time

This branch was open while **three** PRs landed on main, and two of them wrote a
stage section of their own — the 10aj/10al letter collision this file already
records, arriving twice more in one branch. Main's merged section keeps the
letter each time: 10ar went to the NAV attribution work, 10as to the
look-through pass, and this is **10at**, with the one cross-reference that points
here moved along with it.

**THE DANGEROUS CONFLICT WAS ONE LINE, IT WAS NOT IN THE PROSE, AND IT CAME BACK
EVERY TIME.** `check-pages.mjs` hands its invariants ONE ctx literal, so every
branch that adds a probe adds a key to that line — mine `donut` and
`sectorSource`, 10ar's `attrib`, 10as's `pmFunds` — and git presents them as a
single conflicting line on every merge. **Taking either side whole is a
clean-looking sweep that has stopped checking**, and both directions were
measured by reintroducing exactly that:

- dropping **`attrib`** turns 9 of that stage's invariants into **NOT CHECKED**,
  and the run still reports every combination CLEAN, because an abstention is
  counted apart from a failure;
- dropping **`pmFunds`** FAILS, by name, on `private-market`.

**Only one of those two would ever have been caught**, which is the whole reason
the resolution is a mechanical union rather than a judgement about which side
looks more important. It is this repo's own most-repeated defect — a field
carrying the right answer into no caller — arriving through a merge resolution
rather than through code, and the ctx line should be expected to conflict on
every future parallel branch.

**AND THE GENERATED FILES WERE NOT TRUSTED TO A TEXT MERGE.** `glowData.ts` and
`docs/BOOK-REPORT.md` auto-merged without conflicting, which is precisely when a
generated file is most dangerous: a textual splice of two generated regions can
produce something the generator would never write, and `glowData.ts` is the file
this repo's §7 forbids hand-editing. Both were REGENERATED from the archive and
compared against the merge result — byte-identical, so the merge is what
`build-book` writes rather than merely what git produced.

`src/lib/__tests__/screenerSectors.test.ts` carries the arithmetic
(`npm run test:family`), anchored on **two generated artefacts** — `glowData.ts`
and the committed store — so every expectation is derived from both on the run or
written as a relation that survives either moving. Its load-bearing gate is an
INEQUALITY: the tier must place company shares no statement placed (84 of 84 that
resolve a symbol), or a store wired to a book it no longer matches would satisfy
every structural check while placing nothing.

`build` · `tsc` · `test:ingest` 140 + 35 · `test:family` (this stage's suite
beside 10ar's and 10as's) · `check:family` **57/0** · `check:pages`
**148 combinations clean**, with the same two pre-existing abstentions.
`build-book` is a no-op against the committed tree, which is what says the book
on disk is what the builder would write.

**EVERY ONE OF THOSE WAS RE-RUN ON THE FINAL MERGED TREE**, not carried across
from this branch's own base — the discipline Stage 10aq's closing paragraph
records. This branch's own pre-merge runs stated 146 twice and the answer is
**148** here; 10aq, 10ar and 10as each state their own figure. All of them were
struck against different bases and none can be reconciled with another by
arithmetic, which is exactly why the sweep is re-run rather than the number
adjusted.

### Stage 10au — THE MOVERS OPEN ON THE PERCENTAGE, AND A DEFAULT IS ASSERTED OR IT MOVES

*"keep % wise as the default view and ₹ wise absolute as the second toggle
option."*

Today's movers has ranked by rupee impact since Stage 10p built it, and the
family have now settled it the other way. `TodaysMovers`'s `rank` state opens on
`pct` and the two buttons are offered in that order.

**BOTH MEASURES STAY, BECAUSE NEITHER SUBSUMES THE OTHER.** That was the reason
the toggle existed at all and it is unchanged: *a 9% move on a ₹40 L holding is
the larger mover by one measure and the smaller by the other.* What moved is
which question the card answers before anyone touches it.

**AND NOT ONE FIGURE ON THE CARD CHANGES.** The day's move, its denominator, the
coverage line, the gainer and loser counts, the index comparison and the excluded
footer are all struck over the same set on either ranking — the sort reorders one
list of five and reorders nothing else. The two ranked columns already keyed
their emphasis off `rank`, so the bold column followed the default with no edit.

**WHICH IS EXACTLY WHY IT NEEDED A CHECK, AND HAD NONE.** A default is the change
that moves silently: the page renders perfectly either way, every value check on
this card passes either way, and the only difference is the ORDER of two
five-row lists. `check:pages` asserts the allocation card's default axis for that
reason (Stage 10z, Stage 10ad) and had no equivalent here — so the ranking could
have been flipped back by an unrelated edit and the sweep would have reported
clean.

**STRUCK ON `data-mover-rank`, NEVER ON THE LABELS.** "By % move" and "By ₹
impact" are precisely the prose a redesign is free to reword, and this file has
recorded a check retiring itself in silence that way more than once. The probe
reads which measures the control OFFERS, in order, and which is live; the
invariant makes three claims, and the middle one is the family's ask: both are
still offered, the live one is the percentage, and the percentage is offered
first.

**A MISSING CONTROL IS A FINDING, NOT AN ABSTENTION.** This card's header renders
whether or not a quote has landed, so an empty offer means the control is gone —
and a sweep that abstained there would report CLEAN over a card with no toggle at
all. Only the probe failing to run abstains. Verified rather than assumed:
deleting the handle FAILS the invariant by name rather than adding a NOT CHECKED
line.

Three bugs reintroduced, each firing it: the default back to `impact`, the button
order back to impact-first *with the default left correct* (which a check on the
active button alone would have passed), and the control removed outright.

### Stage 10av — CASH IS CASH, AND WHEN BESIDE HOW MUCH

Four asks. The first turned out to be a measurable inconsistency rather than a
matter of taste, and the third had been answered on one surface under a heading
nobody reads as an answer.

#### 1. *"why should an ETF show here? … Cash is liquid, arbitrage. All of it is cash."*

*"please look at the mapping because as of now, it looks all over the place to
me."* **IT WAS, AND THE BOOK'S OWN ROWS SAY SO.** One security reached this book
under two different asset classes, and the family's own example is the one it
happened to:

```
NIP ETNF1D RTLIQBEES (Nippon Liquid BeES)  ETF          3 Motilal demats   ₹1.1764 Cr
                     …the same security    Mutual Fund  LKP broking        ₹0.0017 Cr
ABSL / ICICI / HDFC Liquid                 Mutual Fund  depository          ₹12.89 Cr
Axis Liquid                                Cash         inside a PMS        ₹0.0013 Cr
```

Nothing is misread. `assetClass` is what the ISSUING DOCUMENT called it (§5), and
four documents called one kind of instrument three different things — a
depository types every scheme `Mutual Fund`, a PMS statement's own section
heading types its sweep `Cash`.

**SO THE FIX IS ON THE BUCKET AND NOT ON `assetClass`.** The archive goes on
describing the statements, `assertNormalized` still rejects a document that says
otherwise, and `glowData.ts` still regenerates byte-identically — verified as a
control run. What changed is the CATEGORY AXIS, which is the one that answers
*how much of this book is cash*. Same seam `MANDATE_BUCKET` already uses, where
an account's engagement overrides the class of every row in it.

**AND IT WAS NOT COSTING A LABEL.** On the deduped current-holdings set the Cash
row read **₹0.0000 Cr** — every real rupee either inside a mandate or filed under
Mutual Fund and ETF. The family were being shown a book with no cash in it while
holding ₹14.07 Cr of liquid funds and liquid ETFs. After: Mutual Fund ₹99.90 →
₹87.01 Cr, ETF ₹24.56 → ₹23.38 Cr, Cash ₹0 → **₹14.07 Cr**, and the footer does
not move by a rupee, which is the check that says this is a regrouping.

**ORDER IS THE WHOLE OF IT: CASH AFTER THE MANDATE.** Both Axis Liquid rows sit
inside a Green Lantern PMS, and a mandate is worth what its own statement says.
Lifting its sleeve out would leave that row unable to tie to its document — the
identical reason the ordinary cash sleeve is not lifted either.

**A COMMITTED LIST, CITED PER ENTRY, AND DELIBERATELY NOT A NAME MATCHER.**
`CASH_EQUIVALENT_KEYS` in `analytics.ts` names the review row that files each
under Cash — the same standing `familyTaxonomy.ts` gives its `reviewProduct`,
and the same three-witness workbook. Axis Liquid is listed although the rule can
never fire on it, because a set called "the cash equivalents in this book" that
omitted a liquid fund BECAUSE one document typed it correctly cannot be checked
against the review at all.

**ARBITRAGE IS IN THE RULE AND NOT IN THE BOOK, WHICH IS TWO FACTS.** The
family's review carries ₹41.08 Cr of it across four funds, the largest ₹30.99 Cr
— and **not one is in this book**, searched over every position. So the map has
no arbitrage entry and the screen shows none; saying "arbitrage now shows in
cash" would be a claim about a row that does not exist. It is also the ONE place
this departs from their workbook, which lists all four on its DEBT sheet — and
that stays true on the family's own asset-class axis. The workbook was already
half of this way: it codes every one of the four basket `Liquid`.

**AND THE HALF THAT GOES STALE IS THE LINE THAT SPEAKS UP.**
`cashEquivalentCandidates` reads NAMES — the one place a name rule is allowed
here, because it decides nothing and moves no money — and `familyTaxonomy.test.ts`
FAILS on the first drop bringing a liquid or arbitrage fund the map does not
carry, naming it. Verified by dropping a key: it reports the offender and says to
commit it with a citation.

#### 2. *"Where will I get to see that there were two contributions?"*

*"amount invested is fine. But if I further want to see — because XIRR will
change depending on the investment amount and the time, XIRR will change. It is
not showing that. So need to show transaction wise."*

**THE RECORD EXISTED AND THE MANDATE PAGE DID NOT READ IT.** `BOOK_CAPITAL_MOVES`
has carried every dated contribution since Stage 10ag and the Transactions card
has shown them per account — but a reader who opens a mandate from Holdings, from
Family & Entities or from a company page never passes through that card.
`CapitalIn` in `MandateHoldings.tsx` renders them, and it calls **`capitalRollup`,
the same function with the same arguments**, differing only in scope. A second
implementation would be a second answer to what the family put into this mandate,
and the tile above and the tab one click away are precisely the pair where that
disagreement is visible.

**IT IS ON BOTH BRANCHES, AND THE FUND ONE IS THE LARGER HALF.** The DEALING card
came off the fund branch at Stage 10ai because a folio reports no trading record.
The CONTRIBUTION record is the opposite case: measured, **EIGHT of this book's
eleven dated capital records belong to accounts that reach that branch** — the
five Sanshi folios, both Transition Venture trusts and 3P — against three on the
mandate branch. Leaving it off would have answered the smaller half of the ask.

**AND THE RETURN BENEATH IT SAYS WHAT KIND OF RETURN IT IS.** A holding-period
return on what was paid in is NOT annualised and NOT money-weighted, and the card
says so — because the family's own reason for asking is that a rate depends on
when each payment landed, and a figure that read as one would answer them wrongly
in exactly the direction they were worried about.

#### 3. *"you've given me the amount, but you've not given me the date"*

Three surfaces, and the first was already there:

- **`What I invested`'s "Period" column became "Invested on".** The dates were
  already in that cell. "Period" is not a word a reader scanning for WHEN THEY
  INVESTED reads as an answer, so the column was on the page and the question it
  answers was not on the column. The MANAGER rollup's own Period column became
  **"Traded between"** and deliberately not this: it is the manager's dealing
  window, and one label over both would put a manager's first trade under a
  heading a reader takes for the date they subscribed.
- **The mandate page's Invested tile says when**, from the account's own first
  dated contribution (11 of 51 accounts) or failing that the statement's printed
  inception date (12 of 51) — labelled as which, because they are different
  facts. Neither is attached to the cost figure as though the two were one
  measurement: that tile is the mandate's COST BASIS and the manager has been
  trading inside the account since.
- **A new "Invested on" column on the holdings table, immediately right of
  Invested**, which is where they asked for it and the one position that shifts
  every column after it.

**IT IS A SEPARATE FIELD FROM `heldSince` AND THEY MUST NOT BE MERGED.**
`heldSince` is what LICENSES ANNUALISATION and is emitted only where a lot
register accounts for every unit held. `investedOn` feeds no return, which is
what lets it take a second source `heldSince` cannot: the position's own dated
allotments. That record routinely carries SEVERAL payments — Sanshi 9069671554
was funded four times — and folding it into `heldSince` would compound all four
from the first, overstating the rate by everything the later money did not earn.

**10 of 371 POSITIONS CARRY ONE — AND THEY ARE ₹208 Cr of ₹714 Cr**, 29% of the
money, because the dated ones are the large AIF folios. The footer COUNTS the
coverage rather than printing an aggregate: a "first invested" over rows most of
which carry no date would be the first of the dated subset.

**AN ACCOUNT-LEVEL DATE IS DELIBERATELY NOT A THIRD TIER** — that is when the
family funded the ACCOUNT, not when a manager bought the share a row is about.
See the bug-reintroduction note below: on this book that rule is unreachable, so
it is written down beside the code rather than left to be inferred.

#### 4. *"What is tape? … Let's think of something better. Friendly words."*

"Tape" is a trading-desk word for the printed record of every execution —
precise, and jargon. "My investments" was worse than jargon: it was ambiguous in
the one way that matters, because the whole point of that tab group is the split
between WHAT THE FAMILY DID and WHAT THEIR MANAGERS DID, and it could honestly
mean either.

| was | now |
| --- | --- |
| My investments | **What I invested** |
| Direct Equity | **Direct Equity** — unchanged |
| By manager | **Manager trades** |
| By entity | **Trades by member** |
| Tape | **Full trade list** |

**"DIRECT EQUITY" IS NOT RENAMED, AND THAT IS THE DECISION HERE.** The family
asked for that exact word on that exact tab — *"Replace by security with direct
equity, that will contain the transaction of all direct buy and sold equity
transactions"* — and it is the word this app's holdings tables use for the same
set. Changing it would be a fourth round of the argument Stage 10L settled,
running backwards. The cryptic column labels went with them: `How` → **How it
went in**, `As` → **Type**, `In`/`Out` → **Paid in**/**Taken out**, `Into` →
**Security bought**.

#### Eleven bugs reintroduced, and three of them were defects in the checks

- **A CHECK THAT COULD NOT FAIL, FOUND BY THE BUG IT EXISTS FOR.** *"a liquid
  sleeve inside a mandate stays with the mandate"* was written on the monitor.
  Moving the cash rule ABOVE the mandate check — exactly the ordering error it
  guards — left the sweep **CLEAN**, because that page partitions mandates on the
  ACCOUNT's engagement rather than on `holdingBucket`, so those rows never reach
  the table either way. It is GONE rather than left looking like cover, and the
  claim is asserted where the decision is made: `familyTaxonomy.test.ts` §10(c)
  calls `holdingBucket` directly and fails on that reordering by name.
- **TWO FOOTER CHECKS WERE COUNTING TOKENS.** *"the class subtotals reconstruct
  the footer total"* and *"by-security total counts each dedupeGroup once"* walked
  the footer's TEXT — an invested figure, `\S*` for whatever one cell sat between,
  then the market value. That held only while exactly one token stood there, and
  "Invested on" broke both against a page that was correct. Widening the skip
  would have been worse than the bug: a `.*?` between two money columns marches
  straight past one. They read `ctx.footerCells` by `COL` now, which is
  accumulated by `colSpan` — `lib/table.mjs`'s own rule arriving in the sweep.
- **AND ONE WAS SHAPED BY ITS OWN FIXTURE.** The movers card's excluded-bucket
  check required an "ETF" line BY NAME. The single priced ETF row was Liquid BeES;
  when it correctly moved to Cash the line correctly disappeared, and a correct
  page failed. It is anchored on the book now — the entries must account for every
  priced holding the scope excludes, and for its whole value — which needed the
  fixture's own `QUOTE_FACTOR`, because the card sums LIVE market value and a sum
  off `glowData.ts` alone runs exactly 1.10 light (₹126.06 Cr against a correctly
  rendered ₹138.8 Cr).

**AND ONE BUG IS UNREACHABLE ON THIS BOOK, SO IT IS WRITTEN DOWN.** Adding the
account's first contribution as a third tier for `investedOn` changed nothing the
sweep could see: measured, every position in a funded account is already in a PMS
(125, rolled into a mandate row), already own-dated (7) or closed and not drawn
(3), and **ZERO would newly borrow one**. The guard that covers it was verified
against a borrowed CONSTANT instead, and the rule is stated beside
`investedOnOf` rather than left to be inferred from the absence of a test.

The eight that fired first time: the cash rule removed (2 checks), the Cash
section's provenance note deleted, the column never dated, an undated holding
borrowing a date, the tabs back to Tape/My investments, the contribution card off
the fund branch, its table truncated (2), and the Invested tile's date removed.
In the arithmetic suite: a key dropped from the map (the detector names it), a key
matching no holding, and the rule never firing (2, including the load-bearing
`Cash ₹0.00 Cr → ₹0.00 Cr`). And the checker's column maps left at their old
indices fire **13 invariants across two routes**, which is what says the insert
was properly accounted for.

`build` · `tsc` · `test:ingest` 140 + 84 + 35 + 31 · `test:family` ·
`check:family` **57/0** · `check:pages` **150 combinations clean** — 148 plus the
new `mandate-funded` route — with the same two pre-existing abstentions.
`npm run build-book` regenerates the book BYTE-IDENTICALLY, run as a control
before and after: nothing here touches the ingest, and a presentation-layer
change that moved a generated figure would not be one.

### Stage 10aw — A DAILY NAV IS A SECOND SOURCE, AND THE AIF DRILL-DOWN IS CLUBBED

Three asks. The first needed a feed this dashboard already had and had never
read for this; the other two needed a fact the statements print and nothing had
ever looked at.

#### 1. *"wherever there is a daily NAV available … can we capture that?"*

> *"this is covering for stocks which is fine. बाकी AIF में तुम monthly NAV आएगा
> and mutual funds — there will be whatever. But can I not have — see if I have
> some money in ETF? Or if mutual funds also have a daily NAV? So wherever there
> is a daily NAV available and if there is a drastic moment in the line item for
> some reason, can we capture that? … Because a silver ETF can have a drastic
> moment ऊपर नीचे. A momentum fund or a momentum ETF can have very drastic
> moments on rebalancing days."*

**"THIS IS COVERING FOR STOCKS WHICH IS FINE" IS A BLESSING, NOT A COMPLAINT.**
Today's movers stays exactly as Stage 10t narrowed it and Stage 10al settled it
— `DIRECT_EQUITY_BUCKET`, no scope tabs, ranked by % — and what is added sits
beside it. Reading this as "widen that card" would have put back the selectors
the family removed one round earlier.

**THE QUOTE FEED CANNOT ANSWER IT, AND THE FAMILY'S OWN EXAMPLE IS THE PROOF.**
Every live endpoint is keyed on an NSE trading symbol. Measured over this book's
6 ETF and 22 mutual-fund rows, **exactly one resolves a symbol** (LIQUIDBEES) —
and **the DSP silver and gold ETFs resolve none**, because NSE has moved them to
ISINs the statements do not carry (a fact `build-symbols` already records). So
the one instrument the family named is precisely the one no amount of work on
the quote feed would ever reach.

**THE ANSWER WAS ALREADY COMMITTED.** `public/lookthrough/` has carried each
scheme's NAV, its previous NAV, both dates and the move between them since
Stage 10s — 21 of this book's 22 schemes, the DSP ETFs among them. Nothing read
it for this. `src/lib/navMovers.ts` and `src/components/NavMovers.tsx` are the
card; measured on the committed store:

| | |
| --- | ---: |
| Schemes with a published move | **16**, behind 17 names |
| Covered / in scope | **₹110.39 Cr** of ₹110.39 Cr — the whole of it |
| The covered set's own move | **−0.1364%**, −₹15.06 L |
| Not priced, and named | **none** — see below |
| NAV dates the rows span | 2026-09-08 and **2026-09-09** |

**AND EVERY ONE OF THOSE FIGURES MOVED ON THE MERGE, WHICH IS THE POINT OF
RE-MEASURING RATHER THAN CARRYING THEM ACROSS.** This branch measured 18 schemes
over ₹123.28 Cr of a ₹124.46 Cr scope, with LIQUIDBEES and three sibling rows
(₹1.18 Cr) named as the part it could not price. Stage 10av landed on main while
it was open and moved a liquid fund or liquid ETF into **Cash** whatever wrapper
its statement typed it as — so those rows left this card's scope entirely, and
**the one name it could not price was exactly a liquid ETF.** The scope is now
the whole of what it covers and the not-priced list is empty, which is a better
card than the one this branch wrote and is not a figure anyone chose. The table
above is the merged measurement; the PR body and the branch commit record the
pre-merge one, and the two differing is the merge working rather than drifting.

**IT IS A SEPARATE CARD ON ITS OWN DATES, AND THAT IS THE WHOLE RULE.** A live
quote is intraday TODAY; a published NAV is a scheme's last struck NAV against
the one before it, as recent as the last `build-lookthrough`. On this book those
are a week apart. Summing a NAV move into the quote card's percentage would
print a real figure under the wrong day — the defect `/api/indices` already cost
this repo, where the level was differenced against itself and the ±0.05 residual
was the only tell. So the heading carries the newest NAV date, **never the word
"today"**, a row struck on an older day says so, and the card states in words
that the two are never added together.

**AND THE RUPEE MOVE IS NOT `units × NAV`, WHICH WAS MEASURED RATHER THAN
REASONED.** The obvious construction — value the units held at each published
NAV — is exact arithmetic on a false premise, because the units and the NAV are
not on the same base for every holding:

```
DSP GOLD ETF     1,195,000 u   book mark ₹141.24/u   published NAV ₹14.7633
DSP GOLD ETF       205,000 u   book mark ₹151.10/u   published NAV ₹14.7633
DSP SILVER ETF     123,000 u   book mark ₹276.82/u   published NAV ₹22.4561
```

That puts the family's **₹16.88 Cr gold ETF at ₹1.76 Cr** — a plausible figure,
an order of magnitude out, on the very instrument they asked about. And there is
no factor to correct by: the two gold rows are the SAME security on the SAME
as-of date and imply ratios of 9.57 and 10.24, while silver implies 12.33.

So the PERCENTAGE is the primitive — a fact about the SCHEME, needing no unit
reconciliation at all — and the rupee figure is that move applied to what the
book values the holding at. Every row then ties to its own columns: `move ÷
value` IS the printed percentage, and the aggregate is value-weighted rather
than an average of the rows (which would weight a ₹107 residual the same as a
₹42 Cr position — measured, −0.3145% against the true −0.1364%).

**THE ROW IS THE SCHEME, NOT THE `securityKey`.** A NAV is published against a
scheme, and Helios Flexi Cap reaches this book under TWO keys — the AMC folio's
`helios-flexi-cap-fund-direct-growth` and the depository's clipped
`helios-fcf-d-grow` — both resolving ISIN INF0R8701046 and therefore one NAV.
Keyed on `securityKey` the card prints one scheme's one move twice, at two
sizes, as though they were two decisions. This is a join on the identifier the
NAV is published against, not a name match: the store already resolved each key
to its schemecode on the ISIN.

**AND TWO ROWS OF ONE FUND NAME ARE NOT A DUPLICATE.** This book holds BOTH
plans of two funds — HDFC Balanced Advantage as `1273` and `1273-D`, ICICI Pru
Nifty Next 50 as `11889` and `11889-D` — each printing one scheme name and two
different NAVs, because plans differ in expense ratio and therefore in NAV, not
in what the fund owns. The row names its plan, or the card reads as a defect.

**EVERY ROW IS DRAWN, AND "DRASTIC" ONLY LABELS.** A top-N would have to choose
between two rankings that disagree at the extremes — by percentage the biggest
mover here is a ₹107 residual in an index fund, by rupees a ₹42 Cr position that
moved 0.12% — and hiding either is wrong. So all 18 are listed with their value
beside them, which makes a 0.86% move on ₹107 self-evidently trivial without
suppressing anything. The `drastic` chip is a LABEL on a row that is already
there, past a bound the card states on its face: a threshold is a judgement no
statement makes, and getting it wrong must cost a chip rather than a figure —
the standing `staggered` already has on the transactions rollup. Nothing on this
book crosses it, so the suite exercises it against a constructed move rather
than leaving it unproven.

**AN AIF IS NOT ON THIS CARD, WHICH THE FAMILY SAID FIRST** — *"AIF में monthly
NAV आएगा"*. No alternative fund publishes a daily NAV and none resolves a scheme
in the store, so their absence is a fact about the INSTRUMENT rather than a
filter, and the card says so rather than leaving ₹352 Cr unexplained.

**AND THE NAV HAD TO MOVE INTO THE INDEX.** `loadLookthrough` pulls a scheme's
own 30 KB file, which is right for a page showing ONE fund and costs **632 KB**
for a card showing twenty — on the landing page, which is the latency complaint
that card already exists to answer. `nav` now rides in `index.json` at ~120
bytes a scheme (7 KB → 11 KB), so `loadFundNavs` is one fetch.

**`npm run build-lookthrough -- --reindex` IS HOW THAT LANDED WITHOUT THE
AMFIBEAS CHECKOUT.** A full build needs a read-only clone most machines do not
have, so a change to the index projection would otherwise be unlandable —
exactly the position `securityKeyOf` was in before `rekey:archive`. It does not
have to be: every field the projection emits is read VERBATIM off a record this
store has already written to `<schemecode>.json`, so re-deriving the index from
those files is a faithful partial replay of the build, and the next full run
calls the same function on the same records and writes the same bytes. **Its
gate is the field the index already carried** — `navDate` is `nav.date` by
construction, so a replay that disagrees has joined an entry to the wrong scheme
file, and nothing is written. Measured: all 21 entries replay, every non-`nav`
byte is unchanged, and a second run is a no-op.

#### 2. and 3. The AIF drill-down, clubbed — and Private Equity beside it

> *"when you're drilling down in the AIF ना नवल, make it cat one, cat two, cat
> three … क्योंकि there are only three categories. तो आप वहीं पर drill down करने
> पर फिर उसको club कर दो कि these are cat two AIFs, these are cat three AIFs,
> this is cat one AIF."*   and   *"Similarly for Private equity also … So either
> you create one more line item here. I think that'll be better if there is PE
> funds. Just create another private equity fund line item."*

**SEBI HAS THREE CATEGORIES AND THIS BOOK DOES NOT KNOW WHICH FOR EVERY FUND.**
Those are different facts — the first is about the regulation, the second about
the paperwork in `source/` — and conflating them is how a section heading comes
to assert a classification nobody made. A heading looks exactly as authoritative
whichever rows sit under it, so a page that filed every fund under a plausible
category would render perfectly, reconcile perfectly, and be `VAL_METHODS[i % 5]`
arriving through a table.

**SO IT IS READ, AND THERE ARE TWO PLACES IT IS PRINTED** — both the statement's
own words, with the standing `providerSector` and `providerEngagement` already
have: the SECURITY NAME, which names the fund (`Sanshi Fund-I (Open Ended AIF
CAT-III)`, `BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III`, `360 ONE SPECIAL
OPPORTUNITIES FUND … (AIF CATEGORY II)`), and `Account.providerEngagement`,
which describes the account (`Category II AIF - drawdown, with a commitment and
called capital`, `Category I Alternative Investment Fund – Angel Fund`).

**NEITHER IS PREFERRED, AND WHERE BOTH SPEAK THEY MUST AGREE.** A disagreement
leaves the holding unstated rather than letting either side win silently — the
rule `build-symbols` already applies to its ISIN tier, where adding a second
identifier makes the match STRICTER rather than looser. Measured on this book:
**5 holdings print a category in both fields and 0 disagree**, reported at zero,
because a guard that only speaks when it fires is indistinguishable on a clean
run from one that was deleted.

**A PHRASE NAMING TWO CATEGORIES RESOLVES TO NEITHER.** Transition Venture
Capital's account reads **`Category I/II AIF — drawdown`**. That is the issuer
declining to commit, and picking one would be this book inventing the answer the
document withheld. The read yields both, the holding is filed as not stated, and
its wording says so — *"the statement names Category I and Category II and
commits to neither"* — because a statement naming two and a statement naming
none send a reader to different documents.

**AND `III` MUST NEVER BE READ AS `I`** — that would file ₹297.78 Cr, 84% of the
AIF book, under the wrong heading, silently. Two things prevent it, and
**reintroducing the bug proved the first draft of this paragraph credited the
wrong one**:

- **the trailing `\b` is the real guard.** Matching `I` out of `III` leaves `II`
  after it, and a word boundary between two word characters fails, so the engine
  backtracks to `III`. Measured: **with it, BOTH alternation orders read
  `CAT-III` correctly; without it, `I|II|III` reads it as `I`.**
- the alternation ordered longest-first is the BACKUP, and is what would carry
  it if the boundary were ever loosened.

Reordering the alternation alone therefore produced a clean sweep AND a clean
suite — a comment asserting an enforcement that never happens, which is a shape
this file already names. The suite now asserts all four combinations directly,
so the claim is about the PROPERTY the pattern must have rather than about the
spelling this file happens to use. The pattern is also anchored on the WORD, so
`Class A2`, `Series II` and `Founders Fund Series II — Class G1` name nothing;
all three are in this book and all three are asserted.

**PRIVATE EQUITY IS A SECTION, NOT A CATEGORY, AND THE FAMILY CHOSE THAT.** A PE
fund IS an AIF — Category I or II under SEBI — so the two overlap by
construction, and they were asked which they wanted in those terms. They chose
the separate line, so `PRIVATE_EQUITY_SECTION` takes PRECEDENCE when a holding
is filed **and the row still prints the category the statement gave it**, which
is what lets the two sit side by side without misleading: a reader adding the
category sections can see where a PE fund went.

**IT IS READ FROM THE STATEMENT TOO, AND NEVER FROM THE STRUCTURE.** "Is this a
private equity fund" is a judgement about what a manager does, and this book does
not make those. Exactly two valued holdings print the discipline in the fund's
own name — `Baring Private Equity India Fund 6` (`Category II AIF — drawdown
private equity fund`) and `Transition Venture Capital Fund I`. Nothing is
inferred from a fund being a drawdown vehicle: this book holds five, and calling
all of them private equity would file an infrastructure income fund and a
listed-equity growth fund under a discipline neither claims. There is no fuzzy
tier, for the reason `shared/nameMatch.mjs` records at length.

Measured, and the sections partition the row to the rupee:

| Section | Funds | Value |
| --- | ---: | ---: |
| Category II | 2 | ₹34.28 Cr |
| Category III | 4 | ₹297.78 Cr |
| Private Equity | 2 | ₹3.60 Cr |
| Category not stated | 3 | ₹16.69 Cr |
| **Total** | **11** | **₹352.35 Cr** |

**MORNING CIO'S ALLOCATION TABLE IS UNTOUCHED.** The AIF row is still ₹352.35 Cr
and no headline figure moves, which is what makes this a clubbing of a
drill-down rather than a re-measurement of the book.

**AND CATEGORY I WOULD HAVE BEEN SILENTLY ABSENT, WHICH IS THE ONE WAY THIS
COULD MISLEAD.** The family expect all three categories. **Every Category I AIF
this family owns is an angel fund that publishes no NAV** — Sky Capital's four
folios report units and the capital drawn against a commitment and no valuation
anywhere — so they carry no valued position and can stand in no holdings table
on this site. A page clubbed by category with no Category I heading tells a
reader they hold none, which is false. So the folios that value nothing are
NAMED under the table with what they have drawn, by the same axis: **4 Category
I folios (₹4.73 Cr drawn), 5 Category II (₹13.50 Cr), 1 not stated** — the
standing rule that a figure existing for some accounts is shown for those and
the rest are named. Their money is in no total on the page, and the note says
drawn capital is what was PAID rather than what the stake is worth.

**THE SECTIONING FOLLOWS THE ROWS, NOT THE ADDRESS.** It applies only where
every row is an AIF holding, so a drill-down mixing an AIF with a mutual fund —
the whole book, the winners, the costless positions — never draws a "Category
not stated" heading over an ETF, which would be a category claim about an
instrument that has none.

#### The verification, and the three defects it found in this change

Both features are checked twice: `npm run test:family` carries the arithmetic
(`navMovers.test.ts`, `aifCategory.test.ts`, both anchored on the generated book
and the committed store rather than on fixtures), and `check:pages` walks the
rendered pages. **The sweep's expectations are RE-DERIVED in `check-pages.mjs`
by a second expression** rather than importing `navMovers.ts` or
`aifCategory.ts` — a check that calls the helper it is checking agrees with it
by construction, which is the rule this sweep already follows for
`isMandateHeld`. The two agreeing is the measurement.

**A ROUTE THAT RESOLVES NOTHING IS A FAILURE, NOT A PASS.** `holdings-aif` takes
the address Morning CIO itself drew, found by its key among the six allocation
rows — a slot number would be a literal standing for an ordering that moves with
the book. Unresolved it lands on `/holdings`'s own not-found state, which has no
console error, no overflow and no stray zero, so it would pass every generic
check while asserting nothing.

**AND THE FIRST DRAFT OF THREE INVARIANTS FAILED A PAGE THAT WAS RIGHT**, which
is worth recording because it is the same mistake in three places: they counted
STATEMENT ROWS where the table draws FUNDS. Sanshi Class E is one securityKey in
four folios and is one row — which is exactly what *"club कर दो"* asked for — so
16 positions are 11 rows. A count is only meaningful beside the noun it counts.

**AND TWO REINTRODUCED BUGS PRODUCED A COMPLETELY CLEAN SWEEP**, which is the
finding this pass exists for and the most useful thing it turned up:

- **the aggregate struck as the unweighted MEAN of the rows** — −0.3145%
  against the true −0.1364%, because it weights a ₹107 residual the same as a
  ₹42 Cr position;
- **a model that stopped SUMMING a scheme's holdings**, so every row carried its
  last statement's value alone.

Neither changes a row count, a scheme count or a date — and **every check on
that card was reading counts and dates.** They compared the page with itself,
which is the failure this file names in as many words (*"a check that compares a
figure with its own copy cannot fail"*) and which this change committed again in
the very file written to avoid it. The tile's four figures carry structural
handles now and are reconciled against `NAV_MOVERS_BOOK`, derived from the book
and the store by a different path; and the value-weighting is additionally
asserted as an INEQUALITY against the mean it must not be, so the equality
cannot pass by luck on a book where the two happen to coincide. Re-run against
the same two bugs, the mean fires two checks and the un-summed model fires four.

**A THIRD DEFECT WAS IN THE HARNESS**, and it is the one recorded at Stage 10ar
arriving again: two of the files this pass patches are NEW and therefore
UNTRACKED, so `git checkout -- <file>` restores nothing. The harness snapshots by
COPY and restores on a `trap … EXIT`, **and rebuilds on the way out** — restoring
the source alone leaves `dist/` at the bugged build, and the next sweep reads it
and reports the previous bug's failures under the next one's name. A patch that
does not apply, or a build that fails, is reported as NOT A RESULT rather than
as a clean run.

**AND A FOURTH WAS A RACE IN THE WAITER.** A follow-on step that waited on
`pgrep -f bug.sh` started while the pass was still running: that predicate is
FALSE for a moment BETWEEN two invocations, so the waiter slipped through the
gap and rebuilt `dist/` underneath bug 14. Nothing it produced afterwards was a
result — two builds racing on one output directory can report either one's
failures under the other's name, which is the stale-`dist` defect one level up.
A waiter has to be built on the LOOP, not on one iteration of it; the fix
re-checks after a pause long enough to cover the gap.

Reading this change back found three defects in it that no check would have
caught, all of them shapes this file already names:

- **`spansDates` was computed and rendered nowhere** — the
  dead-code-that-looks-alive failure, in code written the same hour as the
  comment warning about it.
- **`skipped[0].reason` was printed as THE reason** for every unpriced holding,
  which is right only while they all share a cause. Three different things put a
  holding there and only one of them is a "wait for tomorrow". Grouped by reason
  now, and by name within it, since LIQUIDBEES is four statement rows and one
  security.
- **`valueAsOf` was on the row and rendered nowhere** — the field carrying the
  right answer into no caller, which is this repo's most-repeated defect. It is
  the statement date behind the derived rupee figure, and the two sides being
  dated differently is the whole reason that figure is labelled derived.

A fourth was in the new suite itself: `ok("no section is empty", v !== 0 || true)`
is always true — a check that cannot fail, written into the file whose purpose is
to catch exactly that.

**FIFTEEN BUGS WERE REINTRODUCED IN TOTAL AND EVERY ONE NOW FIRES ITS OWN
CHECK**: the rupee move struck as `units × NAV`; the aggregate as an unweighted
mean; a scheme clubbed on `securityKey` rather than on the scheme the NAV is
published against; the card dated "today"; the ranking defaulted to rupees; the
basis sentence deleted; the coverage line dropping the holdings it cannot price;
an AIF folded into the scope; the numeral read loosened; `Category I/II`
resolved to one of the two; Private Equity folded back into the category axis;
the unvalued folios deleted; the per-row category chip removed; the sectioning
dropped entirely; and one section silently dropped from the partition. The last
fires seven checks at once, from seven directions.

**AND A FIFTH BUG WAS CLEAN FOR A REASON WORTH KEEPING.** Resolving `Category
I/II` to the FIRST of the two, rather than to neither, moved no row and no total:
the only holding with an ambiguous category is Transition Venture Capital, and
**Private Equity claims it first**. All the defect changed was one chip, from
"category not stated" to "Category I" — and the check accepted any of the three
names or none, because it was asserting a SHAPE. A chip is where this book states
a classification, so it is held to the book's own per-row answer now, compared as
a multiset so it does not also assert an ordering the sections are free to
change.

#### Merged with main, and both predicted conflicts arrived on cue

This branch sat open through review and **Stage 10av landed on main while it
waited**, so the merge hit exactly the two conflicts this file already tells a
future session to expect — for the **fourth** time each:

- **THE LETTER COLLIDED AGAIN.** Both branches wrote `### Stage 10av`. Main's
  merged first and **keeps the letter**, as it did at 10al, 10as and 10at; this
  section is `10aw`, and the two Build-section cross-references that named its
  suites (`navMovers.test.ts`, `aifCategory.test.ts`) moved with it. The two that
  still read `10av` — the `CASH_EQUIVALENT_KEYS` line in **Layout** and the cash
  note under Stage 10L — belong to main's section and were left alone, checked
  rather than assumed.
- **AND THE `ctx` LITERAL CONFLICTED AGAIN, ON ONE LINE, EXACTLY AS PREDICTED.**
  `check-pages.mjs` hands its invariants one object literal: this branch adds
  `aifSections` and `navMovers`, main's adds `buttonLabels`, `capitalMoves`,
  `capitalTotal` and `capitalHow`. **Resolved as a mechanical union**, never by
  picking a side — the file's own measurement is that dropping `attrib` turned
  nine invariants into NOT CHECKED over a sweep still reporting every combination
  CLEAN, so half of these losses are invisible by construction. Every one of the
  eight probes was then confirmed to be defined exactly once in the merged file,
  because a key naming a variable that no longer exists throws inside the check
  and is reported as a broken matcher rather than as a clean page.

**AND THE GENERATED FILES WERE CHECKED RATHER THAN ASSUMED**, the discipline
Stage 10at records — a textual splice of two generated regions can produce
something the generator would never write. Measured here: **neither side touched
`src/data/glowData.ts`, `docs/` or `public/lookthrough/`, so the merge had nothing
to splice**, and `npm run build-book` was run as a control afterwards and
regenerated byte-identically. Both halves are stated because the first is what
made this merge safe and only the second would have caught it had it not been.

### Stage 10k — News & Announcements: REMOVED

The family asked for the page to go. `/news` and `/recommendations` redirect to
`/monitor`, the sidebar entry is gone, and `src/pages/News.tsx`, `src/lib/news.ts`
and the top-bar `NotificationsBell` went with it — the bell rendered the same
holdings feed and its only action was to open the page that no longer exists, so
leaving it would have been a button to a redirect.

`src/lib/announcements.ts` STAYS. `insider.ts` imports its `AnnHolding` type and
its NSE-symbol resolution, and the company page's insider panel is still wired to
both. Deleting a module because its most visible caller went is how a working
panel goes dark one release later.

`check:family` asserts the removal happened — both redirects, the nav entry gone
and the bell gone — rather than the tests being deleted alongside the feature.

### Stage 10h — Sector Composition is COMPANY SHARES, because nothing else has a sector

A GICS sector is a property of a COMPANY. A fund — an AIF folio, a mutual fund
scheme, an ETF, a liquid sweep — is a wrapper holding many, and no statement in
this drop prints a sector for one. The page first excluded only the PRIVATE
classes, which fixed the worst of it and left the rest: **Unclassified still read
49.0%, ₹88.6 Cr, with "Helios Flexi Cap Fund" as its top holding** — a mutual
fund standing at the head of a sector table and taking the largest slice of the
chart while describing nothing.

The denominator is `assetClass === "Equity"` now — shares in companies the family
holds directly, through a manager's mandate or its own demat. Every excluded
class is NAMED with its value rather than dropped, and the residual Unclassified
is real: direct equity whose own statement printed no sector. `check:pages`
asserts that no fund name can appear as a holding on that page.

### Stage 10i — THE SAME MISTAKE, ON EVERY OTHER COMPANY-LEVEL SCREEN

Stage 10h fixed one page. The client came back with the same complaint — *"we
are mixing the AIF securities and showing them as equity"* — because the rule
lived in one component instead of in the model layer, and five more surfaces had
each re-derived their own narrowing and got it wrong the same way.

**THE AXIS IS `isFundVehicle`, AND `isPrivateClass` DOES NOT ANSWER IT.** Both
now live in `src/lib/analytics.ts` and every caller reads them from there:

- `isPrivateClass` — AIF / Unlisted / Structured Product — splits the book by how
  a holding is VALUED, a mark from an exchange versus a mark from a manager. It
  is the right axis for listed-vs-private and it drives `BOOK_SUMMARY`.
- `isFundVehicle` — **AIF / Mutual Fund / ETF** — is one purchase of a MANAGER'S
  PORTFOLIO. A mutual fund is marked daily at a published NAV, so it is not
  private; it is also not a company, and it has no GICS sector, no market cap, no
  NSE symbol, no P&L statement and no concall.
- `isCompanyShare` — `assetClass === "Equity"` — shares in a company, whether
  through a manager's discretionary mandate or the family's own demat. A PMS is
  an ENGAGEMENT, so those shares are the same asset as the LKP ones. It was
  called `isDirectEquity` until the family read the word "direct" as a claim
  about WHO CHOSE the position — see Stage 10j, and `holdingRoute` for the axis
  that answers it.
- `excludedClasses(positions, keep)` returns what a narrowed view left out, per
  class with its value, because the remainder is NAMED and never dropped.

Narrowing on the private axis fixed the AIF folios and left every other wrapper
in. What that cost, measured on this book:

| Surface | What it did | Now |
| --- | --- | --- |
| Exposure & IPS — sector GAP | covered ₹180.8 Cr: direct equity **plus ₹52.4 Cr of mutual funds under "Unclassified" and ₹6.8 Cr under "Cash"** | direct equity, ₹121.6 Cr, every excluded class named |
| Exposure & IPS — market-cap bands | the same set, so ₹59 Cr of funds and cash sat permanently in `unmeasured` — a shortfall against a market cap a fund can never have, exactly what that helper's own doc forbids | direct equity only |
| Return & Drawdown — attribution | bucketed only PRIVATE classes by class; mutual funds stayed in "Unclassified" beside direct equity that genuinely has no sector printed | every wrapper under its own class, named in the caption |
| Morning CIO — allocation | `Equity` = `Equity \|\| ETF`, folding a fund into the equity bucket on a listed-vs-private reflex | ETF is its own bucket; empty here, so it is named under "Not held" |
| Compare companies | the picker offered fund units and `Cash` under a heading reading "Compare companies", with a PE column and a filings row neither can fill | direct equity; the funds are named with their value |
| `topHoldingsForNews` | its comment said "listed exposures" while the loop took everything, so the news endpoint was sent `Cash`, `Tax Deducted at Source` and `Sanshi Fund-I (Open Ended AIF CAT-III) — Class E` | direct equity, weighted against the set it covers |

**AND A FUND UNIT MUST NOT BE RENDERED AS A COMPANY.** `/stock/:securityKey`
serves every holding, which is right — an AIF folio's quantity, cost, entities
and dated ledger belong on a page of their own. What did not belong is the five
company panels underneath: returns table, ratio table, screener financials,
concalls, insider trades, each rendering its own empty state. Five dashed boxes
under a fund's name read as five failed feeds; it is one decided absence and is
now stated once. **The test is the ASSET CLASS, not a null ticker** — a company
whose NSE symbol did not resolve is a resolver shortfall and keeps its panels,
because a future `build-symbols` fills them. A fund never will. The page also
leads with the asset class, says "no sector — a fund holds many" instead of
printing `Unclassified`, and its weight tile no longer reads "Weight in listed
book" over an AIF folio measured against the whole book.

**Look-through is what would make "securities in AIF show up inside AIF funds"
literally true, and this book cannot supply it.** A fund's underlying holdings
need each scheme's own portfolio disclosure joined to the folio the family
holds; the drop carries one such disclosure (WhiteOak's) and it joins to nothing
here. So the fund's value stays WHOLE, inside its own row, and the pages say so
rather than spreading it across sectors it was never reported against.

**THE FIRST DRAFT OF THE EXPOSURE CHECK COULD NOT FAIL.** It matched the
caption's prose — "direct equity", "excluded rather than folded in" — and that
prose is static: reverting the filter put Cash and the mutual funds straight
back into the table and `check:pages` still reported clean. Every invariant added
here is struck on FIGURES THE PAGE RENDERS, and each was verified by
reintroducing its bug and watching it fail:

- covered + excluded must reconstruct the header's consolidated NAV (the widened
  set gave ₹180.8 + ₹339.4 = ₹520.2 against a ₹461 Cr book);
- no class the caption names as excluded may stand as a row in the table above it;
- every wrapper class Return & Drawdown names in its caption must have its own
  attribution row, and no fund NAME may be a row label;
- ~~`/compare` offers no fund and says what it left out~~ — the page was REMOVED at Stage 10ap. `isCompanyShare` is still the filter behind Sector Composition and Exposure & IPS, and both still assert that no fund wrapper appears as a company row;
- a new `stock-fund` route asserts the fund page states the research does not
  apply and renders none of the five panels — while the existing `stock` route
  asserts a COMPANY still carries all of them.

### Stage 10j — THE COMPLAINT CAME BACK, AND THIS TIME THE MODEL WAS RIGHT

*"we are mixing the AIF holdings into equity."* Stage 10i answered that on six
surfaces by fixing the AXIS each of them narrowed on. The family said it again
against a book where every one of those fixes was live, and the third time a
complaint arrives is when it is worth checking whether the answer is the same.

**IT WAS NOT.** Measured over `BOOK_POSITIONS`: every position classed `Equity`
sits in a PMS or Execution account, every AIF folio is its own `AIF` row, and
`isDirectEquity` is `assetClass === "Equity"`. **Nothing was mixed.** What was
wrong were three other things the same sentence covers, and they are different
in kind — one wording, one arithmetic, one page:

**1. A HEADING A READER MISREADS IS A DEFECT IN THE HEADING.** The Portfolio
Monitor sections its holdings by class, and the first and largest section was
headed `EQUITY` — 146 holdings, ₹128.1 Cr, with `AIF`, `MUTUAL FUND` and `CASH`
sectioned below it. Read as a heading over the whole table it says the table is
equity; read as a section label it says only what it labels. Both readings are
available and only one is right, which is the heading's fault and not the
reader's. It became `Direct Equity` — and that word introduced a SECOND
misreading within the day, because "direct" asserts who chose the position. It
is **`Company Shares`** now, which carries neither claim: a fund is not a
company, and nothing in the phrase says whose decision it was. See Stage 10j,
which is the second half of this same fix.

**`assetClassLabel` in `analytics.ts` is the ONE place that word is chosen.**
`AssetClass` is the MODEL's vocabulary and does not move: it is what
`assertNormalized` enforces at ingest, what `precedence.mjs` is written in, and
what every predicate tests. Renaming the VALUE would rewrite the generated book
for a wording change. Every surface that renders a class reads the label from
that one function — the monitor's sections and its filter, Morning CIO's
allocation bucket, Exposure & IPS's contributors, laggards and bucket mapping,
Capital Gains, Ledger Insights, the stock page's pill, the review deck's
allocation slide. A label re-typed per screen is a label that disagrees with
itself, and this one already had six places to disagree in.

The class filter is `All categories` now, and its options carry the same labels.

**2. THE CLASS SUBTOTAL WAS NOT ON THE FOOTER'S BASIS.** Each section heading
prints its own subtotal, summed from the rows it holds — and the footer counts
each `dedupeGroup` once. In the BY-SECURITY view those agree, because its rows
are already consolidated. In BY-ENTITY, which shows every statement's row as
printed, they did not: **both of this book's duplicates are AIF holdings**, so
the AIF heading summed ₹3.17 Cr the footer beneath it correctly did not, and a
reader adding the four headings landed ₹3.17 Cr above the Total. That is the
same "a total must tie to its own columns" rule the allocation footer already
cost this book once. The subtotal is on the footer's basis now, and the heading
NAMES what it collapsed — `₹3.17 Cr reported twice, counted once` — because the
rows on screen still add to more than it, by design.

**3. AND THE AIF'S OWN DRILL-DOWN HID ONE OF THE TWO STATEMENTS.** *"AIF holdings
must be shown inside the respective AIF page drill down."* `/stock/:securityKey`
serves every holding and its "Position by account" table maps the RAW rows, so
both CRNs were listed — but the pill above read **"Held in 1 entity"**, because
`held` counted the DEDUPED set. A count of the entities whose statements carry a
name is a per-owner figure, and §"consolidated counts once, per-account does not"
says it must not dedupe. Two contradictory claims on one screen, and the wrong
one is the specific one a reader believes.

The Total under that table is still consolidated and still right; what was
missing is that the column does not add to its own footer, which now says so in
a line under it rather than leaving it to be found by adding.

**And the same page led with a fabricated ₹0.** `const cmp = rows[0]?.currentPrice
?? 0` printed a 2xl `₹0` as the CMP of every holding marked at a TOTAL value
rather than a per-unit price — 360 ONE's AIF units among them, so a ₹1.47 Cr
position was headed by a zero price. `price()` already renders null as an em
dash; the default was the whole of the bug. This is the watchlist's own rule
(*a price nobody has set is `null`, never 0*) failing on the read side.

**Each of these is asserted on the RENDERED PAGE, and each was verified by
reintroducing its bug and watching the check fail** — the discipline Stage 10i
established after its first draft turned out to match static prose:

- `monitor` — the section is headed `Company Shares`, the filter reads `All
  categories`, no fund NAME appears between that heading and the next class
  heading, and the class subtotals reconstruct the footer;
- a new `monitor-entity` route toggles the by-entity view and asserts the same
  reconstruction there, plus that a collapsing section names what it collapsed;
- a new `stock-aif-dual` route on the holding reported under both CRNs asserts
  the entity COUNT agrees with the account rows rendered (against the rows, never
  against a literal — the count is a generated figure), that the rows-vs-total
  gap is named, and that no zero price stands in the CMP headline.

### Stage 10c — measuring against the deployed site

`MUNS_TOKEN` exists only in the Cloudflare Pages environment, so locally every
`/api/*` call 404s — indistinguishable from an upstream that answers with
nothing. Four endpoints therefore shipped saying UNVERIFIED AGAINST THE LIVE
API. **A local `vite preview` cannot settle that, and this repo has already paid
once for measuring on the wrong network** (FRED, declared unreachable from a dev
container, answers fine from the runner that actually runs the harvest).

`scripts/dev/live-api-proxy.mjs` serves the LOCAL build and forwards only
`/api/*` to the deployment, signing in with the gate password itself:

```
npm run build && npx vite preview --port 4173 &
GLOW_PASSWORD='…' node scripts/dev/live-api-proxy.mjs     # → :4174
```

It deliberately does not cache — a stale success would hide a live outage, which
is the confusion it exists to remove. Two things it found immediately:

- **The gate returns the LOGIN PAGE for `/api/*`, HTTP 200, `text/html`.** Right
  for a browser, a trap for a script: a naive probe reads 200, fails to parse
  HTML as JSON and reports a working endpoint as broken. Check the content type,
  never the status alone.
- **`ratio_source` does not return ratios.** It returns a moneycontrol URL and
  the instruction "Use WebReader Tool". That is a source POINTER, and the page
  passing its words through verbatim is the only honest rendering of it.

**Chromium cannot use this session's egress proxy** — every https navigation
returns `ERR_CONNECTION_RESET`, `example.com` included, so it is not the site.
Node's fetch can, with `NODE_USE_ENV_PROXY=1`, which is why the bridge exists at
all rather than pointing a browser straight at the deployment.

**The quote feed's `marketCap` is in RUPEES**, which unblocked a real feature.
`CompanyResearchPreview` had withheld a rupee market cap because the unit was
unverified and "a value here could be wrong by a factor of a crore" — correct to
withhold, and this is the check: ABCAPITAL reads ₹1,11,403 Cr against
screener.in's ₹1,11,347 Cr, 0.05% apart on two snapshots minutes apart.
`src/lib/marketCap.ts` bands the listed book on it.

**A PARTIAL FEED SILENTLY RE-BASES A WEIGHT, and that is a new failure mode this
book had not met.** Market-cap bands are weights of the PRICED book, so they move
as quotes arrive: measured mid-load the split read Large 23.0 / Mid 29.5 / Small
47.4 over ₹78.7 Cr, and once settled, Large 16.0 / Mid 25.7 / Small 58.3 over
₹122.1 Cr — same book, same code, seven points apart on large cap. Neither is
wrong on its own terms, which is exactly why the card renders "still measuring"
until `quotesStatus` settles rather than showing a split that will move.

**The bands are a DECLARED CONVENTION, not SEBI's classification.** SEBI ranks
the whole listed universe — top 100, next 150, the rest — recalculated half-yearly
by AMFI. A rank over the 140 names this dashboard prices would put this book's
100th-largest holding in the large-cap band. So they are round thresholds
(₹1,00,000 Cr / ₹25,000 Cr), stated on screen beside the numbers they produce: a
cutoff written as ₹1,00,637 Cr would read as the authoritative figure it is not.

**A failure message must name WHICH failure, and the company page named the
wrong one.** It read `live ? "live" : "no live quote for this security"`, so a
page still fetching asserted the security has no live quote — while the top bar
on the same screen said "Fetching prices…". Three states now: fetching, no NSE
symbol resolves (can never go live), and the feed returned no quote for a symbol
that does resolve.

### Stage 10d — the research tables are TABLES, and the outage rule

**`ratio_source` returns prose and stays prose. `financial_tables` does not.**
The rule that nothing is computed from the research endpoints was written for
the former — probed live it answers with a moneycontrol URL and "Use WebReader
Tool", and nothing in it says which number is which company's PE.

The financials document is a different shape. Measured 2026-08-11, five of its
eight sections are MARKDOWN PIPE TABLES labelled on both axes — Shareholding
Pattern, Balance Sheet, Profit & Loss, Quarterly Results, Peer Comparison, with
twelve year-ends of history. Reading a table whose columns say which period and
whose rows say which line item is not inventing a mapping; it is the same
discipline `lib/table.mjs` applies to the statement PDFs, and
`src/lib/financialTables.ts` follows it: **match on header text, never on column
index.**

Four things that fixture found, none of which a hand-written sample would have:

- **screener separates its expand marker with a NON-BREAKING space** —
  `Revenue\u00a0+`, `Promoters\u00a0-`. Left in, every label comparison fails
  against a string a human would type. Folded to an ordinary space once, in
  `cellsOf`, so no consumer has to know.
- **The label column is not always column 0.** Peer Comparison puts a serial
  number there and the company NAME in column 1, so every row carries its full
  `text[]` and a consumer reads the column it needs.
- **A blank cell is not zero.** Gross NPA % is empty on every column for a
  non-lender, and reading it as 0 would put a measured-looking zero in a chart.
- **TTM is not a year end.** It is carried as a flagged column and excluded from
  any CAGR, because letting it in silently shortens the window.

**No house schema across companies.** ABCAPITAL is a lender printing Revenue /
Interest / Financing Profit; a manufacturer prints Sales / Operating Profit /
OPM %. Each metric names the labels it accepts IN ORDER and a company reporting
none of them renders absent with its own name in the reason — mapping both onto
an invented "EBITDA" is the fabricated-classification failure again.

**A CAGR is null wherever the arithmetic would lie**: one point, a span under a
year, or a start at or below zero. The last is not theoretical — a company that
swung from a loss to a profit has no compound rate and the formula returns a
confident number for it.

### The upstream goes down, and stale beats nothing

Measured: every research kind and the quote endpoint answered normally at
2026-08-11 14:25 UTC and every one of them timed out at 02:39 UTC the next day,
RELIANCE and ABCAPITAL included. **A whole-API outage, not a slow company** — so
a longer timeout would have fixed nothing.

`research.js` HELD an entry for 24 hours but only SERVED one for 12, so a request
landing in that gap discarded a good copy the moment the upstream failed and
rendered an empty panel. It now falls back to the held copy and reports the
upstream failure alongside it, so "serving yesterday's tables BECAUSE the feed is
down" is distinguishable from "serving a cached copy".

A 10-year P&L does not move intraday, so yesterday's copy is the same document.
What makes that honest is the age: `stale` and `ageS` ride in the response and
the panel renders them in a band ABOVE the tables, never a tooltip. Same rule the
harvester already follows for a blocked observation — keep the last good value,
show it with an honest as-of. Verified in production during the outage:
`ok:true, stale:true, ageS:44188` with 11,296 bytes of real tables.

Quotes needed no change: it already carries a per-symbol `ageS` with fresh/stale
counts, which is the stronger treatment a PRICE requires.

## Stage 10e — what the catalogue probe unlocked, and the two checks it forced

`docs/API-PROBE.md` records six unused endpoints exercised against the live API
on 2026-08-12. Two of them turned out to carry things nothing here could serve,
and BOTH arrive with a defect that has to be checked at runtime rather than
reasoned about. That is the whole shape of this stage: the data is real, the
labels on it are not, and each check is on screen because a reader cannot
verify it any other way.

**`/financials/<TICKER>.NS` — the cash flow statement and the earnings
calendar.** screener's document (the Financials tab) carries neither, and
`combined_financials` was measured to be the same eight sections, so there was
no source before. The `.NS` suffix is the whole unlock: `/financials/RELIANCE`
answers 200 with "No data available" under every heading, which reads as India
being unsupported and is not.

**ITS FIGURES ARE RUPEES PRINTED WITH A DOLLAR SIGN.** The document settles that
itself — it prints `Basic Average Shares $2.61B`, and a share count is not
dollars, so the symbol is a formatter artifact on every numeric cell. But
knowing the symbol is meaningless is not knowing the figures are rupees, and
"it must be, it is an NSE ticker" is a plausible default. So the unit is
RECONCILED at runtime against the screener document for the same company, by
two comparisons that establish different things: EPS carries no crore/million
scaling so agreement fixes the CURRENCY, and revenue against screener's crore
figure fixes the SCALE at 1e7. Nothing monetary renders until both pass, an
UNMEASURABLE check is treated exactly like a failed one, and the comparison is
printed above the table rather than reduced to a badge. The figures are also
pre-rounded to three significant figures, so nothing is derived from them.

**`ratio_source` → `web_reader` — the ratio table.** The standing rule that
this endpoint's response stays prose is unchanged and was always about its OWN
reply, which says nothing about which number is which company's PE. Following
its literal instruction ("Use WebReader Tool") lands on a page carrying the
table labelled on both axes, seven year-ends deep.

**AND THE RESOLVER IS WRONG ABOUT A QUARTER OF THE TIME.** Measured across the
first fifteen holdings carrying an NSE symbol, four resolved to an entirely
different company — Aditya Birla Capital → Tata Capital, Bajaj Auto → Bajaj
Finance, Alivus Life Sciences → Altius Telecom, BLS International → Sona BLW —
each page carrying a complete correct table for the company it is really
about. **A MISMATCH RENDERS NO TABLE**, not a warning above one: a screen of
true figures belonging to somebody else is the worst fabrication available
here, and there is nothing on it a reader could catch it by. The page's H1 AND
the company name in its URL are both compared through `securityKeyOf`, because
moneycontrol abbreviates the title (`BHEL`, `AFL`) where the URL spells the
name out; a wrong page is wrong on both, so the second identifier buys no risk.

Three things the real page forced, none of which a written sample would have:
the second column is a Highcharts placeholder, so a positional read shifts
every figure back a year; section headings arrive as rows with no figures; and
the per-share rows are NOT share-count adjusted — on Reliance every one of them
halves between Mar 24 and Mar 25 while the margins do not move, which
`shareCountBreaks` detects by exactly that signature and the page names.
Reported, never corrected: adjusting would invent a factor the source never
published.

**THE HARVESTER CANNOT USE ANY OF THIS.** `MUNS_TOKEN` is in the Cloudflare
Pages environment; `harvest.yml` carries only `DATA_GOV_IN_KEY`. The web_reader
route serves browser-facing pages only.

### And the geo-block was measured against the wrong network, again

The thirteen RBI Weekly Statistical Supplement series and the CEA generation
series are declared absent as "geo-blocked". Measured from a GitHub Actions
runner on 2026-08-12, with both of `probe-reach.mjs`'s controls passing:

| Host | From the runner |
| --- | --- |
| `rbi.org.in` — WSS issue page | **OK 200, 1,226 ms** |
| `rbidocs.rbi.org.in` | **OK 200, 1,159 ms** |
| `cea.nic.in` | **OK 200, 2,493 ms** |
| `mospi.gov.in` | fetch failed |
| `www.fpi.nsdl.co.in` | fetch failed |

The original measurement was taken in a development container, which is not
where the harvest runs — **the identical mistake FRED cost this repo**, and the
second time the same wrong network has hidden an available source.

**Reachability was not the blocker, and neither is geography.** `probe-rbi.mjs`
went on to ask the question that actually decides it, and the answer is that
the current supplement HAS NO URL:

- Every WSS link on every RBI page is a `WebForm_DoPostBackWithOptions` call.
  There is no `href` to follow; the index sits behind `__VIEWSTATE`.
- Replaying that postback — the page's own `__VIEWSTATE` and
  `__EVENTVALIDATION`, with the `__EVENTTARGET` the page itself names — returns
  200 and 67 KB carrying five table rows, **zero figures and none of the WSS
  table names**. It likely needs a session cookie and the right control, which
  is a scraper against a form rather than a fetch.
- The `.XLSX` those pages link answers 200 with `text/html`, so the document
  route is closed too. That one is worth noting on its own: **checked by status
  it passes**, and it was recorded as reachable once before being checked by
  content.

So the 13 series stay absent — with the reason CORRECTED from "geo-blocked" to
"the current issue has no address". That distinction is the whole point of
keeping these declarations: one of them tells a reader to give up, and the
other tells them exactly what to build. `scripts/harvest/probe-sources.mjs`
carries the measurement beside the entry so it cannot go stale silently.

### The alert engine — silence is read as all-clear

**THE EVALUATOR HAS BEEN REMOVED WITH ITS PAGE — see Stage 10y.** `alertEngine.ts`
still exists and still serves Exposure & IPS's IPS-bucket roll-up
(`bucketActuals`, `bucketWeightPct`); what went is `evaluateAlerts` and
`ALERT_KIND_LABEL`, which had no caller once `/alerts` was removed at the
family's request. The family's alert RULES are untouched in `familyInputs.ts`
and still export; nothing evaluates them today.

The rule it enforced is kept here because it is the reason a future rules engine
must not be written naively, and because it generalises past alerts: **a rule
whose inputs are incomplete does not fire, and does not pass either** — it
reports UNMEASURABLE with the reason, counted apart from the clear. A price rule
on a security with no live quote must never look like one that was checked and
held; a month-old statement mark cannot answer whether a level was crossed
today. That is the absent-vs-zero rule applied to a boolean.

Alerts the spec asks for that need a SOURCE rather than a threshold — manager
resignation and style drift, liquidity coverage, capital-call dates — were named
on the page rather than shipped as rules that would sit permanently silent.

## Stage 9d — the economic release calendar (`/api/econ-calendar`)

**THE PAGE THIS SHIPPED ON HAS SINCE BEEN REMOVED — see Stage 10x.** Economy &
Macro went at the family's request, and `EconomicCalendar.tsx`,
`src/lib/econCalendar.ts` and its saved-response test went with it. The Function
still stands and is named there as uncalled. Everything below is kept because it
is what was MEASURED about that upstream — the off-by-one on Nasdaq's date
parameter, the silent 2000-row cap, the verified `importance` mapping — and a
future session wiring a calendar again should read it before probing anything.


The Economy page's calendar was declared impossible on the grounds that a
schedule and a street consensus are licensed vendor products. **That was the
third absence in this repo recorded against an unchecked premise**, after FRED
and the RBI, and like both it told a reader to stop looking for something that
was available. Five sources were measured (`docs/API-PROBE.md`): Bloomberg 403s,
TradingEconomics' free API is discontinued (HTTP 410 — "subscribe to a plan"),
moneycontrol and Sensibull expose no JSON, and **two answer freely** — Nasdaq's
`calendar/economicevents` and **TradingView's `economic-calendar/events`, which
is what is wired.**

**IT WAS CHOSEN FOR THE FIELD THIS BOOK CARES MOST ABOUT: `source`.** Every row
names the agency that published the figure — "Ministry of Statistics and
Programme Implementation (MOSPI)", "Office of the Economic Advisor" — with its
URL. It also carries an ISO-8601 UTC instant, an importance rank, the PERIOD the
reading is for and the unit, none of which Nasdaq's has.

**NASDAQ'S DATE PARAMETER IS OFF BY ONE, and its `gmt` field is not GMT.** Its
rows for `date=D` are the events of `D − 1` — established on five independent
anchors (Nonfarm Payrolls, a Friday release, arrived under a Saturday; jobless
claims, a Thursday one, under a Friday; US CPI under the day after it released)
and then confirmed by TradingView timestamping the same India CPI print a day
earlier. Its times are US Eastern despite the field name: India CPI reads
`06:30`, which is 16:00 IST. Both are recorded because Nasdaq remains the
fallback if TradingView's endpoint closes, and a future session must not wire it
naively. Where the two overlap they agree to the decimal, which is why the shift
is stated as measured rather than inferred.

**THE RESPONSE IS CAPPED AT 2000 ROWS AND THE CAP IS SILENT.** One request for a
month returns exactly 2000; the same window as four sub-requests returns 2180
distinct ids. The Function slices every window into ≤7 days, merges on the event
id (the `datedRowsAcross` rule — a repeat across two requests is a duplicate,
not data) and sets `truncated` where a slice still hits the cap, which the page
renders in a band above the table. **No silent caps.**

**`importance` IS −1 / 0 / 1 AND THE MAPPING WAS VERIFIED.** Across three weeks
of US events `1` is Non Farm Payrolls, Unemployment Rate, Inflation Rate YoY,
Core Inflation Rate and the ISM PMIs; `−1` is bill auctions and PMI finals.
Guessing it the other way would print "High" against a 3-month bill auction —
the fabricated-classification failure, again. An UNRANKED release is labelled
unranked, never demoted to "low".

Four presentation rules, each a plausible-looking wrong answer avoided:

- **SURPRISE NEEDS BOTH HALVES.** Actual less consensus, and only where both are
  published — 43 of 68 rows in the saved fixture have no actual yet and 15 have
  an actual with no consensus. A surprise struck against a missing consensus is
  the whole actual dressed up as a beat, which is the IPS-gap failure exactly.
- **AND IT CARRIES NO VERDICT.** A CPI print above consensus is bad news, a GDP
  print above consensus is good, an unemployment rate above consensus is bad
  again — and nothing in the feed says which way round an indicator runs.
  Colouring every beat green would assert a direction for hundreds of indicators
  nobody classified. The sign is shown; the meaning is the reader's.
- **NO FIGURE WITHOUT ITS UNIT.** 4.45 is a percent, 692.87 is billions. Same
  rule as the harvest store's `USX` cents.
- **A RELEASE WITH NO ANNOUNCED TIME MUST NOT MOVE A DAY.** The source stamps
  those at midnight UTC; rendered in a zone behind UTC that lands on the previous
  day. They are treated as day-only and grouped on the source's own date.

**IT LIVED ON ECONOMY & MACRO, AND NOWHERE ELSE.** Macro Research carried a
SECOND "Data release calendar" card, declaring a calendar impossible for the
same reasons — which stopped being true the moment this was wired, so a stale
absence would have contradicted the working page one link away. It was removed,
and `check:family` asserted both halves of that: the claim gone from Macro, the
real calendar still rendering with its filters on Economy. A removal is verified
by asserting it happened — which is why, now that BOTH those pages have gone
(Stage 10x), that same pair of checks became one asserting neither page renders
its own content at its old address.

`src/lib/__tests__/econCalendar.test.ts` asserted all of it against a REAL saved
response, and its anchor case is India's CPI — the field the Economy page once
printed as an invented `4.83%`, now measured at 4.45% actual against a 4.50%
consensus, with MOSPI named as the publisher.

**It needs no token**, so it kept working through the muns outage that was live
the day it was written.

## Stage 9c — Industry Research: REMOVED

The page composed the harvested store into a per-industry dashboard — seven
industries, each declaring which stored series ARE its input and output prices,
with a rebased basket chart — and named its structural gaps (capacity,
utilisation, order books) rather than drawing them. The family asked for it to
go; `/industry` redirects to `/cio` — it forwarded to `/macro` until that page
was removed too (Stage 10x) — and `check:family` asserts the redirect.

**NOTHING IT DEPENDED ON WAS DELETED WITH IT.** Every series it read is still in
the harvest store: coal, iron ore, HRC, the base
metals, crude, gas, spot power and the fertiliser complex. What is gone is one
arrangement of them.

The reasoning is worth keeping even though the screen is not, because it governs
any future attempt: **THE BOOK CARRIES SECTORS, NOT INDUSTRIES.**
`Position.sector` is GICS ("Materials", "Utilities"); nothing in the archive says
"Cement". So that page's exposure panel named the SECTORS it matched and said
plainly that these are holdings in a related sector — never that those companies
operate in the industry above. Asserting an industry no statement stated is a
fabricated classification, the same failure class as an index-cycled valuation
method. And where a series was a global benchmark rather than the Indian price —
US Midwest HRC, seaborne coal, international urea — the row said so, because a
benchmark standing in silently for a domestic price is a substitution a reader
would never detect.

## Stage 9b — company price history (`/api/prices`)

**Store what is read in aggregate; PROXY what is read one at a time.** Macro
Research shows forty series in one table, so it reads the harvested store.
A COMPANY page shows one company, and one edge-cached call answers it
completely — committing 140 securities' daily history would add megabytes of git
objects every trading day, forever, to serve a page that needs one of them.

`functions/api/prices.js` returns a security's whole daily close history from
Yahoo's chart endpoint plus the spec's returns table. It replaces
`functions/api/history.js` + `src/lib/returnsTable.ts`, which asked muns
`market_data` ONE QUESTION PER HORIZON — twelve upstream calls per company —
because that endpoint returns a four-row preview and never a series. The company
page consequently had no chart at all, and said so. It has one now: Aurobindo
comes back with 7,671 closes from 1996.

**`computeReturns` lives in `shared/seriesReturns.mjs`** and is imported by BOTH
the harvester and this function. Two implementations of "what is a 10-year CAGR
when the listing is two years old" is how one page ends up disagreeing with
another; the answer (absent, never a shorter window relabelled) is written once.

**Only settled sessions, here too.** Today's in-progress bar is excluded, so a
1-day return is never measured against a price that was never a close. The live
price is a separate measurement and the page labels it as one.

## Stage 9 — the macro series store (`npm run harvest`)

**NO PAGE READS THIS STORE SINCE Stage 10x, AND THE HARVEST STILL RUNS.** Macro
Research and Economy & Macro were the only two surfaces that charted a harvested
series and both have been removed at the family's request. The nightly Action is
deliberately untouched: the RBI rates and IEX spot power below are ACCUMULATING
— one observation per run, because their sources publish a current value and no
history — so stopping it would end those series rather than pause them. The read
side (`src/lib/series.ts`) stays for the same reason and says so in its header.


```
scripts/harvest/catalogue.mjs   what the FOOS spec asks for, and where it comes from
   |  npm run harvest           fetch -> validate -> merge -> write
   v
public/series/index.json        manifest: metadata + PRECOMPUTED returns per series
public/series/<id>/meta.json    unit, provenance, source, coverage, staleSince
public/series/<id>/<year>.json  daily observations, ONE FILE PER CALENDAR YEAR
docs/SERIES-REPORT.md           what harvested, what failed, what is declared absent
```

**Why a store and not a proxy.** The spec repeats one requirement under every
research module: daily/weekly/monthly/quarterly/year-end history, max available,
a returns table with 3/5/10-year and max CAGR, 52-week high/low, interactive
charts, overlay-and-compare, export. Every one of those is a function of a stored
series. `market_data` returns a FOUR-ROW PREVIEW of any window (see the note atop
`functions/api/history.js`), so no amount of request-time proxying can answer
them. The store can, and it needs no token: **64 series** across three adapters,
the S&P's daily closes running to 1970 and the Pink Sheet's commodity prices to
1960.

| Adapter | Series | Frequency | What it serves |
| --- | ---: | --- | --- |
| `yahoo.mjs` | 40 | daily | commodities with a futures contract, all twelve indices, six FX pairs, the US Treasury curve (3M/5Y/10Y/30Y) |
| `worldbankPink.mjs` | 15 | monthly | what no free daily feed carries — thermal coal, LNG, iron ore, palm oil, rubber, the licensed LME metals (zinc, nickel, lead, tin) and the fertiliser complex |
| `worldbankApi.mjs` | 9 | annual | India and US growth, inflation, unemployment, government debt, gross savings — the Economy page's live rows |
| `rbi.mjs` | 7 | accumulating | RBI's current policy rates — repo, SDF, MSF, bank rate, reverse repo, CRR, SLR |
| `iex.mjs` | 1 | accumulating | Indian day-ahead spot power, the day's average clearing price |
| `amfi.mjs` | 7 | monthly | mutual-fund AUM, net flows, equity/debt flows, Gold and other ETF flows, folio count — 88 months each, backfilled from AMFI's own archive |

**AN ACCUMULATING SOURCE PUBLISHES ONLY TODAY, AND THE STORE BUILDS THE REST.**
The RBI states the rate in effect now and offers no downloadable history; IEX
shows one day's market snapshot. Each run contributes ONE observation and `merge`
keeps every earlier one, so the series is built here a day at a time — which is
exactly what the accumulate-never-truncate rule was written for. `accumulating:
true` travels in the meta, and the UI marks those rows **building · N** rather
than presenting two observations as a trend. Every horizon stays absent until the
store has held the series long enough to answer one; that is the honest state,
not a broken chart.

**A 52-week high has to describe a year.** An accumulating series starts with one
point, and reporting its own value as both the high and the low of the year
states a range nothing measured. An ANNUAL series is worse — one or two readings
inside any 365-day window would make its "52-week range" a year-on-year change
wearing the wrong label. The window must hold at least eight observations and
span 180 days, and annual series never report one.

**RBI rates are matched by label WITH A BOUNDARY.** "Repo Rate" is a substring of
both "Policy Repo Rate" and "Fixed Reverse Repo Rate", so an unanchored search
binds the wrong number to the wrong rate — and both are percentages in the same
range, so the result reads perfectly plausibly. Every pattern is anchored so the
label cannot be preceded by another word character. The same reasoning as the
`securityKey` ISIN suffix rule.

**IEX stores the day's AVERAGE across all 96 blocks**, and says so. Indian spot
power runs from roughly ₹1,100 to the ₹10,000 ceiling within one day, so a single
block would be an arbitrary pick. A day that parses fewer than 90 blocks is
refused rather than averaged into a figure that looks like a full day's price.

**The Pink Sheet's URL is versioned per release and is DISCOVERED, not hardcoded.**
The file sits under a path containing a release hash that changes monthly, so the
adapter reads the landing page and takes the link the World Bank is currently
publishing. A hardcoded path keeps returning 200 while serving a frozen file —
the failure nobody notices until someone asks why a price stopped moving. Columns
are matched by HEADER TEXT for the same reason `lib/table.mjs` does it on
statement PDFs: the sheet gains and drops columns between releases, and a
positional read would keep working while returning a different commodity.

**A horizon shorter than the publication period does not exist.** The Pink Sheet
is monthly; resolving a "1 day" return by nearest-earlier observation returns
LAST MONTH's price under a column headed 1D. `computeReturns` takes the series'
frequency and leaves those cells absent — the same rule as "a horizon the series
cannot reach is null", applied at the other end of the scale. Annual series
likewise carry no 1D, 1W, 1M or QTD.

**FRED WAS DECLARED UNREACHABLE AGAINST THE WRONG NETWORK, and is now wired.**
The note here used to read "unreachable from the harvest environment (connection
refused, not a proxy fix)", and `india-10y` and `credit-spreads` were declared
absent on that basis. The measurement was taken in a development container. The
harvest does not run there — it runs on a GitHub Actions runner — and measured
from the runner all three FRED endpoints answer in under a second with valid
CSV. **An absence recorded against the wrong network is worse than a gap: it
tells a reader to stop looking for something that is available.**
`scripts/harvest/probe-reach.mjs` is what settled it and carries two known-good
CONTROLS, so a degraded runner can never be mistaken for a dead source.

`adapters/fred.mjs` reads the keyless `fredgraph.csv` (no registration, nothing
near the secret store) and both series are live. Two things it gets right and
one it does not have to:

- **A "." is FRED's no-observation marker**, not a zero. Skipped, because a 0%
  yield in the middle of a bond series drags every average through it.
- **The short series is the SOURCE's doing, not a truncated request.**
  `BAMLC0A0CM` returns exactly three years, which is the shape of the silent
  truncation this repo has hit before — but `DGS10` from the same endpoint
  returns 16,855 rows back to 1962 and no `cosd`/`coed` changes either. The ICE
  BofA family is LICENSED and FRED redistributes only a rolling window. So it is
  carried with that stated, `merge` extends it from here, and every horizon
  longer than what is stored stays null rather than being answered from a
  shorter window — which is why `y3`/`y5`/`y10` are absent on it today.
- **It is a US spread and the label says so** (`US Corporate Credit Spread (ICE
  BofA OAS)`). India has no free equivalent, and carrying it as an unqualified
  "Corporate Credit Spreads" would let a reader take a US number for their own
  market — the same substitution the industry page refuses when a global
  benchmark stands in for a domestic price. The Economy page's **India AAA**
  spread row is therefore still absent; this series does not answer it.

`india-10y` is MONTHLY (OECD's India long-term government bond yield via FRED),
which the frequency rule already handles: no 1D or 1W return is computed from
it. The daily RBI benchmark still needs a reader. The US 10-year continues to
come from CBOE's `^TNX` rather than `DGS10` — both work, and changing a live
series' source for no gain would rewrite history for nothing.

**A band exists to catch the SOURCE changing, not to second-guess history.** The
first zinc band started at $200/t and blocked eighteen real observations from the
1960s, when zinc genuinely traded near $180. The gate behaved correctly against a
band that was wrong; bands are now set from each series' own observed range.

**Year chunks, because git stores whole blobs.** A 26-year daily series rewritten
nightly would add megabytes of objects a day, forever. Chunked by year a run
touches only the current year (a few KB) and closed years are written once. It
also makes a range-limited chart cheap: a 1-year window fetches one file, not a
14,000-point history.

**It is idempotent, and that is load-bearing.** Two runs with no new data leave
the tree clean — `retrievedAt` and the manifest's `generatedAt` only move when a
figure moved — so the nightly Action commits on a real change and never on a
timestamp. Same guarantee `build-book` gives.

**Merge accumulates, never truncates.** Stored points the incoming batch does not
mention survive. Phase 0's Yahoo adapter hands over full history so the merge is
a no-op, but the sources coming next (RBI's weekly supplement, AMFI's monthly
flows, a scraped spot price) publish only a CURRENT value — against those the
store builds the history itself, and a source going dark cannot shorten it.

**Three rules keep a harvested figure honest**, and each is a bug that was live
before it was written:

- **Only settled sessions are stored.** Yahoo appends an in-progress bar whose
  "close" is the last trade and moves all day. Storing it put an intraday
  snapshot into a series of CLOSES, so a stored date's value changed on every
  run and a 1-day return was measured against a price that was never a close.
- **A yield is not a price.** The US 10-year going 0.52% → 4.28% is +376bp, not
  +723%. Series with `unit: "%"` carry `kind: "yield"` and report ABSOLUTE
  percentage-point change, never a CAGR.
- **Every horizon is independent and a horizon the series cannot reach is null.**
  Nifty's history starts in 2007; falling back to the earliest point would label
  a 5-year return as a 10-year one.

**The gate** (`lib/validate.mjs`) blocks a point that is non-finite, future-dated
or outside the series' declared band — a band trips when the SOURCE changed a
unit or a scale, not when the market moved — and warns on large moves, revisions
and staleness. A blocked point never reaches disk, so the series keeps its last
good value and the page shows it with an honest `as of` date. `large-move` on a
`=F` series is usually a futures CONTRACT ROLL rather than an error, and the
report says so.

**Units are declared, never inferred.** Yahoo quotes the grains, cotton, sugar
and coffee in US CENTS (`USX`). Reading 639.75 as $639/bushel instead of ¢639 is
a 100x error that looks like an ordinary price on a chart, so the unit travels
with the series from the catalogue to the axis, and a mismatch against what the
upstream reports is a finding.

**A series the spec asks for and nothing serves is DECLARED ABSENT**, with the
reason and the phase that will fill it, and rendered as such — thermal coal, iron
ore, the LME metals, palm oil, rubber, the CRB, the Baltic Dry, India's 10-year.
As of Phase 2 seven remain: coking coal (the Pink Sheet publishes thermal only),
the CRB, the Baltic Dry, container and rail freight, and AMFI's mutual-fund and
SIP flows. India's 10-year G-Sec and corporate credit spreads came OFF this list
when FRED turned out to be reachable — see above. AMFI is the
interesting one: it publishes ~100 monthly reports back to 2018 — real history,
not a latest value — but they are legacy BIFF `.xls` workbooks, which neither
ExcelJS nor this repo's own `sheet.mjs` (built for OOXML and for the HTML tables
brokers misname `.xls`) can open. It needs a BIFF reader added as a dependency.
The Bloomberg Commodity Index is carried in place of the CRB **under its own
name**, because it is a different index and presenting it as CRB would be a
fabrication with a badge on it.

### AMFI — a BIFF reader, and four layout changes it had to survive

`adapters/amfi.mjs` reads AMFI's monthly mutual-fund report: AUM, net flows,
equity and debt flows, Gold and other ETF flows, and the folio count — **88
months each, back to April 2019.** It BACKFILLS rather than accumulating,
because AMFI keeps ~100 past workbooks online; that is the difference between a
series a reader can chart and one that says "building · 2".

The workbooks are legacy BIFF (`d0cf11e0a1b11ae1`, an OLE2 compound document),
which neither ExcelJS nor this repo's `sheet.mjs` opens. `xlsx` (SheetJS) is
added for exactly that and nothing else.

**FOUR THINGS CHANGE BETWEEN ISSUES, and each one silently cost months before it
was measured.** None of them throws — every one just returns fewer observations,
which is why the adapter reports how many workbooks contributed nothing:

- **The sheet name.** `MCR`, `MCR Monthly Report`, `MCR_MonthlyReport`,
  `MCR_Report`, `AMFI MONTHLY`, and in the older files simply the month
  (`Dec 19 `). Matched by pattern, first sheet as the last resort.
- **The title format.** "Monthly Report for the month of July 2026", "Monthly
  Report for April 2026", "Monthly Report for March-2026", "Monthly Data for
  February 2020". A pattern requiring "month of" dropped three months in six.
- **The total's label.** "Grand Total" today, "Grand Total (A + B + C)" in
  2019-20. An exact-equality test cost eleven months on three series.
- **The AUM column's label.** "Net Assets Under Management as on 31-Jul-2026"
  today, plain "AUM as on 29-Feb-2020" then. Cost eleven more on that series.

**The month comes from INSIDE the file**, never the filename — the mistake the
ingest already made when a fact sheet named `G100023_…` printed `Account:
100022`. **Headline rows are NAMED, never summed**, the same rule as WPI's
weighted aggregate: re-deriving the Grand Total from 80 scheme rows would
publish a figure AMFI never did.

**SIP is not in this workbook and is not derived from it.** The monthly-report
page links no SIP file — checked, not assumed — so that row stays declared
absent with its own reason rather than being approximated from equity flows.

**The report describes the STORE, not the run.** `docs/SERIES-REPORT.md` was
built from the current run's results, so `npm run harvest -- --only india-mf-aum`
regenerated a committed document saying the store held one series. It now reads
the merged manifest, which is the same fix the manifest itself needed for the
same reason, one artefact over.

### data.gov.in — and why RECORD freshness is not DATA freshness

`adapters/dataGovIn.mjs` reads the Government of India's open-data platform,
which needed a full catalogue scan (`probe-datagov.mjs`) before a line of it
could be written. Three things that scan established, each of which had already
produced a wrong answer once:

**Nearly everything in the catalogue is a SNAPSHOT.** A parliamentary answer, a
survey round, a table "up to December 2022" that will never gain another row.
Of ~20,000 active resources, exactly two carry a monthly series the Economy page
asks for.

**Ranking by record date answers the wrong question.** It surfaces whichever
parliamentary answer was uploaded most recently, not which resource is alive. A
truncated scan sorted that way concluded WPI was frozen at the 2004-05 base in
March 2016, while the live resource sat further down the list being touched
daily. The live ones announce themselves in the TITLE — "till last month".

**AND THE TITLE IS A CLAIM, NOT A FACT.** Both surviving resources have their
catalogue record touched every day — WPI's read `updated 2026-08-11` on the day
it was wired — and neither has gained a month since **2023**. WPI's last column
is `INDX102023`, IIP's is `_2023_feb`. `probe-datagov.mjs --extent` settled it by
comparing the resource's DECLARED schema against the fields present on a
returned record: they match exactly, so the source stops there and the reader is
not being truncated. **A ministry that stopped publishing still serves HTTP 200,
a full envelope, and a fresh `updated` timestamp.**

So both are carried as HISTORY — 2012–2023 of official WPI and IIP is real and
useful — and neither answers a "current reading" question. The Economy page's
WPI and IIP rows stay unwired for exactly that reason: a value from October 2023
in a row a reader takes as current is a wrong figure, and no badge repairs it.
`staleSince` is set from the last observation so every surface says how old they
are.

Two rules the adapter itself enforces:

- **Month columns are parsed from the field NAME by shape, never by position.**
  These tables are crosstabs — one row per commodity, one column per month — so
  a new month arrives as a new FIELD. A positional read would keep working while
  returning a different month the first time a column is inserted, the same
  failure `lib/table.mjs` avoids on the statement PDFs. The patterns are
  anchored: `_2004_05___rural` and `gst_collection_in_rs_crore___2019_20` are
  both in this catalogue and both correctly parse as not-a-month.
- **The headline row is NAMED, never summed.** WPI's table has 869 commodity
  rows and IIP's 27 industry divisions, and both carry the ministry's own
  weighted aggregate. Re-deriving it would produce an index nobody published. A
  missing named row FAILS with the labels it did find, so a rename is a one-line
  diagnosis rather than a silent switch to a different series.

`DATA_GOV_IN_KEY` lives in the repository secrets and reaches the nightly run
through the workflow env. Unset, both series fail and keep their stored data —
the harvester never empties a series it could not fetch.

Adding a source: write `adapters/<name>.mjs` exporting `fetchSeries(spec)`,
register it in `run.mjs`'s `ADAPTERS`, and declare its series in the catalogue.

## Build

- `npm run build` runs `tsc -b && vite build` — keep it green before landing changes.
- `npm run harvest` refreshes `public/series/` and `docs/SERIES-REPORT.md`.
  Idempotent; `--only <ids>` limits it. Runs nightly via `.github/workflows/harvest.yml`.
- `npm run inventory` regenerates the ingest inventory.
- `npm run rekey:archive` re-derives `securityKey` across the committed archive
  from each row's own stored NAME, through the same `securityKeyOf` the extractor
  uses — a faithful partial replay of extraction, not a repair layer. It is how a
  change to that function lands WITHOUT `GLOW_PDF_PASSWORDS` (see Stage 10ak);
  `--check` writes nothing and is the control run, which must be a no-op against
  an unchanged function. It refuses outright if any name carries more than one
  stored key, because then the key is not a function of the name and this pass
  cannot reproduce it. Follow it with `build-symbols` and `build-book`.
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
- `npm run test:ingest` runs the ingest test suites.
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
- `npm run test:family` runs the derived-figure suites — the family-input
  arithmetic (deal register, household totals, plan columns, market-cap bands),
  the financial-table parser, the cash-flow/calendar reader, the ratio-table
  reader, the account XIRR, the private-market roll-up, the Excel export, the
  **index strip's day move** (`indicesFunction.test.ts` — the level and the
  previous close must never be the same session; a live probe cannot check it,
  because outside a 3h45m window plus every weekend the function is correct),
  the **daily-NAV movers** (`navMovers.test.ts`, Stage 10aw — every row must tie
  to its own columns, and the model must never value a holding at `units × NAV`,
  which is an order of magnitude out on the gold and silver ETFs), the **AIF
  category read** (`aifCategory.test.ts`, Stage 10aw — `III` is never read as
  `I`, `Class A2` names nothing, `Category I/II` resolves to neither, and the
  sections partition the AIF row to the rupee),
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
- `npm run build-symbols` re-resolves securityKey → NSE symbol.
- `npm run build-sectors` refreshes `src/data/screenerSectors.json` and
  `docs/SCREENER-SECTORS.md` — the THIRD and weakest sector tier, fetched from
  screener.in per NSE symbol. It is a LOOKUP and never a judgement: each page
  must echo back the symbol it was asked for (or, where it prints none, agree
  with the book's own name through `securityKeyOf`), and the GICS answer is
  whatever `shared/sectors.mjs` returns for the label the page printed — never a
  value the script decides. Run `build-symbols` first, since it is keyed on that
  output. `ONLY=<symbols>` limits it; `SCREENER_DELAY_MS` paces the fetch.
  A company with no NSE symbol is NAMED in the report and never name-matched.
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
- `npm run build-register` regenerates `src/data/registerData.ts` from the family's
  investment register — the `/register` page's data, and NO part of the book. Its
  only reader is `src/pages/Register.tsx`, which reads it directly so it cannot
  reach a portfolio total.
- `npm run check:pages` renders every route headlessly (needs `npm run build` and
  a `vite preview` on :4173) and reports console errors, failed requests and
  on-screen `₹0` / `0.00%`. Screenshots land in `docs/page-check/`.
  `ONLY=cio,holdings-book` walks a subset — for verifying an invariant by
  reintroducing its bug, which is one edit, one rebuild and one sweep per check.
  The routes that resolve addresses for others (`cio`, `monitor`) are always
  kept, so a subset can never silently stop checking.
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
