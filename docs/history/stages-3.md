# Stage history, part 3 (Stage 10bo → 10cd)

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 14158–19528). CLAUDE.md now carries the condensed rules; this file is the record. -->

### Stage 10bo — ONE TABLE OVER BOTH DATED RECORDS, AND THE TWO COLUMN BLOCKS THAT KEEP IT HONEST

*"Open PR and do not merge until i tell you to."* · *"in the Transactions page
why are there 'capital in and out/trades' toggle switch provided when… There is
no need of that. Just show all the transactions of different categories in the
Category filter page, and then same in the Asset classes, buckets. Show all the
data in the same table just like as it is in the holding page. Suppose there is
a transaction in a PMS mandate, then show the name of the PMS mandate and after
clicking on that row we should be able to see drop down of all the transactions
within that PMS. Stream should be applicable to all of the categories be it
direct equity or AIFs. In short, just remove the toggle button and show
everything within the same table. Based on different categories or asset
classes. Or. Baskets."*

Stage 10bi put the two dated records behind one control and recorded at length
why they must not become one table. **The family have now asked for one table,
and the reasoning that section gives is exactly what makes this safe rather than
what forbids it: the objection was never to one ROW, it was to one COLUMN.**

#### `src/lib/txnLedger.ts` — the row merges, and the money does not

The two rollups already key the same way, which is why the merge is a join
rather than a rewrite:

```
capitalRollup       one group per ACCOUNT
rollup(…, "auto")   one group per MANDATE (a PMS account) or per SECURITY
```

A mandate's two halves therefore land on one key by construction, and a security
row cannot collide with either. Measured on the rendered page: **34 rows, of
which 11 carry a capital record and 26 a trades group — and THREE carry both.**

**THE COLUMNS ARE WHAT CARRY THE DISTINCTION THE TOGGLE USED TO.** Two blocks,
adjacent and never summed:

| | |
| --- | --- |
| **Capital** | How it went in · Capital in · Capital out · Net invested · Invested on |
| **Trades** | Trades · Bought · Sold · Realized P&L · Traded between |
| **The account** | Value today · Gain · Return |

**SUMMING THE TWO BLOCKS REPORTS ₹291.9 Cr WHERE THE FAMILY PAID IN ₹221.5 Cr**
— ₹221.5 Cr plus the ₹70.4 Cr their managers spent inside those accounts, all
three of them the page's own printed total. A ₹70.4 Cr overstatement under the
column a reader scans for, on a figure that looks entirely ordinary beside its
neighbours. Per row it is Green Lantern 510861 ₹10 Cr + ₹1.75 Cr, SVAN 8710067
₹14.5 Cr + ₹1.31 Cr and SVAN 8710090 ₹9.5 Cr + ₹85.4 L.

**AND THE FIRST MEASUREMENT OF THAT OVERLAP WAS WRONG TWICE OVER.** It was taken
by walking the archive's `transaction-statement` documents directly, and it
found ONE overlapping account carrying ₹3.51 Cr of dealing — which is the figure
Stage 10bi states, and it is where this change's own first draft started. Both
halves of it are wrong:

- **`loadTransactions` applies `AUTHORITATIVE`**, which also names SVAN's SEBI
  INVESTOR REPORT for transactions, so **three** accounts carry both records
  rather than one;
- and it **supersedes and dedupes**, so Green Lantern's own dealing is
  ₹1.75 Cr on the tape the page draws rather than the ₹3.51 Cr a raw sum of
  every matching document reports.

**THE RENDERED PAGE IS THE ONLY PLACE THAT QUESTION IS SETTLED**, and it was
settled by reading it rather than by reasoning about which report types the
archive happens to file a trade under.

**A SECTION DISAGREEMENT DRAWS TWO ROWS RATHER THAN PICKING ONE.** The section is
part of the key, exactly as it is inside `rollup`. The two halves reach a section
through different helpers — `forAccount` from the account's own holdings,
`forTxn` from the trade — and where those disagree the account draws a capital
row in one section and a trades row in the other. Measured, that is ZERO rows on
all three axes; "measured today" is not "true by construction", so the honest
failure is two rows and not a guess, and `txnLedger.test.ts` asserts it on a
fixture that forces the disagreement.

#### The drill-down, which is the half the family asked for by name

*"after clicking on that row we should be able to see drop down of all the
transactions within that PMS. Stream should be applicable to all of the
categories be it direct equity or AIFs."*

A row opens into whichever halves it has, each under its own heading: **what the
family paid in and took out** (the dated movements, with the statement's own word
for each) and **what was dealt inside** (one line per security, opening into the
dated trades). Green Lantern 510861 shows both. `data-row="instrument"` and
`data-row="tranche"` ride on the second exactly as they did, so every claim about
a collapsed line still carrying its dated rows is struck on the same handles.

It is a table of its own inside the expanded row rather than indented rows in the
table above, because the columns it needs are the trades block's and not the
fifteen the row carries.

#### What the merge cost, and the figure it nearly cost silently

**THE TRADES' OWN NET INVESTED IS GONE.** The trades table had one (bought less
sold) and there is one Net column now, which is the FAMILY'S. Two nets under one
heading is a column meaning two things; two net columns is one more for a
subtraction of two adjacent cells a reader can do by eye. That is the one thing
dropped, and it is absent with its reason wherever a row carries no capital
record.

**AND GAIN WAS DROPPED BY ACCIDENT AND CAUGHT BY NAME.** Value today, Gain and
Return are the three the family asked for together at Stage 10ai; the first cut
of this kept two. `check:pages` fired on it — its Return check requires the
publishing CONDITION to be stated on the Gain head as well as the Return one,
because a reader meeting the first dash has to find it somewhere — so a figure
lost in a layout change failed rather than passing quietly. That is what that
clause was written for, arriving two stages later than the bug it was written
against.

#### Four columns can never carry a total, and each says so

Two are spans of DATES, one is a RETURN struck per row against that row's own net
invested, and one is a column of NAMES. They render `AbsentCell` WITH A REASON
rather than sitting blank — the rule the Portfolio Monitor's per-category totals
row already follows, arriving at a footer one table over. **The first cut left
all four blank**, found by reading the rendered footer rather than by a check.

**AND `Value today` STATES ITS OWN DENOMINATOR.** It is summed over the ACCOUNT
rows alone — a security row is an instrument dealt across however many accounts
carried it and has no account value to contribute — so the total names how many
of the rows it covers rather than reading as a figure over all of them.

#### The checks moved to the table that draws them, and three addresses went

`txnRecordChecks` asserted a toggle that no longer exists. It is
**`txnMergedChecks`**, run by every transactions route — which it says and, as
the pass below measured, did not do until the pass found it — and it makes SEVEN
claims where the old one made four — because a removal is verified by asserting it
happened, and this one can fail in shapes the toggle never could:

- the control is gone, in BOTH the shapes it could come back in (its wrapper and
  its buttons);
- **and the two tables it used to swap went with it** — the half that catches a
  build which deleted the control and left both tables stacked, where every
  figure in either is correct on its own and the page is exactly what the family
  asked to be rid of;
- one table is drawn, and only where there are rows for it;
- it is titled for the TABLE rather than for one of the records in it;
- **each money block ties to its OWN rows** — the claim the pass below had to
  write, because the one it replaced compared a figure with a sum of itself;
- both halves are on screen, neither silently lost;
- and **three rows carry both**, derived from the page's own counts
  (`capital + trades − rows`) rather than from a literal. A merge that keyed the
  halves apart draws 37 rows instead of 34, every figure correct, every total
  correct, and the account the family opened split across two lines.

**THREE ROUTES WENT, AND EVERY INVARIANT ON THEM CAME HOME.**
`monitor-txn-trades`, `monitor-txn-direct-capital` and
`monitor-txn-basket-trades` each existed only to click through to the other
branch, and each would now walk a page identical to its sibling. Their claims
moved onto `monitor-txns`, `monitor-txn-direct` and `monitor-txn-basket` — a
check that stops running because a table moved is a check that silently stopped,
for the fifth time in this file.

**AND TWO OF THOSE MOVES MADE THE CLAIM STRONGER.** The basket factory's
`sectionsOf` read a different handle per record and reads the table's own
HEADINGS now, which a row whose `data-dated-section` disagreed with the heading
it sits under would pass. And the Direct Equity capital claim had fallen through
to matching an absent-state sentence the page correctly did not print; with both
halves in the DOM at one address it comes home, and it gained a second half —
that the empty Capital columns NAME the document that would fill them.

#### The defect widening one check found, which nothing else could see

