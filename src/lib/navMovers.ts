// ── WHAT MOVED, WHERE THE MOVE IS A PUBLISHED NAV RATHER THAN A LIVE PRICE ──
//
//   "this is covering for stocks which is fine … But can I not have — see if I
//    have some money in ETF? Or if mutual funds also have a daily NAV? So
//    wherever there is a daily NAV available and if there is a drastic moment
//    in the line item for some reason, can we capture that? … Because a silver
//    ETF can have a drastic moment ऊपर नीचे. A momentum fund or a momentum ETF
//    can have very drastic moments on rebalancing days."
//
// Today's movers covers `DIRECT_EQUITY_BUCKET` and is struck on the LIVE QUOTE
// feed — a price now against the previous session's close. The family bless
// that card ("which is fine") and ask for the instruments it cannot reach.
//
// ── WHY THOSE INSTRUMENTS NEED A SECOND SOURCE AT ALL ───────────────────────
//
// Every live endpoint is keyed on an NSE trading symbol. Measured on this book:
// of the 6 ETF and 22 mutual-fund rows, ONE resolves a symbol (LIQUIDBEES) —
// so the quote feed prices essentially none of them and never will. **The
// family's own example is the proof**: the DSP Silver ETF resolves no symbol,
// because NSE has moved the DSP gold and silver ETFs to ISINs the statements do
// not carry. A card built on the quote feed cannot answer the question that was
// asked; the AMFI NAV store already in `public/lookthrough/` can.
//
// AND AN AIF CANNOT BE ANSWERED BY EITHER, which the family said first: *"AIF
// में monthly NAV आएगा"*. No AIF folio resolves a scheme in the store and none
// publishes a daily NAV, so they are out of scope here by the instrument rather
// than by a filter — and `scopeNote` says so rather than leaving it silent.
//
// ── THE TWO MEASUREMENTS ARE NEVER BLENDED, AND THAT IS THE WHOLE RULE ──────
//
// A live quote is intraday TODAY. A published NAV is a SCHEME's last struck NAV
// against the one before it — dated, and as old as the last store refresh. On
// this book those are 2026-09-09 against 2026-09-08 while the live feed is
// today. Summing a NAV move into the quote card's percentage would print a
// real figure under the wrong day, which is the defect `/api/indices` already
// cost this repo once ("the level was differenced against itself") and the one
// a reader cannot see. So this is a SEPARATE card, on its own dates, and every
// figure it prints carries the date it was struck on.
//
// ── AND THE RUPEE MOVE IS NOT `units × NAV`, WHICH WAS MEASURED ─────────────
//
// The obvious construction — value the units held at each of the two published
// NAVs — is exact arithmetic and WRONG HERE, because the units and the NAV are
// not on the same base for every holding. Measured over this book:
//
//   DSP GOLD ETF     1,195,000 u   book mark ₹141.24/u   published NAV ₹14.7633
//   DSP GOLD ETF       205,000 u   book mark ₹151.10/u   published NAV ₹14.7633
//   DSP SILVER ETF     123,000 u   book mark ₹276.82/u   published NAV ₹22.4561
//
// `units × NAV` puts the family's ₹16.88 Cr gold ETF at ₹1.76 Cr — a plausible
// number, an order of magnitude out. And there is no single factor to correct
// by: the two gold rows are the SAME security on the SAME as-of date and imply
// ratios of 9.57 and 10.24, while silver implies 12.33.
//
// So the PERCENTAGE is the primitive — it is a fact about the SCHEME and needs
// no unit reconciliation at all — and the rupee figure is that move applied to
// what the book says the family holds. Every row then ties to its own columns:
// `move ÷ value` is the printed percentage, exactly.
//
// THE RUPEE FIGURE IS DERIVED AND IS LABELLED AS SUCH, because the two sides
// are dated differently: the NAV move is the scheme's latest published day, the
// value is the holding's own statement mark. The card prints both dates.
import type { Position } from "./types";
import type { SchemeMatch } from "./lookthrough";
import { holdingBucket } from "./analytics";
import { engagementOf, type AccountIndex } from "./accounts";
import { schemeNameFor, composeSchemeLabel } from "./schemeLabel";

/**
 * THE BUCKETS A PUBLISHED DAILY NAV CAN REACH.
 *
 * `holdingBucket` keys, so this card and the allocation row a reader clicks on
 * Morning CIO cover exactly the same holdings — the same reason Today's movers
 * names its scope in bucket keys rather than re-deriving one from the asset
 * class. AIF is deliberately absent: see the header.
 *
 * An ETF or a scheme held INSIDE a PMS mandate is not here, for the reason that
 * governs every bucket on this site — the manager chose it, so it belongs to
 * the mandate. `holdingBucket` is where that lives and this does not second-
 * guess it.
 */
export const NAV_MOVER_BUCKETS = ["ETF", "Mutual Fund"] as const;

