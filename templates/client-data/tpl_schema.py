"""Every register's columns, in order, so formulas refer to a column by its key
and never by a hand-counted letter.

Each entry: (key, header, kind, width, number format)
kind: "in" = typed by whoever loads a client (yellow), "f" = calculated (grey),
      "h" = helper the views read (hidden).
"""
from tpl_style import (F_DATE, F_DAYS, F_MONEY, F_MULT, F_NAV, F_PCT, F_QTY, F_RATE,
                       F_TEXT, letters)

FIRST = 6        # first data row on every register
HDR = 5          # header row on every register
LAST = {"Entities": 25, "Accounts": 55, "Securities": 105, "Holdings": 205,
        "Tax Lots": 205, "Transactions": 305, "Commitments": 35}

ENTITIES = [
    ("id", "Entity ID", "in", 10, F_TEXT),
    ("name", "Entity name (legal)", "in", 30, None),
    ("short", "Short name (column headers)", "in", 14, None),
    ("type", "Entity type", "in", 13, None),
    ("rel", "Relationship / role", "in", 16, None),
    ("pan", "PAN (masked)", "in", 13, None),
    ("res", "Residential status", "in", 13, None),
    ("notes", "Notes", "in", 40, None),
    ("check", "Row check", "f", 16, None),
]

ACCOUNTS = [
    ("id", "Account ID", "in", 10, F_TEXT),
    ("ent", "Entity ID", "in", 10, None),
    ("entname", "Entity", "f", 24, None),
    ("type", "Account type", "in", 18, None),
    ("provider", "Provider / custodian", "in", 26, None),
    ("adv", "Advisor / manager", "in", 24, None),
    ("strategy", "Strategy / scheme / purpose", "in", 28, None),
    ("acno", "Account / folio no. (masked)", "in", 16, None),
    ("asof", "Statement as-of date", "in", 13, F_DATE),
    ("ccy", "Currency", "in", 9, None),
    ("notes", "Notes", "in", 30, None),
    ("check", "Row check", "f", 16, None),
    ("h_ent", "helper: entity row", "h", 6, None),
]

SECURITIES = [
    ("id", "Security ID", "in", 10, F_TEXT),
    ("name", "Security / scheme name", "in", 38, None),
    ("isin", "ISIN", "in", 14, None),
    ("code", "NSE symbol / scheme code", "in", 13, None),
    ("cat", "Category", "in", 28, None),
    ("ac", "Asset class", "f", 11, None),
    ("bov", "Basket override (optional)", "in", 11, None),
    ("basket", "Basket", "f", 8, None),
    ("sector", "Sector", "in", 17, None),
    ("mcap", "Market cap", "in", 11, None),
    ("benov", "Benchmark override (optional)", "in", 20, None),
    ("bench", "Benchmark", "f", 26, None),
    ("listed", "Listed? (Y/N)", "in", 8, None),
    ("basis", "Valuation basis", "in", 14, None),
    ("price", "Price at valuation date (₹ per unit)", "in", 14, F_NAV),
    ("pdate", "Price date", "in", 12, F_DATE),
    ("gf", "FMV on 31-Jan-2018 (₹ per unit, grandfathering)", "in", 15, F_NAV),
    ("notes", "Notes", "in", 30, None),
    ("check", "Row check", "f", 16, None),
    ("h_cat", "helper: category row", "h", 6, None),
]

