"""Column Mapping: where each standard column comes from in the two source
formats, and how to convert it. Reference only; nothing here is calculated."""
import math

from tpl_style import BAND, BOX, LEFT_WRAP, NAVY, font, header, put, title_block, widths
from tpl_view_common import page_setup

G, O = "Glow format", "Other client's format"
N = "–"

SECTIONS = [
    ("Start Here", [
        ("Valuation date", "The 'as on' date in each sheet's title", "Report date typed as text in "
         "the banner, e.g. '31.03.2026'", "Type as a real date. An account on an older statement "
         "keeps its own date on Accounts."),
        ("Previous valuation date", "Month on Month Equity Change: 'Market Value as on <prior "
         "month-end>'", N, "The start of the Period Change window."),
        ("Show figures in", "Crores on most sheets; lakhs on Asset Allocation; 'in lacs' on the "
         "promoter holding sheet", "Full rupees", "Registers hold full rupees. Multiply crores by "
         "1,00,00,000 and lakhs by 1,00,000 once, when loading; the views divide back."),
    ]),
    ("Tax Summary", [
        ("Tax year of sale", N, "A sheet per year ('FY 25-26'); the year typed into headings "
         "('2023-24')", "One register for every year. Pick the year on Tax Summary."),
    ]),
    ("Entities", [
        ("ID, name, short name", "Investorwise Summary: one column per investor, named in the "
         "heading; 'Investor' on the transaction sheets", "Not recorded: one copy of the workbook "
         "per person", "One row per taxpayer. Map every spelling of a name to one ID."),
        ("PAN", N, N, "Store masked, as XXXXX1234X."),
    ]),
    ("Accounts", [
        ("Type, provider, advisor", "'Advisor' on the basket sheets and on Transactions since "
         "inception", "'Account'", "One row per demat, PMS, AIF folio, MF folio, bank account or "
         "platform."),
        ("Statement date", N, N, "The date of the latest statement. Checks lists the older ones."),
    ]),
    ("Securities", [
        ("Name", "'Product'; scheme names under the Portfolio Allocation headings", "'Particulars'", N),
        ("ISIN", N, "'ISIN'", "Copy as text so no digit is lost."),
        ("Category", "The section heading a product sits under on the Equity, Debt, Cash, "
         "Alternate and Private sheets", N, "Pick one of the 19 categories on the Lists sheet."),
        ("Basket override", "The Equity sheet's 'Allocation' code; which basket sheet a product "
         "sits on", N, "Blank takes the category's basket."),
        ("Benchmark override", "'Benchmark'; 'Index Benchmarked'", N, "Blank takes the category's "
         "benchmark."),
        ("Price", "Market value ÷ quantity", "'Mkt Rate'", "Type the price and its date."),
        ("Price on 31-Jan-2018", N, "'Grand Father Price'", "Needed only for listed shares and "
         "equity funds bought on or before that date."),
        ("Sector, market cap", "Equity Quants 'Top 10 Sectors' (an aggregate)", N,
         "Type per security; the aggregate is not carried."),
        ("Notes", "Equity Scheme details: fund manager, AUM, style, expense ratio, fees, exit "
         "load, lock-in", N, "Keep the facts a reader needs in Notes."),
    ]),
    ("Holdings", [
        ("First and last date", "'Investment Date Range' (text; some cells show an N/A error)", "Earliest "
         "'Pur Date'", "Type real dates; a cell showing an N/A error stays blank."),
        ("Quantity, cost", "'Investment at Cost'", "'Cl. Stk. Qty/Amount' summed", "Must equal "
         "the open lots on Tax Lots; the row check says if not."),
        ("Market value override", "'Market Value' for PMS, AIF and bank rows", "'Mkt Value'",
         "Only where there is no price × quantity."),
        ("Dividend received", "'Dividend / Interest'", "'Total dividend 2023-24' is an estimate: "
         "it goes to Tax Lots", N),
        ("Realised gain", "'Absolute Gain / (Loss) Including Redeemed Funds' less the gain on "
         "active funds", "'Realised Book Profit' summed", N),
        ("XIRR, benchmark returns", "The basket sheets' Scheme/Index Absolute and XIRR; "
         "'Annualized Returns'", N, "Type as fractions: 12.5% is 0.125."),
        ("Previous value", "Month on Month Equity Change prior value; Attribution Analysis "
         "'Market Value prior month'", N, "The value on the previous valuation date."),
        ("Statement, source", N, N, "Name the statement each figure came from."),
        ("Promoter holding", "The promoter holding sheet: Product, Quantity, 'Market Value in "
         "lacs'", N, "Its own account, or leave it out if the family keeps it apart."),
    ]),
    ("Tax Lots", [
        ("Lot ID", N, "'Sl No.'", "Prefix it so it is unique across the family."),
        ("Account, security", N, "'Account', 'Particulars', 'ISIN'", "Pick from Accounts and "
         "Securities."),
        ("Purchase date, quantity, rate", N, "'Pur Date', 'Pur Qty', 'Pur Rate'; 'Pur Amount' is "
         "calculated", "Text dates become real dates."),
        ("Sale date, quantity, rate", N, "'Sale Date', 'Sale Qty', 'Sale Rate'; 'Sales Amount' "
         "is calculated", N),
        ("Closing stock, market value", N, "'Cl. Stk. Date/Qty/Rate/Amount'; 'Mkt Value'",
         "Calculated from the lot and the price."),
        ("Days held, term", N, "'No of Days'; 'Status'", "Calculated: long-term after 365 days "
         "listed, 730 unlisted."),
        ("Grandfathered cost, taxable gain", N, "'Eligibility'; 'G/F For Realised'; 'G/F For Un "
         "Realised' (also spelled 'UnRealised'); the 'Taxable Gain' columns", "Calculated, "
         "section 112A."),
        ("Book profit", N, "'Realised Book Profit'; 'Unrealised Profit'", "Calculated."),
        ("Days to long-term, long-term date", N, "'Days left to become Long-term'; 'Month in "
         "which ST will become LT'", "Calculated."),
        ("Dividend per share", N, "'Dividend per d share for 2023-24'", "Typed per lot."),
    ]),
    ("Transactions", [
        ("One row per movement", "Transactions since inception: Investor, Advisor, Product, "
         "Transaction, Date, Quantity, Rate, Value", N, "Investor + Advisor → Account; Product → "
         "Security; Transaction → Type; Rate → Price; Value → Gross, typed positive."),
        ("Sale and purchase", "Transactions and Transactions all Asset class: sale and purchase "
         "side by side on one row", N, "Unstack into one row per movement."),
        ("Charges, TDS", N, N, "Their own column, typed positive."),
    ]),
    ("Commitments", [
        ("Committed, called, paid, distributed", "The Debt sheet's 'Commitment Amount'; Private "
         "Investments 'Remarks'", N, "One row per commitment; uncalled, TVPI and DPI are "
         "calculated."),
    ]),
    ("Views", [
        ("Portfolio Allocation", "Portfolio Allocation; Live Equity Performance", N, N),
        ("Basket Allocation, Basket Detail", "Asset Allocation; the basket sheets: Stable Growth, "
         "'Entrepreneruial Growth' (sic), 'Thematic,Tactical', Liquid", N, "Effective allocation "
         "and liquidity still to be assigned are a basket override on Securities."),
        ("Investor Summary", "Investorwise Summary", N, N),
        ("Period Change", "Month on Month Equity Change; Attribution Analysis", N, "Benchmark "
         "change and alpha are not carried."),
        ("Tax Summary", N, "The 'Pivot' sheet", N),
    ]),
    ("Not carried", [
        ("–", "Plan of Action - Equity; Sheet1; Equity Quants", "'Closing price as on "
         "31-03-2023'; a purchase-price column kept for one family member only; scratch sheets",
         "Correct a lot's rate on Tax Lots and say why in its Notes, rather than keeping a second "
         "price column."),
    ]),
]

