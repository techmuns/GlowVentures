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
- `src/lib/analytics.ts` — shared aggregation math (per-entity / per-sector / per-custodian rollups); `sumOrNull`.
- `src/lib/drilldown.ts` — WHICH HOLDINGS ARE BEHIND A FIGURE. One definition per
  set, read by the page that PRINTS a figure (to build the link) and by
  `src/pages/HoldingsBehind.tsx` at `/holdings` (to list the rows). See Stage 10n.
- `src/lib/returns.ts` + `src/lib/xirr.ts` — money-weighted returns (XIRR, YTD).
- `src/lib/navSeries.ts` — the DATED NAV series' presentation half: the chained
  flow-adjusted index, the nearest-EARLIER alignment against an index series, and
  the coverage stats. The series itself is generated (`BOOK_NAV_HISTORY`); this
  is what turns levels into a return the book actually earned. See Stage 10p.
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

**What is actually in `source/` today.** SIX DELIVERIES, and every one stays:
the original set at the top of `source/`, the client's `august-2026/` folder, and
`august-2026-b/`, `august-2026-c/`, `august-2026-d/` and `august-2026-e/` —
statements that arrived after it. Thirty-two issuers — ICICI Bank's NSDL
depository is the new one — 49 accounts in the book, six holders and two family
trusts, 50 files expanding to 229 — of which
**261 documents** are extracted, 197 read fully, 62 partially and **exactly TWO
not at all**, for two different reasons that must not be conflated:

- the adviser's consolidated review workbook, held out BY DECISION, which is not
  a statement;
- Bharat's HDFC NSDL holding statement, which is a SCAN — four JPEG pages with
  no text layer, so there is nothing for any reader to read. Reported as
  `no-text-layer`, never as a missing reader, because those two send the next
  person to do completely different things and only one of them is possible.

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
| 360 ONE Alternates | 1000632 | Ajay Jaisinghani | 2026-05-18 | — (no NAV published) |
| 360 ONE Alternates | 1000633 | Bharat Jaisinghani | 2026-05-18 | — (no NAV published) |
| 3P Investment Managers | 3000048 | Ajay Jaisinghani | 2026-07-31 | ₹0 |
| HDFC Mutual Fund | 16180583 | Bharat Jaisinghani | 2026-08-06 | ₹0 |
| India SME Investments | 175962 | Ajay Jaisinghani | 2026-06-30 | — (no NAV published) |
| India SME Investments | 175964 | Bharat Jaisinghani | 2026-06-30 | — (no NAV published) |
| India SME Investments | 177302 | Ankita Jaisinghani | 2026-06-30 | — (no NAV published) |
| Motilal Oswal demat | 1201090012539150 | Ajay Jaisinghani | 2026-07-31 | — (**transaction statement only**, no holdings) |
| Motilal Oswal demat | 1201090037359311 | Ajay Jaisinghani | 2026-07-31 | — (both rows are AIF units their funds report) |
| Motilal Oswal demat | 1201090037436848 | Bharat Jaisinghani | 2026-07-31 | ₹0 (`NO HOLDING IS AVAILABLE`) |
| Motilal Oswal Hedged Equity Multi Factor Strategy | 90410014574 | Ajay Jaisinghani | 2026-07-31 | ₹0 (redeemed to nil) |
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
is one row per account, all 42 of them, sorted by value.

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
tag to carry. Widening detection to match on quantity alone is the wrong trade —
India SME's three folios print coincidentally equal units — so the residual risk
is named here instead. `duplicateAifEarnings` covers the income-only side of the
same folio pair, which is how this one was visible in the archive at all.

**Every issuer has a reader.** Getting there took four of them, and each earned
its own file because the layouts share nothing:

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
ACCOUNTS now, and the five groups that remain are all real — the two Transition
trusts, 360 ONE Special Opportunities under both CRNs, Sky's Oncare under both
trusts, and India SME Fund II under Ankita's and Bharat's folios.

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
| ~~`navHistory`~~ | **NOW POPULATED — see Stage 10p.** This row read "two dated portfolio values per account is not a series" for four deliveries after the archive started carrying three month-ends for some accounts. 13 of 49 accounts publish two or more dated valuations; 23 publish one and 13 publish none, and all of them are NAMED in `BOOK_NAV_COVERAGE` | a monthly valuation statement from any of the other 36 |
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
two reasons: beside the key it must never affect, and shared with the Node side so
the screen and `docs/SECURITY-IDENTIFIERS.md` clean a name with ONE
implementation. **Anchored at the END, and only there** — three funds here are
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
came from. `securityKey` is derived from the RAW name and is not routed through
any of this, so no join moves.

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
| Compare up to four companies | `/compare` | the book, the quote feed, `ratio_source` |
| Document repository — annual reports, concalls, earnings, announcements | company page | `combined_filings_announcements`, `filings_domestic` |
| Financial tables, ratios, shareholding | company page | `financial_tables_markdown` (screener.in) |
| **Cash flow statement + earnings calendar** | company page | `financials/<T>.NS` — see Stage 10e |
| **Ratio analysis, 7 year-ends** | company page | `ratio_source` → `web-reader` — see Stage 10e |
| Consensus / street estimates | company page | `street_estimates` |
| Personal watchlist, target price, fair value, entry / exit price, price alerts | `/watchlist` + company page | **nothing** — these are the family's own judgements |
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

