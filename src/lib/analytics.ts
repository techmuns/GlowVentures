// Shared aggregation math over positions & funds. Values are INR.
//
// The rollups that used to key off a free-text account label now take the
// account registry, because "which entity owns this" and "which platform holds
// this" are two different questions the account string cannot answer on its own.
import type { Account, FundInvestment, Position, StartupInvestment } from "./types";
import { accountIndex, custodyLabelOf, ownerOf } from "./accounts";

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Sum values that may be absent, and stay absent when they ALL are.
 *
 * A null in this book means the statement did not report the figure — not that
 * it reported zero. Coercing nulls to 0 and summing gives a total of 0, which
 * renders as a measurement of nothing rather than as the absence of one. So a
 * null contributes nothing to a total that has at least one real value, and a
 * column of nothing but nulls sums to null and renders "—".
 */
export const sumOrNull = (xs: (number | null | undefined)[]): number | null => {
  const seen = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return seen.length ? seen.reduce((a, b) => a + b, 0) : null;
};

/**
 * DUPLICATE POLICY — carry both, count once.
 *
 * PENDING CONFIRMATION FROM THE PROVIDER. Reversible policy, not a fact, and it
 * lives here alone on the app side (its twin is in scripts/ingest/reconcile.mjs)
 * so it can be changed in one place.
 *
 * The same position can be reported on two family members' statements — the
 * 360 ONE Special Opportunities Fund Series 8 Class A3 appears with identical
 * figures under both CRNs. Neither row is suppressed: an ACCOUNT or per-owner
 * view shows each statement exactly as printed. But a CONSOLIDATED family total
 * must count the holding once, or the book overstates itself.
 *
 * Use this — not a raw `sum(positions.map(p => p.marketValue))` — anywhere a
 * figure spans more than one owner.
 */
export function dedupedPositions(positions: Position[]): Position[] {
  const seen = new Set<string>();
  const out: Position[] = [];
  for (const p of positions) {
    if (p.dedupeGroup) {
      if (seen.has(p.dedupeGroup)) continue;
      seen.add(p.dedupeGroup);
    }
    out.push(p);
  }
  return out;
}

/** Consolidated market value, each dedupeGroup counted once. */
export const consolidatedMarketValue = (positions: Position[]) =>
  sum(dedupedPositions(positions).map((p) => p.marketValue));

/**
 * What the naive sum would have overstated by. Surfaced in the UI rather than
 * quietly absorbed, so the reader can see a duplicate was collapsed.
 */
export const doubleCountedValue = (positions: Position[]) =>
  sum(positions.map((p) => p.marketValue)) - consolidatedMarketValue(positions);

/**
 * PUBLIC vs PRIVATE, over any subset of positions — the split `BOOK_SUMMARY`
 * carries family-wide, computed the same way for one member's rows.
 *
 * The class list mirrors `PRIVATE_CLASSES` in `scripts/build-book.mjs` exactly.
 * It has to: two sites computing the same split from different rules is how a
 * page ends up disagreeing with the book it renders, and this one did — the
 * Family Dashboard labelled the WHOLE ₹335.43 Cr "Public (listed)" and rendered
 * private as absent with the reason "no private-market holding in this book",
 * while `BOOK_SUMMARY.privateValue` read ₹207.65 Cr. That reason was true of an
 * earlier drop and false from the moment the AIF statements got a reader — the
 * same stale premise CLAUDE.md records being corrected once already, reasserted
 * on a new page.
 *
 * `privateValue` is NOT `total − listed`: a class this list does not name would
 * then silently become private. Both sides are summed from the positions.
 */
const PRIVATE_CLASSES = new Set(["AIF", "Unlisted", "Structured Product"]);

export const isPrivateClass = (p: Position) => PRIVATE_CLASSES.has(p.assetClass);

export function publicPrivateSplit(positions: Position[]): { listed: number; private: number } {
  const rows = dedupedPositions(positions);
  return {
    listed: sum(rows.filter((p) => !isPrivateClass(p)).map((p) => p.marketValue)),
    private: sum(rows.filter(isPrivateClass).map((p) => p.marketValue)),
  };
}

