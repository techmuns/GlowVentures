"""Master data: Entities (who), Accounts (where), Securities (what).

Every register below refers to these by ID, so a name is typed once and a
renamed scheme or a corrected category reaches every view.
"""
import tpl_demo as demo
from tpl_register import write_register
from tpl_schema import ACCOUNTS, ENTITIES, SECURITIES

MASTER_TAB = "5B9BD5"


def build_entities(wb):
    keys = [k for k, *_ in ENTITIES if k != "check"]
    rows = [dict(zip(keys, e)) for e in demo.ENTITIES]
    formulas = {
        "check": ('=IF($A{r}&$B{r}="","",IF($A{r}="","Missing ID",'
                  'IF(COUNTIF($A$6:$A$25,$A{r})>1,"Duplicate ID",'
                  'IF($B{r}="","Missing name",IF($C{r}="","Missing short name","OK")))))'),
    }
    return write_register(
        wb, "Entities", ENTITIES,
        title="Entities — the family's taxpayers",
        subtitle="One row per person, HUF, trust, company or LLP. The short name heads the "
                 "Investor Summary columns. Store PANs masked (XXXXX1234X), never in full.",
        link="E1", rows=rows, formulas=formulas, tab=MASTER_TAB, freeze="B6",
        bands=[("id", "short", "WHO"), ("type", "notes", "DETAILS"), ("check", "check", "CHECK")],
        validations={"type": ("L_EntType", "Individual, HUF, Trust, Company, LLP or Firm."),
                     "res": ("L_Residency", None)},
        wrap_header=False)


def build_accounts(wb):
    rows = []
    for (aid, ent, typ, prov, adv, strat, acno, asof) in demo.ACCOUNTS:
        rows.append({"id": aid, "ent": ent, "type": typ, "provider": prov, "adv": adv,
                     "strategy": strat, "acno": acno, "asof": asof, "ccy": "INR", "notes": ""})
    formulas = {
        "entname": '=IF($M{r}="","",INDEX(Entities!$B$6:$B$25,$M{r})&"")',
        "check": ('=IF($A{r}&$B{r}="","",IF($A{r}="","Missing ID",'
                  'IF(COUNTIF($A$6:$A$55,$A{r})>1,"Duplicate ID",'
                  'IF($M{r}="","Unknown entity",IF($D{r}="","Missing type",'
                  'IF(AND(ISNUMBER($I{r}),$I{r}>ValDate),"As-of after valuation","OK"))))))'),
        "h_ent": '=IF($B{r}="","",IFERROR(MATCH($B{r},Entities!$A$6:$A$25,0),""))',
    }
    return write_register(
        wb, "Accounts", ACCOUNTS,
        title="Accounts — where each holding sits",
        subtitle="One row per demat, PMS, AIF folio, MF folio, bank account or wealth platform. "
                 "The as-of date is the date of that provider's latest statement.",
        link="E1", rows=rows, formulas=formulas, tab=MASTER_TAB, freeze="B6",
        bands=[("id", "entname", "WHOSE"), ("type", "acno", "WHERE IT IS HELD"),
               ("asof", "notes", "STATEMENT"), ("check", "h_ent", "CHECK")],
        validations={"ent": ("L_EntityID", "Pick the entity ID from the Entities sheet."),
                     "type": ("L_AcctType", None)})


def build_securities(wb):
    keys = ["id", "name", "isin", "code", "cat", "bov", "sector", "mcap", "benov", "listed",
            "basis", "price", "pdate", "gf", "notes"]
    rows = [dict(zip(keys, s)) for s in demo.SECURITIES]
    formulas = {
        "ac": '=IF($T{r}="","",INDEX(L_CatAsset,$T{r})&"")',
        "basket": ('=IF($A{r}="","",IF($G{r}<>"",$G{r},'
                   'IF($T{r}="","",INDEX(L_CatBasket,$T{r})&"")))'),
        "bench": ('=IF($A{r}="","",IF($K{r}<>"",$K{r},'
                  'IF($T{r}="","",INDEX(L_CatBench,$T{r})&"")))'),
        "check": ('=IF($A{r}&$B{r}="","",IF($A{r}="","Missing ID",'
                  'IF(COUNTIF($A$6:$A$105,$A{r})>1,"Duplicate ID",'
                  'IF($B{r}="","Missing name",IF($T{r}="","Unknown category",'
                  'IF(AND(OR($N{r}="Market price",$N{r}="NAV"),$O{r}=""),"No price",'
                  'IF(AND(ISNUMBER($P{r}),$P{r}>ValDate),"Price after valuation","OK")))))))'),
        "h_cat": '=IF($E{r}="","",IFERROR(MATCH($E{r},L_Category,0),""))',
    }
    return write_register(
        wb, "Securities", SECURITIES,
        title="Securities — the master list of what the family holds",
        subtitle="One row per share, scheme, fund, bond or bank balance. Its category decides "
                 "asset class, basket and benchmark; override basket or benchmark only where "
                 "the family treats it differently.",
        link="F1", rows=rows, formulas=formulas, tab=MASTER_TAB, freeze="C6",
        bands=[("id", "code", "WHAT IT IS"),
               ("cat", "bench", "CLASSIFICATION (from the category, see Lists)"),
               ("listed", "gf", "VALUATION"), ("notes", "h_cat", "NOTES AND CHECK")],
        validations={
            "cat": ("L_Category", "The category decides asset class, basket and benchmark."),
            "bov": ("L_BasketCode", "Leave blank to use the category's basket."),
            "mcap": ("L_MCap", None), "listed": ("L_YN", None),
            "basis": ("L_Basis", "Market price or NAV: typed below. Statement value: the "
                                 "holding's own value. At cost: shown at invested cost."),
        })
