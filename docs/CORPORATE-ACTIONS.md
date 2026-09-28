# Corporate actions and dividend-inclusive period returns

The dashboard reuses Glow Central Research's NSE + Screener capture through
`/api/corporate-actions`. It does not run another scraper or require new secrets.
The endpoint fetches the public, market-wide capture at a fixed URL, filters it
locally by the book's symbols/ISINs, and never forwards holdings or session cookies
to Research. A 15-minute refresh shares one edge capture across users; upstream
failures retain the last good capture, with its original date. The browser also
has a dated, committed fallback at `public/data/corporate-actions.json`.

## What changes a figure

- **Splits and ordinary equity bonuses:** only events strictly after that
  account's statement date and on/before the quote's trading date are applied.
  Ratios compound chronologically. Quantity and average investment cost change;
  total investment cost, original acquisition dates and statement figures do not.
  A new statement already incorporating an event supersedes the projection.
- **Dividends:** rupees per share times the projected eligible shares at the
  ex-date. These are **gross declared entitlements**, not verified receipts.
  No reinvestment or tax withholding is inferred. A later split never multiplies
  an earlier dividend. Historical dividends and the existing `dividendReceived`
  field are not added again to this new period's return.
- **Period return:** `(closing projected value + gross dividend entitlements −
  opening statement value) / opening statement value`. It assumes no trades or
  transfers after the statement, just as marking carried holdings live does.
  The start/end dates are printed per account. This is not lifetime return,
  realised P&L, a portfolio-wide return, a CAGR, or an XIRR.

The new screen is **Extras → Corporate actions & dividends**. A company page
shows the same account-level table and source events. Portfolio Monitor links
to it and labels individual-share HPR/CAGR as excluding separate dividend income. Historical
price returns are likewise explicitly labelled as excluding dividends.

## Refusals are part of the calculation

An ambiguous ratio, conflicting same-date events, mismatched ISIN, fractional
share entitlement, rights issue, demerger, non-equity bonus or other unsupported
share event withholds the live mark until a statement reconciles it. A quote
is also withheld where the book records sales after the holding statement:
the unchanged-holdings assumption is already contradicted there. A quote
without a trade timestamp cannot license a share adjustment or a post-dividend
total return. Unverified ex-date previous-close bases do not produce a day move.

Cash terms quoted only as a percentage are not rupees per share. Mixed dividend
and share actions are not reduced to just their cash component. Screener-only
numeric company keys cannot masquerade as NSE tickers: the actual capture has
`RECLTD` for Recode Studios as well as REC, so ticker matching alone is unsafe.
The affected return is withheld and its evidence gap is visible.

**A capture up to three days behind the quote still marks shares live**
(`SHARE_EVENT_LEAD_DAYS`). A split or bonus must be notified to the exchange at
least seven working days before its record date, and the capture lists
forthcoming share events, so a short lag cannot hide one. Without this, every
company share lost its live price each morning until Research's daily capture
(taken after the open) arrived, and all day when only the dated fallback was
available. Dividends get no such room: a lagging capture still withholds the
entitlement and the total return.

Incomplete event history, older per-source capture dates and failed source
reads never become zero dividends. An event at/before the account's closing
date is displayed as earlier evidence, never reapplied. Future actions remain
upcoming. Refreshes always derive from the immutable statement book, not from
already adjusted positions.

Entitlements are not written into cash, consolidated NAV, tax lots, or account
cash-flow/XIRR inputs. Those figures may already include dividend cash; adding
it again would double count. Funds retain their own NAV/distribution model.
Polycab remains ring-fenced on its existing page and is not introduced into the
consolidated book through this feature.

## Refresh and verification

`node scripts/import-corporate-actions.mjs` refreshes the committed fallback;
an optional local Research JSON path makes the import reproducible offline.
Review and merge fallback changes through a PR. The live proxy refresh does
not need a deployment or a repository write.

`npm run test:family` covers event parsing, the real REC/Recode collision,
split/bonus value neutrality, dated dividends, replay, ambiguous/fractional
entitlements, stale/missing coverage, and bounded last-good proxy behavior.
CI runs this suite alongside the existing ingest and byte-identical-book checks.

After a build and local preview, `node scripts/dev/check-corporate-actions.mjs`
exercises the rendered calculation in both themes, source/coverage wording,
filtering, sorting, repeat refresh, company drill-down and 1024px layout.
Its quotes/events are explicitly synthetic local regression inputs, not
production data. The shell already overflows at phone widths (390px) on the
existing Morning CIO page; this change does not redesign the global shell.

Full **since-purchase** dividend-inclusive returns still require a complete
dated holding/trade history and dividend receipt/entitlement reconciliation.
The public event calendar alone cannot prove the family's historical eligible
quantity, cash received, tax deducted, or dividend reinvestment.

## Daily movers resilience (28 September 2026)

The live incident returned 169 usable quotes while `/api/corporate-actions`
returned HTTP 503. The September 23 saved capture then exceeded the share-event
coverage window, suppressing all live valuations and misleadingly emptying the
movers card. The Research capture itself was current and publicly available. Hosted preview
verification exposed the exact cause: Cloudflare rejects `redirect: "error"`
before issuing a fetch. The proxy now uses `manual` and rejects 3xx responses
explicitly; the platform-specific contract is asserted in the regression suite.

The proxy now tries the identical capture in Research's public GitHub repository
when the sister Worker fails or carries older source dates. Both routes keep the
same bounded reads, identity filtering, future/regression checks and original
capture timestamps. Cache failures cannot discard a successful fetch. The
committed fallback was refreshed from that same September 28 capture.

Percentage movers use exchange price versus exchange previous close, independent
of the share-count gate. Rupee impact and the weighted portfolio move still require
verified share quantities for every account holding that security. Known share
actions on the quote's ex-date withhold even the percentage until the close basis
is known; rejected quote identities stay rejected. The panel names partial impact
coverage and the confirmed trading session, and compares indices only for the
same confirmed session. Sources without exchange timestamps use “Latest price
movers”; observation times never stand in for exchange sessions. The independent
price-identity check also runs while share quantities are withheld.

Failed quote rounds retain eligible dated observations and report the failure.
Partial refreshes cannot renew an old quote's observation time. Retained quotes
expire at the IST date boundary or after twelve hours; malformed responses and
missing previous closes never become zero moves. Requests have deadlines, failed
quotes retry after 15 seconds, and failed event reads retry after 30 seconds.
The outage notice stays visible while retries are in flight. An old primary
capture stays marked retained and uncached if the mirror cannot supply a fresh
capture, keeping recovery on the faster retry schedule.
Retained quotes only complete a pending symbol when their exchange session
matches the new round, so a market-opening refresh cannot publish a partial
ranking. Request deadlines use AbortController with timer/listener cleanup and
work on browsers that do not implement AbortSignal.timeout or AbortSignal.any.

`npm run test:family` covers the incident, transport/cache failures, account
aggregation, ex-date guards, malformed quotes, true zero moves and cache expiry.
After `npm run build` and `npm run preview`, run
`node scripts/dev/check-daily-movers.mjs` for local light/dark browser checks of
outage, automatic recovery, cached prices, manual retry and 1024px layout.
