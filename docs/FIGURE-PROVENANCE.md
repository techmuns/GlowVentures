# Figure provenance

Every figure the cockpit puts on screen, and the document it comes from.

This exists so that any number in front of the family can be answered with "that
came from *this* statement, on *this* basis" — or, where it cannot, so the screen
says so before anyone has to ask. It is written to be checked, not skimmed: each
row names a report type you can open under **Setup → Data Audit** and read.

_Corpus: 51 documents, 5 accounts, 3 managers. Book as of 2026-07-10._

---

## How to read this

**Basis.** Every consolidated figure is on one of two measurements, and the
`<BasisPill>` at the top of each page says which:

| | |
| --- | --- |
| **STATEMENT** | As the managers printed it. Ties to the archive to the rupee. Because accounts are dated individually, a consolidated total on this basis is a **blend of report dates** — Green Lantern closes 2026-06-25, the other three close 2026-07-10. |
| **LIVE** | The same holdings marked to market now. Every price shares one moment, so the date skew disappears *for prices* — but it survives in every field the feed does not touch, and the figure no longer matches any statement. |

The live overlay may move **market value, day change, unrealised P&L and return
on cost**. It may never move quantity, cost basis, realised gains, dividends,
fees or any dated cash flow: no price is evidence about any of them. Three pages
are pinned to STATEMENT regardless of the feed, because a reader checks them by
opening the PDF — **Capital Gains, Data Audit, Ledger Insights**.

**Source kinds.**

- **Primitive** — read directly off a statement (quantity, unit cost, market price).
- **Derived** — arithmetic over primitives, computed here (market value = price × quantity).
- **Printed check** — the statement's own version of a derived figure, kept in
  `printed.*` and compared, never used as the source. Every delta is in
  [EXTRACTION-REPORT.md](./EXTRACTION-REPORT.md).
- **Joined** — assembled from more than one document in this drop, always the
  same account's or the same security's own paperwork, never inferred from text.

---

## The corpus

Which report types exist, and which accounts they cover. A gap here is the reason
for every `—` further down.

| Report type | Docs | Accounts covered | Missing |
| --- | ---: | --- | --- |
| Portfolio appraisal | 5 | all five | — |
| Fact sheet | 5 | all five | — |
| CURRENT PORTFOLIO (holdings) | 5 | all five | — |
| Transaction statement | 5 | all five | — |
| Dividend statement | 5 | all five | — |
| Bank book | 5 | all five | — |
| Performance history | 5 | all five | — |
| Capital register | 4 | 100022, 100023, 510854, 510861 | **3517383** |
| Performance summary | 4 | 100022, 100023, 3517383, 510861 | **510854** |
| **Capital gain statement** | 3 | 3517383, 510854, 510861 | **100022, 100023** |
| Performance benchmark | 3 | 100022, 100023, 510854 | 3517383, 510861 |
| Corporate benefits | 1 | 100023 | four accounts |
| Expense statement | 1 | 100023 | four accounts |

Two gaps drive most of the absences on screen:

- **100022 and 100023 issue no capital gain statement.** Their sells are real;
  what those sells realised was never reported. Every realised figure for them
  renders `—` with that reason, and no total silently counts them as zero.
- **510854 issues no performance summary**, so its cash flows carry no opening
  portfolio value and it cannot produce a money-weighted return. It is excluded
  from the consolidated XIRR **on both sides** — flows *and* terminal market
  value — and named on screen.

---

## Page by page

### Morning CIO — `/cio`

Basis: **LIVE** when the quote feed is up, **STATEMENT** otherwise. The pill says which.

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Consolidated NAV — `₹83,50,63,590.78` | 5 × portfolio appraisal | Derived: Σ (market price × quantity), incl. cash | STATEMENT / LIVE |
| Capital invested — `₹70,77,60,828.25` | 5 × portfolio appraisal | Primitive: Σ total cost | STATEMENT always |
| Embedded gain — `₹12,73,02,762.53` | as above | Derived: market value − cost | STATEMENT / LIVE |
| Listed XIRR — `+109.7% p.a.` | capital register (or bank book) + performance summary opening value | Derived: Newton–Raphson XIRR, terminal at 2026-07-10 | STATEMENT |
| Dry powder | — | **Absent**: no fund commitment in this book | — |
| Distributions | — | **Absent**: no fund holds, so none has distributed | — |
| Allocation by asset class | account registry `engagement` + appraisals | Joined | STATEMENT / LIVE |
| Capital deployment | — | **Absent**: no commitment schedule | — |
| Positions `143` / distinct names `74` | 5 × portfolio appraisal | Primitive count | STATEMENT |
| Cross-held `64` | appraisals + account registry | Derived: securities held by ≥2 owners | STATEMENT |
| Top-10 concentration `51%` | appraisals | Derived: Σ top 10 ÷ Σ all, consolidated on securityKey | STATEMENT / LIVE |
| Largest name | appraisals | Derived | STATEMENT / LIVE |
| Winners / losers `86 / 51` | appraisals | Derived: count of returnPct ≷ 0, cost-unavailable excluded | STATEMENT / LIVE |
| Listed / Private | appraisals | Derived; private half renders `—`, not 0% | STATEMENT |
| Listed NAV trajectory | — | **Absent**: two dated values per account is not a series | — |

