# Figure audit — every figure the dashboard shows, checked against the statements

Audited on `main` at `20a3f15`, 23 Sep 2026. This file is the report the fixes
were made against. Each finding below carries the status it had on that commit;
the stage that fixed it is recorded in `CLAUDE.md` and in the PR that shipped it.

## How the audit was done

- **Scope.** Every route the app serves, every tab, KPI tile, table column,
  footer total, chart, drill-down, search result, hover figure and both sheets of
  the Excel export. 86 addresses were rendered headlessly at 1500×1000 and dumped
  cell by cell (text, `data-*` attributes and every `title`, so an absent cell's
  reason is read as well as its dash) — once with no quote feed (the published
  AMFI NAVs applied, as a local preview runs), once with every tree row
  expanded, and once with the live layer fulfilled from fixtures.
- **Method.** Thirteen passes, one per area: Morning CIO (tiles and allocation;
  movers, NAV chart and top bar), Portfolio Monitor (holdings; transactions;
  security axis and the Excel export), Private Market, Family & Entities with
  Sector Composition, Polycab, the holdings / stock / mandate drill-downs, search
  and the Muns chat context, the Extras and Admin pages, a hand check against the
  documents, and a cross-page comparison of every figure that appears on more
  than one surface. Each figure was re-derived by a probe that runs the app's own
  modules (or an independent expression of the same arithmetic) and compared
  with what renders.
