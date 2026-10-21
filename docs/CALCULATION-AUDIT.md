# Calculation audit — 21 October 2026 (Stage 10fx)

*"These were basic logical calculations that are pre-assumed while calculating any
returns. we need to make sure we do not make any such logical errors while
calculating anything on the dashboard throughout the future. do a thorough audit
… logical calculations need to be correct as per the industry standards."* — the
family, 21 Oct 2026.

Six areas were audited against industry practice (GIPS / CFA performance
measurement, ILPA private-market metrics, the Income-tax Act's capital-gains
rules): holding and aggregate returns, money-weighted and period returns,
private markets, capital gains and tax, allocation / exposure / the live layer,
and the offline book build. Every finding was reproduced on the book before it
was fixed. The standing rules that came out of it are in `CLAUDE.md`
§ Calculation standards — read those before adding any figure.

Severity: **H** a wrong figure a family member saw; **M** wrong in a case this
book has or will soon have; **L** latent or edge.

## Returns on holdings and sets

| # | Sev | What was wrong | Standard | Done |
|---|---|---|---|---|
| R1 | H | A holding bought in several lots was annualised as a CAGR from its OLDEST lot (VEC 128004 Eureka Forbes −25.50% CAGR; XIRR −46.11%). Seven holdings affected. | A single-start compound rate is valid only for one purchase held throughout; staggered money has a money-weighted rate. | CAGR refused unless one purchase date and nothing sold (`Position.purchaseDates`, `singlePurchaseGap`); HPR shown with the reason. |
| R2 | M-H | Exited holdings and closed mandates were outside every since-inception aggregate (survivorship): book FIFO 22.03% vs 21.20% with ₹14.83 Cr of exits' gain on ₹89.93 Cr. | GIPS: terminated holdings stay in since-inception performance. | `fifoTotals({ exited })`, `exitedRows`; Morning CIO, Monitor footer, /holdings, Performance, Family Entities and segment attribution all 21.20%; exits named in the hover. |
| R3 | M | Hover arithmetic and captions omitted the dividends the return includes (Sector return popover, Monitor and Morning CIO captions). | A worked line must carry every term of its figure. | Fixed on every surface. |
| R4 | M | Consolidated sheet "XIRR" was an MV-weighted average of holding IRRs over different windows. | An IRR pools the flows. | Pooled (22.00% → 18.54%). |
| R5 | L | Whole mandate lost an uncosted row's value from its gain; leftover `cost > 0` guards refused all-realised holdings; `bucketBy` had no coverage gate. | — | Fixed. |

## Money-weighted and period returns

| # | Sev | What was wrong | Standard | Done |
|---|---|---|---|---|
| P1 | H | The Returns tab built its own inputs instead of the verified return records: FYTD +25.04% over 9 accounts vs the tile's +20.59% over 17 (stale Green Lantern close, Active Momentum opened at nil, nine verified folios dropped). | One question, one selected record. | `accountInputs()` reads the records; FYTD +20.58% over the same 17 accounts (opening-date difference only). |
| P2 | M | Since-inception XIRRs closed on the holdings statement while a newer verified record existed (Carnelian 11.05% → 11.67%). | Newest reconciled close. | `capitalClose()`; value/as-of stay on the holdings. |
| P3 | M | "Absolute return" = gain ÷ (opening + all capital in): FYTD 12.52% where Modified Dietz gives 20.79%. | Period return with dated flows = Modified Dietz / TWR. | Modified Dietz, labelled. |
| P4 | M | Opening marks of any age (MTD opened Goldstandard on 11 Aug marks). | A stated period needs a valuation at its start. | 7-day tolerance; stale accounts excluded with the mark's date. |
| P5 | M | Money-weighted portfolio vs time-weighted index. | PME (Long–Nickels). | "Same flows in index" column; gap is like-for-like. |
| P6 | M | Annualised tile looked like it was waiting while it can never fill (FY-start records). | A card that cannot fill says why. | Reason reworded. |
| P7 | L | YTD on a value from a prior year (Zepto); NAV links assumed end-of-interval flows; fund/startup XIRR dated at today; redeemed parts dropped from pooled XIRR; Simple Dietz with UTC/local mix; XIRR multiple roots silent; `performance.ts` dead and seeded with estimated closes. | — | Fixed / deleted; multiple roots now refuse. Link Modified Dietz is wired but waits for `NavPoint.flowWeighted` from the build (follow-up). |

## Private markets

| # | Sev | What was wrong | Standard | Done |
|---|---|---|---|---|
| M1 | H | Distributions ignored the review's dated income and sale rows: ₹64.17 L (6 of 13 accounts) shown, ₹94.53 L (17 of 17) real; 360 ONE row ₹7.16 L vs the ₹19.78 L its own XIRR counted. | Distributions are the same cash the IRR counts. | Review-basis distributions; letters already on the review counted once. TVPI 1.33× / DPI 0.02× / RVPI 1.31× now struck. |
| M2 | M-H | Private funds' FIFO returns left out every distribution (Neo 13.83% → 21.21%; 360 ONE 46.96% → 65.59%). | Total return includes income. | Build carries review income and dated payouts ≤ valuation into `dividendReceived`. |
| M3 | M | Review cost = purchases − sale proceeds (not FIFO); 360 ONE ₹20.8 K of realised gain hidden in unrealised. | FIFO; denominator = paid-in. | FIFO over dated rows; printed figure kept as the check. |
| M4 | M | Neo TVPI added a distribution paid after its NAV date (1.209× vs 1.195×). | A payout after the NAV is inside the NAV. | Fixed. |
| M5 | L-M | 22 written-off investments were invisible beside "the whole private book". | No survivorship; name what cannot be struck. | Named on the total row and Funds tile. |
| M6 | L | Fund-of-funds model: RVPI labelled MOIC, 0.00× / 1.0× in place of absent. | — | Fixed. |

