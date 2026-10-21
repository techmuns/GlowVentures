#!/usr/bin/env python3
"""Fold Phases A, B and C into status_map.py.

Each entry below names the commit that changed it, so a later reader can check
the claim rather than take the tick on trust.
"""
import re

D, P, N = "done", "part", "none"

# ── Block-indexed updates ───────────────────────────────────────────────────
UPDATES = {
    # Phase A1 — frequency resample (e63861f)
    45: (D, "Any series resamples to Weekly; the open bucket is marked so a part-week is not read as a full one"),
    47: (D, "Quarterly resample, last observation in each bucket"),
    48: (D, "Year-end resample; a year still running is flagged rather than shown as closed"),
    # Phase A2 — yield curve (9c0eef2)
    200: (D, "Drawn from the four stored Treasury tenors against the same date a year earlier. The 2-year is not carried, so the 10Y-2Y spread is named as absent and 10Y-3M shown in its place"),
    209: (D, "Same curve component, rendered under Credit Markets as the spec asks"),
    # Phase A4 — standalone chart and table export (4b86d4f)
    85: (D, "Chart PNG with a caption band carrying title, unit, source and as-of, so the image still says what it measures once it leaves the app"),
    86: (D, "CSV alongside the Excel workbook; a null writes as an empty field, never 0"),
    433: (D, "Chart PNG, captioned"),
    434: (D, "CSV export"),

    # Phase B2 — private deal register (da0e1b5)
    845: (D, "Tranche list per deal, each with its date. Amount invested is their SUM and cannot be typed"),
    846: (D, "Documents are REGISTERED — what a document is, its date and where it lives. The files stay in the family's own store; a browser is the wrong home for signed PDFs, and the page says so"),
    847: (D, "Last-round post-money and its date, entered per deal"),
    848: (D, "Fully-diluted stake at entry, and post-raise separately, so dilution is visible"),
    849: (D, "Per-round name, date, post-money, investors, amount invested, primary/secondary and cap table"),
    850: (P, "The register records which financials exist and as of when; the quarterly and annual TABLES for a private company are not available from any source"),
    851: (P, "MIS packs are registered with their dates; the attachments themselves are not stored"),

    # Phase B3/B4 — household, advisers, decisions, benchmark (da0e1b5)
    925: (D, "Follows from each asset's KIND rather than a per-row judgement, so two rows describing the same sort of asset cannot disagree"),
    929: (P, "Adviser register carries who, on what mandate, at what fee and when next reviewed. Advisor PERFORMANCE is not attributed — no statement maps a return to an adviser"),
    952: (D, "Measured portfolio + entered off-book assets - liabilities. The caption says how many register lines it spans, so a net worth over one bank balance cannot read as a complete one"),
    954: (D, "Sum of the balance-sheet lines marked liquid"),
    955: (D, "Cash over the committed-outflow schedule, in months. Needs BOTH halves — cash with no schedule is not unlimited coverage"),
    957: (D, "The family picks a series from the harvest store; nothing is chosen by default, because defaulting to the Nifty would put a comparison on screen nobody agreed to on a book that is 62% private"),
    958: (D, "Assets the family ring-fences for charity"),
    962: (D, "A real queue with category, owner, due date and state. Nothing generates an item — an empty queue says nothing has been ENTERED, which is not the claim that nothing is outstanding"),
    951: (D, "Every tile scopes to the selected member; a register line attributed to nobody counts only in the whole-family view rather than being split"),

    # Phase C — market cap measured, geography and duration honestly absent (53767f3)
    923: (D, "Live from the quote feed, whose marketCap was verified as RUPEES against screener.in (0.05% apart). Bands are a DECLARED convention, stated on screen, not SEBI's rank-based classification"),
    922: (N, "Nothing in the model records where a company is listed or earns. Needs a country field at ingest or a look-through into each fund's holdings"),
    924: (N, "No liquidity horizon is recorded against any holding. Assigning one by asset class would be a classification nobody made"),

    # Phase B — note-level tagging (da0e1b5)
    25: (P, "Theme, asset class, IPS bucket and a review date are now note fields. Liquidity is not — it is a judgement per instrument that nothing here records"),

    # The five questions, restated after B and C
    5: (P, "Watchlist, company compare, the macro store and a market-cap view of the book; still no screener ACROSS companies"),
    6: (D, "Alerts fire on the family's own rules, and the Decisions Required queue is built on the Family Dashboard"),
}

