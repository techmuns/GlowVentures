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
// asked; AMFI's own daily NAV file can (`src/data/fundNavs.ts`, refreshed every
// morning and the one `applyFundNavs` prices every other surface from), and the
// look-through store in `public/lookthrough/` answers for the schemes that file
// does not carry — on this book, the two DSP ETFs.
//
// AND AN AIF CANNOT BE ANSWERED BY EITHER, which the family said first: *"AIF
// में monthly NAV आएगा"*. No AIF folio resolves a scheme in the store and none
// publishes a daily NAV, so they are out of scope here by the instrument rather
// than by a filter — and `scopeNote` says so rather than leaving it silent.
//
// ── THE TWO MEASUREMENTS ARE NEVER BLENDED, AND THAT IS THE WHOLE RULE ──────
//
// A live quote is intraday TODAY. A published NAV is a SCHEME's last struck NAV
// against the one before it — struck after the close for the previous business
// day, and dated. Summing a NAV move into the quote card's percentage would print a
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
import { fundNavFor, type FundNav } from "./fundNavs";
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
  /**
   * WHICH PUBLISHED NAV THIS ROW IS ON — and there is one per scheme, the same
   * on every surface (B-02).
   *
   *   · `amfi` — AMFI's own daily NAV file (`src/data/fundNavs.ts`), the one
   *     `applyFundNavs` prices every other surface from. Every scheme that file
   *     carries is on it here too.
   *   · `lookthrough` — the fund look-through store, ONLY for a scheme AMFI's
   *     file does not carry. On this book that is the two DSP ETFs, whose
   *     statement ISINs are not in AMFI's file; no other surface prices them by
   *     NAV, so their one NAV is this one, and the row says whose it is.
   */
  source: "amfi" | "lookthrough";
  /** The published NAV and the one before it, with both dates. */
  nav: number;
  navDate: string;
  prevNav: number;
  prevNavDate: string;
  /** The scheme's own published move. A fact about the SCHEME. */
  changePct: number;
  /**
   * What the book values these holdings at: units × AMFI's published NAV where
   * the overlay priced them (`navPriced`), and the statement's own mark
   * otherwise. `valueBasis` says which, per row, because the two are dated
   * differently and one row can carry either.
   */
  value: number;
  valueBasis: "nav" | "statement" | "mixed";
  /** DERIVED: the scheme's move applied to that value. `move / value === changePct`. */
  move: number;
  /** The newest statement date behind `value`, so the two bases can be told apart. */
  valueAsOf: string | null;
  /** Units held across the row's statements. */
  quantity: number;
  /**
   * THE BOOK'S VALUE PER UNIT OVER THIS NAV, where both are known.
   *
   * ≈1 where the units and the NAV are the same unit. On the DSP ETFs it is
   * ≈10: the depository's units and the AMC's NAV unit differ (Stage 10aw), so
   * `units × NAV` would put ₹20 Cr of gold at ₹2 Cr. Only the PERCENTAGE move is
   * ever applied, and a row whose ratio is past `UNIT_BASIS_BOUND` says so.
   */
  unitRatio: number | null;
  /**
   * WHETHER THIS ROW IS IN THE DAY'S FIGURE ON THE TILE. A row struck on an
   * older day than the newest is listed — with its own date — and kept out of
   * the tile's sum, which would otherwise add a 9 Sep move into a figure headed
   * 22 Sep (rule 8).
   */
  inDayFigure: boolean;
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
  /** Σ value over the rows IN THE DAY'S FIGURE — the denominator the aggregate divides. */
  coveredValue: number;
  /** Σ move over those rows. */
  move: number;
  /** `move / coveredValue`, or null where nothing is covered. */
  changePct: number | null;
  /** Rows listed on an older published day, and kept out of the figure above. */
  olderRows: number;
  olderValue: number;
  /** Every holding in scope, priced or not. */
  scopeValue: number;
  scopeNames: number;
  /**
   * THE LIQUID FUNDS AND LIQUID ETFs THIS CARD DOES NOT COVER (MNT-15). The
   * family's rule files them under Cash whatever wrapper the statement typed
   * (Stage 10av), so they are out of "ETFs & mutual funds" by the bucket — and
   * a coverage line reading "of the ₹113 Cr held" read as all of the family's
   * funds while ₹14 Cr of them were elsewhere. Named, never silently dropped.
   */
  cashFunds: { value: number; names: number };
  /** The NAV dates the rows span, newest first. More than one is normal. */
  navDates: string[];
  /** Newest and oldest NAV date across the rows. */
  newestNavDate: string | null;
  oldestNavDate: string | null;
};

