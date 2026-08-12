// PARSE THE FINANCIAL TABLES THE DATA SERVICE ALREADY SENDS.
//
// `/api/research?kind=financials` returns a markdown document scraped from
// screener.in. It was passed through to the page verbatim and nothing computed
// against it, on the stated grounds that the research endpoints "return PROSE
// and it stays prose".
//
// THAT RULE IS RIGHT, AND IT IS ABOUT A DIFFERENT ENDPOINT. `ratio_source`
// genuinely returns prose — probed against the live API it answers with a
// moneycontrol URL and the words "Use WebReader Tool", and nothing in it says
// which number is which company's PE. Mining a figure out of that would be
// inventing a mapping.
//
// The financials document is not that. Measured on 2026-08-11, five of its
// eight sections are MARKDOWN PIPE TABLES labelled on both axes:
//
//     | | Mar 2015 | Mar 2016 | … | Mar 2026 | TTM |
//     | Revenue + | 2,710 | 3,645 | … | 45,513 | 48,186 |
//
// A column header says which period it is and a row label says which line item.
// Reading that is reading a table, not guessing at a sentence — and it is the
// same discipline `scripts/ingest/lib/table.mjs` already applies to the
// statement PDFs: MATCH ON HEADER TEXT, NEVER ON COLUMN INDEX, so a layout
// change surfaces as "column not matched" instead of as wrong figures.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
//
// It does not normalise line items across companies. ABCAPITAL is a lender and
// its P&L reads Revenue / Interest / Financing Profit / Financing Margin %;
// a manufacturer's reads Sales / Operating Profit / OPM %. Mapping both onto a
// house schema called "EBITDA" would be exactly the fabricated classification
// this book refuses elsewhere — so the row labels are kept AS THE SOURCE PRINTS
// THEM, and a caller asking for a line the company does not report gets null
// rather than a substitute.
//
// It also computes nothing the table does not support. A CAGR needs a first and
// last value and the number of years between them; where a period column is
// "TTM" rather than a year, it is excluded from that arithmetic, because a
// trailing-twelve-month figure is not a year-end and averaging it in silently
// shortens the window.

export type Period = {
  /** The column header exactly as printed — "Mar 2015", "Jun 2026", "TTM". */
  label: string;
  /** Calendar year, when the header names one. Null for TTM and anything odd. */
  year: number | null;
  /** Month number 1-12 when the header names a month. */
  month: number | null;
  /** True for the trailing-twelve-month column, which is not a period end. */
  ttm: boolean;
};

export type FinancialRow = {
  /**
   * The row label as printed, with whitespace normalised — screener separates
   * its expand/collapse marker with a NON-BREAKING space ("Revenue\u00a0+"), and
   * leaving that in makes every downstream label comparison fail against a
   * string a human would type.
   */
  label: string;
  /**
   * Every column's raw text, including the first.
   *
   * Needed because the label column is not always column 0: Peer Comparison
   * puts a serial number there and the company NAME in column 1. A consumer of
   * that table reads `text[1]` rather than `label`, and nothing has to guess.
   */
  text: string[];
  /** One value per period, aligned to `periods`. Null where the cell is blank. */
  values: (number | null)[];
  /** True when the printed cells carry a % sign, so a caller does not treat it as money. */
  percent: boolean;
};

export type FinancialTable = {
  /** The `##` heading, e.g. "Profit & Loss". */
  name: string;
  periods: Period[];
  rows: FinancialRow[];
};

export type FinancialDoc = {
  tables: FinancialTable[];
  /** Sections that were NOT pipe tables — Pros & Cons, About, Stock details. */
  prose: { name: string; text: string }[];
  /** Key/value pairs from the "Stock details" block, kept as printed. */
  stockDetails: { label: string; value: string }[];
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * A period column header.
 *
 * "TTM" is flagged rather than dropped: it is a real column a reader wants to
 * see, and it must simply never be treated as a year end.
 */
export function parsePeriod(raw: string): Period {
  const label = raw.trim();
  if (/^ttm$/i.test(label)) return { label, year: null, month: null, ttm: true };
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(label);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()] ?? null;
    return { label, year: Number(m[2]), month: mon, ttm: false };
  }
  const y = /^(\d{4})$/.exec(label);
  if (y) return { label, year: Number(y[1]), month: null, ttm: false };
  return { label, year: null, month: null, ttm: false };
}