/**
 * A FUND VEHICLE — one purchase of a MANAGER'S PORTFOLIO, never a share in a
 * company. THIS IS THE AXIS `isPrivateClass` DOES NOT ANSWER, and conflating
 * the two is what put fund units into this book's company-level views.
 *
 * `isPrivateClass` splits the book by how a holding is VALUED — a mark from an
 * exchange vs a mark from a manager. That is the right axis for "listed vs
 * private" and the wrong one for "is this a company". A mutual fund is marked
 * daily at a published NAV, so it is not private; it is also not a company, and
 * it has no GICS sector, no market cap, no NSE symbol, no P&L statement and no
 * concall. Every surface that asks a COMPANY question — a sector table, a
 * market-cap band, a stock page, a news search, a peer comparison — must key on
 * THIS predicate, not on that one.
 *
 * Sector Composition learnt it the expensive way. Excluding only the private
 * classes left "Unclassified" reading 49.0%, ₹88.6 Cr, with **Helios Flexi Cap
 * Fund at the head of a sector table** — a mutual fund taking the largest slice
 * of an equity chart while describing nothing. The classes named below are the
 * three that hold OTHER securities: an AIF folio, a mutual-fund scheme and an
 * ETF are all one line standing for a portfolio somebody else assembled.
 *
 * There is no look-through behind them and this book cannot invent one: a
 * fund's underlying holdings would need each scheme's own portfolio disclosure,
 * which the drop carries for exactly ONE scheme and does not join to any folio
 * the family holds. So a fund's value stays whole, inside its own fund row —
 * never spread across sectors it was never reported against.
 */
const FUND_CLASSES = new Set(["AIF", "Mutual Fund", "ETF"]);

/**
 * Takes anything carrying an `assetClass`, not just a `Position`: the holdings
 * table builds consolidated ROWS that are not positions, and a second copy of
 * this set living over there is exactly how two surfaces come to disagree.
 */
export const isFundVehicle = (p: { assetClass: string }) => FUND_CLASSES.has(p.assetClass);

/**
 * DIRECT EQUITY — a share in a company, held in the family's own demat or
 * bought for it under a manager's discretionary mandate.
 *
 * A PMS mandate is an ENGAGEMENT, not an asset class (see `Account.engagement`),
 * so the shares SVAN, Carnelian and Goldstandard hold for this family are the
 * same asset as the ones sitting in its own LKP demat and belong in the same
 * set. What is NOT in it is a fund unit: buying the Buoyant AIF is not buying
 * the companies Buoyant owns.
 */
export const isDirectEquity = (p: { assetClass: string }) => p.assetClass === "Equity";

/**
 * THE SCREEN LABEL FOR AN ASSET CLASS. One place, because a label that is
 * re-typed on each surface is a label that disagrees with itself.
 *
 * `AssetClass` (src/lib/types.ts) is the MODEL's vocabulary and does not change:
 * it is what `assertNormalized` enforces at ingest, what `precedence.mjs` and
 * `glowData.ts` are written in, and what every predicate above tests. Renaming
 * the value would rewrite the generated book for a wording change.
 *
 * What did have to change is the WORD ON SCREEN. `Equity` heads the largest
 * section of the holdings table, and the family read that heading as covering
 * the whole table — their AIF folios included — and reported the book as mixing
 * fund units into equity. It never did: `isDirectEquity` is `assetClass ===
 * "Equity"` and every AIF folio is its own `AIF` row in its own section. But a
 * heading a reader misreads is a defect in the heading. "Direct Equity" says
 * what the section actually contains — shares in companies, held in the family's
 * own demat or bought for it under a manager's mandate — and it is the phrase
 * `isDirectEquity`'s own doc comment, `SectorComposition` and `ExposureIPS`
 * already use in prose.
 *
 * Every other class is already unambiguous and passes through unchanged.
 */
const CLASS_LABEL: Record<string, string> = { Equity: "Direct Equity" };

export const assetClassLabel = (cls: string) => CLASS_LABEL[cls] ?? cls;

/** One asset class's contribution, for naming what a narrowed view left out. */
export type ClassSlice = { key: string; mv: number; count: number };

/**
 * The classes a narrowed view does NOT cover, largest first.
 *
 * A page that answers a company question over direct equity alone is answering
 * a narrower question than its heading implies, and the standing rule is that
 * the remainder is NAMED with its value rather than quietly dropped. Every
 * caller of `isDirectEquity` pairs it with this.
 */
export function excludedClasses(positions: Position[], keep: (p: Position) => boolean): ClassSlice[] {
  const m = new Map<string, { mv: number; count: number }>();
  for (const p of positions) {
    if (keep(p)) continue;
    const e = m.get(p.assetClass) ?? { mv: 0, count: 0 };
    e.mv += p.marketValue; e.count += 1;
    m.set(p.assetClass, e);
  }
  return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.mv - a.mv);
}

/**
 * A position whose statement reported a usable cost basis.
 *
 * Return analysis, contribution decomposition and the winners/losers split are
 * all questions about a gain, and a gain needs a cost. A depository holding
 * statement reports a value and no cost, so those positions cannot answer and
 * must be EXCLUDED — not defaulted to zero, which would report the whole value
 * as profit at an infinite return.
 *
 * Excluding them silently is the other half of the mistake: `unpriced()` counts
 * what was left out so a page can say "N of M positions, the rest report no cost
 * basis" instead of quietly answering a narrower question than the heading asks.
 */
export type PricedPosition = Position & { costBasis: number; unrealizedPnL: number; returnPct: number };

