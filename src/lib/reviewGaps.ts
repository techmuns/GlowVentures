// WHY A NAME THE FAMILY HOLDS IS ON NO SCREEN — the read side of
// `src/data/reviewGaps.ts`.
//
// THE DEFECT THIS ANSWERS. The family searched the Portfolio Monitor for BSE,
// got "No holdings match “BSE”." and asked whether the dashboard was broken. It
// was not: BSE Ltd. is 40,000 shares on their own consolidated review and NO
// STATEMENT in `source/` reports it, so the book is right to carry nothing —
// a figure for it would be the fabrication this whole book exists to prevent.
// What was wrong is that the screen could not say so, which is this repo's
// most-repeated failure arriving one layer up from a dashed cell: a reader who
// cannot tell "no custodian sent this" from "the dashboard lost it" assumes the
// second. `costWhy` names the custodian on a cost cell for exactly this reason.
//
// NOTHING HERE IS A FIGURE. The review is not a source (§"the consolidated
// review workbook is not a source — by decision"), so no value and no quantity
// of its own crosses over; `REVIEW_GAPS` carries a name, a custodian and two
// sentences, and its generator throws rather than emit a number.
import { BOOK_POSITIONS, BOOK_SHARE_MOVEMENTS, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import { securityKeyOf } from "@/lib/securityKey";
import { schemeNameFor } from "@/lib/schemeLabel";
import { fundNavFor } from "@/lib/fundNavs";
import { REVIEW_GAPS, REVIEW_AS_OF, type ReviewGap } from "@/data/reviewGaps";

export type { ReviewGap };
export { REVIEW_AS_OF };

/** Every spelling a gap answers to: the review's own name plus its aliases. */
const spellings = (g: ReviewGap) => [g.name, ...g.aliases];

/**
 * ── A GAP THIS BOOK MAY NOT CLAIM, BECAUSE A NAME LIKE IT IS IN THE BOOK ────
 *
 * The reconciler reports a review line as absent when no tier JOINS it, and it
 * is right to: its prefix tier runs one way only, because accepting the reverse
 * once matched `Vedanta Power`, `Vedanta Iron & Steel` and `Vedanta Oil & Gas`
 * onto the one book row named `Vedanta` — four demerged companies reported
 * against 12,909 shares of their former parent.
 *
 * ON SCREEN THE CONSEQUENCES ARE THE OTHER WAY ROUND, AND THAT IS THE WHOLE
 * REASON THIS TIER MAY BE LOOSER THAN THAT ONE. There, a weak match JOINS and
 * publishes a figure. Here it only decides whether to stay quiet: the cost of
 * suppressing too much is the silence a reader already had, and the cost of
 * suppressing too little is telling them a holding they own is missing.
 *
 * Measured and the case is real: the book holds `ONESOURCE SPECIAL-EQ` — 48,000
 * shares, ₹8.61 Cr, a depository's clipped spelling — while the review writes
 * `Onesource Specialty Pharma`, and without this the note told a reader no
 * statement reported a position sitting one search away. Also `Bharat
 * Parenteral`, `Infinium Pharma`, `Kaynes Technology` and `Zaggle Prepaid`.
 *
 * AND IT DECLINES THE THREE VEDANTA SPIN-OFFS TOO, because the book's `vedanta`
 * row is their former parent. That is the right answer, though not for this
 * reason: the note would be false of all three. The review closes Ajay at
 * 1,15,000 shares of each at MOPWM and 1,15,000 at HDFC Bank, and his
 * transaction-only demat holds 1,15,000 of each on 30 June 2026 — credited by
 * the 8 May arrangement, delivered out 22–27 July. Only the HDFC Bank half is
 * on no statement.
 */
const flat = (k: string) => k.replace(/-/g, "");
const prefixRelated = (k: string, keys: readonly string[]) => keys.some((bk) =>
  bk.startsWith(k) || k.startsWith(bk) || flat(bk).startsWith(flat(k)) || flat(k).startsWith(flat(bk)));
// A holding a statement RECORDS counts as well as one the book values: the
// Motilal demats' lines are quantities with no usable price (Stage 10cz), and a
// review line spelling one of them is still a holding the statements report.
const RECORDED = BOOK_UNVALUED_HOLDINGS.filter((u) => (u.quantity ?? 0) > 0 && !u.sameUnitsReportedBy);
const BOOK_KEYS = [...new Set([
  ...BOOK_POSITIONS.map((p) => p.security),
  ...RECORDED.map((u) => u.security),
].map((n) => securityKeyOf(n)))].filter(Boolean);

/**
 * ── …AND A GAP WHOSE NAME IS A SCHEME THE BOOK HOLDS (SC-B4) ────────────────
 *
 * The tier above compares the review's name with the name the STATEMENT
 * printed, and for a mutual fund that is the one comparison that cannot work: a
 * depository clips a scheme to its column width, so the book's `WOC MAAF
 * D-GROW` and the review's `WhiteOak Capital Multi Asset Allocation
 * Fund-Direct(G)` share no prefix — while the dashboard has displayed that
 * holding, ₹8.83 Cr across two accounts, under the scheme's own published name
 * since Stage 10az. Measured, the note told a reader "no statement reports it"
 * about SEVEN funds the book holds (WhiteOak, both Aditya Birla Sun Life
 * lines, Bandhan Large & Mid Cap, Kotak Multicap, ICICI Prudential Liquid,
 * Liquid BeES) and, on the three substring searches, five more — HDFC Balanced
 * Advantage (both plans are held), ICICI Prudential India Opportunities and
 * Balanced Advantage, and HDFC Liquid, which a statement reports as redeemed.
 *
 * THE SCHEME'S PUBLISHED NAME IS REACHED THROUGH AN IDENTIFIER, never a
 * resemblance: `schemeNames.json` is AMFI's name joined on the book's own ISIN,
 * and AMFI's daily file (`fundNavs.ts`) supplies the one scheme the look-through
 * could not reach — Liquid BeES, on the statement's own ISIN. What is compared
 * is `schemeStem` of each side: the plan and option words both append taken off
 * (Direct, Regular, Growth, IDCW, a daily-dividend "(DD)"), and the two AMC
 * abbreviations the review writes (`SL` for Sun Life, `Pru` for Prudential)
 * spelt out.
 *
 * PLAN- AND OPTION-INSENSITIVE ON PURPOSE, and that is this file's own rule
 * rather than a loosening of it: the question a note answers is whether a
 * statement reports THE SCHEME, and a review line for the daily-dividend option
 * of a fund the book holds in Growth is a line the note must not answer with
 * "no statement reports it". Suppressing too much costs the silence a reader
 * already had. The top bar's search finds the held scheme for the same
 * spelling, through the same stem, so the silence is not left standing there.
 */
const PLAN_OPTION_WORDS = new Set([
  "direct", "regular", "plan", "growth", "gr", "grw", "grow", "g", "d", "dp", "option", "dd", "idcw",
  "dividend", "reinvestment", "reinvest", "payout", "daily", "weekly", "monthly", "quarterly", "bonus",
]);
const AMC_ABBREVIATIONS: Record<string, string> = { sl: "sun life", pru: "prudential" };

/**
 * A scheme's name with its plan and option set aside and the review's AMC
 * abbreviations spelt out — the unit a reader means by "the fund". Shared with
 * the top bar's search so the note and the search cannot disagree about which
 * scheme a spelling names.
 */
export function schemeStem(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .flatMap((w) => (AMC_ABBREVIATIONS[w] ?? w).split(" "))
    .filter((w) => !!w && !PLAN_OPTION_WORDS.has(w))
    .join(" ");
}

/** Every published name of the scheme behind a holding — reached by ISIN, never by resemblance. */
export function schemeNamesOf(securityKey: string): string[] {
  const s = schemeNameFor(securityKey);
  const n = fundNavFor({ securityKey });
  return [...new Set([s?.name, s?.amfiName, n?.scheme].filter((x): x is string => !!x))];
}

/**
 * Every scheme a statement reports — held OR redeemed, because both are
 * reported, and one a statement records with no usable price too (Stage 10cz).
 */
const HELD_SCHEME_KEYS = [...new Set([...BOOK_POSITIONS.map((p) => p.securityKey), ...RECORDED.map((u) => u.securityKey)]
  .flatMap((k) => schemeNamesOf(k))
  .map((n) => securityKeyOf(schemeStem(n))))].filter(Boolean);

/**
 * ── …NOR ONE A STATEMENT REPORTS, WHETHER OR NOT THIS BOOK VALUES IT ────────
 *
 * The note says "no statement reports it", and that is a claim about the
 * STATEMENTS, not about what this book values. A review line some statement
 * reports, for any holder, makes the sentence false, and a reader told it
 * sends the family a request for a document they already sent.
 *
 * Measured, it was false for eight more lines than the ones this book values.
 * The name tier cannot see them: a depository prints the AMC's name in front
 * of the scheme's or clips it, and it prints an unlisted company's instrument
 * in full where the review writes a brand. IFB Inds., NLC INDIA and Zepto are
 * on Ajay's transaction-only demat. Liquid BeES, HDFC and ICICI Pru Balanced
 * Advantage, ICICI Pru Liquid and WhiteOak are on the other three demats, some
 * of them as a holding this book values.
 *
 * JOINED BY ISIN THROUGH A HAND-CHECKED TABLE, never by a name rule. Each entry
 * says what ties the review's line to a statement's balance, and
 * `reviewGaps.test.ts` holds every entry to that witness. The note stays quiet
 * wherever the joined ISIN is on a statement this dashboard reads: a position
 * in the book, a holding a statement records that this book does not value,
 * or a depository's closing balance. It is keyed on the STATEMENTS, not on the
 * valuation, so switching a valuation off (`VALUE_DEPOSITORY_CASH_UNITS`,
 * `VALUE_DEPOSITORY_FUND_UNITS`) does not bring the sentence back. The units
 * are still on the statement.
 *
 * A line some statement reports for one holder and not for another stays
 * quiet too. The note has one sentence, and "no statement reports it" is
 * false of that line. The unreported part is on the ask list, in
 * `docs/REVIEW-RECONCILIATION.md`, which names the documents that close it.
 */
export const REVIEW_LINE_ISINS: ReadonlyMap<string, readonly string[]> = new Map([
  // The review's transaction sheet records Ajay buying 1,63,08,407.445 units at
  // ₹11.0367 on 20 May 2026, and the depository credits exactly those units on
  // his demat the next day — the unit witness `fundNavs.test.ts` asserts.
  ["Motilal Oswal Arbitrage Fund Direct (G)", ["INF247L01ED1"]],
  // The review's Cash tab and its transaction sheet both print Ajay's 2,282.178
  // units: the depository's closing balance on the same demat, to the third
  // decimal.
  ["HDFC Liquid Fund -Direct(G)", ["INF179KB1HP9"]],
  // A-17: the review's transaction sheet closes Aarti at 2,42,412.122 units and
  // Ankita at 3,93,095.951 — the two Motilal Oswal holding statements' own
  // balances of ABSL BAL ADV-GROWTH, to the third decimal. Those statements
  // record the units and print no rate, and the live book values them at AMFI's
  // NAV (`unpricedStatementUnits`); Bharat's statement prices the same scheme.
  ["Aditya Birla SL Balanced Advantage Fund(G)", ["INF084M01AB8"]],
  // Stage 10cy — the other mutual funds on Ajay's transaction-only demat. Each
  // is tied by units, never by name. The review's own purchases are depository
  // credits unit for unit: twelve weekly Bandhan purchases (1,27,182.131 on
  // 2 Apr 2026 onward), seven Kotak Multicap purchases, and the 34,045.997
  // Kotak Large & Midcap units bought on 2 Apr 2026. For ICICI India
  // Opportunities and ICICI Equity Savings the review closes Ajay on 30 June at
  // 48,50,206.378 and 93,20,249.865 units, and the depository closes the demat
  // at exactly those balances on 31 July.
  ["Bandhan Large & Mid Cap Fund - Direct Plan - Growth", ["INF194K01V89"]],
  ["ICICI Pru India Opportunities Fund", ["INF109KC1RH9"]],
  ["ICICI Prudential Equity Savings Fund - Direct Plan", ["INF109KA11J9"]],
  ["Kotak Large & Midcap Fund - Direct- Growth", ["INF174K01LF9"]],
  ["Kotak Multicap Fund-Direct Plan-Growth", ["INF174KA1HV3"]],
  // Stage 10cy — lines a statement reports, valued or not. Each review closing
  // on 30 June 2026 is the statement's own balance that day, to the unit:
  // Ajay's transaction-only demat walks to 15,772 IFB shares and 32,000 NLC
  // shares by then, and still holds both at 31 July.
  ["IFB Inds.", ["INE559A01017"]],
  ["NLC INDIA", ["INE589A01014"]],
  // The same demat opens the year at 4,716 Zepto preference shares and still
  // holds them on 30 June 2026 — the review's closing, to the share. On 22 July
  // the statement's own corporate action converts them into 37,38,119 equity
  // shares under a new ISIN, so both ISINs are this line.
  ["Zepto", ["INE143403066", "INE143401029"]],
  // Aarti's demat walks to 5,169.754 Liquid BeES units on 30 June and Bharat's
  // to 3,816.251, the review's two closings.
  ["Nippon India ETF Nifty 1D Rate Liquid Bees-IDCW", ["INF732E01037"]],
  // Both plans. Ankita's demat walks to 46,162.731 Regular units on 30 June and
  // Bharat's to 27,779.278 Direct units, two of the review's four closings.
  // Ajay's 83,001.863 and Ankita's other 49,917.632 are on no statement.
  ["HDFC Balanced Advantage Fund", ["INF179K01830", "INF179K01WA6"]],
  // Bharat's demat walks to 1,46,856.943 Direct units on 30 June, the review's
  // closing for him. Ajay's 21,70,488.137 are on no statement.
  ["ICICI Pru Balanced Advantage Fund", ["INF109K012B0"]],
  // Aarti's demat walks to 21,012.887 units on 30 June and Ankita's to
  // 1,568.013, two of the review's three closings, to the unit. The third, the
  // family trust's 46,654.378, is its own demat's balance (Stage 10db): the
  // trust's holding statement of 31 July prints it, and its tape from 1 April
  // does not move the scheme.
  ["ICICI Pru Liquid Fund-Direct(G)", ["INF109K01Q49"]],
  // Stage 10db — the trust's holding statement of 31 July prints 10,92,470.994
  // Direct units, the review's closing for the trust to the unit, and its tape
  // from 1 April does not move the scheme. The regular-plan line, Ajay's
  // 7,99,864.748 units, is on no statement and is a different review line.
  ["Invesco India Arbitrage Fund-Direct(G)", ["INF205K01KR8"]],
  // Ankita's and Bharat's holding statements print 39,15,742.08 and
  // 13,66,820.78 units, the review's closings for them. Neither demat moved
  // the scheme this year. Ajay's 70,52,224.197 are on no statement.
  ["WhiteOak Capital Multi Asset Allocation Fund-Direct(G)", ["INF03VN01761"]],
]);

/**
 * ── …NOR ONE A STATEMENT REPORTS FOR AN ENTITY THIS BOOK KEEPS OUT ─────────
 *
 * The review files four Cash-tab lines under HOPE INDIA TRUST. That trust's
 * own AMC folio statements are in the drop and report each of them. This book
 * keeps them out by decision: the trust is a separate taxpayer
 * (`shared/owners.mjs`, `docs/BOOK-REPORT.md`). So the sentence is false here
 * too, and its ask ("AMC folio statements") names statements the family
 * already sent.
 *
 * Keyed on the FOLIO, because two of the four print no ISIN. The folios are
 * in the audit archive and not in the book, so the runtime cannot check this
 * table. `reviewGaps.test.ts` holds every entry to the folio's own statement:
 * the trust holds it, and it prints a holding at exactly the NAV the review
 * prices the line at. HSBC Liquid, the review's fifth line for the trust, has
 * no folio in the drop and stays claimable.
 */
export const REVIEW_LINES_KEPT_OUT: ReadonlyMap<string, string> = new Map([
  ["Aditya Birla SL Liquid Fund-(DD)-Direct", "1019265797"],
  ["Aditya Birla SL Liquid Fund-Direct (G)", "1038104611"],
  ["Kotak Liquid-Direct (DD)", "4295974"],
  ["Mirae Asset Cash Management Fund-Direct(G)", "70413280453"],
]);

/**
 * Every ISIN a statement this dashboard reads reports with units: a position in
 * the book, a holding a statement records that this book does not value, and a
 * depository window that walks its own printed balance.
 *
 * A window counts whatever it closes at. The review is struck on 30 June, and
 * a holding the depository shows that day and delivers out or converts in July
 * was on a statement on the review's date — Zepto's preference shares are the
 * case. The dated half, that the balance on the review's date IS the review's
 * units, is `reviewGaps.test.ts`'s witness for every entry.
 */
const STATEMENT_REPORTED = new Set(
  [
    // A review-sourced position (Stage 10dh) is the review's own line, not a
    // statement reporting it.
    ...BOOK_POSITIONS.filter((p) => !p.review && (p.quantity ?? 0) > 0).map((p) => p.isin),
    ...BOOK_UNVALUED_HOLDINGS.filter((u) => (u.quantity ?? 0) > 0).map((u) => u.isin),
    ...Object.values(BOOK_SHARE_MOVEMENTS).filter((w) => w.reason == null).map((w) => w.isin),
  ].map((x) => x?.trim().toUpperCase()).filter((x): x is string => !!x));

/**
 * Whether a statement reports this review line: its hand-checked ISINs are on
 * a statement this dashboard reads, or a folio this book keeps out by decision
 * reports it.
 */
export const reportedByStatement = (g: ReviewGap) =>
  (REVIEW_LINE_ISINS.get(g.name) ?? []).some((i) => STATEMENT_REPORTED.has(i))
  || REVIEW_LINES_KEPT_OUT.has(g.name);

const CLAIMABLE = REVIEW_GAPS.filter((g) => {
  if (reportedByStatement(g)) return false;
  const k = securityKeyOf(g.name);
  if (!k) return false;
  if (prefixRelated(k, BOOK_KEYS)) return false;
  return !spellings(g).some((s) => {
    const sk = securityKeyOf(schemeStem(s));
    return !!sk && prefixRelated(sk, HELD_SCHEME_KEYS);
  });
});

/** The gaps a search may be told about — see `CLAIMABLE` above. */
export const claimableGaps = () => CLAIMABLE;

/**
 * Case, punctuation and spacing folded away, so `BSE Ltd.` and `bse ltd` are
 * one string. Deliberately the same shape as `securityKeyOf`'s normalisation
 * and deliberately NOT that function: this compares a reader's typing against a
 * display name, where that one derives the book's identity from a statement.
 */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();


/**
 * The review lines a reader's search term names, closest first.
 *
 * SUBSTRING IN BOTH DIRECTIONS AND NOTHING LOOSER. "bse" finds "BSE Ltd."
 * because the query sits inside the name; "bombay stock exchange ltd" finds it
 * because the ALIAS sits inside the query. There is deliberately no fuzzy tier
 * — `shared/nameMatch.mjs` records what a token-overlap rule did to this corpus
 * (`KIRANAKART TECHNOLOGIES` matched to `TATA TECHNOLOGIES`), and a wrong match
 * here would tell a reader the wrong thing about their own money.
 *
 * A one-character query matches nothing: at that length a substring rule names
 * half the list, which is noise rather than an answer.
 */
export function reviewGapsFor(query: string, limit = 3): ReviewGap[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const scored: Array<{ g: ReviewGap; rank: number }> = [];
  for (const g of CLAIMABLE) {
    let best = Infinity;
    for (const s of spellings(g)) {
      const n = norm(s);
      // 0 exact · 1 the name starts with what was typed · 2 either contains the
      // other. Ranked so a reader typing a full name is not led by a longer one
      // that merely contains it.
      const rank = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) || q.includes(n) ? 2 : Infinity;
      if (rank < best) best = rank;
    }
    if (best < Infinity) scored.push({ g, rank: best });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.g.name.length - b.g.name.length || a.g.name.localeCompare(b.g.name))
    .slice(0, limit)
    .map((x) => x.g);
}