# ── Table-column updates, keyed by column label ─────────────────────────────
PUBLIC_UPDATES = {
    "Target absolute amount": (D, "The family's per-unit target times the quantity actually held"),
    "Target weight in portfolio": (D, "Recorded per name. 0% is a real instruction — hold none of this — and is stored as one, distinct from unset"),
    "Pending amount to be invested": (D, "target% x book total - held now, with the denominator named in a footnote since it is not visible from the cell"),
    "Fair value reference year": (D, "Recorded per name, so a fair value carries the horizon it was struck for"),
    "Valuation methodology": (D, "Recorded per name by a human, with a suggestion list to keep spelling consistent. Never cycled by row order again"),
}

PRIVATE_UPDATES = {
    "Date Committed": (D, "Entered on the deal"),
    "Investment date": (D, "First and last drawdown, derived from the tranche dates"),
    "Documents": (D, "Registered with kind, date and location; the files stay in the family's own store"),
    "Valuation": (D, "Last-round post-money, entered per deal"),
    "Stake Acquired": (D, "Fully-diluted stake at entry"),
    "Cap Table at Entry": (D, "Entered per deal, and per round thereafter"),
    "Subsequent Rounds": (D, "Full round history — name, date, post-money, investors, primary/secondary"),
    "Value of our stake post last fund raise": (D, "DERIVED: post-raise stake x that round's post-money. Both sides required or it is absent"),
    "Our stake % in the company post latest fund raise": (D, "Entered per deal, so dilution against the entry stake is visible"),
    "Financials": (P, "Which financials exist and as of when; not the tables themselves"),
    "MIS Latest": (P, "Registered with its date; the attachment itself is not stored"),
    "MIS received from company — date": (D, "Derived from the newest registered MIS document"),
}

src = open("status_map.py", encoding="utf-8").read()

def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')

# Block entries: replace in place where present, else append before the closing brace.
missing = []
for idx, (st, note) in UPDATES.items():
    # Entries are not always alone on a line — several share one — so this is
    # not anchored to the line end. Anchoring it silently skipped four.
    pat = re.compile(rf"(?<![0-9]){idx}: \((?:D|P|N), (?:\".*?\"|'.*?')\),")
    repl = f'{idx}: ({{"done":"D","part":"P","none":"N"}}[st]!, "{esc(note)}"),'
    repl = f'{idx}: ({ {"done":"D","part":"P","none":"N"}[st] }, "{esc(note)}"),'
    src, n = pat.subn(lambda _m: repl, src, count=1)
    if not n:
        missing.append((idx, st, note))

if missing:
    add = "".join(
        f'    {i}: ({{"done":"D","part":"P","none":"N"}}[{st!r}], "{esc(nt)}"),\n'
        for i, st, nt in missing)
    raise SystemExit(f"unmatched block indices: {[m[0] for m in missing]}")

def patch_table(src, const, updates):
    m = re.search(rf"{const} = \[\n(.*?)\n\]", src, re.S)
    body = m.group(1)
    for label, (st, note) in updates.items():
        # The table rows carry the BARE constants D / P / N, not string
        # literals — matching "done" here found nothing and the first run
        # reported a missing row for a label that was plainly there.
        pat = re.compile(rf'^(\s*)\("{re.escape(label)}", [DPN], (?:".*?"|\'.*?\')\),\s*$', re.M | re.S)
        const = {"done": "D", "part": "P", "none": "N"}[st]
        body, n = pat.subn(lambda mm: f'{mm.group(1)}("{label}", {const}, "{esc(note)}"),', body, count=1)
        if not n:
            raise SystemExit(f"{const}: no row for {label!r}")
    return src[:m.start(1)] + body + src[m.end(1):]

src = patch_table(src, "PUBLIC_COLS", PUBLIC_UPDATES)
src = patch_table(src, "PRIVATE_COLS", PRIVATE_UPDATES)

open("status_map.py", "w", encoding="utf-8").write(src)
print("applied", len(UPDATES), "block updates,",
      len(PUBLIC_UPDATES), "public cols,", len(PRIVATE_UPDATES), "private cols")