**`mergeDatedRecords` RETURNED THE MAP'S INSERTION ORDER** — every capital row,
then every trades row — so **23 of this book's 34 rows were in no order at
all**, under a card whose default the family asked for by name (*"by default the
transactions show from newest to oldest"*). Both rollups sort their own output
and the merge threw it away.

**THE ORDERING CHECK DID NOT SEE IT, because it read `mineRows`** — the rows
carrying a capital record, 11 of the 34 now that one table covers both. The
other 23 could have been in any order and it would have passed, which is the
family's own complaint (*"something is October, something is December, something
is 2023. It's all very chaotic"*) surviving inside the check written for it.
Widened to `data-dated-last`, the row's own span across both halves, it fails —
and that is how the defect was found, not by reading the code.

**AND "LARGEST FIRST" RANKS ON THE ROW'S BIGGEST SINGLE BLOCK**, never on the two
added. `Math.max` of what the family paid in and what their managers dealt is
the largest figure the row actually carries; adding them would be the ₹70.4 Cr
defect arriving as an ORDER rather than as a figure, **which is worse, because
no cell on the page would contradict it.**

#### Four helpers lost their last on-screen caller, and only two were dead

With one table over both records, `sectionRollup` (txnRollup), `capitalTotals`
and `capitalSectionRollup` (tranches) and `rollupTotals` (txnRollup) all stopped
being called by a page. **They are not the same case, and treating them as one
would have been wrong in both directions.**

- **`sectionRollup` and `capitalSectionRollup` are SUPERSEDED.** Each grouped one
  record's rows under the shared headings; a section holds rows of BOTH kinds
  now, which is a different row type, so `datedSectionRollup` replaces them and
  neither has a caller left. **Deleted**, the `exportDeck.ts` treatment, rather
  than left exported and dead for a future session to wire back believing it
  load-bearing.
- **`capitalTotals` and `rollupTotals` are NOT.** The first cut of `datedTotals`
  REIMPLEMENTED both — two definitions of the capital footer and two of the
  trades one, free to disagree the first time either was edited, which is the
  failure `holdingBucket` and `costCoversSet` were each extracted to stop. It
  CALLS them now, so there is one definition per half and their own suites go
  on checking a live path rather than a function nothing runs.

**AND `datedTotals.net` OVERRIDES ONE OF THEM DELIBERATELY.** `capitalTotals`
reduces to `0` over no rows, which is right for a table of capital rows and
wrong here: a table with no capital half at all would print ₹0 net under a
column that is refusing to state one. `Value today` is this module's own for
the opposite reason — it is struck over the ACCOUNT ROWS, which includes the
nine mandates that publish no dated capital record and are worth ₹138.7 Cr
between them.

#### And a field that carried the right answer into no caller

`DatedRow.movements` — the dated rows behind a row, both halves — was computed,
emitted as `data-dated-movements` and read by its own test and nothing else. The
two counts are already columns (How it went in, Trades) and a third summing them
is a figure under no heading. **Deleted**, and the suite asserts the two counts
at their own halves instead. Found by reading the change back rather than by a
check, which is where this repo has found three of these before.

#### A total is the worst place for a parser that produces a plausible number

The Trades cell renders its count and a `284B/178S` split with nothing between
them, so `innerText` is `462284B/178S`. **Stripping non-digits yields
462284178; taking the leading run yields 462284.** Both are numbers, both are
wrong, and this file already records the row-level version of the same trap at
Stage 10p — where the fix was to read `data-trades`.

Three checks were written against that cell before the trap was noticed, so the
footer emits its figures as **`data-foot-rows` / `-accounts` / `-contributions` /
`-withdrawals` / `-trades` / `-sells` / `-realised-of`**, beside the cells that
render them. The claims that are about what a reader SEES stay on the rendered
text and are reconciled against the handles — the realised fraction must be on
screen beside the figure AND be the pair the footer computed, so a cell printing
some other two numbers cannot satisfy it.

**AND THE ROW'S RETURN CELL MOVED TWICE.** `mineRows` read `tr.cells[7]`, which
on the merged table is BOUGHT — a real money figure in place of a percentage.
It is 13 now, and the column list is written out in the comment beside it rather
than counted, because it moved again when Gain came back.

#### The pass found three defects, and all three were IN THE CHECKS

Eleven bugs, each applied on its own, rebuilt, swept and restored. Eight fired
exactly the claim they exist for. **The three that did not are the whole reason
this is run**, and the first is the most expensive shape of it: a check that
cannot fail on the single strongest claim the page makes.

**1. SUMMING THE TWO MONEY BLOCKS PRODUCED A CLEAN SWEEP.** `paidIn: c.paidIn +
(t.bought ?? 0)` — the one thing the merge must never do, and the defect the
whole column design exists to prevent — reported **10 of 10 combinations
clean**. The check was CIRCULAR: it read the RENDERED Capital-in cell as
`paidIn` and the RENDERED Bought cell as `bought`, and asserted that neither
equals `paidIn + bought`. Once the bug has folded one into the other the
rendered pair is (₹291.9 Cr, ₹70.4 Cr) and the figure it compares them against
is ₹362.3 Cr — which neither is, so it passes. **It was comparing a bugged
figure with a sum of itself**, which is this file's own *"a check that compares a
figure with its own copy cannot fail"* arriving in the one place it could do the
most damage.

It is a TWO-PATH RECONCILIATION now: the footer comes from `datedTotals`, which
calls `capitalTotals` and `rollupTotals`, and the ROWS come from `capitalRollup`
and `rollup` directly — so summing the rendered row cells and setting them
against the rendered footer cell is two derivations of one figure rather than
one derivation read twice. The bound is the page's own printing precision
reproduced, (N+1) x 0.05 Cr over N cells rendered compact to one decimal, never
a tolerance widened until the figures fit: the defect it exists for is worth
₹70.4 Cr against an allowance of ₹0.60 Cr. **An absent cell is skipped and never
read as zero** — a row legitimately withholds one side under a side filter, and
blending that in as ₹0 is `sumOrNull`'s own rule failing inside a checker. And
it is exercised from BOTH ends, by a second case that moves a ROW away from the
footer rather than the footer away from its rows.

**2. THE MERGED-CARD CLAIMS REACHED TWO OF THE EIGHT TRANSACTIONS ROUTES.** Bug
1 put the record toggle back and fired on `monitor-txns` and
`monitor-txn-basket` **and on nothing else** — while `txnMergedChecks`'s own
doc comment said "run by every transactions route". Six addresses that draw this
card were asserting nothing whatever about it: the toggle could have come back
on `monitor-txn-direct`, on either side filter, on the security axis or on
either drill-down, and the sweep would have reported clean.

**AND THE CLAIMS DO NOT ALL HOLD EVERYWHERE, which is why the repair is a
SPLIT rather than a wider spread.** Five are true of any view of this card —
the toggle is gone, the two legacy tables went with it, ONE table is drawn, it
is titled for the table rather than for one of the records in it, and each money
block ties to its own rows. The other two COUNT the table's halves, so they need all of it: `monitor-txn-direct`
narrows to a section whose rows legitimately carry no capital record, and
`monitor-txn-in` / `-out` narrow one half of the capital record itself.
Spreading all six blindly would have FAILED A CORRECT PAGE; leaving it at two
let the control come back on six addresses unseen. So `txnMergedCore()` is the
five and goes everywhere, and `txnMergedChecks()` is the seven and stays on the
routes that draw the whole table.

**3. A SUMMABLE COLUMN WAS SITTING BLANK, AND THE CHECK COUNTED TO FOUR.** Gain
was not in the footer's `cells` map at all. Nothing MISALIGNED — `TrFoot` fills
an untotalled declared column rather than skipping it, which is what keeps every
later cell under its own heading — so the only symptom was an empty box between
Value today and Return. And *"the columns with no total name why"* required four
cells to NAME a reason; there are exactly four, so a fifth untotalled column
satisfied it by arithmetic.

**GAIN IS AN AMOUNT AND RETURN IS A RATE, which is the whole of why one gets a
total and the other cannot.** Value today carries one with a coverage count and
Return refuses one because its every cell sits on a different denominator; Gain
is an ordinary rupee figure over the account rows that publish one, so it now
carries a total and the same coverage count — `CapitalGroup.gain` is published
only where the contribution history provably reaches inception, so a row on a
partial denominator contributes none and the cell says how many it covers.

The claim is struck on EVERY footer cell now rather than counted: a cell carries
text — a figure, or an em dash whose `title` says why — or it is a finding. An
`AbsentCell` renders a dash, so a genuinely absent total is TEXT and only a
filler is empty. The four that can never carry one are still required to say so,
so the claim cannot be satisfied by a footer that simply totalled everything.

#### Merged with main TWICE, and the second one brought all three hazards at once

This branch was held open at the family's request (*"Open PR and do not merge
until i tell you to."*), and main moved twice while it waited. **Both merges are
recorded, because only the second cost any work and which one would was not
predictable from the size of the diff** — it is predictable from whether the
other side's change is a RULE over every route or a change to some of them,
which is the reading Stage 10bk arrived at and this pair confirms.

**THE FIRST WAS FREE.** `c25c5b8`, the daily Polycab data refresh, is two
GENERATED files (`src/data/polycabLive.ts`, `docs/POLYCAB-LIVE.md`) and no stage
heading. **Zero file overlap**, so none of the three hazards had a subject —
nothing to union, no letter to move, and nothing to splice in a generated file.
Checked one at a time rather than assumed, then verified (`build-book`
byte-identical, build green, `ONLY=polycab,monitor-txns` clean) and pushed.

**THE SECOND BROUGHT THE IDENTICAL PAIR FOR THE TENTH AND ELEVENTH TIME, AND A
THIRD BESIDE THEM.** `585cfbe` (#64) is fifteen files, five commits and two
stage sections:

- **THE LETTER COLLIDED AGAIN.** Main wrote `### Stage 10bm` **and**
  `### Stage 10bn`; this branch had written `10bm`. Main's keep both and this
  section is **10bo**. Nine `10b[mn]` references sat OUTSIDE the conflict hunk,
  auto-merged from both sides into one file — so `10bm` meant two different
  sections depending on who wrote the line. **Each was read before any moved**:
  seven are this branch's (all `10bm`) and two are main's (both `10bn`, the NAV
  seam in **Layout** and the `build-fund-navs` entry under **Build**), which were
  left alone. Main's own two internal cross-refs sit inside its hunk and mean
  ITS `10bm`, so they did not move either. Measured afterwards: **79 stage
  headings, every letter unique.**
- **AND THE `ctx` LITERAL CONFLICTED ON ONE LINE.** Resolved as a **MECHANICAL
  UNION**, and the diff is the whole reason it cannot be done by taking a side:
  this branch's `txnMerged` and `datedTable` are RENAMES of main's `txnRecord`
  and `tradesTable`, so main's side carries two keys this change deleted — while
  `stockMark` is main's genuinely new probe and had to come across. **79 keys, no
  duplicates, and every one verified to name a variable declared in the merged
  file**, because a key naming a probe that no longer exists throws inside the
  check and is reported as a broken matcher rather than as a clean page.
- **AND TWO MORE FILES OVERLAPPED AND MERGED WITHOUT CONFLICTING**, which this
  file's own rule says is exactly when to check by hand. `scripts/test-family.mjs`
  kept both sides' suites. `src/pages/PortfolioMonitor.tsx` is the one that
  mattered: main added `navPriced` / `navDate` at four sites in a file this branch
  had largely rewritten, and all four are present in the merge. Neither was taken
  on trust because git did not complain.

**AND THE GENERATED FILES WERE RE-DERIVED RATHER THAN TRUSTED**, on both merges:
`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
byte-identically, with the same md5s as before either merge. Main's own
`src/data/fundNavs.ts` and `src/data/polycabLive.ts` arrived as straight
take-theirs — this branch touches neither — and were confirmed byte-identical to
main's copies rather than assumed to be.

#### The verification

`build` · `tsc` · `test:ingest` · `test:family` (a new `txnLedger.test.ts`, 46
checks: the merge, the two blocks never added, an absent half never zero, a
security row with no account to value, the section disagreement, and — anchored
on the generated book — that `capitalRollup`'s own account value and the merge's
`valueOfAccount` agree to the paisa, which is two paths to one number rather
than a figure compared with its own copy) · `check:family` **82/0** ·
`check:pages` **186 combinations clean**, with the same **six** EVIDENCED
abstentions Stage 10bl records and not one of them introduced here.

**THAT COUNT WAS RE-MEASURED TWICE AND IS A FACT ABOUT NEITHER BASE IT PASSED
THROUGH.** This branch's own pre-merge sweep was **180** — 186 less the six
combinations the three removed addresses walked — and the two merges below then
moved the base under it. Measured on the route table rather than reasoned about:
the base carried **87** routes, this branch removed three (84), main's Polycab
refresh added none, and main's published-NAV work added three
(`stock-cmp-split`, `stock-cmp-unmarked`, `stock-cmp-nav`), so the merged tree is
back to **87** and 180 + 6 = **186**. This is the case where the arithmetic DOES
reconcile — and it reconciles only because the sweep was run again, which is the
point every stage in this file makes about its own count. A number carried across
from another branch's paragraph would have been wrong in the one direction
nothing on screen could show.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control: nothing here touches the ingest, and a
presentation-layer merge that moved a generated figure would not be one.

`scripts/dev/txn-merge-bug.sh` is the bug-reintroduction harness, committed so
the next session's verification is one command rather than eleven manual edits.
Two things about running it cost real time here and are worth the next session
knowing:

- **ITS SNAPSHOT LIST IS LOAD-BEARING AND HAD TO BE WIDENED MID-SESSION.**
  `tranches.ts` was left out of it, so the restore could not put that file back
  and an edit made while the harness ran was silently reverted — the
  untracked-file hazard this file already records twice, arriving through a file
  that was simply not listed. **Never edit a file the harness snapshots while it
  is running**: the restore will undo it, and the next sweep reports a tree
  nobody chose.
- **AND A WAITER THAT MATCHES ITSELF READS AS FOUR HARNESSES.** `pgrep -f
  txn-merge-bug.sh` run from a shell whose own command line contains that string
  matches the waiter, the monitor and the harness, so `ps | wc -l` reported four
  instances and three of them were killed as duplicates — twice. This file
  already records the never-exits half of that trap at Stage 10ba; this is the
  over-counting half. Match the SCRIPT (`awk '$2=="bash" && $3=="scripts/…"'`),
  and the harness now takes a `flock` so a genuine second copy refuses rather
  than racing one `dist/` and one snapshot.
- **AND ITS SUITE VERDICT READ BACKWARDS ON EVERY CASE, which is the defect this
  harness exists to find, in the harness.** `run_suite_case` piped the suite into
  grep and took the PIPELINE's status as the verdict, and two things made that
  always announce a pass: the suite's own output carries **~1,700 NUL bytes**, so
  grep classifies it as binary, SUPPRESSES its matching lines and prints a
  warning instead of them; and `set -o pipefail` turns a FAILING suite's non-zero
  exit into the `||` branch — the one that prints "SUITE clean". Both halves
  therefore printed it. **Measured after the fix: all three suite-only cases DO
  fire** (2, 3 and 2 failures) where all three had reported clean, so nothing
  those cases claimed had ever been checked. The verdict is the suite's own exit
  status now and the NULs are stripped before grep sees them. A check that can
  only ever report a pass is worse than no check: this file's own rule, arriving
  through a pipeline rather than through a page.
- **AND TWO PATCHES WERE NOT RESULTS RATHER THAN FINDINGS**, each fixed at the
  cause rather than by loosening the case. One gated the trades half on `trd &&
  false`, which TS folds to a constant and refuses to build; a comparison against
  a real string is false at runtime and typechecks. The other targeted
  `sumOrNull(trd.map(...))` in `datedTotals` — a line that never existed, because
  that half is DELEGATED to `rollupTotals`, which is the point of the delegation
  and is where the injection belongs. **The harness reporting both as NOT A
  RESULT rather than as clean runs is what made them findable**, which is the
  whole reason that branch exists.
- **AND A HARNESS WALKING FIVE ROUTES CANNOT CHECK A FACTORY THAT REACHES FIVE.**
  Its route list was the five addresses the merged card's counting claims run on,
  while `txnMergedCore()` claims all EIGHT — so the very defect this pass found
  first time round (the claims reaching two of eight) was one the harness was
  blind to by construction. It walks all eight now.

### Stage 10bp — A CATEGORY III AIF IS LISTED EXPOSURE, AND A TRUSTEE IS NOT THE TRUST

*"open PR and do not merge until i tell you to."* · *"Sanshi, Buoyant and
Carnelian. These are not private market investments. They should come under
AIFs. In fact they are already in AIF. Is there double counting happening of a
few funds? Please check and confirm and find the root cause of this and fix.
Bharat Jaisinghani Trust looks empty on holdings, so check that as well since
the client has provided half of the statements already."*

Three questions. The second is answered by a measurement and needed no change;
the other two are one classification defect each, and both are the shape this
file has now recorded nine times — **a rule that was true of the book it was
written against and false from the next drop, which nobody re-measured.**

#### 1. The double count: measured, and there is none

Answered first because it is the one that could have invalidated everything
else. Measured over the generated book rather than reasoned about:

```
Σ every position, raw                  ₹713.5606 Cr
Σ counting each dedupeGroup once       ₹710.3879 Cr
BOOK_SUMMARY.totalValue                ₹710.3879 Cr
```

The ₹3.17 Cr between the first two is **the two duplicates this book already
carries and already tags** — 360 ONE Special Opportunities under CRN37702 and
CRN60117, and Transition Venture Fund I under both family trusts — and the
consolidated total is the deduped sum, to the paisa. Searched for the failure
that would be invisible: **securityKeys held in more than one ACCOUNT at an
identical quantity with no `dedupeGroup` between them. Zero.**

**WHAT THE FAMILY WERE SEEING IS ONE SET OF HOLDINGS ON TWO SCREENS**, never
summed: Sanshi appeared in the Portfolio Monitor's AIF section and again on the
Private Market page, which are two views of the same rows. That is not a double
count — and it IS the thing that made the next defect visible, because only one
of those two screens was wrong about what those funds are.

The claim is now checkable rather than asserted: `marketSide.test.ts` holds the
three sides to `BOOK_SUMMARY` and to each other, and the chat context's own
`doubleCount` block says in as many words that nothing else in this book is
counted twice — a model handed a NAV and an allocation will otherwise reconstruct
the difference by subtraction and report it as one.

#### 2. ₹297.78 Cr OF LISTED-EQUITY FUNDS WERE ON THE PRIVATE SIDE

**ROOT CAUSE: `PRIVATE_CLASSES = {AIF, Unlisted, Structured Product}` — every
AIF was private capital.** That was true of the AIFs this book held when the set
was written (360 ONE Special Opportunities and Transition Venture, both drawdown
vehicles) and false from the drop that brought the Category III folios. Measured
on the book today:

| | | |
| --- | ---: | --- |
| **Category III** — Sanshi ×4, Buoyant ×2, Carnelian Bharat Amritkaal | ₹297.78 Cr | **84% of the "private" half** |
| Category II — Motilal Oswal Founders Fund ×2, 360 ONE Special Opportunities | ₹34.28 Cr | |
| Private equity — Baring PE, Transition Venture | ₹3.60 Cr | |
| No category printed — Delphi, Neo Infra, Blue Ashva | ₹16.69 Cr | |


*(Corrected at Stage 10cv: Founders prints no category — "Category II" was its
reader's — and Neo Infra's statement does print Category II, on its manager
block. Neither moves a side: the family's own placing decides both since Stage
10bw.)*

It is the SAME FAILURE this file already records one iteration earlier —
`listedValue: totalValue, privateValue: 0`, "true when every account in the book
was a listed-equity mandate, and false the moment the AIF statements got a
reader". The fix for that one moved every AIF to private, which was right for
the AIFs that existed then. Nobody re-measured when the Category III folios
landed.

**AND THE STATED PRINCIPLE DID NOT SURVIVE ITS OWN BOOK.** The old comment
called the axis *"a mark from an exchange vs a mark from a manager"* — and a
MUTUAL FUND's NAV comes from its AMC and counted as listed, while a Category III
AIF's comes from its manager and counted as private. Same shape, opposite sides.
The axis was never the mark; it was `assetClass === "AIF"` standing in for
private capital, and the comment was a rationalisation of a class list.

**SO IT IS READ, NEVER INFERRED.** SEBI's categories are what the statements
print, and what they MEAN is regulation rather than a judgement about any
particular fund: Category III is the funds that trade in LISTED securities;
Categories I and II are the private-capital ones — venture, angel,
infrastructure, private equity, debt, funds of funds. `shared/aifCategory.mjs`
holds the read (moved there from `src/lib/aifCategory.ts`, which is the
browser's door to it now) so `build-book` and the app answer with ONE rule, the
standing `shared/sectors.mjs` already has.

**THE FAMILY'S OWN REVIEW IS A SECOND WITNESS AND IT AGREES — 11 of 13.**
`familyTaxonomy.ts` carries the asset class their consolidated review gives each
product. Across the AIF rows where both documents speak: every Category III row
is `Equity` in the review and every private-equity row is `Alternate`. **The two
that differ are one fund** — Motilal Oswal Founders Fund Series II, Category II
by its statement and `Equity` by the review — **and the STATEMENT WINS**, which
is the rule `shared/sectors.mjs` applies where its tiers disagree. The review is
reported as a cross-check and is deliberately NOT a tier: its axis is not a
total function onto this one (`Debt` maps to neither side) and it has a known
counterexample, and *a rule with a known counterexample is not a rule this book
applies to money*. *(The family have since SAID where Founders goes — it invests
in listed Indian equities — and their word outranks the category now; the review
is still not a tier, and the statement still says Category II. See Stage 10bw.)*


*(Corrected at Stage 10cv: Founders' statement prints no category; "Category II
by its statement" was its reader's. The review's `Equity` stands against no
printed category.)*
**AND `null` IS A THIRD ANSWER, NEVER A DEFAULT.** Three funds print no category
(₹16.69 Cr). Filing them private claims they are private capital; filing them
listed claims the opposite; both are claims no document makes. So
`publicPrivateSplit` returns THREE figures, `BookSummary` gains `unplacedValue`,
and **none of the three is `total − the others`** — a residual absorbs whatever a
rule stops naming, silently.

```
listed ₹655.82 Cr · private ₹37.88 Cr · not placed ₹16.69 Cr = ₹710.39 Cr
```

*(Since Stage 10bw: listed ₹699.76 Cr · private ₹10.62 Cr · not placed ₹98,742 —
the family placed two of the three uncategorised funds themselves.)*

**`Position.marketSide` IS GENERATED, on every row including the ring-fenced
one.** The answer needs the ACCOUNT's own `providerEngagement` as well as the
security name and only one of those is on a position, so it is decided once in
`build-book` and every total, facet and caption reads it. The browser's
`marketSideOf` is the same function on the same inputs for a caller holding the
index, and the suite asserts they agree on all 372 rows rather than trusting the
sentence. Emitted on every position and not only the AIFs: a partial field is
where a fallback rule hides, and a fallback rule is a second definition.

**WHAT THIS DOES NOT CHANGE IS THE THING THE FAMILY SAID WAS ALREADY RIGHT.**
*"They should come under AIFs. In fact they are already in AIF."* `holdingBucket`
is untouched, the AIF allocation row is still ₹352.35 Cr, and the AIF
drill-down's Category I/II/III sections are unchanged. `BOOK_SUMMARY.totalValue`
does not move by a rupee.

#### The four surfaces that print the split, and the one that scoped a page on it

- **Private Market** is the private side now. Sanshi, Buoyant and Carnelian
  Amritkaal are off it — **and NAMED on it**, with their value, their category
  and where they are shown, because dropping a row silently is the same defect
  as drawing a ₹0 one: a reader who knows they hold Sanshi and cannot find it
  learns the dashboard lost it. The three funds nothing places are named beside
  them with the reason. *(That card has since been REMOVED at the family's
  request — "these kind of placeholders are not relevant" — see Stage 10bs. The
  sides line under the fund table still states what the page is and what the
  rest of the book is worth; the funds themselves are named where they are
  shown, in the Portfolio Monitor and the AIF drill-down.)*
- **THE CAPITAL-ACCOUNT CARDS ARE DELIBERATELY NOT SCOPED THIS WAY.** A drawdown
  structure is how an account FUNDS ITSELF, not where it invests, and one
  Category III fund here (Carnelian Amritkaal) has a real capital account with
  ₹15 Cr called against it. They read the whole register and say so.
- **AND THREE CAPTIONS MADE ONE COUNT A FRACTION OF THE OTHER.** The uncalled
  tile read `across 15 of this page's 18 private accounts` — true while the page
  carried every AIF, false the moment it stopped: **3 of those 15 capital
  accounts belong to funds this page no longer carries**, so 15 is not a subset
  of 18 and a reader reading it as one is reading a fraction that does not
  exist. The CAPITAL ACCOUNTS tile and the card under the table said the same
  thing, and only the bug pass found those two — see below. All three print the
  on-page count and the off-page one, which is the only form in which both are
  printable together.
- **AND THE SIDES LINE IS OUTSIDE THE THREE VIEWS.** *"This page is the private
  side of the book"* is a claim about the PAGE rather than about one of its
  tables, and drawn inside the By-fund branch it vanished the moment a reader
  switched to By folio or By owner — a private-only table with nothing saying
  so. Also found by the bug pass, on a tree that had passed every subset run.
- **Data Refresh, Upload History and Morning CIO's concentration row** each read
  `marketSides` — ONE ordered list with each side's own reason — rather than a
  fixed `Listed X · Private Y`. Those two captions stopped adding to the total
  printed beside them the moment a third side existed.
- **AND UPLOAD HISTORY'S WAS ALREADY WRONG, for a different reason.** Its private
  term was gated on `portfolio.privateMarkets` — the six fund-of-funds arrays
  that are EMPTY in this book — so it rendered `Private —` with the hover *"No
  private-market holding in this book"* over a book with a ₹352 Cr private half.
  That is the exact failure `publicPrivateSplit`'s own note records on the Family
  Dashboard, alive on a second page and found by re-reading its gate.
- **`/holdings` gains a third facet.** `!isPrivateClass` against `isPrivateClass`
  is a partition in TWO and swept every unplaced holding onto the listed side.

**THREE LOCALS AND ONE FILTER LOST THEIR LAST CALLER AND WERE DELETED**, not
left: `PRIVATE_CLASSES` in `build-book`, and `listedBook`/`privateBook` on
Morning CIO — whose only reader was the card removed at Stage 10t, and whose
meaning silently changed under them when the split stopped being a class list.
The comment naming them as *"still feeding those surfaces"* was a comment
asserting an enforcement that never happens. `contextTickers`'s
`!isPrivateClass` term was redundant when written and became misleading (a
Category III AIF passes it and still has no symbol); **measured, 290 positions
carry a symbol and not one is private or unplaced**, so dropping it changes no
output and makes the code say what its own paragraph says.

#### 3. THE TRUSTS HELD THREE ACCOUNTS AND THE PAGE SHOWED ONE

**ROOT CAUSE: the two HDFC Bank NSDL statements print `AJAY T JAISINGHANI` on
the holder line, because he is the TRUSTEE.** `hdfcNsdl.mjs` resolved the owner
from that line, so DP accounts 67786547 and 67786137 — 347 Swapeco Pre-Series-A
CCPS each — sat under Ajay. **CLAUDE.md named this join and never made it**:
*"a reader must resolve each account on the `DP Account No:` the page prints and
attribute it to a trust through the register. That is a join to establish, not a
document to request."*

`BENEFICIAL_OWNER_BY_DP_ACCOUNT` is that join, committed and cited. What
licenses it is the family's OWN register, whose `TRUST INVESTMENT` sheet is the
only place in the corpus that records who holds this instrument, and four things
had to hold before a statement was re-attributed against the name printed on it:

1. **THE QUANTITY TIES** — 347 preference shares per trust; 347 × ₹100 face =
   ₹34,700, the Total Valuation BOTH statements print to the paisa.
2. **THE INSTRUMENT TIES** — a Pre-Series-A CCPS of ₹100 face, not the equity.
3. **NOBODY ELSE HOLDS IT.** Searched across all eight sheets: Swapeco appears
   exactly three times — 347 CCPS under each trust, and **244 EQUITY shares** (a
   different instrument and quantity) under Bharat personally. Neither Ajay nor
   Aarti holds Swapeco anywhere in it.
4. **THE COUNTS MATCH** — two such statements, two trusts.

A trustee is not a beneficial owner, and filing these under Ajay put a trust's
assets into a person's net worth — *"wrong as tax, wrong as estate planning and
wrong on screen"*, in `shared/owners.mjs`'s own words about these same two
trusts.

**WHICH TRUST IS WHICH IS THE FILENAME, AND IT COSTS NOTHING TO GET WRONG.** The
register records the two trusts as holding the IDENTICAL line, so it cannot say
which DP account is whose, and the statements name neither. The filenames do —
and this book has recorded a filename naming the wrong holder four times. It is
used for this ONE field, and what makes that safe is measurable rather than
hoped for: **the two trusts hold exactly the same thing, so swapping the mapping
moves no figure on any screen.** What the join establishes — that these are the
trusts' accounts and not Ajay's — does not depend on the filename at all.

**`npm run replay:owners` IS THE FIFTH FAITHFUL PARTIAL REPLAY.** `npm run
extract` needs `GLOW_PDF_PASSWORDS` and `pdftoppm`/`tesseract` — these two are
the outlined-text statements — so the change would be unlandable on most
machines. The owner is DERIVED from text the archive already carries verbatim,
so re-deriving it is a replay rather than a repair, on the three rules
`rekey:archive` established: it touches the owner, its id and one warning and
nothing else; its gate is struck on the ARCHIVE (the owner on disk must be
EITHER the holder the committed text prints or the one the join produces — a
third value means somebody else wrote it); and `--check` writes nothing and is a
no-op. The diff is 3 files, 18 insertions.

**`BOOK_SUMMARY` DOES NOT MOVE BY A RUPEE**, which is what a re-attribution must
look like: the holding is quantity-only (a Market Rate of exactly 100.000 is the
face value a preference share was issued at) so it carries no value to move.

#### …and the trust still read "1 position", which is the half that mattered

Re-attributing put both statements under the right taxpayer and the entity page
still showed ONE holding, because two of the trust's three accounts yield no
valued position: the Sky Capital angel folio publishes no NAV, and the HDFC
custody account records its shares at face value. **Both statements are in hand.
Drawing nothing for them is right; saying nothing about them is not**, and that
is the difference between a measured absence and a missing one.

`unvaluedHoldingsOf` and a card at the foot of every entity page name them —
what each account holds, why it carries no figure, and what has been paid into
it. **15 accounts across 5 entities** are in this state, so every entity gains
it, not only the trusts. The drawn capital is stated per account and is **in no
total on the page**: a contribution is what was PAID, never what the stake is
worth.

**WHAT IS STILL MISSING IS NAMED WHERE IT BELONGS.** The register records ₹7.85
Cr paid in per trust, of which this book carries ₹1.71 Cr of market value; the
largest single gap is **Helios Flexi Cap ₹5 Cr per trust with no statement at
all**, plus ₹12.52 Cr under an UNNUMBERED "Bharat Jaisinghani Family Trust" that
resolves to neither. All of it is in `docs/REGISTER-RECONCILIATION.md`, which is
where a register figure belongs — the `/register` PAGE was removed at the
family's request (Stage 10bb) and this change does not put register figures back
onto a dashboard.

#### The checks, and the nine defects the bug pass found — three of them on the page

`marketSide.test.ts` (34 checks) is anchored on the generated book and on the
family's committed review, and its load-bearing gate is an INEQUALITY: **the old
class rule and the category rule must differ by more than ₹100 Cr**, or a suite
asserting the new rule would pass just as happily against the old one. It also
asserts *what left* is exactly Category III plus the unplaced, so the guard
cannot pass by moving the right amount of the wrong thing.

`hdfcNsdlOwner.test.mjs` (22 checks) exercises the reader against a SYNTHETIC
statement — the committed archive would pass whatever the map said, being the
thing the map was written for — and the cases are the join's BOUNDARIES: it
fires on the mapped accounts, does NOT fire on any other, does not fire on a
near-miss account number (`67786547` and `677865470` are different accounts),
keys on the ACCOUNT rather than the printed name, and carries whatever WAS
printed into the archive so the re-attribution can be traced.

`SIDE_BOOK` in `check-pages.mjs` re-derives the category **by a second
expression** rather than reading `marketSide` back off the book — a check that
reads the field the code under test generated agrees with it by construction,
which is the rule this sweep already follows for `isMandateHeld` and `AIF_BOOK`.

**THIRTEEN bugs were reintroduced, each applied alone, rebuilt and re-run, and
every one of them now fires its own check.** It began as nine; four more were
written for defects the pass itself turned up, and **three of those are real
defects on the page rather than in the checks** — every one of them invisible
until the first correction below.

#### The correction that made the rest of the pass possible

**EVERY INVARIANT THIS CHANGE ADDED RETURNED A DESCRIPTIVE STRING ON FAILURE,
AND THE HARNESS READS ANY TRUTHY RETURN AS A PASS.** It is one line —
`else if (!r) invariants.push(desc);` — so `return "Sanshi is on the page"` is a
PASS reporting the defect it was written to catch. Measured: bug 1 put Sanshi,
Buoyant and Carnelian back on `/private-market`, confirmed by dumping the
rendered rows, and `check:pages` reported **2 of 2 combinations CLEAN**. **11
such returns, every one of them added here, and ZERO in the file as it stood on
main.** Rewritten to booleans and `{notChecked}`; re-run against the same bug it
fires **9 invariants across 5 combinations**. This is the Stage 10an defect
arriving again, in a change written with that paragraph open.

**AND THE FULL SWEEP THEN FAILED FOUR COMBINATIONS ON A TREE THAT HAD JUST
PASSED EVERY SUBSET RUN**, which is the whole return on the rewrite. Three real
page defects came out of those four, the third found while diagnosing the
second:

- **THE SIDES LINE RENDERED ON ONE VIEW OF THREE.** *"This page is the private
  side of the book"* is a claim about the PAGE, and it sat inside the `funds`
  branch — so a reader who switched to By folio or By owner got a private-only
  table with nothing saying so. It is outside the three views now.
- **THE CAPITAL ACCOUNTS TILE CROSSED THE TWO SETS THE UNCALLED TILE HAD JUST
  BEEN FIXED FOR.** `15 of this page's 18 private accounts send one` — and three
  of those 15 belong to funds this page no longer carries, so 15 is not a subset
  of 18 and the "other 3" a reader infers does not exist. It is **12 of this
  page's 18 · 3 more come from funds this page does not carry**, which is the
  only form in which both counts can be printed together.
- **AND THE CARD UNDER THE TABLE SAID THE SAME THING, HIDDEN BY AN APOSTROPHE.**
  The existing removal test carried an ASCII `'` and the card renders
  `&rsquo;` — U+2019 — so a page-wide match for the crossed caption could never
  see the one place it survived in prose.

The fourth was a check: **A REASON IN A `title` CANNOT BE READ FROM
`innerText`**, and the unplaced facet's cause is the chip's own hover (Stage
10bd put it there). It reads `ctx.titles` now.

#### Three more checks that could not fail, and how each was found

- **THE PARTITION CHECKS WERE PARTITIONS IN TWO.** `here + listed === pos` on
  `holdings-private` was exactly right while the split was `isPrivateClass`
  against its own negation, and would have been ₹16.69 Cr short — the kind of
  gap that gets "fixed" by widening a tolerance rather than by noticing a third
  side. Both the count and the value identities take every side the BOOK has.
- **THE LEAK CHECK WAS STRUCK PAGE-WIDE.** *"Sanshi is not a private-market
  row"* matched the whole page — and the card below the table NAMES Sanshi on
  purpose, so it would have reported the fund present exactly when the fix was
  working. It reads the TABLE's own rows now, through a `rowText` probe.
- **AND THE UNCALLED REMOVAL TEST WAS STRUCK PAGE-WIDE TOO**, which is how it
  came to fire on the `accounts` tile. It reads that tile's own text now, off
  `tileStrip.texts` — the probe that exists because slicing a page between two
  tile LABELS only works while both are drawn.

**AND THE REPLACEMENT FOR IT COULD NOT FAIL EITHER, WHICH ONLY REINTRODUCING THE
BUG SHOWED.** The first draft asserted that the accounts tile's own numbers add
up — and `15 of this page's 18` adds up perfectly while being the crossed
fraction, because nothing in that sentence says how many of the 15 are on this
page. Bug 11 produced a **CLEAN** sweep. The check is anchored on the OTHER
tile now: the uncalled tile prints the total AND the accounts this page does not
carry, so the on-page count is forced, and the card's prose is reconciled against
the same pair. Re-run, both fire.

#### What the nine originals establish

**FOUR OF THE THIRTEEN ARE VERIFIED IN A SUITE RATHER THAN IN THE BROWSER, AND
THAT IS CORRECT RATHER THAN A GAP.** The ingest reader (the HDFC join) and the
GENERATED field are not rendered decisions — the sweep reads a book that was
built before the patch — so each is exercised where its subject lives: the join
fires **10 of `hdfcNsdlOwner.test.mjs`'s 22 cases**, the entity card fires three
rows of `check:family`, and the two generated-field bugs fire `test:family`.

**BUG 2 WAS RUN IN BOTH OF ITS FORMS, AND ONLY THE SECOND IS THE DANGEROUS
ONE.** Patched in the shared read alone it is DRIFT — the generated field says
`null` and the live read says `private` — and `marketSide.test.ts`'s
generated-equals-live assertion names all three funds. Rebuilt through
`build-book` it is COHERENT AND WRONG, which no drift check can see, and it
fires **11 assertions across two suites**: the private set grows 4 funds to 7,
its cost ₹33.8 Cr to ₹48.8 Cr, and the three unplaced funds are named one by one.

**AND BUG 9 FIRES THE LOAD-BEARING GATE BY NAME.** Reverting the generated field
to the old class rule makes the two rules coincide, and the inequality says so
in as many words — `old ₹352.35 Cr vs now ₹352.35 Cr` — alongside every
per-fund expectation, the what-left-is-exactly-Category-III identity and the
agreement against the family's own review. A suite that merely asserted the new
rule would have passed.

**AND TWO PATCHES WERE REPORTED AS NOT A RESULT RATHER THAN AS A CLEAN SWEEP**,
which is the harness working rather than a defect in it: `{false && (…)}` on a
card whose condition also NARROWS `m` from `T | null` leaves `m` possibly-null in
the JSX below it, and `tsc` refuses the build. Rewritten as `> 99 &&`, which
hides the card and keeps the narrowing. A harness that swept an unchanged tree
there would have reported the check clean under the bug's name.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + **22** + 140 (2 not
checked, 0 blocked) · `test:family` · `check:family` **85/0** · `check:pages`
**188 combinations clean**, with **four** EVIDENCED abstentions — the three
Stage 10bk records (every KPI tile on this book carries a figure, so the
absent-tile claim has no subject on any of the four Morning CIO routes; no row
on `stock-qty` carries a pledge, which `stock-pledge` asserts as a hard failure
so it never stands alone; and the crumb check on `holdings-unknown`, which walks
an address the book deliberately does not define) **plus one this change
created**: *no fund row prints a return where its cost is absent*, on both
Private Market fund routes. That one earns its abstention off the book —
narrowing the page to the private side left **4 fund rows over 5 deduped
positions and not one of them lacks a cost**, where the pre-10bp page drew 19
rows of which 4 reported none. It is the shape this file requires: the claim has
no subject because the BOOK says so, not because the check could not find its
figure.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after the pass.

#### Merged with main, and the letter guard fired on its first full run

This branch was held open at the family's request (*"open PR and do not merge
until i tell you to"*) and **Stage 10bl landed on main while it waited** — so the
merge hit the two things this file tells a future session to expect, **for the
tenth time each**:

- **THE LETTER COLLIDED AGAIN.** Both branches wrote `### Stage 10bl`. Main's
  merged first and **keeps it**, as at 10al, 10as, 10at, 10aw, 10bb, 10bi, 10bj
  and 10bk; this section is **10bp**. **Eleven `10bl` lines were read one at a
  time before any moved**: three are main's own merge note (*"this section is
  **10bl**"*) and one its heading, and the other eight are this branch's — every
  one about the SEBI category split, the trustee join or `replay:owners`, and
  not one about main's tile, bar-graph and custody removals. A bulk replace
  would have made a stage about Family & Entities cite the AIF split.
- **AND THE `ctx` LITERAL AUTO-MERGED, WHICH IS WHEN IT IS MOST DANGEROUS.**
  Git produced the union without conflicting, so nothing would have reported a
  key going missing. Verified by READING it rather than by trusting that git did
  not complain: **78 keys, no duplicates, nothing lost from either side and
  nothing extra** — main's `familyLayout` beside this branch's own — with every
  key's identifier confirmed declared in the merged file. Taking either side
  whole is a sweep that has silently stopped checking, and this file's own
  measurement is that half of those losses are abstentions rather than failures.

**AND MAIN'S THIRD MERGE CHECK FIRED ON ITS FIRST FULL RUN.** Stage 10bl added
it in the same PR this branch merged: *compare the stage letters on main against
the branch's own*, because two sections under one letter in different parts of
one file **merge cleanly, with no marker and no warning**. Run across the whole
file rather than across this merge, it finds **TEN duplicated stage letters —
`10g`, `10j`, `10n`, `10o`, `10p`, `10r`, `10s`, `10y`, `10aa`, `10ak`** — every
one of them already on `main`, none introduced here (measured: 10 duplicates on
`origin/main`, 10 on the merged tree, and the sorted letter lists differ by
`10bp` alone). So a `See Stage 10p` in this file already points at whichever of
two sections comes first, and has for some time. They are NAMED rather than
renumbered, because repointing ten sections would rewrite every cross-reference
in the file for no measurement — and a guard's first run finding ten historical
cases is the guard working, not a reason to bundle their repair into a merge.

**AND THE PAGE'S OWN CONFLICT WAS ONE IMPORT LINE.** Main removed the four KPI
tiles that used `absentTile` and `DASH`; this branch's unvalued-holdings card
uses `DASH`. Measured on the merged tree rather than reasoned about —
`absentTile` appears on the import line and nowhere else (genuinely dead after
main's removal), `DASH` on the import line **and** inside the new card — so the
resolution takes main's removal of the one and keeps the other. Every other
count in that file matches main exactly (`custodyLabelOf` 4, `BarChart` 3,
`Custody` 6, `absentTile` 0), which is what says main's three removals survived
a merge that also kept this branch's card.

**AND THE GENERATED FILES WERE RE-DERIVED RATHER THAN ASSUMED.** Main touched
three files and none of them generated, so the merge had nothing to splice — and
`npm run build-book` was run as a control anyway and regenerated `glowData.ts`
and `docs/BOOK-REPORT.md` **byte-identically, to the same md5 as before the
merge**. Both halves are stated because the first is what made this merge safe
and only the second would have caught it had it not been.

**AND THE ONE THING THAT LOOKED LIKE A COLLISION OF INTENT IS NOT ONE, MEASURED
ON BOTH TREES RATHER THAN REASONED ABOUT.** Stage 10bl asserts *"the page does
not scroll"* and this branch adds a card to a Family & Entities view, which reads
as the two asks pulling against each other. **The claim is on `/family`, the
INDEX** — its invariant block is the unquoted `family:` key — **and this card
renders only on `/family?entity=…`**, so it never reaches the page the claim is
about. Measured with the sweep's own browser at its own 1500×1000: the index is
**0px over on `origin/main` and 0px over on the merged tree**, and main's own
harness run against THIS build reports `family` clean.

**THE FIRST ATTRIBUTION WAS WRONG AND IS KEPT HERE BECAUSE OF HOW IT WAS
WRONG.** The invariant was read as `family-entity`'s by taking the nearest
preceding `^  "route": [` line — and `family:` is an UNQUOTED key, which that
pattern cannot see, so the search silently walked past the real block and
stopped at the quoted one before it. Instrumenting the dispatch to print each
invariant's own result is what settled it: `family-entity` runs **four**
invariants and not one of them mentions scrolling. **A structural claim about
someone else's check must be struck on the dispatch's own answer, not on a
pattern over the source** — the same rule this file already applies to the pages
themselves, arriving in the harness.

**WHAT IS TRUE, AND IS A MEASUREMENT RATHER THAN A REGRESSION:** the ENTITY view
scrolls on both trees, **207px over on `origin/main` and 755px with this card**,
and no invariant on either side claims otherwise. It is recorded rather than
designed around, because the family asked for the INDEX to fit side by side and
asked separately for the trust's empty holdings to be explained — and the second
answer is a card of substance, not chrome.

#### Merged with main a SECOND time, and the conflict was not the one this file predicts

The family's go-ahead arrived an hour after the last check-in, and the merge was
refused: `405 Pull Request has merge conflicts`. **`main` had moved while the PR
sat open** — Stage 10bm and Stage 10bn (the published-NAV work, #64) and the
daily Polycab refresh — which is exactly the transition no webhook delivers and
the one the scheduled check-in exists for. It fired four times and found nothing;
the change landed in the 88 minutes after the fourth.

**THE LETTER COLLIDED FOR THE ELEVENTH TIME, AND `main` TOOK TWO.** #64 wrote
`10bm` AND `10bn`, so this section is **`10bp`**. Seventeen lines named one of
the three afterwards and **each was read before any moved**: eleven are this
branch's (the heading, three inside the section, and seven cross-references
elsewhere in the file), four are `main`'s own — two `10bm` inside its section and
two `10bn` outside it — and each side's were settled by testing whether the exact
line exists on `HEAD`'s CLAUDE.md, on `origin/main`'s, or both. A bulk replace
would have made a stage about the SEBI split cite the stock page's mark column.

**AND THE `ctx` LITERAL AUTO-MERGED, WHICH IS WHEN IT IS MOST DANGEROUS.**
Verified by reading rather than by trusting git: **90 keys, no duplicates,
nothing lost from either side and nothing extra**, the union of both sides
exactly, and every key naming something declared in the merged file.

**WHAT DID CONFLICT IS A CASE THIS FILE HAD NOT SEEN: BOTH SIDES EDITED THE SAME
INVARIANT, AND `main`'s EDIT WAS A CORRECTNESS FIX THIS BRANCH WOULD HAVE
UNDONE.** Private Market's PM-2 check read its NAV from the first `₹…Cr` in the
body — which is the TOP BAR's current value of holdings, app chrome and no part
of that page's arithmetic. The two coincided for as long as nothing could price a
fund and **stopped the day #64's published NAV did**, because the top bar renders
the LIVE book while that page reads `statementPortfolio` by design (§6). `main`
re-struck it on the page's own printed *"N% of the ₹X Cr book"*; this branch had
rewritten the same check's name and reasoning and kept the old extraction.

Resolved as a **union of intent** rather than by taking a side — this branch's
label and doc comment, `main`'s extraction, and `main`'s diagnosis recorded in
the comment so the reason cannot be lost the next time someone reads only the
name. The anchor was checked against this branch's own page first: it prints
*"of the ₹710.4 Cr book"* on the Private market value tile, so the fix binds here
too.

**AND FIVE OF `main`'s INVARIANT LABELS ARE ABSENT FROM THE MERGED FILE, EACH
SUPERSEDED RATHER THAN DROPPED** — checked one at a time, not counted. Four are
the two-sided split becoming three (`the two halves …` → `the sides …`, `the
listed and private halves are a toggle` → `every side of the book is a facet`)
and the fifth is the uncalled tile's crossed-fraction fix. **Nothing was lost
from this branch, and nothing from `main` that a replacement does not carry.**

**`main`'s STAGE-LETTER GUARD RAN AGAIN AND FOUND NO NEW DUPLICATE.** The same
ten historical letters as before (`10g`, `10j`, `10n`, `10o`, `10p`, `10r`,
`10s`, `10y`, `10aa`, `10ak`), identical on `origin/main` and on the merged tree,
and the sorted letter lists differ by **`10bp` alone**.

**THE FOUR FILES THAT AUTO-MERGED WERE READ, NOT TRUSTED.** `package.json`,
`test-family.mjs`, `types.ts` and `PortfolioContext.tsx` each kept both sides,
asserted line by line. The last is the one that matters: #64's `applyFundNavs`
overlay and this branch's three-side split meet in one memo, and they COMPOSE —
the overlay is applied to the positions first and the split is struck over those
same positions, so `totalValue` is the sum of the three sides on either basis.

**AND THE GENERATED FILES WERE RE-DERIVED RATHER THAN ASSUMED**, the discipline
Stage 10at records: neither side touched `src/data/glowData.ts` or
`docs/BOOK-REPORT.md`, so the merge had nothing to splice — and `build-book` was
run as a control anyway and regenerated both **byte-identically, to the same md5
as before the merge**. `replay:owners --check` is still a no-op.

#### …AND THE TWELFTH COLLISION LANDED ON `main`, BECAUSE THE MERGE WAS CLEAN

This section was `10bo` when its PR was merged, and so was **#67**, which landed
on `main` in the eighty minutes between the last fetch and the merge button. The
two sections sit in different parts of this file, so **git produced no conflict,
GitHub reported the PR mergeable, and both went in under one letter.** `main` was
left with two `### Stage 10bo` headings and twenty-two lines pointing at
whichever came first.

**THAT IS THE EXACT FAILURE `main`'s OWN STAGE-LETTER GUARD WAS ADDED FOR, AND
THIS IS ITS FIRST LIVE CATCH** — recorded here rather than quietly fixed, because
the guard had run three times before and only ever found the ten historical
duplicates, which reads as a guard with nothing to do. It has something to do.

Fixed in a follow-up: **#67 merged first and keeps `10bo`; this section is
`10bp`**, and the thirteen lines that are this section's were repointed while
#67's nine were left alone — each read one at a time, because seven of the
twenty-two sit far from either section and only the wording says whose they are.

**AND THE LESSON IS THE ONE THIS FILE ALREADY STATES AND HAD NOT YET PAID FOR:
A CLEAN MERGE IS NOT A CORRECT ONE.** The letter check has to run **against the
tip of `main` at the moment of merging**, not against the base the branch was
last fetched at — a PR that has sat open through another merge is exactly the one
whose letter is stale, and the diff will not say so.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 22 + 140 (2 not
checked, 0 blocked) · `test:family` · `check:family` **85/0** · `check:pages`
**194 combinations clean**, with the **same eight** evidenced abstentions across
the same four claims as before the merge — every KPI tile on this book carries a
figure (four Morning CIO routes), no row on `stock-qty` carries a pledge, every
private holding reports a cost, and nothing on Morning CIO points at an
undefined drill-down address.

**MEASURED ON THE MERGED TREE, AND THE ARITHMETIC RECONCILES ONLY BECAUSE THE
SWEEP WAS RE-RUN.** This branch's own pre-merge run was **188** and it adds no
route; #64 adds three (`stock-cmp-nav`, `stock-cmp-split`, `stock-cmp-unmarked`),
which is six combinations across both themes. 188 + 6 = 194 — and a figure
adjusted by arithmetic from another branch's paragraph would have been wrong in
the one direction nothing on screen could show, which is the point every stage
in this file makes about its own count.

### Stage 10bq — ONE CLASSIFICATION FOR TWO PAGES, AND A FOLIO IS WHAT A FUND ROW IS MADE OF

*"open PR and do not merge until i tell you to."* · *"we have already classified
every stock in the sector composition page, use the same classification in the
families and entities classifications, unclassified should not be the top
classification."* · *"remove the highlighted section from the dashboard UI"* —
the Polycab statement card, screenshotted. · *"why are there two different toggle
switch for fund and folio… keep default view as fund only, and make the row
clickable so that it would reveal a drop down list of folios. And remove folio as
the toggle button."*

Three asks on three pages, and each is the same shape of defect: **two surfaces
answering one question differently.** A company had a sector on one page and none
on another; a demat's silence was stated in a table two cards away from the group
figure it exists to be told apart from; and a fund and its folios were two tabs
when one is what the other is made of.

#### 1. THE SECTORS WERE ALREADY RESOLVED, AND ONE PAGE WAS NOT READING THEM

Family & Entities grouped its sector mix on `Position.sector` — **the family's own
statement and nothing else** — while Sector Composition has resolved a company
through THREE TIERS since Stage 10at: the statement, then a fund's SEBI filing
joined on the ISIN, then screener.in joined on the NSE symbol. A depository
statement prints an ISIN, a quantity and a rate and **no industry at all**, so on
this page every share the family bought in its own demat arrived unplaced.

**MEASURED BEFORE AND AFTER, PER MEMBER, WHICH IS THE WHOLE OF WHY THIS IS A
SHARED CLASSIFICATION RATHER THAN A SECOND ONE:**

| | book only | three tiers |
| --- | --- | --- |
| Ajay | **Unclassified ₹87.72 Cr — 54.4%, the top bar**, 11 sectors | ₹13.89 Cr — 8.6%, 12 sectors, top = Consumer Discretionary |
| Bharat | **Unclassified 100.0%**, 1 sector | ₹0.89 Cr — 4.5%, 10 sectors, top = Health Care |
| Ankita | **Unclassified ₹12.90 Cr — 40.8%, the top bar**, 11 sectors | **₹0.00 Cr**, 12 sectors, top = Financials |
| Aarti | **Unclassified 100.0%**, 1 sector | ₹0.00 Cr, top = Consumer Discretionary |

**Unclassified is the top bar for none of the four**, which is the ask, and the
bars still add to each entity's own `selSharesMV` to the rupee.

**`companySectorIndex` IS A PROJECTION OF `companyExposure`, NOT A SECOND
RESOLVER.** The three tiers, their order and the rule that a lower one may only
ever FILL an empty sector live in exactly one function still; this hands back the
half of its answer a caller wants when it is classifying rows of its own rather
than ranking companies. Two implementations would be two chances for a company to
land in a sector the other page puts somewhere else — the failure `holdingBucket`,
`costCoversSet` and `companyExposure` were each extracted for.

**NO VALUE CROSSES OVER, AND THAT IS WHAT MAKES IT SAFE.** Only `sector` is read;
`derived` and `total` are not touched. Every figure on this page is still the
entity's own MEASURED market value on its own per-statement basis, and the card's
total is unchanged. **This is a re-classification, not a re-measurement** — which
is exactly the check that says so.

**THE INDEX IS BUILT OVER EVERY COMPANY SHARE AND DELIBERATELY NOT OVER
`currentHoldings(...)`.** That helper keeps a closed position and a sub-₹1,000
speck out of an ALLOCATION FIGURE, which is right for a total and wrong for a
lookup table: a company's sector does not depend on how much of it the family
holds. Measured, narrowing it would have sent exactly two rows to Unclassified —
Ankita's ₹60 preference line and her ₹580 demat row, the two the floor drops —
while placing everything around them, which is this change running backwards on
the rows least able to defend themselves. Tier 3 also resolves through the NSE
symbol a POSITION carries, and a company held in two accounts can print it on one
row and not the other, so a narrowed input can only ever place fewer.

**AND THE HOLDINGS TABLE'S SECTOR COLUMN READS THE SAME ANSWER.** Left on
`h.sector` it would have gone on printing "Unclassified" against a row the chart
two cards up had just placed — **one screen contradicting itself on the reader's
own click**, which is the one thing a shared classification is for.

**WHICH TIER PLACED EACH COMPANY IS ON THE CARD**, as the counted strip Sector
Composition already carries, because the two lower tiers are BORROWED EVIDENCE
rather than the family's own statement and a reader cannot infer either from the
bars. For Ajay: 85 from a statement in this book, 9 from a fund's filing, 46 from
screener.in, **7 unplaced with their names and their ₹13.89 Cr in the hover** —
147 companies, and tier 1 alone places 85 of them — a
residual a reader cannot see is a residual they assume is zero, and it is the bar
this whole change is about. Counted over COMPANIES rather than positions, because
that is the unit a sector is a property of.

**IT FETCHES ONLY FOR A SELECTED ENTITY.** Everything keyed on the index renders
behind a selected entity, so the All-entities default pays for nothing. Read off
the raw `?entity=` param rather than the resolved scope, which is not available
before the hooks must run: a param naming an entity this book does not carry
fetches once for nothing, which is the cheaper of the two mistakes.

#### 2. THE POLYCAB STATEMENT CARD, AND THE ONE CLAIM THAT COULD NOT BE LOST

"Pledges, dividends and corporate actions" — a three-row table saying that this
demat's statement reports none of them and naming the document that would, plus a
closing line that the three are absent because of what a depository statement IS
rather than because a feed failed. **Every claim was audited against the rest of
the page before a line went**, the method Stages 10aa, 10ai, 10ap, 10bd and 10bl
each ran:

| The claim | Second home? |
| --- | --- |
| **Pledged, locked-in or earmarked — not reported, and which document would** | **YES, and a BETTER one.** The promoter card's third tile reads *"This demat's balance — [dash] — the NSDL statement behind this holding prints no pledge, lock-in or freeze column; a group figure is not a statement about this account"*, BESIDE the group pledge it exists to be told apart from rather than two cards away from it |
| Dividends received — an entitlement is not income | YES — the declared table's `On this block · derived` heading and each of its cells: *"never a figure for cash received — what actually arrived, and what TDS came off it, is a bank record no exchange can answer"* |
| Bonus, splits and spin-offs | YES, and STRONGER: the measured nil below is the exchange's own record, complete from listing, rather than this demat's silence |
| "These three are absent because of what the document IS, not because a feed failed" | **NO.** It went, and that is recorded rather than glossed |

**THE PLEDGE IS THE ONLY CLAIM ON THIS PAGE A READER CAN BE ACTIVELY HARMED BY
LOSING**, which is why it is asserted as a check of its own. The promoter group
discloses **0.00% encumbered** on this book; a reader who takes that for a
statement about this demat has learnt something false about a ₹12,000 Cr promoter
block, and the two are one careless edit apart. The card's absence and the tile's
survival are separate claims and neither implies the other: a build that removed
both satisfies the absence and loses the distinction in silence.

**AND THE REMOVAL BROKE TWO BOUNDARIES THE SWEEP WAS STANDING ON, FOR THE THIRD
TIME IN THIS FILE.** The per-holder reconciliations sliced the page text between
`SHARE OF THE BLOCK` and the heading of the card that came next; the pledge check
sliced between `WHICH DOCUMENT CARRIES IT` and `These three are absent`.
**`sliceBetween` returns EVERYTHING AFTER its start marker when the end marker is
gone**, so all three would have gone on running against the rest of the document
rather than failing — and one of them is the most consequential claim on the page.
The two per-holder claims read the table's own node through
`data-polycab-holders` now, which cannot run past itself whatever the page prints
after it; the pledge one moved onto the tile that carries the claim. **A boundary
a page no longer prints is not a boundary.**

`BOOK_CORPORATE_ACTIONS`, `ACTION_COLS`, the action table's view and its four
sort accessors, and the dividend precedence between the position's own figure and
the corporate-actions record were the card's alone and are **DELETED, not left
exported and dead** — the `exportDeck.ts` treatment. The record still carries
bonus issues for the accounts whose providers publish one and still names none of
this security; it simply has no surface on this page, which is a fact about the
layout rather than about the book.

#### 3. A FOLIO IS NOT ANOTHER SLICE OF THE PRIVATE BOOK — IT IS WHAT A FUND ROW IS MADE OF

The family were right that the pair was redundant AS A TOGGLE. `By fund` and
`By folio` were a whole list and the same list re-sorted: every folio belongs to
exactly one fund, where `By owner` really is a different grouping. So the folios
sit under the fund they belong to and a reader reaches them where they were
looking, rather than by leaving the table and coming back.

**WHAT MUST NOT BE FLATTENED IS STILL THE BASIS, AND NOTHING ABOUT IT MOVED.**
This is the one screen where the whole of this book's double count lives — both
duplicated holdings are private:

| | |
| --- | ---: |
| The fund ROW | CONSOLIDATED — each `dedupeGroup` counted once, ₹352.35 Cr over 11 funds |
| …EXPANDED | RAW — every statement as printed, 18 lines, ₹355.52 Cr |
| By owner | RAW — a per-owner figure counts each member's own statement |

**PM-1 MOVED WITH THE TABLE IT READS, AND THE EXPANSION IS A BETTER HOME THAN THE
VIEW IT CAME FROM:** the consolidated figure, the statements behind it and the
₹3.17 Cr between them are now ONE CLICK apart instead of one tab apart, and the
overlap is named per fund on exactly the two rows that carry one — `360 ONE
Special Opportunities` (2 statements, ₹2.92 Cr printed against ₹1.47 Cr) and
`Transition Venture Capital Fund I` (₹3.43 Cr against ₹1.71 Cr). Rendered only
where the two really differ: on the other nine it would describe a gap that row
does not have. A check that stops running because its table moved behind a
control is a check that silently stopped, which this file has recorded four times.

**AND THE `FOLIOS` COLUMN WAS COUNTING THE WRONG SET, WHICH ONLY THE EXPANSION
MADE VISIBLE.** `fundRollup` struck it over the DEDUPED rows, so it read **1** for
each of those two funds — over a panel that lists **2**. That is §"a consolidated
figure counts each `dedupeGroup` ONCE; a per-account or per-owner figure does
not" failing in the direction that put "Held in 1 entity" above a table of two
CRNs at Stage 10ai, arriving one page over. It is a count of STATEMENTS now,
summing to the raw row count while the money on the same row still adds to the
deduped total, and `rawRows` is a REQUIRED parameter rather than an optional one
so no caller can quietly get the deduped count back.

**EVERY FUND ROW OFFERS THE EXPANSION, including the nine held in one folio** —
the panel carries the OWNER and the account number, which the row does not, so it
opens onto something a reader could not otherwise see. That is also what the
family asked for in as many words.

#### The verification, and the four checks that could not have failed

`check:pages` gained nothing but re-homed a great deal, and each claim is struck
where its subject now is:

- **Family & Entities** — four claims on `family-entity`, none implying another:
  Unclassified is not `ticks[0]` (read off the CHART's own SVG ticks, in the
  chart's own value order — the complaint is about the order of the bars and
  carries no text `innerText` can see); the strip's four counts PARTITION the
  entity's distinct companies, derived from `glowData.ts`; the two borrowed tiers
  place companies the statements do not, asserted as an INEQUALITY against what
  tier 1 alone leaves (**7 unplaced against 62**) so a build that kept the strip
  and dropped the tiers fails; and every Sector CELL names a sector the chart
  drew, with fewer of them saying Unclassified than the old rendering would have.
  The cells are read off the ATTRIBUTE, not the text: a fund's cell renders an em
  dash with its own reason, and `""` is what says "not a sector" where
  `textContent` hands back the dash as if it were one.
- **Private Market** — `pmViewChecks` asserts TWO views and that `folios` is gone
  from the control, which INVERTS rather than being deleted with the view; the
  default route additionally asserts **no panel is open until a row is clicked**,
  because a build that expanded every row on arrival renders every figure
  correctly and satisfies every reconciliation on the expanded route. The
  expanded route opens EVERY row — not the widest — so "every row offers its
  folios" is a claim about the TABLE rather than about whichever row sorted
  first, and each panel is reconciled against `PM_FOLIO_BOOK` fund by fund.
- **Polycab** — the card's absence, and the pledge claim's survival, asserted
  apart.

**FOUR CHECKS WOULD HAVE ABSTAINED OR RUN AGAINST THE WHOLE DOCUMENT**, and
finding them is the point of doing this rather than reasoning about it:

- the pledge check's slice, above — the failure mode is the dangerous one,
  because it does not fail, it merely stops being about anything;
- the two per-holder reconciliations, same cause;
- and the two re-homed ones first returned `notChecked` when `holderText` was
  null. **A MISSING HANDLE IS A FINDING, NOT AN ABSTENTION** — `polycabDom` being
  null means the probe never ran, `holderText` being null means the table lost its
  handle, and only the first is a reason to stand down.

**AND ONE BUG PRODUCES A WELL-FORMED PAGE WITH A WHOLE TIER MISSING.** Unwiring
`useStockExposure` leaves its state `loading` for ever: the strip still
partitions, the bars still add up, the counts are all internally consistent, and
the disclosure tier simply never arrives. On this book that is 9 of Ajay's
companies and 11 of Bharat's, and `unplaced` stays comfortably under the
book-alone baseline (16 against 62), so the inequality above does NOT catch it. The strip carries
`data-status` now and the walk waits for it to settle, so `loading` at read time
means it never will.

#### Twelve bugs reintroduced, and the one that came back CLEAN

Each was put back on its own, rebuilt and swept, with the harness restoring **by
copy on a `trap … EXIT` and rebuilding on the way out** — restoring the source
alone leaves `dist/` at the bugged build and the next run reports this bug's
failures under the next one's name, which this file has measured once.

| Bug put back | Fires |
| --- | --- |
| the sector mix grouped on `Position.sector` again | the top-bar check **and** the cell-agreement check |
| the holdings table's Sector cell back on `h.sector` | the cell-agreement check |
| the sector-source strip deleted | the provenance check **and** the tiers check |
| `useStockExposure` never enabled — the disclosure tier never lands | the tiers check (via `data-status`) |
| **the Folios column back on the deduped count** | **NOTHING, at first — see below** |
| the `By folio` toggle button restored | the two-views check on **all three** private routes |
| every folio panel open on arrival | "no folio panel is open until a row is clicked" |
| the expansion's overlap note deleted | PM-1 |
| the folio panel truncated to one line | the per-panel reconciliation |
| the removed Polycab statement card restored | "the removed statement card stays removed" |
| the pledge tile's sentence deleted | the pledge check |
| the per-holder table's structural handle removed | **both** per-holder reconciliations, as FAILURES rather than abstentions |

**THE FIFTH IS THE ONE WORTH THE PASS.** Reverting `FundRow.folios` to the
deduped count — the defect this change exists to fix, which puts "Folios 1" over
a panel listing 2 — left the sweep **CLEAN**. The reason is this file's own rule
arriving in a check written the same hour as the comment warning about it:
`data-pm-folio-rows` on the chevron is `behind.length`, the SAME expression the
panel maps, so comparing the two is **a figure against its own copy**. Nothing
read the Folios CELL, which is the only thing the bug changes and the only thing
a reader sees.

The row carries `data-pm-folios` now — what the COLUMN prints — reconciled
against the book's statement count AND against the number of rows the panel
under it draws, which is the claim a reader can actually watch fail. Re-run
against the same bug, it fires.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 27 suites · `check:family` **82/0** · `check:pages`
**186 combinations clean, zero invariant failures**, with the same **six**
evidenced abstentions Stage 10bl records — four from the one KPI-tile claim
spread across Morning CIO's panels, the crumb on the not-found route, and the
pledge one on `stock-qty`, which `stock-pledge` asserts as a hard failure so it
never stands alone. **NOT ONE of this change's own checks abstains**, read out
of `report.json` BY NAME rather than inferred from the total: six lines, six
routes, every one of them pre-existing.

**AND THE COUNT WENT 186 → 192 → 186 ACROSS TWO MERGES, WHICH IS THE WHOLE
ARGUMENT FOR RE-RUNNING IT.** This change adds no route — `private-market-folios`
moved from `/private-market?view=folios` to `/private-market` plus a click and
kept its name, so PM-1 stays at the address a reader of this file expects.
Every one of the six combinations that came and went is main's: the first merge
brought three `stock-cmp-*` routes (186 → 192) and the second took three
transaction routes away with the table they walked (192 → 186). **The two
movements cancel exactly, so the final figure is identical to this branch's own
pre-merge one — and it is identical for reasons that have nothing to do with
this branch.** A count carried across rather than re-measured would have been
right here by luck and wrong about why, which is the same defect as a figure
copied into prose.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after (md5 unchanged): nothing
here touches the ingest, and three presentation changes that moved a generated
figure would not be three presentation changes.

#### Merged with main, and both predicted conflicts arrived — for the TENTH time each

This branch was held open under the family's own instruction (*"open PR and do
not merge until i tell you to"*), and **Stage 10bm and Stage 10bn landed on main
while it waited**. The merge hit exactly the two things this file already tells a
future session to expect, and neither was a surprise because they are written
down:

- **THE LETTER COLLIDED AGAIN.** Both branches wrote `### Stage 10bm`. Main's
  merged first and **keeps it**, along with the `10bn` beside it, as at 10al,
  10as, 10at, 10aw, 10ba, 10bh, 10bi, 10bj and 10bl; this section is **`10bq`**,
  main having since taken `10bo` as well — see the second merge below.
  **Nine cross-references named a colliding letter and only FIVE were this
  branch's** — the `companySectorIndex` line in **Layout**, the two Polycab
  sentences under Stage 10i's preview rule, the folio line under Stage 10m and
  the one under Stage 10bf. The other four are main's own (its two
  self-references inside 10bn, the `fundNavs` entry under **Build**, and the
  two-must-never-be-added line in **Layout**). Each was **read and classified
  against main's own copy of the file before any of them moved**; repointing in
  bulk would have made a stage about a sector classification cite the fund-NAV
  work.
- **AND THE `ctx` LITERAL CONFLICTED ON ONE LINE, AS PREDICTED.** This branch's
  `feSectors` against main's `stockMark`. **Resolved as a mechanical union and
  then PROVED to be one** — the keys of both sides were diffed against the keys
  of the result, and the union was required to drop none and invent none.
  Measured afterwards at **80 keys, no duplicates**, with every key's source
  declared exactly once but for four pre-existing shadowed names. Taking either
  side whole is a sweep that has silently stopped checking: this file's own
  measurement is that dropping one probe turns its invariants into NOT CHECKED
  while every combination still reports CLEAN.

**AND THE GENERATED FILES WERE CHECKED RATHER THAN ASSUMED**, which on this
merge was the cheap half: only main touched one (`src/data/fundNavs.ts`,
`src/data/polycabLive.ts`, `docs/FUND-NAVS.md`, `docs/POLYCAB-LIVE.md`) and this
branch touched none, so there was nothing to splice — and `npm run build-book`
was run as a control anyway and regenerated `glowData.ts` and
`docs/BOOK-REPORT.md` **byte-identically**, md5 unchanged on both.

**THE ONE SUBSTANTIVE RISK WAS MEASURED RATHER THAN WAITED FOR.** Main's 10bn
makes the published NAV the current value, which moves market values through
`PortfolioContext`. Both pages this branch changed were checked against it
before the sweep ran: **Private Market reads `statementPortfolio`** and cannot
see it at all, and **Family & Entities reads the live set but every figure this
branch added is scoped to `isCompanyShare`** — `applyFundNavs` is keyed on fund
schemes, so not one company share moves. The sweep then confirmed it.

#### …AND AGAIN, HALF AN HOUR LATER — THE ELEVENTH, AND THE SILENT ONE

**Stage 10bo landed on main while this branch's own merge was being verified**,
and brought the same pair a third time in one session. The `ctx` literal
conflicted as always. **The stage letter did NOT**, and that is the case worth
the paragraph: the other branch had ALSO moved to `10bo` for the same reason
this one had, in a DIFFERENT part of the file — so git merged it cleanly and
left **two sections under one letter, with no marker and no warning**. That is
Stage 10bl's own finding arriving again, and it was caught the same way, by
**comparing main's stage letters against the branch's own rather than trusting
that git did not complain.** This section is **`10bq`**.

**AND THE `ctx` RESOLUTION WAS NOT A UNION THIS TIME, WHICH IS WHY IT IS
CHECKED AGAINST DECLARATIONS RATHER THAN DONE BLINDLY.** Main's 10bo merged the
two transaction tables into one, so it RENAMED two probes — `txnRecord` →
`txnMerged`, `tradesTable` → `datedTable` — and deleted the originals. A
mechanical keep-everything union would have put two names into the literal that
no longer have a declaration, which throws inside every check and reports as a
broken matcher on every route. So each of this side's keys was resolved against
the merged file: `feSectors` is declared and is added, the other two are not and
are dropped. **79 keys, none duplicated, every one resolving to a declaration.**
A union is the right default and the declaration is what settles it.

#### AND A THIRD TIME — WHERE MAIN'S OWN LETTERS HAD ALREADY COLLIDED

**Stage 10bo (#65) landed while this branch's second merge was being verified**,
and this round is the one that shows what the silent collision costs when nobody
catches it: **main was already carrying TWO sections under `10bo`** — #67's and
#65's — because each had moved off `10bm`/`10bn` independently, in different
parts of the file, so git merged them without a marker exactly as it had here.
Every `See Stage 10bo` in the file was ambiguous, which is the whole harm the
rule prevents.

So this merge sorts the letters rather than adding to the pile: **#67's keeps
`10bo`** (it merged first), **#65's becomes `10bp`**, and this section is
**`10bq`**. Renumbering another branch's section is not a liberty taken lightly
and it is the smaller of the two wrongs — a duplicate letter makes every
cross-reference to it unresolvable, and this file's own record is that the
defect is invisible until someone compares the letters by hand.

**AND THE REFERENCES WERE SPLIT BY SECTION BOUNDARY, NOT BY A DIFF.** The
obvious classifier — *is this line new since the last main?* — gets it wrong in
one direction that matters: **this branch's own merge note TALKS ABOUT main's
`10bo`**, so it reads as new and would have been renumbered into a sentence
about the wrong stage. Each reference was placed by which section's span it
falls in, and only the ones outside all three were classified against the
previous main. **26 references, 13 moved, 13 left**, and the file now carries no
duplicated letter.

**THE CODE CONFLICTS WERE REAL THIS TIME, NOT BOOKKEEPING.** #65 changes
`FamilyEntities.tsx`, `PrivateMarket.tsx` and `privateMarket.test.ts` — the
three files this branch changes most — and each resolution had a rule:

- the two page conflicts are IMPORT unions, and nothing else in either file
  overlapped;
- **`privateMarket.test.ts` takes MAIN's figures and THIS branch's argument.**
  #65 re-measures the private scope (a Category III AIF is listed exposure now,
  so it is 4 funds where it was 14) and moves the cost-less fixture row to
  `BOOK_POSITIONS` because the private scope may no longer carry one. Both are
  re-measurements and both win. What survives from here is the `rawRows`
  argument, because the parameter is required;
- **the `check:pages` block takes THIS branch's rewrite plus main's new claim.**
  Main's side is struck on `pmViewChecks("folios")` — a VIEW this change
  removed — so a union would have asserted a rendering that no longer exists.
  `PRIVATE_SCOPE_CHECKS` is a new claim about the scope and applies either way,
  so it is taken and nothing else is.

**AND THE PROBE UNION BROKE A SHARED COMMENT.** Both sides add fields to one
`pmView` object under one `/**` opener, so concatenating them left main's
comment body as bare code and the file stopped parsing — caught by
`node --check` rather than by reading. A union of two halves of one construct
needs the construct rebuilt, not the halves stacked.

**AND THE SWEEP FOUND THE ONE THING A MERGE LIKE THIS ACTUALLY BREAKS.** The
full walk came back **1 of 188 with a finding**, both failures this branch's own
folio checks on a page that was rendering correctly. The cause is this file's
own rule arriving on schedule: **a rule expressed twice has to be MOVED twice,
and the merge is where that comes due.** `PM_FOLIO_BOOK` re-expresses "which
holdings are private" off `glowData.ts` — deliberately, because a check that
imports the helper it is checking agrees with it by construction — and it read
`assetClass ∈ {AIF, Unlisted, Structured Product}` for as long as that WAS the
rule. Stage 10bp made it `marketSide === "private"`: a Category III AIF trades
listed securities, so it is listed exposure, and the private book went from 14
funds to **4**. The page followed the new definition and the checker did not.

Keyed on `marketSide`, all three private routes walk clean and the constant's
own arithmetic agrees with main's re-measured suite (4 funds, 7 statements).
**The targeted re-run is complete coverage rather than a shortcut**, and that
was measured rather than assumed: `PM_FOLIO_BOOK` is read inside the
`private-market-folios` block and nowhere else in the file, so every consumer of
the changed constant was re-walked.

**THE FAILURE IS THE ARGUMENT FOR THE RE-EXPRESSION, NOT AGAINST IT.** Written
as an import this merge would have changed what the checks cover — silently,
into agreement — and reported clean. Written twice, it failed by name on the
one route where the two definitions had come apart.

### Stage 10br — LIVE PRICES FROM UPSTOX, AND A ONE-CLICK CHECK THAT THE TOKEN WORKS

*"I have got the upstox token for live current market prices for all tickers
in the dashboard tell me where to put it."* · *"this token is also being used in
two other dashboard sattva central research and glow central research, i have
added the token and also done the deployment again please check."*

**ADDING THE TOKEN CHANGED NOTHING, AND THAT WAS THE FIRST THING TO SAY.** No
line of this repo read an Upstox token, so the redeploy re-ran the same muns
feed. A secret cannot be read back out of Cloudflare and the site is behind its
password, so "please check" needed code at both ends: a feed that USES the
token, and an address that says whether it WORKS.

#### The name, the kind, and the fact that it is shared

- **THE NAME WAS READ, NOT GUESSED.** The sister dashboards
  (`techmuns/Glow-Central-Research`, `techmuns/Sattva-Central-Research`) hold the
  same token as `UPSTOX_ACCESS_TOKEN`. That name is read first and `UPSTOX_TOKEN`
  second, so a token copied across under either works. A value pasted with a
  leading `Bearer ` or wrapped in quotes is cleaned — to Upstox both read exactly
  like an expired token.
- **THE ANALYTICS TOKEN, NOT THE LOGIN TOKEN.** Upstox's OAuth access token
  expires at 3:30 AM every day; the Analytics Token is read-only, lasts a year
  and serves Market Quote with no static IP. A daily token works for a day and
  then fails every morning.
- **AND IT IS SHARED.** Upstox enforces its limits per API, per USER (50/s,
  500/min, 2,000/30 min), so three dashboards share one budget. This one spends
  ONE call per 60-second edge-cache refresh per data centre. The operational
  consequence is the one to remember: **when the token is regenerated or
  expires, replace it in all three dashboards together.**

#### `npm run build-upstox-instruments` — which instrument each symbol is

Upstox prices by INSTRUMENT KEY (`NSE_EQ|<ISIN>`); this book's live layer speaks
NSE symbols. The map is a LOOKUP against Upstox's own public instrument list —
exact trading symbol, NSE cash segment, a series allowlist that keeps out the
bonds and gold bonds that can share a company's symbol, ambiguity refused, and
where the book carries an ISIN the key must carry the same one. **160 of the 161
symbols the dashboard asks about map; 40 are checked against the book's own ISIN
and all 40 agree.** The one that does not is **HEG**: NSE renamed it HEG Advanced
Material (`HEGAM`), and the book prints no ISIN for it, so a name is all there is
to join on — and there is no name tier. It stays on muns and is named in
`docs/UPSTOX-INSTRUMENTS.md`.

The map is a generated `.mjs` rather than JSON, so the Cloudflare bundler needs
no loader, and its doc prints no count that moves daily, so `--check` reports a
change only when a MAPPING changes.

#### `/api/quotes` — Upstox first, muns for the rest, the same response

- **ONE CALL FOR THE WHOLE BOOK.** Upstox answers up to 500 instruments a
  request and the book asks about 161, so where the token works nothing is ever
  `pending` — the three-round fill Stage 10an engineered around is gone. muns is
  asked ONLY for what Upstox did not price: the unmapped symbol, or everything
  when Upstox is unset or refused.
- **THE RESPONSE SHAPE DID NOT CHANGE**, so nothing downstream had to: every
  page, `applyQuotes` and the `check:pages` mocks read the same fields. Each
  quote gains `source` (and `tradedAt` from Upstox); the response gains `sources`
  and an `upstox` diagnostics block; the top bar's live pill names the feed in
  its hover.
- **FOUR RULES, in `shared/upstoxQuotes.mjs`:** a row must echo the instrument
  key AND the trading symbol it was asked for — Glow Central Research's gate; the
  previous close is `last_price − net_change`, because `ohlc.close` is TODAY's
  close (Upstox's own sample prints it equal to the last price) and read as
  yesterday's it makes every day's move zero; `redirect: "manual"`, so the bearer
  token never follows a redirect; and a figure Upstox does not carry is `null`,
  never 0.
- **A REFUSED TOKEN IS NOT AN OUTAGE.** With nothing to fall back to it is
  `UPSTOX_UNAUTHORIZED`, and the top bar says the token was refused and where to
  look, rather than "the data service is down" — which sends a reader to wait for
  a service that is up. Upstox's error is listed FIRST, because `errors[0]` is
  what the page reads as the reason.

#### `GET /api/quotes?check=1`

One live call, one sentence: which variable the token was found under, whether
Upstox accepted it, three sample prices — or, on a refusal, the likely causes
(the daily token, a partial paste, a regeneration). Behind the site password like
every route, and it never returns the token or any part of it. **This is how
"please check" is answered from now on** — by anyone signed in, in one click.

#### The one figure Upstox does not carry

An Upstox full quote has no 52-week range and no market cap. Market cap has no
reader (Stage 10bc); the 52-week range does — the company page's Trading range
card. Where the quote carries none, the card takes the range from the price
history's DAILY CLOSES (the figures the returns table on the same page prints)
and its subtitle says which one it shows: intraday extremes and closes are
different measurements, and a caption that does not name its source is the
failure this file keeps recording. What must not happen is the card going blank
because the feed changed. `fetchPriceHistory` is memoised per symbol per page
load, so the two cards share ONE request and cannot show two different fetches;
a failed answer is not kept.

***THE TRADING RANGE CARD HAS SINCE BEEN REMOVED — see Stage 10cn.*** Its
52-week high and low are two columns of the returns table on the same tab, struck
from the same daily closes, so the card printed one figure twice. What went with
it is stated there rather than glossed: the muns quote's INTRADAY extremes where
they existed, and the bar showing where today's price sat in the range.

#### Verification

`upstoxQuotes.test.ts` — 32 checks against a stubbed upstream, on REAL entries of
the committed map: one call for the whole book, the partition, the previous-close
rule, the identity gate, where the token goes and that it appears in no response,
both variable names and the paste cleaning, muns only for the remainder, a refused
token with and without a fallback, the edge cache spending no second call, and
the check endpoint's three verdicts. **Twelve bugs were reintroduced one at a
time and each fired its own check.** One fired for the WRONG reason first —
reading `ohlc.close` before `ohlc` was declared threw, and the throw failed two
unrelated checks — so it was re-applied where it is a VALUE bug, and the
previous-close check caught it by name (`prevClose 52.05` = the price, a zero
day move). The existing `quotesFunction.test.ts` passes unchanged on the muns-only
path, which is what says the fallback is today's behaviour exactly.

The 52-week fallback and the pill were checked in a real browser against an
Upstox-shaped feed (no range) and a stubbed history: the card reads
`₹198.25 – ₹263.4 · of daily closes, from the price history`, the pill's hover
reads `priced live via Upstox`, and the history was fetched once.

`build` · `tsc` · `test:ingest` · `test:family` (a new `upstoxQuotes.test.ts`) ·
`check:family` **85/0** · `check:pages` **188 combinations clean**, with the same
eight evidenced abstentions across the same four claims Stage 10bp records — none
of them this change's. It adds no route, so the count is main's own.
`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY: a price source is not part of the book.

**WHAT COULD NOT BE CHECKED FROM HERE, STATED RATHER THAN IMPLIED.** The token is
in Cloudflare and nowhere else, so no test in this repo has seen a real Upstox
answer on this deployment. What stands in for that: the stubbed shapes are
Upstox's own documented sample; the sister dashboards call the same endpoint with
the same token in production; and `?check=1` is the first real call, one click
away for the family.

### Stage 10bs — A TILE IS A FIGURE AND ONE LINE, AND THE CALLS THE FAMILY IS TOLD ABOUT GO IN THE TABLE

*"the ui of this page is very ugly, First of all, these are action cards. They
need to have the major figure and a very short description, not such long
lines. No one will read this on the dashboard."* · *"Remove this, please. This
is not relevant. These kind of placeholders are not relevant."* · *"remove this,
it simply needs to be a editable coloumn in this table itself which people can
add and edit capital call and save and it stays same for all. We are trying to
see all views on master table itself instead of having such clutter."* · *"this
dropdown needs to be as subcategories in portfolio monitor and you can just give
tabs to me to click and quickly reach instead of a dropdown keep things clean."*

Four asks, three on Private Market and one on the Portfolio Monitor. The first
three are the same instruction the family has now given several times — *less
on the screen* — and the third is the one with a new piece of machinery in it:
**the first thing on this site that a reader types and every other reader sees.**

#### 1. Eighteen tiles, each a label, a figure and one short line

Every Private Market tile carried a paragraph — eleven of the eighteen had a
`hint` of 200 to 900 characters under the figure. They are gone, and each tile
is now what the family described: a short label, the figure, and ONE short line
saying what the figure IS (`Promised, not yet called`, `Cash sent to funds`,
`Cash paid back so far`). The labels shortened with them — `Private market
value` → `Market value` (the page is already the private one), `Still to call
(uncalled capital)` → `Still to call`, `Paid in, but never valued` → `Never
valued`, `Net multiple (TVPI / DPI)` → `TVPI / DPI`, and so on.

**THE DETAIL MOVED INTO THE TILE'S HOVER, AND A HOVER IS WEAKER THAN A CAPTION.**
`StatTile` takes a `title` and `TileMetric` a `detail`, so the coverage counts
and the working ride where they cost the tile nothing. Said plainly because it is
true: a reader scanning does not hover. What makes the trade affordable is that
the two claims a reader could actually be misled by without it — uncalled
capital is a liability in NO total, and Called and Paid in must never be
subtracted — are ALSO printed under the scheme table, where a reader doing that
arithmetic already is, and `check:pages` asserts both places.

**AN ABSENT TILE'S LINE IS ITS REASON**, in a few words (`No statement reports
it`), because an em dash must always name its cause — the full reason and what
would fill it is the hover.

**AND A LABEL WAS BEING CUT OFF WITH A THIRD OF THE ROW EMPTY BESIDE IT.**
"PRIVATE MARKET VAL…" and "STILL TO CALL (UNCALLED CAPIT…" were in the family's
own screenshot. The label is a CONTROL (the tile picker's button) and, sized to
its content, Chromium measured it short of its own text. The label div takes the
free width now (`flex-1`) and the picker button is `inline-flex`, so a label is
only ever cut when there is genuinely no room. `check:pages` measures it on the
text's own box, because a clipped label renders the same characters.

#### 2. "Funds this page does not carry" — removed, and nothing it carried was only there

It named the Category III funds (Sanshi, Buoyant, Carnelian Amritkaal) and the
three funds no statement places, with their values. Audited before it went:

| What it said | Where it still is |
| --- | --- |
| this page is the private side, and what the rest of the book is worth | the sides line under the fund table, on every view |
| the Category III funds and their value | the Portfolio Monitor's AIF section, and the AIF drill-down's own Category III heading |
| the funds nothing places | the "Not placed" facet of that drill-down, with its reason |

So what went is a card about funds that are NOT on this page — which is exactly
the family's word for it, a placeholder. `pageScopeNote` lost the two fields the
card alone read (`listedFunds`, `unplaced`) rather than keeping them computed
into no caller.

#### 3. The capital-call timeline — removed, and replaced by the thing that could fill it

Five boxes, three of them permanently empty: no fund in this archive publishes a
forward drawdown schedule (Stage 10ay measured it), so "next 1 / 3 / 6 months"
could only ever read "nothing scheduled". Its two real figures were already
elsewhere — **Due now** is a tile a reader can pick, and the undated **Still to
call** is the default tile and the scheme table's own footer. `callWindows`,
`CALL_WINDOWS`, `staleUncalled` and `staleRows` had no other caller and are
DELETED, not left exported; `capitalCalls.test.ts` asserts they are gone rather
than deleting its cases with them. The dated call history is its own card and is
unchanged.

**THE FORWARD-SCHEDULE ABSENCE DID NOT GO WITH THE CARD.** It lived in the
timeline's footer; it is the hover on the Capital call COLUMN now, which is
exactly where a reader wondering why calls are typed in rather than read looks.

#### 4. The Capital call column — typed once, seen by everyone

A column on the "Funds this family holds" table. Its cell shows the soonest call
still to come — or, where every call entered is past, the latest, marked `past`
— and how many more there are, and it is the button that opens an editor UNDER
THE ROW: every call for the fund with its date, amount and note, each editable
and deletable, and a form to add one. A row rather than a floating panel, because
it cannot be clipped by the table's own horizontal scroll and it reads as
belonging to the fund above it — "all views on the master table itself".

**"IT STAYS SAME FOR ALL" RULES OUT `localStorage`**, which is where everything
else a reader types on this site lives (a target price, a tile set, a thesis) as
a per-browser convenience. So `functions/api/capital-calls.js` keeps the calls in
**Cloudflare KV**, behind the same edge password gate as every `/api/*` route.
Four decisions in it are load-bearing:

- **ONE KEY PER CALL, CARRYING ITSELF AS METADATA.** One JSON document would be
  read-modify-write, and KV has no transactions: two people saving at once would
  each write back a copy missing the other's call, and nothing would say so. One
  `list` returns every call with no read per key; two edits to the SAME call
  resolve last-write-wins, which is the honest outcome for one row two people
  changed.
- **A SAVE IS VISIBLE AT ONCE TO WHOEVER MADE IT, AND A DELETE NEVER COMES
  BACK.** KV's list is eventually consistent (about a minute), so every answer
  applies the change to the list it returns itself.
- **A WRITE MUST COME FROM THIS SITE'S OWN PAGE.** The session cookie is
  `SameSite=None` so the dashboard works inside an iframe, which means a browser
  WILL send it cross-site. A foreign `Origin`, a `sec-fetch-site: cross-site`, a
  form post (which needs no CORS preflight) and a body larger than one call are
  all refused.
- **A DRAFT IT CANNOT KEEP IS REFUSED WHOLE, WITH ONE SENTENCE** the editor
  prints as it is — a date that is not a real day, an amount of zero or three
  zeros too many, an id the store never issued, a call too long for KV's 1 KB of
  metadata. Never half-written, never cut.

**AN ENTERED CALL IS NEVER A STATEMENT FIGURE.** It is what the family has been
TOLD is coming — a drawdown notice, an email — which no document in `source/`
prints. Nothing here reaches `glowData.ts`, and no entered amount is ever added
into Called, Paid in or Still to call; `check:pages` asserts the Still to call
tile and the scheme table's footer are still the book's figure after three
writes. The column is champagne where a statement figure is not, and its header
hover says all of this in words.

**THE CAUSE PICKS THE SENTENCE, AND NONE OF THEM IS AN EMPTY COLUMN.** An empty
column reads as "no calls are coming", which is the one thing a reader could act
on wrongly. `readReply` names four different causes and each sends the reader
somewhere different: the store not connected yet (503 `NOT_CONFIGURED` —
somebody with the Cloudflare account has one binding to add), the reader signed
out (the edge gate answers its login page), no server function at all (a local
preview), or the store's own error sentence. A background refresh that fails
keeps what was already on screen; only a FIRST load that fails says the store is
unavailable.

**IT NEEDS ONE SET-UP STEP, ONCE, AND UNTIL THEN IT SAYS SO.** Cloudflare
dashboard → Storage & Databases → KV → create a namespace → the Pages project →
Settings → Bindings → add a KV namespace binding named **`GLOW_STORE`** (for
Production and Preview) → redeploy. Until that is done every cell reads "Saving
is not switched on yet" and nothing offers to save.

***IT DID NOT READ THAT — see Stage 10cl.*** Each cell was an em dash with that
sentence in its HOVER and nothing to click, and the family read the column as
*"empty right now"*. Each cell says "Not set up" now and opens the editor, which
gives the reason and these steps, in Cloudflare's current menu names.

**WHAT IT CANNOT DO YET, STATED RATHER THAN PAPERED OVER.** The column is on the
FUND table, and a fund is a row there only if some statement values it. India
SME Investments Fund II (≈₹11.5 Cr of the ₹16 Cr still to call) and Sky
Capital's four angel folios publish no NAV, so they are in the "never valued"
card and not in the table — and a call cannot be entered against them. Adding
them as rows would put unvalued funds into a table whose footer sums market
value, which is a decision for the family rather than this change.

***CLOSED AT Stage 10bx.*** The fund table became the page's one master table,
which already carried those funds as rows — in a closed "Not valued" section
whose value cells are absent rather than summed, so nothing is added to a
market value. Every fund-level row now carries a Capital call cell, and a fund
no statement values keys its calls on its own name (`fund-<slug>`).

#### 5. The Monitor's section dropdown is a row of tabs

`All · Direct Equity · PMS mandates · ETF · Mutual Fund · AIF · Cash` on
Category; the family's own asset classes or baskets on the other two axes, "All"
first with the axis it spans (`All categories`) in its hover.

**NOTHING ABOUT WHAT A SECTION IS HAS CHANGED.** They are the same `buckets` the
select offered, in the same order, setting the same `bucket` state — built from
the BOOK through `groupKeyFor` on both views, so the Holdings table and the
Transactions table still narrow on one definition, and a switch of axis or view
still clears it. It is a ROW OF ITS OWN, drawn lighter than the axis picker above
it, because seven tabs beside four controls wrap the filter row on Category and
more than that on Basket — and a control that jumps lines every time the axis
changes is the clutter this replaces. Hidden on the Security axis, as the select
was, because that axis files every holding in one section.

**TWO CHECKS HAD TO MOVE, AND ONE WALK WAS SILENTLY BROKEN BY THE CHANGE.**
`the section filter offers this axis's own options` matched the select's first
option ("All baskets") in the page text; the tab reads "All", so the claim is
struck on the tabs now (`sectionTabChecks`, run on all three axes): the tabs are
exactly the sections the table draws, in its order, built by two different paths;
the dropdown is gone; one row, one tab lit; and the All tab's hover names the
axis. **And `monitor-axis-switch` picked its section with `select.nth(2)`** — a
POSITION among the page's selects, which on the tab build points at nothing — so
the route would have switched axis over an UNFILTERED table while its own claim
("switching axis WITH A FILTER SET leaves the table populated") went on passing.
It clicks a tab now, and a new check asserts the walk really did narrow to a
section before it switched.

#### The verification

Nineteen bugs were put back one at a time, each rebuilt and swept on the routes
it touches, with the files restored from an in-memory copy, VERIFIED byte for
byte, and **rebuilt on the way out** — restoring the source alone leaves `dist/`
at the bugged build for the next run to report under the wrong name. A patch that
does not apply, or a build that fails, is reported as NOT A RESULT rather than as
a clean sweep. Every one fires its own check:

| Bug put back | Fires |
| --- | --- |
| a long description back under a tile | "every tile is a label, a figure and one short line" |
| the hover detail dropped from every tile | 4 — the one-line check, and the three that read a coverage count or a definition out of the hover: the costed value, the accounts the private value spans, what uncalled capital is |
| a long label in the old layout, which clipped | "no tile label is cut off" — struck on the text's own box, because a clipped label renders the same characters |
| the "Funds this page does not carry" card restored | "…card stays removed" |
| the capital-call timeline restored | "the timeline stays removed, and what it held is still on the page" |
| the cell shows the LATEST call rather than the soonest to come | the cell check |
| `Cr` read as a lakh | the rupees check **and** the cell check |
| an edit sends no id, so it saves a duplicate | "an edit keeps the call's id and changes what was edited" |
| a delete sends more than the id | "a delete sends the call's id and nothing else" |
| an unreadable store drawn as "nothing entered" | both store-off checks, on two routes |
| entered calls added into Still to call | "an entered call is never added into a statement figure" |
| the column header's hover dropped | "the fund table carries a Capital call column, one cell per fund, saying what it is" |
| the old dropdown put back beside the tabs | 3 — the dropdown is gone, one tab per section, the All tab's hover |
| the tabs keep offering categories on every axis | the one-tab-per-section check on Asset class **and** Basket |
| the All tab stops saying which axis it spans | that check on Category **and** Basket |
| the tab row shown on the Security axis | "it draws no section headings and offers no section filter" |
| switching axis keeps the section | "the filter went back to offering every basket" **and** "switching axis with a filter set leaves the table populated" |
| the tabs wrap onto two lines | "one row of tabs, one of them lit" |
| the tabs lose their key handle, so the walk cannot pick one | the new walk-really-narrowed check **and** the filter-back check |

**TWO OF THE FIRST PATCHES WERE NOT A RESULT, AND THE HARNESS SAYING SO IS THE
POINT.** Both hid a hover behind `undefined && …`, which TypeScript 5.6+ refuses
as an always-falsy expression, so the build failed and nothing was swept. They
were rewritten as plain removals and re-run; read as a clean sweep they would have
reported two checks that were never exercised.

**AND ONE ABSTENTION STANDS BESIDE A FAILURE, NEVER ALONE.** With the section kept
across an axis switch, the stale key matches no basket and the table draws no
headings, so "…the page really did move to the basket axis" reports NOT CHECKED —
beside the two checks that fail on the same run. That is the shape this file
requires of an abstention.

`build` · `tsc` · `test:ingest` · `test:family` (a new `enteredCalls.test.ts`,
the store against an in-memory KV that pages and can be made STALE, and the
page's reading of the function's OWN responses so the two halves cannot drift) ·
`check:family` **86/0** · `check:pages` **192 combinations clean, 0 invariant
failures**, measured TWICE — on the tree merged with `7e02664` and again on the
tree merged with #69 (`b1fde92`) — main's own 188 plus the four combinations this
change's two new routes walk, with the same eight evidenced abstentions across
four pre-existing claims both times and none of this change's own. `npm run
build-book` regenerates
`glowData.ts` and `docs/BOOK-REPORT.md` BYTE-IDENTICALLY: nothing here touches
the ingest, and the one thing that stores data stores it outside the book.

#### Merged with main, and the letter collided for the thirteenth time

This section was `10br` while its full sweep ran on the tree merged with
`7e02664`, and **#69 — live prices from Upstox — landed on main in that window
and took `10br` too**. The two sections sat at the same place in the file, so
this time git DID mark the conflict — the safer of its two failure modes, and
the reason the letter check is run against main's tip at merge time rather than
trusted to a clean merge. Main's merged first and **keeps `10br`**; this section
is **`10bs`**.

**THIRTEEN LINES NAMED `10br` AFTER THE MERGE, AND EACH WAS CLASSIFIED AGAINST
THE TWO SIDES' OWN COPIES OF THIS FILE BEFORE ANY MOVED.** Nine are this
branch's — its heading, the two Layout bullets for `BOOK_COMMITMENTS` and the
call store, and the pointers under Stages 10ap, 10ay (twice), 10ba, 10bp and
10j — and moved. Four are main's — its own heading, the Layout bullet for
`shared/upstoxQuotes.mjs`, the Stage 7 note that `quotes` prices from Upstox
first, and the `build-upstox-instruments` entry under **Build** — and were left
alone. A bulk replace would have made the Upstox feed cite a page about capital
calls.

**AND NOTHING ELSE OVERLAPPED, WHICH WAS CHECKED RATHER THAN TRUSTED.**
`scripts/test-family.mjs` auto-merged with both new suites present
(`enteredCalls.test.ts` beside main's `upstoxQuotes.test.ts`); #69 does not
touch `check-pages.mjs`, so the `ctx` literal had nothing to conflict on and the
route table is unchanged; and neither side touched a generated book file, so
`npm run build-book` was run as a control and regenerated `glowData.ts` and
`docs/BOOK-REPORT.md` byte-identically.

**AND THE SWEEP WAS RE-RUN ON THE MERGED TREE RATHER THAN CARRIED ACROSS.** It
came back **192 combinations clean, 0 invariant failures**, with the same eight
abstentions read out of `report.json` BY NAME — four on the Morning CIO panels
(every KPI tile on this book carries a figure), two on Private Market (every
private holding reports a cost), one on the not-found drill-down and one on
`stock-qty` (no row there carries a pledge). The count did not move because #69
adds no route, and it is recorded as the same only because it was measured again.

### Stage 10bt — POLYCAB IS ONE TABLE, AND SECTOR COMPOSITION IS TWO HALVES

*"Look at how ugly the polycab tab is, You have made it too busy for no reason.
Polycab could be just a simple table with all the columns and fields as
required, and also match it with the exact UI upgrades that we're doing for
master tables in the private market tab and the portfolio tab."* · *"In this
sector composition tab this compare sectors needs to be a subtab next to direct
equity, you have made the pages too busy and why not give this whole table of
Sector breakdown next to this pie chart table by splitting the page into two
parts right and left, you are unnecessarily taking a lot of realestate."*

Two pages and one complaint: each printed the same figures several times over and
spent most of its height on chrome. **NOT ONE FIGURE ON EITHER PAGE WAS
RE-MEASURED** — `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` byte-identically, and the only arithmetic that changed is
two defects the rewrite fixed, both named below.

#### 1. Polycab — one card, three tables, a toggle

**BEFORE:** a hero with four pills (ring-fenced, `STATEMENT · as of` with the mark,
the ISIN, the price's live status), five KPI tiles (Market value, Shares held,
Statement mark, Cost basis, Market price), and four stacked cards — per demat, per
holder, what Polycab declared, and the promoter group with three tiles of its own.
The value, the share count and the mark each printed three times.

**NOW:** the page header with ONE pill — `Ring-fenced · excluded from portfolio
totals`, because a reader arriving from the nav has to be told why a ₹12,000 Cr
figure is not in the headline two pages over — and ONE card whose own header
carries a toggle, `Holding · Corporate actions · Promoter group`, at `?view=`.
That is Private Market's master-table shape (Stage 10bf): the control is in the
card that draws it and ONLY the active table is in the DOM, which is what makes
the page short and what `check:pages` counts. Every table sorts and every column
but the first drags (Stage 10bh), the heading row is sticky, and the card scrolls
inside itself so the page never does.

**EVERY FIGURE A TILE PRINTED IS A COLUMN, ON THE ROW IT DESCRIBES:**

| Was | Now |
| --- | --- |
| Shares held tile | the Shares column |
| Statement mark tile + the `STATEMENT · as of` pill | the Mark column with `statement` under its heading, and its derivation (value ÷ units, no rate column, not a live price) in that note's hover; the as-of is a column of its own |
| Market value tile | the Value column, `statement` |
| Cost basis tile | the Cost column — `AbsentCell` with its reason, never ₹0 |
| Market price tile + the live-status pill | the CMP column, its basis under the heading: `live · BSE`, `fetching` or `last close · BSE` |
| — | Day (the exchange's own move) and Market value `at CMP` — the only figure on the page a live price may move (§6) |
| the ISIN pill | under the security's name |
| the Per holder card | the Holder column — it restated one row as a second one-row table |
| Share of the block | GONE — with the block in one demat it could only ever print 100% |

**THE PLEDGE CLAIM MOVED A THIRD TIME, AND IT IS THE ONE THAT HAD TO.** Stage 10bq
put it on the promoter card's third tile, BESIDE the group encumbrance it exists to
be told apart from. That card is a table on another tab now, so the claim is on
this demat's own Pledged cell — `this demat` under the heading in words, and a dash
whose reason says both that the NSDL statement prints no pledge column AND that the
promoter group's pledge is a group figure, not a statement about this account. The
group half is under the promoter table's own heading (`group, not this demat`) and
in its card's subtitle. Two claims on two tables, each asserted where it is drawn;
neither implies the other, which is why neither is struck on the other's tab.

**A DASH OVER A FIGURE THE SOURCE DOES CARRY IS THE ABSENCE RULE RUN BACKWARDS, and
the old declared table did it five times.** Five of Polycab's eight dividends carry
a book-closure window and no record date, and the record column printed *"the
exchange publishes no record date"* over all five while the store held the window.
It is `Record / book closure` now and prints whichever the exchange published.

**THE FOOTER DRAWS ONLY WHERE THERE IS SOMETHING TO ADD UP.** A total of one row is
the row again. The table is written over the collection, so the day Bharat's HDFC
statement arrives as a text PDF it is a second row with no code change and the
footer appears with it — and `check:pages` asserts the footer ties to its rows the
moment there are two, and is ABSENT while there is one.

**AND THE CHECKS FOLLOWED THE TABLES THEY READ.** Three routes (`polycab`,
`polycab-dividends`, `polycab-promoter`), because only the active table is in the
DOM — the same reason the private book is walked at three addresses.
`polycabViewChecks(expected)` is spread into all three: the toggle offers exactly
the three tables, this address opens on its own, exactly ONE table and ONE card are
drawn (a build that stacked all three under a toggle filtering nothing renders
every figure correctly and satisfies every other check), and the page itself does
not scroll. Every claim the old tiles and cards carried is still made, struck on
`data-cell` handles because a row is drawn in the READER's column order; the ones
whose subject was REMOVED invert, so a restored tile, the per-holder table, the
share-of-block column or the second-statement card fails by name. The refresh date
on the sources line is REQUIRED rather than excused — "Last refreshed" over nothing
is the one thing that line must never print — and it is matched through a
`dmyRe` that accepts ICU's `Sept` as well as `Sep`, so a runtime changing its locale
data cannot fail a correct page.

#### 2. Sector Composition — two halves, three tabs

**BEFORE:** the donut with a two-column legend of every sector, three full-width
partition cards, a full-width sector table, and Compare sectors as a card at the
FOOT of the page — so comparing four sectors meant scrolling past everything else.

**NOW:** `Consolidated · Direct Equity · Compare sectors` beside the title, at
`?view=`, and a grid of two halves — the donut and what it is made of on the left,
the table on the right, 3 : 5. Each half scrolls inside itself on a short window;
the page itself does not scroll at the sweep's 1500×1000, and below `lg` the halves
stack, which is right on a phone.

**THE LEGEND WENT, AND NOTHING WENT WITH IT.** Every row of it — swatch, sector,
weight, value — is a row of the table beside it, which also sorts, expands and says
where each figure came from. Two lists of the same twelve sectors on one screen was
the real estate. The Unclassified reason that rode on the legend entry (Stage 10aq)
is on the table row, and on the picker's row on the Compare tab.

**ONE SECTOR IS ONE COLOUR EVERYWHERE.** The swatch is keyed on a sector's place in
the CONSOLIDATED order on every tab, so the chart, the table, the picker and the
comparison agree. `CHART_COLORS[i % n]` keyed on a rendered index would repaint
every swatch the moment a reader sorted the table — and the table sorts a COPY of
the rows for exactly that reason.

**THE THREE PARTITION CARDS ARE STACKED FIGURES IN THE LEFT HALF**, labels and
lines unchanged — which is why every check that reads them (the three that rebuild
the book, the excluded card's own total, the left-out card's route to
Consolidated) passed untouched. They are a label, a figure and one line each; three
full-width cards spent a row of the page on three numbers.

**COMPARE IS A TAB, AND IT OPENS ON SOMETHING.** Its left half is the donut and a
picker of every sector (largest first; a row or a wedge adds or removes one, up to
four) and its right half is a TRANSPOSED table of BOTH sets at once — Consolidated
(total exposure, weight, the measured and the derived halves, companies, largest
company) and Direct Equity (value, weight, holdings, the cost reported and how many
holdings it covers, return on cost, largest holding). It opens on the four largest
sectors rather than on an empty table asking to be filled — a default of the
largest by value is an ORDERING, not a judgement. A sector the family reaches only
through funds prints its measured half as `₹0 only via funds`: a COMPUTED zero, and
its reason is in the cell rather than in a hover.

**AND THE OLD COMPARE CARD WAS PRINTING A FALSE SENTENCE, NOT ONLY A MISSING
FIGURE.** Its sector rows carried `cost: null, pnl: null, returnPct: null,
withoutCost: count` on BOTH views, so Cost, P&L and Return were always a dash — and
the row beneath them, *"Of which report no cost"*, printed **N of N** on the Direct
Equity view over sectors where some holdings DO report one. Measured on this book,
Consumer Discretionary reads `₹47.6 L · 4 of 7` now: four of its seven own-account
holdings carry a cost, where the old card told the family none did. A confidently
wrong count is worse than a dash, because a reader goes looking for documents that
are already in hand.

**THE DIRECT EQUITY RETURN IS STRUCK WHERE ITS OWN COLUMNS CAN CARRY ONE.** The old
table rendered `fmtPct(null)` — a bare dash inside a formula popover whose worked
line read `— ÷ — × 100`, which is the absent-without-a-reason failure `Absent.tsx`
exists to prevent. `rollSectors` now strikes a return only where the holdings that
report a cost account for the whole sector (`costCoversSet`, the one test Morning
CIO and the Portfolio Monitor share), and every other cell is a dash naming which
costs are missing. Consolidated still refuses a return throughout, for its own
reason — its value is part derived. Measured on this book, ONE Direct Equity
sector is fully costed: Consumer Staples, all three of its own-account holdings
reporting a cost, reads **−30.28%** — a real measurement the old table withheld
behind a bare dash. The other eight are dashes naming how many of their holdings
report a cost (`4 of 7`, `1 of 5`, `1 of 10`, or none).

**AND THE GATE IS CHECKED — WHICH, IN THIS CHANGE'S FIRST DRAFT, IT WAS NOT.** The
first check on that column accepted any signed figure, so dropping the `covered &&`
term from `rollSectors` — striking a return over a sector's costed FEW and printing
it beside the value of all of them — would have passed it while putting a return on
Consumer Discretionary, Industrials and Financials. The sweep cannot re-derive a
sector's coverage without re-implementing the three sector tiers, so the return
cell carries the coverage it is gated on (`data-costed`, `data-holdings`,
`data-uncosted-mv`, `data-mv`), the check re-expresses `costCoversSet`'s 0.5% over
it rather than importing it, and the attributes are tied to the row's own printed
Positions count so a cell cannot carry one set's coverage beside another's row. A
dash's reason must state the row's own counts, because *"a cost is reported for 4
of the 7 holdings"* tells a reader which documents to go and find. Found by reading
the change back, before the bug pass rather than after it.

**EVERY CLAIM ABOUT THE ASK IS GEOMETRY OR STRUCTURE**, because not one word on the
page differs between a table beside the chart and a table under it, or between a
Compare tab and a Compare card. `sectorLayout` reads the grid's own `.card`
children through `data-sector-layout` rather than by their titles (the right card's
title changes with the tab), and `sectorLayoutChecks(expected)` is spread into all
three routes: three tabs, in order, beside the title's own line, this address on
its own; two cards side by side on one line with the table the wider half; the page
not scrolling; and the right half's table not cut off at the right — a table the
narrower card clips is the real estate the ask was about, arriving sideways.
`SECTOR_TABLE_TAB` holds the two claims the table tabs share: the legend stays gone
(a list in the left half that is not the picker) and Compare is a TAB (no picker
and no comparison drawn there). The Compare tab's own checks are ARITHMETIC on
figures the page prints: a sector's two halves add to its total, its weight is that
total over the donut's, and the Direct Equity rows sit inside the book's own
own-account set and are weighted over it — a comparison keyed to the wrong set
renders perfectly well-formed cells, and only the relations between them can see
it. The Consolidated return check used to slice the page between "Sector
breakdown" and the footer's opening words — a footer that went at Stage 10ap, so it
had been reading the whole rest of the page ever since; it reads each row's own
`data-cell="return"` now.

#### Two review findings — one valid, one not reproducible and still worth a check

**THE CARD CALLED THE RECORD "WHOLE SINCE LISTING" WHETHER OR NOT IT WAS.** Valid.
The subtitle of the corporate-actions card was a constant. The builder has a
supported path — the exchange's identity not established — that keeps the stored
actions with `actionsComplete: false`, and on it the subtitle called a possibly
truncated list complete while the bonus/split line beneath it correctly refused
to. Both now read the same flag (`usePolycabLive().complete`); the incomplete
wording says the latest refresh could not confirm the record is whole.
`check:pages` asserts it against the committed store in BOTH directions, off the
subtitle's own `data-polycab-card-sub` node. **The incomplete branch is one this
book never renders**, so it was exercised once on purpose: the store flipped to
incomplete with the page untouched sweeps CLEAN, which is what says the check
accepts the right wording rather than merely rejecting the wrong one.

**"THE CARD IS NOT HEIGHT-CONSTRAINED, SO `<main>` SCROLLS" — MEASURED AND NOT
REPRODUCIBLE, AND THE CHECKS COULD NOT HAVE SAID SO.** The card is a flex child of
the page's `flex h-full flex-col` root with `min-h-0` and the default
`flex-shrink: 1`, so it does shrink. At a 1500×480 window the page does not scroll
on any of the six addresses, and the table's own scroller inside the card holds
the rest: 141px on the corporate actions, 268px on the promoter quarters, 223,
114 and 238px on the three Sector Composition tabs. The holding table (one row)
fits.

What the finding exposed is real anyway: **at the sweep's 1000px every one of
these tables fits whole**, so "the page does not scroll" could not tell a card
that shrinks and scrolls inside itself from one that simply grew with its content.
`SHORT_WINDOW` measures the same page at `SHORT_H` (480px) and restores the
viewport before the invariants and the screenshot: the page must not scroll, no
card may spill past its own box, and a table that does not fit must be held by an
on-screen scroller inside its card. It checks that the window really WAS short,
because a resize that silently did nothing would measure the 1000px page again and
pass by asserting nothing.

#### The bug-reintroduction pass, and the two cases that came back CLEAN

Polycab: **22 cases, every one fires.** 20 fire a sweep invariant and 2 only the
suite — the pledge defaulting to 0 and the store's ISIN diverging — both invisible
on screen by construction, as Stage 10bk records. Case 21 (the subtitle claimed on
an incomplete record) fires the subtitle check; case 22 (the card set to
`flex-none`, the reviewer's shape) fires the short-window check on the two tables
that do not fit, and correctly NOT on the holding table, which fits either way.

Sector Composition: **14 cases, every one fires — two of them only after a second
look, for two different reasons.**

- **CASE 11 WAS A CHECK THAT COULD NOT FAIL.** The tabs moved into the header's
  SUBTITLE slot came back clean: the check asked only "to the right of the title
  and on its line", and a `w-full max-w-2xl` subtitle fits beside the crumb and the
  title on a wide header, so the tabs landed at the far right of the row — measured
  **489px** from the title, still on its line — and satisfied every clause. The
  check requires ADJACENCY now (≤32px; where the tabs belong the gap measures 9px,
  the header's own `gap-x-2.5`) and fires on all three tabs. The comment beside it
  first said 900px, a figure nobody had measured; it says 489px because that is
  what the measurement says.
- **CASE 14 WAS A PATCH THAT DID NOT CREATE THE BUG.** Its first draft removed the
  grid's `minmax(0,1fr)` row and swept clean — not because the check was blind but
  because nothing changed: an `auto` row over items with `min-height: 0` only grows
  into the free space a definite-height grid has, so the page still fit at 480px
  (measured, main scroll 0). The cards' own `max-h-full` is the cap; without it
  both halves grow — measured, main scrolls 261px on `/sectors` and 383px on
  Compare at 480px, and 0 at 1000px, where no other check can see it — and the new
  check fires on all three tabs. **A reintroduction that does not reintroduce the
  bug is a clean run that proves nothing**, and only a measurement of the patched
  page tells it apart from a blind check.

Both harnesses take `CASES=` now, so one case is re-run alone rather than paying a
build and a sweep for every case to re-check one.

#### Merged with main, and the letter collided again

**#71 took `10bs` while this branch held it.** Main merged first and keeps it; this
section is `10bt`. Fourteen lines named `10bs` outside the two sections and each
was classified by whether it exists verbatim on main: six were this branch's (the
Polycab page paragraph, Stage 10bq's pledge claim, the six-invariants paragraph,
Stage 10bk's two cards, Stage 10at's donut and Stage 10aq's legend) and moved;
eight were main's and were left alone. The stage headings then differ from main's
by `10bt` alone, with main's ten historical duplicates unchanged.

**THE `ctx` LITERAL AUTO-MERGED, WHICH IS WHEN IT IS MOST DANGEROUS**, so it was
read rather than trusted: 81 keys, none duplicated, the exact union of both sides
— the two this branch adds (`sectorLayout`, `shortWindow`) beside main's, and main
added none. No generated file was touched by either side, and `npm run
build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md` byte-identically
on the merged tree.

`build` · `tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` · `check:family` **86/0** · `check:pages` **198 combinations
clean** on the merged tree, with the eight evidenced abstentions main's own sweep
carries and **not one of this change's own**. This branch's pre-merge sweep was
194 — its three routes (`polycab-dividends`, `polycab-promoter`,
`sectors-compare`) across both themes on top of its base — and #71 adds two
(`private-market-calls`, `private-market-calls-off`), so 198 reconciles; it is
recorded because it was measured again, not because it adds up.
### Stage 10bu — BSE IS THEIRS, NO STATEMENT REPORTS IT, AND THE SCREEN NOW SAYS SO

*"Open PR and do not merge until i tell you to."* · *"According to the client,
BSE is a holding for them and it is also provided for in the statements that
they have provided us. But it is not visible anywhere on the dashboard… check
why we cannot find BSE as a holding. Find the root cause of it and fix it. It is
named either Bombay Stock Exchange or BSE."*

**THEY ARE RIGHT THAT THEY HOLD IT AND WRONG THAT A STATEMENT CARRIES IT, AND
SEPARATING THOSE IS THE WHOLE OF THE ANSWER** — because the two need completely
different work, and only one of them is code.

#### 1. Where BSE actually is, measured rather than reasoned about

| Searched | BSE-the-COMPANY |
| --- | --- |
| **251 source PDFs**, every ZIP expanded, read with pdfjs | **0 hits.** All 55 matches are the EXCHANGE COLUMN on a trade row (`Thermax Ltd BSE 304.000`) or the broker's own `SEBI Regn. No.(BSE/NSE/MCX/NCDEX)` line |
| the **8 encrypted** ones, which need `GLOW_PDF_PASSWORDS` | read at ingest — all 8 resolve to documents in `public/audit/`, and the archive carries no BSE and **no "Bombay" at all** |
| **7 spreadsheets** | **one hit, and it is the finding** — see below |
| `INE118H01025`, BSE Ltd.'s own ISIN | **0**, in `source/` and in the archive |
| the **3 text-less PDFs** | the ones this file already documents: Bharat's HDFC scan (4 JPEG pages, and **no value column at all**) and the two trust statements, read by rendering, one Swapeco line each |

**THE ONE HIT IS THE FAMILY'S OWN CONSOLIDATED REVIEW**: `BSE Ltd.`, 40,000
shares, **₹15.46 Cr**, Ajay Jaisinghani, via MOPWM, coded `Direct Equity - Non
MO` — and its own transaction history reconciles to that closing quantity
exactly: 13,500 bought 19 Jul 2023, 9,500 more 23 Oct 2024, a 2:1 bonus on 23
May 2025 and 29,000 sold 26 Aug 2025. **That workbook is NOT A SOURCE FOR A
LISTED SHARE — by decision**, so the book is right to carry nothing: a figure
for it would be the fabrication this whole book
exists to prevent. *(Stage 10dh narrowed that decision for the review's
PRIVATE-MARKET blocks alone, and BSE is on its Equity tab: this line is
unchanged, and so is the ask.)*

**AND THE RECONCILER HAD ALREADY SAID ALL OF IT.** `docs/REVIEW-RECONCILIATION.md`
has carried BSE Ltd. in section C2 (*"no statement in `source/` reports this"*)
and on the D1 ask list (*"held at Motilal Oswal; the drop carries a holding
statement for three of its demat accounts and a transaction tape only for a
fourth"*) for as long as that report has existed. **Nothing was wrong with the
book, the archive or the analysis. What was wrong is that a reader could not
reach any of it from the screen.**

#### 2. So the defect is the SCREEN, and it is one this file has already named

The family typed BSE into the holdings pick-list and got:

> **No holdings match “BSE”.**

which is indistinguishable, to them, from the dashboard having lost a ₹15 Cr
position they know they own. That is the Fractal Analytics defect one layer up
— *"the family opened Fractal Analytics and saw four dashed tiles and asked
whether the data was absent or the dashboard was buggy. **That question is the
defect**"* — and it is answered by the same rule: *a reader who cannot tell "no
custodian sent this" from "the dashboard is broken" assumes the second.*
`costWhy` names the custodian on a cost cell for exactly this reason. **An empty
search result is an absent measurement, and it owes the same sentence.**

#### 3. `src/data/reviewGaps.ts` — emitted by the reconciler, not by a second reader

`npm run reconcile:review` now writes the module beside the report, and
`custodianNote` and `askFor` were **hoisted to module scope so both read the
same two functions**. Two copies would be two chances for the ask list and the
dashboard to name different documents for one line — the drift
`registerRead.mjs` was extracted to stop, one workbook over. The hoist was
verified as behaviour-neutral BEFORE anything was added: the report regenerates
**byte-identically**.

**`--check` IS THE CONTROL RUN** and covers both outputs, the convention every
other generator here follows. It is a no-op.

**NOT ONE FIGURE OF THE REVIEW'S CROSSES OVER, AND THAT IS THE WHOLE LICENCE FOR
PUBLISHING ANY OF IT.** `ReviewGap` has no value and no quantity — only the
name, where the review says it is held, and the two sentences the report already
prints, neither of which is a valuation. Three guards, because they fail
differently:

- the **emitter throws** on a numeric field, so a future edit that adds `mv` to
  the projection fails the run rather than shipping a review valuation;
- `reviewGaps.test.ts` asserts the emitted TEXT carries no `₹` and no crore or
  lakh figure — a value smuggled through prose is not a schema change;
- and `check:pages` asserts the same of what RENDERS, which is the other end.

**AN AGGREGATE IS LEFT OUT**, for the reason `askFor` already gives: `Private
Equity ₹136.16 Cr` is a block the review itemises on another tab and no
custodian issues a statement for it, so it is neither a name anybody searches
nor a document anybody can send. 44 lines remain.

#### 4. The alias is committed and cited, and there is still no fuzzy tier

The family named it twice in one sentence — *"either Bombay Stock Exchange or
BSE"* — and the review prints only the short form, so a reader typing the long
one finds nothing. `SEARCH_ALIASES` is one entry with that quotation beside it.

**A SEARCH ALIAS JOINS NOTHING AND MOVES NO MONEY**, which is what makes it a
different object from `SECURITY_ALIASES`: it decides only whether a reader finds
a sentence about an absence, so getting one wrong costs a wrong sentence rather
than a wrong figure. It is still a hand-checked table. `reviewGapsFor` matches
by SUBSTRING IN BOTH DIRECTIONS and nothing looser — `shared/nameMatch.mjs`
records what a token-overlap rule did to this corpus (`KIRANAKART TECHNOLOGIES`
to `TATA TECHNOLOGIES`), and the bug pass below reproduces it here: the tier
matched `Deep Industries` to `Man Industries` and to `Manorama Industries`.

A one-character query matches nothing: at that length a substring rule names
half the list, which is noise rather than an answer.

#### 4b. AND THE NOTE MAY NOT CLAIM A NAME THE BOOK MAY HOLD UNDER A CLIPPED ONE

**FOUND BY READING THE 44 NAMES RATHER THAN BY A CHECK, and it was live.** The
list carries `Onesource Specialty Pharma` — and the family's own screenshot of
the defect shows `Onesource Special` in their table at ₹8.15 Cr. The book's row
is `ONESOURCE SPECIAL-EQ`, 48,000 shares, ₹8.61 Cr: a DEPOSITORY'S CLIPPED
SPELLING of the same company. Reproduced against the running page — searching
the review's spelling returned 0 options and a note saying no statement reported
it, **about a position one search away**. That is worse than the silence this
change replaces, because it is a false statement rather than no statement.

**THE RECONCILER IS RIGHT AND THE SCREEN WAS WRONG, WHICH IS WHY THE FIX IS NOT
IN THE JOIN.** `shared/nameMatch.mjs`'s prefix tier runs ONE WAY on purpose, and
its own comment records why: accepting the reverse matched `Vedanta Power`,
`Vedanta Iron & Steel` and `Vedanta Oil & Gas` onto the single book row named
`Vedanta` — four demerged companies reported against 12,909 shares of their
former parent. Loosening it would re-commit that.

So the SUPPRESSION tier is looser than the JOIN tier, deliberately, and the
asymmetry is the argument: **there a weak match publishes a figure; here it only
decides whether to stay quiet.** Suppressing too much costs the silence a reader
already had; suppressing too little tells them their own holding is missing.
`reviewGapsFor` therefore withholds any gap whose key is prefix-related to a
book position's in EITHER direction, or on the same letters with the separators
removed.

**IT WITHHOLDS 8 OF THE 44, AND THREE OF THOSE ARE REAL GAPS.** Five are the
clipped spellings it exists for — Onesource, Bharat Parenteral, Infinium Pharma,
Kaynes Technology, Zaggle Prepaid — and three are Vedanta's spin-offs, which the
book genuinely does not hold and which this rule declines to claim anyway,
because nothing here can tell a clipped name from a demerged one without the
hand-checked abbreviation table this file already names as the remedy. **Three
real answers withheld rather than one false one published**, stated rather than
glossed.

***IT WITHHOLDS 10 OF THE 44 SINCE Stage 10ce*** — the two more are review lines
the LIVE book now values from a depository's own balance (Motilal Oswal
Arbitrage and HDFC Liquid), which no name tier can see because those rows are
not in `BOOK_POSITIONS`. They are joined by ISIN through a hand-checked table,
each licensed by the review's own purchase matching a depository credit unit for
unit, and the tier is keyed on what the live book actually carries.

**AND IT IMMEDIATELY BROKE A CHECK OF MY OWN, which is the same lesson one level
down.** The fuzzy-tier suite check carried `"vedanta"` as its anti-vacuity probe
— *the probes must actually find gaps, or the check passes by matching nothing*
— and Vedanta is precisely what the new rule withholds, so a correct build
failed. A probe list that names a case BY HAND goes stale the moment the rule it
was written against moves; the probes are derived from the claimable list now.

#### 5. Three searches are wired, ONE is walked, and the other two are guarded

`AbsentFromBook` lives in `Absent.tsx` because it is the whole-holding form of
everything already there, and it is rendered by the Portfolio Monitor's
pick-list, Family & Entities' holdings search and the `/holdings` filter.

**ONLY THE FIRST IS DRIVEN BY `check:pages`**, and that is stated rather than
implied: reaching the other two needs a search that matches nothing, and no
route types one. So the suite carries a SOURCE check that each of the three
still renders it — crude, and it cannot tell a working note from a broken one,
which is what the Monitor walk does on the shared component. What it catches is
a caller that stopped rendering one at all, which is the half nothing else would
report. Reintroducing exactly that fires it.

#### 6. Ten bugs reintroduced, and TWO of them were defects in the checks

`scripts/dev/absent-name-bug.sh`, committed so the next session's verification
is one command. Restores BY COPY on a `trap … EXIT` — three of the files it
patches are new and untracked, where `git checkout --` silently does nothing —
**and rebuilds on the way out**, and reports a failed patch or a failed build as
NOT A RESULT. A no-patch control runs first. **The work was committed before it
ran at all**, which is Stage 10bm's own rule after a harness there destroyed a
day of unversioned work.

Eight fired first time. The two that did not are the return on running it:

- **REMOVING `emptyNote` FROM THE MONITOR — THE ORIGINAL DEFECT, EXACTLY — LEFT
  ITS OWN INVARIANT GREEN.** It returned a descriptive STRING on failure, and
  the harness reads any truthy return as a PASS (`else if (!r)
  invariants.push(desc)`). That is the Stage 10an defect, committed again in a
  change written with that paragraph open, and only its two neighbours spoke.
  Booleans now.
- **AND "AN ORDINARY RESULT IS NOT GIVEN ONE" COULD NOT CATCH THE NOTE
  RENDERING UNDER EVERY TYPO.** A query that MATCHES options never reaches the
  empty state at all, so `emptyNote` is never called and the note is absent
  whether or not the component guards itself — measured, dropping the guard
  produced a completely clean sweep. What catches it is a query that empties the
  list AND names no gap, which is what a typo does. Derived by reversing a real
  name rather than typed, and the check abstains if it ever matches something.

Two more defects were found by reading rather than by the harness:
`REVIEW_GAP_BOOK.held` was computed and read by nothing once the probe moved,
and was deleted with its reader; and the held-name probe was taken from the BOOK
until it abstained on a correct page — `displaySecurity` rewrites a depository's
clipped label into the AMC's published name (Stage 10az), so `Position.security`
is routinely NOT what the control offers. It is read off the rendered options
now.

**AND CAPITALISING THE SENTENCE BROKE A CHECK, which is the `label-xs` trap
again**: `innerText` returns the TRANSFORMED text, so a literal comparison
failed a note carrying exactly the right words. Case-folded.

**THE WALK LEAVES THE NOTE ON SCREEN** at the end, which is not tidiness: the
contrast sweep resolves computed colour on what is RENDERED, and this is the
only thing in the app drawing `text-champagne-400` inside a dropdown. A
`champagne` variant with no light-mode remap has shipped twice here and both
times it rendered only in a state no route walked.

#### 7. What the family should actually be asked for

**One document, and it is already named in `docs/REVIEW-RECONCILIATION.md`'s D1:
Motilal Oswal holding statements for the demat and PWM accounts not in the
drop.** The drop carries a holding statement for three of the family's Motilal
demat accounts and, for the fourth — Ajay's main one, `1201090012539150` — only
a TRANSACTION tape, whose closing balances carry quantities and no rates.

**BSE IS ONE OF TWENTY LINES BEHIND THAT ONE DOCUMENT**, which is what makes it
the ask worth putting in front of the family rather than a list of holdings to
chase. The other two asks account for the rest of the 44: ten lines wait on
Bharat's HDFC Bank NSDL statement AS A TEXT PDF RATHER THAN A SCAN, and fourteen
on AMC folio statements or a CAS. The moment the Motilal one arrives, BSE leaves
this list and enters the book with
a figure struck by the institution that holds it — and `reviewGaps.test.ts`
flips to saying so rather than passing over a sentence that has quietly become
false.

#### 8. Merged twice, and the second round brought BOTH predicted conflicts

Held open at the family's request (*"do not merge until it tell you to"*), and
main moved twice while it waited — #70 and #71, then #70 again as `8bcd2c8`.

**THE FIRST MERGE WAS CLEAN, WHICH IS EXACTLY WHEN TO CHECK BY HAND**, and all
three were: the `ctx` literal auto-merged and was PROVED a mechanical union
rather than trusted (35 keys, nothing dropped from either side, nothing
invented); the ten duplicated stage letters were byte-identical to main's own
pre-existing ten, so none was introduced; and every generated file was
re-derived byte-identically.

**THE SECOND BROUGHT THE IDENTICAL PAIR THIS FILE HAS NOW RECORDED TWELVE
TIMES**, and it is also what was blocking CI: `mergeable_state: "dirty"`, and
GitHub cannot build `refs/pull/N/merge` on a conflicted PR, so the workflow
never fired at all. The five runs GitHub showed for this branch were the
PREVIOUS PR's, on a branch name reused — which reads as CI having passed until
the head SHAs are compared.

- **The `ctx` literal conflicted**, this time as a FRAGMENT of a two-line
  literal rather than the whole of it, so a naive split on `{`…`}` throws. Split
  on the continuation up to `})`, unioned, and each of the 37 keys then
  confirmed to resolve to a declaration in the merged file — because a key
  naming a probe that no longer exists throws inside every check and is reported
  as a broken matcher on every route, not as a clean page. **Mine is
  `absentName`; main's two are `sectorLayout` and `shortWindow`.**
- **And the stage letter collided TEXTUALLY rather than silently**, because both
  sides inserted at the same anchor — the one failure mode that announces
  itself. Main's `10bt` merged first and keeps it; this section is `10bu`.
  **Every one of the nine `10bt` references in the file is main's** — they name
  Polycab-as-one-table and Sector Composition's two halves — and this section
  references no letter at all, so none moved. Checked one at a time rather than
  swept.

### Stage 10bv — BUOYANT'S COST WAS THE FUND'S RESTATEMENT, NOT WHAT THE FAMILY PAID

*"The user does not believe this data — can you please audit and check carefully
if this is correct?"* — a screenshot of the Portfolio Monitor's Buoyant row:
Invested ₹72.5 Cr, Avg cost ₹135.84, Unrealised +₹4.51 Cr, Return +6.22%,
Invested on `—`.

**THE READER WAS RIGHT NOT TO BELIEVE IT, AND ONLY HALF THE ROW WAS WRONG.** Every
figure was checked against the fund's own documents before anything changed:

| | Screen | The documents | |
| --- | ---: | ---: | --- |
| Units | 53,35,611 | 53,35,611 | right |
| NAV, 31 Jul 2026 | ₹144.29 | ₹144.2878 | right |
| Market value · weight | ₹77 Cr · 10.8% | ₹76.99 Cr | right |
| **Invested** | **₹72.5 Cr** | **₹70.86 Cr paid** | **₹1.62 Cr too high** |
| Unrealised · return | +₹4.51 Cr · +6.22% | +₹6.13 Cr · +8.65% | understated |
| Invested on | `—` | 1 Jun 2024, ten payments | missing |

**ROOT CAUSE: A CLASS SWITCH THE FUND BOOKS AS A SALE.** Buoyant moved Ankita's
folio from Class A1 into A4 on 1 Feb 2025 and Ajay's on 1 Jun 2026, each on the
day of a top-up, and printed each move as a `Unit Redemption` of the A1 units
and a `Units Allotment` of A4 units **at that day's NAV, for the same rupees**.
So the appraisal's `Cost` column restarts at the switch-day VALUE of the units —
₹72.48 Cr — and the book took that figure as money paid in. Nothing was misread;
the statement's cost means "cost since the switch", and the book's column means
what the family paid.

**FIVE WITNESSES, AND NONE OF THEM IS THE NEW FIGURE'S OWN COPY:**

- the account statement's own `Cash Deposits` — ₹46.0 Cr (Ajay) and ₹24.85 Cr
  (Ankita), plus one ₹58,861.66 `Gain Distr.` reinvested in an allotment;
- the fact sheet's since-inception `Contribution` — the same two figures;
- the performance appraisal's `Realized Gain` — **₹1,52,95,129.24 and
  ₹9,10,446.38, exactly the gap between the printed cost and the paid one**. The
  fund itself calls the switch-day restatement a realised gain; no money left;
- every contribution's entry NAV, as bought, is printed on the account's own
  pages to four decimals;
- and the family's own consolidated review carries `Investment at Cost`
  **₹70.8558861 Cr** — the carried cost, to the rupee — where the printed one is
  ₹1.62 Cr away. The review is not a source for a cost here (§"the consolidated
  review workbook is not a source — by decision", narrowed at Stage 10dh for the
  PRIVATE-MARKET lines alone, and Buoyant is on the listed side); it is the
  cross-check it has always been allowed to be, and `carriedCost.test.ts` reads
  it.

#### What changed

1. **`buoyantFlows` in `providers/altFundStatements.mjs`** reads the dated tables
   the reader had been walking past — `Cash Deposits`, `Units Allotment` and
   `Unit Redemption` per class, `Gain Distr.` — and publishes them only if FIVE
   checks the statement supplies all tie: units × NAV = amount on every row; the
   running units per class reach the Account Summary's own balance; every
   redemption pairs with a same-day allotment of another class for the same
   rupees (the switch); every deposit pairs with a same-day allotment (plus any
   reinvested `Gain Distr.`); and Σ deposits = the printed `Capital Invested`. Any
   failure publishes NOTHING and says which. A switch leg is `kind:
   "reclassification"`, outside `CAPITAL_KINDS` — 3P's precedent (Stage 10am):
   the same rupees leave one class and arrive in another, and typed as a
   withdrawal and a contribution they would put money out and back into the
   family's record that never moved.
2. **`npm run replay:flows`** lands it in the committed archive without the PDF
   passwords — the sixth faithful partial replay. Three documents gained a dated
   record (0 → 7 rows each, five contributions and two switch legs); nothing else
   moved; `--check` is a no-op.
3. **`scripts/lib/classSwitch.mjs`** carries each contribution bought in the old
   class through the switch, **at the fund's own unit ratio** (units allotted ÷
   units redeemed), keeping the date and the amount paid; and sets the holding's
   cost to what its contributions paid, keeping the statement's figure beside it
   as `printedCostBasis` — a CHECK, never a source (§4). Two gates, both struck on
   the statements: the printed cost must equal the direct allotments plus the
   switched-in amount (±₹1), or the restatement is not one this book can undo;
   and where the account holds nothing else, the gap must equal its own
   appraisal's since-inception Realized Gain (±₹1). A switch whose old-class lots
   do not account for every unit it moved, or after any cash redemption from the
   old class, is NOT carried and is named in `docs/BOOK-REPORT.md` — which lots
   moved would then be a selection no statement makes.
4. **The screen says which figure it is.** The Invested cell's hover, the company
   page's Avg cost tile and each account row name the statement's ₹72.5 Cr and
   why it differs; a contribution carried through the switch is marked
   `switched A1 → A4, <date>` in its history, with the units and NAV it was
   BOUGHT at in its hover. `carriedCostNote` is the one place those words are
   chosen.

**WHAT IT MOVES, AND WHAT IT DOES NOT.** Only three exports of `glowData.ts`
change: two Buoyant `BOOK_POSITIONS` (cost, avg cost, unrealised, return, and the
new `printedCostBasis` / `costBasisSource`), `BOOK_CAPITAL_MOVES` (121 → 131 rows,
11 → 13 accounts) and `BOOK_POSITION_TRANCHES` (7 → 9 positions).
**`BOOK_SUMMARY` does not move by a rupee** — market value is untouched, so no NAV,
split or allocation weight moves. What does move is every COST total the Buoyant
row is in: Capital invested falls ₹1.62 Cr (₹471.9 Cr → ₹470.3 Cr), and the
returns struck on it rise.

| | Before | After |
| --- | ---: | ---: |
| Ajay (103473) — invested · gain · return | ₹47.54 Cr · +₹1.76 Cr · +3.71% | ₹46.01 Cr · +₹3.29 Cr · +7.16% |
| Ankita (103472) | ₹24.94 Cr · +₹2.75 Cr · +11.01% | ₹24.85 Cr · +₹2.84 Cr · +11.42% |
| The row | ₹72.48 Cr · +₹4.51 Cr · +6.22% | ₹70.86 Cr · +₹6.13 Cr · +8.65% |

(Ajay's ₹46.01 Cr is ₹46.0 Cr paid plus the ₹58,861.66 distribution the fund
reinvested — cost, as the appraisal's own `Income` line says, and exactly what the
family's review carries.)

**AND WHAT IT DELIBERATELY DOES NOT DO.** Realised P&L stays `—`: no capital gain
statement covers Buoyant, and the switch paid nothing out, so the fund's "Realized
Gain" is a gain inside the fund rather than money in the family's hands. The
per-account XIRR on `/performance` is untouched — its flows come from the
capital register, which was already right.

#### The checks — and a check that had been true by luck

`buoyantFlows.test.mjs` (42) breaks a synthetic statement once per check;
`classSwitch.test.mjs` (44) holds the carry and both gates on constructed inputs;
`carriedCost.test.ts` holds the book to the four documents above and asserts,
load-bearingly, that the printed and carried costs differ by more than ₹1 Cr —
or every equality in it would pass on a book where no switch restated anything.
`check:pages` gains `monitor-tranche-switch`, `monitor-tranche-shared` and
`stock-carried`, and the default `monitor` walk holds the Invested cell to the
carried figure AND to naming the printed one.

**TWO EXISTING CHECKS HAD TO MOVE, AND BOTH WERE WRONG FOR A REASON WORTH
KEEPING.** Buoyant's history is now the book's largest (ten contributions across
two folios), and it TIES with Sanshi's clubbed row at ten — so the walk that
opened "the row offering the most" opened Sanshi (first in DOM order) while
`BIGGEST_TRANCHE`, keyed per class, named Buoyant. Every tranche route now opens
the row the BOOK names for it. And *"a cheaper entry NAV always shows the higher
return"* was struck on the DISPLAYED figure, which is a CAGR on rows held a year
or more: a CAGR shrinks with the years held, so an old cheap tranche can print
below a young dear one while earning more — Buoyant's ₹117.30 entry prints CAGR
9.67% beside a ₹122.64 one at 10.89%. **It was true of Sanshi's dates by luck.**
The claim was always about what the money EARNED, so it is struck on each row's
holding-period return (`data-tranche-hpr`), and a second check ties that
attribute back to every row that prints an HPR, so it cannot become a figure the
page never shows. The "same NAV, same return" claim moved with its subject to
`monitor-tranche-shared`, which opens the history the book says has such a pair.

`tranches.test.ts`'s entry-NAV check skipped any NAV it could not find with the
comment "this issuer prints no NAV column" — false of Buoyant, which prints every
one. Carried tranches are now counted apart by name and must equal the book's
own count; `carriedCost.test.ts` is where their as-bought NAVs are found, and it
FAILS rather than skips.

(An older passage above says Ankita's folio "sends the PMS set and no account
statement". It does send one — `I83_103472_AccountStatement`, in the same bundle
— and it is the document this reader reads.)

#### And the full sweep found a defect this change exposed, in code it had not touched

Funding Buoyant's capital record put its two folios on the Transactions card —
and `monitor-txn-basket` failed *"every section is one the shared filter
offers"*. **Each Buoyant folio carries an empty cash sleeve, a MEASURED ₹0,
beside its fund units**, so `txnAxis.forAccount` read both accounts as MIXED on
every axis and filed their payments under *"Not classified by the statement"* —
false of a fund whose statement names the class every payment bought. Its own
comment said *"No account in this book is mixed on any axis — measured, all
eleven funded ones resolve to one"*: true of eleven, not of thirteen.

A line that holds nothing is set aside now where the account holds something
else, and only there — an account holding nothing but ₹0 lines (3P, redeemed to
nil) is still filed under what it held. `txnAxis.test.ts` holds every funded
account to a real section on all three axes, and asserts load-bearingly that the
rule does work on this book (both Buoyant folios are mixed only while the ₹0 line
is counted). **The page check sees it on the Basket axis alone** — on Category
the unstated heading is one the filter offers — so the suite is what covers the
other two.

#### Sixteen bugs reintroduced, each caught by its own check

`scripts/dev/carried-cost-bug.sh` applies each alone, runs the layer it lives in,
and restores by copy on a trap — rebuilding on the way out. A no-patch control
ran clean first.

| Bug put back | Caught by |
| --- | --- |
| the Invested cell's hover loses the carried note | `monitor` — the carried-cost cell check |
| the row shows the statement's restated cost again | the same check (₹72.5 Cr shown, not ₹70.9 Cr) |
| a switched contribution loses its mark | four `monitor-tranche-switch` checks |
| the as-bought NAV becomes the restated one | "…and each names the NAV it was bought at" |
| the panel stops saying what a switched row is | "the panel says what a switched row is" |
| the HPR attribute carries the printed (maybe annualised) return | "a cheaper entry NAV always shows the higher return" |
| the company page's Avg cost tile forgets its basis | `stock-carried` — the tile check |
| the company page's account cell forgets its hover | `stock-carried` — the account-row check |
| an empty cash sleeve makes a funded account mixed again | `monitor-txn-basket` — "every section is one the shared filter offers" |
| the cost is never carried (book) | `carriedCost` ×3 and `tranches` ×2 |
| the lots are carried unit for unit, ignoring the ratio (book) | `carriedCost` ×3 — the tranche gate refuses, so nothing is carried |
| a carried lot takes the switch-day value as its cost (book) | `carriedCost` ×3 — gate B refuses, for the same reason |
| gate A removed | `classSwitch` ×2 |
| gate B removed | `classSwitch` ×2 |
| the deposits not held to `Capital Invested` | `buoyantFlows` ×2 |
| a class switch published as money in and out | `buoyantFlows` ×10 |

**TWO OF THE BOOK CASES LEAVE `tranches.test.ts` CLEAN, AND THAT IS CORRECT
RATHER THAN A GAP.** Both break the carry in a way the tranche gate then
refuses, so Buoyant publishes no breakdown at all and the suite has nothing of
Buoyant's to check; `carriedCost.test.ts` is what fails, by its load-bearing
gate, and a suite that caught them would have to be asserting the same thing
twice.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + **42** + **44** + 30 + 22 +
140 (2 not checked, 0 blocked) · `test:family` (two new suites, `carriedCost`
and `txnAxis`) · `check:family` **86/0** · `check:pages` **206 combinations
clean**, with the same eight evidenced abstentions across the same four
pre-existing claims — measured on the tree merged with #69, #71, #70 AND #73,
which is the only base that count is a fact about. It read 194 with #69 alone,
198 with #71 and 204 with #70; #71 adds two routes, #70 three and #73 one, so
every step reconciles, and only because each was measured rather than carried
across. The bug pass above
was run on the #69 + #71 tree; on the final one the seven routes it walks were
re-run clean. `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` byte-identically on every merged tree, and `npm run
replay:flows -- --check` is a no-op.

**AND THE LETTER COLLIDED FOUR TIMES WHILE THIS BRANCH WAS OPEN.** It was
written as `10br`; #69 merged under that letter, so it became `10bs`; #71 then
merged under THAT one, so it became `10bt`; #70 merged under that, so it became
`10bu`; and #73 merged under that one after this PR was already open, so it is
`10bv`. Main keeps all four, as it always has. Each was caught the same way —
comparing main's stage letters against the branch's own at the moment of
merging, which is the check this file says to run every time — and the last
three are the case that check exists for: each time, the branch had just been
merged with main and verified, and main moved again before it was pushed.

**THE FOURTH ARRIVED WITH NO CONFLICT MARKER AT ALL.** #73's section and this
one sat in different parts of the file, so git merged the pair cleanly and left
two `### Stage 10bu` headings — the silent case Stage 10bl names, caught only
because the letters were compared by hand after a merge that reported nothing.

### Stage 10bw — WHICH RETURN A FUND SHOWS, WHICH FUNDS ARE PRIVATE, AND A SEARCH BOX THAT GOES WHERE YOU MEAN

*"Just like you have this return methodology in portfolio monitor we need to
have it in private market table as well. The customer is confused about what
kind of return this is that we're showing in the private market table."* ·
*"Also please note private market fund needs to be here in private market
only"* — sent with the family's own classification of all fifteen capital
accounts: *"Your dashboard should NOT classify these 15 capital accounts as
'private-market funds.'"* · *"this whole thing needs to be a very smart search
bar which takes me to exactly where i want to go when i type the data in this …
any equity, any fund, any position that I have taken, any tab, etc. … think as
the customer: what all they can type."*

Three asks. The second changed what the first is measured over, so it goes
first.

#### 1. The family placed their funds, and their word outranks the category

The side of the book an AIF sits on was read off the SEBI category its statement
prints (Stage 10bp). **The family have now said, fund by fund, what each one
INVESTS IN** — and one of their answers contradicts the category: Motilal Oswal's
Founders Fund prints Category II, the category this book treats as private
capital, and invests in listed Indian equities. Their reasoning is the book's own,
word for word — *"a capital-call/drawdown structure tells you how the investor
funds the vehicle; it does not tell you whether the fund invests in private or
public assets"* — which is exactly why a public-market fund does not belong on a
private-market page.

*(Corrected at Stage 10cv: Founders' statement prints no SEBI category;
"Category II" was its reader's. The family's placing is what puts it on the
listed side, as before.)*

**`FAMILY_MARKET_SIDE` in `shared/aifCategory.mjs` is that answer, committed.**
Ten entries: India SME, Baring, Transition Venture, Neo Infra and Sky Capital
private; Carnelian Bharat Amritkaal, Delphi and Founders listed; Sanshi and
Buoyant listed on the family's earlier instruction (Stage 10bp), recorded so a
future statement that stops printing CAT-III cannot quietly move them. It has the
ring-fence's standing — a decision about the family's affairs, applied where the
side is GENERATED, reversible by deleting a line — and each entry says what the
fund invests in and when they said it. **Matched on the fund's own whole name,
never a similarity**: `Delphi Equity Fund` cannot reach another Motilal Oswal
scheme, and `marketSide.test.ts` asserts no two entries match one fund.

The order is now: **the family's placing → a fund whose own paperwork names
private equity or venture → the SEBI category → neither**, and
`fundMarketSideBasis` returns the reason with the side, because "Category III"
and "the family classify it as investing in listed equity" are different
evidence. Measured, `BOOK_SUMMARY.totalValue` does not move by a rupee and the
split does:

| | before | now |
| --- | ---: | ---: |
| listed | ₹655.82 Cr | **₹699.76 Cr** — Founders ×2 (₹32.82 Cr) and Delphi (₹11.13 Cr) join |
| private | ₹37.88 Cr | **₹10.62 Cr** — Founders leaves, Neo Infra (₹5.55 Cr) joins |
| not placed | ₹16.69 Cr | **₹98,742** — Blue Ashva alone |

**Blue Ashva is still on neither side, and that is still the honest answer**: no
statement prints its category and the family's list does not name it.
`MARKET_SIDE_UNPLACED` now says BOTH sources are silent, because "no statement
prints a category" sends a reader to chase a registration when the quicker answer
is one line from the family.

#### …and the capital accounts follow the fund, not the drawdown structure

The Private Market page read the capital-account register WHOLE, on the same
reasoning the family used — and it is why the whole register does not belong
there. `capitalScope` places each account through the SAME `fundMarketSideOf`
that places its holding, so a fund's holding and its capital account cannot land
on different sides of the page (`marketSide.test.ts` asserts it on every account
whose fund also reports a holding):

| | accounts | committed | called | paid in | still to call |
| --- | ---: | ---: | ---: | ---: | ---: |
| the whole register | 15 | ₹97.73 Cr | ₹71.75 Cr on 14 | ₹81.75 Cr on 15 | ₹15.97 Cr on 13 |
| **on Private Market** | **11** | **₹42.73 Cr** | ₹26.75 Cr on 11 | ₹26.75 Cr on 11 | **₹15.97 Cr on 11** |
| left out — public-market funds | 4 | ₹55.00 Cr | | ₹55.00 Cr | ₹0 on 2 |

**The whole of the uncalled balance is private**, so the figure the client once
questioned does not move; what moved is that it now covers 11 of 11 accounts
rather than 13 of 15.

**AND ONE WARNING BECAME FALSE, SO IT IS NOW CONDITIONAL.** On the whole register
Called and Paid in covered different accounts — Delphi prints a contribution and
no called line — and the page had to say they must not be subtracted. Delphi is a
public-market fund; on the scoped register every account prints both, the two
cover one set, and a warning about a valid subtraction would be a false claim.
`calledPaidSameSet` is measured PER ACCOUNT, and `check:pages` asserts the
warning in BOTH directions, in both places it can print — the Called tile's hover
and the working line under the scheme table.

**THE LEFT-OUT ACCOUNTS ARE NAMED IN ONE CLAUSE, NOT A CARD.** The family had
just asked for the card about funds this page does not carry to go (Stage 10bs),
and a commitment they signed must still not vanish without a word. So the working
line under the scheme table says *"4 more capital accounts belong to
public-market funds — Carnelian Bharat Amritkaal Fund, Motilal Oswal Delphi
Equity Fund, Motilal Oswal Founders Fund, ₹55 Cr committed — and are counted
nowhere on this page: the family class those funds as investing in listed
equity, and their holdings are in the Portfolio Monitor's AIF section."* Every
clause of that sentence is CONDITIONED on being true of the accounts in it rather
than of this book's four — "public-market" only where every one is on the listed
side, "the family class" only where it was their word that placed each, "their
holdings are in the Monitor" only where each holds a valued row. The tiles'
hovers carry the count too.

**THREE MORE SURFACES FOLLOW THE SAME RULE, and each would otherwise disagree
with the page it opens:** Morning CIO's Capital deployment card and the two tiles
that read it (a tile counting ₹55 Cr the page it opens does not carry is the
disagreement `drilldown.ts` exists to prevent); `privateScope`'s accounts holding
nothing, which quietly counted 3P's folio (Category III, every class redeemed)
and Motilal Oswal's Hedged Equity strategy (redeemed, no category) as private
accounts; and the never-valued card, filtered to private funds for the same
reason.

#### 2. The Private Market fund table shows the return it names

The table printed one "Return" column — value against cost, un-annualised — with
nothing on screen saying so, which is what confused the customer. It carries the
Monitor's picker now, in `?ret=` like every other view, with one column per
ticked measure headed with its own name. **The picker and the column mechanics
are SHARED** (`ReturnMeasureSelect`, `returnColumns.ts`, extracted from the
Monitor), so the two tables cannot offer different measures or label them
differently.

**HOW A FUND RESOLVES A MEASURE IS NOT SHARED, because the Monitor's reasons are
false of a fund.** "The statements cover the current period only, so no
per-holding XIRR can be struck" is true of a share in a demat and FALSE of a
drawdown fund, whose capital account prints every dated call since its first.
`fundMeasuredReturn` in `src/lib/fundReturns.ts` resolves on the fund's OWN dated
record — built over the row's own deduped folios, because the row's value counts
each `dedupeGroup` once and its calls must come from the same folios (Transition
Venture's two trusts would otherwise double the calls against one value).

**THE FAMILY'S RULE, APPLIED TO A FUND:** a fund paid in several calls, or one
that has paid cash back, is XIRR; one call and nothing back is the equity rule —
HPR under a year, CAGR from a year. Nothing under a year is ever compounded onto
one (Stage 10g(ii)). Measured on the four private funds:

| Fund | Methodology | HPR | Why |
| --- | --- | ---: | --- |
| Neo Infra Income Opportunities | **XIRR +16.68%** | +11.00% | 6 calls since Oct 2023; ₹51.04 L paid back by the valuation |
| Baring Private Equity India Fund 6 | **XIRR −6.42%** | −6.95% | 4 calls; ₹0.56 L paid back |
| Transition Venture Capital Fund I | **HPR +128.61%** | +128.61% | one call, 165 days before the valuation — never annualised |
| 360 ONE Special Opportunities | **HPR +48.67%** | +48.67% | no capital account in the book, so no dated record |

**HPR MEANS THE SAME FIGURE HERE AS ON THE MONITOR** — value against cost — and
where a fund has paid cash back its cell SAYS the payouts are not in it and names
the column that counts them. One label meaning two figures on two pages is the
failure this book keeps paying for. YTD and CY are absent on every fund with the
reason (no statement values any of them on 1 January or at a year end), and the
360 ONE fund's CAGR and XIRR name ITS gap rather than a generic one.

**THE FOOTER HAS TWO RETURNS, NOT FIVE**: the whole private book's return on
cost under HPR and the methodology, and a POOLED money-weighted rate under XIRR —
**+21.12% across 3 of the 4 funds**, each folio closing on its own valuation date,
over 1,000 days, with the fund left out named in the cell's hover. CAGR, YTD and
CY have no book-level meaning and say why.

#### …and it needed the half of the flows nothing had read

A money-weighted return is every cash flow at the date it happened, and the calls
are only half of them. **Neo Infra had paid the family ₹35.32 L of income and
₹14.16 L of principal, plus ₹8.69 L of equalisation, every row DATED on its
statement — and nothing read them.** An XIRR struck on the calls alone reports
that cash as a loss and looks exactly like a correct one; the suite asserts the
rate WITH payouts exceeds the rate without, so it cannot pass by leaving them out.

`altFundStatements.mjs` and `transitionVenture.mjs` read them now, on the same
licence as the calls (Stage 10ay): **a payout table is published only where each
kind reproduces its own printed total** — income against Income Payout (Gross),
principal against Principal Payout, equalisation against Net Equalisation, and
the grid's own Total Payout must be the first two added before any row is
checked. A row whose own gross − TDS ≠ net is a misread and refuses the whole
table; anything short of the licence is `null`, NEVER `[]`, because an empty list
says the fund paid nothing. Measured: Neo Infra 33 rows, Baring 2, both
Transition Venture trusts a measured nil, India SME and Sky Capital `null`.
`payouts.test.mjs` breaks a synthetic statement one figure at a time.

Three details worth keeping:

- **Neo Infra's smallest rows print their three figures run together**
  (`54555490` is gross 545, TDS 55, net 490). `splitRunTogetherTriple` splits
  only where EXACTLY ONE cut satisfies gross − TDS = net, and even then the
  printed income total must license it.
- **GROSS IS THE AMOUNT.** The funds value themselves pre-tax, so the cash
  leaving them is counted on the same basis; TDS is the family's own tax, credited
  back to them.
- **A payout dated after the valuation is INSIDE that value**, so it is not
  counted again (₹7.14 L of Neo Infra's 9 July distribution against a 30 June
  mark) — decided where the return is struck, never by dropping the row.

**AND BARING'S "NO DISTRIBUTION LINE" WAS FALSE.** Its statement prints
`Less: Distribution (E)`; the reader never captured it, and the page said the
fund printed none. `distributionOf` reads it where the payout reader reconciled
it, so the Distributions tile covers 4 of the 11 accounts (₹0.50 Cr).
Equalisation is NOT a distribution — the statements print it apart — so it is in
the XIRR and not in that total.

`npm run replay:calls` replays the payouts too, so this landed without
`GLOW_PDF_PASSWORDS`; `--check` is a no-op on the committed tree.

#### 3. The search box

*"any equity, any fund, any position that I have taken, any tab … think as the
customer: what all they can type."* The top bar's slot held a button that opened
the Muns chat. It is a search over everything the book and the app carry now,
and Muns was still one keystroke away — until the family paused the chat, Ask
row and all (Stage 10bz).

**ONE INDEX, BUILT FROM THE BOOK ON EVERY RENDER** (`buildSearchIndex`), 329
entries on this book, each with the address that opens it:

| Kind | | Opens |
| --- | ---: | --- |
| holding | 207 | its own `/stock/` page — or, if redeemed, the transactions where the money went |
| account | 41 | the one holding it carries, or its owner's entity |
| mandate | 10 | `/mandate/:accountId` |
| member | 6 | `/family?entity=` |
| page | 12 | every nav entry, with the words a reader would type for it |
| view | 14 | a TAB — Transactions, the security axis, Morning CIO's panels, the NAV movers, Sector Composition's and Polycab's own tabs |
| category · basket · asset class | 19 | that section's holdings drill-down |
| sector | 10 | the Monitor's security axis narrowed to it |
| figure | 10 | the page that shows AND explains it — uncalled capital, dry powder, the XIRR |

**IT IS FOUND BY ANY IDENTIFIER A READER HAS IN FRONT OF THEM** — a name, a
first word, an ISIN, an NSE symbol, an account number off a statement — and a
typo within one edit on a word of four letters or more. Identifiers outrank
names; a query that reads as a QUESTION puts "Ask Muns" first and hands the
question over as typed, and every other query puts it last. `/` and Ctrl/⌘+K
focus the box from anywhere, the arrows move, Enter opens, Esc clears. The empty
box offers the reader's recent picks (per browser, like the nav's width) and six
starting points.

**`?show=transactions` IS NEW ON THE PORTFOLIO MONITOR** — the tab was component
state, so a search result could not open it. It is an address now, which also
makes it a link.

**THE RING-FENCE HOLDS IN THE SEARCH.** The index is built from positions the
promoter block was spliced out of at the book layer, so "polycab" finds the
Polycab PAGE the nav already carries first, then that page's own two other tabs,
and nothing else — asserted in the suite on keys and ISIN, and on the rendered
page: every row must open the Polycab page itself, and a row opening anywhere
else is the leak.

**A SECOND LINE ON EVERY RESULT, DERIVED FROM THE BOOK**: a holding's value and
its share of the book through the same `fmtFromBase` every page uses, so a result
never states a figure in a different currency or on a different basis from the
page it opens; a redeemed holding says so instead.

**Kusumgarcorpo's search, which the family pointed at, could not be read from
this session** — the repository was not reachable — so nothing here is copied
from it.

#### The checks, and what reintroducing the bugs found

`test:family` gained `fundReturns.test.ts` (the record over deduped folios, the
payouts on the right side of the valuation, XIRR above the calls-only rate, the
annualisation guard, the refusals naming the true gap) and `searchIndex.test.ts`
(every holding, ISIN, account number, member and nav label reaches its own
address first and every unique NSE symbol within the top two; the ring-fence; no
`undefined`, `NaN` or `null` in any address). `marketSide.test.ts` holds the family's placing to the book, entry by
entry, and asserts a fund's holding and its capital account agree — as a COUNT with a floor on the pairs compared, because its first draft ended on a summary `ok(…, true)` that could not fail.
`check:pages` gained `private-market-returns` (every concrete measure ticked) and
`search` (types what a reader would and reads each row's own attributes, never
its prose), and `CAPITAL_BOOK` / `SIDE_BOOK` re-express the family's placing off
`glowData.ts` rather than importing the helper.

**Fourteen bugs were put back one at a time**, restored by copy on a trap and
rebuilt on the way out. Thirteen fire their own check: the XIRR dropping the
payouts (4, including the rate against its independent bisection), the
methodology always picking HPR, the cells untagged (6), the capital register
unscoped (9), Morning CIO counting the whole register, the header counts
including guarded cells, and seven search bugs — the `/` shortcut dead, Ask Muns
always first (10), identifiers ignored, pages missing from the index, the list
clipped under the page, Enter dead, the second line dropped.

**The fourteenth is unreachable on this book and is recorded rather than tested
for**: pooling every fund whose record has no GAP, rather than every fund whose
record is complete, changes nothing here — the only fund with an unknown payout
record is 360 ONE, which also has no capital account. The first drop bringing a
fund with calls and an unreconciled payout table makes it reachable.

**AND THE SEARCH WALK HAD TWO DEFECTS OF ITS OWN**, found by the same pass: a
dead Enter left the page where it was and the walk then went BACK from there,
off the route — so every generic check on it was struck on the page before, and
a dead key read as a broken crumb. It goes back only if Enter went somewhere now.
And a missing box abstained ("the walk did not run") where it must fail: these
checks run only on the route that walks, so a null walk means the box was not
there.

#### Merged with main, and the letter collided for the fourteenth time

**#71 landed while this branch was open and took `10bs`**, which this section
held; main keeps it and this section moved to `10bt` — and, three merges later, to
`10bw` (see the subsections below). Three code references moved with it
(`fundReturns.ts`, `privateMarket.ts`, `replay-capital-calls.mjs`); main's own
`10bs` references are all in this file and were left alone.

**AND IT CHANGED THE SAME PAGE IN THE SAME PLACES.** Nine conflicts in
`PrivateMarket.tsx`, three in `privateMarket.ts`, five in `check-pages.mjs`:

- **the tiles** — main made each a label, a figure and one short line, with the
  coverage in the hover; this branch had rewritten the same captions for the
  scoped register. Main's form won and this branch's figures went into it.
- **"Funds this page does not carry"** — this branch had given the card each
  fund's REASON and a list of the public-market capital accounts; main REMOVED
  it at the family's request. The removal won, `pageScopeNote` went back to its
  two fields, and the ₹55 Cr of public-market commitments became the one clause
  above, with its own handle (`data-pm-cap-elsewhere`) and its own check — the
  card's `data-pm-elsewhere` handles are still asserted absent.
- **the capital-call timeline** — main replaced it with the editable Capital call
  column; this branch's `callWindows` read went with it. The column and the
  return columns sit in one `FUND_COLS`, `return` expanding to one column per
  measure and `call` last.
- **the checks** — main reads each tile off `tileStrip.texts` / `details`; this
  branch anchored the counts on the BOOK. Both were kept: every capital-account
  check reads the tile where main put it and compares it with `CAPITAL_BOOK`.

`build` · `tsc` · `test:ingest` (a new `payouts.test.mjs`, 29 cases) ·
`test:family` (every suite) · `check:family` **86/0** · `check:pages` **196
combinations clean, 0 invariant failures** — main's own 192 plus the two routes
this change adds, across both themes — with the same eight evidenced abstentions
across the same four pre-existing claims Stage 10bs records and none of this
change's own. MEASURED ON THE MERGED TREE; this branch's pre-merge count was
struck against a base that has since moved. `npm run build-book` regenerates
`glowData.ts` and `docs/BOOK-REPORT.md` **byte-identically** on the merged tree,
and `npm run replay:calls -- --check` is a no-op.

#### …and again, while it waited: #70 took `10bt`

**#70 — Polycab as one table card, Sector Composition in two halves with
Compare as a tab — landed while this branch waited for the family's go-ahead,
and took `10bt`.** Main keeps it and this section moved to `10bu` — and, when
#73 and then #75 took the next two letters, to **`10bw`** (see the subsections
below). The two sections sat
at the same place in the file, so git marked the conflict this time, which is
the safer of its two failure modes. The stage letters were compared against
main's tip before anything was committed: the merged file differed from main by
this section's letter alone, and main's ten historical duplicates were
unchanged.

**TWENTY LINES NAMED `10bt` AFTER THE MERGE, AND EACH WAS PLACED BEFORE ANY
MOVED** — by the section it sits in, or, outside both sections, by which side's
own copy of this file carries it. None was on both. **Eleven are this branch's**
and moved: the heading, the merge note above, four pointers in **Layout** and
the data model, one each under Stages 10m and 10s, two under Stage 10bp, and
the `replay:calls` note under **Build**. **Nine are main's** and were left
alone: its own heading, two lines of its own merge note, and six pointers of
its own in the Polycab and Sector Composition passages. The three code
references this branch carries (`fundReturns.ts`, `privateMarket.ts`,
`replay-capital-calls.mjs`) moved with it; main carries none.

**THE `ctx` LITERAL CONFLICTED ON ONE LINE, AND WAS RESOLVED AS A UNION** —
this branch's `pmReturn` beside main's `sectorLayout` and `shortWindow`. The
result was then checked rather than trusted: **83 keys, none duplicated, every
one naming something declared in the file.** Nothing else overlapped: #70
touches `Polycab.tsx`, `SectorComposition.tsx` and `polycabLive.ts`, which this
branch does not, and neither side touched a generated book file.

**AND THE MERGE MADE ONE OF THIS BRANCH'S CLAIMS FALSE, WHICH NO CONFLICT
MARKER COULD SHOW.** The search box promises "any tab" in the family's own
words, and #70 added tabs: Compare sectors, and Polycab's Corporate actions and
Promoter group. Sector Composition's Direct Equity tab had been there since
Stage 10aq and the index had missed it too. All four are views in the index now
(329 entries, 14 views), so "compare sectors" opens the Compare tab and
"polycab dividend" opens Polycab's Corporate actions table.

**THAT MOVED THE RING-FENCE CHECK, AND THE CLAIM WAS RESTATED RATHER THAN
LOOSENED.** "polycab" used to find exactly one result, the Polycab page. It now
finds the page first and then that page's own two other tabs. Both the suite
and the page check hold every row to opening the Polycab page itself, with the
page first and at least one row. A holding, an account or a figure opening
anywhere else would still fail, and an empty result cannot pass as a fence that
held. The suite also asserts "direct equity" still opens the Direct Equity
holdings rather than the new sector tab, because a view that outranked the
category there would send the most common query to the wrong page.

**FIVE BUGS WERE PUT BACK FOR THE FOUR TABS, AND EACH FIRED ITS OWN CHECK.**
Four are in the suite: the Compare tab taken out of the index (the Compare
check); a Polycab tab pointed at the ring-fenced holding's own address (three
checks — the Polycab dividend query, the no-entry check on the holding's key,
and the ring-fence); a Polycab tab pointed at another page (the ring-fence);
and the sector tab renamed and boosted until it outranked the category (the
Direct Equity check). **Two of those patches did not create their bug the first
time** — one renamed only the entry's id, so the tab still worked, and one
renamed only the label, so the category still won by two points — and each was
rewritten until it did, because a patch that changes nothing gives a clean run
that proves nothing. The fifth is in the browser: the search navigating with
the query string dropped, which lands on the right PAGE and the wrong TAB. It
fired the new *"Enter lands on that page with that tab selected"* check and
nothing else. The older Enter check opens a holding, whose address has no query
to lose, so without the new check this bug could not be seen.

`build` · `tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund
35, capitalCalls 30, payouts 29, hdfcOwner 22, golden 140 — 2 not checked, 0
blocked) · `test:family` **34 suites, 1,778 checks, 0 failed** · `check:family`
**86/0** · `check:pages` **202 combinations clean, 0 invariant failures** —
main's own 198 plus this change's two routes across both themes — with the same
eight evidenced abstentions across the same four pre-existing claims and none of
this change's own. The search route was walked again on its own after the tab
check was added, and is clean. MEASURED ON THE MERGED TREE: this branch's
previous figure, 196, was struck against a base #70 has since moved, and 198 + 4
reconciles only because the sweep was run again. `npm run build-book`
regenerates `glowData.ts` and `docs/BOOK-REPORT.md` **byte-identically**, and
`npm run replay:calls -- --check` is a no-op (28 replayed, 0 would change, 0
refused).

#### …and a third time: #73 took `10bu`, and the collision was the silent kind

**#73 — a search that finds nothing says why — landed while this branch waited,
and took `10bu`.** This time the two sections sat in DIFFERENT parts of the
file, so git merged them cleanly: two sections under one letter, no conflict
marker, no warning. That is the case Stage 10bl records as the dangerous one,
and it was caught the same way, by comparing main's stage letters against the
branch's own before committing. Main's keeps `10bu`; this section moved to
`10bv` — and, when #75 took that too, to **`10bw`** (see the next subsection).

**FIFTEEN LINES NAMED `10bu` AFTER THE MERGE, AND EACH WAS PLACED BEFORE ANY
MOVED.** **Thirteen are this branch's.** Its heading and two lines of its own
merge notes moved. A third was reworded to name no letter, because it records a
measurement taken while the letter was `10bu`. Nine pointers moved too: four in
**Layout** and the data model, one each under Stages 10m and 10s, two under
Stage 10bp, and the `replay:calls` note under **Build**. **Two are main's**,
both inside its own section, and stayed. The three code references this branch
carries moved with it; main's code carries none.

**THE `ctx` LITERAL CONFLICTED ON ONE LINE, AND WAS RESOLVED AS A UNION** —
this branch's `pmReturn` beside main's `absentName`. **84 keys, none
duplicated, every one declared in the file.**

**AND #73'S RULE REACHED A SEARCH IT HAD NOT SEEN.** It reads *"an empty search
result is an absent measurement, and it owes the same sentence"*, and it wired
three searches. The top-bar search in this branch is a fourth. It answered
"BSE", "BSE Ltd." and "Bombay Stock Exchange" with *"Nothing in this book or on
these pages matches"* — the defect #73 fixed, in the box a reader is most likely
to type it into. It renders `AbsentFromBook` in its empty state now, **and only
there.** This search is fuzzy where the other three filter by substring, so it
answers some review names with a holding. "HDFC Balanced Advantage Fund" finds
both plans the book holds, and a note beside them would deny a fund the book
carries. Measured over the 36 claimable gaps: **six of their own names find a
holding here and thirty reach the empty state.** Two of the six find a company
by near miss (`IFB Inds.`, `Neuland Labs.`), so they were checked rather than
assumed. The book's IFB and Neuland are SVAN's. The review's lines are held at
Motilal Oswal, on a demat whose statement in this drop is a transaction tape
only. So #73's note is right about them, and this search answers with the
company the book does hold.

**THE PAGE CHECK THEN FOUND AN OLDER BUG IN THE SAME LIST, AND IT WAS THIS
BRANCH'S.** The screenshot of the note showed Morning CIO's *Current value of
holdings* and *Capital invested* drawn THROUGH the list. The top bar is `z-10`
and a stacking context (`backdrop-blur`), so the list's own `z-50` counts only
inside it. The KPI tiles lift their label and figure to `z-10` later in the
page, and at an equal z-index the later element wins. **This had been true of
every list the search drew over Morning CIO since it shipped**, and *"the list
paints over the page"* passed the whole time, for two reasons:

- it probed ONE point 90px down, which on a short list lands above the tiles;
- `elementFromPoint` skips anything `pointer-events: none`, and that is exactly
  how those tiles draw their text.

The probe now samples the whole list on a grid, with hit-testing forced on so
paint order is what is measured. It runs on a short list, a tall one and the
one carrying the note. Before the top bar moved to `z-40` it failed on all
three, with 16 sample points covered on each and a KPI tile label named at every
one it recorded; after, it passes.
`<main>` scrolls in its own box below the bar, so nothing else overlaps it, and
the Muns dialog is portalled to `#root` at `z-50` and still covers it.

**FOUR BUGS WERE PUT BACK, AND EACH FIRED ITS OWN CHECK:**

| Bug put back | Fires |
| --- | --- |
| the note removed | three page checks, and `reviewGaps.test.ts`'s wiring check |
| the note drawn outside the empty state | the held-fund check alone — the one that stops the note denying a held fund |
| a note drawn whatever was typed | four |
| the top bar back at `z-10` | the paint check |

This merge's own full sweep was stopped part-way: #75 landed while it ran, and
a sweep of a tree about to change would have verified the wrong thing. The four
bugs above were measured on this merge's tree; everything else was measured once,
after the next merge — see below.

#### …and a fourth time: #75 took `10bv`

**#75 — Buoyant: show what the family paid, not the fund's switch-day
restatement — landed while this branch's checks were running, and took
`10bv`.** Both sections were inserted after #73's, so git marked the conflict
this time. Main's keeps `10bv`; this section is **`10bw`**, after it. The stage
headings were compared against main's tip: the merged file differs from main by
`10bw` alone, and main's ten historical duplicates are unchanged.

**EIGHTEEN LINES NAMED `10bv` AFTER THE MERGE, AND EACH WAS PLACED BEFORE ANY
MOVED.** **Twelve are this branch's** and moved: its heading, two lines of its
merge notes and its nine outside pointers, with its four code references. **Six
are main's** — four outside its section and two inside it — and stayed, with the
one in #75's own bug harness.

**THE `ctx` LITERAL CONFLICTED ON ONE LINE, AND WAS RESOLVED AS A UNION** —
this branch's `pmReturn` beside #75's `costCarried`. **85 keys, none
duplicated, every one declared in the file.**

**TEN FILES OVERLAPPED AND EIGHT MERGED WITHOUT A MARKER**, which is when this
file says to check by hand:

- **The fund-statement reader** (`altFundStatements.mjs`) now carries this
  branch's payout tables and #75's Buoyant capital flows. Both replays were run
  on the merged archive — `replay:calls` over 28 commitment documents and
  `replay:flows` over 33 fund statements — and **neither would change a byte**.
  That is the merged reader reproducing both sides' output, not merely parsing.
- **`glowData.ts` and `docs/BOOK-REPORT.md` were regenerated** from the merged
  archive rather than trusted. The regeneration matched git's text merge byte
  for byte, and a second run was identical.
- **`build-book.mjs`, `types.ts`, the Portfolio Monitor and both test runners
  kept both sides.** The ingest runner lists #75's `buoyant` and `classSwitch`
  beside this branch's `capitalCalls` and `payouts`; the family runner lists
  #75's `carriedCost` beside `fundReturns`, `searchIndex` and `reviewGaps`.

`build` · `tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund 35,
buoyant 42, classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22, golden
140 — 2 not checked, 0 blocked) · `test:family` **37 suites, 1,891 checks, 0
failed** · `npm run build-book` byte-identical and idempotent ·
`replay:calls`, `replay:flows`, `replay:owners` and `replay:movements` each a
no-op with `--check` · `reconcile:review -- --check` a no-op · CI (`build`) and
Cloudflare Pages green on the pushed merge · `check:family` **86/0** ·
`check:pages` **210 combinations clean, 0 invariant failures** — #75's own 206
plus this change's two routes across both themes, which reconciles only because
it was measured again — with the same eight evidenced abstentions across the
same four pre-existing claims, read out of `report.json` by name: four on the
Morning CIO panels (every KPI tile carries a figure), two on Private Market
(every private holding reports a cost), one on the not-found drill-down's crumb
and one on `stock-qty` (no pledge). None is this change's own. MEASURED ON THE
MERGED TREE.

### Stage 10bx — PRIVATE MARKET IS ONE TABLE, AND THE STANDARD EVERY OTHER TABLE ADOPTS

*"This whole table has such an ugly ui … well-structured columns and rows so
that it is easily expandable … a standard across the whole dashboard. And
instead of seeing these kind of sub-rows which have data indented towards the
right and left, this does not make sense."* · *"Why are these two tables
separate … make one consolidated structured table … One table that can show me
everything that is required to be seen."* · *"why is this table there, cant it
be a transactions tab in the same table view"* · *"If this is missing data this
needs to be like a hidden drop down clearly marked."*

Four asks about one page, and the first names the defect exactly. The page drew
a fund table, a capital-account table, a calls table and a missing-data card,
and a fund row opened into a SECOND TABLE DRAWN INSIDE ITS CELL. A nested table
sizes its own columns, so a folio's Value sat at one x in one panel and another
x in the next, and neither lined up with the Value above it — which is "data
indented towards the right and left".

#### `src/components/TreeTable.tsx` — the standard

A row opens into ROWS OF THE SAME TABLE, in the SAME columns, and never into a
table inside a cell. Four kinds of row, each looking like what it is:

| | |
| --- | --- |
| **section** | a band: heading, a marker chip, one quiet line, and the section's own totals in their columns. It can close |
| **parent** | one line per thing, with a chevron; the WHOLE ROW is the control (links and buttons inside it keep their own click) |
| **child** | the lines behind a parent, under a tree guide drawn in the FIRST cell only — every other cell is in its own column |
| **adjust** | an italic line that makes the children add to the parent — "Counted once" — so a reader sees it is arithmetic, not a holding |

A table adopts it by writing its first cell with `TreeNameCell` /
`TreeSectionCell` and its rows with `TREE_ROW`; the columns, the sort and the
drag stay `useTableView`'s, so a dragged column moves a parent, its children and
the totals together. `ExpandAllButton` is the one control for every row a table
can open.

#### `src/lib/privateBook.ts` — the one model behind the table

A FOLIO is one account's view of one fund, and every row is built from folios:
a fund row is its folios, a member row is theirs, a section band is its rows.
Three things in it are load-bearing:

- **THE BASES STAY APART.** A fund row is CONSOLIDATED — each `dedupeGroup`
  counted once — and a folio row is the statement AS PRINTED, so where two
  accounts report one holding the folios add to more than their fund, and an
  adjust row names the difference. Measured, that is this book's whole
  ₹3.17 Cr double count (360 ONE Special Opportunities under two CRNs,
  Transition Venture Fund I under both trusts). The By-owner grouping is printed
  throughout and names the same ₹3.17 Cr once, on its section.
- **CAPITAL IS NEVER DEDUPED.** A capital account is a contract between one
  account and one fund, so both trusts' Transition Venture calls are real money
  and both are counted, each attached to exactly ONE folio of its own account.
- **ABSENT IS NOT ZERO, IN A TOTAL.** `figuresOf` sums only the rows that report
  a figure and carries WHICH rows those were, so a total prints its coverage
  ("14 of 15 accounts") on its own line under the figure, and a set with nothing
  reported is absent rather than ₹0. A redeemed folio is the opposite case and
  prints a MEASURED `₹0 redeemed`.

#### The page

One card, one table, three tabs — **By fund** (the default), **By owner**, and
**Transactions**, which is the dated capital calls as rows of the same card,
newest first, rather than a table of their own. Beside the name: Committed,
Called, Paid in, Still to call, Units, Cost, Value, one **Return** column per
measure the reader picks (Stage 10bw's picker), Weight, As of — and the family's
own **Capital call**, last, because it is the one column a reader writes to
rather than reads.

Two sections, and the second is the family's "hidden drop down, clearly
marked":

| Section | Opens | |
| --- | --- | --- |
| Private funds | open | the private side of the book, by the family's own placing (Stage 10bw) |
| Not valued | **closed**, marked **missing data** | the private-market accounts no statement values — each with what was paid in, in no value total |

**THE CAPITAL COLUMNS SPAN THE PRIVATE-MARKET CAPITAL ACCOUNTS AND NOTHING
ELSE**, because a capital account follows what its FUND invests in (Stage
10bw's `capitalScope`): 11 of the register's 15. The table's one total row,
**Private market total**, is what the capital tiles add to, and says how many
accounts that is. The other four are NAMED in one clause under the table and
counted nowhere on the page. *(The first build of this table had a third
section, "Other AIFs · not private market", carrying those accounts'
commitments — see the merge with Stage 10bw below for why it went.)*

#### Merged with Stage 10bs, which removed two things this table had drawn

Stage 10bs (#71) landed on main while this branch waited, answering four more
asks — crisp tiles, the "funds this page does not carry" card removed, the
capital-call timeline replaced by an editable column, and the Monitor's section
dropdown turned into tabs. **This table had drawn BOTH of the things it
removed**, so the merge was a design decision on each, not a text resolution:

- **THE TILES ARE 10bs's, WHOLE.** A label, a figure and one short line, with
  the detail in the hover. Two hovers were re-worded for as long as this page
  carried the Other AIFs section ("funds that are not private market" rather
  than "funds this page does not carry"); with the section gone at the Stage
  10bw merge, the words went back with it.
- **THE OTHER AIFs SECTION KEPT THE COMMITMENT AND LOST THE HOLDING.** As
  first built it listed every not-private AIF WITH ITS VALUE — which is the
  removed card, drawn as rows. `bookFolios` then kept a not-private folio only
  where a real capital account held it, and NULLED its holding in the MODEL, so
  what stayed was the commitment. *(That section is gone since the Stage 10bw
  merge below: the family's own placing leaves a public-market fund no row here
  at all, and its commitment is named in one clause instead.)*
- **THE TRANSACTIONS TAB LOSES ITS WINDOWS.** It had carried "what can still be
  called" — Due now, three dated windows and the undated money — above the
  history. Three of the five could only ever read "nothing scheduled", which is
  exactly what 10bs removed; the two real figures are tiles. The check that
  asserted the windows INVERTED rather than being deleted with them.
- **THE CAPITAL CALL COLUMN IS ON EVERY FUND-LEVEL ROW OF THE MASTER TABLE.** By
  fund that is the fund row; By owner it is each member's line in a fund,
  because a call is made by a fund on the folio that owes it. A member row, a
  band, a total and a "Counted once" line carry none — the same tree rule every
  other column follows. The editor opens as a row under the row that opened it,
  in the table.

**AND THAT CLOSES THE ONE LIMIT 10bs STATED.** The column shipped on a table of
VALUED funds, so India SME (≈₹11.5 Cr of the ₹16 Cr still to call) and Sky
Capital's angel folios had no row to type a call against. The master table
already carries them, in the closed Not valued section whose value cells are
absent rather than summed — so they get a cell, keyed on their own name
(`account:<slug>` → `fund-<slug>`, the shape the store accepts). **The limit that
REPLACES it is stated at `callKeyOf`**: if such a fund one day publishes a NAV,
its row keys on its `securityKey` instead and calls entered under the name need
re-entering.

**TWELVE COLUMNS DID NOT FIT, AND THAT WAS MEASURED.** The call column cost
~137px and the eleven-column table had ~69px to spare. The cells went to `px-2`,
the name column to 15rem, `Still to call` and `Capital call` break their labels
over two lines, and an entered call draws its amount over its date rather than
`₹2.5 Cr · 23 Oct 2026 · +1` on one line — which was the widest thing in the
table. It now fits at 1500px with ~55px to spare and runs 14px over at 1440, so
the check that asserts it is struck from 1500 and says so; below that the table
scrolls inside its own card, the page-body rule this file already sets. The same
check now also runs on `private-market-calls`, where entered calls give the
column real content — the one route where it could push a column off.

#### Merged with Stage 10bw (#72) — the family's own placing, and the return picker

Stage 10bw (#72) landed on main while this waited, and changed two things this
table draws:

- **THE FAMILY PLACED THEIR FUNDS, SO THE OTHER AIFs SECTION WENT.** *"Also
  please note private market fund needs to be here in private market only"*,
  sent with their own classification of all fifteen capital accounts.
  `bookFolios` keeps the private folios alone, the unvalued ones filtered to
  private-market funds, and `capitalScope` supplies the capital accounts: 11 on
  the page and 4 NAMED in 10bw's one clause under the table — Carnelian Bharat
  Amritkaal, Motilal Oswal Delphi Equity and both Founders folios, ₹55 Cr
  committed. The check that asserted the section INVERTED rather than being
  deleted: *"there is no third section — no public-market fund is a row of this
  table"*, struck on the sections and rows the table draws. And 10bw's three
  capital-account checks moved off the removed scheme table's `data-scheme` rows
  onto the master table: each folio row carries `data-pm-capital-account`, the
  total row `data-pm-capital-accounts`, and the named four plus the counted
  eleven must rebuild the register with no account in both.
- **THE RETURN PICKER CAME ONTO THE MASTER TABLE.** 10bw's one column per
  measure, with every fund row resolved by `fundMeasuredReturn` on its own dated
  record exactly as 10bw built it. A FOLIO row uses the same function on its one
  statement — its own holding against its own account's calls and payouts — so a
  line under a fund says the same KIND of thing the fund does; `fundReturns.ts`
  takes `Pick<FundRow, "returnPct" | "cost">` now so a folio can be passed. A
  section band, a member row and the total take 10bw's FOOTER rule: the return
  on cost under the methodology and HPR, a POOLED money-weighted rate under XIRR
  (over the funds for a consolidated set, over the statements for a member's),
  and CAGR, YTD and CY refused with a reason naming whose row it is. A pooled
  rate over part of its set prints "· 3 of 4" on its face and names what it
  left out in its hover, and the total's cells carry 10bw's `data-return-foot`
  handles, so every one of 10bw's footer checks runs unchanged against the one
  total row. The header counts are struck on the fund rows whichever grouping is
  drawn, because a measure resolves per FUND.
- **TWO TILE HOVERS WERE CORRECTED, BECAUSE THIS TABLE MADE THEM FALSE.** 10bw's
  Still to call and Never valued tiles said their figure was "in no total on
  this page". The master table's total row DOES sum Still to call and Paid in,
  so both say "never added to a value on this page" instead — which is the
  misreading that actually costs money.
- **THE MISSING-DATA COUNT MOVED WITH THE PLACING.** Motilal Oswal's Hedged
  Equity strategy — redeemed, holding nothing — is not a private-market fund, so
  the missing-data section holds 9 accounts rather than 10. `UNVALUED_BOOK` in
  `check-pages.mjs` is scoped the same way, re-expressed through the sweep's own
  `fundSideOf` rather than imported. With Hedged Equity off the page no account
  in that section is redeemed to nil, so the measured-₹0 claim ABSTAINS with
  that evidence rather than asserting over nothing — and the harness case that
  reintroduced it went with its subject.
- **PM-4 IS STRUCK ON THE ONE TOTAL ROW, AND ITS COVERAGE IS FULL.** The
  Founders Fund's two folios, which print no undrawn figure, are public-market
  now, so every capital account on the page prints the line and the total says
  so by carrying no caveat under its figure. Never `have < of`: a coverage
  struck against the page's own denominator passes the bug; this one is struck
  against the book's.

#### Verification

`privateBook.test.ts` anchors the model on the generated book: the private total
against `BOOK_SUMMARY.privateValue` less what `currentHoldings` drops, the
capital columns against `callTotals` field by field, every capital account on
one folio of its own account, the fund overlaps summing to the book's double
count, the owner grouping printed with one overlap line — and the public-market
capital accounts on no row: every one named, none on a folio, and the counted and
the named together the register. The page checks were rewritten onto the one
table and struck structurally — one cell per column, no table inside a cell, the
bands adding to the totals, the missing-data section holding exactly the
accounts nothing values, one Capital call cell on every fund-level row and on no
other, on both groupings and with every section open.

**`scripts/dev/pm-table-bug.sh` reintroduces twenty-three bugs one at a time**,
re-run on the tree merged with Stage 10bw after a no-patch control came back
clean, and every one fires its own check — the folios drawn as a table inside a cell again fires four; the missing-data
section opening by default, two; a set with nothing in it summing to ₹0, five;
fund rows that stop counting a holding once, eleven; member rows that dedupe,
three; a capital account attached to two folios, twenty-three; Expand all
opening nothing, six; the calls read oldest first, one; a public-market AIF back
as a private row, nineteen; the public-market capital accounts counted as well
as named, twenty-five; the uncalled tile's crossed fraction, four; a total's
caveat where coverage is full, four; due now claiming every account prints the
line, two; the fund column grown until a column is cut off, three; a call cell
on a member row, one; an unvalued fund with no row to type a call against, two;
an entered call added into Still to call, one; the unavailable store drawn as
₹0, three; the call cell back on one line, one; the timeline windows back, one;
the pooled XIRR losing its "· N of M", one; pooling every statement rather than
each fund once, two; and a band's HPR printed under CAGR, YTD and CY, one. Five
of them — the ₹0 set, both dedupe cases, the capital account attached twice and
due now — also fire in `privateBook.test.ts`, where the model's arithmetic is
held.

**FIVE OF THE TWENTY-ONE CASES IT CARRIED BEFORE THAT MERGE WENT WITH THEIR
SUBJECTS**, rather than being kept to pass over nothing: the Other AIFs section's
two (its marker, and the model carrying their holdings again); the redeemed
account's measured ₹0, because no account in the missing-data section is
redeemed to nil any more; the uncalled tile naming the Other AIFs' accounts; and
a total that stopped saying how many accounts it covers — which cannot be seen on
a book where the coverage is full, so its inverse took its place. **Seven took
theirs**: a public-market AIF drawn as a private row again, the public-market
capital accounts counted on the page as well as named, the uncalled tile's
crossed fraction, a total printing a caveat where coverage is full, and three on
the return columns — the total's pooled XIRR losing its "· N of M", pooling every
statement rather than each fund once, and a band printing its HPR under CAGR, YTD
and CY.

**ONE THING THE TABLE SHOWS THAT THE FAMILY SHOULD CONFIRM.** Transition Venture
Fund I is one `dedupeGroup` — both trusts' statements report the same 7,500
units — so its fund row counts the holding once at a cost of ₹75 L, while both
trusts' capital accounts are real and show ₹1.5 Cr paid in. The table states
both honestly; whether these are one investment reported twice or two investments
of 7,500 units each is a question for the family — and the answer is §4c's
duplicate policy, kept in one place for exactly this reversal, rather than
anything on this page.

*(Answered on 28 Sep 2026: two investments — see Stage 10cx. The fund row now
counts both trusts' 7,500 units, at ₹1.5 Cr of cost beside the ₹1.5 Cr both
trusts paid in.)*

**THE LETTER WAS CHECKED AGAINST MAIN'S TIP AT EACH MERGE, AND MOVED FOUR
TIMES.** This section was drafted as `10bs`. #71 merged first and kept it, so it
became `10bt`; while this branch's own checks ran, #70 took `10bt` and #73 took
`10bu`, so it became `10bv`; in the minutes between this branch's last merge
and its push, #75 took `10bv` as well, so it became `10bw`; and while the PR sat
open, #72 took `10bw`, so it is **`10bx`** and the Portfolio Monitor's stage is
`10ch` — it was to be `10by`, which #81 took before that record landed. The last two
collisions were TEXTUAL (both sides had inserted above Stage 10k), which is the
failure mode that announces itself — and the third is the case the rule to
re-fetch main AT THE MOMENT OF MERGING exists for: nothing about this branch had
changed, main had. Every line naming the colliding letter was classified against
main's own copy of this file before any moved. At `10bt`: five were this
branch's — its heading, the two Layout bullets for `TreeTable.tsx` and
`privateBook.ts`, the note that closes 10bs's limit, and this paragraph — and
moved; the other eleven are main's (Polycab as one table, Sector Composition's
two halves) and were left alone. At `10bv`: the same five moved; the other six
are #75's — two in its own section, its two Layout bullets, the correction it
notes in Stage 10ai and its `replay:flows` entry under **Build** — and were
left alone. At `10bw`: three were this branch's — the two Layout bullets and the
note that closes 10bs's limit — and moved; the other nine are #72's (its three
Layout bullets — the fund split, `fundReturns.ts` and the search box — its four
notes in the sides and category passages, the search slot, and its
`replay:calls` payouts line) and were left alone.

**THE `ctx` LITERAL IN `check-pages.mjs` CAME THROUGH AS A UNION EVERY TIME.** At
#71: main's `callBuckets` and `callRows` beside this branch's probes, and twelve
invariant hunks resolved by INTENT rather than by side — main's reading of a
tile's figure off its face and its counts out of its hover, this branch's
reading of every table figure by the column its header names, and main's check
of the removed scheme table's call counts DROPPED, because that table is not on
this page; its two halves are asserted on `private-market-folios` (every capital
account on one folio row, their calls every call in the register) and on the
Transactions tab (the history, its count and its footer). At #70 and #73: main's
`absentName`, `sectorLayout` and `shortWindow` added — 82 keys, none duplicated,
the exact union less the `schemeCalls` this branch removed with the table it
read, and every key resolving to a declaration in the merged file. At #75:
main's `costCarried` added — 83 keys on the same terms. At #72: main's
`pmReturn` added and its `schemeCalls` NOT, because the probe that declared it
read the scheme table this page no longer draws — 85 keys, none duplicated, and
every one resolving to a declaration.

`build` · `tsc` · `test:ingest` · `test:family` · `check:family` **86/0** ·
`check:pages` **216 combinations clean** on the tree merged with Stage 10bw —
main's 210 plus this change's three new routes across both themes — with nine
evidenced abstentions across five claims: four are main's own, and the fifth is
new here and earns its abstention off the book, because no private-market
account is redeemed to nil once Hedged Equity left the page · `npm run
build-book` byte-identical — a table's layout is not part of the book.

### Stage 10by — FOUR BLOCKS OF TEXT GO, AND THE NAV CHART TAKES ANY OF SEVEN BENCHMARKS

*"Open PR and do not merge to main until I tell you to."* · *"Remove the
highlighted texts from the dashboard UI"* — four screenshots: the published-NAV
movers' **What this measures** panel; the NAV chart's basis line and its four
headline pills (**Book +5.09%**, **Nifty 500 +4.42%**, **₹28.3 Cr not proven**,
**over 2026-05-31 → 2026-08-13**); the paragraph under Family & Entities' sector
mix (*"Both routes count here…"*); and Sector Composition's header pills. ·
*"[In the] Portfolio vs Nifty 500 tab. Allow us to select different benchmarks
to compare the portfolio returns with and make sure that the benchmark returns
are live just like the Nifty 500 benchmark."*

#### 1. The removals — audited claim by claim, the method every removal here has used

Nothing was deleted until each claim was checked for a second home. What had
none and a reader acts on went into a HOVER on the element it describes; a
hover is weaker than a caption, and that is recorded rather than glossed.

| Removed | Claims with no second home | Where they are now |
| --- | --- | --- |
| NAV movers' "What this measures" panel | the two measurements are **never added**; **AIF folios publish no daily NAV** | the tile's own hover, with the panel's other sentences verbatim. The older-day disclosure was already on each row's second line (`SchemeNote`) |
| NAV chart's basis line | window, point count, coverage, rebase | the chart TITLE's hover |
| the Book and Nifty 500 pills | the like-for-like pair | the title's hover — **and the chart's own tooltip at the book's last point prints exactly that pair**, because both lines are rebased at the book's first point |
| the "not proven" pill | the value and the accounts behind it | the title's hover, as its own paragraph |
| Family & Entities' paragraph | the mandate-chosen share of these companies; the excluded value **per class**; why a fund has no sector; where a mandate's cash sleeve went | the sector-mix SUBTITLE's hover — the subtitle states the company-share count and value, so the excluded complement is implied on screen |
| Sector Composition's header pills | the LIVE label and the as-of skew | **nowhere on this page** — see §6. The sector count is the table's rows and the donut's wedges; the basis pill's hover repeated the column notes and the Direct Equity tab's hover |

**THE FOURTH SCREENSHOT SHOWED A SUBTITLE THAT MAIN NO LONGER RENDERS.** *"Every
company this family is exposed to…"* became the Consolidated tab's hover at
Stage 10bt; the screenshot was taken on an older build. So on this page only the
pills went, and the sentence stays where 10bt put it.

**SECTOR COMPOSITION IS THE FOURTH PAGE TO LOSE ITS `<BasisPill>`** at the
family's request, after Morning CIO, `/holdings` and Private Market, and §6
records it as a narrowing. It costs less here than on any of the three: this page
has always read the LIVE book and was never one a reader checks against a PDF,
so what went is the label and the "49 accounts behind" skew — not a guarantee.
`feedLive`, `Pill` and `BasisPill` had no other reader on the page and went with
them rather than being left computed into nothing.

#### 2. The benchmark control

`src/lib/benchmarks.ts` — seven, in the chart header where the pills were, as
TABS rather than a dropdown (what the family asked for on the Portfolio Monitor):

| | symbol | live `longName`, measured 2026-09-23 | history from |
| --- | --- | --- | --- |
| **Nifty 500** (default) | `^CRSLDX` | NIFTY 500 | 2005-09-26 |
| Nifty 50 | `^NSEI` | NIFTY 50 | 2007-09-17 |
| Nifty Next 50 | `^NSMIDCP` | NIFTY NEXT 50 | 2007-09-17 |
| Midcap 150 | `NIFTYMIDCAP150.NS` | NIFTY MIDCAP 150 | 2019-01-14 |
| Smallcap 250 | `NIFTYSMLCAP250.NS` | NIFTY SMLCAP 250 | 2005-04-01 |
| Sensex | `^BSESN` | S&P BSE SENSEX | 1997-07-01 |
| BSE 500 | `BSE-500.BO` | S&P BSE 500 INDEX | 2007-09-17 |

**"LIVE JUST LIKE THE NIFTY 500" IS THE SAME PIPE, NOT A SECOND ONE.** The Nifty
500 line has always come from `/api/prices` — Yahoo's keyless chart endpoint,
settled daily closes. Every benchmark comes through that exact call, so none is a
baked series and every one moves on the day the Nifty 500 does. Nothing is
harvested, typed or interpolated; the range note's *"<index> alone over this
period"* and the like-for-like pair both follow the selection.

**AND EACH IS CHECKED BY NAME BEFORE A CLOSE IS DRAWN.** Trap 2 in
`functions/api/indices.js`, measured on this very upstream: `NIFTY_MIDCAP_150.NS`
answers 200 with a rupee figure for an instrument that is not the index, and
`^NSMIDCP` — which reads like a midcap symbol — is the Nifty NEXT 50. So
`/api/prices` now hands back the upstream's own `longName` / `shortName` (cache
key bumped to v2, so a cached body with no name is never served to the gate), and
`benchmarkIdentity` compares it against the names each benchmark declares. A
mismatch — or NO name at all, because unverified is not a match — draws no line,
says what answered, and states no comparison figure. A correct-looking line
about the wrong market is the worst figure this card could draw.

**THEY ARE PRICE INDICES, AND EVERY OPTION'S HOVER SAYS SO.** The managers' own
reports compare against total-return versions (N50TRI, S&P BSE 500 TRI,
NSmCap250TRI), and the keyless feed carries only the price ones — the basis the
Nifty 500 line was always on, stated rather than left to be assumed.

**`?bench=`, AND THE TAB FOLLOWS IT.** In the URL like every view here, the Nifty
500 first and therefore param-free, so every existing link lands where it did.
Morning CIO's third tab reads the same param — *"NAV vs Sensex"* over a chart of
the Sensex, *"NAV vs Nifty 500"* by default — because a tab naming one index over
a panel drawing another is a label not describing its panel. (**"NAV vs
benchmark" stays banned**: the roadmap-absence check still asserts it never
returns.) Switching clears the previous curve first, so for the length of a fetch
the chart draws the book alone rather than the last index under the new name.

#### The checks

`check:pages` gains **`cio-nav-bench`** (`?bench=sensex`, live mocks) and
**`cio-nav-bench-wrong`** (`?bench=nifty-next-50`, the fixture answering `^NSMIDCP`
as "NIFTY MIDCAP 50"). The price fixture now ECHOES the symbol asked for, answers
under the live name, gives each benchmark its OWN slope (the Nifty 500 keeps
`PRICE_SLOPE`, so nothing existing moves) and records `PRICE_REQUESTS` — because
a line cannot say which symbol it was fetched as, and a card that fetched the
Nifty 500 whatever was selected and relabelled it would draw a perfect line.

- **the control** — every benchmark in order, keyed and labelled, exactly one
  active, the one the address asked for; the title and the tab name it.
- **the request** — the chart asked for this benchmark's symbol and no other.
- **the return** — the hover's benchmark figure equals the fixture ramp's return
  over the hover's own window, derived here in closed form, to the printed digit;
  on any benchmark but the default it must also DIFFER from the Nifty 500's.
- **the gate** — a mismatched benchmark: state `mismatch`, the book's two curves
  and no third, the message names what answered, no comparison in the hover.
- **the removals** — the NAV header carries no basis line and no return beside
  any name, and the not-proven pill's handle is gone; the movers panel's handle
  and heading are gone; Family & Entities' paragraph phrases are gone; Sector
  Composition's header node carries no pill.

**EVERY CHECK THAT READ A REMOVED FIGURE WAS RE-HOMED, NOT SOFTENED.** Twelve
NAV-card invariants read the header; they read `navBasis(ctx)` — the title's
hover — now, and a card on screen with no hover is a FAILURE (`navBasisMissing`),
never an abstention. CIO_LIVE_NAV reads the benchmark off the ADDRESS rather than
the literal "Nifty 500", which is what lets it run unchanged on the Sensex route.
Three Sector Composition checks read the sector count off the removed pill and
read the donut's wedges now — read off the page text they would have come back
NaN and failed a page that removed the pill exactly as asked.

`benchmarks.test.ts` (`test:family`) holds the catalogue to the MEASURED live
spellings — written into the suite, not read out of the module — asserts each
benchmark accepts its own name and refuses all 42 others, refuses the measured
decoy and an unnamed history, and stubs the Function to prove the name reaches
the body at all. Without that last one the gate is a gate on a field that never
arrives, and it refuses every benchmark on the deployed site only.

#### Fifteen bugs reintroduced, and every one fires its own check

`scripts/dev/nav-bench-bug.sh`, committed so the next session's verification is
one command. It restores BY COPY on a `trap … EXIT` (two of the files it patches
are new and untracked, where `git checkout --` silently does nothing), verifies
each restore with `cmp`, rebuilds on the way out, takes a `flock` so a second
copy refuses rather than racing one `dist/`, and reports a patch that does not
apply or a build that fails as NOT A RESULT. A no-patch CONTROL runs first and is
clean. `CASES=` re-runs one case.

| Bug put back | Fires |
| --- | --- |
| the benchmark control deleted | the control check **and** the hover check, on all four NAV routes |
| the chart fetches the Nifty 500 whatever is selected | **eight** — the request check, the return check, the gate check, and five NAV-card checks on the route whose name no longer matches |
| the identity gate accepts any instrument | the mismatch check |
| Morning CIO's tab keeps naming the Nifty 500 | the tab check |
| a Book pill back beside the title | the header check, on three routes |
| the basis line back as a subtitle | the header check, on three routes |
| the hover drops the book-vs-benchmark pair | three checks, on two routes |
| the hover drops the not-proven disclosure | the not-proven check, on three routes |
| the movers' "What this measures" panel restored | the panel-stays-removed check |
| the movers tile loses its hover | four — the older-day, basis, never-added and AIF checks |
| Family & Entities' paragraph restored | the paragraph-stays-removed check |
| the sector-mix subtitle loses its hover | the names-what-it-excluded check |
| a sector-count pill back in the header | the header check, on two routes |
| **(suite)** `/api/prices` stops returning the name | `benchmarks.test.ts`, exit 1 |
| **(suite)** an unnamed history is accepted | `benchmarks.test.ts`, exit 1 |

**THE SECOND CASE IS THE ONE WORTH THE PASS.** A card that fetched the default
index whatever was selected and relabelled it would draw a PERFECT line under
the wrong name — every geometric and textual check on the chart is satisfied by
it. Only the recorded REQUEST can see it, which is why `PRICE_REQUESTS` exists;
and on this route the identity gate then refuses the Nifty 500's own name for
the Sensex, so the fixture proves both halves at once.

**AND ONE CASE WAS NOT A RESULT THE FIRST TIME, WHICH IS THE HARNESS WORKING.**
Case 5 put the pill beside the title as a SIBLING element inside `title={…}`,
which does not parse; the build failed and the run said so rather than sweeping
an unchanged tree and reporting the header check clean. Rewritten as a fragment,
re-run alone with `CASES=5`, it fires on three routes.

**Two cases are suite-only, and that is correct rather than a gap.** The page
sweep serves `/api/prices` from a fixture that ALWAYS returns a name, so a
Function that stopped returning one — the defect that would refuse every
benchmark on the deployed site and on no local run — is invisible to it by
construction. `benchmarks.test.ts` stubs the upstream and calls the real
Function, which is where it can be caught.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 42 + 44 + 30 + 29 + 22 + 140
(2 not checked, 0 blocked) · `test:family` (a new `benchmarks.test.ts`) ·
`check:family` **86/0** · `check:pages` **214 combinations clean**, with the ten
evidenced abstentions main's own sweep carries across four pre-existing claims
(six KPI-tile lines across the Morning CIO routes, two private-market cost
lines, one pledge line on `stock-qty`, one crumb line on `holdings-unknown`) and
**not one of this change's own**. MEASURED ON THE MERGED TREE: main walks 67
routes and this branch 69, so the two new routes (`cio-nav-bench`,
`cio-nav-bench-wrong`) are four combinations over main's 210 — which reconciles
only because the sweep was run again. `npm run build-book` regenerates
`glowData.ts` and `docs/BOOK-REPORT.md` BYTE-IDENTICALLY — nothing here touches
the ingest, and a benchmark control that moved a generated figure would not be
one.

#### Merged with main, and the letter collided again: #79 took `10bx`

This section was `10bx` until the family said to merge, and **#79 — one master
table each on Private Market and the Portfolio Monitor — had landed on main
under that letter in the meantime.** The two sections were inserted at the same
place, so git marked the conflict. Main's keeps `10bx`; this section is
**`10by`**, after it. The stage headings were compared against main's tip: the
merged file differs from main by `10by` alone.

**TEN LINES NAMED `10bx` AFTER THE MERGE, AND EACH WAS PLACED BEFORE ANY
MOVED.** Four are this branch's and moved: the heading, the `benchmarks.ts`
entry in **Layout**, and the two lines under **Conventions** (§6 and the
formatting bullet) that name Sector Composition's lost `<BasisPill>`. Six are
main's and stayed: #79's own heading and merge note, three pointers in
**Layout**, and the note under Stage 10's family-input section that the fund
table closed at Stage 10bx. The bug harness's own header moved with this
section.

**AND #83 AND #80 LANDED WHILE THIS WAS BEING RECORDED**, under `10bz` and
`10ca`, so neither took a letter from this section; both sections go after this
one. #80 changed three of the pages this section changed (Morning CIO, Family &
Entities, Sector Composition) and git merged all three without a marker, so each
was checked by hand: the benchmark tab label, the sector-mix hover and the
removed header pills all survive, and the only `ctx` conflict was #80's
`hbCapital` beside this branch's `priceRequests`, resolved as a union.

**THE `ctx` LITERAL CONFLICTED ON ONE LINE, AND THE UNION DROPPED ONE KEY ON
PURPOSE.** Main's side carries #79's `treeState`; this side carries
`priceRequests` and `schemeCalls`. #79 removed the `schemeCalls` probe with the
view it read, so a key naming it would throw inside every check on every route.
Every other key resolves to a declaration in the merged file.

`build` · `tsc` · `test:ingest` (parseNum 49, layout 31, pipeline 84, altFund
35, buoyant 42, classSwitch 44, capitalCalls 30, payouts 29, hdfcOwner 22,
golden 140 — 2 not checked, 0 blocked) · `test:family` (every suite, including
#79's `privateBook.test.ts` and this change's `benchmarks.test.ts`) ·
`check:family` **86/0** · `check:pages` **220 combinations clean**, with eleven
evidenced abstentions: the ten above, and #79's own claim about a redeemed
private account, which this book does not have. None is this change's own.
MEASURED ON THE MERGED TREE; the 214 above was struck against a base #79 has
since moved. `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` byte-identically.

### Stage 10bz — ASK MUNS IS OFF THE TOP BAR, AND THE CHAT IS PAUSED RATHER THAN DELETED

*"Remove Ask muns from here, dont want this right now"* — sent with a screenshot
of the "✦ Ask Muns" button beside the search box.

**TWO DOORS LED TO THE CHAT, AND BOTH ARE GONE.** The button, and an "Ask Muns"
row the search list appended to EVERY query — first where the query read as a
question (`looksLikeQuestion`), last for everything else. The family pointed at
the button; a row offering the same chat on every search is Muns in the top bar
all the same, so it went with it. That is the one part of this change that goes
past the screenshot, and it is said in the PR rather than decided silently.

**"RIGHT NOW" IS WHY IT IS PAUSED, NOT DELETED** — the opposite of the
`exportDeck.ts` call, and the difference is the family's own word for it.
`MunsChat.tsx` is kept whole and says at its own definition that nothing renders
it and how it comes back; `munsChat.ts`, `chatContext.ts` and
`functions/api/chat.js` are untouched and still tested (`chatContext.test.ts`,
`chatFunction.test.ts`); `looksLikeQuestion` keeps its test and names its missing
caller. What went is the RENDERING — the button in `TopBar.tsx` and the row's
code in `SmartSearch.tsx` — deleted rather than hidden behind a constant flag,
because a branch pinned off is the dead-code-that-looks-alive failure this file
keeps naming.

**AND THE ROW HAD BEEN CARRYING SOMETHING ELSE.** The list opened only when it
had rows, and the Ask row gave every query one — so the empty state, and Stage
10bu's note saying why a name the family holds is on no statement (BSE), rode on
it. Removing the row alone would have closed the list on exactly those queries
and dropped both in silence. The list now opens on any query, and its empty line
no longer offers Muns the question.

**THE CHECKS INVERTED, NOT DELETED.** The `chat` route opened the panel and held
five claims about it — the answer marked as generated, the snapshot and its
limits, a scrim covering the viewport rather than the header, a panel sized for
reading, a failure that names itself. None has a subject while the chat is
paused; each is listed in Stage 10s for the day it returns. The route asserts the
REMOVAL instead: the button gone by its handle AND by its words (a button put
back under another test id still reads "Ask Muns"), no panel anywhere, the dead
search box the chat first replaced still gone — and a walk that did not run fails
rather than abstains. The `search` route asserts that no query offers Ask Muns (a
question, a name, a page and a string nothing matches — by each row's kind and by
the list's words), and that a query nothing matches still opens the list, says
so, and offers nothing in its place.

**`scripts/dev/ask-muns-bug.sh` reintroduces six bugs one at a time**, after a
no-patch control came back clean — and every one fires its own check. The
button put back fires the button claim; the same button under another test id
fires it too, by its words. The search's Ask row put back fires the no-Ask claim
and the nothing-matches claim, and the same row with no handle fires the no-Ask
claim alone, by the list's words. A list that closes whenever it has no rows
fires seven — the nothing-matches claim, every claim about Stage 10bu's BSE note
(which rides on that empty state), and the check that the list paints over the
page. An empty line that still offers Muns the question fires the
nothing-matches claim alone.

`build` · `tsc` · `test:family` · `check:family` **86/0** · `check:pages`
**216 combinations clean** — the same count as before, because this change adds
no route — with the same nine evidenced abstentions across the same five
pre-existing claims, none of them this change's. `npm run build-book`
regenerates the book byte-identically: nothing here touches the ingest.

### Stage 10ca — EVERY RETURN IS FIFO: UNREALISED PLUS REALISED, OVER EVERY RUPEE DEPLOYED

*"Everything in the returns part and all the calculations on the dashboard need
to be accounted for using the methodology of FIFO. So basically we need to
account for, match the number of units being sold and purchased, and use the
methodology of FIFO to calculate returns on the dashboard and make sure that
this is implemented every single place on the dashboard wherever we are showing
returns. According to the client, the returns that we are showing on the
dashboard are completely off. So find the root cause of it."*

#### The root cause is one formula, and it was on every page

**EVERY AGGREGATE RETURN WAS `Σ unrealised ÷ Σ cost of the units STILL HELD`.**
That is FIFO's cost of what is left — the manager's own statements carry it that
way — divided into the gain on what is left. It leaves out every unit already
SOLD: the gain on it is gone from the numerator and what it cost is gone from the
denominator. A mandate that sells its winners reads as if it had never made them.
Measured on the whole-mandate figure against the survivors-only one:

| Mandate | Was (survivors) | FIFO, on its capital |
| --- | ---: | ---: |
| V.E.C 128004 | 8.42% | **30.10%** |
| SVAN 8710067 | 6.84% | 13.56% |
| SVAN 8710090 | 5.75% | 12.73% |
| Molecule 7810404 | 10.20% | 16.09% |
| V.E.C 128005 | 1.84% | 8.28% |
| Green Lantern 510854 · 510861 | 13.49% · 12.53% | 16.04% · 14.59% |
| Goldstandard 100022 · 100023 | 6.27% · 6.78% | 6.97% · 7.48% |
| Carnelian 3517383 | 24.98% | **19.91%** |

**IT RUNS IN BOTH DIRECTIONS, WHICH IS WHAT SAYS IT IS NOT A THUMB ON THE SCALE.**
Carnelian's manager sold LOSERS (−₹69.8 L realised since inception, and ₹98.8 L of
fees), so its survivors read BETTER than the mandate did. A formula that only
ever raised returns would be a presentation choice; this one lowers the one it
should.

**AND THE MANAGERS' OWN RECORDS SAY THE SAME NUMBER.** For every mandate whose
performance history is dated at its capital's own date, `value + withdrawn −
contributed` from the book's appraisal rows equals the manager's since-inception
`realised + unrealised + income − fees` — Carnelian, both Goldstandards, both
V.E.Cs — within ₹0.15. Two reports, two paths, one figure.

Three more figures were wrong for the same reason in a different shape:

- **Neo Infra** printed the ₹5 Cr ever drawn as the cost of the 4,85,837 units
  still held, after 14,162.8 had been redeemed at ₹14.16 L. The cost of units
  the family no longer owns was in the cost of the ones it does.
- **3P** was redeemed in full for ₹31.06 Cr against ₹28.50 Cr invested and
  carried NO realised figure — a ₹2.56 Cr gain that no return anywhere counted.
- **Buoyant's class switch** was booked by the fund as a sale and a purchase at
  the switch NAV — see Stage 10bv, which landed the fix on main while this was
  being built.

#### One engine, one aggregate, and nothing else strikes a return

- **`shared/fifo.mjs`** — the lot engine. A buy is a dated lot; a sale takes the
  OLDEST lots first; a class SWITCH is not a sale and carries each lot into the
  new class with its own cost and its own purchase date. **A carried lot keeps
  its place in the queue** — appended at the back, a later sale would take the
  newest units first, which is LIFO wearing FIFO's name; the suite has a case
  whose LIFO answer differs, so that bug cannot pass. A sale of more units than
  the record bought is a SHORTFALL, reported and never absorbed into a lot at a
  cost nobody paid. `fifoReturnPct` is the one formula — `(unrealised + realised)
  ÷ (cost held + cost of units sold)`, null wherever cost is unknown.
- **`src/lib/fifo.ts` → `fifoTotals`** turns ANY set — a row, a category, a
  mandate, an owner, a sector, the book — into one return, SUMMED before it is
  divided, never an average of percentages (which weights a ₹50,000 holding like
  a ₹50 Cr one). **A mandate the set holds whole is struck on its capital**:
  `(value + withdrawn − contributed) ÷ contributed`, which is FIFO's own total —
  however units are matched, cost held plus cost sold is what was put in. A set
  holding only PART of a mandate (a sector, a filter, one share) is struck
  holding by holding, because a mandate's capital cannot be divided among its
  shares. Wholeness is measured against `currentHoldings`, so a speck the floor
  drops does not break it.
- **Every surface calls one of the two**: the Portfolio Monitor's rows, category
  totals and footer; the mandate page, which gains a **Return · FIFO** tile of
  its own rather than a delta under the P&L tile; Morning CIO's consolidated
  return and allocation rows; the holdings drill-down; Private Market; Family &
  Entities; Sector Composition; the stock page; Return Analysis; Performance;
  the Excel export; the live-quote and published-NAV overlays; and the
  contribution-history panel's footer. `embeddedReturnFormula` is deleted
  rather than left exported and uncalled.

#### What each position carries now

`build-book` emits on every position: `costBasis` (the cost of the units still
held), `realizedPnL` and **`costOfUnitsSold`** (FIFO's other half), and
`returnPct` struck through `fifoReturnPct`. The suite asserts the last is the
formula on the position's own fields for every costed position in the book.

- **A capital gain statement is taken only up to the holding's own date.** LKP's
  holding statement is dated 31 March and its capital gain statements carry ten
  sales after it; those units are still IN that statement's positions at its
  mark, so their gain is not added — counting them would book the same units
  once as value and once as profit. `realizedLotsAfter` counts them and the
  empty cell's reason says so.
- **Realised is a MEASURED zero** where a record covers the account and nothing
  was sold — and null, with its reason, where no record covers it.

#### Where FIFO restates a cost, and where it only checks one

**FIFO RESTATES A COST ONLY WHERE UNITS LEFT THE HOLDING.** Neo Infra's capital
redemption and 3P's redemption are sales; the position takes FIFO's cost, its
realised gain and its cost of units sold, `costBasisSource: "fifo"`, and keeps
the statement's figure as `printedCostBasis`. Neo: ₹4,85,83,720 held + ₹14,16,280
sold = every rupee drawn. 3P: realised ₹2,55,82,835.17 + cost sold
₹28,50,00,000 = ₹31,05,82,835.17, the redemption on the ICICI advice. (Stage
10cw: the cost is what was paid, setup expense and stamp duty included.)

**A SWITCH WITH NO SALE IS MAIN'S CLASS-SWITCH CARRY, AND FIFO CHECKS IT.** Stage
10bv landed on main while this was being built, with its own Buoyant reader and
`carryCostThroughSwitches`. Two implementations writing one cost is how two
screens come to disagree about it, so they were reconciled rather than stacked:
Buoyant's reader, archive and `npm run replay:flows` are main's; this branch's
duplicate reader and replay were dropped; and the build runs FIFO over the same
record anyway and NAMES the two as agreeing — ₹24,85,00,000 and
₹46,00,58,861.66, to the rupee — or disagreeing. That is two pieces of code over
one record, so agreement is a real check. `fifoFromCashFlows` moved into
`shared/fifo.mjs` so the suite can hold the book to it too.

**NEO INFRA'S READER STAYS**, and main's replay reproduces its archived record
byte for byte (`0 would change`), which says the two readers agree on what the
extractor writes. `neoFlows.test.mjs` breaks the real statement one figure at a
time — units off face value, the redemption dropped, a capital row the columns
do not match — and each withholds the record.

#### What this deliberately does not do

- **A holding sold down to nothing is not in an allocation total.** The family
  asked for the allocation surfaces to show current holdings only (Stage 10am,
  10as), and "a total must tie to its own columns" — adding 3P's realised into
  the AIF row's return without drawing its row would be a total over rows the
  table does not show. Its gain is on its own stock page and on the Transactions
  card's capital record, whose return is `(value + taken out − paid in) ÷ paid
  in` — FIFO's total again, invariant to how the units are matched.
- **Income is not in a holding's return; it IS in a whole mandate's.** A
  dividend is not a gain on a unit. But a mandate struck on its capital includes
  whatever the capital shows — income collected, fees charged — because no
  statement splits those per share. `fifoBasisNote` says so in the hover.
- **A CATEGORY's return still refuses where cost does not cover it**, exactly
  as it did: 60 depository positions report no cost, `costCoversSet` decides,
  and FIFO does not change what a depository did not print — Direct Equity and
  Mutual Fund stay dashes. **A FOOTER'S return is struck over the costed
  holdings**, which is the set its own Invested and Unrealised cells already
  sum and the set Morning CIO's Consolidated return tile covers.

  **THE FIRST CUT OF THIS BRANCH TOOK THE MONITOR FOOTER'S RETURN AWAY, AND ONLY
  THE PAGE SWEEP SAW IT.** `fifoTotals` carries the coverage test, the footer was
  handed the WHOLE book, and 60 uncosted depository rows made it refuse — so the
  Total row printed `—` where main printed +15.37%. Every suite passed. Two
  standing `check:pages` claims fired (*"the footer totals nothing under the two
  descriptor columns"*, whose third-from-last cell must be a percentage, and
  *"the aggregate return stands under the measure it is on"*), and they are what
  a reader would have seen: the one whole-book return on the page gone, on the
  change asked for because returns were wrong. The footer reads **+16.68%** now,
  FIFO over the costed set, and its arithmetic names the uncosted remainder.
  Measured before filtering, not assumed: no PMS mandate holds a current
  position without a cost, so the filter cannot knock a mandate out of whole.
- **The fact sheet's printed profit is NOT used as a second witness**, on
  purpose: once contributed and withdrawn match, `gain − profit` is only the
  book's value less the fact sheet's closing value, which carries declared,
  unreceived dividends §4b keeps out of market value. That checks the value, not
  the return, and would look like a second path while being the first restated.

#### Verification

`test:family` gains `fifo.test.ts` (engine, aggregator, book); `test:ingest`
gains `neoFlows.test.mjs`; main's `carriedCost.test.ts` had one claim widened —
"the printed figure appears only where the book's cost differs" now names both
restatements, `carried-through-switch` and `fifo`. `check:pages` gains an
invariant on every Monitor mandate row (its Return cell equals the capital
figure, re-derived in the sweep from `glowData.ts` rather than imported) and a
`mandate-fifo` route — the mandate where FIFO and the survivors-only figure
differ most, derived from the book — asserting the tile is the capital return
AND that the figure it replaced differs materially.

#### Invested is the capital paid in, wherever a whole mandate is summed

*"Invested shows what FIFO divides by: ₹121.7 Cr paid into the PMS mandates,
with ₹124.6 Cr (cost of shares held) in the hover. This applies on Morning CIO's
allocation table, the holdings page that row opens, and the Portfolio Monitor's
PMS rows."* — the family's own choice, asked because the full sweep found the
contradiction rather than a reader: Morning CIO's PMS row read **Invested
₹124.6 Cr · Current ₹138.7 Cr · Return +14.0%**, and a reader dividing the
first two gets 11.4%. Each figure was right. A whole mandate's FIFO return is
struck on the capital paid into it; the cell beside it printed the cost of the
shares it holds now.

**`fifoTotals` REPORTS WHAT AN INVESTED COLUMN PRINTS NOW**, and two helpers
beside it are the only place the swap and its words live: `investedWithCapital`
(a cost-held total with each WHOLE mandate swapped for `capital.contributed`)
and `investedBasisNote` (the hover naming both bases, and the withdrawals that
separate them). A holding struck holding by holding keeps its cost held,
because there Invested and Unrealised must still add to its value.

| | before | now |
| --- | ---: | ---: |
| PMS row: Invested · Current · Return | ₹124.56 Cr · ₹138.70 Cr · +14.01% | **₹121.74 Cr** · ₹138.70 Cr · +14.01% |
| …Current ÷ Invested − 1 | 11.36% | **13.93%** — within the ₹9 L withdrawn |
| Capital invested tile | ₹470.16 Cr | **₹467.34 Cr** |

Applied on every surface that sums a whole mandate into an Invested figure: the
allocation rows, their footer and the Capital invested tile (one sum, so the
tile, the footer and the rows cannot disagree); the `/holdings` rows and
footer; and the Monitor's mandate rows, category totals and footer.
**Unrealised P&L stays on the cost held** — it is `value − cost of what is held`
by definition — so on a capital-basis row the identity a reader can check is
`Invested + Unrealised + Realised = Value + Withdrawn`, which is exactly FIFO's.

**WHAT IT DELIBERATELY DOES NOT TOUCH.** The mandate page's Invested tile is the
mandate's cost basis and its FIFO return has a tile of its own beside it, each
labelled — the family scoped the choice to the three surfaces above. And a
filtered set that holds only part of a mandate prints the cost of what it
holds, because a mandate's capital cannot be divided among its shares.

**EVERY SURFACE IS CHECKED AGAINST `BOOK_ACCOUNTS`, NEVER AGAINST
`fifoTotals`** — which is the code under test. The Monitor's mandate rows must
each print their own account's `capital.contributed`; the PMS drill-down's rows
and footer likewise, and every other bucket must claim no capital basis at all;
a category holding whole mandates must print the capital it carries, carry a
DIFFERENT cost-held figure beside it (or the swap did nothing), name both, and
show a return that follows from its own columns within 0.5pp. And the category
coverage check — which infers uncovered value as `value − (invested +
unrealised)` — now strikes that on the cost held the cell carries beside the
printed figure, because on a capital-basis row the same subtraction is the
realised half less withdrawals, not uncosted value.

#### The bug-reintroduction pass

`scripts/dev/fifo-bug.sh` — thirteen cases, each applied alone, run against the
layer it lives in, and restored by copy on a trap and rebuilt on the way out.
**Every one fires its own check:**

| # | Bug put back | Fires |
| --- | --- | --- |
| 1 | the aggregate back to survivors only | `fifo.test.ts` |
| 2 | a carried lot appended at the back of the queue (LIFO wearing FIFO's name) | `fifo.test.ts` |
| 3 | no mandate ever struck whole on its capital | `fifo.test.ts` |
| 4 | an aggregate struck as the mean of the holdings' percentages | `fifo.test.ts` |
| 5 | the Monitor's mandate rows back to unrealised ÷ cost of the survivors | `monitor`, `mandate-fifo` |
| 6 | the mandate page's FIFO tile back to unrealised ÷ cost | `mandate-fifo` |
| 7 | the Monitor footer's return struck over the whole book | `monitor` — the footer went `—` |
| 8 | two tranches at one entry NAV given different holding-period returns | `monitor-tranche-shared` |
| 9 | a mandate row's Invested back to the cost of its shares | `monitor` — the per-row capital check |
| 10 | a category's Invested back to cost while its rows print capital | `monitor` — two checks |
| 11 | Morning CIO's allocation rows back to cost | `cio-allocation` — the tie by division |
| 12 | the PMS drill-down's mandate rows back to cost | `holdings-row-2` — two checks |
| 13 | the capital swap itself returning cost, on every surface at once | three routes |

**TWO OF THEM FOUND DEFECTS IN THE CHECKS FIRST.** Case 7 is the one that found
the footer regression in the first place (see *What this deliberately does not
do*), and case 8 is why the same-entry-NAV claim is struck on the
HOLDING-PERIOD return: Neo Infra's six drawdowns at a ₹100 face value span 2023
to 2026, so they print three different CAGRs while every one earned HPR 14.23%.

#### Verification

`build` · `tsc` · `test:ingest` (neoFlows 8, buoyant 42, classSwitch 44,
payouts 29, golden 140 with 2 not checked and 0 blocked) · `test:family` (every
suite) · `check:family` **86/0** · `check:pages` — the full sweep is recorded in the PR once it completes, MEASURED ON
THE TREE MERGED WITH #72 AND #79, which is the only base that count is a fact
about. `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` byte-identically from the merged archive, and `npm run
replay:calls -- --check` and `npm run replay:flows -- --check` are both no-ops.

#### Merged with main, and the first time the collision was a whole feature

Stage 10bt, 10bu and 10bv landed while this branch was open, and this section
was written as **10bw** against a main that held 10bv. The `ctx` literal did not
conflict. What did was Buoyant: two readers, two replays under one npm name
(`replay:flows` was declared twice in `package.json`, and git merged BOTH lines
without a marker — the later key silently wins), and two cost mechanisms.
Resolved as above: one reader, one replay, one source per cost, and the second
implementation kept only as a named cross-check. Main's `SectorComposition`
restructure was taken whole and the FIFO sector return re-applied onto
`rollSectors`, rather than hand-merging a layout this branch never meant to
touch.

#### …and the second time main had built a return methodology of its own

**#72 (Stage 10bw) and #79 (Stage 10bx) landed while this branch waited for the
family's go-ahead, and took `10bw` and `10bx`.** Main keeps both. Three lines
in this file named `10bw` for FIFO and moved — the `shared/fifo.mjs` entry in
**Layout**, the `fifo.test.ts` entry under **Build**, and this section's own
heading; every other `10bw` in the file, and every one in `src/`, is main's and
was left alone, each read before anything moved.

**AND THEN #83 TOOK `10bz` AND SKIPPED `10by`, SO THIS SECTION IS `10ca`.**
`10by` has no heading on main, but main's own Stage 10bx text reads *"the
Portfolio Monitor's stage is `10by`"*, and #83 stepped over it. A letter main
refers to is claimed whether or not a heading carries it: using it here would
send a reader of that sentence to a section about FIFO. The next free letter is
`10ca`, and the section, its two pointers in this file and its three in the
tests moved to it. This is the fifteenth collision this file records, and the
first where the letter to avoid was named in prose rather than in a heading —
which a check of headings alone would have missed.

**THE `ctx` LITERAL CONFLICTED AND WAS RESOLVED AS A UNION** — this branch's
`hbCapital` beside main's `treeState` and `pmReturn`. `schemeCalls` was on this
side only because main had removed the table it read, and it named nothing
declared in the merged file, so it did not come across: **86 keys, none
duplicated, every one naming a declared variable.**

**#79 REWROTE THE PORTFOLIO MONITOR AND PRIVATE MARKET AS TREE TABLES**, a row
opening into rows of the same table, and moved the category totals row from
after each section's rows to the top of it. Main's structure was taken whole on
both pages and FIFO re-applied inside it rather than hand-merging a layout this
branch never meant to touch: the category totals take `tot.fifo`'s return and
realised and the capital-basis Invested; `privateBook.ts`'s `figuresOf` and the
page's folio rows take their return from the FIFO aggregate; the Private
Market tile takes `privFifo`. The old category-totals block this branch had
edited was DROPPED rather than kept beside main's, which would have drawn every
total twice.

**AND #72's FUND RETURNS HAD A CHECK THAT FIFO WOULD HAVE BROKEN SILENTLY.**
`fundDatedRecords` publishes a fund's dated record — and therefore its XIRR —
only where its dated calls add to its cost. Under FIFO Neo Infra's cost is the
cost of the units still HELD, ₹4.86 Cr against ₹5 Cr called, because it
redeemed 14,162.8 units at their ₹14,16,280 cost. Nothing failed on screen:
Neo's record became a GAP, its payout side "unknown", and **its +16.68% XIRR
quietly became a dash** beside a reason about calls not adding to a cost. The
identity was always *calls = every rupee deployed*, which under FIFO is the
cost held PLUS the cost of units redeemed; that is what it checks now, and the
suite asserts it per fund.

**THE FUND HPR IS FIFO TOO, AND #72's OWN CLAIM IS WHY.** #72 wrote *"HPR MEANS
THE SAME FIGURE HERE AS ON THE MONITOR"*, and on the Monitor it is FIFO. So the
fund's HPR is `(unrealised + realised) ÷ (cost held + cost of units redeemed)`
— Neo Infra 13.83% where value ÷ cost held read 14.23% — and its note now says
which of the cash paid back it counts: **the principal returned is IN it**
(those units were redeemed, at their cost), and income and equalisation are
not, which XIRR counts. `fundReturns.test.ts` asserts the formula written out
from each row's own positions, never through `fifoTotals`, and asserts that a
private fund in this book HAS redeemed units — or FIFO's second half is
multiplied by zero on every row and the check cannot tell it from value ÷ cost.
`privateMarket.test.ts`'s cost and unrealised literals move by exactly
₹14,16,280, with the reason beside them.

### Stage 10cb — ONE TILE FOR WHAT THE BOOK IS WORTH AND WHAT WENT INTO IT, AND EVERY STRIP REMEMBERS ITSELF FOR EVERYONE

*"Open PR and do not merge until I tell you to."* · *"the headings of the KPI
tiles is not being shown completely… the small text below… is very messy and it
is not legible at all… make sure that these sub-texts are shorter and direct…
If it is irrelevant then remove them."* · *"When we are selecting a particular
KPI tile, after changing the metric that we want to see on it, make sure that it
is being saved and next time when we come on the dashboard it should be in the
same format as it was after we changed it."* · *"Capital invested and current
value of holdings can be a single KPI tile… inside that page keep the Current
value of holdings only view and add new columns and data regarding the invested
capital… they don't need to be two separate pages."* · *"the KPI tiles on
Morning CIO page are also editable just like they are in the private market
page."*

Four asks, and the second is the one that turned out to be two defects.

#### 1. THE HEADINGS WERE CUT OFF BY A BROWSER BUG, NOT BY A LACK OF ROOM

The family's screenshot read "DISTRIBUTION / S" and "CURRENT VALUE OF /
HOLDINGS" with a third of the tile empty beside them. **Measured, not guessed:**
Chromium computes the intrinsic width of letter-spaced text short by ~0.18px a
letter under CSS `zoom` — and `#root` carries `--app-zoom: 0.875` (Stage 10n).
A label sized to its content (`inline-flex`, shrink-to-fit) is therefore laid
out a few pixels narrower than the text it holds, and the last letters wrap onto
a line of their own. Padding (`pr-[0.15em]`) did not fix it — the shortfall
scales with the letter count.

The fix is to never size a label to its own content: the picker button is
`flex w-full` and its text a `flex-1` span, so a label takes the free width of
its tile and wraps only when there genuinely is no room — and then between
WORDS (`break-words`), never mid-word. Kpi's control label is a block-width
flex div rather than an `inline-flex` span for the same reason, and the ↗ arrow
beside it went, because it was the one inline-sized element left on the line.
**Any other `label-xs` sized to its content under `#root` is exposed to the same
measurement**; this change fixes the two strips that were reported and names the
cause rather than hunting the rest unmeasured.

**AND THE CHECK THAT WAS WRITTEN FOR IT COULD NOT SEE IT, WHICH ONLY THE BUG
PASS SHOWED.** The first version measured two things on the label's own text —
an ellipsis (`scrollWidth > clientWidth`) and a word split across two lines — and
putting main's own truncating markup back produced a CLEAN sweep. Nothing was
wrong with the measures; the ROUTES were wrong: with the labels shortened, main's
picker renders every default heading whole at five tiles, and only cuts
"Current Value of Holdings" to 127px of the ~167px it needs at SIX. And the
family's second symptom — "UNCALLED CAPITAL" on two lines in 101px of a 122px
tile — is neither an ellipsis nor a split word, so neither measure could ever
have caught it. Three things changed:

- **`cio-tiles-dense`** opens the MAXIMUM six tiles on the six longest labels
  Morning CIO's own picker offers — read off the open menu, never typed, so a
  renamed metric moves the worst case with it — and asserts it really drew six,
  because a stale address falls back to the default five and would pass on
  exactly the width where there is nothing to catch.
- **`needlessWrap`** measures a label that wrapped while the next word would have
  fitted. **Its edge is the tile's HEADER ROW, up to the icon beside the label —
  never any box inside the label**, because in the defect every one of those
  shrinks with the bug and would agree with it. The first draft measured against
  the label container and was blind to the very case it was written for.
- **`headingsWhole`** is one predicate over all three measures, run by the
  default strips and the dense one, so a heading cannot be held to two standards.

A fourth measure — a label spilling past its tile — was written, found to fire on
no regression anyone could construct (the one case that overflows is caught by
the clipping test instead), and **removed** rather than shipped unable to fire.
Its premise was a misreading: a button 151px wide in a 148px slot is the `-ml-1`
offset, and the right edges line up exactly.

#### 2. ONE LINE UNDER A FIGURE, AT A SIZE A READER CAN READ

`StatTile`'s sub-line was 11px slate-500. It is 13px slate-300 now, and three
lines that merely REPEATED their own heading ("Cost of these holdings" under
Cost, "Distinct funds held" under Funds, "Statement lines" under Folios) are
gone rather than shortened — a line that says the label again is chrome.
`check:pages` asserts both: at most one short line, at ≥13px, and no line that
restates its tile's heading. The longer working stays in each tile's hover, as
Stage 10bs left it.

#### 3. "SAVED" MEANT ONE BROWSER, AND THE FAMILY READ THAT AS NOT SAVED

The strip already kept a choice in `localStorage`. Measured, that survives a
reload and a new tab — and does NOT survive a second laptop, a phone, a cleared
browser, or the partitioned storage a browser gives a page inside another
site's frame, which is how this dashboard is served (the session cookie is
`SameSite=None` for exactly that reason). Each of those reads as "it did not
save". And a second defect sat on top: a picked tile wrote `?tiles=` into the
ADDRESS, so a reader who bookmarked or re-opened that address was pinned to the
set in the URL whatever they later chose.

- **`functions/api/tile-sets.js`** keeps each page's layout in Cloudflare KV —
  the SAME `GLOW_STORE` binding the capital-call column uses, so there is no new
  set-up. One key per PAGE (`tile-set:<page>`), last write wins: the site has one
  password and no user accounts, so a layout is the dashboard's, like the
  capital calls. It stores **METRIC IDS AND NOTHING ELSE** — validated as slugs,
  at most 40 — so nothing saved can put a figure on screen; the page decides what
  an id means from the book when it renders, and an id a later build does not
  know is dropped rather than drawn blank. The save's answer applies the save
  itself, because KV's list is eventually consistent and a reader must never see
  their pick revert. Writes carry the capital-call store's cross-site guards.
- **`src/lib/tileSets.ts`** is the client: one GET per page load shared by both
  strips, a `{ ids, synced }` copy in `localStorage` that the page paints from
  first (so it never opens on the defaults and jumps), and ONE pure precedence
  rule, `chooseTileSet`:

  ```
  a ?tiles= address  >  a change made here the store never confirmed
                     >  the shared layout  >  this browser's copy
  ```

  The second tier is the load-bearing one: a choice made while the store was
  down is the newest thing anybody did to the strip, and it is PUSHED when the
  store answers rather than overwritten by the older shared layout. An older
  build's bare-array copy is of unknown age and yields to the shared set.
- **A PICK NO LONGER WRITES THE ADDRESS** — it deletes `?tiles=` with `replace`,
  so an address carries a layout only when somebody deliberately shares one.
- **THE PICKER SAYS WHERE THE CHOICE WENT**, and the cause picks the sentence:
  saved for everyone; saved in this browser only because the store is not
  switched on, not running here, the reader was signed out, or it did not answer.
  Each sends a reader somewhere different — `upstreamStatus.ts`'s rule arriving
  through a preference. It is in the picker, never on the strip.

`tileSets.test.ts` (48 checks) runs the function against an in-memory KV that
pages and can be frozen stale, and reads the function's OWN responses through
the client, so the two halves cannot drift; it walks every tier of the
precedence rule.

#### 4. ONE TILE, ONE PAGE: WHAT THE BOOK IS WORTH AND WHAT WENT INTO IT

**Current Value of Holdings** carries a second line, **Invested ₹X**, and opens
`/holdings?of=book`. Capital invested is no longer a default tile or a scope of
its own:

- the `invested` drill-down is **merged into `book`** as a second facet group —
  *Cost reported · No cost reported* beside *Listed · Private · Not placed*,
  with a divider between the two groups because they cut the same holdings two
  different ways and a reader must not read the six chips as one partition.
  `?of=invested` and `?of=no-cost` still resolve (to `book` with the `costed` /
  `no-cost` facet), so every bookmark keeps working;
- the page's headline gains **Invested ₹X · gain ±₹Y (±Z%) · N of M report a
  cost** — the return printed only where `coveredReturn` says the costed set
  covers the value, the rule the allocation row and the footer already apply;
- the table gains a **Share of invested** column beside Weight, footed at 100%,
  so a reader sees where the money went as well as what it is worth now. A row
  whose statement reports no cost renders an `AbsentCell` naming why, never 0%.

**Nothing moved in the arithmetic.** Capital invested is the same `sumOrNull`
over the same costed set; the tile's figure and the page's figure are asserted
to be one number by two paths.

#### 5. MORNING CIO'S STRIP IS THE PRIVATE MARKET PICKER

`SelectableTiles` gains a `variant="kpi"` that draws the raised, clickable `Kpi`
tile, and Morning CIO's fixed strip is now a catalogue of **twenty metrics on this book**
over five defaults (value, money-weighted return, consolidated return, uncalled,
distributions): capital invested, unrealised gain, committed, each side of the
book, positions, names, top-10, cross-held, winners, losers, the largest holding,
accrued income and cash. **Every figure is one this page already derived**; the
catalogue re-homes them, it computes nothing new. Each tile keeps ITS OWN
destination, and the picker and remove controls are lifted above the tile's
stretched link so choosing a metric never navigates. The grid follows the tile
count (`--kpi-cols`, capped at six) — as `.grid.kpi-grid`, because Tailwind
emits its responsive column classes after every custom rule and a single-class
selector lost to `lg:grid-cols-3` at 1500px.

`check:pages` gains three routes: `cio-tiles-saved` (pick a metric with a stubbed
store, then a SECOND browser context must open on it), `cio-tiles-dense` (above)
and `holdings-invested-legacy` (the old address still lands on the costed half,
and its crumb is held to the figure it now opens rather than abstaining on a link
that is gone by design). `tilePickerChecks` is one factory run by both strips.

**ONE SET-UP STEP, AND IT IS THE SAME ONE AS THE CAPITAL-CALL COLUMN.** If the
`GLOW_STORE` KV binding is connected, layouts are saved for everyone on the next
deploy with nothing else to do. Until it is, every choice is kept in the browser
and the picker says so.

#### The verification

`build` · `tsc` · `test:ingest` (every suite, #75's and #72's new ones included) ·
`test:family` (a new `tileSets.test.ts`, 48 checks) · `check:family` **86/0** ·
`check:pages` **216 combinations clean** on the thrice-merged tree, with eight
evidenced abstentions across four PRE-EXISTING claims — every KPI tile on this
book carries a figure (four Morning CIO routes), no row on `stock-qty` carries a
pledge, every private holding reports a cost (two routes), and the not-found
drill-down points at nothing on Morning CIO by design. **None of them is this
change's**: the one it briefly added — the crumb on the retired `?of=invested`
address — was turned into an assertion against the address it now resolves to.
The count is measured on the merged tree and was never adjusted: this branch's
own runs read 202, 206 and 212 against bases that have since moved.

#### The bug pass, and the harness that runs it

`scripts/dev/kpi-tile-bug.mjs` — committed so the next session's verification is
one command. Each case patches ONE defect back, rebuilds, and walks only the
routes (or runs only the suite) that exist to catch it; a patch that does not
apply or a build that fails is reported as NOT A RESULT, and the tree is restored
from memory, verified byte for byte, and REBUILT on the way out. It edits with
`split(from).join(to)` and never `.replace` — this session's own patch scripts
lost a `$$eval` to `String.replace`'s `$$` pattern TWICE, the trap this file
records at Stage 10bj, and the first time it silently aborted the pick walk.

| Defect put back | Fires |
| --- | --- |
| main's truncating label (the ellipsis the family photographed) | the heading check on `cio-tiles-dense` |
| a label that will not wrap, overflowing its box | the same |
| the KPI label container sized to its content — the zoom wrap | the heading check on `cio` |
| a pick writes `?tiles=` into the address | "the next visit opens on it", on Private Market and Morning CIO |
| a save never reaches the shared store | all four `cio-tiles-saved` checks — the fourth only after it was re-struck: it read the picker's sentence BEFORE the pick, which reports the store being READ, so the first run fired three. It reads the sentence again once the save has answered |
| the value tile loses its Invested line | "Current Value of Holdings carries the capital invested, as one tile" |
| Morning CIO's strip fixed again — no picker | four picker checks |
| the value page loses its cost facets | eight checks across four drill-down routes |
| Share of invested struck on half the cost | "the Share of invested column adds to the footer's 100%" |
| the headline's invested line deleted | "the capital invested stands beside the value, and it is the Morning CIO tile's" |
| a tile line restating its heading | "no tile's line merely repeats its heading" |
| the line under a figure back at 11px slate-500 | "at most one short, legible line" |
| an unsynced change overwritten by the older shared layout | 2 suite checks |
| a save's answer read from KV's stale list | 2 |
| any string accepted as a metric id | 2 |
| a cross-site write accepted | 3 |

**THE FIRST RUN OF THIS TABLE HAD A CLEAN ROW, AND THAT ROW IS THE SECTION ABOVE.**
The label case as first written reverted only the button's width, found nothing,
and was measured rather than assumed: that variant renders every heading
correctly here. Main's own markup and the container regression are what break a
heading, and the checks were extended until both fire.

#### Merged with main, and the letter was checked against the tip

Stage 10bu (#73) landed while this branch was open and **keeps its letter**. So
did Stage 10bv (#75) — while the verification sweep for THAT merge was running,
and it took the letter this section had been written under. The letter check was
re-run against main's tip immediately before this last merge rather than trusted
from the first one, which is the only reason the collision was caught before it
landed rather than after. **And then Stage 10bw (#72) landed during THAT merge's
sweep and took the next letter too** — three collisions in one branch. This section
was **10bx** at that point; its references were renamed inside this branch's own conflict hunks
and at the one line outside them, and each of main's `10bw` lines was left alone.

**#72 BROUGHT THE ONE CONFLICT NO TEXT MERGE COULD SEE.** Its new search index
(`src/lib/searchIndex.ts`) linked *Capital invested* and *Holdings with no cost
reported* to `drilldownHref("invested")` — the scope this branch retired. Git
merged the file cleanly; `tsc` refused it (`"invested"` is no longer a
`DrilldownId`), which is the type doing exactly what deleting the id rather than
hiding it was for. Both entries now open the value page's own cost facets, so the
search box and the KPI tile land on one page. Two per-route walk blocks inserted at
one spot shared a closing brace and each got its own; the `ctx` literal is a union
again (main's `pmReturn`, 87 keys). The `ctx` literal conflicted on one line and was resolved as
a union — main's `absentName` beside this branch's `tileSaved` and
`hbCostShares`, 85 keys, none duplicated, each confirmed declared. `HoldingsBehind.tsx`
auto-merged and was read rather than trusted: main added the `AbsentFromBook`
note under an empty filter, which sits beside this branch's invested headline
without touching it. No generated file was touched by either side, and
`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
byte-identically (md5 unchanged). The second merge brought #75's regenerated book
as a straight take-theirs, and `build-book` was run again afterwards as a control;
its `ctx` key (`costCarried`) joined the union — 86 keys, none duplicated.

#### …and a fourth time: #79 took `10bx`, and this section skipped `10by`

The family said to merge, and the letter check against main's tip found that
**#79 — Private Market as one master table — had landed an hour after this PR
opened and taken `10bx`.** The two sections sat at the same place in the file,
so git marked the conflict this time. Main's keeps `10bx`; this section became
**`10bz`**, and it SKIPPED `10by` on purpose: #79's own section already says
*"the Portfolio Monitor's stage is `10by`"* while main carries no section under
that letter. Taking it would have pointed that sentence at a section about KPI
tiles. A skipped letter costs nothing, and a pointer that lands on the wrong
section is the harm the letter check exists to prevent.

**SIX LINES OUTSIDE THE TWO SECTIONS NAMED `10bx`, AND EACH WAS PLACED AGAINST
BOTH SIDES' OWN COPIES OF THIS FILE BEFORE ANY MOVED.** Two are this branch's —
the `tileSets.ts` Layout bullet and the note under Stage 10v that Capital
invested is no longer a scope — and moved. Four are #79's — its two Layout
bullets, the `fundReturns.ts` pointer and the note closing Stage 10bs's limit —
and were left alone.

**THE `ctx` LITERAL CONFLICTED ON ONE LINE AND WAS NOT A PLAIN UNION.** #79 added
`treeState`, which came across. It also removed the scheme-table probe
`schemeCalls` with the table it read, so that key was dropped rather than
carried: a key naming a variable that no longer exists throws inside every check.
The result is 87 keys, none duplicated, and every identifier declared in the
merged file.

**AND THE PAGE CONFLICT WAS ONE LINE.** #79 rewrote `PrivateMarket.tsx` and
dropped the long comment above the tile strip. Its line is kept, plus this
branch's `page="private-market"` — the prop that makes the strip save to the
shared store, and without which the Private Market layout would stay in one
browser. This branch's three removed sub-lines (Capital invested, Funds, Folios)
survived the merge untouched.

`build` · `tsc` · `test:ingest` · `test:family` · `check:family` **86/0** ·
`check:pages` **222 combinations clean, 0 invariant failures** on the tree
merged with #79. That is this branch's 216 plus the six combinations #79's routes
add, and it was measured rather than added up. The nine claims that could not be
checked are the eight pre-existing ones plus #79's own new claim that a redeemed
private account shows a measured ₹0 (no private account in this book is redeemed
to nil). None of the nine comes from this change. `npm run build-book`
regenerates `glowData.ts` and `docs/BOOK-REPORT.md` byte-identically.

#### …and a fifth time: #83 took `10bz` too, so this section became `10ca`

That sweep finished clean, and the letter check was run once more against main's
tip before merging. It had moved again: **#83 — Ask Muns taken off the top bar —
landed while the sweep ran, and it had ALSO skipped `10by` for the same reason
and taken `10bz`.** Main's keeps it; this section became **`10ca`**, the letter
after `10bz`. The two sections sat at the same place in the file, so git marked
the conflict. Of the nine lines naming `10bz` afterwards, four outside the two
sections are #83's (the search-box Layout bullet, the paused chat, the chat
route's check, and the top-bar search slot) and were left alone. Two outside are
this branch's (the `tileSets.ts` Layout bullet and the Stage 10v note) and
moved, along with this section's own heading and the merge note above.

**#83 TOUCHED TWO FILES THIS BRANCH ALSO CHANGES, AND BOTH MERGED WITHOUT A
MARKER**, which is when this file says to read them rather than trust them.
`src/lib/searchIndex.ts` kept both sides: #83's removal of the "Ask Muns" row,
and this branch's two figure entries opening the value page's cost facets rather
than the retired `invested` scope. The `ctx` literal in `check-pages.mjs` was
read rather than trusted. Its keys were confirmed a union, none duplicated, with
every identifier declared in the merged file.

#### …and a sixth: #80 took `10ca` in the seconds before the merge, and changed what "invested" means

The family said to merge a second time, and GitHub refused: `405 Pull Request
has merge conflicts`. **#80 — FIFO returns everywhere — had landed moments
after the last letter check and taken `10ca` as well.** Main's keeps it; this
section is **`10cb`**. Of the lines naming `10ca` outside the two sections,
three are #80's (the `fifo.ts` Layout bullet, its own merge note and the
`fifo.test.ts` line under **Build**) and were left alone. Two are this branch's
(the `tileSets.ts` bullet and the Stage 10v note) and moved.

**#80 IS THE MERGE THAT CHANGED A FIGURE THIS PR PRINTS, AND NO CONFLICT MARKER
SAID SO.** It redefined Invested: a whole PMS mandate enters at the capital paid
into it rather than the cost of the shares it still holds, because that is what
its FIFO return divides by. Morning CIO's `totalInvested` took the new definition,
and so did the value tile's Invested line, which reads that one figure. But the
`/holdings` headline this branch added summed `costBasis` itself, and so did
the Share of invested column. Git merged both files without a conflict. After
the merge the tile would have read the capital figure, the page it opens would
have read the cost of shares, and their Share of invested would have divided
yet another figure. That is two figures for one set, one click apart.

- **The headline's Invested is `investedWithCapital(cost, fifo)`**, the one
  helper #80's allocation row and footer both call, with `investedBasisNote`
  naming the cost of the shares in its hover. Its gain is FIFO's (unrealised
  plus realised), because the percentage beside it divides FIFO's gain.
  Printing the unrealised half alone beside a FIFO percentage would be a pair
  that does not divide.
- **Share of invested divides each row's Invested by that same figure**, so it
  still foots to 100%. A statement line under a whole mandate shows a dash with
  the reason: a mandate's capital is not divided among its shares, which is
  #80's own rule.
- **On Morning CIO, the "Unrealised gain" tile is now "Total gain".** Its figure
  is `embeddedGain`, which #80 made FIFO's unrealised plus realised. Keeping
  the old label would have described the figure wrongly. The value tile's hover
  and the Consolidated return and Capital invested hovers say the new basis in
  words.

The `ctx` literal kept this branch's keys and took #80's `hbCapital`: 88 keys,
none duplicated, each declared. The first conflict hunk kept both probes,
`hbCostShares` beside `hbCapital`.

**AND #81 LANDED WHILE THAT MERGE WAS PUSHED, UNDER `10by`.** It took the letter this
section had stepped over, so there was no collision this time. Its one conflict
was the test script: #81 added the NAV benchmark checks to `cio-nav` beside this
branch's two tile routes, and `priceRequests` to the `ctx` literal (89 keys,
none duplicated, each declared). Its Morning CIO change, the NAV tab naming the
chosen benchmark, merged without a marker and does not touch the KPI strip.

### Stage 10cc — ONE COMPANY, ONE KEY, ONE NAME — AND THE WINDOW THAT HELD AJAY'S KAYNES

*"Open PR and do not merge until i tell you to. According to the client, Kaynes
Technologies Limited is also a holding in Vikas Khemani Fund. And also a holding
of the family entity Ajay's account. Also, when I am searching Kaynes in the
search bar, it is coming up in small cap and large cap both. It should be a
single name only. Make sure that the name of all the entities is written
correctly neither in all full cap nor in all small cap. Otherwise 2 separate
names of the same company does not make sense."* · *"Find the root cause of the
issue and fix it."*

Three claims in one message, and each had a DIFFERENT root cause — which is the
whole reason this section is organised by cause rather than by screen. Two of
them turned out to be the same defect this file has recorded before in other
shapes: a join struck on a NAME where an identifier was available.

#### 1. Ajay's Kaynes was in the archive, on a key no page read

**THE DEPOSITORY SAYS IT, DATE BY DATE.** Ajay's main demat (`…12539150`)
issues a transaction statement and no holdings statement, and its Kaynes block
reads: 16,300 shares on 1 April 2026; 16,300 delivered out on 10 April; 16,300
credited back on 5 May; 1,313 delivered out on 12 May and 14,987 on 13 May —
**nil from 13 May, and nil at the 31 July closing.** Ten dated rows — three
deliveries out, one credit in, and six early-pay-in earmarks that move nothing and
are counted in no column — every one walking the statement's own printed balance.

**AND NOTHING SHOWED IT, BECAUSE THE WINDOW WAS KEYED ON A SPELLING.** The
statement prints `KAYNES TECHNOLOGY INDIA LIMITED # EQUITY SHARES`, whose key is
`kaynes-technology-india`; the book's Kaynes — Ankita's 4,875 shares, printed
`KAYNES TECHNOLOGY-EQ` — is `kaynes-technology`. `shareMovementsFrom` joined a
window to a position by (account, ISIN), and Ajay's account no longer holds any,
so nothing joined and the window stood on a key no position carries: the one
record in the archive of Ajay holding Kaynes this year reached no page. This is
Stage 10ak's lesson one table over — a key is only an identity where it is the
same function of the same name, and two statements spelling one company is
exactly where it is not.

**THE FIX IS THE IDENTIFIER, IN THE BUILDER.** A window whose ISIN is carried by
exactly ONE company this book holds is filed under that company's key. Measured:
**10 windows bridged, 0 ISINs ambiguous, 0 collisions, 0 overwrites** — and **4
windows deliberately NOT bridged**, because they are a depository's copy of AIF
units the fund's own statement already reports; keyed onto the fund they would
stand beside the fund's record as a second account of the same units. The note
prints every count on every run, zeros included.

**THEN BOTH PAGES SAY IT.** The company page's quantity table marks the row
*Sold out in this window* (or *Held, and not valued here* where an account that
publishes no holdings statement still closes above nil), and the Portfolio
Monitor's row expansion names the account, its opening and its nil closing, with
a link to the company page — `DematElsewhere`, which renders only where a row's
own venues do not already carry that account.
*(`DematElsewhere` has since gone: at Stage 10ci the account is a ROW of the
same table, in the table's own columns, carrying the same handles.)*

**AND THE FAMILY'S OWN REVIEW DISAGREES, WHICH IS STATED RATHER THAN RESOLVED.**
The consolidated review dated 30 June 2026 carries 21,175 Kaynes shares under
"Ajay Jaisinghani / Ankita Jaisinghani", and its *Transactions since inception*
sheet closes Ajay at **16,300 on 30 June** — seven weeks after the depository
shows his account at nil, and with none of the April and May movements on it.
That is almost certainly where the client's belief comes from. The statement is
the custodian's own record and the newer document, so the book follows it. If
the family believe Ajay holds Kaynes today, those shares sit in an account whose
statement is not in `source/`, and that statement is the ask.

#### 2. "Vikas Khemani Fund" is an AIF, and an AIF discloses no portfolio

The fund is the **Carnelian Bharat Amritkaal Fund** — Vikas Khemani runs
Carnelian — held by the family as an AIF folio. Its statement is a statement of
account: units, a NAV, contributions, and not one line of what it owns; and
Carnelian publishes factsheets for its PMS strategies and none for this fund. So
a Kaynes holding inside it is real to the family and **unmeasurable here**, which
is the same finding Stage 10aj records for the whole AIF block.

What changed is that the page stopped making a reader guess. The look-through
card said *"your N AIF folios … file no portfolio disclosure"* — a count, which
answers nobody who wants to know whether THEIR fund was looked into. It names
every AIF fund now, once per fund rather than once per unit class, under
`data-fund-exposure-aifs`, and the sweep holds that list to the book's own set.

#### 3. The search list compared NAMES, and names are what disagreed

*"Kaynes Technology"* and *"KAYNES TECHNOLOGY INDIA LIMITED"* were one company on
one row — the look-through had joined HDFC Balanced Advantage's line to the book's
Kaynes on the ISIN. The PICK-LIST built its options from the rows' names instead,
so the fund's spelling of a company the book holds was offered as a second
company; and ticking only that one drew a derived row of ₹79,181 and none of the
family's ₹1.64 Cr in the same shares. **Which of the two a reader clicked changed
the answer.** A company the book holds is offered once now, under the book's own
label, and the look-through adds only what the book does not hold — by KEY.

That exposed three more layers of the same failure, each fixed where it lives:

- **ONE COMPANY, TWO KEYS.** No label can merge two rows. `SBI - EQ` (27,750
  shares, ₹2.90 Cr, a Motilal demat) and `State Bank of India` (four PMS rows,
  ₹1.56 Cr); `THE KARUR VYS-EQ` and `Karur Vysya Bank Ltd.`; LKP's clipped
  `Crompton Greaves Consumer Elec` and V.E.C's full name. Each pair is
  corroborated by an identifier nobody here controls — the depository row's ISIN
  resolves the same NSE symbol the other spelling's name does — and none is a
  name the strip could reach, because each is an ABBREVIATION or a clipping
  rather than furniture. `KEY_ALIASES` in `shared/securityKey.mjs` joins exactly
  those three, and `build-book` now prints how many NSE symbols stand under two
  keys (0) on every run. The Helios fund-unit twins are deliberately NOT aliased:
  they are the extractor join `docs/BOOK-REPORT.md` names, not a spelling.
- **ONE KEY, TWO LABELS.** Seven keys are printed two ways by two statements
  (`ICICI Bank` / `ICICI Bank Ltd.`, `SBI` / `State Bank of India`, `The Karur
  Vys` / `Karur Vysya Bank Ltd.`…), and each position carried its own.
  `src/lib/securityLabel.ts` picks ONE of the printed spellings per key by a
  stated rule — a spelling the statement CASED beats one this app title-cased,
  then the longest, then the larger holding — and `PortfolioContext` applies it
  once, so the ledger, the tranche panels and every table read the same name.
  **No name is supplied that no statement printed**: a fund's fuller spelling of
  a company the book holds is somebody else's document and is not borrowed.
- **ONE NAME, THE WRONG CASE.** `THE KARUR VYS-EQ` printed as *"the Karur Vys"* —
  a name opening in lower case, which is exactly what was asked about; `State Bank
  Of India` and `State Bank of India` read as two companies; four managers print
  their strategy names in capitals (`CARNELIAN BESPOKE PORTFOLIO`); 142 filing
  lines arrive all in capitals and a handful carry a filer's lowercase slip
  (`Himachal pradesh`, `SBI funds Management ltd.`). The title-caser now opens a
  name in capitals, lowers only connectives inside it, keeps a measured list of
  acronyms that are names (`SG`, `LLP`, `SVAN`, `SDL`, …) and restores `360 ONE`
  as a brand; `displayFiledName` capitalises a filer's slip and leaves a brand
  like `eClerx` alone.

#### 4. A bond is not a company, and neither is its maturity date

With the list keyed properly, it still offered 738 options, and a measured
normaliser found the rest of the same complaint in them: `Karur Vysya Bank Ltd.
(17/11/2026) **#` beside `Karur Vysya Bank Ltd.`, `8.31% Aditya Birla Capital
Ltd. (11/07/2034) **` beside Aditya Birla Capital, *"The Jammu & Kashmir Bank
Limited"* beside the book's J&K Bank, LIC twice, Vedanta twice, and the
Government of India as twenty-odd rows — `Government of India (24/07/2037)`,
`7.18% GOI MAT 140833`, `91 DAY T-BILL 05.11.26`. Three causes, each fixed at the
join in `loadStockExposure` and none in the display:

- **A ROW WAS NAMED BY ONE OF ITS INSTRUMENTS.** `issuerNameOf` removes what
  names the instrument — coupon, bracketed or trailing maturity, `(ZCB)`, the
  `MAT`/`ISD` date codes, a dangling dash, the filer's footnote marks — and only
  ever removes. A bracket that is not a date stays: *Tata Teleservices
  (Maharastra)* is a different company from *Tata Teleservices*. The instrument
  lines under a row keep their full names, because there the coupon and the
  maturity ARE the name; only the footnote marks go, since the store carries the
  line and never the filer's legend (804 of the store's 2,362 lines carry one).
- **THE ISSUER TIER COULD NOT SEE THE BOOK'S OWN COMPANY.** It took the book's
  key only where a FILING carried an ISIN the book carries. No fund here files
  Karur Vysya's share, City Union's or Indian Bank's — only their certificates of
  deposit — so their paper stood as companies of their own. The book's own
  company ISINs now seed the issuer (characters 1-7, company prefixes only, and
  only where the prefix names ONE book key: a warrant and a share of one company
  are two holdings).
- **A MANDATE'S COMPANIES HAD NO ISIN AT ALL.** A PMS statement prints none, so
  J&K Bank, LIC, Great Eastern Shipping and Vedanta joined to no fund's line.
  `bookIsinBridge` reads the LISTING's ISIN off two committed maps this app
  already trusts with money — `nseSymbols.json` (what the quote feed prices by)
  and `UPSTOX_INSTRUMENTS` (`NSE_EQ|<ISIN>`, which the feed must echo back): **120
  companies gain an ISIN, 0 refused.** The statement's own ISIN wins where it
  printed one, and a listing ISIN another book key claims is refused, never
  reassigned. Shared by the hook and the suite, so the two cannot build the index
  differently.
- **GOVERNMENT PAPER CARRIES NO ISIN — 177 lines, not one.** `issuerKeyOf` reads
  the issuer off the words that DEFINE it: `GOI`, `GOI STRIPS` and every treasury
  bill are the Government of India; an `SDL` is its state's, and so is the one
  loan printed with a government date code and no `SDL` (six lines, Madhya
  Pradesh and Maharashtra), which another AMC files as `State Government of …`.
  **`Government Securities` is deliberately left alone**: it names no government,
  and a heading assigning one would be a classification nobody made.

**TWO KEYS NOW SPAN TWO ISSUER CODES, AND BOTH ARE REAL MERGERS.** Aditya Birla
Finance's NCDs kept `INE860H` when it amalgamated into Aditya Birla Capital
(`INE674K`); Tata Capital Financial Services' kept `INE306N` inside Tata Capital
(`INE976I`). Every filing names both as the surviving company, and the name tier
follows the filer — the suite asserts every multi-code key is supported by its
filings' own issuer names.

**The result, measured on the rendered list:** 738 → **670** options on the
security axis and 209 on the default one, **0 duplicate companies**, nothing all
in capitals, nothing opening in lower case, no coupon, maturity or footnote mark;
the Government of India is one row of 54 instruments across 7 funds.

#### The rekey defect this change found, which no figure on screen would have

`KEY_ALIASES` changes a key, so the archive had to be re-keyed without the PDF
passwords (`npm run rekey:archive`). **Its first run walked top-level arrays
only.** LKP's opening-position rows sit NESTED inside `positionsAsOf`, so
Crompton's holding moved to the new key while its opening row stayed on the old
one — and the next `build-book` joined nothing, **dropping Crompton's ₹15,47,017.80
cost basis and its −27.78% return** with every total still reconciling. Caught by
comparing the rebuilt book field by field. The walker now visits every object
carrying a `securityKey` at any depth, and its gate refuses a half-moved archive,
which is exactly the state the first run produced. 9 rows across 6 documents
moved; `BOOK_SUMMARY` did not move by a rupee.

**`nseSymbols.json` WAS DELIBERATELY NOT REGENERATED.** A fresh run would drop
HEG's symbol — NSE has renamed the listing — which is the decision Stage 10br
already recorded. The three pre-alias keys therefore remain in that map as
entries no position carries; they resolve nothing and harm nothing, and the next
deliberate `build-symbols` retires them.

#### The checks, and what the bug pass found

`securityNames.test.ts` (new), `stockExposure.test.ts` and `shareMovements.test.ts`
carry the arithmetic, anchored on the generated book, the committed store and the
two symbol maps; `check:pages` walks four new routes — both search lists read
whole, and the Kaynes case on the company page and on the Monitor row, derived by
ISIN so a regression to the orphan key FAILS rather than abstaining. The sweep's
own re-expression of the look-through join (`SECURITY_AXIS_BOOK`) was rewritten
tier for tier rather than imported.

**FOURTEEN BUGS REINTRODUCED, EACH CAUGHT** — `scripts/dev/names-bug.sh`, run in
a separate `git worktree` on its own preview port so the working tree stayed
clean, each case applied alone, rebuilt, checked and restored by copy with a
rebuild on the way out, after a no-patch control that came back clean.
`CASES=4,9` re-runs chosen cases, numbered in the order the harness lists them.

| # | Bug put back | Caught by |
| --- | --- | --- |
| 1 | a key renders under whichever spelling its statement printed | 3 suite checks, and "no two options are one company written two ways" on both search lists |
| 2 | the search list offers a fund's spelling of a company the book holds | 2 checks on the security search list |
| 3 | no listing ISIN for a company whose statements print none | 3 suite checks, 2 on the security list |
| 4 | the issuer seed switched off | 1 on the security search list — **and, on the first run, no suite at all; 4 suite checks since. See below** |
| 5 | an issuer row keeps its instrument's coupon and maturity | 11 suite checks, 3 on the instruments route, 1 on the security list |
| 6 | treasury bills and `GOI` not read as the Government of India | 6 suite checks |
| 7 | a filer's lowercase slip reaches the screen | 3 suite checks, 1 on the security list |
| 8 | a filer's footnote mark stays on the name | 2 suite checks |
| 9 | the Monitor's row names no account that sold out | 2 on `monitor-sold-elsewhere` |
| 10 | the company page does not mark the account that sold out | 1 on `stock-sold-elsewhere` |
| 11 | the look-through card counts the AIFs and names none | 1 on the security drill-down, 1 on `monitor-sold-elsewhere` |
| 12 | the depository's `SBI` is not State Bank of India | 1 suite check |
| 13 | a manager's strategy name reaches the screen in capitals | 1 on `monitor` |
| 14 | `build-book` leaves a sold-out demat window on the depository's spelling | 2 suite checks, 2 on the Monitor row, 1 on the company page |

Cases 6, 8 and 12 are suite-only by construction — none of them can reach a
rendered page on this book — and the harness says which checks each case runs,
because a sweep reporting clean over a defect it cannot see is the harness
measuring nothing.

**THE FOURTH WAS CAUGHT BY THE PAGE AND MISSED BY THE SUITE, AND THE REASON WAS
IN THE SUITE.** Switching the issuer seed off, the security search list offered
`City Union Bank Ltd.` as a second company, and every suite stayed green. The
page loads the funds the family holds TODAY (`currentHoldings`);
`stockExposure.test.ts` loaded every fund vehicle the book ever carried. That is
a different JOIN, not a larger set of the same one: a redeemed fund's filing is
still read when the issuer prefixes are decided, and HDFC Small Cap — redeemed to
nil in folio 16180583 — files City Union's SHARE. So in the suite City Union's
certificates of deposit joined the book's company by that share's ISIN, while the
page, which never loads a redeemed fund, needed the seed to make the same join.

`heldFundVehicles` in `lookthrough.ts` is now the one definition of that set,
read by `useStockExposure` and by the suite — the treatment `bookIsinBridge`
already had, for the same reason. On the page's own funds the suite now fails
with the seed off, naming City Union Bank's two CDs as issued by a book company
and standing apart from it. And `securityNames.test.ts` section 5 constructs the
same shape on an in-memory store — a depository's clipped `CITY UNION -EQ RE1/`
against a CD filed under the full name — because the real case lasts only while
a fund the family holds files City Union's paper and none files its share, and
both of those move with every monthly filing.

**AND THE FIRST MEASUREMENT OF WHY WAS WRONG IN THE SAME DIRECTION.** Asked what
the seed decides, a script that read every scheme file in the store — not the
ones the page loads — reported three prefixes, each also reached by name, and
concluded the seed was redundant on this book; two comments were written on that
basis. Measured on the page's own funds it decides six, and City Union is the
one only it can reach. Both comments are corrected. A measurement over a superset
is a different measurement, which is exactly the suite's own defect, committed a
second time while diagnosing it.

Re-run with `CASES=4` on the fixed tree, the case now fails **four suite checks**
— City Union Bank's two CDs standing apart on the real store, and three in the
constructed case — beside the security search list's one, after a control that
came back clean on both.

**THE PARTITION CARRIES THE FLOOR AS A TERM.** On today's funds, the four
mutual-fund rows under the ₹1,000 floor (₹208.24) and the five redeemed at ₹0
fall in no bucket, so the five buckets alone came to ₹208.24 short of
`BOOK_SUMMARY`. The shortfall is a named term, bounded so that a floor grown into
a policy on real money fails rather than reconciles, and not a wider tolerance.

**AND ONE ABSTENTION NOW HAS A SUBJECT.** `stock-qty` walks Nippon India ETF
Liquid BeES — the held name spanning the most demat windows — on main as here.
The bridge files one more of its windows under the book's key (four, not three),
and that window carries five pledge moves, so "a pledge is excluded from the
movement columns" is checked on that route rather than excused. `stock-pledge`
now walks Insolation Energy rather than Kaynes, because the first pledged held
name in window order changed; both assert the same claim.

#### Merged with main six times, and the letter moved six times

This branch was held at the family's request (*"do not merge until i tell you
to"*), and main moved six times while it waited.

- **#70 and #73 landed first** and took `10bt` and `10bu`, so this section became
  `10bv`. The probe list unioned to 85 keys, and #73's generated `reviewGaps.ts`
  regenerated byte for byte, so the new keys did not move it.
- **Then #75 landed and took `10bv`**, and this section became `10bw`. Each `10bv`
  line was checked against both parents: six are #75's and stay, four are this
  branch's and moved. Three conflicts, each a union: the `monitor` block's two new
  invariants side by side, the probe list — the exact union at 86 keys, none
  duplicated, none lost from either side, every shorthand key declared — and
  `tranches.ts`'s imports. Nothing generated was trusted to the text merge:
  `build-book` reproduces the merged `glowData.ts` and `BOOK-REPORT.md` byte for
  byte, `reconcile:review` reproduces its two outputs, and `rekey:archive`,
  `replay:flows`, `replay:movements`, `replay:calls` and `replay:owners` are all
  no-ops — #75's new Buoyant rows carry no key this change's aliases move.
- **Then #72 landed and took `10bw`**, and this section became `10bx`. Fourteen
  `10bw` lines are #72's and stay; this branch's four moved. Two conflicts, each
  a union: the sweep's imports, and the probe list — the exact union at 87 keys.
  The generated files re-derive byte for byte and every replay is a no-op, as
  before.
- **Then #79 landed and took `10bx`.** Main's own `10bx` names `10by` as "the
  Portfolio Monitor's stage", so this section skipped to `10bz` rather than make
  that sentence point at a stage about something else. Thirteen lines named
  `10bx` or `10by` after the merge, and each was placed before any moved: seven
  are #79's and stay (its heading, four pointers, and the two lines of its own
  letter note); six are this branch's — its heading and four pointers moved, and
  one line of its merge history keeps `10bx`, because it records the letter this
  section held then. Three conflicts, each a union:
  - **The Portfolio Monitor.** #79 replaced a row's in-cell expansion with rows
    of the same table (`TreeTable.tsx`), and this branch's line naming the
    account that sold a name out was inside the old expansion. It is a tree line
    now, drawn by `renderChildren` between the "Counted once" line and the fund
    look-through — and, by the tree's own rule, only where there is such an
    account, because an empty line in the tree reads as a figure that failed to
    arrive. Its account number is shortened the way the tree prints one
    (`a/c …539150`, the whole number in the hover).
  - **The probe list**: main's, plus this branch's `dematElsewhere` and
    `pickOptions`. #79 removed `schemeCalls` along with the scheme table it read,
    so it stays out: 87 keys, none duplicated, every one declared.
  - **This file**: main's `10bx` first, then this section after it.

  `names-bug.sh`'s case 9 patched the old expansion's markup, so its anchor was
  gone; it patches the tree's own line now.
- **Then #83 landed and took `10bz`**, so this section is **`10ca`**. The two
  sections sat at the same place in this file, so git marked the conflict this
  time — the case that announces itself. Outside it, nine lines named `10bz`, and
  each was placed before any moved: five are #83's and stay; four are this
  branch's pointers and moved, and the heading moved with the resolution. Every
  `10bz` in the code is #83's. This file was the only conflict. The page-check
  script and `searchIndex.ts` merged without a marker, which is when to check by
  hand: the probe list is the exact union at 87 keys (#83 added none), none
  duplicated, every one declared; the two sides of `searchIndex.ts` do not
  overlap (#83 changed comments, this branch adds `printedSpellings`); and #83's
  claim that no search offers Ask Muns runs over every query the walk types,
  this branch's `family` and `variant` included, because both sides extend one
  capture.

- **Then #80, #81, #82 and #84 landed together, and the family said to merge.**
  #81 took `10by`, which this section had stepped over for #79's sake, so that
  letter cost nothing. #80 took `10ca` — the letter this section held — and #82
  took `10cb`, so this section is **`10cc`**. Four pointers outside it moved (the
  `securityLabel.ts` entry in **Layout** and three under **Build**); every other
  `10ca` in this file and all four in the code are #80's and stay, and one line of
  this section's own history keeps `10ca` because it records the letter it held
  then. Four conflicts, each resolved by what each side MEANT:
  - **`tranches.ts`'s imports** — this branch's `securityLabel` beside #80's
    `fifoReturnPct`.
  - **The `monitor` block** — this branch's casing check beside #80's two FIFO
    checks (the capital-basis Invested and the footer's FIFO return), none dropped.
  - **The probe list** — main's per-route `TILE_MENU` / `TILE_PICK` maps (#82)
    kept as maps, this branch's `pickOptions` beside them: 91 keys, none
    duplicated, every one declared.
  - **This file** — main's `10ca` and `10cb` first, this section after them.

  `glowData.ts` and `BOOK-REPORT.md` were regenerated from the merged archive
  rather than trusted to the text merge, and `BOOK_SUMMARY` does not move.

  **AND THE SWEEP FOUND A CHECK THAT DID NOT KNOW THIS BRANCH'S LINE.**
  `monitor-open-all` — #79's route that opens every row on the Category axis —
  failed *"every row a row opened into has exactly the table's own columns"*. The
  page was right: the line naming the depository account that carries a name and
  holds none of it is a `treeLine`, one cell across the whole table, exactly like
  the route-split line and the fund look-through. The probe knew those three by
  name and not the fourth, so it measured a sentence as a one-column row. The
  kinds are one list now (`FULL_WIDTH`) read by both checks it feeds — the width
  check, which skips them, and the blank-line check, which holds them to saying
  something. The two had never been walked together: this branch's last full
  sweep was on `14cf81b` (#72), and `monitor-open-all` arrived with #79 after it.

#### #72's search bar, checked against the family's own complaint

#72 put a search box in the top bar — the search the family is most likely to
type into — so the complaint was re-run against it rather than assumed to hold.
It builds its list from the page's own holdings (`portfolio.positions`), so it
inherits one row per company and one name per row from this change. Measured on
the rendered list: "kaynes", "karur", "state bank" and "crompton" each find ONE
holding, named as every other page names it.

**IT FOUND THE ONE THING THE JOIN COST.** Typing "sbi" found nothing. The
depository prints State Bank of India as `SBI`, which is what people type; before
the join that spelling was a row of its own, and after it the row carried only
the canonical name. `printedSpellings(key)` in `securityLabel.ts` hands the
search every spelling the statements printed, so a row is FOUND by any of them
and SHOWN under one. With it removed, `searchIndex.test.ts` names three spellings
that stop finding their company — `SBI`, `The Karur Vys`, `Arvind Fashions
Limited` — and the sweep's search walk fails on the variant it derives (`SBI`).

**AND #72's SUITE HAD THE EXPOSURE SUITE'S GAP.** It built its index from the raw
statements while the page builds it from `PortfolioContext`'s names — a company
under whichever spelling its first row printed, a mandate in its manager's
capitals. `labelledPositions` and `labelledAccounts` are now the one naming step,
applied at `PortfolioContext` and by the suite: the treatment `heldFundVehicles`
got for the same defect an hour earlier, which is the argument for looking for a
defect's second copy the moment the first is found.

`build` · `tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` **38 suites, 1,963 checks, 0 failed** (one NOT CHECKED, and it is
main's: no scheme in this book both resolves in AMFI's file and breaks the NAV
basis gate) · `check:family` **86/0** · `check:pages` **218 combinations clean,
0 invariant failures** on the thrice-merged tree (base `14cf81b`), with seven
evidenced abstentions read out of `report.json` by route — four on the Morning
CIO panels (every KPI tile carries a figure), two on Private Market (every
private holding reports a cost) and one on the not-found drill-down — none of
them this change's own. Main's own sweep carries eight; the eighth, the pledge
claim on `stock-qty`, has a subject here (see above).

The count went 208 (merged with #73) → 214 (with #75: its 206 plus the eight
combinations this branch's four routes walk) → **218** (with #72: its 210 plus
the same eight). Each step reconciles only because the sweep was run again rather
than the count adjusted. On the same final tree `npm run build-book` regenerates
`glowData.ts` and `docs/BOOK-REPORT.md` byte for byte, and `rekey:archive`, the
four `replay:*` passes and `reconcile:review` are all no-ops with `--check`.

**On the tree merged with #80, #81, #82 and #84** (base `6453c99`): `build` ·
`tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` (every suite, #80's `fifo.test.ts` and this branch's
`securityNames.test.ts` among them, 0 failed) · `check:pages` over **238
combinations** with **two findings that are this merge's, both resolved**, and
three that are not:
- `monitor-open-all` — the probe above, fixed; re-run clean with
  `monitor-sold-elsewhere`, `monitor-section-closed` and `monitor-txn-out`.
- `monitor-txn-out` failed under load while a second sweep ran on the same
  machine — its Sells click landed before the Transactions view had settled —
  and passes on the same build run on its own, twice. Named rather than waved
  through.
- `private-market`, `private-market-tiles` and `private-market-returns` fail
  **on `main` too**, measured on a worktree at `6453c99`: #80 made a fund's HPR
  FIFO, and the sweep's re-expression still strikes it as value against cost.
  That is main's own check to move, not this merge's. *(Moved at Stage 10cj.)*

The ten NOT CHECKED lines are all main's evidenced abstentions: six Morning CIO
panels (every KPI tile carries a figure), two Private Market fund routes (every
private holding reports a cost), #79's redeemed private account (none is) and
the not-found drill-down's crumb.

### Stage 10cd — PURCHASE, REDEMPTION AND APPRECIATION, AND NO RETURN IS STRUCK ON A NET

*"Open PR and do not merge until it tell you to."* · *"Motilal Oswal Wealth
Delphi Equity Fund and Neo Infra Income Opportunities Fund I — Class A5 classify
both of these AIFs as Category 2 funds."* · *"the 'Held, and valued by no
statement' section needs to be hidden as a drop down list."* · *"how can net
invested be negative? … find the root cause … Make it purchase redemption and
appreciation and appreciation you can show as realised and unrealised gains
separately … Net invested amount is a wrong figure. We do not need to show
that."* · *"the returns that we are showing in transactions are also wrong."* ·
*"Just like in the holdings page, we have return methodology selector add the
same to the transactions page as well. With the same functioning."*

#### 1. The root cause: a redemption is principal AND appreciation

`Net invested` was **Capital in − Capital out**. A redemption is not principal:
it is what the redeemed units COST plus what they GAINED. So subtracting it from
what was paid in subtracts the appreciation along with the principal, and the
"principal" that remains is wrong by exactly the realised gain. On 3P that is the
whole account — ₹28.50 Cr paid in, every unit redeemed for ₹31.06 Cr — so its net
read **−₹2.56 Cr**: negative principal, which is the family's own question.
Nothing was misread; the column was the arithmetic of two real figures that must
never be subtracted.

**EVERY RETURN ON THE CARD WAS STRUCK ON THAT NET**, which is the second
complaint and the same defect: a return divided by a figure with the realised
gain already taken OUT of it is too large on every partly redeemed account and
meaningless on a fully redeemed one. Accounts with no redemption (the Sanshi
folios, both Transition trusts) happened to be right, because there the net IS
what was paid — which is exactly why the error survived on a table most of whose
rows looked fine.

So the capital block is now what the family asked for, and one identity ties it:

```
Committed · Purchase · Redemption · Realised · Unrealised · Value today

Purchase − Redemption + Realised + Unrealised = Value today
```

`Net invested` and `Gain` are gone. **Appreciation is a RESULT and appears only
as its two parts**; nothing is ever divided by a figure that contains it.

#### 2. The split, and the one case it refuses — which no fund in this book reaches now

`capitalRollup` in `src/lib/tranches.ts`. Appreciation = value + redemption −
purchase, over the account's WHOLE record, and its split has six honest cases:

| Case | Realised | Unrealised | Example |
| --- | --- | --- | --- |
| nothing came back | a COMPUTED ₹0 | all of it — value less the purchase, stamp duty included | Sanshi, Transition |
| nothing came back, but the fund reinvested a distribution | the distribution | value less what the units cost — the Holdings page's unrealised P&L | Buoyant 103473 |
| nothing is held | all of it | a COMPUTED ₹0 | **3P: +₹2.56 Cr realised** |
| a PMS mandate | the rest: booked gains, dividends, interest, less fees | value less the manager's own cost of everything held — the Holdings page's unrealised P&L for the same mandate | SVAN ×2, Green Lantern |
| a fund that paid back and is still held, and TYPES each payout | the income and equalisation it paid out | value less the purchase net of the principal it returned | **Neo Infra, Baring** |
| …and one that prints only an undated total | **refused** | **refused** | none in this book since Stage 10bw |

**A DISTRIBUTION THE FUND REINVESTED IS REALISED, THOUGH NO CASH MOVED** — and
it arrived with the merge of Stage 10bv, which gave Buoyant its dated record.
Buoyant 103473's 1 Apr 2026 allotment is ₹10 Cr paid and ₹10,00,58,861.66
invested: the ₹58,861.66 is a `Gain Distr.` the fund put straight back into units,
which its appraisal books as Income and the Holdings page counts in cost. Filed as
unrealised, the row read **+₹3.30 Cr against the Holdings page's +₹3.29 Cr for the
same fund** — two figures for one thing a click apart. It is realised now, and
the rest ties to the Holdings page's unrealised P&L to the paisa. It is visible as
an allotment worth MORE than was paid and only that; a fund's charges make one
worth LESS (Sanshi's stamp duty), and those stay in what the units cost.

**NEO INFRA'S SPLIT WAS WITHHELD, AND #72 IS WHAT LET IT BE STRUCK.** This change
first carried its ₹49.5 L as one UNDATED total and refused both its XIRR and its
split, because how much of a payout returned capital and how much was gain is
exactly what a total does not say. Stage 10bw (#72) then read every payout Neo
Infra and Baring print — dated, and TYPED by the fund as income, principal or
equalisation, each reconciled against the statement's own totals — for the
Private Market page, and nothing here used them. Merged, they are Redemption rows
on their dates (`capitalMovesWithCalls`), on or before each fund's own valuation
only: Neo Infra's ₹7.14 L dated 9 July is inside its 30 June value and is not
counted again, the rule `fundDatedRecords` applies. The split is then the fund's
own: principal is capital coming back, so realised is the ₹36.88 L of income and
equalisation, and unrealised is value less what the units still held cost —
**₹5.55 Cr less ₹4.86 Cr = +₹0.69 Cr**. The units say the same thing a second
way: 5,00,000 called at ₹100 and 4,85,837 held, so the ₹14.16 L principal redeemed
14,163 of them. The Holdings page prints the statement's cost, which is the whole
₹5 Cr called, so its unrealised reads lower by exactly that principal — the row's
hover says so.

**AND ITS XIRR AGREES WITH THE PRIVATE MARKET PAGE BY A SECOND MODULE**: Neo Infra
+16.68% and Baring −6.42% here, the same to the last digit as `pooledFundXirr` in
`fundReturns.ts` computes for the fund table. `capitalRecord.test.ts` holds the two
to each other, so the two pages cannot disagree about what one fund returned. The
undated-total refusal is still exercised, on a constructed fund, for the next
statement that prints only a total.

**WHERE APPRECIATION ITSELF IS WITHHELD, UNREALISED CAN STILL STAND** — a
drawdown fund that prints no distribution line (Carnelian Amritkaal, Delphi, both
Founders Fund folios, Baring) cannot say what came back, so appreciation cannot
be struck; but its units are held at a cost its statement prints, so value less
that cost is measurable and is shown, saying what it is struck against.

**AN ACCOUNT NO STATEMENT VALUES IS `—`, NEVER ₹0.** `valueOfAccount` returned
₹0 for an account with no positions, so India SME's and Sky Capital's folios
would have read as worth nothing — a measured zero standing in for an absent
measurement. It is `null` now and names the account's own `noPositionsReason`.

#### 3. A drawdown fund's dated calls are purchases

Thirteen accounts publish no capital RECORD but their commitment prints every
call, dated — `capitalMovesWithCalls` turns those into purchases (`fromCall`) for
exactly the accounts with no record, so nothing is counted twice. The table went
from 11 funded rows to **26** (13 from a capital record — Buoyant's two folios
joined it at Stage 10bv — and 13 from calls), and `Committed` is filled from the same commitment
(₹97.73 Cr across 15). A fund's dated payouts join them as Redemption rows (§2);
a fund that printed only an undated total would show it under Redemption,
dateless, and on the Sells side of the filter while being on no dated count — no
fund in this book does since Stage 10bw read Neo Infra's payouts dated.

**AND A CALL LIST MUST TIE TO THE STATEMENT BEFORE IT IS A RECORD.**
`contributionsAreComplete` accepts a call-derived record only where the calls sum
to the statement's own called (or drawn, or paid) figure within a rupee, and 3P's
own capital record is accepted as complete only because its running UNIT balance
starts at the first contribution — `BOOK_CAPITAL_FROM_INCEPTION`, generated by
`build-book` from the rows' own balances rather than asserted.

**AND THE SEVEN THAT HOLD NOTHING ARE AIFs ON THE CATEGORY AXIS.** India SME and
Sky Capital carry no valued position, so `forAccount` had no holding to read a
section off and filed all seven under "Not classified". Their ACCOUNT's
engagement is the statement's own wording (`Category I Alternative Investment Fund
– Angel Fund`), never defaulted, so on the Category axis it answers; on the
family's two axes it does not — a basket is the family's review, keyed on a
product this book holds no row for — and they stay named as not stated.

#### 4. The return methodology, on the family's own money

`capitalReturn(g, measure)` — the Holdings page's measures, struck on a capital
account rather than on a holding, and reading the SAME `?ret=` param through the
same picker, which now renders on both views. One column per ticked measure,
through the same `withReturnCols` placeholder, with the same header coverage
note:

- **HPR** — appreciation ÷ purchase. Never ÷ a net.
- **CAGR** — one purchase compounded over the years since; **refused on a
  staggered account** and saying XIRR is its measure, because a single-start rate
  treats every rupee as invested on the first date.
- **XIRR** — every purchase negative on its date, every dated redemption positive
  on its, the value today on the account's own report date. **Refused where a
  payout is undated**: solved without it, it is the fund's return as if it had
  paid nothing back.
- **YTD** only where the first purchase is inside the current year; **CY**
  absent everywhere — no statement values an account at a past year-end.
- **AUTO** is the family's rule: under a year HPR, a year or more CAGR for one
  purchase and XIRR for several. **Nothing is annualised over less than a
  year** — Stage 10g(ii)'s guard, where a 132-day return once read +99.0%.

3P reads **XIRR +6.49%** on the default view and **HPR +8.98%** on the Absolute
column — ₹2.56 Cr on ₹28.50 Cr paid, not on a negative net.

**AND THE FOOTER CARRIES NO RETURN, FOR THE SAME REASON THE HOLDINGS FOOTER
DOESN'T** — a sum of accounts has no single purchase date or flow set of its own.
Every return column's footer cell names that.

#### 5. Three defects found on the way, none of them asked about

- **THE DATE FILTER DID NOT WITHHOLD WHAT THE SIDE FILTER DID.** A reader who
  narrowed to one year got that year's purchases set against the account's WHOLE
  value today — a gain including every earlier year's money as profit. Both
  filters now withhold appreciation and every return, naming the filter.
- **THE MANDATE PAGE'S CONTRIBUTION TABLE printed each row's NET under a footer
  summing the GROSS** — two figures under one heading that did not add. It prints
  the gross Purchase and Redemption now, the net in the hover, and a summary line
  with the identity, HPR and XIRR.
- **AND IT CLAIMED A RETURN "NEEDS A VALUATION ON EACH DATE"**, which is false of
  a money-weighted rate — it needs the dated flows and one terminal value. That
  sentence is gone.

#### 6. Delphi and Neo Infra are Category II — declared, and fill-only

Neither prints a SEBI category on a field `readAifCategory` reads, so both sat on
NEITHER side of the book (Stage 10bp) and under "Category not stated" in the AIF
drill-down. `DECLARED_AIF_CATEGORY` in
`shared/aifCategory.mjs` is the family's declaration, keyed on `securityKey`,
dated, and cited — **Neo Infra's is corroborated by its own statement**, which
prints its SEBI registration `IN/AIF2/22-23/1042` (AIF2 is Category II) and whose
units the family's demat files as CAT II AIF; **Delphi's is the family's word
alone**, and says so (`corroboration: null`). It is a FILL-ONLY tier: it applies
only where both printed fields are silent, so a statement that prints a category
always wins, and the AIF drill-down's chip says "declared by the family" on the
two rows it placed.

*(Corrected at Stage 10cv: Neo Infra's statement does print its category —
`AIF -Category-II No : IN/AIF2/22-23/1042`, on its manager block — and its
reader reads it now. The declared tier places Delphi alone.)*

**THE CATEGORY DECIDES THE DRILL-DOWN SECTION, NOT THE SIDE OF THE BOOK — and
that is the merge with Stage 10bw, which is the right answer rather than a
compromise.** On its own, this declaration moved both funds to the private side
(private ₹37.88 Cr → ₹54.56 Cr), because Category II was private capital. #72
then committed the family's OWN placing of every fund by what it invests in, which
outranks any category: Delphi invests in listed equity, so it is a **Category II
fund on the listed side** — Motilal Oswal's Founders Fund is the same case, printed
Category II and placed listed — and Neo Infra is Category II and private. Merged,
the sides are #72's to the rupee (listed ₹699.76 Cr · private ₹10.62 Cr · not
placed ₹98,742, Blue Ashva alone), and what this declaration still decides is the
section each fund sits under on the AIF drill-down, and the chip that says the
family declared it. `fundMarketSideBasis` and `marketSideOf` now carry the
`securityKey` through, so the category a page reports beside the side is the
declared one where no statement prints any; `privateMarket.test.ts` and
`aifCategory.test.ts` assert Delphi stays off the private page and Neo Infra on
it.

`build-book` prints every declared holding on every run, and
`aifCategory.test.ts` asserts the declaration can never overrule a printed
category.

#### 7. "Held, and valued by no statement" is a fold

A `<details>` on the AIF drill-down, collapsed, whose summary still carries the
count, the sections and the drawn capital — so a reader who never opens it still
learns Category I exists and what was paid into it. `check:pages` asserts the
fold AND that the summary names what it hides.

#### The verification

`src/lib/__tests__/capitalRecord.test.ts` — the identity on every row that states
all four, HPR's denominator, 3P against an independent bisection XIRR, Sanshi,
the PMS unrealised equal to the holdings P&L, Neo's and Baring's split from their
typed payouts and their XIRR against `fundReturns.ts`, the undated-total refusal
on a constructed fund, calls against a record, an unvalued account never ₹0, the filters, the
sub-year guard. `check:pages` gains `monitor-txn-returns` (every measure ticked)
and re-homes the transactions invariants onto cell HANDLES
(`data-mine-cell`, `data-realised-gain`, `data-unrealised-gain`,
`data-return-cell`) and header LABELS — the positional reads (`tr.cells[2]`,
`foot[9]`, `tie(2) && tie(7)`) all moved when Committed arrived in front, and
**two of them went on passing while reading the wrong column**: `tie(2)` became
the commitment and `tie(7)` the value, both of which tie to their own rows.

**SEVEN BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK** — HPR struck on the net,
XIRR dropping the redemptions, CAGR allowed on a staggered account, sub-year
annualised, `Net invested` back as a header, the category fallback removed, and
realised/unrealised swapped on the fully redeemed account. **The first came back
CLEAN**, which is the finding: the HPR check filtered on `data-return-tag`, and
the Absolute column carries NO tag because its header already names it — so the
check could only see the auto column's sub-year rows, whose redemption is nil,
where a return on the net and one on the purchase are the same number. It picks
the column out by measure as well now, and the two return claims are spread into
both routes, because on the default view the account they were written for shows
its XIRR rather than its HPR.

**AND AN EIGHTH, FOR THE CASE THE MERGE CREATED** — Buoyant's reinvested
distribution filed as unrealised again — fires three `capitalRecord.test.ts`
checks: realised is not the distribution, unrealised is not the Holdings page's
figure, and it IS value less the cash paid.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 42 + 44 + 30 + 29 + 22 + 140
(2 not checked, 0 blocked) · `test:family` · `check:family` **86/0** ·
`check:pages` **218 combinations clean, 0 invariant failures**, MEASURED ON THE
TREE MERGED WITH #79 — #79's own three new routes (`monitor-open-all`,
`monitor-section-closed`, `private-market-transactions`) plus the two
combinations `monitor-txn-returns` walks, the only route this change adds. (It
read 202 on the tree merged with #70 and #73, 208 with #75 and 212 with #72; each
step reconciles only because each was re-run.) The nine NOT CHECKED lines were
read out of `report.json` BY NAME and every one is pre-existing: the absent-KPI-tile
claim on the four Morning CIO routes, the cost-less fund row on the two Private
Market fund routes, #79's own redeemed-to-nil claim on `private-market-folios`
(no private account in this book is redeemed to nil — Stage 10bx records it), the
crumb on `holdings-unknown` and the pledge on `stock-qty`. **Not one of this
change's own checks abstains.** `npm run build-book` regenerates `glowData.ts`
and `docs/BOOK-REPORT.md` BYTE-IDENTICALLY, run as a control on the merged tree,
and `replay:calls`, `replay:flows`, `replay:owners` and `replay:movements` are
each a no-op with `--check`.

#### Merged with main — and the letter moved SEVEN times before it held

This section was going to be `10bt`; **#70 and #73 landed on main while it was
being verified and took `10bt` and `10bu`**, so it became `10bv`. The PR was then
open and green when **#75 — Buoyant's carried cost — landed and took `10bv`
too**, and the section became `10bw`; then **#72 took `10bw`** and it became
`10bx`; then **#79 took `10bx`**, and **#83 took `10bz`**, so it was `10ca` until **#80, #82 and #76 took `10ca`, `10cb` and `10cc`** (the subsections below), and it is **`10cd`**. Every time it was caught the same way: the
letters on main's TIP compared against the branch's own at the moment of merging,
not against the base the branch was cut from. Main keeps all three.

**THE REFERENCES WERE CLASSIFIED ONE AT A TIME, NOT SWEPT.** Fourteen code
comments cited this change by its drafting letter `10bt`, which on main is the
Polycab and Sector Composition stage — each was checked against main's own copy of
its file before it moved. In this file `10bv` is now main's, so the two Layout
bullets were split by subject: the `carriedCostOf` and `classSwitch.mjs` lines
stay on `10bv`, the capital split and the declared AIF category move to `10bw`.

**#75 TOUCHED EVERY FILE THIS CHANGE DOES, AND THREE THINGS NEEDED MORE THAN A
TEXT UNION:**

- **`txnAxis.forAccount`** — main set a ₹0 line aside so Buoyant's empty cash
  sleeve stopped making its folios "mixed"; this change files an account holding
  nothing under AIF on the Category axis when its own statement says so. Both
  rules stand in one function, and main's `txnAxis.test.ts` case *"an account
  holding nothing at all is not filed"* was split rather than deleted: it still
  holds for an account whose statement names nothing (a new `f6`), and two new
  cases pin the engagement rule to the Category axis ALONE.
- **Buoyant's reinvested distribution** — see §2. Main's carried cost counts it in
  what the units cost; this change's split had filed it as unrealised, which put
  the Transactions row ₹58,861 away from the Holdings page. That is a defect the
  MERGE created and neither side had alone, and `capitalRecord.test.ts` now ties
  the two surfaces by a second path; putting the old split back fails three checks.
- **The `ctx` literal auto-merged**, which is when it is most dangerous — checked
  by hand: **84 keys, the exact union of both sides**, main's `costCarried` among
  them, none duplicated.

Buoyant's two folios joined the table with their dated record (Purchase ₹46.00 Cr
and ₹24.85 Cr, XIRR +15.30% and +9.76%), and `BOOK_CAPITAL_FROM_INCEPTION` gained
Buoyant 103473 — its A1 balance is printed from zero. `glowData.ts` and
`docs/BOOK-REPORT.md` were REGENERATED rather than text-merged, and differ from
main's by this change's own additions alone.

#### …and a fourth time: #72 took `10bw`, and it changed what two of this change's claims MEANT

**#72 — Private Market returns by measure, the family's own fund split, and a
search box — landed while this change's sweep was running**, and took `10bw`.
Main keeps it; this section became `10bx` (and then `10ca`, below). Seventeen code comments and one Layout
pointer were this change's and moved; the four in `fundReturns.ts`,
`privateMarket.ts`, `replay-capital-calls.mjs` and the search block are #72's and
did not. The `ctx` literal is the exact union again.

**TWO THINGS COULD NOT BE A TEXT UNION, AND BOTH ARE IMPROVEMENTS THIS CHANGE DID
NOT HAVE ON ITS OWN:**

- **The side of the book.** #72's `FAMILY_MARKET_SIDE` outranks any category, so
  this change's declared Category II decides the AIF drill-down section and not
  the side — §6. `fundMarketSideOf`, `fundMarketSideBasis` and `marketSideOf`
  carry `securityKey` so the declared category reaches the read; the book's sides
  are #72's to the rupee, and main's `marketSide.test.ts` case *"prints no
  category of its own"* is now struck on the read's SOURCE (never a statement),
  because the read carries the family's declared category.
- **Neo Infra's payouts.** #72 reads them dated and typed; this change had them
  as one undated total and REFUSED the XIRR and the split — a refusal the Private
  Market page one link away contradicted by striking both. They are Redemption
  rows now, the split is the fund's own typing, and the two pages' XIRRs agree to
  the digit (§2). The refusal's own check was INVERTED rather than deleted: the
  page check asserts dated payouts carry an XIRR and an undated total none, and a
  new one re-derives the split from the book's typed payouts. Dropping the dated
  payouts fires 8 suite checks and 2 page checks.

**AND THE IDENTITY CHECK WOULD HAVE COUNTED NEO INFRA'S PAYOUTS TWICE**: it added
the fund's printed distribution total on top of its dated moves for every
call-derived account. It adds it only for an UNDATED total now, and the page
check's own re-derivation of the record (`CAPITAL_RECORD_BOOK`) carries the dated
payouts by the same before-the-valuation rule.

#### …and a fifth time, at the moment of merging: #79 took `10bx`

**The family said "merge to main", and main had moved.** #79 — Private Market
and the Portfolio Monitor as one master table each, a row opening into rows of
the same table — landed after this PR's last green sweep, left it conflicted,
and took `10bx`. Main keeps it. #79's own section says *"the Portfolio Monitor's
stage is `10by`"* and no `10by` section exists yet, so that letter reads as
reserved; this section skipped it and is **`10ca`**, so a later `10by` cannot
silently land on the Transactions stage. All twenty code references to this
change's letter were this change's own and moved; main's code carried none.

**TWO FILES CONFLICTED, AND ONE WAS A DESIGN QUESTION THE ASK ALREADY
ANSWERED.** #79 gated the return picker to the Holdings view and put its
Expand-all control beside it; this change renders the picker on BOTH views, which
is the family's own request (*"add the same to the transactions page as well"*).
Both stand: the picker renders on both, and Expand all stays on Holdings, where
the tree rows it opens are. The Transactions table is not a TreeTable in #79 and
is untouched by it; its checks were re-run rather than assumed.

**AND THE REST WAS CHECKED BY HAND, BECAUSE A CLEAN SIDE OF A MERGE IS WHEN TO.**
The `ctx` literal is 85 keys, the exact union less #79's own deliberate removal of
`schemeCalls`, every key naming a declaration. The stage headings differ from
main's tip by `10ca` alone, with main's ten historical duplicates unchanged.
`npm run build-book` regenerates both generated files to the same md5 as before
the merge, and the full sweep is the 218 above.

#### …and a sixth time, in the minutes after the #79 merge: #83 took `10bz`

**The #79 merge was verified, recorded and pushed, and main had moved again.**
#83 — Ask Muns off the top bar — landed in between and took `10bz`, the letter
this section had just settled on. Main keeps it; `10by` is still the one #79's
text reserves, so this section is **`10ca`**. The two sections were inserted at
the same place, so git marked the conflict — the safer failure mode — and it
was resolved by placing main's section first. Every line naming `10bz` was
classified against main's own copy of its file before any moved: **twenty code
comments and seven lines of this file were this change's and moved; eleven code
comments and five lines of this file are #83's and stayed.**

**NOTHING ELSE OVERLAPPED IN INTENT.** #83 changes the top bar, the search box
and `check-pages.mjs`; the last auto-merged, so its `ctx` literal was read
rather than trusted. #83 touches no generated file, and `build-book` was run as a
control anyway.

#### …and a seventh time: #80, #82 and #76 took `10ca`, `10cb` and `10cc`

**The family released four PRs at once, and main had moved four times since this
one's last merge.** #80 (FIFO everywhere) took `10ca` — the letter this section
held — #82 (KPI tiles) took `10cb`, and #76 (one company, one name), merged first
of the four, took `10cc`. So this section is **`10cd`**. Twenty code comments
cited `10ca` for this change and moved; the four `10ca` comments in main's code
are #80's and stayed. The page conflicts were each resolved by what the side
meant: `MandateHoldings`' imports are the union, and the dated table on the
Portfolio Monitor takes this change's columns beside #80's FIFO figures.

**#80 GAVE NEO INFRA A CAPITAL RECORD, AND THAT DROPPED ITS PAYOUTS FROM THIS
TABLE WITHOUT A CONFLICT MARKER.** FIFO needs Neo Infra's own unit record — its
six drawdowns and the ₹14.16 L capital redemption — so #80 put it in
`BOOK_CAPITAL_MOVES`. `capitalMovesWithCalls` added a fund's dated payouts only
where the account had NO record, so the moment it had one, every payout it
published left the card: its income and equalisation reached no column, its
split was refused, and its XIRR fell out of step with the Private Market page's.
Every file merged cleanly; the suite is what said so.

A unit record lists what bought and redeemed UNITS and nothing else, so it cannot
double a distribution. A recorded fund keeps its payouts now: the one payout its
record already carries — the principal — is TYPED on the record's own row (same
date, same amount) rather than added a second time; a principal the record does
not show is left to the record, which is the authority on units; and a payout
beside a record is not marked `fromCall`, because its purchases never came from a
call list. Neo Infra reads redemption ₹51.04 L, realised ₹36.88 L, unrealised
₹69.15 L — which is now the Holdings page's own FIFO unrealised P&L, where before
#80 the two sat ₹14.16 L apart — and XIRR +16.68%, the Private Market page's to
the digit. `capitalRecord.test.ts` holds a recorded fund to the same checks as a
call-derived one (LOAD-BEARING: the book must carry both kinds) and ties Neo
Infra's unrealised to the Holdings page's by the book's own positions.

**AND THE SWEEP'S COPY OF THAT RULE HAD TO MOVE TOO.** `CAPITAL_RECORD_BOOK` in
`check-pages.mjs` re-expresses the card's record off `glowData.ts`, and it still
skipped a recorded account whole. So on the merged tree the counter beside the
table, *"Purchase − Redemption + Realised + Unrealised = Value today"* and the
XIRR re-solve all failed a page that was right — and once it carried the payouts,
the payout-type split failed next, because it left out the principal typed on
the record's row. It mirrors the page now: the typing rides on the record row,
the split counts it, and a fund with any untyped payout must show its split
refused, as the page does. A rule written twice has to be moved twice.

**THE FULL SWEEP ON THE MERGED TREE** walked 240 combinations and found six:
- `monitor-txns` (two) and `monitor-txn-returns` — the checker's copy of the rule
  above; re-run clean with `monitor-txn-in`, `monitor-txn-out` and
  `monitor-txn-basket`.
- `monitor-open-all` — #76's full-width line, which that PR's final commit taught
  the probe and this merge brought in; re-run clean with `monitor-sold-elsewhere`.
- `private-market`, `private-market-tiles` and `private-market-returns` — **fail
  on `main` too**, measured on a worktree at `6453c99`: #80 made a fund's HPR
  FIFO and the sweep's re-expression still strikes it as value against cost.
  Main's check to move, not this merge's. *(Moved at Stage 10cj.)*

The ten NOT CHECKED lines are main's evidenced abstentions, as on #76. `build` ·
`tsc` · `test:ingest` (golden 140 passed, 2 not checked, 0 blocked) ·
`test:family` 0 failed · `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` byte for byte on the final tree.

