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
 * COMPANY SHARES — a share in a company, whoever pressed the button.
 *
 * A PMS mandate is an ENGAGEMENT, not an asset class (see `Account.engagement`),
 * so the shares SVAN, Carnelian and Goldstandard hold for this family are the
 * same asset as the ones sitting in its own demat and belong in the same set.
 * What is NOT in it is a fund unit: buying the Buoyant AIF is not buying the
 * companies Buoyant owns.
 *
 * IT USED TO BE CALLED `isDirectEquity`, AND THE NAME WAS THE BUG. The family
 * opened Jammu Kashmir Bank, saw it labelled "direct equity", and read on the
 * same page that Carnelian manages it — so the label was claiming something the
 * page itself contradicted two lines down. The set was right and its name was
 * not: these are company shares, and WHETHER THE FAMILY BOUGHT THEM OR A
 * MANAGER DID is a separate axis that this predicate never encoded and every
 * caption pretended it did. That axis is `holdingRoute` below.
 */
export const isCompanyShare = (p: { assetClass: string }) => p.assetClass === "Equity";

/**
 * HOW A HOLDING CAME TO BE HELD — the axis the "direct equity" label was
 * silently asserting.
 *
 * `Account.engagement` already carries it, read off each statement's own
 * wording and never defaulted. Nothing on screen was reading it, so ₹127 Cr of
 * shares a discretionary manager chose sat under the same word as ₹30 Cr the
 * family bought in its own demat. They are the same ASSET and a different
 * DECISION, and a reader deciding whether to sell needs to know which.
 */
export type HoldingRoute = "mandate" | "own" | "fund" | "unknown";

export function holdingRoute(engagement: string | null | undefined): HoldingRoute {
  switch (engagement) {
    case "PMS": return "mandate";
    case "Direct": case "Execution": return "own";
    case "AIF": case "Distribution": case "Advisory": return "fund";
    default: return "unknown";
  }
}

/** How to say it on screen, in the second person the rest of the app uses. */
export const ROUTE_LABEL: Record<HoldingRoute, string> = {
  mandate: "manager's mandate",
  own: "own account",
  fund: "fund vehicle",
  unknown: "route not stated",
};

/** The longer form, for a caption that has room to explain the difference. */
export const ROUTE_NOTE: Record<HoldingRoute, string> = {
  mandate: "chosen by a discretionary manager under a PMS mandate — the family owns the shares, the manager decides them",
  own: "bought in the family's own demat or broking account",
  fund: "one purchase of a manager's portfolio, not of the companies inside it",
  unknown: "no statement for this account states how it is run",
};

/**
 * THE SCREEN LABEL FOR AN ASSET CLASS. One place, because a label that is
 * re-typed on each surface is a label that disagrees with itself.
 *
 * `AssetClass` (src/lib/types.ts) is the MODEL's vocabulary and does not change:
 * it is what `assertNormalized` enforces at ingest, what `precedence.mjs` and
 * `glowData.ts` are written in, and what every predicate above tests. Renaming
 * the value would rewrite the generated book for a wording change.
 *
 * What did have to change is the WORD ON SCREEN, and it took two goes to get a
 * word that carries no second claim.
 *
 * `Equity` heads the largest section of the holdings table, and the family read
 * that heading as covering the whole table — their AIF folios included — and
 * reported the book as mixing fund units into equity. It never did. So the
 * heading became **"Direct Equity"**, which fixed that misreading and
 * introduced another: the family opened Jammu Kashmir Bank, saw it chipped
 * Direct Equity, and read two lines below that Carnelian manages it. "Direct"
 * asserts WHO CHOSE THE POSITION, and for ₹127 Cr of this book a discretionary
 * manager did.
 *
 * **"Company Shares"** carries neither claim. It cannot be misread as holding
 * fund units — a fund is not a company — and it says nothing about whose
 * decision it was, which is a separate axis with its own vocabulary
 * (`holdingRoute` below) now that something on screen finally reads it.
 *
 * Every other class is already unambiguous and passes through unchanged.
 */
const CLASS_LABEL: Record<string, string> = { Equity: "Company Shares" };

export const assetClassLabel = (cls: string) => CLASS_LABEL[cls] ?? cls;

