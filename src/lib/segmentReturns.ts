/**
 * ── WHICH PART OF THE BOOK EARNED ITS RETURN (Stage 10ez) ───────────────────
 *
 *   *"The client basically wants to be able to see what part of the portfolio
 *    is generating how much return … segments can be categories, asset
 *    classes, consolidated securities, baskets, sector allocation … select any
 *    such segment and see how the subcategories are performing and
 *    contributing to the portfolio returns."*
 *
 * ONE ATTRIBUTION, ANY AXIS. The book's whole return on cost is Morning CIO's
 * Gain / Loss tile — `bookReturnOnCost` over the current holdings, FIFO, a whole
 * PMS mandate struck on its capital. This file files those same holdings under
 * the segments of an axis and strikes each segment with the same `fifoTotals`,
 * so a segment's return is its own FIFO return and its CONTRIBUTION is its gain
 * over the book's capital deployed, in percentage points. The contributions add
 * to the book's return; the gains add to the tile's gain.
 *
 * ── WHERE THEY WOULD NOT ADD, AND THE LINE THAT MAKES THEM ──────────────────
 *
 * A whole mandate is struck on its capital since inception: its gain carries
 * its fees and the sales and income outside its holdings' own records, which
 * belong to no one share. Where an axis keeps a mandate in one segment (the
 * PMS mandates category, one market side) the segment is whole and carries all
 * of it. Where an axis splits a mandate (by sector, by security) each piece is
 * struck holding by holding, and the difference is ONE named line,
 * `mandateRemainder` — never spread across segments it was not reported
 * against, and never dropped so the column stops adding.
 *
 * ── WHAT A SEGMENT DOES NOT CLAIM ───────────────────────────────────────────
 *
 * A segment's VALUE is every holding filed under it. Its gain and return cover
 * only the holdings that report a cost and a valuation (`costedBookSet`): a
 * depository row reports no cost and a review line held at cost no valuation,
 * so each is in the value and in no gain, and the line names how much
 * (`uncostedValue`, `atCostValue`). A segment none of whose holdings strikes a
 * gain has a null gain — an absence, never a ₹0.
 *
 * Since investment, never a window: the book carries no dated value per
 * holding, so a segment cannot be measured over FYTD the way an account can
 * (`periodReturns.ts`). The Returns tab's windows stay whole-account.
 *
 * ── AND SINCE INCEPTION MEANS THE EXITS TOO (Stage 10fz) ─────────────────────
 *
 * The rows are the current holdings; the gains are not only theirs. A holding
 * redeemed to nil or a closed mandate (`exitedRows`) earned what its record
 * says, and a return struck without it is a survivor's (`bookReturnOnCost`).
 * Each exit is filed under the segment its own key falls in and enters that
 * segment's gain and capital deployed — as a child line of its own, "Exited",
 * so the children still add — and an exit whose segment holds nothing current
 * is one top-level line of the same name, never a segment row of a holding the
 * family no longer has. The Total is `bookReturnOnCost`'s.
 */
import type { Account, Position } from "./types";
import { accountIndex, type AccountIndex } from "./accounts";
import { bucketLabel, isCompanyShare, mandateLabelWithOwner, readerClassOf, MANDATE_BUCKET } from "./analytics";
import { fifoTotals, type FifoOptions } from "./fifo";
import { costedBookSet, exitedRows } from "./drilldown";
import { groupKeyFor, groupLabelFor, groupOrdFor, type GroupAxis } from "./groupAxis";
import { UNCLASSIFIED } from "./familyTaxonomy";
import { securityLabel } from "./securityLabel";

/** All Securities first: the family's first and default tab (Stage 10ik). */
export const SEGMENT_AXES = ["security", "category", "assetClass", "basket", "sector", "side"] as const;
export type SegmentAxis = (typeof SEGMENT_AXES)[number];

/** The axes in the order the control draws them; the first is the param-free default. */
export const SEGMENT_VIEWS: readonly { key: SegmentAxis; label: string; title: string }[] = [
  { key: "security", label: "All Securities", title: "One row per security, every holding of it clubbed across every account and mandate" },
  { key: "category", label: "Category", title: "Direct equity, PMS mandates, AIFs, mutual funds, ETFs, cash — what kind of holding earned the return" },
  { key: "assetClass", label: "Asset class", title: "The family's own asset classes — Equity, Debt, Alternate, Cash — as their consolidated review states them" },
  { key: "basket", label: "Basket", title: "The family's four baskets: Stable Growth, Entrepreneurial Growth, Thematic & Tactical, Liquidity" },
  { key: "sector", label: "Sector", title: "GICS sectors as Sector Composition draws them: Consolidated looks through the funds to the companies they hold, Direct Equity is the family's own shares" },
  { key: "side", label: "Listed / Private", title: "Listed markets against private capital, placed as everywhere else in the dashboard" },
];

