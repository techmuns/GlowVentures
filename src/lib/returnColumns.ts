// ── ONE COLUMN PER PICKED RETURN — THE HALF OF THE PICKER THAT IS NOT A CONTROL ─
//
// This lived in `PortfolioMonitor.tsx` for as long as that was the only table
// with a return-methodology picker. It is not any more:
//
//   *"Just like you have this return methodology in portfolio monitor we need to
//    have it in private market table as well. The customer is confused about
//    what kind of return this is that we're showing in the private market table."*
//
// Two tables that each expanded their own `return` placeholder, ranked their own
// return columns and worded their own aggregate refusals would be two chances to
// disagree about what "the CAGR column" means — the failure `holdingBucket`,
// `costCoversSet` and `companyExposure` were each extracted to prevent. So the
// mechanics are here, once, and each table supplies only what is genuinely its
// own: how ONE of its rows resolves a measure. The Monitor resolves a holding
// through `measuredReturn`; Private Market resolves a FUND through
// `fundMeasuredReturn`, which reads the dated capital calls a holding does not
// have — and both hand the result to the same accessors and the same headers.
import type { MeasuredReturn, ReturnCoverage, ReturnMeasure } from "./analytics";

/**
 * ── ONE RETURN COLUMN PER PICKED MEASURE ────────────────────────────────────
 *
 *   *"Whenever we select multiple return profiles to see on the dashboard it
 *   should add a new return column rather than show all returns in the same
 *   return column side by side — a new column with that return name should be
 *   made, and also removed when we select or deselect returns."*
 *
 * So `return` in a table's declared columns is a PLACEHOLDER, not a column: the
 * declared list expands it to one id per ticked measure, which is what makes
 * every mechanism in `useTableView` do the right thing for free. A column list
 * that grows and shrinks is exactly the case that hook already reconciles —
 * unknown ids dropped, new ones appended in declared order — so ticking a
 * measure adds a column a reader can sort and drag like any other, and
 * unticking it removes the column and leaves the rest where they were dragged to.
 *
 * `TrFoot`'s span and a table's column count are struck on the view's own column
 * count, so neither has to be told. Written as a literal the count goes wrong
 * SILENTLY: an expansion simply stops reaching the last column and nothing fails.
 */
export const withReturnCols = (cols: readonly string[], measures: readonly ReturnMeasure[]) =>
  cols.flatMap((c) => (c === "return" ? measures.map((m) => `ret:${m}`) : [c]));

/** The column id a measure is drawn under. */
export const returnColId = (m: ReturnMeasure) => `ret:${m}`;

/**
 * AND SORTING A RETURN COLUMN ORDERS ON THE FIGURE THAT COLUMN PRINTS, resolved
 * through the SAME function the cell draws — so the column a reader clicks and
 * the order they get cannot disagree about what a row's CAGR is. Reusing the
 * raw return on cost for all of them would leave the CAGR arrow ordering by the
 * return on cost, and the Monitor is where that lie is visible: one holding
 * annualises and the rest fall back to their absolute figure, so the two orders
 * genuinely differ.
 *
 * An absent return then sorts LAST in both directions, because `sortRows` does
 * that for every null — which is the rule these columns need and did not have
 * to restate.
 */
export const returnAccessorsFor = <T,>(
  measures: readonly ReturnMeasure[],
  resolve: (row: T, m: ReturnMeasure) => MeasuredReturn,
) =>
  Object.fromEntries(measures.map((m) => [returnColId(m), (r: T) => {
    const res = resolve(r, m);
    return res.shown ? res.pct : null;
  }])) as Record<string, (r: T) => number | null>;

/**
 * WHY AN AGGREGATE HAS NO SUCH RETURN — one sentence per measure, read by the
 * Monitor's category totals row and by its footer.
 *
 * Both print a CUMULATIVE ON COST figure and neither follows the measure picker:
 * a category and a whole book have no single purchase date to annualise over, no
 * per-holding cash-flow history to solve an XIRR against, and no dated opening
 * value for a year. With a column per measure that has to be SAID rather than
 * left as one figure under a header that could mean any of five things — so the
 * cumulative figure stands under HPR and under `auto`, and every other column
 * renders a dash carrying the reason from here.
 *
 * `auto` and `absolute` are absent from this table on purpose: those two ARE the
 * basis the aggregate is struck on, so asking it for a reason would be asking
 * why a figure it does have is missing.
 */
export const AGG_NO_MEASURE: Partial<Record<ReturnMeasure, string>> = {
  cagr: "annualising needs one purchase date and this holds many, bought over years, so a CAGR here would compound a window nothing was held over.",
  xirr: "a money-weighted return needs every dated cash flow of the thing it measures, and no statement reports those per category.",
  ytd: "a year-to-date figure needs this category's value on 1 January, and the earliest statement in this book is dated after the year began.",
};

