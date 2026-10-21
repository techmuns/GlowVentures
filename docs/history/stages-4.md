# Stage history, part 4 (Stage 10ce → 10cq)

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 19529–24326). CLAUDE.md now carries the condensed rules; this file is the record. -->

### Stage 10ce — ARBITRAGE IS CASH, AND THE CASH NO HOLDING STATEMENT REPORTS

*"Wherever we have cash as asset class or category. Arbitrage funds or holdings
into that cash as well, because arbitrage funds are nothing but basically cash.
Implement this everywhere on the dashboard. Whenever, wherever we have cash as a
line item, we need to show arbitrage funds inside it. Arbitrage funds need not be
classified into any other category except for cash."*

#### The rule was half-written already, and the other half had no row to land on

Stage 10av put arbitrage **"in the rule and not in the book"**: its
`CASH_EQUIVALENT_KEYS` carried the liquid funds only, because no arbitrage fund
is a POSITION. That is still true of `glowData.ts`. What was not true is "not in
the book". Measured over `BOOK_SHARE_MOVEMENTS`, three arbitrage funds sit on
**Ajay's main demat 1201090012539150** — the account this file already calls
*"the largest remaining gap"*, which sent a TRANSACTION statement and no holding
statement — as depository closing balances that walked to their printed totals.

So a classification change alone would have moved nothing on screen: a rule
over rows that do not exist. **This is the tenth absence in this file recorded
against a premise nobody rechecked**, and once again the answer was on a
statement this pipeline had already read.

| On the depository, 31 Jul 2026 | Units | AMFI NAV, 22 Sep 2026 | Value |
| --- | ---: | ---: | ---: |
| Motilal Oswal Arbitrage Fund — Direct Growth | 2,80,67,435.434 | ₹11.2834 | ₹31.67 Cr |
| Kotak Arbitrage Fund — Direct Growth | 41,65,239.582 | ₹43.2772 | ₹18.03 Cr |
| Bandhan Arbitrage Fund — Direct Growth | 33,71,575.697 | ₹37.8551 | ₹12.76 Cr |
| HDFC Liquid Fund — Direct Growth | 2,282.178 | ₹5,587.7545 | ₹1.28 Cr |
| Nippon India ETF Liquid BeES | 49.071 | ₹1,000.00 | ₹49,071 |
| | | | **₹63.74 Cr** |

#### So the LIVE book values them, and only the live book

`depositoryCashHoldings` in `src/lib/fundNavs.ts` turns those balances into
positions at `units × AMFI's published NAV`, and `PortfolioContext` appends them
beside `applyQuotes` and `applyFundNavs`. **`glowData.ts` gains exactly one
field** — `transactionsOnly: true` on that account — and regenerates
byte-identically otherwise; `statementPortfolio` never sees a row. A fetched
price may not enter the book (§7), and these rows have no statement mark at all:
their value IS the published NAV, which is precisely the live overlay's job.

Five gates, each a wrong row avoided:

1. **The account sent a transaction statement and no holding statement, and
   carries no position of its own.** `build-book` derives the flag from the
   ARCHIVE — a transaction document and no holdings document — rather than from
   "an account with no positions". That second test is what the first draft
   used, and it also admits demat 37359311, whose holding statement IS in the
   drop and reported only the AIF units `dropDepositoryDuplicates` removes
   because the funds report them themselves. Nothing there is a cash
   equivalent, so no figure moved — which is exactly when a wrong gate goes
   unnoticed. Where a holding statement exists it is the authority, and the
   same account's transaction tape is not a second one. Exactly one account
   qualifies.
2. **The block walked from its printed opening to its printed closing**
   (`reason === null`) and closes with units.