/** A company's sector, as `companySectorIndex` resolves it (statement → fund filing → screener.in). */
export type SectorLookup = (securityKey: string) => string | null;

/** One line of the attribution: a segment, a holding under it, or the book. */
export type SegmentLine = {
  key: string;
  label: string;
  sub?: string;
  /** Holdings filed here. */
  holdings: number;
  /** Market value of every holding filed here. */
  value: number;
  /** Of `value`: what reports no cost, and what is held at cost. In no gain. */
  uncostedValue: number;
  atCostValue: number;
  /** Holdings that strike a gain, and their value. */
  struck: number;
  struckValue: number;
  /** FIFO, over the struck holdings. Null where none strikes one. */
  gain: number | null;
  deployed: number | null;
  returnPct: number | null;
  /** gain ÷ the book's capital deployed, in percentage points. */
  contribPct: number | null;
  /** value ÷ the book's value. */
  weightPct: number | null;
  /** Mandates struck whole on their capital inside this line. */
  wholeMandates: number;
  /** Exited holdings / closed mandates whose earnings are in this line's gain and deployed, in no row (Stage 10fz). */
  exitedHoldings: number;
  exitedMandates: number;
  exitedGain: number;
  exitedDeployed: number;
};

export type SegmentRow = SegmentLine & {
  ord: number;
  /** A segment nobody has placed (UNCLASSIFIED, no sector, no side). */
  unplaced: boolean;
  children: SegmentLine[];
  /**
   * The parent's own gain less its children's: a whole mandate split across
   * the children enters each holding by holding, and its capital's remainder
   * is here. Null where the children already add.
   */
  childRemainder: { gain: number; deployed: number } | null;
};

export type SegmentAttribution = {
  axis: SegmentAxis;
  rows: SegmentRow[];
  total: SegmentLine;
  /** The whole mandates' capital remainder no segment holds. Null where they add. */
  mandateRemainder: { gain: number; deployed: number; contribPct: number | null; mandates: number } | null;
  /**
   * Exits whose segment holds nothing current (Stage 10fz): in the Total's gain
   * and deployed, and in no segment. Null where every exit has a segment.
   */
  exited: SegmentLine | null;
};

/** The key of the "Exited" line, top-level or under a segment. */
export const EXITED_KEY = "__exited";
const EXITED_LABEL = "Exited — no longer held";

const NO_SECTOR = "Sector not reported";
/** What a statement prints where it places a company in no sector. */
const UNCLASSIFIED_SECTOR = "Unclassified";
const NOT_PLACED = "Not placed on either side";
const CLASS_PREFIX = "class:";

/** The section key and its words, per axis. */
export function segmentOf(axis: SegmentAxis, idx: AccountIndex, sectorOf: SectorLookup): {
  key: (p: Position) => string; label: (k: string, sample: Position) => string; ord: (k: string) => number; unplaced: (k: string) => boolean;
} {
  if (axis === "category" || axis === "assetClass" || axis === "basket") {
    const g = axis as GroupAxis;
    const lab = groupLabelFor(g);
    return { key: (p) => groupKeyFor(g, idx, p), label: (k) => lab(k), ord: groupOrdFor(g), unplaced: (k) => k === UNCLASSIFIED };
  }
  if (axis === "sector") {
    // A fund unit, a private line and a cash row are not companies and carry no
    // sector, so they are filed by the reader's class, labelled through
    // `bucketLabel` — the same split Return & Drawdown's sector table makes.
    return {
      key: (p) => (isCompanyShare(p) ? sectorOf(p.securityKey) ?? NO_SECTOR : `${CLASS_PREFIX}${readerClassOf(p)}`),
      label: (k) => (k.startsWith(CLASS_PREFIX) ? bucketLabel(k.slice(CLASS_PREFIX.length)) : k),
      ord: (k) => (k === NO_SECTOR || k === UNCLASSIFIED_SECTOR ? 2 : k.startsWith(CLASS_PREFIX) ? 1 : 0),
      unplaced: (k) => k === NO_SECTOR || k === UNCLASSIFIED_SECTOR,
    };
  }
  if (axis === "side") {
    return {
      key: (p) => p.marketSide ?? NOT_PLACED,
      label: (k) => (k === "listed" ? "Listed" : k === "private" ? "Private" : k),
      ord: (k) => (k === "listed" ? 0 : k === "private" ? 1 : 2),
      unplaced: (k) => k === NOT_PLACED,
    };
  }
  return {
    key: (p) => p.securityKey,
    label: (k, sample) => securityLabel(k, sample.security),
    ord: () => 0,
    unplaced: () => false,
  };
}

