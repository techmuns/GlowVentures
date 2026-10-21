# The standing rule and the presentation rule

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 24–201). CLAUDE.md now carries the condensed rules; this file is the record. -->

## The standing rule

**No figure is ever fabricated.** If the source doesn't carry a number, the UI
renders `—`. Not a zero, not an estimate, not an interpolation, not a plausible
default. This applies to every layer:

- A metric needing data the model doesn't carry (per-entity XIRR/YTD, which need
  dated cash flows) renders `—` until an ingest supplies it.
- An **empty book renders an empty state, never zeros.** `₹0` is a measurement;
  "no statement yet" is the absence of one, and they look identical on screen.
  `PortfolioContext` exposes `bookIsEmpty` and `<Gate>` in `App.tsx` stops every
  analytics route on it.
- A price the quote feed couldn't supply keeps its statement mark and is flagged
  as not-live, rather than passing a month-old mark off as current.
- The ingest classifier writes `null` for a field it can't determine, and files
  it can't place go in a "could not classify" section rather than under a guess.

### The preview convention, and the two lines it must not cross

`src/components/Preview.tsx` rendered a GREYED SAMPLE so the client could see
the shape of a FOOS-spec screen before its source existed. That is legitimate
for a page that is nothing but a mock. It went wrong twice, in ways worth naming
because both looked compliant — badged, hatched, muted, `title`-tagged:

***THE COMPONENT IS GONE SINCE Stage 10bc AND THE RULE BELOW IS NOT.*** Its last
caller was Exposure & IPS, which the family asked to remove — and that caller
imported exactly ONE of its seven exports, the other six having been uncalled for
some time. A module nothing calls is the dead-code-that-looks-alive failure this
file keeps naming, so it got the `exportDeck.ts` treatment rather than being left
exported and dead. What follows is a rule about what a greyed sample may never
do, and a rule lives here rather than in an uncalled component; a future page
that needs one writes the badge again and obeys it.

**1. A preview figure must never be arithmetic on the family's own money.**
`PublicDashboardView` printed Target value = `marketValue × 1.25`, Pending to
invest = `× 0.18`, Target weight = `weight × 1.3 + 0.4`, Fair value =
`(price ?? cost ?? 100) × 1.18` — the `100` a per-share price invented outright.
Each sat in the same ROW as that holding's real market value. `ExposureIPS`
computed `gap = actual − desired` from a real actual and a typed-in desired, and
the gap is the only figure a reader acts on. Greying a number marks it not-live;
it does not stop it being a number ABOUT THIS HOLDING. The book's own rule for
this exact field already said so: a price nobody set is `null`, never a default,
because a default is "a fabricated figure produced by a default, which is the
exact failure this book exists to prevent". `× 1.25` is worse than `0` — it is
plausible. **These render `AbsentCell` with a reason.**

*`PublicDashboardView` itself has since been REMOVED* — the family asked for the
Portfolio Monitor's third tab to go, so the component, its route in
`check-pages.mjs` and the block in `check-family-inputs.mjs` that drove it are
all gone, and the remaining check asserts the tab is ABSENT rather than deleting
the test with the feature. The judgement fields it displayed are untouched:
`watchlist.ts` still stores target price, fair value, its reference year, the
valuation method and the target weight, and a name's own company page still
reads and writes them. Only the table that showed them beside the book is gone.
The lesson above stands on its own and is why this paragraph names the file
rather than quietly dropping it.

(The four cards on the company page that recorded a permanent absence —
Business segments, Operating metrics, Value chain, Calendar — have since been
REMOVED too, at the same request. Nothing wired here publishes any of them for
any company; the absence is recorded in `docs/API-PROBE.md` rather than drawn as
four dashed boxes that read, during an upstream outage, as four more failures.
What must never come back is the INVENTED version they replaced.)

**2. A preview must never assert a FACT about a real, named counterparty.**
Alerts carried "Aristos: fund manager resigned" at high severity; Thesis &
Triggers, "Carnelian: FM change flagged in filing"; Knowledge, a dated manager
meeting where the family "exited on governance concerns after promoter pledge
rose". Aristos is the strategy SVAN runs for two of these accounts; Carnelian and
Green Lantern run two more. **A greyed number reads as illustrative; a sentence
does not.** A reader who sees that their manager resigned has learnt something,
and no badge unlearns it. Each of those cards now states the CONDITION it would
evaluate — true whether or not it ever fires — and says plainly that nothing has
fired. Index-cycled categorical attributions are the same failure in miniature:
`VAL_METHODS[i % 5]` assigned "DCF" to real companies by ROW ORDER, so sorting
the table changed which company was valued by DCF.

**A third round of the same failure, found by finally measuring production.**
The client's URL arrived only after these screens shipped, and `MUNS_TOKEN`
lives in the Cloudflare environment and nowhere else — so several endpoints
carried an explicit UNVERIFIED AGAINST THE LIVE API comment, and every
preview built around them had never been checked against what the upstream
really returns. Probed on 2026-08-11 (`scripts/dev/live-api-proxy.mjs` serves
the LOCAL build with `/api/*` forwarded to the deployment), all of them answer.
That measurement removed the excuse for five more fabrications, each of which
had been sitting on the client's live dashboard:

