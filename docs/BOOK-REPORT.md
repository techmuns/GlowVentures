# Book report

What `npm run build-book` put in `src/data/glowData.ts`, and what it could not.
Generated — **do not edit by hand**.

## Totals

| | |
| --- | ---: |
| Consolidated market value | 3,35,43,23,674.24 |
| Positions | 301 |
| Accounts | 23 |
| Owners | 6 |
| Newest as-of | 2026-07-10 |

## Per account

| Account | Provider | Owner | Strategy | As of | Positions | Market value |
| --- | --- | --- | --- | --- | ---: | ---: |
| 1000632 | 360 ONE Alternates Asset Management | Ajay Jaisinghani | 360 ONE Special Opportunities Fund - Series 8 | 2026-05-18 | 0 | 0 |
| 1000633 | 360 ONE Alternates Asset Management | Bharat Jaisinghani | 360 ONE Special Opportunities Fund - Series 8 | 2026-05-18 | 0 | 0 |
| 37702 | 360 ONE Private Wealth | Ajay Jaisinghani | — | 2026-06-30 | 1 | 1,45,80,412.51 |
| 60117 | 360 ONE Private Wealth | Bharat Jaisinghani | — | 2026-06-30 | 1 | 1,45,80,412.51 |
| 3517383 | Carnelian Asset Management and Advisors Pvt Ltd | Ajay Jaisinghani | CARNELIAN BESPOKE PORTFOLIO | 2026-07-10 | 11 | 40,01,06,027.94 |
| 100022 | Goldstandard Wealth Private Limited | Ankita Jaisinghani | Aristos Equity Portfolio | 2026-07-10 | 32 | 7,75,38,153.36 |
| 100023 | Goldstandard Wealth Private Limited | Ajay Jaisinghani | Aristos Equity Portfolio | 2026-07-10 | 32 | 18,11,54,076.83 |
| 510854 | Green Lantern Capital LLP | Ankita Jaisinghani | GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND | 2026-06-25 | 34 | 5,92,48,501.89 |
| 510861 | Green Lantern Capital LLP | Ajay Jaisinghani | GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND | 2026-06-25 | 34 | 11,70,16,830.76 |
| 16180583 | HDFC Mutual Fund | Bharat Jaisinghani | — | 2026-07-01 | 2 | 0 |
| 98245 | LKP Securities | Bharat Jaisinghani | — | 2026-03-31 | 10 | 98,76,174.92 |
| 7810404 | Molecule Ventures LLP | Ajay Jaisinghani | GROWTH | 2026-06-30 | 11 | 1,12,48,248.66 |
| 9039671821 | Sanshi Fund | Aarti Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 97,68,26,519.91 |
| 9039671854 | Sanshi Fund | Bharat Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 19,56,88,390.51 |
| 9039671912 | Sanshi Fund | Ajay Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 29,35,23,824.82 |
| 9069671554 | Sanshi Fund | Ankita Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 29,42,02,601.1 |
| 9069671634 | Sanshi Fund | Ajay Jaisinghani | Sanshi Fund-I (Open Ended AIF CAT-III) | 2026-06-30 | 1 | 28,45,63,122.95 |
| 8710067 | SVAN Investment Managers LLP | Ajay Jaisinghani | SVAN INVESTMENT MANAGERS LLP - VELOCITY | 2026-06-30 | 46 | 15,98,25,245.22 |
| 8710090 | SVAN Investment Managers LLP | Bharat Jaisinghani | SVAN INVESTMENT MANAGERS LLP - VELOCITY | 2026-06-30 | 45 | 10,38,13,871.78 |
| TVC262 | Transition Venture Capital | Bharat Jaisinghani Family Trust 2 | Transition Venture Capital Fund I | 2026-03-31 | 1 | 1,71,45,962.25 |
| TVC263 | Transition Venture Capital | Bharat Jaisinghani Family Trust 3 | Transition Venture Capital Fund I | 2026-03-31 | 1 | 1,71,45,962.25 |
| 128004 | V.E.C Assago Capital Management LLP | Ankita Jaisinghani | V.E.C ASSAGO Small and Mid-Cap Growth | 2026-07-06 | 17 | 6,55,22,325.41 |
| 128005 | V.E.C Assago Capital Management LLP | Ajay Jaisinghani | V.E.C ASSAGO Small and Mid-Cap Growth | 2026-07-06 | 18 | 9,24,43,383.42 |

