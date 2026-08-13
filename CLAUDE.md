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
- `src/lib/returns.ts` + `src/lib/xirr.ts` — money-weighted returns (XIRR, YTD).
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

## The data model, and why it differs from a workbook-sourced book

This book comes from PDF statements across several wealth platforms, not from one
spreadsheet. Four things follow, and they are load-bearing:

**What is actually in `source/` today.** TWO DROPS, and both stay: the original
set at the top of `source/`, and the client's `august-2026/` folder. Eighteen
issuers, 22 accounts in the book, six holders, 41 files expanding to 180 — of
which **182 documents** are extracted and 162 read fully, 18 partially and **2
not at all**. What does not read is named below; nothing is silently dropped.

**A MONTHLY DROP REISSUES THE SAME FILENAMES, and both issues must survive.**
`LKP 2.zip`, `GREEN LANTERN - ANKITA.zip` and `GREEN LANTERN - AJAY .zip` all
arrive again in August. `lib/bundle.mjs`'s caller used to expand every archive
into `source/_extracted/<basename>/`, so the later drop overwrote the earlier
one in place — and that is not a cosmetic clash, because a SNAPSHOT supersedes
but a DATED ROW does not. The capital gain lots and transaction tape carried
only by the July issue would have gone with the folder. The extraction path now
mirrors the archive's own path under `source/`, which is byte-identical for
every ZIP already at the top level.

| Provider | Accounts | Owner | As of | Market value |
| --- | --- | --- | --- | ---: |
| Sanshi Fund | 9039671821 | Aarti Jaisinghani | 2026-06-30 | ₹976.8 Cr |
| Carnelian Asset Management | 3517383 | Ajay Jaisinghani | **2026-08-10** | ₹395.3 Cr |
| Sanshi Fund | 9069671554 | Ankita Jaisinghani | 2026-06-30 | ₹294.2 Cr |
| Sanshi Fund | 9039671912 | Ajay Jaisinghani | 2026-06-30 | ₹293.5 Cr |
| Sanshi Fund | 9069671634 | Ajay Jaisinghani | 2026-06-30 | ₹284.6 Cr |
| Sanshi Fund | 9039671854 | Bharat Jaisinghani | 2026-06-30 | ₹195.7 Cr |
| Goldstandard Wealth | 100023 | Ajay Jaisinghani | **2026-08-11** | ₹188.0 Cr |
| SVAN Investment Managers | 8710067 | Ajay Jaisinghani | **2026-07-31** | ₹164.5 Cr |
| Green Lantern Capital | 510861 | Ajay Jaisinghani | **2026-07-27** | ₹114.5 Cr |
| SVAN Investment Managers | 8710090 | Bharat Jaisinghani | 2026-06-30 | ₹103.8 Cr |
| V.E.C Assago Capital | 128005 | Ajay Jaisinghani | 2026-07-06 | ₹92.4 Cr |
| Goldstandard Wealth | 100022 | Ankita Jaisinghani | **2026-08-11** | ₹80.2 Cr |
| V.E.C Assago Capital | 128004 | Ankita Jaisinghani | 2026-07-06 | ₹65.5 Cr |
| Green Lantern Capital | 510854 | Ankita Jaisinghani | **2026-07-27** | ₹58.0 Cr |
| Transition Venture Capital | TVC262 / TVC263 | Bharat Jaisinghani Family Trust 2 / 3 | 2026-03-31 | ₹17.1 Cr each |
| 360 ONE Private Wealth | CRN37702 / CRN60117 | Ajay / Bharat Jaisinghani | 2026-07-31 / 06-30 | ₹14.7 / ₹14.6 Cr* |
| Molecule Ventures | 7810404 | Ajay Jaisinghani | 2026-06-30 | ₹11.2 Cr |
| LKP Securities | 98245 | Bharat Jaisinghani | 2026-03-31 | ₹9.9 Cr |
| 360 ONE Alternates | 1000632 | Ajay Jaisinghani | 2026-05-18 | — (income only) |
| HDFC Mutual Fund | 16180583 | Bharat Jaisinghani (jt. Ankita) | 2026-08-06 | ₹0 (redeemed) |