- **Company page** — `Business segments 58/27/15`, `Geography India 72 / US 18 /
  RoW 10`, `Capacity 11.0 mn units · Utilisation 76%`, `Customer A / Supplier X
  · Top-5 concentration 38%`, and a calendar asserting `Next earnings 24 Oct
  2026` — all under a real company's name. The live `financials` response was
  then checked for every one of them and carries none: its sections are Pros &
  Cons, About, Stock details, Shareholding, Balance Sheet, P&L, Quarterly
  Results, Peer Comparison. Absent, each naming its source.
- **Exposure & IPS** *(the PAGE has since been REMOVED at the family's request —
  see Stage 10bc. The entry stays for the reason the Economy ones below it do:
  the lesson is about what was PRINTED, not about which route printed it)* —
  `Portfolio movement: MoM +2.1% · QoQ +6.4% · YoY +18.7%`
  about this family's real ₹335 Cr book, with its own caption already saying the
  book cannot measure it. And three GAP dimensions whose **ACTUAL** columns were
  typed in — the desired side was a known fabrication, the actual side claims a
  measurement.
- **Economy / Macro Research** — release calendars asserting real prints in
  SENTENCES: `India CPI actual 4.83%`, `RBI Policy Rate — held as expected;
  stance stays 'withdrawal of accommodation'`, `China GDP actual 4.7% — miss on
  weak property`. The RBI policy rate is IN the harvest store, so the page was
  printing a fabricated policy rate while carrying the real one.
- **Every Economy row's `value` and `chg`** — `Manufacturing PMI 58.1`,
  `Capacity Utilisation 76.4%`, `Household Debt / GDP 38.9%`. **The FIELDS were
  deleted from the `Row` type, not just the render**, so reintroducing one is a
  type error. Deleting a render leaves the numbers one line from returning; the
  same reasoning that removed `custodianOf()` rather than fixing it.

*(The **Economy** and **Macro Research** pages named in those last two entries
have since been REMOVED at the family's request — see Stage 10x. The entries
stay because the lesson is about what was PRINTED, not about which route printed
it, and the `Row`-type deletion above is still the model for how a fabricated
field is retired. The same treatment `PublicDashboardView` gets further up.)*

The test to apply: **would this still be honest if the badge were cropped out of
a screenshot?** Sample macro series on a page with no family data pass it.
Anything sharing a row, a tile or a sentence with the book does not.

### The presentation half of the same rule

The rule above governs the model. It has a twin on screen, and the screen is
where a reader actually forms a belief:

**A measured zero and an absent measurement must never look the same.** Any
tile, chart, table cell or total whose underlying collection is EMPTY renders
`—` with a one-line reason — never `0`, never `0.00%`, never an empty chart
frame with axes drawn around nothing. `src/components/Absent.tsx` is the one
place that renders it: `AbsentValue`, `absentTile(reason, hint)`, `AbsentCell`
for one row among many that do have the figure, and `AbsentSection` for where a
chart would be. Every one of them takes the reason as a required argument,
because "no data" tells a reader nothing about whether to go and find something.

Three corollaries that this book actually needed:

- **Never blend a missing value into a total as zero.** `sumOrNull` in
  `src/lib/analytics.ts` returns `null` when every input is null and skips the
  nulls otherwise. Averaging a missing account in as zero drags the answer
  towards a number nobody measured.
- **A figure that exists for SOME accounts is shown for those and the rest are
  named.** Realised gains exist for 7 of 23 accounts here; the other 16 render
  "no capital gain statement issued for this account in this drop", and the total
  says how many it covers.
- **A COMPUTED zero is legitimate and stays** — cash has no P&L, a net realised
  loss owes no tax — but the reason goes in the tile, not in a tooltip. A reader
  scanning `₹0` beside a −₹1.97 Cr loss must be able to see it is the arithmetic.
- **A CAPTION THAT NARROWS A FIGURE IT DOES NOT NARROW is the same failure as one
  that widens it.** Morning CIO's Capital invested tile printed "cost in · listed
  only" over a sum that has always run across `consolidated` — every account,
  every asset class — and the tile beside it was headed "Listed return". The
  locals were named `listedMV` / `listedCost` / `listedPnL` from the days when
  every account in the drop was a listed-equity mandate, and the labels followed
  the names rather than the arithmetic. They are `bookMV` / `bookCost` /
  `bookPnL` now, the captions say "whole book", and the tile names the **6 of
  309 positions whose statement reports no cost** — `sumOrNull` skips them, so
  the total's own caption is where that has to be said.
- **AND A TOTAL MUST TIE TO ITS OWN COLUMNS.** That page's allocation table put
  the MONEY-WEIGHTED whole-book return in the Total row of a column whose every
  other cell is return-on-cost, so the footer read +28.3% beside its own Invested
  ₹394.1 Cr and Current ₹461.0 Cr — which is +17.0%. Both figures were right on
  their own terms and a long paragraph underneath explained the difference; the
  family asked for the paragraph to go, and a reader who divides one printed cell
  by another and gets a third answer has found a contradiction no popover
  rescues. The footer is on its rows' basis now. The money-weighted figure keeps
  its place — in that cell's popover, in the Consolidated return tile's popover
  and on the Book performance card — each stating the fraction of the book it
  covers, because it can only be struck on the accounts that publish an opening
  portfolio value.

`npm run check:pages` renders every route headlessly and reports console errors,
failed requests, and any on-screen `₹0` / `0.00%` with its surrounding text. The
last of those is a lead rather than a verdict — a bar chart's ₹0 axis tick and a
cash holding's genuinely-zero return both match, and both are correct.

