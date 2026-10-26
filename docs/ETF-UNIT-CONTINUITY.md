# ETF identity, unit counts and acquisition evidence

DSP Gold and Silver were missed because three independently valid stages did
not preserve the same holding identity:

1. The 22 September NAV overlay (`eab90c5a`) recognised the tenfold unit-basis
   difference but had no dated successor-ISIN model. AMFI's file no longer
   contained the July statements' ISINs. The refresh recorded both as unresolved
   and still succeeded. Tests explicitly printed `NOT CHECKED` for this case.
2. The 4 October custody correction (`c6ed4aa1`) correctly stopped treating the
   demat's last-movement rate as a valuation. It made the holdings quantity-only.
   Global search included those records; Portfolio Monitor's selector read
   priced positions and fund exposures, so its inventory omitted them.
3. The 21 October cost recovery (`f487ce86`) reconciled both ETFs' exact source
   lots, but attached acquisition evidence only after a price gate admitted a
   live position. The quantity-only detail renderer hardcoded absent cost/date
   cells, concealing already available records.

## Source evidence

The original, unmodified exchange PDFs are retained here:

| Circular | What it establishes | SHA-256 |
| --- | --- | --- |
| [NSE/CML/75868](reference/nse-cml75868.pdf) | New ISINs, 10-to-1 face-value subdivision, ex-date 28 August 2026 | `a834de3f9b3b975999b062e54fafa41271f74ee8a72f3f898779c88e656df8e7` |
| [NCL/CMPT/75902](reference/nse-cmpt75902.pdf) | Old ISINs, same date and subdivision; explicitly ten new units for one old unit | `faf273d962b6e4fa9a4d70c3d9e997fb8fcb6f270410bb47ed088900b6ce7a3e` |

Gold: `INF740KA1SW3` → `INF740KA1ZP2`. Silver: `INF740KA1RE3` →
`INF740KA1ZQ0`. These are the same funds after a documented conversion, not
name matches or a factor inferred from a price change.

## Shared contracts

`shared/fundUnitSplits.mjs` is the single source register (retained from the
parallel Stage 10hq change); `shared/fundUnitActions.mjs` follows its documented,
dated conversions. The NAV
builder and valuation layer use the same terms. It refuses a stale old ISIN on
or after conversion, ambiguous chains and undated balances. A new statement
already carrying the successor is not adjusted again.

The live position carries the converted count and current ISIN, with the exact
original count, ISIN and date in `fundUnitAdjustment`. Acquisition recovery
checks that original balance; total cost and purchase dates stay unchanged.
The statement book remains byte-identical. Source links search the original
PDF for its original figure and explain the intervening conversion.

Recorded holdings receive acquisition evidence before pricing. Both searches
include the held inventory even when valuation is unavailable; unvalued rows
never become zero-valued portfolio positions.

The NAV builder now fails before publishing if any held ETF has no usable
valuation path. The family suite positively asserts all held ETF coverage and
checks the three DSP account balances, conversion boundaries, unchanged costs,
purchase dates, repeated overlay, source links and unavailable-price inventory.
Future identifier changes require their own verified conversion evidence.
