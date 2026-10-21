/**
 * ── WHAT A PAGE'S VALUES ARE STRUCK ON, AND WHEN ────────────────────────────
 *
 * `PortfolioContext` overlays two prices on the statement book: a live quote
 * (`applyQuotes`, which sets `live`) and AMFI's published NAV for a mutual-fund
 * scheme (`applyFundNavs`, which sets `navPriced` and `navDate` and deliberately
 * NEVER `live` — a NAV is struck once after the close, a quote is intraday, and
 * the two must never be added). So with the quote feed down the book's basis
 * still reads STATEMENT while about ₹104 Cr of it sits at a NAV AMFI published
 * weeks after the statement that reported the units — and the pages said
 * "every figure traces to a statement PDF", "on the statements' own marks" and
 * "as of 29 Aug", none of which was true of that money.
 *
 * This names the three prices a holding can be carried at, over a set the
 * CALLER chooses (the page's own current holdings), with the dates each one
 * spans, so a caption can state the blend instead of one date that belongs to
 * none of it. It reads only the fields the overlays write; it decides nothing
 * about which price a holding should carry.
 *
 * THE DATES ARE STRUCK OVER HOLDINGS THAT CARRY A VALUE. The book's own as-of
 * is the newest statement of any kind — 29 Aug, the two trusts' NSDL
 * statements, whose one line is quantity-only at face value — and a date on
 * which nothing was valued is not a valuation date.
 *
 * AND THE NAV PART SAYS WHAT THE STATEMENTS MARKED IT AT, where the caller
 * hands in the same set on the statement basis. That is what lets a reader tie
 * the page's total back to the PDFs: the statement-marked part plus that figure
 * is the statement total, to the rupee.
 *
 * EXCEPT FOR THE UNITS NO STATEMENT MARKS. `PortfolioContext` also values the
 * cash-equivalent funds on an account that sent a TRANSACTION statement and no
 * holding statement — the depository's own closing units × AMFI's NAV
 * (`depositoryCashHoldings`, `Position.depositoryUnits`). Those rows are at the
 * NAV like any other, and they have NO statement mark to tie back to. Folded
 * into the NAV part they blanked the tie-back for every line (one line with no
 * counterpart made the whole figure unknowable); left unnamed they read as
 * value the statements marked. So they are the NAV part's own sub-part,
 * `units`, dated by the closing balance they come from, and the tie-back is
 * struck over the lines a statement does mark.
 */
import type { Account, Position } from "./types";

export type ValuationBasis = {
  total: number;
  /** Carried at the mark its own statement printed, dated by that account's report date. */
  statement: { value: number; rows: number; from: string | null; to: string | null };
  /**
   * Carried at AMFI's published NAV. `schemes` counts securities, `rows`
   * statement lines. `statementValue` is what the statements marked the same
   * lines at — null where the caller gave no statement set or a line has no
   * counterpart in it.
   */
  nav: {
    value: number; rows: number; schemes: number; from: string | null; to: string | null;
    /** What the statements marked the NAV lines THEY carry at — every NAV line but `units`. */
    statementValue: number | null;
    /** The NAV value of those same statement-marked lines, so the tie-back names what it covers. */
    markedValue: number;
  };
  /**
   * The part of `nav` valued off a depository's own closing units on an account
   * that sent no holding statement — no statement marks these at all. Dated by
   * the closing balance's own date.
   */
  units: { value: number; rows: number; schemes: number; from: string | null; to: string | null };
  /** Carried at a live intraday quote. */
  live: { value: number; rows: number };
  /**
   * The newest report date of any account holding a line that carries a
   * value, on any of the three prices. A book whose own as-of is later than
   * this has a newest statement that values nothing — which a caption must not
   * pass off as the date of its figures.
   */
  accountsTo: string | null;
};

const widen = (r: { from: string | null; to: string | null }, d: string | null | undefined) => {
  if (!d) return;
  if (!r.from || d < r.from) r.from = d;
  if (!r.to || d > r.to) r.to = d;
};

/** One statement line's identity across the two bases: its account and its security. */
const lineKey = (p: Position) => `${p.accountId}|${p.securityKey}`;

export function valuationBasis(
  positions: readonly Position[],
  accounts: readonly Account[],
  statementPositions?: readonly Position[],
): ValuationBasis {
  const asOf = new Map(accounts.map((a) => [a.accountId, a.asOf]));
  const out: ValuationBasis = {
    total: 0,
    statement: { value: 0, rows: 0, from: null, to: null },
    nav: { value: 0, rows: 0, schemes: 0, from: null, to: null, statementValue: null, markedValue: 0 },
    units: { value: 0, rows: 0, schemes: 0, from: null, to: null },
    live: { value: 0, rows: 0 },
    accountsTo: null,
  };
  const schemes = new Set<string>();
  const unitSchemes = new Set<string>();
  const navLines = new Set<string>();
  for (const p of positions) {
    out.total += p.marketValue;
    const d = asOf.get(p.accountId);
    if (p.marketValue !== 0 && d && (!out.accountsTo || d > out.accountsTo)) out.accountsTo = d;
    if (p.live) { out.live.value += p.marketValue; out.live.rows++; continue; }
    if (p.navPriced) {
      out.nav.value += p.marketValue; out.nav.rows++; schemes.add(p.securityKey);
      widen(out.nav, p.navDate);
      if (p.depositoryUnits) {
        out.units.value += p.marketValue; out.units.rows++; unitSchemes.add(p.securityKey);
        widen(out.units, p.depositoryUnits.asOf);
      } else {
        out.nav.markedValue += p.marketValue;
        navLines.add(lineKey(p));
      }
      continue;
    }
    out.statement.value += p.marketValue; out.statement.rows++;
    if (p.marketValue !== 0) widen(out.statement, asOf.get(p.accountId));
  }
  out.nav.schemes = schemes.size;
  out.units.schemes = unitSchemes.size;
  if (statementPositions && navLines.size) {
    // Summed per line on BOTH sides: the overlay prices every row of a
    // security alike, so a line two rows share is counted once per side.
    const printed = new Map<string, number>();
    for (const p of statementPositions) printed.set(lineKey(p), (printed.get(lineKey(p)) ?? 0) + p.marketValue);
    let v = 0; let complete = true;
    for (const k of navLines) {
      const m = printed.get(k);
      if (m === undefined) { complete = false; break; }
      v += m;
    }
    out.nav.statementValue = complete ? v : null;
  }
  return out;
}