## Per owner

| Owner | Accounts | Positions | Market value |
| --- | ---: | ---: | ---: |
| Ajay Jaisinghani | 10 | 155 | 1,55,44,61,173.11 |
| Ankita Jaisinghani | 4 | 84 | 49,65,11,581.76 |
| Bharat Jaisinghani | 6 | 59 | 32,39,58,849.72 |
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
| 1019265797 | Aditya Birla Sun Life Mutual Fund | Hope India Trust | 7,66,421.41 | holder Hope India Trust is filed by the AMC as Trust — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. |
| 1038104611 | Aditya Birla Sun Life Mutual Fund | HOPE INDIA TRUST | 7,94,412.48 | holder HOPE INDIA TRUST is filed by the AMC as Trust — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. |
| 4295974 | Kotak Mahindra Mutual Fund | Hope India Trust | 7,73,610.75 | holder Hope India Trust is filed by the AMC as Trust, and its PAN carries the trust holder code — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. |
| 70413280453 | Mirae Asset Mutual Fund | HOPE INDIA TRUST | 9,36,386.82 | holder HOPE INDIA TRUST is filed by the AMC as TRUST, and its PAN carries the trust holder code — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. |

Together they carry **32,70,831.46** across 4 account(s). That figure is stated so nobody has to wonder whether the money was missed or excluded.

## Sector allocation

| Sector | Market value | Share |
| --- | ---: | ---: |
| Unclassified | 2,39,14,27,288.11 | 71.29% |
| Financials | 34,45,26,271.4 | 10.27% |
| Health Care | 18,37,86,053.8 | 5.48% |
| Consumer Discretionary | 15,20,59,112.82 | 4.53% |
| Industrials | 13,34,08,364.12 | 3.98% |
| Cash | 5,53,41,766.68 | 1.65% |
| Information Technology | 4,91,55,907.13 | 1.47% |
| Consumer Staples | 2,16,99,367.56 | 0.65% |
| Communication Services | 1,98,43,470 | 0.59% |
| Materials | 1,87,60,499.66 | 0.56% |
| Utilities | 1,00,47,707.72 | 0.30% |
| Real Estate | 59,94,240 | 0.18% |

## Unclassified sectors

Add these to `shared/sectors.mjs`. Until then they render as Unclassified —
never guessed into the nearest plausible bucket.

- **OTHERS** — 2 position(s)
- **CHEMICALS** — 1 position(s)
- **BASIC MATERIALS** — 4 position(s)
- **INFORMATION TECHNOLOGY** — 1 position(s)

## What this corpus does not support

