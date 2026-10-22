/**
 * ── ONE SECTOR ROLLUP, READ BY TWO PANELS ────────────────────────────────────
 *
 * Sector Composition's table and the Returns tab's sector attribution are the
 * same sectors over the same two sets, so they are struck here once and both
 * read it (Stage 10gs). Moved verbatim out of `pages/SectorComposition.tsx`;
 * the reasoning behind each rule is that page's and its stages'.
 */
import { sum, sumOrNull, currentHoldings, isCompanyShare, holdingRoute } from "./analytics";
import { engagementOf, type AccountIndex } from "./accounts";
import { fifoTotals } from "./fifo";
import { hasSectorReturnCost } from "./sectorReturnCoverage";
import { companyExposure, type CompanyExposure, type StockExposureState } from "./lookthrough";
import { UNCLASSIFIED } from "./sectors";
import type { Position } from "./types";

/**
 * ONE SECTOR, ON ONE SET. `measured`/`derived` split the value on Consolidated;
 * `cost`/`pnl`/`returnPct` exist only where the holdings' own statements report
 * a cost — see `rollSectors`.
 */
export type SectorRow = {
  key: string; mv: number; count: number; weight: number;
  measured: number; derived: number;
  cost: number | null; pnl: number | null; returnPct: number | null;
  /**
   * FIFO's other half: what the units already sold realised, and the capital
   * behind the return (cost held + cost of units sold), over the costed holdings.
   */
  realised: number | null; deployed: number | null;
  /**
   * …and the two other terms of the same FIFO gain, as `fifoTotals` struck
   * them: the unrealised gain (value − cost held, over the costed holdings)
   * and the dividends they paid (Stage 10fb). The popover's worked line adds
   * exactly these, so it reproduces the return beside it (Stage 10fz).
   */
  unrealised: number | null; income: number | null;
  /** unrealised + realised + income over the costed holdings — what the return divides (Stage 10gs). */
  gain: number | null;
  /** Holdings behind the sector that report a cost, and how many there are. */
  costed: number; holdings: number; positions: Position[];
  /**
   * The part of the sector's MEASURED value whose holdings report NO cost. On
   * Consolidated the derived fund half carries no cost either and is
   * `mv − costedMV − uncostedMV`; the return details name both.
   */
  uncostedMV: number;
  /** The value of the holdings that report a cost — the set the return covers. */
  costedMV: number;
  /** Why no return is struck, where none is — never a bare dash. */
  returnWhy: string | null;
  /** The largest company (Consolidated) or holding (Direct Equity). */
  top: string | null;
  /**
   * …and its key, and whether the family holds it ONLY inside a fund (FS-14).
   * Ranked on total exposure, the largest issuer in a sector can be one no
   * statement reports — the book's own Materials, Communication Services and
   * Real Estate rows are each headed by one — and a column called "Top
   * holding" over it asserted a position the fence says it is not.
   */
  topKey: string | null;
  topDerivedOnly: boolean;
};

/**
 * ── ONE ROLLUP, TWO SETS ─────────────────────────────────────────────────────
 *
 * Consolidated rolls up COMPANIES (the measured half plus a derived one);
 * Direct Equity rolls up the family's own shares. On both, the return is FIFO
 * over the holdings whose statement reports a cost, and the cell names that set
 * ("N of M") — Stage 10dt. The derived fund half and a depository's costless
 * rows carry no cost, so they are named in the return details and never blended in.
 */
