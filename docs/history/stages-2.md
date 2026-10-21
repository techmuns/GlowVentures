# Stage history, part 2 (Stage 10ar → 10bn)

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 8939–14157). CLAUDE.md now carries the condensed rules; this file is the record. -->

### Stage 10ar — THE NAV SERIES REACHES BACK, AND THE RETURNS ARE ATTRIBUTED

*"fix this portfolio NAV, we are only able to see portfolio NAV for a very short
period of time. Build return attribution over a period, against the benchmark —
'what was my portfolio value in end of August 2025? What's my portfolio value end
of August 2026? What was the attribution to those returns in 2026? So what did
the benchmark do? What did I do? What did my portfolio do? In this last year,
return attribution… which were the biggest detractors of returns?' All of these
questions in my mind, these should be visible in this section."*

**FOUR QUESTIONS. THE ARCHIVE ANSWERS THREE, AND THE FOURTH IS A REFUSAL WITH AN
ASK.** Measured before anything was built, which is the whole of why the split
is stated rather than glossed:

| The question | Answered from |
| --- | --- |
| what moved, and which names | **NEW** — the four-term bridge over 268 holdings priced at both ends of a window |
| what did the market do | the Nifty 500 over the same span, already fetched |
| what happened over the last year | **NEW** — the managers' own published one-year returns, each beside the benchmark THAT MANAGER publishes, on the same document |
| what was it worth in August 2025 | **ABSENT.** The archive's earliest dated valuation of any kind is 2026-03-31 |

#### 1. The series was 34 days because of a rule, not because of the archive

`navHistoryFrom` began the series where EVERY covered account had published —
2026-07-10 — because a NAV LEVEL that climbs ₹27 Cr → ₹142 Cr as accounts ARRIVE
reads as performance. That rule was right about the level and it threw away 40 of
the archive's 74 measured days, which is exactly what the family reported.

**A CHAIN-LINKED INDEX NEEDS A CONSTANT PANEL ACROSS EACH LINK, NOT ACROSS THE
WHOLE SERIES.** Each point now carries the interval ending at it, struck over the
accounts valued at BOTH its ends:

```
r = (linkClose − flowIn) / linkOpen − 1
```

An account first publishing on a date is in neither end of the link ending there,
so its arrival contributes **0.00%** instead of a step. Measured, the panel grows
4 → 13 and the series runs **7 points over 34 days → 12 points over 74**, from
2026-05-31. `navSeries.ts` chains on the link; `windowReturnPct` reads +5.09%
where dividing the LEVELS reads **+398.76%**, and the suite asserts that gap
rather than only the right answer.

**THE RAW NAV LINE IS THE ONE THING A CHAIN-LINK CANNOT RESCUE**, because it is a
LEVEL. It is rebased where the panel completes and is `null` before it — not NaN,
which reaches the axis domain and drags it. `panelComplete` rides on every point
and `panelCompleteFrom` in the coverage block, so the old rule survives exactly
where it is load-bearing.

**AND THE RAW-vs-ADJUSTED PAIR IS NOW STRUCK OVER ONE WINDOW.** The toggle's
hover set the whole series' adjusted return against the raw line's last value —
74 days against 34, calling the extra weeks a deposit. Both figures were right on
their own terms, which is this card's own footer rule failing inside a tooltip.
Both are over the complete-panel segment now (+9.29% against +0.54%, the original
pair), and the hover SAYS so.

#### 2. Return attribution — 268 holdings priced at both ends, and nothing read them

**SIXTEEN ACCOUNTS PUBLISH A VALUED HOLDINGS STATEMENT AT TWO OR MORE DATES, AND
THOSE STATEMENTS ARE PER HOLDING.** Goldstandard prints 32 rows at 10 July and 32
again at 11 August, SVAN 46 rows at three month-ends, Green Lantern 34 at two.
That is the **seventh** absence in this book recorded against a premise nobody
rechecked — after FRED, the RBI, the release calendar, the ISIN tier, the NAV
series itself and 3P's redemption on page 2.

**THE SPLIT IS EXACT, AND THAT IS THE WHOLE LICENCE FOR PUBLISHING IT.** Market
value is quantity × the statement's own mark wherever a price is printed — rule
3, and MEASURED rather than assumed: of 794 valued rows across the archive's
holdings documents, 765 carry both and **every one satisfies the identity to the
paisa, zero do not**, and the other 29 carry no price at all. So

```
v₁ − v₀  =  q₀·(p₁ − p₀)  +  (q₁ − q₀)·p₁
            └─ PRICE ──┘      └── TRADING ──┘
```

with **no residual**. Nothing is apportioned, smoothed or fitted.

**FOUR TERMS, BECAUSE TWO WOULD HIDE THE LARGEST MOVEMENT IN THIS BOOK.** A
holding that ENTERED contributes its whole closing value and one that EXITED its
whole opening value. Folding either into `tradeEffect` is defensible arithmetic
and a bad answer: V.E.C 128005 runs ₹9.24 Cr → ₹20.29 Cr, +119%, and essentially
all of it is the ₹11.24 Cr of Fund Deposits `accountXirr.test.ts` already gates
that account for. Split out, the bridge SHOWS it as capital. On this book:

| | |
| --- | ---: |
| Opening value, 13 accounts, 2026-05-31 → 2026-08-13 | ₹126.28 Cr |
| **Price** — the only term that is performance | **+₹2.54 Cr** |
| Trading | +₹8.37 Cr |
| Bought in | +₹10.72 Cr |
| Sold out | −₹8.23 Cr |
| Not split — no per-unit price at one end | +₹0.49 Cr |
| Closing value | **₹140.17 Cr** |

and it covers ₹140.17 Cr of the book's ₹710.39 Cr, because every other account
publishes one statement and **a level is not a change**.

**A ROW WITHOUT A PRICE IS ITS OWN TERM, NEVER ZERO.** Cash sleeves and AIF units
marked at a total value have no split. 360 ONE holds one such line and its value
still moved ₹1.44 Cr → ₹1.47 Cr; printed `+₹0` that reads *this mandate went
nowhere*, which is a measurement nothing made. Those cells render `AbsentCell`
with the reason — and the **Not split** column exists so the row still ADDS
ACROSS. Without it the row read open ₹1.44 Cr, price ₹0, trading ₹0, in/out —,
close ₹1.47 Cr, which is "a total must tie to its own columns" one table over.
**It was found by reading the rendered page, not by reasoning.**

**A NAME HELD IN SEVERAL ACCOUNTS IS ONE CONTRIBUTOR** — the rupee impact adds
and the percentage is re-derived from the combined opening value, never averaged
across positions of different sizes. Today's movers' own rule arriving through a
window: Ather Energy sits in both V.E.C folios at ₹33.69 L and ₹24.07 L and would
otherwise take two of the top five slots while understating itself in both. The
book's largest detractor is **Jammu Kashmir Bank −₹106.04 L, −19.47%**.

**EACH ACCOUNT KEEPS ITS OWN WINDOW.** Green Lantern's pair is 25 June → 27 July,
Carnelian's 10 July → 10 August, SVAN's 31 May → 31 July. One imposed window
would discard accounts or credit one with weeks of standing still, which is
`pooledXirr`'s own finding (5.44 pp on a quarter). Rule 3 applies too: one
`dedupeGroup` counts once, at its later row.

**AND AN ACCOUNT WHOSE BRIDGE DOES NOT TIE IS NOT PUBLISHED.** Every term is
arithmetic on printed primitives, so a gap above a rupee means a row landed in
two terms or in none — the account is dropped and NAMED in the run's notes.
`hdfcNsdl.mjs`'s licence, applied to a decomposition.

#### 3. The last year, from the managers' own reports — and no book-wide figure

**SEVEN ACCOUNTS PUBLISH A ONE-YEAR RETURN AND THEIR BENCHMARK'S ONE-YEAR RETURN
ON THE SAME DOCUMENT**, struck by the manager who runs the mandate. That is a
primary-source answer to *"what did the benchmark do? what did I do?"* over
exactly the period asked about — V.E.C 128004 **+30.46% against BSE 500 TRI
+4.93%**, Carnelian +15.84% against S&P BSE 500 +5.89%, SVAN 8710067 +7.27%
against +2.98%.

**BOTH FIGURES MUST COME FROM ONE BLOCK, and that is not a nicety.** Green
Lantern's fact sheet closes 27 July and its performance history 10 August, and
the S&P BSE 500's one-year reads **1.22% on the first and 5.89% on the second**.
Pairing across documents prints a 14.93 pp active return where the document says
10.30 — two windows in one row, and `attribution.test.ts` asserts the pairing per
account by `source`.

**AND THEY ARE NEVER AVERAGED INTO A BOOK FIGURE.** Different fee bases
(Goldstandard after fees, Carnelian before), different benchmarks (N50TRI, S&P
BSE 500 TRI, NSmCap250TRI) and different end dates. A weighted mean of those is a
number no document supports, so the card REFUSES it in words and names the five
accounts whose report carries no such pair. The refusal is the deliverable, which
is why it is asserted as text: a card that averaged them would render a perfectly
plausible percentage that no value check could see.

#### 4. August 2025 is a refusal, and two substitutes were available

Measured, not assumed: the archive's earliest dated valuation of ANY kind is
**2026-03-31**, and the earliest belonging to an account that publishes twice is
2026-05-31. So the opening side of that comparison does not exist, and neither
does any calendar year's.

**TWO PLAUSIBLE SUBSTITUTES WERE AVAILABLE AND BOTH ARE REFUSED.** Cost basis is
dated on **3 of 371** positions, so "what it was worth a year ago" cannot be
backed out of cost; and `BOOK_CAPITAL_MOVES` runs to 2023-05-04, so an opening
value could have been *inferred* from capital in less capital out. **Neither is a
valuation.** The ask is one document — a holdings statement per account dated on
or before the date in question — and the card says so with the figures behind it.

#### 5. `/performance`'s stale absence, which this change made a contradiction

That page rendered *"No valuation series in this book · each account's statements
carry exactly two dated portfolio values"* for five deliveries after it stopped
being true, and this file already named it as the SIXTH unchecked-premise absence
and *"one `<NavVsIndex />` away"*. It draws that chart now, off the same
generated series, so the two pages cannot disagree about what the book measured.
Both halves are asserted, and neither implies the other: a build that deleted the
card satisfies the absence check and draws nothing.

#### Fifteen bugs reintroduced, and the harness itself was the first defect

**THE RESTORE SILENTLY DID NOTHING.** Two of the files this pass patches are NEW
and therefore UNTRACKED, and `git checkout -- <untracked>` is a no-op — so the
first run left every bug in place and reported the accumulated failures under
each later bug's name. Caught by running a NO-PATCH CONTROL, which came back
with four failures on an unchanged tree. The harness snapshots to a temp dir and
restores by copy now. **A restore that cannot restore looks exactly like one that
did**, which is this file's own `set -e`/`trap` lesson in a new shape.

Thirteen of the fifteen then fired their own check on the first attempt. **The
two that did not are the point of doing it**, and both were gaps in the sweep
rather than in the pages:

- **Chaining on the LEVEL again makes the Book pill read +398.76% instead of
  +5.09%, and the whole sweep stayed CLEAN.** Every existing invariant on that
  card checks the header's shape, the chart's geometry and the panel sentence,
  and **not one looked at the MAGNITUDE of the figure**. `test:family` caught it;
  the screen is where a reader would have believed it. The pill is now reconciled
  against the book's own links, computed in `check-pages.mjs` on a path the page
  does not take — and against the WRONG chaining too, so an equality written only
  one way round cannot pass.
- **Rebasing the raw NAV line at the series' first point draws it climbing ~440%
  over a growing panel** and blows the y-axis domain out so far that both real
  lines flatten. Also clean, because the hover's pair is computed separately and
  stays right. The dashed curve's own vertex count is now checked against the
  book's complete-panel point count.

Three more defects were found this way in the checks themselves: `innerText`
returns `""` for everything inside a collapsed `<details>` (the per-account table
came back as eight empty cells and failed a correct page); `\b` does not exist
between two word characters, so `/\bperformance\b/` matched nothing in the
inline-badge cell `"PricePERFORMANCE"`; and a reason regex was struck on a
PARAPHRASE (`no per-unit price`) of a sentence that reads *"carries a per-unit
price on both statements"*.

**AND THREE `navSeries.test.ts` CHECKS ENCODED THE RULE THIS CHANGE REPLACED.**
One asserted no covered account's first valuation is later than the series'
start; it moved down a level, to `panelCompleteFrom` and the per-point flag. One
compared the whole series' adjusted return against the raw line's last value —
which silently became 74 days against 34 — and is struck over the complete-panel
segment now. One reproduced the chain by dividing levels, which is the bug. The
same fixture-shaped calibration was in `check:pages`: *"the book must read BELOW
the index"* was the fixture's outcome standing in for the claim, and inverts on a
card that is correct.

`build` · `tsc` · `test:ingest` 140 + 84 + 35 · `test:family` (a new
`attribution.test.ts`, anchored on the generated book) · `check:family` 57/0 ·
`check:pages` **146 combinations clean**, with the same two pre-existing
abstentions. `npm run build-book` was run as a CONTROL first and regenerated
byte-identically, so every difference belongs to this change; `BOOK_SUMMARY` does
not move by a rupee, because a decomposition of a window is not a re-measurement
of the book.

### Stage 10as — EVERY INSTRUMENT, NOT JUST STOCKS; AND A CLOSED POSITION IS NOT AN ALLOCATION

Four asks, and the last two turned out to be one defect seen from both ends.

*(Numbered `10as` rather than `10aq`: main took THAT letter and then `10ar` too,
while this branch was open — the same parallel-branch collision Stage 10al
already records, twice over. Four PRs landed on main during this branch's life,
which is why the letter moved twice and why every count below was re-measured on
the merged tree rather than carried across. And
the first of the four asks below OVERLAPS main's own — both rounds pointed at the
grey paragraph under this table — so what shipped for it is MAIN'S answer, the
collapsed fold in Stage 10aq, and the subsection here records only what this
branch put beside it and what the merge had to correct.)*

*"remove the highlighted text from the dashboard."* · *"we only need to show the
current holdings in these allocation drill down pages, if anything has been
redeemed or sold completely then remove it from these pages since they are
supposed to be the current holdings allocation only."* · *"we also need to
account for the stock positions held through mutual funds and PMS as well… in
the security filter page in holdings toggle page."* · *"the Look-through must
cover bonds, NCDs and every instrument, not just stocks. Any stock or bond. It
could be a bond. It could be an NCD. **If I type it, it has to first pick up.**
And then it has to show me how much — not just stocks. For example — there is a
LIC housing NCD in the market. Now there's some negative news on LIC housing. I
want to see how much LIC housing I hold through my mutual fund exposure and
through which mutual fund."*

#### The look-through read one section of a document it already had

`build-lookthrough` read `holdings-direct/` — the AMC's monthly filing, EQUITY
SECTION ONLY, `meta.section` reading "Equity Holdings" on all 17 schemes. The
same repo carries **`public/amc-portfolio/`, which is the SAME FILING read
whole**: identical `sourceUrl`, every asset class, and **an ISIN on every one of
157,125 rows**. Verified before switching, not assumed. So the equity-only limit
this book had recorded as a real one was an absence against a document already in
hand — the **seventh** of those, after FRED, the RBI, the release calendar, the
ISIN tier, the NAV series and 3P's own page 2.

| | was | now |
| --- | ---: | ---: |
| disclosed rows in the store | 1,394 | **2,362** — Equity 1,394 · Debt 964 · Other 4 |
| schemes resolving to ZERO rows | 3 liquid funds | **0** — 214 / 161 / 151 debt lines each |
| derived exposure | ₹77.6 Cr | **₹90.56 Cr** |
| the part of a disclosed fund no line accounts for | ₹45.7 Cr | **₹32.73 Cr** |

**NOTHING ABOUT THE JOIN LOOSENED.** ISIN first, then this book's own
`securityKeyOf`, and **still no fuzzy tier** — the refusal `shared/nameMatch.mjs`
already records, where a token-overlap rule matched `KIRANAKART TECHNOLOGIES` to
`TATA TECHNOLOGIES`.

**AND `techmuns/amfibeas` IS READ-ONLY, as it has been since Stage 10s.** Nothing
here clones, updates or writes to it; the checkout is an INPUT (`AMFIBEAS_DIR`).

#### An Indian ISIN carries its issuer in characters 1–7, and that is the whole fix

```
INE115A01026   LIC Housing Finance   —  the equity share
INE115A07QY1   …the same company     —  an NCD
INE115A14FW4   …the same company     —  commercial paper, matures in three weeks
```

Keyed on the FULL ISIN, one company got as many rows as it has instruments. And
the rule beside it made that worse rather than visible: `takenHere` kept **ONE
DISCLOSED LINE PER FUND PER COMPANY** and dropped the rest, which was right while
the store carried the equity section alone — there the only repeat was a second
share class. On the whole filing it is the difference between an answer and a
wrong answer: **HDFC Balanced Advantage files TWELVE separate LIC Housing NCDs,
and keeping the first reports 0.6% of that fund against a true 1.74%.**

A row is one **ISSUER** now and its `instruments` are what it is made of, opened
underneath — because a reader acting on news about a company needs to know
whether they hold the equity, the paper, or both. `seenHere` still drops an exact
repeat: the same ISIN filed twice in one scheme is one holding printed twice.

**THE ISSUER TIER WAS MEASURED BEFORE IT WAS RELIED ON.** 1,052 ISINs collapse to
557 issuer prefixes; **34 carry more than one spelling and every one of those 34
is one company written two ways** — NABARD / National Bank for Agriculture and
Rural Development, REC / Rural Electrification Corporation, Tata Power / The Tata
Power Company. **None merges two different companies.** And it is load-bearing
rather than decorative: **100 of 557 issuers have names that normalise to more
than one key** (HDFC Bank alone to twelve, because each commercial paper carries
its own maturity in the name).

**AND THE ISSUER'S ISIN IS THE ONE THAT NAMES THE ISSUER.** A row now spans a
share, an NCD and a CP maturing in three weeks — all real identifiers, and only
the first still identifies the company after that paper matures. `rankIsin` takes
the BOOK's own where the book carries one, then the `01` equity series, then
anything else. It never invents one; every candidate was filed.

**`industry` IS TWO FACTS IN ONE COLUMN**, verified empirically: a SECTOR on an
equity row (`Finance`, `Banks`) and a CREDIT RATING on a debt one (`CRISIL -
AAA`, `ICRA A1+`). They are emitted as separate fields and neither is ever
printed under the other's heading — `upstreamStatus.ts`'s rule arriving through a
spreadsheet column.

#### …and the row had nothing to open, in three separate ways

*"If I type it, it has to first pick up."* Measured on this book, **553 of the
615 issuers a fund discloses are ones the book holds no position in** — including
LIC Housing itself. Every one of the three refusals was invisible on its own:

- **`securityNames` was keyed on `p.security` over the POSITIONS**, so a company
  only a fund holds was in no option. It unions the look-through's own names on
  the security axis now.
- **`derivedShown` was gated on `selected.size === 0`**, so picking a name
  suppressed the very rows the pick was for. The gate is per-row now.
- **The row carried no `venues`, so it drew no chevron** — and the expansion was
  gated on `assetClass === "Equity"`, which refused an issuer reached through its
  NCDs. It is `canLookThrough` now: an issuer, whatever paper of theirs a fund
  holds, excluding only a FUND row (a scheme holding itself is not a look-through)
  and CASH. A derived-only row gets its own expansion branch rather than an empty
  version of the venue one, because a route-split sentence over zero routes and a
  table with no rows are both statements about a measurement that does not exist.

**AND THE ROW'S CLASS IS WHAT THE FILINGS SAID.** `assetClass: "Equity"` was
hardcoded on a derived row; an issuer the family reach only through its bonds is
not an equity holding, and filing it as one is the fabricated-classification
failure. It is `e.classes` joined now — `Debt`, `Equity`, or both.

Measured end to end, the family's own example: **LIC Housing Finance across SEVEN
funds, held as Debt AND Equity**, twelve NCDs inside HDFC Balanced Advantage, CPs
in two liquid funds, equity in Bandhan, Kotak and ICICI.

#### A closed position is not a holding, on any allocation surface

`currentHoldings` in `analytics.ts`, **one definition read by every surface that
draws an allocation**. The monitor had dropped closed positions a stage ago;
`/holdings` and Private Market had not — Private Market drew 3P's three unit
classes at ₹0 apiece, three of its fourteen fund rows.

**AND `/holdings` FILTERS INSIDE `resolveDrilldown`, NOT AT THE PAGE BOUNDARY,
WHICH IS THE HALF THE MERGE CORRECTED.** This branch narrowed the set as it
entered the page; main filters where the SET is defined and carries
`closedExcluded` out with it, so the table's own subtitle names the rows it
dropped — *"N closed positions are not listed: the fund still publishes a NAV,
the family no longer holds them"*. A boundary filter leaves that count at zero
and the page falls silent about them. **Main's is what stands.**

**AND MORNING CIO *IS* NARROWED, WHICH THE MERGE GOT WRONG ONCE BEFORE FIXING.**
The reasoning above looks as though it should extend to the tile — narrow the
tile too and nothing anywhere accounts for the five — and it does not, because
`/holdings` builds its own set from the portfolio context rather than from
Morning CIO's locals. `closedExcluded` is 5 either way and the subtitle prints
either way, so BOTH can be true at once: the tile counts 364 and the drill-down
still names what it left out. The family settled it in the same words —
*"exclude closed rows from morning cio positions too."* A tile that disagrees
with the page it opens is the one failure `drilldown.ts` exists to prevent, so
Positions reads 364, Distinct names 208, and the cost coverage 55 of 364. The
count reconciliations are plain equality again rather than carrying a gap term.

**AND IT GOES THROUGH `currentHoldings`, NOT AN INLINE PREDICATE.** Five surfaces
now ask what the family currently holds — this page, the Portfolio Monitor,
Private Market, the fund look-through and `resolveDrilldown` — and a fifth copy
of the test is a fifth chance for one screen to disagree with the others about
which rows are still held.

**IT MOVES NO MONEY, WHICH IS WHY THE COUNT IS THE ONLY THING WORTH ANCHORING.**
A closed position is a measured ₹0 with no reported cost: NAV, Capital invested,
every allocation row, every weight and every return are identical either way. So
`check:pages` holds the rows against `glowData.ts`'s own closed KEYS rather than
against the tile — comparing the tile with the page it opens passes when BOTH
revert together, and that is exactly how the regression would arrive — and holds
the subtitle's count against `closedCount` from the same source.

**`unvaluedAccounts` DELIBERATELY KEEPS THE WHOLE SET.** It asks a different
question — does this account report any holding at all — and narrowing it would
fold 3P's account into the list of funds that publish no NAV, which is the
opposite of true: it publishes one and redeemed against it. A confidently wrong
reason sends the next reader to ask a fund manager for a NAV no fund owes.

**AND THE `redeemed` PILL WENT WITH THE ROWS IT EXPLAINED.** It was the right
answer while `/holdings` was the one page that still listed them; a branch that
can never fire, wearing a confident explanation, is the dead-code-that-looks-alive
failure. `check:pages` INVERTS rather than being deleted with it — and it is
struck on `data-hb-key` rather than on the security NAME appearing in the page
text, because a name is clipped, wrapped and re-cased by the table it sits in
while the key is what the row IS.

#### The paragraph audit, and how it was reconciled with main's

Both branches audited the same grey paragraph claim by claim — the Stage 10aa /
10ai pattern — and reached DIFFERENT answers, which is exactly the case where a
merge must pick one rather than ship both readings of one screen:

- **main moved the load-bearing half into a collapsed `<details>`** and the
  derived fence up onto the two column headers. **That is what stands**, and it
  is the better answer: a fold is one click and is visible to a reader who never
  hovers, and its SUMMARY carries the loading and unreachable states, which a
  reader must not have to open anything to learn.
- **this branch moved the same facts into the footer cells' own hovers.** The
  partition hover on the `Total exposure` cell and the weight basis on the
  `Weight` footer both survive the merge, because main ships them too — a claim
  about a column belongs on the column, and the fold is where the five buckets
  are set out at length.

Two things this branch contributed to that audit stand on their own:

**AND THAT WEIGHT HOVER WAS WRONG.** On this axis every Weight cell divides TOTAL
EXPOSURE by the book, and the hover explained the printed percentage using the
MEASURED half alone — a figure a reader could not reproduce from the two numbers
they were given. It is the cell's own numerator now.

**`nonEquityValue` BECAME `unaccountedValue`, BECAUSE THE NAME STOPPED BEING
TRUE.** The debt sleeve is INSIDE the derived total now, so the remainder is what
no line in the filing accounted for — a scheme's cash, a metal ETF's metal, the
disclosure's own rounding. **A FIELD that misdescribes its own figure is the
caption failure one layer down, where every caller inherits it.** The fold and
the hover both say so, and the derived figure the partition is struck against
moved ₹77.6 Cr → **₹90.56 Cr** with the remainder falling ₹45.7 Cr → ₹32.73 Cr.

#### Sixteen bugs reintroduced, and FOUR of them were defects in the checks

- **The first attempt at the issuer bug changed nothing**, because the keying
  pass writes `issuerSeen`'s answer into `isinSeen` and the accumulation loop
  reads that first. The mutation had to move to the keying pass to isolate it —
  which is the whole point of doing this rather than reasoning about it.
- **Three checks ABSTAINED where the fact had been DELETED.** Restoring the
  `assetClass === "Equity"` gate removes the look-through card, and all three of
  its invariants reported NOT CHECKED over a **clean sweep**; deleting the
  partition from the footer hover did the same to three more. A missing panel and
  an absent hover are the defect, not a reason to abstain — `golden.mjs`'s rule,
  arriving twice in one pass.
- **Private Market had no invariant on WHICH funds it draws**, so the redeemed
  fund's ₹0 rows came back to a clean sweep. Every cell of such a row is correct
  and it adds nothing to any total, so no value check on that page can see it;
  the rows carry `data-pm-fund` now.
- **And one check had silently stopped biting.** `stock-mf-lookthrough`'s
  reconciliation matched a row shape of `name → one column → weight`, and the
  table gained a `Class` column when the store stopped being equity-only. It
  abstained on a page rendering perfectly. Anchored on the two adjacent cells it
  is actually about now.

The twelve that fired first time: the one-line-per-fund rule, the issuer tier,
the equity-only gate, the derived row's missing expansion, the pick-list dropping
fund-only names, closed positions back on `/holdings` and on Morning CIO, the
paragraph restored, the partition deleted, the weight hover's numerator, the
EQUITY ONLY sentence, a truncated breakdown, a debt line filed as equity, the
derived half summed into the measured column, and the look-through column on a
different basis.

**THE WALKED NAME IS DERIVED, NEVER TYPED.** `FUND_INSTRUMENTS` picks the issuer
ONE fund holds through the most separate instruments — the worst case by
construction, since a build that kept the old rule reports a twelfth of it — and
the next drop picks its own. The pick-list grew `data-multiselect` /
`data-option` and `/holdings` grew `data-hb-key`, because a claim about which
holdings a page draws must not be struck on prose a redesign is free to reword.

`build` · `tsc` · `test:ingest` 140 + 35 · `test:family` (10 new, anchored on the
committed store rather than on a fixture) · `check:family` 57/0 · `check:pages`
**148 combinations clean**, with the same two pre-existing abstentions —
MEASURED ON THE MERGED TREE, which is the only base any of these counts is a
fact about. Stages 10aq and 10ar each state 146 and this branch's own pre-merge
run stated 146 too; all three were struck against different bases and cannot be
reconciled by arithmetic, which is the point of re-running the sweep rather than
adding to a number. `npm run build-book` and `npm run build-lookthrough` are both
no-ops against the committed tree, which is what says the files on disk are what
the builders would write.

### Stage 10at — THE SECTORS ARE LOOKED UP, AND THE DONUT STOPS RUNNING OVER ITS OWN RING

Three asks on Sector Composition, sent with two screenshots of the page — the
Consolidated and Direct Equity views, with the grey explainer blocks highlighted:

*"fix the pie chart and text ui overlap."* · *"replace the highlighted explainer
texts with short and direct language explanation in legible font size. And it
has to be very short and direct, so it doesn't look cluttered."* · *"majority of
the classification of the securities is in the unclassified section, look up all
the holding securities sector classification on the screener.in website or any
other website and show them in their appropriate sector classification."*

The third is the one with the work in it, and it is the first time this book has
been asked to take a figure from **a source outside the family's own paperwork**.

#### 1. The Unclassified wedge was a MISSING MAP, not a missing document

Measured before a line was written, which is what says this was solvable at all:

| | Unclassified was | is now |
| --- | ---: | ---: |
| **Direct Equity** — 37 shares the family bought themselves | **100%** · one grey wedge over ₹94.9 Cr, 1 sector drawn | **13.2%** · ₹12.6 Cr, **9 sectors** |
| **Consolidated** — 565 companies, ₹299.6 Cr | **58.4%** · ₹129.7 Cr | **5.1%** · ₹15.4 Cr, **12 sectors** |

**NOT ONE own-account company share carries a sector, and that is a fact about
the DOCUMENT.** A depository statement prints an ISIN, a quantity and a rate and
**no industry at all** — so no drop of the current statements would ever fill
that column, and Stage 10aq's own note beside `directWithBookSector` says so.
The answer had to come from an identifier, and this book already resolves one:
`build-symbols` maps `securityKey` → the NSE trading symbol NSE itself issues.

**SO IT IS A LOOKUP, NEVER A JUDGEMENT — and that distinction is the whole of
why this is allowed.** A model assigning sectors from memory is
`VAL_METHODS[i % 5]` with better prose: a wedge on a donut carries no
provenance, so a fabricated classification is indistinguishable on screen from a
filed one, and sorting the table would change which company is a bank.
`scripts/build-screener-sectors.mjs` **fetches** each company's page, **proves**
it is that company, and **commits** what somebody else published.

#### `npm run build-sectors` — and four rules, each a wrong answer avoided

```
src/data/nseSymbols.json   securityKey → NSE symbol (build-symbols, ISIN-first)
   |  npm run build-sectors     fetch → guard → resolve → commit
   v
src/data/screenerSectors.json   symbol → { gics, screener's own words, joinedBy }
docs/SCREENER-SECTORS.md        what placed, what disagreed, what carries no symbol
```

**A PAGE MUST PROVE IT IS THE COMPANY IT WAS ASKED FOR.** A wrong symbol returns
a **complete, correct, well-formed** classification belonging to somebody else,
which is the worst fabrication available here because there is nothing on screen
to catch it by — and this repo has already measured that resolver being wrong
about a quarter of the time on a different vendor (Stage 10e: Aditya Birla
Capital → Tata Capital, Bajaj Auto → Bajaj Finance). So each page must **echo
the symbol back** (`NSE: <SYMBOL>`), and where it prints none — the SME listings
do not — its own H1 must agree with the book's name through this repo's
`securityKeyOf(stripDepositoryTail(...))`. **Neither, and the page is refused.**
Which guard let each entry through rides in the store as `joinedBy`, and the
suite asserts there is no third form: 156 of 160 by symbol, 4 by name.

**THE GICS ANSWER IS `shared/sectors.mjs`'s, NOT THE SCRIPT'S.** The script
stores screener's own label AND the GICS one, and the suite requires the second
to be exactly `resolveSector(the first)` — so the vendor tier extends the ONE
committed provider-label table rather than growing a second one. Two tables are
two chances for a company to sit under two headings on two screens, which is the
failure `holdingBucket`, `costCoversSet` and `companyExposure` were each
extracted for. Three screener labels are mapped (`Metals & Mining` → Materials,
`Oil, Gas & Consumable Fuels` → Energy, `Media, Entertainment & Publication` →
Communication Services) plus the eleven GICS names that are their own answer.

**THE MAP EXTENSION MOVED THE BOOK BY EXACTLY ONE POSITION**, which is the check
that says this was a map extension rather than a re-measurement: SASKEN
COMMUNICATION TECHNOLOGIES, ₹0.02 Cr, Unclassified → Information Technology, on
the `Telecom - Equipment & Accessories` entry that already existed. `BOOK_SUMMARY`
is byte-identical and `build-book` regenerates the whole file byte-identically.

**AND IT IS THE WEAKEST TIER, SO IT RUNS LAST AND ONLY EVER FILLS AN EMPTY
SECTOR.** `CompanyExposure.sectorFrom` is `book | disclosure | vendor | null`,
strongest first — the family's own statement, then a fund's SEBI filing joined on
the ISIN, then this. **Measured on the 84 companies where the book and the vendor
BOTH have an answer, they agree on 80 (95.2%)**; the four that differ are genuine
taxonomy judgements (GICS files a cinema under Communication Services, several
Indian IT-enabled providers under Industrials) and **the STATEMENT keeps its
answer on every one of them**. `docs/SCREENER-SECTORS.md` names all four, so any
one can be challenged.

#### What it still cannot place is NAMED, at its value, with the reason

Ten book companies resolve no NSE symbol and are not looked up. **The residual is
NOT the size the count suggests, which is exactly why the value has to be
printed beside it**: ₹12.5 Cr of the Consolidated view's ₹15.4 Cr — **81.6%** —
is ONE company, YASH HIGHVOLTAGE, a BSE-only SME **NSE does not list at all**.
No lookup keyed on an NSE symbol will ever reach it. The next four (Cosmo Films,
CreditAccess Grameen, Punjab Chem, Krishca) are the *"handful of listed COMPANIES
a PMS statement names without an ISIN"* this file already records as needing a
hand-checked `OVERRIDES` entry, and everything below them is a fund-disclosed
line worth lakhs.

**SCREENER'S OWN SEARCH FINDS SOME OF THEM BY NAME, AND THAT IS REFUSED.** Its
pages print no ISIN, so a name would be the only thing joining them and nothing
would corroborate it — `shared/nameMatch.mjs`'s rule, where a token-overlap tier
matched `KIRANAKART TECHNOLOGIES` to `TATA TECHNOLOGIES`. **There is still no
fuzzy tier.** They are listed in `docs/SCREENER-SECTORS.md` for a human to commit.

#### 2. The hole was three stacked lines inside a 112px circle

*"fix the pie chart and text ui overlap."* Reproduced rather than guessed at: the
donut hole carried a label, the total, the row count AND the sector provenance,
at 10.5px, inside an `innerRadius={56}` ring — so `OTAL EXPOSURE` clipped under
the ring and the lower lines ran over the wedges, which is what the screenshot
showed.

**THE FIRST GEOMETRY TEST WAS THE WRONG TEST**, and it passed a broken layout:
it measured the corner distance from the centre, which is far looser than the
real constraint. **A circle constrains a line of text by its CHORD at that line's
own height**, and a wide short line high in the hole has far less room than the
corner test allows. Re-measured on chords: `innerRadius` 56 → **66**,
`outerRadius` 96 → **98**, `!tracking-normal` on the label, and the two lower
lines OUT of the hole entirely — tightest slack **13.1px** on Consolidated and
18.1px on Direct Equity, confirmed by screenshot.

***THE DONUT IS THE LEFT HALF OF THE PAGE SINCE Stage 10bt***, drawn at 236px
with a 70px inner radius, so the hole's three lines — label, total, count — sit
with room to spare. The chord rule above is still the test a future change to its
size must pass; the provenance line is the foot of the left half.

**THE TWO LINES THAT LEFT THE HOLE DID NOT LEAVE THE PAGE.** A figure a reader
acts on does not go away to fix a layout; it moves somewhere with room. The count
stays in the hole as one legible line, and the sector provenance became a line of
its own under the chart — **which made it better, not merely relocated**: it now
carries all three tiers with a count each, plus the unplaced count AND ITS VALUE.

#### 3. Six explainer blocks, each cut to one short line at a legible size

*"very short and direct, so it doesn't look cluttered."* They were `text-[11px]
text-slate-500` — small, grey and three or four lines each. They are `text-xs
leading-snug text-slate-400` now, **one line each**, and every one was audited
against the rest of the page before a word was cut, the Stage 10aa / 10ai / 10ap
method. What survives is what a reader ACTS on:

- the DERIVED fence — *"DERIVED, not a position … **No part of the book's NAV.**"*
  in words rather than a tooltip, which is a rule of this file;
- the three-way partition's closing claim, *"These three figures cover every
  rupee"*, because a table's total reads as the whole of a reader's money;
- and on Direct Equity, where the shares it leaves out are shown.

#### The checks moved off the prose, and two of them could not have failed

Six invariants read the removed paragraphs out of `innerText` and would have
retired themselves in silence — a regex that matches nothing yields an empty
result that passes `.every()`. They read **`data-donut-count`**,
**`data-donut-basis`** and **`data-sector-source`** (with `data-from-book` /
`-disclosure` / `-vendor`, `data-unplaced` and `data-unplaced-mv`) now: the
contract `data-section`, `data-mandate` and `data-row` already carry, and the same
rule — *a structural claim must not depend on prose a redesign is free to reword*.

