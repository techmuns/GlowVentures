# Status for every checkable line of the FOOS spec, keyed by BLOCK INDEX in
# foos-outline.json. Index rather than text, because the document reuses labels:
# "Returns", "Capacity", "Valuation" and "Financials" each appear more than once
# under different parents and do not share a status.
#
#   done  — built and reading a real source
#   part  — some of it works; the note says what is missing
#   none  — not built; the note says why, and whether it is obtainable
#
# A block with no entry here is a heading or connecting prose and gets no box.

D, P, N = "done", "part", "none"

STATUS = {
    # ── The five questions the system should answer ──────────────────────
    2: (D, "Portfolio Monitor, consolidated to ₹335.43 Cr with each dually-reported holding counted once"),
    3: (D, "Thesis & Triggers records why, expected return, risk and exit triggers per holding"),
    4: (P, "Morning CIO, news and corporate actions cover it; there is no automated thesis-change monitor"),
    5: (P, "Watchlist, company compare, the macro store and a market-cap view of the book; still no screener ACROSS companies"),
    6: (D, "Alerts fire on the family's own rules, and the Decisions Required queue is built on the Family Dashboard"),

    # ── LAYER 1 · sources ────────────────────────────────────────────────
    **{i: (D, "") for i in range(10, 22)},
    23: (D, "Every note carries the spec's seven tag dimensions"),
    24: (D, "Asset class, geography, theme, source, manager, risk and decision status — the pipeline runs Research → Watchlist → Approved → Invested → Exited"),
    25: (P, "Theme, asset class, IPS bucket and a review date are now note fields. Liquidity is not — it is a judgement per instrument that nothing here records"),

    # ── LAYER 2 · framing lines ──────────────────────────────────────────
    28: (P, "Rates, inflation, USD index, oil, gold, copper and silver are live. Fiscal deficit, liquidity, credit growth and money supply are not"),
    30: (P, "Stock prices and corporate actions are live, and ratios are now a seven-year TABLE rather than prose. Shareholding is current-only, and RSI and 200-DMA are not computed"),
    32: (D, "Parsed from the reported table — twelve year-ends for ABCAPITAL — and charted rather than passed through as text"),
    33: (N, "No free source publishes block deals"),

    # ── Cross-cutting · data visualisation ───────────────────────────────
    36: (D, "Company pages draw the full daily close history"),
    37: (D, "Every live series charts from the committed store"),
    38: (D, "All four types implemented"),
    39: (D, "Click any row on Macro Research to add it to the overlay; auto-rebases when units differ"),
    40: (D, ""),
    41: (D, ""),

    # ── Cross-cutting · historical data ──────────────────────────────────
    44: (D, "Daily series stored at native frequency"),
    45: (D, "Any series resamples to Weekly; the open bucket is marked so a part-week is not read as a full one"),
    46: (D, ""),
    47: (D, "Quarterly resample, last observation in each bucket"),
    48: (D, "Year-end resample; a year still running is flagged rather than shown as closed"),
    49: (D, "S&P 500 to 1970, Pink Sheet commodities to 1960, DXY to 1971"),

    # ── Cross-cutting · returns table ────────────────────────────────────
    **{i: (D, "") for i in range(52, 64)},

    # ── Cross-cutting · comparison ───────────────────────────────────────
    66: (D, ""), 67: (D, ""), 68: (D, ""), 69: (D, "Up to four companies"),
    70: (N, "No sector-level comparison screen"),
    71: (D, ""),

    # ── Cross-cutting · release calendar ─────────────────────────────────
    **{i: (N, "No free source publishes an Indian macro consensus, which the calendar and the surprise column both depend on") for i in range(75, 82)},

    # ── Cross-cutting · export ───────────────────────────────────────────
    84: (D, "Styled Excel workbook — all holdings plus the full transaction tape"),
    85: (D, "Chart PNG with a caption band carrying title, unit, source and as-of, so the image still says what it measures once it leaves the app"),
    86: (D, "CSV alongside the Excel workbook; a null writes as an empty field, never 0"),
    87: (D, "PowerPoint review deck, seven slides"),
    88: (D, "All three formats"),

    # ── A · commodities ──────────────────────────────────────────────────
    91: (P, "Prices are live for 26 of 31 commodities; production statistics are not carried for any"),
    93: (D, ""), 94: (D, ""), 95: (D, ""), 96: (D, "Japan LNG, monthly"),
    97: (N, "The Pink Sheet publishes thermal coal only. Needs Platts or Argus"),
    98: (D, "Newcastle benchmark, monthly"),
    99: (D, "IEX day-ahead, averaged across all 96 blocks"),
    **{i: (D, "") for i in range(102, 106)},
    **{i: (D, "") for i in range(107, 115)},
    **{i: (D, "") for i in range(116, 125)},
    126: (N, "Refinitiv licenses the CRB. The Bloomberg Commodity Index is carried alongside under its own name, never as the CRB"),
    127: (N, "The Baltic Exchange licenses the BDI"),
    128: (N, "Ministry of Railways publishes monthly as a PDF release"),
    129: (N, "Drewry and Freightos publish weekly on their own pages with no API"),
    130: (N, "Same as ocean freight"),

    # ── A · indices ──────────────────────────────────────────────────────
    132: (P, "Historical data is live for all twelve; composition is not carried for any"),
    **{i: (D, "") for i in range(134, 146)},
    147: (D, ""), 148: (D, "All twelve horizons plus the 52-week range"),
    149: (N, "Index composition is licensed by the index providers"),
    150: (N, "Licensed"), 151: (N, "Licensed"),
    152: (N, "Needs constituent-level history"),
    153: (N, "Licensed"),

    # ── A · currencies ───────────────────────────────────────────────────
    **{i: (D, "") for i in range(157, 163)},

    # ── B · macro economic indicators ────────────────────────────────────
    164: (P, "Data and charts are live where a source exists; AI commentary is not built for any row"),
    166: (D, "Annual, World Bank, 1960 onward"),
    167: (N, "No free source for the expenditure breakdown"),
    168: (P, "History 2012–Feb 2023 is stored and charted. MoSPI stopped appending to the open-data resource, so there is no current reading"),
    169: (N, "S&P Global licenses the PMI"),
    170: (N, "RBI's OBICUS survey is PDF only"),
    172: (P, "Annual only. No free source publishes the monthly headline CPI series"),
    173: (N, ""),
    174: (P, "History 2012–Oct 2023 is stored. The source stopped appending; verified against its own declared schema"),
    175: (N, "The state-level rural/urban series ends December 2022"),
    176: (N, "Same source, same cut-off"),
    178: (D, "Annual"),
    179: (N, ""), 180: (N, "PLFS publishes as survey rounds, not a series"),
    181: (N, "US series; not wired"), 182: (N, ""),
    184: (N, "Published in the Budget documents, not as a data feed"),
    185: (D, "Annual"),
    186: (N, ""),
    187: (N, "The open-data resource is a fixed table ending FY2023-24"),
    188: (N, ""),
    190: (N, "PPAC publishes monthly and CURRENT, but as PDF only — it needs a reader for that report's layout"),
    191: (N, ""), 192: (N, ""), 193: (N, ""),
    194: (N, "Power CAPACITY is carried from CEA; consumption is a different measure and is not"),

    # ── C · fixed income & credit ────────────────────────────────────────
    198: (D, "Monthly, 2011 onward, OECD via FRED. The daily RBI benchmark still needs a reader"),
    199: (D, "Daily, CBOE ^TNX"),
    200: (D, "Drawn from the four stored Treasury tenors against the same date a year earlier. The 2-year is not carried, so the 10Y-2Y spread is named as absent and 10Y-3M shown in its place"),
    202: (N, ""), 203: (N, ""), 204: (N, ""), 205: (N, ""),
    207: (P, "US ICE BofA option-adjusted spread only, and labelled as US. India has no free equivalent"),
    208: (N, "The rating agencies license their data"),
    209: (D, "Same curve component, rendered under Credit Markets as the spec asks"),

    # ── D · banking ──────────────────────────────────────────────────────
    **{i: (D, "") for i in range(213, 218)},
    **{i: (N, "RBI publishes credit growth in the weekly statistical supplement, as PDF") for i in range(220, 224)},
    **{i: (N, "Same source, same format") for i in range(225, 232)},

    # ── E · housing ──────────────────────────────────────────────────────
    **{i: (N, "The only free house-price series ends March 2013") for i in range(234, 240)},
    241: (N, ""), 242: (N, ""),

    # ── F · household ────────────────────────────────────────────────────
    **{i: (N, "RBI publishes household financial savings annually in its Handbook, as PDF") for i in range(245, 249)},

    # ── G · consumption ──────────────────────────────────────────────────
    **{i: (N, "SIAM puts production and sales behind a member subscription — a commercial licence, not a reader") for i in range(251, 255)},
    256: (N, ""), 257: (N, ""), 258: (N, ""),

    # ── H · capital markets ──────────────────────────────────────────────
    261: (D, "AMFI's monthly report, read from the BIFF workbook it publishes: total, equity and debt net flows, 88 months back to April 2019"),
    262: (N, "The AMFI monthly workbook now read for flows, folios and AUM does not carry SIP contributions, and the monthly-report page links no SIP file — checked, not assumed. It is published separately and needs its own source located"),
    263: (D, "Grand Total folio count, 88 months — the row AMFI itself prints, never re-derived from the 80 scheme rows"), 264: (D, "Gold ETF and other ETF net flows as separate series, since AMFI reports them separately"), 265: (N, "NSDL's investor-statistics page did not respond when probed. It publishes spreadsheets, so this is a reachability question rather than a reader-writing one"), 266: (N, "Same NSDL source, same reachability question"),
    267: (N, "NSE and BSE publish daily but under terms of use that need checking"),
    268: (N, "Same"),

    # ── Industry research ────────────────────────────────────────────────
    272: (N, ""), 273: (N, ""),
    274: (P, "Live for electricity — CEA's monthly workbook feeds seven capacity series. Coal and steel capacity are PDF-only"),
    275: (N, "CEA publishes PLF in the generation report, a different document with its own layout"),
    276: (N, "Order books are disclosed per company, never as an industry aggregate"),
    277: (N, "Same"),
    279: (D, "Seven industry dashboards, each declaring which stored series are its inputs"),
    280: (D, "With returns and a rebased basket chart per industry"),
    281: (N, "A realisation is revenue over volume — both company disclosures"),
    282: (N, "Same"),
    283: (P, "Derivable from the CEA capacity series once the store has accumulated several months"),
    285: (P, "National input costs are live; the region-wise split is published only by paid research"),
    286: (D, "Iron ore, HRC, zinc and power"),
    287: (P, "Crude and gas feedstocks are live; PVC resin itself is priced by ICIS under licence"),
    288: (D, "Urea, DAP, phosphate rock, potash and gas"),
    289: (D, "Newcastle benchmark and demand-side power price"),
    290: (D, "Spot price, fuels and now installed capacity"),
    291: (D, "Brent, WTI and natural gas"),
    293: (N, ""), 294: (N, ""), 295: (N, ""), 296: (N, ""),

    # ── Company research · documents ─────────────────────────────────────
    301: (D, "From the filings feed, with source links"),
    302: (D, ""),
    303: (P, "Appears when the filings feed carries it"),
    304: (P, "Same"),
    305: (N, "The rating agencies license these"),
    306: (N, "Broker research is licensed"),
    307: (D, ""),
    309: (N, ""), 310: (N, ""),
    311: (P, "Documents are listed and linked; their contents are not indexed for search"),
    312: (D, ""),

    # ── Company research · financials ────────────────────────────────────
    314: (D, "Read by row label from the reported tables; the source's own label is shown beside each metric so a figure traces back"),
    315: (D, "Quarterly Results parsed as a table"), 316: (D, "Profit & Loss parsed as a table, twelve year-ends deep"),
    317: (D, "Parsed as a table"), 318: (N, "The financials response carries NO cash-flow section — checked against the live API on 2026-08-11, not assumed"),
    319: (P, "Returned as prose, same caveat"),
    321: (N, ""), 322: (N, ""), 323: (N, ""), 324: (N, ""),
    326: (N, "No source carries sector-specific KPIs"),
    **{i: (N, "") for i in range(328, 335)},

    # ── Company research · market data ───────────────────────────────────
    337: (D, "Live quote"), 338: (D, ""),
    339: (N, ""), 340: (N, ""), 341: (N, ""), 342: (N, ""), 343: (N, ""),
    **{i: (D, "") for i in range(345, 356)},

    # ── Company research · ratios ────────────────────────────────────────
    357: (P, "Seven year-ends, not the ten the spec asks for — that is what the source publishes"),
    359: (P, "Current value in the prose block"), 360: (P, "Current value in the prose block"),
    361: (P, "Current value in the prose block"), 362: (P, "Current value in the prose block"),
    363: (P, "Current value in the prose block"),
    364: (N, ""), 365: (N, ""),
    366: (P, "Valuation ratios now carry seven YEAR-ENDS; the spec asks for any selected date, which needs a daily series"),
    368: (D, "Year-on-year and compound, from the reported P&L"), 369: (P, "Computed where the company reports an operating-profit line. A lender reports Financing Profit and no EBITDA, and no house schema maps one onto the other"),
    370: (D, "Year-on-year and compound, from the reported P&L"), 371: (D, "Full-span and 5-year CAGR per metric, null wherever the arithmetic would lie — one point, a span under a year, or a start at or below zero"),
    373: (P, "In the prose block"), 374: (P, "In the prose block"),
    375: (P, "In the prose block"), 376: (P, "In the prose block"),
    378: (P, "Reported figures only"),
    379: (N, "No adjusted series"),
    381: (P, "In the prose block"), 382: (P, "In the prose block"),
    383: (P, "In the prose block"), 384: (P, "In the prose block"), 385: (P, "In the prose block"),
    387: (P, "In the prose block"), 388: (P, "In the prose block"), 389: (P, "In the prose block"),
    390: (N, "Two of the three components are now series — net margin and asset turnover — but the equity multiplier is not reported, and DuPont with a component missing is not DuPont"),
    392: (P, "In the prose block"),
    393: (N, ""),
    394: (P, "Current holding only"),
    395: (P, "Current pattern only, not ten years"),
    396: (N, ""), 397: (N, ""),
    398: (N, "Needs the shareholding register as structured data"),
    401: (N, ""), 402: (N, ""), 403: (N, ""), 404: (N, ""),

    # ── Company research · comparison ────────────────────────────────────
    406: (D, "Up to four companies on one screen"),
    407: (N, "Needs structured financials"),
    408: (N, "The per-company ratio table exists now; a four-way comparison across companies is not built"),
    409: (N, "Needs structured ratios"),
    410: (D, "All horizons compared"),
    411: (N, ""), 412: (N, ""), 413: (N, ""),

    # ── Company research · AI query ──────────────────────────────────────
    **{i: (N, "Each of these needs structured, multi-company, multi-year data the book does not hold") for i in range(416, 420)},

    # ── Investment tools ─────────────────────────────────────────────────
    421: (D, ""), 422: (D, "An unset target is blank, never zero"),
    423: (D, ""), 424: (D, ""), 425: (D, ""),
    426: (D, "Price-level rules; a rule whose inputs are incomplete reports unmeasurable rather than passing"),
    427: (N, ""), 428: (N, ""),
    429: (P, "Captured as Knowledge notes, not as a company-page timeline"),

    # ── Company research · export ────────────────────────────────────────
    432: (D, ""), 433: (D, "Chart PNG, captioned"), 434: (D, "CSV export"),
    435: (D, "PowerPoint deck"), 436: (N, ""), 437: (N, ""),

    # ── Private investments · double-click detail ────────────────────────
    845: (D, "Tranche list per deal, each with its date. Amount invested is their SUM and cannot be typed"),
    846: (D, "Documents are REGISTERED — what a document is, its date and where it lives. The files stay in the family's own store; a browser is the wrong home for signed PDFs, and the page says so"),
    847: (D, "Last-round post-money and its date, entered per deal"),
    848: (D, "Fully-diluted stake at entry, and post-raise separately, so dilution is visible"), 849: (D, "Per-round name, date, post-money, investors, amount invested, primary/secondary and cap table"),
    850: (P, "The register records which financials exist and as of when; the quarterly and annual TABLES for a private company are not available from any source"), 851: (P, "MIS packs are registered with their dates; the attachments themselves are not stored"),

    # ── LAYER 3 ──────────────────────────────────────────────────────────
    917: (D, "Free-text charter on Exposure & IPS"),
    919: (D, "All five buckets"),
    920: (D, "A gap needs both halves; where a target is unset the cell is blank, never a gap against zero"),
    922: (N, "Nothing in the model records where a company is listed or earns. Needs a country field at ingest or a look-through into each fund's holdings"),
    923: (D, "Live from the quote feed, whose marketCap was verified as RUPEES against screener.in (0.05% apart). Bands are a DECLARED convention, stated on screen, not SEBI's rank-based classification"),
    924: (N, "No liquidity horizon is recorded against any holding. Assigning one by asset class would be a classification nobody made"),
    925: (D, "Follows from each asset's KIND rather than a per-row judgement, so two rows describing the same sort of asset cannot disagree"),
    926: (D, "Sector Composition, listed book"),
    927: (P, "Per-security exposure is live; a per-security target is not a family input yet"),
    928: (D, "Family & Entities"),
    929: (P, "Adviser register carries who, on what mandate, at what fee and when next reviewed. Advisor PERFORMANCE is not attributed — no statement maps a return to an adviser"),
    930: (D, "Each figure links to its own source document"),
    931: (D, ""),
    932: (D, "Compact suffixes follow the selected currency"),
    933: (N, "Two dated values per account is not a series — needs a periodic valuation statement"),
    934: (D, "Return & Drawdown"),
    936: (N, "Commitments are carried; the fund publishes no call schedule"),
    937: (P, "Estimated where a capital gain statement exists — 7 of 23 accounts"),

    # ── LAYER 4 ──────────────────────────────────────────────────────────
    939: (P, "Eight of the ten are live: why, expected return, risk, exit triggers, who proposed, date, meeting notes and review schedule. FM change and style drift need a source, not a threshold"),
    940: (D, "Price-level rules"),
    941: (N, "Needs a language model over the thesis store"),

    # ── LAYER 5 ──────────────────────────────────────────────────────────
    944: (D, "Evaluated against the family's IPS targets"),
    945: (N, "Needs a liquidity definition and a cash position the book does not hold"),
    946: (N, "Needs a manager-monitoring source"),
    947: (N, "Needs a macro rules engine"),
    948: (N, "The fund publishes no call schedule or board calendar"),
    949: (N, "Needs an approval workflow"),

    # ── LAYER 6 ──────────────────────────────────────────────────────────
    951: (D, "Every tile scopes to the selected member; a register line attributed to nobody counts only in the whole-family view rather than being split"),
    952: (D, "Measured portfolio + entered off-book assets - liabilities. The caption says how many register lines it spans, so a net worth over one bank balance cannot read as a complete one"),
    953: (D, "₹335.43 Cr consolidated"),
    954: (D, "Sum of the balance-sheet lines marked liquid"),
    955: (D, "Cash over the committed-outflow schedule, in months. Needs BOTH halves — cash with no schedule is not unlimited coverage"),
    956: (P, "Money-weighted, covering the 6 of 23 accounts whose statements carry an opening value — the other 17 are named"),
    957: (D, "The family picks a series from the harvest store; nothing is chosen by default, because defaulting to the Nifty would put a comparison on screen nobody agreed to on a book that is 62% private"),
    958: (D, "Assets the family ring-fences for charity"),
    959: (P, "Undrawn commitments are carried; their dates are not published by the fund"),
    960: (D, "₹75 L per trust, from the drawdown fund statements"),
    961: (D, "Buckets, public/private split and top exposures"),
    962: (D, "A real queue with category, owner, due date and state. Nothing generates an item — an empty queue says nothing has been ENTERED, which is not the claim that nothing is outstanding"),

    # ── Phase F — the catalogue probe's results ─────────────────────────
    #
    # These come LAST ON PURPOSE. Several of the indexes below already appear
    # above inside a `**{i: ... for i in range(...)}` spread, written that way
    # when a run of rows shared one note. Phase F split those runs — the source
    # prints Price/BV but no PE, Return on Networth but no dividend yield — so
    # each one that changed is restated here and the later key wins. Editing
    # the ranges in place would have meant unrolling them and losing the reason
    # they were grouped.
    318: (D, "From /financials/<TICKER>.NS — five years, read by row label. That source prints RUPEES WITH A DOLLAR SIGN on every numeric cell including share counts, so the unit is reconciled at runtime against the screener statements for the same company (EPS fixes the currency, revenue at 1e7 fixes the scale) and nothing monetary renders until both checks pass"),
    427: (D, "Earnings date and ex-dividend date from the same response, each labelled upcoming or already passed — a past date under a heading that says next is a wrong figure. This is the exact item that was deleted from the company page as a fabrication"),
    360: (D, "Price/BV, seven year-ends"),
    361: (D, "Price/Net Operating Revenue, seven year-ends"),
    362: (D, "EV/EBITDA, seven year-ends"),
    374: (P, "The source prints PBDIT Margin over seven year-ends. Shown under its own label rather than relabelled EBITDA"),
    375: (P, "The source prints PBIT Margin over seven year-ends, shown under its own label"),
    376: (D, "Net Profit Margin, seven year-ends"),
    381: (P, "Inventory Turnover Ratio as a seven-year series. DAYS would be 365/turnover — a derivation the source did not publish"),
    387: (D, "Return on Networth / Equity, seven year-ends"),
    388: (D, "Return on Capital Employed, seven year-ends"),
    389: (D, "Return on Assets, seven year-ends"),
    220: (N, "RBI publishes this in the Weekly Statistical Supplement. Measured from the harvest runner it answers in about a second, so it is NOT geo-blocked — but every WSS link is a __VIEWSTATE postback with no address, a plain postback replay returns no figures, and the linked XLSX serves HTML. It needs a stateful scraper, not a fetch"),
    221: (N, "RBI publishes this in the Weekly Statistical Supplement. Measured from the harvest runner it answers in about a second, so it is NOT geo-blocked — but every WSS link is a __VIEWSTATE postback with no address, a plain postback replay returns no figures, and the linked XLSX serves HTML. It needs a stateful scraper, not a fetch"),
    222: (N, "RBI publishes this in the Weekly Statistical Supplement. Measured from the harvest runner it answers in about a second, so it is NOT geo-blocked — but every WSS link is a __VIEWSTATE postback with no address, a plain postback replay returns no figures, and the linked XLSX serves HTML. It needs a stateful scraper, not a fetch"),
    223: (N, "RBI publishes this in the Weekly Statistical Supplement. Measured from the harvest runner it answers in about a second, so it is NOT geo-blocked — but every WSS link is a __VIEWSTATE postback with no address, a plain postback replay returns no figures, and the linked XLSX serves HTML. It needs a stateful scraper, not a fetch"),
    225: (N, "Same source, same blocker: reachable from the runner, but the current issue has no URL"),
    226: (N, "Same source, same blocker: reachable from the runner, but the current issue has no URL"),
    227: (N, "Same source, same blocker: reachable from the runner, but the current issue has no URL"),
    228: (N, "Same source, same blocker: reachable from the runner, but the current issue has no URL"),
    229: (N, "Same source, same blocker: reachable from the runner, but the current issue has no URL"),
    230: (N, "Same source, same blocker: reachable from the runner, but the current issue has no URL"),
    231: (N, "Same source, same blocker: reachable from the runner, but the current issue has no URL"),
}