/**
 * "31 Mar → 13 Aug 2026", or the one date when both ends are the same. The
 * first date drops its year only where it is the SAME year and the caller's
 * formatter ends with it — a span across a year keeps both.
 */
export const dateSpan = (r: { from: string | null; to: string | null }, fmt: (d: string) => string): string => {
  if (!r.from || !r.to) return "";
  if (r.from === r.to) return fmt(r.from);
  const y = r.from.slice(0, 4);
  let a = fmt(r.from);
  if (y === r.to.slice(0, 4) && a.endsWith(` ${y}`)) a = a.slice(0, -(y.length + 1));
  return `${a} → ${fmt(r.to)}`;
};

/**
 * One sentence naming each price a set is carried at, its value and its dates —
 * the caption every page with a NAV-overlaid total owes its reader. Money comes
 * through the CALLER's formatter (the reader's display currency), dates through
 * the caller's too.
 */
export function valuationBasisNote(
  b: ValuationBasis,
  money: (n: number) => string,
  fmt: (d: string) => string,
): string {
  const parts: string[] = [];
  if (b.statement.rows) parts.push(`${money(b.statement.value)} at the statements' own marks, dated ${dateSpan(b.statement, fmt)}`);
  if (b.nav.rows) {
    const marked = b.nav.rows - b.units.rows;
    const units = b.units.rows
      ? `${money(b.units.value)} is a transaction statement's closing units (${dateSpan(b.units, fmt)}), which no statement marks`
      : "";
    const printed = !marked || b.nav.statementValue === null ? ""
      : b.units.rows ? `the statements marked ${money(b.nav.markedValue)} of it at ${money(b.nav.statementValue)}`
      : `the statements marked them at ${money(b.nav.statementValue)}`;
    const tail = [printed, units].filter(Boolean).join(", and ");
    parts.push(`${money(b.nav.value)} at AMFI's published NAV of ${dateSpan(b.nav, fmt)}, on ${b.nav.schemes} scheme${b.nav.schemes === 1 ? "" : "s"}${tail ? ` — ${tail}` : ""}`);
  }
  if (b.live.rows) parts.push(`${money(b.live.value)} at live prices`);
  return parts.join(" · ");
}

/**
 * THE SAME PARTS AS A LINE OF FIGURES — each price's value and its dates and
 * nothing else — for the face of a total whose hover is `valuationBasisNote`.
 * No explainer line on screen (Stage 10cp): the tie-back and the units no
 * statement marks are the sentence, and the sentence is the hover on its
 * figure; what stays on the face is which price each part is struck at, and
 * when, because a total dated by the wrong statement is the defect (XA-13).
 * Kept to labels and figures on purpose — with all three prices in play it is
 * still a line of figures, never a sentence the no-explainer sweep would read.
 */
export function valuationBasisLine(
  b: ValuationBasis,
  money: (n: number) => string,
  fmt: (d: string) => string,
): string {
  const parts: string[] = [];
  if (b.statement.rows) parts.push(`${money(b.statement.value)} at statement marks, ${dateSpan(b.statement, fmt)}`);
  if (b.nav.rows) parts.push(`${money(b.nav.value)} at AMFI's published NAV of ${dateSpan(b.nav, fmt)}, ${b.nav.schemes} scheme${b.nav.schemes === 1 ? "" : "s"}`);
  if (b.live.rows) parts.push(`${money(b.live.value)} live`);
  return parts.join(" · ");
}

/**
 * The pill a page carries where part of it is at a published NAV — beside the
 * basis pill, never instead of it. With no live quote in, that pill reads
 * STATEMENT; a NAV never sets the live flag (it is struck once after the close
 * and must never be added to an intraday price), so without this one the page
 * says "statement" over schemes it is valuing at a NAV weeks newer than any
 * statement. Empty where nothing in the set is NAV-priced.
 */
export const navBasisLabel = (b: ValuationBasis, fmt: (d: string) => string): string =>
  b.nav.rows ? `NAV ${dateSpan(b.nav, fmt)} · ${b.nav.schemes} scheme${b.nav.schemes === 1 ? "" : "s"}` : "";

export const navBasisTitle = (
  b: ValuationBasis,
  money: (n: number) => string,
  fmt: (d: string) => string,
): string =>
  `${valuationBasisNote(b, money, fmt)}. A published NAV is struck once after the close and never counts as a live price, so a STATEMENT pill beside this one describes the rest of the page, not these schemes.`;
