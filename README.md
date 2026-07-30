# Glow Ventures Family Office — Investor Cockpit

A private, client-side dashboard for the Glow Ventures Family Office: a
consolidated view of the book across listed equity, PMS/AIF mandates and private
markets, assembled from the family's wealth-platform statements.

Built with **React 18 + TypeScript + Vite + Tailwind + Recharts**. No backend —
the book is baked in as typed data and everything runs in the browser, behind an
edge password gate.

> **Status: the shell and the extraction engine are built; no statements have been
> dropped yet.** `source/` is empty, so `public/audit/` and the extraction report
> are empty too and the cockpit shows *"No statements ingested yet"* rather than
> rendering zeros as if they were real. The golden test reports **BLOCKED**, not
> pass, until the real PDFs land — see [Verification](#verification).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Access

The gate password is set. To rotate it:

```bash
npm run set-password -- "the new password"
git commit -am "Rotate dashboard password" && git push
```

Only a salted SHA-256 hash is stored, server-side only. Rotating invalidates every
existing session automatically.

## Where the data comes from

The book is assembled offline from **PDF statements issued by several wealth
platforms** — monthly wealth-platform statements, PMS/AIF reports, fact sheets and
distribution / capital-call notices, some loose, some inside ZIPs.

```
source/*.{zip,pdf}   →   docs/INGEST-INVENTORY.md   →   public/audit/<docKey>/   →   src/data/glowData.ts
  raw statements          what's in the drop,            extracted tables +           the book
  (committed; NEVER       grouped & classified           docs/EXTRACTION-REPORT.md    (next step)
   served to browsers)    (npm run inventory)            (npm run extract)
```

1. **Drop** every ZIP and PDF into `source/` at the repo root. It sits outside
   `public/`, so nothing there is copied into the build or served by the site.
2. **`npm run inventory`** expands every archive (nested ones too) into
   `source/_extracted/` (git-ignored), walks every PDF, and writes
   `docs/ingest-inventory.json` and the readable `docs/INGEST-INVENTORY.md`.
3. **Read the inventory before extracting anything** — especially its
   *"Overlapping reports"* and *"Could not classify"* sections.
4. **`npm run extract`** reads every PDF with the coordinate-aware engine, writes
   the audit archive under `public/audit/<docKey>/`, and reconciles it into
   `docs/EXTRACTION-REPORT.md`.
5. **Read the extraction report.** It is the deliverable: extraction that "ran" is
   worthless, extraction that ties out is the product.

### Why the inventory groups the way it does

It groups **provider → account → as-of date → report type**, because *one account
at one date routinely produces several reports that overlap and sometimes
disagree*. A current portfolio, an appraisal, a fact sheet and a performance
summary can all describe the same holdings on the same day and not reconcile.
The grouping puts them side by side so that choosing the authoritative one is a
deliberate decision rather than an accident of which file got parsed first.

### A caveat that shapes the whole pipeline

Both known providers emit PDFs whose text layer is **column-scrambled** — values
print out of document order and run together (`-33.7912,500 3,575,346 …`), and
figures split mid-number across spans (`3,440,` + `425.00`) and across lines
(`2,037,517.` + `00`). Line-based regex parsing produces numbers that are wrong
and look right.

Extraction is therefore **coordinate-based** (`scripts/ingest/lib/layout.mjs`,
built on `pdfjs-dist`): x/y per text span, rows clustered by y, columns inferred
from blank vertical corridors **within each table region** — never across the
whole page, where a full-width title bridges the gap between two columns and
collapses them. Split figures are stitched only where the join yields one
well-formed number, and every stitch is recorded in the extraction report.

### Which report wins

One account on one date produces several reports that disagree.
`scripts/ingest/precedence.mjs` is a **committed decision** about which is
authoritative for which fact — because "whichever file we parsed last wins"
produces a different book on every run. For GoldStandard, PortfolioAppraisal is
the clean basis (market value = price × quantity exactly); CurrentPortfolio folds
accrued income into market value on some rows but not others, so accrued income
is carried as its own field. Disagreements are **reported, never averaged away**.

## Verification

```bash
npm run test:ingest
```

| Suite | What it proves |
| --- | --- |
| `parseNum` | Indian & Western grouping, sign conventions, and that `null` means *not reported* — never zero. Rejects concatenations like `-33.7912,500` instead of guessing. |
| `layout` | Row clustering, column inference, same-line and cross-line number stitching, superscripts — against PDFs generated in the test with known coordinates. |
| `pipeline` | Extractor → normalized document → every reconciliation check, including duplicate-holding detection across owners. |
| `golden` | The **real** figures, read off the statements by a human. |

`golden` has three outcomes: PASS, FAIL (exit 1), and **BLOCKED (exit 2) when the
statements are absent**. Blocked is not a pass and is never counted as one — a
test that passes with no input claims confidence nobody earned.

## The rule that governs every figure

**No figure is ever fabricated.** Where the source carries no number, the UI
renders `—`. Not a zero, not an estimate, not a plausible default.

- An empty book renders an empty state, never zeros — `₹0` is a measurement,
  "no statement yet" is the absence of one, and on screen they look identical.
- Metrics needing data the model doesn't carry (per-entity XIRR/YTD, which need
  dated cash flows) render `—` until an ingest supplies them.
- A holding the quote feed can't price keeps its statement mark, flagged as
  not-live, rather than passing a stale mark off as current.
- The ingest classifier writes `null` for anything it can't determine, and files
  it can't place go to a "could not classify" list rather than under a guess.

## How this book differs from a single-workbook book