- account 1000632: no time-weighted return series in any statement
- account 1000632: no flow block in any statement, so no value bridge
- account 1000632: no external capital movements found, so no money-weighted return series
- account 1000633: no time-weighted return series in any statement
- account 1000633: no flow block in any statement, so no value bridge
- account 1000633: no external capital movements found, so no money-weighted return series
- account 360 ONE Private Wealth::37702: holdings 2026-05-31 superseded for SNAPSHOT facts by 2026-06-30 — `360-one-private-wealth-37702-2026-05-31-holdings`; its dated rows are still counted
- account 360 ONE Private Wealth::37702: 6 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
- account 37702: no time-weighted return series in any statement
- account 37702: no flow block in any statement, so no value bridge
- account 37702: no external capital movements found, so no money-weighted return series
- account 360 ONE Private Wealth::60117: holdings 2026-05-31 superseded for SNAPSHOT facts by 2026-06-30 — `360-one-private-wealth-60117-2026-05-31-holdings`; its dated rows are still counted
- account 360 ONE Private Wealth::60117: 6 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
- account 60117: no time-weighted return series in any statement
- account 60117: no flow block in any statement, so no value bridge
- account 60117: no external capital movements found, so no money-weighted return series
- account 1019265797 (Aditya Birla Sun Life Mutual Fund) is NOT in the book: holder Hope India Trust is filed by the AMC as Trust — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. Value on its own statement: 7,66,421.41.
- account 1038104611 (Aditya Birla Sun Life Mutual Fund) is NOT in the book: holder HOPE INDIA TRUST is filed by the AMC as Trust — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. Value on its own statement: 7,94,412.48.
- account 510854: cash flows carry no opening portfolio value — no performance summary for the window, so a money-weighted return over it cannot be computed
- account Green Lantern Capital LLP::510861: capital-gain 2026-06-25 superseded for SNAPSHOT facts by 2026-06-30 — `green-lantern-capital-llp-510861-2026-06-25-capital-gain`; its dated rows are still counted
- account 16180583: no time-weighted return series in any statement
- account 16180583: no flow block in any statement, so no value bridge
- account 16180583: no external capital movements found, so no money-weighted return series
- account 4295974 (Kotak Mahindra Mutual Fund) is NOT in the book: holder Hope India Trust is filed by the AMC as Trust, and its PAN carries the trust holder code — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. Value on its own statement: 7,73,610.75.
- account 98245: no time-weighted return series in any statement
- account 98245: no flow block in any statement, so no value bridge
- account 98245: no external capital movements found, so no money-weighted return series
- account 70413280453 (Mirae Asset Mutual Fund) is NOT in the book: holder HOPE INDIA TRUST is filed by the AMC as TRUST, and its PAN carries the trust holder code — a separate taxpayer, not a Jaisinghani individual. Consolidating it would put another taxpayer's assets into a person's net worth. Add the holder to shared/owners.mjs if the family confirms it belongs in this book. Value on its own statement: 9,36,386.82.
- account 7810404: no external capital movements found, so no money-weighted return series
- account SVAN Investment Managers LLP::8710067: investor-report 2026-05-31 superseded for SNAPSHOT facts by 2026-06-30 — `svan-investment-managers-llp-8710067-2026-05-31-investor-report`; its dated rows are still counted
- account SVAN Investment Managers LLP::8710067: 9 dated row(s) come from statements superseded for their snapshot figures — a trade on an earlier statement still happened, and is counted once here.
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
- 2 holding(s) reported under more than one member: both rows are carried, and 3,17,26,374.76 is excluded from the consolidated total so each is counted once
- navHistory is EMPTY: the corpus carries an opening and a closing portfolio value per account and nothing between them. Two points are not a series; interpolating between them would draw a path nothing measured.
- unrealised short/long-term split is populated on 5 of 301 position(s), across 1 of 23 account(s) (lkp-securities-98245): those are the accounts whose broker publishes a LOT REGISTER with dated acquisitions. It is NULL on the rest, because the capital register the managed accounts issue is a capital-account ledger (contributions, withdrawals, TDS transfers) and carries no purchase dates.
- no short/long-term split for BELRISE INDUSTRIES LIMITED (lkp-securities-98245): the lot register accounts for 6500 unit(s) against 12500 held, so the lots do not cover the position. Splitting on them would put a tax basis on units the position does not contain, or treat the uncovered cost as long-term when it is simply unknown.
- no short/long-term split for PRICOL LIMITED (lkp-securities-98245): the lot register accounts for 2875 unit(s) against 650 held, so the lots do not cover the position. Splitting on them would put a tax basis on units the position does not contain, or treat the uncovered cost as long-term when it is simply unknown.
