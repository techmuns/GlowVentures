# Rapid statement processing

The existing upload UI is retained: a statement enters the table with a progress
indicator and becomes **Ready** only after its complete data version is durable.
Exact duplicates remain a no-op. No production statement is uploaded by the tests.

## Processing and consistency

Recognised text PDFs and Excel statements use the existing coordinate readers,
saved password vault, reconciliation, publication assessment and canonical book
builder in a resident Node service. The selected-record proof uses fingerprints
and holding indexes scoped to one immutable candidate; it never reuses a hash
after reconciliation or across mutable candidates. All 39 book exports, ledger
indexes, consolidated exports, source previews and reporting pages select one
version before application modules initialize. A read gap or failed persistence
cannot replace the last verified version.

Originals and compressed version snapshots remain in GitHub on the
`statement-publications` branch. Its ref promotion atomically selects a complete
snapshot and receipt. Old versions and original bytes remain in Git history.
Cloudflare holds disposable compute caches; it stores no canonical application
data in R2, KV or Durable Object storage. Concurrent uploads serialize, competing
ref writes reprepare against the newer version, and a compute restart resumes
its existing durable inbox claims. The legacy intake cannot claim rapid work.

ZIPs, scans and batches over 50 MiB automatically use the existing full intake
path. Unrecognised or inconsistent records require review. These cases cannot
honestly be promised a universal two-second completion time. The progress UI
must retain their real state.

A new code deployment merges its verified static archive with the previously
published runtime statements, reconciles that union and rebuilds all collections.
Conflicts retain the saved publication for review. The private service's image
must track main: the gated `Statement processor` workflow provides that update
after initial activation. A client rejects an incomplete or incompatible runtime
snapshot as a whole and clearly identifies its saved-data fallback.
An old session can still inspect its canonical facts and source bytes after a
reader change. A derived report that needs the old reader requests a safe whole
application refresh; it never runs newer calculation rules over the older book.

## Activation gate

Merging this code does **not** provision or activate the processor. The current
application continues using its established intake until the private service
binding, credential and explicit `GLOW_RAPID_STATEMENTS_ENABLED=true` flag exist.
Initial production deployment, secret setup,
publication initialization, binding and automatic service updates require the
user's explicit approval under the repository's production-action rule.

After approval, use the already configured Cloudflare account and repository:

1. Run `node scripts/dev/prepare-rapid-config.mjs` at the verified main commit.
   It only prepares ignored configuration; it never deploys or writes secrets.
2. Authenticate with Wrangler and deploy the prepared private Worker/container.
   Provision its existing repository writer, existing dashboard vault credential
   and a fresh private `GLOW_RAPID_STATEMENTS_TOKEN` as Worker secrets. Never put
   their values in commands, repository files, artifacts or logs.
3. Bind the production Pages project's `GLOW_RAPID_STATEMENTS` service to
   `glow-statement-processor`. Set the same private token and the explicit
   `GLOW_RAPID_STATEMENTS_ENABLED=true` flag on Pages. Keep
   `workers_dev` disabled. A URL override is for localhost/staging tests only.
4. Initialize and check the service read-only through the authenticated dashboard
   endpoint. Confirm reader compatibility, source counts, all canonical totals
   and selected-source proofs. Verify an existing browser session upgrades.
   Do not upload, replay or retry a production statement without exact approval.
5. Configure the deployment workflow's Cloudflare account/token secrets and set
   repository variable `GLOW_RAPID_STATEMENTS_ACTIVE=true` to authorize subsequent
   main deployments. Keep the Worker dashboard credential synchronized when the
   existing vault/dashboard password is rotated.

The proposed compute limit is one `standard-2` instance (one CPU, 6 GiB memory),
sleeping after 15 minutes without traffic. Visible dashboards keep it warm through
their normal freshness checks. It requires Workers Paid and metered container,
Worker and Durable Object usage; no external LLM or enrichment credits are used.
See [Cloudflare's current pricing](https://developers.cloudflare.com/containers/platform/pricing/).

After runtime statements have been accepted, disabling the service alone would
leave the compiled fallback behind those statements. A production rollback must
keep the last verified runtime version available, or first materialize its full
archive into the verified main build through the normal PR/checks. During an
outage the UI identifies its compiled saved-data fallback; it never presents that
fallback as a successful latest-data refresh. Production rollback actions retain
their separate explicit-authorization requirement.

## Verification

`scripts/dev/benchmark-rapid-statements.mjs` removes the real protected Bandhan
statement from an isolated baseline, reads its original bytes and checks all 39
collections against the verified book. It reports cold/warm processing separately
from upload/network/persistence latency. The CI image replay limits compute to
one CPU and uses the production Node image.

`scripts/dev/check-rapid-statements.mjs` exercises a real browser drop through
the Pages handler, readers, private HTTP processor, Git blobs and atomic refs in
an isolated local bare repository. It checks complete financial collections,
reporting projections, source bytes/provenance, 12 routes, duplicate no-ops and a
code-deployment migration. Screenshots and reports stay under the checkout's
ignored `.cache/rapid-statement-publications/`. GitHub network and production
hosting latency are not established by this rehearsal.