/** What a segment opens into: its securities, or — for a security, and for the mandates — its accounts. */
function childOf(axis: SegmentAxis, segKey: string, idx: AccountIndex): { key: (p: Position) => string; label: (p: Position) => string } {
  if (axis === "security" || (axis === "category" && segKey === MANDATE_BUCKET)) {
    return {
      key: (p) => p.accountId,
      label: (p) => {
        const a = idx.get(p.accountId);
        return a ? `${mandateLabelWithOwner(a, a.owner ?? "")} · ${a.accountNo}` : p.accountId;
      },
    };
  }
  return { key: (p) => p.securityKey, label: (p) => securityLabel(p.securityKey, p.security) };
}

function lineOf(key: string, label: string, set: readonly Position[], opts: FifoOptions, book: { deployed: number | null; value: number }): SegmentLine {
  const s = costedBookSet(set);
  const f = fifoTotals(s.struck, opts);
  // An exit that entered the gain makes it a measurement even where nothing
  // current strikes one — the "Exited" line is all exits (Stage 10fz).
  const exits = f.exitedHoldings + f.exitedMandates.length;
  const strikes = s.struckCount > 0 || exits > 0;
  const gain = strikes ? f.gain : null;
  return {
    key, label,
    holdings: set.length,
    value: s.bookValue,
    uncostedValue: s.bookValue - s.costedValue,
    atCostValue: s.atCostValue,
    struck: s.struckCount,
    struckValue: s.struckValue,
    gain,
    deployed: strikes ? f.deployed : null,
    returnPct: strikes ? f.returnPct : null,
    contribPct: gain != null && book.deployed != null && book.deployed > 0 ? (gain / book.deployed) * 100 : null,
    weightPct: book.value > 0 ? (s.bookValue / book.value) * 100 : null,
    wholeMandates: f.wholeMandates.length,
    exitedHoldings: f.exitedHoldings, exitedMandates: f.exitedMandates.length,
    exitedGain: f.exitedGain, exitedDeployed: f.exitedDeployed,
  };
}

/**
 * The exits a set's own FIFO total actually used — those not already inside a
 * mandate it strikes whole on its capital (`fifoTotals` skips them) — so the
 * "Exited" child line carries exactly what its parent did.
 */
function exitsUsed(set: readonly Position[], exits: readonly Position[], opts: FifoOptions): Position[] {
  if (!exits.length) return [];
  const whole = new Set(fifoTotals(costedBookSet(set).struck, opts).wholeMandates);
  return exits.filter((p) => !whole.has(p.accountId));
}

const RUPEE = 1;

/**
 * The attribution of `current` — the CURRENT, deduped holdings a page shows —
 * on one axis. `accounts` decides which mandates are whole; nothing is struck
 * whole without them. `exited` is what the family has left (`exitedRows` over
 * the whole deduped book): in the gains, in no segment's value (Stage 10fz).
 */
