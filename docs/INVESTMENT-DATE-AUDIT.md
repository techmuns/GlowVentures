# Portfolio Monitor: purchase costs, dates and HPR

21 October 2026. Whole family, live basis, Category view. Account-level holdings and displayed rows are different denominators: several accounts can hold one security; PMS accounts are grouped into strategy rows. The previously reported **446 of 474** is purchase-cost coverage across account-level valued holdings, not date coverage or HPR coverage.

## Coverage by category

The baseline was read from production. The repaired date counts below reconcile that same security universe with the source-backed date derivation. A labelled **review** range is the family product's June-review date context; it does not verify the original lots of every current custody unit.

| Category | Costed account holdings | Dates before | Dates after | Of after, product-review context only | HPR rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| Direct Equity | 26 / 40 | 4 / 36 | 26 / 36 | 5 | 22 / 36 |
| PMS mandates | 289 / 289 | 6 / 6 | 6 / 6 | 0 | 6 / 6 |
| Mutual Fund | 24 / 27 | 4 / 15 | 15 / 15 | 3 | 11 / 15 |
| AIF | 21 / 21 | 10 / 10 | 10 / 10 | 0 | 10 / 10 |
| Bond | 1 / 1 | 1 / 1 | 1 / 1 | 0 | 1 / 1 |
| Unlisted | 1 / 1 | 1 / 1 | 1 / 1 | 0 | 1 / 1 |
| Private investments at cost | 76 / 76 | 61 / 61 | 61 / 61 | 0 | 0 / 61 |
| Cash, including liquid/arbitrage funds | 8 / 19 | 1 / 13 | 6 / 13 | 2 | 7 / 13 |
| Total | **446 / 474** | **88 / 143** | **126 / 143** | **10** | **58 / 143** |

“Costed” includes partial cost coverage at the displayed-security level. A security's HPR can cover a costed subset while other accounts holding it still lack cost. Private investments carried at cost have dates and costs, but no measured valuation gain/HPR; 0/61 is expected until actual valuations exist.

## What was recoverable

- The cost recovery retained 44 exact owner/account/ISIN/quantity matches but omitted acquisition-date metadata. Its original FIFO lots now carry the first/last dates and surviving lot count. Fully consumed purchases and bonus/split dates do not become dates of the units still held. Wrong-sign sale proceeds do not erase known acquisition dates, and do not become verified HPR.
- One **Investment date / range** column replaces the separate review and Invested on columns in Portfolio Monitor. It reads folio allotments, lot dates, complete manager trade records, eligible capital calls and the position's own reviewed investment dates. If those cannot date the current balance, an exact family-product review range may appear with the visible **review** qualifier and source cell in its explanation. A month-only date stays a month.
- The saved column order, visibility and sort migrate to the merged column. The Excel export reads the same derivation and retains the review qualifier.
- The source-rebuilt acquisition dates are retained from the published date recovery. This unified-column follow-up leaves the generated book byte-identical to current main: no cost, quantity, mark, account or return changes. The existing cost recovery remains 44 records.

## Remaining date gaps

**Direct Equity:** the ten blank security rows are Ankita's nine bank balances (Axis, City Union, Federal, ICICI, Indian, IndusInd, Karur Vysya, RBL and SBI) and Bharat's LKP Belrise holding. Belrise's 12,500-share cost of ₹1,773,625 is already recorded; its dated trades start on 25 June 2026, after the 31 March holding. Request its original acquisition dates/lots, not its cost again. The five context-only rows are ESDS, Kaynes, Insolation, Nuvama and Vedanta: their quantity/transfer bridges remain required as set out in the client request.

**Mutual Fund:** all 15 rows can show some date context, but Bandhan Large & Mid Cap Direct and the two HDFC Balanced Advantage plan rows carry product-review ranges only. Existing unit/folio discrepancies prevent treating those ranges as verified dates for every current unit.

**Cash:** seven security rows remain without a complete purchase date: Hope India Trust's ABSL Liquid Daily IDCW, ABSL Liquid Growth, Kotak Liquid Daily IDCW and Mirae Liquid; Ajay's Motilal Arbitrage, Kotak Arbitrage Direct and Bandhan Arbitrage Direct. The pooled Kotak Arbitrage Direct row also includes Bharat Family Trust's unmatched balance. The cost/quantity requests for Kotak, Motilal and Bandhan are already itemised in the client request. Hope's two ABSL folios and Mirae have costs, but need original acquisition histories:

| Hope India Trust folio | What the saved document does supply | What it does not establish |
| --- | --- | --- |
| ABSL 1019265797 | 7,756.542 units, ₹777,961.25 cost; dated monthly IDCW reinvestments | Original acquisition dates of the opening units. The saved document explicitly says “Partial Transaction Listing”. |
| ABSL 1038104611 | 1,752.565 units, ₹537,146.28 cost | Original purchases: July opens with 1,752.565 units and prints no purchase within that period. |
| Mirae 70413280453 | 316.190 units, ₹635,724.81 purchase amount | Original acquisition lots: 11 July 2019 is labelled Opening Balance/NAV date, not a purchase. |

The two additional Cash review-context ranges cover the separately keyed ABSL Liquid Direct and Liquid BeES products; they do not resolve missing owner/folio lots.

**PMS:** all six strategy rows have the family's inception/contribution dates. Those dates must not be lent to the manager's underlying securities. Across the ten active account statements, 108 of 271 non-cash position lines have complete holding-date support; **163 do not**. The source trade windows often begin after the opening shares were acquired. Cash balances themselves have no purchase date.

| PMS account | Holder | Dated non-cash positions | Remaining date evidence |
| --- | --- | ---: | --- |
| Carnelian 3517383 | Ajay | 6 / 12 | Original lots for opening shares; saved trades cover 1 Apr–30 Sep 2026. |
| Goldstandard 100022 | Ankita | 8 / 32 | Original lots for opening shares; saved trades cover 1 Apr–6 Oct 2026. |
| Goldstandard 100023 | Ajay | 8 / 32 | Same window; separate owner/account lots required. |
| Green Lantern 510854 | Ankita | 30 / 31 | Reconcile the one unmatched security's opening units/corporate actions; window begins 13 Jan 2025. |
| Green Lantern 510861 | Ajay | 27 / 31 | Reconcile four unmatched securities' opening units/corporate actions; window begins 16 Jan 2025. |
| Molecule 7810404 | Ajay | 1 / 9 | Original lots for opening shares; saved trades cover 1 Apr–31 Jul 2026. |
| SVAN 8710067 | Ajay | 6 / 47 | Original lots for opening shares; saved trades cover 1 Apr–30 Sep 2026. |
| SVAN 8710090 | Bharat | 5 / 46 | Same window; separate owner/account lots required. |
| V.E.C 128004 | Ankita | 14 / 14 | No remaining holding-date gap in this source account. |
| V.E.C 128005 | Ajay | 3 / 17 | Original lots for opening shares; saved trades cover 1 Apr–13 Aug 2026. |

Request the managers' since-inception security transaction/lot exports, including opening acquisition dates, cost, units, transfers and corporate actions. No repeat request is needed for the mandates' funding/inception dates already present. The account/security details behind the 163 positions are listed below; costs being known does not establish their dates.

For remaining cost, HPR and balance discrepancies, use [the account-by-account client request](client/PURCHASE-COST-RECORDS-NEEDED.md). Companies held only inside funds have no family-account stock acquisition date: the family's dated purchase is of fund units.

The June review's direct-family purchases of MPS, Vedanta and Borosil do not date those companies' shares in PMS accounts. These six manager-held lines remain undated rather than borrowing another route's investment range.

Two further Green Lantern ZF date gaps are recovered from saved evidence: 86 and 172 original purchased shares become exactly 516 and 1,032 after the recorded 5:1 bonus on 24 June 2026. Both holdings retain their six original purchase dates, 30 May 2025–18 March 2026. The bonus date is not a purchase date. No additional client evidence is requested for those two bridges. This date-only proof requires no sales, all buys before the bonus, a verified identity, a covered action window and an exact closing quantity; it changes no cost, units, valuation or return.

## Undated PMS account/security lines