3. **AMFI publishes a NAV the builder cleared for value.** `build-fund-navs`
   now joins a depository-only ISIN too, and records SEBI's category verbatim.
   An ETF from a depository is NOT cleared: its units and its NAV can be on
   different bases (DSP Gold's ten-fold break), and a depository balance carries
   no statement mark for the factor-of-two gate to test. Liquid BeES reaches the
   table only because the book carries its ISIN and the gate ran on the book's
   own marks.
4. **A cash equivalent by the committed map.** The other fourteen holdings on
   that demat are not valued — see the last section.
5. **No book position of the same ISIN and the same units**, or one holding is
   counted twice.

**THE LIVE BOOK READS ₹777.03 Cr on the NAVs committed with this change
(22 Sep 2026), ₹63.74 Cr of it the depository's cash** — ₹713.29 Cr without it.
Statement-basis pages do not move: Private Market, Capital Gains, Data Audit and
Ledger Insights still read `statementPortfolio`, and `/holdings`' own
statement-basis line names the depository rows as the part of its figure no
statement marks.

**ONE SWITCH.** `VALUE_DEPOSITORY_CASH_UNITS` in `fundNavs.ts`. Set it false and
every row goes, everywhere, and the account falls back to its generated reason.

#### The unit basis has a witness, because the basis gate cannot run

The builder's factor-of-two gate compares a published NAV against a STATEMENT
MARK, and a depository balance has none — so the one failure that could make
these rows wrong by ten times went unchecked by the gate written for it. A
document nobody in this join controls is asked instead: **the family's own
review records buying 1,63,08,407.445 units of Motilal Oswal Arbitrage at
₹11.0367 on 20 May 2026, and the depository credits exactly those units the
next day** (settlement, `PAYOUT-CR`). One purchase, two independent documents,
three decimals — and ₹11.0367 is on the scale AMFI publishes today, ₹11.2834.
`fundNavs.test.ts` asserts it rather than this paragraph.

#### An account valued in part says so

`partialValuationNotes`: the LIVE copy of the account drops its generated
`noPositionsReason` — "values nothing" stopped being true the moment one row
existed — and carries `partialValuation` instead: five cash-equivalent funds
valued, from what, at which dates, and **fourteen other holdings on the same
statement not valued**. Performance prints a `partial` marker beside the
account's figure; Family & Entities lists it as *partly valued* under "held, and
not valued here". A figure for SOME of an account's holdings names the rest.

#### Cash on every axis, and what each one moved

| Surface | Where arbitrage lands |
| --- | --- |
| Category (`holdingBucket`) | **Cash** — ₹14.2 Cr → **₹78 Cr**, 8 holdings: *includes 4 liquid and 3 arbitrage funds the family counts as cash* |
| Family asset class | **Cash** — their review files arbitrage on its DEBT tab; the instruction overrules it |
| Family basket | **Liquidity** — ₹28.5 Cr → **₹92.2 Cr**. There is no Cash basket, and their workbook files every cash equivalent it names on its Liquid sheet |
| Security axis | in the partition's **cash**, and **not looked through** — an arbitrage fund's disclosure is long shares hedged by short futures, and reading it as stock would print exposure nobody carries. A liquid fund's paper is real credit exposure and keeps its look-through |
| A class named on screen (`readerClassOf`) | Sector Composition's *Not a company share*, Return & Drawdown's wrapper rows, Data Refresh, Family & Entities, and each result's chip in the top bar's search (#72's) |
| The fund's own page | *"This holding is Cash — an arbitrage fund, which the family counts as cash and nothing else"*, and no look-through card |
| A mandate's own page | a liquid or arbitrage fund inside a mandate counts in its **cash sleeve**. No row on this book moves — every one is already typed `Cash` by its statement — and the rule is what keeps the next manager's arbitrage sleeve from reading as "other" |

Morning CIO's allocation and the Excel export read `holdingBucket` and the
family taxonomy, so they follow with no edit of their own. The chat context
gains a block naming the depository-valued rows, so the assistant is told where
₹63.74 Cr of the family's cash comes from rather than finding it unexplained.
**`CASH_EQUIVALENT_KEYS` is still the one list**, now eight keys, each cited —
the three new ones to AMFI's category and the family's instruction.

#### The cash instruction is its own rule, and the headings name which

`TaxonomySource` gains **`cash-rule`**. Folded into the direct-stock `rule`, the
Liquidity heading read **"₹62.5 Cr by the family's stated rule, not named
individually"**, with a hover explaining that "all the direct stocks" belong to
Thematic & Tactical — a sentence about the wrong rule, under the wrong basket,
attached to the largest figure in the section. Both headings now print it apart
(*"₹62.5 Cr counted as cash by the family's instruction"*), and Morning CIO's
allocation note says it in its own sentence. **Where the review already says
Cash — the liquid funds, on its Cash sheet by name — the review keeps the
source**: an instruction that claimed them would misattribute them the other way.

#### Arbitrage is identified by AMFI's category, never by a name

`build-fund-navs` records each scheme's SEBI heading (`Hybrid Scheme - Arbitrage
Fund`) and `isArbitrageFund` reads it by key or ISIN. `familyTaxonomy.test.ts`
gains a SECOND detector that reads no name at all — every scheme AMFI files as
Liquid or Arbitrage must be in the cash map — and the name detector now reads the
depository's balances too, so a cash fund arriving on a transaction-only demat
fails the suite by name instead of sitting under Mutual Fund.

#### Two defects found on the way, neither in the ask

- **"₹0 reported twice, counted once"** sat over the Monitor's Mutual Fund and
  Thematic & Tactical headings **on main**. `collapsed = raw − subtotal` sums the
  same numbers in two orders, and once published NAVs put unrounded values on
  the rows the residue is a few millionths of a rupee, which `> 0` read as a
  duplicate. The heading now needs more than a rupee — the bound the footer's own
  `dupGap` has always used — and `NO_PHANTOM_DUPLICATE` asserts it, because the
  zero scan reports a ₹0 as a lead and never as a finding.
- **The closed-position checks struck on the wrong set.** `FUND_CLASS_BOOK`'s own
  comment says *"a key is CLOSED only where every position under it is at nil"*,
  and three checks read `closedKeys` — every key with ANY nil row. The two
  coincided until HDFC Liquid: redeemed to nil in the HDFC folio, held on the
  demat. They read `redeemedKeys` now, which is that comment made true.

#### What it deliberately does not do

**The same demat holds five mutual funds AMFI prices that are NOT cash** —
Bandhan Large & Mid Cap ₹31.93 Cr, ICICI Equity Savings ₹23.44 Cr, ICICI India
Opportunities ₹18.98 Cr, Kotak Multicap ₹9.05 Cr, Kotak Large & Midcap
₹1.37 Cr, **₹84.8 Cr at the 22 Sep NAV** — plus eight company shares and one AIF.
The family asked for arbitrage to be cash, not for this account to be valued, so
the cash gate refuses them and `fundNavs.test.ts` asserts it. They are worth
naming because **they are the depository-clipped funds behind Stage 10ak's
Stable Growth gap against the review**; widening the gate is one line, and it was
offered rather than taken.

The review also carries two Invesco arbitrage lines and a Kotak Equity
Arbitrage REGULAR-plan line (6,42,940.095 units — not the Direct plan the
depository reports). **No statement in the drop carries any of them**, so they
are not here.

#### Checked

`check:pages` gains `stock-arbitrage` (the largest arbitrage fund's own page,
derived from the book and AMFI's store) and `family-partial` (the member whose
demat is partly valued). The checker's model of the book carries the depository
rows too — **re-expressed, never imported**, the five gates written a second time
off the committed data — because every partition check reconciles against a
rendered figure and the page renders them. Invariants: every arbitrage fund is a
row under Cash (category, asset class) and Liquidity (basket) and under nothing
else; the Cash heading's own liquid/arbitrage count; the family-axis headings
credit the arbitrage value to the cash instruction **to the rupee** and never to
the direct-stock rule; Morning CIO's allocation note does the same; `/holdings`
names the depository rows under its statement-basis line; Performance and Family
& Entities mark the partial account; Sector Composition files arbitrage under
Cash; the fund's page says Cash and draws no look-through.

**THE BOOK'S PREMISE IS A FAILURE, NEVER AN ABSTENTION.** Every one of those
reads `CASH_INSTRUCTION_BOOK`, and a derivation that finds no arbitrage in the
live book has lost its input — reporting NOT CHECKED there would let the whole
feature be deleted behind a clean sweep.

#### The full sweep found two routes the targeted runs never walked

The routes this change touches were walked and clean before the PR opened. The
FULL sweep on the branch then came back **2 of 196 combinations with a finding**
— `stock-mf-lookthrough` (eight invariants) and `stock-cmp-nav` (one) — and
neither was a misplaced arbitrage fund. Both routes pick their subject as "the
largest" of something in the checker's model of the book, and **that model had
just grown by five rows**:

- **`MF_KEY`, the mutual fund whose look-through is walked**, became Motilal
  Oswal Arbitrage — a page that is RIGHT to draw no scheme card, which is what
  `stock-arbitrage` asserts. Eight failures against a correct page. An arbitrage
  fund is no candidate now, and the comment says why.
- **`CMP_BOOK.navKey`, the largest holding the published NAV prices**, became a
  depository row — which has no statement mark for the NAV to replace, so the
  route had stopped walking the overlay it exists for. It keeps a
  statement-marked holding; the depository rows have their own route.

Both walk Helios Flexi Cap again, the subject main's sweep walks, confirmed off
`report.json` rather than assumed. **A change to the checker's model of the book
moves the subject of every derivation that picks "the largest"**, so a targeted
run over the routes a change touches cannot establish that nothing else moved;
the full sweep is the only thing that can.

**AND ONE OF THE TWO WAS ALSO A WORDING DEFECT ON THE PAGE.** The arbitrage
page's headline caption said the units are a depository's balance "and no
statement marks them" — and `stock-cmp-nav`'s guard against a NAV wearing the
statement-mark label is `/statement mark/i`, which reads that negation as the
label. The check was right to be strict and the sentence was needlessly close to
the label, so the SENTENCE moved: "no statement prices them", and the row hover
beside it likewise. The arbitrage page now asserts the caption names AMFI's NAV
and the store's own date for that scheme, and never a statement mark — the claim
`stock-cmp-nav` makes, struck on the one kind of holding that route no longer
walks. A missing headline there is a FINDING: the route's subject is a holding
with a price.

#### Merged with main five times, and a letter collided every time

**#70 — Polycab as one table, Sector Composition in two halves — took `10bt`**,
and git marked that conflict because both sections sat at the same place. This
section became `10bu`. **#73 — "a search that finds nothing says why" — then
took `10bu` while this branch was being verified**, and that time the two
sections sat in DIFFERENT places, so CLAUDE.md merged with no marker and no
warning and left two sections under one letter. It was caught the way Stage
10bl's merge note says it must be — by comparing main's stage letters against
the branch's at merge time — because nothing GitHub reports could have shown it:
its mergeability check sees text conflicts, and this was not one. **#75 —
Buoyant's cost as paid — then took `10bv`**, found the same way, on the fetch
made to confirm main's tip before pushing this section's own record. **#72 —
fund returns by measure, the family's own fund split and the top bar's search —
then took `10bw` while the final sweep was running.** **#79 — Private Market and
the Portfolio Monitor as one master table each — then took `10bx` while this
section's own results were being written up**, and its text reserves `10by` for
the Portfolio Monitor's stage, which it has not written yet. Main keeps all five
letters and the one it reserved; this section is **`10bz`**.

**THE FOURTH COLLISION WAS INVISIBLE TO THE CHECK AS IT HAD BEEN RUN.** Counting
each letter on the two sides found no difference at all: main carried one
`10bw` and so did the branch, so the two lists were identical while the sections
they named were not. Git marked this one, because both sections followed
`10bv`, but a comparison that cannot see a same-letter pair would have passed a
silent one. It was found by listing the headings main ADDED since the branch's
base, which names the title as well as the letter — **compare headings, not
letter counts.**

Each round classified every line naming the moving letter against the two
sides' own copies of this file: this branch's cross-references (the
`CASH_EQUIVALENT_KEYS` and `fundNavs.ts` Layout bullets, Stage 10av's "both halves
have since changed" note, the `build-fund-navs` Build entry and, from the third
round, #73's withholding note) moved with the heading; main's own headings and
merge notes stayed. On the fourth round `10bw` named 23 lines and 8 were this
branch's — and nine of main's 15 sit OUTSIDE its own section, in Layout, the
data-model preamble, Stages 10m, 10s and 10bp and the Build list, so a bulk
rename would have made #72's fund-split and payout references cite this one.
On the fifth round `10bx` named 14 lines: 8 were this branch's and moved, and 6
are #79's — its heading, its merge note, the `TreeTable.tsx`, `privateBook.ts`
and `fundReturns.ts` Layout bullets, and the "CLOSED AT" note under Stage 10bs —
and stayed. The stage headings then differ from main's by `10bz` alone, with the
ten historical duplicates unchanged.

**THE `ctx` LITERAL CONFLICTED ALL FIVE TIMES** — main's `sectorLayout` and
`shortWindow`, then its `absentName`, then its `costCarried`, then its
`pmReturn`, then its `treeState`, beside this branch's `cashDom` — and each was
resolved as a union the script had to PROVE: 86 keys, none duplicated, every
one naming a declared identifier. On the fifth the union was NOT everything
either side carried: #79 removed the probe that declared `schemeCalls` with the
table it read, so that key would have thrown inside every check on every route
and is dropped rather than kept.

**#75 AND #72 BOTH CHANGED THE GENERATED BOOK, WHICH THIS BRANCH CHANGES TOO**,
and a generated file is never hand-merged. `glowData.ts` and
`docs/BOOK-REPORT.md` were REGENERATED by `build-book` from the merged archive
and the merged builder each time, and the result differs from main's own by
exactly this branch's two additions: the `transactionsOnly` flag — the one line
this change adds to the book — and the share-movements note that says why a
window with no position is empty. On the fourth merge git's textual merge
happened to equal the regenerated file byte for byte, which is not a reason to
skip the step: only regenerating could have said so. #79 did not touch the
generated book, and the control was run on its merge anyway: byte-identical.

**#70'S NEW SECTOR PAGE STILL CARRIES THE CARD THIS BRANCH'S CHECK READS.** It
rebuilt Sector Composition around `<Figure>` cards, and "the excluded card files
the arbitrage funds under Cash, never under Mutual Fund" reads the "Not a company
share" figure by the same text layout main's own reconstruction check reads —
both pass on the merged tree, which is the only place that could be settled.

#### …and #73 would have contradicted this change on screen

#73 answers a search that finds nothing with the family's review: *"on the
consolidated review · no statement reports it … this book publishes no value or
quantity for it until a statement arrives"*. Its gap list names **Motilal Oswal
Arbitrage Fund Direct (G)** (₹31.80 Cr on the review) and **HDFC Liquid Fund
-Direct(G)** (₹1.26 Cr) — both of which this change values from the depository's
own balance. Neither branch was wrong on its own terms: the reconciler that
generates that list reads `glowData.ts`, and these rows are LIVE-only, so they
are not in it. **Together they would have printed "no value or quantity" on a
page whose table values the holding** — on a narrowed drill-down, or on the
Monitor when a reader types the review's own spelling, which empties the list
because no option carries its "(G)".

`claimableGaps` withholds a gap the live book values from a depository balance,
joined BY ISIN through a hand-checked table (`REVIEW_LINE_ISINS`), never by a
name — the depository prints the AMC's name in front of the scheme's, so no name
tier reaches it. It is keyed on what `depositoryCashHoldings` actually carries,
so switching that valuation off brings the sentence back, true again. Each entry
is licensed by the same kind of witness as the unit basis: **the review's own
purchase of that exact line is a credit the depository makes to that ISIN, unit
for unit** — 1,63,08,407.445 Motilal Oswal Arbitrage units on 20/21 May, and
HDFC Liquid's 2,282.178 on 5 June, the balance the review's Cash tab prints.

`reviewGaps.test.ts` asserts each entry names a gap and a live row, that the tier
is LOAD-BEARING (the name tier alone would have claimed each line absent), and
the witness itself. `check:pages` types the review's spelling into the Monitor
and asserts the note does not claim it, with that name derived by the same
witness join rather than read from the table, which would agree by construction.

**AND THE FIRST DRAFT OF THAT CHECK COULD NOT FAIL.** The checker's `bookArray`
already appends its re-expressed depository rows, so running them through the
gates again found the account carrying positions and yielded nothing — and the
invariant ABSTAINED with "the live book values no depository balance", because
its guard read the same broken count. The rows are read off the checker's book
now, and the premise is struck on `CASH_INSTRUCTION_BOOK`, a separate
derivation: **a guard read off the same computation as the thing it guards
abstains exactly when that computation breaks.** Removing the tier then fails the
check by name, which is the only evidence it can.

#### …and #72's search box named an arbitrage fund a mutual fund

#72 put a search box in the top bar that finds any holding, account, member or
page, and it is built from the LIVE portfolio — so it finds the depository's
cash-equivalent funds this change values, which no statement-basis surface
carries. Two things it printed about them were wrong, and neither was wrong on
#72's own terms, which is why only the merge could show them:

- **Each result's chip named the WRAPPER.** It read `head.assetClass`, so the
  three arbitrage funds and four liquid ones chipped "Mutual fund" beside a
  detail line reading "Cash" — the funds named twice, two ways, on the one
  surface where a reader types the family's own word for them. It reads
  `readerClassOf` now, the class every other page names a holding under.
- **The transaction-only demat read as a whole account.** Its entry said
  "5 holdings · ₹63.7 Cr" — a figure for SOME of the account's holdings standing
  where a reader takes it for all of them, since the statement carries fourteen
  more that nothing values. It leads with **partly valued** now, before the
  figure, because that line is truncated to one row.

`withPartialValuation` in `fundNavs.ts` is the live copy of the account registry
`PortfolioContext` builds, extracted so a suite builds the same one rather than a
copy of it. `searchIndex.test.ts` builds the index over the LIVE rows —
everything else in it builds from `BOOK_POSITIONS`, which never holds them — and
asserts both rules; its load-bearing case requires funds a statement typed as a
mutual fund, or it would pass on the rows a PMS statement already files under
Cash. `check:pages` types "arbitrage" into the rendered box and requires every
arbitrage fund the book carries, each chipped Cash, read off the chip's own
`data-search-chip` node — and types the partly valued account's own number and
requires its entry to lead with the marker. Reintroducing the wrapper chip fails
the suite (naming all seven funds) and the rendered check alike, and so does
dropping the marker.

#### …and #79 made every statement a line of the table, so the depository's lines say what they are

#79 turned the Portfolio Monitor's holdings table into a tree (`TreeTable.tsx`):
a holding opens into ONE LINE PER STATEMENT, in the table's own columns, each
with its own mark and its own hover, and a section heading is a band whose
quiet line is `TreeSectionCell`'s `sub`. Two things this change draws had to
land on that new shape rather than on the one they were written for:

- **The cash notes moved into the band's line, unchanged.** "Includes 4 liquid
  and 3 arbitrage funds the family counts as cash" on the Cash heading, and
  "₹62.5 Cr counted as cash by the family's instruction" on the family axes'
  Cash and Liquidity headings, are the same words with the same handles
  (`data-cash-includes`, and `data-cash-rule-mv` on the band's `<tr>`), so every
  check that reads them reads them where they now are.
- **A depository line now says what it is.** A depository row is one of those
  statement lines, and #79 gave every line the hover *"AMFI's published NAV for
  this scheme, as of …"* — true, and silent about the one thing a reader needs:
  that NAV replaced NO statement mark, because the account sent a transaction
  statement and no holding statement. The parent row already said so; the line
  it opens into is the more precise place, so the line says it too, from the
  same `depositoryUnits.asOf` the parent reads.

`check:pages` holds it on `monitor-open-all` — #79's own route, every row open —
in both directions: every line the checker's own re-expression of the
depository rows names must carry the sentence, and no other line may, because a
statement-marked line wearing it is the same false provenance run the other
way. An empty set there is a FINDING, never an abstention: it would mean the
checker's book lost the rows the claim is about.

#### Seventeen bugs reintroduced, and two were not results the first time

Each case was applied alone in a separate worktree on its own port, rebuilt and
swept over the routes it touches (light theme, where the invariants run), with
the files restored from a snapshot, VERIFIED byte for byte, and the tree rebuilt
on the way out. The unpatched control ran first and came back clean, and seven
cases also ran the unit suites. **The whole pass — the control and all seventeen
cases — was run again on the tree merged with #72**, because #72 edited three of
the files it patches (`analytics.ts`, `MorningCIO.tsx`, `PortfolioMonitor.tsx`),
added the one the two new cases patch (`searchIndex.ts`) and changed the checker
every case runs. The table is that run.

| Bug put back | Fires |
| --- | --- |
| the three arbitrage keys removed from `CASH_EQUIVALENT_KEYS` | **11 invariants across 7 routes** — every axis, both headings, the allocation card, the fund's own page and the search box — **and 10 FAIL lines in three suites**, the name detector naming all three depository balances by the names they print |
| the switch off, so the live book carries no depository cash | **26 invariants on all 14 routes the pass walks, and 16 FAIL lines in four suites** — which is also the measured reach of the switch. The checker's copy of these rows deliberately does not read it, so turning the valuation off fails the sweep by name on every surface the rows reach, rather than leaving a stale model agreeing with a changed page |
| the cash instruction folded back into the direct-stock rule | 5 invariants on 4 routes, and 3 suite lines naming each fund `rule/rule` |
| arbitrage looked through on the security axis | the partition: the five buckets stop rebuilding NAV |
| the arbitrage fund's page draws a look-through card | its no-look-through check |
| Performance drops the `partial` marker | its own check on `performance` |
| `/holdings` stops naming the depository rows | its own check — and, on the first run, one check on a page it does not render; see below |
| Morning CIO drops the cash-instruction sentence | both family-axis allocation routes |
| a sub-rupee gap read as a duplicate again | `NO_PHANTOM_DUPLICATE`, on three routes |
| Family & Entities drops the partly valued account | its own check |
| a class named on screen back to the wrapper | the sector card's Cash check — **and no suite**: `excludedClasses` is asserted on the page alone, which is recorded rather than papered over |
| the partition's cash leaves out the arbitrage funds | the partition |
| the Cash heading stops counting arbitrage | its own count, on two routes |
| a depository row loses its NAV caption | the new caption check on `stock-arbitrage` |
| the review-gap tier removed | the new review-gap check on `monitor-absent-name`, and 2 lines in the review-gap suite |
| the search chip names the wrapper again | the rendered chip check on `search`, and a suite line naming all seven cash-equivalent funds by the wrapper they were given |
| the search drops the partly valued marker | the rendered marker check on `search`, and its suite line (`0 entries vs 1 accounts`) |

Every case carried exactly one NOT CHECKED — the pre-existing KPI-tile claim on
`cio-allocation` — so no bug turned a finding into an abstention. **Two patches
first came back NOT A RESULT**, and the harness saying so is the point: setting
the switch to the literal `false` narrowed its type until a comparison in
`fundNavs.test.ts` stopped compiling, and deleting the `partial` condition removed
the narrowing its own hover depended on. Both were rewritten to keep their types.

**AND ONE CASE FIRED A CHECK ITS PATCH CANNOT REACH, ONCE.** Hiding `/holdings`'
depository line also failed *"a company held only inside a fund renders its
measured cells absent, never zero"* on the security-axis Monitor — a page that
does not render `HoldingsBehind`, which only `App.tsx` imports. Run again alone,
the case fired its own check and nothing else. Eleven more walks of that page —
three quiet, eight with every core saturated by busy loops — passed that check
every time, with all 547 fund-only rows present and all 547 of their reasons
read. **So the cause is NOT ESTABLISHED, and it is recorded rather than called a
flake.** The one mechanism the walk's own order suggests — it reads the page's
`title`s before its rows, so rows landing between the two reads would leave their
reasons unread — is what the loaded walks were run to reproduce, and they did
not. The first failure happened while the full sweep ran a second browser on the
same machine, which the busy loops do not imitate; and one quiet walk read 701
more `title`s than the other ten, so the page is not always in the same state
when it is read. That is a lead for whoever next touches the walk, not a cause.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 42 + 44 + 30 + 29 + 22 + 140
(2 not checked, 0 blocked) · `test:family` **38 suites, 0 failed** (new cases in
`familyTaxonomy.test.ts`, `fundNavs.test.ts`, `reviewGaps.test.ts` and
`searchIndex.test.ts`; the one NOT CHECKED is the fund-NAV basis gate's, which
predates this change) · `check:family` **86/0** · CI (`build`) and Cloudflare
Pages green on the pushed merge · `check:pages` **214 combinations clean, 0
invariant failures**, with the eight evidenced abstentions main's own sweep
carries and not one of this change's — four from the KPI-tile claim spread across
Morning CIO's panels, two from every private holding reporting a cost, the
not-found crumb and the pledge claim on `stock-qty` — read out of the log BY
NAME.

**MEASURED ON THE TREE MERGED WITH #72, AND IT RECONCILES ONLY BECAUSE IT WAS
RE-RUN.** Main's own sweep is 210 — Stage 10bw's figure — and this change's two
routes (`family-partial`, `stock-arbitrage`) across both themes make 214. This
section's earlier figures were each true of their own base and of no other: 196
before any merge, which failed two of them, and 204 on the tree merged with #73.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, and `npm run reconcile:review` regenerates #73's
`reviewGaps.ts` and `docs/REVIEW-RECONCILIATION.md` byte-identically too — the
gap list is unchanged; what changed is which of its lines a search may claim.

#### …and a sixth time, when the go-ahead came for four PRs at once

*"#78, #74, #76, #77 — merge all of these PRs to main."* By then main had taken
FIVE more letters while this branch waited: **#83** (Ask Muns off the top bar)
took `10bz`, **#80** (every return FIFO) `10ca`, **#82** (the KPI tile
layouts) `10cb`, and — merged first in this same round, being the smaller two —
**#76** `10cc` and **#77** `10cd`. Main keeps all five; this section is
**`10ce`**. The eleven code comments that named this section by its earlier
letters (`10bv`, `10bx`, `10bz`) point at `10ce` now, and the stage headings
differ from main's by `10ce` alone, with main's ten historical duplicates
unchanged — compared as HEADINGS, which is the check the fourth collision above
taught.

**#76 AND #77 LANDED AS SQUASH MERGES, AND THAT CHANGES HOW A BRANCH CATCHES
UP.** This branch had already merged both PRs' heads, so main's tree after their
squashes was a tree this branch contained — but a squash shares no history with
the commits it replaced, so merging main directly conflicted against the OLD
base on every file those PRs touched. The fix was structural rather than a
second resolution: merge #77's final head first (its tree IS main's), confirm
main's tree and that head's are byte-identical, then record main with
`git merge -s ours`. Resolving the same hunks twice would have been two chances
to resolve them differently.

**THE CONFLICTS THAT WERE REAL**, each resolved against the tree #76 and #77
land as:

- **`build-book`'s share-movement join keeps both halves.** #76 files a window
  whose ISIN names one book company under that company; this branch splits an
  unjoined window into nil closes, units still held on a transaction-only
  account, and rows deliberately not carried. #76's note said its bridged
  windows sit in an account that no longer holds the security — **7 of the 10
  still hold units**, measured, so the note says both.
- **`PortfolioContext`** sends the statement's rows through #84's
  corporate-action layer and this branch's depository cash rows through the
  quote overlay, then both through the published NAV, as before.
- **The arbitrage look-through exclusion moved into #76's `heldFundVehicles`**,
  so the page and the suite read one definition of which funds are looked
  through rather than two.
- **A depository cash row the book also carries takes #76's one name per key**
  (`securityLabel`) rather than a second spelling of the same fund.
- `types.ts`, `fundNavs.ts`, Morning CIO, the Portfolio Monitor and Return
  Analysis are unions: #80's FIFO fields and capital basis beside this branch's
  cash-rule sources.
- **The `ctx` literal is a union of 92 keys**, none duplicated, each naming a
  declared probe.

**THE GENERATED FILES WERE REGENERATED, NOT MERGED.** `build-book` over the
merged archive and builder reproduces `glowData.ts` and `docs/BOOK-REPORT.md`,
and `BOOK_SUMMARY` does not move by a rupee: this change moves cash between
sections and values a depository's cash, and neither is a new holding.

`build` · `tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund
35, buoyant 42, classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22,
neoFlows 8, golden 140 — 2 not checked, 0 blocked) · `test:family` exit 0 ·
`check:family` **84/2** · `check:pages` **244 combinations, 3 with a finding**.

**EVERY ONE OF THOSE FIVE FAILURES IS MAIN'S, AND WAS SHOWN TO BE BEFORE THIS
MERGED.** The two `check:family` failures are the Extras-menu checks, which fail
identically on main because #84 added a fifth page (`/corporate-actions`) to a
dropdown the check still counts as four. The three `check:pages` findings are
the three Private Market routes, failing the identical invariants on main's own
run — the fund-return re-expression in the checker (#72's) still strikes HPR as
value against cost, where #80 made every HPR FIFO. Neither was introduced here
and neither is fixed here: a merge that also rewrote two other stages' checks
would be a change nobody asked for, and the two are named here and in the PR so
they are not mistaken for this branch's. *(Both fixed at Stage 10cj.)*

### Stage 10cf — A ROW THAT IS WHOLE ACCOUNTS CARRIES THE MONEY-WEIGHTED RETURN ITS PAYMENTS SUPPORT

*"According to the client the return [on] all this AIF is a lot higher than what
we are showing on the dashboard. So please check if we are missing anything and
in case there is any calculation mistake … check it for all other investments as
well."* — sent with a screenshot of Buoyant Opportunities Strategy Class A4's
company page. Then, on the merge: *"#78, #74, #76, #77 — merge all of these PRs
to main."*

**THIS IS #78, AND MOST OF WHAT IT BUILT HAD ALREADY LANDED ANOTHER WAY BY THE
TIME IT WAS MERGED.** It was written as Stage 10bx while other PRs were open, and
its answer to the client had two halves:

1. **Every return struck on the capital the family put in**, not on the cost of
   the units held today — a new `src/lib/capital.ts` read by every surface that
   prints an Invested, a P&L or a return.
2. **A money-weighted return wherever a row IS an account** whose every payment
   is dated — the XIRR the Monitor's column had never carried, and the figure
   Buoyant's own fact sheet prints.

**THE FIRST HALF IS SUPERSEDED AND WAS NOT PORTED.** Stage 10ca (#80) made every
return FIFO — `(unrealised + realised) ÷ (cost held + cost of units sold)`, with a
whole PMS mandate struck on its capital since inception, which is #78's own
figure for a mandate by construction — and Stage 10cd (#77) put the family's own
dated capital record on the Transactions card with its own purchase, redemption
and appreciation. Porting a third basis beside those two would have given one
account three returns on three pages. So `capital.ts`, its suite, the net-capital
Invested and P&L on the Monitor, Morning CIO, `/holdings`, Family & Entities,
Private Market and Return & Drawdown, the Excel sheet's capital columns and the
chat context's capital fields are **not** on main, and are recorded here rather
than deleted from memory. Buoyant's cost half had landed a third way, through
Stage 10bv's carried cost.

**THE SECOND HALF IS NEW, AND IT IS WHAT LANDED** — rebuilt on main's own
machinery rather than on `capital.ts`:

- **`Account.capitalRecordTo` and `recordShortfall`** (`build-book`,
  `tranches.ts`). A capital RECORD must reach the date the value beside it is
  struck on, as well as reach back to inception. Green Lantern 510861's record
  comes from a quarterly report ending **30 June** against holdings struck **27
  July**, so the withdrawals between the two are in its value and not in its
  record. `capitalRollup` now refuses that account's appreciation and return with
  the reason — on the Transactions card and on the mandate page too, which had
  been striking one over the gap. It is the ONLY account it moves.
- **`src/lib/datedCapital.ts`** — which rows of a holdings table ARE whole
  accounts, and the pooled rate over them. It adds no definition of its own: the
  accounts, their flows and the value they close on are `capitalRollup`'s, the
  construction the Transactions card already strikes each account's XIRR from.
  So a folio's XIRR on the Monitor is its XIRR on the Transactions card **by
  construction**, and the suite asserts it to the millionth on all eight accounts
  funded more than a year ago.
- **The whole-account rule.** An account's record describes the whole account,
  so it stands behind a row only where the row carries every holding of it that
  carries money — a mandate row, a fund's row over its folios, a statement line
  that is the whole folio. A share of a mandate keeps the per-holding refusal.
  Buoyant prints a **₹0 Cash** line beside its units; counted, both folios would
  be "split" and lose a rate the whole of their money supports, so a ₹0 line with
  no cost carries nothing — and a ₹0 line WITH a cost (a write-off) still splits.
- **The Portfolio Monitor's XIRR column** shows the pooled rate on those rows,
  each account closing on its own statement's value and date, and the reason on
  every other row. Its header counts RATES (`N money-weighted of M`), because a
  row funded under a year ago shows its holding-period return, tagged HPR, and is
  not one.
- **The family's own rule on `auto`** — *"an XIRR when there are multiple
  tranches"* (Stage 10af): several dated payments → XIRR, one payment a year or
  more ago → CAGR, under a year → the holding-period return, tagged. The CAGR
  column refuses a several-payment row and points at XIRR, exactly as the
  Transactions card refuses the same account. **HPR is untouched everywhere** —
  still FIFO's figure on every row.
- **The company page** prints XIRR as a third line under a statement row that is
  the whole account — **15.30% and 9.76%** on Buoyant's two folios, the IRR
  Buoyant's own fact sheet prints for each, reproduced to the printed decimal
  from the dated deposits. Under a year it prints none.

**ON THE DEFAULT VIEW, SIX ROWS NOW SHOW XIRR WHERE THEY SHOWED A CUMULATIVE
RETURN** — Buoyant, Sanshi, Neo Infra and Baring, and SVAN's two mandates, each
funded over several dated payments more than a year ago. The cumulative figure
has not gone: it is the HPR column, unchanged. For the two mandates it is FIFO's
return on their capital (13.56% and 12.73%), so Stage 10ca's check that every
mandate row's Return is FIFO's now expects XIRR on exactly those two, re-solved
from the book, and FIFO on the other eight — and requires the FIFO half to have a
subject, so a build that sent every mandate to XIRR cannot pass by never checking
FIFO.

| Row on the Monitor | Accounts | Measure on `auto` | |
| --- | ---: | --- | ---: |
| Buoyant Opportunities Strategy — Class A4 | 2 | XIRR, pooled | 12.11% |
| Sanshi Fund-I (both classes, clubbed) | 5 | XIRR, pooled | 42.31% |
| Neo Infra Income Opportunities | 1 | XIRR | 16.68% |
| Baring Private Equity India Fund 6 | 1 | XIRR | −6.42% |
| SVAN 8710067 · 8710090 | 1 each | XIRR | 9.07% · 8.60% |
| Transition Venture Capital Fund I | 1 | HPR — 165 days | +128.61% |
| Green Lantern 510861 | 1 | FIFO, as before — no rate | record ends 30 Jun |

#### The checks, and two that could no longer see what they were for

`datedCapital.test.ts` (in `test:family`) anchors the rate OUTSIDE the code: the
IRR Buoyant's fact sheet prints, read out of the committed `pages.json`. It holds
`recordShortfall` load-bearing — the same record with its reach stated as met
WOULD be rated, so nothing else is refusing Green Lantern — and the two paths,
the whole-account rule and every branch of the methodology on constructed
capital. `tranches.test.ts` and `capitalRecord.test.ts` had synthetic record
accounts with no `capitalRecordTo`; their fixtures now state a record that
reaches their value, and the refusal side is asserted on the real book.

`check:pages` restates both halves off `glowData.ts` in **`DATED_CAPITAL_BOOK`**
— which accounts are rated, which rows are whole, and the pooled rate by
BISECTION, never importing `datedCapital.ts`. The Monitor's XIRR route asserts
the rate stands only on whole dated rows and re-solves; that every row the book
says is whole carries its accounts (the converse, which is what catches the ₹0
line splitting Buoyant); and the header's count. Every company page asserts its
XIRR line exactly where the book says, and **`stock-capital`** walks Buoyant's.
The return cell carries `data-capital`, `data-capital-accounts` and
`data-row-keys` for this; the ctx literal needed no new key.

- **The CAGR sort check read the whole column as one list** — true while every
  CAGR figure sat in Direct Equity. Rows rank within their section (Stage 10bh),
  and Transition Venture's figure is in AIF, so it failed a correctly sorted
  table. It ranks per section now.
- **"No return of 100% p.a." scanned every percentage in a row**, and read
  Transition Venture's +128.61% — tagged HPR, money in for 165 days — as the
  extrapolation regressing. It is struck on the untagged cells, the annual ones.

**SIX BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK** (`scripts/dev/dated-capital-bug.py`,
committed so the next verification is one command): the ₹0 line splitting an
account fires three (the converse and both company-page claims); the record-reach
rule dropped fires two (Green Lantern rated, and marked dated where the book says
undated); a rate closed on the wrong value fires both re-solves; the company
page's XIRR line dropped fires two; a row holding PART of an account given its
rate fires the converse; and the multiple-tranche rule dropped from `auto` fires
the FIFO mandate-row check on SVAN's two rows. The pass ran twice: first on the
port before it was merged, after a no-patch control came back clean, and again
with the committed harness on the merged tree. Both runs gave the same six
results, and each time the files were restored and the tree rebuilt after the
last case. On the merged tree the full sweep below is the control, and it was
clean on every route these cases walk.

#### Merged with main

**THE LETTER.** #78 wrote this as Stage 10bx. While it waited, main took 10bx
(#79), 10by (#81), 10bz (#83), 10ca (#80), 10cb (#82), 10cc (#76), 10cd (#77) and
10ce (#74), so it is **10cf** — checked against main's tip at the moment of
merging, and no line on main names 10cf. The code comments this port adds name
10cf; none of #78's own `10bx` references came across, because the files that
carried them did not.

**THE MECHANICS.** The branch's own history is kept — main came in as a merge
commit, never a rewrite — and that commit's TREE is main's plus this port: every
file #78 changed that is not re-implemented here was taken as main has it.
`src/lib/capital.ts`, `capitalBasis.test.ts` and `scripts/dev/capital-bug.sh` are
therefore gone, and so is every edit #78 made to the eleven surfaces the
net-capital basis touched. #78 had already given its ingest half up to #75's
reader, so of the ingest and generation code only `build-book`'s one field moved.

**THE `ctx` LITERAL NEEDED NO NEW KEY.** The `returnCells` and `posTable` probes
gained fields; nothing else in the sweep's shared context moved.

**THE GENERATED BOOK WAS REGENERATED RATHER THAN SPLICED.** `glowData.ts` is main's
book plus `capitalRecordTo` on every account — a date on the 14 that publish a
dated record, null on the other 37 — and `BOOK_SUMMARY` does not move by a rupee.
`docs/BOOK-REPORT.md` is byte-identical.

**VERIFIED ON THE MERGED TREE** (main at `c1bfddd` plus this port): `build` ·
`tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund 35, buoyant
42, classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22, neoFlows 8, golden
140 — 2 not checked, 0 blocked) · `test:family` (46 suites, 2,466 checks, 0
failed) · `build-book` byte-identical · `check:family` **84/2** · `check:pages`
**246 combinations, 3 with a finding**. That is main's 244 plus `stock-capital` in
both themes, and it reconciles only because the sweep was re-run.

**EVERY ONE OF THOSE FAILURES IS MAIN'S, AND EACH WAS SHOWN TO BE ON `c1bfddd`
ALONE BEFORE THIS MERGED.** The two `check:family` failures are the Extras-menu
checks: #84 added a fifth page and the check still counts four. The three
`check:pages` findings are the Private Market routes, 8 invariants in all, and the
identical 8 fail on main's own build. #72's fund-return re-expression still
computes HPR as value against cost where #80 made it FIFO. Stage 10ce named both
and left them, and so does this. *(Both fixed at Stage 10cj.)* The 10 invariants not checked are all
pre-existing claims with no subject on this book (six KPI-tile lines across the
Morning CIO routes, three Private Market lines, one crumb on the not-found
drill-down); none is this stage's.

**AND THE DEFAULT VIEW MOVES, MEASURED ON BOTH BUILDS.** The Monitor's `auto`
Return reads XIRR where it read HPR: Buoyant +8.65% → 12.11% (both folios pooled),
Sanshi +29.84% → 42.31%, Neo Infra +13.83% → 16.68%, Baring −6.95% → −6.42%, SVAN
+13.56% · +12.73% → 9.07% · 8.60%. The HPR and Absolute columns read exactly what
they did. SVAN's figure falls because a cumulative return over almost two years
became an annual rate. Buoyant's rises because 75% of its ₹70.86 Cr went in
during the last year, so an annual rate is above the 790-day cumulative figure.

### Stage 10cg — GLOW CENTRAL RESEARCH'S FONTS AND COLOURS

*"also look how good the font is and the ui is of glow-central research -
colours white etc - can you make this dashboard also with right color pallet and
fonts please i think right now its too monotonous and dull"*

**THE PALETTE AND THE FACES ARE GCR'S OWN, READ OFF ITS REPO RATHER THAN
MATCHED BY EYE.** `techmuns/glow-central-research` is read-only here, and three
of its files decide the look: `scripts/glow-palette.cjs` (ivory page `#f4f2ec`,
white surfaces, navy ink `#1a1830`, gold `#c3a962` → `#8a6a1c`, emerald
`#047857`), `public/css/glow.css` (the two faint gold glows at the top of the
page) and `public/index.html` (Inter for reading, Plus Jakarta Sans for titles
and headline figures, loaded from the same Google Fonts URL).

**WHAT MADE IT DULL WAS THAT EVERYTHING WAS ONE TONE.** The nav, the top bar
and the page were three shades of one beige, the tables were set in a
monospace, and the only thing that stood out was the cards. What changed, and
where it lives:

| | was | is |
| --- | --- | --- |
| reading face | Inter with the single-storey `a` and open digits | plain Inter, as GCR sets it |
| figures (`.mono`, ~400 cells) | JetBrains Mono | Inter with tabular digits |
| titles, card titles, headline figures | Inter semibold | Plus Jakarta Sans bold (`font-display`) |
| nav and top bar | the page's ivory | white (`app-sidebar`, `app-topbar`) |
| the page | ivory on a graph-paper grid | ivory under two gold glows |
| where you are in the nav | a beige wash | GCR's active tab: gold type on a pale-gold wash, a gold edge |
| an active toggle or tab | flat gold | GCR's gold gradient, ink on it |
| table headings | grey, medium weight | darker, semibold, on GCR's cream band |
| cards | 12px corners, a grey shadow | 16px corners, GCR's two soft layers |
| Export Excel | a gold outline | green, as GCR's is |
| wordmark | "Glow Ventures Family Office" | GCR's: a gold G and GLOW VENTURES in gold capitals |

**THE DARK THEME KEEPS ITS COLOURS AND TAKES THE FACES.** The family pointed at
the light one, and the dark theme is the palette's native form; it gets the new
type and nothing else.

**ONE RULE HOLDS THROUGHOUT, AND IT IS WHY TWO THINGS DIFFER FROM GCR.** GCR
prints white type on its gold "Portfolio" pill and on its green Export Excel
button. `check:pages` rejects exactly that on a light page, because pale type is
what a missing light-mode remap looks like, so an active control here is gold
with INK on it (7:1) and Export Excel is a green tint with deep-green type
(6.8:1). Nothing on the light theme is a dark fill or white text.

**AND NO CARD MAY CARRY A HARD OFFSET.** A `0 Npx 0 0` shadow layer is what
makes a KPI tile read as a button (Stage 10y), and the page check fails any card
carrying one that opens nothing. GCR's card shadow is two blurred layers, so it
was taken as it is.

**WHERE INTER CANNOT LOAD, A FIGURE FALLS BACK TO A MONOSPACE — and that was
measured, not chosen.** The page check cannot fetch a web font, so it renders
every page in the machine's fallback faces. With `.mono` falling back to a
proportional face, the company page's position table ran 16px past its card
(DejaVu Sans digits are 0.64em against the monospace's 0.60em) and the check
failed. With Inter loaded — every real reader — no table got wider. Measured
with the real fonts from a local copy, on main and on this branch, both merged
with #80 and #81: the company page's position table fits either way, Private
Market's master table has exactly 0px to spare either way, and the Portfolio
Monitor's — which has always scrolled inside its own card — is 2px NARROWER
(1,670px against 1,672px in a 1,440px card). So a figure's fallback is the
monospace these columns were fitted to, the check keeps measuring the wider of
the two, and a reader whose network blocks Google Fonts sees exactly the columns
they saw before.

**THE LOOK IS CHECKED ON EVERY ROUTE, BY COMPUTED STYLE.** Five claims, and not
one is in the page's words — a page renders the same text in any face and on any
colour. In the light theme, on every page the sweep walks: the body reads in
Inter; the title asks for Plus Jakarta Sans; a figure is Inter with tabular
digits; the nav and the top bar are white; and the nav entry you are on is gold.
The declared font stack is what is asserted, because the sweep cannot load the
fonts and the stack is what a regression would change.

**AND ONE TABLE HAD TO LEARN TO WRAP, BECAUSE A HEADING IS NOT A FIGURE.** The
headings are semibold now, and a figure's fallback does nothing for them: where
Inter cannot load, the reading face falls back to the machine's own sans, whose
semibold is a real Bold and runs wider. On the Buoyant company page — the one
whose Managed-by sub-line is longest — that put the position table 14px past its
card, and *the position table fits its card* failed on `stock-carried` alone,
while main passed it. With Inter loaded the table fits, and measured column by
column it is the SAME width with or without the fix. So the Managed-by cell may
wrap now (`whitespace-normal` on that one cell, the table staying `nowrap`
around it). An auto-width table narrows a wrappable column only when it would
not otherwise fit, so where it fits nothing moves, and where a wider face is
drawn the sub-line gives up the width rather than pushing Basis behind a
sideways scroll. All fifteen company-page routes sweep clean in both themes.

**`scripts/dev/look-bug.sh` reintroduces nine bugs one at a time**, after a
no-patch control came back clean on its ten route/theme combinations, and every
one fires its own check — the seventh only after the check it exists for was
fixed. The five routes are `cio`, `cio-allocation`, `monitor`, `holdings-book`
and `stock`; the ninth case sweeps `stock-carried`, the page it is about:

| Bug put back | Fires |
| --- | --- |
| the page title back in Inter | the title check, on the three routes whose title is `PageHeader`'s (a drill-down and a company page draw their own, also in the display face) |
| figures back in JetBrains Mono | the figure check, 5 of 5 |
| the nav ivory again | the white-chrome check, 5 of 5 |
| the top bar ivory again | the same check, 5 of 5 |
| the nav entry you are on not gold | the gold check, on every route that IS a nav entry (3 of 5) |
| white type on an active gold toggle | the light-theme contrast probe, on the Monitor |
| every card given a hard offset | **nothing, at first — see below**; the raised-card check on 5 of 5 after |
| the same, in the dark theme only | the raised-card check, 5 of 5 |
| the Managed-by cell no longer wraps | the position-table check, on `stock-carried` |

**THE SEVENTH CAME BACK CLEAN, AND THAT IS THE FINDING.** *A raised card must
be a button* was measured on every route and ASSERTED on one, `/holdings` —
whose four summary tiles, the only cards that ever opened nothing, went at
Stage 10bd. Every card left there contains a link, so a stylesheet raising
every card in the app swept clean, and it had been unable to fail since. Two
fixes. The claim is asserted on EVERY route, in both themes, beside the look
checks. And a link must COVER the card to count: a table card whose rows link
to company pages is not a button, and under the old rule — any `a[href]` inside
— it could never fail at all, which on the Portfolio Monitor and on `/holdings`
is every card on the page. The eighth case is the dark-theme half of the same
claim: each theme has its own raised rule, and a restyle of one does not touch
the other.

**MERGED WITH MAIN FOUR TIMES, AND THE LETTER MOVED SIX TIMES BEFORE IT WAS
WRITTEN DOWN.** This was drafted as `10ca`. #80 (FIFO returns) took that and
#81 (four text blocks, seven NAV benchmarks) took `10by` in the same hour; #82
(the KPI tiles) took `10cb` while this branch's first full sweep ran; and while
the second one ran, #76 (one company, one key), #77 (purchase, redemption and
appreciation) and #74 (arbitrage is cash) took `10cc`, `10cd` and `10ce`; and
#78 (XIRR on a row that is whole accounts) took `10cf` in the hour this PR sat
waiting for its CI — so this section is **`10cg`**, and the code comments that
name the stage moved with it. The first two merges each brought one conflict, resolved by keeping
main's structure and giving it the new look: #81 put a percentage beside the
published-NAV movers' figure, and #82 gave a KPI tile a second line and a name
for its link. The figure takes the display face, and the link takes the 16px
corner the cards now have. The third merge — five commits, 85 files — brought
none, which is when this file says to check by hand: the `ctx` literal came
through as main's own 92 keys, each declared once, because this change adds
none (its checks read their own probe); and `build-book` regenerated the book
byte-identically. The fourth — #78 alone — brought one conflict, here: both
stages had been inserted above Stage 10k, and main's 10cf now comes first. It
also changed the Buoyant company page this change had just fixed, so that
table was measured again rather than assumed: it fits in both faces, its Return
column two pixels wider with Inter than before.

**FIVE CHECKS ON THREE ROUTES FAIL ON THIS TREE AND ON MAIN, IDENTICALLY, AND
THEY ARE NOT THIS CHANGE'S.** Built and swept side by side against main's
`c1bfddd`, and again at `3a5b4d1` once #78 landed, neither of which carries
anything of this branch. All five are Private Market's
fund returns: `private-market` and `private-market-tiles` each fail *the
methodology picks the measure each fund's own dated record supports* and *each
XIRR is the money-weighted rate … each HPR is value against cost*;
`private-market-returns` fails the second of those and *the XIRR column shows a
rate exactly where the dated record is complete*, *the XIRR footer pools exactly
the funds with a complete record* and *the HPR footer is the whole private
book's value against its cost*. All of them compare the fund table's returns
with the sweep's own re-derivation, and #80 moved fund returns onto a FIFO
basis; #82's own commit message records the first two. (A subset run of
`monitor-txn-drill` also fails four checks, on both trees alike; in the full
sweep it passes. A subset is not the whole walk.)

And `check:family` fails two on both trees, 84 passed against 2, at both of
main's commits: Extras holds
exactly the four pages the family named, and clicking it reveals all four —
#84 added a fifth, Corporate Actions, and the check still names four. Whether
that page belongs in Extras is #84's question rather than a look's.

A typeface and a colour move no figure and no row. They are named here rather
than fixed, because the fixes belong to the changes that own returns and the
Extras menu; queuing them as a separate task timed out three times. *(Both were
fixed at Stage 10cj, and Corporate Actions stays in Extras at the family's word.)*

`build` · `tsc` · `test:ingest` (golden 140, 2 not checked) · `test:family` (46
suites, 2,466 checks, 0 failed) · `check:family` **84 passed, 2 failed — the
same two as main** · `check:pages` **246 combinations, 3 with a finding — the
three Private Market routes above, and none of this change's own**, with ten
evidenced abstentions across four claims, none of them this change's (every KPI
tile on this book carries a figure, on the six Morning CIO routes; every private
holding reports a cost; nothing on Morning CIO points at an undefined drill-down;
no private account is redeemed to nil) · `npm run build-book` regenerates the
book byte-identically: a colour and a typeface are not part of the book.

### Stage 10ch — THE PORTFOLIO MONITOR'S MASTER TABLE, ON THE SAME STANDARD

*"i hope the ui design upgrades you are doing and making it much amazing you
also do to the portfolio monitor master table"*

Three things opened under a row of the Monitor's holdings table, and every one
was a TABLE DRAWN INSIDE THE ROW'S CELL with columns of its own: a mandate's
shares, the accounts a name is held through, and — behind a SECOND chevron on
the Invested cell — the dated contributions that bought it. None of those
columns lined up with the table they sat in; a share's Market value sat at one x
in the mandate panel and at another in the row it opened from. That is exactly
the defect the family named on the Private Market page, and Stage 10bx's
standard answers it here too: every one of them is a ROW OF THIS TABLE, in
THESE columns, under a tree guide drawn in the first cell and nowhere else.

| A row | opens into |
| --- | --- |
| a mandate | the shares its manager chose (depth 1), each with its share of the mandate under its name |
| a holding | one line per statement that reports it (depth 1) → the dated contributions behind that line (depth 2) |
| by entity | the dated contributions behind the holding (depth 1) |

So a column a reader drags moves the row, its lines and their contributions
together, because every one of them is `<Tr view={holdView}>`.

- **THE SECOND CHEVRON IS GONE.** A contribution hangs from the STATEMENT LINE
  that bought its units, and that line is what it adds up to: the book publishes
  a breakdown only where the allotted units account for every unit held
  (`trancheTable`'s gate), so the line above is a STRONGER claim than the old
  panel's footer — it is not computed from the rows under it at all. One control
  per row, one place per figure.
- **A CHILD FILLS A COLUMN ONLY WITH ITS OWN FIGURE.** Where the figure belongs
  to the parent — the security's sector, a realised gain no statement splits by
  account — the child's cell is BLANK, meaning "see the row above", never zero
  and never "nobody measured it". Where the child's OWN figure is missing for a
  reason of its own, it says so through `AbsentCell`, exactly as a row does.
- **THE LEAD, THE ADJUST ROW AND THE LOOK-THROUGH.** A sentence leads the lines
  where it says something they do not (a split across routes, or an overlap);
  an amber, italic **Counted once** row takes a holding two accounts both report
  back out of the lines' quantity, cost, value, weight and P&L, so the lines add
  to the row; and the family's share of what their funds disclose stays the
  fenced card it has always been — DERIVED, so never a row under Market value
  beside measured lines — drawn as a full-width line of the tree.
- **A SECTION FOLDS ON ITS BAND, AND KEEPS ITS BAND AND ITS TOTALS.** The totals
  row moved to the top of its section, under the band, which is where the
  Private Market standard puts a section's totals: a reader sees what a category
  adds up to before its rows, and a folded category is never a lost one.
  Stage 10bs's section TABS (#71) choose which sections are drawn; a band folds
  one of them.
- **EXPAND ALL, ON THE THREE ALLOCATION AXES.** Not on Security, where nearly
  every row opens onto a derived look-through card: 565 of them at once is a page
  nobody reads, and that axis is used by typing one name and opening it.
- **THE DENSE RHYTHM IS THE STANDARD'S, AT ANOTHER SIZE.** `TreeTable.tsx` gains
  `density="dense"` (`TREE_ROW_DENSE`, `TREE_CELL_DENSE`) and a depth-2 row,
  whose cell carries its own guide and its parent's continuing past it to the
  parent's next sibling — ending where that parent was the last, like a └. This
  table keeps its tighter type because it is read top to bottom for value; what
  it takes from the standard is everything that is not a size.
- **A SIXTEEN-DIGIT ACCOUNT NUMBER WRAPPED EVERY LINE IT SAT ON INTO FOUR.** A
  line shows `a/c …` and the last six digits, which is what a reader matches a
  statement by; the whole number is the hover.

**AND A GLITCH ONLY THE NEW STRUCTURE COULD PRODUCE, AND ONLY A NEW CHECK COULD
SEE.** On the three allocation axes `useStockExposure` is disabled — those axes
must not pay for 21 fetches — so its state stays `loading`, and the fund
look-through card renders nothing while loading. `main` renders that card inside
a panel's cell, where nothing adds nothing; drawn as a ROW of the tree it became
an empty line under every company a reader opened, a gap that reads as a figure
that failed to arrive. The line is drawn only once the store has something to
say, and **"no line in the opened tree is blank" was watched FAILING on the build
before the fix** and passing after it.

#### #75's Buoyant marks, carried onto the rows

#75 (Stage 10bv) landed while this was being built, and it changed the very
things this stage replaced: Buoyant's Invested cell names the statement's
restated cost in its hover, and each contribution the fund moved from Class A1
into A4 is marked, with the NAV it was bought at. All of it had been written
for the old panel. None of it was dropped:

- **The Invested cell keeps `data-cost-carried` / `data-cost-printed` and the
  hover** (`carriedCostOf` / `carriedCostNote`, the one place the words live) —
  on the plain figure now, since the cell no longer carries a chevron.
- **Each switched contribution says so on its second line** — `switched A1 → A4,
  1 Jun 2026`, with `switchedRowNote` as its hover — and keeps
  `data-tranche-switched`, `data-tranche-bought-nav` and `data-tranche-hpr`. The
  mark sat beside the label first and squeezed "Cash Deposits" onto two lines in
  the narrow name column; found by looking at the screen, not by a check.
- **The old panel's lead sentence is a line of the tree** (`data-tree-child=
  "note"`), above the first statement line whose contributions carry the mark,
  wrapped to a readable width. The tree's full-width kinds in the sweep gained
  `note`, so "no line is blank" and "every child has the table's columns" still
  bind.
- **#75's checks read the rows.** The walk opens the row the BOOK names for
  each route (by `data-security-key`, through a clubbed fund's keys), the switch
  and shared-NAV routes read the tree's contributions, and "the combined
  Invested is what was paid, not the restated cost" is struck on the row's own
  Invested AND on its contributions summed off their handles. #75's bug harness
  (`carried-cost-bug.sh`) had four patches anchored on the old panel; they are
  re-anchored on the tree, and it is re-run below.

#### The checks moved onto the rows

- **`monitor-tranche`** reads the contributions as rows: each sits under its own
  statement line, the line's units are what its contributions add to, the entry
  NAV is printed in Avg cost (it is exactly what that column means: what one
  unit cost), cheaper entry always shows the higher HOLDING-PERIOD return within
  one class (#75's correction — a CAGR shrinks with the years held), and every
  line the book says carries a history is drawn. The count is now every
  statement's own, ONCE EACH — `TRANCHE_ROWS_PRINTED`, never deduped: the old
  deduped count existed because one panel under a deduped row could union both
  trusts' Transition Venture histories and still reconcile with itself, and
  there is no such panel now.
- **THE SAME-NAV PAIR WAS GROUPED ON AN EXACT FLOAT AND FOUND NOTHING.** Two
  members allotted at one printed NAV (109.4462) differ in the last bits of
  invested ÷ units, so an exact key saw no pair and the check failed a correct
  page. It groups at the four decimals the statement prints, within one class —
  on `monitor-tranche-shared`, where #75 moved the claim to the history the book
  says carries such a pair.
- **`monitor-category-drill` and `monitor-fund-drill`** read the rows a holding
  opened into rather than a panel's headings — one line per (security, account),
  named for whose it is, each in exactly the table's columns; the lines less the
  Counted once row are the row's market value, struck on the rendered cells AND
  on the rows' own handles; the shares printed under each line add to 100; a
  clubbed fund's lines are its classes, each linking to its own page.
- **`monitor-open-all`** presses Expand all and asserts, with everything open:
  every row and section is open; no table sits inside a row but the derived
  look-through card; every row a row opened into has exactly the table's own
  columns; **every non-mandate statement behind every row is drawn as exactly
  one line — an identity against the book, not a tolerance**; every mandate opens
  onto exactly the shares its own row counts; no line is blank.
- **`monitor-section-closed`** folds the first section: its rows go, its band
  and its totals stay, and every other section is untouched.

**`scripts/dev/monitor-tree-bug.sh` reintroduces fourteen bugs one at a time** —
after a no-patch control came back clean on its 16 route/theme combinations — and
every one fires its own check. It was run on the tree #79 merged (`ecccb7b`,
content-identical to main's `20a3f15`):

| Bug put back | Fires |
| --- | --- |
| a statement line opens into a table inside a cell again | no table sits inside a row · every opened row has exactly the table's columns |
| Expand all opens nothing | 4 — Expand all opens every row and section · the opened rows' columns · every statement drawn as one line · every mandate opens onto its shares |
| a statement line drops a column | 9, on 4 routes — every claim that a line or a contribution is a row of the table itself, in its columns |
| the Counted once row is dropped | the lines less the Counted once row are the row's value · an overlap is named in the lead |
| a holding's lines are the deduped set, not every statement | 6, on 4 routes — the venue counts, the histories offered, the lines the row advertised, the overlap, the shares adding to 100, every statement as one line |
| every line's contributions hang from the first line | 3 — each contribution sits under its own line · each line's contributions add to its units · every folio with a history is its own line |
| a section band stops folding | the section-fold check |
| a folded section hides its totals too | the same check, by its "keeps the band and its totals" half |
| the look-through line is drawn empty | no line in the opened tree is blank |
| a mandate opens onto three of its shares | every mandate opens onto exactly the shares its own row counts |
| a line's share divided by the largest line, not the lines' sum | the shares add to 100 |
| a clubbed fund's lines not named for their class | each class line links to its own holding page · and is named for its class |
| a contribution prints no entry NAV | each contribution prints its entry NAV as its cost per unit |
| a line's return is untagged | 3 — every row tagged HPR prints that return · every tranche's return is tagged · this book's tranches are not all annualised |

**AND STAGE 10bv's OWN HARNESS WAS RE-RUN ON THE SAME TREE**, because the
contribution histories it guards moved out of a panel and into the tree:
`scripts/dev/carried-cost-bug.sh`, after a no-patch control came back clean on
its 14 route/theme combinations. All sixteen of its cases still fire, each by
its own check:

| Bug put back | Fires |
| --- | --- |
| the Invested cell stops saying its cost was carried | the carried-cost cell check, on `monitor` |
| the row shows the statement's restated cost again | that check, and *the combined Invested is what was paid* on `monitor-tranche-switch` |
| a switched contribution loses its mark | 4 on `monitor-tranche-switch` — the mark, nothing else marked, the NAV it was bought at, its hover |
| the NAV a switched row was bought at becomes the restated one | *…each names the NAV it was bought at* |
| the tree stops saying what a switched row is | *the tree says what a switched row is* |
| a tranche's HPR attribute carries the printed, maybe annualised, figure | *a cheaper entry NAV always shows the higher return*, on `monitor-tranche` |
| the company page's Avg cost tile forgets its basis | the tile check, on `stock-carried` |
| the company page's per-account cell forgets its hover | the account-row check, on `stock-carried` |
| an empty cash sleeve makes a funded account mixed again | *every section is one the shared filter offers*, on `monitor-txn-basket` |
| the cost is never carried (book) | `carriedCost` ×3 and `tranches` ×2 |
| the lots carried unit for unit, ignoring the ratio (book) | `carriedCost` ×3 |
| a carried lot takes the switch-day value as its cost (book) | `carriedCost` ×3 |
| gate A removed | `classSwitch` ×2 |
| gate B removed | `classSwitch` ×2 |
| the deposits not held to `Capital Invested` | `buoyant` ×2 |
| a class switch published as money in and out | `buoyant` ×10 |

#### Built before five merges, and ported onto them — three measured, two resolved by intent

This work was written on `6edbf2b`, before #71's section tabs, #70, #73 and #75
landed, and moved onto each merged tree file by file with a three-way merge. For
the first three, what makes the port trustworthy is a MEASUREMENT rather than a
clean merge: the lines it adds and removes on the merged base are exactly the
lines the work adds and removes on its own base — **+837 / −848** in
`PortfolioMonitor.tsx`, **+86 / −20** in `TreeTable.tsx`, **+627 / −381** in
`check-pages.mjs`, with zero lines differing either way. So those ports carry
this change and nothing else, and drop nothing of main's. #73 touched this page
in one place — the pick-list's `emptyNote`, which says why a search that finds
nothing found nothing — in the filter row, where the table does not reach, and
it is kept. #70 did not touch this page.

**#75 COULD NOT BE A CLEAN PORT, AND THAT IS NOT A FAILURE OF THE MERGE.** It
rewrote the panel this stage removes, so five hunks of the page and six of the
sweep conflicted, and each was resolved BY INTENT — the tree's structure, #75's
facts — as the section above sets out. A line count cannot vouch for that, so
the evidence is the sweep and BOTH harnesses re-run on the final tree. The
sweep's `ctx` literal gains `treeState` beside #75's `costCarried`: **84 keys,
none duplicated, every one resolving to a declaration in the merged file.**

**#72 (Stage 10bw) MOVED THIS PAGE'S RETURN PICKER INTO SHARED MODULES, AND
TOUCHED NOTHING THE TREE DRAWS.** It lifted the picker (`ReturnMeasureSelect`,
`useReturnMeasures`) and the one-column-per-measure helpers (`withReturnCols`,
`returnAccessorsFor`, `AGG_NO_MEASURE`, `returnColumnMeta`) out of this page
verbatim, so the Private Market table could share them, and added
`?show=transactions`. The two conflicted hunks were the import lines, resolved as
a union — the tree's `Fragment` and `type ReactNode` beside #72's narrowed
analytics imports — and every return cell on a tree row still resolves through
`measuredReturn`, exactly as a top-level row does. The `ctx` literal gains #72's
`pmReturn`: **85 keys, none duplicated, every one resolving to a declaration.**
The harness below was re-run on the tree merged with #72, and its fourteen
anchors were checked against it first — all fourteen match.

**THIS RECORD WAS RESERVED AS `10by`, AND #81 TOOK THE LETTER.** Main's own
Stage 10bx text has named the Portfolio Monitor's stage `10by` since #79 merged,
and #80 stepped over that letter for exactly that reason: a letter main refers to
is claimed whether or not a heading carries it. #81 took it anyway, for its four
text blocks and seven NAV benchmarks, so a reader following that sentence landed
in a section about something else. This record takes the next free letter,
**`10ch`** — main had taken every one from `10bz` to `10cg` by the time it
landed — and the sentence in Stage 10bx now names it and says why.

`build` · `tsc` · `test:ingest` · `test:family` · `check:family` · `check:pages`
**216 combinations clean** on the tree #79 merged, with nine evidenced abstentions across five claims, none of them this stage's own · `npm run build-book` byte-identical — a table's layout is not
part of the book.

### Stage 10ci — THE NOTES AROUND EVERY TABLE: ONE SHORT LINE, AND THE REST IN A HOVER

*"no one is reading these kind of A cliff of notes that you have put in across
tables. When an entity is dropped down, they're literally seeing what is the
entity and which accounts are held in. So the dropdown is good."* · *"It's just
that I have issues with the extreme verbatim and verbose footnotes that you have
put, which make the whole table ugly."*

The family said what to keep and what to remove. The rows a table opens into
stay. The sentences around them go. This is the same audit this file has run
seven times (Stages 10aa, 10ai, 10ap, 10bd, 10be, 10bl, 10by). Every claim was
checked for a second home first. Claims with no other home moved onto the
figure they describe. The rest were deleted, and each move is asserted where
the claim now lives.

#### 1. The Portfolio Monitor: the opened row keeps its lines and loses its sentences

- **The lead sentence is gone.** It spelled out the route split, e.g. "held ₹X
  through direct equity and ₹Y through five funds". Each line's second line
  already names its route and its share of the holding. The **Counted once** row
  names and subtracts a holding two accounts both report. The per-route
  subtotals the sentence added up are the hover on the row's chevron (§3).
- **The note explaining "switched" is gone.** The same words are the hover on
  the row's own `switched A1 → A4` label and on its entry NAV
  (`switchedRowNote`).
- **The "Held inside your funds" box is rows now.** It was two paragraphs and a
  table drawn inside a cell. That is the shape Stage 10bx's standard forbids,
  because a table inside a cell sizes its own columns and nothing lines up.
  - Each fund that holds the issuer is a line of the same table. Its derived
    share sits under **Via funds** and nowhere else.
  - A fund that filed several instruments of the issuer opens into them.
    `TreeNameCell` gained a chevron on a CHILD row for this.
  - Each line's arithmetic is its own value's hover: your holding of the fund ×
    the share its filing puts in this issuer.
  - `FundExposure.tsx` is deleted, not left uncalled.
  - While the disclosures load, the row draws no fund lines, and its Via funds
    cell names the fetch rather than saying anything about the holding. That is
    Stage 10an's rule, kept by the rows.
- **Under the table, three paragraphs are gone:**
  - the security axis's coverage fold (the five-bucket partition, the AIF block
    and the split-name warning);
  - the by-entity overlap paragraph;
  - the transactions footnote.

  Each figure they carried is in the hover of the footer cell or column header
  it describes.

**A HOVER IS WEAKER THAN A CAPTION**, and that trade is recorded rather than
glossed. A reader scanning does not hover. What makes the trade affordable
differs by claim, and is stated per claim:

- **The DERIVED fence stays visible.** It is the word `derived` under both
  derived column headers (Stage 10aq).
- **A measured value's absence stays visible.** It is an `AbsentCell` with its
  reason, in its column.
- **Only the explanation moved into a hover.**

**AND ONE FLOAT-DUST LINE WAS FIXED ALONG THE WAY.** A section heading read
"₹0 reported twice, counted once" over Mutual Fund, a section with no duplicate.
The rows and the subtotal are summed along two paths, and published NAVs carry
four decimals, so the two differed by a few paise. The heading now prints the
overlap only at a rupee or more. Main found and fixed the same defect
independently (`NO_PHANTOM_DUPLICATE`), and both are kept.

#### 2. Every other table: one short line on screen

| Page | What stays on screen | What moved |
| --- | --- | --- |
| Private Market | the Counted once rows (`one holding on N statements`); the unvalued band's "paid in is in no value total"; the total row's account count | the sides line and the public-market clause went inside the one collapsed **How the totals are worked out** line, on every tab; the long sentences went to hovers |
| `/holdings` | the headline figure, its counts and its dedupe basis; one line saying how many holdings are valued from depository units at AMFI's NAV | the two paragraphs went into the headline figure's hover: the blend of report dates, and the statement-basis total. Why those depository units carry no statement mark is that line's hover |
| Company page | the quantity identity as one line; the fund notice as two short lines; the look-through fence; the duplicate note; the research pointer as one line | the pledge exclusion, "no price, amount or gain", the Category II/III reasoning and the research pointer's market-cap sentence, each in its line's hover |
| Mandate page | its statement total and "every ₹0 above is measured" | the tie-out reasoning; a derived-total mismatch still prints in amber |
| Family & Entities | the unvalued card's subtitle, and each account's line, including "partly valued — only its cash-equivalent funds" | each account's reason is its name's hover (`data-unvalued-reason`); the footnote went |
| Capital Gains | "Tax figures are illustrative · statement basis · not tax advice" | an **815-character** paragraph that sat inside one table cell is that cell's hover |
| Performance, Returns, History, Upload | one short line each | the reasoning, in hovers |

**"Illustrative" and "not tax advice" stay on screen**, because a tax figure read
without them is read as advice. That is the one place this change kept a caveat
visible for the harm its absence could do rather than for its figure.

#### 3. The guard, which is what keeps this from creeping back

`check:pages` gained a `tableNotes` probe and a global check on every route
(first theme and width). The check covers every card that holds a table:

- its subtitle is at most **120** characters;
- the text under its tables is at most **two lines of 150**;
- no single cell holds more than **180** characters.

A table that declares `data-table-static` is exempt from the cell bound, since
its cells are an upstream document's own. A cell holding a form or a table of
its own is a panel rather than a note, and is not measured. The capital-call
editor is one.

- **"UNDER THE TABLE" IS STRUCK ON GEOMETRY, NOT ON DOM ORDER.** A line counts
  only if it sits below every table in the card, each table's bottom clipped by
  any scroll box it sits in. The first draft used DOM order, and it read
  Today's movers wrong. That card puts gainers and losers side by side, so on a
  day when nothing fell, the losers list's own heading and empty state came
  after the gainers table in the DOM and were counted as notes under it.
- **The two folds this change relies on must be closed on arrival.** They are
  Private Market's "How the totals are worked out" and the AIF drill-down's
  valued-by-no-statement dropdown. A fold that opens itself is the paragraph
  back with a chevron on it. `foldsOnArrival` reads both before the walk
  touches either.

**ON ITS FIRST FULL RUN THE GUARD FIRED ON CARDS THIS CHANGE HAD NOT
TOUCHED**, ten findings across the routes. Each cause was fixed rather than
exempted:

- **The NAV movers card had a 206-character line.** It now reads
  `Every scheme is listed · a move of 2% or more in one published day is
  chipped drastic`. How the list is ranked is the hover.
- **The allocation card's family axes had one paragraph of 385 characters.**
  It is now two lines:
  - whose taxonomy it is, plus the value their direct-stock rule placed;
  - the value their cash instruction placed.

  The second line keeps `data-cash-rule-mv`, which its check reads to the
  rupee.
- **The fund card on a holding's page had a 168-character subtitle.** It now
  reads `<scheme> — not a statement issued to this family`, and where the
  figures come from is the hover. A scheme that discloses no portfolio (the
  metal ETFs) no longer draws the holdings' date pills or the look-through
  fence over an absence. The absence box now says so in one sentence.

The same run found one collision between two checks:

- **Private Market's Transactions tab failed its own removal check.** The
  moved fold said "the floor of what can still be called", which matched the
  heading of the removed calls card. The sentence reads "the floor of what the
  funds can still call" now. **Two checks were pulling on one phrase**, and
  the one that holds the fold's claim moved with it.

**AND EVERY REMOVED SENTENCE WAS AUDITED ONCE MORE, BY A SECOND READER.** A
separate read of the whole diff split each removed block into its claims and
looked for each claim in the new files. Most survived in a hover, a fold or a
shorter line, or were already stated elsewhere on the page. It found one line
that had become FALSE and three facts with no second home, and all four are
fixed:

- **The company page's fund notice** read "What the scheme holds is shown
  above" on every fund. That is false on Liquid BeES (no scheme resolves) and
  on the DSP gold and silver ETFs (no portfolio disclosed), where the card above
  says the opposite. Main's longer wording carried a condition, *"where that
  disclosure resolves"*, and the one-liner had dropped it. It carries it again.
  `check:pages` asserts the unconditional form never renders on a company page.
- **The route subtotals.** The opened row's lead sentence read *"₹X through
  direct equity and ₹Y through 2 PMS mandates"*, which was the family's own
  Stage 10ah ask. Each line names its own route, but a SUBTOTAL per route was
  on screen nowhere else.
  - It is now the hover on the row's chevron, open or shut.
  - It is summed over the statements as printed, and names the overlap where
    two accounts report one holding.
  - `monitor-category-drill` holds it to the lines it sums, within their
    printed precision, and to naming the overlap exactly where the row has one.
- **Three absences on the fund lines** rendered nothing where the old box said
  why: a disclosure with no date, a line no filing classed, and an instrument
  with no ISIN. Each names its cause in the line's own hover.
- **One sentence of the Capital Gains cell note** had been lost in the move to
  its hover. It is back.

**IT ALSO FOUND A PARAGRAPH THE GUARD CANNOT SEE.** The guard measures inside a
card, and the company page's research pointer sits OUTSIDE one, directly under
the insider-trades table: 511 characters. It is one line now, with its
market-cap sentence in the hover, and `stock` asserts both by name. A probe of
every page for prose outside a card found no other: the remaining long lines
are a row of entity buttons, the audit page's document chips, and two captions
in the company page's header.

#### 4. Merged with main three times, and the first merge brought two features this change had removed the place for

Nine commits landed on main while this branch was open: #74, #76, #77, #80,
#81, #82, #83, #84 and a Polycab refresh. Eight files conflicted. The rule for
each was the same: **main's features are kept, and this branch's removals are
kept on top of them.**

- **#76 NAMED THE AIFs INSIDE THE BOX THIS BRANCH TURNED INTO ROWS.** The
  client asked: *"Kaynes Technologies Limited is also a holding in Vikas
  Khemani Fund"*. That fund is Carnelian Bharat Amritkaal, an AIF, and an AIF
  reports units and a NAV and never what it owns.
  - Main's answer was to list every AIF fund in a paragraph inside every opened
    company. The list is 474 characters over ten funds.
  - Here it is one row of the table, **"Inside your N AIF funds · not
    visible"**. Its Via funds cell is an absence with its reason.
  - That row opens into one row per fund, each linking to the fund's own page,
    so the answer to *"is my Carnelian fund in this?"* is one click away. The
    derived column's header hover names the funds too.
  - `aifOpaque` clubs the funds by `splitFundClass`, as #76 did.
  - `check:pages` opens the row on `monitor-sold-elsewhere`. It asserts the
    count and the names as a SET of keys, so a list that drops the client's
    fund fails by name.
- **#76 ALSO ADDED A FULL-WIDTH LINE FOR THE ACCOUNT THAT SOLD A NAME OUT.**
  That line was Ajay's demat and its 16,300 Kaynes shares.
  - Here it is a row in the table's own columns. Its Qty is the nil the
    statement printed at the close, and its second line says **sold out in this
    window**, linked to the company page.
  - `DematElsewhere` is deleted and `notHeldNote` is kept.
  - Main's two checks read the same handles (`data-demat-elsewhere-row`,
    `data-closing`) and pass unchanged.
  - A full-width box inside an opened row is exactly what this branch's own
    check forbids (`fullWidth === 0`), so the resolution could not keep it.
- **#74's new notes are each kept as one short line**, with the sentence in a
  hover:
  - the partly valued demat on Family & Entities;
  - the holdings valued from depository units on `/holdings`;
  - the cash-fund wording on the company page.

  Each check that read the sentence as page text now reads the visible line and
  its hover together, and requires both halves: what the line says on screen,
  and what the sentence in its hover says. A line that dropped either fails.
- **#84's corporate-action returns card arrived with a 268-character formula
  under its table**, and the guard caught it on the merged tree. It now reads
  `Total return adds the dividends declared in the window · no portfolio total,
  as accounts open on different dates`, with the formula in its hover. Why
  there is no total stays on screen: an absent total a reader is not told about
  reads as one that was forgotten. **Its evidence cell was the second finding**:
  a row's open questions were joined into one sentence, and three of them came
  to 232 characters in one cell. The cell shows the first question and how many
  more there are, and all of them are its hover.
- **#77 rewrote the mandate page's capital summary and the Transactions
  columns.** Both are taken whole, and the branch's shortening of the old "Net
  invested" line had no subject left. **Main's own summary line was then the
  guard's last finding**, on `mandate-funded` and `mandate-fund`: one run-on
  line of purchase, redemption, worth, appreciation and both returns, up to 206
  characters, with every reason spelt out in it. It is two lines now, the money
  and then the returns. A reason keeps its first clause on screen (an absent
  figure names its cause) and the whole sentence is that clause's hover.
- **#77 asked for the unvalued AIF folios as a dropdown.** Main's `<details>`
  is kept, with the paragraph inside it moved to the summary's hover. The walk
  no longer opens that fold, because main's check asserts it is shut on arrival
  and its summary already carries the count, the categories and the drawn
  total. The check now also requires that, wherever the summary mentions
  drawn money, it says that money is in no total.

**THE `ctx` LITERAL CONFLICTED AND WAS RESOLVED AS A UNION, EXCEPT FOR ONE KEY
DROPPED DELIBERATELY.** `fundExposure` read the box this branch deleted, and
its probe is gone. `fundLines` carries its two fields (`aifs`, `aifNames`),
struck on the new rows. Every key was then confirmed to name a declaration.
`scripts/dev/names-bug.sh` (#76's harness) snapshotted the deleted
`FundExposure.tsx`, which would have failed the harness before its first case.
Its AIF case now truncates the new rows instead.

**THEN #78 LANDED WHILE THIS WAS BEING VERIFIED, AND MERGED CLEAN.** That is the
case this file warns is the dangerous one, so it was checked by hand:

- **What it adds draws no note.** It is Stage 10cf's money-weighted return where
  a row is whole accounts. On the Monitor that is data on each return cell; on a
  company page it is an XIRR line under the return. There was nothing for this
  change to shorten.
- **The `ctx` literal came through as a union.** 94 keys, none duplicated, every
  one naming a declaration. The one key main has and this branch lacks is
  `fundExposure`, dropped on purpose above.
- **No check reads the deleted box**, and `build-book` regenerates
  `glowData.ts` byte-identically.
- **It took this section's letter.** See below.

**AND #87 AND #89 LANDED WHILE THIS WAS STILL BEING VERIFIED.**

- **#87 moves the app to Glow Central Research's fonts and colours.** Its only
  conflict with this branch was the `/holdings` headline figure: this branch had
  moved two sentences into that figure's hover, and #87 changed its font. Both
  are kept. Every heading and figure #87 restyled on the pages this branch also
  edits was checked by hand after the merge, and each carries #87's classes.
- **#89 is notes and one check label.** It records the Portfolio Monitor's
  master table from #79 as Stage 10ch, and repoints Stage 10bx's *"the Portfolio
  Monitor's stage is `10by`"* at it.
- **The `ctx` literal came through as a union again**: 94 keys, none
  duplicated, every one declared.

**THE LETTER, AND A CLAIM THAT CAME OUT.** This section was drafted as `10cf`,
the letter after main's newest (`10ce`). #78 merged under `10cf`, and #87 and
#89 took `10cg` and `10ch`, so this is `10ci`. The stage headings were compared
against main's tip before pushing, and differ from main's by `10ci` alone.

An earlier draft also called this "the Portfolio Monitor's stage" and edited
Stage 10bx's pointer to name it. #89 shows that the reservation was for #79's
master table, not for this change, so the claim and the edit both came out. A
pointer names the work it was written for; the next free letter does not
inherit it.

**AND ONE CHECKER BUG ON MAIN WAS MEASURED, NOT FIXED HERE.** Stage 10cf records
eight Private Market invariants failing on main's own build: #72's re-expression
of each fund's return still gates the dated calls against a cost basis that #80
made FIFO. This branch was walked against pristine main (`c1bfddd`) on
`private-market` and `private-market-returns`, and the same invariants fail
there. Stages 10ce and 10cf each recorded it and left it, and so does this one:
the fix is to the checker, and it belongs in its own change. *(It had one: Stage
10cj, with the Extras count beside it.)*

#### Verification

Every result below is from the tree that ships: this branch merged with #87
and #89 (main `4148c1a`).

- `tsc` · `build` · `build-book` regenerates `glowData.ts` and
  `docs/BOOK-REPORT.md` byte-identically.
- `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund 35, buoyant 42,
  classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22, neoFlows 8, golden
  140; 2 not checked, 0 blocked) · `test:family` (0 failed).
- `check:family` **85/2**. The two failures are main's own Extras-menu count,
  which Stage 10cf records: #84 added a fifth page and the check still counts
  four.
- `check:pages` **246 combinations, 3 with a finding, and the new guard passes
  on every route.** The three are the Private Market routes, and their 8 failing
  checks fail the same way on main: the fund-return check Stage 10cf records.
  The 10 checks marked not checked are main's too, each with nothing to check on
  this book: 6 KPI-tile lines across the Morning CIO routes, 2 Private Market
  cost lines, 1 redeemed private account, and the not-found drill-down's crumb.
  246 is main's own count, because this change adds no route and removes none.

**EVERY DEFECT THIS CHANGE GUARDS AGAINST WAS PUT BACK, ONE AT A TIME.** Each ran
in a scratch worktree with its own server, and the files were restored from git
and checked clean before the next case. A no-patch control ran first. Each
defect fired its own check:

| Defect put back | Fires |
| --- | --- |
| a 239-character paragraph under the Tax-loss harvesting table | the guard |
| a cell showing its 396-character reasoning on screen | the guard |
| Private Market's working fold open on arrival | 3: the guard, the fold check, the collapsed-line check |
| the AIF row naming one of its ten funds | the AIF-names check |
| `/holdings`' depository line without its hover | the depository check |
| a partly valued account without its note | the partly-valued check |
| the research pointer back to a paragraph | the research-pointer check |
| the research pointer without its hover | the research-pointer check |
| the route split dropped from the chevron | the route-subtotal check |
| route subtotals that do not add to the lines | the route-subtotal check |
| the overlap left out of the hover | the route-subtotal check |
| the fund notice unconditional again | the fund-notice check, on both fund routes |

The last batch's control found one more guard finding, on main's #84 card, and
that is fixed (§4). A full sweep on the tree merged with #78 found the other
three: #84's evidence cell and #77's capital summary on two routes. All three
are fixed (§4), and a targeted sweep of those routes is clean. Each was found by
the guard firing, which is the same demonstration as a defect put back.

### Stage 10cj — SEVEN CHECKS FAILED ON A CORRECT PAGE: FIFO RETURNS, AND THE FIFTH EXTRAS PAGE

*"yes please do whatever is needful , yes"* — the family's answer to two
questions: whether to fix the seven checks that had failed on `main` since #80
and #84, and whether Corporate actions & dividends stays in Extras.

#### Seven failures, two causes, and the page was right both times

Five `check:pages` invariants on the three Private Market routes — eight
failures in all, since two of the five failed on more than one route — and two
`check:family` rows had failed on every run since #80 and #84 landed. Six stage
records named them as `main`'s and left them — 10cc, 10cd, 10ce, 10cf, 10cg and
10ci — because each of those changes was about something else. **Measured on the page
and on the book before anything moved, the page was right every time:**

| | The page (FIFO) | The sweep's re-derivation, before |
| --- | ---: | ---: |
| Neo Infra — HPR | +13.8% | 14.23% |
| Neo Infra — XIRR | +16.7% | not shown: the sweep called the record a gap |
| Pooled XIRR | 3 of 4 funds, +21.1% | 2 of 4 |
| Whole private book — HPR | +22.8% | 23.15% |

**CAUSE ONE: A RULE EXPRESSED TWICE WAS MOVED ONCE.** Stage 10ca put every
return on FIFO — `(unrealised + realised) ÷ (cost of the units held + cost of the
units sold)` — and moved `fundReturns.ts` with it. `PM_RETURN_BOOK`, the sweep's
own re-derivation of the same methodology (Stage 10bw), was left on the rule
FIFO replaced, in two places:

- **HPR was value ÷ cost held.** That leaves out the units a fund has already
  redeemed. Neo Infra redeemed 14,162.8 units at their ₹14,16,280 cost, so FIFO
  gives 13.83% where value against the cost of what is left gives 14.23%.
- **A fund's dated calls were held to the cost of the units STILL held.** Neo's
  ₹5 Cr called is ₹4.86 Cr held plus ₹14.16 L redeemed, so the sweep marked its
  record a gap, expected no XIRR, and pooled two funds where the page pools three.
  That is the identical defect Stage 10ca found and fixed in `fundDatedRecords`,
  where it had turned Neo's +16.68% into a dash; the fix reached the page and
  not the page's second expression.

Both are now written out from each position's own `costBasis`, `realizedPnL` and
`costOfUnitsSold`, and never through `fifoTotals`, which is the code under test.

**CAUSE TWO: A LIST THE NAV OUTGREW.** #84 filed Corporate actions & dividends
under Extras, beside Return & Drawdown, and `check:family` went on expecting
exactly four pages there. The family have confirmed it stays. `EXTRAS_PAGES` is
now ONE list read by every Extras row, so the count cannot drift between them
again, and the page is opened by its own address like the other four.

**A CHECK THAT FAILS ON A CORRECT PAGE IS NOT HARMLESS.** Through the ten
changes that landed after #80 the full sweep read three routes with a finding,
and through the seven after #84 `check:family` read "2 failed" — on correct
trees. Each change had to prove, by building `main` beside itself, that the
failures were not its own. A standing red is read as noise, and the next real
failure would have been read the same way beside it.

#### One caption FIFO had made false

The Private Market table's whole-book HPR — and every band and member row, which
share the resolver — carried the hover *"Current value against the capital paid
in, not annualised. Cash the funds have paid back is not in it — XIRR counts
it."* Under FIFO the principal a fund returns by REDEEMING units is in the
figure: their cost in what was paid in, any gain on them in the gain. So the
sentence was false of Neo's ₹14.16 L on the one cell that sums the whole private
book, while the fund row above it (`fundMeasuredReturn`) already said the right
thing. `aggHprNote` gives a set the fund note's own rule: where a holding in it
has redeemed units, principal on them is in the figure and income, equalisation
and any payout that redeemed no units are not; where none has, cash paid back is
not in it. XIRR counts all of it either way.

#### The checks

- The two re-named invariants — *each HPR is FIFO over every rupee deployed*
  and *the HPR footer is FIFO over the whole private book* — strike the page on
  FIFO.
- **A NEW PROOF, BECAUSE A CHECK THAT CANNOT TELL THE TWO BASES APART COULD NOT
  CATCH A PAGE GOING BACK:** *a fund that redeemed units shows FIFO's return, not
  value against the cost of the units it still holds.* It first requires the two
  to differ by more than the printing precision on this book (Neo, 13.83% against
  14.23%), then the page to show the FIFO one; on a book where no fund has
  redeemed units it abstains with that evidence. The payouts check beside it has
  the same shape for the same reason.
- *The private book's HPR hover says it is FIFO, and what it counts of the cash
  paid back* — on all three Private Market routes, struck on the book's own
  redeemed units, so it asks for the principal clause only where there is
  principal to name. A figure that renders the same either way can only be told
  apart by the words beside it.

#### The bug-reintroduction pass

`scripts/dev/pm-fifo-bug.sh` puts each bug back on its own, rebuilds, runs the
suite it lives in and restores by copy on a trap — verified with `cmp` and
rebuilt on the way out. It ran twice, on this change's own tree and again on the
tree merged with #90, and a no-patch control ran first each time and was clean
on both suites (the three Private Market routes clean; `check:family` 88 passed,
then 89 once #90 added a row). Every case fires its own check, the same checks
on both trees:

| # | Bug put back | Fires |
| --- | --- | --- |
| 1 | a fund row's HPR back on value against the cost held | *each HPR is FIFO…* and the new proof, on `private-market-returns` |
| 2 | the page's own calls held to the cost still held — Neo Infra reads as a gap | *the methodology picks…* on `private-market` and `private-market-tiles`; the XIRR column, the payouts check and the pooled footer on `private-market-returns` — 3 of 3 routes |
| 3 | the whole-book HPR back on the cost held | *the HPR footer is FIFO…* |
| 4 | the hover back to *"cash the funds have paid back is not in it"* | the hover check, on all three routes |
| 5 | the hover names FIFO but never the principal on redeemed units | the hover check, on all three routes |
| 6 | Corporate actions & dividends filed outside Extras | 4 `check:family` rows — the five pages, the reveal, the by-address opening, and Allocation's own entries |
| 7 | Extras holds the five out of order | 2 rows — the order, and the reveal |
| 8 | **the original defect, in the checker** — its HPR back on the cost held, against the page as it is | *each HPR is FIFO…* and the new proof |

**CASE 1 FIRES ON ONE ROUTE OF THREE, AND THAT IS RIGHT.** On the two default
routes the methodology shows Neo Infra's XIRR, so a fund row's HPR is drawn only
where a reader ticks it. **Case 8 is what the new proof is for.** Put the
checker's own HPR back on the cost held and it can no longer tell the two bases
apart, so it could not catch cases 1 or 3 — and had the page drifted back with
it, every HPR check would have agreed with it. The proof fails instead, because
it asks first whether the two bases differ on this book at all.

#### What this does not claim

**The subset-only `monitor-txn-drill` failure Stage 10cg named did not
reproduce.** Run on its own, on both themes, on this tree, it is clean. That is
the shape Stage 10cc recorded for `monitor-txn-out` — a failure under load that a
lone run does not repeat — and it is named here rather than counted as fixed.

#### Merged with #90, which took `10ci`

#90 landed while this was being checked, and took `10ci`, so this is **`10cj`**.
Both had written a `### Stage 10ci` above Stage 10k, so git marked the conflict
— the safer of its two failure modes. Main's section keeps the letter and comes
first. Every `10ci` line was read before it moved: eleven were this change's
(six in this file, five code comments) and moved, and seven are #90's (five in
this file, two code comments) and stayed.

**#90 ALSO NAMED THESE FAILURES AND LEFT THEM**, the sixth record to do so, and
its paragraph now points here.

**THREE CODE FILES MERGED WITHOUT A MARKER, WHICH IS WHEN TO CHECK BY HAND.**
`check-pages.mjs`, `check-family-inputs.mjs` and `PrivateMarket.tsx` each differ
from main by exactly this change, and the sweep's `ctx` literal is main's, byte
for byte, because this change adds no probe. #90 changed 207 lines of
`PrivateMarket.tsx`, so an anchor of the harness could have moved; it was re-run
on the merged tree for that reason, and every case applied and fired.

Every result below is from the tree that ships — this change merged with #90
(main `1e0ab78`) — and each was run again there rather than carried across.
`build` · `tsc` · `test:ingest` (every suite passes; golden 140 passed, 2 not
checked, 0 blocked) · `test:family` (46 suites, 2,466 checks, 0 failed) ·
`check:family` **89 passed, 0 failed** — 85 and 2 on `main` · `check:pages`
**246 combinations clean** — 3 with a finding on `main` — with the same ten evidenced
abstentions across four claims that Stage 10cg records, none of them this
stage's: every KPI tile on this book carries a figure (six Morning CIO routes),
every private holding reports a cost, no private account is redeemed to nil, and
nothing on Morning CIO points at an undefined drill-down. The count does not
move because this change adds no route. `npm run build-book` regenerates the
book byte-identically: a checker and a hover are not part of the book.

### Stage 10ck — ONE COMPANY, EVERY WAY IT IS HELD: A TAB PER ROUTE, AND THE FUNDS AS LINE ITEMS

*"we need to show all in the table when i am in an entity as sub tabs"* · *"I
write type a stock I want to know how much I'm holding directly and how much I'm
going holding through managers."* · *"Which are the other managers owning it or
I am owning it through which other managers… why should it not show me as a
line item holding it through mutual fund here?"* — sent with a screenshot of
ICICI Bank's Position by account table: three statement rows, an average cost of
₹438.34, and nothing about the funds.

**THE TABLE ANSWERED "WHICH STATEMENTS REPORT THIS" AND THE FAMILY ASKED "HOW
DO I HOLD IT".** Three rows in the order the book happened to hold them, with no
word for the route each one is — and the one route a reader cannot work out for
themselves, the funds, not on the page at all. The Portfolio Monitor's stock
axis has carried that half since Stage 10aj (`companyExposure`); the company
page, which is where a reader lands after typing a name, never asked for it.

#### `src/lib/heldThrough.ts` — the rows by route, and the funds as lines

| | ICICI Bank, measured on this build | |
| --- | --- | ---: |
| **Direct** | Ankita's Motilal Oswal demat, 14,500 shares | ₹2 Cr |
| **PMS managers** | Goldstandard's Aristos mandate for Ajay and for Ankita, 5,000 + 2,000 | ₹1 Cr |
| **Mutual funds** | 14 lines — one per family member per fund — across 10 funds, **derived** | ₹2.77 Cr |
| **All** | the three as bands, and three footers kept apart | ₹5.77 Cr |

- **A STATEMENT ROW IS FILED BY ITS ACCOUNT'S ROUTE**, through `holdingRoute`
  and nothing else: an own account is Direct, a discretionary mandate is PMS
  managers, and anything else — an account run as a fund, an advisory or a
  distribution engagement, or one whose statement states no engagement — is
  **Other accounts**, a tab drawn only where the book has such a row. On this
  book it has none, measured: the 298 company-share rows are 263 in PMS
  mandates, 26 in the family's own demats and 9 at a broker. `heldRouteOf` is
  the one place the route becomes one of four.
- **A FUND LINE IS ONE FAMILY MEMBER'S HOLDING OF ONE FUND**, valued
  `familyValue(holding, pctAum)` — the same figure the Monitor's stock axis sums
  for that company, so the two screens cannot disagree. One line per member per
  fund rather than one per fund, because *"through which"* is asked by a member.
- **IT IS NEVER ADDED INTO THE BOOK'S OWN FIGURES.** The table carries three
  footers, the Stage 10aj construction one page over: the measured total (the
  statements), the derived total (the funds), and **Total exposure · incl.
  derived**, the only line that adds them and says so. A fund line fills none of
  the family's own columns — quantity, cost, P&L and return are `AbsentCell`,
  each naming why — and says **derived** in words on the row, never in a tooltip.
- **AND IT SAYS WHAT THE FUND HOLDS OF THE COMPANY** — `shares`, `debt` or
  `shares + debt`, read off each instrument's own class in the filing. A liquid
  fund holding a bank's certificates of deposit and a flexi-cap fund holding its
  shares are both exposure to the bank, and only one of them is a share a reader
  could set beside the demat row above it.
- **THE AIF HOLDINGS ARE NAMED, NEVER DROPPED**: *"Your 11 AIF holdings
  (₹352.3 Cr) file no portfolio this book can join"* — the look-through's own
  `skipReason`, so whether they hold the company reads as not known rather than
  as no.

#### The tabs

`All · Direct · PMS managers · Mutual funds` (+ `Other accounts` where it has
rows), at **`?held=`** like every other view in this app, so a tab is a link and
the sweep reaches each by address. Each tab prints its own figure. **A statement
route the book has none of reads "none" and cannot be picked — never `₹0`**,
which would read as a measured holding of nothing. The Mutual funds tab reads
`none` where no readable fund discloses the company and STAYS OPEN, because it
still has something to say — which funds were read, and that the AIFs disclose
nothing. It reads `…` while the filings load and `—` if the store does not
answer, each with the cause in its hover: a fact about the fetch is never worded
as a fact about the holding. Only the active tab's rows are in the DOM, which is
why the checks walk four addresses rather than one.

*(The page these tabs were built on is itself five tabs since Stage 10cn. These
route tabs are the Position tab's own, at `?held=` inside `?tab=`. A company held
only inside funds keeps all five page tabs, and each one that has nothing of the
family's own says so once, the Transactions, Price & returns and Research tabs
included.)*

#### The average cost was struck over every unit

`₹94.2 L ÷ 21,500 shares = ₹438.34` — and only the mandate's 7,000 shares report
a cost; the demat's 14,500 are a depository's, which holds the shares and did not
buy them. Over the units that report a cost it is **₹1,346.33**, which is the
per-unit cost Goldstandard's own statement prints on both of its rows.
`measuredTotals` divides by `costedQty`, and the Total row says so in words
(*"Invested, avg cost, P&L and return are on the 7,000 of 21,500 shares that
report a cost"*) — the tile above the table carries the same basis in its caption.
**THE RETURN IS FIFO OVER THOSE SAME ROWS** (Stage 10ca), through
`fifoTotals`, so the figure, its average cost and its caption describe one set.

#### A company held only inside the family's funds had no page

**The Monitor's stock axis links every company only a fund holds to its own
`/stock/` page — 466 of them on this book — and each opened on *"Position closed
· This name is fully exited"*.** The page read "no statement row" as "sold",
about companies the family never held directly and still holds today. The
largest is HDFC Bank, ₹3.18 Cr across its fund lines. Both figures are the
rendered page's, which reads the LIVE book — each fund at its published NAV, and
the depository's cash funds Stage 10ce values. `heldThrough.test.ts` reads the
statements' own marks and counts 461 and ₹3.12 Cr; neither is wrong, and the
basis is why they differ.

- **THREE STATES, NOT TWO.** Until the look-through answers, a page with no row
  cannot tell a fund-held company from an exited one, so it claims neither.
- A fund-only company reads **Held only inside your funds**, its table is the
  fund lines and their derived total, and the Direct and PMS managers tabs read
  "none".
- **THE TAX CARD AND THE AVERAGE-COST TILE ARE NOT DRAWN** — every figure on
  them is the family's own, and here the family owns units of funds, not the
  company.
- **RESEARCH IS ABSENT ONCE, WITH ITS CAUSE**: every research panel is keyed on
  the NSE symbol a statement row resolves, none of the family's statements names
  this company, so none was looked up — *"It is not a feed being down"*. Four
  empty panels read as four failed feeds; this is one decided absence.

#### The table fits its card

A company held through a demat, two mandates and ten funds — State Bank of
India, the one the checks walk — pushed Return and Basis **54px** past the card's
edge, the sideways scroll Stage 10ba measured and removed. The Managed-by column
now wraps above the same `12rem` floor the fund lines keep; a figure never wraps.

#### The checks

- **`heldThrough.test.ts`** (`npm run test:family`) is anchored on `glowData.ts`
  and the committed `public/lookthrough/` store, read through the same three
  inputs `useStockExposure` builds: every company's rows partition across the
  routes; no derived rupee reaches the measured figure; the fund lines tie to the
  store's totals and to `familyValue`, one per member per fund; the average cost
  is over the costed units, **load-bearing on ICICI Bank** (it must differ from
  cost ÷ every unit); the largest fund-only company resolves; the AIFs are
  named; the loading and unreachable states claim nothing; and the ring-fenced
  holding never appears.
- **`check:pages`** walks `stock-held`, `stock-held-managers`,
  `stock-held-funds` and `stock-funds-only`. `HELD_BOOK` re-derives every
  expectation off `glowData.ts` — the company the book reports through the most
  routes (then the largest), and the largest fund-only company — so the next drop
  picks its own. Every claim returns a boolean or `{ notChecked }`, never a
  string, and a missing probe is a failure rather than an abstention. The probe
  reads the table even when its tabs are gone, so a page that lost them fails on
  what it drew rather than making the claims throw on a missing field.
- **`scripts/dev/held-through-bug.sh`** reintroduces 18 bugs — five in the model,
  thirteen on the page — restoring by copy on a trap and rebuilding on the way
  out. On the tree before the merge all eighteen ran: seventeen fired
  their own checks, and one reported NOT A RESULT — its patch searched for
  `TAB_ROUTE` written on one line, where the file writes one entry per line — and
  was re-targeted. **The run also found a defect in the probe rather than the
  page**: with the tabs gone, the probe handed the claims `tabs: null` and
  nothing else, so eleven of them THREW on a missing field instead of failing on
  what the page drew. It reads the table whether or not the tabs are drawn now,
  and the tab-figure claim returns false on a missing tab rather than reading
  `.value` off it.

#### Merged with `main`, and the collisions this file predicts

`main` moved by eight commits while this branch was open — FIFO on every return
(#80), four text blocks and seven benchmarks (#81), the KPI tiles (#82),
corporate actions (#84), one company one key one name (#76), purchase and
redemption (#77), arbitrage as cash (#74) and a Polycab refresh. Three files
conflicted, and each was resolved by intent rather than by side:

- **`StockInfo.tsx`** — main's FIFO caption on the Unrealised tile, its
  corporate-action card and its cash-fund research card, beside this branch's
  tabs, fund lines and funds-only page. **The table's measured footer takes
  main's rule, not this branch's.** It had refused a return wherever some rows
  report no cost; Stage 10ca strikes it FIFO over the rows that DO report one.
  So the footer does the same and says which units it covers — one rule for the
  tile above the table and the total inside it.
- **`heldThrough.ts` and its suite follow.** `measuredTotals` carries
  `fifoTotals` over its costed rows (a cost the statement marks unusable is not
  one), and the suite builds the look-through's inputs through main's
  `heldFundVehicles`, `bookIsinBridge` and `bookCompanyKeys` — the helpers
  `useStockExposure` calls — so it cannot exercise a join the page does not make.
- **The `ctx` literal is main's 92 keys plus this branch's `heldTable`** — 93,
  none duplicated, every one naming a declared probe, checked by parsing both
  parents rather than by trusting the merge. `test-family.mjs` runs both sides'
  suites.

**AND THE MERGE CHANGED WHICH COMPANY THE CHECKS WALK, WHICH IS HOW THE WIDTH
DEFECT WAS FOUND.** Before it, State Bank of India's demat row was keyed `sbi`
and its four PMS rows `state-bank-of-india`, so it was two companies, each held
one way. Stage 10cc joined them into one company held two ways — and measured
on the two books, it took the companies the statements report two ways from ONE
(ICICI Bank) to FOUR (SBI ₹4.46 Cr, ICICI Bank ₹3.00 Cr, Karur Vysya ₹1.43 Cr,
Crompton ₹0.66 Cr). `HELD_BOOK` picks the company reported through the most
routes, then the largest, so the walk moved from ICICI Bank to SBI by itself —
and SBI's table was the one too wide for its card. A check keyed on a typed company name would have gone on
walking ICICI Bank and never seen it.

**THE STAGE LETTER WAS CHECKED AGAINST MAIN'S TIP AT EVERY MERGE, AND IT MOVED
FOUR TIMES.** This section was written as `10cf` against main at 10ce. Before
the first push, main was fetched again: #78 had landed in the meantime and taken
`10cf` itself, in a section at the same place in the file, so git marked the
conflict — the safer of its two failure modes — and this became `10cg`. Then,
while the pull request waited for the family's go-ahead, #87 took `10cg`
(Glow Central Research's fonts and colours) and #89 took `10ch` (the Portfolio
Monitor's master-table notes), so it became `10ci`; and while THAT merge was
being verified, #90 took `10ci` (the notes around every table), so it became
`10cj`. Then, with the go-ahead to merge given and the branch green, #92 landed
and took `10cj` (the seven checks that failed on a correct page), so this is
**`10ck`**, after all five. Each time, every line naming the colliding letter was
classified by whether main's own copy of the file carries it. At `10cf` the three
this branch wrote moved, and #78's own — its heading, two Layout bullets and the
lines inside its section — stayed. At `10cg` this branch's two pointers here and
its harness's header moved; at `10ci` those three moved again, with the one code
comment the previous merge had added; and at `10cj` the same four moved once
more. Main's stayed: #87's heading and letter note, #89's note naming the letters
it stepped over, the six places main's code names #87's stage, #90's heading,
letter note, two back-references and two code comments, and #92's heading, its
letter note, the six notes it added to earlier stages saying where their failures
were fixed, and its five code comments. The headings duplicated in the merged
file are exactly main's ten historical ones, and none is new.

**#90's RULE REACHED THIS CHANGE'S TABLE, AND ITS GUARD SAID SO.** *"no one is
reading these kind of A cliff of notes that you have put in across tables"* —
and #90's `tableNotes` guard, which measures every card holding a table on every
route, fired on this table the moment the two met: the fund note under the fund
lines was one **240-character** cell naming how many funds were read, the AIFs
nothing can join and the funds that could not be read. It is one short line now
— `Read across 16 of your 28 fund holdings · 11 AIF holdings (₹352.3 Cr) file no
portfolio, so not known` — and the working is its hover: what a fund line is,
why an AIF's holding is unknown rather than none, and the names of any fund that
could not be read. What stays on screen is what a reader could otherwise get
wrong: that the AIFs are NAMED, not dropped, which would read as "they do not
hold it". The table's other notes took #90's form in the same merge — the
duplicate-count line is #90's own short wording over this change's rows, and the
fund-overlap line (which no holding in this book exercises) is one line with its
reason in a hover.

**#87 FIXED THE SAME CELL, FOR A SECOND REASON.** Its new faces reached this
table too: where Inter cannot load, the fallback face's semibold headings run
wider, so #87 let the Managed-by cell wrap — the cell this branch had already let
wrap because State Bank of India's table ran 54px past its card. Git could not
merge the two, because #87 edited the inline row map this branch replaced with
`measuredRow`. The resolution keeps `measuredRow`, which wraps that cell inside
its 12rem floor, and carries #87's reason into its comment. #87's page-title
and headline-mark faces merged cleanly, and so did both PRs' changes to
`check-pages.mjs`: the probe literal is still main's 92 keys plus `heldTable`.

**#78 ALSO CHANGED THE SAME TABLE.** It put an XIRR line in each row's Return
cell where the row is a whole account on a dated record (`useDatedCapital`,
`RowCapital`) — written into the inline row map this branch had replaced with
`measuredRow`. The conflict took this branch's structure and carried #78's line
into `measuredRow`: the same `datedCap?.behind([r], holdingsUniverse)`, the same
`data-capital` handle, the same `capital` prop to `ReturnCells`. A fund LINE is
not an account and gets none, which is #78's own rule.

**VERIFIED ON THE TREE MERGED WITH #87 AND #89** (main at `4148c1a`): `build` ·
`tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund 35, buoyant
42, classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22, neoFlows 8, golden
140 — 2 not checked, 0 blocked) · `test:family` exit 0, the new suite included ·
`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY — nothing here touches the book · `check:family` **84/2** ·
`check:pages` **254 combinations, 3 with a finding**. That is main's 246 plus
this change's four routes in both themes, and it reconciles only because the
sweep was run again rather than the count adjusted.

**EVERY FAILURE IS MAIN'S, AND EACH WAS SHOWN TO BE ON MAIN'S OWN BUILD AT
`4148c1a` BEFORE THIS MERGED.** The two `check:family` failures are the
Extras-menu checks, which still count four pages where #84 added a fifth. The
three `check:pages` findings are the Private Market routes, 8 invariants in all,
and the identical 8 fail on main's build: #72's fund-return re-expression still
strikes HPR as value against cost where #80 made it FIFO — Stages 10ce and 10cf
name it and leave it, and so does this. *(Both fixed at Stage 10cj, which landed
while this waited — see the tree merged with it, below.)* The 10 invariants not checked are main's
evidenced abstentions (six KPI-tile lines on the Morning CIO routes, two Private
Market cost lines, #79's redeemed private account, the not-found drill-down's
crumb). Every route this change adds is clean, and #87's look checks — Inter,
Plus Jakarta Sans titles, tabular `.mono` figures, white chrome, a raised card
only where a link covers it — pass on all four of them.

**AND A FULL SWEEP RUN BESIDE OTHER WORK FAILED TWO ROUTES THAT ARE NOT THIS
CHANGE'S, THEN PASSED THEM ALONE.** On the tree before #78, with other checks
running on the same machine, `monitor-txn-drill` failed four invariants and
`monitor-txn-in` three. What they read was the Transactions view as it opens —
3P's ₹31.1 Cr redemption under the Buys filter, no manager row expanded — which
is what a click landing before the view settles would leave. Both pass alone on
that same build, alone on the final one, and in the final full sweep, which ran
with nothing else. That is the load sensitivity Stage 10cc records for
`monitor-txn-out`, on two more of the same walks; it is recorded here rather than
called a flake, and the counts above come from the sweep that ran alone.

**VERIFIED ON THE TREE MERGED WITH #92** (main at `f55b19b`), which is the tree
that ships and the one the note above points to. #92 fixed both of main's
standing failures, so this time nothing is excused: `build` · `tsc` ·
`test:ingest` (parseNum 49, layout 31, pipeline 84, altFund 35, buoyant 42,
classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22, neoFlows 8, golden
140 — 2 not checked, 0 blocked) · `test:family` (47 suites, main's 46 plus
`heldThrough`; 2,494 checks, 0 failed; the four not checked are main's: three
managers' bridges with no performance history on their capital's own date, and
the fund-NAV basis gate) · `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` BYTE-IDENTICALLY · `check:family` **89/0** ·
`check:pages` **254 combinations clean**, which is main's 246 plus this change's
four routes in both themes. Its ten abstentions are all main's (six KPI-tile
lines across the Morning CIO routes, two Private Market cost lines, #79's
redeemed private account, the not-found drill-down's crumb), and none is on this
change's four routes. The sweep ran alone, on a build whose files are
byte-identical to a fresh build of the committed head, and CI (`build`) and
Cloudflare Pages are green on that head.

**AND THE BUG HARNESS RAN ON TWO MERGED TREES, NOT ONLY BEFORE THEM.** On the
tree merged with #87 and #89, and again on the tree merged with #90, the control
came back clean and all eighteen cases fired their own checks. #92 changed none
of the files the harness patches beyond a stage letter in a comment, so the full
sweep above is that run's control on the tree that ships.

### Stage 10cl — AN ADD TILE CARD, AND A CAPITAL CALL COLUMN THAT SAYS WHY IT CANNOT SAVE

*"Add another tile. It should be a big empty tile with bold written: ADD TILE.
When I click on the ADD TILE button, I should be able to choose what I want to
see in that tile."* · *"We need to keep the ability for the customer to add a
date in this Capital Call column, which is empty right now. They should be able
to simply click, select the date, and save it, and it should be a common view
for everybody using the system."*

Two asks on the Private Market page. The first is a new control, and since
Stage 10cb made Morning CIO's strip the same component it lands on both. The
second turned out to be a feature that already existed and was switched off —
and the defect was that the screen could not say so.

#### 1. The `+` became a tile of its own

It replaces a 20px `+` in the last tile's corner, which appended the FIRST spare
metric in catalogue order and left the reader to change it with that tile's own
picker — two steps, the first of them a guess. `AddTile` in
`src/components/SelectableTiles.tsx`:

- **IT SITS WHERE THE NEXT TILE WILL LAND.** It is the strip's last grid cell.
  On Private Market's four-column strip the default four tiles fill the row, so
  the card starts the next one. On Morning CIO the card is COUNTED in
  `--kpi-cols`, so the default five tiles and the card fill one six-column row —
  exactly the width Stage 10cb's `cio-tiles-dense` route already holds every
  heading to. That page does not scroll (Stage 10bj), and a second row of KPI
  tiles would take its height from the panel under it.
- **IT IS THE SIZE OF A TILE, EVEN ALONE ON A ROW.** `auto-rows-fr` makes every
  row as tall as the tallest, which is what makes it "big" rather than a button
  the height of two words. Measured at 1500 × 1000: on Private Market 305 × 116
  against the tiles' 305 × 116, alone on the second row; on Morning CIO 199 × 116
  against 199 × 116 in the sixth column — and the same alone on the next row
  when six tiles fill the first.
- **DASHED AND UNFILLED, NOT A `.card`,** because it is EMPTY. Drawn like the
  tiles beside it, it would read as one more figure that failed to load. It is
  also its own grid cell, never inside a tile's click target, so on Morning CIO
  choosing a metric can never navigate.
- **THE MENU OFFERS ONLY WHAT IS NOT ON SCREEN**, in the catalogue's order, and
  appends the one picked. It opens over the card and exactly as wide, so it can
  never run off the right edge of the page from the last column; a label wraps
  rather than being cut, because on Morning CIO the card is a sixth of the row.
- **IT SAVES THE WAY A PICK DOES** — through `commit`, so the new tile goes to
  this browser at once and to the shared layout store behind it, and the
  address carries no `?tiles=` (Stage 10cb). The menu's last line says where
  the choice was kept, in the tile picker's own words.
- **NOT DRAWN ONCE EVERY METRIC IS ON SCREEN.** A card that opened an empty menu
  would be the control that looks live and does nothing.
- **ESCAPE AND A CLICK OUTSIDE CLOSE IT**, through `useDismiss`, now shared with
  the tile picker so the two menus cannot behave differently.

**WHAT IT COSTS, STATED:** on Private Market, with the default four tiles, the
card starts a second row — about 130px above the fund table. That is what a big
tile where the next tile lands means there; squeezing it into the first row
would shrink every tile. On Morning CIO each of the default five tiles is a
sixth of the row rather than a fifth.

#### 2. The Capital Call column was not empty — it was switched off

The live site shows "not available" under the column heading and a dash in every
cell. The column (Stage 10bs) saves to a Cloudflare KV namespace bound to the
Pages project as **`GLOW_STORE`**, and that binding was never added. It cannot
be added from this repository — it lives in the Cloudflare account — and it
could not be confirmed from here either: every `/api/*` path is behind the edge
password, which this session does not hold.

**THE SAME ONE STEP SWITCHES ON STAGE 10cb's SHARED TILE LAYOUTS**, which read
the same binding. Until it exists, a layout a reader picks is kept in their
browser alone, and the tile picker says so.

**WHAT WAS WRONG ON SCREEN IS WHAT THIS CHANGE FIXES.** Each cell was an em dash
with the reason in a hover and nothing to click, and a column of dashes reads as
"nothing entered" — the misreading Stage 10bs was built to prevent, and the one
the family reported. Stage 10bs's own paragraph said every cell would READ
"Saving is not switched on yet"; it never did.

- **EVERY CELL NAMES ITS CAUSE IN A WORD** (`CAUSE_WORD` in
  `src/lib/enteredCalls.ts`) — "Not set up" (no binding), "Signed out",
  "Not available" (no function running), "Not answering" — and is a BUTTON that
  opens the editor. Never "Add": nothing can be saved.
- **THE EDITOR SAYS WHY AND KEEPS SAVE OFF.** The reason in amber, the date,
  amount and note inputs and the Add call button all disabled, and the "Saved
  for everyone" line dropped, because with the store off it would be false.
- **THE ONE-TIME STEPS, FOR THE ONE CAUSE THEY FIX** (`SWITCH_ON_STEPS`),
  folded, because the family reads this page and the steps are for whoever
  manages the site. A signed-out reader is told to sign in and is never handed
  Cloudflare steps for a store that works. Menu names as Cloudflare's own
  documentation gives them, checked 2026-09-23: Storage & databases → Workers KV
  → Create instance; Workers & Pages → the project → Settings → Bindings → Add →
  KV namespace, variable name `GLOW_STORE`; then redeploy.
- **THE HEADER NOTE NAMES THE CAUSE TOO** — "not set up", "signed out",
  "not available".
- **THE STEPS AND THE FUNCTION CANNOT DRIFT.** `enteredCalls.test.ts` takes the
  variable name OUT of the steps' own words and hands it to the function as the
  binding; the function must then answer. Renaming either side alone fails.

Once the binding exists every cell turns into "+ Add", and a click opens a date
picker, an amount and a note, saved for everyone — the store is shared, and a
save shows for other readers within about a minute (KV is eventually
consistent, Stage 10bs).

#### 3. A stale checker, found on the way — and fixed on main first

Private Market invariants had failed on main since #80 — two on
`private-market` itself, confirmed on a worktree at `f2f3f3e`, and eight across
three routes as Stage 10cf measured them on `c1bfddd` and left them as main's.
Among them *"the methodology picks the measure each fund's own dated record
supports"* and *"each XIRR is the money-weighted rate … and each HPR is value
against cost"*. `PM_RETURN_BOOK` in `check-pages.mjs` still struck a fund's HPR
as value ÷ cost held and held its dated calls to the cost held. Stage 10ca made
both FIFO on the page — the HPR over the cost of units held plus units
redeemed, and the calls against every rupee deployed — so Neo Infra, which
redeemed 14,162.8 units at their cost, read as a GAP in the sweep while the
page correctly showed XIRR +16.7% and HPR +13.8%. **The page was right and the
checker was stale.**

**THIS CHANGE FIXED IT BECAUSE ITS OWN CLAIMS LIVE ON THOSE ROUTES.** The
Capital Call checks are struck on `private-market`, and a route already failing
for an unrelated reason hides a real failure of this change's among its
findings.

**AND #92 (STAGE 10cj) LANDED THE SAME FIX ON MAIN FIRST**, while this PR waited
for the go-ahead to merge. Two fixes for one re-derivation would be two
definitions of one figure, so the merge kept main's — `fifoOf`, the calls held
to every rupee deployed, the footer on FIFO, and the `hprHeld` proof, which
first asks whether the two bases differ on this book at all — and deleted this
change's own helper rather than leaving it beside main's. What this change still
carries of it is two harness cases, 21 and 22 below, and both fire against
main's checker.

#### The checks

`check:pages` gains one route, `private-market-calls-signedout`, and these
claims:

- **the ADD TILE card sits where the next tile will land**, is not inside any
  tile, and every tile can still be removed — in `tilePickerChecks`, so both
  strips are held to it;
- **it is a big empty tile reading ADD TILE in bold** — the size of a tile, a
  dashed edge, no figure in it, the label's computed weight ≥ 700;
- **clicking it offers exactly the metrics not on screen, adds the one picked,
  and the page reopens with it** — the walk picks the LAST metric offered, which
  a card that ignored the choice and appended the first spare metric (what the
  `+` did) cannot add; it reads the strip back, requires the address to carry no
  `?tiles=`, and opens the page again. It runs on BOTH strips, wherever a card
  is drawn;
- **on Morning CIO the card shares the tiles' row while the strip has room**,
  struck on its row — every claim above passes with the card on a row by itself —
  and **on the dense six-tile strip, alone on the next row, it is still the size
  of a tile**;
- **its menu paints over the page, and Escape closes it** — sampled on a grid
  with hit-testing on, as the search list is;
- **with every metric on screen there is no card** (`private-market-tiles`);
- **the Capital Call cells are buttons naming their cause, never "Add"** — on
  the default route ("Not available"), `private-market-calls-off` ("Not set
  up", and the header) and `private-market-calls-signedout` ("Signed out");
- **a click opens the editor**: on the unconnected store the reason, three steps
  naming `GLOW_STORE`, Workers KV, the Bindings screen and a redeploy, and every
  input and Save disabled with no "saved for everyone"; on the signed-out store
  the sign-in sentence and no steps at all.

#### Twenty-two bugs reintroduced, and each one fires its own check

`scripts/dev/add-tile-bug.sh`, committed so the next session's verification is
one command. Each bug is applied on its own, rebuilt and swept on the routes it
touches; the files are restored BY COPY on a `trap … EXIT`, each restore
verified with `cmp`, and **rebuilt on the way out** — restoring the source alone
leaves `dist/` at the bugged build for the next run to report under the wrong
name. A `flock` makes a second copy refuse rather than race one `dist/`; a patch
that does not apply, or a build that fails, is reported as NOT A RESULT rather
than as a clean sweep; `CASES=` re-runs one case. A no-patch CONTROL runs first
and was clean.

| # | Bug put back | Fires |
| --- | --- | --- |
| 1 | the card not drawn | all four card checks on both strips, and Morning CIO's row check |
| 2 | a pick appends the first spare metric whatever was chosen — what the `+` did | the click-and-add check, on both strips |
| 3 | the menu offers metrics already on screen | the click-and-add check, on both strips |
| 4 | Private Market's rows sized to their content (no `auto-rows-fr`) | "a big empty tile, the size of a tile", on Private Market |
| 5 | the same on Morning CIO's `kpi` grid | the dense strip's size check, on `cio-tiles-dense` |
| 6 | ADD TILE not bold | "a big empty tile…", on both strips |
| 7 | the card drawn as a `.card` | the placement check on both strips — and main's two picker checks, which count a `.card` as one more figure tile |
| 8 | the card drawn with nothing left to add | "with every metric on screen there is no ADD TILE card" |
| 9 | the menu painted under the page | the paint-and-Escape check, and the click-and-add check — a menu under the page cannot be clicked |
| 10 | Escape does not close it | the paint-and-Escape check, alone |
| 11 | the card not counted in Morning CIO's columns | "the ADD TILE card shares the tiles' row while the strip has room" |
| 12 | an added tile shown and never saved | the click-and-add check — the reopened page has lost it |
| 13 | a Capital Call cell an unclickable dash again — the defect the family reported | five checks across the three call routes |
| 14 | an unsaveable cell says "Add" | the cell check, on all three call routes |
| 15 | the Cloudflare steps shown to a signed-out reader | the signed-out editor check |
| 16 | "Saved for everyone" printed while saving is off | both editor checks |
| 17 | Save left on while the store cannot save | both editor checks |
| 18 | the header note stops naming the cause | the cell-and-header check, on both switched-off routes |
| 19 | *(suite)* the steps name a binding the function does not read | `enteredCalls.test.ts`, exit 1 |
| 20 | *(suite)* a store nobody connected reads as a generic error | `enteredCalls.test.ts`, exit 1 |
| 21 | the page's fund HPR back to value ÷ cost held | three checks on `private-market-returns`: both HPR checks, and the HPR footer |
| 22 | a fund's dated calls held to the cost of the units still held | four checks across two routes: the methodology, the XIRR column, the payouts, the XIRR footer |

**AND THE PASS WAS RUN FOUR TIMES, BECAUSE MAIN MOVED UNDER IT.** All 22 cases
fired on each merged tree in turn — the one with #82 (`46a3716`), the one
with #78 (`538f4d3`), the one with #87 and #89 (`d8391fc`), and the one with
#92 (`49db719`), which carries #90 too — with a clean control first each time.
The table is the last run. On that tree, cases 21 and 22 ran against MAIN's
checker rather than this change's, which is what section 3 claims of them.
#92's own `pm-fifo-bug.sh` was re-run there as well: a clean control, then all
eight cases fired, each on the same checks #92's table records. Neither harness
was run again on the tree merged with #88, which changed none of the files they
patch and none of the checks they fire; the full sweep on that tree is their
control.

**THE ESCAPE CASE FIRST FAILED THE WRONG CHECK, AND THE WALK WAS THE DEFECT.**
With Escape broken, the click-and-add claim failed as well as the Escape one:
the walk re-clicked the card to reopen the menu, the menu Escape had failed to
close was still open, and the click CLOSED it. The page was right and the walk
was wrong, which reads exactly like a second regression. It reopens the menu
only if it is shut now, and the case fires the one claim it exists for.

**AND IT RUNS IN A SEPARATE WORKTREE, BECAUSE A HARNESS THAT PATCHES FILES
LEAVES THE WORKING COPY DIRTY FOR AS LONG AS IT RUNS.** The pass takes about
half an hour, and for all of it the working copy carries whichever bug is in.
This session's stop hook read that as uncommitted work, and committing to
satisfy it mid-run would have committed a bug. So the pass runs in a
`git worktree add` copy with its own `vite preview` on another port, and `BASE=`
points the sweep at it. The working copy stays clean, and the rest of the
verification runs beside it.

#### The verification

Every result below is from the tree that ships: this change merged with #88
(main `37c93ba`), and each was run again there rather than carried across.

`build` · `tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund
35, buoyant 42, classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22,
neoFlows 8, golden 140 — 2 not checked, 0 blocked) · `test:family` (47 suites,
2,500 checks, 0 failed — `enteredCalls.test.ts` among them) · `check:family`
**89/0** · `check:pages` **256 combinations clean, 0 invariant failures** ·
`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY: a tile strip and a column that cannot save move no figure in
the book. CI (`build`) and Cloudflare Pages are green on the final commit.

**THE SWEEP RECONCILES WITH MAIN'S OWN.** Stage 10ck records 254 combinations
clean on main; this change adds one route, `private-market-calls-signedout`, in
both themes — 256. The ten invariants not checked are the ten main's sweep
carries, read out of the log by route: six KPI-tile lines across the Morning
CIO routes (every tile carries a figure), two Private Market cost lines (every
private holding reports a cost), one redeemed-account line on
`private-market-folios` and one crumb on `holdings-unknown`. All are
pre-existing claims with no subject on this book, and none is this change's.

#### Merged with main six times, and the letter moved six times

This change was drafted as `10cb` against a main whose tile strip was Private
Market's alone, with a `+` on the last tile. While its bug harness ran, **six
commits landed on main and four of them took `10cb`, `10cc`, `10cd` and
`10ce`** — and `10cb` (#82) rewrote `SelectableTiles` itself: a shared layout
store, a `kpi` variant carrying Morning CIO's strip, and a pick that no longer
writes `?tiles=`. So it became `10cf`.

**THE COMPONENT WAS RESOLVED BY TAKING MAIN'S WHOLE and re-applying the card on
top**, never by hand-merging a file whose saving model had changed underneath
it: `add` now goes through main's `commit`, the card's menu gained the picker's
"where it was kept" line, and the card is counted in `--kpi-cols`. The checker
was resolved the same way — main's file, with this change's edits re-applied by
anchor, each anchor required to occur exactly once — because the `ctx` literal,
the tile probe and the check factory had all moved.

**AND A CHECK'S NAME TURNED OUT TO BE LOAD-BEARING.** Main runs a subset of
`tilePickerChecks` on `private-market-tiles`, chosen by a REGEX over the checks'
names (`/offers every metric|next visit opens on it|cut off or split/`). This
change's walk claim was first renamed to end "…and the next visit opens on it",
which matched that regex and put a claim about the ADD TILE card on the one
route where every metric is on screen and no card is drawn — a correct page
failing by name. It reads "…and the page reopens with it" now. A filter over
prose is a filter a rename can widen, and the sweep is what said so.

**THEN #78 LANDED WHILE THE MERGED TREE WAS BEING VERIFIED, AND TOOK `10cf`.**
Main keeps it, and this became `10cg`. The merge raised no conflict — this
section was not yet written, and its four pointers sat in other paragraphs — so
nothing marked the collision: two sections would have answered to one letter,
and every "see Stage 10cf" in this file would have pointed at whichever came
first. It was caught by comparing main's stage letters against the branch's own
before committing, which is the check Stage 10bl says to run on every merge.
Every line naming `10cf` was then placed by which side's own copy of the file
carries it, never by a bulk replace: this change's 4 pointers in this file, 14
comments in `check-pages.mjs`, the harness's header and one comment in
`Kpi.tsx` moved; #78's 6 lines here and 12 comments there stayed.

**AND THEN #87 AND #89 TOOK `10cg` AND `10ch`, SO THIS WAS `10ci`** — while the
pass above was running on the tree merged with #78, and caught the same way, by
the letters rather than by a marker. The same placement moved this change's
lines and left theirs: 3 lines here, 3 comments in `check-pages.mjs`, and one
line each in `Sidebar.tsx`, `index.css`, `StockInfo.tsx` and `look-bug.sh`. No
later letter is claimed in main's prose.

**#87 ROUNDED EVERY `.card`, SO THE CARD FOLLOWED BY HAND.** Its
fonts-and-colours change moved `.card` from `rounded-xl` to `rounded-2xl`. The
ADD TILE card is deliberately not a `.card` (see above), so it did not follow
on its own, and a card the size of a tile with the tiles' old corners reads as
a different kind of control. It is `rounded-2xl` now, and the harness's `.card`
case, which anchors on that class string, moved with it.

**AND A CLEAN MERGE WAS CHECKED BY HAND.** The last two merges raised no marker
at all, in this file or in `check-pages.mjs`, which is when this file says to
look. On the final tree the invariants' `ctx` literal is the exact union of
both sides — 94 keys, none duplicated, nothing lost — the route table carries
every route from both (118, among them `private-market-calls-signedout` and the
`stock-capital` route #78 added), and `build-book` regenerates the book
byte-identically. Main's tip then still carried the stale FIFO lines in
`PM_RETURN_BOOK`, so section 3's fix was still this change's to make — until
#92, below.

**AND THEN #90 TOOK `10ci`, SO THIS WAS `10cj`.** It landed while this PR waited
for the go-ahead to merge. Both sections sat at the same place, so git marked
the conflict this time. Main's keeps `10ci`; this section follows it. Every line
naming `10ci` was placed by which side's own copy of its file carries it: 21
were this change's and moved with the heading (4 pointers in this file, 14
comments in `check-pages.mjs`, 2 in the bug harness, 1 in `Kpi.tsx`); main's
7 stayed; and one line of this section's history keeps `10ci`, because it
records the letter it held then. Two conflicts in `check-pages.mjs`, both unions:

- **The walk.** #90's two probes (`tableNotes`, `foldsOnArrival`) and this
  change's store-off walk were inserted at one spot under one shared `/**`.
  #90's run first, because they read the page as it arrives and this walk opens
  an editor; each got its own comment opener.
- **The `ctx` literal.** #90's `fundLines`, `tableNotes` and `foldsOnArrival`
  beside this change's `tileAdd` and `callOff`. #90 deleted `FundExposure.tsx`
  and the `fundExposure` probe with it, so that key stays out: 96 keys, none
  duplicated, every one declared.

#90 did not touch the tile strip, the Capital Call cells or their store.

**AND THEN #92 TOOK `10cj`, SO THIS WAS `10ck` — AND IT HAD FIXED THE SAME
CHECKER.** It landed while this PR still waited, and both stages sat at the
same place, so git marked the conflict. Main's keeps `10cj`; this section
follows it. Every line naming `10cj` was placed by which side's own copy of its
file carries it: 20 were this change's and moved with the heading (4 pointers in
this file, 13 comments in `check-pages.mjs`, 2 in the bug harness, 1 in
`Kpi.tsx`); main's 13 stayed; and one line of this section's history keeps
`10cj`, because it records the letter it held then. The branch's fourteenth
`10cj` comment in `check-pages.mjs` did not move — it went with the helper
below.

- **Three hunks in `check-pages.mjs`, all inside `PM_RETURN_BOOK`,** were the
  two fixes of one checker meeting. Each was resolved by taking main's side, so
  the block is main's byte for byte, and this change's own helper was deleted
  rather than left beside it (section 3).
- **The `ctx` literal came through with no marker,** because #92 added no
  probe. It was read rather than trusted: 96 keys, none duplicated, the exact
  union of both sides, every one declared.
- **`PrivateMarket.tsx` merged without a marker too.** It differs from the
  pre-merge branch only by #92's `aggHprNote`, and from main only by the
  Capital Call column's heading, which names the cause in a word.
- **`check:family` reads 89/0 now**, where every earlier run of this change read
  84/2: #92 taught its Extras rows the fifth page (`/corporate-actions`) — the
  fix this section used to name as main's to make.

Both bug harnesses were re-run on the merged tree, each after a clean control —
see the pass paragraph above.

**AND THEN #88 TOOK `10ck`, SO THIS IS `10cl`.** It landed in the minutes after
this section's notes were pushed, before the PR could merge. Both sections sat
after `10cj`, so git marked the conflict. Main's keeps `10ck` and comes first.
Every line naming `10ck` was placed by which side's own copy of its file carries
it: 20 were this change's and moved with the heading (4 pointers in this file, 13
comments in `check-pages.mjs`, 2 in the bug harness, 1 in `Kpi.tsx`); #88's 6
stayed (4 in this file, 1 in its bug harness, 1 in `StockInfo.tsx`); and one line
of this section's history keeps `10ck`, because it records the letter it held
then.

- **The `ctx` literal conflicted and was resolved as a union**: #88's
  `heldTable` beside this change's `tileAdd` and `callOff`. 97 keys, none
  duplicated, every one declared.
- **#88 changed the company page and its own checks, and none of this
  change's code.** It touches none of the files either bug harness patches and
  none of the checks they fire, so neither harness was re-run; the full sweep is
  their control on this tree.
- **Neither side touched a generated file**, and `build-book` still regenerates
  the book byte-identically.

### Stage 10cm — ALL SECURITIES IS THE MONITOR'S FIRST VIEW, AND THE TWO SELECTORS CLOSE THE ROW

*"Make this view as All Securities and make it first in portfolio monitor and
default open and put the all holding and all entities selectors to the right
end of after return selector"*

#### 1. The first segment IS the default — and only the Monitor's list moved

`MONITOR_GROUP_VIEWS` in `groupAxis.ts` puts the security axis FIRST, labelled
**All Securities**, and `useViewParam` makes a list's first view its
param-free default — so moving the segment to the front is what makes
`/monitor` open on one row per security, with no second convention. Category,
which held that place since Stage 10z (*"Default view will remain the current
one, category wise"*), is `/monitor?group=category` now. The KEY did not
change, so `?group=security` still resolves and every bookmark and search
result that named the axis still lands.

**`GROUP_VIEWS` DID NOT MOVE, DELIBERATELY.** It is the list Morning CIO's
allocation card and the Monitor's Transactions table read, and neither has a
security axis — so Morning CIO still opens on Category, and a reader who opens
`/monitor` and clicks Transactions lands on Category through the fallback
Stage 10bg built. That fallback is the ORDINARY path now rather than an edge
one, which is why the `txnAxis` and `setView` notes say so.

#### 2. The row reads HOW the table is arranged, then WHICH rows are on it

Axis → return picker → Expand all → **All holdings · All entities**. The last
two sit in ONE `ml-auto` group, so where the row wraps they drop to the next
line as a pair and stay right-aligned, instead of one of them starting a line
on its own at the left. Measured at 1500px on the merged tree: the axis
control spans 217–493, the return picker 499–662, and the pair 1072–1479,
flush with the row's own right edge. Transactions carries the return picker
too since Stage 10cd, so its row is axis → return → the same pair, which is
exactly where the ask puts them.

**THE PICK-LIST'S PANEL OPENS LEFTWARD NOW.** `MultiSelectFilter` takes
`align="right"`. As the row's first control a panel anchored to its trigger's
left edge opened into the row; at the right end the same 24rem panel would open
past the page — the defect the return picker had once as the row's last
control, fixed the same way. It opens 932–1268 at 1500px and stays inside the
viewport at 1024 and 768.

#### 3. Two defects the new default made common

- **A PICKED FUND DREW AN EMPTY TABLE OVER A ₹0 FOOTER.** The pick-list offers
  every holding on every axis — a reader searches the book, not the view — and
  on All Securities only a company share is a row (Stage 10aj). Picking
  `Sanshi Fund-I` there read *"No positions match your filters"* over
  `₹0 ₹0 ₹0 0.0%`: a family who know they hold it being told nothing matched,
  which is the BSE search's defect (Stage 10bu) one control over — and one
  click from the page's front door once this is the default. The table now
  names each picked holding that is not a row here, says why, and offers
  **Show it on Category**, keeping the selection across the click. Picked
  beside a company it sits under the company's row, so a fund is never dropped
  from the table without a word.

  **AND IT NAMES ONLY WHAT CATEGORY WOULD DRAW**, which the first draft did
  not. The pick-list also offers a CLOSED position — 3P, redeemed to nil — and
  a holding the reader's own entity or sector filter excludes, and Category
  draws neither, so "Show it on Category" there was a promise of an empty
  table. `pickedNotRows` runs the row build's own tests (`currentHoldings`,
  then entity, then sector) and everything else keeps the generic line, which
  names the reader's filters as the cause. Found by re-reading the memo against
  the row build after the merge, not by a check — so a check was added.
- **NO FOOTER IS DRAWN OVER NO ROWS.** A total of nothing is not a measured
  zero (§2), and the line above it already says why the table is empty.

#### 4. What else said "the Monitor" and meant Category

Three sentences promise the Portfolio Monitor "carries … in full" — a fund's
look-through card, a non-mandate account's page and a holdings drill-down. True
of Category, where every holding is a row; false of All Securities, where a fund
is not. Each link names `?group=category` and carries `data-monitor-in-full`.
The breadcrumbs and the `/compare`, `/watchlist`, `/news` and `/data-bank`
redirects still go to `/monitor`: they name the PAGE, not a slice of it.
*(Two of the three sentences have since gone — Stage 10ci took the look-through
card's and the drill-down's notes away — so one link is left, on the mandate
page. See the fourth merge below.)*

Search: the security view is labelled **All Securities** and answers "all
securities"; **Holdings by category** is a view of its own ("category wise",
"by category", "mandate wise") and one of the six starting points under an
empty search box — the Category view lost its address-free door, so it gained a
named one.

#### 5. The checks, and where each claim is struck

- **Sixteen routes that walk the category table name `?group=category`** in
  their address — `monitor`, the tranche, arrange and return-measure routes,
  the drill-downs, `monitor-entity` — because each was written against the
  category table when it was the default. `monitor-security` walks the bare
  `/monitor` and holds the DEFAULT: All Securities first under that name; the
  bare address lit on it with no `?group=` asking for it; the table it opens is
  the security table (no section headings, both derived columns); and the
  opened pick-list anchored right and on screen. Three claims none of which
  implies another — a relabelled button left last passes the first alone.
- **`FILTER_ROW`** holds the row's ORDER by its children's handles and the
  pair's right edge to the row's (±2px), on a Holdings route per axis kind and
  on Transactions. None of it can be struck on text: the row prints the same
  words whichever end the selectors sit at.
- **`monitor-pick-fund`** first picks a CLOSED fund alone (`PICK_CLOSED_BOOK`,
  derived from `glowData.ts`) and requires the generic line and no promise;
  then the book's largest holding that is not a company share, then a company
  beside it, then clicks through. **"…with the pick kept" is read off the
  pick-list's own label**: a cleared pick would still draw the fund's row on
  Category, where every holding is a row, so the row alone cannot tell a kept
  selection from a lost one.
- **`MONITOR_IN_FULL`** holds the three links — on `mandate-fund`,
  `holdings-book` and `stock-mf-lookthrough` — off a `data-monitor-in-full`
  handle, because the breadcrumb says "Portfolio Monitor" too and rightly opens
  the page on whatever it opens on. A route drawing none has lost the sentence.
  *(It runs on `mandate-fund` alone since the fourth merge below, where the one
  sentence left is.)*
- **`check:family`** drives the control: All Securities first and open at
  `/monitor`, Category's click writes `?group=category` and draws the section
  tabs, and All Securities' click takes the param away again.

#### Merged with main — six PRs, and two things they assumed

Six PRs and a daily data refresh landed while this was open — Stages 10by,
10cb, 10cc, 10cd and 10ce, and the corporate-actions returns. Two files conflicted
and both were unions: `PortfolioMonitor.tsx` keeps main's `labelByKey` beside
this change's `pickedNotRows`, and `check-pages.mjs` keeps both sides' new
blocks and the union of the `ctx` literal — 95 keys at the merge and 96
with this change's last probe, none duplicated, each naming a declared variable.

**TWO THINGS MAIN ADDED ASSUMED CATEGORY WAS THE DEFAULT, AND NEITHER
CONFLICTED.** Stage 10cd put the return picker on Transactions, so that row is
axis → return → the pair, and `FILTER_ROW` says so. And main's
`monitor-picklist` read the search list "on the default axis" at the bare
`/monitor` — which would now read All Securities' list twice and leave the
category build unchecked — so it names `?group=category`. **A clean merge is
not a correct one**, and this file says so for the letter; it is equally true
of a route whose address means something else after the merge.

**THE LETTER WAS CHECKED AGAINST MAIN'S TIP AT MERGE TIME.** Main's headings
ran to `10ce` and no prose named a later one, so this section took `10cf` —
and lost it an hour later, below.

`build` · `tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund
35, buoyant 42, classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22,
neoFlows 8, golden 140 — 2 not checked, 0 blocked) · `test:family` exit 0 ·
`npm run build-book` byte-identical, md5 unchanged — nothing here touches the
ingest. `check:family` **87/2**, and the two are main's own: the Extras-menu
checks Stage 10ce records, failing because #84 put a fifth page in a dropdown
the check still counts as four. *(Fixed at Stage 10cj, with the Private Market
checks the later notes below name.)* `check:pages` over **all 38 Portfolio Monitor
routes on the merged tree: 38 clean, 0 invariant failures, 0 abstentions**,
and the seven routes the last fixes touch clean again after them, with the one
evidenced Morning CIO abstention (every KPI tile on this book carries a figure).

#### …and a second time: #78 took `10cf`

**#78 — XIRR where a row is a whole account on a dated record — landed while
this PR waited for the family's go-ahead, and took `10cf`.** Main keeps it;
this section became **`10cg`**. The two sections were inserted at the same place,
so git marked the conflict — the case that announces itself — and it was
resolved by placing main's section first.

**EVERY LINE NAMING `10cf` WAS PLACED BEFORE ANY MOVED**, against both sides'
own copies of its file. Nine are this change's: seven moved — the note under
Stage 10z, two check-script comments, the bug harness's header and the three
"in full" link comments — with this section's heading, and the two in its own
merge note were reworded, because they record the letter it held then.
Twenty-three are #78's and stayed: its heading, its merge note and two pointers
in this file, twelve check-script comments, its bug harness, three test
comments and `datedCapital.ts`.

**ONLY THIS FILE CONFLICTED, SO THE TWO THAT DID NOT WERE READ.**
`PortfolioMonitor.tsx` carries #78's XIRR column beside this change's default,
row and picked-fund line, and its diff against main is this change's alone. The
`ctx` literal is main's 92 keys and this change's 4 — 96, none duplicated, each
declared; #78 added no key, it widened two probes (`posTable.stockReturns` and
`returnCells`).

**AND #78's MONITOR CHECKS READ THE CATEGORY TABLE, WHICH IS WHY THEY STILL RUN
WHERE THEY WERE WRITTEN.** Its mandate-XIRR check on `monitor`, its XIRR column
on `monitor-xirr`, its CAGR partition on `monitor-cagr` and its per-section sort
on `monitor-ret-sort` read mandate rows or section buckets. On main those routes
name no `?group=`, which there means Category; here that would be All
Securities, where no mandate is a row — and the mandate check FAILS on no rows
rather than abstaining. All four already name `?group=category` since this
change, so none of #78's checks had to move.

`build` · `tsc` · `test:ingest` (the same eleven suites, golden 140 passed, 2 not
checked, 0 blocked) · `test:family` exit 0, #78's `datedCapital.test.ts` among
them · `npm run build-book` byte-identical, and equal to main's own copies —
neither side moves the book. `check:pages` **248 combinations, 3 with a
finding, and all three are main's**: the Private Market routes, the same 8
checks that fail on main's own build (#72's fund-return re-expression still
strikes HPR as value against cost, where #80 made it FIFO). The 10 NOT CHECKED
lines are main's pre-existing claims with no subject on this book. The bug pass
did not finish on this tree before main moved again; it ran in full on the next
one, below.

#### …and a third time: #87 took `10cg`, and #89 `10ch`

**#87 — Glow Central Research's fonts and colours — and #89 — the notes for
the Portfolio Monitor's master table — landed while that sweep ran, and took
`10cg` and `10ch`.** Main keeps both; this section became **`10ci`**. The letters
were compared as HEADINGS against main's tip, and no prose on main names a
letter after `10ch`. As at `10cf`, both sides had inserted at one place, so git
marked the conflict, and main's two sections come first.

**EIGHTEEN LINES NAMED `10cg` AFTER THE MERGE, AND EACH WAS PLACED BEFORE ANY
MOVED**, against both sides' own copies of its file. Eight are this change's:
seven moved to `10ci` — the note under Stage 10z, two check-script comments, the
bug harness's header and the three "in full" link comments — and the one in the
merge note above was reworded, because it records the letter this section held
then. Ten are main's and stayed: #87's heading and merge note, #89's line that
main had taken every letter from `10bz` to `10cg`, three check-script comments,
#87's bug harness, `Sidebar.tsx`, `index.css` and `StockInfo.tsx`. (The merge
commit's message says eleven; ten is the count.)

**ONLY THIS FILE CONFLICTED, AND THE THREE PAGES BOTH SIDES TOUCH WERE READ.**
#87 set page titles and headline figures in its display face and gave Export
Excel a class of its own; this change's lines in `PortfolioMonitor.tsx`,
`MandateHoldings.tsx` and `HoldingsBehind.tsx` sit beside those edits
untouched, and the merged tree's diff against main is this change's thirteen
files alone. The `ctx` literal is main's 92 keys and this change's 4 — 96, none
duplicated; #87 and #89 added none.

**#87's TWO NEW CHECKS RUN ON EVERY ROUTE, THIS CHANGE'S INCLUDED, AND PASS
THERE.** In the light theme the page reads in Inter, its title and figures in
their own faces, the nav and top bar are white and the entry you are on is gold;
in both themes a raised card must be covered by a link. No route in the sweep
below reports either, and none reports a contrast finding.

**THE FULL SWEEP FOUND FIVE ROUTES, AND NONE IS THIS CHANGE'S.** It ran while
the bug pass was building and sweeping on the same four-core machine. Three are
the Private Market routes: the identical 8 checks fail on main's own build at
`4148c1a`, walked for this record rather than assumed. Two are Transactions
routes — `monitor-txn-drill` (4 checks) and `monitor-txn-in` (3) — and those
are TIMING. The walk clicks Transactions, waits a fixed 1.2 s, then clicks the
next control and silently skips it if it is not drawn yet. Measured: once the
click lands, the dated table takes 0.9–1.4 s to appear on a quiet machine, from
main's old Category default as well, so that wait is marginal on main already
(Stage 10cc saw `monitor-txn-out` fail the same way). Under four busy loops the
two routes fail the same 7 checks on main's own build as on this one, twice
each; with the machine quiet both pass on both builds. The defect is the fixed
wait in main's walk, and it is left to a change of its own rather than widened
into this one.

What this change does move is how long the CLICK takes. From bare `/monitor`
(All Securities, 565-odd rows and the fund look-through) the click waits
2.5–3.2 s for the page to settle, against about 0.5 s from Category. The walk
tolerates that, because a click waits for its target, and the window that
matters — after the click — is the same from both.

`build` · `tsc` · `test:ingest` (the same eleven suites, golden 140 passed, 2 not
checked, 0 blocked) · `test:family` (2,466 checks, 0 failed; its four NOT CHECKED
lines are main's own) · `npm run build-book` byte-identical, and equal to main's
own copies · `check:family` **87/2**, the two being main's Extras-menu checks ·
`check:pages` **248 combinations**, 5 with a finding and all five accounted for
above, with main's 10 evidenced abstentions and none of this change's · **the
bug pass: all 12 cases fire their own checks**, after a clean control
(`scripts/dev/all-securities-bug.sh`, run on this tree in a worktree of its own).

#### …and a fourth time: #90 took `10ci`

**#90 — the notes around every table cut to one short line, with the rest in a
hover — landed while that sweep and bug pass ran, and took `10ci`.** Main keeps
it; this section became **`10cj`**. The headings were compared against main's tip:
the merged file differs from main's by `10cj` alone, main's ten historical
duplicates are unchanged, and no prose on main names a letter after `10ci`.
Both sides had inserted at one place again, so git marked the conflict.

**SEVENTEEN LINES NAMED `10ci` AFTER THE MERGE, AND EACH WAS PLACED BEFORE ANY
MOVED**, against both sides' own copies of its file. Seven are #90's and stayed:
its heading, two lines of its merge note, its notes under Stage 10an and Stage
10cc, and two code comments. Ten were this change's. Six moved to `10cj`: the
heading, the note under Stage 10z, two check-script comments, the bug harness's
header and the one "in full" link comment still standing. Two, in the third
merge note above, stay as the record of the letter this section held then. The
last two went with the sentences they sat in, below.

**#90 TOOK AWAY TWO OF THE THREE "IN FULL" SENTENCES, AND THAT DECIDED TWO OF
THE FOUR CONFLICTS.** The fund look-through card's sentence and the holdings
drill-down's were notes around a table, and #90 removed both at the family's
request. This change had only repointed their links, so both files were taken
as main has them. The mandate page's sentence is not a table note and stays,
still naming `?group=category`. So `MONITOR_IN_FULL` now runs on `mandate-fund`
alone, where the sentence is. #90 also removed the security axis's coverage
fold, which the picked-fund memo's comment named as where a fund's money is
shown; the comment now names the Total exposure footer's hover, where #90 moved
that partition.

**AND #90's NEW GUARD CAUGHT THIS CHANGE'S OWN LINE, WITH NO CONFLICT TO SAY
SO.** `tableNotes` caps every table cell at 180 characters, on every route. The
picked-fund line is a cell of the holdings table, and with Sanshi's name in it
the sentence ran to 182. It is one short line now: the holding, "is not a
company share, so it is not a row on All Securities", and the button — 130
characters with Sanshi's name. What moved into the hover is what All Securities
lists and where the holding IS a row. A new check holds the line to one short
line and its hover to both of those halves, and the check that the line is gone
on Category now matches the plural wording as well as the singular. The bug
harness gained two cases: the hover dropped, and the old sentence put back.

**THE `ctx` LITERAL IS MAIN'S 94 KEYS AND THIS CHANGE'S 4 — 98, none
duplicated, each declared.** #90 replaced `fundExposure` with `fundLines` and
added `tableNotes` and `foldsOnArrival`. The one conflicting line kept main's
side and added this change's four.

Every result here is from the tree merged with #90 (main `1e0ab78`), run again
there rather than carried across. `build` · `tsc` · `test:ingest` (the same
eleven suites, golden 140 passed, 2 not checked, 0 blocked) · `test:family` exit
0 · `npm run build-book` byte-identical, and equal to main's own copies ·
`check:family` **88/2** — #90 added a row, and the two are still main's
Extras-menu checks · `check:pages` **248 combinations, 3 with a finding**: the
Private Market routes, main's own. The Transactions routes that failed on timing
on the previous tree passed this time, on a quieter machine. The 10 NOT CHECKED
lines are main's evidenced abstentions and none of this change's. The bug pass
waited for the sweep, and main moved again before it could run; it ran on the
next tree, below.

#### …and a fifth time: #92 took `10cj`

**#92 — seven checks that failed on a correct page — landed while that sweep
ran, and took `10cj`.** Main keeps it; this section became **`10ck`**. The headings
were compared against main's tip: the merged file differs from main's by `10ck`
alone, main's ten historical duplicates are unchanged, and no prose on main
names a letter after `10cj`. Both sides had inserted at one place again, so git
marked the conflict.

**TWENTY-TWO LINES NAMED `10cj` AFTER THE MERGE, AND EACH WAS PLACED BEFORE ANY
MOVED**, against both sides' own copies of its file. Thirteen are #92's and
stayed: its heading and its merge note, six notes it left in earlier stages'
sections to say where their failures were fixed, and five code comments. Nine
were this change's. Six moved to `10ck`: the heading, the note under Stage 10z,
two check-script comments, the bug harness's header and the "in full" link
comment. The other three are in the fourth merge note above and stay as its
record; one of them now says "this section became" where it said "is".

**#92 FIXES THE FAILURES THIS SECTION HAS BEEN NAMING AS MAIN'S.** It moved the
sweep's re-derivation of Private Market returns onto FIFO (the three routes'
eight checks) and made `check:family`'s Extras list five pages (its two rows).
So on this tree those runs should be clean, and a finding there would now be
real rather than inherited.

**ONLY THIS FILE CONFLICTED.** `check-pages.mjs`, `check-family-inputs.mjs` and
`PrivateMarket.tsx` merged without a marker, which is when to check by hand. On
each, the merged file's lines against this branch are exactly #92's own diff —
+91/−8, +15/−8 and +19/−2, measured line by line — plus this merge's two comment
renames. The `ctx` literal is still 98 keys, the union of both sides: #92 added
none. `check:family`'s Monitor checks and #92's Extras rows sit in different
parts of that file, and both are there.

Every result here is from the tree that ships, this change merged with #92
(main `f55b19b`), run again there rather than carried across. `build` · `tsc` ·
`test:ingest` (the same eleven suites, golden 140 passed, 2 not checked, 0
blocked) · `test:family` exit 0 · `npm run build-book` byte-identical, and equal
to main's own copies · `check:family` **92 passed, 0 failed** · `check:pages`
**248 combinations clean**. That is the first sweep of this branch with no
finding at all: the three Private Market routes that failed on every earlier
tree pass, because the failures were main's and #92 fixed them. The 10 NOT
CHECKED lines are main's evidenced abstentions across four claims, and none is
this change's. The count is main's 246 plus this change's one new route across
both themes. **The bug pass ran on this tree**
(`scripts/dev/all-securities-bug.sh`, in a worktree of its own after the sweep
had finished): a clean control on its eight route/theme combinations and
`check:family` 92/0, then **all 14 cases fire their own checks**, including the
two #90's cell limit added (the hover dropped, and the long sentence put back).

#### …and a sixth time: #88 took `10ck`

**#88, which gives the company page a tab per way a company is held, landed
while this change's results were being written up. It took `10ck`.** Main keeps
it, and this section became **`10cl`**. Its section and this one had both been
inserted at the same place, so git marked the conflict. The headings were then
compared against main's tip. The merged file differs from main's by `10cl`
alone, main's ten historical duplicates are unchanged, and no prose on main
names a letter after `10ck`.

**FIFTEEN LINES NAMED `10ck` AFTER THE MERGE, AND EACH WAS PLACED BEFORE ANY
MOVED.** Each was checked against both sides' own copies of its file.

- Six are #88's, and they stayed: its heading, its merge note, a pointer near
  the top of this file, its `test:family` entry, and two code comments.
- Nine were this change's.
  - Six moved to `10cl`: the heading, the note under Stage 10z, two
    check-script comments, the bug harness's header, and the "in full" link
    comment.
  - Three are in the fifth merge note above. They stay as that merge's record,
    and one of them now reads "this section became".

**THE CHECK SCRIPT CONFLICTED TWICE, AND BOTH WERE UNIONS.**

- **The two new check blocks.** Both sides had added one at the same spot, and
  the two blocks were halves of one construct. Stacking them would have left
  #88's doc comment without its opener. So this change's block closes its array,
  and #88's opens its own comment.
- **The `ctx` literal.** It is now main's line plus this change's four keys: 99
  keys in all, none duplicated, each declared.

Measured line by line, the merged file carries every one of #88's +421/−1 lines.
The only other changes are those two comment renames and the `ctx` line.

**#88 CHANGED NOTHING THIS CHANGE TOUCHES.**

- **The company page.** Its only link to the Monitor is the breadcrumb, which
  names the page rather than a view.
- **Its checks.** None of them walks a `/monitor` address.
- **The bug harness.** The files it patches are unchanged by #88.

So the bug pass above stands on this tree, and the full sweep below is its
control. That is the reasoning #88's own record gives for #92's merge.

On the tree merged with #88 (main `37c93ba`), `build`, `tsc`, `test:ingest`
(golden 140 passed, 2 not checked, 0 blocked), `test:family` (#88's
`heldThrough.test.ts` among the suites) and `check:family` **92/0** all passed,
and `npm run build-book` was byte-identical. The full sweep had started when #85
landed. It was stopped rather than finished, because that tree would not ship.

#### …and a seventh time: #85 took `10cl`

**#85 landed while that sweep ran.** It gives Private Market and Morning CIO an
add-tile card, and makes the Capital Call cells say why saving is off. It took
`10cl`, having itself collided with #88 first. Main keeps it, and this section is
**`10cm`**. Git marked the conflict in this file, and #85's section comes first.
The headings differ from main's tip by `10cm` alone, main's ten historical
duplicates are unchanged, and no prose on main names a letter after `10cl`.

**THIRTY-ONE LINES NAMED `10cl` AFTER THE MERGE, AND EACH WAS PLACED BEFORE ANY
MOVED.** Each was checked against both sides' own copies of its file.

- Twenty-two are #85's, and they stayed: its heading and merge note, four notes
  it left in earlier sections, thirteen check-script comments, two in its bug
  harness, and one in `Kpi.tsx`.
- Nine were this change's.
  - Six moved to `10cm`: the heading, the note under Stage 10z, two
    check-script comments, the bug harness's header, and the "in full" link
    comment.
  - Three are in the sixth merge note above. They stay as that merge's record,
    and one of them now reads "this section became".

**THE CHECK SCRIPT CONFLICTED ON THE `ctx` LITERAL ONLY.** It is main's line plus
this change's four keys: 101 keys in all (#85 added `tileAdd` and `callOff`), none
duplicated, each declared. Measured line by line, the merged file carries every
one of #85's +358/−7 lines. The only other changes are the two comment renames
and the `ctx` line. #85's other ten files merged without a marker and are
byte-identical to main's.

**#85 CHANGED NOTHING THIS CHANGE TOUCHES.** Its pages are Private Market and
Morning CIO, and none of its checks walks a `/monitor` address. The files this
change's bug harness patches are unchanged by it, so the bug pass on the #92
tree stands. The full sweep below is its control on the tree that ships.

Every result here is from the tree that ships, this change merged with #85
(main `80bc896`), and was run again there rather than carried across:

- `build` and `tsc` pass.
- `test:ingest` passes: the same eleven suites, golden 140 passed, 2 not
  checked, 0 blocked.
- `test:family` exits 0, with #88's and #85's suites among those it runs.
- `npm run build-book` regenerates the book byte-identically, and the result
  equals main's own copies.
- `check:family` is **92 passed, 0 failed**.
- `check:pages` is **258 combinations clean**, with no finding. That is main's
  routes plus this change's one new route across both themes, measured rather
  than added up. The 10 NOT CHECKED lines are main's evidenced abstentions
  across four claims, and none is this change's.
- CI (`build`) and the Cloudflare preview pass on the pushed merge.

### Stage 10cn — THE POSITION PAGE IS FIVE TABS, AND IT IS THE SAME FIVE ON EVERY HOLDING

*"When I come inside a portfolio position it's an unbelievable bad UI experience —
please fix it all by making top sub tabs like we have done for others and not
having a long page I have to scroll, and remove what is not necessary and
consolidate what can be consolidated so it's one clean template for all."* — sent
with a screenshot of Clean Max Enviro Energy Solutions' page.

**MEASURED BEFORE ANYTHING MOVED, at the sweep's 1500×1000:** a company page was
**1,496px taller than its window** and a fund's 774px. Top to bottom it was a
header, six tiles, the account table, a folded tax card, the quantity account,
the transaction tape, the price chart, the family's own targets, a ratio table, a
research card, a trading-range card, an insider table and a paragraph describing
the cards above it. A fund's page was a different stack again, so no two holdings
read the same way — which is the "one template" half of the ask.

#### Five tabs, at the right-hand end of the name's line

| Tab | Answers | For a fund or a cash line |
| --- | --- | --- |
| **Position** | who holds it, through which account, at what cost and mark | the same table |
| **Transactions** | the tax split and purchase dates, the depository's quantity account, the dated buys and sells | the same |
| **Price & returns** | a company's price history and returns table, and under it the dividend-inclusive return (#84's card) | a mutual fund's AMFI NAV and its own returns; an AIF or a cash line states the absence once |
| **Research** | one Company research card — Financials, Cash flow, Ratios, Street estimates, Documents, Concalls, Insider deals | a mutual fund's disclosed holdings — never an arbitrage fund's, which is hedged — and one line saying company research does not apply, and that a liquid or arbitrage fund is Cash |
| **My targets** | the family's own target price, fair value, levels, alerts and notes | the same |

**THE HEADER AND THE SIX TILES ARE OUTSIDE THE PANEL, AND ONLY THE PANEL
SCROLLS** — Morning CIO's construction (Stage 10bj), for its reason: what was asked
is that the headline and the tiles stop moving. Measured after, on every one of
the 35 stock routes the sweep walks: document scroll 0, `<main>` scroll 0. The panel is
allowed to scroll inside itself and is deliberately not asserted not to: a tab
taller than the window must still reach its content. The fixed-height layout is
`lg:` only — below it the page flows as a phone needs.

**A TAB THAT HAS NO ANSWER FOR THIS KIND OF HOLDING STILL OPENS, AND SAYS SO ONCE.**
Hiding it would make the template differ by asset class, which is exactly what was
reported. It is `?tab=` like every other view, so a tab is a link, Back steps
between tabs and `check:pages` reaches each by URL; the first is param-free. The
tab labels are deliberately not the card headings they open, so a check struck on
a heading cannot be satisfied by the tab strip.

#### What went, what merged, and the one thing that was lost

- **The CMP headline and the "Change today" tile are ONE price tile** — the
  figure, today's move beside it where a live quote carries one, and one short
  line saying WHICH mark this is. The line took the old caption's five states and
  gained two: a cash line ("a balance, as the statement prints it") and a fund
  with no published daily NAV ("the NAV on the statement of …"), where "no NSE
  symbol resolves" was true and beside the point. Each line is a few words; the
  full sentence is the hover. **A NAV's move is in the line, never the tile's
  arrow**: it is the scheme's move on its own publication date, and an arrow
  beside a price reads as today's.
- **The Trading range card is gone.** Its 52-week high and low are two columns of
  the returns table on the same tab, struck from the same daily closes since
  Upstox became the quote feed (Stage 10br). **What that loses, stated rather than
  glossed:** where the muns quote supplied the exchange's own INTRADAY 52-week
  extremes, the card showed those rather than the closes; and it drew a bar of
  where today's price sat in the range. Neither is on the page now.
- **Ratio analysis and Insider & bulk deals are sub-tabs of the Company research
  card**, each fetched when opened. `CompanyResearchPreview` is DELETED — the
  trading range and a paragraph pointing at "the cards above" were the rest of
  it — and its insider table is `InsiderDeals`, keeping the same table-view
  storage key so a reader's own column order survives the move. The decided
  absence it recorded (segments, operating KPIs, value chain, calendar: no
  endpoint serves them) is carried in that file's header. `RatioTable` lost its
  stand-alone card mode with its last caller rather than keeping a mode nothing
  selects.
- **The tax card is on Transactions** — *"tax maybe just make it a click"* — beside
  the dated buys its purchase dates come from. Its "Weight in book" row went: the
  Holding value tile states the same figure on every tab.
- **The Basis column went.** It printed LT or ST per row from a lot register one
  account in this book issues — a dash on 368 of 371 positions — and the split it
  summarised is the tax card's, cost by cost.
- **The Total row draws only over two or more rows.** A total of one row is the
  row again, and the tiles carry the same four figures — the Polycab table's rule.
- **The route pill folded into the bucket pill's hover** (the bucket already names
  the route for every holding here, and every account row states it again), and
  the provider's own sector wording into the sector chip's hover.
- **The mandate line under the name is ONE line.** Up to two mandates it links
  each; past two it is a count, because a cash sleeve sits in all ten of this
  book's mandates and ten links was a five-line wall above the figures. Every
  mandate is still one click away — each account row links its own.
- **A mutual fund's scheme card is two halves on two tabs** (`FundLookthrough`
  takes a `part`): its NAV, the NAV's move and its own returns are its PRICE; what
  it holds is what a reader researches it for.
- **The research card's sub-tabs are the page tabs' size**, not a size larger.

#### Four corrections the rewrite found, none of them asked for and each on this page

- **THE SECTOR CHIP READ `rows[0].sector` — the statement and nothing else.** A
  depository prints no industry, so every share the family bought in its own
  demat said "Unclassified" here — **Clean Max in the family's own screenshot** —
  while Sector Composition, Family & Entities and the Monitor's stock axis all
  placed it. It reads `companySectorIndex` now, the same three tiers, and the hover
  names which tier placed it. Clean Max reads Utilities.
- **A CASH LINE WORE "Cash" AS A SECTOR PILL** beside the Cash bucket — a GICS
  claim nobody made. It carries no sector chip, and its Unrealised P&L tile says
  why it is flat in the tile (§2): *"a balance — its cost and value are one
  amount"*, worded that way because the book's cash rows net to **₹0.11** of
  paise rounding and "no P&L" would overstate it.
- **A NAME NO STATEMENT HOLDS PRINTED "₹0 · 0.0% of book" AND "0 held"** — summing
  an EMPTY collection, which is the founding rule broken in its most literal form.
  Pre-existing; the tiles are absent with "no current holding" now, and Avg cost
  and P&L say that rather than "no statement reports a cost", which would send a
  reader looking. A holding its fund redeemed to nil still HAS rows and keeps its
  measured zero.
- **"Plan — these fill … columns on Portfolio Monitor's plan view."** That view
  was REMOVED at the family's request (the `PublicDashboardView` note), so the My
  targets panel was sending a reader to look for a column that does not exist. It
  says what the fields are now. And four `useMemo` calls that sat AFTER the page's
  early return — a hooks-order error waiting for a render on which the book had
  not loaded — moved above it.

#### The checks: the same six claims on every holding, and every card on its tab

**NOT ONE CLAIM ABOUT THE ASK CAN BE STRUCK ON PROSE**: the page renders the same
words whether the research card is on its own tab or under the price chart on one
long page. `stockTabChecks(expected)` is spread into EVERY stock route — a
company's, a mutual fund's, an AIF's, a cash line's — and reads the control, the
panel's own handles (`data-stock-tab-key`, `data-stock-panel`,
`data-stock-section`) and bounding boxes: the same five tabs in order; this
address's tab lit and only it; exactly one tab's content in the DOM; the page not
scrolling; the six tiles above the panel; the tabs at the right-hand end of the
name's line.

**EVERY CLAIM FOLLOWED ITS CARD TO ITS TAB, and none was softened on the way** — a
check that stops running because its card moved behind a tab is a check that
silently stopped. The quantity-account routes (`stock-qty`, `-pledge`, `-unmoved`)
walk `?tab=activity` with `stockActivityChecks` (the tax card and its reasons, the
dated record, and the account table ABSENT); `stock-fund` walks the AIF's Research
tab and `stock-fund-market` its Price & returns; `stock-mf-lookthrough` walks the
fund's NAV half and the new `stock-mf-holdings` its holdings, each asserting it
draws ITS half and not the other; `stock-market`, `stock-research`,
`stock-targets` and `stock-activity` walk the company's other four tabs.
`stock-research` CLICKS Ratios, Insider deals and Financials in turn and reads each
panel by its own handle — a sub-tab that lights and draws nothing renders a card
every text check reads as fine.

**AND TWO CLAIMS NEEDED NEW SUBJECTS.** "The Total row carries the agreed mark"
was struck on Aditya Birla Capital, which one account holds — so it has no Total
row now, and `stock` asserts THAT instead while `stock-cmp-agree` (the largest
holding several statements mark alike, derived as `CMP_BOOK.agreedKey`) carries
the original claim. And `stock-mandates-many` (`MANY_MANDATES`, derived) walks
the holding the most mandates hold — cash, on this book — for the count, the one
line, every mandate linked from its row, and the cash line's missing sector and
its P&L reason, with `stock-cash-market` for its Price & returns tab.

**WHAT NO ROUTE WALKS, stated:** the fully-exited branch. Its only subjects are
keys the dated ledger carries and no statement holds, and deriving one needs the
audit archive rather than `glowData.ts`; the fix to its tiles was verified by
screenshot.

`check:family` opens My targets by its key before reading the Investment tools
panel, and a missing tab is a finding — the panel then has no way to be reached.

#### The bug pass

`scripts/dev/stock-tabs-bug.sh` puts twenty-seven bugs back one at a time,
restoring by copy on a trap and rebuilding on the way out, after a no-patch
control that came back clean. It began at seventeen; each merge that moved a card
or a claim onto this page added the cases for it. It was run whole twice. **On
the tree merged with #87 and #89**, over the 27 stock routes walked then,
twenty-six fired and one came back SWEEP CLEAN, which is a finding of its own
(below). **On the tree merged with #88**, over the 35 stock routes walked now,
the control was clean and all twenty-seven fired, none of them NOT A RESULT. The
table is that second run.

| Bug put back | Fires |
| --- | --- |
| every tab's content drawn at once — the long page back | "exactly one tab's content is drawn" on **all 35 routes**, with each tab's own absence claims beside it (the tax card, the account table, the one research card, a fund's two halves, #84's card, an arbitrage fund's look-through) |
| the tabs beside the name rather than at the line's right-hand end | the geometry check, on all 35 |
| the panel no longer scrolls inside itself, so the page scrolls | "the page itself does not scroll" on the nine routes whose tab is taller than the window — see below |
| the tabs reordered, so the page opens on Research | the order check on all 35, the lit-tab and one-section checks on 17, every Position-tab claim on the twelve position routes, and #88's route-tab claims on its four |
| a tile dropped from the strip | "the six tiles are on every tab" on 31 routes, and the price tile's reason. The other four walk the company held only inside funds, whose page draws no tiles at all (#88) |
| the tax card drawn nowhere | the tax-card check on the five Transactions routes that walk a holding of the family's own |
| a tax figure's dash loses its reason | the same check, on all five — it is struck PER CELL, so a card of the right shape cannot pass for one that says why |
| the Ratios sub-tab wired to nothing · the ratio panel under every sub-tab | the research walk, each |
| the Trading range card back beside the returns table | two checks on `stock-market` |
| every mandate listed under the name | the one-line mandate count on `stock-mandates-many` |
| a cash line's sector chip back | "a cash line carries no sector chip" |
| a Total row under a single account's row | the footer check on three routes, and the one-account claim on `stock` |
| the plan-view sentence back on My targets | `stock-targets` |
| a fund's holdings on its Price & returns tab too | "this tab draws the scheme's price half, not its holdings", on the mutual fund and on the arbitrage fund |
| the price tile refusing a mark every statement agrees on | three checks on three routes |
| an AIF folio's price tab drawing a returns table | "an AIF folio's price tab says there is no market price, and why" |
| #84's dividend-inclusive card back under the account table | two checks: it is off Position, and it is gone from under the returns table |
| #84's card on the Position tab as well | "the dividend-inclusive return card is on the Price & returns tab, not this one" |
| an arbitrage fund's hedged holdings drawn on its Research tab | "…and draws no look-through: a hedged book of long shares is not this family's stock" |
| an arbitrage fund's own NAV half hidden with its holdings | the price-half check and the unseen-scheme check, on `stock-arbitrage-market` |
| a scheme the fund store never saw told the store's report names it | the unseen-scheme check |
| the Research tab no longer says an arbitrage fund is Cash | "an arbitrage fund's own page says it is Cash" |
| #76's quantity table stops marking the account that sold out | the sold-out check, on `stock-sold-elsewhere` |
| **the return back to the survivors-only figure, not FIFO** | **nothing, on the #87 tree — see below**; the tile's FIFO check on `stock-fifo` since |
| #78's XIRR line dropped from a whole folio's row | the XIRR check on three routes, and the folio check on `stock-capital` |
| the page's name back in the reading face | #87's title check, on all 35 |

**THE ONE THAT CAME BACK CLEAN FOUND A GAP IN THE CHECKS, NOT IN THE PAGE.** It
puts back the return #80 replaced — the unrealised gain over the cost of what is
still held — and no route noticed, because every stock route walked a holding
that had sold nothing, where that formula and FIFO print the same number. A check
on the tile could not tell which formula drew it. `stock-fifo` walks the holding
where the two differ most (`FIFO_STOCK`, derived from the book: Bajaj Auto,
**▲ 32.3%** against the **30.5%** the old formula prints) and requires both the
Unrealised P&L tile's return and the Total row's HPR to be FIFO's — re-expressed
in the checker from each position's `costBasis`, `realizedPnL` and
`costOfUnitsSold`, never imported from `fifo.ts`, which is the code under test.
The Total row's cell carries `data-stock-foot-return` for it. Re-run with
`CASES=25` on that tree, the case fires both. **On the #88 tree it fires the
tile's check alone**, and that is correct: #88's footer strikes its FIFO return
in `measuredTotals` rather than taking the tile's figure, so the patch no longer
reaches the Total row. The Total row's FIFO claim still runs on `stock-fifo`, and
#88's own harness holds that footer to the units that report a cost.

**THE SCROLL CHECK FIRES ON NINE ROUTES, NOT ALL OF THEM, AND THAT IS ITS SUBJECT
RATHER THAN A GAP.** On the others the tab's content fits the window, so the page
does not scroll with or without the inner scroller; the claim can only be broken
where there is more content than room. It fired on four routes on the #87 tree,
and on nine on the #88 tree: #88's route bands and fund lines made more Position
tabs taller than the window. The nine are `stock`, `stock-mf-holdings`,
`stock-qty`, `stock-cagr`, `stock-fifo`, `stock-mandates-many`, `stock-held`,
`stock-held-funds` and `stock-funds-only`.

**AND TWO OLDER HARNESSES PATCH THIS PAGE, SO BOTH WERE RE-CHECKED RATHER THAN
TRUSTED.** `carried-cost-bug.sh` (Stage 10bv) finds both of its anchors in the
new page. `cmp-bug.sh` (Stage 10bm) did not: six of its ten patches pointed at
code the rewrite moved, so each would have reported NOT A RESULT — a harness that
cannot apply its bug proves nothing, however clean its run looks. Its anchors are
the new page's now, every patch was dry-run against a copy of it, and its route
list dropped `stock-cmp-derived` (retired at Stage 10bn) and gained
`stock-cmp-agree` and `stock-cmp-nav`. Re-run on the merged tree, **eight of its ten
cases fire.** Two are clean, and neither is this change's doing: case 3 (a cell
deriving value ÷ units) has been unable to fire since Stage 10bn retired
`stock-cmp-derived` — on this book value ÷ units IS the mark on every row the
page draws, the NAV overlay making it so by construction — and case 9 (the tile
dating the mark to the first row rather than the marked one) has NO SUBJECT:
measured, not one of 213 securities has an unmarked first row and a marked later
one. Both are written down here rather than left to be rediscovered as a clean
run that looks like a pass. Re-run on the tree merged with #88, whose row
function now draws the price cell it patches, the result is the same: the
control is clean, the same eight cases fire, and cases 3 and 9 are clean for the
same two reasons.

#### Merged with main ten times, and the letter is `10cn`

**#79 (Stage 10bx, one master table each) conflicted in `check-pages.mjs`**: a
walk comment and the `ctx` literal. Resolved as a union — main's line plus this
branch's `stockPage` — with main's `schemeCalls` NOT carried, because main
deleted the probe that declared it. **#83 (Stage 10bz, Ask Muns off the top bar)
merged without a marker**, which is when this file says to check by hand: the
literal is exactly main's 85 keys plus `stockPage`, none duplicated, and every
key resolving to a declaration. Neither PR touched the page's own files; beyond
`check-pages.mjs`, the one overlap was `check-family-inputs.mjs` (#79), which kept
both sides.

**THE LETTER SKIPPED TWO, ON PURPOSE, AND THAT DID NOT HOLD — see below.**
Main's Stage 10bx names `10by` as the Portfolio Monitor's stage and #83 took
`10bz` past it; of the open PRs then, #81 carried a `10by` section and #80 a
`10ca`, so this section was written as `10cb` to keep clear of both. The nine
pointers it adds to older passages — Conventions, and Stages 10ap, 10ba, 10bm,
10bn, 10br, 10c, 10j (*"the complaint came back"*) and 10k — all named the
letter, which is what made its later move one search and one classification.

`build` · `tsc` · `test:ingest` · `test:family` · `check:family` **87/0** ·
`check:pages` **234 combinations clean** — main's 216 plus this change's nine new
routes in both themes — with the same nine evidenced abstentions across the same
five claims main records and not one of this change's own. MEASURED ON THE TREE
MERGED WITH #83, not carried across. `test:ingest`: golden 140 passed, 2 not
checked, 0 blocked. `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` BYTE-IDENTICALLY: nothing here touches the ingest.

#### …and a third time, when eight PRs landed and three of them had edited this page

#80 (every return FIFO), #81 (NAV benchmarks), #82 (KPI tiles), #84 (corporate
actions), #76 (one company, one name), #77 (the transactions record), #74
(arbitrage is cash) and a Polycab refresh all merged while this waited. **Three of
them had edited the stock page — inside the long single page this change had
taken apart**, so the page could not be merged hunk by hunk. The resolution took
THIS branch's page and re-applied main's eleven edits to it, one at a time, then
checked that every line main added is present or deliberately reworded: the only
lines not verbatim are the ones that moved into a tab or into the price tile.

| Main's change | On the single page | Now |
| --- | --- | --- |
| #80 — a holding's return is FIFO: unrealised plus realised, over every rupee deployed | the Unrealised P&L tile, the Total row | the same tile and row |
| #74 — a liquid or arbitrage fund is Cash, and an arbitrage fund is not looked through | the research-absence card; the whole scheme card hidden | the Research tab says Cash; **only the holdings half** is hidden |
| #74 — units a depository reports on an account that sent no holding statement | the NAV caption and the CMP cell's hover | the price tile's hover and the CMP cell's hover |
| #84 — the dividend-inclusive "Corporate actions & total return" card | under the account table | Price & returns, under the returns table |
| #76 — the quantity account marks an account that sold out | beside the dated trades | the same, on the Transactions tab |

**THE ONE PLACE THIS PAGE DEPARTS FROM WHAT #74 DREW.** On the single page the
scheme card was one card — NAV, returns and holdings together — so hiding an
arbitrage fund's holdings hid its NAV with them. #74's reason is about what the
fund HOLDS: long shares hedged by short futures, which read as the family's stock
would print exposure nobody carries. It says nothing against the fund's own
published price, so on two tabs only the half the reason is about goes
(`lookThroughHoldings`), and the Price & returns tab keeps the scheme's NAV half.

**AND KEEPING IT SURFACED A SENTENCE THAT WAS FALSE.** The three arbitrage funds
reach the book at runtime, as a depository's closing units on an account that
sent no holding statement, so the fund store was never built with them — and the
card's absence ended "docs/FUND-LOOKTHROUGH.md names every one", about a report
that does not mention them. `loadLookthrough` now tells a scheme the store never
saw (`unseen`: neither matched nor named among the unmatched) from one it failed
to match, and the card says the store has no entry for it. Measured over every
fund holding in the book and every cash-equivalent key: those three funds are the
only ones in that state today, and the fourth unseen key (Axis Liquid) is a cash
line inside a mandate whose page never draws a scheme card.

**THE CORPORATE-ACTIONS CARD SITS WITH THE PRICE RETURNS FOR A REASON #84 WROTE
ITSELF**: it retitled the returns table "Price history & returns · excludes
dividends", and this card is the other half of that sentence. #84's own
regression, `scripts/dev/check-corporate-actions.mjs` (not in CI), opened the
stock page and waited for the card on the default tab; it opens `?tab=market`
now, and passes in both themes.

**MAIN'S CHECKS FOLLOWED THEIR SUBJECTS TO THEIR TABS**, because a claim left on
a tab that does not draw its subject reports NOT CHECKED over a page that has
lost it:

- `stock-arbitrage` is split in two. Its mark and the caption naming AMFI stay on
  Position; its class sentence and the refusal to look through move to
  `stock-arbitrage-research`, and "draws no look-through" is struck on the fund
  card's own handle — the old match was on a title the card no longer has, so
  it would have passed by matching nothing.
- `stock-arbitrage-market` is new: the price half this merge kept, and the
  corrected absence.
- `stock-sold-elsewhere` walks the Transactions tab, where the quantity account
  is drawn.
- `stock-market` asserts the dividend-inclusive card is under the price card and
  nothing else is; `stock` asserts it is not on Position as well.

**THE LETTER MOVED AGAIN, AND THE SKIP DID NOT SAVE IT.** This section skipped
`10by` and `10ca` on purpose because #81 and #80 carried them; #82 then merged
under `10cb` first, and #76, #77 and #74 took `10cc` to `10ce`. Main keeps all of
them, and this section became **`10cf`** — until the fourth merge, below. Of the
22 lines naming `10cb` after the
merge, each was classified by whether it exists on main or on this branch —
**none is on both**: 10 are main's (its heading, two pointers and seven lines of
merge notes across its own sections) and stay; 12 are this branch's — nine
pointers moved, with the one comment in `cmp-bug.sh`, and the three in this
section's own merge note are rewritten above.
The stage headings then differed from main's by `10cf` alone, main's ten
historical duplicates unchanged.

**THE `ctx` LITERAL CONFLICTED**, and was resolved as the union of main's 92
keys and this branch's `stockPage` — 93, none duplicated, every key's root
declared — with main's two changed values (`tileMenu` and `tilePick`, now per
route) taken as main wrote them.

**THE GENERATED FILES WERE CHECKED, NOT TRUSTED.** Neither side's page work
touches the ingest: `glowData.ts` and `docs/BOOK-REPORT.md` are main's byte for
byte, and `build-book` regenerates both byte-identically.

`build` · `tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` exit 0 · `check:family` **85/2** · `check:pages` over **266
combinations** with **3 findings, none of them this change's**, all read out of
the log by name. The two `check:family` failures are the Extras-menu checks,
which fail identically on main: #84 added a fifth page (`/corporate-actions`) to
a dropdown the check still counts as four. The three sweep findings are the
Private Market routes (`private-market`, `-tiles`, `-returns`), failing the
fund-return invariants main's own Stage 10cc and 10ce notes record failing on
main: #80 made a fund's HPR FIFO, and the sweep's re-expression (#72's) still
strikes it as value against cost. Both are other stages' checks, named here so
they are not mistaken for this branch's, and neither is rewritten by a merge.
*(Both fixed at Stage 10cj, by #92 — see the seventh merge below.)*
The ten NOT CHECKED lines are all main's evidenced abstentions: six Morning CIO
routes (every KPI tile carries a figure), two Private Market fund routes (every
private holding reports a cost), #79's redeemed private account (none is) and
the not-found drill-down's crumb. **Not one stock route abstains or fails.**

#### …and a fourth time: #78 took `10cf`, and put an XIRR line in the account table

**#78 — XIRR where a row is a whole account on a dated record — landed while the
third merge's full sweep was running, and took `10cf`**, the letter this section
had just settled on. It was caught before the PR opened, by fetching main and
comparing its stage headings with this branch's; git marked the conflict too,
because both sections sat after `10ce`. Main keeps `10cf`; this section became
**`10cg`** — until the fifth merge, below. Of the 18 lines naming `10cf` after the
merge, none is on both sides: 6 are #78's (its heading, its two Layout pointers
and three lines of its own letter note) and stay; 12 are this branch's — nine
pointers moved with it, and the three in this section's merge notes are
rewritten above. Two code comments moved with them (`check-corporate-actions.mjs`
and `cmp-bug.sh`); #78's own twelve in `check-pages.mjs` and its new files stay.

**#78 EDITED THE STOCK PAGE, INSIDE THE LONG SINGLE PAGE AGAIN**, so its changes
were re-applied to the tabbed one rather than merged hunk by hunk: the
`useDatedCapital` hook, each account row's dated capital (`datedCap.behind`), and
the Return cell's `data-capital` with the capital handed to `ReturnCells` — so a
row that is a WHOLE folio on a dated record shows its money-weighted return
beside the holding-period one, on the Position tab's account table. `ReturnCells`
and the column's heading auto-merged. Every line #78 added to the page was then
checked to be present in the merged file, line by line. **The hook sits beside
the tab hook, before the page's early return** — the hooks-order rule this
rewrite already applied to four `useMemo` calls.

**ITS CHECK LANDED WHERE ITS SUBJECT IS DRAWN.** #78's XIRR claim is in
`stockLayoutChecks`, the account table's own claims, which on this branch run
only on routes that walk the Position tab — so it is struck where the table is
drawn and nowhere it is correctly absent. Main's *"the tax basis is behind a click
and starts closed"* is superseded: the tax card is a tab away now, asserted by
`stockActivityChecks` on every Transactions route. #78's own route,
`stock-capital`, carries `stockTabChecks("position")` like every one of the 27
stock routes, and joins the bug harness's route list. **The `ctx` literal did not
change: #78 added no probe key**, and the union is still 93, none duplicated,
every root declared.

**THE GENERATED FILES WERE REGENERATED, NOT MERGED.** #78 changed `build-book`
and `glowData.ts`; `build-book` over the merged builder and archive reproduces
`glowData.ts` and `docs/BOOK-REPORT.md` byte for byte, and both equal main's —
this change still touches nothing the book is built from.

#### …and a fifth time: #87 and #89 took `10cg` and `10ch` while the #78 sweep ran

**#87 — Glow Central Research's fonts and colours — and #89 — the Portfolio
Monitor's own notes — landed while the full sweep on the #78 tree was still
running**, and took `10cg` and `10ch`. That sweep finished clean on its own tree
— 268 combinations, with only the three Private Market findings main carries —
and was out of date the moment it finished, so it is recorded here as the
measurement of a tree that never shipped rather than as this change's result.
Main keeps both letters, and this section became **`10ci`** — until the sixth
merge, below. Of the lines naming `10cg` after the merge, none is on both sides.
Main's heading, its own letter note, #89's pointer to it and six of #87's code
comments stay. This branch's nine pointers moved, with its comments in
`check-corporate-actions.mjs` and `cmp-bug.sh`, and three lines of this
section's own history are rewritten above.

**#87 EDITED THE OLD SINGLE PAGE, THE THIRD PR IN A ROW TO DO SO**, so its three
changes to it were re-applied to the tabbed page rather than merged:

- **The name is in the display face.** #87 checks, on every route and by
  computed style, that the page title asks for Plus Jakarta Sans. This page
  draws its own `<h1>` rather than `PageHeader`'s, so the class had to be written
  here — at `PageHeader`'s own `text-xl`, which this page already matched,
  rather than the `text-2xl` #87 gave the old page's name. Without it, every
  stock route fails #87's own title check.
- **The price tile's figure is in the display face**, as #87 made the old page's
  CMP headline: the `mono` class came off it, so it takes the tile's own face.
  The Avg cost tile keeps `mono`, exactly as main's does.
- **The Managed-by cell already wrapped here**, for its own reason — a mandate's
  long strategy name — and with a width cap #87's version does not have. #87
  reached the same cell for a second reason, the fallback face's wider headings,
  and the cell's comment now names both.

**MAIN'S LOOK HARNESS NEEDED ONE ANCHOR MOVED.** `scripts/dev/look-bug.sh` case 9
patched that cell at the old page's class list, which this page's cell does not
match, so it would have reported NOT A RESULT. It now patches the tabbed page's
cell and also walks `stock-mandates-many` — the holding every mandate carries,
whose account table prints V.E.C's long strategy name. Run whole on the tree
merged with #87 and #89, the control was clean in both themes and all nine cases
fired. Case 9 fires *the position table fits its card* on `stock-mandates-many`
and not on `stock-carried`, whose table fits without the wrap now that the Basis
column is gone.

**AND THIS PAGE'S OWN HARNESS GAINED A CASE**, the twenty-seventh, because #87's
harness patches `PageHeader` alone and nothing else would notice this page's name
falling back to Inter. It fires on all 27 routes: *the page title is set in
Plus Jakarta Sans — it asks for Inter*.

The `ctx` literal did not change — #87 and #89 added no probe key — and is still
93 keys, the exact union, none duplicated, every root declared. `build-book`
regenerates `glowData.ts` and `docs/BOOK-REPORT.md` byte for byte, and both equal
main's.

`build` · `tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` 0 failed · `check:family` **85/2** — main's two Extras-menu checks ·
`check:pages` over **268 combinations** with **3 findings, none of them this
change's**: the three Private Market routes, 8 invariants across the same five
checks #87's own notes record failing on main. The ten NOT CHECKED lines are
main's evidenced abstentions, and not one stock route fails or abstains. The
count is the #78 tree's again, because #87 and #89 add no route; it matches
only because the sweep was run again.

#### …and a sixth time: #90 took `10ci`, and shortened the notes this page carries

**#90 — the notes around every table cut to one short line, the rest in a hover
— landed while the #87 tree's bug pass was running, and took `10ci`.** Main keeps
it; this section became **`10cj`** — until the seventh merge, below. Of the lines
naming `10ci` after the merge, eleven were this branch's and moved; main's two
pointers (to `FundExposure` and `DematElsewhere`) stay. **Three code comments were
missed** — in `check-corporate-actions.mjs`, `cmp-bug.sh` and `look-bug.sh` — and
went on naming `10ci` for this section, which by then meant #90's, until the
seventh merge's search found them.

**#90 EDITED THE OLD SINGLE PAGE, THE FOURTH PR IN A ROW TO DO SO**, so its four
shortenings were re-applied to the tabbed one:

- the mandate line under the name stays one line, and its reasoning — who owns
  the shares, who decides them, where the mandate's other holdings are — is that
  line's hover;
- a holding two statements both report says so in ONE line (*"One holding,
  reported on each of the N statements listed — the rows add to ₹X, the Total
  counts it once at ₹Y"*), the rest in its hover;
- the empty transaction history keeps its first sentence and puts the rest in a
  hover;
- the Research tab's not-a-company card is two short lines, each with its hover.

**AND ONE OF #90's OWN CHECKS CAUGHT A SENTENCE THIS BRANCH HAD WRITTEN.** The
Research card said *"What the scheme holds is shown above"* on every fund — false
on Liquid BeES and the metal ETFs, which have no disclosure to show, and exactly
what #90's fund-notice check forbids. It is conditional now: an arbitrage fund
says what it holds is not drawn and why; a scheme whose disclosure resolves says
it is shown above; an AIF says it publishes no such disclosure. And the fund
card's absence said the returns were "above", which on this page are a tab away,
so it names the Price & returns tab.

**#90's RESEARCH-POINTER CHECK HAD NO SUBJECT HERE, SO IT INVERTED.** It asserted
the page's pointer to the research cards on `stock`; the pointer lived in
`CompanyResearchPreview`, which this branch deleted, and every panel it pointed at
is a sub-tab of the one research card. `stock-research` asserts it stays gone.

**#90's GUARD HOLDS ON THE TABBED PAGE, AND WAS SHOWN TO BITE THERE.** On every
route it checks that a table card's subtitle is short, that the text under its
tables is at most two short lines, and that no cell carries a paragraph. Every
stock route passes. Putting two long notes back fires it on `stock-aif-dual`
(329 characters) and `stock-mf-holdings` (365).

**THE `ctx` LITERAL** is main's 94 keys plus `stockPage` — 95, none duplicated,
every one declared. `fundExposure` did not come across: #90 deleted the probe that
declared it, with `FundExposure.tsx`.

**AND THIS IS WHERE THE BUG PASS'S ONE GAP WAS CLOSED** — the survivors-only
return (above), which `stock-fifo` now walks.

#### …and a seventh time: #92 took `10cj`, and fixed the checks these notes kept naming

**#92 — seven checks that had failed on a correct page — landed while the #90
merge was being verified, and took `10cj`.** It was caught the way this file says
to catch it: by fetching main before pushing and comparing its stage headings
with this branch's. Git marked the conflict too, because both sections followed
`10ci`. Main keeps `10cj`; this section became **`10ck`** — until the eighth
merge, below. Of the lines naming `10cj`
after the merge, none is on both sides: eleven are this branch's and moved, and
every one #92 wrote stays — including its *"(Moved at / Both fixed at Stage
10cj)"* notes in other stages' records. The three code comments the sixth merge
missed moved with them.

**#92 FIXED WHAT THIS SECTION'S MERGE NOTES HAD NAMED AS MAIN'S**: the three
Private Market routes (the sweep's re-expression of a fund's return is FIFO now)
and the two Extras-menu rows (Extras holds five pages). It touched no file of the
position page. `check-family-inputs.mjs` auto-merged and was read by hand: #92's
five-page Extras list and this branch's My targets walk are both there. The `ctx`
literal auto-merged too and was checked the same way: 95 keys, the exact union —
#92 added none — none duplicated, every one declared.

`build` · `tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` 0 failed · `build-book` byte-identical, equal to main's ·
`check:family` **90/0** — the first run on this branch with no failure excused
as main's · `check:pages` **270 combinations clean**: the #87 tree's 268 plus
`stock-fifo` in both themes. The ten NOT CHECKED lines are all main's evidenced
abstentions, and not one stock route fails or abstains.

#### …and an eighth time: #88 took `10ck`, and gave the account table a tab per route

**#88 — every way a company is held: Direct, PMS managers and Mutual funds as
tabs, and the funds as line items — landed fourteen minutes after this branch's
last push, while the PR waited on its checks, and took `10ck`.** Main keeps it;
this section became **`10cl`** — until the ninth merge, below. Git marked the
conflict, because both sections sat after `10cj`. Of the lines naming `10ck`
after the merge, none is on both sides. This branch's nine pointers moved —
Conventions, and Stages 10ap, 10ba, 10bm, 10bn, 10br, 10c, 10j and 10k — with
its comments in `check-corporate-actions.mjs`, `cmp-bug.sh` and `look-bug.sh`.
#88's heading, its own letter note, its Layout and Build pointers and the header
of its harness stay. One note was added to #88's own section, saying its route
tabs now sit inside this page's Position tab.

**#88 EDITED THE OLD SINGLE PAGE, THE FIFTH PR IN A ROW TO DO SO, AND IT IS THE
LARGEST.** It gave the account table a tab per route, drew the family's share
inside each fund as a row, and gave a company held only inside funds a page of
its own. Each was re-applied to the tabbed page rather than merged hunk by hunk:

- **The route tabs belong to the Position tab.** All · Direct · PMS managers ·
  Mutual funds (· Other accounts, where the book has one) sit in the account
  table card's own header, at `?held=`, inside the page's five tabs at `?tab=`.
  Two levels of tab, each an address, each checked where it is drawn.
- **A fund line is a row of the account table**, DERIVED and never added into
  the book's own figures — #88's model (`src/lib/heldThrough.ts`), taken whole.
- **A company held only inside funds keeps the five tabs.** #88 hid the six
  tiles on that page, because every one would be an absence about a holding the
  family does not have in its own name, and that stays. The tabs do not go with
  them: the template is the same five on every holding. Each tab with nothing of
  the family's own says so once — Transactions, that no statement records a buy
  or sell of theirs; Price & returns and Research, that both are looked up by an
  NSE symbol, that none of the family's statements names this company, and that
  *"it is not a feed being down"*.
- **While the fund look-through loads, a short note replaces #88's blank**, so a
  tab never opens empty and never says anything about the holding before the
  funds' filings have been read (Stage 10an's rule).

**AND ONE FOOTER RULE NOW COVERS THREE LINES.** This page drew a Total row only
over two or more rows, because a total of one row is the row again. #88 added a
derived total and a Total exposure line, and drew its measured total over any
rows. The rule is one sentence in the code now: a footer line is drawn only
where it adds up two or more lines — the measured total over two statement rows,
the derived total over two fund lines, and the exposure line wherever both
halves are present, since one of each is already two. #88's footer checks follow
it (`heldFeetWanted`). On this book State Bank of India (five statement rows and
many fund lines) and HDFC Bank (held only through funds) walk every branch.

**#88's CHECKS FOLLOWED THEIR SUBJECTS TO THEIR TABS.** Its tax-card claim is
struck on the funds-only company's Transactions tab, and its research claim on
that company's Price & returns and Research tabs — three new routes,
`stock-funds-only-activity`, `-market` and `-research`. `stockTabChecks` is
spread into #88's four routes, so the sweep walks 35 stock routes, each held to
the same six claims about the tabs; on a funds-only company the tile claim reads
*no tile is drawn*. The account-table probe reads the measured footer by its own
handle (`data-held-foot="measured"`), because the footer has up to three lines.

**EVERY BUG HARNESS THAT PATCHES THIS PAGE WAS DRY-RUN BEFORE IT WAS TRUSTED.**
Each patch was applied to a copy of the merged file first, and the ones whose
anchor had moved would have reported NOT A RESULT:

- `held-through-bug.sh` (#88's own): the tax-card case now patches the
  Transactions tab's card. Its routes gained the three tab routes, and its sweep
  now says NOT A RESULT when check-pages printed no tally line — the fix this
  page's own harness gained after a sweep whose browser never launched read as
  bugs that fired nothing.
- `stock-tabs-bug.sh`: four anchors moved (the tax card's condition, the one
  footer rule, the Price & returns branch, the return), and its routes gained
  #88's seven.
- `cmp-bug.sh`: the row's price cell is drawn by #88's row function now, and the
  Total row's refusal by its footer, so four anchors moved.
- `look-bug.sh` case 9: the fund lines use the same wrapping cell, so the class
  matched twice; the anchor takes the comment above the statement row's cell.

Three cases in other harnesses already fail to apply on main itself —
`carried-cost-bug.sh` 5 and `names-bug.sh` 13 and 14, whose anchors #90's
rewrites moved. They are named here rather than fixed in a merge.

**THE `ctx` LITERAL** conflicted and is main's 95 keys (#88 added `heldTable`)
plus `stockPage` — 96, none duplicated, every one declared. `build-book`
regenerates `glowData.ts` and `docs/BOOK-REPORT.md` byte for byte, equal to
main's: #88 touched nothing the book is built from.

`build` · `tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` 0 failed, #88's `heldThrough` suite among them · `build-book`
byte-identical, equal to main's · `check:family` **90/0** · `check:pages` **284
combinations clean**: #88's own 254 plus this branch's fifteen routes in both
themes. The ten NOT CHECKED lines are main's, and not one stock route fails or
abstains. The bug passes ran on this tree too, each after a clean control:
`stock-tabs-bug.sh` all twenty-seven (the table above), #88's own
`held-through-bug.sh` all eighteen, `cmp-bug.sh` the same eight of ten, and
`look-bug.sh` case 9, `names-bug.sh` case 10 and the dated-capital XIRR case
each fire. `carried-cost-bug.sh` fires fifteen of its sixteen; its case 5
reports NOT A RESULT, the anchor named above as failing on main too.

#### …and a ninth time: #85 took `10cl` while this section's bug pass was running

**#85 — an ADD TILE card, and Capital Call cells that say why saving is off —
landed while the bug pass on the #88 tree was running, and took `10cl`.** The
stage headings were compared with main's before this was pushed, and git marked
the conflict too, because both sections sat after `10ck`. Main keeps `10cl`;
this section became **`10cm`** — until the tenth merge, below. Of the lines
naming `10cl` after the merge, none is on both sides: this branch's eleven moved
— the heading, nine pointers and the note in #88's section — with its comments
in four harnesses (`check-corporate-actions.mjs`, `cmp-bug.sh`,
`held-through-bug.sh` and `look-bug.sh`). #85's six lines here and its sixteen
comments (13 in `check-pages.mjs`, 2 in its bug harness, 1 in `Kpi.tsx`) stay.

**#85 TOUCHED NOTHING THE POSITION PAGE DRAWS.** Its code is the tile strip, the
Capital Call cells and their store. Its edits to `Kpi.tsx`, which draws this
page's tiles, and to `StatTile.tsx` are comments, and none of its checks reads a
stock route. So the bug pass above ran on the #88 tree and was not run again;
the full sweep is its control on the #85 tree — the same reasoning #85's own
section records for #88.

- **The `ctx` literal conflicted and was resolved as a union**: #85's `tileAdd`
  and `callOff` beside this branch's `stockPage`. 98 keys, none duplicated,
  every one declared.
- **Neither side touched a generated file**, and `build-book` regenerates the
  book byte-identically, equal to main's.

`build` · `tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` 0 failed · `check:family` **90/0** · `check:pages` **286
combinations clean**: the #88 tree's 284 plus #85's one new route in both
themes. Eleven lines were NOT CHECKED: main's ten, and one on
`monitor-txn-direct` — *the unfiltered trades footer was not read on this pass*
— which the next merge's note explains.

#### …and a tenth time: #86 took `10cm` while the #85 tree was being checked

**#86 — the Portfolio Monitor opens on All Securities, first in its axis
control, with the holdings and entity selectors at the row's right end — landed
five minutes after the #85 merge was pushed, while that tree's full sweep was
running, and took `10cm`.** Git marked the conflict, because both sections sat
after `10cl`. Main keeps `10cm`; this section is **`10cn`**. Of the lines naming
`10cm` after the merge, none is on both sides: this branch's eleven moved — the
heading, nine pointers and the note in #88's section — with its comments in the
same four harnesses. #86's five lines here (its heading, three lines of its own
letter note and its note under Stage 10z) and its four code comments (two in
`check-pages.mjs`, one in its bug harness, one in `MandateHoldings.tsx`) stay.

**#86 TOUCHED NOTHING THE POSITION PAGE DRAWS.** Its code is the Monitor, the
axis list, the pick-list, the return picker, the search box and one link on the
mandate page. None of those is a file this page's bug cases patch, and none of
#86's new or changed checks is on a stock route. So, as with #85, the bug pass
was not run again, and the full sweep is its control on the tree that ships.

- **`check-family-inputs.mjs` merged without a marker and was read by hand.**
  Against main it differs by this branch's My targets walk alone. That walk
  reaches a company page by the first `/stock/` link on the Monitor, which is now
  the All Securities view; it still lands on a holding and still opens My targets.
- **The `ctx` literal conflicted and was resolved as a union**: #86's
  `holdingsDropdown`, `pickedFund`, `filterRow` and `monitorInFull` beside this
  branch's `stockPage`. 102 keys, none duplicated, every one declared.
- **Neither side touched a generated file**, and `build-book` regenerates the
  book byte-identically, equal to main's.

`build` · `tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` 0 failed · `build-book` byte-identical, equal to main's ·
`check:family` **93/0**, #86 having added three rows · CI (`build`) and the
Cloudflare preview pass on the pushed merge. `check:pages` walked **288
combinations**: #86's own 258 plus this branch's fifteen routes in both themes.
**286 were clean.** The other two, `monitor-txn-drill` (four checks) and
`monitor-txn-in` (three), are the pair Stage 10ck records failing under load and
passing alone; this sweep ran while both bug harnesses were building and
sweeping on the same machine. Run alone once the harnesses had finished, both
pass, and so does `monitor-txn-direct`, whose subset check — skipped on both
loaded sweeps, *the unfiltered trades footer was not read on this pass* — runs.
The ten other NOT CHECKED lines are main's evidenced abstentions, and not one
stock route fails or abstains.

**THE CAUSE IS MEASURED, AND IT IS IN THE WALK, NOT THE PAGE.** Opening the
Transactions view fetches the dated record: 265 requests to the audit archive,
made only when the view opens. On a quiet machine the last of them lands about
3.0–3.2 s after the click, and the walk's read — a fixed 1.2 s after its click
returns, which takes about 2.3 s — lands at 3.5–3.7 s and finds the table. Under
the load the harnesses put on the machine, the table took 4.0–4.7 s to appear
after the click, and the fixed wait ran out first: the read found no table, a
control the walk meant to click was not drawn yet, and every claim after it read
the view as it opens. Those walks are all on the Portfolio Monitor, and this
branch changes none of them. The fix, waiting for the table rather than for a
fixed time, is left for a separate change.

### Stage 10co — PRIVATE MARKET SAYS NOTHING THE TABLE DOES NOT, AND A DRAGGED COLUMN LIFTS WHOLE

*"Why do i need all this garbage written please remove its obvious from the
table what it is … We have such random one-liners, two-liners, and footnotes
everywhere across the product. Please go hunt and remove all of this. Footnotes,
etc., because no one is genuinely reading them. The customer is literally
looking at the table and seeing the values inside it … So first fix everything
for the private market page, and then we go on to the others."* · *"When I'm
dragging … a column across the table to a different position — it should lift
up the whole column instead of just lifting up the header. If you can implement
this across the dashboard, across all tables, that would be great."*

**STAGE 10ci ANSWERED THE SAME COMPLAINT ON EVERY TABLE FIRST, AND THIS GOES
FURTHER ON ONE PAGE.** That change cut every table's notes to one short line and
kept Private Market's working in one collapsed "How the totals are worked out"
line. This one was asked to remove it all on Private Market first, so what 10ci
left there as a short line is gone too, and what it put in the fold is the hover
on the figure it explains. Every other page keeps 10ci's one short line for
now; the family asked for the same cut there next, in the same sentence.

#### 1. Private Market carries no explainer line

Audited line by line first — the Stage 10aa / 10ai / 10ap method: each claim's
second home was found before the line went.

| What was still on screen after 10ci | Where what it said lives now |
| --- | --- |
| the card subtitle on each tab ("One row per fund, each holding counted once. Click a row…") | the tab button's own hover, which already said it |
| "Marks span 30 Jun → 31 Jul 2026" above the tiles | every row's As of cell, which says it per row |
| the word under each money heading — "promised", "asked for", "cash sent", "not yet asked", "of units held", "fund's mark", "of private" | the first words of that heading's own hover |
| the count under each return heading ("1 annualised of 4") | the heading's hover, and `data-col-coverage` — `SortHeader`'s new `coverage` |
| the band's basis — "· each holding counted once", "· ₹X paid in is in no value total" | the band's hover; its COUNTS stay on its face, because they are data |
| the "Counted once" line's "one holding on 2 statements" | that line's hover; its figures stay |
| "each holding once · 11 capital accounts" under the total's label | the label's hover |
| the "How the totals are worked out" fold: the working, the second path, the floor | the Still to call TOTAL's hover |
| …whether Called may be set against Paid in | the Called total's hover, in both directions |
| …the public-market funds' capital accounts, named | the COMMITTED total's hover, beside the figure they are left out of |
| …"This page is the private side of the book: Listed ₹… · Private ₹… · Total ₹…" | **nowhere, deliberately** — the Market value tile states this page's share of the whole book, and Morning CIO's Concentration card prints every side with its own drill-down |
| "N calls, newest first" on the Transactions band | "N calls"; the rest its hover |

**A HOVER IS WEAKER THAN A CAPTION, AND THAT IS RECORDED RATHER THAN GLOSSED.**
A reader scanning does not hover. What makes the trade right here is WHERE each
hover is: the working behind "how are you calculating this uncalled capital of
16 crores?" — the client's own question, Stage 10ay — is on the uncalled total
itself, which is where that question is asked, rather than in a fold under the
table a reader had to know to open. The floor sentence keeps 10ci's wording
("the floor of what the funds can still call"), which that change chose so it
never reads as the removed calls card's heading.

**THE PUBLIC-MARKET CAPITAL ACCOUNTS ARE STILL NAMED.** Stage 10bw's rule is
that a commitment the family signed must not vanish without a word, and it is
unchanged: the clause naming Carnelian Bharat Amritkaal, Delphi and both
Founders folios is the Committed total's hover, and its ids and words ride on
the total row (`data-pm-cap-elsewhere`, `data-pm-cap-elsewhere-text`) so the
sweep holds them to the book.

**WHAT STAYED, AND WHY IT IS NOT THE SAME THING:**

- a fund row's quiet line ("Category II · 2 folios · 6 calls · reported twice ·
  counted once") and a folio row's provider and account number — data a reader
  identifies the row by, not a sentence about the table;
- the tiles' one short line (Stage 10bs) and the "missing data" marker the
  family asked for by name (Stage 10bx);
- **the Capital call heading's one word** — "you enter", or while the store
  cannot be read "not available", "not set up", "signed out" (Stage 10cl). That
  is a STATE, the thing the family reported the screen could not say, and not an
  explainer; its reason is the word's own hover.

**`pageScopeNote` IS DELETED WITH THE LINE IT FED**, rather than left computing
the right answer into no caller. `marketSide.test.ts` §7 asserts what a reader
relies on instead: the three funds the family named are not private, and the
book's listed side (`marketSides`, which Morning CIO prints) holds them. `Card`
marks its subtitle `data-card-subtitle`, and `TreeNameCell` / `TreeSectionCell`
take a `hint` — the cell's hover — so a sentence has a home that is not a line.

#### 2. Checked on STRUCTURE, never on wording

A rewording that keeps a paragraph is exactly how one comes back, so the claim
is counted rather than matched. A `prose` probe in `check:pages` counts the
visible card subtitles, every visible leaf text block outside a table longer
than 60 characters (longer than any tile's one line) and every one inside a
table longer than 120 (longer than any fund's name). **`PM_NO_PROSE`** requires
all three to be zero on every Private Market route, the removed blocks' own
handles to be gone and the removed sentences absent. That is stricter than
10ci's `tableNotes` guard on this page only; the guard still runs everywhere.

**AND EVERY RE-HOMED FACT IS ASSERTED IN ITS NEW HOME**, because a removal and a
re-homing are two claims and neither implies the other: PM-4, PM-4b and PM-4c
read the working, the second path and the floor off the Still to call total's
hover; PM-4g and the subtract check read the Called total's, in both
directions; the clause check requires the public-market clause to be IN the
Committed total's hover and OUT of the page's text; `PM_BAND_HINTS` and
`PM_OVERLAP_HINT` hold the band and "Counted once" hovers, and the band's ₹
figure to its own Paid in; the return headings' counts are read off their
hovers. `check:family` reads the band hovers too.

**TWO OF 10ci's CHECKS INVERTED RATHER THAN BEING DELETED.** *"the page states
which side of the book it is"* and *"the notes under the table are one collapsed
line"* asserted the fold; `PRIVATE_SIDES_GONE` and `PM_NO_PROSE` assert it and
its handles are gone. `foldsOnArrival` still holds the AIF drill-down's fold
shut on arrival — the one fold 10ci leaned on that is still there.

Two more moved further than their wording:

- **PM-2 HOLDS THE MARKET VALUE TILE TO THE BOOK**, because the sides line it
  reconciled against is gone. Its "of the ₹X book" is struck on the STATEMENT
  book — `statementBookPositions`, which main already carried for Stage 10cf —
  because this page reads `statementPortfolio` (§6) while the sweep's default
  model of the book is the live one; set against that, a correct page fails by
  exactly the overlay.
- **PM-7 READS EVERY FUND ROW'S AS OF CELL**, against `SIDE_BOOK.privateAsOfMax`,
  because the Marks span line it read is gone. A range within one year prints
  its first date without the year ("30 Jun → 31 Jul 2026"), which the first
  draft of this check did not allow for and failed a correct page on.

#### 3. A dragged column lifts whole

`src/lib/columnDrag.ts`, called from `SortHeader`'s `onPointerDown`, so every
table that declares its columns gets it with no change of its own — the reason
the sort and the keyboard move already live in one place. HTML5's drag, which it
replaces, can only carry a STATIC picture of the element under the pointer: the
heading. The drag is a pointer gesture now, and what moves is a copy of the
column as it stands on screen — the heading and every cell under it a reader can
see, total row included — lifted with a shadow, while the column it came from
dims in place and a bar shows where it will land.

Four things it must not break, each a way a drag goes wrong quietly:

- **A click still sorts.** A press only becomes a drag after 5px of travel; and
  a drag that ends back on the heading it began on must NOT then sort it, so the
  click after a drag is swallowed.
- **The first column stays put**, as a subject and as a destination.
- **It draws at the app's own scale.** `#root` carries `--app-zoom` (0.875 on a
  wide screen). Measured in this Chromium: `getBoundingClientRect` reports
  PAINTED pixels while CSS lengths are pre-zoom, so the copy takes the table's
  own effective zoom and every position is divided back into its CSS pixels. A
  copy drawn at 100% over a table drawn at 87.5% would be a different size from
  the column it is a copy of.
- **Escape cancels, and nothing is left behind** — no copy, no dimmed cells, no
  bar — and the release that follows it is not a click either.

The table scrolls under a copy held at its edge, so a column can be carried to a
place not yet on screen; touch starts from the grip only, so a finger can still
scroll a wide table sideways. The copy takes the table's own computed colours,
so it read correctly on Stage 10cg's white theme with no change — checked by a
screenshot taken mid-drag on the merged tree.

**CHECKED BY A REAL MOUSE DRAG, READ MID-AIR**, because the copy only exists
while the pointer is down and no snapshot taken after the drop can see it.
`monitor-arrange` presses Weight, carries it and reads the page with the pointer
down: exactly one copy, of the pressed column, headed with its heading, carrying
every cell a reader can see — counted off the table by GRID POSITION,
re-expressed in the sweep rather than imported, so a copy of the heading alone
(HTML5's picture) carries none and fails — the source column dimmed and nothing
else, the bar at the edge it will land on, the copy under the pointer. After the
drop: it sits before the column the bar was on, nothing else moved, the rows
keep their sort, and nothing is left behind. Then Escape (nothing moves, nothing
stays) and a drag brought home (its release is a click on the heading's sort
button, and must not sort).

#### 4. Merged with main, which moved sixteen commits while this was open

#74 to #92 landed while this branch waited — among them 10ci's note cut on every
table, 10cl's Capital call cells and 10cg's new look. Three files conflicted,
and the rule for each was 10ci's own: **main's features are kept, and this
branch's removals are kept on top of them.**

- **`SortHeader.tsx`** — the pointer drag in place of HTML5's, with 10cg's
  `font-semibold`.
- **`PrivateMarket.tsx`** — seven hunks: this branch's removals in six, and
  10cl's Capital call heading in the seventh (see what stayed, above). #80's
  FIFO returns, #82's tile layouts and #85's ADD TILE card merged without a
  marker and are main's, checked by hand.
- **`check-pages.mjs`** — eight hunks. Main's `bookArray` and its statement book
  taken whole; this branch's prose checks in place of the fold checks (above);
  main's `tableNotes`, `foldsOnArrival` and ADD TILE walks kept, the walk that
  opened the Private Market fold dropped; the two Capital call heading checks
  this branch had rewritten point at 10cl's word and its hover.
- **THE `ctx` LITERAL IS A UNION**: 102 keys, none duplicated, each naming a
  declaration — main's 101 and this branch's `prose`. `fundExposure` is absent
  on purpose, as 10ci dropped it with the box it read.

**THE LETTER.** This section was drafted as `10ca`, the letter after main's
newest at the time (`10bz`). Main took `10ca` to `10cm` while it was open, and
then `10cn` — #91's Position page — in the minutes before this branch was
pushed, so it is `10co`. The stage headings were compared against main's tip at
each merge, and it is the second comparison that caught it.

#### 4b. Merged with #91, which landed as this was being pushed

- **`CLAUDE.md` conflicted textually** — both sides inserted after Stage 10cm.
  Main's section is first and keeps `10cn`; this one follows it as `10co`. Of
  the lines naming `10cn`, two are this change's (the `columnDrag.ts` bullet in
  Layout and the no-explainer bullet in Conventions) and moved; the other
  thirteen are main's and stayed, each classified against main's own copy.
- **The `ctx` literal conflicted and is a union**: #91's `stockPage` beside this
  branch's `prose` — 103 keys, none duplicated, every one declared.
- **#91 touched none of this change's files.** It rewrote `StockInfo.tsx` and
  the research components; this change's checks are on Private Market and
  `monitor-arrange`, and its bug cases patch `PrivateMarket.tsx`,
  `columnDrag.ts` and its own checks. So the bug pass was not run again; the
  full sweep below is its control on the tree that ships.
- **AND #91 MEASURED THE FLAKE THIS CHANGE FIXES.** Its section records the
  transactions walks failing under load — the dated record is 265 requests,
  and a fixed 1.2s wait ran out before the table drew — and leaves the fix,
  *"waiting for the table rather than for a fixed time"*, for a separate
  change. This is that change (see below).

#### 5. Verification

**27 BUGS PUT BACK ONE AT A TIME, AND EVERY ONE FIRES ITS OWN CHECK.**
`scripts/dev/pm-prose-bug.sh` restores by copy on a trap, verifies byte for byte
and rebuilds on the way out, reports a patch that does not apply as NOT A RESULT
rather than as clean, and runs a no-patch control first. Ten put a removed line
or a stale hover back, eleven take a moved fact out of its hover, and six make
the drag carry less than the whole column — the heading alone, the source not
dimmed, Escape ignored, a drag brought home that sorts, the copy left behind
after the drop, and the copy drawn at 100% over a zoomed table. `CASES=` re-runs
chosen cases alone, the control always first.

- **ONE CASE WAS NOT A RESULT ON THE MERGED TREE, AND THE HARNESS SAID SO.**
  Main's `SelectableTiles` call gained a `page` prop, so the Marks-span case's
  anchor matched nothing. Re-anchored, it fires two checks.
- **AND READING THE CASES BACK FOUND ONE STALE HOVER.** The Transactions tab's
  `title` still read *"What can still be called, and every capital call the
  funds have made"* — eleven stages after Stage 10bs removed the windows it
  named — and the check asserting their removal could not see it, because a
  `title` is not in `innerText`. The tab reads *"Every capital call the funds
  have made, newest first"* now, the check strikes the words on hovers as well,
  and the 27th case puts the old hover back and fires it.

**THE FIRST FULL SWEEP FOUND ONE FINDING, AND IT WAS THE WALK, NOT THE PAGE.**
258 combinations, before #91; `monitor-txn-out` failed four checks on the one
run taken beside the bug pass. The dated record is read from the audit archive
at runtime, and on a loaded machine it landed after the walk's fixed 1.2s pause,
so the Sells option was not in the DOM, its click was skipped and the page was
checked unfiltered — the cause #91 measured to the second. The same route
re-ran clean against both builds, and the walk now WAITS for the table and the
option rather than pausing, which cannot make a check pass that should fail: a
table that never draws still fails them all. All nine transactions routes then
ran clean.

**AND THE FULL SWEEP ON THE MERGED TREE CAME BACK CLEAN.** It walks #91's new
position-page routes too, so the count is its own rather than the 258 above plus
arithmetic: **288 combinations clean, 0 invariant failures**, with ten evidenced
abstentions read out of the report by name — six on the Morning CIO panels (every
KPI tile on this book carries a figure), two on Private Market (every private
holding reports a cost), one on the redeemed-account claim (no private account is
redeemed to nil) and one on the not-found drill-down's crumb. Not one is this
change's own.

`build` · `tsc` · `test:ingest` · `test:family` · `check:family` **93/0** ·
`check:pages` **288 combinations clean** on the merged tree. `npm run build-book`
regenerates `glowData.ts` and `docs/BOOK-REPORT.md` byte-identically: a line
removed from a page is not part of the book.

### Stage 10cp — EVERY OTHER PAGE SAYS NOTHING ITS TABLE DOES NOT

*"We have such random one-liners, two-liners, and footnotes everywhere across the
product. Please go hunt and remove all of this. Footnotes, etc., because no one
is genuinely reading them. The customer is literally looking at the table and
seeing the values inside it … So first fix everything for the private market
page, and then we go on to the others."*

Stage 10co did Private Market. This is "the others", and the method is the same
one: audit every line, MOVE a fact a reader acts on onto the figure it describes
(its hover), delete the rest, and assert both the removal and the new address.
What is new is where the work was done — **in the four shared components every
page draws its prose through**, so no page can put a line back by accident:

| Component | Was | Is |
| --- | --- | --- |
| `Card` | `subtitle`: a 12px line under the title, on 45 cards in 19 files | the title's hover (`data-card-title-hint`); a string, so a figure cannot hide in it |
| `PageHeader` | `subtitle`: a sentence under the headline, on 7 pages | the `h1`'s hover |
| `StatTile` | `hint`: a 12.5px definition under the figure | folded into the tile's own hover, after its `title` |
| `AbsentSection` | `needs`: a paragraph under an absence's headline, the longest past 500 characters | the box's hover (`data-absent-needs`) |

**THE LAST ONE MOVED A CAUSE, SO THE HEADLINE HAD TO TAKE IT.** An absence's
`needs` was where a failed SERVICE was named — "the quote feed did not respond",
"the price service did not respond". With `needs` a hover, a headline reading
"No price history for this security" over a failed call would teach a reader
something false about the company, which is the HTTP 522 lesson this file already
records. So where the cause is a service, the headline carries it: Today's movers
reads **"No direct-equity move today — the quote feed did not respond"**, the price
card **"The price service did not answer"** for any status, timeout or no answer
(only an empty answer about the symbol is "No price history for this security"),
and an AIF's price tab **"No market price — an AIF folio publishes no daily NAV"**.
A loading card says "Loading closes…" in its body now rather than in a subtitle
(Stage 10r's rule).

#### What moved, page by page

- **Morning CIO** — the movers tile's coverage sentence, the index comparison's
  basis, the "Also moved today and not counted here" lead-in, the NAV card's
  panel paragraph and the "three lists" reconciliation in its fold, the NAV
  movers' coverage and its "Every scheme is listed · … drastic" line (the bound
  is the Move heading's hover and each chip's own), Capital deployment's subtitle.
  Every FIGURE stays: "₹X of ₹Y held · N of M names", "Not counted: …", "All
  three lists · ₹713.6 Cr".
- **Capital Gains** — forty-four rows each reading "— no capital gain statement
  issued for this account in this drop" are ONE CLOSED BAND, "No capital gain
  statement · 44 accounts", marked **missing data** — the family's own standard
  for missing data (Stage 10bx: *"a hidden drop down clearly marked"*). The band
  opens by its chevron and names every account, each with its reason in the dash's
  hover. The tax caveat stays on screen (`data-prose-ok`, Stage 10ci's reason).
- **Performance** — "not annualised" is a GUARD, not an explainer (Stage 10g(ii)),
  so it stays on the money-weighted tile's face AND moves INTO the per-account
  card's title, where the line under the title that said it went.
- **Sector Composition** — the Direct Equity cards keep their figures and counts;
  "the holdings tables call this Direct Equity" and "excluded rather than folded
  in — … a fund holds many companies" are the hovers on the lines they qualify.
- **Family & Entities, Portfolio Monitor, Polycab, Data & Refresh (`/upload`),
  Ledger Insights, the mandate page, the company page and its research panels,
  and Snapshot History (`/history`, "Upload History" in the nav)** — the same
  treatment. Snapshot History's coverage is a FIGURE, so it is a pill on the
  header now ("13 of 49 accounts") rather than inside the sentence that went.
- **Corporate actions** — two sentences, a "How this return is calculated" fold
  and a line under the table became the hovers on Window, the dividend column and
  Total return; the coverage line is its counts, with the capture date its hover.

**WHAT STAYS ON SCREEN, AND WHY IT IS NOT THE SAME THING.** A figure, a count, a
row's identity line, a status word ("partly valued", "saved capture", "missing
data"), a fence a reader could be harmed by losing ("DERIVED, not a position ·
no part of the book's NAV", "in no total"), and a guard (§6's statement basis,
"not annualised"). Five lines a reader must SEE declare `data-prose-ok` with
their reason, at the element: Capital Gains' tax caveat (a tax figure read
without it is read as advice), Polycab's sources line (the only figures on the
site that are not the family's own paperwork), a fund folio's list of what its
statement carries (it IS the content), Snapshot History's reason for a
measured ₹0 (Convention 2: a computed zero's cause goes on the face), and the
capital-call set-up steps (a procedure behind a closed fold, shown only while
saving is off; shortened, they lose the Cloudflare menu names they exist to
give).

#### The check — on structure, on every route

`check:pages` now runs, on EVERY route, what `PM_NO_PROSE` ran on Private Market:
no `data-card-subtitle`, no `data-stat-hint`, and no visible text that reads as a
SENTENCE past 60 characters outside a table or 120 inside one. Two refinements
make it a check about prose rather than about length, and each was measured:

- **A SENTENCE HAS SMALL WORDS IN IT.** A line of figures ("Listed ₹766.4 Cr ·
  Private ₹10.6 Cr · Total ₹777 Cr") or an account's identity and state is long
  and is not prose. Every removed footnote carried ten or more lower-case words;
  no line of figures on a cleaned page carries that many (`PROSE_WORDS`).
- **A FLEX OR GRID ROW OF ITEMS IS MEASURED ITEM BY ITEM.** An entity picker, a
  legend, a strip of chips or of counts joins into a 150-character "line" nobody
  wrote; its items are what a reader reads.

Private Market keeps the stricter form — any block past the bound, sentence or
not — which it has met since Stage 10co.

**AND EVERY FACT THAT MOVED IS ASSERTED WHERE IT WENT**, because a removal and a
re-homing are two claims: the movers coverage and whose scope the excluded line
is, the NAV movers' coverage and the drastic bound, the NAV card's panel, the
funds-only research and price reasons, an AIF's no-disclosure reason, Polycab's
card sentence and the group-not-this-demat distinction, the depository line on
`/holdings`, the corporate-action caveats (in their own dev check). New ones:
the Capital Gains band (closed on arrival, its count the book's, its hover saying
none is counted as zero; opened, every account named with its reason), "not
annualised" on Performance, the history coverage pill, and the price card blaming
the service.

#### The full sweep found what the targeted runs could not

The routes this change touched were walked first and came back clean. The first
FULL sweep then flagged **26 of 145 combinations** — 24 of them long lines on
routes nobody had edited on purpose (a mandate page's statement line, a company
page's quantity footer, the capital-call set-up steps behind a fold), and two
checks still reading a sentence that had moved. It is the lesson every stage
here re-learns: a check that runs on every route finds what a list of routes
does not. **`PROSE_DUMP=1`** prints every flagged line with its route, which is
how the 34 lines were worked through one by one rather than one failure per run.

What each became — the figures stay on the face, the sentence is the hover:

- **A holding two statements report** — "One holding on 2 statements · rows ₹X ·
  counted once in the Total, ₹Y".
- **The empty transaction history** — "No transactions", then the window the
  statements cover.
- **The quantity card** — "depository movements, not trades" left the footer; the
  title says **Depository** quantity through the year, so the word that tells a
  reader these are not trades stays on the face, and the rest is its hover.
- **A company held through many mandates** — a count; which mandate is which is
  on each account row, as before.
- **A mandate page's statement line** — the total, then "every ₹0 above is
  measured".
- **A mandate's return under a year** — the figure, then "under a year, not
  annualised". That clause is Stage 10g(ii)'s GUARD, not an explainer, so it stays
  on the face; only why is the hover. A new check holds it there.
- **A fund's own returns** — "the scheme's, not this family's · to <date>".
- **Morning CIO's family-axis lines, the Monitor's Cash band and its "no basket
  stated" clause, the review-gap note under an empty search, the refreshing-prices
  line** — each a short state or a count, its sentence the hover.
- **The XIRR derivation on `/holdings?of=measured` was KEPT, and shortened.** The
  family asked for it by name at Stage 10be (*"show the table first and the
  formula section below it"*), so removing it would undo an ask. It is a lead,
  the formula and three one-line rules now, each rule's reason its hover.

Every one of these is asserted twice — gone from the face, present in its new
place — on the route that draws it.

#### The bug pass, run in a worktree of its own

`scripts/dev/pages-prose-bug.sh` puts 42 bugs back one at a time. Each is one of
three kinds: a removed line COMING BACK, a moved fact GOING MISSING from its
hover, or a guard LEAVING the face. It restores by copy on a trap, checks the
restore byte for byte, and rebuilds on the way out. A patch that does not apply,
or a build that fails, is reported as NOT A RESULT, never as clean.

It ran in a separate `git worktree` with its own `vite preview` on :4177. That
kept the working copy clean while the full sweep ran beside it, for the reason
Stage 10cl gives. A no-patch control walks every route any case walks, and came
back clean.

| Bug put back | Caught by |
| --- | --- |
| a card's subtitle drawn as a line again | the card-subtitle and prose checks, on 7 of the 15 routes it walks (17 findings) |
| a tile's hint drawn as a line again | the tile-line and prose checks, on 5 of 15 |
| a page's subtitle drawn under the headline again | the prose check, on 4 of 15 |
| an absence's reason printed as a paragraph again | the prose check where an absence renders (1 of 3) |
| "not annualised" gone from the money-weighted tile, or from the per-account card | the guard's own check, for each |
| the Capital Gains band open on arrival · its chevron dead · its accounts back as rows · its hover lost · one account's reason lost | five checks, one for each |
| a fact gone from its hover: the movers and NAV-movers coverage · the drastic bound · the Polycab card sentence · the review gap's reason · the cash-instruction line · the Cash band's count · the mandate line · the reported-twice note · the arbitrage line · a derivation rule · the scheme-returns caption · the refresh line | the check that reads that hover, for each |
| a line back on the face: the corporate-action notes · the Sector card · the search gap · the family-axis line · a mandate's statement line · the reported-twice note · the empty transaction record · the not-trades phrase · the derivation | the prose check, and the fact's own check where it has one |
| the movers coverage back on its tile · the unclassified clause back as a sentence | the fact's own check |
| a service failure the headline stops naming (the movers card, the price card) | the check that the headline names the cause, for each |
| the history coverage pill · the excluded line's scope · a sub-year return's guard · the quantity card's "Depository" | its own check, for each |
| the capital-call set-up steps losing their `data-prose-ok` | the prose check inside a table |

**ONE CASE CAME BACK CLEAN, AND THE DEFECT WAS IN THE HARNESS.** The Polycab
card-sentence case walked `polycab`, the Holding tab, which draws no card
sentence. So the patch changed nothing a reader could see. The two checks that
read the sentence are on the Corporate actions and Promoter group tabs. The case
now walks those two tabs, and so does the control. Re-run, the control is clean
and the case is caught on both tabs. A case that puts nothing back gives a clean
run that proves nothing. That is Stage 10bt's finding, arriving on this
harness's first run.

#### The verification

**THE FULL SWEEP THAT COUNTS RAN ON THE COMMITTED CHECKER.** An earlier full run
started three minutes before the last 38 lines of checks were saved, so it was
running an older checker. It was stopped and not recorded. The run that counts
found **290 combinations clean, 0 invariant failures**, and `PROSE_DUMP` flagged
no line. 290 is main's 288 plus `capital-gains-missing` in both themes.

Ten invariants did not run. They are main's usual abstentions, each read out by
name: six on the Morning CIO panels (every KPI tile on this book carries a
figure), two on Private Market (every private holding reports a cost), one on
the redeemed-account claim, and one on the not-found drill-down's crumb. None
belongs to this change.

`build` · `tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund
35, buoyant 42, classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22,
neoFlows 8, golden 140; 2 not checked, 0 blocked) · `test:family` (2,500
checks, 0 failed; its four NOT CHECKED lines are main's) · `check:family`
**93/0** · `check:pages` **290 combinations clean**.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
byte-identically. Moving a sentence into a hover does not change the book.

### Stage 10cq — PRICE ALERTS THAT FIRE WHERE A READER LOOKS, AN ALL ALERTS TAB, AND EVERY LEVEL SENT TO GLOW CENTRAL RESEARCH

*"Does these alerts actually work, can you make this much simpler to fill in for
the customer and also in morning CIO can you make an ALL alerts tab where in a
beautiful table format whenever the alerts which have been set are triggered they
show simply and ofcourse should look like an alert for entry exit or whatever
think like the investor using this dashboard and keep it extremely simple and
clean ui."* · *"Please note that when the user puts target price inside the
dashboard, it should automatically also go to the Glow Central Research
dashboard. When the target price is met, it should show in All Alerts as an
alert, and automatically come to the AI Alert section in the Glow Central
Research dashboard."*

(Written as `10bz`. While it waited, main took every letter from `10by` to
`10cp` — its `10bz` is *"Ask Muns is off the top bar"*, its `10cg` is *"Glow
Central Research's fonts and colours"*, its `10ck` is #88's company page, which
landed the hour the family said to merge, its `10cl` is #85's ADD TILE card,
which landed while that merge was being verified, its `10cm` is #86's All
Securities view, which landed while this change's final checks were running, its
`10cn` is #91's five-tab position page, which landed while the notes for the #86
merge were being written, its `10co` is #94's Private Market cut and
whole-column drag, which landed before the notes for the #91 merge could be
pushed, and its `10cp` is #95's cut of the explainer lines on every other page,
which landed while the #94 merge was being verified — so this is **`10cq`**, the
first free one. This work's own references
moved with it each time, in code and here, and main's were counted against
main's copy of each file and left alone. Some of main's `10cg`
code comments describe Stage 10ci's work rather than the fonts — the
corporate-action card, the Portfolio Monitor's route split, and their checks.
Those are main's to repoint.)

#### The honest answer was "half", and each missing half was a real defect

Measured on the old `InvestmentTools` card before a line changed:

1. **AN ALERT WAS SEEN ONLY ON ITS OWN STOCK'S PAGE.** `firedAlerts` ran inside
   that one card and nowhere else, so an alert "fired" for a reader who happened
   to open that company and for nobody else. That is a note, not an alert.
2. **THE BUY LEVEL NEVER FIRED.** `entryPrice` was stored and labelled "the level
   at which we would add" — and missing from `firedAlerts`. A buy level that
   reaches its price and says nothing is the alert a buyer cares about most.
3. **IT FIRED ON A STALE MARK.** With no live quote it compared the level against
   the STATEMENT's own price, weeks old, and admitted it in a parenthesis. That is
   exactly what "The alert engine — silence is read as all-clear" forbids: a rule
   whose inputs are incomplete does not fire, and does not pass either.

#### `src/lib/priceAlerts.ts` — which price, and whether it fired, decided once

The stock page's boxes and Morning CIO's table both call it, so they cannot
disagree about one alert. PURE — every input is an argument.

- **WHICH PRICE, STRONGEST FIRST:** the intraday QUOTE where the feed priced the
  holding; the fund's own published NAV where AMFI priced it (a fund has no
  intraday price, so its NAV IS its price — Stage 10bn); otherwise NOTHING, with a
  reason worded by what the holding is ("an AIF has no live price — it is valued
  only on its statement" sends nobody to wait for a feed). **A statement mark is
  never checked.**
- **FOUR STATES, AND ONLY TWO ARE VERDICTS.** `reached` and `watching` need a
  price. `checking` is the feed still answering — saying "no price" then would be
  Today's movers' Stage 10r defect in a new table. `unchecked` is no price at all,
  and it is never `watching`: a check never made must not read as one that held.
- **THE FIVE KINDS ARE THE FIVE LEVELS THE STORE ALREADY HOLDS**, under an
  investor's words — Buy at (`entryPrice`), Sell at (`exitPrice`), Stop loss
  (`alertBelow`), Target (`targetPrice`), Alert above (`alertAbove`). Nothing the
  family typed moves; "Entry price" is "Buy at" and now fires. Fair value is NOT
  an alert — it is a valuation.
- **REACHED IS INCLUSIVE** — a level the price touches exactly must fire.
- **DISTANCE IS SAID THE WAY AN INVESTOR SAYS IT:** "↓ 18.2% to go" while
  watching (as a share of the price NOW), "4.8% past" once fired (as a share of
  the LEVEL).
- **A TYPO IS REFUSED, NEVER SAVED AS A DELETE.** `parseLevel` reads Indian
  grouping and the ₹ sign and refuses anything that is not a positive number. The
  old parser read "abc" as blank and silently erased the level in the box.

#### The card: four boxes, and everything else one click down

The card led with ten fields in four rows and a "Plan" block naming columns on a
Portfolio Monitor view that had been removed. It leads now with the four levels
an investor acts at — Buy at, Sell at, Stop loss, Target — each saying UNDER
ITSELF whether the price got there or how far is left. Alert above, fair value,
target weight, fair value year and valuation method sit under **More**, which
**opens by itself** when anything in it is set, so nothing the family typed is
ever hidden. The "Add to watchlist" star is gone: its page was removed at Stage
10w, and a control whose only effect is invisible is the control-that-looks-alive
failure. The flag it set is kept on every save.

**IT IS ON THE HOLDING'S MY TARGETS TAB** since main's Stage 10cn made the
position page five tabs, and every link that opens it — the All alerts pencil,
the row's name and the New alert finder — reads one address, `alertBoxesHref`.

**NOTHING ON IT READS AS A SENTENCE** — main's Stage 10cp rule for every page.
What the card does is its title's hover, and the way to All alerts is a short
link beside the price chip rather than a line under the title. Where a level is
saved on a holding no price reaches — an AIF, or a company held only inside
funds — the card says *"Saved · not checked here — no price"*, and why is the
hover, because a reader must SEE that these alerts cannot fire.

#### Morning CIO → All alerts

A fourth tab, LAST, so the three the family arranged keep their places and the
default stays the movers panel. (Main's Stage 10by names the third tab after the
chosen benchmark; the two changes met on the one line that draws a tab's label
and both are kept — the benchmark's name, and the alerts count beside it.) One
row per alert, because two levels on one holding fire separately:

- **WHAT HAS FIRED COMES FIRST AND LOOKS LIKE AN ALERT** — a bell, the alert's own
  words ("Stop loss hit", "Buy level reached"), its colour and a tinted row with a
  bar at its edge; then what is still being checked; then what is watched,
  closest first; then what cannot be checked, with the reason in its hovers.
- **THE TAB CARRIES A COUNT OF FIRED ALERTS ON EVERY PANEL**, because that is how
  a reader who never opens the tab learns something fired. A quiet day adds
  nothing — never a `0` pill.
- **REMOVING TAKES TWO CLICKS** ("×" then "Remove?"). A level the family set is
  their own record and there is no undo.
- **"NEW ALERT" OFFERS ONLY HOLDINGS AN ALERT CAN BE CHECKED ON** — a quote
  symbol or a published NAV — and opens that holding's boxes rather than taking a
  price inline, so there is ONE form for a level.
- The table is a standard table (Stage 10bh): every heading sorts, every column
  but the first moves, and an absent price sorts last, never as zero.
- **NO LINE UNDER THE TITLE** (main's Stage 10cp): the counts — *reached ·
  watching · checking · not checked* — sit beside the title, what the card is
  is the title's hover, and an empty tab says *"No price alerts yet"* with the
  how-to as that headline's hover and one short line naming New alert.

#### The store tells everyone

`watchlist.ts` keeps ONE cached snapshot, replaced (never edited in place) on a
save, and tells every subscriber — `useSyncExternalStore` in `usePriceAlerts.ts`
— so a level typed on a stock page is on the All alerts tab and in the badge with
no reload; a save in ANOTHER browser tab arrives through the `storage` event. A
saved NAME rides with each entry so an alert on a holding since sold still says
what it is about; a name alone never keeps an empty entry alive.

**THE LEVELS ARE STILL PER BROWSER**, which is recorded rather than glossed: the
store is `localStorage`, exactly as it was, so a level typed on the laptop is not
on the phone's All alerts tab. Stage 10cb moved the KPI tile layouts into the
shared `GLOW_STORE` for exactly this complaint; the same move for the levels is
the next step, and is named rather than taken here because it changes what a
level IS (the family's shared record instead of one device's) and the family has
not been asked.

#### …AND EVERY LEVEL ON A LISTED SHARE ALSO GOES TO GLOW CENTRAL RESEARCH

Glow Central Research is a separate app on its own Cloudflare Worker, so a level
in this browser's `localStorage` can never reach it on its own. The work is in
TWO repositories and only this half is here:

- **`techmuns/Glow-Central-Research` PR #1283 — open and NOT merged**, because
  merging it deploys. It adds ONE shared list of the family's price levels
  (`/api/price-levels`, a Durable Object), checks every level against ITS OWN live
  price (the Upstox token it already holds) once a minute while the market is
  open, and turns a reached level into a row in its All Alerts and a card in its
  AI Alerts. Its own `CLAUDE.md` and `docs/GLOW-TEMPLATE-SYNC.md` carry that half.
- **This repo SENDS.** `src/lib/researchLevels.ts` decides what is sent and how an
  answer is read (PURE); `src/lib/researchSync.ts` sends it and remembers what
  arrived; `src/lib/useResearchSync.ts` holds the hooks and the ONE mount. Nothing
  here reads Glow Central Research's alerts back — a level reached is shown here
  by this app's own check, on this app's own price.

**WHAT IS SENT, AND WHAT STAYS HERE.**

- **ONLY A HOLDING WITH AN NSE SYMBOL.** Glow Central Research follows listed
  companies by their NSE ticker and nothing else. A mutual fund or an AIF has no
  ticker, so its levels stay here and its card says so — a send that can never
  arrive must not look like one that is waiting.
- **THE ISIN RIDES WITH THE TICKER**, because the receiving side keys its quote on
  it (`NSE_EQ|<ISIN>`) and refuses a quote that does not echo both. Taken first
  from Upstox's own instrument for that symbol (`shared/upstoxInstruments.mjs` —
  the instrument the receiving side will ask about), then from the book's own.
  Never from a name. Measured on the real book with a level on every holding:
  **161 companies sendable, 160 carrying an ISIN.**
- **THE FIVE LEVELS UNDER THE NAMES BOTH APPS USE** — `buyAt`, `sellAt`,
  `stopLoss`, `target`, `alertAbove` — never this app's field names, mapped once
  off `ALERT_DEF` so the sender cannot drift from the boxes. `null` is not set.
- **A LEVEL THE OTHER SIDE WOULD REFUSE IS NAMED HERE** — above ₹1 crore a share
  it reads as a typo — because the receiving side refuses a whole batch of 40
  for one malformed edit, and one typo must not hold back every other company.
- **TWO ENTRIES FOR ONE TICKER SEND ONE ROW**: the one saved most recently speaks,
  and the other card says its levels were not the ones sent.

**SEED, SET AND CLEAR — the receiving side's own shared-watchlist rules.** A
level typed AFTER this browser started sending is a `set` and replaces what the
shared list held. A level this browser already held BEFORE it ever sent is a
`seed`, taken only where the shared list has never heard of the company — so a
laptop opened after a month cannot overwrite a level set yesterday on a phone.
Removing the last level on a company this browser had sent is a `clear`, which
the list keeps as a record so a stale device cannot put it back. Only what this
browser had sent is ever cleared: a declined seed was never its to clear.

**"BEFORE" IS JUDGED ON THE LEVELS, NOT ON THE SAVE TIME, and the first version
of this got it wrong.** A seed was any level whose entry was last saved before
the sender started — and a note, or a tick on Watching, saves the entry. So a
month-old level with a note typed under it today went as a `set` and overwrote a
newer level from another device. It is live exactly in the rollout window, when
every send is refused and the family goes on editing. `seeds` in the sent state
records the levels this browser held when it started, as first seen; a set now
needs BOTH a save since then AND levels that differ from those. Either alone is a
wrong answer — the save time moves on a note, and a recorded seed cannot see a
level that only became sendable later.

**WHAT AN ANSWER MEANS.** `set`/`seeded` → acknowledged. `full` → refused, not
retried until something changes. `unchanged` means three things and is decided by
the list's OWN copy, returned with the answer: on a set it already held exactly
this; on a clear there was nothing left; on a seed it had heard of the company —
acknowledged if what it holds is exactly this (another tab of this browser sent
it a moment ago), otherwise DECLINED, as another device's levels or as removed
there, and not offered again until the family changes a level here.

**A FAILURE SAYS WHICH FAILURE.** `offline`, `unreachable`, `not-ready` (the route
answers 404 — the receiving side is not deployed yet, which is not an outage),
`not-allowed` (an origin it refuses), `rate-limited`, `invalid`, `error` — each
worded apart, because each sends a reader somewhere different. A refused origin
carries no CORS header, so the browser sees a bare network error; an opaque
failure is followed by ONE plain GET, which the list answers to every origin, to
tell "refused" from "unreachable". The wait is chosen by cause: fifteen minutes
for not-ready, one for offline or a rate limit, never on a timer for a refusal
trying again cannot fix, and otherwise 30 s doubling to at most 30 minutes.

**AUTOMATIC, AND ONE SENDER.** `<ResearchLevelSync />` is mounted once in the app
shell (`App.tsx`), so a level saved on ANY page goes 700 ms later (a burst of
edits goes as one request), a page load sends what did not arrive last time,
and a failed send is tried again when its wait is over, the moment the browser
comes back online, and when the tab is shown again. It is keyed on what would be
SENT — tickers, ISINs, levels — never on the book object, which changes on every
quote poll, and never on the save time, which a note moves. The Web Locks API
makes one sender across tabs, and a call while a send is running is folded into
one more send with the latest levels.

**WHAT ARRIVED IS KEPT BESIDE THE STORE**, at `glow:research-levels/v1`, never in
it: the levels are the family's, the acknowledgement is a fact about another app,
and mixing them would let a failed send look like a changed level.

**AND THE SCREEN NEVER SAYS "SENT" FOR WHAT DID NOT ARRIVE.** The line under a
holding's alert boxes says exactly one of: saved here and in Glow Central Research
/ sending / not there yet, and until when / held back because another device's
levels are there (or were removed there) / refused because its list is full / the
other entry's levels were sent / stays here only, and why. Each is a STATUS of a
few words on the line's face — *"Saved here and in Glow Central Research"*,
*"Saved here · Glow Central Research: waiting until it's ready"*, *"Saved here
only · no NSE symbol for Glow Central Research"* — and the sentence behind it is
the line's hover (main's Stage 10cp rule). `researchLine` in `researchLevels.ts`
decides both, and `readsAsSentence` is the rule it is held to. The All alerts
footer COUNTS it — *"Glow Central Research: 2 of 2 companies sent · 3 stay here
(no NSE symbol)"* — against what the receiving side acknowledged, never against
what was attempted.

**THE FOOTER IS TWO SHORT LINES, AND THE SENTENCES ARE THEIR HOVERS** — Stage
10ci's rule for a note under a table, which landed on main while this waited and
failed the first version at 281 and 450 characters. The first line says where the
prices came from (*"Live prices · Upstox · <when> · Funds on published NAV ·
Saved in this browser"*); its hover says why a statement's own price is never
used. The second is the count above; its hover says what Glow Central Research
does with a level and, for each number on the line, why. That second line and
its hover come from one function, `summaryLine` in `researchLevels.ts`, which
keeps the line to at most 150 characters on any day AND never lets it read as a
sentence (main's Stage 10cp): the reasons drop to the hover ONE AT A TIME —
why some stay here, why one was refused, why one was held back, and last why the
rest have not gone — until it fits, and the COUNTS never drop. Two things it had
to get right that the long version got wrong:

- **A LEVEL KEPT HERE AS TOO HIGH IS NOT "NO NSE SYMBOL".** The old footer put
  *"(no NSE symbol)"* after every level that stayed here, and a level above ₹1
  crore stays for a different reason. The summary counts the two apart
  (`tooHigh`), and the line names a reason only where one covers them all.
- **"HELD BACK" IS WORDED FOR BOTH WAYS IT HAPPENS** — the other side already had
  levels for that company from another device, or they were removed there.

**WHAT IS TRUE TODAY, STATED RATHER THAN IMPLIED:**

- **Until PR #1283 is merged and deployed, the live Worker answers 404 on the
  route**, so every card reads *"Saved here · Glow Central Research: waiting
  until it's ready"*, and its hover says it is not taking price levels yet and
  that they will go automatically once it is. Nothing needs doing on this side
  when it is: the next retry, page load or edit sends everything.
- **It writes only from the production origin.** The receiving side accepts a
  write from its own origin and from `PRICE_LEVEL_ORIGINS` (this dashboard's
  `pages.dev` address); a preview deployment is refused and its cards SAY so —
  *"— live site only"* — with the address in the hover.
- **No credential crosses.** The POST is `credentials: "omit"` — no cookie of this
  dashboard's edge gate goes to another site — and no token was added here.
- **Anyone who can open Glow Central Research can read the list**, the standing
  its own shared watchlist already has. A level is a price; it names no account,
  no holding size and no member.

#### The checks, and what the bug pass proved

- `npm run test:family` — `priceAlerts.test.ts`: every state, both original
  defects asserted AS defects, the store's notify/snapshot/deletion rules, and a
  book-anchored half (every NAV-priced fund checkable with the feed DOWN; a
  quotable share `checking` before the feed answers; an AIF never checkable).
  `researchLevels.test.ts` (134 checks): the rules on constructed inputs
  (including the note under an old level and every shape of the footer line — the
  count, the short cause per failure, the worst day, the too-high reason — each
  face held to `readsAsSentence`, main's Stage 10cp rule written again), a REAL
  send against a stand-in that follows the receiving
  side's rules — seeds, a set, a clear, a seed declined because another device
  holds the company, a note typed while the other side was down, each failure
  cause and its wait, 45 companies in two batches resuming after the second
  fails, two calls folded into one more send — and the real book: every ticker
  passes the receiving side's own symbol rule and the largest batch with a level
  on every holding is about 7 KB against its 32 KB limit.
- `npm run check:pages` — a Glow Central Research stand-in on EVERY walk, so no
  test can ever reach the real one. `cio-alerts` (answering) and
  `cio-alerts-nofeed` (not deployed) assert what was SENT, read off the requests
  rather than the screen: the two quoted shares as seeds, each under its symbol
  and ISIN with exactly its levels, from this page's own origin as JSON; nothing
  without an NSE symbol; the footer's count; and the footer's WORDS against its
  own attributes, because a sentence reading "2 of 2 sent" over attributes
  counting none passes every check that reads only the attributes. The two
  footer lines' HOVERS are read too, because the sentences moved there and a
  hover that went missing would take them with it. Every other route must send
  nothing, and a request from one fails that route by name.
- `npm run check:family` — the whole path on a real listed share, derived from
  the book: a typed Target goes as a SET under its symbol and ISIN → the card
  says it is there → with the receiving side down the next level fails and the
  card says why → a reload sends it → down again, and the browser coming back
  ONLINE sends it with no reload → clearing both levels sends a CLEAR → the card
  says nothing is saved. Then a separate browser context on **Playwright's fake
  clock**, because fifteen minutes cannot be waited out: the first send is
  refused, NOT asked again inside ten minutes, and sent BY THE TIMER once the
  other side is up — the one path a dashboard left open all day depends on.
- `scripts/dev/alerts-bug.sh` reintroduces 29 alert bugs and 23 sender bugs
  (`CASES=SENDER` for the sender's alone), each through the layers that can see
  it, restoring by copy on a trap and rebuilding on the way out. It runs in a
  separate `git worktree` with its own preview (`BASE=`): the pass takes about
  an hour, and for all of it the files it patches carry a bug.

**ALL 52 FIRE THEIR OWN CHECKS**, on the tree merged with #95, after a no-patch
control that came back clean:

| # | Bug put back | Fires |
| --- | --- | --- |
| 1 | the Buy level never fires — the old check left it out | 6 page checks on 3 routes · 4 `priceAlerts` checks |
| 2 | an alert with no live price is checked against the statement mark | 7 page checks on 3 routes · 11 `priceAlerts` checks |
| 3 | a Stop loss fires on the way UP | 5 page checks on 2 routes · 4 `priceAlerts` checks |
| 4 | the distance still to go is struck against the level, not the price now | 1 page check on 1 route · 2 `priceAlerts` checks |
| 5 | fired alerts sort nearest-first instead of furthest past | 1 page check on 1 route · 1 `priceAlerts` check |
| 6 | an alert on a sold holding loses the name saved with it | 1 page check on 2 routes · 1 `priceAlerts` check |
| 7 | a fired alert carries no bell | 1 page check on 2 routes |
| 8 | every row is tinted, fired or not | 1 page check on 2 routes |
| 9 | the pencil opens the holding's page but not its alert boxes | 1 page check on 2 routes · 1 `check:family` row |
| 10 | the note under the table says live prices whatever the feed did | 1 page check on 1 route |
| 11 | the empty tab draws an empty table instead of saying there are no alerts | 1 page check on 1 route · 1 `check:family` row |
| 12 | the badge counts every alert, not the ones that have fired | 2 page checks on 3 routes |
| 13 | a quiet day shows a 0 badge | 1 page check on 1 route |
| 14 | the badge shows only while the alerts tab is already open | 1 page check on 1 route |
| 15 | All alerts is added FIRST, moving the default panel | 7 page checks on 5 routes |
| 16 | a save tells nobody — the boxes and the tab go stale | 6 `check:family` rows · 2 `priceAlerts` checks |
| 17 | a saved name alone keeps an empty entry alive | 1 `check:family` row · 1 `priceAlerts` check |
| 18 | a typed 'abc' is read as blank and erases the level | 1 `check:family` row · 2 `priceAlerts` checks |
| 19 | the Target box writes to the Alert above field | 3 `check:family` rows |
| 20 | one click on the cross removes the alert | 1 `check:family` row |
| 21 | More never opens by itself, hiding what was typed under it | 1 `check:family` row |
| 22 | the New alert finder offers holdings an alert can never be checked on | 1 `check:family` row |
| 23 | SENDER: every level goes as a SET, overwriting another device's newer one | 1 page check on 2 routes · 7 `researchLevels` checks |
| 24 | SENDER: a note typed under an old level turns it into a SET | 2 `researchLevels` checks |
| 25 | SENDER: the first send records no seeds | 5 `researchLevels` checks |
| 26 | SENDER: the ISIN is not sent, so the other side cannot check its price | 1 page check on 2 routes · 1 `check:family` row · 3 `researchLevels` checks |
| 27 | SENDER: the book's ISIN is preferred to the instrument the symbol IS | 1 `researchLevels` check |
| 28 | SENDER: a holding with no NSE symbol is sent under its own slug | 4 page checks on 2 routes · 1 `check:family` row · 8 `researchLevels` checks |
| 29 | SENDER: a level the other side reads as a typo sinks the whole batch | 3 `researchLevels` checks |
| 30 | SENDER: the other side's batch size is ignored | 2 `researchLevels` checks |
| 31 | SENDER: another device's levels answering a seed are read as ours — saved | 4 `researchLevels` checks |
| 32 | SENDER: what already arrived is sent again every time | 6 `researchLevels` checks |
| 33 | SENDER: removing the last level never clears it there, so it goes on alerting | 1 `check:family` row · 2 `researchLevels` checks |
| 34 | SENDER: a level still on its way reads SENT | 1 `check:family` row · 2 `researchLevels` checks |
| 35 | SENDER: the other side not deployed yet reads as an outage | 1 page check on 1 route · 2 `check:family` rows · 2 `researchLevels` checks |
| 36 | SENDER: the send carries this dashboard's cookies to another site | 1 page check on 1 route · 1 `researchLevels` check |
| 37 | SENDER: a refusal is asked again at once instead of in fifteen minutes | 1 `check:family` row · 2 `researchLevels` checks |
| 38 | SENDER: a failed send is never tried again on its timer | 1 `check:family` row |
| 39 | SENDER: a browser coming back online does not send what was waiting | 1 `check:family` row |
| 40 | SENDER: the footer says every company was sent, whatever arrived | 1 page check on 1 route · 3 `researchLevels` checks |
| 41 | SENDER: the footer's hover sentences are put back on screen | #90's note guard and #95's prose check, each on 2 routes |
| 42 | SENDER: the reasons never drop to the hover, so a bad day runs past one line | 11 `researchLevels` checks |
| 43 | SENDER: a level kept here as too high is said to have no NSE symbol | 2 `researchLevels` checks |
| 44 | a company held only inside funds is said to be not held in this book | 1 page check on 1 route |
| 45 | SENDER: a holding this dashboard has no symbol for is said to have none | 1 `researchLevels` check |
| 46 | the price line's hover is dropped, taking its reasons with it | 1 page check on 2 routes |
| 47 | SENDER: nothing is ever sent — the sender is not mounted | 5 page checks on 2 routes · 9 `check:family` rows |
| 48 | the alert boxes' address names no tab, so it opens Position | 1 page check on 2 routes · 1 `check:family` row |
| 49 | a holding's My targets tab draws no alert card | 3 page checks on 2 routes · 5 `check:family` rows |
| 50 | the card's line puts its whole sentence back on screen | 1 page check on 1 route · 4 `check:family` rows |
| 51 | an alert no price reaches says so in a sentence again | 2 page checks on 1 route |
| 52 | the card stops saying an alert no price reaches is not checked | 1 page check on 1 route |

Case 41 is TWO checks now, #90's note guard and #95's prose check, each firing
on both routes it runs on. Each prints its route's own measured line, so the run
lists four. Rows 40 and 42 fire more checks than on the tree merged with #91,
because the Glow Central Research suite now holds every face the footer can draw
to `readsAsSentence`. Every other row from 1 to 49 reads as it did there, and
rows 50–52 are the three cases the #95 merge added.

#### Merged with main, and one check main itself was failing

Main moved from `20a3f15` to `3a5b4d1` while this branch was open — nine PRs
and a data refresh, eight stage letters — and two files conflicted:

- **`MorningCIO.tsx`**, on the line that draws a tab's label: main names the
  third tab after the chosen benchmark, this change puts the fired-alerts count
  beside the fourth. Both kept.
- **`check-pages.mjs`**: the routes, `installLiveMocks(page, opts)`, the invariant
  blocks and the `ctx` literal — resolved as a mechanical UNION: main's 92 keys
  and this change's `alertsTab` and `researchPosts`, 94, none duplicated, every
  one then confirmed to name a declared probe.

**AND TWO `check:family` ROWS FAILED ON MAIN ITSELF.** #84 added
`/corporate-actions` to the Extras group without updating the suite's list of
what Extras holds. This branch fixed it with one list, `EXTRAS_PAGES`, that both
rows read. Main then fixed the same thing the same way (#92, Stage 10cj), so on
the second merge main's version is kept whole.

#### Merged with main a second time: four PRs, and a rule that failed the footer

Main moved from `3a5b4d1` to `f55b19b` while the family's go-ahead was awaited:
#87 (Stage 10cg, fonts and colours), #89 (Stage 10ch, notes), #90 (Stage 10ci,
the notes around every table cut to one short line) and #92 (Stage 10cj, the
Private Market FIFO checks and the fifth Extras page). Two files conflicted:

- **`check-pages.mjs`** — the `ctx` literal is the union again: main's 94 keys
  (which dropped `fundExposure` and added `fundLines`, `tableNotes` and
  `foldsOnArrival`) and this change's `alertsTab` and `researchPosts`, 96, none
  duplicated, every one naming a declared probe.
- **`check-family-inputs.mjs`** — the Extras rows, where main's version is kept.

**AND #90's GUARD FAILED THIS CHANGE'S FOOTER**, which no conflict marker could
show: `cio-alerts` and `cio-alerts-nofeed` wrote 281 and 450 characters under the
All alerts table, over the two lines of 150 the guard allows. The two short lines
above are the fix. The two harness cases whose code moved were re-anchored and
four new ones added — see the bug pass.

#### Merged a third time: #88 took `10ck`, and its new page showed the card saying two false things

#88 — one company page however the company is held, including a page for a
company the family holds only inside its funds — landed the hour the family said
to merge, and took `10ck`, the letter this section held then. Of the lines naming
`10ck`, 26 code comments and 3 lines here were this change's and moved; #88's 2
code comments and 4 lines here stayed.

- **The `ctx` literal is the union**: #88's `heldTable` beside `alertsTab` and
  `researchPosts`, 97 keys, none duplicated, every one declared.
- **`StockInfo.tsx` merged without a marker**, so it was read by hand.
  `<InvestmentTools>` renders on every company page, #88's new ones included.

**AND ON #88's NEW PAGE THE ALERT CARD CONTRADICTED THE BADGE ABOVE IT.** That
page is badged *"Held only inside your funds"*. With no statement row, the card's
price chip said the company was *"not held in this book"*, and a level saved there
said the company *"has none"* — no NSE symbol. Both are false of a listed company
the family reaches through a fund. What is true is narrower:

- no STATEMENT in this book holds it, so this dashboard fetches no price for it;
- this dashboard has no NSE symbol for it.

The card says exactly that now, and so does the All alerts footer's hover.
`researchLevels.test.ts` and a check on `stock-funds-only` hold the words. Two
harness cases put the old words back, one on each side, and both fire.

#### …and a fourth time: #85 took `10cl`

#85 — an ADD TILE card on both KPI strips, and Capital Call cells that say why
saving is off — landed while the #88 merge was being verified, and took `10cl`.
Main keeps it, and this section became **`10cm`**. Of the lines naming `10cl`, 22 are
#85's and stay: 6 lines here, 13 comments in the checker, 2 in its own harness
and 1 in `Kpi.tsx`. This change's 26 code comments and 3 lines here moved.

- **The `ctx` literal conflicted and is the union**: #85's `tileAdd` and
  `callOff` beside `alertsTab` and `researchPosts`, 99 keys, none duplicated,
  every one naming a declared identifier.
- **Nothing else overlapped.** #85 changed the KPI strips, the capital-call store
  and Private Market. This change touches none of them, #85 did not touch
  `MorningCIO.tsx`, and neither side touched a generated file.
- **The ADD TILE card sits on the KPI strip above all four Morning CIO panels,
  All alerts included**, so the alerts routes were walked again rather than
  assumed — see below.

#### …and a fifth time: #86 took `10cm`, and a count of headings could not see it

#86 is the Portfolio Monitor opening on All Securities, first in its axis
control. It landed while this change's final checks were running, and took
`10cm`. **Both files then carried exactly ONE `10cm` heading, so comparing how
many times each letter appears found nothing.** Only the TITLES differ. That is
the rule Stage 10ce's fourth collision taught — compare headings, not letter
counts — and this time it was the only thing that could have caught it. Git
marked the conflict in this file only because both sections were inserted after
`10cl`. Main keeps `10cm` and comes first, and this section became **`10cn`**.

Every line naming `10cm` was placed by whether main's own copy of its file
carries it:

- #86's 9 stay: 5 lines here, and 4 code comments (two in the checker, one in
  its own harness and one in `MandateHoldings.tsx`).
- This change's 26 code comments and its lines here moved.
- One line of this section's history keeps `10cm`, because it records the
  letter it held then.

What else the merge touched:

- **The `ctx` literal conflicted and is the union**: #86's `holdingsDropdown`,
  `pickedFund`, `filterRow` and `monitorInFull` beside `alertsTab` and
  `researchPosts`, 103 keys, none duplicated, every one naming a declared
  identifier.
- **`searchIndex.ts` merged without a marker, and was read.** #86 renamed the
  security view "All Securities" and added "Holdings by category"; this change
  adds "All alerts". They are different entries, and both are kept.
- **`check-family-inputs.mjs` merged without a marker too.** #86's rows are a
  Monitor block that runs before this change's blocks, and each of this change's
  blocks opens its own address, so none of them starts on #86's page.
- **#86 changes none of the 11 files the alerts bug harness patches.** It does
  change the two checkers the harness runs, so both diffs were read. Its page
  checks are on the Portfolio Monitor's routes and one mandate page. Its walk
  code reads the Monitor's own controls. Its `check:family` rows are a Monitor
  block of their own. Not one line of either diff names an alert, a price level
  or Glow Central Research. None of the checks the harness fires moved, so its
  pass on the tree merged with #85 still stands. The full checks on this tree
  are its control — the treatment Stage 10cl gave #88.

#### …and a sixth time: #91 took `10cn`, and put the alert card behind a tab

#91 makes a holding's page five tabs — Position, Transactions, Price & returns,
Research and My targets — the same five on every holding, at `?tab=`. It landed
while the notes for the #86 merge were being written, and took `10cn`. Both
sections were inserted after `10cm`, so git marked the conflict. Main keeps
`10cn` and comes first, and this section became **`10co`**. The headings were
compared against main's tip: the merged file differs from main's by `10co`
alone, main's historical duplicates are unchanged, and nothing on main names
`10co`.

Every line naming `10cn` was placed by whether main's own copy of its file
carries it:

- #91's 13 lines here stay, and so do main's 4 code comments naming it (one
  each in `check-corporate-actions.mjs`, `cmp-bug.sh`, `held-through-bug.sh` and
  `look-bug.sh`).
- This section's heading, its two Layout pointers and its 26 code comments
  moved to `10co`.
- Three lines of this section's history keep `10cn`, because they record the
  letter #91 took and the one this section held then.
- The comments this merge writes cite the stage they describe: the six about
  #91's tabs say `10cn`, and the ones about the alerts said `10co`, this
  section's letter then.

**THE MERGE WOULD HAVE BROKEN THE ALL ALERTS PENCIL, AND NO CONFLICT SAID SO.**
The pencil, a row's name and the New alert finder all opened
`/stock/<key>#alerts`. After #91, an address with no `?tab=` opens Position,
which draws no alert boxes — so the pencil would open the right holding and not
its alerts. `AllAlerts.tsx` merged without a marker, because #91 never touched
it. All three links now read one address, `alertBoxesHref` in `priceAlerts.ts`:
`/stock/<key>?tab=targets#alerts`. The page check and the `check:family` rows
hold every link to it.

The five files that conflicted, each resolved by intent:

- **`StockInfo.tsx`** — #91's five-tab layout is taken whole. On My targets the
  card is called with the key and the name alone: this change's card works out
  its own price (`usePriceNow`), and #91's call still passed `rows[0]`'s
  statement mark, which an alert is never checked against.
- **`InvestmentTools.tsx`** — this change's card is kept. #91's edit there cut a
  caption that sent a reader to a Portfolio Monitor "plan view" that no longer
  exists, and this card never carried that sentence.
- **`check-pages.mjs`**:
  - #91's `stock-targets` check matched the old card's words — "Investment
    tools", "target price", "valuation method". The card is "Price alerts" now,
    and valuation method sits under a closed More, so the words are not on
    screen. The claim is unchanged and is struck on the card's own handles: a
    `targets` field on #91's `stockPage` probe reads the card's boxes, inputs
    and plan fields.
  - #91's check that no sentence points at the removed plan view read the
    page's `innerText`, which stops at a closed `<details>` — so a sentence under
    More would have passed it. It reads the card's whole text too now.
  - This change's check that the card's reason agrees with the funds-only badge
    was on the Position tab, which no longer draws the card. It moved to a new
    route, `stock-funds-only-targets`, with #91's own tab checks spread in.
  - The `ctx` literal is the union: #91's `stockPage` beside this change's keys,
    104 in all, none duplicated, every one declared.
- **`check-family-inputs.mjs`** — this change's walk replaces the block #91 had
  edited. It opens a holding's page by its bare address, requires the My
  targets tab (#91's row, kept as "a holding's page offers the My targets tab"),
  and clicks it by its key.
- **This file** — main's section first.

**BOTH HARNESSES WERE FITTED TO THE TABS.** In `alerts-bug.sh`, case 9 (the
pencil) patches the helper's call now, case 44 walks `stock-funds-only-targets`,
and `StockInfo.tsx` joins the files it restores. Two cases are new, numbered 48
and 49 so the numbers above do not move: the helper naming no tab, and the My
targets tab drawing no card. In #91's `stock-tabs-bug.sh`, case 14 (the
plan-view sentence) anchored on a caption this card does not have. It now puts
the sentence under the closed More, the harder place, which is what the
strengthened check is for. It also walks `stock-funds-only-targets` now, because
every stock route carries #91's tab checks.

#### …and a seventh time: #94 took `10co`, and its whole-column drag reached this table

#94 removes Private Market's explainer lines and makes a dragged column lift
whole on every table. It landed before the notes for the #91 merge could be
pushed, and took `10co`. Both sections were inserted after `10cn`, so git marked
the conflict. Main keeps `10co` and comes first, and this section became **`10cp`**.
The headings were compared against main's tip: the merged file differed from
main's by `10cp` alone, main's historical duplicates were unchanged, and nothing
on main named `10cp` yet.

Every line naming `10co` was placed by whether main's own copy of its file
carries it:

- #94's 5 lines here stay (its heading, its pointers in Layout and Conventions,
  and two lines of its own letter note), and so do its 2 comments in
  `check-pages.mjs`.
- This section's heading, its two Layout pointers, the note at its top and its
  36 code comments moved to `10cp`.
- The five lines of the #91 merge note that name `10co` keep it, because they
  record the letter this section held then. Two of them were reworded to say
  so: "this section became", and the alert comments "said" it.

What the merge touched:

- **`check-pages.mjs` conflicted on the `ctx` literal alone**, and it is the
  union: #94's `prose` beside `alertsTab` and `researchPosts`, 105 keys, none
  duplicated, every one declared. **The first resolution kept a key and lost
  its value.** It wrote `researchPosts` as a bare name, but this change's entry
  is `researchPosts: [...RESEARCH_POSTS]`, and no variable is called
  `researchPosts`, so every check on every route would have thrown. The check
  that every key names a declaration caught it before a build. A union of keys
  has to keep each key's value, not only its name.
- **`check-family-inputs.mjs` merged without a marker, and was read.** It is
  this branch's file plus exactly #94's 19 changed lines (its band-hover rows),
  and the 7 renamed comments.
- **#94's drag reaches the All alerts table, and it was driven there.** That
  table declares its columns through `SortHeader`, so it gets the whole-column
  drag with no change of its own. #94 checks the drag on `monitor-arrange`
  alone. A real mouse drag on this tree, read mid-air, carried Price now past
  Alert: one copy, of that column, holding its heading and all six rows' cells,
  the seven source cells dimmed, and the drop bar showing. After the drop the
  column sat before Alert, every body cell had followed its heading, nothing
  was left behind, and nothing sorted. That was a scratch script with a
  screenshot, not a permanent check — the way #94 measured its drag on the
  white theme.
- **ONE HOVER STILL GAVE THE OLD INSTRUCTIONS, AND NO CONFLICT COULD SHOW IT.**
  #94 rewrote `SortHeader`'s own hover, because the whole heading drags now
  rather than the handle: *"drag it, or focus the handle and press ← or →, to
  move it"*. The All alerts Edit column passes a hover of its own, and it still
  said *"drag the handle, or focus it and press ← or →"*. It uses #94's words
  now. #94 never touched `AllAlerts.tsx`, so the merge could not flag it.

**THE THREE BUG HARNESSES WERE DRY-RUN ON THE MERGED FILES, AND EVERY PATCH
APPLIES**: this change's 49, #91's 27 and #94's 27. Each anchor was found exactly
once in a copy of the tree, so none would report NOT A RESULT. None was re-run:

- `alerts-bug.sh` — #94 changed two of the 17 files it restores, the two
  checkers, and none of the lines its cases patch or the checks they fire. The
  one component #94 changed that the All alerts table draws with is
  `SortHeader`, and no alert check reads the header's markup. The drag on that
  table was driven directly, above.
- `stock-tabs-bug.sh` (#91's) — #94 changed none of the four page files it
  patches, and none of its checks.
- `pm-prose-bug.sh` (#94's) — this change touches none of the files it patches
  but the checker, and none of its checks there: they are on Private Market and
  `monitor-arrange`, and this change's walks are elsewhere.

So the full sweep on that tree was the control for all three, the treatment
Stage 10cl gave #88.

#### …and an eighth time: #95 took `10cp`, and its rule reached the alert card

#95 takes the explainer lines off every page but Private Market: a card's
subtitle, a tile's hint, a page's subtitle and an absence's paragraph become
hovers, and a new check on every route fails any line that reads as a
sentence. It landed while the #94 merge was being verified, and took `10cp`.
Both sections were inserted after `10co`, so git marked the conflict. Main
keeps `10cp` and comes first, and this section is **`10cq`**. The headings
were compared against main's tip: the merged file differs from main's by
`10cq` alone, main's historical duplicates are unchanged, and nothing on main
names `10cq`.

Every line naming `10cp` was placed by whether main's own copy of its file
carries it:

- #95's 2 lines here stay (its heading and its Conventions pointer), and so do
  115 of its 117 code comments. The other 2 were on main's old alert card, in
  `InvestmentTools.tsx`, which this change replaces (below).
- This section's heading, its two Layout pointers, the note at its top and its
  36 code comments moved to `10cq`.
- The four lines of the #94 merge note that name `10cp` keep it, because they
  record the letter this section held then.
- The 20 comments this merge writes about #95's rule cite it as main's Stage
  10cp, because that is the stage they describe.

Four files conflicted:

- **`InvestmentTools.tsx`.** #95 edited main's OLD card, the one this change
  replaced: it cut the "Plan — …" caption to one word and moved the
  target-weight footnote into that label's hover. This change's card is kept,
  and the rule is applied to it instead. Its subtitle is a string now, so it
  is the title's hover. The link to All alerts, which sat inside that
  subtitle, is a short *"All alerts →"* beside the price chip. The target
  weight's meaning was already that box's hover, with *"0 = hold none · blank
  = not decided"* a short status under it.
- **`check-pages.mjs`**, on the `ctx` literal alone. It is the union: main's
  104 keys (#95 added `cgMissing`) plus `alertsTab` and `researchPosts:
  [...RESEARCH_POSTS]`, 106, none duplicated, every one declared.
- **`stock-tabs-bug.sh`** (#91's). #95 re-anchored its case 14 onto main's old
  card's one-word "Plan" label, which this card does not have. The case keeps
  this change's anchor: the plan-view sentence put back under the closed
  More, the harder place for the check to find it.
- **This file** — main's section first.

`MorningCIO.tsx`, `StockInfo.tsx`, `searchIndex.ts` and `App.tsx` merged
without a marker and were read. Each differs from main by this change's own
lines alone: the All alerts tab and its count, the My targets tab's card, the
search entry and the sender's mount.

**#95's RULE APPLIED TO THIS CHANGE'S OWN LINES, AND NO CONFLICT COULD SHOW
IT.** Its check runs on every route, this change's included, and fails a
visible line past 60 characters that carries ten or more lower-case words.
Measured against that rule, six lines this change drew were sentences:

| Line | Characters · lower-case words |
| --- | --- |
| the card's research line, once sent | 122 · 13 |
| the same line, while Glow Central Research is not deployed | 185 · 21 |
| the All alerts price line, live | 106 · 11 |
| the same line, with no live prices | 137 · 21 |
| the empty tab's how-to | 147 · 26 |
| the card's can't-be-checked note | 114 · 19 |

Two subtitles also carried JSX — the card's link, and the tab's counts — where
#95's `Card` now takes only a string. Each became a short status with its
sentence in the hover:

- **`researchLine` moved into `researchLevels.ts`, pure**, with `failShort`
  beside `failSentence`. The card's line says *"Saved here and in Glow Central
  Research"* (39 characters, 3 lower-case words), or *"Saved here · Glow
  Central Research: waiting until it's ready"* (60 · 5), and the sentence is
  the line's hover.
- **`readsAsSentence` is #95's rule written again on purpose**, twice: in
  `researchLevels.ts`, so the card and the footer pick, before they draw, a
  form the check will never flag; and in `check-family-inputs.mjs`, so the
  walk that reads the card is not the code under test.
- **`summaryLine` drops the footer's reasons one at a time** until its line is
  short AND not a sentence. The counts never drop.
- **The price line is items**: *"Live prices · Upstox · <when> · Funds on
  published NAV · Saved in this browser"* (90 · 6), with why a statement's
  price is never used as its hover.
- **The tab's counts moved up beside its title**, because a hover carries only
  a string and the counts are figures.
- **The empty tab's how-to is its headline's hover**, with *"Set one with New
  alert above."* on the face.
- **The can't-be-checked note is a status**: *"Saved · not checked here — no
  price"* (35 · 5), with the reason as its hover.

**THAT LAST NOTE WAS ON NO WALK, SO THE PROSE CHECK COULD NOT HAVE FOUND IT.**
It shows only where a level is set on a holding no price reaches, and every
alert route walks a priced one. So a new route, `stock-aif-targets`, sets a
level on the book's largest AIF (`ALERTS_BOOK.aif`, derived) and holds four
claims there beside #91's tab checks: the level is in its box; the price chip
says there is no price and never shows the statement's mark; the note is a
short status whose hover names the reason; and the level stays here, with a
status saying why. Putting the old sentence back fails both that route's note
check and #95's prose check.

**THE CHECKS FOLLOWED THE WORDS TO THE HOVERS.** Every check that read a
sentence off the card or the tab reads the face and the hover apart now, and
requires both: a face that is a status, and a hover that says why. In
`check:family` that is two new rows — the fund card's line, and the sent and
waiting lines — so it has 126 rows, not 124. In `test:family`, the Glow
Central Research suite has 134 checks, not 116: every face the card or the
footer can draw is held to `readsAsSentence`. No other suite's count moved.

The alerts bug harness gained three cases — the card's line putting its whole
sentence back on screen (50), the can't-be-checked note back as a sentence
(51), and that note gone (52) — and three were re-anchored onto the new faces
(10, 42 and 43).

#### The verification

Every result below is from the tree that ships: this change merged with #95
(main `9dd55a6`), and each was run again there rather than carried across. The
code that ships is `13a023c`; every commit after it changes only these notes
and the route list of #91's bug harness.

`build` · `tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund
35, buoyant 42, classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22,
neoFlows 8, golden 140 — 2 not checked, 0 blocked) · `test:family` (49 suites,
2,686 checks, 0 failed — main's 2,500, plus 52 in `priceAlerts.test.ts` and
134 in `researchLevels.test.ts`; its four NOT CHECKED lines are main's: three
managers' bridges with no performance history on their capital's own date, and
the fund-NAV basis gate) · `check:family` **126/0**, which is #95's own 93 plus
this change's 33 · `check:pages` **302 combinations clean, 0 invariant
failures** · `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` BYTE-IDENTICALLY: a price level is the family's own input
and never reaches the book. CI (`build`) and Cloudflare Pages are green on the
final commit.

**THE SWEEP RECONCILES WITH MAIN'S OWN.** Stage 10cp records 290 combinations
clean on main. This change adds six routes — `cio-alerts`,
`cio-alerts-nofeed`, `cio-alerts-empty`, `cio-alerts-badge`,
`stock-funds-only-targets` and `stock-aif-targets` — each walked in both themes,
which makes 302. The fourteen invariants not checked were read out of the log by
route, and all fourteen are main's claims:

- **ten KPI-tile lines** (every tile on this book carries a figure), one per
  Morning CIO route: main's six, and this change's four alerts routes;
- **two Private Market cost lines** (every private holding reports a cost);
- **one redeemed-account line** on `private-market-folios`;
- **one crumb** on `holdings-unknown`.

None of this change's own checks abstains, and #95's prose check passes on every
route, this change's six included. The sweep served the working copy's own
build; for its last seventeen minutes the alerts bug pass was running beside it,
in a separate worktree with its own preview, and it came back clean anyway.

**THE BUG HARNESSES, ON THIS TREE:**

- **`alerts-bug.sh`, all 52 cases**, after a control that came back clean (its
  five routes clean, `check:family` 126/0, both suites clean). The table above
  is that run. Every row but 40–42 reads as it did on the tree merged
  with #91, and 50–52 are new.
- **#91's `stock-tabs-bug.sh`**: the four cases whose checks run on the My
  targets tab ran again, now over 37 stock routes with `stock-aif-targets` added:
  1 (every tab drawn at once) fires on all 37, 4 (the tabs reordered) on all 37,
  5 (a tile dropped) on the 32 that draw tiles, and 14 (the plan-view sentence,
  under the closed More) on `stock-targets`. The other 23 were dry-run on the
  merged files, and 22 apply. None of those 22 patches the alert card, so the
  full sweep above is their control. The 23rd is case 11 — every mandate listed
  under a holding's name — and it does not apply on MAIN either: #95 rewrote the
  line it anchors on and did not move the anchor. That is main's harness to
  fix, and it is named here rather than fixed in a merge.
- **#95's `pages-prose-bug.sh` (42 cases) and #94's `pm-prose-bug.sh` (27)**
  were dry-run on the merged files, and every patch applies. Each patches main's
  lines and fires main's checks, and this change edits neither, so the full
  sweep above is their control on this tree.

