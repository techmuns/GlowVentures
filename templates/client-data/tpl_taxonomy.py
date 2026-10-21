"""The standard classification: asset class -> category -> basket.

This is what makes two clients' books comparable. It is Glow's own grouping
(Equity / Debt / Cash / Alternate; the SG, EG, Liquidity and TT baskets)
widened to the instruments any Indian family office holds.

Long-term thresholds follow the Finance (No. 2) Act 2024, effective
23-Jul-2024: listed securities after 12 months, unlisted after 24. A blank
threshold means the gain is never long-term (s.50AA: debt funds bought from
1-Apr-2023, market-linked debentures) or not a capital asset (a bank balance).
"""

ASSET_CLASSES = ["Equity", "Debt", "Cash", "Alternate"]

# (category, asset class, default basket, long-term after N days, default benchmark, tax note)
CATEGORIES = [
    ("Direct Equity", "Equity", "TT", 365, "Nifty 500 TRI",
     "Listed shares: long-term after 12 months; grandfathered to 31-Jan-2018 FMV."),
    ("Equity MF – Large / Flexi / Multi Cap", "Equity", "SG", 365, "Nifty 500 TRI",
     "Equity-oriented fund: long-term after 12 months."),
    ("Equity MF – Mid & Small Cap", "Equity", "TT", 365, "Nifty Midsmallcap 400 TRI",
     "Equity-oriented fund: long-term after 12 months."),
    ("Equity MF – Hybrid / BAF", "Equity", "SG", 365, "CRISIL Hybrid 50+50 Moderate Index",
     "Treated as equity-oriented when it holds 65% or more in equity."),
    ("Equity ETF / Index Fund", "Equity", "SG", 365, "Nifty 50 TRI",
     "Listed units: long-term after 12 months."),
    ("PMS – Equity", "Equity", "SG", 365, "Nifty 500 TRI",
     "Taxed on each underlying share the manager trades, not on the PMS."),
    ("AIF Cat III – Listed Equity", "Equity", "SG", 365, "Nifty 500 TRI",
     "Taxed at the fund level; the investor's units carry no capital gain here."),
    ("Debt MF", "Debt", "SG", None, "CRISIL Composite Bond Index",
     "Units bought from 1-Apr-2023: slab rate, never long-term (s.50AA)."),
    ("Bonds / NCDs", "Debt", "SG", 365, "CRISIL Composite Bond Index",
     "Listed bonds: long-term after 12 months; interest at slab rate."),
    ("AIF Cat II – Private Credit", "Debt", "SG", 730, "CRISIL Composite Bond Index",
     "Pass-through; unlisted units long-term after 24 months."),
    ("Structured Product / MLD", "Debt", "SG", None, "CRISIL Composite Bond Index",
     "Market-linked debentures: always short-term (s.50AA)."),
    ("Liquid / Overnight Fund", "Cash", "LQ", None, "CRISIL Liquid Debt Index",
     "Debt fund: slab rate, never long-term (s.50AA)."),
    ("Arbitrage Fund", "Cash", "LQ", 365, "Nifty 50 Arbitrage Index",
     "Equity-oriented for tax: long-term after 12 months."),
    ("Bank / Cash Balance", "Cash", "LQ", None, "",
     "Not a capital asset; interest taxed at slab rate."),
    ("Gold / Silver (ETF, SGB, FoF)", "Alternate", "TT", 365, "Domestic gold price (MCX)",
     "Listed ETFs: long-term after 12 months."),
    ("REIT / InvIT", "Alternate", "SG", 365, "Nifty REITs & InvITs Index",
     "Listed units: long-term after 12 months."),
    ("AIF Cat I / II – PE / VC Fund", "Alternate", "EG", 730, "Nifty 500 TRI",
     "Pass-through; unlisted units long-term after 24 months."),
    ("Private Equity – Unlisted Shares", "Alternate", "EG", 730, "",
     "Unlisted: long-term after 24 months. Shown at cost until a priced round."),
    ("Pre-IPO", "Alternate", "EG", 730, "",
     "Unlisted until listing: long-term after 24 months. Shown at cost."),
]

BASKETS = [
    ("SG", "Stable Growth", "Core, long-horizon compounding: diversified funds, PMS, quality debt."),
    ("EG", "Entrepreneurial Growth", "Private equity, venture and pre-IPO: illiquid, high upside."),
    ("LQ", "Liquidity", "Cash, liquid and arbitrage funds: money needed within 12 months."),
    ("TT", "Thematic & Tactical", "Direct stocks, sector and mid/small-cap calls, gold and silver."),
]

ACCOUNT_TYPES = ["Demat (Direct)", "PMS", "AIF Folio", "MF Folio / CAS", "Bank Account",
                 "Broker (Execution)", "Wealth Platform", "Unlisted / Physical"]
ENTITY_TYPES = ["Individual", "HUF", "Trust", "Company", "LLP", "Partnership Firm"]
RESIDENCY = ["Resident", "NRI", "Foreign entity"]
VAL_BASIS = ["Market price", "NAV", "At cost", "Statement value"]

# (type, cash sign from the family's side, counts as)
TXN_TYPES = [
    ("Buy", -1, "Investment"), ("SIP", -1, "Investment"), ("Capital Call", -1, "Investment"),
    ("Switch In", -1, "Investment"), ("Deposit", -1, "Investment"),
    ("Sell", 1, "Divestment"), ("Redemption", 1, "Divestment"),
    ("Switch Out", 1, "Divestment"), ("Withdrawal", 1, "Divestment"),
    ("Distribution", 1, "Divestment"),
    ("Dividend", 1, "Income"), ("Interest", 1, "Income"),
    ("Fees / Charges", -1, "Charges"), ("Bonus / Split", 0, "Non-cash"),
]

UNITS = [("₹ Crore", 10_000_000, "Cr"), ("₹ Lakh", 100_000, "L"), ("₹", 1, "₹")]
YES_NO = ["Y", "N"]
MARKET_CAP = ["Large Cap", "Mid Cap", "Small Cap", "Micro / Unlisted", "Not applicable"]
FISCAL_YEARS = [f"{y}-{str(y + 1)[2:]}" for y in range(2016, 2028)]

# Where each list sits on the Lists sheet: name -> (first column letter, header row 5, data from row 6)
LIST_FIRST_ROW = 6
LIST_COLS = {
    "asset": "A", "cat": "D", "basket": "K", "accttype": "O", "enttype": "Q",
    "res": "S", "basis": "U", "txn": "W", "unit": "AA", "yn": "AE", "mcap": "AG", "fy": "AI",
}


def cat_row(name):
    """Sheet row of a category on the Lists sheet."""
    names = [c[0] for c in CATEGORIES]
    return LIST_FIRST_ROW + names.index(name)


def cat_last():
    return LIST_FIRST_ROW + len(CATEGORIES) - 1