# The two dashboard tables, which Word split one word per line (blocks 853–886
# and 889–915). Reassembled into the columns the spec actually lists.
PUBLIC_COLS = [
    ("Company name", D, ""),
    ("Sector", D, ""),
    ("CMP", D, "Live where a quote resolves; the statement mark otherwise, flagged as not live"),
    ("Buy price", D, ""),
    ("Current absolute % return on buy price", D, ""),
    ("Amount invested", D, ""),
    ("Current value", D, ""),
    ("Absolute gain", D, ""),
    ("XIRR", P, "Per ACCOUNT, not per security — a per-security rate needs every lot from first purchase, and these statements cover the current period only"),
    ("Quantity bought", D, ""),
    ("Weight in portfolio", D, "Consolidated, so the column sums to 100"),
    ("Target absolute amount", D, "The family's per-unit target times the quantity actually held"),
    ("Target weight in portfolio", D, "Recorded per name. 0% is a real instruction — hold none of this — and is stored as one, distinct from unset"),
    ("Pending amount to be invested", D, "target% x book total - held now, with the denominator named in a footnote since it is not visible from the cell"),
    ("Fair value", D, "Family input on the watchlist; blank when unset, never zero"),
    ("Fair value reference year", D, "Recorded per name, so a fair value carries the horizon it was struck for"),
    ("Valuation methodology", D, "Recorded per name by a human, with a suggestion list to keep spelling consistent. Never cycled by row order again"),
]

