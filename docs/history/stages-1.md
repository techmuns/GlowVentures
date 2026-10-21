# Stage history, part 1 (Stage 10 → 10aq)

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 3536–8938). CLAUDE.md now carries the condensed rules; this file is the record. -->

## Stage 10 — the family-input layer (`src/lib/familyInputs.ts`)

Layers 3, 4 and 5 of the spec were never blocked on a vendor. They were blocked
on the FAMILY: an IPS target weight, why a position is owned, what would make
them sell it, what should raise an alarm. No API has ever known any of that, so
those three screens sat as previews waiting for a feed that could not exist.

`familyInputs.ts` is the store that unblocks them, and it extends the rule
`watchlist.ts` set: **nothing here may ever reach `glowData.ts`**, which is
generated from `source/` and must regenerate byte-identically.

**AN UNSET FIGURE IS `null`, NEVER 0**, and here it matters more than anywhere.
A target weight of zero is a real instruction ("hold none of this"); a target
nobody entered is the absence of one. The GAP — actual minus target — is the only
number on that page anyone acts on, so a gap computed against a defaulted zero is
a fabricated instruction to sell. Both halves must exist or the cell is `—`.

**THE BUCKET MAPPING IS THE FAMILY'S TOO.** Growth / Liquidity / Tactical / Hedge
/ Charity are not properties of a security; nothing in the archive says the AIF
book is "Growth" rather than "Tactical". The family maps ASSET CLASS → bucket —
four or five decisions instead of one per holding — and an unmapped class
contributes to no bucket and is NAMED, so a partial mapping yields a partial
actual rather than a wrong one.

**EXPORT / IMPORT, because `localStorage` alone is not good enough here.** The
watchlist states its per-browser limitation and leaves it. An IPS and a set of
theses are the family's own record, and a cleared browser would lose them with no
way back — so the whole store round-trips through one JSON file. Everything
re-enters through `coerce`, so a hand-edited file cannot put a malformed number
into the GAP analysis. **One file carries the WHOLE store** — charter, IPS
targets, bucket mapping, theses, alert rules, the deal register and the household
balance sheet. A partial export looks like a backup and loses the rest.

### Stage 10b — what else was waiting on the family, not on a vendor

Four more screens carried an absence whose stated cause was a missing feed, and
in each case the real cause was that nobody had asked the family. **An absence
recorded against the wrong cause is worse than a gap: it tells a reader to stop
looking for something they could supply in ten minutes.** The same discovery the
IPS made, applied to what was left.

**`src/lib/deals.ts` — the private deal register.** The AIF and drawdown
statements report a FUND's capital account; they say nothing about the companies
underneath — what was committed to which company, at what pre-money, for what
fully-diluted stake, and whether the last round diluted it. That is a
shareholders' agreement and a cap table, which no statement issuer holds and no
reader can extract. **Everything derivable is derived**: amount invested is the
SUM of the tranches entered, pending to invest is the commitment less that sum,
stake value is the post-raise stake times that round's post-money. None can be
typed, so none can disagree with its own inputs. A deal with no tranches recorded
shows `—` for invested, **not ₹0**, and therefore `—` for pending rather than
reporting the whole commitment as cash to find. Attachments are REGISTERED, not
stored: what a document is, its date and where it lives — a browser is the wrong
home for signed PDFs, and the page says so. The illustrative tracker preview
still renders on an empty book and **disappears the moment a real deal exists**,
because a sample beneath a table a reader has just learnt to trust is worse than
one standing alone.

**`src/lib/household.ts` — the balance sheet, the advisers, the decisions.** Net
worth, cash available, liquidity coverage and the charity pool were the four
Family Dashboard tiles whose reasons read "no bank statement in this drop", "no
outflow schedule has been supplied". Net worth = the measured portfolio + entered
assets − liabilities, and **the caption says how many register lines it spans** —
a net worth over one bank balance reads exactly like a complete one. Liquidity
coverage needs BOTH halves: cash with no schedule is not unlimited coverage and a
schedule with no cash is not zero months. A recurring outflow counts once per
occurrence inside the window, not once in total. **An amount of ZERO is accepted
and stored here**, unlike every price field in the codebase: a bank account at nil
is the measurement that turns coverage from unknown into a hard zero.
Tangible/intangible follows from the KIND, never a per-row judgement.

**The benchmark stays unchosen until the family chooses.** The harvest store
carries twelve indices, so the tile's old reason ("no index history endpoint") is
no longer true — but defaulting to the Nifty would put a comparison on screen
nobody agreed to, and this book is 62% private by value. The picker offers only
series the store actually carries, so a chosen benchmark always has a measurable
return.

**The decisions queue is real and still contains only what somebody typed.**
Nothing generates an item. Its predecessor was a preview that named two of this
book's own managers and asserted a pending approval — a reader who sees an item
on a decisions queue either acts or worries. An empty queue now says nothing has
been ENTERED, which is not the claim that nothing is outstanding.

**`Bucket.weight` on the Family Dashboard reads the mapping.** That card drew
invented weights summing to 100%, was corrected to show every bucket absent, and
then stayed absent whatever the family entered — wrong in both directions for the
same reason: it was not reading the one place the answer lives. It calls
`bucketActuals` now, like Exposure & IPS. *(Both surfaces have since been
removed — the Family Dashboard at Stage 10f, Exposure & IPS at Stage 10bc — so
`bucketActuals` is a documented no-caller today. The defect it records is a
LIVE rule and the reason the helper is kept: a card that re-derives an answer
instead of reading the one place it lives is wrong in both directions.)*

**Two suites check this, and they check different things.**
`npm run test:family` asserts the arithmetic (43 cases in
`src/lib/__tests__/familyMath.test.ts`); `npm run check:family` seeds a register
into a real browser and reads the rendered figures back. Both are needed:
`dedupedPositions` sat in `analytics.ts` correct and called by nothing for as long
as no drop contained a duplicate, and **a helper that returns the right number
into no caller looks exactly like a working feature.**

### Stage 10f — THREE OF THESE SCREENS HAVE SINCE BEEN REMOVED

The family asked for the **Family Dashboard** (`/household`), **Private Markets**
(`/private`) and the **Data Bank** to go: this book holds no private-market DEALS
to track, and every AIF folio it does carry is already in Portfolio Monitor's own
AIF section — folio for folio, same invested, same current value, same gain,
verified before the page was deleted. The only figures Private Markets showed
that the Monitor does not are the per-fund MANAGER column (the fund names carry
it) and the undrawn commitment, which is on Morning CIO's Dry powder tile and its
Capital deployment card.

**THE STORES STAY AND THE ARITHMETIC STAYS ASSERTED.** `deals.ts` and
`household.ts` still exist, `familyInputs.ts` still holds what was entered, and
all 43 cases in `familyMath.test.ts` still run. What is gone is the rendering.
*(The ONE export file this sentence relied on lost its buttons with Exposure &
IPS at Stage 10bc — so "keeps it and can export it" below was true when written
and is now half true: they keep it, and there is no longer a screen that hands
it back.)* A family that had entered a balance sheet or
a deal register keeps it and can export it; deleting the model to match the UI
would have thrown their data away for a layout decision.

`check:family` lost the checks that read those pages, because it checks
RENDERING and there is nothing left to render — but it gained the assertion that
each removed route now REDIRECTS (`/household` → `/family`, `/private` and
`/data-bank` → `/monitor`) rather than breaking a bookmark. **A removal is
verified by asserting it happened, never by deleting the test alongside the
feature.**

**AND `/private` NOW FORWARDS TO `/private-market`, WHICH IS NOT THIS PAGE
COMING BACK — see Stage 10m.** The fund-of-funds tracker described above is
still gone and its six source arrays are still empty. What stands at the new
address is a different page over a different set of facts, and the redirect
moved because leaving it pointed at the Monitor while a live Private Market page
exists one link away is a stale routing decision — the same one Stage 9d removed
the day the calendar was wired. `/look-through`, `/funds` and `/value-creation`
were tabs of the removed page and follow it; `/data-bank` and `/household` do
not move, because neither is about private markets.

### Stage 10m — PRIVATE MARKET, and the money no other screen could show

*"there's no private market data anywhere on the dashboard. Make a new page below
portfolio monitor, 'Private Market' … whatever information for private markets is
there in the files, show that."*

Stage 10f removed a private-markets page and this adds one, so the difference has
to be stated plainly or the next session will read the pair as a reversal. **The
removed page rendered `portfolio.privateMarkets` — `BOOK_PE_FUNDS`,
`BOOK_PREIPO_FUNDS`, `BOOK_UNLISTED_COMPANIES`, `BOOK_DEBT_FUNDS`,
`BOOK_CLOSED_FUNDS`, `BOOK_STARTUPS`, all of them still `[]`** — so it drew a
₹0-invested private book and a deployment bar 100% undrawn against nothing
committed. Every one of those reads as a measurement. `PrivateMarket.tsx`
imports none of them, and never `src/lib/privateValue.ts`, whose helpers return
`0` rather than `null` for an empty input. ~~Those absences are the last card on
the page, each named with what would fill it.~~ **THAT CARD IS GONE since Stage
10bf**, at the family's request; the IMPORTS are what the rule was ever about and
they are unchanged, which is why nothing on the page moved when the card went.

What the page shows instead is what the statements actually carry:

| | |
| --- | ---: |
| AIF holdings, deduped / raw | **19 rows ₹352.35 Cr** / 21 rows ₹355.52 Cr |
| Distinct funds · accounts · owners | 14 · 29 · 6 |
| Cost, and the rows reporting one | ₹293.73 Cr on **15 of 19** |
| Capital accounts: committed / drawn / still to call | ₹97.73 Cr / ₹81.75 Cr / **₹15.98 Cr on 13 of 15** |
| **Drawn against no valuation** | **₹18.23 Cr across 7 accounts** |

**THE AXIS IS `isPrivateClass`, NEVER `Account.engagement`.** Keying on the
engagement would be wrong in both directions on this book: three private
holdings sit in accounts whose engagement is `Distribution` (both 360 ONE CRNs)
or `Direct` (the ICICI NSDL row), and both Buoyant accounts carry engagement
`AIF` with a cash sleeve row that is not a private holding. The one question
engagement DOES answer is the opposite one — an account holding nothing has no
position to read a class off — which is why `unvaluedAccounts` is scoped to it.

***AND `isPrivateClass` IS NOT THE ASSET CLASS ANY MORE — see Stage 10bp.*** It
reads the SEBI category the statements print, so the **figures in the table above
are the pre-10bp ones**: the Category III folios (Sanshi, Buoyant, Carnelian
Bharat Amritkaal) are listed exposure and are not on this page. The page is
5 deduped rows / 7 raw and ₹37.88 Cr now, the ₹3.17 Cr double count below is
still all of it, and the funds that left are NAMED on the page with their value
and where they are shown. The reasoning above is unchanged and is why the axis is
the HOLDING's and never the account's. *(Since Stage 10bw the family's own
placing decides first: 4 funds, 4 deduped rows / 6 raw, ₹10.62 Cr — Founders
left for the listed side and Neo Infra joined. The double count is still all
₹3.17 Cr of it.)*

**THE WHOLE OF THIS BOOK'S DOUBLE COUNT IS PRIVATE.** Both duplicated holdings —
360 ONE Special Opportunities under two CRNs, Transition Venture Fund I under
both trusts — are on this page, so ₹3.17 Cr of ₹3.17 Cr. Getting the dedupe
backwards here is guaranteed to be wrong in one direction or the other, and both
directions have shipped before. The fund view counts each group once, the folio
and per-owner views do not, the page STATES the difference, and two invariants
assert it from opposite ends: a page that deduped everything passes one and fails
the other. *(Those three were stacked cards until Stage 10bf, one card with a
toggle from then, and since **Stage 10bq** the FOLIO half is a row expansion
under the fund it belongs to — the family's own ask, and the right shape: a
folio is not another slice of the private book, it is what a fund row is made
of. NOTHING ABOUT THE BASES HAS CHANGED THROUGH ANY OF IT — which is exactly why
each view keeps its own title and its own footnote, why the expansion names the
₹3.17 Cr overlap on the two rows that carry one, and why the two invariants moved
to the surfaces that draw them rather than being softened.)*

**₹18.23 Cr IS THE REASON THE PAGE EARNS ITS PLACE.** India SME's three folios
and Sky Capital's four report units and the capital drawn against a commitment
and no valuation anywhere. That money is real, paid, and appears on no holdings
table in this app — and it must never be added to a market value, because
contributions are what was PAID and not what the stake is WORTH. It has its own
tile, its own card and a footer saying it is in no total on the page.

**Two of the page's own checks were tautologies, and reintroducing the bug is
what found them.** The first draft computed the fund table's footer independently
of its rows, so building the rows from the raw set left every row carrying the
double count while the footer went on printing the deduped total — each figure
correct on its own terms, and no check able to see it. The footer is summed FROM
the rows now. The second compared the drawn-against-no-valuation tile against
another rendering of the same variable and passed while the tile was halved; it
reconstructs the tile from the table's rendered rows instead. **A check that
compares a figure with its own copy cannot fail**, which is this file's own rule
arriving through arithmetic rather than through prose. All eight invariants were
verified by reintroducing their bug and watching each fail.

`npm run test:family` carries the arithmetic (`privateMarket.test.ts`), anchored
on the deduped private total equalling **`BOOK_SUMMARY.privateValue` to the
rupee** — two independent paths to one figure, so it cannot go stale when the
next drop moves the book.

### Stage 10n — THE DEFAULT VIEW IS THE ZOOMED-OUT ONE

*"When I do ctrl -- the view becomes better and realigned. I want the zoomed out
view presentation without doing ctrl --."*

That is a defect report, not a preference. At 100% the Portfolio Monitor's filter
bar wraps its two buttons onto a second row, the Entity column breaks
`AJAY JAISINGHANI · V.E.C 128005` across two lines, and a wide table loses its
last column to the scroller. Zooming out buys CSS pixels and every one of those
goes away — so the reader was correcting a layout that did not fit, on every
visit.

**`--app-zoom` IN `index.css`, AND NOTHING ELSE MOVES.** One custom property,
`0.875` at ≥1024px, applied to `#root`. `zoom` is what browser zoom itself does:
it REFLOWS at the new scale, so the filter bar genuinely fits on one row. A
`transform: scale()` would shrink the picture and leave the layout believing it
was still 1500px wide — the wrap would stay, just smaller. Every px size in the
components is untouched; set the variable to 1 and the app is what it was.

**TWO THINGS ABOUT `zoom` THAT WERE MEASURED RATHER THAN REASONED**, because both
first drafts were wrong in ways that render:

- The obvious `height: calc(100% / var(--app-zoom))` is a DOUBLE compensation.
  Chrome already resolves a percentage height inside the zoomed coordinate
  space, so `100%` of a 900px viewport is the 1028px that paints back to 900.
  Dividing again gave `#root` a used height of 1028px against a 900px window and
  a permanent scrollbar on pages that fit.
- **Nothing in the zoomed subtree may be sized in `vh`.** A viewport unit is not
  rescaled by zoom, so the shell's `h-screen` painted at 100vh × 0.875 — a 787px
  app in a 900px window, with a dead band under it that reads as a rendering
  fault. The shell, the sidebar and the error boundary are `h-full` now, which
  chains off the `height: 100%` on html/body/#root. A future `min-h-screen`
  anywhere under `#root` brings the band straight back.

### Stage 10o — THE YEAR'S TRADING IS TWELVE LINES, NOT FOUR HUNDRED AND SIXTY-TWO

*"Show the year's transactions as one line per entity / manager / instrument, not
a raw tape. I will only see five items — Buoyant, VEC, Carnelian and the direct
stocks — then I can drill down."* And, separately: *"Bandhan mutual fund
staggered for the last seven eight months… I want to see that as one line item
and then drill down."*

Those are one request. A raw tape answers "what happened on 13 August"; a family
office asks what each manager did this year. This book's own tape makes the
point: Green Lantern bought The Anup Engineering on **fifty separate days across
five months**, in two accounts — a hundred rows for one decision, and reading
that tape a reader cannot see the decision at all. Measured over the PMS
transaction statements, **60 (account, security, side) groups carry four or more
dated rows.**

`src/lib/txnRollup.ts` collapses it in three levels — group → instrument →
tranche — and `TransactionsView` renders them expandable, with **By manager**
(the default), **By entity**, **By security** and **Tape**. Tape stays because a
reconciliation against a PDF needs the printed rows in printed order.

*(**THE TAB GROUP IS GONE SINCE Stage 10bg** — the family asked for the
transactions card to section the way the holdings table does, so the GROUPING is
the shared axis now and `rollup`'s `by` is `auto`: a mandate rolls up to its
manager, everything else to its security, which is what the Holdings table
already did per section. The three levels are unchanged. Tape's own reason
survives on the surface that actually serves it: `/audit` prints each statement's
extracted rows in printed order, document by document, which is what a
reconciliation against a PDF needs and what a rollup never was.)*

**THE STAGGERED ASK NEEDS NO DETECTOR, AND THAT IS THE POINT.** Grouping by
instrument collapses a series whether it was a monthly SIP, a broker working an
order over five weeks, or two unrelated buys. A DETECTOR would have to decide
what counts as "a series" — a cadence, a tolerance, a minimum count — and every
one of those thresholds is a judgement the statements do not state, applied to
real money. `staggered` is therefore a LABEL on a row that is already collapsed
(≥4 rows on one SIDE, so four buys and four sells is two campaigns rather than
one series of eight), never a decision about what to merge. Getting the
threshold wrong costs a chip, not a figure.

**AND THE FAMILY'S OWN EXAMPLE IS NOT IN THE BOOK — measured, and stated.** The
Bandhan rows in this corpus are in the Motilal Oswal DEMAT transaction
statements, and `precedence.mjs` deliberately excludes those from `transactions`
(*"a depository movement is not a trade"*). Checked rather than assumed: the
demat rows carry `side: "delivery"`, `unitPrice: null`, `net: null`, and the
Bandhan entries are `positionsAsOf` **closing balances** (`opening: 0 →
quantity: 3,371,575.697`), not dated tranches. **No statement in this book
carries those purchases date by date.** The card's footer says so — the tape
reads transaction statements only, because a depository moves units without a
price, a counterparty or a consideration. What would fill it is the folio's own
AMC account statement or a CAS.

**`settledAmount` ENDED `?? 0`, AND THE ROLLUP IS WHAT MADE IT MATTER.** A row
whose statement prints no settlement, no net and no gross reported the SAME
figure as a trade that settled for nothing. The tape got away with it by testing
`t.amount ? … : <AbsentCell>` at the point of render — the absent-vs-zero rule
enforced by a falsy check in the presentation layer rather than by the model.
The moment those amounts are SUMMED a `?? 0` blends an unreported trade into a
total as if it had cost nothing. `Txn.amount` and `Txn.price` are
`number | null` now, every rollup total uses `sumOrNull`, and each carries a
COVERAGE COUNT — a realised total over 13 of a manager's 18 sells is a different
fact from one over all 18, and on screen they are the same number.

**NET INVESTED NEEDS ONE DISTINCTION TO BE HONEST.** A side with NO ROWS
contributed a measured zero — nothing was sold, so the net is what was bought. A
side WITH rows whose statements report no settlement contributed nothing
measurable, and subtracting it as zero reports a net the book cannot strike. The
two are identical under `(bought ?? 0) - (sold ?? 0)`.

**THE GROUP LABEL GOES THROUGH `mandateLabel`, AND THE PROVIDER IS ALWAYS ON THE
SECOND LINE.** Re-deriving `strategy || provider` inline is how
`mandateLabelWithOwner` came to exist and be called by nothing while the monitor
drew four pairs of identical rows beside it. The provider rides in the sublabel
because a strategy name is whatever the manager printed: Molecule's is the single
word `GROWTH`, which as a heading over a year's trading names nobody.

**AND EVERY FIGURE SITS UNDER A HEADING THAT DESCRIBES IT.** The first draft drew
the tranche rows across the group table's columns by position, which put a
per-share price under `Bought` and the settled amount under `Sold`, and net units
under `Securities`. A caption asserting something of a figure that is not true of
it is the failure the Morning CIO's "cost in · listed only" tile already cost
this book once. Quantity and unit price ride with the date now (`228 @
₹3,086.88`); a tranche's amount lands in Bought or Sold by its own SIDE.

**SEVEN INVARIANTS AND THIRTY ARITHMETIC CASES, each verified by reintroducing
its bug.** `src/lib/__tests__/txnRollup.test.ts` runs against FIXTURES, because
the traps are `?? 0` on inputs that are absent in ways this drop may or may not
contain. `check:pages` walks `monitor-txns` and a new `monitor-txn-drill` route
that expands every manager and then the LONGEST staggered series, asserting on
DOM counts rather than prose: the footer must tie to the tape's own buy/sell
counter (a path that never touches the rollup), the realised total must name the
fraction of sells it covers, and the expansion must produce at least one dated
row per trading day the collapsed line claims.

**THAT LAST ONE WAS BLIND AT FIRST, AND REINTRODUCING THE BUG IS WHAT FOUND IT.**
Expanding whichever staggered row came first, a drill-down truncated to two
tranches still PASSED — that row spanned two trading days, so "at least one row
per day" was satisfied by the truncation itself. The walk picks the row with the
largest `data-days` now, chosen from the DOM rather than by name so the next drop
picks its own worst case. `data-row` attributes exist for exactly this: selecting
these rows out of rendered prose means matching a caption, which renders whatever
the data does and cannot fail.

### Stage 10p — DIRECT EQUITY IS A SET, AND THE HEADLINE IS ONE LINE

Four asks on the Transactions card, and two of them are about giving the table
back the rows the chrome was spending.

**THE EXPLANATORY FOOTER IS GONE.** It repeated under every view and told a
reader of the table nothing they needed. What survives is ONE line, and only on
Direct Equity, because that is the view where the absence IS the finding — see
below.

**"BY SECURITY" BECAME "DIRECT EQUITY", AND THAT IS A DIFFERENT SET RATHER THAN
A RENAME.** *"Replace by security with direct equity, that will contain the
transaction of all direct buy and sold equity transactions."* `holdingRoute` is
the axis Stage 10L settled after the same complaint arrived three times: a share
a discretionary manager picked and a share the family bought itself are the same
ASSET and a different DECISION. "Direct Equity" means the second everywhere else
in this app, so the tab FILTERS the tape to the accounts the family runs itself
(`Direct` / `Execution`) and then rolls those up per security. Re-using the word
for "grouped by security" would have been a fourth round of that argument.

Measured on the tape: of the twelve accounts that issue a transaction statement,
ten are PMS, one is Buoyant's AIF folio and **exactly one is own-account** — LKP
Securities 98245, Bharat's broking account: **21 trades across 14 securities,
₹84.4 L bought, ₹1.02 Cr sold**, which ties to the rupee to that account's own
row in the By-manager view. Every one of those rows is classed `Equity` by its
own statement, the liquid ETF sweep included, and that classification is not
second-guessed here; rows the statement classes as something else are excluded
so the tab's name stays true if an own-account fund purchase ever lands.

**AND THE ONE-LINE NOTE ON THAT VIEW IS LOAD-BEARING.** The tab is narrow
because the family's other own-account trading sits in the demat statements,
whose movements carry no price, no counterparty and no consideration and are
therefore not trades (`precedence.mjs`). Without saying so, fourteen securities
under a heading reading "Direct Equity" is a MEASUREMENT of how little this
family trades its own book — which is not what the corpus says. `check:pages`
asserts the line survives.

**THE HEADLINE IS ONE LINE AND THE VIEW SWITCH RIDES WITH IT.** *"Write daily
and portfolio monitor as a single line headline, daily in smaller font — this
will give us more space to show more data on the table. Also shift the
holdings/transactions toggle beside it."* `PageHeader` now renders eyebrow and
title inline on every route, and takes a `beside` slot for a control that says
WHAT the reader is looking at rather than acting on it. The Portfolio Monitor's
Holdings / Transactions switch moves there and its toolbar row is deleted
outright — the Holdings basis switch that shared it joins the Export / Deck
group. Two rows of chrome returned to the table, on top of the `--app-zoom`
change above.

**THAT CLAIM IS GEOMETRIC, SO IT IS CHECKED ON GEOMETRY.** `check:pages` reads
the bounding boxes of the eyebrow, the `h1` and the switch and requires them to
overlap vertically, with the eyebrow shorter than the title. Matching the words
"Daily" and "Portfolio Monitor" would pass just as happily with them stacked
three rows deep — which is the prose-matching failure this file already names
twice, arriving through layout.

**AND ONE CHECK PARSED A NUMBER THAT WAS NEVER THERE.** The rollup's Trades cell
renders the count and a `11B/1S` split beside it, so `innerText` is `211B/1S`
and the first number in it is 21 — a parser that happens to produce A number,
which is the exact class of wrong answer this sweep exists to catch rather than
commit. The count is read off `data-trades` now, like `data-days` beside it.

### Stage 10q — THREE ROWS OF CHROME, AND WHAT SURVIVED THE THIRD

*"Remove the security/entity switch — we will show just the default view as it
is. Also remove the review deck button, and adjust the export excel button in
the same line as all the filters. This will give us further space to show the
table."*

With Stage 10p's headline change, that is the Portfolio Monitor down from four
rows of chrome to two: headline + view switch, then filters + Export Excel. The
holdings table now starts 100px higher than it did at the top of this session.

**THE BASIS SWITCH IS GONE AND THE BASIS IS NOT.** `consolidate` moved from
`useState` to `useViewParam`, so `?view=entity` still reaches the per-statement
build. That is not a hedge: the by-entity rendering is threaded through fifteen
sites — the row build, the footer, the dedupe gap, the realised cells, the
Entities column header, the section subtotals — and pinning the flag to a
literal would leave every one of those branches unreachable, which is the
dead-code-that-looks-alive failure this file keeps naming. It is also where the
**₹3.17 Cr subtotal bug** lived: both of this book's duplicate holdings are AIF,
so by-entity is the ONLY view in which a class heading and the footer beneath it
can disagree. `check:pages` walks `/monitor?view=entity` now instead of clicking
a button that no longer exists, and its invariants are unchanged.

**THE REVIEW DECK IS DELETED, NOT ORPHANED.** `src/lib/exportDeck.ts` (403
lines) had exactly one caller, and this file's own rule is that a builder
nothing calls is worse than no builder — the next session finds it exported and
wires it back believing it load-bearing. So the module went with the button, and
`pptxgenjs` came out of `package.json` with it. Both are one `git revert` away
if the family wants the deck back.

**AND THE REMOVALS ARE ASSERTED, STRUCK ON BUTTONS RATHER THAN WORDS.**
`check:pages` counts `<button>` elements whose text is `By security` / `By
entity` / `Review deck` and requires zero. Matching those STRINGS would fail a
correct page: "By security" and "By entity" are still the Transactions card's
own view controls and still appear in this page's prose. The same probe measures
that Export Excel's box overlaps the last filter `<select>`'s — the "same line"
claim is geometric, so it is checked on geometry, like the headline above it.
All three verified by reintroducing their bug.

### Stage 10r — A CARD THAT IS LOADING SAYS SO, AND OPENS ON THE LAST SNAPSHOT

*"This section first shows empty and then starts showing data after some time.
It should show data from the beginning… it can show a small loading written text
but never empty and that data is not there."*

Today's movers rendered **"No holding in this book carries a day change right
now"** on the first paint of every cold open. That is a claim ABOUT THE BOOK,
made while the quote feed was still in flight — the same defect this file
already records on the company page, where a panel still fetching asserted the
security has no live quote. THE CAUSE PICKS THE HEADLINE, and there were three
causes collapsed into one branch.

**THE THREE STATES ARE SEPARATED NOW.** Still fetching says so. A feed that
answered and failed names the feed. Only a SETTLED feed that priced nothing
makes the claim about the book — and by then the claim is true. The index tile
inside the same card had the identical bug one layer down: it printed "Index
levels unavailable — the feed did not respond" whenever its feed was null, which
is true before the first response as well as after a failed one. `IndexStrip`
had already got this right with a three-state machine; the tile now matches it.

**AND THE APP OPENS ON THE LAST SNAPSHOT, SO THE FIRST STATE IS RARELY SEEN.**
`src/lib/quoteCache.ts` keeps the merged `QuoteFeed` in `localStorage` and
`PortfolioContext` seeds from it, so a reopen renders the day's figures
immediately and the live rounds refine them. That matters because the upstream
prices only PART of the book per call — the fill was several rounds deep, which
is why the card sat empty long enough to be reported.

Three rules keep a served snapshot honest, and the third is load-bearing:

- **`ageS` is RE-DERIVED on read**, never restored as written. It is what the
  top bar and the company page read to decide whether a price is fresh; restored
  verbatim it would say "0 seconds" about a snapshot hours old.
- **`quotesStatus` stays `loading` until a live round lands**, whatever the
  cache held. The figures are real and dated; the top bar is telling the truth
  when it says prices are still being fetched.
- **A SNAPSHOT OLDER THAN THE SESSION IS DISCARDED, NOT SHOWN.** A day change is
  `price − prevClose`, and `prevClose` is the PREVIOUS SESSION's close. Serving
  yesterday's snapshot would print yesterday's move under a heading reading
  "Today" — a real figure against the wrong day, which is the worst kind of
  wrong because it is plausible. Twelve hours: long enough to cover a trading
  day, short enough that a snapshot can never survive into the next session.

**THREE ROUTES, BECAUSE THE STATES NEED THE FEEDS IN DIFFERENT CONDITIONS.**
`cio-loading` holds both feeds open for the length of the walk — that window is
milliseconds against a real feed and cannot be caught by walking normally, since
the plain `cio` walk 404s immediately and lands on the FAILED branch, which is a
different and correct state. `cio-index-loading` fulfils the quotes and holds
only the indices, because the index tile lives inside the branch that renders
once there are priced rows and cannot be reached with the quote feed stalled.
`cio-cached` loads once with both answering, then RELOADS with them held open,
so whatever is on screen came out of storage alone.

**`networkidle` CANNOT BE REACHED WHILE A REQUEST IS HELD**, so those routes
navigate on `load` instead — waiting for the network to go quiet times out
against a page rendering exactly as intended.

**AND ONE CHECK WAS A TAUTOLOGY, FOUND BY REINTRODUCING ITS BUG.** "The index
tile says it is fetching" was matched page-wide, and the `IndexStrip` at the top
of every route prints that exact phrase while IT loads — so deleting the tile's
loading branch changed nothing the check could see. It is struck on the card's
own slice now. Six bugs were reintroduced in total and each fired the right
check; the one case left uncovered is named beside the code that governs it (a
failed POLL blanking a good tile needs one success then a failure, sixty seconds
apart).

### Stage 10s — THE MUNS CHAT, AND THE ONE SURFACE THAT IS NOT A MEASUREMENT

*"Replace the top search bar with our muns chat… it should be able to take data
from the dashboard and answer the client any queries. It should understand the
context since the dashboard data will be available to it."*

*(A REAL search box stands in that slot since Stage 10bw, and **the chat is
PAUSED since Stage 10bz**: the family asked for "Ask Muns" off the top bar, so
neither its button nor the search list's Ask row is drawn. Everything below is
kept because the component is — it is what the chat must do again when it comes
back. The chat route asserts the chat is ABSENT now, and still counts the DEAD
box by its old placeholder, which the new one does not share.)*

**WHAT IT REPLACED WAS A CONTROL THAT SEARCHED NOTHING.** The top bar's search
box was an `<input>` with no `value`, no `onChange` and no handler, in the most
prominent slot in the app. Nothing was lost, which is why this is recorded as a
replacement rather than as a removal to be asserted — but it is worth naming,
because a control that looks alive and does nothing is the failure this file
keeps finding in other forms.

**`functions/api/chat.js` — AND THE TOKEN NEVER REACHES A BROWSER.** POST
`https://devde.muns.io/chat/chat-muns` with `Bearer ${MUNS_TOKEN}`, the same
arrangement the eight functions beside it use. The body is PIPED, not buffered:
an expert-mode answer takes tens of seconds and a reader watching nothing happen
assumes it is broken. `X-Chat-Id` and `X-Message-Id` are forwarded and named in
`Access-Control-Expose-Headers`, because a header the browser cannot read is a
header that does not exist. **Nothing is cached**, unlike every other function in
that folder: an answer is not a document, and serving one from the edge would
attach one member's chat id to another's request.

**IT IS UNVERIFIED AGAINST THE LIVE API, AND SAYS SO.** `MUNS_TOKEN` exists only
in the Cloudflare environment, so this could not be exercised end to end —
`research.js` records the same position, and that doc has been wrong about a
response shape more than once. What IS measured: `POST /chat/chat-muns` with no
token answers **401**, so the host and route are real and the failure is
authentication rather than a wrong path. What is NOT: the SSE frame format, and
whether `DASHBOARD_INPUTS` is read at all. So `munsChat.ts` accepts the widest
plausible frame set (JSON with any of eight delta field names, `choices[0]`, or
a plain-text payload), IGNORES what it cannot parse rather than printing an
envelope into the answer, and reports `NO_TEXT_IN_STREAM` when a stream yields
nothing — which sends the next person to the field list rather than to the model.
The context also rides in the TASK TEXT for the same reason: a context the model
never sees is worse than none, because the answer looks fully briefed.

