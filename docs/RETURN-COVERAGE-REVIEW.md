# Return card coverage review — 4 November 2026

Morning CIO's **Return this financial year** card read **+20.0%** over "203 of 509
holdings · ₹167.3 Cr covered · 22 accounts assumed", and the family read it as broken.
This file records what the card actually measures, the method discussed with the
dashboard's operator on 4 Nov 2026, the figures that method gives, and six data
defects found on the way. **No app code changed.** Decisions on 4 Nov 2026: build the card
(preview first), hold the one-statement funds at their last value (rule 8), fix main's CI
(Stage 10kq) and fix the data defects in a separate change (Stage 10kp).

## What the card measures today

- `availableCardReturns(...).fytd` (`src/lib/availableCardReturns.ts`) pools only accounts
  with a verified return record: a valuation at the 31 Mar opening, complete dated capital,
  and a closing valuation. That is 20 accounts: ₹163 Cr at statement value, +19.8%.
  On the live basis it reaches +20.0%, because ~11 assumed holdings on Bharat's LKP 98245 and
  HDFC NSDL 22025655 statements (both dated 31 Mar) are added.
- **The holding count misleads.** 182 of the 192 statement-basis holdings sit in seven PMS
  mandates (Aristos ×2, Green Lantern ×2, V.E.C Assago ×2, Carnelian Bespoke). Some uncovered
  investments are single large lines, for example Sanshi at ₹204 Cr in five lines. By value
  the card covered ~13–15% of the book, not 40%.
- **"22 accounts assumed" is misleading.** "assumed" is `HoldingAssumptionInfo`'s label, and
  it applies to ~11 holdings, not to the 22 accounts.

## The method discussed (pending go-ahead)

Industry practice (performance start date / transfer in at market value) is to measure an
investment from the **first value on record**, treating that value as money arriving that
day, and to label it. The rules below follow that. Each window is pooled with
`measureWindow`, which applies Modified Dietz with each window weighted from its own opening.

| # | Treatment | Applies to | Evidence required |
|---|---|---|---|
| 1 | From the first of two statement values this FY | SVAN ×2 (30 Apr), Buoyant ×2 (31 Jul), Motilal Founders ×2 (31 Jul), Bandhan 8652064 (14 Oct), Molecule (30 Jun) | Units unchanged between the two statements, or every flow recorded |
| 2 | Statement count × public close / AMFI NAV from the statement date (assumed continued ownership, labelled) | Motilal demats ×5 (31 Jul), HDFC Securities (2 Nov), HDFC NSDL 22025655 and LKP 98245 (31 Mar), Kotak / Bandhan / Mirae folios | A dated count, and no later trade, movement or advised balance |
| 3 | Shares that arrived mid-year: money in at market value on the arrival date | Ajay's Indian Bank, IndusInd, Karur Vysya, RBL, City Union (25,117 of 104,400) on ICICI | Arrival date. 2 Jul is **assumed**: Ankita's Motilal tape credits all six banks on 2 Jul, and Ajay's order book shows City Union and Federal bought on 2 Jul. ICICI's NSDL transaction statement would confirm it |
| 4 | Newly listed: from the listing-day close (no market price exists before) | ESDS (NSE, 4 Sep, ₹908.40), Sotefin Bharat (BSE, 23 Jul, ₹215.25), NSE (BSE, 24 Sep, ₹1,818) | First exchange close. Pre-listing gain is not counted |
| 5 | Broker trades as cash flows | Ajay's ICICI order book (`orderBook_Equity_*.csv`, 24 Jun – 27 Oct): Smartworks, Insolation, Yash, Federal, Pine Labs, SBI | Units reconcile: 31 Mar count + trades = 31 Oct count |
| 6 | Sanshi: each folio's 30 Jun units × the class NAV printed on Ajay's 31 Oct ICICI demat statement (A2 ₹1,387.2, E ₹1,721.5) | All five folios | Ajay's units match the demat exactly. The others are **assumed** held since 30 Jun |
| 7 | Private kept on its own line: value plus gain since investment from the Private Market tab | `marketSide === 'private'`, ₹275 Cr, +₹12.6 Cr | The tab's IRR reads "—" today (1 of 8 funds lacks a dated record) |
| 8 | One-statement funds: held at the last statement value (0% since) until the next statement, which then counts the whole change. **Decided 4 Nov 2026** | Motilal Active Momentum (6 Aug, the purchase), Carnelian Amritkaal (31 Jul), Delphi (30 Jun) | The info button names each fund and the date it is held at |

The bar measures coverage against **public** investments only. Private is reported separately.

## Result (statement values and market closes to 3 Nov 2026, no live quotes)

