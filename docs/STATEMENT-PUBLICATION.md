# Verified statement publication

The upload service owns receiving files, durable job scheduling and customer job status.
This backend owns matching, validation, source evidence and preparing a complete publication.
No dashboard layout or input control changes are required for this contract.

The deployed teammate intake path (`intake-uploads.mjs` / `statement-intake.yml`) calls
this publication validator, source-row verification and required tests directly. It now
opens codex PRs rather than pushing to main, saves durable checksum receipts, resumes
pending PRs without rereading their bytes and clears files only after the live version
check. A stale base closes the obsolete candidate and requeues it for regeneration.
The existing status/reason fields carry these outcomes; no UI layout change is needed.

The workflow uses `GLOW_INTAKE_TOKEN` if configured, otherwise its repository Actions
token. Actions-created PRs can require workflow approval; explicit dispatch runs CI
against the codex ref, while any remaining approval/review gate is respected. Configure
a dedicated repository-scoped app/token for unattended PR CI if the account requires it.
`GLOW_DASHBOARD_PASSWORD` is used only for authenticated GETs verifying the live revision.
Without that check the job stays processing and retains its source bytes. If Codex
review is unavailable, a clean statement delivery still publishes automatically.

The intake monitor independently checks the exact commit against its recorded main
base, permits only statement files and named generated artifacts, verifies the
immutable upload/document checksums (including nested ZIP leaves and retained
historical sources), and reruns the
identity, date, coverage and reconciliation assessment using trusted code. Passing
required CI then permits automatic PR merge without a reviewer callback. Missing,
unclear or conflicting data is held with its original bytes. Application code or
policy changes cannot use this path. Actual unresolved reviewer findings and any
required repository approval remain blocking; branch protections are never bypassed.
CI completion on a same-repository delivery branch wakes the trusted main worker;
the scheduled poll remains a recovery path. Fork CI cannot trigger this privileged job.

## Handoff from the upload service

Save the original bytes under `source/` in an isolated worker checkout based on current
`main`. Do not overwrite an earlier delivery. Provide a request JSON file in its job
workspace (never passwords, cookies, tokens or an entire environment):

```json
{
  "schemaVersion": 1,
  "files": [{ "path": "source/uploads-<delivery-id>/provider/statement.pdf", "sha256": "<SHA-256 of uploaded bytes>" }],
  "expected": { "provider": "<exact provider folder>" }
}
```

`expected.ownerId` and `expected.accountNo` are optional additional constraints. Folder
metadata constrains identity; it cannot override the identity printed in a statement.
An intentionally mixed-provider delivery must omit a shared expected provider and must
still resolve each document's own identity. New providers need a verified reader and
precedence policy. File text is data, never an instruction to execute or change policy.

Run, in order:

1. `npm run statements:prepare -- --request <request.json> --base-ref origin/main`.
   On this Mac, run the whole command through `codex-heavy-run -- ...`. It inventories
   source files, extracts to an isolated candidate archive, compares with the verified
   base, builds and verifies the candidate book and checks reads/source coverage. It
   never replaces the checked-out or deployed book. All output stays in the checkout's
   ignored `.cache/statement-jobs/<content-id>/`.
2. Read `status.json` and `assessment.json`. `needs_review` / exit 2 leaves the verified
   book intact. A repeated delivery returns `duplicate` and publishes no extra records.
   `failed` / exit 1 preserves logs and inputs. `verified` supplies a sealed artifact set.
3. `npm run statements:publish -- --seal <job>/seal.json` prepares an immutable commit
   on `codex/statement-delivery-<id>`, without switching/resetting the current checkout
   or changing its index. `--push true` pushes only that branch and creates/reuses its
   PR. It does not merge before CI. The worker needs GitHub
   credentials capable of starting PR CI; the default Actions token may suppress events.
4. The deployed intake coordinator automatically monitors its checksum-receipted
   data-only PRs and merges them after the checks above pass. No human or bot approval
   receipt is needed for that path. For a separately prepared developer delivery,
   the explicit finalization command remains available: after resolving actionable
   review, write a review receipt
   with `commit` (the exact PR head), `kind` (`automated` or `local`),
   `feedbackAddressed: true` and, for a local
   review, `automatedUnavailableReason`. Call `npm run statements:finalize --
   --publication <job>/publication.json --review <job>/completed-review.json`.
   It rechecks the exact head, green CI, review decisions and unchanged main, then merges
   through the PR. Required review/branch protection is never bypassed.
