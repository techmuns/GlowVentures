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

### 1. `securityKey`, not ISIN, is the join key

Several providers print a security **name and nothing else** — no ISIN, no ticker.
360 ONE's holdings are AIF/PMS units; GoldStandard reports listed Indian equity by
name only. A model that requires an ISIN to identify a security cannot represent
most of this book.

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

(`SattvaSummary` from the source cockpit is `BookSummary` here.)

## The ingest pipeline

```
source/*.{zip,pdf}  →  docs/ingest-inventory.{json,md}  →  public/audit/  →  src/data/glowData.ts
   raw statements         what's in the drop, grouped      extracted sheets      the baked book
   (committed, never          (npm run inventory)          (served, gated)
    served to browsers)
```

- **`source/`** is at the repo root, **not** under `public/` — raw statements must
  never ship to the browser. `source/_extracted/` is git-ignored (derived).
- **`npm run inventory`** (`scripts/ingest/inventory.mjs`) expands every ZIP
  (including nested ones), walks every PDF, and records path / size / page count
  plus a best-effort `{ provider, ownerName, accountNo, asOfDate, reportType }`.
  It groups **provider → account → as-of date → report type**, because *one
  account at one date routinely produces several overlapping reports that
  sometimes disagree* — a current portfolio, an appraisal, a fact sheet and a
  performance summary can all describe the same holdings and not reconcile.
  Making that visible is the whole point; which file is authoritative is a
  decision someone makes, not an accident of parse order.
- Running it with an empty `source/` is fine and writes an empty inventory.

### Text extraction is column-scrambled — this matters

Both seeded providers emit PDFs whose text layer comes out **out of document
order and run together** (`-33.7912,500 3,575,346 …`). Line-based regex parsing of
a holdings table *will* produce wrong numbers, and they will look plausible.

`scripts/ingest/lib/pdf.mjs` is therefore scoped to **header fields only** — where
matching a label and taking what follows survives scrambling. **Real table
extraction must be coordinate-based**: per-span x/y positions, columns recovered
by clustering on x. That belongs in the extraction pass, not the inventory.

The ZIP and PDF readers are hand-rolled and dependency-free: fewer third-party
packages touching a family's financial records.

### Seeded provider signatures

`scripts/ingest/lib/classify.mjs` carries two, from real documents:

- **360 ONE Private Wealth** — "PORTFOLIO ANALYSIS REPORT - CLIENT LEVEL", ~11pp.
  Header: `Family Name`, `Client Name (CRN…)`, `Report As On Date`. One PDF is a
  *bundle* (executive summary + detailed holding statement + transaction statement
  + corporate-action statement), so it gets one primary `reportType` for grouping
  plus a `sections` list. Holdings are AIF/PMS units — no ISIN, no ticker.
- **GoldStandard Wealth Private Limited** — PMS, strategy "Aristos Equity
  Portfolio". Header: `Account : <no>  <owner>`, `Report Date` / `As of <date>`.
  Filenames `G<acct>_<acct>_<ReportType><n>OT_<n>.pdf` are the more reliable
  report-type signal, since the on-page title is part of the scrambled text.
  Listed Indian equity, name only — no ISIN.

Add new providers by adding a signature function there. Everything else falls
through to generic keyword matching, and low-confidence rows land in the
inventory's "could not classify" section.

## Conventions

- All monetary values are INR at the model layer; format with `fmtFromBase`,
  never hard-code currency symbols.
- Large holdings lists get a `SearchInput` (filter by security name or ISIN).
- Pages showing a consolidated total should carry a `<BasisPill>` so the reader
  knows what the figure is actually based on.

## Build

- `npm run build` runs `tsc -b && vite build` — keep it green before landing changes.
- `npm run inventory` regenerates the ingest inventory.
- `npm run set-password -- "<password>"` sets the edge gate password.