**THE CONTEXT IS THE PRODUCT, AND `chatContext.ts` IS WHERE THE HONESTY LIVES.**
A model asked about money it cannot see will fill the gap, so the snapshot is
built to make guessing unnecessary: consolidated NAV and its listed/private
split, allocation on `holdingBucket`, per-owner (NOT deduped, §"consolidated
counts once, per-account does not"), every account with owner, engagement and
report date, the top holdings, the undrawn commitments. Every figure derived,
none typed — 27.7 KB, against the function's 256 KB body cap.

**AND THE ABSENCES TRAVEL WITH THE FIGURES**, which is the half that matters.
`what_this_book_does_not_carry` is derived too, and names: the blend of report
dates (**47 of 49 accounts behind** the newest), the **60 of 371 positions
carrying no cost** and the ₹165.9 Cr they hold, the **₹3.17 Cr reported twice
and counted once**, the **₹12,351.24 Cr ring-fenced Polycab holding that is in
no total above** — with an instruction never to add it — and the four questions
this corpus structurally cannot answer. A model told the totals and not those
five things answers confidently and wrongly, and each is a question a family
office actually asks.

**AN ANSWER IS NOT A MEASUREMENT AND MUST NOT LOOK LIKE ONE.** Every figure
elsewhere in this app traces to a statement; this panel renders sentences that
no document produced, and **there is no `AbsentCell` in a paragraph.** So it is
marked `AI ANSWER · NOT A STATEMENT FIGURE` in words on the panel rather than in
a tooltip, the empty state says what the assistant was given AND that it cannot
reach an account, place a trade or see a figure the dashboard does not already
show, and a failure names its own code — `NOT_CONFIGURED` (no token) and
`UPSTREAM_ERROR` (a token the API refused) send the next person to completely
different places, which is `upstreamStatus.ts`'s rule arriving through a chat.

**`user_index` — AND WHY THE ENDPOINT'S OWN DOC DID NOT WORK HERE.** The first
live request came back `400 — "user_index is required in the request body for
service token requests"`. That is a TOKEN CLASS mismatch, not a wrong path. The
doc specifies `Authorization: Bearer <YOUR_SESSION_TOKEN>` — a USER session
token, where the acting user is implicit in the credential. `MUNS_TOKEN` is a
SERVICE token, so the user is not implicit and the API asks the caller to name
one. **This is the first USER-SCOPED muns endpoint this dashboard calls**: the
other seven are stateless lookups — a quote, a filing, a ratio table — with no
owner, session or history between them, which is exactly why none of them ever
needed the field and why the omission could only surface here.

**THE VALUE WAS TO BE CONFIGURED AND NEVER GUESSED — AND THE DEPLOYMENT
OVERTURNED THAT.** `MUNS_USER_INDEX` sat in the Cloudflare environment as the
ONLY source of the field: unset, the function refused before calling the
upstream and named the variable (`USER_INDEX_REQUIRED`), because a wrong index
would file this family's conversation under somebody else's account — a worse
outcome than the 400 it replaced. That was right while nobody had supplied a
value. See the two paragraphs below for what happened when somebody did.
A `user_index` in the REQUEST is still ignored — the browser does
not get to say whose account a question is filed under. `GET /api/chat?probe=1`
makes one live round trip so the value can be confirmed on the deployment
without a redeploy cycle, and the diagnostics report the index's PRESENCE, its
SHAPE and its SOURCE, never the token.

**AND THE IDENTITY IS `user_id: 14`, FIXED AT THE CLIENT'S INSTRUCTION.**
*"Pass an argument named `user_id`: 14 — this is a static value, don't change
it, keep it 14 only, include it in the main payload."* It is a CONSTANT rather
than an environment variable precisely because it was given as one: the value is
the same on every deployment, and putting it in the environment would let an
unset variable break a working dashboard. It is never taken from the request —
the browser does not get to say whose account a question is filed under — and a
`user_id` in the body is ignored.

**`MUNS_USER_INDEX` THEREFORE STOPPED BLOCKING THE CALL** — and that build sent
`user_id` alone, deliberately NOT copying it into `user_index`, on the reasoning
that "index" and "id" are not obviously the same field and a 14 meaning a
position in a list rather than an identity would file this family's conversation
under somebody else.

**AND THE UPSTREAM REFUSED IT ANYWAY, WHICH IS THE MEASUREMENT THAT SETTLED
IT.** Run on the deployment, that build came back with the SAME
`400 — user_index is required…`. So `user_id` is not the field the API is
asking for; the only value anyone has named for this deployment is 14; and the
choice was between sending it under both names or a chat that can never answer.
**The fixed identity now goes as `user_id` AND `user_index`.** What changed is
the evidence and not the rule: the earlier refusal was declining to INVENT a
value, and this is sending the one the client gave. `MUNS_USER_INDEX` survives
as the OVERRIDE — set it and it WINS — for the day the two turn out to differ.

**AND `USER_INDEX_REQUIRED` IS GONE RATHER THAN LEFT UNREACHABLE.** With an
identity always in the body, a 400 naming one means the value was REJECTED and
never that it was missing, so the two-code split collapses to
`USER_INDEX_REJECTED` carrying the upstream's own sentence — which names the
field, where the dashboard would only paraphrase it. The panel's
`USER_INDEX_REQUIRED` copy went with it. `chatFunction.test.ts` asserts the
REMOVAL — that the same 400 with no override set still comes back
`USER_INDEX_REJECTED` — because deleting the branch and its test together would
leave nothing to notice a future edit putting the request back to the shape the
deployment refused.

**AND THE PANEL PRINTED THE WHOLE ENVELOPE AT THE READER.** NestJS nests its
error as `{ message: { message, error, statusCode } }`, and the first cut
rendered that JSON blob into the chat — machine noise where a sentence belongs.
`upstreamMessage` unwraps to the deepest string; anything that is not JSON is
passed through truncated rather than swallowed.

**AND THE DIALOG WAS TRAPPED IN THE TOP BAR.** The family reported the panel
"mixing with the dashboard UI", and the cause was not transparency — the panel
measures fully opaque. `backdrop-filter` on an ancestor makes THAT ANCESTOR the
containing block for `position: fixed` descendants, and the top bar the trigger
lives in carries `backdrop-blur`. So `fixed inset-0` resolved against the
header: the overlay measured **1304×55**, a scrim over the header strip and
nothing else, with the dashboard underneath never dimmed at all. It is
portalled into `#root` now — not `document.body`, because `#root` carries
`--app-zoom` and the dialog has to keep the app's scale.

**A SCRIM HAS TO DIM, AND THE FIRST ONE DID NOT.** 0.35 alpha over a 4px blur
left the table behind perfectly legible. It is 0.62 over a 20px blur now, on a
warm mid-tone whose luminance stays above the light-remap check's threshold —
the utility reads as deliberately remapped rather than as the dark chassis
colour leaking onto a light page.

**AND THE PANEL IS SIZED IN PERCENT, NEVER `vh`.** `h-[min(78vh,720px)]` painted
78vh × 0.875 — a 614px panel in a 900px window while claiming 78% — because a
viewport unit is not rescaled by zoom (Stage 10n). A percentage of the
correctly-sized overlay avoids it: 896×805 against 672×614.

**BOTH ARE CHECKED ON GEOMETRY**, because not one rendered word changes when
either regresses: the overlay must cover the viewport, and the panel must take a
majority of it. Verified by removing the portal and by restoring the old size.

**THIRTY-FOUR ARITHMETIC CHECKS AND FIVE RENDERED ONES.**
`src/lib/__tests__/chatContext.test.ts` reconciles the snapshot against the
GENERATED book by a different path from the builder's — NAV against
`BOOK_SUMMARY`, buckets against `dedupedPositions`, the per-owner gap against
`doubleCountedValue`, the fence against `BOOK_POLYCAB` — and asserts the fenced
value is NOT inside the NAV the same context reports. It also walks the whole
payload for a non-finite number, because a `?? 0` in the builder is the
absent-vs-zero rule failing through a JSON field instead of a table cell.
`check:pages` walks a `chat` route that opens the panel and asks one question:
the label, the stated snapshot, the vanished search input, and the named
failure. All verified by reintroducing their bug. *(Since Stage 10bz that route
asserts the chat is absent instead; these are the claims it must make again the
day the chat returns.)*

**AND THIRTY MORE ON THE FUNCTION ITSELF** (`chatFunction.test.ts`),
against a STUBBED upstream — the token exists only in Cloudflare, so the real
API is out of reach from a test, but every branch around it is not: that
`user_id` and `user_index` both carry the fixed identity at the top level, that
`MUNS_USER_INDEX` overrides it as a number when it reads as one and verbatim
when it does not, that a request-supplied one is ignored, that no call is made
at all when the TOKEN is unconfigured, that `USER_INDEX_REQUIRED` can no longer
be reached, and that the deployment's exact 400 envelope comes back as one
readable sentence under its own code.

### Stage 10g — the XIRR is on the Morning CIO, and it is CHECKED

The family asked for Embedded gain to be replaced by an XIRR. Two things had to
be true first, and one of them was a latent bug:

**A PER-ACCOUNT TERMINAL VALUE MUST READ `portfolio.positions`, NOT THE DEDUPED
SET.** `measured()` closed each account against a market value taken from
`consolidated`, so the account whose row lost the dedupe would have closed
against less than its own statement prints. No account carrying a duplicate
publishes an opening portfolio value in this drop, so nothing on screen was
wrong — which is exactly why it had to be fixed BEFORE the rate went on a tile
rather than after a drop where it bites. It is the §"consolidated counts once,
per-account does not" rule, failing in the direction that is invisible.

**AND THE RATE IS VERIFIED AGAINST THE MANAGERS' OWN PRINTED FIGURES.**
`src/lib/__tests__/accountXirr.test.ts` reproduces each account's own
financial-year-to-date return from our flows and our terminal value:

```
Carnelian 3517383     ours 26.49%   printed 26.98%   −0.49 pp
Goldstandard 100022   ours 20.36%   printed 20.57%   −0.21 pp
Goldstandard 100023   ours 20.87%   printed 21.08%   −0.21 pp
V.E.C 128004          ours 51.09%   printed 51.41%   −0.32 pp
```

The gate is 1.0 pp because these are two different measurements of one window —
the manager publishes a TIME-weighted return, this is MONEY-weighted, and they
diverge only to the extent capital moved mid-window (here, TDS transfers of a few
thousand rupees against crores). Wide enough that the basis difference cannot
fail it; narrow enough that a wrong sign, a dropped opening value or a shared
terminal date cannot pass — each of those moves a figure by tens of points, and
the suite asserts that too.

**AND THE PREMISE IN THAT PARENTHESIS IS NOW MEASURED, BECAUSE AN ACCOUNT BROKE
IT.** V.E.C 128005 took ₹11.24 Cr of new capital on 28 and 29 July and closes 13
August — **182% of its own opening value, sixteen days before the terminal
date**. Its money-weighted return came out 39.13% against a printed 46.44% and
the suite reported a 7.31 pp FAILURE for an account where nothing is wrong: a
rupee-left-alone figure cannot see that deposit and ours must. Widening the
tolerance to 8 pp would have "fixed" it and let a dropped flow through forever.

Nothing is misread, and the statement settles it — strip the deposits out and
the account's gain over its own opening value is **46.43% against the printed
46.44%**, on the same flows and the same terminal value. So the comparison is
GATED ON THE PREMISE IT NEEDS: mid-window external capital over opening value,
and above 5% the money-weighted comparison is not struck. This book's seven
measurable accounts separate cleanly on that ratio — six between 0.012% and
0.045%, every one of them a TDS transfer of a few thousand rupees, and this one
at 181.9%.

**The gate is on the RATIO and never on an account number.** Typing `128005`
into the suite would stop checking it forever, including in the drop where its
flows go quiet again. And an excluded account is not dropped: it gets the
gain-over-opening reconciliation above as its own case, checked at 5 pp — wide
enough that WHEN a deposit landed cannot fail it, narrow enough that a sign
error still reads +363.72 pp. Both were verified by reintroducing the bug.

**Green Lantern's two accounts are NOT CHECKED and are named.** They are in the
tile, but their FYTD is printed on a report drawn 2026-08-10 while their holdings
close 2026-07-27; comparing them reports a −3.82 pp "failure" that is two weeks
of market movement. They are counted apart with their OWN reason printed rather
than one blanket line for every skip — a date mismatch and a capital movement
are different findings, and a reader who cannot tell them apart cannot act on
either. The suite fails if fewer than three accounts were actually compared — `golden.mjs`'s rule, that a suite passing over
no input claims confidence nobody earned.

**Trades are not flows**: a sale moves cash inside an account rather than out of
it, and its proceeds are already inside the closing value — which is why the four
comparisons above hold on accounts that traded actively over the window.

### Stage 10g(ii) — THE TILE READ +99% AND THAT WAS THE REAL BUG

Put on the strip as an annualised XIRR, it rendered **+99.0%**, and the family
challenged it. **Nothing was miscalculated.** ₹78.8 Cr of opening value and
contributions became ₹99.4 Cr over the 132 days from 1 April to 11 August —
**+28.3% money-weighted, +26.1% simple** — and compounding 0.36 of a year onto a
full one gives +99.0%. Every step reproduces.

**IT WAS A LOGICAL ERROR, NOT AN ARITHMETIC ONE.** An annualised figure is a
claim about a YEAR, and this book has four months of dated flows. The sources
settle it: these same managers publish their own ANNUALISED since-inception
returns for these very accounts — **Carnelian 19.83%, Green Lantern 11.45% and
10.6%, Molecule 7.31%** — so a 99% annual rate for the book they run contradicts
every one of them. A figure that no source supports is not made true by being
correctly derived.

**AND THE REPO ALREADY KNEW.** `totalReturnFromXirr` was written for exactly
this, `/performance` and `/family` were already de-annualising, and this file
already said "an unlabelled +141% reads as a sustained yearly return". It came
back the moment a tile asked for "XIRR", because the knowledge lived in prose
and in one page's local choice instead of in a function every caller must pass
through.

So the threshold is now **`moneyWeightedReturn` in `bucketXirr.ts`, once**:

- A window of **at least a year** returns the annual rate, `annualised: true`.
- Anything shorter returns the return earned **over that window**, and the
  caller must say so — the tile reads `+28.3% · 132-day window · not annualised`.
- The annualised rate is still on the object for the popover, where it is named
  an extrapolation beside the managers' own 7–31% range.
- When the flows eventually span a year the same call starts returning a genuine
  annual rate and the caption changes itself. No revisit needed.

`accountXirr.test.ts` asserts the guard is **load-bearing** — that annualising
this book's window would more than double the figure — so a test cannot pass by
accident on a book where the two happen to be close, and `check:pages` asserts
the refusal reaches the SCREEN: the window and coverage are rendered, a sub-year
window is never labelled annualised, and no triple-digit return appears anywhere
in the KPI strip.

**The strip carries BOTH returns, because they answer different questions over
different sets.** Money-weighted is dated and covers the 7 of 30 accounts that
publish an opening portfolio value (₹99.4 Cr); Consolidated return is cumulative
on cost and covers the whole ₹461 Cr book. Each states its own scope on its face.

### Stage 10j — "DIRECT EQUITY" WAS A CLAIM THE BOOK NEVER MADE

The family opened Jammu Kashmir Bank, saw it chipped **Direct Equity**, and read
two lines below that Carnelian manages it. They reported it as a classification
error. It was not one — and it was a real error.

**The asset class was right and its LABEL was making a second claim.** The shares
are `Equity`; §5 is unchanged and PMS still cannot be an asset class, because a
mandate is a relationship and the thing owned is a company's shares. What the
word "direct" asserted on top of that is that THE FAMILY CHOSE THEM, and for
₹127.12 Cr of this book a discretionary manager did. The page was contradicting
its own table.

**THE AXIS ALREADY EXISTED AND NOTHING READ IT.** `Account.engagement` is taken
off each statement's own wording and never defaulted (§5). Measured on this drop:

| | positions | value |
| --- | ---: | ---: |
| Equity · PMS mandate | 263 | ₹127.12 Cr |
| Equity · own demat | 18 | ₹30.12 Cr |
| Equity · broker (Execution) | 9 | ₹0.99 Cr |

So `isDirectEquity` is **`isCompanyShare`**, `assetClassLabel` renders the class
as **`Company Shares`** — the set was always right and only its name was wrong —
and `holdingRoute` / `ROUTE_LABEL` / `ROUTE_NOTE` in `analytics.ts` are the one
place the engagement becomes words.

**AND THE BUCKET THAT ESCAPED THE HELPER PROVED WHY IT EXISTS.** Morning CIO's
allocation row was keyed on the literal string `"Direct Equity"` rather than on
the asset class, so it was the one surface where the screen word was NOT chosen
in `assetClassLabel` — and it silently stopped matching the moment that helper
changed. Its key is `Equity` now and its label comes from the helper, like every
other class. The stock page
chips `via manager's mandate` beside the class and carries a **Held via** column;
Portfolio Monitor's per-entity drill-down carries the same column; Sector
Composition, Exposure & IPS and Compare say "company shares" and then state the
mandate/own split instead of leading with a word that denies it. *(Of those
three only SECTOR COMPOSITION is left — Compare went at Stage 10ap and
Exposure & IPS at Stage 10bc — and it still says both halves. The wording rule
is what matters here and it is unchanged.)*

**AND MORNING CIO HAD COMPUTED THE SPLIT AND RENDERED IT NOWHERE.**
`equityManagedMV` / `equitySelfMV` were derived, exported from the memo, and
read by no caller — the comment above them said "for the caption only" and there
was no caption. That is `dedupedPositions` again: **a helper that returns the
right number into no caller looks exactly like a working feature.** The Equity
row states both halves now, and `check:pages` asserts it, along with the stock
page stating its route and never using the word "direct" for manager-chosen
shares. Both were verified by reintroducing the bug.

### Stage 10L — THE THIRD ROUND, AND THE WORD WAS NEVER THE PROBLEM

*"Any stock that is held thru an AIF or PMS, that will be shown inside the AIF/MF
drill down page. Direct Equity will be shares held directly. Also rename 'Company
shares' as 'Direct Equity'."* Jammu Kashmir Bank again — the same name, the third
report about it.

Rounds one and two both answered with a WORD. `Equity` → `Direct Equity` when the
heading was read as covering the AIF folios; `Direct Equity` → `Company Shares`
when "direct" was read as a claim about who chose the position. Both readings were
real and both fixes were right about what they fixed. **Neither was what the family
was asking for**, and the third time a complaint arrives on one screen is when the
answer has to stop being a better label.

They were asking for a different GROUPING: a share a manager picked and a share the
family bought are in one table under one heading, and they want the first inside its
mandate. Once the grouping is right, "Direct Equity" becomes TRUE — which is why the
word they asked for goes back on the heading in the same change that stops it lying.

**THE AXIS IS `holdingBucket`, AND IT IS NOT A NEW MODEL.** `assetClass` does not
move: §5 stands, PMS is an ENGAGEMENT, and `assertNormalized` still rejects a
document that says otherwise. The shares Carnelian holds for this family ARE
ordinary listed equity. What changed is only how the HOLDINGS TABLES group them:

```
mandate route (engagement PMS)  -> MANDATE_BUCKET  "PMS mandates"  (its cash sleeve too)
Equity + own                    -> DIRECT_EQUITY_BUCKET "Direct Equity"
Equity + unroutable             -> UNROUTED_EQUITY_BUCKET
anything else                   -> its own assetClass
```

Measured on the rendered page, and every figure precomputed from `BOOK_POSITIONS`
before a line was written:

| Section | | |
| --- | ---: | ---: |
| Direct Equity | 38 holdings | ₹12,446.1 Cr → **37 · ₹94.9 Cr** since the ring-fence |
| PMS mandates | 10 mandates · 281 holdings | ₹138.7 Cr |
| AIF | 14 | ₹352.3 Cr |
| Mutual Fund | 20 | ₹99.9 Cr |
| ETF | 3 | ₹24.6 Cr |
| Cash | 2 | ₹0 |

Only the Direct Equity row moves, and it moves by the one row: Polycab was 38th
of 38 by count and 99.2% of that section by value. Every other section is
untouched, which is what a fence around ONE security is supposed to look like.

The by-security row count falls 215 → 86, and Jammu Kashmir Bank now sits inside
Carnelian Bespoke Portfolio at `/mandate/<accountId>`.

**THE TWO WORDS NAME TWO DIFFERENT SETS AND BOTH ARE NOW TRUE OF THEIRS.**
`assetClassLabel("Equity")` stays **"Company Shares"** — it answers *what IS this*,
and a share a manager picked is a company share exactly like one the family picked.
`DIRECT_EQUITY_BUCKET` answers *who chose it*. Neither is asked to carry both claims,
which is precisely what rounds one and two each tried to make one word do. It is also
why **Sector Composition, Exposure & IPS, Compare and the market-cap bands KEEP
counting mandate-held shares** — of which only Sector Composition still renders,
the other three having been removed at Stages 10ap and 10bc, on the same terms
and with the reasoning unchanged for the one that is left: a PMS-held share has a GICS sector and a market cap,
and narrowing those would throw away ₹127.12 Cr of real sector exposure and leave a
sector table built from depository rows that carry almost none. A look-through into a
mandate is a GAIN for exposure analysis. Those pages say so on their face.

**A MANDATE TAKES ITS CASH SLEEVE, SO ITS ROW TIES TO ITS STATEMENT.** Carnelian
3517383 reads ₹39.53 Cr — shares and cash, the figure its own statement prints.
Bucketing the cash elsewhere would leave the row with no document to tie to. The cost
is that the top-level Cash row falls from ₹11.58 Cr to ₹0, so **that row names where
the cash went** (`₹11.6 Cr more is held inside the PMS mandates above and counted
there`) and `check:pages` asserts it. The ₹0 is a MEASURED zero and keeps its zero.

*(THAT ROW IS ₹14.07 Cr NOW — see Stage 10av. The reasoning above is unchanged
and is why: a mandate still takes its whole account, its liquid sleeve included.
What moved into Cash is the liquid funds and liquid ETFs held OUTSIDE a mandate,
which were sitting under Mutual Fund and ETF — so the ₹0 this paragraph records
was real, and was the family being shown a book with no cash in it.)*

**AND A PMS ROLLS UP WHERE AN AIF CANNOT.** A mandate reports every underlying share
— the family owns them, the manager picks them — so the rollup is data the archive
actually holds. An AIF folio is ONE purchase of a fund, and the drop carries no
scheme portfolio that joins to any folio the family holds. So an AIF stays one row
and its drill-down SAYS the companies inside it are not reported to this book, rather
than drawing an empty constituent table. Same request, two different honest answers.

### The regroup's own defects, found by measuring rather than by reading

Eight surfaces changed at once, and an adversarial pass over each found **29 defects**
in the change itself. They are worth recording as a class, because six of them are the
same failure: **a figure that was whole became a figure over a FILTERED subset, and
its caption went on describing the whole.**

- **`% of mandate` divided by the filtered roll-up**, so selecting Jammu Kashmir Bank
  — the very holding this round was reported on — printed `100.0%` for a ₹4.3872 Cr
  position in a ₹39.53 Cr mandate. It is 11.10%.
- **The Weight column re-based on the company filter**, because the security
  multi-select had to move upstream to reach inside a mandate and the weight
  denominator moved with it. One selected name read 100.0% of a ₹13,061.63 Cr book.
- **A caption asserted what a named manager reports.** `The N holdings inside this
  mandate, as {manager} reports them at {asOf}` rendered over a filtered list —
  "The 1 holding inside this mandate, as Carnelian … reports them", about an account
  whose statement reports twelve. That is the §"never assert a FACT about a real,
  named counterparty" rule, arriving through a filter rather than through a preview.
- **An audit tooltip claimed the whole mandate** over a partial sum, and invited the
  reader to trace it to a statement printing a different figure.
- **The Realised P&L footer stopped tying to its column**: six of the seven accounts
  issuing a capital-gain statement are PMS mandates, whose rows now render `—`, so the
  visible cells summed to ~₹7 L against a footer an order of magnitude away.
- **A mandate row claimed LIVE pricing** because one constituent had a quote, while
  every mandate holds an unquotable cash sleeve.

And two that are the failure this file keeps naming in other forms: **a helper that
exists and is not called.** `mandateLabelWithOwner` was written for the four pairs of
mandates that share a strategy name — Goldstandard's Aristos for Ankita and Ajay,
SVAN's Velocity, Green Lantern's GLC Growth, V.E.C's Small & Mid-Cap — and the monitor
re-derived `strategy || provider` inline instead, drawing four pairs of
identically-named rows. `UNROUTED_EQUITY_BUCKET` was likewise never imported, so the
first unrouted account would have sorted its section below Cash.

**AND A RETURN WAS STRUCK ACROSS TWO DIFFERENT SETS OF HOLDINGS.** Morning CIO's
allocation showed Direct Equity at **−18.9%** beside ₹1.22 Cr invested and ₹12,446.1 Cr
current, because cost is reported for 9 of its 38 holdings and the regroup had isolated
the depository rows, which record what is held and never what it cost. Every figure was
right on its own terms; the three together were indefensible. The footer already
refuses exactly this ("No whole-book return in the Total row") and the row now uses the
footer's own 0.5% coverage test: a return appears only where the costed holdings
account for essentially the whole row. It keeps AIF (+20.0%) and PMS mandates (+11.4%),
and correctly refuses Direct Equity and Mutual Fund.

### Stage 10n — the pick-list is of HOLDINGS, and the money reads first

*"In the portfolio monitor tab it should be all holdings, it's not all companies,
because I'm buying multiple things."* Two changes, both to the Portfolio Monitor
and neither to the model.

**"ALL COMPANIES" WAS A CLAIM THE LIST DID NOT SUPPORT.** `securityNames` is keyed
on `p.security` over EVERY position, so the first options the dropdown offers are
Sanshi Fund-I, Buoyant Opportunities Strategy, the Motilal Oswal Founders Fund and
Helios Flexi Cap — an AIF folio, a Category-III strategy and two schemes, none of
them a company. That is Stage 10i/10j/10L one control down: a word true of SOME of
what is under it and not of all of it, on the surface a reader picks from. It reads
`All holdings` now, with the count and the search placeholder to match, and the
weight caption under the table says "the holdings you picked" for the same reason.

**AND THE SHARED COMPONENT WAS ASSERTING ONE CALLER'S VOCABULARY AT THE OTHERS.**
`MultiSelectFilter`'s empty-search line hardcoded "No companies match", so the
economic calendar's COUNTRY filter rendered it over a list of countries. It reads
the caller's own `unit` now — the noun each of the three callers already passes.

**MONEY FIRST, DESCRIPTORS LAST.** *"Reorder the columns so the money reads first
and Sector / Entity close the table."* Sector and Entity sat between the security
name and the first figure, so Qty, Avg cost, Invested and CMP were pushed off the
first screen on a table whose reader is scanning for value. They are the only two
columns on the row that describe the holding rather than measure it, and they now
close it: **Security · Qty · Avg cost · Invested · CMP · Day · Market value ·
Weight · Unreal. P&L · Realised P&L · Return · Sector · Entities.**

**NOTHING ABOUT WHAT ANY CELL RENDERS CHANGED** — every `AbsentCell` reason, every
`Auditable` formula, every basis note and the dedupe-aware footer are moved
verbatim. The footer's `Total · N rows` span narrows 5 → 3 and the row gains two
empty cells under the descriptor columns, because a column of words has no sum to
be missing; all three regions still come to 13. The same reading order is applied
to the two drill-downs the table opens out of (Sector last inside a mandate; the
route last on the per-entity split, where the owning entity is the row identity)
and to the Transactions tape, where Entity closes the row and Type stays beside
Security — one narrow column saying what the row IS, not a block of descriptors
standing between the name and the first figure.

**AND THE EXCEL EXPORT FOLLOWS, at the family's request.** It was left on its own
layout first — a different artefact, and the ask had been about the tab — and they
asked for it to match. `exportPortfolioExcel.ts` still carries three columns the
screen does not (Class, Held via, Mandate: which section a row sits in, who chose
it, and where a manager did, which mandate), and those are DESCRIPTORS too, so
they close the sheet beside Sector and Entities:

```
Security · Qty · Avg Cost · CMP · Market Value · Weight of book · Unreal. P&L ·
Return · Class · Held via · Mandate · Sector · Entities
```

**THE REORDER WAS THE EDIT THAT COULD NOT BE DONE BY HAND.** Every cell was
written as `row.getCell(9), cols[8]` — a literal index paired with the spec that
formats it, thirteen times, held together by nothing. Moving a column breaks that
pairing SILENTLY: the header row still prints correctly and a sector lands in the
column a reader's own `SUM()` is pointed at. The footer had the same defect twice
over, in `set(10, totMV)` / `set(12, totPnL)` and in a totals-row alignment reading
`col >= 7` — the boundary where money began in the OLD layout. So the order lives
in `cols` alone now and a row arrives as a record keyed by the same strings
(`writeRow`), with the footer's cells found by `colAt`. That is `lib/table.mjs`'s
own rule — **match on the HEADER, never on the column index** — applied to the
WRITING side, and it is why a future reorder is one edit rather than fourteen.

**THIS FILE HAD NO COVERAGE OF ANY KIND, AND IT IS THE ONE ARTEFACT WHOSE DEFECTS
ARE INVISIBLE.** `build`, `check:pages` and `check:family` never open the workbook
— it is a download — so a sheet with swapped columns passes every gate in the repo
and opens perfectly on the reader's machine.
`src/lib/__tests__/portfolioExcel.test.ts` builds it from `BOOK_POSITIONS` and
reads it back, anchored the way `privateMarket.test.ts` is: **the footer's Market
Value cell, LOCATED BY ITS HEADER, equals `BOOK_SUMMARY.totalValue` to the rupee**
— two independent paths to one figure, so it cannot go stale when the next drop
moves the book. Each column is then checked for what it can legitimately hold (a
money column is a number or an em dash; a descriptor column is a non-numeric
string and never either), which is what catches the values shifting while the
headers stay put. All three bug classes were verified by reintroducing them: the
old order fires the header assertion, a one-column value shift fires three checks,
and the footer back on its literal indices fires three more.

`buildPortfolioWorkbook` is the seam that made it testable — the workbook without
the `document` / `URL.createObjectURL` download around it.

**And the suite runner had to move its bundle.** `test-family.mjs` built into the
system temp dir, and `--packages=external` leaves a real dependency as a bare
import that Node resolves by walking UP from the bundle — so `exceljs` was
unreachable from `/tmp`. The bundle is written inside `node_modules` now, one
level below the packages it needs, and still outside the working tree.

### Stage 10o — EVERY FIGURE ON MORNING CIO OPENS THE HOLDINGS BEHIND IT

*"Every row of the allocation table on Morning CIO must open the holdings behind
it — AIF, PMS mandates, Mutual Fund, Direct Equity and ETF alike. The KPI tiles
and the Concentration figures are the same fix. Only the mandate and
family-entity drill-downs exist today."*

Morning CIO is a screen of totals — a NAV, a capital-invested sum, six allocation
rows, seven concentration figures — and two of those sets had an address
(`/mandate/:accountId`, `/family?entity=`). Everything else was a number a reader
could see and not open: ₹352.35 Cr of AIF across 19 holdings in 17 accounts, the
60 positions Capital invested leaves out, the 128 names two members both hold.

**ONE PAGE, NOT THIRTEEN, AND THE SET IS DEFINED ONCE.** A drill-down is not a
new measurement — every figure on that screen is `Σ f(x)` over a subset of the
same book, so what differs between them is the SUBSET and the words for it.
`src/lib/drilldown.ts` owns both, and **both sides call it**: Morning CIO calls
`drilldownHref` to build the link, `/holdings` calls `resolveDrilldown` to list
the rows. Thirteen pages would be thirteen chances for a drill-down to disagree
with the tile it opened from, which is this repo's most expensive recurring bug
— the allocation footer on a different basis from its own column, the AIF
section heading summing ₹3.17 Cr its own footer did not.

Its predicates are DELEGATED, never paraphrased: buckets from `holdingBucket`,
the sides of the book from `isPrivateClass` / `isUnplacedSide` — which read the
GENERATED `Position.marketSide` rather than a class list of their own — the
opening-value test from
`accountHasOpeningValue` — which was private in `returns.ts` and had a second
copy inside Morning CIO. It is exported now and both read it, because the tile
states a coverage and the drill-down lists the accounts behind that coverage,
and two copies of one regex are two chances for those to describe different
accounts.

| The figure | What opens | |
| --- | --- | ---: |
| Consolidated NAV · Positions · Distinct names | every holding | 369 rows · 214 names · ₹710.4 Cr |
| Capital invested · Consolidated return | the holdings reporting a cost | 309 rows · ₹471.9 Cr · +15.4% |
| …its coverage line | the holdings reporting none | 60 rows · ₹165.9 Cr |
| Money-weighted return | the accounts carrying an opening value | 179 rows · 7 accounts · ₹110.4 Cr |
| each allocation row | that bucket's holdings | AIF ₹352.3 Cr · PMS ₹138.7 Cr · MF ₹99.9 Cr · DE ₹94.9 Cr · ETF ₹24.6 Cr · Cash ₹0 |
| Listed / Private / Not placed · Top-10 · Cross-held · Winners / losers | their own sets, each walked and reconciled against the card | ₹655.8 / ₹37.9 / ₹16.7 Cr · ₹430.9 Cr · 128 names · 174 / 115 |
| Dry powder · Distributions · Fund commitments | **`/private-market`** | not holdings — see below |

**THREE OF THOSE ROWS ARE NOW REACHED DIFFERENTLY — see Stage 10v.** The SETS are
unchanged and every figure above still holds; what moved is the route. The
cost-less holdings, the listed half and the private half were each an address of
their own, linked from a SECOND link inside a KPI tile; they are FACETS of the
tile's own drill-down now, selected by a toggle above the table, because a tile
offering three destinations made the reader choose between them before they knew
what any of them held. The old addresses still resolve.

**A REFUSED FIGURE STAYS REFUSED ONE CLICK DEEPER.** Three of the six allocation
rows print an em dash for Return, because their Invested column covers a minority
of their holdings — Mutual Fund reports a cost on 2 of 24, Direct Equity on 9 of
37, ETF on none. A drill-down opening from that dash and printing a percentage
would be the two screens contradicting each other on the reader's own click, and
the specific figure they went looking for would be the wrong one. The page runs
the SAME 0.5% coverage test the allocation row and the footer run, and names the
cause — and `check:pages` asserts it per row, against what that row printed.

**AND A COVERAGE CAPTION THAT PRINTS ONE FIGURE TWICE SAYS NOTHING.** The AIF
drill-down first read `covers ₹352.3 Cr of ₹352.3 Cr · 4 of 19 report none`:
the uncovered value is ₹98,742, both sides round to the same compact label, and
the sentence reads as full coverage while announcing that four holdings are
missing from it. It names the UNCOVERED value now — the small figure, the one
actually in question — which is the trap `MandateHoldings` already prints its
tie-out at full precision for.

**THE BASIS IS ON THE PAGE, BECAUSE IT IS NOT THE SAME FOR EVERY SET.** Ten of
these sets are CONSOLIDATED. The money-weighted coverage is PER-ACCOUNT and must
not dedupe — it closes each account against the value ITS OWN statement prints,
so collapsing a holding two accounts both report would put this page below the
coverage its own tile states. No account carrying a duplicate publishes an
opening portfolio value in this drop, so **the two agree today, which is exactly
the condition under which the mistake is invisible** — reintroducing it left the
sweep green. It is written down rather than tested for, and the page says which
basis it is on.

**COMMITMENT FIGURES DO NOT OPEN A HOLDINGS TABLE.** Undrawn capital is not a
holding and has no row in `BOOK_POSITIONS`, so Dry powder, Distributions and the
Capital deployment card point at `/private-market`, which carries those capital
accounts folio by folio. A holdings drill-down could only ever be empty there —
"a card that can NEVER be filled must not look like one that is waiting", with a
hyperlink on it. For the same reason a fund-of-funds allocation row (all six are
empty in this book) carries `fromPositions: false` and is deliberately NOT a
link.

**IT IS A WAY INTO THE MANDATE PAGE, NOT A REPLACEMENT FOR IT.** A set containing
mandate-held rows summarises every mandate above the table, each linking to
`/mandate/:accountId` — flattening 281 mandate-held shares into one
undifferentiated list would re-commit the grouping mistake Stage 10L exists to
fix. Every row is also individually linked to its mandate and its company page.

#### The drill-down has no view modes: a row is what you would click into

*"When I click on AIF or any Mutual Fund line item, it should simply show what
all AIFs/PMS/Mutual Funds I'm holding, invested amount in them and so on… and
when I further click on one particular AIF it should take me to the drill-down
page of that AIF that will show me what all stocks/companies that AIF/Mutual
Fund is holding. No need for statement/security toggle button, I do not
understand the purpose of it."*

The first two are the same fix and the third is what made it necessary. The page
opened on one row per STATEMENT LINE, so the AIF drill-down listed Sanshi Fund-I
Class E four times — once per family member — and answering "which funds do we
hold" meant grouping 19 rows into 14 by eye. The toggle was the escape hatch for
that, and **a MODE a reader has to understand before the table means anything is
a defect in the table, not a feature.**

So there is no mode. A row is the unit a reader would open: a MANDATE where the
set holds the whole of one, and otherwise the SECURITY — one fund, one scheme,
one company, however many statements report it.

| Drill-down | statement rows | rows now |
| --- | ---: | ---: |
| AIF | 19 | **14 funds** |
| Mutual Fund | 24 | **20 schemes** |
| PMS mandates | 281 | **10 mandates** |
| Direct Equity | 37 | 37 companies |
| ETF | 6 | 3 |
| the whole book | 369 | 84 |

**A MANDATE IS ONE ROW ONLY WHERE THE SET HOLDS ALL OF IT**, and that condition
is why this is safe everywhere rather than special-cased to the PMS bucket. A
bucket drill-down carries every row of the mandates in it, so the row ties to the
manager's own statement. A FILTERED set — the winners, the holdings reporting no
cost — carries only some of a mandate's rows, and a row under a manager's name
over a subset of what they hold is the *"caption asserts what a named
counterparty reports"* failure this file already records, with a total that ties
to no document. Measured: the winners set forms **zero** mandate rows. The
condition is struck against the BOOK, never against the filtered set — against
the set it would be trivially true — and the reader's search filter narrows what
is drawn without changing what a row means.

**AND THE ROW'S NOUN IS WHAT THE ROW IS.** "84 holdings" over a table where ten
rows are whole mandates of thirty-odd shares each is a caption not describing its
own figure. All mandates → `mandates`; all securities → `names`, which is the
count the tile above already prints; a mix → `rows`.

**THE SECOND ASK IS ANSWERED ASYMMETRICALLY, AND THAT IS THE HONEST ANSWER.**
Clicking a MANDATE opens `/mandate/:accountId`, which lists every share the
manager picked — the look-through the family wants, and the one this book has,
because a PMS reports every share and the family owns them. Clicking an AIF or a
mutual fund opens its holding page, which states that the companies inside are
the manager's and are **not reported to this book**: a fund unit is one purchase
of somebody else's portfolio, and no statement in this drop carries a scheme
disclosure that joins to any folio the family holds. Drawing a constituent table
there would be the fabrication this whole book exists to prevent. The two look
alike and are not, which is why the fund page says so in as many words rather
than rendering an empty table.

**The per-statement lines did not go away**; they moved from a global mode to a
per-row expander, which is where a reader asks for them. Morning CIO's Positions
count counts those lines, and the page's own caption still prints all three
figures (`369 holdings · 214 names · 34 accounts`) above a table of 84.

#### Verifying by reintroducing the bug found five defects IN THE CHECKS

Twenty-three bugs were reintroduced one at a time, each rebuilt and swept.
Eighteen fired immediately. **The five that did not are the point of doing it**,
and four of them were defects in the checks rather than in the pages:

- **ONE ALLOCATION ROW WAS NOT ENOUGH.** The sweep walked the row Morning CIO
  links first — its largest, AIF — and grouping the drill-down on `assetClass`
  instead of `holdingBucket` is a REAL defect that would empty the PMS mandates
  row entirely. It stayed green, because AIF is a bucket where the two groupings
  agree. **All six rows are walked now** (`holdings-row-1..6`), each compared
  against its own three cells, and a book with more buckets than slots fails the
  `cio` check by name rather than quietly leaving rows unwalked.
- **COUNTING ADDRESSES IS NOT PAIRING THEM.** "The page links to `/private-market`
  twice" passed while the Dry powder tile pointed at the holdings drill-down,
  because the Capital deployment card's own link kept the count up. Every
  drill-down invariant now pairs the LABEL a reader clicks with the DESTINATION,
  through a new `ctx.links` of `{href, text}` — the claim being asserted is
  about what the reader experiences, not about what the page happens to contain.
- **A REASON IN A `title` CANNOT BE READ FROM `innerText`.** `AbsentCell` puts
  its cause in a hover, so "every dashed cell names the custodian that reports no
  cost" was struck on text that never contains it. `ctx.titles` collects them.
  The fix is to read the reason, not to move it on screen where it would make a
  60-row table unreadable.
- **AND A CHIP THAT STOPPED RENDERING TOOK AN INVARIANT WITH IT.** "No
  private-class holding stands as a row in the listed half" looked for an `· AIF`
  chip among the rows — and the chip is only drawn where a set spans MORE THAN
  ONE bucket, which the all-AIF private half does not. Inverting the split left
  it green. It is a PARTITION check now, struck on counts both pages print: the
  two halves must hold every position between them and none twice, which is a
  claim neither page can make alone and which a widened or narrowed filter breaks
  in a way a value comparison alone can miss.

**AND ONE MORE THE SCREENSHOTS FOUND, WHICH NO CHECK WOULD HAVE.**
`Drilldown.defaultView` was declared, set on the two NAME-counting scopes and
**read by nothing** — this repo's most-repeated failure, a field carrying the
right answer into no caller. `useViewParam` defaults every page to its first
view, which is right where a route has one natural unit and wrong here, because
the unit belongs to the FIGURE: Positions counts statement rows, Top-10 and
Cross-held count names. Both now open on the by-security view, the param is
written explicitly on every toggle (so picking the other view cannot bounce the
reader back to the scope's default), and `check:pages` asserts it on the COLUMNS
each page draws — not on the word "security", which appears in these pages' own
prose and made the first draft fail a page that was landing correctly.

**TWO BUGS CANNOT BE CAUGHT ON THIS BOOK, and are written down rather than tested
for.** Deduping the per-account coverage set changes nothing, because no account
carrying a duplicate publishes an opening portfolio value. And keying `cross-held`
on the ACCOUNT rather than the OWNER gives the same 128, because no member holds
one name in two of their own accounts today — the moment one does, that count
would report a name as shared between entities when it is not. Both are recorded
beside the code they govern.

`ONLY=holdings-book npm run check:pages` walks a subset for exactly this loop.
main added the same flag independently and the two were reconciled rather than
one replacing the other: a name matching no route still yields an EMPTY walk (so
a typo reads as zero combinations rather than as a clean run), and a route that
resolves addresses for others — `cio` for every holdings drill-down, `monitor`
for the mandate one — is pulled in when a selected route needs it. A filter that
silently stops checking is worse than no filter, and a blanket keep would have
thrown away main's typo guard.


### Stage 10p — TODAY, THE INDICES, AND A NAV SERIES THAT HAD STOPPED BEING IMPOSSIBLE

*"we need to see which are today's movers, which are gainers … what are my
gainers, what are my losers. My stocks and ETFs are up, Sensex is down this
much, Nifty — I want to see this with Nifty 500. Build a dated portfolio NAV
series (or state the accounts that cannot supply one) and chart it against Nifty
500. Need to see live indices levels at all time: Nifty 50, Nifty 500, Nifty
Midcap 150, Nifty Smallcap 250 — put a persistent index strip on the dashboard
carrying the level and the day's move for all four."*

Four asks. Three of them needed a feed this repo had never called, and the fourth
turned out to need nothing at all — the data had been in the archive for four
deliveries behind a note saying it could not exist.

**THE FIFTH ABSENCE RECORDED AGAINST A PREMISE NOBODY RECHECKED.**
`build-book.mjs` carried `const navHistory = []` and a note reading *"the corpus
carries an opening and a closing portfolio value per account and nothing between
them. Two points are not a series."* That was TRUE of the nine-account corpus it
was written against, and FALSE from `august-2026-b` onwards — the drop that first
REISSUED a statement an account had already filed. Measured on the archive today:

| | accounts | value |
| --- | ---: | ---: |
| publish **two or more** dated valuations — a series | **13** | ₹141.6 Cr |
| publish exactly **one** — a level, never a change | 23 | ₹571.9 Cr |
| publish **none** — no statement values them at all | 13 | — |

FRED, the RBI, the release calendar and the ISIN tier were the first four. Each
cost the same thing: a reader told to stop looking for something already in hand.

#### The series, and the four rules that keep it from asserting a path

`navHistoryFrom` in `build-book.mjs` emits `BOOK_NAV_HISTORY`,
`BOOK_ACCOUNT_NAV_HISTORY` and `BOOK_NAV_COVERAGE`. Every rule below is a wrong
series avoided:

1. **THE COMPOSITION NEVER CHANGES INSIDE THE SERIES.** Only accounts with two or
   more dated valuations are in it, and it starts on the date the LAST of them
   first published — **2026-07-10**, when Goldstandard and Carnelian join the ten
   already reporting. Starting earlier draws a line climbing ₹27 Cr → ₹142 Cr
   because accounts ARRIVED, which a reader takes for performance.
2. **EACH POINT IS THE BOOK AS THE STATEMENTS STOOD**, so an account is held at
   its latest mark on or before the date — the headline NAV's own construction,
   evaluated at earlier dates. Every point states how many accounts are marked ON
   it and how many are carried.
3. **EACH `dedupeGroup` IS COUNTED ONCE, AT EVERY DATE**, and the tie-break is
   the LATER-DATED row rather than the alphabetically-first account. 360 ONE
   Special Opportunities sits under CRN37702 and CRN60117 and BOTH are in the
   covered set; sorting by accountId would have counted the group once (right) at
   60117's stale 30 June mark (wrong). The series' last point is ₹140.17 Cr
   against a per-account sum of ₹141.63 Cr, and the ₹1.4580 Cr gap is that
   holding — asserted in `navSeries.test.ts` as a relation, never as a literal.
4. **EXTERNAL CAPITAL IS NETTED OUT, ON THE ACCOUNT'S OWN CLOCK.**

**RULE 4 IS THE WHOLE CARD, AND WITHOUT IT THE CHART IS A FABRICATION.** Over this
window the covered set's NAV runs ₹128.25 Cr → ₹140.17 Cr, **+9.29%**, against a
Nifty 500 that moved **+1.33%**. Eight points of outperformance, and none of it is
performance: **₹11.24 Cr is a Fund Deposit into V.E.C 128005 on 28 and 29 July.**
Net of it the book earned **+0.54%** — below the index. `accountXirr.test.ts`
already gates that exact account for that exact reason (mid-window external
capital at 182% of opening value); this is the same failure arriving through a
chart instead of a rate.

**AND THE FLOW IS ATTRIBUTED WHERE THE MARK MOVES, NOT WHERE THE MONEY LANDED.**
V.E.C's deposit is dated 28–29 July and its next valuation is 13 August, so the
money and the revaluation fall in DIFFERENT consolidated intervals. Subtracting
a deposit from a NAV that has not yet been restated to include it produces a large
false loss followed by a large false gain. Each account's flows are therefore
attributed to the interval bounded by ITS OWN consecutive snapshots — the same
"each account closes on its own as-of" rule `pooledXirr` is built on.

**WHAT IT STILL CANNOT PROVE, STATED ON SCREEN RATHER THAN PAPERED OVER.** Ten of
the thirteen covered accounts publish no dated capital record. Where such an
account holds a SINGLE security whose unit count is identical at every snapshot,
the statement itself rules out a subscription (`units-unchanged`, which is how
both 360 ONE CRNs and the fund folios resolve). Where it does not — SVAN 8710067
and 8710090, Molecule and the HDFC folio — it is `unreported`, and **₹28.3 Cr of
the window's movement is named on the card as not proven to be performance**. A
subscription inside one of those would read here as a return.

**A CAPTION WRITTEN FOR AN ABSENCE OUTLIVED THE ABSENCE.** `/history` rendered the
series the moment it existed, under headings written for the one it EXPECTED:
"Year-end listed-book snapshots, as reported by the ingested performance-history
statements", with each row chipped `Archived`. All four claims are false of what
arrived — statement dates inside five weeks, every asset class the covered
accounts hold, taken from each account's authoritative HOLDINGS issue, and nothing
superseded. It reads `As of · Covered NAV · Change · Capital in · Marked on this
date` now, and **the capital column is what stops the 13 August row's +8.51% from
reading as a good month.** An absence's WORDING surviving its data is the same
defect as the absence itself.

#### The four live indices, and THREE traps that print plausible wrong numbers

`functions/api/indices.js` serves Nifty 50, Nifty 500, Nifty Midcap 150 and Nifty
Smallcap 250 from Yahoo's chart endpoint; `IndexStrip` renders them between the
top bar and `<main>`, on every route, polled every 60s. It is a PROXY rather than
a harvest entry by the same rule `/api/prices` follows: `public/series/` carries
`nifty-50` and `sensex` as settled daily closes — right for a ten-year chart, and
unable to answer "where is the Nifty right now", which is the whole request. Two
of the four are not in that store at all.

**1. `chartPreviousClose` IS NOT THE PREVIOUS CLOSE.** It is the close preceding
the requested RANGE. Measured on `^NSEI` on 2026-09-02 with `range=5d` it returns
24,090.85 — the 27 August close — while the previous SESSION closed 24,055.80 on
1 September. Read as the previous close the day's move is −1.15% against a true
−1.01%. The previous close is taken from the last SETTLED bar instead, which is
the rule `/api/prices` already applies when it drops today's in-progress bar.

**2. A SYMBOL THAT LOOKS RIGHT IS NOT THE INDEX.** Probed the same day:

```
NIFTYMIDCAP150.NS   → "NIFTY MIDCAP 150"   22,949.95   ← the index
NIFTY_MIDCAP_150.NS → an unnamed instrument 7,757.15   ← not the index
NIFTYSMLCAP250.NS   → "NIFTY SMLCAP 250"   18,166.10   ← the index
NIFTY_SMLCAP_250.NS → an unnamed instrument 5,861.60   ← not the index
^NSMIDCP            → "NIFTY NEXT 50"                  ← the NAME lies
^CNX500             → delisted;  ^CRSLDX → "NIFTY 500" ← the one that works
```

Every wrong one answers **200 with a well-formed rupee figure**. So each index
declares the name its upstream must report, the response is checked against
`meta.longName`/`shortName`, and a mismatch returns the index UNVERIFIED with no
level. Same rule as `lib/table.mjs`: match on the label the source prints, never
on the shape of the key. All three decoys are refused by the running code.

**AN INDEX LEVEL IS NOT MONEY AND DOES NOT CONVERT.** `fmtFromBase` is
deliberately not used on the strip or the NAV chart's axis: running 23,090.75
through the display-currency converter divides the Nifty 500 by the USD rate and
prints a level of nothing.

**3. THE TWO ENDS OF THE MOVE WERE PICKED BY TWO DIFFERENT CLOCKS, AND FOR HOURS
AT A TIME THEY WERE THE SAME SESSION.** The family sent a screenshot of the strip
reading **+0.00% on all four indices at once**, with moves of 0.05 / 0.00 / −0.05
/ +0.05 on levels near 23,000, and asked whether that could be right. It is not a
market that stood still — measured against Yahoo's own bars, all four reproduce
**to four decimals** as the level minus ITS OWN SESSION'S CLOSE:

```
Nifty 50            23,779.20 − 23,779.150390625  = +0.0496   (7 Sep − 7 Sep)
Nifty 500           23,156.20 − 23,156.199218750  = +0.0008
Nifty Midcap 150    23,062.20 − 23,062.250000000  = −0.0500
Nifty Smallcap 250  18,484.20 − 18,484.150390625  = +0.0496
```

Trap 1 established that the previous close is the last SETTLED bar. **It never
said which clock decides "settled"**, and the answer was `new Date()` — the
SERVER's UTC date — while `regularMarketPrice` follows the EXCHANGE's session.
IST is UTC+5:30, so from **05:30 IST** (00:00 UTC) until the session's first tick
at 09:15 the UTC date has already rolled over while the level is still the
previous session's close: the bar the filter exists to exclude becomes the
"previous" close, and the level is differenced against itself. **The same holds
through every weekend and every market holiday**, when the level does not move
for days — so this printed a fabricated zero for a large fraction of the week.

The residual ±0.05 is the tell, and it is why the figure looked like data: Yahoo
rounds `regularMarketPrice` to 2dp and its bar closes are float32
(`23,779.150390625`), so a session differenced against itself lands a few paise
off zero rather than exactly on it. **A clean 0.00 would have been easier to
doubt.**

**THE FUNCTION NO LONGER READS THE SERVER'S CLOCK AT ALL.** The level's session
is `meta.regularMarketTime`, each bar's is its own stamp, both are localised with
the `meta.gmtoffset` the response declares (19800 for IST), and the previous
close is the last bar **strictly before** the level's session. One clock, taken
from the document — `lib/table.mjs`'s own rule arriving through a date rather
than a column. Where the upstream omits the offset both ends fall back to UTC
*together*: **the defect was never the zone, it was using two clocks for the two
halves of one subtraction.**

Two consequences worth stating, because both are the honest answer rather than a
workaround. Pre-open, when `regularMarketPrice` is still yesterday's close, the
strip now reports **yesterday's** move — the last completed session, which is
what a level dated yesterday can truthfully be compared against. And a level
whose session cannot be read carries **no change at all**: without it there is
nothing to exclude and the last bar might be the level's own, which is the defect
itself, so it refuses rather than guessing. `sessionDate` rides in the response
and the strip's hover names BOTH ends — a reader could not see this defect
because only one of the two dates was ever printed.

**A LIVE PROBE CANNOT CHECK THIS, WHICH IS WHY IT IS A TEST.** Outside that
window the function is correct, so a probe run at the wrong hour reports a clean
feed — the defect had been shipping since Stage 10p and every sweep passed.
`src/lib/__tests__/indicesFunction.test.ts` stubs the upstream **from the real
measured bars** (7 and 8 September 2026) and supplies the clock, so the failing
window is reproducible on demand rather than once a day. Twelve checks: the
pre-open case, the mid-session case, a 24-hour sweep of the invariant, a null
holiday bar, the refusal, the offset in both directions, **that a genuinely
unchanged close still reports 0.00% from two different sessions** — the fix is
about WHICH sessions are compared and must not suppress a measured zero — and
that trap 2's identity check still outranks every figure.

Three bugs were reintroduced and each fired its own checks; **putting the
original filter back reproduces the client's screenshot at `Δ 0.0496`**, which is
what says the diagnosis is the defect rather than a theory about it. The
24-hour sweep is a guard on the invariant and did NOT catch the original — the
pre-open case is what does, and that is recorded rather than papered over.

#### Today's movers — and the denominator that is the whole point

*(The SET was narrowed to Direct Equity a request later — see Stage 10t. The
denominator rule below is unchanged and is why that narrowing had to move every
caption on the card with it.)*

**THE DAY'S MOVE IS STRUCK ON THE PRICED SUBSET, AND THE TILE SAYS SO.** A day
change needs a live price AND the previous close behind it; the AIF folios, the
mutual-fund units, the cash sweeps and every unresolved name have neither. The
feed prices about ₹200 Cr of a ₹710 Cr book, so dividing the same rupee move by
the whole NAV gives roughly a quarter of the true percentage — a real figure on
the wrong denominator, and the one a reader sets against the Nifty. A position
with no `dayChange` never enters a sum or a ranking either: an unpriced holding
must not appear in "today's losers" at ₹0.

A name held in several accounts is ONE mover — its rupee impact adds and its
percentage is re-derived from the combined previous close, never averaged across
positions of different sizes. The list ranks by ₹ impact or by % move, both
offered, because a 9% move on a ₹40 L holding is the larger mover by one and the
smaller by the other. **An empty list shows an em dash, not a summed ₹0**: "0
losers · ₹0" is a formatter reaching an empty collection, which §2 forbids on a
pill exactly as it forbids it on a tile.

**AND THE ROADMAP NO LONGER PROMISES WHAT SHIPPED.** "Market overview — Nifty /
Sensex / global" and "NAV vs benchmark (dynamic)" were chips on Morning CIO's
"coming as live data lands" list. A chip for a feature already on the reader's
screen is the same defect as an absence recorded against a premise that changed.

#### Eleven bugs reintroduced, and three of them were bugs in the CHECKS

`check:pages` gained a route — **`cio-live`**, the same page with `/api/quotes`,
`/api/indices` and `/api/prices` fulfilled from fixtures BUILT OUT OF THE BOOK
(`installLiveMocks`). `vite preview` runs no Function, so on the plain `cio` walk
every live figure renders its absent state — worth asserting on its own, and it
left the day's-move arithmetic checked by nothing. Each symbol is priced at its
own statement mark × 1.10 with every index at ×0.99, so the answers are closed
forms: **+10.00% for the book, −1.00% per index, 11.00 points of gap.** A tile
that diluted across the whole book, averaged percentages, or counted an unpriced
holding as flat lands somewhere else.

Every invariant was verified by reintroducing its bug. Three of the eleven
exposed a defect in the CHECK rather than the page, which is the point of doing
it:

- **`(\d+) of (\d+) accounts` IS NOT UNIQUE ON MORNING CIO.** The partition check
  matched page-wide and picked up the Money-weighted return tile's own coverage
  line ("7 of 49 accounts") four cards higher, failing a page that was correct.
  Two figures of the same SHAPE describing different sets is what a page-wide
  regex cannot tell apart; it is scoped to the card now.
- **`label-xs` IS `uppercase`, AND `innerText` RETURNS THE TRANSFORMED TEXT.**
  Restoring the old "Listed NAV" heading left a check reading `/Listed NAV/`
  green against a page rendering `LISTED NAV`.
- **A PAGE-WIDE MATCH FOR A COLUMN NAME IS SATISFIED BY PROSE ABOUT THE COLUMN.**
  Renaming the capital column to "Flows" left `/Capital in/` green, because the
  footnote under the table contains the phrase. Column claims are struck on the
  header row, which `innerText` joins with tabs.
- **A COLLAPSED `<details>` IS NOT IN `innerText`**, and the 36 excluded accounts
  live inside one. The sweep opens them on these routes — the same class of
  failure as a reason living in a `title`, and the same fix: read it.

`src/lib/__tests__/navSeries.test.ts` carries the arithmetic, anchored the way
`privateMarket.test.ts` is: the series' last point against the covered accounts'
own roll-up, two independent paths inside `navHistoryFrom` to one figure. Its
load-bearing gate is an INEQUALITY — the unadjusted NAV move must exceed the
adjusted return by more than 5 points — so a suite cannot pass by accident on a
drop where no capital moved, and it fails loudly if the series ever empties.

### Stage 10r — density, and the guard on an annualised return

Three asks on the Portfolio Monitor. Two shipped; the third is declared absent
against a MEASUREMENT rather than a premise, which is the whole of why this
section exists.

**THE PAGE SPENT ITS FIRST SCREEN ON CHROME.** *"I cannot even see 2 companies
completely, which is very inefficient presentation."* Measured, that was true:
the filters, the view toggle and the two export buttons each had a row of their
own, and the security column was narrow enough that `Fractal Analytics Limited`
wrapped onto THREE lines, so a row stood ~70px tall. One wrapping chrome row at
`text-xs`, `py-1.5` cells and a `min-w-[15rem]` name column put **15 holdings on
screen at 1500x950 where 2 fitted before**.

**AND DENSITY IS ASSERTED ON GEOMETRY, because no amount of matching innerText
can see it.** A page can print every row correctly and still bury them: the
complaint was about where things sit, not what they say. `check:pages` now
measures `rowsInView` and `firstRowTop` IN THE PAGE and hands them to the
invariants — at least ten rows fully visible, and the first row inside the top
third of the viewport. The second is what stops the first being satisfied by a
taller window instead of tighter chrome. Both were verified by putting the old
type scale and padding back.

**THE RETURN TOGGLE, AND WHY THE GUARD IS THE FEATURE.** *"More than one year
it'll be CAGR, less than one year I'd rather see absolute… never an annualised
extrapolation."* `holdingReturn` in `analytics.ts` is the one place that
decides, and the page only draws:

- a measured window of **≥ 365 days** → annualised, the window named in the cell;
- **under a year** → the ABSOLUTE figure, marked `abs`, because a rate for a
  year the holding has not seen is a claim about a year;
- **no reported purchase date** → `AbsentCell`. Not "weaker", not silently
  absolute: a rate over an unknown window is not a figure at all.

**`positionIrrPct` LOOKS LIKE THE SOURCE FOR THIS AND IS A TRAP.** The PMS
statements publish a per-position IRR — 75 of 371 positions carry one — and it
is ALREADY the extrapolation being banned: it reaches **+47,695%** on this book,
and reads 193.9% for a holding whose return on cost is 56.5%. That is a provider
annualising a few months, the same arithmetic that put +99.0% on the Morning CIO
strip in Stage 10g(ii). `holdingReturn` never reads it.

The window can only come from `Position.heldSince`, which `build-book` emits
under the SAME gate as the ST/LT split — the lots must account for the units held
exactly, or Pricol's departed units would date a holding they are no longer in.
On this drop that is **3 of 371 positions**: Crompton at 527 days annualises
(−27.78% on cost → **−20.18% p.a.**), Transrail at 337 and Bectors at 274 hit the
guard. The column's own caption COUNTS all three states rather than claiming
coverage, and `check:pages` reconciles those counts against the row total.

### AND YTD / CALENDAR-YEAR ON A HOLDING IS NOT MEASURABLE HERE

*"Add YTD and calendar-year columns for the holding itself, not just the
security's market return."* The distinction is exactly right — a holding's own
return over a window is a different question from what the share did — and this
book cannot answer it. Measured over `public/audit/`, not assumed:

| | |
| --- | --- |
| Earliest holdings statement of any account | **2026-03-31** |
| Transaction tape | **2026-04-01 → 2026-08-13** |
| Valuations dated on or before 2026-01-01 | **none** |
| Trades dated before 2026-01-01 | **0 of 839** |

A holding's YTD return needs its value at 1 January and every flow since. This
corpus begins in April, so both halves are missing for every position, and a
calendar-YEAR return (2025, 2024) is further out of reach still — the whole
archive is four and a half months long.

**THE COLUMN IS BUILT AND IT SHOWS A DASH** — *"if it is not possible to show
data then just show a dash."* It was first left out on the grounds that a
permanently-dashed column reads as a broken feed; the family asked for it
anyway, and they are right that a column naming its own absence is worth more
than a gap nobody can see. It renders `AbsentCell` on every row it cannot
measure, and the caption underneath COUNTS what it covers rather than leaving a
wall of dashes to be interpreted.

**ONE CASE IS GENUINELY MEASURABLE, which is why `holdingYtd` is a function and
not a constant dash.** A holding OPENED DURING THE YEAR did not exist on 1
January, so it has no opening value to be missing: its year-to-date return
simply IS its return since purchase. That needs `heldSince` and therefore the
same lot-coverage gate as everything else here. On this drop it fires for **no
position** — all three dated holdings were opened in 2025 — and it will fire on
its own the first time a drop brings a within-year purchase through the gate,
moving the caption with it.

**The SECURITY's market YTD is available today from `/api/prices` and is
deliberately not substituted.** It is the cheap way to fill this column and it
answers a different question: a position bought in March did not earn the
market's January-to-March move. Standing one in for the other is the substitution
this book refuses everywhere else.

**AND THE CHECK ON IT IS ANCHORED OFF THE BOOK, because the obvious version
could not fail.** The column and its caption are both computed by `holdingYtd`,
so reconciling one against the other passes even when both fabricate — this
file's own "a check that compares a figure with its own copy cannot fail",
arriving through a caption instead of a footer. `YTD_MEASURABLE` in
`check-pages.mjs` counts the qualifying rows out of `glowData.ts` directly, and
the invariant requires the RENDERED figures, the caption's claim and that count
to agree. Verified by fabricating a YTD on the holdings already held on 1
January: the caption-only version passed, the book-anchored one fails.

**What would fill it properly is one document**: a holdings statement dated on
or before 1 January, per account. The moment one lands, the value at the year's
start is measurable for every position in that account and the column becomes
ordinary work.

**CALENDAR-YEAR COLUMNS (2025, 2024) ARE NOT BUILT**, and unlike YTD they have
no fill path at all on this corpus: the whole archive is four and a half months
long, so no drop of the CURRENT statements can ever supply a 2024 opening value.
YTD earns its dash because it becomes real on the next within-year purchase;
a 2024 column would be a dash forever.

*(THE ABSOLUTE/CAGR TOGGLE AND THE SEPARATE YTD COLUMN ARE GONE — Stage 10af
folds every return into ONE column behind a measure picker. Everything above is
unchanged in substance: `holdingReturn`'s guard, `positionIrrPct` staying
banned, YTD measurable only on a within-year purchase, calendar-year absent.
What moved is only where the reader chooses the measure and how it is labelled.)*

### Stage 10af — WHICH RETURN, AND SAY WHICH: ONE COLUMN, A MEASURE PICKER

*"When you say return… is it my year-to-date return? my holding-period return?
my calendar-year return? I can give you ten different returns for one scheme."*
And: *"implement the return methodology — equity under a year absolute, a year or
more CAGR; fixed income XIRR; an XIRR when there are multiple tranches. Replace
the absolute/CAGR toggle with a dropdown multiselector of all the return types.
The holdings table gets ONE return column, remove YTD etc. from the table, and
that column shows the type we select."*

**THE METHODOLOGY IS ONE FUNCTION, `measuredReturn` IN `analytics.ts`**, so two
surfaces cannot disagree about what "the return" is — the same reason
`holdingBucket` and `costCoversSet` are single functions. It delegates the
annualisation to `holdingReturn`, so the guard that keeps a 132-day window from
compounding onto a year (Stage 10g(ii)) lives in exactly one place still, and
`positionIrrPct` stays unread. `RETURN_MEASURES` is the picker's catalogue —
`auto`, `absolute`, `cagr`, `xirr`, `ytd`, `calendar` — each with the tag the
cell prints so a reader always knows WHICH return it is.

**`auto` IS THE FAMILY'S RULE, TAGGED PER ROW.** Equity held a year or more is
CAGR, everything else is the total return on cost (tagged ABS), and fixed income
(`isFixedIncome`, `Bond`) would be XIRR — which this book cannot strike per
holding, so the return on cost stands with a note naming the ideal measure. On
this drop `auto` annualises exactly the rows the CAGR measure does (Crompton) and
shows ABS for the rest, absent only where there is no cost — verified against the
generated book, not asserted.

**EVERY MEASURE THIS BOOK CANNOT STRIKE RENDERS A DASH WITH THE REASON, never a
plausible number.** Per-holding XIRR needs a cash-flow history the statements do
not carry per security (`positionIrrPct` is the banned extrapolation), so it is
absent on every row and points to Performance for the per-account figure. YTD is
measurable only on a within-year purchase (§ Stage 10r), calendar-year not at all
on a four-month archive. This is the family's own *"if it is not possible to show
data then just show a dash"* applied to five measures at once.

**THE PICKER REPLACES THE TOGGLE, AND THE SELECTION LIVES IN `?ret=`** like every
other view on this page, so the CAGR view is a shareable link and `check:pages`
reaches each measure by URL rather than a click. `auto` is the param-free default
and is mutually exclusive with the concrete measures (picking one means "show me
that", not "that plus the rule"); the concrete ones MULTI-SELECT, so Absolute and
CAGR can sit side by side — the *"always have a CAGR column"* ask, ~~answered
without a second column. The one Return column shows the ticked measure(s), each
on its own labelled line.~~ ***ANSWERED WITH A SECOND COLUMN SINCE Stage 10bi***,
at the family's request: the picker is the COLUMN LIST now, one column per ticked
measure headed with its own name. Everything else here is unchanged —
`measuredReturn` is still the one place the methodology lives, `positionIrrPct` is
still unread, and the guard still refuses to compound a sub-year window.

**THE SEPARATE YTD COLUMN IS GONE — 14 COLUMNS TO 13.** YTD is a measure now, not
a column; the footer's and each category-total's YTD cell went with it. The
category and footer returns DO NOT follow the picker and stay cumulative on cost
(`costCoversSet`): a bucket has no single purchase date to annualise over, so
annualising it would be the very extrapolation the guard forbids.

**RENDERED INLINE, NEVER STACKED**, and that is load-bearing rather than
cosmetic: the sweep reads whole rows by splitting the page text on newlines, and
a flex-column cell puts a newline INSIDE it that shatters the row for every
row-based check. A block-stacked first draft did exactly that and failed the
"sector is second from the end" invariant — so measures sit inline (visual
wrapping adds no newline) and each is `whitespace-nowrap` so a tag never splits
from its figure.

**CHECKED ON THE PICKER'S OWN ATTRIBUTES AND THE CELLS IT DRAWS**, not on option
prose the picker only shows when open. `data-return-measures` is every measure it
offers and `data-return-active` what is ticked; each Return cell carries
`data-return-cell`. Five routes assert it — `monitor` (the picker offers all
measures, defaults to auto, no YTD column, every cell labelled), `monitor-cagr`
(the guard: no triple-digit rate, the coverage note partitions, a sub-year row
tagged ABS), `monitor-ytd` (drawn ties to `YTD_MEASURABLE` off `glowData.ts`),
`monitor-xirr` (every cell a dash tagged XIRR, never an invented rate) and
`monitor-returns-multi` (both picked measures in one column, each labelled). The
methodology arithmetic is in `holdingReturn.test.ts` (`npm run test:family`),
anchored on the generated book so it cannot go stale when the next drop moves it.

### Stage 10ah — A FOURTH AXIS THAT IS NOT AN ALLOCATION AXIS: ONE ROW PER SECURITY

*"Remove sectors selector drop down."* And: *"Portfolio monitor is right now
based on category wise, asset class wise, and then the basket… Not stock wise. So
just incorporate this into THIS PAGE ONLY. Then you give a simple view where
whatever stock, like HDFC Bank, if Yamini wants to click on, she can click on and
then drill down. So based on every single investment direct/PMS/ETF/AIF etc etc.
we will club and show which stock has the highest exposure and thru what means in
the drill down page."*

**THE GAP WAS REAL AND IT WAS THE MANDATE ROLL-UP.** Stage 10L lifted the PMS
mandates out of the table into ONE ROW EACH — the right answer to "stop mixing
what I bought with what a manager bought", and the reason a reader cannot see a
name's total exposure at all: **₹138.7 Cr of this book's shares are inside ten
mandate rows**, and 140 names live ONLY there. On every existing axis Carnelian's
Jammu Kashmir Bank is not a row; it is a line inside a mandate's expansion.

**SO THE SECURITY AXIS CHANGES THE ROW BUILD, NOT A SECTION KEY.** It is the only
one that does, and that is why it is not a `GroupAxis`. Mandates are NOT lifted
out, and every position is clubbed on `securityKey` alone. Measured:

| | category axis | security axis |
| --- | ---: | ---: |
| rows | 85 | **214** |
| names visible only through a mandate | 0 | **140** |
| clubbed across more than one account | — | **130** |
| footer | ₹710.4 Cr | ₹710.4 Cr |

The footer does not move by a rupee, because it is struck over the POSITIONS and
regrouping cannot touch it — the same construction all three older axes rely on.

**IT IS THE MONITOR'S ALONE, BECAUSE THE FAMILY SCOPED IT IN THE SAME SENTENCE.**
`GroupAxis`, `GROUP_AXES` and `GROUP_VIEWS` are UNTOUCHED and Morning CIO still
offers three. Widening them would have put this axis on that page's allocation
card **by construction** — `AXIS_SCOPE` in `drilldown.ts` and `DECLARED` /
`ALLOC_TITLE` on Morning CIO are all `Record<GroupAxis, …>`, so a fourth key
would have forced four entries into each. `MonitorAxis` is a SUPERSET used by one
screen; the shared helpers take it, so every existing caller keeps passing a
`GroupAxis` unchanged and there is still one definition of "which section is
this holding in". An allocation table on this axis would draw 214
single-holding sections and mean nothing.

**AND IT FILES NOTHING, SO IT DRAWS NOTHING.** `groupKeyFor` returns one constant
(`SECURITY_SECTION`) for every row, so the table — which needs two keys to draw
headings — draws none, and the section filter is hidden rather than offered as a
control with a single option that changes nothing.

#### Two of the four vehicles can be clubbed and two cannot

*(**THE SECOND HALF OF THIS WAS OVERTURNED BY THE FAMILY — see Stage 10aj.** A
fund is no longer a row: what it discloses is looked through and added, and the
₹353.53 Cr that discloses nothing is stated as a bucket instead. The FIRST half
stands unchanged and is why the axis exists at all. The passage is kept because
the boundary it draws — what this book REPORTS versus what it can only DERIVE —
is the same boundary Stage 10aj had to state on screen; what changed is that the
derived side is now shown rather than withheld.)*

The request named "direct/PMS/ETF/AIF". **A SHARE IS CLUBBED HOWEVER IT WAS
ARRIVED AT** — the family's own demat and a discretionary manager's mandate both
REPORT THE SHARE, so both are positions carrying the same `securityKey`.

**A SHARE HELD INSIDE A FUND IS NOT REPORTED AT ALL.** An AIF folio, a
mutual-fund scheme and an ETF are each ONE PURCHASE of a manager's portfolio, and
no statement in this book reports the companies inside the folios the family
holds. `/mandate/:accountId` still refuses to draw a constituent table for a fund
folio for exactly that reason. What Stage 10aj adds is the one source that CAN
speak to it — `public/lookthrough/`, the AMCs' own monthly disclosures for 21 of
the 22 schemes here — carried as a DERIVED figure in its own column, never summed
into NAV, because the fund's value already stands for it there and counting both
would count the same money twice.

#### The drill-down, and where "thru what means" actually lives

`/stock/:securityKey` already carries a **Held via** column and a Position-by-account
card, and every security row already links there through `StockLink` — so the
drill-down PAGE needed nothing. What was missing is the answer in place, so a row
held through more than one account expands to a **venue table**: held via, the
vehicle, the owning entity, quantity, value, its share of the holding, P&L and
return, with each mandate linking to its own page.

**`venuesOf` IS NOT `entityParts`, AND THE DIFFERENCE IS THE POINT.** That helper
answers which family MEMBER holds a name and lumps every route into a Set, so a
name held through three mandates by one member collapses to one line reading
"manager's mandate". "Through what means" is a fact about the ACCOUNT — its
engagement names the route, its strategy or provider names the vehicle — so the
account is the unit. **The venues are NOT deduped**: the row's value counts each
`dedupeGroup` once and the breakdown lists every statement as printed
(§"consolidated counts once, per-account does not"), so `share` divides by the
PRINTED sum and the expansion names the gap when the two differ.

**AND THE ROW LITERAL NOW CARRIES TWO DIFFERENT SETS ON PURPOSE.** Stage 10ag's
tranche breakdown landed on the same row build, and it takes `trancheSet: dps` —
the DEDUPED set, because it opens the row's own Invested figure and every other
figure on the row is struck on that set. `venues` takes the RAW `ps` one line
below it, for the reason above. Neither is a slip and neither may be "made
consistent" with the other: they answer different questions, and one of them is a
per-account breakdown. A future session reading those two lines side by side
should read this paragraph before unifying them.

#### "…and another Y crores through these five funds" — the inverse look-through

*"If today I want to know that my public market portfolio is a thousand crores,
how much HDFC Bank do I hold in my 1,000 crores? … Then you tell me it is so much
AUM and this much percentage of the portfolio. Then I drill down, then you tell me
direct you hold X Cr through direct equity, and then you hold another Y crores
through these five funds."*

**THE SENTENCE HAS TWO HALVES AND THEY ARE DIFFERENT KINDS OF FIGURE.** The first
is the book's own: a direct holding and a PMS mandate both REPORT THE SHARE, so
the clubbed row and its route-split line answer it out of `BOOK_POSITIONS`. The
second is not reported about this family at all — the AMC disclosed what the FUND
holds, and the family's share is DERIVED from the units they own.

`loadFundExposure` in `lookthrough.ts` answers the inverse of what that file
already did: `loadLookthrough` asks *what does this fund hold*, this asks *which
of my funds hold this name*. Measured on this book: **ICICI Bank ₹2.08 Cr across
8 of the 21 readable schemes, SBI ₹1.25 Cr across 10** — on top of whatever is
held directly, and 17 of the 43 ISIN-bearing equities carry some.

**THE JOIN IS EXACT OR IT DOES NOT HAPPEN.** ISIN first, then this book's own
`securityKeyOf` over the disclosed name. **There is deliberately no fuzzy tier** —
the same refusal `shared/nameMatch.mjs` records, where a token-overlap rule
matched `KIRANAKART TECHNOLOGIES` to `TATA TECHNOLOGIES`. Inventing an exposure to
a company the family does not hold is worse than reporting none. In practice ISIN
carries almost all of it: the depository prints `SBI - EQ` where an AMC files
`State Bank of India`, and no name tier bridges that.

**IT IS FENCED FOUR WAYS AND EVERY ONE IS ON SCREEN**, because a derived figure
beside a measured one is exactly where this book has been bitten:

- it is **never added** to the row, the footer or any book total — the fund's own
  value already stands for it in NAV, so summing both counts the same money
  twice. `check:pages` asserts the row still prints the BOOK's figure, verified by
  reintroducing the double count;
- it says **DERIVED, not a position**, in words rather than in a tooltip;
- it is **partial**, and says so with counts: N of M fund holdings read, the
  schemes it could not read named, and **the AIF folios named as publishing
  nothing this book can join at all**. *(It read the EQUITY SECTION alone until
  Stage 10aq; it now reads each AMC's whole monthly filing — shares, bonds, NCDs
  and commercial paper — and a row is one ISSUER across every instrument of it.)*;
- the disclosure's **own as-of date** rides on every row, because a monthly
  filing and a statement mark are dated differently.

**AND ITS THREE STATES ARE DISTINCT.** Still loading says so; a store that did not
answer is a fact about the FETCH and is worded as one; only a store that answered
with nothing says the funds do not hold this name. Collapsing those is the failure
Stage 10r records on Today's movers, arriving through a fetch instead of a feed.

**IT LOADS ONLY WHEN A ROW IS OPENED**, and the scheme files are memoised, so a
table of 214 rows fetches nothing until a reader asks about one name.

#### The sector dropdown is gone and the sector filter is not

The same treatment the Holdings basis switch got in Stage 10q. Pinning the value
to `"All"` would have left every branch that reads it unreachable — the weight
denominator's scope caption, the base filter, and the sector handed to the
Transactions tape — which is the dead-code-that-looks-alive failure this file
keeps naming. It lives at **`?sector=`** like every other view on this page, and
`monitor-sector` WALKS it, because a param nothing exercises is indistinguishable
from a deleted feature. Sector remains a COLUMN on every row, and Sector
Composition is still the page that analyses the book by sector.

#### The checks are struck on the DOM, because this axis's row TEXT cannot be split

**130 OF THE 214 ROWS CONTAIN A NEWLINE INSIDE A CELL.** The "N entities" pill is
an `inline-flex`, so its chevron is a flex ITEM and `innerText` breaks the line
there. That is pre-existing — the category axis has 12 such rows and 10 mandate
rows besides — and harmless until an axis makes it the majority. So the rows
carry `data-security-key` and `data-venues`, the sweep captures every cell as an
array read by `COL`, and no invariant here splits a row on newlines. It is named
rather than fixed: making the pill `inline-block` is a visual change to every
table in the app and is not what was asked for.

**SIX BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: the mandates rolled up
again (fires three, from three directions — the row count, the mandate-only
names, and the venue counts), the sector dropdown restored, the honesty caption
deleted, the section filter shown anyway, the ranking reversed, and the
`?sector=` param ignored. Every expectation is derived from `glowData.ts` on each
run — the row count, the clubbed count, the largest name and the book's own NAV —
so none of it goes stale when the next drop moves the book.

### Stage 10aj — A SECURITY IS A COMPANY: THE CUMULATIVE STOCK POSITION

*"In the security selected page we should only see the aggregate stock position
across the portfolio thru various channels — direct equity / AIFs / PMS / ETFs.
AIF itself shouldn't show up as a security. We need to calculate cumulative
stocks position held in the whole portfolio together."*

Stage 10ah built the axis and drew a fund as a row. **The family say that is
wrong, and they are right**: a fund is not a security, it is one purchase of
somebody else's portfolio, and a screenshot of that table answered "which stock
do I hold most of" with `Sanshi Fund-I ₹175.1 Cr`.

**AND THEY HAD ALREADY BEEN SHOWN THE ALTERNATIVE AND CHOSE IT.** The PR before
this one delivered the measured and derived halves SIDE BY SIDE and named the
combination as their call; they repeated the sentence. So the two are added, in
a column of their own, and every surface that prints the sum says which half is
which.

#### The five buckets, because this table no longer covers the book

A fund leaving the table takes its money with it, and the honest problem is that
**half this book has no look-through and never will.** So every rupee of NAV is
placed in exactly one bucket and all five are printed under the table:

| | | |
| --- | ---: | --- |
| stocks the statements REPORT (direct + PMS) | ₹222.00 Cr | 31.3% |
| stocks DERIVED from what the funds disclose | ₹77.61 Cr | 10.9% |
| inside vehicles that publish NOTHING | ₹353.53 Cr | 49.8% |
| inside a disclosed fund and not equity | ₹45.68 Cr | 6.4% |
| the book's own cash | ₹11.58 Cr | 1.6% |

They sum to `BOOK_SUMMARY.totalValue` **to the rupee**, and both the suite and
the sweep hold them to it — the parts reconstructing the whole is the claim a
reader acts on, and no single figure can make it alone. **The table covers
₹299.61 Cr of ₹710.39 Cr**, 42.2%, and says so in the first sentence.

**₹353.53 Cr IS ALMOST ENTIRELY THE AIF BLOCK, AND THAT IS A FACT ABOUT THE
INSTRUMENT.** A mutual fund and an ETF file a monthly SEBI portfolio disclosure
— the store carries one for 21 of the 22 this book holds. **An AIF files nothing
that joins to a folio the family holds**, so no drop of the current statements
can ever fill it. Told the generic "no disclosure here" a reader goes looking for
a store fix that cannot exist, so `skipReason` in `lookthrough.ts` words the two
apart — `upstreamStatus.ts`'s rule arriving through a fund.

#### Three columns, because a measured rupee and a derived one are different claims

`Direct + PMS` is the MEASURED value and is what `Market value` means on every
other axis. `Via funds` is DERIVED. `Total exposure` is the two, and is what the
rows are ranked on. They are separate fields on the row rather than one blended
`marketValue` **because every other money column can only ever be struck on the
measured half** — Invested, Unrealised P&L, Realised and Return all come from
statements. Blending would put a return over a cost covering one half of its own
numerator, which is "a total must tie to its own columns" one column wider.

**THE FOOTER NARROWS WITH THE ROWS.** `footerSet` is the company shares alone on
this axis, so Invested, P&L and Return cover the rows above them. Left on the
whole book the footer printed **₹710.4 Cr under a column whose cells add to
₹222 Cr** — caught by reading the rendered page rather than by reasoning.

**AND WEIGHT IS THE FAMILY'S OWN QUESTION** — *"this much percentage of the
portfolio"* — so it divides TOTAL exposure by the whole book. The column
therefore sums to **42.2%, not 100%**, and the footer prints that. A weight over
the rows' own total would read 100% and tell a reader this table is their whole
portfolio, which is the one thing it is not.

**A COMPANY ONLY A FUND HOLDS IS STILL EXPOSURE**, so it gets a row: 395 of them
against the 174 the statements report. Every measured cell on such a row is
`AbsentCell` WITH ITS REASON, never ₹0 — no document reports a quantity, a cost
or a price for a share the family owns through somebody else's portfolio.

**A SCHEME THE FAMILY HOLDS AT ₹0 GIVES ₹0 OF EVERYTHING IN IT.** Five schemes
here are redeemed to nil, and carrying their disclosed lines drew 40 companies at
an exposure of exactly nothing — a computed zero, so not a fabrication, but a row
saying the family holds a company when what they hold is none of it. The line is
dropped; a company any funded scheme also discloses keeps that scheme's share.

#### One join, read by the row and by the card beneath it

`loadFundExposure` answered "which of my funds hold THIS name" one company at a
time. It is **replaced** by `loadStockExposure`, which builds the whole index
once: the row's `Via funds` cell and the itemised card inside that row's
expansion now read the same map, so they cannot disagree. It costs no more — the
same 21 files, memoised — and the deleted function left no orphan, which is this
file's own rule about a builder nothing calls.

**THE JOIN IS EXACT OR IT DOES NOT HAPPEN.** ISIN first, mapped to the BOOK's own
key where the book carries that ISIN — the only tier that bridges a depository's
`SBI - EQ` to an AMC's `State Bank of India`, and measured to be doing so for 10
companies. Otherwise this book's own `securityKeyOf`. **There is still no fuzzy
tier.**

**AND AN ISIN-BEARING FILING SETTLES THE KEY FOR ITS NAME.** 18% of disclosed
lines carry no ISIN, and the same company arrives both ways — one scheme files
`ICICI Bank Ltd.` with `INE090A01021`, another files `ICICI Bank Ltd.` with
nothing. On a single pass the first landed on the book's key and the second on
its own normalised name, so **the family's own question got two answers**:
measured on this store it split ICICI Bank, State Bank of India, Axis Bank and
IndusInd Bank. The ISIN-bearing filings are read FIRST and each records the key
for its normalised name. The evidence is the store's own — one AMC supplied the
identifier another omitted — so this is neither a fuzzy tier nor a re-derivation
of the book's identity.

**WHAT IT DELIBERATELY DID NOT REPAIR — AND THE EXTRACTOR HAS SINCE FIXED, see
Stage 10ak.** The BOOK carried ICICI Bank under TWO `securityKey`s: `icici-bank`
from a PMS statement and `icici-bank-eq` from the depository. Merging them ON
SCREEN would have given a reader one tidy row and left the reconciler none the
wiser, which this file forbids in as many words — *"if a join fails, fix the
EXTRACTOR"* — so it was COUNTED and STATED instead, and that sentence is what
told the next session there was an extractor join to make. The next session made
it: `securityKeyOf` removes the depository's own furniture before taking the key,
₹3.00 Cr of one company is one row, and the sentence's own detector is re-struck
on the ISIN because the name test became a tautology.

#### The ring-fence had to be carried onto the derived side

**A MUTUAL FUND THIS FAMILY HOLDS DISCLOSES POLYCAB.** ₹88,891 of it — so the
look-through drew a Polycab row on a page the fence says must not name it at all,
and `check:pages`'s existing absence check fired on the first sweep. The fence is
a decision about a SECURITY and has to hold wherever that security is reported,
including inside somebody else's portfolio, so `loadStockExposure` takes the
fenced keys and ISINs and drops those lines. Both, because they disagree: the
depository prints `POLYCAB INDIA LIMITED - EQ` and an AMC files `Polycab India
Ltd.`, which normalise apart.

**IT IS DROPPED SILENTLY AND NOT NAMED**, the one place this book departs from
"an absence is stated": naming it would put the word on the page, which is
exactly what the family asked to be rid of. `PortfolioMonitor` reads
`BOOK_POLYCAB` to take a name OUT and never to put a figure in — `Polycab.tsx`
remains its only reader for DISPLAY.

#### Eight bugs reintroduced, and one of them was a bug in a check

Each was put back on its own, rebuilt and swept: the funds back as rows (fires
six checks, from six directions), the fence dropped from the index (three,
including the pre-existing Polycab absence check), the footer back on the whole
book (two), Weight back on the measured half, the derived half summed into the
MEASURED column (three), the opaque bucket halved so the five no longer rebuild
NAV, a derived-only row printing ₹0 instead of an absence, and the two-pass
keying removed.

**THE WEIGHT CHECK DID NOT FIRE THE FIRST TIME.** It was struck on the FOOTER,
which is summed from `totalExposure` independently — so every ROW could divide
the measured half instead and the footer would go on printing 42.2% with nothing
to notice. It reads every row large enough for a printed decimal to mean
something now. That is this file's own *"a check that compares a figure with its
own copy cannot fail"*, arriving through a column.

**AND THE SWEEP READS A NEW COLUMN MAP.** `COL_STOCK` — this axis draws two more
columns, so everything after Market value sits two places right, and a Weight
assertion read against `COL` would have been struck on `Via funds`: a real
percentage against a real money figure, which is the plausible-wrong-answer this
sweep exists to catch rather than commit.

**THE ARITHMETIC IS `stockExposure.test.ts`** (`npm run test:family`), anchored
on `BOOK_SUMMARY.totalValue` and on the committed store rather than on a fixture
— a hand-written pair would prove only that two inventions agree. It asserts the
partition rebuilds NAV, that no company stands under two keys, that the ISIN tier
is doing work, and that the fence is LOAD-BEARING: the same store run WITHOUT it
must put Polycab back, or the guard would pass on a book where no scheme
discloses it and go on passing after the guard was deleted.

### Stage 10ak — ONE COMPANY, ONE KEY: THE DEPOSITORY FURNITURE LEAVES THE IDENTITY

*"fix the ICICI Bank double key in the extractor."*

Stage 10aj found it and refused to repair it on screen. This is the repair, in the
place that file's own rule names: **"if a join fails, fix the EXTRACTOR — never
re-derive a key in the presentation layer, which hides the defect from the
reconciler."**

**THE DEFECT WAS ONE LINE OF DOCTRINE.** `securityKeyOf` took the RAW name and
`stripDepositoryTail` was documented as DISPLAY ONLY — *"nothing here can move a
position between groups or break a join"*. So Goldstandard's appraisal printing
`ICICI Bank Ltd.` and the Motilal demat printing `ICICI BANK-EQ` were two
identities, and **₹3.00 Cr of one company across three statements never added
up.** The furniture is the depository's own bookkeeping about a line in ITS
books; it is not what the security IS — exactly as a glued-on ISIN is another
provider's, which `splitSecurityName` has always stripped before the key is taken
*"so the key comes from the CLEAN name"*. This is that rule, one column over.

**WHAT IT COSTS WAS MEASURED WITH THE ISIN AS THE WITNESS, over every security
name in the archive.** 49 keys change and exactly THREE merges follow — and a
merge of two NAMES is only safe if it is not a merge of two SECURITIES, which is
a question an identifier answers and a name cannot:

| Merged | Corroborated by |
| --- | --- |
| `icici-bank` — `ICICI Bank Ltd.` + `ICICI BANK-EQ` | **NSE's own name for the depository row's INE090A01021 is "ICICI Bank Limited", which normalises to that same key.** An identifier nobody in this join controls agrees |
| `everest-fleet` — two spellings | the SAME ISIN on both, INE0LTR01029 |
| `buoyant-…-class-a4` — three spellings | the third carries the broker's own `[BOUYA388]` code |

and **ZERO pairs whose ISINs disagree.** The strip keeps what names a DIFFERENT
instrument, which the same measurement confirms rather than assumes: Borosil's
`WARRANTS 13AG26` stays apart from the Borosil equity, EFPL's and URB's preference
lines stay apart from theirs, and Vedanta's four spin-offs stay four companies.

**NOT ONE FIGURE IN THE BOOK MOVES.** `BOOK_SUMMARY` is byte-identical —
consolidated ₹710.39 Cr, listed ₹358.04 Cr, private ₹352.35 Cr, 371 positions, 51
accounts. That is what a change to IDENTITY alone must look like, and it is the
check that says this was a rename rather than a re-measurement.

**AND THE FAMILY'S OWN REVIEW TIES TO ₹41.09 Cr MORE OF THEIR BOOK.**
`reconcile:review`'s "book positions no review line matches" falls from **65
positions / ₹166.43 Cr to 59 / ₹125.34 Cr** — ICICI NSDL from 11 to 8 — because
the depository's furnished names finally meet the review's plain ones on the key
both sides already reach through `securityKeyOf`. Nothing about the reconciler
changed.

#### `npm run rekey:archive` — how a key change lands without the passwords

`securityKey` is stored in `public/audit/*/document.json`, and `build-book` reads
it verbatim. Changing the function would therefore need `npm run extract` — which
needs `GLOW_PDF_PASSWORDS` for eight encrypted statements and `pdftoppm` +
`tesseract` for two outlined-text ones, and which `guardAgainstShrinkingTheArchive`
correctly refuses without them. **That would make this fix unlandable on any
machine without the family's passwords, which is most of them.**

It does not have to be. **The key is not READ off a page: it is DERIVED, by one
function, from a field the archive already carries verbatim** — the name the
statement printed. Measured before a line was written: **4,041 keys across six row
kinds, ZERO that are not `securityKeyOf(security)`.** So re-deriving it from the
committed archive is a faithful partial replay of extraction, and the next full
`npm run extract` calls the same function on the same name and writes the same
bytes. `scripts/rekey-archive.mjs` does exactly that and nothing else: it rewrites
`securityKey` and the key embedded in `dedupeGroup` (`dg-<securityKey>-<n>`), in
`extract.mjs`'s own `JSON.stringify(doc, null, 1) + "\n"`, and every figure,
warning and piece of provenance is written back unchanged. The diff was 57 lines
across 10 files, all of them one of those two fields.

**THE CONTROL RUN IS WHAT MAKES IT VERIFIABLE**, the same discipline the
`august-2026-b` delivery established: run BEFORE changing the function and the
tree must come back byte-identical, so every difference afterwards belongs to the
change and to nothing else. `--check` is that control, and a second run is a
no-op.

**AND ITS GATE IS STRUCK ON THE ARCHIVE, NOT ON A FUNCTION — because the first
one was one-way.** It began by asking "does the previous version of
`securityKeyOf` reproduce the stored key", which goes stale the moment the
function changes — the only occasion this script ever runs. Measured: after the
first re-key it refused every row, so the pass could not be reversed and a SECOND
change to the rule would have been unlandable. What stays true whatever the rule
is, is the PROPERTY the rule must have: **the key is a FUNCTION of the name, so
one name never carries two stored keys.** (The converse is not required and must
not be — two names sharing a key is exactly what a merge IS.) An archive that
violates it has a key that came from somewhere other than the name, so nothing is
written and the run exits non-zero. Verified by tampering with one row in a
scratch tree: it names the document, the name and both keys, and refuses.

#### Two identity guards, and only one of them could ever have seen this

`build-book` reports both on every run, **and prints them when they are zero** —
a guard that only speaks when it fires is indistinguishable, on a clean run, from
one that was quietly deleted:

- **one KEY carrying two ISINs** — a key naming two securities. It existed, and
  its own comment claimed it was "left with none and reported": `isinConflicts`
  was built, used to delete from `isinByKey`, and **printed nowhere.** A comment
  asserting an enforcement that never happened is worse than no enforcement,
  because the next session reads it and stops looking. It became load-bearing
  here, since stripping furniture is precisely the operation that could land two
  different securities on one key. Measured: **0.**
- **one ISIN carried under two KEYS** — one security keyed twice. **8**, and
  every one is a name one issuer CLIPS where another spells it out: `HELIOS FCF
  D-GROW` against `Helios Flexi Cap Fund - Direct Growth`, `CLEAN MAX ENV`
  against `Clean Max Enviro Energy Solutions`, `NATIONAL STOCK EX` against the
  full name. **No rule here bridges that and none may invent one**: the strip
  only ever REMOVES, and `backfillSecurityNames`'s ISIN-anchored rename needs the
  short form to be a per-word PREFIX of the long one, which an acronym is not.
  Each is now NAMED with its ISIN in `docs/BOOK-REPORT.md`, which turns the vague
  "there is an extractor join to make" into eight specific ones.

**AND THE SECOND GUARD WOULD NOT HAVE CAUGHT ICICI, which is worth stating rather
than implying:** the depository row carried INE090A01021 and the PMS row carried
no ISIN at all, so there was nothing to compare. The two are complementary — one
names what an identifier can prove, the other closes what only the name can show.

#### The literals that had to move with the key, and the one that would have cost ₹12,351 Cr

A key change breaks every typed literal keyed on the old spelling, silently, on
pages computing correctly. Four sets moved, and a fifth is the section below:

- **`RINGFENCED_SECURITY_KEYS`** — `polycab-india-limited-eq` → `polycab-india`.
  Left stale the fence matches nothing and the promoter block walks back into
  every total. Verified by reintroducing it: **nine invariants fire across four
  route/theme combinations**, both the `/polycab` page's own and the absence
  checks on `cio` and `monitor`.
- **`src/lib/familyTaxonomy.ts`** — **17** `sec:` entries, each a holding that
  would have fallen out of its basket and its family asset class. The suite's own
  no-dead-keys check catches it and names the key.
- **`scripts/review-reconcile.mjs`'s committed aliases** — three, and leaving
  them stale moved ₹11.10 Cr of review lines into "no counterpart in this book".
  The reconciler is what found them.
- **`src/data/nseSymbols.json`** — regenerated. **Zero symbols lost or gained by
  the key change**, measured by resolving BOTH keyings against ONE fetched master
  set, because two `build-symbols` runs differ by which NSE master answered.
  (Two symbols DID leave, and neither is this change: NSE has moved the DSP Gold
  and Silver ETFs to new ISINs — `INF740KA1ZP2` / `INF740KA1ZQ0` against the
  `INF740KA1SW3` / `INF740KA1RE3` the statements carry — so both are correctly
  reported as "on no NSE master" rather than joined on a name. One arrived: ESDS
  Software, a new listing the ISIN tier picked up.)

#### And a fifth literal was a ROUTE, whose check then turned out to be fixture-shaped

`check:pages` walks `stock-aif-dual` — the drill-down for a holding two accounts
both report, where *"carry both, count once"* either reads correctly or
contradicts itself on one screen. **Its address was a securityKey typed out in
full**, so the key moving landed it on the not-found page and three invariants
failed on a build that was correct. It is read off `dedupeGroup` now — the book's
own mark for a holding reported twice — so it moves with the book, and a drop
with no duplicate says so in the address rather than resolving to nothing.

**AND THAT EXPOSED A CHECK SHAPED BY ITS OWN FIXTURE.** Derived, the route picks
the LARGER duplicate — Transition Venture Fund I across two family trusts rather
than 360 ONE across two CRNs — and the entity-count invariant failed on it. The
page was right: pill "Held in 2 entities" over two rows. The CHECK counted those
rows by splitting the table's `innerText` on newlines, which works only while
every cell is one line — and the MANAGED BY cell carries a strategy sub-line
whenever the account prints one, which Transition Venture does and 360 ONE does
not. **The page's own comment already named this failure**, three columns to the
right: *"ONE LINE. A second `<div>` here becomes a newline in innerText, which
splits every account row in two and breaks the entity-count check."* The rule had
been applied to the HELD VIA column and not to the one column that actually
breaks it.

Fixed on the CHECK rather than by flattening the cell, because the sub-line is
real information and *"a structural claim must not depend on prose a redesign is
free to reword"*: the rows carry `data-account-row` and the sweep counts `<tr>`s.
Verified by reintroducing Stage 10j's original bug — the pill counting the
DEDUPED set — which fires it by name.

#### The on-screen detector had become a check that cannot fail

Stage 10aj's sentence counted a split by grouping on
`securityKeyOf(stripDepositoryTail(name))` and comparing that against the book's
key. That was a real check while the strip was display-only, and **the moment the
strip moved inside `securityKeyOf` it became the key compared with its own
definition** — this file's own *"a check that compares a figure with its own copy
cannot fail"*, arriving through a fix rather than a bug.

It is keyed on the ISIN now, on the page and in the sweep alike: two company
shares carrying one ISIN under two keys ARE one security keyed twice, whatever
their names say. The caption states that cause rather than the old one, because a
caption asserting a cause that is not the cause is the failure this file already
records twice.

**AND THE SWEEP ASSERTS BOTH DIRECTIONS, NEITHER OF WHICH IMPLIES THE OTHER.**
The sentence must be GONE — a removal is verified by asserting it happened — and
ICICI Bank must stand as ONE row over its three accounts at ₹3.00 Cr. That second
check is grouped by the STRIPPED NAME rather than by the book's key, which is
what makes it able to fail: the two coincide only BECAUSE the extractor strips,
so an extractor that stopped puts the group's rows under two keys and the
row-count assertion catches it. A missing candidate FAILS rather than abstaining.
Both verified by reintroducing their bug — the strip reverted (the original
defect, which fires the row check), and the sentence forced to render (which
fires the absence check) — and the bound on the money comparison is the page's
own printing precision reproduced, 0.005 Cr, never a tolerance widened until the
figure fits.

`build` · `test:ingest` 304 · `test:family` · `check:family` 53/0 ·
`check:pages` **138 combinations clean** — re-run against the merged main, whose
own two new routes account for the count moving — with the same two pre-existing
abstentions. `npm run rekey:archive --check` is a no-op, which is what says the
archive on disk is what the extractor would write.

### Stage 10s — MUTUAL FUND DATA, FROM THE FAMILY'S OWN AmfiBeas REPO

*"We should also be able to see each holding of every mutual fund."* … *"For all
the mutual funds related data you can get that from our repo — amfibeas. Mutual
Fund NAV, direct scheme NAV, rolling return etc etc., daily Mutual Fund scheme
NAV change… everything you can find in that repo. Do not make any changes in the
amfibeas repo — just access relevant data points from it."*

**READ-ONLY, ALWAYS.** `scripts/build-fund-lookthrough.mjs` takes the checkout as
an INPUT (`AMFIBEAS_DIR`, default `/home/user/techmuns/amfibeas`); nothing in
this repo clones, updates or writes to it.

```
techmuns/amfibeas (read-only)            npm run build-lookthrough
   |  book ISIN -> mf-latest-nav.json (3,439 schemes, ISIN on every one)
   v
public/lookthrough/index.json            securityKey -> scheme, plan, as-of
public/lookthrough/<schemecode>.json     NAV + day change, returns, EVERY disclosed row
docs/FUND-LOOKTHROUGH.md                 what resolved, what did not, and why
```

**THIS REPLACED A LIVE SCRAPE, AND THE JOIN IS THE REASON.** The first cut
fetched an aggregator at build time and matched a scheme BY NAME, through AMFI's
ISIN→name map and an AMC alias table. It worked, and every hop of it could go
wrong. AmfiBeas carries an **ISIN on all 3,439 schemes**, so the join is an exact
identifier lookup and the name match survives only as a fallback — the same
tiering `build-symbols` uses, and for the reason recorded there: an identifier
above the name tiers makes the match STRICTER, not looser. **20 of 22 join on
ISIN alone**, and the ISIN also settles the PLAN: `INF0R8701046` resolves to
`48299-D`, the DIRECT plan the family holds, where a name match could only ever
reach the Regular listing.

**A THIRD TIER, AND IT IS A READING RATHER THAN A GUESS.** One holding records no
ISIN and its name matches TWO schemes — the regular and direct listings of one
fund, which share a name and a portfolio. Its own printed name says *"- Direct
Plan Growth Option"*. So where candidates differ ONLY by plan and the holding
names one, the plan decides: both sides state it. Anything else stays
unresolved. **21 of 22 · ₹123.28 Cr of ₹124.46 Cr.**

**THE ONE THAT DOES NOT RESOLVE IS NAMED RATHER THAN FORCED.** Liquid BeES is
`INF732E01037` in this book — a legacy Benchmark/GS code — and AmfiBeas carries
`INF204KC1FU1` for the Nippon scheme. Nothing available here PROVES the two are
one security, so it is left unresolved with that reason. An ISIN alias would be
the guess this book refuses.

**FOUR THINGS THE BOOK COULD NOT SHOW BEFORE:**

- **NAV, and its DAILY CHANGE.** A mutual fund resolves to no NSE symbol, so the
  quote feed has never priced one and every fund's "Change today" was a dash. The
  last two points of the scheme's own NAV series answer it — and the card names
  the PREVIOUS NAV AND ITS DATE, because a fund does not publish on a
  non-business day and "since yesterday" would be wrong across a weekend.
- **RETURNS, taken from `mf-returns.json` rather than recomputed.** Two
  implementations of "what is a 1-year return" is how one screen disagrees with
  another; that file already states each period's basis (`simple` or `CAGR`).
- **THE WINDOW EACH RETURN REALLY SPANS.** Their `1M` for Helios runs
  **2026-06-19 → 2026-09-01**. The label is the source's; the DATES are the
  measurement, so both print. A period label rendered alone is the one figure on
  that card a reader could not check.
- **THE UNDERLYING'S OWN ISIN AND SECTOR**, which the aggregator never had.

**HOLDINGS: THE AMC'S OWN FILING FIRST.** `holdings-direct/` is scraped from the
fund house's own monthly disclosure page — `meta.source` is the AMC's URL — and
carries the underlying's ISIN and sector. `holdings/` is the same data via an
aggregator, with neither. So the filing wins, the aggregator is the fallback, and
**which one was used is recorded per scheme and printed on screen**: one is the
document the fund published, the other is somebody's reading of it. Measured: 14
schemes from the AMC, 3 from the aggregator.

**BOTH WERE EQUITY-ONLY, AND THAT LIMIT IS CLOSED — see Stage 10aq.** This
paragraph read *"a step back for those five, taken deliberately… wiring the debt
sleeve back would need a second source beside this one"*, which was TRUE of
`holdings-direct/` and false of the repo: **`public/amc-portfolio/` is the SAME
FILING read whole** — identical `sourceUrl`, every asset class, an ISIN on every
one of 157,125 rows. No second source, and no scheme resolves to zero rows any
more: the three liquid funds carry 214 / 161 / 151 debt lines each. It is kept
here in the order it was learnt, because *"we need a source we do not have"* is
exactly the shape of absence this file has now recorded against an unchecked
premise seven times — and the answer was in the directory next door.

**NONE OF IT ENTERS A BOOK TOTAL.** These are the only figures on the site that
are not the family's own — the fund's value already stands for everything the
card shows, and counting both would count the same money twice. The card says so
on its face. The family's exposure per underlying is `holding value × published
weight`, computed on screen where it is labelled derived.

**AVAILABLE IN AmfiBeas AND NOT SURFACED YET**, recorded so the next session does
not have to go looking: `mf-ratios.json` (standard deviation and beta with a
category rank and percentile), `mf-rolling-ranks.json`, `mf-category-returns.json`
(peer-group returns per period), `public/stocks/<isin>.json` and
`public/index-history/NIFTY_500.json`.

Seven bugs were reintroduced against the card's invariants — a NAV change without
the previous NAV's date, a return label without its window, holdings that stop
naming their document, a plan that stops naming its ISIN, a look-through column
on the fund's money, a dropped provenance line, and an AIF grown a card — and all
seven fire.

### Stage 10t — THE MOVERS ARE DIRECT EQUITY, AND THREE CAPTIONS GO

*"remove the book performance section. daily movers/losers should comprise of
direct equity holdings only. remove the highlighted text from ui."*

*(The ETFs have since come BACK to this card, at the family's request — see
Stage 10ad. What stands from this section is the mandate half, which is
unchanged: a share a discretionary manager picked is still not in the movers
list. The scope was a tab for a while and the default was stocks and ETFs
together; the family have since removed the tabs and settled the card on Direct
Equity alone — see Stage 10al, which is where this narrowing ends up standing.)*

**THE MOVERS CARD NOW COVERS A DIFFERENT SET, NOT A RENAMED ONE.**
`DIRECT_EQUITY_BUCKET` is this app's answer to WHO CHOSE A HOLDING — settled in
Stage 10L after the family reported the same thing three times, and applied to
the Transactions tab in Stage 10p. It means shares bought in the family's own
demat or broking account (`Direct` / `Execution`), never shares a discretionary
manager picked, and never a fund or an ETF. Measured on this book: **37 holdings,
₹94.9 Cr, of which 33 names and ₹82.3 Cr can reach the quote feed at all.** Before
this the list mixed the two — Jammu Kashmir Bank, Carnelian's pick, sat beside
Fractal Analytics from the family's own demat under one heading.

**EVERY FIGURE ON THE CARD MOVED WITH THE SET, AND THE CAPTIONS HAD TO FOLLOW.**
The tile is `Direct Equity · today` rather than `Book · today`; its coverage line
counts `N of 37 direct-equity names` rather than `N of 214 distinct names`; and
the index comparison reads "Direct equity is +x% against the Nifty 500" rather
than "the priced book is". A caption that widens a figure is the same failure as
one that narrows it — the Capital invested tile already cost this page once.

**AND WHAT THE NARROWING LEAVES OUT IS NAMED.** `130 PMS mandates ₹136.6 Cr · 3
ETF ₹28.3 Cr · 1 Mutual Fund` also moved today and are not in either list. Counted
over the holdings that carry a live day change — the ones that could otherwise
have appeared — so a bucket with nothing priceable in it needs no excusing.

**THE BOOK PERFORMANCE CARD IS REMOVED, AND NOT ONE OF ITS FIGURES IS.** It read
"Listed vs private, on a like-for-like basis" over the listed book's invested →
today with its unrealised gain, return and money-weighted return, and the same
for the AIF half. All of it is still on the page and still derived: invested and
current value per bucket in the allocation table, the money-weighted return in
its own KPI tile with its own coverage line, and the sides of the book on
Concentration & risk, each linking to the holdings behind it. `marketSides`
still feeds that row.

***`listedBook` AND `privateBook` WERE NAMED HERE TOO AND FED NOTHING — they are
gone (Stage 10bp).*** This card was their only reader and they outlived it, so
the sentence above was a comment asserting an enforcement that never happens.
They were also the pair whose MEANING changed silently when the split stopped
being a class list, which is what made them worth removing rather than leaving. **A layout removal, not a
measurement one — and `check:pages` asserts BOTH halves**, because a page that
dropped the card and the split together would pass the first check while losing a
figure.

**THREE CAPTIONS GO, AND TWO FACTS INSIDE ONE OF THEM DO NOT.** The movers footer
(the ranking rationale, the unchanged-name count, the multi-account rule) and the
movers subtitle described HOW the card works to a reader who can see it working.
The allocation table's subtitle also carried two things a reader ACTS on: that
every return there is CUMULATIVE rather than annualised, and the date the figures
close at. Both were **already on the page outside that card** — the Consolidated
return tile states "cumulative, not annualised" on its face and the header's
`<BasisPill>` states the as-of — so the subtitle could go without taking a
measurement with it, and an invariant now asserts those two survive.

**THE PILL KEEPS THE WORD "HELD".** The first draft moved the basis and the date
into it, reading `6 buckets · cumulative · 2026-08-13`. Two OTHER invariants read
the bucket count out of `N buckets held`, and both reported a missing figure on a
page rendering perfectly. **A caption is chrome; a count inside it is not.** The
same pass added a `title` prop to `Pill` for a hover that then had nothing to
carry, and it was reverted rather than left exported and uncalled.

**SIX INVARIANTS, EACH VERIFIED BY REINTRODUCING ITS BUG — and one of them was
in the wrong place.** The scope claim is struck on a COUNT, not on the rows: every
`cio-live` fixture price is the mark × 1.10, so every priceable name in scope
rises and the gainer count IS the size of the priced scope (33 here, 160-odd with
the mandates folded back in). A rows-only check passes on any day the mandate
names happen not to move, which is most days. The expectation is derived from the
book on every run and the bucket is recomputed inside `check-pages.mjs` rather
than imported — a check that imports the helper it is checking agrees with itself
by construction.

**AND A CHECK FOR REMOVED TEXT MUST RUN WHERE THAT TEXT WOULD RENDER.** The
movers footer only exists when the card has rows, and the plain `cio` walk serves
no feed — so "the footer stays removed" passed there whether it had been removed
or not. Reintroducing the sentence proved it: `cio` stayed green. It is asserted
on `cio-live` now; the allocation subtitle and the removed card render with no
feed at all and stay on `cio`.

### Stage 10u — A MANDATE ROW IS ITS NAME, AND THE CHECKS STOPPED READING PROSE

*"Do not write the entity along with the PMS name, entity name is already a
separate column. Other details in smaller text can be shown after we open the
full drill down page of individual PMS page. Remove the smaller text details
from the front table so it is a clean row."*

A mandate row printed three lines: the name with the owner appended, a "PMS
mandate" pill, and a grey sub-line reading `<manager> · account <no> · N
holdings`. It is one line now — name and pill — and rows on screen went **18 →
21** because a third of each mandate row was chrome.

**THE OWNER LEFT THE NAME BECAUSE THE COLUMN THAT HOLDS IT NOW EXISTS.**
`mandateLabelWithOwner` was written for a real defect: FOUR of this book's ten
mandates share a strategy name with another — Goldstandard's Aristos, SVAN's
Velocity, Green Lantern's GLC Growth, V.E.C's Small and Mid-Cap, each run for
two members — so on strategy alone the section drew four pairs of
identically-named rows with nothing to tell them apart. That reason EXPIRED when
Sector and Entity moved to the end of the row: a mandate row populates
`entities`, so the pairs are separated by the column that exists for it. The
helper stays for callers with no such column (the Excel export, the holdings
drill-down), and **`check:pages` asserts the pairs are still distinguishable**,
because this is the one thing the change could break.

**THE DETAILS MOVED TO THE PAGE THAT ALREADY PRINTED THEM.**
`/mandate/:accountId` has always shown `provider · accountNo · owner` under its
title. Nothing was lost: the row's link carries manager, account and count in
its hover `title`, and the row carries them as `data-*`.

**ONE THING IS NOT A DETAIL AND STAYS, CONDITIONALLY.** Under a filter a mandate
row's figures cover PART of the account, and a reader who is not told reads a
subset as the whole. That line renders only when `holdings.length <
accountCount` — nothing in the unfiltered view, which is the clean row that was
asked for.

**AND SIX INVARIANTS WERE READING THAT SUB-LINE.** `MANDATE_SUBLINE` parsed the
manager, the account and the constituent count out of the rendered text, and
`check:family` parsed the same string again. Deleting the line would have
retired all of them **silently**: a regex that matches nothing yields an empty
list, and an empty list passes `.every()` and satisfies a length comparison
against itself. So the row carries `data-mandate`, `data-manager`,
`data-account`, `data-holdings`, `data-account-holdings` and `data-bucket`, the
sweep collects them from the DOM into `ctx.tableRows` / `ctx.mandateRows`, and
every one of those checks reads structure instead. Same contract `data-row` and
`data-days` already carry on the transactions rollup, and the same rule: **a
structural claim must not depend on prose a redesign is free to delete.** A run
that captures no rows reports NOT CHECKED rather than passing.

**THE FIRST DRAFT OF THE NEW CHECK COULD NOT FAIL, AND REINTRODUCING THE BUG IS
WHAT FOUND IT.** "The name does not carry the owner" was struck on
`data-mandate` — which is `MandateInfo.name`, a DIFFERENT field from the
`Row.security` the cell actually renders. Putting the owner back into the
rendered name left the attribute untouched and the invariant green. It reads the
rendered first cell now. Both new invariants were then verified by reintroducing
their bug: the owner back in the name, and the sub-line back under it.

### Stage 10v — ONE TILE, ONE DESTINATION, AND THE HALVES BECOME A TOGGLE

*"there are multiple links on these KPI tiles. Make these KPI tiles clickable and
remove all the other links. suppose for consolidated NAV KPI tile, the
listed/private book links and pages should not exist separately… just give the
toggle option inside the Consolidated NAV link page. Do the same for all the
other KPI tiles as well."*

Stage 10o gave every figure on Morning CIO an address and gave several tiles
MORE THAN ONE. The NAV tile carried three — its label, and the listed and
private halves in its own caption; Capital invested carried two, the second
being the 60 cost-less positions. A reader had to work out which of them
answered their question, and the largest target on the tile, the figure itself,
went nowhere.

**THE TARGET IS THE WHOLE CARD, AND IT IS A STRETCHED OVERLAY RATHER THAN A
WRAPPER.** The value carries an `<Auditable>` popover, which is a `<button>`,
and a button inside an anchor is invalid markup that browsers disagree about.
So `Kpi.tsx` renders the anchor as an absolutely-positioned sibling covering the
card with the interactive children lifted above it: the arithmetic stays
clickable where it is, the rest of the tile navigates, and the markup stays
valid. Six tiles, six destinations, and every competing link inside one is gone.

**AND THE SUB-SCOPES BECAME FACETS OF THE TILE'S OWN PAGE.** `listed`, `private`
and `no-cost` were `DrilldownId`s of their own. They are `Facet`s now — a set
plus a label plus its note, carried on the drill-down the TILE opens — and
`/holdings` renders them as a toggle above the table, each chip printing its own
row count. `?facet=` selects one; the first is the default. The heading and the
lead follow the active facet, so a narrowed page never sits under the whole
set's caption.

| The tile | opens | with facets |
| --- | --- | --- |
| Consolidated NAV | `?of=book` | All holdings 358 · Listed 350 · Private 5 · Not placed 3 |
| Capital invested | `?of=invested` | Reports a cost 309 · Reports none 60 |
| Consolidated return | `?of=invested` | the same page — both figures divide by the same capital |
| Money-weighted return | `?of=measured` | Covered · Not covered |
| Winners / losers | `?of=winners` / `losers` | Showing a gain · In neither count |
| Dry powder · Distributions | `/private-market` | not holdings — no facet, and no holdings table |

***CAPITAL INVESTED IS NO LONGER A SCOPE OF ITS OWN — see Stage 10cb.*** At the
family's request it is the second line of the Current Value of Holdings tile, and
`?of=invested` resolves to `?of=book&facet=costed`: a second facet GROUP on the
value page (*Cost reported · No cost reported*) beside the listed / private one.
The sets are unchanged; the row above records the addresses as they were.

**THE OLD ADDRESSES STILL RESOLVE, DELIBERATELY.** `?of=listed`, `?of=private`
and `?of=no-cost` map to their scope plus facet, so a bookmark keeps working —
which is exactly why their ABSENCE from the strip has to be asserted rather than
assumed: nothing would break if one came back.

**THE CHECKS HAD TO MOVE, AND ONE OF THEM COULD NO LONGER FAIL.** *"every KPI
tile and concentration figure opens ITS OWN set"* pairs a link's TEXT with its
href, read off `main a[href]`. A whole-card overlay anchor has no inner text, so
all six tiles arrived with an empty label and the pairing could not see them —
it would have gone on "passing" by being unable to fail. The six tiles are
struck on `ctx.kpiTiles` now, which pairs each card's own label with the one
anchor inside it; the concentration figures are still text links and are still
struck on the link list. Same claim, struck where the pairing lives.

**AND `kpiTiles` WAS CAPTURED INTO NO CALLER.** It was evaluated in the page and
left out of the ctx literal handed to the invariants, so all three new
KPI-strip checks reported NOT CHECKED — this repo's most-repeated failure,
arriving in the harness this time. They said `notChecked` rather than passing,
which is the only reason it was visible at all.

**A MISSING TOGGLE MUST BE A FINDING, NOT AN ABSTENTION.** Every facet invariant
first returned `notChecked` when a page drew no toggle — and deleting the toggle
outright, which is precisely the arrangement the family asked to be rid of, then
reported the whole sweep CLEAN with seven unchecked lines. That is `golden.mjs`'s
rule arriving through a control. Abstention is allowed only where the BOOK
genuinely has one side, evidenced by Morning CIO's own figures
(`BOOK_HAS_BOTH_HALVES`, `TILE_NAMES_COSTLESS`) rather than by a literal — so a
drop with nothing private abstains and this one fails.

**THE VALUE CHECKS COULD NOT SEE ANY OF IT.** Every figure on these pages renders
identically whether the halves are reached by a toggle here or by two links on
the page before, and all of them passed while the halves were separate scopes. So
the toggle is asserted on the CONTROL: that it exists, that it opens on the whole
set rather than a half, that its printed counts partition the scope, and — on the
listed half — that the private half and the undivided book are one click away
FROM THERE. That last one is the half of the request the figures cannot see: a
reader who opened one half must not have to go back to Morning CIO to reach the
other.

**IDENTIFIED BY THE FACET IT NAMES, NEVER BY THE SHAPE OF ITS ADDRESS.** The
whole-book chip is written `facet=all` rather than as a bare scope, and the first
draft of that check tested for the ABSENCE of a `facet=` param — asserting a URL
convention instead of the reader's route, and failing a page that was landing
correctly.

**AND THE WINNERS PAGE'S THIRD SET MOVED WITH THEM.** "The holdings in neither
count are named, not dropped" matched the companion table's PROSE, which a page
can print above an empty table. Those rows are a facet now, and the check reads
the chip's own row count — the stronger claim, and the one that survives the
wording changing again.

**ELEVEN BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: a second link inside a
tile, the NAV tile pointed at the wrong set, the Listed half pointed at the
private facet, the no-cost sentence dropped from the tile, Dry powder pointed at
a holdings table, the toggle deleted, the toggle defaulted to a half, and the
chips printing the active set's count instead of their own. Two of them fired
checks that had to be rewritten first, which is the whole reason for doing it.

### Stage 10w — Watchlist & Targets: REMOVED, and the store is not

*"remove this tab"* — the sidebar entry, pointed at.

`/watchlist` redirects, the nav entry is gone and `src/pages/Watchlist.tsx` is
deleted. The redirect went to Compare Companies rather than the monitor because
that was the surviving surface in the SAME nav group that still rendered a
watched name's target and its upside; leaving it pointed somewhere with none of
those figures while `/compare` sat one link away is the stale routing decision
Stage 9d removed the day the calendar was wired.

**COMPARE COMPANIES HAS SINCE BEEN REMOVED TOO (Stage 10ap), so `/watchlist` is
REPOINTED at `/monitor` rather than chained through a dead address** — two hops
settle at the same pathname as one, which is precisely the routing this suite
cannot catch and which therefore has to be fixed in the route table. The reason
above expired; the rule it applied did not.

**`src/lib/watchlist.ts` IS UNTOUCHED, AND THAT IS THE HALF A REMOVAL LIKE THIS
BREAKS SILENTLY.** Every target price, fair value, entry and exit level, price
alert, valuation method, FV reference year, target weight and "why we own it"
note the family typed is still stored and still read and written by
`InvestmentTools` on a name's own company page — and `CompareCompanies` read the
target and the upside beside each price until it too was removed (Stage 10ap).
Nothing anyone entered was deleted. With its most VISIBLE reader gone the store
looks dead, which is how a future session deletes
it and takes the family's own judgements with it: the same trap
`announcements.ts` was in when `/news` went, and the same reason `deals.ts` and
`household.ts` stayed in Stage 10f when their pages were removed.

So the check does not merely assert the tab is gone. `check:family` asserts
BOTH halves, and only the second one can fail quietly:

- the nav entry is absent and `/watchlist` REDIRECTS rather than 404s, because a
  bookmark is a promise the app made;
- a company page reached from the monitor still carries the Investment tools
  panel with Target price, Fair value and Valuation method on it — the address
  taken off the rendered page rather than typed, like every other route that
  suite follows.

`check:pages` no longer walks `/watchlist`: there is no page there to hold to
the light-mode, overflow and stray-₹0 bar. **A removal is verified by asserting
it happened, never by deleting the test alongside the feature.**

Nothing in the store became uncalled by this — `firedAlerts`, `ALERT_WORDING`,
`upsidePct`, `parseWeightPct` and `VALUATION_METHODS` all have their caller in
`InvestmentTools`, and `readWatchlist` kept its one in `CompareCompanies` — so
nothing was left exported and dead, which is the failure this file keeps naming.
**That last caller has since gone with the page (Stage 10ap).** `readWatchlist`
is still called by `readEntry` and `writeEntry` beside it, so it is not an
orphan — but it now LOOKS like one from outside the file, which is exactly how a
store the family typed into gets deleted a release later, so it says so at its
own definition.

### Stage 10y — Thesis & Triggers and Alerts: REMOVED, and the store is not

*"remove both the pages from the dashboard ui"* — the two nav entries, pointed
at.

`/thesis` and `/alerts` redirect, both nav entries are gone, and
`ThesisMonitor.tsx` and `Alerts.tsx` are deleted. Between them they were the
WHOLE of the **MONITOR** nav group, so its heading goes with them, exactly as
the KNOWLEDGE heading went with its one entry at Stage 10x.

***BOTH NOW FORWARD TO THE DASHBOARD HOME, BECAUSE THE DESTINATION BELOW HAS
ITSELF GONE — see Stage 10bc.*** The paragraph that follows was right about its
own moment and its reasoning is exactly what expired: Exposure & IPS was the
honest destination *because* it was the last surface reaching a stored thesis or
alert rule, and there is no such surface now. So the two are REPOINTED rather
than chained through a dead address, and deliberately not sent on to the sector
table `/exposure` forwards to — that page holds nothing either editor was about.
Kept in the order it was learnt, because "the nearest surviving surface" is a
judgement that has to be re-made every time one of them is removed.

**BOTH FORWARD TO EXPOSURE & IPS, and that is the surviving surface nearest
their purpose rather than a neutral fallback.** All three pages were the
family-input layer — a thesis, an alert rule and an IPS target are things the
family TYPES, not figures a statement reports. Exposure & IPS is the one that
stays, it holds the IPS targets and the bucket mapping, and the part that
decides it: **it carries the Export/Import that round-trips the WHOLE store in
one file, theses and alert rules included.** With both editors gone it is the
only surface that reaches a stored thesis or alert rule, which makes it the
honest destination for a bookmark rather than a near-enough one. Contrast
Stage 10x, where nothing survived that held notes or macro series and all three
addresses correctly went to the dashboard home.

**`src/lib/familyInputs.ts` IS UNTOUCHED.** Every thesis, expected return, exit
trigger, review schedule and alert rule the family entered is still stored,
still coerced on import and still travels in that one export file — the
treatment `deals.ts` and `household.ts` got at Stage 10f and `watchlist.ts` at
Stage 10w. `emptyThesis` is the one export left with no caller; it says so at
its own definition rather than sitting as a silent orphan, because this store is
deliberately kept whole and a future editor calls it again unchanged.

**`alertEngine.ts` LOST TWO THIRDS OF ITSELF AND STAYS.** Exposure & IPS reads
`bucketActuals` and `bucketWeightPct` from it — the bucket roll-up was never
about alerts, it answers "what fraction of the book sits in each IPS bucket" —
so those stay. *(That reader went at Stage 10bc, so the two survivors are a
DOCUMENTED no-caller now and say so at their own definition; what kept them here
was a live surface, and this is the record of that reason expiring rather than
of the reasoning being wrong.)* `evaluateAlerts` and `ALERT_KIND_LABEL` had exactly one caller
between them and went with the page: **229 lines to 68.** No arithmetic
assertion was lost with them, checked rather than assumed —
`familyMath.test.ts` covers `deals`, `household`, `watchlist` and `marketCap`
and never touched the evaluator. What the evaluator ENFORCED is worth keeping in
view and is recorded in the section below rather than in dead code: *a rule
whose inputs are incomplete does not fire and does not pass either.*

**AND THE CHECK THAT WAS MEANT TO GUARD THE STORE COULD NOT FAIL.**
`check:family` already asserted "the whole store can still be exported from
here" as `/export/i` over the page text — and the paragraph BENEATH the buttons
explains what Export does, so deleting the button outright left it green. That
check is now struck on the BUTTONS, both of them, because an export with no
import back is a one-way door out of the family's own record. Reintroducing the
bug proved the rewrite: with the button gone and its prose intact it reports
`0 export · 1 import` and fails.

**AND A NEW CHECK FAILED A CORRECT PAGE, for the reason its own comment had just
named.** The removed pages are asserted to render none of their own content at
their old addresses, struck on each page's distinctive phrases. `alert rules`
was one of them — and it is in Exposure & IPS's export tooltip, legitimately,
because the export does carry them. A phrase the DESTINATION prints is not
distinctive to the page that was removed. Narrowed to `no rules yet` and `need a
source, not a threshold`, which only that page ever printed.

`check:pages` no longer walks either route and the `thesis` and `alerts`
invariant blocks went with the pages they described. Five bugs were
reintroduced — the page restored at its address, its route un-redirected, its
nav entry put back, the Monitor heading with it, and the Export button deleted
while its explanatory prose stayed — and each fired exactly its own check.

### Stage 10aa — THE NAV CHART WAS AN EMPTY BOX, AND EVERY CHECK ON IT PASSED

*"fix this blank section, it should show a proper time graph showing larger
period return comparison."*

**IT RENDERED NO SVG AT ALL.** `NavVsIndex`'s plot area was
`min-h-[15rem] flex-1` with `ResponsiveContainer height="100%"` inside it. That
holder is a `flex-basis: 0` item in an AUTO-HEIGHT column, so its used height
comes from `min-height` — and Chrome does not treat that as a DEFINITE height
for a percentage child. Measured in the browser: the holder painted 1225 × 210
and the container inside it 1225 × **0**. No axes, no legend, no lines, no
`<svg>` element. Every other chart in this app already sizes definitely
(`h-72`, `h-44`, `SeriesChart`'s `style={{height}}`); this was the single
exception and the single blank. It is `h-[22rem]` now.

**AND NOTHING COULD SEE IT — EIGHT INVARIANTS ON THIS CARD, ALL GREEN.** The
coverage line, the flow-adjusted return against the unadjusted one, the external
capital in rupees, the value not proven to be performance, the three-list
partition: every one of them reads `innerText`, and every one of them was
CORRECT while the chart beside them was an empty frame. Verified by
reintroducing the bug — the old holder puts the blank back and not one
pre-existing check fails. **A chart is checked on its geometry or it is not
checked**, which is the same rule this file already reaches for the headline's
layout, Export Excel's row and the KPI overlay anchor, arriving at the one
element that is nothing BUT geometry. `ctx.navChart` measures the painted SVG,
each curve's `d` length and vertex count, the axis ticks, the legend's order and
the range control.

**THE AXIS WAS NOT A TIME AXIS, WHICH IS THE OTHER HALF OF "PROPER".** It was
`dataKey="date"` on a CATEGORY scale over the book's seven statement dates, so
10 → 11 August (one day) took the same width as 10 → 27 July (seventeen), and
every segment's slope was a fact about ROW ORDER rather than about time. It is
`type="number" scale="time"` now, ticked one per year/quarter/month by span —
`SeriesChart`'s rule, on timestamps.

**AND THE "INDEX" WAS SEVEN STRAIGHT SEGMENTS.** `rebasedIndex` samples the
index AT THE BOOK'S DATES, which is exactly right for the comparison pill and
wrong to draw: a line through seven sampled closes is not the Nifty 500's path.
`indexCurve` draws every settled close the feed carries. The two now serve their
own purposes and the check tells them apart on VERTEX COUNT — 245 against 7.

#### The larger period is asymmetric, and saying so is the whole of the honesty

**THE BOOK'S OWN DATED SERIES IS FIVE WEEKS AND CANNOT BE LONGER.** Measured
rather than assumed: `BOOK_NAV_HISTORY` is 7 points over 2026-07-10 → 2026-08-13,
and the per-account histories reach back only to 2026-05-31 — the whole archive
is four and a half months (§"AND YTD / CALENDAR-YEAR ON A HOLDING IS NOT
MEASURABLE HERE"). No range control invents a point.

What CAN be lengthened is the INDEX's context around it, and `/api/prices`
carries years of `^CRSLDX` daily closes. So a `Book window · 3M · 6M · 1Y · 3Y ·
5Y · Max` control governs how far back the index is drawn, defaulting to **1Y**
— the ask was for a larger period, and opening on the book's own window would
show exactly what was complained about. Four rules keep it honest:

- **BOTH LINES ARE REBASED AT THE BOOK'S FIRST POINT, NOT THE WINDOW'S.** That is
  the only base at which the comparison is exact: both pass through 100 on the
  one date both measurements exist for. Rebasing to the left edge of a five-year
  window would put the book's line at whatever level the index happened to reach
  by July and invite a reader to compare two numbers struck from different starts.
- **THE MEASURED STRETCH IS SHADED**, at every range wider than itself. On the 1Y
  view most of the axis is index history the book has no measurement over, and an
  unshaded chart invites the reader to read the whole width as a comparison —
  a caption widening a figure it does not narrow, arriving through a time axis.
- **THE HEADLINE PILLS STAY ON THE BOOK'S OWN WINDOW.** Book +0.54% against the
  index's figure over the SAME dates. The selected range's return is stated
  separately, under the chart, as the index's own and labelled *market history
  rather than a comparison* — never set beside a book figure struck over a
  different period.
- **ONLY THE BOOK RANGE CAPS THE END.** Everywhere else the index runs to its own
  last settled close, which is the useful half of asking for a longer period:
  where the market has gone since the book was last marked. The book range caps
  because its label promises the window both lines cover, and **a control that
  describes itself wrongly is the same defect as a caption that does.**

**SIX SERIES COLOURS BECAME THEME VARIABLES.** `#d9c48f` on ivory is a line a
reader cannot see, and `#2b2668` grid lines are a near-black web on it — and the
light-mode sweep could not report either, because an SVG `stroke` is not a
Tailwind utility and there is no computed class to resolve. `--chart-grid`,
`--chart-axis`, `--chart-book`, `--chart-index`, `--chart-nav` and `--chart-band`
are defined for both themes in `index.css`; champagne darkens to `#8a6a1c` on
light, exactly as `.text-champagne-400` already does. This also gives
`SeriesChart` the `--chart-grid` it has always referenced and never had.

**AND THE LEGEND'S ORDER IS STATED, BECAUSE IT DIFFERS FROM THE PAINT ORDER ON
PURPOSE.** The book's line is drawn LAST so it sits above the index — seven
points against up to thirteen hundred closes — and a legend following the
children would then lead with the index on a card whose subject is the book.

**SIX BUGS REINTRODUCED, EACH FIRING EXACTLY ITS OWN CHECK**: the old
`min-h`/`flex-1` holder, the category axis, a range control defaulting to the
book's window, the sentence naming the measured window, the index sampled to the
book's dates, and the shaded band removed. Two of them exposed defects in the
CHECKS first, which is the point of doing it — a vertex counter that split on
`[LM]` read **1** for a 245-point curve, because these lines are
`type="monotone"` and recharts emits one `M` and a cubic bezier per point with
not an `L` in the whole path; and the band assertion was first struck on `cio`,
which serves no price feed, so the chart is correctly the book's own window with
nothing to mark. The band belongs on `cio-live`, where a wider window exists —
and it asserts the window really IS wider before requiring the band, so it
cannot pass by asserting nothing.

**WHAT IS STILL NOT DRAWN, AND WHERE THE LONGER COMPARISON ACTUALLY LIVES.**
`BOOK_ACCOUNT_RETURNS` carries the managers' OWN published 1m/3m/6m/1y and
since-inception returns for 12 accounts, each beside the benchmark that manager
publishes — real primary-source figures over genuinely long periods. They are
per-mandate, on different fee bases (`after`/`before`), against different
benchmarks (N50TRI, S&P BSE 500 TRI, NSmCap250TRI) and each ends at its own
statement date, so they can never be averaged into a book return. `/performance`
already renders them per account and this card deliberately does not duplicate
them.

**AND `/performance` STILL CARRIED THE ABSENCE THIS CARD EXISTS TO CORRECT —
FIXED AT STAGE 10ar.** Its "NAV trajectory" card rendered an `AbsentSection`
reading *"No valuation series in this book · each account's statements carry
exactly two dated portfolio values"* — the same premise Stage 10p measured and
found false, standing one route over from a chart built on the data it says does
not exist. It was named here rather than fixed because the family had pointed at
Morning CIO, as the sixth absence against an unchecked premise and *"one
`<NavVsIndex />` away"*. It draws that chart now, off the same generated series,
and `check:pages` asserts BOTH that the old wording is gone and that the series
is there — a build that deleted the card satisfies the first and draws nothing.

### Stage 10x — Knowledge & Memory, Macro Research and Economy & Macro: REMOVED

*"remove all three pages from the dashboard UI"* — the three nav entries,
pointed at.

`/knowledge`, `/macro` and `/economy` redirect, the three nav entries are gone
and `Knowledge.tsx`, `MacroResearch.tsx` and `Economy.tsx` are deleted, along
with every module left with no other caller: `lib/knowledge.ts` (the note
store), `lib/econCalendar.ts` and `EconomicCalendar.tsx` (Stage 9d's release
calendar), `YieldCurve.tsx`, `lib/exportChart.ts`, `lib/exportSeries.ts` and
`lib/macro.ts` — the last of which was ALREADY uncalled before this change and
went because it is the removed page's own feed client.

**ALL THREE FORWARD TO THE DASHBOARD HOME, WHICH IS A DECISION RATHER THAN A
DEFAULT.** Every other removal in this file sends its address to the surviving
surface nearest its purpose — `/private` to the private book, `/watchlist` to
Compare Companies (since removed itself — Stage 10ap — so both now go to the
Portfolio Monitor), `/household` to Family & Entities. Nothing that survives
holds the family's own notes, and nothing that survives renders a commodity,
index, currency or macro series. Pointing these at a page that merely LOOKS
adjacent would assert a continuity that does not exist. `/industry`, removed at
Stage 9c and forwarded to `/macro`, moves with it.

**WHAT DID NOT GO WITH THEM — and this is the half a removal like this breaks
silently.** `src/lib/series.ts` and `SeriesChart.tsx` were most visibly read by
the two pages that have just gone, so they now LOOK dead. They are not:
`ReturnsTable` draws a company's price history with `Point`, `SeriesMeta`,
`HORIZON_COLS`, `RANGES`, `fmtLevel`, `fmtReturn` and `rebase`, off
`/api/prices`; `NavVsIndex` fetches through the same client and
`navSeries.test.ts` reads the same shapes. (`CompareCompanies` was a third
reader and has since been removed — Stage 10ap.)
The `stock` invariant that asserts the price card renders is what holds them up
at runtime, and it says so in as many words; `SeriesChart` itself is held by the
BUILD, because the harness serves no price feed and the chart never mounts, so
the gate for this change is build AND sweep rather than either alone.

**AND `public/series/` AND `npm run harvest` STAY, WHICH IS THE ONE DECISION
HERE THAT IS NOT REVERSIBLE IF TAKEN THE OTHER WAY.** No page reads the store
now — `fetchSeriesIndex` and `fetchSeriesPoints` have no caller, and
`src/lib/series.ts`'s header says so plainly rather than leaving a silent
orphan. But seven RBI policy rates and IEX's day-ahead spot power are
ACCUMULATING series: their sources publish a current value and no history, so
the store builds them one observation per run. Stopping the nightly harvest
would not pause those series, it would END them, with nothing to backfill from.
Deleting the only reader of a store a nightly job keeps growing is the wrong
half to cut, and a documented no-caller is not the dead-builder failure this
file names — that failure is the SILENT orphan a future session wires back
believing it load-bearing.

**TWO CLOUDFLARE FUNCTIONS ARE NOW UNCALLED AND ARE LEFT STANDING**:
`functions/api/econ-calendar.js` and `functions/api/macro.js`. The request was
for the dashboard UI, and an endpoint is a deployment surface rather than a
page; both are stateless proxies, so nothing accumulates in them and nothing is
lost either way. They are named here rather than removed quietly, and either can
go on request. `check:pages`'s failed-request noise list no longer excuses
`/api/econ-calendar`, `/api/macro` or `/api/economy`, so a stray request to any
of them is now REPORTED instead of suppressed.

`check:pages` no longer walks the three routes, and the `knowledge` and `macro`
invariant blocks went with the pages they described. `check:family` carries the
removal instead: the four redirects land, the three nav entries are gone, the
now-empty KNOWLEDGE nav GROUP heading is gone with its one entry, and each page
renders NONE OF ITS OWN CONTENT at its old address — struck on each page's own
distinctive phrases rather than on its title, because a title survives in a nav
entry while the page is gone.

**A CHECK THAT COULD NOT CATCH WHAT ITS COMMENT CLAIMED, FOUND BY REINTRODUCING
THE BUG.** The `/industry` row was written to catch a redirect pointed at a
removed page. Pointed back at `/macro` it still PASSED — `/macro` now forwards
to `/cio`, and two hops settle at the same pathname as one. The suite reads
where a bookmark LANDS, and by that measure both routings keep the promise, so
the chain is a fact about the route table: fixed there, named there, and the
comment here corrected to claim only what it proves. Five other bugs were
reintroduced — the page restored at its address, its route un-redirected, its
nav entry put back, the group heading with it, and `ReturnsTable` dropped from
the company page — and each fired exactly its own check.

### Stage 10y — THE TILE IS THE AFFORDANCE, AND THE ARITHMETIC MOVES TO THE PAGE

*"remove the remaining underlines from the texts, and even the calculation that
we're showing that appears when click the underlined no. we can show that inside
the clickable KPI pages. Just make the KPI tiles look like 3-d clickable buttons
and remove every other underlines/hyperlinks on the texts."*

Stage 10v made the whole card the click target and left both underlines on it. So
each tile carried THREE affordances for one action: a dotted-underlined LABEL, a
dashed-underlined FIGURE that opened a popover, and the card itself. Two of them
pointed at text that is not the thing to click.

**THE AFFORDANCE IS THE SURFACE NOW.** `.card.kpi-btn` in `index.css` — an inset
top highlight (the lit edge), a hard offset shadow (the tile's thickness) and a
soft cast shadow (its distance from the page); hover lifts it, `:active` presses
it flat, `prefers-reduced-motion` keeps the depth and drops the movement. Written
as plain CSS with explicit colours rather than as Tailwind utilities, because
every `ink-*`/`slate-*` utility needs its own light-mode remap **including each
opacity variant**, and a four-layer shadow assembled from them would need four.

**IT IS `.card.kpi-btn`, NOT `.kpi-btn`, AND THE FIRST DRAFT SHIPPED FLAT.**
`html:not(.dark) .card` sets a box-shadow of its own further down the same file
at equal specificity, so source order decided it and every tile rendered as an
ordinary panel — a raised button that was not raised, with the entire sweep
green. `check:pages` resolves computed COLOUR and has never looked at a shadow.
Qualifying with `.card` puts the rule above any `.card` rule wherever either
lands in the file.

**AND THE RAISED LOOK IS ONLY ON A TILE THAT OPENS SOMETHING.** `Kpi` applies it
only where `href` is set, so the drill-down page's own four summary tiles stay
flat. A card that presses under the pointer and then does nothing is a worse lie
than a flat one — which is why the invariant is struck in BOTH directions, on two
different pages.

**THE ARITHMETIC IS ON THE PAGE THE TILE OPENS.** `drilldownFormula(d, money)` in
`drilldown.ts` returns the `FormulaDef` for a set, and `/holdings` renders it as
a card between the tiles and the table: the expression, the worked example, and
the paragraph. It sits beside the SET DEFINITION for the reason this whole file
exists — an explanation kept anywhere else drifts from the rows it explains — and
takes the money formatter as an argument rather than importing one, because every
figure here renders in the reader's selected display currency through
`fmtFromBase` and a formatter fixed in a lib prints rupees on a page showing
dollars. Same seam `auditFormulas.ts` already uses.

**IT IS STRUCK ON `d.rows`, WHICH IS THE ACTIVE FACET.** A version summed over
the whole scope reads correct on the undivided page and prints ₹710.4 Cr under a
heading saying "Private" — the caption-does-not-describe-its-figure failure the
Capital invested tile already cost this book once, arriving one click deeper. The
invariant compares the worked line against the page's OWN rendered total, and on
the private half additionally requires it NOT to equal the NAV.

**ONE OF THE REMOVED POPOVERS WAS WRONG, WHICH IS WHY NOTHING REPLACES IT.** Dry
powder's read `= Σ (Committed − Called) across funds`, and this book does not
derive it that way: Private Market's own tile says it is *"summed exactly as each
statement prints it, never derived from committed − drawn"*, because two folios
print a commitment and a drawdown and NO undrawn figure, and subtracting there
would assert a fund has nothing left to call. The page that tile opens already
carries the correct explanation beside Committed and Drawn.

**THE MONEY-WEIGHTED PAGE DOES NOT RESTATE ITS RATE, DELIBERATELY.** That figure
is a pooled XIRR over every account's dated flows, each closing on its own report
date; re-deriving it in `drilldown.ts` would be a SECOND source for one figure.
The page owns the SET — which accounts qualify, what they are worth, which 42 sit
outside — and the rate stays on the tile it was clicked from.

**SCOPED TO THE KPI STRIP.** The allocation table's per-bucket returns and its
footer still open a formula popover. That is deliberate rather than overlooked:
the footer's popover is the one place left that reconciles the money-weighted
whole-book figure against a column of return-on-cost cells — the Book performance
card that also carried it was removed in Stage 10t, and the Consolidated return
tile's went in this change. Removing the third would delete the reconciliation
this file's own "a total must tie to its own columns" rule exists to preserve.

**FIVE BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: the label underline back
on a tile, the `.card` qualifier dropped so the tiles go flat, every card raised
so a panel poses as a button, the formula card deleted, and the formula summed
over the scope instead of the facet. Two of them needed a second attempt to
reproduce, which is itself the finding — the light theme is what the sweep walks
first, so a bug introduced only in the dark rule changes nothing it can see.

### Stage 10z — THE SAME HOLDINGS, SLICED THREE WAYS

*"We should also be able to see this information: category wise (MF, direct
equity, Bonds, PMS, AIF etc), asset class wise (Equity, debt etc), my basket
definition wise (core, tactical etc). Default view will remain the current one,
category wise. Create separate filters/toggles for asset class wise and basket
definition wise."*

One set of rows, three groupings. `?group=` picks the axis, like every other
view in this app, so a slice is a link rather than an instruction. **The default
is untouched and asserted to be** — two new axes beside an old one is exactly
the change that silently moves the default, and the page would render perfectly
while showing the family a table they asked to keep.

*(THE MONITOR'S DEFAULT HAS SINCE MOVED, AT THE FAMILY'S REQUEST — see Stage
10cm. `/monitor` opens on All Securities and this table is
`/monitor?group=category`; Morning CIO's allocation card still opens on
Category. The rule above is why the move is asserted rather than assumed.)*

*(THE AXIS MACHINERY HAS SINCE MOVED to `src/lib/groupAxis.ts` — Morning CIO's
allocation card groups on the same three at the family's request, and two copies
of "which section does this holding sit in" would be two chances for one screen
to file a holding under a basket the other puts somewhere else. See Stage 10ad.
Nothing below changed except where it is defined.)*

| Axis | Sections | Where it comes from |
| --- | --- | --- |
| **Category** (default) | Direct Equity · PMS mandates · ETF · Mutual Fund · AIF · Cash | `holdingBucket` — the book. Unchanged |
| **Asset class** | Equity ₹640.9 Cr · Alternate ₹28.5 Cr · Cash ₹14.1 Cr · Debt ₹5.6 Cr | the family's review |
| **Basket** | Stable Growth ₹412.7 Cr · Thematic & Tactical ₹243.7 Cr · Liquidity ₹27.5 Cr · Entrepreneurial Growth ₹5.1 Cr | the family's review — audited back against it, see Stage 10ae |

**ALL THREE SUM TO ₹710.39 Cr**, which is `BOOK_SUMMARY.totalValue` — the same
holdings rearranged, on the deduped basis the footer is on.

**THE TWO NEW AXES CANNOT BE DERIVED, AND THAT WAS MEASURED RATHER THAN
ASSUMED.** Our `AssetClass` says what an instrument IS; the family's says what
EXPOSURE it carries, and three of our five classes map to more than one of
theirs — `AIF → Equity / Alternate / Debt` (Sanshi against Baring PE against Neo
Infra), `Mutual Fund → Equity / Cash`, `ETF → Alternate / Cash` (DSP Gold
against Liquid BeES). **₹480 Cr of this book sits in those three**, so a
wrapper-based guess would misfile most of the money. Only two are safe by
definition and are derived: a company share is equity exposure under any
taxonomy, and cash is cash. `familyTaxonomy.test.ts` asserts the ambiguity
itself, so the day our own class could answer it the suite says so rather than
the map silently outliving its reason.

**AND IT IS A HAND-VERIFIED MAP, NOT A NAME MATCHER, BECAUSE THE MATCHER WAS
WRITTEN FIRST AND WAS WRONG.** It produced false positives that each filed a
real holding under the wrong basket:

```
"Motilal Oswal Active Momentum Fund"      → "Motilal Oswal Founders Fund II"
"Motilal Oswal Wealth Delphi Equity Fund" → "Motilal Oswal Founders Fund II"
"ICICI PRU BAF" (Balanced Advantage)      → "ICICI Pru India Opportunities Fund"
```

Sharing a fund HOUSE is not sharing a FUND — the index-cycled-valuation-method
failure arriving through string similarity, and invisible on screen because a
basket heading looks equally authoritative whichever rows are under it. The
depository's own abbreviations settle it in the other direction too: no
similarity measure gets from `WOC MAAF D-GROW` to WhiteOak Capital Multi Asset
Allocation Fund, and one stretched far enough to try would also match funds that
merely share a house. Every entry was read off the workbook, and then **38
adversarial verifiers — prompted to refute, and to default to refuted when
unsure — upheld all of them, with zero refutations.**

**THE WORKBOOK CARRIES THE ANSWER THREE TIMES AND THE THREE AGREE.** Four basket
sheets (the sheet a product sits on IS its basket), four asset-class sheets
(likewise), and a basket CODE column on the asset-class sheets. The code column
and the basket sheets are INDEPENDENT witnesses, cross-checked before a line of
the map was written: **33 of 33 agree, zero disagreements**, and all 82
basket-sheet products appear on an asset-class sheet. That is what earns this a
committed map rather than one reading of a spreadsheet.

*(The map has since been AUDITED back against that workbook, and the workbook is
now part of the suite rather than only its source — 57 entries, zero mismatched.
See **Stage 10ae**, which also records the three private-equity holdings this
first pass did not reach and the near misses it deliberately still refuses.)*

**THE REVIEW IS STILL NOT A SOURCE FOR THESE FIGURES.** §"the consolidated
review workbook is not a source — by decision" holds of every figure on these
two axes: each is the book's own. *(The family have since made the review THE
source of the PRIVATE-MARKET lines alone — Stage 10dh — which is a different set
of rows and changes nothing here: a basket and an asset class are a
CLASSIFICATION and never a figure.)* What was taken is a CLASSIFICATION the
family made, which is the `familyInputs.ts` category — and it is committed
rather than held in
`localStorage` because they supplied it as a document rather than typing it in,
the same standing `shared/sectors.mjs` has. `build-book.mjs` must never import
it, and `glowData.ts` regenerates byte-identically with it in the tree.

**A RULE FILLS GAPS AND NEVER OVERRIDES.** The family's email puts "all the
direct stocks" in Thematic & Tactical, and their workbook corroborates it on all
15 direct stocks it names, with no counterexample — so a company share the
review does not name is filed there and **tagged `rule`, never `review`**, with
the section printing how much of it was placed that way. The same sentence lists
"PMS", and their own workbook puts the **Carnelian** PMS under Stable Growth —
so that clause is deliberately NOT applied, and the suite asserts Carnelian
stays where the workbook put it. A rule with a known counterexample is not a
rule this book will apply to money.

Coverage: **₹680.9 Cr named product by product, ₹11.2 Cr by the rule, ₹21.4 Cr
unclassified** — and the unclassified is essentially one holding, Motilal Oswal
Active Momentum Fund at ₹21.4 Cr, which the 30 June review does not list.
Everything else in it is worth ₹0. That section names its cause rather than
reading "Other", which would look like a bucket the family chose.

**THE FILTER FOLLOWS THE AXIS, AND THAT IS A CORRECTNESS FIX.** Its options are
the active axis's sections, and reintroducing the bug is what proved the point:
the filter was still testing the CATEGORY key while the dropdown offered
baskets, so picking one would have matched no row and emptied the table
silently. Switching axis also clears the selection, for the same reason —
`setGroupAxis` is the only way in, so no caller can reintroduce it.

**AND THE SECTION BOUNDARY IS STRUCTURAL NOW.** `check:pages` used to find where
one section ends by matching a hardcoded list of heading NAMES, where a missing
entry is the dangerous direction: an unrecognised heading is not a boundary, so
the section above swallows every row below it. Three axes would triple that
list. Headings carry `data-section` / `data-axis` / `data-subtotal` instead —
the contract `data-mandate` and `data-row` already carry, and the same rule: a
structural claim must not depend on prose a redesign is free to reword.

**THE EXCEL EXPORT CARRIES ALL THREE AT ONCE**, as columns rather than sections:
a tab can only be grouped one way, a spreadsheet can be pivoted on any column.
They close the sheet with the other descriptors, and the suite asserts both the
order and that neither column is stuck on one constant — which is how a
defaulted field looks.

**Seven bugs reintroduced, and one of them was real.** The default axis moved,
a section dropped from the partition, a section counting rows instead of
holdings, the unclassified section losing its cause, the rule disclosure
dropped, the filter keeping the wrong "all" label, and the stale filter — each
fired exactly the right check. The stale-filter test is the one that earned its
keep: it passed at first, and finding out why exposed the live filter/axis
mismatch above.

### Stage 10aa — THE TILES ARE A LABEL AND A FIGURE, AND THE CAPTIONS MOVE

*"remove these small subtext from the clickable KPI buttons since these are also
already written inside each KPI pages."*

Stage 10y made the tile a button and moved the arithmetic to the page it opens.
The captions under each figure stayed, and they were the last chrome on the
strip. **The premise was checked line by line before anything was removed**,
which is the whole of this section: eight of the ten captions were indeed already
on the page their tile opens, and **two were not**.

| Caption | Already on the page it opens? |
| --- | --- |
| `Listed ₹358 Cr · Private ₹352.3 Cr` | yes — the facet toggle, with each half's count |
| `+ ₹47.1 L accrued income, not in this figure` | **NO** |
| `cost in · covers ₹544.4 Cr of ₹710.4 Cr` | yes — the page's own total and its share of the book |
| `60 positions worth ₹165.9 Cr carry no cost basis` | yes — the facet chip and the tile beside it |
| `134-day window · not annualised` | **NO** |
| `7 of 49 accounts · ₹110.4 Cr of ₹710.4 Cr` | yes — the lead, the total and the excluded list |
| `on capital invested · whole book` | yes |
| `cumulative, not annualised` | yes — that page's Return on cost tile |
| `undrawn fund commitments` · `cash returned to date` | yes — Private Market's own tiles |

**SO THE TWO MOVED RATHER THAN WENT.** The accrued-income disclosure is in the
`book` drill-down's arithmetic card, because a NAV that excludes accrued income
differs from a manager's printed total by exactly that and a reader reconciling
the two has to be told. The XIRR window is on `?of=measured`, **derived there
from the same flows and the same accounts the rate is struck over** — 134 days
either way, which is the two derivations agreeing rather than one copying the
other.

**THAT SECOND ONE IS STAGE 10g(ii)'s GUARD, AND IT CANNOT SIMPLY BE DELETED.**
The tile once read **+99.0%** because a 132-day return was compounded onto a
year; nothing was miscalculated and it contradicted the managers' own annualised
since-inception figures for those very accounts. `moneyWeightedReturn` refuses to
annualise a sub-year window and **the caller must say so** — the caller is now
the drill-down, which states the window, the refusal, and what compounding it
would claim.

**AN ABSENT TILE KEEPS ITS ONE LINE.** `sub` is removed only from the populated
branch. An em dash must name its cause (`Absent.tsx`), so a tile whose figure the
book does not carry still says why. On this book none are absent, which is
exactly when that distinction is invisible — so it is a check rather than a
comment.

**AND THE CHECKS HAD TO MOVE OFF THE CAPTIONS THEY WERE READING.** Seven
invariants failed and five more abstained the moment the captions went, because
`CIO_FIGURES` parsed `listed`, `private`, `no-cost` and `measured` OUT OF THEM.
Every claim survives, struck where the fact now is:

- The two gates that decide whether a missing facet toggle is a finding or an
  honest abstention (`BOOK_HAS_BOTH_HALVES`, `TILE_NAMES_COSTLESS`) read
  `glowData.ts` now instead of a tile caption. Read off the page they would have
  started abstaining silently the moment the caption was reworded — and removing
  the captions outright is precisely that event.
- Listed + Private = NAV moved to `holdings-private`, anchored on the two pages'
  own rendered totals plus the NAV the tile still prints. **Three independently
  produced figures rather than one sentence split three ways**, so a page showing
  the wrong half now fails instead of agreeing with the caption it came from.
- Costed + cost-less = NAV is the same shape on `holdings-nocost`.

**TWO OF THE NEW CHECKS COULD NOT FAIL, AND REINTRODUCING THE BUG IS WHAT FOUND
BOTH.** "What the NAV excludes is named" gated on the PAGE containing the words
"accrued income" — so deleting the sentence read as *this book has no accrued
income* and abstained; it is gated on the book now. And "a tile with no figure
still names why" required two lines, which is exactly what an unexplained
`DRY POWDER / —` renders; it requires three.

Five bugs reintroduced in total, each firing its own check: a caption back on a
tile, the accrued disclosure deleted, the window deleted, the private half
widened to the whole book, and an absent tile stripped of its reason.

### Stage 10ab — EVERY METRIC, TOTALLED FOR EACH CATEGORY

*"Show aggregate totals for every metric for each category investments."*

The Portfolio Monitor sections its holdings by CATEGORY — `holdingBucket`, the
grouping Stage 10L settled after the family reported the same thing three times
— and each section heading has carried a holding count and a market value ever
since. Everything else a reader compares categories on is a COLUMN, and the only
way to compare six categories on it was to add 85 rows by eye.

**EACH SECTION NOW CLOSES WITH A ROW THAT TOTALS ITS OWN COLUMNS.** Measured on
this book, and every figure derived rather than typed:

| Category | Invested | Market value | Weight | Unreal. P&L | Realised | Return |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Direct Equity | ₹1.22 Cr\* | ₹94.9 Cr | 13.4% | −₹22.9 L\* | +₹7 L | **refused** |
| PMS mandates | ₹124.6 Cr | ₹138.7 Cr | 19.5% | +₹14.1 Cr | +₹1.32 Cr | +11.36% |
| ETF | — | ₹24.6 Cr | 3.5% | — | — | — |
| Mutual Fund | ₹52.4 Cr\* | ₹99.9 Cr | 14.1% | −₹26,209\* | — | **refused** |
| AIF | ₹293.7 Cr\* | ₹352.3 Cr | 49.6% | +₹58.6 Cr\* | — | +19.95% |
| Cash | ₹0 | ₹0 | 0.0% | ₹0 | — | — |
| **Total** | **₹471.9 Cr** | **₹710.4 Cr** | **100.0%** | **+₹72.5 Cr** | **+₹1.39 Cr** | **+15.37%** |

\* struck over the holdings that report a cost — 9 of 37, 2 of 24, 15 of 19 —
with the uncovered value named in the cell's own hover.

**AND IT FOLLOWS THE AXIS, NOT THE CATEGORY.** Stage 10z made the table
sectionable three ways, so the partition keys on `groupKeyFor(groupAxis, …)` —
the same function the ROW build keys its section on — and the row's label on
`groupLabelFor(groupAxis)`. Keying it on `bucketFor` while the table sections on
Basket would have totalled the CATEGORY a holding sits in and printed it under
the basket's heading: every figure right, every one under the wrong name, which
is the caption failure this file already records twice.

**IT IS A ROW OF CELLS, NOT A WIDENED HEADING, AND THAT IS THE WHOLE DESIGN.** A
total belongs UNDER THE COLUMN IT TOTALS. This book has already paid twice for a
figure printed under a heading that describes something else — the allocation
footer carrying a money-weighted return in a column of returns-on-cost, and the
Morning CIO tile captioned "cost in · listed only" over a whole-book sum. The
heading keeps its name, count and size; the metrics sit where their column is.

**THE PARTITION IS OF THE POSITIONS THE FOOTER ITSELF SUMS**, so the categories
add to the Total row BY CONSTRUCTION rather than by a tolerance. Summing the
ROWS instead would tie for market value and could miss for the other two: a
consolidated row carries `mv − cost` as its P&L while the footer sums the lots'
own, and those differ the moment one security is consolidated from a costed lot
and an uncosted one. **Measured, that condition is 0 of 216 groups on this book**
— the wrong construction would tie here and no check could catch it — so it is
written down beside the code rather than tested for, and the right construction
was chosen before a drop makes the difference visible instead of after.

**A RETURN IS REFUSED WHERE THE TWO COLUMNS BESIDE IT COVER DIFFERENT SETS.**
`sumOrNull` skips a holding whose statement reports no cost, so Invested covers a
narrower set than Market value — and Direct Equity reports a cost on 9 of its 37
holdings. A return on cost there would sit between a printed ₹1.22 Cr invested
and a printed ₹94.9 Cr current and describe neither. That is the failure Morning
CIO's allocation row was already fixed for, so **the test is now
`costCoversSet` in `analytics.ts` and BOTH screens call it**: the two print a
return per bucket over the same buckets, and a test copied into each is two
chances for one screen to show a figure the other refuses for the category a
reader is comparing them on. Same reasoning as `holdingBucket` itself being one
function rather than a per-page reflex.

**AND THE HEADING'S SUBTOTAL IS NOW THE SAME FIELD THE ROW PRINTS.** It used to
walk the rows collapsing repeated `dedupeGroup`s — a correct computation, and a
SECOND SOURCE for a figure that now appears twice in one section. The two agreed
except in the by-entity view, where they would have picked different members of
the ₹1.46 Cr pair and printed marks ₹87,950 apart under one heading. One figure,
computed once, printed twice. `collapsed` is now derived as the gap between the
rows on screen and that printed subtotal, which is what its note has always
claimed.

**THE FOOTER'S WEIGHT CELL WAS EMPTY AND IS NOT ANY MORE.** A column of shares
with no total is a set of figures a reader cannot check by adding. It reads
100.0% unfiltered — the denominator IS this table's book — and less under a
company filter, which is the gap the caption below already explains.

**FOUR COLUMNS CAN NEVER HAVE A CATEGORY TOTAL, AND EACH SAYS SO.** Quantity —
shares of one company plus units of a fund is a number with no unit; average cost
and CMP — both per-unit, and a category has no unit; YTD — the same absence its
own rows carry, since no statement in this book is dated before the year began.
All four render `AbsentCell` WITH A REASON rather than sitting blank: a reader
who scans an empty cell learns nothing about whether a figure was withheld or
never existed, which is this book's founding rule arriving one row above the
footer that already keeps it.

**REALISED IS CLAIMED BY ONE CATEGORY, NEVER SPLIT.** A name's realised gain is
reported PER SECURITY across the whole book, so the categories claim each key
once, in reading order, and the sum is the footer's own union total. A name held
both directly and inside a mandate is the case that makes the rule necessary and
the case this book does not contain (zero of 175 distinct equity names); when one
arrives the cell says the figure was ATTRIBUTED rather than divided, because
there is no per-category split on any statement to divide it by.

**EIGHT INVARIANTS, EACH VERIFIED BY REINTRODUCING ITS BUG.** `check:pages` reads
the totals rows and the footer BY COLUMN — accumulating `colSpan`, because the
footer's label spans three columns and a category's spans one, and cell-for-cell
the two rows are different measurements. Seven bugs were put back one at a time
and each fired exactly its own check: a partition that skips the dedupe (three
checks), the coverage test dropped so a return prints beside two columns covering
different sets, a dash with no reason, the footer's Weight cell emptied again, a
category that quietly stops drawing its row, the section reader counting the
totals row among the holdings, and the totals keyed on the wrong AXIS — the last
of which is what found the gate hole two paragraphs down.

**THE CHECKS ARE STRUCK ON THE SECTIONS THE PAGE DECLARED, NOT ON A LIST OF
NAMES.** The first draft counted the `BUCKET_HEADINGS` that `sectionOf` could
find, which would have FAILED the asset-class and basket routes outright while
claiming to check them: those axes draw the family's own section names, which
that list does not and must not know. Matching `data-section` keys one-for-one
against `data-category-total` keys is also the stronger claim — equal counts pass
a page that totals one section twice and another not at all.

**AND THE SEVENTH BUG FOUND A HOLE IN THE GATE ITSELF.** Keying the partition on
`bucketFor` while the table sections on an axis Stage 10z added is the one
mistake this integration can make, so it was put back deliberately. The
asset-class route failed six checks — its keys overlap the category ones. The
BASKET route reported NOT CHECKED six times and **the sweep read CLEAN**: with no
key matching, every totals row disappeared, and a gate that abstained on "no
totals row captured" could not tell that from a table with one section.

That is `golden.mjs`'s rule and this file's own *"a missing toggle must be a
finding"*, arriving through a subtotal. Abstention is now allowed on exactly one
EVIDENCED condition — the page drew fewer than two sections, read off its own
`data-section` headings, which is the single-category filter where the footer IS
the total. Sections drawn and nothing totalling them is a failure, and so is a
footer that has lost its handle. Re-run against the same bug, the basket route
fails five.

**THAT LAST ONE WOULD HAVE BROKEN SIX EXISTING CHECKS SILENTLY.** The totals row
is a table row by every structural test `sectionOf` applies — a cell per column
and therefore a tab per boundary — and six invariants read `sectionOf(...).rows`
as "the holdings drawn in this section". Its Qty cell is an em dash BY DESIGN, so
"the first cell after the security name is a figure" fails on it. `sectionOf`
keeps it out of `rows` and exposes it as `total`, and a new invariant asserts the
exclusion against the rows the DOM says are holdings rather than against a count
of itself.

**AND TWO BUGS WERE IN THE CHECKER, BOTH FOUND BY THE FIGURES NOT ADDING UP.**

- **`crU` read a suffix-less figure as CRORE.** `fmtFromBase` drops the suffix
  below a lakh, so `−₹26,209` — Mutual Fund's real unrealised loss — came back as
  −₹2,620.9 Cr, four times this whole book, and the categories summed to
  −₹26,136 Cr against a printed +₹72.5 Cr. It is the plausible-wrong-number
  failure this file exists to catch, arriving in the checker rather than in the
  page. Fixed at `crU`, so every caller that allows an optional unit gets it.
- **`[+-−]` IS A RANGE, NOT THREE CHARACTERS.** Unescaped, the hyphen makes a
  range from `+` (U+002B) to `−` (U+2212) that swallows every digit and the rupee
  sign with them: the percent parser read `13.4%` as 3.4 and `100.0%` as 0, and a
  weight column summing to 30.1 against a printed 0 was the only sign of it.

**WHAT IS DELIBERATELY UNCHANGED.** Selecting a single category hides the
sections and the FOOTER is that category's total, which is complete and needs no
second row. The Excel export keeps its own footer and no per-category subtotals —
the ask was about the tab, and Stage 10n's record of the column reorder is that
the export follows when the family asks it to.

### Stage 10ac — THE ALLOCATION TABLE LOSES ITS UNDERLINES TOO

*"remove the underlines from the allocation table too."*

Stage 10y scoped the underline removal to the KPI strip and named the allocation
table as deliberately untouched, because its footer popover was the last place
reconciling the money-weighted whole-book figure against a column of
return-on-cost cells. The family have now asked for it, so that reconciliation
had to find a home before the popover could go — which is this section.

**TWO KINDS OF UNDERLINE, AND ONLY ONE OF THEM WAS A LINK.** The row labels and
`Total` were dotted-underlined `<Link>`s; the return chips were dashed-underlined
popover TRIGGERS. Removing the decoration alone would have left the second as a
click target nobody can see, so the chips lost their popovers and the labels kept
their links: **the rows are still clickable, and `check:pages` asserts both
halves** — no decoration and no `<button>` in the table, and a link on every row
that has a set behind it.

**WHERE EACH POPOVER'S CONTENT WENT.** Both were checked against their
destination before being deleted:

- **The per-bucket return** is on `?of=bucket&key=<b>`, whose formula card now
  carries the same worked example — invested, current, the return, and the
  coverage caveat — beside the very holdings it is struck over.
- **The footer's whole-book return** is on `?of=invested`, which is the page the
  Consolidated return tile opens and where that division is already worked out.
- **The money-weighted reconciliation** is on `?of=measured`, and the move made
  it SHARPER rather than merely relocating it: the footer set a whole-book
  cost-basis figure against a seven-account money-weighted one, where that page
  carries both bases for the SAME accounts — its own Return on cost tile and the
  rate the reader clicked. The sentence now names what the gap between them is,
  which is the timing of the flows and nothing else.

**AND THE FIRST DRAFT PUT A FORBIDDEN FIGURE ON SCREEN.** The bucket formula
simply divided, so Mutual Fund's card read **`−0.0% over 2 of 24`** on a page
whose own Return on cost tile correctly showed an em dash, under an allocation
row that showed one too. That is *"a refused figure stays refused one click
deeper"* failing between two surfaces of the same page. `coveredReturn` — the
0.5%-coverage test — moved out of `HoldingsBehind` into `drilldown.ts`, and both
surfaces call it: it was a private helper for as long as one page ran it, and the
moment a second surface stated a return, a second copy would have been a second
definition of "covered enough".

**THE CHECK FOR THAT COULD NOT FAIL EITHER, AND REINTRODUCING THE BUG IS WHAT
FOUND IT.** It tested the worked line for `[+-]\d+\.\d%` — an ASCII hyphen —
and the line renders a real **U+2212 MINUS**, so `= −0.0%` matched nothing and
the check read a page printing a forbidden return as one printing none. It
passed, twice, on exactly the two rows it exists for.

Three bugs reintroduced, each firing its own check: an underline back on a row
label, the rows stripped of their links, and the formula dividing regardless of
coverage.

### Stage 10ad — THE ETFs COME BACK TO THE MOVERS, AND THE ALLOCATION GETS THE FAMILY'S OWN AXES

Two asks on Morning CIO, and each is a request this file has a record of getting
half-right once already.

#### 1. *"ETFs can be a part of stocks… it should actually be stocks and ETFs. Basically, or else… separate tabs, stocks… ETF… mutual fund."*

*(**THE TABS THIS SECTION ADDED HAVE SINCE BEEN REMOVED** — the family asked for
the selectors to go and for the card to show Direct Equity alone, so the set is
back to what Stage 10t narrowed it to. See Stage 10al. Everything below is kept
because the reasoning about CAPTIONS is unchanged and still governs the card:
each one states what its figure covers, and the tile label, the coverage line,
the index sentence and the excluded footer read the set rather than a literal.
What is gone is only the control that let a reader change it.)*

**THE CARD'S OWN HEADER COMMENT HAS QUOTED THE ANSWER SINCE THE DAY IT WAS
WRITTEN.** The request that built Today's movers was *"MY STOCKS AND ETFS are up,
Sensex is down this much, Nifty"*; Stage 10t then narrowed the card to
`DIRECT_EQUITY_BUCKET` and the ETFs went out with the mandate names. That
narrowing was RIGHT about the mandates — a share Carnelian picked is not a
holding the family chose — and wrong about the ETFs, which the family have now
said. An ETF bought in the family's own demat is a holding they chose, priced by
the same feed, on the same session as the shares beside it. Nothing about
combining them mixes two measurements, which is the test that matters.

**SO THE DEFAULT IS BOTH AND THE CONSTITUENTS ARE TABS** — `Stocks & ETFs` ·
`Stocks` · `ETFs` · `Mutual funds` — which delivers both halves of that sentence
rather than picking one. Each scope is a set of `holdingBucket` keys, the same
function the allocation table and the Portfolio Monitor group on, so a tab here
and a row on the allocation table cover exactly the same holdings. That is also
why an ETF held INSIDE a PMS mandate is not in the ETF tab: the manager chose it,
so it belongs to the mandate exactly as a manager-picked share does. The scope
lives in `?movers=`, so a tab is a link.

| Tab | Names | Priced by the fixture |
| --- | ---: | ---: |
| Stocks & ETFs — default | 40 | **36** |
| Stocks | 37 | 33 |
| ETFs | 3 | 3 |
| Mutual funds | 20 | 1 |

**EVERY CAPTION MOVES WITH THE SCOPE, AND THAT IS NOT COSMETIC.** The tile label,
the coverage line, the index comparison and the excluded footer each state what
the figure covers; a caption that widens or narrows a figure it does not is the
failure the Capital invested tile already cost this page once. `subject` and
`verb` ride on each scope because these are SENTENCES — "Stocks and ETFs **are**
−0.2% against the Nifty 500" — and a label interpolated into one has to agree
with the verb after it.

**THE MUTUAL-FUND TAB'S ABSENCE IS ABOUT THE INSTRUMENT, NOT THE FEED**, and it
says so. A fund unit has no NSE trading symbol and the quote feed is keyed on
one, so 19 of the book's 20 schemes can never be priced intraday — told the
generic "no live quote" reason a reader goes looking for a feed fix that cannot
exist. What a scheme DOES publish is one dated NAV per business day struck after
the close, and printing that under a heading reading "today" would set one day's
move beside another's; the tab names where that figure actually lives (each
fund's own page, Stage 10s) rather than substituting it.

**THE FIRST DRAFT'S ABSENCE SENTENCE WAS AN ABSOLUTE AND WAS FALSE.** It read "no
scheme in this book can be priced intraday, today or on any other day" — and the
depository files one Liquid BeES row as a Mutual Fund, which resolves `LIQUIDBEES`
and prices like any listed instrument. The sentence takes the MEASURED counts now
(`19 of the 20 schemes here resolve to none`), which is the same discipline the
rest of this file applies to a premise nobody rechecked.

**AND THE COVERAGE LINE STATES A VALUE, NOT ONLY A NAME COUNT.** `scopeValue` was
already computed in that card's model and rendered nowhere — this book's
most-repeated defect — and the mutual-fund tab is what made it matter: one scheme
of twenty is priced and it is worth ₹18,822 against a ₹99.9 Cr scope, so "1 of 20"
and "₹18,822 of ₹99.9 Cr" disclose the same fact very differently. The second is
the one a reader needs beside a percentage printed at 22px. Every tab now reads
`on ₹X of the ₹Y held, across N of M … names`.

(*"1 GAINERS"* was on the family's own screenshot of this card and is fixed in the
same change: a scope tab makes a one-name list an ordinary outcome.)

#### 2. *"I have given you my baskets… how is the core doing, how is the satellite portfolio doing, how is the liquidity portfolio doing. This should be the Morning CIO page. Add a selector in the allocation section to select asset class wise / category wise / basket wise allocation and performance overview."*

This is Stage 10z arriving on a SECOND SCREEN. The Portfolio Monitor grew those
three axes and owned them privately; Morning CIO's allocation card now groups on
the same three, and two copies of "which section does this holding sit in" would
be two chances for one screen to file a holding under a basket the other puts
somewhere else — the failure `holdingBucket`, `costCoversSet` and
`accountHasOpeningValue` were each extracted for, arriving a fourth time.

**SO `src/lib/groupAxis.ts` IS THE ONE PLACE, AND BOTH PAGES IMPORT IT.** The
section key per axis, its source, its reading order, its heading, the category
order and the filter's "all" label all moved there verbatim; `PortfolioMonitor`
lost 64 lines net and gained no behaviour. Measured on this book, all three axes sum
to `BOOK_SUMMARY.totalValue` **to the rupee**:

| Category | | Family asset class | | Basket | |
| --- | ---: | --- | ---: | --- | ---: |
| AIF | ₹352.3 Cr | Equity | ₹640.9 Cr | Stable Growth | ₹412.7 Cr |
| PMS mandates | ₹138.7 Cr | Alternate | ₹28.5 Cr | Thematic & Tactical | ₹243.7 Cr |
| Mutual Fund | ₹99.9 Cr | Not classified | ₹21.4 Cr | Liquidity | ₹27.5 Cr |
| Direct Equity | ₹94.9 Cr | Cash | ₹14.1 Cr | Not classified | ₹21.4 Cr |
| ETF | ₹24.6 Cr | Debt | ₹5.55 Cr | Entrepreneurial Growth | ₹5.08 Cr |
| Cash | ₹0 | | | | |

**NOTHING ABOUT THE ARITHMETIC CHANGES WHEN THE AXIS DOES.** Invested, Current,
Return and Weight are the identical sums over the identical holdings on every
axis, so the footer, the weight base and the cost-coverage refusal needed no
branch of their own and stay correct by construction. In particular **a return
refused on one axis is refused on all three**: `costCoversSet` is what decides
it, and Stable Growth's Invested covers ₹391.5 Cr of its ₹412.7 Cr, so its Return
is an em dash for exactly the reason Direct Equity's is. That is the honest answer
to "how is the core doing" and it is the same answer the Portfolio Monitor's
per-category totals row gives — which is the point of the two screens sharing one
test rather than each carrying a copy.

**THE DEFAULT IS UNCHANGED AND IS ASSERTED TO BE.** Two new axes beside an old one
is exactly the change that silently moves a default, and the page would render
perfectly while showing the family a table they asked to keep.

**THE TITLE, THE COLUMN HEAD AND THE PILL'S NOUN ALL FOLLOW THE AXIS.** A table of
BASKETS headed "Allocation by asset class & mandate" is the
caption-does-not-describe-its-figure failure this page has already paid for twice,
and "6 buckets held" over a table of baskets would be wrong about what it counted
— but the COUNT inside that pill is not chrome (two invariants read it), so
`groupCount` supplies the noun per axis rather than the caption being rewritten.
The category title is left exactly as it was: it predates the regroup and is not a
perfect description of that axis, but it is the heading the family has learnt.

**AND EVERY ROW STILL OPENS THE HOLDINGS BEHIND IT.** `?of=basket&key=…` and
`?of=family-class&key=…` are scopes of their own rather than a `bucket` address
carrying an `axis=` param, because the three axes answer different questions and
the address should say which — and every existing `?of=bucket` bookmark keeps
meaning what it meant. `AXIS_SCOPE` is the one place the axis picks the scope, so
a link built on the page and a set resolved in `drilldown.ts` cannot name
different things. An axis a reader can select but not open would be a table of
totals with no way in, which is the state `/holdings` was built to end.

**WHOSE JUDGEMENT IT IS, IS ON THE CARD.** A basket and the family's own asset
class are derivable from no statement in the archive — they are the family's
consolidated review, product by product, plus one rule they stated themselves —
and on screen a section heading looks equally authoritative whichever put the rows
under it. So a family axis states its provenance and names the **₹11.2 Cr placed
by the rule** rather than by the review, exactly as the Portfolio Monitor's
section headings do. A holding their review does not place gets its own row that
says so, in the family's absence-names-its-cause form, never "Other".

**A FUND-OF-FUNDS ROW CARRIES NO FAMILY TAXONOMY AND IS MARKED.** Those come from
`privateMarkets.*` — fund-level records rather than positions — so `groupKeyFor`
has nothing to key them on and a review that classifies PRODUCTS names none of
them. Every one is empty in this book, so none renders; the marking is what keeps
a row under a table of BASKETS from ever reading as a basket the family chose.

**THE TWO BIGGEST BASKETS TOOK COLOURS FROM OPPOSITE ENDS OF THE PALETTE**, after
the first cut drew them as two champagne shades and the donut read as one wedge
covering 92% of the NAV.

#### Eight bugs reintroduced, and two of them were bugs in the CHECKS

Each was put back one at a time, rebuilt and swept. Six fired immediately; the
two that did not are the point of doing it:

- **`/ETFS · TODAY/` IS SATISFIED BY "STOCKS & ETFS · TODAY".** Pinning the
  tile's label to the default scope while the tab beside it narrowed — precisely
  the bug that check exists for — left the sweep GREEN. A caption claim has to be
  struck on the whole caption; it is anchored to the start of its own line now.
- **AN UNRESOLVED DRILL-DOWN ADDRESS PASSED EVERY GENERIC CHECK.** The two new
  `/holdings` routes take the address the axis routes drew; unresolved, the walk
  lands on `/holdings`'s own not-found page, which has no console error, no
  overflow and no stray zero. They now assert they OPENED something and that its
  market value reproduces the very cell a reader clicked — and a missing address
  is a FAILURE rather than an abstention.

The six that fired on the first attempt: the default movers scope dropping the
ETFs (the `cio-live` gainer count, derived per scope from the book), tabs that
render but filter nothing, the allocation card's default axis moving, a family
axis's rows all pointing at the CATEGORY scope, the unplaced row losing the
sentence naming its cause, and a section quietly dropped from the partition.

**THE ALLOCATION TABLE IS FOUND BY `data-alloc-table` NOW, NOT BY MATCHING "ASSET
CLASS" IN ITS HEADER.** That header is the family's own word for the active axis
on two of the three routes, so the old finder returns nothing there and every
invariant struck on it would have ABSTAINED rather than failed. Its cells are
read off the DOM for the same reason the Monitor's are: a section the review does
not place carries a second line in its label cell, and the page-text parser picks
that row up under the disclosure sentence instead of its own name — figures
unchanged, which is exactly why it would go unnoticed.

**AND THE PARTITION BOUND IS THE PAGE'S OWN PRINTING PRECISION, REPRODUCED.**
Every cell renders to one decimal in Cr, so n rows against a printed footer carry
(n + 1) half-digits of rounding: the family's asset-class rows sum to ₹710.35 Cr
against a printed ₹710.4 Cr on figures that tie to the rupee underneath. A
missing or double-counted row moves it by whole crores and still cannot pass.
That is a bound derived from what the page prints, never a tolerance widened
until the figures fit.

**THE ABSENT-STATE PROBES TAKE ANY NOUN NOW.** `No <scope> holding carries a day
change` is the movers card's settled-absence line and its noun moves with the
tab. The previous attempt at this enumerated the spellings — and lapsed the moment
the ETFs came back — so the pattern is anchored on the two ends of the sentence
instead.

### Stage 10ae — THE TAXONOMY IS AUDITED AGAINST THE WORKBOOK, AND THE WORKBOOK IS NOW THE TEST

*"make sure the basket as well as asset class categorization is correct and
matching as per the consolidated excel sheet information … do an audit and make
everything matching as per the classification provided in this excel sheet."*

Stage 10z built `familyTaxonomy.ts` by reading the family's consolidated review
and hand-verifying every line. This is that map audited back against the same
document, product by product — and the headline finding is that **the
classifications were already right**: 54 entries, 53 baskets and 53 asset
classes witnessed by the workbook, **zero mismatches**. What the audit found
instead were a broken CITATION, three holdings the review names and the map had
not reached, and — the part worth keeping — that nothing in the repo could have
told us any of that.

**THE WORKBOOK IS A TEST NOW, NOT ONLY A SOURCE.** `familyTaxonomy.test.ts`'s
eight existing sections assert the map is INTERNALLY sound: no dead keys, a
total partition on both axes, the rule as a fallback. Not one of them can see a
well-formed entry that files a real holding under the wrong basket — which is
the most dangerous defect this map can carry, because **a basket heading looks
exactly as authoritative whichever rows sit under it.** So the suite now reads
the committed workbook and holds every entry to the row it cites. That is
`review-reconcile.mjs`'s standing, applied to a map instead of to the book: an
independent cross-check against the family's own document, never a second source
the app reads at runtime. The workbook is TEST-ONLY — nothing under `src/pages`
may import `xlsx`.

**AND IT IMMEDIATELY CAUGHT A CITATION NOBODY COULD FOLLOW.** One entry read
`reviewProduct: "Motilal Oswal Founders Fund  II"` — a **DOUBLE SPACE**, which
matches no row in the family's document. The classification (Stable Growth /
Equity) was correct and the citation was unverifiable, and `reviewProduct` exists
for exactly one purpose: *"any one of these can be challenged against the
family's own document."* A citation that resolves to nothing is that field
failing silently, and it is invisible to every check that reads only the map.

#### Three holdings the review names, and what licensed each join

The review's `Private Equity ₹136.16 Cr` is ONE aggregate line on the Alternate
sheet — this file already records that the reconciler has to carry it as a block
with no custodian to ask. **It IS itemised**, on the workbook's own `Private
Investments` tab, corroborated row for row by `Private Equity Excl Pre IPO`, and
three of those rows are holdings this book carries. All three are Entrepreneurial
Growth / Alternate, on no basket sheet, so there is no second answer to weigh:

| Holding | Book value | Review row | Why the join is safe |
| --- | ---: | --- | --- |
| `BOROSIL RENEWABLES LIMITED - WARRANTS 13AG26` | ₹70,754.50 | `Borosil Renewables` ₹3.75 Cr | the ARITHMETIC — see below |
| `BLUE ASHVA VARENYA FUND - BAVF-SER20-C6` | ₹98,742 | `Blue Ashva Varenya Account` ₹0.02 Cr | the distinguishing word |
| `EVEREST FLEET-EQ1/` | ₹580 | `Everest Fleet Private Ltd - SIDDHARTH LADSARIYA` | an exact company name |

**THE WARRANT IS THE ONE THIS FILE ALREADY FORBADE JOINING BY NAME.** *"a
Borosil WARRANT against the Borosil EQUITY, which must never be joined"* — and
this book holds BOTH: 11,495 Borosil Renewables SHARES inside two PMS mandates,
and 283,018 WARRANTS in the ICICI NSDL demat. On the name they are
indistinguishable. On the arithmetic they are not:

```
₹3,74,99,885 ÷ 283,018 warrants = ₹132.5000 each   and   ₹132.50 × 4 = ₹530.00
```

— the 25% upfront an Indian preferential warrant allotment is subscribed at,
reproduced to the rupee. **The quantity is the witness**, which is the standard
`dropDepositoryDuplicates` and `costFor` already hold a join to. The
mandate-held shares belong to their mandate's own product and never reach this
map. That is the difference between a name matcher and a reading: the caution
stands and this join is licensed by evidence the caution was written for the
absence of.

**TWO BLUE ASHVA VEHICLES ARE IN THE REVIEW and only one is in this book** —
`Blue Ashva Varenya Account` (₹0.02 Cr) and `Blue Ashva India Pool Account`
(₹3.74 Cr). The demat holds BAVF-SER20-C6, whose own name carries VARENYA.
Matched on "Blue Ashva" there would have been two candidates and no way to
choose; the earlier normaliser missed the row entirely, which is the safer of
the two failures and still a failure.

**WHAT MOVED IS ₹1.70 L, AND THE POINT IS NOT THE MONEY.** Entrepreneurial
Growth ₹5.07 → **₹5.08 Cr** (3 → 6 rows), Alternate ₹28.44 → **₹28.46 Cr**, and
the basket axis's unclassified section loses the Blue Ashva row. All three axes
still sum to `BOOK_SUMMARY.totalValue` to the rupee. Two of the three also move
on the ASSET-CLASS axis from `Equity` to `Alternate`, which is derivation being
overridden by the review — an unlisted company's shares and a preferential
warrant are private capital that happens to sit in a depository account, and
`familyAssetClass` consults the map before it derives anything. Check 7 now
measures that: `Equity → Equity/Alternate`.

#### The tab fills a gap and never overrides, and the workbook itself is why

Two `Private Investments` rows — `M/S Grand Continent Hotels` and `Parth
Electrical & Engineering` — **also sit on the live `Thematic,Tactical` sheet**,
with real figures whose share counts tie to this book exactly (262,125 and
59,000), while their private rows are **₹0** and Parth's carries the remark
*"Listed in Aug'25"*. The family moved both out of private capital when they
listed. Read the tab as authoritative and it drags them back, refiling ₹5.31 Cr
of listed equity as Alternate. So the live sheets are read FIRST and the private
tab writes only into a gap.

**THE FIRST DRAFT ENFORCED THAT TWICE AND ONE OF THE TWO WAS DEAD.** A
`cost === 0` guard skipped the zeroed stubs explicitly — and the reader is
first-writer-wins, so the guard could never fire. Removing it changed nothing,
which is how it was found: **reintroducing the bug produced a clean run.** A
branch that documents a rule it does not enforce is the
dead-code-that-looks-alive failure this file keeps naming, so it is gone and the
LOOP ORDER is what the suite asserts instead — the contested products are
listed, the live sheet must win on each, and swapping the loops fails four
checks by name.

#### What the review names and the map deliberately does NOT join

Each is a near miss LISTED rather than committed, which is the rule
`shared/nameMatch.mjs` already holds for the register reconciler:

- **`EMA Preferred Shares`** (₹0.46 Cr) against this book's `EMA PARTNERS INDIA
  LIMITED - EQ NEW FV RS 5/` (₹0.37 Cr). PREFERENCE shares are not the EQUITY,
  and this file already names that exact pair as a near miss a human must
  commit. The equity falls to the direct-stock rule, which is where the review's
  own `Direct Equity - Non MO` block — coded **TT** — puts the demat's direct
  holdings anyway, so the answer on screen is unchanged and now corroborated.
- **`National Stock Exchange`** (Stable Growth / Equity, ₹41.5 Cr on 200,000
  shares). This book's ICICI NSDL statement carries 125,000 of them at an implied
  **Re 1.00** — a PAR row, so it carries its quantity and NO market value and is
  not in `BOOK_POSITIONS` at all. An entry would match no holding and fail the
  map's own no-dead-entries check. The answer is recorded for the drop that first
  values it.
- **`SKS Fastener`, `Incred Holdings`, `Swapeco Solutions`, `Aksum Trademart`,
  `EDUGORILLA`, `Blue Ashva India Pool Account`** — private investments this book
  carries no valued position for, by the same par/quantity-only rule.

**AND `Motilal Oswal Active Momentum Fund` ₹21.42 Cr IS GENUINELY ABSENT** from
the whole workbook, checked across all 25 tabs rather than assumed: the review is
drawn 30 June 2026 and that folio's statement is dated 6 August. It is 3.0% of
the book and it is the whole of the unclassified section on both axes. That is a
stale review, not a gap in the map, and the section already names its own cause.

**FIVE BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: the double space back in a
citation, Carnelian refiled as Thematic & Tactical, the private-equity tab read
first, the asset-class sheets read from the wrong column (which fired the
can't-pass-by-matching-nothing gate at `57/5 of 57`), and the workbook moved out
from under the suite.

### Stage 10ag — WHAT THE FAMILY DID, AND WHAT EACH TRANCHE OF IT EARNED

Two asks, one source, and the source had been in the archive since the first
drop with nothing reading it.

*"in transactions we need to see the transactions we have done, not what the
transactions the portfolio manager has done… and then if we click and open the
drill down page of one AIF/PMS then inside that we should see what all
transactions the portfolio manager of that fund has made."* And: *"VC… I
invested additional 10 crores… previous amount… what was the return? Now this 10
crores… what it has done what's the overall portfolio return."*

**THE ARCHIVE CARRIES BOTH RECORDS AND ONLY ONE WAS EVER READ.** `transactions`
is the manager working a mandate — Green Lantern buying The Anup Engineering on
fifty days. `cashFlows` typed `contribution` or `withdrawal` is the family
putting money IN, and `loadTransactions` had never touched it. Measured across
the corpus: **20 dated contributions totalling ₹193 Cr across 10 accounts**, and
94 withdrawals totalling ₹2.86 L. That is the decision the family actually
makes, and the card that exists to show their transactions was showing somebody
else's.

#### The amount column is a RUNNING BALANCE on the row that carries the units

The single most dangerous thing in this delivery. Sanshi prints one
contribution as THREE rows on one date, and the third is a cumulative total in
the same column the others print a movement in:

```
17-06-2025  Drawdown                                        1,00,00,000.00
17-06-2025  Stamp Duty @ 0.005%                                   (499.98)
17-06-2025  Units Allotment  109.4462  91,364.524  1,91,359.524  1,99,98,999.97
```

All three are typed `contribution` in the archive. **Summing them reports ₹44 Cr
of investment into a folio that received ₹22 Cr** — and every row looks right:
same kind, same date, a plausible rupee figure, nothing failing anywhere. It is
the plausible-wrong-number failure this book exists to catch, arriving through a
column heading nobody had read.

So a move's `amount` is the GROSS row the statement prints on that date, which
is a primitive needing no arithmetic, and `invested` is that less the same
date's printed charges. **The balance is the WITNESS rather than the source**,
and three things agree on this corpus, each measured before a line was written:

```
Σ invested       = the position's own costBasis      TO THE PAISA
Σ invested       = the last printed Balance Amount   within ₹0.04
invested ÷ units = the Allotment NAV the statement prints to 4dp
```

`costBasis` reaches the book from the fund's HOLDINGS table and the tranches
from its TRANSACTIONS table — two readers over two regions of one statement — so
their agreeing is a real cross-check and not a figure compared with its own
copy. A date carrying an allotment row and NO gross row is unambiguous only
where the account has exactly ONE such row (a balance after a single
contribution IS that contribution); with several and nothing to check against,
`amount` is null and says so. **An account whose running total does not
reproduce is withheld entirely, with the reason** — differencing a sequence that
might not be cumulative is how the ₹44 Cr gets invented.

#### Ask 1 — My investments, and the manager one level down

`BOOK_CAPITAL_MOVES` is the family's own dated capital; `capitalRollup` in
`src/lib/tranches.ts` puts one line per account on the Transactions card, which
now DEFAULTS to it. **Lumpsum or staggered is a COUNT, not a detector** — one
dated contribution is a lumpsum, more than one is not. No cadence, no tolerance,
no minimum, which is `txnRollup`'s own reasoning arriving at a question the
family asked in exactly those terms.

The manager's own dealing keeps its tab AND sits inside the MANDATE drill-down,
which is where the ask puts it. `ManagerTrades` reuses `rollup` rather than
reimplementing it, so the two surfaces cannot disagree about what a manager did.

*(IT WAS ALSO RENDERED ON THE FUND BRANCH, WITH ITS OWN WORDS, AND BOTH HAVE
SINCE BEEN REMOVED — see Stage 10ai.* The reasoning is kept because it is what
had to be re-measured before removing it: **Buoyant Capital 103473 is an AIF
folio that DOES issue a transaction statement**, the one non-mandate account in
this book that does, and hiding a manager's whole record behind a routing
decision about what the account is called would have been a real loss. And the
title followed the route, because Buoyant's statement prints `Buoyant
Opportunities Strategy — Class A4, ₹25 Cr` — the FAMILY subscribing for units,
not Buoyant trading — so *"What the manager traded"* over those rows asserts
something that did not happen. What Stage 10ai measured is that Buoyant is not a
My-investments row at all, so that card was never the way into its dealing; the
**By manager** tab is. *The removal is asserted rather than assumed.)*

#### Ask 2 — each investment separately, and why UNITS are the whole of it

A tranche's value today is ITS OWN units at today's NAV. Split a position's
value across its contributions by SIZE instead and every tranche reports the
same blended return — **which is precisely the figure the family asked to have
broken apart.** Ankita's Sanshi folio bought at 100.00 in March and 123.84 in
October, so the March rupee is worth 24% more than the October one:

| Bought | Entry NAV | Invested | Value today | Return |
| --- | ---: | ---: | ---: | ---: |
| 21 Mar 2025 | ₹100.0000 | ₹1.00 Cr | ₹1.62 Cr | +61.6% → **CAGR 39.50%** |
| 17 Jun 2025 | ₹109.4462 | ₹1.00 Cr | ₹1.48 Cr | +47.6% → **CAGR 38.34%** |
| 3 Sep 2025 | ₹121.6322 | ₹10.0 Cr | ₹13.3 Cr | **ABS 32.83%** |
| 6 Oct 2025 | ₹123.8393 | ₹10.0 Cr | ₹13.0 Cr | **ABS 30.47%** |

So `BOOK_POSITION_TRANCHES` is **gated on the allotted units accounting for
EVERY unit held** — the same gate `costFor` and the ST/LT split already apply,
and it holds EXACTLY on all seven positions that publish one. Three consequences
make the panel checkable rather than merely plausible: Σ units = the position's
quantity (the gate), Σ value = its market value, Σ invested = its cost basis. The
footer reconciles to the row it expands from **by construction**.

**THE RETURN GOES THROUGH `holdingReturn`, NOT A SECOND RULE.** A tranche is the
one thing in this book with a real purchase date, so it is the one place a
genuine CAGR is strikable — and exactly where compounding a four-month window
onto a year would be most tempting. A year or more annualises, anything shorter
stands as the absolute figure and is TAGGED, so Stage 10g(ii)'s guard lives in
one place still and `positionIrrPct` stays unread.

**AND THE TABLE IS HANDED THE ROW'S OWN DEDUPED POSITIONS.** Keyed on
`securityKey` it would union Transition Venture Fund I across both family
trusts and offer 15,000 units against a row printing 7,500 — while every
within-panel check still reconciled, because footer and rows would double
together. §"consolidated counts once, per-account does not", arriving through a
drill-down. Where a row spans several folios the panel names the HOLDER on every
line: two members contributed on the SAME DAY under the SAME label, and without
it those read as one decision printed twice at different sizes.

#### What is absent, counted rather than claimed

**7 of 371 positions** open a contribution history, **2 bought over more than
one date**; **10 of 51 accounts** publish any dated capital record at all. The
managed mandates issue a capital-account ledger rather than unit allotments, and
a depository records what is held and never what was paid for it. Both surfaces
COUNT that rather than asserting coverage, and a row with no breakdown draws no
chevron — an affordance that opens nothing is worse than none.

**A RETURN NEEDS THE DENOMINATOR TO BE COMPLETE, AND TWO THINGS ESTABLISH IT.**
Either every position in the account is unit-tied, or the account's own printed
**inception date is on or after its first contribution** — the statement saying
its record starts where the account does. Measured: seven qualify by units and
three by inception, EXACTLY (SVAN's and Green Lantern's inception dates equal
their first contribution to the day). An account meeting neither keeps its
figures and loses its return, with the reason on the cell.

#### Nine bugs reintroduced, and THREE of them exposed defects in the checks

- **The set-size test for a blended split could not fail.** A return cell reads
  `CAGR39.50%`, so comparing cell TEXT made two rows differ whenever their TAGS
  differed — and a size-weighted split passed happily while every tranche within
  an account reported the identical percentage. The real claim is MONOTONICITY:
  within one panel every tranche is the same fund at the same NAV today, so
  return is a strict function of entry NAV. Cheaper entry must show the higher
  return, and two contributions at the SAME entry NAV must show the SAME return
  — which this book exercises, two members having bought at 109.4462 on one day.
- **The entity check excused itself.** It read `head.includes("entity")` — it
  asked the page whether it had drawn the column and passed when it had not, so
  deleting the column left the sweep green. Gated on the BOOK's own count of the
  folios behind the largest history now.
- **And the return-coverage note was a tautology**, both sides reading the same
  flag. Worse, **this book cannot exercise that gate at all**: all ten funded
  accounts pass it, so a working gate and a deleted one draw the same ten
  returns. That is recorded here rather than papered over, and the gate is
  exercised in `tranches.test.ts` on constructed inputs — the only place it can
  be.

The six that fired first time: the default view back to the manager rollup
(7 checks), the running-balance trap (7 in the suite, cost basis exactly
doubled), a truncated panel (4), a footer computed independently of its rows,
the staggered label pinned to a literal, and a dedupe pair counted twice.

**AND ONE LIGHT-MODE REMAP WAS MISSING, FOUND BY A ROUTE THAT CLICKS.**
`hover:text-champagne-400` had no `html:not(.dark)` rule — only the base class
and the `group-hover` variant did — so a hovered control came back at `#ecdcae`
on white. The sweep had never caught it because nothing in it hovered one; a
route that CLICKS a toggle leaves it hovered. It covers the Entities pill and
the mandate links too, which have carried that class all along.

### Stage 10ai — A HOLDING OPENS THE SAME WAY EVERYWHERE, AND THE TRANSACTIONS PAGE STOPS OFFERING AN EMPTY ONE

Three asks, and the first two are the same request seen from either end: the
Transactions card was offering a way OUT of itself that led nowhere, while the
Holdings table was refusing one that led somewhere.

#### 1. *"remove the drill down pages for transactions page in portfolio monitor… since they're empty"*

Stage 10ag put a link on each My-investments row, on the reasoning that the
chevron opens what the FAMILY paid in and the name opens the mandate, where the
MANAGER's dealing is. That reasoning was right about a mandate and wrong about
this card, and the difference is measurable rather than aesthetic: **seven of its
ten rows are FUND FOLIOS** — the five Sanshi accounts and both Transition Venture
trusts — and `/mandate/:accountId` for one of those can only say it is not a
mandate and draw an empty dealing card underneath. The family screenshotted
exactly that page.

**THE LINK IS GONE AND THE THREE PMS ROWS LOSE NOTHING.** Their pages are still
reached from Holdings, Family & Entities, a company page and every holdings
drill-down — and every one of those links is gated on `isMandateHeld`, so none of
them could ever route a fund folio there. That is why `check-pages.mjs`'s own
comment beside the `mandate-fund` route says nothing in `src/` links to it: the
sentence was true, went false for one release, and is true again.

**AND THE DEALING CARD CAME OFF THE FUND BRANCH WITH IT.** It was put there
because **Buoyant Capital 103473 is an AIF folio that DOES issue a transaction
statement** — the one non-mandate account in this book that does — and hiding a
manager's whole record behind a routing decision would have been the "reason
expired" failure. Measured before removing it: Buoyant is **not a My-investments
row at all** (it publishes no dated capital record), so this card was never the
way into its dealing; the **By manager** tab is, and that covers all ten accounts
whose statements the tape reads. For the other six fund folios the card was an
empty box under an empty page.

***"IT PUBLISHES NO DATED CAPITAL RECORD" WAS FALSE, AND IS CORRECTED AT STAGE
10bv.*** Buoyant's account statement prints every Cash Deposit since inception
and every allotment per class; the reader took the summary row above them and
nothing else. Both folios are rows of the capital record now. The decision above
does not change — the dealing card stays off the fund branch — only its premise
about the capital record, which is the eighth absence in this file recorded
against a document already in hand.

`ManagerTrades` then had ONE caller, on the mandate branch, so
`holdingRoute(...) === "mandate"` was true every time it was asked — a title, an
absence and a footer sentence that could not be reached, each wearing a confident
explanation. All three collapsed to the mandate case; the words for the fund case
are recorded in the note where that call used to be, not left standing as code
nothing runs.

**BOTH DIRECTIONS ARE CHECKED, AND NEITHER IMPLIES THE OTHER.** `mandate` asserts
the card IS there; `mandate-fund` asserts it is NOT, on all three of its strings
— a build that dropped it everywhere passes the second, one that kept it
everywhere passes the first. Verified by reintroducing each.

#### 2. *"remove the highlighted text from the dashboard UI"*

The paragraph under the My-investments table. Checked line by line before
anything was deleted, which is the whole of this entry, because **one of its five
claims was nowhere else on the page**:

| The claim | Elsewhere? |
| --- | --- |
| "These are the family's own movements, not their managers'" | yes — the tab is called My investments, the columns are Paid in / Taken out, and each expanded row says it |
| **"10 of this book's 51 accounts publish a dated capital record"** | **NO** |
| "Value today is the account's own market value from the book" | no — a BASIS, and it moved |
| "A return is struck only where the contribution list provably reaches inception — 10 of 10" | the CONDITION moved; the per-row case was already on the cell |
| "see By manager, or open the mandate itself" | chrome, and its second half was about to become false |

**"10 OF 51" IS ON THE TOTAL NOW, WHERE THE MISLEADING FIGURE IS.** Read as
"Total · 10 accounts", ₹193 Cr is the whole of what this family has put in. It is
not — 41 more accounts were funded and no statement in this drop says when — so
the denominator sits on the label that total is printed against, with the reason
in its hover. A caption is chrome; a COUNT inside one is not.

**THE TWO BASES MOVED TO THE COLUMNS THEY DESCRIBE.** What a column means belongs
on the column, so Value today, Gain and Return each carry their own definition,
and the per-row `AbsentCell` reason stays exactly where it was — which is the
STRONGER claim, because a page-wide fraction tells a reader nothing about the row
they are looking at.

**AND `capitalTotals` LOST ITS `measurable` COUNT.** It existed for that one
caption and had no other reader. A totals field nothing renders is the
dead-code-that-looks-alive failure this file keeps naming, so it went with its
caller — and `tranches.test.ts` **asserts the removal** rather than deleting the
case alongside it, keeping the two constructed cases that give the gate meaning.

#### 3. *"just like how you have show individual investments return in the drop down for securities you need to implement the same for category/asset class/basket as well"*

**THE ROW WAS ALREADY THE SAME ROW; ONLY ITS EXPANSION WAS AXIS-DEPENDENT.** A
grouping axis decides which SECTION a holding is filed under and nothing else —
`groupKeyFor` is the whole of it — so the per-account panel `venues` had no
business being computed only when `?group=security`. On Category, Asset class and
Basket the name cell drew **no chevron at all**, and the older per-ENTITY panel
underneath could be reached only from an "N entities" pill at the far right end
of the row, past the horizontal scroller.

`venuesOf(ps, accIdx)` now runs on every consolidated row. Measured: **75 rows on
a non-security axis, 12 held through more than one account, 90 statements behind
them.**

**AND IT REPLACES THE OLD PANEL RATHER THAN SITTING BESIDE IT, BECAUSE THE OLD
ONE WAS WRONG WHERE THE TWO DIFFERED.** `entityParts` was built from the
**DEDUPED** positions while the pill offering it counted the **RAW** ones — so
Transition Venture Fund I, held by two family trusts and reported by both, showed
a pill reading "2 entities" over a table of ONE row. §"a consolidated figure
counts each `dedupeGroup` ONCE; a per-account or per-owner figure does not",
failing inside a drill-down. `venuesOf` lists every statement as printed and
NAMES the overlap. `EntityPart`, `entityParts` and the `parts` field are deleted,
not left exported and uncalled.

**AND THE PANEL'S LEAD SENTENCE WAS CONTRADICTING ITSELF, WHICH ONLY SHOWED UP
BECAUSE THE CHECK WALKED THE HARD ROW.** It read *"— ₹1.71 Cr, 0.24% of the book,
held ₹3.43 Cr through 2 fund vehicles"*: the head of the sentence on the deduped
basis and the route split three words later on the printed one. The
reconciliation under the table was correct and three lines too late — a reader
stops at the first sentence, and two figures for one holding a clause apart is
the contradiction the footer rule already names. The clause now says so inline,
and only where the two really differ.

#### Thirteen bugs reintroduced, and THREE were defects in the checks

- **The market-value reconciliation waived itself.** It passed on
  `/reported under two accounts/` — so the panel's own overlap sentence became an
  ESCAPE, and a panel that dropped a line kept printing it and reconciled with
  nothing. Truncating the lines proved it: the count check fired and this one did
  not. It parses that sentence's three figures now and holds each to what is on
  screen — the lines add to the figure it claims, the row is the figure it says
  the row is, and the overlap is the difference.
- **A claim about a COLUMN was read off a page-wide title list.** Stripping the
  condition from the Return head left the identical sentence on Gain, so the
  check passed against exactly the regression it exists for. Read at the column
  now (`mineHead`).
- **And the inverted link check would have passed by finding nothing.**
  `mineRows.href` read `[data-mine-link]` — an attribute that lived on the link
  and went with it — so "no row invites a click" could not have failed whether or
  not a link was there. Struck on every `a[href]` in the row.

**A CHECK THAT ABSTAINS MUST NEVER ABSTAIN ALONE.** The five panel invariants
report NOT CHECKED when no row opened — and that only ever happens alongside the
offer check FAILING, because `AXIS_DRILL` is captured whether or not the click
landed, so a missing button yields an empty panel and a failure rather than
silence. Verified by removing the chevron: three fire, three abstain.

**THE WALK OPENS THE BOOK'S OWN OVERLAP ROW**, not whichever sorts first. Every
other row's raw and deduped totals coincide, which is exactly the condition under
which a panel dividing by the wrong one still prints 100% — so `AXIS_VENUE_BOOK`
names the one holding reported by two accounts under one `dedupeGroup`, and the
next drop picks its own.

`build` · `test:ingest` 140 · `test:family` · `check:family` 53/0 ·
`check:pages` **140 combinations clean**, with the same two pre-existing
abstentions. `glowData.ts` is untouched — nothing here reads the ingest.

### Stage 10al — THREE REMOVALS ON MORNING CIO, AND ONLY ONE OF THEM WAS FREE

*(Numbered `10al` rather than `10aj`: that letter was already taken by the
cumulative stock position further up, and two branches picked it in parallel.
The references below were repointed with it.)*

Three asks, and they are worth recording together because the SAME instruction —
take this off the screen — needed three different amounts of work, decided
entirely by whether what was being removed carried a figure.

#### 1. *"remove these stocks etf mutual funds selectors for this top movers section... we will only show direct equity as default."*

Stage 10ad put four tabs on Today's movers — Stocks & ETFs / Stocks / ETFs /
Mutual funds, on `?movers=` — after the family read their own first wording
("my stocks and ETFs are up") as asking for the ETFs back. They have now settled
it the other way, and the card is the **`DIRECT_EQUITY_BUCKET`** set Stage 10t
narrowed it to: 37 holdings, ₹94.9 Cr, of which 33 names and ₹82.3 Cr can reach
the quote feed.

**THE SCOPE IS A CONSTANT, NOT A PINNED VIEW, and that is the OPPOSITE of the
call Stage 10q made** for the Portfolio Monitor's basis switch — so the two
belong side by side or the next session will read them as contradictory. There
the flag was threaded through fifteen render branches, so pinning it to a literal
would have left every one of them unreachable, and `?view=entity` survived the
button that set it. **Here each scope was a different SET**, and the family have
chosen which set the card covers: keeping three unselectable ones alive on a URL
nobody can reach from the page would keep their captions, their nouns, their
verbs and a mutual-fund absence essay standing for a card that renders one set
for ever — the dead-code-that-looks-alive failure, wearing a query parameter. So
`MOVER_SCOPES`, `CANNOT_BE_PRICED` and the param are deleted with the control.

***`?movers=` HAS SINCE COME BACK, AND IT IS NOT THIS REASONING REVERSED — see
Stage 10bb.*** There it carries a TOGGLE BETWEEN TWO MEASUREMENTS (a live
intraday price and a published NAV, never summed), not three unreachable scopes
of one model. Both branches are whole cards, both are offered, both are walked.
The distinction this paragraph draws is exactly what makes the two calls
consistent: a param nobody can reach from the page is dead code, and a param
that carries a control the family asked for is an address.

**EVERY CAPTION STILL READS THE SET** — the tile label, the coverage line, the
index sentence and the excluded footer each state what the figure covers, off one
constant instead of an active tab. And **what the narrowing leaves out is still
NAMED**: the footer now carries the ETFs beside the PMS mandates, which is the
half a reader could otherwise not see changing.

**THE TWO CONSTITUENT ROUTES WENT WITH THE TABS AND THE ABSENCE IS ASSERTED
TWICE.** `cio-movers-etf` and `cio-movers-mf` walked sets the card no longer
offers, so there was nothing at either address to hold to the light; the
`moverScopes` probe they were checked with is KEPT, and now proves the group is
gone. That probe is the only thing that can: "Stocks", "ETFs" and "Mutual funds"
all still appear legitimately in this card's own sentences and in the allocation
table below it, so a text match would report the tabs absent while they were on
screen. Asserted on `cio` AND `cio-live`, because the tabs rendered whether or
not a quote had landed.

#### 2. *"remove the highlighted text from the dashboard ui"* — the NAV card's four paragraphs

**EVERY CLAIM WAS CHECKED AGAINST THE REST OF THE CARD BEFORE ANYTHING WAS
DELETED**, which is the whole of this one — the Stage 10aa / 10ai pattern, and
the reason it is not a one-line diff:

| The sentence | Elsewhere? | Where it is now |
| --- | --- | --- |
| "Both lines are rebased to 100 at …" | **NO** | the subtitle — this card's basis line |
| "…nets out ₹11.2 Cr of external capital…" + the Show/Hide control | **NO** | the toggle in the period row, which names the figure it reveals |
| "…it reads +9.29% against the book's +0.54%…" | **NO** | that toggle's hover, beside the control that draws the line |
| "₹28.3 Cr of the move is not proven to be performance…" | **NO** | an amber pill beside the Book pill it qualifies, accounts in the hover |
| "The book's own dated series is N statement dates over A → B" | yes — the subtitle, word for word | — |
| "…over the period shown it moved +1.80% … market history" | **NO** | the range note, beside the control that chose the window |
| "The index is taken at its last close *on or before* …" | methodology, no figure | deleted — it is `alignIndexToDates` in `navSeries.ts` |

**THE REBASE WAS THE ONE THAT WOULD HAVE GONE UNNOTICED.** The y-axis reads
84 / 91 / 98 — a RATIO, not an amount — so without that clause the ticks are
unitless and the chart quietly stops saying what it is measuring.

**AND THE RANGE'S OWN INDEX RETURN IS THE ONE THAT HAD TO LAND IN A PARTICULAR
PLACE.** It is the index ALONE over a period the book has no measurement across.
In the range note it is unmistakably about the selected window; moved up beside
the Book pill it becomes a pair a reader reads as struck over one period, which
is the caption-that-widens failure. So the check requires it to be in the note
**and NOT in the header** — see the defect that check exposed in itself, below.

**THE `<details>` OF EXCLUDED ACCOUNTS IS DELIBERATELY NOT PART OF THIS.** The
selection ran through it, and it is the other half of the family's own ask ("or
state the accounts that cannot supply one"), it is a collapsed one-liner rather
than prose, and §"a figure that exists for SOME accounts is shown for those and
the rest are NAMED" is a standing rule of this book. It is one line to remove if
they want it gone, and that is said out loud rather than decided silently.

#### 3. *"remove the placeholder for not live data from the dashboard ui"*

The dashed panel headed "Coming as live data lands — the rest of the CIO vision",
four chips and a footnote. **NOT ONE OF THEM WAS A MEASUREMENT**, which is why
this went cleanly where the paragraphs above needed an audit first: a chip named
a feature that does not exist, so there was nothing on it to move and nothing a
reader could act on. The gaps it stood for are in the Stage 8 table above, which
is where an unbuildable feature belongs — four dashed frames on a dashboard read,
during an upstream outage, as four more things that have broken, which is the
company page's own lesson applied one page over. Both claims are asserted and
neither implies the other: the panel is gone, AND the two chips retired earlier
(the index strip, NAV-vs-benchmark) stay retired in particular, so a build that
restored the panel with its ORIGINAL list cannot pass on the heading alone.

#### The bug-reintroduction pass found a check that could not fail

Ten bugs were put back one at a time, each rebuilt and swept. Nine fired their
own check immediately. **The tenth is the point of doing it.**

`navHead` — the slice these invariants read the card's header from — used to be
bounded on **"Both lines are rebased"**, the opening words of the block that has
just been removed. `sliceBetween` returns EVERYTHING AFTER its start marker when
the end marker is absent, so all ten would have gone on running against the rest
of the page rather than failing. That much was expected and fixed.

**THE FIX WAS BOUNDED ON THE WORD "PERIOD" — the period control's own label — AND
THAT COULD NOT FAIL EITHER.** Reintroducing the exact bug it exists for (moving
the range's index-only return up beside the book's figure) left the sweep GREEN:
the injected sentence reads "alone over this **period**", so the slice ended
INSIDE the very text it was meant to catch. **A boundary a page is free to print
is not a boundary.** It reads the card's header ELEMENT now, off the `navChart`
probe — the same answer `data-movers-scope`, `data-section` and `data-mandate`
already give: a structural claim must not depend on prose a redesign may reword.
Re-run against the same bug, it fails.

`build` · `test:ingest` 140 · `test:family` · `check:family` 53/0 ·
`check:pages` **136 combinations clean** (140 less the two removed movers
routes), with the same two pre-existing abstentions. `glowData.ts` is untouched —
nothing here reads the ingest.

### Stage 10ak — 3P'S ₹0 WAS RIGHT AND THE SCREEN WAS WRONG; AND A FUND IS ONE ROW

*"The figures in the dashboard and the consolidated excel sheet are not matching
… the 3P funds on the dashboard stable growth basket are lacking invested and
current market value figures, so please check why they are missing … Also 3P
Class B1 B2, all of that should be shown as a single line item as just 3P funds
like in the excel sheet … and then when we click on it, we should see a drop down
list of all the other categories, B1, B2, B3."*

Two asks that look like one bug and are not. The first is answered by the
statements and needed no arithmetic changed; the second is a grouping.

#### The first ask: the book was right, and it was still a defect

**3P'S OWN STATEMENT PRINTS `0.000` UNITS AND `0.000` VALUE ON ALL THREE
CLASSES.** Read from the archive rather than reasoned about
(`public/audit/3p-investment-managers-3000048-2026-07-31-holdings/pages.json`),
the account's own transaction history says what happened:

| Date | Class | Event |
| --- | --- | --- |
| 31-03-2026 | B1, B2 | `Reclassification Out` — both folded into Class B3 |
| 31-07-2026 | B3 | **`Full Units Redemption`, ₹31,05,82,835.17** |

That is the exact figure on the ICICI payment advice this book already carries
and already refuses to attribute (§"the two ICICI payment advices"). So three
documents agree: the fund's own statement, its own transaction tape, and the
bank's receipt for the money leaving.

**THE REVIEW IS DRAWN 30 JUNE 2026 AND CARRIES 3P AT ₹52.12 Cr.** The redemption
is 31 July. The workbook is not wrong and the book is not wrong; they are five
weeks apart, and **the newer document is the statement.** A dashboard matched to
a review would have to un-redeem a position the fund says is gone.

**WHAT WAS ACTUALLY BROKEN IS THAT THE SCREEN COULD NOT SAY SO.** Three rows of
em dashes beside a ₹0 look exactly like three rows nobody wired — which is this
file's founding rule (*a measured zero and an absent measurement must never look
the same*) failing in the one direction it had never been tested in: **the zero
was correct and the reader could not tell.** `isRedeemedToNil` in
`analytics.ts` names it, and the row says **redeemed** in words.

