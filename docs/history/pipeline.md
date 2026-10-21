# The ingest pipeline, stages 1–8

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 2572–3356). CLAUDE.md now carries the condensed rules; this file is the record. -->

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

**`quotes` PRICES FROM UPSTOX FIRST since Stage 10br** — `UPSTOX_ACCESS_TOKEN`
in the same environment, one call for the whole book — and asks muns only for
what Upstox did not price. `GET /api/quotes?check=1` says whether the token
works.

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
  alert rule they entered is still held in `familyInputs.ts`. Nothing evaluates a
  rule today and — since Exposure & IPS went at Stage 10bc — **nothing exports
  one either**: that page carried the only Export/Import, so the rules are still
  stored, still correct and no longer reachable from any screen.
- **PDF and PowerPoint export.** Excel export exists (`exportPortfolioExcel.ts`).

