// THE RATIO ANALYSIS TABLE — per-share ratios, margins, returns, liquidity,
// leverage and valuation, over seven year-ends.
//
// `ratio_source` does not return ratios. It returns a moneycontrol URL and the
// literal instruction "Use WebReader Tool", which is exactly why this repo's
// rule says its response stays prose: nothing in it says which number is which
// company's PE, so mining a figure out of it would be inventing a mapping.
//
// FOLLOWING THE INSTRUCTION LANDS SOMEWHERE ELSE. Measured 2026-08-12, the page
// it points at carries the table itself, labelled on both axes:
//
//     | Indicators | Trend | Mar 26 | Mar 25 | … | Mar 20 |
//     | Basic EPS (Rs.) | … | 59.69 | 51.47 | … | 63.07 |
//
// A column header that says which period and a row label that says which ratio
// is a table, and reading it is the same discipline `lib/table.mjs` applies to
// the statement PDFs. The rule was about `ratio_source`'s OWN response, and it
// is unchanged: that half is still passed through verbatim.
//
// ── THREE THINGS THE REAL PAGE FORCED, NONE OF WHICH A SAMPLE WOULD ─────────
//
// **The `Trend` column is a chart, not a figure.** Every cell in it reads
// "Created with Highcharts 11.4.8". Matching periods by header text skips it;
// a positional read would take it as the first data column and shift every
// figure by one year.
//
// **Section headings are rows.** "Per Share Ratios" arrives as a row with a
// label and no values, not as a separate table. Read as data it becomes a
// ratio whose every period is absent; read as what it is, it is the structure
// a reader navigates by.
//
// **The per-share rows are NOT adjusted for share-count events.** On Reliance,
// every per-share row halves between Mar 24 and Mar 25 — EPS 102.90 → 51.47,
// book value 1,172.75 → 623.12, revenue/share 1,331.75 → 712.90 — while the
// margin and return rows do not move at all. Whole-table halving of exactly
// the per-share lines is a share count doubling, not a collapse in earnings.
// `shareCountBreaks` finds those years so the page can say so, because a
// reader comparing 2024 with 2025 down that column would otherwise read a 50%
// fall that never happened.

import { securityKeyOf } from "@/lib/securityKey";

export type RatioPeriod = { label: string; year: number | null };

export type RatioRow = {
  label: string;
  /** True for a heading row — a label with no figures under it. */
  heading: boolean;
  /** True when the label declares a percentage. */
  percent: boolean;
  /** True for a per-share line, which is not share-count adjusted. */
  perShare: boolean;
  values: (number | null)[];
};

export type RatioDoc = {
  /** Which company the PAGE says these are, from its own H1. */
  sourceCompany: string | null;
  /** "Consolidated" or "Standalone", where the page states it. */
  basis: string | null;
  periods: RatioPeriod[];
  rows: RatioRow[];
};

const HIGHCHARTS = /created with highcharts/i;

/** A period header — moneycontrol writes "Mar 26", two-digit year. */
export function parseRatioPeriod(raw: string): RatioPeriod {
  const label = raw.trim();
  const m = /^([A-Za-z]{3})\s*'?(\d{2}|\d{4})$/.exec(label);
  if (!m) return { label, year: null };
  const n = Number(m[2]);
  // A two-digit year is this century: these tables run back seven years, so
  // there is no 19xx to disambiguate against.
  return { label, year: m[2].length === 2 ? 2000 + n : n };
}

/** A printed ratio cell. A blank is not zero, and the chart placeholder is not a value. */
export function parseRatioCell(raw: string): number | null {
  const t = (raw ?? "").trim();
  if (!t || t === "-" || t === "—" || HIGHCHARTS.test(t)) return null;
  const cleaned = t.replace(/[,%\s₹]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const cells = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.replace(/ /g, " ").trim());

const isSeparator = (l: string) => /^\|?[\s:|-]+\|?$/.test(l.trim()) && l.includes("-");

const PER_SHARE = /\/\s*share|per share|\bEPS\b|book value/i;

/**
 * Parse the reader's markdown into the ratio table.
 *
 * The page is 32 KB of which the table is a few hundred bytes, so the table is
 * located by its own HEADER ROW — a row whose first cell is "Indicators" —
 * rather than by taking the first pipe block on the page, which is a spacer.
 */
export function parseRatioTable(markdown: string): RatioDoc {
  const text = markdown ?? "";
  const h1 = /^#\s+(.+?)\s+Key Financial Ratios\s*$/m.exec(text);
  const basis = /^\s*(Consolidated|Standalone)\s*$/m.exec(text);
  const out: RatioDoc = {
    sourceCompany: h1 ? h1[1].trim() : null,
    basis: basis ? basis[1] : null,
    periods: [],
    rows: [],
  };

  const lines = text.split("\n");
  const headerAt = lines.findIndex((l) => l.trim().startsWith("|") && /^indicators$/i.test(cells(l)[0] ?? ""));
  if (headerAt < 0) return out;

  const header = cells(lines[headerAt]);
  // Every column after the label, MINUS the ones that carry no period: "Trend"
  // is the chart, and moneycontrol closes its rows with an empty cell.
  const columns: { index: number; period: RatioPeriod }[] = [];
  header.forEach((h, i) => {
    if (i === 0) return;
    if (/^trend$/i.test(h) || !h) return;
    const p = parseRatioPeriod(h);
    if (p.year !== null) columns.push({ index: i, period: p });
  });
  out.periods = columns.map((c) => c.period);

  for (let i = headerAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) break;   // the table ends where the pipes do
    if (isSeparator(line)) continue;
    const cs = cells(line);
    const label = cs[0];
    if (!label) continue;
    const values = columns.map((c) => parseRatioCell(cs[c.index] ?? ""));
    const heading = values.every((v) => v === null) && !HIGHCHARTS.test(cs[1] ?? "");
    out.rows.push({
      label,
      heading,
      percent: /\(%\)|%\s*$/.test(label),
      perShare: PER_SHARE.test(label),
      values,
    });
  }
  return out;
}

