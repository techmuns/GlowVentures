"""Transactions (dated money movements) and Commitments (money promised to
AIFs and private deals).

Transactions feed the Period Change view: what was invested, redeemed, earned
and paid in fees between the previous valuation date and this one. The cash
sign comes from the type on the Lists sheet, so an amount is always typed as a
positive number and can never be entered the wrong way round.
"""
import tpl_demo as demo
from tpl_holdings import REG_TAB, _lookup
from tpl_register import write_register
from tpl_schema import COMMITS, TXNS, C, T, chain, fx


def build_transactions(wb):
    f = {
        "ent": _lookup("A", "entname", "h_acc"),
        "name": _lookup("S", "name", "h_sec"),
        "cat": _lookup("S", "cat", "h_sec"),
        "ac": _lookup("S", "ac", "h_sec"),
        "net": '=IF(OR($<type>{r}="",$<h_type>{r}=""),"",'
               'INDEX(L_TxnSign,$<h_type>{r})*N($<gross>{r})-N($<chg>{r}))',
        "counts": '=IF($<h_type>{r}="","",INDEX(L_TxnCounts,$<h_type>{r})&"")',
        "check": '=IF($<tid>{r}&$<acct>{r}&$<sec>{r}&$<type>{r}="","",' + chain([
            ('$<tid>{r}=""', "Missing ID"),
            ('COUNTIF($<tid>$6:$<tid>$305,$<tid>{r})>1', "Duplicate ID"),
            ('NOT(ISNUMBER($<date>{r}))', "Missing date"),
            ('$<h_acc>{r}=""', "Unknown account"),
            ('$<sec>{r}=""', "Missing security"),
            ('$<h_sec>{r}=""', "Unknown security"),
            ('$<h_type>{r}=""', "Unknown type"),
            ('AND($<gross>{r}="",$<type>{r}<>"Bonus / Split")', "No amount"),
            ('N($<gross>{r})<0', "Type a positive amount; the sign comes from the type"),
            ('N($<chg>{r})<0', "Type charges as a positive amount"),
            ('N($<date>{r})>ValDate', "Date after valuation"),
            ('AND(N($<date>{r})>PrevDate,COUNTIFS([H.acct],$<acct>{r},[H.sec],$<sec>{r})=0)',
             "No holding row (needed for Period Change)"),
        ]) + ')',
        "h_acc": '=IF($<acct>{r}="","",IFERROR(MATCH($<acct>{r},[A.id],0),""))',
        "h_sec": '=IF($<sec>{r}="","",IFERROR(MATCH($<sec>{r},[S.id],0),""))',
        "h_type": '=IF($<type>{r}="","",IFERROR(MATCH($<type>{r},L_TxnType,0),""))',
    }
    keys = ["tid", "date", "acct", "sec", "type", "qty", "price", "gross", "chg", "notes"]
    rows = [dict(zip(keys, demo.txn_units(t))) for t in demo.TXNS]
    return write_register(
        wb, "Transactions", TXNS,
        title="Transactions — dated money movements",
        subtitle="One row per buy, sell, SIP, capital call, distribution, dividend, interest, fee, "
                 "deposit or withdrawal. Type the amount as a positive number: its type decides "
                 "whether it is money out of or into the family. Charges and TDS go in their own "
                 "column. Money moved into or out of a bank account listed on Holdings is a "
                 "Deposit or Withdrawal on that bank row.",
        link="F1", rows=rows, formulas={k: fx(v, T) for k, v in f.items()}, tab=REG_TAB,
        freeze="G6",
        bands=[("tid", "sec", "IDS AND DATE — typed"), ("ent", "ac", "FROM THE MASTER DATA"),
               ("type", "chg", "THE MOVEMENT — typed"), ("net", "counts", "CASH TO THE FAMILY"),
               ("notes", "check", "NOTES AND CHECK")],
        totals=["gross", "chg", "net"],
        validations={"acct": ("L_AccountID", "Pick the account from the Accounts sheet."),
                     "sec": ("L_SecurityID", "Pick the security from the Securities sheet."),
                     "type": ("L_TxnType", "The type sets the cash sign and how the flow "
                                           "counts (Lists sheet).")})


