import { TablePageControls, useTablePagination } from "@/components/PagedTableBody";
import { Fragment, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { statementNoteForSet } from "@/lib/statementNotes";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Layers, ArrowLeftRight, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { useStockExposure } from "@/lib/useStockExposure";
import { companySectorIndex, type FundExposureRow } from "@/lib/lookthrough";
import { UNCLASSIFIED as UNCLASSIFIED_SECTOR } from "@/lib/sectors";
import { symbolFor, symbolForKey } from "@/lib/quotes";
import { liveWithheldReason } from "@/lib/corporateActions";
import { fmtPct, changeColor, fmtNum, fmtDate } from "@/lib/format";
import {
  sum, sumOrNull, consolidatedMarketValue, dedupedPositions, isFundVehicle, isCompanyShare,
  holdingRoute, ROUTE_LABEL,
  mandateLabel, MANDATE_BUCKET,
  measuredReturn, returnCoverage, returnMeasureDef, valueDateOf, commonValueDate,
  type ReturnMeasure, type ReturnInput, type RowCapital,
  costCoversSet, strikesGain, isValuedAtCost, totalQuantity, AT_COST_RETURN, AT_COST_PNL, NO_UNIT_COUNT,
  AT_COST_MARK, REVIEW_NO_MARK,
  currentHoldings, droppedHoldings, NEGLIGIBLE_VALUE_FLOOR, isCashEquivalent, assetClassLabel,
} from "@/lib/analytics";
import { depositoryUnitsGist, describeDepositoryUnits, isArbitrageFund } from "@/lib/fundNavs";
import { accountIndex, ownerOf, type AccountIndex, engagementOf } from "@/lib/accounts";
import { splitFundClass } from "../../shared/securityKey.mjs";
import { ownerDisplayName } from "@/lib/owners";
import { loadTransactions, type Txn, type TxnData } from "@/lib/ledger";
import { fifoTotals, fifoBasisNote, investedBasisNote, investedWithCapital, realisedReason, realisedBasisNote, realisedWindowNote, atCostNote, type FifoTotals, type RealisedBasisFacts } from "@/lib/fifo";
import { costedFigures, commonMark, costCoverNote, markKey, splitMarkReason, VACUOUS_COST_REASON, type CostedFigures } from "@/lib/clubbedFigures";
import { rollup, acctKey, realisedAbsence, realisedCoverageNote, STAGGERED_MIN, type GroupRow, type InstrumentRow } from "@/lib/txnRollup";
import {
  trancheTable, trancheKey, capitalRollup, capitalMovesWithCalls, capitalReturn, clubCapitalReturn, capitalReturnCoverage,
  carriedCostOf, carriedCostNote, grossPaidOf, grossPaidNote, boughtNavOf, callDatesByHolding,
  type TrancheTable, type TrancheRow, type CapitalSide, type CapitalGroup,
} from "@/lib/tranches";
// THE TWO DATED RECORDS, MERGED INTO ONE ROW SET — and the two money blocks
// that must never be added. See its header for what that was measured at.
import { mergeDatedRecords, datedTotals, datedSectionRollup, clubDatedRows, type DatedRow, type DatedUnit, type DatedSectionRows } from "@/lib/txnLedger";
import { TXN_SORTS, type TxnSort } from "@/lib/txnSort";
import { BOOK_POSITION_TRANCHES, BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_CAPITAL_FROM_INCEPTION, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_CAPITAL_GAINS, BOOK_REVIEW_FLOWS } from "@/data/glowData";
import { useViewParam, type ViewDef } from "@/components/ViewToggle";
import { UNCLASSIFIED, UNCLASSIFIED_WHY, type TaxonomySource } from "@/lib/familyTaxonomy";
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
// THE RETURN-METHODOLOGY PICKER AND ITS COLUMNS ARE SHARED with the Private
// Market fund table now. Everything that used to be defined here moved verbatim;
// this page supplies only how one of ITS rows resolves a measure.
import { ReturnMeasureSelect, useReturnMeasures } from "@/components/ReturnMeasureSelect";
import { withReturnCols, returnAccessorsFor, AGG_NO_MEASURE, returnColumnMeta } from "@/lib/returnColumns";
import { useDatedCapital } from "@/lib/useDatedCapital";
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
import { pnlFormula, returnFormula, stockHref } from "@/lib/auditFormulas";
import { notHeldNote } from "@/components/QuantityMovement";
import { movementsFor } from "@/lib/shareMovements";
import { allRecordedLines, recordedLabel, recordedLineFor } from "@/lib/recordedHoldings";
import type { Position } from "@/lib/types";
import { AbsentCell, AbsentFromBook, AbsentSection, AbsentValue, DASH } from "@/components/Absent";
import { SortHeader, SortableTable, Tr, TrFoot } from "@/components/SortHeader";
// THE SAME TABLE STANDARD THE PRIVATE MARKET PAGE READS — a row opens into rows
// of THIS table, in THESE columns, never into a table drawn inside a cell. See
// the header of `TreeTable.tsx`, and "WHAT A ROW OPENS INTO" below.
import {
  TREE_ROW_DENSE, TREE_CELL_DENSE, rowToggle, TreeNameCell, TreeSectionCell, ExpandAllButton,
} from "@/components/TreeTable";
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
  /** Null where a line is the family's review recording an amount paid and no unit count (Stage 10dh). */
  quantity: number | null; marketValue: number;
  costBasis: number | null; unrealizedPnL: number | null; returnPct: number | null; costNA: boolean;
  /** The review's line HELD AT COST: a cost, no valuation, so no gain (Stage 10dh). */
  valuedAtCost: boolean;
  /** The date this line's value is struck at — where its return window ends. */
  valuedAt: string | null;
  /** This venue's share of the name as PRINTED across the statements. */
  share: number;
  /**
   * ── WHAT A LINE NEEDS TO STAND IN THE TABLE'S OWN COLUMNS ─────────────────
   *
   * The venue used to be drawn in a table of its own inside the row's cell, with
   * columns of its own — Held via, Vehicle, Owning entity, Qty, Market value,
   * % of holding — none of which lined up with the row above it. It is a ROW of
   * the holdings table now, so it carries what each of those columns asks of a
   * holding: its own per-unit cost and mark (which is how a clubbed fund's
   * classes finally show the units and the NAV the row above cannot), its own
   * day move, its own dates, and the statements behind it, which are what its
   * dated contributions hang from.
   */
  positions: Position[];
  avgCost: number | null; currentPrice: number | null;
  /** Where this line's own statement lines disagree on a mark, the marks (A-03). */
  splitMarks: number[];
  /** Cost, and the units and value it covers — `costedFigures` (A-02). */
  costCover: CostedFigures;
  navPriced: boolean; navDate?: string;
  /**
   * The closing date of a depository's own balance, where this line's units
   * come from an account that sent a transaction statement and no holding
   * statement — so the NAV beside it replaced no statement mark at all.
   */
  depositoryAsOf: string | null;
  /**
   * WHY NO STATEMENT PRICES THIS LINE'S UNITS, in words — a depository's
   * closing balance on an account with no holding statement, or units a holding
   * statement records and prints no rate for (A-17). `fundNavs.ts` chooses it.
   */
  depositoryWhy: string | null;
  live: boolean; dayChangePct: number | null;
  heldSince: string | null; assetClass: string;
  investedOn: { first: string; last: string; payments: number } | null;
};

/**
 * One share inside a mandate — a constituent of the roll-up, shown when the
 * mandate row is expanded and nowhere else on this table.
 */
type MandateHolding = {
  securityKey: string; security: string; sector: string;
  quantity: number | null; avgCost: number | null; currentPrice: number | null;
  costBasis: number | null; marketValue: number; unrealizedPnL: number | null;
  returnPct: number | null; costNA: boolean; live: boolean;
  /** For the row's own Day, Invested on and return cells — see `Venue`. */
  dayChangePct: number | null;
  heldSince: string | null; assetClass: string;
  /** The date this share's value is struck at — where its return window ends. */
  valuedAt: string | null;
  investedOn: { first: string; last: string; payments: number } | null;
  /** DL-8: the share's own realised on its account's capital gain statement. */
  accountId: string;
  realised: number | null;
  realisedLotsAfter: number | null;
};
/**
 * ONE ACCOUNT OF A MANDATE ROW (Stage 10dl).
 *
 *   "In holdings we are showing Green Lantern Capital LP as 2 separate line
 *    items, but they need to be one … even if they are held by 2 separate
 *    entities, we can show that in drop down."
 *
 * A strategy one manager runs for two members is ONE row now, and each member's
 * account is a line under it — its own figures, struck over its own positions
 * exactly as the row used to be, and a link to that account's drill-down, which
 * is where the shares the manager chose are listed. Nothing is deduped: two
 * members' accounts are two investments, and the row adds them.
 *
 * `accountMV` / `accountCount` are the account's OWN totals, struck before this
 * page's filters, for the same reason the row carries them.
 */
type MandateAccountLine = {
  accountId: string; accountNo: string; owner: string; asOf: string;
  /** The account's positions on this row — every figure below is struck over these. */
  positions: Position[];
  marketValue: number; costBasis: number | null; unrealizedPnL: number | null; costNA: boolean;
  invested: number | null; returnPct: number | null; realised: number | null;
  fifo: FifoTotals; capital: RowCapital | undefined;
  live: boolean; liveMV: number; dayChangePct: number | null;
  valuedAt: string | null;
  holdings: number; accountMV: number; accountCount: number;
};
/**
 * What a mandate ROW stands for: one strategy a manager runs, the members'
 * accounts it is run in, and the shares that manager chose inside them.
 *
 * `accountMV` / `accountCount` are the accounts' OWN totals, struck before this
 * page's filters. The roll-up ties to the statements only when nothing has been
 * filtered out, so a narrowed row prints both figures rather than quietly
 * reporting part of a mandate as the whole of it.
 */
type MandateInfo = {
  /** Every account on the row, largest first — one on the by-entity view. */
  accounts: MandateAccountLine[];
  /**
   * The mandate's name — `mandateLabel`, the same one `Row.security` shows. Two
   * members' accounts of one strategy share it, which is why they are one row:
   * the Entities column names the members and the lines under the row say which
   * account is whose.
   */
  name: string;
  manager: string;
  holdings: MandateHolding[];
  accountMV: number; accountCount: number;
};
/**
 * WHEN A HOLDING'S OWN MONEY WENT IN, over the positions a row sums.
 *
 * Three sources, strongest first, and all are the HOLDING'S OWN dates rather
 * than its account's:
 *
 *   • `Position.heldSince` — the acquisition date on a lot register, emitted
 *     only where the lots account for every unit held;
 *   • the position's own tranche record, keyed on (account, security), which is
 *     the dated allotments a fund reports against that very folio;
 *   • a drawdown fund's own dated CALLS, where the account holds nothing but
 *     that fund and its paid-in covers every call (`callDatesByHolding`). A call
 *     carries no unit count, so it can date the money without splitting it.
 *     Five folios on this book: Baring, Carnelian Bharat Amritkaal, Delphi and
 *     both Founders Fund folios.
 *
 * AN ACCOUNT-LEVEL DATE IS DELIBERATELY NOT A FOURTH TIER. An account's first
 * contribution is when the FAMILY funded the account, not when a manager bought
 * the share this row is about — putting it here would print a date under a
 * heading that says something else about it, for every share in a mandate. The
 * account-level record has its own home, on the mandate page and on What I
 * invested. The calls tier is not that: on an account holding one fund and
 * nothing else, the account's calls and the holding's purchases are the same
 * payments, and `callDatesByHolding` refuses every account where they are not.
 *
 * ── AND THE ACCOUNT-LEVEL TIER CANNOT BE CAUGHT ON THIS BOOK, SO IT IS WRITTEN DOWN ──
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
const CALL_DATES = callDatesByHolding(BOOK_COMMITMENTS, BOOK_POSITIONS);
function investedOnOf(ps: Position[]): { first: string; last: string; payments: number } | null {
  const dates: string[] = [];
  for (const p of ps) {
    const own = BOOK_POSITION_TRANCHES[trancheKey(p.accountId, p.securityKey)];
    const ins = own?.moves.filter((m) => m.direction === "in").map((m) => m.date) ?? [];
    if (ins.length) { dates.push(...ins); continue; }
    if (p.heldSince) { dates.push(p.heldSince); continue; }
    const called = CALL_DATES.get(trancheKey(p.accountId, p.securityKey));
    if (called?.length) { dates.push(...called); continue; }
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
  // Quantity is NULL on a mandate row: a mandate is an account, not a security,
  // and its constituents are what carry quantities. A 0 would read as a mandate
  // holding nothing. It is null on a security row too where a line behind it is
  // the family's review recording an amount paid and no unit count (Stage 10dh)
  // — a count over the other lines would state a holding of fewer units.
  entities: string[]; quantity: number | null; avgCost: number | null; currentPrice: number | null;
  /** The price above is AMFI's published NAV, not the statement's mark. */
  navPriced?: boolean; navDate?: string;
  /**
   * WHERE THE LINES BEHIND A CLUBBED ROW DISAGREE ON A MARK, the marks — and
   * `currentPrice` is null (A-03): one line's price printed over every line's
   * units is a figure no statement struck. Empty on every other row.
   */
  splitMarks?: number[];
  /**
   * The row's cost, and the units and value it covers (A-02). Cost, average
   * cost and unrealised P&L are struck over ONE set — the lines whose statement
   * reports a cost — never a costed line's cost against every line's units.
   */
  costCover?: CostedFigures;
  /**
   * The closing date of a depository's own balance, where some of this row's
   * units come from an account that sent a transaction statement and no holding
   * statement — so no statement marks them at all (`fundNavs.ts`).
   */
  depositoryAsOf?: string | null;
  /** Which kind of unpriced units those are, in words (`depositoryUnitsGist`). */
  depositoryWhy?: string | null;
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
   * EVERY line behind this row is the family's review HELD AT COST — an amount
   * paid and no valuation, so its value is its cost and no gain or return is
   * struck on it (Stage 10dh). False where any line carries a valuation.
   */
  valuedAtCost?: boolean;
  /**
   * THE DATED CAPITAL BEHIND THE ROW, where the row IS whole accounts
   * (`datedCapital.ts`) — which is what lets its XIRR column, and the family's
   * rule under `auto`, strike a money-weighted return. Undefined on a holding
   * inside an account, which keeps the per-holding refusal.
   */
  capital?: RowCapital | null;
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
   * The ONE date this row's value is struck at (`commonValueDate`), where its
   * return window ends; null where its holdings are valued on different dates,
   * which refuses an annualised figure rather than picking one of the dates.
   */
  valuedAt: string | null;
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
   * `"cash-rule"` — placed by their instruction that arbitrage and liquid
   *   funds are cash, where the review files one elsewhere or does not name it.
   * `"derived"` — our own asset class already answered it beyond doubt.
   * `null` — nobody has, and the row sits under `UNCLASSIFIED`.
   * Always `"review"`-equivalent on the category axis, which is derived from
   * the book itself and asks nothing of the family; the field is only read on
   * the other two.
   */
  groupSource: TaxonomySource | null;
  /**
   * ── THE ROW'S FIFO TOTALS, AND ITS REALISED GAIN ─────────────────────────
   *
   * Struck by `fifoTotals` over exactly the positions the row sums, so the
   * Return cell, the Realised cell and the section totals are one computation.
   * A WHOLE mandate row is struck on its capital since inception, so its
   * realised is everything the account has booked — every sale since it
   * opened, and its income less its fees — which is what the manager's own
   * since-inception record reports.
   *
   * `realised` is NULL where no position behind the row has a realised record
   * (no capital gain statement, no dated unit record) — never a zero.
   */
  realised: number | null;
  fifo: FifoTotals | null;
  /**
   * WHAT THE INVESTED CELL PRINTS, where it is not `costBasis` — set on a
   * mandate row, and there only. A WHOLE mandate enters at the capital the
   * family paid into it (`fifoTotals().invested`), which is what its Return is
   * divided by; `costBasis` keeps the cost of the shares it holds now, which
   * Unrealised P&L is struck on and which the cell's hover names. Undefined on
   * every other row, where the two are one figure.
   */
  invested?: number | null;
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
 * to the measured half.
 *
 * ONE ARRANGEMENT FOR EVERY AXIS TAB. *"remember the exact position and save it
 * even when i am changing the tab i will not keep doing the same configuration
 * again."* The two sets used to be saved under two keys, so a column moved on
 * All Securities was not moved on Category. They share `monitor` now:
 * `useTableView` saves the WHOLE arrangement, so the two columns only the
 * security axis draws keep their places while Category is open. The old
 * `monitor-stock` key is read only where nothing is saved under `monitor`.
 */
const MONITOR_COLS = ["security", "qty", "avgCost", "invested", "investedOn", "cmp", "day", "mv",
  "weight", "pnl", "realised", "return", "sector", "entity"] as const;
const MONITOR_STOCK_COLS = ["security", "qty", "avgCost", "invested", "investedOn", "cmp", "day", "mv",
  "viaFunds", "totalExposure", "weight", "pnl", "realised", "return", "sector", "entity"] as const;
const MONITOR_LEGACY_KEYS = ["monitor-stock"] as const;

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
// THE FIVE COLUMN LISTS THE NESTED PANELS DECLARED — tranche, tranche-by-entity,
// mandate, venue and venue-by-class — ARE GONE WITH THE PANELS. Each opened
// row is now a row of THIS table in THESE columns (see "WHAT A ROW OPENS INTO"),
// so there is one column list, and a column a reader drags moves a row and
// everything it opens into together.

/** The Invested cell's figure: a mandate row's capital basis where it has one, else the cost held. */
const investedOf = (r: Row): number | null => (r.invested !== undefined ? r.invested : r.costBasis);

const MONITOR_ACCESSORS: Record<string, (r: Row) => number | string | null | undefined> = {
  security: (r) => r.security,
  qty: (r) => r.quantity,
  avgCost: (r) => r.avgCost,
  invested: (r) => investedOf(r),
  investedOn: (r) => r.investedOn?.first ?? null,
  cmp: (r) => r.currentPrice,
  day: (r) => r.dayChangePct,
  mv: (r) => r.marketValue,
  viaFunds: (r) => r.viaFunds,
  totalExposure: (r) => r.totalExposure,
  weight: (r) => r.weight,
  pnl: (r) => r.unrealizedPnL,
  realised: (r) => r.realised,
  // NO `return` ACCESSOR, and its absence is deliberate. `return` is a
  // PLACEHOLDER in the column list rather than a column — `withReturnCols`
  // expands it to one id per ticked measure — so no view ever declares it and
  // an accessor for it would rank nothing while looking like the one that
  // ranks the return columns. `returnAccessorsFor` supplies the real ones, each
  // reading the measure its own column prints.
  entity: (r) => r.entities[0] ?? null,
};

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
  /**
   * The review's lines HELD AT COST (Stage 10dh): in `cost` and `costedMV` —
   * what was paid is a cost reported — and in no gain. Value no gain is struck
   * on, like a holding that reports no cost, so it counts against the return.
   */
  atCostMV: number;
  atCostCount: number;
  heldCount: number;
  /** Distinct securities among those holdings — the drill-down's "names". */
  names: Set<string>;
  /** The section's FIFO totals — its return and its realised, struck on its own positions. */
  fifo: FifoTotals;
  /**
   * The section's only costed lines are nil balances while the rest carries
   * value — `cost` and `pnl` are null and the cells say why (A-14). The Cash
   * section is the case: two nil sleeves reporting a cost of ₹0 beside ₹14.2 Cr
   * of liquid funds no statement costs printed Invested ₹0 and P&L ₹0.
   */
  vacuous: boolean;
  /**
   * WHAT THE ROWS COUNT TWICE AND THIS TOTAL COUNTS ONCE (MH-12). On
   * `?view=entity` the rows are each member's statement as printed, so a
   * holding two members both report is in two rows while every total counts it
   * once. The band named the market value of that overlap; its cost and its
   * gain were named nowhere, so the totals row sat under rows that did not add
   * to it. Zero on every consolidated view, where the rows are consolidated too.
   */
  dupCost: number;
  dupPnl: number;
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

/**
 * THE ONE SENTENCE THE DERIVED COLUMNS CARRY, written once so the two headers
 * cannot come to say different things about the same fence.
 */
/**
 * EVERY ACCOUNT'S DATED CAPITAL CALLS (VD-14). A drawdown fund's own statements
 * print each call with its date, and the "Invested on" reason said the account
 * "issues neither" a lot register nor dated allotments — false of Founders,
 * Delphi, Carnelian Amritkaal, Neo Infra and Baring, which print 1 to 6 dated
 * calls each. What they do not print is WHICH UNITS each call bought.
 */
// Keyed on the ACCOUNT, for the reason an undated cell gives. `CALL_DATES`
// above is keyed on the HOLDING and dates one — Stage 10cy's third tier, which
// fires only where the account's one line with money in it is that fund.
const ACCOUNT_CALL_DATES = new Map<string, string[]>(BOOK_COMMITMENTS
  .filter((c) => !!c.accountId && (c.calls ?? []).length > 0)
  .map((c) => [c.accountId, (c.calls ?? []).map((x) => x.date).filter((d): d is string => !!d).sort()]));
/**
 * EACH ACCOUNT'S CAPITAL GAIN STATEMENT WINDOW (DL-10). A holding's realised is
 * what that statement reports, over ITS window — most from 1 Apr 2026, Molecule's
 * June alone — so a figure there is "sold inside the window", never "since
 * inception". The same filter the footer's `realisedFacts` applies.
 */
const CG_WINDOW = new Map<string, { from: string | null; to: string | null }>(BOOK_CAPITAL_GAINS
  .filter((c) => !!c.accountId && (c.realisedST !== null || c.realisedLT !== null))
  .map((c) => [c.accountId as string, { from: c.periodFrom ?? null, to: c.periodTo ?? null }]));
/**
 * A COMPANY ONLY A FUND HOLDS HAS NO MEASURED CELL, AND EACH SAYS WHY (MSX-12).
 * Its dashes carried reasons borrowed from other rows — "a mandate is an
 * account", "marked at a total value", "a depository records what is held" —
 * none of which is true of a company the family reaches through somebody else's
 * portfolio. One cause, stated once, on every cell it explains.
 */
const DERIVED_ONLY_WHY = "no statement in this book reports this company as a holding — the family reaches it only through funds whose filings name it — so there is no quantity, cost, price, date or return of the family's own to show here; Via funds carries the derived figure";
const DERIVED_NOTE = "DERIVED, not a position: the AMC disclosed what the fund holds and this is your units' share of it, across every asset class the filing carries — shares, bonds, NCDs and commercial paper alike. It is no part of the book's NAV — the fund's own value already stands for it there — so this column is never summed into a book total.";

