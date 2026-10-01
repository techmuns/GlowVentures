"""Demo data: a fictional family, fictional securities (ISINs start DEMO) and
fictional figures. Nothing here comes from any real client.

Holdings with tax lots take their quantity, cost and realised gain FROM the
lots, so the workbook's own lot check reads OK; the quarter's opening values
are backed out of each holding's value and its dated flows, so the Period
Change view reconciles.
"""
from datetime import date as d

CLIENT = "Malhotra Family Office (DEMO)"
VAL_DATE, PREV_DATE, UNIT = d(2026, 6, 30), d(2026, 3, 31), "₹ Crore"

ENTITIES = [
    ("E01", "Rajiv Malhotra", "Rajiv", "Individual", "Head of family", "XXXXX1234X", "Resident", ""),
    ("E02", "Nisha Malhotra", "Nisha", "Individual", "Spouse", "XXXXX5678X", "Resident", ""),
    ("E03", "Arjun Malhotra", "Arjun", "Individual", "Son", "XXXXX9012X", "Resident", ""),
    ("E04", "Malhotra Family Trust", "Family Trust", "Trust", "Private family trust",
     "XXXXX3456X", "Resident", "Trustees: Rajiv and Nisha Malhotra"),
    ("E05", "Malhotra Holdings LLP", "Holdings LLP", "LLP", "Family investment LLP",
     "XXXXX7890X", "Resident", ""),
]

# id, entity, type, provider, advisor, strategy, account no., as-of, currency, notes
ACCOUNTS = [
    ("A01", "E01", "Demat (Direct)", "Alpha Securities Ltd", "Self-directed", "Direct equity", "XXXX4521", VAL_DATE),
    ("A02", "E01", "PMS", "Banyan Capital Managers", "Banyan Capital Managers", "Banyan Focused Equity", "XXXX7710", VAL_DATE),
    ("A03", "E02", "MF Folio / CAS", "Orchid Wealth (consolidated statement)", "Orchid Wealth Advisors", "Mutual funds", "CAS-XXXX0932", VAL_DATE),
    ("A04", "E02", "Demat (Direct)", "Alpha Securities Ltd", "Self-directed", "Direct equity and ETFs", "XXXX8830", VAL_DATE),
    ("A05", "E03", "AIF Folio", "Cedar Asset Managers", "Cedar Asset Managers", "Cedar India Opportunities Fund (Cat III)", "XXXX1164", VAL_DATE),
    ("A06", "E04", "AIF Folio", "Fernhill Partners", "Fernhill Partners", "Fernhill Ventures Fund II (Cat II)", "XXXX2201", PREV_DATE),
    ("A07", "E05", "Bank Account", "Meridian Bank", "Self-directed", "Operating current account", "XXXX9087", VAL_DATE),
    ("A08", "E04", "Wealth Platform", "Granite Wealth Pvt Ltd", "Granite Wealth", "Fixed income, arbitrage and InvIT", "XXXX5512", VAL_DATE),
    ("A09", "E01", "Unlisted / Physical", "Held directly (share certificates)", "Self-directed", "Unlisted company shares", "On file", VAL_DATE),
    ("A10", "E03", "Demat (Direct)", "Alpha Securities Ltd", "Self-directed", "Liquid fund and silver ETF", "XXXX6621", VAL_DATE),
    ("A11", "E05", "MF Folio / CAS", "Orchid Wealth (consolidated statement)", "Orchid Wealth Advisors", "Treasury liquid fund", "CAS-XXXX0947", VAL_DATE),
    ("A12", "E04", "AIF Folio", "Sahyadri Investment Managers", "Sahyadri Investment Managers", "Sahyadri Private Credit Fund (Cat II)", "XXXX3308", PREV_DATE),
    ("A13", "E05", "Demat (Direct)", "Alpha Securities Ltd", "Self-directed", "Pre-IPO shares", "XXXX7431", VAL_DATE),
]

