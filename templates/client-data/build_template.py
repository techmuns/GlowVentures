"""Build the consolidated client-data template with its demo data.

    python build_template.py [output.xlsx]

Then recalculate (LibreOffice or Excel) so every formula carries a value.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpyxl import Workbook  # noqa: E402

from tpl_checks import build_checks  # noqa: E402
from tpl_holdings import build_holdings, build_lots  # noqa: E402
from tpl_lists import build_lists  # noqa: E402
from tpl_mapping import build_column_mapping  # noqa: E402
from tpl_master import build_accounts, build_entities, build_securities  # noqa: E402
from tpl_start import build_start  # noqa: E402
from tpl_txn import build_commitments, build_transactions  # noqa: E402
from tpl_view_basket import build_basket_allocation, build_basket_detail  # noqa: E402
from tpl_view_pa import build_investor_summary, build_portfolio_allocation  # noqa: E402
from tpl_view_period_tax import build_period_change, build_tax_summary  # noqa: E402


def build(out):
    wb = Workbook()
    build_start(wb)
    for step in (build_portfolio_allocation, build_basket_allocation, build_basket_detail,
                 build_investor_summary, build_period_change, build_tax_summary, build_checks,
                 build_holdings, build_lots, build_transactions, build_commitments,
                 build_entities, build_accounts, build_securities):
        step(wb)
    build_lists(wb)
    wb["Lists"].sheet_properties.tabColor = "808080"
    build_column_mapping(wb)
    wb.calculation.fullCalcOnLoad = True
    wb.save(out)
    return out


if __name__ == "__main__":
    print(build(sys.argv[1] if len(sys.argv) > 1 else "Consolidated_Client_Data_Template_DEMO.xlsx"))