| Holder / account | Security | Units | Source-specific gap |
| --- | --- | ---: | --- |
| Ajay Jaisinghani / 3517383 | Aditya Birla Capital Ltd | 145457 | the transaction statements from 2026-04-01 to 2026-09-30 buy 0 and sell 64543 units of it against 145457 held, so 210000 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 3517383 | Biocon Ltd | 125500 | none of its 125500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 3517383 | Jammu Kashmir Bank Ltd | 282771 | none of its 282771 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 3517383 | Kalpataru Projects International Ltd | 27900 | none of its 27900 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 3517383 | PVR Inox Ltd | 31777 | the transaction statements from 2026-04-01 to 2026-09-30 buy 0 and sell 882 units of it against 31777 held, so 32659 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 3517383 | Star Health and Allied Insurance Company Limited | 69817 | none of its 69817 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Banco Products India Ltd. | 2000 | none of its 2000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | BLS International Services Ltd | 6000 | none of its 6000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Blue Jet Healthcare Ltd. | 6000 | none of its 6000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Can Fin Homes Ltd. | 3000 | none of its 3000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Caplin Point Laboratories Ltd. | 900 | none of its 900 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | EIH Ltd. | 9500 | none of its 9500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | HDFC Asset Management Co. Ltd. | 1100 | none of its 1100 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | ICICI Bank Ltd. | 2000 | none of its 2000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Indraprastha Medical Corp. Ltd. | 7750 | none of its 7750 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Karur Vysya Bank Ltd. | 8500 | none of its 8500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Kovai Medical Center & Hospital Ltd. | 500 | none of its 500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Life Insurance Corp. of India | 6000 | none of its 6000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Mahindra & Mahindra Ltd. | 800 | none of its 800 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Motilal Oswal Financial Services Ltd. | 2250 | none of its 2250 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | MPS Ltd | 1250 | none of its 1250 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Oberoi Realty Ltd. | 1000 | none of its 1000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Sagility Ltd. | 45000 | none of its 45000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Sharda Motor Industries Ltd | 1250 | none of its 1250 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Sonata Software Ltd. | 9000 | none of its 9000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | State Bank of India | 2250 | none of its 2250 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Suprajit Engineering Ltd. | 6000 | the transaction statements from 2026-04-01 to 2026-10-06 buy 2300 and sell 2800 units of it against 6000 held, so 6500 of them are on no dated trade in this drop |
| Ankita Jaisinghani / 100022 | Tenneco Clean Air India Ltd. | 5000 | none of its 5000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Transport Corp. of India Ltd. | 3750 | none of its 3750 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 100022 | Zydus Lifesciences Ltd. | 2800 | none of its 2800 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Banco Products India Ltd. | 5000 | none of its 5000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | BLS International Services Ltd | 12500 | none of its 12500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Blue Jet Healthcare Ltd. | 15000 | none of its 15000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Can Fin Homes Ltd. | 7000 | none of its 7000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Caplin Point Laboratories Ltd. | 2000 | none of its 2000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | EIH Ltd. | 20000 | none of its 20000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | HDFC Asset Management Co. Ltd. | 2500 | none of its 2500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | ICICI Bank Ltd. | 5000 | none of its 5000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Indraprastha Medical Corp. Ltd. | 17500 | none of its 17500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Karur Vysya Bank Ltd. | 20000 | none of its 20000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Kovai Medical Center & Hospital Ltd. | 1200 | none of its 1200 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Life Insurance Corp. of India | 16400 | none of its 16400 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Mahindra & Mahindra Ltd. | 1800 | none of its 1800 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Motilal Oswal Financial Services Ltd. | 5000 | none of its 5000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | MPS Ltd | 3300 | none of its 3300 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Oberoi Realty Ltd. | 2200 | none of its 2200 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Sagility Ltd. | 100000 | none of its 100000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Sharda Motor Industries Ltd | 3000 | none of its 3000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Sonata Software Ltd. | 21000 | none of its 21000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | State Bank of India | 5000 | none of its 5000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Suprajit Engineering Ltd. | 15000 | the transaction statements from 2026-04-01 to 2026-10-06 buy 6500 and sell 7500 units of it against 15000 held, so 16000 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 100023 | Tenneco Clean Air India Ltd. | 10000 | none of its 10000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Transport Corp. of India Ltd. | 8500 | none of its 8500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ajay Jaisinghani / 100023 | Zydus Lifesciences Ltd. | 6000 | none of its 6000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-10-06 and record no buy or sell of it |
| Ankita Jaisinghani / 510854 | Vedanta Aluminium Metal Limited | 4340 | none of its 4340 units is on a dated trade: the transaction statements in this drop run from 2025-01-13 to 2026-07-27 and record no buy or sell of it |
| Ajay Jaisinghani / 510861 | Ingersollrand India Ltd | 445 | the transaction statements from 2025-01-16 to 2026-07-27 buy 275 and sell 0 units of it against 445 held, so 170 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 510861 | Ratnamani Metals & Tubes Ltd | 586 | the transaction statements from 2025-01-16 to 2026-07-27 buy 799 and sell 370 units of it against 586 held, so 157 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 510861 | The Anup Engineering Ltd | 1258 | the transaction statements from 2025-01-16 to 2026-07-27 buy 1217 and sell 0 units of it against 1258 held, so 41 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 510861 | Vedanta Aluminium Metal Limited | 8569 | none of its 8569 units is on a dated trade: the transaction statements in this drop run from 2025-01-16 to 2026-07-27 and record no buy or sell of it |
| Ajay Jaisinghani / 7810404 | ARVIND FASHIONS LIMITED | 4000 | none of its 4000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-07-31 and record no buy or sell of it |
| Ajay Jaisinghani / 7810404 | CHEMFAB ALKALIS LIMITED | 1000 | none of its 1000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-07-31 and record no buy or sell of it |
| Ajay Jaisinghani / 7810404 | DCW LIMITED | 3000 | none of its 3000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-07-31 and record no buy or sell of it |
| Ajay Jaisinghani / 7810404 | INDIAN METALS AND FERRO ALLOYS LTD. | 1500 | none of its 1500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-07-31 and record no buy or sell of it |
| Ajay Jaisinghani / 7810404 | JAYASWAL NECO INDUSTRIES LTD. | 23000 | none of its 23000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-07-31 and record no buy or sell of it |
| Ajay Jaisinghani / 7810404 | KIRLOSKAR FERROUS INDUSTRIES LTD. | 2967 | none of its 2967 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-07-31 and record no buy or sell of it |
| Ajay Jaisinghani / 7810404 | MANALI PETROCHEMICAL LTD. | 10000 | none of its 10000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-07-31 and record no buy or sell of it |
| Ajay Jaisinghani / 7810404 | SANSERA ENGINEERING LIMITED | 800 | none of its 800 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-07-31 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Arvind Fashions Ltd | 9360 | none of its 9360 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Birlasoft Ltd | 10110 | none of its 10110 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | BOROSIL RENEWABLES LTD | 6965 | none of its 6965 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Caplin Point Laboratories Ltd | 2465 | the transaction statements from 2026-04-01 to 2026-09-30 buy 535 and sell 0 units of it against 2465 held, so 1930 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 8710067 | Ceat Ltd | 1590 | none of its 1590 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Cosmo First Limited | 5190 | none of its 5190 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | CREATIVE NEWTECH LIMITED | 3855 | none of its 3855 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Credit Access Grameen Limited | 3860 | the transaction statements from 2026-04-01 to 2026-09-30 buy 1630 and sell 0 units of it against 3860 held, so 2230 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 8710067 | Dilip Buildcon Ltd | 6460 | none of its 6460 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Edelweiss Financial Services Ltd | 29855 | none of its 29855 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Ester Industries Limited | 31090 | none of its 31090 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Fusion Finance Limited | 12340 | none of its 12340 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | GHCL Ltd | 6085 | none of its 6085 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | GHCL Textiles Limited | 28995 | the transaction statements from 2026-04-01 to 2026-09-30 buy 9145 and sell 0 units of it against 28995 held, so 19850 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 8710067 | HEG Advanced Materials Limited | 8220 | none of its 8220 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | HEG Graphite Limited | 8220 | none of its 8220 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | IFB Industries Ltd | 2095 | none of its 2095 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Indo Count Industries Ltd | 16100 | none of its 16100 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | KRISHCA STRAPPING SOLUTIONS LTD | 7500 | none of its 7500 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Laxmi Organic Industries Limited | 24000 | none of its 24000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Mastek Ltd | 2005 | none of its 2005 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Neuland Laboratories Ltd | 300 | none of its 300 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | NITIN SPINNERS LIMITED | 9580 | the transaction statements from 2026-04-01 to 2026-09-30 buy 1185 and sell 0 units of it against 9580 held, so 8395 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 8710067 | Pokarna Ltd | 4170 | none of its 4170 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Polyplex Corporation Ltd | 2515 | none of its 2515 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | PUNJAB CHEM & CROP PROT L | 2915 | none of its 2915 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Puravankara Limited | 16350 | none of its 16350 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | SG Mart Limited | 3125 | the transaction statements from 2026-04-01 to 2026-09-30 buy 0 and sell 6805 units of it against 3125 held, so 9930 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 8710067 | Shakti Pumps India Ltd | 1350 | none of its 1350 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Shankara Buildpro Ltd | 3660 | the transaction statements from 2026-04-01 to 2026-09-30 buy 0 and sell 1050 units of it against 3660 held, so 4710 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 8710067 | Sharda Cropchem Ltd | 1920 | none of its 1920 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | SHARDA MOTOR INDUSTRIES LIMITED | 3350 | none of its 3350 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Stove Kraft Limited | 3935 | none of its 3935 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Syrma SGS Technology Limited | 2550 | the transaction statements from 2026-04-01 to 2026-09-30 buy 350 and sell 385 units of it against 2550 held, so 2585 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 8710067 | Time Technoplast Ltd | 10900 | none of its 10900 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | V2 Retail Ltd | 31600 | none of its 31600 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Vaibhav Global Ltd | 9200 | none of its 9200 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Varroc Engineering Limited | 7075 | the transaction statements from 2026-04-01 to 2026-09-30 buy 1145 and sell 0 units of it against 7075 held, so 5930 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 8710067 | Viyash Scientific Limited | 19435 | the transaction statements from 2026-04-01 to 2026-09-30 buy 10335 and sell 0 units of it against 19435 held, so 9100 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 8710067 | Wpil Ltd | 4245 | none of its 4245 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 8710067 | Zensar Technologies Ltd | 5090 | none of its 5090 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Arvind Fashions Ltd | 6660 | none of its 6660 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Birlasoft Ltd | 6560 | none of its 6560 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | BOROSIL RENEWABLES LTD | 4530 | none of its 4530 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Caplin Point Laboratories Ltd | 1600 | the transaction statements from 2026-04-01 to 2026-09-30 buy 340 and sell 0 units of it against 1600 held, so 1260 of them are on no dated trade in this drop |
| Bharat Jaisinghani / 8710090 | Ceat Ltd | 1040 | none of its 1040 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Cosmo First Limited | 3370 | none of its 3370 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | CREATIVE NEWTECH LIMITED | 2505 | none of its 2505 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Credit Access Grameen Limited | 2515 | the transaction statements from 2026-04-01 to 2026-09-30 buy 800 and sell 0 units of it against 2515 held, so 1715 of them are on no dated trade in this drop |
| Bharat Jaisinghani / 8710090 | Dilip Buildcon Ltd | 4215 | none of its 4215 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Edelweiss Financial Services Ltd | 19415 | none of its 19415 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Ester Industries Limited | 19685 | none of its 19685 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Fusion Finance Limited | 8050 | none of its 8050 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | GHCL Ltd | 3970 | none of its 3970 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | GHCL Textiles Limited | 18880 | the transaction statements from 2026-04-01 to 2026-09-30 buy 5925 and sell 0 units of it against 18880 held, so 12955 of them are on no dated trade in this drop |
| Bharat Jaisinghani / 8710090 | HEG Advanced Materials Limited | 5365 | none of its 5365 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | HEG Graphite Limited | 5365 | none of its 5365 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | IFB Industries Ltd | 1490 | none of its 1490 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Indo Count Industries Ltd | 10505 | none of its 10505 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | KRISHCA STRAPPING SOLUTIONS LTD | 5000 | none of its 5000 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Laxmi Organic Industries Limited | 15660 | none of its 15660 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Mastek Ltd | 1310 | none of its 1310 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Neuland Laboratories Ltd | 195 | none of its 195 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | NITIN SPINNERS LIMITED | 6240 | the transaction statements from 2026-04-01 to 2026-09-30 buy 785 and sell 0 units of it against 6240 held, so 5455 of them are on no dated trade in this drop |
| Bharat Jaisinghani / 8710090 | Pokarna Ltd | 2885 | none of its 2885 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Polyplex Corporation Ltd | 1640 | none of its 1640 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | PUNJAB CHEM & CROP PROT L | 2075 | none of its 2075 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Puravankara Limited | 11370 | none of its 11370 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | SG Mart Limited | 2035 | the transaction statements from 2026-04-01 to 2026-09-30 buy 0 and sell 4445 units of it against 2035 held, so 6480 of them are on no dated trade in this drop |
| Bharat Jaisinghani / 8710090 | Shakti Pumps India Ltd | 980 | none of its 980 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Shankara Buildpro Ltd | 2380 | the transaction statements from 2026-04-01 to 2026-09-30 buy 0 and sell 670 units of it against 2380 held, so 3050 of them are on no dated trade in this drop |
| Bharat Jaisinghani / 8710090 | Sharda Cropchem Ltd | 1245 | none of its 1245 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | SHARDA MOTOR INDUSTRIES LIMITED | 2390 | none of its 2390 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Stove Kraft Limited | 2570 | none of its 2570 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Syrma SGS Technology Limited | 1655 | the transaction statements from 2026-04-01 to 2026-09-30 buy 230 and sell 250 units of it against 1655 held, so 1675 of them are on no dated trade in this drop |
| Bharat Jaisinghani / 8710090 | Time Technoplast Ltd | 7760 | none of its 7760 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | V2 Retail Ltd | 20550 | none of its 20550 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Vaibhav Global Ltd | 6005 | none of its 6005 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Varroc Engineering Limited | 4605 | the transaction statements from 2026-04-01 to 2026-09-30 buy 295 and sell 0 units of it against 4605 held, so 4310 of them are on no dated trade in this drop |
| Bharat Jaisinghani / 8710090 | Viyash Scientific Limited | 12640 | the transaction statements from 2026-04-01 to 2026-09-30 buy 6715 and sell 0 units of it against 12640 held, so 5925 of them are on no dated trade in this drop |
| Bharat Jaisinghani / 8710090 | Wpil Ltd | 3090 | none of its 3090 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Bharat Jaisinghani / 8710090 | Zensar Technologies Ltd | 3320 | none of its 3320 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-09-30 and record no buy or sell of it |
| Ajay Jaisinghani / 128005 | Amrutanjan Health Care Ltd | 5450 | the transaction statements from 2026-04-01 to 2026-08-13 buy 1772 and sell 0 units of it against 5450 held, so 3678 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 128005 | Ather Energy Ltd | 8400 | none of its 8400 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-08-13 and record no buy or sell of it |
| Ajay Jaisinghani / 128005 | Crompton Greaves Consumer Electrical Ltd | 22191 | none of its 22191 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-08-13 and record no buy or sell of it |
| Ajay Jaisinghani / 128005 | Eureka Forbes Ltd | 31378 | the transaction statements from 2026-04-01 to 2026-08-13 buy 22735 and sell 0 units of it against 31378 held, so 8643 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 128005 | Gateway Distriparks Ltd | 160736 | the transaction statements from 2026-04-01 to 2026-08-13 buy 86587 and sell 0 units of it against 160736 held, so 74149 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 128005 | GREAVES COTTON LTD. | 80827 | the transaction statements from 2026-04-01 to 2026-08-13 buy 56764 and sell 0 units of it against 80827 held, so 24063 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 128005 | Jaiprakash Power Ventures Ltd | 262684 | none of its 262684 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-08-13 and record no buy or sell of it |
| Ajay Jaisinghani / 128005 | Navneet Education Ltd | 66997 | the transaction statements from 2026-04-01 to 2026-08-13 buy 50306 and sell 0 units of it against 66997 held, so 16691 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 128005 | Panacea Biotec Ltd | 12172 | none of its 12172 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-08-13 and record no buy or sell of it |
| Ajay Jaisinghani / 128005 | SBFC Finance Ltd | 129862 | the transaction statements from 2026-04-01 to 2026-08-13 buy 81055 and sell 0 units of it against 129862 held, so 48807 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 128005 | Shoppers Stop Ltd | 25942.667 | the transaction statements from 2026-04-01 to 2026-08-13 buy 11216.667 and sell 0 units of it against 25942.667 held, so 14726 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 128005 | Tejas Networks Limited | 13121 | none of its 13121 units is on a dated trade: the transaction statements in this drop run from 2026-04-01 to 2026-08-13 and record no buy or sell of it |
| Ajay Jaisinghani / 128005 | VIP Industries Ltd | 40978 | the transaction statements from 2026-04-01 to 2026-08-13 buy 29334 and sell 0 units of it against 40978 held, so 11644 of them are on no dated trade in this drop |
| Ajay Jaisinghani / 128005 | Wockhardt Ltd | 7520 | the transaction statements from 2026-04-01 to 2026-08-13 buy 2614 and sell 0 units of it against 7520 held, so 4906 of them are on no dated trade in this drop |