# id, name, isin, code, category, basket override, sector, mcap, benchmark override,
# listed, basis, price, price date, FMV 31-Jan-2018, notes
V, Q = VAL_DATE, PREV_DATE
SECURITIES = [
    ("S01", "Aravali Cements Ltd", "DEMO00000001", "ARAVCEM", "Direct Equity", "", "Materials", "Mid Cap", "", "Y", "Market price", 1842.50, V, 1120.00, ""),
    ("S02", "Sahyadri Precision Engineering Ltd", "DEMO00000002", "SAHPREC", "Direct Equity", "", "Industrials", "Small Cap", "", "Y", "Market price", 612.30, V, 405.00, ""),
    ("S03", "Coromandel Digital Services Ltd", "DEMO00000003", "CORODIG", "Direct Equity", "SG", "Information Technology", "Large Cap", "", "Y", "Market price", 1515.00, V, 980.00, "The family treats this as a core holding, so its basket is overridden to SG."),
    ("S04", "Deccan Financial Services Ltd", "DEMO00000004", "DECFIN", "Direct Equity", "", "Financials", "Large Cap", "", "Y", "Market price", 1678.20, V, 842.00, ""),
    ("S05", "Eastern Speciality Chemicals Ltd", "DEMO00000005", "EASTCHEM", "Direct Equity", "", "Materials", "Small Cap", "", "Y", "Market price", 438.75, V, None, "Listed after 31-Jan-2018, so no grandfathering FMV."),
    ("S06", "Himalaya Flexi Cap Fund – Direct Growth", "DEMO00000006", "HIMFLX-DG", "Equity MF – Large / Flexi / Multi Cap", "", "Diversified", "Not applicable", "", "N", "NAV", 96.4312, V, 39.1200, ""),
    ("S07", "Indus Midcap Opportunities Fund – Direct Growth", "DEMO00000007", "INDMID-DG", "Equity MF – Mid & Small Cap", "", "Diversified", "Not applicable", "", "N", "NAV", 142.8830, V, None, ""),
    ("S08", "Jaipur Balanced Advantage Fund – Direct Growth", "DEMO00000008", "JPRBAF-DG", "Equity MF – Hybrid / BAF", "", "Diversified", "Not applicable", "", "N", "NAV", 38.2210, V, None, ""),
    ("S09", "Banyan Focused Equity Portfolio", "", "PMS-BANYAN", "PMS – Equity", "", "Diversified", "Not applicable", "", "N", "Statement value", None, None, None, "Value from the manager's statement; see the PMS's own report for its shares."),
    ("S10", "Cedar India Opportunities Fund – Class A", "DEMO00000010", "AIF-CEDAR-A", "AIF Cat III – Listed Equity", "", "Diversified", "Not applicable", "", "N", "NAV", 142.3600, V, None, ""),
    ("S11", "Kaveri Gold ETF", "DEMO00000011", "KAVGOLD", "Gold / Silver (ETF, SGB, FoF)", "", "Precious metals", "Not applicable", "", "Y", "Market price", 72.18, V, None, ""),
    ("S12", "Kaveri Silver ETF", "DEMO00000012", "KAVSILV", "Gold / Silver (ETF, SGB, FoF)", "", "Precious metals", "Not applicable", "Domestic silver price (MCX)", "Y", "Market price", 96.40, V, None, "Benchmark overridden: silver, not gold."),
    ("S13", "Lotus Liquid Fund – Direct Growth", "DEMO00000013", "LOTLIQ-DG", "Liquid / Overnight Fund", "", "Money market", "Not applicable", "", "N", "NAV", 3412.5543, V, None, ""),
    ("S14", "Malabar Arbitrage Fund – Direct Growth", "DEMO00000014", "MALARB-DG", "Arbitrage Fund", "", "Arbitrage", "Not applicable", "", "N", "NAV", 18.7422, V, None, ""),
    ("S15", "Meridian Bank – Operating Current Account", "", "", "Bank / Cash Balance", "", "Cash", "Not applicable", "", "N", "Statement value", None, None, None, "Balance as per bank statement."),
    ("S16", "Narmada Corporate Bond Fund – Direct Growth", "DEMO00000016", "NARCB-DG", "Debt MF", "", "Corporate bonds", "Not applicable", "", "N", "NAV", 31.2291, V, None, ""),
    ("S17", "Orion Housing Finance 8.60% NCD 2029", "DEMO00000017", "ORIONHF29", "Bonds / NCDs", "", "Financials", "Not applicable", "", "Y", "Market price", 1012.40, V, None, "Face value ₹1,000; coupon paid half-yearly."),
    ("S18", "Fernhill Ventures Fund II – Class A", "DEMO00000018", "AIF-FERN-II", "AIF Cat I / II – PE / VC Fund", "", "Venture capital", "Not applicable", "", "N", "NAV", 1264.80, Q, None, "NAV from the fund's quarterly statement."),
    ("S19", "Quill Robotics Pvt Ltd – Series A CCPS", "DEMO00000019", "", "Private Equity – Unlisted Shares", "", "Industrials", "Micro / Unlisted", "", "N", "At cost", None, None, None, "Held at cost until the next priced round."),
    ("S20", "Rangoli Foods Pvt Ltd – Equity", "DEMO00000020", "", "Pre-IPO", "", "Consumer Staples", "Micro / Unlisted", "", "N", "At cost", None, None, None, "Pre-IPO allotment; at cost until listing."),
    ("S21", "Tapti Infrastructure InvIT", "DEMO00000021", "TAPTIINV", "REIT / InvIT", "", "Infrastructure", "Not applicable", "", "Y", "Market price", 118.20, V, None, ""),
    ("S22", "Sahyadri Private Credit Fund – Series I", "DEMO00000022", "AIF-SAHY-I", "AIF Cat II – Private Credit", "", "Private credit", "Not applicable", "", "N", "NAV", 1038.20, Q, None, "NAV from the fund's quarterly statement."),
]

