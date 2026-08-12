# Book report

What `npm run build-book` put in `src/data/glowData.ts`, and what it could not.
Generated — **do not edit by hand**.

## Totals

| | |
| --- | ---: |
| Consolidated market value | 3,37,46,23,638.12 |
| Positions | 302 |
| Accounts | 22 |
| Owners | 6 |
| Newest as-of | 2026-08-11 |

## Per account

| Account | Provider | Owner | Strategy | As of | Positions | Market value |
| --- | --- | --- | --- | --- | ---: | ---: |
| 1000632 | 360 ONE Alternates Asset Management | Ajay Jaisinghani | 360 ONE Special Opportunities Fund - Series 8 | 2026-05-18 | 0 | 0 |
| 37702 | 360 ONE Private Wealth | Ajay Jaisinghani | — | 2026-07-31 | 1 | 1,46,68,362.66 |
| 60117 | 360 ONE Private Wealth | Bharat Jaisinghani | — | 2026-06-30 | 1 | 1,45,80,412.51 |
| 3517383 | Carnelian Asset Management and Advisors Pvt Ltd | Ajay Jaisinghani | CARNELIAN BESPOKE PORTFOLIO | 2026-08-10 | 12 | 39,53,37,616.86 |
| 100022 | Goldstandard Wealth Private Limited | Ankita Jaisinghani | Aristos Equity Portfolio | 2026-08-11 | 32 | 8,01,95,236.76 |
| 100023 | Goldstandard Wealth Private Limited | Ajay Jaisinghani | Aristos Equity Portfolio | 2026-08-11 | 32 | 18,79,95,881.19 |
| 510854 | Green Lantern Capital LLP | Ankita Jaisinghani | GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND | 2026-07-27 | 34 | 5,79,66,679.22 |
| 510861 | Green Lantern Capital LLP | Ajay Jaisinghani | GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND | 2026-07-27 | 34 | 11,44,84,083.55 |
| 16180583 | HDFC Mutual Fund | Bharat Jaisinghani | — | 2026-08-06 | 2 | 0 |
| 98245 | LKP Securities | Bharat Jaisinghani | — | 2026-03-31 | 10 | 98,76,174.92 |
| 7810404 | Molecule Ventures LLP | Ajay Jaisinghani | GROWTH | 2026-06-30 | 11 | 1,12,48,248.66 |
| 9039671821 | Sanshi Fund | Aarti Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 97,68,26,519.91 |
| 9039671854 | Sanshi Fund | Bharat Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 19,56,88,390.51 |
| 9039671912 | Sanshi Fund | Ajay Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 29,35,23,824.82 |
| 9069671554 | Sanshi Fund | Ankita Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 29,42,02,601.1 |
| 9069671634 | Sanshi Fund | Ajay Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 28,45,63,122.95 |
| 8710067 | SVAN Investment Managers LLP | Ajay Jaisinghani | SVAN INVESTMENT MANAGERS LLP - VELOCITY | 2026-07-31 | 46 | 16,45,40,939.64 |
| 8710090 | SVAN Investment Managers LLP | Bharat Jaisinghani | SVAN INVESTMENT MANAGERS LLP - VELOCITY | 2026-06-30 | 45 | 10,38,13,871.78 |
| TVC262 | Transition Venture Capital | Bharat Jaisinghani Family Trust 2 | Transition Venture Capital Fund I | 2026-03-31 | 1 | 1,71,45,962.25 |
| TVC263 | Transition Venture Capital | Bharat Jaisinghani Family Trust 3 | Transition Venture Capital Fund I | 2026-03-31 | 1 | 1,71,45,962.25 |
| 128004 | V.E.C Assago Capital Management LLP | Ankita Jaisinghani | V.E.C ASSAGO Small and Mid-Cap Growth | 2026-07-06 | 17 | 6,55,22,325.41 |
| 128005 | V.E.C Assago Capital Management LLP | Ajay Jaisinghani | V.E.C ASSAGO Small and Mid-Cap Growth | 2026-07-06 | 18 | 9,24,43,383.42 |

## Per owner