HOLDINGS = [
    ("hid", "Holding ID", "in", 9, F_TEXT),
    ("acct", "Account ID", "in", 9, None),
    ("sec", "Security ID", "in", 9, None),
    ("ent", "Entity", "f", 18, None),
    ("adv", "Advisor / manager", "f", 18, None),
    ("name", "Security / product", "f", 30, None),
    ("ac", "Asset class", "f", 10, None),
    ("cat", "Category", "f", 24, None),
    ("basket", "Basket", "f", 7, None),
    ("first", "First investment date", "in", 12, F_DATE),
    ("last", "Last investment date", "in", 12, F_DATE),
    ("qty", "Quantity / units", "in", 13, F_QTY),
    ("cost", "Invested cost (₹)", "in", 15, F_MONEY),
    ("avg", "Average cost (₹ per unit)", "f", 12, F_RATE),
    ("price", "Price (₹ per unit)", "f", 12, F_NAV),
    ("basis", "Valuation basis", "f", 13, None),
    ("mvov", "Market value override (₹)", "in", 15, F_MONEY),
    ("mv", "Market value (₹)", "f", 15, F_MONEY),
    ("ugain", "Unrealised gain (₹)", "f", 14, F_MONEY),
    ("absret", "Absolute return (%)", "f", 10, F_PCT),
    ("income", "Dividend / interest received (₹)", "in", 13, F_MONEY),
    ("rgain", "Realised gain on exits (₹)", "in", 13, F_MONEY),
    ("xirr", "Scheme XIRR (%)", "in", 9, F_PCT),
    ("bench", "Benchmark", "f", 22, None),
    ("babs", "Benchmark absolute (%)", "in", 10, F_PCT),
    ("bxirr", "Benchmark XIRR (%)", "in", 10, F_PCT),
    ("alpha", "Alpha (XIRR, % pts)", "f", 9, F_PCT),
    ("shown", "Return shown", "f", 10, None),
    ("alloc", "Allocation (% of portfolio)", "f", 10, F_PCT),
    ("prevmv", "Market value at previous date (₹)", "in", 15, F_MONEY),
    ("stmt", "Statement date", "in", 12, F_DATE),
    ("src", "Source document / notes", "in", 30, None),
    ("lotqty", "Tax lots: closing quantity", "f", 13, F_QTY),
    ("check", "Row check", "f", 18, None),
    ("h_acc", "helper: account row", "h", 6, None),
    ("h_sec", "helper: security row", "h", 6, None),
    ("h_eid", "helper: entity ID", "h", 6, None),
    ("h_key", "helper: basket rank key", "h", 8, None),
    ("h_mx", "helper: MV x XIRR (XIRR set)", "h", 8, None),
    ("h_m", "helper: MV in the XIRR set", "h", 8, None),
    ("h_mbx", "helper: MV x bench XIRR (XIRR set)", "h", 8, None),
    ("h_mba", "helper: cost x bench abs", "h", 8, None),
    ("h_mbam", "helper: cost with bench abs", "h", 8, None),
]

LOTS = [
    ("lid", "Lot ID", "in", 8, F_TEXT),
    ("acct", "Account ID", "in", 9, None),
    ("sec", "Security ID", "in", 9, None),
    ("ent", "Entity (taxpayer)", "f", 18, None),
    ("name", "Security", "f", 30, None),
    ("isin", "ISIN", "f", 13, None),
    ("cat", "Category", "f", 20, None),
    ("pdate", "Purchase date", "in", 12, F_DATE),
    ("pqty", "Purchase quantity", "in", 12, F_QTY),
    ("prate", "Purchase rate (₹)", "in", 11, F_RATE),
    ("pamt", "Purchase amount (₹)", "f", 14, F_MONEY),
    ("sdate", "Sale date", "in", 12, F_DATE),
    ("sqty", "Sale quantity", "in", 12, F_QTY),
    ("srate", "Sale rate (₹)", "in", 11, F_RATE),
    ("samt", "Sale amount (₹)", "f", 14, F_MONEY),
    ("cqty", "Closing quantity", "f", 12, F_QTY),
    ("ccost", "Closing cost (₹)", "f", 14, F_MONEY),
    ("mrate", "Market rate (₹)", "f", 11, F_RATE),
    ("mval", "Market value (₹)", "f", 14, F_MONEY),
    ("rdays", "Days held (realised)", "f", 9, F_DAYS),
    ("rterm", "Term (realised)", "f", 10, None),
    ("udays", "Days held (unrealised)", "f", 9, F_DAYS),
    ("uterm", "Term (unrealised)", "f", 10, None),
    ("ltdays", "Long-term after (days)", "f", 9, F_DAYS),
    ("gf", "FMV on 31-Jan-2018 (₹)", "f", 11, F_RATE),
    ("elig", "Grandfathering eligible", "f", 10, None),
    ("rbook", "Realised book profit (₹)", "f", 14, F_MONEY),
    ("ubook", "Unrealised book profit (₹)", "f", 14, F_MONEY),
    ("rtcost", "Tax cost per unit — realised (₹)", "f", 12, F_RATE),
    ("rtax", "Taxable gain — realised (₹)", "f", 14, F_MONEY),
    ("utcost", "Tax cost per unit — unrealised (₹)", "f", 12, F_RATE),
    ("utax", "Taxable gain — unrealised (₹)", "f", 14, F_MONEY),
    ("left", "Days left to become long-term", "f", 10, F_DAYS),
    ("ltdate", "Becomes long-term on", "f", 12, F_DATE),
    ("dps", "Dividend per share, current FY (₹)", "in", 11, F_RATE),
    ("div", "Dividend (₹) = DPS x closing qty", "f", 13, F_MONEY),
    ("fy", "FY of sale", "f", 9, None),
    ("notes", "Notes", "in", 26, None),
    ("check", "Row check", "f", 18, None),
    ("h_acc", "helper: account row", "h", 6, None),
    ("h_sec", "helper: security row", "h", 6, None),
    ("h_eid", "helper: entity ID", "h", 6, None),
    ("h_soon", "helper: turns long-term soon", "h", 6, None),
    ("h_srank", "helper: soon rank", "h", 6, None),
]

