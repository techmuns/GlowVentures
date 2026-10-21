# September 2026 statement delivery — data audit

Verified 5 October 2026 against the connected Drive folder [NEW DATA GLOW VENTURES SEPTEMBER](https://drive.google.com/drive/folders/1ZgV8GsnHT2jmQqFmy90S8SbczqoOB-kW). Baseline: commit `3019fb401b8fc9f32f7a0212da448b2aa27e880a`.

## Result

All **27 files currently in the folder** were downloaded and matched by byte length and SHA-256 to the originals already committed under `source/september-2026/`. They comprise **17 PDFs (687 pages) and 10 XLSX workbooks (147,503 nonempty cells)**. Every file was extracted afresh, including the three encrypted AIF statements, and its financial facts compared with the archive. Spreadsheet cells were also read independently with openpyxl; none contained formulas or Excel error cells. The full file identities and hashes are in [the Drive manifest](september-2026-drive-audit.json).

The existing import already wires this delivery into the correct accounts. One extraction defect was found and repaired: **124 printed zero-TDS values** had become missing values in the two ASK dividend archives. On pages with a wholly blank Balance column, its header incorrectly took the adjacent TDS column. Requiring actual column overlap preserves the printed TDS, including nonzero values, while genuinely blank values remain missing. Exactly 62 fields per ASK account change from `null` to `0`; no monetary aggregate changes.

No UI, component, style, route, or dashboard calculation file changes. The generated book regenerates **byte-identically**, retaining 58 accounts, seven owners and statement-basis value **₹6,130,064,051.56**. This is a mixed-statement-date total, not an assertion of an October valuation. The dashboard's live prices and AMFI marks can produce a different total.

## Reconciliation controls

Amounts below are INR. Contributions and withdrawals cover each ASK account's inception through 8 September 2026; source withdrawals include the recorded tax transfers.

| Control | Ankita — ASK PMS 10032723 | Ajay — ASK PMS 10034025 |
| --- | ---: | ---: |
| Bank rows | 3,644 | 3,523 |
| Realised-gain lots | 1,101 | 1,041 |
| Dividend rows | 278 | 262 |
| Trades, including buybacks | 1,040 | 968 |
| Tax-transfer rows kept out of the trade tape | 195 | 232 |
| Contributions | 46,000,000.00 | 85,000,000.00 |
| Withdrawals, P&L and canonical capital movements | 85,383,320.61 | 151,211,941.19 |
| Closing cash | 0.01 | 0.34 |
| Gross dividends received | 1,197,629.52 | 1,955,242.11 |
| Dividend TDS | 11,152.10 | 22,052.84 |
| Net dividends | 1,186,477.42 | 1,933,189.27 |

- **96,391** date/numeric field comparisons across the eight dated spreadsheet exports match their PDF-derived records after the fix. All **7,167** bank running-balance steps reconcile within the source's printed-paise tolerance. The two P&L workbooks are covered by the existing PDF/XLSX witness checks and account capital controls.
- Owners, record dates, contribution/withdrawal totals, and short/long-term realised gains are checked against the generated dashboard book, not just the archived PDFs.
- **Buoyant BOUYA387 / 103472** belongs to Ankita: 31 August value **282,663,341.57**, carried investment cost **248,500,000.00**. **BOUYA388 / 103473** belongs to Ajay: value **503,276,370.81**, carried cost **460,058,861.66**. The class-switch values in the snapshots are correctly distinguished from original invested capital; they do not create new contributions or erase earlier gains.
- **ASK ARF 9039917111** is Ajay's first-holder account with Aarti as joint holder. The Aarti and ATJ deliveries represent the same folio and do not add another holding or redemption. Closing units and value are zero; net proceeds **208,039,138.56**, realised gain **8,039,138.56**. **9039917144** belongs to Ankita, also fully redeemed: net proceeds **193,908,505.71**, realised gain **5,908,505.71**. The AIF statements are dated **31 March 2026**, regardless of their later upload date.
- All 20 dividend statements in the archive were rerun with the old and corrected reader. Eighteen are completely unchanged; the only differences are the 124 fields described above.

## Source exceptions and scope limits

1. Ajay's ASK fact sheet prints withdrawals **151,212,091**, while its P&L and bank-based capital movement record give **151,211,941.19**, a **149.81** difference. The related fact-sheet profit difference is **149.48** with whole-rupee presentation. This is a disagreement between supplied reports, already recorded by reconciliation; no balancing transaction or invented adjustment has been added. The issuer must resolve it if exact agreement between those reports is required.
2. The full archive's unchanged extraction report has zero material row-total or holding-arithmetic discrepancies, but retains two older transaction-settlement differences outside this delivery: VEC 128005, SBFC buy on 30 July, **−1.77** (derived minus printed); Carnelian 3517383, Bandhan sell on 23 July, **+1.27**. These remain visible in [the extraction report data](extraction-report.json); the source settlement and derived arithmetic are retained separately. The dashboard trade builder already prefers the printed settlement for cash calculations (`settledOf` in `scripts/build-book.mjs`). This audit does not relabel the arithmetic differences as reconciled.
3. A statement only supports its printed period and scope. Mixed dates, missing valuation/cost inputs and incomplete opening-value/cash-flow histories elsewhere in the book remain subject to the dashboard's existing disclosure and return-coverage rules. This delivery does not supply the missing inputs for every account's whole-book annualised or year-to-date return. No return or valuation is invented to fill a blank.

## Validation

- The new required `septemberAudit` suite: **103,632 assertions pass**, including all source hashes, cell comparisons, account controls, fresh PDF extraction and mutations proving both a nonzero TDS and a genuinely blank TDS are handled correctly. Reintroducing the original reader reproduces the expected regression failures.
- `npm run test:ingest`, `npm run test:family`, and `npm run build` pass. Two pre-existing golden checks remain explicitly not checked; none is reported as passed.
- `npm run build-book`, `npm run report:extraction`, and `npm run coverage:source` reproduce the committed outputs without changes. Source coverage reports zero unread leaves.
- The local dashboard sweep covers **185 route/theme/width combinations** (light theme, 1500 px). No console errors, failed requests, overflow, contrast, or financial-invariant failures. One **existing CIO tile-heading layout invariant fails**, and 32 conditional invariants are not checked because their figures were not displayed. Layout is unchanged in accordance with the data-only request; this is not reported as an entirely green UI sweep.

## Every delivered file and its archive destination

PDF and XLSX witnesses share the same account; they do not double-count transactions. The two transaction PDFs are classified partial only because internal TDS transfers are deliberately excluded from security trades, with the bank records retained.

| Delivered file | Normalized archive document |
| --- | --- |
| Aarti J - ASK AIF - 9039917111_07042026142531008678.pdf | [ask-absolute-return-fund-9039917111-2026-03-31-holdings](../public/audit/ask-absolute-return-fund-9039917111-2026-03-31-holdings/document.json) |
| Ankita J - ASK AIF - 9039917144_07042026142545606454.pdf | [ask-absolute-return-fund-9039917144-2026-03-31-holdings](../public/audit/ask-absolute-return-fund-9039917144-2026-03-31-holdings/document.json) |
| askimpms_10032723_BankBook178CT.pdf | [ask-investment-managers-limited-10032723-2026-09-08-bank-book](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-bank-book/document.json) |
| askimpms_10032723_BankBook178CT.xlsx | [ask-investment-managers-limited-10032723-2026-09-08-bank-book-xlsx](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-bank-book-xlsx/document.json) |
| askimpms_10032723_CapitalGain90CT.pdf | [ask-investment-managers-limited-10032723-2026-09-08-capital-gain](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-capital-gain/document.json) |
| askimpms_10032723_CapitalGain90CT.xlsx | [ask-investment-managers-limited-10032723-2026-09-08-capital-gain-xlsx](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-capital-gain-xlsx/document.json) |
| askimpms_10032723_DividendStatement_India177CT.pdf | [ask-investment-managers-limited-10032723-2026-09-08-dividend-statement](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-dividend-statement/document.json) |
| askimpms_10032723_DividendStatement_India177CT.xlsx | [ask-investment-managers-limited-10032723-2026-09-08-dividend-statement-xlsx](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-dividend-statement-xlsx/document.json) |
| askimpms_10032723_PortFolioFactSheet6020CT.pdf | [ask-investment-managers-limited-10032723-2026-09-08-fact-sheet](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-fact-sheet/document.json) |
| askimpms_10032723_ProfitLossAccount1213CT.pdf | [ask-investment-managers-limited-10032723-2026-09-08-profit-and-loss](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-profit-and-loss/document.json) |
| askimpms_10032723_ProfitLossAccount1213CT.xlsx | [ask-investment-managers-limited-10032723-2026-09-08-profit-and-loss-xlsx](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-profit-and-loss-xlsx/document.json) |
| askimpms_10032723_TransactionStatement_India94CT.pdf | [ask-investment-managers-limited-10032723-2026-09-08-transaction-statement](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-transaction-statement/document.json) |
| askimpms_10032723_TransactionStatement_India94CT.xlsx | [ask-investment-managers-limited-10032723-2026-09-08-transaction-statement-xlsx](../public/audit/ask-investment-managers-limited-10032723-2026-09-08-transaction-statement-xlsx/document.json) |
| askimpms_10034025_BankBook178CT.pdf | [ask-investment-managers-limited-10034025-2026-09-08-bank-book](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-bank-book/document.json) |
| askimpms_10034025_BankBook178CT.xlsx | [ask-investment-managers-limited-10034025-2026-09-08-bank-book-xlsx](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-bank-book-xlsx/document.json) |
| askimpms_10034025_CapitalGain90CT.pdf | [ask-investment-managers-limited-10034025-2026-09-08-capital-gain](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-capital-gain/document.json) |
| askimpms_10034025_CapitalGain90CT.xlsx | [ask-investment-managers-limited-10034025-2026-09-08-capital-gain-xlsx](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-capital-gain-xlsx/document.json) |
| askimpms_10034025_DividendStatement_India177CT.pdf | [ask-investment-managers-limited-10034025-2026-09-08-dividend-statement](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-dividend-statement/document.json) |
| askimpms_10034025_DividendStatement_India177CT.xlsx | [ask-investment-managers-limited-10034025-2026-09-08-dividend-statement-xlsx](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-dividend-statement-xlsx/document.json) |
| askimpms_10034025_PortFolioFactSheet6020CT.pdf | [ask-investment-managers-limited-10034025-2026-09-08-fact-sheet](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-fact-sheet/document.json) |
| askimpms_10034025_ProfitLossAccount1213CT.pdf | [ask-investment-managers-limited-10034025-2026-09-08-profit-and-loss](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-profit-and-loss/document.json) |
| askimpms_10034025_ProfitLossAccount1213CT.xlsx | [ask-investment-managers-limited-10034025-2026-09-08-profit-and-loss-xlsx](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-profit-and-loss-xlsx/document.json) |
| askimpms_10034025_TransactionStatement_India94CT.pdf | [ask-investment-managers-limited-10034025-2026-09-08-transaction-statement](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-transaction-statement/document.json) |
| askimpms_10034025_TransactionStatement_India94CT.xlsx | [ask-investment-managers-limited-10034025-2026-09-08-transaction-statement-xlsx](../public/audit/ask-investment-managers-limited-10034025-2026-09-08-transaction-statement-xlsx/document.json) |
| ATJ - ASK AIF - 9039917111_07042026142531008678.pdf | [ask-absolute-return-fund-9039917111-2026-03-31-holdings-2](../public/audit/ask-absolute-return-fund-9039917111-2026-03-31-holdings-2/document.json) |
| Portfolio Snap Report_BOUYA387.pdf | [buoyant-capital-103472-2026-08-31-portfolio-snap](../public/audit/buoyant-capital-103472-2026-08-31-portfolio-snap/document.json) |
| Portfolio Snap Report_BOUYA388.pdf | [buoyant-capital-103473-2026-08-31-portfolio-snap](../public/audit/buoyant-capital-103473-2026-08-31-portfolio-snap/document.json) |