- **Layer 1 — Knowledge & Memory.** Tagged notes from manager meetings, IC
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
  price series themselves are unaffected and remain on Macro Research.
- **Layer 3 — IPS buckets and GAP analysis.** Growth / Liquidity / Tactical /
  Hedge / Charity, actual vs desired by geography, market cap, duration. The
  actuals are in the book; the DESIRED allocations are a family decision nobody
  has supplied, and inventing a target weight would fabricate the entire gap.
- **Layer 4 — thesis monitoring** and **Layer 5 — alerts** beyond price levels.
  Both need a store plus a rules engine; only the price-level half of Layer 5 is
  possible today, and that is what shipped.
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
   consolidated figure carries a `<BasisPill>`; Capital Gains, Data Audit and
   Ledger Insights read `statementPortfolio` and pass `statement`.
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
  **The FORMULA popovers stay** — a dashed figure still opens the arithmetic
  behind it, which is an explanation rather than a hyperlink. **And the Data
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
  **The FORMULA popovers stay** — a dashed figure still opens the arithmetic
  behind it, which is an explanation rather than a hyperlink. **And the Data
  Audit PAGE is untouched and still in the nav**: only the links pointing INTO
  it were removed, its own document chips are `<button>`s, and the provenance it
  serves is unchanged. A future session that wants a figure traceable again
  should read this paragraph first rather than reinventing `holdingHref`.
- Large holdings lists get a `SearchInput` (filter by security name or ISIN).
- Pages showing a consolidated total should carry a `<BasisPill>` so the reader
  knows what the figure is actually based on.
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

#### The four live indices, and two traps that print plausible wrong numbers

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

#### Today's movers — and the denominator that is the whole point

*(The SET was narrowed to Direct Equity a request later — see Stage 10r. The
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

### Stage 10r — THE MOVERS ARE DIRECT EQUITY, AND THREE CAPTIONS GO

*"remove the book performance section. daily movers/losers should comprise of
direct equity holdings only. remove the highlighted text from ui."*

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
- `/compare` offers no fund and says what it left out;
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

`alertEngine.ts` evaluates the family's rules against the book. Its governing
rule: **a rule whose inputs are incomplete does not fire, and does not pass
either** — it reports UNMEASURABLE with the reason, counted apart from the clear.
A price rule on a security with no live quote must never look like one that was
checked and held; a month-old statement mark cannot answer whether a level was
crossed today. That is the absent-vs-zero rule applied to a boolean.

Alerts the spec asks for that need a SOURCE rather than a threshold — manager
resignation and style drift, liquidity coverage, capital-call dates — are named
on the page rather than shipped as rules that would sit permanently silent.

## Stage 9d — the economic release calendar (`/api/econ-calendar`)

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

**IT LIVES ON ECONOMY & MACRO, AND NOWHERE ELSE.** Macro Research carried a
SECOND "Data release calendar" card, declaring a calendar impossible for the
same reasons — which stopped being true the moment this was wired, so a stale
absence would have contradicted the working page one link away. It is removed,
and `check:family` asserts both halves of that: the claim gone from Macro, the
real calendar still rendering with its filters on Economy. A removal is verified
by asserting it happened.

`src/lib/__tests__/econCalendar.test.ts` asserts all of it against a REAL saved
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
go; `/industry` redirects to `/macro`, and `check:family` asserts the redirect.

**NOTHING IT DEPENDED ON WAS DELETED WITH IT.** Every series it read is still in
the harvest store and still on Macro Research: coal, iron ore, HRC, the base
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
- `npm run extract` re-extracts the audit archive and the reconciliation report.
- `npm run test:ingest` runs the ingest test suites.
- `npm run test:family` runs the derived-figure suites — the family-input
  arithmetic (deal register, household totals, plan columns, market-cap bands),
  the financial-table parser, the cash-flow/calendar reader, the ratio-table
  reader, the account XIRR, the private-market roll-up, the Excel export and the
  **dated NAV series** (`navSeries.test.ts`, Stage 10p: the series' last point
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
- `npm run build-book` regenerates `src/data/glowData.ts` and `docs/BOOK-REPORT.md`.
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
