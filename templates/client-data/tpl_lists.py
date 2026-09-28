"""The Lists sheet: the standard classification and every dropdown's values,
plus the workbook's defined names.

Each list is a dynamic name (OFFSET over COUNTA), so a row added at the bottom
of a list reaches every dropdown and lookup with no formula edited.
"""
from tpl_style import (BLUE, CENTER, F_DAYS, GREY, LEFT, LEFT_WRAP, NAVY, band, define,
                       font, header, put, title_block, widths)
from tpl_taxonomy import (ACCOUNT_TYPES, ASSET_CLASSES, BASKETS, CATEGORIES, ENTITY_TYPES,
                          FISCAL_YEARS, LIST_FIRST_ROW, MARKET_CAP, RESIDENCY, TXN_TYPES,
                          UNITS, VAL_BASIS, YES_NO)

CAP = 60   # room in each list for rows a family adds later


def dyn(key_col, offset=0):
    """Dynamic list: as tall as its key column has entries."""
    first = LIST_FIRST_ROW
    last = first + CAP - 1
    return (f"OFFSET(Lists!${key_col}${first},0,{offset},"
            f"COUNTA(Lists!${key_col}${first}:${key_col}${last}),1)")


def _values(ws, col_letter, values, *, fmt=None, al=None):
    for i, v in enumerate(values):
        put(ws, f"{col_letter}{LIST_FIRST_ROW + i}", v, f=font(9, color=BLUE), fmt=fmt, al=al)