FIX = [
    (G, "A basket sheet's total adds ranges of different lengths", "Recheck the totals before "
     "copying figures."),
    (G, "N/A errors in the investment date ranges", "Leave the date blank."),
    (G, "Figures in crores and lakhs side by side", "Convert everything to full rupees."),
    (G, "A header cell holds a subtraction formula", "Copy the value, not the formula."),
    (G, "A lookup linked to another workbook", "Paste the values before loading."),
    (G, "Misspellings: 'Entrepreneruial', 'Aboslute'", "Use the names on the Lists sheet."),
    (G, "Sale and purchase side by side on one row", "One row per movement on Transactions."),
    (G, "Investor names in the headings", "One row per entity; the name lives on Entities."),
    (O, "Dates typed as text", "Type real dates."),
    (O, "The year typed into headings; a copied sheet per year", "One register; pick the year on "
     "Tax Summary."),
    (O, "No taxpayer column; one copy per person; a price column for one person", "One register "
     "with an entity on every account."),
    (O, "Header spellings vary ('Un Realised'/'UnRealised', 'Dividend per d share')",
     "Map by meaning, as above."),
]


def _row(ws, r, cells, *, bold=False):
    for c, v in zip("BCDEF", cells):
        put(ws, f"{c}{r}", v, f=font(9, bold), al=LEFT_WRAP, border=BOX)
    lines = max(math.ceil(len(str(v)) / w) for v, w in zip(cells, (24, 32, 48, 44, 62)))
    ws.row_dimensions[r].height = max(15, 12 * lines + 4)


def build_column_mapping(wb):
    ws = wb.create_sheet("Column Mapping")
    title_block(ws, "Column Mapping — where each standard column comes from",
                "The Glow format is the consolidated review; the other client's format is a "
                "lot-level tax register. Reference only.", "F1")
    ws.sheet_properties.tabColor = "808080"
    header(ws, 5, 2, ["Standard sheet", "Standard column", "Glow format — consolidated review",
                      "Other client's format — lot-level tax register", "How to convert"], height=30)
    r = 6
    for sheet, rows in SECTIONS:
        ws.merge_cells(f"B{r}:F{r}")
        put(ws, f"B{r}", sheet.upper(), f=font(9, True, color=NAVY), bg=BAND, al=LEFT_WRAP)
        r += 1
        for column, glow, other, how in rows:
            _row(ws, r, [sheet, column, glow, other, how])
            r += 1
    ws.merge_cells(f"B{r}:F{r}")
    put(ws, f"B{r}", "FIX BEFORE LOADING", f=font(9, True, color=NAVY), bg=BAND, al=LEFT_WRAP)
    r += 1
    for src, issue, fix in FIX:
        _row(ws, r, [src, issue, "", "", fix])
        ws.merge_cells(f"C{r}:E{r}")
        r += 1
    widths(ws, {"A": 2, "B": 22, "C": 30, "D": 44, "E": 40, "F": 56})
    ws.freeze_panes = "B6"
    page_setup(ws, f"A1:F{r - 1}")
    ws.print_title_rows = "5:5"
    return ws