## Capital gains and tax

| # | Sev | What was wrong | Standard | Done |
|---|---|---|---|---|
| T1 | H | Hold-to-LTCG planner worked per position, not per lot: ₹34,127 shown, ₹1,04,355 over 4 short-term lots in 3 names. | ST/LT is per lot. | Planner over the open-lot registers. |
| T2 | H | Stock page painted unregistered accounts as short-term (Ather "Short-term 77%" where known ST is ₹0); split shown undated though lots had since turned long-term (Transrail). | Unknown ≠ short-term; age to today or date the split. | Split over registered rows, the rest named "Unknown"; re-aged to today (IST). |
| T3 | M | Long-term tested at 365 days, day 365 counted long-term; every LT date one day early. | s.2(42A): held not more than 12 months is short-term; LT from anniversary + 1, calendar months. | `shared/holdingPeriod.mjs` (one rule, build and browser). |
| T4 | M | One 12-month threshold for every asset. | 24 months unlisted; specified (debt) funds bought ≥ 1 Apr 2023 never LT. | By asset class. |
| T5 | M | Dividend income net of TDS. | Income is gross; TDS is a credit. | Gross everywhere (Goldstandard HDFC AMC ₹53,460 → ₹59,400). |
| T6 | M | FY tax caption claimed whole-year coverage over accounts closing in Jun–Oct. | A caption must not widen its figure. | Each account's span named; short taxpayers flagged. |
| T7 | L-M | "Realised gains (period)" headline summed seven financial years (₹16.17 Cr) beside a one-year tax tile. Supersedes Stage 10da's choice. | — | Headline FY 2026-27 (₹3.35 Cr); windows total kept, labelled. |
| T8 | L | ₹1.25 L s.112A exemption not applied; UTC "today"; liquid-fund gains filed as Equity. | — | Applied per person per FY; IST; class from the holding. |

## Allocation, exposure, live layer

| # | Sev | What was wrong | Standard | Done |
|---|---|---|---|---|
| A1 | H | Monitor Security view under an Entity filter added the WHOLE family's fund look-through to one member's rows (Ankita's ICICI Bank +₹5.06 Cr via funds, incl. Ajay's Helios). | Numerator and denominator over one set. | Look-through struck over the entity's own funds. |
| A2 | M | Active weights vs an index over a denominator including Unclassified (sum −U; Financials +1.7 pp → +7.0 pp). | Actives sum to ~0 over a like-for-like sleeve. | Classified sleeve; Unclassified a named residual. |
| A3 | M | Equity index compared with look-through that included liquid funds, CDs and gross BAF equity (HDFC Bank CDs on the HDFC Bank equity key). | Compare the equity sleeve. | `derivedEquity`; debt and gross BAF named, not compared. |
| A4 | M | Concentration counted by share class (Sanshi 20.9% → 24.4%; Top-10 55.2% → 57.1%). | Concentration by issuer / fund. | `concentrationNames` (class club + ISIN); drill-down agrees. |
| A5 | M | Day change blended a missing move as ₹0 (mandate rows, totals); quotes from different sessions summed. | Never blend missing as zero. | `dayMoveOf` over measured lines, the rest named; one session. |
| A6 | M | Hard-coded ₹83.5/USD when the FX feed failed. | Never a constant for a market fact. | Last fetched rate with its date, else INR with the reason. |
| A7 | L | NAV movers' rupee move on post-move value (overstated by 1 + c). | Move from the prior value. | Fixed. |

## Offline book build

| # | Sev | What was wrong | Done |
|---|---|---|---|
| B1 | M | Mandate since-inception capital stamped through as-of when the record stopped earlier (SVAN 8710067). | Requires the record to reach as-of. |
| B2 | M | Extraction report's "Consolidated (duplicates counted once)" ₹13,779.65 Cr was every statement row summed. | Relabelled truthfully. |
| B3 | M | `dividendReceived` described as cumulative, holding only the income statement's window. | `Position.dividendFrom` names the window. |
| B4 | L | Cash AIF distribution filed as non-cash; Buoyant's reinvested gain distribution missing from income; a ₹0-cost undated lot read as a measured zero; a sale with no amount booked as a total loss; IDCW regex matched scheme names; avgCost not restated under FIFO. | Fixed. |

## Not changed (named, with why)

- **`BOOK_SUMMARY.positionsCount`** counts redeemed-to-nil rows. Many captions and probes read it, so changing its meaning needs those readers changed together.
- **HDFC folios' as-of** is the issue date, not the 31 Aug mark. The return records use the mark; moving the account date shifts staleness across pages.
- **Depository fund units under a second key (B-14):** an identity change for the extractor. Concentration now joins those units by ISIN.
- **Equalisation received** counts as income in the FIFO return and the XIRR. It is kept out of the Distributions tile, where it is named; ILPA practice varies.
- **Per-link Modified Dietz on the NAV index** waits for the build to emit `NavPoint.flowWeighted`.