/**
 * ── WHY A RETURN CELL IS BLANK, IN A FEW WORDS (Stage 10jh) ─────────────────
 *
 *   *"in the blank you can simple write - No buy/sell date"* — the family.
 *
 * A dash alone read as a broken feed. The cell now names its cause in a few
 * words; the full reason stays its hover. Read off the reason `measuredReturn`
 * gives, most specific cause first.
 */
const GAP_LABELS: [RegExp, string][] = [
  [/prices are still loading/i, "Loading prices"],
  [/sale proceeds|sale amount|proceeds are unverified/i, "Sale amount missing"],
  [/no statement values the units it holds now/i, "No statement value"],
  [/sale after its statement|newer holding statement|later sales/i, "Needs newer statement"],
  [/different dates/i, "Valued on different dates"],
  // YTD's own cause leads its cells: the value it would start from is missing.
  [/1 January/i, "No 1 Jan value"],
  [/held at cost|only the purchase cost|dated valuation from the company or fund|no statement values (this|it)/i, "No valuation"],
  [/no statement in this book reports a cost|purchase cost is missing|no cost/i, "No cost"],
  [/only through funds|derived/i, "Held via funds"],
  [/holds nothing|nil balance/i, "Holds nothing"],
  [/total loss/i, "Total loss"],
  [/several dates|several purchases|bought on several dates|partly sold|money-weighted rate for this row is XIRR/i, "Several buys — see XIRR"],
  [/do not solve|do not yield/i, "No solution"],
  [/later trades|does not reach|reaches inception|record ends|before the .* statement|understated|settled amount|carries no date/i, "Dates incomplete"],
  [/purchase date|when this holding was bought|no dated|every cash flow|dated payments|dated record|dated trades|capital is known only as a total/i, "No buy/sell dates"],
];
export const returnGapLabel = (reason: string | null | undefined): string =>
  GAP_LABELS.find(([re]) => re.test(reason ?? ""))?.[1] ?? "Not available";

/**
 * ── WHAT A RETURN COLUMN COVERS, AND WHY IT COVERS NO MORE ────────────────
 *
 *   *"remove the highlighted text from the dashboard UI."*
 *
 * The five paragraphs this replaces sat under the Monitor's table, one per
 * ticked measure, and each was audited before it went. Every one made TWO
 * claims: a COUNT of how much of the table its measure can answer, and the
 * REASON the rest is absent.
 *
 *   • the REASON already survives per row — `measuredReturn` returns it and the
 *     cell renders an `AbsentCell` carrying it, which is the stronger statement
 *     because it is about the row the reader is looking at;
 *   • the COUNT was stated NOWHERE ELSE, and it is the one a reader acts on: a
 *     column of dashes with nothing saying why reads as a broken feed rather
 *     than as a measurement this book cannot strike.
 *
 * So the count rides in the column header's own note and the reason in its
 * hover — which is where this book puts a claim about a column. Returned as ONE
 * object so the short note and the sentence behind it cannot describe different
 * sets.
 *
 * THESE SENTENCES ARE ABOUT HOLDINGS, which is why the Private Market fund table
 * does not use them: "the statements here cover the current period only" is true
 * of a share in a demat and FALSE of a drawdown fund, whose statement prints
 * every dated call since its first. That table words its own headers from its
 * own resolution (`fundReturnColumnMeta`), on the same coverage object.
 *
 * `auto` gets neither: its measure resolves per row, so there is no column-wide
 * count to state and the tag on every cell is what names it.
 */
export function returnColumnMeta(measure: ReturnMeasure, cov: ReturnCoverage, asOf: string, fundOnlyRows = 0):
  { note: string; title: string } {
  const meta = holdingColumnMeta(measure, cov);
  return fundOnlyRows > 0
    ? { ...meta, title: `${meta.title} Counted over the ${cov.total} rows the statements report: the other ${fundOnlyRows} are companies the family reaches only through funds, which have no cost or value of the family's own.` }
    : meta;
}

