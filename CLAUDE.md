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

## Layout

- `src/pages/*` — one file per dashboard route (see `src/App.tsx`).
- `src/lib/types.ts` — the canonical model. Read this first.
- `src/lib/securityKey.ts` — the join key (see below).
- `src/lib/accounts.ts` — the account registry: owner vs provider, per-account as-of.
- `src/lib/analytics.ts` — shared aggregation math (per-entity / per-sector / per-custodian rollups).
- `src/lib/returns.ts` + `src/lib/xirr.ts` — money-weighted returns (XIRR, YTD).
- `src/lib/format.ts` — currency / percent / number formatting; `fmtFromBase` (via `PortfolioContext`) is the standard money formatter.
- `src/components/*` — shared UI (`Card`, `StatTile`, `SearchInput`, `Pill`, `BasisPill`, `Auditable`, …). Reuse these rather than re-styling tables inline.
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
   |  (next step)
   v
src/data/glowData.ts        the book
```

### Stage 1 — inventory (`npm run inventory`)

Expands every ZIP (including nested), walks every PDF, records path / size /
pages plus a best-effort `{ provider, ownerName, accountNo, asOfDate,
reportType }`, and groups **provider → account → as-of → report type**. That
grouping is the point: *one account at one date routinely produces several
overlapping reports that sometimes disagree*, and which one is authoritative is
a decision someone makes, not an accident of parse order.

### Stage 2 — extraction (`npm run extract`)

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
| **e** Unresolved — securities with no symbol, owners with no canonical match, report types with no reader |

Every delta a check reports carries a `severity`, and the distinction is the
product:

- `rounding` — within the printing precision (≤ ₹1, ≤ 0.005pp). Aggregated, does
  not block.
- `explained` — reproduced exactly from a known basis difference, with the cause
  named. Also does not block, because it is understood rather than merely small.
- `material` — anything else. Reported per row, and it blocks the golden test.

**As of this calibration there are zero material deltas of either kind.**

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

## Conventions

- All monetary values are INR at the model layer; format with `fmtFromBase`,
  never hard-code currency symbols.
- Large holdings lists get a `SearchInput` (filter by security name or ISIN).
- Pages showing a consolidated total should carry a `<BasisPill>` so the reader
  knows what the figure is actually based on.

## Build

- `npm run build` runs `tsc -b && vite build` — keep it green before landing changes.
- `npm run inventory` regenerates the ingest inventory.
- `npm run extract` re-extracts the audit archive and the reconciliation report.
- `npm run test:ingest` runs the ingest test suites.
- `npm run set-password -- "<password>"` sets the edge gate password.