TXNS = [
    ("tid", "Txn ID", "in", 8, F_TEXT),
    ("date", "Date", "in", 12, F_DATE),
    ("acct", "Account ID", "in", 9, None),
    ("sec", "Security ID", "in", 9, None),
    ("ent", "Entity", "f", 18, None),
    ("name", "Security", "f", 30, None),
    ("cat", "Category", "f", 22, None),
    ("ac", "Asset class", "f", 10, None),
    ("type", "Type", "in", 13, None),
    ("qty", "Quantity / units", "in", 12, F_QTY),
    ("price", "Price (₹ per unit)", "in", 11, F_NAV),
    ("gross", "Gross amount (₹)", "in", 14, F_MONEY),
    ("chg", "Charges / TDS (₹)", "in", 11, F_MONEY),
    ("net", "Net cash flow to family (₹)", "f", 15, F_MONEY),
    ("counts", "Counts as", "f", 11, None),
    ("notes", "Notes", "in", 30, None),
    ("check", "Row check", "f", 18, None),
    ("h_acc", "helper: account row", "h", 6, None),
    ("h_sec", "helper: security row", "h", 6, None),
    ("h_type", "helper: type row", "h", 6, None),
]

COMMITS = [
    ("cid", "Commitment ID", "in", 11, F_TEXT),
    ("acct", "Account ID", "in", 9, None),
    ("sec", "Security ID", "in", 9, None),
    ("ent", "Entity", "f", 18, None),
    ("fund", "Fund", "f", 36, None),
    ("cdate", "Commitment date", "in", 12, F_DATE),
    ("comm", "Committed (₹)", "in", 14, F_MONEY),
    ("called", "Called to date (₹)", "in", 14, F_MONEY),
    ("paid", "Paid to date (₹)", "in", 14, F_MONEY),
    ("dist", "Distributions received (₹)", "in", 14, F_MONEY),
    ("uncalled", "Uncalled — still to be asked (₹)", "f", 14, F_MONEY),
    ("unpaid", "Called, not yet paid (₹)", "f", 13, F_MONEY),
    ("pct", "% of commitment called", "f", 10, F_PCT),
    ("value", "Current value (₹, from Holdings)", "f", 14, F_MONEY),
    ("tvpi", "TVPI (x)", "f", 8, F_MULT),
    ("dpi", "DPI (x)", "f", 8, F_MULT),
    ("ncdate", "Next call date", "in", 12, F_DATE),
    ("ncamt", "Next call amount (₹)", "in", 13, F_MONEY),
    ("notes", "Notes", "in", 30, None),
    ("check", "Row check", "f", 18, None),
    ("h_acc", "helper: account row", "h", 6, None),
    ("h_sec", "helper: security row", "h", 6, None),
]

E, A, S = letters(ENTITIES), letters(ACCOUNTS), letters(SECURITIES)
H, L, T, C = letters(HOLDINGS), letters(LOTS), letters(TXNS), letters(COMMITS)


def rng(sheet, letter, first=FIRST, last=None):
    """Absolute range of one register column, quoted when the name has a space."""
    last = last or LAST[sheet]
    name = f"'{sheet}'" if " " in sheet else sheet
    return f"{name}!${letter}${first}:${letter}${last}"


def hr(key):
    return rng("Holdings", H[key])


def lr(key):
    return rng("Tax Lots", L[key])


def tr(key):
    return rng("Transactions", T[key])


import re

_SHEETS = {"E": ("Entities", ENTITIES), "A": ("Accounts", ACCOUNTS), "S": ("Securities", SECURITIES),
           "H": ("Holdings", HOLDINGS), "L": ("Tax Lots", LOTS), "T": ("Transactions", TXNS),
           "C": ("Commitments", COMMITS)}
MAPS = {"E": E, "A": A, "S": S, "H": H, "L": L, "T": T, "C": C}


def fx(template, own=None):
    """Write a formula by column KEY, never by a hand-counted letter.

    <key>    -> this register's own column letter (own = its letters map)
    <X.key>  -> the letter of `key` on register X (E, A, S, H, L, T or C)
    [X.key]  -> the whole data range of `key` on register X, absolute and quoted
    `<(\\w+)>` cannot match the operators <>, <= or <", so they pass through.
    """
    def whole(m):
        sheet, _spec = _SHEETS[m.group(1)]
        return rng(sheet, MAPS[m.group(1)][m.group(2)])
    t = re.sub(r"\[(\w)\.(\w+)\]", whole, template)
    t = re.sub(r"<(\w)\.(\w+)>", lambda m: MAPS[m.group(1)][m.group(2)], t)
    if own is not None:
        t = re.sub(r"<(\w+)>", lambda m: own[m.group(1)], t)
    return t


def chain(checks, ok="OK"):
    """Nested IF for a row check: the first test that fails names the problem."""
    out = f'"{ok}"'
    for cond, msg in reversed(checks):
        out = f'IF({cond},"{msg}",{out})'
    return out