export function PortfolioMonitor() {
  const { portfolio, consolidated, basis, displayCurrency, fmtFromBase, corporateActionReturns } = usePortfolio();
  /**
   * WHY THE LIVE QUOTE ON THESE LINES WAS HELD BACK, OR NULL (DL-9).
   *
   * The corporate-action check withholds a quote that DID arrive wherever
   * pairing it with the statement's share count could be wrong — sales recorded
   * after the statement, an event the capture cannot allocate, the evidence
   * still loading. The price hover and the Day cell said "no live price" about
   * those too, which sends a reader to wait for a feed that already answered.
   * `held` of `of` lines, in the check's own words (`liveWithheldReason`, the
   * one helper the company page reads too).
   */
  const withheldOf = (ps: readonly Pick<Position, "accountId" | "securityKey">[]) => {
    const reasons = ps.map((p) => liveWithheldReason(p, corporateActionReturns)).filter((x): x is string => !!x);
    return reasons.length ? { reason: [...new Set(reasons)].join(". "), held: reasons.length, of: ps.length } : null;
  };
  /** The statement lines a row stands for: its own set, or a mandate's shares. */
  const linesOf = (r: Row): Pick<Position, "accountId" | "securityKey">[] => r.mandate
    ? r.mandate.holdings.map((h) => ({ accountId: h.accountId, securityKey: h.securityKey }))
    : r.trancheSet;
  /**
   * THE DATED CAPITAL BEHIND A ROW THAT IS WHOLE ACCOUNTS (`datedCapital.ts`).
   *
   * Struck on the STATEMENT book, exactly as the Transactions card strikes the
   * same accounts, so a folio's money-weighted return is one figure on both
   * pages: each account closes at the value its own statement prints, on that
   * statement's date. A live quote moves a mandate row's value today, and
   * closing today's value on a month-old date would credit the rate with days
   * nobody measured. `holdingsUniverse` is the current holdings "every holding
   * of an account" is measured against — the same set the row build's
   * `fifoOpts.universe` is, before any filter.
   */
  const { dated: datedCap, universe: holdingsUniverse } = useDatedCapital();
  /**
   * `?show=transactions` OPENS THE TRANSACTIONS TAB — the address the top bar's
   * search sends "transactions", "buys" or a redeemed fund to. The switch stays
   * local state (it is not a view of the SAME rows, so it never belonged in
   * `?view=`); the param only says where to land, and it is re-read when it
   * changes so a search from this very page still switches the tab.
   */
  const [showParams] = useSearchParams();
  const showParam = showParams.get("show");
  const [view, setViewState] = useState<"holdings" | "transactions">(
    showParam === "transactions" ? "transactions" : "holdings");
  useEffect(() => {
    if (showParam === "transactions" || showParam === "holdings") setViewState(showParam);
  }, [showParam]);
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
   *
   * THE PARAM-FREE DEFAULT IS ALL SECURITIES, because it is first in
   * `MONITOR_GROUP_VIEWS` — *"make it first in portfolio monitor and default
   * open"*. The category view this page used to open on is
   * `/monitor?group=category` now.
   */
  const [groupAxis, setGroupAxisParam] = useViewParam(MONITOR_GROUP_VIEWS, {}, "group");
  /**
   * THE ALLOCATION AXIS — what the Transactions table sections on, and what the
   * shared section filter offers.
   *
   * The security axis is the Holdings table's own fourth axis and is not an
   * allocation axis at all: it files every holding in ONE section so a table
   * built on it would draw a single heading over everything. A reader on it
   * who crosses to Transactions therefore lands on CATEGORY — Morning CIO's
   * default and this table's — rather than on a table with no sections, and the
   * axis control up there offers three, so the fallback is visible rather than
   * silent.
   *
   * SINCE ALL SECURITIES BECAME THE HOLDINGS DEFAULT, THIS IS THE ORDINARY
   * CASE rather than an edge one: a reader who opens `/monitor` and clicks
   * Transactions without touching the axis takes exactly this path.
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
   * resolve the SECURITY axis DIFFERENTLY — and it is the Holdings default now,
   * at `/monitor` with no `?group=` at all: Holdings sections on it, Transactions
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
   * So this array is the COLUMN LIST. The default is EVERY measure, one column
   * each — *"make default All ratios showing coloumns as selected … and remeber
   * it"* — and the reader's pick is saved for this page (Holdings and
   * Transactions share it), so the next visit opens on it. `auto`, the
   * methodology (equity under a year absolute, a year or more CAGR, fixed income
   * XIRR) as one column, is one pick away. A `?ret=` address still wins, so the
   * guard-firing CAGR view is a shareable link and the sweep reaches it without
   * a click. See `useReturnMeasures` / `measuredReturn`.
   */
  const [returnMeasures, setReturnMeasures, returnSource] = useReturnMeasures("monitor");
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
   * ── ONE ANSWER TO "WHAT SECTOR IS THIS COMPANY IN" (MH-07, MSX-6) ─────────
   *
   * The Sector column and `?sector=` read `Position.sector`, which is the
   * family's own STATEMENT alone — and a depository statement prints an ISIN, a
   * quantity and a rate and no industry at all. So every share the family
   * bought in its own demat read "Unclassified" here (35 of 35 Direct Equity
   * rows), while Sector Composition and Family & Entities placed 33 of them
   * through the shared three-tier classification: the statement, then a fund's
   * SEBI filing joined on the ISIN, then screener.in joined on the NSE symbol.
   * Fractal Analytics was Information Technology's largest name there and
   * "Unclassified" here, and `?sector=Information Technology` dropped it.
   *
   * `companySectorIndex` is that classification, a projection of
   * `companyExposure` and deliberately not a second resolver. Built over every
   * company share rather than over `currentHoldings`, exactly as Family &
   * Entities builds it: a company's sector does not depend on how much of it
   * the family holds.
   *
   * THE FUND TIER IS LOADED ON THE SECURITY AXIS ONLY, and that costs nothing
   * on the other three — measured, and asserted by `monitorSectors.test.ts`:
   * for every company share this book holds, the fund filings place nothing
   * the statement and screener.in do not already place. The suite fails the
   * day a drop brings one they would, which is when this has to load the
   * filings everywhere.
   */
  const companySectors = useMemo(
    () => companySectorIndex(consolidated.filter(isCompanyShare), exposure),
    [consolidated, exposure],
  );
  /** A company share's sector through the shared index; anything else keeps what its statement printed. */
  const sectorOfPos = useCallback((p: Position) =>
    isCompanyShare(p) ? companySectors.get(p.securityKey)?.sector || UNCLASSIFIED_SECTOR : p.sector,
  [companySectors]);
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
  const holdView = useTableView("monitor", holdCols, { legacyKeys: MONITOR_LEGACY_KEYS });
  /**
   * AND THE ACCESSORS GAIN ONE PER MEASURE, so each return column sorts on the
   * figure it prints rather than on `returnPct` for all of them.
   */
  const holdAccessors = useMemo(
    // `portfolio` is not narrowed until the guard below and a hook cannot sit
    // after one; these accessors are only ever called from `sortRows` under it,
    // so the fallback is unreachable rather than a default date standing in.
    () => ({ ...MONITOR_ACCESSORS, ...returnAccessorsFor<Row>(returnMeasures, (r, m) => measuredReturn(r, m, portfolio?.asOf ?? "")) }),
    [returnMeasures, portfolio?.asOf]);
  // ORDER-INDEPENDENT BY CONSTRUCTION: a span struck on the view's own column
  // count cannot drift from the header when a reader moves a column, where the
  // literal it replaced had to be kept in step by hand.
  const COL_COUNT = holdView.order.length;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /**
   * ── ONE EXPANDER, AND THE SECOND ONE WENT ──────────────────────────────────
   *
   * The Invested cell used to carry its own chevron, opening WHEN a holding was
   * bought as a separate table under the row, beside the one the name opened.
   * Two expanders on one row, each drawing a table with columns of its own, is
   * the arrangement the family asked to be rid of on the Private Market page —
   * *"instead of seeing these kind of sub-rows which have data indented towards
   * the right and left, this does not make sense"* — and asked for here too. A
   * row opens once now, into rows of this table: the statements behind it, and
   * under each statement the dated contributions that bought it.
   *
   * A SECTION CAN CLOSE, which the standard gives every band. Keyed on the axis
   * as well as the section, so closing "AIF" on Category does not close a
   * basket of another name on the next axis.
   */
  const [closedSections, setClosedSections] = useState<Set<string>>(() => new Set());
  const toggleSection = (k: string) =>
    setClosedSections((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [exporting, setExporting] = useState(false);
  // REALISED IS THE BOOK'S OWN NOW, per holding and matched FIFO — see
  // `Position.realizedPnL`. It used to be fetched from the archive's sales and
  // keyed per SECURITY across the whole book, which is why a mandate row could
  // show none of it and the footer could not tie to its own column.
  if (!portfolio) return null;
  const positions = portfolio.positions;
  // Owner comes from the account registry, never from the account string.
  const accIdx = useMemo(() => accountIndex(portfolio.accounts), [portfolio.accounts]);
  const owner = (p: Position) => ownerOf(accIdx, p);
  /**
   * WHERE EVERY RETURN WINDOW ON THIS PAGE ENDS — the date the holding's value
   * is struck: a live quote's own day, AMFI's NAV date, or the account's own
   * statement date. It used to be `portfolio.asOf`, the book's NEWEST date
   * (29 Aug 2026 — two quantity-only trust demats), so every CAGR here was
   * annualised over days nobody measured: Crompton read −19.65% over 543 days
   * where its own window is 392 days and −26.14%. See `valueDateOf`.
   */
  const nowMs = useMemo(() => Date.now(), []);
  const valueDate = (x: Position) => valueDateOf(x, accIdx.get(x.accountId)?.asOf, nowMs);
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
     * ── ONE OPTION PER COMPANY, AND IT IS STRUCK ON THE KEY ─────────────────
     *
     *   "when I am searching Kaynes in the search bar, it is coming up in small
     *    cap and large cap both. It should be a single name only."
     *
     * The list offered `Kaynes Technology` AND `KAYNES TECHNOLOGY INDIA
     * LIMITED`. They are one company: the book holds it (Ankita's demat) and
     * HDFC Balanced Advantage discloses it, and the look-through had already
     * joined the two on the ISIN — onto the SAME row. The list alone still
     * compared NAMES, so the fund's spelling of a company the book holds was
     * offered as a second company; and picking only that one drew a derived row
     * holding ₹79,181 and none of the family's ₹1.64 Cr in the same shares, so
     * which of the two a reader clicked changed the answer.
     *
     * So a company the BOOK holds is offered once, under the book's own label,
     * and the look-through adds only what the book does not hold — by key,
     * never by comparing two spellings of one name.
     */
    const bookKeys = new Set(positions.map((p) => p.securityKey));
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
      for (const e of exposure.byKey.values()) {
        if (bookKeys.has(e.key)) continue;
        // A company the family holds as a RECORDED line is offered under their
        // own statement's name — the row it picks is labelled the same way
        // (`labelByKey`), so the option and the row are one string.
        const name = recordedLabel(e.key) ?? e.name;
        mv.set(name, (mv.get(name) ?? 0) + e.total);
      }
    }
    return [...mv.keys()].sort((a, b) => (mv.get(b) ?? 0) - (mv.get(a) ?? 0));
  }, [positions, bySecurity, exposure]);
  /**
   * THE LABEL A DERIVED ROW IS FILED UNDER — the book's own where the book holds
   * the key, so the row a reader picks and the option they picked it by are the
   * same string. A company the book holds and the ₹1,000 floor or a redemption
   * keeps off the table is the one case where a look-through row stands alone
   * for a key the pick-list names by the book's label.
   */
  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of positions) if (!m.has(p.securityKey)) m.set(p.securityKey, p.security);
    // …AND A COMPANY THE FAMILY HOLDS ONLY AS A RECORDED LINE (Stage 10cz) — a
    // demat's last-movement row the quote feed has not priced yet is no
    // position, so its derived row would otherwise wear a fund's filing name.
    for (const l of allRecordedLines()) {
      if (!m.has(l.homeKey)) m.set(l.homeKey, recordedLabel(l.homeKey) ?? l.security);
    }
    return m;
  }, [positions]);
  /**
   * ── A PICKED HOLDING THIS AXIS DOES NOT DRAW AS A ROW, NAMED ───────────────
   *
   * The pick-list offers every holding on every axis — a reader searches the
   * book, not the view — but on All Securities only a COMPANY SHARE is a row: a
   * fund is one purchase of somebody else's portfolio, and its money is in the
   * five-bucket partition in the Total exposure footer's hover (Stage 10aj, and
   * Stage 10ci, which moved it there). So picking "Sanshi Fund-I" there drew an
   * empty table over a footer of ₹0 — a family who KNOW they hold it being told
   * nothing matched, which is the BSE search's defect one control over.
   *
   * It became the ordinary case rather than an edge one when All Securities
   * became the default view, so the table now says which picked holdings are not
   * rows here and why, and offers the one click that shows them: Category, where
   * every holding is a row. The selection is kept across that click.
   *
   * ONLY A HOLDING CATEGORY WOULD DRAW, because the line promises a row there.
   * The pick-list also offers a closed position (3P, redeemed to nil) and a
   * holding the reader's own entity or sector filter excludes; Category draws
   * neither, so naming one here would send the reader to an empty table. Those
   * keep the generic line, which names the reader's filters as the cause. The
   * tests are the row build's own — `currentHoldings`, then entity, then sector
   * — and the section filter is not one of them because switching axis clears it.
   */
  const pickedNotRows = useMemo(() => {
    if (!bySecurity || selected.size === 0) return [] as string[];
    const names = new Set<string>();
    for (const p of currentHoldings(positions)) {
      if (!selected.has(p.security) || isCompanyShare(p)) continue;
      if (entity !== "All" && ownerOf(accIdx, p) !== entity) continue;
      if (sector !== "All" && p.sector !== sector) continue;
      names.add(p.security);
    }
    return [...names];
  }, [bySecurity, selected, positions, entity, sector, accIdx]);
  // Lets the sector filter reach the Transactions tape, which carries no sector of its own.
  const sectorByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of positions) m.set(p.securityKey, sectorOfPos(p));
    return m;
  }, [positions, sectorOfPos]);
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
   * count and the section counts. They are not named on this table — the note
   * that named them went at Stage 10ax, and the sweep asserts it stays gone —
   * but they are not silently gone either: `/holdings` counts what it leaves
   * out in its row-count hover, and the money a redemption returned is on
   * Transactions under Sells (MH-17).
   */

  const { rows, totMV, totCost, totPnL, totFifo, totFifoCosted, footCover, rawMV, weightBase, weightCount, bucketTotals, smallDropped, realisedFacts, dupCost, dupPnl, markDates } = useMemo(() => {
    // Closed positions first, so nothing downstream has to remember to exclude
    // them: the filters, the weight base, the footer and every section subtotal
    // are struck over what the family actually holds.
    let base = currentHoldings(positions);
    /**
     * WHAT "EVERY HOLDING OF A MANDATE" IS MEASURED AGAINST — the unfiltered
     * book. A filter that drops one share of a mandate drops the mandate back
     * to holding-by-holding, because its capital cannot be divided among the
     * shares left in view (`fifoTotals`).
     */
    const fifoOpts = { accounts: accIdx, universe: base };
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
    /* WHAT THE FLOOR TAKES FROM WHICH TOTAL (MSX-23). On the Security view the
       row totals are company shares alone, so only the specks that ARE company
       shares leave them; the weight base and the partition leave out all of
       it. "Every total beside it" said the whole amount of both. */
    const smallShares = small.filter(isCompanyShare);
    const smallDropped = { count: small.length, value: sum(small.map((x) => x.marketValue)),
      shareCount: smallShares.length, shareValue: sum(smallShares.map((x) => x.marketValue)) };
    if (entity !== "All") base = base.filter((p) => ownerOf(accIdx, p) === entity);
    if (sector !== "All") base = base.filter((p) => sectorOfPos(p) === sector);
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
    /**
     * ONE ROW PER STRATEGY, NOT PER ACCOUNT (Stage 10dl). Two members' accounts
     * of one strategy — Goldstandard's Aristos for Ajay and Ankita, Green
     * Lantern's GLC Growth, SVAN's Velocity, V.E.C's Small and Mid-Cap — were
     * two rows with one name, told apart only by the Entities column. They are
     * one row now, keyed on the manager and the strategy within the row's own
     * section, and each account is a line in its drop-down.
     *
     * THE BY-ENTITY VIEW KEEPS ONE ROW PER ACCOUNT, because there a row IS one
     * statement as printed — §"consolidated counts once, per-account does not".
     * The section is part of the key on both, so a group never spans two
     * sections and is summed into both.
     */
    const mandateGroups = new Map<string, string[]>();
    for (const [accountId, ps] of mandateOf) {
      const acc = accIdx.get(accountId);
      const gk = consolidate
        ? `${groupKeyFor(groupAxis, accIdx, ps[0])}|${acc?.provider ?? ""}|${mandateLabel(acc)}`
        : accountId;
      (mandateGroups.get(gk) ?? mandateGroups.set(gk, []).get(gk)!).push(accountId);
    }
    /** One account's own figures — exactly what its row used to carry. */
    const mandateLine = (accountId: string, ps: Position[]): MandateAccountLine => {
      const acc = accIdx.get(accountId);
      const mv = sum(ps.map((x) => x.marketValue));
      const cf = costedFigures(ps);
      const costNA = cf.cost === null || (cf.cost === 0 && mv > 0);
      const livePs = ps.filter((x) => x.live);
      const liveMV = sum(livePs.map((x) => x.marketValue));
      const dayChange = sum(livePs.map((x) => x.dayChange ?? 0));
      const whole = mandateTotals.get(accountId);
      const fifo = fifoTotals(ps, fifoOpts);
      return {
        accountId, accountNo: acc?.accountNo ?? "", owner: ownerOf(accIdx, ps[0]), asOf: acc?.asOf ?? "",
        positions: ps,
        marketValue: mv, costBasis: cf.cost, unrealizedPnL: costNA ? null : cf.unrealised, costNA,
        invested: costNA ? null : fifo.invested,
        returnPct: costNA ? null : fifo.returnPct,
        realised: fifo.realised,
        fifo,
        capital: datedCap?.behind(ps, fifoOpts.universe) ?? undefined,
        live: livePs.length > 0, liveMV,
        dayChangePct: livePs.length && liveMV - dayChange !== 0 ? (dayChange / (liveMV - dayChange)) * 100 : null,
        valuedAt: commonValueDate(ps.map(valueDate)),
        holdings: ps.length, accountMV: whole?.mv ?? mv, accountCount: whole?.count ?? ps.length,
      };
    };
    const mandateRows: Row[] = [...mandateGroups.values()].map((accountIds) => {
      const lines = accountIds.map((a) => mandateLine(a, mandateOf.get(a)!)).sort((a, b) => b.marketValue - a.marketValue);
      const ps = lines.flatMap((l) => l.positions);
      const acc = accIdx.get(lines[0].accountId);
      const mv = sum(ps.map((x) => x.marketValue));
      // Cost and its gain over ONE set — the constituents that report a cost —
      // through the same helper every clubbed row uses (A-02). A constituent
      // whose statement carries no cost contributes nothing rather than a zero,
      // which would report its whole market value as profit. Every PMS row in
      // this drop reports one, so on this book the two constructions agree.
      const cf = costedFigures(ps);
      const cost = cf.cost;
      const pnl = cf.unrealised;
      const costNA = cost === null || (cost === 0 && mv > 0);
      // The day figure is struck over the LIVE-PRICED constituents only, and the
      // row carries that value separately: a mandate whose shares are half
      // quoted must not divide its move by the half that never moved.
      const livePs = ps.filter((x) => x.live);
      const liveMV = sum(livePs.map((x) => x.marketValue));
      const dayChange = sum(livePs.map((x) => x.dayChange ?? 0));
      // FIFO OVER EVERY ACCOUNT ON THE ROW: each account that is whole is struck
      // on its own capital since inception and the row pools them, so the row's
      // return is (Σ value + Σ withdrawn − Σ paid in) ÷ Σ paid in — never an
      // average of the members' percentages.
      const fifo = fifoTotals(ps, fifoOpts);
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
        valuedAt: commonValueDate(ps.map(valueDate)),
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
        key: "mandate:" + [...accountIds].sort().join("+"),
        /**
         * THE MANDATE'S NAME ALONE — the owners ride in the Entities column, and
         * since Stage 10dl a strategy two members hold is one row, so its name
         * is no longer ambiguous at all. `mandateLabelWithOwner` stays for
         * callers that render a mandate OUTSIDE this table.
         */
        security: mandateLabel(acc),
        securityKey: "", sector: "", assetClass: "",
        entities: [...new Set(lines.map((l) => l.owner))],
        quantity: null, avgCost: null, currentPrice: null,
        costCover: cf,
        costBasis: cost, marketValue: mv, unrealizedPnL: costNA ? null : pnl,
        // FIFO: a whole mandate on its capital since inception, a filtered one
        // holding by holding — never the survivors' unrealised over their cost.
        returnPct: costNA ? null : fifo.returnPct,
        realised: fifo.realised,
        fifo,
        // *"Invested shows what FIFO divides by"* — a whole mandate's capital
        // paid in; a filtered one, the cost of the shares left in view.
        invested: costNA ? null : fifo.invested,
        weight: weightBase > 0 ? mv / weightBase : 0,
        costNA,
        // WHOLE, each account carries its dated record, and the row pools the
        // money-weighted rate over all of them; filtered to part of one, it has
        // none of its own.
        capital: datedCap?.behind(ps, fifoOpts.universe) ?? undefined,
        live: livePs.length > 0,
        dayChange,
        dayChangePct: livePs.length && liveMV - dayChange !== 0 ? (dayChange / (liveMV - dayChange)) * 100 : null,
        liveMV,
        realizedKeys: [...new Set(ps.map((x) => x.securityKey))],
        mandate: {
          accounts: lines,
          name: mandateLabel(acc),
          manager: acc?.provider ?? "",
          holdings: ps.map((x) => ({
            securityKey: x.securityKey, security: x.security, sector: sectorOfPos(x),
            quantity: x.quantity, avgCost: x.avgCost, currentPrice: x.currentPrice,
            costBasis: x.costBasis, marketValue: x.marketValue, unrealizedPnL: x.unrealizedPnL,
            returnPct: x.returnPct, costNA: !!x.costUnavailable || x.costBasis === null, live: !!x.live,
            dayChangePct: x.dayChangePct ?? null,
            heldSince: x.heldSince, assetClass: x.assetClass, investedOn: investedOnOf([x]),
            valuedAt: valueDate(x),
            accountId: x.accountId,
            realised: typeof x.realizedPnL === "number" ? x.realizedPnL : null,
            realisedLotsAfter: x.realizedLotsAfter ?? null,
          })).sort((a, b) => b.marketValue - a.marketValue),
          accountMV: sum(lines.map((l) => l.accountMV)), accountCount: sum(lines.map((l) => l.accountCount)),
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
       * ICICI Bank is held both ways in this drop — Ankita's own demat and
       * Goldstandard's Aristos mandate — and it is two rows, one under Direct
       * Equity and one inside the mandate, which is this key doing its job. It
       * carries no realised figure, so no money moves between them (MH-17).
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
        /**
         * COST, ITS UNITS, ITS VALUE AND ITS GAIN ARE STRUCK OVER ONE SET (A-02).
         *
         * This was `sumOrNull(cost)` set against EVERY unit and EVERY rupee of
         * value: ICICI Bank's 7,000 costed shares' ₹94.2 L divided by all
         * 21,500 printed an average cost of ₹438.34 where those shares cost
         * ₹1,346.33 each, and its P&L read +₹2.06 Cr where the costed shares
         * had gained +₹5.98 L. `costedFigures` strikes all three over the lines
         * that report a cost and names the rest in the cells' hovers.
         */
        const cf = costedFigures(dps);
        const cost = cf.cost;
        // A COUNT OVER EVERY LINE OR NONE: the review records most private
        // investments with no share count (Stage 10dh), and adding the lines
        // that do print one would state a holding of fewer shares than it is.
        const qty = totalQuantity(dps);
        const costNA = cost === null || (cost === 0 && mv > 0);
        const pnl = costNA ? null : cf.unrealised;
        // ONE MARK OR NONE (A-03): DSP Gold's two statements mark it at ₹151.10
        // and ₹141.24, and the first printed over all 14,00,000 units read as a
        // ₹21.15 Cr holding beside the row's own ₹19.98 Cr.
        const mark = commonMark(dps, markKey);
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
        const fifo = fifoTotals(dps, fifoOpts);
        return {
          kind: "security" as const, bucket: groupKeyFor(groupAxis, accIdx, ps[0]),
        groupSource: groupSourceFor(groupAxis, accIdx, ps[0]),
          key: ps[0].securityKey, security: fundClasses.length ? splitFundClass(ps[0].security)!.fund : ps[0].security,
          securityKey: ps[0].securityKey, sector: sectorOfPos(ps[0]), assetClass: ps[0].assetClass,
          fundClasses,
          entities: Array.from(new Set(ps.map((x) => ownerOf(accIdx, x)))), quantity: perUnit ? qty : null,
          avgCost: perUnit && !costNA ? cf.avgCost : null,
          currentPrice: perUnit ? mark.price : null,
          splitMarks: perUnit && mark.price === null && mark.values.length > 1 ? mark.values : [],
          costCover: cf,
          navPriced: perUnit && !!ps[0].navPriced, navDate: ps[0].navDate,
          depositoryAsOf: ps.find((x) => x.depositoryUnits)?.depositoryUnits?.asOf ?? null,
          depositoryWhy: ps.some((x) => x.depositoryUnits) ? depositoryUnitsGist(ps) : null,
          costBasis: cost, marketValue: mv, unrealizedPnL: pnl,
          // FIFO over the row's own deduped holdings: the realised gain on
          // units already sold stays in the return (`fifoTotals`).
          returnPct: costNA ? null : fifo.returnPct,
          realised: fifo.realised,
          fifo,
          weight: weightBase > 0 ? mv / weightBase : 0,
          costNA,
          // Every line the review's, held at cost — no gain to strike (Stage 10dh).
          valuedAtCost: dps.every((x) => x.valuedAtCost === true),
          heldSince,
          // The deduped set's ONE value date, or null where its lines are marked
          // on different dates — that row refuses to annualise rather than pick.
          valuedAt: commonValueDate(dps.map(valueDate)),
          // A fund's row over its WHOLE folios is those accounts, and carries
          // their dated record's money-weighted rate; a share inside an account
          // is not an account and carries none. The deduped set, like every
          // other figure here: one of two trusts reporting one holding.
          capital: datedCap?.behind(dps, fifoOpts.universe) ?? undefined,
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
          venues: venuesOf(ps, accIdx, valueDate),
          isin: ps.find((x) => x.isin)?.isin ?? null,
        };
      });
    } else {
      out = rest.map((p) => ({
        kind: "security" as const, bucket: groupKeyFor(groupAxis, accIdx, p),
        groupSource: groupSourceFor(groupAxis, accIdx, p),
        key: p.securityKey + "@" + p.accountId, security: p.security, securityKey: p.securityKey, sector: sectorOfPos(p), assetClass: p.assetClass,
        entities: [ownerOf(accIdx, p)], fundClasses: [], quantity: p.quantity, avgCost: p.avgCost, currentPrice: p.currentPrice,
        navPriced: !!p.navPriced, navDate: p.navDate,
        depositoryAsOf: p.depositoryUnits?.asOf ?? null,
        depositoryWhy: p.depositoryUnits ? describeDepositoryUnits(p.depositoryUnits, portfolio.accounts) : null,
        costBasis: p.costBasis, marketValue: p.marketValue, unrealizedPnL: p.unrealizedPnL,
        returnPct: p.returnPct, weight: weightBase > 0 ? p.marketValue / weightBase : 0,
        realised: p.realizedPnL ?? null,
        fifo: fifoTotals([p], fifoOpts),
        costNA: !!p.costUnavailable || p.costBasis === null,
        valuedAtCost: p.valuedAtCost === true,
        heldSince: p.heldSince,
        valuedAt: valueDate(p),
        // One statement line that is the whole folio IS the account.
        capital: datedCap?.behind([p], fifoOpts.universe) ?? undefined,
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
       * A DERIVED ROW SURVIVES THE PICK-LIST AND THE SECTOR FILTER.
       *
       * The entity filter still suppresses it, and must: a company the family
       * reach only through a fund has no account and so no entity — a filter
       * that looked like it narrowed and did not is worse than one that says
       * what it dropped. (The sector filter used to suppress it too, on the
       * ground that the book carries no sector for a company it does not hold;
       * see below for why that stopped being true.) The SECURITY filter is different now that the list offers these
       * names (see `securityNames`): picking LIC Housing Finance and being shown
       * nothing is the defect the family reported, not a narrowing.
       */
      // THE SECTOR FILTER NO LONGER SUPPRESSES A DERIVED ROW. It did while the
      // book carried no sector for a company it does not hold; the shared index
      // places one through the fund filings and screener.in, which is how
      // Sector Composition's Consolidated view counts it, so `?sector=` keeps
      // the derived rows the index places in that sector and drops the rest.
      const derivedShown = ex && entity === "All";
      if (derivedShown) {
        for (const e of ex.byKey.values()) {
          if (matched.has(e.key)) continue;
          const eSector = companySectors.get(e.key)?.sector || UNCLASSIFIED_SECTOR;
          if (sector !== "All" && eSector !== sector) continue;
          const label = labelByKey.get(e.key) ?? e.name;
          if (selected.size > 0 && !selected.has(label)) continue;
          out.push({
            kind: "security" as const,
            bucket: SECURITY_SECTION,
            groupSource: null,
            key: "derived:" + e.key,
            security: label,
            securityKey: e.key,
            // A derived look-through row stands for a company inside a fund, so
            // there is no unit class to club and none to name.
            fundClasses: [],
            sector: eSector,
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
            realised: null, fifo: null,
            weight: weightBase > 0 ? e.total / weightBase : 0,
            costNA: true,
            heldSince: null,
            valuedAt: null,
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
      if (!t) bucketTotals.set(k, (t = { mv: 0, cost: null, pnl: null, costedMV: 0, costedCount: 0, atCostMV: 0, atCostCount: 0, heldCount: 0, names: new Set<string>(), fifo: fifoTotals([]), vacuous: false, dupCost: 0, dupPnl: 0 }));
      t.mv += x.marketValue;
      t.heldCount += 1;
      t.names.add(x.securityKey);
      // `sumOrNull` semantics, accumulated: a statement that reports no cost
      // contributes NOTHING rather than a zero, and a category where none of
      // them does stays null and renders an em dash with its reason.
      if (x.costBasis != null) { t.cost = (t.cost ?? 0) + x.costBasis; t.costedMV += x.marketValue; t.costedCount += 1; }
      // A line held at cost is in the cost and in no gain (`unrealizedPnL` is
      // null on it), and it is named apart so the cells can say so.
      if (x.costBasis != null && isValuedAtCost(x)) { t.atCostMV += x.marketValue; t.atCostCount += 1; }
      if (x.unrealizedPnL != null) t.pnl = (t.pnl ?? 0) + x.unrealizedPnL;
    }
    // Each section's FIFO totals, over exactly the positions its totals row sums
    // — and the one test for a cost total over nothing (`costedFigures`, A-14).
    for (const [k, t] of bucketTotals) {
      const inSection = db.filter((x) => groupKeyFor(groupAxis, accIdx, x) === k);
      t.fifo = fifoTotals(inSection, fifoOpts);
      if (costedFigures(inSection).vacuous) { t.vacuous = true; t.cost = null; t.pnl = null; }
    }
    /**
     * THE OVERLAP, ON THE BY-ENTITY VIEW ONLY (MH-12). There the rows are each
     * statement as printed, so a position the dedupe dropped is IN the rows and
     * not in any total; on a consolidated view the rows are consolidated too and
     * nothing is counted twice. Each section and the footer name the cost and
     * the gain of what they count once, beside the market value the band names.
     */
    const kept = new Set(db);
    const dupDropped = consolidate ? [] : footerSet.filter((x) => !kept.has(x));
    for (const x of dupDropped) {
      const t = bucketTotals.get(groupKeyFor(groupAxis, accIdx, x));
      if (!t) continue;
      if (x.costBasis != null) t.dupCost += x.costBasis;
      if (x.unrealizedPnL != null) t.dupPnl += x.unrealizedPnL;
    }
    const dupCost = sum(dupDropped.map((x) => x.costBasis ?? 0));
    const dupPnl = sum(dupDropped.map((x) => x.unrealizedPnL ?? 0));
    // The footer on the same rule: a filter that leaves only a section like Cash
    // in view must not print Invested ₹0 over what no statement costs.
    const footCover = costedFigures(db);
    const totFifo = fifoTotals(db, fifoOpts);
    /**
     * WHAT THE FOOTER'S REALISED COUNTS AND LEAVES OUT, measured on the same set
     * (MH-05). The statements' own total is struck over the accounts of the
     * entity in view — every account when none is picked — which is the scope
     * Capital Gains prints it on. A holding no longer held is found in the raw
     * `positions`, through the same filters the table applies, so a Direct Equity
     * section never names a redeemed AIF.
     */
    const inScope = (p: Position) => (entity === "All" || ownerOf(accIdx, p) === entity)
      && (sector === "All" || sectorOfPos(p) === sector)
      && (bucket === "All" || groupKeyFor(groupAxis, accIdx, p) === bucket)
      && (selected.size === 0 || selected.has(p.security))
      && (!bySecurity || isCompanyShare(p));
    // What `currentHoldings` took off the table, by its own two rules — a fund
    // redeemed to nil, and a speck under the ₹1,000 floor — so each is named for
    // what it is rather than both as "redeemed".
    const offTable = droppedHoldings(positions);
    const withRealised = (xs: Position[]) => dedupedPositions(xs.filter((p) => inScope(p)
      && typeof p.realizedPnL === "number" && p.realizedPnL !== 0));
    const gone = withRealised(offTable.closed);
    const specks = withRealised(offTable.negligible);
    const stmts = BOOK_CAPITAL_GAINS.filter((c) => (c.realisedST !== null || c.realisedLT !== null)
      && (entity === "All" || (!!c.accountId && ownerOf(accIdx, { accountId: c.accountId } as Position) === entity)));
    const dates = (xs: (string | null | undefined)[]) => xs.filter((d): d is string => !!d).sort();
    /**
     * THE DATES THE FOOTER'S MARKET VALUE BLENDS (MH-08). Every row states its
     * own mark's date; the total adds marks struck on different days — a
     * statement's own date, AMFI's published NAV date, a live quote's moment —
     * and nothing on the page said so once the basis pills were removed.
     */
    const onStmt = dates(db.filter((x) => !x.live && !(x.navPriced && x.navDate)).map((x) => accIdx.get(x.accountId)?.asOf));
    const onNav = dates(db.filter((x) => !x.live && x.navPriced && x.navDate).map((x) => x.navDate));
    const markDates = {
      stFrom: onStmt[0] ?? null, stTo: onStmt.at(-1) ?? null, stCount: onStmt.length,
      navFrom: onNav[0] ?? null, navTo: onNav.at(-1) ?? null, navCount: onNav.length,
      live: db.filter((x) => x.live).length,
    };
    const whole = new Set(totFifo.wholeMandates);
    const realisedFacts: RealisedBasisFacts = {
      statements: stmts.length ? {
        total: sum(stmts.map((c) => (c.realisedST ?? 0) + (c.realisedLT ?? 0))),
        accounts: stmts.length,
        from: dates(stmts.map((c) => c.periodFrom))[0] ?? null,
        to: dates(stmts.map((c) => c.periodTo)).at(-1) ?? null,
      } : null,
      closed: { names: [...new Set(gone.map((p) => p.security))], realised: sum(gone.map((p) => p.realizedPnL as number)) },
      floor: { holdings: specks.length, realised: sum(specks.map((p) => p.realizedPnL as number)) },
      after: {
        sales: sum(db.map((x) => x.realizedLotsAfter ?? 0)),
        holdings: db.filter((x) => (x.realizedLotsAfter ?? 0) > 0).length,
      },
      companiesOnly: bySecurity,
      recorded: db.filter((x) => !whole.has(x.accountId) && typeof x.realizedPnL === "number").length,
    };
    return {
      rows: out, totMV: totalMV, realisedFacts, dupCost, dupPnl, markDates,
      totCost: footCover.cost,
      totPnL: footCover.unrealised,
      footCover,
      totFifo,
      /**
       * THE FOOTER'S RETURN IS OVER THE HOLDINGS THAT REPORT A COST — the set its
       * own Invested and Unrealised cells already sum (`sumOrNull` skips the
       * rest), and the set Morning CIO's Consolidated return tile is struck over.
       * Over the whole book the coverage test refuses it, because 60 depository
       * rows print no cost; that is right for a CATEGORY a reader compares, and
       * wrong for a footer whose two neighbouring cells are already the costed
       * set. The uncosted remainder is named in the cell's own arithmetic.
       *
       * NO MANDATE CAN FALL OUT OF "WHOLE" BY THE FILTER: measured, no PMS
       * mandate holds a current position without a cost. And the realised cell
       * reads `totFifo`, which is the same figure — an uncosted holding carries
       * no realised half in `fifoTotals`.
       */
      // Over the holdings a gain is struck on (`strikesGain`): a review line
      // HELD AT COST reports a cost and no valuation, so it is in Invested and
      // in no return (Stage 10dh) — Morning CIO's Consolidated return does the same.
      totFifoCosted: fifoTotals(db.filter(strikesGain), fifoOpts),
      rawMV: sum(out.map((r) => r.marketValue)),
      costedMV: sum(costed.map((x) => x.marketValue)),
      costedCount: costed.length,
      heldCount: db.length,
      weightBase, weightCount, bucketTotals, smallDropped,
    };
  }, [positions, accIdx, mandateTotals, consolidate, bySecurity, exposure, selected, sector, entity, bucket, groupAxis, labelByKey, datedCap, sectorOfPos, companySectors]);
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
        //
        // AND A GAP UNDER A RUPEE IS NOT A HOLDING REPORTED TWICE. `raw` sums the
        // ROWS and `subtotal` the POSITIONS, so the two add the same numbers in a
        // different order, and once published NAVs put unrounded values on the
        // rows the difference is a floating-point residue of a few millionths of
        // a rupee. `> 0` read that as a duplicate and printed "₹0 reported twice,
        // counted once" over the Mutual Fund and Thematic & Tactical headings — a
        // sentence asserting a double count that does not exist, beside a figure
        // that rounds to nothing. The footer's own gap (`dupGap`) has always
        // required more than a rupee; this is the same bound.
        const gap = raw - subtotal;
        const collapsed = gap > 1 ? gap : 0;
        /**
         * ── ONE NOUN PER COUNT (MH-06) ──────────────────────────────────────
         *
         * "N holdings" meant three different counts on one screen and its
         * drill-down: this band counted ROWS with each mandate expanded to its
         * shares, so Sanshi's two classes clubbed into one row read as one
         * holding (AIF: 10), the totals row's hover counted deduped POSITIONS
         * (16), and `/holdings` prints "16 holdings · 11 names".
         *
         * `holdings` is now the deduped positions the section's totals are
         * struck over — `bucketTotals`, the same partition the footer sums — and
         * `names` the distinct securities among them, which is exactly what the
         * `/holdings` drill-down for the same section prints. On the by-entity
         * view the rows are each statement as printed, so the band also says how
         * many statement LINES it draws where that differs: a line is not a
         * holding when two members' statements report the same one.
         */
        const holdings = totals?.heldCount ?? rs.length;
        const names = totals?.names.size ?? rs.length;
        const lines = rs.reduce((n, r) => n + (r.mandate ? r.mandate.holdings.length : 1), 0);
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
        /**
         * …AND BY WHICH OF THEIR TWO RULES. The direct-stock rule and the cash
         * instruction are separate sources (`TaxonomySource`), so they are
         * summed apart and printed apart: one sentence about "all the direct
         * stocks" over a Liquidity basket full of arbitrage funds would name
         * the wrong rule beside the largest figure in the section.
         */
        const ruleSeen = new Set<string>();
        let ruleMV = 0;
        let cashRuleMV = 0;
        for (const r of rs) {
          if (r.groupSource !== "rule" && r.groupSource !== "cash-rule") continue;
          if (r.dedupeGroup) { if (ruleSeen.has(r.dedupeGroup)) continue; ruleSeen.add(r.dedupeGroup); }
          if (r.groupSource === "rule") ruleMV += r.marketValue;
          else cashRuleMV += r.marketValue;
        }
        return {
          key, rows: rs, subtotal, collapsed, holdings, names, lines, ruleMV, cashRuleMV,
          day, dayBase, liveRows: live.length,
          dayPct: live.length && dayBase - day !== 0 ? (day / (dayBase - day)) * 100 : null,
          totals,
        };
      })
      .sort((a, b) => groupOrdFor(groupAxis)(a.key) - groupOrdFor(groupAxis)(b.key));
  }, [rows, bucketTotals, groupAxis]);  const showBucketSections = bucket === "All" && bucketGroups.length > 1;
  /**
   * THE DATED CONTRIBUTIONS, PER STATEMENT LINE — struck once over the row set
   * rather than per open row, because a row says how many it opens onto before
   * anyone opens it (`data-tranche-rows`, and the chevron's own label).
   *
   * PER LINE, NOT PER ROW. A consolidated row is one security across several
   * statements, and a contribution belongs to ONE of them — the folio it bought
   * units in. Hung from its own line it ties to that line's units, cost and
   * value by the book's own gate (`trancheTable` refuses a folio whose
   * allotments do not account for every unit held), where one blended table
   * under the row put four members' contributions under one heading and needed
   * an Entity column to tell them apart. In the by-entity view the row IS one
   * statement, so its contributions hang from the row itself.
   */
  const trancheInfo = useMemo(() => {
    const out = new Map<string, { byVenue: Map<string, TrancheTable>; direct: TrancheTable | null; count: number }>();
    for (const r of rows) {
      if (r.kind === "mandate") continue;
      const byVenue = new Map<string, TrancheTable>();
      let direct: TrancheTable | null = null;
      let count = 0;
      if (r.venues) {
        for (const v of r.venues) {
          const t = trancheTable(v.positions, BOOK_POSITION_TRANCHES, "cagr", valueDate);
          if (t) { byVenue.set(`${v.securityKey}@${v.accountId}`, t); count += t.rows.length; }
        }
      } else if (r.trancheSet.length) {
        direct = trancheTable(r.trancheSet, BOOK_POSITION_TRANCHES, "cagr", valueDate);
        count = direct?.rows.length ?? 0;
      }
      if (count) out.set(r.key, { byVenue, direct, count });
    }
    return out;
  }, [rows, accIdx, nowMs]);
  // NULL when the visible rows carry no cost between them — the total-return
  // cell then renders `—` instead of a 0.00% nobody measured.
  // FIFO over the footer's own COSTED positions — the same `fifoTotals` every
  // row and section is struck with, so the three cannot divide three different
  // ways, over the set the Invested and Unrealised cells beside it already sum.
  const totalRet = totFifoCosted.returnPct;
  // In the by-entity view the displayed rows include both members' copies of a
  // dually-reported holding; name the gap so the footer (consolidated) reads true.
  const dupGap = !consolidate && rawMV - totMV > 1 ? rawMV - totMV : 0;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  /**
   * WHAT THE FOOTER'S MONEY COLUMNS ARE STRUCK OVER, SAID ONCE (MH-11, MSX-16).
   * "Every asset class, not the listed ones alone" was false on the Security
   * view (company shares only) and "across N rows" named a set the cost is not
   * summed over: Invested and P&L add only the holdings whose statement reports
   * a cost, so the ones that report none are named with their value, and a
   * holding two members both report is named where the rows count it twice.
   */
  const footScope = bySecurity
    ? "company shares only, held directly or inside a manager's mandate; a company the family reaches only through a fund is in Via funds, not here"
    : "every asset class in view, listed and private alike";
  const footCostedLines = footCover.lines - footCover.uncosted.lines;
  // The holdings a gain is struck on: a cost AND a valuation (Stage 10dh). A
  // line held at cost is in Invested and in no gain or return.
  const footStruckLines = footCostedLines - footCover.atCost.lines;
  const footStruckValue = footCover.costedValue - footCover.atCost.value;
  const atCostFootNote = footCover.atCost.lines > 0
    ? `${footCover.atCost.lines === 1 ? "1 holding" : `${footCover.atCost.lines} holdings`} worth ${money(footCover.atCost.value)} ${footCover.atCost.lines === 1 ? "is a private investment" : "are private investments"} held at cost — the family's consolidated review records what was paid and no valuation — so ${footCover.atCost.lines === 1 ? "it is" : "they are"} in Invested and in no gain or return.`
    : "";
  const investedFootNote = [
    footCover.complete ? ""
      : `Only the ${footCostedLines} of ${footCover.lines} holdings whose statement reports a cost are in this figure; the other ${footCover.uncosted.lines} hold ${money(footCover.uncosted.value)} and report no cost, so they are in Market value and not here — never counted at zero.`,
    atCostFootNote,
    dupCost > 1
      ? `The rows above are each member's statement as printed, so their cost adds to ${money((totCost ?? 0) + dupCost)}; this total counts a holding two members both report once — a ${money(dupCost)} overlap.`
      : "",
  ].filter(Boolean).join(" ");
  const pnlFootNote = [
    footCover.complete ? ""
      : `The gain of the ${footStruckLines} of ${footCover.lines} holdings whose statement reports a cost and a valuation; the other ${footCover.uncosted.lines} (${money(footCover.uncosted.value)}) report no cost and are in no gain here.`,
    atCostFootNote,
    dupCost > 1 && dupPnl !== 0
      ? `The rows above count ${money(dupPnl, true)} of gain twice — a holding two members both report — and this total counts it once.`
      : "",
  ].filter(Boolean).join(" ");
  /** The rows the statements report — a derived-only company carries no date of the family's own (MSX-15). */
  const measuredRows = rows.filter((r) => !r.measuredNA);
  const markBlend = (() => {
    const span = (a: string | null, b: string | null) => (a && b && a !== b ? `${fmtDate(a)} to ${fmtDate(b)}` : a ? fmtDate(a) : "");
    const parts = [
      markDates.stCount ? `statement marks dated ${span(markDates.stFrom, markDates.stTo)}` : "",
      markDates.navCount ? `AMFI's published NAVs of ${span(markDates.navFrom, markDates.navTo)}` : "",
      markDates.live ? `${markDates.live} live quote${markDates.live === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    const kinds = parts.length;
    const oneDate = kinds === 1 && ((markDates.stCount && markDates.stFrom === markDates.stTo) || (markDates.navCount && markDates.navFrom === markDates.navTo));
    return !kinds ? "" : oneDate
      ? `Every figure in it is struck on ${parts[0].replace(/^statement marks dated |^AMFI's published NAVs of /, "")}.`
      : `It adds figures struck on different dates — ${parts.join(", ")} — so no one date stands for this total; each row names its own.`;
  })();
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
   *   cash       the book's own cash rows, and the arbitrage funds the family
 *              counts as cash — which are not looked through, because their
 *              disclosed long shares are hedged and would read as exposure
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
    // The arbitrage funds are here and NOT in the look-through — see
    // `useStockExposure`. Liquid funds stay looked through: their paper is real.
    const cash = sum(held.filter((p) => p.assetClass === "Cash" || isArbitrageFund(p)).map((p) => p.marketValue));
    /**
     * ONE DEFINITION OF CASH, AND HOW EACH VIEW FILES IT (MSX-11, B-09).
     *
     * The family's rule is `holdingBucket`'s: a Cash row, a liquid fund or
     * liquid ETF, or an arbitrage fund (`isCashEquivalent`). This axis departs
     * from it in ONE place — the liquid funds are looked through, because their
     * paper is real credit (see `heldFundVehicles`) — and the Category view in
     * one other: a mandate's cash sleeve stays inside its mandate. Neither view
     * said the other used another basis, so "the book's own cash" here read
     * ₹11.6 Cr beside a Cash section of ₹14.2 Cr on the same table. The hover
     * now states the rule's whole figure and both departures, so the two
     * reconcile on the reader's screen: this bucket − the mandates' sleeves +
     * the liquid funds = the Category view's Cash section.
     */
    const inCashRule = (p: Position) => p.assetClass === "Cash" || isCashEquivalent(p) || isArbitrageFund(p);
    const cashRule = sum(held.filter(inCashRule).map((p) => p.marketValue));
    const liquidThrough = sum(held.filter((p) => inCashRule(p) && p.assetClass !== "Cash" && !isArbitrageFund(p)).map((p) => p.marketValue));
    const mandateCash = sum(held.filter((p) => p.assetClass === "Cash" && heldUnderMandate(accIdx, p)).map((p) => p.marketValue));
    const categoryCash = sum(held.filter((p) => groupKeyFor("category", accIdx, p) === "Cash").map((p) => p.marketValue));
    const nav = sum(held.map((p) => p.marketValue));
    /**
     * THE SIXTH BUCKET (Stage 10dh): what is neither a company share, a fund
     * nor cash. Since the family's review became the source for private-market
     * lines the book carries unlisted companies' stakes and a private-credit
     * line, and this table draws neither — so without a bucket of their own the
     * parts below stopped adding to the book by ₹194 Cr. Sector Composition's
     * "not on this page" card names the same set by the same rule.
     */
    const otherRows = held.filter((p) => !isCompanyShare(p) && !isFundVehicle(p) && p.assetClass !== "Cash");
    const other = sum(otherRows.map((p) => p.marketValue));
    const otherLabels = [...new Set(otherRows.map((p) => assetClassLabel(p.assetClass)))].join(" and ");
    const ex = exposure.status === "ok" ? exposure : null;
    const derived = ex?.total ?? 0;
    const opaque = ex?.skippedValue ?? 0;
    const unaccounted = ex?.unaccountedValue ?? 0;
    const aif = (ex?.skipped ?? []).filter((sk) => /^an AIF files/.test(sk.reason));
    /**
     * WHAT THE COVERAGE COUNTS (MSX-14). `covered` counts every fund with a store
     * entry — the gold and silver ETFs among them, whose entries have no line —
     * so "N funds disclose" named funds that disclose nothing. A fund is counted
     * as READ where at least one of its lines reached a company row, and the
     * opaque part names the non-AIF funds the store does not carry rather than
     * calling every one of them a vehicle that publishes no holdings.
     */
    const fundsRead = ex ? new Set([...ex.byKey.values()].flatMap((e) => e.rows.map((r) => r.fundKey))).size : 0;
    const notInStore = (ex?.skipped ?? []).filter((sk) => !/^an AIF files/.test(sk.reason));
    return {
      nav, measured, derived, opaque, unaccounted, cash, cashRule, liquidThrough, mandateCash, categoryCash,
      other, otherLabels,
      fundsRead, zeroLine: Math.max(0, (ex?.covered ?? 0) - fundsRead),
      notInStore: { names: notInStore.map((sk) => sk.fundName), value: sum(notInStore.map((sk) => sk.marketValue)) },
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
  }, [consolidated, exposure, accIdx]);
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
  /**
   * THE DERIVED COLUMNS' HEADER HOVER, WITH WHAT THE LOOK-THROUGH COULD READ.
   * The coverage sentence was the second paragraph of the look-through card
   * inside every opened row; the card is rows now, and a claim about a column
   * belongs on the column. Both derived headers carry the same words.
   */
  /**
   * ── THE AIF FUNDS THE LOOK-THROUGH CANNOT SEE INTO, NAMED ONE PER FUND ────
   *
   *   "According to the client, Kaynes Technologies Limited is also a holding
   *    in Vikas Khemani Fund."
   *
   * That fund is the Carnelian Bharat Amritkaal Fund — an AIF — and an AIF's
   * statement reports units and a NAV and never what it owns, so a holding
   * inside it is real to the family and unmeasurable here. A sentence that only
   * COUNTED the AIFs left a reader who knows the fund holds Kaynes unable to
   * tell whether this page had looked, so each fund is NAMED, once per fund
   * rather than once per unit class. On main that was a paragraph inside every
   * opened company; here it is one line of the table that opens into one line
   * per fund (`aifOpaqueRows`), and the list is the derived columns' header
   * hover too. Empty wherever the look-through has not answered.
   */
  const aifOpaque = (() => {
    if (exposure.status !== "ok") return [];
    const by = new Map<string, { name: string; key: string; value: number }>();
    for (const sk of exposure.skipped) {
      if (!/^an AIF files/.test(sk.reason)) continue;
      const name = splitFundClass(sk.fundName)?.fund ?? sk.fundName;
      const e = by.get(name) ?? { name, key: sk.fundKey, value: 0 };
      e.value += sk.marketValue;
      by.set(name, e);
    }
    return [...by.values()].sort((a, b) => b.value - a.value);
  })();
  const derivedNote = (() => {
    if (exposure.status !== "ok") return DERIVED_NOTE;
    const other = exposure.skipped.filter((sk) => !/^an AIF files/.test(sk.reason));
    // MSX-14: the funds whose lines actually reached a company, and those read
    // from an aggregator's copy of the equity section alone — for them "every
    // asset class the filing carries" is not what was read.
    const read = new Set<string>(), agg = new Set<string>();
    for (const e of exposure.byKey.values()) {
      for (const r of e.rows) {
        read.add(r.fundKey);
        if (r.sourceKind === "aggregator") agg.add(r.fundName);
      }
    }
    return `${DERIVED_NOTE} Read from the monthly filings of ${read.size} of your ${exposure.considered} fund holdings.`
      + (agg.size ? ` ${agg.size === 1 ? "One of them" : `${agg.size} of them`} — ${[...agg].join(" · ")} — ${agg.size === 1 ? "is" : "are"} read from an aggregator's copy of the equity section alone, so what ${agg.size === 1 ? "it holds" : "they hold"} outside equity is in no line here.` : "")
      + (other.length ? ` Not read: ${other.map((sk) => sk.fundName).join(", ")}.` : "")
      + (aifOpaque.length
        ? ` Nothing held inside your ${aifOpaque.length} AIF fund${aifOpaque.length === 1 ? "" : "s"} (${fmtFromBase(sum(aifOpaque.map((f) => f.value)), { compact: true })}) is visible here — ${aifOpaque.map((f) => f.name).join(" · ")}: an AIF reports units and a NAV, never the companies it owns.`
        : "");
  })();
  const weightScope = [entity !== "All" ? entity : null, sector !== "All" ? sector : null, bucket !== "All" ? groupLabelFor(groupAxis)(bucket) : null].filter(Boolean).join(" · ");
  const weightPlain = `How big this holding is as a share of ${weightScope ? `the ${weightScope} book` : "the whole book — every account and every asset class"}: ${weightCount} positions, with a holding reported under two members counted once. The company pick-list narrows the rows above, never this denominator.`;
  const weightGap = weightBase - totMV > 1 ? weightBase - totMV : 0;
  /**
   * ── THE REALISED COLUMN NOW TIES TO ITS FOOTER ────────────────────────────
   *
   * It used to be read from the archive's SALES, keyed per security across the
   * whole book — so a mandate row could show none of it (a name's figure was
   * not the mandate's), the categories had to CLAIM each name once, and the
   * footer summed a union no column displayed. The book now carries realised
   * per HOLDING, matched FIFO by the statement that sold it (`realizedPnL`),
   * and a whole mandate carries everything its capital shows it has booked.
   * So every row's realised is its own, a section's is the sum of its rows,
   * and the footer is the sum of the sections: `fifoTotals`, three times, over
   * the same positions.
   */
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
  /**
   * ── THE WHOLE-BOOK RETURN SAYS WHICH HOLDINGS IT IS STRUCK OVER, ON ITS FACE
   *    (MH-04, B-07) ───────────────────────────────────────────────────────
   *
   * The footer's return is struck over the holdings that report a cost —
   * Stage 10ca's decision, the set its own Invested and Unrealised cells
   * already sum, and the set Morning CIO's Consolidated return tile and its
   * allocation Total row are struck over. On this book that is ~70% of the
   * value: 60-odd depository rows print no cost, and a reader who takes a
   * whole-book figure for one over every holding has been told something the
   * figure does not say. So the set is printed UNDER the figure, not left to a
   * popover — "on the ₹X of ₹Y that reports a cost, N of M holdings" — and a
   * table every holding of which reports a cost says that instead.
   */
  /** What the footer's Realised counts, said on its face and in its hover (MH-05). */
  const realisedBasis = realisedBasisNote(totFifo, realisedFacts, (n) => money(n, true), fmtDate);
  // The words Morning CIO's tile and `/holdings` print for the same set
  // (`costedSetLabel`): a return covers the holdings with a cost AND a
  // valuation — never a depository row, and never a line held at cost.
  const returnSetLine = (footCover.uncosted.lines === 0 || footCover.uncosted.value === 0) && footCover.atCost.lines === 0
    ? `every one of the ${footCover.lines} ${footCover.lines === 1 ? "holding reports" : "holdings reports"} a cost`
    : `on the ${money(footStruckValue)} of ${money(footCover.value)} valued against a cost · ${footStruckLines} of ${footCover.lines} holdings`;
  // ── WHAT A ROW OPENS INTO: ROWS OF THIS TABLE, IN ITS COLUMNS ─────────────
  //
  //   *"i hope the ui design upgrades you are doing and making it much amazing
  //    you also do to the portfolio monitor master table"*
  //
  // Three things opened under a row here, and every one was a TABLE DRAWN
  // INSIDE THE ROW'S CELL with columns of its own: a mandate's shares, the
  // accounts a name is held through, and — behind a second chevron on the
  // Invested cell — the dated contributions that bought it. None of those
  // columns lined up with the table they sat in; a share's Market value was at
  // one x in the mandate panel and at another in the row it opened from. That
  // is the defect the family named on the Private Market page, and the same
  // standard answers it here. Every one of them is a ROW OF THIS TABLE, in THESE
  // columns, under a tree guide drawn in the first cell and nowhere else:
  //
  //   a mandate   → the shares the manager chose                  (depth 1)
  //   a holding   → one line per statement that reports it         (depth 1)
  //                   → the dated contributions behind that line    (depth 2)
  //   by entity   → the dated contributions behind the holding     (depth 1)
  //
  // So a column a reader drags moves the row, its lines and their contributions
  // together, because they are all `<Tr view={holdView}>`.
  //
  // A CHILD FILLS A COLUMN ONLY WITH ITS OWN FIGURE. Where the figure belongs to
  // the parent — a property of the security (its sector), or a per-security
  // aggregate (realised gain, which no statement splits by account) — the
  // child's cell is left BLANK rather than repeated or dashed: the parent row
  // directly above carries it, or carries the reason it is absent. Where the
  // child's OWN figure is missing for a reason of its own — this account's
  // statement reports no cost — it says so through `AbsentCell`, exactly as a
  // row does. A blank here is "see the row above", never "zero" and never
  // "nobody measured it".
  type ChildCells = Partial<Record<"qty" | "avgCost" | "invested" | "investedOn" | "cmp" | "day" | "mv"
    | "viaFunds" | "totalExposure" | "weight" | "pnl" | "realised" | "sector" | "entity", ReactNode>>
    & { ret?: (measure: ReturnMeasure) => ReactNode };
  const CHILD_NUM = `${TREE_CELL_DENSE.child} text-right mono whitespace-nowrap text-slate-400`;
  /** A child's cells, in the table's DECLARED column order — which is what `<Tr>` permutes from. */
  const childTds = (c: ChildCells) => [
    <td key="qty" className={CHILD_NUM}>{c.qty}</td>,
    <td key="avgCost" className={CHILD_NUM}>{c.avgCost}</td>,
    <td key="invested" className={CHILD_NUM}>{c.invested}</td>,
    <td key="investedOn" className={`${TREE_CELL_DENSE.child} text-left mono whitespace-nowrap text-slate-400`}>{c.investedOn}</td>,
    <td key="cmp" className={CHILD_NUM}>{c.cmp}</td>,
    <td key="day" className={CHILD_NUM}>{c.day}</td>,
    <td key="mv" className={`${TREE_CELL_DENSE.child} text-right mono whitespace-nowrap text-slate-200`}>{c.mv}</td>,
    ...(bySecurity ? [
      <td key="viaFunds" className={CHILD_NUM}>{c.viaFunds}</td>,
      <td key="totalExposure" className={CHILD_NUM}>{c.totalExposure}</td>,
    ] : []),
    <td key="weight" className={CHILD_NUM}>{c.weight}</td>,
    <td key="pnl" className={CHILD_NUM}>{c.pnl}</td>,
    <td key="realised" className={CHILD_NUM} data-child-cell="realised">{c.realised}</td>,
    ...returnMeasures.map((measure) => (
      <td key={`ret:${measure}`} className={CHILD_NUM} data-child-return={c.ret ? measure : undefined}>{c.ret?.(measure)}</td>
    )),
    <td key="sector" className={`${TREE_CELL_DENSE.child} text-slate-500`}>{c.sector}</td>,
    <td key="entity" className={`${TREE_CELL_DENSE.child} text-slate-400`}>{c.entity}</td>,
  ];
  /**
   * A CHILD'S RETURN, through `measuredReturn` like every row's — so the guard
   * that refuses to compound a sub-year window onto a year is the same guard on
   * a line and on the row above it, and the tag rule is the one the row cells
   * use: tagged wherever the figure is not the measure the column promises.
   */
  const childReturn = (input: ReturnInput, measure: ReturnMeasure) => {
    const res = measuredReturn(input, measure, portfolio.asOf);
    const off = measure === "auto" || res.tag !== returnMeasureDef(measure).tag;
    return (
      <span data-child-return-tag={off ? res.tag : undefined}>
        {off && <span className="ret-tag mr-0.5">{res.tag}</span>}
        {res.shown
          ? <span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true })}</span>
          : <AbsentCell reason={res.reason} />}
      </span>
    );
  };
  const pctOfBook = (v: number) => (weightBase > 0 ? `${((v / weightBase) * 100).toFixed(1)}%` : null);
  /**
   * "Unclassified" WITH ITS REASON, never bare (MH-07). A company the shared
   * index cannot place names the three sources it was looked up in and what
   * each lacked — which is what tells a reader whether anything could ever fill
   * it (a symbol screener.in has no page for) or nothing can (a name that
   * resolves no NSE symbol at all). `data-sector` is the handle the sweep
   * reads, so the claim is struck on the cell rather than on its text.
   */
  const sectorCell = (value: string, key: string, ps: readonly Position[], held: boolean) => {
    if (value !== UNCLASSIFIED_SECTOR) return <span data-sector={value}>{value}</span>;
    const sym = ps.map((x) => symbolFor(x)).find(Boolean) ?? symbolForKey(key);
    const why = `Unclassified — ${held ? "no statement in this book prints a sector for this company, " : ""}no fund's portfolio filing that names it prints an industry, and ${sym ? `screener.in publishes none for NSE: ${sym}` : "it resolves no NSE symbol, so screener.in cannot be asked"}. It is left unplaced rather than given a sector we would have to guess.`;
    return <span data-sector={value} title={why}>{value}</span>;
  };
  /** Why a fund's Sector cell is a dash, true of the kind of fund it is. */
  const fundSectorWhy = (assetClass: string) => assetClass === "AIF"
    ? "an AIF holds many companies and has no sector of its own, and it files no portfolio disclosure that joins to a folio this family holds, so it cannot be looked through either"
    : "a fund holds many companies across sectors and has no sector of its own; the Security view looks through its portfolio disclosure, company by company";
  const signed = (v: number | null) =>
    v === null ? null : <span className={changeColor(v)}>{fmtFromBase(v, { compact: true, sign: true })}</span>;
  /**
   * WHY A HOLDING CARRIES NO PURCHASE DATE — the cause that is true of ITS
   * accounts (VD-14). A drawdown fund dates its calls and not which units each
   * bought; a PMS manager's statement reports what a share cost and not when; a
   * lot register that does not account for every unit held dates none of them;
   * a cash balance is not bought at all. "This account issues neither" was false
   * of every fund that prints dated calls.
   */
  const investedOnWhy = (ps: readonly Pick<Position, "accountId" | "assetClass">[]): string => {
    if (ps.length && ps.every((p) => p.assetClass === "Cash")) {
      return "a cash balance is not bought on a date — it is money the account holds, so there is no purchase to date";
    }
    const accts = [...new Set(ps.map((p) => p.accountId))];
    const calls = accts.flatMap((a) => ACCOUNT_CALL_DATES.get(a) ?? []).sort();
    if (calls.length) {
      return `the fund's statements date the capital it called — ${calls.length} call${calls.length === 1 ? "" : "s"}, the first on ${fmtDate(calls[0])} — but not which units each call bought, so no one purchase date stands for this holding; each call is on the Transactions card`;
    }
    if (accts.length && accts.every((a) => accIdx.get(a)?.engagement === "PMS")) {
      return "the manager's statement reports what this share cost but not the date it was bought";
    }
    if (accts.some((a) => CG_WINDOW.has(a))) {
      return "this account's lot register does not account for every unit held today, so no purchase date can be read off it";
    }
    return "the statements report this holding's cost but not the date it was bought — no lot register or dated allotment for it is in this book";
  };
  /**
   * WHAT A HOLDING'S REALISED FIGURE COVERS (DL-10): each account's capital gain
   * statement window, or the fund's own dated unit record — `realisedWindowNote`.
   */
  const realisedWindowOf = (ps: readonly Pick<Position, "accountId" | "realizedPnL">[]): string => {
    const accts = [...new Set(ps.filter((p) => typeof p.realizedPnL === "number").map((p) => p.accountId))];
    const windows = accts.map((a) => CG_WINDOW.get(a)).filter((w): w is { from: string | null; to: string | null } => !!w);
    return realisedWindowNote(windows, accts.length - windows.length, fmtDate);
  };
  const dateCell = (d: { first: string; last: string; payments: number } | null, why: string) =>
    d === null ? <AbsentCell reason={why} />
      : <span title={d.payments > 1 ? `Funded over ${d.payments} dated payments, ${fmtDate(d.first)} to ${fmtDate(d.last)} — each is its own row below.` : `One dated payment, ${fmtDate(d.first)}.`}>
          {fmtDate(d.first)}{d.payments > 1 && <span className="ml-1 text-[10px] text-slate-500">+{d.payments - 1}</span>}
        </span>;
  /** One child row: the tree cell, then the figures in their own columns. */
  const childRow = (key: string, kind: string, depth: 1 | 2, name: {
    title: ReactNode; sub?: ReactNode; last?: boolean; ancestorLast?: boolean;
    /** A line that opens rows of its own — a fund line into its instruments. */
    toggle?: { open: boolean; label: string };
  }, cells: ChildCells, data: Record<string, string | number | undefined> = {}, adjust = false) => (
    <Tr view={holdView} key={key}
      className={`${adjust ? TREE_ROW_DENSE.adjust : TREE_ROW_DENSE.child}${name.toggle ? " cursor-pointer" : ""}`}
      {...(name.toggle ? rowToggle(() => toggleRow(key)) : {})}
      data-tree-child={kind} {...data}>
      <TreeNameCell depth={depth} density="dense" className="min-w-[16rem]"
        title={name.title} sub={name.sub} last={name.last} ancestorLast={name.ancestorLast}
        {...(name.toggle ? {
          open: name.toggle.open, onToggle: () => toggleRow(key), toggleLabel: name.toggle.label,
          toggleData: { "data-child-toggle": key },
        } : {})} />
      {childTds(cells)}
    </Tr>
  );
  /**
   * THE DATED CONTRIBUTIONS BEHIND ONE STATEMENT — each its own units at the
   * NAV it bought at, valued at today's mark. The line above them is the
   * statement they add up to: the book emits a breakdown only where the
   * allotted units account for EVERY unit held (`trancheTable`'s gate), so
   * the contributions' units, invested and value tie to that line by
   * construction rather than by a footer printed beside them.
   */
  const trancheRows = (parentKey: string, folioKey: string, cls: string | null, assetClass: string,
    t: TrancheTable, depth: 1 | 2, ancestorLast: boolean) => {
    const rows: ReactNode[] = [];
    /*
     * NO SENTENCE ABOVE A SWITCHED CONTRIBUTION. It used to explain, once per
     * table, what "switched" means; the family asked for the notes inside the
     * table to go (*"no one is reading these kind of notes"*), and every word of
     * it is already in the hover on the row's own "switched A1 → A4" label and
     * on its entry NAV (`switchedRowNote`): the units and NAV it was bought at,
     * the class it moved into, and that what was paid and when is unchanged.
     */
    t.rows.forEach((x, i) => {
      const cf = x.move.carriedFrom;
      // WHAT WAS PAID, where the fund's own charges on the day make it differ
      // from what bought units — the figure the family means by "10 crores".
      // The charge is printed whole, because in compact form a ₹500 stamp
      // duty rounds away and "₹1 Cr paid · ₹100 L invested" reads as a
      // contradiction rather than as the charge.
      const paid = x.amount === null
        ? "the statement prints only a running balance for that date, so what moved on the day is not stated"
        : x.amount - x.invested >= 1
          ? `${fmtFromBase(x.amount, { compact: true })} paid · ${fmtFromBase(Math.round(x.amount - x.invested), { compact: true })} charges`
          : null;
      rows.push(childRow(`${folioKey}#${x.date}#${x.label}#${i}`, "tranche", depth, {
        title: x.label,
        // A SWITCHED ROW SAYS SO UNDER ITS TYPE, because its units and entry NAV
        // are in a class the statement's own allotment line does not name. On
        // the second line rather than beside the label, so the label keeps its
        // one line in a narrow column.
        sub: cf ? (
          <>
            <span className="whitespace-nowrap" title={switchedRowNote(x, cls, fmtFromBase)}>
              switched {classOfName(cf.security) ?? "from an earlier class"} &rarr; {cls ?? "this class"}, {fmtDate(cf.switchedOn)}
            </span>
            {paid && <> &middot; {paid}</>}
          </>
        ) : paid ?? undefined,
        last: i === t.rows.length - 1, ancestorLast,
      }, {
        qty: cf
          ? <span title={`${fmtNum(cf.units)} ${classOfName(cf.security) ?? "earlier-class"} units as allotted; ${fmtNum(x.units)} after the fund moved them into ${cls ?? "this class"} on ${fmtDate(cf.switchedOn)}, at its own switch ratio.`}>{fmtNum(x.units)}</span>
          : fmtNum(x.units),
        // THE ENTRY NAV IS THIS CONTRIBUTION'S COST PER UNIT — which is what the
        // column means on every row — derived as invested ÷ units allotted, and it
        // reproduces the allotment NAV the statement prints (`tranches.test.ts`).
        // On a switched row it is restated in the class held today, and the
        // hover gives the NAV it was bought at.
        avgCost: <span title={cf ? switchedRowNote(x, cls, fmtFromBase) : "Entry NAV — what this contribution paid per unit (invested ÷ units allotted)."}>{fmtFromBase(x.navAtEntry)}</span>,
        invested: fmtFromBase(x.invested, { compact: true }),
        investedOn: fmtDate(x.date),
        mv: fmtFromBase(x.value, { compact: true }),
        pnl: signed(x.value - x.invested),
        // A contribution is the one thing in this book with a real purchase date,
        // so it is the one place a CAGR is genuinely strikable — through the same
        // guard, so a four-month contribution still reads as its holding-period
        // return and says so.
        ret: (measure) => childReturn({ returnPct: x.returnPct, heldSince: x.date, valuedAt: x.valuedAt, assetClass, costNA: false }, measure),
      }, {
        "data-tranche-row": parentKey, "data-tranche-folio": folioKey, "data-tranche-class": cls ?? "",
        // THE HOLDING-PERIOD RETURN, whatever the cell shows: "cheaper entry,
        // higher return" is true of THIS figure by construction, and of a CAGR
        // only while every row is on one basis.
        "data-tranche-nav": x.navAtEntry, "data-tranche-hpr": x.returnPct, "data-tranche-units": x.units,
        "data-tranche-invested": x.invested, "data-tranche-value": x.value, "data-tranche-date": x.date,
        "data-tranche-switched": cf?.switchedOn ?? undefined,
        "data-tranche-bought-nav": boughtNavOf(x)?.toFixed(4) ?? undefined,
      }));
    });
    return rows;
  };
  const venueKeyOf = (v: Venue) => `${v.securityKey}@${v.accountId}`;
  /**
   * AN ACCOUNT NUMBER UNDER A NAME, shortened where it is long: a depository's
   * sixteen-digit client id wrapped every line it sat on into four, while its
   * last six digits are what a reader matches a statement by. The whole number
   * is the hover, so nothing is lost — only moved out of the line.
   */
  const acct = (no: string) => (no.length > 10
    ? <span title={`Account ${no}`}>a/c …{no.slice(-6)}</span>
    : <>a/c {no}</>);
  /**
   * ── WHAT THE FAMILY'S FUNDS HOLD OF THIS ISSUER, AS ROWS ─────────────────
   *
   *   *"When an entity is dropped down, they're literally seeing what is the
   *    entity and which accounts are held in. So the dropdown is good. It's
   *    just that I have issues with the extreme verbatim and verbose footnotes
   *    that you have put, which make the whole table ugly."*
   *
   * The look-through used to be a CARD inside the opened row: two paragraphs
   * of prose and a table of its own inside one cell — the box the family
   * pointed at. It is lines of this table now, in this table's columns, like
   * the accounts above them: one line per fund, its derived share under
   * `Via funds` (the column headed "derived", which is the only column such a
   * figure may sit in), and a fund that filed several instruments of the
   * issuer opens into them. Nothing the card SAID was lost with its prose:
   * the derived fence is on both derived columns' headers, the coverage and
   * the AIF block are the Via funds header's hover and the Total exposure
   * footer's, each line's arithmetic is its own value's hover, and "none of
   * your funds holds this" is the row's own Via funds cell and its reason.
   *
   * The store is asked on the SECURITY axis alone — `useStockExposure` stays
   * `loading` on the three allocation axes — so everywhere else a row has no
   * fund lines, exactly as it had no card.
   */
  const fundLinesOf = (r: Row): FundExposureRow[] => {
    if (!r.venues || !r.securityKey || !canLookThrough(r) || exposure.status !== "ok") return [];
    return [...(exposure.byKey.get(r.securityKey)?.rows ?? [])].sort((a, b) => b.value - a.value);
  };
  /**
   * ONE FUND'S SHARE OF THIS ISSUER — a line of the table, and the
   * instruments it filed as lines under it where there is more than one.
   *
   * The fund's name opens its own page; the second line says what the fund
   * filed the issuer as and how many instruments; the derived rupee sits under
   * Via funds with its arithmetic in the hover (your holding of the fund × the
   * share of the fund its filing puts in this issuer); and its share of the
   * book sits under Weight, so the lines add to the row in both columns.
   */
  const fundLineRows = (r: Row, f: FundExposureRow, last: boolean): ReactNode[] => {
    const key = `${r.key}>fund:${f.fundKey}`;
    const many = f.instruments.length > 1;
    const open = many && expanded.has(key);
    const classes = [...new Set(f.instruments.map((x) => x.assetClass).filter((c): c is string => !!c))];
    const filed = f.holdingsAsOf ? fmtDate(f.holdingsAsOf) : null;
    const how = `DERIVED, not a position: you hold ${money(f.holdingValue)} of this fund and its `
      + `${filed ? `${filed} ` : ""}filing${f.sourceKind === "amc" ? " (the AMC's own)" : f.sourceKind ? " (via an aggregator)" : ""}`
      + ` puts ${fmtPct(f.pctAum)} of it in this issuer, so your share is ${money(f.value)}.`
      + (f.via === "name" ? " The filing printed no ISIN for it, so it was matched on this book's own name for the company." : "")
      // AN ABSENCE STILL NAMES ITS CAUSE, in the hover that already explains
      // the line: the box these lines replaced said each of these in words.
      + (filed ? "" : " This scheme's disclosure carries no as-of date.")
      + (classes.length ? "" : " No filing here declared this line's asset class.")
      + " It is no part of the book's NAV — the fund's own value already counts it.";
    const rows: ReactNode[] = [childRow(key, "fund", 1, {
      title: <StockLink securityKey={f.fundKey} name={f.fundName} />,
      sub: <>via fund{classes.length ? <> · {classes.join(" + ")}</> : null}{many ? <> · {f.instruments.length} instruments</> : null}</>,
      last,
      ...(many ? { toggle: { open, label: open ? "Hide the instruments" : `${f.instruments.length} instruments of this issuer in the fund — show each` } } : {}),
    }, {
      viaFunds: <span title={how}>{fmtFromBase(f.value, { compact: true })}</span>,
      weight: pctOfBook(f.value),
    }, {
      "data-fund-line": f.fundKey, "data-fund-line-via": f.via, "data-fund-line-value": f.value,
      "data-fund-line-held": f.holdingValue, "data-fund-line-pct": f.pctAum,
      "data-fund-line-instruments": f.instruments.length, "data-fund-line-classes": classes.join(","),
      "data-fund-line-asof": f.holdingsAsOf ?? "",
    })];
    if (open) {
      f.instruments.forEach((x, j) => rows.push(childRow(`${key}>${x.isin ?? x.name}#${j}`, "instrument", 2, {
        title: x.name,
        // A SECTOR ON A SHARE AND A CREDIT RATING ON A BOND — the AMC files
        // both in one column and they are not the same fact, so the class and
        // the rating are two words here, never one printed as the other.
        sub: <>{x.assetClass ?? <AbsentCell reason="this filing declared no asset class for the line" />}{x.rating ? ` · ${x.rating}` : ""}{x.isin ? ` · ${x.isin}` : ""}</>,
        last: j === f.instruments.length - 1, ancestorLast: last,
      }, {
        viaFunds: <span title={`${fmtPct(x.pctAum)} of the fund, as filed — your share ${money(x.value)}.${x.isin ? "" : " This filing carried no ISIN for the line."}`}>{fmtFromBase(x.value, { compact: true })}</span>,
      }, {
        "data-fund-instrument": f.fundKey, "data-fund-instrument-class": x.assetClass ?? "", "data-fund-instrument-value": x.value,
      })));
    }
    return rows;
  };
  /** Whether this row's fund look-through has answered — the gate the fund lines and the AIF line share. */
  const lookedThrough = (r: Row) => !!r.venues && !!r.securityKey && canLookThrough(r) && exposure.status === "ok";
  /**
   * THE AIFs, AS ONE LINE OF THE TABLE — "Inside your N AIF funds · not
   * visible" — that opens into one line per fund, each linking to its own
   * page. Its Via funds cell is an absence with its reason, never a figure:
   * nothing this book can read says how much of this issuer any of them holds.
   */
  const aifOpaqueRows = (r: Row): ReactNode[] => {
    const key = `${r.key}>aifs`;
    const open = expanded.has(key);
    const n = aifOpaque.length;
    const rows: ReactNode[] = [childRow(key, "aif-opaque", 1, {
      title: `Inside your ${n} AIF fund${n === 1 ? "" : "s"}`,
      sub: "not visible — an AIF publishes no holdings",
      last: true,
      toggle: { open, label: open ? "Hide the AIF funds" : `Name the ${n} AIF fund${n === 1 ? "" : "s"} this cannot see into` },
    }, {
      viaFunds: <AbsentCell reason="an AIF reports units and a NAV, never the companies it owns, so no share of this issuer inside it can be struck" />,
    }, { "data-fund-exposure-aifs": n })];
    if (open) {
      aifOpaque.forEach((f, j) => rows.push(childRow(`${key}>${f.key}`, "aif-opaque-fund", 2, {
        title: <StockLink securityKey={f.key} name={f.name} />,
        sub: `AIF · ${money(f.value)} held`,
        last: j === n - 1, ancestorLast: true,
      }, {}, { "data-fund-opaque": f.name })));
    }
    return rows;
  };
  /** Can this row open at all? A chevron that opens nothing is worse than none. */
  // A MANDATE ROW OPENS ONTO ITS SHARES — through one line per account where it
  // is run for more than one (Stage 10dl).
  const canExpand = (r: Row) => r.kind === "mandate" ? (r.mandate?.holdings.length ?? 0) > 0
    : r.venues ? (r.venues.length > 0 || fundLinesOf(r).length > 0)
    : !!trancheInfo.get(r.key);
  /**
   * THE ROUTE SPLIT, IN THE CHEVRON'S HOVER (Stage 10cg).
   *
   *   "Then I drill down, then you tell me direct you hold X Cr through direct
   *    equity, and then you hold another Y crores through these five funds."
   *
   * That was the sentence leading an opened row, and the family then asked for
   * the sentences inside the tables to go. Each line under the row names its
   * own route and share, but a SUBTOTAL per route was on screen nowhere else,
   * so it rides in the hover of the control that opens the lines. It is struck,
   * as the sentence was, over the statements AS PRINTED. Where two accounts
   * report one holding it names the overlap, because the subtotals then add to
   * more than the row.
   */
  const routeSplitOf = (r: Row): string => {
    const vs = r.venues ?? [];
    if (vs.length < 2) return "";
    const by = [...vs.reduce((acc, v) => {
      const e = acc.get(v.route) ?? { route: v.route, mv: 0, n: 0 };
      e.mv += v.marketValue; e.n += 1;
      return acc.set(v.route, e);
    }, new Map<string, { route: string; mv: number; n: number }>()).values()].sort((a, b) => b.mv - a.mv);
    // "2 manager's mandates" is not a plural (MH-17): two mandates are
    // "discretionary mandates" — never "managers'", which would claim two
    // managers where one manager runs both (Goldstandard's Aristos for two members).
    const routeWord = (route: string, n: number) => n === 1 || route === ROUTE_LABEL.unknown ? route
      : route === ROUTE_LABEL.mandate ? "discretionary mandates" : `${route}s`;
    const parts = by.map((g) => `${money(g.mv)} through ${g.n === 1 ? "" : `${g.n} `}${routeWord(g.route, g.n)}`);
    const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
    const gap = sum(vs.map((v) => v.marketValue)) - r.marketValue;
    return `: ${joined}${gap >= 1 ? `, as the statements print it, of which ${money(gap)} is one holding reported twice` : ""}`;
  };
  const toggleLabelFor = (r: Row, open: boolean) => {
    if (r.mandate) {
      const n = r.mandate.accounts.length;
      const hn = r.mandate.holdings.length;
      if (n === 1) return open ? "Hide the shares" : `List the ${hn} share${hn === 1 ? "" : "s"} inside this mandate`;
      return open ? "Hide the accounts and their shares"
        : `Run for ${n} accounts — show each one's own figures and the shares inside it`;
    }
    const n = trancheInfo.get(r.key)?.count ?? 0;
    if (!r.venues) return open ? "Hide the contributions" : `Bought over ${n} dated contribution${n === 1 ? "" : "s"} — show each one's own units, entry NAV and return`;
    if (r.fundClasses.length) return open ? "Hide this fund's unit classes" : `One fund, ${r.fundClasses.length} unit classes (${r.fundClasses.join(", ")}) — show each`;
    const nf = fundLinesOf(r).length;
    const viaFunds = nf ? `${nf} fund${nf === 1 ? "" : "s"}` : "";
    // A DERIVED-ONLY ROW HAS NO ACCOUNT TO NAME, so a label counting accounts
    // would read "held through 0", which is a measurement of nothing rather
    // than the honest statement that this is a fund look-through.
    if (r.venues.length === 0) return open ? "Hide the funds that hold it" : `No statement in this book reports it — held inside ${viaFunds}; show which`;
    return open ? `Hide how this name is held${routeSplitOf(r)}`
      : `Held through ${r.venues.length} account${r.venues.length === 1 ? "" : "s"}${routeSplitOf(r)}${viaFunds ? `, and inside ${viaFunds}` : ""} — show which${n ? `, and the ${n} dated contributions behind them` : ""}`;
  };
  const NO_COST_LINE = "this account's statement reports no cost for the holding — a depository holds the shares and did not buy them";
  const dayCell = (live: boolean, pct: number | null) => (live && pct != null
    ? <span className={changeColor(pct)}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</span> : undefined);
  /**
   * THE ROWS A ROW OPENS INTO. Built only for an open row, so the table pays
   * nothing for what is shut.
   */
  const renderChildren = (r: Row): ReactNode[] => {
    const out: ReactNode[] = [];
    const m = r.mandate;
    /**
     * A MANDATE → ITS ACCOUNTS → THE SHARES ITS MANAGER CHOSE (Stage 10dl).
     *
     *   "In holdings we are showing Green Lantern Capital LP as 2 separate line
     *    items, but they need to be one … we can show that in drop down. And
     *    also show the holdings in the dropdown as well as we can show inside
     *    the whole drill down page of any specific PMS or AIF."
     *
     * A strategy run for ONE account opens straight onto its shares, as it
     * always did. A strategy run for SEVERAL opens onto one line per member's
     * account — its own figures, struck over its own positions, so the lines
     * add to the row and nothing is deduped (two members' accounts are two
     * investments) — and each account line carries ITS shares under it, the
     * same rows its own drill-down page lists. A share's "% of the mandate" is
     * over THAT ACCOUNT's own pre-filter total, never the row's sum: one
     * company in two members' accounts is two lines, each a share of its own
     * account.
     */
    if (m) {
      /** One share the manager chose, in the account that holds it. */
      const shareRow = (h: MandateHolding, key: string, depth: 1 | 2, last: boolean, ancestorLast: boolean, accountMV: number) =>
        childRow(key, "constituent", depth, {
          title: <StockLink securityKey={h.securityKey} name={h.security} />,
          // DIVIDED BY THE ACCOUNT — its own pre-filter total — never by the
          // row's roll-up of whatever survived the filters. Filtered to one
          // company that read 100.0% for a ₹4.39 Cr holding of a ₹39.53 Cr
          // mandate.
          sub: accountMV > 0 ? `${((h.marketValue / accountMV) * 100).toFixed(1)}% of the mandate` : undefined,
          last, ancestorLast,
        }, {
          qty: h.quantity === null ? <AbsentCell reason={NO_UNIT_COUNT} /> : fmtNum(h.quantity),
          avgCost: h.costNA ? <AbsentCell reason={NO_COST_LINE} />
            : h.avgCost === null ? <AbsentCell reason={h.quantity === null ? NO_UNIT_COUNT : h.quantity === 0 ? "this line holds no units to divide its cost by" : "this provider prints no per-unit cost for the holding"} />
            : fmtFromBase(h.avgCost),
          invested: h.costNA ? <AbsentCell reason={NO_COST_LINE} /> : fmtFromBase(h.costBasis, { compact: true }),
          investedOn: dateCell(h.investedOn, h.costNA
            ? "no statement reports what this share cost, so there is no payment to date"
            : "the manager's statement reports what this share cost but not the date it was bought"),
          // A SHARE'S PRICE SAYS WHETHER IT IS LIVE, as every other price on
          // this table does, and a quote the corporate-action check held back
          // is named as that (DL-9).
          cmp: h.currentPrice === null ? <AbsentCell reason="marked at a total value, not a per-unit price" />
            : h.live ? fmtFromBase(h.currentPrice)
            : (() => {
              const wh = withheldOf([{ accountId: h.accountId, securityKey: h.securityKey }]);
              return <>{fmtFromBase(h.currentPrice)}
                <span className="ml-1 cursor-help text-[10px] text-amber-400/80"
                  title={`${wh ? `A live quote arrived and the corporate-action check held it back — ${wh.reason}. The mark` : "No live price — the mark"} from the mandate's statement${h.valuedAt ? ` as of ${fmtDate(h.valuedAt)}` : ""}.`}
                  data-cmp-withheld={wh ? "1" : undefined}>◦</span></>;
            })(),
          day: dayCell(h.live, h.dayChangePct),
          mv: fmtFromBase(h.marketValue, { compact: true }),
          weight: pctOfBook(h.marketValue),
          pnl: h.costNA ? <AbsentCell reason={NO_COST_LINE} /> : signed(h.unrealizedPnL),
          realised: h.realised === null
            ? <AbsentCell reason={realisedReason({ realizedPnL: null, realizedLotsAfter: h.realisedLotsAfter ?? undefined })} />
            : <span className={changeColor(h.realised)} title={realisedWindowOf([{ accountId: h.accountId, realizedPnL: h.realised }])}
                data-child-realised={h.realised}>{fmtFromBase(h.realised, { compact: true, sign: true })}</span>,
          ret: (measure) => childReturn({ returnPct: h.returnPct, heldSince: h.heldSince, valuedAt: h.valuedAt, assetClass: h.assetClass, costNA: h.costNA, costBasis: h.costBasis, marketValue: h.marketValue }, measure),
          sector: isFundVehicle(h) ? <AbsentCell reason={fundSectorWhy(h.assetClass)} /> : sectorCell(h.sector, h.securityKey, [], true),
        }, { "data-constituent": h.securityKey || h.security, "data-constituent-account": h.accountId, "data-constituent-mv": h.marketValue });
      // ONE ACCOUNT: the row IS that account, so its shares hang straight from it.
      if (m.accounts.length === 1) {
        const a = m.accounts[0];
        m.holdings.forEach((h, i) => out.push(shareRow(h, `${r.key}>${h.securityKey || h.security}`, 1, i === m.holdings.length - 1, false, a.accountMV)));
        return out;
      }
      const MANDATE_NOT_A_SECURITY = "a mandate is an account, not a security: the shares inside it carry the quantities and it carries none. A 0 here would say the manager holds nothing.";
      m.accounts.forEach((l, i) => {
        const costWhy = `an unrealised gain is market value less cost, and no statement for account ${l.accountNo} reports a cost for these holdings`;
        const capNote = l.costNA ? "" : investedBasisNote(l.fifo, (v) => fmtFromBase(v, { compact: true }));
        out.push(childRow(`${r.key}>${l.accountId}`, "mandate-account", 1, {
          title: <span className="font-medium text-slate-200">{l.owner}</span>,
          sub: (
            <>
              <Link to={`/mandate/${encodeURIComponent(l.accountId)}`}
                title={`${m.manager} — account ${l.accountNo}, ${l.accountCount} holdings. Open this account's drill-down for every share in it.`}
                className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
                {acct(l.accountNo)}
              </Link>
              {" · "}
              {l.holdings < l.accountCount
                ? <span className="text-amber-400/80" title={`${l.holdings} of the account's ${l.accountCount} holdings match the filters — the account itself holds ${fmtFromBase(l.accountMV, { compact: true })}`}>{l.holdings} of {l.accountCount} holdings</span>
                : <>{l.holdings} holding{l.holdings === 1 ? "" : "s"}</>}
            </>
          ),
          last: i === m.accounts.length - 1,
        }, {
          qty: <AbsentCell reason={MANDATE_NOT_A_SECURITY} />,
          avgCost: <AbsentCell reason="an average cost per unit needs one security; this account holds many, each with a cost of its own" />,
          invested: l.costNA ? <AbsentCell reason={costWhy} />
            : <span title={capNote || undefined}>{fmtFromBase(l.invested, { compact: true })}</span>,
          investedOn: <AbsentCell reason="a mandate is an account, not a holding: the family funded it on dates its statements do report, and those are on the account's own page beside its Invested figure" />,
          cmp: <AbsentCell reason="a mandate has no price per unit — it is an account, not a security" />,
          day: dayCell(l.live, l.dayChangePct),
          mv: fmtFromBase(l.marketValue, { compact: true }),
          weight: pctOfBook(l.marketValue),
          pnl: l.costNA ? <AbsentCell reason={costWhy} /> : signed(l.unrealizedPnL),
          realised: l.realised === null
            ? <AbsentCell reason="no capital gain statement or dated unit record covers this account, so what its sales realised is not reported" />
            : <span className={changeColor(l.realised)} data-child-realised={l.realised}
                title={`Everything account ${l.accountNo} has booked since it opened — every sale its manager made, and its income less its fees.`}>
                {fmtFromBase(l.realised, { compact: true, sign: true })}
              </span>,
          ret: (measure) => childReturn({ returnPct: l.returnPct, heldSince: null, valuedAt: l.valuedAt, assetClass: "", costNA: l.costNA, costBasis: l.costBasis, marketValue: l.marketValue, capital: l.capital ?? null }, measure),
          sector: <AbsentCell reason="a mandate spans many sectors and is not one holding; open the account's drill-down for each share's own" />,
          entity: <span className="text-[12px]">{l.owner}</span>,
        }, {
          "data-mandate-line": l.accountId,
          "data-mandate-line-account": l.accountNo,
          "data-mandate-line-owner": l.owner,
          "data-mandate-line-mv": l.marketValue,
          "data-mandate-line-holdings": l.holdings,
          "data-mandate-line-invested": l.costNA ? undefined : l.invested ?? undefined,
          "data-mandate-line-realised": l.realised ?? undefined,
          "data-mandate-line-return": l.returnPct ?? undefined,
          "data-mandate-line-day": l.live && l.dayChangePct != null ? l.dayChangePct : undefined,
        }));
        // …AND THE SHARES IN THAT ACCOUNT, under it, as its own page lists them.
        const hs = m.holdings.filter((h) => h.accountId === l.accountId);
        const lastLine = i === m.accounts.length - 1;
        hs.forEach((h, j) => out.push(shareRow(h, `${r.key}>${l.accountId}>${h.securityKey || h.security}`, 2, j === hs.length - 1, lastLine, l.accountMV)));
      });
      return out;
    }
    const info = trancheInfo.get(r.key);
    // BY ENTITY: the row IS one statement, so its contributions hang from it.
    if (!r.venues) {
      if (info?.direct) {
        out.push(...trancheRows(r.key, r.key, splitFundClass(r.security)?.cls ?? null, r.assetClass, info.direct, 1, false));
      }
      return out;
    }
    const vs = r.venues;
    const funds = fundLinesOf(r);
    /*
     * NO SENTENCE LEADS THE LINES ANY MORE. *"no one is reading these kind of
     * notes … When an entity is dropped down, they're literally seeing what is
     * the entity and which accounts are held in."* Everything the lead spelled
     * out is on the lines themselves: each line's second line names its route
     * (own account, manager's mandate, fund vehicle) and its share of the
     * holding, the Counted once row below them names and subtracts a holding
     * two accounts both report, and the weight it restated is the row's own
     * cell. A company no statement reports opens straight into the funds that
     * hold it, and its own cells already say why there is no account.
     */
    const printed = sum(vs.map((v) => v.marketValue));
    const gap = printed - r.marketValue;
    const overlap = gap > 1;
    /*
     * AN ACCOUNT WHOSE DEPOSITORY STATEMENT CARRIES THIS NAME AND HOLDS NONE OF
     * IT is not a holding — it has nothing to put in the money columns — and it
     * is the account a reader opens this row to find: "is this in Ajay's
     * account too?". It is a LINE OF THIS TABLE like every other one here (it
     * was a full-width box on main; the family asked for the boxes inside an
     * opened row to become rows): its Qty is the balance its own statement
     * printed at the close, and its second line says what that means. Never
     * under a clubbed fund, whose classes are the lines and whose units in a
     * demat are the depository's copy of what the fund reports.
     */
    const elsewhere = r.fundClasses.length > 0 ? []
      : movementsFor(r.securityKey).filter((w) => !vs.some((v) => v.accountId === w.accountId));
    // WHAT FOLLOWS THE STATEMENT LINES — the accounts that sold it out, the
    // funds that hold it, and the AIFs nothing can be seen inside — decides
    // which line closes the tree guide.
    const opaque = lookedThrough(r) && aifOpaque.length > 0;
    const tail = elsewhere.length > 0 || funds.length > 0 || opaque;
    vs.forEach((v, i) => {
      const fk = venueKeyOf(v);
      const t = info?.byVenue.get(fk) ?? null;
      const lastLine = i === vs.length - 1 && !overlap && !tail;
      const vehicle = v.isMandate
        ? <Link to={`/mandate/${encodeURIComponent(v.accountId)}`} title={`Account ${v.accountNo} — open the mandate drill-down`}
            className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
            {v.vehicle}
          </Link>
        : <span title={`Account ${v.accountNo}`}>{v.vehicle}</span>;
      // A CLASS IS WHAT `/stock/:securityKey` SERVES, so on a CLUBBED fund the
      // class is the line's name and its link, and the row above deliberately
      // is not one. A fund with one class keeps the vehicle as the line's name:
      // the row above already carries the class in the name its statement prints.
      const asClass = r.fundClasses.length > 0 && !!v.cls;
      // A LINE IS NAMED FOR WHOSE IT IS. The row above already names the
      // security, so repeating it on every line (which is what the vehicle
      // reads as for a fund held directly) told a reader nothing; the member
      // is what tells two lines apart, and the vehicle, the route and the
      // account go under it. The Entity column carries the member too — it
      // closes a row that is wider than the screen, so it is not relied on.
      out.push(childRow(`${r.key}>${fk}`, "venue", 1, {
        title: asClass ? <StockLink securityKey={v.securityKey} name={`Class ${v.cls}`} /> : v.owner,
        // Its share only where there is more than one line to share it
        // between: over one line it is always 100%.
        sub: <>{asClass ? v.owner : <>{vehicle} · {v.route}</>} · {acct(v.accountNo)}{vs.length > 1 && vs.some((x) => x.marketValue !== 0)
          ? <> · {(v.share * 100).toFixed(1)}% of the {asClass ? "fund" : "holding"}</> : null}</>,
        last: lastLine,
      }, {
        qty: v.quantity === null ? <AbsentCell reason={NO_UNIT_COUNT} /> : fmtNum(v.quantity),
        avgCost: v.costNA ? <AbsentCell reason={NO_COST_LINE} />
          : v.avgCost === null ? <AbsentCell reason={v.quantity === null ? NO_UNIT_COUNT : "this line holds no units to divide its cost by"} />
          : fmtFromBase(v.avgCost),
        invested: v.costNA ? <AbsentCell reason={NO_COST_LINE} /> : fmtFromBase(v.costBasis, { compact: true }),
        investedOn: dateCell(v.investedOn, v.costNA
          ? "no statement reports what this holding cost, so there is no payment to date — a depository records what is held and never what was paid for it"
          : investedOnWhy(v.positions)),
        cmp: v.splitMarks.length > 1
          ? <span data-cmp-split={v.splitMarks.length}><AbsentCell reason={splitMarkReason(v.splitMarks.map((x) => fmtFromBase(x)))} /></span>
          : v.currentPrice === null
          ? <AbsentCell reason={totalValueNote(v.valuedAt, v.positions, accIdx)} />
          : <>{fmtFromBase(v.currentPrice)}{!v.live && (
              <span className="ml-1 cursor-help text-[10px] text-amber-400/80"
                title={v.navPriced
                  ? `AMFI's published NAV for this scheme, as of ${v.navDate}.`
                    // A DEPOSITORY LINE IS NOT A STATEMENT MARK REPLACED, and
                    // says so on the one line it is: no statement priced these
                    // units at all (Stage 10ce).
                    + (v.depositoryWhy
                      ? ` No statement priced these units: they are ${v.depositoryWhy}.`
                      : "")
                  // The line's OWN statement date (C-01), not the book's newest —
                  // and a quote the corporate-action check held back is named
                  // as that, never as "no live price" (DL-9). A statement that
                  // prices on another day than its balances says both (VD-17).
                  : (() => {
                    const wh = withheldOf(v.positions);
                    const lead = wh ? `A live quote arrived and the corporate-action check held it back — ${wh.reason}. The mark` : "No live price — the mark";
                    return v.valuedAt
                      ? statementMarkNote(`${lead} from this statement`, v.valuedAt, v.positions, accIdx)
                      : `${wh ? `A live quote arrived and the corporate-action check held it back — ${wh.reason}. The marks` : "No live price — the marks"} its statements print, dated differently.`;
                  })()}
                data-cmp-withheld={withheldOf(v.positions) ? "1" : undefined}>◦</span>
            )}</>,
        day: dayCell(v.live, v.dayChangePct),
        mv: fmtFromBase(v.marketValue, { compact: true }),
        weight: pctOfBook(v.marketValue),
        pnl: v.costNA ? <AbsentCell reason={NO_COST_LINE} />
          : v.valuedAtCost ? <AbsentCell reason={AT_COST_PNL} />
          : signed(v.unrealizedPnL),
        realised: (() => {
          const rz = sumOrNull(v.positions.map((p) => (typeof p.realizedPnL === "number" ? p.realizedPnL : null)));
          return rz === null
            ? <AbsentCell reason={realisedReason(v.positions.find((p) => p.realizedLotsAfter) ?? v.positions[0] ?? { realizedPnL: null })} />
            : <span className={changeColor(rz)} title={realisedWindowOf(v.positions)} data-child-realised={rz}>{fmtFromBase(rz, { compact: true, sign: true })}</span>;
        })(),
        // A line that is one WHOLE folio is that account, and carries its dated
        // record's money-weighted rate — Buoyant's two folios under the row
        // pooling both, each at the rate its own fact sheet prints.
        ret: (measure) => childReturn({ returnPct: v.returnPct, heldSince: v.heldSince, valuedAt: v.valuedAt, assetClass: v.assetClass, costNA: v.costNA, costBasis: v.costBasis, marketValue: v.marketValue,
          valuedAtCost: v.valuedAtCost, capital: datedCap?.behind(v.positions, holdingsUniverse) ?? undefined }, measure),
        entity: v.owner,
      }, {
        "data-venue": v.route, "data-venue-class": v.cls ?? "", "data-venue-share": v.share,
        "data-venue-account": v.accountId, "data-venue-key": v.securityKey, "data-venue-mv": v.marketValue,
        ...(t ? { "data-folio-tranches": t.rows.length } : {}),
      }));
      if (t) out.push(...trancheRows(r.key, fk, v.cls, v.assetClass, t, 2, lastLine));
    });
    /**
     * COUNTED ONCE — the line that makes the lines add to the row. A holding
     * two accounts both report is listed twice above (each statement as
     * printed) and counted once in the row, so without this the lines would sum
     * past the figure they open from. Italic, because it is arithmetic and not a
     * holding; amber, because it is the one place this table subtracts.
     */
    if (overlap) {
      const printedCost = sumOrNull(vs.map((v) => v.costBasis));
      const printedPnl = sumOrNull(vs.map((v) => v.unrealizedPnL));
      const printedQty = r.quantity === null ? null : totalQuantity(vs);
      const minus = (v: ReactNode) => <span className="text-amber-400">{v}</span>;
      out.push(childRow(`${r.key}>overlap`, "overlap", 1, {
        title: <span className="text-amber-400">Counted once</span>,
        sub: `one holding reported under ${vs.length === 2 ? "two" : vs.length} accounts`,
        last: !tail,
      }, {
        qty: printedQty !== null && r.quantity !== null && printedQty - r.quantity > 0.0005
          ? minus(`−${fmtNum(printedQty - r.quantity)}`) : undefined,
        invested: printedCost !== null && r.costBasis !== null && printedCost - r.costBasis > 1
          ? minus(`−${fmtFromBase(printedCost - r.costBasis, { compact: true })}`) : undefined,
        mv: minus(`−${fmtFromBase(gap, { compact: true })}`),
        weight: weightBase > 0 ? minus(`−${((gap / weightBase) * 100).toFixed(1)}%`) : undefined,
        pnl: printedPnl !== null && r.unrealizedPnL !== null && Math.abs(printedPnl - r.unrealizedPnL) > 1
          ? minus(fmtFromBase(r.unrealizedPnL - printedPnl, { compact: true, sign: true })) : undefined,
      }, {
        "data-venue-overlap": Math.round(gap), "data-venue-printed": Math.round(printed), "data-venue-once": Math.round(r.marketValue),
      }, true));
    }
    /**
     * …AND THE FUNDS THAT HOLD THIS ISSUER, last — one line per fund, its
     * derived share under `Via funds` and nowhere else, so a derived rupee can
     * never sit under Direct + PMS beside the measured lines and read as one of
     * them. A fund that filed several instruments of the issuer opens into
     * them (see `fundLinesOf`).
     */
    elsewhere.forEach((w, j) => {
      const a = accIdx.get(w.accountId);
      const who = ownerOfAccount(w.accountId);
      const n = notHeldNote(w, a, recordedLineFor(w.accountId, r.securityKey)?.reason);
      const closing = w.closing ?? 0;
      const from = w.periodFrom ? fmtDate(w.periodFrom) : "the window's opening";
      const to = w.periodTo ? fmtDate(w.periodTo) : "its close";
      out.push(childRow(`${r.key}>elsewhere:${w.accountId}`, "elsewhere", 1, {
        title: who,
        // WHAT THE TWO BALANCES MEAN, in the words a reader acts on — "sold out
        // in this window" — and the link to the company's own page, where the
        // dated quantity account for this demat is. Why is the hover.
        sub: <>{a ? <>{a.provider} · {acct(a.accountNo)} · </> : null}<Link to={stockHref(r.securityKey)} title={n.why}
            className="text-amber-400/90 underline decoration-dotted decoration-amber-500/40 underline-offset-[3px] hover:text-champagne-400">
            {n.label.toLowerCase()}</Link></>,
        last: j === elsewhere.length - 1 && funds.length === 0 && !opaque,
      }, {
        qty: <span title={`${w.opening == null ? "No opening balance printed" : `${fmtNum(w.opening)} on ${from}`}, ${closing === 0 ? "nil" : fmtNum(closing)} on ${to} — the balances this account's own depository statement printed.`}>{fmtNum(closing)}</span>,
        entity: who,
      }, { "data-demat-elsewhere-row": w.accountId, "data-closing": w.closing ?? "" }));
    });
    funds.forEach((f, i) => out.push(...fundLineRows(r, f, i === funds.length - 1 && !opaque)));
    if (opaque) out.push(...aifOpaqueRows(r));
    return out;
  };
  /**
   * ── EXPAND ALL, ON THE ALLOCATION AXES ────────────────────────────────────
   *
   * Every row the table can open, and every section it has closed. Not offered
   * on the SECURITY axis, where nearly every row opens onto a fund look-through
   * — a derived card per issuer — rather than onto rows of the table: 565 of
   * them at once is a page nobody reads, and that axis is used by typing one
   * name and opening it.
   */
  const expandableKeys = bySecurity ? [] : rows.filter(canExpand).map((r) => r.key);
  const sectionKeys = showBucketSections ? bucketGroups.map((g) => `${groupAxis}|${g.key}`) : [];
  const orderedHoldings = bucketGroups.flatMap((grp) =>
    showBucketSections && closedSections.has(`${groupAxis}|${grp.key}`) ? [] : sortRows(grp.rows, holdView.sort, holdAccessors));
  const holdingPage = useTablePagination(orderedHoldings.length,
    JSON.stringify([groupAxis, holdingsView, entity, sector, bucket, [...selected].sort(), holdView.sort, [...closedSections].sort()]));
  const visibleHoldings = new Set(orderedHoldings.slice(holdingPage.start, holdingPage.start + holdingPage.limit));
  const allOpen = expandableKeys.length > 0
    && expandableKeys.every((k) => expanded.has(k)) && sectionKeys.every((k) => !closedSections.has(k));
  const toggleAll = () => {
    if (allOpen) setExpanded(new Set());
    else { setExpanded(new Set(expandableKeys)); setClosedSections(new Set()); }
  };
  // Export the tab to a styled workbook: the current holdings, and the managers'
  // dealing the transaction statements print. The loader's WHOLE answer goes to
  // the sheet, not its rows alone: it carries the window and the accounts the
  // sheet states (MSX-19), and a `null` — the archive did not answer — must export
  // as that, never as a tape with no rows, which reads like a quarter nobody
  // traded. exceljs is code-split so it only loads on demand.
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const [{ exportPortfolioExcel }, data] = await Promise.all([
        import("@/lib/exportPortfolioExcel"),
        loadTransactions(),
      ]);
      await exportPortfolioExcel(positions, portfolio.accounts, data);
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
                data-monitor-view={m} aria-pressed={view === m}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${view === m ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
                {m === "holdings" ? <Layers className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
                {m === "holdings" ? "Holdings" : "Transactions"}
              </button>
            ))}
          </div>
        }
        right={
          <button onClick={handleExport} disabled={exporting}
            className="btn-excel"
            title="Download the full Portfolio Monitor — holdings and the transaction tape — as a styled Excel workbook">
            <FileSpreadsheet className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
          </button>
        } />
      {/* THE LINK STAYS AND ITS SENTENCE IS ITS HOVER (Stage 10cp): what the
          returns below leave out is one hover away, on the way to where they
          are added back. */}
      <div className="mb-3 text-xs">
        <Link to="/corporate-actions" className="text-champagne-400 hover:underline"
          title="Individual-share HPR / CAGR here exclude separate dividend income. The Corporate actions page adds the dividends declared and the share adjustments.">
          Dividend-inclusive returns &amp; share adjustments →
        </Link>
      </div>
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
      <div className="mb-2 flex flex-wrap items-center gap-1.5" data-monitor-filter-row>
        {/* Categories, not asset classes: "PMS mandates" is a bucket rather than
            a class (§5 — a mandate is a relationship), and it is the choice a
            reader of this table is actually making. */}
        {/*
          THE FOUR SLICES, ALL SECURITIES FIRST. *"Make this view as All
          Securities and make it first in portfolio monitor and default open."*
          `useViewParam` makes the first view the param-free default, which is
          the same mechanism every other view on this page uses rather than a
          second convention — so moving the segment to the front IS making it the
          default, and `/monitor` opens on one row per security. Category held
          that place until this request ("Default view will remain the current
          one, category wise") and is `?group=category` now.

          It is FIRST ON THE ROW as well as first in the control: the two
          selectors that narrow the table moved to the right end (see below), so
          the axis is the first thing a reader meets.

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
        {/*
          …AND ON TRANSACTIONS TOO, THE SAME CONTROL READING THE SAME `?ret=`.

            *"Just like in the holdings page, we have return methodology
             selector add the same to the transactions page as well. With the
             same functioning as it is in the holdings page."*

          One picker, one param, one column per ticked measure on either table —
          so a reader who has pinned CAGR beside HPR on Holdings crosses to
          Transactions with the same two columns. What each measure MEANS on a
          dated capital record is `capitalReturn`'s, and it is stricter than the
          holdings one only where the record lets it be: an XIRR is solved over
          the account's real dated purchases and redemptions here.
        */}
        <ReturnMeasureSelect measures={returnMeasures} onChange={setReturnMeasures} source={returnSource} />
        {/* EXPAND ALL — the standard's one control for every row the table can
            open. Beside the return picker, with the other controls that arrange
            the table rather than narrow it; absent on the security axis, where
            `expandableKeys` is empty by design (see its note). */}
        {view === "holdings" && expandableKeys.length > 0 && (
          <ExpandAllButton allOpen={allOpen} onClick={toggleAll} />
        )}
        {/*
          ── THE TWO SELECTORS THAT NARROW THE TABLE, AT THE RIGHT END ─────────

            *"put the all holding and all entities selectors to the right end of
             after return selector"*

          The row reads left to right as HOW the table is arranged — the axis,
          which return, Expand all — and then, at the far end, WHICH ROWS are on
          it. `ml-auto` sits on the GROUP rather than on each control, so the two
          travel together: where the row wraps they drop to the next line as a
          pair and stay right-aligned there, instead of one of them starting a
          line on its own at the left.

          THE PICK-LIST'S PANEL OPENS LEFTWARD NOW (`align="right"`). As the
          first control on the row a panel anchored to its left edge opened into
          the row; at the right end the same panel would open past the page's
          edge — the defect the return picker already had once as the row's last
          control, fixed the same way.
        */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5" data-monitor-filters-right>
          {/* A SEARCH THAT FINDS NOTHING SAYS WHY, WHERE THE BOOK KNOWS. The family
              searched this control for BSE and were shown "No holdings match" — and
              BSE Ltd. IS theirs: 40,000 shares on their own consolidated review,
              reported by no statement in `source/`, so the book is right to carry
              nothing and the screen was wrong to say nothing. `AbsentFromBook`
              renders only where a review line answers the search, and never a
              figure: for a listed share or a fund the review is a cross-check,
              not a source (it is the source for private-market lines only). */}
          <MultiSelectFilter options={securityNames} selected={selected} onChange={setSelected} dense align="right"
            allLabel="All holdings" unit="holdings" placeholder="Search holdings…" className="w-56 max-w-full"
            emptyNote={(q) => <AbsentFromBook query={q} className="mt-2" />} />
          <select value={entity} onChange={(e) => setEntity(e.target.value)} data-entity-filter
            className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus">
            {entities.map((s) => <option key={s} value={s}>{s === "All" ? "All entities" : s}</option>)}
          </select>
        </div>
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
            {/* `data-lookthrough` says whether the fund look-through has answered,
                so a check can wait for the store to settle without reading prose —
                the card that used to carry its three states is rows now. Present
                on the security axis only, the one axis the store is asked on. */}
            <table className="min-w-full text-xs" data-monitor-table="holdings"
              data-lookthrough={bySecurity ? exposure.status : undefined}>
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
                    title="When this holding's own money went in, from a lot register's acquisition date, the fund's own dated allotments against this very folio, or the capital calls a drawdown fund dates against a folio that holds nothing else. It is the HOLDING's date, never its account's: when the family funded a mandate is a fact about the account and is on that mandate's own page. A row that rolls up several holdings shows a date only where every one of them carries one.">Invested on</SortHeader>
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
                  {bySecurity && <SortHeader col="viaFunds" view={holdView} pad="px-2 py-1.5" note="derived" noteTitle={derivedNote}>Via funds</SortHeader>}
                  {bySecurity && <SortHeader col="totalExposure" view={holdView} pad="px-2 py-1.5" note="incl. derived" noteTitle={derivedNote}>Total exposure</SortHeader>}
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
                {bucketGroups.map((grp) => {
                  // A section closes on its band's chevron (or anywhere on the
                  // band). Where the table draws no band there is nothing to close.
                  const secKey = `${groupAxis}|${grp.key}`;
                  const secOpen = !showBucketSections || !closedSections.has(secKey);
                  const pageRows = secOpen ? sortRows(grp.rows, holdView.sort, holdAccessors).filter((r) => visibleHoldings.has(r)) : [];
                  if (secOpen && !pageRows.length) return null;
                  return (
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
                      <tr className={`${TREE_ROW_DENSE.section} cursor-pointer`} data-section={grp.key} data-axis={groupAxis}
                        data-subtotal={grp.subtotal} data-holdings={grp.holdings} data-names={grp.names} data-lines={grp.lines} data-rule-mv={grp.ruleMV}
                        data-cash-rule-mv={grp.cashRuleMV}
                        data-section-open={secOpen ? "open" : "closed"}
                        {...rowToggle(() => toggleSection(secKey))}>
                        <TreeSectionCell density="dense" colSpan={COL_COUNT}
                          title={groupLabelFor(groupAxis)(grp.key)}
                          open={secOpen} onToggle={() => toggleSection(secKey)}
                          toggleData={{ "data-section-toggle": grp.key }}
                          sub={<>
                            {/* The count is of HOLDINGS, not of rows: ten mandate
                                rows stand for 281 of them, and a heading reading
                                "10 holdings" over ₹138.7 Cr would retire 271
                                positions from the page without saying so. And
                                holdings are the DEDUPED positions the totals row
                                is struck over, with the distinct securities among
                                them as "names" — the two counts the `/holdings`
                                drill-down prints for the same section (MH-06). */}
                            {grp.key === MANDATE_BUCKET ? (() => {
                              // A strategy two members hold is ONE row (Stage 10dl),
                              // so the count of rows and of accounts can differ —
                              // and where they do, both are said.
                              const accts = grp.rows.reduce((n, r) => n + (r.mandate?.accounts.length ?? 0), 0);
                              return `· ${grp.rows.length} ${grp.rows.length === 1 ? "mandate" : "mandates"}${accts !== grp.rows.length ? ` in ${accts} accounts` : ""} `;
                            })() : ""}· {grp.holdings} {grp.holdings === 1 ? "holding" : "holdings"}{!consolidate && grp.lines !== grp.holdings ? ` (${grp.lines} statement lines)` : ""} · {grp.names} {grp.names === 1 ? "name" : "names"} · {fmtFromBase(grp.subtotal, { compact: true })}
                            {/* A MEASURED ZERO KEEPS ITS ZERO, and says why it is
                                one. The section is not empty — every row in it is
                                reported at nil, which is a different fact from
                                "no statement carries this" and must not be shown
                                as an em dash. */}
                            {grp.subtotal === 0 && grp.rows.length > 0 && (
                              <>{" "}<span title="Not an absent figure: every statement in this section reports a nil balance, so the subtotal is a measurement.">
                                · a measured nil — every row here is reported at zero
                              </span></>
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
                            {grp.key === "Cash" && grp.rows.some((r) => isCashEquivalent(r)) && (() => {
                              const eq = grp.rows.filter((r) => isCashEquivalent(r));
                              const arb = eq.filter((r) => isArbitrageFund(r)).length;
                              const liq = eq.length - arb;
                              const fromDepository = eq.filter((r) => r.depositoryAsOf).length;
                              // EACH ROW'S OWN REASON, distinct — the two kinds are
                              // different sentences, and only one of them is an
                              // account with no holding statement (A-17).
                              const depositoryWhy = [...new Set(eq.map((r) => r.depositoryWhy).filter(Boolean))].join("; or ");
                              const parts = [liq ? `${liq} liquid` : null, arb ? `${arb} arbitrage` : null].filter(Boolean).join(" and ");
                              return (
                                <>{" "}<span data-cash-includes={`${liq}/${arb}`}
                                  title={`Cash is liquid and arbitrage — the family's own instruction, which they have given twice: arbitrage funds "need not be classified into any other category except for cash". The liquid funds are named on the Cash sheet of their consolidated review (30 June 2026); its arbitrage funds are on its Debt tab, and the family's instruction overrules that. Each arbitrage fund is identified by AMFI's own SEBI category against its ISIN, not by its name. The issuing documents type these Mutual Fund or ETF, and that is what the archive still records: this is the dashboard answering "how much of this book is cash", not a change to what any statement said. A liquid sleeve held inside a PMS mandate stays with the mandate, whose row has to tie to its own statement.`
                                    + (fromDepository
                                      ? ` ${fromDepository} of these ${fromDepository === 1 ? "is" : "are"} valued at AMFI's published NAV from units no statement prices — ${depositoryWhy}.`
                                      : "")}>
                                  · includes {parts} {eq.length === 1 ? "fund" : "funds"}
                                </span></>
                              );
                            })()}
                            {/* A RUPEE OR MORE, NEVER FLOAT DUST. The rows and the
                                subtotal are summed along two paths, and the
                                published NAVs carry four decimals, so on a section
                                with no duplicate at all the two differ by a few
                                paise — which rendered "₹0 reported twice, counted
                                once" over Mutual Fund: a claim about a duplicate
                                that does not exist, printed as a figure. */}
                            {grp.collapsed >= 1 && (
                              <>{" "}<span title="The same holding is reported on two members' statements. Both rows are shown as printed; the subtotal counts it once, exactly as the footer does.">
                                · {fmtFromBase(grp.collapsed, { compact: true })} reported twice, counted once
                              </span></>
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
                              <>{" "}<span className="text-amber-400/80" title={UNCLASSIFIED_WHY}>
                                · no {groupAxis === "basket" ? "basket" : "asset class"} stated
                              </span></>
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
                              <>{" "}<span title={`The family's review names most of this section product by product. ${fmtFromBase(grp.ruleMV, { compact: true })} of it is placed here by their stated rule instead — "all the direct stocks" belong to Thematic & Tactical — because the review does not name those holdings individually.`}>
                                · {fmtFromBase(grp.ruleMV, { compact: true })} by the family's stated rule, not named individually
                              </span></>
                            )}
                            {/*
                              THE CASH INSTRUCTION IS A DIFFERENT RULE AND SAYS
                              SO. Their review files its arbitrage funds on the
                              DEBT sheet; the family have since said arbitrage is
                              cash "and need not be classified into any other
                              category". So those funds sit here on the family's
                              word rather than the review's, and the heading
                              names which word — never the direct-stock rule's.
                            */}
                            {grp.cashRuleMV > 0 && (
                              <>{" "}<span title={`${fmtFromBase(grp.cashRuleMV, { compact: true })} of this section is here by the family's instruction that arbitrage and liquid funds are cash — "arbitrage funds need not be classified into any other category except for cash". Their consolidated review (30 June 2026) files its arbitrage funds on its Debt tab, or does not name the holding at all; the instruction overrules it. Each arbitrage fund is identified by AMFI's own SEBI category against its ISIN, never by its name.`}>
                                · {fmtFromBase(grp.cashRuleMV, { compact: true })} by the family&rsquo;s cash instruction
                              </span></>
                            )}
                          </>} />
                      </tr>
                    )}
                    {/*
                      ── EVERY METRIC, TOTALLED FOR THE CATEGORY IT HEADS ───────
                      "Show aggregate totals for every metric for each category."
                      The heading names the category and its size; this row is the
                      rest of the table's columns, added up over the same set.

                      IT SITS UNDER THE BAND, AT THE TOP OF ITS SECTION, which is
                      where the Private Market page's standard puts a section's
                      totals: a reader sees what a category adds up to before its
                      rows, and a CLOSED section still shows its figures — the band
                      and this row are what remain when its holdings are folded
                      away. Nothing about what the row carries moved.

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
                      // A line held at cost is value no gain is struck on, like a
                      // holding that reports no cost: both count against the return.
                      const covered = costCoversSet(tot.mv, uncostedMV + tot.atCostMV);
                      // Every costed line here is held at cost (the review's own
                      // section, or a family-axis row made only of such lines).
                      const allAtCost = tot.atCostCount > 0 && tot.atCostCount === tot.costedCount;
                      // FIFO over the section's own positions — the realised gain on
                      // units already sold stays in it, and a whole mandate is struck
                      // on its capital since inception (`fifoTotals`).
                      const ret = covered ? tot.fifo.returnPct : null;
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
                        tot.vacuous ? `${VACUOUS_COST_REASON}, and a return on cost has nothing to divide`
                        : tot.cost === null ? `no statement behind ${label} reports a cost, so there is nothing to measure a return against`
                        : tot.mv <= 0 ? `${label} is measured at nil — every statement behind it reports a zero balance — so there is no value to measure a return on`
                        : allAtCost ? `every holding in ${label} that reports a cost is ${AT_COST_RETURN}`
                        : tot.pnl === null ? `no holding in ${label} reports an unrealised gain, so there is no numerator to divide`
                        : tot.cost <= 0 ? `${label} reports a cost of zero, and a return on cost has nothing to divide by`
                        : [uncostedMV > 1 ? `${fmtFromBase(uncostedMV, { compact: true })} of this category's ${fmtFromBase(tot.mv, { compact: true })} is held in accounts that report no cost` : "",
                            tot.atCostMV > 1 ? `${fmtFromBase(tot.atCostMV, { compact: true })} of it is private investments held at cost, with no valuation to strike a gain on` : ""]
                            .filter(Boolean).join(", and ")
                          + `, so a return on cost would divide one set of holdings by another and describe neither column beside it. The ${tot.costedCount - tot.atCostCount} holdings with a cost and a valuation show their own return on their own rows.`;
                      const realised = tot.fifo.realised;
                      /**
                       * THE SECTION'S INVESTED IS THE SUM OF ITS ROWS', and a
                       * whole mandate's row prints its capital paid in — so the
                       * section swaps each whole mandate's cost held for that,
                       * and names both. Everything else stays the cost held.
                       */
                      const totInvested = investedWithCapital(tot.cost, tot.fifo);
                      const capitalWhy = investedBasisNote(tot.fifo, (v) => fmtFromBase(v, { compact: true }));
                      const costCover = `Added over the ${tot.costedCount} of ${tot.heldCount} holdings in ${label} whose statement reports a cost; the other ${tot.heldCount - tot.costedCount} hold ${fmtFromBase(uncostedMV, { compact: true })} and are in Market value only.`;
                      // The lines held at cost, said where they are: in Invested,
                      // in no gain (Stage 10dh).
                      const atCostCover = tot.atCostCount > 0
                        ? `${tot.atCostCount === 1 ? "1 holding" : `${tot.atCostCount} holdings`} worth ${fmtFromBase(tot.atCostMV, { compact: true })} ${tot.atCostCount === 1 ? "is a private investment" : "are private investments"} held at cost — the family's consolidated review records what was paid and no valuation — so ${tot.atCostCount === 1 ? "it is" : "they are"} in Invested and in no gain.`
                        : "";
                      return (
                        /* A `<Tr>` RATHER THAN A `<TrFoot>`, because this row
                           carries a cell under EVERY column — its label spans
                           one, not the footer's three — so it permutes like an
                           ordinary row and stays cell-for-cell under the
                           headings above it. */
                        <Tr view={holdView} className={`${TREE_ROW_DENSE.total} font-semibold`}
                          data-category-total={grp.key}
                          // ── WHAT A LINE HELD AT COST TAKES OUT OF THE COVERAGE
                          //    (Stage 10dh) ─────────────────────────────────────
                          // `covered` counts an at-cost line AGAINST the cost
                          // side, because the review records what was paid and no
                          // valuation, and a gain has nothing to divide. The sweep
                          // re-derives the coverage from this row's own printed
                          // cells — `mv − (invested + P&L)` — and an at-cost line
                          // is invisible to that: it HAS a cost and its P&L is
                          // nil, so the subtraction reads as full coverage and the
                          // check demanded a return this row correctly refuses.
                          // The value rides here so the checker can add it back.
                          data-cat-atcost={tot.atCostMV || undefined}
                          data-cat-atcost-n={tot.atCostCount || undefined}>
                          <td className="py-1.5 pl-[2.1rem] pr-2 text-slate-200">
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
                              ? <AbsentCell reason={tot.vacuous ? `in ${label}, ${VACUOUS_COST_REASON}` : `no statement behind ${label} reports a cost — these are depository holdings, which record what is held and never what it was bought for. A ₹0 here would report the whole category as profit.`} />
                              : <span title={[capitalWhy, uncostedMV > 1 ? costCover : "", atCostCover,
                                    tot.dupCost > 1 ? `The rows above are each member's statement as printed, so their Invested adds to ${fmtFromBase((totInvested ?? 0) + tot.dupCost, { compact: true })}; this total counts a holding two members both report once — a ${fmtFromBase(tot.dupCost, { compact: true })} overlap.` : ""].filter(Boolean).join(" · ") || undefined}
                                  data-invested-overlap={tot.dupCost > 1 ? tot.dupCost : undefined}
                                  data-invested-capital={capitalWhy ? totInvested ?? undefined : undefined}
                                  data-invested-cost-held={capitalWhy ? tot.cost ?? undefined : undefined}>
                                  {fmtFromBase(totInvested, { compact: true })}
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
                              ? <AbsentCell reason={tot.vacuous ? `an unrealised gain is market value less cost, and in ${label}, ${VACUOUS_COST_REASON}`
                                  : allAtCost ? `every holding in ${label} that reports a cost is ${AT_COST_PNL}`
                                  : `an unrealised gain is market value less cost, and no statement behind ${label} reports a cost`} />
                              : <span title={[uncostedMV > 1 ? costCover : "", atCostCover,
                                    tot.dupPnl !== 0 && tot.dupCost > 1 ? `The rows above are each member's statement as printed, so their gain adds to ${fmtFromBase(tot.pnl + tot.dupPnl, { compact: true, sign: true })}; this total counts a holding two members both report once — a ${fmtFromBase(tot.dupPnl, { compact: true, sign: true })} overlap.` : ""].filter(Boolean).join(" · ") || undefined}
                                  data-pnl-overlap={tot.dupPnl !== 0 && tot.dupCost > 1 ? tot.dupPnl : undefined}>
                                  {fmtFromBase(tot.pnl, { compact: true, sign: true })}
                                  {(uncostedMV > 1 || tot.atCostMV > 1) && <span className="ml-1 text-[10px] font-normal text-amber-400/80">◦</span>}
                                </span>}
                          </td>
                          {/* Realised is reported PER SECURITY across the whole
                              book, so the categories claim each name once and the
                              rows inside a mandate show none of it — the same
                              split the footer already names in the caption. */}
                          <td className="px-2 py-1.5 text-right mono whitespace-nowrap" data-realised={realised ?? undefined}>{
                            realised === null
                              ? <AbsentCell reason={`no holding in ${label} is covered by a capital gain statement or a dated unit record, so what its sales realised is not reported`} />
                              : <span className={changeColor(realised)}
                                  title={`Realised on units already sold, over the ${tot.fifo.realisedCovered} of ${tot.fifo.holdings} holdings in ${label} with a record that could carry it${tot.fifo.wholeMandates.length ? `; ${tot.fifo.wholeMandates.length} whole mandate(s) contribute everything they have booked since inception` : ""}.`}>
                                  {fmtFromBase(realised, { compact: true, sign: true })}
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
                                  : <span title={`${fifoBasisNote(tot.fifo, (n) => fmtFromBase(n, { compact: true }))}. Cumulative, not annualised — a category has no single purchase date to strike a CAGR or XIRR over.`}>
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
                    {pageRows.map((r) => {
                  const isOpen = expanded.has(r.key);
                  const multi = r.entities.length > 1;
                  /**
                   * CAN IT OPEN, AND HOW MANY CONTRIBUTIONS IT OPENS ONTO — the
                   * row advertises the second before anyone opens it, so a walk
                   * (and a reader) can find the longest history without opening
                   * every row. See `trancheInfo`.
                   */
                  const expandable = canExpand(r);
                  const contributions = trancheInfo.get(r.key)?.count ?? 0;
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
                  /**
                   * AND WAS A QUOTE THAT ARRIVED HELD BACK? (DL-9) Asked of a
                   * row that is not live, and of a mandate part of which is not:
                   * those lines keep their statement mark because the
                   * corporate-action check would not pair the quote with the
                   * statement's share count, not because no quote came.
                   */
                  const rowWithheld = !r.live || partLive ? withheldOf(linesOf(r)) : null;
                  // Only where it is actually true: a mandate every constituent
                  // of which is quoted is wholly live and says the ordinary thing.
                  const mixedBasisNote = partLive
                    ? `Part live: ${money(r.liveMV)} of this mandate's ${money(r.marketValue)} is repriced from live quotes and the rest keeps its statement mark — a mandate's cash sleeve can never be quoted, and neither can a share whose NSE symbol does not resolve${rowWithheld ? `; and the corporate-action check held back the quotes that arrived for ${rowWithheld.held} of its shares — ${rowWithheld.reason}` : ""}. Every figure on this row that market value feeds — value, weight, unrealised P&L and return — therefore blends the two bases, and has no single statement cell to trace to.`
                    : LIVE_CELL;
                  /**
                   * A COST CARRIED THROUGH A FUND'S CLASS SWITCH SAYS SO, on the
                   * cell that shows it. Buoyant's own statements print ₹72.5 Cr
                   * for what the family paid ₹70.9 Cr for, and a reader holding
                   * those statements has to be able to see which figure this is
                   * and why the other exists — see `carriedCostOf`.
                   */
                  const carried = r.costNA ? null : carriedCostOf(r.trancheSet, BOOK_POSITION_TRANCHES);
                  const carriedWhy = carried ? carriedCostNote(carried, (v) => fmtFromBase(v, { compact: true })) : "";
                  /**
                   * …AND A COST ON THE GROSS-PAID BASIS SAYS SO TOO (VD-24).
                   * Sanshi's statements net the stamp duty out of what they
                   * print as cost and the book carries every rupee paid; the two
                   * differ by thousands on crores, so the hover prints both in
                   * full — a compact figure would print them identically.
                   */
                  const gross = r.costNA || carried ? null : grossPaidOf(r.trancheSet);
                  const grossWhy = gross ? grossPaidNote(gross, (v) => fmtFromBase(v)) : "";
                  /**
                   * WHAT A PARTLY COSTED ROW'S COST FIGURES COVER (A-02), and why
                   * an uncosted one has none — in the cell, never a bare dash.
                   * ICICI Bank is the book's case: 7,000 of 21,500 shares carry a
                   * cost, so Avg cost, Invested and P&L are struck over those and
                   * say so, and the other 14,500 are in Market value only.
                   */
                  const cover = r.costCover;
                  const coverNote = cover && !r.costNA
                    ? costCoverNote(cover, (v) => fmtFromBase(v, { compact: true }), fmtNum) : "";
                  // THE ◦ MARKS A PARTLY COSTED ROW, and only that: a row whose
                  // every line reports a cost has no part left out, even where
                  // the note names lines held at cost (Stage 10dh).
                  const coverPartial = !!cover && !r.costNA && !cover.complete;
                  // Why a security row has no unit count: every line is the
                  // review's amount paid, or one of them is.
                  const noCountWhy = cover && cover.units > 0
                    ? "a line behind this row is the family's consolidated review recording what was paid and no unit count — a count over the other lines would state a holding of fewer units than it is"
                    : NO_UNIT_COUNT;
                  const noCostWhy = r.measuredNA
                    ? DERIVED_ONLY_WHY
                    : cover?.vacuous
                    ? VACUOUS_COST_REASON
                    : "no statement behind this holding reports what it cost — a depository records what is held and never what was paid for it. A ₹0 here would report the whole holding as profit";
                  const pnlValue = cover ? cover.costedValue : r.marketValue;
                  // A WHOLE MANDATE'S INVESTED IS ITS CAPITAL PAID IN, and the
                  // cell names the cost of the shares it holds beside it.
                  const capitalNote = r.kind === "mandate" && r.fifo && r.invested !== undefined
                    ? investedBasisNote(r.fifo, (v) => fmtFromBase(v, { compact: true })) : "";
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
                      {/* THE WHOLE ROW IS THE CONTROL — the standard's rule. A click
                          anywhere opens it, except on a link, a button or a
                          popover inside it, which keep their own meaning: the
                          name still opens the holding's page, a formula still
                          opens its arithmetic. */}
                      <Tr view={holdView} className={expandable ? TREE_ROW_DENSE.parent : "hover:bg-ink-700/40"}
                        {...(expandable ? rowToggle(() => toggleRow(r.key)) : {})}
                        data-tree-parent={expandable ? (isOpen ? "open" : "closed") : undefined}
                        {...(contributions > 0 ? { "data-tranche-rows": String(contributions) } : {})}
                        data-bucket={r.bucket}
                        {...(r.measuredNA ? { "data-derived-only": "" } : {})}
                        {...(r.securityKey ? { "data-security-key": r.securityKey } : {})}
                        {...(r.venues ? { "data-venues": String(r.venues.length) } : {})}
                        {...(m ? {
                          "data-mandate": m.name,
                          "data-mandate-accounts": m.accounts.map((a) => a.accountId).join(" "),
                          "data-manager": m.manager,
                          "data-account": m.accounts.map((a) => a.accountNo).join(" "),
                          "data-mandate-lines": String(m.accounts.length),
                          // Each account's own holding count, in `data-account`'s
                          // order, so the drill-down of ONE account can be held
                          // to the line it is on this row.
                          "data-mandate-line-counts": m.accounts.map((a) => String(a.holdings)).join(" "),
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
                        <TreeNameCell depth={0} density="dense" className="min-w-[16rem]"
                          open={isOpen} onToggle={expandable ? () => toggleRow(r.key) : undefined}
                          toggleLabel={toggleLabelFor(r, isOpen)}
                          title={m ? (
                            <>
                              {/* ONE ACCOUNT, ONE PAGE: the name opens it. SEVERAL
                                  ACCOUNTS RUN ONE STRATEGY — Aristos for Ajay and for
                                  Ankita — and are one row (Stage 10dl); there the name
                                  is not a link, because it would have to pick one
                                  member's account, and each account's own line under it
                                  opens that account's page, where its shares are. */}
                              {m.accounts.length === 1 ? (
                                <Link to={`/mandate/${encodeURIComponent(m.accounts[0].accountId)}`}
                                  title={`${m.manager} — account ${m.accounts[0].accountNo}, ${m.accountCount} holdings. Open the mandate drill-down.`}
                                  className="font-medium text-slate-100 underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
                                  {r.security}
                                </Link>
                              ) : (
                                <span className="font-medium text-slate-100"
                                  title={`${m.manager} — run for ${m.accounts.length} accounts (${m.accounts.map((a) => `${a.owner} ${a.accountNo}`).join(", ")}), ${m.accountCount} holdings in all. Open the row for each account; each account's own page lists its shares.`}>
                                  {r.security}
                                </span>
                              )}{" "}
                              <span className="align-middle"><Pill tone="core">PMS mandate</Pill></span>
                            </>
                          ) : (
                            <>
                              {/*
                                A CLUBBED FUND ROW IS NOT A LINK, AND THAT IS THE
                                POINT. `/stock/:securityKey` serves ONE class, so
                                a row reading "3P India Equity Fund 1" that opened
                                Class B3's page would name one thing and show
                                another. The classes are each linked on their own
                                lines when the row is opened, where each is itself
                                again.
                              */}
                              {r.fundClasses.length
                                ? <span data-fund-classes={r.fundClasses.join(",")}>{r.security}</span>
                                : <StockLink securityKey={r.securityKey} name={r.security} />}
                              {/* THE SPACE IS LOAD-BEARING, not cosmetic. These pills are
                                  INLINE — a flex wrapper would put a newline inside the
                                  cell and shatter every row-based check that splits the
                                  page on newlines (Stage 10af) — and an inline element
                                  contributes no whitespace to `innerText`, so without it
                                  the row reads "Fund 13 unit classes". */}
                              {r.fundClasses.length > 0 && (
                                <>{" "}<span className="ml-1 align-middle"><Pill>{r.fundClasses.length} unit classes</Pill></span></>
                              )}
                              {/*
                                THE `redeemed` PILL WAS HERE AND IS GONE, BECAUSE
                                THE ROW IT EXPLAINED IS GONE. The monitor lists
                                current holdings only (`currentHoldings`), so a
                                closed position has no row left to pill; a closed
                                row still RENDERS on `/holdings`, where it carries
                                the explanation instead.
                              */}
                            </>
                          )}
                          /* THE ONE THING THAT IS NOT A DETAIL STAYS, and only
                             when it is true: under a filter a mandate row's
                             figures cover PART of the mandate, and a reader who
                             is not told that reads a subset as the account. */
                          sub={m && m.holdings.length < m.accountCount ? (
                            <span className="text-amber-400/80">
                              {m.holdings.length} of {m.accountCount} holdings match the filters — the mandate itself holds {fmtFromBase(m.accountMV, { compact: true })}
                            </span>
                          ) : undefined} />
                        <td className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap">
                          {r.quantity === null
                            ? <AbsentCell reason={r.measuredNA ? DERIVED_ONLY_WHY : r.fundClasses.length
                                ? `this row is one fund under ${r.fundClasses.length} unit classes (${r.fundClasses.join(", ")}), and their units are not the same unit: each class is allotted at its own NAV. Adding them would give a quantity no NAV prices. Open the row for each class's own units.`
                                : r.kind === "mandate"
                                ? "a mandate is an account, not a security: the shares inside it carry the quantities and it carries none. A 0 here would say the manager holds nothing."
                                : noCountWhy} />
                            : fmtNum(r.quantity)}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap">
                          {m ? <AbsentCell reason="an average cost per unit needs one security; this row rolls up the mandate's holdings, each with a cost of its own" />
                            : r.fundClasses.length
                            ? <AbsentCell reason={`an average cost per unit needs one unit, and this row clubs ${r.fundClasses.length} unit classes allotted at NAVs of their own. The money below it is additive across classes; a per-unit figure is not.`} />
                            : r.costNA ? <AbsentCell reason={noCostWhy} />
                            : r.avgCost === null ? <AbsentCell reason={r.quantity === null ? noCountWhy : r.quantity === 0 ? "this line holds no units to divide its cost by" : "this provider prints no per-unit cost for the holding"} />
                            : coverPartial ? <span title={coverNote} data-avg-cost-costed={r.avgCost}>{fmtFromBase(r.avgCost)}<span className="ml-1 text-[10px] text-amber-400/80">◦</span></span>
                            : coverNote ? <span title={coverNote}>{fmtFromBase(r.avgCost)}</span>
                            : fmtFromBase(r.avgCost)}
                        </td>
                        {/* THE INVESTED CELL CARRIED A SECOND CHEVRON, opening the
                            contribution history as a table of its own. It is a
                            plain figure now: the row opens once, and the dated
                            contributions are rows under the statement they
                            bought units in — see "WHAT A ROW OPENS INTO".

                            AND A COST CARRIED THROUGH A CLASS SWITCH SAYS SO,
                            in the hover on the figure itself — see `carried`
                            above. The handles are what the sweep reads. */}
                        <td className="px-2 py-1.5 text-right mono text-slate-400 whitespace-nowrap"
                          data-cost-carried={carried ? carried.paid : undefined}
                          data-cost-printed={carried ? carried.printed : undefined}
                          data-cost-gross={gross ? gross.paid : undefined}
                          data-cost-gross-printed={gross ? gross.printed : undefined}
                          data-invested-capital={capitalNote ? investedOf(r) ?? undefined : undefined}
                          data-invested-cost-held={capitalNote ? r.costBasis ?? undefined : undefined}>
                          {r.costNA ? <AbsentCell reason={noCostWhy} />
                            : capitalNote
                            ? <span title={capitalNote}>{fmtFromBase(investedOf(r), { compact: true })}</span>
                            : carriedWhy
                            ? <span title={carriedWhy}>{fmtFromBase(r.costBasis, { compact: true })}</span>
                            : grossWhy
                            ? <span title={grossWhy}>{fmtFromBase(r.costBasis, { compact: true })}</span>
                            : coverPartial
                            ? <span title={coverNote}>{fmtFromBase(r.costBasis, { compact: true })}<span className="ml-1 text-[10px] text-amber-400/80">◦</span></span>
                            : coverNote
                            ? <span title={coverNote}>{fmtFromBase(r.costBasis, { compact: true })}</span>
                            : fmtFromBase(r.costBasis, { compact: true })}
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
                              : r.measuredNA
                                ? DERIVED_ONLY_WHY
                                : r.costNA
                                ? "no statement in this book reports what this holding cost, so there is no payment to date. A depository records what is held and never what was paid for it"
                                : investedOnWhy(r.trancheSet)} />
                            : <span title={r.investedOn.payments > 1
                              ? `Funded over ${r.investedOn.payments} dated payments, ${fmtDate(r.investedOn.first)} to ${fmtDate(r.investedOn.last)}. Open the row for each payment's own units, entry NAV and return — they are not the same return, because each has been at work for a different length of time.`
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
                            : r.measuredNA
                            ? <AbsentCell reason={DERIVED_ONLY_WHY} />
                            : r.fundClasses.length
                            ? <AbsentCell reason={`${statementNoteForSet(r.trancheSet)?.note ? `${statementNoteForSet(r.trancheSet)!.note} ` : ""}Each unit class of this fund is marked at its OWN NAV — ${r.fundClasses.join(", ")} — so there is no one price for the row. Open it for each class's own mark.`} />
                            : r.splitMarks && r.splitMarks.length > 1
                            ? <span data-cmp-split={r.splitMarks.length}><AbsentCell reason={splitMarkReason(r.splitMarks.map((v) => fmtFromBase(v)))} /></span>
                            : r.currentPrice === null
                            ? <AbsentCell reason={totalValueNote(r.valuedAt, r.trancheSet, accIdx)} />
                            : r.live
                            ? fmtFromBase(r.currentPrice)
                            : <>{fmtFromBase(r.currentPrice)}
                                <span className="ml-1 cursor-help text-[10px] text-amber-400/80"
                                  title={(statementNoteForSet(r.trancheSet)?.note ? `${statementNoteForSet(r.trancheSet)!.note} ` : "") + (r.navPriced
                                    ? `AMFI's published NAV for this scheme, as of ${r.navDate}. A fund resolves no NSE trading symbol so it can never carry an intraday quote; this is the industry's own daily figure, refreshed every day, and it is NEWER than the statement mark it replaced.`
                                      + (r.depositoryWhy
                                        ? ` Some of these units carry no statement mark at all: they are ${r.depositoryWhy}, valued at this NAV.`
                                        : "")
                                    // THE STATEMENT'S OWN DATE, never the book's newest (C-01): a
                                    // mark struck on 31 Jul captioned 29 Aug is a month-old price
                                    // passed off as current.
                                    // A QUOTE THE CORPORATE-ACTION CHECK HELD BACK is not
                                    // "no live price" (DL-9): it arrived.
                                    : (rowWithheld
                                      ? `A live quote arrived for this security and the corporate-action check held it back — ${rowWithheld.reason}. `
                                      : "No live price for this security — ")
                                      + (r.valuedAt
                                        ? statementMarkNote(`${rowWithheld ? "Showing" : "showing"} the mark from its statement`, r.valuedAt, r.trancheSet, accIdx)
                                        : `${rowWithheld ? "Showing" : "showing"} the mark its statements print; they are dated differently, and each line in the row's expansion carries its own date.`))}
                                  data-cmp-withheld={rowWithheld ? "1" : undefined}
                                  data-statement-note={statementNoteForSet(r.trancheSet)?.short}>◦</span></>}
                        </td>
                        <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${r.live && r.dayChangePct != null ? changeColor(r.dayChangePct) : "text-slate-600"}`}
                          title={r.live && r.dayChangePct != null
                            ? `${fmtFromBase(r.dayChange, { compact: true, sign: true })} since previous close${m ? `, across the ${fmtFromBase(r.liveMV, { compact: true })} of this mandate the feed prices` : " on the position"}`
                            : undefined}>
                          {r.live && r.dayChangePct != null
                            ? `${r.dayChangePct >= 0 ? "+" : ""}${r.dayChangePct.toFixed(2)}%`
                            : <AbsentCell reason={r.measuredNA
                                ? DERIVED_ONLY_WHY
                                : m
                                ? (rowWithheld
                                  ? `no share inside this mandate is on a live price: the corporate-action check held back the quotes that arrived for ${rowWithheld.held} of its ${rowWithheld.of} shares — ${rowWithheld.reason} — so there is no previous close to move from`
                                  : "no live quote for any share inside this mandate, so there is no previous close to move from")
                                : rowWithheld
                                ? (rowWithheld.held < rowWithheld.of
                                  ? `the corporate-action check held back the live quote on ${rowWithheld.held} of this security's ${rowWithheld.of} lines — ${rowWithheld.reason} — so the row has no one move from a previous close; each line in its expansion carries its own`
                                  : `a live quote arrived and the corporate-action check held it back — ${rowWithheld.reason} — so there is no previous close to move from`)
                                : r.splitMarks && r.splitMarks.length > 1
                                ? "no live quote for this security, and its statements mark it at different prices, so there is no one previous close to move from"
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
                        <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${r.costNA ? "text-slate-500" : changeColor(r.unrealizedPnL)}`}
                          title={r.live && !r.costNA ? [mixedBasisNote, coverNote].filter(Boolean).join(" · ") : undefined}>
                          {r.costNA ? <AbsentCell reason={r.measuredNA ? DERIVED_ONLY_WHY : `an unrealised gain is market value less cost, and ${noCostWhy}`} />
                            // HELD AT COST: a cost and no valuation, so no gain —
                            // never a ₹0, which reads as a holding that did not
                            // move (Stage 10dh).
                            : r.unrealizedPnL === null ? <AbsentCell reason={r.valuedAtCost ? AT_COST_PNL
                              : "every line here that reports a cost is held at cost — the family's consolidated review records what was paid and no valuation — and the rest report no cost, so there is no gain to strike"} />
                            : r.live ? <span data-pnl-costed-value={pnlValue}>{fmtFromBase(r.unrealizedPnL, { compact: true, sign: true })}{coverPartial && <span className="ml-1 text-[10px] text-amber-400/80">◦</span>}</span>
                            : <span data-pnl-costed-value={pnlValue} title={coverNote || undefined}><Auditable formula={{
                                ...pnlFormula(pnlValue, r.costBasis, r.unrealizedPnL, money),
                                ...(coverNote ? { plain: `What the shares whose statement reports a cost are worth today, minus what they cost. ${coverNote}` } : {}),
                              }}>{fmtFromBase(r.unrealizedPnL, { compact: true, sign: true })}</Auditable>{coverPartial && <span className="ml-1 text-[10px] text-amber-400/80">◦</span>}</span>}
                        </td>
                        {/* REALISED, MATCHED FIFO, ON THE ROW'S OWN HOLDINGS —
                            a whole mandate carries everything its capital shows
                            it has booked since inception. Never a dash without
                            its reason: no record covers the account, or the
                            sale came after the holding's own statement date. */}
                        <td className="px-2 py-1.5 text-right mono whitespace-nowrap" data-realised={r.realised ?? undefined}>{
                          r.realised === null
                            ? <AbsentCell reason={r.trancheSet.length
                                ? realisedReason(r.trancheSet.find((x) => x.realizedLotsAfter) ?? r.trancheSet[0])
                                : r.measuredNA ? DERIVED_ONLY_WHY
                                : "no capital gain statement or dated unit record covers these holdings, so what their sales realised is not reported"} />
                            : <span className={changeColor(r.realised)}
                                title={m && r.fifo?.wholeMandates.length
                                  ? `Everything this mandate has booked since it opened — every sale its manager made, and its income less its fees — which is its value plus withdrawals less the capital paid in, less the unrealised gain on the shares it holds now. The lines under it show each share's realised over its own capital gain statement's window, so they do not add to this figure: it also carries the sales before that window and the income less fees.`
                                  : realisedWindowOf(r.trancheSet)}>
                                {fmtFromBase(r.realised, { compact: true, sign: true })}
                              </span>
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
                              ? <Auditable formula={returnFormula(pnlValue, r.costBasis, r.returnPct, money, r.fifo ? { realised: r.fifo.realised, deployed: r.fifo.deployed,
                                  capital: m && r.fifo.wholeMandates.length ? { value: r.fifo.marketValue, contributed: r.fifo.wholeContributed, withdrawn: r.fifo.wholeWithdrawn } : null } : undefined)}><span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true })}</span></Auditable>
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
                              data-return-valued-at={r.valuedAt ?? undefined}
                              data-return-note={res.shown ? res.note : undefined}
                              /* WHICH ACCOUNTS THE ROW IS, where it is whole accounts
                                 (`datedCapital.ts`) — the sweep re-solves the rate over
                                 them from the book, and holds each to being whole in
                                 this row, rather than reading the page's figure back. */
                              {...(r.capital ? {
                                "data-capital": r.capital.dated ? "dated" : "undated",
                                "data-capital-accounts": r.capital.accountIds.join(" "),
                                "data-row-keys": r.realizedKeys.join(" "),
                              } : {})}
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
                            ? <AbsentCell reason={fundSectorWhy(r.assetClass)} />
                            : sectorCell(r.sector, r.securityKey, r.trancheSet, !r.measuredNA)}
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
                            r.entities.length
                            ? <span className="text-[12px]">{r.entities[0]}</span>
                            : <AbsentCell reason={r.measuredNA
                                ? "no account in this book holds this company directly — the family reaches it only through funds whose filings name it"
                                : "no account in this book stands behind this row"} />
                          )}
                        </td>
                      </Tr>
                      {/* WHAT THIS ROW OPENS INTO — rows of this table, in its
                          columns. See "WHAT A ROW OPENS INTO" above the table. */}
                      {isOpen && renderChildren(r)}
                    </Fragment>
                  );
                    })}
                  </Fragment>
                  );
                })}
                <TablePageControls pagination={holdingPage} columns={COL_COUNT} />
                {/* A PICKED HOLDING THIS AXIS DOES NOT DRAW — see `pickedNotRows`.
                    It stands in for the generic empty line where it explains the
                    whole of an empty table, and sits under the company rows where
                    the reader picked both kinds, so a fund picked beside a share
                    is never dropped from the table without a word. */}
                {pickedNotRows.length > 0 && (
                  <tr data-picked-not-rows={pickedNotRows.length}>
                    {/* The cell spans every column of a table wider than the
                        screen, so its text is pinned to the left of the scroll
                        area (`sticky`) — centred over the whole table, the
                        button that fixes it sat past the visible edge. */}
                    <td colSpan={COL_COUNT} className={`px-3 ${rows.length === 0 ? "py-10" : "py-3"}`}>
                      {/* ONE SHORT LINE, THE REST IN THE HOVER — the rule every
                          table note follows since Stage 10ci, which caps a cell
                          at 180 characters. The old sentence ran to 182 with
                          Sanshi's name in it. What stays on screen is what a
                          reader acts on: which holding, why it is not a row, and
                          the one click that shows it. */}
                      <div className="sticky left-3 max-w-[44rem] text-sm leading-relaxed text-slate-400"
                        title={"All Securities has one row per company, whichever vehicle holds it: the family's own demat, a manager's mandate, or a fund that discloses it. "
                          + "A holding that is not a share in a company (a fund, an ETF, a bond, cash) is a row on Category instead, where every holding is one."}>
                        <span className="text-slate-200">
                          {pickedNotRows.length === 1 ? pickedNotRows[0]
                            : `${pickedNotRows.length} of the holdings you picked`}
                        </span>
                        {" "}{pickedNotRows.length === 1 ? "is not a company share, so it is not a row" : "are not company shares, so they are not rows"} on
                        All Securities.{" "}
                        <button type="button" data-show-on-category onClick={() => setGroupAxis("category")}
                          className="font-medium text-champagne-400 hover:underline ring-focus">
                          Show {pickedNotRows.length === 1 ? "it" : "them"} on Category
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {rows.length === 0 && pickedNotRows.length === 0 && <tr><td colSpan={COL_COUNT} className="py-12 text-center text-sm text-slate-500">No positions match your filters.</td></tr>}
              </tbody>
              {/* NO FOOTER OVER NO ROWS. Summed over an empty table it printed
                  "₹0 ₹0 ₹0 0.0%", and a total of nothing is not a measured zero
                  (§2) — the line above already says why the table is empty. */}
              {rows.length > 0 && (
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
                  // The same two handles the category rows carry, for the same
                  // reason (Stage 10dh): the footer's own return is refused where
                  // the at-cost lines are the whole of its cost side.
                  data-cat-atcost={footCover.atCost.value || undefined}
                  data-cat-atcost-n={footCover.atCost.lines || undefined}
                  labelTitle={(smallDropped.count > 0
                        ? `Total · ${rows.length} rows. ${smallDropped.count} holding${smallDropped.count === 1 ? "" : "s"} worth under ${fmtFromBase(NEGLIGIBLE_VALUE_FLOOR)} ${smallDropped.count === 1 ? "is" : "are"} dropped automatically at the family's instruction — ${fmtFromBase(smallDropped.value)} in total${bySecurity
                          ? `. On this view that is what the weight base and the Total exposure partition leave out; the company-share totals on this row leave out ${smallDropped.shareCount
                              ? `only the ${fmtFromBase(smallDropped.shareValue)} of it that is company shares (${smallDropped.shareCount} holding${smallDropped.shareCount === 1 ? "" : "s"}), because the rest are funds, which are not rows here`
                              : "none of it, because every one of them is a fund, which is not a row here"}`
                          : ", which is what this figure and every total beside it leave out"}. Nothing is missing: the book still carries them and the statements still report them.`
                        : `Total · ${rows.length} rows. No holding in this book falls under the ${fmtFromBase(NEGLIGIBLE_VALUE_FLOOR)} floor.`)
                    + (dupGap > 0
                        ? ` The rows above are each member's statement as printed, so they add to ${money(rawMV)}; this total counts a holding two members both report once, at ${money(totMV)} — a ${money(dupGap)} overlap.`
                        : "")}
                  label={<>Total · {rows.length} rows</>}
                  cells={{
                    invested: totCost === null ? (
                    <td key="invested" className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap">
                      <AbsentCell reason={footCover.vacuous
                        ? `across the holdings in view, ${VACUOUS_COST_REASON}`
                        : "no statement behind the holdings in view reports a cost — a depository records what is held and never what it was bought for, and a ₹0 here would report the whole table as profit"} />
                    </td>
                    ) : (
                    <td key="invested" className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap"
                      data-invested-lines={footCover.lines} data-invested-costed={footCostedLines}
                      data-invested-overlap={dupCost > 1 ? dupCost : undefined}
                      title={investedFootNote || undefined}
                      data-invested-capital={totFifo.wholeMandates.length ? investedWithCapital(totCost, totFifo) ?? undefined : undefined}><Auditable formula={{
                        title: "Total invested",
                        excel: totFifo.wholeMandates.length ? "= Σ Cost of the holdings still held − their cost in whole mandates + those mandates' capital paid in" : "= Σ Cost of the holdings whose statement reports one",
                        plain: `What the ${bySecurity ? "company shares" : "holdings"} in this table cost, added together — ${footScope}.${totFifo.wholeMandates.length ? ` ${investedBasisNote(totFifo, money)}, so this is the sum of the Invested cells above it.` : ""}${investedFootNote ? ` ${investedFootNote}` : ""}`,
                        worked: totFifo.wholeMandates.length
                          ? `= ${money(totCost)} − ${money(totFifo.wholeCostHeld)} + ${money(totFifo.wholeContributed)} = ${money(investedWithCapital(totCost, totFifo))}, over the ${footCostedLines} holdings that report a cost`
                          : `= ${money(totCost)}, over the ${footCostedLines} holdings that report a cost`,
                      }}>{fmtFromBase(investedWithCapital(totCost, totFifo), { compact: true })}</Auditable>{!footCover.complete
                        && <span className="ml-1 text-[10px] font-normal text-amber-400/80" data-invested-partial="">◦</span>}</td>
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
                      data-invested-on-of={measuredRows.length}
                      title={`A holding is dated where a lot register reports when it was acquired, or where the fund reports its own dated allotments against that folio. The rest report a cost and not a date, or no cost at all — a depository records what is held and never what was paid for it.${rows.length > measuredRows.length ? ` Counted over the ${measuredRows.length} rows the statements report: the other ${rows.length - measuredRows.length} are companies the family reaches only through funds, which carry no date of the family's own.` : ""}`}>
                      {rows.filter((r) => r.investedOn).length} of {measuredRows.length} dated
                    </td>
                    ),
                    cmp: (
                    <td key="cmp" className="px-2 py-1.5"></td>
                    ),
                    day: (
                    <td key="day" data-footer-day="" className={`px-2 py-1.5 text-right mono whitespace-nowrap ${totDayPct == null ? "text-slate-600" : changeColor(totDayPct)}`}
                      title={totDayPct == null ? undefined : `${money(totDay, true)} across the live-priced book since previous close`}>
                      {totDayPct == null
                        ? <AbsentCell reason="no row in view carries a live price with a previous close, so there is no day move to add up" />
                        : `${totDayPct >= 0 ? "+" : ""}${totDayPct.toFixed(2)}%`}
                    </td>
                    ),
                    mv: (
                    <td key="mv" className="px-2 py-1.5 text-right mono text-slate-100 whitespace-nowrap"
                      title={[feedLive ? LIVE_CELL : "", markBlend].filter(Boolean).join(" ")} data-mv-blend="">
                      {feedLive ? fmtFromBase(totMV, { compact: true })
                                : <Auditable formula={{ title: "Total market value", excel: bySecurity ? "= Σ Market value of the company shares the statements report" : "= Σ Market value of all holdings", plain: `The market value of the ${bySecurity ? "company shares" : "holdings"} in this table, added together — ${footScope}. ${markBlend}`, worked: `= ${money(totMV)} across ${footCover.lines} holdings`,  }}>{fmtFromBase(totMV, { compact: true })}</Auditable>}
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
                            + ` from what ${stockCoverage.fundsRead} of your ${stockCoverage.considered} fund holdings disclose line by line`
                            + (stockCoverage.zeroLine > 0 ? ` (${stockCoverage.zeroLine} more ${stockCoverage.zeroLine === 1 ? "has" : "have"} a store entry and no disclosed line)` : "")
                            + `.`
                            + ` The rest is not companies this table can see: ${money(stockCoverage.opaque)} sits inside vehicles whose holdings this book cannot read`
                            + (stockCoverage.aifCount > 0 || stockCoverage.notInStore.names.length > 0
                                ? ` (${[
                                    stockCoverage.aifCount > 0 ? `${stockCoverage.aifCount} AIF fund class${stockCoverage.aifCount === 1 ? "" : "es"}, ${money(stockCoverage.aifValue)} — an AIF files no portfolio disclosure that joins to a folio this family holds, so no future statement fills it` : "",
                                    stockCoverage.notInStore.names.length > 0 ? `${stockCoverage.notInStore.names.join(", ")}, ${money(stockCoverage.notInStore.value)} — a fund whose filing the store does not carry` : "",
                                  ].filter(Boolean).join("; ")})`
                                : "")
                            + `, ${money(stockCoverage.unaccounted)} is the part of a disclosed fund no line in the filing accounted for — its cash sleeve, a gold or silver ETF's metal, and the disclosure's own rounding`
                            + (stockCoverage.other > 0 ? `, ${money(stockCoverage.other)} is ${stockCoverage.otherLabels} holdings, which this table does not draw` : "")
                            + ` — and ${money(stockCoverage.cash)} is cash: the book's own cash rows and the arbitrage funds the family counts as cash, which are not looked through because their long shares are hedged.`
                            + ` That is the family's cash rule (${money(stockCoverage.cashRule)}: every Cash row, liquid fund and arbitrage fund) less the ${money(stockCoverage.liquidThrough)} of liquid funds, which this view reads through instead because their paper is real credit; the Category view's Cash section reads ${money(stockCoverage.categoryCash)} because it counts those liquid funds and files the ${money(stockCoverage.mandateCash)} of cash inside PMS mandates with each mandate.`
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
                    <td key="weight" data-footer-weight="" className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap"
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
                          : dupGap > 0
                          ? `Every weight above is struck over this table's own book of ${fmtFromBase(weightBase, { compact: true })}. The rows are each member's statement as printed, so the column adds to ${((rawMV / weightBase) * 100).toFixed(1)}% and not to 100%: a holding two members both report is in two rows, and this total counts it once, at ${pct}%.`
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
                    pnl: totPnL === null ? (
                    <td key="pnl" className="px-2 py-1.5 text-right mono whitespace-nowrap text-slate-500">
                      <AbsentCell reason={footCover.vacuous
                        ? `an unrealised gain is market value less cost, and across the holdings in view, ${VACUOUS_COST_REASON}`
                        : totCost !== null && footStruckLines === 0 && footCover.atCost.lines > 0
                        ? `every holding in view that reports a cost is ${AT_COST_PNL}`
                        : "an unrealised gain is market value less cost, and no statement behind the holdings in view reports a cost"} />
                    </td>
                    ) : (
                    <td key="pnl" className={`px-2 py-1.5 text-right mono whitespace-nowrap ${changeColor(totPnL)}`}
                      title={[feedLive ? LIVE_CELL : "", pnlFootNote].filter(Boolean).join(" ") || undefined}
                      data-pnl-overlap={dupCost > 1 && dupPnl !== 0 ? dupPnl : undefined}
                      data-pnl-costed-value={footCover.costedValue}>
                      {feedLive ? fmtFromBase(totPnL, { compact: true, sign: true })
                                : <Auditable formula={{ title: "Total unrealised P&L", excel: "= Σ (Market value − Cost), over the holdings whose statement reports a cost",
                                    // A CAPTION THAT WIDENS ITS FIGURE IS THE SAME FAILURE AS ONE THAT
                                    // NARROWS IT: this is struck over the costed holdings only, which
                                    // is what makes it tie to the Invested cell beside it.
                                    plain: footCover.complete && footCover.atCost.lines === 0
                                      ? "Every holding's on-paper gain or loss, added up."
                                      : `The on-paper gain or loss of the ${footStruckLines} of ${footCover.lines} holdings whose statement reports a cost and a valuation, added up.${footCover.complete ? "" : ` The other ${footCover.uncosted.lines} hold ${money(footCover.uncosted.value)} and report no cost, so they are in Market value and not here — never counted at zero.`}${atCostFootNote ? ` ${atCostFootNote}` : ""}`,
                                    worked: `= ${money(footCover.costedValue)} − ${money(totCost)} = ${money(totPnL, true)}` }}>{fmtFromBase(totPnL, { compact: true, sign: true })}</Auditable>}
                      {(!footCover.complete || footCover.atCost.lines > 0) && <span className="ml-1 text-[10px] font-normal text-amber-400/80" data-pnl-partial="">◦</span>}
                    </td>
                    ),
                    /* THE FOOTER'S REALISED IS THE SUM OF THE SECTIONS', which
                        are the sums of their rows' — `fifoTotals` over the same
                        positions three times, so a reader adding the column gets
                        the footer. A holding with no record contributes nothing
                        rather than a zero. */
                    realised: (
                    <td key="realised" className="px-2 py-1.5 text-right mono whitespace-nowrap" data-realised={totFifo.realised ?? undefined}>{
                      totFifo.realised === null
                        ? <AbsentCell reason="no holding in this table is covered by a capital gain statement or a dated unit record, so what its sales realised is not reported" />
                        : <>
                          <span className={changeColor(totFifo.realised)} title={realisedBasis.note} data-realised-basis>
                            {fmtFromBase(totFifo.realised, { compact: true, sign: true })}
                          </span>
                          {/* THE BASIS ON THE FACE (MH-05): which of the two
                              realised figures this book prints this is, in a
                              few words; what it counts and leaves out, and the
                              statements' own total, are in the hover. */}
                          <span className="mt-0.5 ml-auto block max-w-[11rem] whitespace-normal text-right text-[10px] font-normal leading-tight text-slate-500"
                            title={realisedBasis.note} data-realised-face>{realisedBasis.face}</span>
                        </>
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
                        <td key={`ret:${measure}`} className={`px-2 py-1.5 text-right mono whitespace-nowrap ${onCost ? changeColor(totalRet) : "text-slate-500"}`}
                          title={onCost && feedLive ? LIVE_CELL : undefined}>
                          {!onCost
                            ? <AbsentCell reason={`This is the whole book, not a holding: ${AGG_NO_MEASURE[measure]} Its cumulative return shows under HPR — tick Holding Period Return to see it.`} />
                            : totalRet === null
                            ? <AbsentCell reason={footStruckLines === 0 && footCover.atCost.lines > 0
                                ? `every holding in this table that reports a cost is ${AT_COST_RETURN}`
                                : "no holding in this table reports a cost, so there is nothing to strike a return over — each costed holding shows its own on its row"} />
                            : <>{feedLive ? fmtPct(totalRet, { sign: true })
                            : <Auditable formula={{ title: "Total return (FIFO)", excel: "= (Σ unrealised + Σ realised) ÷ Σ capital deployed × 100", plain: "Everything the holdings in this table have produced — the unrealised gain on what is held and the realised gain on what was already sold, matched first-in, first-out — over every rupee that bought a unit of them. A whole mandate is struck on its capital since inception.", worked: `= (${money(totFifoCosted.unrealised ?? 0, true)} + ${money(totFifoCosted.realised ?? 0, true)}) ÷ ${money(totFifoCosted.deployed ?? 0)} × 100 = ${fmtPct(totalRet, { sign: true })}${totFifo.uncosted ? ` · over the holdings that report a cost; ${totFifo.uncosted} worth ${money(totFifo.uncostedValue)} report none and are in no part of it` : ""}${totFifo.atCost ? ` · ${atCostNote(totFifo, money)}` : ""}` }}>{fmtPct(totalRet, { sign: true })}</Auditable>}
                              <span className="mt-0.5 ml-auto block max-w-[12rem] whitespace-normal text-right text-[10px] font-normal leading-tight text-slate-500"
                                data-footer-return-set={`${footStruckLines}/${footCover.lines}`}>{returnSetLine}</span></>}
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
              )}
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
                the `Via funds` column header, which is what it is about, and in
                the hover on every fund line's own derived figure.
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
          {/*
            THE FOLD THAT STOOD HERE ON THE SECURITY AXIS IS GONE TOO —
            *"no one is reading these kind of notes that you have put in across
            tables."* It was a one-line summary opening onto a paragraph, and
            every figure in it was already on the table's own footer:

              · the share of the book this table covers — the Weight footer,
                on the face of the table;
              · the five-bucket partition, the AIF block and the split-name
                warning — the Total exposure footer's hover, word for word;
              · the look-through still loading or not answering — the Via
                funds cells and footer, each an AbsentCell naming the cause;
              · the derived fence — both derived columns' headers.

            `check:pages` asserts the fold is gone AND that each of those is
            still where this lists it, because neither implies the other.
          */}
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
          {/* THE BY-ENTITY OVERLAP PARAGRAPH IS GONE — *"no one is reading these
              kind of notes"*. What it said is on the figures it was about: each
              section heading names the value "reported twice, counted once"
              beside its own subtotal, and the footer's label hover gives the
              whole-table arithmetic (the rows as printed against the total that
              counts each holding once). */}
        </Card>
      ) : (
        <TransactionsView selected={selected} sector={sector} entity={entity} sectorByKey={sectorByKey}
          axis={txnAxis} section={bucket} returnMeasures={returnMeasures} />
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
/** A fund's unit class out of a security name — `A1` — or null where it prints none. */
/**
 * THE ◦ MARKER'S SENTENCE FOR A STATEMENT MARK (VD-17). The mark is struck on
 * its statement's PRICING day (`valueDateOf`), and where that is not the day
 * the statement draws its balances, both are named: ICICI's NSDL statement
 * counts shares at 31 Mar 2026 and prices them at the 30 Mar close. Dated by
 * the pricing day alone it would read "its statement as of 30 Mar" about a
 * statement of 31 Mar; dated by the balance day, a price a day older than said.
 */
function statementMarkNote(lead: string, valuedAt: string, ps: readonly Position[], accIdx: AccountIndex): string {
  const drawn = [...new Set(ps
    .filter((x) => !x.live && !x.navPriced && x.priceAsOf && x.priceAsOf !== accIdx.get(x.accountId)?.asOf)
    .map((x) => accIdx.get(x.accountId)?.asOf)
    .filter((d): d is string => !!d))];
  return drawn.length === 1
    ? `${lead} as of ${fmtDate(drawn[0])}, priced as of ${fmtDate(valuedAt)}.`
    : `${lead} as of ${fmtDate(valuedAt)}.`;
}

/**
 * THE PRICE CELL OF A HOLDING MARKED AT A TOTAL VALUE (VD-17). An NSDL
 * statement prints a value and no rate, so the row has no per-unit mark and no
 * ◦ marker to carry its date. The absence says when that value was struck, and
 * names both days where the statement prices on another day than its balances.
 */
function totalValueNote(valuedAt: string | null, ps: readonly Position[], accIdx: AccountIndex): string {
  // A REVIEW LINE IS NOT A STATEMENT MARK (Stage 10dh). No statement values
  // it — the family's consolidated review does, at cost or as a total — and
  // "its statement values it" would send a reader to a document that does not.
  if (ps.length && ps.every(isValuedAtCost)) return AT_COST_MARK;
  if (ps.length && ps.every((x) => x.review)) return valuedAt ? `${REVIEW_NO_MARK}. The review values it as of ${fmtDate(valuedAt)}.` : REVIEW_NO_MARK;
  const base = "marked at a total value, not a per-unit price";
  return valuedAt ? `${base}. ${statementMarkNote("Its statement values it", valuedAt, ps, accIdx)}` : base;
}

function classOfName(security: string | null | undefined): string | null {
  return security ? (splitFundClass(security)?.cls ?? null) : null;
}

/** The hover on a switched tranche: what it was bought as, and what it is shown as. */
function switchedRowNote(t: TrancheRow, heldClass: string | null, money: (v: number) => string): string {
  const cf = t.move.carriedFrom!;
  const bought = boughtNavOf(t);
  const was = classOfName(cf.security) ?? "an earlier class";
  const now = heldClass ?? "this class";
  return `Bought on ${fmtDate(t.date)} as ${fmtNum(cf.units)} Class ${was} units`
    + `${bought !== null ? ` at ${money(bought)} each — the allotment NAV the statement prints` : ""}. `
    + `The fund moved them into Class ${now} on ${fmtDate(cf.switchedOn)}; shown here as ${fmtNum(t.units)} ${now} units `
    + `at ${money(t.navAtEntry)} each, so every row of this table is priced in the class held today. What was paid, and when, is unchanged.`;
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

function venuesOf(ps: Position[], accIdx: AccountIndex, valueDate: (p: Position) => string | null): Venue[] {
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
    // Cost, its units and its gain over ONE set — the same helper the row above
    // uses, so a line and the row it opens from agree in every column (A-02).
    const cf = costedFigures(xs);
    const costBasis = cf.cost;
    const costNA = costBasis === null || (costBasis === 0 && marketValue > 0) || xs.some((x) => x.costUnavailable);
    const pnl = costNA ? null : cf.unrealised;
    // Null where the review records the line with no unit count (Stage 10dh).
    const quantity = totalQuantity(xs);
    const mark = commonMark(xs, markKey);
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
      quantity,
      marketValue, costBasis, unrealizedPnL: pnl,
      // FIFO: the holding's realised gain on units already sold stays in it.
      returnPct: costNA ? null : fifoTotals(xs).returnPct,
      costNA, share: 0,
      valuedAtCost: xs.every((x) => x.valuedAtCost === true),
      positions: xs,
      // DERIVED as cost ÷ units, exactly as the consolidated row above derives
      // its own — so a line and the row it opens from are on one basis in the
      // one column they share.
      avgCost: !costNA ? cf.avgCost : null,
      // One security per line, so one mark — the line's OWN, which on a clubbed
      // fund is the class's NAV the row above has to leave absent. Where two
      // statements of ONE account disagree, it has none either (A-03).
      currentPrice: mark.price,
      splitMarks: mark.price === null && mark.values.length > 1 ? mark.values : [],
      costCover: cf,
      navPriced: !!xs[0].navPriced, navDate: xs[0].navDate,
      depositoryAsOf: xs.find((x) => x.depositoryUnits)?.depositoryUnits?.asOf ?? null,
      depositoryWhy: xs.length === 1 && xs[0].depositoryUnits
        ? describeDepositoryUnits(xs[0].depositoryUnits, accIdx)
        : xs.some((x) => x.depositoryUnits) ? depositoryUnitsGist(xs) : null,
      live: xs.every((x) => x.live),
      dayChangePct: xs[0].dayChangePct ?? null,
      heldSince: xs.every((x) => x.heldSince)
        ? xs.reduce((a: string, x) => (x.heldSince! < a ? x.heldSince! : a), xs[0].heldSince!)
        : null,
      valuedAt: commonValueDate(xs.map(valueDate)),
      assetClass: xs[0].assetClass,
      investedOn: investedOnOf(xs),
    };
  }).sort((a, b) => b.marketValue - a.marketValue);
  const raw = sum(built.map((v) => v.marketValue));
  for (const v of built) v.share = raw > 0 ? v.marketValue / raw : 0;
  return built;
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
          {/* THE HEADING NAMES THE CAUSE ("Not classified by the statement");
              the sentence behind it is its hover (Stage 10cp). */}
          {sectionKey === TXN_UNSECTIONED
            ? <span title={TXN_UNSECTIONED_WHY} data-txn-unsectioned-why>{sectionKey}</span>
            : groupLabelFor(axis)(sectionKey)}
          <span className="font-normal normal-case tracking-normal text-slate-500">
            · {count}{values.map((v) => ` · ${money(v.value)} ${v.noun}`).join("")}
          </span>
          {sectionKey === UNCLASSIFIED && (
            <span className="font-normal normal-case tracking-normal text-amber-400/80" title={UNCLASSIFIED_WHY}>
              · no {axis === "basket" ? "basket" : "asset class"} stated
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
const DATED_COLS = ["name", "how", "committed", "in", "out", "realisedGain", "unrealisedGain", "value", "return",
  "investedOn", "trades", "bought", "sold", "realised", "traded", "entity"] as const;

/**
 * ── WHAT THE FAMILY PUT IN, WHAT CAME BACK, AND WHAT IT EARNED ──────────────
 *
 *   *"how can net invested be negative? … The client wants to see clearly what
 *    is the purchase amount, what is the redemption amount and there would be
 *    some amount for appreciation. And then appreciation would have 2 sorts of
 *    gain, realised and unrealised gains … Committed amount and the purchase
 *    amount … Net invested amount is a wrong figure. We do not need to show
 *    that."*
 *
 * NET INVESTED WAS PURCHASES LESS REDEMPTIONS, AND A REDEMPTION IS PRINCIPAL
 * PLUS APPRECIATION. 3P was bought for ₹28.5 Cr and redeemed for ₹31.06 Cr, so
 * it read −₹2.56 Cr: the gain, subtracted from the principal. Every return was
 * then struck on that figure, so any account that had paid something back was
 * overstated and 3P's could not be struck at all. The column is gone rather than
 * relabelled, because there is no honest single figure for "what is still
 * invested" once money has come back at a profit.
 *
 * What replaces it are the three terms of one identity, each in its own column
 * and never added to another's:
 *
 *     Purchase − Redemption + Realised + Unrealised = Value today
 *
 * `capitalRollup` is where each is struck and where each withholds itself with
 * a reason, and `capitalReturn` is where the return is — on the measure the
 * reader picked, never on a denominator with appreciation inside it.
 *
 * The drawdown funds' own dated calls are PURCHASES here too
 * (`capitalMovesWithCalls`), which is what gives Committed a row to sit on: nine
 * funds that reached no transaction table before carry what was promised, what
 * was called and on which dates.
 */
const CAPITAL_RECORD = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_ACCOUNTS, BOOK_REVIEW_FLOWS);

/**
 * WHAT EACH RETURN COLUMN MEASURES ON THIS TABLE — its own words (MT-6 / B-11).
 *
 * The header hover read `returnMeasureDef(m).hint`, which is the HOLDINGS tab's
 * definition — "FIFO return on deployed capital" — over a column struck on
 * something else: here a return is on the family's own money PAID IN, against
 * what came back and what the account is worth. On a whole PMS mandate the two
 * tabs land on one figure; on a fund whose cost is net of stamp duty, or carries
 * a reinvested distribution, they can differ, so each hover says which it is.
 */
const TXN_MEASURE_HINT: Record<ReturnMeasure, string> = {
  auto: "A return on the capital the family paid in — what came back plus what the account is worth, against what was paid — never on a figure with appreciation inside its denominator. The family's rule picks the measure: under a year, the holding-period return; a year or more, CAGR for one purchase and XIRR where the money went in over several dates. Every cell says which. The Holdings tab strikes a single holding on its FIFO cost instead; the two agree on a whole PMS mandate.",
  absolute: "Holding Period Return on the capital paid in: appreciation — value today plus what came back, less what was paid — divided by what was paid. Not annualised. The Holdings tab's HPR is FIFO on a holding's cost; the two agree on a whole PMS mandate and can differ where a fund's cost is net of stamp duty or carries a reinvested distribution.",
  cagr: "The capital paid in, compounded: ONE purchase annualised over the years since it was made, against what came back and what the account is worth. An account funded over several dates has no single start to compound from — its rate is the XIRR.",
  xirr: "A money-weighted rate on the capital paid in, solved over each dated purchase and redemption and the account's value on its own statement date.",
  ytd: "The return on the capital paid in since 1 January — measurable only where the first purchase is inside the current year, so there was nothing to value then.",
  calendar: "A past calendar year's return on the capital paid in — it needs the account's value at the start and end of that year, and no statement here values an account at a past year-end.",
};

/** The column note and hover for one return measure on this table — counted, never claimed. */
function txnReturnColumnMeta(measure: ReturnMeasure, cov: ReturnType<typeof capitalReturnCoverage>): { note: string; title: string } | null {
  if (measure === "auto") return null;
  const tail = cov.absent > 0
    ? ` The other ${cov.absent} ${cov.absent === 1 ? "row carries" : "rows carry"} no return: each dash names why — a record that does not reach inception, a fund that is valued by no statement or prints no distribution line, or a row that is a manager's dealing rather than the family's own money.`
    : "";
  switch (measure) {
    case "xirr":
      return { note: `${cov.annual} money-weighted of ${cov.total}`,
        title: `XIRR is solved over each account's own dated purchases and redemptions and its value today — ${cov.annual} of ${cov.total} rows.`
          + (cov.hpr > 0 ? ` ${cov.hpr} ${cov.hpr === 1 ? "has" : "have"} held the money under a year and show the holding-period return instead, marked HPR, because an annual rate over part of a year is a rate for a year the money has not seen.` : "") + tail };
    case "cagr":
      return { note: `${cov.annual} annualised of ${cov.total}`,
        title: `CAGR compounds ONE purchase over the years since it was made — ${cov.annual} of ${cov.total} rows. An account funded over several dates has no single start to compound from; its rate is the XIRR.`
          + (cov.hpr > 0 ? ` ${cov.hpr} ${cov.hpr === 1 ? "was" : "were"} bought under a year ago and show the holding-period return, marked HPR.` : "") + tail };
    case "ytd":
      return { note: `${cov.shown} of ${cov.total}`,
        title: "YTD needs the account's value on 1 January. It is measurable only where the first purchase is inside the current year, so there was nothing to value then." + tail };
    case "calendar":
      return { note: `${cov.shown} of ${cov.total}`,
        title: "A calendar-year return needs the account's value at the start and end of that year, and no statement here values an account at a past year-end." + tail };
    default:
      return { note: `${cov.shown} of ${cov.total}`,
        title: `Holding Period Return is appreciation divided by the purchase amount — what was made on what was paid, not annualised. Shown on ${cov.shown} of ${cov.total} rows.` + tail };
  }
}

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
 * …AND A ROW THAT IS THE FAMILY'S OWN BROKING IS NOT A MANAGER'S DEALING (MT-15).
 *
 * Every security row on this book is Bharat's own LKP broking account (engagement
 * Execution): no manager chose those trades, and what the family paid for each
 * security IS the Bought column beside the dash. Told "the managed mandates issue
 * a capital-account ledger", a reader learns something false about who dealt and
 * where the money went. So an own-account row says so, and every other row keeps
 * the account-level wording.
 */
const OWN_TRADE_CAPITAL_WHY =
  "this row is a security bought and sold in the family's own broking account — the Capital columns are an account's "
  + "own dated purchases and redemptions, and a broking account issues none; what was paid for this security is its Bought column";

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
  /**
   * A SIDE LINE'S OTHER SIDE IS ON ITS SIBLING LINE, NEVER "NOT TRADED" (MT-13).
   * Inside a security row the lines split by side, so Ather Energy opened into a
   * sell line saying "no buy row reports a settled amount" and a buy line saying
   * "not sold over the window" — each denying the other, under a row reading
   * 1B/1S. Each line now says which side it holds and where the other is.
   */
  const hasSide = (ins: InstrumentRow, side: "Buy" | "Sell") =>
    group.instruments.some((x) => x !== ins && x.securityKey === ins.securityKey && x.side === side);
  const boughtWhy = (ins: InstrumentRow) =>
    ins.side === "Sell" && hasSide(ins, "Buy")
      ? "this line holds the sales of this security — its purchases are on the line marked buys"
      : "nothing of this security was bought over the window";
  const soldWhy = (ins: InstrumentRow) =>
    ins.side === "Buy" && hasSide(ins, "Sell")
      ? "this line holds the purchases of this security — its sales are on the line marked sells"
      : "this security was not sold over the window";
  /**
   * WHICH SIDE WAS WORKED OVER TIME, from the counts (MT-14). "Built up over 16
   * trading days" was printed on Gujarat Ambuja — sixteen SELLS and no buy.
   */
  const staggeredTitle = (ins: InstrumentRow) => {
    const b = ins.buys >= STAGGERED_MIN, sl = ins.sells >= STAGGERED_MIN;
    return b && sl ? `Bought over ${ins.buyDays} trading days and sold over ${ins.sellDays} rather than in one go — expand for every tranche and its date.`
      : b ? `Built up over ${ins.buyDays} trading days rather than in one go — expand for every tranche and its date.`
      : `Sold down over ${ins.sellDays} trading days rather than in one go — expand for every tranche and its date.`;
  };
  const staggeredSide = (ins: InstrumentRow) =>
    ins.buys >= STAGGERED_MIN && ins.sells >= STAGGERED_MIN ? "both" : ins.buys >= STAGGERED_MIN ? "buy" : "sell";
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
                  data-staggered-side={ins.staggered ? staggeredSide(ins) : undefined}
                  data-side-line={ins.side ?? undefined} data-instrument-key={ins.securityKey}
                  data-buys={ins.buys} data-sells={ins.sells}
                  data-days={ins.days} className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(iKey)}>
                  <td className="py-1.5 pl-3 pr-3">
                    <div className="flex items-center gap-1.5">
                      <ChevronRight className={`h-3 w-3 shrink-0 text-slate-600 transition-transform ${iOpen ? "rotate-90" : ""}`} />
                      <div>
                        <span className="text-slate-200">{ins.security}</span>
                        {ins.side && <span className="ml-1.5 text-[10.5px] text-slate-500" data-side-label>· {ins.side === "Buy" ? "buys" : "sells"}</span>}
                        {/* A LABEL ON A ROW THAT IS ALREADY COLLAPSED, never a
                            decision about what to merge — see txnRollup.ts. */}
                        {ins.staggered && <span className="ml-1.5"><Pill tone="info"><span data-staggered-title title={staggeredTitle(ins)}>staggered · {ins.days} days</span></Pill></span>}
                        {/* NET UNITS BELONG UNDER THE NAME, not under a heading
                            that describes something else — and a line holding
                            ONE side says what it holds, rather than a "net" that
                            is only half of the security. */}
                        <div className="mono text-[10.5px] text-slate-500" data-units-line>
                          {ins.side === "Buy" ? `${fmtNum(Math.round(ins.qtyBought))} units bought`
                            : ins.side === "Sell" ? `${fmtNum(Math.round(ins.qtySold))} units sold`
                            : `${fmtNum(Math.round(ins.qtyBought - ins.qtySold))} units net`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right mono text-slate-400">{fmtNum(ins.buys + ins.sells)}<span className="ml-1 text-[10.5px] text-slate-500">{ins.buys}B/{ins.sells}S</span></td>
                  <td className="px-3 py-1.5 text-right mono text-slate-400" data-dealt-cell="bought">{ins.buys === 0 ? <AbsentCell reason={boughtWhy(ins)} /> : ins.bought == null ? <AbsentCell reason="no buy row for this security reports a settled amount" /> : money(ins.bought)}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-400" data-dealt-cell="sold">{ins.sells === 0 ? <AbsentCell reason={soldWhy(ins)} /> : ins.sold == null ? <AbsentCell reason="no sell row for this security reports a settled amount" /> : money(ins.sold)}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-300">{iNet == null ? <AbsentCell reason="one side reports no settled amount, so a net cannot be struck" /> : fmtFromBase(iNet, { compact: true, sign: true })}</td>
                  <td className={`px-3 py-1.5 text-right mono ${ins.realized == null ? "text-slate-600" : changeColor(ins.realized)}`} data-dealt-cell="realised">
                    {/* THE REASON IS EACH SALE'S OWN (MT-12) — read off its
                        `realizedBasis`, never one sentence assumed for all:
                        LKP issues a capital gain statement, and its Ather and
                        Pricol sales fall after the window it covers. */}
                    {ins.realized == null
                      ? <AbsentCell reason={ins.sells === 0
                        ? (ins.side === "Buy" && hasSide(ins, "Sell") ? "this line holds the purchases, which realise nothing — the sales are on the line marked sells" : soldWhy(ins))
                        : realisedAbsence(ins.tranches)} />
                      : <>{fmtFromBase(ins.realized, { compact: true, sign: true })}{ins.realizedOf < ins.sells && <span className="ml-1 text-[10.5px] text-slate-500" data-realised-of={`${ins.realizedOf}/${ins.sells}`} title={realisedCoverageNote(ins.tranches)}>{ins.realizedOf}/{ins.sells}</span>}</>}
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
                  <Tr view={dv} data-row="tranche" key={`${iKey}::${i}`} className="bg-ink-900/50"
                    data-tranche-date={t.date} data-tranche-acct={acctKey(t.provider, t.accountNo)}>
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
                    {/* A PURCHASE REALISES NOTHING, so a buy's cell is blank like
                        the other side's money cell on the same row — never a
                        dash saying "what this sale realised" on a purchase. */}
                    <td className={`px-3 py-1 text-right mono ${t.realized == null ? "text-slate-600" : changeColor(t.realized)}`} data-tranche-realised={t.side}>{t.side !== "Sell" ? "" : t.realized == null ? <AbsentCell reason={t.realizedNote ?? "no capital gain lot in the statements matches this sale"} /> : fmtFromBase(t.realized, { compact: true, sign: true })}</td>
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
function TransactionsView({ selected, sector, entity, sectorByKey, axis, section, returnMeasures }: {
  selected: Set<string>; sector: string; entity: string; sectorByKey: Map<string, string>;
  axis: GroupAxis; section: string; returnMeasures: ReturnMeasure[];
}) {
  // `statementPortfolio`, for the ACCOUNT REGISTRY and the section join only —
  // the rollup joins a trade to its mandate on provider + account number. No
  // figure on this tape comes from the portfolio, and none may: a dated trade is
  // a statement fact and a live price is not evidence about it.
  const { fmtFromBase, statementPortfolio: portfolio } = usePortfolio();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [txns, setTxns] = useState<Txn[] | null>(null);
  /**
   * THE WINDOW THE TRANSACTION STATEMENTS COVER — not the holding period. A date
   * filter lying wholly outside it has no statement to count trades in, so its
   * footer states that rather than a "0 (0B/0S)" nothing measured (MT-16).
   */
  const [tapePeriod, setTapePeriod] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  /**
   * THE CAPITAL-GAIN LOTS NO TRADE ON THE TAPE SETTLES (A-08) — five ASK lots
   * that sold for ₹0, the fractions a demerger or a bonus left. They are in the
   * statements' own realised total and in no row of this table, so the realised
   * footer, which is the sum of its rows, falls short of the statements' by
   * exactly their realised. The footer's hover names them; the figure stays the
   * rows' own, because a total must tie to its own column.
   */
  const [lotsNoTrade, setLotsNoTrade] = useState<TxnData["lotsNoTrade"] | null>(null);
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
  const [openClub, setOpenClub] = useState<Set<string>>(new Set());
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
      setTxns(d.txns); setTapePeriod({ from: d.periodFrom, to: d.periodTo }); setLotsNoTrade(d.lotsNoTrade); setStatus("ready");
    });
    return () => { alive = false; };
  }, []);

  // Fiscal years spanned by BOTH records, newest first — drives the quarter/FY
  // presets. Both, because a range offered over the tape alone would silently
  // cut the capital record's older contributions out of every preset.
  const fyYears = useMemo(() => {
    const dates = [...(txns ?? []).map((t) => t.date), ...CAPITAL_RECORD.map((m) => m.date)].filter(Boolean);
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
    for (const p of positionsReg) {
      by.set(p.accountId, (by.get(p.accountId) ?? 0) + p.marketValue);
      // A review holder bucket's line is a row of its own (Stage 10dh).
      const line = `${p.accountId}|${p.securityKey}`;
      by.set(line, (by.get(line) ?? 0) + p.marketValue);
    }
    // AN ACCOUNT WITH NO POSITION IS UNVALUED, NOT WORTH ₹0. India SME's and Sky
    // Capital's folios reach this table through their dated calls and publish no
    // NAV, and `?? 0` would print a ₹0 value beside ₹8.1 Cr of purchases — the
    // measured-zero rule failing in the direction that invents a loss. A fund
    // redeemed to nil still HAS its positions, at zero, and keeps its measured ₹0.
    return (id: string, securityKey?: string | null): number | null => {
      const k = securityKey ? `${id}|${securityKey}` : id;
      return by.has(k) ? by.get(k)! : null;
    };
  }, [positionsReg]);

  /**
   * THE FAMILY'S OWN MOVEMENTS IN VIEW — filtered ONCE, here. The side is NOT
   * applied to this count: the counter above the table states both sides, so a
   * reader can see what the filter would do before they click it.
   */
  const mineMoves = useMemo(() => CAPITAL_RECORD.filter((m) => {
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
  /**
   * A DATE FILTER NARROWS THE MOVEMENTS AND WITHHOLDS EVERY FIGURE STRUCK OVER
   * THE WHOLE RECORD. This passed the filtered movements straight in and went
   * on striking a gain and a return over them — so a reader who picked FY2026
   * got an account's full value today measured against only that year's
   * purchases, a gain that included every earlier year's money as profit. The
   * side filter was already treated this way; the date filter is the same
   * narrowing and is now treated the same way.
   */
  const mineAll = useMemo(
    () => capitalRollup(mineMoves, accountsReg, positionsReg, BOOK_POSITION_TRANCHES, side, sort, {
      commitments: BOOK_COMMITMENTS,
      windowed: !!(from || to),
      fromInception: BOOK_CAPITAL_FROM_INCEPTION,
    }),
    [mineMoves, accountsReg, positionsReg, side, sort, from, to]);
  /**
   * THE SECTION FILTER NARROWS THE ROWS, not the sectioning: a reader who picks
   * "AIF" is asking this table for its AIF rows, exactly as they would be asking
   * the Holdings table.
   */
  const mineGroups = useMemo(
    () => (section === "All" ? mineAll : mineAll.filter((g) => sections.forAccount(axis, g.accountId, g.securityKey) === section)),
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
    () => mergeDatedRecords(mineGroups, tradeGroups, (id, sk) => sections.forAccount(axis, id, sk), valueOfAccount, sort),
    [mineGroups, tradeGroups, sections, axis, valueOfAccount, sort]);
  const secs = useMemo(
    () => datedSectionRollup(rows, (keys) => orderSections(axis, keys)), [rows, axis]);
  const totals = useMemo(() => datedTotals(rows), [rows]);
  /**
   * THE COLUMN LIST, WITH ONE RETURN COLUMN PER PICKED MEASURE — the Holdings
   * table's `withReturnCols`, so ticking a measure adds a column a reader can
   * sort and drag, and unticking it takes that column away and leaves the rest
   * where they were dragged to.
   */
  const datedCols = useMemo(() => withReturnCols(DATED_COLS, returnMeasures), [returnMeasures]);
  /**
   * ── WHAT DATE A VALUE IS STRUCK AT (MT-9) ──────────────────────────────────
   *
   * Each account is valued at its OWN statement's date — Transition Venture at
   * 31 March, Sanshi at 30 June, V.E.C at 13 August — so the column headed
   * "today" is a blend and its total adds values struck on different days. The
   * date rides on every cell and the spread on the header and the footer.
   */
  const asOfOf = useCallback((r: DatedRow): string | null =>
    r.kind !== "account" ? null : (r.capital?.valueAsOf ?? accIdx.get(r.accountId ?? "")?.asOf ?? null), [accIdx]);
  const asOfSpan = useMemo(() => {
    const ds = rows.filter((r) => r.value != null).map(asOfOf).filter((d): d is string => !!d).sort();
    return ds.length ? { from: ds[0], to: ds[ds.length - 1], dates: new Set(ds).size } : null;
  }, [rows, asOfOf]);
  /**
   * ── A HOLDING TWO ACCOUNTS HERE BOTH REPORT IS IN A PER-ACCOUNT SUM TWICE (MT-7)
   *
   * Transition Venture's two family trusts each report the same 7,500 units of
   * Fund I, and the book tags the pair one `dedupeGroup`. Capital is never
   * deduped — both trusts' calls are real money — but the VALUE footer sums the
   * accounts, so the holding is in it twice where the Holdings table counts it
   * once. Whether the trusts hold one investment or two is the family's to say;
   * this table keeps its figures and NAMES the doubling on the totals it is in.
   */
  const doubled = useMemo(() => {
    const ids = new Set(rows.filter((r) => r.kind === "account" && r.value != null && r.accountId).map((r) => r.accountId as string));
    const inView = positionsReg.filter((p) => ids.has(p.accountId));
    const byGroup = new Map<string, Position[]>();
    for (const p of inView) if (p.dedupeGroup) (byGroup.get(p.dedupeGroup) ?? byGroup.set(p.dedupeGroup, []).get(p.dedupeGroup)!).push(p);
    const groups = [...byGroup.values()].filter((ps) => new Set(ps.map((p) => p.accountId)).size > 1);
    const excess = sum(inView.map((p) => p.marketValue)) - sum(dedupedPositions(inView).map((p) => p.marketValue));
    const unrealisedToo = groups.filter((ps) => ps.every((p) => rows.find((r) => r.accountId === p.accountId)?.capital?.unrealised != null));
    return { groups, excess, unrealisedToo };
  }, [rows, positionsReg]);
  const accByPA = useMemo(() => new Map(accountsReg.map((a) => [acctKey(a.provider, a.accountNo), a])), [accountsReg]);
  /** Accounts the WHOLE record funds — the book fact a narrowed count must not be read as. */
  const fundedInBook = useMemo(() => new Set(CAPITAL_RECORD.map((m) => m.accountId)).size, []);
  /**
   * An account whose positions are all fund units redeemed to nil, at a NAV the
   * fund still publishes — the one case "₹0, measured" is true of on its own terms.
   */
  const redeemedToNil = useMemo(() => {
    const by = new Map<string, Position[]>();
    for (const p of positionsReg) (by.get(p.accountId) ?? by.set(p.accountId, []).get(p.accountId)!).push(p);
    return new Set([...by].filter(([, ps]) => ps.length > 0 && ps.every((p) => isFundVehicle(p) && p.quantity === 0 && p.currentPrice != null)).map(([id]) => id));
  }, [positionsReg]);

  /** What each return column covers, over EVERY row drawn — a manager's dealing carries no return on the family's money. */
  const retCov = (measure: ReturnMeasure) => {
    const caps = rows.map((r) => r.capital).filter((c): c is CapitalGroup => !!c);
    const c = capitalReturnCoverage(caps, measure);
    return { ...c, total: rows.length, absent: c.absent + (rows.length - caps.length) };
  };

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
   * ── WHAT THE FILTERS IN FORCE DO TO A COUNT OR A ZERO (MT-16) ────────────────
   *
   * A date window narrows the movements, and the page used to word every absence
   * it caused as if the SIDE filter had: "the movements are filtered to what came
   * back out" under a fiscal-year window with the side on All. `windowed` is the
   * date filter; `outsideTape` is a window lying wholly outside the period the
   * transaction statements cover, where "0 trades" is a count nobody took.
   */
  const windowed = !!(from || to);
  const outsideTape = windowed && !!tapePeriod.from && !!tapePeriod.to
    && ((!!to && to < tapePeriod.from) || (!!from && from > tapePeriod.to));
  const tapeWhy = tapePeriod.from && tapePeriod.to
    ? `no transaction statement covers this date window — the statements this table reads run ${fmtDate(tapePeriod.from)} → ${fmtDate(tapePeriod.to)}`
    : "no transaction statement covers this date window";
  const capitalNarrowed = windowed || side !== "all" || entity !== "All" || section !== "All";
  /** Why a row carries no capital record — an own-account security is not a mandate (MT-15). */
  const noCapitalWhy = (r: DatedRow): string => {
    if (r.kind === "account" || !r.trades) return NO_CAPITAL_WHY;
    const tr = r.trades.instruments.flatMap((i) => i.tranches);
    const own = tr.length > 0 && tr.every((t) => holdingRoute(accByPA.get(acctKey(t.provider, t.accountNo))?.engagement ?? null) === "own");
    return own ? OWN_TRADE_CAPITAL_WHY : NO_CAPITAL_WHY;
  };
  /** Why no purchase is in view: the side filter or the date window, never assumed (MT-16). */
  const noPurchaseWhy = side === "out"
    ? "no purchase is in view — the movements are filtered to what came back out, and this account's purchase amount is not struck over that"
    : "no purchase falls inside the date window — this account's purchases are outside it; clear the date filter to see them";
  const sellsOf = (g: GroupRow) => g.instruments.flatMap((i) => i.tranches).filter((t) => t.side === "Sell");
  const allTradeSells = rows.flatMap((r) => (r.trades ? sellsOf(r.trades) : []));
  /**
   * WHERE THE REALISED FOOTER IS THE WHOLE TAPE'S, the lots no trade settles
   * are named on it (A-08) — only there: under a date window, an entity, a
   * section, a sector or a picked holding the footer covers part of the tape,
   * and the statements' whole total would be a figure about something else.
   */
  const wholeTape = !windowed && side !== "in" && entity === "All" && section === "All" && sector === "All" && selected.size === 0;
  const noTrade = wholeTape && lotsNoTrade && lotsNoTrade.lots > 0 && lotsNoTrade.realised != null && totals.realized != null
    ? { ...lotsNoTrade, realised: lotsNoTrade.realised, statements: totals.realized + lotsNoTrade.realised }
    : null;
  const noTradeNote = noTrade
    ? `The capital-gain statements' own realised total is ${fmtFromBase(noTrade.statements, { sign: true })}: this column's ${fmtFromBase(totals.realized, { sign: true })}, plus ${noTrade.lots} lot${noTrade.lots === 1 ? "" : "s"} no trade on this tape settles — ${noTrade.securities.join(", ")} — ${fmtFromBase(noTrade.realised, { sign: true })}. `
      + (noTrade.allNil
        ? `Each prints a sale of ₹0, so there is no sale row for it to meet: it is in the statements' total and in no row here.`
        : `No sale row on the tape meets them, so they are in the statements' total and in no row here.`)
    : undefined;
  const doubledNames = doubled.groups.map((ps) =>
    `${ps[0].security} — reported by ${ps.map((p) => { const a = accIdx.get(p.accountId); return a ? `${a.owner} (${a.accountNo}, ${money(p.marketValue)})` : p.accountId; }).join(" and ")}`);
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

  /**
   * ONE HOLDING, ONE LINE (`clubDatedRows`). A section's rows are drawn as
   * UNITS: an ordinary row as it always was, and a holding two or more accounts
   * carry as ONE line whose figures are the accounts' own totals — each summed
   * the way the footer sums it, so a figure some accounts withhold says how
   * many it covers — opening into those accounts, each the row it always was.
   * The footer is unchanged: it sums the rows themselves, never the clubs.
   */
  const renderUnits = (
    sec: DatedSectionRows, dv: TableView, cols: number,
    acc: Record<string, (r: DatedRow) => string | number | null | undefined>,
    renderRow: (r: DatedRow, clubOf?: string) => ReactNode,
  ): ReactNode[] => {
    const units = clubDatedRows(sec.rows, sort, splitFundClass);
    const caps = (u: Extract<DatedUnit, { kind: "club" }>) => u.members.map((m) => m.capital);
    const clubRet = (u: Extract<DatedUnit, { kind: "club" }>, m: ReturnMeasure) => {
      const cs = caps(u);
      return cs.every(Boolean) ? clubCapitalReturn(cs as CapitalGroup[], m) : null;
    };
    const spanOf = (vals: (string | null | undefined)[]) => {
      const v = vals.filter((x): x is string => !!x).sort();
      return v.length ? [v[0], v[v.length - 1]] as const : null;
    };
    const clubAcc: Record<string, (u: Extract<DatedUnit, { kind: "club" }>) => string | number | null | undefined> = {
      name: (u) => u.label,
      how: (u) => u.totals.contributions || null,
      committed: (u) => u.totals.committed,
      in: (u) => (u.totals.contributions > 0 ? u.totals.paidIn : null),
      out: (u) => u.totals.redemption,
      realisedGain: (u) => u.totals.realisedGain,
      unrealisedGain: (u) => u.totals.unrealisedGain,
      investedOn: (u) => spanOf(u.members.map((m) => m.capital?.boughtFirst))?.[0] ?? null,
      trades: (u) => (u.members.some((m) => m.trades) ? u.totals.trades : null),
      bought: (u) => (u.totals.buys > 0 ? u.totals.bought : null),
      sold: (u) => (u.totals.sells > 0 ? u.totals.sold : null),
      realised: (u) => u.totals.realized,
      traded: (u) => spanOf(u.members.map((m) => m.trades?.first))?.[0] ?? null,
      value: (u) => u.totals.value,
      ...Object.fromEntries(returnMeasures.map((m) => [`ret:${m}`, (u: Extract<DatedUnit, { kind: "club" }>) => {
        const res = clubRet(u, m);
        return res?.shown ? res.pct : null;
      }])),
      entity: (u) => [...new Set(u.members.flatMap(entitiesOf))].sort()[0] ?? null,
    };
    const unitAcc = Object.fromEntries(Object.keys(acc).map((k) => [k, (u: DatedUnit) =>
      u.kind === "row" ? acc[k](u.row) : (clubAcc[k]?.(u) ?? null)]));
    const ordered = sortRows(units, dv.sort, unitAcc);
    const n = (k: number, of: number, what: string) => k < of
      ? <span className="ml-1 text-[10px] text-slate-500" data-club-covers={`${k}/${of}`} title={`${k} of the ${of} accounts on this line ${what}; the rest are not added in as zero.`}>{k}/{of}</span>
      : null;
    return ordered.flatMap((u): ReactNode[] => {
      if (u.kind === "row") return [renderRow(u.row)];
      const t = u.totals;
      const isOpen = openClub.has(u.key);
      const ents = [...new Set(u.members.flatMap(entitiesOf))].sort();
      const providers = [...new Set(u.members.map((m) => (m.accountId ? accIdx.get(m.accountId)?.provider : null)).filter(Boolean))];
      const capOf = u.members.filter((m) => m.capital).length;
      const trdOf = u.members.filter((m) => m.trades).length;
      const inv = spanOf(u.members.map((m) => m.capital?.boughtFirst));
      const invLast = spanOf(u.members.map((m) => m.capital?.boughtLast));
      const trFirst = spanOf(u.members.map((m) => m.trades?.first));
      const trLast = spanOf(u.members.map((m) => m.trades?.last));
      const td = "px-3 py-2.5 text-right mono whitespace-nowrap";
      const noCap = <AbsentCell reason="none of the accounts on this line carries a dated capital record" />;
      const noTrd = <AbsentCell reason={NO_TRADES_WHY} />;
      const head = (
        <Tr key={u.key} view={dv} data-dated-club={u.key} data-dated-club-members={u.members.length}
          data-dated-section={sec.key} data-dated-label={u.label} data-dated-first={u.first} data-dated-last={u.last}
          data-club-paid={t.contributions > 0 ? t.paidIn : undefined} data-club-value={t.value ?? undefined}
          data-club-bought={t.buys > 0 ? t.bought : undefined}
          data-open={isOpen ? "" : undefined} aria-expanded={isOpen}
          className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(setOpenClub, u.key)}>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
              <div>
                <div className="font-medium text-slate-100">{u.label}</div>
                <div className="text-[10.5px] text-slate-500" title={u.members.map((m) => [m.label, m.sublabel].filter(Boolean).join(" · ")).join("\n")}>
                  {u.members.length} accounts{providers.length === 1 ? ` · ${providers[0]}` : ""}
                </div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2.5 whitespace-nowrap">
            {capOf === 0 ? noCap : <span className="pill" data-club-how>{t.contributions === 1 ? "1 payment" : `${t.contributions} payments`}</span>}
          </td>
          <td className={`${td} text-slate-400`}>{t.committed == null ? <AbsentCell reason="no account on this line prints a commitment" /> : <>{money(t.committed)}{n(t.committedOf, capOf, "print a commitment")}</>}</td>
          <td className={`${td} text-slate-200`} data-club-cell="in">{t.contributions > 0 ? money(t.paidIn) : capOf ? <AbsentCell reason="no purchase on these accounts falls in view" /> : noCap}</td>
          <td className={`${td} text-slate-300`} data-club-cell="out">{t.redemption == null ? (capOf ? <AbsentCell reason="no account on this line states what came back" /> : noCap) : <>{money(t.redemption)}{n(t.redemptionOf, capOf, "state what came back")}</>}</td>
          <td className={td} data-club-cell="realisedGain">{t.realisedGain == null ? (capOf ? <AbsentCell reason="no account on this line states a realised gain" /> : noCap) : <><span className={changeColor(t.realisedGain)}>{money(t.realisedGain)}</span>{n(t.realisedGainOf, capOf, "state a realised gain")}</>}</td>
          <td className={td} data-club-cell="unrealisedGain">{t.unrealisedGain == null ? (capOf ? <AbsentCell reason="no account on this line states an unrealised gain" /> : noCap) : <><span className={changeColor(t.unrealisedGain)}>{money(t.unrealisedGain)}</span>{n(t.unrealisedGainOf, capOf, "state an unrealised gain")}</>}</td>
          <td className={`${td} text-slate-100`} data-club-cell="value">{t.value == null ? <AbsentCell reason="no statement values any account on this line" /> : <>{money(t.value)}{n(t.valueOf, u.members.length, "are valued by a statement")}</>}</td>
          {returnMeasures.map((m) => {
            const def = returnMeasureDef(m);
            const res = clubRet(u, m);
            if (!res) return <td key={m} data-return-cell={m} className={td}><AbsentCell reason="a return is struck on the family's own purchases, and not every account on this line carries a dated capital record" /></td>;
            const off = m === "auto" || res.tag !== def.tag;
            return (
              <td key={m} data-return-cell={m} data-return-tag={off ? res.tag : undefined} data-return-pct={res.shown ? res.pct : undefined} className={td}>
                {off && <span className="ret-tag mr-0.5">{res.tag}</span>}
                {res.shown ? <span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true })}</span> : <AbsentCell reason={res.reason} />}
              </td>
            );
          })}
          <td className="px-3 py-2.5 text-[12px] mono text-slate-500 whitespace-nowrap">{inv ? period(inv[0], invLast?.[1] ?? inv[1]) : (capOf ? <AbsentCell reason="no purchase on these accounts is dated" /> : noCap)}</td>
          <td className={`${td} text-slate-300`}>{trdOf === 0 ? noTrd : <>{fmtNum(t.trades)}<span className="ml-1 text-[10px] text-slate-500">{t.buys}B/{t.sells}S</span></>}</td>
          <td className={`${td} text-slate-300`}>{t.buys > 0 && t.bought != null ? money(t.bought) : trdOf ? <AbsentCell reason="nothing was bought on these accounts in view" /> : noTrd}</td>
          <td className={`${td} text-slate-300`}>{t.sells > 0 && t.sold != null ? money(t.sold) : trdOf ? <AbsentCell reason="nothing was sold on these accounts in view" /> : noTrd}</td>
          <td className={td}>{t.realized == null ? (trdOf ? <AbsentCell reason="no capital gain statement covers these accounts' sales" /> : noTrd) : <><span className={changeColor(t.realized)}>{money(t.realized)}</span>{n(t.realizedOf, t.sells, "sales carry a realised figure")}</>}</td>
          <td className="px-3 py-2.5 whitespace-nowrap mono text-[11px] text-slate-400">{trFirst ? period(trFirst[0], trLast?.[1] ?? trFirst[1]) : noTrd}</td>
          <td className="px-3 py-2.5 text-[12px] text-slate-400 whitespace-nowrap">
            {ents.length === 0 ? <AbsentCell reason="no account on this line names a holder this book can resolve to a family member" />
              : ents.length === 1 ? ents[0] : <span title={ents.join(" · ")}>{ents.length} entities</span>}
          </td>
        </Tr>
      );
      if (!isOpen) return [head];
      return [head, ...sortRows(u.members, dv.sort, acc).map((m) => renderRow(m, u.key))];
    });
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
          Purchases {mineCount.in.toLocaleString("en-IN")} · redemptions {mineCount.out.toLocaleString("en-IN")}
          <span className="mx-1.5 text-slate-600">|</span>
          Trades {filtered.filter((t) => t.side === "Buy").length.toLocaleString("en-IN")} buys · {filtered.filter((t) => t.side === "Sell").length.toLocaleString("en-IN")} sells
        </span>
      </div>

      {/* BOTH CLAIMS LOAD-BEARING, AND BOTH IN THE TITLE'S HOVER (Stage 10cp).
          What the ROW IS and that the two money blocks are NEVER ADDED were the
          line under the title; the family asked for those lines to go, so they
          ride on the title, and each block's own headings say which it is.
          AND THE DEALING IS NOT ALWAYS A MANAGER'S: in a broking account the
          family trade themselves, so the hover says whose it is in each kind
          of account rather than calling all of it their managers'. */}
      <Card pad={false}
        title={<span data-card-title-hint data-txn-framing
          title="Committed, Purchase and Redemption: the family's own money into and out of each account. Trades: the dealing inside it — a manager's in a mandate, the family's own in a broking account. The two are never added.">Transactions</span>}
        className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <SortableTable className="min-w-full text-sm" data-dated-table
            storageKey="monitor-dated" columns={datedCols}>
            {(dv) => { const COLS = dv.order.length; return (<>
            <thead className="sticky top-0 z-10 bg-ink-800">
              <Tr view={dv} className="border-b border-ink-700">
                <SortHeader col="name" view={dv} align="left" pad="px-3 py-2.5">{GROUP_COLUMN_HEAD[axis]}</SortHeader>
                {/* ── THE CAPITAL BLOCK: the family's own money ─────────────── */}
                <SortHeader col="how" view={dv} pad="px-3 py-2.5"
                  title="Whether the family's money went in as one payment or several. It is a COUNT of dated purchases, not a judgement about them: one is a lumpsum, more than one is staggered.">How it went in</SortHeader>
                <SortHeader col="committed" view={dv} pad="px-3 py-2.5"
                  title="What the family PROMISED a drawdown fund — the capital commitment its statement prints. The fund calls it in over time, so it is not what has been paid: that is Purchase. An open-ended fund or a mandate takes no commitment and says so.">Committed</SortHeader>
                <SortHeader col="in" view={dv} pad="px-3 py-2.5"
                  title="What the family paid into this account — every subscription, drawdown, top-up or capital call, gross, as its statement prints it. NEVER what a manager spent inside it, which is the Bought column.">Purchase</SortHeader>
                <SortHeader col="out" view={dv} pad="px-3 py-2.5"
                  title="What came back out to the family — a redemption, a payout or a withdrawal, as its statement prints it. It is principal AND appreciation together, which is why it is never subtracted from Purchase: that subtraction is the 'net invested' this table no longer shows.">Redemption</SortHeader>
                {/* ── APPRECIATION, IN ITS TWO PARTS ──────────────────────── */}
                <SortHeader col="realisedGain" view={dv} pad="px-3 py-2.5" note="appreciation"
                  title="The part of the appreciation that has turned into cash — what came back less what the redeemed units cost; on a PMS mandate, the manager's booked gains plus dividends and interest, less fees. Each cell says how it was struck, or why it is withheld.">Realised</SortHeader>
                <SortHeader col="unrealisedGain" view={dv} pad="px-3 py-2.5" note="appreciation"
                  title="The part of the appreciation still on paper — value today less what the units still held cost. Purchase − Redemption + Realised + Unrealised = Value today, on every row that states all four.">Unrealised</SortHeader>
                <SortHeader col="value" view={dv} pad="px-3 py-2.5"
                  title="The account's own market value from the book — the same figure the holdings tables carry for it, not a value re-derived from what was paid in. An account no statement values says so rather than reading ₹0."
                  note={asOfSpan && asOfSpan.dates > 1 ? "as of each statement" : asOfSpan ? `as of ${fmtDate(asOfSpan.from)}` : undefined}
                  noteTitle={asOfSpan
                    ? (asOfSpan.dates > 1
                      ? `Each account is valued at its own statement's date — ${fmtDate(asOfSpan.from)} to ${fmtDate(asOfSpan.to)} across the rows in view — so neither this column nor its total is one day's value. Each cell names its own date.`
                      : `Every account in view is valued at ${fmtDate(asOfSpan.from)}, its statement's date.`)
                    : undefined}>Value today</SortHeader>
                {/* ONE COLUMN PER PICKED RETURN MEASURE — the Holdings table's
                    own mechanism (`withReturnCols`), reading the same `?ret=`.
                    The count goes in the header note and the reason in its
                    hover, from ONE coverage object. */}
                {returnMeasures.map((measure) => {
                  const def = returnMeasureDef(measure);
                  const meta = txnReturnColumnMeta(measure, retCov(measure));
                  return (
                    <SortHeader key={measure} col={`ret:${measure}`} view={dv} pad="px-3 py-2.5"
                      title={TXN_MEASURE_HINT[measure]}
                      note={meta?.note} noteTitle={meta?.title}>
                      {measure === "auto" ? "Return" : def.tag}
                    </SortHeader>
                  );
                })}
                <SortHeader col="investedOn" view={dv} align="left" pad="px-3 py-2.5"
                  title="The date each purchase carries on the statement that reports it — the movement's own date, never the statement's report date. A single date means the account was funded once; a range spans the first payment to the last.">Purchased on</SortHeader>
                {/* ── THE TRADES BLOCK: what a manager dealt inside ─────────── */}
                <SortHeader col="trades" view={dv} pad="px-3 py-2.5"
                  title="Dated buys and sells the transaction statements report inside this row. Never the family's own payments, which are the How-it-went-in column. Demat movements carry no price or counterparty on their statements, so they are not trades and are not here — which is why the family's own-account dealing reads narrower than it is.">Trades</SortHeader>
                <SortHeader col="bought" view={dv} pad="px-3 py-2.5"
                  title="What was spent buying securities inside this row, over the trades that report a settled amount. This is money moving about INSIDE an account and is not added to Purchase.">Bought</SortHeader>
                <SortHeader col="sold" view={dv} pad="px-3 py-2.5"
                  title="What securities sold for inside this row, over the trades that report a settled amount.">Sold</SortHeader>
                <SortHeader col="realised" view={dv} pad="px-3 py-2.5"
                  title="The profit or loss on the SALES in the window — a manager's in a mandate, the family's own in a broking account — as a capital gain statement reports it. A different measurement from the Realised appreciation on the family's own money, and never added to it.">P&amp;L on sales</SortHeader>
                <SortHeader col="traded" view={dv} align="left" pad="px-3 py-2.5"
                  title="First to last dated trade the statements report for this row. The dealing window — not when the family put money in, which is Purchased on.">Traded between</SortHeader>
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
                        ...(sec.totals.contributions > 0 ? [{ value: sec.totals.paidIn, noun: "purchased" }] : []),
                        ...(sec.totals.bought != null ? [{ value: sec.totals.bought, noun: "bought" }] : []),
                      ]} />
                  )}
                  {/* THE READER'S RANKING, WITHIN THE SECTION. Sorting across
                      sections would break the sectioning this card exists to
                      share with the holdings table; a section is a partition of
                      the same list, so ranking inside each one is the same
                      ordering the card's own Recent/Largest control produces. */}
                  {renderUnits(sec, dv, COLS, {
                    name: (r) => r.label,
                    how: (r) => r.capital?.contributions ?? null,
                    committed: (r) => r.capital?.committed ?? null,
                    in: (r) => (r.capital && r.capital.contributions > 0 ? r.capital.paidIn : null),
                    out: (r) => r.capital?.redemption ?? null,
                    realisedGain: (r) => r.capital?.realised ?? null,
                    unrealisedGain: (r) => r.capital?.unrealised ?? null,
                    investedOn: (r) => r.capital?.boughtFirst || null,
                    trades: (r) => r.trades?.trades ?? null,
                    bought: (r) => (r.trades && r.trades.buys > 0 ? r.trades.bought : null),
                    sold: (r) => (r.trades && r.trades.sells > 0 ? r.trades.sold : null),
                    realised: (r) => r.trades?.realized ?? null,
                    traded: (r) => r.trades?.first ?? null,
                    value: (r) => r.value,
                    // A RETURN COLUMN ORDERS ON THE FIGURE IT PRINTS — the same
                    // `capitalReturn` the cell draws — and an absent return
                    // sorts last in both directions, as every null does.
                    ...Object.fromEntries(returnMeasures.map((m) => [`ret:${m}`, (r: DatedRow) => {
                      if (!r.capital) return null;
                      const res = capitalReturn(r.capital, m);
                      return res.shown ? res.pct : null;
                    }])),
                    entity: (r) => entitiesOf(r)[0] ?? null,
                  }, (r: DatedRow, clubOf?: string) => {
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
                          data-dated-account={r.accountId ?? undefined}
                          data-dated-accounts={trd ? [...new Set(trd.instruments.flatMap((i) => i.tranches.map((t) => acctKey(t.provider, t.accountNo))))].join(";") : undefined}
                          data-dated-first={r.first} data-dated-last={r.last}
                          data-dated-club-member={clubOf}
                          // THE FIGURES A CLUB LINE SUMS, as numbers — so the
                          // sweep ties a club's own cells to its accounts' without
                          // parsing a compact "₹1.2 Cr" back into rupees.
                          data-dated-paid={cap && cap.contributions > 0 ? cap.paidIn : undefined}
                          data-dated-value={r.value ?? undefined}
                          data-dated-bought={trd && trd.buys > 0 && trd.bought != null ? trd.bought : undefined}
                          data-mine-row={cap ? r.accountId : undefined}
                          /*
                            ...AND THE ROW'S OWN KEY BESIDE IT (Stage 10dh).

                            `data-mine-row` is the ACCOUNT, which is what every
                            claim about an account's record is struck on. It
                            stopped being one row per account the moment a
                            member's review holder bucket drew one row per LINE
                            (`capitalRollup`'s key, `<accountId>|<securityKey>`),
                            so several rows of this table now share one of them —
                            and a check keyed on the account alone then compares
                            the wrong row, or counts rows against accounts. The
                            GROUP key is what a row is, uniquely, so it rides
                            here and the row-level checks read it.
                          */
                          data-mine-key={cap ? cap.key : undefined}
                          data-mine-security={cap?.securityKey ?? undefined}
                          data-mine-source={cap ? cap.source : undefined}
                          data-mine-windowed={cap?.windowed ? "" : undefined}
                          data-mine-contributions={cap ? cap.contributions : undefined}
                          data-mine-withdrawals={cap ? cap.withdrawals : undefined}
                          data-mine-section={cap ? sec.key : undefined}
                          data-mine-first={cap ? cap.first : undefined}
                          data-mine-last={cap ? cap.last : undefined}
                          data-mine-bought-first={cap ? cap.boughtFirst : undefined}
                          data-mine-bought-last={cap ? cap.boughtLast : undefined}
                          data-row={trd ? "group" : undefined}
                          data-trades={trd ? trd.trades : undefined}
                          data-group-section={trd ? sec.key : undefined}
                          data-group-kind={trd ? (r.kind === "account" ? "mandate" : "security") : undefined}
                          data-group-label={trd ? r.label : undefined}
                          className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(setOpenRow, r.key)}>
                          <td className={clubOf ? "py-2.5 pl-8 pr-3" : "px-3 py-2.5"}>
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
                              ? <AbsentCell reason={noCapitalWhy(r)} />
                              : cap.contributions === 0
                                // "Lumpsum or staggered" is a fact about how the
                                // money went IN. With no purchase in view — a
                                // Sells filter, or a date window holding only what
                                // came back — there is nothing to describe, so the
                                // cell counts what IS in view rather than printing
                                // "lumpsum" over a row showing no purchase (MT-16).
                                ? <span className="pill" data-mine-how="withdrawals"
                                  title={side === "out" ? undefined : "No purchase falls inside the date window — only what came back out does. How the money went in is a fact about the purchases, which are outside the window."}>
                                  {cap.withdrawals === 0 ? "undated payout" : cap.withdrawals === 1 ? "1 withdrawal" : `${cap.withdrawals} withdrawals`}
                                </span>
                                : cap.windowed
                                  // ...and a window holding SOME of the purchases
                                  // cannot say lumpsum or staggered either: one
                                  // payment in view of an account funded four times
                                  // is not a lumpsum. It counts what is in view.
                                  ? <span className="pill" data-mine-how="window"
                                    title="Lumpsum or staggered is a count over the whole record; the date window shows only the purchases inside it, so they are counted rather than named.">
                                    {cap.contributions === 1 ? "1 payment in window" : `${cap.contributions} payments in window`}
                                  </span>
                                  : <span className="pill" data-mine-how={cap.staggered ? "staggered" : "lumpsum"}>
                                    {cap.staggered ? `staggered · ${cap.contributions} payments` : "lumpsum"}
                                  </span>}
                          </td>
                          {/* WHAT WAS PROMISED — a drawdown fund's commitment,
                              and only where its statement prints one. An
                              open-ended fund or a mandate takes none, which is a
                              fact about the vehicle, not a figure to show as ₹0. */}
                          <td className="px-3 py-2.5 text-right mono text-slate-400 whitespace-nowrap" data-mine-cell="committed"
                            title={cap?.committed != null && cap.undrawn != null
                              ? `${money(cap.undrawn)} of this commitment is still to be called, as the fund's statement prints it.`
                              : undefined}>
                            {!cap ? <AbsentCell reason={noCapitalWhy(r)} />
                              : cap.committed == null
                                ? <AbsentCell reason="no commitment — this account was funded by direct subscription or into a mandate, not against a promise a fund calls over time" />
                                : money(cap.committed)}
                          </td>
                          {/* A SIDE WITH NOTHING IN VIEW IS ABSENT, NEVER ₹0. Under a
                              Sells filter this row has no purchase in view, and a
                              ₹0 there reads as an account that was never funded —
                              the measured-zero rule failing in the direction that
                              invents a fact rather than hides one. */}
                          <td className="px-3 py-2.5 text-right mono text-slate-200 whitespace-nowrap" data-mine-cell="in"
                            title={cap?.source === "calls" ? "These are the fund's own dated capital calls — each is money the family paid, on its date, as the fund's statement prints it." : undefined}>
                            {!cap ? <AbsentCell reason={noCapitalWhy(r)} />
                              : cap.contributions === 0
                                ? <AbsentCell reason={noPurchaseWhy} />
                                : money(cap.paidIn)}
                          </td>
                          <td className="px-3 py-2.5 text-right mono text-slate-400 whitespace-nowrap" data-mine-cell="out"
                            title={cap?.undatedOut != null ? `The fund prints its payouts as one total, ${money(cap.undatedOut)}, with no date against it.` : undefined}>
                            {!cap ? <AbsentCell reason={noCapitalWhy(r)} />
                              : cap.redemption === null
                                ? <AbsentCell reason={cap.sideFiltered
                                  ? "no redemption is in view — the movements are filtered to what was paid in"
                                  : "the fund's statement prints no distribution line, so what has come back to the family is not stated — not a redemption of ₹0"} />
                                // NOTHING CAME BACK: a dash that says so, never
                                // a ₹0 — this table's standing rule for a side
                                // that did not move (a ₹0 reads as a redemption
                                // measured at nothing). The identity still
                                // holds: the realised half beside it is the
                                // computed ₹0 that follows from it.
                                : cap.redemption === 0
                                  ? <AbsentCell reason={cap.windowed
                                    ? "no redemption, payout or withdrawal falls inside the date window — what came back outside it is not shown here"
                                    : "nothing has come back out of this account — its statement's record lists no redemption, payout or withdrawal, so there is no redemption to show; this is not a missing figure"} />
                                  : money(cap.redemption)}
                          </td>
                          {/* APPRECIATION, IN ITS TWO PARTS. Each cell either
                              carries a figure and says how it was struck, or
                              names why it is withheld — the four cases and the
                              one refusal are `capitalRollup`'s. */}
                          <td className={`px-3 py-2.5 text-right mono whitespace-nowrap ${cap?.realised == null ? "" : changeColor(cap.realised)}`}
                            data-mine-cell="realisedGain"
                            data-realised-gain={cap?.realised ?? undefined}
                            title={cap?.realised != null ? cap.realisedNote ?? undefined : undefined}>
                            {!cap ? <AbsentCell reason={noCapitalWhy(r)} />
                              : cap.realised === null
                                ? <AbsentCell reason={cap.appreciation != null
                                  ? `appreciation of ${fmtFromBase(cap.appreciation, { compact: true, sign: true })} is struck, but ${cap.realisedNote ?? "its split is not stated"}`
                                  : cap.realisedNote ?? "no appreciation can be struck on this account's record"} />
                                : fmtFromBase(cap.realised, { compact: true, sign: true })}
                          </td>
                          <td className={`px-3 py-2.5 text-right mono whitespace-nowrap ${cap?.unrealised == null ? "" : changeColor(cap.unrealised)}`}
                            data-mine-cell="unrealisedGain"
                            data-unrealised-gain={cap?.unrealised ?? undefined}
                            title={cap?.unrealised != null ? cap.unrealisedNote ?? undefined : undefined}>
                            {!cap ? <AbsentCell reason={noCapitalWhy(r)} />
                              : cap.unrealised === null
                                ? <AbsentCell reason={cap.appreciation != null
                                  ? `appreciation of ${fmtFromBase(cap.appreciation, { compact: true, sign: true })} is struck, but ${cap.unrealisedNote ?? "its split is not stated"}`
                                  : cap.unrealisedNote ?? "no appreciation can be struck on this account's record"} />
                                : fmtFromBase(cap.unrealised, { compact: true, sign: true })}
                          </td>
                          {/* ── THE ACCOUNT ───────────────────────────────── */}
                          {/* A CLOSED ACCOUNT IS WORTH ₹0 AND THE ZERO IS MEASURED.
                              It keeps its zero — the fund reports nil units at a NAV
                              it still publishes — and says so, because a ₹0 beside a
                              ₹31.1 Cr redemption is exactly where a reader needs to
                              know whether the figure is the arithmetic or a gap. An
                              account no statement values at all is the OTHER case
                              and renders a dash with its reason. */}
                          <td className="px-3 py-2.5 text-right mono text-slate-100 whitespace-nowrap" data-mine-cell="value"
                            data-value-asof={r.value != null ? asOfOf(r) ?? undefined : undefined}
                            title={r.value == null ? undefined : [
                              asOfOf(r) ? `As of ${fmtDate(asOfOf(r)!)} — the date of the statement that values this account. Each account is valued on its own statement's date, so this column is not one "today".` : null,
                              r.value === 0
                                ? (redeemedToNil.has(r.accountId ?? "")
                                  ? "This account holds nothing today: its own statement reports zero units at a NAV the fund still publishes, so the ₹0 is what was measured rather than a figure this book is missing."
                                  : "The positions this account's statement reports sum to ₹0 — a measured zero, not a missing figure.")
                                : null,
                            ].filter(Boolean).join(" ") || undefined}>
                            {r.value === null
                              ? <AbsentCell reason={r.kind === "account"
                                ? (accIdx.get(r.accountId ?? "")?.noPositionsReason
                                  ? `no statement values this account — ${accIdx.get(r.accountId ?? "")!.noPositionsReason}`
                                  : "no statement values this account, so there is no value today")
                                : "this row is a security dealt across however many accounts carried it, so there is no one account to value — the holdings tables carry what is held of it today"} />
                              : money(r.value)}
                          </td>
                          {returnMeasures.map((measure) => {
                            const def = returnMeasureDef(measure);
                            if (!cap) {
                              return (
                                <td key={measure} data-return-cell={measure} className="px-3 py-2.5 text-right mono whitespace-nowrap">
                                  <AbsentCell reason={`${noCapitalWhy(r)} — and a return here is struck on the family's own purchases into an account, so this row carries none`} />
                                </td>
                              );
                            }
                            const res = capitalReturn(cap, measure);
                            // TAG UNLESS THE HEADER ALREADY NAMES IT — the
                            // Holdings table's rule: `auto` always tags, and a
                            // concrete column tags only the rows whose figure is
                            // NOT the measure it promises (a sub-year XIRR shown
                            // as its holding-period return, marked HPR).
                            const offMeasure = measure === "auto" || res.tag !== def.tag;
                            return (
                              <td key={measure} data-return-cell={measure} data-return-tag={offMeasure ? res.tag : undefined}
                                data-return-pct={res.shown ? res.pct : undefined}
                                className="px-3 py-2.5 text-right mono whitespace-nowrap">
                                {offMeasure && <span className="ret-tag mr-0.5">{res.tag}</span>}
                                {res.shown
                                  ? <span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true })}</span>
                                  : <AbsentCell reason={res.reason} />}
                              </td>
                            );
                          })}
                          {/* THE PURCHASES' OWN SPAN (MT-8) — not the span of every
                              movement, which ran Green Lantern's one payment to a
                              TDS outflow eighteen months later and 3P's to its
                              redemption. */}
                          <td className="px-3 py-2.5 text-[12px] mono text-slate-500 whitespace-nowrap" data-mine-cell="investedOn">
                            {!cap ? <AbsentCell reason={noCapitalWhy(r)} />
                              : cap.boughtFirst ? period(cap.boughtFirst, cap.boughtLast)
                              : <AbsentCell reason={side === "out"
                                ? "no dated purchase is in view — the movements are filtered to what came back out"
                                : cap.windowed ? "no purchase falls inside the date window"
                                : "this account's record carries no dated purchase"} />}
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
                                ? <AbsentCell reason={trd.sells === 0 ? "nothing was sold in this row over the window" : realisedAbsence(sellsOf(trd))} />
                                : <>{fmtFromBase(trd.realized, { compact: true, sign: true })}{trd.realizedOf < trd.sells && <span className="ml-1 text-[10.5px] text-slate-500" data-realised-of={`${trd.realizedOf}/${trd.sells}`} title={realisedCoverageNote(sellsOf(trd))}>{trd.realizedOf}/{trd.sells}</span>}</>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap mono text-[11px] text-slate-400">
                            {!trd ? <AbsentCell reason={NO_TRADES_WHY} /> : period(trd.first, trd.last)}
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
                                  {/* A LABEL, NOT A SENTENCE — *"no one is reading these kind
                                      of notes"*. What the rows are is the Type column's own
                                      hover and this label's; which account, and what was
                                      committed and is still to call, stay on screen. */}
                                  {/* A STRIP OF FACTS, NOT A SENTENCE — the label, the
                                      filter that narrows the list, the account and its
                                      commitment each an item of their own (Stage 10cp's
                                      no-explainer rule measures a strip item by item). */}
                                  <div className="mb-1.5 flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-medium text-slate-400" data-mine-panel-label
                                    title={`${cap.windowed || cap.sideFiltered
                                      ? `The dated movements ${cap.provider} reports on account ${cap.accountNo} that are in view — ${[cap.windowed ? "inside the date window" : "", cap.sideFiltered ? (side === "in" ? "purchases only" : "redemptions only") : ""].filter(Boolean).join(", ")} — not the whole record`
                                      : `Every dated movement ${cap.provider} reports on account ${cap.accountNo}`}, as its statement types them${cap.source === "calls" ? ", from the fund's own dated capital calls" : ""}.`}>
                                    <span>What the family bought and redeemed</span>
                                    {(cap.windowed || cap.sideFiltered) && <span className="font-normal text-amber-400/80" data-mine-panel-filter>· {[cap.windowed ? "in the date window" : "", cap.sideFiltered ? (side === "in" ? "purchases only" : "redemptions only") : ""].filter(Boolean).join(", ")}</span>}
                                    <span className="font-normal text-slate-500">· {cap.provider} · a/c {cap.accountNo}</span>
                                    {cap.committed != null && <span className="font-normal text-slate-500">· committed <span className="mono text-slate-400">{money(cap.committed)}</span>{cap.undrawn != null && <>, <span className="mono text-slate-400">{money(cap.undrawn)}</span> still to call</>}</span>}
                                  </div>
                                  <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800">
                                    <SortableTable className="min-w-full text-[12px]"
                                      storageKey="monitor-mine-moves" columns={MINE_MOVE_COLS}>
                                      {(mvv) => (<>
                                      <thead>
                                        <Tr view={mvv} className="border-b border-ink-700/70">
                                          <SortHeader col="date" view={mvv} align="left" pad="px-3 py-1.5">Date</SortHeader>
                                          <SortHeader col="type" view={mvv} align="left" pad="px-3 py-1.5"
                                            title="The statement's own word for the movement — Subscription, Drawdown, Top Up, Full Units Redemption. Printed as it arrived rather than mapped to a vocabulary of ours.">Type</SortHeader>
                                          <SortHeader col="bought" view={mvv} pad="px-3 py-1.5">Purchase</SortHeader>
                                          <SortHeader col="sold" view={mvv} pad="px-3 py-1.5">Redemption</SortHeader>
                                          <SortHeader col="units" view={mvv} pad="px-3 py-1.5"
                                            title="The units allotted by a purchase, or given up by a redemption (shown negative), as the statement prints them.">Units</SortHeader>
                                          <SortHeader col="security" view={mvv} align="left" pad="px-3 py-1.5"
                                            title="The fund or class the movement was in — bought by a purchase, redeemed by a redemption.">Security</SortHeader>
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
                                              {m.direction === "out" ? (m.amount === null
                                                ? <AbsentCell reason="this statement prints no amount for that redemption" />
                                                : money(m.amount)) : ""}
                                            </td>
                                            <td className="px-3 py-1.5 text-right mono whitespace-nowrap text-slate-400">
                                              {m.units === null ? <AbsentCell reason="the statement prints no unit count against this movement" /> : fmtNum(m.units)}
                                            </td>
                                            <td className="px-3 py-1.5 text-slate-400">{m.security ?? <AbsentCell reason="the statement names no security against this movement" />}</td>
                                          </Tr>
                                        ))}
                                        {/* A PAYOUT THE FUND PRINTS ONLY AS A TOTAL is still
                                            money that came back, so it is listed — undated,
                                            and saying so — rather than left out of a list
                                            whose Redemption column above counts it. */}
                                        {cap.undatedOut != null && (
                                          <Tr view={mvv} data-mine-undated={r.accountId ?? ""}>
                                            <td className="px-3 py-1.5 whitespace-nowrap"><AbsentCell reason="the fund prints its payouts as one total with no date against it" /></td>
                                            <td className="px-3 py-1.5 text-slate-400">Payouts to date, as one total</td>
                                            <td className="px-3 py-1.5" />
                                            <td className="px-3 py-1.5 text-right mono whitespace-nowrap text-rose-400/90">{money(cap.undatedOut)}</td>
                                            <td className="px-3 py-1.5" />
                                            <td className="px-3 py-1.5" />
                                          </Tr>
                                        )}
                                      </tbody>
                                      </>)}
                                    </SortableTable>
                                  </div>
                                </>
                              )}
                              {trd && (
                                <>
                                  {/* A LABEL TOO. That a trade is never added to the capital
                                      movements is the Bought column's own hover, on the figure
                                      it is about. */}
                                  <p className={`mb-1.5 text-[11px] font-medium text-slate-400 ${cap ? "mt-3" : ""}`}>
                                    Trades inside the account
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
                  data-foot-realised={totals.realized ?? undefined}
                  data-foot-bought={totals.bought ?? undefined}
                  className="px-3 py-2.5 text-slate-200"
                  labelTitle={capitalNarrowed
                    /* A NARROWED COUNT IS NOT A FACT ABOUT THE BOOK (MT-16). Under
                       a window "5 of this book's 51 accounts publish a dated
                       capital record" was only the accounts with a movement in it. */
                    ? `${totals.accounts} ${totals.accounts === 1 ? "account has" : "accounts have"} a dated purchase or redemption in view under the filters set. Across the whole record, ${fundedInBook} of this book's ${accountsReg.length} accounts publish a dated capital record or a fund's dated capital calls — clear the filters to see them all. The others were funded as well — the managed mandates issue a capital-account ledger rather than dated allotments, and a depository records what is held and never what was paid for it — so the Purchase total is not the whole of what the family has paid in.`
                    : `${totals.accounts} of this book's ${accountsReg.length} accounts publish a dated capital record or a fund's dated capital calls. The other ${accountsReg.length - totals.accounts} were funded as well — the managed mandates issue a capital-account ledger rather than dated allotments, and a depository records what is held and never what was paid for it — so the Purchase total is not the whole of what the family has paid in.`}
                  label={<>Total · {fmtNum(totals.rows)} {totals.rows === 1 ? "row" : "rows"} · {totals.accounts} of {accountsReg.length} accounts{capitalNarrowed ? " in view" : ""}</>}
                  cells={{
                    how: (
                      <td key="how" data-foot-cell="how" className="px-3 py-2.5 text-right text-[12px] text-slate-400 whitespace-nowrap">
                        {side === "out" ? `${totals.withdrawals} withdrawals` : `${totals.contributions} payments${windowed ? " in window" : ""}`}
                      </td>
                    ),
                    committed: (
                      <td key="committed" data-foot-cell="committed" className="px-3 py-2.5 text-right mono font-medium text-slate-300 whitespace-nowrap"
                        title={`Summed over the ${totals.committedOf} of ${totals.rows} rows that are a drawdown fund with a printed commitment. The rest took no commitment, and a row without one contributes nothing rather than ₹0.`}>
                        {totals.committed === null
                          ? <AbsentCell reason="no row in view is a drawdown fund with a printed commitment" />
                          : money(totals.committed)}
                      </td>
                    ),
                    in: (
                      <td key="in" data-foot-cell="in" className="px-3 py-2.5 text-right mono font-medium text-slate-100 whitespace-nowrap">
                        {totals.contributions === 0
                          ? <AbsentCell reason={side === "out" ? "no purchase is in view under this side filter" : windowed ? "no purchase falls inside the date window" : "no row in view carries a dated purchase"} />
                          : money(totals.paidIn)}
                      </td>
                    ),
                    out: (
                      <td key="out" data-foot-cell="out" className="px-3 py-2.5 text-right mono font-medium text-slate-400 whitespace-nowrap"
                        title={`Summed over the ${totals.redemptionOf} rows whose statements say what came back out — a fund that prints no distribution line contributes nothing rather than ₹0.`}>
                        {totals.redemption === null
                          ? <AbsentCell reason="no row in view states what came back out" />
                          : money(totals.redemption)}
                      </td>
                    ),
                    /* THE TWO PARTS OF APPRECIATION, each over the rows that
                       publish it and each saying how many — a withheld split is
                       skipped, never blended in as ₹0. */
                    realisedGain: (
                      <td key="realisedGain" data-foot-cell="realisedGain" className={`px-3 py-2.5 text-right mono font-medium whitespace-nowrap ${totals.realisedGain == null ? "text-slate-600" : changeColor(totals.realisedGain)}`}
                        data-foot-realised-gain={totals.realisedGain ?? undefined} data-foot-realised-gain-of={totals.realisedGainOf}
                        title={`Summed over the ${totals.realisedGainOf} of ${totals.rows} rows that publish a realised figure.`}>
                        {totals.realisedGain === null
                          ? <AbsentCell reason="no row in view publishes a realised figure" />
                          : fmtFromBase(totals.realisedGain, { compact: true, sign: true })}
                      </td>
                    ),
                    unrealisedGain: (
                      <td key="unrealisedGain" data-foot-cell="unrealisedGain" className={`px-3 py-2.5 text-right mono font-medium whitespace-nowrap ${totals.unrealisedGain == null ? "text-slate-600" : changeColor(totals.unrealisedGain)}`}
                        data-foot-unrealised-gain={totals.unrealisedGain ?? undefined} data-foot-unrealised-gain-of={totals.unrealisedGainOf}
                        title={`Summed over the ${totals.unrealisedGainOf} of ${totals.rows} rows that publish an unrealised figure.`
                          + (doubled.unrealisedToo.length ? ` It is a per-account sum, so a holding two accounts here both report is in it once per account: ${doubled.unrealisedToo.map((ps) => ps[0].security).join(", ")}. Whether those are one investment or two is the family's to say.` : "")}>
                        {totals.unrealisedGain === null
                          ? <AbsentCell reason="no row in view publishes an unrealised figure" />
                          : fmtFromBase(totals.unrealisedGain, { compact: true, sign: true })}
                      </td>
                    ),
                    /* A RETURN HAS NO WHOLE-TABLE TOTAL on any measure: every
                       row's is struck on its own purchases over its own dates.
                       Printing one would sit a figure under a column whose
                       every cell is on a different denominator. */
                    ...Object.fromEntries(returnMeasures.map((m) => [`ret:${m}`,
                      <td key={`ret:${m}`} className="px-3 py-2.5 text-right">
                        <AbsentCell reason="every row's return is struck on its own purchases over its own dates, so there is no denominator a whole-table figure could sit on. The money-weighted return across the accounts that can carry one is on Performance." />
                      </td>])),
                    /* A ZERO NOTHING MEASURED IS A DASH (MT-16). Under a window
                       lying before the transaction statements begin, the footer
                       read "0 (0B/0S)" — a count of trades over a period no
                       statement covers. Inside the covered period a zero is a
                       count and stays one. */
                    trades: <td key="trades" data-foot-cell="trades" className="px-3 py-2.5 text-right mono text-slate-200 whitespace-nowrap" data-foot-trades-cell
                      title={windowed && !outsideTape && tapePeriod.from && tapePeriod.to ? `The transaction statements run ${fmtDate(tapePeriod.from)} → ${fmtDate(tapePeriod.to)}; this counts the trades inside the part of the window they cover.` : undefined}>
                      {outsideTape ? <AbsentCell reason={tapeWhy} />
                        : <>{fmtNum(totals.trades)}<span className="ml-1 text-[10.5px] font-normal text-slate-500">{totals.buys}B/{totals.sells}S</span></>}</td>,
                    bought: <td key="bought" data-foot-cell="bought" className="px-3 py-2.5 text-right mono text-slate-200 whitespace-nowrap">{outsideTape ? <AbsentCell reason={tapeWhy} /> : totals.bought == null ? <AbsentCell reason={totals.buys === 0 ? "nothing was bought in the rows in view" : "no buy row in view reports a settled amount on its statement"} /> : money(totals.bought)}</td>,
                    sold: <td key="sold" data-foot-cell="sold" className="px-3 py-2.5 text-right mono text-slate-200 whitespace-nowrap">{outsideTape ? <AbsentCell reason={tapeWhy} /> : totals.sold == null ? <AbsentCell reason={totals.sells === 0 ? "nothing was sold in the rows in view" : "no sell row in view reports a settled amount on its statement"} /> : money(totals.sold)}</td>,
                    realised: <td key="realised" data-foot-cell="realised" className={`px-3 py-2.5 text-right mono whitespace-nowrap ${totals.realized == null ? "text-slate-600" : changeColor(totals.realized)}`}
                      title={outsideTape ? undefined : noTradeNote}
                      data-foot-no-trade-lots={!outsideTape && noTrade ? noTrade.lots : undefined}
                      data-foot-no-trade-realised={!outsideTape && noTrade ? Math.round(noTrade.realised * 100) / 100 : undefined}>{outsideTape ? <AbsentCell reason={tapeWhy} /> : totals.realized == null ? <AbsentCell reason={totals.sells === 0 ? "nothing was sold in the rows in view, so nothing was realised" : realisedAbsence(allTradeSells)} /> : <>{fmtFromBase(totals.realized, { compact: true, sign: true })}{totals.realizedOf < totals.sells && <span className="ml-1 text-[10.5px] font-normal text-slate-500" data-realised-of={`${totals.realizedOf}/${totals.sells}`} title={realisedCoverageNote(allTradeSells)}>{totals.realizedOf}/{totals.sells}</span>}</>}</td>,
                    /* STRUCK OVER THE ACCOUNT ROWS THAT CARRY ONE, and the
                       count says how many — a security row is an instrument
                       rather than an account and has no account value to add,
                       so a total over "every row" would name a denominator this
                       column does not have. */
                    value: <td key="value" data-foot-cell="value" className="px-3 py-2.5 text-right mono font-medium text-slate-100 whitespace-nowrap"
                      data-foot-value-doubled={doubled.excess > 0.5 ? Math.round(doubled.excess * 100) / 100 : undefined}
                      title={[
                        `Summed over the ${totals.valueOf} of ${totals.rows} rows that are an account. A security row is an instrument dealt across however many accounts carried it, so it contributes no account value here.`,
                        asOfSpan && asOfSpan.dates > 1 ? `Each account is valued at its own statement's date — ${fmtDate(asOfSpan.from)} to ${fmtDate(asOfSpan.to)} — so this total adds values struck on different days, not one day's value.` : null,
                        doubled.groups.length
                          ? `It is a per-account sum, so a holding two accounts here both report is in it once per account: ${doubledNames.join("; ")}. That puts ${money(doubled.excess)} more in this total than the Holdings table, which counts a holding two statements both report once. Whether that is one investment reported twice or two investments is the family's to say, so the figures here are left as each statement prints them.`
                          : null,
                      ].filter(Boolean).join(" ")}>
                      {totals.value === null ? <AbsentCell reason="no row in view is an account, so there is no account value to total" /> : money(totals.value)}
                    </td>,
                    /*
                      THESE CAN NEVER CARRY A TOTAL, AND EACH SAYS SO.

                      Two are spans of DATES — the earliest and latest across
                      rows funded years apart is a range, not a sum. The return
                      columns above are RATES struck per row on that row's own
                      purchases, so a whole-table figure would sit under a column
                      whose every cell is on a different denominator — the
                      failure the allocation footer already cost this book once.
                      The last is a column of NAMES.

                      They render `AbsentCell` WITH A REASON rather than sitting
                      blank: a reader who scans an empty cell learns nothing
                      about whether a figure was withheld or never existed.
                    */
                    investedOn: <td key="investedOn" className="px-3 py-2.5 text-left"><AbsentCell reason="a span of dates has no total — each row states its own first and last purchase" /></td>,
                    traded: <td key="traded" className="px-3 py-2.5 text-left"><AbsentCell reason="a span of dates has no total — each row states its own first and last trade" /></td>,
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
        {/* THE LINE THAT STOOD HERE IS THE TRADES HEADER'S HOVER NOW — *"no one
            is reading these kind of notes that you have put in across tables."*
            It is still load-bearing (without it a Direct Equity section of a
            dozen names reads as a family that barely trades), so it moved onto
            the column it explains rather than going. */}
      </Card>
    </div>
  );
}
