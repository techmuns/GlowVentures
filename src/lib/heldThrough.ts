/**
 * ── EVERY WAY THE FAMILY HOLDS ONE COMPANY ───────────────────────────────────
 *
 *   *"I type a stock, I want to know how much I'm holding directly and how
 *    much I'm holding through managers… Which are the other managers owning it,
 *    or I am owning it through which other managers… why should it not show me
 *    as a line item holding it through mutual fund here?"*
 *
 * The company page's "Position by account" table listed the accounts whose
 * STATEMENTS report the share — the family's own demat and the PMS mandates —
 * and nothing else. ICICI Bank read ₹2.88 Cr across three accounts while
 * ₹2.70 Cr more of it sat inside ten mutual funds the family holds, and the
 * page said nothing about it at all. The look-through that knows that has
 * existed since the Portfolio Monitor's stock axis (Stage 10aj); this page
 * simply never read it.
 *
 * So one company's holding is split here into the ROUTES a reader asks about,
 * and each route is a tab on that table:
 *
 *   direct   the family's own demat or broking account     (`own` route)
 *   manager  a discretionary manager's PMS mandate          (`mandate` route)
 *   fund     inside a mutual fund or ETF the family holds    (DERIVED)
 *   other    a statement that states no route this book reads (none today)
 *
 * ── TWO KINDS OF FIGURE, AND THEY ARE KEPT APART ────────────────────────────
 *
 * The first two are the book's own: each is a POSITION some statement reports,
 * with a quantity, a mark and usually a cost. The third is not a position at
 * all. The AMC disclosed what the FUND holds, and the family's share of it is
 * derived from the units they own — `familyValue`, the same function the stock
 * axis uses. It is therefore:
 *
 *   • never added into a measured total — `measured` below is the book's own
 *     figure and `derived` is a separate field, so a caller can print either
 *     and can never blend them by accident (the rule `companyExposure` holds);
 *   • one line PER ACCOUNT holding the fund, because the question was "which
 *     member holds it through which fund". The fund's disclosed weight is a
 *     fact about the FUND, so every member's line carries the same weight and
 *     only the member's own holding differs — `Σ lines` is the fund's
 *     consolidated share wherever no holding is reported twice;
 *   • dated differently from the book (the filing is monthly), and every line
 *     carries the filing's own date.
 *
 * AN AIF DISCLOSES NOTHING THIS BOOK CAN JOIN, and that is a fact about the
 * instrument rather than a gap in the store (`skipReason` in `lookthrough.ts`).
 * It is carried through as a count and a value so the table can say so, rather
 * than letting a reader take "no AIF line" for "no AIF holds it".
 */
import type { Position } from "./types";
import {
  dedupedPositions, currentHoldings, costCoversSet, holdingRoute, sum, sumOrNull, type HoldingRoute,
} from "./analytics";
import { familyValue, type FundExposureRow, type FundExposureSkip, type StockExposureState } from "./lookthrough";
import { fifoTotals, type FifoTotals } from "./fifo";

export type HeldRoute = "direct" | "manager" | "fund" | "other";

/** The order the table reads in, and the order its tabs are offered in. */
export const HELD_ROUTES: readonly HeldRoute[] = ["direct", "manager", "fund", "other"];

/**
 * THE MEASURED ROUTE A POSITION TAKES, off its account's engagement and
 * nothing else — `holdingRoute` is the one place that decides it, so this tab
 * and the "via own account / via manager's mandate" words on the row cannot
 * disagree. A route this book cannot read is `other` and is NAMED as such,
 * never folded into Direct: calling a share the family did not choose "direct"
 * is the complaint Stage 10j exists for.
 */
export function heldRouteOf(route: HoldingRoute): Exclude<HeldRoute, "fund"> {
  return route === "own" ? "direct" : route === "mandate" ? "manager" : "other";
}

/**
 * ONE MEMBER'S SHARE OF ONE COMPANY, THROUGH ONE FUND.
 *
 * DERIVED, not a position: `value` is `fundValue × pctAum / 100` and nobody
 * reported it about this family. `fundValue` is what THIS account holds of the
 * fund, from its own statement; `pctAum` is what the AMC disclosed about the
 * FUND, summed over every instrument of this issuer it filed (a share and a
 * certificate of deposit are both the same bank's paper).
 */
