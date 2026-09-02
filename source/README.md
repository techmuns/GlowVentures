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

## `august-2026-e/` — and the one thing a statement can be that no reader fixes

Two files, both arriving from the client's Google Drive after every other
delivery, and both dated **31 March 2026** — five months behind everything else
in this corpus. They are the family's two DEPOSITORY accounts outside Motilal
Oswal, and between them they are the only source anywhere in `source/` for the
family's unlisted holdings, their pre-IPO allotments and their promoter stock.

| File | Whose | What happened |
| --- | --- | --- |
| `Holding Statement Ajay Jaisinghani As on 31 March 2026.pdf` | Ajay, ICICI Bank NSDL, client 49794950 | READ — `providers/nsdlDemat.mjs`, 38 holdings |
| `HOLDING STATEMENT AS ON 31 MARCH 2026.pdf` | Bharat, HDFC Bank NSDL, client 22025655 | **NOT READ — it is a scan** |

**A SCANNED PDF IS NOT A DOCUMENT WITH NO READER.** Bharat's four pages are
JPEGs: pdfjs returns zero text items on every one of them, so there is no header
to match, no column to read at an x, and nothing to write a reader against.
`extract.mjs` reports it as `no-text-layer` rather than `no-extractor`, because
those two send the next person to do completely different things and only one of
them is possible. What it needs is HDFC re-sending the statement as a text PDF.
It is not an OCR job: a figure recovered by OCR cannot be traced back to what the
document printed, which is the guarantee every other figure in this book keeps.

It also carries NO VALUE COLUMN AT ALL — quantity only — so even read perfectly
it would value nothing. Both facts are worth knowing before anyone spends a day
on it.

**AND THE IDENTITY OF BOTH WAS ESTABLISHED FROM THE BOOK'S OWN UNIT COUNTS.**
Neither statement prints a PAN. Both carry fund units that this book already
holds from the funds' own statements, at counts that match to the last decimal —
Sanshi Class A2 2,341,480.851 and Class E 1,761,264.629 on Ajay's, Sanshi Class E
1,211,186.597 and Sky Capital's Hudle A1 17,000 on Bharat's, and 360 ONE Special
Opportunities Series 8 Class A3 at the same 9,90,429.684 units the two CRNs
already report between them. A name can be a spelling; four exact unit counts
against four different funds are not a coincidence.

## `august-2026-f/` — a third way a PDF can be unreadable, and a register that is not a statement

Three files, found by diffing the client's Google Drive against `source/` after
`august-2026-e/` had landed. Every other file in that Drive folder matches a
local file on name and byte size; these three matched nothing.

| File | What it is | Outcome |
| --- | --- | --- |
| `NEW INVESTMENT SHEET.xlsx` | the family's own register of what they PAID — 8 sheets, 427 tranche rows, 151 names, ₹842.92 Cr gross paid-in | READS PERFECTLY — and is **not a source**, by decision |
| `HOLDING STATEMENT BHARAT JAISINGHANI FAMILY TRUST 2.pdf` | HDFC Bank NSDL, DP account 67786547 | **not read — the text is outlined to vector paths** |
| `HOLDING STATEMENT BHARAT JAISINGHANI FAMILY TRUST 3.pdf` | HDFC Bank NSDL, DP account 67786137 | **not read — same** |

### The two statements: a third failure mode, and the filenames are wrong again

`august-2026-e/` established that a SCAN is not a document with no reader. These
two are neither. They contain **no raster image at all and no text either**: zero
font objects, zero `BT`/`Tj` operators, and ~9,300 bezier curves — every glyph
has been **CONVERTED TO VECTOR OUTLINES** by whatever exported the file. pdfjs's
operator list reads 2,752 ops, 545 paths, no text ops; poppler's `pdftotext`
returns one character. Two independent PDF engines agree there is nothing to read.

`extract.mjs` reports them as **`text-outlined-to-paths`**, not `no-text-layer`,
because the remedy differs and a confidently wrong diagnosis costs a day:

- a SCAN is a raster, and its resolution is all there will ever be;
- OUTLINED TEXT is resolution-independent, so the ask is a **re-export from the
  issuing system with fonts embedded** — HDFC's PDF export setting is what did
  this — rather than a re-scan of paper that was never on paper.

Neither is an OCR job, for the reason `august-2026-e/` already gives.
`lib/layout.mjs`'s `classifyInk` draws the distinction on the OPERATOR LIST, and
it runs **only** for a document that yielded no text at all, so no ordinary
statement pays for the second parse. It is told apart there rather than by a byte
search for `/Font` or `/DCTDecode`, because a PDF 1.7 file keeps both inside
compressed object streams and a raw scan finds neither.