# id, account, security, purchase date, qty, rate, sale date, qty, rate, dividend per share
LOTS = [
    ("L001", "A01", "S01", d(2016, 3, 12), 48000, 780.00, d(2025, 8, 18), 16000, 1655.00, 30.00),
    ("L002", "A01", "S01", d(2025, 11, 4), 12000, 1702.40, None, None, None, 30.00),
    ("L003", "A01", "S02", d(2017, 6, 21), 120000, 310.00, d(2026, 2, 2), 40000, 598.00, 3.00),
    ("L004", "A01", "S03", d(2021, 1, 15), 36000, 1105.00, None, None, None, 17.00),
    ("L005", "A04", "S04", d(2025, 9, 10), 27000, 1540.00, None, None, None, 18.00),
    ("L006", "A04", "S04", d(2026, 2, 28), 9000, 1602.50, None, None, None, 18.00),
    ("L007", "A04", "S05", d(2024, 5, 5), 60000, 512.00, d(2026, 3, 20), 25000, 452.00, 6.00),
    ("L008", "A03", "S06", d(2018, 1, 8), 1250000, 38.40, d(2025, 12, 12), 250000, 91.20, None),
    ("L009", "A01", "S02", d(2025, 4, 10), 5000, 540.00, d(2026, 1, 12), 5000, 604.00, None),
]