export type FundLine = {
  key: string;
  accountId: string;
  /** The fund's `securityKey` — its own page is `/stock/<fundKey>`. */
  fundKey: string;
  /** The fund's display name, as every other surface prints it. */
  fundName: string;
  /** What the VEHICLE is — `Mutual Fund` or `ETF` — off the book's own row; null where no row stands behind the line. */
  vehicleClass: string | null;
  /** What THIS account holds of the fund — the book's own figure. */
  fundValue: number;
  /** The disclosed share of the FUND that is this issuer, every instrument summed. */
  pctAum: number;
  /** DERIVED — `familyValue(fundValue, pctAum)`. */
  value: number;
  instruments: FundExposureRow["instruments"];
  /** What the filings say the issuer is held as — `Equity`, `Debt` — never defaulted. */
  classes: string[];
  holdingsAsOf: string | null;
  sourceKind: string | null;
  via: FundExposureRow["via"];
};

export type FundLines =
  | { status: "loading" }
  | { status: "unreachable" }
  | {
      status: "ok";
      lines: FundLine[];
      /**
       * CONSOLIDATED: Σ the exposure rows, each fund once at the value the book
       * carries for it. Equal to `printed` wherever no fund holding is reported
       * by two statements; where one is, the lines are as printed and this is
       * the figure that counts it once — the stock page's own "carry both,
       * count once" rule, one route over.
       */
      derived: number;
      /** Σ lines, as printed. */
      printed: number;
      /** Distinct funds that disclose this issuer. */
      funds: number;
      /** How many of the family's fund holdings the store could read at all. */
      covered: number;
      considered: number;
      /** AIF holdings: they file nothing this book can join, whatever they hold. */
      aif: FundExposureSkip[];
      /** Any other vehicle the store could not read, named rather than dropped. */
      unread: FundExposureSkip[];
    };

/**
 * THE FUND LINES FOR ONE COMPANY, one per account that holds a fund which
 * discloses it.
 *
 * `positions` is the RAW book (every statement as printed), because the lines
 * are per account; a consolidated figure counts a dually-reported holding once
 * and a per-account one does not (§"consolidated counts once, per-account does
 * not"). They are narrowed to `currentHoldings` exactly as `useStockExposure`
 * narrows the funds it hands the store, so a line and the exposure it splits
 * are struck over the same set.
 *
 * A LINE WORTH NOTHING IS NOT A LINE. A fund an account holds at ₹0 gives ₹0 of
 * everything in it — the rule `loadStockExposure` already applies — and a row
 * saying a member holds a company through a fund they hold none of is a claim
 * about a holding that does not exist.
 */
export function fundLinesFor(
  securityKey: string,
  positions: readonly Position[],
  exposure: StockExposureState,
): FundLines {
  if (exposure.status !== "ok") return { status: exposure.status };
  const hit = exposure.byKey.get(securityKey);
  const aif = exposure.skipped.filter((s) => /^an AIF files/.test(s.reason));
  const unread = exposure.skipped.filter((s) => !/^an AIF files/.test(s.reason));
  const base = {
    status: "ok" as const, covered: exposure.covered, considered: exposure.considered, aif, unread,
  };
  if (!hit || hit.rows.length === 0) return { ...base, lines: [], derived: 0, printed: 0, funds: 0 };

  const held = currentHoldings(positions);
  const lines: FundLine[] = [];
  for (const r of hit.rows) {
    const classes = [...new Set(r.instruments.map((i) => i.assetClass).filter((c): c is string => !!c))].sort();
    const ps = held.filter((p) => p.securityKey === r.fundKey && p.marketValue > 0);
    if (ps.length === 0) {
      // DEFENSIVE AND UNREACHABLE ON THIS BOOK: the exposure is struck over the
      // same positions. A fund row with no account behind it would otherwise
      // vanish from the table while its value stayed in the section total — a
      // total that does not tie to its rows. It keeps one line, holder unnamed.
      lines.push({
        key: `${r.fundKey}|`, accountId: "", fundKey: r.fundKey, fundName: r.fundName, vehicleClass: null,
        fundValue: r.holdingValue, pctAum: r.pctAum, value: r.value, instruments: r.instruments,
        classes, holdingsAsOf: r.holdingsAsOf, sourceKind: r.sourceKind, via: r.via,
      });
      continue;
    }
    for (const p of ps) {
      lines.push({
        key: `${r.fundKey}|${p.accountId}`,
        accountId: p.accountId,
        fundKey: r.fundKey,
        fundName: r.fundName,
        vehicleClass: p.assetClass,
        fundValue: p.marketValue,
        pctAum: r.pctAum,
        value: familyValue(p.marketValue, r.pctAum),
        instruments: r.instruments,
        classes,
        holdingsAsOf: r.holdingsAsOf,
        sourceKind: r.sourceKind,
        via: r.via,
      });
    }
  }
  lines.sort((a, b) => b.value - a.value);
  return {
    ...base,
    lines,
    derived: hit.total,
    printed: sum(lines.map((l) => l.value)),
    funds: hit.rows.length,
  };
}

