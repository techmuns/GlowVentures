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
import { loadStockExposure, type HeldFund, type StockExposureState } from "@/lib/lookthrough";
import { fmtPct, changeColor, fmtNum, fmtDate } from "@/lib/format";
import {
  sum, sumOrNull, consolidatedMarketValue, dedupedPositions, isFundVehicle, isCompanyShare,
  holdingRoute, ROUTE_LABEL,
  mandateLabel, MANDATE_BUCKET,
  measuredReturn, returnCoverage, RETURN_MEASURES, returnMeasureDef, isReturnMeasure, type ReturnMeasure,
  costCoversSet,
  isRedeemedToNil,
} from "@/lib/analytics";
import { accountIndex, ownerOf, type AccountIndex, engagementOf } from "@/lib/accounts";
import { splitFundClass } from "../../shared/securityKey.mjs";
import { ownerDisplayName } from "@/lib/owners";
import { loadTransactions, loadSales, type Txn } from "@/lib/ledger";
import { rollup, rollupTotals, acctKey, type TxnView } from "@/lib/txnRollup";
import { trancheTable, capitalRollup, capitalTotals, type TrancheTable } from "@/lib/tranches";
import { BOOK_POSITION_TRANCHES, BOOK_CAPITAL_MOVES, BOOK_POLYCAB } from "@/data/glowData";
import { useViewParam, type ViewDef } from "@/components/ViewToggle";
import { UNCLASSIFIED, UNCLASSIFIED_WHY } from "@/lib/familyTaxonomy";
// THE AXES, DECIDED ONCE. Morning CIO's allocation table groups on the same
// three; see the header of `groupAxis.ts` for why they cannot be a local
// definition on either screen — and for why the FOURTH one, SECURITY, is this
// page's alone and is deliberately not in `GROUP_VIEWS`.
import {
  MONITOR_GROUP_VIEWS, type MonitorAxis, SECURITY_AXIS, SECURITY_SECTION,
  groupKeyFor, groupSourceFor, groupOrdFor, groupLabelFor,
  ALL_LABEL, bucketFor, heldUnderMandate,
} from "@/lib/groupAxis";
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
import { securityKeyOf, stripDepositoryTail } from "@/lib/securityKey";
import { AbsentCell, AbsentSection, AbsentValue, DASH } from "@/components/Absent";

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
  redeemed: boolean;
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
  /**
   * EVERY holding behind this row is redeemed to nil units — all of them, never
   * some. A row where one class has been redeemed and another is still held is
   * not a redeemed row, and saying so would write off money the family still
   * has; the per-class lines in the expansion carry it individually.
   */
  redeemed: boolean;
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
type SortKey = "security" | "marketValue" | "returnPct" | "unrealizedPnL" | "weight" | "dayChange" | "viaFunds" | "totalExposure";

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
  const [view, setView] = useState<"holdings" | "transactions">("holdings");
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
   * THE TABLE'S WIDTH, IN ONE PLACE. The stock axis draws two columns the other
   * three do not, and every full-width row under the table — a section heading,
   * an expansion, the empty state — has to span exactly as many. Written as a
   * literal in seven places it goes wrong silently: the expansion simply stops
   * reaching the last column and nothing fails.
   */
  const COL_COUNT = groupAxis === SECURITY_AXIS ? 15 : 13;
  /**
   * ── THE FUND LOOK-THROUGH, LOADED ONCE FOR THE WHOLE PAGE ──────────────────
   *
   * The stock axis needs the SAME answer in two places: the `Via funds` cell on
   * a row, and the itemised card inside that row's expansion. Loading it twice
   * would be two chances for a cell and the card beneath it to state different
   * numbers about one company — the failure `drilldown.ts` exists to stop for
   * the book's own figures, arriving through a derived one. So the index is
   * built once here and both read it.
   *
   * ONLY ON THIS AXIS. The other three group the book's own positions and never
   * ask what a fund holds, so they must not pay for 21 fetches.
   */
  const heldVehicles = useMemo<HeldFund[]>(() => {
    // Struck over `consolidated` — each dedupeGroup once — because this feeds a
    // DERIVED exposure and a fund counted twice would double the share derived
    // from it. Clubbed by `securityKey`, so one scheme held by three members is
    // one fund with one disclosure at the value the book carries for all three.
    const m = new Map<string, HeldFund>();
    for (const p of consolidated) {
      if (!isFundVehicle(p)) continue;
      const e = m.get(p.securityKey)
        ?? { securityKey: p.securityKey, name: p.security, marketValue: 0, assetClass: p.assetClass };
      e.marketValue += p.marketValue;
      m.set(p.securityKey, e);
    }
    return [...m.values()];
  }, [consolidated]);
  /**
   * ISIN → THE BOOK'S OWN KEY, which is the only tier that can join a
   * depository's `SBI - EQ` to an AMC's `State Bank of India`. Without it those
   * two stand as separate rows and the family's own question — how much of this
   * company do I hold altogether — gets two answers.
   */
  const isinToBookKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of consolidated) {
      if (!isCompanyShare(p) || !p.isin) continue;
      const k = p.isin.trim().toUpperCase();
      if (k && !m.has(k)) m.set(k, p.securityKey);
    }
    return m;
  }, [consolidated]);
  /**
   * THE RING-FENCE, CARRIED ONTO THE DERIVED SIDE.
   *
   * `Polycab.tsx` is `BOOK_POLYCAB`'s only reader FOR DISPLAY and stays so: this
   * reads it to take a name OUT, never to put a figure in, and no value from it
   * reaches any cell. Without it the look-through would draw a Polycab row from
   * a scheme's disclosure — the fence is a decision about a SECURITY, and it has
   * to hold wherever that security is reported, including in somebody else's
   * portfolio. `check:pages` asserts the page never names it.
   */
  const ringFenced = useMemo(() => ({
    keys: new Set(BOOK_POLYCAB.map((p) => p.securityKey)),
    isins: new Set(BOOK_POLYCAB.map((p) => (p.isin ?? "").trim().toUpperCase()).filter(Boolean)),
  }), []);
  const [exposure, setExposure] = useState<StockExposureState>({ status: "loading" });
  useEffect(() => {
    if (!bySecurity) return;
    let live = true;
    loadStockExposure(heldVehicles, isinToBookKey, ringFenced).then((s) => { if (live) setExposure(s); });
    return () => { live = false; };
  }, [bySecurity, heldVehicles, isinToBookKey, ringFenced]);
  /**
   * WHICH RETURN(S) THE ONE RETURN COLUMN SHOWS — the picker that replaced the
   * Absolute/CAGR toggle. Default is `auto`, the methodology (equity under a year
   * absolute, a year or more CAGR, fixed income XIRR); the reader can pin one or
   * more concrete measures instead, each labelled in the column. Held in the URL
   * (`?ret=`), so the guard-firing CAGR view is a shareable link and the sweep
   * reaches it without a click. See `useReturnMeasures` / `measuredReturn`.
   */
  const [returnMeasures, setReturnMeasures] = useReturnMeasures();
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [asc, setAsc] = useState(false);
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
    () => ["All", ...Array.from(new Set(positions.map((p) => groupKeyFor(groupAxis, accIdx, p))))
      .sort((a, b) => groupOrdFor(groupAxis)(a) - groupOrdFor(groupAxis)(b))],
    [positions, accIdx, groupAxis],
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
    return [...mv.keys()].sort((a, b) => (mv.get(b) ?? 0) - (mv.get(a) ?? 0));
  }, [positions]);
  // Lets the sector filter reach the Transactions tape, which carries no sector of its own.
  const sectorByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of positions) m.set(p.securityKey, p.sector);
    return m;
  }, [positions]);
  const { rows, totMV, totCost, totPnL, rawMV, weightBase, weightCount, bucketTotals } = useMemo(() => {
    let base = positions;
    if (entity !== "All") base = base.filter((p) => ownerOf(accIdx, p) === entity);
    if (sector !== "All") base = base.filter((p) => p.sector === sector);
    /**
     * THE FILTER IS ON THE ACTIVE AXIS, and it has to be: its options come from
     * that axis (see `buckets`), so testing them against the category key would
     * compare a basket name to a category and match nothing — an empty table on
     * a page that renders perfectly. The filter and its option list must read
     * the SAME key or one of them is lying about what it offers.
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
        // That money is on the Transactions card, under My investments.
        heldSince: null,
        // A MANDATE IS NEVER "REDEEMED": it is an account, and an account that
        // holds nothing says so through `noPositionsReason` on its own page.
        fundClasses: [], redeemed: false,
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
        const redeemed = ps.every((x) => isRedeemedToNil(x));
        return {
          kind: "security" as const, bucket: groupKeyFor(groupAxis, accIdx, ps[0]),
        groupSource: groupSourceFor(groupAxis, accIdx, ps[0]),
          key: ps[0].securityKey, security: fundClasses.length ? splitFundClass(ps[0].security)!.fund : ps[0].security,
          securityKey: ps[0].securityKey, sector: ps[0].sector, assetClass: ps[0].assetClass,
          fundClasses, redeemed,
          entities: Array.from(new Set(ps.map((x) => ownerOf(accIdx, x)))), quantity: perUnit ? qty : null,
          avgCost: perUnit && !costNA && qty > 0 ? (cost as number) / qty : null,
          currentPrice: perUnit ? ps[0].currentPrice : null,
          costBasis: cost, marketValue: mv, unrealizedPnL: pnl,
          returnPct: !costNA && pnl !== null && (cost as number) > 0 ? (pnl / (cost as number)) * 100 : null,
          weight: weightBase > 0 ? mv / weightBase : 0,
          costNA,
          heldSince,
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
        entities: [ownerOf(accIdx, p)], fundClasses: [], redeemed: isRedeemedToNil(p), quantity: p.quantity, avgCost: p.avgCost, currentPrice: p.currentPrice,
        costBasis: p.costBasis, marketValue: p.marketValue, unrealizedPnL: p.unrealizedPnL,
        returnPct: p.returnPct, weight: weightBase > 0 ? p.marketValue / weightBase : 0,
        costNA: !!p.costUnavailable || p.costBasis === null,
        heldSince: p.heldSince,
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
      const derivedShown = ex && entity === "All" && sector === "All" && selected.size === 0;
      if (derivedShown) {
        for (const e of ex.byKey.values()) {
          if (matched.has(e.key)) continue;
          out.push({
            kind: "security" as const,
            bucket: SECURITY_SECTION,
            groupSource: null,
            key: "derived:" + e.key,
            security: e.name,
            securityKey: e.key,
            // A derived look-through row stands for a company inside a fund, so
            // there is no unit class to club and none to name.
            fundClasses: [], redeemed: false,
            sector: "",
            assetClass: "Equity",
            entities: [],
            quantity: null, avgCost: null, currentPrice: null,
            costBasis: null, marketValue: 0, unrealizedPnL: null, returnPct: null,
            weight: weightBase > 0 ? e.total / weightBase : 0,
            costNA: true,
            heldSince: null,
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
    const effSort: SortKey = bySecurity && sortKey === "marketValue" ? "totalExposure" : sortKey;
    out.sort((a, b) => {
      const av = a[effSort] ?? 0, bv = b[effSort] ?? 0;
      const cmp = typeof av === "string" ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return asc ? cmp : -cmp;
    });
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
      weightBase, weightCount, bucketTotals,
    };
  }, [positions, accIdx, mandateTotals, consolidate, bySecurity, exposure, selected, sector, entity, bucket, groupAxis, sortKey, asc]);
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
    const stocks = consolidated.filter(isCompanyShare);
    const measured = sum(stocks.map((p) => p.marketValue));
    const cash = sum(consolidated.filter((p) => p.assetClass === "Cash").map((p) => p.marketValue));
    const nav = sum(consolidated.map((p) => p.marketValue));
    const ex = exposure.status === "ok" ? exposure : null;
    const derived = ex?.total ?? 0;
    const opaque = ex?.skippedValue ?? 0;
    const nonEquity = ex?.nonEquityValue ?? 0;
    const aif = (ex?.skipped ?? []).filter((sk) => /^an AIF files/.test(sk.reason));
    return {
      nav, measured, derived, opaque, nonEquity, cash,
      total: measured + derived,
      names: new Set(stocks.map((p) => p.securityKey)).size,
      aifCount: aif.length,
      aifValue: sum(aif.map((sk) => sk.marketValue)),
      covered: ex?.covered ?? 0,
      considered: ex?.considered ?? heldVehicles.length,
      /**
       * ONE COMPANY THE BOOK ITSELF CARRIES UNDER TWO KEYS — named, never merged.
       *
       * A PMS statement prints `ICICI Bank Ltd.` and the depository prints
       * `ICICI BANK-EQ`; `securityKey` is derived from the RAW name and is
       * deliberately not routed through `stripDepositoryTail` (§"it only ever
       * removes"), so the two are different identities in the book and this
       * table draws two rows with almost the same name.
       *
       * IT IS NOT REPAIRED HERE. "If a join fails, fix the EXTRACTOR — never
       * re-derive a key in the presentation layer, which hides the defect from
       * the reconciler." Re-keying on screen would give a reader one tidy row
       * and leave `docs/EXTRACTION-REPORT.md` none the wiser. So it is COUNTED
       * against the stripped name and stated, which is what tells the next
       * session there is an extractor join to make.
       */
      splitNames: (() => {
        const byName = new Map<string, Set<string>>();
        for (const p of stocks) {
          const k = securityKeyOf(stripDepositoryTail(p.security));
          (byName.get(k) ?? byName.set(k, new Set()).get(k)!).add(p.securityKey);
        }
        const split = [...byName.values()].filter((v) => v.size > 1);
        const keys = new Set(split.flatMap((v) => [...v]));
        return {
          count: split.length,
          value: sum(stocks.filter((p) => keys.has(p.securityKey)).map((p) => p.marketValue)),
        };
      })(),
    };
  }, [consolidated, exposure, heldVehicles]);
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
  const sortBtn = (k: SortKey) => () => { if (sortKey === k) setAsc(!asc); else { setSortKey(k); setAsc(false); } };
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
        <MultiSelectFilter options={securityNames} selected={selected} onChange={setSelected} dense
          allLabel="All holdings" unit="holdings" placeholder="Search holdings…" className="w-56 max-w-full" />
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
        {view === "holdings" && (
          <div className="inline-flex w-fit items-center gap-0.5 rounded-md border border-ink-700 bg-ink-800/60 p-0.5" role="tablist"
            aria-label="Group holdings by">
            {MONITOR_GROUP_VIEWS.map((g) => (
              <button key={g.key} type="button" role="tab" aria-selected={groupAxis === g.key} title={g.title}
                data-group-axis={g.key}
                onClick={() => setGroupAxis(g.key)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${groupAxis === g.key ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
                {g.label}
              </button>
            ))}
          </div>
        )}
        {/* THE SECTION FILTER IS HIDDEN ON THE SECURITY AXIS, which files every
            holding in one section by design — the control would offer a single
            option and change nothing, which is worse than no control. */}
        {!bySecurity && (
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-slate-200 ring-focus">
            {buckets.map((s) => <option key={s} value={s}>{s === "All" ? ALL_LABEL[groupAxis] : groupLabelFor(groupAxis)(s)}</option>)}
          </select>
        )}
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

      {view === "holdings" ? (
        <Card pad={false} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10 bg-ink-800">
                <tr className="border-b border-ink-700">
                  <Th onClick={sortBtn("security")}>Security</Th>
                  <th className="label-xs px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="label-xs px-2 py-1.5 text-right font-medium whitespace-nowrap">Avg cost</th>
                  <th className="label-xs px-2 py-1.5 text-right font-medium">Invested</th>
                  <th className="label-xs px-2 py-1.5 text-right font-medium">CMP</th>
                  <Th right onClick={sortBtn("dayChange")}>Day</Th>
                  <Th right onClick={sortBtn("marketValue")}>{bySecurity ? "Direct + PMS" : "Market value"}</Th>
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
                  {bySecurity && <Th right onClick={sortBtn("viaFunds")}>Via funds</Th>}
                  {bySecurity && <Th right onClick={sortBtn("totalExposure")}>Total exposure</Th>}
                  <Th right onClick={sortBtn("weight")}>Weight</Th>
                  <Th right onClick={sortBtn("unrealizedPnL")}>Unreal. P&L</Th>
                  <th className="label-xs px-2 py-1.5 text-right font-medium whitespace-nowrap">Realised P&L</th>
                  {/*
                    ONE RETURN COLUMN, headed just "Return" — the measure it shows
                    is chosen in the picker on the filter row and named on every
                    cell (HPR / CAGR / XIRR / YTD), so the header does not carry
                    it. The separate YTD column is gone: YTD is one of the measures
                    now, shown in this column when it is ticked.
                  */}
                  <Th right onClick={sortBtn("returnPct")}>Return</Th>
                  {/* SECTOR AND ENTITY CLOSE THE TABLE — the family asked for
                      the money to read first, and these two are the only
                      columns on the row that are not money. They describe the
                      holding rather than measure it, so they sat between the
                      name and the first figure and pushed Qty, cost and value
                      off the first screen. Nothing about what they RENDER
                      changes; only where they are read. */}
                  <th className="label-xs px-2 py-1.5 text-left font-medium">Sector</th>
                  <th className="label-xs px-2 py-1.5 text-left font-medium">{consolidate ? "Entities" : "Entity"}</th>
                </tr>
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
                    {grp.rows.map((r) => {
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
                      <tr className="hover:bg-ink-700/40"
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
                                WHY THE ROW IS ALL ZEROS, ON THE ROW.

                                *"the 3P funds … are lacking invested and current
                                market value figures, so please check why they
                                are missing."* They are not missing: the fund
                                redeemed every unit and still publishes a NAV, so
                                the ₹0 is a MEASUREMENT. Without this the row is
                                a line of dashes that reads as a broken feed —
                                which is exactly how it was read.
                              */}
                              {r.redeemed && (
                                <>{" "}<span className="ml-1 align-middle" data-redeemed={r.securityKey}
                                  title={`Every unit of this fund has been redeemed: its own statement reports zero units held and still publishes a NAV, so the ₹0 is what the fund measured rather than a figure this book is missing.${r.fundClasses.length ? " Open the row for each class." : ""}`}>
                                  <Pill tone="warn">redeemed</Pill>
                                </span></>
                              )}
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
                                  title={`No live price for this security — showing the mark from its statement as of ${portfolio.asOf}.`}>◦</span></>}
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
                          THE ONE RETURN COLUMN — the ticked measure(s), each
                          labelled with its tag. `measuredReturn` decides; this
                          cell only draws. `auto` resolves per row to the
                          methodology's measure and tags it (HPR / CAGR); the
                          concrete measures show that measure or a dash naming why
                          this book cannot strike it (XIRR per holding, YTD outside
                          a within-year purchase, calendar year). The guard is
                          inside `measuredReturn`, so no line can annualise a
                          sub-year window. The plain return on cost keeps its audit
                          popover on rows still on their workbook mark; the derived
                          figures carry a tooltip instead.

                          RENDERED INLINE, NEVER STACKED IN A FLEX COLUMN. A
                          block-stacked cell puts a newline INSIDE it, and the
                          sweep reads whole rows by splitting the page text on
                          newlines — an internal one shatters the row. So measures
                          sit inline (wrapping is visual and adds no newline), and
                          each is `whitespace-nowrap` so a tag never splits from
                          its figure.
                        */}
                        <td data-return-cell="" className="px-2 py-1.5 text-right mono" title={r.live && !r.costNA ? mixedBasisNote : undefined}>
                          {returnMeasures.map((measure) => {
                            const res = measuredReturn(r, measure, portfolio.asOf);
                            // Tag "HPR" is always the raw return on cost (res.pct === returnPct),
                            // so its audit popover ties to the workbook; CAGR/other are derived.
                            const value = !res.shown
                              ? <AbsentCell reason={res.reason} />
                              : res.tag === "HPR" && !r.live
                                ? <Auditable formula={returnFormula(r.marketValue, r.costBasis, r.returnPct, money)}><span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true })}</span></Auditable>
                                : <span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true })}</span>;
                            return (
                              <span key={measure} className="ml-1 whitespace-nowrap first:ml-0">
                                <span className="ret-tag mr-0.5">{res.tag}</span>
                                {value}
                              </span>
                            );
                          })}
                        </td>
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
                      </tr>
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
                              <table className="min-w-full text-[12px]">
                                <thead>
                                  <tr className="border-b border-ink-700/70">
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Invested on</th>
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">As</th>
                                    {/* ONLY WHERE THE ROW SPANS MORE THAN ONE FOLIO, and
                                        then it is load-bearing rather than decoration: this
                                        book's Sanshi Class E row unions four members, and
                                        two of them contributed on the SAME DAY under the
                                        same label. Without the holder those read as one
                                        decision printed twice at different sizes. */}
                                    {trancheSpansEntities && <th className="label-xs px-3 py-1.5 text-left font-medium">Entity</th>}
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Amount</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Invested</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Units</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Entry NAV</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Value today</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Gain</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Return</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-700/50">
                                  {tranches.rows.map((t) => (
                                    <tr key={t.date + t.label} data-tranche-row={r.key} className="hover:bg-ink-700/30">
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
                                    </tr>
                                  ))}
                                </tbody>
                                {/* SUMMED FROM THE ROWS ABOVE, never computed beside
                                    them — so it reconciles to the Invested cell this
                                    panel opened from by construction rather than by a
                                    tolerance. The Private Market page's PM-1 is what
                                    happens when a footer is derived independently. */}
                                <tfoot className="border-t border-ink-700 bg-ink-900/40">
                                  <tr data-tranche-total={r.key}>
                                    <td className="px-3 py-1.5 font-medium text-slate-300" colSpan={trancheSpansEntities ? 3 : 2}>
                                      Combined · {tranches.rows.length} {tranches.rows.length === 1 ? "contribution" : "contributions"}
                                    </td>
                                    <td className="px-3 py-1.5" />
                                    <td className="px-3 py-1.5 text-right mono font-medium text-slate-200 whitespace-nowrap">{fmtFromBase(tranches.invested, { compact: true })}</td>
                                    <td className="px-3 py-1.5 text-right mono font-medium text-slate-300 whitespace-nowrap">{fmtNum(tranches.units)}</td>
                                    <td className="px-3 py-1.5" />
                                    <td className="px-3 py-1.5 text-right mono font-medium text-slate-100 whitespace-nowrap">{fmtFromBase(tranches.value, { compact: true })}</td>
                                    <td className={`px-3 py-1.5 text-right mono font-medium whitespace-nowrap ${tranches.value - tranches.invested >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                      {fmtFromBase(tranches.value - tranches.invested, { compact: true })}
                                    </td>
                                    <td className={`px-3 py-1.5 text-right mono font-medium whitespace-nowrap ${tranches.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                      <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">HPR</span>{fmtPct(tranches.returnPct)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
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
                              <table className="min-w-full text-[12px]">
                                <thead>
                                  <tr className="border-b border-ink-700/70">
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Security</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Qty</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Avg cost</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Invested</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">CMP</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Market value</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium whitespace-nowrap"
                                        title={`Each holding's share of the mandate's own total — ${money(m.accountMV)} across ${m.accountCount} holdings, struck before this page's filters.`}>% of mandate</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Unreal. P&L</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Return</th>
                                    {/* Sector last here too, so the drill-down reads
                                        in the same order as the row it opens out of. */}
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Sector</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-700/50">
                                  {m.holdings.map((h) => (
                                    <tr key={h.securityKey || h.security}>
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
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
                            <p className="mb-1.5 text-[11px] leading-relaxed text-slate-500">
                              The row above clubs them into one holding; each line here is one statement as printed.
                            </p>
                            <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800">
                              <table className="min-w-full text-[12px]">
                                <thead>
                                  <tr className="border-b border-ink-700/70">
                                    {/* THE CLASS COLUMN, ONLY WHERE THE ROW CLUBS MORE THAN ONE.
                                        Drawn from the row rather than from the venues: a
                                        column headed Class over a table where every line
                                        says the same thing is chrome, and over a table
                                        where none does it is empty. */}
                                    {r.fundClasses.length > 0 && (
                                      <th className="label-xs px-3 py-1.5 text-left font-medium">Class</th>
                                    )}
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Held via</th>
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Vehicle</th>
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Owning entity</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Qty</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Market value</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">% of holding</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Unreal. P&L</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Return</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-700/50">
                                  {vs.map((v) => (
                                    <tr key={v.securityKey + "@" + v.accountId} data-venue={v.route} data-venue-class={v.cls ?? ""}>
                                      {/* AND THE CLASS ITSELF IS THE LINK, because a class
                                          is what `/stock/:securityKey` actually serves. The
                                          clubbed row above deliberately is not one. */}
                                      {r.fundClasses.length > 0 && (
                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                          {v.cls
                                            ? <StockLink securityKey={v.securityKey} name={v.cls} />
                                            : <AbsentCell reason="this line's statement names no unit class for the holding" />}
                                          {v.redeemed && (
                                            <>{" "}<span className="ml-1 align-middle"><Pill tone="warn">redeemed</Pill></span></>
                                          )}
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
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
                                component's own header. Drawn for a COMPANY SHARE
                                only: a disclosure carries the equity section
                                alone, so it can never speak for cash, a bond or a
                                fund row (and a scheme holding itself is not a
                                look-through anyway). */}
                            {r.assetClass === "Equity" && (
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
                        <tr className="border-t border-ink-700 bg-ink-900/40 font-semibold"
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
                          {/* The category return is CUMULATIVE ON COST, on the
                              footer's basis, and does NOT follow the per-holding
                              measure picker: a bucket has no single purchase date
                              to annualise over, so annualising it would be the very
                              extrapolation the guard forbids. It is refused where
                              the cost side does not cover the market value beside
                              it (`costCoversSet`), the same as Morning CIO. */}
                          <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${ret === null ? "text-slate-500" : changeColor(ret)}`}>
                            {ret === null
                              ? <AbsentCell reason={retWhy} />
                              : <span title={`${fmtFromBase(tot.pnl, { compact: true, sign: true })} on ${fmtFromBase(tot.cost, { compact: true })} invested. Cumulative on cost, not annualised — a category has no single purchase date to strike a CAGR or XIRR over.`}>
                                  {fmtPct(ret, { sign: true })}
                                </span>}
                          </td>
                          {/* Sector and Entity describe a holding; a category has
                              no sum of words. Empty, exactly as in the footer. */}
                          <td className="px-2 py-1.5"></td>
                          <td className="px-2 py-1.5"></td>
                        </tr>
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
                <tr className="border-t border-ink-700 font-semibold" data-footer-total="">
                  <td className="px-2 py-1.5 text-slate-200" colSpan={3}>Total · {rows.length} rows</td>
                  <td className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap"><Auditable formula={{ title: "Total invested (cost)", excel: "= Σ Cost of all holdings", plain: "What the holdings in this table cost, added together — every asset class, not the listed ones alone.", worked: `= ${money(totCost)} across ${rows.length} rows`,  }}>{fmtFromBase(totCost, { compact: true })}</Auditable></td>
                  <td className="px-2 py-1.5"></td>
                  <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${totDayPct == null ? "text-slate-600" : changeColor(totDayPct)}`}
                    title={totDayPct == null ? undefined : `${money(totDay, true)} across the live-priced book since previous close`}>
                    {totDayPct == null ? "—" : `${totDayPct >= 0 ? "+" : ""}${totDayPct.toFixed(2)}%`}
                  </td>
                  <td className="px-2 py-1.5 text-right mono text-slate-100 whitespace-nowrap" title={feedLive ? LIVE_CELL : undefined}>
                    {feedLive ? fmtFromBase(totMV, { compact: true })
                              : <Auditable formula={{ title: "Total market value", excel: "= Σ Market value of all holdings", plain: "The market value of the holdings in this table, added together — every asset class, not the listed ones alone.", worked: `= ${money(totMV)} across ${rows.length} rows`,  }}>{fmtFromBase(totMV, { compact: true })}</Auditable>}
                  </td>
                  {/* THE TWO STOCK-AXIS COLUMNS TOTAL TOO. `Via funds` is the
                      derived equity across every disclosed fund and `Total
                      exposure` is the figure the table exists to state — what
                      the family holds of companies altogether. Both are struck
                      FROM the rows above, so the footer ties to its own column
                      rather than being computed a second way (the Private Market
                      page's PM-1). */}
                  {bySecurity && (
                    <td className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap" data-footer-viafunds>
                      {exposure.status === "ok"
                        ? fmtFromBase(sum(rows.map((r) => r.viaFunds ?? 0)), { compact: true })
                        : <AbsentCell reason={exposure.status === "loading"
                            ? "the fund look-through is still loading"
                            : "the fund look-through store did not answer"} />}
                    </td>
                  )}
                  {bySecurity && (
                    <td className="px-2 py-1.5 text-right mono text-slate-100 whitespace-nowrap" data-footer-exposure>
                      {fmtFromBase(sum(rows.map((r) => r.totalExposure ?? r.marketValue)), { compact: true })}
                    </td>
                  )}
                  {/* THE WEIGHT COLUMN HAS A TOTAL NOW, and it is not decoration.
                      Each category above prints its own share of the book, and a
                      column of shares with no total is a set of figures a reader
                      cannot check by adding. It reads 100.0% unfiltered — the
                      denominator IS this table's book — and less than that under
                      a company filter, which is the gap the caption below already
                      explains. Absent rather than 0.0% on an empty book: a weight
                      of nothing divided by nothing is not a measurement. */}
                  <td className="px-2 py-1.5 text-right mono text-slate-300 whitespace-nowrap"
                    title={weightGap > 1
                      ? `The picked companies are ${fmtFromBase(totMV, { compact: true })} of the ${fmtFromBase(weightBase, { compact: true })} book every Weight cell divides by, which is why this column no longer adds to 100%.`
                      : "Every weight above is struck over this table's own book, so the column adds to 100%."}>
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
                  <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${changeColor(totPnL)}`} title={feedLive ? LIVE_CELL : undefined}>
                    {feedLive ? fmtFromBase(totPnL, { compact: true, sign: true })
                              : <Auditable formula={{ title: "Total unrealised P&L", excel: "= Σ (Market value − Cost)", plain: "Every holding's on-paper gain or loss, added up.", worked: `= ${money(totPnL, true)}`,  }}>{fmtFromBase(totPnL, { compact: true, sign: true })}</Auditable>}
                  </td>
                  {/* sumOrNull, not sum: a name with no realised figure must not
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
                      view". */}
                  <td className="px-2 py-1.5 text-right mono whitespace-nowrap">{
                    !consolidate ? <AbsentCell reason="realised gain is a per-security figure; switch to the consolidated view to see it" />
                    : realized === undefined ? <span className="text-slate-500">…</span>
                    : realized === null ? <AbsentCell reason="the audit archive didn't respond" />
                    : realisedSplit === null || realisedSplit.total === null ? <AbsentCell reason={realisedSplit?.anySold
                        ? "these names were sold, but no capital gain statement covers the accounts they were sold from"
                        : "no sale of these names appears on the transaction statements in this drop"} />
                    : <span className={changeColor(realisedSplit.total)}>{fmtFromBase(realisedSplit.total, { compact: true, sign: true })}</span>
                  }</td>
                  {/* THE FOOTER RETURN IS THE WHOLE BOOK ON COST — cumulative, on
                      the footer's own basis, and like the category returns it does
                      NOT follow the per-holding measure picker: the book has no one
                      purchase date to annualise over. */}
                  <td className={`px-2 py-1.5 text-right mono whitespace-nowrap ${changeColor(totPnL)}`} title={feedLive ? LIVE_CELL : undefined}>
                    {feedLive ? fmtPct(totalRet, { sign: true })
                              : <Auditable formula={{ title: "Total return", excel: "= Total P&L ÷ Total cost × 100", plain: "The whole listed book's gain or loss versus what it cost.", worked: `= ${money(totPnL)} ÷ ${money(totCost)} × 100 = ${fmtPct(totalRet, { sign: true })}` }}>{fmtPct(totalRet, { sign: true })}</Auditable>}
                  </td>
                  {/* Sector and Entity — descriptors, so the footer has nothing
                      to total under them. Empty rather than absent: a column
                      of words has no sum to be missing. */}
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* The cost-coverage caption that stood here — "Invested and Unrealised
              P&L are struck over the N of M positions that report a cost" — was
              removed at the family's request. The fact it stated survives per row:
              a position with no cost renders an AbsentCell in the Invested and
              Unrealised P&L columns, each carrying the reason in its title. */}
          {/*
            ── WHAT THE SECURITY AXIS CAN CLUB, AND WHAT IT CANNOT ─────────────

            The request was to club "every single investment direct/PMS/ETF/AIF".
            Two of those four can be clubbed and two cannot, and the difference
            is a fact about the CORPUS rather than a choice:

            A share is clubbed however it was arrived at — the family's own demat
            and a discretionary manager's mandate both REPORT THE SHARE, so both
            are positions in this book and both carry the same `securityKey`.

            A share held INSIDE a fund cannot be. An AIF folio, a mutual-fund
            scheme and an ETF are each ONE PURCHASE of a manager's portfolio, and
            no statement in this book reports the companies inside the folios the
            family holds. So the fund is its own row, at its own value, and the
            page says so rather than drawing a look-through nobody published —
            which is the fabrication this whole book exists to prevent.

            Counted rather than claimed, so a drop that changes either side moves
            the sentence on its own.
          */}
          {bySecurity && (
            <p data-stock-coverage className="border-t border-dashed border-ink-700 px-2 py-2 text-[11px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-400">One row per company, ranked by total exposure.</span> A name
              is clubbed across every account that holds it — the family&rsquo;s own demat and a manager&rsquo;s mandate
              alike, because both report the share itself
              {clubbedCount > 0 && <>; {clubbedCount} of {rows.length} rows here are held through more than one account</>}.
              {" "}A FUND IS NOT A STOCK and is no longer a row: what it holds is looked through instead, where it
              publishes a disclosure.
              {exposure.status === "loading" && <> <span className="text-champagne-400/80">The fund look-through is
                still loading, so the figures below cover the directly-reported half only.</span></>}
              {exposure.status === "unreachable" && <> <span className="text-amber-400/80">The fund look-through store
                did not answer, so the figures below cover the directly-reported half only. That is a fact about the
                fetch, not about the book.</span></>}
              {exposure.status === "ok" && (
                <> {" "}
                  <span className="font-medium text-slate-400">This table covers {money(stockCoverage.total)} of
                  the {money(stockCoverage.nav)} book</span> — {money(stockCoverage.measured)} the statements report
                  directly, and {money(stockCoverage.derived)} DERIVED from what {stockCoverage.covered} of
                  your {stockCoverage.considered} fund holdings disclose. The rest of the book is not stocks this
                  table can see: {money(stockCoverage.opaque)} sits inside vehicles that publish no holdings at all
                  {stockCoverage.aifCount > 0 && <> ({stockCoverage.aifCount} AIF folio{stockCoverage.aifCount === 1 ? "" : "s"},
                    {" "}{money(stockCoverage.aifValue)} — an AIF files no portfolio disclosure that joins to a folio
                    this family holds, so no future statement fills it)</>}
                  , {money(stockCoverage.nonEquity)} is the part of a disclosed fund that is not equity — its cash and
                  debt sleeves, a gold or silver ETF&rsquo;s metal — and {money(stockCoverage.cash)} is the book&rsquo;s
                  own cash. Every figure in the Via funds and Total exposure columns is derived and is no part of the
                  book&rsquo;s NAV: the fund&rsquo;s own value already stands for it there.
                </>
              )}
              {stockCoverage.splitNames.count > 0 && (
                <> {" "}<span className="text-amber-400/80">{stockCoverage.splitNames.count === 1 ? "One company" : `${stockCoverage.splitNames.count} companies`} stands
                  here as {stockCoverage.splitNames.count === 1 ? "two rows" : "more than one row"} ({money(stockCoverage.splitNames.value)}): a manager&rsquo;s statement
                  and the depository print its name differently, and the book keys a holding on the name its statement
                  printed. Joining them on screen would hide that from the reconciler, so it is said here instead — the
                  fix belongs in the extractor.</span></>
              )}
            </p>
          )}
          {/* The tranche-coverage note ("N of M rows open their Invested figure…")
              was removed from the holdings table at the family's request, a
              declutter. The chevrons it summarised still render — an Invested cell
              with a dated history still opens its contribution breakdown — so
              nothing measurable was lost. `check:pages` asserts the note stays
              gone rather than deleting the check with the prose. */}
          {/* WHY THE WEIGHT COLUMN NO LONGER ADDS TO 100. Only while a company
              filter is on: the denominator is the book the other filters
              describe, so the picked rows are a part of it by design. */}
          {weightGap > 0 && (
            <p className="border-t border-dashed border-ink-700 px-2 py-2 text-[11px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-400">Weight is a share of the book, not of the holdings you
              picked.</span> The column divides by {money(weightBase)} across {weightCount} positions — the book the
              entity, sector and category filters describe — so a picked name keeps the weight it has on the
              unfiltered table. The rows on screen are {money(totMV)} of that, which is why the column adds to
              {" "}{weightBase > 0 ? ((totMV / weightBase) * 100).toFixed(1) : "0.0"}% and not to 100%.
            </p>
          )}
          {/*
            ONE CAPTION PER DELIBERATELY-PICKED MEASURE, so the reader is told
            WHICH return each note is about and how much of the table it can answer
            — counted rather than claimed. The DEFAULT (auto) methodology view
            carries no caption: the family asked for it removed, and the fact it
            stated survives per row, in each cell's own tag (HPR / CAGR / …). A
            concrete measure a reader ticks still explains itself, because a column
            of XIRR dashes or a part-year that could not annualise is a genuine
            absence the reader is owed a reason for. A drop that brings a purchase
            date or a within-year buy through the lot gate moves these lines on
            their own, and a column that quietly started guessing would move them
            the wrong way. Each note is tagged with the measure it describes, the
            same tag the column uses.
          */}
          {returnMeasures.map((measure) => {
            const def = returnMeasureDef(measure);
            const cov = returnCoverage(rows, measure, portfolio.asOf);
            const year = portfolio.asOf.slice(0, 4);
            let body: React.ReactNode = null;
            if (measure === "cagr") {
              body = <><span className="font-medium text-slate-400">Annualised where a year can be measured — {cov.cagr} of {cov.total} rows.</span>{" "}
                {cov.absolute > 0 && <>{cov.absolute} {cov.absolute === 1 ? "row is" : "rows are"} held under a year and show their total return on cost, marked <span className="text-amber-400/80">HPR</span>, because annualising a part-year would state a rate for a year the holding has not seen. </>}
                {cov.absent > 0 && <>{cov.absent} report no purchase date the window could close over — the managed accounts publish a capital-account ledger rather than a lot register, and the depository holdings report no cost.</>}</>;
            } else if (measure === "ytd") {
              body = <><span className="font-medium text-slate-400">YTD is the holding&rsquo;s own return this year, not the share&rsquo;s market move.</span>{" "}
                {cov.shown > 0
                  ? <>It is measurable on {cov.shown} of {cov.total} rows — the holdings opened during the year, whose whole return since purchase IS their year to date. </>
                  : <>No row can be measured on this drop. </>}
                The other {cov.absent} were already held on 1 January, and a year-to-date figure needs their value on that date: the earliest statement in this book is dated after the year began, so there is no opening value to measure from. One holdings statement per account dated on or before 1 January fills it.</>;
            } else if (measure === "xirr") {
              body = <><span className="font-medium text-slate-400">A money-weighted XIRR needs every cash flow for a holding</span> — each tranche&rsquo;s date and amount — and the statements here cover the current period only, so it is absent on all {cov.total} rows. The per-account money-weighted return is on <span className="font-medium text-slate-400">Performance</span>.</>;
            } else if (measure === "calendar") {
              body = <>A <span className="font-medium text-slate-400">calendar-year</span> return needs the holding&rsquo;s value at the start and end of that year, and the book&rsquo;s earliest statement is dated in {year}, after the current year began — so it is absent on all {cov.total} rows.</>;
            } else if (measure === "absolute" && cov.absent > 0) {
              body = <><span className="font-medium text-slate-400">Holding Period Return is the total return on cost since purchase, not annualised.</span> It is shown on {cov.shown} of {cov.total} rows; the other {cov.absent} report no cost, so there is nothing to strike a return against.</>;
            }
            if (!body) return null;
            return (
              <p key={measure} className="border-t border-dashed border-ink-700 px-2 py-1.5 text-[11px] leading-relaxed text-slate-500">
                <span className="ret-tag mr-1">{def.tag}</span>{body}
              </p>
            );
          })}
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
        <TransactionsView selected={selected} sector={sector} entity={entity} sectorByKey={sectorByKey} />
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
      redeemed: xs.every((x) => isRedeemedToNil(x)),
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

function Th({ children, right, onClick }: { children: React.ReactNode; right?: boolean; onClick?: () => void }) {
  return (
    <th className={`label-xs px-2 py-1.5 font-medium ${right ? "text-right" : "text-left"}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-champagne-400 ${right ? "flex-row-reverse" : ""}`}>
        {children}<ArrowUpDown className="h-3 w-3 opacity-50" />
      </button>
    </th>
  );
}

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

const TXN_CAP = 500; // rows rendered at once; filters narrow beyond this
/**
 * MY INVESTMENTS — the capital the FAMILY committed, mandate by mandate.
 *
 * *"these are five six transactions I executed… how have I executed lumpsum or
 * through a staggered investment… I want to see it like that."* And: *"in
 * transactions we need to see the transactions we have done, not what the
 * transactions the portfolio manager has done."*
 *
 * This reads `BOOK_CAPITAL_MOVES` and touches no `Txn`. The two sources answer
 * different questions and must not be mixed on one table: a manager's trade
 * moves money INSIDE an account, and a contribution moves money INTO it.
 * Summing them would count the same rupee twice under one heading.
 *
 * ── LUMPSUM OR STAGGERED IS A COUNT, NOT A DETECTOR ─────────────────────────
 *
 * One dated contribution is a lumpsum; more than one is not. No cadence, no
 * tolerance, no minimum — the same reason `txnRollup`'s own `staggered` label
 * is a label on an already-collapsed row rather than a decision about what to
 * merge, and simpler here because the family asked the question in exactly
 * those terms.
 */
function MyInvestments({ from, to, entity }: { from: string; to: string; entity: string }) {
  const { fmtFromBase, statementPortfolio: portfolio } = usePortfolio();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) =>
    setOpen((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const money = (v: number) => fmtFromBase(v, { compact: true });

  const accounts = portfolio?.accounts ?? [];
  const positions = portfolio?.positions ?? [];
  const accIdx = useMemo(() => accountIndex(accounts), [accounts]);

  // The page's own date and entity filters apply here too — a reader who has
  // narrowed to one member must not be shown another's capital.
  const moves = useMemo(() => BOOK_CAPITAL_MOVES.filter((m) => {
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    if (entity !== "All") {
      const a = accIdx.get(m.accountId);
      if (!a || ownerDisplayName(a.ownerId) !== entity) return false;
    }
    return true;
  }), [from, to, entity, accIdx]);

  const groups = useMemo(
    () => capitalRollup(moves, accounts, positions, BOOK_POSITION_TRANCHES),
    [moves, accounts, positions],
  );
  const totals = useMemo(() => capitalTotals(groups), [groups]);

  if (!groups.length) {
    return (
      <Card className="flex min-h-0 flex-1 items-center justify-center">
        <AbsentSection what="No dated contribution matches these filters"
          needs="This view reads the movements the statements themselves type as a contribution or a withdrawal — the capital the family put into each mandate and fund. Widen the dates or clear the entity filter; and note that 41 of this book's 51 accounts publish no dated capital record at all, so their subscription happened and no statement in this drop says when." />
      </Card>
    );
  }

  return (
    <Card pad={false} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full text-sm" data-mine-table>
          <thead className="sticky top-0 z-10 bg-ink-800">
            <tr className="border-b border-ink-700">
              <th className="label-xs px-3 py-2.5 text-left font-medium">Mandate / fund</th>
              <th className="label-xs px-3 py-2.5 text-right font-medium">How</th>
              <th className="label-xs px-3 py-2.5 text-right font-medium">Paid in</th>
              <th className="label-xs px-3 py-2.5 text-right font-medium">Taken out</th>
              <th className="label-xs px-3 py-2.5 text-right font-medium">Net invested</th>
              {/* WHAT A COLUMN MEANS BELONGS ON THE COLUMN. Both of these were
                  sentences in the footer the family asked to have removed, and
                  neither is chrome: one names the BASIS of a figure and the
                  other names the CONDITION under which it is published. */}
              <th className="label-xs px-3 py-2.5 text-right font-medium"
                title="The account's own market value from the book — the same figure the holdings tables carry for it, not a value re-derived from what was paid in.">Value today</th>
              <th className="label-xs px-3 py-2.5 text-right font-medium"
                title="Value today less net invested, struck only where the contribution list provably reaches the account's inception.">Gain</th>
              <th className="label-xs px-3 py-2.5 text-right font-medium"
                title="Struck only where the contribution list provably reaches the account's inception — either the allotted units account for every unit held, or the statement's own printed inception date is on or after the first contribution. A return against a partial record of what was paid in overstates itself by everything it missed, so a row that cannot establish it renders a dash naming the reason.">Return</th>
              <th className="label-xs px-3 py-2.5 text-left font-medium">Entity</th>
              <th className="label-xs px-3 py-2.5 text-left font-medium">Period</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700/70">
            {groups.map((g) => {
              const isOpen = open.has(g.accountId);
              return (
                <Fragment key={g.accountId}>
                  <tr data-mine-row={g.accountId} data-mine-contributions={g.contributions}
                    className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(g.accountId)}>
                    <td className="px-3 py-2">
                      {/*
                        ONE AFFORDANCE, AND THE ROW IS IT.

                        *"remove the drill down pages for transactions page in
                        portfolio monitor, we just need to show in drop down
                        details regarding staggered/lumpsum investments that is
                        already there, so just remove the full drill down pages
                        since they're empty."*

                        The name used to link to `/mandate/:accountId`, and
                        MEASURED, SEVEN OF THESE TEN ROWS ARE FUND FOLIOS — the
                        five Sanshi accounts and both Transition Venture trusts —
                        for which that page can only say it is not a mandate and
                        draw an empty dealing card beneath. A link a reader is
                        invited to follow into nothing is worse than no link.

                        The three PMS rows keep their page; it is simply not
                        reached from HERE. Holdings, Family &amp; Entities, a
                        company page and every holdings drill-down all link a
                        mandate, and each of those guards on the account really
                        being one — so nothing that has something to show became
                        unreachable, and nothing that had nothing is offered.
                      */}
                      <div className="flex items-center gap-1.5">
                        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        <span data-mine-name={g.accountId}
                          title={`${g.provider} · account ${g.accountNo}`}
                          className="font-medium text-slate-100">
                          {g.label}
                        </span>
                      </div>
                    </td>
                    {/* THE ASK, ANSWERED IN ONE CELL. A count of dated
                        contributions is the whole of "lumpsum or staggered". */}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className="pill" data-mine-how={g.staggered ? "staggered" : "lumpsum"}>
                        {g.staggered ? `staggered · ${g.contributions} payments` : "lumpsum"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right mono text-slate-200 whitespace-nowrap">{money(g.paidIn)}</td>
                    <td className="px-3 py-2 text-right mono text-slate-400 whitespace-nowrap">
                      {g.withdrawals === 0
                        ? <span className="text-slate-600">—</span>
                        : money(g.tookOut)}
                    </td>
                    <td className="px-3 py-2 text-right mono text-slate-200 whitespace-nowrap">{money(g.net)}</td>
                    <td className="px-3 py-2 text-right mono text-slate-100 whitespace-nowrap">{money(g.value)}</td>
                    <td className={`px-3 py-2 text-right mono whitespace-nowrap ${g.gain === null ? "" : changeColor(g.gain)}`}>
                      {g.gain === null
                        ? <AbsentCell reason={g.incompleteReason ?? "no return can be struck against this account's reported capital"} />
                        : money(g.gain)}
                    </td>
                    <td className={`px-3 py-2 text-right mono whitespace-nowrap ${g.returnPct === null ? "" : changeColor(g.returnPct)}`}>
                      {g.returnPct === null
                        ? <AbsentCell reason={g.incompleteReason ?? "no return can be struck against this account's reported capital"} />
                        : <><span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">HPR</span>{fmtPct(g.returnPct)}</>}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-slate-400 whitespace-nowrap">{ownerDisplayName(accIdx.get(g.accountId)?.ownerId ?? null) || g.owner}</td>
                    <td className="px-3 py-2 text-[12px] mono text-slate-500 whitespace-nowrap">
                      {g.first === g.last ? fmtDate(g.first) : `${fmtDate(g.first)} → ${fmtDate(g.last)}`}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-ink-900/50" data-mine-panel={g.accountId}>
                      <td colSpan={10} className="px-3 pb-3 pt-1">
                        <p className="mb-1.5 text-[11px] leading-relaxed text-slate-500">
                          Every dated movement {g.provider} reports on account {g.accountNo}, as its statement types
                          them. The shares the manager bought and sold inside it are a different record and are not
                          here — see <span className="font-medium text-slate-400">By manager</span>.
                        </p>
                        <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800">
                          <table className="min-w-full text-[12px]">
                            <thead>
                              <tr className="border-b border-ink-700/70">
                                <th className="label-xs px-3 py-1.5 text-left font-medium">Date</th>
                                <th className="label-xs px-3 py-1.5 text-left font-medium">As</th>
                                <th className="label-xs px-3 py-1.5 text-right font-medium">In</th>
                                <th className="label-xs px-3 py-1.5 text-right font-medium">Out</th>
                                <th className="label-xs px-3 py-1.5 text-right font-medium">Units</th>
                                <th className="label-xs px-3 py-1.5 text-left font-medium">Into</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-700/50">
                              {g.moves.map((m, i) => (
                                <tr key={`${m.date}-${i}`} data-mine-move={g.accountId}>
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
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {/* SUMMED FROM THE ROWS, never computed beside them. */}
          <tfoot className="sticky bottom-0 border-t border-ink-700 bg-ink-800">
            <tr data-mine-total>
              {/* "10 of 51", NOT "10". A caption is chrome; a COUNT inside it is
                  not — and this one was the whole of what the deleted footer had
                  that the page did not say elsewhere. Read as "Total · 10
                  accounts", ₹193 Cr is the whole of what this family has put in.
                  It is not: 41 of the 51 accounts were funded too and no
                  statement in this drop says when. */}
              <td className="px-3 py-2 font-medium text-slate-200"
                title={`${totals.accounts} of this book's ${accounts.length} accounts publish a dated capital record. The other ${accounts.length - totals.accounts} were funded as well — the managed mandates issue a capital-account ledger rather than dated allotments, and a depository records what is held and never what was paid for it — so this total is not the whole of what the family has committed.`}>
                Total · {totals.accounts} of {accounts.length} accounts
              </td>
              <td className="px-3 py-2 text-right text-[12px] text-slate-400 whitespace-nowrap">{totals.contributions} payments</td>
              <td className="px-3 py-2 text-right mono font-medium text-slate-100 whitespace-nowrap">{money(totals.paidIn)}</td>
              <td className="px-3 py-2 text-right mono font-medium text-slate-400 whitespace-nowrap">{money(totals.tookOut)}</td>
              <td className="px-3 py-2 text-right mono font-medium text-slate-100 whitespace-nowrap">{money(totals.net)}</td>
              <td className="px-3 py-2 text-right mono font-medium text-slate-100 whitespace-nowrap">{money(totals.value)}</td>
              <td className="px-3 py-2" colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function TransactionsView({ selected, sector, entity, sectorByKey }: {
  selected: Set<string>; sector: string; entity: string; sectorByKey: Map<string, string>;
}) {
  // `statementPortfolio`, for the ACCOUNT REGISTRY only — the rollup joins a
  // trade to its mandate on provider + account number. No figure on this tape
  // comes from the portfolio, and none may: a dated trade is a statement fact
  // and a live price is not evidence about it.
  const { fmtFromBase, statementPortfolio: portfolio } = usePortfolio();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [meta, setMeta] = useState({ buys: 0, sells: 0 });
  const [side, setSide] = useState<"all" | "Buy" | "Sell">("all");
  /**
   * WHAT THE FAMILY DID IS THE DEFAULT — not what their managers did.
   *
   * *"in transactions we need to see the transactions we have done, not what
   * the transactions the portfolio manager has done… and then if we click and
   * open the drill down page of one AIF/PMS then inside that we should see what
   * all transactions the portfolio manager of that fund has made."*
   *
   * This card opened on the manager rollup, which answered the EARLIER ask
   * ("I will only see five items … then I can drill down") with the wrong five
   * items: Carnelian buying Bandhan Bank is Carnelian's decision. The family's
   * own decision is the capital they put into Carnelian. `mine` is that, and
   * the manager's trades keep their tab AND now sit inside the mandate
   * drill-down, which is where the ask puts them.
   */
  const [groupBy, setGroupBy] = useState<TxnView>("mine");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
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
      setTxns(d.txns); setMeta({ buys: d.buys, sells: d.sells }); setStatus("ready");
    });
    return () => { alive = false; };
  }, []);

  // Fiscal years spanned by the tape, newest first — drives the quarter/FY presets.
  const fyYears = useMemo(() => {
    if (!txns || !txns.length) return [] as number[];
    let mn = Infinity, mx = -Infinity;
    for (const t of txns) { if (!t.date) continue; const y = fyStartOf(t.date); if (y < mn) mn = y; if (y > mx) mx = y; }
    if (!isFinite(mn)) return [];
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

  const filtered = useMemo(() => {
    if (!txns) return [];
    return txns.filter((t) =>
      (side === "all" || t.side === side) &&
      // Matched on the CANONICAL owner, not on the account label: the label
      // prints the owner's name as that statement spelled it ("Ajay Thakurdas
      // Jaisinghani"), and the filter offers the canonical one ("Ajay
      // Jaisinghani"). Comparing the two strings never matches, which would
      // empty the tape the moment anyone filtered by entity.
      (entity === "All" || ownerDisplayName(t.ownerId) === entity) &&
      (sector === "All" || sectorByKey.get(t.securityKey) === sector) &&
      (selected.size === 0 || selected.has(t.security)) &&
      (!from || t.date >= from) &&
      (!to || t.date <= to));
  }, [txns, side, entity, sector, sectorByKey, selected, from, to]);
  /**
   * ABOVE THE EARLY RETURNS, AND THAT IS NOT STYLE. These sat below the
   * `status === "loading"` guard at first, so the first render ran fewer hooks
   * than the second and React tore the page down with error #310 — a blank
   * "Something went wrong" over a tape that had loaded perfectly. A hook after
   * a conditional return is a hook that sometimes does not run.
   *
   * No registry, no mandate names — the rollup still groups, each account
   * falling back to the provider and number its own statement prints.
   */
  const accountsReg = portfolio?.accounts ?? [];
  /**
   * DIRECT EQUITY IS A SET, NOT A GROUPING — and it is the app's OWN set.
   *
   * `holdingRoute` is the axis Stage 10L settled after the family reported the
   * same complaint three times: a share a discretionary manager picked and a
   * share the family bought itself are the same ASSET and a different DECISION.
   * "Direct Equity" means the second, everywhere else in this app, so this tab
   * filters the tape to the accounts the family runs itself (`Direct` /
   * `Execution`) and then rolls those up per security. Re-using the word for
   * "grouped by security" would be a fourth round of the same argument.
   *
   * Rows the statement classes as something other than equity are excluded, so
   * the tab's name stays true if an own-account fund purchase ever lands on the
   * tape. Today every own-account row is classed `Equity` by its own statement,
   * including the liquid ETF sweep — which is the statement's classification and
   * is not second-guessed here.
   */
  const ownAccounts = useMemo(() => new Set(
    accountsReg.filter((a) => holdingRoute(a.engagement) === "own").map((a) => acctKey(a.provider, a.accountNo)),
  ), [accountsReg]);
  const scoped = useMemo(() => (groupBy !== "direct" ? filtered : filtered.filter((t) =>
    ownAccounts.has(acctKey(t.provider, t.accountNo)) && (t.assetClass == null || t.assetClass === "Equity"))),
    [filtered, groupBy, ownAccounts]);
  // `mine` reads a different source and never reaches this rollup; it maps to
  // `manager` here only so the memo has a valid grouping to compute against
  // while that view is showing, exactly as `tape` already does.
  const groups = useMemo(() => rollup(scoped, accountsReg,
    groupBy === "tape" || groupBy === "mine" ? "manager" : groupBy === "direct" ? "instrument" : groupBy),
    [scoped, accountsReg, groupBy]);
  const totals = useMemo(() => rollupTotals(groups), [groups]);
  const shown = filtered.slice(0, TXN_CAP);

  if (status === "loading") return <Card className="flex min-h-0 flex-1 items-center justify-center"><span className="text-sm text-slate-500">Loading transactions…</span></Card>;
  if (status === "error") {
    return (
      <Card className="flex min-h-0 flex-1 items-center justify-center">
        <AbsentSection what="The audit archive didn't respond"
          needs="This tape reads the extracted transaction statements from /audit. That request didn't come back — refresh to retry. The archive is served alongside the app, so this is the archive being unreachable rather than your session being stale." />
      </Card>
    );
  }
  if (!txns?.length) {
    return (
      <Card className="flex min-h-0 flex-1 items-center justify-center">
        <AbsentSection what="No dated transactions in this book"
          needs="Transactions come from each manager's transaction statement. No account in this drop issued one, so there is no tape to show — which is not the same as a period with no trading." />
      </Card>
    );
  }

  /**
   * NET INVESTED, AND THE ONE DISTINCTION THAT MAKES IT HONEST.
   *
   * A side with NO ROWS contributed a measured zero — nothing was sold, so the
   * net is what was bought. A side WITH rows whose statements report no
   * settlement contributed nothing measurable, and subtracting it as zero would
   * report a net the book cannot strike. The two look identical if you write
   * `(bought ?? 0) - (sold ?? 0)`.
   */
  const netOf = (g: { buys: number; sells: number; bought: number | null; sold: number | null }) => {
    const b = g.buys === 0 ? 0 : g.bought;
    const s = g.sells === 0 ? 0 : g.sold;
    return b == null || s == null ? null : b - s;
  };
  const period = (a: string, b: string) => (a && b ? (a === b ? fmtDate(a) : `${fmtDate(a)} → ${fmtDate(b)}`) : "");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} max={to || undefined} onChange={(e) => onDate("from", e.target.value)} title="From date"
            className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-slate-200 ring-focus" />
          <span className="text-slate-500">→</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => onDate("to", e.target.value)} title="To date"
            className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-slate-200 ring-focus" />
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
        <div className="inline-flex rounded-md border border-ink-700 bg-ink-800 p-0.5 text-sm">
          {(["all", "Buy", "Sell"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setSide(v)}
              className={`rounded px-3 py-1.5 font-medium transition-colors ${side === v ? "bg-ink-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {v === "all" ? "All" : v === "Buy" ? "Buys" : "Sells"}
            </button>
          ))}
        </div>
        {/* THE DEFAULT IS THE ROLLUP, AND THE TAPE IS ONE CLICK AWAY. Four
            hundred dated rows answer "what happened on Tuesday"; the family
            asked what each manager did this year. Tape is kept because a
            reconciliation against a PDF needs the printed rows in printed
            order, which no rollup can stand in for. */}
        <div className="inline-flex rounded-md border border-ink-700 bg-ink-800 p-0.5 text-sm" title="My investments is the capital the FAMILY committed, mandate by mandate and fund by fund. The rest read the managers' own trading: one line per manager or per family member; Direct Equity narrows it to the shares the family bought and sold in its own broking account; Tape is the raw dated rows.">
          {([["mine", "My investments"], ["direct", "Direct Equity"], ["manager", "By manager"], ["entity", "By entity"], ["tape", "Tape"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setGroupBy(v)}
              className={`rounded px-3 py-1.5 font-medium transition-colors ${groupBy === v ? "bg-ink-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-500">{filtered.filter((t) => t.side === "Buy").length.toLocaleString("en-IN")} buys · {filtered.filter((t) => t.side === "Sell").length.toLocaleString("en-IN")} sells</span>
      </div>

      {groupBy === "mine" ? (
        <MyInvestments from={from} to={to} entity={entity} />
      ) : groupBy !== "tape" ? (
        <Card pad={false} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-ink-800">
                <tr className="border-b border-ink-700">
                  <th className="label-xs px-3 py-2.5 text-left font-medium">{groupBy === "manager" ? "Manager / account" : groupBy === "entity" ? "Family member" : "Security"}</th>
                  <th className="label-xs px-3 py-2.5 text-right font-medium">Trades</th>
                  <th className="label-xs px-3 py-2.5 text-right font-medium">{groupBy === "direct" ? "Sides" : "Securities"}</th>
                  <th className="label-xs px-3 py-2.5 text-right font-medium">Bought</th>
                  <th className="label-xs px-3 py-2.5 text-right font-medium">Sold</th>
                  <th className="label-xs px-3 py-2.5 text-right font-medium">Net invested</th>
                  <th className="label-xs px-3 py-2.5 text-right font-medium">Realized P&L</th>
                  <th className="label-xs px-3 py-2.5 text-left font-medium">Period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {groups.map((g) => {
                  const open = openGroups.has(g.key);
                  const net = netOf(g);
                  return (
                    <Fragment key={g.key}>
                      {/* `data-row` is a HANDLE FOR THE CHECK, not styling. The
                          sweep has to expand a group and then a staggered
                          security inside it, and picking those out of rendered
                          prose means matching a caption — which renders whatever
                          the data does and cannot fail. */}
                      <tr data-row="group" data-trades={g.trades} className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(setOpenGroups, g.key)}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} />
                            <div>
                              <div className="font-medium text-slate-100">{g.label}</div>
                              {g.sublabel && <div className="text-[10.5px] text-slate-500">{g.sublabel}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right mono text-slate-300">{fmtNum(g.trades)}<span className="ml-1 text-[10.5px] text-slate-500">{g.buys}B/{g.sells}S</span></td>
                        <td className="px-3 py-2.5 text-right mono text-slate-400">{fmtNum(groupBy === "direct" ? g.instruments.length : g.securities)}</td>
                        <td className="px-3 py-2.5 text-right mono text-slate-300">{g.bought == null ? <AbsentCell reason="no buy row in this group reports a settled amount on its statement" /> : fmtFromBase(g.bought, { compact: true })}</td>
                        <td className="px-3 py-2.5 text-right mono text-slate-300">{g.sells === 0 ? <AbsentCell reason="nothing was sold in this group over the window" /> : g.sold == null ? <AbsentCell reason="no sell row in this group reports a settled amount on its statement" /> : fmtFromBase(g.sold, { compact: true })}</td>
                        <td className="px-3 py-2.5 text-right mono text-slate-200">{net == null ? <AbsentCell reason="one side of this group reports no settled amount, so a net cannot be struck" /> : fmtFromBase(net, { compact: true, sign: true })}</td>
                        <td className={`px-3 py-2.5 text-right mono ${g.realized == null ? "text-slate-600" : changeColor(g.realized)}`}>
                          {g.realized == null
                            ? <AbsentCell reason={g.sells === 0 ? "nothing was sold in this group over the window" : "no capital gain statement covers this account, so what these sales realised was never reported"} />
                            : <>{fmtFromBase(g.realized, { compact: true, sign: true })}{g.realizedOf < g.sells && <span className="ml-1 text-[10.5px] text-slate-500">{g.realizedOf}/{g.sells}</span>}</>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap mono text-[11px] text-slate-400">{period(g.first, g.last)}</td>
                      </tr>

                      {open && g.instruments.map((ins) => {
                        const iKey = `${g.key}::${ins.key}`;
                        const iOpen = openRows.has(iKey);
                        const iNet = netOf(ins);
                        return (
                          <Fragment key={iKey}>
                            <tr data-row="instrument" data-staggered={ins.staggered ? "1" : undefined} data-days={ins.days} className="cursor-pointer bg-ink-800/40 hover:bg-ink-700/40" onClick={() => toggle(setOpenRows, iKey)}>
                              <td className="py-2 pl-9 pr-3">
                                <div className="flex items-center gap-1.5">
                                  <ChevronRight className={`h-3 w-3 shrink-0 text-slate-600 transition-transform ${iOpen ? "rotate-90" : ""}`} />
                                  <div>
                                    <span className="text-slate-200">{ins.security}</span>
                                  {/* A LABEL ON A ROW THAT IS ALREADY COLLAPSED, never a
                                      decision about what to merge — see txnRollup.ts. */}
                                    {ins.staggered && <span className="ml-1.5"><Pill tone="info"><span title={`Built up over ${ins.days} trading days rather than in one go — expand for every tranche and its date.`}>staggered · {ins.days} days</span></Pill></span>}
                                    {/* NET UNITS BELONG UNDER THE NAME, NOT IN THE
                                        "Securities" COLUMN. That column counts
                                        securities on a group row, and a unit count
                                        printed under it is a figure standing beneath a
                                        heading that describes something else — the same
                                        failure as a caption that narrows a figure it
                                        does not narrow. */}
                                    <div className="mono text-[10.5px] text-slate-500">{fmtNum(Math.round(ins.qtyBought - ins.qtySold))} units net</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right mono text-slate-400">{fmtNum(ins.buys + ins.sells)}<span className="ml-1 text-[10.5px] text-slate-500">{ins.buys}B/{ins.sells}S</span></td>
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2 text-right mono text-slate-400">{ins.bought == null ? <AbsentCell reason="no buy row for this security reports a settled amount" /> : fmtFromBase(ins.bought, { compact: true })}</td>
                              <td className="px-3 py-2 text-right mono text-slate-400">{ins.sells === 0 ? <AbsentCell reason="this security was not sold over the window" /> : ins.sold == null ? <AbsentCell reason="no sell row for this security reports a settled amount" /> : fmtFromBase(ins.sold, { compact: true })}</td>
                              <td className="px-3 py-2 text-right mono text-slate-300">{iNet == null ? <AbsentCell reason="one side reports no settled amount, so a net cannot be struck" /> : fmtFromBase(iNet, { compact: true, sign: true })}</td>
                              <td className={`px-3 py-2 text-right mono ${ins.realized == null ? "text-slate-600" : changeColor(ins.realized)}`}>
                                {ins.realized == null
                                  ? <AbsentCell reason={ins.sells === 0 ? "this security was not sold over the window" : "no capital gain statement covers this account, so what these sales realised was never reported"} />
                                  : fmtFromBase(ins.realized, { compact: true, sign: true })}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap mono text-[11px] text-slate-500">{period(ins.first, ins.last)}</td>
                            </tr>

                            {iOpen && ins.tranches.map((t, i) => (
                              /* EVERY FIGURE UNDER A HEADING THAT DESCRIBES IT. A
                                 tranche's settled amount goes in Bought or Sold
                                 by its own SIDE, so the column it lands in is
                                 true of it; quantity and unit price ride with
                                 the date, because no header on this table means
                                 either. Drawn across the columns by position
                                 instead, a buy's per-share price printed under
                                 "Bought" and its amount under "Sold". */
                              <tr data-row="tranche" key={`${iKey}::${i}`} className="bg-ink-900/50 text-[12px]">
                                <td className="py-1.5 pl-16 pr-3 whitespace-nowrap">
                                  <span className="mono text-slate-400">{fmtDate(t.date)}</span>
                                  <span className="ml-2"><Pill tone={t.side === "Buy" ? "info" : "warn"}>{t.side}</Pill></span>
                                  <span className="ml-2 mono text-slate-500">
                                    {fmtNum(Math.round(t.qty))} @ {t.price == null ? <AbsentCell reason="this trade row reports no unit price on its statement" /> : fmtFromBase(t.price)}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5" />
                                <td className="px-3 py-1.5" />
                                <td className="px-3 py-1.5 text-right mono text-slate-400">
                                  {t.side !== "Buy" ? "" : t.amount == null ? <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" /> : fmtFromBase(t.amount, { compact: true })}
                                </td>
                                <td className="px-3 py-1.5 text-right mono text-slate-400">
                                  {t.side !== "Sell" ? "" : t.amount == null ? <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" /> : fmtFromBase(t.amount, { compact: true })}
                                </td>
                                <td className="px-3 py-1.5" />
                                <td className={`px-3 py-1.5 text-right mono ${t.realized == null ? "text-slate-600" : changeColor(t.realized)}`}>{t.realized == null ? <AbsentCell reason={t.realizedNote ?? "no capital gain statement covers this account, so what this sale realised was never reported"} /> : fmtFromBase(t.realized, { compact: true, sign: true })}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{t.account}</td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {groups.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">No transactions match your filters.</td></tr>}
              </tbody>
              {groups.length > 0 && (
                /* SUMMED FROM THE ROWS ABOVE, never recomputed off the tape —
                   see `rollupTotals`. A footer derived independently of its own
                   column can be right on its own terms while every row above it
                   is wrong, which is exactly what shipped on the Private Market
                   page once. */
                <tfoot className="sticky bottom-0 border-t-2 border-ink-600 bg-ink-800 font-semibold">
                  <tr>
                    <td className="px-3 py-2.5 text-slate-200">Total · {fmtNum(totals.groups)} {groupBy === "manager" ? "accounts" : groupBy === "entity" ? "members" : "securities"}</td>
                    <td className="px-3 py-2.5 text-right mono text-slate-200">{fmtNum(totals.trades)}</td>
                    <td className="px-3 py-2.5 text-right mono text-slate-400">{fmtNum(totals.securities)}</td>
                    <td className="px-3 py-2.5 text-right mono text-slate-200">{totals.bought == null ? <AbsentValue /> : fmtFromBase(totals.bought, { compact: true })}</td>
                    <td className="px-3 py-2.5 text-right mono text-slate-200">{totals.sold == null ? <AbsentValue /> : fmtFromBase(totals.sold, { compact: true })}</td>
                    <td className="px-3 py-2.5 text-right mono text-slate-100">{netOf({ buys: totals.buys, sells: totals.sells, bought: totals.bought, sold: totals.sold }) == null ? <AbsentValue /> : fmtFromBase(netOf({ buys: totals.buys, sells: totals.sells, bought: totals.bought, sold: totals.sold })!, { compact: true, sign: true })}</td>
                    <td className={`px-3 py-2.5 text-right mono ${totals.realized == null ? "text-slate-600" : changeColor(totals.realized)}`}>{totals.realized == null ? <AbsentValue /> : <>{fmtFromBase(totals.realized, { compact: true, sign: true })}{totals.realizedOf < totals.sells && <span className="ml-1 text-[10.5px] font-normal text-slate-500">{totals.realizedOf}/{totals.sells}</span>}</>}</td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/*
            THE EXPLANATORY FOOTER IS GONE, BY REQUEST — it repeated on every
            view and said nothing a reader of the table needed. What survives is
            ONE line, and only on Direct Equity, because that is the view where
            the absence IS the finding: this tab is narrow because the family's
            other own-account trading sits in demat statements whose movements
            carry no price, no counterparty and no consideration, and are
            therefore not trades (`precedence.mjs`). Without it the tab reads as
            "the family barely trades its own book", which is not what the
            corpus says.
          */}
          {groupBy === "direct" && (
            <div className="border-t border-ink-700/60 px-3 py-2 text-[11px] text-slate-500">
              The shares the family bought and sold in its own broking accounts. Manager-run trading is under By manager;
              demat movements carry no price or counterparty on their statements, so they are not trades and are not here.
            </div>
          )}
        </Card>
      ) : (
      <Card pad={false} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-ink-800">
              <tr className="border-b border-ink-700">
                <th className="label-xs px-3 py-1.5 text-left font-medium">Date</th>
                <th className="label-xs px-3 py-1.5 text-left font-medium">Security</th>
                <th className="label-xs px-3 py-1.5 text-left font-medium">Type</th>
                <th className="label-xs px-3 py-1.5 text-right font-medium">Qty</th>
                <th className="label-xs px-3 py-1.5 text-right font-medium">Price</th>
                <th className="label-xs px-3 py-1.5 text-right font-medium">Amount</th>
                <th className="label-xs px-3 py-1.5 text-right font-medium">Realized P&L</th>
                <th className="label-xs px-3 py-1.5 text-left font-medium">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {shown.map((t, i) => (
                <tr key={i} className="hover:bg-ink-700/40">
                  <td className="whitespace-nowrap px-3 py-1.5 mono text-slate-400">{fmtDate(t.date)}</td>
                  <td className="px-3 py-1.5 text-slate-100"><StockLink securityKey={t.securityKey} name={t.security} /></td>
                  <td className="px-3 py-1.5"><Pill tone={t.side === "Buy" ? "info" : "warn"}>{t.side}</Pill></td>
                  <td className="px-3 py-1.5 text-right mono text-slate-300">{fmtNum(Math.round(t.qty))}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-400">{t.price == null ? <AbsentCell reason="this trade row reports no unit price on its statement" /> : fmtFromBase(t.price)}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-200">{t.amount == null ? <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" /> : fmtFromBase(t.amount, { compact: true })}</td>
                  <td className={`px-3 py-1.5 text-right mono ${t.realized == null ? "text-slate-600" : changeColor(t.realized)}`}>{t.realized == null ? <AbsentCell reason={t.realizedNote ?? "no capital gain statement covers this account, so what this sale realised was never reported"} /> : fmtFromBase(t.realized, { compact: true, sign: true })}</td>
                  <td className="px-3 py-1.5 text-slate-400">{t.account}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">No transactions match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </>
  );
}