**The XIRR is annualised over a ~100-day window** (1 Apr → 10 Jul). It is a real
money-weighted measurement of that quarter, not a rate the book has sustained for
a year, and the page says so.

### Portfolio Monitor — `/monitor`

Basis: **LIVE** where a quote exists; every row flags its own live/not-live state.

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Quantity, average cost, invested | portfolio appraisal | Primitive | STATEMENT always |
| Market price | quote feed, else appraisal | Primitive | LIVE / STATEMENT per row |
| Market value, unreal. P&L, return, weight | derived from the two above | Derived | LIVE / STATEMENT per row |
| Day change | quote feed (`prevClose`) | Derived | LIVE only; `—` without a quote |
| Realised P&L | capital gain statement, joined on (account, security, sale date) | Joined | STATEMENT always |
| Sector | provider sector → GICS map (`shared/sectors.mjs`) | Joined, committed map | STATEMENT |
| Transactions tape (256 rows) | 5 × transaction statement | Primitive | STATEMENT always |
| Trade settlement amount | transaction statement | Derived: gross + brokerage rate × qty ± STT | STATEMENT |

**Realised P&L has three distinct absences here**, never collapsed into one dash:
"no sale of this name", "sold, but no capital gain statement covers that account",
and "shown in the consolidated view".

### Family & Entities — `/family`

Basis: **LIVE** for NAV; cost and flows STATEMENT.

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Entities `2` | `shared/owners.mjs` registry + account registry | Joined, canonical | STATEMENT |
| Per-entity NAV, weight, P&L, return | appraisals grouped by `ownerId` | Derived | LIVE / STATEMENT |
| Per-entity XIRR | capital register / bank book + opening value, per owner | Derived | STATEMENT |
| Per-entity YTD | — | **Absent**: needs a per-entity NAV on 1 April | — |
| In-house / Direct | — | **Absent**: no account is run in-house; all five are external mandates | — |
| External custody share / count | account registry `provider` | Primitive | STATEMENT |
| Custody per entity | account registry | Joined | STATEMENT |

The owner registry is load-bearing: the same person is printed `Mr. AJAY T
JAISINGHANI`, `Ajay Thakurdas Jaisinghani` and `Ajay Jaisinghani` across these
managers. Grouped by printed name, one person becomes three.

### Sector Composition — `/sectors`

Basis: **LIVE** for values; sector labels STATEMENT.

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Sector value, weight, count | appraisals + the GICS map | Derived | LIVE / STATEMENT |
| Sector return | appraisals | Derived: Σ P&L ÷ Σ cost | LIVE / STATEMENT |
| Provider's own sector label | fact sheet | Primitive, kept verbatim per position | STATEMENT |
| Unclassified — `₹46,55,899.60` (0.56%) | fact sheet labels with no map entry | Reported, never guessed | STATEMENT |

Each platform uses its own taxonomy and they disagree on nearly every name. The
map is committed; anything unmapped renders **Unclassified** and is listed in
[BOOK-REPORT.md](./BOOK-REPORT.md).

### Capital Gains & Tax — `/capital-gains`

