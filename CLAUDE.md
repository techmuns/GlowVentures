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
  named.** Realised gains exist for three of five accounts here; the other two
  render "no capital gain statement issued for this account in this drop", and
  the total says it covers three of five.
- **A COMPUTED zero is legitimate and stays** — cash has no P&L, a net realised
  loss owes no tax — but the reason goes in the tile, not in a tooltip. A reader
  scanning `₹0` beside a −₹1.97 Cr loss must be able to see it is the arithmetic.

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
- `scripts/ingest/*` — the PDF intake pipeline.

## The data model, and why it differs from a workbook-sourced book

This book comes from PDF statements across several wealth platforms, not from one
spreadsheet. Four things follow, and they are load-bearing:

**What is actually in `source/` today.** Three portfolio managers, five accounts,
three family members, 51 PDFs:

| Provider | Accounts | Owner | Strategy | As of |
| --- | --- | --- | --- | --- |
| Goldstandard Wealth Private Limited | 100023 | Ajay Jaisinghani | Aristos Equity Portfolio | 2026-07-10 |
| Goldstandard Wealth Private Limited | 100022 | Ankita Jaisinghani | Aristos Equity Portfolio | 2026-07-10 |
| Green Lantern Capital LLP | 510861 | Ajay Jaisinghani | GLC Growth Fund | 2026-06-25 |
| Green Lantern Capital LLP | 510854 | Ankita Jaisinghani | GLC Growth Fund | 2026-06-25 |
| Carnelian Asset Management and Advisors Pvt Ltd | 3517383 | Ajay Jaisinghani | Carnelian Bespoke Portfolio | 2026-07-10 |

All five are PMS mandates. **There are no 360 ONE statements in this drop** — the
extractor, the precedence block and two golden cases for it are retained, and the
golden test reports those cases BLOCKED rather than passing or failing them.

### 1. `securityKey`, not ISIN, is the join key

