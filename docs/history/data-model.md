# The data model

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 589–2571). CLAUDE.md now carries the condensed rules; this file is the record. -->

## The data model, and why it differs from a workbook-sourced book

This book comes from PDF statements across several wealth platforms, not from one
spreadsheet. Four things follow, and they are load-bearing:

**What is actually in `source/` today.** NINE DELIVERIES, and every one stays:
the original set at the top of `source/`, the client's `august-2026/` folder,
`august-2026-b/` to `august-2026-f/` — statements that arrived after it —
`september-2026/`, the client's `Jaisinghani_Reports.zip` (Stage 10da), and
`october-2026/`, Green Lantern 510861 since inception (Stage 10dk). **ALL NINE
have been through `npm run extract`**: `august-2026-f/`'s two outlined-text
statements are read by rendering their glyphs (see its own section) and its third
file is a register held out of the book by decision. 38 provider names in the
archive — ASK's PMS, the ASK Absolute Return Fund and Marathon are the newest —
**64 accounts** in the book, seven holders (three of them family trusts, Stage 10db)
and one `Not attributed to a member` bucket (Stage 10dh), and **363 leaf
files** — of which **309 documents** are in the archive (18 of them spreadsheet
exports read as WITNESSES of the PDF beside each), 242 read fully, 64 partially and
**exactly ONE not at all**:

- Bharat's HDFC NSDL holding statement from `august-2026-e/`, which is a SCAN —
  four JPEG pages of photographed paper, so there is nothing any reader or any
  renderer can recover. Reported as `no-text-layer`, never as a missing reader,
  because those two send the next person to do completely different things and
  only one of them is possible.

Two more documents are `failed` in the archive and are NOT that: the adviser's
consolidated review workbook and the family's investment register are both read
perfectly and are **held out BY DECISION**, because neither is a statement. The
archive records the decision so a future session cannot mistake it for a gap.

**AND `npm run coverage:source` PROVES THERE IS NO OTHER GAP.** The extraction
report answers *did the documents we read tie out?*; that question presupposes a
prior one nobody could answer without reading a directory listing by hand — *is
there a file in `source/` whose data never reached anything?* `scripts/source-coverage.mjs`
accounts for every leaf file in exactly one class and **exits non-zero if any is
`unread`**, so a delivery that lands a file nobody reads cannot pass silently.
Measured on the September 2026 delivery (Stage 10da): 277 read, 4 read via a
byte-identical twin, 18 read as witnesses of the PDF beside them, 2 held out by
decision, 58 macOS `__MACOSX/._*` resource forks (checked per file for a `%PDF`
header, never assumed from the path), 2 password notes excluded by policy, and
**0 unread** — 361 leaf files. On the October 2026 delivery (Stage 10dk) it is 363
leaf files, 279 read, and still **0 unread**. `docs/SOURCE-COVERAGE.md` is its output; the counts in this
paragraph come from it and from `docs/BOOK-REPORT.md`, and should be re-read from
them rather than edited to taste.

Every encrypted statement opens, every issuer whose statements carry text has a
reader, and `source/README.md` carries the rule for adding the next delivery.

**A MONTHLY DROP REISSUES THE SAME FILENAMES, and both issues must survive.**
`LKP 2.zip`, `GREEN LANTERN - ANKITA.zip` and `GREEN LANTERN - AJAY .zip` all
arrive again in August. `lib/bundle.mjs`'s caller used to expand every archive
into `source/_extracted/<basename>/`, so the later drop overwrote the earlier
one in place — and that is not a cosmetic clash, because a SNAPSHOT supersedes
but a DATED ROW does not. The capital gain lots and transaction tape carried
only by the July issue would have gone with the folder. The extraction path now
mirrors the archive's own path under `source/`, which is byte-identical for
every ZIP already at the top level.

*(The one-row-per-account table stays in CLAUDE.md, because `npm run accounts-table` regenerates it there.)*

**THIS COLUMN WAS TEN TIMES THE BOOK.** Every row read ₹976.8 Cr, ₹103.8 Cr,
₹11.2 Cr — while the consolidated figure below it, which is generated, was
right. The rows summed to ten times their own stated total, which is the
contradiction the footer rule already names: a reader who adds up the printed
cells and gets a different answer has found one, and no prose rescues it. The
column is regenerated from `BOOK_POSITIONS` now, and it is regenerated EVERY
TIME rather than patched: hand-merging rows to keep it short is what let eight
accounts go unlisted, and a row added by hand is a figure copied into prose. It
is one row per account, all 64 of them, sorted by value — and the words in the
right-hand cell are `Account.noPositionsReason`, routed rather than written, so
an account that changes WHY it is empty changes this table on the next run.

**AND THE RULE WAS ASPIRATIONAL UNTIL THERE WAS SOMETHING TO RUN.** It said
"regenerated" and nothing regenerated it, so the merge that brought the six
review accounts into the book (Stage 10dh) left this table untouched —
**six accounts unlisted, fourteen of the other fifty-eight carrying a stale
cell, and a column summing to ₹613.01 Cr against a book of ₹833.80 Cr.** Seven
of those fourteen read "no NAV published" over a holding the review values;
two named a face value where the review carries the line; three marks were the
statement's where the review's now stands; the ring-fenced account's fell by the
two private lines the review took over; and one demat's own reason gained the
count of its lines the review carries. That is the same defect as the
ten-times one, found the same way — by adding the printed cells up.
**`npm run accounts-table` prints it and `-- --write` splices it in**, and it
REFUSES rather than emitting one nobody can check: a `noPositionsReason` that
routes to no words, or a column that does not tie to `BOOK_SUMMARY.totalValue`,
exits non-zero. Both footnote markers are routed too — `\*` off
`SEPARATE_INVESTMENTS` and `\*\*` off `BOOK_POLYCAB`'s own account — because a
marker typed per row drifts, and the one hand-written attempt at these 64 rows
dropped `\*` from the two Transition ones.

\* one of two holdings of the same fund whose figures coincide on two accounts'
statements. The family confirmed on 28 Sep 2026 that each pair is two separate
investments, so every row is counted in full — see §4c and Stage 10cx. **All
four cells are the REVIEW's mark since Stage 10dh**, which is why both 360 ONE
rows read ₹1.46 Cr again where CRN37702's own statement of 31 Jul values the
same units at ₹1,46,68,362.66 — a disagreement `docs/BOOK-REPORT.md` names
rather than resolves.

