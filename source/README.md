# source/ — raw statement drop zone

Drop the wealth-platform statements here: ZIPs, loose PDFs, PMS/AIF reports, fact
sheets, capital-call and distribution notices. Nested ZIPs are fine.

**These files never reach the browser.** `source/` sits at the repo root, outside
`public/`, so nothing here is copied into the build or served by the site. Only
the derived, reviewed extracts under `public/audit/` ship, and those sit behind
the password gate.

Then run:

```
npm run inventory
```

which expands every archive into `source/_extracted/` (git-ignored, regenerate at
will) and writes `docs/ingest-inventory.json` and `docs/INGEST-INVENTORY.md`.

Read the inventory's **"Could not classify"** and **"Overlapping reports"**
sections before extracting anything. One account on one date often produces
several reports that overlap and sometimes disagree; which one is authoritative
is a decision, not a default.

## Drop folders, and why filenames alone cannot separate two deliveries

`source/` carries several deliveries at once and **every one of them stays**:
the original set at the top level, the client's `august-2026/` folder, and a
folder per delivery after it (`august-2026-b/`, …).

A monthly drop REISSUES THE SAME FILENAMES — `LKP 2.zip`, `GREEN LANTERN -
ANKITA.zip`, `MOLECULE - AJAY.pdf` have all arrived twice. A snapshot
supersedes, so the later holding statement should win; a DATED ROW does not, so
the earlier issue's trades, capital-gain lots and dividends must survive. Both
of those need both files on disk, which is why a new delivery goes in its own
folder rather than on top of the last one.

Before adding a file, hash it against what is already here. Three of the five
files in the delivery that created `august-2026-b/` were byte-identical to
statements already in `august-2026/` and were NOT copied in: extracting them
again would have cost a run and taught nobody anything. `extract.mjs` does
detect byte-identical duplicates and reads each once, so a copy is safe — it is
just noise, and noise in a provenance record is a cost of its own.

## A delivery may be only PARTLY ingestible, and that is a real state

`august-2026-d/` brought five managers this pipeline had never met. Two folios
landed; twenty documents have no reader yet. Every one of those twenty is
ATTRIBUTED to the institution that issued it and counted in the coverage report
— which is not the same as being filed under a manager who never wrote it.

Before adding a reader for any of them, read the `august-2026-d` section of
CLAUDE.md: the demat statements list every fund the family owns as a transaction
row, one of them names a `BHARAT JAISINGHANI FAMILY TRUST` with no numeral
against two trusts that both exist, and the consolidated review workbook is
deliberately not a source.