// ── Is this the company we asked about? ─────────────────────────────────────

export type IdentityCheck = {
  /** What the page calls itself. */
  sourceCompany: string | null;
  /** What this dashboard calls the holding. */
  ours: string;
  matches: boolean;
  reason: string;
};

/**
 * Whether the page the resolver pointed at is about the company we asked about.
 *
 * THIS IS NOT DEFENSIVE PROGRAMMING — the resolver was measured getting it
 * wrong. Asked for ABCAPITAL it returned
 * `moneycontrol.com/financials/tatacapital/ratiosVI/TCL06`, a different
 * company, while five other tickers resolved correctly. Rendering that under
 * Aditya Birla Capital's name would put a screen of real figures belonging to
 * somebody else beside this family's holding — a fabricated attribution that
 * no badge repairs, and one a reader has no way to detect.
 *
 * The comparison is `securityKeyOf`, the book's own name normaliser, on both
 * sides: it folds case, punctuation and trailing legal suffixes ("Ltd",
 * "Limited") and nothing else. Deliberately not fuzzy — merging two companies
 * is the failure being guarded against, so a near miss must fail.
 */
export function checkIdentity(doc: RatioDoc, ourName: string): IdentityCheck {
  const theirs = doc.sourceCompany;
  if (!theirs) {
    return {
      sourceCompany: null, ours: ourName, matches: false,
      reason: "the page does not name the company it is about, so there is nothing to check the attribution against",
    };
  }
  const a = securityKeyOf(theirs);
  const b = securityKeyOf(ourName);
  // A containment test either way, because moneycontrol shortens ("Reliance"
  // for Reliance Industries Ltd) as often as it lengthens.
  const matches = a === b || a.startsWith(b) || b.startsWith(a);
  return {
    sourceCompany: theirs, ours: ourName, matches,
    reason: matches
      ? `the page identifies itself as ${theirs}, which is this holding`
      : `the ratio source resolved to ${theirs}, which is a different company from ${ourName}`,
  };
}

// ── The share-count trap ────────────────────────────────────────────────────

/**
 * Years where every per-share row moved by the same factor and the margins did
 * not — the signature of a bonus issue or a split.
 *
 * Reported rather than corrected. Adjusting the series would mean inventing an
 * adjustment factor the source never published; naming the year lets a reader
 * see why the column steps.
 */
export function shareCountBreaks(doc: RatioDoc): { period: RatioPeriod; factor: number }[] {
  const perShare = doc.rows.filter((r) => r.perShare && !r.heading);
  const others = doc.rows.filter((r) => !r.perShare && !r.heading && r.percent);
  if (perShare.length < 3 || !others.length) return [];

  const out: { period: RatioPeriod; factor: number }[] = [];
  // Columns run newest-first, so index i+1 is the EARLIER period.
  for (let i = 0; i < doc.periods.length - 1; i++) {
    const ratios: number[] = [];
    for (const r of perShare) {
      const now = r.values[i];
      const before = r.values[i + 1];
      if (typeof now === "number" && typeof before === "number" && before !== 0 && now !== 0) {
        ratios.push(now / before);
      }
    }
    if (ratios.length < 3) continue;
    const mean = ratios.reduce((s, x) => s + x, 0) / ratios.length;
    // Every per-share line must move together, and by enough to be a share
    // count event rather than a good year: a 5% spread and at least a 40% move.
    const tight = ratios.every((x) => Math.abs(x / mean - 1) <= 0.05);
    if (!tight || Math.abs(mean - 1) < 0.4) continue;

    // The margins must NOT have moved with them — that is what separates a
    // share count change from the business halving.
    const marginMoves: number[] = [];
    for (const r of others) {
      const now = r.values[i];
      const before = r.values[i + 1];
      if (typeof now === "number" && typeof before === "number" && before !== 0) marginMoves.push(now / before);
    }
    const marginsSteady = marginMoves.length > 0
      && marginMoves.filter((x) => Math.abs(x - 1) <= 0.25).length / marginMoves.length >= 0.6;
    if (marginsSteady) out.push({ period: doc.periods[i], factor: mean });
  }
  return out;
}
