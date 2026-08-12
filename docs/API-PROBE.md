# What the muns catalogue actually answers — measured 2026-08-12

Six endpoints this dashboard does not use were exercised against the live API
through `functions/api/probe.js`, from the one place `MUNS_TOKEN` exists. Every
line below is a measurement, not a reading of the catalogue document — which
this repo has already caught being wrong once (`type: "stockquote"` is
documented and 422s; `stockquote_batch` is required).

**Read the outage section first.** Three of the six answered `502` on the first
attempt and answered properly minutes later. A finding taken from a single
attempt during this would have been false.

---

## The upstream is FLAPPING, and a plain quote call cannot detect it

`/api/quotes` was down from roughly 08:19 to 09:56 UTC — the second outage in
nineteen hours (up 14:25 on the 11th, down 02:39, up 07:21, down 08:19). Inside
that outage there was at least one successful fetch, at 09:17:48.

Two things follow, and both were live mistakes before they were measured:

**A plain `/api/quotes` is not a health check — it reads the edge cache.**

| 09:20:16 UTC | `probe:true` (bypasses cache) | `ok:false` `chunk-timeout` 26,000 ms |
| 09:20:43 UTC | plain (reads cache) | `ok:true` `fresh:0 stale:1 ageS:175` |

Same deployment, 27 seconds apart. The plain call was serving a last-good quote,
which is exactly the stale-fallback behaviour this dashboard wants and exactly
the wrong thing to ask "is the upstream up?". A control that reads a cache is
testing the cache.

**A timeout is not an answer.** `scripts/dev/probe-catalogue.mjs` retries every
question until it yields an HTTP status — 404 and 422 count — and a question
that never does prints *"NO ANSWER … this is an outage, NOT a finding about the
endpoint"*. The alternative is the FRED mistake again: an absence filed against
the wrong cause, telling a reader to stop looking for something available.

---

## 1. `web_reader` reaches the Indian statistical hosts this repo cannot

**This is the finding that moves the most work.** MoSPI, RBI, CEA and the rest
refuse connections from both this container and a GitHub runner, both outside
India, and that geo-block is the stated cause of a large block of not-built
items. Measured:

| Target | Result |
| --- | --- |
| `rbi.org.in/` | 44,558 chars of real content |
| `cea.nic.in/` | 54,375 chars, including the live all-India demand table |
| `mospi.gov.in/` | **"All attempts (Tables and Fallback) failed to extract readable text"** |

So the block is lifted for RBI and CEA. MoSPI is reachable but did not render —
that is a different problem from a refused connection, and not yet diagnosed.

### The RBI Weekly Statistical Supplement comes back as a labelled table

`BS_ViewWSS.aspx` is a **form**: read by URL it returns the subsection dropdown
and no figures. `WSSView.aspx?Id=<n>` is the per-issue page, and it returns the
supplement itself —

```
| (₹ Crore) |
| Item | Outstanding as on | Variation over |
| M3 | 18844578 | 20489469 | 210494 | 1.0 | 2049488 | 12.2 | …
| 1.1 Currency with the Public | 2751828 | 3037491 | …
```

— rows labelled, columns labelled, unit declared. That is the shape
`src/lib/financialTables.ts` already parses and the discipline `lib/table.mjs`
already applies: **match on header text, never on column index.**

**`web_reader` reads the linked `.XLSX` too**, and returns the same figures:
`M3 = 20489469` off both the HTML page and
`rdocs/Wss/DOCs/6T_15042022…XLSX`. Two representations of one document agreeing
is the check that the reader is not inventing structure.

What is NOT solved: **finding the current issue.** `Id=25253` is the 15 Apr 2022
supplement, reached from a search result. The index is behind the form, so a
reader still has to discover the live `Id` — the dynamic-selector problem
`CLAUDE.md` already names for CEA, Coal and the JPC. Reachability is solved;
addressing is not.

### moneycontrol — the `ratio_source` chain completes, and returns a real table

`ratio_source` answers with a moneycontrol URL and the literal instruction "Use
WebReader Tool". Pointed at that URL, `web_reader` returns HTTP 200 and ~32 KB,
and the ratio table is in it, labelled on both axes over seven year-ends:

```
| Indicators | Trend | Mar 26 | Mar 25 | Mar 24 | Mar 23 | Mar 22 | Mar 21 | Mar 20 |
| Basic EPS (Rs.)                | … | 59.69 | 51.47 | 102.90 | 98.59 | 92.00 | …
| Return on Networth / Equity (%)| … |  8.93 |  8.25 |   8.77 |  9.31 |  7.78 | …
| Current Ratio (%)              | … |  1.10 |  1.10 |   1.18 |  1.07 |  1.12 | …
```

That is the missing half of the rule this repo already wrote: `ratio_source`'s
own response stays prose because nothing in it says which number is which
company's PE. **This document is not that** — it says so on both axes, and is
readable by the same header-matching discipline as everything else here.

Two things a reader of it must handle:

- **The `Trend` column is a chart, not a figure.** Every cell reads "Created
  with Highcharts 11.4.8". Matching periods by header text skips it naturally;
  a positional read would take it as the first data column.