export function rollSectors(entries: CompanyExposure[], valueOf: (e: CompanyExposure) => number, withCost: boolean): SectorRow[] {
  const m = new Map<string, { entries: CompanyExposure[]; mv: number }>();
  for (const e of entries) {
    const k = e.sector || UNCLASSIFIED;
    const c = m.get(k) ?? { entries: [], mv: 0 };
    c.entries.push(e); c.mv += valueOf(e);
    m.set(k, c);
  }
  const tot = [...m.values()].reduce((a, v) => a + v.mv, 0);
  return [...m.entries()]
    .map(([key, v]): SectorRow => {
      const positions = v.entries.flatMap((e) => e.positions);
      const measured = v.entries.reduce((a, e) => a + (e.positions.length ? e.measured : 0), 0);
      const derived = v.entries.reduce((a, e) => a + e.derived, 0);
      const byValue = [...v.entries].sort((a, b) => valueOf(b) - valueOf(a));
      /*
       * THE RETURN IS FIFO OVER THE HOLDINGS THAT REPORT A COST, ON BOTH VIEWS,
       * AND IT SAYS WHICH. Every cell of this column used to be a dash: on
       * Consolidated because its value is part derived, and on Direct Equity
       * wherever the costed holdings did not cover the whole sector — which on
       * this book is every sector but one. A column of dashes answers nothing
       * about how a sector has done. The figure is now struck over the costed
       * holdings alone (`fifoTotals` over exactly those rows, so it covers them
       * fully), the B-07 rule the whole-book return on cost already follows:
       * the cell names its set ("N of M"), and its detail card identifies every
       * excluded stock/account and its missing purchase cost. Consolidated's
       * fund-held share is explained separately from that holding count.
       * A dash remains only where NO holding in the sector reports a cost.
       */
      const costedRows = positions.filter(hasSectorReturnCost);
      const cost = sumOrNull(costedRows.map((x) => x.costBasis));
      const pnl = sumOrNull(costedRows.map((x) => x.unrealizedPnL));
      const costedMV = sum(costedRows.map((x) => x.marketValue));
      const uncostedMV = sum(positions.filter((x) => !costedRows.includes(x)).map((x) => x.marketValue));
      // FIFO: the unrealised gain on what is held AND the realised gain on units
      // already sold, over every rupee that bought a unit — never the survivors
      // alone. `fifoTotals` is the one place a set becomes a return.
      const fifo = fifoTotals(costedRows);
      const returnPct = costedRows.length > 0 && fifo.returnPct !== null ? fifo.returnPct : null;
      const topPos = [...positions].sort((a, b) => b.marketValue - a.marketValue)[0] ?? null;
      const returnWhy = returnPct !== null ? null
        : positions.length === 0
          ? "The family reaches this sector only through their funds, and a fund's disclosure carries no cost — there is nothing to strike a return against."
          : costedRows.length === 0
            ? "No holding in this sector reports a cost — a depository statement carries a value and no basis, so there is nothing to strike a return against."
            : "The holdings that report a cost carry no capital deployed to strike a return against.";
      return {
        key, mv: v.mv, count: withCost ? positions.length : v.entries.length, weight: tot > 0 ? v.mv / tot : 0,
        measured, derived, cost, pnl, returnPct, realised: fifo.realised, deployed: fifo.deployed,
        unrealised: fifo.unrealised, income: fifo.income, gain: costedRows.length > 0 ? fifo.gain : null,
        costed: costedRows.length, holdings: positions.length, positions, uncostedMV, costedMV,
        returnWhy,
        top: withCost ? topPos?.security ?? null : byValue[0]?.name ?? null,
        topKey: withCost ? topPos?.securityKey ?? null : byValue[0]?.key ?? null,
        topDerivedOnly: !withCost && !!byValue[0] && byValue[0].positions.length === 0,
      };
    })
    .sort((a, b) => b.mv - a.mv);
}

/**
 * A sector the INDEX holds and the active set does not: a COMPUTED zero on the
 * family's side, drawn as a row so the index column adds to the whole index and
 * the largest underweight of all — a sector with nothing in it — is not missing.
 */
export function emptySector(key: string): SectorRow {
  return {
    key, mv: 0, count: 0, weight: 0, measured: 0, derived: 0,
    cost: null, pnl: null, returnPct: null, realised: null, deployed: null, unrealised: null, income: null, gain: null,
    costed: 0, holdings: 0, positions: [], uncostedMV: 0, costedMV: 0,
    returnWhy: "The family holds nothing this view places in this sector, so there is no return to strike.",
    top: null, topKey: null, topDerivedOnly: false,
  };
}

/**
 * ── THE TWO SETS ─────────────────────────────────────────────────────────────
 *
 * Consolidated: every company share the statements report (current holdings,
 * the ₹1,000 floor applied) plus the family's share of every instrument their
 * funds disclose. Direct Equity: the shares in the family's own demat and
 * broking accounts only — a company owned only inside a fund is not one. The
 * route comes from the ACCOUNT (`engagementOf`), never from the position.
 */
export function sectorSets(consolidated: Position[], accounts: AccountIndex, exposure: StockExposureState) {
  const shares = currentHoldings(consolidated).filter(isCompanyShare);
  const ownRows = shares.filter((x) => holdingRoute(engagementOf(accounts, x) || null) === "own");
  const consEntries = companyExposure(shares, exposure);
  const directEntries = companyExposure(ownRows, exposure).filter((e) => e.positions.length > 0);
  return {
    shares, ownRows, consEntries, directEntries,
    consSectors: rollSectors(consEntries, (e) => e.total, false),
    directSectors: rollSectors(directEntries, (e) => e.measured, true),
  };
}
