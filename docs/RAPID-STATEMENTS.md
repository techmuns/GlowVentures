# GitHub statement processing

Statement processing and storage use GitHub only. The existing free Cloudflare
Pages host and authenticated delivery Functions stay in place. No container,
Worker service, Durable Object, R2, D1, paid plan, external AI API or new hosting
resource is required. The repository's standard public-repository GitHub Actions
runners are used; larger runners are not selected.

The table shows Processing, then a green Ready tick after the complete version
is saved. Exact published duplicates finish in the upload response without an
Actions run or a financial change. A failure retains the last verified data and
an actionable retry/review state.

## One complete data version

`statement-intake.yml` starts on the upload's existing repository dispatch. Its
routine job runs the coordinate PDF/Excel readers, saved password vault,
exact-witness backfills, reconciliation, publication assessment and canonical
book builder. It prepares all canonical collections, normalized documents,
source provenance, audit files, ledger and consolidated exports, stock ledgers,
fund disclosures, look-through data, original bytes and encrypted previews.

The job writes a single Git pack on `statement-publications`, with a separate
Git index that never changes main or the checkout. A non-force ref update
publishes all files and `current.json` together. A conflicting publication is
reprepared against the newer complete version. Old versions remain readable.
Data-only commits start with `[CF-Pages-Skip]` and include `[skip ci]`, avoiding
a Pages rebuild and another CI/deployment cycle for each upload.

The existing authenticated Pages Functions only read these prepared GitHub
files. They neither parse statements nor build the financial book. They use the
existing `GLOW_GITHUB_TOKEN`/repository configuration; no new service credentials
or bindings are needed. Git packs compress the published objects. Prepared view bytes stream through
the gateway with a size bound, avoiding base64 decoding or book parsing there. The saved preview key
remains HttpOnly and scoped to `/api/statement-previews/`; revision-pinned
preview URLs use that same path.

The browser selects every canonical collection before financial modules load.
Every report and source request pins the same immutable revision. An open page
also discovers the first GitHub publication when the initial archive was served
from compiled assets; it does not require a new application deployment.

## Timing and recovery

Removing application build, full CI and site deployment from routine ingestion
removes substantial avoidable waiting. Processing time and job time are reported
separately. GitHub runner queue time, dependency startup, network transfer and
first publication preparation are additional time: this design does **not**
promise every new upload completes in a few seconds. Free GitHub Actions does
not provide an instant-start runner guarantee.

ZIPs, scans and batches above 50 MiB continue through the existing full reader,
including its source verification, PR checks and automatic deployment. Unknown
layouts or inconsistent financial records remain held. Speed never bypasses a
read or reconciliation gap.

The existing 20-minute schedule recovers interrupted queued/processing claims.
One workflow concurrency group serializes routine and full-reader work. Durable
publication receipts restore completed status after an interrupted inbox update.
New code on main revalidates the union of its static archive and prior GitHub
statements; a conflicting static copy cannot silently erase a financial row.
The job migrates an existing publication after successful main CI. It never
initializes an empty publication branch merely because code was merged.

If a GitHub version and the compiled reader are temporarily incompatible, the
browser clearly identifies its compiled fallback; it never applies newer
calculation rules to an old book. Earlier materialized reports remain available
at their immutable addresses.

## Verification and operating boundary

`scripts/dev/benchmark-rapid-statements.mjs` reads the real protected Bandhan PDF
against an isolated baseline that lacks it and compares every book collection.
`scripts/dev/check-rapid-statements.mjs` drops it through a real browser and
upload handler, simulates immediate GitHub scheduling, runs the real job engine,
pushes a real Git pack to an isolated local repository, then reads all prepared
views through the real delivery gateway. It checks all canonical collections,
five reporting projections, 12 routes, source bytes, protected previews with the
real cookie path, duplicate no-ops and migration across a code update.
GitHub scheduling/production latency is excluded from this rehearsal.

All generated evidence is inside the checkout's ignored `.cache/`. Tests do not
upload statements, initialize data, retry jobs or deploy services in production.
Merging uses the existing automatic Pages deployment. Other production actions
retain the repository's exact-action authorization requirement.

GitHub documents free standard runners for public repositories in its
[Actions billing guide](https://docs.github.com/en/actions/concepts/billing-and-usage).
Cloudflare documents the required skip **prefix** in its
[Pages GitHub integration guide](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).