/**
 * ── WHAT A SET OF STATEMENT ROWS ADDS UP TO ─────────────────────────────────
 *
 * The footer of every tab, and the tiles above the table. Two things in it are
 * corrections, and both were visible in the family's own screenshot:
 *
 * AN AVERAGE COST IS COST OVER THE UNITS THAT HAVE ONE. It was
 * `cost ÷ quantity` over ALL the rows, and `sumOrNull` skips a row whose
 * statement reports no cost — so the numerator covered some rows and the
 * denominator all of them. ICICI Bank read an average cost of ₹438.34 for a
 * share trading near ₹1,400, because ₹94.2 L of cost on the 7,000 shares the
 * two PMS statements report was divided by 21,500 shares, 14,500 of them in a
 * demat that reports no cost at all. The true figure is ₹1,346.33, which is
 * what both mandate rows print. Measured over the whole book, ICICI Bank is
 * the one holding where a cost is reported on some statements and not others.
 *
 * AND THE RETURN IS FIFO, OVER THE ROWS THAT REPORT A COST — `fifoTotals`,
 * the unrealised gain on what is held plus the realised gain on units already
 * sold, over the capital behind both. It is struck HERE, once, so the tiles
 * above the table and every footer under it print one figure; the page used
 * to strike its own beside this. Where the costed rows are not the whole set
 * (`covers` is false) the return is still theirs — the set Invested and the
 * average cost are struck on too — and the Total row says so in words.
 */
export type MeasuredTotals = {
  /** Statement rows in the set, as printed. */
  rows: number;
  qty: number;
  /** Market value, each `dedupeGroup` once. */
  mv: number;
  /** Market value as printed — above `mv` only where a holding is reported twice. */
  printed: number;
  /** Σ cost over the rows reporting one, or null where none does. */
  cost: number | null;
  /** The quantity those costed rows hold — the ONLY denominator for an average cost. */
  costedQty: number;
  /** Market value of the rows that report no cost. */
  uncostedMV: number;
  pnl: number | null;
  /** `cost ÷ costedQty`, never `cost ÷ qty`. */
  avgCost: number | null;
  /** FIFO over the costed rows: `fifo.returnPct` where a cost and a P&L are reported, else null. */
  costedReturn: number | null;
  /** The FIFO totals behind `costedReturn`, for the words that explain it (`fifoBasisNote`). */
  fifo: FifoTotals;
  /** Whether the costed rows are essentially the whole set (`costCoversSet`). */
  covers: boolean;
};

export function measuredTotals(rows: readonly Position[]): MeasuredTotals {
  const d = dedupedPositions([...rows]);
  const costed = d.filter((p) => p.costBasis != null);
  // FIFO's own "costed": a cost the statement marks unusable is not one.
  const fifo = fifoTotals(costed.filter((p) => !p.costUnavailable));
  const cost = sumOrNull(d.map((p) => p.costBasis));
  const pnl = sumOrNull(d.map((p) => p.unrealizedPnL));
  const costedQty = sum(costed.map((p) => p.quantity));
  const mv = sum(d.map((p) => p.marketValue));
  const uncostedMV = sum(d.filter((p) => p.costBasis == null).map((p) => p.marketValue));
  return {
    rows: rows.length,
    qty: sum(d.map((p) => p.quantity)),
    mv,
    printed: sum(rows.map((p) => p.marketValue)),
    cost,
    costedQty,
    uncostedMV,
    pnl,
    avgCost: cost !== null && costedQty > 0 ? cost / costedQty : null,
    costedReturn: cost !== null && pnl !== null && cost > 0 ? fifo.returnPct : null,
    fifo,
    covers: costCoversSet(mv, uncostedMV),
  };
}

