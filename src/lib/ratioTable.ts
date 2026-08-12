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
  /** What the page calls itself, in its H1. */
  sourceCompany: string | null;
  /** The company name inside the source URL, which is the fuller of the two. */
  sourceSlug: string | null;
  /** What this dashboard calls the holding. */
  ours: string;
  matches: boolean;
  /** Which identifier carried the match — useful when only one of the two did. */
  matchedOn: "page title" | "source URL" | null;
  reason: string;
};

/** Comparable form: the book's own normaliser, then separators dropped. */
const ident = (s: string) => securityKeyOf(s).replace(/[^a-z0-9]/g, "");

/**
 * Same company?
 *
 * Exact, or one is a PREFIX of the other with at least six characters in
 * common. Both directions occur and neither is sloppiness:
 *   • moneycontrol CLIPS its H1 to a width — "Aurobindo Pharm" for Aurobindo
 *     Pharma Ltd — so theirs is a prefix of ours.
 *   • it also drops the legal suffix the book carries, so ours is a prefix of
 *     theirs where the slug spells the name out in full.
 * Six characters, because a shorter prefix starts matching unrelated companies
 * that share a house name.
 */
function sameCompany(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.startsWith(short);
}

/**
 * Whether the page the resolver pointed at is about the company we asked about.
 *
 * THIS IS NOT DEFENSIVE PROGRAMMING — the resolver is wrong about a QUARTER OF
 * THE TIME. Measured across the first fifteen holdings in this book that carry
 * an NSE symbol, four resolved to an entirely different company:
 *
 *     ABCAPITAL   (Aditya Birla Capital)  -> tatacapital
 *     BAJAJ-AUTO  (Bajaj Auto)            -> bajajfinance
 *     ALIVUS      (Alivus Life Sciences)  -> altiustelecominfrastructure
 *     BLS         (BLS International)     -> sonablwprecisionforgings
 *
 * Every one of those pages carries a complete, correct ratio table for the
 * company it is actually about. Rendered under this family's holding it would
 * be a screen of true figures belonging to somebody else, with nothing on it a
 * reader could catch it by. At one in four, checking is not a precaution; it
 * is the only thing making this feature renderable at all.
 *
 * The comparison is `securityKeyOf`, the book's own name normaliser — case,
 * punctuation and trailing legal suffixes and nothing else. Deliberately not
 * fuzzy: merging two companies is the failure being guarded against, and the
 * upstream resolver is presumably fuzzy, which is how it produced that list.
 *
 * IT REFUSES A CORRECT PAGE RATHER THAN ACCEPT A WRONG ONE, and that asymmetry
 * is deliberate — a refused table costs a reader a screen, an accepted wrong
 * one costs them a decision.
 */
export function checkIdentity(doc: RatioDoc, ourName: string, sourceUrl?: string | null): IdentityCheck {
  const theirs = doc.sourceCompany;
  // The URL carries the company name too, and it is the FULLER of the two —
  // measured across fifteen holdings, moneycontrol's H1 reads "BHEL" and "AFL"
  // where the URL reads `bharatheavyelectricals` and `arvindfashionslimited`.
  // Checking only the H1 refused two pages that were about the right company.
  const slug = (sourceUrl ?? "").match(/\/financials\/([^/]+)\//)?.[1] ?? null;
  const ours = ident(ourName);

  if (!theirs && !slug) {
    return {
      sourceCompany: null, sourceSlug: null, ours: ourName, matches: false, matchedOn: null,
      reason: "the page does not name the company it is about, so there is nothing to check the attribution against",
    };
  }

  const byTitle = theirs ? sameCompany(ident(theirs), ours) : false;
  const bySlug = slug ? sameCompany(ident(slug), ours) : false;
  const matches = byTitle || bySlug;
  const matchedOn = byTitle ? "page title" : bySlug ? "source URL" : null;

  return {
    sourceCompany: theirs, sourceSlug: slug, ours: ourName, matches, matchedOn,
    reason: matches
      ? `the ${matchedOn} identifies this as ${(byTitle ? theirs : slug) ?? ""}, which is this holding`
      : `the ratio source resolved to ${theirs ?? slug}, which is a different company from ${ourName}`,
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