The model carries six things that a spreadsheet-sourced cockpit doesn't need.
Full rationale in [CLAUDE.md](./CLAUDE.md); in short:

| | |
| --- | --- |
| **Identity is `securityKey`, not ISIN** | Several providers print a name and nothing else. Positions join on a slug of the normalised security name; ISIN and ticker are optional enrichment. The drill-down route is `/stock/:securityKey`. |
| **Owner ≠ custodian** | `Account` carries `owner`, `provider`, `accountNo`, `strategy`, `engagement`, `asOf`; positions reference it by `accountId`. The old substring-matching `custodianOf()` heuristic is gone. |
| **As-of is per account** | Statements arrive per platform on their own schedule. `Portfolio.asOf` is the newest; `<BasisPill>` flags which accounts are behind wherever a consolidated total is shown. |
| **Sectors are per provider** | `sector` is our normalised value, `providerSector` is what the provider printed. Both kept. |
| **Asset class ≠ engagement** | `AssetClass` is what a thing *is* (`Equity`, `AIF`, `Cash`, …). **PMS is not an asset class** — it is how an account is *run*, so it lives on `Account.engagement`. The holdings inside a PMS are ordinary listed equity. |
| **One person, one `ownerId`** | The same family member is printed three ways across providers. `shared/owners.mjs` resolves every spelling to one canonical owner; an unmatched name is reported loudly, never turned into a new person. |

## Pages

| Group | Page | What it shows |
| --- | --- | --- |
| Setup | Data & Refresh | Ingest status, account registry & report dates, holdings CSV export |
| Setup | Data Audit | Browser over the extracted source sheets |
| Daily | Morning CIO | NAV, P&L, allocation by asset class, concentration |
| Daily | Portfolio Monitor | Full holdings — by security or by account, filters & sort |
| Daily | News & Announcements | Market news, exchange filings and insider trades for listed holdings |
| Allocation | Family & Entities | By owning entity; in-house vs external custody |
| Allocation | Sector Composition | Sector mix, drill-down |
| Tax | Capital Gains & Tax | STCG/LTCG by entity, hold-to-LTCG planner, loss harvesting |
| Private Markets | Private Markets | Commitments, dry powder, TVPI/DPI, composition |
| Private Markets | Data Bank | Fund & scheme analytics |
| Analytics | NAV & Performance | NAV trajectory, growth, return distribution, concentration |
| Analytics | Return & Drawdown | Time- and money-weighted returns, drawdown, trade stats |
| Analytics | Ledger Insights | XIRR, reconciliation and dividends from the extracted ledger |
| Admin | Upload History | Year-end NAV snapshots |

## Access control (password)

The whole site sits behind a single shared password, enforced at Cloudflare's edge
by `functions/_middleware.js` (a Pages Function). It runs on every request
*before* any static asset is served, so an unauthenticated visitor only ever
receives the login page — never `index.html`, the JS bundle, or the book baked
into it. A password checked inside the React app would be pointless: the browser
downloads the whole bundle, data included, before any prompt could appear.

- Only a **salted SHA-256 hash** is stored, server-side only; it is never sent to
  the browser and cannot be reversed from the repo.
- On correct entry the Function sets an `HttpOnly; Secure; SameSite=None;
  Partitioned` session cookie (30 days) — `SameSite=None`/Partitioned so the
  session survives when the dashboard is embedded in an iframe on another site.
  The cookie derives from the password hash, so rotating the password invalidates
  every existing session automatically. Sign out via `/__auth/logout`.

Cloudflare redeploys in ~1 minute after a push. Requires Functions to be enabled
on the Pages project — they are by default when a `functions/` directory exists.

## Source archive (Data Audit & Ledger Insights)

The reviewed extracts from the statements live in `public/audit/` and are served
at `/audit/*`, powering the **Data Audit** browser and **Ledger Insights**. They
sit under `public/`, so they ship with the deploy — but only *behind the password
gate*: the edge middleware runs on `/audit/*` too. **Raw statements stay in
`source/` and never ship at all.**

`audit/manifest.json` lists every file and sheet; each sheet is
`audit/<fileKey>/<sheetKey>.json`, shaped `{ name, rows: [[cell, …], …] }`.

## News & Announcements

Three feeds, toggled in-page — **News**, **Corporate Announcements** and **Insider
Trades**. The browser posts holdings to `/api/news`, `/api/announcements` and
`/api/insider` (Cloudflare Pages Functions holding the API token server-side); each
caches per query at the edge for ~24h, de-duplicates, and returns a newest-first
feed. The client fans out across all holdings in small chunks with limited
concurrency (`src/lib/feedFetch.ts`), correlating results by `securityKey`.

Announcements and insider trades are keyed by NSE ticker, so they only cover
listed names that resolve to a symbol — AIF/PMS units and unlisted holdings have no
exchange filings and are simply absent from those feeds rather than shown as
having none.

### Setup — one environment variable

Add **`MUNS_TOKEN`** to the Cloudflare Pages project (Settings → Environment
variables, for **Production and Preview**, ideally as a Secret). It authorizes all
three feeds, is read only server-side, and is **never** sent to the browser. Until
it's set, the tab shows a "not switched on yet" notice.

### ISIN → NSE symbol map

`src/data/nseSymbols.json` maps ISINs to NSE trading symbols. It ships empty and is
regenerated from the ingested book with `node scripts/build-nse-symbols.mjs`.
Holdings with no ISIN, and ETF / mutual-fund ISINs, won't map — a position may also
carry its ticker directly from the statement, which takes precedence.
