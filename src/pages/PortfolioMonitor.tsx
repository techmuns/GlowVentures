import { Fragment, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpDown, ChevronRight, ChevronDown, Check, Layers, ArrowLeftRight, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { FundExposure } from "@/components/FundExposure";
import { useStockExposure } from "@/lib/useStockExposure";
import { fmtPct, changeColor, fmtNum, fmtDate } from "@/lib/format";
import {
  sum, sumOrNull, consolidatedMarketValue, dedupedPositions, isFundVehicle, isCompanyShare,
  holdingRoute, ROUTE_LABEL,
  mandateLabel, MANDATE_BUCKET,
  measuredReturn, returnCoverage, RETURN_MEASURES, returnMeasureDef, isReturnMeasure,
  type ReturnMeasure, type ReturnCoverage,
  costCoversSet,
  currentHoldings, droppedHoldings, NEGLIGIBLE_VALUE_FLOOR, isCashEquivalent,
} from "@/lib/analytics";
import { accountIndex, ownerOf, type AccountIndex, engagementOf } from "@/lib/accounts";
import { splitFundClass } from "../../shared/securityKey.mjs";
import { ownerDisplayName } from "@/lib/owners";
import { loadTransactions, loadSales, type Txn } from "@/lib/ledger";
import { rollup, type GroupRow } from "@/lib/txnRollup";
import {
  trancheTable, trancheKey, capitalRollup,
  type TrancheTable, type CapitalSide,
} from "@/lib/tranches";
// THE TWO DATED RECORDS, MERGED INTO ONE ROW SET — and the two money blocks
// that must never be added. See its header for what that was measured at.
import { mergeDatedRecords, datedTotals, datedSectionRollup, type DatedRow } from "@/lib/txnLedger";
import { TXN_SORTS, type TxnSort } from "@/lib/txnSort";
import { BOOK_POSITION_TRANCHES, BOOK_CAPITAL_MOVES } from "@/data/glowData";
import { useViewParam, type ViewDef } from "@/components/ViewToggle";
import { UNCLASSIFIED, UNCLASSIFIED_WHY } from "@/lib/familyTaxonomy";
// THE AXES, DECIDED ONCE. Morning CIO's allocation table groups on the same
// three; see the header of `groupAxis.ts` for why they cannot be a local
// definition on either screen — and for why the FOURTH one, SECURITY, is this
// page's alone and is deliberately not in `GROUP_VIEWS`.
import {
  MONITOR_GROUP_VIEWS, GROUP_VIEWS, type MonitorAxis, type GroupAxis,
  SECURITY_AXIS, SECURITY_SECTION,
  groupKeyFor, groupSourceFor, groupOrdFor, groupLabelFor,
  ALL_LABEL, GROUP_COLUMN_HEAD, GROUP_NOUN, bucketFor, heldUnderMandate,
} from "@/lib/groupAxis";
// WHICH SECTION A DATED RECORD LANDS IN — the same three axes, joined to a
// trade's own fields. See its header for why the security axis is unreachable
// from there by type rather than by an omitted button.
import { sectionsFor, orderSections, TXN_UNSECTIONED, TXN_UNSECTIONED_WHY, type TxnSections } from "@/lib/txnAxis";
import { Auditable } from "@/components/Auditable";
// `weightFormula` is deliberately NOT imported, and the REASON has changed under
// this comment — which is why it is being restated rather than left standing.
//
// It used to be that the helper's `plain` sentence was FIXED at "a share of the
// whole listed book", so a table dividing by anything else could not use it. That
// sentence now takes the denominator's meaning as an argument, so the old reason
// is gone. What remains is a different one: this table's denominator MOVES with
// the entity, sector, category and company filters, so the popover has to say
// which of those the reader currently has applied — a per-render sentence rather
// than one the caller can name once. The Weight cell builds its own FormulaDef
// for that, and a future session that gives `weightFormula` a way to express a
// filtered denominator should collapse the two.
import { pnlFormula, returnFormula } from "@/lib/auditFormulas";
import type { Position } from "@/lib/types";
import { AbsentCell, AbsentFromBook, AbsentSection, AbsentValue, DASH } from "@/components/Absent";
import { SortHeader, SortableTable, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows, type TableView } from "@/lib/tableView";

/**
 * ── THROUGH WHAT MEANS A NAME IS HELD — one entry per ACCOUNT ───────────────
 *
 * Set on every consolidated row, on every grouping axis: the axis decides which
 * SECTION a row sits in, never what the row is, so a holding opens the same way
 * whichever heading it is under.
 *
 * THE UNIT IS THE ACCOUNT, AND THAT WAS THE SECOND HALF OF THE FIX. This
 * replaced an `EntityPart` roll-up keyed on the family MEMBER, which lumped
 * every route into a Set — so a name held through three mandates by one member
 * collapsed to one line reading "manager's mandate" — and which was built from
 * the DEDUPED positions while the pill offering it counted the raw ones, so a
 * holding reported by two trusts showed "2 entities" over a table of one row.
 * "Through what means" is a fact about the ACCOUNT: its engagement names the
 * route, its strategy or provider names the vehicle, and every statement is
 * listed as printed with the overlap named.
 */
type Venue = {
  accountId: string; accountNo: string;
  /**
   * The unit CLASS this line is, on a row that clubs several — see
   * `splitFundClass`. Null on every other row, which is every row whose fund
   * issues one class, so a Class column is drawn only where there is one.
   */
  cls: string | null;
  securityKey: string;
  /** This line's fund still publishes a NAV and the family holds no units of it. */
  /** The strategy the manager runs, or the platform that holds the account. */
  vehicle: string;
  owner: string;
  /** `ROUTE_LABEL` — a manager's mandate, the family's own account, a fund. */
  route: string;
  isMandate: boolean;
  quantity: number; marketValue: number;
  costBasis: number | null; unrealizedPnL: number | null; returnPct: number | null; costNA: boolean;
  /** This venue's share of the name as PRINTED across the statements. */
  share: number;
};

/**
 * One share inside a mandate — a constituent of the roll-up, shown when the
 * mandate row is expanded and nowhere else on this table.
 */
type MandateHolding = {
  securityKey: string; security: string; sector: string;
  quantity: number; avgCost: number | null; currentPrice: number | null;
  costBasis: number | null; marketValue: number; unrealizedPnL: number | null;
  returnPct: number | null; costNA: boolean; live: boolean;
};
/**
 * What a mandate ROW stands for: one PMS account, its manager, and the shares
 * that manager chose inside it.
 *
 * `accountMV` / `accountCount` are the account's OWN totals, struck before this
 * page's filters. The roll-up ties to the statement only when nothing has been
 * filtered out, so a narrowed row prints both figures rather than quietly
 * reporting part of a mandate as the whole of it.
 */
type MandateInfo = {
  accountId: string;
  /**
   * The mandate's name — `mandateLabel`, the same one `Row.security` now shows.
   * They were different while the row's name carried the owner inside it to tell
   * apart the four mandates that share a strategy name; the Entities column does
   * that job now, so both are the short name and this field has one meaning.
   */
  name: string;
  manager: string; accountNo: string; asOf: string;
  holdings: MandateHolding[];
  accountMV: number; accountCount: number;
};
/**
 * WHEN A HOLDING'S OWN MONEY WENT IN, over the positions a row sums.
 *
 * Two sources, strongest first, and both are the HOLDING'S OWN dates rather
 * than its account's:
 *
 *   • `Position.heldSince` — the acquisition date on a lot register, emitted
 *     only where the lots account for every unit held;
 *   • the position's own tranche record, keyed on (account, security), which is
 *     the dated allotments a fund reports against that very folio.
 *
 * AN ACCOUNT-LEVEL DATE IS DELIBERATELY NOT A THIRD TIER. An account's first
 * contribution is when the FAMILY funded the account, not when a manager bought
 * the share this row is about — putting it here would print a date under a
 * heading that says something else about it, for every share in a mandate. The
 * account-level record has its own home, on the mandate page and on What I
 * invested.
 *
 * Measured on this book: 10 of 371 positions carry one, and they are ₹208 Cr of
 * ₹714 Cr — 29% of the money, because the dated ones are the large AIF folios.
 *
 * ── AND THAT THIRD TIER CANNOT BE CAUGHT ON THIS BOOK, SO IT IS WRITTEN DOWN ──
 *
 * Adding it was REINTRODUCED as a bug and the sweep came back clean. Measured,
 * every position in a funded account is already one of three things: in a PMS
 * (125 of them, rolled into a mandate row, which carries no date by design),
 * already own-dated (7), or closed and not drawn (3). ZERO would newly borrow
 * one — so the wrong rule and the right one render identically here, and the
 * page check that guards it (`a holding the book cannot date shows a dash`)
 * can only be shown to bite by a borrowed CONSTANT, which is what it was
 * verified against. The first drop that funds a non-PMS account holding
 * something with no allotment record of its own makes this live, silently, on a
 * page computing correctly — which is why the rule is stated here rather than
 * left to be inferred from the absence of a test for it.
 */
function investedOnOf(ps: Position[]): { first: string; last: string; payments: number } | null {
  const dates: string[] = [];
  for (const p of ps) {
    const own = BOOK_POSITION_TRANCHES[trancheKey(p.accountId, p.securityKey)];
    const ins = own?.moves.filter((m) => m.direction === "in").map((m) => m.date) ?? [];
    if (ins.length) { dates.push(...ins); continue; }
    if (p.heldSince) { dates.push(p.heldSince); continue; }
    // ONE UNDATED CONSTITUENT AND THE ROW HAS NO FIRST PAYMENT. Returning the
    // earliest of the rest would name a date the row's own money predates.
    return null;
  }
  if (!dates.length) return null;
  dates.sort();
  return { first: dates[0], last: dates[dates.length - 1], payments: dates.length };
}

type Row = {
  /**
   * A SECURITY the family holds, or a MANDATE it has handed to a discretionary
   * manager. The two are different things and the family asked three times to
   * stop seeing them in one list: a mandate row carries no quantity, no price
   * and no sector, and its shares live in its own expansion.
   */
  kind: "security" | "mandate";
  /** Section key — `holdingBucket`, never the raw asset class. */
  bucket: string;
  key: string; security: string; securityKey: string; sector: string; assetClass: string;
  // avgCost / currentPrice are PER-UNIT and nullable — 360 ONE prints neither
  // for its AIF holding. See the note on Position in src/lib/types.ts.
  // Quantity is NULL on a mandate row and only there: a mandate is an account,
  // not a security, and its constituents are what carry quantities. A 0 would
  // read as a mandate holding nothing.
  entities: string[]; quantity: number | null; avgCost: number | null; currentPrice: number | null;
  /** The price above is AMFI's published NAV, not the statement's mark. */
  navPriced?: boolean; navDate?: string;
  /**
   * THE UNIT CLASSES THIS ROW CLUBS, on a row that clubs more than one.
   *
   * *"3P Class A B1 B2, all of that should be shown as a single line item as
   * just 3P funds like in the excel sheet."* Empty on every other row.
   *
   * A fund with ONE class is deliberately NOT clubbed: its row keeps the name
   * its statement prints, class and all. Dropping "— Class G1" from a row that
   * has only a G1 removes something the statement said and buys a reader
   * nothing, where clubbing three rows into one is the whole request.
   */
  fundClasses: string[];
  // Cost and the two figures derived from it are NULLABLE for the same reason
  // the per-unit ones are: a depository holding statement reports a value and no
  // cost. `costNA` stays the flag the cells switch on; the values themselves are
  // null rather than 0 so nothing downstream can sum them into a total.
  costBasis: number | null; marketValue: number; unrealizedPnL: number | null; returnPct: number | null; weight: number;
  costNA: boolean;
  /**
   * The oldest unit still held, where every lot behind this row reports one.
   *
   * NULL THE MOMENT ANY CONSTITUENT'S START IS UNKNOWN, and always on a mandate
   * row — a mandate is an account holding many securities bought on many dates,
   * and there is no single date to annualise it over. This is `sumOrNull`
   * applied to a date: one missing input makes the answer unknown, not older.
   */
  heldSince: string | null;
  /**
   * ── WHEN THE MONEY WENT IN, AND DELIBERATELY NOT `heldSince` ───────────────
   *
   *   "here, you've given me the amount, but you've not given me the date. Date
   *    is equally important… But invested when? When?"  …  "one important
   *    column which is missing is basically the date when we invested."
   *
   * THE TWO FIELDS LOOK INTERCHANGEABLE AND MUST NOT BE MERGED. `heldSince`
   * above is what LICENSES ANNUALISATION: `holdingReturn` reads it, and it is
   * emitted only where a lot register accounts for every unit held, because a
   * rate compounded over a window the holding did not occupy is exactly the
   * +99% this book has already printed once.
   *
   * This is for DISPLAY and feeds no return, which is what lets it take a
   * SECOND source `heldSince` cannot: the position's own dated contribution
   * record. That record routinely carries SEVERAL payments — Sanshi 9069671554
   * was funded four times between March and October 2025 — and a holding funded
   * four times has no single holding period to compound over. Folding it into
   * `heldSince` would annualise all four from the first, overstating the rate by
   * everything the later money did not earn. Which is, precisely, the thing the
   * family were pointing at when they asked for this column: *"XIRR will change
   * depending on the investment amount and the time."*
   *
   * NULL THE MOMENT ANY CONSTITUENT'S DATE IS UNKNOWN — `sumOrNull` applied to a
   * date, the same gate `heldSince` uses. A "first payment" over the subset that
   * happens to be dated is not the first payment.
   */
  investedOn: { first: string; last: string; payments: number } | null;
  /**
   * The positions this row was built from — its own deduped set — carried ONLY
   * so a per-contribution breakdown can be struck on exactly what the row sums.
   *
   * Keying that breakdown on `securityKey` instead would double Transition
   * Venture Fund I, which two family trusts report as one `dedupeGroup` and this
   * row counts once. Empty on a mandate row: a mandate is an account, and the
   * capital behind it bought no units in any one share — that money is on the
   * Transactions card, under My investments.
   */
  trancheSet: Position[];
  // Live-quote fields. `live: false` means CMP is still the workbook mark — the
  // row says so rather than letting a month-old price read as current.
  live: boolean; dayChange: number; dayChangePct: number | null;
  /**
   * The market value the DAY figure is struck over — the live-priced part of
   * this row, which is the whole of it for a security and the live constituents
   * for a mandate. The footer's day % divides by this rather than by market
   * value, so rolling ₹127 Cr of live-priced shares into ten mandate rows
   * leaves the book's day move exactly where it was.
   */
  liveMV: number;
  /**
   * The securityKeys this row stands for, for the realised-gain lookup — one for
   * a security, its constituents' for a mandate. The footer sums over the UNION
   * of these, so rolling shares into mandates cannot drop a realised figure out
   * of the total.
   */
  realizedKeys: string[];
  /**
   * Set only in the BY-ENTITY view, where both members' rows of a dually
   * reported holding are shown as printed. Undefined in the by-security view,
   * whose rows are already consolidated. The bucket-section subtotal reads it so
   * the sections sum to the footer in both views — see `bucketGroups`.
   */
  dedupeGroup?: string;
  /**
   * WHO SAID THIS ROW BELONGS IN ITS SECTION, on the two family axes.
   * `"review"` — named product by product in the family's consolidated review.
   * `"rule"` — placed by their stated rule for direct stocks.
   * `"derived"` — our own asset class already answered it beyond doubt.
   * `null` — nobody has, and the row sits under `UNCLASSIFIED`.
   * Always `"review"`-equivalent on the category axis, which is derived from
   * the book itself and asks nothing of the family; the field is only read on
   * the other two.
   */
  groupSource: "review" | "rule" | "derived" | null;
  /** Set on `kind === "mandate"` and nowhere else. */
  mandate?: MandateInfo;
  /**
   * Set on the SECURITY axis and nowhere else — the accounts this clubbed name
   * is held through, largest first. Undefined on every other axis, where a
   * mandate-held share is inside its mandate's row rather than clubbed at all.
   */
  venues?: Venue[];
  /**
   * The ISIN, where a statement printed one. Carried on the SECURITY axis for
   * the fund look-through's join, which is ISIN-first and exact-or-nothing —
   * 43 of this book's equities have one and it is the only tier that reliably
   * bridges a depository's "SBI - EQ" to an AMC's "State Bank of India".
   */
  isin?: string | null;
  /**
   * ── THE TWO DERIVED FIELDS, SET ONLY ON THE STOCK AXIS ─────────────────────
   *
   *   "In the security selected page we should only see the aggregate stock
   *    position across the portfolio thru various channels — direct equity /
   *    AIFs / PMS / ETFs. AIF itself shouldn't show up as a security. We need to
   *    calculate cumulative stocks position held in the whole portfolio."
   *
   * `marketValue` above stays what it means on every other axis and in every
   * other column: the value the STATEMENTS report for this company, direct and
   * mandate-held together. `viaFunds` is a DERIVED figure — the AMC disclosed
   * what the fund holds and this is the family's units' share of it — and
   * `totalExposure` is the two added, which is the figure the family asked to
   * see and rank on.
   *
   * THEY ARE KEPT AS SEPARATE FIELDS RATHER THAN FOLDED INTO `marketValue`
   * because a measured rupee and a derived one are different claims, and every
   * other money column on the row (Invested, Unreal. P&L, Realised, Return) can
   * only ever be struck on the measured half. Blending them would put a return
   * over a cost that covers one half of its own numerator — the "a total must
   * tie to its own columns" failure, one column wider.
   */
  viaFunds?: number;
  totalExposure?: number;
  /**
   * A company NO statement in this book reports — it is held only inside a fund,
   * and everything about it except `viaFunds` is therefore absent rather than
   * zero. The cells read this to render `AbsentCell` with the reason; the footer
   * sums `marketValue`, which is correctly 0 because there is no measured value
   * to add, not because the measurement came back nil.
   */
  measuredNA?: boolean;
};
/**
 * ── WHICH ROWS A FUND LOOK-THROUGH CAN SPEAK FOR ────────────────────────────
 *
 *   "the Look-through must cover bonds, NCDs and every instrument, not just
 *    stocks. Any stock or bond. It could be a bond. It could be an NCD."
 *
 * An ISSUER, whatever paper of theirs the family reaches through a fund. What it
 * excludes is what a disclosure can never be about: a FUND row (a scheme holding
 * itself is not a look-through, and its own value already stands for everything
 * inside it), and CASH, which no AMC files as a holding of an issuer.
 *
 * The row's `assetClass` on this axis is what the FILINGS said — `Equity`,
 * `Debt`, or both joined — so this is deliberately not a test on one value.
 */
const canLookThrough = (r: { assetClass: string; securityKey: string }) =>
  !!r.securityKey && !isFundVehicle(r as { assetClass: string }) && r.assetClass !== "Cash";

/**
 * THE HOLDINGS TABLE'S COLUMNS, IN DECLARED ORDER — the order the cells below
 * are written in, which is what `<Tr>` permutes from. Two sets, because the
 * SECURITY axis draws two more: a row there is a COMPANY rather than a holding,
 * so it carries the derived `Via funds` and the `Total exposure` that adds it
 * to the measured half. They are separate storage keys for the same reason the
 * sweep keeps `COL` and `COL_STOCK` apart — reconciling one set's saved order
 * against the other's columns would drop two columns on every axis switch.
 */
const MONITOR_COLS = ["security", "qty", "avgCost", "invested", "investedOn", "cmp", "day", "mv",
  "weight", "pnl", "realised", "return", "sector", "entity"] as const;
const MONITOR_STOCK_COLS = ["security", "qty", "avgCost", "invested", "investedOn", "cmp", "day", "mv",
  "viaFunds", "totalExposure", "weight", "pnl", "realised", "return", "sector", "entity"] as const;

/**
 * WHAT EACH COLUMN IS WORTH ON A ROW, for the reader's own ranking. An absent
 * figure returns `null` and `sortRows` puts it LAST whichever way the column is
 * sorted — never as a zero, which would rank a depository holding whose
 * statement reports no cost among the cheapest in the book.
 *
 * Two columns have no accessor and that is deliberate rather than an omission:
 * `realised` is fetched per row from the archive and is not on the row at all,
 * and a mandate row's `sector` is an absence with a reason. Their headings stay
 * clickable — `sortRows` returns the list untouched for a column it cannot
 * rank, so a reader is never left guessing which headings are controls.
 */
const TRANCHE_COLS = ["date", "type", "amount", "invested", "units", "nav", "value", "gain", "return"] as const;
const TRANCHE_ENTITY_COLS = ["date", "type", "entity", "amount", "invested", "units", "nav", "value", "gain", "return"] as const;
const MANDATE_DRILL_COLS = ["security", "qty", "avgCost", "invested", "cmp", "mv", "share", "pnl", "return", "sector"] as const;
const VENUE_COLS = ["route", "vehicle", "entity", "qty", "mv", "share", "pnl", "return"] as const;
const VENUE_CLASS_COLS = ["cls", "route", "vehicle", "entity", "qty", "mv", "share", "pnl", "return"] as const;

const MONITOR_ACCESSORS: Record<string, (r: Row) => number | string | null | undefined> = {
  security: (r) => r.security,
  qty: (r) => r.quantity,
  avgCost: (r) => r.avgCost,
  invested: (r) => r.costBasis,
  investedOn: (r) => r.investedOn?.first ?? null,
  cmp: (r) => r.currentPrice,
  day: (r) => r.dayChangePct,
  mv: (r) => r.marketValue,
  viaFunds: (r) => r.viaFunds,
  totalExposure: (r) => r.totalExposure,
  weight: (r) => r.weight,
  pnl: (r) => r.unrealizedPnL,
  // NO `return` ACCESSOR, and its absence is deliberate. `return` is a
  // PLACEHOLDER in the column list rather than a column — `withReturnCols`
  // expands it to one id per ticked measure — so no view ever declares it and
  // an accessor for it would rank nothing while looking like the one that
  // ranks the return columns. `returnAccessors` supplies the real ones, each
  // reading the measure its own column prints.
  entity: (r) => r.entities[0] ?? null,
};

/**
 * ── ONE RETURN COLUMN PER PICKED MEASURE ────────────────────────────────────
 *
 *   *"Whenever we select multiple return profiles to see on the dashboard it
 *   should add a new return column rather than show all returns in the same
 *   return column side by side — a new column with that return name should be
 *   made, and also removed when we select or deselect returns."*
 *
 * So `return` above is a PLACEHOLDER, not a column: the declared list expands it
 * to one id per ticked measure, which is what makes every mechanism in
 * `useTableView` do the right thing for free. A column list that grows and
 * shrinks is exactly the case that hook already reconciles — unknown ids
 * dropped, new ones appended in declared order — so ticking a measure adds a
 * column a reader can sort and drag like any other, and unticking it removes
 * the column and leaves the rest where they were dragged to.
 *
 * `TrFoot`'s span and `COL_COUNT` are struck on the view's own column count, so
 * neither has to be told. Written as a literal the count goes wrong SILENTLY:
 * an expansion simply stops reaching the last column and nothing fails.
 */
const withReturnCols = (cols: readonly string[], measures: readonly ReturnMeasure[]) =>
  cols.flatMap((c) => (c === "return" ? measures.map((m) => `ret:${m}`) : [c]));

/**
 * AND SORTING A RETURN COLUMN ORDERS ON THE FIGURE THAT COLUMN PRINTS, resolved
 * through `measuredReturn` — the same function the cell draws, so the column a
 * reader clicks and the order they get cannot disagree about what a row's CAGR
 * is. Reusing `returnPct` for all of them would leave the CAGR arrow ordering by
 * the raw return on cost, and this book is where that lie is visible: one
 * holding annualises and the rest fall back to their absolute figure, so the two
 * orders genuinely differ.
 *
 * An absent return then sorts LAST in both directions, because `sortRows` does
 * that for every null — which is the rule this column needs and did not have to
 * restate.
 */
const returnAccessors = (measures: readonly ReturnMeasure[], asOf: string) =>
  Object.fromEntries(measures.map((m) => [`ret:${m}`, (r: Row) => {
    const res = measuredReturn(r, m, asOf);
    return res.shown ? res.pct : null;
  }])) as Record<string, (r: Row) => number | null>;

/**
 * One category's aggregate of every money metric, struck over the POSITIONS the
 * footer sums rather than over the rows drawn above it — see the memo.
 *
 * `cost` and `pnl` are nullable for the reason every cost figure in this book is:
 * a depository holding statement reports a value and never a cost, so a category
 * made entirely of them has no invested figure to print and must not print a
 * zero. `costedMV` is what the cost side actually stands behind, and it is what
 * decides whether a RETURN may be shown beside a market value struck over more
 * holdings than the cost is (`costCoversSet`).
 */
type BucketTotals = {
  mv: number;
  cost: number | null;
  pnl: number | null;
  costedMV: number;
  costedCount: number;
  heldCount: number;
};

/**
 * ── THE AXIS MACHINERY MOVED TO `lib/groupAxis.ts` ──────────────────────────
 *
 * It was defined here while this was the only screen carrying three axes.
 * Morning CIO's allocation table now groups on the same three, at the family's
 * request ("add a selector in the allocation section… category wise / asset
 * class wise / basket wise"), and two copies of "which section does this
 * holding sit in" would be two chances for one screen to file a holding under a
 * basket the other puts somewhere else — the failure `holdingBucket` and
 * `costCoversSet` were each extracted for. Everything that used to be defined
 * here is imported above, unchanged: the section key per axis, its source, its
 * reading order, its heading, the category order and the filter's "all" label.
 */

// Weight, P&L and return all move with the live price, so they no longer match
// any cell in the workbook — an audit link would point at a different number.
// Live cells therefore render plain, and only rows still on their workbook mark
// keep the trace. The inputs that don't move (quantity, cost) keep theirs either way.
const LIVE_CELL = "Recalculated from the live price. Quantity and cost come from the ledger; this figure is worked out from them, so it has no workbook cell to trace to.";

/** The picker's option keys, in reading order — `auto` first. */
const MEASURE_KEYS = RETURN_MEASURES.map((m) => m.key);

/**
 * THE ONE SENTENCE THE DERIVED COLUMNS CARRY, written once so the two headers
 * cannot come to say different things about the same fence.
 */
const DERIVED_NOTE = "DERIVED, not a position: the AMC disclosed what the fund holds and this is your units' share of it, across every asset class the filing carries — shares, bonds, NCDs and commercial paper alike. It is no part of the book's NAV — the fund's own value already stands for it there — so this column is never summed into a book total.";

/**
 * WHICH RETURN(S) THE ONE RETURN COLUMN SHOWS — held in the URL (`?ret=`) like
 * every other view on this page, so "send me the CAGR view" is a link.
 *
 * `auto` is the methodology and the param-free default, so `/monitor` stays one
 * URL. It is MUTUALLY EXCLUSIVE with the concrete measures: picking Absolute or
 * CAGR means "show me that one", not "that one on top of the rule", so a concrete
 * selection replaces auto and clearing everything falls back to it. The concrete
 * measures multi-select — the family can pin Absolute AND CAGR side by side, each
 * labelled, which is the "always have a CAGR column" ask answered without a
 * second column.
 */
function useReturnMeasures(): [ReturnMeasure[], (next: ReturnMeasure[]) => void] {
  const [sp, setSp] = useSearchParams();
  const set = new Set((sp.get("ret") ?? "").split(",").map((s) => s.trim()).filter(isReturnMeasure));
  // Concrete measures win over auto, in canonical order; empty → auto.
  const concrete = MEASURE_KEYS.filter((k) => k !== "auto" && set.has(k));
  const measures = concrete.length ? concrete : (["auto"] as ReturnMeasure[]);
  const setMeasures = useCallback((next: ReturnMeasure[]) => {
    const clean = MEASURE_KEYS.filter((k) => k !== "auto" && next.includes(k));
    const nextSp = new URLSearchParams(sp);
    if (clean.length === 0) nextSp.delete("ret");
    else nextSp.set("ret", clean.join(","));
    setSp(nextSp);
  }, [sp, setSp]);
  return [measures, setMeasures];
}

/**
 * THE RETURN-MEASURE PICKER — replaces the Absolute/CAGR toggle.
 *
 * "When you say return… what return is it? I can give you ten different returns
 * for one scheme." So this offers every one of them, the single Return column
 * shows whichever are ticked, and each cell is labelled with the measure it is.
 * `auto` behaves as a reset-to-methodology choice (mutually exclusive); the rest
 * tick on and off together. It is never empty — unticking the last one falls back
 * to auto — because an empty selection is not a state a reader means to be in.
 */
function ReturnMeasureSelect({ measures, onChange }: { measures: ReturnMeasure[]; onChange: (m: ReturnMeasure[]) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const isAuto = measures.length === 1 && measures[0] === "auto";
  const ticked = (k: ReturnMeasure) => (k === "auto" ? isAuto : measures.includes(k));
  const toggle = (k: ReturnMeasure) => {
    if (k === "auto") { onChange(["auto"]); return; }
    const set = new Set(measures.filter((m) => m !== "auto"));
    set.has(k) ? set.delete(k) : set.add(k);
    onChange(MEASURE_KEYS.filter((m) => m !== "auto" && set.has(m)));
  };
  const label = isAuto ? "Return · by methodology"
    : measures.length === 1 ? returnMeasureDef(measures[0]).label
    : `${measures.length} return types`;
  return (
    <div ref={wrapRef} className="relative"
      data-return-measures={MEASURE_KEYS.join(",")} data-return-active={measures.join(",")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox"
        title="Which return to show — the methodology, or pick one or more explicitly. Every cell is labelled with the return it is showing."
        className="flex w-fit items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus">
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {/* RIGHT-ALIGNED PANEL, so it can never extend past the trigger's right
          edge into horizontal overflow. The picker is the last control on the
          filter row, so a `left-0` panel opened rightward and ran off the page —
          the family had to scroll sideways to read it. Anchored to the right, its
          22rem width grows leftward into the row it already occupies, and the
          `92vw` cap keeps it on screen at any width. */}
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[min(22rem,92vw)] overflow-hidden rounded-lg border border-ink-700 bg-ink-800 shadow-xl shadow-black/40" role="listbox" aria-multiselectable="true">
          <div className="border-b border-ink-700 px-3 py-1.5 text-[11px] text-slate-500">Pick the return to show. Each cell is labelled with it.</div>
          <ul className="max-h-80 overflow-auto py-1">
            {RETURN_MEASURES.map((m) => {
              const on = ticked(m.key);
              return (
                <li key={m.key} role="option" aria-selected={on}
                  onMouseDown={(e) => { e.preventDefault(); toggle(m.key); }}
                  className={`flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-ink-700/60 ${on ? "text-slate-100" : "text-slate-300"}`}>
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-champagne-500 bg-champagne-500/20 text-champagne-400" : "border-ink-600 text-transparent"}`}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium">{m.label}</span>
                      <span className="ret-tag">{m.tag}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{m.hint}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PortfolioMonitor() {
  const { portfolio, consolidated, basis, displayCurrency, fmtFromBase } = usePortfolio();
  const [view, setViewState] = useState<"holdings" | "transactions">("holdings");
  /**
   * BY SECURITY IS THE ONLY VIEW WITH A CONTROL — the switch was removed at the
   * family's request, who read the consolidated table as the one they want.
   *
   * The FLAG stays, held in the URL like every other view in this app
   * (`useViewParam`, §"the active view lives in the URL"), for two reasons that
   * are not aesthetic. The by-entity rendering is threaded through fifteen
   * sites — the row build, the footer, the dedupe gap, the realised cells, the
   * Entities column, the section subtotals — and pinning it to a literal would
   * leave every one of those branches unreachable, which is the
   * dead-code-that-looks-alive failure this file keeps naming. And it is where
   * the ₹3.17 Cr subtotal bug lived: both of this book's duplicate holdings are
   * AIF, so by-entity is the ONLY view in which a class heading and the footer
   * beneath it can disagree, and `check:pages` still walks it at `?view=entity`
   * to assert that they do not.
   */
  const [holdingsView] = useViewParam(HOLDINGS_VIEWS);
  const consolidate = holdingsView === "security";
  /**
   * WHICH AXIS THE TABLE IS SECTIONED ON. In the URL (`?group=`) like the
   * view flag beside it, so a slice can be bookmarked and shared — the family
   * asked for three ways to read one table, and "send me the basket view" has
   * to be a link rather than an instruction.
   */
  const [groupAxis, setGroupAxisParam] = useViewParam(MONITOR_GROUP_VIEWS, {}, "group");
  /**
   * THE ALLOCATION AXIS — what the Transactions table sections on, and what the
   * shared section filter offers.
   *
   * `?group=security` is the Holdings table's own fourth axis and is not an
   * allocation axis at all: it files every holding in ONE section so a table
   * built on it would draw a single heading over everything. A reader who has
   * sliced the holdings that way and crosses to Transactions therefore lands on
   * CATEGORY, the default on both screens, rather than on a table with no
   * sections — and the axis control up there offers three, so the fallback is
   * visible rather than silent.
   */
  const txnAxis: GroupAxis = groupAxis === SECURITY_AXIS ? "category" : groupAxis;
  /** What the axis control lights up: the raw param on Holdings, the resolved one on Transactions. */
  const activeAxis: MonitorAxis = view === "holdings" ? groupAxis : txnAxis;
  // These three filters are global — they drive both the Holdings table and the
  // Transactions tape at once. `selected` is a set of security names (empty = all).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * THE SECTOR DROPDOWN IS GONE AND THE SECTOR FILTER IS NOT — the same
   * treatment the Holdings basis switch got when it was removed (Stage 10q).
   *
   * The family asked for the control off the filter row. Pinning the value to
   * the literal "All" would have left every branch that reads it unreachable —
   * the weight denominator's scope caption, the base filter, and the sector the
   * Transactions tape is handed — which is the dead-code-that-looks-alive
   * failure this repo keeps naming. So it lives in the URL like every other view
   * on this page (`?view=`, `?group=`, `?ret=`): `?sector=Financials` still
   * narrows the table, and a link is shareable. Nothing on screen sets it.
   *
   * Sector remains a COLUMN on every row, and Sector Composition is the page
   * that analyses the book by sector; only the picker left this row.
   */
  const [sectorParams] = useSearchParams();
  const sector = sectorParams.get("sector") ?? "All";
  const [entity, setEntity] = useState("All");
  // Category filter — Direct Equity / PMS mandates / AIF / Mutual Fund / ETF /
  // Cash were shown in one flat list, so a ₹176 Cr AIF folio sat between two
  // equity lines as if it were the same kind of thing. It filters to one BUCKET
  // (`holdingBucket`), not to an asset class: what a reader is choosing between
  // here is shares the family bought and mandates it handed to a manager, and
  // those are the same asset class.
  const [bucket, setBucket] = useState("All");
  /**
   * SWITCHING AXIS CLEARS THE SECTION FILTER, and that is a correctness fix
   * rather than a courtesy. The filter is an equality test on the section key,
   * so a "AIF" selection carried into the basket axis matches no row and empties
   * the table with no message — the failure mode this repo keeps naming, where
   * a screen renders perfectly and shows nothing. Every entry point to the axis
   * goes through this, so no caller can reintroduce it.
   */
  const setGroupAxis = useCallback((k: MonitorAxis) => { setBucket("All"); setGroupAxisParam(k); }, [setGroupAxisParam]);
  /**
   * ...AND SO DOES CROSSING BETWEEN THE VIEWS, WHERE THE AXIS CAN CHANGE
   * UNDER A FILTER NOBODY TOUCHED.
   *
   * The section filter is shared now, which is the point — a reader who has
   * narrowed the holdings to AIF sees the AIF transactions. But the two views
   * resolve `?group=security` DIFFERENTLY: Holdings sections on it, Transactions
   * falls back to Category (see `txnAxis`). So on that one axis, switching view
   * changes which key the filter is testing, and a key carried across matches no
   * row and empties the table with no message — on a page that renders
   * perfectly, with the select HIDDEN on the Holdings side so the reader cannot
   * clear it. That is the same silent-empty-table failure `setGroupAxis` above
   * exists to stop, arriving through the view switch instead of the axis one.
   *
   * ONLY WHEN THE AXIS REALLY MOVES. Dropping a reader's section every time they
   * flip Holdings ↔ Transactions would undo the sharing this change is for.
   */
  const setView = useCallback((v: "holdings" | "transactions") => {
    const from = view === "holdings" ? groupAxis : txnAxis;
    const to = v === "holdings" ? groupAxis : txnAxis;
    if (from !== to) setBucket("All");
    setViewState(v);
  }, [view, groupAxis, txnAxis]);
  /**
   * ── THE SECURITY AXIS CHANGES THE ROW BUILD, NOT JUST A SECTION KEY ────────
   *
   *   "Based on every single investment direct/PMS/ETF/AIF etc etc. we will club
   *    and show which stock has the highest exposure and thru what means."
   *
   * On every other axis the PMS mandates are lifted out of the table into one
   * row each (§"the mandates come out of the table first"), so a share a
   * discretionary manager chose is inside a mandate row and a reader cannot see
   * the name's total exposure at all — ₹138.7 Cr of this book's shares sit that
   * way. Here they are NOT lifted out, and every position is clubbed on
   * `securityKey` alone, so Carnelian's HDFC Bank and the family's own HDFC Bank
   * are one ranked row with a breakdown behind it.
   *
   * IT ALSO IGNORES THE BY-ENTITY VIEW. `?view=entity` splits a consolidated
   * name back into the statements that reported it, which is the exact opposite
   * of clubbing; on this axis that split is what the row's own expansion shows,
   * so the rows stay clubbed and the per-statement detail moves inside them.
   */
  const bySecurity = groupAxis === SECURITY_AXIS;
  /**
   * WHICH RETURNS THE TABLE SHOWS — ONE COLUMN EACH, the picker that replaced
   * the Absolute/CAGR toggle.
   *
   *   *"Whenever we select multiple return profiles to see on the dashboard it
   *    should add a new return column rather than show all returns in the same
   *    return column side by side — a new column with that return name should be
   *    made, and also removed when we select or deselect returns."*
   *
   * So this array is the COLUMN LIST. Default is `auto`, the methodology (equity
   * under a year absolute, a year or more CAGR, fixed income XIRR) as one
   * column; the reader can pin one or more concrete measures instead and each
   * gets a column headed with its own name. Held in the URL (`?ret=`), so the
   * guard-firing CAGR view is a shareable link and the sweep reaches it without
   * a click. See `useReturnMeasures` / `measuredReturn`.
   */
  const [returnMeasures, setReturnMeasures] = useReturnMeasures();
  /**
   * THE FUND LOOK-THROUGH — assembled by `useStockExposure`, which both this
   * page and Sector Composition's Consolidated view call.
   *
   * The three inputs it needs (which vehicles the family holds and at what
   * value, the ISIN→key bridge, the ring-fence) used to be built here. They are
   * decisions rather than lookups and two of them fail silently when got wrong,
   * so they live in one hook now rather than being re-derived per page. See the
   * note there.
   *
   * ONLY ON THIS AXIS. The other three group the book's own positions and never
   * ask what a fund holds, so they must not pay for 21 fetches.
   */
  const exposure = useStockExposure(consolidated, bySecurity);
  /**
   * THE READER'S OWN RANKING, AND IT REPLACED A SECOND MECHANISM RATHER THAN
   * SITTING BESIDE ONE. This table used to carry its own `sortKey`/`asc` pair
   * driving six clickable headers out of fourteen; the family asked for every
   * heading on every table to sort, so it is `useTableView` here like
   * everywhere else and the bespoke pair is gone rather than left as a second
   * way to order one table. The memo below keeps its DEFAULT ranking — largest
   * first, or largest total exposure on the security axis — which is what a
   * cleared sort returns to.
   */
  /**
   * THE COLUMN LIST IS A FUNCTION OF THE PICKED MEASURES, which is the whole of
   * how "a new column per return" is expressed in this model — see
   * `withReturnCols`. Memoised on the measures rather than rebuilt per render,
   * because `useTableView` reconciles its stored order against this list and a
   * fresh array every render would re-run that on every keystroke.
   */
  const holdCols = useMemo(
    () => withReturnCols(bySecurity ? MONITOR_STOCK_COLS : MONITOR_COLS, returnMeasures),
    [bySecurity, returnMeasures]);
  const holdView = useTableView(bySecurity ? "monitor-stock" : "monitor", holdCols);
  /**
   * AND THE ACCESSORS GAIN ONE PER MEASURE, so each return column sorts on the
   * figure it prints rather than on `returnPct` for all of them.
   */
  const holdAccessors = useMemo(
    // `portfolio` is not narrowed until the guard below and a hook cannot sit
    // after one; these accessors are only ever called from `sortRows` under it,
    // so the fallback is unreachable rather than a default date standing in.
    () => ({ ...MONITOR_ACCESSORS, ...returnAccessors(returnMeasures, portfolio?.asOf ?? "") }),
    [returnMeasures, portfolio?.asOf]);
  // ORDER-INDEPENDENT BY CONSTRUCTION: a span struck on the view's own column
  // count cannot drift from the header when a reader moves a column, where the
  // literal it replaced had to be kept in step by hand.
  const COL_COUNT = holdView.order.length;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /**
   * A SECOND EXPANDER, AND DELIBERATELY ITS OWN SET.
   *
   * The Entities chevron opens who holds a row; this one opens WHEN it was
   * bought. Sharing one set would make either chevron toggle both, and a reader
   * who clicked Entities would get a contribution history they did not ask for.
   */
  const [openTranches, setOpenTranches] = useState<Set<string>>(() => new Set());
  const toggleTranche = (k: string) =>
    setOpenTranches((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [exporting, setExporting] = useState(false);
  // Realised P&L per security (by securityKey) from the archive's sales —
  // undefined = loading, null = the archive didn't respond. A VALUE of null in
  // the map is a third thing again: the name was sold, but no capital gain
  // statement covers that account, so what it realised was never reported.
  const [realized, setRealized] = useState<Map<string, number | null> | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadSales().then((s) => { if (alive) setRealized(s ? new Map(s.rows.map((r) => [r.securityKey, r.realized])) : null); });
    return () => { alive = false; };
  }, []);
  if (!portfolio) return null;
  const positions = portfolio.positions;
  // Owner comes from the account registry, never from the account string.
  const accIdx = useMemo(() => accountIndex(portfolio.accounts), [portfolio.accounts]);
  const owner = (p: Position) => ownerOf(accIdx, p);
  /**
   * The canonical owner of an ACCOUNT, for surfaces that hold an accountId
   * rather than a position — the contribution history is one. Falls back to the
   * id rather than to a blank: an unnamed holder beside a real rupee figure is
   * exactly the "attributed to nobody" state `excludedAccounts` exists to stop.
   */
  const ownerOfAccount = (accountId: string) => accIdx.get(accountId)?.ownerId
    ? ownerDisplayName(accIdx.get(accountId)!.ownerId) : (accIdx.get(accountId)?.owner ?? accountId);
  const entities = useMemo(() => ["All", ...Array.from(new Set(positions.map((p) => ownerOf(accIdx, p)))).sort()], [positions, accIdx]);
  // Buckets present, in a fixed reading order (own → mandates → wrappers → cash).
  /**
   * THE FILTER FOLLOWS THE AXIS. Sectioning by basket while the dropdown still
   * offered "AIF" would leave a reader filtering on a key no section carries —
   * and because the filter is a plain equality test, that empties the table
   * SILENTLY. So its options are the groups of whichever axis is active, and
   * `groupAxis` resets the selection (below) rather than letting a stale key
   * survive the switch.
   */
  const buckets = useMemo(
    () => ["All", ...Array.from(new Set(positions.map((p) => groupKeyFor(activeAxis, accIdx, p))))
      .sort((a, b) => groupOrdFor(activeAxis)(a) - groupOrdFor(activeAxis)(b))],
    [positions, accIdx, activeAxis],
  );
  /**
   * Each mandate account's OWN totals, struck over every position it holds
   * BEFORE this page's filters. A filtered mandate row prints both figures so a
   * partial roll-up can never pass for the mandate the statement reports.
   */
  const mandateTotals = useMemo(() => {
    const m = new Map<string, { mv: number; count: number }>();
    for (const p of positions) {
      if (!heldUnderMandate(accIdx, p)) continue;
      const e = m.get(p.accountId) ?? { mv: 0, count: 0 };
      e.mv += p.marketValue; e.count += 1;
      m.set(p.accountId, e);
    }
    return m;
  }, [positions, accIdx]);
  /**
   * THE PICK-LIST IS OF HOLDINGS, NOT OF COMPANIES — biggest first, which
   * matches the table's default sort.
   *
   * It is keyed on `p.security` over EVERY position, so what it offers is every
   * AIF folio, mutual-fund scheme, ETF, cash sleeve and PMS mandate in the book
   * beside the company shares. Labelling it "companies" made a claim about the
   * set that its own first three options contradict, and it is the same failure
   * `assetClassLabel` was written to stop one heading over: a word that is true
   * of SOME of what is under it and not of all of it.
   */
  const securityNames = useMemo(() => {
    const mv = new Map<string, number>();
    for (const p of positions) mv.set(p.security, (mv.get(p.security) ?? 0) + p.marketValue);
    /**
     * ── AND A NAME THE FAMILY ONLY HOLDS INSIDE A FUND IS IN THE LIST ────────
     *
     * *"It could be a bond. It could be an NCD. If I type it, it has to first
     * pick up. And then it has to show me how much… there is a LIC Housing NCD
     * in the market. Now there's some negative news on LIC housing. I want to
     * see how much LIC housing I hold through my mutual fund exposure and
     * through which mutual fund."*
     *
     * The pick-list was built from `positions` alone, so it offered only what a
     * statement reports. LIC Housing Finance is in six of this family's funds
     * and in none of their statements, so typing it found nothing — and the
     * derived rows that do carry it were suppressed the moment anything was
     * picked. A reader could see the exposure only by scrolling 500 rows.
     *
     * ON THE SECURITY AXIS ONLY, because that is the only axis whose rows are
     * companies rather than holdings. Offering an issuer the book does not hold
     * under Category or Basket would name something no section could contain.
     */
    if (bySecurity && exposure.status === "ok") {
      for (const e of exposure.byKey.values()) if (!mv.has(e.name)) mv.set(e.name, e.total);
    }
    return [...mv.keys()].sort((a, b) => (mv.get(b) ?? 0) - (mv.get(a) ?? 0));
  }, [positions, bySecurity, exposure]);
  // Lets the sector filter reach the Transactions tape, which carries no sector of its own.
  const sectorByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of positions) m.set(p.securityKey, p.sector);
    return m;
  }, [positions]);
  /**
   * WHAT THE FAMILY NO LONGER HOLDS, AND WHY IT LEAVES THIS TABLE.
   *
   * *"In the holdings page we only need to show the current holdings. Since the
   * 3P fund is redeemed, we need to show it in the transactions page as sold
   * transaction."*
   *
   * A fund that has paid the family out reports 0.000 units at a NAV it goes on
   * publishing. That zero is MEASURED and it stays in the book — it is what
   * `isRedeemedToNil` was written to say out loud, and it is what lets the
   * redemption be shown as a movement rather than as a hole. What the family are
   * saying is that a closed position is not a holding, and a table headed
   * Holdings should not list one.
   *
   * SO IT IS DROPPED AT THE BASE OF THE ROW BUILD, before the filters, the
   * weight denominator, the footer set and the section subtotals — the one place
   * that makes every figure below it consistent by construction, which is how
   * the ring-fence is applied one layer up.
   *
   * IT MOVES NO MONEY. Measured on this book: 5 rows across 2 accounts, every
   * one of them ₹0 of market value and no reported cost. What changes is the row
   * count and the section counts, and the rows are NAMED under the table rather
   * than silently gone — this book shows what it can and names the rest.
   */

  const { rows, totMV, totCost, totPnL, rawMV, weightBase, weightCount, bucketTotals, smallDropped } = useMemo(() => {
    // Closed positions first, so nothing downstream has to remember to exclude
    // them: the filters, the weight base, the footer and every section subtotal
    // are struck over what the family actually holds.
    let base = currentHoldings(positions);
    /**
     * WHAT THE ₹1,000 FLOOR TOOK, struck on the UNFILTERED book deliberately.
     *
     * It is a fact about the BOOK — "six holdings are too small to list" — not
     * about whichever entity or category the reader has selected. Struck on the
     * filtered set it would read 0 the moment someone picked a category none of
     * the six sits in, and a disclosure that disappears under a filter is one a
     * reader can only find by accident.
     */
    const small = droppedHoldings(positions).negligible;
    const smallDropped = { count: small.length, value: sum(small.map((x) => x.marketValue)) };
    if (entity !== "All") base = base.filter((p) => ownerOf(accIdx, p) === entity);
    if (sector !== "All") base = base.filter((p) => p.sector === sector);
    /**
     * THE FILTER IS ON THE ACTIVE AXIS, and it has to be: its options come from
     * that axis (see `buckets`), so testing them against the category key would
     * compare a basket name to a category and match nothing — an empty table on
     * a page that renders perfectly. The filter and its option list must read
     * the SAME key or one of them is lying about what it offers.
     *
     * `groupAxis`, WHICH IS WHAT THIS TABLE SECTIONS ON — and deliberately NOT
     * `activeAxis`, the resolved axis the shared CONTROL lights.
     *
     * The two are the same thing here and are not on the table beside this one:
     * Transactions resolves `?group=security` to CATEGORY, because the security
     * axis files every holding in one section and is therefore not an allocation
     * axis at all. The CONTROL has to describe whichever table is visible, so it
     * reads `activeAxis`; this row build sections on `groupAxis` whatever the
     * other view is doing, and reading the resolved one here would make the
     * memo's answer depend on a value its dependency list does not carry —
     * measured, it served a stale Direct-Equity subset of the book under a
     * hidden filter. What keeps the two from ever disagreeing is `setView`,
     * which clears the section when the resolved axis moves.
     */
    if (bucket !== "All") base = base.filter((p) => groupKeyFor(groupAxis, accIdx, p) === bucket);
    /**
     * THE WEIGHT DENOMINATOR IS STRUCK HERE, BEFORE THE COMPANY FILTER.
     *
     * Weight answers "how big is this holding in the book" — the book the
     * entity / sector / category filters describe. The company pick-list is a
     * SEARCH over that book, not a redefinition of it: struck after it, picking
     * Jammu Kashmir Bank made a ₹4.39 Cr position read 100.0% of a ₹13,061.63 Cr
     * book, under a header that says only "Weight". Deduped, so the column sums
     * to 100 rather than to 101.4 when a holding is reported under two members.
     *
     * The FOOTER total keeps using the fully filtered set below — a footer must
     * tie to the rows above it — so the two differ whenever companies are
     * picked, and the caption under the table says so.
     */
    const weightSet = dedupedPositions(base);
    const weightBase = sum(weightSet.map((x) => x.marketValue));
    const weightCount = weightSet.length;
    // THE COMPANY FILTER NARROWS THE POSITIONS, NOT THE BUILT ROWS. It used to
    // run over the rows, which was the same thing while every row was a security
    // — and would now hide every mandate the moment a company was picked, since
    // a mandate row is not named after any of its shares. Picking Jammu Kashmir
    // Bank has to reach INSIDE Carnelian's mandate; that is the whole of what
    // the family asked for.
    if (selected.size > 0) base = base.filter((p) => selected.has(p.security));
    /**
     * ── THE FOOTER'S OWN SET, AND WHY THE STOCK AXIS NARROWS IT ─────────────
     *
     * A footer must tie to the column above it. On the stock axis the rows are
     * COMPANY SHARES — a fund has stopped being a row — so a footer struck over
     * every position would print the whole book's ₹710.4 Cr under a column whose
     * cells add to ₹222 Cr, and its Invested, Unrealised P&L and Return would
     * each cover a set the visible rows do not. That is the "a total must tie to
     * its own columns" failure this page has already paid for twice, and it is
     * what the fund rows leaving the table would otherwise have caused.
     *
     * `weightBase` above is deliberately NOT narrowed: Weight answers "what
     * share of my portfolio is this", and the portfolio is the whole book.
     */
    const footerSet = bySecurity ? base.filter(isCompanyShare) : base;
    const totalMV = consolidatedMarketValue(footerSet);

    /**
     * THE MANDATES COME OUT OF THE TABLE FIRST.
     *
     * A share a discretionary manager chose is still a share — §5 stands, PMS is
     * an engagement and never an asset class — but it is not a holding the
     * family decided on, and listing 263 of them beside the 38 it bought itself
     * is the mixing reported three times now. Each PMS ACCOUNT becomes ONE row;
     * its shares move into that row's expansion and its own drill-down.
     *
     * The split is on the ACCOUNT's engagement (`holdingBucket`), so a mandate's
     * CASH SLEEVE travels with it — which is what makes the row's market value
     * tie to the total its own statement prints (Carnelian 3517383: 39.53 Cr).
     */
    const mandateOf = new Map<string, Position[]>();
    const rest: Position[] = [];
    for (const p of base) {
      // ...EXCEPT ON THE STOCK AXIS, where clubbing the manager-chosen share
      // with the same name bought directly is the whole request. `mandateOf`
      // stays empty there, so `mandateRows` below is [] and nothing is hidden
      // inside a roll-up.
      //
      // AND ON THAT AXIS ONLY A COMPANY SHARE IS A ROW AT ALL:
      //
      //   "AIF itself shouldn't show up as a security."
      //
      // A fund is not a stock — it is ONE PURCHASE of a manager's portfolio —
      // so it stops being a row here and its money is accounted for in the
      // coverage caption instead: what the store could look through, what it
      // could not, and what inside a disclosed fund is not equity at all.
      // Dropping the fund rows WITHOUT that statement would leave a table that
      // silently covers 42% of the book under a footer a reader takes for the
      // whole of it, which is the caption-widening failure this page has paid
      // for twice.
      if (bySecurity) { if (isCompanyShare(p)) rest.push(p); continue; }
      if (heldUnderMandate(accIdx, p)) (mandateOf.get(p.accountId) ?? mandateOf.set(p.accountId, []).get(p.accountId)!).push(p);
      else rest.push(p);
    }
    const mandateRows: Row[] = [...mandateOf.entries()].map(([accountId, ps]) => {
      const acc = accIdx.get(accountId);
      const mv = sum(ps.map((x) => x.marketValue));
      // `sumOrNull` on both sides: a constituent whose statement carries no cost
      // contributes nothing rather than a zero, which would report its whole
      // market value as profit. Every PMS row in this drop reports one.
      const cost = sumOrNull(ps.map((x) => x.costBasis));
      const pnl = sumOrNull(ps.map((x) => x.unrealizedPnL));
      const costNA = cost === null || (cost === 0 && mv > 0);
      // The day figure is struck over the LIVE-PRICED constituents only, and the
      // row carries that value separately: a mandate whose shares are half
      // quoted must not divide its move by the half that never moved.
      const livePs = ps.filter((x) => x.live);
      const liveMV = sum(livePs.map((x) => x.marketValue));
      const dayChange = sum(livePs.map((x) => x.dayChange ?? 0));
      const whole = mandateTotals.get(accountId);
      return {
        kind: "mandate" as const,
        bucket: groupKeyFor(groupAxis, accIdx, ps[0]),
        groupSource: groupSourceFor(groupAxis, accIdx, ps[0]),
        // A mandate holds many securities bought on many dates. There is no one
        // window to annualise it over, so CAGR renders absent on these rows —
        // and for the same reason the capital behind the mandate bought no units
        // in any one share, so it carries no per-contribution breakdown either.
        // That money is on the Transactions card, in Capital in and out.
        heldSince: null,
        // NOR AN INVESTED-ON DATE, AND FOR THE SAME REASON ONE LEVEL UP. A
        // mandate is an ACCOUNT; the family funded it on dates the statements do
        // report, but those dates belong to the account and not to any share in
        // it. They are on the mandate's own page, beside its Invested tile and
        // under What the family put in.
        investedOn: null,
        // A MANDATE IS NEVER "REDEEMED": it is an account, and an account that
        // holds nothing says so through `noPositionsReason` on its own page.
        fundClasses: [],
        trancheSet: [],
        key: "mandate:" + accountId,
        /**
         * THE MANDATE'S NAME ALONE — the owner rides in the Entities column.
         *
         * This carried `mandateLabelWithOwner` because FOUR OF THIS BOOK'S TEN
         * MANDATES SHARE A STRATEGY NAME with another (Goldstandard's Aristos,
         * SVAN's Velocity, Green Lantern's GLC Growth, V.E.C's Small and
         * Mid-Cap — the same strategy run for two members), and on strategy
         * alone the section drew four pairs of identically-named rows with
         * nothing to tell them apart.
         *
         * THAT REASON EXPIRED WHEN THE COLUMNS WERE REORDERED. Entities now
         * closes every row and a mandate row populates it (just below), so the
         * pairs are distinguished by the column that exists for exactly this
         * rather than by a name carrying a second field inside it. The helper
         * stays for callers that render a mandate OUTSIDE this table, where
         * there is no Entities column to lean on.
         */
        security: mandateLabel(acc),
        securityKey: "", sector: "", assetClass: "",
        entities: [...new Set(ps.map((x) => ownerOf(accIdx, x)))],
        quantity: null, avgCost: null, currentPrice: null,
        costBasis: cost, marketValue: mv, unrealizedPnL: costNA ? null : pnl,
        returnPct: !costNA && pnl !== null && (cost as number) > 0 ? (pnl / (cost as number)) * 100 : null,
        weight: weightBase > 0 ? mv / weightBase : 0,
        costNA,
        live: livePs.length > 0,
        dayChange,
        dayChangePct: livePs.length && liveMV - dayChange !== 0 ? (dayChange / (liveMV - dayChange)) * 100 : null,
        liveMV,
        realizedKeys: [...new Set(ps.map((x) => x.securityKey))],
        mandate: {
          accountId, name: mandateLabel(acc),
          manager: acc?.provider ?? "", accountNo: acc?.accountNo ?? "", asOf: acc?.asOf ?? "",
          holdings: ps.map((x) => ({
            securityKey: x.securityKey, security: x.security, sector: x.sector,
            quantity: x.quantity, avgCost: x.avgCost, currentPrice: x.currentPrice,
            costBasis: x.costBasis, marketValue: x.marketValue, unrealizedPnL: x.unrealizedPnL,
            returnPct: x.returnPct, costNA: !!x.costUnavailable || x.costBasis === null, live: !!x.live,
          })).sort((a, b) => b.marketValue - a.marketValue),
          accountMV: whole?.mv ?? mv, accountCount: whole?.count ?? ps.length,
        },
      };
    });

    let out: Row[];
    if (bySecurity || consolidate) {
      /**
       * Consolidated on (BUCKET, securityKey) — not on securityKey alone.
       *
       * ISIN could not do this grouping at all: most rows have none. And the
       * bucket has to be half the key, because a name held BOTH ways is two
       * different decisions about one company and must read as two rows — one
       * under Direct Equity, one under the mandate that chose it — rather than
       * silently landing under whichever route the first lot happened to take.
       * No name in this drop is held both ways (measured: zero of 175 distinct
       * equity names), so nothing on screen moves today; the key is what stops a
       * future drop merging them without a word.
       */
      /**
       * ── ONE ROW PER FUND, NOT PER UNIT CLASS ──────────────────────────────
       *
       * *"3P Class A B1 B2, all of that should be shown as a single line item
       * as just 3P funds like in the excel sheet, we can only see 3P funds in
       * the stable growth basket … and then when we click on it we should see a
       * drop down list of all the other categories."*
       *
       * A Category-III AIF issues ONE portfolio under several unit classes that
       * differ by management fee: 3P's statement prints B1 1.20%, B2 1.00%,
       * B3 0.70% and a Reclassification table that moved every unit out of B1
       * and B2 into B3 on one day. The family's review carries one line per
       * FUND, and this table drew one per class.
       *
       * TWO GUARDS, AND THE SECOND IS THE ONE THAT KEEPS A FIGURE HONEST:
       *
       *  - the BOOK must carry more than one class of the fund. A fund with a
       *    single class keeps the name its statement prints — see `fundClasses`.
       *  - and the FILTERED SET must hold every class the book has. Under a
       *    filter that picks one class, a row headed with the fund's name would
       *    print one class's figures as the fund's — the "caption asserts what a
       *    named counterparty reports" failure a mandate row is already guarded
       *    against, arriving through a unit class.
       *
       * Measured over all 220 names in the book: 10 carry a class suffix and
       * exactly TWO funds carry more than one — 3P (B1/B2/B3) and Sanshi
       * (A2/E). Sanshi clubs to ₹204.48 Cr, which is the family review's own
       * `Sanshi Fund 1` line to the rupee, and that is the independent witness
       * that this grouping is the one they asked for.
       */
      const classesInBook = new Map<string, Set<string>>();
      for (const p of positions) {
        const f = splitFundClass(p.security);
        if (f) (classesInBook.get(f.fund) ?? classesInBook.set(f.fund, new Set()).get(f.fund)!).add(f.cls);
      }
      const classesShown = new Map<string, Set<string>>();
      for (const p of rest) {
        const f = splitFundClass(p.security);
        if (f) (classesShown.get(f.fund) ?? classesShown.set(f.fund, new Set()).get(f.fund)!).add(f.cls);
      }
      const clubbed = new Set<string>();
      for (const [fund, inBook] of classesInBook) {
        if (inBook.size < 2) continue;
        const shown = classesShown.get(fund);
        if (shown && shown.size === inBook.size) clubbed.add(fund);
      }
      // The key a row groups on: the FUND where its classes are clubbed, and the
      // security otherwise. `securityKey` is untouched by any of this — it is
      // still the join, still what a class links to, and still what every
      // drill-down resolves on.
      const rowKeyOf = (p: Position) => {
        const f = splitFundClass(p.security);
        return f && clubbed.has(f.fund) ? "fund\u0000" + f.fund : p.securityKey;
      };

      const m = new Map<string, Position[]>();
      for (const p of rest) {
        // ON THE SECURITY AXIS THE KEY IS THE NAME ALONE. The bucket half exists
        // to keep a name held BOTH ways reading as two decisions about one
        // company; here the reader has asked for exactly the opposite — the
        // name's whole exposure, however it was arrived at — and the route is
        // named per account in the row's own expansion rather than by splitting
        // the row in two.
        const k = bySecurity ? rowKeyOf(p) : bucketFor(accIdx, p) + " | " + rowKeyOf(p);
        (m.get(k) ?? m.set(k, []).get(k)!).push(p);
      }
      out = [...m.values()].map((ps) => {
        // COUNT EACH dedupeGroup ONCE. This is the CONSOLIDATED (by-security)
        // view, so a holding reported under two members — 360 ONE Special Opp
        // (both CRNs) and Transition Fund I (both trusts) share one securityKey —
        // must contribute its value once. Summing the raw lots showed those two
        // rows at 2x and pushed the footer above the book's own NAV.
        // `dedupedPositions` collapses only same-dedupeGroup rows; a name held by
        // several DIFFERENT accounts still sums all of them.
        const dps = dedupedPositions(ps);
        const mv = sum(dps.map((x) => x.marketValue));
        // `sumOrNull`: a lot with no reported cost contributes nothing rather
        // than a zero that would understate the consolidated basis.
        const cost = sumOrNull(dps.map((x) => x.costBasis));
        const qty = sum(dps.map((x) => x.quantity));
        const costNA = cost === null || (cost === 0 && mv > 0);
        const pnl = costNA ? null : mv - (cost as number);
        // A security is live only if every lot of it is — they share one quote,
        // so in practice this is all-or-nothing.
        const live = dps.every((x) => x.live);
        // Oldest start, but only where every lot behind the row has one: a
        // consolidated holding whose second account reports no purchase date
        // has no measurable start, and dating it from the account that does
        // would annualise over a window the other half never occupied.
        const heldSince = dps.every((x) => x.heldSince)
          ? dps.reduce((a: string, x) => (x.heldSince! < a ? x.heldSince! : a), dps[0].heldSince!)
          : null;
        /**
         * A CLUBBED FUND ROW HAS NO SINGLE UNIT, so its per-unit columns behave
         * exactly as a MANDATE row's do — and for the same reason.
         *
         * 3P's three classes are marked at 169.221 / 170.447 / 163.484 and
         * Sanshi's two at NAVs of their own: units of different classes are not
         * fungible, so a summed quantity has no price and a blended average cost
         * and CMP are figures no statement prints. Money IS additive across
         * classes — invested, market value, weight, P&L and return are ordinary
         * sums — so those stay, and the three per-unit cells render an
         * `AbsentCell` naming the cause rather than a plausible blend.
         */
        const fundClasses = clubbedClassesOf(ps);
        const perUnit = fundClasses.length === 0;
        return {
          kind: "security" as const, bucket: groupKeyFor(groupAxis, accIdx, ps[0]),
        groupSource: groupSourceFor(groupAxis, accIdx, ps[0]),
          key: ps[0].securityKey, security: fundClasses.length ? splitFundClass(ps[0].security)!.fund : ps[0].security,
          securityKey: ps[0].securityKey, sector: ps[0].sector, assetClass: ps[0].assetClass,
          fundClasses,
          entities: Array.from(new Set(ps.map((x) => ownerOf(accIdx, x)))), quantity: perUnit ? qty : null,
          avgCost: perUnit && !costNA && qty > 0 ? (cost as number) / qty : null,
          currentPrice: perUnit ? ps[0].currentPrice : null,
          navPriced: perUnit && !!ps[0].navPriced, navDate: ps[0].navDate,
          costBasis: cost, marketValue: mv, unrealizedPnL: pnl,
          returnPct: !costNA && pnl !== null && (cost as number) > 0 ? (pnl / (cost as number)) * 100 : null,
          weight: weightBase > 0 ? mv / weightBase : 0,
          costNA,
          heldSince,
          // Struck over the DEDUPED set, like every other figure on this row: the
          // raw one reports Transition Venture Fund I twice and would count one
          // subscription as two payments.
          investedOn: investedOnOf(dps),
          // The DEDUPED set, which is what every other figure on this row sums.
          trancheSet: dps,
          live,
          dayChange: sum(dps.map((x) => x.dayChange ?? 0)),
          dayChangePct: ps[0].dayChangePct ?? null,
          liveMV: live ? mv : 0,
          // EVERY KEY THE ROW CLUBS. A realised gain is reported per SECURITY, so
          // a row standing for three classes claims all three or none — one key
          // would silently drop two classes' realised figures from the cell.
          // Identical to the old single-key form on every unclubbed row.
          realizedKeys: [...new Set(ps.map((x) => x.securityKey))],
          /**
           * ON EVERY AXIS, NOT JUST THE SECURITY ONE.
           *
           * *"just like how you have show individual investments return in the
           * drop down for securities you need to implement the same for
           * category/asset class/basket as well … so we can see individual
           * investments returns in any selected filter."*
           *
           * The axis only decides WHICH SECTION a row sits in; the row itself is
           * the same holding, clubbed from the same statements. So the way it
           * opens should be the same too — and it was not: this was gated on
           * `bySecurity`, so on Category, Asset class and Basket the name cell
           * drew no chevron at all and the older per-ENTITY panel below could
           * only be reached from an "N entities" pill at the far right end of
           * the row, off the edge of the table.
           *
           * THAT PANEL WAS ALSO WRONG WHERE IT DIFFERED, which is why this
           * REPLACES it rather than sitting beside it: it was built from the
           * DEDUPED set while the pill counting entities was built from the raw
           * one, so Transition Venture Fund I — held by two family trusts and
           * reported by both — showed a pill reading "2 entities" over a table
           * of one row. `venuesOf` lists every statement as printed and NAMES
           * the overlap, which is §"a consolidated figure counts each
           * dedupeGroup ONCE; a per-account or per-owner figure does not".
           *
           * Measured: 75 consolidated rows on a non-security axis, 12 held
           * through more than one account, 2 carrying that overlap.
           */
          venues: venuesOf(ps, accIdx),
          isin: ps.find((x) => x.isin)?.isin ?? null,
        };
      });
    } else {
      out = rest.map((p) => ({
        kind: "security" as const, bucket: groupKeyFor(groupAxis, accIdx, p),
        groupSource: groupSourceFor(groupAxis, accIdx, p),
        key: p.securityKey + "@" + p.accountId, security: p.security, securityKey: p.securityKey, sector: p.sector, assetClass: p.assetClass,
        entities: [ownerOf(accIdx, p)], fundClasses: [], quantity: p.quantity, avgCost: p.avgCost, currentPrice: p.currentPrice,
        navPriced: !!p.navPriced, navDate: p.navDate,
        costBasis: p.costBasis, marketValue: p.marketValue, unrealizedPnL: p.unrealizedPnL,
        returnPct: p.returnPct, weight: weightBase > 0 ? p.marketValue / weightBase : 0,
        costNA: !!p.costUnavailable || p.costBasis === null,
        heldSince: p.heldSince,
        investedOn: investedOnOf([p]),
        trancheSet: [p],
        live: !!p.live, dayChange: p.dayChange ?? 0, dayChangePct: p.dayChangePct ?? null,
        liveMV: p.live ? p.marketValue : 0,
        realizedKeys: [p.securityKey],
        dedupeGroup: p.dedupeGroup,
      }));
    }
    // A mandate row IS one account's statement already, so it is the same row in
    // both views: the by-entity toggle splits a CONSOLIDATED security back into
    // the statements that reported it, and a mandate was never consolidated.
    out = [...out, ...mandateRows];

    /**
     * ── THE CUMULATIVE STOCK POSITION ──────────────────────────────────────
     *
     *   "We need to calculate cumulative stocks position held in the whole
     *    portfolio together… then you tell me direct you hold X Cr through
     *    direct equity, and then you hold another Y crores through these five
     *    funds."
     *
     * Two halves, and they are DIFFERENT KINDS OF FIGURE. The first is the
     * book's own: a direct holding and a PMS mandate both REPORT THE SHARE, so
     * the rows built above already carry it. The second is not reported about
     * this family at all — the AMC disclosed what the FUND holds, and the
     * family's share is derived from the units they own.
     *
     * THE FAMILY ASKED FOR THEM ADDED, having been shown them side by side
     * first, so they are added — into `totalExposure`, which is its own field,
     * carries its own column and is labelled derived on the card that itemises
     * it. `marketValue` is untouched and still means what the statements say.
     *
     * A COMPANY ONLY A FUND HOLDS IS STILL EXPOSURE, so it gets a row too — 395
     * of them on this book, against 174 the statements report directly. Every
     * measured column on such a row is ABSENT WITH ITS REASON rather than zero:
     * no document reports a quantity, a cost or a price for a share the family
     * owns through somebody else's portfolio.
     *
     * THE FILTERS THAT CANNOT REACH A DERIVED ROW SUPPRESS IT rather than
     * silently not applying. A derived-only company has no account, so it has no
     * entity; the book carries no sector for a company it does not hold; and the
     * pick-list is built from the book's own names, so it can never name one. A
     * filter that looks like it narrowed and did not is worse than one that says
     * what it dropped.
     */
    if (bySecurity) {
      const ex = exposure.status === "ok" ? exposure : null;
      const matched = new Set<string>();
      out = out.map((r) => {
        const hit = ex?.byKey.get(r.securityKey);
        if (hit) matched.add(r.securityKey);
        const viaFunds = hit?.total ?? 0;
        const totalExposure = r.marketValue + viaFunds;
        return {
          ...r,
          viaFunds,
          totalExposure,
          // WEIGHT IS THE FAMILY'S OWN QUESTION — "this much percentage of the
          // portfolio" — so it is the TOTAL exposure over the book, not the
          // measured half. The column therefore sums to the stock share of the
          // book rather than to 100, and the caption says so.
          weight: weightBase > 0 ? totalExposure / weightBase : 0,
        };
      });
      /**
       * A DERIVED ROW SURVIVES THE PICK-LIST, AND ONLY THE PICK-LIST.
       *
       * Entity and sector still suppress it, and must: a company the family
       * reach only through a fund has no account and so no entity, and the book
       * carries no sector for a company it does not hold — a filter that looked
       * like it narrowed and did not is worse than one that says what it
       * dropped. The SECURITY filter is different now that the list offers these
       * names (see `securityNames`): picking LIC Housing Finance and being shown
       * nothing is the defect the family reported, not a narrowing.
       */
      const derivedShown = ex && entity === "All" && sector === "All";
      if (derivedShown) {
        for (const e of ex.byKey.values()) {
          if (matched.has(e.key)) continue;
          if (selected.size > 0 && !selected.has(e.name)) continue;
          out.push({
            kind: "security" as const,
            bucket: SECURITY_SECTION,
            groupSource: null,
            key: "derived:" + e.key,
            security: e.name,
            securityKey: e.key,
            // A derived look-through row stands for a company inside a fund, so
            // there is no unit class to club and none to name.
            fundClasses: [],
            sector: "",
            // WHAT THE FUNDS ACTUALLY FILED IT AS. Hardcoded `Equity` was true
            // while the store carried the equity section alone; an issuer the
            // family reach only through its NCDs is not an equity holding, and
            // filing it as one is the fabricated-classification failure.
            assetClass: e.classes.length === 1 ? e.classes[0] : e.classes.join(" · ") || "Equity",
            entities: [],
            // AN EMPTY VENUE LIST, NOT AN ABSENT ONE — the row HAS something to
            // open. No statement in this book reports this issuer, so there is
            // no account to list; what the expansion carries is the look-through
            // itself, which is the whole reason the row exists. Without this the
            // row drew no chevron and the family's own example — "how much LIC
            // housing I hold through my mutual fund exposure and through which
            // mutual fund" — was unreachable on exactly the name they named.
            venues: [],
            quantity: null, avgCost: null, currentPrice: null,
            costBasis: null, marketValue: 0, unrealizedPnL: null, returnPct: null,
            weight: weightBase > 0 ? e.total / weightBase : 0,
            costNA: true,
            heldSince: null,
            // A DERIVED ROW HOLDS NO POSITION AT ALL — the family reach this
            // company through somebody else's portfolio, and no document reports
            // a quantity, a cost or a purchase date for it. Absent, like every
            // other measured cell on this row.
            investedOn: null,
            trancheSet: [],
            live: false, dayChange: 0, dayChangePct: null, liveMV: 0,
            realizedKeys: [],
            isin: e.isin,
            viaFunds: e.total,
            totalExposure: e.total,
            measuredNA: true,
          });
        }
      }
    }

    /**
     * THE STOCK AXIS RANKS BY TOTAL EXPOSURE, and it does that by MAPPING the
     * default sort rather than by holding a second piece of state. The axis can
     * arrive from the URL (`?group=security`) without passing through
     * `setGroupAxis`, so a default written into state would be wrong on exactly
     * the route the sweep and a shared link both use. Clicking either money
     * header still sorts on that header's own figure.
     */
    const effSort = bySecurity ? "totalExposure" as const : "marketValue" as const;
    out.sort((a, b) => (b[effSort] ?? 0) - (a[effSort] ?? 0));
    // Footer totals are CONSOLIDATED in every view (each dedupeGroup once), so the
    // family total is the true NAV regardless of grouping — and it is struck over
    // the POSITIONS, so rolling the mandates up into ten rows cannot move it by a
    // rupee. `rawMV` is the sum of displayed rows — equal to the total in the
    // by-security view, and higher in the by-entity view where both members' rows
    // of a dually-reported AIF show as printed; the caption names that gap rather
    // than letting the footer assert it.
    const db = dedupedPositions(footerSet);
    /**
     * HOW MUCH OF THE MARKET VALUE COLUMN THE COST COLUMN ACTUALLY COVERS.
     *
     * `sumOrNull` skips a position whose statement carries no cost rather than
     * entering it as zero, which is right — but it means Invested and Unrealised
     * P&L are struck over a SMALLER SET than Market value, and the footer prints
     * all three side by side. A reader adds the first two, lands well short of
     * the third, and has found a contradiction.
     *
     * There is none: the two are on their own consistent basis (invested + P&L
     * IS the market value of the positions that report a cost, to the rupee).
     * What was missing is any statement that they cover a different set. These
     * three are what the caption needs to say so.
     */
    const costed = db.filter((x) => x.costBasis != null);
    /**
     * ── EVERY METRIC, PER CATEGORY — STRUCK OVER THE FOOTER'S OWN SET ────────
     *
     * "Show aggregate totals for every metric for each category." The section
     * heading has always carried a holding count and a market value; a reader
     * comparing categories on anything else — what they cost, what they are up,
     * how much of the book they are — had to add a column by eye.
     *
     * THE PARTITION IS OF `db`, THE POSITIONS THE FOOTER ITSELF SUMS, so the
     * categories add to the Total row BY CONSTRUCTION rather than by a tolerance.
     *
     * Summing the ROWS instead would tie for market value and could miss for the
     * other two: a consolidated row carries `mv − cost` as its P&L while the
     * footer sums the lots' own, and those differ the moment ONE security is
     * consolidated from a costed lot and an uncosted one — right on both sides,
     * and different, so the categories would land beside a Total they do not add
     * to. MEASURED ON THIS BOOK THAT CONDITION IS ZERO: none of the 216
     * consolidated groups mixes the two, so the wrong construction would tie
     * here and no check could catch it. It is written down rather than tested
     * for, which is what this file does with a hazard the corpus cannot yet
     * exercise, and it is why the right construction was worth choosing before a
     * drop makes the difference visible instead of after.
     *
     * `groupKeyFor` IS THE SAME FUNCTION THE ROW BUILD KEYS ITS SECTION ON, so
     * the partition here and the sections on screen cannot describe different
     * sets — on whichever of the three axes the reader has picked. Keying this
     * on `bucketFor` while the table sections on Basket would have totalled the
     * category a holding sits in and printed it under the basket's heading:
     * every figure right, every one under the wrong name.
     */
    const bucketTotals = new Map<string, BucketTotals>();
    for (const x of db) {
      const k = groupKeyFor(groupAxis, accIdx, x);
      let t = bucketTotals.get(k);
      if (!t) bucketTotals.set(k, (t = { mv: 0, cost: null, pnl: null, costedMV: 0, costedCount: 0, heldCount: 0 }));
      t.mv += x.marketValue;
      t.heldCount += 1;
      // `sumOrNull` semantics, accumulated: a statement that reports no cost
      // contributes NOTHING rather than a zero, and a category where none of
      // them does stays null and renders an em dash with its reason.
      if (x.costBasis != null) { t.cost = (t.cost ?? 0) + x.costBasis; t.costedMV += x.marketValue; t.costedCount += 1; }
      if (x.unrealizedPnL != null) t.pnl = (t.pnl ?? 0) + x.unrealizedPnL;
    }
    return {
      rows: out, totMV: totalMV,
      totCost: sumOrNull(db.map((x) => x.costBasis)),
      totPnL: sumOrNull(db.map((x) => x.unrealizedPnL)),
      rawMV: sum(out.map((r) => r.marketValue)),
      costedMV: sum(costed.map((x) => x.marketValue)),
      costedCount: costed.length,
      heldCount: db.length,
      weightBase, weightCount, bucketTotals, smallDropped,
    };
  }, [positions, accIdx, mandateTotals, consolidate, bySecurity, exposure, selected, sector, entity, bucket, groupAxis]);
  /**
   * Rows grouped by BUCKET, not by asset class — the fix the family asked for
   * three times. Direct Equity is what they bought themselves; PMS mandates is
   * what a discretionary manager runs for them; the wrappers and cash keep their
   * own class. Sectioning only when more than one bucket is on screen.
   */
  const bucketGroups = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of rows) (g.get(r.bucket) ?? g.set(r.bucket, []).get(r.bucket)!).push(r);
    return [...g.entries()]
      .map(([key, rs]) => {
        /**
         * THE SECTION SUBTOTAL IS ON THE FOOTER'S BASIS — each `dedupeGroup`
         * once — because a reader who adds the section headings and lands
         * somewhere other than the footer has found a contradiction, and this
         * book's own rule says no caption rescues one.
         *
         * It bites on the AIF section and only there. Both of this book's
         * duplicates are AIF holdings reported under two members — 360 ONE
         * Special Opportunities under CRN37702 and CRN60117, Transition Venture
         * Fund I under both Bharat trusts — so in the BY-ENTITY view, which
         * shows every statement's row as printed, the AIF heading summed
         * ₹3.17 Cr the footer beneath it (correctly) does not.
         *
         * Both rows still SHOW: `dedupedPositions`' policy is carry both, count
         * once. What is collapsed is named in the heading, so the difference
         * between the rows on screen and the subtotal above them is stated
         * rather than left for the reader to discover by adding them up.
         *
         * AND IT IS `bucketTotals`, NOT A SECOND DEDUPE OF ITS OWN. The heading
         * used to walk the rows collapsing repeated groups, which is a correct
         * computation and was a SECOND SOURCE for a figure the totals row now
         * also prints, a few pixels below it. The two agreed except in the
         * by-entity view, where they would have picked different members of the
         * ₹1.46 Cr pair and printed marks ₹87,950 apart under one heading. One
         * figure, computed once, printed twice.
         */
        const totals = bucketTotals.get(key) ?? null;
        const raw = sum(rs.map((r) => r.marketValue));
        const subtotal = totals ? totals.mv : raw;
        // The gap between the rows ON SCREEN and the subtotal above them, which
        // is what the note claims — derived from the printed figure rather than
        // accumulated beside it, so the two cannot drift.
        const collapsed = raw - subtotal;
        // HOW MANY HOLDINGS THE SECTION STANDS FOR, which is not how many rows it
        // draws: a mandate row stands for every share inside it, so the PMS
        // heading counts 281 across 10 rows. Counting rows there would report the
        // section as ten holdings and quietly retire 271 of them from the page.
        const holdings = rs.reduce((n, r) => n + (r.mandate ? r.mandate.holdings.length : 1), 0);
        /**
         * THE DAY MOVE IS THE ONE METRIC STRUCK OVER ROWS, and deliberately.
         *
         * Every other figure in the totals row comes from `bucketTotals`, the
         * partition of the positions the footer sums. The footer's own day move
         * does not: it is summed over the ROWS the feed actually priced
         * (`liveRows`), because a mandate's move is struck over the constituents
         * that carry a quote and its cash sleeve never will. Striking the
         * category's move over positions instead would tie to nothing — the two
         * sets differ by every partly-quoted row — so it is summed here exactly
         * as the footer sums it, one section at a time.
         *
         * `liveMV` and not `marketValue`, for the same reason: the denominator
         * is what the feed repriced, or a section holding one quoted share
         * beside a folio nobody prices would report a tenth of its own move.
         */
        const live = rs.filter((r) => r.live && r.dayChangePct != null);
        const day = sum(live.map((r) => r.dayChange));
        const dayBase = sum(live.map((r) => r.liveMV));
        /**
         * HOW MUCH OF THIS SECTION THE FAMILY PLACED BY RULE RATHER THAN BY
         * NAMING IT. On the same deduped basis as the subtotal above, so the
         * two figures in one heading are always comparable — a rule-placed
         * value larger than the subtotal beside it would be a contradiction a
         * reader could see, and this is what stops it arising.
         */
        const ruleSeen = new Set<string>();
        let ruleMV = 0;
        for (const r of rs) {
          if (r.groupSource !== "rule") continue;
          if (r.dedupeGroup) { if (ruleSeen.has(r.dedupeGroup)) continue; ruleSeen.add(r.dedupeGroup); }
          ruleMV += r.marketValue;
        }
        return {
          key, rows: rs, subtotal, collapsed, holdings, ruleMV,
          day, dayBase, liveRows: live.length,
          dayPct: live.length && dayBase - day !== 0 ? (day / (dayBase - day)) * 100 : null,
          totals,
        };
      })
      .sort((a, b) => groupOrdFor(groupAxis)(a.key) - groupOrdFor(groupAxis)(b.key));
  }, [rows, bucketTotals, groupAxis]);  const showBucketSections = bucket === "All" && bucketGroups.length > 1;
  // NULL when the visible rows carry no cost between them — the total-return
  // cell then renders `—` instead of a 0.00% nobody measured.
  const totalRet = totCost !== null && totPnL !== null && totCost > 0 ? (totPnL / totCost) * 100 : null;
  // In the by-entity view the displayed rows include both members' copies of a
  // dually-reported holding; name the gap so the footer (consolidated) reads true.
  const dupGap = !consolidate && rawMV - totMV > 1 ? rawMV - totMV : 0;
  /**
   * THE SECURITY AXIS'S OWN TWO FIGURES, both DERIVED from the rows on screen so
   * the caption cannot go stale: how many names are genuinely clubbed across more
   * than one account, and how much of the table is a fund whose constituents this
   * book does not carry. Zero on every other axis, where the caption is not drawn.
   */
  const clubbedCount = useMemo(() => rows.filter((r) => (r.venues?.length ?? 0) > 1).length, [rows]);
  /**
   * ── WHAT THE STOCK AXIS COVERS, AND WHAT IT CANNOT — A PARTITION ──────────
   *
   * The rows on this axis are companies, so the footer no longer describes the
   * book: a fund is not a stock and has stopped being a row. That is exactly the
   * arrangement in which a reader takes a table's total for the whole of their
   * money, so every rupee of NAV is placed in one of five buckets and the five
   * are printed. They sum to the book's own NAV by construction — each is a
   * disjoint slice of the same deduped positions.
   *
   *   measured   the stocks the statements report, direct and mandate-held
   *   derived    the family's share of what the disclosed funds hold
   *   opaque     inside vehicles that publish nothing this book can join
   *   nonEquity  inside a disclosed fund and not equity — its cash and debt
   *              sleeves, a gold or silver ETF's metal, the disclosure's rounding
   *   cash       the book's own cash rows
   *
   * `opaque` is the one that matters most and it is almost entirely the AIF
   * block: half this book by value, and no drop of the current statements can
   * ever fill it, because an AIF files no portfolio disclosure that joins to a
   * folio the family holds.
   */
  const stockCoverage = useMemo(() => {
    // Current holdings, like every other figure on this page. A closed position
    // is a measured ₹0, so no bucket moves — but the partition is a statement
    // about what the family HOLDS, and the counts inside it have to mean that.
    const held = currentHoldings(consolidated);
    const stocks = held.filter(isCompanyShare);
    const measured = sum(stocks.map((p) => p.marketValue));
    const cash = sum(held.filter((p) => p.assetClass === "Cash").map((p) => p.marketValue));
    const nav = sum(held.map((p) => p.marketValue));
    const ex = exposure.status === "ok" ? exposure : null;
    const derived = ex?.total ?? 0;
    const opaque = ex?.skippedValue ?? 0;
    const unaccounted = ex?.unaccountedValue ?? 0;
    const aif = (ex?.skipped ?? []).filter((sk) => /^an AIF files/.test(sk.reason));
    return {
      nav, measured, derived, opaque, unaccounted, cash,
      total: measured + derived,
      names: new Set(stocks.map((p) => p.securityKey)).size,
      aifCount: aif.length,
      aifValue: sum(aif.map((sk) => sk.marketValue)),
      covered: ex?.covered ?? 0,
      // Both are 0 until the look-through answers, and both are rendered ONLY
      // inside the `status === "ok"` branch — a page that has not been told how
      // many funds were considered says it is still loading rather than printing
      // "0 of 0", which is a measurement nobody made.
      considered: ex?.considered ?? 0,
      /**
       * ONE COMPANY THE BOOK ITSELF CARRIES UNDER TWO KEYS — named, never merged.
       *
       * THIS USED TO BE THE ICICI CASE AND IT IS FIXED IN THE EXTRACTOR NOW. A
       * PMS statement printed `ICICI Bank Ltd.` and the depository printed
       * `ICICI BANK-EQ`, and the key was derived from the RAW name, so ₹3.00 Cr
       * of one company stood here as two rows. `securityKeyOf` removes the
       * depository's own furniture before taking the key, which is where the
       * repair belongs: "if a join fails, fix the EXTRACTOR — never re-derive a
       * key in the presentation layer, which hides the defect from the
       * reconciler." The sentence below is what stayed.
       *
       * IT IS KEYED ON THE ISIN NOW, BECAUSE THE NAME TEST BECAME A TAUTOLOGY.
       * Counting against `securityKeyOf(stripDepositoryTail(name))` compared the
       * key with its own definition once the strip moved inside it — a check
       * that cannot fail. What CAN still split a company is a name one issuer
       * CLIPS and another spells out (`HELIOS FCF D-GROW` against `Helios Flexi
       * Cap Fund - Direct Growth`), and no rule here bridges that: the strip
       * only ever removes, and it never supplies a name the statement did not
       * print. The ISIN is evidence neither NAME controls, so it is the witness
       * — and where it says two keys are one security, that is a defect this
       * page STATES rather than repairs. `build-book` prints the whole list,
       * over every holding rather than only the company shares this table
       * draws, so the ask reaches `docs/BOOK-REPORT.md` intact.
       */
      splitNames: (() => {
        const byIsin = new Map<string, Set<string>>();
        for (const p of stocks) {
          if (!p.isin) continue;
          (byIsin.get(p.isin) ?? byIsin.set(p.isin, new Set()).get(p.isin)!).add(p.securityKey);
        }
        const split = [...byIsin.values()].filter((v) => v.size > 1);
        const keys = new Set(split.flatMap((v) => [...v]));
        return {
          count: split.length,
          value: sum(stocks.filter((p) => keys.has(p.securityKey)).map((p) => p.marketValue)),
        };
      })(),
    };
  }, [consolidated, exposure]);
  /**
   * WHAT THE WEIGHT COLUMN DIVIDES BY, IN WORDS — and by how much that
   * denominator exceeds the rows on screen.
   *
   * `weightBase` is struck BEFORE the company pick-list (see the memo), so a
   * picked company keeps the weight it has on the unfiltered table instead of
   * being re-based to 100% of itself. The price of that is a column which no
   * longer adds to 100 while a company filter is on, and the caption below the
   * table states it: a reader who adds a column and lands somewhere else must
   * be told why, not left to discover it.
   */
  const weightScope = [entity !== "All" ? entity : null, sector !== "All" ? sector : null, bucket !== "All" ? groupLabelFor(groupAxis)(bucket) : null].filter(Boolean).join(" · ");
  const weightPlain = `How big this holding is as a share of ${weightScope ? `the ${weightScope} book` : "the whole book — every account and every asset class"}: ${weightCount} positions, with a holding reported under two members counted once. The company pick-list narrows the rows above, never this denominator.`;
  const weightGap = weightBase - totMV > 1 ? weightBase - totMV : 0;
  /**
   * THE REALISED COLUMN CANNOT ADD UP TO ITS OWN FOOTER, AND THE PAGE SAYS SO.
   *
   * The footer sums the realised gain over the UNION of every row's keys, which
   * is right — rolling 281 shares into ten mandate rows must not empty the book's
   * realised figure. But a mandate row shows `—` in that column, deliberately: a
   * name's realised gain is reported per security across the whole book and
   * these managers hold the same names in more than one mandate, so attributing
   * it to one mandate row would count it twice.
   *
   * Six of the seven accounts that issue a capital gain statement in this drop
   * are mandates, so most of the footer is made inside rows that display none of
   * it. That is a printed total which does not tie to its own visible cells,
   * and this book's
   * own rule is that such a gap is NAMED with its size rather than left for a
   * reader to find by adding. `inMandates` is that size — derived from the same
   * map the cells read, so it cannot drift from the total beside it.
   *
   * A name held BOTH inside a mandate and in the family's own demat has a
   * security row of its own, which displays it — so it is removed from the
   * hidden set rather than counted as concealed.
   */
  const realisedSplit = (() => {
    if (!consolidate || !realized) return null;
    const shown = new Set<string>();
    const inside = new Set<string>();
    for (const r of rows) for (const k of r.realizedKeys) (r.kind === "mandate" ? inside : shown).add(k);
    for (const k of shown) inside.delete(k);
    const val = (k: string) => realized.get(k) ?? null;
    const keys = [...shown, ...inside];
    return {
      total: sumOrNull(keys.map(val)),
      inMandates: sumOrNull([...inside].map(val)),
      names: [...inside].filter((k) => val(k) !== null).length,
      /**
       * WHICH ABSENCE IT IS, because the footer used to give one reason for two.
       *
       * `total` is null in two situations the ROW cells already keep apart, and a
       * reader acts differently on each: no key of any visible row appears in the
       * realised map at all — nothing here was ever sold — or keys are present and
       * every value is null, meaning these names WERE sold and no capital gain
       * statement covers the accounts they were sold from. Told the second when the
       * first is true, a reader goes hunting for statements that were never owed.
       */
      anySold: keys.some((k) => realized.has(k)),
    };
  })();
  /**
   * ── THE REALISED COLUMN, SPLIT ACROSS THE CATEGORIES THAT MADE IT ──────────
   *
   * The footer sums realised gain over the UNION of every row's securityKeys,
   * because a name's realised figure is reported PER SECURITY across the whole
   * book and rolling 281 shares into ten mandate rows must not empty it. The
   * per-category totals have to add to that, so they are struck the same way and
   * a key is CLAIMED BY EXACTLY ONE CATEGORY — the first in reading order that
   * holds the name.
   *
   * A name held both directly and inside a mandate is the case that makes the
   * claiming rule necessary, and it is the case this book does not contain
   * (measured: zero of 175 distinct equity names). Counted per category without
   * it, such a name's gain would be added under both and the categories would
   * sum above their own Total row. `shared` is how many names it fired on, so
   * the cell can SAY the figure was attributed rather than divided — there is no
   * per-category split to divide it by, and inventing one would be the
   * fabrication this book exists to prevent.
   */
  const realisedByBucket = useMemo(() => {
    const claimed = new Map<string, string>();      // securityKey -> bucket
    const shared = new Map<string, number>();       // bucket -> names it also appears under
    const keysOf = new Map<string, string[]>();     // bucket -> the keys it claimed
    // Reading order, so the claim is deterministic rather than dependent on the
    // sort the reader happens to have applied.
    for (const grp of bucketGroups) {
      const mine: string[] = [];
      // DISTINCT NAMES on both counts. A key reached twice inside one category —
      // two rows of one mandate's constituents, or a name in two mandates — is
      // one name, and counting occurrences would report a category as sharing
      // more names than it holds.
      const elsewhere = new Set<string>();
      for (const r of grp.rows) for (const k of r.realizedKeys) {
        const owner = claimed.get(k);
        if (owner === undefined) { claimed.set(k, grp.key); mine.push(k); }
        else if (owner !== grp.key) elsewhere.add(k);
      }
      keysOf.set(grp.key, mine);
      if (elsewhere.size) shared.set(grp.key, elsewhere.size);
    }
    return { keysOf, shared };
  }, [bucketGroups]);
  /**
   * One category's realised total, on exactly the footer's basis: `sumOrNull`
   * over the keys it claimed, so a name that was never sold contributes nothing
   * rather than a zero that would report a sale nobody made.
   */
  const realisedFor = (key: string) => {
    if (!realized) return null;
    const keys = realisedByBucket.keysOf.get(key) ?? [];
    return { total: sumOrNull(keys.map((k) => realized.get(k) ?? null)), anySold: keys.some((k) => realized.has(k)) };
  };
  // Day move across the live-priced rows only — a holding on a workbook mark has
  // no "today" to report, so folding it in at zero would understate the move.
  //
  // The denominator is each row's `liveMV`, not its market value. They are the
  // same figure for a security and they are NOT for a mandate, whose cash sleeve
  // and unquoted names sit inside the row: dividing the mandate's move by its
  // whole value would dilute the book's day figure by everything the feed never
  // priced. Summed this way the ten mandate rows contribute exactly what their
  // 263 constituent shares contributed before the roll-up.
  const feedLive = rows.some((r) => r.live);
  const liveRows = rows.filter((r) => r.live && r.dayChangePct != null);
  const totDay = sum(liveRows.map((r) => r.dayChange));
  const liveMV = sum(liveRows.map((r) => r.liveMV));
  const totDayPct = liveRows.length && liveMV - totDay !== 0 ? (totDay / (liveMV - totDay)) * 100 : null;
  const toggleRow = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  // The expanded drill-down rows are per-view: a key expanded under the
  // by-security build has no counterpart under the by-entity one, so a change
  // of basis clears them rather than leaving a stale row open.
  useEffect(() => { setExpanded(new Set()); }, [holdingsView]);
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  // Export the whole tab (all holdings + the full transaction tape, unfiltered) to a
  // styled workbook. exceljs is code-split so it only loads on demand.
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const [{ exportPortfolioExcel }, data] = await Promise.all([
        import("@/lib/exportPortfolioExcel"),
        loadTransactions(),
      ]);
      await exportPortfolioExcel(positions, portfolio.accounts, data?.txns ?? []);
    } catch (e) {
      console.error("Excel export failed", e);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="flex h-full flex-col">
      {/* THE VIEW SWITCH RIDES WITH THE TITLE. It says what the reader is
          looking at rather than acting on it, so it belongs beside the headline
          — and moving it here retires the toolbar row it used to sit alone on,
          which is a row of table given back on the page whose tables are the
          whole point.

          THE HEADER'S FAR-RIGHT SLOT IS THE ONE ACTION, at the family's request:
          the basis pill, the "N accounts behind" staleness pill and the "N rows"
          count were all removed from here and Export Excel put in their place, so
          the top-right of the page is a button rather than three chips. The basis
          and as-of are still stated on Morning CIO, the landing page, which keeps
          its `<BasisPill>`. */}
      <PageHeader eyebrow="Daily" title="Portfolio Monitor"
        beside={
          <div className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
            {(["holdings", "transactions"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setView(m)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${view === m ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
                {m === "holdings" ? <Layers className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
                {m === "holdings" ? "Holdings" : "Transactions"}
              </button>
            ))}
          </div>
        }
        right={
          <button onClick={handleExport} disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-champagne-500/40 bg-champagne-500/10 px-3 py-2 text-sm font-medium text-champagne-400 transition-colors hover:bg-champagne-500/20 disabled:opacity-60"
            title="Download the full Portfolio Monitor — holdings and the transaction tape — as a styled Excel workbook">
            <FileSpreadsheet className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
          </button>
        } />

      {/*
        ONE CHROME ROW, JUST FILTERS. The filters, the view toggle and the two
        export buttons each had a line of their own, so ~130px of the first
        screen was spent on controls before a single holding was drawn — on a
        table whose whole job is to list holdings. The view switch moved up beside
        the TITLE (it names what you are looking at rather than acting on it), the
        one remaining action — Export Excel — moved to the header's far-right slot,
        and what is left here is filters only, at `text-xs`. That is what "use the
        empty space more efficiently" actually costs: nothing but the chrome's own
        generosity.
      */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {/* A SEARCH THAT FINDS NOTHING SAYS WHY, WHERE THE BOOK KNOWS. The family
            searched this control for BSE and were shown "No holdings match" — and
            BSE Ltd. IS theirs: 40,000 shares on their own consolidated review,
            reported by no statement in `source/`, so the book is right to carry
            nothing and the screen was wrong to say nothing. `AbsentFromBook`
            renders only where a review line answers the search, and never a
            figure: the review is a cross-check, not a source. */}
        <MultiSelectFilter options={securityNames} selected={selected} onChange={setSelected} dense
          allLabel="All holdings" unit="holdings" placeholder="Search holdings…" className="w-56 max-w-full"
          emptyNote={(q) => <AbsentFromBook query={q} className="mt-2" />} />
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus">
          {entities.map((s) => <option key={s} value={s}>{s === "All" ? "All entities" : s}</option>)}
        </select>
        {/* Categories, not asset classes: "PMS mandates" is a bucket rather than
            a class (§5 — a mandate is a relationship), and it is the choice a
            reader of this table is actually making. */}
        {/*
          THE THREE SLICES. "Default view will remain the current one, category
          wise" — so Category is first, and `useViewParam` makes the first view
          the param-free default, which is the same mechanism every other view
          on this page uses rather than a second convention.

          It sits on the FILTER row and not beside the title: the Holdings /
          Transactions switch up there names WHAT you are looking at, and this
          changes how the same thing is arranged, which is what the rest of this
          row does. `setGroupAxis` (not the raw param setter) clears the section
          filter — see its note.
        */}
        {/*
          ── ONE AXIS CONTROL, ON BOTH VIEWS ───────────────────────────────

            *"the format of the transactions page and the holdings page is very
             different… different categorization names and methods… replace it
             with what is in the holdings — Category / Asset class / Basket.
             Don't put security categorization filter in transactions."*

          This used to render on Holdings alone, and the Transactions card
          carried five tabs of its own in a vocabulary no other screen used. It
          is the same control on both now, reading the same `?group=` param, so
          a reader who has sliced the holdings by basket crosses to the
          transactions already sliced the same way.

          TRANSACTIONS OFFERS THREE, AND THE OMISSION IS ENFORCED BY THE TYPE
          rather than by this list: everything in `txnAxis.ts` takes a
          `GroupAxis`, so a transactions table sectioned by SECURITY would not
          compile. The security axis files every holding in ONE section by
          design (`SECURITY_SECTION`), so it is not an allocation axis at all.
        */}
        <div className="inline-flex w-fit items-center gap-0.5 rounded-md border border-ink-700 bg-ink-800/60 p-0.5" role="tablist"
          aria-label={view === "holdings" ? "Group holdings by" : "Group transactions by"}
          data-axis-control={view} data-axis-active={activeAxis}>
          {/* THE ACTIVE BUTTON IS THE AXIS THE TABLE IS REALLY ON, not the raw
              param. A reader who left Holdings on `?group=security` and crossed
              to Transactions lands on CATEGORY, and comparing against the param
              lit nothing at all — a control with no selected option, over a
              table that plainly has sections. */}
          {(view === "holdings" ? MONITOR_GROUP_VIEWS : GROUP_VIEWS).map((g) => (
            <button key={g.key} type="button" role="tab" aria-selected={activeAxis === g.key} title={g.title}
              data-group-axis={g.key}
              onClick={() => setGroupAxis(g.key)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${activeAxis === g.key ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
              {g.label}
            </button>
          ))}
        </div>
        {/*
          THE RETURN-MEASURE PICKER, in place of the Absolute/CAGR toggle. The
          guard still lives in `holdingReturn` and not here: `auto` and CAGR
          delegate to it, so no measure can turn a four-month gain into an annual
          rate, and a measure this book cannot strike renders a dash with its
          reason. The single Return column shows whichever measures are ticked,
          each labelled — which is the "state which return it is" the family asked
          for, and the "always have a CAGR column" ask (pin it beside Absolute).
        */}
        {view === "holdings" && (
          <ReturnMeasureSelect measures={returnMeasures} onChange={setReturnMeasures} />
        )}
      </div>

      {/*
        ── THE SECTIONS ARE TABS, ON A ROW OF THEIR OWN ───────────────────────

          *"this dropdown needs to be as subcategories in portfolio monitor and
           you can just give tabs to me to click and quickly reach instead of a
           dropdown keep things clean"*

        An "All categories" select made a reader open a list to find out what
        the table could be narrowed to. Every section of the active axis is one
        click now — Direct Equity, PMS mandates, ETF, Mutual Fund, AIF and Cash
        on Category; the family's own asset classes or baskets on the other two.

        NOTHING ABOUT WHAT A SECTION IS HAS CHANGED. These are the `buckets` the
        select offered, in the same order, setting the same `bucket` state —
        built from the BOOK through `groupKeyFor` on BOTH views, so the Holdings
        table and the Transactions table narrow on one definition, and a switch
        of axis or view still clears it (`setGroupAxis`, `setView`). A section
        with no dated record says so in the table rather than going missing here.

        A ROW OF ITS OWN because the row above already carries four controls:
        seven tabs beside them wrap it on Category and more than that on Basket,
        and a control that jumps lines every time the axis changes is the clutter
        this replaces. It is the SECOND level of the axis picked above, which is
        what "subcategories" asks for, and it is drawn lighter than that picker
        for the same reason.

        HIDDEN ON THE SECURITY AXIS, as the select was: that axis files every
        holding in one section by design, so a tab row would offer one tab that
        changes nothing. On Transactions the axis is never `security` (`txnAxis`
        resolves it), so the row is always there. `data-section-filter` names the
        active section, so the sweep reads what the control is set to without
        clicking it.
      */}
      {!(view === "holdings" && bySecurity) && (
        <div className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 border-b border-ink-700" role="tablist"
          aria-label={`Show one ${GROUP_NOUN[activeAxis].one}`}
          data-section-filter={bucket} data-section-axis={activeAxis}>
          {buckets.map((s) => {
            const on = bucket === s;
            return (
              <button key={s} type="button" role="tab" aria-selected={on} data-section-tab={s}
                title={s === "All" ? ALL_LABEL[activeAxis] : undefined}
                onClick={() => setBucket(s)}
                className={`-mb-px border-b-2 px-2.5 py-1 text-xs transition-colors ring-focus ${on
                  ? "border-champagne-500 font-medium text-champagne-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"}`}>
                {s === "All" ? "All" : groupLabelFor(activeAxis)(s)}
              </button>
            );
          })}
        </div>
      )}

      {view === "holdings" ? (
        <Card pad={false} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10 bg-ink-800">
                <Tr view={holdView} className="border-b border-ink-700">
                  <SortHeader col="security" view={holdView} align="left" pad="px-2 py-1.5">Security</SortHeader>
                  <SortHeader col="qty" view={holdView} pad="px-2 py-1.5">Qty</SortHeader>
                  <SortHeader col="avgCost" view={holdView} pad="px-2 py-1.5">Avg cost</SortHeader>
                  <SortHeader col="invested" view={holdView} pad="px-2 py-1.5">Invested</SortHeader>
                  {/*
                    BESIDE THE AMOUNT, WHICH IS WHERE IT WAS ASKED FOR.
                    *"here, you've given me the amount, but you've not given
                    me the date."* Every other column here reads money first
                    and descriptors last (Stage 10n); this is neither — it is
                    the second half of the cell to its left, and a date filed
                    away at the end of the row is a date nobody pairs with the
                    figure it belongs to.
                  */}
                  <SortHeader col="investedOn" view={holdView} align="left" pad="px-2 py-1.5"
                    title="When this holding's own money went in, from a lot register's acquisition date or the fund's own dated allotments against this very folio. It is the HOLDING's date, never its account's: when the family funded a mandate is a fact about the account and is on that mandate's own page. A row that rolls up several holdings shows a date only where every one of them carries one.">Invested on</SortHeader>
                  <SortHeader col="cmp" view={holdView} pad="px-2 py-1.5">CMP</SortHeader>
                  <SortHeader col="day" view={holdView} pad="px-2 py-1.5">Day</SortHeader>
                  <SortHeader col="mv" view={holdView} pad="px-2 py-1.5">{bySecurity ? "Direct + PMS" : "Market value"}</SortHeader>
                  {/*
                    TWO COLUMNS THAT EXIST ONLY ON THE STOCK AXIS, because only
                    there is a row a COMPANY rather than a holding. `Via funds`
                    is derived — the AMC disclosed what the fund holds and this
                    is the family's units' share of it — and `Total exposure` is
                    the two added, which is the figure the family asked to rank
                    on. The header beside them changes with the axis for the same
                    reason: on this axis "Market value" would be the measured
                    half under a name that reads like the whole.
                  */}
                  {/* THE DERIVED FENCE IS ON THE COLUMNS, VISIBLE, AND NOT IN A
                      HOVER. It used to live in the paragraph under the table,
                      which the family asked to have removed; a derived figure
                      standing beside a measured one is exactly where this book
                      has been bitten, so it moved onto the two headers it is
                      about rather than into the fold with the rest. `Via funds`
                      is wholly derived; `Total exposure` is the measured half
                      plus it, so it is marked as INCLUDING derived rather than
                      as being it. */}
                  {bySecurity && <SortHeader col="viaFunds" view={holdView} pad="px-2 py-1.5" note="derived" noteTitle={DERIVED_NOTE}>Via funds</SortHeader>}
                  {bySecurity && <SortHeader col="totalExposure" view={holdView} pad="px-2 py-1.5" note="incl. derived" noteTitle={DERIVED_NOTE}>Total exposure</SortHeader>}
                  <SortHeader col="weight" view={holdView} pad="px-2 py-1.5">Weight</SortHeader>
                  <SortHeader col="pnl" view={holdView} pad="px-2 py-1.5">Unreal. P&L</SortHeader>
                  <SortHeader col="realised" view={holdView} pad="px-2 py-1.5">Realised P&L</SortHeader>
                  {/*
                    ── ONE COLUMN PER PICKED RETURN, HEADED WITH ITS OWN NAME ─────
                
                      *"a new column with that return name should be made, and
                       also removed when we select or deselect returns."*

                    It was ONE column carrying every ticked measure side by side
                    inside each cell — five tags and five figures in one cell on
                    the five-measure view, which is what the family were pointing
                    at. The picker is the column list now.

                    THE LABEL GOES WHERE THE FACT IS CONSTANT. On `auto` the
                    measure resolves PER ROW (HPR here, CAGR there), so the header
                    can only say "Return" and the tag has to stay on every cell.
                    On a concrete measure it is constant down the column, so the
                    HEADER names it and the cells drop the tag — one rule, not two
                    behaviours.

                    AND THE COVERAGE COUNT IS ON THE COLUMN IT DESCRIBES. Each
                    measure used to explain itself in a paragraph under the table;
                    the family asked for those removed, and a count of how much of
                    the table a measure can answer is not chrome — a column of
                    XIRR dashes with nothing saying why reads as a broken feed. So
                    it rides in the header's own note, with the reason in its
                    hover, which is where this book puts a claim about a column.
                  */}
                  {/* ONE HEADING PER PICKED MEASURE, each a `SortHeader` like
                      every other column — so a return column sorts, drags and
                      carries its note exactly as its neighbours do, and the
                      local `Th` this used to need is gone rather than left as a
                      second kind of header on one table.

                      THE NOTE IS THE COUNT THE REMOVED CAPTIONS CARRIED, and
                      its hover is the reason they carried beside it — both from
                      ONE coverage object, so the short figure and the sentence
                      behind it cannot describe different sets.

                      `auto` gets neither: its measure resolves PER ROW, so there
                      is no column-wide count to state and the header can only
                      say "Return". */}
                  {returnMeasures.map((measure) => {
                    const def = returnMeasureDef(measure);
                    const auto = measure === "auto";
                    const meta = auto ? null
                      : returnColumnMeta(measure, returnCoverage(rows, measure, portfolio.asOf), portfolio.asOf);
                    return (
                      <SortHeader key={measure} col={`ret:${measure}`} view={holdView} pad="px-2 py-1.5"
                        title={auto ? undefined : def.hint}
                        note={meta?.note} noteTitle={meta?.title}>
                        {auto ? "Return" : def.tag}
                      </SortHeader>
                    );
                  })}
                  {/* SECTOR AND ENTITY CLOSE THE TABLE — the family asked for
                      the money to read first, and these two are the only
                      columns on the row that are not money. They describe the
                      holding rather than measure it, so they sat between the
                      name and the first figure and pushed Qty, cost and value
                      off the first screen. Nothing about what they RENDER
                      changes; only where they are read. */}
                  <SortHeader col="sector" view={holdView} align="left" pad="px-2 py-1.5">Sector</SortHeader>
                  <SortHeader col="entity" view={holdView} align="left" pad="px-2 py-1.5">{consolidate ? "Entities" : "Entity"}</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {bucketGroups.map((grp) => (
                  <Fragment key={grp.key}>
                    {showBucketSections && (
                      /*
                        `data-section` IS THE CONTRACT, NOT THE HEADING TEXT.
                        `check:pages` finds where one section ends by finding
                        where the next begins, and it used to do that against a
                        hardcoded list of heading NAMES — where a missing entry
                        is the dangerous direction, because an unrecognised
                        heading is not a boundary and the section above silently
                        swallows every row below it. Three axes multiply the
                        headings that list would have to track. So the boundary
                        is structural now, exactly as `data-mandate` and
                        `data-row` already are: a claim about structure must not
                        depend on prose a redesign is free to reword.
                      */
                      <tr className="bg-ink-900/50" data-section={grp.key} data-axis={groupAxis}
                        data-subtotal={grp.subtotal} data-holdings={grp.holdings} data-rule-mv={grp.ruleMV}>
                        <td colSpan={COL_COUNT} className="px-2 py-1.5">
                          <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-champagne-500">
                            {groupLabelFor(groupAxis)(grp.key)}
                            {/* The count is of HOLDINGS, not of rows: ten mandate
                                rows stand for 281 of them, and a heading reading
                                "10 holdings" over ₹138.7 Cr would retire 271
                                positions from the page without saying so. */}
                            <span className="font-normal normal-case tracking-normal text-slate-500">
                              {grp.key === MANDATE_BUCKET ? `· ${grp.rows.length} ${grp.rows.length === 1 ? "mandate" : "mandates"} ` : ""}· {grp.holdings} {grp.holdings === 1 ? "holding" : "holdings"} · {fmtFromBase(grp.subtotal, { compact: true })}
                            </span>
                            {/* A MEASURED ZERO KEEPS ITS ZERO, and says why it is
                                one. The section is not empty — every row in it is
                                reported at nil, which is a different fact from
                                "no statement carries this" and must not be shown
                                as an em dash. */}
                            {grp.subtotal === 0 && grp.rows.length > 0 && (
                              <span className="font-normal normal-case tracking-normal text-slate-500"
                                title="Not an absent figure: every statement in this section reports a nil balance, so the subtotal is a measurement.">
                                · a measured nil — every row here is reported at zero
                              </span>
                            )}
                            {/*
                              WHY A LIQUID FUND IS SITTING IN CASH, said where
                              the question is asked. A reader scanning the Cash
                              section finds an ETF and a mutual-fund scheme in
                              it; without this, the only available reading is
                              that the app has misfiled them. It names the
                              family's own instruction and the document that
                              corroborates it, and it counts the rows rather
                              than asserting coverage — a section with no
                              re-bucketed row says nothing at all.
                            */}
                            {grp.key === "Cash" && grp.rows.some((r) => isCashEquivalent(r)) && (
                              <span className="font-normal normal-case tracking-normal text-slate-500"
                                title={`Cash is liquid and arbitrage — the family's own instruction, corroborated by the Cash sheet of their consolidated review (30 June 2026), which lists each of these by name. The issuing documents type them Mutual Fund or ETF, and that is what the archive still records: this is the CATEGORY axis answering "how much of this book is cash", not a change to what any statement said. A liquid sleeve held inside a PMS mandate stays with the mandate, whose row has to tie to its own statement.`}>
                                · includes {grp.rows.filter((r) => isCashEquivalent(r)).length} liquid {grp.rows.filter((r) => isCashEquivalent(r)).length === 1 ? "holding" : "holdings"} the statements type as a fund
                              </span>
                            )}
                            {grp.collapsed > 0 && (
                              <span className="font-normal normal-case tracking-normal text-slate-500"
                                title="The same holding is reported on two members' statements. Both rows are shown as printed; the subtotal counts it once, exactly as the footer does.">
                                · {fmtFromBase(grp.collapsed, { compact: true })} reported twice, counted once
                              </span>
                            )}
                            {/*
                              AN UNCLASSIFIED SECTION NAMES ITS CAUSE, and it is
                              the one heading on this page that is not a fact
                              about the holdings under it. "Other" would read as
                              a category the family chose; this says the review
                              does not list them and what would fill it — the
                              rule every absent figure on this site follows,
                              applied to a section heading.
                            */}
                            {grp.key === UNCLASSIFIED && (
                              <span className="font-normal normal-case tracking-normal text-amber-400/80" title={UNCLASSIFIED_WHY}>
                                · the family's review does not list {grp.rows.length === 1 ? "this holding" : "these holdings"}, so no {groupAxis === "basket" ? "basket" : "asset class"} is stated
                              </span>
                            )}
                            {/*
                              AND A SECTION FILLED BY THE FAMILY'S RULE SAYS SO.
                              "All the direct stocks" is the family instructing,
                              and the review naming a fund product by product is
                              the family stating — on screen both are just rows
                              under a heading, so the difference is printed
                              rather than collapsed. Silent only when the whole
                              section is review-stated, which is the common case.
                            */}
                            {grp.ruleMV > 0 && (
                              <span className="font-normal normal-case tracking-normal text-slate-500"
                                title={`The family's review names most of this section product by product. ${fmtFromBase(grp.ruleMV, { compact: true })} of it is placed here by their stated rule instead — "all the direct stocks" belong to Thematic & Tactical — because the review does not name those holdings individually.`}>
                                · {fmtFromBase(grp.ruleMV, { compact: true })} by the family's stated rule, not named individually
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    )}
                    {sortRows(grp.rows, holdView.sort, holdAccessors).map((r) => {
                  const isOpen = expanded.has(r.key);
                  const multi = r.entities.length > 1;
                  /**
                   * WHEN THIS HOLDING WAS BOUGHT, CONTRIBUTION BY CONTRIBUTION.
                   *
                   * Null on all but a handful of rows, and that is the honest
                   * state rather than a gap: it needs the fund to allot UNITS per
                   * contribution AND those units to account for every unit held.
                   * `trancheTable` is handed the row's OWN deduped positions, so
                   * a holding two members report cannot be counted twice here
                   * while the row above counts it once.
                   *
                   * "cagr" is the family's own rule, not a preference: a year or
                   * more annualises, anything shorter stands as the absolute
                   * figure and says so. It deliberately does NOT follow the
                   * page's measure picker — a tranche is the one thing in this
                   * book with a real purchase date, and the picker's other
                   * measures (XIRR, YTD, calendar) are absent on every row here.
                   */
                  /**
                   * ONE SECTION PER UNIT CLASS, AND THAT IS NOT A LAYOUT CHOICE.
                   *
                   * A tranche is valued as ITS OWN units at TODAY'S NAV, so a
                   * panel's whole claim — cheaper entry, higher return, always —
                   * holds only where every row shares one NAV. Clubbing Sanshi's
                   * Class E and Class A2 into one row put two NAVs under one
                   * footer: each row stayed arithmetically right, the combined
                   * UNITS became a number with no unit, and the comparison a
                   * reader opens the panel to make stopped being valid. The
                   * per-unit cells on the row above go absent for exactly this
                   * reason; a tranche panel is a per-unit measurement, so it gets
                   * the same treatment one level down. Found by `check:pages`
                   * rather than by reading — see the note in `trancheGroupsOf`.
                   */
                  const trancheGroups = trancheGroupsOf(r, portfolio.asOf);
                  const trancheCount = trancheGroups.reduce((a, g) => a + g.table.rows.length, 0);
                  const trancheOpen = openTranches.has(r.key);
                  /**
                   * A MANDATE ROW IS AN ACCOUNT, AND HALF THESE COLUMNS ARE
                   * QUESTIONS AN ACCOUNT CANNOT ANSWER. Quantity, average cost,
                   * price and sector belong to a security; a mandate holds many
                   * of each and prints none of them. Every one renders through
                   * `AbsentCell` with the reason rather than a 0 or a blend.
                   */
                  const m = r.mandate;
                  /**
                   * IS THIS ROW THE WHOLE MANDATE, OR WHAT THE FILTERS LEFT OF IT?
                   *
                   * A mandate row's figures are summed over the constituents that
                   * survived the company / sector / entity filters, and under a
                   * filter that is a PART of the account. Every caption that says
                   * "the mandate" — the Invested and Market value traces, the
                   * expansion's own sentence — has to branch on this, or it makes
                   * a claim about a named manager's account that the cell beside
                   * it does not carry. The row's sub-line already branches; these
                   * used to contradict it one line down.
                   */
                  const whole = !m || m.holdings.length === m.accountCount;
                  /**
                   * AND IS ITS MARKET VALUE ONE BASIS OR TWO?
                   *
                   * `r.live` on a mandate row is true when ANY constituent has a
                   * quote — and every mandate in this book holds a cash sleeve
                   * that can never be quoted, so in production a mandate row is
                   * routinely PART live. Treating it as wholly live strips the
                   * statement trace off a figure most of which is still on the
                   * statement mark; treating it as wholly statement-based would
                   * offer a trace to a document that prints a different number.
                   * So the flag stays mixed and the cells SAY SO, using `liveMV`
                   * — the value the feed actually repriced.
                   */
                  const partLive = !!m && r.live && r.marketValue - r.liveMV > 1;
                  // Only where it is actually true: a mandate every constituent
                  // of which is quoted is wholly live and says the ordinary thing.
                  const mixedBasisNote = partLive
                    ? `Part live: ${money(r.liveMV)} of this mandate's ${money(r.marketValue)} is repriced from live quotes and the rest keeps its statement mark — a mandate's cash sleeve can never be quoted, and neither can a share whose NSE symbol does not resolve. Every figure on this row that market value feeds — value, weight, unrealised P&L and return — therefore blends the two bases, and has no single statement cell to trace to.`
                    : LIVE_CELL;
                  return (
                    <Fragment key={r.key}>
                      {/* THE SECURITY AXIS'S OWN HANDLES. A structural claim must
                          not depend on prose — and on this axis it cannot depend on
                          ROW TEXT either: the "N entities" pill is an `inline-flex`,
                          so its chevron is a flex ITEM and `innerText` breaks the
                          line inside that cell. 130 of this axis's 214 rows carry
                          that pill, so a row-based text check here would be reading
                          fragments. These attributes — and `nameCell`, whose
                          whitespace the sweep collapses — are what the invariants
                          read instead.

                          AND THE KEY RIDES ON EVERY ROW THAT HAS ONE, on every
                          axis. Gated on `venues` it was absent from the 395
                          stock-axis rows no statement reports; gated on
                          `bySecurity` it was right only while that axis was the
                          sole one drawing venue panels, and the moment every axis
                          drew them the category axis's clubbed rows carried a
                          venue count and NO KEY TO FIND THEM BY — six of that
                          route's checks then ABSTAINED rather than failed,
                          because the walk could not pick a row to open. Gated on
                          the key itself it cannot go stale again; a mandate row
                          carries none, which is why the guard is not dropped. */}
                      <Tr view={holdView} className="hover:bg-ink-700/40"
                        data-bucket={r.bucket}
                        {...(r.securityKey ? { "data-security-key": r.securityKey } : {})}
                        {...(r.venues ? { "data-venues": String(r.venues.length) } : {})}
                        {...(m ? {
                          "data-mandate": m.name,
                          "data-manager": m.manager,
                          "data-account": m.accountNo,
                          "data-holdings": String(m.holdings.length),
                          "data-account-holdings": String(m.accountCount),
                        } : {})}>
                        {/* NO "cost n/a" BADGE BESIDE THE NAME. The row already
                            says it four times over — Avg cost, Invested,
                            Unrealised P&L and Return each render an em dash off
                            this same `costNA` flag — so the chip was a fifth
                            statement of one fact, sitting in the one column a
                            reader scans for the security's NAME. The flag stays
                            and every dash it drives stays; only the badge is gone. */}
                        {/*
                          ONE LINE: the mandate's name and what it is. The manager,
                          the account number and the constituent count used to ride
                          underneath in small text, and they belong on the mandate's
                          own page — which already prints all three — rather than
                          under every row of a table a reader is scanning for value.
                          They stay reachable: the link's `title` carries them on
                          hover, and the row's `data-*` attributes carry them for the
                          checks, which must not depend on prose a redesign deletes.

                          THE ONE THING THAT IS NOT A DETAIL STAYS, and only when it
                          is true: under a filter this row's figures cover PART of
                          the mandate, and a reader who is not told that will read a
                          subset as the account. It renders nothing in the unfiltered
                          view, which is the clean row that was asked for.
                        */}
                        <td className="min-w-[15rem] px-2 py-1.5">
                          {m ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button type="button" onClick={() => toggleRow(r.key)} aria-expanded={isOpen}
                                  title={isOpen ? "Hide the shares inside this mandate" : "List the shares inside this mandate"}
                                  className="-ml-0.5 rounded text-slate-400 transition-colors hover:text-champagne-400 ring-focus">
                                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                </button>
                                <Link to={`/mandate/${encodeURIComponent(m.accountId)}`}
                                  title={`${m.manager} — account ${m.accountNo}, ${m.accountCount} holdings. Open the mandate drill-down.`}
                                  className="font-medium text-slate-100 underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
                                  {r.security}
                                </Link>
                                <Pill tone="core">PMS mandate</Pill>
                              </div>
                              {m.holdings.length < m.accountCount && (
                                <span className="pl-5 text-[11px] text-amber-400/80">
                                  {m.holdings.length} of {m.accountCount} holdings match the filters — the mandate itself holds {fmtFromBase(m.accountMV, { compact: true })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="font-medium text-slate-100">
                              {r.venues && (
                                <button type="button" onClick={() => toggleRow(r.key)} aria-expanded={isOpen}
                                  title={r.fundClasses.length
                                    ? (isOpen ? "Hide this fund's unit classes" : `One fund, ${r.fundClasses.length} unit classes (${r.fundClasses.join(", ")}) — show each`)
                                    : r.venues.length === 0
                                    // A DERIVED-ONLY ROW HAS NO ACCOUNT TO NAME, so a
                                    // title counting accounts would read "held through 0",
                                    // which is a measurement of nothing rather than the
                                    // honest statement that this is a fund look-through.
                                    ? (isOpen ? "Hide what your funds hold of this issuer" : "No statement in this book reports it — show what your funds hold of it")
                                    : (isOpen ? "Hide how this name is held" : `Held through ${r.venues.length} account${r.venues.length === 1 ? "" : "s"} — show which, and what your funds hold of it`)}
                                  className="-ml-0.5 mr-1 rounded align-middle text-slate-400 transition-colors hover:text-champagne-400 ring-focus">
                                  <ChevronRight className={`inline h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                </button>
                              )}
                              {/*
                                A CLUBBED FUND ROW IS NOT A LINK, AND THAT IS THE
                                POINT. `/stock/:securityKey` serves ONE class, so
                                a row reading "3P India Equity Fund 1" that opened
                                Class B3's page would name one thing and show
                                another. The classes are each linked inside the
                                expansion, where each is itself again.
                              */}
                              {r.fundClasses.length
                                ? <span data-fund-classes={r.fundClasses.join(",")}>{r.security}</span>
                                : <StockLink securityKey={r.securityKey} name={r.security} />}
                              {/* THE SPACE IS LOAD-BEARING, not cosmetic. These pills are
                                  INLINE — a flex wrapper would put a newline inside the
                                  cell and shatter every row-based check that splits the
                                  page on newlines (Stage 10af) — and an inline element
                                  contributes no whitespace to `innerText`, so without it
                                  the row reads "Fund 13 unit classesredeemed". */}
                              {r.fundClasses.length > 0 && (
                                <>{" "}<span className="ml-1 align-middle"><Pill>{r.fundClasses.length} unit classes</Pill></span></>
                              )}
                              {/*
                                THE `redeemed` PILL WAS HERE AND IS GONE, BECAUSE
                                THE ROW IT EXPLAINED IS GONE.

                                It was the right answer to the previous round —
                                *"the 3P funds … are lacking invested and current
                                market value figures"* — where the fix was to say
                                ON THE ROW that the ₹0 is a MEASUREMENT. The
                                family's next answer supersedes it: *"in the
                                holdings page we only need to show the current
                                holdings"*, so a closed position is not listed
                                here at all and there is no row left to pill.
                                Left as code it could never fire — the row build
                                filters those positions out before anything sees
                                them — which is the dead-code-that-looks-alive
                                failure this book keeps naming. The measured zero
                                is still stated under the table by `closedNote`,
                                and a closed row still RENDERS on `/holdings`,
                                where it carries the explanation instead.
                              */}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap">
                          {r.quantity === null
                            ? <AbsentCell reason={r.fundClasses.length
                                ? `this row is one fund under ${r.fundClasses.length} unit classes (${r.fundClasses.join(", ")}), and their units are not the same unit: each class is allotted at its own NAV. Adding them would give a quantity no NAV prices. Open the row for each class's own units.`
                                : "a mandate is an account, not a security: the shares inside it carry the quantities and it carries none. A 0 here would say the manager holds nothing."} />
                            : fmtNum(r.quantity)}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap">
                          {m ? <AbsentCell reason="an average cost per unit needs one security; this row rolls up the mandate's holdings, each with a cost of its own" />
                            : r.fundClasses.length
                            ? <AbsentCell reason={`an average cost per unit needs one unit, and this row clubs ${r.fundClasses.length} unit classes allotted at NAVs of their own. The money below it is additive across classes; a per-unit figure is not.`} />
                            : r.costNA ? "—"
                            : r.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" />
                            : fmtFromBase(r.avgCost)}
                        </td>
                        {/* INVESTED IS THE FIGURE A CONTRIBUTION HISTORY BREAKS
                            APART, so the affordance lives on it rather than on
                            the row: what the reader wants apart is the money,
                            date by date. Drawn only where a breakdown exists —
                            a chevron that opens nothing is worse than none. */}
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap">
                          {r.costNA ? "—" : trancheCount > 0 ? (
                            <button type="button" onClick={() => toggleTranche(r.key)} aria-expanded={trancheOpen}
                              data-tranche-toggle={r.key} data-tranche-rows={trancheCount}
                              title={`Bought over ${trancheCount} dated contribution${trancheCount === 1 ? "" : "s"} — open for each one's own units, entry NAV and return.${trancheGroups.length > 1 ? ` Shown per unit class, because each class is marked at its own NAV.` : ""}`}
                              className="inline-flex items-center gap-1 rounded ring-focus transition-colors hover:text-champagne-400">
                              <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${trancheOpen ? "rotate-90" : ""}`} />
                              {fmtFromBase(r.costBasis, { compact: true })}
                            </button>
                          ) : fmtFromBase(r.costBasis, { compact: true })}
                        </td>
                        {/*
                          THE DATE, AND WHAT IT IS NOT. A row funded several times
                          shows the FIRST with the count beside it, never a single
                          date standing for all of them — the family's own reason
                          for asking is that when the money went in changes the
                          return, so collapsing four payments to one date would
                          answer the question wrongly in the direction they were
                          worried about.
                        */}
                        <td className="px-2 py-1.5 text-left mono text-slate-400 whitespace-nowrap" data-invested-on={r.investedOn?.first ?? ""}>
                          {r.investedOn === null
                            ? <AbsentCell reason={m
                              ? "a mandate is an account, not a holding: the family funded it on dates its statements do report, and those are on the mandate's own page beside its Invested figure"
                              : r.costNA
                                ? "no statement in this book reports what this holding cost, so there is no payment to date. A depository records what is held and never what was paid for it"
                                : "the statements report this holding's cost but not the date it was bought. A lot register or the fund's own dated allotments would carry it; this account issues neither"} />
                            : <span title={r.investedOn.payments > 1
                              ? `Funded over ${r.investedOn.payments} dated payments, ${fmtDate(r.investedOn.first)} to ${fmtDate(r.investedOn.last)}. Open the Invested cell for each payment's own units, entry NAV and return — they are not the same return, because each has been at work for a different length of time.`
                              : `One dated payment, ${fmtDate(r.investedOn.first)}.`}>
                              {fmtDate(r.investedOn.first)}
                              {r.investedOn.payments > 1 && (
                                <span className="ml-1 text-[10px] text-slate-500">+{r.investedOn.payments - 1}</span>
                              )}
                            </span>}
                        </td>
                        {/* A live price comes from the quote feed, not the workbook, so it
                            carries no audit link back to the ledger. Only a workbook mark
                            does — and it's flagged so it can't pass as current. */}
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap">
                          {m
                            ? <AbsentCell reason="a mandate has no price per unit — it is an account, not a security" />
                            : r.fundClasses.length
                            ? <AbsentCell reason={`each unit class of this fund is marked at its OWN NAV — ${r.fundClasses.join(", ")} — so there is no one price for the row. Open it for each class's own mark.`} />
                            : r.currentPrice === null
                            ? <AbsentCell reason="marked at a total value, not a per-unit price" />
                            : r.live
                            ? fmtFromBase(r.currentPrice)
                            : <>{fmtFromBase(r.currentPrice)}
                                <span className="ml-1 cursor-help text-[10px] text-amber-400/80"
                                  title={r.navPriced
                                    ? `AMFI's published NAV for this scheme, as of ${r.navDate}. A fund resolves no NSE trading symbol so it can never carry an intraday quote; this is the industry's own daily figure, refreshed every day, and it is NEWER than the statement mark it replaced.`
                                    : `No live price for this security — showing the mark from its statement as of ${portfolio.asOf}.`}>◦</span></>}
                        </td>
                        <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${r.live && r.dayChangePct != null ? changeColor(r.dayChangePct) : "text-slate-600"}`}
                          title={r.live && r.dayChangePct != null
                            ? `${fmtFromBase(r.dayChange, { compact: true, sign: true })} since previous close${m ? `, across the ${fmtFromBase(r.liveMV, { compact: true })} of this mandate the feed prices` : " on the position"}`
                            : undefined}>
                          {r.live && r.dayChangePct != null
                            ? `${r.dayChangePct >= 0 ? "+" : ""}${r.dayChangePct.toFixed(2)}%`
                            : <AbsentCell reason={m
                                ? "no live quote for any share inside this mandate, so there is no previous close to move from"
                                : r.currentPrice === null
                                ? "this holding is marked at a total value, not a per-unit price, so it has no day move"
                                : "no live quote for this security, so there is no previous close to move from"} />}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-slate-100 whitespace-nowrap">
                          {/* A COMPANY NO STATEMENT REPORTS HAS NO MEASURED
                              VALUE, and ₹0 would say the family owns none of it
                              directly as a MEASUREMENT. It is an absence. */}
                          {r.measuredNA
                            ? <AbsentCell reason="no statement in this book reports this company as a holding — the family owns it only through a fund, so there is nothing here to measure" />
                            : r.live
                            ? partLive
                              ? <>{fmtFromBase(r.marketValue, { compact: true })}
                                  <span className="ml-1 cursor-help text-[10px] text-amber-400/80" title={mixedBasisNote}>◦</span></>
                              : fmtFromBase(r.marketValue, { compact: true })
                            : fmtFromBase(r.marketValue, { compact: true })}
                        </td>
                        {bySecurity && (
                          <td className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap">
                            {exposure.status !== "ok"
                              ? <AbsentCell reason={exposure.status === "loading"
                                  ? "the fund look-through is still loading"
                                  : "the fund look-through store did not answer — a fact about the fetch, not about the holding"} />
                              : (r.viaFunds ?? 0) > 0
                              ? <span title="DERIVED: the AMC disclosed what the fund holds and this is your units' share of it. It is no part of the book's NAV — the fund's own value already stands for it there.">
                                  {fmtFromBase(r.viaFunds as number, { compact: true })}
                                </span>
                              : <AbsentCell reason="no fund this store can read discloses this company at a value; the AIF folios disclose nothing at all" />}
                          </td>
                        )}
                        {bySecurity && (
                          <td className="px-2 py-1.5 text-right mono text-slate-100 whitespace-nowrap font-medium">
                            {fmtFromBase(r.totalExposure ?? r.marketValue, { compact: true })}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap" title={r.live ? mixedBasisNote : undefined}>
                          {r.live && !bySecurity ? `${(r.weight * 100).toFixed(1)}%`
                                  : <Auditable formula={{
                                      title: "Weight",
                                      excel: bySecurity ? "= Total exposure ÷ Book NAV × 100" : "= Market value ÷ Total market value × 100",
                                      plain: bySecurity
                                        ? "How big this company is as a share of the WHOLE book — the family's own question, so the numerator is the total exposure (what the statements report plus what the funds derive) and the denominator is the book. The column therefore sums to the stock share of the book rather than to 100; the caption under the table says what the rest is."
                                        : weightPlain,
                                      worked: `= ${money(bySecurity ? (r.totalExposure ?? r.marketValue) : r.marketValue)} ÷ ${money(weightBase)} × 100 = ${(r.weight * 100).toFixed(1)}%`,
                                    }}>{(r.weight * 100).toFixed(1)}%</Auditable>}
                        </td>
                        <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${r.costNA ? "text-slate-500" : changeColor(r.unrealizedPnL)}`} title={r.live && !r.costNA ? mixedBasisNote : undefined}>
                          {r.costNA ? "—"
                            : r.live ? fmtFromBase(r.unrealizedPnL, { compact: true, sign: true })
                            : <Auditable formula={pnlFormula(r.marketValue, r.costBasis, r.unrealizedPnL, money)}>{fmtFromBase(r.unrealizedPnL, { compact: true, sign: true })}</Auditable>}
                        </td>
                        {/* Distinct states, never collapsed into one dash without
                            a reason: a mandate (whose names are reported per
                            security across the book, not per mandate), the
                            per-entity view, an unreachable archive, a name never
                            sold, and a name sold under no capital gain statement. */}
                        <td className="px-2 py-1.5 text-right mono whitespace-nowrap">{
                          m ? <AbsentCell reason="realised gain is reported per security across the whole book, and these managers hold the same names in more than one mandate — attributing a name's whole realised figure to this mandate would count it twice. Open the mandate's drill-down, or Capital Gains, for the per-account figures." />
                          : !consolidate ? <AbsentCell reason="realised gain is a per-security figure; switch to the consolidated view to see it" />
                          : realized === undefined ? <span className="text-slate-500">…</span>
                          : realized === null ? <AbsentCell reason="the audit archive didn't respond" />
                          : !realized.has(r.securityKey) ? <AbsentCell reason="no sale of this name on the transaction statements" />
                          : realized.get(r.securityKey) == null ? <AbsentCell reason="sold, but no capital gain statement covers that account" />
                          : <span className={changeColor(realized.get(r.securityKey)!)}>{fmtFromBase(realized.get(r.securityKey)!, { compact: true, sign: true })}</span>
                        }</td>
                        {/*
                          ── ONE CELL PER PICKED RETURN, IN ITS OWN COLUMN ────────

                            *"it should add a new return column rather than show
                             all returns in the same return column side by side."*

                          `measuredReturn` decides; these cells only draw. `auto`
                          resolves per row to the methodology's measure; the
                          concrete measures show that measure or a dash naming why
                          this book cannot strike it (XIRR per holding, YTD outside
                          a within-year purchase, calendar year). The guard is
                          inside `measuredReturn`, so no column can annualise a
                          sub-year window. The plain return on cost keeps its audit
                          popover on rows still on their workbook mark; the derived
                          figures carry a tooltip instead.

                          THE TAG RIDES ON THE CELL WHERE THE FIGURE IS NOT THE
                          MEASURE THE HEADER PROMISES, and nowhere else — one rule,
                          `res.tag !== def.tag`, which covers three cases without
                          naming any of them:

                            • `auto` tags EVERY row, because the methodology
                              resolves per row and the header can only say
                              "Return";
                            • the CAGR column tags the rows where the ANNUALISATION
                              GUARD FIRED — a sub-year holding shows its total
                              return on cost, and leaving that untagged under a
                              header reading CAGR would assert an annual rate for
                              a year the holding has not seen, which is the exact
                              figure the guard exists to refuse;
                            • every other column tags nothing, because the header
                              names it and the same word repeated seventy-two times
                              is noise.

                          A FIRST CUT KEYED THIS ON `measure === "auto"` and the
                          sweep caught it: on the CAGR column the measure is NOT
                          constant down the column, so the guarded rows went out
                          indistinguishable from the annualised one.

                          NO NEWLINE INSIDE A CELL, still. The sweep reads whole
                          rows by splitting the page text on newlines, so nothing
                          here is stacked in a flex column; with one measure per
                          cell there is nothing left to stack anyway.
                        */}
                        {returnMeasures.map((measure) => {
                          const res = measuredReturn(r, measure, portfolio.asOf);
                          // Tag "HPR" is always the raw return on cost (res.pct === returnPct),
                          // so its audit popover ties to the workbook; CAGR/other are derived.
                          const value = !res.shown
                            ? <AbsentCell reason={res.reason} />
                            : res.tag === "HPR" && !r.live
                              ? <Auditable formula={returnFormula(r.marketValue, r.costBasis, r.returnPct, money)}><span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true })}</span></Auditable>
                              : <span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true })}</span>;
                          /**
                           * TAG UNLESS THE HEADER ALREADY NAMES IT.
                           *
                           * `auto` always tags: its header can only say "Return"
                           * because the methodology resolves per row — and 42 of
                           * this book's 72 rows resolve to `AUTO` itself (no cost
                           * reported, so no return at all), which a rule written
                           * as `res.tag !== def.tag` leaves silently untagged.
                           * The sweep caught exactly that.
                           *
                           * A concrete column tags only the rows whose figure is
                           * NOT the measure it promises — which is the CAGR
                           * column's guarded sub-year rows, and leaving those
                           * untagged under a header reading CAGR would assert an
                           * annual rate for a year the holding has not seen.
                           */
                          const offMeasure = measure === "auto" || res.tag !== returnMeasureDef(measure).tag;
                          return (
                            <td key={measure} data-return-cell={measure} data-return-tag={offMeasure ? res.tag : undefined}
                              className="px-2 py-1.5 text-right mono whitespace-nowrap"
                              title={r.live && !r.costNA ? mixedBasisNote : undefined}>
                              {offMeasure && <span className="ret-tag mr-0.5">{res.tag}</span>}
                              {value}
                            </td>
                          );
                        })}
                        {/* A FUND HAS NO SECTOR, AND "Unclassified" IS THE WRONG
                            WAY TO SAY SO. It reads as a sector the pipeline
                            failed to map — the same cell a directly-held share
                            gets when its statement printed none — when the truth
                            is that the property does not apply: an AIF folio, a
                            mutual-fund scheme or a whole mandate is a wrapper
                            over many sectors. */}
                        <td className="px-2 py-1.5 text-slate-400">
                          {m
                            ? <AbsentCell reason="a mandate spans many sectors and is not one holding; expand it, or open its drill-down, for each share's own" />
                            : isFundVehicle(r)
                            ? <AbsentCell reason="a fund holds many sectors and its statement prints none; the look-through would need the scheme's own portfolio disclosure, which this book does not carry for this folio" />
                            : r.sector}
                        </td>
                        <td className="px-2 py-1.5 text-slate-400">
                          {multi ? (
                            <button type="button" onClick={() => toggleRow(r.key)} aria-expanded={isOpen}
                              title={`Held by: ${r.entities.join(", ")}`}
                              className="pill cursor-pointer whitespace-nowrap transition-colors hover:border-champagne-500/40 hover:text-champagne-400 ring-focus">
                              <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                              {r.entities.length}&nbsp;entities
                            </button>
                          ) : (
                            <span className="text-[12px]">{r.entities[0]}</span>
                          )}
                        </td>
                      </Tr>
                      {/* EACH INVESTMENT SEPARATELY, AND THE COMBINED BENEATH IT.
                          *"I invested additional 10 crores… previous amount…
                          what was the return? Now this 10 crores… what it has
                          done what's the overall portfolio return."* Both
                          questions, one table: a row per contribution and a
                          footer that ties to the cell it opened from. */}
                      {trancheOpen && trancheGroups.map((g, gi) => {
                        const tranches = g.table;
                        const trancheSpansEntities = g.spansEntities;
                        return (
                        <tr key={"tr-" + r.key + "|" + (g.cls ?? "")} className="bg-ink-900/60"
                          data-tranche-panel={r.key} data-tranche-class={g.cls ?? ""}>
                          <td colSpan={COL_COUNT} className="px-3 pb-3 pt-1">
                            {/* THE CLASS IS NAMED WHERE THERE IS MORE THAN ONE, because
                                a second table under one row with no heading reads as a
                                continuation of the first — and the two are marked at
                                different NAVs, which is the whole reason they are apart. */}
                            {g.cls && (
                              <p className="mb-1 text-[11px] font-medium text-slate-300">
                                Class {g.cls} <span className="font-normal text-slate-500">— marked at its own NAV, so its contributions are compared only with each other</span>
                              </p>
                            )}
                            <p className="mb-1.5 text-[11px] leading-relaxed text-slate-500">
                              {tranches.rows.length === 1
                                ? <>This holding was bought in ONE contribution, so its return and the row&rsquo;s are the same figure.</>
                                : <>The {tranches.rows.length} dated contributions behind this holding. Each carries its OWN units,
                                    so each is valued at today&rsquo;s NAV on the units IT bought — the earlier money bought cheaper
                                    units and is worth more per rupee, which is what a single blended return hides.</>}
                              {/* THE METHOD IS STATED ONCE. It is a fact about how every
                                  section is computed, not about this one, and repeating it
                                  under each class turns a sectioned panel into a wall. */}
                              {gi === 0 && <>
                                {" "}Entry NAV is derived as invested &divide; units allotted and reproduces the allotment NAV the
                                statement prints. A contribution held a year or more is annualised and tagged CAGR; anything
                                shorter shows the absolute return, because a rate for a year the money has not seen is a claim
                                about a year.
                              </>}
                            </p>
                            <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800">
                              <SortableTable className="min-w-full text-[12px]"
                                storageKey={trancheSpansEntities ? "monitor-tranche-entity" : "monitor-tranche"}
                                columns={trancheSpansEntities ? TRANCHE_ENTITY_COLS : TRANCHE_COLS}>
                                {(tv) => (<>
                                <thead>
                                  <Tr view={tv} className="border-b border-ink-700/70">
                                    <SortHeader col="date" view={tv} align="left" pad="px-3 py-1.5">Invested on</SortHeader>
                                    <SortHeader col="type" view={tv} align="left" pad="px-3 py-1.5"
                                    title="The statement's own word for the movement — Subscription, Drawdown, Top Up, Full Units Redemption. Printed as it arrived rather than mapped to a vocabulary of ours.">Type</SortHeader>
                                    {/* ONLY WHERE THE ROW SPANS MORE THAN ONE FOLIO, and
                                        then it is load-bearing rather than decoration: this
                                        book's Sanshi Class E row unions four members, and
                                        two of them contributed on the SAME DAY under the
                                        same label. Without the holder those read as one
                                        decision printed twice at different sizes. */}
                                    {trancheSpansEntities && <SortHeader col="entity" view={tv} align="left" pad="px-3 py-1.5">Entity</SortHeader>}
                                    <SortHeader col="amount" view={tv} pad="px-3 py-1.5">Amount</SortHeader>
                                    <SortHeader col="invested" view={tv} pad="px-3 py-1.5">Invested</SortHeader>
                                    <SortHeader col="units" view={tv} pad="px-3 py-1.5">Units</SortHeader>
                                    <SortHeader col="nav" view={tv} pad="px-3 py-1.5">Entry NAV</SortHeader>
                                    <SortHeader col="value" view={tv} pad="px-3 py-1.5">Value today</SortHeader>
                                    <SortHeader col="gain" view={tv} pad="px-3 py-1.5">Gain</SortHeader>
                                    <SortHeader col="return" view={tv} pad="px-3 py-1.5">Return</SortHeader>
                                  </Tr>
                                </thead>
                                <tbody className="divide-y divide-ink-700/50">
                                  {sortRows(tranches.rows, tv.sort, {
                                    date: (t) => t.date,
                                    type: (t) => t.label,
                                    entity: (t) => ownerOfAccount(t.move.accountId),
                                    amount: (t) => t.amount,
                                    invested: (t) => t.invested,
                                    units: (t) => t.units,
                                    nav: (t) => t.navAtEntry,
                                    value: (t) => t.value,
                                    gain: (t) => t.value - t.invested,
                                    return: (t) => (t.ret.kind === "absent" ? null : t.ret.pct),
                                  }).map((t) => (
                                    <Tr view={tv} key={t.date + t.label} data-tranche-row={r.key} className="hover:bg-ink-700/30">
                                      <td className="px-3 py-1.5 mono whitespace-nowrap text-slate-300">{fmtDate(t.date)}</td>
                                      <td className="px-3 py-1.5 text-slate-400">{t.label}</td>
                                      {trancheSpansEntities && (
                                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-400">{ownerOfAccount(t.move.accountId)}</td>
                                      )}
                                      {/* The GROSS the statement prints — what the family
                                          means by "10 crores" — beside what actually bought
                                          units after the fund's own charge on the day. */}
                                      <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">
                                        {t.amount === null
                                          ? <AbsentCell reason="this statement prints only a running balance for that date, so what moved on the day is not stated" />
                                          : fmtFromBase(t.amount, { compact: true })}
                                      </td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-300 whitespace-nowrap">{fmtFromBase(t.invested, { compact: true })}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">{fmtNum(t.units)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">{fmtFromBase(t.navAtEntry)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-200 whitespace-nowrap">{fmtFromBase(t.value, { compact: true })}</td>
                                      <td className={`px-3 py-1.5 text-right mono whitespace-nowrap ${t.value - t.invested >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                        {fmtFromBase(t.value - t.invested, { compact: true })}
                                      </td>
                                      <td className="px-3 py-1.5 text-right mono whitespace-nowrap">
                                        {t.ret.kind === "absent"
                                          ? <AbsentCell reason={t.ret.reason} />
                                          : <span className={t.ret.pct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                              <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">
                                                {t.ret.kind === "cagr" ? "CAGR" : "HPR"}
                                              </span>
                                              {fmtPct(t.ret.pct)}
                                            </span>}
                                      </td>
                                    </Tr>
                                  ))}
                                </tbody>
                                {/* SUMMED FROM THE ROWS ABOVE, never computed beside
                                    them — so it reconciles to the Invested cell this
                                    panel opened from by construction rather than by a
                                    tolerance. The Private Market page's PM-1 is what
                                    happens when a footer is derived independently. */}
                                <tfoot className="border-t border-ink-700 bg-ink-900/40">
                                  <TrFoot view={tv} data-tranche-total={r.key}
                                    className="px-3 py-1.5 font-medium text-slate-300"
                                    label={<>Combined · {tranches.rows.length} {tranches.rows.length === 1 ? "contribution" : "contributions"}</>}
                                    cells={{
                                      invested: <td key="invested" className="px-3 py-1.5 text-right mono font-medium text-slate-200 whitespace-nowrap">{fmtFromBase(tranches.invested, { compact: true })}</td>,
                                      units: <td key="units" className="px-3 py-1.5 text-right mono font-medium text-slate-300 whitespace-nowrap">{fmtNum(tranches.units)}</td>,
                                      value: <td key="value" className="px-3 py-1.5 text-right mono font-medium text-slate-100 whitespace-nowrap">{fmtFromBase(tranches.value, { compact: true })}</td>,
                                      gain: (
                                        <td key="gain" className={`px-3 py-1.5 text-right mono font-medium whitespace-nowrap ${tranches.value - tranches.invested >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                          {fmtFromBase(tranches.value - tranches.invested, { compact: true })}
                                        </td>
                                      ),
                                      return: (
                                        <td key="return" className={`px-3 py-1.5 text-right mono font-medium whitespace-nowrap ${tranches.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                          <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">HPR</span>{fmtPct(tranches.returnPct)}
                                        </td>
                                      ),
                                    }} />
                                </tfoot>
                                </>)}
                              </SortableTable>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {/* THE MANDATE'S OWN HOLDINGS — the drill-down the family
                          asked for, in place. Each share appears here and in the
                          mandate's row above, and nowhere beside the shares the
                          family bought itself. */}
                      {m && isOpen && (
                        <tr className="bg-ink-900/60">
                          <td colSpan={COL_COUNT} className="px-3 pb-3 pt-1">
                            <p className="mb-1.5 text-[11px] leading-relaxed text-slate-500">
                              {/* WHAT THE MANAGER REPORTS, OR WHAT THE FILTERS LEFT OF IT — never the
                                  first sentence over the second list. Filtered to one company this read
                                  "The 1 holding inside this mandate, as {manager} reports them", which is a
                                  false statement about a named counterparty that reports {accountCount} of
                                  them; the row's own sub-line one line above already said otherwise. */}
                              {whole ? (
                                <>
                                  The {m.holdings.length} {m.holdings.length === 1 ? "holding" : "holdings"} inside this mandate,
                                  as {m.manager} reports them at {fmtDate(m.asOf)}.
                                </>
                              ) : (
                                <>
                                  The {m.holdings.length} of {m.accountCount} holdings in this mandate that match the filters
                                  above — not the whole mandate, whose own total across all {m.accountCount} holdings is
                                  {" "}{money(m.accountMV)} on this page&rsquo;s current basis. Clear the filters, or open the
                                  drill-down below, for the mandate as {m.manager} reports it.
                                </>
                              )}{" "}
                              The family owns these shares; the manager chose
                              them — which is why they are counted here and in the row above, and never a second time among
                              the shares the family bought in its own name.
                            </p>
                            <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800">
                              <SortableTable className="min-w-full text-[12px]"
                                storageKey="monitor-mandate-drill" columns={MANDATE_DRILL_COLS}>
                                {(mv2) => (<>
                                <thead>
                                  <Tr view={mv2} className="border-b border-ink-700/70">
                                    <SortHeader col="security" view={mv2} align="left" pad="px-3 py-1.5">Security</SortHeader>
                                    <SortHeader col="qty" view={mv2} pad="px-3 py-1.5">Qty</SortHeader>
                                    <SortHeader col="avgCost" view={mv2} pad="px-3 py-1.5">Avg cost</SortHeader>
                                    <SortHeader col="invested" view={mv2} pad="px-3 py-1.5">Invested</SortHeader>
                                    <SortHeader col="cmp" view={mv2} pad="px-3 py-1.5">CMP</SortHeader>
                                    <SortHeader col="mv" view={mv2} pad="px-3 py-1.5">Market value</SortHeader>
                                    <SortHeader col="share" view={mv2} pad="px-3 py-1.5"
                                        title={`Each holding's share of the mandate's own total — ${money(m.accountMV)} across ${m.accountCount} holdings, struck before this page's filters.`}>% of mandate</SortHeader>
                                    <SortHeader col="pnl" view={mv2} pad="px-3 py-1.5">Unreal. P&L</SortHeader>
                                    <SortHeader col="return" view={mv2} pad="px-3 py-1.5">Return</SortHeader>
                                    {/* Sector last here too, so the drill-down reads
                                        in the same order as the row it opens out of. */}
                                    <SortHeader col="sector" view={mv2} align="left" pad="px-3 py-1.5">Sector</SortHeader>
                                  </Tr>
                                </thead>
                                <tbody className="divide-y divide-ink-700/50">
                                  {sortRows(m.holdings, mv2.sort, {
                                    security: (h) => h.security,
                                    qty: (h) => h.quantity,
                                    avgCost: (h) => (h.costNA ? null : h.avgCost),
                                    invested: (h) => (h.costNA ? null : h.costBasis),
                                    cmp: (h) => h.currentPrice,
                                    mv: (h) => h.marketValue,
                                    share: (h) => (m.accountMV > 0 ? h.marketValue : null),
                                    pnl: (h) => (h.costNA ? null : h.unrealizedPnL),
                                    return: (h) => (h.costNA ? null : h.returnPct),
                                    sector: (h) => h.sector,
                                  }).map((h) => (
                                    <Tr view={mv2} key={h.securityKey || h.security}>
                                      <td className="px-3 py-1.5 text-slate-200"><StockLink securityKey={h.securityKey} name={h.security} /></td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-300">{fmtNum(h.quantity)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">{h.costNA ? "—" : h.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" /> : fmtFromBase(h.avgCost)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">{h.costNA ? "—" : fmtFromBase(h.costBasis, { compact: true })}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">{h.currentPrice === null ? <AbsentCell reason="this row is marked at a total value, not a per-unit price" /> : fmtFromBase(h.currentPrice)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-100 whitespace-nowrap">{fmtFromBase(h.marketValue, { compact: true })}</td>
                                      {/* DIVIDED BY THE MANDATE, WHICH IS WHAT THE HEADER SAYS —
                                          `m.accountMV`, the account's own pre-filter total, and never
                                          `r.marketValue`, which is the roll-up of whatever survived the
                                          filters. Filtered to one company that read 100.0% for a
                                          ₹4.39 Cr holding of a ₹39.53 Cr mandate. Under a filter these
                                          therefore sum to less than 100%, which the sentence above the
                                          table states. */}
                                      <td className="px-3 py-1.5 text-right mono text-slate-400">
                                        {m.accountMV > 0
                                          ? `${((h.marketValue / m.accountMV) * 100).toFixed(1)}%`
                                          : <AbsentCell reason="the mandate is valued at nil, so a share of it cannot be struck" />}
                                      </td>
                                      <td className={`px-3 py-1.5 text-right mono ${h.costNA ? "text-slate-500" : changeColor(h.unrealizedPnL)}`}>{h.costNA ? "—" : fmtFromBase(h.unrealizedPnL, { compact: true, sign: true })}</td>
                                      <td className={`px-3 py-1.5 text-right mono ${h.costNA ? "text-slate-500" : changeColor(h.returnPct)}`}>{h.costNA ? "—" : fmtPct(h.returnPct, { sign: true })}</td>
                                      <td className="px-3 py-1.5 text-slate-400">{h.sector}</td>
                                    </Tr>
                                  ))}
                                </tbody>
                                </>)}
                              </SortableTable>
                            </div>
                            <p className="mt-1.5 text-[11px] text-slate-500">
                              <Link to={`/mandate/${encodeURIComponent(m.accountId)}`}
                                className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
                                Open the full {m.name} drill-down
                              </Link>
                              {" "}for this mandate&rsquo;s own returns, capital movements and dated ledger.
                            </p>
                          </td>
                        </tr>
                      )}
                      {/* ── THROUGH WHAT MEANS THIS NAME IS HELD ────────────
                          The security axis's drill-down, in place. It supersedes
                          the by-entity table below on this axis: that one groups
                          by MEMBER and lumps the routes into a set, which cannot
                          answer "held how" for a name three mandates hold for one
                          member. Every account is listed AS PRINTED — the row's
                          own value counts each dedupeGroup once — so the share
                          column divides by the printed sum and the footer names
                          the gap when the two differ. */}
                      {/* ── A ROW NO STATEMENT REPORTS, OPENED ───────────────
                          The family's own case: an issuer they hold only inside
                          a fund. There is no account to list and so no venue
                          table — what the expansion carries is the look-through
                          itself. It gets its own branch rather than an empty
                          version of the one below, because a route-split
                          sentence over zero routes and a table with no rows are
                          both statements about a measurement that does not
                          exist. */}
                      {!m && isOpen && r.venues && r.venues.length === 0 && canLookThrough(r) && (
                        <tr className="bg-ink-900/60">
                          <td colSpan={COL_COUNT} className="px-3 pb-3 pt-1">
                            <p className="mb-1.5 text-[11px] leading-relaxed text-slate-400">
                              <span className="font-medium text-slate-300">{r.security}</span> —
                              {" "}<span className="font-medium text-slate-200">no statement in this book reports this
                              issuer</span>, so there is no account, no quantity and no cost for it. Every figure on this
                              row is the family&rsquo;s share of what their funds disclose.
                            </p>
                            <FundExposure exposure={exposure} securityKey={r.securityKey} money={money} />
                          </td>
                        </tr>
                      )}
                      {!m && isOpen && r.venues && r.venues.length > 0 && (() => {
                        const vs = r.venues;
                        const printed = sum(vs.map((v) => v.marketValue));
                        const gap = printed - r.marketValue;
                        /**
                         * THE ROUTE SPLIT, IN WORDS, FIRST.
                         *
                         *   "Then I drill down, then you tell me direct you hold
                         *    X Cr through direct equity, and then you hold
                         *    another Y crores through these five funds."
                         *
                         * That is a sentence about ROUTES, not about accounts, so
                         * it is answered before the per-account table rather than
                         * left to be assembled by eye from a Held via column. The
                         * table below still carries every statement as printed.
                         */
                        const byRoute = [...vs.reduce((m, v) => {
                          const e = m.get(v.route) ?? { route: v.route, mv: 0, n: 0 };
                          e.mv += v.marketValue; e.n += 1;
                          return m.set(v.route, e);
                        }, new Map()).values()].sort((a, b) => b.mv - a.mv);
                        return (
                        <tr className="bg-ink-900/60">
                          <td colSpan={COL_COUNT} className="px-3 pb-3 pt-1">
                            <p className="mb-1.5 text-[11px] leading-relaxed text-slate-400">
                              <span className="font-medium text-slate-300">{r.security}</span> —
                              {" "}<span className="font-medium text-slate-200">{money(r.marketValue)}</span>, {(r.weight * 100).toFixed(2)}% of the book, held{" "}
                              {byRoute.map((g, i) => (
                                <span key={g.route}>
                                  {i > 0 && (i === byRoute.length - 1 ? " and " : ", ")}
                                  <span className="font-medium text-slate-200">{money(g.mv)}</span> through{" "}
                                  {g.n === 1 ? "" : `${g.n} `}{g.route}{g.n === 1 ? "" : "s"}
                                </span>
                              ))}
                              {/*
                                THE ROUTE SPLIT IS STRUCK OVER THE STATEMENTS AS
                                PRINTED, and on two rows in this book that is not
                                the figure at the head of the same sentence.

                                Transition Venture Fund I is reported by both
                                family trusts, so the row counts it once at
                                ₹1.71 Cr and this clause adds to ₹3.43 Cr — and a
                                reader who divides one printed cell by another and
                                gets a third answer has found a contradiction that
                                a sentence three lines below does not rescue. The
                                reconciliation under the table stays; this is the
                                mark that sends them to it, and it renders only
                                where the two really differ.
                              */}
                              {gap > 1 && (
                                <> as the statements print it, of which{" "}
                                  <span className="font-medium text-slate-200">{money(gap)}</span> is the same holding
                                  reported twice</>
                              )}.
                            </p>
                            {/* THE CAPTION THAT SAT HERE IS GONE at the family's
                                request, and its two claims were checked against
                                the rest of the panel before it went. That the row
                                clubs these lines is the lead sentence above, which
                                names the row's own value and then splits it by
                                route; that each line is one STATEMENT rather than
                                a deduped view only has a consequence where the two
                                differ, and on exactly those rows the lead sentence
                                names the overlap in rupees and the amber line under
                                the table reconciles it in figures. On every other
                                row the distinction changes no number, so the
                                sentence was telling a reader about a difference
                                their own row does not have. */}
                            <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800">
                              <SortableTable className="min-w-full text-[12px]"
                                storageKey={r.fundClasses.length > 0 ? "monitor-venue-class" : "monitor-venue"}
                                columns={r.fundClasses.length > 0 ? VENUE_CLASS_COLS : VENUE_COLS}>
                                {(vv) => (<>
                                <thead>
                                  <Tr view={vv} className="border-b border-ink-700/70">
                                    {/* THE CLASS COLUMN, ONLY WHERE THE ROW CLUBS MORE THAN ONE.
                                        Drawn from the row rather than from the venues: a
                                        column headed Class over a table where every line
                                        says the same thing is chrome, and over a table
                                        where none does it is empty. It leads the row where
                                        it is drawn, so it is the FIXED column there and the
                                        one that never moves. */}
                                    {r.fundClasses.length > 0 && (
                                      <SortHeader col="cls" view={vv} align="left" pad="px-3 py-1.5">Class</SortHeader>
                                    )}
                                    <SortHeader col="route" view={vv} align="left" pad="px-3 py-1.5">Held via</SortHeader>
                                    <SortHeader col="vehicle" view={vv} align="left" pad="px-3 py-1.5">Vehicle</SortHeader>
                                    <SortHeader col="entity" view={vv} align="left" pad="px-3 py-1.5">Owning entity</SortHeader>
                                    <SortHeader col="qty" view={vv} pad="px-3 py-1.5">Qty</SortHeader>
                                    <SortHeader col="mv" view={vv} pad="px-3 py-1.5">Market value</SortHeader>
                                    <SortHeader col="share" view={vv} pad="px-3 py-1.5">% of holding</SortHeader>
                                    <SortHeader col="pnl" view={vv} pad="px-3 py-1.5">Unreal. P&L</SortHeader>
                                    <SortHeader col="return" view={vv} pad="px-3 py-1.5">Return</SortHeader>
                                  </Tr>
                                </thead>
                                <tbody className="divide-y divide-ink-700/50">
                                  {sortRows(vs, vv.sort, {
                                    cls: (v) => v.cls,
                                    route: (v) => v.route,
                                    vehicle: (v) => v.vehicle,
                                    entity: (v) => v.owner,
                                    qty: (v) => v.quantity,
                                    mv: (v) => v.marketValue,
                                    share: (v) => v.share,
                                    pnl: (v) => (v.costNA ? null : v.unrealizedPnL),
                                    return: (v) => (v.costNA ? null : v.returnPct),
                                  }).map((v) => (
                                    <Tr view={vv} key={v.securityKey + "@" + v.accountId} data-venue={v.route} data-venue-class={v.cls ?? ""}>
                                      {/* AND THE CLASS ITSELF IS THE LINK, because a class
                                          is what `/stock/:securityKey` actually serves. The
                                          clubbed row above deliberately is not one. */}
                                      {r.fundClasses.length > 0 && (
                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                          {v.cls
                                            ? <StockLink securityKey={v.securityKey} name={v.cls} />
                                            : <AbsentCell reason="this line's statement names no unit class for the holding" />}
                                        </td>
                                      )}
                                      <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{v.route}</td>
                                      <td className="px-3 py-1.5 text-slate-200">
                                        {v.isMandate
                                          ? <Link to={`/mandate/${encodeURIComponent(v.accountId)}`}
                                              title={`Account ${v.accountNo} — open the mandate drill-down`}
                                              className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
                                              {v.vehicle}
                                            </Link>
                                          : <span title={`Account ${v.accountNo}`}>{v.vehicle}</span>}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-400">{v.owner}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-300">{fmtNum(v.quantity)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-100 whitespace-nowrap">{fmtFromBase(v.marketValue, { compact: true })}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400">{(v.share * 100).toFixed(1)}%</td>
                                      <td className={`px-3 py-1.5 text-right mono ${v.costNA ? "text-slate-500" : changeColor(v.unrealizedPnL)}`}>
                                        {v.costNA
                                          ? <AbsentCell reason="this account's statement reports no cost for the holding — a depository holds the shares and did not buy them" />
                                          : fmtFromBase(v.unrealizedPnL, { compact: true, sign: true })}
                                      </td>
                                      <td className={`px-3 py-1.5 text-right mono ${v.costNA ? "text-slate-500" : changeColor(v.returnPct)}`}>
                                        {v.costNA
                                          ? <AbsentCell reason="no cost on this statement, so there is nothing to strike a return against" />
                                          : fmtPct(v.returnPct, { sign: true })}
                                      </td>
                                    </Tr>
                                  ))}
                                </tbody>
                                </>)}
                              </SortableTable>
                            </div>
                            {gap > 1 && (
                              <p className="mt-1.5 text-[11px] leading-relaxed text-amber-400/80">
                                These lines add to {fmtFromBase(printed, { compact: true })} because this holding is reported
                                under two accounts; the row above counts it once at {fmtFromBase(r.marketValue, { compact: true })}
                                {" "}(a {fmtFromBase(gap, { compact: true })} overlap).
                              </p>
                            )}
                            {/* ...AND THE SECOND HALF OF THE QUESTION: what the
                                family's FUNDS hold of this name. Derived, fenced,
                                and never added to anything above — see the
                                component's own header.

                                THE GATE USED TO BE `assetClass === "Equity"` AND
                                THAT STOPPED BEING RIGHT. It was, while the store
                                carried each AMC's equity section alone — a
                                disclosure that holds only shares can speak for
                                nothing else. The store reads the whole monthly
                                filing now, so an issuer reached through its NCDs
                                has an answer and that gate refused to show it,
                                which is the family's own example refused on the
                                one page it was asked for. See `canLookThrough`. */}
                            {canLookThrough(r) && (
                              <FundExposure exposure={exposure} securityKey={r.securityKey} money={money} />
                            )}
                          </td>
                        </tr>
                        );
                      })()}
                    </Fragment>
                  );
                    })}
                    {/*
                      ── EVERY METRIC, TOTALLED FOR THE CATEGORY ABOVE IT ──────
                      "Show aggregate totals for every metric for each category."
                      The heading names the category and its size; this row is the
                      rest of the table's columns, added up over the same set.

                      IT IS A ROW OF CELLS, NOT A WIDENED HEADING, and that is the
                      whole design: a total belongs UNDER THE COLUMN IT TOTALS.
                      This book has already paid twice for a figure printed under
                      a heading that describes something else — the allocation
                      footer on a different basis from its own column, and the
                      Capital invested tile captioned "listed only" over a
                      whole-book sum.

                      EVERY CELL A CATEGORY CANNOT ANSWER RENDERS `AbsentCell`
                      WITH ITS REASON rather than being left blank. Quantity and
                      the two per-unit columns are the ones that matter: shares of
                      one company plus units of a fund is not a quantity, and the
                      reader who scans across an empty cell learns nothing about
                      whether a figure was withheld or never existed.
                    */}
                    {showBucketSections && (() => {
                      const tot = grp.totals;
                      // Struck over the positions, so it cannot disagree with the
                      // rows drawn above it — but a category with no partition
                      // entry has nothing to total and says so rather than
                      // printing zeros for a row it cannot see.
                      if (!tot) return null;
                      const weight = weightBase > 0 ? (tot.mv / weightBase) * 100 : null;
                      const uncostedMV = tot.mv - tot.costedMV;
                      /**
                       * THE RETURN IS REFUSED WHERE THE TWO COLUMNS BESIDE IT
                       * DESCRIBE DIFFERENT SETS OF HOLDINGS — `costCoversSet`,
                       * the same test Morning CIO's allocation row runs on the
                       * same buckets. Direct Equity reports a cost on 9 of 37
                       * holdings, so a return on cost would sit between a printed
                       * ₹1.22 Cr invested and a printed ₹94.9 Cr current and
                       * describe neither. A reader who divides one printed cell
                       * by another and gets a third answer has found a
                       * contradiction, and this is the row they would find it on.
                       */
                      // The section's own words on the active axis — the two
                      // family axes are already the family's wording and render
                      // verbatim; only the category axis has a label function.
                      const label = groupLabelFor(groupAxis)(grp.key);
                      const covered = costCoversSet(tot.mv, uncostedMV);
                      const ret = covered && tot.cost !== null && tot.pnl !== null && tot.cost > 0
                        ? (tot.pnl / tot.cost) * 100 : null;
                      /**
                       * AND A REFUSED RETURN NAMES THE FAILURE IT ACTUALLY HAD.
                       *
                       * Four different things stop this cell, and the first cut
                       * gave the coverage reason for all of them — so Cash, whose
                       * every statement reports a nil balance, read "₹0 of this
                       * category's ₹0 is held in accounts that report no cost",
                       * which is a confident diagnosis of something that is not
                       * happening. A wrong message sends the next reader to look
                       * for statements nobody owes, which this book already
                       * records as worse than a blank cell.
                       */
                      const retWhy =
                        tot.cost === null ? `no statement behind ${label} reports a cost, so there is nothing to measure a return against`
                        : tot.mv <= 0 ? `${label} is measured at nil — every statement behind it reports a zero balance — so there is no value to measure a return on`
                        : tot.pnl === null ? `no holding in ${label} reports an unrealised gain, so there is no numerator to divide`
                        : tot.cost <= 0 ? `${label} reports a cost of zero, and a return on cost has nothing to divide by`
                        : `${fmtFromBase(uncostedMV, { compact: true })} of this category's ${fmtFromBase(tot.mv, { compact: true })} is held in accounts that report no cost, so a return on cost would divide one set of holdings by another and describe neither column beside it. The ${tot.costedCount} costed holdings show their own return on their own rows.`;
                      const realised = realisedFor(grp.key);
                      const sharedNames = realisedByBucket.shared.get(grp.key) ?? 0;
                      const costCover = `Added over the ${tot.costedCount} of ${tot.heldCount} holdings in ${label} whose statement reports a cost; the other ${tot.heldCount - tot.costedCount} hold ${fmtFromBase(uncostedMV, { compact: true })} and are in Market value only.`;
                      return (
                        /* A `<Tr>` RATHER THAN A `<TrFoot>`, because this row
                           carries a cell under EVERY column — its label spans
                           one, not the footer's three — so it permutes like an
                           ordinary row and stays cell-for-cell under the
                           headings above it. */
                        <Tr view={holdView} className="border-t border-ink-700 bg-ink-900/40 font-semibold"
                          data-category-total={grp.key}>
                          <td className="px-2 py-1.5 text-slate-200">
                            {label} <span className="font-normal text-slate-500">· total</span>
                          </td>
                          {/* NOT A BLANK CELL AND NOT A SUM. Adding 1,80,185
                              shares of one company to 3,416,657 units of a fund
                              produces a number with no unit, and it would sit in
                              a column of real quantities looking like one. */}
                          <td className="px-2 py-1.5 text-right mono">
                            <AbsentCell reason="quantities of different securities cannot be added: shares of one company and units of a fund are not the same thing, and their sum has no unit." />
                          </td>
                          <td className="px-2 py-1.5 text-right mono">
                            <AbsentCell reason="an average cost per unit needs one security; this category holds many, each with a cost of its own. Invested beside it is the money." />
                          </td>
                          <td className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap">
                            {tot.cost === null
                              ? <AbsentCell reason={`no statement behind ${label} reports a cost — these are depository holdings, which record what is held and never what it was bought for. A ₹0 here would report the whole category as profit.`} />
                              : <span title={uncostedMV > 1 ? costCover : undefined}>
                                  {fmtFromBase(tot.cost, { compact: true })}
                                  {uncostedMV > 1 && <span className="ml-1 text-[10px] font-normal text-amber-400/80">◦</span>}
                                </span>}
                          </td>
                          {/* A CATEGORY WAS BOUGHT ON MANY DATES, so there is
                              no one date to print — the same reason its Qty and
                              Avg cost cells are absent rather than blended. The
                              coverage is on the FOOTER, where a count over the
                              whole table means something. */}
                          <td className="px-2 py-1.5 text-left mono">
                            <AbsentCell reason="a category holds many holdings bought on many dates; there is no single date for it. Each row above carries its own." />
                          </td>
                          <td className="px-2 py-1.5 text-right mono">
                            <AbsentCell reason="a price is per unit and belongs to one security; a category has no price. Its market value is in the column that measures money." />
                          </td>
                          {/* The category's move over the part of it the feed
                              actually repriced — never over its whole value,
                              which would dilute the move by every folio and cash
                              sleeve that has no quote and no previous close. */}
                          <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${grp.dayPct == null ? "text-slate-600" : changeColor(grp.dayPct)}`}
                            title={grp.dayPct == null ? undefined
                              : `${fmtFromBase(grp.day, { compact: true, sign: true })} since previous close, across the ${fmtFromBase(grp.dayBase, { compact: true })} of ${label} the feed prices.`}>
                            {grp.dayPct == null
                              ? <AbsentCell reason={`no holding in ${label} carries a live quote, so there is no previous close to move from`} />
                              : `${grp.dayPct >= 0 ? "+" : ""}${grp.dayPct.toFixed(2)}%`}
                          </td>
                          {/* `grp.subtotal` IS `tot.mv` — the heading prints the
                              same field, so the two figures a reader sees three
                              lines apart are one computation and cannot differ. */}
                          <td className="px-2 py-1.5 text-right mono text-slate-100 whitespace-nowrap">
                            {fmtFromBase(grp.subtotal, { compact: true })}
                          </td>
                          <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap"
                            title={`${label} as a share of ${weightScope ? `the ${weightScope} book` : "the whole book"} — the same denominator every Weight cell above divides by, so the categories add to the Total row.`}>
                            {weight === null ? <AbsentCell reason="the book this weight would divide by is empty" /> : `${weight.toFixed(1)}%`}
                          </td>
                          <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${tot.pnl === null ? "text-slate-500" : changeColor(tot.pnl)}`}>
                            {tot.pnl === null
                              ? <AbsentCell reason={`an unrealised gain is market value less cost, and no statement behind ${label} reports a cost`} />
                              : <span title={uncostedMV > 1 ? costCover : undefined}>
                                  {fmtFromBase(tot.pnl, { compact: true, sign: true })}
                                  {uncostedMV > 1 && <span className="ml-1 text-[10px] font-normal text-amber-400/80">◦</span>}
                                </span>}
                          </td>
                          {/* Realised is reported PER SECURITY across the whole
                              book, so the categories claim each name once and the
                              rows inside a mandate show none of it — the same
                              split the footer already names in the caption. */}
                          <td className="px-2 py-1.5 text-right mono whitespace-nowrap">{
                            !consolidate ? <AbsentCell reason="realised gain is a per-security figure; switch to the consolidated view to see it" />
                            : realized === undefined ? <span className="font-normal text-slate-500">…</span>
                            : realised === null || realised.total === null ? <AbsentCell reason={realised?.anySold
                                ? `these names were sold, but no capital gain statement covers the accounts they were sold from`
                                : `no sale of a name held in ${label} appears on the transaction statements in this drop`} />
                            : <span className={changeColor(realised.total)}
                                title={sharedNames > 0
                                  ? `${sharedNames} of these names are also held in another category. A name's realised gain is reported once for the whole book, so it is counted under the first category that holds it rather than split between them — there is no per-category split on any statement to divide it by.`
                                  : undefined}>
                                {fmtFromBase(realised.total, { compact: true, sign: true })}
                              </span>
                          }</td>
                          {/*
                              ── ONE CELL PER RETURN COLUMN, AND ONLY ONE OF THEM
                                 HAS A FIGURE TO PUT IN IT ──────────────────────

                              The category return is CUMULATIVE ON COST and does
                              NOT follow the per-holding measure picker: a bucket
                              has no single purchase date to annualise over, so
                              annualising it would be the very extrapolation the
                              guard forbids. It is refused where the cost side does
                              not cover the market value beside it
                              (`costCoversSet`), the same as Morning CIO.

                              THAT USED TO BE ONE CELL UNDER A HEADER THAT COULD
                              MEAN ANY OF FIVE THINGS. With a column per measure it
                              has to say which: the cumulative figure stands under
                              HPR and under `auto` — which resolves to the total
                              return on cost for an aggregate — and under CAGR,
                              XIRR, YTD or CY it renders an `AbsentCell` with the
                              reason, because a category genuinely has none of
                              those. Printing the same percentage under all five
                              would be the caption-does-not-describe-its-figure
                              failure, five columns wide.
                          */}
                          {returnMeasures.map((measure) => {
                            const onCost = measure === "auto" || measure === "absolute";
                            const why = !onCost
                              ? `${label} is a category, not a holding: ${AGG_NO_MEASURE[measure]} Its cumulative return on cost shows under HPR — tick Holding Period Return to see it.`
                              : retWhy;
                            return (
                              <td key={measure} className={`px-2 py-1.5 text-right mono whitespace-nowrap ${!onCost || ret === null ? "text-slate-500" : changeColor(ret)}`}>
                                {!onCost || ret === null
                                  ? <AbsentCell reason={why} />
                                  : <span title={`${fmtFromBase(tot.pnl, { compact: true, sign: true })} on ${fmtFromBase(tot.cost, { compact: true })} invested. Cumulative on cost, not annualised — a category has no single purchase date to strike a CAGR or XIRR over.`}>
                                      {fmtPct(ret, { sign: true })}
                                    </span>}
                              </td>
                            );
                          })}
                          {/* Sector and Entity describe a holding; a category has
                              no sum of words. Empty, exactly as in the footer. */}
                          <td className="px-2 py-1.5"></td>
                          <td className="px-2 py-1.5"></td>
                        </Tr>
                      );
                    })()}
                  </Fragment>
                ))}
                {rows.length === 0 && <tr><td colSpan={COL_COUNT} className="py-12 text-center text-sm text-slate-500">No positions match your filters.</td></tr>}
              </tbody>
              <tfoot className="sticky bottom-0 bg-ink-800">
                {/* `data-footer-total` is the handle the sweep adds the category
                    totals up against. Read by COLUMN rather than by cell: this
                    row's label spans three of them and a category's spans one,
                    so cell-for-cell the two rows are different measurements. */}
                {/*
                    THE FLOOR IS NAMED IN THE FOOTER'S OWN `title`, AND NOT AS A
                    PARAGRAPH UNDER THE TABLE.

                    A note there is what the family have twice asked to be rid of
                    — the closed-position note was one of the three grey blocks
                    they pointed at, and it is recorded above as removed rather
                    than relocated. But a row count that silently stops counting
                    six holdings is the gap that note existed to close, so the
                    claim goes where this book puts a claim about a figure: on
                    the figure. Same treatment as the Weight cell's own `title`
                    one column over, which explains its denominator the same way.
                  */}
                <TrFoot view={holdView} className="px-2 py-1.5 text-slate-200"
                  data-footer-total=""
                  labelTitle={smallDropped.count > 0
                        ? `Total · ${rows.length} rows. ${smallDropped.count} holding${smallDropped.count === 1 ? "" : "s"} worth under ${fmtFromBase(NEGLIGIBLE_VALUE_FLOOR)} ${smallDropped.count === 1 ? "is" : "are"} dropped automatically at the family's instruction — ${fmtFromBase(smallDropped.value)} in total, which is what this figure and every total beside it leave out. Nothing is missing: the book still carries them and the statements still report them.`
                        : `Total · ${rows.length} rows. No holding in this book falls under the ${fmtFromBase(NEGLIGIBLE_VALUE_FLOOR)} floor.`}
                  label={<>Total · {rows.length} rows</>}
                  cells={{
                    invested: (
                    <td key="invested" className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap"><Auditable formula={{ title: "Total invested (cost)", excel: "= Σ Cost of all holdings", plain: "What the holdings in this table cost, added together — every asset class, not the listed ones alone.", worked: `= ${money(totCost)} across ${rows.length} rows`,  }}>{fmtFromBase(totCost, { compact: true })}</Auditable></td>
                    ),
                    /*
                      THE COLUMN COUNTS WHAT IT COVERS RATHER THAN LEAVING A WALL
                      OF DASHES TO BE INTERPRETED. There is no honest aggregate to
                      print here — a "first invested" over rows most of which carry
                      no date would be the first of the dated subset — so the
                      footer states the coverage instead, which is the one thing a
                      reader needs to know about a column that is mostly absent.
                    */
                    investedOn: (
                    <td key="investedOn" className="px-2 py-1.5 text-left text-[10.5px] font-normal text-slate-500 whitespace-nowrap"
                      data-invested-on-coverage={rows.filter((r) => r.investedOn).length}
                      title="A holding is dated where a lot register reports when it was acquired, or where the fund reports its own dated allotments against that folio. The rest report a cost and not a date, or no cost at all — a depository records what is held and never what was paid for it.">
                      {rows.filter((r) => r.investedOn).length} of {rows.length} dated
                    </td>
                    ),
                    cmp: (
                    <td key="cmp" className="px-2 py-1.5"></td>
                    ),
                    day: (
                    <td key="day" className={`px-2 py-1.5 text-right mono whitespace-nowrap ${totDayPct == null ? "text-slate-600" : changeColor(totDayPct)}`}
                      title={totDayPct == null ? undefined : `${money(totDay, true)} across the live-priced book since previous close`}>
                      {totDayPct == null ? "—" : `${totDayPct >= 0 ? "+" : ""}${totDayPct.toFixed(2)}%`}
                    </td>
                    ),
                    mv: (
                    <td key="mv" className="px-2 py-1.5 text-right mono text-slate-100 whitespace-nowrap" title={feedLive ? LIVE_CELL : undefined}>
                      {feedLive ? fmtFromBase(totMV, { compact: true })
                                : <Auditable formula={{ title: "Total market value", excel: "= Σ Market value of all holdings", plain: "The market value of the holdings in this table, added together — every asset class, not the listed ones alone.", worked: `= ${money(totMV)} across ${rows.length} rows`,  }}>{fmtFromBase(totMV, { compact: true })}</Auditable>}
                    </td>
                    ),
                    /* THE TWO STOCK-AXIS COLUMNS TOTAL TOO. `Via funds` is the
                        derived equity across every disclosed fund and `Total
                        exposure` is the figure the table exists to state — what
                        the family holds of companies altogether. Both are struck
                        FROM the rows above, so the footer ties to its own column
                        rather than being computed a second way (the Private Market
                        page's PM-1). */
                    viaFunds: (
                      <td key="viaFunds" className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap" data-footer-viafunds>
                        {exposure.status === "ok"
                          ? fmtFromBase(sum(rows.map((r) => r.viaFunds ?? 0)), { compact: true })
                          : <AbsentCell reason={exposure.status === "loading"
                              ? "the fund look-through is still loading"
                              : "the fund look-through store did not answer"} />}
                      </td>
                    ),
                    totalExposure: (
                      /* ── WHERE THE REST OF THE BOOK IS, ON THE FIGURE IT QUALIFIES ──
                         The paragraph that carried this partition under the table
                         was removed at the family's request. Every other claim it
                         made is on the screen already — the clubbing is the row's
                         own entities pill, the look-through's two failure states
                         are the `Via funds` footer's AbsentCell reasons, and the
                         derived-not-a-position rule is on that column's header —
                         but the partition is not, and it is the one a reader ACTS
                         on: this table covers under a third of the book and looks
                         like the whole portfolio, which is the caption-that-widens
                         failure in its purest form. So it rides on the cell that
                         prints the figure it is about, which is where a claim about
                         a column belongs. The share itself stays on the face of the
                         table, in the Weight footer beside it. */
                      <td key="totalExposure" className="px-2 py-1.5 text-right mono text-slate-100 whitespace-nowrap" data-footer-exposure
                        title={exposure.status !== "ok"
                          ? `${money(stockCoverage.measured)} of companies the statements report directly. The fund look-through ${exposure.status === "loading" ? "is still loading" : "store did not answer"}, so what is held inside the funds is not in this figure — that is a fact about the fetch, not about the book.`
                          : `This table covers ${money(stockCoverage.total)} of the ${money(stockCoverage.nav)} book`
                            + ` — ${money(stockCoverage.measured)} the statements report directly, and ${money(stockCoverage.derived)} DERIVED`
                            + ` from what ${stockCoverage.covered} of your ${stockCoverage.considered} fund holdings disclose.`
                            + ` The rest is not companies this table can see: ${money(stockCoverage.opaque)} sits inside vehicles that publish no holdings at all`
                            + (stockCoverage.aifCount > 0
                                ? ` (${stockCoverage.aifCount} AIF folio${stockCoverage.aifCount === 1 ? "" : "s"}, ${money(stockCoverage.aifValue)} — an AIF files no portfolio disclosure that joins to a folio this family holds, so no future statement fills it)`
                                : "")
                            + `, ${money(stockCoverage.unaccounted)} is the part of a disclosed fund no line in the filing accounted for — its cash sleeve, a gold or silver ETF's metal, and the disclosure's own rounding — and ${money(stockCoverage.cash)} is the book's own cash.`
                            + (stockCoverage.splitNames.count > 0
                                ? ` ${stockCoverage.splitNames.count === 1 ? "One company stands here as two rows" : `${stockCoverage.splitNames.count} companies stand here as more than one row each`} (${money(stockCoverage.splitNames.value)}): one issuer clips its name where another spells it out, their ISINs say they are one security, and the fix belongs in the extractor — docs/BOOK-REPORT.md names them.`
                                : "")}>
                        {fmtFromBase(sum(rows.map((r) => r.totalExposure ?? r.marketValue)), { compact: true })}
                      </td>
                    ),
                    /* THE WEIGHT COLUMN HAS A TOTAL NOW, and it is not decoration.
                        Each category above prints its own share of the book, and a
                        column of shares with no total is a set of figures a reader
                        cannot check by adding. It reads 100.0% unfiltered — the
                        denominator IS this table's book — and less than that under
                        a company filter, which is the gap the caption below already
                        explains. Absent rather than 0.0% on an empty book: a weight
                        of nothing divided by nothing is not a measurement. */
                    weight: (
                    <td key="weight" className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap"
                      /* THE NUMERATOR IS WHAT THIS CELL PRINTS, NOT `totMV`. On the
                         stock axis every Weight cell divides TOTAL EXPOSURE by the
                         book, so a hover explaining the figure with the measured
                         half alone described a percentage nobody could reproduce
                         from it — a caption narrowing a figure it does not narrow,
                         one column over from where that already cost this page
                         once. This is the whole of what the removed weight
                         paragraph said, on the column it is about. */
                      title={(() => {
                        const shown = bySecurity ? sum(rows.map((r) => r.totalExposure ?? r.marketValue)) : totMV;
                        const pct = weightBase > 0 ? ((shown / weightBase) * 100).toFixed(1) : "0.0";
                        return weightBase > 0 && weightBase - shown > 1
                          ? `Weight is a share of the book, not of the rows you are looking at: every cell divides by ${fmtFromBase(weightBase, { compact: true })} across ${weightCount} positions — the book the entity, sector and category filters describe — so a picked name keeps the weight it has on the unfiltered table. The rows on screen are ${fmtFromBase(shown, { compact: true })} of that, which is why this column adds to ${pct}% and not to 100%.`
                          : "Every weight above is struck over this table's own book, so the column adds to 100%.";
                      })()}>
                      {/* ON THE STOCK AXIS EVERY WEIGHT CELL DIVIDES TOTAL
                          EXPOSURE by the book, so the footer must too — summing
                          the measured half under a column of combined ones is the
                          "a total must tie to its own columns" failure. It reads
                          the book's stock share there, which is the honest figure
                          and is what the caption explains. */}
                      {weightBase > 0
                        ? `${(((bySecurity ? sum(rows.map((r) => r.totalExposure ?? r.marketValue)) : totMV) / weightBase) * 100).toFixed(1)}%`
                        : <AbsentCell reason="the book this weight would divide by is empty" />}
                    </td>
                    ),
                    pnl: (
                    <td key="pnl" className={`px-2 py-1.5 text-right mono whitespace-nowrap ${changeColor(totPnL)}`} title={feedLive ? LIVE_CELL : undefined}>
                      {feedLive ? fmtFromBase(totPnL, { compact: true, sign: true })
                                : <Auditable formula={{ title: "Total unrealised P&L", excel: "= Σ (Market value − Cost)", plain: "Every holding's on-paper gain or loss, added up.", worked: `= ${money(totPnL, true)}`,  }}>{fmtFromBase(totPnL, { compact: true, sign: true })}</Auditable>}
                    </td>
                    ),
                    /* sumOrNull, not sum: a name with no realised figure must not
                        be added in as zero — that turns "never reported" into a
                        measurement and drags the total towards it.
                        AND IT SUMS OVER THE UNION OF THE ROWS' OWN KEYS, not over
                        one key per row. Ten mandate rows now stand for 281 shares,
                        and most of this book's realised gain was made inside them;
                        reading `r.securityKey` alone would have quietly emptied
                        this cell the moment the shares moved into their mandates.
                        A Set, because a name in two mandates is still one name on
                        the capital gain statements.
                        The consequence — a total whose visible column shows only
                        part of it — is measured in `realisedSplit` and named in the
                        caption under the table. Each state gets its OWN reason: a
                        still-loading archive, an unreachable one and a book with no
                        capital gain statement are three different findings, and the
                        cell used to report all three as "shown in the consolidated
                        view". */
                    realised: (
                    <td key="realised" className="px-2 py-1.5 text-right mono whitespace-nowrap">{
                      !consolidate ? <AbsentCell reason="realised gain is a per-security figure; switch to the consolidated view to see it" />
                      : realized === undefined ? <span className="text-slate-500">…</span>
                      : realized === null ? <AbsentCell reason="the audit archive didn't respond" />
                      : realisedSplit === null || realisedSplit.total === null ? <AbsentCell reason={realisedSplit?.anySold
                          ? "these names were sold, but no capital gain statement covers the accounts they were sold from"
                          : "no sale of these names appears on the transaction statements in this drop"} />
                      : <span className={changeColor(realisedSplit.total)}>{fmtFromBase(realisedSplit.total, { compact: true, sign: true })}</span>
                    }</td>
                    ),
                    /* THE FOOTER RETURN IS THE WHOLE BOOK ON COST — cumulative, on
                        the footer's own basis, and like the category returns it does
                        NOT follow the per-holding measure picker: the book has no one
                        purchase date to annualise over.

                        SO IT STANDS UNDER HPR AND UNDER `auto`, and every other
                        return column renders a dash carrying the reason
                        (`AGG_NO_MEASURE`). One figure repeated under five
                        different headings is the failure the allocation footer
                        already cost this book once — a total must tie to its own
                        column, and four of those five columns are not this
                        total's. This fell out of the per-measure columns rather
                        than being asked for, and it is strictly more honest than
                        the one cell under a header that could mean any of five
                        things. */
                    ...Object.fromEntries(returnMeasures.map((measure) => {
                      const onCost = measure === "auto" || measure === "absolute";
                      return [`ret:${measure}`, (
                        <td key={`ret:${measure}`} className={`px-2 py-1.5 text-right mono whitespace-nowrap ${onCost ? changeColor(totPnL) : "text-slate-500"}`}
                          title={onCost && feedLive ? LIVE_CELL : undefined}>
                          {!onCost
                            ? <AbsentCell reason={`This is the whole book, not a holding: ${AGG_NO_MEASURE[measure]} Its cumulative return on cost shows under HPR — tick Holding Period Return to see it.`} />
                            : feedLive ? fmtPct(totalRet, { sign: true })
                            : <Auditable formula={{ title: "Total return", excel: "= Total P&L ÷ Total cost × 100", plain: "The whole listed book's gain or loss versus what it cost.", worked: `= ${money(totPnL)} ÷ ${money(totCost)} × 100 = ${fmtPct(totalRet, { sign: true })}` }}>{fmtPct(totalRet, { sign: true })}</Auditable>}
                        </td>
                      )];
                    })),
                    /* Sector and Entity — descriptors, so the footer has nothing
                        to total under them. Empty rather than absent: a column
                        of words has no sum to be missing. */
                    sector: (
                    <td key="sector" className="px-2 py-1.5"></td>
                    ),
                    entity: (
                    <td key="entity" className="px-2 py-1.5"></td>
                    ),
                  }} />
              </tfoot>
            </table>
          </div>
          {/* The cost-coverage caption that stood here — "Invested and Unrealised
              P&L are struck over the N of M positions that report a cost" — was
              removed at the family's request. The fact it stated survives per row:
              a position with no cost renders an AbsentCell in the Invested and
              Unrealised P&L columns, each carrying the reason in its title. */}
          {/*
            ── THE THREE PARAGRAPHS UNDER THIS TABLE ARE GONE ───────────────────

            *"remove the highlighted text from the dashboard."* The coverage
            paragraph, the closed-positions note and the weight caption, each
            checked claim by claim against the rest of the screen before it went
            — the pattern this file has followed since Stage 10aa, because a
            paragraph is where a figure a reader ACTS on can hide.

              • "One row per company, ranked by total exposure", "a name is
                clubbed across every account", "A FUND IS NOT A STOCK": the table
                shows all three. The per-row clubbing is the row's own entities
                pill and the venue panel it opens; the ranking is the Total
                exposure header the sort runs on. Chrome.
              • the look-through still loading, and the store not answering: the
                `Via funds` footer renders an AbsentCell naming exactly those two
                causes, and the Total exposure footer's own hover names them too.
              • Via funds and Total exposure are DERIVED and no part of NAV: on
                the `Via funds` column header, which is what it is about, and on
                every opened row in `FundExposure`.
              • THE FIVE-BUCKET PARTITION — what this table covers and where the
                rest of the book is — was stated NOWHERE ELSE, and it is the one
                claim that matters, because a table covering under a third of the
                book reads as the whole portfolio without it. It is on the Total
                exposure footer cell, which prints the figure it qualifies, and
                the SHARE stays on the face of the table in the Weight footer.
              • the split-name warning is currently silent (the ICICI case was
                fixed in the extractor) and `docs/BOOK-REPORT.md` carries the full
                list. It rides in the same hover so a future drop still says it.
              • the closed-position note went with ask 2 below: a redeemed
                holding is no longer on any allocation page at all, and where the
                money went is the Transactions card's Capital in and out table,
                which is the dated record a redemption belongs on.
              • the weight caption is the Weight footer's own hover, on the
                column it describes.

            `check:pages` asserts the removals AND that each moved fact is still
            reachable, because neither implies the other.
          */}
          {bySecurity && (
            <details data-stock-coverage className="mt-2 rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2">
              {/*
                *"remove the highlighted text from the dashboard ui"* — the grey
                paragraph that stood here. Audited line by line before anything
                went, because most of it carried a FIGURE:

                  · "One row per company, ranked by total exposure" — chrome. The
                    table is one row per company and sorts on that column.
                  · "A FUND IS NOT A STOCK and is no longer a row" — chrome. No
                    fund is in the table to contradict it.
                  · the DERIVED fence — load-bearing, and it must not hide behind
                    a fold or a hover: it moved UP, onto the two column headers
                    it is about, where it is on screen whatever this is set to.
                  · the coverage, the five buckets, the AIF block and the clubbed
                    count — load-bearing, each asserted by `check:pages` against
                    a figure derived from `glowData.ts`, and the partition is the
                    claim a reader acts on. They are inside the fold.
                  · the loading / unreachable states — load-bearing, and they are
                    in the SUMMARY: a reader must not have to open anything to
                    learn that the figures beside them cover half the question.

                A COLLAPSED ONE-LINER IS NOT A WALL OF PROSE, and it is the form
                this book already uses for "the rest are NAMED" (see the excluded
                accounts on the NAV card). What the family objected to was seven
                lines of grey under their table; what they must not lose is a
                table that quietly reads as the whole of their money.
              */}
              <summary className="cursor-pointer list-none text-[11px] leading-relaxed text-slate-500 marker:content-['']">
                <span className="text-slate-400">{"\u25B8"} </span>
                {exposure.status === "loading" ? (
                  <span className="text-champagne-400/80">The fund look-through is still loading — the columns
                    below cover the directly-reported half only.</span>
                ) : exposure.status === "unreachable" ? (
                  <span className="text-amber-400/80">The fund look-through store did not answer, so the columns
                    below cover the directly-reported half only. That is a fact about the fetch, not about the
                    book.</span>
                ) : (
                  <>This table covers <span className="font-medium text-slate-400">{money(stockCoverage.total)} of
                    the {money(stockCoverage.nav)} book</span> — what the rest of it sits in</>
                )}
              </summary>
              {exposure.status === "ok" && (
                <p className="mt-2 border-t border-dashed border-ink-700 pt-2 text-[11px] leading-relaxed text-slate-500">
                  That is {money(stockCoverage.measured)} the statements report directly,
                  and {money(stockCoverage.derived)} DERIVED from what {stockCoverage.covered} of
                  your {stockCoverage.considered} fund holdings disclose. A name is clubbed across every account
                  that holds it — the family&rsquo;s own demat and a manager&rsquo;s mandate alike, because both
                  report the share itself
                  {clubbedCount > 0 && <>; {clubbedCount} of {rows.length} rows here are held through more than
                    one account</>}. The rest of the book is not stocks this table can
                  see: {money(stockCoverage.opaque)} sits inside vehicles that publish no holdings at all
                  {stockCoverage.aifCount > 0 && <> ({stockCoverage.aifCount} AIF folio{stockCoverage.aifCount === 1 ? "" : "s"},
                    {" "}{money(stockCoverage.aifValue)} — an AIF files no portfolio disclosure that joins to a folio
                    this family holds, so no future statement fills it)</>}
                  , {money(stockCoverage.unaccounted)} is the part of a disclosed fund that NO LINE in the filing
                  accounted for — its cash sleeve, a gold or silver ETF&rsquo;s metal, and the disclosure&rsquo;s own
                  rounding — and {money(stockCoverage.cash)} is the book&rsquo;s own cash. A scheme&rsquo;s DEBT is no
                  longer in that remainder: the store reads each AMC&rsquo;s whole monthly filing, so its bonds, NCDs
                  and commercial paper are inside the derived figure above. Every figure in the Via funds and Total
                  exposure columns is derived and is no part of the book&rsquo;s NAV: the fund&rsquo;s own value
                  already stands for it there.
                  {stockCoverage.splitNames.count > 0 && (
                    <> {" "}<span className="text-amber-400/80">{stockCoverage.splitNames.count === 1 ? "One company" : `${stockCoverage.splitNames.count} companies`} stands
                      here as {stockCoverage.splitNames.count === 1 ? "two rows" : "more than one row"} ({money(stockCoverage.splitNames.value)}): one issuer CLIPS
                      its name where another spells it out, and the book keys a holding on the name its own statement
                      printed. Their ISINs say they are one security — which is the evidence, and it is also the only
                      thing that could supply the name neither statement prints in full. Joining them on screen would
                      hide that from the reconciler, so it is said here instead — the fix belongs in the extractor.</span></>
                  )}
                </p>
              )}
            </details>
          )}
          {/* The tranche-coverage note ("N of M rows open their Invested figure…")
              was removed from the holdings table at the family's request, a
              declutter. The chevrons it summarised still render — an Invested cell
              with a dated history still opens its contribution breakdown — so
              nothing measurable was lost. `check:pages` asserts the note stays
              gone rather than deleting the check with the prose. */}
          {/*
            THE CLOSED-POSITION NOTE IS GONE TOO, at the family's request —
            it was one of the three grey paragraphs they pointed at.

            It was the right answer while this was the only page that dropped
            them: a reader who knew the family held 3P and could not find it
            would learn the dashboard lost it. The family have since asked for a
            redeemed holding to leave every allocation page AND for this note to
            go with it, so the fact now lives where a redemption belongs — on
            the Transactions card's Capital in and out table as a dated movement
            under Sells, which `monitor-txn-out` asserts. A note here would be an allocation
            page explaining a transaction. `check:pages` INVERTS rather than
            being deleted with it.
          */}
          {/* THE WEIGHT PARAGRAPH IS GONE, and its fact did not go with it.
              *"remove the highlighted text from the dashboard ui"*.

              It explained why the column stops adding to 100 — and that
              explanation was ALREADY on the column it is about, in two places
              that both survive: `weightPlain` is the `plain` line inside every
              Weight cell's own formula popover, and the footer's Weight cell
              carries the same sentence with both figures in its `title`. A
              claim about a column belongs on the column; a paragraph under the
              table was the third copy, and the one a reader had to scroll to.

              `weightGap` therefore keeps its caller (the footer title above) and
              is not left computed into nothing. */}
          {/*
            ── THE FIVE RETURN CAPTIONS ARE GONE, AND WHAT THEY SAID IS ON THE
               COLUMNS ────────────────────────────────────────────────

              *"remove the highlighted text from the dashboard UI."*

            One grey paragraph per ticked measure stood here — five of them on the
            five-measure view, which is what the family screenshotted. Each was
            audited claim by claim before it went, the pattern this file has
            followed since Stage 10aa, and each made exactly two:

              • the REASON the measure is absent on the rows it cannot answer.
                Already per row, and more precisely: `measuredReturn` returns the
                reason and the cell renders an `AbsentCell` carrying it, about the
                row the reader is actually looking at.
              • the COUNT of how much of the table it covers. Stated NOWHERE
                ELSE, and the one a reader acts on — a column of dashes with
                nothing saying why reads as a broken feed. It is in that column's
                own header note now, with the sentence in its hover
                (`returnColumnMeta`), which is where this book puts a claim about
                a column.

            The home for both only exists because each measure got a COLUMN of its
            own in the same change: ask 3 built what ask 2 needed. `check:pages`
            asserts the paragraphs are gone AND that the header carries the count,
            because neither implies the other.
          */}
          {dupGap > 0 && (
            <p className="border-t border-dashed border-ink-700 px-2 py-2 text-[11px] leading-relaxed text-slate-500">
              The rows above show each member's statement as printed. Two holdings are reported under two members,
              so the visible rows sum to {money(rawMV)} while the family total counts each once at {money(totMV)}
              (a {money(dupGap)} overlap). Switch to <span className="font-medium text-slate-400">By security</span> to
              see them consolidated.
            </p>
          )}
        </Card>
      ) : (
        <TransactionsView selected={selected} sector={sector} entity={entity} sectorByKey={sectorByKey}
          axis={txnAxis} section={bucket} />
      )}
    </div>
  );
}

// Roll the constituent positions of one consolidated security up to one row per
// owning entity, so an expanded row shows exactly who holds it and how much.
/**
 * HOW A CLUBBED SECURITY ROW IS ACTUALLY HELD, one row per account.
 *
 * NOT DEDUPED, deliberately. The row's own market value counts each
 * `dedupeGroup` once; this lists every statement as printed — §"a consolidated
 * figure counts each dedupeGroup ONCE; a per-account or per-owner figure does
 * not". `share` therefore divides by the RAW sum of these venues so the column
 * adds to 100%, and the expansion names the gap when the two differ rather than
 * letting a reader divide one printed cell by another and get a third answer.
 */
/**
 * The unit CLASSES a group of positions clubs, or [] where it clubs none.
 *
 * Derived from what is actually in the group rather than from the `clubbed` set
 * that formed it, so a row can never claim a class it does not carry: the two
 * agree by construction and this is the one a figure is struck over.
 */
/**
 * ── A CONTRIBUTION HISTORY IS PER UNIT CLASS ───────────────────────────────
 *
 * `trancheTable` values every tranche as its OWN units at TODAY'S NAV, taken
 * from the position the tranche belongs to. That is right per row whatever the
 * set — and the PANEL makes two further claims that are only true within one
 * class: its footer adds the units up, and its whole point is that a cheaper
 * entry NAV shows a higher return. Two classes are marked at NAVs of their own,
 * so a combined footer states a quantity in no unit and the comparison a reader
 * opens the panel to make stops holding.
 *
 * This was NOT reasoned out in advance — clubbing shipped with one blended
 * panel and `check:pages` failed three of its tranche invariants at once
 * (combined units, monotonicity, and the panel matching the book's largest
 * single history). It is the same rule the clubbed row's own Qty, Avg cost and
 * CMP cells already follow, one level down.
 *
 * Groups are ordered by size so the largest history is the first panel a reader
 * — and the sweep — sees. A class whose statements carry no dated contribution
 * yields no section rather than an empty one.
 */
type TrancheGroup = { cls: string | null; table: TrancheTable; spansEntities: boolean };

function trancheGroupsOf(r: Row, asOf: string): TrancheGroup[] {
  const spans = (t: TrancheTable) => new Set(t.rows.map((x) => x.move.accountId)).size > 1;
  if (!r.fundClasses.length) {
    const table = trancheTable(r.trancheSet, BOOK_POSITION_TRANCHES, "cagr", asOf);
    return table ? [{ cls: null, table, spansEntities: spans(table) }] : [];
  }
  const byClass = new Map<string, Position[]>();
  for (const p of r.trancheSet) {
    const cls = splitFundClass(p.security)?.cls;
    if (!cls) continue;
    (byClass.get(cls) ?? byClass.set(cls, []).get(cls)!).push(p);
  }
  const out: TrancheGroup[] = [];
  for (const [cls, ps] of byClass) {
    const table = trancheTable(ps, BOOK_POSITION_TRANCHES, "cagr", asOf);
    if (table) out.push({ cls, table, spansEntities: spans(table) });
  }
  return out.sort((a, b) => b.table.rows.length - a.table.rows.length || a.cls!.localeCompare(b.cls!));
}

function clubbedClassesOf(ps: Position[]): string[] {
  const cls = new Set<string>();
  for (const p of ps) {
    const f = splitFundClass(p.security);
    if (!f) return [];
    cls.add(f.cls);
  }
  return cls.size > 1 ? [...cls].sort() : [];
}

function venuesOf(ps: Position[], accIdx: AccountIndex): Venue[] {
  const m = new Map<string, Position[]>();
  /**
   * KEYED ON (SECURITY, ACCOUNT), NOT ON THE ACCOUNT ALONE.
   *
   * Identical to the old account-only grouping on every row that carries one
   * security — which is every row but the two clubbed funds. It matters on
   * those: 3P's three classes all sit in ONE folio, so an account-keyed panel
   * would collapse the very classes the row was clubbed to reveal, and the
   * expansion would open onto a single line.
   */
  for (const p of ps) {
    const k = p.securityKey + "\u0000" + p.accountId;
    (m.get(k) ?? m.set(k, []).get(k)!).push(p);
  }
  const built: Venue[] = [...m.values()].map((xs) => {
    const accountId = xs[0].accountId;
    const acc = accIdx.get(accountId);
    const marketValue = sum(xs.map((x) => x.marketValue));
    // `sumOrNull` on the cost, as everywhere: a lot whose statement reports none
    // contributes nothing rather than a zero that would read as free shares.
    const costBasis = sumOrNull(xs.map((x) => x.costBasis));
    const costNA = costBasis === null || (costBasis === 0 && marketValue > 0) || xs.some((x) => x.costUnavailable);
    const pnl = costNA ? null : marketValue - (costBasis as number);
    return {
      accountId, accountNo: acc?.accountNo ?? "",
      cls: splitFundClass(xs[0].security)?.cls ?? null,
      securityKey: xs[0].securityKey,
      // `mandateLabel` is strategy-or-provider, which is the right name for BOTH
      // a mandate ("Aristos Equity Portfolio") and a demat ("Motilal Oswal demat").
      vehicle: mandateLabel(acc),
      owner: ownerOf(accIdx, xs[0]),
      route: ROUTE_LABEL[holdingRoute(engagementOf(accIdx, xs[0]) || null)],
      isMandate: heldUnderMandate(accIdx, xs[0]),
      quantity: sum(xs.map((x) => x.quantity)),
      marketValue, costBasis, unrealizedPnL: pnl,
      returnPct: !costNA && pnl !== null && (costBasis as number) > 0 ? (pnl / (costBasis as number)) * 100 : null,
      costNA, share: 0,
    };
  }).sort((a, b) => b.marketValue - a.marketValue);
  const raw = sum(built.map((v) => v.marketValue));
  for (const v of built) v.share = raw > 0 ? v.marketValue / raw : 0;
  return built;
}

/**
 * WHY AN AGGREGATE HAS NO SUCH RETURN — one sentence per measure, read by the
 * category totals row and by the footer.
 *
 * Both print a CUMULATIVE ON COST figure and neither follows the measure picker:
 * a category and a whole book have no single purchase date to annualise over, no
 * per-holding cash-flow history to solve an XIRR against, and no dated opening
 * value for a year. With a column per measure that has to be SAID rather than
 * left as one figure under a header that could mean any of five things — so the
 * cumulative figure stands under HPR and under `auto`, and every other column
 * renders a dash carrying the reason from here.
 *
 * `auto` and `absolute` are absent from this table on purpose: those two ARE the
 * basis the aggregate is struck on, so asking it for a reason would be asking
 * why a figure it does have is missing.
 */
const AGG_NO_MEASURE: Partial<Record<ReturnMeasure, string>> = {
  cagr: "annualising needs one purchase date and this holds many, bought over years, so a CAGR here would compound a window nothing was held over.",
  xirr: "a money-weighted return needs every dated cash flow of the thing it measures, and no statement reports those per category.",
  ytd: "a year-to-date figure needs this category's value on 1 January, and the earliest statement in this book is dated after the year began.",
  calendar: "a calendar-year return needs its value at both ends of that year, and this book is not dated early enough to carry either.",
};

/**
 * ── WHAT A RETURN COLUMN COVERS, AND WHY IT COVERS NO MORE ────────────────
 *
 *   *"remove the highlighted text from the dashboard UI."*
 *
 * The five paragraphs this replaces sat under the table, one per ticked measure,
 * and each was audited before it went. Every one made TWO claims: a COUNT of how
 * much of the table its measure can answer, and the REASON the rest is absent.
 *
 *   • the REASON already survives per row — `measuredReturn` returns it and the
 *     cell renders an `AbsentCell` carrying it, which is the stronger statement
 *     because it is about the row the reader is looking at;
 *   • the COUNT was stated NOWHERE ELSE, and it is the one a reader acts on: a
 *     column of dashes with nothing saying why reads as a broken feed rather
 *     than as a measurement this book cannot strike.
 *
 * So the count rides in the column header's own note and the reason in its
 * hover — which is where this book puts a claim about a column, and which only
 * became possible when each measure got a column of its own (ask 3 built the
 * home for what ask 2 removed). Returned as ONE object so the short note and
 * the sentence behind it cannot describe different sets.
 *
 * `auto` gets neither: its measure resolves per row, so there is no column-wide
 * count to state and the tag on every cell is what names it. The family asked
 * for that caption gone at Stage 10af and it stays gone.
 */
function returnColumnMeta(measure: ReturnMeasure, cov: ReturnCoverage, asOf: string):
  { note: string; title: string } {
  const year = asOf.slice(0, 4);
  switch (measure) {
    case "cagr":
      return {
        // THE ANNUALISED COUNT, not `shown`: a sub-year holding is SHOWN in this
        // column and shown as its holding-period return, tagged HPR. Reporting
        // it as annualised would be the very claim the guard exists to refuse.
        note: `${cov.cagr} annualised of ${cov.total}`,
        title: `Annualised where a year can be measured — ${cov.cagr} of ${cov.total} rows.`
          + (cov.absolute > 0 ? ` ${cov.absolute} ${cov.absolute === 1 ? "row is" : "rows are"} held under a year and show their total return on cost instead, marked HPR, because annualising a part-year would state a rate for a year the holding has not seen.` : "")
          + (cov.absent > 0 ? ` ${cov.absent} report no purchase date the window could close over — the managed accounts publish a capital-account ledger rather than a lot register, and the depository holdings report no cost.` : ""),
      };
    case "ytd":
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: "YTD is the holding's own return this year, not the share's market move. "
          + (cov.shown > 0
              ? `It is measurable on ${cov.shown} of ${cov.total} rows — the holdings opened during the year, whose whole return since purchase IS their year to date. `
              : "No row can be measured on this drop. ")
          + `The other ${cov.absent} were already held on 1 January, and a year-to-date figure needs their value on that date: the earliest statement in this book is dated after the year began, so there is no opening value to measure from. One holdings statement per account dated on or before 1 January fills it.`,
      };
    case "xirr":
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: `A money-weighted XIRR needs every cash flow for a holding — each tranche's date and amount — and the statements here cover the current period only, so it is absent on all ${cov.total} rows. The per-account money-weighted return is on Performance.`,
      };
    case "calendar":
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: `A calendar-year return needs the holding's value at the start and end of that year, and the book's earliest statement is dated in ${year}, after the current year began — so it is absent on all ${cov.total} rows.`,
      };
    default:
      return {
        note: `${cov.shown} of ${cov.total}`,
        title: `Holding Period Return is the total return on cost since purchase, not annualised. It is shown on ${cov.shown} of ${cov.total} rows`
          + (cov.absent > 0 ? `; the other ${cov.absent} report no cost, so there is nothing to strike a return against.` : "."),
      };
  }
}

/*
 * The local `Th` that stood here is GONE rather than kept beside its
 * replacement. It existed to give a heading a `note` — the coverage count a
 * return column carries — and `SortHeader` now renders that note with the same
 * `data-col-note` markup and the same `noteTitle` hover, while also making the
 * heading sort and drag like every other column's. Two kinds of header on one
 * table is the second-mechanism failure this file keeps naming; the sweep's
 * `returnHead` probe reads `data-col-note` either way.
 */


// Indian fiscal year (Apr 1 – Mar 31) helpers for the transaction date presets.
function fyStartOf(iso: string): number {
  const d = new Date(iso);
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
const fyLabel = (y: number) => `FY${String(y).slice(2)}-${String(y + 1).slice(2)}`;
function quarterBounds(y: number, q: number): { from: string; to: string } {
  if (q === 1) return { from: `${y}-04-01`, to: `${y}-06-30` };
  if (q === 2) return { from: `${y}-07-01`, to: `${y}-09-30` };
  if (q === 3) return { from: `${y}-10-01`, to: `${y}-12-31` };
  return { from: `${y + 1}-01-01`, to: `${y + 1}-03-31` };
}

// The full dated buy/sell tape from the ledger (lazy-loaded when the Transactions
// toggle is first opened). Holdings elsewhere are the NET result of these trades.
// The company / sector / entity filters are global (owned by PortfolioMonitor); this
// view adds its own Buy/Sell side toggle and a date / quarter / fiscal-year range.
/**
 * The Holdings table's two bases. There is no toggle for them any more — the
 * family asked for the consolidated view and only that — but the key still
 * lives in the URL so `?view=entity` reaches the per-statement build, which is
 * the only view in which a class subtotal and the footer can disagree and is
 * therefore the one `check:pages` has to be able to reach.
 */
const HOLDINGS_VIEWS: readonly ViewDef<"security" | "entity">[] = [
  { key: "security", label: "By security" },
  { key: "entity", label: "By entity" },
];

/**
 * ── THE SECTION HEADING, DRAWN THE WAY THE HOLDINGS TABLE DRAWS IT ──────────
 *
 * It carries the same structural handles the Holdings heading does
 * (`data-section`, `data-axis`, `data-subtotal`), because a claim about which
 * section a row sits in must not be struck on prose a redesign may reword.
 *
 * `values` IS A LIST BECAUSE THE SECTION HOLDS TWO KINDS OF MONEY AND THEY ARE
 * NEVER ADDED — what the family paid in, and what their managers spent inside
 * the accounts. Each figure carries its own noun for the reason this page has
 * already paid for twice: `₹34 Cr` beside `3 rows` reads as the section's
 * value, and one heading printing the two as one number would be the ₹70.4 Cr
 * defect `txnLedger.ts` exists to refuse, arriving in a heading.
 */
function TxnSectionHead({ axis, sectionKey, count, values, colSpan, money }: {
  axis: GroupAxis; sectionKey: string; count: string;
  values: { value: number; noun: string }[];
  colSpan: number; money: (v: number) => string;
}) {
  return (
    <tr className="bg-ink-900/50" data-section={sectionKey} data-axis={axis}
      data-subtotal={values.find((v) => v.noun === "in")?.value ?? ""}
      data-subtotal-bought={values.find((v) => v.noun === "bought")?.value ?? ""}>
      <td colSpan={colSpan} className="px-3 py-1.5">
        <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-champagne-500">
          {sectionKey === TXN_UNSECTIONED ? sectionKey : groupLabelFor(axis)(sectionKey)}
          <span className="font-normal normal-case tracking-normal text-slate-500">
            · {count}{values.map((v) => ` · ${money(v.value)} ${v.noun}`).join("")}
          </span>
          {sectionKey === UNCLASSIFIED && (
            <span className="font-normal normal-case tracking-normal text-amber-400/80" title={UNCLASSIFIED_WHY}>
              · the family&rsquo;s review does not list these, so no {axis === "basket" ? "basket" : "asset class"} is stated
            </span>
          )}
          {sectionKey === TXN_UNSECTIONED && (
            <span className="font-normal normal-case tracking-normal text-amber-400/80" title={TXN_UNSECTIONED_WHY}>
              · nothing in this book says what {axis === "category" ? "kind of thing" : "class"} these are
            </span>
          )}
        </span>
      </td>
    </tr>
  );
}

/**
 * ── ONE TABLE, AND THE TWO MONEY BLOCKS THAT MUST NEVER BE ADDED ────────────
 *
 *   *"why are there 'capital in and out/trades' toggle switch provided when…
 *    There is no need of that… Show all the data in the same table just like as
 *    it is in the holding page."*
 *
 * The card carried a TOGGLE between the family's own dated capital and their
 * managers' dealing, and the two are one row set now — see `txnLedger.ts` for
 * the merge and for what it measured. The columns are what carry the
 * distinction the toggle used to:
 *
 *   name                                    what this row is the record OF
 *   how · Capital in · out · Net · Invested on     THE FAMILY'S OWN MONEY
 *   Trades · Bought · Sold · Realized · Traded between   THE MANAGER'S DEALING
 *   Value today · Return                    what the ACCOUNT is worth, and on what
 *   Entity                                  whose it is
 *
 * The two money blocks are adjacent and never summed. THREE rows in this book
 * carry both records, and adding the ₹70.4 Cr their managers spent to the
 * ₹221.5 Cr the family paid in would print ₹291.9 Cr under a column a reader
 * takes for what they put in — all three of those the page's own printed
 * total. Each column totals down its own block into its own footer cell, and a
 * cell whose row has no half to fill it renders `AbsentCell` WITH THE REASON
 * rather than a zero. See `txnLedger.ts` for how that was measured, and for
 * what the first measurement of it got wrong.
 *
 * ── WHAT THE MERGE COST, SAID PLAINLY ───────────────────────────────────────
 *
 * The trades table had a Net invested of its own (bought less sold) and there
 * is one Net column now, which is the FAMILY'S — paid in less taken out. Two
 * nets under one heading is a column meaning two things, and two net columns is
 * one more for a subtraction of two adjacent cells a reader can do by eye. So
 * the trades net is gone from the row and is absent with its reason wherever a
 * row carries no capital record. That is the ONE thing the merge dropped.
 *
 * GAIN IS NOT, AND THE FIRST CUT OF THIS DROPPED IT. Value today, Gain and
 * Return are the three the family asked for together, and the sweep caught it
 * by name — its Return check requires the CONDITION to be stated on both the
 * Gain and the Return heads, because a reader meeting the first dash has to
 * find it somewhere. Losing a figure in a layout change is exactly what this
 * paragraph exists to make impossible to do quietly.
 */
const DATED_COLS = ["name", "how", "in", "out", "net", "investedOn",
  "trades", "bought", "sold", "realised", "traded", "value", "gain", "return", "entity"] as const;
/** The dated rows inside an expanded row's capital half. */
const MINE_MOVE_COLS = ["date", "type", "bought", "sold", "units", "security"] as const;
/** ...and inside its trades half, one line per security the manager dealt. */
const DEALT_COLS = ["security", "trades", "bought", "sold", "net", "realised", "period"] as const;

/**
 * WHY A MONEY CELL IS EMPTY, per block — the two halves of the merged row.
 *
 * Each names the DOCUMENT that would fill it rather than saying "no data",
 * because the two send a reader to completely different places: one is a
 * capital-account ledger from the fund, the other a transaction statement from
 * the manager, and a row missing one is not a row that is broken.
 */
const NO_CAPITAL_WHY =
  "no statement for this row reports the family's own dated capital — the managed mandates issue a capital-account "
  + "ledger rather than dated allotments, and a depository records what is held and never what was paid for it";
const NO_TRADES_WHY =
  "no transaction statement covers this row, so what was dealt inside it over the window was never reported dated";

/**
 * ── WHAT THE MANAGER DEALT INSIDE ONE ROW ──────────────────────────────────
 *
 *   *"after clicking on that row we should be able to see drop down of all the
 *    transactions within that PMS. Stream should be applicable to all of the
 *    categories be it direct equity or AIFs."*
 *
 * Two levels, unchanged from the table this was lifted out of: one line per
 * SECURITY — which is where a staggered series collapses, by construction
 * rather than by pattern-matching a rhythm — opening into the dated rows
 * themselves.
 *
 * It is a table of its own inside the expanded row rather than indented rows in
 * the table above, because the columns it needs are the trades block's and not
 * the fourteen the row carries. `data-row="instrument"` and `data-row="tranche"`
 * ride on it exactly as they did, so every claim about a collapsed line still
 * carrying its dated rows is struck on the same handles.
 */
function DealtInside({ group, rowKey, open, toggle, sort, money }: {
  group: GroupRow; rowKey: string; open: Set<string>; toggle: (k: string) => void;
  sort: TxnSort; money: (v: number) => string;
}) {
  const { fmtFromBase } = usePortfolio();
  const period = (a: string, b: string) => (a && b ? (a === b ? fmtDate(a) : `${fmtDate(a)} → ${fmtDate(b)}`) : "");
  const netOf = (g: { buys: number; sells: number; bought: number | null; sold: number | null }) => {
    const b = g.buys === 0 ? 0 : g.bought;
    const s = g.sells === 0 ? 0 : g.sold;
    return b == null || s == null ? null : b - s;
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800" data-dealt-panel={rowKey}>
      <SortableTable className="min-w-full text-[12px]" storageKey="monitor-dealt" columns={DEALT_COLS}>
        {(dv) => (<>
        <thead>
          <Tr view={dv} className="border-b border-ink-700/70">
            <SortHeader col="security" view={dv} align="left" pad="px-3 py-1.5">Security</SortHeader>
            <SortHeader col="trades" view={dv} pad="px-3 py-1.5">Trades</SortHeader>
            <SortHeader col="bought" view={dv} pad="px-3 py-1.5">Bought</SortHeader>
            <SortHeader col="sold" view={dv} pad="px-3 py-1.5">Sold</SortHeader>
            <SortHeader col="net" view={dv} pad="px-3 py-1.5">Net</SortHeader>
            <SortHeader col="realised" view={dv} pad="px-3 py-1.5">Realized P&amp;L</SortHeader>
            <SortHeader col="period" view={dv} align="left" pad="px-3 py-1.5">Traded between</SortHeader>
          </Tr>
        </thead>
        <tbody className="divide-y divide-ink-700/50">
          {sortRows(group.instruments, dv.sort, {
            security: (i) => i.security,
            trades: (i) => i.buys + i.sells,
            bought: (i) => (i.buys === 0 ? null : i.bought),
            sold: (i) => (i.sells === 0 ? null : i.sold),
            net: (i) => netOf(i),
            realised: (i) => i.realized,
            period: (i) => i.first,
          }).map((ins) => {
            const iKey = `${rowKey}::${ins.key}`;
            const iOpen = open.has(iKey);
            const iNet = netOf(ins);
            return (
              <Fragment key={iKey}>
                <Tr view={dv} data-row="instrument" data-staggered={ins.staggered ? "1" : undefined}
                  data-days={ins.days} className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(iKey)}>
                  <td className="py-1.5 pl-3 pr-3">
                    <div className="flex items-center gap-1.5">
                      <ChevronRight className={`h-3 w-3 shrink-0 text-slate-600 transition-transform ${iOpen ? "rotate-90" : ""}`} />
                      <div>
                        <span className="text-slate-200">{ins.security}</span>
                        {/* A LABEL ON A ROW THAT IS ALREADY COLLAPSED, never a
                            decision about what to merge — see txnRollup.ts. */}
                        {ins.staggered && <span className="ml-1.5"><Pill tone="info"><span title={`Built up over ${ins.days} trading days rather than in one go — expand for every tranche and its date.`}>staggered · {ins.days} days</span></Pill></span>}
                        {/* NET UNITS BELONG UNDER THE NAME, not under a heading
                            that describes something else. */}
                        <div className="mono text-[10.5px] text-slate-500">{fmtNum(Math.round(ins.qtyBought - ins.qtySold))} units net</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right mono text-slate-400">{fmtNum(ins.buys + ins.sells)}<span className="ml-1 text-[10.5px] text-slate-500">{ins.buys}B/{ins.sells}S</span></td>
                  <td className="px-3 py-1.5 text-right mono text-slate-400">{ins.bought == null ? <AbsentCell reason="no buy row for this security reports a settled amount" /> : money(ins.bought)}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-400">{ins.sells === 0 ? <AbsentCell reason="this security was not sold over the window" /> : ins.sold == null ? <AbsentCell reason="no sell row for this security reports a settled amount" /> : money(ins.sold)}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-300">{iNet == null ? <AbsentCell reason="one side reports no settled amount, so a net cannot be struck" /> : fmtFromBase(iNet, { compact: true, sign: true })}</td>
                  <td className={`px-3 py-1.5 text-right mono ${ins.realized == null ? "text-slate-600" : changeColor(ins.realized)}`}>
                    {ins.realized == null
                      ? <AbsentCell reason={ins.sells === 0 ? "this security was not sold over the window" : "no capital gain statement covers this account, so what these sales realised was never reported"} />
                      : fmtFromBase(ins.realized, { compact: true, sign: true })}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap mono text-[11px] text-slate-500">{period(ins.first, ins.last)}</td>
                </Tr>
                {iOpen && ins.tranches.map((t, i) => (
                  /* EVERY FIGURE UNDER A HEADING THAT DESCRIBES IT. A tranche's
                     settled amount goes in Bought or Sold by its own SIDE, so
                     the column it lands in is true of it; quantity and unit
                     price ride with the date, because no header here means
                     either. Drawn across the columns by position instead, a
                     buy's per-share price printed under "Bought". */
                  <Tr view={dv} data-row="tranche" key={`${iKey}::${i}`} className="bg-ink-900/50">
                    <td className="py-1 pl-9 pr-3 whitespace-nowrap">
                      <span className="mono text-slate-400">{fmtDate(t.date)}</span>
                      <span className="ml-2"><Pill tone={t.side === "Buy" ? "info" : "warn"}>{t.side}</Pill></span>
                      <span className="ml-2 mono text-slate-500">
                        {fmtNum(Math.round(t.qty))} @ {t.price == null ? <AbsentCell reason="this trade row reports no unit price on its statement" /> : fmtFromBase(t.price)}
                      </span>
                    </td>
                    <td className="px-3 py-1" />
                    <td className="px-3 py-1 text-right mono text-slate-400">
                      {t.side !== "Buy" ? "" : t.amount == null ? <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" /> : money(t.amount)}
                    </td>
                    <td className="px-3 py-1 text-right mono text-slate-400">
                      {t.side !== "Sell" ? "" : t.amount == null ? <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" /> : money(t.amount)}
                    </td>
                    <td className="px-3 py-1" />
                    <td className={`px-3 py-1 text-right mono ${t.realized == null ? "text-slate-600" : changeColor(t.realized)}`}>{t.realized == null ? <AbsentCell reason={t.realizedNote ?? "no capital gain statement covers this account, so what this sale realised was never reported"} /> : fmtFromBase(t.realized, { compact: true, sign: true })}</td>
                    <td className="px-3 py-1 whitespace-nowrap text-slate-500">{t.account}</td>
                  </Tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        </>)}
      </SortableTable>
    </div>
  );
}

/**
 * ── THE TRANSACTIONS CARD, SECTIONED THE WAY THE HOLDINGS TABLE IS ──────────
 *
 *   *"the format of the transactions page and the holdings page is very
 *    different… UI of both the pages should be standardized so it is not
 *    confusing and easy to use for the user."*  …  *"In short, just remove the
 *    toggle button and show everything within the same table. Based on
 *    different categories or asset classes. Or. Baskets."*
 *
 * WHAT WAS DIFFERENT, ITEM BY ITEM, AND WHAT EACH BECAME:
 *
 *   five tabs mixing two sources with three groupings and a raw list
 *                                    → the SHARED axis control (Category /
 *                                      Asset class / Basket) on the same filter
 *                                      row as the Holdings one, reading the same
 *                                      `?group=` param;
 *   a toggle between the two SOURCES → gone; both are one row set, and the two
 *                                      MONEY BLOCKS are what keep them apart
 *                                      (`txnLedger.ts`);
 *   no section headings at all       → the same headings, the same order, the
 *                                      same `data-section` handles;
 *   its own section filter (none)    → the Holdings section filter, shared;
 *   "Paid in / Taken out"            → "Buys / Sells", the words the family
 *                                      asked for, and the columns follow;
 *   three sort modes                 → two, "Longest held" removed by request;
 *   size-ordered by default          → recent first, which it already was.
 *
 * ── A ROW IS WHAT THE HOLDINGS TABLE'S ROW IS, PER SECTION ─────────────────
 *
 * `rollup(..., "auto", ...)` rolls a trade up to its MANDATE where a
 * discretionary manager chose it and to its SECURITY everywhere else — which is
 * exactly how the Holdings table builds its rows. `capitalRollup` is per
 * ACCOUNT, which is the same key for a mandate. So "Carnelian Bespoke
 * Portfolio" is one row on both tables, Fractal Analytics is one row on both,
 * and a mandate that publishes a capital record AND a transaction statement is
 * ONE row carrying both — which is what the family asked to be able to open.
 */
function TransactionsView({ selected, sector, entity, sectorByKey, axis, section }: {
  selected: Set<string>; sector: string; entity: string; sectorByKey: Map<string, string>;
  axis: GroupAxis; section: string;
}) {
  // `statementPortfolio`, for the ACCOUNT REGISTRY and the section join only —
  // the rollup joins a trade to its mandate on provider + account number. No
  // figure on this tape comes from the portfolio, and none may: a dated trade is
  // a statement fact and a live price is not evidence about it.
  const { fmtFromBase, statementPortfolio: portfolio } = usePortfolio();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [txns, setTxns] = useState<Txn[] | null>(null);
  /**
   * WHICH SIDE OF THE RECORD IS IN VIEW — one state, read by both halves.
   *
   * It is kept in the DIRECTION vocabulary (`in`/`out`) because the capital
   * half's movements are genuinely a direction and not a trade side; the
   * LABELS are Buys and Sells, which the family asked for, and the tape maps
   * the direction to `Buy`/`Sell` at the point it filters.
   */
  const [side, setSide] = useState<CapitalSide>("all");
  /**
   * HOW THE ROWS ARE ORDERED — recent first, and the reader can change it.
   *
   * *"by default the transactions show from newest to oldest."* One state, read
   * at every level, so a row can never open on its oldest movement under a card
   * set to newest first — `src/lib/txnSort.ts` is where the modes are defined,
   * and "Longest held" came out of it at the family's request.
   */
  const [sort, setSort] = useState<TxnSort>("recent");
  const [openRow, setOpenRow] = useState<Set<string>>(new Set());
  const [openInstrument, setOpenInstrument] = useState<Set<string>>(new Set());
  const toggle = (set: (f: (s: Set<string>) => Set<string>) => void, key: string) =>
    set((prev) => { const nx = new Set(prev); if (nx.has(key)) nx.delete(key); else nx.add(key); return nx; });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState("all");

  useEffect(() => {
    let alive = true;
    loadTransactions().then((d) => {
      if (!alive) return;
      if (!d) { setStatus("error"); return; }
      setTxns(d.txns); setStatus("ready");
    });
    return () => { alive = false; };
  }, []);

  // Fiscal years spanned by BOTH records, newest first — drives the quarter/FY
  // presets. Both, because a range offered over the tape alone would silently
  // cut the capital record's older contributions out of every preset.
  const fyYears = useMemo(() => {
    const dates = [...(txns ?? []).map((t) => t.date), ...BOOK_CAPITAL_MOVES.map((m) => m.date)].filter(Boolean);
    let mn = Infinity, mx = -Infinity;
    for (const d of dates) { const y = fyStartOf(d); if (y < mn) mn = y; if (y > mx) mx = y; }
    if (!isFinite(mn)) return [] as number[];
    const out: number[] = [];
    for (let y = mx; y >= mn; y--) out.push(y);
    return out;
  }, [txns]);
  const applyPreset = (key: string) => {
    setPreset(key);
    if (key === "all") { setFrom(""); setTo(""); return; }
    const fy = key.match(/^fy:(\d+)$/);
    if (fy) { const y = +fy[1]; setFrom(`${y}-04-01`); setTo(`${y + 1}-03-31`); return; }
    const q = key.match(/^q:(\d+):(\d)$/);
    if (q) { const b = quarterBounds(+q[1], +q[2]); setFrom(b.from); setTo(b.to); }
  };
  const onDate = (which: "from" | "to", v: string) => {
    if (which === "from") setFrom(v); else setTo(v);
    setPreset("custom");
  };

  /**
   * THE SECTION JOIN, BUILT ONCE. `groupKeyFor` still answers which section a
   * record lands in; this is the join that lets a dated row reach it — see
   * `txnAxis.ts`. Both halves read the SAME instance, so an account's capital
   * record and its manager's dealing cannot be filed under two headings.
   */
  const accountsReg = portfolio?.accounts ?? [];
  const positionsReg = portfolio?.positions ?? [];
  const sections = useMemo(() => sectionsFor(accountsReg, positionsReg), [accountsReg, positionsReg]);
  const accIdx = useMemo(() => accountIndex(accountsReg), [accountsReg]);
  /**
   * WHAT AN ACCOUNT IS WORTH TODAY — one expression, read for every account row
   * whether or not it publishes a capital record. `capitalRollup` computes the
   * same sum for the rows it builds, and `txnLedger.test.ts` asserts the two
   * agree; a second, drifting definition of "what this account holds" is the
   * failure `holdingBucket` and `companyExposure` were each extracted to stop.
   */
  const valueOfAccount = useMemo(() => {
    const by = new Map<string, number>();
    for (const p of positionsReg) by.set(p.accountId, (by.get(p.accountId) ?? 0) + p.marketValue);
    return (id: string) => by.get(id) ?? 0;
  }, [positionsReg]);

  /**
   * THE FAMILY'S OWN MOVEMENTS IN VIEW — filtered ONCE, here. The side is NOT
   * applied to this count: the counter above the table states both sides, so a
   * reader can see what the filter would do before they click it.
   */
  const mineMoves = useMemo(() => BOOK_CAPITAL_MOVES.filter((m) => {
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    if (entity !== "All") {
      const a = accIdx.get(m.accountId);
      if (!a || ownerDisplayName(a.ownerId) !== entity) return false;
    }
    return true;
  }), [from, to, entity, accIdx]);
  const mineCount = useMemo(() => ({
    in: mineMoves.filter((m) => m.direction === "in").length,
    out: mineMoves.filter((m) => m.direction === "out").length,
  }), [mineMoves]);
  const mineAll = useMemo(
    () => capitalRollup(mineMoves, accountsReg, positionsReg, BOOK_POSITION_TRANCHES, side, sort),
    [mineMoves, accountsReg, positionsReg, side, sort]);
  /**
   * THE SECTION FILTER NARROWS THE ROWS, not the sectioning: a reader who picks
   * "AIF" is asking this table for its AIF rows, exactly as they would be asking
   * the Holdings table.
   */
  const mineGroups = useMemo(
    () => (section === "All" ? mineAll : mineAll.filter((g) => sections.forAccount(axis, g.accountId) === section)),
    [mineAll, section, sections, axis]);

  const filtered = useMemo(() => {
    if (!txns) return [];
    return txns.filter((t) =>
      (side === "all" || t.side === (side === "in" ? "Buy" : "Sell")) &&
      // Matched on the CANONICAL owner, not on the account label: the label
      // prints the owner's name as that statement spelled it ("Ajay Thakurdas
      // Jaisinghani"), and the filter offers the canonical one ("Ajay
      // Jaisinghani"). Comparing the two strings never matches, which would
      // empty the tape the moment anyone filtered by entity.
      (entity === "All" || ownerDisplayName(t.ownerId) === entity) &&
      (sector === "All" || sectorByKey.get(t.securityKey) === sector) &&
      (selected.size === 0 || selected.has(t.security)) &&
      // THE SHARED SECTION FILTER, applied to the tape on the shared axis —
      // the same control the Holdings table narrows on, so "show me the AIF"
      // means the same thing on both.
      (section === "All" || sections.forTxn(axis, t) === section) &&
      (!from || t.date >= from) &&
      (!to || t.date <= to));
  }, [txns, side, entity, sector, sectorByKey, selected, section, sections, axis, from, to]);
  /**
   * ABOVE THE EARLY RETURNS, AND THAT IS NOT STYLE. These sat below the
   * `status === "loading"` guard at first, so the first render ran fewer hooks
   * than the second and React tore the page down with error #310 — a blank
   * "Something went wrong" over a tape that had loaded perfectly. A hook after
   * a conditional return is a hook that sometimes does not run.
   */
  const tradeGroups = useMemo(
    () => rollup(filtered, accountsReg, "auto", sort, (t) => sections.forTxn(axis, t)),
    [filtered, accountsReg, sort, sections, axis]);
  const rows = useMemo(
    () => mergeDatedRecords(mineGroups, tradeGroups, (id) => sections.forAccount(axis, id), valueOfAccount, sort),
    [mineGroups, tradeGroups, sections, axis, valueOfAccount, sort]);
  const secs = useMemo(
    () => datedSectionRollup(rows, (keys) => orderSections(axis, keys)), [rows, axis]);
  const totals = useMemo(() => datedTotals(rows), [rows]);

  if (status === "loading") return <Card className="flex min-h-0 flex-1 items-center justify-center"><span className="text-sm text-slate-500">Loading transactions…</span></Card>;
  if (status === "error") {
    return (
      <Card className="flex min-h-0 flex-1 items-center justify-center">
        <AbsentSection what="The audit archive didn't respond"
          needs="This tape reads the extracted transaction statements from /audit. That request didn't come back — refresh to retry. The archive is served alongside the app, so this is the archive being unreachable rather than your session being stale." />
      </Card>
    );
  }

  const money = (v: number) => fmtFromBase(v, { compact: true });
  const period = (a: string, b: string) => (a && b ? (a === b ? fmtDate(a) : `${fmtDate(a)} → ${fmtDate(b)}`) : "");
  /**
   * WHOSE MONEY A ROW IS. An ACCOUNT row takes the registry's canonical owner,
   * which is the name the entity filter offers; a SECURITY row is an instrument
   * dealt across however many accounts carried it, so its entities are read off
   * the dated rows themselves and NAMED rather than reduced to the first.
   */
  const entitiesOf = (r: DatedRow): string[] => {
    if (r.accountId) { const n = ownerDisplayName(accIdx.get(r.accountId)?.ownerId ?? null); return n ? [n] : []; }
    const names = new Set<string>();
    for (const ins of r.trades?.instruments ?? []) for (const t of ins.tranches) {
      const n = ownerDisplayName(t.ownerId); if (n) names.add(n);
    }
    return [...names].sort();
  };

  return (
    /*
      ONE CARD, ONE TABLE, SCROLLING ITSELF — the Holdings view's own layout.
      `position: sticky` resolves against the nearest SCROLLING ancestor, and
      with one table on screen there is one sticky header, so the card takes the
      space (`min-h-0 flex-1`) exactly as the Holdings card beside it does.
    */
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} max={to || undefined} onChange={(e) => onDate("from", e.target.value)} title="From date"
            className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus" />
          <span className="text-slate-500">→</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => onDate("to", e.target.value)} title="To date"
            className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus" />
        </div>
        <select value={preset} onChange={(e) => applyPreset(e.target.value)} title="Jump to a quarter or fiscal year"
          className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus">
          <option value="all">All dates</option>
          <option value="custom" disabled>Custom range</option>
          {fyYears.map((y) => (
            <optgroup key={y} label={fyLabel(y)}>
              <option value={`fy:${y}`}>{fyLabel(y)} — full year</option>
              <option value={`q:${y}:1`}>Q1 {fyLabel(y)} · Apr–Jun</option>
              <option value={`q:${y}:2`}>Q2 {fyLabel(y)} · Jul–Sep</option>
              <option value={`q:${y}:3`}>Q3 {fyLabel(y)} · Oct–Dec</option>
              <option value={`q:${y}:4`}>Q4 {fyLabel(y)} · Jan–Mar</option>
            </optgroup>
          ))}
        </select>
        {/*
          ONE FILTER, ONE VOCABULARY — AND IT IS THE FAMILY'S.

            *"Paid in/Taken Out filters should be renamed as buys and sells."*

          It used to say one thing over the capital record and another over the
          tape, which was defensible on its own terms (a family movement has no
          buy and no sell; it has money in and money out) and was half of the
          "different categorization names" the family were pointing at. One pair
          of words now, over one table, and the columns beneath say the same —
          the statement's own word for a movement survives where exactness
          belongs, in the Type column inside an expanded row.
        */}
        <div className="inline-flex rounded-md border border-ink-700 bg-ink-800 p-0.5 text-xs"
          data-side-filter={side}
          title="Buys are money going in — a share bought, a fund subscribed. Sells are money coming back — a share sold, units redeemed. It narrows both halves of the table together.">
          {(["all", "in", "out"] as const).map((v) => (
            <button key={v} type="button" data-side-option={v} onClick={() => setSide(v)}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${side === v ? "bg-ink-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {v === "all" ? "All" : v === "in" ? "Buys" : "Sells"}
            </button>
          ))}
        </div>
        {/*
          ── THE ORDER IS A CONTROL, NOT A DECISION THIS CARD MAKES FOR THEM ──

            *"by default the transactions show from newest to oldest… And the
             toggle switch of recent first/largest first… remove longest first
             filter."*

          Recent first is the default and the size ordering is the one
          alternative. One state, read at every level, so nothing on this page
          can be ordered one way while something nested in it is ordered
          another. `data-txn-sort` is the handle the sweep reads: a claim about
          WHICH ORDER a table is in must not be struck on the label of a button
          a redesign is free to reword.
        */}
        <div className="inline-flex rounded-md border border-ink-700 bg-ink-800 p-0.5 text-xs"
          data-txn-sort={sort} data-txn-sort-options={TXN_SORTS.map((o) => o.id).join(",")}
          title="How the rows below are ordered. Recent first is the default; it applies to the table and to the lists inside each row.">
          {TXN_SORTS.map((o) => (
            <button key={o.id} type="button" data-txn-sort-option={o.id} title={o.title} onClick={() => setSort(o.id)}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${sort === o.id ? "bg-ink-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {o.label}
            </button>
          ))}
        </div>
        {/*
          A COUNTER MUST COUNT WHAT IS ON SCREEN, AND BOTH RECORDS NOW ARE.

          It read the manager's TAPE on every view once, so the family's own
          capital sat under "284 buys · 178 sells" — a count of a set it did not
          draw; then it counted the ACTIVE branch of a toggle. With one table
          over both it counts both, and NAMES which is which, because a
          contribution is not a buy and one number over the two would be the
          ₹13.51 Cr defect arriving in a counter.
        */}
        <span className="ml-auto text-xs text-slate-500" data-txn-counter>
          Capital {mineCount.in.toLocaleString("en-IN")} in · {mineCount.out.toLocaleString("en-IN")} out
          <span className="mx-1.5 text-slate-600">|</span>
          Trades {filtered.filter((t) => t.side === "Buy").length.toLocaleString("en-IN")} buys · {filtered.filter((t) => t.side === "Sell").length.toLocaleString("en-IN")} sells
        </span>
      </div>

      {/* SHORT, AND BOTH CLAIMS LOAD-BEARING. The family have trimmed the grey
          block under a table more than once; what cannot go is what the ROW IS
          and that the two money blocks are NEVER ADDED, because one table makes
          adding them a one-line edit. */}
      <Card pad={false} title="Transactions"
        subtitle="One row per mandate, fund or security, sectioned the way the holdings are. The Capital columns are the family's own money; the Trades columns are what their managers dealt inside those accounts. The two are never added."
        className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <SortableTable className="min-w-full text-sm" data-dated-table
            storageKey="monitor-dated" columns={DATED_COLS}>
            {(dv) => { const COLS = dv.order.length; return (<>
            <thead className="sticky top-0 z-10 bg-ink-800">
              <Tr view={dv} className="border-b border-ink-700">
                <SortHeader col="name" view={dv} align="left" pad="px-3 py-2.5">{GROUP_COLUMN_HEAD[axis]}</SortHeader>
                {/* ── THE CAPITAL BLOCK: the family's own money ─────────────── */}
                <SortHeader col="how" view={dv} pad="px-3 py-2.5"
                  title="Whether the family's money went in as one payment or several. It is a COUNT of dated contributions, not a judgement about them: one is a lumpsum, more than one is staggered.">How it went in</SortHeader>
                <SortHeader col="in" view={dv} pad="px-3 py-2.5"
                  title="Money the family put into this account — a subscription, a drawdown or a top-up, as the statement types it. NEVER what a manager spent inside it, which is the Bought column.">Capital in</SortHeader>
                <SortHeader col="out" view={dv} pad="px-3 py-2.5"
                  title="Money that came back out of this account — a redemption or a payout, as the statement types it.">Capital out</SortHeader>
                <SortHeader col="net" view={dv} pad="px-3 py-2.5"
                  title="Capital in less capital out — the family's own money at work in this account, as reported.">Net invested</SortHeader>
                <SortHeader col="investedOn" view={dv} align="left" pad="px-3 py-2.5"
                  title="The date each contribution carries on the statement that reports it — the movement's own date, never the statement's report date. A single date means the account was funded once; a range spans the first payment to the last.">Invested on</SortHeader>
                {/* ── THE TRADES BLOCK: what a manager dealt inside ─────────── */}
                <SortHeader col="trades" view={dv} pad="px-3 py-2.5"
                  title="Dated buys and sells the transaction statements report inside this row. Never the family's own payments, which are the How-it-went-in column.">Trades</SortHeader>
                <SortHeader col="bought" view={dv} pad="px-3 py-2.5"
                  title="What was spent buying securities inside this row, over the trades that report a settled amount. This is money moving about INSIDE an account and is not added to Capital in.">Bought</SortHeader>
                <SortHeader col="sold" view={dv} pad="px-3 py-2.5"
                  title="What securities sold for inside this row, over the trades that report a settled amount.">Sold</SortHeader>
                <SortHeader col="realised" view={dv} pad="px-3 py-2.5">Realized P&amp;L</SortHeader>
                <SortHeader col="traded" view={dv} align="left" pad="px-3 py-2.5"
                  title="First to last dated trade the statements report for this row. The dealing window — not when the family put money in, which is Invested on.">Traded between</SortHeader>
                {/* ── AND WHAT THE ACCOUNT IS WORTH, on either record ───────── */}
                <SortHeader col="value" view={dv} pad="px-3 py-2.5"
                  title="The account's own market value from the book — the same figure the holdings tables carry for it, not a value re-derived from what was paid in.">Value today</SortHeader>
                <SortHeader col="gain" view={dv} pad="px-3 py-2.5"
                  title="Value today less net invested, struck only where the contribution list provably reaches the account's inception — either the allotted units account for every unit held, or the statement's own printed inception date is on or after the first contribution. A gain against a partial record of what was paid in overstates itself by everything it missed.">Gain</SortHeader>
                <SortHeader col="return" view={dv} pad="px-3 py-2.5"
                  title="Value today against net invested, struck only where the contribution list provably reaches the account's inception — either the allotted units account for every unit held, or the statement's own printed inception date is on or after the first contribution. A return against a partial record of what was paid in overstates itself by everything it missed.">Return</SortHeader>
                <SortHeader col="entity" view={dv} align="left" pad="px-3 py-2.5">Entity</SortHeader>
              </Tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {secs.map((sec) => (
                <Fragment key={sec.key}>
                  {/* ONE HEADING PER SECTION, and only where there is more than
                      one to tell apart — a single heading over a table that is
                      already one section is chrome, which is what the Holdings
                      table does too. */}
                  {secs.length > 1 && (
                    <TxnSectionHead axis={axis} sectionKey={sec.key} colSpan={COLS} money={money}
                      count={`${sec.rows.length} ${sec.rows.length === 1 ? "row" : "rows"}`}
                      values={[
                        ...(sec.totals.contributions > 0 ? [{ value: sec.totals.paidIn, noun: "in" }] : []),
                        ...(sec.totals.bought != null ? [{ value: sec.totals.bought, noun: "bought" }] : []),
                      ]} />
                  )}
                  {/* THE READER'S RANKING, WITHIN THE SECTION. Sorting across
                      sections would break the sectioning this card exists to
                      share with the holdings table; a section is a partition of
                      the same list, so ranking inside each one is the same
                      ordering the card's own Recent/Largest control produces. */}
                  {sortRows(sec.rows, dv.sort, {
                    name: (r) => r.label,
                    how: (r) => r.capital?.contributions ?? null,
                    in: (r) => (r.capital && r.capital.contributions > 0 ? r.capital.paidIn : null),
                    out: (r) => (r.capital && r.capital.withdrawals > 0 ? r.capital.tookOut : null),
                    net: (r) => r.capital?.net ?? null,
                    investedOn: (r) => r.capital?.first ?? null,
                    trades: (r) => r.trades?.trades ?? null,
                    bought: (r) => (r.trades && r.trades.buys > 0 ? r.trades.bought : null),
                    sold: (r) => (r.trades && r.trades.sells > 0 ? r.trades.sold : null),
                    realised: (r) => r.trades?.realized ?? null,
                    traded: (r) => r.trades?.first ?? null,
                    value: (r) => r.value,
                    gain: (r) => r.capital?.gain ?? null,
                    return: (r) => r.capital?.returnPct ?? null,
                    entity: (r) => entitiesOf(r)[0] ?? null,
                  }).map((r) => {
                    const isOpen = openRow.has(r.key);
                    const cap = r.capital;
                    const trd = r.trades;
                    const ents = entitiesOf(r);
                    return (
                      <Fragment key={r.key}>
                        {/*
                          EVERY STRUCTURAL CLAIM ABOUT THIS ROW RIDES ON A
                          HANDLE, never on the prose in a cell. `data-mine-row`
                          and `data-row="group"` are the two the sweep has
                          always read, and a merged row carries whichever halves
                          it actually has — so "this row carries the family's
                          capital record for account X" and "this row carries a
                          trades group" stay exactly as true and exactly as
                          countable as they were before the merge.
                        */}
                        <Tr view={dv} data-dated-row={r.key} data-dated-kind={r.kind}
                          data-dated-section={sec.key} data-dated-label={r.label}
                          data-dated-first={r.first} data-dated-last={r.last}
                          data-mine-row={cap ? r.accountId : undefined}
                          data-mine-contributions={cap ? cap.contributions : undefined}
                          data-mine-withdrawals={cap ? cap.withdrawals : undefined}
                          data-mine-section={cap ? sec.key : undefined}
                          data-mine-first={cap ? cap.first : undefined}
                          data-mine-last={cap ? cap.last : undefined}
                          data-row={trd ? "group" : undefined}
                          data-trades={trd ? trd.trades : undefined}
                          data-group-section={trd ? sec.key : undefined}
                          data-group-kind={trd ? (r.kind === "account" ? "mandate" : "security") : undefined}
                          data-group-label={trd ? r.label : undefined}
                          className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(setOpenRow, r.key)}>
                          <td className="px-3 py-2.5">
                            {/*
                              ONE AFFORDANCE, AND THE ROW IS IT.

                              *"remove the drill down pages for transactions
                              page in portfolio monitor… since they're empty."*

                              The name used to link to `/mandate/:accountId`, and
                              MEASURED, eight of the eleven funded rows are FUND
                              FOLIOS for which that page can only say it is not a
                              mandate and draw an empty dealing card beneath. A
                              link a reader is invited to follow into nothing is
                              worse than no link; the mandates keep their page
                              and it is simply not reached from here.
                            */}
                            <div className="flex items-center gap-1.5">
                              <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                              <div>
                                <div data-mine-name={r.accountId ?? undefined} className="font-medium text-slate-100">{r.label}</div>
                                {r.sublabel && <div className="text-[10.5px] text-slate-500">{r.sublabel}</div>}
                              </div>
                            </div>
                          </td>
                          {/* ── CAPITAL ───────────────────────────────────── */}
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {!cap
                              ? <AbsentCell reason={NO_CAPITAL_WHY} />
                              : side === "out"
                                // "Lumpsum or staggered" is a fact about how the
                                // money went IN. Under a Sells filter there is no
                                // contribution in view to describe, so the cell
                                // counts what IS in view rather than printing
                                // "lumpsum" over a row showing no purchase at all.
                                ? <span className="pill" data-mine-how="withdrawals">
                                  {cap.withdrawals === 1 ? "1 withdrawal" : `${cap.withdrawals} withdrawals`}
                                </span>
                                : <span className="pill" data-mine-how={cap.staggered ? "staggered" : "lumpsum"}>
                                  {cap.staggered ? `staggered · ${cap.contributions} payments` : "lumpsum"}
                                </span>}
                          </td>
                          {/* A SIDE WITH NOTHING IN VIEW IS ABSENT, NEVER ₹0. Under a
                              Sells filter this row has no contribution in view, and a
                              ₹0 there reads as an account that was never funded —
                              the measured-zero rule failing in the direction that
                              invents a fact rather than hides one. */}
                          <td className="px-3 py-2.5 text-right mono text-slate-200 whitespace-nowrap">
                            {!cap ? <AbsentCell reason={NO_CAPITAL_WHY} />
                              : cap.contributions === 0
                                ? <AbsentCell reason="no contribution is in view — the movements are filtered to what came back out, and this account's paid-in figure is not struck over that" />
                                : money(cap.paidIn)}
                          </td>
                          <td className="px-3 py-2.5 text-right mono text-slate-400 whitespace-nowrap">
                            {!cap ? <AbsentCell reason={NO_CAPITAL_WHY} />
                              : cap.withdrawals === 0
                                ? <AbsentCell reason={cap.sideFiltered
                                  ? "no withdrawal is in view — the movements are filtered to what was paid in"
                                  : "no statement for this account reports money coming back out"} />
                                : money(cap.tookOut)}
                          </td>
                          <td className="px-3 py-2.5 text-right mono text-slate-200 whitespace-nowrap">
                            {!cap ? <AbsentCell reason={NO_CAPITAL_WHY} />
                              : cap.net === null
                                ? <AbsentCell reason="the movements are filtered to one side, and a net over one side of a two-sided record is not a net — clear the side filter to strike it" />
                                : money(cap.net)}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] mono text-slate-500 whitespace-nowrap">
                            {!cap ? <AbsentCell reason={NO_CAPITAL_WHY} /> : period(cap.first, cap.last)}
                          </td>
                          {/* ── TRADES ────────────────────────────────────── */}
                          <td className="px-3 py-2.5 text-right mono text-slate-300 whitespace-nowrap">
                            {!trd ? <AbsentCell reason={NO_TRADES_WHY} />
                              : <>{fmtNum(trd.trades)}<span className="ml-1 text-[10.5px] text-slate-500">{trd.buys}B/{trd.sells}S</span></>}
                          </td>
                          <td className="px-3 py-2.5 text-right mono text-slate-300 whitespace-nowrap">
                            {!trd ? <AbsentCell reason={NO_TRADES_WHY} />
                              : trd.buys === 0 ? <AbsentCell reason="nothing was bought in this row over the window" />
                              : trd.bought == null ? <AbsentCell reason="no buy row in this group reports a settled amount on its statement" />
                              : money(trd.bought)}
                          </td>
                          <td className="px-3 py-2.5 text-right mono text-slate-300 whitespace-nowrap">
                            {!trd ? <AbsentCell reason={NO_TRADES_WHY} />
                              : trd.sells === 0 ? <AbsentCell reason="nothing was sold in this row over the window" />
                              : trd.sold == null ? <AbsentCell reason="no sell row in this group reports a settled amount on its statement" />
                              : money(trd.sold)}
                          </td>
                          <td className={`px-3 py-2.5 text-right mono whitespace-nowrap ${trd?.realized == null ? "text-slate-600" : changeColor(trd.realized)}`}>
                            {!trd ? <AbsentCell reason={NO_TRADES_WHY} />
                              : trd.realized == null
                                ? <AbsentCell reason={trd.sells === 0 ? "nothing was sold in this row over the window" : "no capital gain statement covers this account, so what these sales realised was never reported"} />
                                : <>{fmtFromBase(trd.realized, { compact: true, sign: true })}{trd.realizedOf < trd.sells && <span className="ml-1 text-[10.5px] text-slate-500">{trd.realizedOf}/{trd.sells}</span>}</>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap mono text-[11px] text-slate-400">
                            {!trd ? <AbsentCell reason={NO_TRADES_WHY} /> : period(trd.first, trd.last)}
                          </td>
                          {/* ── THE ACCOUNT ───────────────────────────────── */}
                          {/* A CLOSED ACCOUNT IS WORTH ₹0 AND THE ZERO IS MEASURED.
                              It keeps its zero — the fund reports nil units at a NAV
                              it still publishes — and says so, because a ₹0 beside a
                              ₹31.1 Cr redemption is exactly where a reader needs to
                              know whether the figure is the arithmetic or a gap. */}
                          <td className="px-3 py-2.5 text-right mono text-slate-100 whitespace-nowrap"
                            title={r.value === 0
                              ? "This account holds nothing today: its own statement reports zero units at a NAV the fund still publishes, so the ₹0 is what was measured rather than a figure this book is missing."
                              : undefined}>
                            {r.value === null
                              ? <AbsentCell reason="this row is a security dealt across however many accounts carried it, so there is no one account to value — the holdings tables carry what is held of it today" />
                              : money(r.value)}
                          </td>
                          <td className={`px-3 py-2.5 text-right mono whitespace-nowrap ${cap?.gain == null ? "" : changeColor(cap.gain)}`}>
                            {!cap ? <AbsentCell reason={`${NO_CAPITAL_WHY} — and a gain needs one, because it is struck against what the family put in`} />
                              : cap.gain === null
                                ? <AbsentCell reason={cap.sideFiltered
                                  ? "the movements are filtered to one side; a gain is struck against the account's whole capital record, so it is not published over part of it"
                                  : cap.incompleteReason ?? "no gain can be struck against this account's reported capital"} />
                                : money(cap.gain)}
                          </td>
                          <td className={`px-3 py-2.5 text-right mono whitespace-nowrap ${cap?.returnPct == null ? "" : changeColor(cap.returnPct)}`}>
                            {!cap ? <AbsentCell reason={`${NO_CAPITAL_WHY} — and a return needs one, because its denominator is what the family put in`} />
                              : cap.returnPct === null
                                ? <AbsentCell reason={cap.sideFiltered
                                  ? "the movements are filtered to one side; a return is struck against the account's whole capital record, so it is not published over part of it"
                                  : cap.incompleteReason ?? "no return can be struck against this account's reported capital"} />
                                : <><span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">HPR</span>{fmtPct(cap.returnPct)}</>}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-slate-400 whitespace-nowrap">
                            {ents.length === 0 ? <AbsentCell reason="no statement behind this row names a holder this book can resolve to a family member" />
                              : ents.length === 1 ? ents[0]
                              : <span title={ents.join(" · ")}>{ents.length} entities</span>}
                          </td>
                        </Tr>
                        {isOpen && (
                          <tr className="bg-ink-900/50" data-dated-panel={r.key}>
                            <td colSpan={COLS} className="px-3 pb-3 pt-1">
                              {cap && (
                                <>
                                  <p className="mb-1.5 text-[11px] leading-relaxed text-slate-500">
                                    <span className="font-medium text-slate-400">What the family paid in and took out</span> — every dated
                                    movement {cap.provider} reports on account {cap.accountNo}, as its statement types them.
                                  </p>
                                  <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800">
                                    <SortableTable className="min-w-full text-[12px]"
                                      storageKey="monitor-mine-moves" columns={MINE_MOVE_COLS}>
                                      {(mvv) => (<>
                                      <thead>
                                        <Tr view={mvv} className="border-b border-ink-700/70">
                                          <SortHeader col="date" view={mvv} align="left" pad="px-3 py-1.5">Date</SortHeader>
                                          <SortHeader col="type" view={mvv} align="left" pad="px-3 py-1.5"
                                            title="The statement's own word for the movement — Subscription, Drawdown, Top Up, Full Units Redemption. Printed as it arrived rather than mapped to a vocabulary of ours.">Type</SortHeader>
                                          <SortHeader col="bought" view={mvv} pad="px-3 py-1.5">Bought</SortHeader>
                                          <SortHeader col="sold" view={mvv} pad="px-3 py-1.5">Sold</SortHeader>
                                          <SortHeader col="units" view={mvv} pad="px-3 py-1.5">Units</SortHeader>
                                          <SortHeader col="security" view={mvv} align="left" pad="px-3 py-1.5">Security bought</SortHeader>
                                        </Tr>
                                      </thead>
                                      <tbody className="divide-y divide-ink-700/50">
                                        {sortRows(cap.moves, mvv.sort, {
                                          date: (m) => m.date,
                                          type: (m) => m.label,
                                          bought: (m) => (m.direction === "in" ? m.amount : null),
                                          sold: (m) => (m.direction === "out" ? m.amount : null),
                                          units: (m) => m.units,
                                          security: (m) => m.security,
                                        }).map((m, i) => (
                                          <Tr view={mvv} key={`${m.date}-${i}`} data-mine-move={r.accountId ?? ""}>
                                            <td className="px-3 py-1.5 mono whitespace-nowrap text-slate-300">{fmtDate(m.date)}</td>
                                            <td className="px-3 py-1.5 text-slate-400">{m.label}</td>
                                            <td className="px-3 py-1.5 text-right mono whitespace-nowrap text-emerald-400/90">
                                              {m.direction === "in" ? (m.amount === null
                                                ? <AbsentCell reason="this statement prints only a running balance for that date, so what moved on the day is not stated" />
                                                : money(m.amount)) : ""}
                                            </td>
                                            <td className="px-3 py-1.5 text-right mono whitespace-nowrap text-rose-400/90">
                                              {m.direction === "out" ? money(m.amount ?? 0) : ""}
                                            </td>
                                            <td className="px-3 py-1.5 text-right mono whitespace-nowrap text-slate-400">
                                              {m.units === null ? <span className="text-slate-600">—</span> : fmtNum(m.units)}
                                            </td>
                                            <td className="px-3 py-1.5 text-slate-400">{m.security ?? <span className="text-slate-600">—</span>}</td>
                                          </Tr>
                                        ))}
                                      </tbody>
                                      </>)}
                                    </SortableTable>
                                  </div>
                                </>
                              )}
                              {trd && (
                                <>
                                  <p className={`mb-1.5 text-[11px] leading-relaxed text-slate-500 ${cap ? "mt-3" : ""}`}>
                                    <span className="font-medium text-slate-400">What was dealt inside</span> — one line per security,
                                    opening into the dated trades themselves. These are never added to the capital
                                    movements {cap ? "above" : "the family made"}: a trade moves money about inside an account.
                                  </p>
                                  <DealtInside group={trd} rowKey={r.key} open={openInstrument}
                                    toggle={(k) => toggle(setOpenInstrument, k)} sort={sort} money={money} />
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={COLS} className="px-3 py-12 text-center text-sm text-slate-500">
                  No dated record matches these filters. This table reads the movements the statements
                  type as a contribution or a withdrawal, and the trades the transaction statements
                  report — widen the dates, clear the entity or section filter, or switch the side back to All.
                </td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              /* SUMMED FROM THE ROWS ABOVE, never recomputed off either source —
                 and EACH BLOCK DOWN ITS OWN COLUMN. A footer that added the two
                 would print ₹291.9 Cr where the family paid in ₹221.5 Cr, which
                 is the defect `txnLedger.ts` is built to refuse. */
              <tfoot className="sticky bottom-0 border-t-2 border-ink-600 bg-ink-800 font-semibold">
                {/*
                  THE FOOTER'S FIGURES AS ATTRIBUTES, beside the cells that
                  render them — the contract `data-trades` and `data-days`
                  already carry one level up.

                  The Trades cell renders the count and a "284B/178S" split
                  beside it, so `innerText` is "462284B/178S" and BOTH a
                  strip-the-non-digits parser and a leading-number one produce a
                  plausible wrong answer (462284178 and 462284). This file
                  already records that trap on the row; a total is where it is
                  least visible, because nothing on the page contradicts it.
                */}
                <TrFoot view={dv} data-dated-total
                  data-foot-rows={totals.rows} data-foot-accounts={totals.accounts}
                  data-foot-contributions={totals.contributions} data-foot-withdrawals={totals.withdrawals}
                  data-foot-trades={totals.trades} data-foot-sells={totals.sells}
                  data-foot-realised-of={totals.realizedOf}
                  className="px-3 py-2.5 text-slate-200"
                  labelTitle={`${totals.accounts} of this book's ${accountsReg.length} accounts publish a dated capital record. The other ${accountsReg.length - totals.accounts} were funded as well — the managed mandates issue a capital-account ledger rather than dated allotments, and a depository records what is held and never what was paid for it — so the Capital in total is not the whole of what the family has committed.`}
                  label={<>Total · {fmtNum(totals.rows)} {totals.rows === 1 ? "row" : "rows"} · {totals.accounts} of {accountsReg.length} accounts</>}
                  cells={{
                    how: (
                      <td key="how" className="px-3 py-2.5 text-right text-[12px] text-slate-400 whitespace-nowrap">
                        {side === "out" ? `${totals.withdrawals} withdrawals` : `${totals.contributions} payments`}
                      </td>
                    ),
                    in: (
                      <td key="in" className="px-3 py-2.5 text-right mono font-medium text-slate-100 whitespace-nowrap">
                        {totals.contributions === 0
                          ? <AbsentCell reason="no contribution is in view under this side filter" />
                          : money(totals.paidIn)}
                      </td>
                    ),
                    out: (
                      <td key="out" className="px-3 py-2.5 text-right mono font-medium text-slate-400 whitespace-nowrap">
                        {totals.withdrawals === 0
                          ? <AbsentCell reason="no withdrawal is in view under this side filter" />
                          : money(totals.tookOut)}
                      </td>
                    ),
                    net: (
                      <td key="net" className="px-3 py-2.5 text-right mono font-medium text-slate-100 whitespace-nowrap">
                        {totals.net === null
                          ? <AbsentCell reason="every row's net is withheld under a side filter, so there is nothing to total" />
                          : money(totals.net)}
                      </td>
                    ),
                    trades: <td key="trades" className="px-3 py-2.5 text-right mono text-slate-200 whitespace-nowrap">{fmtNum(totals.trades)}<span className="ml-1 text-[10.5px] font-normal text-slate-500">{totals.buys}B/{totals.sells}S</span></td>,
                    bought: <td key="bought" className="px-3 py-2.5 text-right mono text-slate-200 whitespace-nowrap">{totals.bought == null ? <AbsentCell reason="no buy row in view reports a settled amount on its statement" /> : money(totals.bought)}</td>,
                    sold: <td key="sold" className="px-3 py-2.5 text-right mono text-slate-200 whitespace-nowrap">{totals.sold == null ? <AbsentCell reason="no sell row in view reports a settled amount on its statement" /> : money(totals.sold)}</td>,
                    realised: <td key="realised" className={`px-3 py-2.5 text-right mono whitespace-nowrap ${totals.realized == null ? "text-slate-600" : changeColor(totals.realized)}`}>{totals.realized == null ? <AbsentCell reason="no sell in view is covered by a capital gain statement" /> : <>{fmtFromBase(totals.realized, { compact: true, sign: true })}{totals.realizedOf < totals.sells && <span className="ml-1 text-[10.5px] font-normal text-slate-500">{totals.realizedOf}/{totals.sells}</span>}</>}</td>,
                    /* STRUCK OVER THE ACCOUNT ROWS THAT CARRY ONE, and the
                       count says how many — a security row is an instrument
                       rather than an account and has no account value to add,
                       so a total over "every row" would name a denominator this
                       column does not have. */
                    value: <td key="value" className="px-3 py-2.5 text-right mono font-medium text-slate-100 whitespace-nowrap"
                      title={`Summed over the ${totals.valueOf} of ${totals.rows} rows that are an account. A security row is an instrument dealt across however many accounts carried it, so it contributes no account value here.`}>
                      {totals.value === null ? <AbsentCell reason="no row in view is an account, so there is no account value to total" /> : money(totals.value)}
                    </td>,
                    /*
                      FOUR COLUMNS CAN NEVER CARRY A TOTAL, AND EACH SAYS SO.

                      Two are spans of DATES — the earliest and latest across
                      rows funded years apart is a range, not a sum. One is a
                      RETURN struck per row against that row's own net invested,
                      so a whole-table figure would sit under a column whose
                      every cell is on a different denominator — the failure the
                      allocation footer already cost this book once. The last is
                      a column of NAMES.

                      They render `AbsentCell` WITH A REASON rather than sitting
                      blank: a reader who scans an empty cell learns nothing
                      about whether a figure was withheld or never existed.
                    */
                    /* AND GAIN CARRIES ONE, because it is an AMOUNT. Its
                       neighbour Value today already does and its other
                       neighbour Return correctly cannot — a rate struck on a
                       per-row denominator has none — so a summable rupee column
                       sitting blank between them was the odd one out. The count
                       rides with it exactly as Value's does: a gain is published
                       only where the row's contribution history reaches
                       inception. */
                    gain: <td key="gain" className={`px-3 py-2.5 text-right mono font-medium whitespace-nowrap ${totals.gain == null ? "text-slate-600" : changeColor(totals.gain)}`}
                      title={`Summed over the ${totals.gainOf} of ${totals.rows} rows that publish one. A gain is struck against an account's NET INVESTED and is published only where its contribution history provably reaches inception, so a row on a partial denominator contributes none.`}>
                      {totals.gain === null
                        ? <AbsentCell reason="no row in view publishes a gain — a gain is struck against an account's net invested, and no row's contribution history in view provably reaches inception" />
                        : fmtFromBase(totals.gain, { compact: true, sign: true })}
                    </td>,
                    investedOn: <td key="investedOn" className="px-3 py-2.5 text-left"><AbsentCell reason="a span of dates has no total — each row states its own first and last contribution" /></td>,
                    traded: <td key="traded" className="px-3 py-2.5 text-left"><AbsentCell reason="a span of dates has no total — each row states its own first and last trade" /></td>,
                    return: <td key="return" className="px-3 py-2.5 text-right"><AbsentCell reason="every row's return is struck against its own net invested over its own window, so there is no denominator a whole-table figure could sit on. The money-weighted return across the accounts that can carry one is on Performance." /></td>,
                    entity: <td key="entity" className="px-3 py-2.5 text-left"><AbsentCell reason="a column of names has no sum — the Entity filter above narrows the table to one" /></td>,
                  }} />
              </tfoot>
            )}
            </>); }}
          </SortableTable>
        </div>
        {/*
          ONE LINE, AND ONLY BECAUSE THE ABSENCE IS THE FINDING.

          The family's own-account dealing is narrow here because their other
          direct trading sits in DEMAT statements, whose movements carry no
          price, no counterparty and no consideration and are therefore not
          trades (`precedence.mjs`). Without saying so, a Direct Equity section
          of a dozen names reads as a MEASUREMENT of how little this family
          trades its own book, which is not what the corpus says.
        */}
        <div className="border-t border-ink-700/60 px-3 py-2 text-[11px] text-slate-500">
          Trades come from each manager&rsquo;s transaction statement. Demat movements carry no price or counterparty on
          their statements, so they are not trades and are not here — which is why the family&rsquo;s own-account dealing
          reads narrower than it is.
        </div>
      </Card>
    </div>
  );
}