def build_lists(wb):
    ws = wb.create_sheet("Lists")
    title_block(ws, "Lists — the standard classification and dropdown values",
                "Every dropdown and lookup in the workbook reads these lists. Blue text may be "
                "edited; add a new value at the bottom of its list.",
                "M1")

    # Asset classes
    band(ws, 4, 1, 1, "ASSET CLASSES")
    header(ws, 5, 1, ["Asset class"], height=30)
    _values(ws, "A", ASSET_CLASSES)

    # Categories: the heart of the standard
    band(ws, 4, 4, 9, "CATEGORIES — each holding's category decides its asset class, basket, "
                      "long-term threshold and default benchmark")
    header(ws, 5, 4, ["Category", "Asset class", "Default basket", "Long-term after (days)",
                      "Default benchmark", "Tax note"], height=30)
    for i, (name, ac, basket, lt, bench, note) in enumerate(CATEGORIES):
        r = LIST_FIRST_ROW + i
        put(ws, f"D{r}", name, f=font(9, color=BLUE))
        put(ws, f"E{r}", ac, f=font(9, color=BLUE))
        put(ws, f"F{r}", basket, f=font(9, color=BLUE), al=CENTER)
        put(ws, f"G{r}", lt, f=font(9, color=BLUE), fmt=F_DAYS, al=CENTER)
        put(ws, f"H{r}", bench, f=font(9, color=BLUE))
        put(ws, f"I{r}", note, f=font(8, color=GREY), al=LEFT_WRAP)
    last = LIST_FIRST_ROW + len(CATEGORIES)
    put(ws, f"E{last + 1}",
        "Long-term after (days): Finance (No. 2) Act 2024 — listed 365, unlisted 730. "
        "Blank = never long-term (s.50AA debt funds and MLDs) or not a capital asset.",
        f=font(8, italic=True, color=GREY), al=LEFT)

    # Baskets
    band(ws, 4, 11, 13, "BASKETS (the family's own grouping)")
    header(ws, 5, 11, ["Code", "Basket", "What goes in it"], height=30)
    for i, (code, name, desc) in enumerate(BASKETS):
        r = LIST_FIRST_ROW + i
        put(ws, f"K{r}", code, f=font(9, True, color=BLUE), al=CENTER)
        put(ws, f"L{r}", name, f=font(9, color=BLUE))
        put(ws, f"M{r}", desc, f=font(8, color=GREY), al=LEFT_WRAP)

    # The short lists
    short = [("O", "ACCOUNT TYPES", "Account type", ACCOUNT_TYPES),
             ("Q", "ENTITY TYPES", "Entity type", ENTITY_TYPES),
             ("S", "RESIDENCY", "Residential status", RESIDENCY),
             ("U", "VALUATION BASIS", "Valuation basis", VAL_BASIS)]
    for letter, title, head, values in short:
        from openpyxl.utils import column_index_from_string as ci
        n = ci(letter)
        band(ws, 4, n, n, title)
        header(ws, 5, n, [head], height=30)
        _values(ws, letter, values)

    band(ws, 4, 23, 25, "TRANSACTION TYPES")
    header(ws, 5, 23, ["Type", "Cash sign (family's side)", "Counts as"], height=30)
    for i, (t, sign, counts) in enumerate(TXN_TYPES):
        r = LIST_FIRST_ROW + i
        put(ws, f"W{r}", t, f=font(9, color=BLUE))
        put(ws, f"X{r}", sign, f=font(9, color=BLUE), fmt='+0;-0;0', al=CENTER)
        put(ws, f"Y{r}", counts, f=font(9, color=BLUE))

    band(ws, 4, 27, 29, "DISPLAY UNITS")
    header(ws, 5, 27, ["Unit", "Divide ₹ by", "Suffix"], height=30)
    for i, (label, div, sfx) in enumerate(UNITS):
        r = LIST_FIRST_ROW + i
        put(ws, f"AA{r}", label, f=font(9, color=BLUE))
        put(ws, f"AB{r}", div, f=font(9, color=BLUE), fmt="#,##0")
        put(ws, f"AC{r}", sfx, f=font(9, color=BLUE), al=CENTER)

    for letter, n, title, head, values in [("AE", 31, "YES / NO", "Y / N", YES_NO),
                                           ("AG", 33, "MARKET CAP", "Market cap", MARKET_CAP),
                                           ("AI", 35, "FISCAL YEARS", "FY (Apr–Mar)", FISCAL_YEARS)]:
        band(ws, 4, n, n, title)
        header(ws, 5, n, [head], height=30)
        _values(ws, letter, values, al=CENTER if letter != "AG" else LEFT)

    widths(ws, {"A": 12, "B": 2, "C": 2, "D": 34, "E": 11, "F": 9, "G": 11, "H": 30,
                "I": 58, "J": 2, "K": 7, "L": 22, "M": 44, "N": 2, "O": 20, "P": 2, "Q": 16,
                "R": 2, "S": 16, "T": 2, "U": 15, "V": 2, "W": 15, "X": 10, "Y": 12, "Z": 2,
                "AA": 10, "AB": 12, "AC": 7, "AD": 2, "AE": 7, "AF": 2, "AG": 16, "AH": 2,
                "AI": 11})
    for r in range(LIST_FIRST_ROW, LIST_FIRST_ROW + len(CATEGORIES)):
        ws.row_dimensions[r].height = 24
    ws.freeze_panes = "A6"

    # Defined names: every list is dynamic
    names = {
        "L_AssetClass": dyn("A"),
        "L_Category": dyn("D"), "L_CatAsset": dyn("D", 1), "L_CatBasket": dyn("D", 2),
        "L_CatLT": dyn("D", 3), "L_CatBench": dyn("D", 4), "L_CatTax": dyn("D", 5),
        "L_BasketCode": dyn("K"), "L_BasketName": dyn("K", 1),
        "L_AcctType": dyn("O"), "L_EntType": dyn("Q"), "L_Residency": dyn("S"),
        "L_Basis": dyn("U"),
        "L_TxnType": dyn("W"), "L_TxnSign": dyn("W", 1), "L_TxnCounts": dyn("W", 2),
        "L_Unit": dyn("AA"), "L_UnitDiv": dyn("AA", 1), "L_UnitSfx": dyn("AA", 2),
        "L_YN": dyn("AE"), "L_MCap": dyn("AG"), "L_FY": dyn("AI"),
        "L_EntityID": "OFFSET(Entities!$A$6,0,0,COUNTA(Entities!$A$6:$A$25),1)",
        "L_AccountID": "OFFSET(Accounts!$A$6,0,0,COUNTA(Accounts!$A$6:$A$55),1)",
        "L_SecurityID": "OFFSET(Securities!$A$6,0,0,COUNTA(Securities!$A$6:$A$105),1)",
    }
    for name, ref in names.items():
        define(wb, name, ref)
    return ws
