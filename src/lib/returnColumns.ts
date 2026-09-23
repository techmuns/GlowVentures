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
  calendar: "a calendar-year return needs its value at both ends of that year, and this book is not dated early enough to carry either.",
};

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
export function returnColumnMeta(measure: ReturnMeasure, cov: ReturnCoverage, asOf: string):
  { note: string; title: string } {
  const year = asOf.slice(0, 4);
  switch (measure) {
    case "cagr":
      return {
        // THE ANNUALISED COUNT, not `shown`: a sub-year holding is SHOWN in this
        // column and shown as its holding-period return, tagged HPR. Reporting
        // it as annualised would be the very claim the guard exists to refuse.
        note: `${cov.cagr} annualised of ${cov.total}`,
        title: `Annualised where a year can be measured — ${cov.cagr} of ${cov.total} rows.`
          + (cov.absolute > 0 ? ` ${cov.absolute} ${cov.absolute === 1 ? "row is" : "rows are"} held under a year and show their total return on cost instead, marked HPR, because annualising a part-year would state a rate for a year the holding has not seen.` : "")
          + (cov.absent > 0 ? ` ${cov.absent} report no purchase date the window could close over — the managed accounts publish a capital-account ledger rather than a lot register, and the depository holdings report no cost.` : ""),
      };
    case "ytd":
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: "YTD is the holding's own return this year, not the share's market move. "
          + (cov.shown > 0
              ? `It is measurable on ${cov.shown} of ${cov.total} rows — the holdings opened during the year, whose whole return since purchase IS their year to date. `
              : "No row can be measured on this drop. ")
          + `The other ${cov.absent} were already held on 1 January, and a year-to-date figure needs their value on that date: the earliest statement in this book is dated after the year began, so there is no opening value to measure from. One holdings statement per account dated on or before 1 January fills it.`,
      };
    case "xirr":
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: `A money-weighted XIRR needs every cash flow for a holding — each tranche's date and amount — and the statements here cover the current period only, so it is absent on all ${cov.total} rows. The per-account money-weighted return is on Performance.`,
      };
    case "calendar":
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: `A calendar-year return needs the holding's value at the start and end of that year, and the book's earliest statement is dated in ${year}, after the current year began — so it is absent on all ${cov.total} rows.`,
      };
    default:
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: `Holding Period Return is the total return on cost since purchase, not annualised. It is shown on ${cov.shown} of ${cov.total} rows`
          + (cov.absent > 0 ? `; the other ${cov.absent} report no cost, so there is nothing to strike a return against.` : "."),
      };
  }
}