| Owner | Accounts | Positions | Market value |
| --- | ---: | ---: | ---: |
| Ajay Jaisinghani | 10 | 156 | 1,55,88,05,463.75 |
| Ankita Jaisinghani | 4 | 84 | 49,78,86,842.49 |
| Bharat Jaisinghani | 5 | 59 | 32,39,58,849.72 |
| Aarti Jaisinghani | 1 | 1 | 97,68,26,519.91 |
| Bharat Jaisinghani Family Trust 2 | 1 | 1 | 1,71,45,962.25 |
| Bharat Jaisinghani Family Trust 3 | 1 | 1 | 1,71,45,962.25 |

## Read, and deliberately NOT in the book

These statements were read COMPLETELY. They are absent from every total above
because they belong to somebody else, and that is a different thing from a
document the pipeline could not open — the coverage table in
`docs/EXTRACTION-REPORT.md` has those. Each one becomes part of the book with a
single entry in `shared/owners.mjs`, if the family says it should be.

| Account | Provider | Holder | Value on its own statement | Why it is out |
| --- | --- | --- | ---: | --- |
| 1000633 | 360 ONE Alternates Asset Management | Investor | — | no statement for it resolves to a canonical owner |
| 1019265797 | Aditya Birla Sun Life Mutual Fund | Hope India Trust | 7,70,028.13 | holder Hope India Trust is filed by the AMC as Trust — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. |
| 1038104611 | Aditya Birla Sun Life Mutual Fund | HOPE INDIA TRUST | 7,98,563.95 | holder HOPE INDIA TRUST is filed by the AMC as Trust — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. |
| 4295974 | Kotak Mahindra Mutual Fund | Hope India Trust | 7,77,205.81 | holder Hope India Trust is filed by the AMC as Trust, and its PAN carries the trust holder code — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. |
| 70413280453 | Mirae Asset Mutual Fund | HOPE INDIA TRUST | 9,41,106.71 | holder HOPE INDIA TRUST is filed by the AMC as TRUST, and its PAN carries the trust holder code — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. |

Together they carry **32,86,904.6** across 4 account(s). That figure is stated so nobody has to wonder whether the money was missed or excluded.

## Sector allocation

| Sector | Market value | Share |
| --- | ---: | ---: |
| Unclassified | 2,46,99,08,900.04 | 73.19% |
| Financials | 24,59,20,220.3 | 7.29% |
| Health Care | 18,84,64,913.4 | 5.58% |
| Consumer Discretionary | 14,95,66,899.11 | 4.43% |
| Industrials | 12,95,61,200.92 | 3.84% |
| Information Technology | 7,15,96,197.78 | 2.12% |
| Cash | 6,75,79,275.27 | 2.00% |
| Communication Services | 1,98,43,470 | 0.59% |
| Materials | 1,88,10,993.93 | 0.56% |
| Consumer Staples | 1,47,32,221.9 | 0.44% |
| Utilities | 1,00,47,707.72 | 0.30% |
| Real Estate | 57,37,600 | 0.17% |

## Unclassified sectors

Add these to `shared/sectors.mjs`. Until then they render as Unclassified —
never guessed into the nearest plausible bucket.

- **Other Apparels & Accessor** — 1 position(s)
- **Coal** — 1 position(s)
- **Shipping** — 2 position(s)
- **Oil Equipment & Services** — 2 position(s)
- **OTHERS** — 2 position(s)
- **CHEMICALS** — 1 position(s)
- **BASIC MATERIALS** — 4 position(s)
- **INFORMATION TECHNOLOGY** — 1 position(s)

## What this corpus does not support