/**
 * ── THE THIRD TIME THE SAME COMPLAINT ARRIVED, THE WORD WAS NEVER THE PROBLEM ──
 *
 * "Direct Equity" was read as a claim about who chose the position, so it became
 * "Company Shares". The family came back a third time and said what they had
 * meant all along, plainly: *a stock held through a PMS or an AIF should be
 * shown INSIDE that mandate's drill-down, and Direct Equity should mean shares
 * held directly.* That is not a request for a better label. It is a request for
 * a different GROUPING — and once the grouping is right, "Direct Equity" becomes
 * TRUE and goes back on the heading, which is why `CLASS_LABEL` above now reads
 * the word the first two rounds could not honestly use.
 *
 * SO THE TWO WORDS NAME TWO DIFFERENT SETS, and both are now true of theirs.
 * `assetClassLabel("Equity")` stays **"Company Shares"** — it answers "what IS
 * this?", and a share a manager picked is a company share exactly like one the
 * family picked. `DIRECT_EQUITY_BUCKET` is **"Direct Equity"**, and it answers
 * "who chose it?", which is the holdings-table question and the narrower set.
 * Neither can be misread as the other, because neither is being asked to carry
 * both claims — which is what the first two rounds each tried to make one word do.
 *
 * `assetClass` does not move. §5 stands: PMS is an ENGAGEMENT, never an asset
 * class, and `assertNormalized` still rejects a document that says otherwise.
 * The shares Carnelian holds for this family ARE ordinary listed equity. What
 * changes is only how the holdings tables GROUP them, and this is the one place
 * that decides it — a bucket re-derived per screen is a bucket that disagrees
 * with itself, which is exactly how "Direct Equity" survived on the Morning CIO
 * allocation row after every other surface had stopped saying it.
 *
 * A mandate's CASH SLEEVE buckets with it deliberately. The Carnelian mandate is
 * worth what its statement says it is worth — ₹39.53 Cr of shares and cash — so
 * bucketing the cash elsewhere would make the mandate row disagree with the
 * document it came from. That also gives every mandate row a figure that ties to
 * an account total, which is the check that keeps this honest.
 */
export const DIRECT_EQUITY_BUCKET = "Direct Equity";
export const MANDATE_BUCKET = "PMS mandates";
/** Shares whose account states no engagement — neither claim can be made. */
export const UNROUTED_EQUITY_BUCKET = "Equity — how it is held is not stated";

/**
 * Which bucket a holding belongs to on a HOLDINGS TABLE.
 *
 * Keys are strings, and every class that is not touched passes through as its
 * own `assetClass`, so a caller can keep grouping on one key and still get AIF,
 * Mutual Fund, ETF, Cash and Unlisted exactly where they were.
 *
 * `engagement` comes from the ACCOUNT (`engagementOf`), never from the position:
 * how a holding is run is a fact about the account that holds it, and reading it
 * off the position is what would let two rows of one mandate land in two
 * buckets.
 */
export function holdingBucket(p: { assetClass: string }, engagement: string | null | undefined): string {
  const route = holdingRoute(engagement);
  // A mandate takes its whole account — the shares AND the cash sleeve beside
  // them — because that is what the manager runs and what the statement totals.
  if (route === "mandate") return MANDATE_BUCKET;
  /**
   * AN UNREADABLE ENGAGEMENT DOES NOT BECOME "DIRECT".
   *
   * `Account.engagement` is `unknown` where no statement states how the account
   * is run, and it is never defaulted (§5). Falling through to Direct Equity
   * here would restore the exact bug being fixed, one rung down: a share nobody
   * can show the family picked, filed under the heading that says they did. No
   * account in this drop is in that state, which is precisely why it has to be
   * written now — the first one that arrives would otherwise land silently in
   * the wrong bucket.
   */
  if (p.assetClass === "Equity") return route === "own" ? DIRECT_EQUITY_BUCKET : UNROUTED_EQUITY_BUCKET;
  return p.assetClass;
}

