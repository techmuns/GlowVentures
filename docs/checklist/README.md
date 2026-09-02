# The FOOS implementation checklist

`GlowVentures_FOOS_Implementation_Checklist.pdf` reproduces the client's
specification **verbatim and in its original order**, with a box against every
checkable requirement. It is generated, not hand-maintained, so it cannot drift
from what the repo actually claims.

```
python3 parse_docx.py <the .docx>     # → foos-outline.json, one block per line
python3 build_pdf.py                  # → foos-checklist.html
chromium --headless --no-pdf-header-footer \
  --print-to-pdf=GlowVentures_FOOS_Implementation_Checklist.pdf foos-checklist.html
```

`status_map.py` is the only file to edit when work lands. It is keyed by BLOCK
INDEX rather than by text, because the spec reuses labels — "Returns",
"Capacity", "Valuation" and "Financials" each appear more than once under
different parents and do not share a status.

Three states, and the distinction is the point:

- **built** — live on the dashboard, reading a real source, with provenance.
- **partial** — some of it works, and the note says exactly what is missing.
- **not built** — renders on screen as a named absence with its reason, never as
  a zero or a placeholder. The note says whether a source exists at all.

**A tick is a claim someone can check.** Every note names the mechanism, so a
reader who doubts one can open the page and look. Marking something built
because a frame for it exists is the same failure as a placeholder figure: it
tells a reader to stop looking for something that is not there.

Two things about the reproduction, both stated in the PDF itself: the source
document repeats one long section verbatim and it is printed once, because one
requirement carrying two tick states would make the checklist unusable; and the
two investment-tracking tables are stored by Word one word per line, so they are
reassembled into the columns the spec actually lists.

## The client requirements tracker

`GlowVenturesRequirementsChecklist.xlsx` is the OTHER checklist, and it answers
a different question. The PDF above reproduces the client's written FOOS
specification; this workbook carries every requirement raised on the client call
and in the written follow-up that came after it — 67 line items across the
dashboard, the Research Centre and the process asks — each with its status, what
the dashboard does today and what is left.

Two tabs. **Checklist** is one row per requirement, with a Status cell driving a
`% done` formula (Done 1, Partial 0.5, Not started 0). **Summary** is roll-ups
by status, by workstream and by which round the ask came from, all of them
formulas — change a Status cell and every percentage recalculates, so the
figures cannot be typed into disagreement with the rows.

**The Status column is a claim someone can check**, exactly as the PDF's ticks
are. Every row names the file, the route or the figure behind its status, so a
reader who doubts one can open the page and look. The last column records which
push moved a row and the commit behind it, which is what makes the rows that did
NOT move as visible as the ones that did.

Two conventions worth keeping:

- **Done is allowed to carry a residual note.** The Polycab page is Done on
  pledges, dividends and splits because all three are read from the book and
  each names the document that would carry it — the absence is in the corpus,
  not the build. A row whose remaining work is somebody else's document is not
  the same as one whose screen was never written, and collapsing the two would
  send the next reader to write code that already exists.
- **Partial means the plumbing is there and the screen is not**, or the ask is
  met on one page and not the others. The "What is left to do" column says which.

The Research Centre rows are a separate application that is not in this
repository. They were taken from the call and are NOT re-measured when this
repo's rows are, which the Summary tab states rather than leaving to be assumed.