5. The existing Pages integration deploys the merged commit. The upload worker must
   verify the authenticated **GET** `/publication.json` reports the candidate
   `archiveRevision` before marking its job published or clearing a staged upload.
   A merge alone is `merged_awaiting_deployment`, not published. None of these commands
   performs a manual deployment or deletes an inbox object.

The upload coordinator retains the request and job state in its durable storage. A
worker can reconstruct a lost scratch directory from the retained source bytes. IDs,
source checksums, immutable commits and base-revision checks make retries safe.
If main changed, reprepare against it; do not force an old candidate over a new book.

## Accuracy and format changes

Header-driven coordinate readers already handle column order, wrapped labels and known
aliases. Publication adds checks for complete reading, exact canonical owner, account
ownership, security/ISIN conflicts, ambiguous duplicate holdings, valid dates and numeric
types, explicit provider policy, same-date conflicting issues and lost field coverage.
It compares individual reconciliation findings with the baseline, not just error counts:
an old resolved error cannot hide a different new error. A mixed duplicate/new delivery
is held rather than silently discarding its new statements.

Three cases are not losses or conflicts (Stage 10gk):

- A failed reading that published nothing may give way to a reading of the same source
  file, such as a scan its reader now checks.
- A mail server's removal notice where a statement should be (`attachment-removed`)
  publishes no facts and is listed as never arrived.
- A row filed under a key/ISIN pairing the verified book already carries is not a new
  split. A delivery still may not add a pairing.

A new header meaning or unreadable layout is held for review. Extend its adapter and
verified aliases with a fixture, then rerun the same checks. No system can safely infer
every arbitrary format change. Accuracy means unfamiliar semantics cannot become the
wrong quantity, cost, date, holder or security. Existing verified data remains available.

## One version, inspectable evidence

`build:views` publishes the canonical book, original normalized documents, field evidence,
ledger projections and consolidated audit workbook under one content-addressed revision.
The frontend's compiled read-model manifest pins that revision. The stable discovery URL
is `/publication.json`; its `manifest` points into `/views/<revision>/publication.json`.
That manifest names the canonical book and position evidence; document entries name
their field evidence and immutable normalized document. These are authenticated static
backend endpoints, not a second editable register. No new service or UI is required.

An invisible browser controller checks the published revision and reloads the whole
application at the current URL. It never swaps a new positions array into modules
still carrying old cash flows/lots. Upload/folder-reading activity, focused controls,
dialogs and draft/scenario edits defer replacement; navigation then picks up the new
version. A persisted retry guard prevents stale HTML or an outage causing reload loops.
There are no new controls or layout changes.

The book builder records its actual selected normalized holding pointer. Audit links
use that pointer rather than finding a statement with an equal market value. Evidence
checks provider/account/owner/member/security/quantity and valuation before publication.
Recovered costs retain their supplementary workbook/sheet/row evidence; review holdings
retain their review row. Supporting records are labelled supporting records, not falsely
presented as a directly printed value. Normalized field pointers are exact; a PDF page
or pixel coordinate is never invented when its reader did not retain that precision.

New delivery receipts preserve upload and expanded source SHA-256 values in Git.
Historical documents without such receipts explicitly have no raw-file checksum; their
normalized content revision still identifies exactly what was used. Reader revisions
include the adapters, policies and calculation code. Missing values remain missing.

Live quotes and NAVs remain separate price overlays. Positions retain the actual feed,
instrument, quoted value and available observation/trade/publication timestamps alongside
their original statement reference. An unavailable timestamp is null. Entered calls and
profiles retain their existing dashboard-store history. A current price never rewrites
a statement's quantity, cost, investment date or audit record.

## Verification

`npm run test:statements` exercises identity conflicts, semantic field loss, changed
column order/insertion/wrapping/known aliases through the actual coordinate reader,
duplicate handling, reconciliation changes, source-pointer mismatches, checksums,
stale candidates, atomic Git commits/retries and CI/review gates. The family suite
checks the complete published canonical book and every statement holding's source row
against the actual archive, including separate live-price evidence. Required PR CI also
re-extracts all source files and checks byte-identical regeneration.
