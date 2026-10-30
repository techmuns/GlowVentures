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

## The client task list

`Glow_Checklist_Updated_29_October.xlsx` is the running task list for both
dashboards, kept in the team's own format: date, task number, task, dashboard,
the client's words verbatim, what has to be done, and status.

- **Tasks 22-Oct-2026** — the 22 October call (#310–#367) and, below it, the
  29 October call (#368–#399).
- **Real Checklist** — every task from 27 August to 19 October.
- **Screenr** — the screener sheet.

New calls are added below the last row of the newest sheet, continuing the
numbering. Status values: DONE, WIP, NOT DONE, or WAITING FOR <name> when the
next step is the client's or a third party's.