**AND THE FILENAMES NAME THE WRONG HOLDER — for the fourth time in this corpus.**
Both files are named for a Bharat Jaisinghani family trust. Both statements print
`AJAY T JAISINGHANI` and `AARTI AJAY JAISINGHANI` as the joint holders, at
Ajay's own Prabhadevi address. Whoever writes a reader for these resolves the
account on the **`DP Account No:` the page prints** — 67786547 and 67786137 —
never on the file name, which is the rule `motilalDemat.mjs` already applies to
three of its twelve files and `pmsStatements.mjs` to all 23 of V.E.C's.

What they hold is small and would be **quantity-only** if it were read: one line
each, `SWAPECO SOLUTIONS PRIVATE LIMITED` / `INE2DT103015`, 347.000 units of a
`0.01% PRE SERIES A PREF`, at a Market Rate of **100.000** — the FACE VALUE of a
preference share in an unlisted private company, not a mark anyone struck.

**AND THE REGISTER CONFIRMS THESE *ARE* THE TRUSTS' HOLDINGS — READ THE WHOLE
CELL.** The same delivery's `NEW INVESTMENT SHEET.xlsx` records every Swapeco
holding the family has, and its `TRUST INVESTMENT` rows read, in full:

```
2807 PRE SERIRES A CCPS OF FACE VALUE RS. 100 EACH (NO OF PREFERENCE SHARE 347)
```

**347**, once per trust, at a face value of ₹100 — which is 347 x 100 =
**₹34,700**, the exact Total Valuation both statements print. Instrument, face
value and quantity all tie. So each file is one trust's holding, and the holder
line prints the **TRUSTEES** rather than the trust:

| Holder in the register | Paid | Units | Statement |
| --- | ---: | ---: | --- |
| Bharat Jaisinghani (PVT INV) | ₹50,20,300 | 244 EQUITY | none in this corpus |
| Bharat Jaisinghani Family Trust **2** | ₹1,35,00,875 | **347** CCPS | DP 67786547 |
| Bharat Jaisinghani Family Trust **3** | ₹1,35,00,875 | **347** CCPS | DP 67786137 |

**THIS PARAGRAPH FIRST SAID THE OPPOSITE**, on a cell read to 240 characters —
the parenthetical that carries the unit count sits past that cut, and without it
`2807` looks like the quantity and nothing matches. A truncated cell is not a
short cell, and the claim it produced ("the trusts' ₹2.70 Cr has no statement,
ask the client for it") would have sent the client looking for documents they had
already sent. Whoever writes the reader must still resolve each account on the
**`DP Account No:` the page prints** and attribute it to a trust using the
register, because the statement itself names only the trustees — but that is a
mapping problem, not a missing document. That
is the rule `motilalDemat.mjs` states for an AIF unit at 100.000 and the one
`nsdlDemat.mjs` grades into `declared`/`scheme`/`par`, arriving through a third
document. Read as a mark it would add ₹34,700 twice to NAV.

### The register: the same decision as the consolidated review, for the same reason

`NEW INVESTMENT SHEET.xlsx` is the family's own record of every direct and
private investment — angel tickets, LLP capital, pre-IPO allotments, fund
commitments — with the date, the entity it was made under and the amount paid.
It reads perfectly (`lib/sheet.mjs`, 8 sheets). It is still **not a source**, and
for exactly the reason the adviser's consolidated review is not one: no
institution struck it, its `INVESTMENT AMOUNT` column is a **cash outflow rather
than a mark**, and `CURRENT VALUATION` is empty. Every figure in this book traces
to the statement of the institution that struck it, and that guarantee ends on
the first cell of an aggregation.

What it is genuinely good for is the family-input layer (`src/lib/deals.ts`,
Stage 10b) — which exists precisely because a shareholders' agreement and a cap
table have no statement issuer and no reader — and as a second independent
CROSS-CHECK beside the review.

**IT IS MATCHED ON A HEADER NO CUSTODIAN PRINTS**, like the review before it: a
depository tracks units, never whether the family holds the paper certificate, so
`ORG. SHARE CERTIFICATE STATUS` is the anchor. Without that rule it was measured
classifying as provider **Green Lantern Capital LLP**, strategy **Aristos Equity
Portfolio**, owner **"COMMUNITY PRIVATE LIMITED BHARAT"**, accountNo
**"EDUGORILLA"** and reportType **`capital-call`** — five fields scraped off
PORTFOLIO COMPANY names in its own cells. Green Lantern has a reader and
`capital-call` is a live report type, so unlike the review workbook this one
would have been **handed to a reader** rather than merely misfiled.

Adding it also exposed that the review's own protection was luck: its rule lived
in `ISSUER_PROVIDER_RULES`, which run AFTER `match360One`/`matchGoldstandard`, so
the workbook escaped those only because its cells spell "Green Lantern Growth
Strategy" rather than "GREEN LANTERN CAPITAL". Both house matchers now return
null for either signature, and `pipeline.test.mjs` asserts that a non-statement
reaches **no report type, no account and no owner** — while an ordinary
Goldstandard appraisal, which also names Aristos, still resolves to its own house.