export const isPriced = (p: Position): p is PricedPosition =>
  !p.costUnavailable
  && typeof p.costBasis === "number" && Number.isFinite(p.costBasis) && p.costBasis > 0
  && typeof p.unrealizedPnL === "number" && Number.isFinite(p.unrealizedPnL)
  && typeof p.returnPct === "number" && Number.isFinite(p.returnPct);

/** The positions a cost-based figure cannot cover, for naming them on screen. */
export const unpriced = (positions: Position[]) => positions.filter((p) => !isPriced(p));

export type Bucket = {
  key: string; mv: number; cost: number | null; pnl: number | null;
  count: number; returnPct: number | null; weight: number;
  /** How many of `count` positions reported no cost — the rest of the bucket is still real. */
  withoutCost: number;
};

/**
 * Group positions and total them.
 *
 * COST AND P&L MAY BE ABSENT and are summed with `sumOrNull`, because a
 * depository holding statement reports a value and no cost. Adding those in as
 * zero would inflate the bucket's return by treating free shares as profit; the
 * bucket's cost stays null when NO position in it reported one, and
 * `withoutCost` names how many were skipped when some did — the "shown for those
 * and the rest are named" rule, at bucket level.
 *
 * Market value is not nullable and is summed plainly: every holdings statement
 * in this book prints one.
 */
export function bucketBy(positions: Position[], keyFn: (p: Position) => string): Bucket[] {
  const m = new Map<string, { mv: number; costs: (number | null)[]; pnls: (number | null)[]; count: number; withoutCost: number }>();
  for (const p of positions) {
    const k = keyFn(p);
    const c = m.get(k) ?? { mv: 0, costs: [], pnls: [], count: 0, withoutCost: 0 };
    c.mv += p.marketValue;
    c.costs.push(p.costBasis);
    c.pnls.push(p.unrealizedPnL);
    c.count += 1;
    if (p.costBasis === null || p.costBasis === undefined) c.withoutCost += 1;
    m.set(k, c);
  }
  const total = [...m.values()].reduce((s, v) => s + v.mv, 0);
  return [...m.entries()]
    .map(([key, v]) => {
      const cost = sumOrNull(v.costs);
      const pnl = sumOrNull(v.pnls);
      return {
        key,
        mv: v.mv,
        cost,
        pnl,
        count: v.count,
        withoutCost: v.withoutCost,
        // A return needs BOTH sides on the same basis. Null when either is
        // absent — not 0, which reads as "this bucket broke even".
        returnPct: cost !== null && pnl !== null && cost > 0 ? (pnl / cost) * 100 : null,
        weight: total > 0 ? v.mv / total : 0,
      };
    })
    .sort((a, b) => b.mv - a.mv);
}

/** By owning entity — resolved through the account registry, never from the account string. */
export const byEntity = (p: Position[], accounts: Account[]) => {
  const idx = accountIndex(accounts);
  return bucketBy(p, (x) => ownerOf(idx, x));
};

/** By custodian / manager — the provider on the account, or "Direct / In-house". */
export const byCustodian = (p: Position[], accounts: Account[]) => {
  const idx = accountIndex(accounts);
  return bucketBy(p, (x) => custodyLabelOf(idx, x));
};

export const bySector = (p: Position[]) => bucketBy(p, (x) => x.sector);
export const byAssetClass = (p: Position[]) => bucketBy(p, (x) => x.assetClass);

/** By security — the book's join key, so names with no ISIN consolidate correctly. */
export const bySecurity = (p: Position[]) => bucketBy(p, (x) => x.securityKey);

// Concentration: top-N positions by weight.
export function topByValue(p: Position[], n: number): Position[] {
  return [...p].sort((a, b) => b.marketValue - a.marketValue).slice(0, n);
}

// Indian financial year (1 Apr – 31 Mar).
export function fyStartYear(d: Date): number {
  const y = d.getFullYear();
  return d.getMonth() >= 3 ? y : y - 1;
}
export function fyLabel(startYear: number): string {
  return `FY${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// Fund rollups (Pre-IPO / PE / Debt).
export function fundTotals(funds: FundInvestment[]) {
  const committed = sum(funds.map((f) => f.committed));
  const drawn = sum(funds.map((f) => f.drawn));
  const distributed = sum(funds.map((f) => f.distributed));
  const currentValue = sum(funds.map((f) => f.currentValue));
  return {
    committed, drawn, distributed, currentValue,
    unfunded: Math.max(committed - drawn, 0),
    tvpi: drawn > 0 ? (distributed + currentValue) / drawn : null,
    dpi: drawn > 0 ? distributed / drawn : null,
  };
}

export function startupTotals(s: StartupInvestment[]) {
  const invested = sum(s.map((x) => x.invested));
  const fairValue = sum(s.map((x) => x.fairValue));
  return { invested, fairValue, moic: invested > 0 ? fairValue / invested : null, count: s.length };
}
