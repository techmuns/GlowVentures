"""Holdings (one row per security per account) and Tax Lots (one row per
purchase lot).

Holdings is what every view is built from. Tax Lots is the capital-gains
register behind the Tax Summary: purchase, sale, holding period, the
31-Jan-2018 grandfathering and the taxable gain, lot by lot.
"""
import tpl_demo as demo
from tpl_register import write_register
from tpl_schema import HOLDINGS, LOTS, H, L, chain, fx

REG_TAB = "FFC000"

# A holding counts in the value-weighted XIRR only where it is held a year or
# more and reports both its own XIRR and its benchmark's.
IN_XIRR = 'AND(ISNUMBER($<mv>{r}),$<xirr>{r}<>"",$<bxirr>{r}<>"",$<shown>{r}="XIRR")'
# ...and in the blended benchmark's absolute return where it has a cost, an
# absolute return of its own, and a benchmark absolute to set against it.
IN_ABS = 'AND(ISNUMBER($<cost>{r}),$<babs>{r}<>"",ISNUMBER($<absret>{r}))'


def _lookup(reg, key, row_key):
    return f'=IF($<{row_key}>{{r}}="","",INDEX([{reg}.{key}],$<{row_key}>{{r}})&"")'


def _number(reg, key, row_key):
    """A numeric lookup that stays blank, never 0, where the source is blank."""
    i = f"INDEX([{reg}.{key}],$<{row_key}>{{r}})"
    return f'=IF($<{row_key}>{{r}}="","",IF({i}="","",{i}))'