**SCOPED TO A FUND VEHICLE, AND THAT IS A MEASUREMENT.** Eight positions in this
book stand at zero units and only five are redemptions: the other three are a
`Cash` sleeve at nil and a `Tax Deducted at Source` line, which are balances
rather than holdings and have nothing to be redeemed. The predicate is
`isFundVehicle && quantity === 0 && currentPrice != null` — **the NAV is the
witness**: a fund still publishing one has measured the zero, where a holding
with no price and no units is an absence.

#### The second ask: one fund, one row, and the classes one click in

`splitFundClass` in `shared/securityKey.mjs`, beside `stripDepositoryTail` and on
exactly the same terms: **DISPLAY ONLY, and `securityKeyOf` never routes through
it**, so each class keeps its own key, its own join, its own `/stock/` page and
its own row in every drill-down. Anchored at the END and it only ever removes.

**IT IS NOT A NAME MATCHER, AND THAT DISTINCTION IS LOAD-BEARING.** The fund base
must match CHARACTER FOR CHARACTER; nothing here resembles anything. Stage 10z
already recorded what a similarity rule does to this corpus — `Motilal Oswal
Active Momentum Fund` matched to `Motilal Oswal Founders Fund II`, sharing a
HOUSE rather than a fund — and a basket heading looks equally authoritative
whichever rows sit under it. Measured over the whole book: **220 distinct names,
16 rows carrying a class suffix across 7 funds, and exactly TWO of those funds
carry more than one class** — 3P (B1/B2/B3) and Sanshi (A2/E). **Zero false
positives.**