- **The per-share lines are NOT adjusted for share-count events.** Between
  Mar 24 and Mar 25 every per-share row halves together — EPS 102.90 → 51.47,
  book value 1,172.75 → 623.12, revenue/share 1,331.75 → 712.90 — while the
  margin and return rows do not move. Whole-table halving of exactly the
  per-share lines is a share count doubling, not a collapse in earnings.
  Charting that series unadjusted would show a 50% fall that never happened.

## 2. `market_data` returns a four-row preview even with `csv=true`

The note atop `functions/api/history.js` said so and is now measured:

```
Sample Data Preview:
Date, Open, High, Low, Close, Volume, Dividends, Stock Splits
2026-01-01 … | 1568.3485107421875 | 6408128 | 0.0 | 0.0
2026-01-02 … | 1584.9718017578125 | 6602230 | 0.0 | 0.0
...
2026-07-30 … | 1292.9000244140625 | 12158451 | 0.0 | 0.0
2026-07-31 … | 1307.800048828125  |  8624996 | 0.0 | 0.0
Total Rows: 146
File Path: /shared/csv/RELIANCENS.csv
```

891 bytes for 146 rows. The header, the first two, a literal `...`, the last
two, and a path on the service's own disk that no documented endpoint serves.
`csv=true` changes nothing. `/api/prices` (Yahoo) stays the source of the
company chart.

## 3. `combined_financials` is the SAME document `/api/research` already gets

201, 14,591 bytes, 119 pipe rows, and its sections are

> Financial Summary · Pros & Cons · About · Stock details · Shareholding
> Pattern · Balance Sheet · Profit & Loss · Quarterly Results · Peer Comparison

— identical to `financial_tables_markdown`. **No cash flow statement**, which
was the question. Nothing to gain by wiring it.

## 4. `/financials/<TICKER>.NS` DOES carry cash flow and an earnings calendar

The plain ticker returns "No data available" for every section, which reads as
"India is unsupported" and is not: the endpoint is yfinance-backed and wants the
exchange suffix.

| Request | Bytes | Sections |
| --- | ---: | --- |
| `/financials/RELIANCE` | 188 | four sections, all "No data available" |
| `/financials/RELIANCE.NS` | 22,940 | Income Statement · Balance Sheet · **Cash Flow Statement** · **Calendar Information** |
| `/financials/ABCAPITAL.NS` | 20,150 | same four |

Both are things nothing else here supplies. The calendar is the specific item
deleted from the company page as a fabrication (`Next earnings 24 Oct 2026`);
it is now sourceable:

```
Ex-Dividend Date: 2026-06-05
Earnings Date:    2026-10-16
Earnings High / Low / Average: 19.07 / 13.6 / 16.335
Revenue  High / Low / Average: 3130582000000 / 2495700000000 / 2854760666670
```

### But the money is printed in RUPEES with a DOLLAR SIGN

This is the reason the endpoint cannot be passed through verbatim:

| Line, 2025-03-31 column | Endpoint prints | Reliance actually reported |
| --- | --- | --- |
| Net Income | `$696.48B` | ₹69,648 crore |
| Depreciation & Amortization | `$531.36B` | ₹53,136 crore |

The figures are right and the currency symbol is wrong — the same class of error
as reading Yahoo's US-cents grain quotes as dollars, which the harvester's
`unit` field exists to prevent. A renderer that shows these strings as printed
would assert dollars on a rupee book.

Two further limits, both from the same formatting: the values are **pre-rounded
to three significant figures** (`$1.07T`), so nothing can be derived from them
without losing precision, and `N/A` fills the oldest column. Any use of this
needs the raw numbers, which this response does not carry.

## 5. `drhp_filings` returns an empty array

`[]` for PAYTM, ZOMATO, RELIANCE and SWIGGY — 2 bytes, HTTP 200 each time, not
an error and not an outage. The document repository gains nothing from it on
these tickers.

---

## What this changes

| Item | Before | After this probe |
| --- | --- | --- |
| RBI WSS series (13) | not built — host geo-blocked | **buildable**: reachable, tabular, and the XLSX agrees with the HTML. Still needs issue-`Id` discovery |
| CEA generation | not built — host geo-blocked | **reachable**; the structure problem is unchanged |
| Company cash flow statement | absent — no source | **sourceable** from `/financials/<T>.NS`, if the rupee/dollar mislabel is handled |
| Next earnings date | deleted as fabricated | **sourceable** from the same response |
| Company price chart | `/api/prices` (Yahoo) | unchanged — `market_data` confirmed a preview |
| `combined_financials` | untested | nothing to gain — same document |
| `drhp_filings` | untested | empty on every ticker tried |
| MoSPI | geo-blocked | reachable, does not render — undiagnosed |
| Ratio analysis (per-share, margins, returns, liquidity, leverage) | in the prose block | **sourceable** — the moneycontrol table comes back labelled on both axes, 7 year-ends |

Nothing here has been wired into a page. Each row above is a measurement of what
a source can supply, and the standing rule applies unchanged: a figure reaches
the screen only with its unit declared and its source named.