PRIVATE_COLS = [
    ("Company Name", D, ""),
    ("Amount Committed", D, "From the drawdown fund capital accounts"),
    ("Date Committed", D, "Entered on the deal"),
    ("Amount Invested", D, "Drawn capital"),
    ("Investment date", D, "First and last drawdown, derived from the tranche dates"),
    ("Pending amount to be invested by us", D, "Undrawn commitment — ₹75 L per trust"),
    ("Documents", D, "Registered with kind, date and location; the files stay in the family's own store"),
    ("Valuation", D, "Last-round post-money, entered per deal"),
    ("Stake Acquired", D, "Fully-diluted stake at entry"),
    ("Cap Table at Entry", D, "Entered per deal, and per round thereafter"),
    ("Subsequent Rounds", D, "Full round history — name, date, post-money, investors, primary/secondary"),
    ("Value of our stake post last fund raise", D, "DERIVED: post-raise stake x that round's post-money. Both sides required or it is absent"),
    ("Our stake % in the company post latest fund raise", D, "Entered per deal, so dilution against the entry stake is visible"),
    ("Financials", P, "Which financials exist and as of when; not the tables themselves"),
    ("MIS Latest", P, "Registered with its date; the attachment itself is not stored"),
    ("MIS received from company — date", D, "Derived from the newest registered MIS document"),
]

# The AI-query table under Layer 1 (block 22): three example queries.
L1_QUERIES = (N, "Keyword and facet search over the family's own notes is what shipped, and the page says so in those words. It answers these three questions, which are searches — but it is not a language model reading an index")
