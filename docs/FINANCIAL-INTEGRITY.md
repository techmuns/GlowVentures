# Financial integrity contract

The dashboard retains its layout. Financial calculations, source records and
corrections now have a shared backend evidence contract. It distinguishes a
measured zero from missing data, a carrying amount from a valuation, a source
conflict from a parse failure, and an assumed balance from a reconciled one.

## Calculation and normalization boundaries

`src/lib/xirr.ts` aggregates same-instant cash flows, validates dates/amounts,
isolates roots using stationary points of the cash-flow equation in log-rate
space, and checks the residual before returning one unique stable rate. An
arbitrary rate scan or starting guess cannot select between multiple rates.
Independent analytic tests cover losses, nearby roots, negative roots, scaling,
row order and same-day splitting. An exhausted numerical budget returns no rate.

NAV projections emit day-weighted capital, whether timing is known, and the
method used. End-of-day Modified Dietz weights are based on the actual dated
record, reconciled with the printed net. An undated residual is never given a
fabricated date: it remains an explicitly marked end-dated approximation. The
active benchmark chart continues to use the return cards' shared selection.

Canonical money is INR rupees. Explicit foreign-currency or unconverted scale
metadata cannot cross publication. Known adapter scale conversions remain in
their adapters. Settlement amounts and reconciliation use decimal paise
integers; quantities keep their own precision. Currency display conversion does
not rewrite the ledger. Original raw-file hashes are included in static field
evidence when the original index is bound to the same archive manifest.

## Ownership graph and event ledger

`config/financial-identities.json` gives instruments persistent internal IDs.
Exact ISIN witnesses and reviewed name aliases extend an identity; a conflicting
identifier or an unreviewed merge is held. Account, member and position identity
remain separate. A custodian observation of fund units is not automatically a
second economic investment.

The versioned graph contains canonical holders, accounts, positions, instruments
and custody links. `config/ownership-relationships.json` can add independently
sourced legal entities and effective-dated ownership fractions. No trust
beneficiary or indirect ownership percentage is inferred from a family name.
Cycles, invalid dates and overlapping ownership above 100% are rejected.
Ownership-path projections name missing fractions and disputed/at-cost marks.
A holder-of-record relationship identifies the account's named legal holder; it
does not assert who beneficially owns a trust or company above that holder.

The event ledger keeps dated trades, gross income, capital records and supporting
corporate-action notices distinct. Settlement-control postings balance in exact
paise. Gross income is first a receivable: a cash receipt and withholding credit
need their own evidence. Supporting notices never post the same payment again.
This is not a claim that missing acquisition lots or bank funding were supplied.

Three-way checks compare unit registers/transactions, acquisition-lot costs and
bank cash chains. `config/settlement-accounts.json` supplies reviewed account
mappings. A bank match requires the exact settlement reference, holder, date and
paise amount; equal amounts alone cannot create an internal transfer. Without
those sources the check is unavailable, with a reason. Retained unvalued custody
rows may overlap other positions and are never counted as additional investments.

## Historical discrepancies

`config/reconciliation-exceptions.json` records exact finding fingerprints,
source-document revisions, affected metrics, disposition, reason, review owner
and review dates. Existing baseline membership is not permission for a finding.
An altered source/finding, missing review or expired review holds publication.
The recorded review days use UTC. Unresolved entries remain unresolved, including
the Kotak valuation discrepancy; this release does not invent a corrected value.
Printed weights are not substituted for derived weights. Printed settled cash
is not replaced by a reconstruction from rounded per-unit rates.

## Corrections and versioning

The server reads the same current immutable statement version as the application
before offering editable inputs. It validates the entire proposed batch,
including restores, against capital identities and any specifically evidenced
reinvestment adjustment. Partial records remain partial. Corrections retain the
previous/original value, source fingerprint, effective date and validator version
in the existing Git-backed store history. There is one authenticated dashboard
session, so no individual editor identity is invented.

When a deployment changes the reader code but the entire financial book is
unchanged, the server accepts that exact book using its canonical SHA-256
fingerprint. It hashes the received book rather than trusting a declared hash.
A different book under an incompatible reader remains blocked until publication
catches up. This avoids disabling number editing after unrelated app changes.

The existing number editor stages related capital fields and restores in one
atomic save. Inline cells link to that same grouped editor when a relationship
needs more than one amount changed. Incomplete source balances are unavailable
checks, not reconciled capital identities. Static builds evaluate source-review
expiry on the publication day and block expired or altered review evidence.

A correction cannot silently preserve an XIRR based on incompatible dated cash
or units. The dated return remains unavailable until the transaction record
reconciles with the correction. The canonical statements are not overwritten.

## Published evidence

Each immutable publication includes:

- `financial/integrity.json`: complete contract and coverage summary.
- `financial/graph.json` and `financial/registry.json`: identities and relationships.
- `financial/events.json`: event observations and settlement-control postings.
- `financial/metrics.json`: units, currency, dates, formula versions, source
  pointers, status and usable values for holding measurements.
- `financial/checks.json`: reconciled, disputed and unavailable controls.
- `financial/reconciliationReviews.json`: exact historical review decisions.

`/api/financial-integrity?part=integrity` discovers the current authenticated
report. It also accepts `graph`, `events`, `metrics`, `checks`,
`reconciliationReviews` and `registry`. Existing immutable statement-data paths
can pin a report to a specific version. The same preparation and identity checks
run for static builds, fast intake and reader migration. Configuration is part
of the reader revision, so a policy change cannot silently reuse old indexes.

Source gaps remain real: purchase records, dated cash flows, bank mappings and
private valuations must arrive from the family, custodian or issuer. The
contract records these gaps; enrichment cannot turn them into verified facts.