/** One scheme's move, clubbed across every holding of it the family owns. */
export type NavMover = {
  /** The scheme code the NAV is published against — this row's identity. */
  schemecode: string;
  /** The scheme's own name, as the store carries it. */
  scheme: string;
  /**
   * THE PLAN, BECAUSE TWO ROWS OF ONE FUND ARE NOT A DUPLICATE.
   *
   * A scheme's plans differ in expense ratio and therefore in NAV, not in what
   * the fund owns — and this book holds BOTH plans of two funds. HDFC Balanced
   * Advantage reaches it as `1273` and `1273-D`, ICICI Pru Nifty Next 50 as
   * `11889` and `11889-D`, each pair printing one scheme name and two different
   * NAVs. Rendered without the plan those are one fund listed twice at two
   * moves, which reads as a defect; they are two holdings and two measurements.
   */
  plan: string;
  /** The book's name for the largest holding behind this row. */
  security: string;
  /** Where the row opens — the largest constituent's own page. */
  securityKey: string;
  /** How many of the book's securityKeys this scheme's row clubs. */
  keys: number;
  /** How many statement rows are behind it. */
  positions: number;
  /** The published NAV and the one before it, with both dates. */
  nav: number;
  navDate: string;
  prevNav: number;
  prevNavDate: string;
  /** The scheme's own published move. A fact about the SCHEME. */
  changePct: number;
  /** What the book values these holdings at — the statement's mark. */
  value: number;
  /** DERIVED: the scheme's move applied to that value. `move / value === changePct`. */
  move: number;
  /** The newest statement date behind `value`, so the two bases can be told apart. */
  valueAsOf: string | null;
  /** `isin` · `name` · `name+plan`. Surfaced where it is not the ISIN. */
  matchedVia: string;
  /** Every owner named on a statement behind this row. */
  entities: string[];
};

/** A holding in scope that the store cannot price, and why. */
export type NavMoverSkip = {
  securityKey: string;
  security: string;
  value: number;
  reason: string;
};

export type NavMoverModel = {
  rows: NavMover[];
  skipped: NavMoverSkip[];
  /** Σ value over the rows — the denominator the aggregate percentage divides. */
  coveredValue: number;
  /** Σ move over the rows. */
  move: number;
  /** `move / coveredValue`, or null where nothing is covered. */
  changePct: number | null;
  /** Every holding in scope, priced or not. */
  scopeValue: number;
  scopeNames: number;
  /** The NAV dates the rows span, newest first. More than one is normal. */
  navDates: string[];
  /** Newest and oldest NAV date across the rows. */
  newestNavDate: string | null;
  oldestNavDate: string | null;
};

/**
 * ── THE ROW IS THE SCHEME, NOT THE `securityKey` ────────────────────────────
 *
 * A NAV is published against a SCHEME, so a scheme is one mover however many
 * ways the book names it. That matters here rather than being a nicety: Helios
 * Flexi Cap reaches this book under TWO securityKeys — `helios-flexi-cap-fund-
 * direct-growth` from the AMC folio and the depository's clipped `helios-fcf-d-
 * grow` — and both resolve ISIN INF0R8701046 and therefore one NAV. Keyed on
 * `securityKey` the card would print the same scheme's same move twice, at two
 * sizes, as though they were two decisions.
 *
 * This is a JOIN ON THE IDENTIFIER THE NAV IS PUBLISHED AGAINST, not a name
 * match: the store resolved each securityKey to its schemecode on the ISIN, and
 * this clubs what the store already joined. The book keeps the two keys apart
 * everywhere else, which is correct — they are different holdings in different
 * accounts — and the row says how many it clubs.
 */