# id, account, security, first, last, qty, cost, override, income, realised, xirr, bench abs,
# bench xirr, statement date, source, quarter's market return (to back out the opening value)
# qty / cost / realised = None -> taken from the tax lots.
HOLDINGS = [
    ("H001", "A01", "S01", d(2016, 3, 12), d(2025, 11, 4), None, None, None, 1320000, None, 0.179, 0.964, 0.131, V, "Demat holding statement", 0.062),
    ("H002", "A01", "S02", d(2017, 6, 21), d(2025, 4, 10), None, None, None, 240000, None, 0.124, 1.180, 0.129, V, "Demat holding statement", 0.081),
    ("H003", "A01", "S03", d(2021, 1, 15), None, None, None, None, 612000, None, 0.086, 0.621, 0.118, V, "Demat holding statement", 0.034),
    ("H004", "A02", "S09", d(2022, 4, 1), d(2025, 1, 15), None, 150000000, 181240000, 1120000, 6450000, 0.142, 0.385, 0.121, V, "PMS quarterly statement", 0.048),
    ("H005", "A09", "S19", d(2024, 8, 10), d(2026, 1, 20), 12500, 25000000, None, None, None, None, None, None, V, "Share certificates; shareholders' agreement on file", 0.0),
    ("H006", "A03", "S06", d(2018, 1, 8), None, None, None, None, None, None, 0.112, 1.318, 0.126, V, "Consolidated account statement", 0.041),
    ("H007", "A03", "S07", d(2023, 4, 15), d(2026, 6, 15), 412580.214, 42500000, None, None, None, 0.214, 0.362, 0.189, V, "Consolidated account statement", 0.072),
    ("H008", "A03", "S08", d(2023, 10, 3), None, 1050000, 35000000, None, None, None, 0.108, 0.241, 0.115, V, "Consolidated account statement", 0.029),
    ("H009", "A04", "S04", d(2025, 9, 10), d(2026, 2, 28), None, None, None, 648000, None, None, 0.062, None, V, "Demat holding statement", 0.045),
    ("H010", "A04", "S05", d(2024, 5, 5), None, None, None, None, 210000, None, -0.089, 0.217, 0.098, V, "Demat holding statement", -0.058),
    ("H011", "A04", "S11", d(2024, 2, 12), d(2024, 11, 18), 420000, 25200000, None, None, None, 0.116, 0.224, 0.123, V, "Demat holding statement", 0.052),
    ("H012", "A05", "S10", d(2023, 1, 20), d(2026, 5, 5), 1450000, 146988000, None, None, None, 0.178, 0.440, 0.132, V, "Fund account statement", 0.057),
    ("H013", "A10", "S13", d(2026, 3, 11), d(2026, 6, 3), 14650.212, 49450000, None, None, None, None, 0.012, None, V, "Demat holding statement", 0.016),
    ("H014", "A10", "S12", d(2025, 8, 6), None, 180000, 14400000, None, None, None, None, 0.184, None, V, "Demat holding statement", 0.094),
    ("H015", "A06", "S18", d(2023, 9, 15), d(2026, 4, 22), 60000, 60000000, None, None, 2100000, 0.151, 0.340, 0.128, Q, "Fund statement 31-Mar-2026 (NAV); units include call notice 6 of 22-Apr-2026", 0.0),
    ("H016", "A08", "S17", d(2024, 3, 14), None, 50000, 50000000, None, 4300000, None, 0.089, 0.182, 0.076, V, "Platform holding statement", 0.011),
    ("H017", "A08", "S14", d(2025, 12, 2), d(2026, 6, 18), 3200000, 58156000, None, None, None, None, 0.033, None, V, "Platform holding statement", 0.017),
    ("H018", "A08", "S16", d(2024, 7, 21), None, 2400000, 70000000, None, None, None, 0.079, 0.156, 0.074, V, "Platform holding statement", 0.019),
    ("H019", "A08", "S21", d(2024, 10, 30), None, 400000, 44000000, None, 3600000, None, 0.126, 0.119, 0.091, V, "Platform holding statement", 0.026),
    ("H020", "A07", "S15", None, None, None, 37450000, 37450000, 185000, None, None, None, None, V, "Bank statement", 0.0),
    ("H021", "A13", "S20", d(2025, 11, 18), None, 80000, 32000000, None, None, None, None, None, None, V, "Demat holding statement", 0.0),
    ("H022", "A11", "S13", d(2026, 1, 5), None, 8790.127, 29500000, None, None, None, None, 0.017, None, V, "Consolidated account statement", 0.017),
    ("H023", "A12", "S22", d(2026, 1, 15), d(2026, 5, 20), 10000, 10000000, None, None, None, None, 0.031, None, Q, "Fund statement 31-Mar-2026 (NAV); units include call notice 2 of 20-May-2026", 0.035),
]

# id, date, account, security, type, qty, price, gross, charges, notes
TXNS = [
    ("T001", d(2025, 8, 18), "A01", "S01", "Sell", 16000, 1655.00, 26480000, 26480, "Against lot L001"),
    ("T002", d(2025, 11, 4), "A01", "S01", "Buy", 12000, 1702.40, 20428800, 20429, "Lot L002"),
    ("T003", d(2026, 2, 2), "A01", "S02", "Sell", 40000, 598.00, 23920000, 23920, "Against lot L003"),
    ("T004", d(2025, 9, 10), "A04", "S04", "Buy", 27000, 1540.00, 41580000, 41580, "Lot L005"),
    ("T005", d(2026, 2, 28), "A04", "S04", "Buy", 9000, 1602.50, 14422500, 14423, "Lot L006"),
    ("T006", d(2026, 3, 20), "A04", "S05", "Sell", 25000, 452.00, 11300000, 11300, "Against lot L007"),
    ("T007", d(2025, 12, 12), "A03", "S06", "Redemption", 250000, 91.20, 22800000, 0, "Against lot L008"),
    ("T008", d(2026, 4, 15), "A03", "S07", "SIP", None, 128.12, 450000, 0, "Monthly SIP"),
    ("T009", d(2026, 5, 15), "A03", "S07", "SIP", None, 130.77, 450000, 0, "Monthly SIP"),
    ("T010", d(2026, 6, 15), "A03", "S07", "SIP", None, 140.24, 450000, 0, "Monthly SIP"),
    ("T011", d(2026, 4, 22), "A06", "S18", "Capital Call", 10000, 1000.00, 10000000, 0, "Drawdown notice 6"),
    ("T012", d(2026, 5, 30), "A06", "S18", "Distribution", None, None, 3500000, 0, "Partial exit from a portfolio company"),
    ("T013", d(2026, 6, 10), "A08", "S17", "Interest", None, None, 2150000, 215000, "Half-yearly coupon; TDS 10%"),
    ("T014", d(2026, 4, 25), "A08", "S21", "Dividend", None, None, 900000, 0, "InvIT distribution"),
    ("T015", d(2026, 5, 5), "A05", "S10", "Buy", 70000, 128.40, 8988000, 0, "Additional subscription"),
    ("T016", d(2026, 6, 18), "A08", "S14", "Buy", 400000, 18.69, 7476000, 0, ""),
    ("T017", d(2026, 6, 30), "A02", "S09", "Fees / Charges", None, None, 562500, 0, "Quarterly management fee; invoiced and paid from outside the portfolio"),
    ("T018", d(2026, 5, 12), "A04", "S04", "Dividend", None, 18.00, 648000, 64800, "Final dividend; TDS 10%"),
    ("T019", d(2026, 6, 3), "A10", "S13", "Buy", None, 3400.87, 5000000, 0, ""),
    ("T020", d(2025, 4, 10), "A01", "S02", "Buy", 5000, 540.00, 2700000, 2700, "Lot L009"),
    ("T021", d(2026, 5, 20), "A12", "S22", "Capital Call", 5000, 1000.00, 5000000, 0, "Drawdown notice 2"),
    ("T022", d(2026, 1, 12), "A01", "S02", "Sell", 5000, 604.00, 3020000, 3020, "Against lot L009 (short-term)"),
]

