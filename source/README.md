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