export function segmentAttribution(
  current: readonly Position[],
  accounts: Account[],
  axis: SegmentAxis,
  sectorOf: SectorLookup = () => null,
  exited: readonly Position[] = exitedRows(current),
): SegmentAttribution {
  const idx = accountIndex(accounts);
  const opts: FifoOptions = { accounts: idx, universe: current };
  const withExits = (xs: readonly Position[]): FifoOptions => ({ ...opts, exited: xs });
  const bookValue = current.reduce((s, p) => s + p.marketValue, 0);
  const total = lineOf("total", "Total", current, withExits(exited), { deployed: null, value: bookValue });
  const book = { deployed: total.deployed, value: bookValue };
  total.contribPct = total.returnPct;
  total.weightPct = bookValue > 0 ? 100 : null;

  const seg = segmentOf(axis, idx, sectorOf);
  const groups = new Map<string, Position[]>();
  for (const p of current) {
    const k = seg.key(p);
    const g = groups.get(k);
    if (g) g.push(p); else groups.set(k, [p]);
  }

  // Each exit under the segment its own key falls in; one with no current
  // segment is the top-level "Exited" line.
  //
  // A CLOSED MANDATE IS FILED BY ITS SEGMENT ONLY ON AN AXIS THAT KEEPS A
  // MANDATE WHOLE (category, side). Its capital since inception is what the
  // whole account earned; what it holds now is a bank balance, and filing ASK's
  // ₹10.56 Cr under "Cash" by that ₹0.35 residue would credit an asset class
  // with a manager's equity gains — the reason `mandateRemainder` exists for a
  // live mandate an axis splits. On every other axis it is the Exited line.
  const heldAccounts = new Set(current.map((p) => p.accountId));
  const closedMandate = (p: Position) => {
    const a = idx.get(p.accountId);
    return a?.engagement === "PMS" && !!a.capital && a.capital.contributed > 0 && !heldAccounts.has(p.accountId);
  };
  const keepsMandates = axis === "category" || axis === "side";
  const exitsBy = new Map<string, Position[]>();
  const orphanExits: Position[] = [];
  for (const p of exited) {
    const k = seg.key(p);
    if (!groups.has(k) || (!keepsMandates && closedMandate(p))) { orphanExits.push(p); continue; }
    const g = exitsBy.get(k);
    if (g) g.push(p); else exitsBy.set(k, [p]);
  }

  const rows: SegmentRow[] = [];
  for (const [k, set] of groups) {
    const segExits = exitsUsed(set, exitsBy.get(k) ?? [], opts);
    const line = lineOf(k, seg.label(k, set[0]), set, withExits(segExits), book);
    const ch = childOf(axis, k, idx);
    const byChild = new Map<string, Position[]>();
    for (const p of set) {
      const c = ch.key(p);
      const g = byChild.get(c);
      if (g) g.push(p); else byChild.set(c, [p]);
    }
    // A child is struck with the same options, so a mandate whole inside one
    // child (an account under PMS mandates) stays on its capital.
    const children = [...byChild.values()]
      .map((cs) => lineOf(ch.key(cs[0]), ch.label(cs[0]), cs, opts, book))
      .sort((a, b) => (b.gain ?? -Infinity) - (a.gain ?? -Infinity) || b.value - a.value);
    // The segment's exits, as one child after the holdings, so the children add.
    if (segExits.length) {
      const x = lineOf(EXITED_KEY, EXITED_LABEL, [], withExits(segExits), book);
      if (x.gain != null) children.push(x);
    }
    const cGain = children.reduce((s, c) => s + (c.gain ?? 0), 0);
    const cDep = children.reduce((s, c) => s + (c.deployed ?? 0), 0);
    const remGain = (line.gain ?? 0) - cGain;
    const remDep = (line.deployed ?? 0) - cDep;
    rows.push({
      ...line, ord: seg.ord(k), unplaced: seg.unplaced(k), children,
      childRemainder: Math.abs(remGain) > RUPEE || Math.abs(remDep) > RUPEE ? { gain: remGain, deployed: remDep } : null,
    });
  }
  rows.sort((a, b) => Number(a.unplaced) - Number(b.unplaced) || (b.gain ?? -Infinity) - (a.gain ?? -Infinity) || b.value - a.value);

  const orphan = orphanExits.length ? lineOf(EXITED_KEY, EXITED_LABEL, [], withExits(orphanExits), book) : null;
  const exitedLine = orphan && orphan.gain != null ? orphan : null;
  const sumGain = rows.reduce((s, r) => s + (r.gain ?? 0), 0) + (exitedLine?.gain ?? 0);
  const sumDep = rows.reduce((s, r) => s + (r.deployed ?? 0), 0) + (exitedLine?.deployed ?? 0);
  const remGain = (total.gain ?? 0) - sumGain;
  const remDep = (total.deployed ?? 0) - sumDep;
  const split = fifoTotals(costedBookSet(current).struck, opts).wholeMandates.length - rows.reduce((s, r) => s + r.wholeMandates, 0);
  return {
    axis, rows, total, exited: exitedLine,
    mandateRemainder: Math.abs(remGain) > RUPEE || Math.abs(remDep) > RUPEE
      ? { gain: remGain, deployed: remDep, contribPct: book.deployed ? (remGain / book.deployed) * 100 : null, mandates: Math.max(split, 0) }
      : null,
  };
}
