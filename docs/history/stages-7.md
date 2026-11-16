# Stage history — continuation

### Stage 10oi — Data Audit: the classification tie-out, with the Category axis (#374)

- The guarantee that every allocation axis sums to `BOOK_SUMMARY.totalValue` (stated at the head of `groupAxis.ts`) is now SHOWN, not only asserted in a test. A "Classification tie-out" panel on the Data Audit page carries one collapsible row per axis — Category, the family's Asset classes, Basket — each giving its group count, its total, a ✓/✗ against the book headline, and, expanded, every bucket adding up to that total. The Category axis is included; the earlier automatic tie-out left it out.
- It is not a second value model. It groups the EXACT deduped set the headline is summed from (`dedupedPositions(BOOK_POSITIONS)`, each `dedupeGroup` counted once, Polycab already ring-fenced out of `BOOK_POSITIONS`) and compares each axis sum to `BOOK_SUMMARY.totalValue` itself — so a mismatch would be a real classifier defect and a cross-check of the app's dedupe against the build's headline, not a rounding of ours. Raw sums are added before rounding, so the axis total is the same arithmetic as the headline.
- Any amount held under the family's "Not classified" section is NAMED (basket and asset class can carry one; the category axis is derived from the book and never does). Whole book, statement basis, reader's display currency — no member scope and no live quotes, exactly as the consolidated sheet above it. Guards the empty book with `AbsentSection`, since `/audit` is not behind the analytics `Gate`. Measured on this book: all three axes tie to ₹1,074.3 Cr, with ₹0 unclassified on both applicable axes.
- `src/components/ClassificationTieOut.tsx`, rendered between the consolidated sheet and the Sources footnote on `src/pages/DataAudit.tsx`.

### Stage 10oj — Portfolio Monitor: the default sort is shown on the header (#375)

- The equity names were cleaned long ago; what #375 still wanted was for the table to SAY which column it is sorted by on the first paint. The holdings table opens on its own ranking — largest total exposure on the security axis, largest market value on the others — but `view.sort` started null, so no header carried the arrow and no column was tinted, and a reader could not tell the order without clicking one.
- `useTableView` gains an opt-in `defaultSort`: with no saved sort it stands in, so the sorted column shows its arrow, carries `aria-sort`, and is tinted down its length from the first paint; the three-state click cycle turns on the sort the reader SEES, so clicking the default column flips it rather than re-asserting it, and clearing a sort lands back on the default — now labelled — rather than an unmarked order. Backward-compatible: every table that declares no default is unchanged.
- The Portfolio Monitor's holdings table declares it (`totalExposure` desc on the security axis, `mv` desc on the others — the same `effSort` ranking the rows already used). The row ORDER is unchanged: both fields are always finite, so a stable re-sort of the already-ranked list is the identity, verified against the baseline — `check:pages ONLY=monitor` is byte-for-byte the same (one pre-existing Sector finding, `zeroish=22 invariant=1 notchecked=4` either way) — and the interactive cycle (default → asc → default; another column → default) was driven in a browser. `src/lib/tableView.ts`, `src/pages/PortfolioMonitor.tsx`.

### Stage 10ok — Returns cards: the Consolidated-return coverage line matches the others (#413)