/**
 * PAST THIS RATIO THE BOOK'S UNITS AND THE PUBLISHED NAV ARE NOT ONE UNIT.
 * The factor of two `build-fund-navs` gates `usableForValue` on — a claim about
 * markets (no scheme halves or doubles between two statement dates absent a
 * corporate action), not a tolerance fitted to the data. Measured: the funds
 * AMFI prices sit at 0.92–1.14, the DSP ETFs at 9.7 and 12.3.
 */
export const UNIT_BASIS_BOUND = 2;
export const unitBasisDiffers = (r: { unitRatio: number | null }) =>
  r.unitRatio != null && (r.unitRatio > UNIT_BASIS_BOUND || r.unitRatio < 1 / UNIT_BASIS_BOUND);

/** The one AMFI record a holding resolves to, in the shape this card needs. */
export type AmfiNav = Pick<FundNav, "schemecode" | "scheme" | "plan" | "nav" | "date" | "prev" | "prevDate" | "changePct">;

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
 * match: each source resolved each securityKey to its schemecode on the ISIN,
 * and this clubs what the source already joined. The book keeps the two keys
 * apart everywhere else, which is correct — they are different holdings in
 * different accounts — and the row says how many it clubs.
 *
 * ── AND THE NAV IS AMFI'S, THE ONE EVERY OTHER SURFACE PRICES FROM (B-02) ───
 *
 * This card read the look-through store's NAVs (9 Sep) while the Portfolio
 * Monitor, the stock page and the top bar price the same schemes on AMFI's
 * daily file (22 Sep) — Helios ₹16.22 here, ₹16.15 everywhere else, and a day's
 * move of the opposite sign. `amfiFor` is now asked FIRST, and the look-through
 * store answers only for a scheme AMFI's file does not carry.
 */