\*\* **THE FAMILY HAVE SINCE SAID SO, AND POLYCAB IS RING-FENCED.** That row used to
read ₹12,415.02 Cr, of which **₹12,351.24 Cr was POLYCAB INDIA** — the family's
promoter stock rather than a portfolio position. The paragraph here posed the
question and named the reversal; the family answered it, and the answer is the
`/polycab` page. The account keeps its other 9 holdings and its own as-of; the
promoter row is out of this column and out of every total below it. *(It kept
11 until Stage 10dh: Blue Ashva and the Borosil warrant are private lines the
review carries, so they are counted under the review's own accounts now.)* See **The
ring-fence** section.

**Consolidated ₹833.80 Cr**: listed ₹599.20 Cr, private ₹234.59 Cr, and
**nothing left on neither side** — Blue Ashva was the one holding no document
placed, and the review names it. *(It was ₹713.56 Cr until Stage 10cz found the
three Motilal Oswal demats' Rate column to be the last movement's price rather
than a mark, ₹611.40 Cr after it, ₹613.01 Cr since Stage 10da read Buoyant's
31 Aug snaps — both folios' units at the 31 Aug NAV — and ₹833.80 Cr since
Stage 10dh made the family's consolidated review the source for the 89 private
lines no statement carries.)* The split reads the
family's own placing of a fund first and the SEBI category the statements print
second — see `shared/aifCategory.mjs`, Stage 10bp and Stage 10bw. *(It was
listed ₹655.82 Cr · private ₹37.88 Cr · not placed ₹16.69 Cr on the category
alone; the family then placed Founders and Delphi on the listed side and Neo
Infra on the private one. It was ₹710.39 Cr, private ₹10.62 Cr, while the two
pairs below were each counted once; the family then confirmed both are separate
investments — Stage 10cx.)*

**IT HAS BEEN WRONG TWICE, THE SAME WAY.** It was `listedValue: totalValue,
privateValue: 0` — true when every account was a listed-equity mandate, and false
the moment the AIF statements got a reader, at which point 62% of the book was
reported under a label that did not describe it. It was then `assetClass`, with
every AIF private — true of the AIFs the book held when that was written (both
drawdown vehicles) and false from the drop that brought the Category III folios,
at which point **₹297.78 Cr, 84% of the private half, was Sanshi, Buoyant and
Carnelian Bharat Amritkaal**: open-ended funds trading LISTED securities,
reported as private capital. *"These are not private market investments"*, as the
family put it.

**AND THE RING-FENCE TOOK ₹12,351.24 Cr OFF THE LISTED SIDE.** This heading read
*the listed half is now the smaller one* — true of the book it was written
against, where the fence left listed ₹358.04 Cr against private ₹352.35 Cr, and
false since Stage 10bw moved the Category III folios onto the listed side.
Before the ring-fence this book read ₹13,061.63 Cr, listed ₹12,709.28 Cr; the
promoter block was 95% of the whole and 97% of the listed side. Anything that
compares this book against an older figure of its own is comparing two different
sets, and the two are ₹12,351.24 Cr apart by construction rather than by drift.

Six PMS mandates run on one reporting system (Goldstandard, Green Lantern,
Carnelian, V.E.C Assago, Molecule, and SVAN's SEBI report); five are Category-III
AIF folios; six are drawdown AIF capital accounts, four of them Sky Capital's
angel-fund folios and two held by TRUSTS; two are 360 ONE Distribution
engagements; SEVEN are the family's own CDSL demat accounts at Motilal Oswal
and one more at LKP; one is a joint mutual-fund folio; and SIX issue no
statement at all — they are the holders of the private lines the family's
consolidated review carries, one per member plus `Not attributed to a member`
(Stage 10dh). The rest are single-scheme fund accounts, each issuing one
statement.

**SIX OF THE 64 HOLD NOTHING, AND THAT IS A MEASUREMENT.** HDFC 16180583's two
schemes are redeemed to nil units, and both classes of Motilal Oswal's Hedged
Equity Multi Factor Strategy are redeemed — Class B2 switched out, Class F1 paid
out ₹11.19 Cr on 31 July 2025 — with the Account Summary printing a DASH for
units and for valuation on each. A dash is read as null, so the account carries
no holding rather than a zero-valued one: its ₹13 Cr contribution set against a
zero value would book the whole of it as an unrealised loss against money the
fund has already paid back. The account is kept and states the reason, which is
why the two look nothing alike from a page: an account nobody wired and an
account that holds nothing are both empty, and only one of them is a defect.
The other four are in the table above with their own words, and they split the
same two ways: 3P's three classes and both ASK Absolute Return Fund folios carry
a position at a MEASURED ₹0, and Motilal Oswal demat 1201090037436848 carries
none, because its statement prints a nil balance.

**Read completely, and deliberately NOT in the book.** Four mutual-fund folios
(₹32,70,831.46) are held by `HOPE INDIA TRUST` — a separate taxpayer, filed by
each AMC as `Status : Trust`. WhiteOak's monthly scheme portfolio disclosure has
no folio, no units and no holder at all; it is the SCHEME's own holdings.
`docs/BOOK-REPORT.md` names all of them with their value, so nobody has to wonder
whether the money was missed or excluded, and one entry in `shared/owners.mjs`
reverses it if the family says the trust belongs here.

**A folio that was excluded on an unchecked premise.** This book's note used to
say all five mutual-fund folios were the trust's. HDFC 16180583 prints
`Bharat A Jaisinghani`, `Tax Status : Individual` and `Joint 1 : ANKITA
JAISINGHANI`, with both their PANs. It is the family's own and now in the book —
at a value of ₹0, because both its schemes have been redeemed to nil units. That
is a MEASURED zero and keeps its zero; contrast the two 360 ONE Alternates
folios, which no statement values at all and which render `—` with the reason.


**Two funds are reported under two accounts each, and each pair is two
investments.** 360 ONE Special Opportunities Fund Series 8 Class A3 appears under
CRN37702 and CRN60117 — the same 9,90,429.684 units on both — and Transition
Venture Capital Fund I — Class A1 under both Bharat Jaisinghani family trusts
(7,500 units, ₹1,71,45,962.25 each). Check (c) found both pairs because the
figures that would have to coincide by chance do coincide, and until 28 Sep 2026
the policy in §4c counted each once: **₹3.17 Cr** (₹3,17,26,374.76) was left out
of every consolidated total. The family then answered — *"both are separate
investments"* — and `shared/separateInvestments.mjs` records it, so neither pair
is a `dedupeGroup` and every figure counts all four rows. See Stage 10cx.

**AND THE 360 ONE PAIR STOPPED MATCHING ON FIGURES, WHICH COST ₹1.47 Cr.** They
were byte-identical (₹1,45,80,412.51 each) for as long as both CRNs published to
the same date. CRN37702 then advanced to 2026-07-31 and CRN60117 stayed at
2026-06-30, so the two marks diverged by ₹87,950.15 and check (c) — which keys on
the security plus the FIGURES that would have to coincide by chance — stopped
matching them. It still matched their JUNE issues, and tagged those. But
`newestPerReportType` supersedes: `build-book.mjs` takes 37702's JULY holdings,
which carry no tag, so the group reached the book with ONE member,
`dedupedPositions` had nothing to collapse, and the same units were counted under
both CRNs. *(The divergence is no longer on screen: since Stage 10dh the review
is what values 37702's row, at ₹1,45,80,413 against the statement's
₹1,46,68,362.66, so the accounts table above reads ₹1.46 Cr on both CRNs. The
defect below is about the TAG, which is unchanged.)*

Nothing failed and nothing said so — the consolidated total ran ₹1,45,80,412.51
above the truth, and the AIF section beneath it was over by the same amount.
**A tag that collapses nothing looks exactly like a book with no duplicates in
it.** (The figure is stated as the DELTA rather than as two totals, because the
totals move with every drop and the overstatement is the fact.)

Two things changed, and the second is the one that speaks up next time:

- **The tag travels across ISSUES of the same account.** `dedupeByAcctSec` in
  `build-book.mjs` carries a group established on any issue onto whichever issue
  the supersede rule picked. The duplication is a fact about the ACCOUNTS — two
  CRNs of one wealth platform reporting one AIF holding — not about one month's
  mark. Detection stays exactly as strict; only the tag moves. Same join as the
  ISIN and asset-class ones beside it: this drop's own paperwork, applied where
  unambiguous.
- **A group that reaches the book with ONE position is reported as a broken
  dedupe**, by name, in `docs/BOOK-REPORT.md`. That is the line that was missing.

**What this still cannot catch, stated rather than papered over:** a pair whose
figures never coincide at ANY as-of forms no group on any issue, so there is no
tag to carry. Widening detection to match on quantity alone is the wrong trade,
and that is measured rather than feared: it produced THREE false duplicates on
this corpus, each refuted by a document already in hand (see "…and then it was
flagging THREE pairs" below). So the residual risk is named here instead.
`duplicateAifEarnings` covers the income-only side of the same folio pair, which
is how this one was visible in the archive at all.

**Every issuer whose statements carry recoverable text has a reader.** Each earned
its own file because the layouts share nothing. The one issuer without one is HDFC
Bank's `august-2026-e` statement, and that is not a missing reader — it is four
JPEG pages with nothing on them to read (see the ring-fence section):

| Reader | Documents | What it reads |
| --- | ---: | --- |
| `providers/altFundStatements.mjs` | 33 | twelve single-scheme fund statements — Buoyant, Helios, Motilal Oswal's Founders, Active Momentum, Delphi and Hedged Equity funds, 3P, India SME, Sky Capital's angel fund, Neo Infra, Baring PE and Carnelian's Bharat Amritkaal. One reader, twelve declared layouts, each keyed on the FUND rather than the distributor whose stationery it arrives on |
| `providers/pmsStatements.mjs` | 76 | the house statement sets — six managers, one reporting system |
| `providers/pmsInvestorReport.mjs` | 5 | the SEBI PMS INVESTOR REPORT, keyed on the REPORT TYPE rather than the house: SVAN issues it monthly and Green Lantern quarterly, and it is one prescribed layout |
| `providers/threeSixtyOne.mjs` | 4 | 360 ONE Private Wealth's client-level PORTFOLIO ANALYSIS REPORT |
| `providers/aifDistribution.mjs` | 5 | 360 ONE ALTERNATES — a different issuer from the wealth arm. Distribution letters and statements of earnings, carrying AIF income split by TAX HEAD |
| `providers/sanshiFund.mjs` | 5 | Category-III AIF monthly account statements |
| `providers/transitionVenture.mjs` | 2 | drawdown AIF capital accounts — the only source of an undrawn COMMITMENT |
| `providers/lkpSecurities.mjs` | 4 | a self-directed demat account, in three file formats — the only LOT REGISTER in the book |
| `providers/mutualFundFolio.mjs` | 5 | folio statements, three different layouts behind one reader |
| `providers/motilalDemat.mjs` | 12 | the family's own CDSL demat accounts — SEVEN of them, keyed on the `Client ID:` the page prints because three of the twelve FILE NAMES name the wrong member |
| `providers/nsdlDemat.mjs` | 1 | the family's NSDL account at ICICI Bank — the mirror image of the CDSL reader, with NO RATE COLUMN, so value is the primitive and the price would be the derived thing |
| `providers/hdfcNsdl.mjs` | 2 | the two trusts' NSDL accounts at HDFC Bank — the only reader in this book working on text recovered by RENDERING, and the only one that REFUSES its document unless the rows reproduce the statement's own printed total to the paisa |
| `providers/bankAdvice.mjs` | 2 | ICICI payment receipts — read in full, attributed to nothing, because a receipt names no holder and no security |
| `providers/schemePortfolio.mjs` | 1 | a fund's own SEBI portfolio disclosure — archived for look-through, worth nothing to the book |

**Three files are BUNDLES.** `lib/bundle.mjs` splits a PDF by the report title
each page reprints, because a run of pages sharing one title is a document:

- `Molecule_June_2026_392.pdf` — 8pp: fact sheet, CURRENT PORTFOLIO, transaction
  statement, capital gain, expense statement. Filed as a single fact sheet, its
  holdings arrived with a market value and no quantity, no unit cost and no price
  while pages 2–3 printed all three.
- `GREEN LANTERN - AJAY.pdf` — 15pp: PMS INVESTOR REPORT, capital gain, expense
  statement, corporate benefits. Filed as a contract note, a type with no reader,
  so 15 pages of a ₹11.7 Cr account contributed nothing while the coverage table
  reported "no reader" about a document four readers here already handle.
- 360 ONE's client report carries its transaction and corporate-action statements
  inside the holdings document, which is why superseding one issue of it used to
  discard that month's corporate actions.

A file whose pages resolve to FEWER THAN TWO report types is not a bundle and is
returned untouched, so every single-report PDF takes the path it always took.

**A phrase in a footnote is not what a document is.** All four SVAN statements
were classified `contract-note` because the report's own footnote reads "…
customarily included in the contract note of broker". Title rules now run before
keyword rules. The same class of mistake, one layer up: `360 One WAM Limited` is
a listed company, WhiteOak's fund holds ₹10.16 Cr of it, and matching `360 ONE`
against the whole text filed that scheme's disclosure under 360 ONE Private
Wealth. Issuer rules match the LETTERHEAD; only titles match the whole document.

**Whose folio is it? The statement says, in words.** Every AMC prints the
holder's tax status because it must — `Status : Trust`, `Tax Status :
Individual` — and that printed word is what decides whether a folio belongs in a
family book. Not the PAN: two of these mask it (`XXXXX4894A`), so a PAN-only rule
would have failed on exactly the statements that needed it. Where a PAN IS
printed in full it is used too, and its fourth character says whether the holder
is an individual (`P`) or a trust (`T`).

**Owners resolve on PAN first.** `shared/owners.mjs` tries the PAN before any
name rule, because a PAN is issued once per taxpayer and printed on the page
while a name is a spelling. That settled a question this book had reasoned the
wrong way round: `BHARAT AJAY JAISINGHANI` and `BHARAT JAISINGHANI` print the
same PAN and are one man. The initials rule was right about what it could see; it
simply had no access to the fact, and neither did anyone else, because the fact
was on page one of a statement nobody had a reader for. Two aliases seeded by
analogy and observed on no statement were removed.

The fourth character of a PAN also keeps the two Transition Venture TRUSTS from
being folded into the man they are named after — `T` is a separate taxpayer, not
a nickname — and `AARTI AJAY JAISINGHANI` is now a canonical owner on her own PAN
and her own folio. Leaving her unresolved was not the neutral choice it looked
like: her ₹976.8 Cr was already in the consolidated total, attributed to nobody.

**A PAN that is also a document password is NOT written into the registry.** The
alias it justifies is listed instead and the evidence recorded in words. Anyone
extending `shared/owners.mjs` follows the same rule.

### The August 2026 drop — what came in, and what it could not tell us

The client's `august-2026/` folder brings 13 files. Six accounts advance their
as-of — Goldstandard to 11 Aug, Carnelian to 10 Aug, SVAN 8710067 to 31 Jul,
both Green Lanterns to 27 Jul — and the consolidated total moves ₹335.43 Cr →
**₹337.46 Cr**.

**TEN DOCUMENTS DO NOT READ, and they are two different problems.**

*Six investments that had no reader, and now do.* `reports.zip` and three loose
PDFs carry managers this pipeline had never seen. They are read by
`providers/altFundStatements.mjs` — ONE reader, SIX DECLARED LAYOUTS — and they
brought **₹123.54 Cr** into the consolidated total:

| Fund | Holder | As of | In the book |
| --- | --- | --- | ---: |
| Buoyant Opportunities Strategy — Category III — Class A4 | Ajay | 2026-07-31 | ₹49.30 Cr |
| Helios Flexi Cap Fund — Direct Growth | Ajay | 2026-08-07 | ₹31.00 Cr |
| Motilal Oswal Founders Fund Series II — Class G1 | Ajay | 2026-07-31 | ₹21.83 Cr |
| Motilal Oswal Active Momentum Fund — Direct Growth | Ankita | 2026-08-06 | ₹21.42 Cr |
| 3P India Equity Fund 1 — Classes B1/B2/B3 | Ajay | 2026-07-31 | ₹0 — measured |
| India SME Investments Fund II — Class A2 | Ajay, Ankita, Bharat | 2026-06-30 | — no NAV |

**THE FUND'S OWN NAME BEATS THE STATIONERY IT ARRIVES ON.** Four of these print
`Motilal Oswal` on the letterhead — as the DISTRIBUTOR, the depository
participant or the RTA — one arrives through CAMS and three through their
investors' banks, which is why the classifier had filed them under those houses.
Matched on the house, Buoyant's Category III AIF and Motilal Oswal's own
Founders Fund land in one account under one manager. The issuer rules now match
each FUND, ahead of the distributor rules, for the same reason `360 ONE` cannot
be matched against a whole document that merely HOLDS ₹10.16 Cr of the listed
company.

**A HOLDING ITS FUND HAS NOT VALUED DOES NOT BECOME A POSITION.** India SME's
three folios print a commitment, the capital drawn against it and the units it
bought — and no NAV and no valuation anywhere. `Position.marketValue` is
`number`, and the three wrong answers were all available: carry the drawn
capital as if it were the value, carry zero, or widen the type for 300-odd
positions to accommodate three. The account is kept and carries the REASON, by
the same mechanism 360 ONE Alternates already uses for an income-only folio.
₹13.5 Cr of contributions are in the archive and out of the total.

**AND A PROVIDER THE PIPELINE CAN READ MUST BE IN `precedence.mjs`.** All eight
documents read correctly, landed with the right owner and the right figures —
and contributed nothing, because `authoritative()` returns null for a provider
with no precedence block. Eight accounts at 0 positions and ₹0, holding
₹123.54 Cr between them. Nothing failed and nothing said so.

*Two documents this run could not decrypt — SINCE SOLVED.* Bharat's 360 ONE
Alternates distribution notice and statement of earnings are encrypted with a
password that is NOT in the drop's own `pASSWORD.docx` — that file names the
Kotak and ABSL ones only. Without it folio **1000633** had no readable statement
naming its holder, and the one other document mentioning the folio prints the
holder as the literal word "Investor".

**AN ACCOUNT NOBODY CAN BE SHOWN TO OWN IS EXCLUDED, NOT CARRIED EMPTY.** That
was the right call and this is what made it reversible. `Account.owner` is
`string`, not `string | null`, and that is the model saying every account in
this book belongs to a named member. The two wrong fixes were both available —
widen the type for all 30 accounts to accommodate one, or emit `owner: null` and
let a page render an account attributed to nobody. Folio 1000633 went to
`excludedAccounts` instead, by the same mechanism as the HOPE INDIA TRUST
folios: not summed, reason printed, **and back the moment the password lets its
statements be read.**

**THE PASSWORD IS THE HOLDER'S OWN PAN, and it was in the book all along** — the
family supplied it, and it is the same PAN Bharat's SVAN investor report prints
on page one. So the third entry in `GLOW_PDF_PASSWORDS` opens both documents,
the folio names its holder in words, and it is an ordinary account in the book:
31 accounts now, `owner: "Bharat Jaisinghani"`, still zero positions and still
₹0, because it is income-only and no statement values it. The consolidated total
does not move by a rupee. What came in is the ₹7,38,106 of AIF income split by
tax head — LTCG on listed equity (₹1,767), STCG on listed equity ₹7,25,037,
STCG on debt/liquid funds ₹14,836, expenses ₹26,437, TDS ₹73,811.

**AND IT ARRIVED AS A DUPLICATE.** Bharat's folio 1000633 and Ajay's 1000632
carry BYTE-IDENTICAL earnings: the same 9,90,429.684 Class A3 units, the same
₹7,38,106, the same TDS — the AIF-manager's view of the position 360 ONE's
WEALTH arm already reports under both CRN37702 and CRN60117. `duplicateHoldings`
could not see it, because an income-only folio has no holdings to key on. Check
(c) has a sibling now, `duplicateAifEarnings`, and the extraction report names
the pair. Nothing aggregates `aifEarnings` today, so **no figure on screen is
wrong** — which is exactly when a duplicate is cheapest to record, and exactly
how `dedupedPositions` came to sit correct and uncalled for a drop and a half.

### The `august-2026-b` delivery — five files, two of them new

Five files arrived after the August drop. **Three were byte-identical to
statements already in `source/august-2026/`** — Goldstandard Ajay, LKP 2 and
India SME Bharat, matched on md5 — and were not copied in a second time.
`extract.mjs` does detect byte-identical duplicates and reads each once, so a
copy would have been safe; it would just have been noise in a provenance record.
The other two advance an account each:

| File | Account | As of was | now | Value |
| --- | --- | --- | --- | ---: |
| `SVAN - BHARAT.pdf` | SVAN 8710090 | 2026-06-30 | 2026-07-31 | ₹10.38 → ₹10.70 Cr |
| `MOLECULE - AJAY.pdf` | Molecule 7810404 | 2026-06-30 | 2026-07-31 | ₹1.12 → ₹1.16 Cr |

Both accounts' earlier issues are superseded for SNAPSHOT facts and their DATED
rows still counted — `BOOK_CAPITAL_GAINS`, `BOOK_CORPORATE_ACTIONS`,
`BOOK_REALISED_BY_CLASS`, `BOOK_COMMITMENTS` and every cash-flow series are
BYTE-IDENTICAL across the rebuild. That is the supersede rule working, verified
rather than assumed.

**A CONTROL RUN IS WHAT MAKES THAT VERIFIABLE.** Before the new files went in,
the pipeline was run over the unchanged `source/` and `public/audit/`
regenerated byte-identically — so every difference afterwards belongs to the two
new statements and to nothing else. Without that the diff is 53 files and no way
to tell a fix from a regression.

### The `august-2026-d` delivery — PARTIALLY INGESTED, and the rest is named

Four files. **Two were byte-identical** to statements already in `august-2026/`
(`reports.zip`, Ankita's Active Momentum Fund). The other two are a 68-file
`MOTILAL REPORTS.zip` and a 25-tab consolidated review workbook.

**WHAT LANDED — ₹73.55 Cr, and the consolidated total ties to it exactly**
(₹472.35 Cr → ₹545.90 Cr, of which ₹1.46 Cr turned out to be a double-count,
found and removed later — see the 360 ONE pair above). The first two
needed no new code; the rest are five
new layouts on `altFundStatements.mjs`, built ONE AT A TIME and each verified
against the family's own consolidated review before the next was started:

| Account | Owner | Value | How |
| --- | --- | ---: | --- |
| Buoyant Capital 103472 | Ankita | ₹27.69 Cr | new folio, existing reader |
| Motilal Oswal Founders Fund 90410016093 | Ankita | ₹10.99 Cr | new folio, existing layout |
| Carnelian Bharat Amritkaal Fund 4551 | Ankita | ₹16.31 Cr | new layout |
| Motilal Oswal Delphi Equity Fund 9049241536 | Ajay | ₹11.13 Cr | new layout |
| Neo Infra Income Opportunities Fund 9039920536 | Ajay | ₹5.55 Cr | new layout |
| Baring Private Equity India Fund `AIFM_BPEPF6_0584` | Ankita | ₹1.88 Cr | new layout |
| Motilal Oswal Hedged Equity Multi Factor 90410014574 | Ajay | ₹0 | new layout — redeemed to nil |

**BUOYANT IS THE FIRST MANAGER WITH TWO DOCUMENT FAMILIES.** It sends its own
Category III account statement (read by `altFundStatements.mjs`) AND issues from
the shared PMS reporting system under an `I83_` account code — appraisal, fact
sheet, capital register, transaction statement, performance history, for both
folios. `EXTRACTORS` is keyed on the provider NAME alone, so one family would
always have gone to the wrong reader and come back empty.
`BY_PROVIDER_REPORT_TYPE` in `extract.mjs` routes on the report type instead;
the name stays single, because splitting it would split account 103473 across
two providers and break every per-account figure.

Its precedence moved from the single-scheme block to `PMS_REPORTING_SYSTEM`, so
the APPRAISAL is authoritative for holdings. For 103473 the two agree and the
choice is cosmetic; for 103472 it is not, because Ankita's folio sends the PMS
set and no account statement, and naming the wrong one authoritative would have
left ₹27.69 Cr out of the book. **The appraisal reports the AIF UNIT** — one row
under "Alternative Assets" — so nothing here turns a fund into equities.

**AND ₹76.99 Cr OF AIF UNITS CAME OUT AS CASH.** Buoyant's appraisal prints
`Alternative Assets` over its Category III rows. That heading was not in
`SECTION_ROW`, so it was not recognised as a heading at all — it glued itself
onto the `Cash` row above it, the section never changed, and the appraisal's
`/^cash/i.test(section) ? "Cash" : "Equity"` filed both folios' units as Cash.
Listed/private read ₹269.09 / ₹241.94 Cr against the true ₹192.11 / ₹318.92 Cr.

That test was right while every appraisal in the book held shares and cash and
nothing else. It is `classOfSection` now — a section heading names WHAT THE ROWS
UNDER IT ARE, so `Alternative Assets` → AIF, `Mutual Fund` → Mutual Fund,
`Debt`/`Bond` → Bond, cash by section or by the row's own name, equity
otherwise. **This is the client's own bifurcation complaint arriving through the
INGEST rather than the UI**, and it is why the listed/private split is worth
checking on every drop and not only the total: the consolidated figure was
correct to the rupee the whole time it was wrong.

**AND ALL FIFTEEN NOW READ — see "The demat statements" below.** They used to
sit here as documents with no reader. Twelve are the family's own CDSL accounts
at Motilal Oswal and brought **₹102.16 Cr** into the book; two are ICICI payment
receipts, read in full and attributed to nothing because a receipt names no
holder and no security; the last is the review workbook, held out by decision.

### The demat statements — ₹102.16 Cr, and three columns that disagree

Twelve documents, SEVEN accounts, and the only source in this drop for the
family's direct equity, their gold and silver ETFs and their arbitrage and
hybrid funds. `providers/motilalDemat.mjs`.

**THE FILE NAME IS WRONG THREE TIMES OUT OF TWELVE.**
`H46082_Aarti Ajay Jaisinghani_Transation 1.pdf` is AJAY's account 37359311;
`H43383 -BHARAT JAISINGHANI FAMILY TRUST_Transaction.pdf` is BHARAT's 12838320;
`H46082_Aarti Ajay Jaisinghani_Transation.pdf` is the account the OTHER files
call the family trust. Every one would have filed a statement under the wrong
member. The account is the `Client ID:` the page prints — and not the UCC
either, because Ajay's UCC H19119 covers two different demat accounts.

***BOTH COLUMNS ARE THE LAST MOVEMENT'S, NOT A MARK — see Stage 10cz.*** The paragraph below is kept as it was learnt.

**WHICH COLUMN TO BELIEVE HAD TO BE MEASURED.** The statement prints quantity,
rate and value, and on 22 of 67 rows they do not agree:

```
Birla Cable   11,900.000 units   rate 170.600   printed value 34,120.00
```

— ₹2.87 a share for a stock the same row prices at ₹170.60. The row is four
text items on one line; nothing is misread. **The printed VALUE column ties to
the printed grand total to the rupee on all five statements**, so the
depository stands behind it, and it is still the column that cannot be used.
The family's own review is independent of both and settles it: PG Electroplast
180,000 units × 502.200 = ₹9.04 Cr against the review's 180,000 units at
₹10.04 Cr; Onesource and Birla Cable likewise land within ordinary drift.
Quantity and rate are the primitives, market value is DERIVED, and the printed
figure goes to `printed.marketValue` — rules 3 and 4, applied to a document
whose own arithmetic is broken. Those 28 deltas are `explained` with that cause
named, because leaving them `material` would bury the two real settlement
residuals this book needs a reader to look at.

**A RATE OF 0.000 IS NOT PRICED**, and a rate of 100.000 on an AIF unit is the
FACE VALUE it was issued at, not a NAV. Read as a mark it puts ₹34.71 Cr on 3P's
units against the ₹52.12 Cr the review carries them at, and ₹34.17 Cr on a
Buoyant folio the fund itself values at ₹49.30 Cr. So an AIF row from a
depository carries its UNITS and no price — the same rule as "a depository does
not know what shares cost", one column over.

**AND A DEPOSITORY ROW WHOSE FUND ALREADY REPORTS ITSELF IS DROPPED.**
`AIF_UNITS` names which fund reports each ISIN, and `dropDepositoryDuplicates`
CHECKS that table rather than trusting it: the depository's unit count is
compared against the units the reporting account carries, and only an exact
match is dropped. A mismatch keeps BOTH rows and says so, because a depository
holding units the fund does not report is either a folio this drop is missing
or a reclassification — and that is the 3P case exactly. The tolerance is half
of the third decimal both sides print: matched to the bit, Buoyant's
3,416,657.416 against the fund's 3,416,657.417 failed to dedupe and put
₹34.17 Cr into the book twice.

**ONE ACCOUNT IS EXCLUDED BECAUSE ITS THREE IDENTIFIERS GIVE THREE ANSWERS.**
Account 32387399 prints `Client Name: AARTI AJAY JAISINGHANI` with
`PAN No: AAXXX-XX-8H`; Aarti's PAN is AFIPJ4151N, and the file it arrived in is
named for a family trust whose two PANs it does not match either. The masked PAN
cannot IDENTIFY a holder — three characters of ten — but it can REFUSE one, and
here it does. ₹8.23 Cr is excluded with the reason rather than attributed to a
guess, by the mechanism the HOPE INDIA TRUST folios already use. Returning
`owner: null` was not enough: `extract.mjs` falls back to the classifier's name,
which is the same name the PAN contradicts, so `excludedFromBook` carries it.

*(Attributed at Stage 10db. The holder lines print the trustees of the
unnumbered "Bharat Jaisinghani Family Trust", which the family's register and
review name. Since Stage 10cz its rates are last-movement prices, so the
statement book does not move; the live book values its three funds at AMFI's
NAV, about ₹8.72 Cr.)*

| Account | Owner | As of | In the book |
| --- | --- | --- | ---: |
| 1201090012838316 | Ankita Jaisinghani | 2026-07-31 | ₹38.38 Cr |
| 1201090012838320 | Bharat Jaisinghani | 2026-07-31 | ₹32.83 Cr |
| 1201090012838335 | Aarti Jaisinghani | 2026-07-31 | ₹30.95 Cr |
| 1201090037359311 | Ajay Jaisinghani | 2026-07-31 | ₹0 — both rows are AIF units the funds report |
| 1201090037436848 | Bharat Jaisinghani | 2026-07-31 | ₹0 — `NO HOLDING IS AVAILABLE`, a measured zero |
| 1201090012539150 | Ajay Jaisinghani | 2026-07-31 | ₹0 — **transaction statement only** |
| 1201090032387399 | — | 2026-07-31 | excluded, ₹8.23 Cr, holder unresolved |

**AND THE LARGEST REMAINING GAP IS A MISSING HOLDING STATEMENT.** Account
12539150 is Ajay's main demat — the one his Delphi and Hedged Equity statements
print as their depository account — and the drop carries its TRANSACTION
statement and not its holdings. The tape's closing balances give 38 quantities
at 31 July and no rates, so they are carried as `positionsAsOf` and valued at
nothing, the same separation `lkpSecurities.mjs` makes. That single missing
document is most of why Ajay's coverage against the review sits at 34.5% while
Aarti's is at 97.8%.

**A DEPOSITORY MOVEMENT IS NOT A TRADE.** The transaction statements carry units
in and units out with no price, no consideration and no counterparty, so
`precedence.mjs` names the demat for `holdings` and deliberately not for
`transactions`. The tape stays in the archive, where Data Audit shows it for
what it is.

### The two ICICI payment advices — read, and attributed to nothing

`3P_Folio 3000048.pdf` and `3000049.pdf` are single-page ICICI receipts:
₹31,05,82,835.17 and ₹21,42,90,815.61, both debited 04/08/2026. They carry no
holder, no security and no folio. The two sum to ₹52.49 Cr against the
₹52.12 Cr the review carries 3P at, and the file names assert the two 3P folios
— which is a compelling story and still only a file name plus an arithmetic
coincidence. This book has been bitten four times by a document filed on a name
it merely MENTIONS. So the amount is recorded, the folio is recorded AS THE FILE
NAME'S CLAIM, and `excludedFromBook` keeps it out of every total. A payment
receipt is also the wrong instrument to book a redemption from: it says money
moved between two banks, not which units were sold, at what NAV, or how much of
it was gain.

| Issuer | Docs | What it is |
| --- | ---: | --- |
| Consolidated family review | 1 | the only document in `source/` with no reader — see below |

### The two Motilal Oswal ACCOUNT SUMMARY funds — one layout, and a DASH

Delphi and the Hedged Equity strategy print the same block: one row per unit
class reading `Class | NAV Date | Post Tax NAV | Unit | Commitment |
Contribution | Valuation`. One reader factory serves both, and three of its
decisions are the whole of it:

**A DASH IS NULL, NEVER ZERO.** Hedged Equity's Unit and Valuation columns are
`-` on both classes, because both are redeemed. Read as 0 the account books its
₹13 Cr contribution as an unrealised loss against money the fund has already
paid back; read as null it carries no holding and states why.

**A CLOSED CLASS COMMITS NOTHING EITHER.** Summing the commitment column across
both rows gives ₹26.11 Cr for ₹13 Cr of real money — Class F1 was SWITCHED IN
from Class B2, so the same contribution is printed twice under two class names.
Only classes that still hold units contribute a commitment, which is also why
this account appears in no dry-powder figure.

**AND THE DRIVER LEARNED TO SAY WHY IT IS EMPTY.** With no rows it reported
`summary-row-not-matched` — "the columns did not line up" — about a document
whose columns lined up perfectly and printed a dash in both. A layout that knows
why it has no rows now says so through `emptyReason`; everything else keeps the
column diagnosis, which is the honest answer when the reason is genuinely
unknown. **A wrong diagnosis sends the next reader to fix a regex**, which is
the same rule that governs an unreachable archive on screen.

Delphi's one class ties exactly: 99,995 units × ₹1,112.9310 = **₹11,12,87,535.35**,
the figure the statement prints. The family's review carries it under what it
OWNS — `Fund of Funds (VEC + Carnelian + Girik Cap + Insightful)` — at
₹11,12,87,435.35, ₹100 lower **because the review rounds the NAV to two
decimals**. Ours is derived from the printed NAV to four, so the ₹100 is theirs
and not a discrepancy in the book. The review does not list Hedged Equity at
all, which agrees with an account holding nothing.

**THE UNNUMBERED TRUST IS A REAL HAZARD.** `H43383 - BHARAT JAISINGHANI FAMILY
TRUST` carries no numeral, and this book has Trust 2 and Trust 3 as separate
taxpayers with separate PANs. Whoever writes that reader must resolve it on the
PAN the statement prints, never on the name.

*(Resolved at Stage 10db. The unnumbered trust is a third owner of its own,
attributed by a join on the client ID that is checked against the page on every
read, never by a name. No statement prints its PAN.)*

**AND THE CONSOLIDATED REVIEW WORKBOOK IS NOT A SOURCE — BY DECISION.** The
adviser's 25-tab aggregation of the whole book is matched on a column header no
issuer prints (`Absolute Gain / (Loss) Including Redeemed Funds`) and has no
reader deliberately. Every figure in this book traces to the statement of the
institution that struck it; an aggregation carries someone else's decisions
about what to include and how to value it, and folding it in would end that
guarantee on the first cell. Its proper use is as an independent CROSS-CHECK of
the generated book, which is the role `golden.mjs` plays for the extractors.

***THE FAMILY HAVE NARROWED THIS, AND ONLY FOR THE PRIVATE MARKET — see Stage
10dh.*** On 5 Oct 2026 they asked for the review to be the SOURCE of every
private-market figure, so `scripts/lib/reviewBook.mjs` carries its PE Funds
block, its unlisted shares, its `Private Investments` tab and its one credit
line as positions, each naming the sheet, the block and the row it came from.
**Everything above still holds of every other figure in this book**: a holding,
a cost, a mark, a dated flow and a commitment all trace to the statement of the
institution that struck them, and the review is the cross-check and nothing
more. The workbook still has no reader of its own — the private blocks are read
by one function the book calls, which refuses rather than guesses.

Matched on any issuer NAME it claimed whichever its cells mentioned first — it
landed under Helios, then under Motilal Oswal Founders Fund, with an "owner"
read as the literal word "Sale". It contributed nothing either time only because
the fund readers refused its summary row, which is luck rather than design.

**THREE ORDERING FAULTS, ALL THE SAME FAULT.** Everything in this delivery that
went wrong went wrong because a document was matched on a name it MENTIONS
rather than the one that ISSUED it:

- The new issuer rules were first placed ABOVE the established fund rules, and
  the demat rule matched `Motilal Oswal Financial Services` printed as the
  DEPOSITORY PARTICIPANT on the Founders Fund and 3P statements. **₹21.83 Cr
  walked out of the book on a re-run** before the block was moved below them.
- The demat statements list every fund the family owns as a transaction row, so
  they were claimed by Buoyant and by Neo Infra. They are matched on the DP's
  own SEBI registration line (`CDSL AND NSDL : IN-DP-…`) now, and
  `matchGoldstandard` returns null for anything carrying it — a depository
  statement is never a PMS house report.
- The Carnelian Amritkaal AIF statement names Carnelian as its manager and was
  taken by the PMS house rule.

The guard that caught all three is the same one the `august-2026-b` control run
established: **no account that was already in the book may move.** It is checked
on every run now and it is what turned a silent ₹21.83 Cr loss into a one-line
diagnosis.

### The `august-2026-c` delivery — a new manager, and three defects it found

Five files. **Two were byte-identical** to statements already in
`source/august-2026/` (LKP 1, Carnelian Ajay) and were not copied in again. The
other three:

| File | What it is |
| --- | --- |
| `SKY CAPITAL RISING FUND.zip` | 16 statements from an issuer this pipeline had never seen |
| `VEC - AJAY.zip` | V.E.C 128005, 2026-07-06 → **2026-08-13** |
| `VEC - ANKITA.zip` | V.E.C 128004, 2026-07-06 → **2026-08-13** |

V.E.C 128005 moves **₹9.24 Cr → ₹20.29 Cr**, and that is real: its own capital
register prints Fund Deposits of ₹10.65 Cr on 28 July and ₹59 L on 29 July. The
consolidated total moves ₹461.36 Cr → **₹472.35 Cr**, which is those two
accounts and nothing else, to the rupee.

**SKY CAPITAL RISING TITANS FUND I** — a Category I AIF (Angel Fund), four
folios, four month-ends each. It is a SEVENTH declared layout in
`altFundStatements.mjs` rather than a provider file of its own: one reader, one
layout per FUND, which is what that file exists for.

| Folio | Holder | Series | Units | Drawn | Uncalled |
| --- | --- | --- | ---: | ---: | ---: |
| SKY003 | Bharat Jaisinghani | Hudle A1 + TED A2 | 17,000 + 285 | ₹1.73 Cr | NIL |
| SKY022 | Ajay Jaisinghani | Oncare A3 | 15,000 | ₹1.50 Cr | NIL |
| SKY023 | Bharat Jaisinghani Family Trust 2 | Oncare A3 | 7,500 | ₹75 L | NIL |
| SKY024 | Bharat Jaisinghani Family Trust 3 | Oncare A3 | 7,500 | ₹75 L | NIL |

**IT VALUES NOTHING**, like India SME: commitment, drawdowns, units and face
value, and no NAV anywhere on either page. So ₹4.73 Cr of drawn capital is in
the archive and OUT of the consolidated total, four accounts carry zero
positions with the reason printed, and the book gains 4 accounts and 0
positions.

**ONE HOLDING PER SERIES, NOT PER ALLOTMENT AND NOT PER FOLIO.** Bharat's folio
prints five allotment lines across two startups; three folios hold the SAME
Oncare series. Per allotment would put five rows on one position; per folio
would merge Hudle with TED and stop the three Oncare folios sharing a
securityKey. Cost per series is units × the face value the row prints, and
`verify` ties the sum to the printed Total Drawdown on every folio — two printed
columns and a printed total, not an allocation nobody published. These are also
the first statements in the book to print a real ISIN per series.

**A FOURTH CHARACTER DECIDES WHETHER A NAME IS A PERSON.** `trimPersonName`
turned `Bharat Jaisinghani Family Trust 2` and `Trust 3` into plain "Bharat
Jaisinghani" — two trusts and the man they are named after, one owner, every
per-entity total wrong. `investor()` now takes the holder VERBATIM when the
PAN's fourth character is not `P`. `transitionVenture.mjs` reached the same
conclusion for the same two trusts and hard-coded it; this derives it from the
statement.

**AND THE HOLDER ANCHOR IS LOAD-BEARING.** `\bName` matched the "Name" inside
`Fund Name Sky Capital Rising Titans Fund I`, so every folio came back owned by
the fund. Three of the four still resolved — `resolveOwner` tries the PAN first
— and Bharat's did not, because his PAN is deliberately withheld from the
registry. A fallback masked the bug on three folios out of four.

### The `august-2026-e` delivery — the two NSDL accounts, and a scan

Two files, found by diffing the client's Google Drive against `source/` after
every other delivery had landed. Every one of the other 47 files in Drive matched
a local file on name and byte size; these two matched nothing. Both are dated
**31 March 2026**, five months behind the rest of the corpus, and both are
DEPOSITORY statements for accounts this book had never seen.

| File | Whose | Outcome |
| --- | --- | --- |
| `Holding Statement Ajay Jaisinghani As on 31 March 2026.pdf` | Ajay — ICICI Bank NSDL, client 49794950 | read: 38 holdings, 12 valued, **₹12,415.02 Cr** — 11 and ₹63.78 Cr in the book once Polycab is ring-fenced |
| `HOLDING STATEMENT AS ON 31 MARCH 2026.pdf` | Bharat — HDFC Bank NSDL, client 22025655 | **not read — it is a scan** |

**AND ₹12,351.24 Cr OF THAT IS ONE ROW.** Polycab India, 13,901,229 shares at
the ₹8,885.00 the depository marks them at. This is promoter stock — the family
are Polycab's promoters — and Bharat's scanned statement carries 5,108,911 more.
It is about seventeen times the rest of the book put together, and **the family's
own consolidated review, which totals ₹1,300 Cr, does not carry it at all.** That
absence is the evidence that they do not think of it as part of the portfolio
being tracked, and it is not evidence about what the statement says.

So it is INGESTED, because the statement says the account holds it and refusing
a measured holding for being inconveniently large is the fabrication rule run
backwards. Whether it belongs in the same consolidated total as the managed
mandates is a decision about the family's affairs, of exactly the kind §4c
reserves for them. What must not happen is the third option: dropping it quietly
and leaving the book looking complete. **The family have since made that
decision — see the next section.**

### The `august-2026-f` delivery — a THIRD way a PDF is unreadable, and a register that is not a statement

Three files, found by diffing the client's Google Drive against `source/` after
every other delivery. **NOT ONE OF THEM MOVES A RUPEE OF NAV**, and every one of
them is read — which is the point of this section, because those two facts look
contradictory and are not. The two statements are read by RENDERING their outlined
glyphs and their single holding is priced at face value, so it carries a quantity
and no value; the register reads perfectly and is held out of the book by
decision. What moves is the account count, the book's as-of and the `/register`
page — never a total.

The passage below is kept in the order it was learnt, because the first answer
("neither is an OCR job") was right about a scan and wrong about these, and the
distinction it turns on is the whole of why one is read and the other still is not.

| File | What it is | Outcome |
| --- | --- | --- |
| `NEW INVESTMENT SHEET.xlsx` | the family's own record of what they PAID — 8 sheets, 427 tranche rows, 151 names, **₹842.92 Cr gross paid in** | reads perfectly, and is **not a source** |
| `HOLDING STATEMENT BHARAT JAISINGHANI FAMILY TRUST 2.pdf` | HDFC Bank NSDL, DP account **67786547** | **READ — by rendering its outlined glyphs, see below** |
| `HOLDING STATEMENT BHARAT JAISINGHANI FAMILY TRUST 3.pdf` | HDFC Bank NSDL, DP account **67786137** | **READ — same** |

**A DOCUMENT WITH NO TEXT IS NOT ALWAYS A SCAN.** `august-2026-e` established that
a scan is not a document with no reader. These two are neither: **no raster image
anywhere and no text either** — zero font objects, zero `BT`/`Tj`, and ~9,300
bezier curves, because every glyph has been CONVERTED TO VECTOR OUTLINES by
whatever exported the file. pdfjs's operator list reads 2,752 ops / 545 paths /
**zero text ops**; poppler's `pdftotext` returns one character. Two independent
engines agree there is nothing to read.

The old test would have called them `no-text-layer` — "**1 page(s) of SCANNED
IMAGE**" — which is the same class of confidently wrong answer that test's own
comment already records about the review workbook, and it sends the next person
to ask HDFC to re-scan paper that was never on paper. They report
**`text-outlined-to-paths`** now, and the reason names the actual remedy: a
**re-export from the issuing system with fonts embedded**. That diagnosis is still
what a document reports when nothing can read it; what changed is that something
now can — see the next section, which is where this passage's original conclusion
("neither is an OCR job") was overturned for these two and upheld for the scan.

`classifyInk` in `lib/layout.mjs` draws the distinction **on the operator list**,
because a PDF 1.7 file keeps `/Font` and `/DCTDecode` inside compressed object
streams and a raw byte search finds neither. It runs **only** for a document that
yielded no text at all, so no ordinary statement pays for the second parse —
asserted in `layout.test.mjs` along with both directions of the classification,
against PDFs generated in the test. Measured on the corpus: the two new files are
`vector` (0 images, 545/540 paths), Bharat's HDFC scan is `raster` (**4 images**,
0 paths — the four DCTDecode JPEGs this file already documents), and Ajay's ICICI
statement returns 124 text rows and is never classified at all.

#### They ARE read now — by rendering the outlines, and never a scan

*"use whatever method you want to for extracting the data … every single file must
be incorporated."* The refusal above was right about a SCAN and wrong to extend to
these, and the difference is not a technicality:

- a SCAN is a photograph of paper. Its information is genuinely lossy — sensor
  noise, skew, JPEG ringing — so a figure recovered from it cannot be traced to
  what the document printed, and a wrong digit looks exactly like a right one.
  **Bharat's `august-2026-e` statement stays refused for that reason.**
- OUTLINED TEXT is not a photograph of anything. The file itself carries every
  glyph's exact bezier curves; rendering them is EVALUATING data the document
  already holds, at whatever resolution we choose. At 600 dpi the bitmap is a
  clean synthetic rendering of exact shapes: no noise, no skew, no compression.

`lib/ocr.mjs` renders and reads those, and hands the words back **in the same
`{x,y,width,height,text}` shape `itemsFrom` produces from pdfjs** — so
`pageToGrid` and every reader above it work unchanged and there is no second,
drifting "OCR table parser". `extractLayout` routes ONLY `inkKind.kind ===
"vector"` there; a `raster` page keeps its `no-text-layer` diagnosis and is not
read. Both directions are asserted in `layout.test.mjs`.

**AND A PREMISE IS NOT A PROOF, SO THE READER CHECKS ITSELF.**
`providers/hdfcNsdl.mjs` will not emit a holding unless the rows it read
reproduce the statement's own printed `Total Valuation (Rs.)` **to the paisa**;
on a mismatch it emits nothing and says why. That check is the whole licence for
reading a rendered document — the page's own arithmetic is the witness. Here it
passes on both files, and three further things agree: 347 x 100.000 = 34,700.000,
the statement's words ("Rupees Thirty-Four Thousand Seven Hundred Only") match
its digits, and the register in the same delivery independently records 347
preference shares per trust.

**THEY ADD ₹0 TO NAV, AND THAT IS THE CORRECT ANSWER.** The Market Rate is exactly
100.000 — the FACE VALUE an unlisted preference share was allotted at —
so `faceValueBasis` grades it `par` and the holding carries its QUANTITY and no
value. The book gains **two accounts (49 → 51)** and its as-of advances to
**2026-08-29**; `totalValue` does not move by a rupee. Reading 100.000 as a mark
would have invented ₹34,700 twice.

`textSource: "ocr"` rides in the provenance, and the document carries a
`text-recovered-by-rendering` warning naming the remedy — a re-export from HDFC
with fonts embedded — so no figure read this way is ever mistaken for a native one.

**IT NEEDS TWO SYSTEM BINARIES, AND DEGRADES WITHOUT THEM RATHER THAN GUESSING.**
`pdftoppm` (poppler-utils) and `tesseract`. Neither is an npm package and neither
is in CI — which costs nothing, because **CI never re-extracts**: it reads the
committed archive and checks that the book regenerates from it byte-identically.
Where they are absent `ocrAvailable()` says so, `extractLayout` falls back to the
`text-outlined-to-paths` diagnosis, and the run is exactly what it was before OCR
existed. It never half-reads. Re-extracting these two locally needs:

```
sudo apt-get install -y poppler-utils tesseract-ocr
```

**AND THE PIPELINE GREW A GUARD, BECAUSE THIS SESSION DELETED 24 DOCUMENTS.**
`node scripts/ingest/extract.mjs --help` is not a help flag — `extract.mjs` takes
no options, so it ran a FULL extraction against the default paths, and the eight
encrypted statements it could not open without `GLOW_PDF_PASSWORDS` simply left
the archive. Recovered with `git checkout -- public/audit/`, and the fix is not
"be careful": `guardAgainstShrinkingTheArchive` compares the documents this run
read against the documents already on disk and **refuses to write, exit 1**, if
the run produced fewer. A deliberate shrink sets `GLOW_ALLOW_ARCHIVE_SHRINK=1`
and says so out loud. A re-extraction that quietly loses the statements it lacked
a password for is indistinguishable, in the diff, from a drop that never carried
them.

**AND `build-book` WAS TELLING THE WRONG STORY ABOUT THEM.** Its
`noPositionsReason` had one sentence for every unvalued account — *"this fund
publishes no NAV … the capital drawn against a commitment"* — which is true of
India SME and Sky Capital and false of a depository. It branches on the HOLDING
now: a row carrying a `faceValue` gets the custody wording, and the fund wording
is reserved for a fund. A confidently wrong reason sends the next reader to ask a
fund manager for a NAV no fund owes.

**AND THE FILENAMES NAME THE WRONG HOLDER, FOR THE FOURTH TIME.** Both files are
named for a Bharat Jaisinghani family trust; both statements print `AJAY T
JAISINGHANI` and `AARTI AJAY JAISINGHANI` as joint holders at Ajay's own
Prabhadevi address. `providers/hdfcNsdl.mjs` therefore resolves the account on the
`DP Account No:` the page prints, never on the file name — `motilalDemat.mjs`'s
rule, arriving through a third issuer — and it will not fall back to the file name
even when the account line is unreadable: with no `DP Account No:` it emits
nothing and says so. What they hold is one line each,
`SWAPECO SOLUTIONS PRIVATE LIMITED` / `INE2DT103015`, 347.000 units of a
`0.01% PRE SERIES A PREF` at a Market Rate of **100.000** — the FACE VALUE of a
preference share in an unlisted private company. Read as a mark it adds ₹34,700
twice; under this book's own rules it is **quantity-only with no value**.

**AND THE REGISTER IN THE SAME DELIVERY CONFIRMS THESE *ARE* THE TRUSTS'
HOLDINGS — ONCE THE WHOLE CELL IS READ.** Its `TRUST INVESTMENT` rows read
`2807 PRE SERIRES A CCPS OF FACE VALUE RS. 100 EACH (NO OF PREFERENCE SHARE 347)`
— **347**, once per trust, and 347 x ₹100 face = **₹34,700**, the exact Total
Valuation both statements print. Instrument, face value and quantity all tie, so
each file is one trust's holding and the holder line prints the **TRUSTEES**
rather than the trust. The register also carries Bharat's own separate 244 EQUITY
shares (₹50,20,300), for which no statement exists.

**THIS PASSAGE FIRST ASSERTED THE OPPOSITE**, and the mistake is worth keeping
because it is a new shape of an old one. The cell was read to 240 characters; the
parenthetical carrying the unit count sits past that cut, so `2807` read as the
quantity and nothing matched. The conclusion — "these are not the trusts' files,
the trusts' ₹2.70 Cr has no statement, that is two asks" — was confident,
internally consistent, and would have sent the client hunting for documents they
had already sent. **A TRUNCATED CELL IS NOT A SHORT CELL**, and a display limit
in a debugging script is not a fact about the source, which is the same class of
error as reading a figure off a `title` attribute the check could not see.

What survives is the mapping caution, not the ask: the statement names only the
trustees, so a reader must resolve each account on the `DP Account No:` the page
prints (67786547 / 67786137) and attribute it to a trust through the register.
That is a join to establish, not a document to request.

***AND IT HAS BEEN ESTABLISHED — see Stage 10bp.*** It was named here and not
made, so for three deliveries both accounts sat under `Ajay Jaisinghani` and the
trusts' entity page listed one holding, which is what the family eventually
reported. `BENEFICIAL_OWNER_BY_DP_ACCOUNT` in `providers/hdfcNsdl.mjs` is the
join, keyed on the DP account and cited to the register's `TRUST INVESTMENT`
sheet; `npm run replay:owners` lands it without the passwords. **A join this file
names and nobody makes is a gap with a paper trail, which is better than a silent
one and is still a gap.**

#### The register is the same decision as the review — and it was the dangerous one

`NEW INVESTMENT SHEET.xlsx` is a CASH-OUTFLOW register: `INVESTMENT AMOUNT` is
money that left a bank account on a date, and **`CURRENT VALUATION` is empty on
every one of its 427 rows**. So it can speak to INVESTED CAPITAL, which is a cost,
and it **cannot move NAV by a rupee** — a NAV gap closes with a holding
statement, never with a payment record. That distinction is the whole of
`docs/REGISTER-RECONCILIATION.md`.

It is held out of the book for the reason the consolidated review is, and matched
the same way — on a column header no issuer prints. A depository tracks units,
never whether the family holds the paper certificate, so `ORG. SHARE CERTIFICATE
STATUS` is the anchor. **Unmatched it was measured classifying as provider
`Green Lantern Capital LLP`, strategy `Aristos Equity Portfolio`, owner
`"COMMUNITY PRIVATE LIMITED BHARAT"`, accountNo `"EDUGORILLA"` and reportType
`capital-call`** — five fields scraped off PORTFOLIO COMPANY names in its own
cells. Green Lantern has a reader and `capital-call` is a live report type, so
unlike the review workbook this one would have been **handed to a reader** rather
than merely misfiled.

**AND IT EXPOSED THAT THE REVIEW'S OWN PROTECTION WAS LUCK.** That rule lives in
`ISSUER_PROVIDER_RULES`, which run AFTER `match360One`/`matchGoldstandard`, so the
workbook escaped those only because its cells spell "Green Lantern Growth
Strategy" rather than "GREEN LANTERN CAPITAL". The adviser writing a manager's
full legal name in one cell was all it would have taken. Both house matchers now
return null for either signature (`isNonStatement`), and a document nobody issued
is short-circuited to **no report type, no account, no owner, no as-of** — because
a reader is chosen BY REPORT TYPE, and the review reached `unknown` by accident
while the register reached `capital-call` by the same accident running the other
way. `pipeline.test.mjs` asserts all of it, and asserts the guard is NARROW: an
ordinary Goldstandard appraisal, which also names Aristos, still resolves to its
own house.

#### Stage 10q — THE REGISTER IS ON THE DASHBOARD, AND IN NO TOTAL ON IT

*"integrate these three new files into the dashboard, make sure there's no
duplication."* The two PDFs cannot be read by anything (see above). The register
can, and it now has a page — built as `BOOK_POLYCAB` is, because that is the
construction this repo has already proven for real data that must never reach a
NAV:

***THE PAGE HAS SINCE BEEN REMOVED at the family's request — `/register`
redirects, and `src/data/registerData.ts` and `npm run build-register` went with
it, because that module had exactly one reader. See Stage 10bb. What survives is
everything below about the WORKBOOK: `scripts/lib/registerRead.mjs` is still its
one reader, `npm run reconcile:register` still writes
`docs/REGISTER-RECONCILIATION.md`, and the absence check below is stricter than
it was — no route may name the register now, and its sentinel is derived from the
workbook rather than from the deleted module. The passage stays in the order it
was learnt, because the anti-duplication reasoning is why the figures were never
additive in the first place.***

- ~~**`npm run build-register`** emits `src/data/registerData.ts`~~ — REMOVED with
  the page. It was generated, never hand-edited and idempotent; a builder whose
  output nothing reads is the failure this file keeps naming.
- ~~**`src/pages/Register.tsx` at `/register` is its ONLY reader**~~ — and that
  is exactly why both went together. It read the module DIRECTLY rather than
  through `PortfolioContext`, using `usePortfolio` for the display-currency
  formatter alone, so nothing on it could ever leak into a total, an allocation,
  a sector or a NAV. That construction was right and is recorded for the next
  page that needs it.
- **`scripts/lib/registerRead.mjs` is the one reader, and it STAYS**, used now by
  `register-reconcile.mjs` and by `check-pages.mjs`'s `REGISTER_SENTINEL`. Two
  copies would be two chances for the report and the sweep to state different
  figures about one workbook — the failure `drilldown.ts` exists to stop for the
  book's own numbers. Extracting it was verified by regenerating
  `docs/REGISTER-RECONCILIATION.md` byte-identically.

**THE PAGE LEADS WITH THE PARTITION, NOT THE TOTAL, AND THAT IS THE ANTI-DUPLICATION
DESIGN.** ₹842.92 Cr of paid-in capital is NOT additive to a ₹710.39 Cr book:
₹391.14 Cr of it across 31 names is already inside NAV at a statement mark. A page
that printed only the gross would invite exactly the double count the family asked
to be ruled out, so the four buckets — in-book-as-account ₹347.73 Cr,
in-book-as-position ₹43.42 Cr, not-in-book ₹450.08 Cr, exited ₹1.69 Cr — are shown
apart, each with what it means for the dashboard, and they sum to the gross.

**TWO INVARIANTS, AND NEITHER IMPLIES THE OTHER**, both verified by reintroducing
their bug. `check:pages` walked `/register` and asserted it renders the register's
own largest not-in-book name, states these are amounts PAID rather than a
valuation, states it is no part of the book's totals, names the double count, and
never posts a paid figure as a cost basis. And on EVERY OTHER ROUTE it asserts that
name does NOT appear — `REGISTER_SENTINEL`, derived from the data like
`RINGFENCED_KEY` so the next drop picks its own. Measured: leaking the sentinel
onto Morning CIO fires the absence check; breaking the page's own wording fires the
page check; the full sweep is 102 combinations clean.

***ONLY THE SECOND STILL HAS A SUBJECT, AND IT IS STRICTER FOR IT (Stage 10bb).***
The page's five own invariants went with the page; the absence check now applies
to EVERY route with no exception, and `cio` additionally asserts the sentinel
DERIVED — because it used to be read out of `registerData.ts` inside a
`try/catch`, and deleting that module would have left it `null`, short-circuited
the guard and made the whole claim unfalsifiable in silence.

The sentinel is a NAME and deliberately not the word "register": `capital-register`
is a live report type in the book and the Data Audit page prints it on every walk.

#### `npm run reconcile:register` — what the register can and cannot settle

`scripts/register-reconcile.mjs` is to the register what `review-reconcile.mjs` is
to the review: an independent cross-check that never writes to the book.

- **60 of 371 positions carry no cost**, worth ₹165.94 Cr, and **every one is in a
  DEPOSITORY account** — 43 Motilal Oswal demat, 11 ICICI NSDL, 6 in accounts
  holding nothing. That is not a defect: a depository holds the shares and did not
  buy them, which is why the cell is `—` and not `₹0`.
- **The register covers 7 of the 60** (₹27.35 Cr of market value against ₹43.42 Cr
  paid) and **misses 53** (₹138.60 Cr), whose cost no document in this corpus
  reports. Those need a contract note or transaction statement from Motilal Oswal
  and ICICI Bank — not another register.
- **113 register names have no counterpart in the book at all**, ₹450.08 Cr paid
  in. That is a COST and the size of an ask, never a value this book will publish.
**AND ONE SUBTOTAL DOES NOT SAY "TOTAL".** The register repeats each multi-tranche
investment as its own row, and summing the amount column blind reads **₹1,274.79 Cr**
— ₹431.88 Cr of double count, 51% too high. Matching the WORD finds 63 of them.
It misses a 64th: `FUND HOUSE` repeats `BARING PRIVATE EQUITY INDIA FUND 6` under
its own four tranches at ₹2,02,50,000, exactly 65 + 50 + 25 + 62.5 lakh, with no
"TOTAL" anywhere in it. What gives it away is its SHAPE — a subtotal carries no
serial number and no `INVESTMENT DONE UNDER`, because it is not an investment
anybody made on a date. Measured, that structural test catches exactly that one
row and no data row. This is `dataGovIn.mjs` and `amfi.mjs`'s own rule one layer
up — **a headline row is NAMED, never summed** — meeting a workbook that forgot to
name one, and the first count published here (₹844.94 Cr over 428 rows) was wrong
by that row.

- **₹842.92 Cr IS NOT ADDITIVE TO THE BOOK.** It is money paid since 2017 across
  every vehicle the family has used, including mandates the book already carries
  in full, capital already returned (₹6.60 Cr on the COMPANY sheet's own
  `LOAN RETURNED BACK` column) and investments already written off (₹1.69 Cr).

**A PAID FIGURE IS NOT A COST BASIS AND MUST NOT BE POSTED AS ONE** until the
quantities tie, the entity resolves and it is shown not to double-count a cost the
book already has — the rule `costFor` already applies to LKP's opening ledger,
joining a cost ONLY where the quantities match exactly.

**AND THE MATCHER IS SHARED, BECAUSE TWO COPIES WOULD DRIFT.**
`shared/nameMatch.mjs` now holds the exact/alias/prefix/spacing tiers both
reconcilers use. Extracting it exposed a live defect: `matchSecurity` took an
`index` parameter and honoured it on **two tiers out of four**, the alias and
prefix tiers reading `BY_KEY` whatever they were passed — so the second call, the
one asking "did we READ this and simply fail to value it?", searched the BOOK for
a name it was meant to look for in the ARCHIVE. That verdict is what puts a line
on the section D1 ASK LIST, so the defect asks the client for documents already in
hand. Measured on this corpus it changed no line and the report regenerates
byte-identically, which is exactly why it had to be fixed structurally rather than
left for the first line that hit it. **There is still no fuzzy tier**: a token
overlap rule was tried and matched `KIRANAKART TECHNOLOGIES (Zepto)` to `TATA
TECHNOLOGIES`, `MAN INDUSTRIES` to `Deep Industries` and `INTEGRIS HEALTH` to
`Star Health`. Near misses are LISTED for a human to commit as an alias — among
them a Borosil WARRANT against the Borosil EQUITY, which must never be joined.

### The audit against the family's consolidated review — and the question it was asked

*"the invested capital is incorrect and should be higher, and thus consolidated NAV
will also be higher … find the gaps and tell me the root cause and what we need
exactly to fill them."*

**THE FIRST HALF IS RIGHT AND THE SECOND DOES NOT FOLLOW**, and separating them is
the whole value of the audit, because the two halves need DIFFERENT documents:

```
  NAV      = Σ marketValue  over EVERY position
  Invested = Σ costBasis    over the positions that REPORT one
```

Different columns over different subsets. A position the book already carries at
its statement mark but with NO COST understates invested capital by its whole cost
and understates NAV by **nothing at all** — its contract note moves the first and
cannot move the second by a rupee. Measured: invested ₹471.92 Cr against the
review's ₹1,076.01 Cr, and the ₹604.09 Cr between them splits three ways:

| Cause | Invested | NAV | Size |
| --- | :---: | :---: | ---: |
| **A.** held, valued, no cost reported — 60 of 369 positions | understated | **unaffected** | ₹165.94 Cr of MV already in NAV |
| **B.** not in the book at all | understated | understated | ₹367.78 Cr at the review's marks |
| **C.** an aggregate block, itemised only on the review's own `Private Investments` tab | understated | understated | ₹136.16 Cr at the review's marks |

**EVERY ONE OF THE 60 IS IN A DEPOSITORY ACCOUNT** — ICICI NSDL and three Motilal
demats. A depository holds the shares and did not buy them, so no cost is a fact
about the document rather than a parsing failure: across the WHOLE archive not one
of those (account, security) pairs carries a cost on any record type. **A is closed
by contract notes, never by another holding statement**, and it is the only one of
the three that leaves NAV where it is.

**THE THREE OTHER TABS ARE LINE-MATCHED NOW, AND THAT MOVED THE RESIDUAL ₹184 Cr.**
Section C had only ever read the review's **Equity** tab, so Debt, Alternate and
Cash — ₹275.05 Cr — reached the bridge untested and section F could state only the
SIZE of that hole, beside a residual of the same order. `assetTabLines` reads all
three, through the same manager and security matchers, and **the residual is
−₹79.38 Cr against −₹263.10 Cr before.**

- **A heading is told from a holding by `Investment Date Range`.** A holding was
  bought over a window (`Jul-25 - Jul-25`); a heading is not a purchase, so the
  cell is blank or carries a stray Excel serial. Verified on all 30 rows of the
  three tabs. Columns are matched on HEADER TEXT — `Alternate` has no Quantity
  column at all, so every column after it sits one place left of where Debt and
  Cash put it, and a positional read returns the wrong column silently.
- **A heading with no children is a LINE, not a subtotal.** `PE Funds ₹32.71 Cr`
  sits above six funds summing to exactly that — skip it for its children.
  `Private Equity ₹136.16 Cr` sits above nothing: that block is itemised on the
  review's own `Private Investments` tab and is reported here only in aggregate.
  Skipping it as a subtotal loses ₹136.16 Cr; counting the ones that DO have
  children double-counts. So it is carried and MARKED, gets its own bridge step,
  and is kept OFF the ask list — no custodian issues a statement for a block.
- **Consecutive identical headings are one.** `Private Equity` prints twice, the
  second tagged `EG`. Counted twice it invents ₹136.16 Cr.
- **THE TAB'S OWN TOTAL IS THE WITNESS.** Every rule above is a judgement about a
  layout, so none is trusted: what is read must reproduce the tab's printed
  `Total`, and a tab that does not yields NOTHING and says so — the same licence
  `hdfcNsdl.mjs` needs to publish a rendered figure. All three tie to the paisa.

**IT CORRECTED THREE ROWS IN A SECTION THAT LOOKED FINE**, which is what says this
was a real gap rather than a tidy-up: Neo Infra (Debt), Baring PE and Transition
Venture (both Alternate) were reported as holdings *the review does not carry*
while the review carried every one of them on a tab nothing read. Five managers
joined C1, and the DSP Gold and Silver ETFs left the client ask list for D0 —
they are in the book, through the Motilal demat.

**AND THE ASK LIST IS FOUR DOCUMENTS, NOT THIRTY-EIGHT HOLDINGS.** That is the
deliverable: Motilal Oswal holding statements (20 lines, ₹244.59 Cr), Bharat's
HDFC Bank NSDL statement **as a text PDF rather than a scan** (10, ₹75.63 Cr), AMC
folio statements or a CAS for the Debt/Cash/Alternate fund lines (14, ₹47.56 Cr),
and one block with **nothing to ask for**. The Motilal figure stays an UPPER BOUND
and says so: the book already carries ₹78.78 Cr of Motilal demat rows no review
line matches, because the depository clips `WOC MAAF D-GROW` where the review
writes the scheme out in full and no tier above a prefix may join them. Closing
that needs a hand-checked abbreviation table, not another statement.

### THE RING-FENCE — Polycab is one page, and no figure anywhere else

*"We will remove everything related to Polycab from the dashboard, and move that
information as a single pager in this new Polycab page. So basically Polycab must
not be included in any data set information and any calculation in any other part
of the dashboard."*

That is the §4c judgement above, answered. It is a decision about the family's
affairs and NOT a parsing rule, which is exactly why it is applied at the BOOK
layer and nowhere else:

**ONE CONSTANT DECIDES IT.** `RINGFENCED_SECURITY_KEYS` in `build-book.mjs` holds
`polycab-india-limited-eq`. Right after the positions are sorted — before the
dedupe-for-total, the listed/private split, `positionsCount`, the emit and the
report, which ALL read the one `positions` array — the matching rows are spliced
out into their own array and emitted as **`BOOK_POLYCAB`**. Removing the key folds
the holding back into every total in one line, which is the reversibility §4c
requires of a decision that is the family's rather than the pipeline's.

**KEYED ON `securityKey`, NOT ON THE ACCOUNT.** `excludedAccounts` was the
mechanism this file named before the request arrived, and it is the wrong one
here: the ICICI NSDL account holds ELEVEN OTHER POSITIONS worth ₹63.78 Cr, and
excluding the account would take them out too — ₹63.78 Cr of the family's real
book vanishing to move one row. The security is the unit of the request, and
`securityKey` is this book's identity for a security (§1), so the fence holds
wherever the holding is reported rather than only where it is reported today.

**THE STATEMENT IS UNTOUCHED, AND SO IS THE ARCHIVE.** `source/` still holds the
PDF, `public/audit/` still carries every extracted row, and `nsdlDemat.mjs` still
reads all 38 holdings and still ties to the statement's own printed grand total
of ₹1,24,79,90,00,337.69 to the rupee. Ring-fencing is a decision about which
figures a DASHBOARD sums; deleting the extraction would be a decision to stop
being able to check the book, and it would break the provenance the audit archive
exists to provide. The Polycab page links straight into that document.

**AND THE PAGE DERIVES EVERY FIGURE — none is typed in.** `src/pages/Polycab.tsx`
reads `BOOK_POLYCAB` DIRECTLY rather than the portfolio context, so nothing on it
can leak back into a portfolio total, and its share count, market value, mark and
as-of all come from the book. The mark is DERIVED — value ÷ units, because an NSDL
statement has no rate column (§"the value column is a mark on 14 rows and par on
24") — and cost renders `AbsentValue` with its reason, because a depository holds
the shares and did not buy them. A ₹0 cost would report the whole ₹12,351.24 Cr as
profit at an infinite return.

***THE PAGE IS ONE TABLE CARD SINCE Stage 10bt*** — *"Polycab could be just a
simple table with all the columns and fields as required"* — so the hero, the five
KPI tiles and the stacked cards the paragraphs below describe are gone, and every
figure they printed is a column of the holding table, on the row it describes. The
reasoning below about what the statement does and does not carry is unchanged.

**THE PAGE IS THE HOLDING AND NOTHING ELSE — TWO CARDS HAVE SINCE BEEN REMOVED**,
at the family's request, and the reasoning is kept here rather than on screen. One
explained WHY the holding is ring-fenced; the other named Bharat's unreadable HDFC
scan as an absence. That second removal was made only after the premise behind it
was RE-MEASURED, because this file has recorded three absences against unchecked
premises (FRED, the RBI, the release calendar) and a fourth was worth ruling out:
the PDF carries **four DCTDecode JPEG images and ZERO font objects**, pdfjs returns
no text, and opening the scan by eye confirms both the `no-text-layer` diagnosis and
that the statement has **NO VALUE COLUMN AT ALL** — its Polycab line reads
`INE455K01017 · Free Balance 51,08,911` and nothing more. So the diagnosis was
right, no code could ever have extracted it, and OCR stays refused: a figure
recovered by OCR cannot be traced to what the document printed. The statement is
still in `source/`, still unread, and still needs a text PDF from the bank. What
changed is only that the DASHBOARD no longer says so; `docs/EXTRACTION-REPORT.md`
and the `august-2026-e` section above still do.

**AND THE CHECK INVERTED RATHER THAN BEING DELETED WITH THE CARD.** `check:pages`
now asserts the card STAYS gone — and, in the same line, that no share count from
that scan ever appears on the page, which is the half that would actually be
dangerous. Same treatment as the removed Public dashboard tab and the `/news`
redirects: a removal is verified by asserting it happened.

**BOTH HALVES ARE CHECKED, AND NEITHER IMPLIES THE OTHER.** `check:pages` walks
`/polycab` and asserts the holding renders with a share count, a value, the
statement that it is excluded from portfolio totals, and an absent cost with its
reason. And on EVERY OTHER ROUTE
in the sweep it asserts the page's `<main>` does not name Polycab at all. A page
that named it everywhere would fail the second while passing the first; an empty
`BOOK_POLYCAB` would satisfy every absence check while the page rendered nothing.
Both were verified by REINTRODUCING THE BUG: emptying `RINGFENCED_SECURITY_KEYS`
fires the absence check on nine routes — `cio`, `monitor`, `monitor-entity`,
`family-entity`, `sectors`, `compare`, `exposure`, `thesis`, `upload`, which is
the leak surface measured rather than guessed — and emptying `BOOK_POLYCAB` fires
the page's own checks while leaving the absence checks green.

**THE ABSENCE CHECK IS SCOPED TO `<main>`, DELIBERATELY.** Every other invariant
reads `document.body.innerText`, and the left nav carries a "Polycab" ENTRY on
every page by request. Read off the body it failed all 27 routes at once, for the
one reason that is correct — the same "a check that cannot read the figure it
asserts on" failure this file already names once. The claim is about a page's
CONTENT, so it is struck on the content.

**WHAT DID NOT NEED CHANGING, AND WHY THAT IS THE POINT.** The Excel and deck
exports, `dedupedPositions`, `publicPrivateSplit`, every allocation, sector,
entity, concentration and market-cap figure, and the XIRR all read the book
through `BOOK_POSITIONS` or the context built on it. One splice at the book layer
moved all of them. The surfaces that needed a hand were the two that read the
security by NAME: `review-reconcile.mjs`, which reconciles the promoter block
against the family review and now reads `BOOK_POLYCAB` — the review carries it
outside its own total too, so both sides are now ex-promoter and directly
comparable — and the stale worked examples in `check-pages.mjs`.

**ONE UNEXERCISED CODE PATH IS NAMED RATHER THAN DELETED.** The `CR` regex's
thousands-separator handling exists because this book once crossed ₹1,000 Cr and
three invariants read `₹13,061.6 Cr` as `13`. Ex-Polycab the book is ₹710.39 Cr,
so no page currently renders a separator and nothing would fail if that handling
were dropped. It comes straight back the first time the book grows past ₹1,000 Cr
or the key is removed — silently, on pages computing correctly, exactly as it did
the first time — so the comment says so.

**A SCAN IS NOT A DOCUMENT WITH NO READER.** Bharat's four pages are JPEGs —
pdfjs returns zero text items on every one — so there is no header to match and
no coordinate to read a column at. `extract.mjs` said `no-extractor`, which sends
the next person to write a provider reader for a file that has nothing to write
one against; it says `no-text-layer` now, and names the actual remedy: HDFC
re-sending it as a text PDF. Not OCR — a figure recovered by OCR cannot be traced
to what the document printed. The statement also carries NO VALUE COLUMN AT ALL,
so even read perfectly it would value nothing.

**THAT CHECK'S FIRST DRAFT DIAGNOSED THE REVIEW WORKBOOK AS A SCAN**, because
`gridFromSpreadsheet` gives every sheet `rows: []` by design. A confidently wrong
answer about a perfectly readable document is worse than the vague one it
replaced, so the test is gated on `grid.sheets` — what the grid itself uses to say
which kind it is.

**IDENTITY CAME FROM THE BOOK'S OWN UNIT COUNTS.** Neither statement prints a
PAN. Both carry fund units this book already holds from the funds' own
statements, matching to the last decimal: Sanshi Class A2 2,341,480.851 and Class
E 1,761,264.629 on Ajay's; Sanshi Class E 1,211,186.597, Sky Capital's Hudle A1
17,000 and 360 ONE Special Opportunities Series 8 Class A3 at the same
9,90,429.684 units on Bharat's. A name is a spelling; four exact unit counts
against four different funds are not.

### The Polycab page answers five asks, and the statements answer three

*"Polycab page should show the holding per demat, per holder, pledges, dividends
and splits."* Measured against the corpus rather than assumed, and the split
between what is reported and what is not is a fact about the DOCUMENT TYPE
rather than about the holding:

- **Per demat** — `INE455K01017` appears in exactly ONE document in the whole
  archive: the ICICI Bank NSDL `Statement of Holding`. Some thirty other files
  match "polycab" and every one of them matches the family's own
  **`@polycab.com` EMAIL ADDRESS** on a statement about something else. That is
  §"a document is not what it MENTIONS" arriving through a mail domain, and it
  is why the table is built on `securityKey` rather than on a name search.
- **Per holder** — the statement prints `Name AJAY T JAISINGHANI`, which
  `shared/owners.mjs` resolves. The rollup keys on the ACCOUNT and is
  deliberately NOT deduped: a per-owner breakdown shows each statement's row as
  printed (§"consolidated counts once, per-account does not").
- **Pledges** — an NSDL `Statement of Holding` has five columns: ISIN Code,
  Scrip Name, Account Description, Balance, Value. **There is no pledge,
  lock-in, earmark or freeze column on it at all.**
- **Dividends** — the only report type this account has ever issued is
  `holdings`. No dividend statement and no corporate-benefits report covers it.
- **Splits** — `BOOK_CORPORATE_ACTIONS` is real and populated: a 1:1 bonus, a
  1:5 bonus, a five-way spin-off and two distributions, across four accounts.
  This demat is not one of them and no row in it names this security.

**AND A NIL PLEDGE IS THE MOST DANGEROUS ZERO ON THIS PAGE.** The CDSL
statements elsewhere in this book DO print the encumbrance breakdown — `FREE
BAL. | PLEDGED SETUP | PLEDGEE | LOCKIN + FREEZE | SAFE/PENDING DEMAT | REMAT`,
with a measured `0.000` in each — so an unpledged balance is a figure this book
knows how to report honestly, and an invented one would be indistinguishable
from a measured one on screen. On a PROMOTER block, where a pledge is the fact a
reader would act on, it is also the most consequential zero available to invent.
The row rendered `—` with the reason, and `check:pages` asserts it can never
acquire a number that parses as zero.

***THE CARD THAT CARRIED THOSE LAST THREE ROWS IS GONE SINCE Stage 10bq***, at
the family's request, and the rule above is not. Its four claims were audited one
at a time before it went: the DIVIDEND distinction survives on the declared
table's `On this block · derived` column, which is what it is about; the BONUS
half survives and says something stronger, because the exchange's record is
complete from listing and carries none; the closing line genuinely went. **And
the PLEDGE claim — the paragraph above, and the only one on this page a reader
can be harmed by losing — moved onto the promoter card's third tile**, where it
sits BESIDE the group encumbrance it exists to be told apart from rather than two
cards away from it, which is a better home than the one it came from.
`check:pages` asserts that tile's dash, its reason and the group figure beside it
as ONE claim, and the card's absence as another. ***AND IT MOVED A THIRD TIME AT
Stage 10bt***: the promoter card became a table on its own tab, so the claim is on
this demat's own Pledged cell — `this demat` under the heading, and a dash whose
reason names the group figure as a different fact — while the group half is under
the promoter table's heading (`group, not this demat`). Two claims on two tables,
each asserted where it is drawn.

The paragraph below is kept in the order it was learnt, because what it says
about a card that can never be filled is still the rule this book follows
everywhere else. **`BOOK_CORPORATE_ACTIONS` is no longer read on this page at
all**: the record is unchanged, still names none of this security, and is still
what a future drop would fill — it simply has no surface here. *(Its original
wording:)* the card filtered `BOOK_CORPORATE_ACTIONS` on this holding's own
`securityKey` and summed `dividendReceived` off the position, so a drop bringing
a Polycab dividend or bonus into the archive would have filled those rows with no
code change. Until then each row stated what was missing and which document would
carry it, as **three rows in ONE card** rather than three dashed boxes: during an
upstream outage three empty frames read as three failures, which is the company
page's own lesson applied before it had to be learnt twice.

**THE STATEMENT'S `Account Description` IS MEASURED AND THEN DISCARDED, and that
is the one improvement left here.** `bandsFromHeader` in `nsdlDemat.mjs` derives
that column's band — it has to, to place the two money columns — and
`readHoldings` never reads it. It prints `Beneficiary` on the Polycab row,
`Beneficiary - Pre IPO Shares/27-AUG-26` and `Pending Demat` on others: a real
balance-TYPE field, and the closest thing this document has to a statement about
encumbrance. Carrying it needs a re-extraction, which needs
`GLOW_PDF_PASSWORDS`. It is named here rather than re-derived from `pages.json`
in the browser, because a presentation layer that repairs an extraction hides
the gap from the reconciler (§1) — the same reason `securityKey` is not patched
on the read side.

**SIX INVARIANTS, EACH VERIFIED BY REINTRODUCING ITS BUG.** `check:pages` walks
`/polycab` and reconciles the rendered tables rather than matching their
captions: the per-demat rows must account for every share the KPI strip reports
AND the strip for every share in `BOOK_POLYCAB` (two comparisons, because
rows-against-their-own-footer catches a total computed independently of its rows
— the Private Market page's PM-1 — and rendered-against-the-book catches a page
that drops the same row from both and reconciles perfectly with itself); the
per-holder rollup must regroup the same shares over the book's own count of
DISTINCT accounts; the share-of-block weights must sum to 100 (against the
portfolio they read ~1,738%, and it renders as an ordinary percentage either
way); every account number the book carries the holding in must appear; and the
three unreported facts must each be named and must each render a dash or a real
figure, never a zero *(that last pair went with the card at **Stage 10bq** and
INVERTED rather than being deleted: the three rows must now be absent, and the
pledge claim they carried must still be on the promoter card's third tile. The
two per-holder reconciliations moved with them — they bounded a `sliceBetween` on
the removed card's own heading, which is the "a boundary the page no longer
prints is not a boundary" failure, and they read that table's own node through
`data-polycab-holders` now)*. Verified by breaking each in turn — an off-by-one
tile, a demat count taken from rows, a weight over consolidated NAV, an unnamed
account, a fabricated nil, and a silently dropped row — and watching exactly the right
check fail. *(The KPI strip the first comparison read went at **Stage 10bt**; the
demat rows are reconciled against `BOOK_POLYCAB` directly now, and against their
own footer the moment there are two — while there is one, the footer's ABSENCE is
asserted, because a total of one row is the row again. The share-of-block weights
went with their column, which could only ever print 100% on a block held in one
demat, and the check inverted to assert the column stays gone.)*

**`ONLY=<route,route>` walks a subset of the sweep**, added for that
verification: the discipline costs a build and a full 62-combination sweep per
bug, and it is what makes reintroducing six of them practical rather than
theoretical. The default is still every route.

### THE VALUE COLUMN IS A MARK ON 14 ROWS AND PAR ON 24

`motilalDemat.mjs`'s rate column prints `100.000` on an AIF unit and that is the
face value, not a NAV. The NSDL statement has NO RATE COLUMN, so the same failure
arrives through the only price-bearing column there is. Divide value by balance:

```
NATIONAL STOCK EXCHANGE OF INDIA LTD   125,000 sh   Rs 1,25,000.00   = Re 1.00
INDIA SME INVESTMENTS AIF TRUST II      67,500 u    Rs 6,75,00,000   = Rs 1,000
SKS FASTENERS LIMITED                   24,800 sh   Rs 2,48,000.00   = Rs 10.00
```

NSE's unlisted share is not worth a rupee. **Fourteen different securities coming
to exactly Rs 10.0000 is not fourteen coincidences.** A par row therefore carries
its QUANTITY and NO VALUE, in three graded tiers — `declared` where the scrip name
states the face value and the implied price is exactly it, `scheme` for an `INF`
identifier at a unit's issue price, and `par` for a whole-rupee denomination on a
name that declares nothing. **Every row in the weakest tier is NAMED**, in the
extraction report and in `docs/BOOK-REPORT.md`, so any one of them can be
challenged. The error runs towards an em dash with a reason; the alternative is a
mark nobody struck, which renders as a number.

**AND THE PARTIAL CASE WAS GOING UNREPORTED.** `build-book`'s note for an account
that contributes no market value fired only when EVERY row was unvalued. This
account values 14 of 38, so its other 24 were dropped by the filter with nothing
said anywhere — 38 rows silently becoming 12 positions. That is "shown for those
and the rest are NAMED" failing INSIDE an account instead of across accounts, and
those 24 are now listed with their units and their face value.

**A RECORD IS THREE LINES AND THE ISIN IS THE MIDDLE ONE.** A cell too wide for
its column wraps ABOVE and BELOW the anchor line, so read line by line, `NEW FV
RS. 10/-` is a company. Non-anchor lines are assigned to the NEAREST ANCHOR BY Y,
which is a measurement: within a record the gaps are 4.6-9.6pt and between records
15-21pt. Two boundaries are load-bearing and both were found by getting them
wrong — the table starts BELOW its own header (or the first holding is named
`ICICI BANK LIMITED DP ID : IN302902 …`) and ends AT its own `Total Value of
Holding` row (or the last one is named `ZENITH LEISURE HOLIDAYS LIMITED - EQ Total
Value of Holding ( Prices as on 30-Mar-2026 ) Rs. 124,799,000,337.69 This is a
computer generated report …`, and that string becomes its securityKey).

**ONE VALUE WRAPS TOO, AND IT IS THE ROW THAT MATTERS MOST.** Polycab's
`123,512,419,665.00` is drawn as `123,512,419,665.0` at y703 and `0` at y693,
with the ISIN line between them at y698. Fragments are joined only where the join
yields ONE well-formed number, and the check that it is the right number is the
statement's own printed grand total: the 38 rows read reproduce
`Rs. 1,24,79,90,00,337.69` **to the rupee**.

**FOUR DEFECTS THIS DELIVERY FOUND IN CODE THAT WAS ALREADY HERE**, none of them
about ICICI:

- **`makeHolding` silently dropped `faceValue`.** Both depository readers have
  emitted it since they were written and the field does not exist on the object,
  so the archive never showed what the depository printed where it had no price —
  and the comment in each reader saying it did was false.
- **`dropDepositoryDuplicates`'s note had never printed.** It runs on POSITIONS,
  and a face-valued row carries no market value, so the unvalued filter removes
  every CDSL AIF row long before it. Its stated reason — that the depository
  "marks them at the face value it prints" — was therefore unchecked, and is false
  of the first rows it has ever actually dropped: the two Sanshi ones here, where
  the depository prints a real NAV. A dead branch with a confident explanation is
  how a future session "fixes" a rule that was never broken.
- **`dropDepositoryDuplicates` was keyed on ONE provider by name.** Four of this
  statement's fund ISINs are in `AIF_UNITS`; keyed on the CDSL provider alone,
  every one would have been counted a second time. It takes a SET now.
- **Three `check:pages` invariants could not read a book past ₹1,000 Cr.** They
  parsed `₹([\d.]+)\s*Cr`, which stops dead at a thousands separator, so
  `₹13,061.6 Cr` read as `13` and all three failed against pages computing
  correctly. `fmtFromBase` has always grouped Indian-style — its own header
  comment gives `₹1,606.8 Cr` as the format it exists to produce. The repair then
  introduced its own bug in one line, `Number("")` being 0, which made a check
  with no input PASS; that is `golden.mjs`'s rule, and a missing match is `NaN`.

### THE FILENAME OUTRANKED THE LETTERHEAD, AND AN ACCOUNT CHANGED MANAGER

V.E.C Assago has always filed as `VECBES0004_145052_…`. This delivery names the
same account `G128005_145052_…` — and `^G\d` is GOLDSTANDARD's prefix. All 23
new V.E.C documents, two accounts and ₹26.8 Cr of Ajay's and Ankita's money were
filed under Goldstandard Wealth.

Two things were wrong at once in `pmsStatements.mjs`:

- `detectProvider` tests the letterhead FIRST — and `extract()` called it with
  **`text: ""`**, so that branch could never fire and the decision always fell
  through to the filename. The pages were already in hand.
- The order then put `filePrefix` above the classifier's own answer. A filename
  is the WEAKEST evidence here: these six managers issue from one reporting
  system and the prefix is an account code, not a house. It is the last resort
  now, which is what it was written to be — the appraisal used to carry no
  letterhead at all.

Every one of those documents prints `V.E.C ASSAGO CAPITAL MANAGEMENT LLP` on
page one. This is §"a phrase in a footnote is not what a document is", one layer
down: **a filename is not a letterhead.**

### ₹11.5 Cr OF UNCALLED CAPITAL WAS BEING DROPPED ON A FIELD NAME

`transitionVenture.mjs` emits `commitment: { total, contributed, … }`;
`altFundStatements.mjs` emits `{ committed, drawn, … }`. `build-book.mjs` gates
on `isNum(c.total)`, so every commitment from the second shape fell out without
a word — **India SME's ₹6.9 Cr, ₹2.3 Cr and ₹2.3 Cr of genuinely uncalled
capital** among them. The dry-powder register held ₹1.5 Cr against a real
₹13.0 Cr, which is exactly the failure it was built to stop: *denying a figure is
worse than omitting it, because a reader plans around it.*

`makeDocument` normalises both spellings to one shape at the boundary, so a
third reader cannot repeat it. Field-by-field `??` and never `?? 0`: Motilal
Oswal's Founders Fund prints a commitment and a drawdown and NO undrawn figure,
and a zero there would assert the fund has nothing left to call. Sky Capital's
`Uncalled Commitment NIL` is the opposite case and keeps its measured zero. The
register is ten entries now.

### Check (c) was flagging one folio against itself

`duplicateHoldings` keyed on `account@asOf`, which lets ONE account's monthly
reissues satisfy a check whose own heading is "across owners". Sky Capital
reissues an unchanged statement every month, so Bharat's Hudle position appeared
four times at identical figures and was reported as a duplicate of itself; the
HDFC folio's two issues were doing the same, already. The guard is distinct
ACCOUNTS now.

### …and then it was flagging THREE pairs that are not duplicates at all

That fix left five groups, and this file said "the five groups that remain are
all real" **on the same page as its own reason why one of them is not** —
*"India SME's three folios print coincidentally equal units."* Both cannot be
true, and the contradiction was sitting in the prose for two deliveries.

**ONE FIGURE IS NOT "THE FIGURES THAT WOULD HAVE TO COINCIDE BY CHANCE".** The
key is `securityKey | quantity | unitCost | marketValue`, and the check's own
comment is the rule: a group is suspicious because SEVERAL independent numbers
agree. On a holding no statement values, quantity is the only one there is — and
two holders subscribing the same round number of units to the same fund is an
ordinary event. Measured, that tier was producing three false duplicates, each
refuted by a document already in hand:

| Flagged as one holding | Actually | The document that says so |
| --- | --- | --- |
| Sky Capital Oncare A3, 7,500 units, SKY023 + SKY024 | ₹1.50 Cr across two trusts | each folio's own statement prints ₹75 L drawn |
| India SME Fund II A2, 27,000 units, three folios | three subscriptions | this file already called it a coincidence |
| Swapeco Solutions, 347 shares, HDFC 67786547 + 67786137 | 694 shares across two trusts | the register records ₹1,35,00,875 under EACH |

**NONE OF THEM COLLAPSED ANYTHING, WHICH IS EXACTLY WHY IT HAD TO BE FIXED NOW.**
A quantity-only row carries no market value, so `dedupedPositions` drops it from
no total and no figure on screen was ever wrong. The day any of those funds
publishes a NAV, it would have halved a real holding silently, on a page
computing correctly — the same shape as `dedupedPositions` sitting correct and
uncalled for a drop and a half, running the other way.

So a match on fewer than TWO coinciding figures is **reported and never
grouped**, in its own section of the extraction report — narrowing detection and
NAMING what it left out, rather than dropping it. The three that remain are the
two Transition trusts and 360 ONE Special Opportunities under both CRNs, and the
₹3.17 Cr excluded from the consolidated total does not move by a rupee.

### Two more defects the same verification found, neither about a figure

Both were invisible in every artefact except the one written to catch them.

**A macOS RESOURCE FORK BECAME 25 FAILED DOCUMENTS.** Zipping on a Mac writes a
`__MACOSX/` shadow tree of 212-byte AppleDouble stubs named `._<real name>`,
carrying the real file's extension — so `READABLE` matched them, pdfjs failed on
them, and each became a `failed` document with no provider, no account and no
owner. They were invisible for as long as `source/_extracted/` happened to be
expanded by a tool that dropped them, and that directory is GITIGNORED and
DERIVED: a pipeline whose document count depends on who unzipped is not
idempotent. `walk()` skips them by path now, and `scripts/source-coverage.mjs`
still checks the bytes independently — the path says what macOS meant, the
`%PDF` header says what is actually there, and neither alone is enough.

**AND A READER SILENTLY ERASED ITS OWN PROVENANCE.** `extractOne` merges
`{ ...base, ...result }`, which is what gives a reader the last word on what it
read off the page. `base` also carries what only `extract.mjs` knows — which
file, how many pages, which pages of a bundle. `hdfcNsdl.mjs` returned a whole
`makeDocument(...)` instead of the partial every other provider returns, so that
object's own defaults spread over them and both its documents went into the
archive **naming no file**: right figures, no provenance, nothing failed.
`npm run coverage:source` is what caught it, by reporting both PDFs as UNREAD —
which is the check earning its place, and a good deal later than the merge. A
reader that returns an empty `docKey`, `sourcePath`, `pages` or `sourcePages`
now keeps the derived value and gets a `reader-cleared-provenance` warning.

### Two settlement deltas stand, and both are inside the printed precision

`transaction settlement` is held to ±₹1 on the house statements, deliberately:
that tightness is what caught brokerage being a per-unit RATE on all 256 rows.
Two rows now exceed it, and neither is an extraction error — both are the
residual of deriving a settlement from a price and a rate the report prints to
FOUR decimals:

```
V.E.C 128005  SBFC Finance   53,846 × 90.6262 + 0.1024/unit + STT   delta −1.77   bound ±5.38
Carnelian     Bandhan Bank   40,130 × 166.1882 + 0.1163/unit − STT  delta +1.27   bound ±4.01
```

The bound is `quantity × 1e-4` — half of the last printed decimal on each of the
two per-unit figures. Both sit well inside it, and the brokerage bug that
tolerance exists to catch was ~₹2,900 on a 22,476-share trade, more than a
thousand times the allowance. They are reported rather than explained away: the
`ratePrecision` machinery that would relax them exists and the house statements
opt out of it on purpose.

### Two engine defects the Molecule statement exposed

Neither is about Molecule. Both had been silently costing rows on statements
already in the book, and a new bundle is simply what made them visible.

**A REPORT TITLE PRINTS IN BOTH WORD ORDERS.** `lib/bundle.mjs` matched
`DIVIDEND STATEMENT` and `EXPENSE STATEMENT`; this reporting system also prints
**`STATEMENT OF DIVIDEND`** and **`STATEMENT OF EXPENSES`**, which is why
`STATEMENT OF CAPITAL GAIN` already needed its own entry. A page whose title
does not match announces nothing and joins the report BEFORE it, so Molecule's
two dividend pages were absorbed into CURRENT PORTFOLIO: the holdings document
was four pages of two different reports and the account's dividends reached no
reader. Every earlier document carrying those titles arrived STANDALONE, where
`classify.mjs` types the whole file and the splitter never runs — which is
exactly why it went unnoticed until the first bundle carried one.

**A HEADER SPAN WAS SWALLOWING THE FIRST DATA ROW.** `findTable` tries header
spans of one, two and three lines and keeps whichever maps the most columns.
A DATA row helps that score — its cells sit squarely in their columns, so the
geometry sharpens and one more label maps — so the longer span wins and its data
is read as header. Refusing the longer span is the wrong fix and was tried: it
loses the column the extra row was helping to place (Carnelian's `rate` went
unmapped and every `ratePerUnit` on that statement went null).

The span is a MEASUREMENT; the header is a set of LABELS; only the second says
where data begins. So the geometry keeps the full span and `bodyFrom` starts the
body at the first line carrying FIGURES. "Carries figures" is exact rather than
heuristic: every real wrapped label here — `Amount`, `(M)`, `Quantity (S)`,
`Rate (P)`, `Held`, `Gain-LT` — parses as no number, **and so does the capital
gain header's `31-Jan-18`**, a date inside the "Price on 31-Jan-18" label that a
no-dates rule would have thrown away.

It was worth **₹1,27,240.50 of dividend income the book had never carried** —
one row per statement, always the first:

| Account | Recovered | Row |
| --- | ---: | --- |
| Carnelian 3517383 | ₹62,750 | Biocon Ltd |
| V.E.C Assago 128004 | ₹25,189.50 | Navneet Education Ltd |
| Green Lantern 510854 | ₹17,850 | Bajaj Auto Ltd |
| Molecule 7810404 | ₹21,451 | the new statement's three rows |

plus three Goldstandard capital registers' `Opening Balance` rows and one
Molecule expense row. **Every affected dividend statement now ties to its own
printed grand total to the rupee**, which is the check that says the recovery is
complete rather than merely larger.

### A FOURTH BASIS: CURRENT PORTFOLIO FOLDS IN THE OUTSTANDING DIVIDEND

The nine material deltas the new statement raised were not extraction errors.
CURRENT PORTFOLIO's Market Value column folds in the dividend that has gone EX
and has not yet been RECEIVED:

```
INDIAN METALS    1,500 x 1,448.60 = 2,172,900.00  + 11,250 = 2,184,150  printed 2,184,150
KIRLOSKAR        2,967 x   475.65 = 1,411,253.55  +  8,901 = 1,420,154.55  printed 1,420,155
SASKEN             100 x 1,811.80 =   181,180.00  +  1,300 =   182,480  printed   182,480
```

and the account's printed total sits exactly 21,451 above the sum of the derived
rows — the figure its own DIVIDEND SUMMARY prints as "Outstanding Dividend".

**IT IS NOT THE INCOME COLUMN.** That column is year-to-date (Indian Metals
48,750 against 11,250 outstanding), which is why `explainedByAccrual` — the same
shape, reading `accruedIncome` — explained the one row where the two coincide
and left the rest material. `outstandingBySecurity` reads the SAME account's
dividend statement instead, and only a report the splitter actually produced —
which is why the title fix above had to land first.

Kirloskar's 0.45 residual is the printed price's own last digit, so the bound is
`quantity x 0.005`, the statement's printing precision reproduced — not a
tolerance widened until it fits. The percentage column is explained the same
way, by reproducing `printed market value / printed total` and requiring EXACT
equality at the two places the statement prints. Both are scoped to
`reportType === "holdings"`: the appraisal's market value is price x quantity
exactly and must keep failing loudly if it ever stops being.

Material deltas are back to the baseline's one — a pre-existing ₹1.27 settlement
difference on Carnelian's August transaction statement, which this delivery
neither caused nor fixed.

### A THIRD %-BASIS, DECLARED BY THE STATEMENT AND WORTH 46 MATERIAL DELTAS

SVAN's 31 July investor report put 46 material deltas in the reconciliation —
every `pctAssets` on the document, each about 11% adrift, which blocks the
golden test. It was not an extraction error. The report heads its weight column
**"Assets Under Management (%)"** and totals that column at **111.54%** of the
market value printed beside it:

```
Shares  144,891,378.61   155,651,492.21   105.37%
Cash      9,110,226.43     9,110,226.43     6.17%
Total   154,001,605.04   164,761,718.64   111.54%
```

So AUM is a SMALLER number than the portfolio's market value — 164,761,718.64
/ 1.1154 = 147,715,365 — and the total row is the only place the document
states it. Two source properties combine, which is why a naive check missed it:
the denominator is AUM, and on **11 of 46 rows the statement's own market value
does not equal its own quantity × price** (Ceat prints 1,590 at 3,429.90 and a
value of 5,509,191.00, which is 3,465.53 a share).

Reproduced from the printed value over the declared AUM, all 46 rows land
within the printed 2dp, so they are `explained` with that cause named — the
same treatment as the income-inclusive basis, and for the same reason: **the
formula is reproduced per row, never a tolerance widened.** The AUM is taken
from the document's own total row and nowhere else; an AUM fitted to the rows
it is meant to explain would explain anything, so a report that does not
declare one leaves its deltas material.

### Encrypted statements — `GLOW_PDF_PASSWORDS`

EIGHT of the PDFs in this drop are encrypted, and with the third password the
run now reports **zero failed documents**. The passwords are **never committed**;
they are read from the environment:

```
GLOW_PDF_PASSWORDS="one,two,three" npm run extract
```

`passwordsFromEnv()` in `lib/layout.mjs` supplies the list and every attempt is
tried in order per file, because it is not one password — three different ones
open eight files across four issuers, and which opens which is not printed
anywhere reliable. The drop's own `pASSWORD.docx` names two of the three, and
even those it mislabels: the entry it calls the Kotak password opens the August
Kotak statement and NOT the July one, which the ABSL entry opens instead. The
third — the one that unlocks Bharat's 360 ONE Alternates pair — is named in no
file here at all; it is his own PAN, printed on page one of statements this
pipeline already reads. **An unreadable document is not proof the key is
missing.** The archive records THAT a document was encrypted and which list
entry opened it, **by position, never the value**.

Two things about this are worth stating plainly rather than leaving implicit:

- These passwords are PANs and a SEBI registration number, so they are
  personally identifying and cannot live in a tracked file as configuration.
- They nonetheless appear in `public/audit/*/pages.json`, because **the
  statements print them on the page** and that file is the faithful text record.
  Removing them would break provenance for no security gain: `source/` holds the
  encrypted PDFs themselves in the same repository.

`extractLayout` hands pdfjs a COPY of the bytes per attempt. pdfjs takes
ownership of the buffer it is given and detaches it, so without the copy the
second password is tried against zero bytes and fails with a parse error that
says nothing about passwords.

### 1. `securityKey`, not ISIN, is the join key

These providers print a security **name and nothing else** — no ISIN, no ticker,
on any of the PMS statements. A model that requires an ISIN to identify a security
cannot represent this book at all.

So `Position.securityKey` — a slug of the normalised security name
(`securityKeyOf`) — is the identity, and it is what grouping, look-through, dedupe
and the `/stock/:securityKey` route all use. `isin` and `symbol` are **optional
enrichment**: nice when present, never required for a position to exist.

The normalisation is deliberately conservative (case, punctuation, trailing legal
suffixes — `HFCL LIMITED` = `HFCL Ltd.`) and preserves anything that distinguishes
real instruments (series, class, tranche). Merging two different securities into
one key is worse than showing them apart.

**Some providers glue the ISIN onto the name.** Carnelian's capital gain statement
prints `CRIZAC LIMITED-INE0S4R01014` in one column. `splitSecurityName` (in
`shared/securityKey.mjs`) separates them before anything else runs, so the key
comes from the CLEAN name — `crizac`, which joins that manager's own transaction
statement natively — and the ISIN is kept as enrichment rather than thrown away.
It runs on EVERY record type, not the one report that glues them today.

The pattern is anchored and narrow on purpose: a trailing `IN[EF]` + nine
alphanumerics, matched only at the end after a separator. An unanchored search
finds `INDraprastha Medical Corp. Ltd.` — same shape — and would amputate a real
company name; three statements in this drop carry it. A separator printed with an
empty ISIN column (`Vedanta Iron and Steel Limited-`) is trimmed too.

This used to be patched on the read side, in `src/lib/ledger.ts`. **Do not
reinstate that.** A presentation layer that repairs identity hides the defect from
the reconciler, which is the only thing that would have caught it.

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

### 4b. Primitives are ingested; everything derivable is DERIVED

A statement's own arithmetic is not internally consistent. The Goldstandard
Appraisal prints Sundaram Finance at MV 7,740,510 with %Assets 4.29%, but
7,740,510 / 181,533,677 = 4.26% — its percentage is on an income-inclusive basis
its own MV column excludes. Ingesting both as facts imports that contradiction.

So `makeHolding` takes only **primitives** — quantity, unit cost, total cost,
market price, accrued income (plus market value where no price is reported, e.g.
360 ONE AIF units, flagged `marketValueFromPrinted`). `deriveHolding` computes
market value = price x quantity, gain = value - cost, %gain, and %assets.

**The %assets denominator is derived, not printed.** It is the sum of the derived
market values including cash, NOT the statement's printed total. Both sides then
sit on the same measurement and the weights add to 100. Dividing an ex-income
numerator by the printed income-inclusive total leaves them summing to 99.83 —
a gap that is neither rounding nor a holding, just two bases mixed together.

The printed figures are kept in `printed.*` as a **CHECK, not a source**. Every
delta lands in the extraction report's section (a2).

**The one income-inclusive rule, verified exactly.** Across all five appraisals,
every appraisal row satisfies

```
printed %Assets = (row market value + row accrued income) / (printed total, itself income-inclusive)
```

so those deltas are classified `explained` with that cause named, by reproducing
the formula per row — not by widening a tolerance. The same basis explains every
row-sum shortfall: `sum(marketValue)` falls short of the printed total by exactly
the account's accrued income (Goldstandard 100023: ₹3,79,600, to the rupee).

### 5. Asset class is what a thing IS; engagement is how it is RUN

`AssetClass` = `Equity | ETF | Mutual Fund | AIF | Bond | Structured Product |
Unlisted | Cash`. **PMS is not on that list and must never be added.** A
portfolio-management mandate is a relationship with a manager; the holdings
inside a PMS are ordinary listed equity and are classified as such.
`assertNormalized` rejects a document that tries otherwise.

How an account is run is `Account.engagement` = `PMS | AIF | Advisory |
Distribution | Execution | Direct | unknown`, with `providerEngagement` holding
the provider's own wording verbatim.

**Engagement lives on the MEMBER, not the account, and is never defaulted.** One
360 ONE CRN spans several member sub-accounts on different engagements —
CRN37702 carries a Distribution member and an Executionary one, and its May
corporate actions are tagged Executionary while its holding sits in
Distribution. `Account.members: Member[]` holds them; `Account.engagement` is
**derived** (`dominantEngagement`) from whichever member carries the most value.
An engagement that cannot be read is `unknown` and warns — never Advisory by
default, which would mislabel both of this book's CRNs.

### 4c. Duplicates: carry both, count once — until the family answers

*Reversible policy, kept in one place; answered for both of this book's pairs.*
The same position can appear on two family members' statements. Neither row is
suppressed: matching rows share a `dedupeGroup` and carry `alsoReportedUnder`, an
account view shows each statement as printed, and **consolidated totals count
each group once** (`dedupedPositions` in `src/lib/analytics.ts`, mirrored by
`consolidatedValue` in `reconcile.mjs`).

**Figures that coincide are evidence of one holding reported twice, never
proof**: two members can buy the same units of the same fund on the same terms.
So count-once is an answer pending, and only the family can give the real one.
Their answers are `shared/separateInvestments.mjs`: a pair it names is two
investments, forms no `dedupeGroup`, and is counted in full. On 28 Sep 2026 they
named both of this book's pairs (Stage 10cx), so on this book the policy tags
nothing. It stays for the next pair a drop brings. Deleting an entry puts that
pair back under it: `npm run replay:dedupe`, then `npm run build-book`.

### 6. One person, one ownerId

The same family member is printed three ways across these providers — `Mr. AJAY
T JAISINGHANI` (360 ONE), `Ajay Thakurdas Jaisinghani` (Goldstandard), `Ajay
Jaisinghani` (a family-name field). Grouped by printed name, one person becomes
three and every per-entity total, allocation and XIRR is quietly wrong.

`shared/owners.mjs` is the canonical registry: `{ ownerId, displayName,
aliases[] }`, matched case- and honorific-insensitively, plus an initials rule
that bridges `Thakurdas` and `T` without merging different first names. Every
account resolves to an `ownerId`. **A name that matches nothing is reported
loudly** in the extraction report's "unresolved" section — never turned into a
new owner.

(`SattvaSummary` from the source cockpit is `BookSummary` here.)

