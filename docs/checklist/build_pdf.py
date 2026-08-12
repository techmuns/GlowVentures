#!/usr/bin/env python3
"""Render the FOOS spec, verbatim and in order, with a checkbox on every item."""
import html
import json
import sys

sys.path.insert(0, ".")
from status_map import STATUS, PUBLIC_COLS, PRIVATE_COLS, L1_QUERIES, D, P, N  # noqa: E402

BLOCKS = json.load(open("foos-outline.json", encoding="utf-8"))

# The document repeats itself: blocks 438–841 are a verbatim copy of 34–437.
# Reproduced once, with the repeat noted where it occurs, so the same
# requirement cannot carry two different tick states.
UNIQUE = list(range(0, 438)) + list(range(842, len(BLOCKS)))
REPEAT_AT = 438

# Blocks that are the two dashboard tables, split one word per line by Word.
# Replaced by the reassembled column lists.
PUBLIC_TABLE = set(range(852, 887))
PRIVATE_TABLE = set(range(887, 916))

# Lines that are section headings or connecting prose: rendered, never boxed.
# Everything with a STATUS entry gets a box; everything else does not.

e = html.escape


def box(status):
    if status == D:
        return ('<svg class="bx" viewBox="0 0 16 16"><rect x=".9" y=".9" width="14.2" height="14.2" rx="2" '
                'fill="#E4F0E9" stroke="#2C6A4C" stroke-width="1.5"/><path d="M4.1 8.3l2.6 2.7 5.2-5.6" fill="none" '
                'stroke="#2C6A4C" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    if status == P:
        return ('<svg class="bx" viewBox="0 0 16 16"><rect x=".9" y=".9" width="14.2" height="14.2" rx="2" '
                'fill="#F7EBD6" stroke="#92651C" stroke-width="1.5"/><rect x="3.6" y="3.6" width="8.8" height="8.8" '
                'rx="1" fill="#92651C" opacity=".5"/></svg>')
    return ('<svg class="bx" viewBox="0 0 16 16"><rect x=".9" y=".9" width="14.2" height="14.2" rx="2" '
            'fill="#fff" stroke="#9C3B32" stroke-width="1.5" opacity=".8"/></svg>')


def item_row(text, status, note, indent=0):
    cls = {D: "d", P: "p", N: "n"}[status]
    n = f'<span class="nt">{e(note)}</span>' if note else ""
    return (f'<div class="it {cls}" style="--ind:{indent}px">{box(status)}'
            f'<div class="tx"><span class="lb">{e(text)}</span>{n}</div></div>')


def is_heading(b):
    """A line with no status entry is structure, not a checkable requirement."""
    t = b.get("text", "")
    return t.isupper() or t.rstrip().endswith(":") or b.get("bold")


rows = []
counts = {D: 0, P: 0, N: 0}

for i in UNIQUE:
    b = BLOCKS[i]

    if i == REPEAT_AT:
        pass  # unreachable; REPEAT_AT is outside UNIQUE. Kept for clarity.

    # ── the two dashboard tables ────────────────────────────────────────
    if i in PUBLIC_TABLE:
        if i == min(PUBLIC_TABLE):
            rows.append('<h3>Dashboard for tracking public investments</h3>')
            rows.append('<p class="pr">The column list below is reassembled from the source table, which Word '
                        'stores one word per line.</p>')
            for lbl, st, nt in PUBLIC_COLS:
                rows.append(item_row(lbl, st, nt))
                counts[st] += 1
        continue
    if i in PRIVATE_TABLE:
        if i == min(PRIVATE_TABLE):
            rows.append('<h3>Dashboard for tracking private investments</h3>')
            for lbl, st, nt in PRIVATE_COLS:
                rows.append(item_row(lbl, st, nt))
                counts[st] += 1
        continue

    # ── the Layer 1 AI-query table ──────────────────────────────────────
    if b["kind"] == "table":
        st, nt = L1_QUERIES
        rows.append('<h3>AI query — the spec\'s worked examples</h3>')
        hdr = b["rows"][0]
        rows.append(f'<p class="pr">{e(hdr[0])} → {e(hdr[1])}</p>')
        for r in b["rows"][1:]:
            rows.append(item_row(r[0], st, nt if r is b["rows"][1] else ""))
            counts[st] += 1
        continue

    txt = b["text"]
    st = STATUS.get(i)

    if st is None:
        # Structure. Level chosen from the document's own emphasis.
        if txt.isupper() and len(txt) > 8:
            rows.append(f'<h2>{e(txt)}</h2>')
        elif b.get("bold") or txt.rstrip().endswith(":") or b.get("ilvl") is None:
            rows.append(f'<h3>{e(txt)}</h3>' if len(txt) < 70 else f'<p class="pr">{e(txt)}</p>')
        else:
            rows.append(f'<p class="pr">{e(txt)}</p>')
        continue

    status, note = st
    indent = 0 if b.get("ilvl") in (None, 0) else 16 * b["ilvl"]
    rows.append(item_row(txt, status, note, indent))
    counts[status] += 1

total = sum(counts.values())
pct = round(100 * (counts[D] + 0.5 * counts[P]) / total)

HEAD = f"""<!doctype html><html><head><meta charset="utf-8"><title>FOOS — Implementation Checklist</title>
<style>
@page {{ size: A4; margin: 15mm 14mm 16mm; }}
* {{ box-sizing: border-box; }}
body {{ font: 400 9.6pt/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1B1838; margin: 0; }}
.cover {{ page-break-after: always; padding-top: 22mm; }}
.cover h1 {{ font: 400 27pt/1.12 Georgia, "Times New Roman", serif; margin: 0 0 10px; letter-spacing: -.01em; }}
.cover .sub {{ font-size: 11.5pt; color: #55516F; max-width: 150mm; margin: 0 0 26px; line-height: 1.5; }}
.eyebrow {{ font: 600 8pt/1 "Helvetica Neue", Arial, sans-serif; letter-spacing: .18em;
  text-transform: uppercase; color: #8A6D24; margin: 0 0 12px; }}
.tot {{ display: flex; gap: 10px; margin: 0 0 22px; }}
.tot div {{ flex: 1; border: 1px solid #E3DED2; border-top: 3px solid var(--t); border-radius: 2px; padding: 10px 11px; }}
.tot .n {{ font: 600 21pt/1 Georgia, serif; color: var(--t); display: block; }}
.tot .l {{ font: 600 7.4pt/1.3 Arial, sans-serif; letter-spacing: .1em; text-transform: uppercase;
  color: #817C99; display: block; margin-top: 5px; }}
.key {{ border: 1px solid #E3DED2; border-radius: 2px; padding: 12px 14px; margin-bottom: 18px; }}
.key h4 {{ margin: 0 0 8px; font: 600 8.4pt/1 Arial, sans-serif; letter-spacing: .12em;
  text-transform: uppercase; color: #817C99; }}
.key div {{ display: flex; align-items: flex-start; gap: 8px; margin: 5px 0; font-size: 9.4pt; }}
.note-box {{ background: #F7F5F0; border-left: 3px solid #8A6D24; padding: 11px 13px; font-size: 9pt;
  line-height: 1.5; color: #55516F; margin-bottom: 14px; }}
.note-box b {{ color: #1B1838; }}
h2 {{ font: 600 8.6pt/1.3 Arial, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #8A6D24;
  margin: 17px 0 7px; padding-bottom: 5px; border-bottom: 1.2px solid #C9C2B2; page-break-after: avoid; }}
h3 {{ font: 600 10.2pt/1.3 Georgia, serif; margin: 12px 0 4px; color: #1B1838; page-break-after: avoid; }}
p.pr {{ margin: 3px 0 6px; color: #55516F; font-size: 9.2pt; max-width: 165mm; }}
.it {{ display: flex; gap: 7px; align-items: flex-start; padding: 2.6px 0 2.6px var(--ind, 0px);
  border-bottom: .5px solid #EFEBE1; page-break-inside: avoid; }}
.bx {{ width: 10.5px; height: 10.5px; margin-top: 2.4px; flex: none; }}
.tx {{ min-width: 0; }}
.lb {{ font-size: 9.6pt; }}
.it.n .lb {{ color: #55516F; }}
.nt {{ display: block; font-size: 8.2pt; line-height: 1.4; color: #817C99; margin-top: 1px; max-width: 158mm; }}
footer {{ margin-top: 20px; padding-top: 10px; border-top: 1px solid #E3DED2; font-size: 8.2pt; color: #817C99; }}
</style></head><body>
<div class="cover">
  <p class="eyebrow">Glow Ventures Family Office · Investor Cockpit</p>
  <h1>Family Office Operating System<br>Implementation Checklist</h1>
  <p class="sub">The specification reproduced in full and in its original order, with a box against every
  requirement. Ticked where it is built and reading a real source, half-filled where part of it works, empty
  where it is not built. {total} checkable requirements.</p>
  <div class="tot">
    <div style="--t:#2C6A4C"><span class="n">{counts[D]}</span><span class="l">Built</span></div>
    <div style="--t:#92651C"><span class="n">{counts[P]}</span><span class="l">Partial</span></div>
    <div style="--t:#9C3B32"><span class="n">{counts[N]}</span><span class="l">Not built</span></div>
    <div style="--t:#8A6D24"><span class="n">{pct}%</span><span class="l">Weighted</span></div>
  </div>
  <div class="key">
    <h4>How to read a box</h4>
    <div>{box(D)}<span><b>Built.</b> Live on the dashboard, reading a real source, with its own provenance.</span></div>
    <div>{box(P)}<span><b>Partial.</b> Some of it works. The grey line underneath says exactly what is missing.</span></div>
    <div>{box(N)}<span><b>Not built.</b> Renders on screen as a named absence with its reason — never as a zero
      or a placeholder figure. The note says whether a source exists at all.</span></div>
  </div>
  <div class="note-box">
    <b>Two things about this reproduction.</b> The source document repeats one long section verbatim — the
    cross-cutting requirements and all of Macro Research appear twice, identically. They are printed once here,
    because the same requirement carrying two separate tick states would make the checklist unusable.
    <br><br>
    The two investment-tracking tables are stored by Word one word per line
    (&ldquo;Company / name / Sector CMP Buy price&rdquo;…). They are reassembled into the columns the
    specification actually lists, and marked as such where they appear.
  </div>
</div>
"""

FOOT = f"""<footer>Checked against the dashboard at commit <b>78d3d71</b> · {total} requirements ·
{counts[D]} built, {counts[P]} partial, {counts[N]} not built. Every &ldquo;not built&rdquo; item renders on
screen as a named absence with its reason; none is shown as zero.</footer></body></html>"""

open("foos-checklist.html", "w", encoding="utf-8").write(HEAD + "\n".join(rows) + FOOT)
print(f"{total} checkable items — {counts[D]} built, {counts[P]} partial, {counts[N]} not built ({pct}% weighted)")