export function navMoverModel(
  positions: readonly Position[],
  accIdx: AccountIndex,
  /** The look-through store — a FALLBACK only. `null` = it did not answer. */
  schemes: Map<string, SchemeMatch> | null,
  amfiFor: (securityKey: string) => AmfiNav | null = (k) => fundNavFor({ securityKey: k }),
): NavMoverModel {
  const inScope = (p: Position) =>
    (NAV_MOVER_BUCKETS as readonly string[]).includes(holdingBucket(p, engagementOf(accIdx, p)));
  const scope = positions.filter(inScope);
  const cashFundRows = positions.filter((p) =>
    (p.assetClass === "Mutual Fund" || p.assetClass === "ETF")
    && holdingBucket(p, engagementOf(accIdx, p)) === "Cash");

  type Acc = Omit<NavMover, "keys" | "move" | "unitRatio" | "inDayFigure" | "valueBasis"> & { navValue: number; stValue: number };
  const byScheme = new Map<string, Acc>();
  /**
   * The largest holding behind each scheme, so the row can NAME it. Kept beside
   * the rows rather than smuggled onto them as a private field: a `_top` that
   * has to be cast on and deleted off again is a field the type says is not
   * there, and the next reader has to prove it never escapes.
   */
  const topValue = new Map<string, number>();
  const keysPerScheme = new Map<string, Set<string>>();
  const skipped: NavMoverSkip[] = [];

  for (const p of scope) {
    const a = amfiFor(p.securityKey);
    const m = a ? null : schemes?.get(p.securityKey) ?? null;
    // ONE RECORD PER HOLDING, FROM ONE SOURCE, in one shape.
    const rec = a
      ? { source: "amfi" as const, schemecode: a.schemecode, scheme: a.scheme, plan: a.plan,
          nav: a.nav, date: a.date, prev: a.prev ?? null, prevDate: a.prevDate ?? null, changePct: a.changePct,
          matchedVia: "isin" }
      : m
        ? { source: "lookthrough" as const, schemecode: m.schemecode, scheme: m.scheme, plan: m.plan,
            nav: m.nav?.value ?? null, date: m.nav?.date ?? null, prev: m.nav?.prev ?? null, prevDate: m.nav?.prevDate ?? null,
            changePct: m.nav?.changePct ?? null, matchedVia: m.matchedVia }
        : null;
    // A HOLDING NO SOURCE CAN PRICE IS NAMED, NEVER ZERO. The states are
    // different facts and are worded apart — no source resolves it at all, the
    // look-through store did not answer, a scheme with no NAV, and a scheme with
    // a NAV but no previous one to measure a move against. Only the last is a
    // "wait for tomorrow".
    if (!rec) {
      skipped.push({ securityKey: p.securityKey, security: p.security, value: p.marketValue,
        reason: schemes === null
          ? "AMFI's daily NAV file carries no NAV for this scheme, and the look-through store — the only other source of one — did not respond"
          : "neither AMFI's daily NAV file nor the look-through store resolves this holding" });
      continue;
    }
    if (rec.nav == null || rec.date == null) {
      skipped.push({ securityKey: p.securityKey, security: p.security, value: p.marketValue,
        reason: `${rec.scheme} resolves, and the ${rec.source === "amfi" ? "AMFI file" : "look-through store"} carries no NAV for it` });
      continue;
    }
    if (rec.prev == null || rec.prevDate == null || rec.changePct == null) {
      skipped.push({ securityKey: p.securityKey, security: p.security, value: p.marketValue,
        reason: `${rec.scheme} has one published NAV and no earlier one to measure a move against` });
      continue;
    }
    const id = `${rec.source}:${rec.schemecode}`;
    const owner = accIdx.get(p.accountId)?.owner ?? null;
    const asOf = accIdx.get(p.accountId)?.asOf ?? null;
    const onNav = !!p.navPriced;
    const ks = keysPerScheme.get(id) ?? new Set<string>();
    ks.add(p.securityKey); keysPerScheme.set(id, ks);
    const cur = byScheme.get(id);
    if (cur) {
      cur.value += p.marketValue;
      // A review line with no unit count never reaches this card — its scope is
      // mutual funds and ETFs, and the review's lines are AIFs and unlisted
      // holdings (Stage 10dh) — so a null adds nothing here.
      cur.quantity += p.quantity ?? 0;
      if (onNav) cur.navValue += p.marketValue; else cur.stValue += p.marketValue;
      cur.positions += 1;
      if (owner && !cur.entities.includes(owner)) cur.entities.push(owner);
      if (asOf && (!cur.valueAsOf || asOf > cur.valueAsOf)) cur.valueAsOf = asOf;
      // The row NAMES the largest holding behind it and opens that one, so a
      // reader lands on the position they recognise rather than whichever
      // statement happened to sort first.
      if (p.marketValue > (topValue.get(id) ?? -Infinity)) {
        topValue.set(id, p.marketValue);
        cur.security = p.security;
        cur.securityKey = p.securityKey;
      }
    } else {
      byScheme.set(id, {
        schemecode: rec.schemecode, plan: rec.plan, source: rec.source,
        // THE SAME NAME THIS BOOK SHOWS EVERYWHERE ELSE. The sources' own
        // `scheme` is AMFI's raw listing string, which is a THIRD spelling of a
        // scheme the holdings tables and this card both name — so it is
        // composed through `schemeLabel` and falls back to the raw string only
        // where no scheme resolved.
        scheme: (() => { const sn = schemeNameFor(p.securityKey); return sn ? composeSchemeLabel(sn) : rec.scheme; })(),
        security: p.security, securityKey: p.securityKey,
        positions: 1,
        nav: rec.nav, navDate: rec.date, prevNav: rec.prev, prevNavDate: rec.prevDate,
        changePct: rec.changePct,
        value: p.marketValue, valueAsOf: asOf, quantity: p.quantity ?? 0,
        navValue: onNav ? p.marketValue : 0, stValue: onNav ? 0 : p.marketValue,
        matchedVia: rec.matchedVia, entities: owner ? [owner] : [],
      });
      topValue.set(id, p.marketValue);
    }
  }

  const dates = [...new Set([...byScheme.values()].map((r) => r.navDate))].sort().reverse();
  const newest = dates[0] ?? null;
  const rows: NavMover[] = [...byScheme.entries()].map(([id, r]) => {
    const { navValue, stValue, ...rest } = r;
    const perUnit = r.quantity > 0 ? r.value / r.quantity : null;
    return {
      ...rest,
      keys: keysPerScheme.get(id)?.size ?? 1,
      valueBasis: stValue === 0 ? "nav" : navValue === 0 ? "statement" : "mixed",
      unitRatio: perUnit != null && r.nav > 0 ? perUnit / r.nav : null,
      inDayFigure: r.navDate === newest,
      // DERIVED, and the row ties: move ÷ value is the printed percentage.
      move: (r.value * r.changePct) / 100,
    };
  });

  const day = rows.filter((r) => r.inDayFigure);
  const older = rows.filter((r) => !r.inDayFigure);
  const coveredValue = day.reduce((a, r) => a + r.value, 0);
  const move = day.reduce((a, r) => a + r.move, 0);

  return {
    rows, skipped,
    coveredValue, move,
    // VALUE-WEIGHTED, and it ties to the two figures beside it by construction.
    // Averaging the rows' percentages would weight a ₹107 residual holding the
    // same as a ₹31 Cr one — a figure neither side supports.
    changePct: coveredValue > 0 ? (move / coveredValue) * 100 : null,
    olderRows: older.length,
    olderValue: older.reduce((a, r) => a + r.value, 0),
    scopeValue: scope.reduce((a, p) => a + p.marketValue, 0),
    scopeNames: new Set(scope.map((p) => p.securityKey)).size,
    cashFunds: {
      value: cashFundRows.reduce((a, p) => a + p.marketValue, 0),
      names: new Set(cashFundRows.map((p) => p.securityKey)).size,
    },
    navDates: dates,
    newestNavDate: newest,
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