def build_commitments(wb):
    f = {
        "ent": _lookup("A", "entname", "h_acc"),
        "fund": _lookup("S", "name", "h_sec"),
        "uncalled": '=IF($<comm>{r}="","",$<comm>{r}-N($<called>{r}))',
        "unpaid": '=IF($<called>{r}="","",$<called>{r}-N($<paid>{r}))',
        "pct": '=IF(OR($<comm>{r}="",N($<comm>{r})=0),"",N($<called>{r})/$<comm>{r})',
        "value": '=IF(OR($<acct>{r}="",$<sec>{r}=""),"",'
                 'IF(COUNTIFS([H.acct],$<acct>{r},[H.sec],$<sec>{r})=0,"",'
                 'SUMIFS([H.mv],[H.acct],$<acct>{r},[H.sec],$<sec>{r})))',
        "tvpi": '=IF(OR($<value>{r}="",N($<paid>{r})=0),"",'
                '($<value>{r}+N($<dist>{r}))/$<paid>{r})',
        "dpi": '=IF(OR($<dist>{r}="",N($<paid>{r})=0),"",$<dist>{r}/$<paid>{r})',
        "check": '=IF($<cid>{r}&$<acct>{r}&$<sec>{r}="","",' + chain([
            ('$<cid>{r}=""', "Missing ID"),
            ('COUNTIF($<cid>$6:$<cid>$35,$<cid>{r})>1', "Duplicate ID"),
            ('$<h_acc>{r}=""', "Unknown account"),
            ('$<h_sec>{r}=""', "Unknown security"),
            ('$<comm>{r}=""', "Missing commitment"),
            ('N($<called>{r})>N($<comm>{r})', "Called exceeds commitment"),
            ('N($<paid>{r})>N($<called>{r})', "Paid exceeds called"),
            ('AND(ISNUMBER($<ncdate>{r}),N($<ncamt>{r})>N($<uncalled>{r}))',
             "Next call exceeds the uncalled amount"),
            ('AND(N($<paid>{r})>0,$<value>{r}="")', "No holding row"),
        ]) + ')',
        "h_acc": '=IF($<acct>{r}="","",IFERROR(MATCH($<acct>{r},[A.id],0),""))',
        "h_sec": '=IF($<sec>{r}="","",IFERROR(MATCH($<sec>{r},[S.id],0),""))',
    }
    keys = ["cid", "acct", "sec", "cdate", "comm", "called", "paid", "dist", "ncdate", "ncamt",
            "notes"]
    rows = [dict(zip(keys, c)) for c in demo.COMMITS]
    return write_register(
        wb, "Commitments", COMMITS,
        title="Commitments — money promised to AIFs and private deals",
        subtitle="One row per commitment. Type what was committed, called, paid and distributed "
                 "to date; uncalled, TVPI and DPI are calculated, and the current value comes from "
                 "the Holdings row for the same account and security.",
        link="F1", rows=rows, formulas={k: fx(v, C) for k, v in f.items()}, tab=REG_TAB,
        freeze="F6",
        bands=[("cid", "sec", "IDS — typed"), ("ent", "fund", "FROM THE MASTER DATA"),
               ("cdate", "dist", "COMMITMENT — typed"), ("uncalled", "dpi", "WHERE IT STANDS"),
               ("ncdate", "ncamt", "NEXT CALL — typed"), ("notes", "check", "NOTES AND CHECK")],
        totals=["comm", "called", "paid", "dist", "uncalled", "unpaid", "value", "ncamt"],
        validations={"acct": ("L_AccountID", "Pick the account from the Accounts sheet."),
                     "sec": ("L_SecurityID", "Pick the security from the Securities sheet.")})