/**
 * ── WHEN A RETURN ON COST MAY BE PRINTED BESIDE THE VALUE IT IS STRUCK OVER ──
 *
 * `sumOrNull` skips a holding whose statement reports no cost rather than
 * entering it as zero, which is right — and it leaves Invested covering a
 * NARROWER SET of holdings than Market value in the same row. A return divides
 * one by the other, so where the two sets differ materially the printed figure
 * describes neither column beside it: Direct Equity reports a cost on 9 of its
 * 37 holdings, and a return on cost read −18.9% in a row printing ₹1.22 Cr
 * invested against ₹94.9 Cr current. Every figure was right on its own terms.
 *
 * So a return is struck only where the costed holdings account for essentially
 * the whole set, to half a percent of its market value. Measured on this book
 * that keeps AIF (₹98,742 uncovered of ₹352.3 Cr) and the PMS mandates (fully
 * costed), and refuses Direct Equity, Mutual Fund and ETF.
 *
 * IT LIVES HERE BECAUSE TWO SCREENS ASK IT OF THE SAME BUCKETS. Morning CIO's
 * allocation table and the Portfolio Monitor's per-category totals row both
 * print a return per bucket, and a test copied into each is two chances for one
 * screen to show a figure the other refuses for the same category — this book's
 * most expensive recurring bug, and the reason `holdingBucket` itself is a
 * single function rather than a per-page reflex.
 */
const COST_COVERAGE_TOLERANCE = 0.005;   // not exported: nothing outside reads it, and an uncalled export is the dead-builder failure this book keeps naming
/**
 * `mv` is the set's whole market value; `uncostedMV` the part of it whose
 * holdings report no cost. An empty set never licenses a return.
 */
export const costCoversSet = (mv: number, uncostedMV: number) =>
  mv > 0 && uncostedMV <= mv * COST_COVERAGE_TOLERANCE;

/** The screen label for a bucket. Class keys fall through to `assetClassLabel`. */
export const bucketLabel = (key: string) => (key === MANDATE_BUCKET ? MANDATE_BUCKET : assetClassLabel(key));

/**
 * DIRECT EQUITY, MEANING WHAT THE WORDS SAY: a share the family bought itself.
 *
 * `isCompanyShare` is deliberately NOT this and deliberately stays. The two
 * answer different questions and both are asked in this app:
 *
 *   isCompanyShare  — "is this a share in a company?"  A PMS-held share is, and
 *                     it has a GICS sector, a market cap, an NSE symbol and a
 *                     concall exactly like any other. Sector Composition,
 *                     Exposure & IPS, Compare and the market-cap bands must keep
 *                     using it: narrowing THOSE to own-held shares would throw
 *                     away ₹127.12 Cr of real sector exposure and leave a sector
 *                     table built from depository rows that carry no sector at
 *                     all. A look-through into a mandate is a gain for exposure
 *                     analysis, not something to undo.
 *   isDirectEquity  — "did the family choose this?"  That is the holdings-table
 *                     question, and the one the family has now asked three times.
 */
export const isDirectEquity = (p: { assetClass: string }, engagement: string | null | undefined) =>
  p.assetClass === "Equity" && holdingRoute(engagement) === "own";

/** Held under a discretionary mandate — the set that rolls up into its manager. */
export const isMandateHeld = (engagement: string | null | undefined) =>
  holdingRoute(engagement) === "mandate";

/**
 * WHAT TO CALL A MANDATE ON SCREEN — and why it needs a helper at all.
 *
 * A mandate's own name is `Account.strategy`, which the statements print
 * ("CARNELIAN BESPOKE PORTFOLIO", "Aristos Equity Portfolio"). Four of this
 * book's ten mandates SHARE that name with another one, because the same
 * strategy is run for two family members: Goldstandard's Aristos for Ankita and
 * Ajay, SVAN's Velocity for Ajay and Bharat, Green Lantern's GLC Growth Fund
 * for Ankita and Ajay, V.E.C Assago's Small and Mid-Cap Growth for both. Listed
 * on strategy alone that is four pairs of rows that look like duplicates of each
 * other, and a reader who sees "Aristos Equity Portfolio" twice with two
 * different values has no way to tell which is whose.
 *
 * So the OWNER is part of the name wherever mandates are listed together, and it
 * is derived here rather than re-typed per surface. An account with no strategy
 * printed falls back to its provider — the manager is at least a fact the
 * statement states.
 */
