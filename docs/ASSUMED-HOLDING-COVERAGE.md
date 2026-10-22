# Assumed continued ownership — 22 October 2026

The family authorised carrying a recorded share/unit balance forward when no later
purchase, sale, withdrawal or transfer in the supplied records contradicts that balance.
Every calculated figure carries an **assumed** label and an info button:

> No sale appears in the records we have. We assume [owner] still holds these shares.

This is an ownership assumption, not a statement that the transaction record is
complete. Source statements, purchase costs and verified returns are preserved.

## Source audit

The audit covers positive recorded position quantities and the listed depository
share candidates selected by the existing identity/deduplication gates. On the
book at main revision `b378a37a`, these are the upper bounds before price/event
checks and before excluding holdings already covered by a verified account return:

| Opening → 22 October 2026 | Potential holdings | Accounts |
| --- | ---: | ---: |
| 31 March → 22 October | 24 | 3 |
| 1 September → 22 October | 121 | 13 |
| 30 September → 22 October | 224 | 16 |

These are **not counts of filled returns**. The runtime must also obtain published
prices near both dates, reconcile split factors with the corporate-action capture,
check gross dividend entitlements and avoid counting a verified account twice.
The info buttons list the actual included holdings, dates and remaining gaps.

A read-only real-price check of Bharat’s HDFC account found 10 of its 12 listed
share candidates calculable from 1 September through the latest completed
October prices. Havells remains excluded because the event record’s ISIN differs;
Bhagyanagar remains excluded because its demerger needs a reconciled share balance.
Insolation resolves through its BSE listing. No source quantity or event was guessed.

## Fields this fills

- Opening and closing market values from recorded units and dated public prices.
- Selected-period gain, return and Absolute-return contribution.
- The capital bridge's change in holding value and gross dividend entitlement.
- Available-history, financial-year and calendar-year headline returns where their
  opening dates are supported. Cards and attribution share the same calculation.
- The Excel table includes **Holding basis**, so assumed figures remain identified.

## Fields it does not invent

- An original purchase cost, purchase date or since-investment profit that is absent.
- Ownership before the dated quantity record used by the calculation.
- A private-company mark, an unreported fund NAV, distribution or sale proceeds.
- A constant quantity where a later recorded trade, withdrawal or transfer contradicts it, an
  unknown fractional entitlement or an unresolved corporate action.

Growth fund NAVs can be used directly; distribution-paying funds still require
their payout records. Equity valuations use split-adjusted closing prices and
matching adjusted quantities. Dividends are gross entitlements on the published
ex-dates, not claimed bank receipts or assumed reinvestment. An unfinished daily
price is never used, and the actual measured dates remain visible.

## Implementation record

- The family authorised carrying recorded shares/units forward where no later purchase, sale, withdrawal or transfer contradicts the balance. Public prices and checked splits/dividend entitlements fill eligible period values, gains and returns; source records, unknown purchase costs and private marks stay intact.
- Return attribution, its capital bridge and Morning CIO period/history cards use the same eligible holding calculations and prefer usable statement returns. Every affected figure has an assumed label and an owner-specific clickable info explanation. Excel includes a Holding basis column.
- The public history service retains split-only closes separately from its dividend-adjusted return index, includes split events and refreshes older browser cache entries. Source audit and limitations are in `docs/ASSUMED-HOLDING-COVERAGE.md`.
- Focused checks cover quantity provenance, dated ownership, later sales/transfers, separate owners, price gaps, splits, non-reinvested dividends, double counting, bridge arithmetic and headline parity.