export function navMoverModel(
  positions: readonly Position[],
  accIdx: AccountIndex,
  schemes: Map<string, SchemeMatch>,
): NavMoverModel {
  const inScope = (p: Position) =>
    (NAV_MOVER_BUCKETS as readonly string[]).includes(holdingBucket(p, engagementOf(accIdx, p)));
  const scope = positions.filter(inScope);

  const byScheme = new Map<string, NavMover>();
  /**
   * The largest holding behind each scheme, so the row can NAME it. Kept beside
   * the rows rather than smuggled onto them as a private field: a `_top` that
   * has to be cast on and deleted off again is a field the type says is not
   * there, and the next reader has to prove it never escapes.
   */
  const topValue = new Map<string, number>();
  const skipped: NavMoverSkip[] = [];

  for (const p of scope) {
    const m = schemes.get(p.securityKey);
    const nav = m?.nav;
    // A HOLDING THE STORE CANNOT PRICE IS NAMED, NEVER ZERO. The three states
    // are different facts and are worded apart: no scheme resolved at all, a
    // scheme with no NAV, and a scheme with a NAV but no previous one to
    // measure a move against. Only the last is a "wait for tomorrow".
    if (!m) {
      skipped.push({ securityKey: p.securityKey, security: p.security, value: p.marketValue,
        reason: "no scheme in the NAV store resolves this holding" });
      continue;
    }
    if (nav?.value == null || nav.date == null) {
      skipped.push({ securityKey: p.securityKey, security: p.security, value: p.marketValue,
        reason: `${m.scheme} resolves, and the store carries no NAV for it` });
      continue;
    }
    if (nav.prev == null || nav.prevDate == null || nav.changePct == null) {
      skipped.push({ securityKey: p.securityKey, security: p.security, value: p.marketValue,
        reason: `${m.scheme} has one published NAV and no earlier one to measure a move against` });
      continue;
    }
    const owner = accIdx.get(p.accountId)?.owner ?? null;
    const asOf = accIdx.get(p.accountId)?.asOf ?? null;
    const cur = byScheme.get(m.schemecode);
    if (cur) {
      cur.value += p.marketValue;
      cur.positions += 1;
      if (owner && !cur.entities.includes(owner)) cur.entities.push(owner);
      if (asOf && (!cur.valueAsOf || asOf > cur.valueAsOf)) cur.valueAsOf = asOf;
      // The row NAMES the largest holding behind it and opens that one, so a
      // reader lands on the position they recognise rather than whichever
      // statement happened to sort first.
      if (p.marketValue > (topValue.get(m.schemecode) ?? -Infinity)) {
        topValue.set(m.schemecode, p.marketValue);
        cur.security = p.security;
        cur.securityKey = p.securityKey;
      }
    } else {
      byScheme.set(m.schemecode, {
        schemecode: m.schemecode, plan: m.plan,
        // THE SAME NAME THIS BOOK SHOWS EVERYWHERE ELSE. The store's own
        // `scheme` is AMFI's raw listing string (`…Fund-Reg(G)`), which is a
        // THIRD spelling of a scheme the holdings tables and this card both
        // name — so it is composed through `schemeLabel` and falls back to the
        // raw string only where no scheme resolved, which on this card is never.
        scheme: (() => { const sn = schemeNameFor(p.securityKey); return sn ? composeSchemeLabel(sn) : m.scheme; })(),
        security: p.security, securityKey: p.securityKey,
        keys: 0, positions: 1,
        nav: nav.value, navDate: nav.date, prevNav: nav.prev, prevNavDate: nav.prevDate,
        changePct: nav.changePct,
        value: p.marketValue, move: 0, valueAsOf: asOf,
        matchedVia: m.matchedVia, entities: owner ? [owner] : [],
      });
      topValue.set(m.schemecode, p.marketValue);
    }
  }

  // How many of the book's own keys each scheme clubs — counted over the rows
  // that actually landed, so a skipped holding never inflates it.
  const keysPerScheme = new Map<string, Set<string>>();
  for (const p of scope) {
    const m = schemes.get(p.securityKey);
    if (!m || !byScheme.has(m.schemecode)) continue;
    const s = keysPerScheme.get(m.schemecode) ?? new Set<string>();
    s.add(p.securityKey);
    keysPerScheme.set(m.schemecode, s);
  }

  const rows = [...byScheme.values()].map((r) => ({
    ...r,
    keys: keysPerScheme.get(r.schemecode)?.size ?? 1,
    // DERIVED, and the row ties: move ÷ value is the printed percentage.
    move: (r.value * r.changePct) / 100,
  }));

  const coveredValue = rows.reduce((a, r) => a + r.value, 0);
  const move = rows.reduce((a, r) => a + r.move, 0);
  const dates = [...new Set(rows.map((r) => r.navDate))].sort().reverse();

  return {
    rows, skipped,
    coveredValue, move,
    // VALUE-WEIGHTED, and it ties to the two figures beside it by construction.
    // Averaging the rows' percentages would weight a ₹107 residual holding the
    // same as a ₹31 Cr one — a figure neither side supports.
    changePct: coveredValue > 0 ? (move / coveredValue) * 100 : null,
    scopeValue: scope.reduce((a, p) => a + p.marketValue, 0),
    scopeNames: new Set(scope.map((p) => p.securityKey)).size,
    navDates: dates,
    newestNavDate: dates[0] ?? null,
    oldestNavDate: dates[dates.length - 1] ?? null,
  };
}

/**
 * ── "DRASTIC" IS A LABEL ON A ROW THAT IS ALREADY THERE ─────────────────────
 *
 * The family asked to capture a drastic move, and a threshold is a judgement no
 * statement states. So it decides NOTHING: every covered row is drawn, ranked
 * by the size of its move, and this only chips the ones past a bound the card
 * states on its face. Getting it wrong costs a chip, not a figure — the same
 * standing `staggered` has on the transactions rollup, and the reason that one
 * is a label rather than a detector.
 *
 * 2% of a day is a deliberately loose bound for a diversified fund: this book's
 * whole covered set moved 0.19% on its last published day and its largest
 * single mover 0.96%, so nothing here is chipped today. It exists for the day
 * the family described — a metal ETF or a momentum fund on a rebalancing day.
 */
export const DRASTIC_PCT = 2;
export const isDrastic = (r: { changePct: number }) => Math.abs(r.changePct) >= DRASTIC_PCT;