- account 1000632: no time-weighted return series in any statement
- account 1000632: no flow block in any statement, so no value bridge
- account 1000632: no external capital movements found, so no money-weighted return series
- account 1000633 (360 ONE Alternates Asset Management) is NOT in the book: no statement for it resolves to a canonical owner. It is excluded rather than carried with an empty owner, because an account attributed to nobody is a worse figure than a named absence.
- account 360 ONE Private Wealth::37702: holdings 2026-05-31 superseded for SNAPSHOT facts by 2026-07-31 — `360-one-private-wealth-37702-2026-05-31-holdings`; its dated rows are still counted
- account 360 ONE Private Wealth::37702: holdings 2026-06-30 superseded for SNAPSHOT facts by 2026-07-31 — `360-one-private-wealth-37702-2026-06-30-holdings`; its dated rows are still counted
- account 360 ONE Private Wealth::37702: 6 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
- account 37702: no time-weighted return series in any statement
- account 37702: no flow block in any statement, so no value bridge
- account 37702: no external capital movements found, so no money-weighted return series
- account 360 ONE Private Wealth::60117: holdings 2026-05-31 superseded for SNAPSHOT facts by 2026-06-30 — `360-one-private-wealth-60117-2026-05-31-holdings`; its dated rows are still counted
- account 360 ONE Private Wealth::60117: 6 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
- account 60117: no time-weighted return series in any statement
- account 60117: no flow block in any statement, so no value bridge
- account 60117: no external capital movements found, so no money-weighted return series
- account Aditya Birla Sun Life Mutual Fund::1019265797: holdings 2026-07-01 superseded for SNAPSHOT facts by 2026-08-03 — `aditya-birla-sun-life-mutual-fund-1019265797-2026-07-01-holdings`; its dated rows are still counted
- account 1019265797 (Aditya Birla Sun Life Mutual Fund) is NOT in the book: holder Hope India Trust is filed by the AMC as Trust — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. Value on its own statement: 7,70,028.13.
- account Aditya Birla Sun Life Mutual Fund::1038104611: holdings 2026-07-01 superseded for SNAPSHOT facts by 2026-08-03 — `aditya-birla-sun-life-mutual-fund-1038104611-2026-07-01-holdings`; its dated rows are still counted
- account 1038104611 (Aditya Birla Sun Life Mutual Fund) is NOT in the book: holder HOPE INDIA TRUST is filed by the AMC as Trust — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. Value on its own statement: 7,98,563.95.
- account Carnelian Asset Management and Advisors Pvt Ltd::3517383: performance-summary 2026-04-01 superseded for SNAPSHOT facts by 2026-04-01 — `carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-04-01-performance-summary-2`; its dated rows are still counted
- account Carnelian Asset Management and Advisors Pvt Ltd::3517383: appraisal 2026-07-10 superseded for SNAPSHOT facts by 2026-08-10 — `carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-07-10-appraisal`; its dated rows are still counted
- account Carnelian Asset Management and Advisors Pvt Ltd::3517383: capital-gain 2026-07-10 superseded for SNAPSHOT facts by 2026-08-10 — `carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-07-10-capital-gain`; its dated rows are still counted
- account Carnelian Asset Management and Advisors Pvt Ltd::3517383: dividend-statement 2026-07-10 superseded for SNAPSHOT facts by 2026-08-10 — `carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-07-10-dividend-statement`; its dated rows are still counted
- account Carnelian Asset Management and Advisors Pvt Ltd::3517383: fact-sheet 2026-07-10 superseded for SNAPSHOT facts by 2026-08-10 — `carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-07-10-fact-sheet`; its dated rows are still counted
- account Carnelian Asset Management and Advisors Pvt Ltd::3517383: holdings 2026-07-10 superseded for SNAPSHOT facts by 2026-08-10 — `carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-07-10-holdings`; its dated rows are still counted
- account Carnelian Asset Management and Advisors Pvt Ltd::3517383: performance-history 2026-07-10 superseded for SNAPSHOT facts by 2026-08-10 — `carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-07-10-performance-history`; its dated rows are still counted
- account Carnelian Asset Management and Advisors Pvt Ltd::3517383: transaction-statement 2026-07-10 superseded for SNAPSHOT facts by 2026-08-10 — `carnelian-asset-management-and-advisors-pvt-ltd-3517383-2026-07-10-transaction-statement`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: appraisal 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-appraisal`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: bank-book 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-bank-book`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: capital-register 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-capital-register`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: dividend-statement 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-dividend-statement`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: fact-sheet 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-fact-sheet`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: holdings 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-holdings`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: performance-benchmark 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-performance-benchmark`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: performance-history 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-performance-history`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: performance-summary 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-performance-summary`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: transaction-statement 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-07-10-transaction-statement`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: fact-sheet 2026-08-11 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-08-11-fact-sheet-2`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: performance-summary 2026-08-11 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100022-2026-08-11-performance-summary-2`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100022: 6 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
- account Goldstandard Wealth Private Limited::100023: appraisal 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-appraisal`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: bank-book 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-bank-book`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: capital-register 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-capital-register`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: dividend-statement 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-dividend-statement`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: expense-statement 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-expense-statement`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: fact-sheet 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-fact-sheet`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: holdings 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-holdings`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: performance-benchmark 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-performance-benchmark`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: performance-history 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-performance-history`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: performance-summary 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-performance-summary`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: transaction-statement 2026-07-10 superseded for SNAPSHOT facts by 2026-08-11 — `goldstandard-wealth-private-limited-100023-2026-07-10-transaction-statement`; its dated rows are still counted
- account Goldstandard Wealth Private Limited::100023: 7 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
- account Green Lantern Capital LLP::510854: appraisal 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510854-2026-06-25-appraisal`; its dated rows are still counted
- account Green Lantern Capital LLP::510854: capital-gain 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510854-2026-06-25-capital-gain`; its dated rows are still counted
- account Green Lantern Capital LLP::510854: capital-register 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510854-2026-06-25-capital-register`; its dated rows are still counted
- account Green Lantern Capital LLP::510854: dividend-statement 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510854-2026-06-25-dividend-statement`; its dated rows are still counted
- account Green Lantern Capital LLP::510854: fact-sheet 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510854-2026-06-25-fact-sheet`; its dated rows are still counted
- account Green Lantern Capital LLP::510854: holdings 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510854-2026-06-25-holdings`; its dated rows are still counted
- account Green Lantern Capital LLP::510854: transaction-statement 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510854-2026-06-25-transaction-statement`; its dated rows are still counted
- account Green Lantern Capital LLP::510854: performance-benchmark 2026-07-09 superseded for SNAPSHOT facts by 2026-08-10 — `green-lantern-capital-llp-510854-2026-07-09-performance-benchmark`; its dated rows are still counted
- account Green Lantern Capital LLP::510854: performance-history 2026-07-09 superseded for SNAPSHOT facts by 2026-08-10 — `green-lantern-capital-llp-510854-2026-07-09-performance-history`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: performance-summary 2026-04-01 superseded for SNAPSHOT facts by 2026-04-01 — `green-lantern-capital-llp-510861-2026-04-01-performance-summary-2`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: appraisal 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510861-2026-06-25-appraisal`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: capital-gain 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510861-2026-06-25-capital-gain`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: capital-register 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510861-2026-06-25-capital-register`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: dividend-statement 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510861-2026-06-25-dividend-statement`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: fact-sheet 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510861-2026-06-25-fact-sheet`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: holdings 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510861-2026-06-25-holdings`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: transaction-statement 2026-06-25 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510861-2026-06-25-transaction-statement`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: capital-gain 2026-06-30 superseded for SNAPSHOT facts by 2026-07-27 — `green-lantern-capital-llp-510861-2026-06-30-capital-gain`; its dated rows are still counted
- account Green Lantern Capital LLP::510861: performance-history 2026-07-09 superseded for SNAPSHOT facts by 2026-08-10 — `green-lantern-capital-llp-510861-2026-07-09-performance-history`; its dated rows are still counted
- account HDFC Mutual Fund::16180583: holdings 2026-07-01 superseded for SNAPSHOT facts by 2026-08-06 — `hdfc-mutual-fund-16180583-2026-07-01-holdings`; its dated rows are still counted
- account 16180583: no time-weighted return series in any statement
- account 16180583: no flow block in any statement, so no value bridge
- account 16180583: no external capital movements found, so no money-weighted return series
- account Kotak Mahindra Mutual Fund::4295974: holdings 2026-07-01 superseded for SNAPSHOT facts by 2026-08-03 — `kotak-mahindra-mutual-fund-4295974-2026-07-01-holdings`; its dated rows are still counted
- account 4295974 (Kotak Mahindra Mutual Fund) is NOT in the book: holder Hope India Trust is filed by the AMC as Trust, and its PAN carries the trust holder code — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. Value on its own statement: 7,77,205.81.
- account LKP Securities::98245: capital-gain 2026-06-30 superseded for SNAPSHOT facts by 2026-07-31 — `lkp-securities-98245-2026-06-30-capital-gain`; its dated rows are still counted
- account LKP Securities::98245: transaction-statement 2026-07-01 superseded for SNAPSHOT facts by 2026-08-04 — `lkp-securities-98245-2026-07-01-transaction-statement`; its dated rows are still counted
- account LKP Securities::98245: 6 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
- account 98245: no time-weighted return series in any statement
- account 98245: no flow block in any statement, so no value bridge
- account 98245: no external capital movements found, so no money-weighted return series
- account Mirae Asset Mutual Fund::70413280453: holdings 2026-07-02 superseded for SNAPSHOT facts by 2026-08-06 — `mirae-asset-mutual-fund-70413280453-2026-07-02-holdings`; its dated rows are still counted
- account 70413280453 (Mirae Asset Mutual Fund) is NOT in the book: holder HOPE INDIA TRUST is filed by the AMC as TRUST, and its PAN carries the trust holder code — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. Value on its own statement: 9,41,106.71.
- account 7810404: no external capital movements found, so no money-weighted return series
- account SVAN Investment Managers LLP::8710067: investor-report 2026-05-31 superseded for SNAPSHOT facts by 2026-07-31 — `svan-investment-managers-llp-8710067-2026-05-31-investor-report`; its dated rows are still counted
- account SVAN Investment Managers LLP::8710067: investor-report 2026-06-30 superseded for SNAPSHOT facts by 2026-07-31 — `svan-investment-managers-llp-8710067-2026-06-30-investor-report`; its dated rows are still counted
- account SVAN Investment Managers LLP::8710067: 14 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
- account 8710067: no external capital movements found, so no money-weighted return series
- account SVAN Investment Managers LLP::8710090: investor-report 2026-05-31 superseded for SNAPSHOT facts by 2026-06-30 — `svan-investment-managers-llp-8710090-2026-05-31-investor-report`; its dated rows are still counted
- account SVAN Investment Managers LLP::8710090: 11 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
- account 8710090: no external capital movements found, so no money-weighted return series
- account 9039671821: no time-weighted return series in any statement
- account 9039671821: no external capital movements found, so no money-weighted return series
- account 9039671854: no time-weighted return series in any statement
- account 9039671854: no external capital movements found, so no money-weighted return series
- account 9039671912: no time-weighted return series in any statement
- account 9039671912: no external capital movements found, so no money-weighted return series
- account 9069671554: no time-weighted return series in any statement
- account 9069671554: no external capital movements found, so no money-weighted return series
- account 9069671634: no time-weighted return series in any statement
- account 9069671634: no external capital movements found, so no money-weighted return series
- account TVC262: no time-weighted return series in any statement
- account TVC262: no flow block in any statement, so no value bridge
- account TVC262: no external capital movements found, so no money-weighted return series
- account TVC263: no time-weighted return series in any statement
- account TVC263: no flow block in any statement, so no value bridge
- account TVC263: no external capital movements found, so no money-weighted return series
- 4 holding(s) reported under more than one member: both rows are carried, and 1,71,45,962.25 is excluded from the consolidated total so each is counted once
- navHistory is EMPTY: the corpus carries an opening and a closing portfolio value per account and nothing between them. Two points are not a series; interpolating between them would draw a path nothing measured.
- unrealised short/long-term split is populated on 3 of 302 position(s), across 1 of 22 account(s) (lkp-securities-98245): those are the accounts whose broker publishes a LOT REGISTER with dated acquisitions. It is NULL on the rest, because the capital register the managed accounts issue is a capital-account ledger (contributions, withdrawals, TDS transfers) and carries no purchase dates.
- no short/long-term split for BELRISE INDUSTRIES LIMITED (lkp-securities-98245): the lot register accounts for 6500 unit(s) against 12500 held, so the lots do not cover the position. Splitting on them would put a tax basis on units the position does not contain, or treat the uncovered cost as long-term when it is simply unknown.
- no short/long-term split for PRICOL LIMITED (lkp-securities-98245): the lot register accounts for 2875 unit(s) against 650 held, so the lots do not cover the position. Splitting on them would put a tax basis on units the position does not contain, or treat the uncovered cost as long-term when it is simply unknown.