**SANSHI IS THE INDEPENDENT WITNESS THAT THE GROUPING IS THE RIGHT ONE.** Clubbed
it reads **₹204,48,04,459.29 — ₹204.48 Cr — which is the review's own
`Sanshi Fund 1` line to the rupee.** The family asked for the shape the workbook
uses and the workbook's own figure falls out of it.

**TWO GUARDS, AND THE SECOND IS THE ONE THAT IS NOT OBVIOUS.** A fund clubs only
where the BOOK carries more than one class of it — a single-class fund keeps the
name its statement prints (Baring's A1, Neo Infra's A5, Buoyant's A4) — AND where
the FILTERED set holds every class the book has. Under a filter that reaches only
two of three, a row headed `3P India Equity Fund 1` would print two classes'
figures as the fund's, which is the *"a caption asserts what a named counterparty
reports"* failure arriving through a filter.

**THE PER-UNIT COLUMNS GO ABSENT, EXACTLY AS A MANDATE ROW'S DO, AND FOR THE SAME
REASON.** 3P's classes are marked at 169.221 / 170.4473 / 163.4835: units of two
classes are not the same unit, so a summed quantity has no price and a blended
average cost and CMP are figures no statement prints. **Money IS additive across
classes** — invested, market value, weight, P&L and return are ordinary sums and
stay. Each dash names the classes rather than borrowing the mandate's wording,
because a confidently wrong reason sends the next reader to the wrong document.

**AND THE CLUBBED ROW IS DELIBERATELY NOT A `StockLink`.** `/stock/:securityKey`
resolves ONE holding, so a link on the fund name would open one class under the
fund's title. The link moves INTO the expansion, where each class is the link —
which is what the family asked for, and is also the only place it is true.

**`venuesOf` IS RE-KEYED ON (SECURITY, ACCOUNT).** Identical to the old
account-only grouping on every row in the book but these two, and it matters on
them: **3P's three classes all sit in ONE folio**, so an account-keyed panel would
collapse the very classes the row was clubbed to reveal and open onto a single
line. Sanshi's five statement lines over two classes are the other direction —
several members holding the same class — which is why the expansion's identity is
the statement and its Class column is drawn from the ROW rather than the lines.

**`realizedKeys` IS EVERY KEY THE ROW CLUBS**, not `ps[0]`. A realised gain is
reported per SECURITY, so a row standing for three classes claims all three or
none; one key silently drops two classes' realised figures.

#### Thirteen bugs reintroduced, and one of them exposed a blind check

`FUND_CLASS_BOOK` in `check-pages.mjs` derives the expectations from
`glowData.ts` on every run — which funds club, which must not, and which classes
the fund reports redeemed — with the class split and `isRedeemedToNil` both
**re-derived rather than imported**, on the same terms as `isMandateHeld`: a
check that imports the helper it is checking agrees with it by construction. The
two expressions of the split agree exactly on this corpus, which is the whole
point of writing it twice.

| Bug put back | Fires |
| --- | --- |
| clubbing removed | clubs / no-class-alone on all four routes, and the fund never opens |
| a single-class fund clubbed too | clubs / a one-class fund keeps its name |
| two of three classes clubbed | clubs / no-class-alone |
| the per-unit dashes fall back to the mandate reason | the cells name the classes |
| the redeemed pill removed | redeemed, both directions |
| the pill on every row | redeemed / the measured zero |
| the ₹0 absented instead of named | the measured zero / the lines add up |
| the Class column dropped | the class link / leads with Class / per-class redeemed |
| a class rendered as text, not a link | the class link |
| the panel truncated to one line | draws every class / the lines add up |
| ONE statement line dropped | draws every class / the lines add up |
| only the widest row opens | every fund opens, and three more |
| `venuesOf` keyed on the account alone | the venue-count identity ×3 |
| the tranche panel blended across unit classes | combined units / monotonicity / largest history / sectioning |

**AND THE FULL SWEEP CAUGHT A DEFECT IN THE CHANGE ITSELF — THE ONE THING THE
SUBSET RUNS COULD NOT SEE.** Clubbing shipped with the CONTRIBUTION HISTORY
still drawn as one blended panel, and `monitor-tranche` failed three invariants
at once: the combined units, the monotonicity claim, and the panel matching the
book's largest single history.

Nothing was miscalculated. `trancheTable` values every tranche as ITS OWN units
at ITS OWN position's NAV, so each ROW stayed right. What broke is the panel's
two claims, and both hold only WITHIN one class:

- its footer ADDS THE UNITS UP, and units of two classes are not the same unit;
- **cheaper entry NAV, higher return, always** — which is the whole reason the
  panel exists, and which is simply false across two classes marked at NAVs of
  their own. Sanshi's Class E carries 9 dated contributions and Class A2 one,
  and the blended panel drew 10 under one footer against a book that knows the
  largest single history is 9.

**It is the same rule the clubbed row's own Qty, Avg cost and CMP cells already
follow, one level down**, and it was not reasoned out in advance — it was
measured. `trancheGroupsOf` sections the panel by class, each with its own
heading, its own footer and its own NAV; the three invariants moved to per
SECTION, and a fourth now asserts the sectioning itself against the book (how
many of that fund's classes carry a history), because a blended table reports
one section with no class and would otherwise satisfy a check that merely asks
whether the sections drawn are distinct. Reintroducing the blend fires all four.

**AND THE WALK HAD TO OPEN BOTH CLUBBED ROWS, NOT THE WIDEST.** The first draft
picked the row clubbing the most classes — 3P — and reintroducing a truncated
panel proved that blind: **every one of 3P's classes is redeemed to ₹0, so a
panel cut to one line still summed to the row's own ₹0 and the reconciliation
passed.** Sanshi is where the money adds up, so both are walked and the check
additionally requires at least one clubbed fund CARRYING money, which is
`golden.mjs`'s rule arriving through a drill-down: a suite that passes over
nothing claims confidence nobody earned. Re-run against the same bug, it fails.

#### What still does not tie to the review, measured line by line

Stable Growth reads **₹412.71 Cr** here against the review's **₹541.90 Cr**, and
the bridge was struck ROW BY ROW rather than asserted — because two of the five
steps are settled and three are open, and a single "it's the abbreviations"
sentence would bury that:

| | Δ vs the review |
| --- | ---: |
| **3P India Equity Fund 1** — redeemed 31 July, five weeks after the review's date | **−₹52.12 Cr** |
| **National Stock Exchange** — 125,000 unlisted shares the ICICI NSDL statement values at an implied **Re 1.00**, so a PAR row carrying its quantity and NO value (§"the value column is a mark on 14 rows and par on 24"). It is not in `BOOK_POSITIONS` at all | **−₹41.50 Cr** |
| **four depository-clipped mutual funds** — `ICICI IOPPF D-GRW` ₹6.37 Cr against the review's ICICI Pru India Opportunities ₹25.42 Cr, `BNDH L&MCF DP GR` ₹2.53 against Bandhan Large & Mid Cap ₹24.78, `KOTAK MTCF D-GROW` ₹1.27 against Kotak Multicap ₹10.24, and Kotak Large & Midcap ₹2.50 with no counterpart in the book at all | **−₹52.77 Cr** |
| **Helios**, where THE BOOK IS HIGHER — Ajay's AMC folio ₹31.00 Cr plus Ankita's ₹7.23 Cr and Bharat's ₹3.79 Cr demat rows | **+₹14.85 Cr** |
| Neo Infra +₹1.78 Cr, Buoyant +₹0.95 Cr, Carnelian −₹0.55 Cr, and two under ₹10 L | **+₹2.31 Cr** |
| | **−₹129.23 Cr**, against a printed gap of ₹129.19 Cr |

**THE FIRST TWO ARE SETTLED AND NEITHER IS A DEFECT.** 3P is answered above by
three documents; NSE is this book's own par rule, and inventing a mark for an
unlisted share the depository prices at a rupee is the fabrication that rule
exists to stop.

**THE OTHER THREE ARE OPEN, AND THIS SESSION DID NOT CLOSE THEM.** They are one
question in two directions: the review writes each scheme out in full while the
depository clips it (`WOC MAAF D-GROW`), so a family basket reaches some of a
scheme's rows and not others — which is the hand-checked abbreviation table this
file already names, not another statement, and **no tier above a prefix may join
them.** The Helios line is the same question running the other way and carries a
second one beside it: the three rows are marked at **₹16.21, ₹15.74 and ₹14.18
for one ISIN** (`INF0R8701046`), which no scheme can be on one day, so at least
two of the three statements are drawn on different dates. Both need the archive
rather than the screen, and both are named here rather than papered over.

**A SUSPECTED DOUBLE COUNT WAS CHECKED AND CLEARED, AND IT IS NOT THAT.**
`HELIOS FCF D-GROW` and `Helios Flexi Cap Fund - Direct Growth` share that ISIN
and are DIFFERENT HOLDERS in different accounts: Ajay 1,91,23,041 units in the
AMC folio, Ankita 51,00,985 and Bharat 24,07,981 in their own demats, from
separate documents. Not a duplicate — recorded so the next session does not
re-open it as one.

**AND THE WORKBOOK THE CLIENT ATTACHED IS ALREADY IN `source/`** — md5-identical
to `source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30
June 2026.xlsx`. It is still not a source for anything in this section
(§"the consolidated review workbook is not a source — by decision", narrowed
at Stage 10dh for the PRIVATE-MARKET lines alone); here it is the cross-check
`reconcile:review` runs and the classification `familyTaxonomy.ts` cites.

### Stage 10am — THE REDEMPTION WAS ON PAGE 2 ALL ALONG, AND THE SIDE FILTER WAS WIRED TO NOTHING

Three asks, and the first two are one defect seen from both ends: a fund the
family knows they redeemed was in neither the holdings they hold nor the
transactions they made.

*"In the holdings page we only need to show the current holdings. Since the 3P
fund is redeemed, we need to show it in the transactions page as sold
transaction."* · *"When I'm clicking on sell/buy filter, nothing is changing on
the page … But nothing on the page is changing when I'm clicking either of the
filters."* · *"I cannot find the redeemed 3P fund anywhere in the transactions
page under sell side."*

#### 1. The redemption was never in the archive, and the statement had it all along

`docs/EXTRACTION-REPORT.md` reported the 3P statement READ. It was — the reader
took its **ACCOUNT SUMMARY** and stopped there, and the account's whole dated
history sits in a `Financial Transaction(s)` table on **page 2** that nothing had
ever looked at. `document.json` carried `holdings: [3]` and
`transactions: [] · cashFlows: [] · capitalGains: []`; `BOOK_CAPITAL_MOVES` had
114 rows across 10 accounts and **not one mentioning 3P**.

**AND THIS FILE ASSERTED THE OPPOSITE, IN THE READER'S OWN HEADER.** It read
*"all reclassified out on 31-03-2026 … WHERE THE UNITS WENT IS NOT ON THIS
STATEMENT and is not guessed at."* Page 2 says exactly where they went. That is
the **sixth** absence in this book recorded against a premise nobody rechecked —
after FRED, the RBI, the release calendar, the ISIN tier and the NAV series — and
it is the most expensive shape of it: an absence asserted about a document
already in hand.

| Date | Class | Event | |
| --- | --- | --- | ---: |
| 04-05-2023 → 15-07-2025 | B1 | four Subscriptions | ₹12.00 Cr |
| 31-10-2025 | B2 | Subscription | ₹4.50 Cr |
| 28-11-2025 | B3 | Subscription | ₹12.00 Cr |
| 31-03-2026 | B1, B2 → B3 | Reclassification Out / In | **₹0 — no money moved** |
| 31-07-2026 | B3 | **Full Units Redemption** | **₹31,05,82,835.17** |

₹28.50 Cr in, ₹31.06 Cr back — a ₹2.56 Cr gain — and that redemption figure is
the one on the **ICICI payment advice this book already carries and already
refuses to attribute on a file name alone**. Three documents agree.

**FIVE CHECKS, AND THE TABLE IS PUBLISHED ONLY IF ALL FIVE PASS.** A dated tape a
reader acts on is the one thing that must not be published on trust, so
`threePFlows` emits NOTHING and says why unless the statement's own arithmetic
witnesses it — `hdfcNsdl.mjs`'s licence, applied to a table rather than a
rendered page:

1. gross − setup expense − stamp duty = the printed `Amount Invested`, to the
   paisa, on every subscription;
2. |amount| = |units| × NAV, within the precision the statement prints those two
   to (units 3dp, NAV 4dp) — reproduced, never a tolerance widened;
3. the running unit total reproduces the printed `Balance Units` on every row of
   every class;
4. the reclassifications **net to zero in rupees**;
5. and page 3's own `Reclassification` table — a separately printed witness —
   agrees with the balance the transaction table runs to.

**CHECK 4 REFUTED ITS OWN FIRST DRAFT, WHICH IS THE CHECK EARNING ITS PLACE.** It
first required the units to net to zero as well, and failed by 37,368.064 on a
statement that is perfectly correct: 12,48,630.217 units leave B1 and B2 at
142.7354 and 143.7190, and 12,85,998.281 arrive in B3 at **138.8041**, because B3
carries a 0.70% management fee against B1's 1.00% and B2's 1.20% and the same
money buys more of it. The MONEY is the invariant; each side's unit count is held
to its own NAV by check 2. Page 3 prints the same 37,368.064 gain independently,
which is check 5.

**AND A RECLASSIFICATION IS NOT A CAPITAL MOVE.** ₹17.85 Cr left two classes and
the same ₹17.85 Cr arrived in a third, on one day, inside one folio. Typed as a
withdrawal and a contribution it would put ₹17.85 Cr of fictitious money out and
back into this family's dated record. It gets its own `kind`, is archived because
it is what the statement prints, and sits deliberately outside `CAPITAL_KINDS`.

**AND `capitalMovesFrom` HAD TO LEARN THAT A LAYOUT DECLARES ITSELF.** Its
ambiguity — *"the allotment row's amount might be a running balance"* — is a fact
about SANSHI, which prints the gross, the stamp duty and the allotment on three
lines. 3P prints all of it on ONE line and prints its own net. A row carrying its
own net **cannot** be a running balance, because a cumulative figure has no
per-row charge to be net of — so `netAmount` is a primitive the statement prints
AND a declaration, and the inference ("does it carry units?") that would have made
every 3P subscription an unusable balance is gone.

**RE-EXTRACTED SAFELY, WITH A CONTROL RUN.** `GLOW_PDF_PASSWORDS` is not set in
this session, so a full re-extraction would have dropped the eight encrypted
statements — which is exactly what `guardAgainstShrinkingTheArchive` exists to
refuse. The 3P PDF alone was extracted into a scratch `GLOW_AUDIT_DIR` and
**reproduced the committed document byte-identically except for `sourcePath`**
BEFORE the reader was touched, so every difference afterwards belongs to the
change. `docs/EXTRACTION-REPORT.md` does not move: the reconciler's dated checks
do not cover this document's cash flows, and its coverage row is unchanged.

**WHAT THE BOOK GAINED, AND WHAT IT DID NOT.** 6 contributions and 1 redemption;
`BOOK_CAPITAL_MOVES` 114 → 121 rows across 10 → 11 accounts. **`BOOK_SUMMARY`
does not move by a rupee** — a dated record of money that has already been paid
out changes no NAV. `positionTranchesFrom` correctly withholds a per-contribution
breakdown for all three classes, and now says *why* in the right words: a
redeemed position is not an unexplained shortfall, and the generic
"the contributions do not account for the position" would send the next reader
looking for a missing allotment.

#### 2. The side filter was a control whose value reached nothing

`side` was never passed to `MyInvestments`. Clicking moved the **counter beside
the table** — which read the manager's TAPE on every view, so the family's own
ten rows sat under *"284 buys · 178 sells"*, a count of a set the page does not
draw. That counter moving is the whole reason the dead filter looked alive.

- **`capitalRollup` takes a side**, and the vocabulary is the CALLER's: a family
  movement has no buy and no sell, it has money in and money out, which is what
  the columns are already headed. The control reads `Paid in` / `Taken out` here
  and `Buys` / `Sells` on the tape — `MultiSelectFilter`'s own "No companies
  match" over a list of countries, one control further on.
- **A NET OVER ONE SIDE IS NOT A NET.** It would tie to the two columns beside it
  and describe an account that also moved money the other way — the plausible
  wrong figure, which is worse than none. Under a filter the net, the gain and
  the return all render absent with the reason, and the footer's net cell with
  them: `sumOrNull`'s rule arriving through a side filter.
- **AND THE EMPTY SIDE IS ABSENT, NEVER ₹0.** Under `Taken out` a row has no
  contribution in view, and a ₹0 there says the account was never funded — the
  measured-zero rule failing in the direction that INVENTS a fact rather than
  hiding one.
- **ONE FILTERED SET, NOT TWO.** The date and entity filters moved up into
  `TransactionsView`, so the counter and the table read the same array. Two
  filterings of one set is two definitions of "the movements in view", free to
  disagree the first time either changed — which is how this defect looked
  plausible in the first place.

#### 3. A closed position is not a holding

Dropped at the BASE of the row build — before the filters, the weight
denominator, the footer set and every section subtotal — which is the one place
that makes each of those consistent by construction, the way the ring-fence is
applied one layer up. Measured: **5 rows across 2 accounts, every one ₹0 of
market value and no reported cost**, so it moves no money on the page; what
changes is the row count.

**AND THE `redeemed` PILL WENT WITH THE ROW IT EXPLAINED.** That pill was the
right answer to the LAST round — *"the 3P funds are lacking invested and current
market value figures"*, where the book was right and the screen could not say the
₹0 was measured. This supersedes it, and leaving the pill would leave code that
can never fire. So it is deleted, and `check:pages` **inverts** rather than
deleting the check with the feature: no closed key may be a row, no row may say
"redeemed", and the `data-redeemed` handle must be gone.

**WHAT MUST NOT BE LOST WITH IT, and is asserted from both ends:**

- the closed positions are **NAMED under the table** — how many, which funds, how
  many accounts, that the zero is MEASURED, and that the money is on
  *Transactions → What I invested* under *Taken out*. Dropping a row and saying
  nothing is the same defect as showing a ₹0 one: a reader who knew they held 3P
  and cannot find it learns the dashboard lost it;
- and `/holdings` **still renders them and now marks them**. That page lists the
  set BEHIND a Morning CIO figure, and Positions counts all 371 — so the ₹0 rows
  are still there and still need the explanation the monitor's pill used to
  carry. Without this the two removals cancel into a ₹0 nobody explains anywhere.

**`FUND_CLASS_BOOK` IS NOW STRUCK OVER THE CURRENT HOLDINGS**, because that is
what the monitor draws: **one** multi-class fund (Sanshi A2/E) where the whole
book has two. Derived from every position it would demand a clubbed 3P row on a
page that correctly does not draw one.

#### The checks, and the three that could not fail

`check:pages` gains two routes — `monitor-txn-in` and `monitor-txn-out` — whose
every expectation comes from `glowData.ts`: a filter that matched everything and
one that matched nothing both draw a table, and only the book says which rows
belong. The `out` route **opens every row**, because the statement's own word for
the movement (`Full Units Redemption`) rides in the expansion and the collapsed
row shows a count — the check has to look where the redemption's own label is.
`scripts/ingest/__tests__/altFund.test.mjs` (35 cases) exercises the reader
against a SYNTHETIC statement and **breaks it six ways**, one per check plus an
undeclared transaction type; every one refuses the whole table.

**AND EACH MUTATION ISOLATES ITS OWN CHECK, which took measuring rather than
reasoning.** The first draft changed a unit count — which moves the units × NAV
identity AND the running balance, so two checks fired and neither could be shown
load-bearing on its own. Every figure is now chosen so exactly one identity
breaks: the reclassification case moves the amount and its NAV TOGETHER
(99,990 × 119.9920 = ₹1,19,98,000.08, inside the printed precision), so only the
netting fails. Verified by weakening each of the six in turn: every one produces
exactly its own two failures and no others.

**AND ONE CASE ASSERTS THE MONEY RATHER THAN THE LABEL.** A check on the word
"reclassification" alone would pass a reader that renamed the kind and kept the
figure, so the suite states what the label is protecting — what a class transfer
would have added to each side had it been typed as a movement. Measured on the
real statement that is ₹17.85 Cr in each direction; on the synthetic one,
₹1,19,98,800.

**`CAPITAL_KINDS` TURNED OUT TO BE THE SECOND LOCK, NOT THE FIRST.** Widening it
to admit `reclassification` and rebuilding the book changes nothing — the day
split in `capitalMovesFrom` keys on `contribution` and `withdrawal` by name, so a
row of neither kind is picked up by nothing. The reader's own `kind` is what
actually decides, which is why the assertion lives in the ingest suite and not in
a page check that cannot fail.

Three existing checks had to be rewritten, and each was a check that could not
have failed:

- **`a row with no withdrawal shows a dash, never a zero` was a page-wide `₹0`
  ban**, and passed only for as long as no row legitimately carried one. 3P's
  account now does — the fund paid out, so its Value today IS zero and the zero
  is MEASURED. A page-wide ban cannot tell that from a fabricated one and would
  force the page to hide a real figure. Struck at the Taken-out column now, which
  is the claim it was always about.
- **the `in` filter does not narrow the ROW set**, because every funded account in
  this book has money going in — it narrows the MOVEMENTS. A blanket
  "the row set must shrink" assertion failed a correct page; it is struck
  conditionally, off the book, and `out` (4 of 11) is what catches a filter wired
  to nothing.
- **and the `redeemed` capture in `tableRows` went with the pill.** A handle that
  can never be present reads `false` for ever and quietly satisfies whatever asks
  for it.

**TEN BUGS WERE REINTRODUCED, EACH FIRING ITS OWN CHECK**: the side never
reaching `MyInvestments` (the original defect — three checks, from both routes),
the counter back on the manager's tape, the control back in the tape's
vocabulary, a net published over one side, the empty side back to ₹0, a closed
position listed among the holdings (three checks, from three directions), the
closed note deleted, the note dropping where the money went, the `/holdings`
marker removed, and the reclassification admitted to `CAPITAL_KINDS`.

**AND A FAILED BUILD SILENTLY REUSES THE OLD BUNDLE**, which is worth naming
because it produced a confidently wrong result once here: a mutation that did not
typecheck left `dist/` at the PREVIOUS bug's build, and the sweep dutifully
reported that bug's failures under the new one's name. A bug-reintroduction run
whose failures match the previous run's exactly is the tell.

`build` · `test:ingest` 140 + 35 · `test:family` · `check:family` **53/0** ·
`check:pages` **142 combinations clean**, with the two pre-existing abstentions.
`glowData.ts` regenerates from the archive; `BOOK_SUMMARY` is untouched.

### Stage 10an — THE MOVERS CARD LANDS COMPLETE, AND TWO CAPTIONS GO

*"this daily movers section take a lot of time to show data and sometimes first
shows incomplete data and then starts showing all the portfolio movers... make it
quick and it should show all the data together rather than in bits and pieces, so
it does not confuses anyone using the dashboard."* And: *"remove the highlighted
texts from the dashboard UI completely."*

**THE FIRST IS A CORRECTNESS COMPLAINT WEARING A SPEED COMPLAINT'S CLOTHES**, and
reading it as the second would have produced a faster card that was still wrong.
`/api/quotes` prices a BOUNDED SLICE per request — the upstream returns only part
of a large ask inside its own budget — so the card redrew on every round, and
**every figure on it is struck over whichever names had arrived**: the day's move
divided a partial rupee change by a partial previous close, the gainer and loser
lists ranked a subset, and the comparison against the Nifty 500 set that against
a real index. All of it real arithmetic over the wrong set, all of it changing
under the reader.

Measured before anything was written: **161 distinct book symbols, 64 per
request, so three rounds** — and the card's own 33 direct-equity names sat at
distinct-symbol positions **20 to 108** in book order, **30 of them beyond the
first request**. The card could not be complete until the third round. Worse,
`quotesStatus` flips to `live` after round one, so the "Fetching prices" note
disappeared while the lists were still a ranking over three names.

#### `pending` is not `missing`, and conflating them is why nothing could wait

A symbol this round **DEFERRED by the cap** and a symbol the upstream **CANNOT
PRICE** both arrived as `missing`, and they are opposite facts: the first is
answered in seconds, the second never is. A caller that cannot tell them apart
cannot know when a set is COMPLETE — which is the only thing a RANKING can
honestly wait on.

- **`missing` now means ATTEMPTED AND UNSERVABLE, `pending` NOT YET ATTEMPTED**,
  and the two partition everything a request could not price. The response
  carries both.
- **`fresh` excludes pending.** Counted in, a first round reported the whole book
  fresh while holding 136 prices it had not asked for — a coverage figure over a
  set nobody measured.
- **THE FILL POLL RUNS ON `pending`, NEVER ON `missing`.** This book has symbols
  the upstream cannot price, so the old condition held the tab at a four-second
  cadence for its whole life while nothing could change. A pre-existing defect
  the split fixes rather than one this change introduced.
- **`priority` is the other half.** The caller names the symbols the first screen
  needs and they are fetched first. It never WIDENS the ask — a priority symbol
  not in `symbols` is ignored, or a browser could reach past its own request —
  it only decides the order. The card's 33 names now land in ONE round.

`PRIORITY_SYMBOLS` in `PortfolioContext` is **derived through the same
`holdingBucket` the card groups on**, so a drop that moves a holding between
buckets moves it too. A typed list would go stale silently and the card would be
back to three rounds with nothing to say so.

#### The card holds on ITS OWN scope, never on the book's

`pendingFor(model.scopeSymbols)` — 33 symbols, not 161. Holding until the whole
book lands would make a 33-name card wait on 128 names it does not show, which is
this fix running the other way. **A FAILED FEED IS NOT A SLOW ONE**: when the
feed is unavailable no answer is coming, so the card stops waiting and renders
the absent state that names the feed. And the loading state **counts its own
progress** against its own scope size, because a spinner with no number is
indistinguishable from a hung one.

The "Fetching prices — figures are the last snapshot" caption now renders only
when the scope is COMPLETE and a refresh round is in flight, and says so:
figures that are complete and dated, with a newer round coming. It used to sit
above a partial ranking, describing it as a snapshot rather than as a subset.

#### The two captions, checked against the rest of the screen before they went

**`PortfolioMonitor`'s venue-table line** — *"The row above clubs them into one
holding; each line here is one statement as printed."* Both claims survive it:
the lead sentence above already names the row's own value and splits it by route,
and the per-statement basis only has a CONSEQUENCE where the two differ — on
exactly those rows the lead sentence names the overlap in rupees and the amber
line under the table reconciles it. On every other row the sentence described a
difference that row does not have.

**`FundExposure`'s loading line** — *"Checking which of your funds disclose this
name…"* — is a removal of a SENTENCE and not of the STATE. The load-bearing half
was never the words: a card still fetching must not print "none of the N funds
discloses this name", which is a claim about the holding made before a
disclosure has been read. It renders `null` now, which asserts nothing. **And
the fall-through is a TYPE ERROR rather than a check**: `StockExposureState` is a
discriminated union whose loading variant carries none of `covered`,
`considered`, `skipped` or `byKey`, so deleting the branch instead of its markup
does not compile. That is the stronger guard, and the invariant below is the
runtime backstop for a state the type cannot see.

*(`FundExposure.tsx` has since been deleted: at Stage 10ci its box became rows
of the Portfolio Monitor's own table. The rule above is unchanged. While the
disclosures load, the row draws no fund lines, and its Via funds cell names the
fetch rather than saying anything about the holding.)*

#### `npm run test:family` gained the suite the server change needed

`quotesFunction.test.ts` — **nine checks against a stubbed upstream**, because
`MUNS_TOKEN` lives in the Cloudflare environment and the partition is a property
of THIS function rather than of the upstream. The partition itself, deferred vs
unservable in both directions, priority ordering, priority never widening the
ask, `fresh` excluding pending, an ask inside the cap deferring nothing, and the
last-good fallback moving a symbol OUT of pending once the bundle can serve it.

**THE PARTITION IS RE-STRUCK ON THE BUNDLED CALL, and that is the one that can
fail.** Everywhere else a pending symbol has no price, so "exactly one place" is
true by construction and the check cannot see the overlap it is written for.
Reintroducing the overlap proved it: the general partition check stayed green and
only the bundled one fired. Six server bugs were put back one at a time and each
fired exactly its own checks.

**AND THE STUBBED SHAPES ARE THE FUNCTION'S OWN, taken rather than guessed.** The
first draft answered under `data[]` keyed on `ticker_symbol`; the upstream answers
under `data.items` keyed on `ticker` with the rest inside a `rawQuote` blob, and
the whole suite reported nothing priced — every case failing for one reason that
had nothing to do with what any of them assert.

#### `cio-filling` and `monitor-security-loading` — two states no walk could reach

Both removals and the hold needed routes that HOLD A FETCH OPEN, because every
existing mock answers in one round and the settled walk waits for a settled box.

- **`installFillingQuotes`** prices a third of the ask and defers the rest for
  ever, and deliberately does NOT honour `priority` — it is the pessimistic case,
  so the card must hold on its own scope rather than on the server having ordered
  the ask conveniently. The invariants are struck on STRUCTURE: a card that drew
  six of its 33 names renders a perfectly well-formed list, and only a count of
  `[data-mover-row]` can see it.
- **`monitor-security-loading`** stalls `**/lookthrough/**` for the length of the
  walk. Without it *"the removed loading line is gone"* was struck on text that is
  never on screen at read time and could not have failed either way.

**AND IT IMMEDIATELY FOUND A LIGHT-MODE GAP NOTHING COULD HAVE REPORTED.**
`text-champagne-400/80` had no `html:not(.dark)` remap — Tailwind emits each
opacity variant as its own class, which this file already says in as many words —
and it came back at `#ecdcae` on white. It renders ONLY while the fund
look-through is loading, so the class had been on screen for nobody. Same shape
as the `hover:` variant Stage 10ag found the day a route first clicked something.

#### The bug-reintroduction pass found that FIVE OF THE NEW CHECKS COULD NOT FAIL

Every one of them returned a DESCRIPTIVE STRING on failure, and the harness reads
any truthy return as a pass (`if (!r) invariants.push(desc)`). So the first sweep
came back clean over a card rendering a partial ranking. Rewritten to return
booleans and `{ notChecked }`, with each claim split so a failure names its own
part. **This is the "a check that cannot fail is itself a defect" rule arriving
through a return type**, and it is why the pass is run at all: the sweep was
green, twice, over exactly the defect it was written for.

**AND A SIXTH ABSTAINED WHERE IT SHOULD HAVE FAILED.** The `priority` claim reads
the request rather than the page, and an absent field was recorded as `null` —
which the check read as "no request was captured" and abstained on. Dropping
`priority` entirely, the exact regression it exists for, produced a clean run
with one NOT CHECKED line. A request that named NONE now records `[]`, which is
a finding; `null` means only that no request was seen. `golden.mjs`'s rule and
this file's own *"a missing toggle must be a finding"*, arriving through a
captured request.

**Nine bugs reintroduced in the browser and six in the suite, each firing its
own check**: the card ranking a partial scope (the original defect), the ask
naming no priority, priority widened to the whole book, the card waiting on the
whole book, the card holding for ever, the loading state naming no progress, each
caption restored, and — in the suite — pending folded back into missing, priority
ignored, priority widening the ask, the two sets overlapping, `fresh` counting
pending, and an off-by-one on the cap. **The fall-through in `FundExposure` is
the one that could not be reintroduced at all**, and that is the finding: it does
not typecheck.

`build` · `test:ingest` 140 + 35 · `test:family` (9 new) · `check:family` **53/0** ·
`check:pages` **146 combinations clean** — 142 plus the two new routes across both
themes — with the same two pre-existing abstentions. `glowData.ts` is untouched:
nothing here reads the ingest.

### Stage 10ao — THE BASIS PILL GOES, AND THE DRILL-DOWN LOSES ITS PROSE

*"remove — 'LIVE · Consolidated · listed live / 49 accounts behind' part from
the UI."* And: *"Remove all the highlighted text and the sections from the
dashboard UI"* — the `/holdings` lead paragraph, its facet note, its pill row
and the whole "How this figure is worked out" card.

**THIS IS THE FIRST REMOVAL IN THIS FILE THAT CROSSES ONE OF THE SEVEN RULES,
AND IT IS RECORDED RATHER THAN GLOSSED.** §6 says every consolidated figure
carries a `<BasisPill>`, because a reader who cannot tell a statement mark from
a live one cannot check anything, and because a consolidated total here is a
BLEND of report dates that `portfolio.asOf` states only the newest of. Morning
CIO and the drill-down no longer print one. The family asked for it by name and
that is their decision; what this section owes them is an accurate account of
what it costs and of what was kept.

**THE HALF OF §6 THAT IS A CORRECTNESS GUARANTEE IS UNTOUCHED.** Capital Gains,
Data Audit, Ledger Insights and Private Market read `statementPortfolio` and
pass `<BasisPill statement>` — a reader checks those against the PDF, and a
total that drifted with the market could not be checked at all. That is asserted
on `private-market` now, and it is a SEPARATE claim from the two absences:
a build that deleted the component everywhere would satisfy both removals and
silently take this with it. Verified by making `BasisPill` return null for
`statement`, which fires exactly that check and nothing else.

#### Every claim was checked before it was deleted, and three had no second home

The same audit Stage 10aa and 10ai ran, on nine items this time:

| Removed | Elsewhere? | Where it is now |
| --- | --- | --- |
| `LIVE · …` + `N accounts behind`, Morning CIO | **NO** | gone — see above |
| the same pill on `/holdings` | **NO** | gone, same request |
| the `lead` paragraph | the heading + the four tiles' own captions | deleted, and `Drilldown.lead` with it *(the TILES have since gone too — Stage 10bd — and the two captions that had no second surface are on the headline)* |
| the active facet's NOTE paragraph | **the chip's own `title`** | the hover, which already had it |
| `behind Consolidated NAV · …` | the crumb, and each tile's own hover | deleted, and `Drilldown.backs` with it |
| `consolidated · each holding once` | **the holdings table's own subtitle** | already there, in the same two branches *(that subtitle has since gone at the family's request — Stage 10bd — and the basis moved to the headline, in the same two branches again)* |
| the accrued income the NAV excludes | **NO** | the NAV tile's hover |
| the XIRR's window and its refusal to annualise | **NO** | the money-weighted tile's hover |
| cross-held is not the duplicate policy | **NO** | the Cross-held link's hover |

**THE THREE WITH NO SECOND HOME WENT INTO HOVERS, AND THAT IS WEAKER THAN A
CAPTION.** Said plainly because it is true: a hover is not read by someone
scanning. Each was kept anyway, because each is a figure a reader ACTS on —

- **accrued income** is exactly the amount by which a manager's printed total
  runs above ours. It has now been moved twice: it was this tile's caption,
  Stage 10aa moved it to the arithmetic card as *"the ONE line among the six
  that no other surface repeated"*, and the card has now gone too.
- **the XIRR window** is Stage 10g(ii)'s guard. This tile once read **+99.0%**
  with nothing miscalculated, against the managers' own 7–31% since-inception
  figures for the same accounts. `moneyWeightedReturn` refuses to annualise a
  sub-year window and **the caller must say so**; the hover is the caller now.
- **cross-held is not the duplicate policy** — two members each genuinely owning
  some of a name, counted once per member, against ONE holding two statements
  both report (this book's ₹3.17 Cr), which the consolidated set has already
  collapsed. A reader who conflates them misreads the concentration figure.

**AND `drilldownFormula` IS DELETED, NOT ORPHANED** — 240 lines with one caller,
plus `Drilldown.lead`, `Drilldown.backs`, `Drilldown.windowDays`, the window
local that fed it and the `FormulaDef` import. The shape `exportDeck.ts`,
`entityParts` and `holdingHref` were each removed in.

#### The bug-reintroduction pass, and the four checks it corrected

Eight bugs were put back one at a time. Five fired immediately; the other three
were defects in the checks, and a fourth turned up in the full sweep:

- **THE HARNESS ITSELF LOST A DAY'S WORK.** Two patches produced a JSX syntax
  error, `set -e` skipped the restore, and the bugged file sat there while the
  next sweep read a stale `dist` and reported CLEAN. The harness now restores on
  a `trap … EXIT` and reports a failed build as a failed PATCH rather than as a
  result. **A sweep that cannot build is not a sweep that passed.**
- **`it opened the row Morning CIO linked, and says which figure it stands
  behind`** read the `backs` pill on SEVEN routes, and `it opened a section
  Morning CIO's axis actually drew…` on two more — all nine would have failed
  the moment the pill went, and did. The half that still has an answer (the
  address resolved to the section the reader clicked) is what is left; the other
  half is the absence check.
- **`the page separates cross-held from the duplicate policy`** read the lead
  paragraph. That is the claim re-homed above — found by the sweep, not by
  reading, which is why the full walk runs before the commit and not after.
- **THE FACET-NOTE CHECK REQUIRED A NOTE ON EVERY CHIP, AND ONE HAS NONE.**
  `holdings-winners`' "Showing a gain" facet carries `note: ""` in the book,
  correctly — the label says the whole of it, and inventing a sentence to
  satisfy a check is the wrong direction. It is `some` rather than `every`, and
  it is spread ONLY into the eight scopes that draw a toggle: in the shared
  block it abstained on ten routes that have no facets at all, and **ten
  evidenced abstentions are how a real one gets missed.**

One more was found by the sweep rather than by a reintroduced bug: the
money-weighted hover's sub-year branch SHOUTS its sentence (`THE WINDOW IS 150
DAYS AND THE RATE IS NOT ANNUALISED`) and the annualised branch does not, so a
case-sensitive check failed a page that was right — `label-xs`'s trap arriving
through a template literal instead of a CSS transform.

`build` · `tsc` · `test:ingest` 140 · `test:family` · `check:family` 53/0 ·
`check:pages` **138 combinations clean**, with the same two pre-existing
abstentions. `glowData.ts` is untouched — nothing here reads the ingest.

### Stage 10ap — FOUR MORE REMOVALS, AND COMPARE COMPANIES GOES ENTIRELY

*"remove highlighted texts and sections from the dashboard UI"* — pointed at
three paragraphs on three pages — and *"remove the compare companies page from
the dashboard UI completely."*

The fourth round of the same instruction, and the fourth time the text being
removed turned out to be the LAST home of something. The method is the one
Stages 10aa, 10ai and 10am established and is the whole of the work: audit every
claim line by line against the rest of its own page, MOVE what has no second
home onto the figure it describes, delete the rest, and assert both the removal
and the new address. What is new here is the outcome of the audits — **two of
the three paragraphs were entirely redundant, and the third had four claims
already on its own page and four that were not.**

#### 1. Polycab — two paragraphs, and every claim already stated above them

The `Per demat account` card's subtitle and its footer. Audited before either
was touched:

| The claim | Where it already was |
| --- | --- |
| "one row per depository account" | the card's own TITLE, and its Depository account column |
| "the per-share mark is value ÷ units", "an NSDL statement has no rate column" | the `STATEMENT · as of` pill's hover, **in those words** |
| "a statement figure, not a live quote" | the same hover, and the pill itself |
| "cost is absent because a depository holds the shares; it did not buy them" | the Cost basis tile's own `sub`, which is where the em dash is |

Nothing moved, because nothing had to. Both halves are asserted and neither
implies the other: the prose is GONE, **and** the hover still carries the
derivation — a build that lost the lot passes an absence check on its own.

#### 2. Private Market — the lead, and both header pills

**THIS IS THE SECOND TIME §6 HAS BEEN NARROWED, AND IT IS RECORDED RATHER THAN
GLOSSED.** Stage 10ao took the `<BasisPill>` off Morning CIO and `/holdings` and
kept it here as the correctness half; the family have now pointed at it on this
page too. `statementPortfolio` IS STILL THE SOURCE — that is where the guarantee
actually lives, and it has not moved. What went is the reader being TOLD.

What that costs was measured rather than asserted, and on this page it is the
smallest it could be:

- **the LABEL.** Not one private holding resolves an NSE symbol, and every live
  endpoint is keyed on one — so no row here could drift even if the page read
  the live portfolio. That is a PREMISE, so `check:pages` now checks it every
  run (`PRIVATE_QUOTABLE`, derived from the book): a drop bringing a quotable
  private holding fires by name and the decision gets made again, instead of
  this paragraph silently becoming false. **This is the fifth absence in this
  file that could have been recorded against an unchecked premise, and the first
  one written down as a check on the day it was made.**
- **the DATE.** `<BasisPill>` dates a consolidated figure `portfolio.asOf` — the
  book's newest report date, two weeks ahead of every mark on this page. The
  derived spread below it (*"Marks span … → …"*) was always the truer statement
  and it stays, so losing the pill's date is a GAIN. That is the argument
  `Polycab.tsx` already makes at length for never having used the component.
- **`N accounts behind`** is about the BOOK's accounts, not this page's.

**Capital Gains, Data Audit and Ledger Insights keep theirs**, and `check:pages`
still asserts one of them, because a build that deleted the component everywhere
would satisfy this removal and take the guarantee with it.

The subtitle counted funds, accounts and owners. **Two of the three were already
printed** — the fund table's footer reads `Total · N funds` and the By-owner
rollup ENUMERATES the owners, which is stronger than counting them. The ACCOUNTS
count was nowhere else, so it moved onto the Private market value tile *(which
reads "Market value" since Stage 10bs, with the count in its hover — the tiles
are a figure and one short line now)*.

#### 3. Sector Composition — eight claims, four of them already on the page

The long footer. Four claims survived where they were — the "company shares
only" framing (the subtitle), the total (the donut hole), the mandate / own /
route-unstated split with its counts, accounts and shares (**three cards that
already render it, with more detail than the sentence had**), and "which of the
two chose a name" (the Held via column). Four had no second home:

- **the holdings count and "each counted once"** → the donut hole, under the
  total they describe. Asserted against the sector table's own Positions column,
  which is the same figure by a different path.
- **the excluded classes, each with a value** → a third partition card, `Not a
  company share ₹488.4 Cr`, beside the two that split the covered set. It is a
  LABELLED FIGURE rather than a sentence, which is also what lets the check be
  struck on arithmetic: company shares + the named classes must reconstruct the
  consolidated NAV, and the card's own total must tie to the list beneath it.
  **A sector page over ₹222 Cr of a ₹710 Cr book is an unexplained narrowing
  without it.**
- **why Unclassified is unclassified** → onto the Unclassified row and its
  legend entry, as a hover, which is where an absence's reason belongs. *(The
  legend went at **Stage 10bt** — every row of it was a row of the table beside
  it — so the reason rides on the table row, and on the Compare picker's row.)*

`privateMV` and `unclassified` fed nothing but that paragraph and were DELETED
with it rather than left computing the right number into no caller.

**AND THE `title` WENT ON THE EXISTING SPAN, NEVER A NEW ONE.** That cell is a
flex container, so an added child becomes a flex ITEM and `innerText` breaks the
line at it — Stage 10ah's "N entities" trap, which would have silently reshaped
every row-based check on the page.

#### 4. Compare Companies — the page, the group, and one orphaned module

`/compare` redirects, the nav entry is gone, `src/pages/CompareCompanies.tsx` is
deleted, and with it the whole **RESEARCH** nav group, which held nothing else —
the same thing that happened to MONITOR at Stage 10y and KNOWLEDGE at 10x. The
headings are derived from the entries, so the group disappears on its own.

**`src/lib/ratios.ts` WENT WITH IT.** `fetchRatios`, `isRatiosError` and
`DEFAULT_METRICS` had no other caller, and a builder nothing calls is the
dead-code-that-looks-alive failure this file keeps naming. `functions/api/ratios.js`
STAYS — `RatioTable` on the company page still calls it (the Ratios sub-tab of
the Company research card since Stage 10cn).

**IT FORWARDS TO PORTFOLIO MONITOR**, which is the surviving surface nearest its
purpose rather than a neutral fallback: that page's SECURITY axis is one row per
company across every vehicle the family holds it through, and each row opens
`/stock/:securityKey`, where the price, the returns table, the ratios, the
filings and the family's own target and upside all still render per company.
Comparing four side by side is what is gone; reaching any one of them is not.

**AND `/watchlist` IS REPOINTED RATHER THAN CHAINED.** Stage 10w sent it HERE,
on the reasoning that Compare was the surviving surface in the same nav group
that still rendered a target and its upside. That reason expired with Compare,
so it goes straight to its own final destination — **two hops settle at the same
pathname as one, which is exactly the stale routing `check-family-inputs.mjs`
records it cannot catch.**

**NOTHING THE FAMILY TYPED WAS DELETED.** `src/lib/watchlist.ts` is untouched
and `InvestmentTools` still reads and writes every entry on a name's own company
page. `readWatchlist`'s last caller OUTSIDE that file has gone, so it now LOOKS
like an orphan while `readEntry` and `writeEntry` still call it — said at its
own definition, because that is exactly how a store the family typed into gets
deleted a release later.

**AND ONE CHECK ASSERTED THE OPPOSITE AND WAS INVERTED, NOT DELETED.**
`check-family-inputs.mjs` carried *"the Research group survives with Compare
Companies in it"* — true until the one that survived was removed.

#### Ten bugs reintroduced, and one weak check replaced before the pass

Each was put back on its own, rebuilt and swept, and each fired exactly its own
check: the Polycab subtitle restored; the pill hover stripped of the derivation;
the Private Market pills back; the accounts count dropped from the tile; a
private holding made quotable (which names the offenders in the failure line);
the donut's count deleted; a class dropped from the excluded card (**two checks,
from two directions**); the Unclassified hover removed; the Compare nav entry
restored (**two — the entry and the group heading**); and the `/compare`
redirect deleted.

**AND ONE NEW CHECK COULD NOT HAVE FAILED, WHICH IS WHY THE PASS IS WORTH
RUNNING BEFORE THE COMMIT AND NOT AFTER.** The first draft of the excluded
card's guard asserted that *no class named as excluded appears as a sector row*
— and the two name spaces never collide, because sectors are GICS and the
classes are `AssetClass`. It was replaced by the card's total tying to its own
list, which fires. What actually guards the original defect — a fund standing at
the head of a sector table — is the fund-NAME check that has been there since
Stage 10h.

**TWO MORE OF THE NEW CHECKS FAILED A CORRECT PAGE AND WERE FIXED**, both for
reasons this file has recorded before. `cr()` returns **NaN** for a missing
match, so `cr(a) ?? cr(b)` never falls back — NaN is neither null nor undefined
— and the reconstruction reported that it could not read figures the page was
rendering. And a sector row's NAME is on its own line: the name cell is a flex
container whose chevron and swatch are flex items, so `innerText` breaks before
the figures. Matching `Unclassified\t` found nothing and **ABSTAINED** on a page
whose largest sector is exactly that, which is the evidenced-abstention trap —
a gate that cannot see its own subject reports "not applicable" rather than
failing.

`build` · `tsc` · `test:ingest` 140 · `test:family` · `check:family` 57/0 ·
`check:pages` **136 combinations clean** (138 less the two the removed
`/compare` route walked), with the same two pre-existing abstentions.
`glowData.ts` is untouched — nothing here reads the ingest.

### Stage 10aq — SECTORS FOR TWO SETS, AND THE MAP THAT MADE THEM POSSIBLE

Four asks, and the one that took the work is the one that looked smallest.

#### 1. *"remove the highlighted text from the dashboard ui"* — the Portfolio Monitor's two grey paragraphs

Audited line by line before anything went, the Stage 10aa / 10ai / 10al pattern,
because most of it carried a FIGURE:

| The claim | Kept? |
| --- | --- |
| "One row per company, ranked by total exposure" | chrome — the table is one row per company and sorts on that column |
| "A FUND IS NOT A STOCK and is no longer a row" | chrome — no fund is in the table to contradict it |
| **the DERIVED fence** | **moved UP, onto the two columns it is about** |
| the coverage, the five buckets, the AIF block, the clubbed count | inside a one-line fold |
| the loading / unreachable states | in the SUMMARY, unfolded |
| "Weight is a share of the book, not of the holdings you picked" | already on the column — `weightPlain` is the `plain` line of every Weight cell's own popover and the footer's title carries it |

**A COLLAPSED ONE-LINER IS NOT A WALL OF PROSE**, and it is the form this book
already uses for "the rest are NAMED" (the excluded accounts on the NAV card).
What the family objected to was seven lines of grey under their table; what they
must not lose is a table that quietly reads as the whole of their money, so the
summary still states the one thing they act on — `covers ₹299.6 Cr of the
₹710.4 Cr book`.

**THE FENCE DOES NOT GO IN THE FOLD, AND NOT IN A HOVER EITHER.** *"It says
DERIVED, not a position, in words rather than in a tooltip"* is a rule of this
book. `Th` grew a `note`, so `Via funds` carries **derived** and `Total exposure`
**incl. derived** under their labels — visible whatever the fold is set to, on
the column each is about, which is strictly better than the paragraph was.
`check:pages` reads them structurally through `data-col-note`.

**AND THE PROBE HAD TO LEARN TO OPEN THE FOLD.** Three invariants read that
text; a collapsed `<details>` is not in `innerText`, so unopened they would have
reported it unparseable — an ABSTENTION, not a failure, retiring all three in
silence. The same fix the excluded-accounts block already needed.

#### 2. Sector Composition gets the family's own two sets

*"add a toggle switch for direct equity and consolidated. in direct equity we
will show only the sector composition of direct equity holdings, and in
consolidated sector composition we will show sector composition based on the
aggregate securities weightage as per the data from the security filter in the
holdings in portfolio monitor."*

**NEITHER IS THE SET THIS PAGE USED TO SHOW.** It was company shares —
mandate-chosen and self-bought — and the two asked for sit either side of it.
**Consolidated is the default**, a decision rather than an ordering: it is the
widest, and opening on Direct Equity would take ₹127 Cr of mandate-held shares
off the first paint, which this page's own header note has always warned against.

**ONE DEFINITION, AND THE TWO PAGES ARE HELD TO IT.** `companyExposure` in
`lookthrough.ts` is what the Monitor's stock axis and this view are both built
on, and `useStockExposure` assembles the three inputs `loadStockExposure` needs
(which vehicles the family holds and at what value, the ISIN bridge, the
ring-fence) once instead of per page — two of those fail silently when got
wrong. Measured, the two pages agree exactly:

| | Monitor · Security axis | Sector Composition · Consolidated |
| --- | ---: | ---: |
| Direct + PMS | ₹222 Cr | ₹222 Cr |
| Via funds | ₹77.6 Cr | ₹77.6 Cr |
| Total exposure | **₹299.6 Cr** | **₹299.6 Cr** |
| companies | 565 | 565 |

and the page's three tiles rebuild the book: ₹222 + ₹77.6 + ₹410.8 = ₹710.4 Cr.
`check:pages` holds both to ONE derivation off `glowData.ts` — if they ever
diverge, one of them is wrong.

**A RETURN IS REFUSED THROUGHOUT THE CONSOLIDATED VIEW, with its reason.** Its
value column is part measured and part derived and no statement reports a cost
for the second, so a percentage would divide a part-measured gain by a cost
covering a fraction of its own numerator — "a total must tie to its own columns",
one column wider. `AbsentCell` with that cause, never a bare dash.

#### …and Direct Equity was one grey wedge, which is a finding

**NOT ONE of the 37 company shares the family bought in its own demat or broking
account carries a sector.** A depository statement prints an ISIN, a quantity and
a rate and no industry at all, so read off the book alone this view is 100%
Unclassified — true, and it answers nothing.

What places them is an identifier. Fourteen of those ISINs are named in a monthly
portfolio disclosure filed by a fund **this same family holds**, and that filing
prints the company's industry. Joined on the ISIN — exactly, never on a name —
and resolved through the one committed map: **14 of 37 placed, ₹44.0 Cr of
₹94.9 Cr, and ZERO where two filings disagree.** The view draws 6 sectors instead
of 1.

**IT ONLY EVER FILLS AN EMPTY SECTOR** and can never contradict the book: a
position whose own statement printed one keeps it. So this page places names the
rest of the app leaves unplaced rather than placing them differently, and it says
so with the count — 84 from the family's own statements, 364 from a filing. The
durable fix is a backfill pass in the ingest; it is named here rather than done,
because `build-lookthrough` reads the book that would consume it.

#### The map is why any of that works, and my first measurement of it was wrong

`shared/sectors.mjs` carried the AMFI taxonomy's MACRO level ("Financial
Services", "Capital Goods"), which arrived with the PMS fact sheets. A fund's own
SEBI disclosure prints the INDUSTRY level, and none of it was there: **57 of 65
distinct labels resolved to nothing, 1,009 of 1,318 disclosed lines Unclassified**
— a sector table where a fifth of the book says "we could not place this" for want
of a map entry rather than for want of a source.

**THE FIRST MEASUREMENT SAID THE OPPOSITE, AND IT WAS MINE.** `resolveSector`
returns `{ sector, matchedBy }`, and a test comparing it against the STRING
`"Unclassified"` passes on every label — so the first pass reported "all 65 map,
zero unmapped" and would have shipped a Consolidated view mostly grey. Caught by
the per-company follow-up printing `[object Object]`. It is the
plausible-wrong-answer this repo exists to catch, arriving in the measurement
rather than in the page.

Fifty-seven entries added, one GICS sector each, listed as the disclosures print
them. Two are deliberately NOT listed: `UNRATED` joins `PROVIDER_UNCLASSIFIED`
(the filer declined to classify), and `Units of Infrastructure Investment Trusts`
has no GICS home — GICS names equity REITs and does not name InvITs, so placing
one in a company sector would assert a classification GICS does not make.

**AND IT MOVED THE BOOK BY EXACTLY ONE POSITION**, which is the check that says
this was a map extension rather than a re-measurement: Chemfab's `CHEMICALS`
prefix-matches the new `Chemicals & Petrochemicals` entry and leaves Unclassified
for **Materials**, ₹3,74,700. That is the map's own documented prefix rule doing
what it is for. `glowData.ts` is regenerated and idempotent.

#### 3. *"what is uncalled capital? … what is distributions?"*

The client, on two Private Market tiles. Both halves of each are answered **on the
tile** — `StatTile`'s `hint` renders on screen — because a definition a reader has
to point at is a definition they will not find. WHAT it is first, because the
figure means nothing without it; HOW it is arrived at second, including the two
folios the uncalled figure cannot cover. *(**THE "HOW" HALF HAS SINCE GONE** —
the same client, a round later: "do not show lengthy explanations in the private
market terms… just tell what is it in short and legible font text." The
definitions are one line each now and the methodology is on the working line
under the capital-account table, which already carried it word for word. See
Stage 10be. What is unchanged is the half this paragraph is actually about: a
definition belongs ON THE TILE and never in a hover.)* The second tile is renamed
**Distributions (cash returned)**: its sub-line had always said "distribution
figure", so a reader asking what a distribution is was reading a word the tile
used and never defined.

#### 4. *"rename consolidated NAV as Current Value of Holdings … wherever it is written"*

Every rendered label — the Morning CIO tile, the top bar, NAV & Performance, Data
Refresh, the drill-down's title and `backs` — **and the prose**, which is where
the instruction's "wherever" bit: the phrase was in sentences on Compare
Companies, the stock page, Register, the NAV card, the chat panel and a
drill-down note. Code comments keep it; nothing there renders.

**TWO OF THOSE SURFACES HAVE SINCE BEEN REMOVED**, by Stage 10ao and 10ap on the
way in: `Drilldown.backs` went with the header pill row, and Compare Companies
went entirely. The rename is recorded against them anyway rather than tidied out
of this list, because the surfaces it had to reach is what the instruction's
"wherever" measured, and a later removal does not unmake the audit. What DID
have to change is the check that guards it: `DRILLDOWN_CHROME_GONE` asserts the
retired pill never comes back, and it named only the OLD label — so it could not
have fired for the pill returning under the label the app now draws. It matches
both.

**AND THE RENAME BROKE FOUR CHECKS, WHICH IS THE POINT.** The sweep reads this
tile's figure OFF ITS LABEL to feed other invariants, and three more find the
tile by matching `/consolidated nav/i`. A rename the probe did not follow would
have made those report NOT CHECKED — an abstention, not a failure, and how a
check retires itself in silence. The new both-directions assertion is what
surfaced it, and it is also what found the prose: it failed while the tile was
already correct, because `NavVsIndex` renders the phrase inside a fold the sweep
opens.

#### 5. …AND THIS PAGE'S OWN FOOTERS WENT WITH THE REST, ON THE WAY IN

Stage 10ap removed Sector Composition's footer paragraph at the family's request
— *"Remove all the highlighted text and the sections from the dashboard UI"* —
while this branch was open, and this branch had written a NEW footer for each of
its two views. Merging the two by keeping both would have re-landed on the page
the exact block they had just asked to be rid of, one per view, which is the
letter of the merge and the opposite of the instruction.

**SO BOTH FOOTERS GO, AND EVERY CLAIM WAS AUDITED FIRST**, the same way Stage
10ap audited the one it replaced. Most of what they carried was already on the
page in the partition cards this branch built; three things were not, and each
moved onto the figure it describes rather than into a fold:

- **the row COUNT and that the set is deduped** → the donut hole, under the
  total, with the view's own noun (Consolidated rolls up COMPANIES, Direct
  Equity rolls up HOLDINGS — a count under the wrong noun is the caption
  failure this page has already paid for);
- **the two-tier sector provenance** — how many companies a family statement
  placed and how many a fund's own filing did — → the donut hole, as two
  counted figures. This is the one a reader cannot infer: it is the whole reason
  the page can place a depository holding at all;
- **why Unclassified is unclassified** → the hover on that row and its legend
  entry, which is where an absence's reason belongs.

**AND THAT REASON IS WORDED PER VIEW, which the merged-in version could not be.**
Stage 10ap's constant reads *"these are company shares, so the sector exists; the
document simply does not report it"* — true of Direct Equity, which has ONE place
to have looked, and silent about Consolidated, which has a second: the industry
an AMC filed against the same ISIN. A reason that names the wrong cause sends the
next reader to the wrong source, so `unclassifiedWhy` takes the view.

**THREE HELPERS LOST THEIR LAST CALLER AND WERE DELETED, NOT LEFT.**
`privateMV`, the standalone `unclassified` binding and `shareOfTable`. The last
is worth naming because Stage 10ap had just ADDED its callers: it printed a
subset's share of this table, which fitted cards that split the ONE set the page
drew. The cards here describe the active view and what sits OUTSIDE it, so the
only percentages it could produce were 100% and a share of a denominator the
reader cannot see. A helper with no caller is the failure this file keeps
naming, so it went with them rather than being kept for a future one.

**Seven bugs reintroduced, each firing its own check**: the Consolidated view
showing only the measured half (fires the two-page identity), the default view
moved (5), the disclosed-sector fallback dropped so Direct Equity is one wedge
again, the derived markers taken off the columns (2), the grey paragraph put
back, the uncalled-capital tile stripped of its definition, and the tile rename
reverted (4).

`build` · `test:ingest` 140 + 35 · `test:family` · `check:family` **57/0** ·
`check:pages` **146 combinations clean**, with the same two pre-existing
abstentions. `build-book` regenerates the book BYTE-IDENTICALLY, which is the
gate that says a sector-map extension moved one position's classification and
nothing else.

**THAT COUNT IS MEASURED ON THE MERGED TREE AND DOES NOT FOLLOW FROM THE ONE
ABOVE IT.** Stage 10ap states 136, which was true of the branch that wrote it
and is not a fact about main: three PRs landed in parallel and the last to merge
carried a count struck against its own base. This branch adds one route
(`sectors-direct`) and removes none, so the two figures cannot be reconciled by
arithmetic — which is the point of re-running the sweep rather than adding to a
number, and the same reason `docs/BOOK-REPORT.md` counts rather than asserts.

