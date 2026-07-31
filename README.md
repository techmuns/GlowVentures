# Glow Ventures Family Office — Investor Cockpit

A private dashboard over the family's consolidated book, assembled offline from
the PDF statements their wealth platforms issue and served as a static site
behind an edge password gate.

Built with **React 18 + TypeScript + Vite + Tailwind + Recharts**, deployed to
Cloudflare Pages. There is no application database: the book is baked into
`src/data/glowData.ts` by a committed pipeline, and everything else runs in the
browser.

**The one rule everything else follows: no figure is ever fabricated.** Where a
statement doesn't carry a number, the screen shows `—` and says what is missing
and what would supply it — never a zero, an estimate or an interpolation. See
[docs/FIGURE-PROVENANCE.md](docs/FIGURE-PROVENANCE.md), which traces every figure
on every page back to the document it came from.

---

## The book

Three portfolio managers, five accounts, two family members, 51 PDFs.

| Provider | Account | Owner | Strategy | Statement date |
| --- | --- | --- | --- | --- |
| Goldstandard Wealth Private Limited | 100023 | Ajay Jaisinghani | Aristos Equity Portfolio | 2026-07-10 |
| Goldstandard Wealth Private Limited | 100022 | Ankita Jaisinghani | Aristos Equity Portfolio | 2026-07-10 |
| Green Lantern Capital LLP | 510861 | Ajay Jaisinghani | GLC Growth Fund | 2026-06-25 |
| Green Lantern Capital LLP | 510854 | Ankita Jaisinghani | GLC Growth Fund | 2026-06-25 |
| Carnelian Asset Management and Advisors Pvt Ltd | 3517383 | Ajay Jaisinghani | Carnelian Bespoke Portfolio | 2026-07-10 |

All five are PMS mandates in listed Indian equity. **143 positions, 74 distinct
securities, consolidated market value ₹83,50,63,590.78 as of 2026-07-10.**

The accounts are dated individually — Green Lantern closes 15 days before the
others — so any consolidated total is a blend of report dates. The cockpit never
hides that: a "2 accounts behind" pill appears wherever a consolidated figure is
shown, naming which and by how long.

