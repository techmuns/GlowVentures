# Stage history, part 5 (Stage 10cr → 10ef, then 10k, 10h–10j, 10c–10e, 9d–9)

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 24327–28823). CLAUDE.md now carries the condensed rules; this file is the record. -->

### Stage 10cr — A CAPTURE A DAY OLD NO LONGER TAKES EVERY SHARE OFF ITS LIVE PRICE

*"Why is this data not showing can you please fix quickly"* — a screenshot of
Morning CIO at 10:50 IST on 24 Sep 2026: the index strip live, the top bar
live, and Today's movers reading *"No direct-equity holding carries a day
change right now"*.

**ROOT CAUSE: THE CORPORATE-ACTION GATE (#84) NEEDED A CAPTURE DATED TODAY.**
`applyCorporateActionQuotes` withholds the live price of a company share
whenever the event capture's `verifiedThrough` is earlier than the quote's
market day — to avoid pairing a pre-split quantity with a post-split price. The
capture it reads is one of two:

- **the live proxy** (`/api/corporate-actions`) over Glow Central Research's
  capture, which Research takes once a day AFTER the open — 04:43 UTC,
  10:13 IST, on 24 Sep; and
- **the committed fallback** `public/data/corporate-actions.json`, dated
  **23 Sep**.

So from the 09:15 open until the day's capture reached the browser (up to about
half an hour after Research took it, through the edge's 15-minute cache and the
browser's own 15-minute poll), **no company share in the book had a live price
or a day move — Direct Equity and every share inside a PMS mandate alike** —
and wherever the live proxy did not answer, all day, every day after the
fallback's date. ETFs and mutual funds were unaffected, which is why that tab
of the card worked. Measured on the live proxy's own code: it parses an 8.4 MB
capture and normalises 8,494 rows, about 140–250 ms of CPU a refresh, which a
Workers plan capped at 10 ms would refuse. That is named here as a possible
reason the proxy does not answer in production, not measured there — the site
is behind its password.

**`cio-live` COULD NEVER HAVE SEEN IT**, which is why the sweep stayed green: its
fixture's capture is dated weeks AFTER its quotes.

#### The fix: share events get a short lead, dividends do not

`SHARE_EVENT_LEAD_DAYS = 3` in `src/lib/corporateActions.ts`. A capture up to
three calendar days behind the quote still covers SHARE events, so the live
price and every split or bonus the capture lists still apply. Two reasons:

- **SEBI LODR Regulation 42(2)** requires the record date to be notified to the
  exchange at least seven working days ahead.
- **The capture lists forthcoming share events.** Measured on 24 Sep: six
  splits and bonuses, 1 to 32 days ahead. The 23 Sep capture listed BUILDPRO's
  8 Oct split.

**A DIVIDEND DOES NOT GET THAT ROOM.** It changes no quantity, only the total
return, and a missed one would read as zero income. So the coverage gap still
goes on the INCOME side: the dividend entitlement and the total return are
withheld until a capture covers the day, and the reason is named. A capture more
than three days behind still withholds the live price, exactly as before.

Three days covers an overnight lag and a Friday capture read on Monday. It does
not cover a longer Research outage, which is the gate working as #84 designed.

#### The checks

- **`corporateActions.test.ts`** asserted that a capture ONE day behind blocks
  the live price. That line was the defect written down as a rule, so it now
  asserts the lead window from both sides:
  - one day behind: live, with the listed split applied, and a day move;
  - three days behind is still inside the window, and four is not;
  - a capture with no verified date covers nothing;
  - on a lagging capture the dividend entitlement and total return are null,
    and the income side names why.
- **The same test runs on the real book against the committed fallback.** The
  shares live on the capture's own date must stay live on each of the next
  three days, and none on the fourth.
- **`check:pages` gains `cio-live-capture-lag`**: `cio-live` with the capture
  one day behind the quotes. It must rank every priced direct-equity name and
  show the day's move. Put the old gate back and it fails both checks with the
  empty card the family saw, while `cio-live` stays clean.

`build` · `test:family` (0 failed) · `check:pages` on `cio-live` and
`cio-live-capture-lag` clean. `glowData.ts` is untouched: this is a
presentation-layer gate.

### Stage 10cs — EVERY RETURN COLUMN BY DEFAULT, AND AN ARRANGEMENT THAT SURVIVES A TAB

*"make default All ratios showing coloumns as selected. So tick holding period,
cagr, xirr, YTD, calendar year etc and remeber it the next time user always
comes. Also when i am drag and drop rearranging the coloumns then the system
needs to remeber the exact position and save it even when i am changing the tab
… make this across all tabs and tables"*

**THE PICK LIVED ONLY IN THE ADDRESS.** `?ret=` was the whole memory, so any
link without it — the nav, a breadcrumb, a bookmark — reopened the table on the
methodology column. Now `src/lib/returnMeasures.ts` decides, in one pure rule:
the address, then the reader's saved pick for that page
(`glow:returnMeasures:<page>:v1`), then the default — **all five measures, one
column each**. A pick saves itself and takes `?ret=` out of the address, so the
next link cannot undo it. The picker reads "Returns · all" and its footer says
where the pick is kept. Portfolio Monitor and Private Market each keep their own.

**THE ORDER LOST WHAT A TAB DID NOT DRAW.** Three causes, each fixed where it
lives (`src/lib/tableView.ts`):

- **The Monitor's axes saved under two keys** (`monitor`, `monitor-stock`), so
  a column moved on Category was not moved on All Securities. One key now; an
  arrangement saved under the old one is still read.
- **A save kept only the columns drawn at the time**, so arranging Category
  forgot where the reader had put Via funds and Total exposure, and they came
  back at the far right. The saved order now keeps every column the reader ever
  placed, drawn or not.
- **A column never placed was appended at the end.** It now goes beside its own
  family — a newly ticked return beside the other returns — or right after the
  column it is declared after (Via funds follows Market value wherever it is).

With nothing saved, a table still draws its declared order exactly. The memory
(`src/lib/viewMemory.ts`) is read before the first paint, so a table never opens
in the default order and jumps; two tables on one key, and another browser tab,
see a change at once. Every table in the app reads it the same way.

**IT IS PER BROWSER**, like the nav's width. Following the reader to another
device needs the shared `GLOW_STORE` binding (Stage 10cl), which is not
connected yet.

**THE SWEEP.** Most routes were written against ONE return column, so every
route but three starts as a reader who saved "by methodology" — a real saved
state, seeded before the app boots. `private-market-returns` and
`monitor-txn-returns` are the bare addresses now, a fresh reader, and assert the
five by default. `monitor-remember` walks the family's own sequence — move a
column, change axis, move another, change back, pick a return, leave through the
nav, come back, reload, tick a measure, open a second browser tab and move a
column there, then cross to Transactions, move a column and cross back and
forth — and holds every step to the one before it. `tableView.test.ts` covers
the rules and the memory (`npm run test:family`).

Seven bugs were put back one at a time, and each fires its own checks: a save
keeping only the drawn columns, the two keys again, the old default, a pick that
is never saved, a new column sent to the far right, a browser tab that never
hears another's change, and a table that forgets its arrangement when it
unmounts.

### Stage 10ct — THE FIGURE AUDIT, PART A: THE MONEY FIGURES THAT WERE WRONG

*"Audit every calculation on the dashboard and fix every logical error, so the
client never finds one."*

`docs/FIGURE-AUDIT.md` is the audit, run on `main` at `20a3f15`: every figure the
dashboard shows, where it appears and how it is computed, checked against nine
rules and against the statements' own text. It found 17 wrong money figures (A),
15 disagreements between pages (B), 12 themes of wrong labels or bases (C) and 58
cosmetic items (D). This stage is the A group; B, C and D follow as Stages
10cu–10cw, one PR each. It prints no PAN.

| | Was wrong | Now |
| --- | --- | --- |
| A-01 | every return window ended on the book's newest date, 29 Aug — two quantity-only demats | it ends where its value is struck (`valueDateOf`); money-weighted +30.1% over 150 days → +26.5% over 134 |
| A-02 | a row clubbing several statements set the costed cost against every unit and rupee | `clubbedFigures.ts` strikes cost, units, value and gain on one set: ICICI Bank avg cost ₹438.34 → ₹1,346.33, unrealised +₹2.06 Cr → +₹5.98 L |
| A-03 | one lot's mark printed over every lot's units, on the Monitor and in Excel | one mark, or an absence naming the marks |
| A-04 | Neo Infra's cost | fixed on main by FIFO (Stage 10ca) before these fixes began; its HPR is 13.83%, not the audit row's 14.2% (value against the cost still held) |
| A-05 | Buoyant's own subscriptions counted as the manager's trades | capital, not trades; Bought ₹70.4 Cr → ₹35.4 Cr; the reader places columns by header |
| A-06 | dated capital that never reached Transactions; an unvalued account at ₹0 | the dated calls reached it on main (Stage 10cd); V.E.C 128005's July deposits and Green Lantern's small flows are dated capital now; an unvalued account shows no value, gain or return |
| A-07 | a date preset struck a gain on part of a record | withheld, with the reason |
| A-08 | capital-gain lots joined to no sale, or to another member | `shared/lotSettlement.mjs`, read by the ledger and the book; the Transactions realised ties to the statements' total |
| A-09 | one company drawn as two or three | the key merges landed on main (Stage 10cc); a bank's CD, NCD or CP now joins its share (₹52 L out of Unclassified) |
| A-10 | "₹28.3 Cr not proven" was market value, not movement, and false | NAV steps are proven from printed totals; no pill on this book |
| A-11 | Snapshot History's change counted accounts joining | the like-for-like link |
| A-12 | the value bridge opened where it closed; Sanshi closed on its contributions | each column ties on its own lines (29 of 34) or is withheld with the reason (5) |
| A-13 | the tax estimate netted one member's loss against another's gains | per taxpayer, with the Act's set-off of a short-term loss against the same person's long-term gain inside one year (s.70(2)): ₹18,19,256.53 → ₹24,18,681.36 |
| A-14 | ₹0 where nothing was reported: Cash invested, the chat's accounts | absent with the reason; a redeemed account keeps its measured 0 |
| A-15 | counts over the wrong set | members, not accounts; 7 unvalued AIF folios, not 10; "N holdings in M mandates"; Family weights over the rows' own total |
| A-16 | DSP Gold and Silver "returns" across a 1:10 unit split | `schemeReturns.ts` refuses a window across a 2× step |
| A-17 | ABSL Balanced Advantage units a statement records with no rate were on no screen | valued live at AMFI's NAV behind six gates; every unvalued line named on Family & Entities |

**CAPITAL IS COUNTED ONCE, WITH ITS HOLDING.** Transition Venture Fund I is one
holding under both family trusts, and the second trust's capital was added
beside it. Private Market and Morning CIO read one set now (`privateCapital`):
still to call ₹15.98 → ₹15.23 Cr, committed ₹42.73 → ₹41.23 Cr. Whether the
trusts hold one investment or two is the family's to say (§4c); the hovers say
what the second statement would add.

*(The family answered at Stage 10cx: two investments. Nothing is counted once on
this book now, so still to call is ₹15.98 Cr and committed ₹42.73 Cr again.
`privateCapital` still counts a future pair's capital with its holding.)*

**WHAT MOVED IN THE BOOK.** `BOOK_SUMMARY` did not move. In `glowData.ts`:
- realised ₹3,87,67,064.88 → ₹3,96,29,296.51 — the Axis Liquid lots now settle
  Green Lantern's sales (₹2,83,865.60 and ₹5,78,366.03), returns 3.18% → 5.49% and
  5.83%;
- six LKP holdings' realised 0 → absent: their sales are dated after the holding
  statement, so those units are still in it;
- capital moves 138 → 144, and `capitalRecordTo` for Green Lantern 510861 and
  V.E.C 128005;
- the NAV series' flows on three dates; nothing left unproven;
- new: `BOOK_UNVALUED_HOLDINGS` (55 lines) and `BOOK_UNDATED_CAPITAL`.

Both reconciliation reports were regenerated: they were stale on main.

**Guards.** Eleven new suites in `test:family` and `test:ingest`, nine new
`check:pages` routes, and `scripts/dev/unpriced-units-bug.sh`. Each guard was
proven by putting its bug back.

**Verification**, on this branch merged with `main` at `f99e738a`: `build` ·
`test:ingest` (every suite passes; golden 140 passed, 2 not checked, 0 blocked)
· `test:family` (64 suites, 3,061 checks, 0 failed; its four not-checked lines
are main's) · `check:family` **126/0** · `check:pages` **324 combinations
clean**: 162 routes in two themes, main's 153 and this change's nine. Of the 16
invariants not checked, 14 are main's four claims with no subject on this book.
The other 2 are this change's counted-once checks on `private-market-owners`,
which draws members, not funds; they pass on the fund routes · `build-book`
twice, byte-identical · every `replay:*`, `rekey:archive` and
`reconcile:review` a no-op with `--check`.

### Stage 10cu — THE FIGURE AUDIT, PART B: ONE FIGURE, WHEREVER IT IS PRINTED

*"Audit every calculation on the dashboard and fix every logical error, so the
client never finds one."*

The B group of `docs/FIGURE-AUDIT.md`: fifteen figures that read differently on
two pages, or on two parts of one page. Fourteen are fixed at a shared helper, so
every surface reads one definition; B-14 is not (below). Stacked on Stage 10ct.

| | Disagreed | Now |
| --- | --- | --- |
| B-01 | "the book" was three totals | one book, the current value of holdings: the top bar, Morning CIO, Private Market's value tile and `/holdings`' share line all divide by it; a per-statement set counts each holding once; the NAV card's three lists reconcile to it step by step, naming the double count by its holdings |
| B-02 | the fund movers priced on the look-through store's 9 Sep NAVs, every other page on AMFI's 22 Sep file | the movers read AMFI's file first; a scheme on another unit basis (the DSP ETFs) applies the percentage only, and says so |
| B-03 | "what the family holds" counted four ways | `currentHoldings` on Data & Refresh, NAV & Performance, Family & Entities, the Direct Equity movers, the chat and the Excel export, each naming what it leaves out |
| B-04 | two sectors for one company | the Monitor's Sector column and `?sector=`, Data & Refresh and Return & Drawdown read `companySectorIndex`, the three tiers Sector Composition uses |
| B-05 | realised in three values | the Monitor footer names its basis, window and the statements' own total; the stock page reads the book's realised, not the ledger's |
| B-06 | the money-weighted tile opened a page with another return | that page prints the tile's own rate, over the same accounts and window |
| B-07 | the whole-book return on cost, three rules | FIFO over the costed holdings on the tile, the allocation Total, `/holdings` and the Monitor footer, each naming its set ("on the ₹X of ₹Y that reports a cost") |
| B-08 | the Excel export differed from the screen | current holdings, the tab's own return with a Measure column, and what it leaves out named under the total |
| B-09 | Cash ₹11.6 Cr against ₹14.2 Cr on one table | the security axis's cash names its bridge to the Category view's Cash |
| B-10 | cash paid back ₹49.9 L against ₹58.7 L | Distributions counts each fund once, 360 ONE's letters included, from one build on Private Market and Morning CIO: ₹50 L → ₹57 L |
| B-11 | "HPR" meant two returns on the Monitor's two tabs | the Transactions return headers name their basis, the capital paid in |
| B-12 | the search said no statement reports funds the book holds | the note is withheld for a scheme the book holds, joined by ISIN |
| B-13 | the same class words over two sets | the left-out classes are named by the tables' own sections |
| B-14 | Helios Flexi Cap under two keys | **not fixed** — see below |
| B-15 | the assistant answered from another book | the chat reads the screen's book, its counts and Private Market's capital accounts |

**B-14 IS NOT FIXED, AND WHY.** Helios Flexi Cap Fund · Direct is two rows
because the AMC folio and the depository print the scheme two ways and the key is
taken from the name. Joining them is an identity change: the depository reader
would take the name the AMC prints against the same ISIN, and the eight such
ISINs `docs/BOOK-REPORT.md` lists would re-key the archive. Stage 10cc left fund
twins apart on purpose. It is a separate change.

**A QUOTE THE CORPORATE-ACTION CHECK HELD BACK SAYS SO (DL-9).** The Monitor's
price and Day cells, a statement line, a mandate share, the basis pill and the
top bar said "no live price" for a quote the gate had held back, as if none had
arrived. They give the gate's own reason now. Found in passing: a mandate share on a
statement mark carried no not-live flag at all. One branch has no subject on this
book, a mandate with some shares held back and some live; the harness's control
says so.

**What moved.** No generated file. On screen: Distributions ₹50 L → ₹57 L on
Morning CIO; Ajay's Family return +12.49% → +12.88% (current holdings); NAV &
Performance's FIFO +16.24% → +16.68%, Morning CIO's figure; the Excel footer
₹840.99 lower (five closed rows and six sub-₹1,000 rows left out, named).

**Guards.** Three new suites (`liveWithheld`, `monitorSectors`, `stockRealised`)
and cases in eight more; five new `check:pages` routes;
`scripts/dev/withheld-quote-bug.sh`, thirteen cases, each firing its own check.
Case 9 fired only after its patch was rewritten: TypeScript refuses `x || true`,
and a patch that does not build is not a result.

**Verification**, on this branch stacked on Stage 10ct and merged with `main`
at `f99e738a`: `build` · `test:ingest` (every suite passes; golden 140 passed,
2 not checked, 0 blocked) · `test:family` (67 suites, 3,186 checks, 0 failed;
its four not-checked lines are main's) · `check:family` **126/0** ·
`check:pages` **334 combinations clean**: 167 routes in two themes, Stage
10ct's 162 and this change's five. Of the 17 invariants not checked, 14 are
main's four claims with no subject on this book and 2 are Stage 10ct's
counted-once checks on `private-market-owners`. The last is this change's
held-back mandate branch: no mandate on this book has some shares held back and
some live · `build-book` twice, byte-identical · every `replay:*`,
`rekey:archive` and `reconcile:review` a no-op with `--check`.

### Stage 10cv — THE FIGURE AUDIT, PART C: EVERY FIGURE NAMES ITS DATE, ITS SET AND ITS BASIS

*"Audit every calculation on the dashboard and fix every logical error, so the
client never finds one."*

The C group of `docs/FIGURE-AUDIT.md`: twelve themes of a label or a basis that
did not describe its figure. No figure is re-measured here; what changed is what
the words beside each figure say. Stacked on Stage 10cu.

| | Was | Now |
| --- | --- | --- |
| C-01 | a mark dated by the book's newest date (29 Aug, two quantity-only demats) | each figure names the date its value is struck on; the basis pill splits statement, NAV and live |
| C-02 | three AIF categories no statement prints | read off the statements: Neo Infra's printed Category II is read, and Founders, India SME and Transition Venture print none |
| C-03 | coverage unstated | each total names the set and the share of it that reports |
| C-04 – C-12 | captions on Private Market, the Monitor, Transactions, search, Polycab, Extras, the stock and mandate pages, the Excel export, Family & Sectors | each describes the figure beside it, and a dash names its cause |
| CK-C5, DSM-C9 | two definitions of a side of the book, and of a mandate share's sector | one each (`SIDE_NOTE`, `companySectorIndex`) |
| XP-13 | every drill-down's footer counted the whole book's 5 closed rows and 6 specks | each counts its own set's (AIF 3 closed; Mutual Fund 1 closed, 4 specks) |
| XP-16 | Capital Gains' Lots total printed "7 of 51 accounts" | 212 lots, the bucket table's figure; the account count is its hover |
| VD-16, VD-18 | Sanshi and Carnelian Amritkaal marked at pre-tax NAV, and ABSL Liquid all pledged, with nothing on screen | said in a few words on the price tile and the Monitor's price cell, each held to its statement's own text (`statementNotes.ts`) |

**A CHECK THAT HAD NOT RUN SINCE STAGE 10ct.** Stage 10ct added a second
`"capital-gains"` key to `INVARIANTS`; an object literal keeps the later of two
keys, so Stage 10cp's missing-data band checks were dropped and nothing said so.
The two blocks are one, and `check:pages` now reads its own source and refuses to
run on a repeated key.

**CLAUDE.md said four funds printed a category they do not.** Seven passages
(Stages 10aw, 10bp, 10bw, 10cd) carry a correction note where they stood.

**What moved.** `glowData.ts`: the engagement strings of 3P, India SME ×3,
Founders ×2, Neo Infra and Transition Venture ×2; `BOOK-REPORT.md`: Delphi is the
only family-declared category. No total moves.

**Guards.** Five new suites in `test:family` (`statementNotes`, `valuedAt`,
`navCard`, `schemeMatch`, `mandateCapital`) and one in `test:ingest`
(`categoryWords`), cases in the existing suites, eleven new `check:pages` routes
and `scripts/dev/one-definition-bug.sh`, eighteen cases, each firing its own
check. Case 14 is the checker refusing to run on a repeated route key.

**Not fixed, and why.** Which NAV to value Sanshi at is the family's call (about
₹11 Cr lower post-tax). Capturing each demat line's pledged balance needs a reader
change; the one pledged line is named instead.

### Stage 10cw — THE FIGURE AUDIT, PART D: THE SMALL ONES, AND WHAT A COST IS

*"Audit every calculation on the dashboard and fix every logical error, so the
client never finds one."*

The D group of `docs/FIGURE-AUDIT.md`: the cosmetic items — a bare dash, a
rounding, a hover naming a column the table does not have — and two where the
words were right and the figure beside them was not quite. Stacked on Stage 10cv.

| | Was | Now |
| --- | --- | --- |
| VD-24 | Sanshi's cost was the statement's net of stamp duty, and a reader who paid ₹75 Cr read ₹74,99,62,501.87 | the cost is every rupee paid (`costBasisSource: "gross-paid"`); the statement's net and the charges are in the cell's hover. 3P's realised is struck on the same basis: ₹2,56,09,033.87 → ₹2,55,82,835.17 |
| VD-17 | ICICI's NSDL statement counts shares at 31 Mar and prices them at the 30 Mar close; the page named one date for both | the value is struck on the pricing day (`priceAsOf`, carried where the statement prints it), and the tile, the Monitor's price cell and each statement line name both |
| VD-25, XA-23 | a class switch's legs read as dated flows; capital no dated row carries was silent beside the rate it is missing from | the switch is not a flow; the missing capital is named beside the rate |
| DL-16, PM-D1 – D3 | Private Market figures that did not say what they divide by or round to | each says so, in its hover |
| FS-20, FS-23, FS-24, PC-11 | a fund's Sector read "Unclassified"; the bar tooltip called company-share value the entity's NAV | a fund says it has no sector; the tooltip names the value it draws |
| DL-17, DL-18, DSM-D4 – D9, MT-18, MSX-22/23, MH-17, MNT-20 – 25, SC-D1 – D3, XA-24 – 28, PC-12 | a bare dash, "2 manager's mandates", a hover naming a column the table does not have, an FX chip that did not say why it names no source, a nil price left blank in Excel | each dash names its cause, and each figure its unit and precision |

**What moved.** `glowData.ts`: five Sanshi folios' cost rises by what their
statements net out (₹78,746.09 in all; each return falls by 0.01 point), 3P's
realised as above, `priceAsOf` on 19 holdings and the ring-fenced Polycab row,
and `charges` on 42 dated capital moves (16 carry a charge, 8 a measured zero, and
18 are null because their statement prints no charges line). `BOOK_SUMMARY` does
not move. The Polycab report and store were regenerated by `npm run build-polycab`,
which now names its sources per table, and `docs/REVIEW-RECONCILIATION.md` by
`npm run reconcile:review`: the book's invested at cost reads ₹470.17 Cr, ₹0.01 Cr
up, from the Sanshi charges.

**THE MONITOR'S DATE CHECK COULD NOT PASS, AND THE FULL SWEEP SAID SO.** The only
rows priced on another day than their balances are ICICI's NSDL rows, and NSDL
prints a value and no rate, so they draw no ◦ marker to carry the date. The date
is on the price cell's own absence now. The check reads both dates and requires
the book's own pair, because a value dated at its balances' day printed "as of
31 Mar, priced as of 31 Mar" and passed the first version.

**Guards.** `grossPaid.test.ts` and `nsdlPriceDate.test.mjs` (new), cases in
twelve more suites, two new `check:pages` routes (`stock-gross`,
`sectors-direct-live`), and two harnesses, `scripts/dev/cost-date-bug.sh` (eight
cases) and `scripts/dev/txn-labels-bug.py` (eighteen), each case firing its own
check.

**Not done, and reported.** The Monitor's lakh rounding (MH-19) needs a change to
`format.ts` that moves every compact figure on the site; PM-D4, PM-D6 and the
LIVE_CELL wording are listed in the audit and left for their own change.

### Stage 10cx — THE FAMILY'S FIVE ANSWERS

*"1. both are separate investments · 2. keep them pre tax only by default,
whatever is in the review file we will follow the same rule and calculation
across the dashboard · 3. keep them unvalued for now · 4. check if the dates are
different and if the accounts holding are different or same, that would give
you an idea if they are separate holdings or same · 5. no, this needs to be a
normal holding, on the polycab page we will only show the shares held in the
company polycab and relevant information regarding polycab"* — the family,
28 Sep 2026, answering FQ-1 to FQ-5 of `docs/FIGURE-AUDIT.md`.

#### FQ-1 — both pairs are two investments, and every figure counts all four rows

| Fund | Accounts | Each |
| --- | --- | --- |
| 360 ONE Special Opportunities Fund Series 8 Class A3 | CRN37702 (Ajay), CRN60117 (Bharat) | 9,90,429.684 units |
| Transition Venture Capital Fund I Class A1 | TVC262 and TVC263, the two family trusts | 7,500 units, ₹1,71,45,962.25 |

- **`shared/separateInvestments.mjs` is the answer**, keyed on the
  `securityKey` and the accounts named, with its date. Check (c) still finds
  each pair, because the coincidence is a fact about the statements, but files
  it under `confirmedSeparate` and never groups it. `duplicateAifEarnings` does
  the same for the two 360 ONE Alternates income folios: two holdings earn two
  incomes. A third account reporting the same figures is a new question and is
  grouped exactly as before.
- **`npm run replay:dedupe` lands the answer on the committed archive** without
  the PDF passwords, the seventh faithful partial replay. It changed six
  documents (the May and June issues of both CRNs, and both trusts' statements)
  and only `dedupeGroup` and `alsoReportedUnder` on them. Its gate accepts a
  group untagged as a WHOLE, so an answer can be withdrawn: delete the entry and
  the replay puts the tags back.
- **`build-book` refuses a book where a named pair still carries a tag**, and
  names the rows and the command to run. It prints one note per decision, and
  one for an entry that matches no holding.

What moved. The listed side (₹699.76 Cr) and the ring-fence did not:

| | Was | Now |
| --- | ---: | ---: |
| Current value of holdings | ₹710.39 Cr | ₹713.56 Cr (+₹3,17,26,374.76) |
| Private value · holdings | ₹10.62 Cr · 4 | ₹13.79 Cr · 6 |
| Private cost · unrealised | ₹8.62 Cr · ₹2.00 Cr | ₹10.36 Cr · ₹3.43 Cr |
| Pooled private XIRR, 3 of 4 funds | 21.1% | 30.1% |
| Private Market still to call · committed | ₹15.23 Cr · ₹41.23 Cr | ₹15.98 Cr · ₹42.73 Cr |
| NAV series, last point | ₹140.17 Cr | ₹141.63 Cr |

The XIRR rises because Transition Venture (+128.61% in 165 days, shown as HPR
and unchanged) now carries both trusts' money in the pool.

- **A fund's "tranches" are its distinct call DATES, not its calls.** Both
  trusts paid ₹75 L on 17 Oct 2025, which is one purchase date. Counted per
  account, the methodology would have sent Transition Venture to an XIRR under a
  year and refused it. The note reads "2 calls on one date".
- **The count-once policy is still tested**, on a tagged copy of the book
  (`src/lib/__tests__/taggedPairs.ts`), because this book no longer exercises
  it and the next pair a drop brings would.
- **The family's own review agrees.** It carries both CRNs and both trusts as
  separate lines, each with its own purchase and closing. Its Transition
  Venture figure (₹2.26 Cr) is struck at the fund's 28 Feb valuation of
  ₹1,290.77 a unit and includes Ankita's own 2,500-unit lot, which no statement
  in the drop reports; the trusts' statements mark their units at ₹2,286.13 on
  31 Mar. `npm run reconcile:review` was regenerated: the 360 ONE line now ties
  exactly, and the residual moves −₹79.38 Cr → −₹76.21 Cr.
- **The ₹3.17 Cr in earlier stages records the book as it stood** and is left
  as history. The data-model section, §4c and the accounts table's footnote are
  in the present tense. `docs/EXTRACTION-REPORT.md` still lists both pairs as
  check (c) groups: only `npm run extract`, which needs the passwords,
  regenerates it.

#### FQ-2 — pre-tax by default, the review's rule, and no mark moves

Measured fund by fund, the review values each fund at the NAV its own statement
values the holding at, and so does the book. So no mark moves. Each fund's price
tile now names that basis (`src/lib/statementNotes.ts`, each note cited to text
in its statement's own `pages.json`):

| Chip | Funds | Why |
| --- | --- | --- |
| pre-tax NAV | Sanshi Fund-I, Carnelian Bharat Amritkaal | the statement values at a pre-tax NAV |
| pre-tax value | Baring PE Fund 6 | an unaudited pre-tax redemption value |
| post-tax NAV | Founders, Delphi, Buoyant | the only NAV the statement prints, so the default cannot apply |

- **Sanshi's note named the wrong thing.** It said the NAV is before tax. The
  statement's footnote says it is before the manager's annual performance fee.
  Corrected, and cited.
- **3P is the one fund where the review and the book differ.** The review uses
  its post-tax NAV and the book its pre-tax one. Every 3P class is redeemed to
  nil, so both read ₹0.
- **A NAV that did not move printed "+0.00%"** on the price tile (Helios). It
  prints "0.00%" now, through `fmtPct`, as the scheme card does.

#### FQ-3 — Ankita's Clean Max shares stay a quantity

*(Reversed at Stage 10dz: the family asked on 14 Oct 2026 for the shares to be
valued, and the live layer values them at the quote again.)*

`shared/keptUnvalued.mjs` names the row by its account and ISIN: 94,967 shares
on Motilal Oswal demat 1201090012838316, which the statement holds in its
lock-in + freeze balance with no rate. The row's reason says both what the
statement says and what the family decided, with the date. It values nothing,
and `build-book` names an entry that reaches no row.

Ajay's ICICI NSDL statement of 31 Mar also holds 94,967 Clean Max shares, as
"Pre IPO Shares", at ₹1,336.50 (about ₹12.69 Cr). Whether those are the same
shares moved is for the family to say. The book does not borrow that mark.

#### FQ-4 — the two DSP Gold marks

Two holdings, not one. Both carry ISIN INF740KA1SW3, both statements are dated
31 Jul 2026, and they are two members' own demats: Aarti's 1,195,000 units at
₹141.24 and Ankita's 205,000 at ₹151.10. One ETF has one price on a day, so at
least one mark is wrong. The scheme's own NAV on 3 Aug, the next business day,
was ₹137.73, on the statements' basis (before its 1:10 split). Aarti's mark is
2.6% above it and Ankita's 9.7%. The book keeps each statement's own mark. At
₹141.24, Ankita's lot would read about ₹20.2 L less; the rate is Motilal
Oswal's to explain.

*(Corrected at Stage 10cz, on the merge that brought this section in: neither
rate is a mark. A Motilal Oswal holding statement's rate is the price of the
lot's LAST DEPOSITORY MOVEMENT, and its value column is that price times the
units that moved then — ₹5,45,319.90 is 3,609 × ₹151.10 against Ankita's
205,000 units, and ₹1,95,62,022.48 is 1,38,502 × ₹141.24 against Aarti's
1,195,000. So "at least one mark is wrong" is "neither is a mark": both lots
are quantities with no value on the statement basis, and the live basis does
not value them either, because AMFI's NAV is struck on a unit basis the
depository's units are not on.)*

#### FQ-5 — not acted on

"this needs to be a normal holding" can be read two ways. One is the promoter
block joining the book, which would undo the ring-fence the family asked for.
The other is the Polycab page showing only Polycab's own shares and
information. Nothing changed, and the question is back with the family.

#### Checks

- New suites: `separateInvestments.test.mjs` (ingest), `separateInvestments.test.ts`
  and `keptUnvalued.test.ts`, and cases in `fundReturns`, `privateBook`,
  `privateMarket`, `statementNotes`, `marketSide`, `navSeries` and `searchIndex`.
- `check:pages` has two new routes, `stock-posttax` and `family-kept-unvalued`.
  `stock-aif-dual` walks the largest pair the family named: it walked the
  largest dedupe group, and this book has none now.
- `scripts/dev/family-answers-bug.mjs` puts 13 bugs back one at a time, after a
  clean control. Every one is caught:

| # | Bug put back | Caught by |
| --- | --- | --- |
| 1 | the answer never reached the archive | `build-book` refuses; `replay:dedupe --check` exits 1; 4 ingest checks |
| 2 | …and `build-book`'s guard removed | 25 suite checks, and PM-C7 on the page |
| 3 | the duplicate policy ignores the answer | the replay; 15 ingest checks |
| 4 | the replay's gate judges one holding, not its whole group | 1 ingest check |
| 5 | a fund row says its pair is pending an answer | 1 page check |
| 6 | a post-tax-only fund labelled pre-tax | the page check on `stock-posttax`. The suite passes by design: Founders' note names both bases |
| 7 | Sanshi's note back to "before tax" | 1 suite, 1 page |
| 8 | the price tile loses its basis chip | 2 page checks |
| 9 | the reason stops naming the decision | 1 suite, 2 page |
| 10 | the reason drops what the statement says | 1 page check. The suite passes by construction |
| 11 | the decision matched on the ISIN alone | 1 suite |
| 12 | the Family & Entities line loses its hover | 3 page |
| 13 | the table's account number drifts | 2 suite, 6 page |

**THE OLDER HARNESSES WERE RE-RUN WHERE THE ANSWER TOOK THEIR SUBJECT.**
`pm-table-bug.sh` cases 4, 5 and 22 still fire: `grouping` also decides how
capital is attached, so the counted-once path still has something to break.
Its case 6 had reported NOT A RESULT since Stage 10ct, when the line it patches
changed; re-anchored, it fails 27 page checks on 6 routes and the suite's
capital checks.

**FOUR CASES LOST THEIR SUBJECT, AND SAY SO.** `pm-prose-bug.sh`'s two
"Counted once" cases and `monitor-tree-bug.sh`'s cases 4 and 5 break the line
that takes a counted-once holding back out of its rows. This book draws no such
line now, so each sweeps clean, and each is annotated "NO SUBJECT ON THIS BOOK
SINCE Stage 10cx" rather than deleted: the next pair a drop brings gives them
one again. Two of their anchors had gone stale in the audit's own PRs, and were
re-anchored, so a clean sweep is the bug applied and not a patch that never
landed. The count-once policy itself is still exercised, on the tagged copy of
the book above.

#### Merged with main (#104, #105)

Main moved while this was verified. Neither PR wrote a stage section, so
`10cx` is still the next free letter, compared as headings against main's tip.

- **One conflict**, in `searchIndex.test.ts`: both sides fixed the same check
  for an account whose schemes carry NAVs of different dates. This branch's
  version asserts the exact span the row prints, and is kept.
- **The probe literal merged without a marker** and was read: 120 keys, none
  duplicated, every one declared.
- **#105 moved five capital checks by their NAMES, and two of them had been
  renamed here.** #105 took Uncalled capital and Distributions off Morning
  CIO's default strip. It moved the five checks that read those tiles to
  `cio-return-metrics`, which draws them, by listing their exact text in
  `CIO_OPTIONAL_CAPITAL_CHECKS`. This branch had reworded two of those checks
  for the family's answer, so after the merge both ran on `cio-allocation`,
  where the tiles are not drawn, and failed there. The set now carries the new
  names, and a name that matches no check throws. That was proved by putting an
  old name back: the sweep stops and names it. It is Stage 10cl's lesson again:
  a filter over prose is a filter a rename can move.

#### Verification

On this branch merged with main at `58c6f3d5`:

- `build` · `tsc` · `test:ingest` (every suite passes; golden 140 passed, 2 not
  checked, 0 blocked) · `test:family` (0 failed; its four NOT CHECKED lines are
  main's) · `check:family` **126/0**.
- `npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
  byte-identically. `replay:dedupe`, `replay:calls`, `replay:flows`,
  `replay:owners`, `replay:movements`, `rekey:archive` and `reconcile:review`
  are each a no-op with `--check`.
- `check:pages` walked **372 combinations** and found 15 with a finding. One
  was this branch's: `cio-allocation`, the renamed checks above. It sweeps
  clean now, and so does `cio-return-metrics`, where those checks run.
- **The other 14 are main's.** The same 14 routes fail the same invariants on a
  build of main alone (`58c6f3d5`), walked for this record. Each walks the live
  quote layer or its absence, which #104 changed, or Morning CIO's strip, which
  #105 changed: Morning CIO's movers, cached, filling, live, alerts and index
  routes, `monitor-withheld` and its loading twin, `performance-live`,
  `sectors-direct-live`, `corporate-actions-live` and `stock-sold-after`. They
  are named here and not fixed. They are those changes' checks, and rewriting
  them in this merge would be a change nobody asked for. *(Stage 10cz fixed the
  fixture dates that failed eight of them, and Stage 10dc the six Morning CIO
  routes left over.)*

**Then main gained one daily Polycab refresh (`ddb7170d`)**, which touches no
file here. On that tree `build`, `test:family` (0 failed) and `build-book`
(byte-identical) were re-run, and the three Polycab routes and this change's
own routes walk clean: 20 combinations. One abstention is new and is the
refresh's: it kept only the six quarters tickertape carries, each with a pledge
figure, so `polycab-promoter` has no dashed pledge to check.

### Stage 10cy — WHAT A STATEMENT GIVES IS ON THE SCREEN, AND A PDF SAYS WHAT IS NOT

*"We need to make sure that we are not missing out on any data that the
statement has already given us, otherwise they will be really angry on us."* ·
a client PDF of what is missing and what to send, *"very simple, very
straightforward, short, concise and precise"* · then *"fix those gaps on the
dashboard first"*.

(Written as `10cx`: `10cu`–`10cw` were reserved by Stage 10ct for the figure
audit's parts B, C and D. Main's #107 — the family's five answers — then merged
under `10cx` first, so this is `10cy`. Compared as HEADINGS against main's tip.)

#### 1. The client PDF

`docs/client/Glow-Ventures-missing-statement-data.pdf`, seven pages. Each
section shows the family's own statement beside the dashboard and names the one
document that would fill the gap:

*(Stage 10cz added a section on the Motilal rate, as section 2, so the PDF is
eight pages now and its no-cost count is 65. The table below is the seven-page
version this stage built.)*

| Section | What it says |
| --- | --- |
| 1 | 41 review lines at ₹231 Cr are on no statement they sent. Example: BSE Ltd. Most sit on Ajay's demat 1201090012539150 (a transaction statement only) and his HDFC Bank demat (no statement at all) |
| 2 | 69 holdings show a value and no cost. A depository holds shares and does not record what was paid |
| 3 | 7 of 10 PMS accounts and the demats start on 1 Apr 2026 |
| 4 | Holdings shown as a unit count only |
| 5 | Six questions for the family |
| 6 | Statements dated 31 March 2026 |
| 7 | 29 private investments (₹48.69 Cr paid) on no statement |

**THE REVIEW IS QUOTED, NEVER USED.** Every review figure in the PDF is marked
as the review's, with its 30 June date. That is the cross-check standing
`reconcile:review` already has. Nothing in the PDF reaches the book.

#### 2. The gaps that were ours, and are fixed

Writing the PDF meant checking every "missing" figure against the statements
themselves. Five were not missing. A statement had them, and the dashboard did
not show them:

- **THE REST OF AJAY'S TRANSACTION-ONLY DEMAT.** Stage 10ce valued the cash
  funds on 1201090012539150 and named the rest as not valued. Its own section
  says widening the gate "is one line, and it was offered rather than taken".
  The family asked for it, so it is taken now:
  - **The five other mutual funds** are valued at the depository's closing
    units × AMFI's NAV, on the LIVE basis only. That is ₹84.08 Cr on the NAVs
    of 24 Sep: Bandhan Large & Mid Cap ₹31.58 Cr, ICICI Equity Savings ₹23.38
    Cr, ICICI India Opportunities ₹18.75 Cr, Kotak Multicap ₹9.02 Cr and Kotak
    Large & Mid Cap ₹1.36 Cr. They sit behind their own switch,
    `VALUE_DEPOSITORY_FUND_UNITS`. An ETF there is still refused, because its
    units and its NAV can be on different bases.
  - **Six listed shares** — IFB, Insolation, MPS, Nuvama, Onesource and Vedanta
    Aluminium — are valued at the live quote, and only while the feed prices
    them. A share the feed has not priced is not a row. That is
    `src/lib/depositoryShares.ts`. The NSE symbol comes from a same-ISIN book
    position, the book's own map or Upstox's instrument for that ISIN, and all
    that answer must agree. It never comes from a name.
- **LISTED SHARES A HOLDING STATEMENT PRINTS NO USABLE PRICE FOR.** Clean Max
  on Ankita's Motilal demat is printed at rate 0.000. ESDS on Ajay's ICICI NSDL
  account is printed at face value only. Both are valued at the live quote the
  same way (`kind: "no-price"`). Their accounts DID send a holding statement,
  so neither account is marked "partly valued". *(Clean Max on Ankita's demat
  is no longer valued: on 28 Sep 2026 the family asked to keep it unvalued —
  main's Stage 10cx, FQ-3 — and the live layer refuses it by the same table,
  gate 6 in `depositoryShares.ts`. See Stage 10cz's merge notes. ESDS is still
  valued.)*
- **THE BALANCES NOTHING CAN VALUE ARE LISTED.** Family & Entities opens a
  partly valued account into each balance nothing values, with its units and
  its reason. Before, it gave only a count. `displayDepositoryName` takes off
  CDSL's `ISSUER#INSTRUMENT` wording, and it only ever removes words.
- **HELIOS AND ACTIVE MOMENTUM PRINT THEIR PURCHASE.** The AMC statements show
  the date, the gross, the stamp duty, the net, the allotment NAV and the
  running units. The reader walked past that row, so "Invested on" was a dash.
  `mfPurchaseFlows` in `altFundStatements.mjs` publishes the row only if four
  checks tie:
  - gross less stamp duty is the net;
  - the net is units × NAV;
  - the running units reach the printed balance;
  - the last balance is the summary's units.

  `npm run replay:flows` lands it without the passwords. Each tranche is
  costed at the GROSS, because these statements' own cost column counts it
  (Sanshi's counts the net and keeps it). `mfPurchase.test.mjs` breaks each
  check once.
- **FIVE DRAWDOWN FOLIOS ARE DATED FROM THEIR CALLS.** They are Baring,
  Carnelian Bharat Amritkaal, Delphi and both Founders folios.
  `callDatesByHolding` is a third tier for "Invested on", after a lot
  register's date and a fund's own allotments. It applies only where all three
  hold:
  - the account's one line with money in it is that AIF;
  - the paid-in covers every call;
  - nothing is called and still unpaid.

  So an account's funding date never stands in for a share a manager bought.

`BOOK_SUMMARY` does not move by a rupee. Every valued row above is live-only,
and the statement basis never carries it.

#### 3. The review-gap note was denying what statements report

Stage 10bu's note says *"on the consolidated review · no statement reports
it"*. That is a claim about the STATEMENTS, and it was false for lines a
statement reports under a spelling no name rule reaches. It was also false for
lines this book does not value. Measured, main made that claim on **33** review
lines. It makes it on **16** now:

- **Five** are the other funds on Ajay's demat, now valued.
- **Eight** are reported by a statement and joined through the hand-checked
  ISIN table:
  - IFB, NLC and Zepto, on the same demat. Zepto's preference shares convert
    into equity on 22 July, so both ISINs are the line.
  - Liquid BeES, HDFC and ICICI Pru Balanced Advantage, ICICI Pru Liquid and
    WhiteOak, on the other three demats.
- **Four** are HOPE INDIA TRUST cash lines. That trust's own folio statements
  report them, and this book keeps the trust out by decision
  (`REVIEW_LINES_KEPT_OUT`).

The note is now keyed on the statements (`STATEMENT_REPORTED`), not on what the
book values. So switching a valuation off does not bring the sentence back.
`reviewGaps.test.ts` holds every entry to its witness: the statement's balance
on the review's own date, 30 June 2026. `check:pages` derives the reported lines
itself, from the workbook and the statements, never by importing the table.

**THE CHECK'S OWN GUARD IS LOAD-BEARING.** Joined on units and holder alone, a
round number of shares ties the review's Deepak Fertilisers to unrelated
holdings. The check then demands silence on a line nothing reports. Dropping
the guard makes the check fail on a correct page, and case 16 below shows it.

#### 4. What is still not valued, stated

**NLC India, 32,000 shares on Ajay's transaction-only demat, is the one listed
balance there nothing values.** No NSE symbol for its ISIN is in either
committed map. Upstox's instrument list and NSE's masters were unreachable from
this session (HTTP 403 at the proxy), so `build-upstox-instruments` could not
add it. Family & Entities names it with that reason. The next run of the
builder where those hosts answer should fill it, with no code change.

A local preview has no quote feed, so the eight live-priced shares do not
appear there. The checks re-express the rule off the committed data rather
than wait for a feed.

#### 5. Verification

`scripts/dev/absent-name-bug.sh` now has 17 cases, 7 of them new. It ran in a
separate worktree on its own preview after a clean control, and **every case
fires its own check**. The new ones:

| Bug put back | Fires |
| --- | --- |
| the ISIN table forgets Zepto | the statement-reported check |
| the ISIN table forgets WhiteOak | the same check |
| the note keyed on what this book values again (the original defect) | page + suite |
| the kept-out folios ignored | page + suite |
| the statement rule wired to nothing | 4 page checks + 20 suite checks |
| the check's round-number guard dropped | the page check fails on a correct page |
| the suite's witness read on each closing's own row date | the suite, on Zepto |

The call-date tier was removed from each half, the page and the check, and each
removal fails. On the tree merged with main at `40dc9992`:

- `build` and `tsc` pass;
- `test:ingest` passes (golden 140 passed, 2 not checked, 0 blocked;
  `mfPurchase` 18);
- `test:family` passes, 0 failed. Its NOT CHECKED lines are main's own;
- `check:family` passes, **126/0**;
- `npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
  byte-identically.

### Stage 10cz — THE MOTILAL "RATE" IS THE PRICE OF THE LAST MOVEMENT, NOT A MARK AND NOT A COST

*"I can see in the statement screenshots that you have attached... rate column
is given... no. of shares is given and the value of the holding... check if
there is a possibility that these rates are the avg cost of the holdings rather
than the current prices... Do a thorough audit and tell me the final
conclusion. If there are logical errors like this one, then find and fix them
from the root cause."* · *"continue and make me the final pdf for the missing
data on the dashboard in the same way as previous one"*

(Written as `10cy`: `10cu`–`10cw` are the figure audit's parts, `10cx` is main's
#107 and `10cy` this branch's own earlier stage, so this is `10cz`. Compared as
HEADINGS against main's tip.)

#### 1. The conclusion: neither — and the book had it wrong for 43 rows

**THE RATE IS THE PRICE OF THE HOLDING'S LAST DEPOSITORY MOVEMENT, AND "VALUE" IS
THAT RATE × THE UNITS THAT MOVED THEN.** Measured on the Motilal CDSL holding
statements against the same accounts' own transaction tapes, 46 rows carry a
rate (43 in the book, 3 on the excluded 32387399):

| | rows |
| --- | ---: |
| the rate and value tie to the last receipt or delivery on the tape | **24** — 9 the whole balance, 10 part received, 5 deliveries out |
| the holding did not move on the tape, so nothing contradicts it | 22 |
| contradicted | **0** |

Axis Bank on Ankita's 316: 7,300 shares, rate ₹1,368.25, printed value
₹21,33,101.75 = **1,559** × 1,368.25 — the 1,559 shares received on 2 Jul 2026.
Bharat's ICICI Pru Nifty Next 50: printed ₹2,89,85,295.60 = 4,79,889 × 60.40,
against the 0.048 units he holds today.

**SO "WHICH COLUMN TO BELIEVE" (the demat section above) WAS ANSWERED WRONGLY.**
It kept quantity × rate as the primitive and called the printed value broken.
Both are last-movement figures; neither is a mark on the statement date. The
book valued the 43 rows on 316, 320 and 335 at **₹102.16 Cr**; the value column
sums to ₹58.51 Cr; neither is what the family held on 31 July.

#### 2. The fix, at the root

- **`motilalDemat.mjs`** carries the rate and value as `lastMovementRate`,
  `lastMovementValue`, and dates them from the tape — never as a market price.
  `npm run replay:demat-holdings` lands it without the passwords (`--check` is a
  no-op); `npm run report:extraction` regenerates the extraction report from the
  archive.
- **`build-book`** makes those rows quantity-only (`BOOK_UNVALUED_HOLDINGS`,
  98 entries, each naming the last movement's date, side and price). The three
  demats hold no statement-basis position, each with a `noPositionsReason`.
  **Statement book ₹710.39 Cr → ₹608.23 Cr, 371 → 328 positions.** *(On
  main after #107's FQ-1 the book starts at ₹713.56 Cr, so the merged tree
  reads **₹713.56 Cr → ₹611.40 Cr** — the same ₹102.16 Cr, and private
  ₹13.79 Cr as on main.)*
- **The LIVE layer values what can honestly be valued** (`depositoryUnits.kind:
  "last-movement"`): 22 funds and ETFs at AMFI's NAV (₹50.42 Cr against a
  printed ₹44.89 Cr; four are specks under the ₹1,000 floor), 16 listed shares at
  the live quote only, the 3 DSP Gold/Silver ETFs NOT valued (units and NAV on
  different bases — the basis gate), 2 unlisted lines at face value ₹1 as
  quantity-only. The ETF allocation bucket is empty on the statement basis, so
  Morning CIO draws five rows.
- **`src/lib/recordedHoldings.ts`** files every recorded line under the key the
  live layer would use (`homeKey`), so a line and the same line once priced are
  one company. The company page, search and an empty search say *"recorded by a
  statement, not valued"* rather than *"fully exited"*; a recorded-only fund
  (the DSP ETFs) is drawn as a fund; the tax card and the quantity table stop
  treating those accounts as holding nothing.
- **THE LOOK-THROUGH JOINS RECORDED COMPANIES** (`lookthroughCompanies`), read
  by `useStockExposure` and the suites alike. Without it Ankita's 4,875 Kaynes
  stood as `kaynes-technology-india` until a quote arrived and as
  `kaynes-technology` after — one company under two keys decided by whether the
  feed answered. A recorded company's row and pick-list option wear the family's
  own statement name (`recordedLabel`); a held-elsewhere line gives the recorded
  line's own reason (`recordedLineFor`).
- **Five builders** (fund NAVs, Upstox instruments, screener sectors, scheme
  names, look-through) read the recorded lines. Their hosts were blocked from
  this session, so their outputs were NOT regenerated; the next run fills them.
- **Today's movers waits on every depository share candidate** in its scope,
  which this change made larger.

Holdings with a value and no cost on the live dashboard: **65** (was 69, and 66
until main's #107) — Ankita 316 20, Ajay 12539150 16, ICICI NSDL 12, Bharat 320
10, Aarti 335 6, LKP 1. Clean Max is two holdings — 94,967 on Ajay's ICICI NSDL
and 94,967 on Ankita's 316 — which is the review's 1,89,934. Ankita's is a
quantity with no value since the family's answer of 28 Sep 2026 (Stage 10cx,
FQ-3), so it has no value to be costless and left this count. Stage 10bm's "split marks" on these demats
are last-movement prices. The ICICI NSDL value column ("Prices as on
30-Mar-2026") IS a mark, and LKP and HDFC NSDL were audited and are unchanged.

**NOT FIXED, AND NAMED:** the depository windows for the private AIFs TOCF-I and
VOF-I on 316 are keyed on the transaction statement's spelling.

#### 3. The client PDF

`docs/client/Glow-Ventures-missing-statement-data.pdf`, eight pages, same layout
as Stage 10cy's. New section 2 shows the three statement images, four funds'
printed value against today's, and what the dashboard does with the 43 rows;
the ask table gains a valuation report or CDSL CAS for 316, 320 and 335; the
no-cost count is 65; section 5 adds the DSP ETF and face-value lines, and
Ankita's Clean Max kept without a value, as the family decided on 28 Sep 2026.
Every review figure is still the review's and reaches no total.

#### 4. The checks

Each derivation the checker re-expresses (`recordedHomes`, `heldAccountRows`,
`SOLD_ELSEWHERE` with its recorded owners, `M2_BOOK`, `SECURITY_AXIS_BOOK`'s
joinable set) follows the recorded lines; the walk waits for the look-through
before it looks for a derived row; the category pick-list asserts the recorded
company is offered where it is a row and NAMED by the empty note where it is not;
`FILTER_BOOK` is derived on names. **The two A-02 clubbed-row checks on
`monitor-security` now ABSTAIN** — no company in the statement book is held
through a costed and an uncosted line, because ICICI Bank's uncosted 14,500 on
316 is a recorded line. With a live quote it is a row again and `clubbedFigures`
still strikes it correctly; a live-mocked route to keep the check a subject is
the named next step.

**THE SEARCH CHECK LEARNT THE RECORDED STATE.** It required a ₹ figure on every
holding row not redeemed; with no live quote, Ankita's 4,875 Kaynes is found
from the demat's own line as "Not valued · 4,875 units", correctly with none. A
holding row with no figure must now be recorded and not valued, struck on the
BOOK: its key a company `recordedHomes` names (`RECORDED_HOME_UNITS`), its units
the statements' own sum, and no ₹ at all. `absent-name-bug.sh` cases 18–20 put
the last movement's price back, drop the units, and have a valued holding say
"Not valued"; each fires.

**#104 FIXTURES.** Main's #104 discards quotes dated before today, and the
checker's live fixtures were dated 13 Aug, so every live route read an empty
feed. This branch stamps quotes, indices and the capture with today's IST date.
**MEASURED ON MAIN, NOT ASSUMED**: main's own build at `ddb7170d`, swept with
only these fixture dates applied, fails the same 11 invariants on the same six
Morning CIO routes as this branch — #104's movers coverage, gap and gainer
counts on `cio-live`, the capture-lag claim, the no-feed and scope claims on
`cio`, and an on-face sentence ("Share counts await verification…") breaking
Stage 10cp on five routes. They are main's and are left to it. *(Fixed at
Stage 10dc: five of the 11 were that sentence and the coverage line breaking
Stage 10cp, and six were checks #104 had outrun.)*

`build` · `tsc` · `test:ingest` (golden 140, 2 not checked, 0 blocked) ·
`test:family` 0 failed · `check:family` **126/0** · `build-book`
byte-identical · every `replay:*`, `rekey:archive` and `reconcile:review` a
no-op with `--check`.

#### Merged with main's #107, and one of the family's answers overruled this branch

**#107 — the family's five answers — landed while this waited, and took
`10cx`**, the letter this branch's statement-gaps stage held. Main keeps it;
this branch's two stages are `10cy` (what a statement gives is on the screen)
and `10cz` (this one). The headings were compared against main's tip: the merged
file differs from main's by `10cy` and `10cz` alone, and main's ten historical
duplicates are unchanged. Every line naming a moved letter was placed by which
side's own copy carries it before any moved, and the code comments naming this
branch's two stages moved with them.

**FQ-3 OVERRULED THIS BRANCH, AND NO CONFLICT MARKER SAID SO.** Stage 10cy valued
Ankita's 94,967 Clean Max shares — printed at rate 0.000 on demat
1201090012838316 — at the live quote (`kind: "no-price"`). The family answered
on 28 Sep: *"keep them unvalued for now"*, and main's `shared/keptUnvalued.mjs`
records it for the book. Main has no `depositoryShares.ts`, so the answer
reached `build-book` and not this branch's live layer: merged as it stood, the
statement basis would have kept the shares a quantity while every live page
valued them at about ₹13 Cr.

- **`unpricedStatementShareCandidates` has a sixth gate**: a row the family
  decided to keep unvalued is not a candidate, keyed on the same account and
  ISIN through `keptUnvaluedFor`.
- **The checker's `DEPOSITORY_SHARE_BOOK` re-expresses it** by reading
  `KEPT_UNVALUED`, never by importing the helper.
- **`fundNavs.test.ts`'s Clean Max case is inverted and load-bearing**: the same
  row moved onto Aarti's demat IS a candidate, and the real one is refused.
  Removing gate 6 fails both checks; restored, all 84 pass.
- **No page check can see gate 6, and that is by construction, not a gap in
  one.** The live fixture quotes a symbol only at its own statement mark
  (`MARK_BY_SYMBOL`, a position's `currentPrice`), and Clean Max's only other
  row — Ajay's ICICI NSDL — prints a value and no rate. So no walk ever prices
  `CLEANMAX`, and with no quote the row is not a candidate either way. Measured:
  with gate 6 removed, `cio-live` and `family-kept-unvalued` report exactly what
  they report with it. The suite is the check.
- Ajay's ICICI NSDL Clean Max (the statement's own 30 Mar mark) and ESDS are
  unchanged.

**FQ-4 IS SUPERSEDED BY THIS STAGE**, and both copies of it now say so — a note
under FQ-4 in Stage 10cx and one under the answers table in
`docs/FIGURE-AUDIT.md`. Neither DSP Gold rate is a mark: ₹5,45,319.90 is
3,609 × ₹151.10 and ₹1,95,62,022.48 is 1,38,502 × ₹141.24.

**FQ-1 moves the book by ₹3.17 Cr on both sides of it.** The merged statement
book is ₹611.40 Cr — main's ₹713.56 Cr less this stage's ₹102.16 Cr — over 328
positions, with private ₹13.79 Cr as on main.

**Five files conflicted, and none was spliced by hand:**

- **`scripts/build-book.mjs`** — main's `keptUnvaluedFor` / `keptUnvaluedReason`
  decide first, then this stage's last-movement reason chain, so a row the
  family kept unvalued names their decision rather than its last movement.
- **`src/data/glowData.ts`, `docs/BOOK-REPORT.md` and
  `docs/REVIEW-RECONCILIATION.md`** — regenerated from the merged archive by
  `build-book` and `reconcile:review`, then run again byte-identically.
  `reviewGaps.ts`, `REGISTER-RECONCILIATION.md` and the extraction report were
  regenerated by their own builders too.
- **This file.**

Two more merged without a marker and were read, which is when this file says to
check by hand:

- **`check-pages.mjs`** — the probe literal is the exact union, 123 keys, none
  duplicated; #107 added none. Its two new routes, `stock-posttax` and
  `family-kept-unvalued`, run on the merged tree.
- **`statementNotes.test.ts`** — main's new pre-tax / post-tax case reads
  `BOOK_POSITIONS` and this stage's reads `LIVE_POSITIONS`, so the import names
  both.

**VERIFIED ON THE MERGED TREE** (main at `5858f24f`): `build` · `tsc` ·
`test:ingest` (golden 140 passed, 2 not checked, 0 blocked) · `test:family` 0
failed · `check:family` **126/0** · `build-book` byte-identical · every
`replay:*`, `rekey:archive`, `reconcile:review` and `replay:dedupe` a no-op with
`--check`.

`check:pages` walked **370 combinations, and 6 have a finding — none of them
this branch's**. All 11 failing invariants are main's #104 checks on six Morning
CIO routes (`cio`, `cio-index-loading`, `cio-cached`, `cio-live`,
`cio-live-capture-lag`, `cio-alerts-badge`), the same 11 this stage records
measured on main's own build at `ddb7170d`. #107 changed none of those checks and
none of the movers code they read, so they fail on `5858f24f` for the same
reason. This branch's last sweep before the merge had a seventh finding, on
`search`, which is now fixed. *(The 11 were fixed at Stage 10dc.)*

26 invariants were not checked. Each was read out by name and set against main's
own build at `5858f24f`, walked for this record with only the fixture dates
applied:

- **11** are the money-weighted-tile claim, one per Morning CIO route: main's
  #105 strip leaves that tile off its default.
- **10 abstain on main too**: the two Private Market cost lines (every private
  holding reports a cost), the redeemed-account line on `private-market-folios`,
  the counted-once line and #107's pending-pair line on `private-market-owners`,
  the Polycab pledge line (main's daily refresh), `monitor-withheld`,
  `mandate-trades-realised`, `history` and the not-found crumb.
- **5 are this branch's, and each is a consequence rather than a failure**:
  - the A-02 clubbed-row checks on `monitor-security` (×2), named above;
  - A-03 on `monitor`: no statement-basis security outside a mandate is marked
    at two prices any more;
  - VD-14 on `monitor`: Stage 10cy's call-date tier dates every holding in a
    call-dating fund, so none is left to say why it has no date;
  - `cio-movers-funds`: on main the DSP Gold and Silver ETFs are rows of that
    card, on the look-through store's 9 Sep NAV, an older day than the heading.
    Here they are recorded and not valued, so every priced scheme publishes on
    one day.

  Main's build walks all five of those routes clean with no abstention.

#### …and merged once more, on the family's go-ahead

Main moved by seven commits while the PR waited: two fund-NAV refreshes, a
Polycab refresh, three harvests and #106 (a client-data Excel template in
`templates/`, which nothing in the app reads). None touches a file this branch
changes or any code — the refreshes rewrite `src/data/fundNavs.ts`,
`src/data/polycabLive.ts` and `public/series/` — and main added no stage
heading. The merge had no conflict.

On that tree (main at `ac819761`): `build`, `test:ingest`, `test:family`,
`check:family` **126/0**, `build-book` byte-identical, every replay a no-op, and
CI and Cloudflare green. `check:pages` walked 370 combinations: the same 6
routes and the same 11 main checks as above, and **25** not checked. The one
that left is the Polycab pledge line: main's refresh brought back older quarters
with no pledge figure, so the dashed-pledge check has a subject again, and it
passes.

### Stage 10da — THE SEPTEMBER 2026 DELIVERY: ASK, MARATHON, BUOYANT'S 31 AUG SNAPS, AND EVERY SPREADSHEET A WITNESS

*"Every single file in this zip folder needs to be integrated in the dashboard.
Make sure there are no mistakes while integrating this data and make sure every
single file is integrated into the dashboard and nothing is missed."* — the
client's `Jaisinghani_Reports.zip`, committed as `source/september-2026/`.

**EVERY FILE IS ACCOUNTED FOR, AND `npm run coverage:source` SAYS SO.** 361 leaf
files across all eight deliveries: 277 read, 4 read through a byte-identical twin,
**18 read as witnesses**, 2 held out by decision, 58 macOS resource forks, 2
password notes, and **0 unread**. The forks are now counted from each ZIP's own
directory rather than from what is on disk, because the unzipper skips them and
Stage 10bb found that the count then depended on who unzipped.

#### What the delivery added

| | Accounts | In the book |
| --- | ---: | --- |
| ASK Investment Managers — PMS | 10034025 (Ajay), 10032723 (Ankita) | closed mandates; a bank balance of ₹0.34 and ₹0.01 that the ₹1,000 floor drops |
| ASK Absolute Return Fund | 9039917111 (Ajay), 9039917144 (Ankita) | every series redeemed to nil, a MEASURED ₹0; realised ₹80.39 L and ₹59.09 L |
| Marathon Trends Advisory — PMS | 5110837 (Ajay), 5110758 (Ankita) | no holdings statement — dated statements only, so no value |
| Buoyant 31 Aug Portfolio Snap Reports | 103473, 103472 | both folios at the 31 Aug NAV: ₹50.33 Cr and ₹28.27 Cr |

The book is **57 accounts** and **₹613.01 Cr**: ₹611.40 Cr after Stage 10cz, plus
Buoyant's move from 31 Jul to 31 Aug. ASK and Marathon add no value, because they
hold nothing today or send no holdings statement.

#### The readers

- **ASK and Marathon PMS** run on the shared reporting system, read by
  `pmsStatements.mjs`. Their profit-and-loss account is a new report type, and
  `profitLoss.test.mjs` covers it.
- **The ASK Absolute Return Fund statement** (`altFundStatements.mjs`) is
  published only where its Account Summary ties to its own Total row, and its
  Transaction Summary walks each series' units to the balance the summary prints.
  Gross less tax must be the printed net, and a redemption must be units × NAV.
  Any failure withholds the dated record and names why.
- **ASK's account statement names the day each series was issued** (`seriesIssued`).
  A class whose first allotment falls on that day reaches inception, which is how
  both folios publish a realised gain.
- **Buoyant's Portfolio Snap Report** is read only where page 3 restates page 1:
  the units × NAV, both Total rows, each class's cost and value, and the
  Investment Summary adding to the Current Value on the statement's own date.
  Precedence takes the newest of the appraisal and the snap. Its fund holdings
  and TWRR are archived only where they read whole, and a table withheld now
  says so (`snap-section-not-read`).
- **Every XLSX and CSV beside a PDF is a WITNESS, not a document.** Its rows are
  archived (`twinOf`) and every figure is checked against the PDF: **36,208 of
  them**. `build-book` sets witnesses aside, which removed 18 false "superseded"
  lines from `docs/BOOK-REPORT.md`. `sheet.mjs` strips a UTF-8 byte-order mark as
  bytes before decoding, so the Latin-1 fallback can never keep it.

#### Three corrections the delivery forced

- **Lots met no sale.** ASK's and Marathon's capital-gain statements strike a sale
  at the consideration less brokerage, before STT, and clip names the tape spells
  out, so 36 lot groups met no sale. Pass 3 in `shared/lotSettlement.mjs` joins
  them on that figure, within the precision of the four-decimal rates, and only
  where the match is unique from both ends. The five lots that stay unsettled
  sold for ₹0 (fractions a demerger or bonus left), −₹558.94 together. The
  Transactions footer names them beside the statements' own total.
- **A glued ISIN went unsplit.** The `IN9` form is a partly paid-up share. It is
  now split off the name, so Bharti Airtel PP's ISIN stops being glued onto 95
  lots' names.
- **The tax estimate taxed every year since inception.** ASK's and Marathon's
  windows run from inception, so the tile read ₹2.00 Cr. The estimate now taxes
  the financial year the newest window closes in, **₹24.19 L**. Earlier years'
  gains are named in the hover and never taxed.

#### Checks moved by the delivery

- `holdings-book` no longer counts ASK's two closed mandates, now that the closed
  test and the floor are applied.
- The value bridge strikes "since inception" on or before, as `build-book` does.
  ASK's profit-and-loss account runs from 1 Apr 2019, before either mandate opened.
- The early fiscal-year window abstains, with the evidence, where no year ends
  before the tape begins. ASK's tapes run from 26 Jul 2019.
- The suites built on Buoyant's old empty cash line are re-anchored on the 31 Aug
  snaps, each with a constructed case that still fails on the old defect.

#### Tests, and what the bug passes proved

| Suite | Checks | Bugs put back | Caught |
| --- | ---: | ---: | ---: |
| `askArf.test.mjs` | 87 | 20 reader bugs | 20 |
| `buoyantSnap.test.mjs` | 123 | 18 reader bugs | 18 |
| `sheetWitness.test.mjs` | 291 | 13 witness bugs + 2 BOM bugs | 15 |

**THREE OF THEM FIRST CAME BACK CLEAN OR CRASHED, AND EACH FOUND A GAP IN THE
SUITE.**
- Two snap cases made the reader throw rather than refuse. A throw ended the suite
  with no failing line. `read()` now catches the throw and the claim fails, with
  the error's own message and never the statement's text.
- One case let a snap that does not tie go on to the section check. It came back
  clean until a test held a refusal to that one warning and no other.
- The BOM case came back clean because JavaScript's `\s` trims U+FEFF. The
  decoder had hidden it.

#### Gaps in the delivery, for the family

- **No ASK Absolute Return Fund statements for Bharat's or Aarti's folios.** The
  family's register lists the ARF line under Ajay and Ankita, and those two folios
  are in the book.
- **The file named "Aarti J" for the ARF prints Ajay as the holder.** It is
  text-identical to his other 9039917111 statement, so it is read once.
- **No holdings statement from Marathon** for either account, so neither carries
  a value.
- **ASK 10034025's profit-and-loss total is ₹149.81 away from its fact sheet.**
  It is reported, not explained away.

#### Verification

- `build`, `tsc` and `test:ingest` pass (golden 140 passed, 2 not checked, 0 blocked).
- `test:family` exits 0, and `check:family` is **126/0**.
- `npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
  byte-identically.
- `replay:calls`, `replay:flows`, `replay:owners`, `replay:movements`,
  `replay:dedupe`, `rekey:archive` and `reconcile:review` are each a no-op with
  `--check`.
- `check:pages` walked **370 combinations, and 6 have a finding — none of them
  this change's.** All 11 failing invariants are main's #104 checks on six Morning
  CIO routes (`cio`, `cio-index-loading`, `cio-cached`, `cio-live`,
  `cio-live-capture-lag`, `cio-alerts-badge`), the same 11 Stage 10cz measured on
  main's own build. *(Fixed at Stage 10dc.)*
- 32 invariants were not checked, against Stage 10cz's 25. One left the list
  (`history` no longer abstains) and eight joined it, each read out by name
  and each evidenced by the book:
  - **five lost their subject with the Buoyant snap.** A-14 on `cio-allocation`
    and `monitor`, and MH-15 on `monitor`, `monitor-auto` and `monitor-cagr`.
    Buoyant's two ₹0 cash lines were this book's only nil costed line, and the
    31 Aug snaps print none. Both rules are still held on constructed rows:
    `clubbedFigures.test.ts` for A-14, and `holdingReturn.test.ts` for MH-15,
    which fails three checks when the nil-line rule is switched off.
  - **two on `monitor-txn-window-early`**: no fiscal year of the dated capital
    record ends before the transaction statements begin, because ASK's tapes run
    from 26 Jul 2019.
  - **one on `ledger`**: the archive's newest statement is now the tape's own last
    date, so the two windows cannot be told apart.

### Stage 10db — THE UNNUMBERED TRUST, AND EVERY REVIEW CLOSING SET AGAINST ITS STATEMENTS

*"Also reconciliate the new updated data on the dashboard with this consolidated
file that the client had shared for reconciliation … Also do run a thorough audit
so that there are no logical errors or calculation mistakes in the data shown on
dashboard."* — with the family's consolidated review of 30 June 2026.

The review is still a cross-check and never a source. It settled one account the
book had excluded, and the reconciler now checks every closing it prints.

#### 1. Demat 1201090032387399 belongs to Bharat Jaisinghani Family Trust

It was excluded because its holder line and its masked PAN named different
taxpayers (see "ONE ACCOUNT IS EXCLUDED…" above). The family's own documents
settle it:

- the register records ₹6.77 Cr paid under the unnumbered "Bharat Jaisinghani
  Family Trust" on 1 Jul 2025, into ICICI Pru Liquid and Invesco India Arbitrage;
- the review closes those two funds under that trust at 46,654.378 and
  10,92,470.994 units, this account's own balances;
- the holder lines print the trust's trustees.

`BENEFICIAL_OWNER_BY_CLIENT_ID` in `motilalDemat.mjs` is the join, keyed on the
Client ID the page prints and checked on every read. It refuses unless the owner
is a canonical trust, the page's A/C Type is read and is not an individual's, and
the masked PAN fits no other taxpayer's PAN. No statement prints the trust's PAN,
so the registry carries none. `npm run replay:owners` lands it without the
passwords. `motilalOwner.test.mjs` (104 checks) and
`scripts/dev/motilal-owner-bug.mjs` (14 cases, each fires) hold it.

What moved:

- **58 accounts and a seventh holder**, a third family trust.
- **The statement book does not move** (₹613.01 Cr): since Stage 10cz this
  demat's rates are last-movement prices. The live book values its three funds
  at AMFI's NAV, about ₹8.72 Cr.
- **The register's ₹12.52 Cr under the unnumbered trust resolves**
  (`docs/REGISTER-RECONCILIATION.md`).
- **Invesco India Arbitrage and the trust's Kotak Arbitrage are cash
  equivalents.** Kotak's key is now one key for Ajay's demat and the trust's:
  one ISIN, one scheme.
- **`build-fund-navs` carries a NAV's previous value by ISIN** when a key moves,
  so a re-keyed scheme keeps its day change.
- **Scheme names gain a second tier**: AMFI's daily file, joined on the ISIN, for
  the four schemes the look-through store never saw — the trust's Invesco and
  Kotak arbitrage funds, Mirae Asset Large Cap and Nippon India ETF Liquid BeES.

#### 2. Section H — every closing the review prints

`npm run reconcile:review` gains section H. Each of the review's 162 closing rows
is set against the same holder's own statements, account by account. A
depository tape gives the balance on the closing's own date; otherwise the
nearest statement is used and its date printed. A statement of another date is
carried to the review's date over the units its own dated record moves, and that
is a tie only where it lands on the review's figure.

| Verdict | Closings |
| --- | ---: |
| ties — same date 32, another date 43, carried 3, printed total 7, other custodian 2 | 87 |
| no statement in the drop | 50 |
| nil (8), or kept out by decision (6) | 14 |
| differs — same date 6, later statement 2, earlier statement 1 | 9 |
| a value-only line on no statement of that date | 2 |
| **All** | **162** |

What still differs, named and not resolved — the family's to explain:

- **India SME**: Ajay's ICICI NSDL statement holds 67,500 units on 31 March where
  the review carries 54,000; Ankita's and Bharat's later statements hold 27,000
  where it carries 18,000.
- **Kaynes**: nil on 30 June on both Ajay's and Ankita's demats; Ankita's 4,875
  are credited on 7 July.
- **Nuvama** 3,695 against 9,500; **Yash High Voltage** 1,38,462 on the 31 March
  statement against 1,16,462; **Motilal Oswal Arbitrage** 2,80,67,435.434
  against .368.
- **Helios**: no statement on 30 June; Ajay's AMC folio first holds it on
  6 August. **V.E.C** and **Green Lantern** value-only lines meet no statement
  of that date.

A statement whose type the classifier could not name is printed as "statement
of", never "unknown of".

#### 3. One review line was wrongly called absent

The review's `Invesco India Arbitrage Fund-Direct(G)` closing for the trust is
the trust's holding statement of 31 July, to the unit, and its tape from 1 April
does not move the scheme. It joins `REVIEW_LINE_ISINS` (the dashboard's
review-gap note) and `H_LINE_ISINS` (the reconciler) on INF205K01KR8, so neither
says no statement reports it. Ajay's regular-plan line is a different review
line and is still on no statement.

#### 4. Still open

- The full audit the family asked for.
- ~~The reconciler's older prose sections (C2, D, E).~~ Fixed at Stage 10dd.
  C1's Helios note was fixed at Stage 10de.
- ~~Main's eleven #104 Morning CIO checks, which fail on main's own build.~~
  Fixed at Stage 10dc.

### Stage 10dc — TODAY'S MOVERS: #104'S TWO SETS ON THE FACE, AND THE ELEVEN CHECKS IT OUTRAN

Eleven Morning CIO invariants had failed on main's own build since #104. That
change ranks a name whose share count the corporate-action gate has not verified
by its exchange % move alone, and leaves it out of every rupee figure. Stages
10cz, 10da and 10db named the eleven and left them. They were of two kinds.

#### 1. Five were one check, and the page was wrong

Stage 10cp's no-explainer rule failed on the five routes that serve quotes
(`cio-index-loading`, `cio-cached`, `cio-live`, `cio-live-capture-lag`,
`cio-alerts-badge`), because #104 put two sentences on the card's face:

| Was | Now |
| --- | --- |
| "Share counts await verification for 5 names. Their exchange % moves are shown; money impact is withheld." | "5 names ranked by % move only · share counts unverified" ("left out" under the ₹ ranking). The names and the gate's own reason ("Why: Sales are recorded after this statement…") are its hover |
| "16 of 26 names with price changes · ₹24.6 Cr of ₹89 Cr held · 11 of 26 names with verified impact" | "₹24.6 Cr of ₹89 Cr held · 11 of 26 names". How many names the % ranking spans is the hover |

Three figures were wrong beside them:

- **"₹0 of ₹64.8 Cr held" over no name.** On the cached reload the saved capture
  is days behind the cached quotes, so the gate verifies no share count. The line
  prints no rupee figure when it covers no name (Convention 2).
- **A gainers total over part of its list.** Ranked by %, a list holds names with
  no money impact, and summing the rest printed a figure under a heading that
  counts all of them. The total is a dash whose hover names how many
  (`data-mover-total-absent`).
- **A %-only row's money cell** is a dash whose hover says why. Both figure cells
  carry `data-mover-cell`.

#### 2. Six were checks #104 outran, and the page was right

- **`cio`**: the no-feed check looked for the old headline; #104 says "Daily
  price changes are temporarily unavailable", names the service and offers a
  retry. The scope check looked for "Today's movers · Direct Equity"; with no feed
  #104's heading is "Latest price movers".
- **`cio-live`**: the coverage hover's wording; the gap line, which reads
  "against the Nifty 500 · today" now; and the gainer count, which counted only
  verified names where #104 ranks every priced one.
- **`cio-live-capture-lag`**: the same gainer count.

`MOVERS_HEADING` finds the card under any of #104's three headings.
`PRICED_DIRECT_EQUITY` re-derives from the book which names the card ranks,
which its money total covers, and which are ranked by % alone: a position with
a sale recorded after its statement (`realizedLotsAfter > 0`).

New checks: the tile's money total covers the verified names and the amber line
counts the rest, with the gate's reason in its hover; the cached coverage line
prints no rupee figure over no name; a gainers total over %-only names is a dash
naming how many; and each drawn row's money cell is the book's answer for that
name — a signed figure, or a dash that says why, never ₹0.

#### 3. The bug pass, and the check it showed could not fail

`scripts/dev/movers-partition-bug.sh` puts 15 bugs back one at a time, after a
clean control. **Case 7 first swept clean**: a %-only row printing ₹0 was
skipped, because an unsigned "₹0" matched neither "+₹…" nor "—". The per-row
check is what catches it now. All 15 fire:

| # | Bug put back | Fires |
| --- | --- | --- |
| 1 | the amber paragraph back on the face | the prose check on 5 routes · the money-total check |
| 2 | #104's coverage sentence back | the prose check on 5 routes · the cached no-rupee check · the coverage and money-total checks |
| 3 | "₹0 of ₹Y held" over no name | the cached no-rupee check |
| 4 | the amber hover drops the gate's reason | the money-total check |
| 5 | the coverage hover drops the ranked count | the money-total check |
| 6 | the %-only names dropped from the ranking | the gainer count on `cio-live` and `cio-live-capture-lag` · the gainers-total check |
| 7 | a %-only row prints ₹0 | the gainers-listed check · the per-row check |
| 8 | the money total counts the %-only names | the money-total check |
| 9 | with no feed, the card makes a claim about the book | the no-feed and scope checks on `cio` |
| 10 | the funds branch draws the direct-equity card too | the branch check on `cio-movers-funds` |
| 11 | the gainers total sums part of its list | the gainers-total check |
| 12 | the gainers total a bare dash | the gainers-total check |
| 13 | the tile's label drops Direct Equity | the day-move check |
| 14 | a %-only row's dash loses its reason | the gainers-listed check · the per-row check |
| 15 | every row's money impact a dash | the gainers-listed check · the per-row check |

#### Verification

`build` · `test:family` (0 failed) · `check:family` **126/0** · `npm run
build-book` byte-identical: nothing here touches the book. `check:pages` over
the 22 Morning CIO routes in both themes: **44 combinations clean, 0 invariant
failures**. The 13 lines not checked, read by name, are main's evidenced
abstentions: the money-weighted tile on eleven routes (#105's strip does not show
it by default), a scheme struck on an older day on `cio-movers-funds` (every
priced scheme published on one day), and A-14 on `cio-allocation` (no nil costed
Cash line since Stage 10da).

### Stage 10dd — THE REVIEW RECONCILIATION READS ITS OWN SECTION H

*"Also do run a thorough audit so that there are no logical errors or calculation
mistakes in the data shown on dashboard."*

Stage 10db added section H, which sets every review closing against the holder's
own statements, and left C2, D, E and G reading the book by name alone. So the
report contradicted itself: H said a closing ties on a statement while C2 said no
statement reports it (Zepto, Onesource, IFB, NLC among them). Nothing in the book
moves; only `scripts/review-reconcile.mjs` and what it writes.

- **C2 reads H's verdicts**, holder by holder. Of 38 direct-equity lines, **10
  tie, 8 are partly on a statement, 3 differ, 1 is reported and not valued, and
  16 are on no statement** (was 4 / 8 / 1 / 4 / 21).
- **D splits its ₹503.94 Cr the same way**: ₹306.05 Cr on no statement (₹136.16
  Cr of it the Private Equity aggregate), ₹197.50 Cr on a statement as a quantity
  this book does not value, and ₹0.39 Cr the Hope India Trust's, kept out by
  decision. None of it is valued.
- **The bridge subtracted Hope India twice**: once with the holders that have no
  account here, and again with the lines no name reaches. The second is gone, a
  new step names the ₹197.50 Cr, and the residual moves −₹176.77 Cr → −₹177.15 Cr.
- **G names B and B2 apart**: ₹169.89 Cr on no statement, ₹197.50 Cr on a
  statement as a quantity. G1's count and cause A's ask are derived from the
  book, so the ask names the two custodians whose costless rows carry a value
  (ICICI Bank NSDL and LKP).
- **H reads a depository window that opens after the closing's date** from its
  dated opening balance. Three closings now read it; two change verdict — Zepto
  ties, and a Motilal Oswal Arbitrage line of 24 Sep 2025 differs.
- **The dashboard's gap list is unchanged at 44 lines.** Only the Motilal wording
  in its `why` moved; its header now says it is the lines no NAME reaches, which
  the dashboard's tiers then narrow.
- E and F2: E says the review is dated 30 June and most statements after it;
  F2's count is derived.

`build` · `test:family` (0 failed) · `npm run build-book` byte-identical ·
`reconcile:review -- --check` a no-op · `check:pages` on `monitor-absent-name`,
`search` and `monitor-picklist`, which render the gap note.

### Stage 10de — THE REVIEW'S HELIOS LINE IS NOT SET AGAINST A LATER HOLDING

Section C1 compared the review's Helios Flexi Cap line (₹27.17 Cr, five holders
on 30 June) with the book's Helios figure (₹31.00 Cr). The book's figure is
Ajay's AMC folio 10355977, which section H already showed first holding the fund
on 6 Aug 2026, after the review. So C1 printed "+₹3.82 Cr" as if it were drift.

- Section H records each account whose dated record holds nothing on the
  review's date (`later`).
- C1's row names that account and says the difference is not drift.
- The residual names it as +₹31.00 Cr, running the other way, and gives the
  remainder: −₹208.15 Cr.
- `reviewGaps.test.ts` holds C1 and the residual to section H's own text.
  Putting the old row back fails both checks.

Nothing in the book moves; `src/data/reviewGaps.ts` is unchanged.

### Stage 10df — THE SEPTEMBER DELIVERY, AUDITED AGAIN: EVERY PRINTED LINE ON SCREEN

*"we need to make sure that we are showing every single data point that the
client has shared with us … why it has not made any significant change in the
dashboard figures."* Answered with a measurement: the September delivery adds
no value because ASK's mandates and its Absolute Return Fund are closed or
redeemed, Marathon sent no holding statement, and Buoyant moved one month. What
it did carry, and the dashboard did not show, is fixed here. Nothing in
`BOOK_SUMMARY` moves.

| What the statement printed | Was | Now |
| --- | --- | --- |
| ASK's profit and loss account, Marathon's income-and-expense statement | summed into `makeFlows`' fields, the lines lost | every printed line carried as `flows.lines` and listed under its bridge row on Performance; a column that prints no opening or closing value shows its lines and is never added up |
| ASK 10034025 and 10032723, closed | Return · FIFO struck on the survivors (a cash residue) | struck on the mandate's capital, +77.90% and +85.62% (`fifoTotals`: a mandate holding nothing is still whole) |
| Marathon 5110837 and 5110758, no holding statement | a headline and tiles of ₹0 | an absence naming the cause, the account's reason in the hover |
| a holding redeemed to nil (3P B3, ASK ARF A6) | return refused by a `cost > 0` guard | realised ÷ the cost of the units sold, 8.98% and 3.59% |
| the closed mandates' 426 sold lots, no asset class printed | a line of their own on Capital Gains and Ledger Insights | on the PMS mandates line, whose hover counts them (427 with one Carnelian lot) |
| Buoyant's 31 Aug Portfolio Snap TWRR | archived as a section, on no page | a return block on Performance: 1m 2.09%, 3m 5.87%, 1y 12.02% / 11.56%, since 01/06/24 10.65% / 10.28%, after fees |

**THE RECONCILER SUBTRACTED ONE TRUST TWICE.** Section B read the per-owner sum
of valued positions, so the unnumbered Bharat Jaisinghani Family Trust — an
account since Stage 10db, holding quantities only — was called "not in the book"
and its ₹5.96 Cr left the bridge in section B and again in section D. Section B
reads the account registry now.

**Two more faithful partial replays**, so none needs `GLOW_PDF_PASSWORDS`:
`npm run replay:flow-lines` lands the printed lines (it reads the four
unencrypted PDFs, because both readers take a figure from the item it was
printed as), and `npm run replay:flows` now also lands a Portfolio Snap Report's
return row. Each only adds, each gate is struck on the archive, and each is a
no-op with `--check`.

**The client PDF.** `docs/client/Glow-Ventures-missing-statement-data-update-2026-10-05.pdf`
is a new top page — what the data-requirement PDF asked for against what the
September delivery sent — over the 29 Sep PDF unchanged. Its figures are the
dashboard's own tiles (Portfolio value ₹912.3 Cr, Recorded invested ₹469.1 Cr),
bridged from the review through the statement book (₹613.01 Cr). Every review
figure is marked as the review's.

**Not done, and named:**
- **Buoyant's fund holdings** (42 lines, % of assets) are archived and drawn
  nowhere. They are the AIF's own portfolio, so they could join the
  look-through, which changes the partition every stock-axis figure rests on.
  That is a change of its own.
- **Buoyant's class yields** are not shown: the cost under them is the fund's
  switch-day restatement (Stage 10bv).
- **ASK 10034025's P&L total is ₹149.81 away from its fact sheet**, the issuer's
  own discrepancy, reported and not explained away.
- **Marathon sold every share by 23 Jul 2025** and sent no holding statement, so
  neither account carries a value.

**Checks.** `profitLoss.test.mjs`, `buoyantSnap.test.mjs` (10 new cases),
`heldThrough.test.ts` and `reviewGaps.test.ts`; `check:pages` routes
`mandate-closed`, `mandate-no-statement` and `stock-redeemed`, with the
Performance and Capital Gains invariants. `scripts/dev/whole-life-bug.mjs` puts
11 bugs back after a clean control, and all 11 are caught.

### Stage 10dg — THE REVIEW'S PRIVATE MARKET, LINE BY LINE, ON PRIVATE MARKET

***THE TAB IS GONE SINCE Stage 10dh, AND ITS LINES ARE THE PRIVATE BOOK.*** The
family asked for the review to be the SOURCE rather than a tab, so every claim
below about a figure being the review's own, labelled as the review's and in no
total is reversed: those lines are POSITIONS now, in `BOOK_SUMMARY` and on every
page that reads the book, each carrying a `reviewSource` naming the sheet, the
block and the row it came from. What survives is the reading —
`scripts/lib/reviewPrivateRead.mjs` still reads the workbook by header text,
`shared/reviewPrivateJoin.mjs` still joins a review line to a statement row, and
every refusal this section records is still a refusal. The section stays in the
order it was learnt, because what the review's own tabs tie to, and the five
joins it declines, are unchanged.

*"use the private equity information from the reconciliation motilal sheet to
feed the data in the dashboard. The client has given us instruction to show the
private market data in the dashboard using the data provided in the motilal
excel sheet. Make sure nothing is missed and there are no logical or calculation
errors."*

Private Market gains a fourth tab, **MOPWM review** (`?view=review`). It draws
every private-market line of the family's consolidated review
(`source/august-2026-d/…Review as on 30 June 2026.xlsx`). **The review is still
not a source** (§"the consolidated review workbook is not a source — by
decision"). Every figure on the tab is the review's own and is labelled as the
review's. None reaches `glowData.ts`, a NAV, `BOOK_SUMMARY` or any statement
total, and `glowData.ts` and `docs/BOOK-REPORT.md` regenerate byte-identically.
***BOTH HALVES OF THAT SENTENCE WERE OVERTURNED AT Stage 10dh***, at the
family's own request: these lines ARE the private book now, they DO reach
`glowData.ts`, and the tab that drew them is gone. The paragraph stays as it was
written, because what it records is the standing the review held for three weeks
and the reason the next narrowing had to be ASKED for rather than assumed.

#### What is drawn, and what it ties to

96 lines in seven blocks. Every block opens into its lines:

| Block | Lines | Ties to |
| --- | ---: | --- |
| PE funds | 6 | ₹22.22 Cr invested and ₹32.71 Cr value: the head tab's Alternate row, to the rupee |
| Unlisted shares | 2 | ₹27.09 Cr and ₹64.33 Cr: the head tab's Equity row |
| Pre-IPO · at cost | 2 | ₹21.00 Cr: the head tab's Pre IPO row, ₹0.15 apart (inside ₹1) |
| Private investments · at cost | 59 | ₹115.16 Cr, held at cost |
| Now listed | 4 | no cost or value on this tab; each names the statement that holds its shares now |
| Written off | 22 | a MEASURED ₹0 value, never an absence |
| Private credit | 1 | K M Global, from the Debt tab; outside the members sum, as the review keeps it |

**Pre-IPO, at cost, now listed and written off are the 87 lines of the review's
`Private Investments` tab, and their cost adds to that tab's own Total, ₹136.16
Cr, to the rupee.** The Total's cost column is read by its header, never by
position, because that row carries a stray number in its date column.

Each total names what it covers: invested ₹186.17 Cr over 70 lines, value
₹234.24 Cr over 92, paid in ₹44.69 Cr over 8, and gain ₹41.76 Cr over 7. A
members band, closed on arrival, is the review's Investorwise summary, ₹233.20
Cr over five holders, rebuilt from these lines.

#### The arithmetic is re-derived, and the review's own slips are marked

- **Gain = value + paid back − what was put in, on the basis the line has.**
  Return = gain ÷ that base. Where the review prints a return its own columns do
  not give, the cell is marked **≠** with both figures in its hover. Baring PE
  Fund 6 prints 0.00% against −6.25% from its own invested and value.
- **XIRR only over a year or more** (Stage 10g(ii)): India SME 22.70%, Baring
  −6.01% (the review prints 0.00%, marked ≠), 360 ONE 10.58% and K M Global
  12.37%. Zepto (2025-02-24 → 2025-07-31) and Transition Venture (2025-08-01 →
  2026-02-28) are refused, with the reason.
- **20 disagreements** between the review's printed figures and its own rows are
  listed in a closed band, each with both figures.
- A figure the review does not print is an `AbsentCell` with its reason.

#### A date is a date, never an Excel serial

The review stores a single investment date as an Excel serial number. So all 66
lines with one date showed a five-digit number where the date belongs, on the
tab and in the report: Integris read "45631". The generator now writes one
display text per line, read by the page and the report alike:

- a serial becomes "5 Dec 2024" (66 lines);
- a month range becomes "Sep 2024 – Mar 2026" (30 lines);
- the cell as the workbook carries it is kept beside it (`printed`), and a
  month range names it in the line's hover.

A page check and a suite section re-read every line's date cell from the
workbook, by its header, and hold the row to it. Both require that some lines
are serials, so neither can pass on a book with nothing to convert.

#### Which lines a statement also reports

31 of the 96 lines join to a statement row, through `shared/reviewPrivateJoin.mjs`:
committed patterns, each required to name exactly one review line, and each key
required to be on a statement row, or the generator refuses. Five joins are
refused and named rather than guessed: Innoviti, WE VOISE, Waterwala / Drink
Prime, EMA Preferred (preference shares are not the equity) and Swapeco equity
(the trusts' statements carry the preference shares). The column says whether
each joined row is valued or a quantity only.

The review prints `A K Enterprises - Polycab` and `Inflexor Technologies -
(RAJESHWARI - AVENDUS)`. The tab shows `A K Enterprises` and `Inflexor
Technologies`, so no page but `/polycab` names Polycab and no route names the
register's sentinel. The review's own text stays in the archive and in
`docs/REVIEW-PRIVATE-MARKET.md`.

#### The reconciler said this block was itemised nowhere

`review-reconcile.mjs` called the ₹136.16 Cr Private Equity heading "an aggregate
block the review itemises nowhere". The review's own `Private Investments` tab
itemises it, and the tab now draws it. Section C, the bridge step and the
custodian note say so. No figure moves, and no line of `src/data/reviewGaps.ts`.

#### Checks

- `reviewPrivate.test.ts` (`test:family`, 32 checks) holds the generated module
  to the workbook: every line once, every block to its head row, the Private
  Investments Total read by its header, members to the Investorwise sheet,
  returns re-derived, sub-year XIRRs refused, every date to its own cell, and
  nothing in the book. It reads the workbook with SheetJS, never through the
  reader under test.
- `check:pages` walks `private-market-review` with ten checks struck on DOM
  handles. Private Market's strict no-prose rule applies to the tab.
- `scripts/dev/review-tab-bug.sh` puts 16 bugs back one at a time, after a
  no-patch control that came back clean (8 combinations, and the suite). Every
  one is caught:

| # | Bug put back | Caught by |
| --- | --- | --- |
| 1 | each block draws one line fewer than it carries | 5 page checks: every line drawn once, the Private Investments Total, each block to its head, the footer to its rows, the members band |
| 2 | an at-cost line dropped everywhere at once, so the block, its band and the footer still agree with each other | 2 page checks: the Private Investments Total and the members band, both read off the workbook |
| 3 | a return printed on the review's cost rather than on what was paid in | the gain-and-return check |
| 4 | a sub-year XIRR shown | the sub-year check |
| 5 | the ≠ marker never drawn | the ≠ check |
| 6 | an absent figure renders ₹0 | the absent-or-zero check |
| 7 | a written-off line's measured ₹0 renders as an absence | the absent-or-zero check |
| 8 | the members band open on arrival | the members-band check |
| 9 | the footer totals one block, not the table | 2 page checks: the footer's line count and the footer to its rows |
| 10 | a band totals only its first line | the block-head check |
| 11 | the funds table drawn on the review tab as well | 10 page checks, the first that the card draws the review table and only that one |
| 12 | the review tab not offered | the four-tab check, on all four Private Market routes |
| 13 | the generator leaves what was paid back out of a gain | 2 suite checks and the page's gain-and-return check |
| 14 | the generator takes a line's cost from its market value | 3 suite checks and 2 page checks |
| 15 | the generator writes a line's date as the Excel serial the cell holds | 2 suite checks and the page's date check |
| 16 | the page prints the raw cell while the row's handle still carries the date | the page's date check, which reads the printed text as well as the handle |

Two harness defects were found and fixed on the way:

- **Case 12 did not build at first.** Renaming the tab's key left every
  `view === "review"` comparison with no overlap, which is not a result. It now
  hides the tab where the control is drawn.
- **A sweep that prints no tally is not a result.** With the preview down, one
  run read case 12 as clean against no server. The harness now says NOT A
  RESULT when the sweep prints no tally line.

#### Verification

On this branch, which sits directly on main at `a96a666` (main has not moved
since):

- `build` and `tsc` pass.
- `test:ingest` passes: every suite, and golden 140 passed, 2 not checked, 0
  blocked.
- `test:family` exits 0, with the review suite's 32 checks among its suites.
  Its ten NOT CHECKED lines are other suites' evidenced abstentions; none is
  the review suite's.
- `check:family` is **126/0**.
- `npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
  byte-identically. `build-review-private -- --check` and
  `reconcile:review -- --check` are no-ops.
- `check:pages` walked **378 combinations, all clean**, run with nothing else
  on the machine: main's 376, plus `private-market-review` in both themes. Its
  32 NOT CHECKED lines were read by route. Each is an existing claim with
  nothing on this book to check: 13 on Morning CIO's routes (11 of them the
  money-weighted tile its strip does not show by default), 11 on the Portfolio
  Monitor's, 5 on Private Market's (a fund row with no cost, a redeemed
  account, and the two owners-tab claims), and 3 others (a partial realised
  figure on a mandate's trades, the not-found crumb and the ledger's window).
  None is on the review route. Beyond the new route and its checks, this
  change's only edit to the checker turns the three-tab claim into a four-tab
  one, so it removed no check.
- CI (`build`) and Cloudflare Pages passed on `d20e431`, the last code commit.

### Stage 10dh — THE REVIEW IS THE SOURCE OF THE PRIVATE BOOK, NOT A TAB

*"for private market data you can use the MOPWM as the source, no need to make
it a separate tab... just integrate it normally as the source"* and *"for
private market data, any kind of private market data, we will use the
reconciliation sheet as the source"* — the family, 5 Oct 2026.

Stage 10dg drew the review's private-market lines on a tab of their own, under
a heading saying they were the review's and in no total. The family have now
asked for the opposite: the review IS the private book. So the tab is gone, its
lines are POSITIONS, and every page that reads the book reads them — Morning
CIO, the Portfolio Monitor, Private Market, Family & Entities, the holdings
drill-downs, Sector Composition and the Excel export, none of which needed an
edit of its own to show them.

**§"the consolidated review workbook is not a source — by decision" IS NARROWED,
NOT REVERSED, and the six passages that state it now say which half they mean.**
For a PRIVATE-MARKET line the review is the source. For everything else — a
holding, a cost, a mark, a dated flow — it is still the independent cross-check
`review-reconcile.mjs` runs and nothing more. The distinction is enforced by
construction rather than by prose: `reviewBookLayer` emits only the four blocks
the family named (PE Funds, the unlisted shares, `Private Investments` and the
Debt tab's K M Global credit line), and every row it emits carries
`review: true` and a `reviewSource` naming the sheet, the block and the ROW
NUMBER it came from, so any figure on any screen can be opened against the
workbook.

| | main | now |
| --- | ---: | ---: |
| Consolidated market value | ₹613.00 Cr | **₹833.80 Cr** |
| …listed | ₹599.21 Cr | ₹599.20 Cr |
| …private | ₹13.79 Cr | **₹234.59 Cr** |
| …neither side | ₹98,742 | **₹0** |
| Positions · accounts · owners | 330 · 58 · 7 | **412 · 64 · 8** |

The listed side falls by the ₹70,754.50 Borosil warrant row the review now
stands for; Blue Ashva — the one holding nothing placed on either side — is a
review line and therefore private, so nothing is unplaced. The six new accounts
are HOLDER BUCKETS, not custodian accounts, and the eighth owner is the
not-attributed one below.

#### The layer, and what it refuses rather than guesses

- **`shared/reviewHolders.mjs`** is the family's own answer to whose each line
  is: `PRIVATE_INVESTMENT_HOLDERS` (the at-cost lines, split by member where a
  line is shared), `VALUED_HOLDERS` (the lines the review values, with their
  units and the split's reason), `PRIVATE_INVESTMENT_ELSEWHERE` (a line counted
  somewhere else), `SUPERSEDED` (the statement rows the review now stands for)
  and `FRESHER_STATEMENT` (where a statement says something different).
- **`scripts/lib/reviewBook.mjs`** builds the layer and **THROWS, NAMING THE
  LINE, rather than guess**: every one of `Private Investments`' 87 lines must
  be held, named elsewhere or written off; its lines must add to its own
  printed Total; a `VALUED_HOLDERS` pattern must match exactly one line of its
  tab and its parts must add to that line's cost and value; a valued part must
  tie to the review's own Transactions closing; every PE Funds, unlisted and
  Debt row must be covered; and each member must tie to the review's own
  Investorwise summary. A written-off row carrying any figure fails. Two rows
  for one (account, security) fail. A row whose text names Polycab or the
  register's sentinel fails.
- **AND THE NAME A READER READS IS GATED THE SAME WAY, because the review's own
  text reads as another holding on two lines.** A display name on
  `PRIVATE_INVESTMENT_HOLDERS` DEFAULTS to the review's own product text, so an
  entry's `name` is an exception that has to earn its place — and three things
  are checked against the BOOK the layer leaves behind (every key a statement
  still carries, plus the review's own): a name that normalises onto ANOTHER
  holding in the book fails; an override whose review text collides with nothing
  fails as STALE; and a name read as an instrument — a coupon, a maturity, a
  filer's mark — fails, because a row is its issuer. `Borosil Renewables`
  normalises onto the equity two PMS mandates hold, so that row is named by the
  warrant its key names (Stage 10ak: a warrant is not the equity), and the
  credit line is named by its issuer, `K M Global - Credit Private Limited`.
  **`VALUED_HOLDERS` is deliberately outside the staleness half**: there a `name`
  is REQUIRED (the review clips `India SME`), so there is nothing for it to
  measure — a gate that fired on it reported a stale override on a required
  field, which is how it was found.
- **`marketSideOf` answers `private` FIRST for a review row** (`position.review`),
  before any SEBI category or the family's own fund placing: a line the review
  carries as private capital is private, whatever a statement would have said.

#### Six holder buckets, and ₹7.26 Cr attributed to nobody

The review's `Private Investments` tab names a holder in a line's own text
("— SIDDHARTH LADSARIYA") on some rows and nobody on others. A line nobody
holds is not dropped and is not assigned: it goes to
`review-not-attributed`, whose owner reads **"Not attributed to a member"** —
5 lines, **₹7.26 Cr** — and the review's Investorwise summary is what proves the
set is right, because the members' own totals must leave exactly those rows plus
the two counted elsewhere.

| Bucket | Lines | At the review's figures |
| --- | ---: | ---: |
| Ajay Jaisinghani | 27 | ₹125.40 Cr |
| Bharat Jaisinghani | 31 | ₹37.26 Cr |
| Ankita Jaisinghani | 12 | ₹29.04 Cr |
| Not attributed to a member | 5 | ₹7.26 Cr |
| Bharat Jaisinghani Family Trust 2 · 3 | 1 · 1 | ₹1.35 Cr each |

**A HOLDER BUCKET IS NOT ONE INVESTMENT, AND THAT IS WHY A DATED RECORD OVER IT
IS STRUCK PER LINE.** `Account.reviewHolder` marks them, and `capitalRollup`
keys a row on `<accountId>|<securityKey>` there rather than on the account —
each line has its own dated purchases, its own closing and its own date. Every
other account is one row, exactly as before.

#### Valued, or held at cost — and an at-cost line has no gain

The private book is 90 positions and splits in two: **14 valued, ₹93.92 Cr**
— 13 review rows over 7 of its lines, plus Neo Infra on its own statement —
and **76 held at cost, ₹140.68 Cr**, every one of them the review's, over 61 of
its lines. `isValuedAtCost` and `AT_COST_BUCKET` are the one place that
distinction is read:

- **an at-cost row's `unrealizedPnL` and `returnPct` are `null`**, with
  `AT_COST_RETURN` as the reason — a cost is what was paid, never a valuation,
  so a gain on it would be a figure nobody struck;
- **`avgCost` is still set wherever the review records units**, at cost or not:
  a price paid per unit is a cost;
- **a written-off line is NEVER a ₹0 position.** 22 of them are named in
  `docs/BOOK-REPORT.md` with the review's own remark and dates, and reach no
  total. A ₹0 row would read as a holding worth nothing.

#### The valuation decisions, each a wrong answer avoided

- **National Stock Exchange of India gets no XIRR.** The review carries its
  2,00,000 shares and no dated row for them, so there is nothing to solve
  against; its HPR stands at +243.4%. The review prints ONE cost for the
  2,00,000, and splitting it by shares across Ajay's 1,25,000 and Ankita's
  75,000 is THIS BOOK'S judgement rather than the review's — said so on the
  row.
- **Zepto is valued at the review's own 31 Jul 2025 closing** — 4,716 units
  bought 24 Feb 2025 at ₹31,810 (₹15,00,15,960), closing ₹22,82,85,156.52, so
  **HPR 52.17% over 157 days**, which the sub-year guard keeps un-annualised.
  Ajay's demat shows those preference shares CONVERTED and 37,38,119 equity
  shares held on 31 Jul 2026; the statement is named and the review's figure
  used.
- **K M Global is folded in from the Debt tab** (Bharat's, ₹70,00,149.80 cost,
  ₹1,04,34,584.46), and **Credit Fair is counted once**: the
  `Private Investments` tab's ₹20 L Credit Fair–K M Global line is the same
  loan, so it is claimed as counted elsewhere rather than added.
- **ESDS is live only.** The review's line is listed since; the ICICI Bank NSDL
  statement's 3,30,898 shares stay on the statement and are valued at the live
  quote, so the review's row is claimed as elsewhere.
- **Cheelizza's statement row is superseded by a written-off line**, which is
  the one case where a superseded row's replacement carries no figure at all:
  Ankita's demat records 3,50,980 shares, the review writes the investment off,
  and the quantity is no longer a row.
- **Ten rows of Ankita's demat 1201090012838316 and twenty of Ajay's ICICI Bank
  NSDL account are superseded**, each by the review line named in
  `docs/BOOK-REPORT.md`. Two more are POSITIONS rather than quantities (the
  Borosil warrants and Blue Ashva), and three are WINDOWS — the depository's
  own quantity account for a line the review now carries.
- **Swapeco keeps its two keys.** Both trusts' HDFC NSDL statements record 347
  preference shares each; the review carries one line, and each trust's own
  bucket takes its half, so neither trust's holding is folded into the other's.
- **Commitments are still the statements'.** All 15 come from a fund's own
  capital account and not one from the review: a commitment is what a fund can
  call, and no review line states one.

#### Where a statement says something different, it is named — never dropped

`FRESHER_STATEMENT` carries eleven, each on the row's own hover and in
`docs/BOOK-REPORT.md`:

- **Neo Infra stays on its statement** — it is not a review private-market line
  at all, so nothing about it moves.
- **India SME**: the review's closing carries 54,000 units at ₹1,770 for Ajay
  where the fund's statement prints the 81,000 held, and 18,000 against 27,000
  for Bharat and for Ankita; the statement also dates the ₹50,00,000 call the
  review puts on 29 Nov 2024 on 14 Jul 2025.
- **Transition Venture**: each trust's own statement of 31 Mar 2026 values its
  7,500 units at ₹1,71,45,962.25 — **₹2,286.13 a unit against the review's
  28 Feb mark of ₹1,290.77**.
- **Baring**: the fund's statement of 31 Mar 2026 prints **₹56,161** paid out
  (₹18,909 on 30 Sep 2025 and ₹37,252 on 31 Mar 2026) where the review carries
  **₹1,42,867**; its own XIRR on the review's rows is −6.01%. And Ankita's demat
  records **252.5 units** against the 202.5 the fund's statement and the review
  both carry.
- **Sky Capital** is **held at cost** — 4 folios, **8 calls**, the review's
  ₹4,71,50,000 against SKY003's statement of 31 Jul 2026 printing ₹1,72,85,000
  drawn where the review carries ₹1,71,50,000: **its 22 Apr 2026 call of
  ₹1,35,000 is on no row of the review**, so ₹4,72,85,000 drawn stands against
  ₹4,71,50,000 at cost and the ₹1,35,000 is named rather than reconciled. Both
  figures are stated to the rupee: in crore they round to ₹4.73 Cr against
  ₹4.72 Cr, and the earlier draft of this line printed ₹4.72 Cr for both,
  which hides the one difference the sentence exists to name.
- **360 ONE**: CRN37702's statement of 31 Jul 2026 values the same units at
  ₹1,46,68,362.66, and **3,769.026 of its units are on no dated row** — the
  review's Transactions rows walk to a different count from its own closing, and
  the gap is NAMED in the run's notes rather than closed by a unit nobody dated.

#### What the pages do differently

- **Morning CIO's allocation has an EIGHTH bucket, `Private investments at
  cost`** (76 rows, ₹140.68 Cr), so the sweep's `BUCKET_SLOTS` — how many
  allocation rows it holds a drill-down address for — runs to 8. Measured, the
  eight add to the book to the rupee: AIF ₹371.87 Cr, at cost ₹140.68 Cr, PMS mandates
  ₹138.70 Cr, Direct Equity ₹64.75 Cr, Unlisted ₹64.33 Cr, Mutual Fund
  ₹52.42 Cr, Bond ₹1.04 Cr, Cash ₹0.
- **The gain tile counts the set it is struck over.** `strikesGain` is **317 of
  403** current holdings — an at-cost line is not one — and the whole-book
  return is struck over exactly those, with `costedSetLabel` reading *"on the
  ₹X of ₹Y valued against a cost · N of M holdings"* rather than "that reports a
  cost", which was true while every costed holding also had a mark and is false
  of a line held at its cost.
- **The private side's hover names the review** (`SIDE_NOTE`), with a check.
- **The Portfolio Monitor's stock axis has a SIXTH bucket** — what is neither a
  company share, a fund nor cash: **66 rows, ₹194.32 Cr** (Unlisted 65 /
  ₹193.27 Cr and the Bond line / ₹1.04 Cr), labelled from the classes it holds.
  Without it the parts below that table stopped adding to the book by ₹194 Cr,
  and Sector Composition's "not on this page" card names the same set by the
  same rule.
- **THE AIF DRILL-DOWN HAD NO CATEGORY I HEADING AND NO NOTE, which is the one
  way this change could mislead.** That table is the ALLOCATION bucket's, and
  `holdingBucket` answers the at-cost bucket before the asset class — so a
  review line held at cost is not on it. Every Category I AIF this family owns
  is Sky Capital's angel fund, the review records all four folios at cost, and
  they carry a POSITION now, which also emptied the fold that used to name them
  as valued by no statement. A page clubbed by category that is simply silent
  about a category tells a reader they hold none (Stage 10bp). So a second
  closed fold names every at-cost AIF fund with its section, its cost and a
  link to the at-cost row — **8 funds, ₹11.73 Cr, Category I ×1 and Category not
  stated ×7**, of 14 rows the bucket moved. Two checks hold it: the naming, and
  the LOAD-BEARING half asserting that a section the drawn table no longer
  carries is still named — struck on the book's two sets rather than on the
  words "Category I", so a book whose at-cost funds all share a section with a
  drawn one abstains with the evidence instead of asserting nothing. Its summary
  is a LINE and not a sentence: the first draft carried twelve lower-case words
  past 60 characters and the prose guard caught it (Stage 10cp), and the check
  now holds the words it draws to that bound too.
- **Family & Entities strikes its returns over `strikesGain`**, shows
  `AT_COST_RETURN` on an at-cost row, reads `e.fifo.costHeld` in its popovers,
  and says why an entity holding only at-cost lines shows no gain.
- **The Transactions footer counts DISTINCT ACCOUNTS.** `capitalTotals.accounts`
  was `groups.length`, which is one account per row on main and is not here: a
  holder bucket draws one row per line, so the label read **39 of 64 accounts**
  over a record **38** accounts publish. It is
  `new Set(groups.map((g) => g.accountId)).size` now, `rows` is the row count,
  and the checker asserts both — on the handle and on the rendered label,
  against the accounts the rows themselves name — so a footer back on the row
  count fails by name.
- **Two latent defects in Private Market's master table were fixed on the way**,
  each found by reading rather than by a check: the Weight heading's overlap
  sentence and the "Counted once" weight adjustment each read only the `private`
  band, so on the By-owner grouping neither saw the at-cost one, and the heading
  described one of the two columns it is on. Both span every band but the
  unvalued now (`BOOK_SECTIONS.filter((id) => id !== "unvalued")`).
- **`data-mine-cell="realised"` and `="unrealised"`** are new handles on the
  Transactions row, with `realisedWhy` / `unrealisedWhy` on the probe, so a
  dash's reason is read rather than inferred.

#### The checker

- **A review account's capital record is dated by `BOOK_REVIEW_FLOWS` alone.**
  Its rows are the review's, so a statement's own dates must not set the window
  a review line's return is struck over.
- **The dated-capital model works in UNITS**, and a review line is rated on the
  review's own rows.
- **`AIF_BOOK` IS SCOPED TO THE BUCKET, NOT TO THE ASSET CLASS**, and it failed
  three invariants against a page that was right until it was. The drill-down is
  `?of=bucket&key=AIF`; the derivation filtered on `assetClass === "AIF"`, so it
  expected the 35 rows and 19 funds the class holds where the bucket draws 21
  and 11 — the other **14 rows, 8 funds and ₹11.73 Cr** being at cost. The
  derivation itself was proved identical on both sides to the paisa before
  anything moved; the defect was the SET. Re-expressed on the book's own
  `valuedAtCost`, never through `holdingBucket`, on the standing terms: a check
  that imports the helper it is checking agrees with it by construction.
- **`CAPITAL_GROUPS`** is the checker's model of the Transactions card, keyed per
  PAGE ROW — `<accountId>|<securityKey>` inside a holder bucket, the account
  everywhere else — carrying `value`, `paid`, `out`, `close` and `withheld`
  (`reviewShortfall`'s reasons in order) and a `rowCapital(key, account)`
  helper. MT-8, MT-9, the late-window check, the route walker, the
  fully-redeemed check, HPR over purchased, the identity check (`paid −
  redeemed + realised + unrealised = group value`, within ₹1), the sub-year
  check, the XIRR re-solve and the typed-payout split all read it. Measured: 39
  groups (16 from the review, 23 from a statement record), 38 distinct
  accounts, 3 holder buckets carrying 4 lines, 29 rated.
- **TWO INVARIANTS ON `monitor-txns` NOW ABSTAIN, WITH THE EVIDENCE**, because
  this change took their subject: *"an account no statement values shows no
  value, appreciation or return — never ₹0 (A-06)"* and *"an unvalued fund
  account funded by calls is filed under AIF, not left unclassified"*. Sky
  Capital's and India SME's folios are at-cost POSITIONS from the review now, so
  no account with a dated capital record is valueless and no unvalued fund
  account carries one. Each says so rather than passing over nothing.

#### What was deleted

- **The review tab and every line of its code** — `src/lib/reviewPrivate.ts`,
  `src/components/ReviewPrivateTable.tsx`, `src/data/reviewPrivate.ts`,
  `scripts/lib/reviewPrivateRead.mjs`'s tab half and the route. Its REFUSED
  NEAR-MISSES survive as a guard in the review builder rather than as prose: a
  pattern that matches no line, or more than one, fails the run.
- **`docs/REVIEW-PRIVATE-MARKET.md`**, replaced by `docs/BOOK-REPORT.md`'s
  `## Private market — from the family's consolidated review` section — the
  superseded rows, the eleven disagreements, the 22 written-off names and the
  dated rows behind every valued holding, all generated with the book rather
  than beside it.
- **`reviewPrivate.test.ts`**, replaced by `reviewBook.test.ts`.

#### Open, and named

- **The "newer statement needed" badge wants re-checking.** It tells a reader
  that a row's units, value and capital account are the FUND STATEMENT's and
  that the depository recorded a change since — which is the Baring 252.5
  against 202.5 above. On a row the review now stands for, that sentence names
  the wrong document.
- **Four depository windows on Ankita's demat 1201090012838316 are left** —
  Baring 252.5, Blue Ashva Varenya 856.736, India SME 27,000 and TOCF-I
  12,899.355 — each the quantity account of a line the review values elsewhere.
- **360 ONE's 3,769.026 units** sit on no dated row of the review.

#### The bug pass, and two findings in the harness itself

`scripts/dev/at-cost-fold-bug.py` puts ten defects back one at a time, after a
control that must come back clean. It snapshots by copy, restores with a byte
comparison, rebuilds on the way out, and reports a patch that does not apply or
a build that fails as NOT A RESULT. Three kinds: a route sweep, a case that
fires if `build-book` REFUSES, and a case that fires if the BOOK MOVES.
**Every one of the ten fires its own checks:**

| # | Defect put back | Fires |
| --- | --- | --- |
| 1 | the at-cost fold is not drawn — the Category I claim leaves the page | 2 on `holdings-aif` |
| 2 | the fold names the funds and not their categories | 2 |
| 3 | the fold drops the fence — its cost is in no total here | 1 |
| 4 | the summary reads as a sentence again, as its first draft did | 2 — Stage 10cp's page-wide prose guard **and** the at-cost check, which holds the same bound where it asserts the words |
| 5 | `AIF_BOOK` is scoped to the asset class again, not to the bucket | 3 pre-existing AIF checks |
| 6 | the footer's row count is read off the capital rows, not the table's | 1 |
| 7 | the page counts its capital rows as accounts again | 3 |
| 8 | a review name is put back to text that reads as another holding | `build-book` REFUSES: *Borosil Renewables normalises to borosil-renewables, another holding in this book* |
| 9 | …and the gate that refuses it is removed with it | `build-book` rc=0 and the BOOK MOVES — by exactly one field, measured below |
| 10 | an override whose review text collides with nothing is left standing | `build-book` REFUSES: *the review's own `Borosil Renewables` collides with nothing, so the override says nothing* |

**AND CASE 9's BOOK MOVES BY ONE FIELD, WHICH IS THE WHOLE REASON THE GATE IS
NOT A COUNT.** Measured rather than described: the only line of `glowData.ts`
that moves is the review warrant line's `security`, from `Borosil Renewables -
Warrants 13AG26` to the plain `Borosil Renewables` — which is the name the
book's OWN `borosil-renewables` key carries, SVAN's 11,495 shares across two
mandates. The keys stay apart, so nothing merges; what happens is that a
₹3.75 Cr warrant line and ₹63.9 L of shares read as one company on every
screen and in the search box, which is Stage 10cc's one-company-two-keys
failure running backwards. **Its row counts do not move at all** — 89 rows, 50
superseded, 22 written off, before and after — so the build's own notes say
nothing, and only the field diff can see it.

**AND THE FIRST RUN OF CASES 6 AND 7 WAS NOT A RESULT, WHICH THE CONTROL SAID
AND NOBODY READ.** Each reported 27 failures over two combinations — nearly every
`monitor-txns` invariant — and so did the unpatched control. The cause is that
**the prepared read models are part of the build and a worktree's are its own**:
`public/views/` and `src/data/readModels.json` are gitignored and content-hashed
off the book, so a fresh worktree carries whichever revision it was last built
at, and the worktree's was the pre-review one. Left stale, the Transactions tab
loads another book's ledger and every one of its invariants fails. The harness
builds the views with the bundle now, and **exits NOT A RESULT on a control that
is not clean** — a case is read as *these checks fire and the others do not*,
which says nothing at all if the unpatched tree already fails them. Re-run, the
control is clean on both routes and cases 6 and 7 fire 1 and 3 checks.

**AND A PREVIEW THAT HAS OUTLIVED A BOOK CHANGE SERVES ANOTHER REVISION'S READ
MODELS.** `vite.config.ts` mounts `readModelApi()`, which bundles
`functions/api/stock-exposure.ts` ONCE and memoises it, so a long-running
`vite preview` answers **409 `revision_changed`** for the revision the current
bundle asks about — and the app then presents its reload prompt rather than a
page. `check:family` timed out waiting for `<main>` on `/returns`, twice, which
is what ruled out the load transient CLAUDE.md records for the transactions
walks: the same failure both times. The PAGE is right. Restarted, the endpoint
answers 200 and `/returns` renders 10,279 characters. **Restart the preview after
a book change.** Both suites reach that handler — measured: `check:pages` routes
`/api/stock-exposure` on exactly ONE walk, the loading state, where it holds the
request open on purpose, and every other route lets it through. A stale preview
would therefore take `<main>` off every page that looks through a fund, not one.

#### Merged with main, and verified on the merged tree

Main moved two commits while the PR waited — a fund-NAV refresh from AMFI's
published file and a 93-series harvest, 96 files. **No stage heading, no code and
no checker**, so the `ctx` literal had nothing to conflict on and the merge raised
no marker. Checked by hand rather than trusted: `src/data/fundNavs.ts` and
`public/series/` are byte-identical to main's own, the headings were compared
against main's tip with their titles (main added none, and the branch's only new
one is `10dh`), and `build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` byte-identically. `fundNavs.ts` drives the LIVE book
through `withPublishedNavs`, so the live routes were re-walked rather than
assumed.

- `npx tsc -b` and `npx vite build` pass.
- `npm run test:ingest` passes every suite: motilalOwner 104, nsdlPriceDate 17,
  neoFlows 8, mfPurchase 20, pmsReaders 44, categoryWords 51, separate 56,
  profitLoss 91, askArf 87, buoyantSnap 133, sheetWitness 291, septemberAudit
  103,632, and golden **140 passed, 0 failed, 2 not checked, 0 blocked**.
- `npm run test:family` — **4,730 checks, 0 failed**, 18 not checked. **Four of
  those are new here and each is evidenced by the book**, with its constructed
  case still holding: the review dates the only statement-dated fund with dated
  payouts and no capital record; the review values every capital account a
  statement left unvalued; no unvalued account carries its own calls; and the
  unvalued list leaves no AIF folio unvalued.
- `npm run check:family` — **127 passed, 0 failed**.
- `npm run build-book` twice, byte-identical. `replay:calls` (28 documents, 0
  would change, 0 refused), `replay:flows` (38, 0, 0), `replay:flow-lines` (4, 0,
  0, 36 printed lines carried), `replay:owners` (12, 0, 0), `replay:movements`
  (362 → 362 rows, 90 opening-to-closing splits), `replay:dedupe` (307
  documents, 0 would change, 2 family decisions applied), `rekey:archive` (506
  distinct security names, 0 carrying more than one stored key) and
  `node scripts/review-reconcile.mjs --check` (42 lines no name reaches) are each
  a no-op, and the tree is clean after all eight.
- `npm run check:pages` — **382 combinations clean, 0 invariant failures**, and
  not one console error, failed request, overflow or contrast finding on any of
  them. 191 routes in two themes: **183 declared** — one fewer than main, the
  review tab's route gone with the tab — and **8 generated**, one per allocation
  bucket, where main generates 5. Main's own sweep is 378, and 184 + 5 = 189
  against 183 + 8 = 191 reconciles only because this one was re-run.
  **53 invariants were NOT CHECKED, every one on the light walk** where the
  invariants run, read out of `report.json` by route:
  - **22 are this change's, each because the review now supplies the very thing
    the claim was struck on.** Four on `holdings-aif`: every AIF folio carries a
    valued position, and the book values a Category I AIF, so the table draws
    one. One each on `private-market`, `-tiles`, `-folios` and `-owners`: every
    private account is valued, so the section of accounts nothing values has no
    subject. One on `private-market-owners-returns`: no member holds exactly one
    fund. The two on `monitor-txns` the section above names. And **eleven on
    `holdings-unplaced`**, because nothing is on neither side of the book any
    more — so that scope draws no table, no headline, no filter box and no
    facet, and every claim about one says so.
  - **31 predate it**, each an existing claim with nothing on this book to
    check: 13 on Morning CIO's routes (11 of them the money-weighted tile its
    strip does not show by default), 10 on the Portfolio Monitor's, 5 on Private
    Market's, and 3 others — a partial realised figure on a mandate's trades,
    the not-found drill-down's crumb, and the ledger's own window.

### Stage 10di — A MEMBER SELECTOR AT THE TOP OF THE DASHBOARD

*"There should be option to select each family member or family entity so that
the whole dashboard is then only showing information regarding that particular
family member … they should be able to multi select … The families and entities
page will remain the same."*

- **One selector in the top bar**, Whole family by default. Any members or
  trusts can be ticked together; the button reads the name, "Ajay + Ankita", or
  "3 members". The choice is `?members=` and survives a sidebar link.
- **One seam.** `scopePortfolio` keeps the chosen members' accounts and
  everything keyed on them — positions, the three sides, capital gains,
  commitments, dated flows. Every page reads the scoped book with no edit of its
  own. The suite holds each owner's book to the family's, to the paisa.
- **Family & Entities always shows every member** (`<WholeFamily>`).
- **What only the whole family has says so.** The NAV series is struck over the
  family's accounts together, so NAV vs Nifty 500, NAV & Performance's chart and
  Upload History's series say they are whole-family only rather than drawing a
  line under one member's name. Capital Gains, Ledger Insights, the Monitor's
  trades and export, and the search follow the scope.
- **A page about another member's holding says whose it is** (`OutOfScope`),
  never "no such account" or "fully exited", and offers to add them or show the
  whole family.
- **A scope with nothing in it is named, not drawn as ₹0.** The page says the
  members' accounts hold nothing a statement values, or that the address names
  nobody this book carries, and the top bar prints no total.

**Checks:** `memberScope.test.ts`; eight `check:pages` routes
(`cio-scope`, `family-scoped`, `cio-nav-scoped`, `history-scoped`,
`ledger-scoped`, `mandate-out-of-scope`, `polycab-out-of-scope`,
`cio-scope-unknown`), every expectation derived from `glowData.ts`; and a
`check:family` walk that clicks the selector, ticks two, follows a sidebar link
and goes back to the whole family.

### Stage 10dj — A BANK STATEMENT IS PUBLISHED ONLY WHERE ITS OWN RUNNING BALANCE TIES, AND ITS BALANCE IS IN NO TOTAL

*"Every single file in this zip needs to be integrated in the dashboard. Make
sure there are no logical or calculation errors."* — the client's
`Re__Ajay_sir_Statements.zip`: **11 files, 6 PDFs and 5 legacy `.xls` exports** —
three HDFC Bank savings accounts (one of them joint), two ICICI Bank savings
accounts, and the HDFC Bank NSDL depository statement for Ajay's own DP account.

**THE READERS ARE HERE AND THE STATEMENTS ARE NOT.** The family asked for
`source/october-2026/` to stay out of this repository, so nothing in
`public/audit/` carries a bank row and `BOOK_SUMMARY` does not move by a rupee.
What that costs is stated rather than glossed: no page renders one of these
documents, so `check:pages` can see none of this change (it walks main's own 378
combinations and this adds no route); the real-PDF halves of the ingest suites
have no subject and say so; and **three of the bug harness's cases have no
subject, named in its own footer** rather than left to read as a clean run. The
readers are exercised against grids built in the tests, from invented accounts
and narrations — a synthetic fixture never copies the family's own.

#### The decisions, each a wrong answer this document makes easy

- **THE ROW KIND IS `bank-statement`, NOT `bank-book`.** `bank-book` already
  means the cash leg INSIDE a PMS mandate — a manager moving a client's money
  between a trade and a dividend, with `Buy/Sell`, `Income`, `Expenses` and
  `Dep/With` columns — and `precedence.mjs` names it for `cashFlows` on six
  accounts. A savings account prints Withdrawal, Deposit and Closing Balance,
  and the money in it is the family's own. One type for both would let a savings
  statement supersede a bank book on an account that has one.
- **THE KIND IS DELIBERATELY NOT IN `CAPITAL_KINDS`.** A rupee leaving a savings
  account is not a contribution to anything. Some of these rows ARE the family
  funding a mandate, and which ones is a judgement the narration alone does not
  settle — §4c's rule: carry it, name it, and let the family answer.
- **THE CLOSING BALANCE IS IN NO TOTAL ON THIS SITE.** A bank balance is real
  money and it is not a holding: this book's `Cash` is the sleeve a manager or a
  depository reports inside an investment account, and summing a household
  current account into it would move every allocation weight and every return
  denominator on a decision nobody made. The document carries
  `excludedFromBook` with the reason, and **the question is open with the
  family.**
- **MATCHED ON ITS COLUMNS, NEVER ON ITS BANK.** "HDFC Bank" is the letterhead
  of a mutual-fund folio statement, an NSDL depository statement and a savings
  statement in this corpus, and "ICICI Bank" of a payment advice, an NSDL
  statement and a savings one — §"a phrase in a footnote is not what a document
  is", arriving at a sixth issuer. What a savings statement IS, and no other
  document here is, is a dated record printing a withdrawal column, a deposit
  column and a running balance beside them. Neither predicate reads a bank name,
  a customer id or an email; the statements print all three and the classifier
  never looks at any of them.
- **AND A NARRATION NAMES A MANAGER.** An RTGS to or from a PMS house prints
  that house's name, and one of these statements is claimed by V.E.C's own rule
  on exactly that. Three things stop it, in order: `classify()` resolves a
  savings statement on its COLUMNS before either house matcher is reached, each
  matcher refuses one anyway, and `genericProvider` — where the V.E.C answer was
  measured — names the bank first too. **So the two matchers' guards count their
  own refusals and the run prints the counts, where ZERO IS THE CORRECT ANSWER:
  a non-zero one means that order has changed and those guards are the only
  thing left between a narration and a misfile.** Printed even at zero, the rule
  `build-book`'s identity guards already follow — one that only speaks when it
  fires is indistinguishable, on a clean run, from one that was quietly deleted
  — and the suite holds the run to printing it unconditionally, because on every
  run while the order holds the honest count IS zero.

#### The tie-out is the licence, and it is struck in paise

A bank tape is the only document in this corpus whose whole content is dated
rows — no holding to cross-check, no mark, no second report of the same facts —
and it is also the richest self-checking one: it prints its own opening balance,
its own balance after every row, its own debit and credit totals, its own
transaction counts and its own closing balance. `tieOut` holds the rows to every
one of those the statement prints, **in paise integers**, and any failure
publishes NOTHING and says which check failed on which row. That is
`hdfcNsdl.mjs`'s own licence and `threePFlows`'s, applied to a tape.

- **PAISE INTEGERS, AND NO TOLERANCE.** Floating-point addition over several
  hundred rows drifts, and an allowance wide enough to absorb the drift is wide
  enough to absorb a misread paisa. The allowance that exists elsewhere covers
  a settlement derived from a four-decimal rate; nothing here is derived.
- **A CHECK WITH NO PRINTED FIGURE IS NOT APPLICABLE, NEVER A PASS.** ICICI
  prints no debit or credit total, so those two checks have nothing to compare
  against and say so.
- **A DERIVED OPENING IS LABELLED DERIVED.** ICICI prints none, so it is taken
  from the first row — and the running-balance check then covers rows 2..N and
  must not claim to cover 1..N. `flows.openingBalance` is null there, and
  `reconcile.mjs` skips row 1 for exactly that reason: checking it against a
  figure derived from it is a figure compared with its own copy.
- **THE NARRATION IS GATED DIFFERENTLY, because it is a description and not a
  figure.** HDFC hard-wraps it into fixed-width chunks that split mid-word, so
  rebuilding it is a question about spacing. A difference there is at most a
  warning; the gate is on the amounts.

**AND THE RECONCILER IS A SECOND PATH, NOT A SECOND CHANCE.** The reader
publishes nothing where it does not tie, so the running-balance step beside the
bank-book check is struck on the ARCHIVE the book actually reads: a merge, a
replay or a hand-edit that moved a row after extraction is a break the reader
cannot see. A row whose own balance could not be read **breaks the chain** rather
than being carried forward, which would make the next row's step look right over
two rows' movement.

#### A second layout on the HDFC depository, read natively

`Demat Holding Query Stmt` for Ajay's own DP account is the same bank's holding
statement from a different export: **a real text layer**, a different column set
and its own title, `HDFC Bank Depository Holding Details`. It has its own reader
(`readNative`), chosen on that title AND on the text being native — an OCR'd
page is never sent down it, whatever it seems to say.

- **THE OCR WARNING IS NOW CONDITIONAL ON THE GRID.** It fired on every document
  this provider read, and on a native page *"the words were recovered by
  rendering the page at 600 dpi"* is a false statement about how it was read.
  It is emitted only where `grid.textSource === "ocr"`.
- **THE HEADER IS FOUND BY ITS WORDS.** All eight labels on one line, or nothing
  is read — a changed export is reported as a header that did not match rather
  than as columns read at a guessed x.
- **A FIGURE BELONGS TO THE COLUMN WHOSE RIGHT EDGE IT SHARES**, and text to the
  column its LEFT edge starts at: the company names begin left of their own
  centred heading, so a boundary halfway between two headings would file the
  first word of every name under the ISIN column.
- **A WRAPPED NAME CONTINUES ON THE LINES BELOW ITS ISIN**, and every
  continuation belongs to the record ABOVE it. Nearest-by-y hands a company's
  last line to the next record whenever the gap below is smaller.
- **THE PRINTED TOTAL IS THE WITNESS**, and every row's balance × rate must be
  its own printed value. It values eight of ten rows; the two at exactly their
  face value are carried as quantities, by the same three tiers
  `faceValueBasis` already applies.

#### A `.xls` that is genuinely BIFF, and the value it stores

`lib/sheet.mjs` has sniffed the bytes rather than the extension since it was
written, because a broker's `.xls` here is an HTML table. **These five are
genuinely BIFF** — an OLE compound file, the two banks' own "download as Excel"
— and they are read as **WITNESSES** of the PDF beside them, carrying rows and
no facts, by the SheetJS the AMFI harvester already uses. `readBiff` is new;
nothing else in the pipeline could open one.

**A NUMBER IS ITS STORED VALUE, NEVER ITS DISPLAYED TEXT.** SheetJS hands back
both. A bank writes its amounts under the General format, which shows about ten
significant digits — measured on this delivery's own HDFC export, the displayed
text reads 208039138.56 as "208039138.6" and 3583688673.57 as "3583688674". Read
as text, **every large amount in a bank export loses its paise and the export
stops agreeing with the PDF it witnesses, by an amount that looks like
rounding.** `String(v)` is the shortest exact rendering of the stored double,
which is also what an `.xlsx` stores. A date stays the serial `readXlsx` leaves
it as; the same header opens a Word `.doc`, which comes back with `error` set
rather than as an empty grid reading as "the sheet is blank".

#### Seven defects in a branch no archived document reaches, and the suite that renders it

**THE BANK SECTION OF `build-book`'s REPORT HAD NEVER RUN**, because no statement
in the archive is one, and **READING A BRANCH IS NOT CHECKING IT**: it was
written, reviewed and read twice before anything rendered it, and the first
rendering found seven wrong claims in it. So it is rendered on every
`test:ingest` run now, by `scripts/ingest/__tests__/bankReport.test.mjs` over
`bankReportFixture.mjs` — **six synthetic statements of four synthetic accounts,
four published and two refused** — and every claim it makes is named there rather
than counted. It grew from four statements of two accounts at the G2 round below,
because the defect that round found needs a pair the four could not make: an
account that published a statement AND was refused on a NEWER one.

**IT WRITES NOTHING COMMITTED, AND PROVES IT.** `GLOW_AUDIT_DIR`,
`GLOW_BOOK_OUT` and `GLOW_BOOK_REPORT` point the whole build into a temporary
directory, and the suite takes a sha256 of `src/data/glowData.ts` AND
`docs/BOOK-REPORT.md` before and after and requires both unchanged — because a
test that rewrote the report as a side effect would land a synthetic bank section
in a tracked file, four invented accounts with balances on them. Pointing it at
the real path is a harness case, which is how that guard is watched firing.

What the first rendering found, each one a defect the suite now holds:

- **A FIGURE SHORT OF ITS PAISE.** `toLocaleString` with no fraction options
  printed `18,500.5` for a closing balance the bank prints as `18,500.50`, and
  `1,00,000` for an opening of `1,00,000.00` — in a section whose own sentence
  says every figure in it is one the statement PRINTS, and whose gate is struck
  on the paisa. One two-decimal formatter for the table and the total now. A
  portfolio market value elsewhere in that report is a derived figure to the
  rupee and loses nothing that way; a bank balance is not.
- **A LEAD ASSERTED OF EVERY ROW AT ONCE.** *"N statement(s) read completely"*,
  four paragraphs above its own counterexample — a statement the tie-out refused
  was parsed completely and published nothing, which is a different claim. The
  lead counts what published a tape.
- **A CLAIM NAMING FOUR RECONCILIATIONS AN ICICI STATEMENT CANNOT STRIKE.** It
  listed the running balance, both printed totals, the Dr/Cr counts and the
  closing balance; ICICI prints none of the last four, so four of the five were
  checks it could not supply a figure for — and the `Checks` column beside it was
  already counting them as n/a. It claims *every check the statement itself
  supplies a figure for*, which is the only form that is true of both banks.
- **A REFUSED ROW'S `Checks` CELL SILENT ABOUT THE REFUSAL.** It read `7 tied, 2
  n/a` beside a `Rows` cell reading *none published*, inviting a reader to wonder
  why nothing was published when every check tied. It leads with the failure.
- **A TOTAL THAT ADDED ONE ACCOUNT'S MONEY ONCE PER STATEMENT.**
  `bankAccounts` is one entry per DOCUMENT, so summing its closing column read a
  quarterly set for one account as several accounts holding several balances,
  under a sentence saying *across 3 account(s)* about one. It takes each
  account's NEWEST closing and says how many statements stood behind it.
  ***THE SECOND HALF OF THAT SENTENCE WAS WRONG IN THREE MORE WAYS, AND THE
  FIXTURE COULD NOT REACH ANY OF THEM — see the G2 round below.***
- **A camelCase FIELD NAME IN A SENTENCE.** `gate.notApplicable` is rendered
  verbatim, so `printed.drCount`'s key reached the prose as *"drCount: the
  statement prints none"*, beside *"debits total"* written out. The label is the
  written-out name now and the suite bans the four field names outright.
- **AND A SECTION THAT REPORTED A QUARTER OF WHAT IT HAD PUBLISHED.** It read
  `newestPerReportType`'s superseded set, which is right about a snapshot and
  wrong about a tape — `DATED_COLLECTIONS` already unions `cashFlows` across
  every issue for that reason. An account that sent four quarterly statements
  published four quarters of rows and reported one quarter's balances and one
  quarter's tie-out. It reads `allIssues`.

Three more came out of the same pass rather than being asked for: the n/a
checks are NAMED and not only counted, the refused statement names the check that
failed rather than pointing at `docs/EXTRACTION-REPORT.md`, and a derived opening
names the one row it cannot witness with that row's own amount.

**AND A SAVINGS STATEMENT IN THE ARCHIVE CHANGES NOT ONE BYTE OF
`glowData.ts`** — `BOOK_SUMMARY` and `accountsCount` included. Neither
`bankAccounts` nor `excludedAccounts` is emitted; both live only in the
in-memory book the report reads. That is the whole safety argument for landing
the delivery, so it is a measurement in the suite rather than a claim here.

**`makeCashFlow`'S TWO NEW FIELDS ARE CONDITIONAL SPREADS** (`valueDate`,
`reference`), and that is load-bearing rather than tidy: `JSON.stringify(…, null,
1)` writes a key whose value is `undefined` as nothing, but the archive's other
documents must come back byte-identical, and a harness case proves an
unconditional spread moves them.

**AND DATA AUDIT WILL NOT OPEN ON ONE BY DEFAULT.** Its tape is the family's own
banking, one narration per row naming a counterparty, so the page opens on the
first document that is NOT a bank statement and falls back only if that is all
there is. Measured on the committed tree: all 307 manifest entries carry
`reportType` and the default is unchanged.

#### What is open, and what is blocked

- **THE CASH QUESTION IS WITH THE FAMILY.** The closing balances are carried,
  named and in no total. Counting them is one line and is theirs to ask for.
- **THE DELIVERY ITSELF IS NOT LANDED.** `source/october-2026/` is out of the
  tree at the family's request, so the archive carries no bank document and the
  cross-check of each archived `cashFlows` row against its witness `.xls` — the
  one check that can only be struck on the real statements — is named rather
  than run.
- **AND THE WITNESS COUNT IS DERIVED, NOT TYPED.** `sheetWitness.test.mjs`
  counts the witnesses the manifest carries rather than asserting a figure: 11
  files are 6 PDFs and 5 exports, so the delivery would add 5 and not 6, and a
  typed total is a figure copied into prose that the next delivery makes false.

#### Five review findings, and the one that could have put a wrong figure through the gate

A review bot read the reader and raised five. **Each was traced to a concrete
input before it was acted on** — a P2 finding is a claim to verify, not an order
— and all five hold. Fixed in one commit:

- **An indented HDFC continuation lost its space.** `joinNarration` decided a
  space on the narration COLUMN's left edge, so a wrap indented past it was
  glued to the word above: `…PAYMENT` + `  REF 0012` came back as
  `PAYMENTREF 0012`. It compares against the CHUNK's own left edge now, which is
  what HDFC wraps on. **ICICI is deliberately left on its own rule** — it wraps
  on PIXEL width, so its join is a plain space except after a trailing `-` — and
  that is why the two continuation blocks are now textually distinct.
- **TWO SUMMARY LABELS COULD TAKE ONE PRINTED FIGURE, AND THAT IS THE ONE OF THE
  FIVE THAT MOVED A FIGURE.** The labels sit nowhere near their own columns, so
  each binds to the value whose centre is nearest — and decided per label,
  independently, a missing debits total hands `Debits` (centre 360) the Cr
  COUNT's `2` at 269, 91pt away against the credit total's 96. **A count of
  transactions reached the archive as a printed rupee primitive, and the debits
  check then failed against it.** The assignment is greedy over the (label,
  value) pairs and CONSUMES each value, so a label left over reads as not
  printed — which is what it is — and its check is NOT APPLICABLE rather than
  failed.
- **ICICI's serial gate said more than it meant.** `serials` was set wherever the
  LAYOUT had a serial column, whether or not any cell in it parsed, so a column
  the reader could not read made the gate assert 1..N over an empty list — a
  check that cannot fail dressed as one that held. It is
  `serialSeen && rows.length > 0` now.
- **A dateless ICICI row carrying money was absorbed into the row above.** The
  orphan test read the NARRATION alone, so a wrap carrying a withdrawal, deposit
  or balance reached no check — the one shape where a silent absorption moves
  money. `AMOUNT_FIELDS` decides it; a wrap carrying a cheque number, an IFSC or
  a UTR is still a wrap, because none of those is a figure the gate checks.
- **The excluded-accounts report asserted of every row what is true of one
  kind.** "No owner entry would ever bring it in" is right about the family's
  own bank accounts and false of a third party's folios, which an owner entry is
  exactly what would bring in. Each `excludedAccounts.push` site carries a
  `kind`, the intro states only what is true of every row, and each kind has its
  own paragraph. Rendered against a synthetic bank document in a scratch
  archive, which also caught the plural: one account read "Whether **their**
  closing balances…".

**AND THE CASE WRITTEN FOR THE SECOND ONE COULD NOT FAIL, which is the finding
inside the finding.** Harness case 34 reverts the greedy block, and its
strongest assertion — "no label takes a neighbour's figure" — passed with the
defect in, because **every other label still reads correctly under the
independent assignment**. It names the EMPTY cell as well now
(`val("Debits") === "—"`), because under the bug that cell prints `2.00`, the Cr
count read as rupees. Re-run, the case fires 5.

**AND THREE HARNESS CASES REPORTED NOT A RESULT ON THAT PASS, because these five
fixes moved their anchors** — 7, 12 and 13; the harness's own run below found
three more, for the same reason. All three re-anchored, and case 12
RENAMED: its patch drops the continuation's narration append, and the row is
still skipped by the gate's own check 0, so what it loses is the continuation's
TEXT rather than a row becoming a movement. A case whose name describes a
different defect is a case nobody can read.

**AND THE TRAP COMMENT STATED A FALSE PREMISE.** It claimed a 50-minute
`timeout` had fired mid-case and left a file patched. What actually happened in
this file's own session is the hazard from the OTHER side: a
`git checkout -- scripts/ingest/extract.mjs` run against a tree a live case had
patched, which is why that case's reported figure was thrown away rather than
recorded. The comment says so, and the hardening it justifies
(`trap restore EXIT INT TERM`) is kept — **Bash does not run an EXIT trap on
SIGTERM unless a SIGTERM trap exists.**

#### Four more findings, and the two that could never have failed

A second and a third review pass raised nine more. **Five had already been
fixed by the report work above** — the lead, the five-reconciliation claim, the
per-statement total, the camelCase label and the refused row's `Checks` cell,
each with its own harness case. The other four are recorded here because two of
them are the same shape: **a check written against a value that could not be
compared, so it held whatever the tree did.**

- **A VANISHED WITNESS SOURCE ONLY LOGGED A SKIP.** `bytesOf` fell back to a
  bare `existsSync`, which is how a WITHHELD delivery had to be able to skip the
  one check that needs a file's own bytes — and a skip keyed on "the file is not
  there" skips just as quietly for a file somebody DELETED, which is the one
  event this suite exists to catch. `committedExports()` walks `source/` too, so
  a deleted export also leaves nothing to expect: **both halves would have gone
  silent together.** `WITHHELD_SOURCE_PREFIXES` is an allowlist now, so a missing
  source outside it THROWS with the two things it could be, and a prefix covering
  nothing in the tree is said out loud rather than left as cover for the next
  deletion. On this tree it covers nothing, and the suite prints that: *"18
  witness(es) in the archive; 18 with committed bytes"* and *"the skip it allows
  has no subject here, and a missing source fails"*. Measured by hiding one of
  the eighteen — `askimpms_10032723_BankBook178CT.xlsx` — which fails the suite
  by name (`is archived as a witness and is not in the committed tree, and it is
  not under a delivery this suite knows is withheld`) where it used to be skipped
  in silence.
- **`UPSTOX_INSTRUMENTS[null]` ASKED FOR A PROPERTY NAMED "null".** The symbol
  table's two unlisted rows assert they are in neither map, and `symbol` is
  `null` on exactly those rows — so `symbol in UPSTOX_INSTRUMENTS` tested a key
  literally spelled `"null"`, always absent, and **the clause held whether or not
  the supposedly unlisted ISIN was in that map under a real ticker**, which is
  the one thing it exists to catch. The map's VALUES carry `NSE_EQ|<isin>`, so
  they are what is walked, and a hit names the ticker it was found under. It has
  a real subject: Sterlite Electric `INE110V01015` and Sterlite Grid 5
  `INE03QT01027`, neither of them among the map's 160 entries.
- **A THIRD BANK'S LETTERHEAD SKIPPED THE IDENTITY CHECK.** The two readings of
  which bank a statement is — the letterhead the classifier named, and the
  column labels the table's own header prints — were compared only where the
  classifier's answer was one of the two this reader reads
  (`PROVIDER.includes(meta.provider) && …`), so a third bank that reached here
  with its own name on it was archived under whichever of the two its columns
  resembled. **An account named for an institution that did not print it is the
  one thing a bank tape must never be filed as.** The comparison is
  unconditional now and the refusal says which of the two cases it is. What it
  does NOT close is named rather than guessed at, in the code: where a third bank
  prints a column set `bankStatementProvider` already knows, both readings agree
  and nothing here can tell them apart — closing that needs a POSITIVE reading of
  the bank's name off the page, and the statements this reader was written
  against are out of this repository, so a requirement that they name their own
  bank somewhere this reader tests for cannot be verified here.
- **AND AN UNREADABLE TRAILING ICICI PAGE WAS SKIPPED IN SILENCE.** A page whose
  table does not resolve is skipped, which is right — but ICICI prints no
  transaction counts and no printed totals, so on that layout nothing downstream
  notices a lost page, and a TRUNCATED tape reconciles perfectly against its own
  first and last rows. HDFC's does not have that hole: a lost page there breaks
  the gate on the statement's own printed counts. So a skipped page is now
  EXAMINED rather than trusted — `movementsOn` reads it for a dated row carrying
  two figures — and a page carrying a movement refuses the whole document,
  naming the page and the row. A caller that did not scan at all gets NOT
  APPLICABLE and never a pass. Cases 36 to 40 are that work, two of them the
  threshold itself: a dotted date matches the money pattern on its first two
  components, so counting it made a threshold of two into a threshold of one on
  this bank's own layout and every closing sentence refused the tape.

**THE OTHER TWO P1s NEEDED NO CODE, AND BOTH ARE ANSWERED IN THE READER RATHER
THAN HERE.** The first ICICI row's own amount has no witness — `opening = b1 + d1
− c1`, so the chain takes that step straight back out and row 1 passes whatever
its amount is, and ICICI prints no debit total, no credit total and no Dr/Cr
count, so **there is nothing to invent a witness from**. Refusing every ICICI tape
over one unwitnessed amount would throw away every row that IS witnessed, so the
gate says what it could not check, naming that row and its own movement, and
counts it apart from its passes. And a reader that starts refusing its own output
keeps its `partial` status, so `guardAgainstShrinkingTheArchive` cannot see it on
a count of readable documents — which is why its second half is struck on the
FACTS each document retained, the sections already in the manifest, and refuses a
run where any document publishes fewer.

`build` · `tsc` · `test:ingest` (every suite passes — `bankStatement 182`,
**`bankReport 42`**, `hdfcNative 177`, `sheetWitness 311`, `septemberAudit
103632`, golden 140 passed, 2 not checked, 0 blocked) · `test:family` 0 failed ·
`check:family`
**127/0** · `check:pages` **382 combinations clean, 0 invariant failures** —
`main`'s own count to the combination, because this change adds no route and
`scripts/check-pages.mjs` is **`main`'s byte for byte**, so each of its 53 NOT
CHECKED lines is an existing claim with nothing on this book to check and not one
is this change's (read out of `report.json` by route) · `npm run build-book` twice,
byte-identical — and `src/data/glowData.ts` is **`main`'s byte for byte**, which
is the whole safety argument: neither `bankAccounts` nor `excludedAccounts` is
emitted to it, so a report-prose change moves no figure · `coverage:source` exit
0 with **Unread 0** · `replay:owners -- --check` a no-op, and `replay:calls`,
`replay:flows`, `replay:movements`, `replay:dedupe` and `rekey:archive` with it.

**`scripts/dev/bank-statement-bug.sh` puts 59 bugs back one at a time**, after a
control that came back clean on BOTH suites — 182 reader checks and 42 rendering
ones, nothing failing — and every one of them is caught. Its subject is the
INGEST rather than the sweep, for the reason above: with the delivery out of the
tree no route could see one of these bugs. **The count is 59 and not 58, which is
why it is measured rather than carried in prose**: case 9 has a `9b` beside it, a
three-decimal figure rounded into shape where 9 is the same tie-out struck in
floating-point rupees. Cases 1–40 and 9b break
the reader or the pipeline and are watched by `bankStatement.test.mjs`, and
**cases 41–58 break a claim in the report's bank section and are watched by
`bankReport.test.mjs`** — the reader's own suite runs on every one of those too,
deliberately, so a patch to the REPORT is shown to move nothing the reader does.
Three more are available and have **no subject in this tree** — they need the
archive to carry a bank tape — and are NAMED in the harness rather than shipped
as clean cases, because a clean case proves nothing.

**AND THE CONTROL HAS TO RUN THE RENDERING SUITE, because a case from 41 on is
read as "these checks fire and the others do not"** — which says nothing at all
if the unpatched tree already fails some of them. That is the finding this file
already records from Stage 10dh's own pass, where a worktree's stale read models
made every `monitor-txns` invariant fail under the control and two cases were
read as results.

**AND THREE MORE CASES REPORTED NOT A RESULT RATHER THAN A CLEAN SWEEP, every
one of them for the same reason as the three above: its anchor went stale in a
fix made since it was written.** Case 4 patches the Dr/Cr comparison, and the camelCase fix (case 48's
own subject) renamed its index from the written-out `label` to the field `key`.
Case 16 patches the letterhead-against-labels condition, and case 35's fix moved
the `PROVIDER.includes` term out of that condition into the refusal's own
wording. Case 31 drops `orphans` from the call into the gate, and the
page-scan work behind cases 36–38 added `skipped` to the same call and wrapped it
onto a second line. All three re-anchored and all three fire — 5 checks, 4 and 4.
**A patch that no longer applies proves nothing however clean the run looks**,
which is the whole reason the harness reports it as not a result, and it is the
only thing that found any of the three.

So the pass ran twice, and what it establishes is split between the two runs
rather than claimed of one: the whole-harness run carried the clean control and
53 of the 54 cases firing (4 and 16 among them, already re-anchored), and case 31
was NOT A RESULT there and fires on its own re-run, with the trap-backed restore
putting `orphans: read.orphans` back on the gate's own call — verified in the
reader rather than assumed. **Case 25 is the one case the bank suite is right to
sweep clean**: it adds `valueDate` and `reference` unconditionally to every cash
flow in the book, which moves nothing a bank statement does and breaks the
archive byte-identity on four documents this change never touches — `askArf` on
both ASK Absolute Return Fund folios and `buoyantSnap` on both Buoyant ones, two
checks each — so it is judged on the whole ingest run and reported as caught
there.

#### G2: three claims in one sentence, and a fixture that could not reach any of them

The total under the table read *"Their closing balances come to **X** across N
account(s), each taken from the newest of its M statement(s)"*, and every clause
of it was wrong in its own way. **A fifth review pass raised it, and tracing it
against the renderer found three defects rather than one:**

- **THE SELECTION RAN OVER THE PUBLISHED ISSUES ALONE.** An account that
  published a statement and was REFUSED on a newer one had its older balance
  described as the newest. The selection runs over EVERY issue now and takes the
  newest that published.
- **THE STATEMENT COUNT WAS GLOBAL, WORN AS A PER-ACCOUNT CLAIM.** *"each taken
  from the newest of its M statement(s)"* printed one M over accounts holding
  two, two and one — a figure that is true of no account, in the form of a
  figure true of each.
- **AND AN ACCOUNT WHOSE EVERY STATEMENT WAS REFUSED CONTRIBUTED NO BALANCE AND
  WAS NOT NAMED.** That is §"a figure that exists for SOME accounts is shown for
  those and the rest are named — including in the total's own caption", failing
  in the one caption that rule names.

**THE REVIEW OFFERED TWO REMEDIES AND THE SECOND IS TAKEN: "label it the latest
*reconciled* balance with its date" rather than "omit the balance".** Omitting a
reconciled figure because a LATER statement could not be read withholds a
measurement the bank printed and this reader tied to the paisa; what is unknown
is only what moved AFTER it, and that is nameable. So the total reads *"Their
latest reconciled closing balances come to **X** across N account(s), from the M
statement(s) they sent"*, an account reconciled to older than its newest
statement is NAMED WITH BOTH DATES under a heading saying the balance is not the
newest, and an account whose every statement was refused is named as
contributing none.

Rendered on the enlarged fixture: **₹3,07,501.25 across 3 accounts from 5
statements**, HDFC …0003 named as reconciled to 2026-06-30 with its 2026-09-30
statement refused, and HDFC …0002 named as contributing nothing.

**THE FIXTURE HAD TO GROW, BECAUSE NONE OF THE THREE IS REACHABLE WITHOUT THE
PAIR.** Four statements of two accounts cannot make an account that published AND
was refused on a newer one, so every one of these defects rendered correctly on
it — which is the shape this file already records of a branch nobody rendered.
It is six statements of four accounts now, and the pair is HDFC …0003: Q1 ties,
and Q2 is refused on a printed debits total of 9,999.00 against rows summing to
1,000.00.

**AND THE SUITE DERIVES EVERY CLAIM FROM THE TABLE'S OWN ROWS**, never from a
literal: the total is summed from the rows the section printed, the account count
and the statement count are grouped off them, and an account reconciled to an
older date is found by comparing each account's issues rather than by naming one.
A literal would have to be re-typed every time the fixture moves, which is how a
check comes to assert a figure nobody measured.

**AND RENDERING IT FOUND AN UNTERMINATED BOLD PHRASE** — an odd `**` left open,
so every following paragraph rendered bold. **THE CHECK WRITTEN FOR IT THEN
FAILED A CORRECT PAGE**: struck per LINE it fired on a bold phrase this file
legitimately hard-wraps across two of them (*"**Whether these balances should
be / counted is the family's to answer**"*). It is struck per blank-line-separated
PARAGRAPH, with that reason beside it — the same mistake as a boundary a page is
free to print, arriving in a markdown counter.

**FOUR HARNESS CASES, AND THE FIRST FIRED FOR THE WRONG REASON.** Case 55 was
first aimed at the selection filter, which made `byNewest` empty for a
refused-only account, so the renderer THREW and the three failures named the
render rather than the claim — and re-reading the pre-fix code showed the patch
was not the faithful reintroduction anyway, because the old `at` was already the
newest PUBLISHED issue. What it lacked is the `behind` comparison and the
wording, which is where case 55 is aimed now. All four fire exactly their own
checks: 55 the two naming-the-older-date ones, 56 the total's own, 57 the two
counting ones, 58 the refused-only account's.

**AND G4's REAL DEFECT WAS IN A TEST, NOT IN THE CLASSIFIER.** The review asked
for an unlisted preference share's asset class to change; that is declined, and
for a reason the code already carries — `assetClassOf`'s own doc comment decides
this case the other way and names NSE India Ltd, the same function grades the
ICICI statement's 24 par rows, and the claimed failure path does not exist (a
face-valued row is filtered out of positions before `marketSideOf` sees it, and
the live layer needs a symbol resolved from identifiers, which an unlisted
company cannot supply). **What WAS wrong is `hdfcNative.test.mjs` asserting a
conclusion about LISTING STATUS from a fact about the symbol maps** — *"UNLISTED,
so no symbol can exist"* over a check that reads two committed files. **HEG is the
standing counterexample: it IS listed and resolves no symbol here**, because NSE
renamed the listing and the book prints no ISIN to join on. The comment, the
section header and three labels say what is measurable from the tree — that
neither map carries the ISIN — and name the filings as the source of the
unlisted reading, which no file here holds.

#### Merged with main, which took this letter

This was written as `10dh`. **#116 — the review as the source of the private
book — merged first and keeps it**, so this section is `10di`; the letters were
compared as HEADINGS against main's tip at merge time, and the merged file
differs from main's by `10di` alone, with main's ten historical duplicates
unchanged. Every line naming `10dh` was placed by which side's own copy carries
it before any moved: **ours are two** — this heading and the `readBiff` pointer
in the ingest list — and **main's twelve stayed**.

Two files conflicted, and both were resolved as a UNION rather than by taking a
side: `build-book`'s returned book keeps `bankAccounts` beside main's three
`review*` fields, and this file places main's section first. Six more merged
without a marker, which is when this file says to read them: every one is main's
byte for byte, and `check-pages.mjs`'s probe literal needed no union at all —
**this change adds no route and touches no page-check code**, so the ctx-key
union the brief asks for is a no-op, stated as one rather than invented.

**AND THE GENERATED BOOK WAS REGENERATED RATHER THAN TRUSTED TO THE TEXT
MERGE.** `build-book` over the merged builder reproduces `glowData.ts` and
`docs/BOOK-REPORT.md` byte for byte against what git produced, which is the only
thing that could have said so.

#### …and a second time, for #119, with no letter to move

**#119 — the accounts table regenerated, and its own rule made enforceable —
landed while the G2 round was being verified, and added NO stage heading**, so
`10di` stands and nothing had to be classified. The letters were compared as
HEADINGS against main's tip anyway: the merged file differs from main's by `10di`
alone and main's ten historical duplicates are unchanged.

**NOTHING CONFLICTED, WHICH IS WHEN THIS FILE SAYS TO READ IT.** CLAUDE.md
auto-merged, and the merge is the exact union measured in both directions:
against main's copy it differs in two places, the `readBiff` pointer in the
ingest list and the whole of this section, and against this branch's own
pre-merge copy only in #119's regions — the accounts table and its Build entry.
`package.json` took #119's new script and `scripts/dev/accounts-table.mjs` is
main's byte for byte; no code file overlaps, because this branch changes the
readers, `build-book` and the suites, and #119 changes none of them.

**AND #119's OWN CONTROL RUN IS WHAT SAYS THE MERGE LEFT ITS TABLE ALONE.**
`npm run accounts-table -- --write` reports 64 accounts, a printed column of
₹8,33,79,57,613.76 against `BOOK_SUMMARY.totalValue` of the same, **delta 0**,
and *"CLAUDE.md already carries this table (66 lines), unchanged"* — which is the
only thing that could establish it, since a table merged into the wrong shape
still reads as a table.

(Written as `10di`. #122 — the member selector — took that letter while this waited,
so this section is `10dj`; the headings were compared against main's tip.)
### Stage 10dk — GREEN LANTERN 510861 SINCE INCEPTION, AND A REGISTER LONGER THAN ITS WINDOW

*"integrate this new data from the client into the dashboard data without any
logical/calculation errors"* — `source/october-2026/`: Green Lantern 510861's
capital register and transaction statement, both since inception (16 Jan 2025 →
22 Sep 2026). 516 trades and 48 register rows reach the archive (309 documents).
**`BOOK_SUMMARY` does not move, and `glowData.ts` is byte-identical to main.**

- **A header label printed ABOVE the header line.** The transaction statement
  prints "Settlement" above its header and "Date" below it. `findTable` takes
  that line as a donor only with `labelLineAbove` (the PMS transaction reader
  opts in), only if nothing else on it reads as a label or a figure, and only
  where it maps strictly more columns. Re-reading all 21 archived PDF
  transaction statements gives the same trades; V.E.C's two now fill their
  settlement dates.
- **A register from inception prints no opening-balance row.** Its first
  balance is its own amount, so it opens from nil, and its walk is witnessed.
- **The money-weighted window is cut to [opening value date, account as-of].**
  Read whole, the register put the ₹10 Cr Corpus Deposit in twice (as itself
  and inside the 1 Apr 2026 opening value) and eleven TDS rows (₹30,846.80)
  after 27 Jul into a value that does not hold them yet. Measured with the cut
  removed: the tile reads 24.1% over 574 days instead of 26.5% over 134.
- **A dated capital move after its account's value date is named, not listed.**
- **The register ties to the manager's own Net Capital In/Out** (FY and since
  inception) once the two TDS rows dated 10 Aug, the statement's own day, are
  left out — named in `docs/BOOK-REPORT.md`.

**Checks:** `pmsReaders.test.mjs` (the donor line, both ways, and a header that
already reads is unchanged), `accountXirr.test.ts` (every flow inside its
window, no move after its account's value date) and
`capitalRecordArchive.test.ts` (register days after the value date are ABSENT,
load-bearing on this register). Six bugs put back, each caught: donor off,
donor removed, donor winning ties, and the opening, closing and value-date cuts.

**THE LETTER.** Written as `10dj`; #118 (bank statements) merged under `10dj` first, so this is `10dk`. Main's lines naming `10dj` stay; this section's three pointers moved.


### Stage 10dl — THE MOVERS' THIRD BRANCH: THE COMPANIES INSIDE THE AIFs AND THE MANDATES

*"In the daily movers section we have 2 scopes as of now, Direct equity and ETF
and mutual funds. We need to add another section that would be AIF and PMS …
I hope you understand that we will not show that particular AIF or the PMS that
is having the highest gain or lose but we will show the holding inside all of
the AIF and PMS which are having the highest daily gain or lose."*

**THE WRAPPER IS NEVER A ROW, AND THE FAMILY RULED IT OUT IN THE SAME SENTENCE
AS THE ASK.** A card headed AIF & PMS that ranked the folios would answer the
opposite question: a Category III fund strikes one NAV a month, and a mandate's
own day move is thirty shares blended into a figure nobody picked. So
`src/lib/insideMovers.ts` ranks **COMPANIES — 161 on this book** — and
`InsideMovers.tsx` names the vehicle each is held through under it. The toggle's
third branch, at `?movers=inside`, beside Direct Equity and ETFs & mutual funds.

**`TodaysMovers` COULD NOT HAVE BEEN WIDENED TO IT.** It is scoped to
`DIRECT_EQUITY_BUCKET` — who CHOSE a holding, the axis Stage 10L settled after
the family reported the same thing three times — and a share a manager picked is
the one thing that bucket exists to exclude.

#### 1. Two halves, one percentage, and two money figures that are never added

The branch covers the two allocation rows the family named, and each reaches a
company by a different route:

| | How it reaches a company | The day move | The rupee impact |
| --- | --- | --- | --- |
| **PMS mandates** · ₹138.70 Cr | the statement itself — a PMS reports every share | the exchange's | **MEASURED** · 131 of 141 names priced |
| **AIF** · ₹371.87 Cr | the fund's own portfolio disclosure, on 1 of 11 folios | the exchange's | **DERIVED** — `familyValue`, the units times a month-old weight — and **no rupee impact at all** |

**THE PERCENTAGE IS THE EXCHANGE'S OWN FIGURE, THE SAME NUMBER EITHER HALF WOULD
USE.** A company moved what it moved, however the family reached it — which is
the whole reason one card can rank both halves against each other, and why 30 of
the 161 companies are ranked on a disclosure alone. What differs is the MONEY,
and the two are never added: a measured rupee change and a figure derived from a
weight struck a month ago are not one measurement. Two tiles, each naming its
own coverage — **131 of 141 names over the mandate bucket's own value, and 1 of
11 funds over the AIF row's ₹371.87 Cr** — and the AIF half says **derived · in
no total** on its face, in words rather than a tooltip.

**THE DERIVED FIGURE IS A CHIP UNDER THE NAME, NOT A FOURTH MONEY COLUMN.** Two
money figures in adjacent columns under one heading is the caption failure this
file has paid for twice; under the name it reads as what it is, a figure about
how this family reaches the company rather than a second measurement of the day.

**AND THERE IS NO INDEX STRIP, WHICH IS A DECISION.** Today's movers sets the
priced direct-equity book against the Nifty 500 because both are a day's move on
one basis. Neither half here is: a mandate's shares are a manager's picks and a
disclosed line is a month-old weight, so a gap against an index would read as
performance the card cannot measure.

**ONE WORDING FOR THE ONE REFUSAL BOTH HALVES SHARE.** `ACTION_BASIS` is the
sentence a share whose count the corporate-action capture has not verified
carries (#104's gate, Stage 10cr), written once so the measured and the derived
half cannot word it apart.

**AND THE CARD REGISTERS WHAT IT NEEDS RATHER THAN WAITING ON WHAT NOBODY ASKED
FOR.** `PortfolioContext` grew a `requestSymbols` seam — an `extraSymbols` ref
and an `extraTick` counter, so a GROWING ask re-runs the poll — because
`pendingAmong` counts a symbol nobody requested as PENDING, and the card hung on
the loading state for ever: 163 symbols in its own scope, **135 of them already
in the book's ask and 28 registered by the card**. `scopeSymbols` is every
symbol it waits on, both halves and nothing wider, so the two measurements
settle together and the card never ranks half a scope.

#### 2. Buoyant's snap page 3 — the one AIF portfolio in the archive

Stage 10df named it and left it: *"Buoyant's fund holdings (42 lines, % of
assets) are archived and drawn nowhere … they could join the look-through, which
changes the partition every stock-axis figure rests on. That is a change of its
own."* This is that change, and the partition is untouched — **because the
disclosure is its own model and not the look-through's.**

- **`public/lookthrough/` IS THE AMCs' MONTHLY FILINGS, and it is load-bearing
  elsewhere.** Every line there carries an ISIN and a value, and
  `companyExposure` — the Monitor's stock axis, Sector Composition's
  Consolidated view, every figure the five buckets partition — rests on it. A
  snap prints a NAME and a WEIGHT. One model over two sources would have moved
  that partition to show a card.
- **`deriveFundDisclosures` in `src/lib/ledgerModel.ts`** builds
  `fund-disclosures.json` instead, read by `src/lib/fundDisclosures.ts` and by
  nothing else. It is keyed on the document's **own holding keys**, never on the
  account, because both Buoyant folios print the identical disclosure and the
  family holds the same fund in each; a document with a disclosure and no family
  holding is skipped, which is how WhiteOak's 176-line scheme filing stays out
  of it exactly as it stays out of the book. The newest `asOf` wins, with the
  docKey as the tie-break.
- **`pctCovered` IS SUMMED FROM THE LINES, NEVER 100 LESS A RESIDUAL.** The snap
  prints `Others 7.13%` and its named lines add to **92.88%**; deriving the
  coverage from the residual would be a second figure for one thing, free to
  disagree with the rows under it.

**THE READER PUBLISHES THE TABLE ONLY WHERE THE SNAP RESTATES ITSELF.**
`buoyantSnapSchemeHoldings` in `altFundStatements.mjs` rides on the
`portfolio-snap` variant's own gate — page 3 must restate page 1 and the
holdings table must tie — which is the licence Stage 10da established for that
document. Three refusals, each a wrong row avoided:

- **`Others` IS NOT A COMPANY.** It is the residual, and filed as a row it would
  be the largest single "holding" in the fund.
- **A NAME AND A WEIGHT IS ALL IT PRINTS**, so `isin`, `industry`, `quantity`
  and `marketValue` are `null` and never zero — a ₹0 market value on a line the
  fund holds is the fabrication this book exists to prevent.
- **THE NAME IS CARRIED AS PRINTED.** The extraction renders `&` as `and` on
  most lines and as `n` on `LnT TECHNOLOGY SERVICES LTD`; repairing it here
  would be a presentation layer repairing identity, which §1 forbids — the join
  is `securityKeyOf`'s to make and the archive keeps what the document said.

**`npm run replay:flows` LANDS IT WITHOUT THE PASSWORDS**, which is the sixth
faithful partial replay's own contract (Stage 10bv): it now carries `returns`
AND `schemeHoldings` through a `fields` array, each only ADDED where the archive
holds none, a refusal naming which field it would have moved, and `--check`
writing nothing.

**AND THE RING-FENCE IS APPLIED ON THE BUILD SERVER**, exactly as
`functions/api/stock-exposure.ts` applies it to the look-through:
`build-read-models.mjs` passes `new Set(BOOK_POLYCAB.map(p => p.securityKey))`
into `deriveFundDisclosures`. `ledgerModel` is about the ARCHIVE and the fence
is a decision about the BOOK, so the decision cannot live in the derivation.
Keyed on the key alone — a disclosure prints no identifier — and dropped
SILENTLY, because naming it would put the word on a page the fence says must not
carry it (Stage 10aj).

#### 3. The symbol map's fill-only second pass

A disclosed company reaches no price without an NSE symbol, and
`build-nse-symbols` read statement holdings alone. `securitiesFromArchive` is
two passes now, on `shared/sectors.mjs`' own tier rule applied to a NAME: **pass
2 adds a key pass 1 did not produce and never touches one it did.**

**AND IT IS GATED ON THE DOCUMENT CARRYING A FAMILY HOLDING.** Ungated, pass 2
adds **183 keys** — every company every scheme filing in the archive mentions,
including the 176 of WhiteOak's disclosure the family does not hold through it.
Gated, **31**, and the map goes **174 → 201 keys**: 30 added, **not one of them
named anywhere in `glowData.ts`**, which is what says the pass filled a gap
rather than overruling a statement. Nine of Buoyant's 40 disclosed companies
were already in the book under the family's own spelling and keep it.

Three more things the pass forced:

- **THREE ALIAS KEYS RETIRED** — `crompton-greaves-consumer-elec`, `sbi` and
  `the-karur-vys`, each with 0 occurrences left in the book since Stage 10cc
  merged them.
- **`heg` → `HEGAM`, committed as an override with its corroboration.** NSE
  renamed the listing (HEG Advanced Material), and Stage 10br left it unresolved
  because the book prints no ISIN for it and *"a name is all there is to join
  on"*. NSE's own master row carries ISIN INE545A01024 listed 10-MAY-1995 — an
  identifier nobody in this join controls — so the override is cited rather than
  guessed. **SVAN's statement prints no symbol at all** — `Position.symbol` is
  `build-book`'s output from this map — so the override reaches the position
  only once the book is regenerated. The first push of this change did not
  regenerate it, and CI's `build-book` diff failed on exactly two lines: SVAN's
  two HEG positions, `HEG` against `HEGAM`. Regenerated, the card, the book's
  ask and the quote feed all ask `HEGAM`, and two maps keyed on the old symbol
  followed it: `npm run build-upstox-instruments` now maps **162 of 162**
  symbols (HEGAM by its exact symbol; ESDS was missing from main's own map too,
  measured on a worktree of main), and `npm run build-sectors` re-keys
  screener.in's sector under `HEGAM`, so SVAN's HEG keeps its Industrials
  placement. The same rebuild places ESDS (Information Technology), which
  main's sector map lacked as well. `docs/SCREENER-SECTORS.md` reads **161
  placed, of 162 company shares carrying a symbol** — two keys resolve to
  CLEANMAX, so 161 is every distinct symbol — and the cross-check is still 80
  of 84.
- **A DISCLOSED-ONLY ROW IS MARKED, AND ITS COUNT PRINTS AT ZERO.**
  `docs/SECURITY-IDENTIFIERS.md` gains a `From` column on both tables, a
  disclosed-only row's unresolved reason reads *no issuer to ask for an ISIN*
  (there is no statement to request), and the disclosed-only count is printed
  **even when it is zero** with every unresolved name listed — a count that only
  speaks when it fires is indistinguishable, on a clean run, from one that was
  deleted. Measured: **201 reachable · 92 not reachable · 8 not securities at
  all**.
- **AND IT GAVE COMPANIES HELD ONLY INSIDE FUNDS A SYMBOL, WHICH MOVED TWO
  CHECKS OFF THEIR SUBJECT.** Stage 10ck's page for such a company says its
  price history and research are absent because no symbol was looked up. Of the
  book's 475 fund-only companies, **33 resolve a symbol now: 13 already did on
  main** (a depository's recorded line), **and the pass added 20** — HDFC Bank,
  the largest, among them. With a symbol the page draws the price card and the
  research card (`researchAbsent = fundOnly && !sym`), which is right, and
  `stock-funds-only-market` and `-research`, which walked HDFC Bank, failed on a
  correct page. `HELD_BOOK` now derives two subjects off the committed symbol
  map: the largest fund-only company with no symbol (`fundsOnlyNoSym`, which the
  two routes walk now) and the largest with one (`fundsOnlySym`). Two new routes,
  `stock-funds-only-sym-market` and `-research`, assert the absence is NOT drawn
  there. Main walked only the largest, which had no symbol, so the symbol branch
  had been checked by nothing.

#### 4. The fixture's own gate, and the defect its first draft had

`cio-movers-inside-live` serves the live layer from fixtures built out of the
book (`installLiveMocks`), and a disclosed-only company has no statement mark to
price × 1.10 — so `DISCLOSED_MARK_BY_SYMBOL` gives each a synthetic
`DISCLOSED_BASE` of ₹1,000. **ITS FIRST GATE ASKED A KEY-LEVEL QUESTION ABOUT A
SYMBOL-KEYED ROUTE, AND THAT IS THE ROOT OF IT:** `/api/quotes` is keyed on the
SYMBOL, so pricing a symbol prices every holding that resolves it. Measured, the
key-level gate produced **51 symbols where its own comment claimed 30** — and
among them POLYCAB, CLEANMAX, and the symbols of **15 of the 23
`DEPOSITORY_SHARE_BOOK` rows**, which the page then drew as direct-equity rows:
16 + 15 = the 31 names that walk was ranking.

So the gate is struck on SYMBOL-LEVEL REACH — every symbol any book position,
any depository share row or any named key already reaches is excluded — and it
yields **28**. `DISCLOSED_MARK_BY_SYMBOL` is declared AFTER
`PRICED_DEPOSITORY_ROWS` for exactly that reason: the gate has to be able to read
`DEPOSITORY_SHARE_BOOK`.

**AND THE CARD'S OWN MEASUREMENT CORROBORATES IT BY A SECOND PATH.** Its scope is
**163 symbols**, of which **135 are already in the book's ask and 28 are
registered** — the same 28, reached through the card's `p.symbol`-first
precedence rather than through the raw map. A first measurement of that read
`HEGAM` as a symbol the book does not ask for. It was measured against a
`glowData.ts` that had not been regenerated after the override, so the book
still asked `HEG`; on the regenerated book every half asks `HEGAM`, and the
counts are as stated.

#### 5. Eight checks, and the two corrections they needed

`INSIDE_BOOK` re-expresses the card's book off `src/data/*` and `public/audit/*`
— never by importing `insideMovers.ts`, which is the code under test, and never
from `public/views/`, which is gitignored, derived and hash-named. Measured:
**141 mandate companies, 11 AIF folios, 40 disclosed companies across 11 funds
of which 1 discloses, 161 ranked, 131 priced in the mandate half, 36 in the
disclosed half, 30 reached only inside a fund, 0 ranked by % move alone**, over
₹371.87 Cr of AIF and ₹138.70 Cr of mandates. Where the book cannot be derived
the block is one check that returns `false`, so an unreadable book fails the
route loudly rather than leaving every claim unable to run.

`INSIDE_SCOPE` (1) asserts the toggle shows this branch and **neither of the
other two**, so two cards drawn at once cannot pass. `INSIDE_CARD` (7) asserts:
no row is a folio or a mandate itself and every row is one of the ranked
companies — **the only claim struck on KEYS, because a row reading `ICICI Bank
+10.00%` is identical whether it is the company or the wrapper**; the two
coverage figures are never one figure; the derived half is fenced on its face in
words; a row drawn off a disclosure alone names its fund, and the fund-only line
counts the 30; a share the capture has not verified is ranked by % alone, and
where there are none **the line must be ABSENT rather than drawn at zero**; and
the ranking spans both halves — **161 gainers on the fixture, not the 131 of the
mandates alone or the 36 of the disclosures alone**.

**TWO OF THEM WERE WRONG BEFORE THEY WERE RIGHT, AND BOTH ARE TRAPS THIS FILE
ALREADY RECORDS:**

- **A LIVE FIGURE CANNOT BE COMPARED AGAINST A STATEMENT ONE.** The coverage
  check first set the mandate half's rendered value against the book's own,
  which is the statement basis — and that half is LIVE. It is a BOUND now
  (`>= book − 0.06 && <= book × 1.10 + 0.06`, the fixture's own factor and the
  page's printing precision reproduced) plus the EXACT names count, where the AIF
  half stays exact to ±0.06 Cr because no AIF folio resolves a symbol and nothing
  there can move.
- **`label-xs` IS `uppercase` AND `innerText` RETURNS THE TRANSFORMED TEXT**, so
  `/(\d+) gainers/` matched nothing against a card rendering `161 GAINERS`. The
  third time that trap has bitten here, after Stage 10p's "Listed NAV" and Stage
  10at's left-out card; fixed with `/i`.

**AND THE WALK WAITS FOR THE CARD, BECAUSE IT ASKS FOR ITS PRICES TWICE.** The
first price request is the book's own ask (162 symbols); the card then registers
its 28 more and a second request follows (190). `networkidle` can settle between
the two, and under the full sweep's load it did: `cio-movers-inside-live` failed
seven checks on a card still loading, and passed alone. The walk now waits for
the card's mandate tile (or its no-feed state) before it reads anything.

**AND A CLAIM THAT NO NAMED LINE IS A POSITION IN THE BOOK WOULD BE FALSE**, so
it is not made: `ICICI BANK LTD` normalises onto `icici-bank`, which the family
does hold directly. The disclosure's own lines are not a set apart from the book.

#### Merged with main, and the letter moved twice

Written as `10dj`. #118 (bank statements) took `10dj` and #126 (Green Lantern
510861) took `10dk` while this waited, so this is **`10dl`**. The #126 merge
raised no conflict marker: two sections sat under one letter and only the
headings check found it. This section's pointers (the `fundDisclosures.ts`
Layout bullet and the `build-symbols` entry) and its code comments moved; main's
lines naming `10dj` and `10dk` stayed. `build-read-models.mjs` conflicted with
#123 and is a union: `buildConsolidatedSheet` beside `BOOK_POLYCAB`.

On the tree merged with #118, #123, #124 and #125: `build`, `tsc`,
`test:ingest` (golden 140 passed, 2 not checked, 0 blocked), `test:family`
exit 0, `build-book` byte-identical, CI green. `check:pages` walked 406
combinations with one finding, *the page does not scroll* on `family`, and
**main's own build fails the same check**, measured on a worktree of main
before #126. It is main's, from a change after #122's sweep, and is named here,
not fixed.

### Stage 10dm — FAMILY & ENTITIES STOPS SCROLLING, WHERE #122 NAMED IT AND LEFT IT

Stage 10dl's own note records the full sweep finding *the page does not scroll*
on `family`, measured failing on main's own build and named rather than fixed:
*"It is main's … and is named here, not fixed."* This is that small fix.

**THE TABLE CARD HAD OUTGROWN THE PIE BESIDE IT.** Stage 10bl laid the entity
table (`lg:col-span-2`, LEFT) beside the in-house-vs-external custody pie (RIGHT)
on `items-start`, which was right while the pie's ~17-row legend was the taller
card. Two later changes made the table the taller one, and neither is removable:
#124's Edit-columns toolbar, and four entity NAMES that wrap to two lines
(Bharat Jaisinghani Family Trust 2 and 3, and "Not attributed to a member"). So
the `/family` INDEX overflowed `<main>` by 32px at the sweep's 1500×1000, which
is the one thing the family asked this layout never to do.

**THE FIX IS THE PAGE'S OWN PRECEDENT.** The table wrapper is
`max-h-[600px] overflow-auto` now, the same cap the ENTITY view's holdings card
one block down already uses (`max-h-[520px]`). The table scrolls inside its own
card where it outgrows the cap (172px at 1500×1000), `<main>` does not scroll
(`over=0`), and the two cards still read as the pair they were meant to be —
table left, pie right, `items-start` unchanged. **No figure is removed**, and the
ENTITY view is still free to scroll, both unchanged from Stage 10bl's intent.

**THE CAP IS IN CSS PX, AND THAT WAS MEASURED RATHER THAN REASONED.** `#root`
carries `--app-zoom: 0.875` at ≥1024px (Stage 10n), so a `max-h-[Npx]` paints at
N × 0.875 while `main.scrollHeight`/`clientHeight` are in layout space. The cap
was chosen against the `over` metric directly — 620 is break-even, 600 leaves a
margin so a 1px shift cannot re-break the sweep's ±2px-tolerant check — never
against a painted height.

**Verification** (fix on `origin/main` at `fef4c0a7`): `build` · `tsc` ·
`test:family` 0 failed · `check:family` **135/0** · `build-book` byte-identical
(`glowData.ts` md5 unchanged, no diff) · `check:pages`
`ONLY=family,family-entity` **4 combinations clean**, the `family` scroll
failure gone. A layout cap moves no figure in the book.

### Stage 10dn — EVERY MOVER, A CHART THE READER PICKS, ONE ROW PER HOLDING, AND STRIPED ROWS

*"Open PR and do not merge to main until i tell you to … show the complete list
of daily movers … give a view selector … bar graph or a pie chart or any other
suitable view … Green Lantern Capital LP as 2 separate line items, but they need
to be one … show that in drop down … one row needs to be of one colour and then
the next row will be of a different shade … implement this on the whole
dashboard."*

No figure in the book moves: `glowData.ts` and `docs/BOOK-REPORT.md` regenerate
byte-identically.

- **Today's movers lists every mover**, on the Direct Equity branch and on
  #120's AIF & PMS branch. Both cut each list to six names under a heading that
  counted all of them. The ranking decides the order, never the length.
  `cio-live` and `INSIDE_FULL_LIST` (`cio-movers-inside-live`) require each list
  to draw as many rows as its heading counts.
- **The allocation card has a Pie / Bars / Treemap picker on every axis**
  (`AllocationViews.tsx`). All three draw the table's own rows, with the same
  value, weight and drill-down. The pick is `?chart=`, then this browser's
  (`glow:allocChart:v1`), then the pie. A section at or below zero draws no bar
  or tile. The treemap is a tint with a full-colour stripe, because solid fills
  failed the contrast check. Routes: `cio-alloc-bars`, `cio-alloc-treemap`.
- **Holdings: one row per PMS strategy, across members.** A strategy run for
  several accounts (GLC Growth, Aristos, Velocity, Small & Mid-Cap) is one row
  that opens onto one line per account, and each line onto that account's own
  shares. Nothing is deduped: two members' accounts are two investments. A
  share's % of mandate is over its own account. A several-account row links no
  single account page; its lines do. Its review columns look each account up
  apart (`ReviewScope.accountIds`) and show a figure only where they agree.
- **Transactions: one row per holding, across accounts** (`clubDatedRows` in
  `txnLedger.ts`). Both Sanshi Class E folios, both Transition Venture trusts:
  one row of their sums, opening onto each account's row. Capital and trading
  money are still never added together (Stage 10bo).
- **Every table stripes, in one pair of shades.** One rule,
  `:where(table > tbody > tr:nth-child(even)) { background-color: var(--row-alt); }`,
  with `--row-alt` `#f7f4ec` light and `#1a1740` dark. `:where()` has no
  specificity, so a row that colours itself (a band, a total, a tree line, an
  alert tint) keeps its colour. A sticky first column follows the stripe.

**Checks.** A `zebra` probe in `check:pages` on every route, in both themes: even
rows striped, odd rows not, no two neighbouring plain rows alike, and the stripe
unlike the surface under it. The All alerts probe sets `--row-alt` aside, so a
striped row is not read as a fired alert. `scripts/dev/zebra-bug.sh` puts five
bugs back after a clean control, and every one is caught. `check:family` asserts
one mandate link per single-account row, and a linked line per account on a
several-account row.

**Merged with main.** #118, #122–#126 and #120 landed while this was open.
#126 took `10dk` and #120 took `10dl`; the #120 merge raised no marker, and only
the headings check found the shared letter. This branch's 39 references moved,
main's 10 stayed. `index.css` keeps #125's grid borders beside the stripe;
`MorningCIO.tsx` takes #124's review accessors; `PortfolioMonitor.tsx` carries
#124's review scope onto every line. The probe literal is 126 keys, none lost.

**Merged again, on the family's go-ahead.** #129, #127 and #130 landed while
this waited. #130 took `10dm`, so this is `10dn`: git marked that conflict,
main's section comes first, and every `10dm` in this branch's code moved. #127
(a Sector Composition tab on Morning CIO) wrote no stage section and merged
without a marker; its tab and this branch's allocation picker sit side by side.
#130 fixes the `family` scroll finding the earlier sweep named as main's.

On that tree (main `e083467`): `build`, `tsc`, `test:ingest` (golden 140
passed, 2 not checked, 0 blocked), `test:family` (0 failed), `check:family`
**136/0**, `build-book` byte-identical, and the probe literal is the same 126
keys on both sides. `check:pages` on the routes this touches and #127's
`cio-sectors`, `family` and `family-entity`: 26 combinations, two findings,
**both main's**, measured on a worktree of main alone with the same two failing:
*the quote request names the card's own scope as priority* on `cio-live`, and
*a statement value priced on another day … names both dates (VD-17)* on
`monitor`. They are main's, and are named here rather than fixed.

**Verification**, on the tree merged with #120 (main `0643a24`):

- `build` and `tsc` pass.
- `test:ingest` passes every suite (golden 140 passed, 0 failed, 2 not checked,
  0 blocked).
- `test:family`: 4,926 checks, 0 failed.
- `check:family` **136/0**.
- `npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
  byte-identically.
- `check:pages` walked **410 combinations**: Stage 10dl's 406, plus
  `cio-alloc-bars` and `cio-alloc-treemap` in both themes. **One has a
  finding**: *the page does not scroll* on `family`, which main's own build
  also fails (Stage 10dl). 55 invariants were not checked. Two are on the new
  routes: the money-weighted tile, which every Morning CIO route skips because
  the default strip does not show it.

### Stage 10do — THE GAINERS AND LOSERS SCROLL, NOT THE MOVERS CARD

*"Instead of making this whole daily movers section scrollable, only add the
scrolls to the individual scroll list of losers and gainers, not the whole daily
movers section."*

Stage 10dn listed every mover, so a long list made Morning CIO's movers panel
scroll as a whole, carrying the tiles and the index strip away with it. On a
wide screen (`lg:`) the movers card now fills the panel's height, and each list
(gainers, losers, and the funds table on the ETFs & mutual funds branch)
scrolls inside its own box (`data-mover-scroll`). The heading, the toggle and
the tiles stay put. Each list keeps a 160px floor, so on a very short window the
panel's own scroll is still the fallback. Below `lg:` each list caps at 420px
and the page flows.

No figure moves and no row is dropped: every list still draws every mover, and
`check:pages` still counts the rows against the heading.

Verified: `build` · `check:pages` on the Morning CIO movers routes. The one
finding is the priority-request check on `cio-live`, which fails on main's own
build too (Stage 10dn).

### Stage 10dp — AIF & PMS MOVERS BY MANDATE AND FUND, AND THE HOLDINGS ONE CLICK DOWN

*"Show each mandate or fund as a visible line item in Morning CIO, with movement
at mandate level and drill-down into underlying holdings. Distinguish this from
merely showing underlying securities in a consolidated movers view."*

Stage 10dl's AIF & PMS branch ranks COMPANIES and never a wrapper. That ranking
stays, at `?inside=holdings`. The branch now OPENS on the vehicles
(`?movers=inside`, param-free): one row per PMS mandate account and one per AIF
fund, each opening into the holdings behind it (`TreeTable`'s rows, not a table
in a cell). A small `Mandates & funds · Holdings` toggle sits in the card's header.

- **A MANDATE'S MOVE IS MEASURED**: the priced shares' rupee change over their
  previous close (`change ÷ (pricedValue − change)`), with the share of the
  mandate that carries a quote named in its own cell. Its children are its
  shares, each with its own move and impact.
- **A DISCLOSING FUND'S MOVE IS DERIVED** — its disclosed lines' moves weighted by
  their own disclosed weights — and carries **no rupee impact**, the same fence
  Stage 10dl puts on the AIF half. Its children are the disclosed companies.
- **A FUND THAT DISCLOSES NOTHING IS STILL A ROW**, its move a dash whose hover
  says an AIF publishes no daily NAV and this one discloses no portfolio this
  book can join. Dropping it would read as a book without those funds.
- The two tiles above stay on both views; measured and derived money are still
  never added. The vehicle table scrolls inside its own box on a wide screen,
  Stage 10do's rule.

`src/lib/insideMovers.ts` builds `vehicles` beside the company ranking from the
same inputs, so the two views cannot describe different books.

**Checks.** `cio-movers-vehicles` (no feed: the default is the vehicle view, and
no table is claimed without prices) and `cio-movers-vehicles-live` (one row per
mandate account and per AIF fund in the book, `INSIDE_BOOK` re-derived; each
mandate's move re-derived from its priced shares, +10.00% on the fixture; a
derived fund carries no impact; a silent fund a dash with its reason; every
openable row opens onto its holdings). `cio-movers-inside(-live)` walk
`?inside=holdings` and keep Stage 10dl's claims. No figure in the book moves;
`build-book` is byte-identical.

### Stage 10dq — A RETURNS TAB ON MORNING CIO: A PERIOD, A TYPE, AND THE FORMULA

*"add a new tab after daily movers, "Returns" … MTD, YTD, financial-year-to-date,
trailing 1Y/2Y/3Y, since-investment and custom start/end periods … use the
portfolio/holding market value at the opening date rather than original
investment cost … select the kind of return … XIRR, CAGR, Absolute … the formula
of the type of return selected should also be shown."*

- **`?tab=returns`, second after Daily Movers.** `src/components/PortfolioReturns.tsx`
  over `src/lib/periodReturns.ts`. Period `?rp=` (FYTD default · MTD · YTD · 1Y ·
  2Y · 3Y · since investment · custom with `?rfrom=`/`?rto=` date pickers); type
  `?rtype=` (XIRR default · Absolute/Modified Dietz · Simple · CAGR). The formula of
  the selected type is drawn beside the figure, with its worked line.
- **A window opens on market value, never cost.** Each account opens on its latest
  statement value on or before the opening date and closes on its latest on or
  before the closing date, with every dated capital move inside the window as a
  flow. So the MEASURED window is shown, and can begin earlier than the one asked
  for. Since investment is struck on capital paid in (`capitalWindow`, now
  exported from `tranches.ts`).
- **Nothing under 365 days is annualised** (Stage 10g(ii)); CAGR refuses with the
  reason. The figures name how many accounts the window covers ("N of M").
- **Checks:** `cio-returns` and `cio-returns-custom` (`CIO_RETURNS`: the selectors,
  the formula matching the type, the measured window on or before the request,
  no p.a. under a year, the figure set and coverage); the tab-order check counts
  six tabs. No figure in the book moves; `build-book` byte-identical.

### Stage 10dr — THE NAV SERIES STARTS AT THE STATEMENTS' PRINTED OPENING VALUE

*"we need to fill the entire historic portfolio nav, the current portfolio nav is
only for a very short window right now. If this is doable from the data we
already have from the client then do it."*

- **What it uses.** Nine mandates' performance summaries and investor reports
  print the portfolio's value at the start of their window (`flows.openingCorpus`).
  That is a valuation the manager struck, dated the day before `periodFrom`, so
  `navHistoryFrom` takes it as a dated point of the account's series. Carnelian,
  both Goldstandards, both Green Lanterns and both V.E.Cs open on 31 Mar 2026;
  both SVANs on 30 Apr.
- **What moved.** The series is 15 points over **2026-03-31 → 2026-08-31**
  (153 days), where it was 13 from 31 May. `panelCompleteFrom` is still
  31 Jul. Each new link is proven as before: by the printed totals, or by Green
  Lantern's dated record.
- **What it does not use.** A fund's allotment mark (Neo's face value, Buoyant's
  class switch) is a purchase price, not a valuation, and is not a point.
- **Where both exist, the holdings statement wins.** On four dates an account
  prints both; the largest gap is 0.074%, the accrued-income basis. Issues that
  disagree on one date by more than ₹1 are skipped and named.
- **Attribution is unchanged.** An opening value carries no rows with a price and
  a quantity, so `attributionFrom` sees holdings snapshots only.
- `BOOK_SUMMARY` does not move; `build-book` twice is byte-identical.

`build` · `test:family` · `test:ingest` (golden 140, 2 not checked, 0 blocked) ·
`check:pages` on the eight NAV, Performance and History routes, 16 combinations
clean.

### Stage 10ds — THE MOVERS CARD LOSES ITS "NOT COUNTED" LINE, AND ITS LISTS RUN TO THE EDGE

*"remove the highlighted text from the dashboard UI and expand the tables to the
complete edge on the screen."*

- **The "Not counted: … PMS mandates … Cash" line under Today's movers is
  gone.** The card's title still names its scope (Direct Equity), and those
  holdings are on the AIF & PMS branch and the Portfolio Monitor. Its two checks
  and `MOVERS_EXCLUDED` are replaced by one asserting the line, its old wording
  and its hover stay gone.
- **The gainers and losers run to the card's edge.** `-mx-5` undoes the card's
  padding, the two inset boxes are one rule between the lists, and the first and
  last cells pad instead. Handles (`data-mover-scroll`, `data-mover-row`,
  `data-mover-cell`) are unchanged.

`build` · `check:pages` on six Morning CIO movers routes: the one finding is the
priority-request check on `cio-live`, which fails on main too (Stage 10dn).
### Stage 10dt — THE RETURNS TAB IS THE WHOLE PORTFOLIO, BESIDE SEVEN BENCHMARKS

*"in the returns page the client wants to see the retuns of the total portfolio
and not the underlying holdings. Also make the window and formula sections
cleaner, you can combine them into one single section and provide benchmark
returns in the other section."*

- **The per-account table is gone.** The tab draws the portfolio's return
  alone; how many accounts it covers stays on screen ("Covers N of M
  accounts").
- **One section, left:** the return, the requested and measured windows, the
  opening / capital in / capital out / closing / gain figures, and the formula
  with its worked line (`data-returns-portfolio`).
- **Benchmarks, right:** the portfolio as the first row, then the seven indices
  of `benchmarks.ts` over the MEASURED window, close to close, each checked by
  the name the price service reports (`benchmarkIdentity`), and the gap in
  points. A benchmark is annualised only where the portfolio's figure is
  (CAGR or XIRR over a year); otherwise both are not annualised. A price index
  excludes dividends, and the hover says so. A missing close or a wrong
  instrument is an `AbsentCell` with its reason.
- **Checks:** `CIO_RETURNS_LAYOUT` on `cio-returns` and `cio-returns-custom`
  (no account rows; the window and formula inside the portfolio card; all seven
  benchmarks a figure or a reasoned absence), and a new `cio-returns-live`
  route with live mocks (`CIO_RETURNS_LIVE`: every benchmark symbol requested,
  each return equal to the fixture's closed form over its own window, each gap
  the portfolio less the index). No figure in the book moves; `build-book`
  byte-identical.

### Stage 10du — THE MOVERS LISTS KEEP A THIN GRID

*"i meant just thin the borders not make them completely disappear."* Stage
10ds ran the gainers and losers to the card's edge, and #125's 2px table grid
then read as heavy across the full width. The grid stays, thinned, only inside
`[data-movers-lists]`: a 1px hairline (`calc(1px / var(--app-zoom))`) in a lighter
`--table-grid-thin` (`#ddd7ca` light and in print, `#3a3463` dark). It is set
through the grid's own variables, so the first-column and first-row edge rules
follow it. Every other table keeps the 2px grid. `check:pages` on the movers
routes: the only finding is the priority-request check on `cio-live`, which
fails on main too (Stage 10dn).

### Stage 10dv — SECTOR RETURNS ARE FIFO OVER THE HOLDINGS THAT REPORT A COST

*"The returns column of the entire sector composition is empty, find the root
cause and fix it so that we can see returns based on sector allocation."*

**ROOT CAUSE: TWO REFUSALS, ONE ON EACH VIEW.** Consolidated refused every
return by construction (its value is part derived, Stage 10aq). Direct Equity
struck one only where `costCoversSet` passed, and almost no sector does: its
depository rows print no cost. So nearly every row showed "—".

**NOW BOTH VIEWS STRIKE FIFO OVER THE HOLDINGS THAT REPORT A COST** —
`fifoTotals` over the rows whose `costBasis` is a number — which is the B-07
rule the whole-book tile and the Monitor footer already follow. The cell names
its set: an "N of M" chip wherever some holdings report no cost, and a hover
giving the costed value against the sector's, the depository value with no
cost, and on Consolidated the derived fund share, which carries none. Only a
sector where no holding reports a cost is a dash, with its reason. The Compare
tab's Return on cost row takes the same figure and chip.

**Checks:** `sectorReturnChecks(view)` in `check:pages`, on `sectors` and
`sectors-direct`: every row is a signed FIFO figure naming its set (the chip
exactly where costed < holdings), or a dash with its reason where none is
costed; the costed and uncosted value never exceed the sector's; and,
load-bearing, every row with a costed holding shows a figure. No figure in the
book moves; `build-book` is byte-identical.

### Stage 10dw — A HOLDING SOLD AFTER ITS STATEMENT IS ROLLED FORWARD ON ITS OWN WITNESSES

*"verify why only few names are being ranked by % move and not all... also why
showing no. of shares unverified... find the root cause and fix."* — a
screenshot of Today's movers reading *"6 names ranked by % move only · share
counts unverified"*.

**ROOT CAUSE.** The corporate-action gate (#104) withholds a holding's money
impact wherever a sale is recorded after its holding statement
(`realizedLotsAfter > 0`): *"Sales are recorded after this statement; a newer
holding balance is required."* LKP 98245's holding statement is dated 31 Mar and
its capital-gain lots run past it, so six direct-equity shares were ranked by %
alone and counted in no rupee figure. The gate was right that the statement's
quantity was stale, and wrong to stop there: the newer balance was already in
the archive.

**THE FIX: `rollForwardOf` IN `build-book`.** It emits
`Position.rolledForward = { through, quantity, costBasis, realizedPnL,
costOfUnitsSold, trades }`, rolling a holding forward on the account's own dated
trades — and ONLY where something independent witnesses the result: the
depository's closing balance, the capital-gain lots, or both. Cost and realised
are carried only where the lots settle them; otherwise they are `null`, never
guessed. Every roll, and every holding left unrolled with the reason, is named
in `docs/BOOK-REPORT.md`.

| Holding | Was | Now |
| --- | --- | --- |
| Belrise Industries | 12,500 on 31 Mar | 6,500 on 4 Aug — witnessed by the depository (2 Jul) and the lots (31 Jul) |
| Capri Global, Electronics Mart, Jyothy Labs, Varun Beverages | held | rolled to 0 — not a row on the live basis |
| Pricol | held | rolled; its cost and realised are `null`, because the lots do not settle them |
| Liquid BeES | — | not rolled: a mutual fund, and the gate does not apply |
| Green Lantern 510861's nine holdings | — | not rolled: nothing witnesses them, and each is named |

**§6 GAINS ONE NAMED EXCEPTION.** On a rolled holding the LIVE layer
(`applyCorporateActionQuotes`) marks the rolled quantity, drops a row rolled to
0, takes the rolled cost and realised, and starts the corporate-action window at
`through`. The statement basis is untouched — `statementPortfolio`,
`BOOK_SUMMARY` and every page that reconciles to a PDF read the statement's own
quantity — so this is a fact the newer documents establish, applied where live
figures are drawn, not a mark moving a quantity.

**Checks.** `corporateActions.test.ts` and `liveWithheld.test.ts` cover the roll
and the dropped row. `check:pages` re-expresses the roll off `glowData.ts`
(`withRolledForward` in `bookArray`), reads the corporate-actions table off the
statement book, and `stock-sold-after` walks a rolled holding. *"A share sold
after its statement…"* now abstains with the evidence: no share records a sale
after its statement that is not rolled.

**Verification.** `build` · `test:family` 0 failed · `test:ingest` (golden 140,
2 not checked, 0 blocked) · `check:family` **136/0** · `build-book`
byte-identical on a second run. `check:pages` over the ten routes this touches:
4 of 20 combinations have a finding, **all main's**: the priority-request check
on `cio-live`, VD-17 on `monitor`, and the no-NSE-symbol check on
`corporate-actions` and `corporate-actions-live` (SVAN's Cosmo Films and
CreditAccess Grameen rows) — the last measured failing identically on main's own
build at `62a0ec6`.

### Stage 10dx — THE OCTOBER 2026 DELIVERY: 360 ONE AT 30 SEP, GREEN LANTERN AT 22 SEP, AND TWO ICICI PRUDENTIAL FOLIOS

*"the client has shared new data that needs to be integrated into the dashboard.
Make sure nothing from these files and data is missed. Also fill the data audit
page as well with this data accordingly."* — `source/october-2026-b/`: `360 ONE
WEALTH.zip` and `GREEN LANTERN ICICI.zip`.

**EVERY FILE IS READ, AND NINE DOCUMENTS JOIN THE ARCHIVE** (manifest 309 → 318,
so the Data Audit page lists every one of them):

| Document | Account | As of |
| --- | --- | --- |
| 360 ONE client report | CRN37702 (Ajay), CRN60117 (Bharat) | 2026-09-30 |
| 360 ONE client report | **CRN60066 (Ajay) — new account, portfolio printed nil** | 2026-09-30 |
| Green Lantern fact sheet | 510854 (Ankita), 510861 (Ajay) | 2026-09-22 |
| Green Lantern performance history | 510854, 510861 | 2026-10-06 |
| ICICI Prudential folio statement | **36378950 (Ajay), 36379637 (Bharat) — new** | 2026-10-05 |

- **ICICI PRUDENTIAL IS A FOURTH FOLIO LAYOUT** in `mutualFundFolio.mjs`. Its
  dated purchases are published only where their gross less stamp duty is the
  net, the net is units × NAV, and the running units reach the printed balance
  (`iciciPurchaseFlows`); `iciciFolio.test.mjs` (23) breaks each gate once.
- **A PORTFOLIO PRINTED NIL IS A MEASURED NIL.** CRN60066 states "portfolio
  reported nil"; the account carries that reason rather than reading as unwired.
- **build-book fills, it never overrules.** A sector the newest fact sheet did
  not print is filled from an older issue of the same report type; and a PMS
  mandate whose newest issue carries no since-inception bridge to its own as-of
  takes one from an older issue dated to it (Green Lantern's capital now cites
  its 27 Jul fact sheet in `BOOK_ACCOUNT_BRIDGES`).

**What moved.** 67 accounts (64 + 3), 414 positions, current value of holdings
₹833.80 Cr → **₹834.73 Cr** — the two ICICI Prudential folios (₹0.56 Cr and
₹0.38 Cr). The accounts table in the data-model section was regenerated by
`npm run accounts-table` and ties to `BOOK_SUMMARY` (delta 0).

**Verification**, on the tree merged with main at `62a0ec6`: `build` ·
`test:ingest` (golden 140 passed, 2 not checked, 0 blocked) · `test:family` all
passed · `check:family` **136/0** · `npm run build-book` twice, byte-identical.
`npm run build-fund-navs` and `npm run build-scheme-names` were re-run so the two
new ICICI Prudential schemes carry AMFI's NAV and published name.
`check:pages` on `cio`, `audit`, `family`, `stock`, `private-market`,
`stock-mf-lookthrough`, `cio-movers-funds` and `monitor`: clean except **VD-17
on `monitor`**. A statement value priced on another day should name both dates.
That check **fails identically on main's own build at `62a0ec6`**, measured with
main's own checker in a worktree. It is main's, and is named here, not fixed.

**Merged with #141, which took `10dw`, so this is `10dx`.** Every `10dw` in the
code is #141's. On the merged tree (main `8d6d473`):
- `build-book` is byte-identical.
- The accounts table has delta 0.
- `build`, `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) and
  `test:family` pass.
- `check:pages` was run on 11 routes: those above, plus `cio-live`,
  `stock-sold-after` and `monitor-withheld`. Two checks fail, and both are main's:
  VD-17 on `monitor`, and the priority-request check on `cio-live`, which Stage
  10dn records as failing on main's own build.

### Stage 10dy — THE RETURNS TAB: PORTFOLIO ON TOP, BENCHMARKS BELOW, AND A DROPDOWN OF NINE RETURN TYPES

*"show the first portfolio section at top and below that show the benchmark
returns … add a dropdown selector to select the type of return … give the option
to select every type of return the client might want to select not just these 4."*

- **One column, two cards.** The portfolio return (figure, windows, the five
  amounts and the formula) is on top; the benchmark table is below it, full width.
  The stack scrolls inside Morning CIO's panel; the page does not.
- **The return type is a `<select>`** (`data-returns-type-select`), at `?rtype=`
  as before, XIRR param-free. Nine types in `periodReturns.ts`: XIRR, money-weighted
  cumulative, Modified Dietz, Modified Dietz annualised, simple, simple annualised,
  return on net capital, point-to-point and CAGR. Each annualised type refuses a
  window under 365 days (Stage 10g(ii)); point-to-point and CAGR refuse a window
  where capital moved. Time-weighted is not offered: it needs a valuation on every
  flow date, which no statement here prints.
- **Checks.** `CIO_RETURNS` lists the nine keys; `CIO_RETURNS_LAYOUT` asserts a
  dropdown and no type buttons, and that the portfolio card sits above the
  benchmarks (geometry). New route `cio-returns-net`. No figure in the book moves;
  `build-book` is byte-identical.
### Stage 10dz — ANKITA'S CLEAN MAX IS VALUED AGAIN: FQ-3 REVERSED

*"include this in the dashboard data as well"* — the family, 14 Oct 2026, about
Ankita's 94,967 Clean Max Enviro Energy Solutions shares on Motilal Oswal demat
1201090012838316, which they had asked on 28 Sep to keep unvalued (Stage 10cx,
FQ-3).

- **`KEPT_UNVALUED` is empty again**, with the reversal recorded beside it. The
  helpers and gate 6 in `depositoryShares.ts` stay, so a future decision is one
  line.
- **The LIVE layer values the shares at the CLEANMAX quote** (Stage 10cy's
  `kind: "no-price"`), because the statement prints rate 0.000. **The statement
  basis is unchanged**: the row is still a quantity with no value, and its reason
  is the statement's own again. `BOOK_SUMMARY` does not move; the only line of
  `glowData.ts` that changes is that reason.
- Ajay's ICICI NSDL Clean Max (94,967 at the 30 Mar mark) is a separate holding
  and untouched.

**Checks.** `keptUnvalued.test.ts` holds the reversal (no table entry, no
decision in the book's reason, still a quantity on the statement basis);
`fundNavs.test.ts` asserts the row IS a live candidate; `family-kept-unvalued`
asserts the withdrawn decision appears nowhere and the statement basis still
values nothing. `family-answers-bug.mjs`'s FQ-3 cases have no subject since this
stage.

### Stage 10ea — NATIONAL STOCK EXCHANGE IS LISTED: A COMPANY SHARE ON THE LISTED SIDE

*"National Stock Exchange of India has listed."* — the family, 14 Oct 2026. Its
2,00,000 shares (Ajay 1,25,000, Ankita 75,000) are a review line (Stage 10dh),
so the decision lives where the review's lines are placed.

- **`listed` on the NSE entry in `shared/reviewHolders.mjs`**, dated and sourced
  to the family. `reviewBookLayer` files both rows as `Equity`, `marketSide:
  "listed"`, and keeps the review's own figures: cost ₹12.085 Cr, value
  ₹41.5 Cr. **No symbol, price or exchange is invented**: the rows carry the
  review's mark until a statement or a quote prices them.
- **Its sector is AMFI's industry, `Capital Markets`, through `resolveSector`**
  (Financials). `sectorOfListed` fails the build if the label resolves to no GICS
  sector, so the decision cannot place a company in Unclassified silently.
- **What moved.** `BOOK_SUMMARY.totalValue` does not. Listed ₹600.14 Cr →
  ₹641.64 Cr, private ₹234.59 Cr → ₹193.09 Cr; the sector table's Unclassified
  87.55% → 82.58% and Financials 3.10% → 8.07%.
- **Two checks counted holdings where they meant companies.** Sector
  Composition's Direct Equity partition is struck on the companies the four
  sources place (`data-donut-companies`), and the KPI-strip triple-digit check on
  `cio-sectors` reads the tiles (`ctx.kpiTiles`) rather than a slice that reached
  the sector table, where NSE's +243% HPR is a real figure.

**Checks.** `reviewBook.test.ts`, `marketSide.test.ts` and
`privateMarket.test.ts` hold the move; `REVIEW_DECLARED_LISTED` in
`check:pages` keeps NSE out of the private-side expectations. `check:pages` on
the twelve Sector, Morning CIO, Family, Private Market, holdings and Monitor
routes it touches: 26 combinations, the one finding VD-17 on `monitor`, main's
own (Stage 10dn). `test:family` exit 0; `build-book` byte-identical after
merging main.

### Stage 10eb — FOUR STANDARD RETURN TYPES, EACH EXPLAINED

*"also explain what the type of return is.... point to point is a very vague
term, we just need to show industry standard return nothing too complex or out
of the ordinary returns that everyone investing money looks at."*

- **The Returns tab's dropdown offers four types**, down from Stage 10dy's nine:
  **XIRR** (default), **Absolute return**, **Time-weighted return** and
  **CAGR**. Money-weighted cumulative, Modified Dietz annualised, simple, simple
  annualised, return on net capital and point-to-point are gone; an old
  `?rtype=` falls back to XIRR.
- **Time-weighted return is Modified Dietz**, the standard approximation when
  no valuation exists on each flow date, which no statement here prints. Since
  investment it weights each rupee by the share of the period it was invested.
  **CAGR** compounds it to a year, and refuses a window under 365 days, pointing
  to the time-weighted return instead (Stage 10g(ii)).
- **Each type is explained in one short line beside the dropdown**
  (`data-returns-type-desc`), and its full plain-English explanation is that
  control's hover and the card's subtitle hover.
- **Checks:** `CIO_RETURNS` expects the four keys and asserts the short line
  and its hover; `cio-returns-net` is replaced by `cio-returns-twr`. No figure
  in the book moves.

### Stage 10ec — THE MOVERS CARDS SHOW HOW MANY STOCKS, AND A SPINNER WHILE PRICES LOAD

*"just show the total no. of stocks at all times on the page, and show that live
pries are still loading as a small loading icon."*

- **A count of stocks is in the header of Today's movers and the AIF & PMS card
  in every state**: loading, ranked, refreshing (`data-movers-total`). The Direct
  Equity card counts its distinct names (`model.distinct`); the AIF & PMS card
  counts the companies across both halves (`InsideMovers.companies`, the union of
  the mandate and disclosed keys).
- **"Fetching prices…", the progress line and "Refreshing prices" are gone**; a
  small spinner beside the count (`data-movers-spinner`) says it, with the landed
  count or "the figures shown are the last complete round" in its hover. The
  card still holds on its own scope (Stage 10an): nothing is ranked until it lands.
- **Checks** read the handles: `cio-loading` requires the spinner and the count,
  `cio-cached` the refreshing spinner's hover, `cio-live` the count once ranked.
  `check:pages` on the 13 Morning CIO movers routes: the one finding is the
  priority-request check on `cio-live`, which fails on main too (Stage 10dn).

### Stage 10ed — PRIVATE MARKET: BY BRAND AND BY LEGAL ENTITY

*"Add By Brand and By Legal Entity private-market views … Show one consolidated
brand row in the brand view, with owner/entity detail available when needed,
rather than forcing multiple nested naming layers into every row."*

- **Four tabs on the master table**: By fund · **By brand** (`?view=brands`) ·
  **By legal entity** (`?view=owners`, the By-owner key kept so bookmarks land) ·
  Transactions.
- **One row per brand** (`privateBook(folios, "brand")`). The brand is the
  fund's own name with its class, series and legal suffix taken off
  (`brandOf`), and only ever removed — except where `BRAND_OVERRIDES` names
  one: Drink Prime and Blue Ashva are each one brand; LV Angel Fund is Hoopr;
  Collabmates and Karban stay apart. 62 brand rows on this book.
- **Consolidated like the fund view**: each holding counted once, the band hint
  says so. The legal-entity view stays as printed.
- **A brand row opens into its owners**, each child prefixed with the fund only
  where the brand spans several funds. A Capital call cell sits on a brand row
  only where the brand is one fund.
- **Checks**: `privateBook.test.ts` (brand block); route
  `private-market-brands` (tabs, table checks, band hints, labels unique and
  carrying no " — " or class suffix). Two fund-row claims abstain on the brands
  view. `build-book` byte-identical.

### Stage 10ee — THE AT-COST INVESTMENTS ARE ON PRIVATE MARKET, AND BOTH PAGES SAY SO

*"I cannot see these private investments at cost inside the private markets
page."* Measured on main and on production: all 61 at-cost investments
(₹140.7 Cr) were already rows of Private Market's By fund table, in the
"Private Companies (Held at cost)" section under the private funds, open by
default. Nothing was missing; the two pages named the set differently, and the
band counted them as "61 funds".

- **The Portfolio Monitor's "Private investments at cost" band links to Private
  Market** ("Also on Private Market →", `data-at-cost-pm-link`).
- **Private Market's at-cost band counts "investments"**, and its hover names
  the Monitor's own heading for the same set.
- **Check:** `monitor-category-drill` asserts the link. The existing "no third
  section" check on Private Market already holds every at-cost key to a row.

No figure moves.

### Stage 10ef — PRIVATE MARKET: NO LEGAL-ENTITY TAB, AND A FUNDS / COMPANIES / BOTH SELECTOR

*"Remove the "by legal entity" tab from the private market page. give a dropdown
selector to select fund or companies or both, keep companies as the default
view."*

- **The By legal entity tab is gone.** The master table's tabs are By fund · By
  brand · Transactions; `?view=owners` falls back to By fund, and
  `pmViewChecks` asserts exactly three tabs.
- **A dropdown at `?show=`** (`data-pm-show`): **Companies** (param-free
  default) draws the Private Companies (held at cost) section; **Funds** draws
  Private funds and the unvalued band; **Both** draws all three and the total
  row.
- **Checks:** the existing Private Market routes walk `show=both`; two new
  routes, `private-market-default` and `private-market-show-funds`, hold each
  selection to the sections it draws. `check-columns` and `check:family` open
  `show=both`. No figure moves; `build-book` is byte-identical.

### Stage 10k — News & Announcements: REMOVED

The family asked for the page to go. `/news` and `/recommendations` redirect to
`/monitor`, the sidebar entry is gone, and `src/pages/News.tsx`, `src/lib/news.ts`
and the top-bar `NotificationsBell` went with it — the bell rendered the same
holdings feed and its only action was to open the page that no longer exists, so
leaving it would have been a button to a redirect.

`src/lib/announcements.ts` STAYS. `insider.ts` imports its `AnnHolding` type and
its NSE-symbol resolution, and the company page's insider panel is still wired to
both (`InsiderDeals`, the research card's Insider deals sub-tab since Stage 10cn). Deleting a module because its most visible caller went is how a working
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
- ~~`/compare` offers no fund and says what it left out~~ — the page was REMOVED at Stage 10ap, and Exposure & IPS at Stage 10bc. `isCompanyShare` is still the filter behind SECTOR COMPOSITION, which still asserts that no fund wrapper appears as a company row — one surface now rather than two, and the claim is unweakened on the one that renders;
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
allocation bucket, Exposure & IPS's contributors, laggards and bucket mapping
(that page went at Stage 10bc, so this list is one shorter than it was),
Capital Gains, Ledger Insights, the stock page's pill, the review deck's
allocation slide. A label re-typed per screen is a label that disagrees with
itself, and this one already had six places to disagree in.

The class filter is `All categories` now, and its options carry the same labels.
*(It is a row of TABS since Stage 10bs — "All" first, the axis it spans in its
hover — and the labels are still the ones `assetClassLabel` chooses.)*

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
  gap is named, and that no zero price stands in the CMP headline (the price
  tile since Stage 10cn).

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
`CompanyResearchPreview` (deleted at Stage 10cn) had withheld a rupee market cap because the unit was
unverified and "a value here could be wrong by a factor of a crore" — correct to
withhold, and this is the check: ABCAPITAL reads ₹1,11,403 Cr against
screener.in's ₹1,11,347 Cr, 0.05% apart on two snapshots minutes apart.
`src/lib/marketCap.ts` bands the listed book on it. **NO PAGE DRAWS THOSE BANDS
SINCE Stage 10bc**, when Exposure & IPS — their only surface — was removed at the
family's request: the module is a DOCUMENTED no-caller now, still asserted by
`familyMath.test.ts`, and the measurement below is what earns it its place and
does not expire with the card.

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
still exists and still carries the IPS-bucket roll-up (`bucketActuals`,
`bucketWeightPct`); what went is `evaluateAlerts` and `ALERT_KIND_LABEL`, which
had no caller once `/alerts` was removed at the family's request.

**AND THE ROLL-UP'S OWN READER HAS SINCE GONE TOO — see Stage 10bc.** Exposure &
IPS was the surface that kept those two exports alive at Stage 10y, and with it
removed `alertEngine.ts` is a DOCUMENTED no-caller: kept because the family asked
for that after being shown the cost, still asserted by `familyMath.test.ts`, and
saying so at its own definition so it is never the SILENT orphan this file keeps
naming. The family's alert RULES are untouched in `familyInputs.ts`; nothing
evaluates them and nothing exports them.

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


### Stage 10eg — RETURN CALCULATIONS OPEN FROM THE INFO BUTTON

- Return tiles and every Returns-tab method/period use a circled info button. The popup repeats the displayed return, shows 2–3 numerical steps, and keeps the formula, full dated amounts and working under Show more. The formula is removed from the card.
- The existing measurement exposes its inputs and intermediate values for the explanation, including the money-weighted yearly-to-period conversion and every Modified Dietz weight. Partial coverage, excluded-account reasons, tiny-return rounding and the 365-day CAGR reporting rule are explicit. Narrow-screen Returns controls remain reachable.
- Validation: build, full family suite, all 32 method/period combinations in both themes at desktop/mobile widths, custom/unavailable windows, independent money-weighted arithmetic and targeted Returns layout checks. Automated review was unavailable because its quota was exhausted; the diff was reviewed locally.

### Stage 10eh — PRIVATE MARKET: THE BRAND COLUMN SHOWS THE BRAND, AND THE LEGAL ENTITY UNDER IT

*"make the first column the brand name, because right now the column labeled
brand name is actually the legal name of the entity … search for every entity
and check what the brand name is. If it's the same, then write the same …
Make sure you dont miss out on any"*

- **`src/lib/brandNames.ts`** maps every private-market line, by fundKey, to
  its `brand`, its `legal` entity and a `basis`. `cited` means the brand differs
  from the entity and a source states the link (e.g. Assetgro Fintech → StockGro).
  `own-name` means the entity trades under its own name. `as-printed` means no
  source ties the review's words to one company. Sources are web pages or
  `statement:<docKey>`, the family's own depository statement naming the issuer.
  It replaces `BRAND_OVERRIDES` and is display only.
- **By brand**: each row is labelled with the brand. The legal entity is drawn
  under it where the two differ, and the brand's hover gives the source.
  Search matches legal names too.
- **Nothing is missed**: `privateBook.test.ts` fails on any line with no entry,
  any cited pair without a web source, and any statement source not in the
  archive. Route `private-market-brands` asserts every row is mapped and names
  its entity, and that the Assetgro line is the StockGro row. 62 brand rows,
  all mapped. No figure moves.

### Stage 10ei — RETURNS SELECT THE LATEST VERIFIED ACCOUNT RECORD

*"please fix … always make them use the latest data"* — 15 October 2026.

- Account return endpoints are selected independently of security appraisals.
  Valuations require a reconciled dated capital or bank record, a matching
  printed capital total and agreement with previously captured cash flows.
  Historical appraisals remain eligible when later holdings lack capital coverage.
- Morning CIO, NAV & Performance, Family & Entities and investor period returns
  share the selection. The card states its latest closing date and account count;
  the information popup names newer incomplete statements. Holdings retain their
  own prices, quantities and dates. No missing interval is assumed empty.
- In the current archive, 510861 advances to 22 September; October 6 remains
  unverified. Carnelian's dated bank record ends July 10, so its return closes
  there instead of using an unsupported August value. Seven of 67 accounts
  contribute, over mixed closing dates, with a 174-day measured window.
- Verified: reproducible book, build, ingest and family suites; independent
  browser arithmetic; focused Morning CIO, Performance and Family checks;
  mobile dialogs in both themes. New tests cover future advances and retaining
  an older verified endpoint after newer holdings arrive.

### Stage 10ej — THE STATEMENT LIBRARY: SOURCE DOCUMENTS, ONE FOLDER PER PROVIDER

*"check all the files that have already been uploaded … create folders and
show all the same files with the same format into each folder … clearly state
the type of file each folder contains … name the folder Motilal Oswal"*

- **New Admin page `/statements`** (`src/pages/StatementLibrary.tsx`, nav entry
  between Data Audit and Upload History). One folder per provider, each stating
  on its face the file types that provider sends and the formats (PDF / XLSX /
  CSV), expanding into a table of every document it holds — owner, account, as
  of, format, ingest status and the delivery it arrived in, with a link into
  Data Audit for any document that carries sheets.
- **Reads the archive's own index**, `public/audit/manifest.json` — the same
  file the Data Audit viewer reads — so there is no second generated artifact to
  drift. `src/lib/statementLibrary.ts` is pure grouping over it: it invents no
  provider, date or type. The one non-derived map is `REPORT_LABELS` (slug →
  human words, the icon-map licence), which title-cases an unknown slug rather
  than dropping it.
- **The upload is a catalog, not an ingest.** The family chose "catalog only,
  no upload yet": a browser upload cannot regenerate the offline-baked book
  (`src/data/glowData.ts`), which is assembled by the ingest pipeline under the
  no-fabrication guarantee. A line on the page says so plainly; a new statement
  still reaches the dashboard through `extract` → `build-book`.
- **Tied to the manifest, document for document.** `statementLibrary.test.ts`
  asserts every document lands in exactly one folder, each folder's stated types
  and formats are its own documents', the counts sum to the manifest, and the
  grouping is deterministic. Route `statements` is clean on the universal checks
  (no overflow, contrast or stray zeros). 318 documents, 39 providers.

### Stage 10ek — ONLY XIRR, ABSOLUTE RETURN AND CAGR

- Removed Time-weighted return from the return type, selectors, formulas, help text and NAV & Performance section. Old `rtype=twr` links fall back to XIRR. The other three calculations and info popups remain.
- The CAGR explanation now names its existing dated-capital calculation directly; shorter-period guidance points to Absolute return or XIRR. Historical statement data is retained in the source model.
- Checks assert exactly three options, no retired section or popup references, all 24 method/period combinations, and the old-link fallback.

### Stage 10el — STATEMENT LIBRARY: A DESKTOP FOLDER YOU OPEN INTO

*"make the UI as normal desktop folder that we can double click to open and
inside it would contain all the files of the same format in an organized way"*

- **The library is a folder grid now**, not a stack of expanding cards. Each
  provider is a desktop-style folder icon — name, file count and formats
  beneath, an amber dot where a document did not fully read. Double-click (or
  Enter / Space when focused) opens it; a single click selects.
- **Which folder is open lives in the address** (`?provider=<name>`), the same
  "state in the URL" the drill-downs and member scope use: the open folder is
  linkable, the browser's Back button closes it, and the breadcrumb's "Statement
  Library" segment reopens the grid. An unknown provider shows an absent state.
- **Inside a folder, files are grouped by format** — one labelled block per PDF
  / XLSX / CSV, ordered by how many files it holds, each a striped table of its
  documents (owner, account, as-of, status, delivery, Data Audit link). The
  folder header still states every report type the provider sends.
- Route `statements` walks the grid and `statements-folder` the opened view
  (the largest provider, derived from the manifest); both clean on the universal
  checks. No change to the grouping model or its test.

### Stage 10em — RECOVERED STATEMENTS AND VERIFIED FY RETURN OPENINGS

- Incorporated the newer September email deliveries without replacing older source history. The source archive now describes 75 accounts. Carnelian's Bespoke reports and SVAN's new PMS layout route to their own managers; friendly Goldstandard exports require matching account/holder witnesses.
- Reconciled full unit/cash ledgers and exact historical AMFI ISIN references add return inputs for 3P, Helios, ICICI, HDFC, Kotak, Invesco and Motilal folios. HDFC's opening units are never substituted for current units. Statement dates, NAV dates and complete cash windows remain separate.
- Money-weighted coverage advances from 7 to 17 accounts, through 7 October; sources with missing openings/capital remain excluded. Dormant verified nil accounts are distinguished from missing records. A Carnelian investor report's inconsistent bridge remains partial; the separate reconciled performance summary supplies its return.
- All return surfaces share the selected records. `RETURN-COVERAGE.md` lists the remaining gaps and `RETURN-RECORDS-REQUEST.md` holds an unsent request. No outreach, production data intervention or paid enrichment was performed.
- Validation covers cash charges, every unit balance, internal switches, fiscal-year boundaries, genuine nil closes and source-date selection; browser arithmetic independently reproduces 20.6% for 17/75 and checks Performance/Family consistency and mobile themes.
- The focused CIO, Performance and Family page checks pass in both themes (six combinations). The checker accepts empty generated ledgers and distinguishes a verified pooled account from an individually solvable rate; later-date isolation remains covered by the synthetic financial test. Five page assertions are explicitly not checked where the current dataset does not exercise their condition.
- A first visible purchase after the FY start only establishes a nil opening when the source period covers the FY or its account-statement header explicitly states “Since Inception”. The Helios source prints that header; later/unknown statement windows are refused even when their first running balance ties.

### Stage 10en — STATEMENT LIBRARY: THE DROP BOX, WIRED INTO EACH FOLDER

*"wire up the upload into folders"*

- **Each open folder now has a drop box.** Drag files onto it or click to choose;
  each is uploaded under that provider. A "Waiting for the next rebuild" table
  lists what is staged — filename, size, time — with a Remove on each.
- **It stages, it does not fabricate.** An uploaded file lands in R2
  (`functions/api/statement-uploads.js`, bound as `STATEMENT_UPLOADS`), raw and
  unread. It feeds NOTHING on any page until a rebuild reads it — the standing
  rule a browser cannot write the baked book. The box says so on its face.
- **R2, not KV.** Statements are PDFs, workbooks and ZIPs up to tens of MB; a KV
  value caps at 25 MiB. The endpoint sits behind the same edge gate as every
  `/api/*` route, refuses a cross-site write and anything that is not a
  statement, and — until the bucket is bound — answers 503 NOT_CONFIGURED while
  the box shows the one-time set-up steps (`SWITCH_ON_STEPS`), never a dead zone.
- **The bridge to a rebuild** is `scripts/ingest/pull-uploads.mjs`: it signs in,
  writes every staged file under `source/uploads-<date>/<provider>/`, and with
  `--clear` empties the inbox — then the ordinary `inventory → extract →
  build-book` reads them.
- `statementUploads.test.ts` drives the Function against an in-memory R2 (round
  trip, the cross-origin and bad-file guards, the not-configured answer) and the
  client's cause mapping. Routes `statements` / `statements-folder` stay clean;
  the drop box degrades to a named notice where no Function runs (local preview).

### Stage 10eo — PRIVATE INVESTMENTS: STRATEGY AND DESCRIPTION, MATCHED BY IDENTITY

*"Add fund strategy and company-description fields to the canonical private-market
data … Match supplementary data to the investment identity rather than requiring
the client to maintain one upload format."*

- **Model.** `BookFolio.profile` / `BookGroup.profile` (`privateBook.ts`) carry a
  `strategy` and a `description` cell — text with its source cell and match basis,
  or `null` with a reason. A property of the FUND; a brand or member row shows one
  text only where every investment under it shares it, else "open the row".
- **Intake, any layout.** `scripts/lib/privateProfiles.mjs` recognises a profile
  table by its HEADER (an investment name / ISIN / folio / security key beside a
  strategy or description column), wherever the header row sits, across or down
  the sheet, in xlsx/xls/csv/JSON, loose or inside a zip. A header with two ledger
  columns (date, amount, …) is a statement, never a profile.
  `npm run build-profiles` (after `build-book`) writes `src/data/privateProfiles.json`.
- **Match** (`src/lib/investmentProfiles.ts`): security key → ISIN → name (printed,
  legal, fund without class; case/spacing/legal suffix ignored) → brand → folio,
  most exact tier wins; a record landing on two brands matches nothing. Newest
  delivery wins; two texts in one delivery are a conflict, shown as `—`.
  Unmatched records are named in the column headers' hover.
- **Columns.** `strategy`, `description` on `pm-book`, optional (Edit Columns),
  after the name. No profile file exists in `source/` today, so every cell is `—`
  with that reason. `source-coverage` counts a profile file as `read-as-profile`.
- `investmentProfiles.test.ts`: four layouts of the same facts land on the same
  investments of the real book; the refusals (shared folio, unknown name, ledger,
  conflict) hold. `check:pages ONLY=private-market`: same 23 findings as main on
  this Windows checkout (glowData read), none new.

### Stage 10ep — EVERY STATEMENT READ IN FULL: `partial` MEANS A READ GAP

*"the files in these folders are showing partial or failed … all the files [must be] completely read and fed into the dashboard data"*

- **Root cause.** Every reader ended `warnings.length ? "partial" : "ok"`, and most warnings are facts about the STATEMENT — 360 ONE's "No data available to generate …", Sky Capital publishing no NAV, a depository rate being the last movement's price. 85 documents read line for line showed "Partial". `scripts/ingest/lib/readStatus.mjs` now splits warnings into statement NOTES and read GAPS (an unlisted code is a gap) and `extract.mjs` promotes a `partial` whose every warning is a note; it never demotes and never touches `failed`. Notes stay on the document word for word.
- **Real gaps closed.** 360 ONE's stacked `Price As on / Benchmark` column (the benchmark name is now on the audit sheet; no per-unit NAV is printed). Mutual-fund folio: a fifth layout (CAMS partial transaction listing — Hope India Trust's ABSL liquid fund, 23 IDCW reinvestments, re-read from its archived text) and a sixth (Motilal's ICICI Pru listing, folio 14320536 — a new account, every scheme redeemed to nil, its realised history now carried). WhiteOak's monthly disclosure was misfiled as an ICICI folio; it is a scheme disclosure. PMS engine: new `performance-by-security`, `trial-balance` and `open-lots` report types (in no precedence block — open lots fill VEC 128004's lot split only); Carnelian's P&L closes without an unprinted Other Income; appraisal continuation rows and printed-but-unmatched columns read. NSDL's printed grand total is a `checks` entry instead of a dropped field; Active Momentum's printed ISIN is read.
- **`npm run extract` runs on any machine.** A file this run cannot open for want of a password or the OCR tools is carried forward from the archive (`carriedForward`); with neither, a no-op run reproduced the committed archive byte for byte (the one difference: a SVAN path that only existed on the previous builder's disk). A carried `failed` document is re-read from its archived page text and kept only if it publishes more.
- **Result: 420 ok, 0 partial, 4 failed** (was 328 / 85 / 11). The four: the review and the register (held out by decision — the Statement Library now says "Held out"), LKP's equity attachment (a mail server's removal notice — never arrived), and Bharat's scanned HDFC NSDL statement (no text layer). Book value unchanged (₹840.13 Cr); 76 accounts, 444 positions.

### Stage 10eq — A NIL FOLIO LINE NO LONGER TAKES A DEPOSITORY'S NAV, AND IS CLOSED

*CI's family-test step failed on every PR after 15 Oct: three suites, green on 96b9700f, red from the first fund-NAV refresh after #160.*

- **Root cause.** #160 brought in Motilal Oswal folio 90414963315, which prints `Balance Units: 0.000` and no NAV for Arbitrage (547,324.748 non-demat units redeemed on 23 Sep 2026), Midcap and Liquid. Under Stage 10cc the depository window on Ajay's demat 12539150 now carries that folio's key for INF247L01ED1. CI does not run on bot pushes, so the breakage showed up on the next PR.
- **Fund NAVs (`build-fund-navs`).** The nil line "reached" INF247L01ED1. That left the depository's 28,067,435.434-unit balance with only a refused book entry, so the review's own 16,308,407.445-unit purchase lost its NAV (`fundNavs`: "292 purchases read, none matched"). Now only a line that holds units reaches an ISIN, and a depository balance sharing a nil line's key takes over the entry (`from: "depository"`). The old-spelling cash key `motilal-oswal-amc-ltd-momf-…` held nothing once the stale entry was regenerated away, so it is deleted from `CASH_EQUIVALENT_KEYS` and from check-pages' cash list. #160's exception in the dead-key check is gone too: the strict check passes again.
- **`isRedeemedToNil`.** A fund vehicle at zero units now counts as closed when it prints a NAV *or* a zero value (the same test `tranches.ts` uses). Before this, the three nil lines stayed current, and once AMFI had a previous NAV for Midcap the NAV movers card drew it as a ₹0 row (`navMovers`: move ÷ value = 0 ÷ 0). The rule's copies were updated with it: 20 probes in `check-pages.mjs`, `PortfolioMonitor.tsx`'s closed-account set, and the chatContext / portfolioExcel / navMovers suites.
- **The look-through tier.** Since 10ep read Active Momentum's printed ISIN, the look-through supplies no ISIN. It still answers beside the statement on 19 schemes, and any disagreement refuses the scheme. Entries now record `isinAgreedBy`, and "neither tier is dead" counts a supplied or a confirmed ISIN. An index that stopped resolving still fails it.
- `fundNavs.ts` and `docs/FUND-NAVS.md` regenerated: 36 priced. `familyTaxonomy`, `fundNavs` and `navMovers` pass. `npm run build` is green. The other local failures on this Windows checkout (realisedLots, polycabLive, three bundling failures, test:ingest's askArf/buoyantSnap) fail the same way on a clean main and pass on CI.

### Stage 10er — THE READ GATE: A HALF-READ DELIVERY CANNOT BE MERGED

*"in future, whatever files we upload, they are read completely and all the data is integrated into the dashboard"*

- **`npm run check:reads`** (`scripts/check-reads.mjs`) exits non-zero, naming the file and the fix, on: a `partial` document; a `failed` one that is neither held out by decision nor recorded in `scripts/ingest/acceptedUnread.mjs` (two entries today — LKP's mail-server removal notice and Bharat's scanned HDFC NSDL statement — each with the action that would make it readable; an entry whose file reads again fails as stale); a read account the book neither carries nor excludes by name with a reason; and a book date older than the newest holdings statement read for the account.
- **CI's new `statements` job** re-reads every file in `source/` with the committed readers (`inventory` → `extract` with `GLOW_OCR=off`, sealed and outlined-text files carried forward), fails if `public/audit/` or the book differs from what is committed, then runs `coverage:source` and `check:reads`. A delivery dropped in without extracting, a reader change without a regenerated archive, or a half-read statement fails the PR.
- `checkReads.test.mjs` plants each failure in a synthetic archive and expects the gate to name it (9 cases, including the three that must pass). `source/README.md` ends every delivery with the gate.

### Stage 10es — PRIVATE MARKET: BY LEGAL NAME REPLACES BY FUND

*"Replace by fund toggle switch with by legal name … In the by legal name tab we will show companies by their legal name, in by brand tab we will group companies by same brand name."* — the family, 19 Oct 2026.

- **Three tabs: By legal name, By brand, Transactions.** The first tab keeps its `?view=funds` key, so saved links still open it. A row is now the legal entity that `BRAND_NAMES` gives for the line (`legalKeyOf` / `legalLabel` in `privateBook.ts`). DrinkPrime's four sellers become one Waterwala Labs Private Limited row, and Blue Ashva's two vehicles stay two rows. Where the brand differs from the entity name, it is drawn under the row (`data-pm-brand-line`), e.g. Assetgro Fintech Private Limited · StockGro. The name's hover says how the pair is known.
- **A row holding one line keys on that line**, as before, so its call cell, page link and every fund-keyed check still find it. A row of several lines gets the key `legal:<slug>` and behaves like a multi-fund brand row: no page link, a pooled return, and a call cell on each line. The row carries `data-pm-fund-keys`, and check-pages' at-cost key set and call-column checks read the lines from it.
- **Mapping coverage:** all 90 private folios have a `BRAND_NAMES` entry (the existing test). `privateBook.test.ts` adds a legal-name block: rows partition the folios, each entity is one row per section, DrinkPrime merges, Blue Ashva splits, and totals close on By brand. `private-market-default` adds the matching page claim.

### Stage 10et — BUOYANT: THE SEPTEMBER ACCOUNT STATEMENTS REACH THE BOOK

*"integrate all the files and data in this folder into the dashboard."* — the family, 19 Oct 2026, sending `BUOYANT AJAY SIR ANKITA MAAM.zip`.

- **The zip was already in `source/october-2026-c/`, byte for byte**, and both statements in it were read in full. They never reached the book: Buoyant's `holdings` precedence named only the PMS appraisal and the portfolio snap, so the fund's own account statement (`reportType: "holdings"`) was never a candidate. Both folios stayed on the 31 Aug snap. `check:reads` filters its staleness test by that same rule, so it could not see the gap.
- **`precedence.mjs`:** Buoyant's holdings are now the newest of `appraisal`, `portfolio-snap` and `holdings`. On a tie the appraisal wins, then the snap.
- **As-of follows the figure, as Delphi and Neo already do.** The statement headed "As of 12/10/2026" values the units at the **30/09/2026** NAV, and the one headed 30/09 at the 29/09 NAV. The Buoyant layout in `altFundStatements.mjs` now dates a statement by its Account Summary NAV date, falling back to the header only if that date is missing. The docKeys move from `…-2026-10-12-holdings` / `…-2026-09-30-holdings` to `…-2026-09-30-holdings` / `…-2026-09-29-holdings`.
- **The book:** 103473 (Ajay) ₹50.33 Cr → **₹48.07 Cr**, 103472 (Ankita) ₹28.27 Cr → **₹27.00 Cr**, both dated 2026-09-30 on unchanged units (34,16,657.4167 and 19,18,953.2003). Carried cost through the class switch is unchanged. Consolidated ₹840.13 Cr → ₹836.60 Cr.
- **Still open:** with the precedence filter removed, `check:reads` also names six other accounts with a newer report of a type their rule does not name (SVAN 8710067, V.E.C 128005, Green Lantern 510854/510861, Molecule 7810404, Carnelian 3517383). Each needs its own judgement about whether that report is a holdings snapshot.

### Stage 10eu — NEWER STATEMENTS OF AN UNNAMED TYPE, AND ROWS LOST TO A WRAPPED NAME

Follows Stage 10et. With `check:reads`' precedence filter removed, six more accounts had a newer report than the book's date. Each was judged on its own:

- **Fact sheets carry weights, not values**: V.E.C 128005 (30 Sep), Green Lantern 510854 / 510861 (22 Sep), Molecule 7810404 (30 Sep). None values a holding, so none can be a snapshot, and each account correctly keeps its last valued statement (13 Aug, 27 Jul, 27 Jul, 31 Jul).
- **SVAN now issues the PMS reporting system's set as well.** Its precedence still called the investor report "the ONLY report this manager issues". 8710067 received a 30 Sep appraisal and no September investor report, so the book stayed on 31 Jul. SVAN holdings are now the newer of `investor-report` and `appraisal`; on one date the investor report wins, as before. 8710067 moves to **30 Sep, ₹16.22 Cr, 49 holdings**, and the roll-forwards on its trade tape from 31 Jul are no longer needed.
- **The PMS reporting system's holdings are the newer of `appraisal` and `investor-report`**, appraisal first on a tie. In `authoritative()`, a newest-wins candidate must pass `wholeSnapshot`: `ok`, no section that prints a subtotal and no rows (so Green Lantern's quarterly Shares can never supersede), and no `value-bridge-mismatch`.
- **Carnelian 3517383 stays on its 30 Sep appraisal (₹38.16 Cr).** Its "Holding Report as of 07/10/2026" values the same holdings a week later, but its total, ₹38,51,69,845.54, is ₹2,85,231.78 below the ₹38,54,55,077.32 closing that the manager's own 7 Oct performance history, performance summary and fact sheet all print. The gap equals the difference between the investor report's fees (₹16.78 L) and the performance summary's (₹13.93 L). The manager disagrees with itself on that date, so the last verified record stands. The book report names the 7 Oct report and its gap (`… is newer than the 2026-09-30 record the book keeps, and is not used: …`), and `check:reads` does not count it. Adopting it first broke `fifo.test.ts` C6, the manager's own since-inception bridge, by exactly that amount.
- **`pmsInvestorReport.mjs` dropped any row whose name wraps around its figures** (name, then a figures-only line, then the tail). Carnelian's 7 Oct report lost Star Health (**₹3.84 Cr**) and SVAN 8710090's 30 Sep report lost Paras Defence (**₹20.6 L**), both with status `ok`. The reconciler flagged both as MATERIAL, but nothing failed on that, so Bharat's SVAN account sat ₹20.6 L short in the book. `stitchWrappedRows` reads them as one row. A new `holdings-do-not-tie` read gap fires when the printed values read differ from the printed Total by more than ₹1. `pmsReaders.test.mjs` replays both reports and removes a figures line to prove the check fires.
- **`check:reads`' staleness test counts any statement that values its holdings, whatever its report type.** A value-less fact sheet and a report with a row-less section are not counted. When the newer type is not in the rule, the message names the rule to change. `checkReads.test.mjs` adds three cases.
- **SVAN 8710067's appraisal prints a `Cash Rec/Payable` of −₹24.8 L**, which makes that key net negative (−₹22.6 L) for the first time. `negligibleFloor.test.ts` asserted no such key existed; it now checks that a net-negative key survives the floor on the live book. `clubbedFigures.test.ts`' re-expression now leaves the average cost absent over a non-positive unit count, as `costedFigures` does. `datedCapital.test.ts` and `carriedCost.test.ts` take Buoyant's close from the 30 Sep account statement, and keep the snap as a witness on its own date.
- Book: consolidated ₹836.60 Cr → **₹836.57 Cr**, 444 → 448 positions. Left alone: Kotak 4295974's ₹619 MATERIAL break on a liquid-fund line (Hope India Trust, excluded from the book as a separate taxpayer), and 0.01-point weight deltas on Carnelian's report, whose printed weights total 99.93%.


### Stage 10ez — NO PARTIAL RETURNS: EVERY RETURN SURFACE READS ONE RECORD, WHOLE OR ABSENT

*"not all accounts are being read into the dashboard. It says partial return, 2 out of 76 accounts … We do not need to show partial return anywhere on the dashboard"* — the family, 21 Oct 2026.

### Stage 10ew — THE SEBI INVESTOR REPORT'S SINCE-INCEPTION TWRR AND ITS LOWER-CASE WINDOW

*"we need to integrate these files into the dashboard data … Make sure no information is missed"* — the family, 21 Oct 2026, re-sending `Svan - Bharat.zip`, `Svan _ Ajay.zip`, the Z660 report and `Svan - Bharat.eml`.

- **Nothing new by bytes.** The three files are already in `source/october-2026-c/`, and the email's one attachment is the same Z660 PDF. Its provenance (Nuvama FA, 8 Oct, forwarded by Bharat on 9 Oct) is recorded in `source/README.md`. All 15 documents behind them read `ok`.
- **The since-inception TWRR reached the book nowhere.** `pmsInvestorReport.mjs` mapped figures by their position on the flattened line, and blank 3Y/5Y/10Y cells vanish there. So `Returns of Client Portfolio 10.72 3.31` filed 3.31 as a 3-year return, on all nine investor reports, for accounts under two years old. `build-book` carries no 3-year field, so the figure was dropped. Each figure is now placed under the heading whose right edge it shares. Missing geometry raises `return-columns-not-read` and places nothing. `ReturnSeries` and `build-book` now carry `y3`/`y5`/`y10`.
- **`From 01/09/2026 to 30/09/2026` read as no window.** The period pattern required "To". Bharat's SVAN 8710090 September report and Carnelian's 7 Oct report print "to", so both bridges were undated and dropped. 8710090 now has its September bridge on `/performance`, and its printed 31 Aug opening (₹11.12 Cr) joins the NAV series. Carnelian's 7 Oct bridge is WITHHELD, ₹2,85,231.78 short of its closing, the gap Stage 10eu names.
- **The Performance block is archived as a `performance` section**: the TWRR table plus the client's XIRR and the approach's max/min/median XIRR. The approach figures cover all its investors and become no fact of the book.
- `pmsReaders.test.mjs` re-reads the Z660 PDF and checks the placement, the window and the four XIRR lines; moving 3.31 under 3 Years by geometry must read as 3 Years. Book totals unchanged (₹836.57 Cr). Page checks fail the same two invariants on `main` (DL-11; bridge sub-lines), so neither is new.

### Stage 10ey — PRIVATE MARKET: DATE OF INVESTMENT

*"date of investment is missing from the table in private markets page, add column to show that"*

- **The review's "Date investment range" column reaches the book.** `reviewBook.mjs` writes it onto every review position as `Position.investedDates` (`from`, `to`, `text`). Each end is a day, or a month (`YYYY-MM`) where the review prints only "Feb 20 - Jul 23"; a month is never widened to a day. A cell the reader cannot read as a date carries `null`. 89 review positions are dated; book totals are unchanged.
- **`BookFolio.invested`** (`investedSpanOf`) takes the review line's dates first, then the capital account's first and last dated call. An income-only view carries none: its units are the valued line's. `figuresOf` spans the earliest to the latest over the same folios `asOf` reads, and counts how many of them carry a date (`investedOf` of `investedAcross`).
- **Private Market gains a "Date of investment" column** after the name (`data-col-cell="invested"`, `data-invested`). It shows one date, or a "first → last" range. A row where only some folios carry a date says "N of M folios". A row with no dated folio renders `—` with the reason. The column sorts by first date.
- `privateBook.test.ts` checks the span on constructed folios and checks that every review line on the table is dated by the review.

- **Code cause:** Morning CIO → Returns built its own inputs from NAV history and cash-flow rows instead of the verified `accountReturnRecords` every other return surface reads (Stage 10ei/10em). FYTD measured 9 accounts where 17 are verified; the unit-ledger openings (HDFC ×3, Kotak, ICICI ×2, Invesco, 3P, Motilal MF) never reached it. The tab now opens and closes each account on its verified record, with statement marks between the two as window points.
- **Data cause, unchanged:** 42 accounts holding value have no verified opening valuation and dated capital through a closing valuation (Sanshi ×5, the MOPWM review ×6, ICICI NSDL, Buoyant ×2, SVAN ×2, Motilal Founders/Delphi/Active Momentum, India SME ×3, Carnelian Amritkaal and others; `RETURN-COVERAGE.md`). Records start on 1 Apr 2026, so YTD and 1Y/2Y/3Y have no opening value for any account.
- **Never a partial pool.** `measuredAccountsReturn` now returns `missing`, `outside`, `whole` and `reason`; its rate is null unless every account holding value is measured. Morning CIO's money-weighted and annualised tiles, NAV & Performance's consolidated row and tile, each Family & Entities member and `/holdings?of=measured` show `—` with the reason and the missing accounts named. A partial pool's flows are no longer handed to a calculation popup. The Returns tab's figures, opening/flows/closing/gain and portfolio-vs-index gap follow the same rule; "Partial return" is gone from every surface.
- **Accounted for, not missing:** `nothingToMeasure` — a verified nil (`notApplicable`), or an account with no record, no position and no opening value (custody counted under the review, income-only folios, quantity-only demats, nil statements). 17 such accounts are outside the whole; the "N of M" counts are of the 59 accounts holding value.
- Tests: `latestAccountReturns` (every account placed once; the book's rate absent; the tile and pool agree over the wholly verified set), `investorSummary` (an unvalued custody account neither blocks nor joins; a missing one leaves the annual rate absent with no inputs), `xirrWorking` (bridge proved on the verified set).