\* the same holding, reported under both CRNs — see §4c. Counted once.

**Consolidated ₹461.00 Cr**: listed ₹180.76 Cr, private ₹280.24 Cr. The split is
on `assetClass`, which is what a holding IS. It was `listedValue: totalValue,
privateValue: 0` — true when every account was a listed-equity mandate, and false
the moment the AIF statements got a reader, at which point 62% of the book was
being reported under a label that did not describe it.

Six PMS mandates run on one reporting system (Goldstandard, Green Lantern,
Carnelian, V.E.C Assago, Molecule, and SVAN's SEBI report); five are Category-III
AIF folios; two are drawdown AIF capital accounts held by TRUSTS; two are 360 ONE
Distribution engagements; one is a self-directed demat account; one is a joint
mutual-fund folio.

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
360 ONE Special Opportunities Fund Series 8 Class A3 appears with byte-identical
figures under CRN37702 and CRN60117 (₹1,45,80,412.51 each), and Transition
Venture Capital Fund I — Class A1 under both Bharat Jaisinghani family trusts
(₹1,71,26,374.76 each). Both rows of each are carried, naming the other through
`alsoReportedUnder`; the consolidated total counts the `dedupeGroup` once.
**₹3.17 Cr of double-count in total** — the figure to test any book-wide
aggregate against. This is check (c) firing on real cases, and it is what the
policy in §4c was written for.

**Every issuer has a reader.** Getting there took four of them, and each earned
its own file because the layouts share nothing:

| Reader | Documents | What it reads |
| --- | ---: | --- |
| `providers/altFundStatements.mjs` | 8 | six single-scheme fund statements — Buoyant, Helios, Motilal Oswal's Founders and Active Momentum funds, 3P and India SME. One reader, six declared layouts, each keyed on the FUND rather than the distributor whose stationery it arrives on |
| `providers/pmsStatements.mjs` | 76 | the house statement sets — six managers, one reporting system |
| `providers/pmsInvestorReport.mjs` | 5 | the SEBI PMS INVESTOR REPORT, keyed on the REPORT TYPE rather than the house: SVAN issues it monthly and Green Lantern quarterly, and it is one prescribed layout |
| `providers/threeSixtyOne.mjs` | 4 | 360 ONE Private Wealth's client-level PORTFOLIO ANALYSIS REPORT |
| `providers/aifDistribution.mjs` | 5 | 360 ONE ALTERNATES — a different issuer from the wealth arm. Distribution letters and statements of earnings, carrying AIF income split by TAX HEAD |
| `providers/sanshiFund.mjs` | 5 | Category-III AIF monthly account statements |
| `providers/transitionVenture.mjs` | 2 | drawdown AIF capital accounts — the only source of an undrawn COMMITMENT |
| `providers/lkpSecurities.mjs` | 4 | a self-directed demat account, in three file formats — the only LOT REGISTER in the book |
| `providers/mutualFundFolio.mjs` | 5 | folio statements, three different layouts behind one reader |
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

*Two documents this run could not decrypt.* Bharat's 360 ONE Alternates
distribution notice and statement of earnings are encrypted with a password
that is NOT in the drop's own `pASSWORD.docx` — that file names the Kotak and
ABSL ones only. They read in an earlier extraction, so the password exists
somewhere; without it folio **1000633** has no readable statement naming its
holder, and the one other document mentioning the folio prints the holder as
the literal word "Investor".

**AN ACCOUNT NOBODY CAN BE SHOWN TO OWN IS EXCLUDED, NOT CARRIED EMPTY.**
`Account.owner` is `string`, not `string | null`, and that is the model saying
every account in this book belongs to a named member. The two wrong fixes were
both available — widen the type for all 22 accounts to accommodate one, or emit
`owner: null` and let a page render an account attributed to nobody. Folio
1000633 goes to `excludedAccounts` instead, by the same mechanism as the HOPE
INDIA TRUST folios: not summed, reason printed, and back the moment the
password lets its statements be read. Its market value is nil either way — it
is an income-only folio — so the consolidated total is unaffected; what is
missing is ₹7.38 L of AIF income split by tax head, and its attribution.

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

Six of the PDFs in this drop are encrypted. The passwords are **never committed**; they
are read from the environment:

```
GLOW_PDF_PASSWORDS="one,two,three" npm run extract
```

`passwordsFromEnv()` in `lib/layout.mjs` supplies the list and every attempt is
tried in order per file, because it is not one password — three different ones
open six files across three issuers, and which opens which is not printed
anywhere reliable (the one document that names a Kotak password names one that
does not open it). The archive records THAT a document was encrypted and which
list entry opened it, **by position, never the value**.

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

**As of this calibration there are zero material deltas anywhere**: 119 row-sum
checks, 250 derived-vs-printed, 1,112 dated-table row checks, 5 cross-report.
Every delta that is not `ok` is `explained` or `rounding`, and every `explained`
one names a basis difference reproduced exactly — never a widened tolerance.

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
| `navHistory` | Two dated portfolio values per account (opening and closing) is not a series | a monthly / quarterly valuation statement |
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

Keyed on **name**, not ISIN: no statement in this book prints one. Three tiers —
exact normalized name, `securityKeyOf` on both sides, and a committed override
table — and no fuzzy tier at all. A name matching two listings or none is
reported unresolved and left out, because a missing symbol shows a position as
not-live while a wrong one shows another company's price and says nothing.

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
| Insider trades, corporate announcements, news | company page, `/news` | `insider_trades`, `corp_announcements`, `news_search` |

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
- A figure links to its SOURCE DOCUMENT, not to a generic ledger. `holdingHref`
  builds `<accountId>-<asOf>-appraisal`, which is exactly how `extract.mjs`
  composes the docKey. A consolidated figure spans five documents and names none:
  it links to the archive index with the search term pre-filled.
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
- A figure links to its SOURCE DOCUMENT, not to a generic ledger. `holdingHref`
  builds `<accountId>-<asOf>-appraisal`, which is exactly how `extract.mjs`
  composes the docKey. A consolidated figure spans five documents and names none:
  it links to the archive index with the search term pre-filled.
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
V.E.C 128004          ours 52.28%   printed 52.27%   +0.01 pp
V.E.C 128005          ours 49.59%   printed 49.59%   +0.00 pp
```

The gate is 1.0 pp because these are two different measurements of one window —
the manager publishes a TIME-weighted return, this is MONEY-weighted, and they
diverge only to the extent capital moved mid-window (here, TDS transfers of a few
thousand rupees against crores). Wide enough that the basis difference cannot
fail it; narrow enough that a wrong sign, a dropped opening value or a shared
terminal date cannot pass — each of those moves a figure by tens of points, and
the suite asserts that too.

**Green Lantern's two accounts are NOT CHECKED and are named.** They are in the
tile, but their FYTD is printed on a report drawn 2026-08-10 while their holdings
close 2026-07-27; comparing them reports a −3.82 pp "failure" that is two weeks
of market movement. The suite counts them apart and fails if fewer than three
accounts were actually compared — `golden.mjs`'s rule, that a suite passing over
no input claims confidence nobody earned.

**Trades are not flows**: a sale moves cash inside an account rather than out of
it, and its proceeds are already inside the closing value — which is why the five
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

### Stage 10h — Sector Composition is DIRECT EQUITY, because nothing else has a sector

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
- `npm run test:family` runs the four derived-figure suites — the family-input
  arithmetic (deal register, household totals, plan columns, market-cap bands),
  the financial-table parser, the cash-flow/calendar reader and the ratio-table
  reader. Every one of the last three runs against a REAL saved API response
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
- `npm run set-password -- "<password>"` sets the edge gate password.