These providers print a security **name and nothing else** — no ISIN, no ticker,
on any of the 51 statements. A model that requires an ISIN to identify a security
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
143 of 143 rows satisfy

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
source/*.{zip,pdf}          raw statements — committed, NEVER served to a browser
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

**PAGE ROTATION FIRST.** 29 of the 51 statements are `/Rotate 90` pages — every
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

For all three PMS managers — who share one reporting system and therefore one
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

**As of this calibration there are zero material deltas anywhere**: 30 row-sum
checks, 177 derived-vs-printed, 900 dated-table row checks, 3 cross-report.

Check (c) exists for a real case: 360 ONE Special Opportunities Fund Series 8
Class A3 appears with byte-identical figures under two family members. Summing
both double-counts ~1.46 Cr. Deciding which statement owns the position is a
judgement about the family's affairs, not a parsing rule. (No 360 ONE statement
is in the current drop, so the check finds nothing — that is an absence of input,
not a clean bill of health.)

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
| `unrealisedST` / `unrealisedLT`, `stCostBasis`, `ltCostBasis`, `daysToLT` | needs per-lot purchase dates; the CAPITAL REGISTER is a capital-account ledger, not a lot register | a holding statement with lot-level acquisition dates |
| `privateMarkets` | all five accounts are listed-equity PMS mandates | a private-markets statement |

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
`public/audit/` and is fetched by the browser: it is 51 documents, it is already
gated by the edge password check, and inlining it would put megabytes of
transaction tape into the JS bundle for pages that may never be opened.

`ledger.ts` reads `manifest.json`, then each `<docKey>/document.json`, and
applies the **same precedence** the ingest does (`AUTHORITATIVE`) — transactions
from the transaction statement, lots from the capital gain statement, cash from
the dividend statement, non-cash from corporate benefits, holdings from the
appraisal. Reading every document that mentions a trade would count it several
times.

Three things it deliberately does not do:

- **No per-security XIRR.** That needs every lot from first purchase; these
  transaction statements cover the CURRENT PERIOD only. A rate over a partial
  history is a real number for the wrong window. The money-weighted returns this
  book supports are per-ACCOUNT, over external capital movements, on
  `/performance`.
- **No realised gain where no capital gain statement covers the account.** Two of
  five accounts issue none. Their sells are real; what they realised was never
  reported, so the cell is `—`.
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
join from 17 of 77 lots to 58. **This is a presentation-layer join, not a repair:**
the extractor should stop carrying an identifier inside a name field, and until
it does the archive keeps the key exactly as derived.

### Two realised totals, and which one is canonical

The capital gain statements' own total is the **printed primitive and is
canonical**: −₹1,93,11,003 across 77 lots. The roll-up that attributes each lot
to the sale that produced it on the transaction tape is a **cross-check**, and it
is more negative:

```
statement (77 lots)   −1,93,11,003     ← canonical, what Capital Gains shows
attributed (58 lots)  −2,01,76,689     ← cross-check, on Ledger Insights
unattributed (19)         +8,65,686
```

The 19 lots the tape never carries are **liquid mutual fund redemptions** — 18
Axis Liquid Fund across the two Green Lantern accounts, 1 DSP — the cash sweep
these managers run beside the equity mandate. The equity transaction statement
does not print them, so there is no sale row to hang them on. They are net GAINS,
which is the entire reason the attributed subtotal reads worse: removing gains
from a loss makes the remainder look bigger. **Unjoined never means dropped** —
all 77 lots count in the canonical figure. The three lines reconcile exactly, and
Ledger Insights shows them as three lines for that reason.

### XIRR: only accounts that can be measured, on one terminal date

Account 510854 publishes no FY performance summary, so its flows carry no opening
portfolio value. Pooling every account anyway put its ₹5.92 Cr of market value
into the terminal flow with no opening stake behind it, and returned **174.3%**
p.a. against **109.7%** for the four accounts that can be measured — a 64.6 pp
overstatement, and exactly the failure the presentation rule names.

So a consolidated XIRR covers only accounts carrying an opening value, **on both
sides** (flows AND terminal market value), and the excluded account is named on
screen. Both `/cio` and `/performance` close against `portfolio.asOf`, not
`new Date()` — closing against today on one page and the report date on the other
gave the same measurement two values. The window is one quarter here, so every
rate annualises about three months; the pages say so, because an unlabelled
+109.7% reads as a sustained yearly rate.

## Stage 7 — the live layer

Six Cloudflare Pages Functions proxy the in-house muns API, with `MUNS_TOKEN`
held in the Cloudflare environment and never in the browser: `quotes`,
`news`, `announcements`, `insider`, `research`, `history`. `fx` needs no token
(ECB reference rates, keyless) and falls back to a static rate.

**The symbol bridge is keyed on `securityKey`, not ISIN.** No provider in this
book prints an ISIN in its holdings column, so `nseSymbols.json` — which
`npm run build-symbols` resolves by NAME for exactly that reason — must be read
on the same key. `quotes.ts` previously exported `symbolForIsin(p.isin)` against
that map: two identifier spaces, one dictionary, no error anywhere, and a live
layer that resolved nothing for 143 of 143 positions while looking wired up.

Coverage is 71 of 74 distinct securities, 136 of 143 position rows. The three
that do not resolve are `Cash`, `Cash — receivable/payable` and the Axis Liquid
Fund sweep: no NSE listing, so they can never go live. They are counted as
`unpriceable`, separately from `notLive`, because folding them together reports a
permanent feed shortfall no token would ever close.

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
**₹83,50,63,590.78**. No blank tiles, no zeros, no unresolved spinners, and no
"session expired" wording for what is a missing upstream.

## Conventions

- All monetary values are INR at the model layer; format with `fmtFromBase`,
  never hard-code currency symbols.
- A figure links to its SOURCE DOCUMENT, not to a generic ledger. `holdingHref`
  builds `<accountId>-<asOf>-appraisal`, which is exactly how `extract.mjs`
  composes the docKey. A consolidated figure spans five documents and names none:
  it links to the archive index with the search term pre-filled.
- Large holdings lists get a `SearchInput` (filter by security name or ISIN).
- Pages showing a consolidated total should carry a `<BasisPill>` so the reader
  knows what the figure is actually based on.
- An absent figure goes through `src/components/Absent.tsx` with a reason. Never
  type a bare `—` inline, and never let an empty collection reach a formatter.

## Build

- `npm run build` runs `tsc -b && vite build` — keep it green before landing changes.
- `npm run inventory` regenerates the ingest inventory.
- `npm run extract` re-extracts the audit archive and the reconciliation report.
- `npm run test:ingest` runs the ingest test suites.
- `npm run build-symbols` re-resolves securityKey → NSE symbol.
- `npm run build-book` regenerates `src/data/glowData.ts` and `docs/BOOK-REPORT.md`.
- `npm run check:pages` renders every route headlessly (needs `npm run build` and
  a `vite preview` on :4173) and reports console errors, failed requests and
  on-screen `₹0` / `0.00%`. Screenshots land in `docs/page-check/`.
- `npm run set-password -- "<password>"` sets the edge gate password.