Basis: **STATEMENT always.** This page must tie to the capital gain statements.

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Realised gains — `−₹1,93,11,002.95` | 3 × capital gain statement, all 77 lots | Primitive (the manager's own tax determination) | STATEMENT |
| — of which short-term | `−₹1,89,93,755.70` | Primitive | STATEMENT |
| — of which long-term | `−₹3,17,247.25` | Primitive | STATEMENT |
| Realised, by asset class | lots × class joined from appraisals/transaction statements | Joined | STATEMENT |
| Per-account realised + window | capital gain statement header | Primitive | STATEMENT |
| 100022, 100023 rows | — | **Absent**: "no capital gain statement issued for this account in this drop" | — |
| Embedded (unrealised) ST/LT | — | **Absent**: needs per-lot purchase dates for HELD lots | — |
| Est. tax on realised — `₹0` | derived from the above | Derived; a **computed** zero — the book's realised position is a net loss, stated in the tile | STATEMENT |
| Hold-to-LTCG planner | — | **Absent**: no lot acquisition date for a held position | — |
| Tax-loss harvesting: losses and sizes | appraisals | Derived: positions with negative unrealised P&L | STATEMENT |
| Harvesting ST/LT column | — | **Absent** per row: holding period unknown | — |

**The realised total nets two unlike books**, which the by-class split now makes
visible without changing the figure:

| Asset class | Lots | Short-term | Long-term | Total |
| --- | ---: | ---: | ---: | ---: |
| Equity | 58 | −1,98,59,441 | −3,17,247 | **−2,01,76,689** |
| No class on any statement (DSP Mutual Fund, Axis Liquid Fund — the cash sweep) | 19 | +8,65,686 | 0 | **+8,65,686** |
| **Total — canonical** | **77** | **−1,89,93,756** | **−3,17,247** | **−1,93,11,003** |

The two sweep instruments appear on no appraisal and no transaction statement, so
nothing classifies them. "Mutual Fund" appearing in a printed name is not a
classification any statement made, and none is asserted.

The tax rates (STCG 20% u/s 111A, LTCG 12.5% u/s 112A) and the ₹1.25L exemption
are **statute, not book data** — they are labelled illustrative and do not
convert with the display currency, because an Act's figure is denominated in
rupees.

### Private Markets — `/private` · Data Bank — `/data-bank`

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Everything | — | **Absent**: all five accounts are listed-equity PMS mandates. No PE/VC fund, pre-IPO vehicle, unlisted company or startup appears in any statement | — |

Both pages render an empty-segment state driven by the book's own classification,
not a flag: ingest a private-market statement and the segments, tabs and tables
populate themselves with no code change. The Data Bank previously shipped a
hardcoded document trail and founder meeting notes carried over from the
reference dashboard — invented filenames, invented board updates, invented
revenue growth. All removed.

### NAV & Performance — `/performance`

Basis: **LIVE** for NAV and embedded return; the managers' returns and the bridge
are as reported.

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Listed NAV | appraisals | Derived | LIVE / STATEMENT |
| Embedded return — `+17.99%` | appraisals | Derived: Σ P&L ÷ Σ cost | LIVE / STATEMENT |
| Money-weighted XIRR — `+109.7% p.a.` | capital register / bank book + performance summary opening value | Derived | STATEMENT |
| Top-10 concentration `51%` | appraisals | Derived | LIVE / STATEMENT |
| NAV trajectory | — | **Absent**: two dated values per account is not a series | — |
| TWRR grid (MTD/QTD/FYTD, 1m/3m/6m/1y, since inception) | fact sheet, else performance appraisal | Primitive, as each manager publishes | STATEMENT |
| Benchmark series | fact sheet / performance benchmark | Primitive | STATEMENT |
| Consolidated TWRR | — | **Absent**: three managers, different periods, different benchmarks, different inception dates | — |
| Value bridge (opening → closing) | performance summary (FY-to-date) and fact sheet / appraisal (since inception) | Primitive | STATEMENT |
| Per-account XIRR | capital register / bank book + opening value | Derived | STATEMENT |
| 510854 XIRR row | — | **Absent**: no performance summary, so no opening value | — |

**Three period vocabularies are kept apart.** Goldstandard publishes to-date
periods (MTD/QTD/YTD); Green Lantern and Carnelian publish trailing ones
(1m/3m/1y). A trailing one-month return and a month-to-date return are different
measurements, so each account shows only the columns its own manager publishes.
FYTD is the Indian **financial** year to date (1 April), not the calendar year.

**The two bridge columns are different windows and are never added.** The
performance summary runs the financial year to date; the fact sheet and appraisal
run since inception. Both print a "Realised Gain" and both are right.

### Return & Drawdown — `/returns`

Basis: **LIVE** for returns; cost basis STATEMENT.

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Embedded return `+17.99%` | appraisals | Derived | LIVE / STATEMENT |
| Names in profit `61%` (87 of 143) | appraisals | Derived | LIVE / STATEMENT |
| Spread between managers `28.9 pp` | appraisals grouped by provider | Derived, over rated accounts only | LIVE / STATEMENT |
| Return distribution by value | appraisals | Derived: market value per return band | LIVE / STATEMENT |
| Contribution by sector / position | appraisals + GICS map | Derived: P&L ÷ **total** cost, so parts sum to the embedded return | LIVE / STATEMENT |
| Maximum drawdown | — | **Absent**: needs the book's value at many dates; this corpus carries two per account | — |

### Ledger Insights — `/ledger`

Basis: **STATEMENT always.** Every figure here is a dated primitive.

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Transactions `256` (207 buys / 49 sells) | 5 × transaction statement | Primitive | STATEMENT |
| Bought / Sold | transaction statement | Derived: Σ settlement | STATEMENT |
| Window `1 Apr 2026 → 10 Jul 2026` | transaction statement header | Primitive | STATEMENT |
| Per-row realised | capital gain statement, attributed once per (account, security, date) | Joined | STATEMENT |
| Realised (canonical) `−₹1.93 Cr` | 3 × capital gain statement, 77 lots | Primitive | STATEMENT |
| Realised by asset class | as Capital Gains above | Joined | STATEMENT |
| Attributed / unattributed cross-check | the two above | Derived, reconciles to the rupee | STATEMENT |
| Lots `77` with purchase + sale dates | capital gain statement | Primitive | STATEMENT |
| Cash dividends `₹13,54,247.80` | 5 × dividend statement, deduped on (date, security, amount) | Joined | STATEMENT |
| TDS | dividend statement | Primitive | STATEMENT |
| Corporate actions `1` (LIC bonus 1:1) | corporate benefits report | Primitive | STATEMENT |
| Sales & exits | transaction statement sells + appraisal held quantity | Joined | STATEMENT |

**No per-security XIRR is shown, deliberately.** That needs every lot from first
purchase; these transaction statements cover the current period only, and a rate
over a partial history is a real number for the wrong window.

**A day's sale is settled once.** The capital gain statement settles a day's sale
against however many purchase lots it consumed; the transaction statement prints
that sale as one row — or, three times in this drop, as two. Attributing the
day's whole figure to each row counted Syngene's −₹1.4 Cr twice.

### News & Announcements — `/news`

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Company pick-list | appraisals, consolidated on securityKey | Derived | STATEMENT |
| Articles, filings, insider trades | live feeds via `/api/*` (needs `MUNS_TOKEN`) | External, not book data | LIVE only |

Nothing on this page is a book figure. With no token the feeds report themselves
unavailable; no article is ever synthesised.

### Data Audit — `/audit`

Basis: **STATEMENT always** — these *are* the source tables.

| Figure | Source |
| --- | --- |
| 51 documents, every extracted table | `public/audit/<docKey>/<section>.json`, written by `npm run extract` |
| Raw per-page text | `pages.json`, for provenance |

### Snapshot History — `/history`

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Snapshots | — | **Absent**: no performance-history statement prints a dated valuation series | — |
| Current consolidated snapshot | appraisals | Derived | STATEMENT |
| Private | — | **Absent**, not `₹0` | — |

### Data & Refresh — `/upload`

| Figure | Source | Kind | Basis |
| --- | --- | --- | --- |
| Accounts, providers, per-account as-of | account registry, from statement headers | Primitive | STATEMENT |
| Sector coverage `99.4%` | appraisals + GICS map | Derived | STATEMENT |
| Positions carrying an ISIN — `5 of 143` | capital gain statement (split out of the name field) | Joined | STATEMENT |
| Cost-unavailable names | appraisals | Primitive flag | STATEMENT |
| NAV snapshots | — | **Absent** | — |

---

## Joins: figures assembled from more than one document

Four joins produce a figure no single statement prints. Each uses only this
drop's own paperwork, and each is applied only where unambiguous.

| Join | Why it is needed | Guard |
| --- | --- | --- |
| **owner name → `ownerId`** | The same person is printed three ways | Committed registry with aliases + an initials rule; a name matching nothing is reported loudly, never turned into a new owner |
| **client code → account number** | Green Lantern and Carnelian print `AJAY T JAISINGHANI - GLC0780`; other reports for that client print both identifiers | Applied only where the mapping is unambiguous; recorded as `accountNoSource: "client-code"` with a warning |
| **securityKey → asset class** | The capital gain statement prints none | Joined from that security's own rows on an appraisal or transaction statement; `null` and NAMED where neither carries it |
| **securityKey → NSE symbol** | No statement prints a ticker for most names | Three tiers (exact name, securityKey, committed override) and **no fuzzy tier**: a name matching two listings or none is left out, because a wrong symbol shows another company's price |

**The ISIN is not a join — it is a split.** Carnelian's capital gain statement
prints `CRIZAC LIMITED-INE0S4R01014` in one column. The extractor separates them
at the seam, so the key comes from the clean name and the ISIN is kept. It is
enrichment, never identity: `securityKey` remains the join key throughout.

---

## What is on screen that cannot be traced to a document

**Nothing.** Every figure resolves to one of: a primitive read off a statement,
arithmetic over such primitives, a join listed above, or an explicit absence with
a stated reason.

Five categories of on-screen content are **not book figures**, and none is
presented as one:

1. **Statutory tax rates and the LTCG exemption** on Capital Gains — Indian
   income-tax law, labelled illustrative, with the exemption and surcharge
   treatment explicitly excluded.
2. **The FX rate** (`$1 = ₹83.50`) — a reference rate from `/api/fx` (ECB), or a
   static fallback when unreachable. It is a rate, not a holding.
3. **News, announcements, insider trades and research** — external feeds, present
   only with a token, never synthesised.
4. **Roadmap strips** on Morning CIO, Stock Info and Data Bank — statements of
   *capability not yet built*. They name no figure, no holding and no date.
5. **Chart axis ticks** — a bar chart's `₹0` baseline is an axis label, not a
   measurement.

### Zeros on screen that are real measurements

`npm run check:pages` flags every `₹0` and `0.00%` so they can be judged rather
than assumed. The ones that survive are all genuine:

| Where | Figure | Why it is a real zero |
| --- | --- | --- |
| Portfolio Monitor, Sector Composition | Cash rows: `₹0` P&L, `0.00%` return | Cash does not appreciate; cost equals value. A measured zero. |
| Return & Drawdown | Cash contribution `+₹328`, `+0.00%` | A real ₹328 of income on a ₹83.5 Cr book rounds to 0.00% at two decimals. |
| Capital Gains | Est. tax on realised `₹0` | The book's realised position is a net **loss**, so there is no tax to estimate. The tile says so beside the figure, not in a tooltip. |
| Several charts | `₹0` axis tick | An axis label. |

---

## Documented limitations

Everything the book deliberately does not carry, and what would supply it.

| Not populated | Why | What would fix it |
| --- | --- | --- |
| `navHistory` | Two dated portfolio values per account (opening and closing) is not a series | A monthly or quarterly valuation statement per account |
| `unrealisedST` / `unrealisedLT`, `stCostBasis`, `ltCostBasis`, `daysToLT` | Needs per-lot purchase dates for **held** lots. The capital register is a capital-account ledger — contributions, withdrawals, TDS transfers — not a lot register | A holding statement with lot-level acquisition dates |
| `privateMarkets` | All five accounts are listed-equity PMS mandates | A private-markets statement |
| Realised gains for 100022, 100023 | Those managers issued no capital gain statement in this drop | A capital gain statement for those accounts |
| XIRR for 510854 | No performance summary, so no opening portfolio value | A performance summary covering the window |
| Per-entity YTD | Needs a per-entity NAV on 1 April | A dated per-entity valuation |
| Per-security XIRR | Transaction statements cover the current period only | A full transaction history from first purchase |
| Consolidated TWRR | Three managers, three period vocabularies, three benchmarks, three inception dates | Not fixable by more documents — it is a category error |
| Drawdown | Needs the book's value at many dates | A periodic valuation series or a daily NAV feed |
| Live prices for 3 securities | Cash, a receivable and the Axis Liquid Fund sweep have no NSE listing | An AMFI NAV source for the fund; the other two are not securities |

---

## Verification

| Check | Result |
| --- | --- |
| Consolidated NAV vs archive | `₹83,50,63,590.78` — ties per account, per owner and per sector |
| Reconciliation material deltas | **0** across 30 row-sum, 177 derived-vs-printed, 900 dated-table and 3 cross-report checks |
| Golden test (figures read off the PDFs by a human) | 114 passed, 0 failed, 2 not checked, 2 blocked |
| Book regenerates from `source/` | Byte-identical |
| Excel export total | `835,063,590.78` — matches the screen |
| Routes rendered, both themes | 15 routes × 2 themes, 0 console errors, 0 failed requests |
| Layout | 129 route × width × nav-width combinations, none overflow the viewport |