- **Documents.** Every recomputation that claims to match "the statement" was
  struck against `public/audit/<docKey>/pages.json` (the statement's own text)
  and `document.json`, never against another screen.

### The nine rules every figure was checked against

1. It traces to a statement. Nothing is invented, defaulted or estimated. A
   missing figure shows a dash with a reason, never ₹0.
2. A total equals the sum of the rows under it, and every split (listed /
   private, category, asset class, basket, entity, sector, account) adds back to
   the whole.
3. The same figure has the same value on every page and export that shows it.
4. A holding reported by two accounts is counted once in consolidated figures
   and once per account in per-account figures.
5. Every return says which return it is. It uses the right cash flows and dates,
   is never annualised over less than a year, and its invested and current value
   cover the same holdings.
6. Every percentage has the right denominator, and its caption says what it is.
7. Units are right: crore vs lakh, per unit vs total, face value vs market
   price, INR as the base.
8. Dates are right, and a figure that blends statement dates says so.
9. Live prices move only market value, day change, unrealised P&L and return.

### Severity

- **A — wrong money figure.** A rupee amount, count, percentage or return that
  is numerically wrong on screen, in a hover or in an export.
- **B — figures that disagree between pages.** One quantity, two values on two
  surfaces, with nothing on screen saying the bases differ.
- **C — wrong label or basis.** A caption, hover, heading or date that describes
  its figure wrongly, or a figure on a basis its label does not state.
- **D — cosmetic.** Wording, rounding, dead code that renders nothing wrong.

## Summary

| Severity | Distinct defects (after merging duplicates across auditors) | Auditor findings merged into them |
| --- | ---: | ---: |
| A — wrong money figure | 17 | 49 |
| B — pages disagree | 15 | 52 |
| C — wrong label or basis | 12 themes, 96 items | 102 |
| D — cosmetic | 1 theme, 58 items | 58 |

**What held up.** The fifteen largest holdings, the Buoyant carried cost, the 3P
redemption, the uncalled capital, the Sanshi total and every private fund's XIRR
tie to their statements to the rupee (see *Hand verification* below). Every
category, basket and asset-class split adds back to the book; every mandate total
ties to its statement; the listed / private / not-placed sides reconstruct the
consolidated NAV exactly.

**What did not.** The defects cluster in six places: returns annualised to the
wrong date; rows that club several statements and then divide a part by a whole;
dated records that never reached the table meant to show them; a handful of
readers that took the wrong line off a statement; counts struck over different
sets on different pages; and captions and dates that describe a figure the page
no longer draws.

## A — wrong money figures

| ID | What is wrong | Where | Shown → should be | Root cause |
| --- | --- | --- | --- | --- |
| **A-01** | **Returns annualised to the book's newest date (29 Aug), not to the date the value was measured.** 29 Aug is the date of two quantity-only trust demats; no valued holding is dated after 13 Aug and the quote feed and fund NAVs have their own dates. | Morning CIO money-weighted tile; Portfolio Monitor CAGR / auto return on every holding; the per-contribution (tranche) breakdown; stock-page returns | Money-weighted **+30.1% (150 days) → +26.5% (134 days)**, the figure `/performance` and Family & Entities already show for the same seven accounts. Crompton CAGR **−19.65% over 543 d → −26.14% over 392 d**. A Buoyant tranche held **364 days** was annualised (+7.33%); it is a holding-period return, **+7.91%**. Sanshi tranches +39.50 / +38.34 / +44.11% → **+45.61 / +45.66 / +51.72%**. On live prices the money-weighted rate dated live values to statement dates (+45.3% vs +37.0%). | Every caller passes `portfolio.asOf` as the window's end (`holdingReturn`, `measuredReturn`, `trancheTable`, `MorningCIO` `asOfDate`). Two tests (`holdingReturn.test`, `accountXirr.test`) build the same wrong window, so they enforced the defect. |
| **A-02** | **A row that clubs several statements divides a part by a whole.** Cost is reported on some statements and not others; the row set the costed cost against every share and every rupee of value. | Monitor (every axis), stock page, Family & Entities popovers | ICICI Bank: avg cost **₹438.34 → ₹1,346.33** (₹94.2 L cost on 7,000 of 21,500 shares); unrealised **+₹2.06 Cr (+218.5%) → +₹5.98 L (+6.35%)**. The security axis' P&L column added to ₹15.92 Cr under a ₹13.92 Cr footer. Family & Entities' popovers printed "(₹349.4 − ₹254.3) ÷ ₹254.3 = +12.34%", arithmetic that gives 37.4%. | The row build and the popovers take cost and quantity/value over different sets; no shared helper strikes "cost, and the units and value it covers" together. |
| **A-03** | **One lot's price printed over every lot's units.** | Monitor row CMP (6 securities); Excel export CMP | DSP Gold ETF: **₹151.1** (Ankita's 2,05,000 units) printed over 14,00,000 units — 14 L × ₹151.1 = ₹21.15 Cr against the row's ₹19.98 Cr. Aarti's 11,95,000 are marked ₹141.24. Same on Gland Pharma, ICICI Bank, SBI, Caplin Point, Sharda Motor, Wockhardt. | `currentPrice: ps[0].currentPrice` (`PortfolioMonitor`, `exportPortfolioExcel`). The stock page already refuses a single mark where the statements disagree (Stage 10bm); the other two surfaces were not moved. |
| **A-04** | **Neo Infra's cost includes ₹14,16,280 of principal the fund has already returned.** | Private Market, Monitor, stock page, Capital invested | Cost **₹5.00 Cr → ₹4.86 Cr**; avg cost **₹102.92 → ₹100.00** (every unit was issued at ₹100); unrealised **+₹54.98 L → +₹69.15 L**; HPR **+11.0% → +14.2%**; private invested ₹8.76 → ₹8.62 Cr; Capital invested ₹470.3 → ₹470.1 Cr. The XIRR (+16.68%) is unaffected. | `altFundStatements.mjs` takes "Gross Capital Contribution" as the cost of the units still held; the statement's own "Capital Redemption −14,162.80 units / −₹14,16,280" never reduces it. |
| **A-05** | **Buoyant's ₹35.01 Cr of subscriptions counted a second time, as the manager's dealing — with the units and the price swapped.** | Transactions, Ledger Insights | Bought **₹70.4 Cr → ₹35.4 Cr**; trades **462 → 460** (buys 284 → 282); a "Not classified" section that should not exist. The tranche read "Buy · 139 @ ₹17,96,901.28" for **17,96,901.615 units @ ₹139.1284**. | A single-scheme fund's own transaction statement records the family's subscriptions; `loadTransactions` read it as trading. The reader shifted a column where the statement's Exchange cell is blank. |
| **A-06** | **₹91.49 Cr of the family's dated capital never reached the Transactions table**, and its "13 of 51 accounts publish a dated capital record" is false. | Transactions (Capital in / out, the account count), Private Market → Transactions | Capital in **₹292.4 Cr → ₹383.8 Cr**: 50 dated capital calls (₹80.25 Cr — India SME ×3, Sky Capital ×4, Neo, Baring, Carnelian Bharat Amritkaal, Delphi, Founders ×2) and V.E.C 128005's ₹11.24 Cr of July deposits. Accounts with a dated record **13 → 27**. | `capitalMovesFrom` (build-book) reads only `cashFlows`; the dated calls (Stage 10ay) and the capital registers' deposits were never merged in. The guard compared the table against the same list, so it could not fail. |
| **A-07** | **A date preset fabricates Gain and HPR.** | Transactions under any FY / quarter / custom range | Sanshi 9069671554, Q2 FY25-26: Gain **+₹19.42 Cr, HPR 194.20%** against the whole record's +₹7.42 Cr, 33.73%. Footer Gain +₹32.9 Cr (Q2) / +₹49.9 Cr (FY). | The window-filtered contributions were handed to the "is this the whole record" test as if they were the whole record. |
| **A-08** | **Realised gains lost or double-counted by the join.** | Transactions footer, Ledger, Monitor (entity filter; security axis) | Transactions realised **+₹1.24 Cr → +₹1.32 Cr** (₹8,65,685.59 of Axis Liquid and DSP lots, each matching a same-account, same-day sale to the paisa, joined to nothing; Green Lantern 510861 −₹17.6 L → −₹11.80 L). Under the entity filter the Monitor counted other members' gains (Ankita **+₹15.63 L → +₹5.25 L**). On the security axis the column added to ₹3.15 Cr under a ₹1.39 Cr footer; on the category axis the visible Realised cells add to ₹6.98 L under a ₹1.39 Cr footer and a ₹1.32 Cr PMS-mandates total, because mandate rows print a dash. | Lots and sales carry different keys ("…Growth" vs "…Growth Option"; a clipped DSP name); the realised map is keyed on the security alone, not the account; the footer sums a different set from the rows. |
| **A-09** | **One company drawn as two or three.** | Monitor security axis, Sector Composition, search | **701 → 695 companies**. SBI ₹4.55 Cr + ₹1.56 Cr (two keys, one NSE symbol); Karur Vysya three rows; Crompton two; City Union / Indian Bank / Karur Vysya certificates of deposit (₹52 L) under Unclassified while the same bank's shares are Financials (Financials ₹63.46 → ₹63.98 Cr). The expanded row paired the measured ₹3 Cr with the 0.81% weight of total exposure. | The PMS statements print no ISIN, the depository prints a clipped name, and nothing joined the two on the NSE symbol both resolve to. The issuer join ignored the ISINs the book already carries. |
| **A-10** | **"₹28.3 Cr not proven" on the NAV chart is ten times the move it qualifies, and false.** | Morning CIO → NAV vs Nifty 500; `/performance` | The pill is the **market value** of four accounts, not their movement (₹2.78 Cr), and all four have a measured capital record (SVAN's investor reports: ₹0 in, ₹23,931 out; Molecule's contributions unchanged; HDFC MF nil at both ends). Should be **no pill**. | `navHistoryFrom` read only `BOOK_ACCOUNT_CASH_FLOWS` (8 accounts) for proof; a page check required the false wording. |
| **A-11** | **Snapshot History's "Change" is accounts joining, reported as a change in value.** | `/history` | **+68.18% (25 Jun), +33.92% (6 Jul), +105.63% (10 Jul) → 0.00%** like-for-like; +7.12% → +4.53% (30 Jun). The series' true change over its span is +5.09%, where the raw levels read +442%. | Raw levels divided across a growing panel; the chained link return the chart uses was never read. |
| **A-12** | **NAV & Performance's value bridge does not add up.** | `/performance` value bridge | Nine since-inception columns print **Opening = Closing** (₹188 Cr) where the statements print no opening and their parts tie from ₹0. The five Sanshi columns close at **₹157.49 Cr (the contributions) → ₹204.48 Cr** (the valuation). "Fees & expenses" drops the expenses (Carnelian FYTD **₹10.9 L → ₹13.57 L**; SVAN **₹0 → ₹2,227 / ₹1,431**) and accrued income is missing, so no FY column adds up. | `pmsStatements.mjs` `readFlows` takes the single "Portfolio Value On" line as both ends; `sanshiFund.mjs` fills the corpus with the contribution; the page's row list omits two of the statement's lines. |
| **A-13** | **The capital-gains tax estimate nets one member's losses against another's gains.** | `/capital-gains` "Est. tax on realised" | **₹18.2 L → ≈ ₹24 L** once each member is taxed on their own gains with the statutory set-off (Ajay's short-term loss cannot absorb Ankita's and Bharat's gains); the exact figure is recomputed in the fix. ₹8.66 L of liquid-fund gains (specified mutual funds, taxed at slab rate) were taxed at the 20% equity rate. | The estimate sums every account across three taxpayers before applying rates. |
| **A-14** | **₹0 where nothing was reported.** | Morning CIO Cash row; Cash drill-down; Monitor Cash totals; the Muns chat context | Cash: Invested **₹0** and P&L **₹0** beside ₹14.2 Cr whose cost no statement reports → a dash with the reason. The chat was handed `valueCr: 0` for twelve accounts no statement values → absent, with the reason. | A sum over the rows that report a cost was printed although the only such rows are the ₹0 cash sleeves; `chatContext` summed an empty list to 0. |
| **A-15** | **Counts struck over the wrong set.** | Stock page, AIF drill-down, Family & Entities, movers footer, Morning CIO allocation pill | "Held in N entities" counted **accounts** (Cash: 12 → 3 members). "10 AIF folios valued by no statement" → **7** (two are income-only views of a valued holding, one is redeemed). Family weights divided by **₹716.46 Cr** while the popover named ₹713.29 Cr, and printed "this does not reproduce" on three rows. "131 PMS mandates" → **131 holdings in 10 mandates**. "5 baskets held" counted the not-classified section. | Each count re-derived its own set instead of reading the one the page draws. |
| **A-16** | **DSP Gold and Silver ETF "scheme returns" are a unit split, not a loss.** | Stock page → fund look-through | 1M / 3M / 6M **−89% / −90% / −86% → refused** (the NAV series crosses a 1:10 split). The card called the returns complete. | The look-through store's returns are passed through with no check for a share-count break in the NAV series they are struck on. |
| **A-17** | **Holdings the statements report, missing from every screen.** | Book totals, Family & Entities, Portfolio Monitor | ABSL Balanced Advantage: Aarti's **2,42,412** and Ankita's **3,93,096** units sit in FREE balance on their 31 Jul depository statements, which print no rate; the same scheme's published NAV already values Bharat's units — **₹7.15 Cr** at that NAV. Eighteen more unvalued rows inside partly-valued accounts were named nowhere. | The book drops a row with no rate; `unvaluedHoldingsOf` named only accounts with NO valued row. Ankita's 94,967 Clean Max shares are the same shape and are a family question (FQ-3). |

## B — figures that disagree between pages

| ID | What disagrees | Surfaces and values | Root cause |
| --- | --- | --- | --- |
| **B-01** | **"The book" is three different totals.** | Top bar ₹713.3 Cr; Private Market "of the ₹710.4 Cr book" (statement marks) on the same screen; the money-weighted drill-down "of the ₹716.5 Cr book" (every statement, the double count included); Family's entity NAVs add to ₹716.46 Cr with the ₹3.17 Cr overlap stated nowhere; the NAV card's footer names the double count as the whole gap between ₹713.6 and ₹713.3 Cr. | No single helper for the consolidated book and the per-statement sum, and the overlap disclosed on some pages only. |
| **B-02** | **Fund NAVs from two different days.** | The ETFs & mutual funds movers card prices on the look-through store's 9 Sep NAVs (−₹15.4 L); the Monitor, stock page and top bar on AMFI's 22 Sep (+₹10.3 L on the latest day). Helios ₹16.22 vs ₹16.15. DSP Gold's NAV (₹14.76) sits ten times below its statement mark (₹151.10) with nothing saying the unit bases differ. | The movers card and the look-through card read the look-through store; everything else reads `fundNavs.ts`. |
| **B-03** | **"What the family holds" is counted four ways.** | Data Refresh 371 positions / 213 names; Morning CIO 358 / 202; NAV & Performance "369 of 371"; Family & Entities 177 / 112 / 73 per member (current: 174 / 110 / 67, and "17 custodians" including 3P at ₹0); the Direct Equity movers card 37 names, its drill-down 35; the chat 371 / 213; the Excel export includes 5 closed and 6 sub-₹1,000 rows (footer ₹840.99 higher). | `currentHoldings` is the one definition of what is held; five surfaces never called it. |
| **B-04** | **Two sector answers for one company.** | Monitor Sector column and `?sector=` filter: 79 companies (₹110.3 Cr) "Unclassified" that Sector Composition and Family place; SBI and State Bank of India in two sectors on one page. Data Refresh "Sector coverage 41.6%" against ~93% placed; NAV & Performance's attribution has an "Unclassified +₹2.76 Cr" row; the drill-down's sector chips. | These read `Position.sector` (the statement tier) where the other pages read the three-tier `companySectorIndex`. |
| **B-05** | **Realised P&L has three values.** | +₹1.32 Cr (Capital Gains, Ledger — the canonical figure); +₹1.39 Cr (Monitor holdings footer — names still held only); +₹1.24 Cr (Transactions footer — A-08's join). | A-08, plus a footer whose set is not stated. |
| **B-06** | **A tile and the page it opens show different figures.** | Capital invested ₹470.3 Cr opens a page headed ₹545.3 Cr (the value of those holdings); Money-weighted +30.1% opens a page whose only return is +12.7% (return on cost). | The drill-down headline always prints the set's market value, whatever figure the tile was. |
| **B-07** | **The whole-book return on cost.** | Consolidated return tile +15.9%; allocation Total "—" (no reason); Monitor footer +15.94% beside ₹470.3 Cr invested and ₹713.3 Cr value (a reader dividing gets +51.7%). | Three surfaces apply three different rules to one figure. |
| **B-08** | **The Excel export differs from the screen it exports.** | "Return" is always cumulative and unlabelled (Crompton −27.78% where the screen shows a CAGR); CMP (A-03); rows (B-03); no as-of date or basis. | The export kept its own row build. |
| **B-09** | **Cash ₹11.6 Cr vs ₹14.2 Cr on one table.** | Monitor security axis "the book's own cash ₹11.6 Cr"; category axis Cash ₹14.2 Cr. | The security axis counts `assetClass` Cash; the category axis files liquid funds as cash too (Stage 10av). |
| **B-10** | **Cash paid back: ₹49.9 L vs ₹58.7 L.** | Distributions tile "Cash paid back so far" ₹49.9 L; the page's own XIRR hovers ₹58.7 L (equalisation ₹8.9 L, a payout after the valuation date). 360 ONE's two ₹7,15,619 distributions (18 May) are in neither, and the same fund is drawn both as valued and under "Not valued". | "Distributions" is the statements' distribution line; the label claims all cash paid back. The income-only folios form their own fund group. |
| **B-11** | **"HPR" is two different returns on the Monitor's two tabs.** | SVAN 8710067: Holdings HPR 6.84% (value on current cost); Transactions HPR 13.57% (value on net capital paid in). | Same label for return on cost and return on capital. |
| **B-12** | **Search says "no statement reports it" about funds the book holds.** | WhiteOak Multi Asset, ABSL Liquid, Bandhan Large & Mid Cap, ABSL Balanced Advantage, Kotak Multicap, Liquid BeES, ICICI Liquid. | The review-gap suppression compares the review's names with the book's raw clipped names, not the scheme names the screen shows. |
| **B-13** | **The same class words, two sets.** | Sector Composition (Direct Equity) and Family's in-house hover: Mutual Fund ₹102.8 Cr, ETF ₹24.6 Cr, Cash ₹11.6 Cr; Monitor and Morning CIO: ₹89.7 / ₹23.4 / ₹14.2 Cr. Each entity page's "excluded" caption (asset class) disagrees with the holdings sections below it (category). | Asset class vs category (Stage 10av decision) with the basis named on one surface only. |
| **B-14** | **One scheme under two identical-looking names.** | Helios Flexi Cap Fund · Direct: two Monitor rows and two stock pages (₹30.9 Cr and ₹12.1 Cr), one ISIN (INF0R8701046). | Recorded in `docs/BOOK-REPORT.md` as one of eight ISINs carried under two keys; nothing joins them. |
| **B-15** | **The Muns assistant answers from a different book.** | The chat context is on statement marks (₹710.39 Cr vs ₹713.3 Cr on screen), counts closed and sub-₹1,000 rows, carries all 15 capital accounts (₹97.73 Cr committed vs ₹42.7 Cr on Private Market), ranks "top holdings" by statement row (₹97.68 Cr vs ₹175.1 Cr), and omits Baring's distribution. | `chatContext` builds its own figures from the raw book instead of the screen's helpers. |

## C — wrong label or basis

Grouped by theme; each item lists the auditor findings it merges.

- **C-01 · Dates.** "Marks as of 2026-08-29" in the top bar (a date on which nothing is valued; marks run 31 Mar → 13 Aug plus AMFI's 22 Sep) [T-1, MNT-7, CK-C1]; every "no live price" hover dates a statement mark to 29 Aug [MH-08, MSX-13, VD-13]; mandate pages dated 29 Aug [DSM-C2]; Snapshot History's total "as of 29 Aug" on NAV-overlaid values [HIST]; the STATEMENT pill "every figure is on its statement mark" over AMFI NAVs, and three captions saying so [FS-10, MNT-8, DSM-C1]; the NAV movers "Held" hover and "What moved today" over a 14-day-old NAV [MNT-10, MNT-11]; the dashed raw-NAV line is rebased on 10 Jul while the subtitle names 31 May [MNT-12]; the 1Y range hover [MNT-13]; ICICI NSDL values are 30 Mar prices shown undated [VD-17]; the look-through "holding" date is not the NAV date [DSM-C4]; the 360 ONE fund row dated both 30 Jun and 31 Jul [PM-C7]; Transactions' Value today undated [MT-9]; Direct Equity's day move on quantities up to 176 days old [MNT-16]; Polycab's CMP / Day undated and "live" outside a session [PC-02, PC-03, PC-12]; the Excel has no as-of [MSX-17]; the chat's figures carry no date [SC-C10].
- **C-02 · Which return.** HPR hovers say "against the capital paid in" over value-on-cost [PM-C1]; "Return (total)" is unrealised only [CK-C7]; Family's Return (to date) prints an annualised +87.30% p.a. over 134 days with no window [FS-11]; scheme-return CAGRs labelled "Simple" [VD-15]; "No purchase date on file" beside cells showing purchase dates [MH-09]; member rows' return reasons [PM-C10]; the mandate return note [MH-18].
- **C-03 · Coverage and denominators unstated.** Footer Invested / P&L cover part of the book and do not say so [MH-11, CK-C3]; "Invested covers …" hover [CK-C10]; Private Market tile captions describe other sets [PM-C5]; capital columns beside a wider set of holdings [PM-C6]; the Concentration card's percentages [CK-C12]; tile basis and coverage [CK-C6]; Distributions and uncalled coverage [CK-C9]; "11 of 11 capital accounts print a called line" (1 does) [PM-C4]; the Positions / Names hovers [CK-C8]; coverage over the wrong denominator on the security axis [MSX-15]; the Live pill never mentions the 49 securities no feed prices [MNT-9, FS-18]; every `/holdings` footer hover states the whole book's exclusions rather than the set's own [XP-13].
- **C-04 · A dash with the wrong reason, or none.** The Cash section's refused return [MH-14]; the Buoyant cash sleeve [MH-15]; bare dashes on the Monitor and stock tables [MH-10, DSM-D4]; "Invested on —" [VD-14]; Neo's CMP [VD-20]; the Transactions realised reasons [MT-12]; the manager-trades realised reason on 70 rows [DSM-C10]; 3P's withheld gain [MT-17]; derived-only rows on the security axis [MSX-12]; two measured nil balances called absent [MNT-14]; two reasons on Family [FS-12]; Polycab's Paid and pledge reasons [PC-08, PC-09]; the Excel P&L note on redeemed rows [MSX-18].
- **C-05 · Category and classification words.** Neo Infra "Category not stated" (its statement prints Category II) [PM-C2]; Transition Venture's category hover quotes words its statement does not print [PM-C3]; the asset-class axis "nothing is inferred" [CK-C2]; the Listed / Private hovers and the chat describe the pre-10bw placing rule [CK-C5, SC-C8]; Buoyant Class A1 under "Not classified" [MT-11]; the same liquid ETF is Cash on one tab and Direct Equity on the other [MT-10]; bonds, CDs and T-bills counted as "companies" [FS-13]; "Top holding" names companies the family holds no position in [FS-14]; the "held, and not valued here" subtitle [FS-16]; Sanshi and Carnelian Amritkaal at pre-tax NAV, unstated [VD-16]; ABSL Liquid fully pledged and filed as Cash, unstated [VD-18]; Active Momentum "no ISIN reported" / "matched on ISIN" [VD-19, DSM-C5]; Polycab's "two independent sources" and promoter-percentage base [PC-06, PC-07].
- **C-06 · Search and chat wording.** Member rows "as their own statements print it" over NAV-overlaid values [SC-C2]; account rows dated to the statement [SC-C3]; a holding's category word from whichever row sorts first [SC-C4]; "the redemption is on Transactions" for the HDFC folio [SC-C5]; two figure results open a page without the figure [SC-C6]; two keywords claim what the book does not hold [SC-C7]; per-fund XIRR said not to exist [SC-C9]; the chat panel's description of its snapshot [SC-C1]; Polycab missing from search by full name and ISIN [PC-05]; the chat carries Polycab without date or scope [PC-04].
- **C-07 · Transactions framing.** "Invested on" spans withdrawal dates [MT-8]; the capital / trades framing on own-account rows [MT-15]; the date window's labels and an unmeasured zero [MT-16]; a staggered sell-down labelled "Built up" [MT-14]; two same-named lines denying each other [MT-13]; the Transactions tab "what can still be called" [PM-C9]; mandate Invested vs Net invested unreconciled [DSM-C6].
- **C-08 · Holdings table structure.** Quantity printed under the Weight heading in expanded lines [DSM-C3]; the entity view's totals do not add and its Weight hover claims 100% [MH-12]; "₹0 reported twice, counted once" on sections with no duplicate [MH-13, VD-23]; avg cost meaning changes between views [MH-16]; Capital Gains prints "7 of 51 accounts" in the LOTS column [XP-16].
- **C-09 · Sector and look-through wording.** The derived half blends two dates [FS-15]; the Consolidated pill names two tiers of three [FS-19]; look-through coverage wording [MSX-14]; footer popovers describe another set on the security axis [MSX-16].
- **C-10 · Private Market structure.** "Not valued · 3 funds" counts a fund valued above it [PM-C8]; a call typed on one 360 ONE row not shown on the other [PM-D7].
- **C-11 · Polycab.** The entitlement's `*` marks only post-statement ex-dates [PC-01]; the Bharat HDFC scan unmentioned (family question FQ-6) [PC-10].
- **C-12 · Suspected, live-basis only.** A failed fetch after a cached snapshot reads "nothing substituted" over applied cached prices [MNT-18]; "today" and "live" outside a session [MNT-19]; Family's live return dating [FS-17]; the Transactions sheet can export empty [MSX-19].

## D — cosmetic

Rounding that misprints a figure (₹1.4 L for ₹1,35,000; ₹100 L for ₹99,99,500;
203 units for 202.500; "0.00% of the book" for non-zero holdings; Private at "1"%
on one page and 1.5% on another); a gap printed in "%" that is percentage points;
the FX label when the fallback answers; wording that points at removed controls
and stale code comments; bare latent `?? 0` defaults that render nothing today;
`docs/POLYCAB-LIVE.md`'s record column; small reconciliation residuals that are
real but under the display precision (₹30,690 of Carnelian capital out after 10
Jul missing from its flows; SVAN's ₹23,931 of withdrawals not netted in the NAV
chain; stamp duty treated two ways in cost; ₹848.24 between two ₹710.4 Cr
figures; one Sanshi folio's return printed 30.24% on one page and 30.3% on another [XP-17]). Each is listed with its auditor ID in the appendix and fixed or
explained in the D PR.

## Family-judgement questions

These are the only points the documents cannot settle. Nothing about them is
changed until the family answers; each is disclosed on screen meanwhile.

| # | Question | What it moves |
| --- | --- | --- |
| **FQ-1** | **Are these one investment reported twice, or two investments each?** 360 ONE Special Opportunities Series 8 Class A3 (Ajay, CRN37702 / folio 1000632; Bharat, CRN60117 / folio 1000633) and Transition Venture Capital Fund I Class A1 (Trust 2 / Trust 3). The funds' own registers show separate folios, PANs, bank accounts, commitments and payments for each. | If two each: current value +₹3.17 Cr, cost +₹1.74 Cr, private value ₹10.6 → ₹13.8 Cr, the pooled private XIRR 21.1% → 30.1%. |
| **FQ-2** | **Sanshi and Carnelian Bharat Amritkaal: pre-tax or post-tax NAV?** The statements print both; the book uses pre-tax (as the family's review does), Founders and Delphi are shown post-tax. | Sanshi ₹204.48 → ₹193.44 Cr. |
| **FQ-3** | **Ankita's 94,967 Clean Max shares** print with no rate on her 31 Jul demat statement (lock-in). Value them at the ₹1,336.50 mark on Ajay's 30 Mar ICICI statement, or keep them named and unvalued? | +₹12.69 Cr if valued. |
| **FQ-4** | **DSP Gold ETF**: Aarti's statement marks it ₹141.24 and Ankita's ₹151.10 on the same 31 Jul. Which is right? | ₹1.18 Cr on Aarti's lot. |
| **FQ-5** | **Polycab**: should the page name Bharat's HDFC holding (51,08,911 shares on a scanned statement nothing can read), and should the Muns assistant be told about the ring-fenced holding at all? | Disclosure only. |

## What cannot be calculated from the documents we have

| Figure | Why not | The document that would fix it |
| --- | --- | --- |
| YTD and calendar-year returns per holding | No valuation is dated on or before 1 Jan in any account | A holdings statement per account dated on or before 1 January |
| Per-holding XIRR | The statements cover the current period only | A lot register from first purchase (the PMS reporting system's capital-gains lot file) |
| The portfolio's value in August 2025, and any year-on-year change | The earliest dated valuation is 31 Mar 2026 | Holdings statements dated August 2025 |
| Cost of the 49 depository holdings (₹164 Cr of value) | A depository records units, never what was paid | Contract notes, or the broker's transaction statement, for the Motilal Oswal and ICICI demats |
| Short- / long-term split on 301 positions | Needs acquisition dates | Lot-level holding statements |
| Values of India SME Fund II and Sky Capital's angel folios | The funds publish no NAV | The funds' NAV statements |
| Bharat's second Polycab demat | The HDFC NSDL statement is a scan with no value column | A text PDF from HDFC Bank |
| Ankita's 3P redemption (the ₹21.43 Cr advice matches her units × the redemption NAV to the paisa) | No 3P statement for folio 3000049 in the drop | 3P's statement for folio 3000049 |
| Baring's units after 29 Apr (her demat shows 252.5 against the fund's 202.5 at 31 Mar) | The latest Baring statement is 31 Mar | Baring's 30 Jun statement |
| Ajay's main Motilal demat holdings (1201090012539150) | Only its transaction tape is in the drop | Its holding statement |
| DSP Gold / Silver ETF on a published NAV | NSE moved both to new ISINs; the statements carry the old ones | A current depository statement |

## Hand verification against the documents

Every figure below was recomputed by hand from the statement's own text (`public/audit/<docKey>/pages.json`, page and line cited) and set beside what the dashboard shows. ✓ means the two agree to the rupee (or within the statement's printing precision); ✗ names the finding that explains the gap.

Doc aliases used below:

| Alias | docKey |
|---|---|
| SAN-821 | `sanshi-fund-9039671821-2026-06-30-unknown` |
| SAN-854 | `sanshi-fund-9039671854-2026-06-30-unknown` |
| SAN-912 | `sanshi-fund-9039671912-2026-06-30-unknown` |
| SAN-554 | `sanshi-fund-9069671554-2026-06-30-unknown` |
| SAN-634 | `sanshi-fund-9069671634-2026-06-30-unknown` |
| BUO-73 | `buoyant-capital-103473-2026-07-31-holdings` |
| BUO-72 | `buoyant-capital-103472-2026-07-31-holdings` |
| FF-104 | `motilal-oswal-founders-fund-90410016104-2026-07-31-holdings` |
| FF-093 | `motilal-oswal-founders-fund-90410016093-2026-07-31-holdings` |
| DEL | `motilal-oswal-delphi-equity-fund-9049241536-2026-06-30-holdings` |
| CBAF | `carnelian-bharat-amritkaal-fund-4551-2026-07-31-holdings` |
| HEL | `helios-mutual-fund-10355977-2026-08-07-holdings` |
| MOM | `motilal-oswal-active-momentum-fund-904168868444-2026-08-06-holdings` |
| ICICI | `icici-bank-nsdl-demat-49794950-2026-03-31-holdings` |
| MO-316 | `motilal-oswal-financial-services-demat-1201090012838316-2026-07-31-holdings` (Ankita) |
| MO-316T | the same account's `…-demat-transactions` |
| MO-320 | `…-1201090012838320-2026-07-31-holdings` (Bharat) |
| MO-335 | `…-1201090012838335-2026-07-31-holdings` (Aarti) |
| NEO | `neo-infra-income-opportunities-fund-9039920536-2026-06-30-holdings` |
| BAR | `baring-private-equity-india-fund-aifm-bpepf6-0584-2026-03-31-holdings` |
| TVC262 / TVC263 | `transition-venture-capital-tvc26x-2026-03-31-unknown` |
| 3P | `3p-investment-managers-3000048-2026-07-31-holdings` |
| SME62 | `india-sme-investments-175962-2026-06-30-holdings` |
| CAR-PS | `carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-04-01-performance-summary` |
| CAR-APP | `…-3517383-2026-08-10-appraisal` |
| 360A-632 / 360A-633 | `360-one-alternates-asset-management-100063x-2026-05-18-distribution-notice` |
| 360W-702 | `360-one-private-wealth-37702-2026-07-31-holdings` |
| 360W-117 | `360-one-private-wealth-60117-2026-06-30-holdings` |
| ADV2 | `icici-bank-payment-advice-unknown-2026-08-04-payment-advice-2` |

#### (a) The 15 largest current holdings

Ranked by consolidated value on the live/AMFI basis.

| Figure | Dashboard shows (where) | Recomputed from statement (doc · page · line) | Delta | Verdict |
|---|---|---|---|---|
| 1. Sanshi Fund-I Class E, 4 folios (Aarti, Bharat, Ankita, Ajay), as of 30-Jun-2026 | Monitor row clubs E and A2: Invested ₹157.5 Cr, MV ₹204.5 Cr, +₹47 Cr, HPR +29.84%, "21 Mar 2025+9", 4 entities | SAN-821 p1 "Class E 30-06-2026 161.5675 - 60,45,934.485 74,99,62,501.87 97,68,26,519.91"; likewise SAN-854 12,11,186.597 / 19,56,88,390.51, SAN-554 18,20,926.864 / 29,42,02,601.10, SAN-634 17,61,264.629 / 28,45,63,122.95. Class E: 1,08,39,312.575 u × 161.5675 = ₹175.1281 Cr; contributions ₹132.4934 Cr; +₹42.6347 Cr | 0 | ✓ figures. Basis is the **pre-tax** NAV, not stated on screen (VD-16) |
| 2. Buoyant Opportunities A4, 2 folios, 31-Jul-2026 | Monitor: Qty 53,35,611 · Avg ₹132.8 · Invested ₹70.9 Cr · CMP ₹144.29 · MV ₹77 Cr · +₹6.13 Cr · HPR +8.65%; hover names the printed ₹72.5 Cr | BUO-73 p1 "31/07/2026 34,16,657.4167 47,53,53,990.90 144.2878 49,29,81,982.01"; BUO-72 p1 "19,18,953.2003 24,94,10,446.32 144.2878 27,68,81,535.58". MV ₹76.9864 Cr; carried cost ₹70.8559 Cr (see (b)) | MV −5 paise (unit rounding) | ✓ |
| 3. Motilal Oswal Founders Fund II G1, 2 folios, 31-Jul | Monitor: 2,84,10,850 u · ₹32.8 Cr · Invested ₹30 Cr · +₹2.82 Cr · HPR +9.38% | FF-104 p1 "CLASS G1 31-07-2026 11.5502 1,88,95,852.360 20,00,00,000.00 20,00,00,000.00 21,82,50,873.93 … 4.74" (post-tax NAV); FF-093 p1 "95,14,997.798 10,00,00,000.00 … 10,99,00,127.57 … 5.11". Σ ₹32.8151 Cr; cost ₹30 Cr | 0 | ✓ |
| 4. Helios Flexi Cap Direct (AMC folio, Ajay), statement 07-Aug | Monitor/stock: 1,91,23,041 u · CMP ₹16.15 "AMFI … 2026-09-22" · ₹30.9 Cr · Invested ₹31 Cr · −₹11.6 L · HPR −0.38% | HEL p1 "Lump sum 06-Aug-2026 16.21 19,123,041.380 310,000,000.00 309,984,500.77". Statement basis: × 16.21 = ₹30.9985 Cr. AMFI basis: × 16.15 = ₹30.8837 Cr; P&L −₹11,62,882 | 0 on AMFI basis | ✓ AMFI shown and labelled |
| 5. Sanshi Class A2 (Ajay 912), 30-Jun | clubbed into row 1 | SAN-912 p1 "Class A2 30-06-2026 125.3582 - 23,41,480.851 24,99,87,500.62 29,35,23,824.82" | 0 | ✓ (pre-tax, VD-16) |
| 6. Motilal Oswal Active Momentum Direct (Ankita), statement 06-Aug | Monitor: 1,52,45,766 u · Avg ₹14.05 · Invested ₹21.4 Cr · CMP ₹14.65 AMFI · ₹22.3 Cr · +₹92.1 L · HPR +4.30% | MOM p1 "1,52,45,765.959 21,42,00,000.00 14.0491 21,41,89,290.53". Statement basis ₹21.4189 Cr. AMFI 14.6536 → ₹22.3405 Cr, +₹92.05 L, +4.30% | 0 on AMFI basis | ✓ labelled. Stock page says "no ISIN reported" but the statement prints INF247L01EP5 (VD-19) |
| 7. DSP Gold ETF (Aarti 11,95,000; Ankita 2,05,000), 31-Jul | Monitor: Qty 14,00,000 · **CMP ₹151.1** · MV ₹20 Cr. Stock page refuses one mark: "₹151.1 and ₹141.24" | MO-335 p1 "DSP GOLD ETF 1195000.000 … 141.240"; MO-316 p1 "DSP GOLD ETF 205000.000 … 151.100". Σ = ₹16.8782 + ₹3.0976 = ₹19.9757 Cr. AMFI NAV refused (1:10 split) | MV 0. CMP × Qty = ₹21.15 Cr ≠ ₹20 Cr | MV ✓, CMP ✗ (VD-9). Marks may be stale (VD-21) |
| 8. Carnelian Bharat Amritkaal A2 (Ankita), 31-Jul | Monitor: 1,29,93,095 u · CMP ₹12.55 · ₹16.3 Cr · Invested ₹15 Cr · +₹1.31 Cr · +8.74% | CBAF p1 "Pre tax NAV : 12.5540 Closing Value : 16,31,15,312.43 … 1,29,93,094.825"; contributions ₹15,00,02,925.10 | 0 | ✓ (pre-tax, VD-16) |
| 9. Fractal Analytics (Ajay, ICICI NSDL), 31-Mar | Monitor/stock: 1,80,185 sh · ₹15.2 Cr · cost "—" "no cost on the ICICI Bank (NSDL demat) statement" | ICICI p1 "INE212S01015 FRACTAL ANALYTICS LIMITED - EQ Beneficiary - Pre IPO Shares/14-AUG-26 180185.000 151,724,779.25"; p2 "Prices as on 30-Mar-2026". No cost column on the statement | 0 | ✓ figure and reason. No date on screen (VD-17) |
| 10. Clean Max Enviro (Ajay, ICICI NSDL), 31-Mar | Monitor/stock: 94,967 sh · ₹12.7 Cr · "Held in 1 entity" | ICICI p1: 94,967 sh, 126,923,395.50 (implied ₹1,336.50). **Ankita holds another 94,967** (MO-316 p1 "CLEAN MAX ENV-EQ 1/- 0.000 … 94967.000 0.000 0.00 … 94967.000", in lock-in, rate 0) | family holds 1,89,934, book 94,967 | ✗ (VD-2) |
| 11. YASH Highvoltage (Ajay, ICICI NSDL) | ₹12.5 Cr, 1,38,462 sh | ICICI p2 "138462.000 125,446,572.00" | 0 | ✓ |
| 12. ABSL Liquid Fund Direct (Bharat), 31-Jul | Monitor/stock: 2,64,721 u · CMP ₹459.91 AMFI 22-Sep · ₹12.2 Cr · filed under Cash | MO-320 p1 "ABSL LIQF D-GROWTH 0.000 264720.521 … 454.566". Statement basis ₹12.0333 Cr; AMFI basis 459.9142 → ₹12.1749 Cr. Free balance 0.000: the whole holding is pledged | 0 on AMFI basis | ✓ value. Pledge not disclosed (VD-18) |
| 13. Helios FCF D-GROW (depository: Ankita 51,00,984.835 u; Bharat 24,07,981.455 u) | Monitor: 75,08,966 u · CMP ₹16.15 AMFI · ₹12.1 Cr | MO-316 p1 "HELIOS FCF D-GROW 5100984.835 … 14.180"; MO-320 rate 15.74. Statement basis ₹11.0234 Cr; AMFI basis ₹12.1270 Cr | 0 on AMFI basis | ✓ |
| 14. Motilal Oswal Delphi A4 (Ajay), 30-Jun | Monitor: 99,995 u · CMP ₹1,112.93 · ₹11.1 Cr · Invested ₹10 Cr · +₹1.13 Cr · HPR +11.29% | DEL p1 "CLASS A4 30-06-2026 1,112.9310 99,995.000 10,00,00,000.00 10,00,00,000.00 11,12,87,535.35 … 6.98" (post-tax) | 0 | ✓ |
| 15. Cash sleeves (12, mostly inside PMS mandates) | inside mandate rows | e.g. V.E.C 128005 cash ₹5,00,33,275.75; Σ ₹9.5056 Cr (probe `rank.ts`) | 0 | ✓ |

Next in rank, all ✓ where checked:
- Smartworks ₹9.1269 Cr (ICICI 1,87,778 sh → 91,269,496.90).
- PG Electroplast ₹9.0396 Cr.
- WOC MAAF ₹8.83 Cr.
- Onesource ₹8.6057 Cr.
- Aditya Birla Capital ₹6.509 Cr.
- Jaro (ICICI 1,16,979 sh → 57,758,381.25).
- JKB ₹4.3872 Cr (below).

#### (b) Figures the client has questioned

| Figure | Dashboard shows (where) | Recomputed from statement (doc · page · line) | Delta | Verdict |
|---|---|---|---|---|
| Buoyant invested ₹70.86 Cr vs printed ₹72.48 Cr | Monitor Invested ₹70.9 Cr; hover "its statements print the cost as ₹72.5 Cr … ₹1.62 Cr … the growth the fund booked at the switch". `data-cost-carried` 708558861.66, `data-cost-printed` 724764437.22 | BUO-73 p1 Cash Deposits 3,50,00,000 + 2,50,00,000 + 5,00,00,000 + 10,00,00,000 + 25,00,00,000 = ₹46 Cr; p2 "Gain Distr. 1.0000 58,861.6600" → ₹46,00,58,861.66. BUO-72 p1 deposits 2 + 10 + 2.5 + 5 + 5.35 = ₹24.85 Cr. Σ ₹70.8559 Cr; printed 47,53,53,990.90 + 24,94,10,446.32 = ₹72.4764 Cr | 0 | ✓ |
| 3P redemption, 31-Jul-2026 | Transactions: 3P 3000048 "staggered · 6 payments · Capital in ₹28.5 Cr · out ₹31.1 Cr · net −₹2.56 Cr · Value today ₹0" | 3P p2 "31-07-2026 Full Units Redemption (31,05,82,835.17) 151.2372 (20,53,614.026) 0.000". 20,53,614.026 × 151.2372 = ₹31,05,82,835.17; reclassifications net ₹0 | 0 | ✓ Ajay's folio. **Ankita's folio absent** (VD-7) |
| Uncalled capital ₹15.97 Cr | CIO KPI ₹16 Cr; PM tile ₹16 Cr "Across 11 capital accounts of private-market funds"; PM total ₹16 Cr | SME62 p1 "Commitment Amount (a) : INR 150,000,000 Cumulative Contribution (b) : INR 81,000,000 … Undrawn … INR 69,000,000"; SME 175964 and 177302 each 5 / 2.7 / 2.3 Cr; BAR p1 "Undrawn Capital G = A - B + E 2,97,50,000"; TVC262/263 "Undrawn Capital Commitment 7,500,000.00" each. 6.9 + 2.3 + 2.3 + 2.975 + 0.75 + 0.75 = **₹15.975 Cr** | 0 against these statements | ✓ arithmetic. Baring is contradicted by a newer statement (VD-6) |
| Capital account 1 — India SME 175962 | PM folio: committed ₹15 Cr · called ₹8.1 Cr · paid ₹8.1 Cr · still to call ₹6.9 Cr · 8 calls | SME62 p1, as above | 0 | ✓ |
| Capital account 2 — Baring 0584, 31-Mar | PM: ₹5 Cr / ₹2.03 Cr / ₹2.03 Cr / ₹2.98 Cr · units 202.500 · value ₹1.88 Cr · XIRR −6.4% | BAR p1 "Capital Commitment A 5,00,00,000 · Capital Call B 2,02,50,000 · Capital Contribution C 2,02,50,000 · Undrawn Capital G … 2,97,50,000 · Units I = H / Face Value 202.50 · NAV per unit 93,047.9444"; p2 "Less: Distribution (E) 37,252 … Total NAV 1,88,42,209". 4 calls 65 + 50 + 25 + 62.5 L = ₹2.025 Cr ✓. XIRR recomputed −6.42% | 0 against the 31-Mar statement | ✓ against itself, ✗ against MO-316T (VD-6) |
| Capital account 3 — Neo Infra 9039920536, 30-Jun | PM: ₹5 Cr / ₹5 Cr / ₹5 Cr / ₹0 · units 4,85,837 · cost ₹5 Cr · value ₹5.55 Cr · XIRR +16.7%; hover "₹51 L paid back (income ₹28.2 L, principal ₹14.2 L, equalisation ₹8.7 L) … ₹7.1 L paid after the valuation" | NEO p1 "Capital Commitment ₹5,00,00,000 · Principal Payout ₹14,16,280 · NAV (Net) ₹114.24 · Income Payout (Gross) ₹35,31,941 · Valuation (Net) ₹5,54,98,303.25 · Total Payout ₹49,48,221 · Units 4,85,837 · Net Equalisation ₹8,69,355 · Face Value ₹100". Drawdowns p2–p3: 25,000 + 75,000 + 1,00,000 + 75,000 + 75,000 + 1,50,000 units at ₹100 = ₹5 Cr. p3 "05-Jan-26 Capital Redemption -14,162.80 -14,16,280". XIRR recomputed **16.680%** | XIRR 0; **cost ₹14.16 L too high** | XIRR ✓, cost ✗ (VD-3) |
| Capital account 4 — Transition TVC262 (Trust 2), 31-Mar | PM folio line: ₹1.5 Cr / ₹75 L / ₹75 L / ₹75 L; fund row counts both trusts' capital (₹3 Cr / ₹1.5 Cr / ₹1.5 Cr / ₹1.5 Cr) but units 7,500 and cost ₹75 L once | TVC262 p1 "Total Capital Commitment 15,000,000.00 … Capital Contributed … 7,500,000.00 … Current Nav / Unit 2,286.1283 · No. of Outstanding Unit 7,500.000 · Undrawn Capital Commitment 7,500,000.00 · 17-Oct-2025 Purchase 7,500,000.00 1,000.0000 7,500.000 · Closing Value(INR) 17,145,961.88". TVC263 identical, but a different PAN (each trust prints its own; not reproduced here) and bank a/c (…0062 vs …4091) | row mixes bases, see VD-1 | ✓ per folio, ✗ fund row |
| Money-weighted return (CIO KPI) | "+30.1%"; hover "THE WINDOW IS 150 DAYS AND THE RATE IS NOT ANNUALISED" | 7 accounts with an opening value (`mwr.ts`): pooled annual XIRR **89.529%**; first flow 2026-04-01; last terminal 2026-08-13 (V.E.C). (1.89529)^(150/365) − 1 = **+30.05%** (shown). Over the flows' own span, 134 days: **+26.46%** | **+3.6 pp** | ✗ (VD-4) |
| One account's flows — Carnelian 3517383 | (inside the pooled tile) | CAR-PS p1 "From 01/04/2026 To 10/08/2026 · Market Value as of 01/04/2026 312,627,059.69 · Capital In(+)/Out(−) −140,472.00 · Market Value as of 10/08/2026 395,400,366.85 · Portfolio Rate of Return 26.98%". Book flows: −31,26,27,059.69 (01-Apr) and +1,09,782 TDS (03-Jul; bank-book p4 "TDS on Payout 03/07/2026 … −109,782.00"). Terminal ₹39,53,37,616.86 (= 395,400,366.85 − accrued 62,750). Money-weighted over 131 days: **26.49%** vs manager's TWR 26.98% | −0.49 pp (documented basis gap); **₹30,690 of capital out after 10-Jul missing** from the flows | ✓ within the documented 1 pp; D (VD-25) |
| Jammu & Kashmir Bank via Carnelian | Carnelian mandate page: 2,82,771 sh · Avg ₹119.92 · ₹3.39 Cr · CMP ₹155.15 · ₹4.39 Cr · 11.1% · +₹99.6 L | CAR-APP p1 "Jammu Kashmir Bank Ltd 282,771 119.92 33,908,605.69 155.15 43,871,920.65 9,963,315 29.38% 11.10%" | 0 | ✓ (held via the mandate, not Direct Equity) |
| Fractal's missing cost | "—", reason names ICICI Bank (NSDL demat) | ICICI prints balance and value, no cost column | — | ✓ correct absence |
| Active Momentum: AMFI vs statement mark | ₹14.65 AMFI 22-Sep; hover says it replaces the 06-Aug statement mark | Statement 14.0491 (₹21.4189 Cr) vs AMFI 14.6536 (₹22.3405 Cr) | basis, stated | ✓ |
| Helios: AMFI vs statement mark | ₹16.15 AMFI 22-Sep | Statement 16.21 (₹30.9985 Cr) vs AMFI 16.15 (₹30.8837 Cr) | basis, stated | ✓ |
| Duplicate 1 — 360 ONE Special Opportunities S8 A3 (CRN37702 Ajay; CRN60117 Bharat) | counted once: ₹1.47 Cr, cost ₹98.7 L, "2 folios · reported twice · counted once" | 360W-702 p2 "As On 31 Jul 26 Rs. 0.42 Cr. Rs. 0.99 Cr. Rs. 1.47 Cr. 11.66 %" (inflow − outflow, cost, value, return). 360W-117 p2 "As On 30 Jun 26 Rs. 0.78 Cr. Rs. 0.99 Cr. Rs. 1.46 Cr. 10.86 %". Same 9,90,429.684 u; **different dates and values** (₹1,46,68,362.66 at 31-Jul vs ₹1,45,80,412.51 at 30-Jun), different inflow histories. The fund's own register: 360A-632 p2 "Folio No. 1000632 PAN No. [Ajay's PAN, not reproduced here] 9,90,429.684 … Bank A/c No. 0084XXXXX0394 … 7,15,619"; 360A-633 p2 "Folio No. 1000633 PAN No. [Bharat's PAN, not reproduced here] 9,90,429.684 … 0084XXXXX7803 … 7,15,619" | not the same units at the same date | ✗ likely two investments (VD-1) |
| Duplicate 2 — Transition Venture Fund I A1 (Trust 2; Trust 3) | counted once: ₹1.71 Cr, cost ₹75 L | Same units, date and value (7,500 u, 31-Mar, ₹1,71,45,961.88), but two investor codes, two PANs, two bank a/cs, two ₹1.5 Cr commitments, two ₹75 L payments on 17-Oct-2025. Register: "TRANSITION VENTURE CAPITAL FUND I ₹1.50 Cr" paid = 2 × ₹75 L | ₹1.71 Cr value, ₹75 L cost | ✗ likely two investments (VD-1) |
| Bharat Jaisinghani Family Trust 2 / 3 holdings | Each entity page: TVC ₹1.71 Cr (+128.61%); "held, and not valued": SKY023/SKY024 ₹75 L paid; HDFC NSDL 67786547/67786137 quantity-only | TVC262/263 as above. SKY023/024: 7,500 u, ₹75 L drawn, NIL uncalled. HDFC NSDL: 347 CCPS at face ₹100 = ₹34,700 each | 0 | ✓ per-owner, not deduped (rule 4) |
| Sanshi total vs family review | ₹204.5 Cr | Σ five printed valuations = **₹2,04,48,04,459.29**; review's "Sanshi Fund 1" ₹204.48 Cr (REVIEW-RECONCILIATION) | 0 | ✓ (both pre-tax; post-tax ₹193.44 Cr, VD-16) |
| Neo Infra payouts | hover: ₹51 L = 28.2 + 14.2 + 8.7 | NEO p3: income ₹35,31,941 less the 09-Jul-26 rows, which fall after the 30-Jun valuation ("Distribution of Interest Income 7,13,178 71,319 6,41,859"; other income 455) = ₹28,18,308; principal ₹14,16,280; equalisation ₹8,69,355 | 0 | ✓ |
| PM / CIO Distributions ₹49.9 L | KPI and PM tile "Cash paid back so far" | Neo "Total Payout ₹49,48,221" + Baring "Distribution (E) 37,252" = ₹49,85,473 | 0 against capital accounts | ✓ arithmetic; omits 360 ONE's ₹7,15,619 × 2 (VD-10) |
| Transition HPR +128.61%; 360 ONE HPR +48.67% | PM / Monitor | 1,71,45,962.25 / 75,00,000 − 1 = 128.61%; 1,46,68,362.66 / 98,66,647 − 1 = 48.67% | 0 | ✓ arithmetic (on one folio each, VD-1) |

## Inventory — every figure, where it appears, how it is computed

One table per area. Columns: the figure, where it renders, its formula in plain words, the code that computes it, the statement field it comes from, its basis (statement or live; consolidated or per account; which date), and whether a check existed before this audit.

### Morning CIO — KPI tiles, allocation, concentration, capital deployment

Model set used below: `p = currentHoldings(dedupedPositions(portfolio.positions))`, which is 358 rows. Consolidated means each `dedupeGroup` counts once. The model drops 5 closed positions and 6 holdings under ₹1,000 (₹840.99).

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| F01 | Current Value of Holdings ₹713.3 Cr | /cio · KPI tile 1 | `portfolio.totalValue`: listed + private + not-placed over the deduped live-overlaid positions, specks included | :324; tile :1028; `PortfolioContext.tsx:347-362` `publicPrivateSplit` | `BOOK_POSITIONS.marketValue`, and for 21 rows the `fundNavs.ts` NAV × units | Statement marks 2026-03-31→2026-08-13 plus AMFI NAV 2026-09-22; consolidated | check-pages :7185 (href pairing only) |
| F02 | Hover: "NOT IN THIS FIGURE: ₹47.1 L of accrued income … on 125 holdings" | /cio · tile 1 hover | `sumOrNull(accruedIncome)` over p; count of non-zero rows | :338-339, :1030-1033 | `Position.accruedIncome` (CURRENT PORTFOLIO) | Statement; consolidated | check-pages :7266 (regex presence only) |
| F03 | Capital invested ₹470.3 Cr | /cio · KPI tile 2 | `sumOrNull(costBasis)` over p. The 49 cost-less holdings are skipped, not zeroed. Plus the fund-of-funds drawn amount (empty here) | :257, :347, tile :1056 | `Position.costBasis` | Statement; consolidated; 309 of 358 holdings | check-pages :7185 (href only); no tie to the drill-down headline |
| F04 | Money-weighted return +30.1% | /cio · KPI tile 3 | Pooled XIRR over the 7 accounts carrying an opening value. Each account closes at its own as-of with raw per-account market value. The result is de-annualised over `xirrWindowDays` = `portfolio.asOf` minus the first flow | `measured` :542-578; bookXirr :764; window :770-772; `bookMW` :845; tile :1095 | `BOOK_ACCOUNT_CASH_FLOWS`; `BOOK_POSITIONS` | Statement per account (2026-07-27→2026-08-13); window ends 2026-08-29 | check-pages :7274 (hover wording only); `accountXirr.test.ts:263-290` uses `BOOK_AS_OF`, so it encodes CK-A1 |
| F05 | Hover: "THE WINDOW IS 150 DAYS AND THE RATE IS NOT ANNUALISED …" | /cio · tile 3 hover | `m.bookMW.windowDays` | :1097-1102 | same | same | check-pages :7274 |
| F06 | Consolidated return +15.9% | /cio · KPI tile 4 | `embeddedGain ÷ totalInvested` = `sumOrNull(unrealizedPnL) ÷ sumOrNull(costBasis)` over p | :357-359, tile :1123 | `Position.unrealizedPnL`, `costBasis` | Consolidated; costed 309 rows; cumulative | holdings-invested "states its basis" (drill-down) |
| F07 | Uncalled capital ₹16 Cr | /cio · KPI tile 5 | `sumOrNull(undrawn)` over `capitalScope(...).onPage`, the 11 private-market capital accounts, `?? 0` | :302-314, tile :1139 | `BOOK_COMMITMENTS.undrawn` (printed) | Statement; as-ofs 2026-03-31 / 06-30 / 07-31 | check-pages :7821 (card committed figure vs PM) |
| F08 | Distributions ₹49.9 L | /cio · KPI tile 6 | `sumOrNull(distributionOf)` over onPage plus `fundTotals([]).distributed` (0), `?? 0` | :308, tile :1159 | `BOOK_COMMITMENTS` distribution lines | Statement; 4 of 11 accounts print one | none |
| F09 | Pill "6 buckets / 5 asset classes / 5 baskets held" | /cio?tab=allocation · card header | `groupCount(axis, sections.length)` | :1278; `groupAxis.ts:223` | derived | — | check-pages (bucket count is read by other invariants) |
| F10 | Bars: per-section ₹ and % | allocation card, bars | section current; `current ÷ m.totalValue` | :1295-1330 | positions | consolidated current | check-pages bar/row pairing (`data-alloc-bar`) |
| F11 | Row Invested (e.g. AIF ₹292.1 Cr, Cash ₹0) | allocation table col 2 | `sumOrNull(costBasis)` over the section's rows | `eqGroup` :403-406; render :1395 | `costBasis` | consolidated; costed subset of the row | none on the cell |
| F12 | Row Current (e.g. AIF ₹352.3 Cr) | col 3 | Σ marketValue of the section's rows | :405, :1396 | marketValue | consolidated current | row/drill-down value pairing |
| F13 | Row Return (total) (AIF +20.6%, PMS +11.4%, Debt +11.0%, EG +34.7%, Not classified +4.3%) | col 4 | `pnl ÷ cost` only if `costCoversSet(mv, uncostedMV)` (0.5%) | :448-455; `returnCell` :904-940; `analytics.ts:738` | P&L, cost | cumulative, unrealised on cost | check-pages :7679 (ties to own cells; returns `true` if unmatched) |
| F14 | Return-cell hover "Invested covers N of M holdings here (₹X of the ₹Y beside it) …" | col 4 hover (refused rows) | N = costed count; X = `costedMV` (market value of the costed rows); Y = row current | :918-927 | — | — | none |
| F15 | Row Weight | col 5 | `b.current ÷ m.totalValue` | :1398 | — | consolidated | weights-sum checks |
| F16 | Row/bar link hover "Open the N holdings behind X" | row label | `b.count` | :1366-1368, :1311 | — | — | row→drill-down count pairing |
| F17 | Unclassified row caption + `UNCLASSIFIED_WHY` | Not-classified row (family axes) | fixed text; this/these by count | :1386-1390; `familyTaxonomy.ts:151-152` | family review | — | check-pages (cause named) |
| F18 | Footer Invested ₹470.3 Cr | tfoot col 2 | `m.totalInvested` | :1409 | cost | consolidated; 309/358 | :7840 (total-ties; `true` when return absent) |
| F19 | Footer Current ₹713.3 Cr | tfoot col 3 | `m.totalValue` (includes the ₹840.99 of specks) | :1410 | — | — | partition checks (rounding bound) |
| F20 | Footer Return "—" | tfoot col 4 | `costCoversBook ? gainPct : null`, rendered as a bare DASH | :380-383, :1425-1440 | — | — | :7840 cannot fail when absent |
| F21 | Footer Weight "100%" | tfoot col 5 | literal | :1442 | — | — | — |
| F22 | Total link hover "the set this footer's Invested and Current columns are summed over" | tfoot label | text | :1405 | — | — | none |
| F23 | Provenance line (asset-class/basket axes), incl. "₹11.2 Cr … placed by their stated rule" | below table | text + `ruleMV` (Σ MV with source `"rule"`) | :1464-1476, :678, :886 | `familyTaxonomy.ts` | — | check-pages `alloc-taxonomy-source` presence |
| F24 | Fund commitments ₹42.7 Cr | Capital deployment | Σ committed over onPage + fundDeploy | :306 | `BOOK_COMMITMENTS.committed` | 3 statement dates | :7821 |
| F25 | Called / drawn — capital deployed ₹26.8 Cr | Capital deployment | `sumOrNull(drawn)` `?? 0` | :307 | `.drawn` | same | none |
| F26 | Undrawn — uncalled capital ₹16 Cr | Capital deployment | = F07 | :310 | `.undrawn` | same | :7821 |
| F27 | Distributions received ₹49.9 L | Capital deployment | = F08 | :308 | — | 4 of 11 | none |
| F28 | Bar "Called 62.6% / Undrawn 37.4%" | Capital deployment | drawn ÷ committed; 100 − that | :892, :1515-1521 | — | — | none |
| F29 | Positions 358 (+ hover "leaves out 6 holdings … ₹840.99") | Concentration | `m.p.length`; `droppedHoldings().negligible` | :1545, :241-242 | — | consolidated current | check-pages count pairing with ?of=book |
| F30 | Distinct names 202 | Concentration | distinct `securityKey` over p | :784-785, :1546 | — | — | pairing with ?of=book |
| F31 | Cross-held 128 | Concentration | securityKeys whose owner set over p has ≥ 2 members | :786-792, :1547 | `ownerOf(account)` | consolidated (dedupe groups count as one owner) | check-pages :11829 |
| F32 | Top-10 conc. 61% | Concentration | Σ top-10 securityKey values ÷ `bookMV` | :793-798, :1548 | — | consolidated | check-pages :11847 |
| F33 | Listed / Private / Not placed 99 / 1 / 0 (+ hover 98.5% ₹702.7 Cr · 1.5% ₹10.6 Cr · 0.0% ₹98,742) | Concentration | `marketSides(p)` value ÷ `m.totalValue`, toFixed(0) | :391, :1549-1583 | `Position.marketSide` (generated) | consolidated | partition checks on /holdings facets |
| F34 | Side link hovers (the `why` strings) | Concentration | text | `analytics.ts:144-166` | — | — | none |
| F35 | Largest name "Sanshi Fund-I … Class E · 24.6%" | Concentration | top securityKey ÷ bookMV | :799-802, :1585-1592 | — | consolidated | — |
| F36 | Winners / losers 175 / 116 | Concentration | count of p with `returnPct > 0` / `< 0` | :818-820, :1593-1600 | `returnPct` | consolidated | check-pages :12049 |
| F37 | /holdings?of=book headline ₹713.3 Cr · "358 holdings · 202 names · 32 accounts"; facets All 358 / Listed 353 / Private 4 / Not placed 1 | drill-down header | Σ MV of the set; share of `bookMV` | `HoldingsBehind.tsx:293-296, 527-534`; `drilldown.ts:527-583` | — | consolidated | several |
| F38 | /holdings?of=invested: h1 "Capital invested", headline ₹545.3 Cr "76.4% of the ₹713.3 Cr book"; footer Invested ₹470.3 Cr, Return +15.9% | drill-down | headline = MV of the 309 costed holdings | `drilldown.ts:367-395`; `HoldingsBehind.tsx:527-534` | — | consolidated | holdings-invested checks |
| F39 | /holdings?of=measured: h1 "Money-weighted return", ₹110.4 Cr "15.4% of the ₹716.5 Cr book", facets 179/181; footer Return +12.7% | drill-down | set = rows of the 7 accounts; `bookMV` = Σ raw `portfolio.positions` | `drilldown.ts:397-426` (`deduped:false`); `HoldingsBehind.tsx:293-296` | — | per-account, as printed | holdings-measured: `here < nav − 0.15` only |
| F40 | 16 section drill-down headlines (`?of=bucket|family-class|basket&key=…`) | drill-down | Σ MV of the section | `drilldown.ts` via `AXIS_SCOPE` | — | consolidated | row/destination pairing |
| F41 | /holdings?of=top-names ₹431.7 Cr "60.5% of the ₹713.3 Cr book" | drill-down | top-10 names | `drilldown.ts:454` | — | consolidated | :11847 |
| F42 | /holdings?of=cross-held ₹438.1 Cr, 128 names, 284 holdings | drill-down | cross-held set | `drilldown.ts:474` | — | consolidated | :11829 |
| F43 | /holdings?of=winners / losers / neither: 175 (₹463.7 Cr) / 116 (₹70 Cr) / 67 (₹179.6 Cr) | drill-down | sets by `returnPct` sign | `drilldown.ts:495` | — | consolidated | :12049 |
| F44 | Live-basis variants (mock): NAV ₹729.4 Cr, MW +45.3%, Consolidated +18.7%, Winners/losers 209/82, Top-10 59% | harvest-live/cio-alloc.json | same formulas on `applyQuotes(base, feed)` | same | quote feed | live | none specific |

### Morning CIO — Daily movers, NAV vs Nifty 500, the top bar and index strip

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| TB-1 | Current value of holdings chip `₹713.3 Cr` | every route · header chip (title "Current Value of Holdings") | Σ market value of the deduped positions after `applyQuotes` then `applyFundNavs` (listed + private + unplaced) | TopBar.tsx:139-141 `TopBar`; PortfolioContext.tsx:347 | BOOK_POSITIONS × /api/quotes × src/data/fundNavs.ts | live where quoted, else statement mark or AMFI NAV 2026-09-22; consolidated; blends 8 dates | none on the chip (no check that it equals the KPI tile) |
| TB-2 | `Marks as of 2026-08-29` | every route · status text, feed down | `portfolio.asOf` = BOOK_SUMMARY.asOf, the newest account as-of | TopBar.tsx:75 `QuoteStatus` | BOOK_SUMMARY.asOf | per-account newest date | none |
| TB-3 | Feed-down hover "…Every holding is showing its statement mark, and nothing has been substituted for a live price" | same element's title | `outageShort(failure)` + a fixed sentence | TopBar.tsx:68-71 | lastQuoteFailure() | — | none |
| TB-4 | `Live HH:MM` pill + hover "N holdings priced live via X · M on workbook marks — ETFs, warrants and securities the price feed does not carry" | header, live state | livePriced = distinct securityKeys with a live row; notLive = keys with a symbol and no quote | TopBar.tsx:85-91; PortfolioContext.tsx:386-400 | /api/quotes | live | none |
| TB-5 | `Fetching prices…` | header, loading | status only | TopBar.tsx:59-63 | — | — | cio-loading / cio-cached walk the page, not the header text |
| TB-6 | FX chip `$1 = ₹X` (+ `· fallback`) | header, USD selected | /api/fx rate, else DEFAULT_INR_PER_USD 83.5 | TopBar.tsx:37-46; fx.ts:6; functions/api/fx.js:45-54 | ECB/Frankfurter, else open.er-api | live, or static fallback (disclosed) | none |
| TB-7 | every money figure in USD | all routes | INR ÷ inrPerUsd | PortfolioContext convertFromBase / fmtFromBase | TB-6 | — | none |
| IX-1 | Index level (Nifty 50 / 500 / Midcap 150 / Smallcap 250) | every route · index strip | regularMarketPrice, refused unless the upstream's own name matches | IndexStrip.tsx; functions/api/indices.js | Yahoo chart | live | indicesFunction.test.ts (identity) |
| IX-2 | Day move, points and % | strip | level − close of the last bar strictly before the level's own session | functions/api/indices.js | Yahoo | live | indicesFunction.test.ts (12 checks, incl. pre-open) |
| IX-3 | Per-index hover (session date, previous close) | strip title | — | IndexStrip.tsx:30-46 | — | — | none |
| IX-4 | `NSE · live` / `N/4 live` + hover "source · resolved of requested · fetched HH:MM" | strip, right end | count of resolved indices | IndexStrip.tsx:108-111 | — | — | none |
| IX-5 | "Index levels unavailable — the feed did not respond" | strip, failure | — | IndexStrip.tsx:100-105 | — | — | check-pages generic |
| DE-1 | Tile `Direct Equity · today` ₹ | /cio · movers card (live only) | Σ dayChange over in-scope rows that carry one; a name held in several accounts is one row | TodaysMovers.tsx:236-238 | (quote − prevClose) × statement quantity | live; consolidated | cio-live (+10.00% closed form) |
| DE-2 | Tile % | same | dayChange ÷ (movedValue − dayChange) | TodaysMovers.tsx:239 | same | live, priced subset | cio-live |
| DE-3 | Coverage "on ₹A of the ₹B held, across N of M direct-equity names … · quotes HH:MM" | same | movedValue; scopeValue = Σ market value of the scope; priced names; distinct names | TodaysMovers.tsx:183-185, 423-425 | same | live; scope = consolidated, **no ₹1,000 floor** | sentence shape only (check-pages.mjs:14057); cio-live priced count |
| DE-4 | Index tile: 4 levels and % | same card | fetchIndices() | TodaysMovers.tsx:157, 430ff | /api/indices | live | cio-live (−1.00%), cio-index-loading |
| DE-5 | vs-index sentence "+x% against the Nifty 500 today, on ₹A of the ₹T book" | same | dayPct − Nifty 500 % | TodaysMovers.tsx:460-470 | — | live | cio-live (11.00 pts) |
| DE-6 | Gainers: count, rows (₹, %), total | same | rows with dayChange > 0, ranked by % or ₹ | TodaysMovers.tsx MoverList | — | live | cio-live (gainer count = priced scope) |
| DE-7 | Losers: count, rows, total | same | dayChange < 0 | same | — | live | cio-live |
| DE-8 | Rank toggle (% default) | same | — | data-mover-rank | — | — | CIO_MOVERS |
| DE-9 | Per-row % for a name held in several accounts | same | Σ dayChange ÷ Σ previous value | TodaysMovers.tsx:232-233 | — | live | cio-live |
| DE-10 | Excluded footer "N label ₹MV" per bucket | same | distinct keys and Σ MV of priced rows outside the scope, per bucket | TodaysMovers.tsx:496-503 | — | live | cio-live (partition against the book) |
| DE-11 | Absent state (feed down) | /cio (dump) | fixed sentence | TodaysMovers.tsx:392-397 | — | — | cio |
| DE-12 | Loading progress "N of M" | cio-filling | pending names in scope | TodaysMovers.tsx:304, 349-372 | — | — | cio-filling |
| DE-13 | Tab title "What moved today — the family's own direct equity, and their funds' published NAVs" | /cio · Daily Movers tab (title attr) | fixed text | MorningCIO.tsx:179 | — | — | none |
| NM-1 | Tile label `Published NAV · 2026-09-09` | /cio?movers=funds | newest nav.date among the rows | NavMovers.tsx:212 | public/lookthrough/index.json | published NAV, 09-08/09 | NAV_MOVERS "dated, and never called today" |
| NM-2 | Tile ₹ `−₹15.4 L` | same | Σ row value × row changePct ÷ 100 | navMovers.ts:268 `navMoverModel` | lookthrough changePct × holding MV | 09-09 move × 09-22 value | NAV_MOVERS reconcile (against NAV_MOVERS_BOOK, which uses the same mixed basis) |
| NM-3 | Tile % `−0.14%` | same | move ÷ coveredValue | navMovers.ts:277 | same | same | NAV_MOVERS value-weighted check |
| NM-4 | Coverage "on ₹113.1 Cr of the ₹113.1 Cr held, across 12 schemes behind 13 names" | same | covered / scope value (ETF + Mutual Fund buckets of currentHoldings) | NavMovers.tsx:93; navMovers.ts:82, 172-284 | positions + AMFI overlay | 09-22 NAV values | NAV_MOVERS coverage |
| NM-5 | Basis paragraph (date span; "whose mark is its own statement's") | same | text | NavMovers.tsx:237-245 | — | — | NAV_MOVERS "states its basis" (presence only) |
| NM-6 | Row NAV + hover "prev date prev NAV → date NAV" | NAV column | lookthrough nav | NavMovers.tsx | lookthrough | 09-08/09 | NAV_MOVERS per row |
| NM-7 | Row Move % | Move column | nav.changePct | NavMovers.tsx | lookthrough | 09-09 | NAV_MOVERS |
| NM-8 | Row ₹ on holding | column | value × changePct | navMovers.ts:241-242 | — | mixed | NAV_MOVERS |
| NM-9 | Row Held + hover "on its own statement of {valueAsOf} — a different date from the {navDate} NAV beside it" | Held column | Σ in-scope market value of the scheme | navMovers.ts:220-242; NavMovers.tsx:257, 280-287 | positions after applyFundNavs | 09-22 NAV × statement units on 10 of 12 rows; statement on 2 | values reconciled; hover text none |
| NM-10 | Row sub-line (plan · N statements · clubbed · NAV date if older) | Scheme column | — | NavMovers.tsx | lookthrough | — | NAV_MOVERS older-day disclosure |
| NM-11 | `drastic` chip (≥ 2%) | row | abs(changePct) ≥ 2 | navMovers.ts:302 | — | — | NAV_MOVERS; navMovers.test.ts |
| NM-12 | Loading / store-down / nothing-priced states | card | — | NavMovers.tsx:100-130 | — | — | partial |
| NV-1 | "12 dated points, 2026-05-31 → 2026-08-13" | /cio?tab=nav, /performance · subtitle | length and ends of BOOK_NAV_HISTORY | NavVsIndex.tsx:309 | BOOK_NAV_HISTORY | statement | CIO_NAV "dated series with its date range" |
| NV-2 | "13 of 51 accounts" | subtitle | covered count / all accounts | NavVsIndex.tsx:310; navSeries.ts:300 | BOOK_NAV_COVERAGE | — | CIO_NAV |
| NV-3 | "₹140.2 Cr of the ₹713.3 Cr book" | subtitle | last series point (deduped) / portfolio.totalValue | NavVsIndex.tsx:311-312; navSeries.ts:315 | BOOK_NAV_HISTORY; portfolio | statement 08-13 over live + NAV | CIO_NAV (partial) |
| NV-4 | "rebased to 100 at 2026-05-31" | subtitle | — | NavVsIndex.tsx:313 | — | — | CIO_NAV "states what its axis is rebased to" |
| NV-5 | Subtitle hover (panel grows 4 → 13, complete from 2026-07-10) | subtitle title | — | NavVsIndex.tsx:304-308 | coverage | — | CIO_NAV panel check |
| NV-6 | `Book +5.09%` | header pill | chained index: Π (linkClose − flowIn)/linkOpen − 1 | NavVsIndex.tsx:327; navSeries.ts:66-110, 322 | BOOK_NAV_HISTORY | statement, flow-adjusted | CIO_NAV (chained two ways); navSeries.test.ts |
| NV-7 | `Nifty 500 ±x%` | header pill (live only) | index at the book's last date ÷ index at its first date (nearest earlier) | NavVsIndex.tsx:329-331; navSeries.ts rebasedIndex | /api/prices ^CRSLDX | live history | CIO_LIVE_NAV |
| NV-8 | `₹28.3 Cr not proven` + hover | header pill | max over points of Σ market value of re-marked accounts whose flowBasis is "unreported" | NavVsIndex.tsx:343-349; build-book.mjs:474-490, 526-542 `navHistoryFrom` | BOOK_NAV_HISTORY.unreportedFlowValue; BOOK_NAV_COVERAGE.flowBasis | statement | CIO_NAV check-pages.mjs:8207 (requires the pill **and** the words "publish no dated capital record") |
| NV-9 | "over 2026-05-31 → 2026-08-13" | under the pills | coverage ends | NavVsIndex.tsx:350ff | — | — | CIO_NAV "names the book's own window" |
| NV-10 | Range buttons (Book window, 3M, 6M, 1Y, 3Y, 5Y, Max) + hover | period row | rangeStart = bookTo − days; rangeEnd = bookTo only for Book window | NavVsIndex.tsx:372-387; navSeries.ts:200-239 | — | — | CIO_NAV "offers a period longer" |
| NV-11 | `NAV incl. ₹11.2 Cr added` + hover (+9.29% vs +0.54%) | period row | Σ positive flowIn; segRaw = nav end/start over the complete panel; segAdj = chained index over the same segment | NavVsIndex.tsx:189-202, 402-414 | BOOK_NAV_HISTORY.flowIn | statement | CIO_NAV "names the external capital", "prints the flow-adjusted AND the unadjusted" |
| NV-12 | Range note "from → to · N index closes · Nifty 500 alone over this period ±x%" | period row (live) | index return over the drawn range | NavVsIndex.tsx:423-429 | /api/prices | live | CIO_LIVE_NAV "stated with the range" |
| NV-13 | Series "Book · ex capital flows" | chart | chained index at each point | NavVsIndex.tsx:501 | BOOK_NAV_HISTORY | statement | CIO_NAV geometry / vertex count |
| NV-14 | Series "NAV incl. capital added" (dashed, toggle) | chart | nav ÷ nav at the first complete-panel point × 100 | navSeries.ts:80-106; NavVsIndex.tsx:155, 495 | BOOK_NAV_HISTORY.nav | statement, raw | CIO_NAV vertex count (not its base) |
| NV-15 | Series "Nifty 500" | chart (live) | daily closes ÷ close at the book's first date × 100 | navSeries.ts:157 `indexCurve` | /api/prices | live | CIO_LIVE_NAV |
| NV-16 | Axes (time; index points) | chart | — | NavVsIndex.tsx:459-466 | — | — | CIO_NAV ticks |
| NV-17 | Tooltip `v (v−100 %)` per series | chart hover | — | NavVsIndex.tsx:468-470 | — | — | none |
| NV-18 | Flow marks (intervals that took capital) | chart | points with flowIn ≠ 0 | NavVsIndex.tsx | flowIn | — | CIO_NAV |
| NV-19 | Measured-window band | chart (wider ranges) | shaded bookFrom → bookTo | NavVsIndex.tsx | — | — | CIO_LIVE_NAV |
| NV-20 | Index-down note | chart (dump) | text | NavVsIndex.tsx | — | — | cio-nav |
| NV-21 | Excluded summary "The 38 accounts that cannot supply a series — ₹571.9 Cr · 23 … · 15 …" | details | counts; Σ single-list bookValue | NavVsIndex.tsx | BOOK_NAV_COVERAGE | statement, per account | CIO_NAV partition |
| NV-22 | Single-list rows (account, date, value) | details | per-account statement value | NavVsIndex.tsx | BOOK_NAV_COVERAGE.single | statement, per account | CIO_NAV partition |
| NV-23 | Unvalued-list rows (dash + hover "absent valuation, not a measured zero") | details | — | NavVsIndex.tsx:606-618 | BOOK_NAV_COVERAGE.unvalued | — | CIO_NAV partition (hover not checked) |
| NV-24 | Footer "Their values sum to ₹713.6 Cr, which is ABOVE the current value of holdings by the value two members both report" | details footer | Σ covered + single + unvalued bookValue | NavVsIndex.tsx:624-628 | BOOK_NAV_COVERAGE | statement, per account | none |

### Portfolio Monitor — Holdings (category, asset class, basket; by entity)

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source (BOOK_* field / statement field / feed) | Basis (statement/live; consolidated/per-account; which date) | Existing guard |
|---|---|---|---|---|---|---|---|
| I-01 | Section band holding count "· N holdings" / "N mandates · N holdings" | all four views · section heading row (`data-holdings`) | number of ROWS drawn in the section; a mandate row counts its constituents | PM:1513 `bucketGroups` | row build | consolidated rows (default) / statement rows (entity) | monitor "the Direct Equity section states its own holding count…", "the PMS heading's holding count is the sum of its mandates' own counts"; nothing vs `/holdings` or the totals hover (→ MH-06) |
| I-02 | Section band subtotal "₹X Cr" (`data-subtotal`) | all views · section heading | Σ market value of the section's DEDUPED current positions | PM:1441–1453 `bucketTotals`, 1471–1555 `bucketGroups` | `BOOK_POSITIONS.marketValue` after `applyFundNavs` | consolidated; blend of statement dates 2026-03-31…2026-08-13 + NAV 2026-09-22 | monitor & monitor-entity "the class subtotals reconstruct the footer total"; CATEGORY_TOTALS |
| I-03 | "₹X reported twice, counted once" | section heading | Σ row market values − subtotal, shown when > 0 | PM:1508 (`collapsed`), 2696–2698 | same | entity view: raw vs deduped | monitor-entity "a section that collapses a duplicate names what it collapsed" (positive case only) (→ MH-13) |
| I-04 | "includes N liquid holdings the statements type as a fund" | Cash heading | rows in Cash that `isCashEquivalent` | PM:2693 | `CASH_EQUIVALENT_KEYS` (analytics) | rows | monitor "the Cash section names the liquid holdings it took in" |
| I-05 | "₹X by the family's stated rule" | basket heading (Thematic & Tactical) | Σ MV placed by the direct-stock rule | PM:2726 | `familyTaxonomy.ts` | consolidated | familyTaxonomy.test.ts |
| I-06 | Totals row Invested (◦ + coverage hover) | every section · "<section> · total" | Σ `costBasis` over the section's deduped positions reporting one; hover "Added over the c of h holdings…" | PM:2760–2938 (costCover 2807) | `BOOK_POSITIONS.costBasis` | consolidated (also on entity view) | CATEGORY_TOTALS "…add to the footer's invested and unrealised P&L" |
| I-07 | Totals row Market value / Weight | totals row | Σ MV; MV ÷ weightBase | PM:2760–2938 | MV | consolidated | CATEGORY_TOTALS "…add to the footer's market value", "…weights add to the footer's own weight" |
| I-08 | Totals row Unreal. P&L | totals row | Σ `unrealizedPnL` of costed positions | PM:1441–1453 | `unrealizedPnL` (NAV-moved) | consolidated | CATEGORY_TOTALS |
| I-09 | Totals row Realised P&L (+ "N names also held in another category") | totals row | Σ per-security realised over the keys this section claims first in reading order | PM:1771–1807 `realisedByBucket`/`realisedFor` | `ledger.loadSales` (tape sells × capital-gain lots, all accounts) | whole-book per security | none vs Capital Gains (→ MH-05, MH-03) |
| I-10 | Totals row Return (or refusal reason) | totals row | P&L ÷ cost × 100 when `costCoversSet` (uncosted ≤ 0.5% of MV), else reason | PM:2784–2804 | same | consolidated, cumulative on cost | CATEGORY_TOTALS "a category whose cost side does not cover it refuses a return on cost" (→ MH-14 wording) |
| I-11 | Totals row Qty / Avg cost / Invested on / CMP / Day | totals row | AbsentCell with reason | PM:2808–2938 | — | — | CATEGORY_TOTALS "every metric a category cannot total renders a dash with a reason" |
| I-12 | Row Security name, fund-class clubbing ("2 unit classes") | every row | `holdingLabel`; a fund with ≥2 classes in the book, all shown, is one row | PM:1059–1239, 3830 `clubbedClassesOf` | `securityKey`, `splitFundClass` | display | FUND_CLASSES |
| I-13 | Row Qty | every row | Σ quantity of the row's deduped lots; absent for a mandate / clubbed fund | PM:1151, 3113–3124 | `quantity` | consolidated / per statement | FUND_CLASSES "the clubbed row's per-unit cells say WHY" |
| I-14 | Row Avg cost | every row | consolidated: cost ÷ qty (derived); entity view: `Position.avgCost` (printed) | PM:1185, 1244–1257, 3125–3132 | `costBasis`, `quantity`, `avgCost` | differs by view (→ MH-16) | none |
| I-15 | Row Invested | every row | Σ `costBasis` of deduped lots; costNA → bare "—" | PM:1150, 3141–3148 | `costBasis` (carried cost for Buoyant) | consolidated / per statement | carriedCost.test.ts; monitor "a cost carried through a class switch…" (→ MH-10) |
| I-16 | Row Invested on (+ "+N" and hover) | every row | first dated payment: tranche dates (`BOOK_POSITION_TRANCHES`) or lot-register `heldSince` | PM:210 `investedOnOf`, 3155–3175 | `BOOK_POSITION_TRANCHES`, `heldSince` | deduped set | monitor "the Invested on column carries a date wherever the book has one", "…a holding the book cannot date shows a dash" |
| I-17 | Row CMP (+ ◦ hover) | every row | `ps[0].currentPrice` (first lot's mark); ◦ hover names AMFI NAV date or "statement as of `portfolio.asOf`" | PM:1186, 3177–3192 | `currentPrice` / fundNavs.ts | statement / NAV | fundNavs.test.ts (overlay); none for multi-mark rows or the hover date (→ MH-02, MH-08) |
| I-18 | Row Day | every row | live day move; absent without a quote | PM:3193–3204 | quote feed | live only | — |
| I-19 | Row Market value | every row | Σ MV of deduped lots | PM:1147, 3205–3217 | `marketValue` (NAV-moved) | consolidated / per statement | monitor "by-security total counts each dedupeGroup once" |
| I-20 | Row Weight (+ popover) | every row | row MV ÷ weightBase (deduped current book before the company pick-list) × 100 | PM:909–913, 1702–1703, 3232–3245 | MV | consolidated denominator on both views | CATEGORY_TOTALS weights |
| I-21 | Row Unreal. P&L | every row | MV − cost (consolidated) / `unrealizedPnL` (entity); costNA → bare "—" | PM:1153, 3246–3251 | cost, MV | consolidated / per statement | — (→ MH-10) |
| I-22 | Row Realised P&L | security rows | whole-book realised for the security key; mandate rows AbsentCell | PM:3252–3270 | `loadSales` | whole book, per security | none |
| I-23 | Row Return, one column per measure (AUTO / HPR / CAGR / XIRR / YTD / CY) + hover note | every row | `measuredReturn(row, measure, portfolio.asOf)`; CAGR/auto annualise when held ≥ 365 days from `heldSince` to 2026-08-29 | PM:3309–3340; analytics.ts:999 `holdingReturn`, 1213 `measuredReturn` | `returnPct`, `heldSince` | window ends 2026-08-29 for every holding (→ MH-01, MH-09) | RETURN_COLUMNS, monitor-cagr/ytd/xirr/returns-multi; holdingReturn.test.ts (passes the book as-of) |
| I-24 | Return column header note ("1 annualised of 72") + hover | header | `returnCoverage` over the rows | PM:2614; returnColumns.ts:123 `returnColumnMeta`; analytics.ts:1283 | same | same | monitor-cagr "the coverage note partitions the rows it describes" |
| I-25 | Row Sector | every row / mandate constituents | `Position.sector` (statement tier only); mandate / fund AbsentCell | PM:3350–3357, 2103 | `sector` | statement tier | monitor "the sector column is second from the end" (position only) (→ MH-07) |
| I-26 | Row Entities ("N entities" / owner) | every row | distinct owners of the row's raw lots | PM:1181, 3358–3370 | `BOOK_ACCOUNTS.owner` | raw | AXIS_EXPANSION |
| I-27 | Mandate row Invested / MV / Weight / Unreal P&L / HPR (+ partial sub-line) | PMS section rows | Σ over the mandate's current constituents incl. cash sleeves; HPR = P&L ÷ cost | PM:975–1056, 3109–3116 | constituents | consolidated, statement date of the mandate | monitor "every row in the PMS section is a mandate…", "every mandate row links to its own drill-down" |
| I-28 | Mandate constituent rows (Qty…Return, "x% of the mandate") | expanded mandate | each constituent; share = MV ÷ account MV (pre-filter) | PM:2080–2105 | constituents | statement | monitor-open-all / mandate checks |
| I-29 | Venue expansion: lead sentence (value, "% of the book", route split, overlap), one line per statement (qty, avg, cost, CMP, MV, share of the holding, P&L, return), "Counted once" adjust row | expanded security row | lines AS PRINTED; share = line MV ÷ printed sum | PM:2146–2287, 3840 `venuesOf` | raw positions | per statement | AXIS_EXPANSION ("…venue counts account for every statement", lines add) |
| I-30 | Tranche expansion: units, entry NAV, invested, date, value today, gain, per-tranche return (CAGR/HPR), per-class sections | expanded Sanshi / Buoyant / Transition rows | value = units × (position MV ÷ quantity); return via `holdingReturn(…, portfolio.asOf)` | PM:1570–1589 `trancheInfo`, 1960–2037 `trancheRows`; tranches.ts:127–177 | `BOOK_POSITION_TRANCHES` | window ends 2026-08-29 (→ MH-01) | monitor-tranche / -switch / -shared; tranches.test.ts (ASOF = "2026-08-29") |
| I-31 | Footer "Total · N rows" + hover (under-₹1,000 floor: "6 holdings … ₹840.99") | footer label | row count; `droppedHoldings(positions).negligible` on the unfiltered book | PM:870–872, 3403–3404 | MV per securityKey | unfiltered book | AXIS_EXPANSION "no holding under the ₹1,000 floor is drawn as a row"; negligibleFloor.test.ts |
| I-32 | Footer Invested | footer | Σ `costBasis` over the deduped footer set (309 of 358 report one) | PM:1592 area, 3409 | cost | consolidated | the class-subtotal checks (→ MH-11) |
| I-33 | Footer Invested on ("6 of 72 dated") | footer | rows with an `investedOn` / rows | PM footer | tranches, heldSince | consolidated | — |
| I-34 | Footer Day | footer | Σ day change ÷ Σ live prev value over live rows | PM:1813–1816, 3430–3432 | quote feed | live | none (bare "—" → MH-10) |
| I-35 | Footer Market value | footer | `consolidatedMarketValue(footerSet)` = ₹713.29 Cr | PM:3438 | MV | consolidated blend | monitor "the class subtotals reconstruct the footer total"; familyTaxonomy.test (axes partition `BOOK_SUMMARY`) |
| I-36 | Footer Weight (+ hover "…column adds to 100%") | footer | shown ÷ weightBase | PM:3497–3524 | MV | consolidated | CATEGORY_TOTALS (→ MH-12 on entity view) |
| I-37 | Footer Unreal. P&L | footer | Σ `unrealizedPnL` of costed positions | PM:3526–3531 | P&L | consolidated | class subtotal checks |
| I-38 | Footer Realised P&L | footer | Σ realised over the union of every row's keys (incl. mandate constituents) | PM:1727–1751 `realisedSplit`, 3547–3557 | `loadSales` | whole book, per security, names still held | none (→ MH-03, MH-05) |
| I-39 | Footer Return (HPR / auto columns) + popover | footer | P&L ÷ cost × 100 with NO coverage test | PM:1592 `totalRet`, 3574–3585 | same | consolidated | none (→ MH-04) |
| I-40 | `?view=entity` paragraph "visible rows sum to ₹716.5 Cr … ₹713.3 Cr (a ₹3.17 Cr overlap)" | entity view · under table | raw MV − deduped MV, shown when > ₹1 | PM:1595 `dupGap`, 3777–3783 | MV | per statement vs consolidated | monitor-entity |
| I-41 | Section tabs | filter row | sections of the active axis, from the book via `groupKeyFor` | PM:2476–2515 | book | — | sectionTabChecks |
| I-42 | Entity filter / company pick-list / `?sector=` | filter row | narrows `base` by owner / `securityKey` / `Position.sector` (weight denominator struck before the pick-list) | PM:799, 873–874, 909–913 | `BOOK_ACCOUNTS.owner`, `sector` | — | monitor-sector, monitor "the pick-list is of holdings" |

### Portfolio Monitor — Transactions

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| F01 | Counter "Capital 36 in · 95 out" | txns · counter right of the controls | Count of `BOOK_CAPITAL_MOVES` rows in view by direction. Date and entity filters apply; the side filter does not | PortfolioMonitor.tsx:4309 `mineMoves`, :4318 `mineCount`, :4487 | `BOOK_CAPITAL_MOVES` | statement; per movement; each movement's own date | check-pages `monitor-txns` "the counter beside the table counts both records on screen" (9430) |
| F02 | Counter "Trades 284 buys · 178 sells" | same | Count of tape rows in view by side | PortfolioMonitor.tsx:4489 | `loadTransactions` (ledger.ts:352): transaction-statement / investor-report rows | statement; tape 2026-04-01 → 2026-08-13 | same (9430) |
| F03 | Section band "· N rows · ₹X in · ₹Y bought" | each section heading | Sum of Capital in over the section's capital rows, and sum of Bought over its trade groups | PortfolioMonitor.tsx:3956 `TxnSectionHead`, :4561; txnLedger.ts:320 `datedSectionRollup` | as F06/F11 | as F06/F11 | "the footer is summed from the rows it draws" (9177); `txnBasketChecks` (9617) |
| F04 | Row name / sublabel | first cell | Mandate or fund row: strategy or provider, then owner · provider · account. Security row: security name | txnLedger.ts:153 `mergeDatedRecords`; txnRollup.ts:243 `rollup` | registry, tape | — | — |
| F05 | How it went in: "lumpsum" / "staggered · N payments" / "N withdrawals" | Capital block | Count of contributions in view: one is a lumpsum, more is staggered. Under Sells it counts withdrawals | tranches.ts:443; PortfolioMonitor.tsx:4632-4644 (header title :4509) | `BOOK_CAPITAL_MOVES` | statement | "every row's lumpsum/staggered label matches its own contribution count" (9378) |
| F06 | Capital in | Capital block | Σ gross amount of in-movements in view (`m.amount ?? 0`) | tranches.ts:415 `capitalRollup` | `BOOK_CAPITAL_MOVES.amount` (gross drawdown, subscription or deposit) | statement; per account | "Capital in and Bought are two columns, and neither is their sum" (9232) |
| F07 | Capital out | Capital block | Σ out-movement amounts in view | tranches.ts:416 | same | statement; per account | "a row with no withdrawal shows a dash" (9535) |
| F08 | Net invested | Capital block | Capital in − Capital out. Null under a side filter | tranches.ts:421 | derived | statement | — |
| F09 | Invested on | Capital block | Earliest → latest date of the movements in view (both directions) | tranches.ts:441-442; PortfolioMonitor.tsx:4672 | movement dates | movement dates | "the rollup is ordered newest first" (9317) reads the same attributes |
| F10 | Trades "N (xB/yS)" | Trades block | Count of tape rows in the group, split by side | txnRollup.ts:243 `rollup` | tape | statement; tape window | footer ties to the counter (9177/9430); `monitor-txn-drill` (11053) |
| F11 | Bought | Trades block | `sumOrNull` of the settled amount of Buy rows (settlement ?? net ?? gross) | txnRollup.ts; ledger.ts:89 `settledAmount` | tape | statement | 9177, 9232 |
| F12 | Sold | Trades block | Same, over Sell rows | same | tape | statement | 9177 |
| F13 | Realized P&L "+₹x k/n" | Trades block | Σ capital-gain lots keyed `accountNo\|securityKey@saleDate`, claimed once per account/security/day by its first sell row. "k/n" = sells carrying a figure out of all sells | ledger.ts:342 `realisedIndex`, :378-397; txnRollup.ts:220-221, 314-315 | `capitalGains` in the archive (AUTHORITATIVE.capitalGains) | statement; each CG statement's own window | txnRollup.test.ts:56-70, 194 (fixtures) |
| F14 | Traded between | Trades block | First → last trade date | txnRollup.ts | tape | trade dates | — |
| F15 | Value today | account columns | Σ raw `statementPortfolio.positions.marketValue` of the account: no dedupe, no NAV overlay. "—" on security rows | PortfolioMonitor.tsx:4300 `valueOfAccount`; txnLedger.ts:181, 212 | `BOOK_POSITIONS` | statement; each account's own as-of (2026-03-31 → 2026-08-13); per account | txnLedger.test.ts (agrees with `capitalRollup.value`) |
| F16 | Value today hover when ₹0 | account columns | Fixed text: "holds nothing today … zero units at a NAV the fund still publishes" | PortfolioMonitor.tsx:4702-4705 | — | — | — |
| F17 | Gain | account columns | Value today − Net invested, only if no side filter, net > 0 and `contributionsAreComplete` | tranches.ts:367 `contributionsAreComplete`, :425-445 | derived | statement; value date ≠ flow dates | "the Return column names the condition…" (9484) |
| F18 | Return "HPR x%" | account columns | Gain ÷ Net invested × 100. Not annualised | tranches.ts:445; PortfolioMonitor.tsx:4722-4728 | derived | as F17 | 9484 |
| F19 | Entity | last column | Account owner, or the distinct owners of a security row's tranches | PortfolioMonitor.tsx `entitiesOf` | registry | — | — |
| F20 | Footer label "Total · 36 rows · 13 of 51 accounts" and its hover "13 of this book's 51 accounts publish a dated capital record. The other 38 were funded as well…" | footer | rows; capital rows in view; `accountsReg.length` | PortfolioMonitor.tsx:4843-4844; txnLedger.ts:243 `datedTotals` | derived | — | "the total names the fraction of the book's accounts it covers" (9411); `FUNDED_ACCOUNTS` (2044, 9369) |
| F21 | Footer How "36 payments" / "N withdrawals" | footer | Σ contributions (or withdrawals) | PortfolioMonitor.tsx:4847-4850 | derived | — | "the footer's payment count is the sum of the rows'" (9390) |
| F22 | Footer Capital in ₹292.4 Cr | footer | `capitalTotals` Σ paidIn | txnLedger.ts:243 → tranches.ts:465 | `BOOK_CAPITAL_MOVES` | statement | 9177 |
| F23 | Footer Capital out ₹31.1 Cr | footer | Σ tookOut | same | same | statement | 9177 |
| F24 | Footer Net invested ₹261.3 Cr | footer | Σ net; null if there are no capital rows | txnLedger.ts | derived | statement | 9255 |
| F25 | Footer Trades "462 (284B/178S)" | footer | `rollupTotals` Σ trades | txnRollup.ts:328 | tape | tape window | 9177 |
| F26 | Footer Bought ₹70.4 Cr | footer | `sumOrNull` Σ group bought | txnRollup.ts:334 | tape | statement | 9177, 9232 |
| F27 | Footer Sold ₹29.7 Cr | footer | Σ group sold | txnRollup.ts:335 | tape | statement | 9177 |
| F28 | Footer Realized "+₹1.24 Cr 115/178" | footer | Σ group realized; realizedOf/sells | txnRollup.ts:336-337 | archive capitalGains | statement | txnRollup.test.ts:194 |
| F29 | Footer Value today ₹423.6 Cr, hover "Summed over the 20 of 36 rows that are an account" | footer | `sumOrNull` of row values: 20 account rows, raw, not deduped | txnLedger.ts:279 | `BOOK_POSITIONS` | per-account sum shown as a table total | 9255 |
| F30 | Footer Gain +₹59.7 Cr, hover "Summed over the 12 of 36 rows that publish one…" | footer | Σ row gains | txnLedger.ts:296 | derived | as F17 | 9255 |
| F31 | Footer Invested on / Traded between / Return / Entity: "—" with reasons | footer | Absent by design | PortfolioMonitor.tsx:4904-4907 | — | — | 9255 |
| F32 | Side filter All / Buys / Sells | control | Tape rows narrow on side. Capital rows narrow on direction. Net, Gain and Return withheld | PortfolioMonitor.tsx:4230, 4334; tranches.ts:409 | — | — | `monitor-txn-in` (10282), `monitor-txn-out` (10359) |
| F33 | Date range and FY/quarter presets | control | Both records filtered by date before rollup | PortfolioMonitor.tsx:4270-4282, 4309, 4351-4352 | — | — | **none** (no route walks a preset) |
| F34 | Sort Recent / Largest | control | Recent: newest last date first. Largest: max(Capital in, Bought + Sold) | txnSort.ts:86; txnLedger.ts:229 | — | — | 9317, 9343 |
| F35 | Capital drill-down: Date · Type · Bought · Sold · Units · Security bought | expanded account row | Each `BOOK_CAPITAL_MOVES` row in view. "Bought" = in amount, "Sold" = out amount (`?? 0`) | PortfolioMonitor.tsx:4745-4783 | `BOOK_CAPITAL_MOVES` | statement | `monitor-txn-out` opens rows (10359) |
| F36 | Dealt drill-down, instrument line: name, "N units net", Trades, Bought, Sold, Net, Realized, Traded between, "staggered · N days" pill | expanded row | Per security (mandate rows) or per security and side (security rows). Net units = qtyBought − qtySold. Net = bought − sold | PortfolioMonitor.tsx:4069 `DealtInside`; txnRollup.ts:214-227 | tape | statement | `monitor-txn-drill` (11053) |
| F37 | Tranche line "date · Buy/Sell · qty @ price", amount under Bought/Sold, Realized, account | expanded instrument | `Txn.qty`, `Txn.price` (= `unitPrice` ?? amount ÷ qty), `Txn.amount`, `Txn.realized` / `realizedNote` | PortfolioMonitor.tsx:4141-4163; ledger.ts:378-405 | tape | statement | `monitor-txn-drill` (≥1 tranche per trading day) |
| F38 | Absence reasons (NO_CAPITAL_WHY, NO_TRADES_WHY, per-cell reasons) | many cells | Fixed sentences chosen by branch | PortfolioMonitor.tsx:4045-4049 and cells | — | — | 9255 (footer only) |

### Portfolio Monitor — security axis, and the Excel export

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source | Basis | Existing guard |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I01 | Qty (row) | monitor?group=security · Qty cell | Σ quantity of the security's deduped lots, all accounts | PortfolioMonitor.tsx:1151 consolidated row build | BOOK_POSITIONS.quantity | statement; consolidated | check:pages monitor-security (shape only) |
| I02 | Avg cost (row) | · Avg cost cell | Σ costBasis (sumOrNull) ÷ Σ quantity of ALL lots | :1150-1152, :1185 | costBasis, quantity | statement; consolidated | none |
| I03 | Invested (row) | · Invested cell | Σ costBasis of lots that report one; bare "—" if none do | :1150, :3141-3147 | costBasis | statement | none |
| I04 | Invested on (row) | · Invested on cell | first dated contribution / lot date of the deduped lots | `investedOnOf` :210 | heldSince, BOOK_POSITION_TRANCHES | statement | check:pages invested-on coverage |
| I05 | CMP (row) + ◦ hover | · CMP cell | the FIRST lot's `currentPrice` (AMFI NAV if navPriced; live quote if feed); hover names `portfolio.asOf` | :1186, :3180-3192 | currentPrice / fundNavs / quotes | statement or NAV or live | none on this axis (stock page has stock-cmp-split) |
| I06 | Day (row) | · Day cell | live day % of the row; dash with reason otherwise | :3193-3205 | quote feed | live | check:pages cio-live (other page) |
| I07 | Direct + PMS (row) | · Direct+PMS cell | Σ market value of deduped lots; AbsentCell on derived-only rows | :1147, :3206-3216 | marketValue | statement+NAV (+live) | "Total exposure is Direct + PMS plus Via funds…" |
| I08 | Via funds (row) | · Via funds cell | Σ over held funds of fund holding value × pctAum/100 for every disclosed line of the issuer | lookthrough.ts:711-936 `loadStockExposure`; PortfolioMonitor.tsx:1296-1313 | public/lookthrough/*.json; fund MV (NAV) | derived; disclosure dated 2026-08-31, fund NAV 2026-09-22 | "the Via funds footer … ties to its column"; stockExposure.test.ts |
| I09 | Total exposure (row) | · Total exposure cell | Direct+PMS + Via funds | :1303 | I07+I08 | mixed measured/derived | "Total exposure is Direct + PMS plus Via funds, on the footer and on every row" |
| I10 | Weight (row) + popover | · Weight cell | Total exposure ÷ weight base (₹713.2879 Cr) | :1312, :911-913, :3226-3237 | I09, weightBase | NAV basis | "Weight is total exposure over the whole book…" |
| I11 | Unreal. P&L (row) | · Unreal. P&L cell | row MV − row cost (where any lot reports a cost) | :1153, :3238-3250 | I07, I03 | statement | none at row level |
| I12 | Realised P&L (row) | · Realised cell | `loadSales` tape-attributed realised for the row's securityKey | :739-742, :3257-3265 | public/audit capital-gain lots + tape | statement, dated | none on this axis |
| I13 | Return (row) | · Return cell(s) | `measuredReturn`: HPR = P&L ÷ cost; CAGR if lot-dated ≥1y | analytics.ts `measuredReturn` ~1210; :3266+ | I11, I03, heldSince | statement | check:pages monitor-cagr / -returns-* |
| I14 | Sector (row) | · Sector cell; `?sector=` filter | first lot's `Position.sector` (statement tier only); "" on derived rows | :1182, :1341, :874 | Position.sector | statement | check:pages monitor-sector (filter works) |
| I15 | Entities (row) | · Entities pill | distinct owners of the row's accounts | :1184 | ownerOf | per-account | "…clubbed rows" counts |
| I16 | Derived-only row (via/total/weight) | · 530 rows with Direct+PMS "—" | via = total = issuer's derived sum; weight = total ÷ base | :1326-1376 | look-through | derived | "a company held only inside a fund renders its measured cells absent, never zero" (checks the Direct+PMS reason only) |
| I17 | Footer "Total · 701 rows" + hover | · footer label | row count; hover names the 6 specks (₹840.99) dropped | :3401-3406 | droppedHoldings | — | check:pages smallDropped checks |
| I18 | Footer Invested ₹114.2 Cr + popover | · footer | Σ costBasis over deduped company-share lots | :1456, :3409 | costBasis | statement | none (popover text unchecked) |
| I19 | Footer Invested on "3 of 701 dated" | · footer | count of rows with investedOn ÷ all rows | :3417-3423 | I04 | — | check:pages coverage |
| I20 | Footer Day (live "+10.00%", hover "+₹15.6 Cr") | · footer | Σ dayChange ÷ Σ prev value over live-priced rows | :3427-3432 | quotes | live | cio-live (other page) |
| I21 | Footer Direct + PMS ₹222 Cr + popover | · footer | consolidatedMarketValue(company shares) | :935, :3435-3439 | marketValue | NAV basis | "the Direct + PMS footer is the book's own stock total…" |
| I22 | Footer Via funds ₹92.9 Cr | · footer | Σ rows' via funds | :3447-3455 | I08 | derived | "the Via funds footer…" |
| I23 | Footer Total exposure ₹314.9 Cr + five-bucket hover | · footer | Σ rows' total exposure; hover = partition | :3456+, stockCoverage :1625-1645 | I09, partition | mixed | "…the five buckets rebuild NAV" (±0.5 Cr) |
| I24 | Footer Weight 44.1% + hover | · footer | Σ total exposure ÷ weight base | :3505-3513 | I10 | NAV | "Weight is total exposure over the whole book, and the footer says so" |
| I25 | Footer Unreal. P&L +₹13.9 Cr + popover | · footer | Σ unrealizedPnL of deduped costed lots | :1457, :3526-3529 | unrealizedPnL | statement | none |
| I26 | Footer Realised +₹1.39 Cr | · footer | Σ realised over the union of rows' `realizedKeys` | `realisedSplit` :1727-1751, :3547-3556 | loadSales | statement | none |
| I27 | Footer Return +12.19% + popover | · footer | footer P&L ÷ footer Invested | :1592, :3567-3583 | I25, I18 | statement | none |
| I28 | Fold: five buckets + counts | · `<details data-stock-coverage>` | measured ₹222 · derived ₹92.9 · opaque ₹353.5 ("11 AIF folios" ₹352.3) · unaccounted ₹33.3 · cash ₹11.6; "15 of your 27 fund holdings"; "116 of 701 rows" | stockCoverage :1625-1690; fold :3643-3715 | look-through, book | NAV | "the page states what it covers… five buckets rebuild NAV"; "the AIF block is named…" |
| I29 | Expanded-row lead sentence | · venue lead row | "{name} — {Direct+PMS}, {row weight}% of the book, held ₹X through …" | :2169-2186 | I07, I10 | mixed | check:pages monitor-security-drill (regex on "held ₹… through" only) |
| I30 | Venue lines (per statement) | · expanded child rows | each statement's own qty, cost, mark, MV; Weight = line MV ÷ base | `venuesOf` :3840-3900; :2203-2254 | positions (raw) | per-account, as printed | monitor-security-drill venue counts |
| I31 | Counted-once adjust line | · expanded rows | printed Σ − consolidated | :2262-2280 | dedupeGroup | — | venue identity checks |
| I32 | Fund look-through card | · FundExposure inside a row | per fund: holding value, fund's weight, derived share, disclosed date; instrument breakout; caption "Read across N of M…, Your N AIF folios (₹X)" | FundExposure.tsx:136-230 | look-through | derived | check:pages stock-mf-lookthrough |
| X01 | Security | Excel · Holdings | displaySecurity label | exportPortfolioExcel.ts:136 | security | — | portfolioExcel.test.ts (column types) |
| X02 | Qty | Excel | Σ qty per (security × bucket × mandate account) | :133 | quantity | — | portfolioExcel.test.ts |
| X03 | Avg Cost (₹) | Excel | cost ÷ qty where the group reports a cost | :132, :158 | costBasis | statement | same |
| X04 | CMP (₹) | Excel | the group's FIRST position's currentPrice | :158 | currentPrice/NAV/live | page basis | none |
| X05 | Market Value (₹) | Excel | Σ MV (dedupe across whole security, split per bucket/mandate) | :128 | marketValue | page basis | footer = BOOK_SUMMARY.totalValue (on STATEMENT basis only) |
| X06 | Weight of book | Excel | row MV ÷ consolidatedMarketValue(all positions) × 100 | :91, :159 | MV | page basis | none |
| X07 | Unreal. P&L (₹) | Excel | MV − cost (null if no cost) | :162 | costBasis | statement | test (number or dash) |
| X08 | Return | Excel | (MV − cost) ÷ cost × 100, always cumulative on cost | :163 | — | statement | none |
| X09 | YTD | Excel | holdingYtd since-open only (dash on all 355 rows here) | :174-181 | heldSince | — | none |
| X10 | Class · Held via · Mandate · Asset Class (family) · Basket (family) · Sector · Entities | Excel | descriptors via holdingBucket / ROUTE_LABEL / familyTaxonomy / ps[0].sector / owners | :136-152 | book + familyTaxonomy | — | test (non-numeric; not constant) |
| X11 | Footer "Total · 355 holdings", MV Σ, P&L Σ | Excel | Σ rows | ~:392-440 | X05, X07 | page basis | portfolioExcel.test.ts (statement basis) |
| X12 | Footer note | Excel | P&L coverage count/value; providers of rows with no cost | ~:440-471 | costNone, sources | — | none |
| X13 | Subtitle | Excel row 2 | "… values in INR · exported <today>" | :361-363 | new Date() | — | none |
| X14 | Transactions sheet (Date, Security, Type, Qty, Price, Amount, Realized, Entity) | Excel · Transactions | manager's tape rows; qty `Math.round`; title "full dated buy/sell tape" | :474-505; handler PortfolioMonitor.tsx:2322-2336 | loadTransactions | statement, dated | none |

### Private Market

Code paths: `PM` = `src/pages/PrivateMarket.tsx`; `pB` = `src/lib/privateBook.ts`; `pMk` = `src/lib/privateMarket.ts`;
`cC` = `src/lib/capitalCalls.ts`; `fR` = `src/lib/fundReturns.ts`; `ST` = `src/components/SelectableTiles.tsx`;
`CP` = `scripts/check-pages.mjs` (invariant quoted by its label). The model `m` is `PM:331–437 useMemo`.

##### Tiles (SelectableTiles catalogue, `PM:492–656 tileMetrics`)

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| PM-I00 | Which tiles show | `/private-market` tile strip; `?tiles=` | `?tiles=` list wins, else `localStorage glow:pmTiles:v1`, else defaults `value,cost,pnl,uncalled`; unknown and duplicate ids dropped; empty list falls back to default | `ST:86–101 ids`, `PM:52,1216` | — | per browser | `private-market-tiles` route, TILE_PICKER_CHECKS |
| PM-I01 | Market value ₹10.6 Cr | tile `value` | Σ market value of the private holdings, each `dedupeGroup` once | `PM:494 tileMetrics`, `pMk:238 fundRollup`, `pMk:105 privateScope` | `BOOK_POSITIONS.marketValue` where `marketSide==="private"` | statement; consolidated; mixed dates 31 Mar–31 Jul 2026 | CP PM-2 "the private tile is the book's private side…"; `privateMarket.test.ts` (= `BOOK_SUMMARY.privateValue`) |
| PM-I01a | "1.5% of the ₹710.4 Cr book" (sub) / "₹10.6 Cr ÷ ₹710.4 Cr = 1.49% … Across this page's 15 private accounts" (hover) | tile `value` sub & title | private MV ÷ `consolidatedMarketValue(statementPortfolio.positions)` | `PM:388 bookMV`, `PM:496–498` | `BOOK_POSITIONS` | statement (not the ₹713.3 Cr the top bar shows) | CP "the private value tile names how many accounts it spans" |
| PM-I02 | Capital invested ₹8.76 Cr; hover "4 of 4 folio rows report one" | tile `cost` | Σ `costBasis` of the deduped private holdings (sumOrNull) | `PM:500–505` | `BOOK_POSITIONS.costBasis` | statement; consolidated | CP PM-3 |
| PM-I03 | Unrealised P&L +₹1.85 Cr; "+21.2% on cost"; hover "covering ₹10.6 Cr of the ₹10.6 Cr" | tile `pnl` | Σ (MV − cost) over costed rows; ÷ cost | `PM:506–513` | `BOOK_POSITIONS.unrealizedPnL` | statement; consolidated | CP PM-3 |
| PM-I04 | Still to call ₹16 Cr; hover "Across 11 capital accounts… the 4 in public-market funds are not counted… a floor" | tile `uncalled` | Σ printed undrawn over the on-page capital accounts | `PM:520–538`, `pMk:364 commitmentTotals`, `pMk:184 capitalScope` | `BOOK_COMMITMENTS.undrawn` | per capital account, each own date | CP PM-4, PM-4b, PM-4c |
| PM-I05 | Committed ₹42.7 Cr; hover "11 of 11 … 4 more, in public-market funds, are not counted" | tile `committed` | Σ committed | `PM:544–552` | `BOOK_COMMITMENTS.committed` | per capital account | CP PM-4g |
| PM-I06 | Called ₹26.8 Cr; hover "11 of 11 capital accounts print a called line. Paid in covers the same accounts." | tile `called` | Σ called | `PM:553–561`, `cC:169 callTotals` | `BOOK_COMMITMENTS.called` | per capital account | CP PM-4g; "the two tiles a reader would subtract say not to…" |
| PM-I07 | Paid in ₹26.8 Cr | tile `paid` | Σ paid | `PM:562–567` | `BOOK_COMMITMENTS.paid` | per capital account | CP PM-4g |
| PM-I08 | Due now ₹0; "1 of 11 accounts print this line" | tile `due` | Σ pending over accounts printing it | `PM:568–575` | `BOOK_COMMITMENTS.pending` (Neo "Pending Drawdown ₹0") | measured nil | CP PM-4e |
| PM-I09 | Never valued ₹18.2 Cr; "7 folios in funds that publish no NAV" | tile `unvalued` | Σ drawn of the private accounts with no valued holding | `PM:580–584`, `pMk:445 unvaluedAccounts`, `pMk:472 unvaluedDrawn` | `BOOK_COMMITMENTS.drawn` (India SME ×3, Sky ×4) | per account | CP PM-5 |
| PM-I10 | Distributions ₹49.9 L "Cash paid back so far"; "4 of 11 … have a distribution total" | tile `distributed` | Σ `distributionOf` (printed distributed, else income + capital payouts; equalisation excluded) | `PM:588–593`, `pMk:400 distributionOf` | Neo Total Payout ₹49,48,221 + Baring income ₹37,252 + TV ×2 ₹0 | statement dates (Neo statement 31 Jul, value 30 Jun) | CP "the distributions tile says what it is…" (wording only) |
| PM-I11 | Realised gain — | tile `realised` | absent, reason | `PM:598–603` | none | — | CP "the realised-gain and forward-schedule absences survive it" |
| PM-I12 | TVPI / DPI —; "Only 4 of 11 … the other 7" | tile `multiple` | absent, reason | `PM:604–609` | — | — | none numeric |
| PM-I13 | Funds 4 "Distinct funds held" | tile `funds` | count of VALUED private funds | `PM:610–615` | `fundRollup` | consolidated | none |
| PM-I14 | Folios 6 "Statement lines"; "2 more than the fund count" | tile `folios` | count of valued private statement lines | `PM:616–621` | `folioRows` | printed | none |
| PM-I15 | Owners 5 | tile `owners` | distinct owners of valued private rows | `PM:622–627` | `ownerRollup` | printed | none |
| PM-I16 | Capital accounts 11; "11 of this page's 15 private accounts send one · 4 more, in public-market funds, are not counted" | tile `accounts` | count of on-page capital accounts | `PM:628–641` | `BOOK_COMMITMENTS` ∩ capitalScope | — | CP "the capital-account counts partition rather than crossing two sets" |
| PM-I17 | Capital calls 44 | tile `calls` | count of dated calls | `PM:642–647`, `cC:169` | `BOOK_COMMITMENTS[].calls` | dated | CP PM-4f |
| PM-I18 | Value as printed ₹13.8 Cr; "Includes ₹3.17 Cr double count" | tile `raw` | Σ MV of every private statement row; − consolidated | `PM:650–655`, `pMk:105 doubleCounted` | `BOOK_POSITIONS` | printed | CP PM-1 |

##### Page text

| ID | Figure | Where | Formula | Code | Source | Basis | Guard |
|---|---|---|---|---|---|---|---|
| PM-I19 | "Marks span 31 Mar 2026 → 31 Jul 2026" | page subtitle | min/max as-of of the valued private rows | `PM` header | account `asOf` | statement | CP PM-7 |
| PM-I20 | Working line: "₹16 Cr over the 11 accounts that print the line"; "committed ₹42.7 Cr less called ₹26.8 Cr is ₹16 Cr, both struck over the same 11 accounts"; "11 of this page's 15 private accounts send a capital-account statement" | "How the capital totals are worked out" | printed undrawn sum; committedWhereCalled − called | `PM:1367–1415`, `cC:169` | `BOOK_COMMITMENTS` | per account | CP PM-4b, PM-4c |
| PM-I21 | Sides line "Listed ₹699.8 Cr · Private ₹10.6 Cr · Not placed ₹98,742 · Total ₹710.4 Cr" | under table | `marketSides` over `currentHoldings(statementPortfolio)` | `PM:1417–1422`, `pMk:155 pageScopeNote` | `BOOK_POSITIONS.marketSide` | statement; consolidated | CP PRIVATE_SIDES_CHECK; `marketSide.test.ts` |
| PM-I22 | "4 more capital accounts belong to public-market funds — Carnelian Bharat Amritkaal, Motilal Oswal Delphi Equity, Motilal Oswal Founders, ₹55 Cr committed" | under table | capitalScope().elsewhere | `PM:1423–1457`, `pMk:184` | `BOOK_COMMITMENTS` + `FAMILY_MARKET_SIDE` | — | CP "…and the public-market capital accounts are named, each once, never counted"; "the one clause naming them…" |

##### Master table (By fund default; `PM:843–956 figureCells`, rows `PM:987–1175`, model `pB:245 bookFolios`, `pB:361 figuresOf`, `pB:425 privateBook`)

| ID | Figure | Where | Formula | Code | Source | Basis | Guard |
|---|---|---|---|---|---|---|---|
| PM-I23 | Committed / Called / Paid in / Still to call (fund row) e.g. Neo ₹5 Cr/₹5 Cr/₹5 Cr/₹0✓; TV ₹3 Cr/₹1.5 Cr/₹1.5 Cr/₹1.5 Cr✓; 360 ONE — | fund rows | Σ over the row's folios' capital accounts — **never deduped** | `pB:361 figuresOf` (caps) | `BOOK_COMMITMENTS` | per account (capital) | CP PM-4f "every capital account is on one folio row"; `privateBook.test.ts` |
| PM-I24 | ✓ beside Still to call | fund & folio rows | statement's own committed − called = printed undrawn | `cC:93 schemeCalls uncalledTies` | statement | — | CP PM-4b |
| PM-I25 | Units (fund row) | fund rows | Σ units of the counted (deduped) holdings, one fund only | `pB:384` | `BOOK_POSITIONS.quantity` | consolidated | PM_TABLE_CHECKS |
| PM-I26 | Cost "of units held" (fund row) | fund rows | Σ costBasis of counted holdings | `pB:365` | `BOOK_POSITIONS.costBasis` | consolidated | CP PM-3, PM-8 |
| PM-I27 | Value "fund's mark" | fund rows | Σ MV of counted holdings | `pB:366` | `BOOK_POSITIONS.marketValue` | consolidated; each fund's own date | CP PM-2 |
| PM-I28 | Return — methodology (auto) per fund: Neo XIRR +16.7%, Baring XIRR −6.4%, TV HPR +128.6%, 360 ONE HPR +48.7% | fund rows, `ret:auto` | >1 call or payouts → XIRR over calls, payouts ≤ valuation, value; one call <1 y → HPR; ≥1 y & nil payouts → CAGR; no record → HPR | `fR:258 fundMeasuredReturn`, `fR:123 fundDatedRecords`, `fR:365 xirrOf` | `BOOK_COMMITMENTS.calls/payouts`, value | consolidated (fund record over deduped folios) | CP PM_RETURN_CHECKS ("each XIRR is the money-weighted rate…", "the methodology picks the measure…"); `fundReturns.test.ts` |
| PM-I29 | Return — HPR / CAGR / XIRR / YTD / CY columns (`?ret=`) | fund & folio rows | HPR = value ÷ cost − 1; CAGR only one call ≥1 y; XIRR as above (sub-year → HPR tagged); YTD/CY refused (no 1 Jan / year-end valuation) | `fR:258–362` | as above | consolidated / folio | CP PM_RETURN_CHECKS; `private-market-returns` route |
| PM-I30 | Return column header notes: HPR "4 of 4", CAGR "0 annualised of 4", XIRR "2 money-weighted of 4", YTD/CY "0 of 4" + hints | column heads | counts over the valued fund rows | `fR:414 fundReturnColumnMeta`, `fR:451 PM_RETURN_HINTS` | — | — | CP PM_RETURN_CHECKS (header counts) |
| PM-I31 | Weight "of private" (fund row) Neo 52.3 / Baring 17.7 / TV 16.2 / 360 ONE 13.8 | fund rows | row value ÷ consolidated private value | `PM:1033` | — | consolidated | PM_TABLE_CHECKS |
| PM-I32 | As of (+ "122d behind") | fund/folio rows | set of the folios' as-of dates; staleness vs newest on-page capital account if >31 d | `pB:394`, `PM:906`, `cC:93 staleDays` | account `asOf` | — | CP PM-7 |
| PM-I33 | Capital call column (header "not available" in dumps) | every fund-level row | family-entered calls from KV `GLOW_STORE` | `src/components/EnteredCalls.tsx`, `src/lib/enteredCalls.ts` | KV (never a statement figure) | — | `private-market-calls`, `-calls-off` routes; `enteredCalls.test.ts` |
| PM-I34 | Fund row sub-line: category · N folios · N calls · "reported twice · counted once" / "no NAV published" / "income-only folios" | fund rows | category from `providerEngagement` / name; overlap flag | `PM:960–975`, `pB:212 accountCategory` | account text | — | partial (PRIVATE_SCOPE_CHECKS) |
| PM-I35 | Folio (child) rows: same 12 columns, AS PRINTED; e.g. TVC262 ₹1.5 Cr/₹75 L/₹75 L/₹75 L, 7,500, ₹75 L, ₹1.71 Cr, HPR +128.6%, 16.2% | expanded rows | one account's statement; return via `fundMeasuredReturn` on its own record | `PM:1040–1085`, `PM:750 folioRet` | per statement | per account | CP "every private fund opens onto exactly the statements…"; PM_EXPANDED_CHECKS |
| PM-I36 | "Counted once" adjust rows: TV −7,500 / −₹75 L / −₹1.71 Cr / −16.2%; 360 ONE −9,90,429.684 / −₹98.7 L / −₹1.46 Cr / −13.7% (capital columns blank) | under TV and 360 ONE | printed − consolidated | `pB:401 overlapOf`, `PM:1095–1115` | — | — | CP PM-1 |
| PM-I37 | Section band "Private funds · 4 funds · 6 folios": ₹13 Cr / ₹8.53 Cr / ₹8.53 Cr / ₹4.48 Cr / — / ₹8.76 Cr / ₹10.6 Cr / HPR +21.2% / 100.0% / 31 Mar→31 Jul | band | figuresOf over the section's folios (consolidated) + `aggRet` | `PM:1125–1150`, `PM:763 aggRet` | as above | consolidated holding; capital not deduped | CP "the bands add up: the two sections make the one total…" |
| PM-I38 | Section band "Not valued · missing data · 3 funds · 9 folios · ₹18.2 Cr paid in is in no value total": ₹29.7 / ₹18.2 / ₹18.2 / ₹11.5 Cr; value — | band (closed by default) | figuresOf over unvalued folios | same | `BOOK_COMMITMENTS` | per account | CP "the section of accounts nothing values is marked 'missing data', and holds exactly those accounts" |
| PM-I39 | "Private market total · each holding counted once · 11 capital accounts": ₹42.7 / ₹26.8 / ₹26.8 / ₹16 Cr / — / ₹8.76 Cr / ₹10.6 Cr / HPR +21.2% (XIRR +21.1% · 3 of 4 under `?ret=xirr`) / 100.0% | foot row | figuresOf(all, consolidated) + pooled XIRR | `PM:1156–1175`, `fR:216 pooledFundXirr` | as above | consolidated | CP PM_RETURN_CHECKS ("the XIRR footer pools exactly the funds…"), bands check |
| PM-I40 | By owner member rows (e.g. Ajay ₹5 Cr/₹5 Cr/₹5 Cr/₹0✓ · cost ₹5.99 Cr · value ₹7.02 Cr · HPR +17.2% · 66.1%) | `?view=owners` | printed per member; aggRet(member) | `pB:425 privateBook("owner")`, `PM:747 groupRet` | as above | per account (printed) | CP PM-6 "the member rows add to the printed total…" |
| PM-I41 | By owner band: cost ₹10.5 Cr, value ₹13.8 Cr, HPR +31.3%, weight 129.9%, XIRR +30.1% · 4 of 6; section "Counted once" −₹1.74 Cr / −₹3.17 Cr / −29.9% | owner Private funds band | printed; overlap line | `pB:401`, `PM:1095` | — | printed | CP PM-6 |
| PM-I42 | Transactions tab: 44 rows (date, fund, member, type, amount), newest first; footer "Total · 44 calls ₹26.8 Cr"; tab chip "Transactions 44" | `?view=transactions` | every dated call of on-page capital accounts | `cC:196 callHistory` | `BOOK_COMMITMENTS[].calls` | dated | CP "the call history holds every call in the register…", "the calls read newest first, and add to their own footer" |

##### Cross-check surfaces read for this audit

| ID | Figure | Where | Agrees with PM? |
|---|---|---|---|
| PM-I43 | Uncalled capital ₹16 Cr; Distributions ₹49.9 L (KPI tiles) | `/cio` | yes |
| PM-I44 | Capital deployment: Fund commitments ₹42.7 Cr · Called ₹26.8 Cr · Undrawn ₹16 Cr · Distributions ₹49.9 L · 62.6% / 37.4% | `/cio?tab=allocation` | yes |
| PM-I45 | Concentration "Listed / Private / Not placed 99 / 1 / 0" | `/cio?tab=allocation` | integer rounding of 1.49% (PM-D4) |
| PM-I46 | Private facet ₹10.6 Cr, "1.5% of the ₹713.3 Cr book", 4 holdings, sections; "Held, and valued by no statement: 10 AIF folios…" | `/holdings?of=book&facet=private` | value yes; book denominator no (PM-B1); unvalued list no (PM-B3) |
| PM-I47 | Monitor AIF rows: Neo 4,85,837 · avg ₹102.92 · ₹5 Cr · ₹5.55 Cr · HPR +11.00%; Baring 203 · ₹2.03 Cr · ₹1.88 Cr; TV 7,500 · ₹75 L · ₹1.71 Cr · "2 entities"; 360 ONE ₹98.7 L · ₹1.47 Cr | `/monitor` | yes (same book) — and carries PM-A3's avg-cost symptom |

---

### Family & Entities, and Sector Composition

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| I-1 | Entity NAV (₹349.4 / 168.8 / 128.8 / 66 / 1.71 / 1.71 Cr) | /family · Entity breakdown · NAV | Σ marketValue of every position whose account the registry gives to that owner; not deduped | FamilyEntities.tsx:175 `byEntity` → analytics.ts:898, 864 `bucketBy` | BOOK_POSITIONS.marketValue (+ AMFI NAV overlay), BOOK_ACCOUNTS.owner | statement + AMFI NAV 22 Sep; per-owner (raw); blend of 51 account dates | family: "table is ranked by value"; no value check |
| I-2 | Entity weight (48.8% …) | /family · Weight + popover | entity NAV ÷ Σ raw NAV of all entities (bucketBy's own total); popover divides by consolidated ₹713.3 Cr | FamilyEntities.tsx:707 `weightFormula(e.mv, totalMV, …, WEIGHT_OF)`; analytics.ts:891 | as I-1 | per-owner numerator, raw denominator (popover says consolidated) | none |
| I-3 | Positions (177 / 112 / 7 / 73 / 1 / 1) | /family · Positions | count of statement rows per owner, incl. redeemed and sub-₹1,000 rows | analytics.ts:872 `bucketBy` count | BOOK_POSITIONS | per-owner raw; no `currentHoldings` | none |
| I-4 | Unreal. P&L (+₹31.4 Cr …) + popover | /family · Unreal. P&L | Σ unrealizedPnL over rows that report a cost (`sumOrNull`) | analytics.ts:880; FamilyEntities.tsx:709 `pnlFormula(e.mv, e.cost, e.pnl)` | BOOK_POSITIONS.unrealizedPnL, costBasis | per-owner; costed subset only | none |
| I-5 | Return (+12.34% …) + popover | /family · Return | Σ P&L ÷ Σ cost over the costed rows; popover prints (NAV − cost) ÷ cost | analytics.ts:890; FamilyEntities.tsx:710 `returnFormula(e.mv, e.cost, e.returnPct)` | as I-4 | per-owner; costed subset | family: "no 4-digit %" only |
| I-6 | Return (to date) (+25.91%, +28.68%, — ×4) | /family · Return (to date) | pooled XIRR over the owner's accounts carrying an "Opening portfolio value" flow, each closing on its own as-of, de-annualised over earliest flow → latest measured as-of | returns.ts:65 `ownerMeasuredReturn`; FamilyEntities.tsx:690 | BOOK_ACCOUNT_CASH_FLOWS, account market value | statement; 4 (Ajay) / 3 (Ankita) accounts; 134 days | family: "no 4-digit %" |
| I-7 | Return (to date) hover (+87.30% p.a., covers ₹90.1 of ₹349.4 Cr, excluded accounts) | /family · Return (to date) cell title | annualised XIRR; measured MV of total MV; list of excluded account numbers | FamilyEntities.tsx:711-715 | as I-6 | as I-6 | none |
| I-8 | YTD (— on every row) | /family · YTD | Simple Dietz on `entityNavHistory` (never populated) | returns.ts:96 `entityYtdPct` | — | always absent | none |
| I-9 | "Held through N platforms: …" | /family · Entity cell hover | distinct custody labels over the owner's raw rows | FamilyEntities.tsx:223-235 `custodyNote` | BOOK_ACCOUNTS.provider/engagement | raw incl. closed rows | family: "platforms … entity cell's own hover" (presence only) |
| I-10 | Custody pie + legend (Direct / In-house ₹221.3 Cr … 3P ₹0) | /family · In-house vs external | Σ marketValue by `custodyLabelOf` over the deduped set | FamilyEntities.tsx:208-209 `byCustodian(dedupedPositions(p))` | BOOK_POSITIONS, BOOK_ACCOUNTS | consolidated; incl. redeemed | family: "custody pie still drawn" |
| I-11 | Split line "In-house 31% · ₹221.3 Cr · 7 of 12 accounts \| External 69% · ₹492 Cr · 17 custodians" | /family · custody card subtitle | in-house MV ÷ consolidated book; accounts with an in-house row / in-house accounts in registry; count of non-direct custody labels | FamilyEntities.tsx:266-312 | as I-10 | consolidated | family: "split states the denominator", "custody split … on the card" |
| I-12 | Split working hover | /family · subtitle title | the two divisions, denominator named | FamilyEntities.tsx:310-312 `splitWorking` | as I-10 | consolidated | as I-11 |
| I-13 | In-house note (₹127.4 Cr not shares: MF ₹102.8 Cr, ETF ₹24.6 Cr, AIF ₹98,742; Direct Equity ₹94.9 Cr incl. ₹98.6 L via LKP; "other 5 in-house accounts") | /family · Direct / In-house legend row title | `excludedClasses` over in-house rows by assetClass; Direct Equity bucket; registry count | FamilyEntities.tsx:287, 322-334 | as I-10 | consolidated; assetClass axis | family: "in-house row says custody is not Direct Equity" |
| I-14 | "6 entities" pill | /family · header | count of owners with positions | FamilyEntities.tsx | BOOK_ACCOUNTS | — | none |
| I-15 | Basis pill "STATEMENT · as of 2026-08-29", "49 accounts behind" + hover (164 notLive, 49 unpriceable, stale list) | /family, /sectors · header | basis = LIVE iff any position live; unpriceable = securities with no NSE symbol | BasisPill.tsx:37-70; PortfolioContext.tsx:386-405 | portfolio.asOf, BOOK_ACCOUNTS.asOf | STATEMENT label although fund NAVs are 22 Sep | none on these pages |
| I-16 | Sector-mix header "Company shares only — N of M positions · ₹X of ₹Y NAV" | /family?entity · sector mix subtitle | company-share rows / all rows of the owner; their MV / owner NAV | FamilyEntities.tsx:797 | BOOK_POSITIONS | per-owner raw | family-entity: "sector mix names what it excluded" |
| I-17 | Sector-mix bars (per sector ₹) | /family?entity · bar chart | Σ MV of the owner's company shares by the three-tier sector | FamilyEntities.tsx:153-156 `companySectorIndex`, :383 `bucketBy(selShares, sectorOf)` | BOOK_POSITIONS + lookthrough + screenerSectors | per-owner | family-entity: "Unclassified is not the largest bar", "Sector cell reads the same answer" |
| I-18 | Sector source strip (85 / 9 / 46 / 7 unplaced ₹13.9 Cr …) | /family?entity · under chart | distinct company keys by the tier that placed them; unplaced count and MV | FamilyEntities.tsx:391-403 | as I-17 | per-owner | family-entity: three-tier checks |
| I-19 | "₹X Cr of these shares were chosen by a discretionary manager" | /family?entity · sector mix caption | Σ MV of company shares in PMS accounts | FamilyEntities.tsx:407-408 | as I-16 | per-owner | none |
| I-20 | Excluded caption ("₹46 Cr across 18 positions … MF ₹24.1 Cr, AIF ₹21 Cr, Cash ₹49 L, ETF ₹38.3 L … All of them are in the holdings table below") + sleeve note | /family?entity · sector mix caption | `excludedClasses` by assetClass; mandate-held non-share rows | FamilyEntities.tsx:405, 427-444 | BOOK_POSITIONS.assetClass | per-owner | family-entity: "names what it excluded, with a value" |
| I-21 | Holdings table sections (DIRECT EQUITY · 11 holdings · ₹9.79 Cr …), rows (Held via, Sector, Market value, Return) | /family?entity · holdings table | `holdingBucket` sections with count and subtotal; per-row return on cost | FamilyEntities.tsx:446-580 | BOOK_POSITIONS | per-owner raw; incl. redeemed and specks | family-entity: section / mandate checks |
| I-22 | Holdings footer "TOTAL N positions … the return covers ₹X of ₹Y, struck on ₹C of cost — the other K rows, carrying ₹U, report no cost" | /family?entity · table footer | Σ MV, Σ P&L ÷ Σ cost over costed rows, coverage named | FamilyEntities.tsx:970-995 | BOOK_POSITIONS | per-owner | family-entity (footer ties to sections) |
| I-23 | "held, and not valued here" card: per-account "₹X paid in" / — + reason; count in subtitle | /family?entity · foot card | accounts of the owner with no position; drawn from the account's commitment | FamilyEntities.tsx:1030-1060; accounts.ts `unvaluedHoldingsOf` | BOOK_COMMITMENTS.drawn, noPositionsReason | per-owner | family-entity: removal/presence checks only |
| I-24 | Total exposure ₹314.9 Cr | /sectors · donut hole | measured (current consolidated company shares) + derived (fund value × disclosed weight) | SectorComposition.tsx:219-258; lookthrough.ts:535 `companyExposure`, :711 `loadStockExposure` | BOOK_POSITIONS, public/lookthrough | consolidated; statement shares + AMFI-NAV fund values × 31 Jul / 31 Aug disclosures | sectors: "total, halves, count are the Monitor's security axis" |
| I-25 | "701 companies" + hover "Each counted once — a company two of the family's statements both report is one row here, never two" | /sectors · donut hole | number of `companyExposure` entries | SectorComposition.tsx:436-442 | as I-24 | consolidated | sectors: "count and basis are on the figure" (count = Monitor rows) |
| I-26 | Reported by their statements ₹222 Cr · 298 holdings · ₹127.1 Cr manager-chosen, ₹94.9 Cr own | /sectors · partition | Σ MV of current consolidated company shares, split by route | SectorComposition.tsx:219-238, 490-494 | BOOK_POSITIONS | consolidated statement | sectors: "reported + derived + not-on-page rebuilds the book" |
| I-27 | Derived from what their funds disclose ₹92.9 Cr · "15 of 27 funds" | /sectors · partition | Σ derived exposure over funds with a disclosure | SectorComposition.tsx:495-503 | public/lookthrough | derived; NAV 22 Sep × disclosure 31 Jul / 31 Aug | sectors: "derived half says it is no part of NAV" |
| I-28 | Not on this page ₹398.4 Cr ("undisclosed vehicles, non-equity and cash") | /sectors · partition | book − measured − derived | SectorComposition.tsx:504-512 | as I-24 | consolidated | sectors: rebuilds the book |
| I-29 | Sector source (85 / 334 / 60 / 222 unplaced ₹24.7 Cr) + unplaced hover | /sectors · source line | entries by the tier that placed them | SectorComposition.tsx:455-475 | as I-24 | consolidated | sectors: `sectorSourceChecks` |
| I-30 | Sector table: Value, Weight, Companies, Return (—), Top holding | /sectors · Sector breakdown | Σ total exposure per sector; ÷ total exposure; entry count; return refused; largest entry by exposure | SectorComposition.tsx:141-183 `rollSectors`, :354-362, :760-805 | as I-24 | consolidated | sectors: return refusal, fund-wrapper check |
| I-31 | Unclassified row hover | /sectors · Unclassified row | fixed reason text | SectorComposition.tsx:51-55 `unclassifiedWhy` | — | — | sectors: "Unclassified row names its cause" |
| I-32 | "12 sectors" / "9 sectors" pill | /sectors · header | number of sector rows incl. Unclassified | SectorComposition.tsx:568 | — | — | none |
| I-33 | Direct Equity ₹94.9 Cr · 35 holdings; Bought by the family ₹94.9 Cr · 5 own accounts; Left out by this view ₹127.1 Cr · 263 shares · 10 mandates | /sectors?view=direct · donut + partition | own-route company shares; mandate-route company shares | SectorComposition.tsx:229-238, 515-530 | BOOK_POSITIONS | consolidated statement | sectors-direct: "Direct Equity bucket to the rupee", "names the mandate shares" |
| I-34 | Not a company share ₹491.3 Cr — AIF ₹352.3, Mutual Fund ₹102.8, ETF ₹24.6, Cash ₹11.6 Cr | /sectors?view=direct · partition | `excludedClasses` over current consolidated, by assetClass | SectorComposition.tsx:243, 533-542 | BOOK_POSITIONS.assetClass | consolidated | sectors-direct: reconstructs NAV, card ties to its list |
| I-35 | Direct sector table: Value, Weight (÷ ₹94.9 Cr), Positions, Return (gated), Top holding | /sectors?view=direct · table | as I-30 over own-route shares; return only where `costCoversSet` | SectorComposition.tsx:141-183 | BOOK_POSITIONS.costBasis | consolidated statement | sectors-direct: return gate checks |
| I-36 | Compare: Total exposure, Weight, Reported, Via funds, Companies, Largest company; Direct: Value, Weight of DE, Holdings, Cost reported (₹ · k of n), Return on cost, Largest holding | /sectors?view=compare · table | same roll-ups as I-30 / I-35 for the picked sectors | SectorComposition.tsx (compare branch) | as above | as above | sectors-compare: halves add, weights, DE inside own set |
| X-1 | Money-weighted return +30.1% "150 days" | /cio · KPI (cross-check) | pooled XIRR over the same 7 accounts, window to `portfolio.asOf` | MorningCIO.tsx:531, 770-778 | BOOK_ACCOUNT_CASH_FLOWS | statement; 150 days | cio checks (not this area) |
| X-2 | Sector column / `?sector=` filter | /monitor (all axes) · Sector (cross-check) | `Position.sector` (statement tier only) | PortfolioMonitor.tsx:829, 874, 1046, 1182, 1244 | BOOK_POSITIONS.sector | — | none |

### Polycab

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| PCI-01 | Shares `1,39,01,229` | `/polycab` · Holding · Shares cell | the depository's printed balance for the row; footer (≥2 rows) sums with `sumOrNull` | `src/pages/Polycab.tsx:149,380-382` `Polycab` | `BOOK_POLYCAB[].quantity` ← NSDL "Balance 13901229.000" | statement 31 Mar 2026, per demat | check-pages `polycab` "the demat rows account for every share in the book" (vs `FENCED.shares`); polycabLive.test "store's share count is the book's own" |
| PCI-02 | Mark `₹8,885` | `/polycab` · Mark (note "statement", hover `MARK_HOW`) | statement value ÷ statement units (NSDL prints no rate) | `Polycab.tsx:354,383-385` | `BOOK_POLYCAB.marketValue / quantity` | statement; NSDL "Prices as on 30-Mar-2026" | only the hover wording ("…the mark still says how it is derived"); value not reconciled |
| PCI-03 | Value `₹12,351.2 Cr` | `/polycab` · Value (note "statement") | the statement's printed value for the row | `Polycab.tsx:386` | `BOOK_POLYCAB.marketValue` = 1,23,51,24,19,665 | statement (30 Mar 2026 prices) | check-pages regex "named, with a share count and a market value" (shape only) |
| PCI-04 | Cost `—` | `/polycab` · Cost | absent: depository reports no cost | `Polycab.tsx:387-389` (`COST_WHY`) | `costBasis: null` | — | check-pages "cost renders absent with its reason, never as a zero" |
| PCI-05 | Pledged (this demat) `—` | `/polycab` · Pledged (note "this demat") | absent with `PLEDGE_WHY` | `Polycab.tsx:390` | none | — | check-pages "this demat's own pledge is a dash with its reason…" |
| PCI-06 | CMP `₹8,354` (note "last close · BSE") | `/polycab` · CMP | live `/api/polycab` LTP, else the committed `POLYCAB_LIVE.quote.ltp` | `Polycab.tsx:158-166,343,391-393`; `polycabLive.ts:55-92` `usePolycabQuote`/`effectiveQuote` | BSE `getScripHeaderData` LTP | live or stored close; **no date stored or shown** | check-pages "the mark renders from the committed store…" (presence + basis word); polycabLive.test `effectiveQuote` |
| PCI-07 | Day `-0.25%` | `/polycab` · Day | (LTP − previous close) ÷ previous close × 100 | `Polycab.tsx:394-398`; `shared/polycabSources.mjs:188-206` `parseQuote` | BSE LTP & PrevClose | same session as CMP; **no date** | polycabLive.test "day change is last-traded less previous close" + "reconciles with the printed change" |
| PCI-08 | Market value at CMP `₹11,613.1 Cr` | `/polycab` · Market value (note "at CMP") | statement shares × CMP | `Polycab.tsx:355,399-401`; `polycabLive.ts:176-178` `markedValue` | `BOOK_POLYCAB.quantity` (31 Mar 2026) × quote LTP (22 Sep 2026) | **blend of two dates, not stated** | polycabLive.test "the marked value is the share count at the mark" |
| PCI-09 | Holder / Demat account / As of | `/polycab` · first cells | account registry fields; hover = `providerEngagement` verbatim | `Polycab.tsx:366-379` | `BOOK_ACCOUNTS` (owner, provider, accountNo 49794950, asOf 2026-03-31) | statement | check-pages "every demat account … is named", "per-holder … Holder column" |
| PCI-10 | Holding footer (Total · N demats) | `/polycab` · tfoot | only when rows > 1; shares, value, MV at CMP | `Polycab.tsx:409-419` | as above | — | check-pages asserts footer ABSENT while 1 row, ties to rows when ≥2 |
| PCI-11 | "Ring-fenced · excluded from portfolio totals" | `/polycab` · header pill | text | `Polycab.tsx:279-286` | — | — | check-pages "states that the holding is excluded…" |
| PCI-12 | Ex-date (8 rows) | `?view=actions` · Ex-date | exchange ex-date | `Polycab.tsx:452-454`; `polycabSources.mjs:151-173` | BSE `DefaultData/w` | exchange | check-pages "the declared dividends render, every one the store carries" |
| PCI-13 | Action label | `?view=actions` · Action | purpose string minus the amount | `Polycab.tsx:455-459` | BSE purpose | exchange | row count only |
| PCI-14 | Per share `₹47 … ₹3` | `?view=actions` · Per share | amount parsed from purpose after "Rs." | `Polycab.tsx:460-466`; `polycabSources.mjs:111-139` `classifyAction` | BSE purpose | exchange | polycabLive.test classifier cases |
| PCI-15 | Record / book closure | `?view=actions` | record date, else book-closure window | `Polycab.tsx:467-471` | BSE `RD_Date` / `BCRD_FROM/TO` | exchange | check-pages "a record date the exchange did not publish shows the book-closure window" |
| PCI-16 | Paid | `?view=actions` · Paid | payment date joined on ex-date from the short `CorporateAction/w` record, else dash | `Polycab.tsx:472-474`; `polycabSources.mjs:337-350` `mergePaymentDates` | BSE `PAYMENT_DATE` | exchange | polycabLive.test join mechanics only |
| PCI-17 | On this block · derived (`₹65.3 Cr *`, `₹48.7 Cr` … `₹4.17 Cr`) | `?view=actions` · last column | statement share count × per-share amount; `*` + dim when ex-date > statement date | `Polycab.tsx:480-497`; `polycabLive.ts:166-173` `entitlements` | `BOOK_POLYCAB.quantity` × store `amountPerShare` | derived; 31 Mar 2026 share count | polycabLive.test arithmetic + the (asymmetric) flag rule; check-pages "entitlement column says it is derived" |
| PCI-18 | Card subtitle "whole since listing" | `?view=actions` · card subtitle | gated on `actionsComplete` | `Polycab.tsx:247-250` | store flag | — | check-pages "the card calls the record whole … only where …" |
| PCI-19 | "No bonus, split or spin-off … all 8 of its actions are dividends" | `?view=actions` · line under table | measured nil when complete & 0 share actions | `Polycab.tsx:516-526` | store | — | check-pages "the bonus/split nil is claimed only where…" |
| PCI-20 | Sources line + "Last refreshed 22 Sept 2026" | `?view=actions`, `?view=promoter` (NOT the Holding view) | `POLYCAB_SOURCES` + `retrievedAt` date | `Polycab.tsx:258-269` (rendered at :527, :581 only) | store | — | check-pages `POLYCAB_SOURCES_CHECK` on the two company-level routes |
| PCI-21 | Quarter (12 rows) | `?view=promoter` | label from quarter end | `Polycab.tsx:556` | store | disclosure quarter | check-pages "every quarter the store carries is a row" |
| PCI-22 | Promoter holding `61.46%` … `65.91%` | `?view=promoter` · Promoter holding | Tickertape `pmPctT` (checked vs Screener ±0.05pp where both carry the quarter) or Screener alone | `Polycab.tsx:557-561`; `scripts/build-polycab-live.mjs:240-274` | Tickertape / Screener | quarter end | check-pages latest quarter = store; polycabLive.test 0–100 range |
| PCI-23 | Pledged (group) `0.00%` / `—` | `?view=promoter` · Pledged | Tickertape `pmPctP`, else `plPctT` | `Polycab.tsx:562-566`; `polycabSources.mjs:276-278` | Tickertape (one witness) | quarter end | check-pages latest quarter = store; polycabLive.test "a published pledge names the source" |
| PCI-24 | Sources `2` / `1` | `?view=promoter` · Sources | number of sources that carried the holding | `Polycab.tsx:567`; `build-polycab-live.mjs:262` | builder | — | none |
| PCI-25 | Book totals exclude Polycab | top bar `₹713.3 Cr` (NAV-overlaid) / `BOOK_SUMMARY.totalValue` ₹710.39 Cr | positions after the splice | `scripts/build-book.mjs:81,2181-2184` | — | — | check-pages global absence (`/polycab/i` in `<main>` on every non-Polycab route); chatContext.test |
| PCI-26 | ICICI 49794950 account figures | `/mandate/icici-bank-nsdl-demat-49794950` "Direct Equity — 10 rows, ₹63.8 Cr · AIF — 1 row, ₹98,742"; search account row "11 holdings · ₹63.78 Cr"; chat accounts row 63.78; `BOOK_NAV_COVERAGE` bookValue 63,78,01,111.15 | account positions, ex-Polycab | `searchIndex.ts:408-430`; `chatContext.ts:134-146`; `build-book.mjs:326-330` | `BOOK_POSITIONS` | statement 31 Mar 2026 | text-absence only |
| PCI-27 | `/stock/polycab-india` | redirect to `/polycab` | route guard | `src/App.tsx:64-70` `StockRoute` | `BOOK_POLYCAB` keys | — | check-pages `polycab-stock-redirect` |
| PCI-28 | Search entries for Polycab | top-bar search | page entry + 2 tab entries; no holding/account entry | `src/lib/searchIndex.ts:249,292-297,367-395` | nav + positions | — | searchIndex.test "the ring-fenced holding is in no entry", "'polycab' finds the Polycab page first" |
| PCI-29 | Chat `ringFenced` block `valueCr 12351.24` | Muns chat context | statement value summed over `BOOK_POLYCAB` | `src/lib/chatContext.ts:206-210` | `BOOK_POLYCAB` | statement; **no date** | chatContext.test (value, and not inside NAV) |
| PCI-30 | Look-through Polycab line (dropped) | Monitor `?group=security`, Sectors Consolidated | the one disclosed line (ICICI Pru BAF Direct, 0.72% of AUM) = ₹92,647 is skipped | `src/lib/lookthrough.ts:802,846`; `src/lib/useStockExposure.ts:83-86` | `public/lookthrough/1470-D.json` | derived | stockExposure.test (fence load-bearing) |
| PCI-31 | Residual buckets that absorb the dropped slice | Monitor security-axis caption "₹33.3 Cr is the part of a disclosed fund that NO LINE in the filing accounted for"; Sectors tile "Not on this page ₹398.4 Cr" | `disclosedValue − derived total`; `totalValue − measured − derived` | `PortfolioMonitor.tsx:1637,3482,3698`; `SectorComposition.tsx:504-512`; `lookthrough.ts:934` | lookthrough | derived | none for the fenced slice |
| PCI-32 | Excel export | Monitor · Export Excel | `portfolio.positions` + ledger tape | `PortfolioMonitor.tsx:2322-2334` | positions, `public/audit` txns | — | portfolioExcel.test (footer = `BOOK_SUMMARY`) |
| PCI-33 | NAV series / coverage | Morning CIO NAV tab, `/performance` | archive holdings filtered by `RINGFENCED_SECURITY_KEYS` | `build-book.mjs:358-363` | archive | — | navSeries.test |

---

### Drill-downs — /holdings, /stock/:key, /mandate/:account

##### `/holdings` drill-down (`src/pages/HoldingsBehind.tsx`, `src/lib/drilldown.ts`)

| ID | Figure | Where (route · element) | Formula in plain words | Code | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| HB-01 | Headline value | `/holdings?of=*` · big figure `data-hb-total` | Σ market value of the active facet's rows | drilldown.ts:270 `resolveDrilldown`; HoldingsBehind ~530 | BOOK_POSITIONS via context | live+NAV; deduped except `measured` (raw per-account) | `drilldownTotal` vs footer; `holdings-row-*` vs CIO row |
| HB-02 | Share of book "X% of the ₹Y book" | headline sub-line | headline ÷ bookMV. bookMV is the deduped Σ, or the RAW Σ when `!d.deduped` | HoldingsBehind.tsx:293–296, 532–534 | same | as HB-01 | none on the denominator |
| HB-03 | Counts + basis "N holdings · M names · K accounts · each holding counted once" | headline line | rows, distinct securityKey, distinct accountId; basis words from `d.deduped` | HoldingsBehind ~536–545 | same | same | "headline states its counts and dedupe basis" (10bd); Positions/Distinct names vs CIO |
| HB-04 | Facet chip counts (Listed 353 / Private 4 / Not placed 1; Reports a cost 309 / none 49; Covered 179 / Not covered 181; …) | chips above table | rows per facet predicate | drilldown.ts `withFacets` | same | same | facet partition checks (10v) |
| HB-05 | Row Invested | table · Invested | `sumOrNull(costBasis)` over the group's rows | HoldingsBehind group build | BOOK_POSITIONS.costBasis | statement | footer ties |
| HB-06 | Row Value | table · Value | Σ marketValue | same | context | live+NAV | footer ties |
| HB-07 | Row Weight | table · Weight | row value ÷ SET total | HoldingsBehind `weight()` | derived | set-relative | footer "100%" |
| HB-08 | Row Unreal. P&L | table | `sumOrNull(unrealizedPnL)` | group build | context | live+NAV | — |
| HB-09 | Row Return | table · Return | `coveredReturn(g.mv, g.cost, g.pnl, g.mv − g.costedMV)`: refused if uncosted value > 0.5% | HoldingsBehind ~724; drilldown.ts:648 | derived | cumulative on cost | per-row refusal vs CIO row |
| HB-10 | Row "Held in N accounts · M entities" | table · Held in | distinct accountId / distinct owner | ~726–727 | registry | per statement | — |
| HB-11 | Expanded statement line cells (cost, value, quantity, P&L, return) | child rows | per position | HoldingsBehind.tsx:832–857 | position | as printed | none |
| HB-12 | Footer Invested + hover coverage | tfoot · Invested | Σ cost; hover = set counts + groups' uncosted value | HoldingsBehind.tsx:1055–1100 `Foot` | derived | set | footer checks (10bd) |
| HB-13 | Footer Value | tfoot | Σ group values | `Foot` | derived | set | ties to headline |
| HB-14 | Footer Weight "100%" | tfoot | constant when value > 0 | HoldingsBehind.tsx:1114–1115 | — | — | — |
| HB-15 | Footer Unreal. P&L + hover | tfoot | Σ P&L on costed holdings | `Foot` | derived | set | — |
| HB-16 | Footer Return + hover | tfoot | `coveredReturn` on the footer | `Foot` | derived | cumulative | refusal checks |
| HB-17 | Row-count label hover (filtered / closed / negligible) | tfoot label title | counts from `droppedHoldings` | `Foot` leftOut | derived | — | 10bd hover checks |
| HB-18 | "On statement marks alone — before any live quote — worth ₹…" | paragraph under table | Σ statementPortfolio value of the same (account, security) pairs | HoldingsBehind.tsx:996–1007, 1019 `statementValue` | base book | statement | none |
| HB-19 | AIF section bands (Cat II / Cat III / PE / not stated) | `?of=bucket&key=AIF` | Σ value per `aifSectionOf` | HoldingsBehind + aifCategory.ts | positions + providerEngagement | deduped | AIF section partition (10aw) |
| HB-20 | Unvalued AIF list ("N AIF folios report units and the capital drawn …", ₹ drawn each) | AIF drill-down, under the table | accounts with `engagement==="AIF"` and no positions; `drawn` from BOOK_COMMITMENTS | HoldingsBehind.tsx:385–395, 887–905; aifCategory.ts:177–202 `unvaluedAifFolios` | BOOK_ACCOUNTS, BOOK_COMMITMENTS | per account | "unvalued folios named" (10aw); count not checked against scope |
| HB-21 | Measured derivation card | `?of=measured` | text + figures (MWR method) | HoldingsBehind.tsx:947 | — | — | order check (10be) |

##### `/stock/:securityKey` (`src/pages/StockInfo.tsx` and components)

| ID | Figure | Where | Formula | Code | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| ST-01 | Headline mark / NAV + caption date | header, right | one mark if all statements render to one mark, else "marks disagree" + both; NAV-priced: AMFI NAV + navDate | StockInfo.tsx ~540–565 (`cmpMarks`, `cmpSplit`) | position.currentPrice / fundNavs | statement or NAV | `stock-cmp-split` / `-unmarked` / `-nav` |
| ST-02 | "Held in N entities" | header pill | distinct **accountId** of raw rows | StockInfo.tsx:378, 515 | registry | per account | `stock-aif-dual`: pill = account rows (enforces the conflation) |
| ST-03 | Holding value + "% of book" | tile | Σ deduped value; ÷ `consolidatedMarketValue` | :298, :355 | context | live+NAV, deduped | `stock` weight checks |
| ST-04 | Quantity | tile | Σ deduped quantity | :296 | position | statement | — |
| ST-05 | Avg cost | tile | `cost ÷ qty`, with cost = `sumOrNull` over the costed rows and qty over ALL rows | :297, :323 | position | statement | `stock-carried`, `stock-nocost` (reason only) |
| ST-06 | Unrealised P&L + % | tile | Σ P&L of costed rows; ÷ cost | :299, :324 | derived | live+NAV | `stock-nocost` |
| ST-07 | Realised P&L | tile | Σ CG lots with this securityKey | :634–638; ledger.ts:735–763 `loadStockLedger` | CG statements | statement | — |
| ST-08 | Change today | tile | live day change, else absent | StockInfo | quote | live | — |
| ST-09a | Position row: Qty / Avg cost / CMP | Position by account | per statement; CMP = `currentPrice` + statement date | posRows, ~700–780 | position | statement | `stock-cmp-*` |
| ST-09b | Position row: Invested / Current / P&L | same | per statement | same | position | statement or NAV | — |
| ST-09c | Position row: Return | same | `ReturnCells`: HPR always; CAGR where heldSince ≥ 365 days before **portfolio.asOf** | StockInfo.tsx:59–61, 778 | analytics.ts:999 `holdingReturn`, :1213 `measuredReturn` | window end = book date | `stock-cagr` (CAGR ≠ HPR only) |
| ST-10 | Position footer | tfoot | Σ over the deduped set; avg cost blended; one mark or none | posTable footer | derived | deduped | `stock-cmp-split` |
| ST-11 | "reported on each of the N statements" gap sentence | under the table | raw Σ − deduped Σ | StockInfo | derived | — | `stock-aif-dual` |
| ST-12 | Quantity movement: opening / in / out / CA / closing, pledge count, window | QuantityMovement card | read off BOOK_SHARE_MOVEMENTS; `movementNet` | QuantityMovement.tsx; shareMovements.ts:52–67 | CDSL tx statements | statement | `stock-qty` / `-pledge` / `-unmoved`; shareMovements.test |
| ST-13 | Tax card ST/LT cost, days to LT | tax card | Σ stCostBasis / ltCostBasis | StockInfo | LKP lot register | statement | — |
| ST-14a | Look-through: NAV, NAV change, prev NAV/date | FundLookthrough | `public/lookthrough/<code>.json` nav | FundLookthrough.tsx:130–156 | AmfiBeas store | 9 Sep 2026 | `stock-mf-lookthrough` (Helios only) |
| ST-14b | Look-through: plan, AUM, match pill | same | store fields; pill from `matchedVia` | FundLookthrough.tsx:130, 157–166 | store | — | "plan … from this holding's ISIN" (enforces the literal) |
| ST-14c | Look-through: scheme returns 1M–3Y with windows | same | store `returns` verbatim | FundLookthrough.tsx:185–225 | mf-returns | 9 Sep 2026 | windows count = periods only |
| ST-14d | Look-through: holdings table, derived value | same | holding value × disclosed weight | FundLookthrough | AMC disclosure | disclosure month | "value × weight" check |
| ST-14e | Look-through: "portfolio … · holding …" dates | same | holding date = `asOfHolding` (rows[0] account asOf) | StockInfo.tsx:954; FundLookthrough.tsx:235 | registry | statement date | presence only |
| ST-15 | Returns table / price history | company page | `/api/prices` | ReturnsTable | Yahoo | live | absent in harness |
| ST-16 | Dated ledger rows | Stock ledger | tape rows; `amount = settledAmount ?? 0` | ledger.ts:747 | tx statements | statement | — |
| ST-17 | Contribution history (tranches, carried cost) | expansion / cards | BOOK_POSITION_TRANCHES | tranches.ts | fund statements | statement | `stock-carried`, carriedCost.test |

##### `/mandate/:accountId` (`src/pages/MandateHoldings.tsx`)

| ID | Figure | Where | Formula | Code | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| MD-01 | Headline / Market value tile + "N company shares · M cash lines" | header + tile | Σ value of the account's positions | MandateHoldings.tsx:214 | `portfolio.positions` | live+NAV (no mandate row is NAV-priced) | `mandate` |
| MD-02 | Invested tile "cost in, whole mandate · funded from / account opened <date>" | tile | Σ costBasis of current holdings; date = first contribution or inception | :616–623 | position; BOOK_CAPITAL_MOVES | statement | `mandate-funded` (date) |
| MD-03 | Unrealised P&L + "% on cost" | tile | Σ P&L ÷ Σ cost | tile | derived | — | — |
| MD-04 | Holdings count | tile | rows | — | — | — | — |
| MD-05 | Basis pill "STATEMENT · as of … · N accounts behind" + statement-date chip | header | `BasisPill` → `portfolio.asOf`, `staleAccounts` | :595–600; BasisPill.tsx | book | book-wide | — |
| MD-06 | Holdings rows: qty, avg cost, invested, CMP, value, weight in mandate, P&L | table | per position; weight = value ÷ mandate value | :644–700 | position | live (caption says "as printed on <date>") | `mandate` |
| MD-07 | Holdings footer | tfoot | Σ invested / value / P&L, weight 100% | same | derived | — | ties |
| MD-08 | Tie-out to printed total (gap, accrual, derived gap) | under the table | printed total − statementPortfolio Σ; gap = accrual within ₹1 | :539–548, 742–775 | statement `printed`/`derivedTotal` | statement | `mandate` tie check |
| MD-09a | Capital card rows: date, type, Paid in (`invested ?? amount`), Taken out, units | "What the family put in" | per BOOK_CAPITAL_MOVES | :867–960 `CapitalIn` | fund/PMS statements | statement | `mandate-funded` |
| MD-09b | Capital card footer and net/gain/return sentence | same | `capitalRollup`: paidIn = Σ gross `amount` | tranches.ts:415 | BOOK_CAPITAL_MOVES | statement | `mandate-funded` |
| MD-10 | Manager trades: trades count, bought, sold, realised, period; tranche rows | "What the manager traded" | `rollup(mine, [account], "manager")`; realised from ledger `realisedIndex` | :1040–1130 `ManagerTrades`; ledger.ts:342–395 | tx statements + CG lots | statement | `mandate` (card present) |
| MD-11 | Fund-folio branch (non-PMS account): holdings, capital card, no dealing card | `/mandate/<fund>` | as above | MandateHoldings fund branch | — | — | `mandate-fund` |

---

### Search, and the Muns chat context

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| SS-01 | Holding row — category word | top bar (any route) · search list · holding row, 2nd line, 1st token | category (`holdingBucket`) of the **first** deduped row of the security | `searchIndex.ts:367,375` `buildSearchIndex` | `Position.assetClass` + `Account.engagement` | first row only | none |
| SS-02 | Holding row — value | same, 2nd token | Σ marketValue over `dedupedPositions(portfolio.positions)` rows of the key | `searchIndex.ts:356-362,375` | `BOOK_POSITIONS.marketValue` + `applyFundNavs`/`applyQuotes` | NAV/live; consolidated | check:pages `search` "a holding says what it is worth" (regex `₹` only) |
| SS-03 | Holding row — "% of the book" | same, 3rd token | value ÷ Σ `currentHoldings(consolidated)` (₹713.29 Cr) | `searchIndex.ts:349-351` | same | NAV/live; consolidated | none |
| SS-04 | Holding row — "N accounts · M members" | same, 4th token | distinct accountIds / owners over RAW rows of the key | `searchIndex.ts:364-366,376` | `BOOK_ACCOUNTS.owner` | per-account raw | none |
| SS-05 | Holding row — closed line "Redeemed — no longer held · the redemption is on Transactions" + href | same | every row `isRedeemedToNil` | `searchIndex.ts:363,373-380` | quantity 0 + NAV | — | `searchIndex.test.ts` (href only) |
| SS-06 | Mandate row — "provider · account · N holdings · ₹X" | search list · mandate row | raw rows of the account; Σ MV | `searchIndex.ts:390-406` | `BOOK_POSITIONS` | NAV/live; per account | `searchIndex.test.ts` (href only) |
| SS-07 | Account row — "owner · N holdings · ₹X · as of D" | search list · account row | raw rows, Σ MV, `Account.asOf` | `searchIndex.ts:409-431` | `BOOK_POSITIONS`, `Account.asOf` | NAV/live value + **statement** date | none |
| SS-08 | Account row — "every holding redeemed — the money is on Transactions" / "holds no valued position" | search list · account row | all rows closed / no rows | `searchIndex.ts:415-424` | — | — | none |
| SS-09 | Person row — "N accounts · ₹X as their own statements print it" | search list · member/trust row | registry account count; Σ raw MV of the owner's accounts | `searchIndex.ts:435-451` | `BOOK_ACCOUNTS`, positions | NAV/live; per-owner raw | `searchIndex.test.ts` (href) |
| SS-10 | Category / basket / asset-class row — "N holdings · ₹X · p% of the book" | search list · category rows (19) | over `currentHoldings(consolidated)` grouped by `groupKeyFor(axis)` | `searchIndex.ts:467-489` | `groupAxis` | NAV/live; consolidated | `searchIndex.test.ts` (scope parses) |
| SS-11 | Side row — listed / private / not placed | search list · side rows (3) | `marketSide` over current | `searchIndex.ts:490-504` | `Position.marketSide` | NAV/live; consolidated | none |
| SS-12 | Sector row — "N holdings whose statement names this sector · ₹X" | search list · sector rows (10) | Equity rows of current with `Position.sector` | `searchIndex.ts:506-522` | `Position.sector` (book tier) | NAV/live; consolidated | check:pages `search` (href of first result) |
| SS-13 | Figure rows (10) — text + destination | search list · figure rows | static `FIGURES` | `searchIndex.ts:301-330` | — | — | check:pages `search` (only 'uncalled'→/private-market) |
| SS-14 | View / page rows — text | search list | static `VIEWS`, `NAV` | `searchIndex.ts:245-298,454-465` | — | — | check:pages `search` tab checks |
| SS-15 | Empty-state line + "on the consolidated review · no statement reports it" note | search list · empty state | `reviewGapsFor(query)` over `CLAIMABLE` | `SmartSearch.tsx:193-207`; `Absent.tsx:94-128`; `reviewGaps.ts:52-58,86-106` | `src/data/reviewGaps.ts`, `REVIEW_AS_OF` "30 June 2026" | — | check:pages `search` (BSE, alias, no-figure, gapWithHits, gapSuppressed) |
| SS-16 | Keyword routing ("arbitrage"→Cash, "net worth"→Current value) | search list | `CATEGORY_WORDS`, `FIGURES.words` | `searchIndex.ts:303,539` | — | — | none |
| SS-17 | "Ask Muns" row text | search list | static | `SmartSearch.tsx:218-230` | — | — | check:pages `search` |
| CH-01 | `book_summary.consolidatedNavCr` | Muns chat · payload to model | `BOOK_SUMMARY.totalValue` | `chatContext.ts:103` | `BOOK_SUMMARY` | **statement**; consolidated; asOf 2026-08-29 | `chatContext.test.ts` (vs BOOK_SUMMARY) |
| CH-02 | `listedCr / privateCr / notPlacedCr` + `notPlacedNote` | chat payload | `publicPrivateSplit(dedupedPositions(BOOK_POSITIONS))` | `chatContext.ts:104-114` | `Position.marketSide` | statement | `chatContext.test.ts` |
| CH-03 | `positions / distinctSecurities / accounts / owners / asOf` | chat payload | raw counts | `chatContext.ts:100,115-118` | `BOOK_POSITIONS`, `BOOK_ACCOUNTS` | raw | `chatContext.test.ts` (asserts the raw count) |
| CH-04 | `allocation_by_bucket` valueCr / holdings | chat payload | `holdingBucket` over `dedupedPositions(BOOK_POSITIONS)` (closed and sub-floor rows included) | `chatContext.ts:63-69,120-126` | — | statement; consolidated | `chatContext.test.ts` (asserts 369 rows) |
| CH-05 | `by_family_member` valueCr / accounts | chat payload | raw `BOOK_POSITIONS` per owner; "accounts" = accounts with ≥1 row | `chatContext.ts:74-80,127-133` | — | statement; per-owner raw | `chatContext.test.ts` |
| CH-06 | `accounts` rows valueCr / holdings / asOf / noPositionsReason; shown 50 of 51 | chat payload | Σ raw MV per account (`sum([])` = 0); top 50 by value | `chatContext.ts:37,134-147` | — | statement; per account | none (finiteness walk only) |
| CH-07 | `top_holdings` rows (marketValueCr, costBasisCr, qty, owner, provider); shown/total/basis | chat payload | `topByValue(deduped ROWS, 25)` | `chatContext.ts:148-154` | — | statement; per statement row | none |
| CH-08 | `undrawn_commitments` rows committed / drawn / undrawn / distributed | chat payload | `BOOK_COMMITMENTS` raw, all 15 | `chatContext.ts:155-164` | `BOOK_COMMITMENTS` | statement; whole register | `chatContext.test.ts` (count = 15) |
| CH-09 | `blendedAsOf` newest / accountsBehind | chat payload | `BOOK_SUMMARY.asOf`; accounts with asOf < it | `chatContext.ts:60,177-181` | — | — | `chatContext.test.ts` |
| CH-10 | `costBasis` positionsWithNoCost / of / valueCr + "311 positions that report one" | chat payload | raw `BOOK_POSITIONS` | `chatContext.ts:82-83,182-188` | — | statement raw | `chatContext.test.ts` (asserts raw) |
| CH-11 | `doubleCount.amountCr` | chat payload | `doubleCountedValue(BOOK_POSITIONS)` | `chatContext.ts:189-194` | — | — | `chatContext.test.ts` |
| CH-12 | `marketSideUnplaced` valueCr / funds / note | chat payload | `split.unplaced` | `chatContext.ts:200-205` | — | — | none (note) |
| CH-13 | `ringFenced` security / valueCr | chat payload | Σ `BOOK_POLYCAB.marketValue` | `chatContext.ts:206-211` | `BOOK_POLYCAB` | statement 31 Mar 2026 (date not sent) | `chatContext.test.ts` |
| CH-14 | `notCarried` list | chat payload | static | `chatContext.ts:212-218` | — | — | `chatContext.test.ts` (≥3 items) |
| CH-15 | `contextTickers` (TICKER_SYMBOL) | chat payload | top 15 symbols by statement value | `chatContext.ts:239-243` | — | statement | `chatContext.test.ts` |
| CH-16 | Panel intro "snapshot" sentences | Muns panel (opened from top bar) | static text | `MunsChat.tsx:267-276` | — | — | check:pages `chat` (wording only) |
| CH-17 | "AI answer · not a statement figure" label | Muns panel header | static | `MunsChat.tsx:256-258` | — | — | check:pages `chat` |

---

### Extras and Admin — NAV & Performance, Returns, Capital Gains, Ledger, Data Audit, Data Refresh, Snapshot History

**What the Existing guard column means.**

- **"generic"** means only `check:pages`' generic sweep runs on that route: console errors, failed requests, overflow, light-mode contrast and a stray ₹0/0.00% scan.
- Named blocks exist only for three routes:
  - `returns` (`scripts/check-pages.mjs:17228`): 2 checks. Every wrapper class the page names has a row, and no fund name appears as a sector row.
  - `performance` (`:17297`): 2 checks. The stale "no valuation series" text is gone, and the NAV card header names the series span.
  - `history` (`:17309`): 5 wording, header and coverage checks.
- There are no named blocks for `capital-gains`, `ledger`, `audit` or `upload`.

| ID | Figure | Where (route · element) | Formula in plain words | Code (file:line fn) | Source | Basis | Existing guard |
|---|---|---|---|---|---|---|---|
| IN-CG-01 | Realised gains (period) **+₹1.32 Cr** · ST +₹22 L · LT +₹1.1 Cr · "From 7 of 51 accounts" | /capital-gains · tile 1 | Σ realisedST + Σ realisedLT over accounts that issue a capital gain statement; the others are named, not zeroed | `src/pages/CapitalGains.tsx:157-162,305-324` Component | `BOOK_CAPITAL_GAINS` (capital gain statements) | statement; each account over its own window 2025-04-01…2026-08-13 | generic |
| IN-CG-02 | Embedded (unrealised) gains **—** "needs lot acquisition dates · No statement in this drop carries lot dates" | /capital-gains · tile 2 | Σ unrealisedST/LT over `BOOK_CAPITAL_GAINS` (all null) | `CapitalGains.tsx:163-166,326-334` | `BOOK_CAPITAL_GAINS.unrealised*` | statement | none |
| IN-CG-03 | Est. tax on realised **₹18.2 L** "STCG 20% · LTCG 12.5% · illustrative", plus popover `= max(0,ST)×20% + max(0,LT)×12.5%` | /capital-gains · tile 3 | max(0, ΣST over all 7 accounts)×20% + max(0, ΣLT)×12.5% | `CapitalGains.tsx:45-46,166-167,336-359` | derived from IN-CG-01 | statement; **pooled across 3 taxpayers** | none |
| IN-CG-04 | Hold-to-LTCG saving **—** "needs lot acquisition dates" | /capital-gains · tile 4 | Σ (unrealised gain × 7.5 pp) over dated short-term winners | `CapitalGains.tsx:105-123,170,361-369` | `Position.daysToLT/heldSince/unrealizedPnL` | statement, per account's own as-of | none |
| IN-CG-05 | Realised by how the holding was run: PMS 201 lots +₹9.5 L/+₹1.16 Cr/+₹1.25 Cr · Direct Equity 10 lots +₹12.4 L/−₹5.4 L/+₹7 L · no-class 1 lot +₹3,454 · Total 212 lots +₹1.32 Cr | /capital-gains · first table | `BOOK_REALISED_BY_CLASS` grouped by `holdingBucket` (a mandate takes the whole account) | `CapitalGains.tsx:223-275,379-446` | `BOOK_REALISED_BY_CLASS` | statement | none |
| IN-CG-06 | Realised gains by account: Window, Lots, Realised ST/LT, Unrealised ST/LT; footer "7 of 51 accounts · +₹22 L · +₹1.1 Cr" | /capital-gains · second table | One row per account, as printed | `CapitalGains.tsx:448-512` | `BOOK_CAPITAL_GAINS` | statement, per account | none |
| IN-CG-07 | Hold-to-LTCG planner card ("3 position(s) on LKP 98245 … The other 50 accounts issue a CAPITAL REGISTER") | /capital-gains · planner card | positions with `daysToLT`; candidates must be at a gain | `CapitalGains.tsx:131-141,515-560` | `Position.daysToLT/heldSince` | statement (LKP as of 2026-03-31) | none |
| IN-CG-08 | Tax-loss harvesting **117 positions underwater · −₹5.79 Cr**; each row shows Unreal. loss, Return, and an ST/LT cell | /capital-gains · harvest card | `isPriced && unrealizedPnL<0` over `statementPortfolio.positions` (raw, per account) | `CapitalGains.tsx:125-127,190,564-602` | `BOOK_POSITIONS` | statement marks 2026-03-31…2026-08-13, per account | none |
| IN-CG-09 | Pill "STATEMENT · as of 2026-08-29" | /capital-gains · header | `portfolio.asOf` | `CapitalGains.tsx:302` `BasisPill` | `BOOK_AS_OF` | statement | none (private-market route asserts the pill elsewhere) |
| IN-PF-01 | Current Value of Holdings **₹713.3 Cr** "369 of 371 rows across 51 accounts — 2 reported under two members and counted once" | /performance · tile 1 | `consolidatedMarketValue(portfolio.positions)` | `Performance.tsx:100,244-250` | `BOOK_POSITIONS` + `applyFundNavs` | NAV-overlaid, consolidated | generic |
| IN-PF-02 | Embedded return **+15.94%** · +₹74.9 Cr unrealised on cost | /performance · tile 2 | Σ unrealised ÷ Σ cost over consolidated (the `costUnavailable` filter is a no-op) | `Performance.tsx:99-106,251-255` | positions | NAV-overlaid, consolidated | generic |
| IN-PF-03 | Money-weighted return (to date) **+26.5%**; window "2026-04-01 → 2026-07-27–2026-08-13 (117–134 days)"; hover ₹110.4 Cr, "at 2026-08-29", "+89.5% p.a." | /performance · tile 3 | `pooledXirr` over the 7 accounts carrying an opening value, each closing on its own as-of; de-annualised over windowStart→lastClose (134 d) | `Performance.tsx:107-209,256-268` | `BOOK_ACCOUNT_CASH_FLOWS` + account MV | per-account terminal dates | `accountXirr.test.ts` (per-account vs printed FYTD; window guard, which uses a 150-day window) |
| IN-PF-04 | Top-10 concentration **61%** | /performance · tile 4 | top 10 `securityKey` values ÷ consolidated MV | `Performance.tsx:86-90,229-230,270` | positions | NAV-overlaid, consolidated | generic |
| IN-PF-05 | Time-weighted return grid: MTD/QTD/FYTD/1M/3M/1Y/SI per account plus its benchmark; "11 of 51 accounts" pill; absent cells read "<Provider> does not publish a <period> figure" | /performance · TWRR card | One `BOOK_ACCOUNT_RETURNS` block per account (fact sheet preferred), verbatim | `Performance.tsx:211-226,292-356` | `BOOK_ACCOUNT_RETURNS` | statement; each block's own date 2026-07-27…2026-08-13 | none (`attribution.test.ts` pairs 1Y by source only) |
| IN-PF-06 | Portfolio NAV vs Nifty 500 (12 dated points) | /performance · NAV card | shared `NavVsIndex` | `src/components/NavVsIndex.tsx` | `BOOK_NAV_HISTORY` | chain-linked | `performance` block (2 checks) + `navSeries.test.ts` |
| IN-PF-07 | Value bridge per account: Opening, Contributions, Withdrawals, Net capital, Realised, Unrealised, Income, **"Fees & expenses"**, Closing | /performance · Value bridge card | `BOOK_ACCOUNT_BRIDGES` blocks verbatim; the "Fees & expenses" row reads `b.fees` only; the column head is "Since inception" or "FY to date" from `basis` | `Performance.tsx:63-73,359-416`; `scripts/build-book.mjs:1913-1936` | statement flow blocks | statement, per account, own window | none (`carriedCost.test.ts` reads the block's `realized`/`contribution`, not opening or closing) |
| IN-PF-08 | Money-weighted per account: Dated flows, Market value, Terminal date, Return (to date); hover "+x% p.a. annualised" | /performance · XIRR table rows | `xirrWithTerminal` per account, closed at the account's as-of, de-annualised | `Performance.tsx:117-132,419-450` | `BOOK_ACCOUNT_CASH_FLOWS`, `portfolio.positions` (raw) | per account; MV is NAV-overlaid | `accountXirr.test.ts` |
| IN-PF-09 | Consolidated row: "7 of 51 accounts · ₹110.4 Cr of ₹713.3 Cr" · 43 flows · Terminal **2026-08-29** · **+26.5%** (hover +89.5% p.a.) | /performance · XIRR table last row | pooled as IN-PF-03 | `Performance.tsx:452-470` | same | same | none |
| IN-PF-10 | Pill "STATEMENT · as of 2026-08-29"; hover "every figure is on its statement mark … it is the printed book … 49 have no listing … and never will" | /performance · header | `BasisPill` without `statement`; basis = LIVE only if a quote landed | `Performance.tsx:239`; `src/components/BasisPill.tsx:56-71` | `portfolio.asOf`, basis | reads NAV-overlaid `portfolio` | none |
| IN-RA-01 | Embedded return **+15.94%** · +₹74.9 Cr on ₹470.3 Cr of cost | /returns · tile 1 | Σ unrealised ÷ Σ cost over `consolidated.filter(isPriced)` | `ReturnAnalysis.tsx:84,259-262` | positions | NAV-overlaid, consolidated | generic |
| IN-RA-02 | Names in profit **58%** · "177 of 304 positions" | /returns · tile 2 | positions with P&L > 0 ÷ priced positions | `ReturnAnalysis.tsx:200-210,263-264` | positions | NAV-overlaid, consolidated | generic |
| IN-RA-03 | Spread between accounts **147.5 pp** "Transition TVC262 to LKP 98245" | /returns · tile 3 | best account return on cost − worst | `ReturnAnalysis.tsx:180-203,280-287` | raw positions per account | per account | generic |
| IN-RA-04 | Maximum drawdown **—** "this corpus carries two per account" | /returns · tile 4 | not computed | `ReturnAnalysis.tsx:288-291` | none | — | none |
| IN-RA-05 | Contribution by sector/class (P&L, Return, Contrib.; Total +₹74.9 Cr / +15.9% / +15.94%) | /returns · sector card | company shares grouped by `Position.sector` (statement tier only); wrappers grouped by class | `ReturnAnalysis.tsx:133-160,336-386` | positions | NAV-overlaid, consolidated | `returns` block (2 checks) |
| IN-RA-06 | Per account table (Names, Cost, Unrealised P&L, Return, Best, Worst) | /returns · per-account card | per account over raw positions | `ReturnAnalysis.tsx:180-203,387-440` | positions | per account | generic |
| IN-RA-07 | Largest contributors / detractors (P&L, Return, Contrib.) | /returns · two cards | per position, ranked by unrealised P&L | `ReturnAnalysis.tsx:442-448` | positions | NAV-overlaid | generic |
| IN-RA-08 | Drawdown card **—** | /returns · last card | not computed | `ReturnAnalysis.tsx:450-458` | none | — | none |
| IN-RA-09 | Subtitle "Point-in-time, on the statements' own marks"; pill STATEMENT | /returns · header | — | `ReturnAnalysis.tsx:252-254` | — | reads NAV-overlaid `portfolio` | none |
| IN-LG-01 | Transactions **462** · 284 buys · 178 sells | /ledger · tile 1 | tape rows under `AUTHORITATIVE.transactions`, deduped by `datedRows` | `LedgerInsights.tsx:196-198`; `src/lib/ledger.ts:352-419` loadTransactions | transaction statements + SVAN investor reports | statement; tape 2026-04-01→2026-08-13 | generic |
| IN-LG-02 | Bought **₹70.4 Cr** / Sold **₹29.7 Cr** "settled cost/proceeds, over the window" | /ledger · tiles 2-3 | Σ settled amount by side | `LedgerInsights.tsx:199-207` | tape | statement | generic |
| IN-LG-03 | Realised (as the statements report it) **+₹1.32 Cr** · all 212 lots | /ledger · tile 4 | Σ lot shortTerm + longTerm | `LedgerInsights.tsx:209-219`; `ledger.ts:644-716` loadSales | capital gain statements | statement | generic |
| IN-LG-04 | Cross-check: canonical 212 lots +₹1,32,35,304.6 · attributed 193 lots +₹1,23,69,619.01 · **"…not on the tape at all" 19 lots +₹8,65,685.59** | /ledger · cross-check table | lots joined to sells on `accountNo|securityKey@date` | `LedgerInsights.tsx:222-248`; `ledger.ts:660-716` | lots + tape | statement | none |
| IN-LG-05 | Tape table (Date, Security, Account, Side, Qty, Price, Net amount, Realised) | /ledger · tape | row per trade; realised attributed once per (account, security, date) | `LedgerInsights.tsx:250-287` | tape + lots | statement | generic |
| IN-LG-06 | Sales & exits (Shares sold, Proceeds, Realised, Still held, Status) | /ledger · sales card | `loadSales().rows` | `LedgerInsights.tsx:288-330`; `ledger.ts:667-690` | tape + lots + holdings | statement | none |
| IN-LG-07 | Realised tab: Lots settled 212 · ST +₹21.98 L · LT +₹1.10 Cr · split by how held | /ledger · Realised Gains tab (not in the dump; recomputed) | `loadRealisedLots`; `splitLotsByBucket` | `LedgerInsights.tsx:390-426,464-555` | capital gain statements | statement | none |
| IN-LG-08 | Income tab: Cash dividends ₹39.67 L · TDS ₹98,554 · 7 corporate actions | /ledger · Income tab (not in the dump; recomputed) | `loadIncome` | `LedgerInsights.tsx:629-700`; `ledger.ts` loadIncome | dividend and corporate-benefit statements | statement | none |
| IN-LG-09 | Pills "STATEMENT · as of 2026-08-29" and "as of 29 Aug 2026" | /ledger · header | `newestAsOf(docs)` over the whole archive | `LedgerInsights.tsx:107-109`; `ledger.ts:286-288` | manifest | statement | none |
| IN-DA-01 | Document chips labelled by `fy` (the as-of date) | /audit · workbook list | — | `DataAudit.tsx:271` | `public/audit/manifest.json` | statement | none |
| IN-DA-02 | Section grid: preamble, header row, data rows placed by array position | /audit · grid | `row[c]` under header column c | `DataAudit.tsx:343-407` | `public/audit/<docKey>/<section>.json` | statement as parsed | none |
| IN-DR-01 | Current Value of Holdings **₹713.3 Cr**: Listed ₹702.7 Cr · Private ₹10.6 Cr · Not placed ₹98,742 | /upload · tile 1 | `portfolio.totalValue`, `marketSides` | `DataRefresh.tsx:199-204` | positions + NAV overlay | NAV-overlaid, consolidated | generic |
| IN-DR-02 | Positions **371** · 213 names · 6 entities | /upload · tile 2 | raw `positions.length` | `DataRefresh.tsx:205-207` | `BOOK_POSITIONS` | raw | generic |
| IN-DR-03 | Accounts **51** · 27 providers · 49 behind latest | /upload · tile 3 | registry count; accounts older than the newest as-of | `DataRefresh.tsx:208-213` | `BOOK_ACCOUNTS` | — | generic |
| IN-DR-04 | Sector coverage **41.6%** "of company-share value · 159 of 300 rows carry one"; hint carries the no-cost sentence and "this book carries no look-through behind a fund" | /upload · tile 4 and Coverage card | value with `sector ≠ Unclassified` ÷ company-share value (statement sector tier only) | `DataRefresh.tsx:49-53,214-232,289` | `Position.sector` | consolidated | generic |
| IN-DR-05 | No cost basis "55 names · 65 of 369 positions · ₹168 Cr" | /upload · Coverage card | `unpriced(deduped)` over all 369 | `DataRefresh.tsx:101-107,294-298` | positions | NAV-overlaid, consolidated incl. closed and sub-₹1,000 rows | generic |
| IN-DR-06 | Positions carrying an ISIN 86 of 371 · NAV snapshots 12 | /upload · Coverage card | counts | `DataRefresh.tsx:290,303` | positions, `BOOK_NAV_HISTORY` | raw | generic |
| IN-DR-07 | Accounts & report dates (as-of, "−N d") | /upload · accounts table | days behind `portfolio.asOf` | `DataRefresh.tsx:235-276` | `BOOK_ACCOUNTS` | — | generic |
| IN-DR-08 | Pill "as of 2026-08-29"; subtitle "Every figure traces to a statement PDF … nothing here is estimated"; "Book as of" | /upload · header and footer | `portfolio.asOf` | `DataRefresh.tsx:174-175,356` | — | — | generic |
| IN-UH-01 | Covered NAV per dated point (₹25.9 Cr … ₹140.2 Cr) | /history · table column 2 | `BOOK_NAV_HISTORY.nav` (sum of covered accounts at their latest mark on or before the date) | `UploadHistory.tsx:54-58,98` | `BOOK_NAV_HISTORY` | statement, deduped | `history` block (wording and header only) |
| IN-UH-02 | Change % (8.51%, 0.74%, … **105.63%**, 33.92%, 7.12%, **68.18%**) | /history · table column 3 | nav_i ÷ nav_{i−1} − 1 on raw levels | `UploadHistory.tsx:56,122-126` | `BOOK_NAV_HISTORY.nav` | raw levels | none |
| IN-UH-03 | Capital in (₹0 / +₹11.2 Cr / −₹65,735 / −₹9,559); hover "…the whole change beside it is a change in value" | /history · table column 4 | `flowIn ?? 0` | `UploadHistory.tsx:57,128-137` | `BOOK_NAV_HISTORY.flowIn` | statement | `history`: "₹0 … has its cause on the page" (it requires the wording) |
| IN-UH-04 | Marked on this date "N of 13" | /history · table column 5 | `accountsOnDate` / covered count | `UploadHistory.tsx` | `BOOK_NAV_HISTORY` | — | `history`: "N of M accounts" |
| IN-UH-05 | Current consolidated snapshot: sides and Total **₹713.3 Cr · as of 29 Aug 2026** | /history · last card | `portfolio.totalValue`, `marketSides`, `portfolio.asOf` | `UploadHistory.tsx:166-188` | positions + NAV overlay | NAV-overlaid | generic |

### Cross-page figure ledger

Every figure that appears on more than one surface, with the distinct values rendered and the value an independent probe expects.

| Figure | Surfaces | Distinct values shown | Expected (probe) | Off-expected |
|---|---:|---|---|---:|
| 1 · Book total (current value of holdings) | 89 | ₹710.4 Cr, ₹713.3 Cr, ₹716.5 Cr | ₹713.3 Cr | 13 |
| 2 · Capital invested (cost) | 18 | ₹114.2 Cr, ₹470.3 Cr | ₹470.3 Cr | 1 |
| 3a · Unrealised P&L | 11 | ₹13.9 Cr, ₹74.9 Cr | ₹74.9 Cr | 1 |
| 3b · Consolidated return (on cost) | 21 | 12.19%, 15.94% | 15.94% | 1 |
| 4 · assetClass · Alternate · Invested | 3 | ₹3.76 Cr | ₹3.76 Cr |  |
| 4 · assetClass · Alternate · MV | 7 | ₹28.5 Cr | ₹28.5 Cr |  |
| 4 · assetClass · Alternate · Return | 3 | — (absent everywhere) | — |  |
| 4 · assetClass · Alternate · Unrealised | 2 | ₹1.30 Cr | ₹1.30 Cr |  |
| 4 · assetClass · Alternate · Weight | 3 | 4.00% | 3.99% |  |
| 4 · assetClass · Alternate · count | 2 | 7, 8 | 8 | 1 |
| 4 · assetClass · Cash · Invested | 3 | ₹0 | ₹0 |  |
| 4 · assetClass · Cash · MV | 7 | ₹14.2 Cr | ₹14.2 Cr |  |
| 4 · assetClass · Cash · Return | 3 | — (absent everywhere) | — |  |
| 4 · assetClass · Cash · Unrealised | 2 | ₹0 | ₹0 |  |
| 4 · assetClass · Cash · Weight | 3 | 2.00% | 2.00% |  |
| 4 · assetClass · Cash · count | 2 | 4, 8 | 8 | 1 |
| 4 · assetClass · Debt · Invested | 3 | ₹5.00 Cr | ₹5.00 Cr |  |
| 4 · assetClass · Debt · MV | 7 | ₹5.55 Cr | ₹5.55 Cr |  |
| 4 · assetClass · Debt · Return | 3 | 11.00% | — |  |
| 4 · assetClass · Debt · Unrealised | 2 | ₹55.0 L | ₹55.0 L |  |
| 4 · assetClass · Debt · Weight | 3 | 0.80% | 0.78% |  |
| 4 · assetClass · Debt · count | 2 | 1 | 1 |  |
| 4 · assetClass · Equity · Invested | 3 | ₹440.1 Cr | ₹440.1 Cr |  |
| 4 · assetClass · Equity · MV | 7 | ₹642.7 Cr | ₹642.7 Cr |  |
| 4 · assetClass · Equity · Return | 3 | — (absent everywhere) | — |  |
| 4 · assetClass · Equity · Unrealised | 2 | ₹72.2 Cr | ₹72.2 Cr |  |
| 4 · assetClass · Equity · Weight | 3 | 90.10% | 90.10% |  |
| 4 · assetClass · Equity · count | 2 | 330, 340 | 340 | 1 |
| 4 · assetClass · Not classified in the family's review · Invested | 3 | ₹21.4 Cr | ₹21.4 Cr |  |
| 4 · assetClass · Not classified in the family's review · MV | 7 | ₹22.3 Cr | ₹22.3 Cr |  |
| 4 · assetClass · Not classified in the family's review · Return | 3 | 4.30% | — |  |
| 4 · assetClass · Not classified in the family's review · Unrealised | 2 | ₹92.1 L | ₹92.1 L |  |
| 4 · assetClass · Not classified in the family's review · Weight | 3 | 3.10% | 3.13% |  |
| 4 · assetClass · Not classified in the family's review · count | 2 | 1 | 1 |  |
| 4 · basket · Entrepreneurial Growth · Invested | 3 | ₹3.76 Cr | ₹3.76 Cr |  |
| 4 · basket · Entrepreneurial Growth · MV | 7 | ₹5.08 Cr | ₹5.08 Cr |  |
| 4 · basket · Entrepreneurial Growth · Return | 3 | 34.67% | — |  |
| 4 · basket · Entrepreneurial Growth · Unrealised | 2 | ₹1.30 Cr | ₹1.30 Cr |  |
| 4 · basket · Entrepreneurial Growth · Weight | 3 | 0.70% | 0.71% |  |
| 4 · basket · Entrepreneurial Growth · count | 2 | 5 | 5 |  |
| 4 · basket · Liquidity · Invested | 3 | — (absent everywhere) | — |  |
| 4 · basket · Liquidity · MV | 7 | ₹28.5 Cr | ₹28.5 Cr |  |
| 4 · basket · Liquidity · Return | 3 | — (absent everywhere) | — |  |
| 4 · basket · Liquidity · Unrealised | 2 | — (absent everywhere) | — |  |
| 4 · basket · Liquidity · Weight | 3 | 4.00% | 3.99% |  |
| 4 · basket · Liquidity · count | 2 | 8, 12 | 12 | 1 |
| 4 · basket · Not classified in the family's review · Invested | 3 | ₹21.4 Cr | ₹21.4 Cr |  |
| 4 · basket · Not classified in the family's review · MV | 7 | ₹22.3 Cr | ₹22.3 Cr |  |
| 4 · basket · Not classified in the family's review · Return | 3 | 4.30% | — |  |
| 4 · basket · Not classified in the family's review · Unrealised | 2 | ₹92.1 L | ₹92.1 L |  |
| 4 · basket · Not classified in the family's review · Weight | 3 | 3.10% | 3.13% |  |
| 4 · basket · Not classified in the family's review · count | 2 | 2, 3 | 3 | 1 |
| 4 · basket · Stable Growth · Invested | 3 | ₹327 Cr | ₹327 Cr |  |
| 4 · basket · Stable Growth · MV | 7 | ₹413.7 Cr | ₹413.7 Cr |  |
| 4 · basket · Stable Growth · Return | 3 | — (absent everywhere) | — |  |
| 4 · basket · Stable Growth · Unrealised | 2 | ₹64.4 Cr | ₹64.4 Cr |  |
| 4 · basket · Stable Growth · Weight | 3 | 58.00% | 58.00% |  |
| 4 · basket · Stable Growth · count | 2 | 32, 41 | 41 | 1 |
| 4 · basket · Thematic & Tactical · Invested | 3 | ₹118.1 Cr | ₹118.1 Cr |  |
| 4 · basket · Thematic & Tactical · MV | 7 | ₹243.7 Cr | ₹243.7 Cr |  |
| 4 · basket · Thematic & Tactical · Return | 3 | — (absent everywhere) | — |  |
| 4 · basket · Thematic & Tactical · Unrealised | 2 | ₹8.35 Cr | ₹8.35 Cr |  |
| 4 · basket · Thematic & Tactical · Weight | 3 | 34.20% | 34.17% |  |
| 4 · basket · Thematic & Tactical · count | 2 | 296, 297 | 297 | 1 |
| 4 · category · AIF · Invested | 3 | ₹292.1 Cr | ₹292.1 Cr |  |
| 4 · category · AIF · MV | 8 | ₹352.3 Cr | ₹352.3 Cr |  |
| 4 · category · AIF · Return | 3 | 20.62% | — |  |
| 4 · category · AIF · Unrealised | 2 | ₹60.2 Cr | ₹60.2 Cr |  |
| 4 · category · AIF · Weight | 3 | 49.40% | 49.40% |  |
| 4 · category · AIF · count | 2 | 10, 16 | 16 | 1 |
| 4 · category · Cash · Invested | 3 | ₹0 | ₹0 |  |
| 4 · category · Cash · MV | 8 | ₹11.6 Cr, ₹14.2 Cr | ₹14.2 Cr | 1 |
| 4 · category · Cash · Return | 3 | — (absent everywhere) | — |  |
| 4 · category · Cash · Unrealised | 2 | ₹0 | ₹0 |  |
| 4 · category · Cash · Weight | 3 | 2.00% | 2.00% |  |
| 4 · category · Cash · count | 2 | 4, 8 | 8 | 1 |
| 4 · category · Direct Equity · Invested | 3 | ₹1.22 Cr | ₹1.22 Cr |  |
| 4 · category · Direct Equity · MV | 9 | ₹94.9 Cr | ₹94.9 Cr |  |
| 4 · category · Direct Equity · Return | 3 | — (absent everywhere) | — |  |
| 4 · category · Direct Equity · Unrealised | 2 | -₹22.9 L | -₹22.9 L |  |
| 4 · category · Direct Equity · Weight | 3 | 13.30% | 13.30% |  |
| 4 · category · Direct Equity · count | 3 | 35 | 35 |  |
| 4 · category · ETF · Invested | 3 | — (absent everywhere) | — |  |
| 4 · category · ETF · MV | 8 | ₹23.4 Cr, ₹24.6 Cr | ₹23.4 Cr | 1 |
| 4 · category · ETF · Return | 3 | — (absent everywhere) | — |  |
| 4 · category · ETF · Unrealised | 2 | — (absent everywhere) | — |  |
| 4 · category · ETF · Weight | 3 | 3.30% | 3.28% |  |
| 4 · category · ETF · count | 2 | 2, 3 | 3 | 1 |
| 4 · category · Mutual Fund · Invested | 3 | ₹52.4 Cr | ₹52.4 Cr |  |
| 4 · category · Mutual Fund · MV | 8 | ₹89.7 Cr, ₹102.8 Cr | ₹89.7 Cr | 1 |
| 4 · category · Mutual Fund · Return | 3 | — (absent everywhere) | — |  |
| 4 · category · Mutual Fund · Unrealised | 2 | ₹80.4 L | ₹80.4 L |  |
| 4 · category · Mutual Fund · Weight | 3 | 12.60% | 12.58% |  |
| 4 · category · Mutual Fund · count | 2 | 11, 15 | 15 | 1 |
| 4 · category · PMS mandates · Invested | 3 | ₹124.6 Cr | ₹124.6 Cr |  |
| 4 · category · PMS mandates · MV | 7 | ₹138.7 Cr | ₹138.7 Cr |  |
| 4 · category · PMS mandates · Return | 3 | 11.36% | — |  |
| 4 · category · PMS mandates · Unrealised | 2 | ₹14.1 Cr | ₹14.1 Cr |  |
| 4 · category · PMS mandates · Weight | 3 | 19.40% | 19.45% |  |
| 4 · category · PMS mandates · count | 2 | 281 | 281 |  |
| 5 · Listed | 6 | ₹699.8 Cr, ₹702.7 Cr | ₹702.7 Cr | 3 |
| 5 · Listed (share %) | 1 | 99.00% | — |  |
| 5 · Not placed | 6 | ₹98,742 | ₹98,742 |  |
| 5 · Not placed (share %) | 1 | 0.00% | — |  |
| 5 · Private | 9 | ₹10.6 Cr | ₹10.6 Cr |  |
| 5 · Private (share %) | 1 | 1.00% | — |  |
| 6 · 360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii · cost | 5 | ₹98.7 L | ₹98.7 L |  |
| 6 · 360-one-special-opportunities-fund-series-8-class-a3-aif-category-ii · value | 5 | ₹1.47 Cr | ₹1.47 Cr |  |
| 6 · baring-private-equity-india-fund-6-class-a1 · cost | 5 | ₹2.03 Cr | ₹2.02 Cr |  |
| 6 · baring-private-equity-india-fund-6-class-a1 · value | 5 | ₹1.88 Cr | ₹1.88 Cr |  |
| 6 · neo-infra-income-opportunities-fund-i-class-a5 · cost | 5 | ₹5.00 Cr | ₹5.00 Cr |  |
| 6 · neo-infra-income-opportunities-fund-i-class-a5 · value | 5 | ₹5.55 Cr | ₹5.55 Cr |  |
| 6 · private funds · Σ cost | 1 | ₹8.76 Cr | — |  |
| 6 · transition-venture-capital-fund-i-class-a1 · cost | 5 | ₹75.0 L | ₹75.0 L |  |
| 6 · transition-venture-capital-fund-i-class-a1 · value | 5 | ₹1.71 Cr | ₹1.71 Cr |  |
| 7 · Aarti Jaisinghani · Invested | 1 | ₹75 Cr | ₹75 Cr |  |
| 7 · Aarti Jaisinghani · NAV | 4 | ₹128.8 Cr | ₹128.8 Cr |  |
| 7 · Aarti Jaisinghani · Return | 2 | 30.25% | 30.25% |  |
| 7 · Aarti Jaisinghani · Unrealised | 1 | ₹22.7 Cr | ₹22.7 Cr |  |
| 7 · Aarti Jaisinghani · positions | 3 | 7 | 7 |  |
| 7 · Ajay Jaisinghani · Invested | 1 | ₹254.3 Cr | ₹254.3 Cr |  |
| 7 · Ajay Jaisinghani · NAV | 4 | ₹349.4 Cr | ₹349.4 Cr |  |
| 7 · Ajay Jaisinghani · Return | 2 | 12.34% | 12.34% |  |
| 7 · Ajay Jaisinghani · Unrealised | 1 | ₹31.4 Cr | ₹31.4 Cr |  |
| 7 · Ajay Jaisinghani · positions | 3 | 177 | 174 | 3 |
| 7 · Ankita Jaisinghani · Invested | 1 | ₹113.9 Cr | ₹113.9 Cr |  |
| 7 · Ankita Jaisinghani · NAV | 4 | ₹168.8 Cr | ₹168.8 Cr |  |
| 7 · Ankita Jaisinghani · Return | 2 | 13.17% | 13.17% |  |
| 7 · Ankita Jaisinghani · Unrealised | 1 | ₹15 Cr | ₹15 Cr |  |
| 7 · Ankita Jaisinghani · positions | 3 | 112 | 110 | 3 |
| 7 · Bharat Jaisinghani Family Trust 2 · NAV | 3 | ₹1.71 Cr | ₹1.71 Cr |  |
| 7 · Bharat Jaisinghani Family Trust 2 · Return | 2 | 128.61% | 128.61% |  |
| 7 · Bharat Jaisinghani Family Trust 2 · Unrealised | 1 | ₹96.5 L | ₹96.5 L |  |
| 7 · Bharat Jaisinghani Family Trust 2 · positions | 1 | 1 | 1 |  |
| 7 · Bharat Jaisinghani Family Trust 3 · NAV | 3 | ₹1.71 Cr | ₹1.71 Cr |  |
| 7 · Bharat Jaisinghani Family Trust 3 · Return | 2 | 128.61% | 128.61% |  |
| 7 · Bharat Jaisinghani Family Trust 3 · Unrealised | 1 | ₹96.5 L | ₹96.5 L |  |
| 7 · Bharat Jaisinghani Family Trust 3 · positions | 1 | 1 | 1 |  |
| 7 · Bharat Jaisinghani · Invested | 1 | ₹27.3 Cr | ₹27.3 Cr |  |
| 7 · Bharat Jaisinghani · NAV | 4 | ₹66 Cr | ₹66 Cr |  |
| 7 · Bharat Jaisinghani · Return | 2 | 19.74% | 19.74% |  |
| 7 · Bharat Jaisinghani · Unrealised | 1 | ₹5.39 Cr | ₹5.39 Cr |  |
| 7 · Bharat Jaisinghani · positions | 3 | 73 | 67 | 3 |
| 8 · mandate 100022 · invested | 3 | ₹7.55 Cr | ₹7.55 Cr |  |
| 8 · mandate 100022 · value | 4 | ₹8.02 Cr | ₹8.02 Cr |  |
| 8 · mandate 100023 · invested | 3 | ₹17.6 Cr | ₹17.6 Cr |  |
| 8 · mandate 100023 · value | 4 | ₹18.8 Cr | ₹18.8 Cr |  |
| 8 · mandate 1000632 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 1000633 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 103472 · invested | 1 | ₹24.9 Cr | ₹24.9 Cr |  |
| 8 · mandate 103473 · invested | 1 | ₹46 Cr | ₹46 Cr |  |
| 8 · mandate 10355977 · invested | 1 | ₹31 Cr | ₹31 Cr |  |
| 8 · mandate 1201090012539150 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 1201090012838316 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 1201090012838320 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 1201090012838335 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 1201090037359311 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 1201090037436848 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 128004 · invested | 3 | ₹6.00 Cr | ₹6.00 Cr |  |
| 8 · mandate 128004 · value | 4 | ₹6.50 Cr | ₹6.50 Cr |  |
| 8 · mandate 128005 · invested | 3 | ₹19.9 Cr | ₹19.9 Cr |  |
| 8 · mandate 128005 · value | 4 | ₹20.3 Cr | ₹20.3 Cr |  |
| 8 · mandate 16180583 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 175962 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 175964 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 177302 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 3000048 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 3517383 · invested | 3 | ₹31.6 Cr | ₹31.6 Cr |  |
| 8 · mandate 3517383 · value | 4 | ₹39.5 Cr | ₹39.5 Cr |  |
| 8 · mandate 37702 · invested | 1 | ₹98.7 L | ₹98.7 L |  |
| 8 · mandate 49794950 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 510854 · invested | 3 | ₹5.11 Cr | ₹5.11 Cr |  |
| 8 · mandate 510854 · value | 4 | ₹5.80 Cr | ₹5.80 Cr |  |
| 8 · mandate 510861 · invested | 3 | ₹10.2 Cr | ₹10.2 Cr |  |
| 8 · mandate 510861 · value | 4 | ₹11.4 Cr | ₹11.4 Cr |  |
| 8 · mandate 60117 · invested | 1 | ₹98.7 L | ₹98.7 L |  |
| 8 · mandate 67786137 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 67786547 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 7810404 · invested | 3 | ₹1.05 Cr | ₹1.05 Cr |  |
| 8 · mandate 7810404 · value | 4 | ₹1.16 Cr | ₹1.16 Cr |  |
| 8 · mandate 8710067 · invested | 3 | ₹15.4 Cr | ₹15.4 Cr |  |
| 8 · mandate 8710067 · value | 4 | ₹16.5 Cr | ₹16.5 Cr |  |
| 8 · mandate 8710090 · invested | 3 | ₹10.1 Cr | ₹10.1 Cr |  |
| 8 · mandate 8710090 · value | 4 | ₹10.7 Cr | ₹10.7 Cr |  |
| 8 · mandate 9039671821 · invested | 1 | ₹75 Cr | ₹75 Cr |  |
| 8 · mandate 9039671854 · invested | 1 | ₹15 Cr | ₹15 Cr |  |
| 8 · mandate 9039671912 · invested | 1 | ₹25 Cr | ₹25 Cr |  |
| 8 · mandate 9039920536 · invested | 1 | ₹5.00 Cr | ₹5.00 Cr |  |
| 8 · mandate 90410014574 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate 90410016093 · invested | 1 | ₹10 Cr | ₹10 Cr |  |
| 8 · mandate 90410016104 · invested | 1 | ₹20 Cr | ₹20 Cr |  |
| 8 · mandate 904168868444 · invested | 1 | ₹21.4 Cr | ₹21.4 Cr |  |
| 8 · mandate 9049241536 · invested | 1 | ₹10 Cr | ₹10 Cr |  |
| 8 · mandate 9069671554 · invested | 1 | ₹22 Cr | ₹22 Cr |  |
| 8 · mandate 9069671634 · invested | 1 | ₹20.5 Cr | ₹20.5 Cr |  |
| 8 · mandate 98245 · invested | 1 | ₹1.22 Cr | ₹1.22 Cr |  |
| 8 · mandate SKY003 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate SKY022 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate SKY023 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate SKY024 · invested | 1 | — (absent everywhere) | — |  |
| 8 · mandate TVC262 · invested | 1 | ₹75.0 L | ₹75.0 L |  |
| 8 · mandate TVC263 · invested | 1 | ₹75.0 L | ₹75.0 L |  |
| 8b · account 103472 · value (txns) | 1 | ₹27.7 Cr | ₹27.7 Cr |  |
| 8b · account 103473 · value (txns) | 1 | ₹49.3 Cr | ₹49.3 Cr |  |
| 8b · account 3000048 · value (txns) | 1 | ₹0 | ₹0 |  |
| 8b · account 360-one-private-wealth-37702 · value | 1 | ₹1.47 Cr | — |  |
| 8b · account 360-one-private-wealth-60117 · value | 1 | ₹1.46 Cr | — |  |
| 8b · account 9039671821 · value (txns) | 1 | ₹97.7 Cr | ₹97.7 Cr |  |
| 8b · account 9039671854 · value (txns) | 1 | ₹19.6 Cr | ₹19.6 Cr |  |
| 8b · account 9039671912 · value (txns) | 1 | ₹29.4 Cr | ₹29.4 Cr |  |
| 8b · account 9069671554 · value (txns) | 1 | ₹29.4 Cr | ₹29.4 Cr |  |
| 8b · account 9069671634 · value (txns) | 1 | ₹28.5 Cr | ₹28.5 Cr |  |
| 8b · account TVC262 · value (txns) | 1 | ₹1.71 Cr | ₹1.71 Cr |  |
| 8b · account TVC263 · value (txns) | 1 | ₹1.71 Cr | ₹1.71 Cr |  |
| 8b · account baring-private-equity-india-fund-AIFM_BPEPF6_0584 · value | 1 | ₹1.88 Cr | — |  |
| 8b · account carnelian-bharat-amritkaal-fund-4551 · value | 1 | ₹16.3 Cr | — |  |
| 8b · account motilal-oswal-delphi-equity-fund-9049241536 · value | 1 | ₹11.1 Cr | — |  |
| 8b · account motilal-oswal-founders-fund-90410016093 · value | 1 | ₹11 Cr | — |  |
| 8b · account motilal-oswal-founders-fund-90410016104 · value | 1 | ₹21.8 Cr | — |  |
| 8b · account neo-infra-income-opportunities-fund-9039920536 · value | 1 | ₹5.55 Cr | — |  |
| 8b · account sanshi-fund-9039671821 · value | 1 | ₹97.7 Cr | — |  |
| 8b · account sanshi-fund-9039671854 · value | 1 | ₹19.6 Cr | — |  |
| 8b · account sanshi-fund-9039671912 · value | 1 | ₹29.4 Cr | — |  |
| 8b · account sanshi-fund-9069671554 · value | 1 | ₹29.4 Cr | — |  |
| 8b · account sanshi-fund-9069671634 · value | 1 | ₹28.5 Cr | — |  |
| 8b · account transition-venture-capital-TVC262 · value | 1 | ₹1.71 Cr | — |  |
| 8b · account transition-venture-capital-TVC263 · value | 1 | ₹1.71 Cr | — |  |
| 9 · called | 4 | ₹26.8 Cr | — |  |
| 9 · committed | 4 | ₹42.7 Cr | — |  |
| 9 · distributions | 3 | ₹49.9 L | — |  |
| 9 · paid | 2 | ₹26.8 Cr | — |  |
| 9 · pm-txns footer | 1 | — (absent everywhere) | — |  |
| 9 · uncalled | 7 | ₹16 Cr | — |  |
| 10 · Realised P&L (book total) | 15 | ₹8.7 L, ₹1.24 Cr, ₹1.32 Cr, ₹1.39 Cr | — |  |
| 10b · Realised · Direct Equity | 2 | ₹7.0 L | — |  |
| 10b · Realised · PMS mandates | 2 | ₹1.25 Cr, ₹1.32 Cr | — |  |
| 10c · Realised · account 128004 | 2 | ₹87.6 L | — |  |
| 10c · Realised · account 128005 | 2 | ₹1.12 Cr | — |  |
| 10c · Realised · account 3517383 | 2 | -₹53.4 L | — |  |
| 10c · Realised · account 510854 | 2 | -₹8.5 L, -₹5.6 L | — |  |
| 10c · Realised · account 510861 | 2 | -₹17.6 L, -₹11.8 L | — |  |
| 10c · Realised · account 7810404 | 2 | -₹3.7 L | — |  |
| 10c · Realised · account 98245 | 1 | ₹7.0 L | — |  |
| 11 · counts · Listed holdings | 1 | 353 | — |  |
| 11 · counts · Not placed holdings | 1 | 1 | — |  |
| 11 · counts · Private holdings | 1 | 4 | — |  |
| 11 · counts · accounts (holding a position) | 2 | 32 | 32 |  |
| 11 · counts · accounts (registry) | 1 | 51 | 51 |  |
| 11 · counts · companies (security axis rows) | 2 | 701 | — |  |
| 11 · counts · cross-held | 2 | 128 | — |  |
| 11 · counts · holdings without cost | 4 | 49, 65 | 49 | 1 |
| 11 · counts · losers | 3 | 116 | — |  |
| 11 · counts · names | 4 | 202, 213 | 202 | 1 |
| 11 · counts · positions | 5 | 358, 369, 371 | 358 | 2 |
| 11 · counts · winners | 3 | 175 | — |  |
| 11 · value · holdings without cost | 2 | ₹168 Cr | ₹168 Cr |  |

## Appendix — every auditor finding, by area

The consolidated IDs above (A-01 … D) merge these. Each auditor's full evidence — both numbers, the code, the probe — is summarised in its heading here.

### Morning CIO — KPI tiles, allocation, concentration, capital deployment

- CK-A1 — The money-weighted tile compounds 16 days that were never measured: it shows +30.1% and should show +26.5%
- CK-A2 — The Cash row shows Invested "₹0" beside ₹14.2 Cr whose cost no statement reports
- CK-A3 — On live prices, the money-weighted rate dates a live value at statement dates
- CK-B1 — Capital invested: the tile says ₹470.3 Cr and its drill-down's "Capital invested" headline says ₹545.3 Cr
- CK-B2 — The money-weighted drill-down calls ₹716.5 Cr "the book"
- CK-B3 — The +30.1% tile opens a page with no rate on it; that page's only return is +12.7%
- CK-B4 — Whole-book return: the tile shows +15.9%, the allocation Total row "—" and the Monitor's Total +15.94%
- CK-C1 — Rule 8: the ₹713.3 Cr blends eight dates, and the only date on screen is one on which nothing is valued
- CK-C2 — The asset-class axis says "nothing here is inferred from what the instrument is"; ₹11.2 Cr is
- CK-C3 — Partial Invested sums carry no coverage, and the Total link's hover misstates the set
- CK-C4 — The footer Return is a bare "—" with no reason
- CK-C5 — The Listed / Private / Not placed hovers describe a rule the book no longer follows
- CK-C6 — The Consolidated return and money-weighted tiles state no basis or coverage
- CK-C7 — "Return (total)" is not a total return
- CK-C8 — The Positions and Distinct names hovers misdescribe their units
- CK-C9 — Distributions (and Uncalled) coverage and dates are not stated, and the tile's destination does not show Distributions
- CK-C10 — The "Invested covers …" hover puts the costed holdings' current value where Invested is expected
- CK-C11 — "5 baskets held" and "5 asset classes held" count the Not-classified section
- CK-C12 — The Concentration card's percentages state no denominator

### Morning CIO — Daily movers, NAV vs Nifty 500, the top bar and index strip

- MNT-1 — A — CONFIRMED — "₹28.3 Cr not proven" is ten times the move it qualifies, and its premise is false for all four accounts
- MNT-2 — B — CONFIRMED — the NAV-movers card prices funds at 9 Sept while every other surface prices the same schemes at 22 Sept
- MNT-3 — B — CONFIRMED — DSP Gold and Silver ETF: a per-unit NAV ten times below the per-unit mark the Monitor prints, with nothing on screen explaining it
- MNT-4 — B — CONFIRMED — the NAV card's own parts do not add to the book it names, and the reconciling sentence names the wrong cause
- MNT-5 — B — CONFIRMED (documented decision, Stage 10bn) — top bar ₹713.3 Cr against Private Market's "₹710.4 Cr book" on the same screen
- MNT-6 — B — CONFIRMED (probe; renders in the live state) — Direct Equity is 37 names on the movers card and 35 on its drill-down
- MNT-7 — C — CONFIRMED — "Marks as of 2026-08-29" is the date of two accounts that carry no valued position
- MNT-8 — C — CONFIRMED — three captions say every holding shows its statement mark; 25 rows worth ₹103.98 Cr show AMFI's 22 Sept NAV
- MNT-9 — C — CONFIRMED (probe) — the Live pill's hover never mentions the holdings the feed can never price
- MNT-10 — C — CONFIRMED — NAV movers "Held" hover and basis sentence: "on its own statement of {date}"; 10 of 12 values are at AMFI's 22 Sept NAV
- MNT-11 — C — CONFIRMED — "What moved today" over a NAV move 14 days old
- MNT-12 — C — CONFIRMED — the dashed "NAV incl. capital added" line is rebased on 10 Jul, not the 31 May the subtitle names
- MNT-13 — C — CONFIRMED (code) — "1Y of Nifty 500 closes ending at the book's last statement date": the line runs to today
- MNT-14 — C — CONFIRMED — two measured nil balances are labelled "an absent valuation, not a measured zero"
- MNT-15 — C — CONFIRMED (documented decision) — ₹14.24 Cr of liquid mutual funds and ETFs silently excluded from "ETFs & mutual funds"
- MNT-16 — C — CONFIRMED (documented decision, Stage 10ao) — "Direct Equity · today" multiplies today's price move by quantities up to 176 days old, and gives no date
- MNT-17 — C — CONFIRMED (probe) — the excluded footer reads "131 PMS mandates ₹137.5 Cr"
- MNT-18 — C — SUSPECTED — cached prices plus a failed fetch: the top bar says "feed down / nothing substituted" while cached live prices are applied
- MNT-19 — C — SUSPECTED — "today" and "NSE · live" outside a trading session
- MNT-20 — D — CONFIRMED — the gap sentence prints percentage points as "%"
- MNT-21 — D — CONFIRMED (code) — the FX source label is wrong when the fallback answers
- MNT-22 — D — CONFIRMED — SVAN's ₹23,931 of withdrawals inside the window are not netted in the chain
- MNT-23 — D — CONFIRMED (code) — the "— no return" pill gives no reason
- MNT-24 — D — CONFIRMED — the subtitle hover's "measured over the accounts valued at both of its ends" counts carried marks as valuations
- MNT-25 — D — CONFIRMED — "₹140.2 Cr of the ₹713.3 Cr book" divides a statement level by a NAV-overlaid (or live) total

### Portfolio Monitor — Holdings (category, asset class, basket; by entity)

- MH-01 · A · CONFIRMED — every annualised return on the Monitor is struck over a window that ends on a date nothing is valued at
- MH-02 · A · CONFIRMED — DSP Gold ETF: the consolidated row prints one lot's price over another lot's units
- MH-03 · A · CONFIRMED (by probe; no entity-filtered dump exists) — under the entity filter, Realised P&L includes other members' gains
- MH-04 · B · CONFIRMED — the footer Return shows a figure that Morning CIO refuses for the same total
- MH-05 · B · CONFIRMED — the Monitor's Realised totals disagree with Capital Gains and Ledger, and nothing says why
- MH-06 · B · CONFIRMED — "N holdings" means three different counts on one screen and its drill-down
- MH-07 · B · CONFIRMED — the Sector column says "Unclassified" where every other page names the sector
- MH-08 · C · CONFIRMED — the CMP hover dates every statement mark "as of 2026-08-29", and the page never says its figures blend dates
- MH-09 · C · CONFIRMED — the Return hover says "No purchase date on file" beside a cell that shows the purchase dates
- MH-10 · C · CONFIRMED — dashes with no reason in three columns, and a code comment that says otherwise
- MH-11 · C · CONFIRMED — the footer's Invested and P&L cover part of the book and do not say so; the Return popover says "listed book"
- MH-12 · C · CONFIRMED — on `?view=entity` the totals do not add up to the rows above them, and the Weight hover claims 100%
- MH-13 · C · CONFIRMED — "₹0 reported twice, counted once" on sections with no duplicate
- MH-14 · C · CONFIRMED — the Cash section's refused return gives the wrong cause, and its Invested prints ₹0
- MH-15 · C · CONFIRMED — the Buoyant cash-sleeve row gives three wrong reasons
- MH-16 · C · CONFIRMED · documented (Stage 10bm) — Avg cost changes meaning between the two views
- MH-17 · D · CONFIRMED — wording that points at removed controls, and stale comments
- MH-18 · D · CONFIRMED — the mandate rows' return note promises something that cannot happen
- MH-19 · D · CONFIRMED — "₹100 L" for ₹99,99,500
- MH-20 · D · CONFIRMED · documented (Stage 10az) — Helios Flexi Cap Fund · Direct appears twice under one name

### Portfolio Monitor — Transactions

- MT-1 · A · CONFIRMED — the family's own ₹35.01 Cr Buoyant subscriptions are counted again as manager dealing
- MT-2 · A · CONFIRMED — Buoyant tape: the NAV is read as the unit count, and the price is derived from it
- MT-3 · A · CONFIRMED — the Capital block omits ₹91.49 Cr of dated family capital in 14 accounts, and its "13 of 51 accounts" claim is false
- MT-4 · A · CONFIRMED (rendered in the browser) — any date preset fabricates Gain and HPR for unit-tied accounts
- MT-5 · A (with B vs Capital Gains / Ledger Insights) · CONFIRMED — Realized P&L drops ₹8.66 L of reported gains because the lot and the sale carry different security keys
- MT-6 · B · CONFIRMED — "HPR" is two different returns on the Monitor's two tabs
- MT-7 · B · CONFIRMED (and a family question) — the Value today and Gain footers count the Transition Venture holding twice
- MT-8 · C · CONFIRMED — "Invested on" spans withdrawal dates
- MT-9 · C · CONFIRMED — "Value today" blends statement dates and names no date
- MT-10 · C · CONFIRMED — the same liquid ETF is Cash on the Holdings tab and Direct Equity here
- MT-11 · C · CONFIRMED — the Buoyant Class A1 row sits under a "Not classified" heading whose reason is false
- MT-12 · C · CONFIRMED — Realized absence reasons and coverage counts misstate why a figure is missing
- MT-13 · C · CONFIRMED — a security row's drill-down shows two same-named lines, each denying the other
- MT-14 · C · CONFIRMED — the "staggered" pill on a sell-down says "Built up"
- MT-15 · C · CONFIRMED — the Capital/Trades framing mislabels own-account trading and the capital drill-down
- MT-16 · C · CONFIRMED — the date window produces wrong labels and a zero that is not measured
- MT-17 · C · CONFIRMED — 3P's Gain and Return are withheld with a reason that is false
- MT-18 · D · CONFIRMED — latent zero defaults and bare dashes (nothing misrenders today)

### Portfolio Monitor — security axis, and the Excel export

- MSX-1 · A · CONFIRMED — ICICI Bank row: cost of 7,000 shares set against the value of 21,500
- MSX-2 · A · CONFIRMED — Realised column shows exited names' gains the footer does not count
- MSX-3 · A · CONFIRMED — a fund's paper in a company the family holds lands on a separate row (issuer join does not consult the book's ISIN)
- MSX-4 · A · CONFIRMED — one company under two book keys: SBI, Karur Vysya, Crompton each drawn twice
- MSX-5 · A · CONFIRMED (code + arithmetic; the dump did not open security-axis rows) — expanded row pairs the measured rupee figure with the total-exposure percentage
- MSX-6 · B · CONFIRMED — Sector column and `?sector=` filter disagree with Sector Composition on the same companies
- MSX-7 · B · CONFIRMED — Realised P&L footer +₹1.39 Cr vs Capital Gains' canonical +₹1.32 Cr, basis unstated
- MSX-8 · B · CONFIRMED — a single CMP shown where the statements carry two marks; the stock page refuses one
- MSX-9 · B · CONFIRMED — Excel "Holdings" lists closed positions and the ₹1,000 specks the screen drops
- MSX-10 · B · CONFIRMED — Excel "Return" is always cumulative on cost and unlabelled; the screen's default Return shows a CAGR
- MSX-11 · B · CONFIRMED — "the book's own cash" ₹11.6 Cr on this axis vs CASH ₹14.2 Cr on the category axis of the same table
- MSX-12 · C · CONFIRMED — derived-only rows carry absent-cell reasons that are false of them; costless rows carry none
- MSX-13 · C · CONFIRMED — the CMP hover dates every statement mark "as of 2026-08-29"
- MSX-14 · C · CONFIRMED — the look-through coverage wording
- MSX-15 · C · CONFIRMED — coverage counts over the wrong denominator
- MSX-16 · C · CONFIRMED (code) — footer popovers describe a different set and formula on this axis
- MSX-17 · C · CONFIRMED — the Excel carries no as-of date, no price basis and no reason for its dashes
- MSX-18 · C · CONFIRMED — the Excel P&L note calls redeemed rows "no cost basis"
- MSX-19 · C · SUSPECTED — the Transactions sheet can export empty under "full dated buy/sell tape"
- MSX-20 · D · CONFIRMED — FundExposure instrument breakout under the wrong headings
- MSX-21 · D · CONFIRMED — derived rows named after one instrument
- MSX-22 · D · CONFIRMED — Excel Transactions quantities are rounded in the cell value
- MSX-23 · D · CONFIRMED — "every total beside it" overstates what the floor removes on this axis (documented decision)

### Private Market

- PM-A1 — The "₹3.17 Cr double count" is, on the funds' own registers, two pairs of SEPARATE investments — A · SUSPECTED (strong evidence; documented §4c policy "pending confirmation")
- PM-A2 — The Transition Venture row (and the bands above it) put two holdings' capital beside one holding's units, cost and value — A · CONFIRMED (arithmetic on the row)
- PM-A3 — Neo Infra's cost includes ₹14,16,280 of principal the fund has already returned — A · CONFIRMED
- PM-B1 — Private Market's "book" is ₹710.4 Cr while the top bar on the same screen and every drill-down say ₹713.3 Cr — B · CONFIRMED · documented decision (Stage 10ap/10bn)
- PM-B2 — Two different "cash paid back" figures on one page — B · CONFIRMED · partly a documented decision (Stage 10bw: equalisation is not a distribution)
- PM-B3 — The private drill-down lists 10 unvalued private folios; Private Market lists 9, and the drill-down's sentence is false for 3 of its 10 — B · CONFIRMED
- PM-C1 — "HPR = current value against the capital paid in" — the figure is value against COST — C · CONFIRMED
- PM-C2 — Neo Infra shown as "Category not stated"; its statement prints "AIF -Category-II" — C · CONFIRMED
- PM-C3 — Transition Venture's category hover quotes words its statement does not print — C · CONFIRMED
- PM-C4 — "11 of 11 capital accounts print a called line" — one does — C · CONFIRMED · derivation documented in the readers
- PM-C5 — Tile captions describe a different set from the figure — C · CONFIRMED
- PM-C6 — Capital columns sit beside holding columns on a wider set, with no coverage caveat — C · CONFIRMED
- PM-C7 — 360 ONE fund row dated "30 Jun → 31 Jul 2026"; its value is the 31 Jul statement alone — C · CONFIRMED
- PM-C8 — "Not valued · 3 funds" counts a fund valued two sections up — C · CONFIRMED
- PM-C9 — Transactions tab says it shows what can still be called; it shows only the call history — C · CONFIRMED
- PM-C10 — Member rows' return cells contradict their own folio rows — C · CONFIRMED (probe p3)
- PM-D1 — By owner, "Weight · of private" adds to 129.9% — D · CONFIRMED · documented
- PM-D2 — "₹1.4 L" for a ₹1,35,000 call — D · CONFIRMED
- PM-D3 — The pooled XIRR +21.1% is mostly one 165-day holding — D · CONFIRMED · observation
- PM-D4 — Morning CIO shows private at "1" %, PM at "1.5%" — D · CONFIRMED
- PM-D5 — Tile denominator and sides total differ by ₹848.24 — D · CONFIRMED
- PM-D6 — Monitor shows Baring quantity "203" for 202.500 units — D · CONFIRMED (Monitor area)
- PM-D7 — A capital call typed on the income-only 360 ONE row would not appear on the valued 360 ONE row — D · SUSPECTED

### Family & Entities, and Sector Composition

- FS-1 · A · CONFIRMED — the entity Weight column is struck on a total its own popover says it is not
- FS-2 · A · CONFIRMED — the P&L and Return popovers print arithmetic that does not give the figure beside them
- FS-3 · A · CONFIRMED — "701 companies" counts five companies eleven times; ₹52 L of bank CDs sit in Unclassified
- FS-4 · B · CONFIRMED — the six entity NAVs add to ₹716.5 Cr on a page whose book is ₹713.3 Cr, and the overlap is not stated
- FS-5 · B · CONFIRMED — Family & Entities is the one allocation surface that does not apply `currentHoldings`
- FS-6 · B · CONFIRMED — on each entity page the excluded-classes caption and the holdings table below it disagree
- FS-7 · B · CONFIRMED — "Mutual Fund / ETF / Cash" carry different values on different pages, with no basis stated
- FS-8 · B · CONFIRMED — the same seven accounts' money-weighted return: +25.9% and +28.7% on Family, +30.1% "over 150 days" on Morning CIO
- FS-9 · B · CONFIRMED — the Monitor's Sector column contradicts the sector these pages give the same company
- FS-10 · C · CONFIRMED — "STATEMENT … every figure is on its statement mark … it is the printed book", over fund values struck on 22 Sep AMFI NAVs
- FS-11 · C · CONFIRMED — Return (to date): an annualised rate over 134 days, and no window stated
- FS-12 · C · CONFIRMED — two dash reasons that name the wrong cause
- FS-13 · C · CONFIRMED — the Consolidated view counts bonds, CDs and T-bills as "companies" and then says non-equity is not on the page
- FS-14 · C · CONFIRMED — "Top holding" names companies the family holds no position in
- FS-15 · C · CONFIRMED — the derived half blends two dates, and neither is shown
- FS-16 · C · CONFIRMED — the "held, and not valued here" subtitle misdescribes four of its accounts
- FS-17 · C · SUSPECTED (live basis only) — Return (to date) on a live feed dates today's value to the statement dates
- FS-18 · C · CONFIRMED — the pill hover says the 49 unpriceable securities are "cash and the liquid-fund sweep" that "never will" quote
- FS-19 · C · SUSPECTED (live basis only) — the Consolidated pill hint names two sector tiers; the page uses three
- FS-20 · D — cash and TDS lines print "Unclassified" in the entity Sector column
- FS-21 · D — Direct Equity donut hover promises company dedupe beside a holdings count
- FS-22 · D — "12 sectors" / "9 sectors" counts Unclassified as a sector (SectorComposition.tsx:568).
- FS-23 · D — the entity sector-mix tooltip labels a sector's company-share value "NAV" (FamilyEntities.tsx:809).
- FS-24 · D — smaller wording and dead text

### Polycab

- PC-02 · C · CONFIRMED · Rule 8 — CMP, Day and Market value at CMP carry no date, beside an "As of 31 Mar 2026" column.
- PC-03 · C · CONFIRMED (history) / SUSPECTED (live label) · Rule 8 — "last settled close" and "live" are not checked against the session.
- PC-04 · C · CONFIRMED · ring-fence list ("no chat context") + Rule 8 — Polycab's name and value are in the Muns chat context, without date, share count or scope.
- PC-05 · C · CONFIRMED (module probe + component code) · Rule 1 — the top-bar search says "Nothing in this book … matches" for the company's full name and its ISIN.
- PC-06 · C · CONFIRMED · Rule 1 — "Carried by two independent sources" is false for half the promoter quarters.
- PC-07 · C · CONFIRMED (caption) / SUSPECTED (field) · Rule 6 — the promoter table's two percentages do not say what they are a percentage of, and the pledge can come from either of two differently-based fields.
- PC-08 · C · CONFIRMED (reason) / SUSPECTED (cause) · Rule 1 — the Paid dash on 9 Jul 2024 gives a reason the same table contradicts.
- PC-09 · C · CONFIRMED · documented decision · Rule 1 — "Pledged · this demat" says the statement prints no lock-in column; the statement prints balance type, including lock-in, and prints "Beneficiary" for the whole Polycab balance.
- PC-10 · C · CONFIRMED · documented decision · Rule 1 ("a figure that exists for SOME accounts is shown for those and the rest are named") — the page shows one demat and says nothing about the second promoter statement.
- PC-11 · D · CONFIRMED · Rule 2 caption — the fenced look-through slice is absorbed by residuals captioned as something else.
- PC-12 · D · CONFIRMED · Rule 8 — the Mark hover says "as of the statement's date"; the statement values at "Prices as on 30-Mar-2026".
- PC-13 · D · CONFIRMED — the Day hover says "as the exchange publishes it"; the cell shows the DERIVED change.
- PC-14 · D · SUSPECTED (latent) — "whole since listing" rests on `actionsComplete`, which is set on any non-empty response.
- PC-15 · D · CONFIRMED — the group-pledge dash reason reads as a claim about the disclosures.
- PC-16 · D · SUSPECTED (latent, one row today) — the multi-row path would blend dates silently.
- PC-17 · D · CONFIRMED — `docs/POLYCAB-LIVE.md` prints "—" in the Record column for the five book-closure rows
- PC-18 · D · CONFIRMED — the sources line under the Corporate-actions table credits Tickertape and Screener

### Drill-downs — /holdings, /stock/:key, /mandate/:account

- DSM-A1 · A · CONFIRMED — ICICI Bank's average cost divides a costed subset's cost by the whole quantity
- DSM-A2 · A · CONFIRMED — DSP Gold ETF and DSP Silver ETF "Scheme returns" are unit-split artifacts
- DSM-A3 · A (arguably C) · CONFIRMED — "Held in N entities" counts accounts
- DSM-A4 · A (arguably C) · CONFIRMED — the AIF drill-down's unvalued list says 10 folios hold units that no statement values; 3 are wrong
- DSM-A5 · A · CONFIRMED — CAGR is annualised to the book's newest date, not to the date the return was measured
- DSM-A6 · A · CONFIRMED — Axis Liquid Fund's realised gain is on the statements but shows "—" (extractor identity split)
- DSM-B1 · B · CONFIRMED — the "Capital invested" drill-down headlines the market value
- DSM-B2 · B · CONFIRMED — the money-weighted drill-down shows a different return from its tile
- DSM-B3 · B · CONFIRMED · Doc (known defect, 10az) — Helios Flexi Cap is two identical-looking pages
- DSM-B4 · B · CONFIRMED — DSP Gold ETF mark
- DSM-B5 · B/C · CONFIRMED — a fund page shows two NAVs, both called "AMFI's"
- DSM-B6 · B · CONFIRMED — ICICI Bank P&L differs between the stock page and the Monitor
- DSM-B7 · B (maybe C) · CONFIRMED · Doc — the "book" denominator changes on one scope
- DSM-C1 · C · CONFIRMED — the statement-marks paragraph blames live quotes for the NAV overlay
- DSM-C2 · C · CONFIRMED — mandate pages carry the book's date
- DSM-C3 · C · CONFIRMED (code) — expanded statement lines print quantity under the Weight heading
- DSM-C4 · C · CONFIRMED — the look-through's "holding" date is the statement date, but the value is priced at the NAV
- DSM-C5 · C · CONFIRMED — Active Momentum's match is claimed on the ISIN, which it does not have
- DSM-C6 · C · CONFIRMED — mandate "Invested" and "Net invested" are different figures with nothing reconciling them
- DSM-C7 · C · CONFIRMED — the Cash drill-down prints ₹0 Invested and ₹0 P&L beside ₹14.2 Cr
- DSM-C8 · C · SUSPECTED — the footer mixes sets under a search filter
- DSM-C9 · C · CONFIRMED — sector chips disagree with Sector Composition
- DSM-C10 · C · CONFIRMED — the manager-trades realised reason is false on 70 rows

### Search, and the Muns chat context

- SC-A1 · A · CONFIRMED — the chat hands the model `valueCr: 0` for twelve accounts no statement values
- SC-B1 · B · CONFIRMED — the chat's figures are statement marks; the screen behind it shows published NAVs (and live prices when the feed is up)
- SC-B2 · B · CONFIRMED — the chat's counts include rows the dashboard excludes
- SC-B3 · B · CONFIRMED — the chat's commitments cover all 15 capital accounts; the dashboard covers the 11 private-market ones
- SC-B4 · B · CONFIRMED — the search says "no statement reports it" about funds the book holds and displays
- SC-B5 · B · CONFIRMED — the chat's `top_holdings` ranks statement rows, not holdings
- SC-C1 · C · CONFIRMED — the chat panel's own description of its snapshot is untrue in three places
- SC-C2 · C · CONFIRMED — search member rows say "as their own statements print it" over NAV-overlaid values
- SC-C3 · C · CONFIRMED — search account rows date a NAV-overlaid value with the statement's as-of
- SC-C4 · C · CONFIRMED — a holding row's category word is the category of whichever row sorts first
- SC-C5 · C · CONFIRMED — "the redemption is on Transactions" is false for the HDFC folio
- SC-C6 · C · CONFIRMED — two figure results open a page that does not show the figure
- SC-C7 · C · CONFIRMED — two search keywords claim what the book does not hold
- SC-C8 · C · CONFIRMED — the chat tells the model a placement rule that is no longer the rule
- SC-C9 · C · CONFIRMED — the chat says per-security XIRR is not carried; Private Market shows per-fund XIRR
- SC-C10 · C · CONFIRMED — chat figures sent without their date or basis
- SC-D1 · D · CONFIRMED — non-zero holdings render as "0.00% of the book"
- SC-D2 · D · CONFIRMED — account holding counts include the rows the family's ₹1,000 floor removes
- SC-D3 · D — smaller items

### Extras and Admin — NAV & Performance, Returns, Capital Gains, Ledger, Data Audit, Data Refresh, Snapshot History

- XA-1 · Capital Gains "Est. tax on realised" is netted across three taxpayers
- XA-2 · /history "Change" column: panel growth reported as change in value
- XA-3 · /performance Value bridge "Opening value" equals the closing value on every since-inception performance-history column
- XA-4 · /performance Value bridge "Closing value" of the five Sanshi folios is the capital invested
- XA-5 · Morning CIO money-weighted tile de-annualises over a window that ends after every pooled account closes (cross-check)
- XA-6 · Liquid-fund realised gains (₹8,65,685.59) are unjoined and reported as "not on the tape"
- XA-7 · /performance Value bridge "Fees & expenses" shows fees only, and accrued income is missing
- XA-8 · Equity rates are applied to liquid-fund gains
- XA-9 · Realised P&L has four values on four surfaces
- XA-10 · Position counts disagree between /upload, Morning CIO and /performance
- XA-11 · /upload and /returns classify sectors on the statement tier only
- XA-12 · STATEMENT pill and "statements' own marks" over NAV-overlaid figures
- XA-13 · /upload and /history call a NAV-overlaid total "statement" and date it 29 Aug
- XA-14 · /performance money-weighted return: wrong terminal date and annualised hovers
- XA-15 · /performance TWRR grid: false absence reasons and unmarked return types
- XA-16 · Lot-date claims are false on Capital Gains and Ledger Insights
- XA-17 · /returns Maximum drawdown is marked absent on a stale premise
- XA-18 · Ledger Insights "as of" is not the ledger's date
- XA-19 · /history "₹0 under Capital in is measured" and "held at its latest mark" are false in places
- XA-20 · Data Audit grid places short rows by position
- XA-21 · Value bridge headings say "FY to date" for windows that are not financial years
- XA-22 · Tax-loss harvesting list is on statement marks up to 151 days old
- XA-23 · /performance "Dated flows 4" for Buoyant 103473 counts the class-switch legs
- XA-24 · /returns "Names in profit" counts positions, not names
- XA-25 · /returns contributors list repeats one fund four times
- XA-26 · /audit document chips are labelled by date only
- XA-27 · Dead code
- XA-28 · A CapitalGains code comment is wrong about LKP
- XA-29 · ">100% annualised quarter" wording beside an 89.5% rate

### Hand verification against the documents

- VD-1 · A · CONFIRMED (evidence) · documented policy §4c "pending confirmation" — both "duplicated" holdings are separately registered investments
- VD-2 · A · CONFIRMED · documented rule "a rate of 0.000 is not priced" — depository rows with rate 0 are dropped although the book prices the same ISIN
- VD-3 · A · CONFIRMED — Neo Infra's cost includes ₹14,16,280 of principal already returned
- VD-4 · A · CONFIRMED — the Money-weighted return KPI is de-annualised over the wrong window
- VD-5 · A · CONFIRMED — the DSP Gold stock page prints split artefacts as the scheme's returns
- VD-6 · A · units CONFIRMED, amount SUSPECTED — Baring's capital account is stale and a statement in the book contradicts it
- VD-7 · A · SUSPECTED · the advice's exclusion is a documented decision — Ankita's 3P redemption of ₹21.43 Cr appears nowhere
- VD-8 · A · CONFIRMED — quantity-only rows inside a partly-valued account show on no screen, and the entity cards' counts are wrong
- VD-9 · B · CONFIRMED — a consolidated CMP is the first statement's mark
- VD-10 · B · CONFIRMED — 360 ONE Special Opportunities is both "valued" and "not valued · missing data" on Private Market, and its distributions are counted nowhere
- VD-11 · B · CONFIRMED · outside my area — SBI is two companies on the Monitor's security axis
- VD-12 · B · CONFIRMED · outside my area — the measured drill-down's "book" is ₹716.5 Cr
- VD-13 · C · CONFIRMED — the "no live price" hover dates every statement mark to the book's newest as-of
- VD-14 · C · CONFIRMED — "Invested on —" gives a false reason
- VD-15 · C · CONFIRMED — every CAGR in the scheme-return tables is labelled "Simple"
- VD-16 · C · CONFIRMED — Sanshi and Carnelian Amritkaal are valued at pre-tax NAV without saying so
- VD-17 · C · CONFIRMED — ICICI NSDL values are 30-Mar-2026 prices with no date on the stock pages
- VD-18 · C · CONFIRMED — ABSL Liquid is fully pledged and filed as Cash / Liquidity
- VD-19 · C · CONFIRMED — the Active Momentum page says "no ISIN reported"
- VD-20 · C · CONFIRMED — Neo Infra's CMP gives a false reason
- VD-21 · C · SUSPECTED — Ankita's depository marks look stale
- VD-22 · C · CONFIRMED — the Distributions label
- VD-23 · D · CONFIRMED — a spurious "₹0 reported twice" on the Mutual Fund heading
- VD-24 · D · CONFIRMED — stamp duty is treated two ways in cost
- VD-25 · D · CONFIRMED — Carnelian's flows miss a July payout
- VD-26 · D · CONFIRMED — display rounding

### Cross-page comparison

- XP-1 · A · CONFIRMED — Morning CIO's "Money-weighted return +30.1%" compounds 16 days nobody measured; `/performance` and `/family` strike the same rate over 134 days
- XP-2 · A · CONFIRMED — Family & Entities "WEIGHT" divides by the per-owner sum ₹716.5 Cr while its popover states the consolidated ₹713.3 Cr; the popover's own arithmetic says "this does not reproduce"
- XP-3 · A · CONFIRMED — Portfolio Monitor "Realised P&L": the footer (+₹1.39 Cr) and the PMS-mandates section total (+₹1.32 Cr) do not tie to the visible column (Σ = +₹6.98 L); the disclosure the code computes for this is rendered nowhere
- XP-4 · B · CONFIRMED — Realised P&L: one book, three totals on three surfaces, none saying why
- XP-5 · B · CONFIRMED (documented decision) — "The book" is ₹713.3 Cr, ₹710.4 Cr and ₹716.5 Cr depending on the page; "Listed" is ₹702.7 Cr and ₹699.8 Cr
- XP-6 · B · CONFIRMED (two documented decisions that contradict) — the whole-book return on cost is printed on three surfaces and refused on two
- XP-7 · B · CONFIRMED — Position / name / no-cost counts: 358 · 202 · 49 on Morning CIO and `/holdings`; 371 · 213 · 65 on `/upload`; 369 of 371 on `/performance`; Σ 371 on `/family`
- XP-8 · B · CONFIRMED — Monitor section headings' "N holdings" count rows for funds but statement lines for mandates, and disagree with the drill-down of the same section
- XP-9 · B · CONFIRMED — "Mutual Fund", "ETF" and "Cash" carry two different values under the same words
- XP-10 · B · CONFIRMED — Two NAVs for one scheme are live at once (valuations 22 Sep; NAV movers and the fund page's scheme card 9 Sep), and the movers card mislabels which one values the holding
- XP-11 · B · CONFIRMED — A company's sector depends on the page: the Monitor's Sector column and `/upload` coverage read only the statements' own field; Family and Sector Composition read the three-tier index
- XP-12 · C · CONFIRMED — The basis pill and the top bar say every figure is "on its statement mark … the printed book, as of 2026-08-29", while ~₹104 Cr of funds is valued at AMFI NAVs dated 2026-09-22
- XP-13 · C · CONFIRMED — Every `/holdings` drill-down's footer hover states the whole book's exclusions ("5 closed positions are not listed … 6 holdings worth under ₹1,000 are dropped automatically, ₹841"), including sets that contain none of them
- XP-14 · C · CONFIRMED — Three Monitor section headings claim "₹0 reported twice, counted once" (hover: "The same holding is reported on two members' statements") where nothing is reported twice
- XP-15 · C · CONFIRMED — `/performance` money-weighted hover dates the close "at 2026-08-29"; the accounts close 2026-07-27 … 2026-08-13 (its own subtitle says so)
- XP-16 · C · CONFIRMED — Capital Gains "Realised gains by account" footer prints "7 of 51 accounts" in the LOTS column; the column's rows sum to 212 lots
- XP-17 · D · CONFIRMED — Sanshi Fund-I Class E (Aarti): `/acct/sanshi-fund-9039671821` "30.24% … on what was paid in" vs `stock-sanshi…-class-e` "HPR +30.3%" (on cost)
