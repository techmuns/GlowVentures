# Motilal review columns and dashboard mapping

Source: `source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx`. This is byte-identical to the workbook supplied for this request. All 25 worksheets, including three hidden sheets, were inspected.

`Edit Columns` is shared by the dashboard's sortable tables. It saves visibility, order and sort per table in the existing browser preference store. Hiding a field changes its presentation only. The first identity column remains shown. New source fields start hidden; existing saved layouts migrate without losing their order. Reset returns to the original columns and order. Preferences persist in the same browser, not across devices.

Optional review fields are available on Portfolio Monitor, Private Market, Morning CIO allocation, Family & Entities, Sector Composition, holding and mandate drill-downs, security positions, performance accounts, and return contributors. Transaction, corporate-action, ledger, audit and other sortable tables can show/hide their existing columns. Static chronological financial statements retain their source structure.

| Worksheet | Audit result and available additions |
| --- | --- |
| Portfolio Allocation | Investment date/range, within-asset-class allocation, dividend/interest, active gain and review/index returns on matching summary rows. Gain including redeemed funds has an unspecified unit and is withheld. |
| Promoter Holding (hidden) | Quantity and source notes; dated ICICI/investor-release figures overlap the Polycab source views. No additional current promoter holding is inferred. |
| Live Equity Performance | Same summary fields as Portfolio Allocation; duplicate summaries are not added to live totals. |
| Asset Allocation | Effective and adjusted allocation percentages. Monetary adjusted/liquidity fields are withheld because the tab's “lakhs” label conflicts with the consolidated crores figures. |
| Stable Growth | Investment ranges, adviser, review investors, benchmark and source return figures for exact products; basket review cost/value. |
| Entrepreneruial Growth | Same product fields; aggregate private-equity row is not treated as another holding. |
| Thematic,Tactical | Same product fields and basket cost/value. |
| Liquid | Same product fields and basket cost/value. |
| Equity | Product dates, adviser/investor, benchmark, dividend/interest, allocation, review cost/value and source/index returns. Quantity already exists. |
| Month on Month Equity Change | May opening, June investment/redemption/income/closing/gain/return and benchmark fields on exact category matches. The worksheet's transaction-period caveat is retained. |
| Equity Quants | Scheme count and Nifty 50/500 weights for exact security matches; review sector and index weights for exact sector names. Broad source sectors are not forced into different dashboard sectors. |
| Attribution Analysis | Product May opening, June purchase/sale/closing/return/index/alpha and remarks. Sanshi's inconsistent previous valuation date is disclosed and its monthly comparisons withheld. |
| Sheet1 | Scratch/duplicate summary data; no independently attributable investment column. |
| Cash | Investment date/range, benchmark and source returns/cost/value. |
| Debt | Same product fields; commitment converted from its formula-confirmed lakhs unit, and older valuation caveats retained. Historical adviser plans remain labelled historical. |
| Alternate | Investment ranges, benchmarks, source return/cost/value/income; each stated older fund valuation date is retained. |
| Private Investments | All 87 investment dates/ranges, allocation, remarks and status. Exact days and month-only formats retain their source precision. |
| Investorwise Summary | Per-entity review total, private equity at cost, PE funds, unlisted equity, debt, cash and alternate values. These are June snapshot values, not replacements for current entity totals. |
| Transactions (hidden) | Existing transaction investor/adviser/product/date/units/rate/amount fields; historical records do not establish current holdings or date lots. |
| Private Equity Excl Pre IPO | Supplementary source remarks, including USD and lock-in notes, are attached to the exact private-investment record. No duplicate holding. |
| Pre IPO | IPO remarks/status enrich the exact private record. No duplicate holding. |
| Transactions since inception | Existing investor/adviser/asset class/category/product/type/date/quantity/rate/value fields. Purchases use the source's negative cash-flow convention. Not repooled into current book records. |
| Transactions all Asset class | Historical purchases/redemptions with differing block windows, including debt through 13 July. No forced June-wide merge. |
| Equity Scheme details | Fund manager, whole-fund AUM, style, regular/direct expenses, management fee, exit load and lock-in. Percent-formatted fees and plain-number expense percentages are distinguished. Whole-fund AUM is labelled separately from family investment value. |
| Plan of Action - Equity (hidden) | Optional historical adviser plan on exact product matches; source text is data and never an instruction to trade. |

Every imported cell carries its sheet/cell reference. Matching uses the review row identity, the existing audited family-taxonomy mapping, explicit scheme aliases, or exact normalized security keys. Ambiguous and incomplete matches display a dash with the reason; distinct products are never summed into a source field. Product-level review values describe the family investment and are labelled and dated separately from live/account values. They do not change any book calculation or footer total. Existing full-data Excel exports are independent of column visibility.

`npm run build-book` regenerates the source metadata through its postbuild hook. CI checks the generated file for drift and independently reads the workbook with SheetJS to verify amounts, units, date precision, source joins, known caveats and sorting. `npm run check:columns` exercises visibility, keyboard/pointer movement, reload/tab persistence, header/body/footer alignment and source dates in the built app.