/**
 * A printed cell.
 *
 * A BLANK OR A DASH IS NOT ZERO. screener prints an empty cell where a company
 * does not report a line — Gross NPA % on a non-lender, for instance — and
 * reading that as 0 would put a measured-looking zero into a chart.
 */
export function parseCell(raw: string): { value: number | null; percent: boolean } {
  const t = (raw ?? "").trim();
  if (!t || t === "-" || t === "—" || /^n\.?a\.?$/i.test(t)) return { value: null, percent: false };
  const percent = t.includes("%");
  // Indian grouping, a trailing %, and parenthesised or leading-minus negatives.
  const neg = /^\(.*\)$/.test(t);
  const cleaned = t.replace(/[(),%\s₹]/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return { value: null, percent };
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { value: null, percent };
  return { value: neg ? -n : n, percent };
}

/**
 * Split one markdown pipe row into its cells, dropping the outer delimiters.
 *
 * Non-breaking spaces are folded to ordinary ones here, once, so no consumer has
 * to know the scrape uses them.
 */
function cellsOf(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.replace(/\u00a0/g, " ").trim());
}

const isSeparator = (line: string) => /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes("-");

/**
 * Parse the whole markdown document into tables, prose and the stock-details
 * key/values.
 *
 * A section that is not a pipe table is kept as prose rather than discarded —
 * Pros & Cons and About are the parts a reader most wants in the source's own
 * words, and this book does not paraphrase a source.
 */
export function parseFinancials(markdown: string): FinancialDoc {
  const tables: FinancialTable[] = [];
  const prose: { name: string; text: string }[] = [];
  const stockDetails: { label: string; value: string }[] = [];
  if (!markdown) return { tables, prose, stockDetails };

  // Split on `##` headings, keeping each section's own body.
  const parts = markdown.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const name = (nl < 0 ? part : part.slice(0, nl)).trim();
    const body = nl < 0 ? "" : part.slice(nl + 1);
    const lines = body.split("\n");
    const pipes = lines.filter((l) => l.trim().startsWith("|"));

    if (pipes.length >= 3) {
      const header = cellsOf(pipes[0]);
      // The first column is the row-label column and carries no period.
      const periods = header.slice(1).map(parsePeriod);
      const rows: FinancialRow[] = [];
      for (const line of pipes.slice(1)) {
        if (isSeparator(line)) continue;
        const cs = cellsOf(line);
        const label = cs[0];
        if (!label) continue;
        let percent = false;
        const values = periods.map((_p, i) => {
          const c = parseCell(cs[i + 1] ?? "");
          if (c.percent) percent = true;
          return c.value;
        });
        rows.push({ label, text: cs, values, percent });
      }
      if (rows.length) { tables.push({ name, periods, rows }); continue; }
    }

    const text = body.trim();
    if (!text) continue;
    if (/^stock details$/i.test(name)) {
      // Printed as "**Market Cap**: ₹ 1,11,347 Cr." style lines, or as a bare
      // label/value pair per line. Kept VERBATIM — the unit is part of the
      // figure and reformatting it is how a crore becomes a rupee.
      for (const line of text.split("\n")) {
        const m = /^[-*\s]*\*{0,2}([^:*]+?)\*{0,2}\s*[::]\s*(.+)$/.exec(line.trim());
        if (m && m[1].trim() && m[2].trim()) stockDetails.push({ label: m[1].trim(), value: m[2].trim() });
      }
      if (stockDetails.length) continue;
    }
    prose.push({ name, text });
  }
  return { tables, prose, stockDetails };
}

// ── Reading a parsed table ──────────────────────────────────────────────────