# id, account, security, date, committed, called, paid, distributions, next call date, amount, notes
COMMITS = [
    ("C01", "A06", "S18", d(2023, 7, 15), 100000000, 60000000, 60000000, 8500000, d(2026, 9, 15), 10000000, "Drawdown notice expected in Q2 FY27"),
    ("C02", "A09", "S19", d(2024, 8, 10), 30000000, 25000000, 25000000, 0, d(2026, 10, 10), 5000000, "Tranche 3 on the product milestone"),
    ("C03", "A13", "S20", d(2025, 11, 18), 32000000, 32000000, 32000000, 0, None, None, "Fully paid at allotment"),
    ("C04", "A12", "S22", d(2026, 1, 10), 50000000, 12500000, 10000000, 0, d(2026, 10, 20), 5000000, "₹25 L called 20-Jun-2026 is payable by 15-Jul-2026 (see 'Called, not yet paid'); the next call is expected in October"),
]

SIGN = {"Buy": -1, "SIP": -1, "Capital Call": -1, "Sell": 1, "Redemption": 1,
        "Distribution": 1, "Dividend": 1, "Interest": 1, "Fees / Charges": -1}
COUNTS = {"Buy": "Investment", "SIP": "Investment", "Capital Call": "Investment",
          "Sell": "Divestment", "Redemption": "Divestment", "Distribution": "Divestment"}


def txn_units(t):
    """A SIP or a purchase recorded by amount: units = amount / price, to 3 places."""
    tid, dt, acct, sec, typ, qty, price, gross, chg, notes = t
    if qty is None and price and typ in ("SIP", "Buy"):
        qty = round(gross / price, 3)
    return (tid, dt, acct, sec, typ, qty, price, gross, chg, notes)


def holdings_rows():
    """Holdings with lot-derived fields filled and the opening value backed out."""
    sec = {s[0]: s for s in SECURITIES}
    out = []
    for h in HOLDINGS:
        (hid, acct, sid, first, last, qty, cost, mvov, inc, rg, xirr, babs, bxirr, stmt, src, g) = h
        lots = [x for x in LOTS if x[1] == acct and x[2] == sid]
        if lots:
            cl = [(x[4] - (x[7] or 0), x[5]) for x in lots]
            qty = sum(q for q, _ in cl)
            cost = round(sum(q * r for q, r in cl), 2)
            rg = round(sum((x[7] or 0) * (x[8] - x[5]) for x in lots if x[7]), 2)
        s = sec[sid]
        basis, price = s[10], s[11]
        mv = mvov if mvov is not None else (cost if basis == "At cost" else qty * price)
        flows = [txn_units(t) for t in TXNS if t[2] == acct and t[3] == sid and PREV_DATE < t[1] <= VAL_DATE]
        inv = sum(t[7] + t[8] for t in flows if t[4] in ("Buy", "SIP", "Capital Call"))
        red = sum(t[7] - t[8] for t in flows if t[4] in ("Sell", "Redemption", "Distribution"))
        prev = round((mv - inv + red) / (1 + g))
        out.append((hid, acct, sid, first, last, qty, cost, mvov, inc, rg, xirr, babs, bxirr, prev, stmt, src))
    return out