**THE THREE PROVENANCE CHECKS ARE A FACTORY, RUN BY BOTH VIEWS, AND THE SECOND
VIEW IS WHY.** They were written for `sectors` alone, and unwiring the vendor
tier — the single most damaging regression this change can have — left
`sectors-direct` **GREEN**: its "draws sectors rather than one Unclassified
wedge" check is satisfied by the disclosure tier's 11 placements, while the 22
the vendor tier places, on the very view the family complained about, vanished
unnoticed. `sectorSourceChecks(bookCount)` is parameterised on the one thing that
differs between the views — how many companies the BOOK itself places, 85 against
**0** — so both now run all three, and both fire.

**AND THE PARTITION CHECK IS WHAT KEEPS AN ABSTENTION FROM STANDING ALONE.**
Dropping the unplaced residual makes *"the companies it could not place are
named"* report NOT CHECKED — correctly, since on that build nothing is unplaced —
and a suite that abstained there and nowhere else would read CLEAN over a page
that had silently lost its residual. The four sources must rebuild the donut's
own count, so that bug is a FAILURE on both views with the abstention beside it.

**TEN BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: the vendor tier unwired
(2), the vendor tier overruling a statement (2 — it moves companies out of `book`
and the exact count catches it), the donut's count handle deleted (5, across both
views), its counted-once hover deleted, a company counted by two tiers, the
unplaced residual dropped (2 + 2 abstentions), the residual keeping its count and
losing its value (2), the left-out card no longer saying where those shares are
shown, a stored GICS the committed map does not produce, a page accepted with no
round-trip guard, and the book and the vendor disagreeing wholesale.

**AND ONE OF THE SIX REPOINTINGS FAILED A CORRECT PAGE FOR A REASON THIS FILE
ALREADY RECORDS.** `label-xs` is `uppercase` and `innerText` returns the
TRANSFORMED text, so the left-out card renders `LEFT OUT BY THIS VIEW` while the
source says "Left out by this view" — and `sliceBetween` is a plain `indexOf`.
The same trap as "Listed NAV" three stages up, arriving through a slice instead
of a match.

**AND A FAILED PATCH THAT WRITES NOTHING IS WORSE THAN A FAILED PATCH.** The
first attempt at these six repointings ran as one script with `open(p,"w")` at
the end, asserted on the third substitution, and **discarded the two that had
succeeded** — so the file was untouched and the failure named only the third.
Each is applied one substitution per invocation now, and the bug harness restores
**and rebuilds** on a `trap … EXIT`: restoring the source alone leaves `dist/` at
the bugged build, and the next sweep reads it and reports the previous bug's
failures under the next one's name. Measured once in this session.

#### Merged with main THREE TIMES, and the union was the only safe resolution each time

This branch was open while **three** PRs landed on main, and two of them wrote a
stage section of their own — the 10aj/10al letter collision this file already
records, arriving twice more in one branch. Main's merged section keeps the
letter each time: 10ar went to the NAV attribution work, 10as to the
look-through pass, and this is **10at**, with the one cross-reference that points
here moved along with it.

**THE DANGEROUS CONFLICT WAS ONE LINE, IT WAS NOT IN THE PROSE, AND IT CAME BACK
EVERY TIME.** `check-pages.mjs` hands its invariants ONE ctx literal, so every
branch that adds a probe adds a key to that line — mine `donut` and
`sectorSource`, 10ar's `attrib`, 10as's `pmFunds` — and git presents them as a
single conflicting line on every merge. **Taking either side whole is a
clean-looking sweep that has stopped checking**, and both directions were
measured by reintroducing exactly that:

- dropping **`attrib`** turns 9 of that stage's invariants into **NOT CHECKED**,
  and the run still reports every combination CLEAN, because an abstention is
  counted apart from a failure;
- dropping **`pmFunds`** FAILS, by name, on `private-market`.

**Only one of those two would ever have been caught**, which is the whole reason
the resolution is a mechanical union rather than a judgement about which side
looks more important. It is this repo's own most-repeated defect — a field
carrying the right answer into no caller — arriving through a merge resolution
rather than through code, and the ctx line should be expected to conflict on
every future parallel branch.

**AND THE GENERATED FILES WERE NOT TRUSTED TO A TEXT MERGE.** `glowData.ts` and
`docs/BOOK-REPORT.md` auto-merged without conflicting, which is precisely when a
generated file is most dangerous: a textual splice of two generated regions can
produce something the generator would never write, and `glowData.ts` is the file
this repo's §7 forbids hand-editing. Both were REGENERATED from the archive and
compared against the merge result — byte-identical, so the merge is what
`build-book` writes rather than merely what git produced.

`src/lib/__tests__/screenerSectors.test.ts` carries the arithmetic
(`npm run test:family`), anchored on **two generated artefacts** — `glowData.ts`
and the committed store — so every expectation is derived from both on the run or
written as a relation that survives either moving. Its load-bearing gate is an
INEQUALITY: the tier must place company shares no statement placed (84 of 84 that
resolve a symbol), or a store wired to a book it no longer matches would satisfy
every structural check while placing nothing.

`build` · `tsc` · `test:ingest` 140 + 35 · `test:family` (this stage's suite
beside 10ar's and 10as's) · `check:family` **57/0** · `check:pages`
**148 combinations clean**, with the same two pre-existing abstentions.
`build-book` is a no-op against the committed tree, which is what says the book
on disk is what the builder would write.

**EVERY ONE OF THOSE WAS RE-RUN ON THE FINAL MERGED TREE**, not carried across
from this branch's own base — the discipline Stage 10aq's closing paragraph
records. This branch's own pre-merge runs stated 146 twice and the answer is
**148** here; 10aq, 10ar and 10as each state their own figure. All of them were
struck against different bases and none can be reconciled with another by
arithmetic, which is exactly why the sweep is re-run rather than the number
adjusted.

### Stage 10au — THE MOVERS OPEN ON THE PERCENTAGE, AND A DEFAULT IS ASSERTED OR IT MOVES

*"keep % wise as the default view and ₹ wise absolute as the second toggle
option."*

Today's movers has ranked by rupee impact since Stage 10p built it, and the
family have now settled it the other way. `TodaysMovers`'s `rank` state opens on
`pct` and the two buttons are offered in that order.

**BOTH MEASURES STAY, BECAUSE NEITHER SUBSUMES THE OTHER.** That was the reason
the toggle existed at all and it is unchanged: *a 9% move on a ₹40 L holding is
the larger mover by one measure and the smaller by the other.* What moved is
which question the card answers before anyone touches it.

**AND NOT ONE FIGURE ON THE CARD CHANGES.** The day's move, its denominator, the
coverage line, the gainer and loser counts, the index comparison and the excluded
footer are all struck over the same set on either ranking — the sort reorders one
list of five and reorders nothing else. The two ranked columns already keyed
their emphasis off `rank`, so the bold column followed the default with no edit.

**WHICH IS EXACTLY WHY IT NEEDED A CHECK, AND HAD NONE.** A default is the change
that moves silently: the page renders perfectly either way, every value check on
this card passes either way, and the only difference is the ORDER of two
five-row lists. `check:pages` asserts the allocation card's default axis for that
reason (Stage 10z, Stage 10ad) and had no equivalent here — so the ranking could
have been flipped back by an unrelated edit and the sweep would have reported
clean.

**STRUCK ON `data-mover-rank`, NEVER ON THE LABELS.** "By % move" and "By ₹
impact" are precisely the prose a redesign is free to reword, and this file has
recorded a check retiring itself in silence that way more than once. The probe
reads which measures the control OFFERS, in order, and which is live; the
invariant makes three claims, and the middle one is the family's ask: both are
still offered, the live one is the percentage, and the percentage is offered
first.

**A MISSING CONTROL IS A FINDING, NOT AN ABSTENTION.** This card's header renders
whether or not a quote has landed, so an empty offer means the control is gone —
and a sweep that abstained there would report CLEAN over a card with no toggle at
all. Only the probe failing to run abstains. Verified rather than assumed:
deleting the handle FAILS the invariant by name rather than adding a NOT CHECKED
line.

Three bugs reintroduced, each firing it: the default back to `impact`, the button
order back to impact-first *with the default left correct* (which a check on the
active button alone would have passed), and the control removed outright.

### Stage 10av — CASH IS CASH, AND WHEN BESIDE HOW MUCH

Four asks. The first turned out to be a measurable inconsistency rather than a
matter of taste, and the third had been answered on one surface under a heading
nobody reads as an answer.

#### 1. *"why should an ETF show here? … Cash is liquid, arbitrage. All of it is cash."*

*"please look at the mapping because as of now, it looks all over the place to
me."* **IT WAS, AND THE BOOK'S OWN ROWS SAY SO.** One security reached this book
under two different asset classes, and the family's own example is the one it
happened to:

```
NIP ETNF1D RTLIQBEES (Nippon Liquid BeES)  ETF          3 Motilal demats   ₹1.1764 Cr
                     …the same security    Mutual Fund  LKP broking        ₹0.0017 Cr
ABSL / ICICI / HDFC Liquid                 Mutual Fund  depository          ₹12.89 Cr
Axis Liquid                                Cash         inside a PMS        ₹0.0013 Cr
```

Nothing is misread. `assetClass` is what the ISSUING DOCUMENT called it (§5), and
four documents called one kind of instrument three different things — a
depository types every scheme `Mutual Fund`, a PMS statement's own section
heading types its sweep `Cash`.

**SO THE FIX IS ON THE BUCKET AND NOT ON `assetClass`.** The archive goes on
describing the statements, `assertNormalized` still rejects a document that says
otherwise, and `glowData.ts` still regenerates byte-identically — verified as a
control run. What changed is the CATEGORY AXIS, which is the one that answers
*how much of this book is cash*. Same seam `MANDATE_BUCKET` already uses, where
an account's engagement overrides the class of every row in it.

**AND IT WAS NOT COSTING A LABEL.** On the deduped current-holdings set the Cash
row read **₹0.0000 Cr** — every real rupee either inside a mandate or filed under
Mutual Fund and ETF. The family were being shown a book with no cash in it while
holding ₹14.07 Cr of liquid funds and liquid ETFs. After: Mutual Fund ₹99.90 →
₹87.01 Cr, ETF ₹24.56 → ₹23.38 Cr, Cash ₹0 → **₹14.07 Cr**, and the footer does
not move by a rupee, which is the check that says this is a regrouping.

**ORDER IS THE WHOLE OF IT: CASH AFTER THE MANDATE.** Both Axis Liquid rows sit
inside a Green Lantern PMS, and a mandate is worth what its own statement says.
Lifting its sleeve out would leave that row unable to tie to its document — the
identical reason the ordinary cash sleeve is not lifted either.

**A COMMITTED LIST, CITED PER ENTRY, AND DELIBERATELY NOT A NAME MATCHER.**
`CASH_EQUIVALENT_KEYS` in `analytics.ts` names the review row that files each
under Cash — the same standing `familyTaxonomy.ts` gives its `reviewProduct`,
and the same three-witness workbook. Axis Liquid is listed although the rule can
never fire on it, because a set called "the cash equivalents in this book" that
omitted a liquid fund BECAUSE one document typed it correctly cannot be checked
against the review at all.

***BOTH HALVES OF THE NEXT PARAGRAPH HAVE SINCE CHANGED — see Stage 10ce.***
Three arbitrage funds ARE held — as a depository's closing balances on Ajay's
transaction-only demat, which is why no search over POSITIONS found one — and
the map carries them now, valued at AMFI's NAV on the live basis. The paragraph
stays in the order it was learnt, because "searched over every position" was a
true measurement of the wrong set.

**ARBITRAGE IS IN THE RULE AND NOT IN THE BOOK, WHICH IS TWO FACTS.** The
family's review carries ₹41.08 Cr of it across four funds, the largest ₹30.99 Cr
— and **not one is in this book**, searched over every position. So the map has
no arbitrage entry and the screen shows none; saying "arbitrage now shows in
cash" would be a claim about a row that does not exist. It is also the ONE place
this departs from their workbook, which lists all four on its DEBT sheet — and
that stays true on the family's own asset-class axis. The workbook was already
half of this way: it codes every one of the four basket `Liquid`.

**AND THE HALF THAT GOES STALE IS THE LINE THAT SPEAKS UP.**
`cashEquivalentCandidates` reads NAMES — the one place a name rule is allowed
here, because it decides nothing and moves no money — and `familyTaxonomy.test.ts`
FAILS on the first drop bringing a liquid or arbitrage fund the map does not
carry, naming it. Verified by dropping a key: it reports the offender and says to
commit it with a citation.

#### 2. *"Where will I get to see that there were two contributions?"*

*"amount invested is fine. But if I further want to see — because XIRR will
change depending on the investment amount and the time, XIRR will change. It is
not showing that. So need to show transaction wise."*

**THE RECORD EXISTED AND THE MANDATE PAGE DID NOT READ IT.** `BOOK_CAPITAL_MOVES`
has carried every dated contribution since Stage 10ag and the Transactions card
has shown them per account — but a reader who opens a mandate from Holdings, from
Family & Entities or from a company page never passes through that card.
`CapitalIn` in `MandateHoldings.tsx` renders them, and it calls **`capitalRollup`,
the same function with the same arguments**, differing only in scope. A second
implementation would be a second answer to what the family put into this mandate,
and the tile above and the tab one click away are precisely the pair where that
disagreement is visible.

**IT IS ON BOTH BRANCHES, AND THE FUND ONE IS THE LARGER HALF.** The DEALING card
came off the fund branch at Stage 10ai because a folio reports no trading record.
The CONTRIBUTION record is the opposite case: measured, **EIGHT of this book's
eleven dated capital records belong to accounts that reach that branch** — the
five Sanshi folios, both Transition Venture trusts and 3P — against three on the
mandate branch. Leaving it off would have answered the smaller half of the ask.

**AND THE RETURN BENEATH IT SAYS WHAT KIND OF RETURN IT IS.** A holding-period
return on what was paid in is NOT annualised and NOT money-weighted, and the card
says so — because the family's own reason for asking is that a rate depends on
when each payment landed, and a figure that read as one would answer them wrongly
in exactly the direction they were worried about.

#### 3. *"you've given me the amount, but you've not given me the date"*

Three surfaces, and the first was already there:

- **`What I invested`'s "Period" column became "Invested on".** The dates were
  already in that cell. "Period" is not a word a reader scanning for WHEN THEY
  INVESTED reads as an answer, so the column was on the page and the question it
  answers was not on the column. The MANAGER rollup's own Period column became
  **"Traded between"** and deliberately not this: it is the manager's dealing
  window, and one label over both would put a manager's first trade under a
  heading a reader takes for the date they subscribed.
- **The mandate page's Invested tile says when**, from the account's own first
  dated contribution (11 of 51 accounts) or failing that the statement's printed
  inception date (12 of 51) — labelled as which, because they are different
  facts. Neither is attached to the cost figure as though the two were one
  measurement: that tile is the mandate's COST BASIS and the manager has been
  trading inside the account since.
- **A new "Invested on" column on the holdings table, immediately right of
  Invested**, which is where they asked for it and the one position that shifts
  every column after it.

**IT IS A SEPARATE FIELD FROM `heldSince` AND THEY MUST NOT BE MERGED.**
`heldSince` is what LICENSES ANNUALISATION and is emitted only where a lot
register accounts for every unit held. `investedOn` feeds no return, which is
what lets it take a second source `heldSince` cannot: the position's own dated
allotments. That record routinely carries SEVERAL payments — Sanshi 9069671554
was funded four times — and folding it into `heldSince` would compound all four
from the first, overstating the rate by everything the later money did not earn.

**10 of 371 POSITIONS CARRY ONE — AND THEY ARE ₹208 Cr of ₹714 Cr**, 29% of the
money, because the dated ones are the large AIF folios. The footer COUNTS the
coverage rather than printing an aggregate: a "first invested" over rows most of
which carry no date would be the first of the dated subset.

**AN ACCOUNT-LEVEL DATE IS DELIBERATELY NOT A THIRD TIER** — that is when the
family funded the ACCOUNT, not when a manager bought the share a row is about.
See the bug-reintroduction note below: on this book that rule is unreachable, so
it is written down beside the code rather than left to be inferred.

#### 4. *"What is tape? … Let's think of something better. Friendly words."*

"Tape" is a trading-desk word for the printed record of every execution —
precise, and jargon. "My investments" was worse than jargon: it was ambiguous in
the one way that matters, because the whole point of that tab group is the split
between WHAT THE FAMILY DID and WHAT THEIR MANAGERS DID, and it could honestly
mean either.

| was | now |
| --- | --- |
| My investments | **What I invested** |
| Direct Equity | **Direct Equity** — unchanged |
| By manager | **Manager trades** |
| By entity | **Trades by member** |
| Tape | **Full trade list** |