/** A table by name, case-insensitively. Null when the document has no such section. */
export const tableNamed = (doc: FinancialDoc, name: string): FinancialTable | null =>
  doc.tables.find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? null;

/**
 * A row by label.
 *
 * MATCHED ON THE LABEL THE SOURCE PRINTS, with a light normalisation for the
 * trailing "+" screener appends to expandable rows ("Revenue +"). No fuzzy
 * matching and no synonyms: "Sales" and "Revenue" are different labels and a
 * caller that wants either must ask for both, so a company reporting neither
 * gets null instead of the closest-looking line.
 */
export function rowNamed(table: FinancialTable | null, label: string): FinancialRow | null {
  if (!table) return null;
  // screener appends "+" to an expandable row and "-" to a collapsible one
  // ("Revenue +", "Promoters -"). Both are UI furniture, not part of the name.
  const norm = (s: string) => s.replace(/[\s\u00a0]*[+-][\s\u00a0]*$/, "").trim().toLowerCase();
  const want = norm(label);
  return table.rows.find((r) => norm(r.label) === want) ?? null;
}

/** The first row whose label matches any of `labels`, in the order given. */
export function rowAny(table: FinancialTable | null, labels: string[]): FinancialRow | null {
  for (const l of labels) {
    const r = rowNamed(table, l);
    if (r) return r;
  }
  return null;
}

export type SeriesPoint = { period: Period; value: number };

/**
 * A row as (period, value) pairs, dropping periods with no value.
 *
 * `includeTtm` defaults to FALSE. A trailing-twelve-month column is not a period
 * end, and letting it into a growth calculation silently compares a TTM figure
 * against a year end.
 */
export function seriesOf(row: FinancialRow | null, periods: Period[], includeTtm = false): SeriesPoint[] {
  if (!row) return [];
  const out: SeriesPoint[] = [];
  periods.forEach((p, i) => {
    if (p.ttm && !includeTtm) return;
    const v = row.values[i];
    if (typeof v === "number") out.push({ period: p, value: v });
  });
  return out;
}

/**
 * Compound annual growth between the first and last point of a series.
 *
 * NULL RATHER THAN A NUMBER in every case where the arithmetic would be a lie:
 *
 *   • fewer than two points — there is no growth between one observation
 *   • a span under a year — a CAGR over 4 months is a wildly annualised quarter
 *   • a start at or below zero — a company that went from a loss to a profit has
 *     no meaningful compound rate, and the formula returns a confident number
 *     for it (or NaN), which is worse than an absence
 *
 * The last of those is the one that matters here: several of this book's
 * holdings have a loss-making year in their history.
 */
export function cagrPct(series: SeriesPoint[]): number | null {
  if (series.length < 2) return null;
  const a = series[0];
  const b = series[series.length - 1];
  const y0 = a.period.year;
  const y1 = b.period.year;
  if (y0 === null || y1 === null) return null;
  const years = y1 - y0;
  if (years < 1) return null;
  if (!(a.value > 0) || !(b.value > 0)) return null;
  return ((b.value / a.value) ** (1 / years) - 1) * 100;
}

/** Simple period-on-period change, in percent. Null when the base is not positive. */
export function growthPct(from: number | null, to: number | null): number | null {
  if (typeof from !== "number" || typeof to !== "number") return null;
  if (!(from > 0)) return null;
  return ((to - from) / from) * 100;
}

/**
 * A margin: `numerator / denominator` as a percent, per period.
 *
 * Both rows must report the SAME period for a cell to be produced — the tables
 * share one period axis, so this is guaranteed by construction, but a null on
 * either side yields a null rather than a partial ratio.
 */
export function ratioRow(num: FinancialRow | null, den: FinancialRow | null, periods: Period[]): (number | null)[] {
  return periods.map((_p, i) => {
    const a = num?.values[i];
    const b = den?.values[i];
    if (typeof a !== "number" || typeof b !== "number" || b === 0) return null;
    return (a / b) * 100;
  });
}
