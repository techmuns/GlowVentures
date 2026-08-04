# Book report

What `npm run build-book` put in `src/data/glowData.ts`, and what it could not.
Generated — **do not edit by hand**.

## Totals

| | |
| --- | ---: |
| Consolidated market value | 1,00,76,09,712.12 |
| Positions | 180 |
| Accounts | 9 |
| Owners | 3 |
| Newest as-of | 2026-07-10 |

## Per account

| Account | Provider | Owner | Strategy | As of | Positions | Market value |
| --- | --- | --- | --- | --- | ---: | ---: |
| 37702 | 360 ONE Private Wealth | Ajay Jaisinghani | — | 2026-06-30 | 1 | 1,45,80,412.51 |
| 60117 | 360 ONE Private Wealth | Bharat Jaisinghani | — | 2026-06-30 | 1 | 1,45,80,412.51 |
| 3517383 | Carnelian Asset Management and Advisors Pvt Ltd | Ajay Jaisinghani | CARNELIAN BESPOKE PORTFOLIO | 2026-07-10 | 11 | 40,01,06,027.94 |
| 100022 | Goldstandard Wealth Private Limited | Ankita Jaisinghani | Aristos Equity Portfolio | 2026-07-10 | 32 | 7,75,38,153.36 |
| 100023 | Goldstandard Wealth Private Limited | Ajay Jaisinghani | Aristos Equity Portfolio | 2026-07-10 | 32 | 18,11,54,076.83 |
| 510854 | Green Lantern Capital LLP | Ankita Jaisinghani | GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND | 2026-06-25 | 34 | 5,92,48,501.89 |
| 510861 | Green Lantern Capital LLP | Ajay Jaisinghani | GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND | 2026-06-25 | 34 | 11,70,16,830.76 |
| 128004 | V.E.C Assago Capital Management LLP | Ankita Jaisinghani | V.E.C ASSAGO Small and Mid-Cap Growth | 2026-07-06 | 17 | 6,55,22,325.41 |
| 128005 | V.E.C Assago Capital Management LLP | Ajay Jaisinghani | V.E.C ASSAGO Small and Mid-Cap Growth | 2026-07-06 | 18 | 9,24,43,383.42 |

## Per owner

| Owner | Accounts | Positions | Market value |
| --- | ---: | ---: | ---: |
| Ajay Jaisinghani | 5 | 96 | 80,53,00,731.46 |
| Ankita Jaisinghani | 3 | 83 | 20,23,08,980.66 |
| Bharat Jaisinghani | 1 | 1 | 1,45,80,412.51 |

## Sector allocation

| Sector | Market value | Share |
| --- | ---: | ---: |
| Financials | 34,45,26,271.4 | 34.19% |
| Health Care | 18,37,86,053.8 | 18.24% |
| Consumer Discretionary | 15,20,59,112.82 | 15.09% |
| Industrials | 13,34,08,364.12 | 13.24% |
| Information Technology | 4,91,55,907.13 | 4.88% |
| Cash | 4,30,49,796.5 | 4.27% |
| Unclassified | 3,98,59,333.92 | 3.96% |
| Consumer Staples | 2,16,99,367.56 | 2.15% |
| Communication Services | 1,98,43,470 | 1.97% |
| Materials | 1,87,60,499.66 | 1.86% |
| Utilities | 1,00,47,707.72 | 1.00% |
| Real Estate | 59,94,240 | 0.59% |

## Unclassified sectors

_None — every provider sector mapped to a GICS sector._

## What this corpus does not support

- account 360 ONE Private Wealth::37702: holdings 2026-05-31 superseded by 2026-06-30 — `360-one-private-wealth-37702-2026-05-31-holdings` not used
- account 37702: no time-weighted return series in any statement
- account 37702: no flow block in any statement, so no value bridge
- account 37702: no external capital movements found, so no money-weighted return series
- account 360 ONE Private Wealth::60117: holdings 2026-05-31 superseded by 2026-06-30 — `360-one-private-wealth-60117-2026-05-31-holdings` not used
- account 60117: no time-weighted return series in any statement
- account 60117: no flow block in any statement, so no value bridge
- account 60117: no external capital movements found, so no money-weighted return series
- account 510854: cash flows carry no opening portfolio value — no performance summary for the window, so a money-weighted return over it cannot be computed
- 1 holding(s) reported under more than one member: both rows are carried, and 1,45,80,412.51 is excluded from the consolidated total so each is counted once
- navHistory is EMPTY: the corpus carries an opening and a closing portfolio value per account and nothing between them. Two points are not a series; interpolating between them would draw a path nothing measured.
- unrealised short/long-term split is NULL on every position: it needs per-lot purchase dates. The CAPITAL REGISTER in this drop is a capital-account ledger (contributions, withdrawals, TDS transfers), not a lot register.
