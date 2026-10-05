# Data-table performance audit — 6 October 2026

The production Corporate Actions request took 4.53 seconds during the read-only
baseline observation, despite returning a saved capture. Its edge handler waited
for external Research requests before returning available evidence. The old ledger
loader fetched a manifest plus 307 documents (11,365,984 source bytes) and performed
reconciliation in each browser. The main JavaScript bundle was 442.77 KB gzip.

## Changes

- Corporate Actions returns a validated edge/deployment capture immediately,
  filtered on the server to the requested identifiers. Both external transports
  refresh in the background with bounded reads and deadlines. Saved evidence,
  coverage dates, source regression guards and outage backoff remain explicit.
  The browser briefly polls while the server refresh completes, retains existing
  content, and stops regular quote/action polling while hidden.
- `build:views` runs canonical ledger derivations on the build server, using the
  entire source archive. Browsers load only prepared transactions, gains, income,
  sales or a single security's record. Any missing source fails the build.
  Content-addressed URLs prevent mixing book revisions. Failed browser reads
  can retry, and concurrent consumers share a request. A complete security index
  distinguishes an empty fund-only ledger from an unavailable prepared file.
- `/api/stock-exposure` performs fund issuer matching, deduplication, aggregation
  and the promoter ring-fence on the server. It reads one prepared local asset
  and caches the completed result for the exact source revision and fund values.
  The browser no longer fetches all scheme portfolios to assemble that result.
  An older open tab receives an explicit reload prompt after a deployment.
- Research and ratio tables return dated saved copies while refreshing on the
  server. Successful browser requests are shared across tab visits; failures are
  retryable. Quotes, daily closes, returns and benchmarks retain their existing
  server data sources, date checks and missing-versus-pending semantics.
- Corporate Actions, Portfolio Monitor holdings and the large Ledger Insights
  tables mount 50 rows by default. Sorting and totals use the complete result.
  Next/Previous and an explicit All rows option keep every record accessible.
  The Monitor's row limit spans every group with one table-wide pager, retaining
  section headers and full-data totals. Page changes reset for changed filters,
  not unrelated quote updates.
- Route code loads separately, reducing the main JS bundle to 139.09 KB gzip.
  Raw source detail remains available on Data Audit, on demand.

## Route coverage

| Surface | Data preparation / load behavior |
| --- | --- |
| Corporate Actions; company Price & returns | Server-filtered saved capture, background refresh; bounded action table |
| Portfolio Monitor holdings, sectors, returns, company fund exposure | Server stock-exposure aggregation; no browser scheme fan-out |
| Portfolio Monitor transactions, Ledger Insights, mandate trades, company activity | Build-server reconciled ledger views; gains/income load only when opened |
| Morning CIO, Family & Entities, Capital Gains, Performance | Generated book plus existing server quote/NAV/benchmark endpoints; no raw ledger fan-out |
| Private Market and review tab | Generated source records; only requested tab renders |
| Company Financials, Cash flow, Documents, Concalls, Estimates, Ratios | Shared recent responses; server background refresh for saved evidence |
| Company insider dealing | Existing server per-company source/cache; requested only on its sub-tab |
| Polycab | Existing prepared live record and server endpoint |
| Holdings drill-down, Data & Refresh, Snapshot History | Generated book/static records; no market-wide retrieval on tab open |
| Data Audit | Manifest plus selected document/sheet; existing row cap and explicit full view |

## Verification

`npm run build`, `npm run test:family`, `npm run test:ingest`, local Cloudflare
Functions compilation, financial browser invariants, and the dedicated corporate
action/daily-movers regressions cover the changed contracts.

`node scripts/dev/check-data-performance.mjs` visits 19 routes/variants with local
feed fixtures and the actual stock-exposure handler. It verifies request budgets,
no runtime errors, pagination across all grouping axes, full-data access, filter
resets and the deployment reload prompt. Company financial browser invariants
also cover fund-only company activity. On this machine:

| Local metric | Before | After |
| --- | ---: | ---: |
| Ledger source-document requests | 308 including manifest | 0; two prepared view requests |
| Ledger initial mounted table rows | 2,895 | 105 including paging controls/summary rows |
| Monitor initial mounted table rows | 630 | 51 including paging control |
| Corporate Actions initial mounted rows | 282 | 51 including paging control |
| Ledger observed long-task time | 392 ms | 0 ms |
| Monitor observed long-task time | 313 ms | 0 ms |

These are local measurements, not guarantees about a user's network. A source
never previously captured can still require a first fetch; missing or stale
financial evidence is never presented as current just to remove a loading state.
Browser rendering, small display calculations and interactive sorting/filtering
remain client-side; expensive source retrieval, ledger reconciliation and fund
exposure assembly run on the server/build pipeline.