- The Returns tiles were compressed on 5 Nov (`periodCaption`: a minimal "N of M holdings · to <date>"), but one tile was missed. The History and FYTD cards used `periodCaption`; the **Consolidated return** (since-investment) tile still used `coveredCaption`, a busier two lines ending in "<value> covered · N accounts" — the count-on-the-face the audit flagged.
- The family asked (confirmed again here) for it to match the other two, so the Consolidated-return tile now uses `periodCaption`: "454 of 464 holdings · to <date>", consistent with History and FYTD. The value and the account coverage are not lost — they stay in the tile's ⓘ (the capital bridge, which already lists "N of M accounts covered"). `coveredCaption` and the orphaned `HoldingAssumptionInfo` import are removed; `periodCaption` already emits a superset of the `data-card-*` handles the checks read, so no invariant loses its hook.
- Whole book, statement basis. Verified: tsc, vite build and `test:family` green; `check:pages ONLY=cio` byte-for-byte identical to the baseline (`contrast=2 invariant=2 notchecked=1`, both pre-existing: the value tile's DL-11 and the gain card); and the tile was rendered in a browser to confirm the new caption shows a sensible count, not 0 of 0. `src/pages/MorningCIO.tsx`.

### Stage 10ol — The return picker offers CAGR again, off by default (#402)

- On 30 Oct the family agreed to drop the CAGR column because XIRR covers it (Stage 10jo). Yamini asked again on 5 Nov (#402) to see the holding-period return annualised as a CAGR, so the picker OFFERS it once more and a saved pick keeps it — but it is NOT a default column (`DEFAULT_RETURN_MEASURES` still omits it), so a reader's table is unchanged until they tick it. The guard is untouched: a sub-year holding shows absolute, a staggered purchase shows its HPR, and only one proven purchase annualises (`holdingReturn`, Stage 10fz). `src/lib/returnMeasures.ts`, `src/lib/__tests__/tableView.test.ts`.

### Stage 10om — Gold and silver are a Commodities asset class, not Alternate (#373)

- *"And why is gold sitting in alternate actually?"* — Yamini, 29 Oct 2026. The review workbook files the two bullion ETFs (DSP Gold, DSP Silver) on its Alternate sheet, and the taxonomy map keeps that citation so `familyTaxonomy.test.ts` still ties it to the workbook row. The family's own word is that gold and silver are their own commodity exposure, so — exactly as arbitrage funds are ruled Cash over the review's Debt (`cashByInstruction`) — these two are ruled Commodities over the review's Alternate, applied before the review hit. Only the asset class moves; their basket stays the review's Thematic & Tactical. A new `Commodities` member on `FamilyAssetClass` / `FAMILY_CLASS_ORDER`; named holdings, never inferred. `src/lib/familyTaxonomy.ts`, `src/lib/groupAxis.ts`.

### Stage 10on — Portfolio Monitor: no "Numbers unavailable · Retry" in the table toolbar

- *"what the hell is Numbers unavailable · Retry please remove"* — the family, 16 Nov 2026. The red line sat in the shared Export Excel toolbar (`ExportableTable`) whenever the background read of `/api/table-inputs` failed, including a refresh on window focus after the numbers had already loaded. It is gone. The index strip's saved-numbers notice (`EnteredNumbersNotice`) still reports a failed load and keeps its Retry; Edit numbers and Upload Excel, dimmed while the numbers load or after a failed read, carry the reason as their hover. `src/components/ExportableTable.tsx`.

### Stage 10oo — The index strip runs every benchmark as a TV-style ticker

- *"Add all benchmarks here and make it moving strip like they have in TV"* (16 Nov 2026). The strip now carries all seven
  benchmarks in `BENCHMARKS`: the family's four first, as they named them, then Nifty Next 50, Sensex and BSE 500
  (`TICKER_INDEX_IDS` in `IndexStrip.tsx`). The movers card's index tile keeps the four (`FAMILY_INDEX_IDS`).
- `/api/indices` reads the three new indices, each held to the name its upstream reports (measured 16 Nov 2026:
  "NIFTY NEXT 50", "S&P BSE SENSEX", "S&P BSE 500 INDEX"); edge cache key moved to v2. `indicesFunction.test.ts` holds
  the feed's list to `BENCHMARKS` on key, symbol and accepted names.
- The ticker is CSS (`.index-ticker` in `index.css`): two identical runs, each at least the strip's width, sliding by
  their own width, transform-only, linear, ~45 px/s (6 s per cell, never re-timed by a poll). Pauses under a fine
  pointer; stands still, one run, for reduced motion. The repeat run is `aria-hidden`. The saved-numbers notice takes at
  most 40% of the strip.
- `check:pages` (cio-live): every benchmark once, in order, each with a level; a hidden repeat run of the same width,
  both scrolling. Proved by cutting the ticker back to four.