def build_holdings(wb):
    f = {
        "ent": _lookup("A", "entname", "h_acc"),
        "adv": _lookup("A", "adv", "h_acc"),
        "name": _lookup("S", "name", "h_sec"),
        "ac": _lookup("S", "ac", "h_sec"),
        "cat": _lookup("S", "cat", "h_sec"),
        "basket": _lookup("S", "basket", "h_sec"),
        "avg": '=IF(OR($<qty>{r}="",$<cost>{r}=""),"",IF(N($<qty>{r})=0,"",'
               '$<cost>{r}/$<qty>{r}))',
        "price": _number("S", "price", "h_sec"),
        "basis": _lookup("S", "basis", "h_sec"),
        "mv": '=IF($<sec>{r}="","",IF($<mvov>{r}<>"",$<mvov>{r},IF($<basis>{r}="At cost",'
              'IF($<cost>{r}="","",$<cost>{r}),IF(OR($<price>{r}="",$<qty>{r}=""),"",'
              '$<qty>{r}*$<price>{r}))))',
        "ugain": '=IF(OR(NOT(ISNUMBER($<mv>{r})),$<cost>{r}=""),"",$<mv>{r}-$<cost>{r})',
        "absret": '=IF(OR($<ugain>{r}="",N($<cost>{r})=0),"",$<ugain>{r}/$<cost>{r})',
        "bench": _lookup("S", "bench", "h_sec"),
        "alpha": '=IF(OR($<xirr>{r}="",$<bxirr>{r}=""),"",$<xirr>{r}-$<bxirr>{r})',
        "shown": '=IF($<sec>{r}="","",IF($<basis>{r}="At cost","At cost",'
                 'IF(NOT(ISNUMBER($<first>{r})),"No date",IF(ValDate-$<first>{r}<365,'
                 '"Absolute",IF($<xirr>{r}="","XIRR missing","XIRR")))))',
        "alloc": '=IF(NOT(ISNUMBER($<mv>{r})),"",IF(SUM($<mv>$6:$<mv>$205)=0,"",'
                 '$<mv>{r}/SUM($<mv>$6:$<mv>$205)))',
        "lotqty": '=IF($<sec>{r}="","",IF(COUNTIFS([L.acct],$<acct>{r},[L.sec],$<sec>{r})=0,'
                  '"",SUMIFS([L.cqty],[L.acct],$<acct>{r},[L.sec],$<sec>{r})))',
        "check": '=IF($<hid>{r}&$<acct>{r}&$<sec>{r}="","",' + chain([
            ('$<hid>{r}=""', "Missing ID"),
            ('COUNTIF($<hid>$6:$<hid>$205,$<hid>{r})>1', "Duplicate ID"),
            ('$<h_acc>{r}=""', "Unknown account"),
            ('$<h_sec>{r}=""', "Unknown security"),
            ('COUNTIFS($<acct>$6:$<acct>$205,$<acct>{r},$<sec>$6:$<sec>$205,$<sec>{r})>1',
             "Same security twice in one account"),
            ('AND(ISNUMBER($<first>{r}),ISNUMBER($<last>{r}),N($<last>{r})<N($<first>{r}))',
             "Last date before first"),
            ('NOT(ISNUMBER($<mv>{r}))', "No market value"),
            ('OR(N($<first>{r})>ValDate,N($<last>{r})>ValDate)', "Date after valuation"),
            ('AND(ISNUMBER($<lotqty>{r}),ABS(N($<qty>{r})-N($<lotqty>{r}))>0.001)',
             "Lot quantity differs"),
            ('AND(ISNUMBER($<lotqty>{r}),ABS(N($<cost>{r})'
             '-SUMIFS([L.ccost],[L.acct],$<acct>{r},[L.sec],$<sec>{r}))>1)',
             "Lot cost differs"),
            ('AND(ISNUMBER($<lotqty>{r}),ABS(N($<rgain>{r})'
             '-SUMIFS([L.rbook],[L.acct],$<acct>{r},[L.sec],$<sec>{r}))>1)',
             "Lot realised gain differs"),
        ]) + ')',
        "h_acc": '=IF($<acct>{r}="","",IFERROR(MATCH($<acct>{r},[A.id],0),""))',
        "h_sec": '=IF($<sec>{r}="","",IFERROR(MATCH($<sec>{r},[S.id],0),""))',
        "h_eid": _lookup("A", "ent", "h_acc"),
        # basket|rank by market value, largest first; ties broken by row order.
        # SUMPRODUCT compares the numbers themselves, where COUNTIFS would turn
        # ">"&value into text and could round a value into or out of its own count.
        "h_key": '=IF(OR($<sec>{r}="",$<basket>{r}="",NOT(ISNUMBER($<mv>{r}))),"",'
                 '$<basket>{r}&"|"&(SUMPRODUCT(($<basket>$6:$<basket>$205=$<basket>{r})'
                 '*ISNUMBER($<mv>$6:$<mv>$205)*($<mv>$6:$<mv>$205>$<mv>{r}))'
                 '+SUMPRODUCT(($<basket>$6:$<basket>{r}=$<basket>{r})'
                 '*ISNUMBER($<mv>$6:$<mv>{r})*($<mv>$6:$<mv>{r}=$<mv>{r}))))',
        "h_mx": f'=IF({IN_XIRR},$<mv>{{r}}*$<xirr>{{r}},0)',
        "h_m": f'=IF({IN_XIRR},$<mv>{{r}},0)',
        "h_mbx": f'=IF({IN_XIRR},$<mv>{{r}}*$<bxirr>{{r}},0)',
        "h_mba": f'=IF({IN_ABS},$<cost>{{r}}*$<babs>{{r}},0)',
        "h_mbam": f'=IF({IN_ABS},$<cost>{{r}},0)',
    }
    keys = ["hid", "acct", "sec", "first", "last", "qty", "cost", "mvov", "income", "rgain",
            "xirr", "babs", "bxirr", "prevmv", "stmt", "src"]
    rows = [dict(zip(keys, h)) for h in demo.holdings_rows()]
    return write_register(
        wb, "Holdings", HOLDINGS,
        title="Holdings — one row per security per account",
        subtitle="Type quantity and invested cost; market value is quantity × the price on "
                 "Securities (or the override, for a statement value). Where the security has "
                 "tax lots, quantity, cost and realised gain equal the lots' totals.",
        link="F1", rows=rows, formulas={k: fx(v, H) for k, v in f.items()}, tab=REG_TAB,
        freeze="G6",
        bands=[("hid", "sec", "IDS — typed"), ("ent", "basket", "FROM THE MASTER DATA"),
               ("first", "mv", "POSITION"), ("ugain", "absret", "GAIN"),
               ("income", "rgain", "INCOME AND EXITS"),
               ("xirr", "alloc", "RETURNS AND ALLOCATION"),
               ("prevmv", "src", "PREVIOUS VALUE AND SOURCE"), ("lotqty", "check", "CHECKS")],
        totals=["cost", "mv", "ugain", "income", "rgain", "prevmv"],
        validations={"acct": ("L_AccountID", "Pick the account from the Accounts sheet."),
                     "sec": ("L_SecurityID", "Pick the security from the Securities sheet.")})