***THE WHOLE STRIP HAS SINCE BEEN REMOVED — see Stage 10bg.*** Renaming it was
the right answer to the question asked here (*"when you have a label, what does
it stand for?"*) and it did not survive the next one: the family read the strip
beside the Holdings table's own Category / Asset class / Basket control and asked
why the two screens categorise differently. Better words on five tabs could not
fix that, because the five were never five of anything — two SOURCES, three
GROUPINGS and a raw list. The entry stays because the LESSON is about labels
rather than about that control, and because "Direct Equity is not renamed" is
still live: it is a section heading on that table now, spelled exactly the same.

**"DIRECT EQUITY" IS NOT RENAMED, AND THAT IS THE DECISION HERE.** The family
asked for that exact word on that exact tab — *"Replace by security with direct
equity, that will contain the transaction of all direct buy and sold equity
transactions"* — and it is the word this app's holdings tables use for the same
set. Changing it would be a fourth round of the argument Stage 10L settled,
running backwards. The cryptic column labels went with them: `How` → **How it
went in**, `As` → **Type**, `In`/`Out` → **Paid in**/**Taken out**, `Into` →
**Security bought**.

#### Eleven bugs reintroduced, and three of them were defects in the checks

- **A CHECK THAT COULD NOT FAIL, FOUND BY THE BUG IT EXISTS FOR.** *"a liquid
  sleeve inside a mandate stays with the mandate"* was written on the monitor.
  Moving the cash rule ABOVE the mandate check — exactly the ordering error it
  guards — left the sweep **CLEAN**, because that page partitions mandates on the
  ACCOUNT's engagement rather than on `holdingBucket`, so those rows never reach
  the table either way. It is GONE rather than left looking like cover, and the
  claim is asserted where the decision is made: `familyTaxonomy.test.ts` §10(c)
  calls `holdingBucket` directly and fails on that reordering by name.
- **TWO FOOTER CHECKS WERE COUNTING TOKENS.** *"the class subtotals reconstruct
  the footer total"* and *"by-security total counts each dedupeGroup once"* walked
  the footer's TEXT — an invested figure, `\S*` for whatever one cell sat between,
  then the market value. That held only while exactly one token stood there, and
  "Invested on" broke both against a page that was correct. Widening the skip
  would have been worse than the bug: a `.*?` between two money columns marches
  straight past one. They read `ctx.footerCells` by `COL` now, which is
  accumulated by `colSpan` — `lib/table.mjs`'s own rule arriving in the sweep.
- **AND ONE WAS SHAPED BY ITS OWN FIXTURE.** The movers card's excluded-bucket
  check required an "ETF" line BY NAME. The single priced ETF row was Liquid BeES;
  when it correctly moved to Cash the line correctly disappeared, and a correct
  page failed. It is anchored on the book now — the entries must account for every
  priced holding the scope excludes, and for its whole value — which needed the
  fixture's own `QUOTE_FACTOR`, because the card sums LIVE market value and a sum
  off `glowData.ts` alone runs exactly 1.10 light (₹126.06 Cr against a correctly
  rendered ₹138.8 Cr).

**AND ONE BUG IS UNREACHABLE ON THIS BOOK, SO IT IS WRITTEN DOWN.** Adding the
account's first contribution as a third tier for `investedOn` changed nothing the
sweep could see: measured, every position in a funded account is already in a PMS
(125, rolled into a mandate row), already own-dated (7) or closed and not drawn
(3), and **ZERO would newly borrow one**. The guard that covers it was verified
against a borrowed CONSTANT instead, and the rule is stated beside
`investedOnOf` rather than left to be inferred from the absence of a test.

The eight that fired first time: the cash rule removed (2 checks), the Cash
section's provenance note deleted, the column never dated, an undated holding
borrowing a date, the tabs back to Tape/My investments, the contribution card off
the fund branch, its table truncated (2), and the Invested tile's date removed.
In the arithmetic suite: a key dropped from the map (the detector names it), a key
matching no holding, and the rule never firing (2, including the load-bearing
`Cash ₹0.00 Cr → ₹0.00 Cr`). And the checker's column maps left at their old
indices fire **13 invariants across two routes**, which is what says the insert
was properly accounted for.

`build` · `tsc` · `test:ingest` 140 + 84 + 35 + 31 · `test:family` ·
`check:family` **57/0** · `check:pages` **150 combinations clean** — 148 plus the
new `mandate-funded` route — with the same two pre-existing abstentions.
`npm run build-book` regenerates the book BYTE-IDENTICALLY, run as a control
before and after: nothing here touches the ingest, and a presentation-layer
change that moved a generated figure would not be one.

### Stage 10aw — A DAILY NAV IS A SECOND SOURCE, AND THE AIF DRILL-DOWN IS CLUBBED

Three asks. The first needed a feed this dashboard already had and had never
read for this; the other two needed a fact the statements print and nothing had
ever looked at.

#### 1. *"wherever there is a daily NAV available … can we capture that?"*

> *"this is covering for stocks which is fine. बाकी AIF में तुम monthly NAV आएगा
> and mutual funds — there will be whatever. But can I not have — see if I have
> some money in ETF? Or if mutual funds also have a daily NAV? So wherever there
> is a daily NAV available and if there is a drastic moment in the line item for
> some reason, can we capture that? … Because a silver ETF can have a drastic
> moment ऊपर नीचे. A momentum fund or a momentum ETF can have very drastic
> moments on rebalancing days."*

**"THIS IS COVERING FOR STOCKS WHICH IS FINE" IS A BLESSING, NOT A COMPLAINT.**
Today's movers stays exactly as Stage 10t narrowed it and Stage 10al settled it
— `DIRECT_EQUITY_BUCKET`, no scope tabs, ranked by % — and what is added sits
beside it. Reading this as "widen that card" would have put back the selectors
the family removed one round earlier.

***THE TWO CARDS SIT BEHIND ONE TOGGLE SINCE Stage 10bb, and nothing below
changed.*** The family asked for the second card to stop standing beside the
first; it is the other branch of a control now. Every reason this section gives
for keeping them APART — different prices, different days, never added — is why
they are still two components rather than one model with a scope field.

**THE QUOTE FEED CANNOT ANSWER IT, AND THE FAMILY'S OWN EXAMPLE IS THE PROOF.**
Every live endpoint is keyed on an NSE trading symbol. Measured over this book's
6 ETF and 22 mutual-fund rows, **exactly one resolves a symbol** (LIQUIDBEES) —
and **the DSP silver and gold ETFs resolve none**, because NSE has moved them to
ISINs the statements do not carry (a fact `build-symbols` already records). So
the one instrument the family named is precisely the one no amount of work on
the quote feed would ever reach.

**THE ANSWER WAS ALREADY COMMITTED.** `public/lookthrough/` has carried each
scheme's NAV, its previous NAV, both dates and the move between them since
Stage 10s — 21 of this book's 22 schemes, the DSP ETFs among them. Nothing read
it for this. `src/lib/navMovers.ts` and `src/components/NavMovers.tsx` are the
card; measured on the committed store:

| | |
| --- | ---: |
| Schemes with a published move | **16**, behind 17 names |
| Covered / in scope | **₹110.39 Cr** of ₹110.39 Cr — the whole of it |
| The covered set's own move | **−0.1364%**, −₹15.06 L |
| Not priced, and named | **none** — see below |
| NAV dates the rows span | 2026-09-08 and **2026-09-09** |

**AND EVERY ONE OF THOSE FIGURES MOVED ON THE MERGE, WHICH IS THE POINT OF
RE-MEASURING RATHER THAN CARRYING THEM ACROSS.** This branch measured 18 schemes
over ₹123.28 Cr of a ₹124.46 Cr scope, with LIQUIDBEES and three sibling rows
(₹1.18 Cr) named as the part it could not price. Stage 10av landed on main while
it was open and moved a liquid fund or liquid ETF into **Cash** whatever wrapper
its statement typed it as — so those rows left this card's scope entirely, and
**the one name it could not price was exactly a liquid ETF.** The scope is now
the whole of what it covers and the not-priced list is empty, which is a better
card than the one this branch wrote and is not a figure anyone chose. The table
above is the merged measurement; the PR body and the branch commit record the
pre-merge one, and the two differing is the merge working rather than drifting.

**IT IS A SEPARATE CARD ON ITS OWN DATES, AND THAT IS THE WHOLE RULE.** A live
quote is intraday TODAY; a published NAV is a scheme's last struck NAV against
the one before it, as recent as the last `build-lookthrough`. On this book those
are a week apart. Summing a NAV move into the quote card's percentage would
print a real figure under the wrong day — the defect `/api/indices` already cost
this repo, where the level was differenced against itself and the ±0.05 residual
was the only tell. So the heading carries the newest NAV date, **never the word
"today"**, a row struck on an older day says so, and the card states in words
that the two are never added together.

**AND THE RUPEE MOVE IS NOT `units × NAV`, WHICH WAS MEASURED RATHER THAN
REASONED.** The obvious construction — value the units held at each published
NAV — is exact arithmetic on a false premise, because the units and the NAV are
not on the same base for every holding:

```
DSP GOLD ETF     1,195,000 u   book mark ₹141.24/u   published NAV ₹14.7633
DSP GOLD ETF       205,000 u   book mark ₹151.10/u   published NAV ₹14.7633
DSP SILVER ETF     123,000 u   book mark ₹276.82/u   published NAV ₹22.4561
```

That puts the family's **₹16.88 Cr gold ETF at ₹1.76 Cr** — a plausible figure,
an order of magnitude out, on the very instrument they asked about. And there is
no factor to correct by: the two gold rows are the SAME security on the SAME
as-of date and imply ratios of 9.57 and 10.24, while silver implies 12.33.

So the PERCENTAGE is the primitive — a fact about the SCHEME, needing no unit
reconciliation at all — and the rupee figure is that move applied to what the
book values the holding at. Every row then ties to its own columns: `move ÷
value` IS the printed percentage, and the aggregate is value-weighted rather
than an average of the rows (which would weight a ₹107 residual the same as a
₹42 Cr position — measured, −0.3145% against the true −0.1364%).

**THE ROW IS THE SCHEME, NOT THE `securityKey`.** A NAV is published against a
scheme, and Helios Flexi Cap reaches this book under TWO keys — the AMC folio's
`helios-flexi-cap-fund-direct-growth` and the depository's clipped
`helios-fcf-d-grow` — both resolving ISIN INF0R8701046 and therefore one NAV.
Keyed on `securityKey` the card prints one scheme's one move twice, at two
sizes, as though they were two decisions. This is a join on the identifier the
NAV is published against, not a name match: the store already resolved each key
to its schemecode on the ISIN.

**AND TWO ROWS OF ONE FUND NAME ARE NOT A DUPLICATE.** This book holds BOTH
plans of two funds — HDFC Balanced Advantage as `1273` and `1273-D`, ICICI Pru
Nifty Next 50 as `11889` and `11889-D` — each printing one scheme name and two
different NAVs, because plans differ in expense ratio and therefore in NAV, not
in what the fund owns. The row names its plan, or the card reads as a defect.

**EVERY ROW IS DRAWN, AND "DRASTIC" ONLY LABELS.** A top-N would have to choose
between two rankings that disagree at the extremes — by percentage the biggest
mover here is a ₹107 residual in an index fund, by rupees a ₹42 Cr position that
moved 0.12% — and hiding either is wrong. So all 18 are listed with their value
beside them, which makes a 0.86% move on ₹107 self-evidently trivial without
suppressing anything. The `drastic` chip is a LABEL on a row that is already
there, past a bound the card states on its face: a threshold is a judgement no
statement makes, and getting it wrong must cost a chip rather than a figure —
the standing `staggered` already has on the transactions rollup. Nothing on this
book crosses it, so the suite exercises it against a constructed move rather
than leaving it unproven.

**AN AIF IS NOT ON THIS CARD, WHICH THE FAMILY SAID FIRST** — *"AIF में monthly
NAV आएगा"*. No alternative fund publishes a daily NAV and none resolves a scheme
in the store, so their absence is a fact about the INSTRUMENT rather than a
filter, and the card says so rather than leaving ₹352 Cr unexplained.

**AND THE NAV HAD TO MOVE INTO THE INDEX.** `loadLookthrough` pulls a scheme's
own 30 KB file, which is right for a page showing ONE fund and costs **632 KB**
for a card showing twenty — on the landing page, which is the latency complaint
that card already exists to answer. `nav` now rides in `index.json` at ~120
bytes a scheme (7 KB → 11 KB), so `loadFundNavs` is one fetch.

**`npm run build-lookthrough -- --reindex` IS HOW THAT LANDED WITHOUT THE
AMFIBEAS CHECKOUT.** A full build needs a read-only clone most machines do not
have, so a change to the index projection would otherwise be unlandable —
exactly the position `securityKeyOf` was in before `rekey:archive`. It does not
have to be: every field the projection emits is read VERBATIM off a record this
store has already written to `<schemecode>.json`, so re-deriving the index from
those files is a faithful partial replay of the build, and the next full run
calls the same function on the same records and writes the same bytes. **Its
gate is the field the index already carried** — `navDate` is `nav.date` by
construction, so a replay that disagrees has joined an entry to the wrong scheme
file, and nothing is written. Measured: all 21 entries replay, every non-`nav`
byte is unchanged, and a second run is a no-op.

#### 2. and 3. The AIF drill-down, clubbed — and Private Equity beside it

> *"when you're drilling down in the AIF ना नवल, make it cat one, cat two, cat
> three … क्योंकि there are only three categories. तो आप वहीं पर drill down करने
> पर फिर उसको club कर दो कि these are cat two AIFs, these are cat three AIFs,
> this is cat one AIF."*   and   *"Similarly for Private equity also … So either
> you create one more line item here. I think that'll be better if there is PE
> funds. Just create another private equity fund line item."*

**SEBI HAS THREE CATEGORIES AND THIS BOOK DOES NOT KNOW WHICH FOR EVERY FUND.**
Those are different facts — the first is about the regulation, the second about
the paperwork in `source/` — and conflating them is how a section heading comes
to assert a classification nobody made. A heading looks exactly as authoritative
whichever rows sit under it, so a page that filed every fund under a plausible
category would render perfectly, reconcile perfectly, and be `VAL_METHODS[i % 5]`
arriving through a table.

**SO IT IS READ, AND THERE ARE TWO PLACES IT IS PRINTED** — both the statement's
own words, with the standing `providerSector` and `providerEngagement` already
have: the SECURITY NAME, which names the fund (`Sanshi Fund-I (Open Ended AIF
CAT-III)`, `BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III`, `360 ONE SPECIAL
OPPORTUNITIES FUND … (AIF CATEGORY II)`), and `Account.providerEngagement`,
which describes the account (`Category II AIF - drawdown, with a commitment and
called capital`, `Category I Alternative Investment Fund – Angel Fund`).

**NEITHER IS PREFERRED, AND WHERE BOTH SPEAK THEY MUST AGREE.** A disagreement
leaves the holding unstated rather than letting either side win silently — the
rule `build-symbols` already applies to its ISIN tier, where adding a second
identifier makes the match STRICTER rather than looser. Measured on this book:
**5 holdings print a category in both fields and 0 disagree**, reported at zero,
because a guard that only speaks when it fires is indistinguishable on a clean
run from one that was deleted.

**A PHRASE NAMING TWO CATEGORIES RESOLVES TO NEITHER.** Transition Venture
Capital's account reads **`Category I/II AIF — drawdown`**. That is the issuer
declining to commit, and picking one would be this book inventing the answer the
document withheld. The read yields both, the holding is filed as not stated, and
its wording says so — *"the statement names Category I and Category II and
commits to neither"* — because a statement naming two and a statement naming
none send a reader to different documents.

*(Corrected at Stage 10cv: "Category I/II" was the READER's phrase. Each trust's
statement prints a blank "Sebi Reg. no.-" line and no category. The holding is
still not stated, now for the true reason, and sits under Private Equity.)*

**AND `III` MUST NEVER BE READ AS `I`** — that would file ₹297.78 Cr, 84% of the
AIF book, under the wrong heading, silently. Two things prevent it, and
**reintroducing the bug proved the first draft of this paragraph credited the
wrong one**:

- **the trailing `\b` is the real guard.** Matching `I` out of `III` leaves `II`
  after it, and a word boundary between two word characters fails, so the engine
  backtracks to `III`. Measured: **with it, BOTH alternation orders read
  `CAT-III` correctly; without it, `I|II|III` reads it as `I`.**
- the alternation ordered longest-first is the BACKUP, and is what would carry
  it if the boundary were ever loosened.

Reordering the alternation alone therefore produced a clean sweep AND a clean
suite — a comment asserting an enforcement that never happens, which is a shape
this file already names. The suite now asserts all four combinations directly,
so the claim is about the PROPERTY the pattern must have rather than about the
spelling this file happens to use. The pattern is also anchored on the WORD, so
`Class A2`, `Series II` and `Founders Fund Series II — Class G1` name nothing;
all three are in this book and all three are asserted.

**PRIVATE EQUITY IS A SECTION, NOT A CATEGORY, AND THE FAMILY CHOSE THAT.** A PE
fund IS an AIF — Category I or II under SEBI — so the two overlap by
construction, and they were asked which they wanted in those terms. They chose
the separate line, so `PRIVATE_EQUITY_SECTION` takes PRECEDENCE when a holding
is filed **and the row still prints the category the statement gave it**, which
is what lets the two sit side by side without misleading: a reader adding the
category sections can see where a PE fund went.

**IT IS READ FROM THE STATEMENT TOO, AND NEVER FROM THE STRUCTURE.** "Is this a
private equity fund" is a judgement about what a manager does, and this book does
not make those. Exactly two valued holdings print the discipline in the fund's
own name — `Baring Private Equity India Fund 6` (`Category II AIF — drawdown
private equity fund`) and `Transition Venture Capital Fund I`. Nothing is
inferred from a fund being a drawdown vehicle: this book holds five, and calling
all of them private equity would file an infrastructure income fund and a
listed-equity growth fund under a discipline neither claims. There is no fuzzy
tier, for the reason `shared/nameMatch.mjs` records at length.

Measured, and the sections partition the row to the rupee:

| Section | Funds | Value |
| --- | ---: | ---: |
| Category II | 2 | ₹34.28 Cr |
| Category III | 4 | ₹297.78 Cr |
| Private Equity | 2 | ₹3.60 Cr |
| Category not stated | 3 | ₹16.69 Cr |
| **Total** | **11** | **₹352.35 Cr** |

*(Corrected at Stage 10cv. Founders prints no SEBI category — "Category II" was
its reader's words — and Neo Infra's statement prints Category II on its
manager block, which its reader dropped. The sections read Category II ₹18.1 Cr
(Delphi, declared; Neo Infra; 360 ONE), Category III ₹297.8 Cr, Private Equity
₹3.6 Cr and Category not stated ₹32.8 Cr (both Founders folios, Blue Ashva).)*

**MORNING CIO'S ALLOCATION TABLE IS UNTOUCHED.** The AIF row is still ₹352.35 Cr
and no headline figure moves, which is what makes this a clubbing of a
drill-down rather than a re-measurement of the book.

**AND CATEGORY I WOULD HAVE BEEN SILENTLY ABSENT, WHICH IS THE ONE WAY THIS
COULD MISLEAD.** The family expect all three categories. **Every Category I AIF
this family owns is an angel fund that publishes no NAV** — Sky Capital's four
folios report units and the capital drawn against a commitment and no valuation
anywhere — so they carry no valued position and can stand in no holdings table
on this site. A page clubbed by category with no Category I heading tells a
reader they hold none, which is false. So the folios that value nothing are
NAMED under the table with what they have drawn, by the same axis: **4 Category
I folios (₹4.73 Cr drawn), 5 Category II (₹13.50 Cr), 1 not stated** — the
standing rule that a figure existing for some accounts is shown for those and
the rest are named. Their money is in no total on the page, and the note says
drawn capital is what was PAID rather than what the stake is worth.

*(Corrected at Stages 10ct and 10cv: 7 folios, not 10 — Category I ×4 and
Category not stated ×3, ₹18.2 Cr drawn. India SME's statements print no SEBI
category; "Category II" was its reader's.)*

**THE SECTIONING FOLLOWS THE ROWS, NOT THE ADDRESS.** It applies only where
every row is an AIF holding, so a drill-down mixing an AIF with a mutual fund —
the whole book, the winners, the costless positions — never draws a "Category
not stated" heading over an ETF, which would be a category claim about an
instrument that has none.

#### The verification, and the three defects it found in this change

Both features are checked twice: `npm run test:family` carries the arithmetic
(`navMovers.test.ts`, `aifCategory.test.ts`, both anchored on the generated book
and the committed store rather than on fixtures), and `check:pages` walks the
rendered pages. **The sweep's expectations are RE-DERIVED in `check-pages.mjs`
by a second expression** rather than importing `navMovers.ts` or
`aifCategory.ts` — a check that calls the helper it is checking agrees with it
by construction, which is the rule this sweep already follows for
`isMandateHeld`. The two agreeing is the measurement.

**A ROUTE THAT RESOLVES NOTHING IS A FAILURE, NOT A PASS.** `holdings-aif` takes
the address Morning CIO itself drew, found by its key among the six allocation
rows — a slot number would be a literal standing for an ordering that moves with
the book. Unresolved it lands on `/holdings`'s own not-found state, which has no
console error, no overflow and no stray zero, so it would pass every generic
check while asserting nothing.

**AND THE FIRST DRAFT OF THREE INVARIANTS FAILED A PAGE THAT WAS RIGHT**, which
is worth recording because it is the same mistake in three places: they counted
STATEMENT ROWS where the table draws FUNDS. Sanshi Class E is one securityKey in
four folios and is one row — which is exactly what *"club कर दो"* asked for — so
16 positions are 11 rows. A count is only meaningful beside the noun it counts.

**AND TWO REINTRODUCED BUGS PRODUCED A COMPLETELY CLEAN SWEEP**, which is the
finding this pass exists for and the most useful thing it turned up:

- **the aggregate struck as the unweighted MEAN of the rows** — −0.3145%
  against the true −0.1364%, because it weights a ₹107 residual the same as a
  ₹42 Cr position;
- **a model that stopped SUMMING a scheme's holdings**, so every row carried its
  last statement's value alone.

Neither changes a row count, a scheme count or a date — and **every check on
that card was reading counts and dates.** They compared the page with itself,
which is the failure this file names in as many words (*"a check that compares a
figure with its own copy cannot fail"*) and which this change committed again in
the very file written to avoid it. The tile's four figures carry structural
handles now and are reconciled against `NAV_MOVERS_BOOK`, derived from the book
and the store by a different path; and the value-weighting is additionally
asserted as an INEQUALITY against the mean it must not be, so the equality
cannot pass by luck on a book where the two happen to coincide. Re-run against
the same two bugs, the mean fires two checks and the un-summed model fires four.

**A THIRD DEFECT WAS IN THE HARNESS**, and it is the one recorded at Stage 10ar
arriving again: two of the files this pass patches are NEW and therefore
UNTRACKED, so `git checkout -- <file>` restores nothing. The harness snapshots by
COPY and restores on a `trap … EXIT`, **and rebuilds on the way out** — restoring
the source alone leaves `dist/` at the bugged build, and the next sweep reads it
and reports the previous bug's failures under the next one's name. A patch that
does not apply, or a build that fails, is reported as NOT A RESULT rather than
as a clean run.

**AND A FOURTH WAS A RACE IN THE WAITER.** A follow-on step that waited on
`pgrep -f bug.sh` started while the pass was still running: that predicate is
FALSE for a moment BETWEEN two invocations, so the waiter slipped through the
gap and rebuilt `dist/` underneath bug 14. Nothing it produced afterwards was a
result — two builds racing on one output directory can report either one's
failures under the other's name, which is the stale-`dist` defect one level up.
A waiter has to be built on the LOOP, not on one iteration of it; the fix
re-checks after a pause long enough to cover the gap.

Reading this change back found three defects in it that no check would have
caught, all of them shapes this file already names:

- **`spansDates` was computed and rendered nowhere** — the
  dead-code-that-looks-alive failure, in code written the same hour as the
  comment warning about it.
- **`skipped[0].reason` was printed as THE reason** for every unpriced holding,
  which is right only while they all share a cause. Three different things put a
  holding there and only one of them is a "wait for tomorrow". Grouped by reason
  now, and by name within it, since LIQUIDBEES is four statement rows and one
  security.
- **`valueAsOf` was on the row and rendered nowhere** — the field carrying the
  right answer into no caller, which is this repo's most-repeated defect. It is
  the statement date behind the derived rupee figure, and the two sides being
  dated differently is the whole reason that figure is labelled derived.

A fourth was in the new suite itself: `ok("no section is empty", v !== 0 || true)`
is always true — a check that cannot fail, written into the file whose purpose is
to catch exactly that.

**FIFTEEN BUGS WERE REINTRODUCED IN TOTAL AND EVERY ONE NOW FIRES ITS OWN
CHECK**: the rupee move struck as `units × NAV`; the aggregate as an unweighted
mean; a scheme clubbed on `securityKey` rather than on the scheme the NAV is
published against; the card dated "today"; the ranking defaulted to rupees; the
basis sentence deleted; the coverage line dropping the holdings it cannot price;
an AIF folded into the scope; the numeral read loosened; `Category I/II`
resolved to one of the two; Private Equity folded back into the category axis;
the unvalued folios deleted; the per-row category chip removed; the sectioning
dropped entirely; and one section silently dropped from the partition. The last
fires seven checks at once, from seven directions.

**AND A FIFTH BUG WAS CLEAN FOR A REASON WORTH KEEPING.** Resolving `Category
I/II` to the FIRST of the two, rather than to neither, moved no row and no total:
the only holding with an ambiguous category is Transition Venture Capital, and
**Private Equity claims it first**. All the defect changed was one chip, from
"category not stated" to "Category I" — and the check accepted any of the three
names or none, because it was asserting a SHAPE. A chip is where this book states
a classification, so it is held to the book's own per-row answer now, compared as
a multiset so it does not also assert an ordering the sections are free to
change.

#### Merged with main, and both predicted conflicts arrived on cue

This branch sat open through review and **Stage 10av landed on main while it
waited**, so the merge hit exactly the two conflicts this file already tells a
future session to expect — for the **fourth** time each:

- **THE LETTER COLLIDED AGAIN.** Both branches wrote `### Stage 10av`. Main's
  merged first and **keeps the letter**, as it did at 10al, 10as and 10at; this
  section is `10aw`, and the two Build-section cross-references that named its
  suites (`navMovers.test.ts`, `aifCategory.test.ts`) moved with it. The two that
  still read `10av` — the `CASH_EQUIVALENT_KEYS` line in **Layout** and the cash
  note under Stage 10L — belong to main's section and were left alone, checked
  rather than assumed.
- **AND THE `ctx` LITERAL CONFLICTED AGAIN, ON ONE LINE, EXACTLY AS PREDICTED.**
  `check-pages.mjs` hands its invariants one object literal: this branch adds
  `aifSections` and `navMovers`, main's adds `buttonLabels`, `capitalMoves`,
  `capitalTotal` and `capitalHow`. **Resolved as a mechanical union**, never by
  picking a side — the file's own measurement is that dropping `attrib` turned
  nine invariants into NOT CHECKED over a sweep still reporting every combination
  CLEAN, so half of these losses are invisible by construction. Every one of the
  eight probes was then confirmed to be defined exactly once in the merged file,
  because a key naming a variable that no longer exists throws inside the check
  and is reported as a broken matcher rather than as a clean page.

**AND THE SWEEP FAILED FIVE INVARIANTS ON THE MERGED TREE, WHICH IS THE CHECK
EARNING ITS PLACE RATHER THAN A DEFECT IN IT.** Every suite was green — build,
tsc, `test:ingest`, `test:family`, `check:family` 57/0 — and `check:pages` came
back **1 of 152 combinations with a finding**, all five on `cio`'s NAV card.

The cause is the one thing that makes a second expression worth writing and is
also its whole hazard: **the card scopes on `holdingBucket` and the checker
scoped on `assetClass`, and only one of the two moved.** Stage 10av made a
liquid fund or liquid ETF `Cash` in the BUCKET whatever wrapper its statement
typed it as — and §5 correctly leaves `assetClass` alone, because that is the
model's vocabulary. So the two expressions of one rule disagreed by four rows,
and **the card was the right one**: a card headed "what your funds did" must not
carry the family's cash.

`NAV_MOVERS_BOOK` reads `CASH_EQUIVALENT_KEYS` out of `analytics.ts` as
committed DATA and re-expresses the membership test, exactly as it already reads
`BOOK_POLYCAB` for the ring-fence — **never by importing `isCashEquivalent`,
which would agree with the card by construction and report nothing.** Both
directions were then verified by reintroducing the bug:

- dropping the exclusion reproduces **exactly the five failures the merge
  produced**, so the clause is load-bearing rather than merely agreeing;
- renaming the constant so the map cannot be read yields **seven failures, not a
  silent pass** — the parse returns `null`, the checks fail, and a renamed
  constant can never read as a book with no cash equivalents in it.

**THE LESSON IS NOT "THE CHECKER WAS WRONG".** It is that a rule expressed twice
has to be MOVED twice, and the merge is where that comes due — which is an
argument for the two expressions, not against them: written as one import, this
merge would have silently changed what the card covers and reported clean.

**AND THE GENERATED FILES WERE CHECKED RATHER THAN ASSUMED**, the discipline
Stage 10at records — a textual splice of two generated regions can produce
something the generator would never write. Measured here: **neither side touched
`src/data/glowData.ts`, `docs/` or `public/lookthrough/`, so the merge had nothing
to splice**, and `npm run build-book` was run as a control afterwards and
regenerated byte-identically. Both halves are stated because the first is what
made this merge safe and only the second would have caught it had it not been.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 140 (2 not checked, 0
blocked) · `test:family` · `check:family` **57/0** · `check:pages`
**152 combinations clean**, with the same two pre-existing abstentions — both
evidenced rather than silent: this harness serves no `/api/quotes`, so the
market-cap card renders its absent state, and every KPI tile on this book
carries a figure, so the absent-tile claim has no subject. `npm run build-book`
is a no-op against the committed tree.

**THAT COUNT IS MEASURED ON THE MERGED TREE, AND THE TWO 150s ABOVE IT ARE BOTH
TRUE OF DIFFERENT BASES.** Stage 10av's 150 is 148 plus its own `mandate-funded`
route; this branch's pre-merge 150 is the same 148 plus its own `holdings-aif`.
Each route is two combinations, so the merged tree carrying BOTH is 152 — which
is the one case where the arithmetic does reconcile, and it reconciles only
because it was re-measured rather than assumed. Every other stage in this file
that states a count states it against a base that has since moved, which is why
the sweep is re-run and the number never adjusted.

### Stage 10ax — THE ₹1,000 FLOOR, AND THE FIRST FILTER THAT MOVES MONEY

*"यह तो ना यहां पर irrelevant items हैं. यह सबको हटा दो यह. 54 rupees क्या होता
है? … or we can just say that less than thousand rupees remove automatically.
Something like that. Right? Yeah. Yeah. Please code it like that."*

**THE ₹54 IS `INVES CON R GROWTH`, 0.39 UNITS OF A MUTUAL FUND**, found by value
rather than by name. Measured over the whole book there are **SIX** such rows and
they come to **₹848.24** between them — a hundred-thousandth of a ₹710 Cr book,
spending six rows of a table the family read top to bottom.

**IT IS A FAMILY DECISION, SO IT IS APPLIED AT THE DISPLAY LAYER AND NOWHERE
ELSE** — the standing `RINGFENCED_SECURITY_KEYS` already has. `glowData.ts`
regenerates BYTE-IDENTICALLY with it in the tree (run as a control before and
after), the archive still carries the statements, and setting
`NEGLIGIBLE_VALUE_FLOOR` to 0 restores every row everywhere in one edit. What it
must never become is an ingest rule: a figure a statement printed does not stop
being a figure because it is small.

**AND IT IS THE FIRST FILTER IN THIS APP THAT DROPS A ROW AND MOVES MONEY WITH
IT.** The closed-position filter it sits beside is free — a redeemed holding is a
measured ₹0, so every total is identical either way — which is exactly why it is
the wrong precedent to reason from, and why `currentHoldings`'s own doc block
(*"IT MOVES NO MONEY, WHICH IS WHY IT IS SAFE TO APPLY AT THE BASE"*) had to be
corrected in the same change rather than left standing as a confidently wrong
explanation of code beneath it.

#### Three decisions, each a wrong answer this book had no case of

**1. IT IS STRUCK ON THE SECURITY, NEVER ON THE STATEMENT ROW.** The obvious
`p.marketValue < FLOOR` deletes a name held at ₹900 in five accounts — ₹4,500 the
family really owns — and the holding with it. Measured: **130 of 213 securities
are reported by more than one statement, and the number where every row is under
the floor while the holding is not is ZERO** — the smallest row belonging to a
multi-row security is ₹6,208. So the two readings agree HERE, which is precisely
why the one that is right in general is the one implemented and why the
difference is asserted on CONSTRUCTED rows rather than waited for.

**2. IT IS THE MAGNITUDE.** Two rows carry a NEGATIVE market value — V.E.C's
`CASH Rec/Payable` at −₹84,556.96 and −₹1,37,488.47, a settlement obligation
inside a mandate. A naive `value < 1000` is true of both, so it would drop
₹2.22 L of real liability and silently INFLATE two mandates by exactly that.

**3. A MEASURED ZERO IS NOT A SPECK.** `Math.abs(0) < 1000` is true, so the
obvious test also takes the three rows this book carries at exactly ₹0 — two
`Cash` sleeves and a `Tax Deducted at Source` line. **It must not**, on this
book's own rules: a computed zero is legitimate and stays, the family pointed at
₹54 and not at ₹0, and the redeemed rows are ₹0 with a BETTER reason already
(`isRedeemedToNil`) that folding them in would replace with "this is a speck".
**The test suite is what caught this** — it reported the TDS row as a dropped
holding reporting a cost, which is the one thing the floor must not touch.

#### What it moves, measured rather than assumed

Every one of the six carries `costBasis: null`, no dividend, and no capital-gain
lot anywhere in the archive — checked against `public/audit/`'s own 329 lots
across 26 securities, because **realised is not a field on `Position`** and the
first draft of that check read `p.realizedPnL`, found `undefined` on all six rows
and PASSED while asserting nothing. So Capital invested, Realised P&L and income
are untouched and only MARKET VALUE moves, by ₹848.24 — invisible at the
one-decimal-crore precision every surface prints, and carried as an EXPLICIT TERM
by the suite that ties to `BOOK_SUMMARY` rather than absorbed into a tolerance.

#### Named on the figure, never as a paragraph

The family have twice asked for the grey blocks under these tables to go — the
closed-position note was one of the three they pointed at, and this file records
it as REMOVED rather than relocated. So the disclosure goes where this book puts
a claim about a figure: **on the figure.** The Portfolio Monitor's footer states
it in the row-count cell's own `title`, beside the Weight cell that already
explains its denominator the same way; Morning CIO's Positions tile states it in
the `title` that already names what that count counts; and `/holdings`, which is
the page that exists to explain these counts and already carries the closed
sentence, states it in the subtitle **with the VALUE** — a closed row is ₹0 so its
count is the whole story, and these moved the page's own total.

`Drilldown.closedExcluded` therefore gained a SIBLING rather than a wider count.
Folded together, the six specks would have been described to the reader as
redemptions — *"the fund still publishes a NAV, the family no longer holds them"*
— about four mutual funds and two shares the family holds perfectly well.

#### The inconsistency it exposed, and the one it would have created

**`drilldown.ts` HELD A SECOND ANSWER TO "WHAT IS CURRENT".** It read
`!isRedeemedToNil(p)` inline — written before there was a second rule to get
wrong — so the floor would have applied on the Portfolio Monitor and not there: a
tile reading 364 opening a table of 370, which is the one disagreement that
module exists to prevent. It calls `currentHoldings` now.

**AND `SectorComposition` WAS ALREADY NARROWING BY HAND.** `consolidated.filter(isCompanyShare)`
was RIGHT for as long as everything `currentHoldings` removed was a fund vehicle,
which `isCompanyShare` had already excluded — so the two filters were equivalent
by accident. The floor drops two EQUITY rows, they stopped being equivalent, and
that page's MEASURED half stopped agreeing with its own DERIVED half (which was
already filtered, through `useStockExposure`). Caught by the two-page identity
`check:pages` strikes across it and the Monitor's security axis — half a page on
one set and half on another is the disagreement `companyExposure` exists to
prevent, arriving through the one caller that narrowed by hand.

#### Seven bugs reintroduced, and TWO of them were defects in the checks

Each was put back on its own, rebuilt and swept, with the harness restoring **and
rebuilding** on a `trap … EXIT` — restoring the source alone leaves `dist/` at the
bugged build and the next sweep reports the previous bug's failures under the next
one's name.

- **THE SIGN GUARD COULD NOT FAIL, AND ONLY REINTRODUCING IT SHOWED THAT.**
  Replacing `Math.abs(value)` with `value` — the exact defect that section exists
  for — left the whole suite GREEN. The reason is decision 1: both negative rows
  are `CASH Rec/Payable`, and that securityKey is ALSO carried by three positive
  rows, so the key totals ₹2.07 Cr. Measured over the whole book there is **NO
  NEGATIVE KEY TOTAL AT ALL**, so a real payable can never reach the branch. It is
  exercised on constructed rows now — a lone −₹84,556.96 payable that must be
  KEPT, and a lone −₹54 that must still GO, because a guard "fixed" by refusing
  every negative is a different rule.
- **AND ONE CHECK WAS SHAPED BY ITS OWN FIXTURE.** `cio-alloc-class` required the
  PLURAL — *"the family's review does not place these holdings"* — and **five of
  the six specks were sitting in that very section**, so the floor took it from
  six holdings to one, the page correctly switched to "this holding", and the
  check called a correct page a regression.

The five that fired first time: the floor wired to nothing (**8 invariants across
5 routes**, plus 4 in the suite), the zero exclusion dropped, the test struck per
ROW, `SectorComposition` back on the unfiltered set, and the `/holdings`
disclosure deleted.

#### Merged with main, and the merge found a sixth surface

Stage 10aw landed while this branch was open and **took the same letter**, which
is the parallel-branch collision this file has now recorded four times; this is
`10ax` and main's keeps `10aw`. Three files conflicted and every one was a UNION
— `test-family.mjs`'s suite list, `HoldingsBehind`'s imports, and this file —
because taking either side whole silently retires the other's checks.

**AND THE DANGEROUS ONE AUTO-MERGED, AS IT ALWAYS DOES.** `check-pages.mjs`'s ctx
literal merged without conflicting; both sides' keys survived (`aifSections` and
`navMovers` are main's, this branch added none), verified by reading it rather
than by trusting that git did not complain.

**THE FLOOR REACHED A CARD THIS BRANCH NEVER SAW.** `NavMovers.tsx` — main's new
daily-NAV movers — draws `currentHoldings(consolidated)`, so the floor applied to
it the moment the two landed together, and **all five of that card's invariants
failed at once** against a page that was right: the rendered card covered
₹1,103,878,543.11 against a derivation expecting ₹1,103,878,751.35, a gap of
**exactly ₹208.24** — the four mutual-fund holdings the floor drops. That is the
single-definition seam working (the card needed no edit) and `NAV_MOVERS_BOOK`
needing to follow, which is the same failure its own comment already records
from the 10av merge, arriving one merge later.

**PRISTINE `main` WAS WALKED FIRST TO ESTABLISH THE FAILURE WAS THIS BRANCH'S**
— a worktree at `origin/main`, built and swept: `cio` clean. Without that the
five could have been read as main's own and waited out.

**AND THE FIRST FIX PATCHED THE WRONG BLOCK.** The anchor text — `const seen` /
`const ded = current.filter(...)` — is IDENTICAL in `AIF_BOOK` and
`NAV_MOVERS_BOOK`, and the merge had moved both, so a text-anchored patch landed
in the first of them and the five went on failing. Instrumenting the check is
what showed it (the ₹208.24 above); the fix is anchored on a line whose enclosing
block was then asserted. It is left in `AIF_BOOK` too, where it is correct for
the same reason and currently a no-op — no holding the floor drops is an AIF.

`build` · `tsc` · `test:ingest` 140 + 84 + 35 · `test:family` 1,207 across 22
suites (a new `negligibleFloor.test.ts`, 21 checks anchored on `glowData.ts` and
on the audit archive) · `check:family` **57/0** · `check:pages` **152
combinations clean** — MEASURED ON THE MERGED TREE, not carried across from this
branch's own pre-merge 150, which was struck against a base that has since moved
— with the same two pre-existing abstentions. `npm run build-book` regenerates
the book BYTE-IDENTICALLY, run as a control: a display-layer decision that moved
a generated figure would not be one.

### Stage 10ay — COMMITTED, CALLED AND INVESTED ARE THREE FIGURES, AND THE CALLS ARE DATED

*"How are you calculating this uncalled capital of 16 crores? … Something seems
amiss here. According to me, the number is not 16 crores."* · *"Capital
committed, or is it capital invested? What is capital committed versus
invested? … Because committed can be one thing. I would commit 10 crores, but I
may have only invested so far 5 crores, and 5 crores is remaining to be drawn."*
· *"Drawn against no valuation means?"* · *"Where is it pending? … what is the
timeline? When is the commitment expected? Or is there something which is due in
the next one month, three months, six months?"* · *"so labels are there, but
they just need more granularity and timeline and dates and also the schemes."*

#### 1. The ₹16 Cr was right, and the tile was still wrong

**BOTH HALVES OF THAT MATTER AND ONLY THE SECOND IS FIXABLE.** Verified two
ways before anything was built:

```
Σ printed "undrawn", 13 accounts               = ₹15,97,50,000
Σ (committed − called) over the 14 that print
  a called line                                = ₹15,97,50,000
```

Two independent paths from two different blocks of the statements, agreeing to
the rupee, and the per-scheme table now prints every row of it.

**WHAT WAS AMISS IS THE COVERAGE, AND THE TILE NEVER SAID SO.** The register
holds **15 capital accounts against this page's 29 private accounts**. The other
14 — the five Sanshi folios, both Buoyant, 3P, both 360 ONE Alternates, both
360 ONE Private Wealth CRNs, Hedged Equity, the ICICI NSDL row — report a
holding, an income split or nothing, and a commitment behind one of those is
INVISIBLE to this figure. So a reader who knows of such a commitment is right
that the number is too small, and the tile gave them no way to see it. It reads
`across 15 of this page's 29 private accounts · the rest send no capital
account, so this is a floor` now, and the card under the table names the gap and
points at the family's own register, which lists further funds with no statement
in this book at all.

**AND ₹4.48 Cr OF IT IS FIVE MONTHS STALE** — Baring and both Transition Venture
trusts are marked 31 March 2026, 122 days behind the newest capital account here,
so a call made since would not show. Named on the timeline card with the funds
and their dates, rather than folded into one figure.

#### 2. `drawn` was two different quantities, and the statements say so themselves

Baring prints the whole identity as labelled algebra on one block, and Motilal
Oswal and Carnelian print the same five under their own names:

```
Capital Commitment    A                what the family PROMISED
Capital Call          B                what the fund has DEMANDED
Capital Contribution  C                what the family has PAID  ← "invested"
Pending Contribution  D = B − C        called and not yet paid   ← DUE NOW
Undrawn Capital       G = A − B + E    not yet called
```

**`Commitment.drawn` CARRIED WHICHEVER OF B AND C ITS OWN LAYOUT MATCHED.** India
SME's, Baring's, Sky Capital's and Neo Infra's readers take the CONTRIBUTION
line; Carnelian's takes the CALL. The type's own comment said "capital actually
called so far", which was true of one reader out of six. On this drop the gap is
**₹2,925.10** — Carnelian's contributed runs ABOVE its called, being fund income
reinvested — so nothing on screen was visibly wrong, which is exactly the
condition under which one field quietly means two things for a drop and a half.

`called`, `paid` and `pending` are separate fields now, each read ONLY from the
line its own statement labels and null where it labels none. **`drawn` is
unchanged**, so no figure already in the book moves with the correction.

| | | coverage |
| --- | ---: | --- |
| Committed | ₹97.73 Cr | 15 of 15 |
| Called by the funds | ₹71.75 Cr | 14 of 15 |
| Invested (paid in) | ₹81.75 Cr | 15 of 15 |
| Due now (called, unpaid) | **₹0 — measured** | 1 of 15 |
| Still to call | ₹15.98 Cr | 13 of 15 |

**CALLED AND INVESTED COVER DIFFERENT SETS AND THE PAGE SAYS THEY MUST NOT BE
SUBTRACTED.** Delphi prints a contribution column and no called line, so its
₹10 Cr is in the second total and not the first; ₹81.75 − ₹71.75 reads as ₹10 Cr
overpaid when it is one fund appearing in one total and not the other. That is
`sumOrNull`'s standing rule arriving on a tile pair a reader will instinctively
difference.

**AND THE PAGE'S OWN WORKING LINE COMMITTED THAT EXACT ERROR ON ITS FIRST
DRAFT.** It printed *"the same figure the other way: committed ₹97.7 Cr less
called ₹71.8 Cr is ₹26 Cr"* beside a printed uncalled total of ₹16 Cr. Both
numbers were right and the sentence was a contradiction a reader who subtracts
finds in ten seconds — `committed` spans 15 accounts and `called` spans 14, so
the subtraction carried the whole ₹10 Cr commitment of the fund that prints no
called line. `committedWhereCalled` is the matched denominator, and PM-4b
asserts the printed difference really is the difference AND is the tile.

**`Drawn against no valuation` IS `Paid in, but never valued`** *(and just
`Never valued` since Stage 10bs, with "Paid into funds with no NAV" under it)* — the client's
third question, and the old label was jargon twice over: "drawn" is the fund's
word for having taken the money, and "against no valuation" is a property of the
STATEMENT rather than of the money. ₹18.2 Cr across 7 funds, unchanged in every
other respect.

#### 3. Fifty-two dated capital calls that were in the archive all along

**EVERY DRAWDOWN STATEMENT IN THIS CORPUS PRINTS ITS CALLS DATED**, one row each
with the fund's own total under them, and nothing read past the summary block —
so a register of ₹97.73 Cr carried four numbers and not one date. That is an
absence recorded against a premise nobody rechecked, and the second (after 3P's
redemption on page 2) where the missing table was on a page the reader had
already opened.

`capitalFrom` on six layouts plus `transitionVenture.mjs` reads them: **52 calls
across all 15 capital accounts**, Neo Infra's running back to October 2023.

**A DATED TABLE IS PUBLISHED ONLY IF THE STATEMENT'S OWN TOTAL AGREES.**
`callsIfTheyTie` is the whole licence — the rows must reproduce the figure the
same statement prints for them, to the rupee, or NOTHING is emitted and the
reason is warned. A schedule one call short understates what the family has paid
and looks on screen exactly like a complete one. `capitalCalls.test.mjs` breaks
each statement one figure at a time, and each mutation isolates one check: a
removed call, a moved printed total, a total that is not printed at all (a
DIFFERENT code — the rows may be perfect and there is no way to say so), a stamp
duty or allotment row swept in, and an unpaid call that must raise `called` and
leave `paid` alone.

**AND ONE OF ITS OWN COMMENTS WAS REFUTED BY THE TEST WRITTEN TO PROVE IT.** Sky
Capital prints its commitment schedule and its drawdown schedule in the same
`₹ <amount> <date>` shape, so the sweep is cut to the drawdown block — and the
comment claimed that without the cut the merged rows would sum to commitment plus
drawdown and the gate would refuse them. It is a SLICE, not a filter: with the
anchor gone the reader finds no rows at all, published nothing, and said nothing.
Safe, and silent. The anchor is checked against the printed total now
(`drawdown-table-not-found`), and the case asserts the SILENCE is gone rather
than that the gate fired — a confidently wrong comment about which check protects
you is how the next session deletes the one that does.

#### 4. `npm run replay:calls` — landing a reader change without the passwords

`GLOW_PDF_PASSWORDS` is not available on most machines, so `npm run extract`
would drop eight encrypted statements and `guardAgainstShrinkingTheArchive`
would correctly refuse the run. The text these readers parse is
`public/audit/<doc>/pages.json` — committed, and reconstructed EXACTLY as
`extract()` builds it — so running the REAL reader over it is a faithful partial
replay rather than a second implementation. `rekey:archive` and
`build-lookthrough --reindex` are the precedents; this is the third, on the same
three rules: it only ever ADDS fields, its gate is struck on the archive (a
replay that cannot reproduce the four figures already on disk is not reading what
the extractor read, and nothing is written), and `--check` writes nothing and
must be a no-op.

Measured: **28 commitment documents replayed, 0 refused**, the diff to
`public/audit/` is **573 insertions and 28 deletions — every deletion a
`"distributed": null` line gaining a comma** — and `glowData.ts` gains **335
lines and loses none**. `BOOK_SUMMARY` and `docs/BOOK-REPORT.md` are
byte-identical, which is what a purely additive change must look like.

#### 5. The timeline, and the one thing it must not do

***THE CARD HAS SINCE BEEN REMOVED, AT THE FAMILY'S REQUEST — see Stage 10bs.***
Its three windows were permanently empty for exactly the reason below, and the
family asked for the thing that could fill them instead: an editable Capital
call column on the fund table, saved for everyone. Due now is a tile a reader
can pick, the undated still-to-call is the default tile and the scheme table's
footer, and the dated history below is its own card and unchanged. The
reasoning is kept because it is why a forecast must still never be printed.

**NOT ONE OF THE 265 DOCUMENTS IN THIS ARCHIVE PUBLISHES A FORWARD DRAWDOWN
SCHEDULE.** Measured, not assumed: no commitment-period end date, no call notice
dated ahead of its own statement, no expected-drawdown table. A drawdown fund
calls when it finds something to buy, and none of these has said when.

So the 1/3/6-month windows the family asked for cannot be filled from a schedule,
and the tempting substitute — projecting the next call from the observed cadence
— is a forecast, which rendered beside fifteen measured figures reads as the
sixteenth. The card therefore carries five buckets:

| | |
| --- | --- |
| **Due now** | called and unpaid, ₹0 MEASURED on the 1 of 15 accounts that print the line |
| **Next 1 / 3 / 6 months** | `—`, each naming the document that would fill it |
| **Promised, no date** | ₹15.98 Cr, callable on any day, which is why no window can claim it |

`callWindows` is a FILTER over real dated calls rather than a constant empty
array, so the day a fund issues a notice ahead of time the card fills itself.
The windows run from the newest capital-account date rather than `new Date()`,
because that is the date these balances are struck at — `pooledXirr`'s own rule.

**AND WHAT FILLS THE CARD INSTEAD IS THE HISTORY**, which is the honest answer to
"timeline and dates and also the schemes": every one of the 52 calls, dated,
with the fund's own wording, newest first — a reader who can see that a fund has
called four times in eighteen months knows more about what is coming than any
projection this book could print as a figure.

**THE `No capital-call timeline` ABSENCE CARD IS GONE AND THE TVPI ONE WAS HALF
FALSE.** The first read *"others print their drawdowns as page text their reader
does not yet emit … the fix belongs in the ingest"*, which was true and is now
done. The second said *"none publishes its calls as dated data"* — false of all
fifteen the moment the calls landed, so it names the real remaining gap and
counts it: 12 of 15 accounts print no distribution line, and reading those as nil
would report a fund that has returned nothing when its statement does not say.

#### Seven bugs reintroduced, and one check could not fail

Each was put back on its own, rebuilt and swept, with the harness restoring **by
copy on a trap and rebuilding on the way out** — two of these files are new and
untracked, and `git checkout --` on an untracked file silently does nothing,
which leaves the bug in place and reports the next run under the previous one's
failures.

Six fired immediately: the mismatched subtraction, the floor sentence deleted,
the "no forward schedule" sentence deleted, the history truncated, the
must-not-subtract warning softened, and a window given a figure.

**THE SEVENTH PRODUCED A CLEAN SWEEP.** A `?? 0` on the due-now total widens its
coverage to every row and leaves the FIGURE at ₹0 — every `pending` in this drop
is either a measured nil or null — so no value check on the page can see it, and
the coverage check read `15 of 15` against the page's own denominator and passed.
`CAPITAL_BOOK` re-expresses the register off `glowData.ts` (never by importing
`capitalCalls.ts`, which would agree by construction) and the count is struck
against the book. The call-count check was anchored the same way in the same
pass, because a history and a scheme table truncated TOGETHER reconcile with each
other perfectly.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + **30 new** + 140 ·
`test:family` (a new `capitalCalls.test.ts`, anchored on the generated book) ·
`check:family` **57/0** · `check:pages` **152 combinations clean**, with the
same two evidenced abstentions — this harness serves no `/api/quotes`, so the
market-cap card renders its absent state, and every KPI tile on this book
carries a figure, so the absent-tile claim has no subject.

**THAT COUNT IS UNCHANGED FROM STAGE 10ax, AND THAT IS THE POINT**: this change
adds no route. Everything it asserts is struck on `/private-market`, which the
sweep already walked, so the number moving would have meant a route appeared
somewhere nobody looked.

`npm run replay:calls -- --check` is a no-op against the committed tree, and
`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY — which is what says the archive on disk is what the extractor
would write, and that a change carrying 52 new dated rows moved no figure.

### Stage 10az — THE LABELS SAY WHAT THEY ARE, AND THE TAPE READS NEWEST FIRST

Three asks, and the one that looked like a wording change turned out to have a
committed, identifier-anchored source sitting in the repo already.

#### 1. *"What is the capital deployed for private equity?… I told you — details, because it's not very clear."*

and *"I'll make it clickable. And so you'll be redirected to the private page,
and then we can show the details there."*

Morning CIO's **Capital deployment** card carries four figures off the drawdown
funds' capital accounts — committed, called, undrawn, distributed — and exactly
ONE of them was a link: the words "Fund commitments". **The figure they were
asking about, what has been CALLED, was not it.**

**THE LIST IS THE ANCHOR NOW, AND THAT IS ONE LINK RATHER THAN FOUR.** The
reasoning the card already carried stands and is why it is not four anchors —
*"all four come off the same accounts, and four links to one destination reads
as four different destinations"* — so the `<ul>` itself is the `<Link>`. Every
figure on the card is a click target, there is still one destination, and the
row now reads **Called / drawn — capital deployed** in the family's own words.

`/private-market` is where the detail already is: committed, drawn, still to
call and distributions, folio by folio, each tile naming the fraction of the
capital accounts that publish it. Nothing had to be built there.

**AND THE CHECK HAD TO BE REWRITTEN RATHER THAN DELETED.** It required a TEXT
link reading exactly `Fund commitments` — struck on the one figure that was
already a link and not on the one the family asked about. It is struck on
`data-cio-deploy-link` now and additionally requires the anchor to COVER the
called figure, so a card that kept the handle and lost the row fails. Verified
by reintroducing the bug: removing the handle fires it by name.

#### 2. *"Not recent transactions first. Do that."*

*"how is it sorting? Is it, like, the recent transactions first? How is it
sorted?… your transaction should always have your recent transactions first… It
should be date wise, basically."* · *"See, something is October, something is
December, something is 2023. It's all very chaotic."*

**IT WAS CHAOTIC, AND FOR A REASON THAT LOOKED DEFENSIBLE WHEN IT WAS WRITTEN.**
Every rollup on the Transactions card sorted BY SIZE — `capitalRollup` by
`paidIn` descending, `rollup` by bought + sold — so the family's own capital read
`3 Oct 2025`, `4 May 2023`, `16 Dec 2025` down the Period column. That ordering
answers *what is the biggest*; a reader scanning dated movements is asking *what
happened last*.

**`src/lib/txnSort.ts` IS THE ONE DEFINITION, AND IT IS APPLIED AT ALL THREE
LEVELS.** Groups, the instruments inside a group and the dated tranches inside
those. A comparator written per level is how a card set to newest-first comes to
contain rows that open on their oldest movement — which is the same complaint one
level down. The full trade list follows it too, and is sorted BEFORE the cap is
applied, so the cap takes the first rows of the order the reader asked for rather
than of the feed's.

**THREE MODES, AND DELIBERATELY NOT FOUR.** *"you can give me an option. I can
sort recent transactions first, or I can sort as per, say, holding period."* A
row's holding period runs from its first dated movement, so **"oldest first" and
"longest held" are the same ordering on this data** — offering both would put two
controls on screen that cannot be told apart by their results. The one ordering
is named after what the family asked it for, and the size ordering it replaced
keeps its place as the third: it was never wrong, only wrong to impose.

**AN ABSENT AMOUNT SORTS LAST, NEVER AS ZERO.** `-Infinity`, not `?? 0`. A
statement that reports no settled amount has not reported a small one, and a zero
there files every unreported movement among the smallest — the absent-vs-zero
rule arriving through a comparator, where no rendered figure would show it.

**CHECKED ON ISO DATES, NOT ON THE PERIOD CELL.** The rows carry
`data-mine-first` / `data-mine-last` and the control carries `data-txn-sort`,
because a claim about WHICH ORDER a table is in must not be struck on `3 Oct
2025` or on a button's label — the prose a redesign is free to reformat. Three
claims, and none implies another: the rows are ordered newest first, the control
exists and opens on `recent`, and the other two modes are still offered. Verified
by putting the size ordering back, which fires the first by name.

#### 3. *"So we are leaving a lot to imagination. So we'll have to be careful with the labels."*

*"why should everywhere you show me direct plan growth? You're wasting a space
here. We don't need it… Maybe you can write direct. Just direct plan, growth
option — remove… Rather, I would rather have WhiteOak multi asset… For example,
BNDH L&MC is large and mid cap. Now it's very important, Bandhan, large and mid
cap should come."*

Two complaints with one cause. A DEPOSITORY clips a scheme name to its own column
width and an AMC folio spells the plan out at length; both are what the statement
printed, which is exactly why `stripDepositoryTail` cannot help with either —
**it only ever REMOVES, and it never supplies a name the statement did not
print.** This file has recorded that limit three times and called the remedy *"a
hand-checked alias, not another statement"*.

**IT DID NOT NEED A HAND-CHECKED ALIAS. THE ANSWER WAS ALREADY COMMITTED.**
`public/lookthrough/<schemecode>.json` carries `amfiSchemeName`, `amc`, `plan`
and `option` for every scheme in this book, and `build-lookthrough` resolved
each one FROM THE BOOK'S OWN ISIN. So the full name is AMFI's own published one,
reached through an identifier — the same tiering as `build-symbols` and
`build-sectors`, and the same rule: *an identifier above the name tiers makes the
match STRICTER, never looser.* That is the **eighth** absence in this file
recorded against a premise nobody rechecked.

| The statement printed | A reader sees |
| --- | --- |
| `BNDH L&MCF DP GR` | **Bandhan Large & Mid Cap Fund · Direct** |
| `WOC MAAF D-GROW` | **WhiteOak Capital Multi Asset Allocation Fund · Direct** |
| `ICICI IOPPF D-GRW` | **ICICI Prudential India Opportunities Fund · Direct** |
| `Helios Flexi Cap Fund - Direct Growth` | **Helios Flexi Cap Fund · Direct** |
| `HDFC Liquid Fund-Direct Plan-Growth Option` | **HDFC Liquid Fund · Direct** |

**21 of the book's 22 schemes resolve**, `npm run build-scheme-names` emits
`src/data/schemeNames.json` and `docs/SCHEME-NAMES.md` lists every expansion and
every refusal so any one can be challenged. The one that does not resolve —
Liquid BeES, whose legacy ISIN is in no AMFI file — keeps the name its statement
printed and is NAMED. **There is no fuzzy tier.**

**FOUR GATES, BECAUSE A MIS-JOINED NAME IS THE WORST FABRICATION AVAILABLE
HERE**: it is a complete, correct name belonging to another fund, and there is
nothing on screen a reader could catch it by — the reasoning `build-sectors`
already applies to a vendor page. The ISIN must agree three ways (the index
entry's, the scheme file's and the BOOK's); the strip is anchored at the end over
a CLOSED VOCABULARY of plan and option words, so nothing that could name a
strategy is in it; the word that says what the thing IS must survive the strip;
and the plan marker is rendered only where the AMFI name carried a plan or option
phrase at all, so an ETF gets none.

**THE PLAN CANNOT SIMPLY BE DROPPED, AND THAT IS MEASURED RATHER THAN
CAUTIOUS.** *"Maybe you can write direct"* is the whole of what survives — one
word instead of `Direct Plan - Growth Option`. It stays because **this book holds
BOTH plans of two schemes**, HDFC Balanced Advantage (`1273` / `1273-D`) and
ICICI Pru Nifty Next 50 (`11889` / `11889-D`). Plans differ in expense ratio and
therefore in NAV, not in what the fund owns, so without the word each pair is two
rows with one name and two different figures. The marker's TEXT comes from the
record rather than from the words removed, because `HDFC Balanced Advantage Fund
- Growth Plan` is the regular plan and its name says so nowhere. The OPTION is
dropped wherever it is Growth — which is every scheme here — and says so where it
is not.

**IT IS DISPLAY ONLY, ON THE SAME TERMS AS `stripDepositoryTail`.**
`securityKeyOf` is not routed through it. `PortfolioContext` is the seam — it
already ran `displaySecurity` over every position — so the Monitor, every
drill-down, the Excel export, the chat context and Private Market all follow with
no per-page edit. `ledger.ts` moved with it, and that is not tidiness: the
Monitor's pick list is built from the CONTEXT's labels and the tape filters on
`t.security` from the LEDGER's, so two spellings would have emptied the tape the
moment anyone filtered by a renamed scheme.

**AND THE DAILY-NAV MOVERS CARD WAS A THIRD SPELLING.** It rendered the store's
own `scheme` (`Bandhan Large & Mid Cap Fund-Reg(G)`) beside a holdings table
naming the same fund two other ways. It composes through the same helper now —
`composeSchemeLabel`, exported for exactly this, because that card resolves a row
by SCHEMECODE and must not pass its fallback through `displaySecurity`'s title
case, which renders `WhiteOak` as `Whiteoak`.

**ONE THING THIS SURFACES RATHER THAN HIDES, AND IT IS A KNOWN DEFECT.** Helios
Flexi Cap reaches this book under TWO securityKeys — the AMC folio's and the
depository's clipped one — and after this change **both read alike**, because
they are one scheme. They are still two keys, two rows and two `/stock/` pages,
and `docs/BOOK-REPORT.md` still names all eight such ISINs as the extractor join
they are. Merging them here would give a reader one tidy row and leave the
reconciler none the wiser. The suite asserts the distinction from both ends: a
twin pair with two ISINs must produce two labels, and one with a single ISIN must
produce one.

`build` · `tsc` · `test:ingest` 140 + 84 + 35 · `test:family` (a new
`schemeLabel.test.ts`, anchored on `glowData.ts` and the generated map rather
than on a fixture) · `check:family` **57/0** · `check:pages` **152 combinations
clean**, with the same two pre-existing abstentions. `npm run build-book`
regenerates the book BYTE-IDENTICALLY (md5 unchanged before and after) and
`npm run build-scheme-names --check` is a no-op — nothing here touches the
ingest, and a label change that moved a generated figure would not be one.

### Stage 10ba — 348 OF 362 MOVEMENT ROWS REACHED NOTHING, AND THE RETURN COLUMN WAS OFF-SCREEN

Three asks, and the first turned out to be already shipped while the second
needed a reader that had been silently reading 4% of what its own document
printed.

*"Where is it pending? … what is the timeline? When is the commitment expected?
Or is there something which is due in the next one month, three months, six
months?"* · *"if I'm holding a certain stock, then if I click on it, I should be
able to see that beginning of the year, this was my quantity, sold so much in
the year, this is the quantity remaining… more like an opening balance, plus
minus, closing balance. In a simple table format."* · *"Where will I get to see
holding period return? From the date of my purchase till today. Where is it —
that's the most important return… Absolute return and XIRR, both. Less than one
year equity has to be absolute. More than one year, then you should show me
CAGR… ideally, I would not want to do one more scroll. One more click on the
right side is not desirable. This 'held via' can actually hide… use that space
for showing this column in entirety. And then tax maybe just make it a click."*

#### 1. The capital-call timeline was already there, and it is verified rather than rebuilt

*(Removed since at the family's request — see Stage 10bs. What this paragraph
verified is where its figures went: Due now is a tile, the undated still-to-call
is the default tile, and the family's own upcoming calls are a column.)*

Stage 10ay shipped it about an hour before the request arrived, and its code
comments quote the same words. Verified on the current build rather than assumed:
`/private-market` carries **Due now ₹0** (measured, on the 1 of 15 accounts whose
statement prints the line), **Next 1 / 3 / 6 months** each `—` with the reason,
and **Promised, no date ₹16 Cr**, with the scheme-by-scheme table underneath
naming every fund's committed, called, invested, still-to-call, **its dated calls
and their range**, its as-of and a tie check.

**THE THREE WINDOWS ARE EMPTY BECAUSE NOTHING SCHEDULES THEM**, which is the
answer rather than a gap: no document in this archive prints a commitment-period
end date, a call notice dated ahead of its own statement, or an expected-drawdown
table. Projecting the next call from the observed cadence is the one thing that
must not happen — a forecast rendered beside fifteen measured figures reads as
the sixteenth. Nothing here was changed; this entry exists so a future session
does not rebuild it.

#### 2. The demat statements print the whole quantity account, and the reader saw 14 rows of 362

**`TXN_ROW` REQUIRED A LITERAL `CREDIT|DEBIT|CR PSB|DR PSB` TOKEN.** These
statements print it on a wrapped continuation line, or not at all — so the
pattern matched **14 of the 362 dated movement rows in the archive**, and nothing
noticed, because a transaction statement with a few rows on it looks exactly like
a quiet account. Every one of those 362 rows was in `pages.json` the whole time.
That is the **ninth** absence in this book recorded against a premise nobody
rechecked, and the second where the missing table was on a page already open.

What the statement actually prints, per ISIN: an `Opening Balance`, a run of
dated rows each carrying a **running balance**, and a `Closing Balance`. That is
the family's table, printed by the custodian, four figures and all of them
primitives.

**THE DIRECTION COMES FROM THE BALANCE, NEVER FROM A TOKEN.** The row's own
`Current Balance` less the previous one says whether units came in, went out, or
did neither — and a token wrapped onto the next line says nothing at all.
Measured across the corpus: **90 of 90 blocks walk from their printed opening to
their printed closing with zero failures**, and every particular is consistently
in, out or balance-neutral.

**A BLOCK IS PUBLISHED ONLY IF ITS ROWS WALK ITS OWN PRINTED BALANCE.** That gate
is the whole licence for showing the table — the same standing `hdfcNsdl.mjs`
needs to publish a figure read off a rendered page, and `threePFlows`' five
checks one document over. A block that does not walk has a row this reader
misread or did not see, so it carries the two balances, `null` for every movement
term and its own reason. Never a zero, which would read as a year in which
nothing moved.

| | |
| --- | ---: |
| Movement rows read | **14 → 362** |
| Holding windows carrying an opening-to-closing split | **90** |
| ...of which walk their own printed balances | **90** |
| Rows matching no known particular | **0** |
| Windows joining a position the book carries | 23 |
| ...the rest are securities the account no longer holds | 66 |

**AND THE EXCLUSION RESTS ON EVIDENCE, NOT ON THE WORD "NEUTRAL".** A pledge is
balance-neutral by construction, and that is only safe while it stays true: one
that DID move a balance would leave its units in no column, and the block would
still walk if another row happened to compensate — wrong figures, nothing
failing. The reader counts it, and prints the count **even when it is zero**,
because a guard that only speaks when it fires is indistinguishable on a clean
run from one that was deleted. Measured across all six statements: **0 of the 100
pledge / lock-in rows changed a balance.** (That sentence rides in the reader's
own warning, so it reaches `public/audit/` on the next full `npm run extract` —
the replay writes only the four fields it names, which is its whole contract.)

**FOUR TERMS, AND THE PLEDGE IS NOT ONE OF THEM.** `opening + units in − units
out + corporate action = closing`. A pledge, an unpledge or an early pay-in
earmark moves units between an account's free and encumbered balances and
**nothing enters or leaves** — 100 of the 362 rows are those — so folding them in
would report a holding at twice its size. They are COUNTED, in no column, and the
suite asserts the exclusion is load-bearing rather than describing an empty set:
**24 windows would stop reconciling if a pledge were counted.**

A corporate action is its own term for the same reason in reverse: 99 rows are
`CA-…` — a bonus, a rearrangement, a scheme redeeming its units — and folding
those into units in would report the family as having bought units nobody
ordered.

#### `npm run replay:movements` — the fourth faithful partial replay

`rekey:archive`, `build-lookthrough --reindex` and `replay:calls` are the
precedents, and the same three rules govern this one: it only ever ADDS, its gate
is struck on the ARCHIVE, and `--check` writes nothing and must be a no-op. The
replayed block must reproduce the two balances already on disk holding for
holding and in the same order, and **the tape may only GROW** — a replay that
would lose a movement refuses, which is `guardAgainstShrinkingTheArchive`'s own
rule at the document level.

It exists because `npm run extract` needs `GLOW_PDF_PASSWORDS` for eight
encrypted statements and `pdftoppm`/`tesseract` for two outlined-text ones, so a
reader change would otherwise be unlandable on most machines.

#### Three defects the arithmetic suite caught, and two were in the book layer

`src/lib/__tests__/shareMovements.test.ts` is anchored on the generated book
rather than on a fixture — a hand-written pair would prove only that two
inventions agree — and it failed four ways on the first run:

- **`r2` IS THE MONEY ROUNDER AND THESE ARE UNITS.** `shareMovementsFrom` rounded
  each term to two decimals; the statements print units to **three**, and their
  own arithmetic is exact at that precision. Bandhan Arbitrage read
  `4,011,814.06 in less 640,238.36 out` against a printed closing of
  `3,371,575.697` — **a table whose own columns do not reconcile**, by 0.003 of a
  unit, which is nothing to a reader and is the whole of what the table claims.
  `r3` now sits beside `r2` and says what it is for.
- **AN ACCOUNT EXCLUDED BY DECISION WALKED BACK IN THROUGH A SIDE DOOR.** Demat
  32387399 is the one whose three identifiers give three answers — masked PAN
  against Aarti's, a file named for a family trust whose PANs it does not match —
  so ₹8.23 Cr is excluded with the reason and is in no total. It issues a
  transaction statement like every other demat, and its window was keyed on its
  own accountId and emitted. `shareMovementsFrom` takes the REGISTRY now and
  skips any account not in it, saying how many it skipped. *(The account is
  attributed at Stage 10db, so its window is emitted under its owner now.)*
- **AND FIVE FIELDS WERE CARRIED INTO NO CALLER.** This repo's most-repeated
  defect, arriving in a component written the same hour as the comment warning
  about it: the page rendered a GENERIC "no split is published" sentence where
  `movementsReason` already named the balance the rows walked to and the closing
  the statement printed, and `rows`, `unclassified`, `security` and `isin` were
  emitted and read nowhere. The reason is the row's own now; the dated-row count
  is in the footer; an unclassified row is NAMED as counted by its balance alone
  rather than by a known event; and the statement's own spelling and ISIN ride on
  the row, which is the evidence for the join and routinely a different name from
  the page's own title.
- **AND `makeTransaction` WAS SILENTLY DROPPING THE PARTICULARS.** The reader
  built `CA-Redemption of AIF units — corporate-action, balance 0.000` for every
  row and the normalized shape had no field to put it in, so the archive recorded
  `side: "delivery"` and nothing about WHY units moved. On a trade report that is
  right — a contract note's row is a buy or a sell and `side` says which — and on
  a DEPOSITORY tape it is not: a debit is printed the same way whether a scheme
  redeemed its units, a settlement obligation was met or a bonus was credited.
  `description` is optional on `makeTransaction` now, which is the field
  `makeCashFlow` has carried for the same reason since it was written.

#### What the page shows, and the state where it shows nothing

`src/components/QuantityMovement.tsx`, above the transaction tape, because the
family asked for the quantity account first and the dated rows second.

**ALL SIX COLUMNS RENDER ON EVERY NAME, INCLUDING WHERE THEY ARE ZERO.** Drawing
the corporate-action column only where one fired would make the four printed
figures stop adding across on the names that have one — and a zero in it is a
measurement: no bonus, split, merger or scheme redemption touched this holding.
The same for a pledge, which on a family book is the figure a reader acts on:
these CDSL statements DO print the encumbrance rows, so a zero here is measured
and not the absence of a column. (Contrast the NSDL statement on `/polycab`,
which has no encumbrance column at all and correctly renders a dash.)

**AND A HOLDING WITH NO BLOCK IS THE STATEMENT SAYING IT DID NOT MOVE.** 20
positions sit in an account that issues a transaction statement and have no block
on it — DSP Gold, DSP Silver, Zaggle, Bharat Parenteral among them. Measured
rather than assumed: every one of the 89 blocks carries between 1 and 28 dated
rows and **none carries zero**, and those securities appear **nowhere** in the
document. So the page says so, names the accounts, and **invents no opening
balance**: `opening = closing` is the tempting fill and it is a figure no
statement printed, standing in a card whose every other figure was.

**WHAT THIS IS NOT, in the footer: a trade history.** A demat credit or debit
carries units and no price, no counterparty and no consideration
(`precedence.mjs`), so nothing here is a buy or a sell and no amount is shown.

#### 3. The Return column was 555 pixels off the right edge

Measured at 1500×950 before anything was moved, because the complaint was
geometric and no amount of matching text can see it: the stock page's `Position
by account` table needed **1,508px inside a 953px card**, so Avg cost, Invested,
Current, Unrealised P&L, **RETURN** and Basis were all off the right edge and a
reader had to scroll the card sideways to reach the one figure they came for.

Three moves, and the measurement afterwards is **overflow 0, no column cut**:

- **`Held via` merged into `Managed by`**, which frees a whole column. The route
  is not dropped with it — WHO CHOSE a position is the distinction Stage 10j and
  10L exist for, and the mandate link is still the only door into a manager's own
  book from this page — so both ride in that cell, and the strategy is no longer
  printed twice (the mandate LINK is labelled with it).
- **The tax card left the row and became a click.** Collapsing it in place would
  not have helped: it would still have held a third of the width. Its figures are
  untouched. *(It is on the position page's **Transactions** tab since Stage
  10cn — a tab rather than a fold, beside the dated buys its purchase dates come
  from — and the Basis column went at the same time: a dash on 368 of 371 rows.)*
- **The Return column names its measure and shows both.** `HPR` renders on every
  costed row — the holding-period return, which the family called the most
  important — and `CAGR` renders **beside it, never instead of it**, only where a
  lot register reports the purchase date and the holding is at least a year old.
  `measuredReturn` is the one place the methodology lives (Stage 10af), so the
  guard that refuses to compound a sub-year window onto a year — the +99.0%
  failure — is not re-implemented here.

**XIRR IS DELIBERATELY NOT A THIRD LINE.** It is absent for every holding in this
book for ONE reason — these statements cover the current period, so there is no
per-holding cash-flow history to solve against, and `positionIrrPct` is the
banned extrapolation that reaches +47,695% — and a dash on every row of every
name would say that 371 times. The column header states it once, and names where
the per-account XIRR lives.

#### The verification, and the two checks that could not have failed

Five routes, each walking a state the others cannot reach: `stock-qty` (the held
name spanning the most demat accounts, chosen to exercise the corporate-action
term), `stock-pledge` (a name whose window carries one), `stock-unmoved` (a name
whose statement prints no block), `stock-cagr` (the one holding whose purchase
date licenses an annual rate) and `stock` itself for the geometry. **Every
expectation is derived from `glowData.ts` on the run** — `QTY_BOOK` and
`CAGR_KEY` — and re-expressed there rather than imported from
`src/lib/shareMovements.ts`, because a check that calls the helper it is checking
agrees with it by construction.

**A MISSING PROBE IS A FAILURE, NOT AN ABSTENTION.** A route that resolved
nothing lands on a page with no table, which has no console error, no overflow
and no stray zero — it would satisfy every generic check while asserting nothing.
And the one evidenced abstention (`stock-qty`'s name carries no pledge) never
stands alone: `stock-pledge` asserts the same claim as a hard failure.

Two defects in the checks themselves, both found by reintroducing a bug:

- **THE PROBE RETURNED `null` WHERE THERE WAS NO TABLE**, so every claim about
  the no-block NOTE was unreadable and `stock-unmoved` failed a page that was
  right — the "a check that cannot read the figure it asserts on" failure this
  file already names. It reads the note independently of the table now.
- **AND A WAITER THAT MATCHES ITSELF NEVER EXITS.** `until ! pgrep -f bug.sh` is
  run from a shell whose own command line contains `bug.sh`, so it matched
  itself and reported the batch as still running long after it had finished —
  Stage 10aw's racing-waiter hazard in a new shape. The batch's own last line is
  the signal; a predicate over process names is not.
- **THE SIGN ON UNITS IN / UNITS OUT IS DECORATION AND THE ONE ON CORPORATE
  ACTION IS DATA.** Both movement columns print a MAGNITUDE under a heading that
  says the direction, so reading `−4,875.000` as part of the figure turns
  `opening + in − out` into `opening + in + out` and the identity fails on a page
  that is correct. The corporate-action column is the opposite: its sign IS the
  measurement, because a bonus and a scheme redemption share one column.

**THIRTEEN BUGS REINTRODUCED, EACH FIRING ITS OWN CHECK**: the pledge counted as
a movement, the total computed independently of its rows, the identity sentence
deleted, the window pill removed, the no-block note deleted, an opening balance
invented for a holding the statement printed none for, the `Held via` column
restored (four routes), the tax card open on arrival (four routes), the return
cell back to a bare percentage, a CAGR replacing the holding-period return, `r2`
back on a unit count (three suite cases), the registry skip removed, and the old
`TXN_ROW` restored — which refuses all six documents and exits non-zero, the
shrink guard doing its job on the original defect.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` (a new `shareMovements.test.ts`, 18 checks anchored on
the generated book) · `check:family` **57/0** · `check:pages` **160 combinations
clean** — 152 plus this stage's four routes across both themes — with three
EVIDENCED abstentions: the two pre-existing ones (this harness serves no
`/api/quotes`, and every KPI tile on this book carries a figure) and the pledge
claim on `stock-qty`, whose name carries none — which `stock-pledge` asserts as a
hard failure, so it never stands alone. `npm run replay:movements -- --check` is
a no-op and `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` BYTE-IDENTICALLY, run as a control before and after: **not
one figure in the book moves**, which is what an additive change must look like.
The ONLY generated files this touches are the six demat `document.json`s and the
new `BOOK_SHARE_MOVEMENTS` block — `BOOK_SUMMARY` is unchanged to the rupee.

### Stage 10bb — THREE REMOVALS, AND THE ONE THAT PUT TWO MEASUREMENTS BEHIND ONE CONTROL

*"open pr and do not merge until i tell you to"* · *"remove the investment
register page from the ui"* · *"give a toggle button in the direct equity daily
movers for 'direct equity/ETF & Mutual Funds', and remove the separate daily
movers for ETF and Mutual Funds"* · *"remove return attribution section from the
dashboard UI"*

Three asks, and only the middle one is a removal that ADDS something. It is also
the one with a real hazard in it, so it is recorded first.

#### 1. THE TOGGLE SWITCHES A MEASUREMENT, NOT A SCOPE

Two cards stood under the index strip and now there is one with a control:

| | |
| --- | --- |
| **Direct Equity** | a LIVE INTRADAY price against the PREVIOUS SESSION'S close |
| **ETFs & mutual funds** | a scheme's own PUBLISHED NAV against the ONE BEFORE IT |

**THEY ARE NOT TWO SCOPES OF ONE MODEL AND MUST NEVER BECOME ONE.** On this book
the second is struck on **2026-09-09** against 2026-09-08 — a week behind the
quote feed — and its rows do not even share one date, because a scheme does not
publish on a non-business day. Merging them into one model with a `scope` field
would put both under one heading and make summing them a one-line edit; that is
the defect `/api/indices` already cost this repo, where a level was differenced
against itself and the ±0.05 residual was the only tell.

So `DailyMovers.tsx` is a HOST that owns the choice and hands the control down,
and `TodaysMovers` and `NavMovers` are unchanged in substance. Each keeps its own
card title, its own as-of, its own coverage line, its own absent states and its
own ranking control. Nothing was rewritten to fit; the second card moved from
beside the first to behind it.

**THE CONTROL RENDERS IN EVERY BRANCH, INCLUDING THE FAILED ONES.** `NavMovers`
has four — loading, store-down, nothing-priced, populated — and a toggle that
disappears when the NAV store does not answer strands a reader on a card that
cannot fill with no way back to the one that works. All four take it.

**AND ONE CAPTION WAS A LAYOUT CLAIM THAT STOPPED BEING TRUE.** The NAV card's
basis paragraph read *"a different measurement from Today's movers ABOVE"* —
there is nothing above it any more. It names *the Direct Equity branch of this
card* now. The sentence it must keep is unchanged and is the load-bearing half:
**the two are never added together.**

**`?movers=` IS BACK, AND THAT IS NOT STAGE 10al RUNNING BACKWARDS.** There, four
tabs were four SETS of one model and the family removed them, so keeping three
unreachable ones alive would have left their captions, nouns, verbs and a
mutual-fund absence essay standing for a card that renders one set for ever. Here
there are TWO branches, each a whole card that is checked end to end, and the
family asked for the control. Nothing is unreachable, and the param is what lets
the sweep hold the second branch to the light rather than guess at a click.

**THE ELEVEN NAV INVARIANTS MOVED WITH THE CARD RATHER THAN BEING DELETED WITH
IT.** They lived in the `cio` block; the toggle defaults to Direct Equity, so on
`cio` that card is correctly absent and every one of them would have begun
reporting NOT CHECKED — **eleven abstentions reading as a clean run**, which is
how a check retires itself in silence. They are `NAV_MOVERS` now, assigned to a
new `cio-movers-funds` route at `/cio?movers=funds`.

**AND THE TWO ABSENCE CHECKS WERE INVERTED, NOT DELETED.** `moverScopes` was
written to prove the four tabs were GONE; it now proves this pair is THERE —
exactly two branches, Direct Equity first and live by default, the funds label
naming ETFs and mutual funds. Inverting keeps the claim honest in both
directions: a build that restored the old four-tab group fails it as surely as
one that dropped the toggle. **A missing toggle is a FINDING, not an
abstention**; only the probe failing to run abstains.

**THE FIRST DRAFT OF THE NEW ROUTE'S OWN CHECK FAILED A CORRECT PAGE**, for a
reason this file records twice for removed pages. It asserted the absence of the
string *"Today's movers"* — which the NAV card's basis paragraph prints,
legitimately, to say the two are never added. **A phrase the surviving branch
prints is not distinctive to the branch that is hidden.** It is struck on the
direct-equity card's own structural handles now (`data-mover-rank`,
`movers-coverage`, `data-mover-row`), which is the stronger claim and survives
either wording changing again.

#### 2. THE INVESTMENT REGISTER PAGE, AND THE CHECK THAT WOULD HAVE GONE SILENT

`/register` redirects to `/cio`, the nav entry is gone, and
`src/pages/Register.tsx` is deleted. **It forwards to the dashboard home rather
than to a neighbour**: the register is a COST record spanning every vehicle the
family has used, listed and private alike, and nothing that survives holds it —
pointing it at Private Market or the Monitor would assert a continuity that does
not exist, which is the call `/knowledge`, `/macro` and `/economy` already
record. The DAILY nav group survives with its other four entries, so unlike
KNOWLEDGE, RESEARCH and MONITOR there is no heading to remove, and the suite
asserts that too.

**`src/data/registerData.ts` AND `npm run build-register` WENT WITH IT.** That
module had exactly one reader, and a builder whose output nothing reads is the
dead-code-that-looks-alive failure this file keeps naming — the `exportDeck.ts`
treatment, and for the same reason. `RegisterLine`, `RegisterCostCandidate` and
`RegisterSummary` in `types.ts` went too: three interfaces describing a file that
no longer exists are that orphan one layer up.

**WHAT DID NOT GO, AND WHY.** `scripts/lib/registerRead.mjs` is the ONE reader of
the workbook and `npm run reconcile:register` still calls it, so the analysis
survives as `docs/REGISTER-RECONCILIATION.md` — the independent cross-check the
register was always allowed to be, and never a source for the book. `source/`
still holds the workbook.

**AND THE ABSENCE CHECK WOULD HAVE RETIRED ITSELF ON EXACTLY THIS CHANGE.**
`REGISTER_SENTINEL` — the register's largest not-in-book name, which must appear
on no route — was read out of `registerData.ts` inside a `try/catch`. Deleting
that module would have swallowed the read, left the sentinel `null`, and the
guard short-circuits on `REGISTER_SENTINEL &&`: **the claim becomes unfalsifiable
without failing anything**, on the very change that makes it matter most.

It is derived from the WORKBOOK now, through `registerRead.mjs` — the same reader
the reconciler uses, so a second parse cannot disagree with it. Verified against
the deleted module's own answer: `AVENDUS ABSOLUTE RETURN FUND C` at ₹7.05 Cr,
113 not-in-book names, sentinel `AVENDUS` — identical. And **`cio` now asserts
the sentinel DERIVED**, so a workbook this run cannot read is a finding rather
than a silent pass.

**THE CLAIM GOT STRONGER, WHICH IS THE POINT OF INVERTING RATHER THAN DELETING.**
`/register` was the one route allowed to name it. No route is now, so the walk's
per-page guard drops its exception and applies everywhere. The page's own five
invariants are gone, because they were about what it RENDERED and the page is not
empty — it does not exist.

**AND `docs/SOURCE-COVERAGE.md` IS DELIBERATELY NOT REGENERATED, WHICH IS WORTH
STATING RATHER THAN LEAVING TO BE FOUND.** `source-coverage.mjs` attributed the
workbook to "the `/register` page (`npm run build-register`)" and now attributes
it to the reconciler alone — the generator is fixed. The DOC is not, because
regenerating it here would have rewritten a provenance record with a worse one:
`source/_extracted/` is gitignored and derived, and the unzipper available on this
machine **drops `__MACOSX/` resource forks**, so the run reported `Not a document:
0` against the committed `58` and 260 leaf files against 318. The counts that
matter — 252 read, 2 held out, **0 unread** — reproduce exactly. This is the
hazard this file already names in as many words (*"a pipeline whose document count
depends on who unzipped is not idempotent"*), so the fix rides in the generator
and lands the next time the doc is regenerated where the forks survive.

#### 3. RETURN ATTRIBUTION, AND WHAT GOES WITH IT

`ReturnAttribution.tsx` is deleted and Morning CIO no longer renders it.

**WHAT WENT WITH IT IS NAMED RATHER THAN GLOSSED, because this is not Stage
10t.** There, the Book performance card was removed and *not one of its figures
was* — every one was already elsewhere on the page. Here the four-term bridge
(opening → price / trading / bought in / sold out / not split → closing), the
ranked contributors and detractors, and the per-account windows are **NOWHERE
ELSE**. The family asked for the section and that is their call; what this file
owes them is not pretending the figures survived. Only the manager-year table has
a home: `/performance` renders `BOOK_ACCOUNT_RETURNS` per account and per window,
which is where the card's own footnote already pointed.

**`BOOK_ATTRIBUTION` STAYS, AND SO DOES `src/lib/attribution.ts`.** The first is
GENERATED — removing it from `build-book` would rewrite `glowData.ts`, which is a
re-measurement of the book rather than a UI change anyone asked for. The second
is kept on two grounds rather than sentiment: it is that data's presentation half,
and its suite is **the only thing that checks the generated bridge ties** — and
`attribution.test.ts` also carries the chain-linked NAV-series assertions (that
the series starts before the panel is complete, that the extension is
load-bearing, that the raw line is undefined until the panel completes) which the
chart above it still depends on. Deleting the module would have taken those with
it. Its header says plainly that nothing renders it, so it is a DOCUMENTED
no-caller — the `series.ts` treatment — and not the silent orphan a future
session wires back believing it load-bearing.

**AND `ATTRIB_BOOK` WAS TRIMMED AND RENAMED, BECAUSE ITS NAME STOPPED BEING
TRUE.** It carried the card's expectations (the ranked contributors, the covered
fraction, the accounts with no priced row) AND the NAV chart's (the series' span,
the panel completion, the book's return chained two ways). The first set lost
every reader with the card, so those fields are deleted rather than left
computing the right answer into no caller, and the constant is `NAV_SERIES_BOOK`
— a constant that misdescribes what it carries is the caption failure one layer
down, where every caller inherits it. Same treatment `nonEquityValue` →
`unaccountedValue` got at Stage 10as.

**THE NINE CARD INVARIANTS BECAME ONE STRUCTURAL ABSENCE**, and the probe was
inverted rather than deleted — the `moverScopes` precedent. It is struck on the
card's own handles and deliberately NOT on the words "return attribution": that
phrase appears legitimately elsewhere in this app, so a text match could report
the card gone while it was on screen. **The old probe returned `null` when the
bridge was missing, which is exactly what `FAST` returns** — so "the card is
gone" and "the probe did not run" were the same value and every invariant reading
it would have abstained rather than failed. It returns `{ handles }` now: `null`
did not run, `0` ran and found nothing.


#### Ten bugs reintroduced, and the tenth could not fail

Each was put back on its own, rebuilt and swept, with the harness restoring **by
copy on a `trap … EXIT` and rebuilding on the way out** — one of these files is
NEW and therefore untracked, and `git checkout --` on an untracked file silently
does nothing, while restoring the source alone leaves `dist/` at the bugged build
for the next run to report under the wrong name. A no-patch CONTROL ran first.

| Bug put back | Fires |
| --- | --- |
| the toggle deleted, Morning CIO rendering one card again | **15 invariants across 3 routes** — the toggle checks on `cio` and `cio-live`, and all eleven NAV ones plus the branch check on `cio-movers-funds` |
| the default branch flipped to funds | 4 on `cio`, 9 on `cio-live` |
| BOTH branches rendered at once | the branch check on `cio-movers-funds` |
| a third scope added (the old four-tab group creeping back) | the toggle checks on `cio` and `cio-live` |
| the NAV card stops saying the two are never added | that invariant, at its NEW address |
| the register sentinel cannot derive | "the register sentinel derived" |
| a register name leaked onto Morning CIO | the walk's absence guard, by name (`…names AVENDUS from it`) |
| the attribution card's handles back on the page | "the return attribution card stays removed" |
| the register nav entry restored | `check:family` — "the Investment Register nav entry is gone" |
| **the `/register` redirect deleted** | **NOTHING — see below** |

**THE FIRST BUG IS THE ONE WORTH THE PASS.** Deleting the toggle leaves the
eleven NAV invariants FAILING rather than abstaining, which is what says moving
them to `cio-movers-funds` kept them biting. Left on `cio` they would have gone
quietly NOT CHECKED against a card that is correctly not drawn there — eleven
abstentions reading as a clean run.

**AND THE LAST ONE IS THE FINDING.** With the explicit `/register` route removed,
`path="*"` falls through to `RootRedirect`, which lands on `/cio` — so the
redirect row still PASSED. That is the `/industry` finding this file already
records, arriving through a catch-all instead of a chain: **what this suite reads
is where a bookmark LANDS**, and by that measure the promise is kept either way.
The row stays as it is rather than being rewritten into something that would have
to pass anyway; what the explicit route buys is INTENT, which a catch-all does not
state. It is named beside the row rather than left to be discovered.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` · `check:family` **61/0** (57 plus this change's four
register assertions) · `check:pages` **160 combinations clean**, with three
evidenced abstentions. `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` BYTE-IDENTICALLY (md5 unchanged before and after) —
nothing here touches the ingest, and three UI removals that moved a generated
figure would not be three UI removals.

**THAT COUNT IS MEASURED ON THE MERGED TREE AND THE ARITHMETIC RECONCILES, WHICH
IS WHY IT IS RE-RUN RATHER THAN CARRIED ACROSS.** This branch's own pre-merge
sweep was **152**, and unchanged from its base: `/register` left the walk (two
combinations) and `cio-movers-funds` joined it (two). Stage 10ba then landed on
main with four new `stock-*` routes — eight combinations — so the merged tree is
160, and its third abstention is that stage's own pledge check, not one of this
one's.

#### Merged with main, and both predicted conflicts arrived on cue

Stage 10ba landed while this branch was open, so the merge hit exactly the two
things this file already tells a future session to expect — **for the fifth time
each**:

- **THE LETTER COLLIDED AGAIN.** Both branches wrote `### Stage 10ba`. Main's
  merged first and **keeps it**, as at 10al, 10as, 10at and 10aw; this section is
  `10bb`, and the six cross-references elsewhere in this file that named it moved
  with it — checked one at a time, because three others on those same lines
  belong to main's stage and must NOT move.
- **AND THE `ctx` LITERAL AUTO-MERGED, WHICH IS WHEN IT IS MOST DANGEROUS.**
  `check-pages.mjs` hands its invariants ONE object literal, and git produced the
  union without conflicting: this branch's `attrib`, `moverScopes` and `movers`
  beside main's `qtyTable` and `posTable`. Verified by READING it rather than by
  trusting that git did not complain — every key was then confirmed defined
  exactly once, because a key naming a variable that no longer exists throws
  inside the check and is reported as a broken matcher rather than as a clean
  page.

**AND THE GENERATED FILES WERE CHECKED RATHER THAN ASSUMED.** `glowData.ts` came
across as a straight take-theirs (+1,625 lines of `BOOK_SHARE_MOVEMENTS`, which
this branch never touched) and `docs/BOOK-REPORT.md` with it, so there was
nothing to splice — and `npm run build-book` was run afterwards as a control
anyway and regenerated both byte-identically. A generated file that merges
WITHOUT conflicting is exactly the case this file says to re-derive.

### Stage 10bc — THE NAV IS REARRANGED, AND ONE REMOVAL BREAKS A CHAIN THIS FILE HAD KEPT FIVE TIMES

*"change the hierarchy of these pages, Morning CIO then Portfolio Monitor and
then Private Market and then Polycab"* · *"remove exposure and IPS page from the
dashboard UI"* · *"move data audit page at the bottom of the left navigation bar
just above upload page selection button rather than at the top"* · *"Move the
following page buttons inside a drop down option in the left navigation bar
labelled as 'Extras' and after clicking on the drop down we should be able to
select any of these page buttons."*

Four asks, all about the left nav. Three are layout. The second is not, and it
goes first here because it is the only thing in this change a reader could be
hurt by.

#### 1. EXPOSURE & IPS — AND THE FIRST REMOVAL THAT LEAVES THE FAMILY NO WAY BACK

**IT WAS THE LAST READER OF THE FAMILY-INPUT STORE, AND THAT WAS MEASURED
BEFORE ANYTHING WAS TOUCHED.** Three modules had exactly one runtime importer
between them and it was this page: `familyInputs.ts` (the IPS targets, the
bucket mapping, the theses, the alert rules, the deal register, the household
balance sheet — **and the one-file Export/Import**), `alertEngine.ts`
(`bucketActuals` / `bucketWeightPct`) and `marketCap.ts` (the bands). Nothing
else imports any of them; `familyMath.test.ts` asserts all three and renders
none.

**EVERY EARLIER REMOVAL IN THIS FILE KEPT A PATH TO WHAT THE FAMILY TYPED, AND
THIS ONE DOES NOT.** Stage 10f removed the Family Dashboard and Private Markets
and kept the deal register and balance sheet reachable *through this page's
export*. Stage 10w removed Watchlist & Targets and left `watchlist.ts` written
by `InvestmentTools` on every company page. Stage 10y removed Thesis & Triggers
and Alerts and forwarded both *here*, in as many words, because this was "the
only surface that reaches a stored thesis or alert rule". Five times the answer
was the same and it was never an accident: **Stage 10's own reasoning for
building the export at all** is that `localStorage` alone is not good enough,
because "a cleared browser would lose them with no way back".

That is exactly what is now true. Nothing was deleted — every entry is still in
`localStorage` and still correct — and there is no longer a screen that shows
it, exports it or takes it back. **The family were shown that trade, in those
terms, and asked for the removal outright with nothing relocated.** It is their
record and their call; what this file owes them is not pretending the cost was
zero, which is why it is the first paragraph of this section rather than a
footnote in it.

**SO THE THREE MODULES STAY AS DOCUMENTED NO-CALLERS**, the `series.ts` and
`attribution.ts` treatment and never the SILENT orphan this file keeps naming.
Each says at its own definition that no screen reads it, so a future session
knows before it goes looking; `familyMath.test.ts` still asserts the arithmetic,
which is what stops them rotting while nothing renders them; and re-wiring means
importing from them again with nothing about them to change first.

**`src/components/Preview.tsx` WENT, AND THAT IS THE OPPOSITE CALL FOR THE
OPPOSITE REASON.** This page imported exactly ONE of its seven exports
(`PreviewBadge`); the other six were already uncalled. With that last caller
gone the whole 152-line module had none — no data, no test, no reader — which is
the dead-code-that-looks-alive failure rather than a store worth keeping, so it
got the `exportDeck.ts` treatment. **The preview CONVENTION it implemented is a
rule about what a greyed sample may never do, and a rule lives in this file
rather than in an uncalled component**; the section at the top says so now.

**`/exposure` FORWARDS TO SECTOR COMPOSITION, AND `/thesis` AND `/alerts` DO
NOT FOLLOW IT.** The bulk of what this page DREW was a sector table over company
shares — mandate-chosen and own-bought alike — and Sector Composition draws that
same set on that same axis through the same `isCompanyShare`, so it is the
surviving surface nearest its purpose rather than a neutral fallback. A thesis
and an alert rule are not exposure: they are things the family TYPED, and
nothing surviving holds one. Sending them on to a sector table would assert a
continuity that does not exist, so both are **REPOINTED at the dashboard home
rather than chained** — the `/watchlist` fix of Stage 10ap, and the case
`check-family-inputs.mjs`'s own `/industry` row records it cannot catch, because
two hops land where one does and that suite reads only where.

**AND ITS ALLOCATION GROUP SURVIVES, WHICH MAKES THIS THE OPPOSITE OF THE LAST
THREE PAGE REMOVALS.** MONITOR, KNOWLEDGE and RESEARCH each lost their heading
because the entry removed was the last in the group. Family & Entities and
Sector Composition are still here, so a heading that vanished would be a second
bug rather than the removal working — and the two are asserted as separate
claims for exactly that reason.

#### 2. Three layout changes, and one mechanism that did all three

The nav headings are DERIVED from each entry's `group`, so a group whose last
entry leaves stops rendering on its own. That is what retired MONITOR at Stage
10y, KNOWLEDGE at 10x and RESEARCH at 10ap, and it is why two of these three
asks are a reordering of one array and nothing else:

| | |
| --- | --- |
| **Daily** | `/cio` → `/monitor` → `/private-market` → `/polycab`. Polycab led this group on an earlier request and closes it now. **Nothing about the ring-fence moves with it** — `RINGFENCED_SECURITY_KEYS` in `build-book.mjs` is what keeps the promoter block out of every other route's figures, and a nav position never was |
| **Allocation** | `/family` → `/sectors`, Exposure & IPS removed from between them |
| **Extras** | the four that were the whole of TAX and ANALYTICS, so both headings go with their entries |
| **Admin** | `/audit` → `/history`. Data Audit was the only entry in SETUP, so that heading goes the same way — and it is now immediately above Upload History, at the bottom, which is both halves of what was asked |

#### 3. The dropdown, and the two things it has to do that a plain group does not

**IT OPENS ITSELF WHEN THE ROUTE IS INSIDE IT.** A reader following a link or a
bookmark to `/performance` would otherwise land with Extras shut and **no active
entry anywhere in the nav**, which reads as the page having left the app. The
set it checks against is derived from `NAV` rather than typed, so a fifth entry
added to Extras keeps that working with no second list to remember.

**AND IT IS SEEDED FROM THE ROUTE IN THE `useState` INITIALISER, NOT OPENED BY
AN EFFECT AFTERWARDS.** An effect alone paints the group collapsed for one frame
and then springs it open — and that first frame is precisely the one with no
active entry in it. `pathname` is read before the initialiser runs, so the first
paint is already right; the effect only has to cover navigating in later.

**REMEMBERED PER BROWSER, EXACTLY AS THE NAV WIDTH BESIDE IT IS**, and for the
same reason: it is a per-reader convenience and nothing about the book. A
blocked or cleared store just means it opens on its own terms again.

**A COLLAPSED GROUP IS `display:none` RATHER THAN UNMOUNTED**, which is a
decision the checks depend on: the four entries stay in the DOM, so a check can
assert WHICH pages the dropdown holds without clicking anything, while what a
reader can actually reach is measured off the box. Reading membership alone
would report a dropdown that never opens as working — which is one of the twelve
bugs below, and it fires.

#### The claims are struck on the nav's own structure, never on its labels

Three of the four asks are about WHERE things sit rather than what they say, so
`data-nav-group`, `data-nav-entry`, `data-nav-group-toggle` and `aria-expanded`
are what `check:family` reads. Order and grouping asserted on rendered prose
would be a structural claim resting on text a redesign is free to reword — the
rule `data-section`, `data-mandate` and `data-movers-scope` already follow, and
the one a check retires itself by breaking. **A probe that read nothing is a
FAILURE and not a pass**: every claim here is struck on one array, so an empty
one would let all of them through by asserting over no input.

**AND THE NAV BLOCK RUNS BEFORE ANY OTHER `goto` IN THAT SUITE, WHICH IS
LOAD-BEARING.** The dropdown remembers itself and opens itself on a route inside
it, so a walk that had already visited `/ledger` would leave it stored open and
"starts collapsed" would be asserted against a state the suite itself created.

**THE TWO CHECKS THAT LOST THEIR SUBJECT WERE INVERTED, NOT DELETED.** What
stood on `/exposure` read the family's seeded bucket mapping back off the page
and counted the Export and Import BUTTONS — the second struck on the buttons
rather than on `/export/i`, because deleting the button while leaving the
paragraph that explains it had once left the prose version green. Neither has a
subject now, so the claim that replaces them is the absence, asserted three ways
and none implying another: the nav entry is gone, the address forwards to Sector
Composition, and the page's own content renders nowhere.

#### Twelve bugs reintroduced, and one of them crashed the suite instead of reporting

Each was put back on its own, rebuilt and run, with the harness restoring **by
copy on a `trap … EXIT` and rebuilding on the way out** — restoring the source
alone leaves `dist/` at the bugged build for the next run to report under the
wrong name. Eleven fired exactly their own checks: the Daily order reverted; the
Exposure entry restored (two, from two directions); Data Audit back at the top
in SETUP (two); Extras reverted to a plain group; Extras starting open (three,
because the first click then CLOSES it); the toggle wired to nothing; the
auto-open removed; one entry left outside Extras at top level; the `/exposure`
redirect deleted; `/thesis` chained back through it; the removed page's own
wording injected onto its destination; and the structural handles removed, which
fails the probe rather than silently passing everything struck on it.

**THE TWELFTH IS THE FINDING.** Reverting Extras to a plain group failed its two
rows correctly and then **aborted the whole suite**: `.click()` threw on a
locator matching nothing, and every row after it never ran — including *"a page
behind the Extras dropdown still renders"*, which is the half a reader would
actually be hurt by. A missing toggle is a FINDING, not a crash, so those two
rows now fail by name and the rest of the file runs. Re-run against the same
bug, it reports instead of aborting.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 1,349 across 25 suites · `check:family` **81/0** (61
plus this change's twenty nav assertions) · `check:pages` **158 combinations
clean**, with **two** evidenced abstentions rather than the three of Stage 10ba:
the third was the market-cap band reconciliation, which could only ever bind
against a live quote feed and which went with the page that drew it.
`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after — nothing here touches the
ingest, and a nav rearrangement that moved a generated figure would not be one.

**THAT SWEEP COUNT IS 160 LESS THE TWO COMBINATIONS THE `exposure` ROUTE WALKED,
AND IT WAS RE-MEASURED RATHER THAN SUBTRACTED.** Every stage above states a
count against a base that has since moved; this one happens to reconcile, and it
reconciles only because the sweep was run again.

### Stage 10bd — THE DRILL-DOWN IS THE TABLE, AND THE FOUR TILES WERE THE SECOND SURFACE

*"remove the top 4 KPI tiles from the UI and remove the highlighted text… fix
the search bar at the top of the table, it is very small."* And: *"same in
listed and private tabs."*

Three changes to `/holdings`, and the second is the one with an audit in it.

#### 1. The four tiles printed four figures the footer already totals

Market value, Invested, Unrealised P&L and Return on cost sat above a table
whose footer totals all four — **each under the heading of the column it
totals**, which is the stronger surface of the two and the one this repo settled
on when the allocation footer carried a money-weighted figure in a column of
returns on cost. So the tiles were a second rendering, and the family have asked
for the table to be the page.

**THE SECOND HALF OF THE ASK NEEDED NO SEPARATE WORK, AND IT IS WORTH SAYING
WHY.** *"same in listed and private tabs"* — the listed and private halves are
FACETS of one page rather than pages of their own (Stage 10v), so there was one
component to change and the check that asserts the tiles are gone is spread into
**every** `holdings-*` route rather than the two that were named. A build that
kept them anywhere kept them everywhere.

**TWO OF THE CAPTIONS WERE THE LAST STATEMENT OF A FACT ANYWHERE**, and both are
on the headline rather than in a hover, because the footer cannot carry either:

- **THE COUNTS** — `358 holdings · 202 names · 32 accounts`, which is what
  Morning CIO's own Positions and Distinct names reproduce. The footer counts
  **grouped** rows, so a name held in four folios is one there and four here; it
  can never state them.
- **THE DEDUPE BASIS** — whether a holding two members both carry is counted
  once or twice, which is **₹3.17 Cr** on this book. It was a pill (Stage 10ao),
  then this page's table subtitle, and it is four words under the figure now, at
  the weight the pill had.

#### 2. The subtitle paragraph — four claims, and only one had no consequence

The grey block under *The holdings behind it*, audited claim by claim before a
word went, the Stage 10aa / 10ai / 10ap method:

| The claim | Where it is now |
| --- | --- |
| Weight is within this set, not within the book | the footer's Weight cell hover, on the column it is about |
| the DEDUPE BASIS | four words under the headline figure — see above |
| N closed positions are not listed | the footer's row-count cell hover |
| N holdings under ₹1,000 are dropped, ₹X in total | the same hover |

**THE LAST TWO ARE COUNTS OF ROWS THE TABLE DOES NOT DRAW, so they belong on the
cell that counts what it did** — beside the `N filtered out and not counted here`
that cell already carried. That is also the treatment the **Portfolio Monitor**
gives the identical two facts, at the family's own instruction (Stage 10ax), so
the two screens now say the same thing in the same place rather than one in prose
and one in a hover.

**A HOVER IS WEAKER THAN A CAPTION AND THAT IS RECORDED RATHER THAN GLOSSED.** A
reader scanning does not hover. Four facts moved into one — the cost coverage,
the closed count, the floor and the return's basis — and what it buys is the
screen the family asked for. The one thing NOT moved into a hover is the pair
above, because a count and a dedupe basis are what every other figure on the page
is struck over.

**AND THE COVERAGE IS WORDED ONCE, IN `Foot`, AND READ BY BOTH CELLS THAT NEED
IT.** `49 of the 358 holdings report a cost and 49 report none, ₹164 Cr of the
value` was the Invested tile's caption AND the reason the Return cell beside it
refuses a figure — so a second wording is a second chance for the two to describe
different sets, which is the failure `costCoversSet` was extracted for one screen
over.

#### 3. The filter box was squeezed to a third of its width, and that is geometry

*"fix the search bar at the top of the table, it is very small."* Reproduced
rather than guessed at: `w-56` is a width on a **flex item with nothing stopping
it shrinking**, and the paragraph beside it was a paragraph — so the box
collapsed to about a third of its stated width and clipped its own placeholder to
**"Filter b"**, which is what the family's screenshot shows.

**REMOVING THE PARAGRAPH ALONE WOULD HAVE HIDDEN IT RATHER THAN FIXED IT.** A
long enough title brings it straight back. `shrink-0` is the fix; `w-72` is the
request.

**AND IT IS CHECKED ON GEOMETRY, BECAUSE NO AMOUNT OF MATCHING TEXT CAN SEE IT.**
The page renders the same words at 250px and at the 100-odd it was squeezed to,
and every text and figure invariant on this page passed the whole time the
placeholder read "Filter b". The bound is **the placeholder's own rendered width,
measured in the page in the input's own font**, plus the padding the box spends
before a character is drawn — so it stays true if the wording, the type scale or
`--app-zoom` changes. A literal pixel count would be a number nobody could check.

#### Where the sweep had to move, and the one clause that could no longer fail

`drilldownTotal` read the `MARKET VALUE` **tile** and `tileValue` read the other
three, so ~26 call sites pointed at figures that no longer exist. Every one was
re-homed rather than dropped:

- **`drilldownTotal` reads the HEADLINE**, anchored on the share-of-book line
  beneath it — not on a bare `₹… Cr`, which the top bar prints on every route.
  The two-source claim is unchanged and not weakened: the headline is summed over
  the set's ROWS and the footer over the GROUPED rows, so *"the footer ties to the
  headline"* is still two aggregation paths rather than one figure compared with
  its own copy.
- **`tileValue` is replaced by `footCell`**, which reads `ctx.footerCells` — a
  probe that already existed, accumulated by `colSpan`. That is `lib/table.mjs`'s
  own rule (**match on the column, never on a token position**) arriving in the
  sweep: the previous text version walked past the label's span and would have
  read Invested the first time that span moved. Reintroducing exactly that — the
  footer's label no longer spanning two columns — fires six invariants.
- **The reasons are read off `ctx.titles`**, because a `title` is not in
  `innerText`. That is the same fix the cost-cell reasons already needed.

**AND ONE CLAUSE BECAME UNFALSIFIABLE ON THIS CHANGE.** `holdings-unknown`
asserted the not-found page does not silently fall back to the whole book, and
one of its three tests was `!/MARKET VALUE/` — a tile label that is now gone from
every drill-down, so the clause could never fail again and would have been three
words of cover over a page that had started falling back. It reads the headline's
own handle (`data-hb-total`) instead.

**TWO NEW CHECKS ASSERT THE RE-HOMING, because a removal and a re-homing are two
claims and neither implies the other.** A build that dropped the headline caption
with the tiles satisfies every absence check above and loses the counts and the
basis in silence. `the headline states its counts and its dedupe basis` is struck
on the **handle and the text together** — `drilldownCounts` parses the rendered
line and `ctx.drilldown` reads the attributes, and a page where those disagree
would make half the drill-down invariants describe a set the other half does not.
And `...and the footer still totals the columns they printed` requires a figure or
an honest em dash in each of the four, never a blank: a build that deleted the
tiles and the table's totals together would satisfy the absence and lose four
figures.

**AND THE SUBTITLE CHECK DELIBERATELY DOES NOT BAN EVERYTHING THE SUBTITLE
SAID.** It is struck on the two sentences only that paragraph ever printed — the
weight denominator and the automatic floor — and NOT on the dedupe basis or the
closed count, both of which it also carried and both of which survive elsewhere.
A check that banned those would fail the page for keeping the facts the family
did not ask to lose.

#### Seven bugs reintroduced, each firing its own check

Each was put back on its own, rebuilt and swept, with the harness restoring **by
copy on a `trap … EXIT` and rebuilding on the way out** — restoring the source
alone leaves `dist/` at the bugged build and the next run reports the previous
bug's failures under the next one's name.

| Bug put back | Fires |
| --- | --- |
| the four tiles restored | the tiles-removed check, on all six drill-down routes |
| the subtitle paragraph restored | the subtitle check, on all six |
| the headline caption deleted | the new counts/basis check on six, **plus five pre-existing ones** — Positions and Distinct names, the listed half's own count, the per-account basis on `holdings-measured`, its account count, and the costed set's — which is what says the re-homing kept them biting |
| the footer cells' hovers stripped | the whole-book return's cause, the return's basis, and the three absent totals on the no-cost page |
| the row-count cell's hover stripped | the closed count and the floor count |
| `w-56` without `shrink-0` | the filter box fits its own placeholder, on all six |
| the footer's label stops spanning two columns | the footer totals check on six, and two more that read Invested and Return by column |

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 18 suites · `check:family` **81/0** · `check:pages`
**158 combinations clean**, with the same two evidenced abstentions Stage 10bc
records. The count does not move because this change adds no route — it would
have meant a route appeared somewhere nobody looked.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after: nothing here touches the
ingest, and a presentation-layer removal that moved a generated figure would not
be one.

### Stage 10be — THE TABLE READS FIRST, AND A DEFINITION IS ONE LINE

*"show the table first and the formula section below it."* · *"do not show
lengthy explanations in the private market terms… just tell what is it in short
and legible font text."* · *"remove the highlighted text from the dashboard ui."*

Three asks on three screens. The first is layout; the other two are the same
instruction arriving at two different walls of prose, and each needed the audit
this file has run five times now — check every claim for a second home, move what
has none onto the figure it describes, delete the rest, assert both.

#### 1. The derivation was standing between the reader and the rows

`/holdings?of=measured` drew **How this is worked out** above **The holdings
behind it**, so a reader who clicked a figure to see the holdings behind it met a
formula first. The card moves below the table: the table is what the page IS, and
the derivation explains the figure in the HEADER, so it reads as a footnote to
the page rather than a preamble to it.

**NOT ONE WORD OF IT CHANGED, WHICH IS WHY NO EXISTING CHECK COULD SEE THE
MOVE.** Both cards print the same text either way round, so every text and figure
invariant on this route passed the whole time. **A claim about ORDER is
geometry**, and it is struck on the two cards' own bounding boxes — the same rule
the headline's inline layout, Export Excel's row and the KPI overlay anchor
already follow. Both ends are found STRUCTURALLY: the derivation by a
`data-hb-derivation` handle, the table by its own `data-hb-foot`. Matching either
card by its TITLE would make a layout claim rest on prose a redesign is free to
reword, which is how a check in this sweep retires itself in silence.

**A MISSING CARD IS A FAILURE, NOT AN ABSTENTION.** This route is the one page in
the app that draws both, so "I could not find them" means one of them is gone.

#### 2. Six definitions that ran to three paragraphs each

Private Market's tiles grew their definitions when the client asked what two of
them meant (Stage 10aq) — and the answer ran 600–900 characters a tile, in
**11px `slate-500`**, under figures rendered at 22px. So the text explaining the
hardest word on the page was the least readable thing on it.

**THE SECOND INSTRUCTION NARROWS THE FIRST RATHER THAN REVERSING IT.** They still
want to know what the term IS — *"just tell what is it"* — so WHAT IT IS stays on
every tile, at one or two short sentences, and the METHODOLOGY goes. Measured:
**101–140 characters a tile, at 12.5px.**

**AND THE METHODOLOGY WAS ALREADY ON THE PAGE, WORD FOR WORD.** That is what made
the cut safe rather than merely shorter — checked before anything was deleted:

| What the paragraph carried | Where it already was |
| --- | --- |
| "summed exactly as printed, never worked out as committed − called" | the working line under the capital-account table, beside the rows it sums |
| "Called and Invested cover different sets and must not be subtracted" | the same working line, at greater length |
| "why it is a floor" — the account coverage | the tile's own **sub-line**, and the card below it |
| how the distributions figure is arrived at | the tile's own sub-line — *"N of M capital accounts publish a distribution figure"* IS the method |

**FOUR CLAIMS HAD NO SECOND HOME AND EVERY ONE STAYED**, because each is
something a reader acts on and none of them is guessable from the figure:

- **uncalled is in no total on this page** — a LIABILITY sitting in a row of
  market values, which is the one thing a reader could otherwise get wrong;
- **Called must never be subtracted from Invested** — they sit side by side,
  which is exactly where a reader subtracts;
- **Invested (paid in) is not the same set as Capital invested above** — two
  tiles on one page with almost the same name;
- **distributions are not part of the value above and do not reduce what a fund
  can still call** — both of them, on the tile, at nineteen words.

**THE SIZE MOVED IN `StatTile`, NOT PER CALLER.** Every hint in this app is the
same thing in the same place — a definition of the figure above it — and a size
chosen per page is a size that drifts. Four other pages get the same legibility
with no change to their words.

**AND AN ABSENT TILE'S HINT IS NOT A DEFINITION AND MUST NOT BE CUT.**
`absentTile(reason, hint)` names the document that would fill the gap, which this
book requires to be COMPLETE rather than brief — Realised gain runs 206
characters and the TVPI/DPI refusal 442, both correctly. **The first draft of the
brevity check failed on exactly those two**, which is how the distinction was
found rather than reasoned: the bound now applies to tiles carrying a FIGURE, and
the two are told apart by `data-stat-value` rather than by their words. The SIZE
floor still covers both — a reason is no easier to read at 11px than a definition.

#### 3. The NAV card's subtitle, cut to a basis line

Stage 10al removed four paragraphs from this card and moved the rebase clause
INTO the subtitle; the family are now pointing at the subtitle. It ran four
sentences, and the audit found **three claims with no second home that a reader
acts on all three of**:

- **the window and the point count** — the range note under the chart names the
  INDEX's window, which is a different and much longer one;
- **the coverage** — a reader comparing this line to an index has to know how much
  of the book it measures, and the `<details>` below names the 38 accounts that
  CANNOT supply a series, which is the complement rather than the figure;
- **the rebase** — the y-axis reads 84 / 91 / 98, a RATIO and not an amount, so
  without it those ticks are unitless and the chart quietly stops saying what it
  is measuring. This file already records it as the one sentence of the earlier
  block that had to land somewhere rather than go.

So the subtitle is **one line** carrying those three, which is the removal the
family asked for; the METHODOLOGY — how a point is struck, how the panel grows —
went to that line's own hover. **A hover is weaker than a caption and that is
recorded rather than glossed.**

**AND THE PANEL INVARIANT WAS RE-HOMED, NOT DELETED.** Its own comment says the
panel is the one thing no figure on the card discloses, so the check follows the
fact to the hover and still derives both ends and the completion date from
`NAV_SERIES_BOOK` — it fails by name if the series ever reverts to starting where
the panel completes, which is the regression it exists for.

#### Eight bugs reintroduced, each firing its own check

Restored by COPY on a `trap … EXIT` and **rebuilt on the way out**, because
restoring the source alone leaves `dist/` at the bugged build for the next run to
report under the wrong name.

| Bug put back | Fires |
| --- | --- |
| the derivation card above the table | the order check, struck on geometry |
| the uncalled tile's three paragraphs | the brevity/legibility check **and** the paragraphs-removed check |
| the hint back to 11px `slate-500` | the brevity/legibility check |
| the distributions tile cut to its bare definition | the distributions check — SHORT, and no longer honest |
| the uncalled tile stripped of "in no total on this page" | the uncalled check |
| the NAV subtitle paragraph restored | the basis-line check |
| the NAV hover deleted with it | the methodology check **and** the panel check |
| the rebase clause dropped from the subtitle | the rebase-basis check |

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 18 suites · `check:family` **81/0** · `check:pages`
**158 combinations clean**, with the same two evidenced abstentions. The sweep
count does not move because this change adds no route.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after: nothing here touches the
ingest, and three presentation changes that moved a generated figure would not be
three presentation changes.


### Stage 10bf — THREE TABLES BECOME ONE CARD WITH A TOGGLE, AND THE ABSENCE CARD GOES

*"open PR and do not merge until i tell you to."* · *"in the private markets Page
there are three separate sectioned tables, making the pages very lengthy. Add a
toggle button in the first table itself to switch the table view between the
three rather than scrolling every time."* · *"remove the highlighted section from
the dashboard UI"* — the last card, screenshotted.

#### 1. The three tables are three VIEWS of one set, and that is why they collapse

`Funds this family holds`, `Folio by folio` and the per-owner rollup bolted under
the second were **three renderings of the same private holdings**, stacked one
under the other, and between them they were most of the page's length. They are
one card now with a `By fund · By folio · By owner` toggle, at `?view=`, and only
the active one is in the DOM.

**IT IS A VIEW SWITCH IN THE SENSE THE MONITOR'S `?group=` AXIS IS, AND
DELIBERATELY NOT THE SHAPE OF `DailyMovers`' TOGGLE.** That one keeps two whole
cards apart because it switches between two different MEASUREMENTS taken on
different days, and merging them would make summing them a one-line edit. These
three are one measurement grouped three ways, so one card is the honest form.

**WHAT MUST NOT BE FLATTENED IS THE BASIS, AND IT IS THE WHOLE REASON THIS IS
THREE VIEWS RATHER THAN ONE TABLE WITH A GROUPING KEY.** This is the one screen
where the whole of this book's double count lives — 360 ONE Special
Opportunities under two CRNs, Transition Venture Fund I under both trusts — and
the three are not on one basis:

| View | Basis | Adds to |
| --- | --- | ---: |
| By fund | CONSOLIDATED — each `dedupeGroup` once | ₹352.35 Cr |
| By folio | RAW — every statement exactly as printed | ₹355.52 Cr |
| By owner | RAW — each member's own statements | ₹355.52 Cr |

***THE FOLIO VIEW IS A ROW EXPANSION SINCE Stage 10bq***, at the family's
request — *"why are there two different toggle switch for fund and folio"* — and
the basis table above is unchanged by it: the fund ROW is still consolidated and
the lines under it are still every statement as printed. PM-1 moved with the
table it reads, onto the expansion, which is a better home than the view it came
from: the consolidated figure, the statements behind it and the gap between them
are one CLICK apart instead of one TAB apart.

So each view keeps its OWN card title, its own subtitle and its own footnote
naming the basis it is on. A single title over all three would be the
caption-does-not-describe-its-figure failure this page has already paid for once;
one table with a grouping key would be worse, because it would make putting all
three on one basis a one-line edit and **either direction of that is wrong** —
a raw sum once put ₹1.46 Cr into a consolidated NAV twice, and deduping a
per-owner breakdown once emptied a member's row for an account holding ₹1.46 Cr.

**THE DEFAULT IS BY FUND AND IS ASSERTED TO BE.** It is the param-free one, it is
the consolidated basis, and it is the table the family's own screenshots were
taken of. A default is the change that moves silently: the page renders perfectly
on any of the three and the other two count two holdings twice.

**THE TOGGLE RENDERS IN EVERY VIEW**, never only in the default — a control that
disappears once a reader has used it strands them on the branch they switched to.
Same rule `DailyMovers` needed for its loading and absent branches.

**THE SEARCH BOX IS OFFERED ONLY WHERE IT NARROWS SOMETHING.** It filters FUNDS,
so it is on the fund view and nowhere else; the other two carry their own row
count instead. A box that filters nothing is the control-that-looks-alive failure
this file keeps naming, and the top bar's dead `<input>` is its own precedent.

**AND THE PER-OWNER BLOCK GAINED A HEADER ROW.** It was four unlabelled columns
under a `label-xs` caption; as a view of its own it gets the header and footer
the other two have, because a column of figures a reader cannot name is not a
table.

#### 2. The absence card, audited claim by claim before it went

*"remove the highlighted section from the dashboard UI."* `What this book does not
carry, and what would fill it` — eight dashed entries — is deleted.

**NOT ONE OF ITS EIGHT ENTRIES WAS A FIGURE**, which is the cleanest possible
removal and is what made this one a paragraph of work rather than a section of
it. They named absent STRUCTURES — a fund-of-funds TVPI, a cap table, a private
valuation series, a fund's sector — which is exactly the shape Stage 10al removed
once already as Morning CIO's roadmap panel: *"a chip named a feature that does
not exist, so there was nothing on it to move and nothing a reader could act on."*

Audited anyway, one entry at a time, because that is what this file requires:

| The entry | Elsewhere? |
| --- | --- |
| No PE / pre-IPO / unlisted / debt-fund structure | no — and it names no figure; the six empty arrays are a fact about the MODEL, recorded in the page's own header comment and in Stage 10m |
| No startup or direct-company register | no — same shape |
| No look-through into what a fund holds | no — same shape |
| No valuation history for any private holding | no — **and its premise had gone stale**: "two dated portfolio values per account is not a series" is the sentence Stage 10p measured and overturned for the book at large |
| **No realised gain on any private account** | **YES — an `absentTile` in the strip above, with the same reason and a fuller hint** |
| **No forward drawdown schedule from any fund** | **YES — the capital-call card's own footer, word for word, which PM-4d already holds to** |
| No sector for a fund | no — and Sector Composition's own `Not a company share` partition card names the class with its value |
| No money-weighted return on the private book | no — same shape |

**THE TWO THAT A READER ACTS ON ARE THE TWO THAT WERE ALREADY THERE**, and both
are now asserted as SURVIVING the removal. That is the half a removal like this
breaks quietly: a build that deleted the card and the absent tile together
satisfies the absence check and loses a measurement.

#### 3. The checks moved to the views that draw them, and none was softened

PM-1 and PM-6 assert this book's ₹3.17 Cr from opposite ends, and each reads a
table that is no longer on the default route. **They moved rather than being
weakened into something the fund view can satisfy** — a check that stops running
because a table went behind a toggle is a check that silently stopped, which is
this file's most-repeated finding about its own sweep.

- **`private-market-folios`** carries PM-1, and the move made it STRONGER. It
  now reads the printed total off the table's own FOOTER, the overlap and the
  consolidated figure off the SENTENCE under it, and checks that consolidated
  figure against the KPI TILE — three renderings rather than two, so a view that
  quietly deduped its own rows fails on one side and one that mis-states the
  overlap fails on the other.
- **`private-market-owners`** carries PM-6, likewise: the rows add to their own
  footer (the rollup groups the statements, the footer sums them — two paths over
  one set), the sentence names that same total, and it is DIFFERENT from the
  consolidated one it names beside it.
- **`pmViewChecks(expected)` is a FACTORY run by all three routes**, parameterised
  on the one thing that differs — which view the address asks for. Written once
  on the default route it would not catch a toggle that renders on
  `/private-market` and vanishes the moment a reader uses it, which is the exact
  failure the control is written to avoid.

**STRUCK ON THE CONTROL AND ON WHICH TABLE IT DREW, NEVER ON THE LABELS.** "By
fund", "By folio" and "By owner" are the three bases this page discusses in prose
and in its own card titles, so a text match cannot tell a rendered button from a
sentence about one. And **one table at a time is the whole of what shortens the
page**: a build that kept all three stacked and merely added a control renders
every figure correctly, reconciles perfectly and satisfies every other check
here — only a count of the rendered tables can see it. A MISSING TOGGLE IS A
FINDING, not an abstention; only the probe failing to run abstains.

#### Eight bugs reintroduced, each firing exactly its own check

Restored by COPY on a `trap … EXIT` and **rebuilt on the way out** — restoring the
source alone leaves `dist/` at the bugged build and the next run reports this
bug's failures under the next one's name, which this file has measured once.

| Bug put back | Fires |
| --- | --- |
| all three tables stacked, the control filtering nothing | the one-table check on **all three routes** |
| the default view moved to By folio | **6 on `private-market`** — the default check by name, plus the redeemed-fund, PM-2, PM-5 and PM-8 checks that read the fund table |
| the toggle deleted outright | the view check on all three routes, as a FAILURE rather than three abstentions |
| the absence card restored | the card-stays-removed check |
| the realised-gain tile's reason deleted with it | the absences-survive check |
| the folio footer printing the consolidated total | PM-1, on the folios route |
| the per-owner rollup computed off the deduped set | PM-6, on the owners route |
| the double-count sentence deleted from the folio view | PM-1 |

**AND ONE PATCH FAILED TO BUILD AND WAS REPORTED AS NOT A RESULT.** Gating the
double-count sentence on `{false && …}` makes `m` possibly-null downstream and
`tsc` refuses it; the harness reports a failed build as a failed PATCH rather
than as a clean sweep, which is the only reason it was not read as bug 8 passing.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 18 suites · `check:family` **81/0** · `check:pages`
**162 combinations clean** — 158 plus this change's two routes across both themes
— with the same two evidenced abstentions Stage 10bc records. `npm run build-book`
regenerates `glowData.ts` and `docs/BOOK-REPORT.md` BYTE-IDENTICALLY, run as a
control before and after: nothing here touches the ingest, and a layout change
that moved a generated figure would not be a layout change.

### Stage 10bg — ONE CATEGORISATION FOR BOTH TABLES, AND THE TRANSACTIONS CARD STOPS HAVING ITS OWN

*"the format of the transactions page and the holdings page is very different,
when the user switches from holdings default page to the transactions there's a
lot of difference in the format and different categorization names and methods.
Make sure that the transactions page matched the … categorization as in the
holdings page, and by default the transactions show from newest to oldest. Paid
in/Taken Out filters should be renamed as buys and sells, remove the
categorization 'What I invested / Direct Equity / Manager trades / Trades by
member / Full trade list' replace it with what is in the holdings — 'Category /
Asset class / Basket', don't put security categorization filter in transactions.
And the toggle switch of recent first/largest first… remove longest first filter.
UI of both the pages should be standardized so it is not confusing and easy to
use for the user."*

**THE FIVE TABS WERE NOT FIVE OF ANYTHING.** That is the whole diagnosis, and it
is why this is a regroup rather than a rename: they mixed two SOURCES with three
GROUPINGS and a raw list, in a vocabulary no other screen used.

| The tab | What it actually was | What it is now |
| --- | --- | --- |
| What I invested | a different SOURCE — `BOOK_CAPITAL_MOVES`, the family's own dated capital | the **Capital in and out** card, sectioned on the shared axis |
| Manager trades | the tape grouped by MANDATE | a PMS mandate is one row of the **Trades** card, in the PMS mandates section |
| Direct Equity | the tape FILTERED to the family's own accounts | the Direct Equity SECTION, reached through the Holdings table's own section filter |
| Trades by member | the tape grouped by OWNER | the **All entities** filter, which was already on the row above |
| Full trade list | the raw dated rows | a row's own expansion, and `/audit`, which prints each statement's rows as printed |

**SO NOTHING A READER PICKS DECIDES WHICH RECORD THEY ARE LOOKING AT ANY MORE**,
which is what made the strip confusing: "What I invested" and "Manager trades"
are not two views of one thing, they are two different measurements, and the
tabs presented them as alternatives. Both are on screen together now, each in its
own card, under ONE set of controls.

***THEY WERE ONE CARD WITH A TOGGLE AT Stage 10bi AND ARE ONE TABLE SINCE
Stage 10bo***, at the family's request both times — *"it should be exactly one
single simple table just like in the holdings"*, then *"just remove the toggle
button and show everything within the same table."* The sentence above still
holds and is why neither is the five-tab strip returning: the strip mixed two
SOURCES with three GROUPINGS and a raw list, and what is on screen now names the
two sources as two COLUMN BLOCKS and nothing else. Every reason below for keeping
the two APART is unchanged and is why the COLUMNS are two blocks rather than one
— the money must never be added, and Stage 10bo measures what adding it would
cost.

**AND THE GROUPING IS THE HOLDINGS TABLE'S OWN.** `?group=` is shared: a reader
who has sliced the holdings by basket crosses to the transactions already sliced
the same way. The axis control moved out of the Holdings-only branch onto the row
both views share, so the first four controls on Transactions are now character
for character the first four on Holdings — the pick-list, All entities, the axis,
the section filter.

**THE SECURITY AXIS IS ABSENT BY TYPE, NOT BY AN OMITTED BUTTON.** Everything in
`src/lib/txnAxis.ts` takes a `GroupAxis` — the three ALLOCATION axes — rather than
the Monitor's four-key `MonitorAxis`, so a transactions table sectioned by
security would not compile. It files every holding in ONE section by design
(`SECURITY_SECTION`), so a table built on it would draw a single heading over
everything and mean nothing. A reader arriving on `?group=security` lands on
Category and the control SAYS so: `activeAxis` is what lights a button, and
comparing against the raw param lit nothing at all.

#### Two cards, because one account publishes both records

**THE TWO SOURCES MUST NEVER SHARE A FOOTER, AND THAT IS MEASURED RATHER THAN
FEARED.** A contribution moves money INTO an account; a trade moves it about
INSIDE one. Measured over the committed archive: **11 accounts publish a dated
capital record, 10 issue a transaction statement, and
`green-lantern-capital-llp-510861` publishes BOTH** — so a combined total
double-counts it by construction. Two cards, two footers, one set of controls
and one set of sections. *(ONE card since Stage 10bi and ONE TABLE since
Stage 10bo, where the two footers became two COLUMN BLOCKS in one footer, each
summed down its own column. The measurement was re-taken for both changes — and
at 10bo on the RENDERED PAGE, which found THREE overlapping accounts rather than
the one this paragraph names: `loadTransactions` applies `AUTHORITATIVE`, which
names SVAN's investor report for transactions too, and a count taken over
`transaction-statement` documents alone cannot see them.)*

**AND THE CAPITAL RECORD WAS NOT REMOVED WITH THE TAB IT SAT ON.** It is the only
surface in this app that carries the family's own dated capital across every
funded account, and **eight of its eleven rows are FUND FOLIOS** — the five Sanshi
accounts, both Transition Venture trusts and 3P — whose own `/mandate/:accountId`
page nothing links to (Stage 10ai measured that and removed the link on purpose).
Dropping it would also have re-broken the thing Stage 10am fixed: the family went
looking for the 3P redemption *"anywhere in the transactions page under sell
side"*, and the Holdings page's closed-position note was removed on the explicit
grounds that the fact now lives here.

#### `src/lib/txnAxis.ts` — the join, and the type that made it honest

`groupKeyFor` still answers which section a record lands in. This is the JOIN
that lets a dated record reach it: a trade names its account by the two fields
its statement prints (provider + number) where `groupKeyFor` wants an
`accountId`, and carries the class the STATEMENT printed rather than the book's.

**`Classifiable` NAMES THE THREE FIELDS THE TAXONOMY ACTUALLY READS** —
`{ assetClass, securityKey, accountId }` — and every signature that took a
`Position` now takes that. A `Position` satisfies it, so no holdings caller
changed. The alternative was to build a `Position`-shaped object around the three
real fields with zeros in the money columns, which is a fabricated figure one
refactor away from being rendered.

**AN UNSTATED CLASS IS PASSED THROUGH, NOT SHORT-CIRCUITED — and the first cut
got that wrong, which is what reading the rendered page found.** `Txn.assetClass`
is null where the statement said nothing: **22 of this book's 691 tape rows**.
Returning `TXN_UNSECTIONED` on a null looked obviously right and drew **Carnelian
Bespoke Portfolio TWICE** — once under PMS mandates and once under a heading
saying nothing knew what it was — because **20 of those 22 rows are inside a PMS
mandate, where the class decides nothing**: `holdingBucket` answers on the
engagement alone and both family axes key a mandate on its ACCOUNT. `groupKeyFor`
already answers correctly for a null; letting it is the fix, and it needed
`holdingBucket` to name the absence (`UNSTATED_BUCKET`) instead of returning it.

The remaining two rows are in an AIF folio, and for those the class is taken from
the BOOK's own position for that (account, security) — joined on identifiers,
never on a name. One row survives even that: a Buoyant Class A1 subscription in a
class the family no longer holds, so nothing in this book says what it is. It
gets its own section with its own reason, which is what an absence gets
everywhere else here.

#### A row is what the Holdings table's row is, per section

`rollup(..., "auto", ...)` rolls a trade up to its MANDATE where a discretionary
manager chose it and to its SECURITY everywhere else. That is not a new rule —
it is the two behaviours the `Manager trades` and `Direct Equity` tabs already
had, applied per row instead of offered as a choice, and it is exactly how the
Holdings table builds its rows (Stage 10L lifted the mandates out into one row
each and left everything else per security). So Carnelian Bespoke Portfolio is
one row on both tables and Fractal Analytics is one row on both.

**THE SECTION IS PART OF THE GROUP KEY**, so a group can never span two sections
and be summed into both. A mandate group cannot anyway — one account, one section
— but a SECURITY group can: the same name traded in two accounts whose
engagements differ is two sections on the category axis.

#### The two renames, and the mode that was deleted rather than hidden

**`Paid in` / `Taken out` → `Buys` / `Sells`.** The control carried two
vocabularies, which was defensible on its own terms (a family movement has no buy
and no sell) and was half of the "different categorization names" being pointed
at. One pair of words now, on both tables — and the capital table's columns follow
it to `Bought` / `Sold`, because a column headed "Paid in" narrowing when a reader
clicks "Buys" is the same mixed vocabulary one row down. What a movement IS stays
exact where exactness belongs: the Type column inside an expanded row prints the
statement's own word (`Subscription`, `Drawdown`, `Full Units Redemption`).

**`Longest held` IS DELETED FROM THE UNION, NOT HIDDEN.** Left in `TXN_SORTS` and
merely not rendered, `sortRows`'s `held` branch would be a mode nothing can
select — dead code wearing a confident explanation. Removing the id makes
reintroducing it a type error, the treatment the fabricated Economy `Row` fields
got. `Sortable.first` came out with it: a field a type declares and nothing reads
is the same dead weight one layer up.

**Recent first was already the default** (Stage 10az) and is asserted rather than
assumed — a default is the change that moves silently.

#### The layout, and why it was two scrolling cards rather than one page scroll

`position: sticky` resolves against the nearest SCROLLING ancestor, so two
sticky headers in one page-level scroller pin at once and overlap. The capital
record was bounded (`max-h`, in **rem** and never `vh` — a viewport unit is not
rescaled by `--app-zoom`, Stage 10n) and the trades table took the rest with
`min-h-0 flex-1`, which is exactly what the Holdings card beside it does.

***THE HAZARD WENT WITH THE SECOND CARD AT Stage 10bi*** and has not come back
at 10bo: one table means one sticky header, and it simply takes the card
(`min-h-0 flex-1`), so the bound came off. The `vh` rule is unchanged and still
governs every bounded box in this app.

**A FIGURE IN A SECTION HEADING CARRIES ITS OWN NOUN.** `₹34 Cr` beside
`3 accounts` reads as the section's VALUE and is what was paid IN; the trades
heading's figure is what was BOUGHT. Both say which — the
caption-does-not-describe-its-figure failure this page has already paid for
twice, arriving in a heading.

#### What this change deliberately did not keep, said plainly

**THE RAW TAPE IS GONE**, and its own reason — *"a reconciliation against a PDF
needs the printed rows in printed order, which no rollup can stand in for"* —
was checked before it went. It survives on the surface that actually serves it:
`/audit` prints each transaction statement's extracted rows document by
document, in the order the statement printed them, which is what a reader
checking a figure against a PDF opens. A row's own expansion carries the same
dated rows per security, in the reader's chosen order.

**AND THE THREE GROUPINGS ARE NOT REACHABLE BY URL EITHER.** `manager`,
`entity` and `instrument` stay in `txnRollup.ts` because `auto` is defined in
terms of two of them and because the fixtures exercise all three — but nothing
selects one, which is the opposite of the `?movers=` call at Stage 10al and for
the same reason it was made there: a param nobody can reach from the page is
dead code, and these are not params at all.

#### One expression of "the axis the visible table sections on"

`activeAxis` — the raw `?group=` on Holdings, the resolved one on Transactions —
is what the axis CONTROL lights and what its option list and labels are built
from, because a control has to describe whichever table is visible. Each TABLE
sections on its own axis: Holdings on `groupAxis`, Transactions on `txnAxis`.

Those are two different jobs and conflating them is a real defect, measured —
see the crossing below. What keeps the control and the table from offering a key
the other cannot match is `setView`, which clears the section when the resolved
axis moves, exactly as `setGroupAxis` already does when the axis itself does.

#### Fifteen bugs reintroduced, and FOUR of them produced a clean sweep

The harness restores **by copy on a `trap … EXIT` and rebuilds on the way out**
— two of the files it patches are new and untracked, where `git checkout --`
silently does nothing, and restoring the source alone leaves `dist/` at the
bugged build for the next run to report under the wrong name. A patch that does
not apply, or a build that fails, is reported as NOT A RESULT rather than as a
clean run; two were, and were rewritten and re-run.

Eight fired their own check immediately: the five-tab strip restored, the trades
table not sectioned, the capital record not sectioned, the side labels back to
two vocabularies, the default order back to largest-first, the section filter
not applied to the tape, the same filter not applied to the capital record, and
the axis control lighting the raw param (which leaves no button selected at all
on `?group=security`).

**THE THREE THAT DID NOT ARE THE POINT OF DOING IT**, and each closed a gap:

- **A HIDDEN CONTROL READS EXACTLY LIKE A VISIBLE ONE.** `document.querySelector`
  finds a `hidden` element, so every claim about the axis control stayed green
  over a card that no longer offered it. `axisControl` measures its own box now
  — the geometry rule this sweep already applies to the headline, to Export
  Excel's row and to the KPI overlay anchor.
- **A FOOTER THAT ALSO COUNTED THE CAPITAL RECORD.** The check compared the two
  footers against each other, and 462 + 121 is still not 26. The claim that
  catches it is the one `rollupTotals` is built on: the footer is summed FROM
  the rows it draws. Asserted on the default route now, not only one level down.
- **AND THE DEFECT THIS CHANGE ACTUALLY HAD.** The unstated-class short-circuit
  drew Carnelian Bespoke Portfolio in two sections at once and nothing saw it —
  it was found by READING THE RENDERED PAGE. *"No mandate is drawn in more than
  one section"* is the claim, scoped to mandates because a SECURITY may
  legitimately split: the same name traded in two accounts whose engagements
  differ is two rows by design, where a mandate is one account and therefore one
  section on every axis.

**AND A FOURTH:** reintroducing plain per-security grouping
in place of `auto` was also clean, because every figure on the card is identical
either way — the same trades, the same totals — and only the ROW UNIT changes.
That is the whole of what "matched the categorization as in the holdings page"
means for a row, so it is asserted on the BOOK: the PMS section can never draw
more rows than this book has PMS accounts, and every row in it must be a
mandate. A per-security build draws two hundred-odd.

#### And one latent defect the change itself introduced, found by reading it

Sharing the section filter between two views made a state reachable that had not
existed: the two resolve `?group=security` differently — Holdings sections on it,
Transactions falls back to Category — so on that ONE axis, crossing between them
changes which key the filter is testing. A key carried across matches no row, on
a page that renders perfectly, with the select HIDDEN on the Holdings side so
the reader cannot clear it.

`setView` clears the section ONLY where the resolved axis really moves (dropping
it on every flip would undo the sharing this change is for), which is
`setGroupAxis`'s own rule arriving through the other control.
`monitor-axis-crossback` walks it, because every state it passes through is
individually correct and only the CROSSING is the defect.

**AND THE CHECK FOR IT TOOK THREE GOES, EACH CORRECTED BY MEASUREMENT RATHER THAN
BY REASONING.** "The table is not empty" was the obvious claim and it is FALSE of
the defect: the section filter runs BEFORE the derived-only rows are added, so
590 companies that only a fund holds survive it and the table looks populated
while its MEASURED value reads **₹0**. It is struck on the footer's Market value
now — through `COL_STOCK`, because this route lands on the security axis, which
draws two more columns and would have put the assertion on `Via funds`.

**AND IT EXPOSED A SECOND ONE, IN THE SAME LINE.** The holdings row filter had
been moved to the RESOLVED axis along with the control, so the row memo's answer
depended on a value its dependency list does not carry — measured, it served a
stale Direct-Equity subset of the book under a hidden filter. The row build
sections on `groupAxis` whatever the other view is doing; only the CONTROL reads
`activeAxis`, and `setView` is what keeps the two from disagreeing.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 18 suites · `check:family` **81/0** · `check:pages`
**168 combinations clean**, with two EVIDENCED abstentions — every KPI tile on
this book carries a figure, so the absent-tile claim has no subject, and no row
on the one page that checks it carries a pledge. **MEASURED ON THE MERGED
TREE**: this branch's own pre-merge run was 164, which is 158 plus the three
routes it adds (`monitor-txn-basket`, `monitor-txn-secaxis`,
`monitor-axis-crossback`), and Stage 10bf landed on main while it was open with
two more. 164 + 4 reconciles here, and it reconciles ONLY because the sweep was
re-run — every other stage in this file states a count against a base that has
since moved.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after: nothing here touches the
ingest, and a regroup of two tables that moved a generated figure would not be a
regroup.

### Stage 10bh — THREE BUTTONS, FOUR TILES A READER PICKS, AND EVERY TABLE ARRANGES

*"open PR and do not merge until i tell you to."* Three asks, and the third is a
change to fifty-odd tables at once, so each one below records what it replaced
rather than only what it added.

#### 1. The crumb names the FIGURE, and the back link becomes three buttons

*"add three small back reverse and home buttons on the top of every page. The
first line 'Morning CIO > What is Behind this Figure' should rather label the
page/KPI tile that we have opened 'Morning CIO > Current Value of Holding'.
Remove 'Back to Morning CIO' and replace it with the three small buttons. Follow
this format for every single page that we Open."*

**"WHAT IS BEHIND THE FIGURE" IS A DESCRIPTION OF THE ROUTE, NOT OF THE PAGE.**
`/holdings` serves ELEVEN different sets — the value of the holdings, the capital
invested, one allocation row, the accounts carrying an opening value, the
winners — and it read that one sentence for every one of them. A reader who
clicked a tile and wanted to know which tile they were inside learnt nothing.
`Drilldown.crumb` names the figure, so the crumb says which of the eleven this
is: `Morning CIO › Current Value of Holdings`.

**AND THE FACET IS A THIRD SEGMENT, which the new pairing check is what found.**
`?of=book&facet=listed` read "Current Value of Holdings" where the reader had
clicked **Listed** — the crumb naming the scope and not the slice, which is the
caption-that-widens failure arriving in a breadcrumb.

**"BACK TO MORNING CIO" WAS A HARDCODED PARENT ON FOUR PAGES, and on three of
them it was routinely wrong.** A company page is reached from Sector
Composition, from Family & Entities, from a holdings drill-down and from the
Monitor — and it offered a link to the Monitor whatever the reader had come
from. The browser's own history knows, and these three buttons ARE that history:
BACK and FORWARD walk it, HOME goes to the front door. The parent still shows,
as the crumb's first segment, which is a statement about where the page SITS
rather than about where the reader was.

**FORWARD IS DISABLED ONLY WHERE THAT IS MEASURED.** React Router keeps its
position in `window.history.state.idx`; where that is readable the button greys
once nothing lies ahead, and where it is not, both stay live rather than being
greyed on a guess — a control that looks live and does nothing is the failure
this file keeps naming, and so is one that looks dead and works.

**HOME POINTS AT `/`, NOT `/cio`.** `RootRedirect` is the one place that knows
whether the book is empty; hardcoding the cockpit would land an unfed book on a
gated page.

**THE CRUMB IS BUILT FROM `src/lib/nav.ts`, WHICH IS THE SIDEBAR'S OWN TABLE.**
`NAV` moved out of `Sidebar.tsx` so both read it: two tables would be two chances
for the crumb to file a page under a different group than the nav does. It
immediately retired four stale `eyebrow` strings that had drifted from the nav
they were written to echo — and the INLINE EYEBROW is gone with them, because a
page that renders "where am I" twice on adjacent lines is answering the question
twice. `eyebrow` survives only as a fallback crumb parent for a route `NAV` does
not list (`/upload`).

#### 2. Four tiles, and the reader says which four

*"There are 9 KPI tiles on the private market page, make it 4 and give the user a
dropdown list to select what they want to see in each of those 4 KPI tiles, Give
option for every single metric the user might want to see and they will select
the one's that they want to see. Also add a small + button on the last 4th KPI
tile so the user can also increase the no. of KPI tile and add a new one on the
page as per their requirement."*

***THE `+` IS A TILE OF ITS OWN SINCE Stage 10cl*** — *"a big empty tile with
bold written: ADD TILE"*, in the grid cell where the next tile will land, on
both strips, and clicking it offers the metrics not on screen rather than
appending the first of them. Everything else in this passage is unchanged.

`src/components/SelectableTiles.tsx`. Private Market's twelve fixed tiles become
**four slots out of an eighteen-metric catalogue** — value, cost, P&L, uncalled,
committed, called, paid, due now, unvalued, distributions, realised, multiple,
funds, folios, owners, accounts, calls, raw — each carrying the VALUE, SUB-LINE
AND HINT the fixed tile had, verbatim. Nothing was rewritten to fit a picker.

**`?tiles=` WINS OVER THE STORE, AND THE STORE IS `localStorage`.** It is a
preference about a screen, like the nav's width and the Extras group's open
state, so it never reaches `glowData.ts` — and every read and write is wrapped,
because the accessor throws in a private window and a blocked store must leave
the strip rendering its default four rather than rendering nothing.

**THE PICKER IS A MENU BUTTON AND DELIBERATELY NOT A `<select>`.** Chromium's
`innerText` returns EVERY option's text of a native select, so eighteen metric
labels landed in the page text of a card showing four — and **twelve
private-market invariants failed at once** on a page rendering perfectly. The
menu renders its options only while open.

**AND A REMOVED CHECK WOULD HAVE GONE QUIET, so it was re-homed rather than
deleted.** `check:family` asserted the unvalued capital's claim by matching that
TILE's label; behind a picker, a metric outside the default four is one the page
legitimately does not draw, and the check would have failed a correct page. The
claim is on the CARD under the table — with more behind it, the accounts and why
each is unvalued — so it is struck there, and the METRIC's continued existence
is asserted separately by opening the strip on it. Neither implies the other.

#### 3. Every table sorts, and every column but the first moves

*"Every single table on the dashboard must have clickable column headings to sort
the table data, and also every single column except the first name one, the user
should be able to drag and drop to rearrange columns, make this standardized for
every table anywhere on the dashboard."*

**`src/lib/tableView.ts` AND `src/components/SortHeader.tsx` — ONE DEFINITION FOR
ALL OF THEM.** Fifty-odd tables, so a per-table implementation would be fifty
chances for one screen to sort nulls one way and another the other; this repo has
paid for that shape of drift with `holdingBucket`, `costCoversSet` and
`companyExposure`. A table gets both halves by DECLARING its columns.

**THE DECLARED ORDER IS THE ONE THE CELLS ARRIVE IN, AND IT IS NEVER REWRITTEN.**
`<Tr view>` takes a row's `<td>`s exactly as the table has always written them
and permutes them into the reader's order; `<TrFoot>` does the same for a footer
and computes its label's span from the order rather than from a literal. So no
table's cell JSX changes, and with nothing dragged the permutation is the
IDENTITY — the rendered markup is what it was, which is what keeps every
column-index assertion in `check:pages` reading the column it was written
against. Measured: **the whole sweep was clean at every step of the rollout**,
which is the design goal rather than a happy result.

**THE FIRST COLUMN IS FIXED, BECAUSE THE FAMILY SAID SO** — *"every single column
except the first name one."* It is the row's identity, and `move`/`nudge` refuse
it as a SUBJECT and as a DESTINATION.

**AND AN ABSENT VALUE SORTS LAST IN BOTH DIRECTIONS.** Not as zero, and not as
negative infinity: a statement that reports no cost has not reported a small one.
`txnSort` already sorts an unreported amount last rather than among the smallest,
and sorting them to the TOP on ascending would put every holding whose custodian
sends no cost at the head of a table about cost. A NaN sorts with the absent, and
the sort is stable on the original index — so a third click, which CLEARS it,
returns the table to the order its own page chose (largest first, newest first,
the statement's own), which is routinely meaningful rather than arbitrary.

**`SortableTable` IS THE SEAM FOR A PANEL INSIDE A ROW.** `useTableView` is a
hook, so a table drawn once per opened row cannot call it where its JSX sits. The
hook lives in a component at a stable call site and the arrangement arrives as an
argument — the panel's markup stays where it is rather than being lifted out.
Every open panel of one kind shares a storage key, which is the right behaviour:
a reader who moves a column on one tranche panel means it for the next one.

**THE PORTFOLIO MONITOR'S OWN SORT WAS REPLACED, NOT LEFT BESIDE THIS ONE.** That
table carried a `sortKey`/`asc` pair driving SIX clickable headers out of
fourteen. Two mechanisms on one table is two answers to "how is this ordered", so
`SortKey`, `sortBtn`, `effSort` and the local `Th` component are gone — the
`exportDeck.ts` treatment. The memo keeps its DEFAULT ranking (largest first, or
largest total exposure on the security axis), which is exactly what a cleared
sort returns to, and `COL_COUNT` is `holdView.order.length` now rather than a
literal `16 : 14` that had to be kept in step by hand.

**AND ROWS ARE RANKED WITHIN THEIR SECTION, NEVER ACROSS.** Sorting across would
break the sectioning the holdings and transactions tables exist to share. A
section is a partition of one list, so a ranking inside each is the same ordering
the old mechanism produced.

**`data-table-static` IS AN EXEMPTION A TABLE DECLARES, WITH ITS REASON.** Nine
carry it and each is one of three kinds: an upstream financial document rendered
as the source published it (screener's tables, the ratio grid, the cash-flow
statement, a fund's own returns row, the audit spreadsheet viewer), a TRANSPOSED
table whose columns are metrics rather than fields, and a fixed list of facts.
Sorting a balance sheet's year columns would scramble a document rather than
rearrange a view. An exemption keyed on the table's own declared reason cannot
drift the way a list of names in the checker would, and a table that simply
FORGOT the handles has no reason to declare — it fails on the count.

#### The three defects the mechanism had, each found by driving it rather than reading it

- **THE `<thead>` WAS NOT PERMUTED.** A keyboard move reordered the body and left
  the headings still — every figure under the wrong heading, which is the one
  outcome this feature must never produce. `<Tr>` serves the header row too now.
- **`innerText` BLOCKIFIES THE CHILDREN OF A FLEX CONTAINER**, so an
  `inline-flex` heading put its icon and its label on separate lines — and this
  sweep reads a header row as one tab-joined line in around a hundred places.
  Measured: `/as of.*capital in.*marked on this date/` matched nothing on a
  header rendering perfectly. There is not one flex box in that cell now, and the
  icon takes its side from DOM ORDER.
- **THE HTML RENDERING SPEC GIVES FORM CONTROLS `text-transform: none`**, so a
  `<button>` inside a `label-xs` heading rendered its label in the source's own
  case while the cell around it was uppercase — and four Polycab invariants slice
  the page on uppercase header text. Measured in the browser
  (`th` `uppercase`, `button` `none`) rather than reasoned about; the sort button
  repeats `uppercase`.

#### Six bugs reintroduced, and the sixth produced a clean sweep

`monitor-arrange` is a route that CLICKS and MOVES, because the global check
asserts every heading CARRIES the controls and cannot see whether either does
anything: a sort button wired to nothing renders exactly like one that sorts.

| Bug put back | Fires |
| --- | --- |
| the sort button wired to nothing | the reorder check, and the direction check |
| the keyboard move does nothing | the permutation check, and the footer check |
| the `<thead>` left unpermuted | the permutation check |
| a move clears the sort as a side effect | "the sort survives the move" |
| the fixed first column made movable | the global table check, by name, and the fixed-column check |
| **the footer's label span frozen at a literal** | **nothing, at first — see below** |

**TWO OF THEM EXPOSED CHECKS THAT COULD NOT FAIL, which is the whole reason for
the pass.**

- **THE SORT CHECK WAS STRUCK ON ONE CLICK, AND THIS TABLE ARRIVES ALREADY
  RANKED ON THAT COLUMN.** The first click lands on the order the page was in, so
  a working button and a dead one draw the identical table. It clicks TWICE now
  and the assertion is struck between the two — the second click steps the
  three-state machine to ascending, which must reverse it.
- **AND THE FOOTER-SPAN CHECK ASSERTED A RANGE RATHER THAN THE CLAIM.** `span >=
  1 && span <= columns` is true of a literal 3. Worse, the move the walk made
  could not have distinguished it: `qty` and `avgCost` both sit INSIDE the
  leading run of columns with no total, so the span is 3 before and after. The
  walk now also moves `invested` — the FIRST column that HAS a total — to the
  front, which shortens the run to 1, and the check expands the footer PER COLUMN
  and requires the cost total to sit under Invested and a descriptor column to
  carry nothing. Re-run, the literal fires.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 18 suites · `check:family` **82/0** · `check:pages`
**172 combinations clean** — 170 plus this change's own route across both themes
— with three EVIDENCED abstentions: every KPI tile on this book carries a figure
so the absent-tile claim has no subject, nothing on Morning CIO publishes an
undefined drill-down address, and no row on the one page that checks it carries a
pledge. `npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control: nothing here touches the ingest, and three
presentation changes that moved a generated figure would not be presentation
changes.

### Stage 10bi — ONE TABLE BEHIND A TOGGLE, AND A COLUMN PER RETURN

*"open PR and do not merge to main until i tell you to."* · *"why are there two
separate tables in the transactions page, it should be exactly one single simple
table just like in the holdings."* · *"remove the highlighted text from the
dashboard UI"* — the five return-methodology paragraphs, screenshotted. ·
*"Whenever we select multiple return profiles to see on the dashboard it should
add a new return column rather than show all returns in the same return column
side by side… a new column with that return name should be made, and also
removed when we select or deselect returns."*

Three asks, and the last two turned out to solve each other: **ask 3 built the
home for what ask 2 removed.**

#### 1. Two stacked tables become one card with a toggle

Stage 10bg put both dated records on screen together, each in its own card — the
right answer to *"stop having a categorisation of its own"* and, the family now
say, one card too many. So it is ONE CARD, ONE TABLE, A TOGGLE: the Holdings
card's own shape, and the shape `/private-market` (Stage 10bf) and Today's movers
(Stage 10bb) already use.

**WHAT IT MUST NEVER BECOME IS ONE TABLE OVER BOTH RECORDS, and that is measured
on this book rather than feared.** Re-measured for this change rather than taken
from the prose above it:

| | |
| --- | ---: |
| accounts publishing a dated capital record | **11** |
| accounts issuing a transaction statement with dated trades | **10** |
| **publishing BOTH** | **`green-lantern-capital-llp-510861`** |

So a shared footer counts that account's money twice **by construction**. And
they are different MEASUREMENTS — a contribution moves money INTO an account, a
trade moves it about INSIDE one — with columns that do not line up: Capital
carries How it went in, Value today, Gain, Return and Invested on; Trades carries
Trades, Securities, Realized P&L and Traded between. **Four of ten are shared.**

Each branch therefore keeps its OWN card title, subtitle, columns and footer, and
`?record=` makes a branch a link. `capital` is the default and stays param-free:
it is the family's own money, and it is where the Holdings page's closed-position
note already points a reader looking for where a redemption went (Stage 10am).

**EACH BUTTON PRINTS ITS OWN ROW COUNT** — the `/holdings` facet-chip pattern, so
a reader sees what the other branch holds before switching. 11 accounts against
26 trade rollups here, and the two being DIFFERENT is asserted, because a toggle
advertising one number twice has stopped reading one of them.

**AND THE ROLLUP MOVED UP A LEVEL FOR EXACTLY THAT REASON.** `capitalRollup` and
the section filter now run once in `TransactionsView` and the table is handed the
groups. A count struck inside the table while the toggle struck its own would be
two definitions of "the rows in view", free to disagree the first time either
changed — which is the same reason the date and entity filters moved up before it.

**THE COUNTER COUNTS THE RECORD ON SCREEN, AND NAMES IT.** It read the manager's
tape on every view once (Stage 10am), then both records at once (10bg); with one
table in the DOM it counts that one and the other branch's figure is on the button
that reaches it. The check now REFUSES the trades shape on the capital branch by
name, which is the original defect stated as an invariant.

#### 2. and 3. Five captions out, a column each in

**THE PICKER IS THE COLUMN LIST NOW.** One `<th>` and one `<td>` per ticked
measure, headed with that measure's own name.

**AND IT IS EXPRESSED IN STAGE 10bh's DECLARED-COLUMN MODEL RATHER THAN BESIDE
IT** — which is what this change looked like after the merge, and is strictly
better than what it was written as. `return` in `MONITOR_COLS` is a PLACEHOLDER
rather than a column: `withReturnCols` expands it to one id per ticked measure,
and every mechanism in `useTableView` then does the right thing for free. A
column list that GROWS AND SHRINKS is exactly the case that hook already
reconciles — unknown ids dropped, new ones appended in declared order — so
ticking a measure adds a column a reader can sort and drag like any other, and
unticking it removes that column and leaves the rest where they were dragged to.
That is the family's *"and also removed when we select or deselect returns"*
answered by the storage reconciliation rather than by a second mechanism.

`COL_COUNT` is `holdView.order.length`, so every full-width row spans them with
nothing to keep in step; written as arithmetic on `returnMeasures.length` it
goes wrong SILENTLY, which is how the first cut of this had it.

| ticked | columns drawn | header |
| --- | ---: | --- |
| `auto` (default) | 1 | `Return` |
| Absolute + CAGR | 2 | `HPR` · `CAGR` |
| all five | 5 | `HPR` · `CAGR` · `XIRR` · `YTD` · `CY` |

Measured on the rendered page: header, body row, section heading, category total
and footer all span 14 / 16 / 18 columns together, and **no page-level horizontal
scroll at any of them** — the table scrolls inside its own container, as this
file's own rule requires.

**THE LABEL GOES WHERE THE FACT IS CONSTANT — one rule, `res.tag !== def.tag`,
and it covers three cases without naming any of them.** `auto` tags every row,
because the methodology resolves per row and the header can only say "Return".
The CAGR column tags the rows **where the annualisation guard fired** — a sub-year
holding shows its total return on cost, and leaving that untagged under a header
reading CAGR asserts an annual rate for a year the holding has not seen, which is
the +99.0% failure of Stage 10g(ii) arriving through a column heading. Every other
column tags nothing, because the header names it.

**A FIRST CUT KEYED THAT ON `measure === "auto"` AND THE SWEEP CAUGHT IT TWICE,
in both directions.** Once because the CAGR column's guarded rows went out
indistinguishable from the annualised one; and once because **42 of this book's
72 rows resolve to `AUTO` itself** (no cost reported, so no return at all), which
a rule written as `res.tag !== def.tag` alone leaves silently untagged on the
default view. Neither was reasoned out in advance.

**AND THE FIVE PARAGRAPHS' TWO CLAIMS WERE AUDITED SEPARATELY**, the pattern this
file has followed since Stage 10aa — each caption made exactly two:

- the **REASON** the measure is absent on the rows it cannot answer. Already per
  row, and more precisely: `measuredReturn` returns it and the cell renders an
  `AbsentCell` carrying it, about the row the reader is looking at.
- the **COUNT** of how much of the table it covers. **Stated nowhere else**, and
  the one a reader acts on — a column of dashes with nothing saying why reads as
  a broken feed rather than as a measurement this book cannot strike.

So the count is that column's own header note and the reason is the note's hover
(`returnColumnMeta`, which returns BOTH from ONE coverage object so the short
figure and the sentence behind it cannot describe different sets). The CAGR
column's note says `1 annualised of 72` rather than `3 of 72`, because `shown`
includes the two rows that fall back to HPR and reporting those as annualised is
the very claim the guard refuses.

**`auto` GETS NEITHER, AND THAT IS NOT AN OVERSIGHT.** Its measure resolves per
row, so there is no column-wide count to state; the family asked for that caption
gone at Stage 10af and it stays gone. Both halves are ONE invariant so it has a
subject on every address — split in two, the half with no subject reported NOT
CHECKED, and four evidenced abstentions is how a real one gets missed.

#### AN AGGREGATE HAS ONE RETURN, AND NOW IT HAS TO SAY WHICH

The footer and each category total are CUMULATIVE ON COST and deliberately do NOT
follow the picker: a bucket and a whole book have no single purchase date to
annualise over, no per-holding cash-flow history for an XIRR, and no dated opening
value for a year. **That used to be one cell under a header that could mean any of
five things.** With a column per measure the figure stands under HPR and under
`auto`, and every other return column renders an `AbsentCell` carrying the reason
(`AGG_NO_MEASURE`). Printing the same percentage under all five would be the
caption-does-not-describe-its-figure failure five columns wide — the one the
allocation footer already cost this book once. **This fell out of the change
rather than being asked for, and it is strictly more honest than what it replaced.**

#### A SORT ARROW ON A RETURN COLUMN ORDERS ON THAT COLUMN'S OWN FIGURE

`returnAccessors` gives each return column an accessor of its own, resolving
through `measuredReturn` — the same function the cell draws, so the column a
reader clicks and the order they get cannot disagree about what a row's CAGR is.
Reusing `returnPct` for all of them would leave the CAGR arrow ordering by the
raw return on cost, and this book is where that lie is visible: one holding
annualises and the rest fall back to their absolute figure, so the two orders
genuinely differ.

**AND AN ABSENT RETURN SORTS LAST, NEVER AS ZERO** — which this change no longer
has to state for itself, because `sortRows` does it for every null. That is the
merge paying for itself: the bespoke comparator this was first written as, the
`SortKey` union it extended, and the local `Th` that gave a heading its note are
all GONE rather than left beside their replacements, and `SortHeader` renders the
same `data-col-note` markup while also making a return column sort and drag like
every other. Two kinds of header on one table is the second-mechanism failure
this file keeps naming.

#### The checks moved to the tables they read, and one was lost on the way

`TRADES_BRANCH` names the txn routes that walk the trades table, and the walk
switches before the probes run — **a check that stops running because a table
moved behind a toggle is a check that silently stopped, for the fourth time in
this file.** Three claims moved to a new `monitor-txn-trades`; `monitor-txn-basket`
became a per-record FACTORY run by two routes (the axis is shared STATE, but the
two tables reach a section through different helpers — `forAccount` for an
account, `forTxn` for a dated trade); and the capital-record half of
`monitor-txn-direct` became `monitor-txn-direct-capital`, because that route walks
the trades branch now and the claim fell through to matching an absent-state
sentence the page correctly does not print.

**`RETURN_COLUMNS` IS A SHARED ARRAY SPREAD INTO EVERY RETURN ROUTE**, and that is
not tidiness: written in the `monitor` block it sat on the DEFAULT address — one
`auto` column, the one place "each concrete column carries its coverage count" has
no subject — and would have reported NOT CHECKED for ever on exactly the claim
asks 2 and 3 turn on. **Every abstention in it is evidenced by the PICKER's own
active list rather than by the check finding nothing**, because a build that ticked
CAGR and drew no column would also find nothing.

**AND ONE INVARIANT WAS LOST WHILE THIS WAS BEING WRITTEN, WITH THE SWEEP GREEN
OVER IT TWICE.** Merging two neighbouring claims by LINE RANGE swallowed
*"the per-measure caption paragraphs are gone"* along with the doc comment they
shared — so the whole suite passed against a page whose five paragraphs had been
removed with **nothing asserting the removal**. Reintroducing the paragraphs is
what found it, which is the entire reason that pass is run. It is restored as its
own claim, above the label claim, so the next such merge cannot take it.

#### Fifteen bugs reintroduced, and the fourteenth is the one worth the pass

| Bug put back | Fires |
| --- | --- |
| both tables stacked, the toggle filtering nothing | `draws the X table and only that one`, on both branches |
| the toggle deleted outright | **7 claims across 3 routes, as FAILURES** rather than abstentions |
| the default record moved to trades | 11 on `monitor-txns`, the whole capital branch |
| both buttons printing one count | the row-count claim, both branches |
| the card title pinned to the capital record | the title claim, on the trades branch |
| the counter counting both records | the counter claim |
| every measure back in one cell | 11 across 3 routes |
| the cell partition lost while the headers stay | the partition and the column-span claims |
| the coverage note deleted | 9 across 4 routes |
| the methodology column given a note | the label claim |
| the off-measure tag dropped | the guarded-row claim on `monitor-cagr` |
| **the five paragraphs restored** | **NOTHING — see above** |
| the cumulative figure under every return column | the aggregate claim |
| a return column sorted on the return on cost | the sort claim |
| `COL_COUNT` back to arithmetic on the measure count | the column-span claim |

The harness restores **by copy on a `trap … EXIT` and rebuilds on the way out** —
restoring the source alone leaves `dist/` at the bugged build for the next run to
report under the wrong name, and a patch that does not build is reported as NOT A
RESULT rather than as a clean sweep. One of these fifteen hit that (a `{false &&}`
gate that narrowed a possibly-null local) and was rewritten rather than read as a
pass. A no-patch CONTROL ran afterwards and came back clean.

#### Merged with Stage 10bh, and the two predicted conflicts arrived on cue

This branch was held open at the family's request (*"do not merge to main until i
tell you to"*), and **Stage 10bh landed while it waited** — so the merge hit both
of the things this file tells a future session to expect, for the SIXTH time each:

- **THE LETTER COLLIDED AGAIN.** Both branches wrote `### Stage 10bh`. Main's
  merged first and **keeps it**, as at 10al, 10as, 10at, 10aw and 10ba; this is
  `10bi`, and the FOUR cross-references elsewhere in this file that name it moved
  with it — checked one at a time, because the two on the Layout list belong to
  main's stage and must NOT move.
- **AND THE `ctx` LITERAL CONFLICTED, ON ONE LINE, EXACTLY AS PREDICTED.**
  Resolved as a **mechanical union** — 47 keys, none dropped, each then confirmed
  to name a variable defined exactly once in the merged file. Never by taking a
  side: this file's own measurement is that dropping one side's key turns its
  invariants into NOT CHECKED over a sweep still reporting every combination
  CLEAN, so half of those losses are invisible by construction.

**AND THE MERGE MADE THIS CHANGE SMALLER, WHICH IS THE PART WORTH RECORDING.**
Stage 10bh replaced this table's bespoke `sortKey`/`asc` pair with a declared
column list and accessors, so three things written here were SUPERSEDED rather
than merged: the `SortKey` union and its `` `ret:<measure>` `` member, the
hand-written comparator, and the local `Th` that existed only to give a heading a
note. `sortRows` already sorts an absent figure last in BOTH directions — the
rule the comparator had to state for itself — and `SortHeader` renders the same
`data-col-note` markup while also making a return column sort and drag like every
other. All three are DELETED rather than left beside their replacements.

**AND THE SWEEP CAUGHT WHAT THE BUILD COULD NOT.** `sortRows` was still being
handed `MONITOR_ACCESSORS`, so a return column would have ranked nothing while
looking exactly like the column that ranks — and `MONITOR_ACCESSORS` kept a
`return` accessor for a column id `withReturnCols` no longer produces. The first
is wired to `holdAccessors`; the second is gone, with a note at its place saying
why an accessor for the placeholder must never come back.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 18 suites · `check:family` **82/0** · `check:pages`
**180 combinations clean**, with **three** EVIDENCED abstentions — every KPI tile
on this book carries a figure, nothing on Morning CIO publishes an undefined
drill-down address, and no row on `stock-qty` carries a pledge, which
`stock-pledge` asserts as a hard failure so it never stands alone. **MEASURED ON
THE MERGED TREE**: this branch's own pre-merge run was 176 and Stage 10bh's was
178, and neither is a fact about this base — which is exactly why the sweep is
re-run rather than the number adjusted.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after the merge: nothing here
touches the ingest, and a presentation change that moved a generated figure would
not be one.

### Stage 10bj — MORNING CIO IS THREE PANELS, AND THE PAGE STOPS SCROLLING

*"open PR and do not merge until i tell you to."* · *"Divide the Morning CIO
into three separate sections and tabs… add three small selectable tabs on the
top of Morning CIO page on the right most side of the line 'Daily Briefing /
Good morning — here's where the book stands'. The KPI tiles at the top of the
page will remain the same for all the three tabs. The first tab will show the
Daily Movers section, the second tab will show the 'Allocation by asset class &
mandate', 'Capital deployment' and 'Concentration & risk' in the same layout…
Third tab will show the 'Portfolio NAV vs Nifty 500' section. Give appropriate
names to all the three tabs according to the information they'll be showing to
the user. Also after making the tabs the single scroll page should be gone, it
should be a non scrollable page with tabs switch option to see more data rather
than scrolling the page."*

**NOT ONE FIGURE ON THIS PAGE MOVES**, and that is what makes it a layout split
rather than a re-measurement: `npm run build-book` regenerates `glowData.ts`
and `docs/BOOK-REPORT.md` byte-identically, every card is the component it was,
and the three panels were never summed across anyway. What changed is which of
them is on screen, and that the headline and the tiles stop moving.

| Panel | `?tab=` | What it draws |
| --- | --- | --- |
| **Daily Movers** | *(param-free)* | Today's movers, both branches of its own toggle |
| **Allocation & Risk** | `allocation` | Allocation by asset class & mandate · Capital deployment · Concentration & risk, in the layout they already had |
| **NAV vs Nifty 500** | `nav` | Portfolio NAV vs Nifty 500 |

**THE TABS SWITCH WHICH QUESTION THE PAGE ANSWERS, which is why this is not the
`DailyMovers` toggle's shape.** That control keeps two whole CARDS apart
because it switches between two MEASUREMENTS taken on different days, and
merging them would make summing them a one-line edit. These three are three
different measurements over three different windows and nothing here was ever
added across them, so the split costs no arithmetic at all — the panels are
conditional renders of the same JSX, at the same nesting, with the same props.

**THE KPI STRIP IS OUTSIDE THE PANEL, DELIBERATELY.** The family asked for it
on every tab, and it is also the only part of this page that is true of all
three: a day's move, an allocation and a NAV series are each struck over a
subset the PANELS state and the strip does not. It is also most of what makes
the page fit — the strip is what a reader used to scroll past to reach
anything.

**IN `?tab=` LIKE EVERY OTHER VIEW IN THIS APP**, so a panel is a link rather
than an instruction, `check:pages` reaches each one by URL rather than by
clicking a control it is also trying to check, and Back steps between them.

**AND THE THIRD LABEL IS THE ONE THIS PAGE'S OWN CHECKS FORBADE.** A tab's text
is in `innerText` on every one of this page's routes, so a label repeating a
card heading would satisfy a check on a panel that heading is not drawn on. One
is banned outright: the roadmap-absence invariant asserts the words **"NAV vs
benchmark"** never return, because they once named a promised feature. So the
third tab is named for the index it actually charts. `check:pages` reads
`data-cio-tab-key`, never the three labels.

#### The page does not scroll, and that is a geometric claim

Measured in the browser at 1500×1000 on all four Morning CIO routes:
`document.scrollHeight − clientHeight = 0` and `main.scrollHeight −
clientHeight = 0`. The shell is `flex h-full flex-col` with the panel at
`min-h-0 flex-1` — **`h-full`, never a `vh` unit**, because a viewport unit is
not rescaled by `--app-zoom` and would paint the shell short, which is the
defect Stage 10n records.

**THE PANEL IS ALLOWED TO SCROLL AND IS NOT ASSERTED NOT TO.** A window short
enough to clip the NAV chart must still be able to reach it; a page that fits
by hiding a figure is worse than the scroll the family asked to be rid of. What
was asked for is that the headline and the tiles stop moving, and the two
claims above are exactly that. On this book at that viewport the panel's own
scroll is 0 on all three.

**THE CLAIM IS GEOMETRY, SO IT IS CHECKED ON GEOMETRY** — the rule this sweep
already applies to the headline's inline layout, to Export Excel's row, to the
KPI overlay anchor and to the filter box's own placeholder. Every figure,
caption and link on this page renders identically whether a reader reaches it
by scrolling or by switching tabs, so the split is invisible to every text and
value check in the file: without a geometric one the family's actual ask would
be checked by nothing.

**AND A SECOND CLAIM, BECAUSE THE FIRST IS SATISFIED BY A PAGE THAT RENDERS
NOTHING**: the strip's bottom edge is inside the viewport and the panel begins
below it. Without that, a panel drawn ABOVE the tiles — or a strip that
scrolled off the top — passes both scroll checks.

**AND THE CONTROL'S OWN PLACE IS GEOMETRY TOO.** *"on the right most side of
the line"* is `PageHeader`'s `right` slot, not its `beside` one — and the
difference cannot be read off the page's text at all. It needs two claims,
because only the second tells them apart: a control in `beside` ALSO overlaps
the title's line and ALSO sits to its right, it just sits next to the title
rather than opposite it. So the check additionally requires the tabs' right
edge to be the header row's own, which only `right` produces. Reintroducing
`beside` fires it on all four routes.

#### One invariant block became four, and not one claim was dropped

This is the half of the change with the work in it. The `cio` block held **59
invariants** — and **36 of them** read the allocation table, the Concentration
card or the NAV chart (18 each). Left where they were, every one would have
reported NOT CHECKED against content that is correctly not on the movers panel
— **an abstention, which is counted apart from a failure and reads as a clean
run.** That is the same move the eleven published-NAV invariants made when the
movers card grew its toggle, and it is this file's own rule: a check follows
its subject or it stops checking.

| | walks | carries |
| --- | --- | --- |
| `cio` | `/cio` | `CIO_SHARED` + `CIO_TAB_CONTROL` + `CIO_MOVERS` |
| `cio-allocation` | `/cio?tab=allocation` | `CIO_SHARED` + `CIO_TAB_CONTROL` + `CIO_ALLOC` |
| `cio-nav` | `/cio?tab=nav` | `CIO_SHARED` + `CIO_TAB_CONTROL` + `CIO_NAV` |
| `cio-nav-live` | `/cio?tab=nav` + `installLiveMocks` | …and `CIO_LIVE_NAV`, the five that read the Nifty 500 line |

**`CIO_SHARED` IS SPREAD INTO ALL THREE**, because the KPI strip, the page
header and this page's absences are on every panel — and a build that dropped
the strip from ONE tab would otherwise be caught on none.

**THE MOVE IS VERIFIED BY PROVING NOTHING WAS REWRITTEN ON THE WAY.** Every
non-blank line of the old `cio` block and of the `cio-live` NAV group is
checked to still exist in the file verbatim; exactly four do not, and each is a
deliberate change named below. That check is what caught a `$$eval` silently
becoming `$eval` — `String.replace` reads `$$` in a REPLACEMENT as a literal
`$`, so a mechanical move had quietly broken the `<details>` opener.

**AND THE SAME RULE BIT A SECOND TIME, INSERTING THIS VERY ENTRY.** The script
that splices it into this file used a string replacement, and the paragraph
above contains a `$` immediately followed by a backtick — which
`String.replace` reads as "everything BEFORE the match" and which duplicated
CLAUDE.md, 12,856 lines to 24,912. It uses a replacer FUNCTION now, and it
refuses to write when the file grows by more than the entry's own length: a
splice that cannot state how much it added is a splice nobody would check.

**ONE INVARIANT WAS SPLIT IN TWO, AND THAT MAKES IT STRONGER.** *"every KPI
tile and concentration figure opens ITS OWN set"* read the KPI strip AND the
Concentration card. The strip is on every panel and the card is on one, so a
single check spanning both would either fail on two routes or be softened until
it asserted neither. Split, each half fails where its own subject is drawn and
names its own part — which is what this file already does everywhere else a
check carries two claims.

**AND THE ALLOCATION PANEL IS THE PUBLISHER NOW.** `CIO_FIGURES` is read off
the Concentration card and `CIO_DRILLDOWNS` off the allocation rows, and every
`holdings-*` route resolves its address from them. `PUBLISHERS` names
`cio-allocation` rather than `cio`, and the two collection gates in the walk
moved with the cards — so `ONLY=holdings-book` still pulls in the page that
resolves its address rather than walking a not-found page and reporting clean.

#### A boundary the page no longer prints is not a boundary

Four movers checks bounded their text slice on **"Allocation by asset class"**
— the heading of the card that came next down the old single-scroll page. That
card is on another panel now, and `sliceBetween` returns EVERYTHING after its
start marker when the end marker is absent, so all four would have gone on
running against the rest of the document.

**IT IS THE FAILURE THIS FILE ALREADY RECORDS TWICE** (Stage 10al's `navHead`,
bounded first on removed prose and then on the word "PERIOD", which the page
was free to print). So the slice is struck on the panel NODE —
`cioLayout.text`, the `[data-cio-panel]` element's own innerText — which cannot
run past the panel whatever the page prints inside it.

**AND THAT ONE IS A HARDENING RATHER THAN A BUG FIX, WHICH IS SAID PLAINLY.**
Restoring the old end marker changes no verdict on this book: the movers card
is the whole of its panel, so slice-to-end and slice-to-panel are the same
text. It becomes load-bearing the first time a second card lands on that panel,
which is exactly when nobody would be looking.

#### The bug-reintroduction pass, and the one that came back CLEAN

Restored by COPY on a `trap … EXIT` and **rebuilt on the way out** — restoring
the source alone leaves `dist/` at the bugged build for the next run to report
under the wrong name, which this file has measured once. A patch that does not
apply, or a build that fails, is reported as NOT A RESULT. A no-patch CONTROL
ran first and came back clean.

**AND ONE OF THEM PRODUCED A CLEAN SWEEP, WHICH IS THE POINT OF DOING IT.**
Drawing the NAV panel on the movers tab as well — two panels at once, the exact
state this split exists to end — failed NOTHING. *"Exactly one tab is active"*
is a claim about the CONTROL: one tab was still lit, `data-cio-panel` still
named one panel, and the scroll checks passed because **the panel is allowed to
scroll**. Every claim in the block was about the control and none about what
was drawn. The panels carry `data-cio-section` now and are COUNTED, against
both `data-cio-panel` and the lit tab — and re-run against the same bug it
fires.

**AND ONE PATCH REPORTED ITSELF AS NOT A RESULT**, which is the harness working
rather than a defect: its anchor was `        right={` — eight spaces and the
prop — and a SUBSTRING count is not a line match, so the allocation card's own
`right={` at fourteen spaces contains it. Two matches, no patch, and the run
said so instead of sweeping an unchanged tree and reporting the check clean.

**AND THE FIRST FULL SWEEP RACED A REBUILD**, which is the hazard this file
already records: it died on `ERR_HTTP_RESPONSE_CODE_FAILURE` because `dist/`
was being written underneath the `vite preview` serving it. Nothing it produced
was a result, and it was re-run with nothing else touching the output
directory.

| Bug put back | Fires |
| --- | --- |
| the tabs deleted and the page one scroll again | the catalogue, the active-panel and the two scroll checks — **12 findings across all four routes** |
| the default panel moved to Allocation & Risk | the active-panel check on all four, and all four `CIO_MOVERS` checks on `cio` |
| **the NAV panel drawn on the movers tab too** | **NOTHING, on the first pass — see above.** The panel count fires it now |
| a panel dropped from the catalogue | the catalogue check on all four, the active-panel check on the two NAV routes, and three `CIO_NAV` text checks — with 16 NAV invariants correctly ABSTAINING beside them, which is the point: an abstention never stands alone here |
| the KPI strip moved below the panel | the strip-above-the-panel check, on all four |
| the tab control moved from `right` to `beside` | the headline-geometry check, on all four |
| the address collectors left on the movers panel | the `holdings-*` routes that read `CIO_FIGURES` and `CIO_DRILLDOWNS` |
| the five live NAV checks left on `cio-live` | they ABSTAIN rather than fail — which is exactly why they moved, and what a sweep reporting CLEAN over sixteen NOT CHECKED lines looks like |

**AND THE LAST ONE IS THE DEMONSTRATION RATHER THAN A FAILURE**, which is why
it is in the table as it is: putting the five live NAV checks back on
`cio-live` reports **2 of 2 combinations CLEAN** over five NOT CHECKED lines.
That is what "an abstention reads as a clean run" looks like on a terminal, and
it is the whole reason 36 invariants moved rather than being left where they
were.

#### Merged with Stages 10bh and 10bi, and BOTH predicted conflicts arrived — for the sixth time

This branch sat open under the family's own hold (*"open PR and do not merge
until i tell you to"*), and **two PRs landed on main while it waited**. The
merge hit exactly the two things this file already tells a future session to
expect, and a third that is this page's own:

- **THE LETTER COLLIDED AGAIN, TWICE OVER.** Main took `10bh` AND `10bi` while
  this branch held `10bh`. Main's merged first and **keeps both**, as at 10al,
  10as, 10at, 10aw and 10bb; this section is **`10bj`**, and the one
  cross-reference elsewhere in this file that names it — the Build section's
  publisher note — moved with it. The four references inside main's 10bi that
  read `10bh` belong to MAIN's stage and were deliberately left alone, checked
  one at a time rather than swept.
- **AND THE `ctx` LITERAL CONFLICTED RATHER THAN AUTO-MERGING**, which is the
  safer of its two failure modes and the rarer one. **Resolved as a mechanical
  UNION** — this branch's `cioTabs` and `cioLayout` spliced into main's line,
  which had gained `pageNav`, `tileStrip`, `tileMenu`, `tilePick`, `tableView`,
  `arrange`, `returnHead`, `tableWidth` and `txnRecord`. Taking either side
  whole is a sweep that has silently stopped checking: this file's own
  measurement is that dropping one probe turned nine invariants into NOT
  CHECKED while every combination still reported CLEAN. All **76** keys were
  then confirmed to name a declared variable exactly once, because a key naming
  a variable that no longer exists throws inside the check and is reported as a
  broken matcher rather than as a clean page.
- **AND THE ALLOCATION TABLE ITSELF CONFLICTED, which no earlier merge here
  has.** Stage 10bh rewrote that table's internals for sortable, reorderable
  columns in the same 375 lines this branch wrapped in `{tab === "allocation"
  && (…)}`. Resolved by taking **main's file whole** and re-applying this
  branch's structural change on top — the catalogue, the hook, the flex shell,
  the tab control, `shrink-0` and the three panel wrappers — rather than by
  hand-merging a table nobody asked this branch to touch. Verified by diffing
  the result against main's own version with whitespace ignored: what remains
  is exactly the six structural edits above and not one line of table.

**AND A THIRD ONE-LINE CHANGE HAD TO RIDE ON MAIN'S NEW BLOCK.** The
`CIO_DRILLDOWNS` collector gate is `cio-allocation` on this branch, because the
allocation rows that publish every holdings address moved behind `?tab=`. Main
added its `CRUMB_PUBLISHERS` block immediately above that same line. Both are
kept and the gate change rides on main's last line — dropping either would have
left the drill-down routes resolving nothing, which is a NOT CHECKED and not a
failure.

**THE GENERATED FILES WERE CHECKED RATHER THAN ASSUMED**, the discipline
Stage 10at records: neither side touched `src/data/glowData.ts` or `docs/`, so
the merge had nothing to splice, and `npm run build-book` was run as a control
afterwards anyway and regenerated both **byte-identically** (md5
`f7cc7f1491ebea516f8a0e68b5f0c09d` / `d5388195be5bc4f4a3ce9eb5bd11af2e`,
unchanged before and after).

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 18 suites · `check:family` **82/0** · `check:pages`
**186 combinations clean**, with the **three** evidenced abstentions main's own
merged sweep records — every KPI tile on this book carries a figure, so the
absent-tile claim has no subject; nothing on Morning CIO publishes an undefined
drill-down address; and no row on `stock-qty` carries a pledge, which
`stock-pledge` asserts as a hard failure so it never stands alone. The first of
those reports on FOUR Morning CIO routes rather than one, because `CIO_SHARED`
is spread into all of them — four lines, one evidenced abstention.

**MEASURED ON THE MERGED TREE**: main's own pre-merge run was 180 and this
branch's was 174, and neither is a fact about this base. 180 plus this change's
three routes across both themes is 186, and it reconciles ONLY because the
sweep was re-run rather than the number adjusted — which is the point every
stage in this file makes about its own count.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after: nothing here touches the
ingest, and a layout split that moved a generated figure would not be a layout
split.

### Stage 10bk — THE POLYCAB PAGE IS LIVE, AND THE COMPANY IS NOT THE DEMAT

*"Open PR and do not merge until i tell you to. Every single data point in the
Polycab Page should be live and automatically updated everyday, there must be no
placeholders. Daily fetch all such information for the Polycab promoter
activity, dividend/split/bonus/pledge.. etc etc. The data on this page should be
live, you can even use Github actions or direct web search, whatever is the best
method according to you after probing. Try to get data from websites like
screener.in, trendlyne, etc."*

#### The distinction the whole change turns on

**THE PAGE ALREADY ANSWERED A QUESTION COMPLETELY AND CORRECTLY, AND IT IS NOT
THE QUESTION THIS DATA ANSWERS.** Getting that wrong would have been the most
damaging thing available here, so it is the first paragraph rather than a
caveat:

| | |
| --- | --- |
| **What this DEMAT reports** | the ICICI NSDL `Statement of Holding` prints ISIN, scrip name, account description, balance and value — and no encumbrance column, no income and no corporate action. **No amount of fetching changes what that document IS.** |
| **What the COMPANY did** | declared dividends, bonuses, splits, and the promoter group's disclosed holding and encumbrance. Public, statutory, dated, and refreshed every morning. |

A promoter-GROUP pledge of 0.0% is a real measurement about the group this
holding belongs to. **It is NOT a statement that this demat's balance is
unencumbered** — and the two are one careless edit apart. So they are separate
cards, the statement card's three dashes are untouched, and a third tile on the
new card says in words that a group figure is not a statement about this
account. `check:pages` asserts that the group pledge never fills the statement
card's own pledge dash, and reintroducing exactly that bug fires it. *(Separate
TABLES behind one toggle since **Stage 10bt**, and the separation is unchanged:
the demat's Pledged cell and the group's pledge column are still two claims, each
naming the other as a different fact, and the harness case that fills the first
from the second still fires.)*

#### What the probe established, and the source that was refused

Measured from this environment rather than assumed, and recorded in
`docs/POLYCAB-LIVE.md`:

| Source | | |
| --- | --- | --- |
| `api.bseindia.com` | **200, JSON, keyless** | identity (ISIN), live quote, the WHOLE corporate-action record since listing |
| `tickertape.in` | **200, keyless** | promoter holding AND pledge, per quarter, as embedded JSON — and it prints the ISIN |
| `screener.in` | **200, keyless** | promoter holding, per quarter — the second witness |
| `trendlyne.com` | **405, `x-amzn-waf-action: captcha`** | REFUSED — see below |
| `nseindia.com` | 403 Akamai, with and without a cookie bootstrap | recorded, not worked around |
| `moneycontrol.com` | 200 — **and the WRONG COMPANY** | REFUSED — see below |

**TRENDLYNE WAS TRIED FIRST AND REJECTED, AND THE REASON IS THE WORST POSSIBLE
PROPERTY FOR A DAILY JOB.** It sits behind an AWS WAF: a single `curl` got
through and Node's `fetch` did not. A source that passes the day it is wired and
fails silently in CI ever after is worse than one that never worked, so it is
named in the shared module and not built on — the same standing the RBI's
`__VIEWSTATE`-only WSS page already has.

**AND MONEYCONTROL RETURNED A COMPLETE, CORRECT, WELL-FORMED PAGE ABOUT ANOTHER
COMPANY.** `/india/stockpricequote/cables-telephone/polycabindia/PI47` reported a
promoter holding of **55.03%** against Polycab's **61.5%**, under a title naming
no company at all. Nothing on a rendered page would have caught it. That is the
resolver failure Stage 10e already measured on a different vendor, arriving
again — and it is why every gate below is mechanical rather than a matter of
noticing.

#### The identity gate is the licence for publishing any of it

**THE ISIN THE EXCHANGE ECHOES MUST EQUAL THE ISIN THE BOOK CARRIES**, read out
of `BOOK_POLYCAB` and never typed in the builder. Two tiers, strongest first,
and a page matching neither yields NOTHING — never a figure with a caveat,
because a caveat on a figure about the wrong company is still a figure about the
wrong company:

- **BSE** — `ComHeadernew` returns the ISIN. `INE455K01017` both sides.
- **tickertape** — must print the ISIN. It does, which is why the PLEDGE, the
  figure with a single witness, is taken from the source with the STRONGEST
  identity rather than the most convenient one.
- **screener** — must print the BSE scrip code and the NSE symbol.

#### Two layers, because the page must never be blank

`IndexStrip`'s own arrangement, applied to one scrip:

- **`src/data/polycabLive.ts`** — committed daily by `.github/workflows/polycab.yml`
  at **12:00 UTC (17:30 IST), two hours after the Indian close**, so the price it
  stores is a SETTLED session rather than a snapshot that would move if the job
  were retried. It renders with **no network at all**, which is what keeps this
  page free of blank tiles in a preview, in the headless sweep, and on a morning
  an upstream is down.
- **`functions/api/polycab.js`** — the intraday quote while a session is open.
  Keyless, so it needs no `MUNS_TOKEN`: the quote feed behind the rest of this
  dashboard is keyed on an NSE symbol and a token, and the ring-fence means
  `PortfolioContext` is never asked for this holding.

**THE PARSING IS NOT WRITTEN TWICE.** `shared/polycabSources.mjs` is imported by
the Node builder AND the Cloudflare function, so the committed figure and the
live one cannot disagree about what a day change is — the seam
`shared/seriesReturns.mjs` already holds between the harvester and `/api/prices`.

**AND THE LIVE LAYER MAY MOVE THE PRICE AND NOTHING ELSE** (§6). A quote is not
evidence about a dividend, a pledge or a share count.

#### What it retired, and what it did NOT

**ONE ABSENCE TURNED OUT TO BE MEASURABLE.** The page said a bonus or split here
was *"unreported rather than confirmed"*, which stays true of the DEMAT. The
exchange's record is complete from listing and carries **EIGHT corporate actions,
every one a dividend and NOT ONE a bonus, split or spin-off** — a MEASURED nil,
which is strictly better than an absence.

**IT IS GATED ON `actionsComplete`, AND THAT GATE IS THE WHOLE CLAIM.** A
truncated fetch and a company that never declared one produce the IDENTICAL empty
list, so the builder sets that flag only on a run that actually reached the
exchange and never on a stored record kept through a failure. Reintroducing the
ungated version fires both the sweep and the suite.

**THE ENTITLEMENT IS DERIVED AND IS NEVER CALLED "RECEIVED".** The exchange
states an amount per share; the rupee figure is that times a share count taken
from ONE statement at ONE date. **A snapshot is not a history** — this book can
say what was held on 31 Mar 2026 and cannot say what was held on an ex-date
either side of it. So every row carries `exDateWithinStatement`, the 19 Jun 2026
dividend (three months after the statement) renders with a `*` and a hover
stating the assumption, and the column is headed **"On this block · derived"**.
It is in no total on the page, and what actually arrived — and what TDS came off
it — remains a bank fact no exchange can answer.

#### Two figures the sweep cannot see, and where they are caught instead

The bug pass ran a NO-PATCH CONTROL first and then nine bugs, each applied
alone, rebuilt, swept and restored **by copy on a `trap … EXIT`** — several of
these files are untracked, where `git checkout --` silently does nothing.
Seven fire an invariant in `check:pages`. **Two fire only in the arithmetic
suite, and that is correct rather than a gap:**

- **the pledge defaulting to `0` instead of staying `null`** renders IDENTICALLY
  on this book, because the real figure IS 0. Only a synthetic fixture can tell
  a published zero from a defaulted one, and `polycabLive.test.ts` carries one.
- **the store's ISIN diverging from the book's** is invisible on screen, because
  the page prints the BOOK's ISIN and the wrong company's dividends. The suite
  compares the two directly.

Both are named here rather than left to be rediscovered. `scripts/dev/polycab-bug.sh`
is the harness, committed so the next session's verification is one command
rather than nine manual edits.

**AND THE CONTROL EARNED ITS PLACE ON THE FIRST RUN.** Every one of the nine
cases reported NOT A RESULT because `tsc` was failing on an unrelated missing
declaration for the new shared `.mjs` — a file the esbuild-based `test:family`
never typechecks, so the suite had been passing while `npm run build` was
broken. Without the control that reads as nine bugs firing. `shared/polycabSources.d.mts`
is the fix, on the same terms as `sectors.d.mts` beside it.

**IT BIT TWICE, WHICH IS WHY IT IS RECORDED RATHER THAN JUST FIXED.** Adding
`polycabFunction.test.ts` broke the build the same way a second time, on
`functions/api/polycab.js` — and `indices.d.ts`'s own header had already written
the warning down: *"without a declaration `tsc -b` fails the whole build on
TS7016 — which `test:family` would not catch, because it bundles with esbuild
and does not typecheck."* **A NEW `.test.ts` THAT IMPORTS PLAIN JS NEEDS ITS
DECLARATION IN THE SAME COMMIT**, and a green `test:family` is not evidence the
build is green.

#### …and the edge function is tested, because the deployment cannot be probed

`/api/polycab` was checked against the branch preview and the edge gate answers
the SIGN-IN PAGE, HTTP 200, `text/html`, for every `/api/*` path — right for a
browser and, as Stage 10c already records, a trap for a script. Without
`GLOW_PASSWORD` the deployed function is out of reach from here, which is stated
rather than worked around.

Every branch AROUND the upstream is reachable, and they are the ones that matter:
`polycabFunction.test.ts` stubs the exchange and holds the identity gate to
refusing in three distinguishable ways (no ISIN from the caller, a DIFFERENT ISIN
back, an unreachable exchange), to returning **no price at all** on a mismatch
rather than a price with a caveat, to reading a 302 to BSE's error page as a
failure rather than an empty success, and to the browser being unable to widen
what the endpoint confirms — a `scripcode` in the request is ignored. The
treatment `chatFunction`, `indicesFunction` and `quotesFunction` already get, and
for the same reason. Verified by reintroducing two bugs: the gate no longer
comparing fires two checks, and a missing previous close defaulting the change to
0 fires the third.

#### The measured zeros on this page are zeros

`check:pages` reports `zeroish=7` on `/polycab`, and every one is the promoter
pledge genuinely reading 0.00% across seven quarters. `zeros` is deliberately
NOT part of `hard` in that runner — *"a lead rather than a verdict"* — and an
ABSENT pledge on this page renders `—` with its reason, so the two are
distinguishable exactly as §2 requires.

#### Merged with main THREE TIMES, and both predicted conflicts arrived ALL THREE

Stage 10bh landed while this branch was open, Stage 10bi while the first merge
was being verified, and **Stage 10bj while the branch was held for the family's
go-ahead** — so this branch hit the same two conflicts three times in one
session, for the sixth, seventh and eighth time in this file:

- **THE LETTER COLLIDED AGAIN.** Both branches wrote `### Stage 10bh`. Main's
  merged first and **keeps it**, as at 10al, 10as, 10at, 10aw and 10bb; this
  section is `10bk`. Two of the five cross-references that named `10bh` move
  with it and **three do not** — `SortableTable` and `PageNav` are main's and
  were checked one at a time rather than repointed in bulk.
- **AND THE `ctx` LITERAL CONFLICTED ON ONE LINE, AS PREDICTED.** This branch
  adds `polycabDom`; main adds `pageNav`, `tileStrip`, `tileMenu`, `tilePick`,
  `tableView` and `arrange`. **Resolved as a mechanical union, never by picking
  a side** — the measurement this file already records is that dropping one key
  turns nine invariants into NOT CHECKED over a sweep still reporting every
  combination CLEAN, so half of these losses are invisible by construction.
  Every one of the seven was then confirmed defined exactly once in the merged
  file.

**AND THE MERGE MADE REAL WORK, WHICH IS THE PART A TEXT RESOLUTION WOULD HAVE
MISSED.** Stage 10bh's sweep asserts that **every** `<main> table` with a head
and a data row sorts on its headings and moves every column but the first —
measured on every route rather than on a list somebody remembered to write down,
which is exactly what makes it reach a table that did not exist when it was
written. This change adds two: the declared-actions table and the promoter
quarters. Neither may claim `data-table-static`, because that exemption is for a
document whose ORDER IS ITS OWN — a balance sheet, a transposed metric grid —
and these are a list of declared actions and a time series, which is precisely
what a reader sorts. Both are wired through `useTableView` / `SortHeader` / `Tr`
like every other table on the site.

Two of their accessors are worth naming, because both sort on the FIGURE rather
than on what the cell draws: the entitlement orders on the derived rupee amount
and not on its ` *` marker, which would otherwise read `₹9.9 Cr *` and `₹9.9 Cr`
as different; and the quarter orders on the disclosure's own ISO `asOf` rather
than on the `Jun 2026` label beside it, which compares alphabetically in the
wrong order — a promoter series read backwards being the one thing on this card
a reader would act on. Verified by reintroducing the plain headings on the
quarters table: the sweep fails by name (`4 heading cells, 0 declared, 0
sortable, 0 movable`).

**AND THE GENERATED FILES WERE CHECKED RATHER THAN ASSUMED**, the discipline
Stage 10at records — a textual splice of two generated regions can produce
something the generator would never write. Measured here: **neither side touched
`src/data/glowData.ts`, `docs/BOOK-REPORT.md` or `src/data/polycabLive.ts`, so
the merge had nothing to splice**, and `npm run build-book` was run as a control
afterwards and regenerated both byte-identically anyway.

**AND THEN IT HAPPENED AGAIN, BEFORE THE FIRST MERGE COULD BE PUSHED AND
VERIFIED.** Stage 10bi — the transactions toggle and the per-return columns —
landed while the first merge's sweep was running, and brought **the identical
pair**: both branches had written `### Stage 10bi`, and the `ctx` literal
conflicted on the same one line (this branch's `polycabDom` against
`returnHead`, `tableWidth` and `txnRecord`). Resolved the same way, twice: main
keeps the letter and this section is `10bk`, and the literal is a mechanical
union with all four keys confirmed defined exactly once.

Disambiguating the cross-references is what took the care rather than the
resolution. After the second merge **seven** lines in this file named `10bi` and
only **two of them were this branch's** — the other five are main's own stage and
its own merge note, and repointing them in bulk would have made a stage
describing the transactions toggle cite the Polycab page. Each was read before
it was moved, which is the same discipline the first merge needed for `10bh`.

**What the second merge did NOT touch is the useful part of the record**: #62
changes `PortfolioMonitor`, `analytics.ts`, `check-pages.mjs` and this file, and
**not `Polycab.tsx`** — so unlike #63 it made no work here, and the only thing
that had to move was a number.

**AND A THIRD TIME, WHILE THE BRANCH SAT WAITING FOR THE FAMILY'S GO-AHEAD.**
The PR was opened under *"do not merge until i tell you to"*, so it held — and
Stage 10bj (Morning CIO's three panels) landed in the meantime and brought **the
identical pair for the third time**: both branches had written `### Stage 10bj`,
and the `ctx` literal conflicted on the same one line, this branch's
`polycabDom` against `cioTabs` and `cioLayout`. Same resolution both halves:
main keeps the letter and this section is `10bk`, and the literal is a
mechanical union — measured afterwards at **77 keys, none duplicated, every
shorthand key declared exactly once**, because a key naming a variable that no
longer exists throws inside the check and is reported as a broken matcher rather
than as a clean page.

**THE CROSS-REFERENCES SPLIT FOUR TO THREE, and reading them one at a time is
the whole of the care.** Seven lines named `10bj` after the merge: four are this
branch's (the `shared/polycabSources.mjs` entry in **Layout**, the
`npm run build-polycab` entry under **Build**, and the two sentences inside this
very subsection that name their own section) and **three are main's** — its own
heading, its own merge note, and the `?tab=allocation` sentence under
`check:pages` in **Build**, which is about Morning CIO's panels and would have
been made to cite the Polycab page by a bulk replace.

**AND THIS ONE MADE NO WORK EITHER, WHICH IS WHY THE #63 CASE IS THE ONE WORTH
REMEMBERING.** #60 changes `MorningCIO.tsx`, `check-pages.mjs` and this file and
**not `Polycab.tsx`**; its three new routes (`cio-allocation`, `cio-nav`,
`cio-nav-live`) are walked by the ring-fence ABSENCE check automatically,
because that check applies to every route in the sweep rather than to a list
somebody remembered to extend — the same property that made #63's every-table
rule reach two tables that did not exist when it was written. Two of the three
merges cost a number and only #63 cost a feature, and which is which was not
predictable from the size of the diff — it is predictable from whether the
other side's change is a RULE over every route or a change to some of them.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 20 suites · `check:family` **82/0** · `check:pages`
**186 combinations clean**, with **three** evidenced abstentions — the two Stage
10bg records, plus main's own crumb check on `holdings-unknown`, which walks an
address the book deliberately does not define and so has no figure to name.

**MEASURED ON THE THRICE-MERGED TREE, and the arithmetic is only legible because
each sweep was re-run rather than adjusted.** This branch's own pre-merge run was
168 and it adds NO route: every claim it makes is struck on `/polycab`, which the
sweep already walked. Stage 10bh adds two routes (`private-market-tiles`,
`monitor-arrange`) → 172, which the first merge measured; Stage 10bi adds four
(`monitor-txn-trades`, `monitor-txn-direct-capital`, `monitor-txn-basket-trades`,
`monitor-ret-sort`) → 180, which the second measured; Stage 10bj adds three
(`cio-allocation`, `cio-nav`, `cio-nav-live`) → **186**. Every other stage in
this file states a count against a base that has since moved, and this one would
have too three times over — which is exactly why each sweep is re-run and the
number is never adjusted.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after: **nothing here touches the
ingest, and nothing here is in any book total.** `src/data/polycabLive.ts` is
generated beside the book, read by ONE page, and in no NAV, allocation, sector or
entity figure — the same standing `BOOK_POLYCAB` itself has.

### Stage 10bl — THREE REMOVALS ON FAMILY & ENTITIES, AND THE TWO CLAIMS THAT HAD NOWHERE ELSE TO GO

*"open PR and do not merge until i tell you to"* · *"remove the 4 KPI tiles at
the top of Families and Entities Page"* · *"remove the bar graph from the page
UI"* · *"in the table remove the custody column"* · *"The final view should be
the table on the left side and on the right side 'in house vs external' pie
chart and section. Without any scrollable page, the table will be small after
removing the custody column so both the table and the pie chart section can fit
in the same view side by side."*

Four asks, and they are worth recording together because the SAME instruction —
take this off the screen — cost three different amounts of work, decided
entirely by whether what was going carried a figure nothing else states. That is
the audit this file has now run seven times (Stages 10aa, 10ai, 10al, 10ap,
10aq, 10bd, 10be) and it is the whole of the work here.

#### 1. The bar graph was free, and saying why is the point

It plotted `e.mv` per entity — which is the **NAV column of the very table now
standing in its place**, the same six figures to the rupee rather than to a
pixel, beside the weight, the position count and the returns a bar cannot carry.
So nothing moved, and the removal is one deleted card.

That is the test, and the tiles above it did not pass it.

#### 2. Two of the four tiles were already stated, and two were not

| The tile | Second home? | |
| --- | --- | --- |
| **Entities** `6` | the header pill, on every view of this page | gone |
| **Largest entity** `Ajay Jaisinghani · ₹347.3 Cr · 49%` | `bucketBy` sorts by market value DESCENDING, so the Entity breakdown's FIRST ROW is that entity — with its weight at one more decimal than the tile printed | gone |
| **In-house custody** `31% · ₹216.8 Cr · 7 of 12 accounts` | the **value** is a legend row on the pie beside it. The PERCENTAGE, the account coverage and the whole custody-is-not-Direct-Equity disclosure were nowhere else | **moved** |
| **External custodians** `69% · 17 custodians · ₹491.1 Cr` | every custodian and its value is a legend row. The percentage, the count and the total were not | **moved** |

**THE SPLIT IS RENDERED AND ONLY THE LONG PARAGRAPH IS A HOVER**, which is the
trade stated rather than glossed. The two percentages, the account coverage
behind one and the custodian count behind the other are a line in the card's own
subtitle — a reader scanning sees them. The arithmetic rides in that line's
`title`, which is what an `Auditable` popover would have said; the underline
itself is what the family have been removing from figures, and a subtitle is not
a figure.

**AND THE ONE CLAIM THAT WILL NOT FIT A CAPTION RIDES ON THE ROW IT IS ABOUT.**
Custody answers WHERE an asset sits; the holdings tables' Direct Equity answers
WHO CHOSE IT, and **the two sets differ in BOTH directions on this book** — the
in-house accounts hold ₹124.5 Cr of funds and ETFs that are not shares in a
company at all, and ₹1.28 Cr of the family's own shares are bought through LKP,
which custody files under the broker. A reader who takes the in-house figure for
the shares the family picked has the wrong number and nothing else on this page
tells them apart. It is the `Direct / In-house` legend row's own `title`, on
that row ALONE: a hover on every custodian would be this sentence claiming
things about managers it does not describe, which is what the check asserts.

**THE LARGEST-ENTITY TILE NEEDED NOTHING MOVED ONLY BECAUSE THE TABLE IS RANKED
BY VALUE**, so that premise is now a check rather than a comment: sort the table
by name and the first row stops being the largest entity, and this becomes the
one removal that DID lose something. Measured by reintroducing exactly that.

#### 3. The custody column, and a hover that is weaker and is answered better

It listed every platform each entity holds through — one member holds through
fourteen — so it was the widest cell in the table and precisely what made the
table too wide to sit beside the pie. **Nothing else on this page carries it**,
so it is the Entity cell's own hover.

A hover is weaker than a column and that is recorded. What makes the trade
affordable is not that the fact is preserved but that it is **ANSWERED BETTER
ONE CLICK IN**: the row is already a click target that scopes the page to that
entity, where the holdings table names the platform PER ROW and says which of
them CHOSE it — which a set of names per owner cannot. The column was a
consolation for a question the drill-down answers properly.

#### 4. The layout, and the width the "no scroll" claim is true at

The bar chart held the left two thirds; the Entity breakdown takes its place, so
the two surviving cards sit side by side. `items-start` keeps each its own
height — stretched, the table would grow a dead band to match the 17-row legend
beside it.

**AND TWO MONEY COLUMNS HAD TO STOP WRAPPING.** At two thirds of the width
`₹349.5 Cr` broke across two lines. A money figure is one token however narrow
its column gets; the Entity name legitimately wraps and absorbs it.

**THE NO-SCROLL CLAIM IS SCOPED TO THE WIDTH THE ASK IS ABOUT, AND THE BOUND IS
MEASURED RATHER THAN CHOSEN.** The right-hand card is as tall as this book has
custodians — 17 legend rows, ~625px — and it is what decides the page:

| | 1920 | 1600 | 1500 | 1440 | 1366 | 1280 | 1024 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| side by side | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| page scroll | 0 | 0 | **0** | 0 | 99px | 63px | 295px |

So the cards are beside each other at every width from the `lg` breakpoint up,
and the page fits from 1440. Below that the card narrows, its subtitle wraps and
the viewport such a screen brings is shorter — **which is a fact about how many
platforms this family holds through, not about this layout**, so a narrow run
reports it rather than failing. The sweep's own width is 1500, so the claim
binds on every ordinary run. Compressing the legend was measured and refused: it
buys ~48px against a 99px gap at 1366 and makes the card denser everywhere for a
partial win at a size the family did not ask about.

#### Fourteen invariants, and twelve bugs reintroduced

**NOT ONE OF THESE FOUR CLAIMS CAN BE STRUCK ON PROSE.** The page renders the
identical words with the tiles present or absent, with the table above the pie
or beside it, and with the page scrolling or not — so every one reads a COUNT or
a BOUNDING BOX off a new `familyLayout` probe. The two cards are found
structurally for the same reason: the left by `data-family-table`, **the right
BY THE PIE INSIDE IT**, because its own title flips to "Custody" on a book with
no in-house bucket, so even the title is not a constant. `[data-stat-value]` is
what a `StatTile` emits and what nothing else does, so the tiles are COUNTED
rather than named — a fifth tile a redesign adds fails it too.

**AND THE TWO MOVED CLAIMS ARE ASSERTED TO SURVIVE**, which is the half a
removal like this breaks quietly: a build that dropped the tiles AND the split
they printed satisfies every absence check here and loses two figures in silence.

Each bug was put back on its own, rebuilt and swept, with the harness restoring
BY COPY on a `trap … EXIT` and **rebuilding on the way out** — restoring the
source alone leaves `dist/` at the bugged build for the next run to report under
the wrong name. A no-patch CONTROL ran first. All twelve fire, and five fire a
SECOND check from a second direction, which is what says the claims are
independent rather than one test written twice:

| Bug put back | Fires |
| --- | --- |
| a KPI tile | the tiles-are-gone count |
| the split line deleted | the split check **and** its arithmetic check |
| the split's working deleted | the arithmetic check |
| the in-house note on EVERY legend row | the one-row check |
| the in-house note deleted | the same |
| the bar chart | the bar check **and** the no-scroll check |
| the pie deleted | the pie check, the geometry check **and** the in-house note check |
| the Custody column (head and body) | the column check **and** the no-scroll check |
| …the header cell alone | the column check **and** the row-width check |
| the entity cell's hover deleted | the platforms-survive check |
| the table sorted by name | the ranked-by-value check |
| the two cards stacked | the geometry check **and** the no-scroll check |

**THE NO-SCROLL CHECK IS LOAD-BEARING RATHER THAN TRIVIALLY TRUE** — three
separate bugs push the page past the viewport and it catches all three.

**AND THE INVARIANTS RUN ON THE FIRST THEME AND WIDTH ONLY**, by this sweep's
own design: a claim about structure is theme-independent, and the dark walk
exists for the contrast check. So a bug firing on `light/1500` alone is the full
signal, not half of one — worth writing down, because a harness that dumped both
rows reads as though only one of two caught it.

#### Merged with main, and the page's conflict was the one worth getting right

This branch was held open at the family's request (*"do not merge until i tell
you to"*) and **four commits landed on main while it waited**, among them Stage
10bh and Stage 10bi. The merge hit both of the things this file already tells a
future session to expect — **for the seventh time each**:

- **THE LETTER COLLIDED AGAIN.** Both branches wrote `### Stage 10bh`. Main's
  keeps it and 10bi with it; this section is **10bl**. It is referenced nowhere
  else in the file, so only its own heading moved — checked rather than assumed,
  because the eight other `10bh` references all belong to main's section and
  must NOT move.
- **AND THE `ctx` LITERAL CONFLICTED ON ONE LINE.** Resolved as a **MECHANICAL
  UNION** — main's nine new keys (`pageNav`, `tileStrip`, `tileMenu`, `tilePick`,
  `tableView`, `arrange`, `returnHead`, `tableWidth`, `txnRecord`) beside this
  branch's `familyLayout`, **73 keys with no duplicates**. Taking either side
  whole is a clean-looking sweep that has stopped checking, and this file's own
  measurement is that half of those losses are abstentions rather than failures.

**AND IT HAPPENED AGAIN AN HOUR LATER, WHICH IS WHY THIS IS TWO MERGES AND NOT
ONE.** Stage 10bj (#60) landed while this branch's sweep was still running — the
same thing Stage 10bi records happening to the Polycab branch — and brought the
IDENTICAL pair for the **eighth** time. The `ctx` literal conflicted on the
SECOND of its two lines this time (`familyLayout` against `cioTabs` and
`cioLayout`), unioned the same way to **75 keys with no duplicates**.

**AND THE LETTER DID NOT CONFLICT AT ALL, WHICH IS THE DANGEROUS CASE.** Both
branches had written `### Stage 10bj` in DIFFERENT parts of the file, so git
merged them cleanly and left **two sections carrying one letter** — no marker,
no warning, and a `See Stage 10bj` cross-reference that would silently point at
whichever came first. Main's keeps it; this section is **10bl**. **Each of the
five `10bj` lines was read before any moved**: two are main's own section and
its self-reference, one is a `See Stage 10bj` inside Stage 10d that is about the
Morning CIO panels and therefore main's, and only the remaining two are this
branch's. Repointing them in bulk would have made a stage about Family &
Entities cite a page it does not touch — which is exactly what Stage 10bi
records taking the care to avoid.

**AND A THIRD TIME, HALF AN HOUR LATER — THE NINTH OF EACH.** Stage 10bk (#61)
landed while this branch's second sweep was running. The `ctx` literal conflicted
again (`familyLayout` against `polycabDom`) and unioned to **76 keys**; the letter
collided again, because that branch had ALSO moved to `10bk` for the same reason
this one had. Main's keeps it and this section is **10bl**.

**AND THAT ROUND IS THE ONE WORTH THE WHOLE PARAGRAPH, BECAUSE NOTHING WOULD
HAVE REPORTED IT.** GitHub read the PR as **`clean`** and a `git merge-tree`
trial reported **zero conflict markers** — both true, and both blind to the
defect, which is not a textual overlap at all: two sections under one letter in
different parts of one file. It was caught by *comparing the stage letters on
main against the branch's own before merging*, which is now the third thing to do
on every merge here, beside the ctx literal and the generated files. **A clean
merge is not the same as a correct one**, and this file's own rule — a generated
or bookkeeping file that merges WITHOUT conflicting is exactly when to re-derive
it by hand — extends to the letter.

**AND THE PAGE ITSELF IS THE UNION OF INTENT, NOT A SIDE.** Stage 10bh converted
every table to a declared-column model (`useTableView` + `SortHeader`/`Tr`) and
gave this one a **sortable Custody column** — the very column this branch
removes. So main's model stays and the removal lands on top of it. **Reverting
to plain `<tr>`/`<th>` would have resolved the conflict and failed Stage 10bh's
own GLOBAL invariant**, which asserts on EVERY route that every table sorts and
every column but the first moves.

**AND THE COLUMN HAD TO LEAVE THREE PLACES, NOT ONE.** Under that model a column
removed from the MARKUP alone leaves a declared id with no cell — which puts
every later cell under the wrong header the moment a reader reorders — and an
accessor for an id nothing declares is the dead-accessor defect Stage 10bi's own
record names finding. `ENTITY_COLS` is 8, the header draws 8 and each row writes
8, asserted together.

**ONE PREMISE OF A CHECK MOVED WITH THAT MODEL AND IS WRITTEN DOWN RATHER THAN
TESTED FOR.** The ranked-by-value invariant reads NAV at `cells[1]`, which is the
DECLARED order; `Tr` permutes cells into the READER's. The sweep opens a fresh
context so the default holds, and `useTableView` keys its store per table, so no
other route can arrange this one. A reader who reorders this table by hand makes
that check's own premise false rather than the page wrong.

`build` · `tsc` · `test:ingest` 49 + 31 + 84 + 35 + 30 + 140 (2 not checked, 0
blocked) · `test:family` 18 suites · `check:family` **82/0** · `check:pages`
**186 combinations clean, zero invariant failures**, with **six** EVIDENCED
abstentions. **NONE of them is one of this change's fourteen**: `family` and
`family-entity` report zero failures AND zero abstentions on both themes, which
is the half that would otherwise read as a clean run.

**AND SIX IS THREE CLAIMS, NOT SIX, WHICH IS WHY IT IS STATED RATHER THAN
QUOTED.** Stage 10bj's own record says three, and the difference is entirely
that stage's doing: it split Morning CIO into four routes, and the single
pre-existing KPI-tile claim (*every tile on this book carries a figure*, so the
absent-tile branch has no subject) now abstains ONCE PER ROUTE — `cio`,
`cio-allocation`, `cio-nav`, `cio-nav-live`. The other two are Stage 10bh's
crumb claim on the not-found route and Stage 10ba's pledge claim on `stock-qty`,
which `stock-pledge` asserts as a hard failure so it never stands alone. A count
carried across from another branch's paragraph would have read as three and hidden
that; the number is what this tree measures.

**THE SWEEP COUNT IS MEASURED ON THE THRICE-MERGED TREE, AND IT RECONCILES ONLY
BECAUSE EACH SWEEP WAS RE-RUN.** This branch's own pre-merge run was 168 and
adds no route; Stage 10bh and 10bi took it to 180, which the FIRST merge
measured; Stage 10bj adds six, so the SECOND measured **186**; and Stage 10bk
adds **none** — its Polycab work reuses routes the sweep already walked — so the
third measured 186 again, to the combination. **That last one was PREDICTED TO
MOVE AND DID NOT**, which is the whole argument for re-running rather than
reasoning: a figure adjusted by arithmetic from another branch's paragraph would
have been wrong in the one direction nothing on screen could show. Every claim
here is struck on `/family`, which the sweep already walked, so the number moving
on this branch's own account would have meant a route appeared somewhere nobody
looked.

`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control on the merged tree: **neither side touched a
generated file, so the merge had nothing to splice** — and the control was run
anyway, because the first is what made this merge safe and only the second would
have caught it had it not been.

### Stage 10bm — THE MARK IS A COLUMN, AND THE PAGE STOPS CHOOSING WHICH STATEMENT IT BELONGS TO

*"Open PR and do not merge until i tell you to."* · *"In some funds, avg cost
column has price but current NAV is not there… for eg. in Motilal Active
Momentum and same for Helios as well. We need a column of current NAV. Find the
root cause of this and fix, why current NAV is missing when avg. cost is already
given."*

#### The report was right about the screen and backwards about the book

**THE MODEL CARRIES THE NAV AND NOT THE AVG COST — the exact reverse.** Measured
before anything was written, which is the whole reason the answer is a column
rather than an ingest fix:

| | |
| --- | ---: |
| positions carrying `currentPrice`, a per-unit mark | **355 of 371** |
| carrying `Position.avgCost` | 285 |
| **Motilal Oswal Active Momentum** | `avgCost: null`, `currentPrice: 14.0491` |
| **Helios Flexi Cap — Direct Growth** | `avgCost: null`, `currentPrice: 16.21` |

So nothing was missing from the archive and nothing needed re-extracting. **The
page DERIVED the figure it showed and never read the one it had**: `StockInfo`'s
Avg cost tile is `costBasis ÷ quantity` (₹14.05 on Active Momentum, from two
primitives the statement prints), and the mark sat in `Position.currentPrice`
with no column to render it in. Had the tile simply read `Position.avgCost` the
family would have seen the reverse complaint — a NAV and no cost. **The
asymmetry was the defect, not the absence.**

**AND IT WAS ONE PAGE OUT OF SIX.** Checked rather than assumed: the Portfolio
Monitor draws `AVG COST` and `CMP` (₹14.05 / ₹14.05 on that very holding, with
the not-live `◦`), `MandateHoldings` draws both, `exportPortfolioExcel` writes
both, and `/holdings` and Private Market draw NEITHER per-unit column — they are
money tables, deliberately and symmetrically. `/stock/:securityKey` was the
single outlier, and it is the page a reader opens when they want one holding.

**THE HEADER DID CARRY A MARK, WHICH IS WHY THIS WAS EASY TO MISS FROM THE
SOURCE.** Top-right, 2xl, captioned with its statement date. What the table had
was Avg cost, then `Invested`, then **`Current` — which is the market VALUE**, so
a reader scanning the row for a price finds a column called Current and it is
money. The ask names the right fix: a column, beside the cost. *(The header's
mark is the PRICE TILE since Stage 10cn — one of six tiles above the position
page's tabs — and the one-figure-or-none rule below governs it unchanged.)*

#### …and reading the header's own figure found a quieter fabrication

`const cmp = rows[0]?.currentPrice ?? null` — the FIRST ARRAY ELEMENT's mark,
printed as the holding's price. A holding several statements report has several
marks, and **10 of this book's 213 securities carry marks that render
DIFFERENTLY**:

| | | |
| --- | ---: | ---: |
| Gland Pharma | ₹2,667.30 · Carnelian, 10 Aug | ₹2,502.90 · SVAN, 31 Jul |
| DSP Gold ETF | ₹151.10 on ₹3.1 Cr | ₹141.24 on **₹16.9 Cr** |
| HELIOS FCF D-GROW | ₹14.18 | ₹15.74 |

**TWO DIFFERENT CAUSES, AND THE PAGE MUST NOT ASSERT EITHER.** Gland Pharma's
pair is §3 working exactly as documented — two statements drawn ten days apart.
The other two are NOT: same provider, same ISIN, **same 31 July as-of**, two
rates. That is the extractor join `docs/BOOK-REPORT.md` already names among its
eight, REFINED by this measurement — the account as-ofs agree, so the date
explanation this file offers for the Helios spread does not cover that pair.

And `rows` is unsorted while the table sorts by value, so on DSP Gold the page
printed **the mark belonging to 15% of the position**, above a table it never
showed. Nothing on screen could catch it: it is a real price, correctly
formatted, from a real statement.

#### The design: show it per statement, refuse to blend it

- **THE COLUMN IS PER ROW**, reading `Position.currentPrice`, with the statement
  and its date in the cell's own hover. That is where the answer is unambiguous
  — one row, one statement, one mark — and it is strictly more informative than
  any holding-level figure could be, because it is the only surface in this app
  that can show the ten splits at all.
- **NEVER `marketValue / quantity`.** The price is a PRIMITIVE here (§4b), and
  the two are not the same number: `ICICI NFT NT 50 DP G` prints a rate of 60.4
  against a value column implying 60.4167. Deriving it would publish a figure the
  document does not.
- **THE HEADLINE AND THE FOOTER SHOW ONE FIGURE OR NONE.** Where every statement
  renders to one mark it is shown; where they do not, both render an absence
  NAMING the marks and sending the reader to the table. A quantity-weighted mean
  of ₹2,667.30 and ₹2,502.90 is a price no document struck, sitting in the Total
  row of a column whose every other cell is a figure some statement printed —
  "a total must tie to its own columns", one column over. The avg-cost footer
  beside it legitimately DOES blend, and the distinction is the whole of it:
  cost and quantity both ADD across statements, and prices do not.
- **THE TEST IS WHAT THE RENDERER CAN DISTINGUISH**, not an invented tolerance.
  Two marks the page would print identically are one figure to a reader; two it
  prints differently are genuinely two. So the agreement test runs the marks
  through `price()` — the page's own printing precision reproduced, which is the
  bound this file already requires of every delta it explains.
- **AN ABSENT MARK NAMES ITS OWN CAUSE, and the two causes are worded apart.**
  13 securities are reported at a total value and no price; told the statements
  disagree, a reader would go looking for a second figure that was never
  printed. `price()` returns a BARE dash, which §2 forbids, so both cells guard
  before calling it.

**A LATENT BUG WENT WITH IT.** The header's caption dated the shown price by
`rows[0]`, which may be a row carrying NO mark — so on a holding whose first
statement is unmarked it dated the figure to the wrong document. It reads the
statement that actually supplied the mark.

**AND ONE ASYMMETRY IS LEFT STANDING RATHER THAN QUIETLY CHANGED.** The Avg cost
TILE derives `cost ÷ quantity` and the Avg cost COLUMN prints `Position.avgCost`,
so on these two funds the tile reads ₹14.05 and the column reads `—`. Both are
defensible — the tile aggregates and derives (§4b), the row prints what its
statement printed — and making the column derive too is a change to what that
column MEANS on all 371 rows, which is a decision about the document rather than
a missing figure. Named here for the family rather than made on their behalf.

#### The checks, and the harness defect that cost this branch its work

Two routes, both DERIVED from `glowData.ts` on the run so the next drop picks
its own worst case: `stock-cmp-split` (the split holding, largest by value) and
`stock-cmp-unmarked` (the largest with no per-unit mark). `CMP_BOOK` is
RE-EXPRESSED in `check-pages.mjs` rather than imported from `StockInfo` — a
check that calls the helper it is checking agrees with it by construction, and
the two agreeing is the measurement.

**A MISSING SUBJECT IS A FAILURE, NOT AN ABSTENTION.** An unresolved address
lands on a page with no table, which has no console error, no overflow and no
stray zero — it would satisfy every generic check while asserting nothing. Each
route states its own premise so the pair can never pass over nothing.

**AND THE REFUSAL IS ASSERTED FROM BOTH ENDS, which is the half that could have
swallowed the book.** A build whose agreement test never agrees satisfies every
absence check on the split route and prints a dash over the 190 securities whose
statements agree. `stock` therefore asserts the figure is SHOWN where there is
one, reconciled against the table's own `data-cmp` — the book's figure — rather
than against another rendering of itself.

**THE CELLS ARE READ STRUCTURALLY AND COMPARED NUMERICALLY.** `data-cmp` carries
what the BOOK holds and the cell text what a reader sees, so a cell that stopped
rendering its own attribute's value fails on the pair. The first draft compared
DIGIT STRINGS and failed three invariants against a page that was right: `Intl`
renders ₹151.10 where the page's `price()` renders ₹151.1, and `"151.10" !==
"151.1"` while the two are one mark.

**AND THE REASON IS CAPTURED PER CELL, because `innerText` cannot see it.**
`AbsentCell` puts its cause in a `title`, so a cell that fell back to `price()`'s
bare dash renders identically to one that names why — the check could not have
told them apart, which is the trap this file already records for the cost cells.

**THE HARNESS ITSELF WAS THE FIRST DEFECT, AND IT DESTROYED A DAY'S WORK.**
`restore()` deleted the snapshot it restored from, so the first explicit restore
removed the only copy and every later one silently did nothing: bugs 2–8 ran on a
tree nobody had cleaned, reported each other's failures under the wrong names,
and **the run still exited 0**. That is this file's own *"a restore that cannot
restore looks exactly like one that did"*, arriving for the third time. Worse,
clearing up after it with `git checkout --` on an UNCOMMITTED tree threw the
whole change away and it had to be rebuilt from the session record.

Two rules follow, and the second is the one that actually cost something:

- the snapshot is removed by the TRAP and never by `restore`, and `restore`
  VERIFIES with `cmp -s` rather than assuming the copy took;
- **the work is COMMITTED before a destructive harness runs at all.** A pass
  that rewrites the files under test is not something to run against
  unversioned work, however careful the trap is.

Nine bugs reintroduced, each firing its own check.

`build` · `tsc` · `test:ingest` · `test:family` · `check:family` · `check:pages`.
`npm run build-book` regenerates `glowData.ts` and `docs/BOOK-REPORT.md`
BYTE-IDENTICALLY, run as a control before and after: nothing here touches the
ingest, and a column that moved a generated figure would not be a column.

### Stage 10bn — THE PUBLISHED NAV IS THE CURRENT VALUE, FETCHED DAILY

*"Current value of any fund or Mutual Fund that can easily be fetched from
online sources should show present value… These NAV must be automatically
fetched everyday and refreshed. Daily and regularly."* · *"Live values of any
investment, we should show it on all the relevant places automatically on the
dashboard."*

**A MUTUAL FUND RESOLVES NO NSE TRADING SYMBOL, AND EVERY LIVE ENDPOINT THIS
DASHBOARD CALLS IS KEYED ON ONE.** That is the whole root cause, and it is why
the quote feed had never priced a scheme: a fund's value sat at whatever mark
its last statement struck, however old. Measured on the two the family named,
that is a month of drift — Motilal Oswal Active Momentum marked ₹14.0491 on 6
August against a published ₹14.5522, Helios ₹16.21 on 7 August against ₹16.16.

**HALF THE PIPELINE WAS ALREADY HERE AND NOTHING REFRESHED IT.**
`public/lookthrough/` has carried each scheme's NAV since Stage 10s and the
daily-NAV movers card has rendered it since Stage 10aw. What was missing is that
**no workflow ever ran `build-lookthrough`** — the committed NAV was twelve days
old — and that the figure reached no holding's value. So this is not a new
source so much as the missing half of one.

#### `npm run build-fund-navs` — AMFI's own file, joined on the ISIN

```
portal.amfiindia.com/spages/NAVAll.txt   keyless, 14,379 scheme rows
   |  npm run build-fund-navs            fetch → join → gate → merge
   v
src/data/fundNavs.ts                     20 schemes, each with its own as-of
docs/FUND-NAVS.md                        priced / resolved-not-usable / unresolved
```

**IT IS THE INDUSTRY BODY'S OWN RECORD**, not a proxy and not somebody's reading
of one. `www.amfiindia.com` 302s to the portal host; the builder FOLLOWS the
redirect rather than pinning either, and **checks the response BY CONTENT** — a
portal answering 200 with an error page is the failure `build-symbols` already
records against NSE.

**TWO IDENTIFIER TIERS, STRONGEST FIRST, AND NO FUZZY ONE.** A wrong join here
is the worst fabrication available: a complete, correct, well-formed NAV
belonging to somebody else's fund, which nothing on screen could catch. The
family's own statement first, then the look-through's resolved ISIN — **which is
what reaches Motilal Oswal Active Momentum, whose statement prints no ISIN at
all**. Where both answer they must AGREE, and a disagreement yields nothing.

**AND WHAT IT WRITES IS NOT THE BOOK.** `src/data/fundNavs.ts` sits beside
`polycabLive.ts` on identical terms — generated, committed daily by a workflow,
read at DISPLAY time. `glowData.ts` regenerates byte-identically from `source/`
(§7), so a fetched price may never enter it, for the same reason a live quote
may not.

#### The basis gate, which is what stops a ten-fold error

A published NAV values a holding as `quantity × NAV`, and that is true only
while the book's units and the AMC's NAV unit are the same unit. **On this book
they are not, twice:**

| | book's mark | published NAV | ratio |
| --- | ---: | ---: | ---: |
| DSP Gold ETF | ₹151.10 | ₹14.7633 | **0.098** |
| DSP Silver ETF | ₹276.82 | ₹22.4561 | **0.081** |

A SHARE-COUNT BREAK — the book's units pre-split, the NAV post-split. Valued
naively the family's **₹16.9 Cr of gold reports as ₹1.76 Cr**. This is Stage 10e's
`shareCountBreaks` finding arriving through a different source, and the rule is
the same: **reported, never corrected.** Adjusting would invent a factor nobody
published.

**THE BOUND IS A FACTOR OF TWO, AND IT IS A CLAIM ABOUT MARKETS RATHER THAN A
TOLERANCE FITTED TO THE DATA** — no scheme halves or doubles between two
statement dates absent a corporate action. It separates the real cases by an
order of magnitude: the schemes that pass span 0.92–1.14 and the two that fail
sit at 0.08 and 0.10. **The failure mode is deliberately asymmetric**: refusing a
good scheme costs a refresh and keeps the statement mark, while accepting a
broken one prints a figure wrong by 10x. A refused scheme still CARRIES its NAV,
marked `usableForValue: false` with the reason — the family asked to SEE it.

**BOTH DSP ISINs TURN OUT NOT TO BE IN AMFI'S FILE AT ALL**, which Stage 10ak
already predicted (*"NSE has moved the DSP Gold and Silver ETFs to new ISINs"*),
so the dangerous case ALSO self-excludes. The gate stays because the next drop
could bring one that resolves — and `fundNavs.test.ts` reports it **NOT CHECKED
rather than passing over an empty set**, because `[].every(...)` is true and the
obvious assertion would report a working gate on a run where it never ran.

**THE DAY CHANGE ACCUMULATES.** NAVAll is one day's snapshot, so the previous NAV
is whatever the committed file already held — merge-never-truncate, the rule
`rbi.mjs` and `iex.mjs` are built on. A first run has no day change and says so.

#### `applyFundNavs` — one seam, which is what "all the relevant places" means

Applied in `PortfolioContext` beside `applyQuotes`, so **every page that reads
`portfolio` gets the current value with no per-page edit**. Measured:

| | |
| --- | ---: |
| schemes overlaid · position rows | 18 · 25 |
| those rows, statement basis → published NAV | ₹101.08 Cr → **₹103.87 Cr** |
| the book | ₹710.39 Cr → **₹713.18 Cr** |
| Motilal Oswal Active Momentum | ₹21.4 Cr → **₹22.2 Cr** |

**AND IT RESOLVED A SPLIT THIS BRANCH HAD JUST FOUND.** Stage 10bm records the
two Helios depository rows marked ₹14.18 and ₹15.74 — same provider, same ISIN,
same 31 July as-of. Both now take the one published NAV, because a scheme has
one NAV whatever a depository printed.

**THE BASIS RULE IS `applyQuotes`'s, VERBATIM**, and `fundNavs.test.ts` asserts
§6 FIELD BY FIELD: quantity, cost, realised, dividends, accrued, the dated
fields and the intraday fields are frozen. An overlay that quietly moved a cost
renders a page full of plausible figures and no structural check would see it.

**AND `live` STAYS FALSE, WHICH IS THE ONE THING NOT COPIED.** A quote is
intraday; a NAV is struck once after the close, and Stage 10aw is explicit that
the two must never be added. `live` gates Today's movers and the day-change
column, so setting it would fold a NAV dated yesterday into a card headed
"today". A NAV-priced row carries `navPriced` and its own `navDate` instead, and
the intraday fields are left untouched.

**THE DISPLAY STOPS CALLING IT A STATEMENT MARK.** The Monitor's not-live `◦`
marker and the stock page's headline caption (the price tile's line since Stage
10cn) and per-row hovers name AMFI and
the publication date. A figure from one source wearing another's label is the
only thing here that could mislead, and the caption is the only thing on the
page that can tell a reader which it is.

#### Two checks changed, and one failure was real

**THE CHECKER'S MODEL OF THE BOOK IS NOW THE ONE THE PAGES RENDER.** Thirty
derivations read `BOOK_POSITIONS` and reconcile against a RENDERED figure; left
on the statement basis they compared two different books and **eleven partition
checks failed against pages that were right**. `withPublishedNavs` is applied
inside `bookArray` — one place rather than thirty, because thirty patches is
thirty chances to miss one — and is RE-EXPRESSED rather than imported, on the
same terms as `isMandateHeld`.

**`stock-cmp-derived` IS RETIRED RATHER THAN LEFT UNABLE TO FAIL.** Stage 10bm
added it to prove the book's mark is READ rather than computed as value ÷
quantity. The overlay sets `marketValue = quantity × NAV`, so **on every priced
holding the two are equal BY CONSTRUCTION and the one witness is itself priced**
— the rendered page can no longer see the distinction at all. The claim moved to
`fundNavs.test.ts`, where it is still true of the book; `stock-cmp-nav` takes the
route's place and checks the overlay on a rendered page.

**AND PM-2 WAS READING THE TOP BAR.** It took the first `₹…Cr` in the body text
as the book's NAV — which is the TOP BAR's current value of holdings, app chrome
rather than part of Private Market's arithmetic. The two coincided for as long
as nothing could price a fund and parted the day one could: **the top bar is
LIVE and that page reads `statementPortfolio` by design** (§6 — a reader checks
those rows against the PDF, so they must not drift with a price). It is struck on
the page's own printed denominator now (*"N% of the ₹X Cr book"*), which is the
figure its parts are a partition OF.

**THAT WAS ESTABLISHED AGAINST A WORKTREE AT THE PRIOR COMMIT, NOT REASONED
OUT.** The page text is byte-identical before and after the overlay, and the
check computes the same 358.10 on both — so the failure is where the two bases
genuinely part rather than a regression. Three rounds of guessing preceded that
measurement and every one of them was wrong; the worktree settled it in a minute.

**WHAT THIS LEAVES ON SCREEN, STATED RATHER THAN GLOSSED:** the top bar now
reads ₹713.18 Cr while Private Market reads ₹710.4 Cr. Both are correct on their
own basis and both are labelled, and a reader can see them a screen apart. It is
also PRE-EXISTING in production — a live equity quote already moved the first and
not the second — and only became visible without a quote feed. Moving Private
Market to live basis would reconcile them at the cost of the guarantee that page
was built on, which is the family's call and not this file's.

`build` · `tsc` · `test:ingest` · `test:family` (a new `fundNavs.test.ts`: 18
assertions, 1 honest NOT CHECKED) · `check:family` 82/0 · `check:pages`
**192 combinations clean**, with the same six evidenced pre-existing abstentions
and none of this stage's own. `npm run build-book` regenerates `glowData.ts` and
`docs/BOOK-REPORT.md` BYTE-IDENTICALLY — a fetched price never enters the book.
