# Consolidated client-data template

`Consolidated_Client_Data_Template_DEMO.xlsx` is one standard workbook for
holding any client's portfolio data, whatever format the client keeps it in.
It combines the two example formats:

- **The Glow format** (the consolidated review). The template takes its views:
  asset class → category, the four baskets (SG, EG, LQ, TT), cost against
  market value and allocation, absolute and XIRR returns against a benchmark,
  the investor-by-category matrix, the month-on-month change, and the navy
  headers.
- **The other client's format** (a lot-level tax register). The template takes
  its tax detail: one row per purchase lot, the 31-Jan-2018 grandfathering,
  taxable gain, days left to become long-term, and dividend per share.

The workbook holds **demo data only**: a fictional family, fictional
securities and fictional figures. Nothing from either client's file is in it.
This folder does not touch the dashboard, and nothing in the app reads it.

## How it is laid out

| Tab colour | Sheets | What they are |
| --- | --- | --- |
| Navy | Start Here | Settings (client, valuation dates, display unit), the sheet index and how to use it |
| Gold | Portfolio Allocation, Basket Allocation, Basket Detail, Investor Summary, Period Change, Tax Summary | The views. Every figure is a formula over the registers; nothing is typed here except basket targets and the tax year |
| Green | Checks | Every view tied back to the registers, every register's own row check, missing data and capacity. Start Here shows the overall status |
| Amber | Holdings, Tax Lots, Transactions, Commitments | The registers a client's data is typed or pasted into |
| Blue | Entities, Accounts, Securities | Master data: who owns what, where it is held, what each security is |
| Grey | Lists, Column Mapping | Drop-down lists and the taxonomy; where each column comes from in the two source formats |

Conventions used throughout:

- Yellow cells with blue text are inputs. Grey cells are formulas.
- Registers hold **full rupees**. The views divide by the unit picked on Start
  Here (₹, lakh or crore).
- A figure nobody reported is left blank, never typed as 0.
- Every register row has a Row check column. The Checks sheet counts them.

## Loading a new client

1. Fill Entities, Accounts and Securities first. The registers pick from them.
2. Paste holdings, lots, transactions and commitments into the registers.
   Column Mapping says where each column comes from in either source format,
   and lists the fixes to make before loading.
3. Set the valuation dates and display unit on Start Here.
4. Open Checks. Share the views only when it reads **ALL CHECKS PASS**.

## Rebuilding the workbook

The workbook is generated. To change the layout, edit the `tpl_*.py` modules
and rebuild:

```
python build_template.py Consolidated_Client_Data_Template_DEMO.xlsx
```

The rebuilt file needs one recalculation (open it in Excel, or run
LibreOffice headless) before its formulas show values. With the demo data,
Checks reads "ALL CHECKS PASS · 6 note(s) to read". The six notes are
deliberate gaps in the demo: an undated bank balance, two older statements,
two older prices, old transactions, an unpaid capital call, and a lot that
turns long-term within 90 days.

| Module | Builds |
| --- | --- |
| `tpl_start.py` | Start Here |
| `tpl_view_pa.py` | Portfolio Allocation, Investor Summary |
| `tpl_view_basket.py` | Basket Allocation, Basket Detail |
| `tpl_view_period_tax.py` | Period Change, Tax Summary |
| `tpl_checks.py` | Checks |
| `tpl_holdings.py`, `tpl_txn.py` | Holdings, Tax Lots, Transactions, Commitments |
| `tpl_master.py` | Entities, Accounts, Securities |
| `tpl_lists.py`, `tpl_taxonomy.py` | Lists and the asset-class / category / basket taxonomy |
| `tpl_mapping.py` | Column Mapping |
| `tpl_schema.py`, `tpl_register.py` | Each register's columns, and how a register is written |
| `tpl_style.py`, `tpl_view_common.py` | Colours, fonts, number formats and shared view layout |
| `tpl_demo.py` | The fictional demo data |