| Group | Current value | Gain this FY |
|---|---:|---:|
| Verified from 31 Mar (today's card) | ₹163.1 Cr | +₹22.80 Cr |
| Two statements (rule 1) | ₹179.0 Cr | +₹0.03 Cr |
| ICICI shares: 31 Mar count × **30 Mar close** + broker trades (rules 5, 9 lines) | ₹44.8 Cr | +₹14.04 Cr (Yash +₹9.9 Cr, Clean Max +₹4.5 Cr) |
| ICICI SME shares from their true 20 Jul value (Grand Continent, Parth) | ₹5.4 Cr | −₹0.13 Cr |
| ICICI bank shares from 2 Jul (rule 3) | ₹9.2 Cr | +₹0.27 Cr |
| Newly listed from listing day (rule 4) | ₹84.2 Cr | +₹8.60 Cr (ESDS +₹8.3 Cr) |
| Sanshi ×5 (rule 6) | ₹204.5 Cr | +₹14.57 Cr |
| Funds at AMFI NAV from statement date (rule 2) | ₹145.4 Cr | −₹1.32 Cr |
| Shares at market close from statement date (rule 2) | ₹96.1 Cr | −₹3.07 Cr |
| **Headline** | **₹932 Cr of ₹992 Cr public (94%)** | **+₹55.8 Cr · +13.0%** |

- **With rule 8 as decided** (the three funds held at last value): **+12.3%** (12.34%, +₹55.8 Cr) on ₹981 Cr of ₹995 Cr public (99%), recomputed on main c89773d after that day's fund NAV refresh. Without them: +13.0% on 94%.
- Still not measurable: ₹61 Cr. Active Momentum ₹21 Cr, Carnelian Amritkaal ₹16 Cr,
  Delphi ₹11 Cr, VOF ₹4 Cr, plus ~₹8 Cr of Motilal liquid balances that changed on
  unknown dates and KRBL/Tega/Zota (see defect 2).
- How the figure moved during the review: +19.8% on ~13% → +8.9% on 31% → +11.6% on 84%
  (ICICI opening fixed) → +13.0% on 94%.
- The Nifty 500 comparison must be re-struck on the new dated money (`cardBenchmark.ts`).

## Data defects found (fix at the extractor or book, never in the page)

1. **ICICI 49794950, "Holding Statement Ajay Jaisinghani As on 31 March 2026"**
   (`source/august-2026-e/`). The quantities are 31 Mar, but every value equals the **20 Jul
   2026 close**: Clean Max ₹1,336.50, Smartworks ₹486.05, Insolation ₹119.11, Yash ₹906. The
   30 Mar closes were ₹769.70, ₹372.45, ₹82.18 and ₹417.80. The archive records
   `priceAsOn: 2026-03-30`, so `BOOK_ACCOUNT_NAV_HISTORY`'s 31 Mar point for the account (~₹119 Cr,
   Polycab included) inherits the wrong date, and that file's Sanshi NAV dates are unknown. The
   31 Oct statement is correct (it matches the 30 Oct close to the paisa). Value 31 Mar counts at
   the 30 Mar market close.
2. **MOPWM share rolls (`BOOK_SHARE_ROLLS`) do not give sale proceeds.**
   `costOfUnitsSold + realizedPnL` for Ankita's Axis 7,300 shares is ₹1.181 Cr (₹1,618 a share),
   against a 23 Sep close of ₹1,243.2 and Ajay's same-day ICICI sale at ₹1,246. SBI and ICICI
   Bank are off by the same ~1.3×, and IFB implies a purchase the roll does not carry. Never use
   rolls as dated cash flows.
3. **Clean Max 94,967 shares appear on two demats:** Ajay's ICICI (31 Oct, valued) and Ankita's
   Motilal 1201090012838316 (31 Jul depository-share candidate). Check for a double count on the
   live basis.
4. **NSE (INE721I01024) listed on 24 Sep 2026.** *Correction:* this is not a defect on the live
   screen. Since 22 Oct the live basis already prices both holdings at the BSE quote (see the review
   note). Only the statement basis keeps the review's 30 Jun unlisted mark (Ajay 125,000 shares
   ₹25.94 Cr, Ankita 75,000 ₹15.56 Cr), and it does so by design. The ICICI statement of 31 Oct marks
   Ajay's at ₹22.28 Cr, so the record says "A statement says otherwise". The calculation above used
   statement values, so NSE's covered value is the review mark there.
5. **VOF is Vantage Oak Fund I, Class A2 (INF2O4Z22020).** It is an AIF private placement,
   allotted 31 Jul (Ankita's tape: 1,225,000 units). Ajay holds 2,275,000 units, ₹4.10 Cr on
   ICICI. It has `marketSide: null` (unplaced) and needs the allotment amount.
6. **Grand Continent Hotels and Parth Electricals are NSE SME listings, not private.** Yahoo
   carries no history for `-SM` symbols, and NSE's API refuses scripted requests.

## Reproducing the numbers

- Price sources reachable from a cloud session:
  - Yahoo chart v8 (`SYMBOL.NS` / `.BO`, `events=div,splits`; `close` is split-adjusted, not dividend-adjusted).
  - Yahoo search (`/v1/finance/search?q=<ISIN or name>`).
  - AMFI `portal.amfiindia.com/spages/NAVAll.txt` (ISIN → scheme code).
  - `api.mfapi.in/mf/<code>` for NAV history.
- Probe pattern (as `scripts/test-family.mjs` does): bundle a `.ts` with esbuild,
  `--alias:@=src --packages=external`, into `node_modules/` (ignored), and call
  `availableCardReturns`, `windowReturns` and `measureWindow` on `glowData.ts`.
- A card struck this way must say which holdings are **assumed** (rules 2, 3 and 6) and which
  start late (rules 1–4), behind its info button.
