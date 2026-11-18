# CAMS auto-intake — set it up once, then it runs itself

This wires the family's **CAMS / KFintech feed** straight into the dashboard, so
monthly mutual-fund and AIF statements arrive without anyone uploading them.

> *"once coding is done … github needs to be connected and direct push to
> cloudflare pages deployment. Never ask the user to do it just ask them to
> configure it once so forever its automated."*

Configure the feed **once** (below) and from then on it is automatic.

## How it works

```
CAMS SFTP feed ──(daily)──▶ cams-intake.yml ──▶ statement inbox ──▶ Statement intake ──▶ book ──▶ site
                            scripts/ingest/        (statement-inbox   (the existing       build +
                            cams-fetch.mjs          branch)            pipeline + gates)   deploy
```

The CAMS job only **moves files**: it pulls whatever is new on the feed and
drops it into the same inbox a dashboard upload uses
(`shared/statementInbox.mjs`). The existing **Statement intake** then reads each
file into the book, through every gate CI runs, and the site redeploys. There is
**no new reading path** — a CAMS statement lands exactly as an uploaded folder
would, and a file the pipeline cannot read in full stays `held` with its reason,
never guessed at (the standing no-fabrication rule).

It **never re-fetches** a file: each is keyed by the SHA-256 of its bytes, and
the set of fetched hashes is a small cursor in the dashboard store
(`cams:cursor`). CAMS reissues the same filenames every month, so the name is
not the identity — the bytes are.

Until the feed is configured the workflow is **inert**: it runs, finds no feed
secret, prints one line, and stops.

## One-time setup

1. **Get the SFTP details from CAMS.** A family office subscribes to a CAMS (or
   KFintech) statement feed and is given an **SFTP** host, a username, and a key
   or password, plus the folder the statements land in. (If your plan delivers
   statements only by **emailed CAS**, see *Mailback* below.)

2. **Add these repository secrets** (GitHub → Settings → Secrets and variables →
   Actions → *New repository secret*). Secrets are encrypted and never appear in
   the repo, the logs, or the browser — put the credentials **only** here, never
   in a file.

   | Secret | Required | What it is |
   | --- | --- | --- |
   | `CAMS_SFTP_HOST` | yes | the feed's SFTP hostname |
   | `CAMS_SFTP_USER` | yes | the SFTP username |
   | `CAMS_SFTP_KEY` | key **or** password | the private key (PEM), if key auth |
   | `CAMS_SFTP_PASSWORD` | key **or** password | the password, if password auth |
   | `CAMS_SFTP_PATH` | no | the folder to read (default: the login directory) |
   | `CAMS_SFTP_PORT` | no | the port (default `22`) |
   | `CAMS_SFTP_PASSPHRASE` | no | the key's passphrase, if it has one |

   `GLOW_GITHUB_TOKEN` is already set (the same token the dashboard store and the
   statement inbox use) — nothing to add there.

3. **Send one sample statement.** The first real file confirms the pipeline can
   read your CAMS layout. Routine CAMS consolidated PDF/Excel is already read; if
   a particular layout is new, the file lands `held` with the reason, and a
   reader is written for it before it is trusted — no figure is ever guessed.

That is all. The job runs **daily** and queues anything new; the first run after
you add the secrets picks up whatever is already waiting on the feed.

## Test it without waiting a day

- GitHub → Actions → **CAMS intake** → *Run workflow* → tick **dry run**. It
  lists the new files it *would* queue and writes nothing.
- Run it again without dry run to queue them for real.

Locally, point it at a folder instead of the feed (no SFTP needed):

```bash
CAMS_LOCAL_DIR=/path/to/a/folder/of/statements node scripts/ingest/cams-fetch.mjs --dry-run
```

## Security

- Credentials live **only** in GitHub Secrets — never committed, never logged,
  never in the browser bundle. This is the same rule as the statement passwords
  (`GLOW_PDF_PASSWORDS`) and the live-feed tokens.
- The `statement-inbox` branch and this repository are **public**, so every
  statement that lands is public — the same terms as every statement already in
  `source/` and every dashboard upload. Nothing changes that boundary.
- The SFTP client (`ssh2-sftp-client`) is installed **by this workflow only**,
  not as a project dependency, so the dashboard build and CI never carry it.

## Mailback (an alternative transport)

If CAMS delivers your statements only as an **emailed Consolidated Account
Statement** rather than an SFTP drop, the same pipeline applies — only the
*fetch* differs (read the mailbox over IMAP instead of listing an SFTP folder).
The fetcher is written so a second transport slots in beside `sftpTransport`
without touching the inbox or the reading path. Say the word and send one sample
CAS, and the IMAP transport is added the same way, validated against that sample.

## Files

- `scripts/ingest/cams-fetch.mjs` — the fetcher (transports, dedup, inbox commit).
- `scripts/ingest/__tests__/camsFetch.test.mjs` — its tests (local transport,
  type filter, SHA dedup, dry run, commit).
- `.github/workflows/cams-intake.yml` — the daily schedule (inert until configured).