export function mandateLabel(a: Account | undefined): string {
  if (!a) return "Mandate not in the account registry";
  return a.strategy || a.provider || "Mandate not named on its statement";
}

/** The same name, qualified by whose money it runs — for lists of mandates. */
export function mandateLabelWithOwner(a: Account | undefined, owner: string): string {
  const base = mandateLabel(a);
  return owner ? `${base} · ${owner}` : base;
}

/** One asset class's contribution, for naming what a narrowed view left out. */
export type ClassSlice = { key: string; mv: number; count: number };

/**
 * The classes a narrowed view does NOT cover, largest first.
 *
 * A page that answers a company question over company shares alone is answering
 * a narrower question than its heading implies, and the standing rule is that
 * the remainder is NAMED with its value rather than quietly dropped. Every
 * caller of `isCompanyShare` pairs it with this.
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

// ── ABSOLUTE vs ANNUALISED (CAGR) RETURN ON A HOLDING ───────────────────────
//
// "There should be a toggle between absolute and CAGR return… more than one
// year it'll be CAGR, less than one year I'd rather see absolute."
//
// THE GUARD IS THE FEATURE. An annualised rate is a claim about a YEAR, and
// compounding a short window onto one is how this book once put +99.0% on the
// Morning CIO strip over a 132-day window (Stage 10g(ii)) — every step of which
// reproduced, and all of which was a lie about a year. The same failure is
// already sitting in the archive: `positionIrrPct`, which the PMS statements
// publish per position, reaches **+47,695%** on this book and reads 193.9% for
// a holding whose return on cost is 56.5%. It is the provider annualising a
// few months. So it is NOT a CAGR source here and this never reads it.
//
// The window can only come from `Position.heldSince` — the oldest unit still
// held — which `build-book` emits only where the lot register accounts for the
// units held exactly. That is a handful of positions; on every other one the
// honest answer is that nobody reported when the holding was bought.

/** India's long-term threshold, and the shortest window that may be annualised. */
export const YEAR_DAYS = 365;

export type ReturnMode = "absolute" | "cagr";

export type HoldingReturn =
  /** Return on cost over the whole holding, un-annualised. */
  | { kind: "absolute"; pct: number; heldDays: number | null }
  /** Annualised — licensed only by a measured window of at least a year. */
  | { kind: "cagr"; pct: number; heldDays: number; since: string }
  /** No figure, and the reason a reader needs in order to act on it. */
  | { kind: "absent"; reason: string };

const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000);

/**
 * The return to render for one holding, on the mode the reader picked.
 *
 * `asOf` is the book's own report date, never `new Date()`: closing against
 * today on one page and the statement date on another gave the same
 * measurement two values once already (see the XIRR notes in CLAUDE.md).
 *
 * Absolute mode is the column this table has always shown. CAGR mode annualises
 * ONLY where the window is measured and at least a year; under a year it falls
 * back to the ABSOLUTE figure and says so, which is what was asked for; and
 * where the holding's start is unknown it renders absent, because a rate over
 * an unknown window is not a weaker figure, it is not a figure.
 */
export type Holdable = { returnPct: number | null; heldSince: string | null };

export function holdingReturn(p: Holdable, mode: ReturnMode, asOf: string): HoldingReturn {
  const pct = p.returnPct;
  const heldDays = p.heldSince ? daysBetween(p.heldSince, asOf) : null;
  if (pct === null || pct === undefined) {
    return { kind: "absent", reason: "no statement in this book reports a cost for this holding, so it has no return to strike" };
  }
  if (mode === "absolute") return { kind: "absolute", pct, heldDays };

  if (heldDays === null) {
    return {
      kind: "absent",
      reason: "annualising needs to know when this holding was bought, and no statement covering it reports a purchase date — "
        + "the managed accounts publish a capital-account ledger rather than a lot register. Switch to Absolute for its return on cost.",
    };
  }
  // THE GUARD, stated positively: under a year the absolute figure stands, and
  // is labelled absolute so the column never passes one basis off as the other.
  if (heldDays < YEAR_DAYS) return { kind: "absolute", pct, heldDays };
  // (1 + r)^(365/days) − 1, on the return already struck against cost. A cost
  // at or below zero has no compound rate and is refused upstream by `returnPct`.
  const years = heldDays / YEAR_DAYS;
  const growth = 1 + pct / 100;
  if (growth <= 0) {
    return { kind: "absent", reason: "this holding is worth nothing against its cost, so it has no compound rate — only a total loss" };
  }
  return { kind: "cagr", pct: (Math.pow(growth, 1 / years) - 1) * 100, heldDays, since: p.heldSince! };
}