function holdingColumnMeta(measure: ReturnMeasure, cov: ReturnCoverage): { note: string; title: string } {
  switch (measure) {
    case "cagr":
      return {
        // THE ANNUALISED COUNT, not `shown`: a sub-year holding is SHOWN in this
        // column and shown as its holding-period return, tagged HPR. Reporting
        // it as annualised would be the very claim the guard exists to refuse.
        note: `${cov.cagr} annualised of ${cov.total}`,
        title: `Annualised where a year can be measured — ${cov.cagr} of ${cov.total} rows.`
          + (cov.absolute > 0 ? ` ${cov.absolute} ${cov.absolute === 1 ? "row is" : "rows are"} held under a year and show their total return on cost instead, marked HPR, because annualising a part-year would state a rate for a year the holding has not seen.` : "")
          // A WHOLE ACCOUNT FUNDED OVER SEVERAL DATED PAYMENTS is refused here
          // for a different reason from a holding with no date, and has its
          // annual rate one column over — so it is counted apart rather than
          // filed under "no purchase date", which would send a reader looking
          // for a document the row does not need.
          + (cov.staggered > 0 ? ` ${cov.staggered} ${cov.staggered === 1 ? "row is a whole account" : "rows are whole accounts"} funded over several dated payments: a single-start compound rate would treat every rupee as invested on the first date, so ${cov.staggered === 1 ? "its" : "their"} annual rate is in the XIRR column.` : "")
          // A DATED HOLDING BOUGHT IN LOTS, OR PARTLY SOLD (Stage 10fz), is
          // refused because its start is the oldest unit's, not one purchase's —
          // counted apart for the same reason the staggered accounts are.
          + (cov.lotted > 0 ? ` ${cov.lotted} ${cov.lotted === 1 ? "holding was" : "holdings were"} bought on several dates or partly sold, so the oldest unit's date does not start one purchase and a single-start compound rate would misstate ${cov.lotted === 1 ? "it" : "them"}; ${cov.lotted === 1 ? "its" : "their"} Holding Period Return stands.` : "")
          + (cov.absent - cov.staggered - cov.lotted > 0 ? ` ${cov.absent - cov.staggered - cov.lotted} report no purchase date the window could close over — the managed accounts publish a capital-account ledger rather than a lot register, and the depository holdings report no cost.` : ""),
      };
    case "ytd": {
      // FROM THE FIRST DATE WE HAVE (Stage 10jg): a row with no 1 January
      // value is measured from its first dated value this year, tagged with it.
      const full = cov.shown - cov.partYear;
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: "YTD is the holding's own return this year, not the share's market move. "
          + (full > 0 ? `${full} ${full === 1 ? "row is a full year to date" : "rows are a full year to date"} — opened during the year, so the whole return since purchase is the year to date. ` : "")
          + (cov.partYear > 0
              ? `${cov.partYear} ${cov.partYear === 1 ? "row is" : "rows are"} measured from the first date this year with a dated value, and tagged with that date: no statement here values a holding on 1 January, so it is not a full year to date, and it is not annualised. A whole account reads its verified return record (opening value and dated money, Modified Dietz); a listed share or growth fund is carried from its statement's own balance at published closing prices, assumed still held. `
              : "")
          + (cov.absent > 0
              ? `The other ${cov.absent} have neither a value on 1 January nor a dated value later this year to start from; each dash names what is missing.`
              : ""),
      };
    }
    case "xirr": {
      // THE COUNT IS OF RATES, not of cells shown: a whole account whose
      // payments span under a year is SHOWN here as its holding-period return,
      // tagged HPR, and calling that money-weighted would be the claim the
      // guard exists to refuse.
      const fallback = cov.shown - cov.xirr;
      return {
        note: `${cov.xirr} money-weighted of ${cov.total}`,
        title: (cov.xirr > 0
          ? `A money-weighted XIRR on ${cov.xirr} of ${cov.total} rows — each a whole account, or a fund over its whole folios, whose every payment in and out is dated, solved over the same record the Transactions card uses; or a holding whose every unit its account's dated trades or lot register account for, solved over its own purchases, sales and dividends.`
          : `A money-weighted XIRR needs every dated payment behind a row, and no row here is a whole account with every payment on record or a holding whose every purchase is dated.`)
          + (fallback > 0 ? ` ${fallback} ${fallback === 1 ? "row is" : "rows are"} funded under a year ago and show ${fallback === 1 ? "its" : "their"} holding-period return instead, marked HPR, because annualising a part-year would state a rate for a year the money has not seen.` : "")
          + (cov.absent > 0 ? ` The other ${cov.absent} are holdings whose dated trades do not account for every unit they hold, or accounts whose payments are not all on record — each cell says which. The per-account money-weighted return, where one can be struck, is on Performance.` : ""),
      };
    }
    default:
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: `Holding Period Return is the total return on cost since purchase, not annualised. It is shown on ${cov.shown} of ${cov.total} rows`
          + (cov.absent > 0 ? `; the other ${cov.absent} have no verified holding-period return; each cell names the missing cost or transaction evidence.` : "."),
      };
  }
}
