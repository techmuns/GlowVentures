# Book report

What `npm run build-book` put in `src/data/glowData.ts`, and what it could not.
Generated — **do not edit by hand**.

## Totals

| | |
| --- | ---: |
| Consolidated market value | 83,50,63,590.78 |
| Positions | 143 |
| Accounts | 5 |
| Owners | 2 |
| Newest as-of | 2026-07-10 |

## Per account

| Account | Provider | Owner | Strategy | As of | Positions | Market value |
| --- | --- | --- | --- | --- | ---: | ---: |
| 3517383 | Carnelian Asset Management and Advisors Pvt Ltd | Ajay Jaisinghani | CARNELIAN BESPOKE PORTFOLIO | 2026-07-10 | 11 | 40,01,06,027.94 |
| 100022 | Goldstandard Wealth Private Limited | Ankita Jaisinghani | Aristos Equity Portfolio | 2026-07-10 | 32 | 7,75,38,153.36 |
| 100023 | Goldstandard Wealth Private Limited | Ajay Jaisinghani | Aristos Equity Portfolio | 2026-07-10 | 32 | 18,11,54,076.83 |
| 510854 | Green Lantern Capital LLP | Ankita Jaisinghani | GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND | 2026-06-25 | 34 | 5,92,48,501.89 |
| 510861 | Green Lantern Capital LLP | Ajay Jaisinghani | GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND | 2026-06-25 | 34 | 11,70,16,830.76 |

## Per owner

| Owner | Accounts | Positions | Market value |
| --- | ---: | ---: | ---: |
| Ajay Jaisinghani | 3 | 77 | 69,82,76,935.53 |
| Ankita Jaisinghani | 2 | 66 | 13,67,86,655.25 |

## Sector allocation

| Sector | Market value | Share |
| --- | ---: | ---: |
| Financials | 33,00,46,908.95 | 39.52% |
| Health Care | 15,26,80,525.5 | 18.28% |
| Industrials | 11,00,39,324.25 | 13.18% |
| Consumer Discretionary | 10,96,32,034.27 | 13.13% |
| Information Technology | 4,91,55,907.13 | 5.89% |
| Cash | 3,96,33,457.85 | 4.75% |
| Consumer Staples | 1,67,05,563.8 | 2.00% |
| Materials | 1,65,19,729.43 | 1.98% |
| Real Estate | 59,94,240 | 0.72% |
| Unclassified | 46,55,899.6 | 0.56% |

## Unclassified sectors

_None — every provider sector mapped to a GICS sector._

## What this corpus does not support

- account 510854: cash flows carry no opening portfolio value — no performance summary for the window, so a money-weighted return over it cannot be computed
- navHistory is EMPTY: the corpus carries an opening and a closing portfolio value per account and nothing between them. Two points are not a series; interpolating between them would draw a path nothing measured.
- unrealised short/long-term split is NULL on every position: it needs per-lot purchase dates. The CAPITAL REGISTER in this drop is a capital-account ledger (contributions, withdrawals, TDS transfers), not a lot register.
