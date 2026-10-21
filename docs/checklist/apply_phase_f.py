#!/usr/bin/env python3
"""Fold Phase F into status_map.py.

Phase F wired three things off the catalogue probe (`docs/API-PROBE.md`) and
CORRECTED the reason on thirteen more. Every entry names the commit, so a later
reader can check the claim rather than take the tick on trust.

Two rules applied throughout, and they are why several boxes stay unticked
against a source that now exists:

  • A ROW IS TICKED ONLY IF THE SOURCE PRINTS IT. moneycontrol's table carries
    Price/BV, EV/EBITDA and Return on Networth; it carries NO PE row and no
    dividend YIELD (it prints dividend PAYOUT, which is a different figure).
    Those stay as they were. Ticking a box because a nearby number exists is
    the same failure as a placeholder figure.

  • A LINE THE SOURCE LABELS DIFFERENTLY STAYS PARTIAL. PBDIT margin is EBITDA
    margin by definition, and PBIT margin is operating margin — but they are
    shown under the source's own label rather than relabelled, so the box says
    partial and the note names what is actually printed.
"""
import re

D, P, N = "done", "part", "none"

UPDATES = {
    # ── Phase F1 — cash flow statement and earnings calendar (a6d63bb) ─────
    318: (D, "From /financials/<TICKER>.NS — five years, read by row label. That source prints RUPEES WITH A DOLLAR SIGN on every numeric cell including share counts, so the unit is reconciled at runtime against the screener statements for the same company (EPS fixes the currency, revenue at 1e7 fixes the scale) and nothing monetary renders until both checks pass"),
    427: (D, "Earnings date and ex-dividend date from the same response, each labelled upcoming or already passed — a past date under a heading that says next is a wrong figure. This is the exact item that was deleted from the company page as a fabrication"),

    # ── Phase F2 — the ratio table (29b2256, f0d6771) ──────────────────────
    # Seven year-ends of ratios, labelled on both axes, via ratio_source ->
    # web_reader. The resolver returns the WRONG COMPANY for four of the first
    # fifteen holdings tried, so every page is checked against the holding and
    # a mismatch renders no table at all.
    357: (P, "Seven year-ends, not the ten the spec asks for — that is what the source publishes"),
    360: (D, "Price/BV, seven year-ends"),
    361: (D, "Price/Net Operating Revenue, seven year-ends"),
    362: (D, "EV/EBITDA, seven year-ends"),
    366: (P, "Valuation ratios now carry seven YEAR-ENDS; the spec asks for any selected date, which needs a daily series"),
    374: (P, "The source prints PBDIT Margin over seven year-ends. Shown under its own label rather than relabelled EBITDA"),
    375: (P, "The source prints PBIT Margin over seven year-ends, shown under its own label"),
    376: (D, "Net Profit Margin, seven year-ends"),
    381: (P, "Inventory Turnover Ratio as a seven-year series. DAYS would be 365/turnover — a derivation the source did not publish"),
    387: (D, "Return on Networth / Equity, seven year-ends"),
    388: (D, "Return on Capital Employed, seven year-ends"),
    389: (D, "Return on Assets, seven year-ends"),
    390: (N, "Two of the three components are now series — net margin and asset turnover — but the equity multiplier is not reported, and DuPont with a component missing is not DuPont"),
    408: (N, "The per-company ratio table exists now; a four-way comparison across companies is not built"),
    30: (P, "Stock prices and corporate actions are live, and ratios are now a seven-year TABLE rather than prose. Shareholding is current-only, and RSI and 200-DMA are not computed"),

    # ── Phase F3 — the RBI absence, re-filed against its real cause ────────
    # (def3813) Reachability was measured from the runner the harvest actually
    # uses: HTTP 200 in 1,087 ms, both controls passing. NOT geo-blocked. The
    # blocker is that the current issue has no URL.
    **{i: (N, "RBI publishes this in the Weekly Statistical Supplement. Measured from the harvest runner it answers in about a second, so it is NOT geo-blocked — but every WSS link is a __VIEWSTATE postback with no address, a plain postback replay returns no figures, and the linked XLSX serves HTML. It needs a stateful scraper, not a fetch")
       for i in (220, 221, 222, 223)},
    **{i: (N, "Same source, same blocker: reachable from the runner, but the current issue has no URL")
       for i in (225, 226, 227, 228, 229, 230, 231)},
}


def main() -> None:
    src = open("status_map.py", encoding="utf8").read()
    changed, missing = 0, []

    for idx, (state, note) in UPDATES.items():
        # Entries are written as `123: (D, "note"),` — the state is a bare
        # constant, never a string literal, and the note may contain escaped
        # quotes. Anchored on the index at the start of a line so a number
        # appearing inside another note cannot match.
        pat = re.compile(rf'^(\s*){idx}:\s*\((?:D|P|N),\s*"(?:[^"\\]|\\.)*"\),\s*$', re.M)
        replacement = f'\\g<1>{idx}: ({ {"done": "D", "part": "P", "none": "N"}[state] }, {note!r}),'
        # repr() gives single quotes; the file uses double. Rewrite it so the
        # style stays uniform and an apostrophe in a note cannot break it.
        replacement = replacement.replace(f'{note!r}', '"' + note.replace('"', r'\"') + '"')
        src, n = pat.subn(replacement, src, count=1)
        if n:
            changed += 1
        else:
            missing.append(idx)

    if missing:
        # A NEW ENTRY IS INSERTED, NEVER SILENTLY DROPPED. An index with no
        # existing line is a block that carried no box, which is a real case
        # and must still get its status.
        #
        # It goes inside the STATUS dict, which is NOT the last thing in the
        # file — the table-column maps follow it. Appending to the end of the
        # file would put the entries in the wrong structure and they would
        # never render, which is the silent-drop this exists to avoid.
        start = src.index("\nSTATUS = {")
        end = src.index("\n}\n", start)
        block = ["", "    # ── Phase F — blocks that carried no box before ─────────────────"]
        for idx in missing:
            state, note = UPDATES[idx]
            k = {"done": "D", "part": "P", "none": "N"}[state]
            block.append(f'    {idx}: ({k}, "' + note.replace('"', r'\"') + '"),')
        src = src[:end] + "\n" + "\n".join(block) + src[end:]

    open("status_map.py", "w", encoding="utf8").write(src)
    print(f"rewrote {changed} entries; appended {len(missing)}: {missing}")


if __name__ == "__main__":
    main()