def build_lots(wb):
    f = {
        "ent": _lookup("A", "entname", "h_acc"),
        "name": _lookup("S", "name", "h_sec"),
        "isin": _lookup("S", "isin", "h_sec"),
        "cat": _lookup("S", "cat", "h_sec"),
        "pamt": '=IF(OR($<pqty>{r}="",$<prate>{r}=""),"",$<pqty>{r}*$<prate>{r})',
        "samt": '=IF(OR($<sqty>{r}="",$<srate>{r}=""),"",$<sqty>{r}*$<srate>{r})',
        "cqty": '=IF($<sec>{r}="","",N($<pqty>{r})-N($<sqty>{r}))',
        "ccost": '=IF(OR($<cqty>{r}="",$<prate>{r}=""),"",$<cqty>{r}*$<prate>{r})',
        "mrate": '=IF($<h_sec>{r}="","",IF(INDEX([S.basis],$<h_sec>{r})="At cost",'
                 'IF($<prate>{r}="","",$<prate>{r}),IF(INDEX([S.price],$<h_sec>{r})="","",'
                 'INDEX([S.price],$<h_sec>{r}))))',
        "mval": '=IF(OR($<cqty>{r}="",$<mrate>{r}=""),"",$<cqty>{r}*$<mrate>{r})',
        "rdays": '=IF(OR(NOT(ISNUMBER($<sdate>{r})),NOT(ISNUMBER($<pdate>{r}))),"",'
                 '$<sdate>{r}-$<pdate>{r})',
        "rterm": '=IF($<rdays>{r}="","",IF($<ltdays>{r}="","Short Term",'
                 'IF($<rdays>{r}>$<ltdays>{r},"Long Term","Short Term")))',
        "udays": '=IF(OR(NOT(ISNUMBER($<pdate>{r})),N($<cqty>{r})<=0),"",ValDate-$<pdate>{r})',
        "uterm": '=IF($<udays>{r}="","",IF($<ltdays>{r}="","Short Term",'
                 'IF($<udays>{r}>$<ltdays>{r},"Long Term","Short Term")))',
        "ltdays": '=IF($<cat>{r}="","",IF(ISNA(MATCH($<cat>{r},L_Category,0)),"",'
                  'IF(INDEX(L_CatLT,MATCH($<cat>{r},L_Category,0))="","",'
                  'INDEX(L_CatLT,MATCH($<cat>{r},L_Category,0)))))',
        "gf": _number("S", "gf", "h_sec"),
        "elig": '=IF($<sec>{r}="","",IF(OR(NOT(ISNUMBER($<pdate>{r})),$<gf>{r}=""),"No",'
                'IF($<pdate>{r}<=GFDate,"Yes","No")))',
        "rbook": '=IF(OR($<sqty>{r}="",$<srate>{r}="",$<prate>{r}=""),"",'
                 '$<sqty>{r}*($<srate>{r}-$<prate>{r}))',
        "ubook": '=IF(OR(N($<cqty>{r})<=0,$<mrate>{r}="",$<prate>{r}=""),"",'
                 '$<cqty>{r}*($<mrate>{r}-$<prate>{r}))',
        "rtcost": '=IF(OR($<sqty>{r}="",$<srate>{r}="",$<prate>{r}=""),"",'
                  'IF($<elig>{r}="Yes",MAX($<prate>{r},MIN($<gf>{r},$<srate>{r})),'
                  '$<prate>{r}))',
        "rtax": '=IF($<rtcost>{r}="","",$<sqty>{r}*($<srate>{r}-$<rtcost>{r}))',
        "utcost": '=IF(OR(N($<cqty>{r})<=0,$<mrate>{r}="",$<prate>{r}=""),"",'
                  'IF($<elig>{r}="Yes",MAX($<prate>{r},MIN($<gf>{r},$<mrate>{r})),'
                  '$<prate>{r}))',
        "utax": '=IF($<utcost>{r}="","",$<cqty>{r}*($<mrate>{r}-$<utcost>{r}))',
        "left": '=IF(OR($<udays>{r}="",$<ltdays>{r}=""),"",'
                'MAX(0,$<ltdays>{r}+1-$<udays>{r}))',
        "ltdate": '=IF(OR($<ltdays>{r}="",NOT(ISNUMBER($<pdate>{r})),N($<cqty>{r})<=0),"",'
                  '$<pdate>{r}+$<ltdays>{r}+1)',
        "div": '=IF(OR($<dps>{r}="",N($<cqty>{r})<=0),"",$<dps>{r}*$<cqty>{r})',
        "fy": '=IF(NOT(ISNUMBER($<sdate>{r})),"",IF(MONTH($<sdate>{r})>=4,'
              'YEAR($<sdate>{r})&"-"&RIGHT(YEAR($<sdate>{r})+1,2),'
              '(YEAR($<sdate>{r})-1)&"-"&RIGHT(YEAR($<sdate>{r}),2)))',
        "check": '=IF($<lid>{r}&$<acct>{r}&$<sec>{r}="","",' + chain([
            ('$<lid>{r}=""', "Missing ID"),
            ('COUNTIF($<lid>$6:$<lid>$205,$<lid>{r})>1', "Duplicate ID"),
            ('$<h_acc>{r}=""', "Unknown account"),
            ('$<h_sec>{r}=""', "Unknown security"),
            ('COUNTIFS([H.acct],$<acct>{r},[H.sec],$<sec>{r})=0',
             "No holding row for this lot"),
            ('OR($<pqty>{r}="",$<prate>{r}="")', "Missing purchase quantity or rate"),
            ('NOT(ISNUMBER($<pdate>{r}))', "Missing purchase date"),
            ('N($<pdate>{r})>ValDate', "Purchase after valuation date"),
            ('N($<sqty>{r})>N($<pqty>{r})', "Sale quantity exceeds purchase"),
            ('AND(N($<sqty>{r})>0,OR(NOT(ISNUMBER($<sdate>{r})),$<srate>{r}=""))',
             "Sale date or rate missing"),
            ('AND(ISNUMBER($<sdate>{r}),N($<sqty>{r})=0)', "Sale date with no quantity"),
            ('AND(ISNUMBER($<sdate>{r}),N($<sdate>{r})<N($<pdate>{r}))',
             "Sale before purchase"),
            ('N($<sdate>{r})>ValDate', "Sale after valuation date"),
        ]) + ')',
        "h_acc": '=IF($<acct>{r}="","",IFERROR(MATCH($<acct>{r},[A.id],0),""))',
        "h_sec": '=IF($<sec>{r}="","",IFERROR(MATCH($<sec>{r},[S.id],0),""))',
        "h_eid": _lookup("A", "ent", "h_acc"),
        "h_soon": '=IF(AND(ISNUMBER($<left>{r}),N($<cqty>{r})>0),'
                  'IF(AND(N($<left>{r})>0,N($<left>{r})<=SoonDays),1,""),"")',
        "h_srank": '=IF($<h_soon>{r}<>1,"",SUMPRODUCT(($<h_soon>$6:$<h_soon>$205=1)'
                   '*ISNUMBER($<left>$6:$<left>$205)*($<left>$6:$<left>$205<$<left>{r}))'
                   '+SUMPRODUCT(($<h_soon>$6:$<h_soon>{r}=1)'
                   '*ISNUMBER($<left>$6:$<left>{r})*($<left>$6:$<left>{r}=$<left>{r})))',
    }
    keys = ["lid", "acct", "sec", "pdate", "pqty", "prate", "sdate", "sqty", "srate", "dps"]
    rows = [dict(zip(keys, lot)) for lot in demo.LOTS]
    return write_register(
        wb, "Tax Lots", LOTS,
        title="Tax Lots — one row per purchase lot",
        subtitle="Type the purchase and any sale against it. Holding period, long-term status, "
                 "grandfathering (s.112A) and the taxable gain are calculated; no tax rate is "
                 "applied. A partly sold lot stays on one row: its closing quantity is what is "
                 "left.",
        link="E1", rows=rows, formulas={k: fx(v, L) for k, v in f.items()}, tab=REG_TAB,
        freeze="F6",
        bands=[("lid", "cat", "LOT"), ("pdate", "pamt", "PURCHASE"), ("sdate", "samt", "SALE"),
               ("cqty", "mval", "CLOSING POSITION"), ("rdays", "ltdays", "HOLDING PERIOD"),
               ("gf", "elig", "GRANDFATHERING (s.112A)"),
               ("rbook", "utax", "PROFIT — BOOK AND TAXABLE"),
               ("left", "ltdate", "LONG-TERM TIMING"), ("dps", "fy", "DIVIDEND AND YEAR"),
               ("notes", "check", "NOTES AND CHECK")],
        totals=["pamt", "samt", "ccost", "mval", "rbook", "ubook", "rtax", "utax", "div"],
        validations={"acct": ("L_AccountID", "Pick the account from the Accounts sheet."),
                     "sec": ("L_SecurityID", "Pick the security from the Securities sheet.")})
