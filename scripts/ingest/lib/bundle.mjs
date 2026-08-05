// One PDF, several reports — splitting a bundle into the documents it contains.
//
// WHY THIS EXISTS. The archive is keyed by DOCUMENT: `<provider>-<account>-
// <asOf>-<reportType>`, and every reader in `providers/` is written against one
// report's layout. That works because most managers in this drop publish one
// report per file. Two do not:
//
//   Molecule_June_2026_392.pdf              8pp  fact sheet · CURRENT PORTFOLIO ·
//                                                transaction statement ·
//                                                capital gain · expense statement
//   GLC0780_510861_…ContractNote….pdf      15pp  PMS INVESTOR REPORT ·
//                                                capital gain · expense statement ·
//                                                corporate benefits
//
// Filed as ONE document each, the first title on page 1 wins and everything
// behind it is discarded. Molecule was read as a fact sheet, so its holdings
// arrived with a market value and NO quantity, NO unit cost and NO price —
// while pages 2–3 print all three. Green Lantern's bundle was read as a contract
// note, for which there is no reader, so 15 pages of a ₹11.69 Cr account
// contributed nothing at all and the coverage table said "no reader" about a
// document four readers in this repo already handle.
//
// Neither was a parse failure. Both extracted cleanly, reported `ok`, and were
// wrong — which is the failure mode this whole pipeline is built to make
// visible, so it gets a splitter rather than a special case.
//
// HOW THE SPLIT IS DECIDED. Every page of these statements reprints the
// letterhead and the report title. So the title region of each page names the
// report that page belongs to, a page with no title is a CONTINUATION of the one
// before it, and a run of pages sharing a title is a document.
//
// Two rules keep this from splitting things it shouldn't:
//
//   • The title is matched in the page's HEAD ONLY — the letterhead-and-title
//     region, the first `TITLE_LINES` lines. "Transaction Statement" also
//     appears in 360 ONE's table of contents and in the footnote SVAN prints
//     under its trade table ("…customarily included in the contract note of
//     broker"); neither names the page it sits on.
//   • A file whose pages resolve to FEWER THAN TWO distinct report types is not
//     a bundle and is returned untouched. Every single-report PDF in this drop
//     therefore takes exactly the path it took before this file existed.
import { REPORT_TYPES } from "./classify.mjs";

/**
 * Report titles as these statements print them, most specific first.
 *
 * Order is load-bearing where one title contains another: PORTFOLIO PERFORMANCE
 * APPRAISAL is a returns block, PORTFOLIO APPRAISAL is the holdings table, and
 * matching the shorter one first would file the returns report as holdings.
 */
export const REPORT_TITLES = [
  [/PMS\s+INVESTOR\s+REPORT/i, "investor-report"],
  [/PORTFOLIO\s+PERFORMANCE\s+APPRAISAL/i, "performance-history"],
  [/PORTFOLIO\s+PERFORMANCE\s+SUMMARY/i, "performance-summary"],
  [/PERFORMANCE\s+HISTORY/i, "performance-history"],
  [/STATEMENT\s+OF\s+CAPITAL\s+GAIN/i, "capital-gain"],
  [/CURRENT\s+PORTFOLIO/i, "holdings"],
  [/PORTFOLIO\s+APPRAISAL/i, "appraisal"],
  [/TRANSACTION\s+STATEMENT/i, "transaction-statement"],
  [/DIVIDEND\s+STATEMENT/i, "dividend-statement"],
  [/CAPITAL\s+REGISTER/i, "capital-register"],
  [/CORPORATE\s+BENEFITS/i, "corporate-benefits"],
  [/EXPENSE\s+STATEMENT/i, "expense-statement"],
  [/BANK\s+BOOK/i, "bank-book"],
  // The fact sheet titles itself by its two tables rather than by a banner.
  [/Portfolio\s+Holdings/i, "fact-sheet"],
];

/** How much of a page counts as its title region. */
const TITLE_LINES = 14;

/** The report a page announces itself as, or null for a continuation page. */
export function titleOf(pageText) {
  const head = String(pageText ?? "").split("\n").slice(0, TITLE_LINES).join("\n");
  for (const [re, type] of REPORT_TITLES) if (re.test(head)) return type;
  return null;
}

/**
 * Split one laid-out PDF into the reports it contains.
 *
 * Returns `null` when the file is not a bundle — fewer than two distinct report
 * titles across its pages — so the caller keeps its existing single-document
 * path. Otherwise returns one part per contiguous run of pages:
 *
 *   [{ reportType, fromPage, toPage, grid }, …]
 *
 * `grid` is the same shape `extractLayout` returns, carrying only that run's
 * pages, so every existing reader works on it unchanged.
 *
 * A leading run of untitled pages joins the FIRST titled run rather than
 * becoming a document of its own: a cover page belongs to the report it
 * introduces, and a document typed `unknown` would go to no reader at all.
 */
export function splitBundle(grid) {
  const pages = grid?.pages ?? [];
  if (pages.length < 2) return null;

  const titles = pages.map((p) => titleOf(p.text));
  if (new Set(titles.filter(Boolean)).size < 2) return null;

  const parts = [];
  for (let i = 0; i < pages.length; i++) {
    const t = titles[i];
    const last = parts[parts.length - 1];
    // A continuation page (no title of its own) extends the run it follows.
    if (!t && last) { last.pages.push(pages[i]); continue; }
    if (t && last && last.reportType === t) { last.pages.push(pages[i]); continue; }
    parts.push({ reportType: t, pages: [pages[i]] });
  }

  // Fold a leading untitled run into the report that follows it.
  if (parts.length > 1 && parts[0].reportType === null) {
    parts[1].pages = [...parts[0].pages, ...parts[1].pages];
    parts.shift();
  }

  return parts.map((p) => ({
    reportType: p.reportType,
    fromPage: p.pages[0].page,
    toPage: p.pages[p.pages.length - 1].page,
    grid: { ...grid, pages: p.pages, numPages: p.pages.length },
  }));
}

/**
 * A bundle part's report type must be one the rest of the pipeline knows —
 * precedence, the reconciler's coverage table and every reader dispatch key off
 * `REPORT_TYPES`. A title that resolved to something outside it would extract
 * into a document nothing reads and no check covers.
 */
export const isKnownReportType = (t) => REPORT_TYPES.includes(t);