/** How many rows each state covers, for the caption under a CAGR column. */
export function returnModeCoverage(positions: Holdable[], mode: ReturnMode, asOf: string) {
  let cagr = 0, absolute = 0, absent = 0;
  for (const p of positions) {
    const r = holdingReturn(p, mode, asOf);
    if (r.kind === "cagr") cagr++;
    else if (r.kind === "absolute") absolute++;
    else absent++;
  }
  return { cagr, absolute, absent, total: positions.length };
}

// ── YEAR-TO-DATE ON THE HOLDING ITSELF ──────────────────────────────────────
//
// "Add YTD and calendar-year columns for the holding itself, not just the
// security's market return… if it is not possible to show data then just show
// a dash."
//
// THE DISTINCTION IN THAT SENTENCE IS THE WHOLE PROBLEM. What a SHARE did since
// 1 January is a market fact and `/api/prices` serves it. What THIS FAMILY's
// holding did over the same window is a different measurement: it needs the
// holding's own value on 1 January and every purchase and sale since, because a
// position bought in March did not earn the market's Jan–Mar move.
//
// MEASURED OVER `public/audit/`, the book carries neither for a holding that
// predates the year: the earliest holdings statement of any account is dated
// 2026-03-31 and the transaction tape runs 2026-04-01 onward, with zero trades
// and zero valuations on or before 1 January. `BOOK_POSITIONS` is one dated
// snapshot per account, so there is no opening value to measure a year from.
//
// ONE CASE IS GENUINELY MEASURABLE and is the reason this is a function rather
// than a constant dash: a holding OPENED DURING THE YEAR did not exist on 1
// January, so it has no opening value to be missing — its year-to-date return
// simply IS its return since purchase. That needs `heldSince`, which carries the
// same lot-coverage gate as everything else here. On this drop it fires for no
// position (all three dated holdings were opened in 2025), and it will fire on
// its own the first time a drop brings a within-year purchase through the gate.

export type HoldingYtd =
  /** Opened during the year: its whole return IS its year to date. */
  | { kind: "since-open"; pct: number; since: string }
  | { kind: "absent"; reason: string };

/**
 * The holding's own year-to-date return, or the reason there isn't one.
 *
 * `asOf` is the book's report date, so the "year" is the calendar year that
 * date falls in — never `new Date()`, which would roll the window over at
 * midnight on a page showing figures struck in August.
 */
export function holdingYtd(p: Holdable, asOf: string): HoldingYtd {
  const yearStart = `${asOf.slice(0, 4)}-01-01`;
  if (!p.heldSince) {
    return {
      kind: "absent",
      reason: "a year-to-date return on the holding needs its value on 1 January, and no statement covering it reports "
        + "when it was bought or what it was worth then — the book carries one dated snapshot per account and none predates the year.",
    };
  }
  if (p.heldSince < yearStart) {
    return {
      kind: "absent",
      reason: `this holding was already held on 1 January (since ${p.heldSince}), so its year-to-date return needs its value on that date. `
        + "No statement in this book is dated before the year began, so there is no opening value to measure from — "
        + "the share's own market move since January is a different figure and is not shown in its place.",
    };
  }
  if (p.returnPct === null || p.returnPct === undefined) {
    return { kind: "absent", reason: "this holding was opened during the year, but no statement reports a cost for it, so there is nothing to measure a return against" };
  }
  // Opened this year: no opening value is MISSING, because there was none.
  return { kind: "since-open", pct: p.returnPct, since: p.heldSince };
}

/** How many rows the YTD column can and cannot answer, for its caption. */
export function ytdCoverage(positions: Holdable[], asOf: string) {
  let measured = 0;
  for (const p of positions) if (holdingYtd(p, asOf).kind === "since-open") measured++;
  return { measured, absent: positions.length - measured, total: positions.length };
}