/** One route's rows and what they add up to. */
export type HeldSection = {
  route: HeldRoute;
  /** Measured routes: the statement rows. Empty for `fund`. */
  positions: Position[];
  /** The fund route: the derived lines. Empty elsewhere. */
  funds: FundLine[];
  /**
   * The section's value on the CONSOLIDATED basis — each holding counted once.
   * For `fund` it is null until the look-through has answered, because a
   * section total over a store still loading would read as "none".
   */
  value: number | null;
  /** Lines drawn under it. */
  lines: number;
  /** Distinct owning accounts' owners are the caller's to name; this counts accounts. */
  accounts: number;
};

export type HeldThrough = {
  sections: Record<HeldRoute, HeldSection>;
  /** The book's own figure: every statement row, each holding counted once. */
  measured: MeasuredTotals;
  /** The look-through as the fund section reads it. */
  fundLines: FundLines;
  /** Σ the fund lines, consolidated — null until the store has answered. */
  derived: number | null;
  /**
   * `measured.mv + derived` — the figure the family asked to be told ("how
   * much ICICI Bank do I hold"), and the Portfolio Monitor's Total exposure
   * for the same company. Null while the derived half is unknown: a total
   * struck over the measured half alone would read as the whole of it.
   */
  total: number | null;
};

/**
 * THE WHOLE SPLIT, for the table and its tabs.
 *
 * `rows` are this company's statement rows (raw, every account as printed);
 * `routeOf` answers the route of a row from the account registry — passed in
 * rather than read here, so this stays a pure function of what the page
 * already holds and the suite can exercise it without a context.
 */
export function heldThrough(
  securityKey: string,
  rows: readonly Position[],
  routeOf: (p: Position) => HoldingRoute,
  allPositions: readonly Position[],
  exposure: StockExposureState,
): HeldThrough {
  const byRoute: Record<Exclude<HeldRoute, "fund">, Position[]> = { direct: [], manager: [], other: [] };
  for (const p of rows) byRoute[heldRouteOf(routeOf(p))].push(p);
  const fundLines = fundLinesFor(securityKey, allPositions, exposure);
  const measuredSection = (route: Exclude<HeldRoute, "fund">): HeldSection => {
    const ps = byRoute[route];
    return {
      route,
      positions: ps,
      funds: [],
      value: ps.length ? measuredTotals(ps).mv : 0,
      lines: ps.length,
      accounts: new Set(ps.map((p) => p.accountId)).size,
    };
  };
  const derived = fundLines.status === "ok" ? fundLines.derived : null;
  const measured = measuredTotals(rows);
  return {
    sections: {
      direct: measuredSection("direct"),
      manager: measuredSection("manager"),
      other: measuredSection("other"),
      fund: {
        route: "fund",
        positions: [],
        funds: fundLines.status === "ok" ? fundLines.lines : [],
        value: derived,
        lines: fundLines.status === "ok" ? fundLines.lines.length : 0,
        accounts: fundLines.status === "ok" ? new Set(fundLines.lines.map((l) => l.accountId).filter(Boolean)).size : 0,
      },
    },
    measured,
    fundLines,
    derived,
    total: derived === null ? null : measured.mv + derived,
  };
}

/** The words for each route, chosen once so the tab, the band and the row agree. */
export const HELD_ROUTE_LABEL: Record<HeldRoute, string> = {
  direct: "Direct",
  manager: "PMS managers",
  fund: "Mutual funds",
  other: "Other accounts",
};

/** The longer form, for a section band and a tab's hover. */
export const HELD_ROUTE_NOTE: Record<HeldRoute, string> = {
  direct: "Bought in the family's own demat or broking account.",
  manager: "Chosen by a discretionary manager under a PMS mandate — the family owns the shares and the manager decides them. Every share a mandate holds is reported by name on its statement.",
  fund: "Inside the mutual funds and ETFs the family holds. The family owns units of each fund and the fund owns the shares, so this is DERIVED: the fund's own monthly filing gives the weight, and your share is your holding of the fund times that weight. It is never added to the book's own value — the fund's value already stands for it there.",
  other: "Held in an account whose statement does not say how it is run, so this book does not file it as direct or as a manager's.",
};