---

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build
npm run preview      # serve the build on :4173
```

## Access

A single site password, enforced at Cloudflare's edge by
`functions/_middleware.js` — a Pages Function that runs on every request *before*
any static asset is served. An unauthenticated visitor receives the login page
and nothing else: never `index.html`, never the JS bundle, never the book baked
into it. A password checked inside the React app would be pointless, because the
browser downloads the whole bundle, data included, before any prompt could
appear.

Only a **salted SHA-256 hash** is stored, server-side; the password itself is
never in the repo or the bundle. To rotate:

```bash
npm run set-password -- "the new password"
git commit -am "Rotate dashboard password" && git push
```

On correct entry the Function sets an `HttpOnly; Secure; SameSite=None;
Partitioned` session cookie (30 days) — `SameSite=None`/Partitioned so the
session survives when the dashboard is embedded in an iframe elsewhere. The
cookie derives from the password hash, so rotating invalidates every existing
session automatically. Sign out at `/__auth/logout`.

The gate covers the whole site **including `/audit/*`**, which is how the
extracted statement tables stay private.

---

## The ingest pipeline

Statements in, book out. Every step is idempotent, and `glowData.ts` regenerates
**byte-identically** from `source/` alone.

```
source/*.{zip,pdf}          raw statements — committed, NEVER served to a browser
   │  npm run inventory     what is in the drop, grouped and classified
   ▼
docs/INGEST-INVENTORY.md    provider → account → as-of → report type
   │  npm run extract       coordinate-aware extraction + reconciliation
   ▼
public/audit/<docKey>/      extracted tables, keyed by DOCUMENT (served, gated)
docs/EXTRACTION-REPORT.md   does it tie out?
   │  npm run build-symbols securityKey → NSE symbol (name-matched)
   │  npm run build-book    precedence applied, sectors mapped, gaps left as gaps
   ▼
src/data/glowData.ts        the book       docs/BOOK-REPORT.md   what it does NOT carry
```

**Extraction is coordinate-based, not line-based.** These statements' text layers
are column-scrambled: values print out of document order and run together
(`-33.7912,500`), figures split mid-number across spans (`3,440,` + `425.00`) and
across lines (`2,037,517.` + `00`), and 29 of the 51 pages are `/Rotate 90`,
where reading x from the wrong transform silently transposes the whole table.
`scripts/ingest/lib/layout.mjs` maps coordinates by each page's own rotation
first, clusters rows by y, and infers columns within each table region — never
across the whole page, where a full-width title bridges two columns and collapses
them.

**Which report wins is a committed decision.** One account on one date produces
several reports that overlap and sometimes disagree.
`scripts/ingest/precedence.mjs` records which is authoritative for which fact,
because "whichever file we parsed last wins" produces a different book on every
run. Disagreements are **reported, never averaged away**.

**What makes it trustworthy is stage 3, not stage 2.** Extraction that "ran" is
worthless; extraction that ties out is the product. The reconciler runs row-sum
checks against each table's own printed total, every derived figure against the
statement's own version of it, cross-report comparisons, duplicate detection and
coverage. Every delta is classified `rounding`, `explained` (reproduced exactly
from a named basis difference) or `material` — and a material delta blocks the
golden test.

**Currently: 0 material deltas** across 30 row-sum, 177 derived-vs-printed, 900
dated-table and 3 cross-report checks.

### Refreshing when new statements arrive

```bash
cp ~/new-statements/*.pdf source/          # or drop the ZIP in; nested ZIPs are fine
npm run inventory                          # see what landed and how it classified
npm run extract                            # re-extract + reconcile — READ THE REPORT
npm run test:ingest                        # golden figures, read off the PDFs by hand
npm run build-symbols                      # only if new securities appeared
npm run build-book                         # regenerate glowData.ts + BOOK-REPORT.md
npm run build && npm run check:pages       # every route, both themes
git add -A && git commit && git push       # Cloudflare Pages deploys on push
```

Read `docs/INGEST-INVENTORY.md` after step 2 — especially its *"Overlapping
reports"* and *"Could not classify"* sections.

Stop at `npm run extract` if the report shows a **material** delta. A material
delta means a figure was read differently from how the statement prints it, and
carrying on bakes that into the book.

`src/data/glowData.ts` is **generated — never hand-edit it.** A hand-edit is
silently reverted by the next `build-book`, and in the meantime the book no
longer matches the archive it claims to come from.

---

## The live layer

Six Cloudflare Pages Functions proxy the in-house muns API. The token lives in
the Cloudflare environment and never reaches the browser.

| Endpoint | Supplies | Needs `MUNS_TOKEN` |
| --- | --- | :---: |
| `/api/quotes` | Intraday NSE prices | yes |
| `/api/news` | Holdings news | yes |
| `/api/announcements` | Exchange filings | yes |
| `/api/insider` | Insider / bulk deals | yes |
| `/api/research` | Estimates, financials, concall docs | yes |
| `/api/history` | Index close series | yes |
| `/api/fx` | USD→INR reference rate (ECB) | no |

Set the token once, in **Cloudflare Pages → Settings → Environment variables**
(Production *and* Preview, ideally as a Secret), as `MUNS_TOKEN`. Nothing else
needs configuring.

The client fans out across **all** holdings in small chunks with limited
concurrency (`src/lib/feedFetch.ts`), correlating results by `securityKey`, and
each Function caches at the edge with per-ticker freshness inside one bundled
entry — per-ticker cache entries would spend the whole 50-subrequest budget on
cache traffic before the first fetch.

**Coverage: 71 of 74 securities resolve to an NSE symbol** (136 of 143 position
rows). The three that don't are cash, a receivable and the Axis Liquid Fund
sweep — none has a listing, so they are reported as *unpriceable* rather than as
a feed shortfall that no token could close. Announcements and insider trades are
keyed by ticker, so they cover only names that resolve to one; unlisted holdings
are simply absent from those feeds rather than shown as having none.

`src/data/nseSymbols.json` maps **securityKey → symbol**, regenerated by
`npm run build-symbols`. It is keyed on the name, not the ISIN, because no
provider in this book prints an ISIN in its holdings column. Three tiers — exact
normalised name, `securityKeyOf` on both sides, and a committed override table —
and no fuzzy tier: a name matching two listings or none is left out, because a
missing symbol shows a position as not-live while a wrong one shows another
company's price and says nothing about it.

### Basis discipline

Live prices may move **market value, day change, unrealised P&L and return on
cost**. They may never move quantity, cost basis, realised gains, dividends, fees
or any dated cash flow — no price is evidence about any of them.

Every consolidated figure states which basis it is on, in the pill at the top of
the page: **STATEMENT** (as printed, ties to the archive) or **LIVE** (marked to
market now). Capital Gains, Data Audit and Ledger Insights are pinned to
STATEMENT whatever the feed is doing, because a reader checks them by opening the
PDF.

### Without a token

Everything renders on statement marks with an honest "not live" indicator. No
blank tiles, no zeros, no spinner that never resolves, and no "session expired"
wording for what is a missing upstream. Consolidated NAV is exactly
₹83,50,63,590.78.

### Testing the live layer locally

A production token is not needed, and a live layer testable only with one is a
live layer nobody tests:

```bash
npm run build
npm run dev:mock-quotes        # → http://127.0.0.1:4174
```

Each symbol is priced at **its own statement mark × a factor** (default 1.10), so
prices stay plausible per security and the expected total is exactly computable:
the priceable book must rise exactly 10%, and cost basis, realised gains and cash
flows must not move at all. `FACTOR=0.9` gives a falling market.
`curl -s localhost:4174/__mock/stats` reports which holdings the fan-out actually
reached.

---

## Verification

```bash
npm run test:ingest    # parseNum / layout / pipeline + the golden figures
npm run check:pages    # every route, both themes: console errors, failed
                       # requests, horizontal overflow, unremapped dark
                       # utilities in light mode, and ₹0 / 0.00% on screen
npm run build          # tsc -b && vite build
```

| Suite | What it proves |
| --- | --- |
| `parseNum` | Indian & Western grouping, sign conventions, and that `null` means *not reported* — never zero. Rejects concatenations like `-33.7912,500` instead of guessing. |
| `layout` | Page rotation, row clustering, column inference, same-line and cross-line number stitching — against PDFs generated in the test with known coordinates. |
| `pipeline` | Extractor → normalized document → every reconciliation check, including duplicate-holding detection across owners. |
| `golden` | The **real** figures, read off the statements by a human. |

The **golden test** has four outcomes: PASS, **FAIL** (exit 1), **BLOCKED**
(exit 2, for a case whose statements are absent from the drop) and **NOT
CHECKED**. Neither blocked nor unchecked is ever reported as a pass — a test that
passes with no input claims confidence nobody earned.

`npm run check:pages` needs a build and a `vite preview` on :4173. Useful
switches: `THEMES=light`, `WIDTHS=1440,1280,1024`, `FAST=1` (layout only),
`SHOTS=0`. Screenshots land in `docs/page-check/`.

---

## Documented limitations

These are gaps in the source documents, not bugs. Each renders `—` on screen with
its reason, and each would be filled by a specific statement.

| Not carried | Why | What would supply it |
| --- | --- | --- |
| **NAV / valuation series** | Each account's statements carry exactly two dated portfolio values — opening and closing. Two points are not a trajectory | A monthly or quarterly valuation statement |
| **Unrealised short/long-term split** | Needs per-lot purchase dates for **held** lots. The capital register is a capital-account ledger, not a lot register | A holding statement with lot-level acquisition dates |
| **Hold-to-LTCG planner** | Same cause — no lot dates, so no date to count to | as above |
| **Drawdown** | Needs the book's value at many dates | A periodic valuation series |
| **Realised gains for 100022 and 100023** | Goldstandard issued no capital gain statement for them in this drop. Their sells are real; what they realised was never reported | A capital gain statement for those accounts |
| **XIRR for 510854** | No performance summary, so its flows carry no opening portfolio value. It is excluded from the consolidated XIRR on **both** sides and named on screen | A performance summary covering the window |
| **Per-entity YTD** | Needs a per-entity NAV on 1 April | A dated per-entity valuation |
| **Per-security XIRR** | Transaction statements cover the current period only; a rate over a partial history is a real number for the wrong window | A full transaction history from first purchase |
| **Consolidated time-weighted return** | Three managers publish different periods, against different benchmarks, from different inception dates | Not a document problem — averaging them would be a category error |
| **Private markets** | All five accounts are listed-equity PMS mandates | A private-markets statement |
| **Live prices for 3 securities** | Cash, a receivable and a liquid-fund sweep have no NSE listing | An AMFI NAV source for the fund |

The **as-of skew** is not a limitation to be fixed but a fact to be shown: Green
Lantern's statements close 2026-06-25 and the others 2026-07-10, so consolidated
STATEMENT-basis totals blend those dates. Every page carrying such a total says
so.

---

## How this book differs from a single-workbook book

The model carries six things a spreadsheet-sourced cockpit doesn't need. Full
rationale in [CLAUDE.md](./CLAUDE.md); in short:

| | |
| --- | --- |
| **Identity is `securityKey`, not ISIN** | These providers print a security name and nothing else on all 51 statements. Positions join on a slug of the normalised name; ISIN and ticker are optional enrichment. The drill-down route is `/stock/:securityKey`. |
| **Owner ≠ custodian** | `Account` carries `owner`, `provider`, `accountNo`, `strategy`, `engagement`, `asOf`; positions reference it by `accountId`. The old substring-matching `custodianOf()` heuristic is gone. |
| **As-of is per account** | Statements arrive per platform on their own schedule. `Portfolio.asOf` is only the newest; `<BasisPill>` flags which accounts are behind wherever a consolidated total is shown. |
| **Sectors are per provider** | `sector` is our normalised value, `providerSector` is what the provider printed. Both kept; nothing is inferred. |
| **Asset class ≠ engagement** | `AssetClass` is what a thing *is* (`Equity`, `AIF`, `Cash`, …). **PMS is not an asset class** — it is how an account is *run*, so it lives on `Account.engagement`. The holdings inside a PMS are ordinary listed equity. |
| **One person, one `ownerId`** | The same family member is printed three ways across providers. `shared/owners.mjs` resolves every spelling to one canonical owner; an unmatched name is reported loudly, never turned into a new person. |

---

## Pages

| Group | Page | What it shows | Basis |
| --- | --- | --- | --- |
| Setup | Data & Refresh | Ingest status, account registry & report dates, holdings CSV export | STATEMENT |
| Setup | Data Audit | Browser over every extracted statement table | STATEMENT |
| Daily | Morning CIO | NAV, capital invested, embedded gain, XIRR, allocation, concentration | LIVE |
| Daily | Portfolio Monitor | All 143 holdings, and the 256-row transaction tape | LIVE |
| Daily | News & Announcements | Market news, exchange filings and insider trades for listed holdings | external feeds |
| Allocation | Family & Entities | By owning entity, and who custodies each | LIVE |
| Allocation | Sector Composition | Sector mix with per-sector drill-down | LIVE |
| Tax | Capital Gains & Tax | Realised by account and asset class, loss harvesting | STATEMENT |
| Private Markets | Private Markets | Empty in this drop — all five accounts are listed-equity mandates | — |
| Private Markets | Data Bank | Document repository, empty until a private holding exists | — |
| Analytics | NAV & Performance | Managers' time-weighted returns, value bridge, money-weighted XIRR | LIVE + STATEMENT |
| Analytics | Return & Drawdown | Return distribution, contribution by sector and name | LIVE |
| Analytics | Ledger Insights | Transactions, realised-gain lots, income & corporate actions | STATEMENT |
| Admin | Snapshot History | Dated NAV snapshots — none in this drop | STATEMENT |

---

## Layout

| Path | What lives there |
| --- | --- |
| `src/pages/*` | One file per route (see `src/App.tsx`) |
| `src/lib/types.ts` | The canonical model — read this first |
| `src/lib/ledger.ts` | The dated record, read from `public/audit/` at runtime |
| `src/lib/analytics.ts` | Shared aggregation; `sumOrNull` |
| `src/components/Absent.tsx` | The one place an absent figure renders |
| `src/context/PortfolioContext.tsx` | Book + live overlay + basis |
| `shared/*` | Code both the browser and the ingest use (securityKey, owners, sectors) |
| `scripts/ingest/*` | The PDF intake pipeline |
| `scripts/dev/*` | Local fixtures (the quote mock) |
| `functions/*` | Cloudflare Pages Functions — the gate and the API proxies |
| `source/*` | Raw statements. Committed as provenance, **never served** |
| `public/audit/*` | Extracted tables — served, behind the gate |

`audit/manifest.json` lists every document and its sections; each section is
`audit/<docKey>/<section>.json`, shaped `{ name, rows: [[cell, …], …] }`, plus
`document.json` (the normalised facts) and `pages.json` (raw per-page text).

Further reading: [CLAUDE.md](CLAUDE.md) for the conventions and why each exists,
[docs/FIGURE-PROVENANCE.md](docs/FIGURE-PROVENANCE.md) for every figure's source,
[docs/EXTRACTION-REPORT.md](docs/EXTRACTION-REPORT.md) for whether it ties out,
and [docs/BOOK-REPORT.md](docs/BOOK-REPORT.md) for what the book does not carry.
